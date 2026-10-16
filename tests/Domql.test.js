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

const literal = value => ({ kind: 'literal', value });
const parameter = name => ({ kind: 'parameter', name });
const equality = (left, right) => ({ kind: 'equality', left, right });
const not = operand => ({ kind: 'not', operand });

describe('domql', () => {
    describe('query from text', () => {
        it('reads the specification\'s example into its definition', () => {
            const query = domql.query('@panel { size: self.size, hasFocus: self matches ":focus-within" }');

            expect(query.definition).toEqual({
                version: 13,
                query: {
                    kind: 'object',
                    target: parameter('panel'),
                    fields: [
                        { name: 'size', value: member('size') },
                        { name: 'hasFocus', value: infixCall('matches', literal(':focus-within')) },
                    ],
                },
            });
        });

        it('reads a chain as a succession of targets', () => {
            const { definition } = domql.query('@panel.all("li").count');

            expect(definition.query).toEqual(member('count', call('all', literal('li'), parameter('panel'))));
        });

        it('reads a member access, a call and an infix call as nodes of their own, each holding its receiver', () => {
            expect(domql.query('@panel.size').definition.query).toEqual(member('size', parameter('panel')));
            expect(domql.query('@panel.closest(".row")').definition.query).toEqual(call('closest', literal('.row'), parameter('panel')));
            expect(domql.query('@panel.parent.closest()').definition.query).toEqual(call('closest', undefined, member('parent', parameter('panel'))));
            expect(domql.query('@panel attributeOf "id"').definition.query).toEqual(infixCall('attributeOf', literal('id'), parameter('panel')));
            expect(domql.query('@sentinel intersects').definition.query).toEqual(infixCall('intersects', undefined, parameter('sentinel')));
        });

        it('reads self as the current value, written as a receiver like any other', () => {
            expect(domql.query('@panel { width: self.size.width }').definition.query.fields[0].value).toEqual(member('width', member('size', self)));
        });

        it('takes one argument in a call, any expression, which its parentheses delimit', () => {
            expect(domql.query('@rows.where(self.attached and self.visible)').definition.query.argument.kind).toBe('and');
        });

        it('takes a chain input as an infix call\'s argument, an options object among them', () => {
            expect(domql.query('@sentinel intersects { root: @panel, margin: 200, }').definition.query.argument).toEqual({ kind: 'object', fields: [{ name: 'root', value: parameter('panel') }, { name: 'margin', value: literal(200) }] });
            expect(domql.query('@panel attributeOf @name').definition.query.argument).toEqual(parameter('name'));
            expect(domql.query('@panel attributeOf ("data-" )').definition.query.argument).toEqual(literal('data-'));
        });

        it('ends a chain at an infix call, which a group continues from', () => {
            const { definition } = domql.query('(@panel.closest("[data-group]") attributeOf "data-group") is null');

            expect(definition.query.left).toEqual(infixCall('attributeOf', literal('data-group'), call('closest', literal('[data-group]'), parameter('panel'))));
        });

        it('ends an infix call\'s argument at a comma, so each field keeps its own', () => {
            const { definition } = domql.query('@target { key: self attributeOf "data-key", selected: self matches ".x" }');

            expect(definition.query.fields.map(field => field.name)).toEqual(['key', 'selected']);
            expect(definition.query.fields[0].value.argument).toEqual(literal('data-key'));
        });

        it('takes an infix call and its argument across a line break', () => {
            expect(domql.query('@target {\n    id: self\n    attributeOf\n    "id"\n}').definition).toEqual(domql.query('@target { id: self attributeOf "id" }').definition);
        });

        it('takes an object expression after a call', () => {
            const { definition } = domql.query('@table.all("tr") { height: self.rect.height }');

            expect(definition.query.kind).toBe('object');
            expect(definition.query.target).toEqual(call('all', literal('tr'), parameter('table')));
        });

        it('reads every kind of literal', () => {
            const { definition } = domql.query('{ a: "say \\"hi\\" \\\\", b: -1.5e2, c: 0, d: true, e: false, f: null }');

            expect(definition.query.fields.map(field => field.value.value)).toEqual(['say "hi" \\', -150, 0, true, false, null]);
        });

        it('skips line and block comments, which separate as whitespace does', () => {
            const { definition } = domql.query('// A panel.\n@panel { /* its\nfirst item */ id: self.first(".item") /* inline */attributeOf/**/"id" // the id\n}');

            expect(definition.query.fields[0].value).toEqual(infixCall('attributeOf', literal('id'), call('first', literal('.item'))));
        });

        it('keeps comment markers inside a string as text', () => {
            const { definition } = domql.query('@target attributeOf "https://example.com/* not a comment */"');

            expect(definition.query.argument).toEqual(literal('https://example.com/* not a comment */'));
        });

        it('closes a block comment at its first */, so comments do not nest', () => {
            expect(getError(() => domql.query('@panel { /* outer /* inner */ still a comment */ size: self.size }')).kind).toBe('syntax');
        });

        it('reads an object expression following no value as one keeping the current value', () => {
            const { definition } = domql.query('@panel { layout: { width: self.size.width } }');

            expect(definition.query.fields[0]).toEqual({
                name: 'layout',
                value: { kind: 'object', fields: [{ name: 'width', value: member('width', member('size')) }] },
            });
        });

        it('keeps the name written for each field', () => {
            const { definition } = domql.query('@target { bounds: self["rect"], clientSize: self.clientSize }');

            expect(definition.query.fields).toEqual([
                { name: 'bounds', value: member('rect') },
                { name: 'clientSize', value: member('clientSize') },
            ]);
        });

        it('reads a camelCase name as one name and an infix call\'s literal as its argument', () => {
            const { definition } = domql.query('@target { tier: self computedStyleOf "--layout-tier", dark: self matchesMedia "(prefers-color-scheme: dark)" }');

            expect(definition.query.fields).toEqual([
                { name: 'tier', value: infixCall('computedStyleOf', literal('--layout-tier')) },
                { name: 'dark', value: infixCall('matchesMedia', literal('(prefers-color-scheme: dark)')) },
            ]);
        });

        it('freezes the definition', () => {
            const { definition } = domql.query('@panel { size: self.size }');

            expect(Object.isFrozen(definition)).toBe(true);
            expect(Object.isFrozen(definition.query.fields[0].value.target)).toBe(true);
        });

        it('shares one definition between parses of the same text', () => {
            const first = domql.query('@panel { size: self.size, clientSize: self.clientSize }', { panel: 1 });
            const second = domql.query('@panel { size: self.size, clientSize: self.clientSize }', { panel: 2 });

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
        it('read a test as the Boolean member it is, written as any property is', () => {
            expect(domql.query('@document.visible').definition.query).toEqual(member('visible', parameter('document')));
            expect(domql.query('@input.hasSelection').definition.query).toEqual(member('hasSelection', parameter('input')));
            expect(domql.query('@panel.all("input").where(self.disabled)').definition.query.argument).toEqual(member('disabled'));
        });

        it('read has as an ordinary name', () => {
            expect(domql.query('@panel has "selection"').definition.query).toEqual(infixCall('has', literal('selection'), parameter('panel')));
            expect(domql.query('{ has: @panel.hasChildren }').definition.query.fields[0].name).toBe('has');
        });
    });

    describe('equalities', () => {
        it('read is between two equality operands, and is not as the negation of is', () => {
            expect(domql.query('@panel.parent is null').definition.query).toEqual(equality(member('parent', parameter('panel')), literal(null)));
            expect(domql.query('@action is "save"').definition.query).toEqual(equality(parameter('action'), literal('save')));
            expect(domql.query('@a is not @b').definition.query).toEqual(not(equality(parameter('a'), parameter('b'))));
            expect(domql.query('@left attributeOf "name" is @right attributeOf "name"').definition.query).toEqual(equality(infixCall('attributeOf', literal('name'), parameter('left')), infixCall('attributeOf', literal('name'), parameter('right'))));
            expect(domql.query('@node as "element" is @panel').definition.query).toEqual(equality({ kind: 'cast', type: 'element', target: parameter('node') }, parameter('panel')));
        });

        it('give is not, not around is, and not before is one definition', () => {
            const negated = domql.query('@a is not @b').definition;

            expect(domql.query('not (@a is @b)').definition).toEqual(negated);
            expect(domql.query('not @a is @b').definition).toEqual(negated);
        });

        it('bind more loosely than an infix call and more tightly than and, taking a group as either operand', () => {
            expect(domql.query('@a is @b and @c').definition.query).toEqual({ kind: 'and', operands: [equality(parameter('a'), parameter('b')), parameter('c')] });
            expect(domql.query('(@a is @b) is true').definition.query).toEqual(equality(equality(parameter('a'), parameter('b')), literal(true)));
            expect(domql.query('(@count ?? 0) is 0').definition.query).toEqual(equality({ kind: 'coalescing', value: parameter('count'), fallback: literal(0) }, literal(0)));
        });

        it.each([
            ['an equality without its right operand', { kind: 'equality', left: parameter('panel') }, '/query'],
            ['an equality whose left operand is no node', equality(1, parameter('panel')), '/query/left'],
            ['an equality of the current value at the top level', equality(self, literal(null)), '/query/left'],
            ['a predicate, which an equality and a member replace', { kind: 'predicate', verb: 'is', target: parameter('panel'), name: literal(null) }, '/query'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('logical expressions and groups', () => {
        it('combine whole expressions, and binding tighter than or', () => {
            const { query } = domql.query('@panel.attached or @input.disabled and @enabled').definition;

            expect(query).toEqual({
                kind: 'or',
                operands: [
                    member('attached', parameter('panel')),
                    { kind: 'and', operands: [member('disabled', parameter('input')), parameter('enabled')] },
                ],
            });
        });

        it('gather a run of one operator into one expression', () => {
            expect(domql.query('@first or @second or @third').definition.query.operands).toEqual([parameter('first'), parameter('second'), parameter('third')]);
        });

        it('group any expression in parentheses, recording the expression the group holds', () => {
            expect(domql.query('(@first or @second) and @third').definition.query).toEqual({ kind: 'and', operands: [{ kind: 'or', operands: [parameter('first'), parameter('second')] }, parameter('third')] });
            expect(domql.query('((@first))').definition.query).toEqual(parameter('first'));
        });

        it('start a chain from a group', () => {
            expect(domql.query('(@panel).children.count').definition.query).toEqual(member('count', member('children', parameter('panel'))));
        });

        it('stand as a field under the name written for it, as every field does', () => {
            expect(getError(() => domql.query('@panel {.attached or.disabled }')).kind).toBe('syntax');
            expect(() => domql.query('@panel { unavailable: self.attached or self.disabled }')).not.toThrow();
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('@input.disabled or (@input.readOnly and @input.textEditable)', { input: document.body });

            expect(domql.query(parsed.definition, { input: document.body }).definition).toEqual(parsed.definition);
        });

        it.each([
            ['an and of one expression', { kind: 'and', operands: [parameter('panel')] }, '/query/operands'],
            ['an or whose operands are no array', { kind: 'or', operands: parameter('panel') }, '/query/operands'],
            ['an operand that tests the current value at the top level', { kind: 'or', operands: [member('visible'), parameter('panel')] }, '/query/operands/0/target'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conditionals', () => {
        const conditional = (condition, consequent, alternative) => ({ kind: 'conditional', condition, consequent, alternative });

        it('read a condition, a consequent and an alternative, each a whole expression', () => {
            expect(domql.query('if @wide then @panel else @sidebar').definition.query).toEqual(conditional(parameter('wide'), parameter('panel'), parameter('sidebar')));
            expect(domql.query('if @wide then @first else @second and @third').definition.query.alternative).toEqual({ kind: 'and', operands: [parameter('second'), parameter('third')] });
        });

        it('record an elseif as a conditional nested in the alternative before it', () => {
            const nested = conditional(parameter('a'), literal(1), conditional(parameter('b'), literal(2), literal(3)));

            expect(domql.query('if @a then 1 elseif @b then 2 else 3').definition.query).toEqual(nested);
            expect(domql.query('if @a then 1 else if @b then 2 else 3').definition.query).toEqual(nested);
        });

        it('stand where an expression stands, grouped where it is an operand or starts a chain', () => {
            expect(domql.query('(if @wide then @panel else @sidebar).rect.width').definition.query).toEqual(member('width', member('rect', conditional(parameter('wide'), parameter('panel'), parameter('sidebar')))));
            expect(domql.query('(if @a then true else false) and @b').definition.query.kind).toBe('and');
            expect(domql.query('@panel { state: if self.disabled then "locked" else "open" }').definition.query.fields[0].value.kind).toBe('conditional');
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('if @panel is null then "gone" elseif @panel.attached then "here" else "away"', { panel: document.body });

            expect(domql.query(parsed.definition, { panel: document.body }).definition).toEqual(parsed.definition);
        });

        it.each([
            ['a conditional without its alternative', { kind: 'conditional', condition: parameter('a'), consequent: literal(1) }, '/query'],
            ['a conditional whose branch is no node', conditional(parameter('a'), literal(1), 'else'), '/query/alternative'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('optional access', () => {
        const optional = node => ({ ...node, optional: true });
        const chain = target => ({ kind: 'optionalChain', target });

        it('reads ?. as an optional access or call, held by the optional chain that ends where its chain does', () => {
            expect(domql.query('@panel.parent?.children.count').definition.query).toEqual(chain(member('count', optional(member('children', member('parent', parameter('panel')))))));
            expect(domql.query('@panel.first(".a")?.closest(".b")').definition.query).toEqual(chain(optional(call('closest', literal('.b'), call('first', literal('.a'), parameter('panel'))))));
        });

        it('end a chain at a group, which a chain continues from as a value of its own', () => {
            expect(domql.query('(@panel.parent?.children).count').definition.query).toEqual(member('count', chain(optional(member('children', member('parent', parameter('panel')))))));
        });

        it('carry an object expression in the chain, and end before an infix call, which receives its value', () => {
            expect(domql.query('@panel.parent?.rect { top: self.top }').definition.query).toEqual(chain({ kind: 'object', target: optional(member('rect', member('parent', parameter('panel')))), fields: [{ name: 'top', value: member('top') }] }));
            expect(domql.query('@panel.parent?.closest(".row") attributeOf "id"').definition.query).toEqual(infixCall('attributeOf', literal('id'), chain(optional(call('closest', literal('.row'), member('parent', parameter('panel')))))));
        });

        it('keep the chain of an argument its own', () => {
            expect(domql.query('@panel.closest(@row?.key)').definition.query).toEqual(call('closest', chain(optional(member('key', parameter('row')))), parameter('panel')));
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('(@panel.parent?.children).count is null and @panel.first(".a")?.closest(".b") is null');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });

        it.each([
            ['an optional access outside an optional chain', optional(member('size', parameter('panel'))), '/query'],
            ['an optional chain holding no optional access', chain(member('size', parameter('panel'))), '/query'],
            ['an optional chain directly holding another', chain(chain(optional(member('size', parameter('panel'))))), '/query'],
            ['an optional access that is not true', { ...member('size', parameter('panel')), optional: false }, '/query/optional'],
            ['an optional infix call', optional(infixCall('attributeOf', literal('id'), parameter('panel'))), '/query'],
            ['a call named by an expression, which only an access by name is', { kind: 'call', target: parameter('panel'), name: literal('closest') }, '/query/name'],
            ['an optional access of an argument the chain it is passed to holds', chain(optional(call('closest', optional(member('key', parameter('row'))), parameter('panel')))), '/query/target/argument'],
            ['an optional access beyond an infix call in the chain', chain(member('length', infixCall('attributeOf', literal('id'), optional(member('parent', parameter('panel')))))), '/query/target/target/target'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });

        it('read an optional-access group as the optional chain of its accesses, every one of them optional', () => {
            expect(domql.query('(?@panel.parent.rect)').definition).toEqual(domql.query('@panel?.parent?.rect').definition);
            expect(domql.query('(?@panel.first(".a").closest(".b"))').definition.query).toEqual(chain(optional(call('closest', literal('.b'), optional(call('first', literal('.a'), parameter('panel')))))));
        });

        it('end the optional chain of an optional-access group at its closing parenthesis', () => {
            const group = chain(optional(member('z', optional(member('y', parameter('x'))))));

            expect(domql.query('(?@x.y.z)?.a.b').definition.query).toEqual(chain(member('b', optional(member('a', group)))));
            expect(domql.query('(?@x.y.z)?.a?.b').definition.query).toEqual(chain(optional(member('b', optional(member('a', group))))));
            expect(domql.query('(@x.y.z)?.a').definition.query).toEqual(chain(optional(member('a', member('z', member('y', parameter('x')))))));
        });

        it('take an optional-access group as a chain input, an infix call\'s argument among them, keeping its arguments their own', () => {
            expect(domql.query('@panel attributeOf (?@row.key)').definition.query).toEqual(infixCall('attributeOf', chain(optional(member('key', parameter('row')))), parameter('panel')));
            expect(domql.query('(?@panel.closest(@row.key))').definition.query).toEqual(chain(optional(call('closest', member('key', parameter('row')), parameter('panel')))));
        });

        it.each([
            ['a question mark apart from its parenthesis', '( ?@panel.size)', 1, 3],
            ['an optional-access group with no access', '(?@panel)', 1, 9],
            ['an optional-access group whose receiver is a group holding no cast', '(?(@panel).size)', 1, 10],
            ['an optional-access group holding an object expression', '(?@panel.rect { top: self.top })', 1, 15],
            ['an optional-access group holding an infix call', '(?@panel.parent attributeOf "id")', 1, 17],
            ['a call whose parenthesis opens the optional-access group that is its argument', '@panel.closest(?@row.key)', 1, 15],
        ])('refuse %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a question mark apart from its dot', '@panel? .size', 1, 7],
            ['an optional access with no name', '@panel?.', 1, 9],
        ])('refuse %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('access by name', () => {
        const optional = node => ({ ...node, optional: true });
        const chain = target => ({ kind: 'optionalChain', target });

        it('reads a bracket as a member access named by the expression it holds, and a string literal that is a name as that name', () => {
            expect(domql.query('@panel[@name]').definition.query).toEqual(member(parameter('name'), parameter('panel')));
            expect(domql.query('@panel["size"]').definition).toEqual(domql.query('@panel.size').definition);
            expect(domql.query('@panel["data-key"]').definition.query).toEqual(member(literal('data-key'), parameter('panel')));
            expect(domql.query('@panel [ @name ]').definition).toEqual(domql.query('@panel[@name]').definition);
        });

        it('read ?.[…] as an optional access by name, and every access by name of an optional-access group as optional', () => {
            expect(domql.query('@panel.parent?.[@name]').definition.query).toEqual(chain(optional(member(parameter('name'), member('parent', parameter('panel'))))));
            expect(domql.query('(?@panel.parent[@name].width)').definition.query).toEqual(chain(optional(member('width', optional(member(parameter('name'), optional(member('parent', parameter('panel')))))))));
        });

        it('are created from a definition as they are parsed from text, a string literal that is a name written as the name', () => {
            const parsed = domql.query('@panel[if @wide then "size" else "clientSize"]?.width');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
            expect(domql.query({ version: 13, query: member(literal('size'), parameter('panel')) }).definition.query).toEqual(member('size', parameter('panel')));
        });

        it.each([
            ['empty brackets', '@panel[]', 1, 8],
            ['an unclosed bracket', '@panel[@name', 1, 13],
            ['a dot before a bracket', '@panel.[@name]', 1, 8],
            ['a bracket after an infix call, which ends its chain', '@panel attributeOf @row[@name]', 1, 24],
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
            expect(domql.query('@panel.parent as "element"').definition.query).toEqual(cast('element', member('parent', parameter('panel'))));
            expect(domql.query('(@panel.parent as "element")?.rect').definition.query).toEqual(chain(optional(member('rect', cast('element', member('parent', parameter('panel')))))));
            expect(domql.query('@panel.parent as "element" attributeOf "id"').definition.query).toEqual(infixCall('attributeOf', literal('id'), cast('element', member('parent', parameter('panel')))));
        });

        it('take a coalescing operator in parentheses, an optional-access group and another cast in a group as targets', () => {
            expect(domql.query('(@a ?? @b) as "element"').definition.query).toEqual(cast('element', { kind: 'coalescing', value: parameter('a'), fallback: parameter('b') }));
            expect(domql.query('(?@node.parent) as "element"').definition.query).toEqual(cast('element', chain(optional(member('parent', parameter('node'))))));
            expect(domql.query('(@a as "node") as "element"').definition.query).toEqual(cast('element', cast('node', parameter('a'))));
        });

        it('stand as the receiver of an optional-access group, their own target\'s accesses optional too', () => {
            expect(domql.query('(?(@panel.parent as "element").rect.width)').definition).toEqual(domql.query('(@panel?.parent as "element")?.rect?.width').definition);
            expect(domql.query('(?((@node.parent as "node") as "element").rect)').definition).toEqual(domql.query('((@node?.parent as "node") as "element")?.rect').definition);
            // `self` and a literal are receivers a grouped cast holds, never keywords that tell a grouped target from a grouped cast.
            expect(domql.query('@panel { w: (?((self.parent as "node") as "element").rect) }').definition).toEqual(domql.query('@panel { w: ((self?.parent as "node") as "element")?.rect }').definition);
            expect(domql.query('(?((null as "node") as "element").rect)').definition).toEqual(domql.query('((null as "node") as "element")?.rect').definition);
        });

        it('stand as the receiver of an optional-access group with a grouped target that keeps its own rules, a coalescing operator or another optional-access group', () => {
            expect(domql.query('(?((@a.x ?? @b.y) as "element").rect.width)').definition).toEqual(domql.query('((@a.x ?? @b.y) as "element")?.rect?.width').definition);
            expect(domql.query('(?((?@a.b) as "element").c)').definition).toEqual(domql.query('(@a?.b as "element")?.c').definition);
            expect(domql.query('(?(((@a ?? @b) as "node") as "element").rect)').definition).toEqual(domql.query('(((@a ?? @b) as "node") as "element")?.rect').definition);
            expect(domql.query('(?((@a ?? @b as "node") as "element").rect)').definition).toEqual(domql.query('((@a ?? @b as "node") as "element")?.rect').definition);
            expect(domql.query('(?((@a as "node" ?? @b) as "element").rect)').definition).toEqual(domql.query('((@a as "node" ?? @b) as "element")?.rect').definition);
        });

        it.each([
            ['a grouped coalescing operator an access follows', '(?((@a ?? @b).x as "element").rect)', 1, 14],
            ['an optional-access group an access follows', '(?((?@a.b).c as "element").d)', 1, 11],
            ['a conditional in parentheses', '(?((if @a then @b else @c) as "element").d)', 1, 4],
            ['a conditional in parentheses whose branch is a cast', '(?((if @a then @b as "node" else @c) as "element").d)', 1, 4],
            ['a coalescing operator that no cast holds', '(?((@a ?? @b)).rect)', 1, 14],
        ])('refuse as the cast an optional-access group receives %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['of a conditional in parentheses', '(if @a then @b else @c) as "element"', 1, 1],
            ['of a chain an object expression continues', '@a { x: 1 } as "element"', 1, 1],
            ['of an optional-access group a chain continues', '(?@a.b).c as "element"', 1, 1],
            ['of a coalescing operator a chain continues', '(@a ?? @b).c as "element"', 1, 1],
            ['to a type that is not quoted', '@a as element', 1, 7],
            ['continued without a group', '@a as "element".rect', 1, 16],
            ['of a cast without a group', '@a as "node" as "element"', 1, 14],
        ])('refuse a cast %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', cast(5, parameter('a')), '/query/type'],
            ['a target that is an infix call', cast('element', infixCall('attributeOf', literal('id'), parameter('a'))), '/query/target'],
        ])('refuse a definition of a cast with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('conversions', () => {
        const conversion = (type, target) => ({ kind: 'conversion', type, target });
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });

        it('read a value, to and the quoted type it converts to, binding looser than an infix call and tighter than an equality, and chaining left to right', () => {
            expect(domql.query('@a to "number"').definition.query).toEqual(conversion('number', parameter('a')));
            expect(domql.query('@panel attributeOf "data-count" to "number"').definition.query).toEqual(conversion('number', infixCall('attributeOf', literal('data-count'), parameter('panel'))));
            expect(domql.query('@a to "string" to "number"').definition.query).toEqual(conversion('number', conversion('string', parameter('a'))));
            expect(domql.query('@panel attributeOf "data-count" to "number" is 5').definition.query).toEqual(equality(conversion('number', infixCall('attributeOf', literal('data-count'), parameter('panel'))), literal(5)));
            expect(domql.query('@a to "number" ?? 0').definition.query).toEqual(coalescing(conversion('number', parameter('a')), literal(0)));
            expect(domql.query('@a ?? @b to "number"').definition.query).toEqual(coalescing(parameter('a'), conversion('number', parameter('b'))));
            expect(domql.query('not @a to "boolean"').definition.query).toEqual(not(conversion('boolean', parameter('a'))));
            expect(domql.query('@a as "element" to "string"').definition.query).toEqual(conversion('string', { kind: 'cast', type: 'element', target: parameter('a') }));
            expect(domql.query('@sentinel intersects to "string"').definition.query).toEqual(conversion('string', infixCall('intersects', undefined, parameter('sentinel'))));
            expect(domql.query('@panel attributeOf to to "number"').definition.query).toEqual(conversion('number', infixCall('attributeOf', { kind: 'local', name: 'to' }, parameter('panel'))));
        });

        it('leave to a name wherever no infix call stands: a field, a local, a property and a call', () => {
            expect(domql.query('{ from: 1, to: 2 }').definition.query.fields.map(field => field.name)).toEqual(['from', 'to']);
            expect(domql.query('@panel { let to: self.size, width: to.width }').definition.query.fields[0].value).toEqual(member('width', { kind: 'local', name: 'to' }));
            expect(domql.query('@range.to').definition.query).toEqual(member('to', parameter('range')));
            expect(domql.query('@range.to()').definition.query).toEqual(call('to', undefined, parameter('range')));
            expect(domql.query('@range { let to: "3", value: to to "number" }').definition.query.fields[0].value).toEqual(conversion('number', { kind: 'local', name: 'to' }));
        });

        it.each([
            ['to a type that is not quoted', '@a to number', 1, 7],
            ['continued without a group', '@a to "number".x', 1, 15],
            ['followed by an object expression', '@a to "number" { x: 1 }', 1, 16],
            ['followed by an infix call', '@a to "number" attributeOf "id"', 1, 16],
            ['cast without a group', '@a to "string" as "element"', 1, 16],
            ['written without the value it converts', 'to "number"', 1, 1],
        ])('refuse a conversion %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', conversion(5, parameter('a')), '/query/type'],
            ['no target', { kind: 'conversion', type: 'number' }, '/query'],
            ['an infix call named to', infixCall('to', literal('number'), parameter('a')), '/query/name'],
        ])('refuse a definition of a conversion with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('convertibilities', () => {
        const convertibility = (type, target) => ({ kind: 'convertibility', type, target });
        const conversion = (type, target) => ({ kind: 'conversion', type, target });

        it('read a value, is convertible to and the quoted type, standing as an equality does and negated with is not', () => {
            expect(domql.query('@a is convertible to "number"').definition.query).toEqual(convertibility('number', parameter('a')));
            expect(domql.query('@a is not convertible to "number"').definition.query).toEqual(not(convertibility('number', parameter('a'))));
            expect(domql.query('@panel attributeOf "data-n" is convertible to "number"').definition.query).toEqual(convertibility('number', infixCall('attributeOf', literal('data-n'), parameter('panel'))));
            expect(domql.query('@a to "string" is convertible to "number"').definition.query).toEqual(convertibility('number', conversion('string', parameter('a'))));
            expect(domql.query('@a is convertible to "number" and @b').definition.query).toEqual({ kind: 'and', operands: [convertibility('number', parameter('a')), parameter('b')] });
            expect(domql.query('not @a is convertible to "number"').definition.query).toEqual(not(convertibility('number', parameter('a'))));
        });

        it('leave convertible a name wherever is convertible to is not written, and a local named so is converted where it is grouped', () => {
            const local = { kind: 'local', name: 'convertible' };

            expect(domql.query('@a is convertible').definition.query).toEqual(equality(parameter('a'), local));
            expect(domql.query('@a is (convertible to "number")').definition.query).toEqual(equality(parameter('a'), conversion('number', local)));
            expect(domql.query('{ convertible: 1 }').definition.query.fields[0].name).toBe('convertible');
            expect(domql.query('@a.convertible').definition.query).toEqual(member('convertible', parameter('a')));
        });

        it.each([
            ['to a type that is not quoted', '@a is convertible to number', 1, 22],
            ['to a type written without a space', '@a is convertible to"number"', 1, 21],
            ['chained', '@a is convertible to "number" is true', 1, 31],
            ['beside ??', '@a is convertible to "number" ?? false', 1, 31],
        ])('refuse a convertibility %s', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a type that is no string', convertibility(5, parameter('a')), '/query/type'],
            ['no target', { kind: 'convertibility', type: 'number' }, '/query'],
        ])('refuse a definition of a convertibility with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('negations', () => {
        it('read not before what it negates, binding looser than an equality and tighter than and and or', () => {
            expect(domql.query('not @a').definition.query).toEqual(not(parameter('a')));
            expect(domql.query('not not @a').definition.query).toEqual(not(not(parameter('a'))));
            expect(domql.query('not @panel.attached').definition.query).toEqual(not(member('attached', parameter('panel'))));
            expect(domql.query('not @a is null').definition.query).toEqual(not(equality(parameter('a'), literal(null))));
            expect(domql.query('not @a and @b').definition.query).toEqual({ kind: 'and', operands: [not(parameter('a')), parameter('b')] });
            expect(domql.query('@a or not @b').definition.query).toEqual({ kind: 'or', operands: [parameter('a'), not(parameter('b'))] });
            expect(domql.query('not (@a or @b)').definition.query).toEqual(not({ kind: 'or', operands: [parameter('a'), parameter('b')] }));
        });

        it('negate a coalescing operator a group holds', () => {
            expect(domql.query('not (@busy ?? false)').definition.query).toEqual(not({ kind: 'coalescing', value: parameter('busy'), fallback: literal(false) }));
        });

        it.each([
            ['beside a coalescing operator it would negate', 'not @busy ?? false', 1, 5],
            ['as the fallback of a coalescing operator', '@busy ?? not @ready', 1, 10],
        ])('refuse not %s, where no group stands', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('not @a and not (@b ?? true)');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });
    });

    describe('coalescing operators', () => {
        const coalescing = (value, fallback) => ({ kind: 'coalescing', value, fallback });

        it('read a value and its fallback, associating to the right', () => {
            expect(domql.query('@a ?? 0').definition.query).toEqual(coalescing(parameter('a'), literal(0)));
            expect(domql.query('@a ?? @b ?? 0').definition.query).toEqual(coalescing(parameter('a'), coalescing(parameter('b'), literal(0))));
            expect(domql.query('(@a ?? @b) ?? 0').definition.query).toEqual(coalescing(coalescing(parameter('a'), parameter('b')), literal(0)));
        });

        it('take an infix call on either side, and stand as a condition, a field and an argument', () => {
            expect(domql.query('@a attributeOf "x" ?? @b attributeOf "x"').definition.query).toEqual(coalescing(infixCall('attributeOf', literal('x'), parameter('a')), infixCall('attributeOf', literal('x'), parameter('b'))));
            expect(domql.query('if @on ?? false then 1 else 2').definition.query.condition).toEqual(coalescing(parameter('on'), literal(false)));
            expect(domql.query('@panel.closest(@a ?? ".row")').definition.query.argument).toEqual(coalescing(parameter('a'), literal('.row')));
        });

        it('stand beside and, or and a predicate expression where a group holds one of them', () => {
            expect(domql.query('(@a ?? false) and @b').definition.query.operands[0]).toEqual(coalescing(parameter('a'), literal(false)));
            expect(domql.query('@a ?? (@b and @c)').definition.query.fallback.kind).toBe('and');
            expect(domql.query('(@a ?? @b).attached').definition.query.target).toEqual(coalescing(parameter('a'), parameter('b')));
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('@a ?? (@b ?? 0)');

            expect(domql.query(parsed.definition).definition).toEqual(parsed.definition);
        });

        it.each([
            ['beside and after them', '@a ?? false and @b', 1, 1],
            ['beside and before them', '@a and @b ?? false', 1, 8],
            ['beside or', '@a or @b ?? false', 1, 7],
            ['beside a null test after them', '@a ?? @b is null', 1, 10],
            ['beside a null test before them', '@a is null ?? false', 1, 12],
            ['with a question mark apart from the other', '@a ? ? 0', 1, 4],
        ])('refuse a coalescing operator %s, where no group stands', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });

        it.each([
            ['a coalescing without its fallback', { kind: 'coalescing', value: parameter('a') }, '/query'],
            ['a coalescing whose fallback is no node', coalescing(parameter('a'), 0), '/query/fallback'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });
    });

    describe('locals', () => {
        const local = name => ({ kind: 'local', name });

        it('read into the object expression that holds them, before its fields, and a bare name as a use of one', () => {
            expect(domql.query('@panel { let items: self.all("[data-key]"), count: items.count }').definition.query).toEqual({
                kind: 'object',
                target: parameter('panel'),
                locals: [{ name: 'items', value: call('all', literal('[data-key]')) }],
                fields: [{ name: 'count', value: member('count', local('items')) }],
            });
        });

        it('stand where a chain input stands, an object expression following one and an infix call taking one', () => {
            const { query } = domql.query('@panel { let key: "data-key", let items: self.children, rows: items { key: self attributeOf key } }').definition;

            expect(query.fields[0].value).toEqual({ kind: 'object', target: local('items'), fields: [{ name: 'key', value: infixCall('attributeOf', local('key')) }] });
        });

        it('are created from a definition as they are parsed from text', () => {
            const parsed = domql.query('@panel { let items: self.children, count: items.count, inner: self { let first: items.at(0), key: first attributeOf "data-key" } }', { panel: document.body });

            expect(domql.query(parsed.definition, { panel: document.body }).definition).toEqual(parsed.definition);
        });

        it('leave out of a definition the locals an object expression has none of', () => {
            const definition = { version: 13, query: { kind: 'object', target: parameter('panel'), locals: [], fields: [{ name: 'size', value: member('size') }] } };

            expect(domql.query('@panel { size: self.size }').definition.query).not.toHaveProperty('locals');
            expect(domql.query(definition, { panel: document.body }).definition.query).not.toHaveProperty('locals');
        });

        it.each([
            ['two locals of one object expression with one name', '@panel { let a: 1, let a: 2, b: a }', 1, 20],
            ['a local reusing the name of one an enclosing object expression has in scope', '@panel { let a: 1, b: self { let a: 2, c: a } }', 1, 30],
        ])('refuse %s, naming where', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('structure');
            expect(error.location).toMatchObject({ line, column });
        });

        it('let object expressions beside one another each name a local alike', () => {
            expect(domql.query('@panel { a: self { let n: 1, v: n }, b: self { let n: 2, v: n } }', { panel: document.body }).evaluate()).toEqual({ a: { v: 1 }, b: { v: 2 } });
        });

        it.each([
            ['a local named by no name', { kind: 'object', target: parameter('panel'), locals: [{ name: 'let', value: literal(1) }], fields: [{ name: 'a', value: literal(1) }] }, '/query/locals/0/name'],
            ['a local without its value', { kind: 'object', target: parameter('panel'), locals: [{ name: 'n' }], fields: [{ name: 'a', value: literal(1) }] }, '/query/locals/0'],
            ['a use of a local named by no name', { kind: 'local', name: 'if' }, '/query/name'],
        ])('refuse a definition with %s', (_, query, pointer) => {
            const error = getError(() => domql.query({ version: 13, query }, { panel: document.body }));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
        });

        it.each([
            ['a member written without its receiver', '@panel { width: rect.width }', "No local named 'rect' is in scope; write 'self.rect' for the member of the current value", 17],
            ['an infix call written without its receiver or argument', '@panel { key: attributeOf }', "No local named 'attributeOf' is in scope; write 'self attributeOf …'", 15],
            ['a call written without its receiver or argument', '@panel { row: closest }', "No local named 'closest' is in scope; write 'self.closest(…)'", 15],
            ['a name that is no member of the current value', '@panel { a: nothing }', "No local named 'nothing' is in scope", 13],
            ['a local used before it is written', '@panel { let a: b, let b: 1, c: a }', "No local named 'b' is in scope", 17],
            ['a local that uses itself', '@panel { let n: n, a: 1 }', "No local named 'n' is in scope", 17],
            ['a local read from the document where an access by name stands', '@panel { let path: self attributeOf "data-path", width: self[path] }', "An access by name reads a name determined when the query is prepared", 62],
            ['a local of an object expression used beside it', '@panel { a: self { let n: 1, v: n }, b: n }', "No local named 'n' is in scope", 41],
            ['a name at the top level', 'items.count', "No local named 'items' is in scope", 1],
            ['an options object holding a local', '@sentinel intersects { let m: 200, root: @panel, margin: m }', "'intersects' takes its arguments as the fields of an object, whose fields are its parameters, so it holds no locals", 24],
        ])('refuse %s in resolution, naming where', (_, text, message, column) => {
            const error = getError(() => domql.query(text, { panel: document.body, sentinel: document.body }).evaluate());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
            expect(error.location).toMatchObject({ line: 1, column });
        });

        it('suggest no member a name has where there is no current value', () => {
            expect(getError(() => domql.query('rect.width').evaluate()).message).not.toContain('write');
        });
    });

    describe('syntax', () => {
        it.each([
            ['two fields with no comma between them', '@panel {\n    size: self.size\n    clientSize: self.clientSize\n}', 3, 5],
            ['a call with no receiver', '@panel { row: first(".row") }', 1, 15],
            ['an infix call with no receiver', '@panel { id: attributeOf "id" }', 1, 14],
            ['a null test with no subject', '@panel { open: is null }', 1, 16],
            ['a null test with no subject at the top level', 'is null', 1, 1],
            ['arguments after a dot without parentheses', '@sentinel.intersects @panel', 1, 22],
            ['a call given two arguments', '@panel.closest(".a", ".b")', 1, 20],
            ['a call given a named argument', '@panel.rectRelativeTo(relativeTo: @other)', 1, 23],
            ['an infix call with no separator before its argument', '@panel attributeOf"id"', 1, 19],
            ['an infix call with no separator after its receiver', '@panel.first(".row")attributeOf "id"', 1, 21],
            ['an infix call continued by a dot', '@panel attributeOf "id" .length', 1, 25],
            ['an infix call followed by an object expression', '@panel on "click" { x: self.clientX }', 1, 19],
            ['an infix call given two arguments', '@panel intersects @container 200', 1, 30],
            ['self named as a field', '@panel { self: self.size }', 1, 10],
            ['self named as a parameter', '@self.size', 1, 2],
            ['is written as a member', '@target.is "attached"', 1, 9],
            ['an equality that chains', '@a is @b is @c', 1, 10],
            ['is not followed by a negation', '@a is not not @b', 1, 11],
            ['a group never closed', '(@first or @second', 1, 19],
            ['a group closing nothing', '@first)', 1, 7],
            ['an operator naming a field', '@panel { is: self.size }', 1, 10],
            ['an operator naming a parameter', '@and { size: self.size }', 1, 2],
            ['a hyphen in a member\'s name', '@panel.attribute-of', 1, 17],
            ['a hyphen in a parameter\'s name', '@my-panel { size: self.size }', 1, 4],
            ['a hyphen in a field\'s name', '@panel { is-open: self.size }', 1, 12],
            ['a hyphen before a digit in a name', '@panel.size-1', 1, 12],
            ['a hyphen ending a name', '@panel.size- ', 1, 12],
            ['an escape other than \\" or \\\\', '@target attributeOf "a\\n"', 1, 23],
            ['a string never closed', '@target attributeOf "id', 1, 21],
            ['a character outside the language', '@target.size + 1', 1, 14],
            ['a parameter with no name', '@ { size: self.size }', 1, 2],
            ['a space between a parameter\'s @ and its name', '@ panel', 1, 2],
            ['a comment between a parameter\'s @ and its name', '@/* the panel */panel', 1, 2],
            ['a field without a name', '@panel { self.size }', 1, 10],
            ['a field without a name after a named one', '@panel { width: self.size.width, self.rect }', 1, 34],
            ['an object expression without a field', '@panel {}', 1, 9],
            ['a query that ends too soon', '@panel {', 1, 9],
            ['a reserved literal naming a field', '@panel { null: self.size }', 1, 10],
            ['a block comment never closed', '@panel { size: self.size /* the size', 1, 26],
            ['a single slash', '@panel.size / 2', 1, 13],
            ['a # comment, which DOMQL has none of', '# A panel.\n@panel { size: self.size }', 1, 1],
            ['a reserved literal naming a parameter', '@false { size: self.size }', 1, 2],
            ['a conditional without then', 'if @wide "a" else "b"', 1, 10],
            ['a conditional without else', 'if @wide then "a"', 1, 18],
            ['a conditional that is an operand without parentheses', '@a and if @b then true else false', 1, 8],
            ['a keyword of the conditional naming a field', '@panel { then: self.size }', 1, 10],
            ['a keyword of the conditional naming a member', '@panel.else', 1, 8],
            ['a conditional that is a condition without parentheses', 'if if @a then @b else @c then 1 else 2', 1, 4],
            ['let naming a field', '@panel { let: self.size }', 1, 10],
            ['a keyword naming a local', '@panel { let if: self.size, a: 1 }', 1, 14],
            ['a local after a field', '@panel { a: self.size, let r: self.rect }', 1, 24],
            ['a local without its comma', '@panel { let r: self.rect width: r.width }', 1, 27],
            ['an object expression of locals alone', '@panel { let r: self.rect, }', 1, 28],
            ['a local given an argument', '@panel { let r: self.rect, a: r "x" }', 1, 31],
        ])('rejects %s, naming where', (_, text, line, column) => {
            const error = getError(() => domql.query(text));

            expect(error.name).toBe('DomqlError');
            expect(error.kind).toBe('syntax');
            expect(error.location).toMatchObject({ line, column });
        });
    });

    describe('structure', () => {
        it.each([
            ['two fields named alike', '@target { width: self.rect.width, width: self.size.width }', '/query/fields/1'],
            ['two fields of an options object named alike', '@sentinel intersects { root: @panel, root: @other }', '/query/argument/fields/1'],
            ['self at the top level', 'self.rect.width', '/query/target/target'],
            ['self in a field of a top-level object expression', '{ width: self.rect.width }', '/query/fields/0/value/target/target'],
        ])('rejects %s, naming where', (_, text, pointer) => {
            const error = getError(() => domql.query(text));

            expect(error.kind).toBe('structure');
            expect(error.location.pointer).toBe(pointer);
            expect(error.location.line).toBe(1);
        });

        it('keeps a reserved word inside a string as an ordinary string', () => {
            expect(domql.query('@target attributeOf "null"').definition.query.argument).toEqual(literal('null'));
        });

        it('accepts a field continuing past an access by a bound name', () => {
            expect(domql.query('@target { width: self[@name]?.width }').definition.query.fields).toHaveLength(1);
        });

        it('accepts a member at the start of an argument, whose current value its member decides', () => {
            expect(() => domql.query('@list.all("li").where(self intersects { root: @list }).count')).not.toThrow();
        });

        it('locates a failure on the line it is written on', () => {
            const error = getError(() => domql.query('@target {\n    width: self.rect.width,\n    width: self.size.width\n}'));

            expect(error.location).toMatchObject({ pointer: '/query/fields/1', line: 3, column: 5 });
        });
    });

    describe('query from a definition', () => {
        it('creates the query its text parses into', () => {
            const parsed = domql.query('@panel { size: self.size, hasFocus: self matches ":focus-within" }', { panel: 1 });
            const created = domql.query(parsed.definition, { panel: 2 });

            expect(created.definition).toEqual(parsed.definition);
            expect(DomqlQuery.bindingsOf(created).get('panel')).toBe(2);
        });

        it('copies and freezes the definition it is given', () => {
            const definition = { version: 13, query: { kind: 'object', target: parameter('panel'), fields: [{ name: 'size', value: member('size') }] } };
            const query = domql.query(definition);

            definition.query.fields.push({ name: 'clientSize', value: member('clientSize') });

            expect(query.definition.query.fields).toHaveLength(1);
            expect(Object.isFrozen(query.definition.query)).toBe(true);
        });

        it.each([
            ['a version other than 11', { version: 10, query: parameter('panel') }, '/version'],
            ['a field without a name', { version: 13, query: { kind: 'object', target: parameter('panel'), fields: [{ value: member('size') }] } }, '/query/fields/0'],
            ['an object expression without a field', { version: 13, query: { kind: 'object', target: parameter('panel'), fields: [] } }, '/query'],
            ['a property no part has', { version: 13, query: { ...parameter('panel'), extra: true } }, '/query'],
            ['an unknown kind', { version: 13, query: { kind: 'phrase', name: 'size' } }, '/query'],
            ['a member without a receiver', { version: 13, query: { kind: 'member', name: 'size' } }, '/query'],
            ['a call without a receiver', { version: 13, query: { kind: 'call', name: 'closest' } }, '/query'],
            ['a member access holding an argument', { version: 13, query: { kind: 'member', target: parameter('panel'), name: 'size', argument: literal(1) } }, '/query'],
            ['a member holding the arguments of an earlier version', { version: 13, query: { kind: 'member', target: parameter('panel'), name: 'size', arguments: [] } }, '/query'],
            ['self at the top level', { version: 13, query: member('size', self) }, '/query/target'],
            ['a name that is no name', { version: 13, query: parameter('2panel') }, '/query/name'],
            ['a name ending in a hyphen', { version: 13, query: parameter('panel-') }, '/query/name'],
            ['a reserved literal naming a parameter', { version: 13, query: parameter('null') }, '/query/name'],
            ['a reserved literal naming a member', { version: 13, query: member('true', parameter('panel')) }, '/query/name'],
            ['self naming a member', { version: 13, query: member('self', parameter('panel')) }, '/query/name'],
            ['a reserved literal naming a field', { version: 13, query: { kind: 'object', target: parameter('panel'), fields: [{ name: 'false', value: member('size') }] } }, '/query/fields/0/name'],
            ['a literal that is no JSON scalar', { version: 13, query: literal(Number.NaN) }, '/query/value'],
            ['an object expression whose fields are no array', { version: 13, query: { kind: 'object', target: parameter('panel'), fields: {} } }, '/query/fields'],
        ])('rejects %s, naming its node', (_, definition, pointer) => {
            const error = getError(() => domql.query(definition));

            expect(error.kind).toBe('structure');
            expect(error.location).toEqual({ pointer });
        });
    });

    describe('bindings', () => {
        it('looks a binding up by the exact name', () => {
            const element = document.createElement('div');
            const query = domql.query('@panel { size: self.size }', { panel: element, Panel: 2 });

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
            const bindings = DomqlQuery.bindingsOf(domql.query('@target', { target: value() }));

            expect(bindings.getType('target').toString()).toBe(type);
        });

        it('reads a bound object field by field, a field named __proto__ as an ordinary field of its own', () => {
            const row = JSON.parse('{ "__proto__": { "polluted": true }, "id": "a", "tags": ["x", "y"] }');
            const result = domql.query('@row', { row }).evaluate();

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
            const watch = domql.query('{ row: @row, title: @panel attributeOf "title" }', { row, panel }).watch({ updateStrategy, schedule: 'immediate' });
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
            ['a field', '@panel { a: self attributeOf "id" }', /"name":"a"/g],
            ['a local', '@panel { let k: self attributeOf "id", a: k }', /"name":"k"/g],
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
            const error = getError(() => domql.query('@target', { target: value }));

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
            const error = getError(() => domql.query('@target', { target: value }));

            expect(error).toBeInstanceOf(DomqlError);
            expect(error.kind).toBe('structure');
            expect(error.location).toEqual({ binding: 'target' });
        });

        it('types a binding again from its value in a query of its definition', () => {
            const parsed = domql.query('@target { size: self.size }', { target: null });
            const created = domql.query(parsed.definition, { target: document.createElement('div') });

            expect(DomqlQuery.bindingsOf(parsed).getType('target').toString()).toBe('null');
            expect(DomqlQuery.bindingsOf(created).getType('target').toString()).toBe('element');
        });

        it('types a binding that holds a node by its kind', () => {
            const host = document.createElement('div');
            const bindings = DomqlQuery.bindingsOf(domql.query('@a.children.count', { a: host, b: document, c: document.createDocumentFragment(), d: host.attachShadow({ mode: 'open' }) }));

            expect(['a', 'b', 'c', 'd'].map(name => bindings.getType(name).toString())).toEqual(['element', 'document', 'documentFragment', 'shadowRoot']);
        });

        it('refuses a binding of a node of another kind, such as text', () => {
            expect(getError(() => domql.query('@a', { a: document.createTextNode('a') })).location).toEqual({ binding: 'a' });
        });

        it('treats a root or a reserved literal in another case as an ordinary name', () => {
            expect(() => domql.query('@Window { size: self.size }', { Window: 1, Document: 2, Null: 3 })).not.toThrow();
        });

        it('binds data: numbers, strings, Booleans, null, lists and objects', () => {
            const configuration = { modifier: 'shift', steps: [1, 2], wrap: true };

            expect(DomqlQuery.bindingsOf(domql.query('@target { size: self.size }', { target: configuration })).get('target')).toBe(configuration);
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
            expect(getError(() => domql.query('@target { size: self.size }', bindings)).kind).toBe('structure');
        });

        it.each([
            ['a list', []],
            ['a map, whose entries are no properties', new Map([['target', 1]])],
        ])('rejects bindings given as %s', (_, bindings) => {
            expect(getError(() => domql.query('@target { size: self.size }', bindings)).kind).toBe('structure');
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
            expect(domql.query('@window.devicePixelRatio').evaluate({ window: { document, devicePixelRatio: 3 } })).toBe(3);
            expect(domql.query('@window.devicePixelRatio').evaluate()).toBe(window.devicePixelRatio);
        });

        it('is made through the cache of parsed texts', () => {
            const text = '@panel.children.count';
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
            expect(getError(() => domql.query('@panel {', { panel })).kind).toBe('syntax');
            expect(getError(() => domql.query('@window.size', null)).kind).toBe('structure');
        });

        it('is evaluated once waiting, and watched, as a query is', async () => {
            expect(await domql.query('@panel.children.count', { panel }).evaluateAsync()).toBe(3);

            const counts = [];
            const watch = domql.query('@panel.children.count', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', (_sender, args) => counts.push(args.value));
            await watch.refreshAsync();
            watch.dispose();

            expect(counts).toEqual([3]);
        });

        it('is resolved with its options', () => {
            expect(domql.query('@window.size').resolve().type.toString()).toBe('size');
            expect(getError(() => domql.query('@panel matches ":hover"', { panel }).resolve({ watch: true })).kind).toBe('validation');
            expect(domql.query('@panel matches ":hover"', { panel }).resolve({ watch: true, acceptPartialObservation: true }).kind).toBe('query');
        });
    });

    describe('a request of another kind', () => {
        const subscription = () => domql.query('(@panel on "click") { button: self.button }', { panel });

        it('is refused with a validation error by the operation that does not carry it out, saying what the request does and the operations it takes', () => {
            expect(getError(() => subscription().evaluate())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot evaluate '(@panel on \"click\") { button: self.button }': it listens to events.\nUse subscribe()."), location: { pointer: '/query', line: 1 } });
            expect(getError(() => subscription().watch())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot watch '(@panel on \"click\") { button: self.button }': it listens to events.\nUse subscribe().") });
            expect(getError(() => domql.query('@panel.children.count', { panel }).subscribe(() => {}))).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot subscribe to '@panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") });
        });

        it('is refused by a waiting evaluation, which rejects with the validation error', async () => {
            await expect(subscription().evaluateAsync()).rejects.toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("Cannot evaluate '(@panel on \"click\") { button: self.button }': it listens to events.") }));
        });

        it('is refused after resolution and before anything needs a window', () => {
            expect(getError(() => subscription().evaluate({ window: null })).kind).toBe('validation');
            expect(getError(() => domql.query('@panel.nonsense', { panel }).evaluate({ window: null })).kind).toBe('validation');
        });
    });

    describe('the environment', () => {
        it('is reported when there is no browser window', () => {
            const query = domql.query('@window.devicePixelRatio');
            const error = getError(() => query.evaluate({ window: null }));

            expect(error).toBeInstanceOf(DomqlError);
            expect(error.kind).toBe('evaluation');
            expect(error.message).toContain('without a browser window');
            expect(getError(() => query.evaluate({ window: {} })).kind).toBe('evaluation');
        });

        it('leaves parsing and resolving to work without one', () => {
            expect(domql.query('@window.size').resolve().type.toString()).toBe('size');
        });
    });

    describe('resolution', () => {
        it('is kept for a query and used by every evaluation of it', () => {
            const query = domql.query('@panel.children.count', { panel });

            expect(query.resolve()).toBe(query.resolve());
            expect(query.evaluate()).toBe(3);

            panel.append(document.createElement('i'));

            expect(query.evaluate()).toBe(4);
        });

        it('is made again for other options, and for bindings of other types or other selecting values', () => {
            const query = domql.query('@panel?.size', { panel });
            const before = query.resolve();

            expect(query.resolve({ watch: true })).not.toBe(before);
            expect(domql.query('@panel?.size', { panel: null }).resolve()).not.toBe(before);
            expect(domql.query('(@panel on @type) { button: self.button }', { panel, type: 'click' }).resolve()).not.toBe(domql.query('(@panel on @type) { button: self.button }', { panel, type: 'pointerdown' }).resolve());
        });

        it('is shared by the queries of one definition whose bindings have the same types', () => {
            const other = document.createElement('div');

            expect(domql.query('@panel.size', { panel: other }).resolve()).toBe(domql.query('@panel.size', { panel }).resolve());
        });

        it('evaluates each query that shares it against its own bindings, interleaved, its locals and branches its own', () => {
            const text = '@panel { let id: self attributeOf "id", id: id, kind: if id is "first" then "one" else "other", count: self.children.count }';
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
            const query = domql.query('@panel.nonsense', { panel });

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
            const answer = isolated.query('@panel.level', { panel }).evaluateAsync();

            await settle();
            observations[0].deliver(7);

            await expect(answer).resolves.toBe(7);
            expect(observations.length).toBe(1);
            expect(observations[0].isStopped).toBe(true);
        });

        it('keeps one observation for a watch across its evaluations, and stops it when the watch ends', async () => {
            const observations = registerLevel();
            const panel = document.createElement('div');
            const watch = isolated.query('@panel.level', { panel }).watch({ schedule: 'immediate' });

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
            const first = isolated.query('@panel.level', { panel }).watch({ schedule: 'immediate' });
            const second = isolated.query('@panel.level', { panel }).watch({ schedule: 'immediate' });

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

            const listener = isolated.query('(@panel on "input") { level: @panel.level }', { panel }).subscribe((_sender, args) => values.push(args.value));

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

            await expect(isolated.query('@panel.level', { panel: document.createElement('div') }).evaluateAsync()).resolves.toBe(9);
        });

        it('fails the evaluation, naming its observation type, where it is no { pending, value }', async () => {
            registerLevel([4]);

            await expect(isolated.query('@panel.level', { panel: document.createElement('div') }).evaluateAsync()).rejects.toThrow("The observation type 'level' answered the sample 4, which is no { pending, value }");
        });

        it('fails the evaluation where it is not pending and holds no value', async () => {
            registerLevel([{ pending: false }]);

            await expect(isolated.query('@panel.level', { panel: document.createElement('div') }).evaluateAsync()).rejects.toThrow('which is no { pending, value } with a value once it is not pending');
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

            expect(isolated.query('@panel.pair', { panel }).evaluate()).toEqual({ a: 1, b: 2 });
        });

        it('reads its declared fields as an instance of a class offers them, through getters', () => {
            class Pair {
                get a() { return 1; }

                get b() { return 2; }
            }

            registerPair(() => new Pair());

            expect(isolated.query('@panel.pair', { panel }).evaluate()).toEqual({ a: 1, b: 2 });
            expect(isolated.query('@panel.pair { sum: self.a }', { panel }).evaluate()).toEqual({ sum: 1 });
        });

        it('is copied as its declared shape at every depth, in its fields and in the items of a list', () => {
            registerPair(() => ({ from: { a: 1, b: 2, x: 0 }, to: null, marks: [{ a: 3, b: 4, y: 0 }] }), 'span');

            expect(isolated.query('@panel.pair', { panel }).evaluate()).toEqual({ from: { a: 1, b: 2 }, to: null, marks: [{ a: 3, b: 4 }] });
        });

        it('holds its own type as deep as its value goes', () => {
            registerPair(() => ({ value: 1, next: { value: 2, next: null, extra: true } }), 'link');

            expect(isolated.query('@panel.pair', { panel }).evaluate()).toEqual({ value: 1, next: { value: 2, next: null } });
        });

        it('still fails where a declared field is missing or of another type', () => {
            registerPair(() => ({ a: 1 }));

            expect(getError(() => isolated.query('@panel.pair', { panel }).evaluate()).message).toContain("The member 'pair' answered {\"a\":1}, and it declares pair");
        });
    });

    it('copy an action\'s structured result by its declared fields', async () => {
        isolated.registerModule(isolated.createModule('measure', {
            types: [{ name: 'measurement', fields: { width: 'number' } }],
            members: [{ name: 'measure', function: 'measure', kind: 'action', on: 'element', parameters: [], result: 'measurement', changes: 'unobserved', reads: 'fresh' }],
        }, { measure: async () => ({ width: 5, raw: { internal: true } }) }));

        await expect(isolated.query('@panel.measure()', { panel: document.createElement('div') }).executeAsync()).resolves.toEqual({ width: 5 });
    });

    it('name a promise and an instance of a class that a member answers for a type that admits neither', () => {
        class Reading {}

        const constant = (name, implementation) => isolated.createModule(name, {
            members: [{ name, function: name, kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { [name]: implementation });

        isolated.registerModule(constant('reading', () => new Reading()));
        isolated.registerModule(constant('later', () => Promise.resolve(1)));

        const panel = document.createElement('div');

        expect(getError(() => isolated.query('@panel.reading', { panel }).evaluate()).message).toContain("The member 'reading' answered an instance of Reading, and it declares number");
        expect(getError(() => isolated.query('@panel.later', { panel }).evaluate()).message).toContain("The member 'later' answered a promise, and it declares number");
    });

    it('take the one parameter of an options input as the field of an object', () => {
        isolated.registerModule(isolated.createModule('zoom', {
            members: [{ name: 'zoom', function: 'zoom', kind: 'operation', on: 'element', input: 'options', parameters: [{ name: 'factor', kind: 'value', type: 'number', required: true, fixed: false, nulls: 'propagate' }], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { zoom: (_receiver, args) => args.factor * 2 }));

        const panel = document.createElement('div');

        expect(isolated.query('@panel.zoom({ factor: 3 })', { panel }).evaluate()).toBe(6);
        expect(getError(() => isolated.query('@panel.zoom(3)', { panel }).resolve()).kind).toBe('validation');
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

        const error = getError(() => isolated.query('@panel.all("[data-key]") {\n    key: self attributeOf "data-key",\n    weight: self.weight\n}', { panel: document.getElementById('panel') }).evaluate());

        expect(error.kind).toBe('evaluation');
        expect(error.location).toEqual({ pointer: '/query/fields/1/value', offset: 77, line: 3, column: 13 });
        document.body.innerHTML = '';
    });

    it('make the members they declare available to the queries resolved afterwards', () => {
        const element = document.createElement('div');

        expect(getError(() => isolated.query('@panel.zoom', { panel: element }).resolve()).kind).toBe('validation');

        isolated.registerModule(module('zoom'));

        expect(isolated.query('@panel.zoom', { panel: element }).resolve().type.toString()).toBe('number');
    });

    it('replace the resolutions made against the vocabulary before them', () => {
        const query = isolated.query('@panel.children.count', { panel: document.createElement('div') });
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

        expect(getError(() => domql.query('@panel.zoom', { panel: document.createElement('div') }).resolve()).kind).toBe('validation');
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
        const query = other.query('@panel.children.count', { panel });
        const message = expect.stringContaining('as domql.query(query.definition, bindings)');

        expect(getError(() => domql.query(query))).toMatchObject({ kind: 'structure', message });
        expect(getError(() => domql.query(query, { panel }))).toMatchObject({ kind: 'structure', message });
        expect(getError(() => domql.query(other.query('(@panel on "click") { button: self.button }', { panel })))).toMatchObject({ kind: 'structure', message });
    });

    it('reuse a query from its definition and a plain object of bindings, resolved against their own vocabulary', () => {
        other.registerModule(other.createModule('zoom', {
            members: [{ name: 'zoom', function: 'zoom', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
        }, { zoom: () => 7 }));

        const count = other.query('@panel.children.count', { panel });
        const zoom = other.query('@panel.zoom', { panel });

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
        const query = isolated.query('@panel { count: self.children.count, id: self attributeOf "id" }', { panel });

        expect(await query.evaluateAsync()).toEqual(query.evaluate());
        expect(Object.isFrozen(await query.evaluateAsync())).toBe(true);
    });

    it('waits for the first sample of a maintained member, and evaluate does not', async () => {
        const query = isolated.query('@item.level', { item: panel.children[0] });
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
        const query = isolated.query('@panel.children.at(@first.level)?.level', { panel, first });
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
        const query = isolated.query('{ a: @a.level, b: @b.level }', { a: panel.children[0], b: panel.children[1] });
        const evaluation = query.evaluateAsync();

        await settle();
        sample(panel.children[0], 1);
        sample(panel.children[1], 2);

        expect(await evaluation).toEqual({ a: 1, b: 2 });
        expect([...gauges.values()].map(gauge => [gauge.started, gauge.stopped])).toEqual([[1, 1], [1, 1]]);
    });

    it('is canceled by its signal, fails with its reason and lets go of what it started', async () => {
        const controller = new AbortController();
        const evaluation = isolated.query('@item.level', { item: panel.children[0] }).evaluateAsync({ signal: controller.signal });
        const failure = evaluation.catch(error => error);

        await settle();
        controller.abort(new Error('not needed'));

        expect((await failure).message).toBe('not needed');
        expect(gauges.get(panel.children[0]).stopped).toBe(1);
    });

    it('fails at once for a signal that is already aborted, starting nothing', async () => {
        const controller = new AbortController();

        controller.abort();

        await expect(isolated.query('@item.level', { item: panel.children[0] }).evaluateAsync({ signal: controller.signal })).rejects.toThrow();
        expect(gauges.size).toBe(0);
    });

    it('fails with the error of an evaluation and lets go of what it started', async () => {
        const item = panel.children[0];
        const failure = isolated.query('{ a: @item.level, b: @item.boom }', { item }).evaluateAsync().catch(error => error);

        await settle();
        sample(item, 1);

        const error = await failure;

        expect(error.name).toBe('DomqlError');
        expect(error.message).toContain("The member 'boom' failed");
        expect(gauges.get(item).stopped).toBe(1);
    });

    it('fails without a browser window', async () => {
        const error = await isolated.query('@window.devicePixelRatio').evaluateAsync({ window: null }).catch(failure => failure);

        expect(error.name).toBe('DomqlError');
        expect(error.kind).toBe('evaluation');
    });

    describe('cleanup that fails', () => {
        it('is reported, and keeps the result of an evaluation that succeeded', async () => {
            const [first, second] = panel.children;
            const evaluation = isolated.query('{ a: @a.level, b: @b.level }', { a: first, b: second }).evaluateAsync();

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
            const failure = isolated.query('{ a: @item.level, b: @item.boom }', { item }).evaluateAsync().catch(error => error);

            stuck.add(item);
            await settle();
            sample(item, 1);

            expect((await failure).message).toContain("The member 'boom' failed");
            expect(reported.map(error => error.message)).toEqual(['stuck']);
        });

        it("is reported, and leaves a canceled evaluation failing with the signal's reason", async () => {
            const controller = new AbortController();
            const item = panel.children[0];
            const failure = isolated.query('@item.level', { item }).evaluateAsync({ signal: controller.signal }).catch(error => error);

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
        expect(await isolated.query('@panel.mark(@label)', { panel, label: 'seen' }).executeAsync()).toBe(true);
        expect(await isolated.query('@panel.mark("seen")', { panel }).executeAsync()).toBe(false);
        expect(panel.dataset.mark).toBe('seen');
        expect(runs.map(run => run.label)).toEqual(['seen', 'seen']);
    });

    it('waits for a result the action promises, and gives the action a signal even where the caller gave none', async () => {
        const running = isolated.query('@panel.slow()', { panel }).executeAsync();

        await Promise.resolve();
        pending.resolve(true);

        expect(await running).toBe(true);
        expect(runs[0].signal).toBeInstanceOf(AbortSignal);
        expect(runs[0].signal.aborted).toBe(false);
    });

    it('shapes the result by the object expression that follows the action, as immutable data', async () => {
        const result = await isolated.query('@panel.pick() { id: self attributeOf "id" }', { panel }).executeAsync();

        expect(result).toEqual({ id: 'first' });
        expect(Object.isFrozen(result)).toBe(true);
    });

    it('executes nothing where the receiver is null, and answers null', async () => {
        expect(await isolated.query('@item?.mark("seen")', { item: null }).executeAsync()).toBeNull();
        expect(runs).toEqual([]);
    });

    it('rejects a result of another type than the action declares, naming the action', async () => {
        await expect(isolated.query('@panel.wrong()', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', message: expect.stringContaining("The action 'wrong' answered \"yes\", and it declares boolean") }));
    });

    it('rejects a failure of the action with what it threw as the cause, and leaves what it changed', async () => {
        const error = await isolated.query('@panel.broken()', { panel }).executeAsync().catch(failure => failure);

        expect(error).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The action 'broken' failed: jammed") });
        expect(error.cause.message).toBe('jammed');
        expect(panel.dataset.state).toBe('half');
        expect(reported).toEqual([]);
    });

    it('rejects a failure the action promises, whatever it is', async () => {
        const running = isolated.query('@panel.slow()', { panel }).executeAsync().catch(failure => failure);

        await Promise.resolve();
        pending.reject(null);

        const error = await running;

        expect(error).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The action 'slow' failed: null") });
        expect(error.cause).toBeNull();
    });

    it('rejects with the reason of a signal already aborted, and executes nothing', async () => {
        const controller = new AbortController();

        controller.abort(new Error('not now'));

        await expect(isolated.query('@panel.mark("seen")', { panel }).executeAsync({ signal: controller.signal })).rejects.toThrow('not now');
        expect(runs).toEqual([]);
    });

    it('rejects at once with the reason of a signal that aborts while the action runs, which learns of it, and discards its result', async () => {
        const controller = new AbortController();
        const running = isolated.query('@panel.slow()', { panel }).executeAsync({ signal: controller.signal }).catch(failure => failure);

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
        const running = isolated.query('@panel.slow()', { panel }).executeAsync({ signal: controller.signal }).catch(failure => failure);

        await Promise.resolve();
        controller.abort(new Error('stop'));
        await running;
        pending.reject(new Error('late'));
        await new Promise(resolve => setTimeout(resolve));

        expect(reported).toHaveLength(1);
        expect(reported[0]).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The action 'slow' failed: late") });
    });

    it('is refused for a request of another kind, and an action request is refused by the other operations', async () => {
        await expect(isolated.query('@panel.children.count', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("Cannot execute '@panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") }));
        expect(getError(() => isolated.query('@panel.mark("seen")', { panel }).evaluate())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot evaluate '@panel.mark(\"seen\")': it executes an effect.\nUse executeAsync().") });
        expect(runs).toEqual([]);
    });

    it('rejects where its receiver or arguments cannot be evaluated, and executes nothing', async () => {
        await expect(isolated.query('@panel.first("[")?.mark("seen")', { panel }).executeAsync()).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', message: expect.stringContaining("The member 'first' failed") }));
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
        expect(isolated.query('@panel?.size', { panel: null }).evaluate()).toBeNull();
        expect(isolated.query('@panel?.size', { panel: null }).resolve().type.toString()).toBe('size?');
        expect(isolated.query('@panel?.children.count', { panel: null }).resolve().type.toString()).toBe('number?');
    });

    it('answer null for an object expression following a null binding, its fields resolved against no value', () => {
        expect(isolated.query('{ panel: @panel { size: self.size, key: self attributeOf "data-key" }, ids: @ids }', { panel: null, ids: [] }).evaluate()).toEqual({ panel: null, ids: [] });
        expect(isolated.query('@panel { size: self.size }', { panel: null }).resolve().type.toString()).toBe('{ size: size? }?');
    });

    it.each([
        ['a call no declaration has', '@panel?.sise()', 'no member of the vocabulary'],
        ['a name in a form none of its declarations takes', '@panel?.size()', 'is a property'],
        ['an argument none of its declarations takes', '@panel attributeOf 5', "expects string and finds number"],
        ['a misspelled call in the object expression that follows', '@panel { size: self.sise() }', 'no member of the vocabulary'],
        ['an infix call no declaration has, as has is', '@panel has "selection"', 'no member of the vocabulary'],
    ])('refuse %s', (_, text, message) => {
        const error = getError(() => isolated.query(text, { panel: null }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain(message);
    });

    it('read a Boolean member of a null binding as null, as any access by name of one is', () => {
        expect(isolated.query('@panel?.attached', { panel: null }).evaluate()).toBeNull();
        expect(isolated.query('@panel?.[@name]', { panel: null, name: 'size' }).evaluate()).toBeNull();
        expect(isolated.query('@row?.["id"]', { row: null }).evaluate()).toBeNull();
    });

    it('accept a member of the items of an empty list where a Boolean that cannot be null stands, checked once the items are known', () => {
        const rows = isolated.query('@rows { done: not self.complete }', { rows: [] });

        expect(rows.evaluate()).toEqual([]);
        expect(isolated.query(rows.definition, { rows: [{ complete: true }] }).evaluate()).toEqual([{ done: false }]);
        expect(getError(() => isolated.query(rows.definition, { rows: [{ complete: 'yes' }] }).resolve()).message).toContain("What 'not' negates is a Boolean, and this one is string");
        expect(getError(() => isolated.query('not @off', { off: null }).resolve()).message).toContain('cannot be null');
    });

    it('type a member of the items of an empty list as its declarations share it, unchanged, as a list of known items does', () => {
        const panel = document.createElement('div');

        const rows = isolated.query('@rows { c: self.children.count }', { rows: [] });

        expect(rows.resolve().type.toString()).toBe('list<{ c: number }>');
        expect(isolated.query(rows.definition, { rows: [panel] }).evaluate()).toEqual([{ c: 0 }]);
        expect(isolated.query('@rows { w: self.rect?.width }', { rows: [] }).resolve().type.toString()).toBe('list<{ w: number? }>');
        expect(getError(() => isolated.query('@rows { c: self.children.sise }', { rows: [] }).resolve()).message).toContain("'sise' is no member of the vocabulary");
        expect(isolated.query('@panel.children { c: self.children.count }', { panel }).resolve().type.toString()).toBe('list<{ c: number }>');
    });

    it('accept any property of data that has not arrived, the empty rows projected to the empty list', () => {
        const rows = isolated.query('@rows { id: self.id }', { rows: [] });

        expect(rows.evaluate()).toEqual([]);
        expect(isolated.query(rows.definition, { rows: [{ id: 'a' }] }).evaluate()).toEqual([{ id: 'a' }]);
        expect(isolated.query('@row?.id', { row: null }).evaluate()).toBeNull();
        expect(isolated.query('@row { id: self.id }', { row: null }).evaluate()).toBeNull();
    });

    it('check a property once the type of its receiver is known, a nullable one included', () => {
        const row = isolated.query('@row?.id', { row: null });
        const panel = isolated.query('@panel?.sise', { panel: null });

        expect(row.evaluate()).toBeNull();
        expect(getError(() => isolated.query(row.definition, { row: { key: 'a' } }).resolve()).kind).toBe('validation');
        expect(panel.evaluate()).toBeNull();
        expect(getError(() => isolated.query(panel.definition, { panel: document.getElementById('panel') }).resolve()).message).toContain('sise');
        expect(getError(() => isolated.query('@panel.parent?.sise', { panel: document.getElementById('panel') }).resolve()).message).toContain('sise');
    });

    it('keep the request kind of the name, so a subscription of a null binding listens to nothing and is refused an evaluation', () => {
        const text = '(@panel on "click") { button: self.button }';
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

        const behavior = isolated.query('@item?.mark()', { item: null }).apply();

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

        const applied = isolated.query('@item?.mark()', { item: null }).apply();

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

        const error = getError(() => isolated.query('@thing?.ping()', { thing: null }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain('ambiguous');
        expect(isolated.query('@thing.ping()', { thing: panel }).resolve().kind).toBe('action');
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

        const query = isolated.query('(@thing as "element")?.ping()', { thing: null });

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

        expect(isolated.query('@ids.count', { ids: [] }).evaluate()).toBe(0);
        expect(isolated.query('@ids.first', { ids: [] }).evaluate()).toBeNull();
        expect(isolated.query('@ids.total', { ids: [1, 2] }).evaluate()).toBe(3);
        expect(isolated.query('@ids.total', { ids: ['a', 'b'] }).evaluate()).toBe('ab');

        const error = getError(() => isolated.query('@ids.total', { ids: [] }).resolve());

        expect(error.kind).toBe('validation');
        expect(error.message).toContain('ambiguous');
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
            expect(Object.is(evaluate('@text to "number"', { text }), number)).toBe(true);
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
            const error = getError(() => evaluate('@text to "number"', { text }));

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
            expect(evaluate('@number to "string"', { number })).toBe(text);
        });

        it.each([0.1, 1 / 3, 1e21, 1e-7, 123456789.125, Number.MAX_VALUE, Number.MIN_VALUE])('read back as the same number: %d', number => {
            expect(evaluate('@number to "string" to "number"', { number })).toBe(number);
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
                const error = getError(() => evaluate('@text to "boolean"', { text }));

                expect(error.kind, text).toBe('evaluation');
                expect(error.message).toContain(`${JSON.stringify(text)} is no Boolean, which is written "true" or "false"`);
            }
        });
    });

    describe('null', () => {
        it('answers null for null without converting, nullable where the value is', () => {
            panel.setAttribute('data-count', '3');

            const query = isolated.query('@panel attributeOf "data-missing" to "number"', { panel });

            expect(String(query.resolve().type)).toBe('number?');
            expect(query.evaluate()).toBeNull();
            expect(evaluate('@panel attributeOf "data-count" to "number"')).toBe(3);
        });

        it('lets ?? say what a missing value means, and leaves a malformed one an error', () => {
            panel.setAttribute('data-count', 'three');

            expect(evaluate('@panel attributeOf "data-missing" to "number" ?? 0')).toBe(0);
            expect(getError(() => evaluate('@panel attributeOf "data-count" to "number" ?? 0')).kind).toBe('evaluation');
        });

        it('answers null for a null of unknown type once its target is a type it converts to, however many conversions reach that type', () => {
            registerTemperature();
            isolated.registerModule(isolated.createModule('kelvin', {
                types: [{ name: 'kelvin', fields: { degrees: 'number' } }],
                conversions: [{ from: 'kelvin', to: 'number', function: 'degrees' }],
            }, { degrees: ({ degrees }) => degrees }));

            const query = isolated.query('@value to "number"', { value: null });

            expect(String(query.resolve().type)).toBe('number?');
            expect(query.evaluate()).toBeNull();
            expect(evaluate('@value to "celsius"', { value: null })).toBeNull();
            expect(getError(() => evaluate('@value to "element"', { value: null })).kind).toBe('validation');
        });

        it('leaves a nullable value checked by its type without null', () => {
            const error = getError(() => evaluate('@panel.closest(".row") to "string"'));

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
            ['a structured type that converts to nothing', '@panel.size to "string"', 'No conversion from size to string is declared, and size converts to nothing'],
            ['a type reached only through another', '5 to "boolean"', 'No conversion from number to boolean is declared, and number converts to string'],
            ['a list', '@panel.children to "string"', 'No conversion from list<element> to string is declared'],
            ['a node, which a cast narrows', '"a" to "element"', "a node is narrowed to one of its kinds with 'as'"],
            ['a type no module declares', '"a" to "nope"', "and 'nope' is none of them"],
            ['a list type', '"a" to "list<number>"', "and 'list<number>' is none of them"],
            ['a nullable type', '"a" to "number?"', "and 'number?' is none of them"],
            ['a structured type that holds an element', '"a" to "pointerEvent"', "and 'pointerEvent' is none of them"],
            ['an event source', '(@panel on "click") to "string"', "What 'to' converts is a value, and this one is an event source"],
        ])('is refused before anything is evaluated for %s', (_, text, message) => {
            const error = getError(() => isolated.query(text, { panel }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
        });
    });

    describe('a convertibility', () => {
        it('tests the value itself, true where the conversion accepts it and false where it rejects it', () => {
            expect(evaluate('"42" is convertible to "number"')).toBe(true);
            expect(evaluate('" 3.5 " is convertible to "number"')).toBe(true);
            expect(evaluate('"hello" is convertible to "number"')).toBe(false);
            expect(evaluate('"1e999" is convertible to "number"')).toBe(false);
            expect(evaluate('"true" is convertible to "boolean"')).toBe(true);
            expect(evaluate('"TRUE" is convertible to "boolean"')).toBe(false);
            expect(evaluate('"hello" is not convertible to "number"')).toBe(true);
        });

        it('is true for a value already of the type and for null, as to answers them without failing', () => {
            expect(evaluate('5 is convertible to "number"')).toBe(true);
            expect(evaluate('@value is convertible to "number"', { value: null })).toBe(true);
            expect(evaluate('@panel attributeOf "data-missing" is convertible to "number"')).toBe(true);
            expect(String(isolated.query('@panel attributeOf "data-missing" is convertible to "number"', { panel }).resolve().type)).toBe('boolean');
        });

        it.each([
            ['a target no type has', '"a" is convertible to "nope"', "and 'nope' is none of them"],
            ['a pair no conversion is declared for', '5 is convertible to "boolean"', 'No conversion from number to boolean is declared'],
            ['a nullable value whose type has no conversion', '@panel.closest(".row") is convertible to "string"', 'No conversion from element to string is declared'],
            ['a null whose target is no type of data', '@value is convertible to "element"', "a node is narrowed to one of its kinds with 'as'"],
            ['an event source', '(@panel on "click") is convertible to "string"', "What 'is convertible to' tests is a value, and this one is an event source"],
        ])('is refused before anything is evaluated for %s, as to is', (_, text, message) => {
            const error = getError(() => isolated.query(text, { panel, value: null }).resolve());

            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
        });

        it('tests a conversion a module declares by what it accepts and rejects', () => {
            registerTemperature();

            expect(evaluate('"21C" is convertible to "celsius"')).toBe(true);
            expect(evaluate('"warm" is convertible to "celsius"')).toBe(false);
        });

        it.each([
            ['throws', () => { throw new Error('the table of units is missing'); }, 'failed: the table of units is missing'],
            ['answers a value not of its type', () => '21', 'answered'],
            ['rejects with a reason that is no string', (text, reject) => reject(42), 'rejected its value with a reason that is no string'],
            ['catches its rejection and answers a value', (text, reject) => {
                try {
                    reject('no');
                } catch {
                    // A conversion that outlives its rejection has a fault.
                }

                return { degrees: 1 };
            }, 'rejected its value and then answered one'],
        ])('leaves a fault an error, whichever form asks and however it is negated, where the conversion %s', (_, answer, message) => {
            registerTemperature({ answer });

            for (const text of ['"21C" to "celsius"', '"21C" is convertible to "celsius"', '"21C" is not convertible to "celsius"']) {
                const error = getError(() => evaluate(text));

                expect(error.kind, text).toBe('evaluation');
                expect(error.message, text).toContain(`The conversion from string to celsius ${message}`);
            }
        });

        it('evaluates the value it tests once, and testing and then converting runs the conversion twice', () => {
            let reads = 0;
            let conversions = 0;

            registerTemperature({ answer: text => (conversions++, { degrees: Number(text.replace('C', '')) }) });
            isolated.registerModule(isolated.createModule('reading', {
                members: [{ name: 'reading', function: 'read', kind: 'property', on: 'element', parameters: [], result: 'string', changes: 'constant', reads: 'fresh' }],
            }, { read: () => `${++reads}C` }));

            expect(evaluate('@panel.reading is convertible to "celsius"')).toBe(true);
            expect([reads, conversions]).toEqual([1, 1]);
            expect(evaluate('@panel { let reading: self.reading, value: if reading is convertible to "celsius" then reading to "celsius" else null }')).toEqual({ value: { degrees: 2 } });
            expect([reads, conversions]).toEqual([2, 3]);
        });
    });

    describe('a conversion a module declares', () => {
        it('converts to and from a structured type of its own, its result taken by the type\'s declared fields', () => {
            registerTemperature();
            panel.setAttribute('data-temperature', '21C');

            expect(evaluate('@panel attributeOf "data-temperature" to "celsius"')).toEqual({ degrees: 21 });
            expect(evaluate('(@panel attributeOf "data-temperature" to "celsius")?.degrees')).toBe(21);
            expect(evaluate('@panel attributeOf "data-temperature" to "celsius" to "string"')).toBe('21C');
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

            expect(evaluate('@panel.reading to "celsius"')).toEqual({ degrees: 1 });
            expect(reads).toBe(1);
        });
    });
});
