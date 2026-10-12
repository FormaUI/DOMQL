import { describe, it, expect } from 'vitest';
import { Domql } from '#domql/domql.js';
import { DefinitionWriter } from '#domql/language/DefinitionWriter.mjs';

const panel = document.createElement('div');

describe('DefinitionWriter', () => {
    it.each([
        '@panel.size',
        '@panel.attributeOf("data-key")',
        '@panel.intersects(root: @panel, margin: 10)',
        '@panel { size: size, box: { width: size.width }, kind: "panel", rank: 3, none: null }',
        '@panel.children.where(is "attached").max(size.width)',
        '(@panel is "attached" or @panel is "focused") and @panel is "disabled"',
        '@panel is "attached" or @panel is "focused" and @panel is "disabled"',
        '@first and (@second and @third)',
        '(@first or @second) or @third',
        '(@panel is "attached").size',
        '(@first or @second) { size: size }',
        '(@panel).children.count',
        '@panel has "children"',
        '@window { ratio: devicePixelRatio, visible: @document is "visible" }',
    ])('writes text that parses back to the same definition: %s', text => {
        const { definition } = Domql.parse(text, { panel });

        expect(Domql.parse(DefinitionWriter.write(definition.query), { panel }).definition).toEqual(definition);
    });

    it('writes the parentheses a grouping needs, and none it does not', () => {
        const write = text => DefinitionWriter.write(Domql.parse(text, { panel }).definition.query);

        expect(write('(@first or @second) and @third')).toBe('(@first or @second) and @third');
        expect(write('(@first and @second) or @third')).toBe('@first and @second or @third');
        expect(write('(@panel is "attached").size')).toBe('(@panel is "attached").size');
        expect(write('((@panel)).size')).toBe('@panel.size');
    });

    it('writes a member by its chain and its arguments, by name where they are named', () => {
        const { definition } = Domql.parse('@panel.intersects(@panel, margin: 5)', { panel });

        expect(DefinitionWriter.write(definition.query)).toBe('@panel.intersects(@panel, margin: 5)');
    });
});
