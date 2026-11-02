import { afterEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

/** What DOMQL's built-in executions change in a real browser, and what each answers. */
describe('Executions in a browser', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    });

    /** Carries out the once execution the text ends in, with the bindings, answering a promise of its result. */
    const execute = (text, bindings = {}) => domql.query(text, bindings).executeAsync();

    /** A box that scrolls, 100 pixels square, holding content of the size given, in the writing mode and direction given. */
    const scroller = ({ width = 500, height = 500, style = '' } = {}) => {
        document.body.insertAdjacentHTML('beforeend', `<div id="box" style="width: 100px; height: 100px; overflow: auto; ${style}"><div style="width: ${width}px; height: ${height}px"></div></div>`);

        return document.getElementById('box');
    };

    describe('focusing', () => {
        it('focuses an element that can take focus, answering that focus landed on it, and answers false for one that can\'t', async () => {
            document.body.innerHTML = '<input id="field"><div id="plain"></div><button id="hidden" hidden>Hidden</button>';

            const [field, plain, hidden] = ['field', 'plain', 'hidden'].map(id => document.getElementById(id));

            expect(await execute('field.takeFocus()', { field })).toBe(true);
            expect(document.activeElement).toBe(field);
            expect(await execute('plain.takeFocus()', { plain })).toBe(false);
            expect(await execute('hidden.takeFocus()', { hidden })).toBe(false);
            expect(document.activeElement).toBe(field);
        });

        it('scrolls the element it focuses into view unless told not to', async () => {
            document.body.innerHTML = '<div style="height: 3000px"></div><input id="field">';

            const field = document.getElementById('field');

            expect(await execute('field.takeFocus({ preventScroll = true })', { field })).toBe(true);
            expect(window.scrollY).toBe(0);
            field.blur();
            expect(await execute('field.takeFocus()', { field })).toBe(true);
            expect(window.scrollY).toBeGreaterThan(0);
        });
    });

    describe('scrolling', () => {
        it('scrolls a box to an offset and by one, answering whether it moved, a scroll past its end held at its end', async () => {
            const box = scroller();

            expect(await execute('box.scrollTo({ block = 50 })', { box })).toBe(true);
            expect(box.scrollTop).toBe(50);
            expect(await execute('box.scrollTo({ block = 50 })', { box })).toBe(false);
            expect(await execute('box.scrollBy({ inline = 30, block = -20 })', { box })).toBe(true);
            expect([box.scrollLeft, box.scrollTop]).toEqual([30, 30]);
            expect(await execute('box.scrollTo({ block = 10000 })', { box })).toBe(true);
            expect(box.scrollTop).toBe(400);
            expect(await execute('box.scrollBy({ block = 10 })', { box })).toBe(false);
        });

        it('answers a smooth scroll once it has ended, its box at the offset given', async () => {
            const box = scroller();

            expect(await execute('box.scrollTo({ block = 300, behavior = "smooth" })', { box })).toBe(true);
            expect(box.scrollTop).toBe(300);
            expect(await execute('box.scrollTo({ block = 300, behavior = "smooth" })', { box })).toBe(false);
        });

        it('answers a smooth scroll once it has ended, where the browser\'s scroll method answers nothing that says when', async () => {
            const box = scroller();
            const scrollTo = box.scrollTo;

            box.scrollTo = options => {
                scrollTo.call(box, options);
            };

            expect(await execute('box.scrollTo({ block = 300, behavior = "smooth" })', { box })).toBe(true);
            expect(box.scrollTop).toBe(300);
        });

        it('scrolls a box under RTL by its offset from the start of its content, which the browser counts down from 0', async () => {
            const box = scroller({ style: 'direction: rtl' });

            expect(await execute('box.scrollTo({ inline = 100 })', { box })).toBe(true);
            expect(box.scrollLeft).toBe(-100);
            expect(domql.query('box.scroll?.inline.offset', { box }).evaluate()).toBe(100);
            expect(await execute('box.scrollBy({ inline = 50 })', { box })).toBe(true);
            expect(box.scrollLeft).toBe(-150);
            expect(await execute('box.scrollTo({ inline = 0 })', { box })).toBe(true);
            expect(box.scrollLeft).toBe(0);
        });

        it('scrolls a box in a vertical writing mode along its axes, its inline axis vertical and its block axis running right to left', async () => {
            const box = scroller({ style: 'writing-mode: vertical-rl' });

            expect(await execute('box.scrollTo({ inline = 40, block = 60 })', { box })).toBe(true);
            expect([box.scrollTop, box.scrollLeft]).toEqual([40, -60]);
            expect(domql.query('box.scroll { inline = it.inline.offset, block = it.block.offset }', { box }).evaluate()).toEqual({ inline: 40, block: 60 });
        });

        it('scrolls the window, answering whether it moved', async () => {
            document.body.innerHTML = '<div style="height: 3000px"></div>';

            expect(await execute('Domql.window.scrollTo({ block = 200 })')).toBe(true);
            expect(window.scrollY).toBe(200);
            expect(await execute('Domql.window.scrollBy({ block = -50, behavior = "smooth" })')).toBe(true);
            expect(window.scrollY).toBe(150);
            expect(await execute('Domql.window.scrollBy({ inline = 10 })')).toBe(false);
        });

        it('answers false for a box that doesn\'t scroll', async () => {
            document.body.innerHTML = '<div id="plain" style="width: 100px; height: 100px"></div>';

            expect(await execute('plain.scrollTo({ block = 50 })', { plain: document.getElementById('plain') })).toBe(false);
        });
    });

    describe('the top layer', () => {
        it('shows and hides a popover, answering whether it changed it, and false where it is in that state already', async () => {
            document.body.innerHTML = '<div id="tip" popover>Tip</div>';

            const tip = document.getElementById('tip');

            expect(await execute('tip.showPopover()', { tip })).toBe(true);
            expect(tip.matches(':popover-open')).toBe(true);
            expect(await execute('tip.showPopover()', { tip })).toBe(false);
            expect(await execute('tip.hidePopover()', { tip })).toBe(true);
            expect(tip.matches(':popover-open')).toBe(false);
            expect(await execute('tip.hidePopover()', { tip })).toBe(false);
        });

        it('answers false where a beforetoggle listener keeps the popover from showing', async () => {
            document.body.innerHTML = '<div id="tip" popover>Tip</div>';

            const tip = document.getElementById('tip');

            tip.addEventListener('beforetoggle', event => event.preventDefault());

            expect(await execute('tip.showPopover()', { tip })).toBe(false);
            expect(tip.matches(':popover-open')).toBe(false);
        });

        it('fails to show an element that is no popover, or one in no document, the browser\'s refusal its cause, and hiding one answers false', async () => {
            document.body.innerHTML = '<div id="plain">Plain</div>';

            const plain = document.getElementById('plain');
            const detached = document.createElement('div');

            detached.popover = 'auto';

            const refusal = await execute('plain.showPopover()', { plain }).catch(error => error);

            expect(refusal).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', cause: expect.objectContaining({ name: 'NotSupportedError' }) });
            expect((await execute('detached.showPopover()', { detached }).catch(error => error)).cause.name).toBe('InvalidStateError');
            expect(await execute('plain.hidePopover()', { plain })).toBe(false);
        });

        it('opens a dialog modally and closes it with a return value, answering whether each changed it', async () => {
            document.body.innerHTML = '<dialog id="dialog">Dialog</dialog>';

            const dialog = document.getElementById('dialog');

            expect(await execute('dialog.showModal()', { dialog })).toBe(true);
            expect(dialog.matches(':modal')).toBe(true);
            expect(await execute('dialog.showModal()', { dialog })).toBe(false);
            expect(await execute('dialog.close({ returnValue = "saved" })', { dialog })).toBe(true);
            expect([dialog.open, dialog.returnValue]).toEqual([false, 'saved']);
            expect(await execute('dialog.close()', { dialog })).toBe(false);
        });

        it('fails to open modally a dialog open without being modal, the browser\'s refusal its cause', async () => {
            document.body.innerHTML = '<dialog id="dialog" open>Dialog</dialog>';

            const dialog = document.getElementById('dialog');

            expect((await execute('dialog.showModal()', { dialog }).catch(error => error)).cause.name).toBe('InvalidStateError');
            expect(dialog.matches(':modal')).toBe(false);
            expect(await execute('dialog.close()', { dialog })).toBe(true);
        });
    });

    describe('scrolling into view', () => {
        it('scrolls an element into view through the boxes that hold it, answering that it is in view once the scroll has ended', async () => {
            document.body.innerHTML = '<div style="height: 2000px"></div><div id="box" style="width: 100px; height: 100px; overflow: auto"><div style="height: 600px"></div><p id="far" style="margin: 0">Far</p></div>';

            const far = document.getElementById('far');

            expect(await execute('far.scrollIntoView({ behavior = "smooth" })', { far })).toBe(true);
            expect(far.getBoundingClientRect().top).toBeLessThan(window.innerHeight);
            expect(document.getElementById('box').scrollTop).toBeGreaterThan(0);
        });

        it('aligns the element along each axis as it is told', async () => {
            document.body.innerHTML = '<div id="box" style="width: 100px; height: 200px; overflow: auto"><div style="height: 600px"></div><p id="far" style="margin: 0; height: 20px">Far</p><div style="height: 600px"></div></div>';

            const box = document.getElementById('box');
            const far = document.getElementById('far');

            expect(await execute('far.scrollIntoView({ block = "end" })', { far })).toBe(true);
            expect(box.scrollTop).toBe(420);
            expect(await execute('far.scrollIntoView({ block = "center" })', { far })).toBe(true);
            expect(box.scrollTop).toBe(510);
        });

        it('answers false for an element the browser can\'t bring into view: one with no layout box, and one a box that clips without scrolling holds outside its edges', async () => {
            document.body.innerHTML = '<div id="none" style="display: none"></div><div style="width: 100px; height: 100px; overflow: clip"><p id="clipped" style="margin: 0; position: relative; top: 300px">Clipped</p></div>';

            expect(await execute('none.scrollIntoView()', { none: document.getElementById('none') })).toBe(false);
            expect(await execute('clipped.scrollIntoView()', { clipped: document.getElementById('clipped') })).toBe(false);
        });
    });
});
