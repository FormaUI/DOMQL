import { describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';
import { DefinitionWriter } from '#domql/language/DefinitionWriter.mjs';

const panel = document.createElement('div');

describe('DefinitionWriter', () => {
    it.each([
        '@panel.size',
        '@panel attributeOf "data-key"',
        '@panel intersects { root: @panel, margin: 10 }',
        '@panel { size: self.size, box: { width: self.size.width }, kind: "panel", rank: 3, none: null }',
        '@panel.children.where(self is "attached").max(self.size.width)',
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
        '@panel.rectRelativeTo(@panel.parent).top',
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

    it('writes the argument of a named operation as an initial expression, grouping any other', () => {
        const target = { kind: 'parameter', name: 'panel' };
        const named = argument => ({ kind: 'namedOperation', target, name: 'attributeOf', argument });

        expect(DefinitionWriter.write(named({ kind: 'member', target, name: 'size' }))).toBe('@panel attributeOf (@panel.size)');
        expect(DefinitionWriter.write(named({ kind: 'object', fields: [{ name: 'a', value: { kind: 'literal', value: 1 } }] }))).toBe('@panel attributeOf { a: 1 }');
        expect(DefinitionWriter.write({ kind: 'member', target: named({ kind: 'literal', value: 'role' }), name: 'length' })).toBe('(@panel attributeOf "role").length');
    });

    it('writes an options object as the fields it is written with', () => {
        const { definition } = domql.query('@panel intersects { root: @panel, margin: 5 }', { panel });

        expect(DefinitionWriter.write(definition.query)).toBe('@panel intersects { root: @panel, margin: 5 }');
    });
});
