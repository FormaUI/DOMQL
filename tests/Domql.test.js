import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DomqlQuery } from '#domql/dom/DomqlQuery.mjs';
import { domql } from '#domql/domql.js';
import { NexoError } from '@formaui-net/nexo';
import { ParsedTexts } from '#nexo/language/ParsedTexts.mjs';

/** The error a call throws. */
const getError = call => {
    try {
        call();
    } catch (error) {
        return error;
    }

    throw new Error('The call threw nothing');
};

/** A definition of the expression, recording the import of DOMQL's module, as every definition DOMQL reads from text does. */
const definitionOf = expression => ({ version: 38, imports: [{ module: 'Domql' }], expression });

const context = { kind: 'it' };
const member = (name, receiver = context) => ({ kind: 'memberAccess', receiver, name });
const call = (name, argument, receiver = context) => ({ kind: 'call', callee: member(name, receiver), arguments: argument === undefined ? [] : [argument] });
const infixCall = (name, argument, receiver = context) => (argument === undefined ? { kind: 'infixCall', receiver, name } : { kind: 'infixCall', receiver, name, argument });
// A named indexer indexes the member access its name is written in, which an optional receiver makes optional; an unnamed one indexes its receiver, optional where its brackets are.
const indexer = (name, argument, receiver = context, optional = false) => {
    if (name === undefined) {
        return optional ? { kind: 'indexerAccess', receiver, argument, optional } : { kind: 'indexerAccess', receiver, argument };
    }

    return { kind: 'indexerAccess', receiver: optional ? { kind: 'memberAccess', receiver, name, optional } : member(name, receiver), argument };
};

// An optional access or call, its optional access the call's callee; and the optional chain holding it.
const optional = node => (node.kind === 'call' ? { ...node, callee: { ...node.callee, optional: true } } : { ...node, optional: true });
const chain = node => ({ kind: 'optionalChain', chain: node });

const literal = value => ({ kind: 'literal', value });
const parameter = name => ({ kind: 'scriptParameter', name });
const domqlMember = name => member(name, { kind: 'namespace', name: 'Domql' });
const equality = (left, right) => ({ kind: 'equality', left, right });
const not = operand => ({ kind: 'not', operand });

/** A structured type, its data shape the properties given by name and type. */
const structuredType = (name, properties) => ({ name, kind: 'structured', members: Object.entries(properties).map(([property, result]) => ({ name: property, kind: 'property', result })) });

/** An extension of DOMQL's elements holding the members given, which a query reads with `:`. */
const elementExtension = (name, members) => ({ name, kind: 'extension', target: 'Domql.Element', members });

describe('domql', () => {
    describe('query from text', () => {
        it('reads the specification\'s example into its definition', () => {
            const query = domql.query('panel { size = it.size, hasFocus = it.focusWithin() }');

            expect(query.definition).toEqual({
                version: 38,
                imports: [{ module: 'Domql' }],
                expression: {
                    kind: 'object',
                    context: parameter('panel'),
                    objectFields: [
                        { name: 'size', value: member('size') },
                        { name: 'hasFocus', value: call('focusWithin') },
                    ],
                },
            });
        });

        it('reads a chain as a succession of receivers', () => {
            const { definition } = domql.query('panel.all("li").count');

            expect(definition.expression).toEqual(member('count', call('all', literal('li'), parameter('panel'))));
        });

        it('reads a property access, a call and a named indexer as nodes of their own, each holding its receiver', () => {
            expect(domql.query('panel.size').definition.expression).toEqual(member('size', parameter('panel')));
            expect(domql.query('panel.closest(".row")').definition.expression).toEqual(call('closest', literal('.row'), parameter('panel')));
            expect(domql.query('panel.parent.closest()').definition.expression).toEqual(call('closest', undefined, member('parent', parameter('panel'))));
            expect(domql.query('panel["id"]').definition.expression).toEqual(indexer(undefined, literal('id'), parameter('panel')));
            expect(domql.query('panel.style["color"]').definition.expression).toEqual(indexer('style', literal('color'), parameter('panel')));
            expect(domql.query('panel.matches(".row")').definition.expression).toEqual(call('matches', literal('.row'), parameter('panel')));
            expect(domql.query('sentinel.intersects()').definition.expression).toEqual(call('intersects', undefined, parameter('sentinel')));
        });

        it('reads it as the implicit parameter, written as a receiver like any other', () => {
            expect(domql.query('panel { width = it.size.width }').definition.expression.objectFields[0].value).toEqual(member('width', member('size', context)));
        });

        it('takes the arguments of a call, each a simple expression, which its parentheses delimit and commas separate', () => {
            expect(domql.query('rows.where(it.attached and it.visible())').definition.expression.arguments[0].kind).toBe('and');
            expect(domql.query('panel.closest(".a", ".b")').definition.expression.arguments).toEqual([literal('.a'), literal('.b')]);
        });

        it('takes an options object as a call\'s argument, and an argument that begins with a keyword in its parentheses', () => {
            expect(domql.query('sentinel.intersects({ root = panel, margin = 200, })').definition.expression.arguments).toEqual([{ kind: 'object', objectFields: [{ name: 'root', value: parameter('panel') }, { name: 'margin', value: literal(200) }] }]);
            expect(domql.query('x.matches(not flag)').definition.expression.arguments).toEqual([not(parameter('flag'))]);
            expect(domql.query('x.intersects() and y').definition.expression.kind).toBe('and');
        });

        it('takes a call across a line break', () => {
            expect(domql.query('target {\n    open = it\n    .matches(\n    ".open")\n}').definition).toEqual(domql.query('target { open = it.matches(".open") }').definition);
        });

        it('takes an object expression after a call', () => {
            const { definition } = domql.query('table.all("tr") { height = it.rect.height }');

            expect(definition.expression.kind).toBe('object');
            expect(definition.expression.context).toEqual(call('all', literal('tr'), parameter('table')));
        });

        it('reads every kind of literal', () => {
            const { definition } = domql.query('{ a = "say \\"hi\\" \\\\", b = -1.5e2, c = 0, d = true, e = false, f = null }');

            expect(definition.expression.objectFields.map(field => field.value.value)).toEqual(['say "hi" \\', -150, 0, true, false, null]);
        });

        it('skips line and block comments, which separate as whitespace does', () => {
            const { definition } = domql.query('// A panel.\npanel { /* its\nfirst item */ open = it.first(".item") /* inline */.matches(/**/".open") // whether it is open\n}');

            expect(definition.expression.objectFields[0].value).toEqual(call('matches', literal('.open'), call('first', literal('.item'))));
        });

        it('keeps comment markers inside a string as text', () => {
            const { definition } = domql.query('target["https://example.com/* not a comment */"]');

            expect(definition.expression.argument).toEqual(literal('https://example.com/* not a comment */'));
        });

        it('closes a block comment at its first */, so comments do not nest', () => {
            expect(getError(() => domql.query('panel { /* outer /* inner */ still a comment */ size: it.size }'))).toMatchObject({ kind: 'syntax', code: 'NEXO1051' });
        });

        it('reads an object expression following no value as one keeping the implicit parameter', () => {
            const { definition } = domql.query('panel { layout = { width = it.size.width } }');

            expect(definition.expression.objectFields[0]).toEqual({
                name: 'layout',
                value: { kind: 'object', objectFields: [{ name: 'width', value: member('width', member('size')) }] },
            });
        });

        it('keeps the name written for each field', () => {
            const { definition } = domql.query('target { bounds = it.["rect"], clientSize = it.clientSize }');

            expect(definition.expression.objectFields).toEqual([
                { name: 'bounds', value: member('rect') },
                { name: 'clientSize', value: member('clientSize') },
            ]);
        });

        it('reads a camelCase name as one name and the literal an indexer takes as its key', () => {
            const { definition } = domql.query('target { tier = it.style["--layout-tier"], dark = it.rectRelativeTo(panel) }');

            expect(definition.expression.objectFields).toEqual([
                { name: 'tier', value: indexer('style', literal('--layout-tier')) },
                { name: 'dark', value: call('rectRelativeTo', parameter('panel')) },
            ]);
        });

        it('freezes the definition', () => {
            const { definition } = domql.query('panel { size = it.size }');

            expect(Object.isFrozen(definition)).toBe(true);
            expect(Object.isFrozen(definition.expression.objectFields[0].value.receiver)).toBe(true);
        });

        it('shares one definition between parses of the same text', () => {
            const first = domql.query('panel { size = it.size, clientSize = it.clientSize }', { panel: 1 });
            const second = domql.query('panel { size = it.size, clientSize = it.clientSize }', { panel: 2 });

            expect(second.definition).toBe(first.definition);
            expect(DomqlQuery.bindingsOf(second).readValue('panel')).toBe(2);
        });

        it('reads a source that is no text as a definition, refusing one that is none', () => {
            for (const source of [42, null, { definition: {} }]) {
                const error = getError(() => domql.query(source));

                expect(error.kind).toBe('structure');
                expect(error.code).toBe('NEXO2000');
                expect(error.location).toEqual({ pointer: '' });
            }
        });
    });

    describe('tests', () => {
        it('read a test as the Boolean member it is, a property read as any is and a Boolean function called as any function is', () => {
            expect(domql.query('Domql.document.visible()').definition.expression).toEqual(call('visible', undefined, domqlMember('document')));
            expect(domql.query('input.hasSelection').definition.expression).toEqual(member('hasSelection', parameter('input')));
            expect(domql.query('panel.all("input").where(it.disabled())').definition.expression.arguments).toEqual([call('disabled')]);
        });

        it('read a name the language once took as a verb as an ordinary name, called as any member is and naming a field', () => {
            expect(domql.query('panel.has(Domql.focus)').definition.expression).toEqual(call('has', domqlMember('focus'), parameter('panel')));
            expect(domql.query('{ has = panel.hasChildren }').definition.expression.objectFields[0].name).toBe('has');
        });
    });

    describe('equalities', () => {
        it('read is between two equality operands, and is not as the negation of is', () => {
            expect(domql.query('panel.parent == null').definition.expression).toEqual(equality(member('parent', parameter('panel')), literal(null)));
            expect(domql.query('action == "save"').definition.expression).toEqual(equality(parameter('action'), literal('save')));
            expect(domql.query('a != b').definition.expression).toEqual(not(equality(parameter('a'), parameter('b'))));
            expect(domql.query('left["name"] == right["name"]').definition.expression).toEqual(equality(indexer(undefined, literal('name'), parameter('left')), indexer(undefined, literal('name'), parameter('right'))));
            expect(domql.query('node as Element == panel').definition.expression).toEqual(equality({ kind: 'cast', type: 'Element', operand: parameter('node') }, parameter('panel')));
        });

        it('give is not, not around is, and not before is one definition', () => {
            const negated = domql.query('a != b').definition;

            expect(domql.query('not (a == b)').definition).toEqual(negated);
            expect(domql.query('not a == b').definition).toEqual(negated);
        });

        it('bind more loosely than a conversion and more tightly than and, taking a group as either operand', () => {
            expect(domql.query('a == b and c').definition.expression).toEqual({ kind: 'and', operands: [equality(parameter('a'), parameter('b')), parameter('c')] });
            expect(domql.query('(a == b) == true').definition.expression).toEqual(equality(equality(parameter('a'), parameter('b')), literal(true)));
            expect(domql.query('(count ?? 0) == 0').definition.expression).toEqual(equality({ kind: 'coalescing', value: parameter('count'), fallback: literal(0) }, literal(0)));
        });

        it.each([
            ['an equality without its right operand', { kind: 'equality', left: parameter('panel') }, '/expression', 'NEXO2000'],
            ['an equality whose left operand is no node', equality(1, parameter('panel')), '/expression/left', 'NEXO2000'],
            ['an equality of the implicit parameter at the top level', equality(context, literal(null)), '/expression/left', 'NEXO2026'],
            ['a predicate, which a call of a Boolean function replaces', { kind: 'predicate', verb: 'is', target: parameter('panel'), name: literal(null) }, '/expression', 'NEXO2000'],
        ])('refuse a definition with %s', (_, query, pointer, code) => {
            const error = getError(() => domql.query(definitionOf(query), { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('logical expressions and groups', () => {
        it('combine whole expressions, and binding tighter than or', () => {
            const { expression: query } = domql.query('panel.attached or input.disabled() and enabled').definition;

            expect(query).toEqual({
                kind: 'or',
                operands: [
                    member('attached', parameter('panel')),
                    { kind: 'and', operands: [call('disabled', undefined, parameter('input')), parameter('enabled')] },
                ],
            });
        });

        it('gather a run of one operator into one expression', () => {
            expect(domql.query('first or second or third').definition.expression.operands).toEqual([parameter('first'), parameter('second'), parameter('third')]);
        });

        it('group any expression in parentheses, recording the expression the group holds', () => {
            expect(domql.query('(first or second) and third').definition.expression).toEqual({ kind: 'and', operands: [{ kind: 'or', operands: [parameter('first'), parameter('second')] }, parameter('third')] });
            expect(domql.query('((first))').definition.expression).toEqual(parameter('first'));
        });

        it('start a chain from a group', () => {
            expect(domql.query('(panel).children.count').definition.expression).toEqual(member('count', member('children', parameter('panel'))));
        });

        it('stand as a field under the name written for it, as every field does', () => {
            expect(getError(() => domql.query('panel {.attached or.disabled() }'))).toMatchObject({ kind: 'syntax', code: 'NEXO1051' });
            expect(() => domql.query('panel { unavailable = it.attached or it.disabled() }')).not.toThrow();
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('input.disabled() or (input.readonly() and input.textEditable())', { input: document.body });

            expect(domql.query(parsed.definition, { input: document.body }).definition).toEqual(parsed.definition);
        });

        it.each([
            ['an and of one expression', { kind: 'and', operands: [parameter('panel')] }, '/expression/operands', 'NEXO2525'],
            ['an or whose operands are no array', { kind: 'or', operands: parameter('panel') }, '/expression/operands', 'NEXO2000'],
            ['an operand that tests the implicit parameter at the top level', { kind: 'or', operands: [member('visible'), parameter('panel')] }, '/expression/operands/0/receiver', 'NEXO2026'],
        ])('refuse a definition with %s', (_, query, pointer, code) => {
            const error = getError(() => domql.query(definitionOf(query), { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conditionals', () => {
        const conditional = (condition, consequent, alternative) => ({ kind: 'conditional', condition, consequent, alternative });

        it('read a condition, a consequent and an alternative, each a whole expression', () => {
            expect(domql.query('if wide then panel else sidebar end').definition.expression).toEqual(conditional(parameter('wide'), parameter('panel'), parameter('sidebar')));
            expect(domql.query('if wide then first else second and third end').definition.expression.alternative).toEqual({ kind: 'and', operands: [parameter('second'), parameter('third')] });
        });

        it('record an elseif as a conditional nested in the alternative before it', () => {
            const nested = conditional(parameter('a'), literal(1), conditional(parameter('b'), literal(2), literal(3)));

            expect(domql.query('if a then 1 elseif b then 2 else 3 end').definition.expression).toEqual(nested);
            expect(domql.query('if a then 1 else if b then 2 else 3 end end').definition.expression).toEqual(nested);
        });

        it('stand where an expression stands, grouped where it is an operand, and start no chain, which a local holding the value does', () => {
            expect(getError(() => domql.query('(if wide then panel else sidebar end).rect.width')).message).toContain('A conditional is never the receiver of a chain: bind its value to a local first');
            expect(domql.query('let target = if wide then panel else sidebar end\nreturn target.rect.width').definition.expression.result).toEqual(member('width', member('rect', { kind: 'local', name: 'target' })));
            expect(domql.query('(if a then true else false end) and b').definition.expression.kind).toBe('and');
            expect(domql.query('panel { state = if it.disabled() then "locked" else "open" end }').definition.expression.objectFields[0].value.kind).toBe('conditional');
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('if panel == null then "gone" elseif panel.attached then "here" else "away" end', { panel: document.body });

            expect(domql.query(parsed.definition, { panel: document.body }).definition).toEqual(parsed.definition);
        });

        it.each([
            ['a conditional without its alternative', { kind: 'conditional', condition: parameter('a'), consequent: literal(1) }, '/expression'],
            ['a conditional whose branch is no node', conditional(parameter('a'), literal(1), 'else'), '/expression/alternative'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query(definitionOf(query), { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2000');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('optional access', () => {
        it('reads ?. as an optional access or call, held by the optional chain that ends where its chain does', () => {
            expect(domql.query('panel.parent?.children.count').definition.expression).toEqual(chain(member('count', optional(member('children', member('parent', parameter('panel')))))));
            expect(domql.query('panel.first(".a")?.closest(".b")').definition.expression).toEqual(chain(optional(call('closest', literal('.b'), call('first', literal('.a'), parameter('panel'))))));
        });

        it('end a chain at a group, which a chain continues from as a value of its own', () => {
            expect(domql.query('(panel.parent?.children).count').definition.expression).toEqual(member('count', chain(optional(member('children', member('parent', parameter('panel')))))));
        });

        it('carry an object expression and the calls after an optional one in the chain', () => {
            expect(domql.query('panel.parent?.rect { top = it.top }').definition.expression).toEqual(chain({ kind: 'object', context: optional(member('rect', member('parent', parameter('panel')))), objectFields: [{ name: 'top', value: member('top') }] }));
            expect(domql.query('panel.parent?.closest(".row").matches(".open")').definition.expression).toEqual(chain(call('matches', literal('.open'), optional(call('closest', literal('.row'), member('parent', parameter('panel')))))));
        });

        it('keep the chain of an argument its own', () => {
            expect(domql.query('panel.closest(row?.key)').definition.expression).toEqual(call('closest', chain(optional(member('key', parameter('row')))), parameter('panel')));
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('(panel.parent?.children).count == null and panel.first(".a")?.closest(".b") == null');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });

        it.each([
            ['an optional access outside an optional chain', optional(member('size', parameter('panel'))), '/expression', 'NEXO2010'],
            ['an optional chain holding no optional access', chain(member('size', parameter('panel'))), '/expression', 'NEXO2030'],
            ['an optional chain directly holding another', chain(chain(optional(member('size', parameter('panel'))))), '/expression', 'NEXO2030'],
            ['an optional access that is not true', { ...member('size', parameter('panel')), optional: false }, '/expression/optional', 'NEXO2000'],
            ['a call named by an expression, which only a computed property access is', { kind: 'call', callee: member(literal('closest'), parameter('panel')), arguments: [] }, '/expression/callee/name', 'NEXO2000'],
            ['an optional access of an argument the chain it is passed to holds', chain(optional(call('closest', optional(member('key', parameter('row'))), parameter('panel')))), '/expression/chain/arguments/0', 'NEXO2010'],
        ])('refuse a definition with %s', (_, query, pointer, code) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
        });

        it('read an optional enclosed access as the optional chain of its accesses, every one of them optional', () => {
            expect(domql.query('(?panel.parent.rect)').definition).toEqual(domql.query('panel?.parent?.rect').definition);
            expect(domql.query('(?panel.first(".a").closest(".b"))').definition.expression).toEqual(chain(optional(call('closest', literal('.b'), optional(call('first', literal('.a'), parameter('panel')))))));
        });

        it('end the optional chain of an optional enclosed access at its closing parenthesis', () => {
            const group = chain(optional(member('z', optional(member('y', parameter('x'))))));

            expect(domql.query('(?x.y.z)?.a.b').definition.expression).toEqual(chain(member('b', optional(member('a', group)))));
            expect(domql.query('(?x.y.z)?.a?.b').definition.expression).toEqual(chain(optional(member('b', optional(member('a', group))))));
            expect(domql.query('(x.y.z)?.a').definition.expression).toEqual(chain(optional(member('a', member('z', member('y', parameter('x')))))));
        });

        it('take an optional enclosed access as a chain input, a call\'s argument among them, keeping its arguments their own', () => {
            expect(domql.query('panel.matches((?row.key))').definition.expression).toEqual(call('matches', chain(optional(member('key', parameter('row')))), parameter('panel')));
            expect(domql.query('(?panel.closest(row.key))').definition.expression).toEqual(chain(optional(call('closest', member('key', parameter('row')), parameter('panel')))));
        });

        it.each([
            ['a question mark apart from its parenthesis', '( ?panel.size)', 1, 3, 'NEXO1001'],
            ['an optional enclosed access with no access', '(?panel)', 1, 8, 'NEXO1016'],
            ['an optional enclosed access whose receiver is a group holding no cast', '(?(panel).size)', 1, 9, 'NEXO1502'],
            ['an optional enclosed access holding an object expression', '(?panel.rect { top: it.top })', 1, 14, 'NEXO1016'],
            ['an optional enclosed access holding a member written after a space', '(?panel.parent matches ".row")', 1, 16, 'NEXO1016'],
            ['a call whose parenthesis opens the optional enclosed access that is its argument', 'panel.closest(?row.key)', 1, 14, 'NEXO1015'],
        ])('refuse %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a question mark apart from its dot', 'panel? .size', 1, 6, 'NEXO1001'],
            ['an optional access with no name', 'panel?.', 1, 8, 'NEXO1000'],
        ])('refuse %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('computed property access', () => {
        it('reads brackets after a dot as a property access named by the expression they hold, and a string literal that is a name as that name', () => {
            expect(domql.query('panel.[name]').definition.expression).toEqual(member(parameter('name'), parameter('panel')));
            expect(domql.query('panel.["size"]').definition).toEqual(domql.query('panel.size').definition);
            expect(domql.query('panel.["data-key"]').definition.expression).toEqual(member(literal('data-key'), parameter('panel')));
            expect(domql.query('panel . [ name ]').definition).toEqual(domql.query('panel.[name]').definition);
        });

        it('read ?.[…] as an optional computed property access, and every computed property access of an optional enclosed access as optional', () => {
            expect(domql.query('panel.parent?.[name]').definition.expression).toEqual(chain(optional(member(parameter('name'), member('parent', parameter('panel'))))));
            expect(domql.query('(?panel.parent.[name].width)').definition.expression).toEqual(chain(optional(member('width', optional(member(parameter('name'), optional(member('parent', parameter('panel')))))))));
        });

        it('are created from a definition as they are parsed from text, a string literal that is a name written as the name', () => {
            const parsed = domql.query('panel.[if wide then "size" else "clientSize" end]?.width');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
            expect(domql.query(definitionOf(member(literal('size'), parameter('panel')))).definition.expression).toEqual(member('size', parameter('panel')));
        });

        it.each([
            ['empty brackets', 'panel.[]', 1, 8, 'NEXO1000'],
            ['an unclosed bracket', 'panel.[name', 1, 12, 'NEXO1000'],
            ['a colon before brackets', 'panel:[name]', 1, 6, 'NEXO1014'],
            ['a colon before optional brackets', 'panel?:[name]', 1, 6, 'NEXO1014'],
            ['a colon before brackets in an optional enclosed access', '(?panel:[name])', 1, 8, 'NEXO1014'],
            ['optional brackets after a dot', 'panel.?[name]', 1, 7, 'NEXO1507'],
            ['a bracket after a conversion, which ends its chain', 'a to String[name]', 1, 12, 'NEXO1501'],
        ])('refuse %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('casts', () => {
        const cast = (type, operand) => ({ kind: 'cast', type, operand });

        it('read a target, as and the quoted type it casts to, which a chain continues from only in a group', () => {
            expect(domql.query('panel.parent as Element').definition.expression).toEqual(cast('Element', member('parent', parameter('panel'))));
            expect(domql.query('(panel.parent as Element)?.rect').definition.expression).toEqual(chain(optional(member('rect', cast('Element', member('parent', parameter('panel')))))));
            expect(domql.query('(panel.parent as Element).matches(".row")').definition.expression).toEqual(call('matches', literal('.row'), cast('Element', member('parent', parameter('panel')))));
        });

        it('take a coalescing operator in parentheses, an optional enclosed access and another cast in a group as targets', () => {
            expect(domql.query('(a ?? b) as Element').definition.expression).toEqual(cast('Element', { kind: 'coalescing', value: parameter('a'), fallback: parameter('b') }));
            expect(domql.query('(?node.parent) as Element').definition.expression).toEqual(cast('Element', chain(optional(member('parent', parameter('node'))))));
            expect(domql.query('(a as Node) as Element').definition.expression).toEqual(cast('Element', cast('Node', parameter('a'))));
        });

        it('stand as the receiver of an optional enclosed access, their own target\'s accesses optional too', () => {
            expect(domql.query('(?(panel.parent as Element).rect.width)').definition).toEqual(domql.query('(panel?.parent as Element)?.rect?.width').definition);
            expect(domql.query('(?((node.parent as Node) as Element).rect)').definition).toEqual(domql.query('((node?.parent as Node) as Element)?.rect').definition);
            // `it` and a literal are receivers a grouped cast holds, never keywords that tell a grouped target from a grouped cast.
            expect(domql.query('panel { w = (?((it.parent as Node) as Element).rect) }').definition).toEqual(domql.query('panel { w = ((it?.parent as Node) as Element)?.rect }').definition);
            expect(domql.query('(?((null as Node) as Element).rect)').definition).toEqual(domql.query('((null as Node) as Element)?.rect').definition);
        });

        it('stand as the receiver of an optional enclosed access with a grouped target that keeps its own rules, a coalescing operator or another optional enclosed access', () => {
            expect(domql.query('(?((a.x ?? b.y) as Element).rect.width)').definition).toEqual(domql.query('((a.x ?? b.y) as Element)?.rect?.width').definition);
            expect(domql.query('(?((?a.b) as Element).c)').definition).toEqual(domql.query('(a?.b as Element)?.c').definition);
            expect(domql.query('(?(((a ?? b) as Node) as Element).rect)').definition).toEqual(domql.query('(((a ?? b) as Node) as Element)?.rect').definition);
            expect(domql.query('(?((a ?? b as Node) as Element).rect)').definition).toEqual(domql.query('((a ?? b as Node) as Element)?.rect').definition);
            expect(domql.query('(?((a as Node ?? b) as Element).rect)').definition).toEqual(domql.query('((a as Node ?? b) as Element)?.rect').definition);
        });

        it.each([
            ['a grouped coalescing operator an access follows', '(?((a ?? b).x as Element).rect)', 1, 12, 'NEXO1025'],
            ['an optional enclosed access an access follows', '(?((?a.b).c as Element).d)', 1, 10, 'NEXO1025'],
            ['a conditional in parentheses', '(?((if a then b else c end) as Element).d)', 1, 4, 'NEXO1025'],
            ['a conditional in parentheses whose branch is a cast', '(?((if a then b as Node else c end) as Element).d)', 1, 4, 'NEXO1025'],
            ['a coalescing operator that no cast holds', '(?((a ?? b)).rect)', 1, 12, 'NEXO1502'],
        ])('refuse as the cast an optional enclosed access receives %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['of a conditional in parentheses', '(if a then b else c end) as Element', 1, 1, 'NEXO1025'],
            ['of a chain an object expression continues', 'a { x = 1 } as Element', 1, 1, 'NEXO1025'],
            ['of an optional enclosed access a chain continues', '(?a.b).c as Element', 1, 1, 'NEXO1025'],
            ['of a coalescing operator a chain continues', '(a ?? b).c as Element', 1, 1, 'NEXO1025'],
            ['to a type written as a string', 'a as "element"', 1, 6, 'NEXO1026'],
            ['continued without a group', 'a as Element?.rect', 1, 13, 'NEXO1053'],
            ['of a cast without a group', 'a as Node as Element', 1, 11, 'NEXO1024'],
        ])('refuse a cast %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', cast(5, parameter('a')), '/expression/type'],
            ['an operand that is an infixCall, which is no node', cast('Element', infixCall('matches', literal('.row'), parameter('a'))), '/expression/operand'],
        ])('refuse a definition of a cast with %s', (_, query, pointer) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2000');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conversions', () => {
        const conversion = (type, operand) => ({ kind: 'conversion', type, operand });
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });

        it('read a value, to and the type it converts to, written bare, binding looser than a cast and tighter than an equality, and chaining left to right', () => {
            expect(domql.query('a to Number').definition.expression).toEqual(conversion('Number', parameter('a')));
            expect(domql.query('panel.attribute["data-count"] to Number').definition.expression).toEqual(conversion('Number', indexer('attribute', literal('data-count'), parameter('panel'))));
            expect(domql.query('panel.matches(".open") to String').definition.expression).toEqual(conversion('String', call('matches', literal('.open'), parameter('panel'))));
            expect(domql.query('a to String to Number').definition.expression).toEqual(conversion('Number', conversion('String', parameter('a'))));
            expect(domql.query('panel.attribute["data-count"] to Number == 5').definition.expression).toEqual(equality(conversion('Number', indexer('attribute', literal('data-count'), parameter('panel'))), literal(5)));
            expect(domql.query('a to Number ?? 0').definition.expression).toEqual(coalescing(conversion('Number', parameter('a')), literal(0)));
            expect(domql.query('a ?? b to Number').definition.expression).toEqual(coalescing(parameter('a'), conversion('Number', parameter('b'))));
            expect(domql.query('not a to Boolean').definition.expression).toEqual(not(conversion('Boolean', parameter('a'))));
            expect(domql.query('a as Element to String').definition.expression).toEqual(conversion('String', { kind: 'cast', type: 'Element', operand: parameter('a') }));
            expect(domql.query('sentinel.intersects() to String').definition.expression).toEqual(conversion('String', call('intersects', undefined, parameter('sentinel'))));
            expect(domql.query('panel.matches(~to) to String').definition.expression).toEqual(conversion('String', call('matches', parameter('to'), parameter('panel'))));
        });

        it('take to with or without the trivia around it, which separates nothing a token does not, on the line of its value and its type', () => {
            const spaced = domql.query('a to Number').definition;

            expect(getError(() => domql.query('a to\n    Number'))).toMatchObject({ kind: 'syntax', code: 'NEXO1041', location: { line: 2, column: 5 } });
            expect(domql.query('a/* the value */to/* its type */Number').definition).toEqual(spaced);
            expect(domql.query('(a)to Number').definition).toEqual(spaced);
            expect(domql.query('a["n"]to Number').definition.expression).toEqual(conversion('Number', indexer(undefined, literal('n'), parameter('a'))));
        });

        it('take to as a keyword, which names a field, a local, a property, a call and an indexer as it is written, a reference to a local reading it after @ and a binding after ~', () => {
            expect(domql.query('{ from = 1, to = 2 }').definition.expression.objectFields.map(field => field.name)).toEqual(['from', 'to']);
            expect(domql.query('panel { let to = it.size, width = @to.width }').definition.expression.objectFields[0].value).toEqual(member('width', { kind: 'local', name: 'to' }));
            expect(domql.query('range.to').definition.expression).toEqual(member('to', parameter('range')));
            expect(domql.query('range.to()').definition.expression).toEqual(call('to', undefined, parameter('range')));
            expect(domql.query('range { let to = "3", value = @to to Number }').definition.expression.objectFields[0].value).toEqual(conversion('Number', { kind: 'local', name: 'to' }));
            expect(domql.query('~to.size').definition.expression).toEqual(member('size', parameter('to')));
            expect(domql.query('range.to[1]').definition.expression).toEqual(indexer('to', literal(1), parameter('range')));
            expect(domql.query('panel { let to = ".x", open = it.matches(@to) }').definition.expression.objectFields[0].value).toEqual(call('matches', { kind: 'local', name: 'to' }));
            expect(getError(() => domql.query('panel { let to = ".x", open = it.matches(to) }')).message).toContain("Found 'to', a keyword: write '@to' for the local, object field, conditional binding or function parameter of that name");
            expect(domql.query(definitionOf(member('to', parameter('to')))).definition.expression).toEqual(member('to', parameter('to')));
            expect(domql.query(definitionOf({ kind: 'object', context: parameter('to'), locals: [{ name: 'to', value: literal(1) }], objectFields: [{ name: 'to', value: { kind: 'local', name: 'to' } }] })).definition.expression.objectFields[0].name).toBe('to');
        });

        it.each([
            ['to a type written as a string', 'a to "number"', 1, 6, 'NEXO1026'],
            ['continued without a group', 'a to Number?.x', 1, 12, 'NEXO1501'],
            ['followed by an object expression', 'a to Number { x: 1 }', 1, 13, 'NEXO1501'],
            ['followed by a member written after a space', 'a to Number matches ".row"', 1, 13, 'NEXO1011'],
            ['cast without a group', 'a to String as Element', 1, 13, 'NEXO1025'],
            ['written without the value it converts', 'to Number', 1, 1, 'NEXO1010'],
        ])('refuse a conversion %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', conversion(5, parameter('a')), '/expression/type'],
            ['no operand', { kind: 'conversion', type: 'Number' }, '/expression'],
        ])('refuse a definition of a conversion with %s', (_, query, pointer) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2000');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('attempts', () => {
        const conversion = (type, operand) => ({ kind: 'conversion', type, operand });
        const cast = (type, operand) => ({ kind: 'cast', type, operand });
        const attempt = operand => ({ kind: 'try', operand });
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });
        const queryOf = text => domql.query(text).definition.expression;

        it('read try and the one conversion or cast it attempts, binding tighter than an equality and a coalescing operator', () => {
            expect(queryOf('try a to Number')).toEqual(attempt(conversion('Number', parameter('a'))));
            expect(queryOf('try panel["data-n"] to Number')).toEqual(attempt(conversion('Number', indexer(undefined, literal('data-n'), parameter('panel')))));
            expect(queryOf('try (a to String) to Number')).toEqual(attempt(conversion('Number', conversion('String', parameter('a')))));
            expect(queryOf('try a to Number == 5')).toEqual(equality(attempt(conversion('Number', parameter('a'))), literal(5)));
            expect(queryOf('try a to Number ?? 0')).toEqual(coalescing(attempt(conversion('Number', parameter('a'))), literal(0)));
            expect(queryOf('(try a to Number) to String')).toEqual(conversion('String', attempt(conversion('Number', parameter('a')))));
            expect(queryOf('try node as Element')).toEqual(attempt(cast('Element', parameter('node'))));
            expect(queryOf('try node.parent as Element')).toEqual(attempt(cast('Element', member('parent', parameter('node')))));
            expect(queryOf('(try node as Element) != null')).toEqual({ kind: 'not', operand: equality(attempt(cast('Element', parameter('node'))), literal(null)) });
            expect(queryOf('try node as Element ?? panel')).toEqual(coalescing(attempt(cast('Element', parameter('node'))), parameter('panel')));
            expect(queryOf('try (node as Element).parent as Element')).toEqual(attempt(cast('Element', member('parent', cast('Element', parameter('node'))))));
            expect(queryOf('try (node as Element) to String')).toEqual(attempt(conversion('String', cast('Element', parameter('node')))));
        });

        it('leave is and convertible names, as any word that is no keyword is', () => {
            const local = parameter('convertible');

            expect(domql.query('a == convertible').definition.expression).toEqual(equality(parameter('a'), local));
            expect(domql.query('a == convertible to Number').definition.expression).toEqual(equality(parameter('a'), conversion('Number', local)));
            expect(domql.query('a.convertible').definition.expression).toEqual(member('convertible', parameter('a')));
            expect(domql.query('{ is = 1 }').definition.expression.objectFields[0].name).toBe('is');
            expect(domql.query('panel { let is = it.size, width = is.width }').definition.expression.objectFields[0].value).toEqual(member('width', { kind: 'local', name: 'is' }));
            expect(domql.query('a.is').definition.expression).toEqual(member('is', parameter('a')));
            expect(domql.query('a.checked() == true').definition.expression).toEqual(equality(call('checked', undefined, parameter('a')), literal(true)));
            expect(domql.query('a?.checked()').definition.expression).toEqual(chain(optional(call('checked', undefined, parameter('a')))));
        });

        it.each([
            ['of a chain of conversions without a group', 'try a to String to Number', 1, 1, 'NEXO1022'],
            ['of a conversion of a cast without a group', 'try node as Element to String', 1, 1, 'NEXO1022'],
            ['of what is neither a conversion nor a cast', 'try a', 1, 1, 'NEXO1022'],
            ['of another attempt', 'try try a to Number', 1, 5, 'NEXO1022'],
            ['to a type written as a string', 'try a to "number"', 1, 10, 'NEXO1026'],
            ['casting to a type written as a string', 'try a as "element"', 1, 10, 'NEXO1026'],
            ['chained by an equality', 'try a to Number == 1 == 2', 1, 22, 'NEXO1020'],
            ['that a cast takes as its target', '(try a as Node) as Element', 1, 1, 'NEXO1023'],
        ])('refuse an attempt %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['an attempt of a parameter', attempt(parameter('a')), '/expression/operand', 'NEXO2523'],
            ['an attempt of an equality', attempt(equality(parameter('a'), literal(1))), '/expression/operand', 'NEXO2523'],
            ['an attempt of another attempt', attempt(attempt(conversion('Number', parameter('a')))), '/expression/operand', 'NEXO2523'],
            ['an attempt of nothing', { kind: 'try' }, '/expression', 'NEXO2000'],
            ['a conversion that says it is attempted', { ...conversion('Number', parameter('a')), attempt: true }, '/expression', 'NEXO2000'],
            ['a cast of an attempt', cast('Element', attempt(cast('Node', parameter('a')))), '/expression/operand', 'NEXO2002'],
        ])('refuse a definition of %s, since try attempts a conversion or a cast', (_, query, pointer, code) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conditional bindings', () => {
        const binding = (name, value, consequent, alternative) => ({ kind: 'conditional', binding: { name, value }, consequent, alternative });
        const local = name => ({ kind: 'local', name });

        it('read if let, a name, = and the value it binds in place of a condition, in an elseif too', () => {
            expect(domql.query('if let key = row["data-key"] then key else "none" end').definition.expression).toEqual(binding('key', indexer(undefined, literal('data-key'), parameter('row')), local('key'), literal('none')));
            expect(domql.query('if a then 1 elseif let n = b then n else 0 end').definition.expression).toEqual({ kind: 'conditional', condition: parameter('a'), consequent: literal(1), alternative: binding('n', parameter('b'), local('n'), literal(0)) });
        });

        it.each([
            ['without a name', 'if let: 1 then 2 else 3', 1, 7],
            ['without a colon', 'if let n 1 then 2 else 3', 1, 8],
        ])('refuse a conditional binding written %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe('NEXO1051');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['both a condition and a binding', { kind: 'conditional', condition: literal(true), binding: { name: 'n', value: literal(1) }, consequent: literal(1), alternative: literal(2) }, '/expression'],
            ['neither', { kind: 'conditional', consequent: literal(1), alternative: literal(2) }, '/expression'],
            ['a binding without its value', { kind: 'conditional', binding: { name: 'n' }, consequent: literal(1), alternative: literal(2) }, '/expression/binding'],
            ['a binding named as no name is', { kind: 'conditional', binding: { name: '2n', value: literal(1) }, consequent: literal(1), alternative: literal(2) }, '/expression/binding/name'],
        ])('refuse a definition of a conditional with %s', (_, query, pointer) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2000');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('named indexers', () => {
        it('read a receiver, a dot, the indexer\'s name and its one key in brackets, as an indexer of the member access its name is written in', () => {
            expect(domql.query('panel.attribute["data-key"]').definition.expression).toEqual(indexer('attribute', literal('data-key'), parameter('panel')));
            expect(domql.query('panel.attribute[name]').definition.expression).toEqual(indexer('attribute', parameter('name'), parameter('panel')));
            expect(domql.query('panel.first(".row").style["display"]').definition.expression).toEqual(indexer('style', literal('display'), call('first', literal('.row'), parameter('panel'))));
            expect(domql.query('panel.lookup["a"].["b"]').definition.expression).toEqual(member('b', indexer('lookup', literal('a'), parameter('panel'))));
            expect(domql.query('panel.lookup["a"].label').definition.expression).toEqual(member('label', indexer('lookup', literal('a'), parameter('panel'))));
            expect(domql.query('panel . attribute [ "data-key" ]').definition).toEqual(domql.query('panel.attribute["data-key"]').definition);
        });

        it('read a key in brackets after a value as its unnamed indexer, which names none', () => {
            expect(domql.query('panel["data-key"]').definition.expression).toEqual({ kind: 'indexerAccess', receiver: parameter('panel'), argument: literal('data-key') });
            expect(domql.query('panel?[name]').definition.expression).toEqual(chain({ kind: 'indexerAccess', receiver: parameter('panel'), argument: parameter('name'), optional: true }));
            expect(domql.query('(?panel.first(".row")["id"])').definition).toEqual(domql.query('panel?.first(".row")?["id"]').definition);
            expect(domql.query(definitionOf({ kind: 'indexerAccess', receiver: parameter('panel'), argument: literal('id') })).definition.expression).toEqual({ kind: 'indexerAccess', receiver: parameter('panel'), argument: literal('id') });
        });

        it('read a colon before an indexer\'s name as the access of an extension\'s named indexer', () => {
            expect(domql.query('panel:tokens["id"]').definition.expression).toEqual({ kind: 'indexerAccess', receiver: { ...member('tokens', parameter('panel')), extension: true }, argument: literal('id') });
        });

        it('read brackets after a dot after a member as a computed property access of what it answers', () => {
            expect(domql.query('panel.size.["width"]').definition.expression).toEqual(member('width', member('size', parameter('panel'))));
            expect(domql.query('panel.attribute.["data-key"]').definition.expression).toEqual(member(literal('data-key'), member('attribute', parameter('panel'))));
        });

        it('read ?. before an indexer\'s name as its receiver\'s optional access, and every access and indexer of an optional enclosed access as optional', () => {
            expect(domql.query('panel?.attribute["id"]').definition.expression).toEqual(chain(indexer('attribute', literal('id'), parameter('panel'), true)));
            expect(domql.query('(?panel.first(".row").attribute["id"])').definition).toEqual(domql.query('panel?.first(".row")?.attribute?["id"]').definition);
        });

        it('stand as a field\'s value', () => {
            expect(domql.query('{ key = panel.attribute["data-key"], n = 1 }').definition.expression.objectFields[0].value).toEqual(indexer('attribute', literal('data-key'), parameter('panel')));
            expect(domql.query('panel { key = it.attribute["data-key"] }').definition.expression.objectFields[0].value).toEqual(indexer('attribute', literal('data-key'), context));
            expect(domql.query('{ x = attribute.["a"] }').definition.expression.objectFields[0]).toEqual({ name: 'x', value: member('a', parameter('attribute')) });
        });

        it.each([
            ['with empty brackets', 'panel.attribute[]', 1, 17, 'NEXO1017'],
            ['as an unnamed indexer with empty brackets', 'panel[]', 1, 7, 'NEXO1017'],
            ['as an unnamed indexer with two keys', 'panel["a", "b"]', 1, 10, 'NEXO1017'],
            ['with two keys', 'panel.attribute["a", "b"]', 1, 20, 'NEXO1017'],
            ['after a colon without a name or a key', 'panel:5', 1, 6, 'NEXO1014'],
            ['with an unclosed bracket', 'panel.attribute["a"', 1, 20, 'NEXO1000'],
        ])('refuse an indexer %s', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['no key', { kind: 'indexerAccess', receiver: member('attribute', parameter('panel')) }, '/expression', 'NEXO2000'],
            ['a name', { kind: 'indexerAccess', receiver: parameter('panel'), name: 'attribute', argument: literal('id') }, '/expression', 'NEXO2000'],
            ['an optional receiver outside an optional chain', indexer('attribute', literal('id'), parameter('panel'), true), '/expression/receiver', 'NEXO2010'],
        ])('refuse a definition of an indexer with %s', (_, query, pointer, code) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('negations', () => {
        it('read not before what it negates, binding looser than an equality and tighter than and and or', () => {
            expect(domql.query('not a').definition.expression).toEqual(not(parameter('a')));
            expect(domql.query('not not a').definition.expression).toEqual(not(not(parameter('a'))));
            expect(domql.query('not panel.attached').definition.expression).toEqual(not(member('attached', parameter('panel'))));
            expect(domql.query('not a == null').definition.expression).toEqual(not(equality(parameter('a'), literal(null))));
            expect(domql.query('not a and b').definition.expression).toEqual({ kind: 'and', operands: [not(parameter('a')), parameter('b')] });
            expect(domql.query('a or not b').definition.expression).toEqual({ kind: 'or', operands: [parameter('a'), not(parameter('b'))] });
            expect(domql.query('not (a or b)').definition.expression).toEqual(not({ kind: 'or', operands: [parameter('a'), parameter('b')] }));
        });

        it('negate a coalescing operator a group holds', () => {
            expect(domql.query('not (busy ?? false)').definition.expression).toEqual(not({ kind: 'coalescing', value: parameter('busy'), fallback: literal(false) }));
        });

        it.each([
            ['beside a coalescing operator it would negate', 'not busy ?? false', 1, 5],
            ['as the fallback of a coalescing operator', 'busy ?? not ready', 1, 9],
        ])('refuse not %s, where no group stands', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe('NEXO1021');
            expect(error.location).toMatchObject({ line, column });
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('not a and not (b ?? true)');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });
    });

    describe('coalescing operators', () => {
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });

        it('read a value and its fallback, associating to the right', () => {
            expect(domql.query('a ?? 0').definition.expression).toEqual(coalescing(parameter('a'), literal(0)));
            expect(domql.query('a ?? b ?? 0').definition.expression).toEqual(coalescing(parameter('a'), coalescing(parameter('b'), literal(0))));
            expect(domql.query('(a ?? b) ?? 0').definition.expression).toEqual(coalescing(coalescing(parameter('a'), parameter('b')), literal(0)));
        });

        it('take a call on either side, and stand as a condition, a field and an argument', () => {
            expect(domql.query('a.matches(".x") ?? b.matches(".y")').definition.expression).toEqual(coalescing(call('matches', literal('.x'), parameter('a')), call('matches', literal('.y'), parameter('b'))));
            expect(domql.query('a.attribute["x"] ?? b.attribute["x"]').definition.expression).toEqual(coalescing(indexer('attribute', literal('x'), parameter('a')), indexer('attribute', literal('x'), parameter('b'))));
            expect(domql.query('if on ?? false then 1 else 2 end').definition.expression.condition).toEqual(coalescing(parameter('on'), literal(false)));
            expect(domql.query('panel.closest(a ?? ".row")').definition.expression.arguments).toEqual([coalescing(parameter('a'), literal('.row'))]);
        });

        it('stand beside and, or and a test where a group holds one of them', () => {
            expect(domql.query('(a ?? false) and b').definition.expression.operands[0]).toEqual(coalescing(parameter('a'), literal(false)));
            expect(domql.query('a ?? (b and c)').definition.expression.fallback.kind).toBe('and');
            expect(domql.query('(a ?? b).attached').definition.expression.receiver).toEqual(coalescing(parameter('a'), parameter('b')));
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('a ?? (b ?? 0)');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });

        it.each([
            ['beside and after them', 'a ?? false and b', 1, 1, 'NEXO1021'],
            ['beside and before them', 'a and b ?? false', 1, 7, 'NEXO1021'],
            ['beside or', 'a or b ?? false', 1, 6, 'NEXO1021'],
            ['beside a null test after them', 'a ?? b == null', 1, 8, 'NEXO1021'],
            ['beside a null test before them', 'a == null ?? false', 1, 11, 'NEXO1021'],
            ['with a question mark apart from the other', 'a ? ? 0', 1, 3, 'NEXO1001'],
        ])('refuse a coalescing operator %s, where no group stands', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a coalescing without its fallback', { kind: 'coalescing', value: parameter('a') }, '/expression'],
            ['a coalescing whose fallback is no node', coalescing(parameter('a'), 0), '/expression/fallback'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query(definitionOf(query)));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2000');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('locals', () => {
        const local = name => ({ kind: 'local', name });

        it('read into the object expression that holds them, before its fields, and a bare name as a use of one', () => {
            expect(domql.query('panel { let items = it.all("[data-key]"), count = items.count }').definition.expression).toEqual({
                kind: 'object',
                context: parameter('panel'),
                locals: [{ name: 'items', value: call('all', literal('[data-key]')) }],
                objectFields: [{ name: 'count', value: member('count', local('items')) }],
            });
        });

        it('stand where a chain input stands, an object expression following one and an indexer taking one', () => {
            const { expression: query } = domql.query('panel { let key = "data-key", let items = it.children, rows = items { key = it[key] } }').definition;

            expect(query.objectFields[0].value).toEqual({ kind: 'object', context: local('items'), objectFields: [{ name: 'key', value: indexer(undefined, local('key')) }] });
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('panel { let items = it.children, count = items.count, inner = it { let first = items[0], key = first?["data-key"] } }', { panel: document.body });

            expect(domql.query(parsed.definition, { panel: document.body }).definition).toEqual(parsed.definition);
        });

        it('leave out of a definition the locals an object expression has none of', () => {
            const definition = definitionOf({ kind: 'object', context: parameter('panel'), locals: [], objectFields: [{ name: 'size', value: member('size') }] });

            expect(domql.query('panel { size = it.size }').definition.expression).not.toHaveProperty('locals');
            expect(domql.query(definition, { panel: document.body }).definition.expression).not.toHaveProperty('locals');
        });

        it.each([
            ['two locals of one object expression with one name', 'panel { let a = 1, let a = 2, b = a }', 1, 20],
        ])('refuse %s, naming where', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2015');
            expect(error.location).toMatchObject({ line, column });
        });

        it('let object expressions beside one another each name a local alike', () => {
            expect(domql.query('panel { a = it { let n = 1, v = n }, b = it { let n = 2, v = n } }', { panel: document.body }).evaluate()).toEqual({ a: { v: 1 }, b: { v: 2 } });
        });

        it.each([
            ['a local named by no name', { kind: 'object', context: parameter('panel'), locals: [{ name: 'a-b', value: literal(1) }], objectFields: [{ name: 'a', value: literal(1) }] }, '/expression/locals/0/name', 'NEXO2000'],
            ['a local without its value', { kind: 'object', context: parameter('panel'), locals: [{ name: 'n' }], objectFields: [{ name: 'a', value: literal(1) }] }, '/expression/locals/0', 'NEXO2000'],
            ['a use of a local named by no name', { kind: 'local', name: 'a-b' }, '/expression/name', 'NEXO2000'],
            ['a use of a local no scope declares', { kind: 'local', name: 'if' }, '/expression', 'NEXO2012'],
        ])('refuse a definition with %s', (_, query, pointer, code) => {
            const error = getError(() => domql.query(definitionOf(query), { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
        });

        it.each([
            ['a member written without its receiver', 'panel { width = rect.width }', "No local in scope or script parameter is named 'rect'; write 'it.rect' for the member of the implicit parameter", 17, 'NEXO3009'],
            ['an indexer written without its receiver or key', 'panel { key = style }', "No local in scope or script parameter is named 'style'; write 'it.style[…]'", 15, 'NEXO3009'],
            ['a call written without its receiver or argument', 'panel { row = closest }', "No local in scope or script parameter is named 'closest'; write 'it.closest(…)'", 15, 'NEXO3009'],
            ['a name that is no member of the implicit parameter', 'panel { a = nothing }', "No local in scope or script parameter is named 'nothing'", 13, 'NEXO3009'],
            ['a local read from the document where a computed property access stands', 'panel { let path = it["data-path"], width = it.[path] }', "A computed property access reads a name determined when the expression is resolved", 49, 'NEXO3014'],
            ['a local of an object expression used beside it', 'panel { a = it { let n = 1, v = n }, b = n }', "No local in scope or script parameter is named 'n'", 42, 'NEXO3009'],
            ['a name at the top level', 'items.count', "No local in scope or script parameter is named 'items'", 1, 'NEXO3009'],
        ])('refuse %s in resolution, naming where', (_, text, message, column, code) => {
            const error = getError(() => domql.query(text, { panel: document.body, sentinel: document.body }).evaluate());

            expect(error.kind).toBe('validation');
            expect(error.code).toBe(code);
            expect(error.message).toContain(message);
            expect(error.location).toMatchObject({ line: 1, column });
        });

        it.each([
            ['a local used before its declaration', 'panel { let a = b, let b = 1, c = a }', 'b', 17, 'NEXO2013'],
            ['a local that uses itself', 'panel { let n = n, a = 1 }', 'n', 17, 'NEXO2013'],
            ['a binding that uses itself', 'if let k = k then 1 else 2 end', 'k', 12, 'NEXO2014'],
            ['a local used before its declaration within a nested value', 'panel { let a = { x = b }, let b = 1, c = a }', 'b', 23, 'NEXO2013'],
        ])('refuse %s, never reading a binding of its name instead, naming where', (_, text, name, column, code) => {
            const error = getError(() => domql.query(text, { panel: document.body, a: 1, b: 2, k: 3, n: 4 }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.message).toContain(`'${name}' is used before the local of that name is declared in its scope`);
            expect(error.location).toMatchObject({ line: 1, column });
        });

        it('read a name a sibling or an unrelated scope declares as the caller\'s binding, and one a local shadows as the local', () => {
            expect(domql.query('panel { a = it { let n = 1, v = n }, b = n }', { panel: document.body, n: 'outer' }).evaluate()).toEqual({ a: { v: 1 }, b: 'outer' });
            expect(domql.query('{ a = if let x = "inner" then x else x end, b = x }', { x: 'outer' }).evaluate()).toEqual({ a: 'inner', b: 'outer' });
            expect(domql.query('panel { let x = 1, inner = x }', { panel: document.body, x: 'shadowed' }).evaluate()).toEqual({ inner: 1 });
            expect(domql.query('{ outer = x, inner = panel { let x = 2, v = x } }', { panel: document.body, x: 1 }).evaluate()).toEqual({ outer: 1, inner: { v: 2 } });
        });

        it('suggest no member a name has where there is no implicit parameter', () => {
            expect(getError(() => domql.query('rect.width').evaluate()).message).not.toContain('write');
        });
    });

    describe('syntax', () => {
        it.each([
            ['two fields with no comma between them', 'panel {\n    size = it.size\n    clientSize = it.clientSize\n}', 3, 5, 'NEXO1000'],
            ['a member given an argument with no receiver and no parentheses', 'panel { open = matches ".open" }', 1, 16, 'NEXO1503'],
            ['a null test with no subject', 'panel { open = == null }', 1, 16, 'NEXO1013'],
            ['a null test with no subject at the top level', '== null', 1, 1, 'NEXO1013'],
            ['arguments after a dot without parentheses', 'sentinel.intersects panel', 1, 21, 'NEXO1011'],
            ['a member written after a space', 'panel matches ".open"', 1, 7, 'NEXO1011'],
            ['a member written after a call with nothing between them', 'panel.first(".row")matches ".open"', 1, 20, 'NEXO1011'],
            ['a member written after a space, an object expression after it', 'panel on "click" { x: it.clientX }', 1, 7, 'NEXO1011'],
            ['a member written after a space with no argument', 'sentinel intersects', 1, 10, 'NEXO1011'],
            ['it naming a field with a colon', 'panel { it: it.size }', 1, 11, 'NEXO1003'],
            ['a member given an argument without parentheses', 'target.is "attached"', 1, 11, 'NEXO1508'],
            ['an equality that chains', 'a == b == c', 1, 8, 'NEXO1020'],
            ['a negation after !=', 'a != not b', 1, 6, 'NEXO1010'],
            ['a single equals sign', 'a = 1', 1, 3, 'NEXO1004'],
            ['a single exclamation mark', 'a ! b', 1, 3, 'NEXO1509'],
            ['a group never closed', '(first or second', 1, 17, 'NEXO1000'],
            ['a group closing nothing', 'first)', 1, 6, 'NEXO1000'],
            ['an operator naming a field with a colon', 'panel { try: it.size }', 1, 12, 'NEXO1003'],
            ['an operator naming a parameter', 'and { size: it.size }', 1, 1, 'NEXO1010'],
            ['a field named with a hyphen, which subtracts', 'panel { is-open = it.size }', 1, 9, 'NEXO1051'],
            ['a minus with nothing after it', 'panel.size- ', 1, 13, 'NEXO1000'],
            ['an escape the language has none of', 'target.attribute["a\\q"]', 1, 20, 'NEXO1006'],
            ['a string never closed', 'target.attribute["id', 1, 18, 'NEXO1510'],
            ['a character outside the language', 'target.size & 1', 1, 13, 'NEXO1000'],
            ['an @ with no name after it', '@ { size: it.size }', 1, 1, 'NEXO1050'],
            ['an @ a space parts from a name', '@ panel', 1, 1, 'NEXO1050'],
            ['an @ a comment parts from a name', '@/* the panel */panel', 1, 1, 'NEXO1050'],
            ['a field without a name', 'panel { it.size }', 1, 9, 'NEXO1051'],
            ['a field without a name after a named one', 'panel { width = it.size.width, it.rect }', 1, 32, 'NEXO1051'],
            ['an object expression without a field', 'panel {}', 1, 8, 'NEXO1018'],
            ['a query that ends too soon', 'panel {', 1, 8, 'NEXO1051'],
            ['a reserved literal naming a field with a colon', 'panel { null: it.size }', 1, 13, 'NEXO1003'],
            ['a block comment never closed', 'panel { size: it.size /* the size', 1, 23, 'NEXO1007'],
            ['a slash with nothing after it', 'panel.size /', 1, 13, 'NEXO1000'],
            ['a # comment, which DOMQL has none of', '# A panel.\npanel { size: it.size }', 1, 1, 'NEXO1000'],
            ['a conditional without then', 'if wide else "b"', 1, 9, 'NEXO1000'],
            ['a conditional without else', 'if wide then "a"', 1, 17, 'NEXO1505'],
            ['a conditional that is an operand without parentheses', 'a and if b then true else false', 1, 7, 'NEXO1027'],
            ['a keyword of the conditional naming a field with a colon', 'panel { then: it.size }', 1, 13, 'NEXO1003'],
            ['a conditional that is a condition without parentheses', 'if if a then b else c then 1 else 2', 1, 4, 'NEXO1027'],
            ['let naming a field with a colon', 'panel { let: it.size }', 1, 12, 'NEXO1003'],
            ['a keyword naming a local with a colon', 'panel { let if: it.size, a: 1 }', 1, 15, 'NEXO1003'],
            ['a local after a field', 'panel { a = it.size, let r = it.rect }', 1, 22, 'NEXO1504'],
            ['a local without its comma', 'panel { let r = it.rect width = r.width }', 1, 25, 'NEXO1000'],
            ['an object expression of locals alone', 'panel { let r = it.rect, }', 1, 26, 'NEXO1018'],
            ['a local given an argument', 'panel { let r = it.rect, a = r "x" }', 1, 30, 'NEXO1503'],
        ])('rejects %s, naming where', (_, text, line, column, code) => {
            const error = getError(() => domql.query(text));

            expect(error.name).toBe('NexoError');
            expect(error.kind).toBe('syntax');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ line, column });
        });

        it('reads a colon after a name in a call\'s arguments as an extension access, which takes no named argument', () => {
            expect(domql.query('panel.rectRelativeTo(relativeTo: other)').definition.expression).toEqual(call('rectRelativeTo', { ...member('other', parameter('relativeTo')), extension: true }, parameter('panel')));
        });
    });

    describe('structure', () => {
        it.each([
            ['two fields named alike', 'target { width = it.rect.width, width = it.size.width }', '/expression/objectFields/1', 'NEXO2031'],
            ['two fields of an options object named alike', 'sentinel.intersects({ root = panel, root = other })', '/expression/arguments/0/objectFields/1', 'NEXO2031'],
            ['an options object holding a local', 'sentinel.intersects({ let m = 200, root = panel, margin = m })', '/expression/arguments/0/locals/0', 'NEXO2527'],
            ['it at the top level', 'it.rect.width', '/expression/receiver/receiver', 'NEXO2026'],
            ['it in a field of a top-level object expression', '{ width = it.rect.width }', '/expression/objectFields/0/value/receiver/receiver', 'NEXO2026'],
        ])('rejects %s, naming where', (_, text, pointer, code) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location.pointer).toBe(pointer);
            expect(error.location.line).toBe(1);
        });

        it('reads any word after a dot as the name of a member, a property, a call, a field or an indexer, a reserved word among them', () => {
            const record = { then: 1, else: 2, self: 3, end: 4 };

            expect(domql.query('{ a = r.then, b = r?.else, c = r.self, d = r.["end"] }', { r: record }).evaluate()).toEqual({ a: 1, b: 2, c: 3, d: 4 });
            expect(domql.query('r.["end"]').definition.expression).toEqual(member('end', parameter('r')));
            expect(domql.format('r.if')).toBe('r.if');
            expect(domql.query(definitionOf(member('it', parameter('panel')))).definition.expression.name).toBe('it');
            expect(domql.query('panel.null').definition.expression).toEqual(member('null', parameter('panel')));
            expect(domql.query('panel.end["x"]').definition.expression).toMatchObject({ kind: 'indexerAccess', receiver: { kind: 'memberAccess', name: 'end' } });
            expect(domql.query('panel?.if["x"]').definition.expression.chain).toMatchObject({ kind: 'indexerAccess', receiver: { kind: 'memberAccess', name: 'if', optional: true } });
            expect(domql.format('panel.end["x"]')).toBe('panel.end["x"]');
            expect(domql.query('panel.null["x"]').definition.expression).toMatchObject({ kind: 'indexerAccess', receiver: { kind: 'memberAccess', name: 'null' } });
            expect(domql.query('{ then = 1 }').evaluate()).toEqual({ then: 1 });
        });

        it('keeps a reserved word inside a string as an ordinary string', () => {
            expect(domql.query('target.attribute["null"]').definition.expression.argument).toEqual(literal('null'));
        });

        it('accepts a field continuing past an access by a bound name', () => {
            expect(domql.query('target { width = it.[name]?.width }').definition.expression.objectFields).toHaveLength(1);
        });

        it('accepts a member at the start of an argument, whose implicit parameter its member decides', () => {
            expect(() => domql.query('list.all("li").where(it.intersects({ root = list })).count')).not.toThrow();
        });

        it('locates a failure on the line it is written on', () => {
            const error = getError(() => domql.query('target {\n    width = it.rect.width,\n    width = it.size.width\n}'));

            expect(error.location).toMatchObject({ pointer: '/expression/objectFields/1', line: 3, column: 5 });
        });
    });

    describe('query from a definition', () => {
        it('creates the query its text parses into', () => {
            const parsed = domql.query('panel { size = it.size, hasFocus = it.focusWithin() }', { panel: 1 });
            const created = domql.query(parsed.definition, { panel: 2 });

            expect(created.definition).toEqual(parsed.definition);
            expect(DomqlQuery.bindingsOf(created).readValue('panel')).toBe(2);
        });

        it('copies and freezes the definition it is given', () => {
            const definition = definitionOf({ kind: 'object', context: parameter('panel'), objectFields: [{ name: 'size', value: member('size') }] });
            const query = domql.query(definition);

            definition.expression.objectFields.push({ name: 'clientSize', value: member('clientSize') });

            expect(query.definition.expression.objectFields).toHaveLength(1);
            expect(Object.isFrozen(query.definition.expression)).toBe(true);
        });

        it.each([
            ['a version other than 38', { ...definitionOf(parameter('panel')), version: 37 }, '/version', 'NEXO2007'],
            ['no imports', { version: 38, expression: parameter('panel') }, '', 'NEXO2000'],
            ['a field without a name', definitionOf({ kind: 'object', context: parameter('panel'), objectFields: [{ value: member('size') }] }), '/expression/objectFields/0', 'NEXO2000'],
            ['an object expression without a field', definitionOf({ kind: 'object', context: parameter('panel'), objectFields: [] }), '/expression', 'NEXO2009'],
            ['a property no part has', definitionOf({ ...parameter('panel'), extra: true }), '/expression', 'NEXO2000'],
            ['an unknown kind', definitionOf({ kind: 'phrase', name: 'size' }), '/expression', 'NEXO2000'],
            ['a member access without a receiver', definitionOf({ kind: 'memberAccess', name: 'size' }), '/expression', 'NEXO2000'],
            ['a call whose callee has no receiver', definitionOf({ kind: 'call', callee: { kind: 'memberAccess', name: 'closest' }, arguments: [] }), '/expression/callee', 'NEXO2000'],
            ['a call without a callee', definitionOf({ kind: 'call', arguments: [] }), '/expression', 'NEXO2000'],
            ['a property access holding an argument', definitionOf({ ...member('size', parameter('panel')), argument: literal(1) }), '/expression', 'NEXO2000'],
            ['a member access holding the arguments of a call', definitionOf({ ...member('size', parameter('panel')), arguments: [] }), '/expression', 'NEXO2000'],
            ['a node of an earlier version', definitionOf({ kind: 'member', target: parameter('panel'), name: 'size' }), '/expression', 'NEXO2000'],
            ['it at the top level', definitionOf(member('size', context)), '/expression/receiver', 'NEXO2026'],
            ['a name that is no name', definitionOf(parameter('2panel')), '/expression/name', 'NEXO2000'],
            ['a name ending in a hyphen', definitionOf(parameter('panel-')), '/expression/name', 'NEXO2000'],
            ['a member named by no name', definitionOf(member('a-b', parameter('panel'))), '/expression/name', 'NEXO2000'],
            ['a field named by no name', definitionOf({ kind: 'object', context: parameter('panel'), objectFields: [{ name: '1a', value: member('size') }] }), '/expression/objectFields/0/name', 'NEXO2000'],
            ['a root holding a name, which version 32 gives none', definitionOf({ kind: 'root', name: 'document' }), '/expression', 'NEXO2000'],
            ['a literal that is no JSON scalar', definitionOf(literal(Number.NaN)), '/expression/value', 'NEXO2019'],
            ['an object expression whose fields are no array', definitionOf({ kind: 'object', context: parameter('panel'), objectFields: {} }), '/expression/objectFields', 'NEXO2000'],
        ])('rejects %s, naming its node', (_, definition, pointer, code) => {
            const error = getError(() => domql.query(definition));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe(code);
            expect(error.location).toEqual({ pointer });
        });
    });

    describe('bindings', () => {
        it('looks a binding up by the exact name', () => {
            const element = document.createElement('div');
            const query = domql.query('panel { size = it.size }', { panel: element, Panel: 2 });

            expect(DomqlQuery.bindingsOf(query).readValue('panel')).toBe(element);
            expect(DomqlQuery.bindingsOf(query).readValue('Panel')).toBe(2);
            expect(DomqlQuery.bindingsOf(query).has('PANEL')).toBe(false);
        });

        it.each([
            ['an element', () => document.createElement('div'), 'Element'],
            ['a number', () => 3, 'Number'],
            ['a list of numbers', () => [1, 2], 'List<Number>'],
            ['an object', () => ({ id: 'a', parent: document.createElement('div') }), '{ id: String, parent: Element }'],
            ['null', () => null, 'null'],
            ['the empty list', () => [], 'List<Never>'],
            ['a list of nulls alone', () => [null, null], 'List<null>'],
            ['a list holding a null', () => [document.createElement('div'), null], 'List<Element?>'],
            ['an object holding a null', () => ({ id: 'a', parent: null }), '{ id: String, parent: null }'],
            ['a list of lists, one of them empty', () => [[1], []], 'List<List<Number>>'],
        ])('types %s from the value alone', (_, value, type) => {
            const bindings = DomqlQuery.bindingsOf(domql.query('target', { target: value() }));

            expect(bindings.getType('target')).toBe(type);
        });

        it('reads a bound object field by field, a field named __proto__ as an ordinary field of its own', () => {
            const row = JSON.parse('{ "__proto__": { "polluted": true }, "id": "a", "tags": ["x", "y"] }');
            const result = domql.query('row', { row }).evaluate();

            expect(Object.keys(result)).toEqual(['__proto__', 'id', 'tags']);
            expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
            expect(Object.getOwnPropertyDescriptor(result, '__proto__').value).toEqual({ polluted: true });
            expect(result.polluted).toBeUndefined();
            expect(Object.isFrozen(result) && Object.isFrozen(result.tags) && Object.isFrozen(result.__proto__)).toBe(true);
            expect(result.tags).not.toBe(row.tags);
        });

        it.each(['snapshot', 'liveState'])('keeps a bound object\'s own __proto__ field through a watch\'s first snapshot and a refresh after a change, delivering %s', async updateStrategy => {
            document.body.innerHTML = '<div id="panel"></div>';

            const panel = document.getElementById('panel');
            const row = JSON.parse('{ "__proto__": { "polluted": true }, "id": "a" }');
            const watch = domql.query('{ row = row, title = panel["title"] }', { row, panel }).watch({ updateStrategy, schedule: 'immediate' });
            const values = [];

            // A watch of live state delivers its snapshot beside the state it keeps current, and both hold the row.
            watch.subscribe('change', (_sender, args) => values.push(...(updateStrategy === 'liveState' ? [args.snapshot, args.liveState] : [args.value])));
            await watch.readyAsync();
            panel.setAttribute('title', 'changed');
            await watch.refreshAsync();
            watch.dispose();

            expect(values.at(-1).title).toBe('changed');

            for (const { row: delivered } of values) {
                expect(Object.keys(delivered)).toEqual(['__proto__', 'id']);
                expect(Object.getPrototypeOf(delivered)).toBe(Object.prototype);
                expect(Object.getOwnPropertyDescriptor(delivered, '__proto__').value).toEqual({ polluted: true });
                expect(delivered.polluted).toBeUndefined();
            }
        });

        it.each([
            ['a field', 'panel { a = it["id"] }', /"name":"a"/g],
            ['a local', 'panel { let k = it["id"], a = k }', /"name":"k"/g],
        ])('refuses __proto__ as the name of %s a definition declares, as it refuses every name that is no letter followed by letters and digits', (_, text, name) => {
            const definition = JSON.parse(JSON.stringify(domql.query(text).definition).replace(name, '"name":"__proto__"'));
            const error = getError(() => domql.query(definition, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2000');
            expect(error.message).toContain('A name is a letter followed by letters and digits');
        });

        it.each([
            ['a list of items of different types', [1, 'two']],
            ['a list of lists of different item types', [[1], ['two']]],
            ['a list of objects of different fields', [{ id: 'a' }, { key: 'a' }]],
        ])('refuses %s, which no type holds', (_, value) => {
            const error = getError(() => domql.query('target', { target: value }));

            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2021');
            expect(error.location).toEqual({ binding: 'target' });
            expect(error.message).toContain('no union types');
        });

        it.each([
            ['first', [, 1]],
            ['in the middle', [1, , 2]],
            ['last', [1, 2, ,]],
            ['in a list an object holds', { ids: [1, , 2] }],
        ])('refuses a list with a hole %s, which holds no value there', (_, value) => {
            const error = getError(() => domql.query('target', { target: value }));

            expect(error).toBeInstanceOf(NexoError);
            expect(error.kind).toBe('structure');
            expect(error.code).toBe('NEXO2034');
            expect(error.location).toEqual({ binding: 'target' });
        });

        it('types a binding again from its value in a query of its definition', () => {
            const parsed = domql.query('target { size = it.size }', { target: null });
            const created = domql.query(parsed.definition, { target: document.createElement('div') });

            expect(DomqlQuery.bindingsOf(parsed).getType('target')).toBe('null');
            expect(DomqlQuery.bindingsOf(created).getType('target')).toBe('Element');
        });

        it('types a binding that holds a node by its kind', () => {
            const host = document.createElement('div');
            const bindings = DomqlQuery.bindingsOf(domql.query('a.children.count', { a: host, b: document, c: document.createDocumentFragment(), d: host.attachShadow({ mode: 'open' }) }));

            expect(['a', 'b', 'c', 'd'].map(name => bindings.getType(name))).toEqual(['Element', 'Document', 'DocumentFragment', 'ShadowRoot']);
        });

        it('refuses a binding of a node of another kind, such as text', () => {
            expect(getError(() => domql.query('a', { a: document.createTextNode('a') })).location).toEqual({ binding: 'a' });
        });

        it('treats a root or a reserved literal in another case as an ordinary name', () => {
            expect(() => domql.query('Window { size = it.size }', { Window: 1, Document: 2, Null: 3 })).not.toThrow();
        });

        it('binds data, numbers, strings, Booleans, null, lists and objects, as a frozen copy, so changing the original changes nothing bound', () => {
            const configuration = { modifier: 'shift', steps: [1, 2], wrap: true };
            const bound = DomqlQuery.bindingsOf(domql.query('target { size = it.size }', { target: configuration })).readValue('target');

            configuration.steps.push(3);

            expect(bound).toEqual({ modifier: 'shift', steps: [1, 2], wrap: true });
            expect(Object.isFrozen(bound) && Object.isFrozen(bound.steps)).toBe(true);
        });

        it('binds a node as itself, never copied or frozen, within data as well', () => {
            const panel = document.createElement('div');
            const bindings = DomqlQuery.bindingsOf(domql.query('target', { target: panel, list: [panel] }));

            expect(bindings.readValue('target')).toBe(panel);
            expect(bindings.readValue('list')[0]).toBe(panel);
            expect(Object.isFrozen(panel)).toBe(false);
        });

        it.each([
            ['a name that is no name', { '2panel': 1 }, 'NEXO2033'],
            ['a name with a hyphen at its end', { 'panel-': 1 }, 'NEXO2033'],
            ['a function', { panel: () => {} }, 'NEXO2034'],
            ['an object that is no plain data', { panel: new Date() }, 'NEXO2034'],
            ['a number that is not finite', { panel: Number.POSITIVE_INFINITY }, 'NEXO2034'],
        ])('rejects %s', (_, bindings, code) => {
            expect(getError(() => domql.query('target { size = it.size }', bindings))).toMatchObject({ kind: 'structure', code });
        });

        it.each([
            ['a list', []],
            ['a map, whose entries are no properties', new Map([['target', 1]])],
        ])('rejects bindings given as %s', (_, bindings) => {
            expect(getError(() => domql.query('target { size = it.size }', bindings))).toMatchObject({ kind: 'structure', code: 'NEXO2020' });
        });
    });
});

describe('domql evaluates', () => {
    let panel;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel"><i></i><i></i><i></i></div>';
        panel = document.getElementById('panel');
    });

    describe('a query made from its text', () => {
        it('is evaluated in the window its options give, and in the environment\'s by default', () => {
            expect(domql.query('Domql.window.devicePixelRatio').evaluate({ window: { document, devicePixelRatio: 3, get window() { return this; } } })).toBe(3);
            expect(domql.query('Domql.window.devicePixelRatio').evaluate()).toBe(window.devicePixelRatio);
        });

        it('is made through the cache of parsed texts', () => {
            const text = 'panel.children.count';
            const parse = vi.spyOn(ParsedTexts, 'parse');

            try {
                const query = domql.query(text, { panel });

                expect(parse).toHaveBeenCalledWith(text, [{ module: 'Domql' }]);
                expect(parse.mock.results[0].value).toBe(query.definition);
            } finally {
                parse.mockRestore();
            }
        });

        it('fails as parsing fails, and refuses bindings that are null', () => {
            expect(getError(() => domql.query('panel {', { panel }))).toMatchObject({ kind: 'syntax', code: 'NEXO1051' });
            expect(getError(() => domql.query('Domql.window.size', null))).toMatchObject({ kind: 'structure', code: 'NEXO2020' });
        });

        it('is evaluated once waiting, and watched, as a query is', async () => {
            expect(await domql.query('panel.children.count', { panel }).evaluateAsync()).toBe(3);

            const counts = [];
            const watch = domql.query('panel.children.count', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', (_sender, args) => counts.push(args.value));
            await watch.refreshAsync();
            watch.dispose();

            expect(counts).toEqual([3]);
        });

        it('is resolved with its options', () => {
            expect(domql.query('Domql.window.size').resolve().type.toString()).toBe('Size');
            expect(getError(() => domql.query('panel.matches(":hover")', { panel }).resolve({ watch: true }))).toMatchObject({ kind: 'validation', code: 'DOMQL3003' });
            expect(domql.query('panel.matches(":hover")', { panel }).resolve({ watch: true, acceptPartialObservation: true }).kind).toBe('value');
        });
    });

    describe('a request of another kind', () => {
        const subscription = () => domql.query('panel.on("click") { button = it.button }', { panel });

        it('is refused with a validation error by the operation that does not carry it out, saying what the request does and the operations it takes', () => {
            expect(getError(() => subscription().evaluate())).toMatchObject({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot evaluate 'panel.on(\"click\") { button = it.button }': it listens to events.\nUse subscribe()."), location: { pointer: '/expression', line: 1 } });
            expect(getError(() => subscription().watch())).toMatchObject({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot watch 'panel.on(\"click\") { button = it.button }': it listens to events.\nUse subscribe().") });
            expect(getError(() => domql.query('panel.children.count', { panel }).subscribe(() => {}))).toMatchObject({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot subscribe to 'panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") });
        });

        it('is refused by a waiting evaluation, which rejects with the validation error', async () => {
            await expect(subscription().evaluateAsync()).rejects.toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot evaluate 'panel.on(\"click\") { button = it.button }': it listens to events.") }));
        });

        it('is refused after resolution and before anything needs a window', () => {
            expect(getError(() => subscription().evaluate({ window: null }))).toMatchObject({ kind: 'validation', code: 'DOMQL3004' });
            expect(getError(() => domql.query('panel.nonsense', { panel }).evaluate({ window: null }))).toMatchObject({ kind: 'validation', code: 'NEXO3001' });
        });
    });

    describe('the environment', () => {
        it('is reported when there is no browser window', () => {
            const query = domql.query('Domql.window.devicePixelRatio');
            const error = getError(() => query.evaluate({ window: null }));

            expect(error).toBeInstanceOf(NexoError);
            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('DOMQL5002');
            expect(error.message).toContain('without a browser window');
            expect(getError(() => query.evaluate({ window: {} }))).toMatchObject({ kind: 'evaluation', code: 'DOMQL5002' });
        });

        it('leaves parsing and resolving to work without one', () => {
            expect(domql.query('Domql.window.size').resolve().type.toString()).toBe('Size');
        });
    });

    describe('resolution', () => {
        it('answers the declared fields alone, frozen, so the resolution Nexo gave and its evaluator stay unreachable', () => {
            const resolved = domql.query('panel.size', { panel }).resolve();

            expect(Object.keys(resolved).sort()).toEqual(['definition', 'executionMode', 'getLocation', 'kind', 'type', 'typeAt', 'usedDeclarations']);
            expect([resolved.kind, resolved.executionMode]).toEqual(['value', null]);
            expect(Object.isFrozen(resolved)).toBe(true);
            expect('createEvaluator' in resolved).toBe(false);
            expect(resolved.type).toBe('Size?');
            expect(resolved.typeAt(['width'])).toBe('Number?');
            expect(resolved.getLocation('/expression')).toMatchObject({ pointer: '/expression', line: 1 });
            expect(resolved.usedDeclarations.map(used => [used.name, used.qualifiedName])).toEqual([['size', 'Element.size']]);
            expect(Object.values(resolved).some(value => value !== null && typeof value === 'object' && 'createEvaluator' in value)).toBe(false);
        });

        it('is kept for a query and used by every evaluation of it', () => {
            const query = domql.query('panel.children.count', { panel });

            expect(query.resolve()).toBe(query.resolve());
            expect(query.evaluate()).toBe(3);

            panel.append(document.createElement('i'));

            expect(query.evaluate()).toBe(4);
        });

        it('is the same whatever the options, the policy of a watch checked against it each time, and made again for bindings of other types or other selecting values', () => {
            const query = domql.query('panel?.size', { panel });
            const before = query.resolve();

            expect(query.resolve({ watch: true, acceptPartialObservation: true })).toBe(before);
            expect(query.resolve({ watch: true })).toBe(before);
            expect(() => domql.query('panel.rect', { panel }).resolve({ watch: true })).toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3003', message: expect.stringContaining('accepts partial observation') }));
            expect(domql.query('panel?.size', { panel: null }).resolve()).not.toBe(before);
            expect(domql.query('panel.on(type) { button = it.button }', { panel, type: 'click' }).resolve()).not.toBe(domql.query('panel.on(type) { button = it.button }', { panel, type: 'pointerdown' }).resolve());
        });

        it('is shared by the queries of one definition whose bindings have the same types', () => {
            const other = document.createElement('div');

            expect(domql.query('panel.size', { panel: other }).resolve()).toBe(domql.query('panel.size', { panel }).resolve());
        });

        it('evaluates each query that shares it against its own bindings, interleaved, its locals and branches its own', () => {
            const text = 'panel { let id = it["id"], id = id, kind = if id == "first" then "one" else "other" end, count = it.children.count }';
            const first = document.createElement('div');
            const second = document.createElement('div');

            first.id = 'first';
            second.id = 'second';
            second.append(document.createElement('i'));

            const queries = [domql.query(text, { panel: first }), domql.query(text, { panel: second })];

            expect(queries[0].resolve()).toBe(queries[1].resolve());
            expect([0, 1, 0, 1].map(index => queries[index].evaluate())).toEqual([
                { id: 'first', kind: 'one', count: 0 },
                { id: 'second', kind: 'other', count: 1 },
                { id: 'first', kind: 'one', count: 0 },
                { id: 'second', kind: 'other', count: 1 },
            ]);
        });

        it('is not kept for a query that fails to resolve', () => {
            const query = domql.query('panel.nonsense', { panel });

            expect(getError(() => query.resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3001' });
            expect(getError(() => query.resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3001' });
        });
    });
});

describe('domql modules', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
    });

    /** A module of the name given, extending DOMQL's elements with a property of its name in lower case. */
    const module = name => isolated.createModule(name, {
        types: [elementExtension(`${name}Elements`, [{ name: name.toLowerCase(), kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 7 }])],
    });

    describe('a query evaluated again', () => {
        it('reads the document as it is each time, in the window each evaluation gives', () => {
            document.body.innerHTML = '<div id="panel"><i></i></div>';

            const panel = document.getElementById('panel');
            const count = isolated.query('{ count = panel.children.count, ratio = Domql.window.devicePixelRatio }', { panel });
            const other = { document, devicePixelRatio: 3, get window() { return this; } };

            expect(count.evaluate()).toEqual({ count: 1, ratio: window.devicePixelRatio });

            panel.append(document.createElement('i'));

            expect(count.evaluate()).toEqual({ count: 2, ratio: window.devicePixelRatio });
            expect(count.evaluate({ window: other })).toEqual({ count: 2, ratio: 3 });
            expect(count.evaluate()).toEqual({ count: 2, ratio: window.devicePixelRatio });
        });

        it('is evaluated anew by a member its evaluation reads that evaluates it again, each evaluation reading for itself', () => {
            document.body.innerHTML = '<div id="panel" data-depth="2"></div>';

            const panel = document.getElementById('panel');
            let query = null;

            isolated.registerModule(isolated.createModule('Nested', {
                types: [elementExtension('NestedElements', [{
                    name: 'nested', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' },
                    impl: ({ receiver }) => {
                        const depth = Number(receiver.getAttribute('data-depth'));

                        if (depth === 0) {
                            return 0;
                        }

                        receiver.setAttribute('data-depth', String(depth - 1));

                        return query.evaluate().inner + 1;
                    },
                }])],
            }));

            query = isolated.query('import Nested\n{ outer = panel.attribute["data-depth"], inner = panel:nested, after = panel.attribute["data-depth"] }', { panel });

            expect(query.evaluate()).toEqual({ outer: '2', inner: 2, after: '0' });

            panel.setAttribute('data-depth', '1');

            expect(query.evaluate()).toEqual({ outer: '1', inner: 1, after: '0' });
        });

        it('is evaluated through a current resolution once a registration made its own stale', () => {
            document.body.innerHTML = '<div id="panel" data-n="1"></div>';

            const panel = document.getElementById('panel');

            // A member answering a value of Any, which a typeOf registered later may recognize, so a resolution reading it goes stale.
            isolated.registerModule(isolated.createModule('Bag', {
                types: [elementExtension('BagElements', [{ name: 'bag', kind: 'property', result: 'Any', updates: { changes: 'constant', reads: 'fresh' }, impl: ({ receiver }) => receiver.getAttribute('data-n') }])],
            }));

            const query = isolated.query('import Bag\n{ n = panel:bag, count = panel.children.count }', { panel });
            const before = query.resolve();

            expect(query.evaluate()).toEqual({ n: '1', count: 0 });

            isolated.registerModule(isolated.createModule('Gadgets', { typeOf: () => null, types: [{ name: 'Gadget', kind: 'reference', isInstance: () => false }] }));
            panel.setAttribute('data-n', '2');

            expect(query.evaluate()).toEqual({ n: '2', count: 0 });
            expect(query.resolve()).not.toBe(before);
            expect(query.evaluate()).toEqual({ n: '2', count: 0 });
        });
    });

    describe('an observation type that is not shared', () => {
        /** Registers `Level`, whose `level` is a member maintained by an observation that is not shared; each observation it starts is recorded, its sample given by `deliver`. */
        const registerLevel = () => {
            const observations = [];

            isolated.registerModule(isolated.createModule('Level', {
                observationTypes: [{
                    name: 'level', contract: 'maintained', shared: false,
                    impl: ({ notify }) => {
                        const observation = { sample: { pending: true, value: null }, isStopped: false, deliver: value => {
                            observation.sample = { pending: false, value };
                            notify();
                        } };

                        observations.push(observation);

                        return { stop: () => { observation.isStopped = true; }, sample: () => observation.sample };
                    },
                }],
                types: [elementExtension('LevelElements', [{
                    name: 'level', kind: 'property', result: 'Number?',
                    updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] },
                    impl: ({ samples: [sample] }) => sample,
                }])],
            }));

            return observations;
        };

        const settle = () => new Promise(resolve => setTimeout(resolve));

        it('gives a wait the sample its observation delivers, from one observation that stops once the wait settles', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const answer = isolated.query('import Level\npanel:level', { panel }).evaluateAsync();

            await settle();
            observations[0].deliver(7);

            await expect(answer).resolves.toBe(7);
            expect(observations.length).toBe(1);
            expect(observations[0].isStopped).toBe(true);
        });

        it('keeps one observation for a watch across its evaluations, and stops it when the watch ends', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const watch = isolated.query('import Level\npanel:level', { panel }).watch({ schedule: 'immediate' });

            await settle();
            observations[0].deliver(3);

            await expect(watch.readyAsync()).resolves.toBe(3);

            await watch.refreshAsync();
            await watch.refreshAsync();

            expect(watch.snapshot).toBe(3);
            expect(observations.length).toBe(1);

            watch.dispose();

            expect(observations[0].isStopped).toBe(true);
        });

        it('gives each watch an observation of its own, which ends with that watch alone', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const first = isolated.query('import Level\npanel:level', { panel }).watch({ schedule: 'immediate' });
            const second = isolated.query('import Level\npanel:level', { panel }).watch({ schedule: 'immediate' });

            await settle();
            observations[0].deliver(1);
            observations[1].deliver(2);

            expect(observations.length).toBe(2);
            expect([await first.readyAsync(), await second.readyAsync()].sort()).toEqual([1, 2]);

            first.dispose();

            expect(observations.filter(observation => observation.isStopped).length).toBe(1);

            await second.refreshAsync();

            expect(observations.length).toBe(2);

            second.dispose();

            expect(observations.every(observation => observation.isStopped)).toBe(true);
        });

        it('lets an event listener read, at a later event, the sample its observation delivered after an earlier one', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const values = [];

            document.body.append(panel);

            const listener = isolated.query('import Level\npanel.on("input") { level = panel:level }', { panel }).subscribe((_sender, args) => values.push(args.value));

            panel.dispatchEvent(new window.Event('input'));
            observations[0].deliver(5);
            panel.dispatchEvent(new window.Event('input'));
            listener.dispose();
            panel.remove();

            expect(values).toEqual([{ level: null }, { level: 5 }]);
            expect(observations.length).toBe(1);
            expect(observations[0].isStopped).toBe(true);
        });
    });

    describe('a sample a maintained observation answers', () => {
        /** Registers `Level`, whose `level` is maintained by an observation whose samples `samples` gives, one at each read. */
        const registerLevel = samples => {
            isolated.registerModule(isolated.createModule('Level', {
                observationTypes: [{
                    name: 'level', contract: 'maintained',
                    impl: ({ notify }) => {
                        queueMicrotask(notify);

                        return { stop: () => {}, sample: () => samples.shift() ?? { pending: false, value: 9 } };
                    },
                }],
                types: [elementExtension('LevelElements', [{
                    name: 'level', kind: 'property', result: 'Number?',
                    updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] },
                    impl: ({ samples: [value] }) => value,
                }])],
            }));
        };

        it('is pending with no value, and has a value once it is not', async () => {
            registerLevel([{ pending: true }]);

            await expect(isolated.query('import Level\npanel:level', { panel: document.createElement('div') }).evaluateAsync()).resolves.toBe(9);
        });

        it('fails the evaluation, naming its observation type, where it is no { pending, value }', async () => {
            registerLevel([4]);

            await expect(isolated.query('import Level\npanel:level', { panel: document.createElement('div') }).evaluateAsync()).rejects.toThrow(expect.objectContaining({ code: 'NEXO5009', cause: expect.objectContaining({ code: 'DOMQL5013' }), message: expect.stringContaining("The observation type 'level' answered the sample 4, which is no { pending, value }") }));
        });

        it('fails the evaluation where it is not pending and holds no value', async () => {
            registerLevel([{ pending: false }]);

            await expect(isolated.query('import Level\npanel:level', { panel: document.createElement('div') }).evaluateAsync()).rejects.toThrow(expect.objectContaining({ code: 'NEXO5009', cause: expect.objectContaining({ code: 'DOMQL5013' }), message: expect.stringContaining('which is no { pending, value } with a value once it is not pending') }));
        });
    });

    describe('a structure a member answers', () => {
        /** Registers `Couples`, whose `couple` is a member of elements answering what `answer` gives, and the types it is declared with. */
        const registerCouple = (answer, result = 'Couple') => {
            isolated.registerModule(isolated.createModule('Couples', {
                types: [
                    structuredType('Couple', { a: 'Number', b: 'Number' }),
                    structuredType('Span', { from: 'Couple', to: 'Couple?', marks: 'List<Couple>' }),
                    structuredType('Link', { value: 'Number', next: 'Link?' }),
                    elementExtension('CoupleElements', [{ name: 'couple', kind: 'property', result, updates: { changes: 'constant', reads: 'fresh' }, impl: answer }]),
                ],
            }));
        };

        const panel = document.createElement('div');

        it('is copied by its declared fields alone, a field it holds beside them left out', () => {
            registerCouple(() => ({ a: 1, b: 2, cache: { rows: [1, 2, 3] } }));

            expect(isolated.query('import Couples\npanel:couple', { panel }).evaluate()).toEqual({ a: 1, b: 2 });
        });

        it('reads its declared fields as an instance of a class offers them, through getters', () => {
            class Couple {
                get a() { return 1; }

                get b() { return 2; }
            }

            registerCouple(() => new Couple());

            expect(isolated.query('import Couples\npanel:couple', { panel }).evaluate()).toEqual({ a: 1, b: 2 });
            expect(isolated.query('import Couples\npanel:couple { sum = it.a }', { panel }).evaluate()).toEqual({ sum: 1 });
        });

        it('is copied as its declared shape at every depth, in its fields and in the items of a list', () => {
            registerCouple(() => ({ from: { a: 1, b: 2, x: 0 }, to: null, marks: [{ a: 3, b: 4, y: 0 }] }), 'Span');

            expect(isolated.query('import Couples\npanel:couple', { panel }).evaluate()).toEqual({ from: { a: 1, b: 2 }, to: null, marks: [{ a: 3, b: 4 }] });
        });

        it('holds its own type as deep as its value goes', () => {
            registerCouple(() => ({ value: 1, next: { value: 2, next: null, extra: true } }), 'Link');

            expect(isolated.query('import Couples\npanel:couple', { panel }).evaluate()).toEqual({ value: 1, next: { value: 2, next: null } });
        });

        it('still fails where a declared field is missing or of another type', () => {
            registerCouple(() => ({ a: 1 }));

            expect(getError(() => isolated.query('import Couples\npanel:couple', { panel }).evaluate()).message).toContain("The member 'couple' answered {\"a\":1}, and it declares Couple");
        });
    });

    it('copy a once execution\'s structured result by its declared fields', async () => {
        isolated.registerModule(isolated.createModule('Measure', {
            types: [
                structuredType('Measurement', { width: 'Number' }),
                elementExtension('MeasureElements', [{ name: 'measure', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Measurement', impl: async () => ({ width: 5, raw: { internal: true } }) }]),
            ],
        }));

        await expect(isolated.query('import Measure\npanel:measure()', { panel: document.createElement('div') }).executeAsync()).resolves.toEqual({ width: 5 });
    });

    it('name a promise and an instance of a class that a member answers for a type that admits neither', () => {
        class Reading {}

        const constant = (name, impl) => isolated.createModule(name, {
            types: [elementExtension(`${name}Elements`, [{ name: name.toLowerCase(), kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl }])],
        });

        isolated.registerModule(constant('Reading', () => new Reading()));
        isolated.registerModule(constant('Later', () => Promise.resolve(1)));

        const panel = document.createElement('div');

        expect(getError(() => isolated.query('import Reading\npanel:reading', { panel }).evaluate()).message).toContain("The member 'reading' answered an instance of Reading, and it declares Number");
        expect(getError(() => isolated.query('import Later\npanel:later', { panel }).evaluate()).message).toContain("The member 'later' answered a promise, and it declares Number");
    });

    it('take the one parameter of an options input as the field of an object', () => {
        isolated.registerModule(isolated.createModule('Zoom', {
            types: [elementExtension('ZoomElements', [{ name: 'zoom', kind: 'function', arguments: 'options', parameters: [{ name: 'factor', kind: 'value', type: 'Number', required: true, fixed: false, nulls: 'propagate' }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: ({ args }) => args.factor * 2 }])],
        }));

        const panel = document.createElement('div');

        expect(isolated.query('import Zoom\npanel:zoom({ factor = 3 })', { panel }).evaluate()).toBe(6);
        expect(getError(() => isolated.query('import Zoom\npanel:zoom(3)', { panel }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3057' });
    });

    it('fail inside an item of a list where the failing member is written', () => {
        isolated.registerModule(isolated.createModule('Weight', {
            types: [elementExtension('WeightElements', [{
                name: 'weight', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' },
                impl: ({ receiver: element }) => {
                    if (element.hasAttribute('aria-selected')) {
                        throw new Error('heavy');
                    }

                    return 1;
                },
            }])],
        }));
        document.body.innerHTML = '<div id="panel"><div data-key="a1"></div><div data-key="a2" aria-selected="true"></div></div>';

        const error = getError(() => isolated.query('import Weight\npanel.all("[data-key]") {\n    key = it["data-key"],\n    weight = it:weight\n}', { panel: document.getElementById('panel') }).evaluate());

        expect(error.kind).toBe('evaluation');
        expect(error.code).toBe('NEXO5007');
        expect(error.location).toEqual({ pointer: '/expression/objectFields/1/value', offset: 79, line: 4, column: 14 });
        document.body.innerHTML = '';
    });

    it('make the members they declare available to the queries resolved afterwards', () => {
        const element = document.createElement('div');

        expect(getError(() => isolated.query('panel:zoom', { panel: element }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3062' });

        isolated.registerModule(module('Zoom'));

        expect(isolated.query('import Zoom\npanel:zoom', { panel: element }).resolve().type.toString()).toBe('Number');
    });

    it('make their members available to a query that imports them, and to no other', () => {
        isolated.registerModule(module('Zoom'));

        expect(getError(() => isolated.query('panel:zoom', { panel: document.createElement('div') }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3005' });
    });

    it('keep the resolutions made before them while they are current, and replace one a module recognizing values may change', () => {
        const panel = document.createElement('div');
        const query = isolated.query('panel.children.count', { panel });
        const subscription = isolated.query('panel.on("focus") { tag = it.target?.matches("div") }', { panel });
        const [before, subscribed] = [query.resolve(), subscription.resolve()];

        isolated.registerModule(module('Zoom'));

        expect(query.resolve()).toBe(before);
        expect(subscription.resolve()).toBe(subscribed);

        // A focus event's target is a nullable element, which a module recognizing values may now recognize as another type.
        isolated.registerModule(isolated.createModule('Recognizer', { typeOf: () => null }));

        expect(query.resolve()).toBe(before);
        expect(subscription.resolve()).not.toBe(subscribed);
    });

    it('leave a watch and a subscription running when they are registered evaluating and delivering', async () => {
        document.body.innerHTML = '<div id="panel"><i></i></div>';

        const panel = document.getElementById('panel');
        const counts = [];
        const buttons = [];
        const watch = isolated.query('panel.children.count', { panel }).watch({ schedule: 'immediate' });
        const listener = isolated.query('panel.on("click") { button = it.button }', { panel }).subscribe((_sender, args) => buttons.push(args.value.button));

        watch.subscribe('change', (_sender, args) => counts.push(args.value));
        await watch.readyAsync();
        isolated.registerModule(module('Zoom'));
        panel.append(document.createElement('i'));
        await watch.refreshAsync();
        panel.dispatchEvent(new window.MouseEvent('click', { button: 0 }));
        watch.dispose();
        listener.dispose();
        document.body.innerHTML = '';

        expect(counts).toEqual([1, 2]);
        expect(buttons).toEqual([0]);
    });

    it('are registered once under a name', () => {
        isolated.registerModule(module('Zoom'));

        expect(getError(() => isolated.registerModule(module('Zoom')))).toMatchObject({ kind: 'module', code: 'NEXO4035' });
    });

    it('observe DOMQL\'s targets through DOMQL\'s observation types, and declare no targets of their own, which DOMQL could not resolve', () => {
        const observing = of => isolated.createModule('Framed', {
            types: [elementExtension('FramedElements', [{ name: 'framed', kind: 'property', result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of, childList: true }] }, impl: () => 7 }])],
        });
        const refused = getError(() => isolated.registerModule(isolated.createModule('Frames', { observationTargets: [{ name: 'frame' }] })));

        expect(() => isolated.registerModule(observing('root'))).not.toThrow();
        expect(refused).toMatchObject({ kind: 'module', code: 'DOMQL4008', location: { module: 'Frames', declarationKey: 'observationTargets' } });
        expect(refused.message).toContain("DOMQL resolves the observation targets its own module declares alone, and the module 'Frames' declares one of its own");
        expect(() => isolated.query('import Framed\npanel:framed', { panel: document.createElement('div') }).resolve()).not.toThrow();
    });

    it('carry out a host call only as the dispatch table of DOMQL keeps it, refusing a module domql.createModule did not make', async () => {
        const { nexo: isolatedNexo } = await import('@formaui-net/nexo');
        const module = isolatedNexo.createModule('Stray', { types: [elementExtension('StrayElements', [{ name: 'stray', kind: 'function', invokedBy: 'host', parameters: [] }])] });
        const refused = getError(() => isolated.registerModule(module));

        expect(refused).toMatchObject({ kind: 'module', code: 'DOMQL4009', location: { module: 'Stray', type: 'StrayElements', declaration: 'stray', declarationKey: 'requestKind' } });
        expect(refused.message).toContain("The module 'Stray' declares the host call 'stray' without the request it makes; create the module with domql.createModule");

        // A host call among the module's own members stands within no type, so its location names none.
        const loose = getError(() => isolated.registerModule(isolatedNexo.createModule('Loose', { members: [{ name: 'loose', kind: 'function', invokedBy: 'host', parameters: [] }] })));

        expect(loose).toMatchObject({ kind: 'module', code: 'DOMQL4009', message: expect.stringContaining("The module 'Loose' declares the host call 'loose' without the request it makes") });
        expect(loose.location).toEqual({ module: 'Loose', declaration: 'loose', declarationKey: 'requestKind' });
    });

    it('refuse to carry out a host call their module gives no impl, which is resolved against all the same, naming the type it stands within where it stands within one', async () => {
        const panel = document.createElement('div');
        const execution = { name: 'ping', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Boolean' };
        const subscription = { name: 'beats', kind: 'function', invokedBy: 'host', requestKind: 'subscription', parameters: [], result: 'Number' };
        const continuous = { name: 'glow', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous', parameters: [] };

        isolated.registerModule(isolated.createModule('Ping', { members: [execution, subscription, continuous], types: [elementExtension('PingElements', [execution, subscription, continuous])] }));

        expect(isolated.query('import Ping\npanel:ping()', { panel }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
        await expect(isolated.query('import Ping\npanel:ping()', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'module', code: 'DOMQL4010', message: expect.stringContaining("'ping' has no impl, so a request that ends in it is resolved and never carried out"), location: { module: 'Ping', type: 'PingElements', declaration: 'ping', declarationKey: 'impl' } }));
        await expect(isolated.query('import Ping\nPing.ping()').executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'module', code: 'DOMQL4010', location: { module: 'Ping', declaration: 'ping', declarationKey: 'impl' } }));
        expect(() => isolated.query('import Ping\npanel:beats()', { panel }).subscribe(() => {})).toThrow(expect.objectContaining({ kind: 'module', code: 'DOMQL4010', location: { module: 'Ping', type: 'PingElements', declaration: 'beats', declarationKey: 'impl' } }));
        expect(() => isolated.query('import Ping\nPing.beats()').subscribe(() => {})).toThrow(expect.objectContaining({ kind: 'module', code: 'DOMQL4010', location: { module: 'Ping', declaration: 'beats', declarationKey: 'impl' } }));
        expect(() => isolated.query('import Ping\npanel:glow()', { panel }).run()).toThrow(expect.objectContaining({ kind: 'module', code: 'DOMQL4010', location: { module: 'Ping', type: 'PingElements', declaration: 'glow', declarationKey: 'impl' } }));
        expect(() => isolated.query('import Ping\nPing.glow()').run()).toThrow(expect.objectContaining({ kind: 'module', code: 'DOMQL4010', location: { module: 'Ping', declaration: 'glow', declarationKey: 'impl' } }));
    });

    it('leave the registry of another copy of domql alone', () => {
        isolated.registerModule(module('Zoom'));

        expect(getError(() => domql.query('import Zoom\npanel:zoom', { panel: document.createElement('div') }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3002' });
    });
});

describe('domql instances', () => {
    // Each test loads another instance of domql beside the one imported, as an independently bundled library would.
    let other;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: other } = await import('#domql/domql.js'));

        document.body.innerHTML = '<section id="panel"><p></p><p></p></section>';
        panel = document.getElementById('panel');
    });

    it('refuse a query another instance made, saying how to reuse it', () => {
        const query = other.query('panel.children.count', { panel });
        const message = expect.stringContaining('as domql.query(query.definition, bindings)');

        expect(getError(() => domql.query(query))).toMatchObject({ kind: 'structure', code: 'DOMQL2002', message });
        expect(getError(() => domql.query(query, { panel }))).toMatchObject({ kind: 'structure', code: 'DOMQL2002', message });
        expect(getError(() => domql.query(other.query('panel.on("click") { button = it.button }', { panel })))).toMatchObject({ kind: 'structure', code: 'DOMQL2002', message });
    });

    it('reuse a query from its definition and a plain object of bindings, resolved against their own vocabulary', () => {
        other.registerModule(other.createModule('Zoom', {
            types: [elementExtension('ZoomElements', [{ name: 'zoom', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 7 }])],
        }));

        const count = other.query('panel.children.count', { panel });
        const zoom = other.query('import Zoom\npanel:zoom', { panel });

        expect(domql.query(count.definition, { panel }).evaluate()).toBe(2);
        expect(zoom.evaluate()).toBe(7);
        expect(getError(() => domql.query(zoom.definition, { panel }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3002' });
    });
});

describe('domql evaluateAsync', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;
    let gauges;
    let stuck;
    let reported;

    /** Lets the observations deliver and the evaluations that wait on them evaluate again. */
    const settle = () => new Promise(resolve => setTimeout(resolve));

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><b></b><b></b><b></b></div>';
        panel = document.getElementById('panel');
        gauges = new Map();
        stuck = new Set();
        reported = [];
        window.reportError = error => reported.push(error);

        // A member kept by an observation whose samples the test supplies, one gauge for each element; one the test marks stuck fails to stop. Beside it, a member that fails.
        isolated.registerModule(isolated.createModule('Gauge', {
            observationTypes: [
                {
                    name: 'level', contract: 'maintained',
                    impl: ({ request: { target }, notify }) => {
                        const gauge = { sample: { pending: true, value: null }, started: 0, stopped: 0, notify };

                        gauges.set(target, gauge);
                        gauge.started++;

                        const stop = () => {
                            gauge.stopped++;

                            if (stuck.has(target)) {
                                throw new Error('stuck');
                            }
                        };

                        return { stop, sample: () => gauge.sample };
                    },
                },
            ],
            types: [
                elementExtension('GaugeElements', [
                    {
                        name: 'level', kind: 'property', result: 'Number?',
                        updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] },
                        impl: ({ samples: [sample] }) => sample,
                    },
                    { name: 'boom', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => { throw new Error('no'); } },
                ]),
            ],
        }));
    });

    /** Gives the gauge of the element its first or next sample. */
    const sample = (element, value) => {
        const gauge = gauges.get(element);

        gauge.sample = { pending: false, value };
        gauge.notify();
    };

    it('answers what evaluate answers for a query that reads nothing maintained', async () => {
        const query = isolated.query('panel { count = it.children.count, id = it["id"] }', { panel });

        expect(await query.evaluateAsync()).toEqual(query.evaluate());
        expect(Object.isFrozen(await query.evaluateAsync())).toBe(true);
    });

    it('waits for the first sample of a maintained member, and evaluate does not', async () => {
        const query = isolated.query('import Gauge\nitem:level', { item: panel.children[0] });
        let answer;

        expect(getError(() => query.evaluate()).message).toContain("The member 'level' is maintained by an observation");

        const evaluation = query.evaluateAsync().then(value => { answer = value; });

        await settle();

        expect(answer).toBeUndefined();

        sample(panel.children[0], 7);
        await evaluation;

        expect(answer).toBe(7);
    });

    it('evaluates again for a maintained member that a later evaluation introduces', async () => {
        const [first, second, third] = panel.children;
        const query = isolated.query('import Gauge\npanel.children[first:level]?:level', { panel, first });
        let answer;

        const evaluation = query.evaluateAsync().then(value => { answer = value; });

        await settle();
        sample(first, 2);
        await settle();

        // The sample picked the third child, whose gauge the answer waits for in turn.
        expect(answer).toBeUndefined();
        expect(gauges.has(third)).toBe(true);
        expect(gauges.has(second)).toBe(false);

        sample(third, 9);
        await evaluation;

        expect(answer).toBe(9);
    });

    it('lets go of every observation it started when it answers', async () => {
        const query = isolated.query('import Gauge\n{ a = a:level, b = b:level }', { a: panel.children[0], b: panel.children[1] });
        const evaluation = query.evaluateAsync();

        await settle();
        sample(panel.children[0], 1);
        sample(panel.children[1], 2);

        expect(await evaluation).toEqual({ a: 1, b: 2 });
        expect([...gauges.values()].map(gauge => [gauge.started, gauge.stopped])).toEqual([[1, 1], [1, 1]]);
    });

    it('is canceled by its signal, fails with its reason and lets go of what it started', async () => {
        const controller = new AbortController();
        const evaluation = isolated.query('import Gauge\nitem:level', { item: panel.children[0] }).evaluateAsync({ signal: controller.signal });
        const failure = evaluation.catch(error => error);

        await settle();
        controller.abort(new Error('not needed'));

        expect((await failure).message).toBe('not needed');
        expect(gauges.get(panel.children[0]).stopped).toBe(1);
    });

    it('fails at once for a signal that is already aborted, starting nothing', async () => {
        const controller = new AbortController();

        controller.abort();

        await expect(isolated.query('import Gauge\nitem:level', { item: panel.children[0] }).evaluateAsync({ signal: controller.signal })).rejects.toThrow();
        expect(gauges.size).toBe(0);
    });

    it('fails with the error of an evaluation and lets go of what it started', async () => {
        const item = panel.children[0];
        const failure = isolated.query('import Gauge\n{ a = item:level, b = item:boom }', { item }).evaluateAsync().catch(error => error);

        await settle();
        sample(item, 1);

        const error = await failure;

        expect(error.name).toBe('NexoError');
        expect(error.code).toBe('NEXO5007');
        expect(error.message).toContain("The member 'boom' failed");
        expect(gauges.get(item).stopped).toBe(1);
    });

    it('fails without a browser window', async () => {
        const error = await isolated.query('Domql.window.devicePixelRatio').evaluateAsync({ window: null }).catch(failure => failure);

        expect(error.name).toBe('NexoError');
        expect(error.kind).toBe('evaluation');
        expect(error.code).toBe('DOMQL5002');
    });

    describe('cleanup that fails', () => {
        it('is reported, and keeps the result of an evaluation that succeeded', async () => {
            const [first, second] = panel.children;
            const evaluation = isolated.query('import Gauge\n{ a = a:level, b = b:level }', { a: first, b: second }).evaluateAsync();

            stuck.add(first);
            await settle();
            sample(first, 1);
            sample(second, 2);

            expect(await evaluation).toEqual({ a: 1, b: 2 });
            expect(gauges.get(second).stopped).toBe(1);
            expect(reported.map(error => error.message)).toEqual(['stuck']);
        });

        it('is reported, and leaves the evaluation failing with its error', async () => {
            const item = panel.children[0];
            const failure = isolated.query('import Gauge\n{ a = item:level, b = item:boom }', { item }).evaluateAsync().catch(error => error);

            stuck.add(item);
            await settle();
            sample(item, 1);

            expect((await failure).message).toContain("The member 'boom' failed");
            expect(reported.map(error => error.message)).toEqual(['stuck']);
        });

        it("is reported, and leaves a canceled evaluation failing with the signal's reason", async () => {
            const controller = new AbortController();
            const item = panel.children[0];
            const failure = isolated.query('import Gauge\nitem:level', { item }).evaluateAsync({ signal: controller.signal }).catch(error => error);

            stuck.add(item);
            await settle();
            controller.abort(new Error('not needed'));

            expect((await failure).message).toBe('not needed');
            expect(reported.map(error => error.message)).toEqual(['stuck']);
        });
    });
});

describe('domql executeAsync', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;
    let reported;
    let runs;
    let pending;

    /** A once execution of elements, named as given, carried out by the function. */
    const execution = (name, impl, { parameters = [], result = 'Boolean' } = {}) => ({ name, kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', ...(parameters.length === 0 ? {} : { arguments: 'positional' }), parameters, result, impl });

    const label = [{ name: 'label', kind: 'value', type: 'String', required: true, nulls: 'propagate' }];

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><b id="first"></b></div>';
        panel = document.getElementById('panel');
        reported = [];
        runs = [];
        pending = null;
        window.reportError = error => reported.push(error);

        isolated.registerModule(isolated.createModule('Executions', {
            types: [elementExtension('ExecutionElements', [
                // Marks its element and answers whether the mark changed.
                execution('mark', ({ receiver: element, args: { label }, signal }) => {
                    runs.push({ element, label, signal });

                    const changed = element.dataset.mark !== label;

                    element.dataset.mark = label;

                    return changed;
                }, { parameters: label }),

                // Answers a promise the test settles, after marking its element as started.
                execution('slow', ({ receiver: element, signal }) => {
                    element.dataset.state = 'started';
                    runs.push({ element, signal });

                    return new Promise((resolve, reject) => { pending = { resolve, reject }; });
                }),

                execution('pick', ({ receiver: element }) => element.firstElementChild, { result: 'Domql.Element?' }),
                execution('broken', ({ receiver: element }) => {
                    element.dataset.state = 'half';

                    throw new Error('jammed');
                }),
                execution('wrong', () => 'yes'),
            ])],
        }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('executes a once execution and answers its result', async () => {
        expect(await isolated.query('import Executions\npanel:mark(label)', { panel, label: 'seen' }).executeAsync()).toBe(true);
        expect(await isolated.query('import Executions\npanel:mark("seen")', { panel }).executeAsync()).toBe(false);
        expect(panel.dataset.mark).toBe('seen');
        expect(runs.map(run => run.label)).toEqual(['seen', 'seen']);
    });

    it('waits for a result the execution promises, and gives the execution a signal even where the caller gave none', async () => {
        const running = isolated.query('import Executions\npanel:slow()', { panel }).executeAsync();

        await Promise.resolve();
        pending.resolve(true);

        expect(await running).toBe(true);
        expect(runs[0].signal).toBeInstanceOf(AbortSignal);
        expect(runs[0].signal.aborted).toBe(false);
    });

    it('shapes the result by the object expression that follows the execution, as immutable data', async () => {
        const result = await isolated.query('import Executions\npanel:pick() { id = it["id"] }', { panel }).executeAsync();

        expect(result).toEqual({ id: 'first' });
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('executes nothing where the receiver is null, and answers null', async () => {
        expect(await isolated.query('import Executions\nitem?:mark("seen")', { item: null }).executeAsync()).toBeNull();
        expect(runs).toEqual([]);
    });

    it('rejects a result of another type than the execution declares, naming it', async () => {
        await expect(isolated.query('import Executions\npanel:wrong()', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', code: 'NEXO5015', message: expect.stringContaining("The host call 'wrong' supplied \"yes\", and it declares Boolean") }));
    });

    it('rejects a failure of the execution with what it threw as the cause, and leaves what it changed', async () => {
        const error = await isolated.query('import Executions\npanel:broken()', { panel }).executeAsync().catch(failure => failure);

        expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', message: expect.stringContaining("The execution 'broken' failed: jammed") });
        expect(error.location).toEqual({ pointer: '/expression', offset: 18, line: 2, column: 1 });
        expect(error.cause.message).toBe('jammed');
        expect(panel.dataset.state).toBe('half');
        expect(reported).toEqual([]);
    });

    it('rejects a failure the execution promises, whatever it is', async () => {
        const running = isolated.query('import Executions\npanel:slow()', { panel }).executeAsync().catch(failure => failure);

        await Promise.resolve();
        pending.reject(null);

        const error = await running;

        expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', message: expect.stringContaining("The execution 'slow' failed: null") });
        expect(error.location).toEqual({ pointer: '/expression', offset: 18, line: 2, column: 1 });
        expect(error.cause).toBeNull();
    });

    it('rejects with the reason of a signal already aborted, and executes nothing', async () => {
        const controller = new AbortController();

        controller.abort(new Error('not now'));

        await expect(isolated.query('import Executions\npanel:mark("seen")', { panel }).executeAsync({ signal: controller.signal })).rejects.toThrow('not now');
        expect(runs).toEqual([]);
    });

    it('rejects at once with the reason of a signal that aborts while the execution runs, which learns of it, and discards its result', async () => {
        const controller = new AbortController();
        const running = isolated.query('import Executions\npanel:slow()', { panel }).executeAsync({ signal: controller.signal }).catch(failure => failure);

        await Promise.resolve();
        controller.abort(new Error('stop'));

        expect((await running).message).toBe('stop');
        expect(runs[0].signal.aborted).toBe(true);
        expect(panel.dataset.state).toBe('started');

        pending.resolve(true);
        await Promise.resolve();

        expect(reported).toEqual([]);
    });

    it('reports a failure that arrives after the execution was canceled, since no caller waits for it', async () => {
        const controller = new AbortController();
        const running = isolated.query('import Executions\npanel:slow()', { panel }).executeAsync({ signal: controller.signal }).catch(failure => failure);

        await Promise.resolve();
        controller.abort(new Error('stop'));
        await running;
        pending.reject(new Error('late'));
        await new Promise(resolve => setTimeout(resolve));

        expect(reported).toHaveLength(1);
        expect(reported[0]).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', message: expect.stringContaining("The execution 'slow' failed: late") });
        expect(reported[0].location).toEqual({ pointer: '/expression', offset: 18, line: 2, column: 1 });
    });

    it('is refused for a request of another kind, and a request of a once execution is refused by the other operations', async () => {
        await expect(isolated.query('panel.children.count', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot execute 'panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") }));
        expect(getError(() => isolated.query('import Executions\npanel:mark("seen")', { panel }).evaluate())).toMatchObject({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot evaluate 'import Executions\npanel:mark(\"seen\")': it executes an effect once.\nUse executeAsync().") });
        expect(runs).toEqual([]);
    });

    it('rejects where its receiver or arguments cannot be evaluated, and executes nothing', async () => {
        await expect(isolated.query('import Executions\npanel.first("[")?:mark("seen")', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', code: 'NEXO5007', message: expect.stringContaining("The member 'first' failed") }));
        expect(runs).toEqual([]);
    });
});

describe('domql receivers of unknown type', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><b></b></div>';
        panel = document.getElementById('panel');
    });

    it('answer null for an optional access of a null binding, of the result its declarations share made nullable', () => {
        expect(isolated.query('panel?.size', { panel: null }).evaluate()).toBeNull();
        expect(isolated.query('panel?.size', { panel: null }).resolve().type.toString()).toBe('Size?');
        expect(isolated.query('panel?.children.count', { panel: null }).resolve().type.toString()).toBe('Number?');
    });

    it('answer null for an object expression following a null binding, its fields resolved against no value', () => {
        expect(isolated.query('{ panel = panel { size = it.size, key = it["data-key"] }, ids = ids }', { panel: null, ids: [] }).evaluate()).toEqual({ panel: null, ids: [] });
        expect(isolated.query('panel { size = it.size }', { panel: null }).resolve().type.toString()).toBe('{ size: Size? }?');
    });

    it.each([
        ['a call no declaration has', 'panel?.sise()', 'no member of the vocabulary', 'NEXO3001'],
        ['a name in a form none of its declarations takes', 'panel?.size()', 'is a property', 'NEXO3017'],
        ['an argument none of its declarations takes', 'panel?.style[5]', "expects String and finds Number", 'NEXO3042'],
        ['a misspelled call in the object expression that follows', 'panel { size = it.sise() }', 'no member of the vocabulary', 'NEXO3001'],
    ])('refuse %s', (_, text, message, code) => {
        const error = getError(() => isolated.query(text, { panel: null }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it('read a Boolean member of a null binding as null, as any computed property access of one is', () => {
        expect(isolated.query('panel?.attached', { panel: null }).evaluate()).toBeNull();
        expect(isolated.query('panel?.[name]', { panel: null, name: 'size' }).evaluate()).toBeNull();
        expect(isolated.query('row?["id"]', { row: null }).evaluate()).toBeNull();
    });

    it('accept a member of the items of an empty list where a value is tested, any value of the items it has being truthy or falsey', () => {
        const rows = isolated.query('rows { done = not it.complete }', { rows: [] });

        expect(rows.evaluate()).toEqual([]);
        expect(isolated.query(rows.definition, { rows: [{ complete: true }] }).evaluate()).toEqual([{ done: false }]);
        expect(isolated.query(rows.definition, { rows: [{ complete: 'yes' }, { complete: null }] }).evaluate()).toEqual([{ done: false }, { done: true }]);
        expect(isolated.query('not off', { off: null }).evaluate()).toBe(true);
    });

    it('type a member of the items of an empty list as its declarations share it, unchanged, as a list of known items does', () => {
        const panel = document.createElement('div');

        const rows = isolated.query('rows { c = it.children.count }', { rows: [] });

        expect(rows.resolve().type.toString()).toBe('List<{ c: Number }>');
        expect(isolated.query(rows.definition, { rows: [panel] }).evaluate()).toEqual([{ c: 0 }]);
        expect(isolated.query('rows { w = it.rect?.width }', { rows: [] }).resolve().type.toString()).toBe('List<{ w: Number? }>');
        expect(getError(() => isolated.query('rows { c = it.children.sise }', { rows: [] }).resolve()).message).toContain("'sise' is no member of the vocabulary");
        expect(isolated.query('panel.children { c = it.children.count }', { panel }).resolve().type.toString()).toBe('List<{ c: Number }>');
    });

    it('accept any property of data that has not arrived, the empty rows projected to the empty list', () => {
        const rows = isolated.query('rows { id = it.id }', { rows: [] });

        expect(rows.evaluate()).toEqual([]);
        expect(isolated.query(rows.definition, { rows: [{ id: 'a' }] }).evaluate()).toEqual([{ id: 'a' }]);
        expect(isolated.query('row?.id', { row: null }).evaluate()).toBeNull();
        expect(isolated.query('row { id = it.id }', { row: null }).evaluate()).toBeNull();
    });

    it('check a property once the type of its receiver is known, a nullable one included', () => {
        const row = isolated.query('row?.id', { row: null });
        const panel = isolated.query('panel?.sise', { panel: null });

        expect(row.evaluate()).toBeNull();
        expect(getError(() => isolated.query(row.definition, { row: { key: 'a' } }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3001' });
        expect(panel.evaluate()).toBeNull();
        expect(getError(() => isolated.query(panel.definition, { panel: document.getElementById('panel') }).resolve()).message).toContain('sise');
        expect(getError(() => isolated.query('panel.parent?.sise', { panel: document.getElementById('panel') }).resolve()).message).toContain('sise');
    });

    it('keep the request kind of the name, so a subscription of a null binding listens to nothing and is refused an evaluation', () => {
        const text = 'panel?.on("click") { button = it.button }';
        const results = [];
        const listener = isolated.query(text, { panel: null }).subscribe((_sender, args) => results.push(args));

        panel.dispatchEvent(new MouseEvent('click'));

        expect(isolated.query(text, { panel: null }).resolve().kind).toBe('subscription');
        expect(results).toEqual([]);
        expect(getError(() => isolated.query(text, { panel: null }).evaluate())).toMatchObject({ kind: 'validation', code: 'DOMQL3004' });

        listener.dispose();
    });

    it('run a continuous execution of a null binding with nothing started, until an update supplies its receiver', () => {
        const calls = [];

        isolated.registerModule(isolated.createModule('Mark', {
            types: [elementExtension('MarkElements', [{ name: 'mark', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous', parameters: [], impl: ({ receiver: element }) => (calls.push(element), { update: () => {}, dispose: () => calls.push('dispose') }) }])],
        }));

        const execution = isolated.query('import Mark\nitem?:mark()', { item: null }).run();

        expect(calls).toEqual([]);

        execution.update({ item: panel });
        execution.update({ item: null });

        expect(calls).toEqual([panel, 'dispose']);
    });

    it('commit a continuous execution of a null binding to the declaration its first receiver selects', () => {
        const start = () => ({ update: () => {}, dispose: () => {} });
        const execution = { name: 'mark', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous', parameters: [], impl: start };

        isolated.registerModule(isolated.createModule('Mark', {
            types: [elementExtension('MarkElements', [execution]), { name: 'MarkStrings', kind: 'extension', target: 'String', members: [execution] }],
        }));

        const running = isolated.query('import Mark\nitem?:mark()', { item: null }).run();

        running.update({ item: panel });
        running.update({ item: null });

        const error = getError(() => running.update({ item: 'text' }));

        expect(error.kind).toBe('validation');
        expect(error.code).toBe('DOMQL3006');
        expect(error.message).toContain('another execution');
    });

    it('refuse a name whose host calls disagree on what they request, which a receiver of unknown type leaves ambiguous', () => {
        const once = { name: 'ping', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Boolean', impl: () => true };
        const continuous = { ...once, executionMode: 'continuous', result: undefined, impl: () => ({ update: () => {}, dispose: () => {} }) };

        isolated.registerModule(isolated.createModule('Ping', {
            types: [elementExtension('PingElements', [once]), { name: 'PingStrings', kind: 'extension', target: 'String', members: [continuous] }],
        }));

        const error = getError(() => isolated.query('import Ping\nthing?:ping()', { thing: null }).resolve());

        expect(error).toMatchObject({ kind: 'validation', code: 'DOMQL3005', message: expect.stringContaining("'ping' follows a value whose type is unknown, and its host calls disagree on what they request, so what the request does is ambiguous") });
        expect(error.location).toEqual({ pointer: '/expression/chain', offset: 12, line: 2, column: 1 });
        expect(isolated.query('import Ping\nthing:ping()', { thing: panel }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(isolated.query('import Ping\nthing:ping()', { thing: 'text' }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'continuous' });
    });

    it('count the host calls of a name the query can reach alone, Nexo\'s candidates for the call: those of the modules and the types it imports, read with a colon or a dot as each is declared, of the extension it names, and none internal', () => {
        const once = { name: 'ping', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Boolean', impl: () => true };
        const continuous = { ...once, executionMode: 'continuous', result: undefined, impl: () => ({ update: () => {}, dispose: () => {} }) };
        const strings = name => ({ name, kind: 'extension', target: 'String', members: [continuous] });
        const requestOf = text => isolated.query(text, { thing: null }).resolve();

        isolated.registerModule(isolated.createModule('Ping', { types: [elementExtension('PingElements', [once]), strings('PingStrings')] }));
        isolated.registerModule(isolated.createModule('Pong', { types: [strings('PongStrings')] }));
        isolated.registerModule(isolated.createModule('Pung', { types: [elementExtension('PungElements', [once]), { ...strings('PungStrings'), internal: true }] }));
        isolated.registerModule(isolated.createModule('Gizmos', { types: [{ name: 'Gizmo', kind: 'reference', isInstance: () => false, members: [continuous] }] }));

        // Ping's two extensions disagree, so the query that reaches both is refused, and each other reaches one of them alone.
        expect(getError(() => requestOf('import Ping\nthing?:ping()'))).toMatchObject({ code: 'DOMQL3005' });
        expect(requestOf('import PingElements = Ping.PingElements\nimport Pong\nthing?:PingElements.ping()')).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(requestOf('import Ping\nthing?:PingElements.ping()')).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(requestOf('import Ping\nthing?:Ping.PingElements.ping()')).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(requestOf('import Ping.PingElements\nthing?:ping()')).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(requestOf('import Ping.PingStrings\nthing?:ping()')).toMatchObject({ kind: 'execution', executionMode: 'continuous' });
        // Pung's strings are internal, Gizmo's call is a type's own, which a colon never reads, and a dot reads it alone.
        expect(requestOf('import Gizmos\nimport Pung\nthing?:ping()')).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(requestOf('import Gizmos\nimport Ping\nthing?.ping()')).toMatchObject({ kind: 'execution', executionMode: 'continuous' });
        expect(getError(() => requestOf('import Ping.PingElements\nimport Pong\nthing?:ping()'))).toMatchObject({ code: 'DOMQL3005' });
    });

    it('answer what a host call on a receiver of unknown type requests as the modules it imports say, a module registered since changing nothing', async () => {
        const once = { name: 'ping', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Boolean', impl: () => true };
        const continuous = { ...once, executionMode: 'continuous', result: undefined, impl: () => ({ update: () => {}, dispose: () => {} }) };
        const query = isolated.query('import Ping\nthing?:ping()', { thing: null });

        isolated.registerModule(isolated.createModule('Ping', { types: [elementExtension('PingElements', [once])] }));

        const resolved = query.resolve();

        isolated.registerModule(isolated.createModule('PingMore', { types: [{ name: 'PingStrings', kind: 'extension', target: 'String', members: [continuous] }] }));

        // A module of another name adds nothing a query that imports only Ping reaches, so the resolution and what it requests stand, as carrying it out finds.
        expect(query.resolve()).toBe(resolved);
        expect(resolved).toMatchObject({ kind: 'execution', executionMode: 'once' });
        await expect(query.with({ thing: panel }).executeAsync()).resolves.toBe(true);
    });

    it('refuse a watch over a member a value of Any may reach, as every declaration of its name Nexo could select when it is evaluated, the way a watch over the member read directly is refused', () => {
        const property = (name, result, changes) => ({ name, kind: 'property', result, updates: { changes, reads: 'fresh' }, impl: ({ receiver }) => (name === 'bag' ? receiver : receiver.title) });

        isolated.registerModule(isolated.createModule('Bag', { types: [elementExtension('BagElements', [property('bag', 'Any', 'constant'), property('title', 'String?', 'unobserved')])] }));

        const partly = getError(() => isolated.query('import Bag\npanel:bag.rect', { panel }).resolve({ watch: true }));
        const unobserved = getError(() => isolated.query('import Bag\npanel:bag:title', { panel }).resolve({ watch: true }));

        expect(partly).toMatchObject({ kind: 'validation', code: 'DOMQL3003', message: expect.stringContaining("'Element.rect' (which misses") });
        expect(partly.location).toEqual({ pointer: '/expression', offset: 11, line: 2, column: 1 });
        expect(unobserved).toMatchObject({ kind: 'validation', code: 'DOMQL3002', message: expect.stringContaining("A watch cannot follow 'Element.title', which name no observations") });
        expect(unobserved.location).toEqual({ pointer: '/expression', offset: 11, line: 2, column: 1 });
        expect(getError(() => isolated.query('import Bag\n{ title = panel:title }', { panel }).resolve({ watch: true }))).toMatchObject({ code: 'DOMQL3002', location: { pointer: '/expression/objectFields/0/value', line: 2, column: 11 } });
        expect(isolated.query('import Bag\npanel:bag.rect', { panel }).resolve({ watch: true, acceptPartialObservation: true }).kind).toBe('value');
        expect(isolated.query('import Bag\npanel:bag:title', { panel }).resolve().kind).toBe('value');
    });

    it('refuse a name whose declarations make requests of different kinds', () => {
        isolated.registerModule(isolated.createModule('Ping', {
            types: [elementExtension('PingElements', [{ name: 'ping', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Boolean', impl: () => true }])],
        }));
        isolated.registerModule(isolated.createModule('Radar', {
            types: [{ name: 'RadarStrings', kind: 'extension', target: 'String', members: [{ name: 'ping', kind: 'function', parameters: [], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 1 }] }],
        }));

        const error = getError(() => isolated.query('import Ping\nimport Radar\nthing?:ping()', { thing: null }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe('NEXO3025');
        expect(error.message).toContain('ambiguous');
        expect(isolated.query('import Ping\nimport Radar\nthing:ping()', { thing: panel }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
    });

    it('take the declaration a cast names for a null binding, where the name\'s declarations make requests of different kinds', async () => {
        const pings = [];

        isolated.registerModule(isolated.createModule('Ping', {
            types: [elementExtension('PingElements', [{
                name: 'ping', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Boolean',
                impl: ({ receiver: element }) => {
                    pings.push(element);

                    return true;
                },
            }])],
        }));
        isolated.registerModule(isolated.createModule('Radar', {
            types: [{ name: 'RadarStrings', kind: 'extension', target: 'String', members: [{ name: 'ping', kind: 'function', parameters: [], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 1 }] }],
        }));

        const query = isolated.query('import Ping\nimport Radar\n(thing as Element)?:ping()', { thing: null });

        expect(query.resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
        expect(await query.executeAsync()).toBeNull();
        expect(pings).toEqual([]);
        expect(await query.with({ thing: panel }).executeAsync()).toBe(true);
        expect(pings).toEqual([panel]);
    });

    it('run a function on the empty list, refusing one that more than one declaration takes', () => {
        isolated.registerModule(isolated.createModule('Total', {
            types: [
                { name: 'NumberTotals', kind: 'extension', target: 'List<Number>', members: [{ name: 'total', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: ({ receiver: items }) => items.reduce((sum, item) => sum + item, 0) }] },
                { name: 'StringTotals', kind: 'extension', target: 'List<String>', members: [{ name: 'total', kind: 'property', result: 'String', updates: { changes: 'constant', reads: 'fresh' }, impl: ({ receiver: items }) => items.join('') }] },
            ],
        }));

        expect(isolated.query('ids.count', { ids: [] }).evaluate()).toBe(0);
        expect(isolated.query('ids.first', { ids: [] }).evaluate()).toBeNull();
        expect(isolated.query('import Total\nids:total', { ids: [1, 2] }).evaluate()).toBe(3);
        expect(isolated.query('import Total\nids:total', { ids: ['a', 'b'] }).evaluate()).toBe('ab');

        const error = getError(() => isolated.query('import Total\nids:total', { ids: [] }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe('NEXO3024');
        expect(error.message).toContain('ambiguous');
    });
});

describe('domql truthiness', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><i data-x=""></i><i data-x="0"></i><i></i></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => isolated.query(text, { panel, ...bindings }).evaluate();

    /** A module, named as its property is but capitalized, of one property of elements answering what the function gives, of the result type given. */
    const register = (name, result, read) => isolated.registerModule(isolated.createModule(name[0].toUpperCase() + name.slice(1), {
        types: [elementExtension(`${name}Elements`, [{ name, kind: 'property', result, updates: { changes: 'constant', reads: 'fresh' }, impl: read }])],
    }));

    it.each([
        ['null', 'null', {}, true],
        ['false', 'false', {}, true],
        ['true', 'true', {}, false],
        ['zero', '0', {}, false],
        ['empty text', '""', {}, false],
        ['the text false', '"false"', {}, false],
        ['an empty list', 'items', { items: [] }, false],
        ['an empty object', 'record', { record: {} }, false],
        ['an element', 'panel', {}, false],
    ])('takes %s as falsey only where it is null or false, as not tells', (_, value, bindings, negated) => {
        expect(evaluate(`not ${value}`, bindings)).toBe(negated);
    });

    it.each([
        ['null and "value"', null],
        ['false and "value"', false],
        ['true and "value"', 'value'],
        ['null or "fallback"', 'fallback'],
        ['false or "fallback"', 'fallback'],
        ['0 or 10', 0],
        ['"" or "fallback"', ''],
        ['true and false or "fallback"', 'fallback'],
        ['a and b and c', 3],
        ['a and none and c', null],
        ['none or off or b', 2],
    ])('answers the operand that decides %s, as it is', (text, value) => {
        expect(evaluate(text, { a: 1, b: 2, c: 3, none: null, off: false })).toBe(value);
    });

    it('answers the operand itself, never a copy', () => {
        expect(evaluate('(panel.first(".none") or panel) == panel')).toBe(true);
        expect(evaluate('(panel and panel.first("i")) == panel.first("i")')).toBe(true);
    });

    it('evaluates each operand once, and none after the one that decides it, which never fails nor is read', () => {
        let reads = 0;

        register('tally', 'String?', () => (++reads, null));
        register('broken', 'String?', () => { throw new Error('unreadable'); });

        expect(evaluate('import Tally\npanel:tally or "none"')).toBe('none');
        expect(reads).toBe(1);
        expect(evaluate('import Broken\nimport Tally\npanel:tally and panel:broken')).toBeNull();
        expect(evaluate('import Broken\n"x" or panel:broken')).toBe('x');

        const error = getError(() => evaluate('import Broken\nimport Tally\npanel:tally or panel:broken'));

        expect(error.kind).toBe('evaluation');
        expect(error.code).toBe('NEXO5007');
        expect(error.message).toContain("The member 'broken' failed: unreadable");
    });

    it('falls back with ?? for null alone, and with or for null and false', () => {
        expect(evaluate('false ?? true')).toBe(false);
        expect(evaluate('false or true')).toBe(true);
        expect(evaluate('none ?? 1', { none: null })).toBe(1);
        expect(evaluate('none or 1', { none: null })).toBe(1);
        expect(evaluate('try "x" to Number ?? 0')).toBe(0);
    });

    it('leaves an equality as it was, so the text false is no false', () => {
        expect(getError(() => isolated.query('"false" == false').resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3030' });
        expect(evaluate('text == "false"', { text: 'false' })).toBe(true);
    });

    it.each([
        ['zero', '0', 'then'],
        ['empty text', '""', 'then'],
        ['an empty list', 'items', 'then'],
        ['null', 'none', 'else'],
        ['false', 'off', 'else'],
    ])('takes the same branch for %s in a conditional and a conditional binding', (_, value, branch) => {
        const bindings = { items: [], none: null, off: false };

        expect(evaluate(`if ${value} then "then" else "else" end`, bindings)).toBe(branch);
        expect(evaluate(`if let v = ${value} then "then" else "else" end`, bindings)).toBe(branch);
        expect(evaluate(`if flag then "x" elseif let v = ${value} then "then" else "else" end`, { ...bindings, flag: false })).toBe(branch);
    });

    it('filters by the truthiness of a predicate, its function receiving a Boolean', () => {
        expect(evaluate('panel.children.where(it["data-x"]).count')).toBe(2);
        expect(evaluate('panel.children.where(try it["data-x"] to Number).count')).toBe(1);

        const received = [];

        isolated.registerModule(isolated.createModule('Picks', {
            types: [{ name: 'PickExtensions<T>', kind: 'extension', target: 'List<T>', members: [{ name: 'picks', kind: 'function', arguments: 'positional', result: 'Number', updates: { changes: 'derived', reads: 'derived' }, parameters: [{ name: 'expression', kind: 'predicate', type: 'Boolean', context: 'item', required: true, nulls: 'accept' }], impl: ({ receiver: items, args: { expression } }) => items.filter(item => (received.push(expression(item)), expression(item))).length }] }],
        }));

        expect(evaluate('import Picks\npanel.children:picks(it["data-x"])')).toBe(2);
        expect(received).toEqual([true, true, false]);
    });

    it('refuses a predicate declared of any type but boolean, and one that is no value', () => {
        expect(() => isolated.createModule('Picks', {
            types: [{ name: 'PickExtensions<T>', kind: 'extension', target: 'List<T>', members: [{ name: 'picks', kind: 'function', arguments: 'positional', result: 'Number', updates: { changes: 'derived', reads: 'derived' }, parameters: [{ name: 'expression', kind: 'predicate', type: 'String', context: 'item', required: true, nulls: 'accept' }], impl: () => 0 }] }],
        })).toThrow(expect.objectContaining({ message: expect.stringContaining("The predicate parameter 'expression' is of type boolean") }));
        expect(getError(() => isolated.query('panel.children.where(it.on("click"))', { panel }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3048' });
    });

    it('keeps a member declared to answer a Boolean to an actual Boolean, wherever it is tested', () => {
        register('flag', 'Boolean', () => 'yes');

        for (const text of ['if panel:flag then 1 else 0 end', 'panel:flag or true', 'not panel:flag', 'panel.children.where(panel:flag).count']) {
            const error = getError(() => evaluate(`import Flag\n${text}`));

            expect(error.kind, text).toBe('evaluation');
            expect(error.code, text).toBe('NEXO5006');
            expect(error.message, text).toContain("The member 'flag' answered");
        }
    });
});

describe('domql casts', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><i></i></div><div id="host"></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => isolated.query(text, { panel, ...bindings }).evaluate();

    /** An element whose parent is a shadow root. */
    const shadowed = () => document.getElementById('host').attachShadow({ mode: 'open' }).appendChild(document.createElement('b'));

    it('answers its target itself where it is of the type, strict or attempted', () => {
        const item = panel.firstElementChild;

        expect(evaluate('(item.parent as Element) == panel', { item })).toBe(true);
        expect(evaluate('(try item.parent as Element) == panel', { item })).toBe(true);
        expect(evaluate('(panel.root as Document) == Domql.document')).toBe(true);
        expect(evaluate('(panel as Node) == panel')).toBe(true);
        expect(evaluate('(try item.parent as Element)?["id"]', { item })).toBe('panel');
    });

    it.each([
        ['a document', 'panel.root', {}, '/expression/left'],
        ['a shadow root', 'inner.parent', { inner: 'shadowed' }, '/expression/left'],
    ])('fails a strict cast of %s to an element, naming the type it is read as and the type it isn\'t, and answers null for an attempted one', (_, target, bindings, pointer) => {
        const bound = bindings.inner === undefined ? {} : { inner: shadowed() };
        const error = getError(() => evaluate(`(${target} as Element) == null`, bound));

        expect(error.kind).toBe('evaluation');
        expect(error.code).toBe('NEXO5001');
        expect(error.message).toContain('The cast to Element rejected its value: it is a Node that isn\'t an Element');
        expect(error.location.pointer).toBe(pointer);
        expect(evaluate(`(try ${target} as Element) == null`, bound)).toBe(true);
    });

    it('passes null through, strict or attempted', () => {
        expect(evaluate('(item as Element) == null', { item: null })).toBe(true);
        expect(evaluate('(try item as Element) == null', { item: null })).toBe(true);
        expect(evaluate('(panel.first(".none") as Element) == null')).toBe(true);
        expect(evaluate('(panel.parent as Element)?["id"]')).toBeNull();
    });

    it('evaluates its target once, and leaves a failure of evaluating it an error, a strict cast within it and a value of no declared type among them', () => {
        let reads = 0;

        isolated.registerModule(isolated.createModule('Readings', {
            types: [elementExtension('ReadingElements', [
                ['reading', () => (reads++, document)],
                ['broken', () => { throw new Error('unreadable'); }],
                ['bogus', () => 5],
            ].map(([name, impl]) => ({ name, kind: 'property', result: 'Domql.Node', updates: { changes: 'constant', reads: 'fresh' }, impl })))],
        }));

        expect(evaluate('import Readings\n(try panel:reading as Element) == null')).toBe(true);
        expect(reads).toBe(1);

        for (const [text, code, message] of [
            ['(try panel:broken as Element) == null', 'NEXO5007', "The member 'broken' failed: unreadable"],
            ['(try panel:bogus as Element) == null', 'NEXO5006', "The member 'bogus' answered 5, and it declares Node"],
            ['(try (panel.root as Element).parent as Element) == null', 'NEXO5001', 'The cast to Element rejected its value: it is a Node that isn\'t an Element'],
        ]) {
            const error = getError(() => evaluate(`import Readings\n${text}`));

            expect(error.kind, text).toBe('evaluation');
            expect(error.code, text).toBe(code);
            expect(error.message, text).toContain(message);
        }
    });

    it.each([
        ['a type that is no reference type', 'try panel as widget', "'as' casts to a reference type, and 'widget' is none", 'NEXO3019'],
        ['a target that can never be of the type', 'try Domql.document as Element', 'A value of Document can never be cast to Element', 'NEXO3060'],
        ['a target that is no node', 'try 5 as Element', 'A value of Number can never be cast to Element', 'NEXO3060'],
    ])('is refused before anything is evaluated for %s, attempted as it is strict', (_, text, message, code) => {
        const error = getError(() => isolated.query(text, { panel }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });
});

describe('domql conversions', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => isolated.query(text, { panel, ...bindings }).evaluate();

    /**
     * A module of a structured type of its own, `Celsius`, converted from a text such as "21C" or "21", rejecting any other, through an operator its extension of strings declares, and to one such as "21C", through
     * the type's own; a test can give the conversion from text what it does instead.
     */
    const registerTemperature = ({ answer = null } = {}) => {
        isolated.registerModule(isolated.createModule('Temperature', {
            types: [
                {
                    name: 'Celsius', kind: 'structured',
                    members: [
                        { name: 'degrees', kind: 'property', result: 'Number' },
                        { name: 'convert', kind: 'operator', result: 'String', impl: ({ value: { degrees } }) => `${degrees}C` },
                    ],
                },
                {
                    name: 'TemperatureStrings', kind: 'extension', target: 'String',
                    members: [{
                        name: 'convert', kind: 'operator', result: 'Celsius',
                        impl: ({ value: text, reject }) => {
                            if (answer !== null) {
                                return answer(text, reject);
                            }

                            if (!/^-?[0-9]+C?$/.test(text)) {
                                reject(`${JSON.stringify(text)} is no temperature`);
                            }

                            return { degrees: Number(text.replace('C', '')), unit: 'C' };
                        },
                    }],
                },
            ],
        }));
    };

    /** Evaluates the text as a script importing the temperature module. */
    const evaluateTemperature = (text, bindings = {}) => evaluate(`import Temperature\n${text}`, bindings);

    describe('from a string to a number', () => {
        it.each([
            ['12', 12],
            ['-12', -12],
            ['3.5', 3.5],
            ['.5', 0.5],
            ['-.5', -0.5],
            ['1e3', 1000],
            ['1E-3', 0.001],
            ['2.5e+2', 250],
            ['007', 7],
            ['-0', -0],
            [' 12 ', 12],
            ['\t\n\f\r 12 \r\n', 12],
            ['1e-400', 0],
        ])('take HTML\'s valid floating-point syntax after trimming ASCII whitespace: %j', (text, number) => {
            expect(Object.is(evaluate('text to Number', { text }), number)).toBe(true);
        });

        it.each([
            ['empty text', ''],
            ['whitespace alone', '  '],
            ['a plus sign', '+1'],
            ['a fraction without digits', '1.'],
            ['two points', '1..5'],
            ['a hexadecimal number', '0x10'],
            ['Infinity', 'Infinity'],
            ['a separator', '1_000'],
            ['a trailing unit', '12px'],
            ['digits of another script', '١٢'],
            ['whitespace that is not ASCII', ' 12'],
        ])('refuse %s as an evaluation error, never null', (_, text) => {
            const error = getError(() => evaluate('text to Number', { text }));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('NEXO5016');
            expect(error.message).toContain(`The conversion from String to Number rejected its value: ${JSON.stringify(text)} is no number`);
        });

        it('refuses a number too large to be finite', () => {
            const error = getError(() => evaluate('"1e999" to Number'));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('NEXO5016');
            expect(error.message).toContain('"1e999" is too large a number to be finite');
        });
    });

    describe('from a number to a string', () => {
        it.each([
            [123, '123'],
            [0.1, '0.1'],
            [-12.5, '-12.5'],
            [1e21, '1e+21'],
            [1e-7, '1e-7'],
            [-0, '0'],
        ])('write the shortest text that reads back as the same number, negative zero as 0: %d', (number, text) => {
            expect(evaluate('number to String', { number })).toBe(text);
        });

        it.each([0.1, 1 / 3, 1e21, 1e-7, 123456789.125, Number.MAX_VALUE, Number.MIN_VALUE])('read back as the same number: %d', number => {
            expect(evaluate('number to String to Number', { number })).toBe(number);
        });
    });

    describe('Booleans', () => {
        it('are written true and false', () => {
            expect(evaluate('true to String')).toBe('true');
            expect(evaluate('false to String')).toBe('false');
        });

        it('are read from true and false alone', () => {
            expect(evaluate('"true" to Boolean')).toBe(true);
            expect(evaluate('"false" to Boolean')).toBe(false);

            for (const text of ['TRUE', 'True', '1', '', ' true', 'yes']) {
                const error = getError(() => evaluate('text to Boolean', { text }));

                expect(error.kind, text).toBe('evaluation');
                expect(error.code, text).toBe('NEXO5016');
                expect(error.message).toContain(`${JSON.stringify(text)} is no Boolean, which is written "true" or "false"`);
            }
        });
    });

    describe('null', () => {
        it('answers null for null without converting, nullable where the value is', () => {
            panel.setAttribute('data-count', '3');

            const query = isolated.query('panel["data-missing"] to Number', { panel });

            expect(String(query.resolve().type)).toBe('Number?');
            expect(query.evaluate()).toBeNull();
            expect(evaluate('panel["data-count"] to Number')).toBe(3);
        });

        it('lets ?? say what a missing value means, and leaves a malformed one an error', () => {
            panel.setAttribute('data-count', 'three');

            expect(evaluate('panel["data-missing"] to Number ?? 0')).toBe(0);
            expect(getError(() => evaluate('panel["data-count"] to Number ?? 0'))).toMatchObject({ kind: 'evaluation', code: 'NEXO5016' });
        });

        it('answers null for a null of unknown type once its target is a type it converts to, however many conversions reach that type', () => {
            registerTemperature();
            isolated.registerModule(isolated.createModule('Kelvin', {
                types: [{
                    name: 'Kelvin', kind: 'structured',
                    members: [{ name: 'degrees', kind: 'property', result: 'Number' }, { name: 'convert', kind: 'operator', result: 'Number', impl: ({ value: { degrees } }) => degrees }],
                }],
            }));

            const query = isolated.query('import Kelvin\nimport Temperature\nvalue to Number', { value: null });

            expect(String(query.resolve().type)).toBe('Number?');
            expect(query.evaluate()).toBeNull();
            expect(evaluateTemperature('value to Celsius', { value: null })).toBeNull();
            expect(getError(() => evaluate('value to Element', { value: null }))).toMatchObject({ kind: 'validation', code: 'NEXO3021' });
        });

        it('leaves a nullable value checked by its type without null', () => {
            const error = getError(() => evaluate('panel.closest(".row") to String'));

            expect(error.kind).toBe('validation');
            expect(error.code).toBe('NEXO3022');
            expect(error.message).toContain('No conversion from Element to String is declared, and Element converts to nothing');
        });
    });

    describe('a value already of the type', () => {
        it('answers itself, whatever conversions a module declares', () => {
            registerTemperature();

            expect(evaluateTemperature('5 to Number')).toBe(5);
            expect(evaluateTemperature('"21C" to String')).toBe('21C');
            expect(evaluateTemperature('("21C" to Celsius) to Celsius')).toEqual({ degrees: 21 });
        });
    });

    describe('a conversion that is not declared', () => {
        it.each([
            ['a structured type that converts to nothing', 'panel.size to String', 'NEXO3022', 'No conversion from Size to String is declared, and Size converts to nothing'],
            ['a type reached only through another', '5 to Boolean', 'NEXO3022', 'No conversion from Number to Boolean is declared, and Number converts to String'],
            ['a list', 'panel.children to String', 'NEXO3022', 'No conversion from List<Element> to String is declared'],
            ['a node, which a cast narrows', '"a" to Element', 'NEXO3021', "a reference is cast to a type of its hierarchy with 'as', as in … as Element"],
            ['a type no module declares', '"a" to nope', 'NEXO3019', "and 'nope' is none of them"],
            ['a structured type that holds an element', '"a" to PointerEvent', 'NEXO3021', "and 'PointerEvent' is none of them"],
            ['an event source', 'panel.on("click") to String', 'NEXO3048', "What 'to' converts is a value, and this one is a host call"],
        ])('is refused before anything is evaluated for %s', (_, text, code, message) => {
            const error = getError(() => isolated.query(text, { panel }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.code).toBe(code);
            expect(error.message).toContain(message);
        });
    });

    describe('an attempted conversion', () => {
        it('answers the converted value, whatever it is, and null where the conversion rejects it', () => {
            expect(evaluate('try "42" to Number')).toBe(42);
            expect(evaluate('try "0" to Number')).toBe(0);
            expect(evaluate('try "false" to Boolean')).toBe(false);
            expect(evaluate('try "hello" to Number')).toBeNull();
            expect(evaluate('try "1e999" to Number')).toBeNull();
            expect(evaluate('try "TRUE" to Boolean')).toBeNull();
            expect(evaluate('try "hello" to Number ?? 0')).toBe(0);
            expect(String(isolated.query('try "42" to Number', { panel }).resolve().type)).toBe('Number?');
            expect(String(isolated.query('try "42" to Number ?? 0', { panel }).resolve().type)).toBe('Number');
        });

        it('answers null for null, and a value already of the type as it is', () => {
            expect(evaluate('try value to Number', { value: null })).toBeNull();
            expect(evaluate('try 5 to Number')).toBe(5);
            expect(evaluate('try panel["data-missing"] to Number')).toBeNull();
        });

        it.each([
            ['a target no type has', 'try "a" to nope', 'NEXO3019', "and 'nope' is none of them"],
            ['a pair no conversion is declared for', 'try 5 to Boolean', 'NEXO3022', 'No conversion from Number to Boolean is declared'],
            ['a nullable value whose type has no conversion', 'try panel.closest(".row") to String', 'NEXO3022', 'No conversion from Element to String is declared'],
            ['a null whose target is no type of data', 'try value to Element', 'NEXO3021', "a reference is cast to a type of its hierarchy with 'as', as in … as Element"],
            ['an event source', 'try panel.on("click") to String', 'NEXO3048', "What 'to' converts is a value, and this one is a host call"],
        ])('is refused before anything is evaluated for %s, as an ordinary conversion is', (_, text, code, message) => {
            const error = getError(() => isolated.query(text, { panel, value: null }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.code).toBe(code);
            expect(error.message).toContain(message);
        });

        it('attempts a conversion a module declares, answering null for a value it rejects', () => {
            registerTemperature();

            expect(evaluateTemperature('try "21C" to Celsius')).toEqual({ degrees: 21 });
            expect(evaluateTemperature('try "warm" to Celsius')).toBeNull();
        });

        it.each([
            ['throws', () => { throw new Error('the table of units is missing'); }, 'failed: the table of units is missing', 'NEXO5003'],
            ['answers a value not of its type', () => '21', 'answered', 'NEXO5019'],
            ['answers null for a value that is not null', () => null, 'answered null, and it converts to Celsius', 'NEXO5019'],
            ['rejects with a reason that is no string', (text, reject) => reject(42), 'rejected its value with a reason that is no string', 'NEXO5018'],
            ['catches its rejection and answers a value', (text, reject) => {
                try {
                    reject('no');
                } catch {
                    // A conversion that outlives its rejection has a fault.
                }

                return { degrees: 1 };
            }, 'rejected its value and then answered one', 'NEXO5018'],
        ])('leaves a fault an error, attempted or not, where the conversion %s', (_, answer, message, code) => {
            registerTemperature({ answer });

            for (const text of ['"21C" to Celsius', 'try "21C" to Celsius']) {
                const error = getError(() => evaluateTemperature(text));

                expect(error.kind, text).toBe('evaluation');
                expect(error.code, text).toBe(code);
                expect(error.message, text).toContain(`The conversion from String to Celsius ${message}`);
            }
        });

        it('leaves a failure of evaluating its value an error, a rejection of a conversion within that value among them, since it attempts its own conversion alone', () => {
            isolated.registerModule(isolated.createModule('Broken', {
                types: [elementExtension('BrokenElements', [{ name: 'broken', kind: 'property', result: 'String', updates: { changes: 'constant', reads: 'fresh' }, impl: () => { throw new Error('unreadable'); } }])],
            }));

            const failed = getError(() => evaluate('import Broken\ntry panel:broken to Number'));

            expect(failed.kind).toBe('evaluation');
            expect(failed.code).toBe('NEXO5007');
            expect(failed.message).toContain("The member 'broken' failed: unreadable");

            const rejected = getError(() => evaluate('try ("abc" to Number) to String'));

            expect(rejected.kind).toBe('evaluation');
            expect(rejected.code).toBe('NEXO5016');
            expect(rejected.message).toContain('The conversion from String to Number rejected its value');
            expect(evaluate('try ("12" to Number) to String')).toBe('12');
        });

        it('evaluates its value once and carries its conversion out once', () => {
            let reads = 0;
            let conversions = 0;

            registerTemperature({ answer: text => (conversions++, { degrees: Number(text.replace('C', '')) }) });
            isolated.registerModule(isolated.createModule('Reading', {
                types: [elementExtension('ReadingElements', [{ name: 'reading', kind: 'property', result: 'String', updates: { changes: 'constant', reads: 'fresh' }, impl: () => `${++reads}C` }])],
            }));

            expect(evaluateTemperature('import Reading\ntry panel:reading to Celsius')).toEqual({ degrees: 1 });
            expect([reads, conversions]).toEqual([1, 1]);
            expect(evaluateTemperature('import Reading\nif let reading = try panel:reading to Celsius then @reading.degrees else null end')).toBe(2);
            expect([reads, conversions]).toEqual([2, 2]);
        });
    });

    describe('a conditional binding', () => {
        it('takes its consequent for a truthy value, 0, empty text and an empty list among them, with the name bound to it, and its alternative for null and false', () => {
            panel.setAttribute('data-count', '12');
            panel.setAttribute('data-zero', '0');
            panel.setAttribute('data-bad', 'twelve');

            expect(evaluate('if let n = try panel["data-count"] to Number then n else -1 end')).toBe(12);
            expect(evaluate('if let n = try panel["data-zero"] to Number then n else -1 end')).toBe(0);
            expect(evaluate('if let n = try panel["data-bad"] to Number then n else -1 end')).toBe(-1);
            expect(evaluate('if let s = "" then s else "none" end')).toBe('');
            expect(evaluate('if let items = list then items.count else -1 end', { list: [] })).toBe(0);
            expect(evaluate('if let key = panel["data-missing"] then key else "unknown" end')).toBe('unknown');
            expect(evaluate('if let b = false then b else true end')).toBe(true);
            expect(evaluate('if let b = on then "on" else "off" end', { on: false })).toBe('off');
            expect(evaluate('if let b = panel.attached then "attached" else "detached" end')).toBe('attached');
            expect(evaluate('if let b = panel.first(".none")?.attached then "attached" else "none" end')).toBe('none');
        });

        it('binds the value without null, and binds a value that cannot be null as well, which always takes its consequent', () => {
            expect(String(isolated.query('if let key = panel["data-key"] then key else "unknown" end', { panel }).resolve().type)).toBe('String');
            expect(evaluate('if let node = panel then node["id"] else null end')).toBe('panel');
            expect(evaluate('if let a = null then a else 1 end')).toBe(1);
        });

        it('sees its name in its consequent alone, nested expressions within it included, never in its value, its alternative or a later clause', () => {
            const messageOf = text => getError(() => isolated.query(text, { panel }).resolve()).message;

            expect(evaluate('if let id = panel["id"] then panel { mine = id, upper = { id = id } } else null end')).toEqual({ mine: 'panel', upper: { id: 'panel' } });
            expect(getError(() => isolated.query('if let k = k then 1 else 2 end', { panel })).message).toContain("'k' is used before the local of that name is declared in its scope");
            expect(messageOf('if let k = panel["id"] then 1 else k end')).toContain("No local in scope or script parameter is named 'k'");
            expect(messageOf('if let k = panel["x"] then 1 elseif k == "a" then 2 else 3 end')).toContain("No local in scope or script parameter is named 'k'");
            expect(evaluate('if let k = panel["x"] then k elseif let id = panel["id"] then id else "none" end')).toBe('panel');
        });

        it('evaluates its value once, and refuses a value that is no value', () => {
            let reads = 0;

            isolated.registerModule(isolated.createModule('Reading', {
                types: [elementExtension('ReadingElements', [{ name: 'reading', kind: 'property', result: 'String?', updates: { changes: 'constant', reads: 'fresh' }, impl: () => `${++reads}` }])],
            }));

            expect(evaluate('import Reading\nif let r = panel:reading then { a = r, b = r } else null end')).toEqual({ a: '1', b: '1' });
            expect(reads).toBe(1);
            expect(getError(() => isolated.query('if let e = panel.on("click") then 1 else 2 end', { panel }).resolve())).toMatchObject({ code: 'NEXO3048', message: expect.stringContaining("What 'if let' binds is a value, and this one is a host call") });
        });
    });

    describe('a conversion a module declares', () => {
        it('converts to and from a structured type of its own, its result taken by the type\'s declared fields', () => {
            registerTemperature();
            panel.setAttribute('data-temperature', '21C');

            expect(evaluateTemperature('panel["data-temperature"] to Celsius')).toEqual({ degrees: 21 });
            expect(evaluateTemperature('(panel["data-temperature"] to Celsius)?.degrees')).toBe(21);
            expect(evaluateTemperature('panel["data-temperature"] to Celsius to String')).toBe('21C');
        });

        it('is available to a script that imports its module alone', () => {
            registerTemperature();

            expect(getError(() => evaluate('"21C" to Celsius'))).toMatchObject({ kind: 'validation', code: 'NEXO3019' });
        });

        it('takes one conversion, never a chain of them, so a value reaches a type through another only where the query writes both', () => {
            registerTemperature();

            expect(getError(() => evaluateTemperature('5 to Celsius'))).toMatchObject({ code: 'NEXO3022', message: expect.stringContaining('No conversion from Number to Celsius is declared') });
            expect(evaluateTemperature('5 to String to Celsius')).toEqual({ degrees: 5 });
        });

        it('fails with an evaluation error where it rejects its value, giving the reason', () => {
            registerTemperature();

            const error = getError(() => evaluateTemperature('"warm" to Celsius'));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('NEXO5016');
            expect(error.message).toContain('The conversion from String to Celsius rejected its value: "warm" is no temperature');
        });

        it('fails with an evaluation error where it throws, a fault, with what it threw as the cause', () => {
            const fault = new Error('the table of units is missing');

            registerTemperature({ answer: () => { throw fault; } });

            const error = getError(() => evaluateTemperature('"21C" to Celsius'));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('NEXO5003');
            expect(error.message).toContain('The conversion from String to Celsius failed: the table of units is missing');
            expect(error.cause).toBe(fault);
        });

        it.each([
            ['a value of another type', () => '21'],
            ['null', () => null],
            ['a structure missing a field', () => ({})],
        ])('fails with an evaluation error where it answers %s', (_, answer) => {
            registerTemperature({ answer });

            const error = getError(() => evaluateTemperature('"21C" to Celsius'));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('NEXO5019');
            expect(error.message).toContain('The conversion from String to Celsius answered');
            expect(error.message).toContain('and it converts to Celsius');
        });

        it('evaluates the value it converts once', () => {
            let reads = 0;

            registerTemperature();
            isolated.registerModule(isolated.createModule('Reading', {
                types: [elementExtension('ReadingElements', [{ name: 'reading', kind: 'property', result: 'String', updates: { changes: 'constant', reads: 'fresh' }, impl: () => `${++reads}C` }])],
            }));

            expect(evaluateTemperature('import Reading\npanel:reading to Celsius')).toEqual({ degrees: 1 });
            expect(reads).toBe(1);
        });
    });
});

describe('domql Boolean functions', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-key="k1"></div>';
        panel = document.getElementById('panel');
    });

    /** The query of the text as a script importing the module of lights. */
    const queryOf = (text, bindings = {}) => isolated.query(`import Lit\n${text}`, { panel, ...bindings });
    const evaluate = (text, bindings = {}) => queryOf(text, bindings).evaluate();

    /** A module of a test on elements, and of tests on a view type of its own, one partly observable, one whose function the test supplies. */
    const registerLit = ({ glow = view => view.on } = {}) => {
        const test = (name, updates, impl) => ({ name, kind: 'function', result: 'Boolean', parameters: [], updates, impl });
        const constant = { changes: 'constant', reads: 'fresh' };

        isolated.registerModule(isolated.createModule('Lit', {
            types: [
                {
                    name: 'LitView', kind: 'structured',
                    members: [
                        { name: 'on', kind: 'property', result: 'Boolean' },
                        test('glowing', { changes: 'partly-observable', misses: 'a glow its source sets alone', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: true }] }, ({ receiver: view }) => glow(view)),
                        test('steady', constant, () => true),
                    ],
                },
                elementExtension('LitElements', [
                    { name: 'light', kind: 'property', result: 'LitView', updates: constant, impl: () => ({ on: true }) },
                    { name: 'lights', kind: 'property', result: 'List<LitView>', updates: constant, impl: () => [{ on: true }, { on: false }] },
                    test('lit', { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-lit'] }] }, ({ receiver: element }) => element.hasAttribute('data-lit')),
                ]),
            ],
        }));
    };

    it('tests its receiver through its own function, called directly or, on a type of its module\'s own, through its module, and answers a Boolean', () => {
        registerLit();
        panel.setAttribute('data-lit', '');

        expect(evaluate('panel:lit()')).toBe(true);
        expect(evaluate('panel:light.glowing()')).toBe(true);
        expect(evaluate('Lit.glowing(panel:light)')).toBe(true);
        expect(evaluate('panel:lit() and Lit.steady(panel:light)')).toBe(true);
        expect(String(queryOf('Lit.glowing(panel:light)').resolve().type)).toBe('Boolean');
    });

    it('passes a test where a function is taken, by reference through its module, as an arrow function, a function a local holds or an implicit body', () => {
        registerLit();

        expect(evaluate('panel { let test = v => v.glowing(), referenced = it:lights.where(Lit.glowing).count, held = it:lights.where(test).count, arrow = it:lights.where(v => v.steady()).count, body = it:lights.where(it.steady()).count }')).toEqual({ referenced: 1, held: 1, arrow: 2, body: 2 });
    });

    it.each(['is', 'has', 'supports'])('reads %s, a verb the language once had, as any name, which no declaration has', verb => {
        registerLit();

        expect(getError(() => queryOf(`panel.${verb}(Lit.steady)`).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3001', message: expect.stringContaining(`'${verb}' is no member of the vocabulary`) });
    });

    it('refuses a test of other receivers, naming the receivers it is of, and one a function parameter\'s contract does not take', () => {
        registerLit();

        const refusalOf = text => getError(() => queryOf(text).resolve());

        expect(refusalOf('panel.glowing()')).toMatchObject({ code: 'NEXO3001', message: expect.stringContaining("'glowing' is not available on Element; it is available on LitView") });
        expect(refusalOf('Domql.window:lit()')).toMatchObject({ code: 'NEXO3062', message: expect.stringContaining("No extension the script reaches declares 'lit' for Window") });
        expect(refusalOf('panel.children.where(Lit.glowing)')).toMatchObject({ code: 'NEXO3037', message: expect.stringContaining("and 'Lit.glowing' names no function that takes those or answers that") });
    });

    it('skips its function for a null receiver read with ?., or given to its qualified form', () => {
        let tests = 0;

        registerLit({ glow: () => { tests++; return true; } });

        expect(evaluate('missing?.glowing()', { missing: null })).toBeNull();
        expect(evaluate('Lit.glowing(missing)', { missing: null })).toBeNull();
        expect(evaluate('panel:light?.glowing()')).toBe(true);
        expect(tests).toBe(1);
    });

    it.each([
        ['through : on a receiver that can be null, giving the form with ?:', 'panel.first(".none"):lit()', 'NEXO3063', "write 'panel.first(\".none\")?:lit()'"],
        ['given an argument it takes none of', 'panel:lit(1)', 'NEXO3058', "'lit' takes no argument"],
        ['through its module, given a receiver of another type', 'Lit.glowing(5)', 'NEXO3042', "'Lit.glowing' takes a receiver of LitView, and is given Number"],
        ['through its module, given no receiver', 'Lit.glowing()', 'NEXO3080', "'Lit.glowing' is the qualified form of a member of a receiver"],
    ])('is refused as any call is %s', (_, text, code, message) => {
        registerLit();

        const error = getError(() => queryOf(text).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it('keeps each function its own contract, however it is reached, so a partly observable one leaves the others as they are', () => {
        registerLit();

        expect(() => queryOf('{ lit = panel:lit(), steady = panel:light.steady() }').resolve({ watch: true })).not.toThrow();

        const direct = getError(() => queryOf('{ lit = panel:lit(), glowing = panel:light.glowing() }').resolve({ watch: true }));
        const qualified = getError(() => queryOf('{ lit = panel:lit(), glowing = Lit.glowing(panel:light) }').resolve({ watch: true }));

        expect(direct.code).toBe('DOMQL3003');
        expect(direct.message).toContain(`A watch over 'LitView.glowing' (which misses a glow its source sets alone) is refused unless the watch accepts partial observation`);
        expect(direct.location.pointer).toBe('/expression/objectFields/1/value');
        expect(qualified.message).toContain(`A watch over 'LitView.glowing' (which misses a glow its source sets alone) is refused unless the watch accepts partial observation`);
        expect(() => queryOf('panel:light.glowing()').resolve({ watch: true, acceptPartialObservation: true })).not.toThrow();
    });

    it.each([
        ['throws', () => { throw new Error('the lamp is gone'); }, "The member 'glowing' failed: the lamp is gone", 'NEXO5007'],
        ['answers what is no Boolean', () => 'yes', "The member 'glowing' answered \"yes\", and it declares Boolean", 'NEXO5006'],
    ])('fails with an evaluation error naming the function where it %s, called directly or through its module', (_, glow, message, code) => {
        registerLit({ glow });

        for (const text of ['panel:light.glowing()', 'Lit.glowing(panel:light)']) {
            const error = getError(() => evaluate(text));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe(code);
            expect(error.message).toContain(message);
        }
    });
});

describe('domql ARIA conditions', () => {
    let element;

    beforeEach(() => {
        document.body.innerHTML = '<div id="parent"><input id="element" type="checkbox"></div>';
        element = document.getElementById('element');
    });

    const evaluate = text => domql.query(text, { e: element }).evaluate();

    it.each([
        ['true', true],
        ['TRUE', true],
        ['True', true],
        ['false', false],
        ['mixed', false],
        ['', false],
        [' true ', false],
        ['yes', false],
        [null, false],
    ])('tests aria-checked and aria-disabled for the value true, ignoring ASCII case: %j answers %s', (value, answer) => {
        if (value !== null) {
            element.setAttribute('aria-checked', value);
            element.setAttribute('aria-disabled', value);
        }

        expect(evaluate('e.aria.checked()')).toBe(answer);
        expect(evaluate('e.aria.disabled()')).toBe(answer);
    });

    it('reads the element\'s own attribute, never an ancestor\'s, and keeps mixed for the attribute itself', () => {
        document.getElementById('parent').setAttribute('aria-disabled', 'true');
        element.setAttribute('aria-checked', 'mixed');

        expect(evaluate('e.aria.disabled()')).toBe(false);
        expect(evaluate('e["aria-checked"] == "mixed"')).toBe(true);
    });

    it('stands apart from the native condition of the same name, each falling back on nothing of the other', () => {
        element.checked = true;

        expect(evaluate('{ native = e.checked(), aria = e.aria.checked(), either = e.checked() or e.aria.checked() }')).toEqual({ native: true, aria: false, either: true });

        element.checked = false;
        element.setAttribute('aria-checked', 'true');

        expect(evaluate('{ native = e.checked(), aria = e.aria.checked() }')).toEqual({ native: false, aria: true });
    });

    it.each([
        ['an absent attribute', null, null],
        ['false', 'false', 'false'],
        ['mixed', 'mixed', 'mixed'],
        ['true in capitals', 'TRUE', 'TRUE'],
        ['the empty string', '', ''],
        ['a value padded with spaces', ' true ', ' true '],
    ])('reads the ARIA attribute of the key, its prefix left out, as the raw string the full spelling reads, converting nothing: %s', (_, value, answer) => {
        if (value !== null) {
            element.setAttribute('aria-checked', value);
        }

        expect(evaluate('{ short = e.aria["checked"], named = e.aria.attribute["checked"], full = e.attribute["aria-checked"] }')).toEqual({ short: answer, named: answer, full: answer });
        expect(evaluate('e.aria["checked"] == e["aria-checked"]')).toBe(true);
    });

    it.each([
        ['an item that is null', null, undefined, false],
        ['an item without the attribute', 'Element', undefined, false],
        ['an item whose attribute is false', 'Element', 'false', false],
        ['an item whose attribute is true', 'Element', 'true', true],
    ])('compares an optional ARIA read of %s with a string, skipping the indexer for null', (_, item, value, answer) => {
        if (value !== undefined) {
            element.setAttribute('aria-selected', value);
        }

        expect(domql.query('item?.aria["selected"] == "true"', { item: item === null ? null : element }).evaluate()).toBe(answer);
        expect(domql.query('{ read = item?.aria["selected"] }', { item: item === null ? null : element }).evaluate()).toEqual({ read: item === null ? null : value ?? null });
    });

    it('reads the attribute a dynamic key names, as the attribute indexer does, a null key answering null', () => {
        element.setAttribute('aria-expanded', 'false');
        element.setAttribute('data-key', 'expanded');

        expect(domql.query('e.aria[key]', { e: element, key: 'expanded' }).evaluate()).toBe('false');
        expect(evaluate('e.aria[e["data-key"]]')).toBe('false');
        expect(domql.query('e.aria[key]', { e: element, key: null }).evaluate()).toBeNull();
        expect(domql.query('e.aria[key]', { e: element, key: 'expanded' }).resolve().type.toString()).toBe('String?');
    });

    it.each([
        ['the view itself as a result, which is no data', 'e.aria', 'NEXO3043', 'The result would hold Aria, which is no data'],
        ['a native test the view has not', 'e.aria.hover()', 'NEXO3001', "'hover' is not available on Aria; it is available on Element"],
        ['an ARIA test nothing declares', 'e.aria.expanded()', 'NEXO3001', "'expanded' is no member of the vocabulary"],
    ])('refuses %s', (_, text, code, message) => {
        const error = getError(() => domql.query(text, { e: element }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it('reads the element again through its view cast back to an element', () => {
        element.setAttribute('aria-checked', 'true');

        expect(evaluate('{ checked = (e.aria as Element)["aria-checked"], same = (e.aria as Element) == e }')).toEqual({ checked: 'true', same: true });
    });
});

describe('domql arithmetic', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const errorOf = (text, bindings = {}) => getError(() => domql.query(text, bindings).evaluate());

    it('adds, subtracts, multiplies, divides and takes remainders of numbers, with the sign of the dividend', () => {
        expect(evaluate('{ a = x + y * 2, b = (x + y) * 2, c = x - y - 1, d = x / 4, e = -5 % 3, f = 5 % -3, g = -x, h = - -x, i = 2 * 3 % 4 }', { x: 10, y: 3 }))
            .toEqual({ a: 16, b: 26, c: 6, d: 2.5, e: -2, f: 2, g: -10, h: 10, i: 2 });
        expect(evaluate('a-b', { a: 5, b: 2 })).toBe(3);
        expect(evaluate('0.1 + 0.2')).toBe(0.1 + 0.2);
    });

    it('binds tighter than an equality and looser than a conversion, which converts before arithmetic', () => {
        const counter = document.createElement('div');

        counter.setAttribute('data-count', '4');

        expect(evaluate('counter["data-count"] to Number ?? 0', { counter })).toBe(4);
        expect(evaluate('(counter["data-count"] to Number ?? 0) + 1 == 5', { counter })).toBe(true);
        expect(evaluate('(a + b) to String', { a: 1, b: 3 })).toBe('4');
        expect(evaluate('-x to Number', { x: '4' })).toBe(-4);
        expect(evaluate('(-n) to String', { n: 4 })).toBe('-4');
        expect(evaluate('(try x to Number ?? 0) + 1', { x: 'four' })).toBe(1);
    });

    it('folds a negation of a numeric literal into the literal, negative zero kept, and of anything else into a negation, as the tree reads it', () => {
        const queryOf = text => domql.query(text).definition.expression;

        expect(Object.is(queryOf('-0').value, -0)).toBe(true);
        expect(queryOf('- 1.5e2')).toEqual({ kind: 'literal', value: -150 });
        expect(queryOf('-x')).toEqual({ kind: 'arithmeticNegation', operand: parameter('x') });
        expect(queryOf('-5 to String')).toEqual({ kind: 'arithmeticNegation', operand: { kind: 'conversion', type: 'String', operand: literal(5) } });
        expect(queryOf('(-5) to String')).toEqual({ kind: 'conversion', type: 'String', operand: literal(-5) });
        expect(queryOf('panel.client-size')).toEqual({ kind: 'arithmetic', operator: '-', left: member('client', parameter('panel')), right: parameter('size') });
    });

    it.each([
        ['an attempt as an operand, which can be null', 'try x to Number + 1', { x: '4' }, "The left operand of '+' can be null", 'NEXO3032'],
        ['a conversion of text that can be missing', 'panel["data-n"] to Number + 1', { panel: document.body }, "The left operand of '+' can be null", 'NEXO3032'],
        ['a string', '"a" + 1', {}, "The left operand of '+' is a number, and this one is String", 'NEXO3067'],
        ['a Boolean', 'x * true', { x: 2 }, "The right operand of '*' is a number, and this one is Boolean", 'NEXO3067'],
        ['a negation of text, which a conversion of the negated value would have made a number', '-5 to String', {}, "What '-' negates is a number, and this one is String", 'NEXO3067'],
        ['an event source', 'panel.on("click") + 1', { panel: document.body }, "The left operand of '+' is a value, and this one is a host call", 'NEXO3048'],
    ])('refuses %s, before anything is evaluated', (_, text, bindings, message, code) => {
        const error = getError(() => domql.query(text, bindings).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it.each([
        ['a division by zero', 'x / 0', "'/' divides by zero", 3, 'NEXO5005'],
        ['a remainder of a division by zero', 'x % y', "'%' divides by zero", 3, 'NEXO5005'],
        ['a result no finite number holds', 'x * 1e308 * 10', "The result of '*' is no finite number", 1, 'NEXO5020'],
    ])('fails %s at its operator\'s operation, naming where', (_, text, message, column, code) => {
        const error = errorOf(text, { x: 4, y: 0 });

        expect(error.kind).toBe('evaluation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1 });
    });

    it.each([
        ['a fallback holding a sum', 'a ?? b + 1', "'??' and '+' stand apart, one of them grouped: write '(… ?? …) + …' or '… ?? (… + …)'"],
        ['a sum taking a fallback', 'a + b ?? 0', "'??' and '+' stand apart, one of them grouped: write '(… + …) ?? …' or '… + (… ?? …)'"],
        ['a product beside a fallback', 'a * 2 ?? 0', "'??' and '*' stand apart"],
    ])('refuses %s where no group stands, as ?? stands apart from every binary operator', (_, text, message) => {
        expect(getError(() => domql.query(text)).message).toContain(message);
    });

    it('takes a negation beside ?? and a grouped side, which is no binary arithmetic beside it', () => {
        expect(evaluate('a ?? -1', { a: null })).toBe(-1);
        expect(evaluate('(a ?? 0) + 1', { a: null })).toBe(1);
        expect(evaluate('a ?? (b + 1)', { a: null, b: 2 })).toBe(3);
    });

    it('writes one space around a binary operator and none after a negation, grouping only where the reading needs it', () => {
        expect(domql.format('a+b*c')).toBe('a + b * c');
        expect(domql.format('(a + b) * c')).toBe('(a + b) * c');
        expect(domql.format('(a - b) - c')).toBe('a - b - c');
        expect(domql.format('a - (b - c)')).toBe('a - (b - c)');
        expect(domql.format('- (a + b)')).toBe('-(a + b)');
        expect(domql.format('- -x')).toBe('-(-x)');
        expect(domql.format('-(-1)')).toBe('-(-1)');
        expect(domql.format('a ?? -1')).toBe('a ?? -1');
        expect(domql.format('(a ?? 0) + 1')).toBe('(a ?? 0) + 1');
        expect(domql.format('(a + 1) == b')).toBe('a + 1 == b');
        expect(domql.format('(-5) to String')).toBe('(-5) to String');
        expect(domql.format('-5 to String')).toBe('-5 to String');
        expect(domql.format('(-0) { a = 1 }')).toBe('(-0) { a = 1 }');
        expect(domql.format('a * -2')).toBe('a * -2');
        expect(domql.format('-2 * 3')).toBe('-2 * 3');
    });

    it.each([
        ['written with no spaces', 'panel { w = it.client-size }', "'client' is no member of the vocabulary. Did you mean 'it.clientSize'?"],
        ['written with spaces, which may be a subtraction', 'panel { w = it.client - size }', "'client' is no member of the vocabulary. Did you mean 'it.clientSize'?"],
        ['spelled otherwise than the member', 'panel.client-SIZE', "'client' is no member of the vocabulary. Did you mean 'panel.clientSize'?"],
        ['subtracting a local', 'panel { let size = 1, w = it.client-size }', "Did you mean 'it.clientSize'?"],
        ['read where its receiver is not null', 'panel.first(".x")?.client-size', "Did you mean 'panel.first(\".x\")?.clientSize'?"],
        ['after a grouped receiver', '(panel ?? panel).client-size', "Did you mean '(panel ?? panel).clientSize'?"],
    ])('suggests the member a hyphen joins two names into, where no member has the first: %s', (_, text, message) => {
        expect(getError(() => domql.query(text, { panel: document.body, size: 1, SIZE: 1 }).resolve()).message).toContain(message);
    });

    it('suggests nothing where the joined name is no member of the receiver, or the first name is one', () => {
        expect(getError(() => domql.query('panel.nothing-here', { panel: document.body, here: 1 }).resolve()).message).toMatch(/'nothing' is no member of the vocabulary \(/);
        expect(getError(() => domql.query('panel.size-width', { panel: document.body, width: 1 }).resolve()).message).not.toContain('Did you mean');
    });

    it('refuses a definition with an operator arithmetic has none of, and takes a negation of any number', () => {
        const error = getError(() => domql.query(definitionOf({ kind: 'arithmetic', operator: '^', left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } })));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe('NEXO2000');
        expect(error.location.pointer).toBe('/expression/operator');
        expect(domql.query(definitionOf({ kind: 'arithmeticNegation', operand: { kind: 'literal', value: 2 } })).evaluate()).toBe(-2);
    });
});

describe('domql bodies', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const queryOf = text => domql.query(text).definition.expression;
    const conditional = (condition, consequent, alternative) => ({ kind: 'conditional', condition, consequent, alternative });

    it('gives the result its return gives, after its locals in order, a query, a do block and a branch alike', () => {
        expect(evaluate('let width = w\nlet padding = 12\nreturn width - padding * 2', { w: 100 })).toBe(76);
        expect(evaluate('return 4')).toBe(4);
        expect(evaluate('{ doubled = do\n    let width = w\n    return width * 2\nend }', { w: 5 })).toEqual({ doubled: 10 });
        expect(evaluate('do 7 end')).toBe(7);
        expect(evaluate('let available = (w\n    - padding * 2)\nlet doubled = available * 2\nreturn doubled', { w: 100, padding: 12 })).toBe(152);
    });

    it('gives each return\'s result to its own body, a branch\'s to its conditional and the conditional\'s to the binding that holds it', () => {
        expect(evaluate('let x = if wide then\n    let n = 3\n    return n * 2\nelse\n    return 0\nend\nreturn x + 1', { wide: true })).toBe(7);
        expect(evaluate('if wide then\n    let width = w\n    return if doubled then width * 2 else width end\nelse\n    return 0\nend', { wide: true, doubled: true, w: 5 })).toBe(10);
        expect(evaluate('if wide then\n    let width = w\n    return width\nelseif compact then\n    return 100\nelse\n    return 0\nend', { wide: false, compact: true, w: 5 })).toBe(100);
        expect(evaluate('if wide then 1 else 2 end', { wide: false })).toBe(2);
    });

    it('records a body of its locals and its result, a return of none, and a do block as the body it holds', () => {
        expect(queryOf('let a = 1\nreturn a')).toEqual({ kind: 'body', locals: [{ name: 'a', value: literal(1) }], result: { kind: 'local', name: 'a' } });
        expect(queryOf('do 7 end')).toEqual({ kind: 'do', body: literal(7) });
        expect(queryOf('do\n    let a = 1\n    return a\nend')).toEqual({ kind: 'do', body: { kind: 'body', locals: [{ name: 'a', value: literal(1) }], result: { kind: 'local', name: 'a' } } });
        expect(queryOf('return 7')).toEqual({ kind: 'body', locals: [], result: literal(7) });
        expect(queryOf('if a then 1 else 2 end')).toEqual(conditional(parameter('a'), literal(1), literal(2)));
    });

    it('evaluates every binding once, in order, an unused one included, where an object expression\'s unused local never runs', () => {
        expect(getError(() => evaluate('let unused = 1 / zero\nreturn 1', { zero: 0 })).message).toContain("'/' divides by zero");
        expect(evaluate('{ let unused = 1 / zero, a = 1 }', { zero: 0 })).toEqual({ a: 1 });
    });

    it('scopes each binding after its value, a nested body hiding an enclosing name, two of one body never sharing one', () => {
        expect(getError(() => domql.query('let a = b\nlet b = 1\nreturn a')).message).toContain("'b' is used before the local of that name is declared in its scope");
        expect(getError(() => domql.query('let a = a\nreturn a', { a: 1 })).message).toContain("'a' is used before the local of that name is declared in its scope");
        expect(getError(() => domql.query('let a = 1\nlet a = 2\nreturn a')).message).toContain("Two locals of one body are named 'a'");
        expect(evaluate('let a = ~a + 1\nreturn a', { a: 1 })).toBe(2);
        expect(evaluate('let w = 1\nlet inner = do\n    let w = 2\n    return w\nend\nreturn inner + w')).toBe(3);
    });

    it('returns the host call a script ends in after its locals, and gives a value wherever else it stands, refusing a host call there before anything is subscribed to', () => {
        const panel = document.createElement('div');
        const keys = [];
        const listener = domql.query('let k = "x"\nreturn panel.on("click") { key = k }', { panel }).subscribe((sender, args) => keys.push(args.value));

        panel.click();
        listener.dispose();

        const error = getError(() => domql.query('{ events = do\n    let k = "x"\n    return panel.on("click") { key = k }\nend }', { panel }).resolve());

        expect(keys).toEqual([{ key: 'x' }]);
        expect(error).toMatchObject({ kind: 'validation', code: 'NEXO3048', message: expect.stringContaining('A host call ends the script, and this body gives its result to the expression around it, which takes a value'), location: { pointer: '/expression/objectFields/0/value/body/result' } });
    });

    it('narrows a binding a test guards, and settles a fixed argument only where every binding and its result do', () => {
        const input = document.createElement('input');

        input.disabled = true;
        expect(evaluate('let p = input.parent\nreturn if p != null then p.children.count else 0 end', { input })).toBe(0);
        expect(domql.query('let type = do\n    let chosen = "click"\n    return chosen\nend\nreturn input.on(type) { button = it.button }', { input }).resolve().kind).toBe('subscription');
        expect(getError(() => domql.query('let type = do\n    let unused = input.rect\n    return "click"\nend\nreturn input.on(type) { button = it.button }', { input }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3006' });
    });

    it.each([
        ['branches of two styles', 'if wide then\n    let w = 5\n    return w * 2\nelse\n    0\nend', 'All branches of this conditional must give their results with return, or none of them', 5, 5, 'NEXO1054'],
        ['an elseif of the other style', 'if a then 1 elseif b then return 2 else 3 end', 'All branches of this conditional must give their results with return, or none of them', 1, 11, 'NEXO1054'],
        ['an expression standing before the result', 'a\n-b\nreturn 1', "Only locals may precede a body's result.", 1, 1, 'NEXO1031'],
        ['an expression before a returned result', 'panel.rect.width\nreturn 42', "Only locals may precede a body's result.", 1, 1, 'NEXO1031'],
        ['an expression after its locals that a return follows', 'let a = 1\na\nreturn a', "Only locals may precede a body's result.", 2, 1, 'NEXO1031'],
        ['locals whose result has no return', 'let a = 1\na', "Introduce the body's result with return.", 2, 1, 'NEXO1030'],
        ['locals with no result', 'if c then let a = 1 else 2 end', "Introduce the body's result with return.", 1, 21, 'NEXO1030'],
        ['a binding after its result', 'let a = 1\nreturn a\nlet b = 2', "Nothing follows a body's result, which ends it", 3, 1, 'NEXO1055'],
        ['a second result', 'let a = 1\nreturn a\nreturn 2', "Nothing follows a body's result, which ends it", 3, 1, 'NEXO1055'],
        ['a return with no value', 'let a = 1\nreturn', "'return' gives its body's result: write the value after it, as in 'return width'", 2, 1, 'NEXO1056'],
        ['a conditional without its end', 'if a then 1 else 2', "Expected 'end' closing the conditional", 1, 19, 'NEXO1029'],
        ['a do block without its end', 'do return 1', "Expected 'end' closing the do block", 1, 12, 'NEXO1029'],
        ['a do block holding nothing', 'do end', "A do block holds a body: write 'do return … end'", 1, 4, 'NEXO1511'],
        ['a do block that is an operand', '1 + do return 2 end', 'A do block that is an operand is enclosed in parentheses: write (do … end)', 1, 5, 'NEXO1027'],
        ['a do block that starts a chain', '(do return panel end).rect', 'A do block is never the receiver of a chain: bind its value to a local first', 1, 22, 'NEXO1028'],
        ['a conditional that starts a chain', '(if a then b else c end).rect', 'A conditional is never the receiver of a chain: bind its value to a local first', 1, 25, 'NEXO1028'],
        ['a do block a chain continues from without a group', 'do 1 end.x', 'A do block is never the receiver of a chain: bind its value to a local first', 1, 9, 'NEXO1028'],
        ['a conditional a chain continues from without a group', 'if a then b else c end?.rect', 'A conditional is never the receiver of a chain: bind its value to a local first', 1, 23, 'NEXO1028'],
    ])('refuses %s, naming where', (_, text, message, line, column, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line, column });
    });

    it('refuses a return among an object expression\'s fields, and takes a keyword naming a local or a field, a single = in an expression keeping its own message', () => {
        expect(getError(() => domql.query('{ a = 1, return 2 }'))).toMatchObject({ kind: 'syntax', code: 'NEXO1033' });
        expect(domql.query('let end = 1\nreturn @end').evaluate()).toBe(1);
        expect(domql.query('{ do = 1, return = 2 }').evaluate()).toEqual({ do: 1, return: 2 });
        expect(getError(() => domql.query('a = 1')).message).toContain("Unexpected '=' in an expression. Use '==' to compare values.");
    });

    it.each([
        ['locals that are no array', { kind: 'body', locals: {}, result: literal(1) }, '/expression/locals', 'NEXO2000'],
        ['two locals of one name', { kind: 'body', locals: [{ name: 'a', value: literal(1) }, { name: 'a', value: literal(2) }], result: literal(1) }, '/expression/locals/1', 'NEXO2015'],
        ['a do block a member reads', member('size', { kind: 'do', body: parameter('panel') }), '/expression/receiver', 'NEXO2003'],
        ['a body standing where no body stands', member('size', { kind: 'body', locals: [], result: parameter('panel') }), '/expression/receiver', 'NEXO2017'],
        ['a conditional a member reads', member('size', conditional(parameter('a'), parameter('b'), parameter('c'))), '/expression/receiver', 'NEXO2003'],
        ['branches of two styles', conditional(parameter('a'), { kind: 'body', locals: [], result: literal(1) }, literal(2)), '/expression', 'NEXO2524'],
        ['an alternative conditional of the other style', conditional(parameter('a'), { kind: 'body', locals: [], result: literal(1) }, conditional(parameter('b'), literal(2), literal(3))), '/expression', 'NEXO2524'],
    ])('refuses a definition of %s', (_, query, pointer, code) => {
        const error = getError(() => domql.query(definitionOf(query)));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe(code);
        expect(error.location.pointer).toBe(pointer);
    });

    it.each([
        ['a query that is a body', 'let a=1\nlet b=a*2\nreturn b', 'let a = 1\nlet b = a * 2\nreturn b'],
        ['a do block in a field', '{ doubled = do\nlet width = w\nreturn width * 2\nend }', '{\n    doubled = do\n        let width = w\n        return width * 2\n    end\n}'],
        ['a conditional of explicit results, each on its own lines', 'if a then\nlet x = 1\nreturn x\nelseif b then\nreturn 2\nelse\nreturn 3\nend', 'if a then\n    let x = 1\n    return x\nelseif b then\n    return 2\nelse\n    return 3\nend'],
        ['a conditional of implicit results, on one line', 'if a then 1 else 2 end', 'if a then 1 else 2 end'],
        ['an implicit conditional whose alternative is an explicit one, kept apart', 'if a then\n1\nelse\nif b then\nreturn 2\nelse\nreturn 3\nend\nend', 'if a then\n    1\nelse\n    if b then\n        return 2\n    else\n        return 3\n    end\nend'],
        ['a conditional on one line where a hole holds it', '$"{if a then 1 else 2 end}"', '$"{if a then 1 else 2 end}"'],
        ['a do block that is an operand, grouped, its closing parenthesis after its end', '(do\nreturn 2\nend\n)+1', '(do\n    return 2\nend\n) + 1'],
    ])('writes %s', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(domql.format(formatted)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    });
});

describe('domql functions', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const queryOf = text => domql.query(text).definition.expression;
    const panelOf = count => {
        const panel = document.createElement('div');

        for (let index = 0; index < count; index++) {
            panel.append(document.createElement('i'));
        }

        return panel;
    };

    it('calls a function a local holds by its name, with as many arguments as it declares, its body an expression alone or locals and a return', () => {
        expect(evaluate('let double = function(x) x * 2 end\nreturn double(3)')).toBe(6);
        expect(evaluate('let calculate = function(x)\n    let doubled = x * 2\n    return doubled + 1\nend\nreturn calculate(5)')).toBe(11);
        expect(evaluate('let area = function(width, height) width * height end\nreturn area(w, h)', { w: 3, h: 4 })).toBe(12);
        expect(evaluate('let seven = function() 7 end\nreturn seven()')).toBe(7);
        expect(evaluate('{ let double = function(x) x * 2 end, a = double(2), b = double(5) }')).toEqual({ a: 4, b: 10 });
        expect(evaluate('let classify = function(x)\n    if x < 0 then\n        return 0\n    else\n        let doubled = x * 2\n        return doubled + 1\n    end\nend\nreturn { a = classify(-1), b = classify(3) }')).toEqual({ a: 0, b: 7 });
    });

    it('resolves its body for each call against that call\'s arguments, so one function serves several types, and a function nothing calls never', () => {
        const panel = panelOf(2);

        expect(evaluate('let same = function(x) x end\nreturn { a = same(1), b = same("s"), c = same(panel).children.count }', { panel })).toEqual({ a: 1, b: 's', c: 2 });
        expect(evaluate('let unused = function(e) e.nothing end\nreturn 1')).toBe(1);
        expect(getError(() => domql.query('let count = function(e) e.nothing end\nreturn count(panel)', { panel }).resolve()).message).toContain("'nothing' is no member of the vocabulary");
    });

    it('captures the locals and the implicit parameter where it is declared, never a caller\'s', () => {
        expect(evaluate('let a = 1\nlet f = function() a end\nreturn do\n    let a = 2\n    return f()\nend')).toBe(1);
        expect(evaluate('panel { let count = function() it.children.count end, n = count() }', { panel: panelOf(3) })).toEqual({ n: 3 });
        expect(evaluate('panel { let outer = it, items = it.children { n = outer.children.count } }', { panel: panelOf(1) })).toEqual({ items: [{ n: 1 }] });
    });

    it('records a function as its parameters and its body, and a call as its name and arguments', () => {
        expect(queryOf('let f = function(x, y) x end\nreturn f(1, 2)')).toEqual({
            kind: 'body',
            locals: [{ name: 'f', value: { kind: 'function', parameters: ['x', 'y'], body: { kind: 'local', name: 'x' } } }],
            result: { kind: 'call', callee: { kind: 'local', name: 'f' }, arguments: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }] },
        });
    });

    it.each([
        ['a function calling itself', 'let f = function(x) f(x) end\nreturn 1', "'f' is called before the local of that name is declared in its scope, so no function calls itself or one declared after it", 'NEXO2016'],
        ['a function calling one declared after it', 'let f = function(x) g(x) end\nlet g = function(x) x end\nreturn f(1)', "'g' is called before the local of that name is declared in its scope", 'NEXO2016'],
        ['two parameters of one name', 'let f = function(x, x) x end\nreturn 1', "Two parameters of one function are named 'x'", 'NEXO2032'],
    ])('refuses %s when the query is created', (_, text, message, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it.each([
        ['a function given as the result', 'let f = function(x) x end\nreturn f', 'The result would hold a function, which is used within the expression and never part of its result: call it, as name(…)', 'NEXO3035'],
        ['a function compared', 'let f = function(x) x end\nreturn f == f', "'==' compares a value of function with null alone", 'NEXO3066'],
        ['a call given too many arguments', 'let f = function(x) x end\nreturn f(1, 2)', "'f' takes one argument, and is given 2", 'NEXO3069'],
        ['a call given too few', 'let f = function(x, y) x end\nreturn f(1)', "'f' takes 2 arguments, and is given 1", 'NEXO3069'],
        ['a call of a local holding a value', 'let v = 1\nreturn v(2)', "'v' is a local holding a value, and no function, so it is read without parentheses", 'NEXO3068'],
        ['a call no function answers', 'nothing(2)', "No function named 'nothing' is in scope", 'NEXO3033'],
        ['a call of what the implicit parameter has as a member', 'panel { row = first(".row") }', "No function named 'first' is in scope; write 'it.first(…)' for the member of the implicit parameter", 'NEXO3033'],
        ['a call settling a fixed argument', 'let type = function() "click" end\nreturn panel.on(type()) { button = it.button }', "selects from the vocabulary, so it is a string the expression's resolution settles", 'NEXO3006'],
    ])('refuses %s before anything is evaluated', (_, text, message, code) => {
        const error = getError(() => domql.query(text, { panel: panelOf(1) }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it.each([
        ['a function that is an operand', '1 + function() 1 end', 'A function is the value of a local: write let name = function(…) … end, and call it by its name', 'NEXO1034'],
        ['a function that is a field\'s value', '{ f = function(x) x end }', 'A function is the value of a local', 'NEXO1034'],
        ['a function a conditional chooses', 'let f = if a then function() 1 end else function() 2 end end\nreturn 1', 'A function is the value of a local', 'NEXO1034'],
        ['a function that is an argument', 'let calculate = function(f) 1 end\nreturn calculate(function(x) x * 2 end)', "A function declared with 'function' cannot appear directly as an argument. Bind it to a local and pass its name, or use an arrow function.", 'NEXO1035'],
        ['a function that is a body\'s result', 'return function(x) x end', 'A function is the value of a local', 'NEXO1034'],
        ['a parameter written with @', 'let f = function(@end) 1 end\nreturn 1', "A parameter is declared as it is written, with no '@': write 'end'", 'NEXO1008'],
        ['a function without its end', 'let f = function(x) x', "Expected 'end' closing the function", 'NEXO1029'],
        ['a function holding nothing', 'let f = function(x) end\nreturn 1', 'A function holds a body', 'NEXO1511'],
        ['a comma after the last parameter', 'let f = function(x,) x end\nreturn 1', "Expected a parameter's name, found ')'", 'NEXO1000'],
        ['a comma after the last argument', 'let f = function(x) x end\nreturn f(1,)', "Expected a value, found ')'", 'NEXO1000'],
        ['an argument written as a named one', 'let f = function(x) x end\nreturn f(x = 1)', "An argument is written as its value alone, as 'f(…)' takes it (line", 'NEXO1012'],
        ['an optional enclosed access opening the parentheses', 'let f = function(x) x end\nreturn f(?panel.parent)', "A call whose argument is an optional enclosed access writes it in parentheses of its own: 'f((?…))'", 'NEXO1015'],
    ])('refuses %s as text', (_, text, message, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it('locates an error in a call\'s body at the function it calls', () => {
        const error = getError(() => domql.query('let count = function(e) e.nothing end\nreturn count(panel)', { panel: panelOf(1) }).resolve());

        expect(error.location).toMatchObject({ line: 1, column: 25 });
    });

    it.each([
        ['a function of one expression, on its line', 'let f=function(x)x*2 end\nreturn f(1)', 'let f = function(x) x * 2 end\nreturn f(1)'],
        ['a function whose body returns, on the lines within it', 'let f = function(x)\nlet d = x * 2\nreturn d\nend\nreturn f(1)', 'let f = function(x)\n    let d = x * 2\n    return d\nend\nreturn f(1)'],
        ['a function whose one expression spans lines', 'let f = function(x)\nif x < 0 then\nreturn 0\nelse\nreturn x\nend\nend\nreturn f(1)', 'let f = function(x)\n    if x < 0 then\n        return 0\n    else\n        return x\n    end\nend\nreturn f(1)'],
        ['a function in an object local', '{ let f = function(a, b) a + b end, s = f(1, 2) }', '{\n    let f = function(a, b) a + b end,\n    s = f(1, 2)\n}'],
    ])('writes %s', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(domql.format(formatted)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    });

    it.each([
        ['a function that is no local\'s value', { kind: 'object', objectFields: [{ name: 'f', value: { kind: 'function', parameters: [], body: { kind: 'literal', value: 1 } } }] }, '/expression/objectFields/0/value', 'NEXO2004'],
        ['a call whose arguments are no array', { kind: 'call', callee: { kind: 'local', name: 'f' }, arguments: {} }, '/expression/arguments', 'NEXO2000'],
        ['parameters that are no array', { kind: 'body', locals: [{ name: 'f', value: { kind: 'function', parameters: 'x', body: { kind: 'literal', value: 1 } } }], result: { kind: 'literal', value: 1 } }, '/expression/locals/0/value/parameters', 'NEXO2000'],
    ])('refuses a definition of %s', (_, query, pointer, code) => {
        const error = getError(() => domql.query(definitionOf(query)));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe(code);
        expect(error.location.pointer).toBe(pointer);
    });
});

describe('domql simple expressions', () => {
    // The functions the examples call, each declared as a local before the query's result.
    const FUNCTIONS = 'let calculate = function(x) x end\nlet inspect = function(x) 1 end\nlet area = function(a, b) 1 end\nlet double = function(x) x * 2 end\nlet check = function(x) x end\n';
    const created = text => domql.query(`${FUNCTIONS}return ${text}`);

    it.each([
        'calculate(10)',
        'calculate(width)',
        'calculate(~width)',
        'area(width, height)',
        'calculate(width * 2)',
        'calculate(double(width))',
        'calculate(panel.width)',
        'calculate(if compact then 10 else 20 end)',
        'calculate((if compact then 10 else 20 end))',
        'check(enabled and visible)',
        'check(enabled or fallback)',
        'check(not disabled)',
        'calculate(\n    if compact then\n        10\n    else\n        20\n    end\n)',
        'calculate({ width = width * 2, label = $"{width}" })',
        'calculate(if compact then double(1) else $"{width}" end)',
    ])('takes %s as an argument', text => {
        expect(() => created(text)).not.toThrow();
    });

    it.each([
        'panel { a = inspect(it) }',
        'panel.matches(selector)',
        'panel { a = it[attributeName] }',
        'panel { a = it[key] }',
        'panel.[propertyName]',
        '$"Total: {width * 2}"',
    ])('takes a simple expression in %s', text => {
        expect(() => created(text)).not.toThrow();
    });

    const DO_BLOCK = 'which holds no do block';
    const BINDING = 'whose conditional tests a value and binds none';
    const RETURN = "whose conditional gives each branch's value without return or locals";
    const NESTED = 'whose conditional holds no other conditional, elseif included';

    it.each([
        ['a do block', 'calculate(do\n    let doubled = width * 2\n    return doubled + 1\nend)', `An argument is a simple expression, ${DO_BLOCK}`, 'NEXO2011'],
        ['a conditional binding', 'calculate(if let width = panel.width then width else 0 end)', BINDING, 'NEXO2011'],
        ['branches that return', 'calculate(if compact then\n    return 10\nelse\n    return 20\nend)', RETURN, 'NEXO2011'],
        ['branches of locals', 'calculate(if compact then\n    return 10\nelse\n    let doubled = width * 2\n    return doubled\nend)', RETURN, 'NEXO2011'],
        ['an elseif', 'calculate(if compact then 10 elseif narrow then 15 else 20 end)', NESTED, 'NEXO2011'],
        ['a conditional in a branch', 'calculate(if compact then 10 else if narrow then 15 else 20 end end)', NESTED, 'NEXO2011'],
        ['a conditional in a call within a branch', 'calculate(if compact then double(if narrow then 1 else 2 end) else 20 end)', NESTED, 'NEXO2011'],
        ['a conditional in an interpolation within a test', 'calculate(if $"{if narrow then 1 else 2 end}" == "1" then 10 else 20 end)', NESTED, 'NEXO2011'],
        ['an object expression of locals', 'calculate({ let w = width, a = w })', 'whose object expressions hold no locals', 'NEXO2527'],
        ['a do block in a member call', 'panel.matches(do\n    return selector\nend)', `An argument is a simple expression, ${DO_BLOCK}`, 'NEXO2011'],
        ['a do block in an indexer', 'panel { a = it[do\n    return attributeName\nend] }', `An indexer's key is a simple expression, ${DO_BLOCK}`, 'NEXO2011'],
        ['a do block in a computed property access', 'panel.[do\n    return propertyName\nend]', `The name a computed property access reads is a simple expression, ${DO_BLOCK}`, 'NEXO2011'],
        ['a do block in an interpolation, which stands on one line', '$"Total: {do 10 end}"', `An interpolation's expression is a simple expression, ${DO_BLOCK}`, 'NEXO2011'],
        ['a do block in parentheses', 'calculate((do\n    return 10\nend))', DO_BLOCK, 'NEXO2011'],
        ['a conditional binding in parentheses', 'calculate((if let width = panel.width then width else 0 end))', BINDING, 'NEXO2011'],
        ['branches that return, in parentheses', 'calculate((if compact then\n    return 10\nelse\n    return 20\nend))', RETURN, 'NEXO2011'],
        ['an elseif in parentheses', 'calculate((if compact then 10 elseif narrow then 15 else 20 end))', NESTED, 'NEXO2011'],
        ['a conditional in parentheses in a branch', 'calculate(if compact then 10 else (if narrow then 15 else 20 end) end)', NESTED, 'NEXO2011'],
    ])('refuses %s as a simple expression', (_, text, message, code) => {
        const error = getError(() => created(text));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location.line).toBeGreaterThan(5);
    });

    it('takes the value of a block a local holds, a function\'s result, and a function itself, passed by its name', () => {
        expect(() => created('do\n    let adjusted = do\n        let doubled = width * 2\n        return doubled + 1\n    end\n    return calculate(adjusted)\nend')).not.toThrow();
        expect(domql.query('let double = function(x) x * 2 end\nlet calculate = function(x) x + 1 end\nreturn calculate(double(3))').evaluate()).toBe(7);
        expect(domql.query('let double = function(x) x * 2 end\nlet calculate = function(f) f(3) + 1 end\nreturn calculate(double)').evaluate()).toBe(7);
    });

    it('restricts what is written, never the body of a function an argument calls', () => {
        expect(domql.query('let classify = function(x)\n    let doubled = x * 2\n    return if doubled > 4 then\n        return 1\n    elseif doubled > 2 then\n        return 2\n    else\n        return do\n            return 3\n        end\n    end\nend\nreturn { a = classify(3), b = classify(1.5), c = classify(0) }').evaluate()).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('refuses a definition whose argument holds a conditional of branches that return, naming the branch', () => {
        const query = {
            kind: 'call', callee: member('matches', parameter('panel')),
            arguments: [{ kind: 'conditional', condition: parameter('a'), consequent: { kind: 'body', locals: [], result: { kind: 'literal', value: '.a' } }, alternative: { kind: 'body', locals: [], result: { kind: 'literal', value: '.b' } } }],
        };
        const error = getError(() => domql.query(definitionOf(query)));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe('NEXO2011');
        expect(error.location.pointer).toBe('/expression/arguments/0/consequent');
    });
});

describe('domql reserved names', () => {
    // The words the language reserves, and the name of DOMQL's module, which the import DOMQL supplies to every query reserves.
    const RESERVED = ['true', 'false', 'null', 'it', 'not', 'try', 'as', 'to', 'and', 'or', 'if', 'then', 'elseif', 'else', 'let', 'do', 'end', 'return', 'function', 'root', 'Domql'];
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const roundTrips = text => {
        const formatted = domql.format(text);

        expect(domql.format(formatted)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    };

    it.each(RESERVED)('declares %s plainly as a body local, an object local, a field, a function and its parameter, and a conditional binding, each read after @', word => {
        expect(evaluate(`let ${word} = 1\nreturn @${word} + 1`)).toBe(2);
        expect(evaluate(`{ let ${word} = 1, a = @${word} }`)).toEqual({ a: 1 });
        expect(evaluate(`{ ${word} = 1, a = @${word} + 1 }`)).toEqual({ [word]: 1, a: 2 });
        expect(evaluate(`let ${word} = function(${word}) @${word} * 2 end\nreturn @${word}(3)`)).toBe(6);
        expect(evaluate(`if let ${word} = 1 then @${word} else 0 end`)).toBe(1);
        roundTrips(`let ${word} = 1\nreturn { ${word} = @${word}, a = @${word} }`);
    });

    it.each(RESERVED)('names a member and a named indexer %s as it is written, and reads a string of the word in brackets as that member', word => {
        expect(evaluate(`value.${word}`, { value: { [word]: 5 } })).toBe(5);
        expect(evaluate(`value?.${word}`, { value: { [word]: 6 } })).toBe(6);
        expect(domql.query(`panel.${word}["key"]`).definition.expression).toMatchObject({ kind: 'indexerAccess', receiver: { kind: 'memberAccess', name: word } });
        expect(domql.query(`value.["${word}"]`).definition).toEqual(domql.query(`value.${word}`).definition);
        expect(domql.format(`value.["${word}"]`)).toBe(`value.${word}`);
    });

    it('keeps a bare reserved word its meaning whatever a local or a field of its name holds', () => {
        expect(evaluate('let true = 2\nreturn { literal = true, local = @true }')).toEqual({ literal: true, local: 2 });
        expect(evaluate('let it = 3\nreturn panel { children = it.children.count, local = @it }', { panel: document.createElement('div') })).toEqual({ children: 0, local: 3 });
        expect(domql.query('let Domql = 1\nreturn { namespace = Domql.window, local = @Domql, caller = ~Domql }').definition.expression.result.objectFields.map(field => field.value)).toEqual([
            domqlMember('window'),
            { kind: 'local', name: 'Domql' },
            parameter('Domql'),
        ]);
        expect(evaluate('let Domql = 1\nreturn { local = @Domql, caller = ~Domql, namespace = Domql.window.devicePixelRatio > 0 }', { Domql: 7 })).toEqual({ local: 1, caller: 7, namespace: true });
    });

    it('reads after @ the nearest local or field of a reserved name, and refuses one no scope declares, which ~ reads the script parameter of', () => {
        expect(evaluate('let to = 1\nreturn do\n    let to = 2\n    return @to\nend')).toBe(2);
        expect(evaluate('let to = 1\nreturn ~to', { to: 5 })).toBe(5);

        const error = getError(() => domql.query('@domql'));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe('NEXO2012');
        expect(error.message).toContain("No local, object field, conditional binding or function parameter named 'domql' is in scope. Use '~domql' to read the script parameter.");
        expect(getError(() => domql.query(definitionOf({ kind: 'local', name: 'to' })))).toMatchObject({ kind: 'structure', code: 'NEXO2012', location: { pointer: '/expression' } });
    });

    it('calls a function a reserved word names after @', () => {
        expect(evaluate('let end = function(x) x + 1 end\nreturn @end(1)')).toBe(2);
        expect(domql.format('let end = function(x) x + 1 end\nreturn @end(1)')).toBe('let end = function(x) x + 1 end\nreturn @end(1)');
    });

    it('takes to as a declared name, a reference, a field, a member and a conversion in one query', () => {
        expect(evaluate('let to = "3"\nreturn { to = @to to Number, from = range.to, next = @to + 1 }', { range: { to: 9 } })).toEqual({ to: 3, from: 9, next: 4 });
    });

    it.each([
        ['a body local written with @', 'let @to = 1\nreturn 1', "A name is declared as it is written, with no '@': write 'let to = …'", 'NEXO1008'],
        ['an object local written with @', '{ let @to = 1, a = 1 }', "A name is declared as it is written, with no '@': write 'let to = …'", 'NEXO1008'],
        ['a field written with @', '{ @true = 1 }', "A name is declared as it is written, with no '@': write 'true = …'", 'NEXO1008'],
        ['a conditional binding written with @', 'if let @to = 1 then 1 else 2 end', "A name is declared as it is written, with no '@': write 'if let to = …'", 'NEXO1008'],
        ['a parameter written with @', 'let f = function(@to) 1 end\nreturn 1', "A parameter is declared as it is written, with no '@': write 'to'", 'NEXO1008'],
        ['a member written with @', 'value.@null', "A member is named as it is written after its dot, with no '@': write '.null'", 'NEXO1008'],
        ['an indexer written with @', 'value.@true["k"]', "A member is named as it is written after its dot, with no '@': write '.true'", 'NEXO1008'],
        ['@ before a space', '@ to', "An identifier follows '@' directly, as @to", 'NEXO1050'],
        ['@ before what is no word', '@1', "'@' and what follows it are no lexical reference", 'NEXO1050'],
        ['a bare keyword where a value stands', 'let to = 1\nreturn to + 1', "Found 'to', a keyword: write '@to' for the local, object field, conditional binding or function parameter of that name", 'NEXO1010'],
    ])('refuses %s as text', (_, text, message, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
    });

    it.each([
        ['an ordinary binding nothing hides, bare', parameter('panel'), 'panel'],
        ['a reserved binding, after ~', parameter('to'), '~to'],
        ['a binding a field hides, after ~', { kind: 'object', objectFields: [{ name: 'panel', value: literal(1) }, { name: 'a', value: parameter('panel') }] }, '{\n    panel = 1,\n    a = ~panel\n}'],
        ['a reserved local, after @', { kind: 'body', locals: [{ name: 'to', value: literal(1) }], result: { kind: 'local', name: 'to' } }, 'let to = 1\nreturn @to'],
        ['a member of a module, through its namespace', domqlMember('document'), 'Domql.document'],
        ['a binding named after a module, after ~', parameter('Domql'), '~Domql'],
    ])('writes %s', (_, query, text) => {
        expect(domql.format(definitionOf(query))).toBe(text);
        expect(domql.query(text).definition.expression).toEqual(query);
    });
});

describe('domql field scope', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();

    it('brings a field into scope after its initializer, which still reads the name outside, hiding an outer local, field or binding for the entries after it', () => {
        expect(evaluate('let count = 10\nreturn {\n    before = count,\n    count = count + 1,\n    after = count\n}')).toEqual({ before: 10, count: 11, after: 11 });
        expect(evaluate('let domql = 1\nreturn { domql = @domql + 1, after = @domql }')).toEqual({ domql: 2, after: 2 });
        expect(evaluate('{ count = 1, a = count, b = ~count }', { count: 9 })).toEqual({ count: 1, a: 1, b: 9 });
        expect(evaluate('{ a = 1, b = { a = a + 1, c = a }, d = a }')).toEqual({ a: 1, b: { a: 2, c: 2 }, d: 1 });
    });

    it('scopes each projection\'s fields to its own item, and leaves a local\'s value to the field of its name that exposes it', () => {
        const panel = document.createElement('div');

        panel.innerHTML = '<i data-key="a"></i><i data-key="b"></i>';
        expect(evaluate('panel.children { key = it["data-key"] ?? "-", label = $"{key}!" }', { panel })).toEqual([{ key: 'a', label: 'a!' }, { key: 'b', label: 'b!' }]);
        expect(evaluate('{ let n = 2, n = n * 2, m = n + 1 }')).toEqual({ n: 4, m: 5 });
    });

    it('lets an object local and a conditional binding hide an outer name, and never two locals or two fields of one scope share one', () => {
        expect(evaluate('let a = 1\nreturn { let a = 2, b = a }')).toEqual({ b: 2 });
        expect(evaluate('let a = 1\nreturn if let a = 3 then a else 0 end')).toBe(3);
        expect(getError(() => domql.query('{ let a = 1, let a = 2, b = a }')).message).toContain("Two locals of one object expression are named 'a'");
        expect(getError(() => domql.query('{ a = 1, a = 2 }')).message).toContain("Two fields of one object expression are named 'a'");
    });
});

describe('domql object root', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const refusalOf = (text, bindings = {}) => getError(() => domql.query(text, bindings).resolve());
    const root = { kind: 'root' };
    const notCompleted = (name, completed) => `'${name}' is no field of root completed where the reference to it is written; ${completed}`;
    const heldBy = name => `The field '${name}' would hold root, the object being built, which no result holds; read its fields, as root.name`;

    it('reads the fields of the outermost object completed where root is written, from any object nested in it', () => {
        const panel = document.createElement('div');
        const text = [
            'panel {',
            '    let bar = 4,',
            '    bar = bar,',
            '',
            '    dimensions = {',
            '        width = it.clientSize?.width ?? 0,',
            '        height = width * 2,',
            '        bar = 2,',
            '        foo = bar,',
            '',
            '        nested = {',
            '            myField = root.bar,',
            '        },',
            '    },',
            '',
            '    anotherObject = {',
            '        x = dimensions.width,',
            '    },',
            '}',
        ].join('\n');

        expect(evaluate(text, { panel })).toEqual({ bar: 4, dimensions: { width: 0, height: 0, bar: 2, foo: 2, nested: { myField: 4 } }, anotherObject: { x: 0 } });
        expect(evaluate('panel { a = 1, b = root.a, c = root.[name] }', { panel, name: 'a' })).toEqual({ a: 1, b: 1, c: 1 });
        expect(evaluate('{ a = 1, b = { a = 2, c = root.a, d = a } }')).toEqual({ a: 1, b: { a: 2, c: 1, d: 2 } });
    });

    it('holds a bare root as a value, which an alias, a function argument, a returned reference and a conditional keep', () => {
        expect(evaluate('{ a = 1, b = do\n    let r = root\n    return r.a + 1\nend }')).toEqual({ a: 1, b: 2 });
        expect(evaluate('{ a = 1, b = { let r = root, c = r.a } }')).toEqual({ a: 1, b: { c: 1 } });
        expect(evaluate('{ let f = function(r) r.a * 10 end, a = 2, b = f(root) }')).toEqual({ a: 2, b: 20 });
        expect(evaluate('{ let identity = function(value) value end, a = 1, b = identity(root).a }')).toEqual({ a: 1, b: 1 });
        expect(evaluate('{ a = 1, b = do\n    let r = if f then root else root end\n    return r.a\nend }', { f: true })).toEqual({ a: 1, b: 1 });
        expect(evaluate('{ a = 1, b = (root ?? root).a }')).toEqual({ a: 1, b: 1 });
        expect(evaluate('{ a = 1, b = do\n    let r = if f then root else null end\n    return r?.a\nend }', { f: false })).toEqual({ a: 1, b: null });
    });

    it('gives a function the fields completed where it is declared, and a parameter those of the argument each call passes', () => {
        expect(evaluate('{ a = 1, b = { let g = function() root.a end, c = g() } }')).toEqual({ a: 1, b: { c: 1 } });
        expect(refusalOf('{ let g = function() root.a end, a = 1, b = g() }').message).toContain(notCompleted('a', 'none is completed there'));
        expect(evaluate('{ let f = function(r) r.b end, a = 1, b = 2, c = f(root) }')).toEqual({ a: 1, b: 2, c: 2 });
        expect(refusalOf('{ let f = function(r) r.b end, a = 1, c = f(root), b = 2 }').message).toContain(notCompleted('b', 'those completed are a'));
    });

    it('refuses a field no path to root has completed, through a nested object, an alias, an argument and a returned reference', () => {
        expect(refusalOf('{ b = { c = root.a }, a = 1 }').message).toContain(notCompleted('a', 'none is completed there'));
        expect(refusalOf('{ a = 1, b = { c = root.b } }').message).toContain(notCompleted('b', 'those completed are a'));
        expect(refusalOf('{ let r = root, a = 1, b = r.a }').message).toContain(notCompleted('a', 'none is completed there'));
        expect(refusalOf('{ a = 1, b = do\n    let r = root\n    return r.b\nend }').message).toContain(notCompleted('b', 'those completed are a'));
        expect(refusalOf('{ let identity = function(value) value end, a = 1, b = identity(root).b }').message).toContain(notCompleted('b', 'those completed are a'));
        expect(refusalOf('xs { a = root.a }', { xs: [] }).message).toContain(notCompleted('a', 'none is completed there'));
        expect(refusalOf('{ a = 1, c = root.[if f then "a" else "b" end], b = 2 }', { f: false }).message).toContain(notCompleted('b', 'those completed are a'));
        expect(refusalOf('{ a = 1, b = root.a() }').message).toContain("'root' is read through its fields, as root.name or root.[name], and 'a' is called");
        expect(refusalOf('{ a = 1, b = root["a"] }').message).toContain("'root' is read through its fields, as root.name or root.[name], and '[…]' is an indexer");
    });

    it('merges references that identify one outermost object with the same fields, and refuses references with other fields', () => {
        expect(refusalOf('{ let early = function() root end, a = 1, b = do\n    let r = if f then root else early() end\n    return 1\nend }', { f: true }).message).toContain("The branches of 'if' are of one type, and these are root { a: Number } and root { }");
        expect(refusalOf('{ a = 1, b = do\n    let r = root ?? { x = 1 }\n    return 1\nend }').message).toContain("The value and the fallback of '??' are of one type, and these are root { a: Number } and { x: Number }");
    });

    it('refuses every result that would hold root, an acyclic one included', () => {
        expect(refusalOf('{ copy = root }').message).toContain(heldBy('copy'));
        expect(refusalOf('{ a = 1, b = root }').message).toContain(heldBy('b'));
        expect(refusalOf('{ a = 1, b = { copy = root } }').message).toContain(heldBy('copy'));
        expect(refusalOf('{ a = 1, b = do\n    return root\nend }').message).toContain(heldBy('b'));
        expect(refusalOf('{ let identity = function(value) value end, a = 1, b = identity(root) }').message).toContain(heldBy('b'));
        expect(refusalOf('{ a = 1, b = if f then root else null end }', { f: true }).message).toContain(heldBy('b'));
    });

    it('refuses root where no object expression encloses it, its receiver included, with a structure error', () => {
        const message = "'root' refers to the outermost object being built, and no object expression encloses it here";

        expect(getError(() => domql.query('root.a'))).toMatchObject({ kind: 'structure', code: 'NEXO2018', message: expect.stringContaining(message) });
        expect(getError(() => domql.query('root { a = 1 }'))).toMatchObject({ kind: 'structure', code: 'NEXO2018', message: expect.stringContaining(message) });
        expect(getError(() => domql.query('let f = function() root.a end\nreturn { a = 1, b = f() }'))).toMatchObject({ kind: 'structure', message: expect.stringContaining(message) });
        expect(getError(() => domql.query(definitionOf(member('a', root))))).toMatchObject({ kind: 'structure', code: 'NEXO2018', location: { pointer: '/expression/receiver' } });
    });

    it('builds an outermost object for each evaluation, each item of an outermost projection and each object a function declared outside every one builds', () => {
        const panel = document.createElement('div');

        panel.innerHTML = '<i data-key="a"></i><i data-key="b"></i>';
        expect(evaluate('panel.children { key = it["data-key"] ?? "-", same = root.key }', { panel })).toEqual([{ key: 'a', same: 'a' }, { key: 'b', same: 'b' }]);
        expect(evaluate('let make = function(n) { a = n, b = root.a } end\nreturn { x = make(1), y = make(2) }')).toEqual({ x: { a: 1, b: 1 }, y: { a: 2, b: 2 } });

        const query = domql.query('{ n = count, twice = root.n * 2 }', { count: 1 });

        expect(query.evaluate()).toEqual({ n: 1, twice: 2 });
        expect(query.evaluate()).toEqual({ n: 1, twice: 2 });
    });

    it('builds an outermost object for each event', () => {
        const panel = document.createElement('div');
        const values = [];
        const listener = domql.query('panel.on("click") { button = it.button, same = root.button }', { panel }).subscribe((_sender, args) => values.push(args.value));

        panel.dispatchEvent(new window.MouseEvent('click', { button: 0 }));
        panel.dispatchEvent(new window.MouseEvent('click', { button: 1 }));
        listener.dispose();

        expect(values).toEqual([{ button: 0, same: 0 }, { button: 1, same: 1 }]);
    });

    it('reads a local or a field named root with @root, and a caller binding with ~root', () => {
        expect(evaluate('let root = 5\nreturn { a = @root }')).toEqual({ a: 5 });
        expect(evaluate('{ root = 1, b = @root, c = root.root }')).toEqual({ root: 1, b: 1, c: 1 });
        expect(evaluate('{ a = 1, b = root.a, c = ~root }', { root: 7 })).toEqual({ a: 1, b: 1, c: 7 });
    });

    it('records root as the root node, which text and the definition give each other', () => {
        const text = '{\n    a = 1,\n    b = root.a,\n    c = root[name]\n}';
        const { definition } = domql.query(text);

        expect(definition.expression.objectFields[1].value).toEqual(member('a', root));
        expect(domql.format(definition)).toBe(text);
        expect(domql.query(domql.format(definition)).definition).toEqual(definition);
        expect(domql.query(definitionOf({ kind: 'object', objectFields: [{ name: 'a', value: literal(1) }, { name: 'b', value: member('a', root) }] })).evaluate()).toEqual({ a: 1, b: 1 });
    });
});

describe('domql function values and arrow functions', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const refusalOf = (text, bindings = {}) => getError(() => domql.query(text, bindings).resolve());
    const regularInArgument = "A function declared with 'function' cannot appear directly as an argument. Bind it to a local and pass its name, or use an arrow function.";
    const arrowBody = "An arrow function's body is a simple expression, which gives its result: a function that holds more is a regular function bound to a local, passed by its name";

    it.each([
        ['no parameter', 'let answer = () => 42\nreturn answer()', 42],
        ['one parameter alone', 'let double = row => row * 2\nreturn double(4)', 8],
        ['one parameter in parentheses', 'let double = (row) => row * 2\nreturn double(4)', 8],
        ['two parameters', 'let difference = (left, right) => left - right\nreturn difference(7, 2)', 5],
        ['a body laid out on lines of its own', 'let classify = x =>\n    if x > 1 then "many" else "one" end\nreturn classify(3)', 'many'],
    ])('declares an arrow function of %s, whose expression gives its result', (_, text, expected) => {
        expect(evaluate(text)).toBe(expected);
    });

    it('writes an arrow function as its canonical text, one parameter without parentheses, and records it as a function marked arrow', () => {
        const { definition } = domql.query('let double = (row) => row * 2\nreturn double(4)');

        expect(definition.expression.locals[0].value).toEqual({ kind: 'function', parameters: ['row'], body: { kind: 'arithmetic', operator: '*', left: { kind: 'local', name: 'row' }, right: literal(2) }, arrow: true });
        expect(domql.format(definition)).toBe('let double = row => row * 2\nreturn double(4)');
        expect(domql.format('let f = (a, b) => a\nreturn f(1, 2)')).toBe('let f = (a, b) => a\nreturn f(1, 2)');
        expect(domql.format('let f = () => 1\nreturn f()')).toBe('let f = () => 1\nreturn f()');
        expect(domql.format('let f = it => @it + 1\nreturn f(1)')).toBe('let f = it => @it + 1\nreturn f(1)');
        expect(domql.query(domql.format(definition)).definition).toEqual(definition);
    });

    it('stores, aliases, calls and passes a function declared either way, and an arrow written as an argument', () => {
        expect(evaluate('let arrow = row => row * 2\nlet first = arrow\nreturn first(4)')).toBe(8);
        expect(evaluate('let regular = function(row) row + 1 end\nlet second = regular\nreturn second(4)')).toBe(5);
        expect(evaluate('let apply = function(f, x) f(x) end\nlet regular = function(row) row + 1 end\nreturn apply(regular, 4) + apply(row => row * 3, 2)')).toBe(11);
    });

    it('refuses a regular function written as an argument, in text and in a definition', () => {
        expect(getError(() => domql.query('let apply = function(f) f(1) end\nreturn apply(function(x) x end)')).message).toContain(regularInArgument);

        const query = { kind: 'call', callee: { kind: 'local', name: 'apply' }, arguments: [{ kind: 'function', parameters: ['x'], body: { kind: 'local', name: 'x' } }] };
        const definition = definitionOf({ kind: 'body', locals: [{ name: 'apply', value: { kind: 'function', parameters: ['f'], body: { kind: 'call', callee: { kind: 'local', name: 'f' }, arguments: [literal(1)] } } }], result: query });

        expect(getError(() => domql.query(definition))).toMatchObject({ kind: 'structure', code: 'NEXO2005', message: expect.stringContaining(regularInArgument) });
    });

    it.each([
        ['an arrow function', 'let f = x => y => x\nreturn 1'],
        ['locals', 'let f = x => let y = 1\nreturn 1'],
    ])('refuses an arrow function whose body is %s, which no simple expression is', (_, text) => {
        expect(getError(() => domql.query(text)).message).toContain(arrowBody);
    });

    it('refuses a do block or a conditional binding in an arrow function\'s body, pointing to a regular function', () => {
        expect(getError(() => domql.query('let f = x => do 1 end\nreturn 1')).message).toContain("An arrow function's body is a simple expression, which holds no do block: a function that holds more is a regular function bound to a local, passed by its name");
        expect(getError(() => domql.query('let f = x => if let y = x then y else 0 end\nreturn 1')).message).toContain("An arrow function's body is a simple expression, whose conditional tests a value and binds none: a function that holds more");
    });

    it.each([
        ['a field\'s value', '{ f = x => x }'],
        ['an options object\'s field', 'consume({ predicate = row => row.visible })'],
        ['a branch', 'let f = if a then x => 1 else x => 2 end\nreturn 1'],
    ])('refuses an arrow function written as %s', (_, text) => {
        expect(getError(() => domql.query(text)).message).toContain('An arrow function is the value of a local or an argument');
    });

    it('refuses a definition whose arrow function stands elsewhere, holds a body, or is marked otherwise', () => {
        const arrow = { kind: 'function', parameters: ['x'], body: { kind: 'local', name: 'x' }, arrow: true };

        expect(getError(() => domql.query(definitionOf({ kind: 'object', objectFields: [{ name: 'f', value: arrow }] })))).toMatchObject({ kind: 'structure', code: 'NEXO2027', message: expect.stringContaining('An arrow function is the value of a local or an argument, and stands nowhere else') });
        expect(getError(() => domql.query(definitionOf({ kind: 'body', locals: [{ name: 'f', value: { ...arrow, body: { kind: 'body', locals: [{ name: 'y', value: literal(1) }], result: { kind: 'local', name: 'y' } } } }], result: literal(1) })))).toMatchObject({ kind: 'structure', code: 'NEXO2006', message: expect.stringContaining(arrowBody) });
        expect(getError(() => domql.query(definitionOf({ kind: 'body', locals: [{ name: 'f', value: { ...arrow, arrow: false } }], result: literal(1) })))).toMatchObject({ kind: 'structure', code: 'NEXO2000', location: { pointer: '/expression/locals/0/value/arrow' } });
    });

    it('lets a conditional choose between functions, a call evaluating the one chosen, and refuses one whose functions give no one type', () => {
        const text = 'let a = x => x + 1\nlet b = x => x * 10\nlet pick = if wide then a else b end\nreturn pick(2)';

        expect(evaluate(text, { wide: true })).toBe(3);
        expect(evaluate(text, { wide: false })).toBe(20);
        expect(refusalOf('let a = x => x + 1\nlet b = x => "s"\nlet pick = if wide then a else b end\nreturn pick(2)', { wide: true }).message).toContain("'pick' may be any of 2 functions, whose results are of no one type: Number, String");
        expect(refusalOf('let f = x => x\nlet g = if c then f else null end\nreturn g(1)', { c: true }).message).toContain("'g' may hold null, and only a function is called");
    });

    it('calls a function parameter whose name a local declared later around the function shares, which the parameter hides in its body', () => {
        expect(evaluate('let apply = function(test, row) test(row) end\nlet test = x => x + 1\nreturn apply(test, 2)')).toBe(3);
        expect(getError(() => domql.query('let f = function() g() end\nlet g = () => 1\nreturn f()')).message).toContain("'g' is called before the local of that name is declared in its scope");
    });

    it('calls a function a conditional binding, an or or an object local holds, and an arrow written as an argument of a call inside an interpolation', () => {
        expect(evaluate('let f = x => x + 1\nreturn if let g = f then g(1) else 0 end')).toBe(2);
        expect(evaluate('let f = x => x + 1\nlet h = x => x * 2\nlet g = f or h\nreturn g(5)')).toBe(6);
        expect(evaluate('{ let triple = x => x * 3, a = triple(2) }')).toEqual({ a: 6 });
        expect(evaluate('let apply = function(g) g(1) end\nreturn $"{apply(x => x + 1)}"')).toBe('2');
    });

    it.each([
        ['an indexer\'s key, which is data', 'panel[x => 1]', "An indexer's key is data, never a function: an arrow function is the value of a local or an argument"],
        ['a computed property access', 'panel.[x => 1]', 'An arrow function is the value of a local or an argument'],
    ])('refuses an arrow function written as %s, which holds a simple expression and no argument', (_, text, message) => {
        expect(getError(() => domql.query(text))).toMatchObject({ kind: 'syntax', code: 'NEXO1057', message: expect.stringContaining(message) });
    });

    it('returns a function for use within the query', () => {
        expect(evaluate('let predicate = x => x > 1\nlet getPredicate = () => predicate\nlet p = getPredicate()\nreturn p(3)')).toBe(true);
    });

    it('keeps the scope, the implicit parameter and the object root of the place a function is declared, whatever its call passes', () => {
        const panel = document.createElement('div');

        panel.innerHTML = '<i></i><i></i>';
        expect(evaluate('let k = 5\nlet add = x => x + k\nlet use = function(f)\n    let k = 100\n    return f(1)\nend\nreturn use(add)')).toBe(6);
        expect(evaluate('panel { let measure = x => it.children.count + x, n = measure(1) }', { panel })).toEqual({ n: 3 });
        expect(evaluate('{ n = 2, m = do\n    let scale = x => x * root.n\n    return scale(3)\nend }')).toEqual({ n: 2, m: 6 });
    });

    it.each([
        ['a field', 'let f = x => x\nreturn { g = f }', "The field 'g' would hold a function, which is used within the expression and never part of its result: call it, as name(…)"],
        ['the result', 'let f = x => x\nreturn if c then f else null end', 'The result would hold a function, which is used within the expression and never part of its result'],
        ['a member\'s value argument', 'let f = x => x\nreturn panel.matches(f)', "The argument 'selector' of 'matches' takes a value, and a function is none"],
        ['a comparison', 'let f = x => x\nreturn f == f', "'==' compares a value of function with null alone"],
    ])('refuses a function held by %s, which only data reaches', (_, text, message) => {
        expect(refusalOf(text, { panel: document.createElement('div'), c: true }).message).toContain(message);
    });

    it('refuses a call that reaches a function within its own call through a function passed to it', () => {
        expect(refusalOf('let invoke = function(f) f(f) end\nreturn invoke(invoke)')).toMatchObject({ kind: 'validation', code: 'NEXO3034', message: expect.stringContaining("'f' would call a function within its own call, through a function passed to it: a function never calls itself, directly or through another") });
        // A call that would end is refused as well: a function is never called again within its own call, whatever the depth.
        expect(refusalOf('let call = function(f, x) f(x) end\nreturn call(x => call(y => y, x), 1)').message).toContain('a function never calls itself, directly or through another');
    });

    it('takes a function of the item where a parameter takes an expression argument, as it takes the argument\'s body', () => {
        const panel = Object.assign(document.createElement('div'), { innerHTML: '<i class="a"></i><i></i><i class="a"></i>' });
        const forms = ['panel.children.where(it.matches(".a")).count', 'panel.children.where(row => row.matches(".a")).count', 'let marked = row => row.matches(".a")\nreturn panel.children.where(marked).count'];

        expect(forms.map(text => domql.query(text, { panel }).evaluate())).toEqual([2, 2, 2]);
        expect(domql.query('panel.children.where(Domql.disabled).count', { panel }).evaluate()).toBe(0);
        expect(refusalOf('panel.children.where(Domql.visible).count', { panel }).message).toContain("'Domql.visible' names no function that takes those or answers that");
    });
});

describe('domql callback contracts', () => {
    let isolated;
    let saved;
    let calls;
    const panel = Object.assign(document.createElement('div'), { innerHTML: '<i data-n="3"></i><i data-n="1"></i><i data-n="2"></i>' });

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        saved = null;
        calls = [];

        isolated.registerModule(isolated.createModule('Callbacks', {
            types: [
                // A function that sorts a list by a function comparing two of its items, which it keeps where the test can call it later.
                {
                    name: 'SortExtensions<T>', kind: 'extension', target: 'List<T>',
                    members: [{
                        name: 'sortBy', kind: 'function', arguments: 'positional', result: 'List<T>', updates: { changes: 'derived', reads: 'derived' },
                        parameters: [{ name: 'compare', kind: 'function', parameterTypes: ['T', 'T'], type: 'Number', required: true }],
                        impl: ({ receiver: list, args: { compare } }) => {
                            saved = compare;

                            return [...list].sort(compare);
                        },
                    }],
                },
                // A function taking options, a function among them, and one that calls its function with what the test says.
                elementExtension('CallbackElements', [
                    {
                        name: 'rank', kind: 'function', arguments: 'options', result: 'Number', updates: { changes: 'constant', reads: 'fresh' },
                        parameters: [{ name: 'weight', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }, { name: 'score', kind: 'function', parameterTypes: ['Number'], type: 'Number', required: true }],
                        impl: ({ args: { weight, score } }) => score(weight),
                    },
                    {
                        name: 'probe', kind: 'function', arguments: 'positional', result: 'Number', updates: { changes: 'constant', reads: 'fresh' },
                        parameters: [{ name: 'measure', kind: 'function', parameterTypes: ['Domql.Element'], type: 'Number', required: true }],
                        impl: ({ receiver: element, args: { measure } }) => measure(...calls.shift()(element)),
                    },
                ]),
            ],
        }));
    });

    /** The query of the text as a script importing the module of callbacks. */
    const queryOf = (text, bindings = {}) => isolated.query(`import Callbacks\n${text}`, { panel, ...bindings });
    const evaluate = text => queryOf(text).evaluate();
    const refusalOf = text => getError(() => queryOf(text).resolve());
    const byNumber = '(a, b) => (a["data-n"] to Number ?? 0) - (b["data-n"] to Number ?? 0)';

    it('gives a member an arrow written as the argument, a named one or a regular function passed by its name, checked against its contract', () => {
        expect(evaluate(`panel.children:sortBy(${byNumber}) { n = it["data-n"] }`)).toEqual([{ n: '1' }, { n: '2' }, { n: '3' }]);
        expect(evaluate(`let compare = ${byNumber}\nreturn panel.children:sortBy(compare) { n = it["data-n"] }`)).toEqual([{ n: '1' }, { n: '2' }, { n: '3' }]);
        expect(evaluate('let compare = function(a, b) 0 end\nreturn panel.children:sortBy(compare).count')).toBe(3);
    });

    it.each([
        ['one of another number of parameters', 'panel.children:sortBy(a => 0).count', "The function given as 'compare' of 'sortBy' takes one argument, and its contract passes 2"],
        ['one giving another type', 'panel.children:sortBy((a, b) => "x").count', "The function given as 'compare' of 'sortBy' gives String, and its contract takes Number"],
        ['no function', 'panel.children:sortBy(1).count', "The parameter 'compare' of 'sortBy' takes a function, and finds Number"],
        ['a function that may be null', 'let f = (a, b) => 0\nreturn panel.children:sortBy(if c then f else null end).count', "The parameter 'compare' of 'sortBy' takes a function, and this one may be null"],
    ])('refuses %s in preparation', (_, text, message) => {
        expect(getError(() => queryOf(text, { c: true }).resolve()).message).toContain(message);
    });

    it('gives a member taking options a function passed by its name as an option, which a later option reads by its name', () => {
        expect(evaluate('let double = x => x * 2\nreturn panel:rank({ weight = 3, score = double })')).toBe(6);
        expect(evaluate('let double = x => x * 2\nreturn panel:rank({ score = double, weight = score(2) })')).toBe(8);
    });

    it('fails a function called after the member\'s invocation returned', () => {
        evaluate('panel.children:sortBy((a, b) => 0).count');

        expect(getError(() => saved(panel.children[0], panel.children[1]))).toMatchObject({ kind: 'evaluation', code: 'NEXO5008', message: expect.stringContaining("The function given as 'compare' of 'sortBy' is called after 'sortBy' returned, and a member calls the functions it is given only while its own invocation lasts") });
    });

    it('fails a function its member calls with arguments its contract does not declare, with the function\'s own failure', () => {
        calls.push(() => [1]);
        expect(getError(() => evaluate('panel:probe(e => 1)'))).toMatchObject({ kind: 'evaluation', code: 'NEXO5503', message: expect.stringContaining("The function given as 'measure' of 'probe' is called with 1, and its contract declares Element") });
        calls.push(element => [element, element]);
        expect(getError(() => evaluate('panel:probe(e => 1)')).message).toContain("is called with 2 arguments, and its contract declares 1");
        calls.push(element => [element]);
        expect(evaluate('panel:probe(e => e.children.count * 2)')).toBe(6);
    });

    it.each([
        ['on a property, which takes no parameters', { name: 'p', kind: 'property', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: true }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4030', "A member of kind 'property' declares name, kind, result, impl, internal, updates, and 'parameters' is none of them"],
        ['on a host call', { name: 'p', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: true }], result: 'Number', impl: () => 0 }, 'NEXO4056', "A function the host invokes takes value parameters alone, each argument prepared as a value its host keeps, and 'f' is a function parameter"],
        ['with a null policy', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: true, nulls: 'accept' }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4054', 'which a function parameter leaves out'],
        ['without the types it is called with', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', type: 'Number', required: true }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4537', "The parameter 'f' is a function that declares its parameterTypes, a list of the types it is called with"],
        ['optional', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: false }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4054', "The parameter 'f' is a function, so it is required"],
        ['fixed', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: true, fixed: true }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4030', "The parameter 'f' is a function, so it cannot be fixed"],
        ['with a context', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: true, context: 'item' }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4030', "The parameter 'f' is a function, so it declares no 'context'"],
        ['beside a value parameter declaring the types a function is called with', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'v', kind: 'value', type: 'Number', required: true, nulls: 'propagate', parameterTypes: [] }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 0 }, 'NEXO4030', "The parameter 'v' is no function, so it declares no parameterTypes"],
        ['an observation is given', { name: 'p', kind: 'function', arguments: 'positional', parameters: [{ name: 'f', kind: 'function', parameterTypes: [], type: 'Number', required: true }], result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'resize', of: { argument: 'f' } }] }, impl: () => 0 }, 'NEXO4055', "The observation 'resize' is given the parameter 'f', a function that lasts only while the member's invocation does"],
    ])('refuses a module declaring a function parameter %s', (_, member, code, message) => {
        expect(getError(() => isolated.createModule('P', { types: [elementExtension('PElements', [member])] }))).toMatchObject({ kind: 'module', code, message: expect.stringContaining(message), location: { module: 'P', type: 'PElements', declaration: 'p' } });
    });
});

describe('domql object root of an options object', () => {
    let isolated;
    let tallies;
    const notCompleted = (name, completed) => `'${name}' is no field of root completed where the reference to it is written; ${completed}`;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        tallies = 0;

        // A function taking options, an element among them and one with a default, which answers what it was given, and a number that counts its reads.
        const value = (name, type, rest = {}) => ({ name, kind: 'value', type, required: !('default' in rest), nulls: 'propagate', ...rest });

        // A function of a list taking options, a number among them and an expression and a predicate it evaluates against each item it keeps, which answers the sum of what the expression gives.
        const evaluated = (name, kind, type) => ({ name, kind, type, context: 'item', required: true, fixed: false, nulls: 'accept' });

        isolated.registerModule(isolated.createModule('Options', {
            types: [
                elementExtension('OptionElements', [
                    {
                        name: 'span', kind: 'function', arguments: 'options', result: 'String', updates: { changes: 'constant', reads: 'fresh' },
                        parameters: [value('anchor', 'Domql.Element?', { default: null, nulls: 'accept' }), value('start', 'Number'), value('end', 'Number', { default: 10 })],
                        impl: ({ args: { anchor, start, end } }) => `${anchor?.id ?? '-'}:${start}-${end}`,
                    },
                    { name: 'tally', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => ++tallies },
                ]),
                {
                    name: 'OptionLists<T>', kind: 'extension', target: 'List<T>',
                    members: [{
                        name: 'pick', kind: 'function', arguments: 'options', result: 'Number', updates: { changes: 'derived', reads: 'derived' },
                        parameters: [value('limit', 'Number', { default: 10 }), evaluated('by', 'expression', 'Number'), evaluated('keep', 'predicate', 'Boolean')],
                        impl: ({ receiver: list, args: { limit, by, keep } }) => list.slice(0, limit).filter(item => keep(item)).reduce((sum, item) => sum + by(item), 0),
                    }],
                },
            ],
        }));
    });

    const panel = Object.assign(document.createElement('div'), { id: 'panel', innerHTML: '<i></i><i></i><i></i>' });
    /** The query of the text as a script importing the module of options. */
    const queryOf = text => isolated.query(`import Options\n${text}`, { panel });
    const evaluate = text => queryOf(text).evaluate();
    const refusalOf = text => getError(() => queryOf(text).resolve());

    it('builds the outermost object where no object encloses it, each option a field after its value, of the value and the type it was given', () => {
        expect(evaluate('panel:span({ start = 2, end = root.start + 3 })')).toBe('-:2-5');
        expect(evaluate('panel:span({ anchor = panel, start = root.anchor.children.count })')).toBe('panel:3-10');
        expect(evaluate('panel:span({ start = 1, end = root.["start"] + 1 })')).toBe('-:1-2');
        expect(isolated.query('panel.intersects({ margin = 200, root = if root.margin > 100 then panel else null end })', { panel }).resolve().type.toString()).toBe('Boolean?');
    });

    it('evaluates each option once, in the order they are written, whatever order the member declares them in', () => {
        expect(evaluate('panel:span({ end = panel:tally * 10, start = root.end + root.end })')).toBe('-:20-10');
        expect(tallies).toBe(1);
    });

    it('refuses an option read in its own initializer, before it is written, or left to its default', () => {
        expect(refusalOf('panel:span({ start = root.start })').message).toContain(notCompleted('start', 'none is completed there'));
        expect(refusalOf('panel:span({ end = root.start, start = 1 })').message).toContain(notCompleted('start', 'none is completed there'));
        expect(refusalOf('panel:span({ start = root.end })').message).toContain(notCompleted('end', 'none is completed there'));
        expect(refusalOf('panel.intersects({ margin = root.margin })').message).toContain(notCompleted('margin', 'none is completed there'));
    });

    it('brings each written option into scope after its initializer, for the options after it, whatever order the member declares them in', () => {
        expect(isolated.query('panel.intersects({ margin = 200, root = if margin > 100 then panel else null end })', { panel }).resolve().type.toString()).toBe('Boolean?');
        expect(evaluate('panel:span({ start = 2, end = start + 3 })')).toBe('-:2-5');
        expect(evaluate('panel:span({ end = 4, start = @end - 1 })')).toBe('-:3-4');
        expect(evaluate('panel:span({ anchor = panel, start = anchor.children.count })')).toBe('panel:3-10');
    });

    it('reads an enclosing name of the same spelling in the option\'s own initializer, and again once the options object ends', () => {
        expect(evaluate('let start = 7\nreturn panel:span({ start = start + 1, end = start * 2 })')).toBe('-:8-16');
        expect(evaluate('let start = 7\nreturn { s = panel:span({ start = 1, end = start }), after = start }')).toEqual({ s: '-:1-1', after: 7 });
    });

    it('reuses an option\'s value where a later option reads it, evaluating it once', () => {
        expect(evaluate('panel:span({ end = panel:tally, start = @end + @end })')).toBe('-:2-1');
        expect(tallies).toBe(1);
    });

    it('gives a default no name', () => {
        expect(refusalOf('panel:span({ start = anchor?.children.count ?? 0 })').message).toContain("'anchor'");
    });

    it('reads the earlier option by its bare name and the enclosing object root\'s field of that name through root', () => {
        expect(evaluate('{ start = 5, s = panel:span({ start = 1, end = start * 10 + root.start }) }')).toEqual({ start: 5, s: '-:1-15' });
    });

    it('evaluates an expression and a predicate option where the member asks, with the options written before them and the object root in scope', () => {
        expect(evaluate('panel.children:pick({ limit = 2, by = limit * 10 + root.limit, keep = root.limit == limit })')).toBe(44);
    });

    it.each([
        ['an expression read by its name', 'panel.children:pick({ by = 1, keep = true, limit = by })', 'by', 'an expression'],
        ['an expression read through root', 'panel.children:pick({ by = 1, keep = true, limit = root.by })', 'by', 'an expression'],
        ['a predicate read by its name', 'panel.children:pick({ by = 1, keep = true, limit = if keep then 1 else 2 end })', 'keep', 'a predicate'],
        ['a predicate read through root', 'panel.children:pick({ by = 1, keep = true, limit = if root.keep then 1 else 2 end })', 'keep', 'a predicate'],
        ['an expression whose name an enclosing local shares', 'let by = 3\nreturn panel.children:pick({ by = 1, keep = true, limit = by })', 'by', 'an expression'],
    ])('refuses %s, which has no single value, in preparation', (_, text, name, kind) => {
        expect(refusalOf(text)).toMatchObject({ kind: 'validation', code: 'NEXO3046', message: expect.stringContaining(`Option '${name}' is ${kind} evaluated by the member against the implicit parameter it supplies; it has no single value to read here`) });
    });

    it('reads an enclosing object root\'s field through root where an expression option of that name is written', () => {
        expect(evaluate('{ by = 3, n = panel.children:pick({ by = 1, keep = true, limit = root.by }) }')).toEqual({ by: 3, n: 3 });
    });

    it('keeps the object root an enclosing object builds, whose fields its options read and which its options never join', () => {
        expect(evaluate('{ n = 4, s = panel:span({ start = root.n }) }')).toEqual({ n: 4, s: '-:4-10' });
        expect(refusalOf('{ n = 4, s = panel:span({ start = 1, end = root.start }) }').message).toContain(notCompleted('start', 'those completed are n'));
    });
});

describe('domql projections, blocks and casts as the specification defines them', () => {
    it('types the projection of a list whose items can be null as objects that can be null, each null item null at its place', () => {
        const panel = document.createElement('div');
        const query = domql.query('xs { a = 1 }', { xs: [panel, null] });

        expect(query.resolve().type.toString()).toBe('List<{ a: Number }?>');
        expect(query.evaluate()).toEqual([{ a: 1 }, null]);
        expect(domql.query('xs { a = 1 } { b = it.a + 1 }', { xs: [panel, null] }).evaluate()).toEqual([{ b: 2 }, null]);
        expect(domql.query('xs { a = 1 }', { xs: [null] }).resolve().type.toString()).toBe('List<{ a: Number }?>');
        expect(domql.query('panel.children { a = 1 }', { panel }).resolve().type.toString()).toBe('List<{ a: Number }>');
    });

    it('records a do block as a node of its own, so it is a branch whose result its expression gives, apart from one that returns', () => {
        expect(domql.query('if w then do 1 end else 2 end', { w: true }).evaluate()).toBe(1);
        expect(domql.format('if w then do 1 end else 2 end')).toBe('if w then do 1 end else 2 end');
        expect(domql.query('if w then 1 elseif v then do 2 end else 3 end', { w: false, v: true }).evaluate()).toBe(2);
        expect(domql.query('if w then do 1 end else 2 end').definition.expression.consequent).toEqual({ kind: 'do', body: { kind: 'literal', value: 1 } });
        expect(getError(() => domql.query('if w then do 1 end else return 2 end')).message).toContain('All branches of this conditional must give their results with return, or none of them');
    });

    it('takes a conditional standing alone in the else of branches that return, where its own branches return, as an elseif, and an implicit one never', () => {
        const text = 'if a then\n    let n = 1\n    return n\nelse\n    if b then\n        return 2\n    else\n        return 3\n    end\nend';

        expect(domql.query(text, { a: false, b: true }).evaluate()).toBe(2);
        expect(domql.query(text).definition).toEqual(domql.query('if a then\n    let n = 1\n    return n\nelseif b then\n    return 2\nelse\n    return 3\nend').definition);
        expect(getError(() => domql.query('if a then\n    let n = 1\n    return n\nelse\n    if b then 2 else 3 end\nend'))).toMatchObject({ kind: 'syntax', code: 'NEXO1054' });
        expect(domql.query('if a then\n    1\nelse\n    if b then\n        return 2\n    else\n        return 3\n    end\nend', { a: false, b: true }).evaluate()).toBe(2);
    });

    it('refuses else if on one line in a conditional laid out in block form, whose else ends its line', () => {
        expect(getError(() => domql.query('if a then\n    let n = 1\n    return n\nelse if b then\n    return 2\nelse\n    return 3\nend end'))).toMatchObject({ kind: 'syntax', code: 'NEXO1043', location: { line: 4, column: 6 } });
    });

    it.each([
        ['a grouped coalescing operator the accesses follow', member('parent', { kind: 'coalescing', value: parameter('a'), fallback: parameter('b') })],
        ['grouped arithmetic the accesses follow', member('parent', { kind: 'arithmetic', operator: '+', left: parameter('a'), right: parameter('b') })],
        ['an object expression following a value', { kind: 'object', context: parameter('a'), objectFields: [{ name: 'b', value: literal(1) }] }],
    ])('refuses a cast whose operand is %s, which no text writes', (_, operand) => {
        expect(getError(() => domql.query(definitionOf({ kind: 'cast', type: 'Element', operand })))).toMatchObject({ kind: 'structure', code: 'NEXO2002', location: { pointer: '/expression/operand' } });
    });

    it.each([
        'panel.parent as Element',
        '(a ?? b) as Element',
        '(?a.b.c) as Element',
        'a?.b as Element',
        '(a as Node).parent as Element',
        '(panel.parent as Node) as Element',
        'panel["x"] as Element',
        '$"x" as Element',
    ])('writes the cast %s as text that parses to its definition', text => {
        const { definition } = domql.query(text);

        expect(domql.query(domql.format(definition)).definition).toEqual(definition);
    });

    it('writes a conditional binding\'s value reading the caller\'s binding of its own name with ~, so it parses back', () => {
        const text = 'if let k = ~k then k else 2 end';

        expect(domql.format(text)).toBe(text);
        expect(domql.query(domql.format(text)).definition).toEqual(domql.query(text).definition);
        expect(domql.query(text, { k: 5 }).evaluate()).toBe(5);
    });

    it('names != in what an inequality refuses', () => {
        expect(getError(() => domql.query('input != "disabled"', { input: document.createElement('input') }).resolve()).message).toContain("'!=' compares values whose types fit one way or the other");
    });
});

describe('domql text-editable content', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it.each([
        ['contenteditable makes editable', '<div contenteditable="true"><p id="t"></p></div>', true],
        ['an empty contenteditable, which is true', '<div contenteditable=""><p id="t"></p></div>', true],
        ['plaintext-only', '<div contenteditable="plaintext-only"><p id="t"></p></div>', true],
        ['an invalid value below true, which inherits it', '<div contenteditable="true"><div contenteditable="bogus"><p id="t"></p></div></div>', true],
        ['inherit below true', '<div contenteditable="true"><div contenteditable="inherit"><p id="t"></p></div></div>', true],
        ['false below true', '<div contenteditable="true"><span contenteditable="false"><p id="t"></p></span></div>', false],
        ['an invalid value with nothing to inherit', '<div contenteditable="bogus"><p id="t"></p></div>', false],
    ])('answers text-editable where %s, as contenteditable does natively', (_, html, expected) => {
        document.body.innerHTML = html;

        expect(domql.query('t.textEditable()', { t: document.getElementById('t') }).evaluate()).toBe(expected);
    });
});

describe('domql query parameters', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();

    it('reads the caller\'s binding with ~, a reserved word\'s among them, whatever local shares its name', () => {
        expect(evaluate('~as + ~null', { as: 2, null: 3 })).toBe(5);
        expect(evaluate('{ let panel = 1, local = panel, binding = ~panel }', { panel: 2 })).toEqual({ local: 1, binding: 2 });
        expect(evaluate('~record.then', { record: { then: 4 } })).toBe(4);
        expect(domql.query('~panel').definition.expression).toEqual(parameter('panel'));
    });

    it('reads a binding before or in the value of a local of its name, which a name written alone reads nothing in', () => {
        expect(evaluate('{ let n = ~n + 1, value = n }', { n: 1 })).toEqual({ value: 2 });
        expect(evaluate('{ let before = ~a, let a = 10, value = before + a }', { a: 1 })).toEqual({ value: 11 });
        expect(getError(() => domql.query('{ let n = n + 1, value = n }', { n: 1 })).message).toContain("'n' is used before the local of that name is declared in its scope");
    });

    it('reads it as the implicit parameter, written canonically as it, and ~ before a name as the script parameter of that name', () => {
        const panel = document.createElement('div');

        panel.innerHTML = '<i data-key="a"></i><i></i>';
        expect(domql.query('panel { a = it.children.count, b = ~panel.children.count }', { panel }).evaluate()).toEqual({ a: 2, b: 2 });
        expect(domql.query('panel { let panel = 1, a = ~panel.children.count, b = panel }', { panel }).evaluate()).toEqual({ a: 2, b: 1 });
        expect(domql.query('panel { n = it }').definition.expression.objectFields[0].value).toEqual({ kind: 'it' });
        expect(domql.format('panel { n = it.children.count }')).toBe('panel { n = it.children.count }');
        expect(domql.format('panel.children.where(it["data-key"] != null)')).toBe('panel.children.where(it["data-key"] != null)');
        expect(domql.query('panel { mine = it.children.count, theirs = ~panel.children.count }', { panel }).definition.expression.objectFields.map(field => field.value.receiver.receiver)).toEqual([{ kind: 'it' }, parameter('panel')]);
    });

    it('refuses ~ alone, which names no parameter, ~ a space parts from a name, and ~ naming a field', () => {
        expect(getError(() => domql.query('a + ~'))).toMatchObject({ kind: 'syntax', code: 'NEXO1009', message: expect.stringContaining("A script parameter is named directly after '~', as ~room") });
        expect(getError(() => domql.query('panel { a = ~ panel }'))).toMatchObject({ kind: 'syntax', code: 'NEXO1009', message: expect.stringContaining("A script parameter is named directly after '~'") });
        expect(getError(() => domql.query('~.size'))).toMatchObject({ kind: 'syntax', code: 'NEXO1009' });
        expect(getError(() => domql.query('{ ~ = 1 }'))).toMatchObject({ kind: 'syntax', code: 'NEXO1009' });
    });

    it('reads self as an ordinary name, a local or a binding, @ before it reading the local, which a binding of its name is none', () => {
        expect(domql.query('let self = 2\nreturn self + 1').evaluate()).toBe(3);
        expect(domql.query('self', { self: 4 }).evaluate()).toBe(4);
        expect(domql.query('let self = 1\nreturn @self + self').evaluate()).toBe(2);
        expect(getError(() => domql.query('@panel.size', { panel: document.body }))).toMatchObject({ kind: 'structure', code: 'NEXO2012', message: expect.stringContaining("No local, object field, conditional binding or function parameter named 'panel' is in scope. Use '~panel' to read the script parameter"), location: { line: 1, column: 1 } });
    });

    it('reads a binding named context, it or a module after ~, and one named context, document or window alone, as any name', () => {
        expect(domql.query('panel { a = ~self, b = it.children.count }', { self: 1, panel: document.createElement('div') }).evaluate()).toEqual({ a: 1, b: 0 });
        expect(domql.query('~it + ~Domql + context', { it: 1, Domql: 2, context: 3 }).evaluate()).toBe(6);
        expect(domql.query('window + document', { window: 1, document: 2 }).evaluate()).toBe(3);
        expect(domql.query(definitionOf(parameter('self')), { self: 4 }).evaluate()).toBe(4);
    });

    it('refuses a binding the caller did not give, never reading the local of its name instead', () => {
        expect(getError(() => domql.query('{ let zz = 1, value = ~zz }').resolve())).toMatchObject({ code: 'NEXO3051', message: expect.stringContaining("No script parameter is named 'zz', and '~zz' reads a script parameter alone: write 'zz' for the local, object field, conditional binding or function parameter of that name") });
        expect(getError(() => domql.query('~zz').resolve())).toMatchObject({ code: 'NEXO3051', message: expect.stringContaining("No script parameter is named 'zz'") });
    });

    it.each([
        ['a binding no local shares a name with, without its ~', '~panel.size', 'panel.size'],
        ['a binding a local in scope shares its name with', '{ let panel = 1, binding = ~panel }', '{\n    let panel = 1,\n    binding = ~panel\n}'],
        ['a binding a later local shares its name with', '{ let before = ~a, let a = 1, value = a }', '{\n    let before = ~a,\n    let a = 1,\n    value = a\n}'],
        ['a binding a conditional binds the name of', 'if let a = x then ~a else 0 end', 'if let a = x then ~a else 0 end'],
        ['a binding a reserved word names', '~as', '~as'],
    ])('writes %s', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(domql.format(domql.query(text).definition)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    });

    it('takes a definition\'s parameter as the caller\'s binding beside a local of its name, before it or in scope of it', () => {
        const definition = definitionOf({ kind: 'object', locals: [{ name: 'a', value: parameter('a') }], objectFields: [{ name: 'local', value: { kind: 'local', name: 'a' } }, { name: 'binding', value: parameter('a') }] });

        expect(domql.query(definition, { a: 5 }).evaluate()).toEqual({ local: 5, binding: 5 });
        expect(domql.format(definition)).toBe('{\n    let a = ~a,\n    local = a,\n    binding = ~a\n}');
    });
});

describe('domql interpolated strings', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const queryOf = text => domql.query(text).definition.expression;

    it('joins its text with the text of each value it inserts, a number as the built-in conversion writes it', () => {
        expect(evaluate('$""')).toBe('');
        expect(evaluate('$"Hello"')).toBe('Hello');
        expect(evaluate('$"{a}{b}"', { a: 'x', b: 'y' })).toBe('xy');
        expect(evaluate('$"Found {n} items"', { n: 3 })).toBe('Found 3 items');
        expect(evaluate('$"{a} {b} {c} {d}"', { a: 1.5, b: -0, c: 1e21, d: 1e-7 })).toBe('1.5 0 1e+21 1e-7');
        expect(evaluate('$"{0.1 + 0.2}"')).toBe('0.30000000000000004');
    });

    it('reads its text as a string\'s, an escape whole, so the brace of \\u{…} opens nothing, and a doubled brace as a brace', () => {
        expect(evaluate('$"say \\"hi\\" \\\\ \\n\\t\\u{41} {{x}} }}"')).toBe('say "hi" \\ \n\tA {x} }');
        expect(evaluate('$"line\\nbreak\tand é 😀"')).toBe('line\nbreak\tand é 😀');
        expect(evaluate('$"{{{name}}}"', { name: 'Eyal' })).toBe('{Eyal}');
        expect(evaluate('$"\\u{7B}{name}\\u{7D}"', { name: 'Eyal' })).toBe('{Eyal}');
        expect(evaluate('$"{name}"', { name: '{x}' })).toBe('{x}');
        expect(evaluate('"Use {name}"')).toBe('Use {name}');
    });

    it('holds a simple expression in an interpolation, with its own strings, braces, comments and interpolated strings', () => {
        expect(evaluate('$"{a ?? "Unknown"}"', { a: null })).toBe('Unknown');
        expect(evaluate('$"<{$"{a}!"}>"', { a: 'x' })).toBe('<x!>');
        expect(evaluate('$"{({ x = 1 }.x)}"')).toBe('1');
        expect(evaluate('$"{a /* } */ ?? "}"}"', { a: null })).toBe('}');
        expect(evaluate('$"{if a then "yes" else "no" end} {n + 1}"', { a: true, n: 1 })).toBe('yes 2');
        expect(evaluate('$"{a to String}"', { a: false })).toBe('false');
    });

    it('reads its holes in the scope it is written in, with the implicit parameter there', () => {
        const panel = document.createElement('div');

        panel.setAttribute('data-name', 'Tools');
        panel.append(document.createElement('i'), document.createElement('i'));

        expect(evaluate('panel { label = $"{it["data-name"] ?? "Unknown"} ({it.children.count})" }', { panel })).toEqual({ label: 'Tools (2)' });
        expect(evaluate('{ let n = 2, text = $"{n}{n}" }')).toEqual({ text: '22' });
    });

    it.each([
        ['a space between its $ and its quote', '$ "a"', "An interpolated string starts with '$\"', with no space between them", 1, 'NEXO1005'],
        ['a hole with no expression', '$"a {  } b"', "An interpolation holds an expression between '{' and '}'", 5, 'NEXO1039'],
        ['a lone closing brace in its text', '$"a } b"', "A literal '}' in an interpolated string is written '}}'", 5, 'NEXO1062'],
        ['a hole never closed', '$"a {b', "Expected '}' closing the interpolation", 7, 'NEXO1000'],
        ['a hole the closing quote of its string ends', '$"a {b"', "A string is never closed: an interpolation is closed with '}' before its string's closing quote", 7, 'NEXO1510'],
        ['a string never closed', '$"a {b} c', 'An interpolated string is never closed', 1, 'NEXO1510'],
        ['an escape the language has none of', '$"a \\{ b"', 'A string escapes only', 5, 'NEXO1006'],
        ['two expressions in a hole', '$"{a b}"', "A member follows its receiver after a dot", 6, 'NEXO1011'],
        ['a dollar sign before no quote', 'a $ b', "Unexpected '$'", 3, 'NEXO1005'],
    ])('refuses %s, at the text that is refused', (_, text, message, column, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column });
    });

    it.each([
        ['a Boolean, whose text to String gives', '$"{a}"', { a: true }, "An interpolation inserts a string or a number, and this one is Boolean; give its text with … to String, or choose it with a conditional", '/expression/parts/0/expression', 'NEXO3077'],
        ['a value that can be null', '$"x{a}"', { a: null }, 'An interpolation can be null: give it a fallback, as in (… ?? "…"), or test it first', '/expression/parts/1/expression', 'NEXO3038'],
        ['an attribute, which can be missing', '$"{panel["id"]}"', { panel: document.body }, 'An interpolation can be null', '/expression/parts/0/expression', 'NEXO3038'],
        ['a list', '$"{panel.children}"', { panel: document.body }, 'An interpolation inserts a string or a number, and this one is List<Element>', '/expression/parts/0/expression', 'NEXO3077'],
        ['an event source', '$"{panel.on("click")}"', { panel: document.body }, 'An interpolation is a value, and this one is a host call', '/expression/parts/0/expression', 'NEXO3048'],
    ])('refuses to insert %s before anything is evaluated, naming the hole', (_, text, bindings, message, pointer, code) => {
        const error = getError(() => domql.query(text, bindings).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location.pointer).toBe(pointer);
    });

    it('is no member written after a space, nor a fixed argument or the name of a computed property access', () => {
        expect(getError(() => domql.query('panel matches $"x"')).message).toContain("write 'panel.matches(…)'");
        expect(getError(() => domql.query('panel.[$"rect"]', { panel: document.body }).resolve()).message).toContain('A computed property access reads a name determined when the expression is resolved');
        expect(getError(() => domql.query('panel.on($"click") { button = it.button }', { panel: document.body }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3006', message: expect.stringContaining("The argument 'type' of 'on' selects from the vocabulary") });
    });

    it('stands as a cast\'s target as a string literal does, what its holes hold never read as the group\'s own', () => {
        expect(domql.query('(?($"{a ?? "b"}" as Element).rect)').definition.expression.kind).toBe('optionalChain');
        expect(getError(() => domql.query('($"{a ?? "b"}" as Element)', { a: 'x' }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3060' });
        expect(getError(() => domql.query('(?($"{a as Element}").rect)'))).toMatchObject({ message: expect.stringContaining('A group as the receiver of an optional enclosed access holds a cast'), location: { line: 1, column: 21 } });
    });

    it('records its text and its interpolations in order, each run of text the characters it stands for', () => {
        expect(queryOf('$"Found {n} items, \\"{{x}}\\""')).toEqual({ kind: 'interpolatedString', parts: [{ kind: 'text', value: 'Found ' }, { kind: 'expression', expression: parameter('n') }, { kind: 'text', value: ' items, "{x}"' }] });
        expect(queryOf('$""')).toEqual({ kind: 'interpolatedString', parts: [] });
        expect(queryOf('$"Hello"')).toEqual({ kind: 'interpolatedString', parts: [{ kind: 'text', value: 'Hello' }] });
    });

    it('joins a definition\'s adjacent text and drops its empty text, leaving the caller\'s definition as it is', () => {
        const query = { kind: 'interpolatedString', parts: [{ kind: 'text', value: 'a' }, { kind: 'text', value: '' }, { kind: 'text', value: 'b' }, { kind: 'expression', expression: { kind: 'literal', value: 1 } }, { kind: 'text', value: '' }] };
        const definition = domql.query(definitionOf(query)).definition;

        expect(definition.expression.parts).toEqual([{ kind: 'text', value: 'ab' }, { kind: 'expression', expression: { kind: 'literal', value: 1 } }]);
        expect(query.parts).toHaveLength(5);
        expect(domql.query(definitionOf(query)).evaluate()).toBe('ab1');
    });

    it('names a part of a definition by the index its caller gave it, however validation joined and dropped the text before it', () => {
        const hole = expression => ({ kind: 'expression', expression });
        const inner = { kind: 'interpolatedString', parts: [{ kind: 'text', value: '' }, { kind: 'text', value: '' }, hole(parameter('flag'))] };
        const query = { kind: 'interpolatedString', parts: [{ kind: 'text', value: 'a' }, { kind: 'text', value: '' }, { kind: 'text', value: 'b' }, hole(parameter('flag')), { kind: 'text', value: '' }, hole(inner)] };
        const error = getError(() => domql.query(definitionOf(query), { flag: true }).resolve());

        expect(error.message).toContain('An interpolation inserts a string or a number, and this one is Boolean');
        expect(error.location.pointer).toBe('/expression/parts/3/expression');

        const nested = { kind: 'interpolatedString', parts: [{ kind: 'text', value: '' }, hole({ kind: 'literal', value: 'x' }), hole(inner)] };

        expect(getError(() => domql.query(definitionOf(nested), { flag: true }).resolve()).location.pointer).toBe('/expression/parts/2/expression/parts/2/expression');
        expect(getError(() => domql.query(definitionOf({ kind: 'interpolatedString', parts: [hole(parameter('flag'))] }), { flag: true }).resolve()).location.pointer).toBe('/expression/parts/0/expression');
        expect(domql.query(definitionOf(query), { flag: true }).definition.expression.parts).toHaveLength(3);
    });

    it.each([
        ['parts that are no array', { kind: 'interpolatedString', parts: 'a' }, '/expression/parts', 'This part of a definition is an array'],
        ['a part of no kind it has', { kind: 'interpolatedString', parts: [{ kind: 'hole', value: 'a' }] }, '/expression/parts/0', 'A part of an interpolated string is an object whose kind is text or expression'],
        ['text that is no string', { kind: 'interpolatedString', parts: [{ kind: 'text', value: 1 }] }, '/expression/parts/0/value', 'The text of an interpolated string is a string'],
        ['an expression part without its expression', { kind: 'interpolatedString', parts: [{ kind: 'expression' }] }, '/expression/parts/0', ''],
        ['an expression that is no node', { kind: 'interpolatedString', parts: [{ kind: 'expression', expression: { kind: 'sum' } }] }, '/expression/parts/0/expression', 'A node is an object'],
    ])('refuses a definition of an interpolated string with %s', (_, query, pointer, message) => {
        const error = getError(() => domql.query(definitionOf(query)));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe('NEXO2000');
        expect(error.location.pointer).toBe(pointer);
        expect(error.message).toContain(message);
    });

    it.each([
        ['each hole on one line, with no space inside its braces', '$"Hello {  a ?? "x"  }!"', '$"Hello {a ?? "x"}!"'],
        ['a hole whose expression begins with an object expression, grouped in parentheses', '$"{({x=1, y=2}.x)}"', '$"{({ x = 1, y = 2 }.x)}"'],
        ['its braces doubled, however they were written', '$"{{a}} \\u{7B}"', '$"{{a}} {{"'],
        ['its text\'s line breaks, tabs and invisible characters escaped, as a string\'s are', '$"a\\nb\tc​"', '$"a\\nb\\tc\\u{200B}"'],
        ['a string within a hole as any string is written, its tab escaped', '$"{a ?? "x\ty"}"', '$"{a ?? "x\\ty"}"'],
        ['an interpolated string within a hole, and one with text alone', '$"{$"{a}"} {$"b"} {$""}"', '$"{$"{a}"} {$"b"} {$""}"'],
    ])('writes %s', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(domql.format(formatted)).toBe(formatted);
        expect(domql.format(domql.query(text).definition)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    });
});

describe('domql raw strings and blocks', () => {
    const bindings = { name: 'Eyal', count: 3 };
    const evaluate = text => domql.query(text, bindings).evaluate();
    const refusalOf = text => getError(() => domql.query(text, bindings));
    const lines = (...parts) => parts.join('\n');

    it.each([
        ['a string', '"a\\nb"', 'a\nb'],
        ['a raw string', String.raw`'C:\Users\Eyal\'`, 'C:\\Users\\Eyal\\'],
        ['an interpolated string', '$"Hello {name}\\n"', 'Hello Eyal\n'],
        ['an interpolated raw string', String.raw`$'C:\Users\{name}\Documents\'`, 'C:\\Users\\Eyal\\Documents\\'],
        ['a string block', lines('"""', '    Hello,', '    \\tworld', '    """'), 'Hello,\n\tworld'],
        ['a raw block', lines("'''", String.raw`    \d{3}-\d{2}`, "    '''"), String.raw`\d{3}-\d{2}`],
        ['an interpolated string block', lines('$"""', '    Hello {name},', '', '    You have {count} unread messages.', '    """'), 'Hello Eyal,\n\nYou have 3 unread messages.'],
        ['an interpolated raw block', lines("$'''", '    Path: C:\\Users\\{name}\\', String.raw`    Pattern: \d{{3}}-\d{{2}}`, "    '''"), 'Path: C:\\Users\\Eyal\\\nPattern: \\d{3}-\\d{2}'],
    ])('reads %s as the text it stands for', (_, text, value) => {
        expect(evaluate(text)).toBe(value);
    });

    it('reads a raw string\'s backslashes as text and its doubled quote as one, and a string\'s quote as it is', () => {
        expect(evaluate(String.raw`'\d{3}-\d{2}'`)).toBe(String.raw`\d{3}-\d{2}`);
        expect(evaluate(`'[data-state="open"]'`)).toBe('[data-state="open"]');
        expect(evaluate("'It''s ready'")).toBe("It's ready");
        expect(evaluate(`"It's ready"`)).toBe("It's ready");
        expect(evaluate("''")).toBe('');
        expect(evaluate("''''")).toBe("'");
        expect(evaluate("$'It''s {name}'")).toBe("It's Eyal");
        expect(refusalOf("{ 'a' = 1 }").message).toContain(`"'a'" is a literal, and names nothing`);
    });

    it('takes an interpolation and doubled braces in both interpolated families, and every brace as text without $', () => {
        expect(evaluate('$"Literal {{name}}, actual {name}"')).toBe('Literal {name}, actual Eyal');
        expect(evaluate("$'Literal {{name}}, actual {name}'")).toBe('Literal {name}, actual Eyal');
        expect(evaluate("'Use {name} and {{this}}'")).toBe('Use {name} and {{this}}');
        expect(evaluate(lines("'''", '    {', '        "template": "{{name}}"', '    }', "    '''"))).toBe('{\n    "template": "{{name}}"\n}');
    });

    it.each([
        ['a string', '"a\nb"', 'A string stands on one line: write \\n for a line break, or write a string block'],
        ['a raw string', "'a\nb'", 'A raw string stands on one line: write a raw block'],
        ['an interpolated string', '$"a\nb"', 'An interpolated string stands on one line: write \\n for a line break, or write an interpolated string block'],
        ['an interpolated raw string', "$'a\nb'", 'An interpolated raw string stands on one line: write an interpolated raw block'],
    ])('refuses a line break written in %s, at the line break', (_, text, message) => {
        expect(refusalOf(text)).toMatchObject({ kind: 'syntax', code: 'NEXO1037', message: expect.stringContaining(message), location: { line: 1, column: text.indexOf('\n') + 1 } });
    });

    it('lets an escape or an inserted value give an inline string a line break', () => {
        expect(evaluate('"First\\nSecond"')).toBe('First\nSecond');
        expect(domql.query('$"Content: {text}"', { text: 'a\nb' }).evaluate()).toBe('Content: a\nb');
    });

    it('removes the closing delimiter\'s indentation from each line, keeps what is beyond it and the blank lines within, and excludes the boundary line breaks', () => {
        expect(evaluate(lines('"""', '    a', '      b', '', '    c', '    """'))).toBe('a\n  b\n\nc');
        expect(evaluate(lines('"""', '    a', ' ', '        ', '    """'))).toBe('a\n\n    ');
        expect(evaluate(lines('"""', '"""'))).toBe('');
        expect(evaluate(lines('"""', 'a', '"""'))).toBe('a');
        expect(evaluate('"""\r\n  a\r  b\r\n  """')).toBe('a\nb');
    });

    it('removes the margin before interpolation, never changing what is inserted', () => {
        expect(domql.query(lines('$"""', '    > {text}', '    """'), { text: 'x\n    y' }).evaluate()).toBe('> x\n    y');
    });

    it('continues the query after a block\'s closing delimiter on its line', () => {
        expect(evaluate(lines('{', "    label = '''", '        Ready', "        ''',", '    count = 3', '}'))).toEqual({ label: 'Ready', count: 3 });
        expect(evaluate(lines('"""', '    a', '    """ == "a" // a comment'))).toBe(true);
    });

    it.each([
        ['spaces after its opening delimiter', lines('"""   ', '    a', '    """'), "A string block's opening delimiter is followed directly by its line break, with nothing after it on its line", 'NEXO1038'],
        ['text after its opening delimiter', '"""a"""', "A string block's text stands on the lines between its delimiters", 'NEXO1038'],
        ['no closing delimiter', lines('"""', '    a'), 'A string block is never closed: its closing delimiter, 3 quotes, stands first on a line of its own', 'NEXO1058'],
        ['a closing run longer than its delimiter', lines('"""', '    a', '    """"'), 'A block closes with exactly the 3 quotes that open it, and this run has 4', 'NEXO1059'],
        ['a run of quotes as long as its delimiter in its text', lines("'''", "    x ''' y", "    '''"), "A run of 3 quotes in a block's text is as long as its delimiter: open the block with a longer delimiter to hold it", 'NEXO1060'],
        ['a line short of the margin', lines('"""', '    a', '  b', '    """'), "Each line of a block that is not blank begins with its closing delimiter's indentation", 'NEXO1061'],
        ['a line indented with tabs for spaces', lines('"""', '\ta', '    """'), "Each line of a block that is not blank begins with its closing delimiter's indentation", 'NEXO1061'],
    ])('refuses a block with %s', (_, text, message, code) => {
        expect(refusalOf(text)).toMatchObject({ kind: 'syntax', code, message: expect.stringContaining(message) });
    });

    it('holds a run of quotes in a block with a longer delimiter, an escaped quote, or in an interpolation\'s own strings', () => {
        expect(evaluate(lines("''''", "    This text contains '''.", String.raw`    Backslashes such as \n remain literal.`, "    ''''"))).toBe(`This text contains '''.\n${String.raw`Backslashes such as \n remain literal.`}`);
        expect(evaluate(lines('"""', '    \\"\\"\\" escaped', '    """'))).toBe('""" escaped');
        expect(domql.query(lines('$"""', '    {a ?? "\\"\\"\\""}', '    """'), { a: 'x' }).evaluate()).toBe('x');
    });

    it.each([
        ['a line break', '$"{name\n}"'],
        ['a line comment', '$"{name // why\n}"'],
        ['a block comment holding a line break', '$"{name /* a\nb */}"'],
        ['a block', "$\"{('''\n  x\n  ''')}\""],
    ])('refuses an interpolation holding %s, which stands on one line', (_, text) => {
        expect(refusalOf(text)).toMatchObject({ kind: 'syntax', code: 'NEXO1040', message: expect.stringContaining('An interpolation stands on one line') });
    });

    it('refuses an interpolation beginning with an object expression, whatever stands before it, and takes one grouped, which canonical text writes', () => {
        const message = 'An interpolation that begins with an object expression groups it in parentheses, as {({ x = 1 }.x)}';

        expect(refusalOf('$"{ { x = 1 }.x}"').message).toContain(message);
        expect(refusalOf('$"{/* a */{ x = 1 }.x}"').message).toContain(message);
        expect(evaluate('$"{({ x = 1 }.x)}"')).toBe('1');
        expect(domql.format('$"{({x=1}.x)}"')).toBe('$"{({ x = 1 }.x)}"');
    });

    it('takes no string of any form where a cast or a conversion names its type, which is a name written bare', () => {
        const panel = document.createElement('div');

        expect(domql.query("(panel.parent as Element)?.children.count", { panel }).evaluate()).toBeNull();
        expect(getError(() => domql.query(lines('try "3" to """', '    Number', '    """'), {})).message).toContain("'to' names the type it converts to bare, as a member's name is written: write 'to Number'");
        expect(getError(() => domql.query("(panel.parent as 'Element')?.children.count", { panel })).message).toContain("write 'as Element'");
        expect(getError(() => domql.query('panel as $"element"', { panel })).message).toContain('Expected the name of the type it casts to');
    });

    it.each([
        ['a raw string', String.raw`'C:\Users\'`, String.raw`"C:\\Users\\"`],
        ['a raw string with a quote', "'It''s'", `"It's"`],
        ['a string block', lines('"""', '    a', '    \\tb', '    """'), '"a\\n\\tb"'],
        ['an interpolated raw block', lines("$'''", String.raw`    \{name}`, "    '''"), String.raw`$"\\{name}"`],
    ])('writes %s as canonical text, an inline string of the same value', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    });

    it('locates what a block refuses in its source text, after its margin is removed', () => {
        expect(refusalOf(lines('"""', '    a', '    \\q', '    """')).location).toMatchObject({ line: 3, column: 5 });
        expect(getError(() => domql.query(lines('$"""', '    {name.nothing}', '    """'), bindings).resolve()).location).toMatchObject({ line: 2, column: 6 });
    });
});

describe('domql string escapes', () => {
    const valueOf = text => domql.query(text).definition.expression.value;

    it('reads each escape as the character it stands for, and a tab and any other character but a line break written as itself', () => {
        expect(valueOf('"\\" \\\\ \\n \\r \\t \\e"')).toBe('" \\ \n \r \t \u001B');
        expect(valueOf('"\\u{41}\\u{0}\\u{1F600}\\u{10FFFF}\\u{000041}"')).toBe('A\u0000\u{1F600}\u{10FFFF}A');
        expect(valueOf('"tab\tand é 😀"')).toBe('tab\tand é 😀');
        expect(valueOf('"\\e"')).toBe(valueOf('"\\u{1B}"'));
        expect(valueOf('"\\u{A0}\\u{200B}\\u{1F600}"')).toBe('\u00A0\u200B😀');
        expect(valueOf('"😀"')).toBe(valueOf('"\\u{1F600}"'));
        expect(valueOf('"\\u{1b}"')).toBe(valueOf('"\\u{1B}"'));
    });

    it.each([
        ['an escape the language has none of', '"a\\qb"', 'A string escapes only \\", \\\\, \\n, \\r, \\t, \\e and \\u{…}', 'NEXO1006'],
        ['a backslash ending the text', '"a\\', 'A string escapes only', 'NEXO1006'],
        ['a Unicode escape without braces', '"a\\u41"', 'A Unicode escape is written \\u{…} with one to six hexadecimal digits, as \\u{1F600}', 'NEXO1006'],
        ['a Unicode escape without digits', '"a\\u{}"', 'A Unicode escape is written \\u{…}', 'NEXO1006'],
        ['a Unicode escape of seven digits', '"a\\u{0000041}"', 'A Unicode escape is written \\u{…}', 'NEXO1006'],
        ['a Unicode escape of no hexadecimal digit', '"a\\u{G}"', 'A Unicode escape is written \\u{…}', 'NEXO1006'],
        ['a Unicode escape never closed', '"a\\u{41"', 'A Unicode escape is written \\u{…}', 'NEXO1006'],
        ['the first surrogate', '"a\\u{D800}"', 'A Unicode escape names a scalar value, and D800 to DFFF are surrogates', 'NEXO1049'],
        ['the last surrogate', '"a\\u{dfff}"', 'and D800 to DFFF are surrogates', 'NEXO1049'],
        ['a value beyond the last scalar value', '"a\\u{110000}"', 'A Unicode escape names a value no greater than 10FFFF', 'NEXO1049'],
    ])('refuses %s, at its backslash', (_, text, message, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column: 3 });
    });

    it.each([
        ['a line feed, a carriage return and a tab, a tab written or escaped', '"a\\nb\\rc\td\\n"', '"a\\nb\\rc\\td\\n"'],
        ['an escape character, as \\e however it is written', '"\\u{1B}[0m"', '"\\e[0m"'],
        ['every other control character as a Unicode escape in upper-case hexadecimal', '"\\u{0}\\u{1f}\\u{7f}\\u{9F}"', '"\\u{0}\\u{1F}\\u{7F}\\u{9F}"'],
        ['ordinary Unicode as itself, however it is written', '"\\u{E9}\\u{1F600} é"', '"é😀 é"'],
        ['a format character as a Unicode escape, written or escaped', '"a\u200Bb\\u{FEFF}\u00AD"', '"a\\u{200B}b\\u{FEFF}\\u{AD}"'],
        ['a line and a paragraph separator as Unicode escapes', '"a\u2028b\\u{2029}"', '"a\\u{2028}b\\u{2029}"'],
        ['every space separator but the space as a Unicode escape', '"a b\u00A0c\\u{3000}d\\u{20}"', '"a b\\u{A0}c\\u{3000}d "'],
        ['an emoji a zero-width joiner joins with the joiner between its parts', '"👩\u200D💻"', '"👩\\u{200D}💻"'],
        ['a double quote and a backslash, as they were', '"\\"\\\\"', '"\\"\\\\"'],
    ])('writes %s', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(valueOf(domql.format(text))).toBe(valueOf(text));
    });

    it('writes a definition\'s string with the escapes the text would read back', () => {
        const query = domql.query(definitionOf({ kind: 'literal', value: 'a\u0001\u001B\n"' }));

        expect(domql.format(query)).toBe('"a\\u{1}\\e\\n\\""');
        expect(valueOf(domql.format(query))).toBe('a\u0001\u001B\n"');
    });
});

describe('domql comparisons', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const queryOf = text => domql.query(text).definition.expression;

    it('orders two numbers, and a chain of them pointing one way, answering a Boolean', () => {
        expect(evaluate('{ a = 1 < 2, b = 2 <= 2, c = 3 > 4, d = 4 >= 4, e = 0 < x <= 600, f = 0 < y <= 600, g = 3 > 2 >= 2 > 1 }', { x: 600, y: 601 }))
            .toEqual({ a: true, b: true, c: false, d: true, e: true, f: false, g: true });
        expect(evaluate('-0 < 0')).toBe(false);
    });

    it('binds looser than arithmetic and tighter than and, or and not, as an equality does', () => {
        expect(evaluate('0 < w - p * 2 <= 600 and enabled', { w: 600, p: 16, enabled: true })).toBe(true);
        expect(evaluate('0 < w - p * 2 <= 600 and enabled', { w: 640, p: 16, enabled: true })).toBe(false);
        expect(evaluate('not a < b', { a: 1, b: 2 })).toBe(false);
        expect(evaluate('if a < b then "less" else "not less" end', { a: 1, b: 2 })).toBe('less');
        expect(evaluate('(a < b) == c', { a: 1, b: 2, c: true })).toBe(true);
        expect(evaluate('(w ?? 0) < 600', { w: null })).toBe(true);
    });

    it('records one comparison for a pair and for a chain, its operands in order and an operator between each two', () => {
        expect(queryOf('a < b')).toEqual({ kind: 'comparison', operands: [parameter('a'), parameter('b')], operators: ['<'] });
        expect(queryOf('0 < w <= 600')).toEqual({ kind: 'comparison', operands: [{ kind: 'literal', value: 0 }, parameter('w'), { kind: 'literal', value: 600 }], operators: ['<', '<='] });
        expect(queryOf('(a < b) < c').operands[0].kind).toBe('comparison');
    });

    it.each([
        ['a chain that turns from < to >', 'a < b > c', "A comparison chain keeps one direction, and '>' turns it from '<': join two comparisons with 'and', as in 'a < b and b > c'", 7, 'NEXO1019'],
        ['a chain that turns from >= to <', 'a >= b < c', "A comparison chain keeps one direction, and '<' turns it from '>='", 8, 'NEXO1019'],
        ['a comparison beside an equality', 'a < b == c', "'<' and '==' stand apart, one of them grouped: write '(… < …) == …' or '… < (… == …)'", 7, 'NEXO1052'],
        ['an equality beside a comparison', 'a == b < c', "'==' and '<' stand apart, one of them grouped", 8, 'NEXO1052'],
        ['a fallback beside a comparison', 'w ?? 0 < 600', "'??' and '<' stand apart, one of them grouped: write '(… ?? …) < …' or '… ?? (… < …)'", 8, 'NEXO1021'],
        ['a comparison beside a fallback', 'a < b ?? c', "'<' and '??' stand apart, one of them grouped", 7, 'NEXO1021'],
        ['a comparison operator with nothing before it', '< a', "'<' compares the value written before it: write 'it < …'", 1, 'NEXO1013'],
        ['an operator of two signs written apart', 'a < = b', "'<=' is one operator, written with nothing between its signs", 3, 'NEXO1001'],
    ])('refuses %s, at the operator that is refused', (_, text, message, column, code) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column });
    });

    it.each([
        ['a grouped comparison, which is a Boolean', '(a < b) < c', { a: 1, b: 2, c: 3 }, "The left operand of '<' is a number, and this one is Boolean", '/expression/operands/0', 'NEXO3078'],
        ['an operand that can be null', 'a < b', { a: 1, b: null }, "The right operand of '<' can be null, and a comparison takes numbers alone: give it a fallback, as in (… ?? 0), or test it first", '/expression/operands/1', 'NEXO3039'],
        ['text, which ordering takes no part in', '"a" < "b"', {}, "The left operand of '<' is a number, and this one is String", '/expression/operands/0', 'NEXO3078'],
        ['a middle operand of text', '0 <= x < 2', { x: '1' }, "The right operand of '<=' is a number, and this one is String", '/expression/operands/1', 'NEXO3078'],
    ])('refuses %s before anything is evaluated, naming the operand', (_, text, bindings, message, pointer, code) => {
        const error = getError(() => domql.query(text, bindings).resolve());

        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);
        expect(error.message).toContain(message);
        expect(error.location.pointer).toBe(pointer);
    });

    it('writes one space around each operator and a chain as one, grouping only where the reading needs it', () => {
        expect(domql.format('0<w<=600')).toBe('0 < w <= 600');
        expect(domql.format('(a + 1) < b')).toBe('a + 1 < b');
        expect(domql.format('not (a < b)')).toBe('not a < b');
        expect(domql.format('(a < b) == c')).toBe('(a < b) == c');
        expect(domql.format('a < (b < c)')).toBe('a < (b < c)');
        expect(domql.format('(w ?? 0) >= 600')).toBe('(w ?? 0) >= 600');
    });

    it.each([
        ['one operand', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }], operators: [] }, '/expression/operands', 'A comparison compares two or more expressions', 'NEXO2029'],
        ['an operator fewer than one between each two operands', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }], operators: [] }, '/expression/operators', 'one fewer than they are', 'NEXO2526'],
        ['an operator that orders nothing', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }], operators: ['!='] }, '/expression/operators/0', 'A comparison operator is <, <=, > or >=', 'NEXO2000'],
        ['operators pointing two ways', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }, { kind: 'literal', value: 0 }], operators: ['<', '>'] }, '/expression/operators/1', 'A comparison chain keeps one direction', 'NEXO2001'],
    ])('refuses a definition of a comparison with %s', (_, query, pointer, message, code) => {
        const error = getError(() => domql.query(definitionOf(query)));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe(code);
        expect(error.location.pointer).toBe(pointer);
        expect(error.message).toContain(message);
    });

    it('evaluates a comparison made from a definition as one written in text', () => {
        expect(domql.query(definitionOf({ kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }, { kind: 'literal', value: 2 }], operators: ['<', '<='] })).evaluate()).toBe(true);
    });
});

describe('domql values given by =', () => {
    const syntaxErrorOf = text => getError(() => domql.query(text));

    it('gives a field, a local and a binding the value after =, an indexer standing as that value', () => {
        const panel = document.createElement('div');

        panel.setAttribute('data-key', 'k');
        panel.setAttribute('id', 'p');

        expect(domql.query('panel { let key = it["data-key"], key = key, id = if let id = panel["id"] then id else null end }', { panel }).evaluate()).toEqual({ key: 'k', id: 'p' });
        expect(domql.query('{ size=1 }').evaluate()).toEqual({ size: 1 });
        expect(domql.format('panel{let k=it["data-key"],v=k}')).toBe('panel {\n    let k = it["data-key"],\n    v = k\n}');
    });

    it.each([
        ['a field', 'panel { count: it.size }', "An object field takes its value after =: write 'count = …'", 14],
        ['a local', 'panel { let r: it.rect, a = r }', "A local takes its value after =: write 'let r = …'", 14],
        ['a conditional binding', 'if let k: panel["id"] then 1 else 2', "A conditional binding takes its value after =: write 'if let k = …'", 9],
    ])('refuses %s written with a colon, giving the form with =, naming where', (_, text, message, column) => {
        const error = syntaxErrorOf(text);

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe('NEXO1003');
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column });
    });

    it.each([
        ['standing for an equality', 'a = 1', 3],
        ['standing for an equality in a condition', 'if a = 1 then 1 else 2', 6],
        ['after a field\'s value', '{ a = 1 = 2 }', 9],
    ])('refuses a single = %s, saying == compares values', (_, text, column) => {
        const error = syntaxErrorOf(text);

        expect(error.message).toContain("Unexpected '=' in an expression. Use '==' to compare values.");
        expect(error.location).toMatchObject({ line: 1, column });
    });

    it('refuses an argument written as a named one with =, reads a colon there as an extension access, and an indexer there as the argument', () => {
        expect(syntaxErrorOf('panel.rectRelativeTo(relativeTo = other)')).toMatchObject({ code: 'NEXO1012', message: expect.stringContaining("An argument is written as its value alone, as 'rectRelativeTo(…)' takes it; a member that takes options is given them as the object fields of an object, as { relativeTo = … }") });
        expect(syntaxErrorOf('panel.closest(".a", relativeTo = other)').message).toContain('as { relativeTo = … }');
        expect(getError(() => domql.query('panel.rectRelativeTo(relativeTo: other)', { panel: document.body, other: document.body }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3009', message: expect.stringContaining("No local in scope or script parameter is named 'relativeTo'") });
        expect(domql.query('panel.matches(panel["for"])').definition.expression.arguments[0].kind).toBe('indexerAccess');
    });
});

describe('domql members written after their receiver and a space', () => {
    let panel;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel" class="toolbar"><button class="row open" id="first"></button><button class="row" id="second"></button></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => domql.query(text, { panel, ...bindings }).evaluate();

    it('answer a value a chain continues from, an event projection written without a group among them', () => {
        expect(evaluate('panel.first(".row")?.matches(".open") ?? false')).toBe(true);
        expect(evaluate('panel.children.where(it.matches(".toolbar > button:first-child")).count')).toBe(1);
        expect(evaluate('{ open = panel.first(".none")?.matches(".open") ?? false }')).toEqual({ open: false });
        expect(domql.query('panel.on("click") { button = it.button }', { panel }).definition.expression).toEqual({
            kind: 'object',
            context: call('on', literal('click'), parameter('panel')),
            objectFields: [{ name: 'button', value: member('button') }],
        });
        expect(domql.query('panel.on("click") { button = it.button }', { panel }).resolve().kind).toBe('subscription');
    });

    it('answer matches as a boolean of a receiver that cannot be null, and as a Boolean? only through optional access or a null argument', () => {
        expect(domql.query('panel.matches(".toolbar")', { panel }).resolve().type.toString()).toBe('Boolean');
        expect(domql.query('panel.first(".row")?.matches(".open")', { panel }).resolve().type.toString()).toBe('Boolean?');
        expect(domql.query('panel.matches(selector)', { panel, selector: null }).resolve().type.toString()).toBe('Boolean?');
        expect(evaluate('panel.matches(selector)', { selector: null })).toBeNull();
    });

    it.each([
        ['matches', 'item?.matches(panel.first("[")?["class"] ?? ".row")'],
        ['overlaps', 'item?.overlaps({ other = panel, margin = panel.first("[")?.rect?.width ?? 0 })'],
        ['intersects', 'item?.intersects({ root = panel.first("[") })'],
    ])('skip %s and its argument for a null receiver, and evaluate the argument for any other', (_, text) => {
        expect(evaluate(text, { item: null })).toBeNull();
        expect(getError(() => evaluate(text, { item: panel })).message).toContain("The member 'first' failed");
    });

    it.each([
        ['matches', 'panel matches ".row"', 'panel'],
        ['intersects', 'panel.first(".row") intersects { root: panel }', 'panel.first(".row")'],
        ['overlaps', '(a ?? b) overlaps { other: panel }', '(a ?? b)'],
        ['on', 'panel on "click" { x: it.clientX }', 'panel'],
        ['matches', 'panel.parent as Element matches ".row"', '(panel.parent as Element)'],
        ['matches', 'panel["n"] to String matches ".row"', '(panel["n"] to String)'],
    ])('refuse %s written after its receiver and a space, giving the call to write', (name, text, receiver) => {
        const error = getError(() => domql.query(text, { panel }));

        expect(error.kind).toBe('syntax');
        expect(error.code).toBe('NEXO1011');
        expect(error.message).toContain(`A member follows its receiver after a dot: write '${receiver}.${name}(…)'`);
    });

    it('refuse a definition holding an infixCall, which is no node, saying which nodes take its place', () => {
        const error = getError(() => domql.query(definitionOf({ kind: 'object', context: parameter('panel'), objectFields: [{ name: 'open', value: infixCall('matches', literal('.open')) }] })));

        expect(error.kind).toBe('structure');
        expect(error.code).toBe('NEXO2000');
        expect(error.location.pointer).toBe('/expression/objectFields/0/value');
        expect(error.message).toContain('An infixCall is not a node: a function is a call node, or an indexer node for a named or unnamed indexer');
    });
});

describe('domql named indexers', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-key="k1" data-which="data-key" style="display: flex"><i class="row" data-key="k2"></i></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => isolated.query(text, { panel, ...bindings }).evaluate();

    /** A module of elements' named indexer `entry`, which answers a structured entry for a number, counting its calls, and of their property `entries`, which counts its reads. */
    const registerEntries = () => {
        const counts = { entries: 0, reads: 0 };

        isolated.registerModule(isolated.createModule('Entries', {
            types: [
                structuredType('Record', { label: 'String', rank: 'Number' }),
                elementExtension('EntryElements', [
                    {
                        name: 'entry', kind: 'indexer', parameters: [{ name: 'index', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }], result: 'Record?', updates: { changes: 'constant', reads: 'fresh' },
                        impl: ({ receiver: element, args: { index } }) => {
                            counts.entries++;

                            return index < 3 ? { label: `${element.id} ${index}`, rank: index * 10 } : null;
                        },
                    },
                    { name: 'entries', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => ++counts.reads },
                ]),
            ],
        }));

        return counts;
    };

    describe('the built-in indexers', () => {
        it('read an attribute and a computed style by a key, which an expression or a binding gives', () => {
            expect(evaluate('panel.attribute["data-key"]')).toBe('k1');
            expect(evaluate('panel.attribute[name]', { name: 'data-key' })).toBe('k1');
            expect(evaluate('panel.attribute[panel.attribute["data-which"]]')).toBe('k1');
            expect(evaluate('panel.attribute["data-missing"]')).toBeNull();
            expect(evaluate('panel.style["display"]')).toBe('flex');
            expect(evaluate('panel.first(".row")?.attribute["data-key"]')).toBe('k2');
        });

        it('check the key against the type of the indexer\'s parameter', () => {
            const error = getError(() => isolated.query('panel.attribute[5]', { panel }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.code).toBe('NEXO3042');
            expect(error.message).toContain("The argument 'name' of 'attribute' expects String and finds Number");
        });

        it('give the form to write for an indexer written as a property, and for a member written as an indexer', () => {
            const messageOf = text => getError(() => isolated.query(text, { panel }).resolve()).message;

            expect(messageOf('panel.attribute.["data-key"]')).toContain("'attribute' is an indexer: write 'panel.attribute[…]'");
            expect(messageOf('panel.style')).toContain("'style' is an indexer: write 'panel.style[…]'");
            expect(messageOf('panel.size?["width"]')).toContain('Size has no unnamed indexer');
            expect(messageOf('panel.closest[".row"]')).toContain(`'closest' uses call syntax: write 'panel.closest(".row")'`);
        });

        it('require ?. before their name for a receiver that can be null, giving the form', () => {
            expect(getError(() => isolated.query('panel.first(".row").attribute["data-key"]', { panel }).resolve()).message).toContain(`write 'panel.first(".row")?.attribute["data-key"]'`);
        });

        it('take optional brackets after their name, which add nothing, so an optional enclosed access holds them as it holds any access', () => {
            expect(evaluate('panel.attribute?["data-key"]')).toBe('k1');
            expect(evaluate('(?panel.first(".row").attribute["data-key"])')).toBe('k2');
            expect(evaluate('(?panel.first(".none").attribute["data-key"])')).toBeNull();
        });
    });

    describe('the unnamed indexer', () => {
        it('of an element is its attribute', () => {
            expect(evaluate('panel["data-key"]')).toBe('k1');
            expect(evaluate('panel[name]', { name: 'data-key' })).toBe('k1');
            expect(evaluate('panel.first(".row")?["data-key"]')).toBe('k2');
            expect(evaluate('missing?["data-key"]', { missing: null })).toBeNull();
            expect(isolated.query('panel["data-key"]', { panel }).resolve().usedDeclarations.map(use => [use.name, use.qualifiedName])).toEqual([[null, 'Element[]']]);
        });

        it('takes the key its indexer takes, and is refused for a receiver whose type has none', () => {
            const refusalOf = text => getError(() => isolated.query(text, { panel }).resolve());

            expect(refusalOf('panel[5]')).toMatchObject({ code: 'NEXO3042', message: expect.stringContaining("The argument 'name' of '[…]' expects String and finds Number") });
            expect(refusalOf('Domql.window["x"]')).toMatchObject({ code: 'NEXO3012', message: expect.stringContaining('Window has no unnamed indexer') });
            expect(refusalOf('panel.first(".row")["x"]').message).toContain(`write 'panel.first(".row")?["x"]'`);
        });

        it('is one a module declares within a type of its own, beside a named one, and one at most for any receiver, which no extension declares', () => {
            const key = [{ name: 'name', kind: 'value', type: 'String', required: true, nulls: 'propagate' }];
            const tokens = { kind: 'indexer', parameters: key, result: 'String?', updates: { changes: 'constant', reads: 'fresh' }, impl: ({ receiver: palette, args: { name } }) => palette[name] ?? null };

            isolated.registerModule(isolated.createModule('Palettes', {
                types: [
                    { name: 'Palette', kind: 'structured', members: [{ name: 'accent', kind: 'property', result: 'String' }, tokens, { ...tokens, name: 'token' }] },
                    elementExtension('PaletteElements', [{ name: 'palette', kind: 'property', result: 'Palette', updates: { changes: 'constant', reads: 'fresh' }, impl: () => ({ accent: 'teal' }) }]),
                ],
            }));

            expect(evaluate('import Palettes\npanel:palette["accent"]')).toBe('teal');
            expect(evaluate('import Palettes\npanel:palette.token["accent"]')).toBe('teal');
            expect(evaluate('panel["data-key"]')).toBe('k1');

            const competing = getError(() => isolated.registerModule(isolated.createModule('Rival', {
                types: [elementExtension('RivalElements', [{ ...tokens, impl: () => null }])],
            })));

            expect(competing).toMatchObject({ kind: 'module', code: 'NEXO4564', location: { module: 'Rival', declaration: 'RivalElements' } });
            expect(competing.message).toContain("The extension 'RivalElements' declares an indexer without a name, and an extension's indexers are named");

            const twice = getError(() => isolated.registerModule(isolated.createModule('Swatches', {
                types: [{ name: 'Swatch', kind: 'structured', members: [{ name: 'hue', kind: 'property', result: 'Number' }, { ...tokens, impl: () => null }, { ...tokens, impl: () => null }] }],
            })));

            expect(twice).toMatchObject({ kind: 'module', code: 'NEXO4068', message: expect.stringContaining('An unnamed indexer of Swatch is declared already') });
        });

        it.each([
            ['an indexer of an earlier version, a function with a syntax', { kind: 'function', syntax: 'indexer' }, 'syntax', "A member of kind 'function' declares name, kind, result, impl, internal, invokedBy, arguments, parameters, updates, and 'syntax' is none of them"],
            ['an indexer marked as the default one', { default: true }, 'default', "A member of kind 'indexer' declares name, kind, result, impl, internal, invokedBy, parameters, updates, and 'default' is none of them"],
            ['a property marked as the default indexer', { kind: 'property', parameters: undefined, default: true }, 'default', "A member of kind 'property' declares name, kind, result, impl, internal, updates, and 'default' is none of them"],
        ])('is refused where a declaration is %s, which an unnamed indexer takes the place of', (_, overrides, declarationKey, message) => {
            const declaration = { name: 'entries', kind: 'indexer', parameters: [{ name: 'index', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 1, ...overrides };
            const error = getError(() => isolated.createModule('Entries', { types: [elementExtension('EntryElements', [declaration])] }));

            expect(error).toMatchObject({ kind: 'module', code: 'NEXO4030', location: { declarationKey } });
            expect(error.message).toContain(message);
        });
    });

    describe('the class indexer', () => {
        it('tests whether the element has one class, by a key an expression or a binding gives', () => {
            panel.className = 'open  card';

            expect(evaluate('panel.class["open"]')).toBe(true);
            expect(evaluate('panel.class["card"]')).toBe(true);
            expect(evaluate('panel.class["closed"]')).toBe(false);
            expect(evaluate('panel.class[name]', { name: 'card' })).toBe(true);
            expect(evaluate('panel.class["open"] and not panel.class["closed"]')).toBe(true);
            expect(evaluate('missing?.class["open"]', { missing: null })).toBeNull();
        });

        it.each([
            ['empty', ''],
            ['holding a space', 'open card'],
            ['holding a tab', 'open\tcard'],
            ['holding a line feed', 'open\ncard'],
            ['holding a form feed', 'open\fcard'],
            ['holding a carriage return', 'open\rcard'],
        ])('refuses a key that is no token, %s, as an evaluation error', (_, name) => {
            const error = getError(() => evaluate('panel.class[name]', { name }));

            expect(error.kind).toBe('evaluation');
            expect(error.code).toBe('NEXO5007');
            expect(error.message).toContain(`${JSON.stringify(name)} is no class, which is one token: never empty, and holding no tab, line feed, form feed, carriage return or space`);
        });

        it('takes any other character a token holds, as a class list does', () => {
            panel.className = 'a\u00a0b';

            expect(evaluate('panel.class[name]', { name: 'a\u00a0b' })).toBe(true);
        });
    });

    describe('an indexer a module declares', () => {
        it('takes a key of the type its parameter declares, and answers structured data that a chain reads on', () => {
            registerEntries();

            expect(evaluate('import Entries\npanel:entry[1]')).toEqual({ label: 'panel 1', rank: 10 });
            expect(evaluate('import Entries\npanel:entry[2]?.label')).toBe('panel 2');
            expect(evaluate('import Entries\npanel:entry[2]?.["rank"]')).toBe(20);
            expect(evaluate('import Entries\npanel:entry[5]?.label')).toBeNull();
            expect(evaluate('import Entries\npanel { first = it:entry[0]?.label, ranks = it.children { rank = it:entry[1]?.rank } }')).toEqual({ first: 'panel 0', ranks: [{ rank: 10 }] });
        });

        it('evaluates neither its key nor its implementation for a null receiver read with ?:', () => {
            const counts = registerEntries();

            expect(evaluate('import Entries\nmissing?:entry[panel:entries]', { missing: null })).toBeNull();
            expect(counts).toEqual({ entries: 0, reads: 0 });
            expect(evaluate('import Entries\npanel?:entry[panel:entries]')).toEqual({ label: 'panel 1', rank: 10 });
            expect(counts).toEqual({ entries: 1, reads: 1 });
        });

        it('is read with :, and refused through ., which reads a type\'s own members alone', () => {
            registerEntries();

            expect(getError(() => isolated.query('import Entries\npanel.entry[1]', { panel }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3090' });
        });

        it.each([
            ['a parameter on a property', { kind: 'property' }, 'NEXO4030', "A member of kind 'property' declares name, kind, result, impl, internal, updates, and 'parameters' is none of them"],
            ['a host call', { invokedBy: 'host', requestKind: 'execution', executionMode: 'once', updates: undefined }, 'NEXO4053', 'A function the host invokes is written as a function call, never as an indexer'],
            ['no parameter', { parameters: [] }, 'NEXO4020', 'An indexer takes its key as its one parameter, a required value parameter'],
            ['two parameters', { parameters: [{ name: 'a', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }, { name: 'b', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }] }, 'NEXO4020', 'An indexer takes its key as its one parameter'],
            ['an optional parameter', { parameters: [{ name: 'a', kind: 'value', type: 'Number', required: false, nulls: 'propagate' }] }, 'NEXO4020', 'a required value parameter'],
            ['an expression parameter', { parameters: [{ name: 'a', kind: 'expression', type: 'Boolean?', context: 'item', required: true, nulls: 'accept' }] }, 'NEXO4020', 'a required value parameter'],
            ['options for its input', { arguments: 'options' }, 'NEXO4030', "A member of kind 'indexer' declares name, kind, result, impl, internal, invokedBy, parameters, updates, and 'arguments' is none of them"],
        ])('is refused where it declares %s', (_, overrides, code, message) => {
            const declaration = { name: 'entries', kind: 'indexer', parameters: [{ name: 'index', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }], result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 1, ...overrides };
            const error = getError(() => isolated.createModule('Entries', { types: [elementExtension('EntryElements', [declaration])] }));

            expect(error.kind).toBe('module');
            expect(error.code).toBe(code);
            expect(error.location).toMatchObject({ module: 'Entries', type: 'EntryElements', declaration: 'entries' });
            expect(error.message).toContain(message);
        });
    });
});
describe('domql list indexing', () => {
    let panel;
    let empty;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel"><i data-key="a1"></i><i data-key="a2"></i><i data-key="a3"></i></div><div id="empty"></div>';
        panel = document.getElementById('panel');
        empty = document.getElementById('empty');
    });

    const keyAt = (text, bindings = {}) => domql.query(`{ key = ${text}?["data-key"] }`, { panel, empty, ...bindings }).evaluate().key;

    it.each([
        ['the first item', '0', 'a1'],
        ['an item within the list', '1', 'a2'],
        ['the last item', '2', 'a3'],
        ['an index one past the end', '3', null],
        ['an index far past the end', '1e300', null],
        ['a negative index, which never counts from the end', '-1', null],
        ['negative zero, which is zero', '-0', 'a1'],
        ['a fractional index', '1.5', null],
        ['an index a binding gives', 'i', 'a2', { i: 1 }],
        ['an index computed from an attribute', 'panel["data-i"] to Number', 'a3', {}, '2'],
    ])('answers %s', (_, key, answer, bindings = {}, attribute) => {
        if (attribute !== undefined) {
            panel.setAttribute('data-i', attribute);
        }

        expect(keyAt(`panel.children[${key}]`, bindings)).toBe(answer);
    });

    it('answers null for an empty list, a null index, and through optional access a null receiver, without evaluating the index', () => {
        expect(keyAt('empty.children[0]')).toBeNull();
        expect(keyAt('panel.children[i]', { i: null })).toBeNull();
        expect(keyAt('none?.children[panel.first("[")?.children?.count ?? 0]', { none: null })).toBeNull();
        expect(keyAt('none?.children[i]', { none: null, i: null })).toBeNull();
        expect(getError(() => keyAt('panel.children[panel.first("[")?.children?.count ?? 0]')).message).toContain("The member 'first' failed");
    });

    it('answers an item that can be null, and refuses an index that is no number and a receiver that can be null without optional access', () => {
        expect(domql.query('panel.children[0]?.size', { panel }).resolve().type.toString()).toBe('Size?');
        expect(domql.query('panel.children[i]?.size', { panel, i: null }).resolve().type.toString()).toBe('Size?');
        expect(getError(() => domql.query('panel.children["1"]', { panel }).resolve())).toMatchObject({ code: 'NEXO3084', message: expect.stringContaining('The unnamed indexer of List<Element> takes Number, Index or Range, and is given String') });
        expect(getError(() => domql.query('none.children[0]', { none: null }).resolve())).toMatchObject({ kind: 'validation', code: 'NEXO3008' });
    });
});

