import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { domql } from '#domql/domql.js';
import { DefinitionWriter } from '#domql/language/DefinitionWriter.mjs';

/** The queries the specification and the design write in their plain code blocks: a block that is one query, or each line of one that holds a query on every line. */
const documentedQueries = (() => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const parses = text => {
        try {
            domql.query(text);

            return true;
        } catch {
            return false;
        }
    };

    return ['docs/domql-specification.md', 'docs/domql-design.md'].flatMap(path => [...readFileSync(resolve(root, path), 'utf8').matchAll(/```\n([\s\S]*?)```/g)].flatMap(([, block]) => {
        const lines = block.split('\n').filter(line => line.trim() !== '');

        if (parses(block)) {
            return [block];
        }

        return lines.every(parses) ? lines : [];
    }));
})();

const panel = document.createElement('div');

describe('DefinitionWriter', () => {
    it.each([
        '@panel.size',
        '@panel attributeOf "data-key"',
        '@panel intersects { root: @panel, margin: 10 }',
        '@panel { size: self.size, box: { width: self.size?.width }, kind: "panel", rank: 3, none: null }',
        '@panel.children.where(self.attached).max(self.size?.width)',
        '(@panel.attached or @panel.focused) and @panel.disabled',
        '@panel.attached or @panel.focused and @panel.disabled',
        '@first and (@second and @third)',
        '(@first or @second) or @third',
        '(@panel is null).size',
        '@a is @b',
        '@a is not @b',
        '(@a is @b) is true',
        '@left attributeOf "name" is @right attributeOf "name"',
        '(@count ?? 0) is 0',
        '@a is @b and @c',
        'not (@a is @b) and @c',
        '(@first or @second) { size: self.size }',
        '@panel.children.count',
        '@panel.hasChildren',
        '@window { ratio: self.devicePixelRatio, visible: @document.visible }',
        '@panel.closest(".row") attributeOf "data-key"',
        '(@panel on "click") { x: self.clientX }',
        '(@panel attributeOf "role").length',
        '@panel attributeOf "role" is null',
        '@sentinel intersects',
        '@panel attributeOf (@panel attributeOf "for")',
        '@panel.rectRelativeTo(@panel.parent)?.top',
        'if @panel.attached then "here" elseif @panel is null then "gone" else "away"',
        '(if @a then @panel else @other).size',
        '(if @a then true else false) and @b',
        'if (if @a then @b else @c) then 1 else 2',
        'if @a then (if @b then 1 else 2) else 3',
        '@panel { state: if self.disabled then "locked" else "open" }',
        '@panel.parent is null',
        '@panel { let items: self.children, count: items.count, rows: items { key: self attributeOf "data-key" } }',
        '@panel { let key: "data-key", let first: self.children.at(0), value: first attributeOf key }',
        '@panel { let a: 1, inner: self { let b: a, value: b } }',
        '@panel attributeOf "a \\"quoted\\" name, a \\\\ backslash"',
        '@panel attributeOf "two\nlines"',
        '@panel.parent?.children.count',
        '(@panel.parent?.children).count',
        '@panel.parent?.rect { top: self.top }',
        '(@panel.parent?.rect) { top: self.top }',
        '@panel.parent?.closest(".row") attributeOf "id"',
        '@panel attributeOf (@row?.key)',
        '@panel.closest(@row?.key)?.parent',
        '(?@x.y.z)?.a',
        '(?@x.y.z)?.a.b',
        '(?@x.y.z)?.a?.b',
        '(@x.y.z)?.a',
        '@a ?? @b ?? 0',
        '(@a ?? @b) ?? 0',
        '(@a ?? false) and @b',
        '@a ?? (@b or @c)',
        '(@a ?? @b).attached',
        '@a ?? (@b.attached)',
        'if @on ?? false then 1 else 2',
        '@panel attributeOf (@name ?? "id")',
        '(@a ?? @b).size',
        '@panel[@name]',
        '@panel.parent?.[@name]?.width',
        '@panel["data-key"]',
        '@panel[if @wide then "size" else "clientSize"]',
        '(?@panel.parent[@name].width)',
        '@panel.parent as "element"',
        '(@panel.parent as "element")?.rect',
        '@panel.parent as "element" attributeOf "id"',
        '(@a ?? @b) as "element"',
        '(?@a.b) as "element"',
        '(@a as "node") as "element"',
        '(@panel.parent as "element")?.attached',
        'not @a',
        'not not @a',
        'not @panel.attached',
        'not (@a and @b)',
        'not @a or not @b',
        'not (@a ?? false)',
        '(not @a) ?? false',
        'if not @a then 1 else 2',
        '@panel attributeOf "data-count" to "number"',
        '@panel attributeOf "data-count" to "number" is 5',
        '@a to "string" to "number"',
        '(@a ?? @b) to "number"',
        '@a to "number" ?? 0',
        '@a ?? @b to "number"',
        'not @a to "boolean"',
        '(@a to "string") attributeOf "id"',
        '(@a to "string").length',
        '@panel.parent as "element" to "string"',
        '{ from: 1, to: 2 }',
        '@panel { let to: self.size, width: to.width }',
        '@range.to to "string"',
        '@range.to() to "string"',
        '@sentinel intersects to "string"',
        '@panel attributeOf to to "number"',
        '@a is convertible to "number"',
        '@a is not convertible to "number"',
        '@panel attributeOf "data-n" is convertible to "number" and @b',
        '@a to "string" is convertible to "number"',
        '(@a is convertible to "number") is true',
        '@a is convertible',
        '@a is (convertible to "number")',
        '@a is not (convertible to "string" to "number")',
        '{ convertible: @a is convertible to "number" }',
    ])('writes text that parses back to the same definition: %s', text => {
        const { definition } = domql.query(text, { panel });

        expect(domql.query(DefinitionWriter.write(definition.query), { panel }).definition).toEqual(definition);
    });

    it('writes the parentheses a grouping needs, and none it does not', () => {
        const write = text => DefinitionWriter.write(domql.query(text, { panel }).definition.query);

        expect(write('(@first or @second) and @third')).toBe('(@first or @second) and @third');
        expect(write('(@first and @second) or @third')).toBe('@first and @second or @third');
        expect(write('(@panel is null).size')).toBe('(@panel is null).size');
        expect(write('@panel.size')).toBe('@panel.size');
        expect(write('((@panel attributeOf "role")).length')).toBe('(@panel attributeOf "role").length');
        expect(write('(@panel attributeOf "role") is null')).toBe('@panel attributeOf "role" is null');
        expect(write('if @a then 1 else if @b then 2 else 3')).toBe('if @a then 1 elseif @b then 2 else 3');
        expect(write('if @a then 1 else (if @b then 2 else 3)')).toBe('if @a then 1 elseif @b then 2 else 3');
        expect(write('(if @a then @b else @c).attached')).toBe('(if @a then @b else @c).attached');
        expect(write('(@panel attributeOf "n") to "number"')).toBe('@panel attributeOf "n" to "number"');
        expect(write('(@a to "string") to "number"')).toBe('@a to "string" to "number"');
        expect(write('(@a to "number") is 5')).toBe('@a to "number" is 5');
        expect(write('(@a is @b) to "string"')).toBe('(@a is @b) to "string"');
        expect(write('(@a ?? @b) to "number"')).toBe('(@a ?? @b) to "number"');
        expect(write('not (@a is convertible to "number")')).toBe('@a is not convertible to "number"');
        expect(write('(@a is convertible to "number") and @b')).toBe('@a is convertible to "number" and @b');
        expect(write('(@a is convertible to "number") ?? false')).toBe('(@a is convertible to "number") ?? false');
    });

    it('writes the argument of an infix call as an input, grouping any other', () => {
        const target = { kind: 'parameter', name: 'panel' };
        const named = argument => ({ kind: 'infixCall', target, name: 'attributeOf', argument });

        expect(DefinitionWriter.write(named({ kind: 'member', target, name: 'size' }))).toBe('@panel attributeOf (@panel.size)');
        expect(DefinitionWriter.write(named({ kind: 'object', fields: [{ name: 'a', value: { kind: 'literal', value: 1 } }] }))).toBe('@panel attributeOf { a: 1 }');
        expect(DefinitionWriter.write({ kind: 'member', target: named({ kind: 'literal', value: 'role' }), name: 'length' })).toBe('(@panel attributeOf "role").length');
    });

    it('writes an options object as the fields it is written with', () => {
        const { definition } = domql.query('@panel intersects { root: @panel, margin: 5 }', { panel });

        expect(DefinitionWriter.write(definition.query)).toBe('@panel intersects { root: @panel, margin: 5 }');
    });

    describe('format', () => {
        const format = text => domql.format(text);

        it.each([
            ['an object expression of one field', '@panel {size:self.size}', '@panel { size: self.size }'],
            ['an object expression of more fields, a line for each', '@panel { size: self.size, key: self attributeOf "data-key" }', '@panel {\n    size: self.size,\n    key: self attributeOf "data-key"\n}'],
            ['an object expression of one field whose value takes lines', '@panel { box: { width: self.size?.width, height: self.size?.height } }', '@panel {\n    box: {\n        width: self.size?.width,\n        height: self.size?.height\n    }\n}'],
            ['an object expression of one field and a local', '@panel { let s: self.size, width: s.width }', '@panel {\n    let s: self.size,\n    width: s.width\n}'],
            ['a conditional with no elseif, on one line', 'if @a then 1 else 2', 'if @a then 1 else 2'],
            ['a conditional with an elseif, a line for each clause', '@panel { state: if self.disabled then "locked" elseif self.readOnly then "read" else "open" }', '@panel {\n    state: if self.disabled then "locked"\n    elseif self.readOnly then "read"\n    else "open"\n}'],
            ['one space around and and or', '@a   and(@b or   @c)', '@a and (@b or @c)'],
            ['one space around an infix call and is', '@panel   attributeOf    "role"   is   null', '@panel attributeOf "role" is null'],
            ['no trailing comma', '@panel { size: self.size, key: 1, }', '@panel {\n    size: self.size,\n    key: 1\n}'],
            ['no comment and no original layout', '@panel // the panel\n    /* its size */ .size', '@panel.size'],
            ['an optional access as one token, with the group that ends its chain', '(@panel.parent  ?.children) . count', '(@panel.parent?.children).count'],
            ['a cast in an optional-access group as the optional accesses it writes', '(?(@panel.parent as "element").rect.width)', '(@panel?.parent as "element")?.rect?.width'],
            ['a grouped coalescing operator cast in an optional-access group, its sides as written', '(?((@a.x ?? @b) as "element").rect)', '((@a.x ?? @b) as "element")?.rect'],
            ['an equality negated as is not, however its negation is written', 'not (@a is @b)', '@a is not @b'],
            ['a negation, grouped only where what it negates needs it', 'not ((@panel.attached))', 'not @panel.attached'],
            ['an access by name of a string literal that is a name, as the name', '@panel["size"]', '@panel.size'],
            ['a coalescing operator, grouped only where its sides need it', '((@a) ?? ((@b ?? 0)))', '@a ?? @b ?? 0'],
            ['an optional-access group as the accesses it makes optional', '(?@panel.parent.rect.width)', '@panel?.parent?.rect?.width'],
            ['an optional-access group followed by more of a chain, with the parentheses its boundary needs', '(?@x.y.z)?.a.b', '(@x?.y?.z)?.a.b'],
            ['the grouping a meaning needs, and none other', '((@first and @second)) or (@third)', '@first and @second or @third'],
            ['a string escaping only a double quote and a backslash', '@panel attributeOf "say \\"hi\\" \\\\ there"', '@panel attributeOf "say \\"hi\\" \\\\ there"'],
        ])('lays out %s', (_, text, formatted) => {
            expect(format(text)).toBe(formatted);
        });

        it.each([
            '@panel { size: self.size, rows: self.children { key: self attributeOf "data-key", open: self matches ".open" } }',
            'if @a then { x: 1, y: 2 } elseif @b then (if @c then 3 else 4) else @d { z: self.size }',
            '@panel { let items: self.children, count: items.count, first: items.at(0) { key: self attributeOf "data-key" } }',
            '(@panel on "click") { x: self.clientX, inside: self.target?.closest(".row") is null }',
            '@panel.children.where(self.attached and (self.hasChildren or self matches ".x")).max(self.size?.width)',
            '@panel attributeOf "line\nbreak and \\"quote\\""',
        ])('gives text that formats to itself, and parses back to the same definition: %s', text => {
            const formatted = format(text);

            expect(format(formatted)).toBe(formatted);
            expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
        });

        it('keeps negative zero, which a number equal to it would lose', () => {
            const literalOf = text => domql.query(text).definition.query.argument.value;

            expect(format('@panel.at(-0)')).toBe('@panel.at(-0)');
            expect(DefinitionWriter.write(domql.query('@panel.at(-0)').definition.query)).toBe('@panel.at(-0)');
            expect(Object.is(literalOf(format('@panel.at(-0)')), -0)).toBe(true);
            expect(Object.is(literalOf(format('@panel.at(0)')), 0)).toBe(true);
        });

        it('gives the same text for a request\'s text, its definition and a query object', () => {
            const text = '@panel { size: self.size, key: self attributeOf "data-key" }';
            const query = domql.query(text, { panel });

            expect(domql.format(query.definition)).toBe(format(text));
            expect(domql.format(query)).toBe(format(text));
        });

        it('needs no bindings and resolves nothing, so a query of unbound parameters and an unknown vocabulary is formatted', () => {
            expect(format('@nobody.nothing{x:self.whatever(@other)}')).toBe('@nobody.nothing { x: self.whatever(@other) }');
            expect(() => domql.query('@nobody.nothing').resolve()).toThrow(expect.objectContaining({ kind: 'validation' }));
        });

        it('refuses text that does not parse, a definition that is not one, and a query object another instance made', async () => {
            vi.resetModules();

            const { domql: other } = await import('#domql/domql.js');

            expect(() => format('@panel {')).toThrow(expect.objectContaining({ kind: 'syntax' }));
            expect(() => domql.format({ version: 13, query: { kind: 'nonsense' } })).toThrow(expect.objectContaining({ kind: 'structure' }));
            expect(() => domql.format(other.query('@panel'))).toThrow(expect.objectContaining({ kind: 'structure', message: expect.stringContaining('query.definition') }));
        });

        it('formats every query the specification and the design write to text that formats to itself and means the same', () => {
            expect(documentedQueries.length).toBeGreaterThan(15);

            for (const text of documentedQueries) {
                const formatted = format(text);

                expect(format(formatted)).toBe(formatted);
                expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
            }
        });
    });
});
