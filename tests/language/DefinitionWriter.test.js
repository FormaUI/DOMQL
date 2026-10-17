import { describe, it, expect, vi } from 'vitest';
import { domql } from '#domql/domql.js';
import { DefinitionWriter } from '#domql/language/DefinitionWriter.mjs';

const panel = document.createElement('div');

describe('DefinitionWriter', () => {
    it.each([
        '@panel.size',
        '@panel:attribute["data-key"]',
        '@panel intersects { root: @panel, margin: 10 }',
        '@panel { size: self.size, box: { width: self.size?.width }, kind: "panel", rank: 3, none: null }',
        '@panel.children.where(self.attached).max(self.size?.width)',
        '(@panel.attached or @panel.has("focus")) and @panel.is("disabled")',
        '@panel.attached or @panel.has("focus") and @panel.is("disabled")',
        '@first and (@second and @third)',
        '(@first or @second) or @third',
        '(@panel == null).size',
        '@a == @b',
        '@a != @b',
        '(@a == @b) == true',
        '@left:attribute["name"] == @right:attribute["name"]',
        '(@count ?? 0) == 0',
        '@a == @b and @c',
        'not (@a == @b) and @c',
        '(@first or @second) { size: self.size }',
        '@panel.children.count',
        '@panel.hasChildren',
        '@window { ratio: self.devicePixelRatio, visible: @document.is("visible") }',
        '@panel.closest(".row")?:attribute["data-key"]',
        '(@panel on "click") { x: self.clientX }',
        '(@panel:attribute["role"]).length',
        '@panel:attribute["role"] == null',
        '@sentinel intersects',
        '@panel matches (@panel:attribute["for"])',
        '@panel.rectRelativeTo(@panel.parent)?.top',
        'if @panel.attached then "here" elseif @panel == null then "gone" else "away"',
        '(if @a then @panel else @other).size',
        '(if @a then true else false) and @b',
        'if (if @a then @b else @c) then 1 else 2',
        'if @a then (if @b then 1 else 2) else 3',
        '@panel { state: if self.is("disabled") then "locked" else "open" }',
        '@panel.parent == null',
        '@panel { let items: self.children, count: items.count, rows: items { key: self:attribute["data-key"] } }',
        '@panel { let key: "data-key", let first: self.children.at(0), value: first?:attribute[key] }',
        '@panel { let a: 1, inner: self { let b: a, value: b } }',
        '@panel:attribute["a \\"quoted\\" name, a \\\\ backslash"]',
        '@panel:attribute["two\nlines"]',
        '@panel.parent?.children.count',
        '(@panel.parent?.children).count',
        '@panel.parent?.rect { top: self.top }',
        '(@panel.parent?.rect) { top: self.top }',
        '@panel.parent?.closest(".row")?:attribute["id"]',
        '@panel matches (@row?.key)',
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
        '@panel matches (@name ?? ".row")',
        '(@a ?? @b).size',
        '@panel[@name]',
        '@panel.parent?[@name]?.width',
        '@panel["data-key"]',
        '@panel[if @wide then "size" else "clientSize"]',
        '(?@panel.parent[@name].width)',
        '@panel.parent as "element"',
        '(@panel.parent as "element")?.rect',
        '@panel.parent as "element" matches ".row"',
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
        '@panel:attribute["data-count"] to "number"',
        '@panel:attribute["data-count"] to "number" == 5',
        '@a to "string" to "number"',
        '(@a ?? @b) to "number"',
        '@a to "number" ?? 0',
        '@a ?? @b to "number"',
        'not @a to "boolean"',
        '(@a to "string"):attribute["id"]',
        '(@a to "string").length',
        '@panel.parent as "element" to "string"',
        '{ from: 1, to: 2 }',
        '@panel { let to: self.size, width: to.width }',
        '@range.to to "string"',
        '@range.to() to "string"',
        '@sentinel intersects to "string"',
        '@panel:attribute[to] to "number"',
        'try @a to "number"',
        'try @panel:attribute["data-n"] to "number" ?? 0',
        'try (@a to "string") to "number"',
        'try @a to "number" == 5',
        '(try @a to "number") to "string"',
        'try (@a ?? "1") to "number"',
        'try @node as "element"',
        'try @node.parent as "element" ?? @panel',
        '(try @node as "element") != null',
        '(try @node as "element")?.rect',
        'try (@node as "element").parent as "element"',
        'try (@node as "element") to "string"',
        'try (@preferred ?? @fallback) as "element"',
        '@node as "element"',
        'if let n: try @a to "number" then n else 0',
        'if @a then 1 elseif let n: @b then n else 0',
        'if let row: @panel.closest(".row") then { key: row:["data-key"] } else null',
        '(if let n: @a then n else 0) to "string"',
        'if let b: @a == 1 then b else false',
        'if let n: @a ?? @b then n else 0',
        '@a.is("checked") != false',
        '{ is: @a.is("checked") }',
        '(try @a to "number") == 5',
        '@a == convertible',
        '@a == (convertible to "number")',
        '@a != (convertible to "string" to "number")',
        '{ convertible: try @a to "number" }',
        '@panel:attribute["data-key"]',
        '@panel:["data-key"]',
        '@panel:class["open"]',
        '@panel?:class[@name]',
        '@panel.is("checked")',
        '@panel:class["open"] and @panel.has("focus-within")',
        '@panel.view.is("glowing") == true',
        '@panel?.is(@name)',
        '@panel?:[@name]',
        '@panel.first(".row")?:["id"] == null',
        '@panel:attribute[@name]',
        '@panel.aria:["checked"]',
        '@panel?:attribute["data-key"]',
        '@panel.first(".row")?:style["display"]',
        '@panel:lookup["a"]["b"]',
        '@panel:lookup["a"]?.label',
        '@panel:lookup[@panel:attribute["data-which"]]',
        '{ key: @panel:attribute["data-key"], n: 1 }',
        '@panel { key: self:attribute["data-key"] }',
        '(?@panel.first(".row"):attribute["id"])',
        '(@panel:attribute["n"]):attribute["id"]',
        '@panel matches (@row:attribute["key"])',
        '@panel:attribute["n"] to "number"',
        'try @panel:attribute["n"] to "number"',
        '@panel:lookup["a"] as "element"',
    ])('writes text that parses back to the same definition: %s', text => {
        const { definition } = domql.query(text, { panel });

        expect(domql.query(DefinitionWriter.write(definition.query), { panel }).definition).toEqual(definition);
    });

    it('writes the parentheses a grouping needs, and none it does not', () => {
        const write = text => DefinitionWriter.write(domql.query(text, { panel }).definition.query);

        expect(write('(@first or @second) and @third')).toBe('(@first or @second) and @third');
        expect(write('(@first and @second) or @third')).toBe('@first and @second or @third');
        expect(write('(@panel == null).size')).toBe('(@panel == null).size');
        expect(write('@panel.size')).toBe('@panel.size');
        expect(write('((@panel matches ".x")).length')).toBe('(@panel matches ".x").length');
        expect(write('(@panel matches ".x") == null')).toBe('@panel matches ".x" == null');
        expect(write('(@panel:attribute["role"]).length')).toBe('@panel:attribute["role"].length');
        expect(write('if @a then 1 else if @b then 2 else 3')).toBe('if @a then 1 elseif @b then 2 else 3');
        expect(write('if @a then 1 else (if @b then 2 else 3)')).toBe('if @a then 1 elseif @b then 2 else 3');
        expect(write('(if @a then @b else @c).attached')).toBe('(if @a then @b else @c).attached');
        expect(write('(@panel:attribute["n"]) to "number"')).toBe('@panel:attribute["n"] to "number"');
        expect(write('(@a to "string") to "number"')).toBe('@a to "string" to "number"');
        expect(write('(@a to "number") == 5')).toBe('@a to "number" == 5');
        expect(write('(@a == @b) to "string"')).toBe('(@a == @b) to "string"');
        expect(write('(@a ?? @b) to "number"')).toBe('(@a ?? @b) to "number"');
        expect(write('(try @a to "number") ?? 0')).toBe('try @a to "number" ?? 0');
        expect(write('(try @a to "number") == 5')).toBe('try @a to "number" == 5');
        expect(write('(try @node as "element") != null')).toBe('try @node as "element" != null');
        expect(write('try (@node as "element") to "string"')).toBe('try (@node as "element") to "string"');
        expect(write('try (@a to "number")')).toBe('try @a to "number"');
        expect(write('if let n: (@a ?? @b) then n else 0')).toBe('if let n: @a ?? @b then n else 0');
        expect(write('(if let n: @a then n else 0).size')).toBe('(if let n: @a then n else 0).size');
    });

    it('writes the argument of an infix call as an input, grouping any other', () => {
        const target = { kind: 'parameter', name: 'panel' };
        const named = argument => ({ kind: 'infixCall', target, name: 'matches', argument });

        expect(DefinitionWriter.write(named({ kind: 'member', target, name: 'size' }))).toBe('@panel matches (@panel.size)');
        expect(DefinitionWriter.write(named({ kind: 'object', fields: [{ name: 'a', value: { kind: 'literal', value: 1 } }] }))).toBe('@panel matches { a: 1 }');
        expect(DefinitionWriter.write({ kind: 'member', target: named({ kind: 'literal', value: 'role' }), name: 'length' })).toBe('(@panel matches "role").length');
    });

    it('writes an options object as the fields it is written with', () => {
        const { definition } = domql.query('@panel intersects { root: @panel, margin: 5 }', { panel });

        expect(DefinitionWriter.write(definition.query)).toBe('@panel intersects { root: @panel, margin: 5 }');
    });

    describe('format', () => {
        const format = text => domql.format(text);

        it.each([
            ['an object expression of one field', '@panel {size:self.size}', '@panel { size: self.size }'],
            ['an object expression of more fields, a line for each', '@panel { size: self.size, key: self:attribute["data-key"] }', '@panel {\n    size: self.size,\n    key: self:attribute["data-key"]\n}'],
            ['an object expression of one field whose value takes lines', '@panel { box: { width: self.size?.width, height: self.size?.height } }', '@panel {\n    box: {\n        width: self.size?.width,\n        height: self.size?.height\n    }\n}'],
            ['an object expression of one field and a local', '@panel { let s: self.size, width: s.width }', '@panel {\n    let s: self.size,\n    width: s.width\n}'],
            ['a conditional with no elseif, on one line', 'if @a then 1 else 2', 'if @a then 1 else 2'],
            ['a conditional with an elseif, a line for each clause', '@panel { state: if self.is("disabled") then "locked" elseif self.is("readonly") then "read" else "open" }', '@panel {\n    state: if self.is("disabled") then "locked"\n    elseif self.is("readonly") then "read"\n    else "open"\n}'],
            ['a conditional binding with an elseif, a line for each clause', '@panel { v: if let a: self:["a"] then a elseif let b: self:["b"] then b else "none" }', '@panel {\n    v: if let a: self:["a"] then a\n    elseif let b: self:["b"] then b\n    else "none"\n}'],
            ['one space around and and or', '@a   and(@b or   @c)', '@a and (@b or @c)'],
            ['one space around an infix call and is', '@panel   matches    ".x"   ==   null', '@panel matches ".x" == null'],
            ['no space around an indexer', '@panel  :  attribute  [ "role" ]   ==   null', '@panel:attribute["role"] == null'],
            ['no trailing comma', '@panel { size: self.size, key: 1, }', '@panel {\n    size: self.size,\n    key: 1\n}'],
            ['no comment and no original layout', '@panel // the panel\n    /* its size */ .size', '@panel.size'],
            ['an optional access as one token, with the group that ends its chain', '(@panel.parent  ?.children) . count', '(@panel.parent?.children).count'],
            ['a cast in an optional-access group as the optional accesses it writes', '(?(@panel.parent as "element").rect.width)', '(@panel?.parent as "element")?.rect?.width'],
            ['a grouped coalescing operator cast in an optional-access group, its sides as written', '(?((@a.x ?? @b) as "element").rect)', '((@a.x ?? @b) as "element")?.rect'],
            ['an equality negated as is not, however its negation is written', 'not (@a == @b)', '@a != @b'],
            ['a negation, grouped only where what it negates needs it', 'not ((@panel.attached))', 'not @panel.attached'],
            ['an access by name of a string literal that is a name, as the name', '@panel["size"]', '@panel.size'],
            ['a coalescing operator, grouped only where its sides need it', '((@a) ?? ((@b ?? 0)))', '@a ?? @b ?? 0'],
            ['an optional-access group as the accesses it makes optional', '(?@panel.parent.rect.width)', '@panel?.parent?.rect?.width'],
            ['an optional-access group followed by more of a chain, with the parentheses its boundary needs', '(?@x.y.z)?.a.b', '(@x?.y?.z)?.a.b'],
            ['the grouping a meaning needs, and none other', '((@first and @second)) or (@third)', '@first and @second or @third'],
            ['a string escaping only a double quote and a backslash', '@panel:attribute["say \\"hi\\" \\\\ there"]', '@panel:attribute["say \\"hi\\" \\\\ there"]'],
        ])('lays out %s', (_, text, formatted) => {
            expect(format(text)).toBe(formatted);
        });

        it.each([
            '@panel { size: self.size, rows: self.children { key: self:attribute["data-key"], open: self matches ".open" } }',
            'if @a then { x: 1, y: 2 } elseif @b then (if @c then 3 else 4) else @d { z: self.size }',
            '@panel { let items: self.children, count: items.count, first: items.at(0) { key: self:attribute["data-key"] } }',
            '(@panel on "click") { x: self.clientX, inside: self.target?.closest(".row") == null }',
            '@panel.children.where(self.attached and (self.hasChildren or self matches ".x")).max(self.size?.width)',
            '@panel:attribute["line\nbreak and \\"quote\\""]',
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
            const text = '@panel { size: self.size, key: self:attribute["data-key"] }';
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
            expect(() => domql.format({ version: 17, query: { kind: 'nonsense' } })).toThrow(expect.objectContaining({ kind: 'structure' }));
            expect(() => domql.format(other.query('@panel'))).toThrow(expect.objectContaining({ kind: 'structure', message: expect.stringContaining('query.definition') }));
        });
    });
});
