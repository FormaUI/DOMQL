import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

const read = (text, bindings = {}) => domql.query(text, bindings).evaluate();

/** Adds an element with the style to the document, which a real browser lays out. */
const add = (style, parent = document.body) => {
    const element = document.createElement('div');

    element.style.cssText = style;
    parent.append(element);

    return element;
};

describe('Geometry in a browser', () => {
    beforeEach(() => {
        document.body.style.margin = '0';
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('sizes', () => {
        it('measure the border box and the padding box as the browser lays them out', () => {
            const box = add('width: 120px; height: 40px; padding: 10px; border: 2px solid');

            expect(read('box.size', { box })).toEqual({ width: 144, height: 64 });
            expect(read('box.clientSize', { box })).toEqual({ width: 140, height: 60 });
        });

        it('keep a fractional size', () => {
            const box = add('width: 10.5px; height: 20.25px');

            expect(read('box.size', { box })).toEqual({ width: 10.5, height: 20.25 });
        });

        it('are the viewport size for the window', () => {
            const size = read('Domql.window.size');

            expect(size).toEqual({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
            expect(size.width).toBeGreaterThan(0);
        });
    });

    describe('rectangles', () => {
        it('are relative to the layout viewport', () => {
            const box = add('position: absolute; left: 30px; top: 50px; width: 100px; height: 20px');

            expect(read('box.rect', { box })).toEqual({ left: 30, top: 50, right: 130, bottom: 70, width: 100, height: 20 });
        });

        it('are relative to the border box of another element', () => {
            const parent = add('position: absolute; left: 40px; top: 60px; width: 200px; height: 200px');
            const child = add('position: absolute; left: 10px; top: 20px; width: 50px; height: 30px', parent);

            expect(read('child.rectRelativeTo(parent)', { child, parent })).toEqual({ left: 10, top: 20, right: 60, bottom: 50, width: 50, height: 30 });
        });

        it('follow a transform', () => {
            const box = add('position: absolute; left: 0; top: 0; width: 100px; height: 50px; transform: translate(15px, 25px)');

            expect(read('box.rect { left = it.left, top = it.top, width = it.width, height = it.height }', { box })).toEqual({ left: 15, top: 25, width: 100, height: 50 });
        });

        it('are the browser\'s bounding box for an element split across lines, whether or not its lines have an area', () => {
            for (const markup of ['<span>a span long enough to wrap across several lines of its paragraph</span>', '<span><span></span><br><span></span></span>']) {
                const paragraph = add('width: 120px');

                paragraph.innerHTML = markup;

                const span = paragraph.firstElementChild;
                const { left, top, width, height } = span.getBoundingClientRect();

                expect(span.getClientRects().length).toBeGreaterThan(1);
                expect(read('span.rect', { span })).toEqual({ left, top, right: left + width, bottom: top + height, width, height });
            }
        });

        it('give the height an aggregate reads', () => {
            const list = add('');

            [48, 64, 48].forEach(height => add(`height: ${height}px`, list));

            expect(read('list.children.max(it.rect?.height)', { list })).toBe(64);
            expect(read('list.children.sum(it.rect?.height)', { list })).toBe(160);
        });
    });

    describe('overlap', () => {
        it('compares two boxes, grown by a margin', () => {
            const first = add('position: absolute; left: 0; top: 0; width: 100px; height: 100px');
            const apart = add('position: absolute; left: 110px; top: 0; width: 50px; height: 50px');
            const touching = add('position: absolute; left: 100px; top: 0; width: 50px; height: 50px');
            const across = add('position: absolute; left: 90px; top: 90px; width: 50px; height: 50px');

            expect(read('first.overlaps({ other = other })', { first, other: apart })).toBe(false);
            expect(read('first.overlaps({ other = other, margin = 20 })', { first, other: apart })).toBe(true);
            expect(read('first.overlaps({ other = other })', { first, other: touching })).toBe(false);
            expect(read('first.overlaps({ other = other })', { first, other: across })).toBe(true);
        });
    });

    describe('a missing layout box', () => {
        it('answers null for a detached element', () => {
            const detached = document.createElement('div');

            expect(read('box.size', { box: detached })).toBeNull();
            expect(read('box.rect', { box: detached })).toBeNull();
        });

        it('answers null for display: none, display: contents and a hidden ancestor', () => {
            const none = add('display: none; width: 10px; height: 10px');
            const contents = add('display: contents');
            const hidden = add('display: none');
            const inside = add('width: 10px; height: 10px', hidden);

            for (const box of [none, contents, inside]) {
                expect(read('box.size', { box })).toBeNull();
                expect(read('box.rect', { box })).toBeNull();
                expect(read('box.clientSize', { box })).toBeNull();
                expect(read('box.attached', { box })).toBe(true);
            }
        });

        it('answers the actual measurements of a box that has no size or is hidden visually', () => {
            const empty = add('width: 0; height: 0');
            const invisible = add('width: 30px; height: 40px; visibility: hidden');
            const transparent = add('width: 30px; height: 40px; opacity: 0');

            expect(read('box.size', { box: empty })).toEqual({ width: 0, height: 0 });
            expect(read('box.size', { box: invisible })).toEqual({ width: 30, height: 40 });
            expect(read('box.size', { box: transparent })).toEqual({ width: 30, height: 40 });
        });

        it('answers null for an overlap with an element that has none', () => {
            const box = add('width: 10px; height: 10px');
            const none = add('display: none');

            expect(read('box.overlaps({ other = other })', { box, other: none })).toBeNull();
        });
    });

    describe('scrolling', () => {
        /** A scroll container 100 pixels square, borders of 5 and padding of 10, holding content of the size given. */
        const scroller = (style = '', content = 'width: 400px; height: 300px') => {
            const container = add(`width: 100px; height: 100px; padding: 10px; border: 5px solid; overflow: scroll; scrollbar-width: none; ${style}`);

            add(content, container);

            return container;
        };

        it('reads how far an element is scrolled along each axis, the extent of what it scrolls and its scrollport', () => {
            const container = scroller();

            container.scrollTo(30, 45);

            expect(read('box.scroll', { box: container })).toEqual({ inline: { offset: 30, extent: 420, viewport: 120 }, block: { offset: 45, extent: 320, viewport: 120 } });
        });

        it('reads the inline offset from the start under RTL, where the browser answers a negative scrollLeft', () => {
            const container = scroller('direction: rtl');

            container.scrollLeft = -30;

            expect(container.scrollLeft).toBe(-30);
            expect(read('box.scroll?.inline', { box: container })).toEqual({ offset: 30, extent: 420, viewport: 120 });
        });

        it('takes its inline axis to be vertical in a vertical writing mode', () => {
            const container = scroller('writing-mode: vertical-rl');

            container.scrollTop = 20;
            container.scrollLeft = -40;

            expect(read('box.scroll', { box: container })).toEqual({ inline: { offset: 20, extent: 320, viewport: 120 }, block: { offset: 40, extent: 420, viewport: 120 } });
        });

        it('reads an offset of 0 for an element that is no scroll container, and null for one without a layout box', () => {
            const plain = add('width: 50px; height: 20px');
            const none = add('display: none');

            expect(read('box.scroll?.block', { box: plain })).toEqual({ offset: 0, extent: 20, viewport: 20 });
            expect(read('box.scroll', { box: none })).toBeNull();
        });

        it('reads the window\'s scroll, its viewport the window\'s size', () => {
            add('height: 5000px');
            window.scrollTo(0, 120);

            try {
                const scroll = read('Domql.window.scroll');

                expect(scroll.block).toEqual({ offset: 120, extent: document.documentElement.scrollHeight, viewport: document.documentElement.clientHeight });
                expect(scroll.inline.offset).toBe(0);
            } finally {
                window.scrollTo(0, 0);
            }
        });

        it('reads the padding box without scrollbars, moved in by the borders', () => {
            const container = scroller('position: absolute; left: 20px; top: 30px; scrollbar-width: auto');
            const scrollbar = 120 - container.clientWidth;

            expect(read('box.clientRect', { box: container })).toEqual({ left: 25, top: 35, right: 25 + 120 - scrollbar, bottom: 35 + container.clientHeight, width: 120 - scrollbar, height: container.clientHeight });
        });

        it('finds the nearest ancestor the user can scroll, crossing shadow roots and slots, passing over hidden overflow and the body the viewport takes its overflow from', () => {
            document.body.style.overflow = 'auto';
            document.body.innerHTML = '<div id="outer" style="overflow-x: auto; overflow-y: hidden"><div id="clipped" style="overflow: hidden"><div id="host"><b id="slotted"></b></div></div></div>';

            try {
                const host = document.getElementById('host');
                const shadowRoot = host.attachShadow({ mode: 'open' });

                shadowRoot.innerHTML = '<div id="pane" style="overflow-x: hidden; overflow-y: auto"><slot></slot></div><p id="deep"></p>';

                const named = (text, bindings) => read(`${text}?["id"]`, bindings);

                expect(named('e.scrollContainer()', { e: document.getElementById('slotted') })).toBe('pane');
                expect(named('e.scrollContainer({ axis = "inline" })', { e: document.getElementById('slotted') })).toBe('outer');
                expect(named('e.scrollContainer()', { e: shadowRoot.getElementById('deep') })).toBe('outer');
                expect(named('e.scrollContainer({ axis = "block" })', { e: shadowRoot.getElementById('deep') })).toBeNull();
                expect(named('e.scrollContainer()', { e: document.getElementById('outer') })).toBeNull();
            } finally {
                document.body.style.overflow = '';
            }
        });

        it('follows a scroll, its content growing and a child added, missing a descendant overflowing a child of a fixed size until another change', async () => {
            const container = scroller('position: relative', 'width: 100px; height: 100px');
            const snapshots = [];
            const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve))));
            const watch = domql.query('box.scroll?.block { offset = it.offset, extent = it.extent }', { box: container }).watch({ acceptPartialObservation: true });

            watch.subscribe('change', (_sender, args) => snapshots.push(args.value));

            try {
                await frame();
                container.firstElementChild.style.height = '300px';
                await frame();
                container.scrollTop = 50;
                await frame();
                add('height: 100px', container);
                await frame();
                add('position: absolute; width: 10px; height: 600px', container.firstElementChild);
                await frame();

                expect(snapshots).toEqual([{ offset: 0, extent: 120 }, { offset: 0, extent: 320 }, { offset: 50, extent: 320 }, { offset: 50, extent: 420 }]);

                await watch.refreshAsync();

                expect(snapshots.at(-1).extent).toBeGreaterThan(420);
            } finally {
                watch.dispose();
            }
        });
    });

    describe('computed styles and grids', () => {
        it('read a custom property and a computed value, and answer null for one that is not set', () => {
            const box = add('--tier: medium; width: 120px');

            expect(read('box.style["--tier"]', { box })).toBe('medium');
            expect(read('box.style["width"]', { box })).toBe('120px');
            expect(read('box.style["--none"]', { box })).toBeNull();
        });

        it('read the limits of a box\'s size in pixels, an em resolved, and null for a percentage, none and auto', () => {
            const box = add('font-size: 10px; min-width: 12em; min-height: 33.5px; max-width: 50%; max-height: none');
            const flexItem = add('display: flex');
            const item = add('', flexItem);

            expect(read('box.sizeLimits', { box })).toEqual({ minWidth: 120, minHeight: 33.5, maxWidth: null, maxHeight: null });
            expect(read('item.sizeLimits { minWidth = it.minWidth }', { item })).toEqual({ minWidth: null });
        });

        it('read the sizes of the column tracks of a grid, and none for an element that is no grid', () => {
            const grid = add('display: grid; grid-template-columns: 100px 200px 50px');
            const block = add('');

            expect(read('grid.grid?.columns', { grid })).toEqual([100, 200, 50]);
            expect(read('grid.grid?.columns.count', { grid })).toBe(3);
            expect(read('block.grid?.columns', { block })).toEqual([]);
        });
    });

    describe('Boolean functions the browser decides', () => {
        it('knows when an element is disabled through its fieldset', () => {
            document.body.innerHTML = '<fieldset disabled><legend><input id="inLegend"></legend><input id="outside"></fieldset><input id="free">';

            const answer = id => read('input.disabled()', { input: document.getElementById(id) });

            expect(answer('outside')).toBe(true);
            expect(answer('inLegend')).toBe(false);
            expect(answer('free')).toBe(false);
        });

        it('knows what is text editable, read only and focused', () => {
            document.body.innerHTML = '<input id="text"><input id="readonly" readonly><input id="checkbox" type="checkbox"><div id="editable" contenteditable="true"><span id="inner"></span></div><div id="plain"></div>';

            const element = id => document.getElementById(id);
            const ask = (id, test) => read(`e.${test}()`, { e: element(id) });

            expect(ask('text', 'textEditable')).toBe(true);
            expect(ask('readonly', 'textEditable')).toBe(false);
            expect(ask('readonly', 'readonly')).toBe(true);
            expect(ask('checkbox', 'textEditable')).toBe(false);
            expect(ask('inner', 'textEditable')).toBe(true);
            expect(ask('plain', 'textEditable')).toBe(false);

            expect(ask('text', 'focus')).toBe(false);

            element('text').focus();

            expect(ask('text', 'focus')).toBe(true);
            expect(ask('readonly', 'focus')).toBe(false);
        });

        it('reads the selection of a text control', () => {
            const input = document.createElement('input');

            input.value = 'hello world';
            document.body.append(input);
            input.focus();
            input.setSelectionRange(2, 7);

            expect(read('input.selection { start = it.start, finish = it.end }', { input })).toEqual({ start: 2, finish: 7 });
            expect(read('input.hasSelection', { input })).toBe(true);
            expect(read('input.attribute["value"]', { input })).toBeNull();
        });

        it('follows a media query as it begins and ceases to match, and the query a dynamic key names', async () => {
            const width = document.documentElement.clientWidth;
            const frame = window.frameElement;
            const before = frame.style.width;
            const panel = add('');
            const snapshots = [];
            const settled = () => new Promise(resolve => setTimeout(resolve, 100));

            panel.setAttribute('data-query', `(min-width: ${width}px)`);

            const watch = domql.query('Domql.window.media[panel["data-query"] ?? "all"]', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', (_sender, args) => snapshots.push(args.value));

            try {
                await watch.readyAsync();
                frame.style.width = `${width - 100}px`;
                await settled();
                frame.style.width = before;
                await settled();
                panel.setAttribute('data-query', '(max-width: 0px)');
                await settled();

                expect(snapshots).toEqual([true, false, true, false]);
            } finally {
                watch.dispose();
                frame.style.width = before;
            }
        });

        it('answers the window around the document', () => {
            expect(read('Domql.window.devicePixelRatio')).toBeGreaterThan(0);
            expect(read('Domql.window.media["(min-width: 1px)"]')).toBe(true);
            expect(read('Domql.window.media["(max-width: 0px)"]')).toBe(false);
            expect(read('Domql.document.visible()')).toBe(true);
        });
    });
});
