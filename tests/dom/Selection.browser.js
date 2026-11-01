import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/**
 * Selections in a real browser, each read two ways after every cause: evaluated afresh, which is what the browser decides, and watched, which is what the member's observations catch.
 * Where the two agree, the watch caught the change; where only the evaluation moved, the change is one the member's contract says a watch misses.
 */
describe('Selections in a browser', () => {
    let watches;

    beforeEach(() => {
        watches = [];
    });

    afterEach(() => {
        watches.forEach(watch => watch.dispose());
        document.getSelection().removeAllRanges();
        document.body.innerHTML = '';
    });

    /** Waits for the observers and the queued selection events to deliver, and for the watch to evaluate. */
    const settle = async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    /** The page the markup writes, and each element of it by its id. */
    const page = markup => {
        document.body.innerHTML = markup;

        return new Proxy({}, { get: (_, id) => document.getElementById(id) });
    };

    /** Watches the query, refusing partial observation unless asked, and answers what the watch last reported and what the browser decides now. */
    const watching = async (text, bindings, { acceptPartialObservation = false } = {}) => {
        const snapshots = [];
        const watch = domql.query(text, bindings).watch({ schedule: 'immediate', acceptPartialObservation });

        watch.subscribe('change', (sender, args) => snapshots.push(args.status === 'failed' ? args.error : args.value));
        watches.push(watch);
        await settle();

        return {
            after: async cause => {
                await cause();
                await settle();

                return { watched: snapshots.at(-1), decided: domql.query(text, bindings).evaluate() };
            },
            get watched() {
                return snapshots.at(-1);
            },
        };
    };

    const SELECTION = 'Domql.document.selection { type = it.type, anchor = it.anchorElement?["id"], text = it.range?.text }';

    describe('the document selection', () => {
        it('follows a selection the page\'s code makes, collapses and moves, since the browser fires selectionchange for each', async () => {
            const { b, link } = page('<p id="p">hello <b id="b">world</b> <a id="link" href="#">link</a></p>');
            const selection = await watching(SELECTION, {}, { acceptPartialObservation: true });
            const selected = { type: 'Range', anchor: 'b', text: 'world' };

            expect(await selection.after(() => document.getSelection().selectAllChildren(b))).toEqual({ watched: selected, decided: selected });
            expect(await selection.after(() => document.getSelection().collapse(link.firstChild, 2))).toEqual({ watched: { type: 'Caret', anchor: 'link', text: '' }, decided: { type: 'Caret', anchor: 'link', text: '' } });
            expect(await selection.after(() => document.getSelection().removeAllRanges())).toEqual({ watched: { type: 'None', anchor: null, text: null }, decided: { type: 'None', anchor: null, text: null } });
        });

        it('follows the nodes holding it removed from the document, which collapses it without a selectionchange', async () => {
            const { b } = page('<p id="p">hello <b id="b">world</b></p>');
            const selection = await watching(SELECTION, {}, { acceptPartialObservation: true });

            await selection.after(() => document.getSelection().selectAllChildren(b));

            expect(await selection.after(() => b.remove())).toEqual({ watched: { type: 'Caret', anchor: 'p', text: '' }, decided: { type: 'Caret', anchor: 'p', text: '' } });
        });

        it('follows a range\'s text as the text it holds is edited', async () => {
            const { b } = page('<p id="p">hello <b id="b">world</b></p>');
            const text = await watching('Domql.document.selection?.range?.text', {}, { acceptPartialObservation: true });

            await text.after(() => document.getSelection().setBaseAndExtent(b.firstChild, 0, b.firstChild, 5));

            expect(await text.after(() => b.firstChild.insertData(2, 'W'))).toEqual({ watched: 'woWrld', decided: 'woWrld' });
        });

        it('measures a range\'s box against the layout viewport', () => {
            const { b } = page('<p style="margin: 0; position: absolute; left: 10px; top: 20px; font: 16px monospace">x<b id="b">abc</b></p>');

            document.getSelection().selectAllChildren(b);

            const rect = domql.query('Domql.document.selection?.range?.rect').evaluate();
            const box = b.getBoundingClientRect();

            expect(rect).toEqual({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height });
            expect(rect.left).toBeGreaterThan(10);
        });
    });

    describe('an element\'s selection', () => {
        it('follows a selection the page\'s code sets in a text control, which fires selectionchange at the control, and the value it sets', async () => {
            const { field } = page('<input id="field" value="hello world">');
            const selection = await watching('e.selection', { e: field });
            const has = await watching('e.hasSelection', { e: field });

            expect(await selection.after(() => field.setSelectionRange(2, 5))).toEqual({ watched: { start: 2, end: 5 }, decided: { start: 2, end: 5 } });
            expect(has.watched).toBe(true);
            expect(await selection.after(() => { field.value = 'xy'; })).toEqual({ watched: { start: 2, end: 2 }, decided: { start: 2, end: 2 } });
            expect(has.watched).toBe(false);
        });

        it('reads the document selection as offsets in an editable element\'s text, and null where it lies outside', async () => {
            const { editor, outside, word } = page('<div id="editor" contenteditable><p>hello <b id="word">world</b></p></div><p id="outside">other</p>');
            const selection = await watching('e.selection', { e: editor });

            expect(await selection.after(() => document.getSelection().setBaseAndExtent(word.firstChild, 1, word.firstChild, 4))).toEqual({ watched: { start: 7, end: 10 }, decided: { start: 7, end: 10 } });
            expect(await selection.after(() => editor.firstElementChild.prepend('>> '))).toEqual({ watched: { start: 10, end: 13 }, decided: { start: 10, end: 13 } });
            expect(await selection.after(() => document.getSelection().selectAllChildren(outside))).toEqual({ watched: null, decided: null });
        });

        it('follows the user typing in an editable element, which moves the caret', async () => {
            const { editor } = page('<div id="editor" contenteditable>abc</div>');
            const selection = await watching('e.selection', { e: editor });

            await userEvent.click(editor);
            document.getSelection().collapse(editor.firstChild, 3);

            expect(await selection.after(() => userEvent.keyboard('de'))).toEqual({ watched: { start: 5, end: 5 }, decided: { start: 5, end: 5 } });
        });
    });
});
