import { afterEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

/**
 * Scrolling a box whose scroll origin its style places at the end, as a reversed flex container's, from an offset of exactly 0, where its position reads 0 as a normal
 * axis's does: the scroll goes into the content, reads back as the offset asked for, and returns to the origin.
 */
describe('scrolling a reversed axis from its origin', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    const execute = (text, bindings) => domql.executeAsync(text, bindings);
    const offsets = box => domql.evaluate('box.scroll { inline = it.inline.offset, block = it.block.offset }', { box });

    /** Each number within a pixel of the one expected, since an engine may snap a scroll position to the device's pixels, as Firefox does. */
    const near = (actual, expected) => expect(actual.map(value => (typeof value === 'number' ? Math.round(value) : Object.fromEntries(Object.entries(value).map(([key, part]) => [key, Math.round(part)]))))).toEqual(expected);

    /** A 100 by 100 scroll container of the style given, holding the items given, each of the size given. */
    const container = (style, { count = 10, width = 100, height = 50 } = {}) => {
        const items = Array.from({ length: count }, (_, index) => `<div style="flex: none; width: ${width}px; height: ${height}px">${index}</div>`).join('');

        document.body.insertAdjacentHTML('beforeend', `<div id="box" style="width: 100px; height: 100px; overflow: auto; ${style}">${items}</div>`);

        return document.getElementById('box');
    };

    it('scrolls a column-reverse list from 0 into its content along the block axis, reads the offset back, and returns to 0', async () => {
        const box = container('display: flex; flex-direction: column-reverse');

        near([box.scrollTop, offsets(box)], [0, { inline: 0, block: 0 }]);
        expect(await execute('box.scrollTo({ block = 40 })', { box })).toBe(true);
        near([box.scrollTop, offsets(box)], [-40, { inline: 0, block: 40 }]);
        expect(await execute('box.scrollBy({ block = 20 })', { box })).toBe(true);
        near([box.scrollTop, offsets(box)], [-60, { inline: 0, block: 60 }]);
        expect(await execute('box.scrollTo({ block = 0 })', { box })).toBe(true);
        near([box.scrollTop, offsets(box)], [0, { inline: 0, block: 0 }]);
    });

    it('scrolls a row-reverse list from 0 along the inline axis, reversed under LTR and not under RTL, where the two reversals undo each other', async () => {
        const ltr = container('display: flex; flex-direction: row-reverse', { width: 50, height: 100 });

        expect(await execute('box.scrollTo({ inline = 30 })', { box: ltr })).toBe(true);
        near([ltr.scrollLeft, offsets(ltr).inline], [-30, 30]);
        ltr.remove();

        const rtl = container('display: flex; flex-direction: row-reverse; direction: rtl', { width: 50, height: 100 });

        expect(await execute('box.scrollTo({ inline = 30 })', { box: rtl })).toBe(true);
        near([rtl.scrollLeft, offsets(rtl).inline], [30, 30]);
    });

    it('scrolls a wrap-reverse container from 0 along its cross axis, whose lines stack from its end', async () => {
        const box = container('display: flex; flex-wrap: wrap-reverse');

        expect(await execute('box.scrollTo({ block = 40 })', { box })).toBe(true);
        near([box.scrollTop, offsets(box).block], [-40, 40]);
    });

    it('scrolls a normal list from 0 as before, its position counted up', async () => {
        const box = container('display: flex; flex-direction: column');

        expect(await execute('box.scrollTo({ block = 40 })', { box })).toBe(true);
        near([box.scrollTop, offsets(box).block], [40, 40]);
    });
});
