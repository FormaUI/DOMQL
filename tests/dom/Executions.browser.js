import { afterEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
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

    describe('dispatching', () => {
        it('dispatches a custom event a listener reacts to as the page\'s own, untrusted, which runs no default action', async () => {
            document.body.innerHTML = '<a id="link" href="#elsewhere">Link</a>';

            const link = document.getElementById('link');
            const heard = [];

            link.addEventListener('click', event => heard.push({ kind: event.constructor.name, trusted: event.isTrusted, detail: event.detail }));

            expect(await execute('link.dispatch({ type = "click", detail = "synthetic" })', { link })).toBe(false);
            expect(heard).toEqual([{ kind: 'CustomEvent', trusted: false, detail: 'synthetic' }]);
            expect(window.location.hash).toBe('');
        });
    });

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

    describe('the browser\'s facilities', () => {
        /** A WAV file of a tenth of a second of silence, which a media element plays. */
        const silence = () => {
            const samples = 800;
            const bytes = new Uint8Array(44 + samples).fill(128);
            const view = new DataView(bytes.buffer);
            const text = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));

            text(0, 'RIFF');
            view.setUint32(4, 36 + samples, true);
            text(8, 'WAVEfmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, 8000, true);
            view.setUint32(28, 8000, true);
            view.setUint16(32, 1, true);
            view.setUint16(34, 8, true);
            text(36, 'data');
            view.setUint32(40, samples, true);

            return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        };

        it('answers that the browser refuses the clipboard to a page it gave no permission, as headless Chromium does', async () => {
            expect(await execute('Domql.window.writeClipboard("copied")')).toBe('refused');
            expect(await execute('Domql.window.readClipboard()')).toEqual({ outcome: 'refused', entries: [] });
        });

        it('answers that sharing is unsupported where the browser offers no Web Share API, as headless Chromium does', async () => {
            expect(await execute('Domql.window.requestShare({ title = "Report" })')).toBe(domql.query('Domql.window.share()').evaluate() ? 'refused' : 'unsupported');
        });

        it('plays, pauses and mutes a media element, answering how the browser took each request, its autoplay policy blocking it until the user acts', async () => {
            document.body.innerHTML = '<audio id="audio"></audio><audio id="broken"></audio><button id="button">Play</button>';

            const audio = document.getElementById('audio');
            const broken = document.getElementById('broken');
            const played = [];

            audio.src = silence();
            broken.src = URL.createObjectURL(new Blob([new Uint8Array(16)], { type: 'audio/wav' }));

            expect(await execute('audio.writeMuted(true)', { audio })).toBe(true);
            expect(await execute('audio.play()', { audio })).toBe('blocked');

            document.getElementById('button').addEventListener('click', () => played.push(execute('audio.play()', { audio })));
            await userEvent.click(document.getElementById('button'));

            expect(await Promise.all(played)).toEqual(['playing']);
            expect(await execute('audio.pause()', { audio })).toBe(true);
            expect(await execute('audio.pause()', { audio })).toBe(false);
            expect(await execute('broken.play()', { broken })).toBe('unsupported');
        });
    });

    describe('placing the selection', () => {
        it('selects a node, a node\'s contents and a point, as the selection then reads, and answers false for a node outside the document', async () => {
            document.body.innerHTML = '<div id="editor" contenteditable="true"><p id="first">one <img id="image" alt="">two</p><p id="second">three</p></div>';

            const [image, second] = ['image', 'second'].map(id => document.getElementById(id));
            const selection = () => domql.query('Domql.document.selection { type = it.type, text = it.range?.text, anchor = it.anchorElement?["id"] }').evaluate();

            expect(await execute('Domql.document.selection?.select({ node = image })', { image })).toBe(true);
            expect(selection()).toEqual({ type: 'Range', text: '', anchor: 'first' });
            expect(await execute('Domql.document.selection?.selectContents({ node = second })', { second })).toBe(true);
            expect(selection()).toEqual({ type: 'Range', text: 'three', anchor: 'second' });
            expect(await execute('Domql.document.selection?.selectContents({ node = second, collapse = "end" })', { second })).toBe(true);
            expect(selection()).toEqual({ type: 'Caret', text: '', anchor: 'second' });
            const holder = document.createElement('div');

            holder.innerHTML = '<span></span>';

            expect(await execute('Domql.document.selection?.select({ node = detached })', { detached: holder.firstChild })).toBe(false);
            expect((await execute('Domql.document.selection?.select({ node = holder })', { holder }).catch(error => error)).cause.name).toBe('InvalidNodeTypeError');
        });
    });

    describe('form controls', () => {
        it('writes a checkbox mixed, a field\'s value and its selection, as the page\'s code writes them, which the browser shows', async () => {
            document.body.innerHTML = '<input id="box" type="checkbox"><input id="field" value="draft">';

            const box = document.getElementById('box');
            const field = document.getElementById('field');

            expect(await execute('box.writeIndeterminate(true)', { box })).toBe(true);
            expect(box.matches(':indeterminate')).toBe(true);
            expect(await execute('field.writeValue("final")', { field })).toBe('draft');
            expect(await execute('field.writeSelection({ start = 1, end = 9 })', { field })).toBe(true);
            expect(domql.query('field { value = it.value, selection = it.selection }', { field }).evaluate()).toEqual({ value: 'final', selection: { start: 1, end: 5 } });
        });

        it('answers false for a field of a type the selection API excludes, as a number field', async () => {
            document.body.innerHTML = '<input id="field" type="number" value="12">';

            expect(await execute('field.writeSelection({ start = 0, end = 1 })', { field: document.getElementById('field') })).toBe(false);
        });

        it('fails to write a file input\'s value other than the empty string, which the browser refuses', async () => {
            document.body.innerHTML = '<input id="picker" type="file">';

            const picker = document.getElementById('picker');

            expect((await execute('picker.writeValue("x")', { picker }).catch(error => error)).cause.name).toBe('InvalidStateError');
            expect(await execute('picker.writeValue("")', { picker })).toBe('');
        });

        it('places the selection at offsets in the text of an editing host\'s nested elements', async () => {
            document.body.innerHTML = '<div id="editor" contenteditable="true"><p>one <b>two</b></p><p>three</p></div>';

            const editor = document.getElementById('editor');

            expect(await execute('editor.writeSelection({ start = 5, end = 9 })', { editor })).toBe(true);
            expect(document.getSelection().getRangeAt(0).toString()).toBe('woth');
            expect(domql.query('editor.selection', { editor }).evaluate()).toEqual({ start: 5, end: 9 });
        });
    });

    describe('pointer capture', () => {
        it('captures the pointer pressed on an element while its press is handled, and releases it, answering whether each changed it', async () => {
            document.body.innerHTML = '<div id="handle" style="width: 50px; height: 50px"></div>';

            const handle = document.getElementById('handle');
            const answers = [];

            handle.addEventListener('pointerdown', event => {
                const bindings = { handle, id: event.pointerId };

                answers.push(execute('handle.capturePointer({ pointerId = id })', bindings));
                answers.push(handle.hasPointerCapture(event.pointerId));
                answers.push(execute('handle.releasePointer({ pointerId = id })', bindings));
                answers.push(execute('handle.releasePointer({ pointerId = id })', bindings));
            });

            await userEvent.click(handle);

            expect(await Promise.all(answers)).toEqual([true, true, true, false]);
        });

        it('answers false for a pointer that is not active, which the browser refuses to capture', async () => {
            document.body.innerHTML = '<div id="handle"></div>';

            expect(await execute('handle.capturePointer({ pointerId = 12345 })', { handle: document.getElementById('handle') })).toBe(false);
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
