import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/**
 * The values and the text of elements in a real browser, each read two ways after every cause: evaluated afresh, which is what the browser decides, and watched, which is what the member's observations catch.
 * Where the two agree, the watch caught the change; where only the evaluation moved, the change is one the member's contract says a watch misses.
 */
describe('Values and text in a browser', () => {
    let watches;

    beforeEach(() => {
        watches = [];
    });

    afterEach(() => {
        watches.forEach(watch => watch.dispose());
        document.body.innerHTML = '';
    });

    /** Waits for the observers and the events to deliver, and for the watch to evaluate. */
    const settle = async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    /** The page the markup writes, and each element of it by its id. */
    const page = markup => {
        document.body.innerHTML = markup;

        return new Proxy({}, { get: (_, id) => document.getElementById(id) });
    };

    /** Watches the query, and answers what the watch last reported and what the browser decides now. */
    const watching = async (text, bindings) => {
        const snapshots = [];
        const watch = domql.query(text, bindings).watch({ schedule: 'immediate', acceptPartialObservation: true });

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

    describe('value', () => {
        it('follows what the user types and selects, and a form reset', async () => {
            const { form, field, list } = page('<form id="form"><input id="field" value="a"><select id="list"><option>x</option><option>y</option></select></form>');
            const fieldValue = await watching('e.value', { e: field });
            const listValue = await watching('e.value', { e: list });

            expect(await fieldValue.after(() => userEvent.fill(field, 'abc'))).toEqual({ watched: 'abc', decided: 'abc' });
            expect(await listValue.after(() => userEvent.selectOptions(list, 'y'))).toEqual({ watched: 'y', decided: 'y' });
            expect(await fieldValue.after(() => form.reset())).toEqual({ watched: 'a', decided: 'a' });
        });

        it('follows the value attribute of a field the user has not edited, and misses a value the page\'s code sets', async () => {
            const { field } = page('<input id="field" value="a">');
            const value = await watching('e.value', { e: field });

            expect(await value.after(() => field.setAttribute('value', 'b'))).toEqual({ watched: 'b', decided: 'b' });
            expect(await value.after(() => { field.value = 'c'; })).toEqual({ watched: 'b', decided: 'c' });
        });
    });

    describe('indeterminate, as :indeterminate matches', () => {
        it('follows the user clicking a mixed checkbox, and misses the page\'s code making it mixed', async () => {
            const { box } = page('<input id="box" type="checkbox">');
            const indeterminate = await watching('e.indeterminate', { e: box });

            expect(await indeterminate.after(() => { box.indeterminate = true; })).toEqual({ watched: false, decided: true });
            expect(await indeterminate.after(() => userEvent.click(box))).toEqual({ watched: false, decided: false });
        });

        it('follows a radio group gaining a checked button, and a progress bar given a value', async () => {
            const { a, bar } = page('<input id="a" type="radio" name="g"><input id="b" type="radio" name="g"><progress id="bar"></progress>');
            const radio = await watching('e.indeterminate', { e: a });
            const progress = await watching('e.indeterminate', { e: bar });

            expect(radio.watched).toBe(true);
            expect(await radio.after(() => userEvent.click(document.getElementById('b')))).toEqual({ watched: false, decided: false });
            expect(progress.watched).toBe(true);
            expect(await progress.after(() => bar.setAttribute('value', '0.5'))).toEqual({ watched: false, decided: false });
        });
    });

    describe('autofilled, as :autofill matches', () => {
        it('answers false for a field nothing filled, without failing in a browser that knows :autofill', () => {
            const { field } = page('<input id="field" autocomplete="email">');

            expect(domql.query('e.autofilled', { e: field }).evaluate()).toBe(false);
        });
    });

    describe('text and html', () => {
        it('follow a subtree\'s text and markup as its text is edited, and html an attribute within it', async () => {
            const { editor } = page('<div id="editor" contenteditable><p>one</p></div>');
            const text = await watching('e.text', { e: editor });
            const html = await watching('e.html', { e: editor });

            expect(await text.after(() => { editor.firstElementChild.firstChild.data = 'one two'; })).toEqual({ watched: 'one two', decided: 'one two' });
            expect(await html.after(() => editor.firstElementChild.setAttribute('class', 'lead'))).toEqual({ watched: '<p class="lead">one two</p>', decided: '<p class="lead">one two</p>' });
        });

        it('misses for html a change inside the content of a template it holds', async () => {
            const { holder } = page('<div id="holder"><template><i></i></template></div>');
            const html = await watching('e.html', { e: holder });

            expect(await html.after(() => holder.firstElementChild.content.firstElementChild.setAttribute('id', 'x'))).toEqual({ watched: '<template><i></i></template>', decided: '<template><i id="x"></i></template>' });
        });
    });

    describe('files', () => {
        it('follows the files a user chooses, and misses files the page\'s code assigns', async () => {
            const { picker } = page('<input id="picker" type="file" multiple>');
            const files = await watching('e.files { name = it.name, bytes = it.bytes, type = it.type }', { e: picker });
            const chosen = new File(['abc'], 'a.txt', { type: 'text/plain', lastModified: 1000 });

            expect(files.watched).toEqual([]);

            // The file reaches the page through the browser's own upload, which gives it the size its transfer gave it.
            const uploaded = await files.after(() => userEvent.upload(picker, chosen));

            expect(uploaded.watched).toEqual(uploaded.decided);
            expect(uploaded.watched).toEqual([{ name: 'a.txt', bytes: picker.files[0].size, type: 'text/plain' }]);

            const transfer = new DataTransfer();

            transfer.items.add(new File(['wxyz'], 'b.bin'));

            expect(await files.after(() => { picker.files = transfer.files; })).toEqual({ watched: uploaded.watched, decided: [{ name: 'b.bin', bytes: 4, type: '' }] });
        });
    });

    describe('playback', () => {
        it('follows a media element muted and its volume changed, and answers null for its duration until its metadata loads', async () => {
            const { player } = page('<video id="player"></video>');
            const playback = await watching('e.playback { muted = it.muted, volume = it.volume, duration = it.duration, paused = it.paused }', { e: player });

            expect(playback.watched).toEqual({ muted: false, volume: 1, duration: null, paused: true });
            expect(await playback.after(() => { player.muted = true; })).toEqual({ watched: { muted: true, volume: 1, duration: null, paused: true }, decided: { muted: true, volume: 1, duration: null, paused: true } });
            expect(await playback.after(() => { player.volume = 0.25; })).toEqual({ watched: { muted: true, volume: 0.25, duration: null, paused: true }, decided: { muted: true, volume: 0.25, duration: null, paused: true } });
        });
    });
});
