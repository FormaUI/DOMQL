import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { DomqlQuery } from '#domql/dom/DomqlQuery.mjs';
import { domql } from '#domql/domql.js';
import { DomqlError } from '#domql/language/DomqlError.mjs';
import { ParsedTexts } from '#domql/language/ParsedTexts.mjs';

/** The error a call throws. */
const getError = call => {
    try {
        call();
    } catch (error) {
        return error;
    }

    throw new Error('The call threw nothing');
};

const self = { kind: 'self' };
const member = (name, target = self) => ({ kind: 'member', target, name });
const call = (name, argument, target = self) => (argument === undefined ? { kind: 'call', target, name } : { kind: 'call', target, name, argument });
const infixCall = (name, argument, target = self) => (argument === undefined ? { kind: 'infixCall', target, name } : { kind: 'infixCall', target, name, argument });
const indexer = (name, argument, target = self, optional = false) => (optional ? { kind: 'indexer', target, name, argument, optional } : { kind: 'indexer', target, name, argument });

const literal = value => ({ kind: 'literal', value });
const parameter = name => ({ kind: 'parameter', name });
const equality = (left, right) => ({ kind: 'equality', left, right });
const not = operand => ({ kind: 'not', operand });

describe('domql', () => {
    describe('query from text', () => {
        it('reads the specification\'s example into its definition', () => {
            const query = domql.query('panel { size = self.size, hasFocus = self.has("focus-within") }');

            expect(query.definition).toEqual({
                version: 22,
                query: {
                    kind: 'object',
                    target: parameter('panel'),
                    fields: [
                        { name: 'size', value: member('size') },
                        { name: 'hasFocus', value: call('has', literal('focus-within')) },
                    ],
                },
            });
        });

        it('reads a chain as a succession of targets', () => {
            const { definition } = domql.query('panel.all("li").count');

            expect(definition.query).toEqual(member('count', call('all', literal('li'), parameter('panel'))));
        });

        it('reads a property access, a call and a named indexer as nodes of their own, each holding its receiver', () => {
            expect(domql.query('panel.size').definition.query).toEqual(member('size', parameter('panel')));
            expect(domql.query('panel.closest(".row")').definition.query).toEqual(call('closest', literal('.row'), parameter('panel')));
            expect(domql.query('panel.parent.closest()').definition.query).toEqual(call('closest', undefined, member('parent', parameter('panel'))));
            expect(domql.query('panel:attribute["id"]').definition.query).toEqual(indexer('attribute', literal('id'), parameter('panel')));
            expect(domql.query('panel.matches(".row")').definition.query).toEqual(call('matches', literal('.row'), parameter('panel')));
            expect(domql.query('sentinel.intersects()').definition.query).toEqual(call('intersects', undefined, parameter('sentinel')));
        });

        it('reads self as the current value, written as a receiver like any other', () => {
            expect(domql.query('panel { width = self.size.width }').definition.query.fields[0].value).toEqual(member('width', member('size', self)));
        });

        it('takes one argument in a call, any expression, which its parentheses delimit', () => {
            expect(domql.query('rows.where(self.attached and self.is("visible"))').definition.query.argument.kind).toBe('and');
        });

        it('takes an options object as a call\'s argument, and an argument that begins with a keyword in its parentheses', () => {
            expect(domql.query('sentinel.intersects({ root = panel, margin = 200, })').definition.query.argument).toEqual({ kind: 'object', fields: [{ name: 'root', value: parameter('panel') }, { name: 'margin', value: literal(200) }] });
            expect(domql.query('x.matches(not flag)').definition.query.argument).toEqual(not(parameter('flag')));
            expect(domql.query('x.intersects() and y').definition.query.kind).toBe('and');
        });

        it('takes a call across a line break', () => {
            expect(domql.query('target {\n    open = self\n    .matches(\n    ".open")\n}').definition).toEqual(domql.query('target { open = self.matches(".open") }').definition);
        });

        it('takes an object expression after a call', () => {
            const { definition } = domql.query('table.all("tr") { height = self.rect.height }');

            expect(definition.query.kind).toBe('object');
            expect(definition.query.target).toEqual(call('all', literal('tr'), parameter('table')));
        });

        it('reads every kind of literal', () => {
            const { definition } = domql.query('{ a = "say \\"hi\\" \\\\", b = -1.5e2, c = 0, d = true, e = false, f = null }');

            expect(definition.query.fields.map(field => field.value.value)).toEqual(['say "hi" \\', -150, 0, true, false, null]);
        });

        it('skips line and block comments, which separate as whitespace does', () => {
            const { definition } = domql.query('// A panel.\npanel { /* its\nfirst item */ open = self.first(".item") /* inline */.matches(/**/".open") // whether it is open\n}');

            expect(definition.query.fields[0].value).toEqual(call('matches', literal('.open'), call('first', literal('.item'))));
        });

        it('keeps comment markers inside a string as text', () => {
            const { definition } = domql.query('target:attribute["https://example.com/* not a comment */"]');

            expect(definition.query.argument).toEqual(literal('https://example.com/* not a comment */'));
        });

        it('closes a block comment at its first */, so comments do not nest', () => {
            expect(getError(() => domql.query('panel { /* outer /* inner */ still a comment */ size: self.size }')).kind).toBe('syntax');
        });

        it('reads an object expression following no value as one keeping the current value', () => {
            const { definition } = domql.query('panel { layout = { width = self.size.width } }');

            expect(definition.query.fields[0]).toEqual({
                name: 'layout',
                value: { kind: 'object', fields: [{ name: 'width', value: member('width', member('size')) }] },
            });
        });

        it('keeps the name written for each field', () => {
            const { definition } = domql.query('target { bounds = self["rect"], clientSize = self.clientSize }');

            expect(definition.query.fields).toEqual([
                { name: 'bounds', value: member('rect') },
                { name: 'clientSize', value: member('clientSize') },
            ]);
        });

        it('reads a camelCase name as one name and the literal an indexer takes as its key', () => {
            const { definition } = domql.query('target { tier = self:style["--layout-tier"], dark = self.rectRelativeTo(panel) }');

            expect(definition.query.fields).toEqual([
                { name: 'tier', value: indexer('style', literal('--layout-tier')) },
                { name: 'dark', value: call('rectRelativeTo', parameter('panel')) },
            ]);
        });

        it('freezes the definition', () => {
            const { definition } = domql.query('panel { size = self.size }');

            expect(Object.isFrozen(definition)).toBe(true);
            expect(Object.isFrozen(definition.query.fields[0].value.target)).toBe(true);
        });

        it('shares one definition between parses of the same text', () => {
            const first = domql.query('panel { size = self.size, clientSize = self.clientSize }', { panel: 1 });
            const second = domql.query('panel { size = self.size, clientSize = self.clientSize }', { panel: 2 });

            expect(second.definition).toBe(first.definition);
            expect(DomqlQuery.bindingsOf(second).get('panel')).toBe(2);
        });

        it('reads a source that is no text as a definition, refusing one that is none', () => {
            for (const source of [42, null, { definition: {} }]) {
                const error = getError(() => domql.query(source));

                expect(error.kind).toBe('structure');
                expect(error.location).toEqual({ pointer: '' });
            }
        });
    });

    describe('tests', () => {
        it('read a test as the Boolean member it is, written as any property is, and a condition as the call of is it is', () => {
            expect(domql.query('document.is("visible")').definition.query).toEqual(call('is', literal('visible'), parameter('document')));
            expect(domql.query('input.hasSelection').definition.query).toEqual(member('hasSelection', parameter('input')));
            expect(domql.query('panel.all("input").where(self.is("disabled"))').definition.query.argument).toEqual(call('is', literal('disabled')));
        });

        it('read has as the call of its verb and as an ordinary name', () => {
            expect(domql.query('panel.has("focus")').definition.query).toEqual(call('has', literal('focus'), parameter('panel')));
            expect(domql.query('{ has = panel.hasChildren }').definition.query.fields[0].name).toBe('has');
        });
    });

    describe('equalities', () => {
        it('read is between two equality operands, and is not as the negation of is', () => {
            expect(domql.query('panel.parent == null').definition.query).toEqual(equality(member('parent', parameter('panel')), literal(null)));
            expect(domql.query('action == "save"').definition.query).toEqual(equality(parameter('action'), literal('save')));
            expect(domql.query('a != b').definition.query).toEqual(not(equality(parameter('a'), parameter('b'))));
            expect(domql.query('left:attribute["name"] == right:attribute["name"]').definition.query).toEqual(equality(indexer('attribute', literal('name'), parameter('left')), indexer('attribute', literal('name'), parameter('right'))));
            expect(domql.query('node as "element" == panel').definition.query).toEqual(equality({ kind: 'cast', type: 'element', target: parameter('node') }, parameter('panel')));
        });

        it('give is not, not around is, and not before is one definition', () => {
            const negated = domql.query('a != b').definition;

            expect(domql.query('not (a == b)').definition).toEqual(negated);
            expect(domql.query('not a == b').definition).toEqual(negated);
        });

        it('bind more loosely than a conversion and more tightly than and, taking a group as either operand', () => {
            expect(domql.query('a == b and c').definition.query).toEqual({ kind: 'and', operands: [equality(parameter('a'), parameter('b')), parameter('c')] });
            expect(domql.query('(a == b) == true').definition.query).toEqual(equality(equality(parameter('a'), parameter('b')), literal(true)));
            expect(domql.query('(count ?? 0) == 0').definition.query).toEqual(equality({ kind: 'coalescing', value: parameter('count'), fallback: literal(0) }, literal(0)));
        });

        it.each([
            ['an equality without its right operand', { kind: 'equality', left: parameter('panel') }, '/query'],
            ['an equality whose left operand is no node', equality(1, parameter('panel')), '/query/left'],
            ['an equality of the current value at the top level', equality(self, literal(null)), '/query/left'],
            ['a predicate, which an equality and a member replace', { kind: 'predicate', verb: 'is', target: parameter('panel'), name: literal(null) }, '/query'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('logical expressions and groups', () => {
        it('combine whole expressions, and binding tighter than or', () => {
            const { query } = domql.query('panel.attached or input.is("disabled") and enabled').definition;

            expect(query).toEqual({
                kind: 'or',
                operands: [
                    member('attached', parameter('panel')),
                    { kind: 'and', operands: [call('is', literal('disabled'), parameter('input')), parameter('enabled')] },
                ],
            });
        });

        it('gather a run of one operator into one expression', () => {
            expect(domql.query('first or second or third').definition.query.operands).toEqual([parameter('first'), parameter('second'), parameter('third')]);
        });

        it('group any expression in parentheses, recording the expression the group holds', () => {
            expect(domql.query('(first or second) and third').definition.query).toEqual({ kind: 'and', operands: [{ kind: 'or', operands: [parameter('first'), parameter('second')] }, parameter('third')] });
            expect(domql.query('((first))').definition.query).toEqual(parameter('first'));
        });

        it('start a chain from a group', () => {
            expect(domql.query('(panel).children.count').definition.query).toEqual(member('count', member('children', parameter('panel'))));
        });

        it('stand as a field under the name written for it, as every field does', () => {
            expect(getError(() => domql.query('panel {.attached or.is("disabled") }')).kind).toBe('syntax');
            expect(() => domql.query('panel { unavailable = self.attached or self.is("disabled") }')).not.toThrow();
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('input.is("disabled") or (input.is("readonly") and input.is("text-editable"))', { input: document.body });

            expect(domql.query(parsed.definition, { input: document.body }).definition).toEqual(parsed.definition);
        });

        it.each([
            ['an and of one expression', { kind: 'and', operands: [parameter('panel')] }, '/query/operands'],
            ['an or whose operands are no array', { kind: 'or', operands: parameter('panel') }, '/query/operands'],
            ['an operand that tests the current value at the top level', { kind: 'or', operands: [member('visible'), parameter('panel')] }, '/query/operands/0/target'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conditionals', () => {
        const conditional = (condition, consequent, alternative) => ({ kind: 'conditional', condition, consequent, alternative });

        it('read a condition, a consequent and an alternative, each a whole expression', () => {
            expect(domql.query('if wide then panel else sidebar').definition.query).toEqual(conditional(parameter('wide'), parameter('panel'), parameter('sidebar')));
            expect(domql.query('if wide then first else second and third').definition.query.alternative).toEqual({ kind: 'and', operands: [parameter('second'), parameter('third')] });
        });

        it('record an elseif as a conditional nested in the alternative before it', () => {
            const nested = conditional(parameter('a'), literal(1), conditional(parameter('b'), literal(2), literal(3)));

            expect(domql.query('if a then 1 elseif b then 2 else 3').definition.query).toEqual(nested);
            expect(domql.query('if a then 1 else if b then 2 else 3').definition.query).toEqual(nested);
        });

        it('stand where an expression stands, grouped where it is an operand or starts a chain', () => {
            expect(domql.query('(if wide then panel else sidebar).rect.width').definition.query).toEqual(member('width', member('rect', conditional(parameter('wide'), parameter('panel'), parameter('sidebar')))));
            expect(domql.query('(if a then true else false) and b').definition.query.kind).toBe('and');
            expect(domql.query('panel { state = if self.is("disabled") then "locked" else "open" }').definition.query.fields[0].value.kind).toBe('conditional');
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('if panel == null then "gone" elseif panel.attached then "here" else "away"', { panel: document.body });

            expect(domql.query(parsed.definition, { panel: document.body }).definition).toEqual(parsed.definition);
        });

        it.each([
            ['a conditional without its alternative', { kind: 'conditional', condition: parameter('a'), consequent: literal(1) }, '/query'],
            ['a conditional whose branch is no node', conditional(parameter('a'), literal(1), 'else'), '/query/alternative'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('optional access', () => {
        const optional = node => ({ ...node, optional: true });
        const chain = target => ({ kind: 'optionalChain', target });

        it('reads ?. as an optional access or call, held by the optional chain that ends where its chain does', () => {
            expect(domql.query('panel.parent?.children.count').definition.query).toEqual(chain(member('count', optional(member('children', member('parent', parameter('panel')))))));
            expect(domql.query('panel.first(".a")?.closest(".b")').definition.query).toEqual(chain(optional(call('closest', literal('.b'), call('first', literal('.a'), parameter('panel'))))));
        });

        it('end a chain at a group, which a chain continues from as a value of its own', () => {
            expect(domql.query('(panel.parent?.children).count').definition.query).toEqual(member('count', chain(optional(member('children', member('parent', parameter('panel')))))));
        });

        it('carry an object expression and the calls after an optional one in the chain', () => {
            expect(domql.query('panel.parent?.rect { top = self.top }').definition.query).toEqual(chain({ kind: 'object', target: optional(member('rect', member('parent', parameter('panel')))), fields: [{ name: 'top', value: member('top') }] }));
            expect(domql.query('panel.parent?.closest(".row").matches(".open")').definition.query).toEqual(chain(call('matches', literal('.open'), optional(call('closest', literal('.row'), member('parent', parameter('panel')))))));
        });

        it('keep the chain of an argument its own', () => {
            expect(domql.query('panel.closest(row?.key)').definition.query).toEqual(call('closest', chain(optional(member('key', parameter('row')))), parameter('panel')));
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('(panel.parent?.children).count == null and panel.first(".a")?.closest(".b") == null');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });

        it.each([
            ['an optional access outside an optional chain', optional(member('size', parameter('panel'))), '/query'],
            ['an optional chain holding no optional access', chain(member('size', parameter('panel'))), '/query'],
            ['an optional chain directly holding another', chain(chain(optional(member('size', parameter('panel'))))), '/query'],
            ['an optional access that is not true', { ...member('size', parameter('panel')), optional: false }, '/query/optional'],
            ['a call named by an expression, which only a bracket property access is', { kind: 'call', target: parameter('panel'), name: literal('closest') }, '/query/name'],
            ['an optional access of an argument the chain it is passed to holds', chain(optional(call('closest', optional(member('key', parameter('row'))), parameter('panel')))), '/query/target/argument'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });

        it('read an optional enclosed access as the optional chain of its accesses, every one of them optional', () => {
            expect(domql.query('(?panel.parent.rect)').definition).toEqual(domql.query('panel?.parent?.rect').definition);
            expect(domql.query('(?panel.first(".a").closest(".b"))').definition.query).toEqual(chain(optional(call('closest', literal('.b'), optional(call('first', literal('.a'), parameter('panel')))))));
        });

        it('end the optional chain of an optional enclosed access at its closing parenthesis', () => {
            const group = chain(optional(member('z', optional(member('y', parameter('x'))))));

            expect(domql.query('(?x.y.z)?.a.b').definition.query).toEqual(chain(member('b', optional(member('a', group)))));
            expect(domql.query('(?x.y.z)?.a?.b').definition.query).toEqual(chain(optional(member('b', optional(member('a', group))))));
            expect(domql.query('(x.y.z)?.a').definition.query).toEqual(chain(optional(member('a', member('z', member('y', parameter('x')))))));
        });

        it('take an optional enclosed access as a chain input, a call\'s argument among them, keeping its arguments their own', () => {
            expect(domql.query('panel.matches((?row.key))').definition.query).toEqual(call('matches', chain(optional(member('key', parameter('row')))), parameter('panel')));
            expect(domql.query('(?panel.closest(row.key))').definition.query).toEqual(chain(optional(call('closest', member('key', parameter('row')), parameter('panel')))));
        });

        it.each([
            ['a question mark apart from its parenthesis', '( ?panel.size)', 1, 3],
            ['an optional enclosed access with no access', '(?panel)', 1, 8],
            ['an optional enclosed access whose receiver is a group holding no cast', '(?(panel).size)', 1, 9],
            ['an optional enclosed access holding an object expression', '(?panel.rect { top: self.top })', 1, 14],
            ['an optional enclosed access holding a member written after a space', '(?panel.parent matches ".row")', 1, 16],
            ['a call whose parenthesis opens the optional enclosed access that is its argument', 'panel.closest(?row.key)', 1, 14],
        ])('refuse %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a question mark apart from its dot', 'panel? .size', 1, 6],
            ['an optional access with no name', 'panel?.', 1, 8],
        ])('refuse %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('bracket property access', () => {
        const optional = node => ({ ...node, optional: true });
        const chain = target => ({ kind: 'optionalChain', target });

        it('reads a bracket as a property access named by the expression it holds, and a string literal that is a name as that name', () => {
            expect(domql.query('panel[name]').definition.query).toEqual(member(parameter('name'), parameter('panel')));
            expect(domql.query('panel["size"]').definition).toEqual(domql.query('panel.size').definition);
            expect(domql.query('panel["data-key"]').definition.query).toEqual(member(literal('data-key'), parameter('panel')));
            expect(domql.query('panel [ name ]').definition).toEqual(domql.query('panel[name]').definition);
        });

        it('read ?[…] as an optional bracket property access, and every bracket property access of an optional enclosed access as optional', () => {
            expect(domql.query('panel.parent?[name]').definition.query).toEqual(chain(optional(member(parameter('name'), member('parent', parameter('panel'))))));
            expect(domql.query('(?panel.parent[name].width)').definition.query).toEqual(chain(optional(member('width', optional(member(parameter('name'), optional(member('parent', parameter('panel')))))))));
        });

        it('are created from a definition as they are parsed from text, a string literal that is a name written as the name', () => {
            const parsed = domql.query('panel[if wide then "size" else "clientSize"]?.width');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
            expect(domql.query({ version: 22, query: member(literal('size'), parameter('panel')) }).definition.query).toEqual(member('size', parameter('panel')));
        });

        it.each([
            ['empty brackets', 'panel[]', 1, 7],
            ['an unclosed bracket', 'panel[name', 1, 11],
            ['a dot before a bracket', 'panel.[name]', 1, 6],
            ['a dot before an optional bracket', 'panel?.[name]', 1, 6],
            ['a dot before a bracket in an optional enclosed access', '(?panel.[name])', 1, 8],
            ['a bracket after a conversion, which ends its chain', 'a to "string"[name]', 1, 14],
        ])('refuse %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('casts', () => {
        const cast = (type, target) => ({ kind: 'cast', type, target });
        const optional = node => ({ ...node, optional: true });
        const chain = target => ({ kind: 'optionalChain', target });

        it('read a target, as and the quoted type it casts to, which a chain continues from only in a group', () => {
            expect(domql.query('panel.parent as "element"').definition.query).toEqual(cast('element', member('parent', parameter('panel'))));
            expect(domql.query('(panel.parent as "element")?.rect').definition.query).toEqual(chain(optional(member('rect', cast('element', member('parent', parameter('panel')))))));
            expect(domql.query('(panel.parent as "element").matches(".row")').definition.query).toEqual(call('matches', literal('.row'), cast('element', member('parent', parameter('panel')))));
        });

        it('take a coalescing operator in parentheses, an optional enclosed access and another cast in a group as targets', () => {
            expect(domql.query('(a ?? b) as "element"').definition.query).toEqual(cast('element', { kind: 'coalescing', value: parameter('a'), fallback: parameter('b') }));
            expect(domql.query('(?node.parent) as "element"').definition.query).toEqual(cast('element', chain(optional(member('parent', parameter('node'))))));
            expect(domql.query('(a as "node") as "element"').definition.query).toEqual(cast('element', cast('node', parameter('a'))));
        });

        it('stand as the receiver of an optional enclosed access, their own target\'s accesses optional too', () => {
            expect(domql.query('(?(panel.parent as "element").rect.width)').definition).toEqual(domql.query('(panel?.parent as "element")?.rect?.width').definition);
            expect(domql.query('(?((node.parent as "node") as "element").rect)').definition).toEqual(domql.query('((node?.parent as "node") as "element")?.rect').definition);
            // `self` and a literal are receivers a grouped cast holds, never keywords that tell a grouped target from a grouped cast.
            expect(domql.query('panel { w = (?((self.parent as "node") as "element").rect) }').definition).toEqual(domql.query('panel { w = ((self?.parent as "node") as "element")?.rect }').definition);
            expect(domql.query('(?((null as "node") as "element").rect)').definition).toEqual(domql.query('((null as "node") as "element")?.rect').definition);
        });

        it('stand as the receiver of an optional enclosed access with a grouped target that keeps its own rules, a coalescing operator or another optional enclosed access', () => {
            expect(domql.query('(?((a.x ?? b.y) as "element").rect.width)').definition).toEqual(domql.query('((a.x ?? b.y) as "element")?.rect?.width').definition);
            expect(domql.query('(?((?a.b) as "element").c)').definition).toEqual(domql.query('(a?.b as "element")?.c').definition);
            expect(domql.query('(?(((a ?? b) as "node") as "element").rect)').definition).toEqual(domql.query('(((a ?? b) as "node") as "element")?.rect').definition);
            expect(domql.query('(?((a ?? b as "node") as "element").rect)').definition).toEqual(domql.query('((a ?? b as "node") as "element")?.rect').definition);
            expect(domql.query('(?((a as "node" ?? b) as "element").rect)').definition).toEqual(domql.query('((a as "node" ?? b) as "element")?.rect').definition);
        });

        it.each([
            ['a grouped coalescing operator an access follows', '(?((a ?? b).x as "element").rect)', 1, 12],
            ['an optional enclosed access an access follows', '(?((?a.b).c as "element").d)', 1, 10],
            ['a conditional in parentheses', '(?((if a then b else c) as "element").d)', 1, 4],
            ['a conditional in parentheses whose branch is a cast', '(?((if a then b as "node" else c) as "element").d)', 1, 4],
            ['a coalescing operator that no cast holds', '(?((a ?? b)).rect)', 1, 12],
        ])('refuse as the cast an optional enclosed access receives %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['of a conditional in parentheses', '(if a then b else c) as "element"', 1, 1],
            ['of a chain an object expression continues', 'a { x = 1 } as "element"', 1, 1],
            ['of an optional enclosed access a chain continues', '(?a.b).c as "element"', 1, 1],
            ['of a coalescing operator a chain continues', '(a ?? b).c as "element"', 1, 1],
            ['to a type that is not quoted', 'a as element', 1, 6],
            ['continued without a group', 'a as "element".rect', 1, 15],
            ['of a cast without a group', 'a as "node" as "element"', 1, 13],
        ])('refuse a cast %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', cast(5, parameter('a')), '/query/type'],
            ['a target that is an infixCall, which is no node', cast('element', infixCall('matches', literal('.row'), parameter('a'))), '/query/target'],
        ])('refuse a definition of a cast with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conversions', () => {
        const conversion = (type, target) => ({ kind: 'conversion', type, target });
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });

        it('read a value, to and the quoted type it converts to, binding looser than a cast and tighter than an equality, and chaining left to right', () => {
            expect(domql.query('a to "number"').definition.query).toEqual(conversion('number', parameter('a')));
            expect(domql.query('panel:attribute["data-count"] to "number"').definition.query).toEqual(conversion('number', indexer('attribute', literal('data-count'), parameter('panel'))));
            expect(domql.query('panel.matches(".open") to "string"').definition.query).toEqual(conversion('string', call('matches', literal('.open'), parameter('panel'))));
            expect(domql.query('a to "string" to "number"').definition.query).toEqual(conversion('number', conversion('string', parameter('a'))));
            expect(domql.query('panel:attribute["data-count"] to "number" == 5').definition.query).toEqual(equality(conversion('number', indexer('attribute', literal('data-count'), parameter('panel'))), literal(5)));
            expect(domql.query('a to "number" ?? 0').definition.query).toEqual(coalescing(conversion('number', parameter('a')), literal(0)));
            expect(domql.query('a ?? b to "number"').definition.query).toEqual(coalescing(parameter('a'), conversion('number', parameter('b'))));
            expect(domql.query('not a to "boolean"').definition.query).toEqual(not(conversion('boolean', parameter('a'))));
            expect(domql.query('a as "element" to "string"').definition.query).toEqual(conversion('string', { kind: 'cast', type: 'element', target: parameter('a') }));
            expect(domql.query('sentinel.intersects() to "string"').definition.query).toEqual(conversion('string', call('intersects', undefined, parameter('sentinel'))));
            expect(domql.query('panel.matches(to) to "string"').definition.query).toEqual(conversion('string', call('matches', parameter('to'), parameter('panel'))));
        });

        it('take to with or without the trivia around it, which separates nothing a token does not', () => {
            const spaced = domql.query('a to "number"').definition;

            expect(domql.query('a to"number"').definition).toEqual(spaced);
            expect(domql.query('a/* the value */to/* its type */"number"').definition).toEqual(spaced);
            expect(domql.query('(a)to "number"').definition).toEqual(spaced);
            expect(domql.query('a:["n"]to "number"').definition.query).toEqual(conversion('number', indexer(undefined, literal('n'), parameter('a'))));
        });

        it('leave to a name everywhere but after a value: a field, a local, a parameter, a property, a call and an indexer', () => {
            expect(domql.query('{ from = 1, to = 2 }').definition.query.fields.map(field => field.name)).toEqual(['from', 'to']);
            expect(domql.query('panel { let to = self.size, width = to.width }').definition.query.fields[0].value).toEqual(member('width', { kind: 'local', name: 'to' }));
            expect(domql.query('range.to').definition.query).toEqual(member('to', parameter('range')));
            expect(domql.query('range.to()').definition.query).toEqual(call('to', undefined, parameter('range')));
            expect(domql.query('range { let to = "3", value = to to "number" }').definition.query.fields[0].value).toEqual(conversion('number', { kind: 'local', name: 'to' }));
            expect(domql.query('to.size').definition.query).toEqual(member('size', parameter('to')));
            expect(domql.query('range:to[1]').definition.query).toEqual(indexer('to', literal(1), parameter('range')));
            expect(domql.query('panel { let to = ".x", open = self.matches(to) }').definition.query.fields[0].value).toEqual(call('matches', { kind: 'local', name: 'to' }));
            expect(domql.query({ version: 22, query: member('to', parameter('to')) }).definition.query).toEqual(member('to', parameter('to')));
            expect(domql.query({ version: 22, query: { kind: 'object', target: parameter('to'), locals: [{ name: 'to', value: literal(1) }], fields: [{ name: 'to', value: { kind: 'local', name: 'to' } }] } }).definition.query.fields[0].name).toBe('to');
        });

        it.each([
            ['to a type that is not quoted', 'a to number', 1, 6],
            ['continued without a group', 'a to "number".x', 1, 14],
            ['followed by an object expression', 'a to "number" { x: 1 }', 1, 15],
            ['followed by a member written after a space', 'a to "number" matches ".row"', 1, 15],
            ['cast without a group', 'a to "string" as "element"', 1, 15],
            ['written without the value it converts', 'to "number"', 1, 1],
        ])('refuse a conversion %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', conversion(5, parameter('a')), '/query/type'],
            ['no target', { kind: 'conversion', type: 'number' }, '/query'],
        ])('refuse a definition of a conversion with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('attempts', () => {
        const conversion = (type, target) => ({ kind: 'conversion', type, target });
        const cast = (type, target) => ({ kind: 'cast', type, target });
        const attempt = target => ({ kind: 'try', target });
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });
        const queryOf = text => domql.query(text).definition.query;

        it('read try and the one conversion or cast it attempts, binding tighter than an equality and a coalescing operator', () => {
            expect(queryOf('try a to "number"')).toEqual(attempt(conversion('number', parameter('a'))));
            expect(queryOf('try panel:["data-n"] to "number"')).toEqual(attempt(conversion('number', indexer(undefined, literal('data-n'), parameter('panel')))));
            expect(queryOf('try (a to "string") to "number"')).toEqual(attempt(conversion('number', conversion('string', parameter('a')))));
            expect(queryOf('try a to "number" == 5')).toEqual(equality(attempt(conversion('number', parameter('a'))), literal(5)));
            expect(queryOf('try a to "number" ?? 0')).toEqual(coalescing(attempt(conversion('number', parameter('a'))), literal(0)));
            expect(queryOf('(try a to "number") to "string"')).toEqual(conversion('string', attempt(conversion('number', parameter('a')))));
            expect(queryOf('try node as "element"')).toEqual(attempt(cast('element', parameter('node'))));
            expect(queryOf('try node.parent as "element"')).toEqual(attempt(cast('element', member('parent', parameter('node')))));
            expect(queryOf('(try node as "element") != null')).toEqual({ kind: 'not', operand: equality(attempt(cast('element', parameter('node'))), literal(null)) });
            expect(queryOf('try node as "element" ?? panel')).toEqual(coalescing(attempt(cast('element', parameter('node'))), parameter('panel')));
            expect(queryOf('try (node as "element").parent as "element"')).toEqual(attempt(cast('element', member('parent', cast('element', parameter('node'))))));
            expect(queryOf('try (node as "element") to "string"')).toEqual(attempt(conversion('string', cast('element', parameter('node')))));
        });

        it('leave is and convertible names, as any word that is no keyword is', () => {
            const local = parameter('convertible');

            expect(domql.query('a == convertible').definition.query).toEqual(equality(parameter('a'), local));
            expect(domql.query('a == convertible to "number"').definition.query).toEqual(equality(parameter('a'), conversion('number', local)));
            expect(domql.query('a.convertible').definition.query).toEqual(member('convertible', parameter('a')));
            expect(domql.query('{ is = 1 }').definition.query.fields[0].name).toBe('is');
            expect(domql.query('panel { let is = self.size, width = is.width }').definition.query.fields[0].value).toEqual(member('width', { kind: 'local', name: 'is' }));
            expect(domql.query('a.is').definition.query).toEqual(member('is', parameter('a')));
            expect(domql.query('a.is("checked") == true').definition.query).toEqual(equality(call('is', literal('checked'), parameter('a')), literal(true)));
            expect(domql.query('a?.is("checked")').definition.query).toEqual({ kind: 'optionalChain', target: { ...call('is', literal('checked'), parameter('a')), optional: true } });
        });

        it.each([
            ['of a chain of conversions without a group', 'try a to "string" to "number"', 1, 1],
            ['of a conversion of a cast without a group', 'try node as "element" to "string"', 1, 1],
            ['of what is neither a conversion nor a cast', 'try a', 1, 1],
            ['of another attempt', 'try try a to "number"', 1, 5],
            ['to a type that is not quoted', 'try a to number', 1, 10],
            ['casting to a type that is not quoted', 'try a as element', 1, 10],
            ['chained by an equality', 'try a to "number" == 1 == 2', 1, 24],
            ['that a cast takes as its target', '(try a as "node") as "element"', 1, 1],
        ])('refuse an attempt %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['an attempt of a parameter', attempt(parameter('a')), '/query/target'],
            ['an attempt of an equality', attempt(equality(parameter('a'), literal(1))), '/query/target'],
            ['an attempt of another attempt', attempt(attempt(conversion('number', parameter('a')))), '/query/target'],
            ['an attempt of nothing', { kind: 'try' }, '/query'],
            ['a conversion that says it is attempted', { ...conversion('number', parameter('a')), attempt: true }, '/query'],
            ['a cast of an attempt', cast('element', attempt(cast('node', parameter('a')))), '/query/target'],
        ])('refuse a definition of %s, since try attempts a conversion or a cast', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conditional bindings', () => {
        const binding = (name, value, consequent, alternative) => ({ kind: 'conditional', binding: { name, value }, consequent, alternative });
        const local = name => ({ kind: 'local', name });

        it('read if let, a name, a colon and the value it binds in place of a condition, in an elseif too', () => {
            expect(domql.query('if let key = row:["data-key"] then key else "none"').definition.query).toEqual(binding('key', indexer(undefined, literal('data-key'), parameter('row')), local('key'), literal('none')));
            expect(domql.query('if a then 1 elseif let n = b then n else 0').definition.query).toEqual({ kind: 'conditional', condition: parameter('a'), consequent: literal(1), alternative: binding('n', parameter('b'), local('n'), literal(0)) });
        });

        it.each([
            ['without a name', 'if let: 1 then 2 else 3', 1, 7],
            ['without a colon', 'if let n 1 then 2 else 3', 1, 8],
            ['naming a keyword', 'if let try: 1 then 2 else 3', 1, 8],
        ])('refuse a binding written %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['both a condition and a binding', { kind: 'conditional', condition: literal(true), binding: { name: 'n', value: literal(1) }, consequent: literal(1), alternative: literal(2) }, '/query'],
            ['neither', { kind: 'conditional', consequent: literal(1), alternative: literal(2) }, '/query'],
            ['a binding without its value', { kind: 'conditional', binding: { name: 'n' }, consequent: literal(1), alternative: literal(2) }, '/query/binding'],
            ['a binding named as no name is', { kind: 'conditional', binding: { name: 'try', value: literal(1) }, consequent: literal(1), alternative: literal(2) }, '/query/binding/name'],
            ['a binding a local in scope names', { kind: 'object', target: parameter('panel'), locals: [{ name: 'n', value: literal(1) }], fields: [{ name: 'v', value: binding('n', literal(2), local('n'), literal(0)) }] }, '/query/fields/0/value/binding'],
        ])('refuse a definition of a conditional with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('named indexers', () => {
        const chain = target => ({ kind: 'optionalChain', target });

        it('read a receiver, a colon, the indexer\'s name and its one key in brackets, as one node of a chain', () => {
            expect(domql.query('panel:attribute["data-key"]').definition.query).toEqual(indexer('attribute', literal('data-key'), parameter('panel')));
            expect(domql.query('panel:attribute[name]').definition.query).toEqual(indexer('attribute', parameter('name'), parameter('panel')));
            expect(domql.query('panel.first(".row"):style["display"]').definition.query).toEqual(indexer('style', literal('display'), call('first', literal('.row'), parameter('panel'))));
            expect(domql.query('panel:lookup["a"]["b"]').definition.query).toEqual(member('b', indexer('lookup', literal('a'), parameter('panel'))));
            expect(domql.query('panel:lookup["a"].label').definition.query).toEqual(member('label', indexer('lookup', literal('a'), parameter('panel'))));
            expect(domql.query('panel : attribute [ "data-key" ]').definition).toEqual(domql.query('panel:attribute["data-key"]').definition);
        });

        it('read a colon and a key in brackets as the receiver\'s default indexer, which names none', () => {
            expect(domql.query('panel:["data-key"]').definition.query).toEqual({ kind: 'indexer', target: parameter('panel'), argument: literal('data-key') });
            expect(domql.query('panel?:[name]').definition.query).toEqual(chain({ kind: 'indexer', target: parameter('panel'), argument: parameter('name'), optional: true }));
            expect(domql.query('(?panel.first(".row"):["id"])').definition).toEqual(domql.query('panel?.first(".row")?:["id"]').definition);
            expect(domql.query({ version: 22, query: { kind: 'indexer', target: parameter('panel'), argument: literal('id') } }).definition.query).toEqual({ kind: 'indexer', target: parameter('panel'), argument: literal('id') });
        });

        it('leave a bracket after a member a bracket property access of what it answers', () => {
            expect(domql.query('panel.size["width"]').definition.query).toEqual(member('width', member('size', parameter('panel'))));
            expect(domql.query('panel.attribute["data-key"]').definition.query).toEqual(member(literal('data-key'), member('attribute', parameter('panel'))));
        });

        it('read ?: as an indexer of a receiver that can be null, and every indexer of an optional enclosed access as one', () => {
            expect(domql.query('panel?:attribute["id"]').definition.query).toEqual(chain(indexer('attribute', literal('id'), parameter('panel'), true)));
            expect(domql.query('(?panel.first(".row"):attribute["id"])').definition).toEqual(domql.query('panel?.first(".row")?:attribute["id"]').definition);
        });

        it('stand as a field\'s value, whose own colon comes first', () => {
            expect(domql.query('{ key = panel:attribute["data-key"], n = 1 }').definition.query.fields[0].value).toEqual(indexer('attribute', literal('data-key'), parameter('panel')));
            expect(domql.query('panel { key = self:attribute["data-key"] }').definition.query.fields[0].value).toEqual(indexer('attribute', literal('data-key'), self));
            expect(domql.query('{ x = attribute["a"] }').definition.query.fields[0]).toEqual({ name: 'x', value: member('a', parameter('attribute')) });
        });

        it.each([
            ['without brackets', 'panel:attribute', 1, 16],
            ['with empty brackets', 'panel:attribute[]', 1, 17],
            ['as a default indexer with empty brackets', 'panel:[]', 1, 8],
            ['as a default indexer with two keys', 'panel:["a", "b"]', 1, 11],
            ['with two keys', 'panel:attribute["a", "b"]', 1, 20],
            ['without a name or a key', 'panel:5', 1, 7],
            ['with an unclosed bracket', 'panel:attribute["a"', 1, 20],
        ])('refuse an indexer %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['no key', { kind: 'indexer', target: parameter('panel'), name: 'attribute' }, '/query'],
            ['an optional receiver outside an optional chain', indexer('attribute', literal('id'), parameter('panel'), true), '/query'],
        ])('refuse a definition of an indexer with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('negations', () => {
        it('read not before what it negates, binding looser than an equality and tighter than and and or', () => {
            expect(domql.query('not a').definition.query).toEqual(not(parameter('a')));
            expect(domql.query('not not a').definition.query).toEqual(not(not(parameter('a'))));
            expect(domql.query('not panel.attached').definition.query).toEqual(not(member('attached', parameter('panel'))));
            expect(domql.query('not a == null').definition.query).toEqual(not(equality(parameter('a'), literal(null))));
            expect(domql.query('not a and b').definition.query).toEqual({ kind: 'and', operands: [not(parameter('a')), parameter('b')] });
            expect(domql.query('a or not b').definition.query).toEqual({ kind: 'or', operands: [parameter('a'), not(parameter('b'))] });
            expect(domql.query('not (a or b)').definition.query).toEqual(not({ kind: 'or', operands: [parameter('a'), parameter('b')] }));
        });

        it('negate a coalescing operator a group holds', () => {
            expect(domql.query('not (busy ?? false)').definition.query).toEqual(not({ kind: 'coalescing', value: parameter('busy'), fallback: literal(false) }));
        });

        it.each([
            ['beside a coalescing operator it would negate', 'not busy ?? false', 1, 5],
            ['as the fallback of a coalescing operator', 'busy ?? not ready', 1, 9],
        ])('refuse not %s, where no group stands', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
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
            expect(domql.query('a ?? 0').definition.query).toEqual(coalescing(parameter('a'), literal(0)));
            expect(domql.query('a ?? b ?? 0').definition.query).toEqual(coalescing(parameter('a'), coalescing(parameter('b'), literal(0))));
            expect(domql.query('(a ?? b) ?? 0').definition.query).toEqual(coalescing(coalescing(parameter('a'), parameter('b')), literal(0)));
        });

        it('take a call on either side, and stand as a condition, a field and an argument', () => {
            expect(domql.query('a.matches(".x") ?? b.matches(".y")').definition.query).toEqual(coalescing(call('matches', literal('.x'), parameter('a')), call('matches', literal('.y'), parameter('b'))));
            expect(domql.query('a:attribute["x"] ?? b:attribute["x"]').definition.query).toEqual(coalescing(indexer('attribute', literal('x'), parameter('a')), indexer('attribute', literal('x'), parameter('b'))));
            expect(domql.query('if on ?? false then 1 else 2').definition.query.condition).toEqual(coalescing(parameter('on'), literal(false)));
            expect(domql.query('panel.closest(a ?? ".row")').definition.query.argument).toEqual(coalescing(parameter('a'), literal('.row')));
        });

        it('stand beside and, or and a predicate expression where a group holds one of them', () => {
            expect(domql.query('(a ?? false) and b').definition.query.operands[0]).toEqual(coalescing(parameter('a'), literal(false)));
            expect(domql.query('a ?? (b and c)').definition.query.fallback.kind).toBe('and');
            expect(domql.query('(a ?? b).attached').definition.query.target).toEqual(coalescing(parameter('a'), parameter('b')));
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('a ?? (b ?? 0)');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });

        it.each([
            ['beside and after them', 'a ?? false and b', 1, 1],
            ['beside and before them', 'a and b ?? false', 1, 7],
            ['beside or', 'a or b ?? false', 1, 6],
            ['beside a null test after them', 'a ?? b == null', 1, 8],
            ['beside a null test before them', 'a == null ?? false', 1, 11],
            ['with a question mark apart from the other', 'a ? ? 0', 1, 3],
        ])('refuse a coalescing operator %s, where no group stands', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a coalescing without its fallback', { kind: 'coalescing', value: parameter('a') }, '/query'],
            ['a coalescing whose fallback is no node', coalescing(parameter('a'), 0), '/query/fallback'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('locals', () => {
        const local = name => ({ kind: 'local', name });

        it('read into the object expression that holds them, before its fields, and a bare name as a use of one', () => {
            expect(domql.query('panel { let items = self.all("[data-key]"), count = items.count }').definition.query).toEqual({
                kind: 'object',
                target: parameter('panel'),
                locals: [{ name: 'items', value: call('all', literal('[data-key]')) }],
                fields: [{ name: 'count', value: member('count', local('items')) }],
            });
        });

        it('stand where a chain input stands, an object expression following one and an indexer taking one', () => {
            const { query } = domql.query('panel { let key = "data-key", let items = self.children, rows = items { key = self:attribute[key] } }').definition;

            expect(query.fields[0].value).toEqual({ kind: 'object', target: local('items'), fields: [{ name: 'key', value: indexer('attribute', local('key')) }] });
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('panel { let items = self.children, count = items.count, inner = self { let first = items:[0], key = first?:attribute["data-key"] } }', { panel: document.body });

            expect(domql.query(parsed.definition, { panel: document.body }).definition).toEqual(parsed.definition);
        });

        it('leave out of a definition the locals an object expression has none of', () => {
            const definition = { version: 22, query: { kind: 'object', target: parameter('panel'), locals: [], fields: [{ name: 'size', value: member('size') }] } };

            expect(domql.query('panel { size = self.size }').definition.query).not.toHaveProperty('locals');
            expect(domql.query(definition, { panel: document.body }).definition.query).not.toHaveProperty('locals');
        });

        it.each([
            ['two locals of one object expression with one name', 'panel { let a = 1, let a = 2, b = a }', 1, 20],
            ['a local reusing the name of one an enclosing object expression has in scope', 'panel { let a = 1, b = self { let a = 2, c = a } }', 1, 31],
        ])('refuse %s, naming where', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('structure');
            expect(error.location).toMatchObject({ line, column });
        });

        it('let object expressions beside one another each name a local alike', () => {
            expect(domql.query('panel { a = self { let n = 1, v = n }, b = self { let n = 2, v = n } }', { panel: document.body }).evaluate()).toEqual({ a: { v: 1 }, b: { v: 2 } });
        });

        it.each([
            ['a local named by no name', { kind: 'object', target: parameter('panel'), locals: [{ name: 'let', value: literal(1) }], fields: [{ name: 'a', value: literal(1) }] }, '/query/locals/0/name'],
            ['a local without its value', { kind: 'object', target: parameter('panel'), locals: [{ name: 'n' }], fields: [{ name: 'a', value: literal(1) }] }, '/query/locals/0'],
            ['a use of a local named by no name', { kind: 'local', name: 'if' }, '/query/name'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 22, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });

        it.each([
            ['a member written without its receiver', 'panel { width = rect.width }', "No local in scope or binding is named 'rect'; write 'self.rect' for the member of the current value", 17],
            ['an indexer written without its receiver or key', 'panel { key = attribute }', "No local in scope or binding is named 'attribute'; write 'self:attribute[…]'", 15],
            ['a call written without its receiver or argument', 'panel { row = closest }', "No local in scope or binding is named 'closest'; write 'self.closest(…)'", 15],
            ['a name that is no member of the current value', 'panel { a = nothing }', "No local in scope or binding is named 'nothing'", 13],
            ['a local read from the document where a bracket property access stands', 'panel { let path = self:attribute["data-path"], width = self[path] }', "A bracket property access reads a name determined when the query is prepared", 62],
            ['a local of an object expression used beside it', 'panel { a = self { let n = 1, v = n }, b = n }', "No local in scope or binding is named 'n'", 44],
            ['a name at the top level', 'items.count', "No local in scope or binding is named 'items'", 1],
            ['an options object holding a local', 'sentinel.intersects({ let m = 200, root = panel, margin = m })', "'intersects' takes its arguments as the fields of an object, whose fields are its parameters, so it holds no locals", 23],
        ])('refuse %s in resolution, naming where', (_, text, message, column) => {
            const error = getError(() => domql.query(text, { panel: document.body, sentinel: document.body }).evaluate());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
            expect(error.location).toMatchObject({ line: 1, column });
        });

        it.each([
            ['a local used before its declaration', 'panel { let a = b, let b = 1, c = a }', 'b', 17],
            ['a local that uses itself', 'panel { let n = n, a = 1 }', 'n', 17],
            ['a binding that uses itself', 'if let k = k then 1 else 2', 'k', 12],
            ['a local used before its declaration within a nested value', 'panel { let a = { x = b }, let b = 1, c = a }', 'b', 23],
        ])('refuse %s, never reading a binding of its name instead, naming where', (_, text, name, column) => {
            const error = getError(() => domql.query(text, { panel: document.body, a: 1, b: 2, k: 3, n: 4 }));

            expect(error.kind).toBe('structure');
            expect(error.message).toContain(`'${name}' is used before the local of that name is declared in its scope`);
            expect(error.location).toMatchObject({ line: 1, column });
        });

        it('read a name a sibling or an unrelated scope declares as the caller\'s binding, and one a local shadows as the local', () => {
            expect(domql.query('panel { a = self { let n = 1, v = n }, b = n }', { panel: document.body, n: 'outer' }).evaluate()).toEqual({ a: { v: 1 }, b: 'outer' });
            expect(domql.query('{ a = if let x = "inner" then x else x, b = x }', { x: 'outer' }).evaluate()).toEqual({ a: 'inner', b: 'outer' });
            expect(domql.query('panel { let x = 1, inner = x }', { panel: document.body, x: 'shadowed' }).evaluate()).toEqual({ inner: 1 });
            expect(domql.query('{ outer = x, inner = panel { let x = 2, v = x } }', { panel: document.body, x: 1 }).evaluate()).toEqual({ outer: 1, inner: { v: 2 } });
        });

        it('suggest no member a name has where there is no current value', () => {
            expect(getError(() => domql.query('rect.width').evaluate()).message).not.toContain('write');
        });
    });

    describe('syntax', () => {
        it.each([
            ['two fields with no comma between them', 'panel {\n    size = self.size\n    clientSize = self.clientSize\n}', 3, 5],
            ['a call with no receiver', 'panel { row = first(".row") }', 1, 15],
            ['a member given an argument with no receiver and no parentheses', 'panel { open = matches ".open" }', 1, 16],
            ['a null test with no subject', 'panel { open = == null }', 1, 16],
            ['a null test with no subject at the top level', '== null', 1, 1],
            ['arguments after a dot without parentheses', 'sentinel.intersects panel', 1, 21],
            ['a call given two arguments', 'panel.closest(".a", ".b")', 1, 19],
            ['a call given a named argument', 'panel.rectRelativeTo(relativeTo: other)', 1, 22],
            ['a member written after a space', 'panel matches ".open"', 1, 7],
            ['a member written after a call with nothing between them', 'panel.first(".row")matches ".open"', 1, 20],
            ['a member written after a space, an object expression after it', 'panel on "click" { x: self.clientX }', 1, 7],
            ['a member written after a space with no argument', 'sentinel intersects', 1, 10],
            ['self named as a field', 'panel { self: self.size }', 1, 9],
            ['an @ before a name, which a binding is named without', '@panel.size', 1, 1],
            ['a member given an argument without parentheses', 'target.is "attached"', 1, 11],
            ['an equality that chains', 'a == b == c', 1, 8],
            ['a negation after !=', 'a != not b', 1, 6],
            ['a single equals sign', 'a = 1', 1, 3],
            ['a single exclamation mark', 'a ! b', 1, 3],
            ['a group never closed', '(first or second', 1, 17],
            ['a group closing nothing', 'first)', 1, 6],
            ['an operator naming a field', 'panel { try: self.size }', 1, 9],
            ['an operator naming a parameter', 'and { size: self.size }', 1, 1],
            ['a field named with a hyphen, which subtracts', 'panel { is-open = self.size }', 1, 9],
            ['a minus with nothing after it', 'panel.size- ', 1, 13],
            ['an escape the language has none of', 'target:attribute["a\\q"]', 1, 20],
            ['a string never closed', 'target:attribute["id', 1, 18],
            ['a character outside the language', 'target.size & 1', 1, 13],
            ['an @ with no name after it', '@ { size: self.size }', 1, 1],
            ['an @ a space parts from a name', '@ panel', 1, 1],
            ['an @ a comment parts from a name', '@/* the panel */panel', 1, 1],
            ['a field without a name', 'panel { self.size }', 1, 9],
            ['a field without a name after a named one', 'panel { width = self.size.width, self.rect }', 1, 34],
            ['an object expression without a field', 'panel {}', 1, 8],
            ['a query that ends too soon', 'panel {', 1, 8],
            ['a reserved literal naming a field', 'panel { null: self.size }', 1, 9],
            ['a block comment never closed', 'panel { size: self.size /* the size', 1, 25],
            ['a slash with nothing after it', 'panel.size /', 1, 13],
            ['a # comment, which DOMQL has none of', '# A panel.\npanel { size: self.size }', 1, 1],
            ['a conditional without then', 'if wide else "b"', 1, 9],
            ['a conditional without else', 'if wide then "a"', 1, 17],
            ['a conditional that is an operand without parentheses', 'a and if b then true else false', 1, 7],
            ['a keyword of the conditional naming a field', 'panel { then: self.size }', 1, 9],
            ['a keyword of the conditional naming a member', 'panel.else', 1, 7],
            ['a conditional that is a condition without parentheses', 'if if a then b else c then 1 else 2', 1, 4],
            ['let naming a field', 'panel { let: self.size }', 1, 9],
            ['a keyword naming a local', 'panel { let if: self.size, a: 1 }', 1, 13],
            ['a local after a field', 'panel { a = self.size, let r = self.rect }', 1, 24],
            ['a local without its comma', 'panel { let r = self.rect width = r.width }', 1, 27],
            ['an object expression of locals alone', 'panel { let r = self.rect, }', 1, 28],
            ['a local given an argument', 'panel { let r = self.rect, a = r "x" }', 1, 32],
        ])('rejects %s, naming where', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.name).toBe('DomqlError');
            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('structure', () => {
        it.each([
            ['two fields named alike', 'target { width = self.rect.width, width = self.size.width }', '/query/fields/1'],
            ['two fields of an options object named alike', 'sentinel.intersects({ root = panel, root = other })', '/query/argument/fields/1'],
            ['self at the top level', 'self.rect.width', '/query/target/target'],
            ['self in a field of a top-level object expression', '{ width = self.rect.width }', '/query/fields/0/value/target/target'],
        ])('rejects %s, naming where', (_, text, pointer) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
            expect(error.location.line).toBe(1);
        });

        it('keeps a reserved word inside a string as an ordinary string', () => {
            expect(domql.query('target:attribute["null"]').definition.query.argument).toEqual(literal('null'));
        });

        it('accepts a field continuing past an access by a bound name', () => {
            expect(domql.query('target { width = self[name]?.width }').definition.query.fields).toHaveLength(1);
        });

        it('accepts a member at the start of an argument, whose current value its member decides', () => {
            expect(() => domql.query('list.all("li").where(self.intersects({ root = list })).count')).not.toThrow();
        });

        it('locates a failure on the line it is written on', () => {
            const error = getError(() => domql.query('target {\n    width = self.rect.width,\n    width = self.size.width\n}'));

            expect(error.location).toMatchObject({ pointer: '/query/fields/1', line: 3, column: 5 });
        });
    });

    describe('query from a definition', () => {
        it('creates the query its text parses into', () => {
            const parsed = domql.query('panel { size = self.size, hasFocus = self.has("focus-within") }', { panel: 1 });
            const created = domql.query(parsed.definition, { panel: 2 });

            expect(created.definition).toEqual(parsed.definition);
            expect(DomqlQuery.bindingsOf(created).get('panel')).toBe(2);
        });

        it('copies and freezes the definition it is given', () => {
            const definition = { version: 22, query: { kind: 'object', target: parameter('panel'), fields: [{ name: 'size', value: member('size') }] } };
            const query = domql.query(definition);

            definition.query.fields.push({ name: 'clientSize', value: member('clientSize') });

            expect(query.definition.query.fields).toHaveLength(1);
            expect(Object.isFrozen(query.definition.query)).toBe(true);
        });

        it.each([
            ['a version other than 11', { version: 10, query: parameter('panel') }, '/version'],
            ['a field without a name', { version: 22, query: { kind: 'object', target: parameter('panel'), fields: [{ value: member('size') }] } }, '/query/fields/0'],
            ['an object expression without a field', { version: 22, query: { kind: 'object', target: parameter('panel'), fields: [] } }, '/query'],
            ['a property no part has', { version: 22, query: { ...parameter('panel'), extra: true } }, '/query'],
            ['an unknown kind', { version: 22, query: { kind: 'phrase', name: 'size' } }, '/query'],
            ['a member without a receiver', { version: 22, query: { kind: 'member', name: 'size' } }, '/query'],
            ['a call without a receiver', { version: 22, query: { kind: 'call', name: 'closest' } }, '/query'],
            ['a property access holding an argument', { version: 22, query: { kind: 'member', target: parameter('panel'), name: 'size', argument: literal(1) } }, '/query'],
            ['a member holding the arguments of an earlier version', { version: 22, query: { kind: 'member', target: parameter('panel'), name: 'size', arguments: [] } }, '/query'],
            ['self at the top level', { version: 22, query: member('size', self) }, '/query/target'],
            ['a name that is no name', { version: 22, query: parameter('2panel') }, '/query/name'],
            ['a name ending in a hyphen', { version: 22, query: parameter('panel-') }, '/query/name'],
            ['a reserved literal naming a parameter', { version: 22, query: parameter('null') }, '/query/name'],
            ['a reserved literal naming a member', { version: 22, query: member('true', parameter('panel')) }, '/query/name'],
            ['self naming a member', { version: 22, query: member('self', parameter('panel')) }, '/query/name'],
            ['a reserved literal naming a field', { version: 22, query: { kind: 'object', target: parameter('panel'), fields: [{ name: 'false', value: member('size') }] } }, '/query/fields/0/name'],
            ['a literal that is no JSON scalar', { version: 22, query: literal(Number.NaN) }, '/query/value'],
            ['an object expression whose fields are no array', { version: 22, query: { kind: 'object', target: parameter('panel'), fields: {} } }, '/query/fields'],
        ])('rejects %s, naming its node', (_, definition, pointer) => {
            const error = getError(() => domql.query(definition));

            expect(error.kind).toBe('structure');
            expect(error.location).toEqual({ pointer });
        });
    });

    describe('bindings', () => {
        it('looks a binding up by the exact name', () => {
            const element = document.createElement('div');
            const query = domql.query('panel { size = self.size }', { panel: element, Panel: 2 });

            expect(DomqlQuery.bindingsOf(query).get('panel')).toBe(element);
            expect(DomqlQuery.bindingsOf(query).get('Panel')).toBe(2);
            expect(DomqlQuery.bindingsOf(query).has('PANEL')).toBe(false);
        });

        it.each([
            ['an element', () => document.createElement('div'), 'element'],
            ['a number', () => 3, 'number'],
            ['a list of numbers', () => [1, 2], 'list<number>'],
            ['an object', () => ({ id: 'a', parent: document.createElement('div') }), '{ id: string, parent: element }'],
            ['null', () => null, 'null'],
            ['the empty list', () => [], 'list<never>'],
            ['a list of nulls alone', () => [null, null], 'list<null>'],
            ['a list holding a null', () => [document.createElement('div'), null], 'list<element?>'],
            ['an object holding a null', () => ({ id: 'a', parent: null }), '{ id: string, parent: null }'],
            ['a list of lists, one of them empty', () => [[1], []], 'list<list<number>>'],
        ])('types %s from the value alone', (_, value, type) => {
            const bindings = DomqlQuery.bindingsOf(domql.query('target', { target: value() }));

            expect(bindings.getType('target').toString()).toBe(type);
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
            const watch = domql.query('{ row = row, title = panel:attribute["title"] }', { row, panel }).watch({ updateStrategy, schedule: 'immediate' });
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
            ['a field', 'panel { a = self:attribute["id"] }', /"name":"a"/g],
            ['a local', 'panel { let k = self:attribute["id"], a = k }', /"name":"k"/g],
        ])('refuses __proto__ as the name of %s a definition declares, as it refuses every name that is no letter followed by letters and digits', (_, text, name) => {
            const definition = JSON.parse(JSON.stringify(domql.query(text).definition).replace(name, '"name":"__proto__"'));
            const error = getError(() => domql.query(definition, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.message).toContain('A name is a letter followed by letters and digits');
        });

        it.each([
            ['a list of items of different types', [1, 'two']],
            ['a list of lists of different item types', [[1], ['two']]],
            ['a list of objects of different fields', [{ id: 'a' }, { key: 'a' }]],
        ])('refuses %s, which no type holds', (_, value) => {
            const error = getError(() => domql.query('target', { target: value }));

            expect(error.kind).toBe('structure');
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

            expect(error).toBeInstanceOf(DomqlError);
            expect(error.kind).toBe('structure');
            expect(error.location).toEqual({ binding: 'target' });
        });

        it('types a binding again from its value in a query of its definition', () => {
            const parsed = domql.query('target { size = self.size }', { target: null });
            const created = domql.query(parsed.definition, { target: document.createElement('div') });

            expect(DomqlQuery.bindingsOf(parsed).getType('target').toString()).toBe('null');
            expect(DomqlQuery.bindingsOf(created).getType('target').toString()).toBe('element');
        });

        it('types a binding that holds a node by its kind', () => {
            const host = document.createElement('div');
            const bindings = DomqlQuery.bindingsOf(domql.query('a.children.count', { a: host, b: document, c: document.createDocumentFragment(), d: host.attachShadow({ mode: 'open' }) }));

            expect(['a', 'b', 'c', 'd'].map(name => bindings.getType(name).toString())).toEqual(['element', 'document', 'documentFragment', 'shadowRoot']);
        });

        it('refuses a binding of a node of another kind, such as text', () => {
            expect(getError(() => domql.query('a', { a: document.createTextNode('a') })).location).toEqual({ binding: 'a' });
        });

        it('treats a root or a reserved literal in another case as an ordinary name', () => {
            expect(() => domql.query('Window { size = self.size }', { Window: 1, Document: 2, Null: 3 })).not.toThrow();
        });

        it('binds data: numbers, strings, Booleans, null, lists and objects', () => {
            const configuration = { modifier: 'shift', steps: [1, 2], wrap: true };

            expect(DomqlQuery.bindingsOf(domql.query('target { size = self.size }', { target: configuration })).get('target')).toBe(configuration);
        });

        it.each([
            ['a root', { document: 1 }],
            ['the window', { window: 1 }],
            ['a name that is no name', { '2panel': 1 }],
            ['a name with a hyphen at its end', { 'panel-': 1 }],
            ['a reserved literal', { null: 1 }],
            ['a function', { panel: () => {} }],
            ['an object that is no plain data', { panel: new Date() }],
            ['a number that is not finite', { panel: Number.POSITIVE_INFINITY }],
        ])('rejects %s', (_, bindings) => {
            expect(getError(() => domql.query('target { size = self.size }', bindings)).kind).toBe('structure');
        });

        it.each([
            ['a list', []],
            ['a map, whose entries are no properties', new Map([['target', 1]])],
        ])('rejects bindings given as %s', (_, bindings) => {
            expect(getError(() => domql.query('target { size = self.size }', bindings)).kind).toBe('structure');
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
            expect(domql.query('window.devicePixelRatio').evaluate({ window: { document, devicePixelRatio: 3 } })).toBe(3);
            expect(domql.query('window.devicePixelRatio').evaluate()).toBe(window.devicePixelRatio);
        });

        it('is made through the cache of parsed texts', () => {
            const text = 'panel.children.count';
            const parse = vi.spyOn(ParsedTexts, 'parse');

            try {
                const query = domql.query(text, { panel });

                expect(parse).toHaveBeenCalledWith(text);
                expect(parse.mock.results[0].value).toBe(query.definition);
            } finally {
                parse.mockRestore();
            }
        });

        it('fails as parsing fails, and refuses bindings that are null', () => {
            expect(getError(() => domql.query('panel {', { panel })).kind).toBe('syntax');
            expect(getError(() => domql.query('window.size', null)).kind).toBe('structure');
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
            expect(domql.query('window.size').resolve().type.toString()).toBe('size');
            expect(getError(() => domql.query('panel.matches(":hover")', { panel }).resolve({ watch: true })).kind).toBe('validation');
            expect(domql.query('panel.matches(":hover")', { panel }).resolve({ watch: true, acceptPartialObservation: true }).kind).toBe('query');
        });
    });

    describe('a request of another kind', () => {
        const subscription = () => domql.query('panel.on("click") { button = self.button }', { panel });

        it('is refused with a validation error by the operation that does not carry it out, saying what the request does and the operations it takes', () => {
            expect(getError(() => subscription().evaluate())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot evaluate 'panel.on(\"click\") { button = self.button }': it listens to events.\nUse subscribe()."), location: { pointer: '/query', line: 1 } });
            expect(getError(() => subscription().watch())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot watch 'panel.on(\"click\") { button = self.button }': it listens to events.\nUse subscribe().") });
            expect(getError(() => domql.query('panel.children.count', { panel }).subscribe(() => {}))).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot subscribe to 'panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") });
        });

        it('is refused by a waiting evaluation, which rejects with the validation error', async () => {
            await expect(subscription().evaluateAsync()).rejects.toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("Cannot evaluate 'panel.on(\"click\") { button = self.button }': it listens to events.") }));
        });

        it('is refused after resolution and before anything needs a window', () => {
            expect(getError(() => subscription().evaluate({ window: null })).kind).toBe('validation');
            expect(getError(() => domql.query('panel.nonsense', { panel }).evaluate({ window: null })).kind).toBe('validation');
        });
    });

    describe('the environment', () => {
        it('is reported when there is no browser window', () => {
            const query = domql.query('window.devicePixelRatio');
            const error = getError(() => query.evaluate({ window: null }));

            expect(error).toBeInstanceOf(DomqlError);
            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain('without a browser window');
            expect(getError(() => query.evaluate({ window: {} })).kind).toBe('evaluation');
        });

        it('leaves parsing and resolving to work without one', () => {
            expect(domql.query('window.size').resolve().type.toString()).toBe('size');
        });
    });

    describe('resolution', () => {
        it('is kept for a query and used by every evaluation of it', () => {
            const query = domql.query('panel.children.count', { panel });

            expect(query.resolve()).toBe(query.resolve());
            expect(query.evaluate()).toBe(3);

            panel.append(document.createElement('i'));

            expect(query.evaluate()).toBe(4);
        });

        it('is made again for other options, and for bindings of other types or other selecting values', () => {
            const query = domql.query('panel?.size', { panel });
            const before = query.resolve();

            expect(query.resolve({ watch: true })).not.toBe(before);
            expect(domql.query('panel?.size', { panel: null }).resolve()).not.toBe(before);
            expect(domql.query('panel.on(type) { button = self.button }', { panel, type: 'click' }).resolve()).not.toBe(domql.query('panel.on(type) { button = self.button }', { panel, type: 'pointerdown' }).resolve());
        });

        it('is shared by the queries of one definition whose bindings have the same types', () => {
            const other = document.createElement('div');

            expect(domql.query('panel.size', { panel: other }).resolve()).toBe(domql.query('panel.size', { panel }).resolve());
        });

        it('evaluates each query that shares it against its own bindings, interleaved, its locals and branches its own', () => {
            const text = 'panel { let id = self:attribute["id"], id = id, kind = if id == "first" then "one" else "other", count = self.children.count }';
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

            expect(getError(() => query.resolve()).kind).toBe('validation');
            expect(getError(() => query.resolve()).kind).toBe('validation');
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

    const module = name => isolated.createModule(name, {
        members: [{ name, function: name, kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
    }, { [name]: () => 7 });

    describe('an observation type that is not shared', () => {
        /** Registers `level`, a member maintained by an observation that is not shared; each observation it starts is recorded, its sample given by `deliver`. */
        const registerLevel = () => {
            const observations = [];

            isolated.registerModule(isolated.createModule('level', {
                observationTypes: [{ name: 'level', contract: 'maintained', shared: false, function: 'observeLevel' }],
                members: [{ name: 'level', function: 'level', kind: 'property', on: 'element', parameters: [], result: 'number?', changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] }],
            }, {
                observeLevel: (request, notify) => {
                    const observation = { sample: { pending: true, value: null }, isStopped: false, deliver: value => {
                        observation.sample = { pending: false, value };
                        notify();
                    } };

                    observations.push(observation);

                    return { stop: () => { observation.isStopped = true; }, sample: () => observation.sample };
                },
                level: (_receiver, _args, _environment, [sample]) => sample,
            }));

            return observations;
        };

        const settle = () => new Promise(resolve => setTimeout(resolve));

        it('gives a wait the sample its observation delivers, from one observation that stops once the wait settles', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const answer = isolated.query('panel.level', { panel }).evaluateAsync();

            await settle();
            observations[0].deliver(7);

            await expect(answer).resolves.toBe(7);
            expect(observations.length).toBe(1);
            expect(observations[0].isStopped).toBe(true);
        });

        it('keeps one observation for a watch across its evaluations, and stops it when the watch ends', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const watch = isolated.query('panel.level', { panel }).watch({ schedule: 'immediate' });

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
            const first = isolated.query('panel.level', { panel }).watch({ schedule: 'immediate' });
            const second = isolated.query('panel.level', { panel }).watch({ schedule: 'immediate' });

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

            const listener = isolated.query('panel.on("input") { level = panel.level }', { panel }).subscribe((_sender, args) => values.push(args.value));

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
        /** Registers `level`, maintained by an observation whose samples `samples` gives, one at each read. */
        const registerLevel = samples => {
            isolated.registerModule(isolated.createModule('level', {
                observationTypes: [{ name: 'level', contract: 'maintained', function: 'observeLevel' }],
                members: [{ name: 'level', function: 'level', kind: 'property', on: 'element', parameters: [], result: 'number?', changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] }],
            }, {
                observeLevel: (_request, notify) => {
                    queueMicrotask(notify);

                    return { stop: () => {}, sample: () => samples.shift() ?? { pending: false, value: 9 } };
                },
                level: (_receiver, _args, _environment, [value]) => value,
            }));
        };

        it('is pending with no value, and has a value once it is not', async () => {
            registerLevel([{ pending: true }]);

            await expect(isolated.query('panel.level', { panel: document.createElement('div') }).evaluateAsync()).resolves.toBe(9);
        });

        it('fails the evaluation, naming its observation type, where it is no { pending, value }', async () => {
            registerLevel([4]);

            await expect(isolated.query('panel.level', { panel: document.createElement('div') }).evaluateAsync()).rejects.toThrow("The observation type 'level' answered the sample 4, which is no { pending, value }");
        });

        it('fails the evaluation where it is not pending and holds no value', async () => {
            registerLevel([{ pending: false }]);

            await expect(isolated.query('panel.level', { panel: document.createElement('div') }).evaluateAsync()).rejects.toThrow('which is no { pending, value } with a value once it is not pending');
        });
    });

    describe('a structure a member answers', () => {
        /** Registers `pair`, a member of elements answering what `answer` gives, and the types it is declared with. */
        const registerPair = (answer, result = 'pair') => {
            isolated.registerModule(isolated.createModule('pair', {
                types: [
                    { name: 'pair', fields: { a: 'number', b: 'number' } },
                    { name: 'span', fields: { from: 'pair', to: 'pair?', marks: 'list<pair>' } },
                    { name: 'link', fields: { value: 'number', next: 'link?' } },
                ],
                members: [{ name: 'pair', function: 'pair', kind: 'property', on: 'element', parameters: [], result, changes: 'constant', reads: 'fresh' }],
            }, { pair: answer }));
        };

        const panel = document.createElement('div');

        it('is copied by its declared fields alone, a field it holds beside them left out', () => {
            registerPair(() => ({ a: 1, b: 2, cache: { rows: [1, 2, 3] } }));

            expect(isolated.query('panel.pair', { panel }).evaluate()).toEqual({ a: 1, b: 2 });
        });

        it('reads its declared fields as an instance of a class offers them, through getters', () => {
            class Pair {
                get a() { return 1; }

                get b() { return 2; }
            }

            registerPair(() => new Pair());

            expect(isolated.query('panel.pair', { panel }).evaluate()).toEqual({ a: 1, b: 2 });
            expect(isolated.query('panel.pair { sum = self.a }', { panel }).evaluate()).toEqual({ sum: 1 });
        });

        it('is copied as its declared shape at every depth, in its fields and in the items of a list', () => {
            registerPair(() => ({ from: { a: 1, b: 2, x: 0 }, to: null, marks: [{ a: 3, b: 4, y: 0 }] }), 'span');

            expect(isolated.query('panel.pair', { panel }).evaluate()).toEqual({ from: { a: 1, b: 2 }, to: null, marks: [{ a: 3, b: 4 }] });
        });

        it('holds its own type as deep as its value goes', () => {
            registerPair(() => ({ value: 1, next: { value: 2, next: null, extra: true } }), 'link');

            expect(isolated.query('panel.pair', { panel }).evaluate()).toEqual({ value: 1, next: { value: 2, next: null } });
        });

        it('still fails where a declared field is missing or of another type', () => {
            registerPair(() => ({ a: 1 }));

            expect(getError(() => isolated.query('panel.pair', { panel }).evaluate()).message).toContain("The member 'pair' answered {\"a\":1}, and it declares pair");
        });
    });

    it('copy an action\'s structured result by its declared fields', async () => {
        isolated.registerModule(isolated.createModule('measure', {
            types: [{ name: 'measurement', fields: { width: 'number' } }],
            members: [{ name: 'measure', function: 'measure', kind: 'action', on: 'element', parameters: [], result: 'measurement', changes: 'unobserved', reads: 'fresh' }],
        }, { measure: async () => ({ width: 5, raw: { internal: true } }) }));

        await expect(isolated.query('panel.measure()', { panel: document.createElement('div') }).executeAsync()).resolves.toEqual({ width: 5 });
    });

    it('name a promise and an instance of a class that a member answers for a type that admits neither', () => {
        class Reading {}

        const constant = (name, implementation) => isolated.createModule(name, {
            members: [{ name, function: name, kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { [name]: implementation });

        isolated.registerModule(constant('reading', () => new Reading()));
        isolated.registerModule(constant('later', () => Promise.resolve(1)));

        const panel = document.createElement('div');

        expect(getError(() => isolated.query('panel.reading', { panel }).evaluate()).message).toContain("The member 'reading' answered an instance of Reading, and it declares number");
        expect(getError(() => isolated.query('panel.later', { panel }).evaluate()).message).toContain("The member 'later' answered a promise, and it declares number");
    });

    it('take the one parameter of an options input as the field of an object', () => {
        isolated.registerModule(isolated.createModule('zoom', {
            members: [{ name: 'zoom', function: 'zoom', kind: 'operation', on: 'element', input: 'options', parameters: [{ name: 'factor', kind: 'value', type: 'number', required: true, fixed: false, nulls: 'propagate' }], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { zoom: (_receiver, args) => args.factor * 2 }));

        const panel = document.createElement('div');

        expect(isolated.query('panel.zoom({ factor = 3 })', { panel }).evaluate()).toBe(6);
        expect(getError(() => isolated.query('panel.zoom(3)', { panel }).resolve()).kind).toBe('validation');
    });

    it('fail inside an item of a list where the failing member is written', () => {
        isolated.registerModule(isolated.createModule('weight', {
            members: [{ name: 'weight', function: 'weight', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, {
            weight: element => {
                if (element.hasAttribute('aria-selected')) {
                    throw new Error('heavy');
                }

                return 1;
            },
        }));
        document.body.innerHTML = '<div id="panel"><div data-key="a1"></div><div data-key="a2" aria-selected="true"></div></div>';

        const error = getError(() => isolated.query('panel.all("[data-key]") {\n    key = self:attribute["data-key"],\n    weight = self.weight\n}', { panel: document.getElementById('panel') }).evaluate());

        expect(error.kind).toBe('evaluation');
        expect(error.location).toEqual({ pointer: '/query/fields/1/value', offset: 77, line: 3, column: 14 });
        document.body.innerHTML = '';
    });

    it('make the members they declare available to the queries resolved afterwards', () => {
        const element = document.createElement('div');

        expect(getError(() => isolated.query('panel.zoom', { panel: element }).resolve()).kind).toBe('validation');

        isolated.registerModule(module('zoom'));

        expect(isolated.query('panel.zoom', { panel: element }).resolve().type.toString()).toBe('number');
    });

    it('replace the resolutions made against the vocabulary before them', () => {
        const query = isolated.query('panel.children.count', { panel: document.createElement('div') });
        const before = query.resolve();

        isolated.registerModule(module('zoom'));

        expect(query.resolve()).not.toBe(before);
    });

    it('are registered once under a name', () => {
        isolated.registerModule(module('zoom'));

        expect(getError(() => isolated.registerModule(module('zoom'))).kind).toBe('module');
    });

    it('leave the registry of another copy of domql alone', () => {
        isolated.registerModule(module('zoom'));

        expect(getError(() => domql.query('panel.zoom', { panel: document.createElement('div') }).resolve()).kind).toBe('validation');
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

        expect(getError(() => domql.query(query))).toMatchObject({ kind: 'structure', message });
        expect(getError(() => domql.query(query, { panel }))).toMatchObject({ kind: 'structure', message });
        expect(getError(() => domql.query(other.query('panel.on("click") { button = self.button }', { panel })))).toMatchObject({ kind: 'structure', message });
    });

    it('reuse a query from its definition and a plain object of bindings, resolved against their own vocabulary', () => {
        other.registerModule(other.createModule('zoom', {
            members: [{ name: 'zoom', function: 'zoom', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { zoom: () => 7 }));

        const count = other.query('panel.children.count', { panel });
        const zoom = other.query('panel.zoom', { panel });

        expect(domql.query(count.definition, { panel }).evaluate()).toBe(2);
        expect(zoom.evaluate()).toBe(7);
        expect(getError(() => domql.query(zoom.definition, { panel }).resolve()).kind).toBe('validation');
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

        // A member kept by an observation whose samples the test supplies, one gauge for each element; one the test marks stuck fails to stop.
        isolated.registerModule(isolated.createModule('level', {
            observationTypes: [{ name: 'level', contract: 'maintained', function: 'observeLevel' }],
            members: [
                {
                    name: 'level', function: 'level', kind: 'property', on: 'element', parameters: [], result: 'number?',
                    changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }],
                },
            ],
        }, {
            observeLevel: ({ target }, notify) => {
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
            level: (_receiver, _args, _environment, [sample]) => sample,
        }));
        isolated.registerModule(isolated.createModule('boom', {
            members: [{ name: 'boom', function: 'boom', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { boom: () => { throw new Error('no'); } }));
    });

    /** Gives the gauge of the element its first or next sample. */
    const sample = (element, value) => {
        const gauge = gauges.get(element);

        gauge.sample = { pending: false, value };
        gauge.notify();
    };

    it('answers what evaluate answers for a query that reads nothing maintained', async () => {
        const query = isolated.query('panel { count = self.children.count, id = self:attribute["id"] }', { panel });

        expect(await query.evaluateAsync()).toEqual(query.evaluate());
        expect(Object.isFrozen(await query.evaluateAsync())).toBe(true);
    });

    it('waits for the first sample of a maintained member, and evaluate does not', async () => {
        const query = isolated.query('item.level', { item: panel.children[0] });
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
        const query = isolated.query('panel.children:[first.level]?.level', { panel, first });
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
        const query = isolated.query('{ a = a.level, b = b.level }', { a: panel.children[0], b: panel.children[1] });
        const evaluation = query.evaluateAsync();

        await settle();
        sample(panel.children[0], 1);
        sample(panel.children[1], 2);

        expect(await evaluation).toEqual({ a: 1, b: 2 });
        expect([...gauges.values()].map(gauge => [gauge.started, gauge.stopped])).toEqual([[1, 1], [1, 1]]);
    });

    it('is canceled by its signal, fails with its reason and lets go of what it started', async () => {
        const controller = new AbortController();
        const evaluation = isolated.query('item.level', { item: panel.children[0] }).evaluateAsync({ signal: controller.signal });
        const failure = evaluation.catch(error => error);

        await settle();
        controller.abort(new Error('not needed'));

        expect((await failure).message).toBe('not needed');
        expect(gauges.get(panel.children[0]).stopped).toBe(1);
    });

    it('fails at once for a signal that is already aborted, starting nothing', async () => {
        const controller = new AbortController();

        controller.abort();

        await expect(isolated.query('item.level', { item: panel.children[0] }).evaluateAsync({ signal: controller.signal })).rejects.toThrow();
        expect(gauges.size).toBe(0);
    });

    it('fails with the error of an evaluation and lets go of what it started', async () => {
        const item = panel.children[0];
        const failure = isolated.query('{ a = item.level, b = item.boom }', { item }).evaluateAsync().catch(error => error);

        await settle();
        sample(item, 1);

        const error = await failure;

        expect(error.name).toBe('DomqlError');
        expect(error.message).toContain("The member 'boom' failed");
        expect(gauges.get(item).stopped).toBe(1);
    });

    it('fails without a browser window', async () => {
        const error = await isolated.query('window.devicePixelRatio').evaluateAsync({ window: null }).catch(failure => failure);

        expect(error.name).toBe('DomqlError');
        expect(error.kind).toBe('evaluation');
    });

    describe('cleanup that fails', () => {
        it('is reported, and keeps the result of an evaluation that succeeded', async () => {
            const [first, second] = panel.children;
            const evaluation = isolated.query('{ a = a.level, b = b.level }', { a: first, b: second }).evaluateAsync();

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
            const failure = isolated.query('{ a = item.level, b = item.boom }', { item }).evaluateAsync().catch(error => error);

            stuck.add(item);
            await settle();
            sample(item, 1);

            expect((await failure).message).toContain("The member 'boom' failed");
            expect(reported.map(error => error.message)).toEqual(['stuck']);
        });

        it("is reported, and leaves a canceled evaluation failing with the signal's reason", async () => {
            const controller = new AbortController();
            const item = panel.children[0];
            const failure = isolated.query('item.level', { item }).evaluateAsync({ signal: controller.signal }).catch(error => error);

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

    /** An action module: its one member, named for it, on an element, carried out by the function. */
    const action = (name, implementation, { parameters = [], result = 'boolean' } = {}) => isolated.createModule(name, {
        members: [{ name, function: name, kind: 'action', on: 'element', ...(parameters.length === 0 ? {} : { input: 'direct' }), parameters, result, changes: 'unobserved', reads: 'fresh' }],
    }, { [name]: implementation });

    const label = [{ name: 'label', kind: 'value', type: 'string', required: true, nulls: 'propagate' }];

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><b id="first"></b></div>';
        panel = document.getElementById('panel');
        reported = [];
        runs = [];
        pending = null;
        window.reportError = error => reported.push(error);

        // Marks its element and answers whether the mark changed.
        isolated.registerModule(action('mark', (element, { label }, _environment, { signal }) => {
            runs.push({ element, label, signal });

            const changed = element.dataset.mark !== label;

            element.dataset.mark = label;

            return changed;
        }, { parameters: label }));

        // Answers a promise the test settles, after marking its element as started.
        isolated.registerModule(action('slow', (element, _args, _environment, { signal }) => {
            element.dataset.state = 'started';
            runs.push({ element, signal });

            return new Promise((resolve, reject) => { pending = { resolve, reject }; });
        }));

        isolated.registerModule(action('pick', element => element.firstElementChild, { result: 'element?' }));
        isolated.registerModule(action('broken', element => {
            element.dataset.state = 'half';

            throw new Error('jammed');
        }));
        isolated.registerModule(action('wrong', () => 'yes'));
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('executes an action once and answers its result', async () => {
        expect(await isolated.query('panel.mark(label)', { panel, label: 'seen' }).executeAsync()).toBe(true);
        expect(await isolated.query('panel.mark("seen")', { panel }).executeAsync()).toBe(false);
        expect(panel.dataset.mark).toBe('seen');
        expect(runs.map(run => run.label)).toEqual(['seen', 'seen']);
    });

    it('waits for a result the action promises, and gives the action a signal even where the caller gave none', async () => {
        const running = isolated.query('panel.slow()', { panel }).executeAsync();

        await Promise.resolve();
        pending.resolve(true);

        expect(await running).toBe(true);
        expect(runs[0].signal).toBeInstanceOf(AbortSignal);
        expect(runs[0].signal.aborted).toBe(false);
    });

    it('shapes the result by the object expression that follows the action, as immutable data', async () => {
        const result = await isolated.query('panel.pick() { id = self:attribute["id"] }', { panel }).executeAsync();

        expect(result).toEqual({ id: 'first' });
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('executes nothing where the receiver is null, and answers null', async () => {
        expect(await isolated.query('item?.mark("seen")', { item: null }).executeAsync()).toBeNull();
        expect(runs).toEqual([]);
    });

    it('rejects a result of another type than the action declares, naming the action', async () => {
        await expect(isolated.query('panel.wrong()', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', message: expect.stringContaining("The action 'wrong' answered \"yes\", and it declares boolean") }));
    });

    it('rejects a failure of the action with what it threw as the cause, and leaves what it changed', async () => {
        const error = await isolated.query('panel.broken()', { panel }).executeAsync().catch(failure => failure);

        expect(error).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The action 'broken' failed: jammed") });
        expect(error.cause.message).toBe('jammed');
        expect(panel.dataset.state).toBe('half');
        expect(reported).toEqual([]);
    });

    it('rejects a failure the action promises, whatever it is', async () => {
        const running = isolated.query('panel.slow()', { panel }).executeAsync().catch(failure => failure);

        await Promise.resolve();
        pending.reject(null);

        const error = await running;

        expect(error).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The action 'slow' failed: null") });
        expect(error.cause).toBeNull();
    });

    it('rejects with the reason of a signal already aborted, and executes nothing', async () => {
        const controller = new AbortController();

        controller.abort(new Error('not now'));

        await expect(isolated.query('panel.mark("seen")', { panel }).executeAsync({ signal: controller.signal })).rejects.toThrow('not now');
        expect(runs).toEqual([]);
    });

    it('rejects at once with the reason of a signal that aborts while the action runs, which learns of it, and discards its result', async () => {
        const controller = new AbortController();
        const running = isolated.query('panel.slow()', { panel }).executeAsync({ signal: controller.signal }).catch(failure => failure);

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
        const running = isolated.query('panel.slow()', { panel }).executeAsync({ signal: controller.signal }).catch(failure => failure);

        await Promise.resolve();
        controller.abort(new Error('stop'));
        await running;
        pending.reject(new Error('late'));
        await new Promise(resolve => setTimeout(resolve));

        expect(reported).toHaveLength(1);
        expect(reported[0]).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The action 'slow' failed: late") });
    });

    it('is refused for a request of another kind, and an action request is refused by the other operations', async () => {
        await expect(isolated.query('panel.children.count', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("Cannot execute 'panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") }));
        expect(getError(() => isolated.query('panel.mark("seen")', { panel }).evaluate())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot evaluate 'panel.mark(\"seen\")': it executes an effect.\nUse executeAsync().") });
        expect(runs).toEqual([]);
    });

    it('rejects where its receiver or arguments cannot be evaluated, and executes nothing', async () => {
        await expect(isolated.query('panel.first("[")?.mark("seen")', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', message: expect.stringContaining("The member 'first' failed") }));
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
        expect(isolated.query('panel?.size', { panel: null }).resolve().type.toString()).toBe('size?');
        expect(isolated.query('panel?.children.count', { panel: null }).resolve().type.toString()).toBe('number?');
    });

    it('answer null for an object expression following a null binding, its fields resolved against no value', () => {
        expect(isolated.query('{ panel = panel { size = self.size, key = self:attribute["data-key"] }, ids = ids }', { panel: null, ids: [] }).evaluate()).toEqual({ panel: null, ids: [] });
        expect(isolated.query('panel { size = self.size }', { panel: null }).resolve().type.toString()).toBe('{ size: size? }?');
    });

    it.each([
        ['a call no declaration has', 'panel?.sise()', 'no member of the vocabulary'],
        ['a name in a form none of its declarations takes', 'panel?.size()', 'is a property'],
        ['an argument none of its declarations takes', 'panel?:attribute[5]', "expects string and finds number"],
        ['a misspelled call in the object expression that follows', 'panel { size = self.sise() }', 'no member of the vocabulary'],
    ])('refuse %s', (_, text, message) => {
        const error = getError(() => isolated.query(text, { panel: null }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain(message);
    });

    it('read a Boolean member of a null binding as null, as any bracket property access of one is', () => {
        expect(isolated.query('panel?.attached', { panel: null }).evaluate()).toBeNull();
        expect(isolated.query('panel?[name]', { panel: null, name: 'size' }).evaluate()).toBeNull();
        expect(isolated.query('row?["id"]', { row: null }).evaluate()).toBeNull();
    });

    it('accept a member of the items of an empty list where a value is tested, any value of the items it has being truthy or falsey', () => {
        const rows = isolated.query('rows { done = not self.complete }', { rows: [] });

        expect(rows.evaluate()).toEqual([]);
        expect(isolated.query(rows.definition, { rows: [{ complete: true }] }).evaluate()).toEqual([{ done: false }]);
        expect(isolated.query(rows.definition, { rows: [{ complete: 'yes' }, { complete: null }] }).evaluate()).toEqual([{ done: false }, { done: true }]);
        expect(isolated.query('not off', { off: null }).evaluate()).toBe(true);
    });

    it('type a member of the items of an empty list as its declarations share it, unchanged, as a list of known items does', () => {
        const panel = document.createElement('div');

        const rows = isolated.query('rows { c = self.children.count }', { rows: [] });

        expect(rows.resolve().type.toString()).toBe('list<{ c: number }>');
        expect(isolated.query(rows.definition, { rows: [panel] }).evaluate()).toEqual([{ c: 0 }]);
        expect(isolated.query('rows { w = self.rect?.width }', { rows: [] }).resolve().type.toString()).toBe('list<{ w: number? }>');
        expect(getError(() => isolated.query('rows { c = self.children.sise }', { rows: [] }).resolve()).message).toContain("'sise' is no member of the vocabulary");
        expect(isolated.query('panel.children { c = self.children.count }', { panel }).resolve().type.toString()).toBe('list<{ c: number }>');
    });

    it('accept any property of data that has not arrived, the empty rows projected to the empty list', () => {
        const rows = isolated.query('rows { id = self.id }', { rows: [] });

        expect(rows.evaluate()).toEqual([]);
        expect(isolated.query(rows.definition, { rows: [{ id: 'a' }] }).evaluate()).toEqual([{ id: 'a' }]);
        expect(isolated.query('row?.id', { row: null }).evaluate()).toBeNull();
        expect(isolated.query('row { id = self.id }', { row: null }).evaluate()).toBeNull();
    });

    it('check a property once the type of its receiver is known, a nullable one included', () => {
        const row = isolated.query('row?.id', { row: null });
        const panel = isolated.query('panel?.sise', { panel: null });

        expect(row.evaluate()).toBeNull();
        expect(getError(() => isolated.query(row.definition, { row: { key: 'a' } }).resolve()).kind).toBe('validation');
        expect(panel.evaluate()).toBeNull();
        expect(getError(() => isolated.query(panel.definition, { panel: document.getElementById('panel') }).resolve()).message).toContain('sise');
        expect(getError(() => isolated.query('panel.parent?.sise', { panel: document.getElementById('panel') }).resolve()).message).toContain('sise');
    });

    it('keep the request kind of the name, so a subscription of a null binding listens to nothing and is refused an evaluation', () => {
        const text = 'panel?.on("click") { button = self.button }';
        const results = [];
        const listener = isolated.query(text, { panel: null }).subscribe((_sender, args) => results.push(args));

        panel.dispatchEvent(new MouseEvent('click'));

        expect(isolated.query(text, { panel: null }).resolve().kind).toBe('subscription');
        expect(results).toEqual([]);
        expect(getError(() => isolated.query(text, { panel: null }).evaluate()).kind).toBe('validation');

        listener.dispose();
    });

    it('apply a behavior of a null binding with nothing started, until an update supplies its receiver', () => {
        const calls = [];

        isolated.registerModule(isolated.createModule('mark', {
            members: [{ name: 'mark', function: 'mark', kind: 'behavior', on: 'element', parameters: [], result: 'boolean', changes: 'unobserved', reads: 'fresh' }],
        }, { mark: element => (calls.push(element), { update: () => {}, dispose: () => calls.push('dispose') }) }));

        const behavior = isolated.query('item?.mark()', { item: null }).apply();

        expect(calls).toEqual([]);

        behavior.update({ item: panel });
        behavior.update({ item: null });

        expect(calls).toEqual([panel, 'dispose']);
    });

    it('commit a behavior of a null binding to the declaration its first receiver selects', () => {
        const behavior = { kind: 'behavior', parameters: [], result: 'boolean', changes: 'unobserved', reads: 'fresh' };
        const start = () => ({ update: () => {}, dispose: () => {} });

        isolated.registerModule(isolated.createModule('mark', {
            members: [{ ...behavior, name: 'mark', function: 'markElement', on: 'element' }, { ...behavior, name: 'mark', function: 'markText', on: 'string' }],
        }, { markElement: start, markText: start }));

        const applied = isolated.query('item?.mark()', { item: null }).apply();

        applied.update({ item: panel });
        applied.update({ item: null });

        const error = getError(() => applied.update({ item: 'text' }));

        expect(error.kind).toBe('validation');
        expect(error.message).toContain('another behavior');
    });

    it('refuse a name whose declarations make requests of different kinds', () => {
        isolated.registerModule(isolated.createModule('ping', {
            members: [{ name: 'ping', function: 'ping', kind: 'action', on: 'element', parameters: [], result: 'boolean', changes: 'unobserved', reads: 'fresh' }],
        }, { ping: () => true }));
        isolated.registerModule(isolated.createModule('radar', {
            types: [{ name: 'radar', fields: { level: 'number' } }],
            members: [{ name: 'ping', function: 'ping', kind: 'operation', on: 'radar', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { ping: () => 1 }));

        const error = getError(() => isolated.query('thing?.ping()', { thing: null }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain('ambiguous');
        expect(isolated.query('thing.ping()', { thing: panel }).resolve().kind).toBe('action');
    });

    it('take the declaration a cast names for a null binding, where the name\'s declarations make requests of different kinds', async () => {
        const pings = [];

        isolated.registerModule(isolated.createModule('ping', {
            members: [{ name: 'ping', function: 'ping', kind: 'action', on: 'element', parameters: [], result: 'boolean', changes: 'unobserved', reads: 'fresh' }],
        }, {
            ping: element => {
                pings.push(element);

                return true;
            },
        }));
        isolated.registerModule(isolated.createModule('radar', {
            types: [{ name: 'radar', fields: { level: 'number' } }],
            members: [{ name: 'ping', function: 'ping', kind: 'operation', on: 'radar', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { ping: () => 1 }));

        const query = isolated.query('(thing as "element")?.ping()', { thing: null });

        expect(query.resolve().kind).toBe('action');
        expect(await query.executeAsync()).toBeNull();
        expect(pings).toEqual([]);
        expect(await query.with({ thing: panel }).executeAsync()).toBe(true);
        expect(pings).toEqual([panel]);
    });

    it('run an operation on the empty list, refusing one that more than one declaration takes', () => {
        isolated.registerModule(isolated.createModule('total', {
            members: [
                { name: 'total', function: 'sum', kind: 'property', on: 'list<number>', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' },
                { name: 'total', function: 'join', kind: 'property', on: 'list<string>', parameters: [], result: 'string', changes: 'constant', reads: 'fresh' },
            ],
        }, { sum: items => items.reduce((sum, item) => sum + item, 0), join: items => items.join('') }));

        expect(isolated.query('ids.count', { ids: [] }).evaluate()).toBe(0);
        expect(isolated.query('ids.first', { ids: [] }).evaluate()).toBeNull();
        expect(isolated.query('ids.total', { ids: [1, 2] }).evaluate()).toBe(3);
        expect(isolated.query('ids.total', { ids: ['a', 'b'] }).evaluate()).toBe('ab');

        const error = getError(() => isolated.query('ids.total', { ids: [] }).resolve());

        expect(error.kind).toBe('validation');
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

    /** A module of one property on elements answering what the function gives, of the result type given. */
    const register = (name, result, read) => isolated.registerModule(isolated.createModule(name, {
        members: [{ name, function: 'read', kind: 'property', on: 'element', parameters: [], result, changes: 'constant', reads: 'fresh' }],
    }, { read }));

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

        register('tally', 'string?', () => (++reads, null));
        register('broken', 'string?', () => { throw new Error('unreadable'); });

        expect(evaluate('panel.tally or "none"')).toBe('none');
        expect(reads).toBe(1);
        expect(evaluate('panel.tally and panel.broken')).toBeNull();
        expect(evaluate('"x" or panel.broken')).toBe('x');

        const error = getError(() => evaluate('panel.tally or panel.broken'));

        expect(error.kind).toBe('evaluation');
        expect(error.message).toContain("The member 'broken' failed: unreadable");
    });

    it('falls back with ?? for null alone, and with or for null and false', () => {
        expect(evaluate('false ?? true')).toBe(false);
        expect(evaluate('false or true')).toBe(true);
        expect(evaluate('none ?? 1', { none: null })).toBe(1);
        expect(evaluate('none or 1', { none: null })).toBe(1);
        expect(evaluate('try "x" to "number" ?? 0')).toBe(0);
    });

    it('leaves an equality as it was, so the text false is no false', () => {
        expect(getError(() => isolated.query('"false" == false').resolve()).kind).toBe('validation');
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

        expect(evaluate(`if ${value} then "then" else "else"`, bindings)).toBe(branch);
        expect(evaluate(`if let v = ${value} then "then" else "else"`, bindings)).toBe(branch);
        expect(evaluate(`if flag then "x" elseif let v = ${value} then "then" else "else"`, { ...bindings, flag: false })).toBe(branch);
    });

    it('filters by the truthiness of a predicate, its function receiving a Boolean', () => {
        expect(evaluate('panel.children.where(self:["data-x"]).count')).toBe(2);
        expect(evaluate('panel.children.where(try self:["data-x"] to "number").count')).toBe(1);

        const received = [];

        isolated.registerModule(isolated.createModule('picks', {
            members: [{ name: 'picks', function: 'picks', kind: 'operation', form: 'call', input: 'direct', on: 'list<T>', result: 'number', changes: 'derived', reads: 'derived', parameters: [{ name: 'expression', kind: 'predicate', type: 'boolean', context: 'item', required: true, nulls: 'accept' }] }],
        }, { picks: (items, { expression }) => items.filter(item => (received.push(expression(item)), expression(item))).length }));

        expect(evaluate('panel.children.picks(self:["data-x"])')).toBe(2);
        expect(received).toEqual([true, true, false]);
    });

    it('refuses a predicate declared of any type but boolean, and one that is no value', () => {
        expect(() => isolated.createModule('picks', {
            members: [{ name: 'picks', function: 'picks', kind: 'operation', form: 'call', input: 'direct', on: 'list<T>', result: 'number', changes: 'derived', reads: 'derived', parameters: [{ name: 'expression', kind: 'predicate', type: 'string', context: 'item', required: true, nulls: 'accept' }] }],
        }, { picks: () => 0 })).toThrow(expect.objectContaining({ message: expect.stringContaining("The predicate parameter 'expression' is of type boolean") }));
        expect(getError(() => isolated.query('panel.children.where(self.on("click"))', { panel }).resolve()).kind).toBe('validation');
    });

    it('keeps a member declared to answer a Boolean to an actual Boolean, wherever it is tested', () => {
        register('flag', 'boolean', () => 'yes');

        for (const text of ['if panel.flag then 1 else 0', 'panel.flag or true', 'not panel.flag', 'panel.children.where(panel.flag).count']) {
            const error = getError(() => evaluate(text));

            expect(error.kind, text).toBe('evaluation');
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

        expect(evaluate('(item.parent as "element") == panel', { item })).toBe(true);
        expect(evaluate('(try item.parent as "element") == panel', { item })).toBe(true);
        expect(evaluate('(panel.root as "document") == document')).toBe(true);
        expect(evaluate('(panel as "node") == panel')).toBe(true);
        expect(evaluate('(try item.parent as "element")?:["id"]', { item })).toBe('panel');
    });

    it.each([
        ['a document', 'panel.root', {}, '/query/left'],
        ['a shadow root', 'inner.parent', { inner: 'shadowed' }, '/query/left'],
    ])('fails a strict cast of %s to an element, naming what it is, and answers null for an attempted one', (kind, target, bindings, pointer) => {
        const bound = bindings.inner === undefined ? {} : { inner: shadowed() };
        const error = getError(() => evaluate(`(${target} as "element") == null`, bound));

        expect(error.kind).toBe('evaluation');
        expect(error.message).toContain(`The cast to element rejected its value: it is ${kind}`);
        expect(error.location.pointer).toBe(pointer);
        expect(evaluate(`(try ${target} as "element") == null`, bound)).toBe(true);
    });

    it('passes null through, strict or attempted', () => {
        expect(evaluate('(item as "element") == null', { item: null })).toBe(true);
        expect(evaluate('(try item as "element") == null', { item: null })).toBe(true);
        expect(evaluate('(panel.first(".none") as "element") == null')).toBe(true);
        expect(evaluate('(panel.parent as "element")?:["id"]')).toBeNull();
    });

    it('evaluates its target once, and leaves a failure of evaluating it an error, a strict cast within it and a value of no declared type among them', () => {
        let reads = 0;

        const register = (name, read) => isolated.registerModule(isolated.createModule(name, {
            members: [{ name, function: 'read', kind: 'property', on: 'element', parameters: [], result: 'node', changes: 'constant', reads: 'fresh' }],
        }, { read }));

        register('reading', () => (reads++, document));
        register('broken', () => { throw new Error('unreadable'); });
        register('bogus', () => 5);

        expect(evaluate('(try panel.reading as "element") == null')).toBe(true);
        expect(reads).toBe(1);

        for (const [text, message] of [
            ['(try panel.broken as "element") == null', "The member 'broken' failed: unreadable"],
            ['(try panel.bogus as "element") == null', "The member 'bogus' answered 5, and it declares node"],
            ['(try (panel.root as "element").parent as "element") == null', 'The cast to element rejected its value: it is a document'],
        ]) {
            const error = getError(() => evaluate(text));

            expect(error.kind, text).toBe('evaluation');
            expect(error.message, text).toContain(message);
        }
    });

    it.each([
        ['a type that is no node', 'try panel as "widget"', "'as' casts to node or one of its kinds"],
        ['a target that can never be of the type', 'try document as "element"', 'A value of document can never be cast to element'],
        ['a target that is no node', 'try 5 as "element"', 'A value of number can never be cast to element'],
    ])('is refused before anything is evaluated for %s, attempted as it is strict', (_, text, message) => {
        const error = getError(() => isolated.query(text, { panel }).resolve());

        expect(error.kind).toBe('validation');
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

    /** A module of a structured type of its own, `celsius`, converted from a text such as "21C" or "21", rejecting any other, and to one such as "21C"; a test can give the conversion from text what it does instead. */
    const registerTemperature = ({ answer = null } = {}) => {
        isolated.registerModule(isolated.createModule('temperature', {
            types: [{ name: 'celsius', fields: { degrees: 'number' } }],
            conversions: [
                { from: 'string', to: 'celsius', function: 'parse' },
                { from: 'celsius', to: 'string', function: 'write' },
            ],
        }, {
            parse: (text, { reject }) => {
                if (answer !== null) {
                    return answer(text, reject);
                }

                if (!/^-?[0-9]+C?$/.test(text)) {
                    reject(`${JSON.stringify(text)} is no temperature`);
                }

                return { degrees: Number(text.replace('C', '')), unit: 'C' };
            },
            write: ({ degrees }) => `${degrees}C`,
        }));
    };

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
            expect(Object.is(evaluate('text to "number"', { text }), number)).toBe(true);
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
            const error = getError(() => evaluate('text to "number"', { text }));

            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain(`The conversion from string to number rejected its value: ${JSON.stringify(text)} is no number`);
        });

        it('refuses a number too large to be finite', () => {
            const error = getError(() => evaluate('"1e999" to "number"'));

            expect(error.kind).toBe('evaluation');
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
            expect(evaluate('number to "string"', { number })).toBe(text);
        });

        it.each([0.1, 1 / 3, 1e21, 1e-7, 123456789.125, Number.MAX_VALUE, Number.MIN_VALUE])('read back as the same number: %d', number => {
            expect(evaluate('number to "string" to "number"', { number })).toBe(number);
        });
    });

    describe('Booleans', () => {
        it('are written true and false', () => {
            expect(evaluate('true to "string"')).toBe('true');
            expect(evaluate('false to "string"')).toBe('false');
        });

        it('are read from true and false alone', () => {
            expect(evaluate('"true" to "boolean"')).toBe(true);
            expect(evaluate('"false" to "boolean"')).toBe(false);

            for (const text of ['TRUE', 'True', '1', '', ' true', 'yes']) {
                const error = getError(() => evaluate('text to "boolean"', { text }));

                expect(error.kind, text).toBe('evaluation');
                expect(error.message).toContain(`${JSON.stringify(text)} is no Boolean, which is written "true" or "false"`);
            }
        });
    });

    describe('null', () => {
        it('answers null for null without converting, nullable where the value is', () => {
            panel.setAttribute('data-count', '3');

            const query = isolated.query('panel:attribute["data-missing"] to "number"', { panel });

            expect(String(query.resolve().type)).toBe('number?');
            expect(query.evaluate()).toBeNull();
            expect(evaluate('panel:attribute["data-count"] to "number"')).toBe(3);
        });

        it('lets ?? say what a missing value means, and leaves a malformed one an error', () => {
            panel.setAttribute('data-count', 'three');

            expect(evaluate('panel:attribute["data-missing"] to "number" ?? 0')).toBe(0);
            expect(getError(() => evaluate('panel:attribute["data-count"] to "number" ?? 0')).kind).toBe('evaluation');
        });

        it('answers null for a null of unknown type once its target is a type it converts to, however many conversions reach that type', () => {
            registerTemperature();
            isolated.registerModule(isolated.createModule('kelvin', {
                types: [{ name: 'kelvin', fields: { degrees: 'number' } }],
                conversions: [{ from: 'kelvin', to: 'number', function: 'degrees' }],
            }, { degrees: ({ degrees }) => degrees }));

            const query = isolated.query('value to "number"', { value: null });

            expect(String(query.resolve().type)).toBe('number?');
            expect(query.evaluate()).toBeNull();
            expect(evaluate('value to "celsius"', { value: null })).toBeNull();
            expect(getError(() => evaluate('value to "element"', { value: null })).kind).toBe('validation');
        });

        it('leaves a nullable value checked by its type without null', () => {
            const error = getError(() => evaluate('panel.closest(".row") to "string"'));

            expect(error.kind).toBe('validation');
            expect(error.message).toContain('No conversion from element to string is declared, and element converts to nothing');
        });
    });

    describe('a value already of the type', () => {
        it('answers itself, whatever conversions a module declares', () => {
            registerTemperature();

            expect(evaluate('5 to "number"')).toBe(5);
            expect(evaluate('"21C" to "string"')).toBe('21C');
            expect(evaluate('("21C" to "celsius") to "celsius"')).toEqual({ degrees: 21 });
        });
    });

    describe('a conversion that is not declared', () => {
        it.each([
            ['a structured type that converts to nothing', 'panel.size to "string"', 'No conversion from size to string is declared, and size converts to nothing'],
            ['a type reached only through another', '5 to "boolean"', 'No conversion from number to boolean is declared, and number converts to string'],
            ['a list', 'panel.children to "string"', 'No conversion from list<element> to string is declared'],
            ['a node, which a cast narrows', '"a" to "element"', "a node is narrowed to one of its kinds with 'as'"],
            ['a type no module declares', '"a" to "nope"', "and 'nope' is none of them"],
            ['a list type', '"a" to "list<number>"', "and 'list<number>' is none of them"],
            ['a nullable type', '"a" to "number?"', "and 'number?' is none of them"],
            ['a structured type that holds an element', '"a" to "pointerEvent"', "and 'pointerEvent' is none of them"],
            ['an event source', 'panel.on("click") to "string"', "What 'to' converts is a value, and this one is an event source"],
        ])('is refused before anything is evaluated for %s', (_, text, message) => {
            const error = getError(() => isolated.query(text, { panel }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
        });
    });

    describe('an attempted conversion', () => {
        it('answers the converted value, whatever it is, and null where the conversion rejects it', () => {
            expect(evaluate('try "42" to "number"')).toBe(42);
            expect(evaluate('try "0" to "number"')).toBe(0);
            expect(evaluate('try "false" to "boolean"')).toBe(false);
            expect(evaluate('try "hello" to "number"')).toBeNull();
            expect(evaluate('try "1e999" to "number"')).toBeNull();
            expect(evaluate('try "TRUE" to "boolean"')).toBeNull();
            expect(evaluate('try "hello" to "number" ?? 0')).toBe(0);
            expect(String(isolated.query('try "42" to "number"', { panel }).resolve().type)).toBe('number?');
            expect(String(isolated.query('try "42" to "number" ?? 0', { panel }).resolve().type)).toBe('number');
        });

        it('answers null for null, and a value already of the type as it is', () => {
            expect(evaluate('try value to "number"', { value: null })).toBeNull();
            expect(evaluate('try 5 to "number"')).toBe(5);
            expect(evaluate('try panel:["data-missing"] to "number"')).toBeNull();
        });

        it.each([
            ['a target no type has', 'try "a" to "nope"', "and 'nope' is none of them"],
            ['a pair no conversion is declared for', 'try 5 to "boolean"', 'No conversion from number to boolean is declared'],
            ['a nullable value whose type has no conversion', 'try panel.closest(".row") to "string"', 'No conversion from element to string is declared'],
            ['a null whose target is no type of data', 'try value to "element"', "a node is narrowed to one of its kinds with 'as'"],
            ['an event source', 'try panel.on("click") to "string"', "What 'to' converts is a value, and this one is an event source"],
        ])('is refused before anything is evaluated for %s, as an ordinary conversion is', (_, text, message) => {
            const error = getError(() => isolated.query(text, { panel, value: null }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
        });

        it('attempts a conversion a module declares, answering null for a value it rejects', () => {
            registerTemperature();

            expect(evaluate('try "21C" to "celsius"')).toEqual({ degrees: 21 });
            expect(evaluate('try "warm" to "celsius"')).toBeNull();
        });

        it.each([
            ['throws', () => { throw new Error('the table of units is missing'); }, 'failed: the table of units is missing'],
            ['answers a value not of its type', () => '21', 'answered'],
            ['answers null for a value that is not null', () => null, 'answered null, and it converts to celsius'],
            ['rejects with a reason that is no string', (text, reject) => reject(42), 'rejected its value with a reason that is no string'],
            ['catches its rejection and answers a value', (text, reject) => {
                try {
                    reject('no');
                } catch {
                    // A conversion that outlives its rejection has a fault.
                }

                return { degrees: 1 };
            }, 'rejected its value and then answered one'],
        ])('leaves a fault an error, attempted or not, where the conversion %s', (_, answer, message) => {
            registerTemperature({ answer });

            for (const text of ['"21C" to "celsius"', 'try "21C" to "celsius"']) {
                const error = getError(() => evaluate(text));

                expect(error.kind, text).toBe('evaluation');
                expect(error.message, text).toContain(`The conversion from string to celsius ${message}`);
            }
        });

        it('leaves a failure of evaluating its value an error, a rejection of a conversion within that value among them, since it attempts its own conversion alone', () => {
            isolated.registerModule(isolated.createModule('broken', {
                members: [{ name: 'broken', function: 'read', kind: 'property', on: 'element', parameters: [], result: 'string', changes: 'constant', reads: 'fresh' }],
            }, { read: () => { throw new Error('unreadable'); } }));

            const failed = getError(() => evaluate('try panel.broken to "number"'));

            expect(failed.kind).toBe('evaluation');
            expect(failed.message).toContain("The member 'broken' failed: unreadable");

            const rejected = getError(() => evaluate('try ("abc" to "number") to "string"'));

            expect(rejected.kind).toBe('evaluation');
            expect(rejected.message).toContain('The conversion from string to number rejected its value');
            expect(evaluate('try ("12" to "number") to "string"')).toBe('12');
        });

        it('evaluates its value once and carries its conversion out once', () => {
            let reads = 0;
            let conversions = 0;

            registerTemperature({ answer: text => (conversions++, { degrees: Number(text.replace('C', '')) }) });
            isolated.registerModule(isolated.createModule('reading', {
                members: [{ name: 'reading', function: 'read', kind: 'property', on: 'element', parameters: [], result: 'string', changes: 'constant', reads: 'fresh' }],
            }, { read: () => `${++reads}C` }));

            expect(evaluate('try panel.reading to "celsius"')).toEqual({ degrees: 1 });
            expect([reads, conversions]).toEqual([1, 1]);
            expect(evaluate('if let reading = try panel.reading to "celsius" then reading.degrees else null')).toBe(2);
            expect([reads, conversions]).toEqual([2, 2]);
        });
    });

    describe('a conditional binding', () => {
        it('takes its consequent for a truthy value, 0, empty text and an empty list among them, with the name bound to it, and its alternative for null and false', () => {
            panel.setAttribute('data-count', '12');
            panel.setAttribute('data-zero', '0');
            panel.setAttribute('data-bad', 'twelve');

            expect(evaluate('if let n = try panel:["data-count"] to "number" then n else -1')).toBe(12);
            expect(evaluate('if let n = try panel:["data-zero"] to "number" then n else -1')).toBe(0);
            expect(evaluate('if let n = try panel:["data-bad"] to "number" then n else -1')).toBe(-1);
            expect(evaluate('if let s = "" then s else "none"')).toBe('');
            expect(evaluate('if let items = list then items.count else -1', { list: [] })).toBe(0);
            expect(evaluate('if let key = panel:["data-missing"] then key else "unknown"')).toBe('unknown');
            expect(evaluate('if let b = false then b else true')).toBe(true);
            expect(evaluate('if let b = on then "on" else "off"', { on: false })).toBe('off');
            expect(evaluate('if let b = panel.attached then "attached" else "detached"')).toBe('attached');
            expect(evaluate('if let b = panel.first(".none")?.attached then "attached" else "none"')).toBe('none');
        });

        it('binds the value without null, and binds a value that cannot be null as well, which always takes its consequent', () => {
            expect(String(isolated.query('if let key = panel:["data-key"] then key else "unknown"', { panel }).resolve().type)).toBe('string');
            expect(evaluate('if let node = panel then node:["id"] else null')).toBe('panel');
            expect(evaluate('if let a = null then a else 1')).toBe(1);
        });

        it('sees its name in its consequent alone, nested expressions within it included, never in its value, its alternative or a later clause', () => {
            const messageOf = text => getError(() => isolated.query(text, { panel }).resolve()).message;

            expect(evaluate('if let id = panel:["id"] then panel { mine = id, upper = { id = id } } else null')).toEqual({ mine: 'panel', upper: { id: 'panel' } });
            expect(getError(() => isolated.query('if let k = k then 1 else 2', { panel })).message).toContain("'k' is used before the local of that name is declared in its scope");
            expect(messageOf('if let k = panel:["id"] then 1 else k')).toContain("No local in scope or binding is named 'k'");
            expect(messageOf('if let k = panel:["x"] then 1 elseif k == "a" then 2 else 3')).toContain("No local in scope or binding is named 'k'");
            expect(evaluate('if let k = panel:["x"] then k elseif let id = panel:["id"] then id else "none"')).toBe('panel');
        });

        it('evaluates its value once, and refuses a value that is no value', () => {
            let reads = 0;

            isolated.registerModule(isolated.createModule('reading', {
                members: [{ name: 'reading', function: 'read', kind: 'property', on: 'element', parameters: [], result: 'string?', changes: 'constant', reads: 'fresh' }],
            }, { read: () => `${++reads}` }));

            expect(evaluate('if let r = panel.reading then { a = r, b = r } else null')).toEqual({ a: '1', b: '1' });
            expect(reads).toBe(1);
            expect(getError(() => isolated.query('if let e = panel.on("click") then 1 else 2', { panel }).resolve()).message).toContain("What 'if let' binds is a value, and this one is an event source");
        });
    });

    describe('a conversion a module declares', () => {
        it('converts to and from a structured type of its own, its result taken by the type\'s declared fields', () => {
            registerTemperature();
            panel.setAttribute('data-temperature', '21C');

            expect(evaluate('panel:attribute["data-temperature"] to "celsius"')).toEqual({ degrees: 21 });
            expect(evaluate('(panel:attribute["data-temperature"] to "celsius")?.degrees')).toBe(21);
            expect(evaluate('panel:attribute["data-temperature"] to "celsius" to "string"')).toBe('21C');
        });

        it('takes one conversion, never a chain of them, so a value reaches a type through another only where the query writes both', () => {
            registerTemperature();

            expect(getError(() => evaluate('5 to "celsius"')).message).toContain('No conversion from number to celsius is declared');
            expect(evaluate('5 to "string" to "celsius"')).toEqual({ degrees: 5 });
        });

        it('fails with an evaluation error where it rejects its value, giving the reason', () => {
            registerTemperature();

            const error = getError(() => evaluate('"warm" to "celsius"'));

            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain('The conversion from string to celsius rejected its value: "warm" is no temperature');
        });

        it('fails with an evaluation error where it throws, a fault, with what it threw as the cause', () => {
            const fault = new Error('the table of units is missing');

            registerTemperature({ answer: () => { throw fault; } });

            const error = getError(() => evaluate('"21C" to "celsius"'));

            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain('The conversion from string to celsius failed: the table of units is missing');
            expect(error.cause).toBe(fault);
        });

        it.each([
            ['a value of another type', () => '21'],
            ['null', () => null],
            ['a structure missing a field', () => ({})],
        ])('fails with an evaluation error where it answers %s', (_, answer) => {
            registerTemperature({ answer });

            const error = getError(() => evaluate('"21C" to "celsius"'));

            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain('The conversion from string to celsius answered');
            expect(error.message).toContain('and it converts to celsius');
        });

        it('evaluates the value it converts once', () => {
            let reads = 0;

            registerTemperature();
            isolated.registerModule(isolated.createModule('reading', {
                members: [{ name: 'reading', function: 'read', kind: 'property', on: 'element', parameters: [], result: 'string', changes: 'constant', reads: 'fresh' }],
            }, { read: () => `${++reads}C` }));

            expect(evaluate('panel.reading to "celsius"')).toEqual({ degrees: 1 });
            expect(reads).toBe(1);
        });
    });
});

describe('domql conditions', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let isolated;
    let panel;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-key="k1"></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => isolated.query(text, { panel, ...bindings }).evaluate();

    /** A module of a condition on elements, named for it, and of conditions on a view type of its own, one partly observable, one whose function the test supplies. */
    const registerLit = ({ glow = view => view.on } = {}) => {
        isolated.registerModule(isolated.createModule('lit', {
            types: [{ name: 'litView', fields: { on: 'boolean' } }],
            members: [{ name: 'lit', function: 'view', kind: 'property', on: 'element', parameters: [], result: 'litView', changes: 'constant', reads: 'fresh' }],
            conditions: [
                { name: 'lit', function: 'isLit', on: 'element', changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-lit'] }] },
                { name: 'glowing', function: 'isGlowing', on: 'litView', changes: 'partly-observable', misses: 'a glow its source sets alone', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: true }] },
                { name: 'steady', function: 'isSteady', on: 'litView', changes: 'constant', reads: 'fresh' },
            ],
        }, { view: () => ({ on: true }), isLit: element => element.hasAttribute('data-lit'), isGlowing: glow, isSteady: () => true }));
    };

    it('tests the condition of its name the receiver has, through that condition\'s function, and answers a Boolean', () => {
        registerLit();
        panel.setAttribute('data-lit', '');

        expect(evaluate('panel.is("lit")')).toBe(true);
        expect(evaluate('panel.lit.is("glowing")')).toBe(true);
        expect(evaluate('panel.is("lit") and panel.lit.is("steady")')).toBe(true);
        expect(String(isolated.query('panel.is("lit")', { panel }).resolve().type)).toBe('boolean');
    });

    it('takes a name fixed when the query is prepared, a literal, a bound parameter or a local holding one, so the condition it selects is known', () => {
        registerLit();

        expect(evaluate('panel.is(name)', { name: 'lit' })).toBe(false);
        expect(evaluate('panel { let name = "lit", lit = self.is(name) }')).toEqual({ lit: false });

        const error = getError(() => isolated.query('panel.is(panel:["data-state"])', { panel }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain("The argument 'name' of 'is' selects from the vocabulary, so it is a string the query's preparation settles, from literals and bound parameters, never null");
    });

    it('takes a name an and and an or settle from a bound parameter, as they settle it everywhere, and refuses the one they settle to where no condition has it', () => {
        registerLit();

        expect(evaluate('panel.is(on and "lit" or "dim")', { on: true })).toBe(false);
        expect(getError(() => isolated.query('panel.is(on and "lit" or "dim")', { panel, on: false }).resolve()).message).toContain("'dim' is no condition 'is' asks");
    });

    it('refuses a name no condition has, and a condition of other receivers, naming the condition and the receiver, and those the vocabulary or the receiver has', () => {
        registerLit();

        const messageOf = text => getError(() => isolated.query(text, { panel }).resolve()).message;

        expect(messageOf('panel.is("dim")')).toContain("'dim' is no condition 'is' asks; it asks disabled, readonly, text-editable, hover, popover-open, checked, visible, lit, glowing, steady");
        expect(messageOf('panel.is("glowing")')).toContain("'glowing' is a condition of litView, not of element, whose conditions 'is' asks are disabled, readonly, text-editable, hover, popover-open, checked, lit");
        expect(messageOf('window.is("lit")')).toContain("'lit' is a condition of element, not of window, which has no condition 'is' asks");
    });

    it('skips its argument and its condition for a null receiver read with ?., after checking its name as any call is checked', () => {
        let tests = 0;

        registerLit({ glow: () => { tests++; return true; } });

        expect(evaluate('missing?.is("glowing")', { missing: null })).toBeNull();
        expect(evaluate('panel.lit?.is("glowing")')).toBe(true);
        expect(tests).toBe(1);
        expect(getError(() => evaluate('missing?.is("dim")', { missing: null })).message).toContain("'dim' is no condition 'is' asks");
    });

    it.each([
        ['through . on a receiver that can be null, giving the form with ?.', 'panel.first(".none").is("lit")', "write 'panel.first(\".none\")?.is(\"lit\")'"],
        ['without its name', 'panel.is()', "'is' requires the argument 'name'"],
        ['with a name that is no string', 'panel.is(5)', "The argument 'name' of 'is' expects string and finds number"],
    ])('is refused as any call is %s', (_, text, message) => {
        registerLit();

        const error = getError(() => isolated.query(text, { panel }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain(message);
    });

    it('gives each condition its own contract, so a partly observable one leaves the others as they are', () => {
        registerLit();

        expect(() => isolated.query('{ lit = panel.is("lit"), steady = panel.lit.is("steady") }', { panel }).resolve({ watch: true })).not.toThrow();

        const error = getError(() => isolated.query('{ lit = panel.is("lit"), glowing = panel.lit.is("glowing") }', { panel }).resolve({ watch: true }));

        expect(error.message).toContain(`A watch over 'is("glowing")' (which misses a glow its source sets alone) is refused unless the watch accepts partial observation`);
        expect(error.location.pointer).toBe('/query/fields/1/value');
        expect(() => isolated.query('panel.lit.is("glowing")', { panel }).resolve({ watch: true, acceptPartialObservation: true })).not.toThrow();
    });

    it.each([
        ['throws', () => { throw new Error('the lamp is gone'); }, "The condition 'glowing' that 'is' selects, declared by the module 'lit', failed: the lamp is gone"],
        ['answers what is no Boolean', () => 'yes', "The condition 'glowing' that 'is' selects, declared by the module 'lit', answered \"yes\", and a condition answers boolean"],
    ])('fails with an evaluation error naming the condition, the call and its module where its function %s', (_, glow, message) => {
        registerLit({ glow });

        const error = getError(() => evaluate('panel.lit.is("glowing")'));

        expect(error.kind).toBe('evaluation');
        expect(error.message).toContain(message);
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

        expect(evaluate('e.aria.is("checked")')).toBe(answer);
        expect(evaluate('e.aria.is("disabled")')).toBe(answer);
    });

    it('reads the element\'s own attribute, never an ancestor\'s, and keeps mixed for the attribute itself', () => {
        document.getElementById('parent').setAttribute('aria-disabled', 'true');
        element.setAttribute('aria-checked', 'mixed');

        expect(evaluate('e.aria.is("disabled")')).toBe(false);
        expect(evaluate('e:["aria-checked"] == "mixed"')).toBe(true);
    });

    it('stands apart from the native condition of the same name, each falling back on nothing of the other', () => {
        element.checked = true;

        expect(evaluate('{ native = e.is("checked"), aria = e.aria.is("checked"), either = e.is("checked") or e.aria.is("checked") }')).toEqual({ native: true, aria: false, either: true });

        element.checked = false;
        element.setAttribute('aria-checked', 'true');

        expect(evaluate('{ native = e.is("checked"), aria = e.aria.is("checked") }')).toEqual({ native: false, aria: true });
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

        expect(evaluate('{ short = e.aria:["checked"], named = e.aria:attribute["checked"], full = e:attribute["aria-checked"] }')).toEqual({ short: answer, named: answer, full: answer });
        expect(evaluate('e.aria:["checked"] == e:["aria-checked"]')).toBe(true);
    });

    it.each([
        ['an item that is null', null, undefined, false],
        ['an item without the attribute', 'element', undefined, false],
        ['an item whose attribute is false', 'element', 'false', false],
        ['an item whose attribute is true', 'element', 'true', true],
    ])('compares an optional ARIA read of %s with a string, skipping the indexer for null', (_, item, value, answer) => {
        if (value !== undefined) {
            element.setAttribute('aria-selected', value);
        }

        expect(domql.query('item?.aria:["selected"] == "true"', { item: item === null ? null : element }).evaluate()).toBe(answer);
        expect(domql.query('{ read = item?.aria:["selected"] }', { item: item === null ? null : element }).evaluate()).toEqual({ read: item === null ? null : value ?? null });
    });

    it('reads the attribute a dynamic key names, as the attribute indexer does, a null key answering null', () => {
        element.setAttribute('aria-expanded', 'false');
        element.setAttribute('data-key', 'expanded');

        expect(domql.query('e.aria:[key]', { e: element, key: 'expanded' }).evaluate()).toBe('false');
        expect(evaluate('e.aria:[e:["data-key"]]')).toBe('false');
        expect(domql.query('e.aria:[key]', { e: element, key: null }).evaluate()).toBeNull();
        expect(domql.query('e.aria:[key]', { e: element, key: 'expanded' }).resolve().type.toString()).toBe('string?');
    });

    it.each([
        ['the view itself as a result, which is no data', 'e.aria', 'The result would hold aria, which is no data'],
        ['a native condition the view has not', 'e.aria.is("hover")', "'hover' is a condition of element, not of aria, whose conditions 'is' asks are disabled, checked"],
        ['an ARIA condition nothing declares', 'e.aria.is("expanded")', "'expanded' is no condition 'is' asks"],
    ])('refuses %s', (_, text, message) => {
        const error = getError(() => domql.query(text, { e: element }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain(message);
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

        expect(evaluate('counter:["data-count"] to "number" ?? 0', { counter })).toBe(4);
        expect(evaluate('(counter:["data-count"] to "number" ?? 0) + 1 == 5', { counter })).toBe(true);
        expect(evaluate('(a + b) to "string"', { a: 1, b: 3 })).toBe('4');
        expect(evaluate('-x to "number"', { x: '4' })).toBe(-4);
        expect(evaluate('(-n) to "string"', { n: 4 })).toBe('-4');
        expect(evaluate('(try x to "number" ?? 0) + 1', { x: 'four' })).toBe(1);
    });

    it('folds a negation of a numeric literal into the literal, negative zero kept, and of anything else into a negation, as the tree reads it', () => {
        const queryOf = text => domql.query(text).definition.query;

        expect(Object.is(queryOf('-0').value, -0)).toBe(true);
        expect(queryOf('- 1.5e2')).toEqual({ kind: 'literal', value: -150 });
        expect(queryOf('-x')).toEqual({ kind: 'negate', operand: { kind: 'parameter', name: 'x' } });
        expect(queryOf('-5 to "string"')).toEqual({ kind: 'negate', operand: { kind: 'conversion', type: 'string', target: { kind: 'literal', value: 5 } } });
        expect(queryOf('(-5) to "string"')).toEqual({ kind: 'conversion', type: 'string', target: { kind: 'literal', value: -5 } });
        expect(queryOf('panel.client-size')).toEqual({ kind: 'arithmetic', operator: '-', left: { kind: 'member', target: { kind: 'parameter', name: 'panel' }, name: 'client' }, right: { kind: 'parameter', name: 'size' } });
    });

    it.each([
        ['an attempt as an operand, which can be null', 'try x to "number" + 1', { x: '4' }, "The left operand of '+' can be null"],
        ['a conversion of text that can be missing', 'panel:["data-n"] to "number" + 1', { panel: document.body }, "The left operand of '+' can be null"],
        ['a string', '"a" + 1', {}, "The left operand of '+' is a number, and this one is string"],
        ['a Boolean', 'x * true', { x: 2 }, "The right operand of '*' is a number, and this one is boolean"],
        ['a negation of text, which a conversion of the negated value would have made a number', '-5 to "string"', {}, "What '-' negates is a number, and this one is string"],
        ['an event source', 'panel.on("click") + 1', { panel: document.body }, "The left operand of '+' is a value, and this one is an event source"],
    ])('refuses %s, before anything is evaluated', (_, text, bindings, message) => {
        const error = getError(() => domql.query(text, bindings).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain(message);
    });

    it.each([
        ['a division by zero', 'x / 0', "'/' divides by zero", 3],
        ['a remainder of a division by zero', 'x % y', "'%' divides by zero", 3],
        ['a result no finite number holds', 'x * 1e308 * 10', "The result of '*' is no finite number", 1],
    ])('fails %s at its operator\'s operation, naming where', (_, text, message, column) => {
        const error = errorOf(text, { x: 4, y: 0 });

        expect(error.kind).toBe('evaluation');
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
        expect(domql.format('(-5) to "string"')).toBe('(-5) to "string"');
        expect(domql.format('-5 to "string"')).toBe('-5 to "string"');
        expect(domql.format('(-0) { a = 1 }')).toBe('(-0) { a = 1 }');
        expect(domql.format('a * -2')).toBe('a * -2');
        expect(domql.format('-2 * 3')).toBe('-2 * 3');
    });

    it.each([
        ['written with no spaces', 'panel { w = self.client-size }', "'client' is no member of the vocabulary. Did you mean 'self.clientSize'?"],
        ['written with spaces, which may be a subtraction', 'panel { w = self.client - size }', "'client' is no member of the vocabulary. Did you mean 'self.clientSize'?"],
        ['spelled otherwise than the member', 'panel.client-SIZE', "'client' is no member of the vocabulary. Did you mean 'panel.clientSize'?"],
        ['subtracting a local', 'panel { let size = 1, w = self.client-size }', "Did you mean 'self.clientSize'?"],
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
        const error = getError(() => domql.query({ version: 22, query: { kind: 'arithmetic', operator: '^', left: { kind: 'literal', value: 2 }, right: { kind: 'literal', value: 3 } } }));

        expect(error.kind).toBe('structure');
        expect(error.location.pointer).toBe('/query/operator');
        expect(domql.query({ version: 22, query: { kind: 'negate', operand: { kind: 'literal', value: 2 } } }).evaluate()).toBe(-2);
    });
});

describe('domql interpolated strings', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const queryOf = text => domql.query(text).definition.query;

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
        expect(evaluate('$"line\nbreak\tand é 😀"')).toBe('line\nbreak\tand é 😀');
        expect(evaluate('$"{{{name}}}"', { name: 'Eyal' })).toBe('{Eyal}');
        expect(evaluate('$"\\u{7B}{name}\\u{7D}"', { name: 'Eyal' })).toBe('{Eyal}');
        expect(evaluate('$"{name}"', { name: '{x}' })).toBe('{x}');
        expect(evaluate('"Use {name}"')).toBe('Use {name}');
    });

    it('holds any expression in a hole, with its own strings, braces, comments and interpolated strings', () => {
        expect(evaluate('$"{a ?? "Unknown"}"', { a: null })).toBe('Unknown');
        expect(evaluate('$"<{$"{a}!"}>"', { a: 'x' })).toBe('<x!>');
        expect(evaluate('$"{ { x = 1 }.x}"')).toBe('1');
        expect(evaluate('$"{a /* } */ ?? "}"}"', { a: null })).toBe('}');
        expect(evaluate('$"{if a then "yes" else "no"} {n + 1}"', { a: true, n: 1 })).toBe('yes 2');
        expect(evaluate('$"{a to "string"}"', { a: false })).toBe('false');
    });

    it('reads its holes in the scope it is written in, with the current value there', () => {
        const panel = document.createElement('div');

        panel.setAttribute('data-name', 'Tools');
        panel.append(document.createElement('i'), document.createElement('i'));

        expect(evaluate('panel { label = $"{self:["data-name"] ?? "Unknown"} ({self.children.count})" }', { panel })).toEqual({ label: 'Tools (2)' });
        expect(evaluate('{ let n = 2, text = $"{n}{n}" }')).toEqual({ text: '22' });
    });

    it.each([
        ['a space between its $ and its quote', '$ "a"', "An interpolated string starts with '$\"', with no space between them", 1],
        ['a hole with no expression', '$"a {  } b"', "An interpolation holds an expression between '{' and '}'", 5],
        ['a lone closing brace in its text', '$"a } b"', "A literal '}' in an interpolated string is written '}}'", 5],
        ['a hole never closed', '$"a {b', "Expected '}' closing the interpolation", 7],
        ['a hole the closing quote of its string ends', '$"a {b"', "A string is never closed: an interpolation is closed with '}' before its string's closing quote", 7],
        ['a string never closed', '$"a {b} c', 'An interpolated string is never closed', 1],
        ['an escape the language has none of', '$"a \\{ b"', 'A string escapes only', 5],
        ['two expressions in a hole', '$"{a b}"', "A member follows its receiver after a dot", 6],
        ['a dollar sign before no quote', 'a $ b', "Unexpected '$'", 3],
    ])('refuses %s, at the text that is refused', (_, text, message, column) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column });
    });

    it.each([
        ['a Boolean, whose text to "string" gives', '$"{a}"', { a: true }, "An interpolation inserts a string or a number, and this one is boolean; give its text with … to \"string\", or choose it with a conditional", '/query/parts/0/expression'],
        ['a value that can be null', '$"x{a}"', { a: null }, 'An interpolation can be null: give it a fallback, as in (… ?? "…"), or test it first', '/query/parts/1/expression'],
        ['an attribute, which can be missing', '$"{panel:["id"]}"', { panel: document.body }, 'An interpolation can be null', '/query/parts/0/expression'],
        ['a list', '$"{panel.children}"', { panel: document.body }, 'An interpolation inserts a string or a number, and this one is list<element>', '/query/parts/0/expression'],
        ['an event source', '$"{panel.on("click")}"', { panel: document.body }, 'An interpolation is a value, and this one is an event source', '/query/parts/0/expression'],
    ])('refuses to insert %s before anything is evaluated, naming the hole', (_, text, bindings, message, pointer) => {
        const error = getError(() => domql.query(text, bindings).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain(message);
        expect(error.location.pointer).toBe(pointer);
    });

    it('is no member written after a space, nor a fixed argument or the name of a bracket property access', () => {
        expect(getError(() => domql.query('panel matches $"x"')).message).toContain("write 'panel.matches(…)'");
        expect(getError(() => domql.query('panel[$"rect"]', { panel: document.body }).resolve()).message).toContain('A bracket property access reads a name determined when the query is prepared');
        expect(getError(() => domql.query('panel.is($"disabled")', { panel: document.body }).resolve()).kind).toBe('validation');
    });

    it('stands as a cast\'s target as a string literal does, what its holes hold never read as the group\'s own', () => {
        expect(domql.query('(?($"{a ?? "b"}" as "element").rect)').definition.query.kind).toBe('optionalChain');
        expect(getError(() => domql.query('($"{a ?? "b"}" as "element")', { a: 'x' }).resolve()).kind).toBe('validation');
        expect(getError(() => domql.query('(?($"{a as "element"}").rect)'))).toMatchObject({ message: expect.stringContaining('A group as the receiver of an optional enclosed access holds a cast'), location: { line: 1, column: 23 } });
    });

    it('records its text and its interpolations in order, each run of text the characters it stands for', () => {
        expect(queryOf('$"Found {n} items, \\"{{x}}\\""')).toEqual({ kind: 'interpolatedString', parts: [{ kind: 'text', value: 'Found ' }, { kind: 'expression', expression: { kind: 'parameter', name: 'n' } }, { kind: 'text', value: ' items, "{x}"' }] });
        expect(queryOf('$""')).toEqual({ kind: 'interpolatedString', parts: [] });
        expect(queryOf('$"Hello"')).toEqual({ kind: 'interpolatedString', parts: [{ kind: 'text', value: 'Hello' }] });
    });

    it('joins a definition\'s adjacent text and drops its empty text, leaving the caller\'s definition as it is', () => {
        const query = { kind: 'interpolatedString', parts: [{ kind: 'text', value: 'a' }, { kind: 'text', value: '' }, { kind: 'text', value: 'b' }, { kind: 'expression', expression: { kind: 'literal', value: 1 } }, { kind: 'text', value: '' }] };
        const definition = domql.query({ version: 22, query }).definition;

        expect(definition.query.parts).toEqual([{ kind: 'text', value: 'ab' }, { kind: 'expression', expression: { kind: 'literal', value: 1 } }]);
        expect(query.parts).toHaveLength(5);
        expect(domql.query({ version: 22, query }).evaluate()).toBe('ab1');
    });

    it('names a part of a definition by the index its caller gave it, however validation joined and dropped the text before it', () => {
        const hole = expression => ({ kind: 'expression', expression });
        const inner = { kind: 'interpolatedString', parts: [{ kind: 'text', value: '' }, { kind: 'text', value: '' }, hole({ kind: 'parameter', name: 'flag' })] };
        const query = { kind: 'interpolatedString', parts: [{ kind: 'text', value: 'a' }, { kind: 'text', value: '' }, { kind: 'text', value: 'b' }, hole({ kind: 'parameter', name: 'flag' }), { kind: 'text', value: '' }, hole(inner)] };
        const error = getError(() => domql.query({ version: 22, query }, { flag: true }).resolve());

        expect(error.message).toContain('An interpolation inserts a string or a number, and this one is boolean');
        expect(error.location.pointer).toBe('/query/parts/3/expression');

        const nested = { kind: 'interpolatedString', parts: [{ kind: 'text', value: '' }, hole({ kind: 'literal', value: 'x' }), hole(inner)] };

        expect(getError(() => domql.query({ version: 22, query: nested }, { flag: true }).resolve()).location.pointer).toBe('/query/parts/2/expression/parts/2/expression');
        expect(getError(() => domql.query({ version: 22, query: { kind: 'interpolatedString', parts: [hole({ kind: 'parameter', name: 'flag' })] } }, { flag: true }).resolve()).location.pointer).toBe('/query/parts/0/expression');
        expect(domql.query({ version: 22, query }, { flag: true }).definition.query.parts).toHaveLength(3);
    });

    it.each([
        ['parts that are no array', { kind: 'interpolatedString', parts: 'a' }, '/query/parts', 'This part of a definition is an array'],
        ['a part of no kind it has', { kind: 'interpolatedString', parts: [{ kind: 'hole', value: 'a' }] }, '/query/parts/0', 'A part of an interpolated string is an object whose kind is text or expression'],
        ['text that is no string', { kind: 'interpolatedString', parts: [{ kind: 'text', value: 1 }] }, '/query/parts/0/value', 'The text of an interpolated string is a string'],
        ['an expression part without its expression', { kind: 'interpolatedString', parts: [{ kind: 'expression' }] }, '/query/parts/0', ''],
        ['an expression that is no node', { kind: 'interpolatedString', parts: [{ kind: 'expression', expression: { kind: 'sum' } }] }, '/query/parts/0/expression', 'A node is an object'],
    ])('refuses a definition of an interpolated string with %s', (_, query, pointer, message) => {
        const error = getError(() => domql.query({ version: 22, query }));

        expect(error.kind).toBe('structure');
        expect(error.location.pointer).toBe(pointer);
        expect(error.message).toContain(message);
    });

    it.each([
        ['each hole on one line, with no space inside its braces', '$"Hello {  a ?? "x"  }!"', '$"Hello {a ?? "x"}!"'],
        ['a hole whose expression begins with a brace, a space after its own', '$"{ {x=1, y=2}.x}"', '$"{ { x = 1, y = 2 }.x}"'],
        ['its braces doubled, however they were written', '$"{{a}} \\u{7B}"', '$"{{a}} {{"'],
        ['its text\'s line breaks, tabs and invisible characters escaped, as a string\'s are', '$"a\nb\tc​"', '$"a\\nb\\tc\\u{200B}"'],
        ['a string within a hole as any string is written, its line break escaped', '$"{a ?? "x\ny"}"', '$"{a ?? "x\\ny"}"'],
        ['an interpolated string within a hole, and one with text alone', '$"{$"{a}"} {$"b"} {$""}"', '$"{$"{a}"} {$"b"} {$""}"'],
    ])('writes %s', (_, text, formatted) => {
        expect(domql.format(text)).toBe(formatted);
        expect(domql.format(formatted)).toBe(formatted);
        expect(domql.format(domql.query(text).definition)).toBe(formatted);
        expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
    });
});

describe('domql string escapes', () => {
    const valueOf = text => domql.query(text).definition.query.value;

    it('reads each escape as the character it stands for, and a line break, a tab and any other character written as itself', () => {
        expect(valueOf('"\\" \\\\ \\n \\r \\t \\e"')).toBe('" \\ \n \r \t \u001B');
        expect(valueOf('"\\u{41}\\u{0}\\u{1F600}\\u{10FFFF}\\u{000041}"')).toBe('A\u0000\u{1F600}\u{10FFFF}A');
        expect(valueOf('"line\nbreak\tand é 😀"')).toBe('line\nbreak\tand é 😀');
        expect(valueOf('"\\e"')).toBe(valueOf('"\\u{1B}"'));
        expect(valueOf('"\\u{A0}\\u{200B}\\u{1F600}"')).toBe('\u00A0\u200B😀');
        expect(valueOf('"😀"')).toBe(valueOf('"\\u{1F600}"'));
        expect(valueOf('"\\u{1b}"')).toBe(valueOf('"\\u{1B}"'));
    });

    it.each([
        ['an escape the language has none of', '"a\\qb"', 'A string escapes only \\", \\\\, \\n, \\r, \\t, \\e and \\u{…}'],
        ['a backslash ending the text', '"a\\', 'A string escapes only'],
        ['a Unicode escape without braces', '"a\\u41"', 'A Unicode escape is written \\u{…} with one to six hexadecimal digits, as \\u{1F600}'],
        ['a Unicode escape without digits', '"a\\u{}"', 'A Unicode escape is written \\u{…}'],
        ['a Unicode escape of seven digits', '"a\\u{0000041}"', 'A Unicode escape is written \\u{…}'],
        ['a Unicode escape of no hexadecimal digit', '"a\\u{G}"', 'A Unicode escape is written \\u{…}'],
        ['a Unicode escape never closed', '"a\\u{41"', 'A Unicode escape is written \\u{…}'],
        ['the first surrogate', '"a\\u{D800}"', 'A Unicode escape names a scalar value, and D800 to DFFF are surrogates'],
        ['the last surrogate', '"a\\u{dfff}"', 'and D800 to DFFF are surrogates'],
        ['a value beyond the last scalar value', '"a\\u{110000}"', 'A Unicode escape names a value no greater than 10FFFF'],
    ])('refuses %s, at its backslash', (_, text, message) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column: 3 });
    });

    it.each([
        ['a line feed, a carriage return and a tab, written or escaped', '"a\nb\\rc\td\\n"', '"a\\nb\\rc\\td\\n"'],
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
        const query = domql.query({ version: 22, query: { kind: 'literal', value: 'a\u0001\u001B\n"' } });

        expect(domql.format(query)).toBe('"a\\u{1}\\e\\n\\""');
        expect(valueOf(domql.format(query))).toBe('a\u0001\u001B\n"');
    });
});

describe('domql comparisons', () => {
    const evaluate = (text, bindings = {}) => domql.query(text, bindings).evaluate();
    const queryOf = text => domql.query(text).definition.query;

    it('orders two numbers, and a chain of them pointing one way, answering a Boolean', () => {
        expect(evaluate('{ a = 1 < 2, b = 2 <= 2, c = 3 > 4, d = 4 >= 4, e = 0 < x <= 600, f = 0 < y <= 600, g = 3 > 2 >= 2 > 1 }', { x: 600, y: 601 }))
            .toEqual({ a: true, b: true, c: false, d: true, e: true, f: false, g: true });
        expect(evaluate('-0 < 0')).toBe(false);
    });

    it('binds looser than arithmetic and tighter than and, or and not, as an equality does', () => {
        expect(evaluate('0 < w - p * 2 <= 600 and enabled', { w: 600, p: 16, enabled: true })).toBe(true);
        expect(evaluate('0 < w - p * 2 <= 600 and enabled', { w: 640, p: 16, enabled: true })).toBe(false);
        expect(evaluate('not a < b', { a: 1, b: 2 })).toBe(false);
        expect(evaluate('if a < b then "less" else "not less"', { a: 1, b: 2 })).toBe('less');
        expect(evaluate('(a < b) == c', { a: 1, b: 2, c: true })).toBe(true);
        expect(evaluate('(w ?? 0) < 600', { w: null })).toBe(true);
    });

    it('records one comparison for a pair and for a chain, its operands in order and an operator between each two', () => {
        expect(queryOf('a < b')).toEqual({ kind: 'comparison', operands: [{ kind: 'parameter', name: 'a' }, { kind: 'parameter', name: 'b' }], operators: ['<'] });
        expect(queryOf('0 < w <= 600')).toEqual({ kind: 'comparison', operands: [{ kind: 'literal', value: 0 }, { kind: 'parameter', name: 'w' }, { kind: 'literal', value: 600 }], operators: ['<', '<='] });
        expect(queryOf('(a < b) < c').operands[0].kind).toBe('comparison');
    });

    it.each([
        ['a chain that turns from < to >', 'a < b > c', "A comparison chain keeps one direction, and '>' turns it from '<': join two comparisons with 'and', as in 'a < b and b > c'", 7],
        ['a chain that turns from >= to <', 'a >= b < c', "A comparison chain keeps one direction, and '<' turns it from '>='", 8],
        ['a comparison beside an equality', 'a < b == c', "'<' and '==' stand apart, one of them grouped: write '(… < …) == …' or '… < (… == …)'", 7],
        ['an equality beside a comparison', 'a == b < c', "'==' and '<' stand apart, one of them grouped", 8],
        ['a fallback beside a comparison', 'w ?? 0 < 600', "'??' and '<' stand apart, one of them grouped: write '(… ?? …) < …' or '… ?? (… < …)'", 8],
        ['a comparison beside a fallback', 'a < b ?? c', "'<' and '??' stand apart, one of them grouped", 7],
        ['a comparison operator with nothing before it', '< a', "'<' compares the value written before it: write 'self < …'", 1],
        ['an operator of two signs written apart', 'a < = b', "'<=' is one operator, written with nothing between its signs", 3],
    ])('refuses %s, at the operator that is refused', (_, text, message, column) => {
        const error = getError(() => domql.query(text));

        expect(error.kind).toBe('syntax');
        expect(error.message).toContain(message);
        expect(error.location).toMatchObject({ line: 1, column });
    });

    it.each([
        ['a grouped comparison, which is a Boolean', '(a < b) < c', { a: 1, b: 2, c: 3 }, "The left operand of '<' is a number, and this one is boolean", '/query/operands/0'],
        ['an operand that can be null', 'a < b', { a: 1, b: null }, "The right operand of '<' can be null, and a comparison takes numbers alone: give it a fallback, as in (… ?? 0), or test it first", '/query/operands/1'],
        ['text, which ordering takes no part in', '"a" < "b"', {}, "The left operand of '<' is a number, and this one is string", '/query/operands/0'],
        ['a middle operand of text', '0 <= x < 2', { x: '1' }, "The right operand of '<=' is a number, and this one is string", '/query/operands/1'],
    ])('refuses %s before anything is evaluated, naming the operand', (_, text, bindings, message, pointer) => {
        const error = getError(() => domql.query(text, bindings).resolve());

        expect(error.kind).toBe('validation');
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
        ['one operand', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }], operators: [] }, '/query/operands', 'A comparison compares two or more expressions'],
        ['an operator fewer than one between each two operands', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }], operators: [] }, '/query/operators', 'one fewer than they are'],
        ['an operator that orders nothing', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }], operators: ['!='] }, '/query/operators/0', 'A comparison operator is <, <=, > or >='],
        ['operators pointing two ways', { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }, { kind: 'literal', value: 0 }], operators: ['<', '>'] }, '/query/operators/1', 'A comparison chain keeps one direction'],
    ])('refuses a definition of a comparison with %s', (_, query, pointer, message) => {
        const error = getError(() => domql.query({ version: 22, query }));

        expect(error.kind).toBe('structure');
        expect(error.location.pointer).toBe(pointer);
        expect(error.message).toContain(message);
    });

    it('evaluates a comparison made from a definition as one written in text', () => {
        expect(domql.query({ version: 22, query: { kind: 'comparison', operands: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }, { kind: 'literal', value: 2 }], operators: ['<', '<='] } }).evaluate()).toBe(true);
    });
});

describe('domql values given by =', () => {
    const syntaxErrorOf = text => getError(() => domql.query(text));

    it('gives a field, a local and a binding the value after =, leaving a colon after a name to an indexer alone', () => {
        const panel = document.createElement('div');

        panel.setAttribute('data-key', 'k');
        panel.setAttribute('id', 'p');

        expect(domql.query('panel { let key = self:["data-key"], key = key, id = if let id = panel:attribute["id"] then id else null }', { panel }).evaluate()).toEqual({ key: 'k', id: 'p' });
        expect(domql.query('{ size=1 }').evaluate()).toEqual({ size: 1 });
        expect(domql.format('panel{let k=self:["data-key"],v=k}')).toBe('panel {\n    let k = self:["data-key"],\n    v = k\n}');
    });

    it.each([
        ['a field', 'panel { count: self.size }', "A field takes its value after =: write 'count = …'", 14],
        ['a local', 'panel { let r: self.rect, a = r }', "A local takes its value after =: write 'let r = …'", 14],
        ['a binding', 'if let k: panel:["id"] then 1 else 2', "A binding takes its value after =: write 'if let k = …'", 9],
    ])('refuses %s written with a colon, giving the form with =, naming where', (_, text, message, column) => {
        const error = syntaxErrorOf(text);

        expect(error.kind).toBe('syntax');
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

    it('refuses an argument written as a named one, with = or a colon, and reads a binding\'s indexer there as the argument', () => {
        expect(syntaxErrorOf('panel.rectRelativeTo(relativeTo = other)').message).toContain("'rectRelativeTo' takes one argument, and several parameters are given as the fields of an object, as { relativeTo = … }");
        expect(syntaxErrorOf('panel.rectRelativeTo(relativeTo: other)').message).toContain('as { relativeTo = … }');
        expect(domql.query('panel.matches(panel:attribute["for"])').definition.query.argument.kind).toBe('indexer');
    });
});

describe('domql calls that were infix calls', () => {
    let panel;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel" class="toolbar"><button class="row open" id="first"></button><button class="row" id="second"></button></div>';
        panel = document.getElementById('panel');
    });

    const evaluate = (text, bindings = {}) => domql.query(text, { panel, ...bindings }).evaluate();

    it('answer a value a chain continues from, an event projection written without a group among them', () => {
        expect(evaluate('panel.first(".row")?.matches(".open") ?? false')).toBe(true);
        expect(evaluate('panel.children.where(self.matches(".toolbar > button:first-child")).count')).toBe(1);
        expect(evaluate('{ open = panel.first(".none")?.matches(".open") ?? false }')).toEqual({ open: false });
        expect(domql.query('panel.on("click") { button = self.button }', { panel }).definition.query).toEqual({
            kind: 'object',
            target: { kind: 'call', target: { kind: 'parameter', name: 'panel' }, name: 'on', argument: { kind: 'literal', value: 'click' } },
            fields: [{ name: 'button', value: { kind: 'member', target: { kind: 'self' }, name: 'button' } }],
        });
        expect(domql.query('panel.on("click") { button = self.button }', { panel }).resolve().kind).toBe('subscription');
    });

    it('answer matches as a boolean of a receiver that cannot be null, and as a boolean? only through optional access or a null argument', () => {
        expect(domql.query('panel.matches(".toolbar")', { panel }).resolve().type.toString()).toBe('boolean');
        expect(domql.query('panel.first(".row")?.matches(".open")', { panel }).resolve().type.toString()).toBe('boolean?');
        expect(domql.query('panel.matches(selector)', { panel, selector: null }).resolve().type.toString()).toBe('boolean?');
        expect(evaluate('panel.matches(selector)', { selector: null })).toBeNull();
    });

    it.each([
        ['matches', 'item?.matches(panel.first("[")?:["class"] ?? ".row")'],
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
        ['on', 'panel on "click" { x: self.clientX }', 'panel'],
        ['matches', 'panel.parent as "element" matches ".row"', '(panel.parent as "element")'],
        ['matches', 'panel:["n"] to "string" matches ".row"', '(panel:["n"] to "string")'],
    ])('refuse %s written after its receiver and a space, the infix form, giving the call to write', (name, text, receiver) => {
        const error = getError(() => domql.query(text, { panel }));

        expect(error.kind).toBe('syntax');
        expect(error.message).toContain(`A member follows its receiver after a dot, or after a colon for an indexer: write '${receiver}.${name}(…)'`);
    });

    it('refuse a definition holding an infixCall, which is no node, saying which nodes take its place', () => {
        const error = getError(() => domql.query({ version: 22, query: { kind: 'object', target: parameter('panel'), fields: [{ name: 'open', value: infixCall('matches', literal('.open')) }] } }));

        expect(error.kind).toBe('structure');
        expect(error.location.pointer).toBe('/query/fields/0/value');
        expect(error.message).toContain('An infixCall is no node: an operation is a call node, or an indexer node for a named or default indexer');
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

    /** A module whose indexer `entry` answers a structured entry for a number, counting its calls, and one whose property `entries` counts its reads. */
    const registerEntries = () => {
        const counts = { entries: 0, reads: 0 };

        isolated.registerModule(isolated.createModule('entry', {
            types: [{ name: 'record', fields: { label: 'string', rank: 'number' } }],
            members: [{ name: 'entry', function: 'entry', kind: 'operation', form: 'indexer', on: 'element', parameters: [{ name: 'index', kind: 'value', type: 'number', required: true, nulls: 'propagate' }], result: 'record?', changes: 'constant', reads: 'fresh' }],
        }, {
            entry: (element, { index }) => {
                counts.entries++;

                return index < 3 ? { label: `${element.id} ${index}`, rank: index * 10 } : null;
            },
        }));
        isolated.registerModule(isolated.createModule('entries', {
            members: [{ name: 'entries', function: 'read', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { read: () => ++counts.reads }));

        return counts;
    };

    describe('the built-in indexers', () => {
        it('read an attribute and a computed style by a key, which an expression or a binding gives', () => {
            expect(evaluate('panel:attribute["data-key"]')).toBe('k1');
            expect(evaluate('panel:attribute[name]', { name: 'data-key' })).toBe('k1');
            expect(evaluate('panel:attribute[panel:attribute["data-which"]]')).toBe('k1');
            expect(evaluate('panel:attribute["data-missing"]')).toBeNull();
            expect(evaluate('panel:style["display"]')).toBe('flex');
            expect(evaluate('panel.first(".row")?:attribute["data-key"]')).toBe('k2');
        });

        it('check the key against the type of the indexer\'s parameter', () => {
            const error = getError(() => isolated.query('panel:attribute[5]', { panel }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain("The argument 'name' of 'attribute' expects string and finds number");
        });

        it('give the form to write for an indexer written as a property, and for a member written as an indexer', () => {
            const messageOf = text => getError(() => isolated.query(text, { panel }).resolve()).message;

            expect(messageOf('panel.attribute["data-key"]')).toContain("'attribute' is an indexer: write 'panel:attribute[…]'");
            expect(messageOf('panel.style')).toContain("'style' is an indexer: write 'panel:style[…]'");
            expect(messageOf('panel:size["width"]')).toContain("'size' is a property: write 'panel.size'");
            expect(messageOf('panel:closest[".row"]')).toContain(`'closest' uses call syntax: write 'panel.closest(".row")'`);
        });

        it('require ?: for a receiver that can be null, giving the form', () => {
            expect(getError(() => isolated.query('panel.first(".row"):attribute["data-key"]', { panel }).resolve()).message).toContain(`write 'panel.first(".row")?:attribute["data-key"]'`);
        });
    });

    describe('the default indexer', () => {
        it('of an element is its attribute', () => {
            expect(evaluate('panel:["data-key"]')).toBe('k1');
            expect(evaluate('panel:[name]', { name: 'data-key' })).toBe('k1');
            expect(evaluate('panel.first(".row")?:["data-key"]')).toBe('k2');
            expect(evaluate('missing?:["data-key"]', { missing: null })).toBeNull();
            expect(isolated.query('panel:["data-key"]', { panel }).resolve().getResolution('/query').declaration.name).toBe('attribute');
        });

        it('takes the key its indexer takes, and is refused for a receiver whose type has none', () => {
            const messageOf = text => getError(() => isolated.query(text, { panel }).resolve()).message;

            expect(messageOf('panel:[5]')).toContain("The argument 'name' of 'attribute' expects string and finds number");
            expect(messageOf('window:["x"]')).toContain("window has no default indexer: name the indexer, as in ':name[…]'");
            expect(messageOf('panel.first(".row"):["x"]')).toContain(`write 'panel.first(".row")?:["x"]'`);
        });

        it('is one a module declares for a type of its own, and one at most for any receiver', () => {
            const tokens = { name: 'token', function: 'token', kind: 'operation', form: 'indexer', default: true, on: 'palette', parameters: [{ name: 'name', kind: 'value', type: 'string', required: true, nulls: 'propagate' }], result: 'string?', changes: 'constant', reads: 'fresh' };

            isolated.registerModule(isolated.createModule('palette', {
                types: [{ name: 'palette', fields: { accent: 'string' } }],
                members: [tokens, { name: 'palette', function: 'palette', kind: 'property', on: 'element', parameters: [], result: 'palette', changes: 'constant', reads: 'fresh' }],
            }, { token: (palette, { name }) => palette[name] ?? null, palette: () => ({ accent: 'teal' }) }));

            expect(evaluate('panel.palette:["accent"]')).toBe('teal');
            expect(evaluate('panel.palette:token["accent"]')).toBe('teal');
            expect(evaluate('panel:["data-key"]')).toBe('k1');

            const competing = getError(() => isolated.registerModule(isolated.createModule('rival', {
                members: [{ ...tokens, name: 'rival', function: 'rival', on: 'element' }],
            }, { rival: () => null })));

            expect(competing.kind).toBe('module');
            expect(competing.message).toContain("'attribute' is the default indexer of element already");

            const twice = getError(() => isolated.registerModule(isolated.createModule('swatch', {
                types: [{ name: 'swatch', fields: { hue: 'number' } }],
                members: [{ ...tokens, name: 'hue', function: 'hue', on: 'swatch' }, { ...tokens, name: 'shade', function: 'shade', on: 'swatch' }],
            }, { hue: () => null, shade: () => null })));

            expect(twice.message).toContain("'hue' is the default indexer of swatch already");
        });

        it.each([
            ['that is no Boolean', { form: 'indexer', default: 'yes' }, 'whether it is the default indexer of its receivers as a Boolean'],
            ['for a member that is no indexer', { form: 'call', default: true }, 'Only an indexer is the default of its receivers'],
            ['for a property', { kind: 'property', parameters: [], input: undefined, default: true }, 'Only an indexer is the default of its receivers'],
        ])('is refused where a declaration marks a default %s', (_, overrides, message) => {
            const declaration = { name: 'entries', function: 'entry', kind: 'operation', on: 'element', input: 'direct', parameters: [{ name: 'index', kind: 'value', type: 'number', required: true, nulls: 'propagate' }], result: 'number', changes: 'constant', reads: 'fresh', ...overrides };
            const error = getError(() => isolated.createModule('entries', { members: [declaration] }, { entry: () => 1 }));

            expect(error.message).toContain(message);
        });
    });

    describe('the class indexer', () => {
        it('tests whether the element has one class, by a key an expression or a binding gives', () => {
            panel.className = 'open  card';

            expect(evaluate('panel:class["open"]')).toBe(true);
            expect(evaluate('panel:class["card"]')).toBe(true);
            expect(evaluate('panel:class["closed"]')).toBe(false);
            expect(evaluate('panel:class[name]', { name: 'card' })).toBe(true);
            expect(evaluate('panel:class["open"] and not panel:class["closed"]')).toBe(true);
            expect(evaluate('missing?:class["open"]', { missing: null })).toBeNull();
        });

        it.each([
            ['empty', ''],
            ['holding a space', 'open card'],
            ['holding a tab', 'open\tcard'],
            ['holding a line feed', 'open\ncard'],
            ['holding a form feed', 'open\fcard'],
            ['holding a carriage return', 'open\rcard'],
        ])('refuses a key that is no token, %s, as an evaluation error', (_, name) => {
            const error = getError(() => evaluate('panel:class[name]', { name }));

            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain(`${JSON.stringify(name)} is no class, which is one token: never empty, and holding no tab, line feed, form feed, carriage return or space`);
        });

        it('takes any other character a token holds, as a class list does', () => {
            panel.className = 'a\u00a0b';

            expect(evaluate('panel:class[name]', { name: 'a\u00a0b' })).toBe(true);
        });
    });

    describe('an indexer a module declares', () => {
        it('takes a key of the type its parameter declares, and answers structured data that a chain reads on', () => {
            registerEntries();

            expect(evaluate('panel:entry[1]')).toEqual({ label: 'panel 1', rank: 10 });
            expect(evaluate('panel:entry[2]?.label')).toBe('panel 2');
            expect(evaluate('panel:entry[2]?["rank"]')).toBe(20);
            expect(evaluate('panel:entry[5]?.label')).toBeNull();
            expect(evaluate('panel { first = self:entry[0]?.label, ranks = self.children { rank = self:entry[1]?.rank } }')).toEqual({ first: 'panel 0', ranks: [{ rank: 10 }] });
        });

        it('evaluates neither its key nor its implementation for a null receiver read with ?:', () => {
            const counts = registerEntries();

            expect(evaluate('missing?:entry[panel.entries]', { missing: null })).toBeNull();
            expect(counts).toEqual({ entries: 0, reads: 0 });
            expect(evaluate('panel?:entry[panel.entries]')).toEqual({ label: 'panel 1', rank: 10 });
            expect(counts).toEqual({ entries: 1, reads: 1 });
        });

        it.each([
            ['a property', { kind: 'property', parameters: [] }, 'A property is accessed'],
            ['an action', { kind: 'action' }, 'An indexer is an operation'],
            ['no parameter', { parameters: [] }, 'An indexer is an operation whose key is its one parameter'],
            ['two parameters', { parameters: [{ name: 'a', kind: 'value', type: 'number', required: true, nulls: 'propagate' }, { name: 'b', kind: 'value', type: 'number', required: true, nulls: 'propagate' }] }, 'An indexer is an operation whose key is its one parameter'],
            ['an optional parameter', { parameters: [{ name: 'a', kind: 'value', type: 'number', required: false, nulls: 'propagate' }] }, 'a required value parameter'],
            ['an expression parameter', { parameters: [{ name: 'a', kind: 'expression', type: 'boolean?', context: 'item', required: true, nulls: 'accept' }] }, 'a required value parameter'],
            ['options for its input', { input: 'options' }, "An indexer's key supplies its one parameter, so its input is direct"],
        ])('is refused where it declares %s', (_, overrides, message) => {
            const declaration = { name: 'entries', function: 'entry', kind: 'operation', form: 'indexer', on: 'element', parameters: [{ name: 'index', kind: 'value', type: 'number', required: true, nulls: 'propagate' }], result: 'number', changes: 'constant', reads: 'fresh', ...overrides };
            const error = getError(() => isolated.createModule('entries', { members: [declaration] }, { entry: () => 1 }));

            expect(error.kind).toBe('module');
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

    const keyAt = (text, bindings = {}) => domql.query(`{ key = ${text}?:["data-key"] }`, { panel, empty, ...bindings }).evaluate().key;

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
        ['an index computed from an attribute', 'panel:["data-i"] to "number"', 'a3', {}, '2'],
    ])('answers %s', (_, key, answer, bindings = {}, attribute) => {
        if (attribute !== undefined) {
            panel.setAttribute('data-i', attribute);
        }

        expect(keyAt(`panel.children:[${key}]`, bindings)).toBe(answer);
    });

    it('answers null for an empty list, a null index, and through optional access a null receiver, without evaluating the index', () => {
        expect(keyAt('empty.children:[0]')).toBeNull();
        expect(keyAt('panel.children:[i]', { i: null })).toBeNull();
        expect(keyAt('none?.children:[panel.first("[")?.children?.count ?? 0]', { none: null })).toBeNull();
        expect(keyAt('none?.children:[i]', { none: null, i: null })).toBeNull();
        expect(getError(() => keyAt('panel.children:[panel.first("[")?.children?.count ?? 0]')).message).toContain("The member 'first' failed");
    });

    it('answers an item that can be null, and refuses an index that is no number and a receiver that can be null without optional access', () => {
        expect(domql.query('panel.children:[0]?.size', { panel }).resolve().type.toString()).toBe('size?');
        expect(domql.query('panel.children:[i]?.size', { panel, i: null }).resolve().type.toString()).toBe('size?');
        expect(getError(() => domql.query('panel.children:["1"]', { panel }).resolve()).message).toContain('expects number and finds string');
        expect(getError(() => domql.query('none.children:[0]', { none: null }).resolve()).kind).toBe('validation');
    });
});

