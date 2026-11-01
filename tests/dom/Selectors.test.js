import { describe, it, expect } from 'vitest';
import { Selectors } from '#domql/dom/Selectors.mjs';

describe('Selectors', () => {
    describe('readsOf', () => {
        it('reads nothing beside structure for type selectors, the universal selector and combinators', () => {
            expect(Selectors.readsOf('div > ul li + li ~ * span')).toEqual({ attributes: [], focus: false, popovers: false });
        });

        it('reads the class for a class selector and the id for an id selector', () => {
            expect(Selectors.readsOf('#panel .row.selected')).toEqual({ attributes: ['id', 'class'], focus: false, popovers: false });
        });

        it('reads each attribute an attribute selector names, in the case written and in lowercase, past a namespace and the value it compares', () => {
            expect(Selectors.readsOf('[data-key] [aria-selected="true"] svg[viewBox] [*|lang] [xml|space~=x] [data-x|="a.b#c"]')).toEqual({
                attributes: ['data-key', 'aria-selected', 'viewBox', 'viewbox', 'lang', 'space', 'data-x'], focus: false, popovers: false,
            });
        });

        it('reads no class or id that a string or an escape holds', () => {
            expect(Selectors.readsOf('[title=".a #b"] .a\\.b #x\\#y')).toEqual({ attributes: ['title', 'class', 'id'], focus: false, popovers: false });
        });

        it('reads an attribute name an escape writes as the character it stands for', () => {
            expect(Selectors.readsOf('[data\\:key] [\\64 ata-x]')).toEqual({ attributes: ['data:key', 'data-x'], focus: false, popovers: false });
        });

        it('reads what a pseudo-class tests: focus, a popover\'s showing, or the attributes its state follows', () => {
            expect(Selectors.readsOf(':focus-within')).toEqual({ attributes: [], focus: true, popovers: false });
            expect(Selectors.readsOf('[popover]:popover-open')).toEqual({ attributes: ['popover'], focus: false, popovers: true });
            expect(Selectors.readsOf('input:checked, button:disabled')).toEqual({ attributes: ['checked', 'selected', 'disabled'], focus: false, popovers: false });
            expect(Selectors.readsOf('a:any-link:lang(en)')).toEqual({ attributes: ['href', 'lang'], focus: false, popovers: false });
        });

        it('reads the selectors a functional pseudo-class holds, and nothing more for structure', () => {
            expect(Selectors.readsOf(':is(.a, [data-b]):not(#c):nth-child(2n of .d):has(> :focus)')).toEqual({ attributes: ['class', 'data-b', 'id'], focus: true, popovers: false });
        });

        it('reads nothing beside structure for a state no attribute holds, and nothing for a pseudo-element', () => {
            expect(Selectors.readsOf(':hover:active:target:empty:first-child::before')).toEqual({ attributes: [], focus: false, popovers: false });
        });

        it('reads every attribute where it holds a pseudo-class whose reads it doesn\'t know, whatever its case', () => {
            expect(Selectors.readsOf('.a:-moz-something')).toEqual({ attributes: null, focus: false, popovers: false });
            expect(Selectors.readsOf('.a:FOCUS')).toEqual({ attributes: ['class'], focus: true, popovers: false });
        });
    });
});
