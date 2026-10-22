import { describe, it, expect, vi } from 'vitest';
import { domql } from '#domql/domql.js';
import { DefinitionWriter } from '#lexica/language/DefinitionWriter.mjs';

const panel = document.createElement('div');

describe('DefinitionWriter', () => {
    it.each([
        'panel.size',
        'panel.attribute["data-key"]',
        'panel.intersects({ root = panel, margin = 10 })',
        'panel { size = it.size, box = { width = it.size?.width }, kind = "panel", rank = 3, none = null }',
        'panel.children.where(it.attached).max(it.size?.width)',
        '(panel.attached or panel.focus()) and panel.disabled()',
        'panel.attached or panel.focus() and panel.disabled()',
        'first and (second and third)',
        '(first or second) or third',
        '(panel == null).size',
        'a == b',
        'a != b',
        '(a == b) == true',
        'left.attribute["name"] == right.attribute["name"]',
        '(count ?? 0) == 0',
        'a == b and c',
        'not (a == b) and c',
        '(first or second) { size = it.size }',
        'panel.children.count',
        'panel.hasChildren',
        'domql.window { ratio = it.devicePixelRatio, visible = domql.document.visible() }',
        'panel.closest(".row")?.attribute["data-key"]',
        '(panel.attribute["role"]).length',
        'panel.attribute["role"] == null',
        'sentinel.intersects()',
        'panel.matches(panel.attribute["for"])',
        'panel.rectRelativeTo(panel.parent)?.top',
        'if panel.attached then "here" elseif panel == null then "gone" else "away" end',
        'let target = if a then panel else other end\nreturn target.size',
        '(if a then true else false end) and b',
        'if (if a then b else c end) then 1 else 2 end',
        'if a then (if b then 1 else 2 end) else 3 end',
        'panel { state = if it.disabled() then "locked" else "open" end }',
        'panel.parent == null',
        'panel { let items = it.children, count = items.count, rows = items { key = it.attribute["data-key"] } }',
        'panel { let key = "data-key", let first = it.children[0], value = first?.attribute[key] }',
        'panel { let a = 1, inner = it { let b = a, value = b } }',
        'panel.attribute["a \\"quoted\\" name, a \\\\ backslash"]',
        'panel.attribute["two\\nlines"]',
        'panel.parent?.children.count',
        '(panel.parent?.children).count',
        'panel.parent?.rect { top = it.top }',
        '(panel.parent?.rect) { top = it.top }',
        'panel.parent?.closest(".row")?.attribute["id"]',
        'panel.matches(row?.key)',
        'panel.closest(row?.key)?.parent',
        '(?x.y.z)?.a',
        '(?x.y.z)?.a.b',
        '(?x.y.z)?.a?.b',
        '(x.y.z)?.a',
        'a ?? b ?? 0',
        '(a ?? b) ?? 0',
        '(a ?? false) and b',
        'a ?? (b or c)',
        '(a ?? b).attached',
        'a ?? (b.attached)',
        'if on ?? false then 1 else 2 end',
        'panel.matches(name ?? ".row")',
        '(a ?? b).size',
        'panel.[name]',
        'panel.parent?.[name]?.width',
        'panel.["data-key"]',
        'panel.[if wide then "size" else "clientSize" end]',
        '(?panel.parent.[name].width)',
        'panel.parent as Element',
        '(panel.parent as Element)?.rect',
        '(panel.parent as Element).matches(".row")',
        'panel.parent as Element to String',
        '(a ?? b) as Element',
        '(?a.b) as Element',
        '(a as Node) as Element',
        '(panel.parent as Element)?.attached',
        'not a',
        'not not a',
        'not panel.attached',
        'not (a and b)',
        'not a or not b',
        'not (a ?? false)',
        '(not a) ?? false',
        'if not a then 1 else 2 end',
        'panel.attribute["data-count"] to Number',
        'panel.attribute["data-count"] to Number == 5',
        'a to String to Number',
        '(a ?? b) to Number',
        'a to Number ?? 0',
        'a ?? b to Number',
        'not a to Boolean',
        '(a to String).attribute["id"]',
        '(a to String).length',
        'panel.parent as Element to String',
        '{ from = 1, to = 2 }',
        'panel { let to = it.size, width = @to.width }',
        'range.to to String',
        'range.to() to String',
        'sentinel.intersects() to String',
        'panel.media[query]to String',
        'panel.attribute[~to] to Number',
        'try a to Number',
        'try panel.attribute["data-n"] to Number ?? 0',
        'try (a to String) to Number',
        'try a to Number == 5',
        '(try a to Number) to String',
        'try (a ?? "1") to Number',
        'try node as Element',
        'try node.parent as Element ?? panel',
        '(try node as Element) != null',
        '(try node as Element)?.rect',
        'try (node as Element).parent as Element',
        'try (node as Element) to String',
        'try (preferred ?? fallback) as Element',
        'node as Element',
        'if let n = try a to Number then n else 0 end',
        'if a then 1 elseif let n = b then n else 0 end',
        'if let row = panel.closest(".row") then { key = row["data-key"] } else null end',
        '(if let n = a then n else 0 end) to String',
        'if let b = a == 1 then b else false end',
        'if let n = a ?? b then n else 0 end',
        'a.checked() != false',
        '{ is = a.checked() }',
        '(try a to Number) == 5',
        'a == convertible',
        'a == (convertible to Number)',
        'a != (convertible to String to Number)',
        '{ convertible = try a to Number }',
        'panel.attribute["data-key"]',
        'panel["data-key"]',
        'panel.class["open"]',
        'panel?.class[name]',
        'panel.checked()',
        'panel.class["open"] and panel.focusWithin()',
        'panel.view.is(it.glowing()) == true',
        'panel?.is(test)',
        'panel?[name]',
        'panel.first(".row")?["id"] == null',
        'panel.attribute[name]',
        'panel.on("click") { x = it.clientX }',
        'panel.first(".row")?.matches(".open") ?? false',
        'panel.aria["checked"]',
        'panel?.attribute["data-key"]',
        'panel.first(".row")?.style["display"]',
        'panel.lookup["a"].["b"]',
        'panel.lookup["a"]?.label',
        'panel.lookup[panel.attribute["data-which"]]',
        '{ key = panel.attribute["data-key"], n = 1 }',
        'panel { key = it.attribute["data-key"] }',
        '(?panel.first(".row").attribute["id"])',
        '(panel.attribute["n"]).attribute["id"]',
        'panel.matches(row.attribute["key"])',
        'panel.attribute["n"] to Number',
        'try panel.attribute["n"] to Number',
        'panel.lookup["a"] as Element',
    ])('writes text that parses back to the same definition: %s', text => {
        const { definition } = domql.query(text, { panel });

        expect(domql.query(DefinitionWriter.write(definition.expression), { panel }).definition).toEqual(definition);
    });

    it('writes the parentheses a grouping needs, and none it does not', () => {
        const write = text => DefinitionWriter.write(domql.query(text, { panel }).definition.expression);

        expect(write('(first or second) and third')).toBe('(first or second) and third');
        expect(write('(first and second) or third')).toBe('first and second or third');
        expect(write('(panel == null).size')).toBe('(panel == null).size');
        expect(write('panel.size')).toBe('panel.size');
        expect(write('((panel.matches(".x"))).length')).toBe('panel.matches(".x").length');
        expect(write('(panel.matches(".x")) == null')).toBe('panel.matches(".x") == null');
        expect(write('(panel.on("click")) { x = it.clientX }')).toBe('panel.on("click") { x = it.clientX }');
        expect(write('(panel.attribute["role"]).length')).toBe('panel.attribute["role"].length');
        expect(write('if a then 1 else if b then 2 else 3 end end')).toBe('if a then 1 elseif b then 2 else 3 end');
        expect(write('if a then 1 else (if b then 2 else 3 end) end')).toBe('if a then 1 elseif b then 2 else 3 end');
        expect(write('(if a then b else c end) and d')).toBe('(if a then b else c end) and d');
        expect(write('(panel.attribute["n"]) to Number')).toBe('panel.attribute["n"] to Number');
        expect(write('(a to String) to Number')).toBe('a to String to Number');
        expect(write('(a to Number) == 5')).toBe('a to Number == 5');
        expect(write('(a == b) to String')).toBe('(a == b) to String');
        expect(write('(a ?? b) to Number')).toBe('(a ?? b) to Number');
        expect(write('(try a to Number) ?? 0')).toBe('try a to Number ?? 0');
        expect(write('(try a to Number) == 5')).toBe('try a to Number == 5');
        expect(write('(try node as Element) != null')).toBe('try node as Element != null');
        expect(write('try (node as Element) to String')).toBe('try (node as Element) to String');
        expect(write('try (a to Number)')).toBe('try a to Number');
        expect(write('if let n = (a ?? b) then n else 0 end')).toBe('if let n = a ?? b then n else 0 end');
        expect(write('-(if let n = a then n else 0 end)')).toBe('-(if let n = a then n else 0 end)');
    });

    it('writes an options object as the fields it is written with', () => {
        const { definition } = domql.query('panel.intersects({ root = panel, margin = 5 })', { panel });

        expect(DefinitionWriter.write(definition.expression)).toBe('panel.intersects({ root = panel, margin = 5 })');
    });

    describe('format', () => {
        const format = text => domql.format(text);

        it.each([
            ['an object expression of one field', 'panel {size = it.size}', 'panel { size = it.size }'],
            ['an object expression of more fields, a line for each', 'panel { size = it.size, key = it.attribute["data-key"] }', 'panel {\n    size = it.size,\n    key = it.attribute["data-key"]\n}'],
            ['an object expression of one field whose value takes lines', 'panel { box = { width = it.size?.width, height = it.size?.height } }', 'panel {\n    box = {\n        width = it.size?.width,\n        height = it.size?.height\n    }\n}'],
            ['an object expression of one field and a local', 'panel { let s = it.size, width = s.width }', 'panel {\n    let s = it.size,\n    width = s.width\n}'],
            ['a conditional with no elseif, on one line', 'if a then 1 else 2 end', 'if a then 1 else 2 end'],
            ['a conditional with an elseif, a line for each clause', 'panel { state = if it.disabled() then "locked" elseif it.readonly() then "read" else "open" end }', 'panel {\n    state = if it.disabled() then "locked"\n    elseif it.readonly() then "read"\n    else "open"\n    end\n}'],
            ['a conditional binding with an elseif, a line for each clause', 'panel { v = if let a = it["a"] then a elseif let b = it["b"] then b else "none" end }', 'panel {\n    v = if let a = it["a"] then a\n    elseif let b = it["b"] then b\n    else "none"\n    end\n}'],
            ['one space around and and or', 'a   and(b or   c)', 'a and (b or c)'],
            ['one space around to and ==, and none in a call', 'panel . matches ( ".x" )   to String   ==   null', 'panel.matches(".x") to String == null'],
            ['no space around an indexer', 'panel  .  attribute  [ "role" ]   ==   null', 'panel.attribute["role"] == null'],
            ['no trailing comma', 'panel { size = it.size, key = 1, }', 'panel {\n    size = it.size,\n    key = 1\n}'],
            ['no comment and no original layout', 'panel // the panel\n    /* its size */ .size', 'panel.size'],
            ['an optional access as one token, with the group that ends its chain', '(panel.parent  ?.children) . count', '(panel.parent?.children).count'],
            ['a cast in an optional enclosed access as the optional accesses it writes', '(?(panel.parent as Element).rect.width)', '(panel?.parent as Element)?.rect?.width'],
            ['a grouped coalescing operator cast in an optional enclosed access, its sides as written', '(?((a.x ?? b) as Element).rect)', '((a.x ?? b) as Element)?.rect'],
            ['an equality negated as is not, however its negation is written', 'not (a == b)', 'a != b'],
            ['a negation, grouped only where what it negates needs it', 'not ((panel.attached))', 'not panel.attached'],
            ['a computed property access of a string literal that is a name, as the name', 'panel.["size"]', 'panel.size'],
            ['a coalescing operator, grouped only where its sides need it', '((a) ?? ((b ?? 0)))', 'a ?? b ?? 0'],
            ['an optional enclosed access as the accesses it makes optional', '(?panel.parent.rect.width)', 'panel?.parent?.rect?.width'],
            ['an optional enclosed access followed by more of a chain, with the parentheses its boundary needs', '(?x.y.z)?.a.b', '(x?.y?.z)?.a.b'],
            ['the grouping a meaning needs, and none other', '((first and second)) or (third)', 'first and second or third'],
            ['a string escaping a double quote and a backslash', 'panel.attribute["say \\"hi\\" \\\\ there"]', 'panel.attribute["say \\"hi\\" \\\\ there"]'],
        ])('lays out %s', (_, text, formatted) => {
            expect(format(text)).toBe(formatted);
        });

        it.each([
            'panel { size = it.size, rows = it.children { key = it.attribute["data-key"], open = it.matches(".open") } }',
            'if a then { x = 1, y = 2 } elseif b then (if c then 3 else 4 end) else d { z = it.size } end',
            'panel { let items = it.children, count = items.count, first = items[0] { key = it.attribute["data-key"] } }',
            'panel.on("click") { x = it.clientX, inside = it.target?.closest(".row") == null }',
            'panel.children.where(it.attached and (it.hasChildren or it.matches(".x"))).max(it.size?.width)',
            'panel.attribute["line\\nbreak and \\"quote\\""]',
        ])('gives text that formats to itself, and parses back to the same definition: %s', text => {
            const formatted = format(text);

            expect(format(formatted)).toBe(formatted);
            expect(domql.query(formatted).definition).toEqual(domql.query(text).definition);
        });

        it('keeps negative zero, which a number equal to it would lose', () => {
            const literalOf = text => domql.query(text).definition.expression.argument.value;

            expect(format('panel[-0]')).toBe('panel[-0]');
            expect(DefinitionWriter.write(domql.query('panel[-0]').definition.expression)).toBe('panel[-0]');
            expect(Object.is(literalOf(format('panel[-0]')), -0)).toBe(true);
            expect(Object.is(literalOf(format('panel[0]')), 0)).toBe(true);
        });

        it('gives the same text for a request\'s text, its definition and a query object', () => {
            const text = 'panel { size = it.size, key = it.attribute["data-key"] }';
            const query = domql.query(text, { panel });

            expect(domql.format(query.definition)).toBe(format(text));
            expect(domql.format(query)).toBe(format(text));
        });

        it('needs no bindings and resolves nothing, so a query of unbound parameters and an unknown vocabulary is formatted', () => {
            expect(format('nobody.nothing{x = it.whatever(other)}')).toBe('nobody.nothing { x = it.whatever(other) }');
            expect(() => domql.query('nobody.nothing').resolve()).toThrow(expect.objectContaining({ kind: 'validation' }));
        });

        it('refuses text that does not parse, a definition that is not one, and a query object another instance made', async () => {
            vi.resetModules();

            const { domql: other } = await import('#domql/domql.js');

            expect(() => format('panel {')).toThrow(expect.objectContaining({ kind: 'syntax' }));
            expect(() => domql.format({ version: 33, expression: { kind: 'nonsense' } })).toThrow(expect.objectContaining({ kind: 'structure' }));
            expect(() => domql.format(other.query('panel'))).toThrow(expect.objectContaining({ kind: 'structure', message: expect.stringContaining('query.definition') }));
        });
    });
});
