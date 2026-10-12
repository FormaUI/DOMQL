import { describe, it, expect } from 'vitest';
import { Domql } from '#domql/domql.js';
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
    ])('writes text that parses back to the same definition: %s', text => {
        const { definition } = Domql.parse(text, { panel });

        expect(Domql.parse(DefinitionWriter.write(definition.query), { panel }).definition).toEqual(definition);
    });

    it('writes the parentheses a grouping needs, and none it does not', () => {
        const write = text => DefinitionWriter.write(Domql.parse(text, { panel }).definition.query);

        expect(write('(@first or @second) and @third')).toBe('(@first or @second) and @third');
        expect(write('(@first and @second) or @third')).toBe('@first and @second or @third');
        expect(write('(@panel is "attached").size')).toBe('(@panel is "attached").size');
        expect(write('@panel.size')).toBe('@panel.size');
        expect(write('((@panel attributeOf "role")).length')).toBe('(@panel attributeOf "role").length');
        expect(write('(@panel attributeOf "role") is "set"')).toBe('@panel attributeOf "role" is "set"');
    });

    it('writes the argument of a named operation as an initial expression, grouping any other', () => {
        const target = { kind: 'parameter', name: 'panel' };
        const named = argument => ({ kind: 'namedOperation', target, name: 'attributeOf', argument });

        expect(DefinitionWriter.write(named({ kind: 'member', target, name: 'size' }))).toBe('@panel attributeOf (@panel.size)');
        expect(DefinitionWriter.write(named({ kind: 'object', fields: [{ name: 'a', value: { kind: 'literal', value: 1 } }] }))).toBe('@panel attributeOf { a: 1 }');
        expect(DefinitionWriter.write({ kind: 'member', target: named({ kind: 'literal', value: 'role' }), name: 'length' })).toBe('(@panel attributeOf "role").length');
    });

    it('writes an options object as the fields it is written with', () => {
        const { definition } = Domql.parse('@panel intersects { root: @panel, margin: 5 }', { panel });

        expect(DefinitionWriter.write(definition.query)).toBe('@panel intersects { root: @panel, margin: 5 }');
    });
});
