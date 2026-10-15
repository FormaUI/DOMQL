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
        '@panel.children.where(self is "attached").max(self.size?.width)',
        '(@panel is "attached" or @panel is "focused") and @panel is "disabled"',
        '@panel is "attached" or @panel is "focused" and @panel is "disabled"',
        '@first and (@second and @third)',
        '(@first or @second) or @third',
        '(@panel is "attached").size',
        '(@first or @second) { size: self.size }',
        '@panel.children.count',
        '@panel has "children"',
        '@window { ratio: self.devicePixelRatio, visible: @document is "visible" }',
        '@panel.closest(".row") attributeOf "data-key"',
        '(@panel eventsOf "click") { x: self.clientX }',
        '(@panel attributeOf "role").length',
        '@panel attributeOf "role" is "set"',
        '@sentinel intersects',
        '@panel attributeOf (@panel attributeOf "for")',
        '@panel.rectRelativeTo(@panel.parent)?.top',
        'if @panel is "attached" then "here" elseif @panel is null then "gone" else "away"',
        '(if @a then @panel else @other).size',
        '(if @a then true else false) and @b',
        'if (if @a then @b else @c) then 1 else 2',
        'if @a then (if @b then 1 else 2) else 3',
        '@panel { state: if self is "disabled" then "locked" else "open" }',
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
        '(@a ?? @b) is "attached"',
        '@a ?? (@b is "attached")',
        'if @on ?? false then 1 else 2',
        '@panel attributeOf (@name ?? "id")',
        '(@a ?? @b).size',
        '@panel[@name]',
        '@panel.parent?.[@name]?.width',
        '@panel["data-key"]',
        '@panel[if @wide then "size" else "clientSize"]',
        '(?@panel.parent[@name].width)',
    ])('writes text that parses back to the same definition: %s', text => {
        const { definition } = domql.query(text, { panel });

        expect(domql.query(DefinitionWriter.write(definition.query), { panel }).definition).toEqual(definition);
    });

    it('writes the parentheses a grouping needs, and none it does not', () => {
        const write = text => DefinitionWriter.write(domql.query(text, { panel }).definition.query);

        expect(write('(@first or @second) and @third')).toBe('(@first or @second) and @third');
        expect(write('(@first and @second) or @third')).toBe('@first and @second or @third');
        expect(write('(@panel is "attached").size')).toBe('(@panel is "attached").size');
        expect(write('@panel.size')).toBe('@panel.size');
        expect(write('((@panel attributeOf "role")).length')).toBe('(@panel attributeOf "role").length');
        expect(write('(@panel attributeOf "role") is "set"')).toBe('@panel attributeOf "role" is "set"');
        expect(write('if @a then 1 else if @b then 2 else 3')).toBe('if @a then 1 elseif @b then 2 else 3');
        expect(write('if @a then 1 else (if @b then 2 else 3)')).toBe('if @a then 1 elseif @b then 2 else 3');
        expect(write('(if @a then @b else @c) is "attached"')).toBe('(if @a then @b else @c) is "attached"');
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
            ['a conditional with an elseif, a line for each clause', '@panel { state: if self is "disabled" then "locked" elseif self is "readOnly" then "read" else "open" }', '@panel {\n    state: if self is "disabled" then "locked"\n    elseif self is "readOnly" then "read"\n    else "open"\n}'],
            ['one space around and and or', '@a   and(@b or   @c)', '@a and (@b or @c)'],
            ['one space around an infix call and a predicate', '@panel   attributeOf    "role"   is   "set"', '@panel attributeOf "role" is "set"'],
            ['no trailing comma', '@panel { size: self.size, key: 1, }', '@panel {\n    size: self.size,\n    key: 1\n}'],
            ['no comment and no original layout', '@panel // the panel\n    /* its size */ .size', '@panel.size'],
            ['an optional access as one token, with the group that ends its chain', '(@panel.parent  ?.children) . count', '(@panel.parent?.children).count'],
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
            '(@panel eventsOf "click") { x: self.clientX, inside: self.target?.closest(".row") is null }',
            '@panel.children.where(self is "attached" and (self has "children" or self matches ".x")).max(self.size?.width)',
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
            expect(() => domql.format({ version: 7, query: { kind: 'nonsense' } })).toThrow(expect.objectContaining({ kind: 'structure' }));
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
