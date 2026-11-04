import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/** DOMQL's built-in executions, carried out through `domql` against the simulated document, which lays nothing out; what needs layout or the user is tested in a browser. */
describe('BrowserExecutionImplementations', () => {
    // Each test loads its own copy of domql, with a registry of its own.
    let domql;
    let panel;
    let field;
    let reported;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"><input id="field"><div id="plain"></div></div>';
        panel = document.getElementById('panel');
        field = document.getElementById('field');
        reported = [];
        window.reportError = error => reported.push(error);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
    });

    /** Carries out the once execution the text ends in, with the bindings, answering a promise of its result. */
    const execute = (text, bindings = {}, options) => domql.query(text, bindings).executeAsync(options);

    /** The failure the promise rejects with. */
    const failureOf = promise => promise.then(() => {
        throw new Error('The execution succeeded');
    }, error => error);

    describe('requests', () => {
        it('are once executions, resolved as executions and refused by the operations of other requests', () => {
            expect(domql.query('field.focus()', { field }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
            expect(String(domql.query('field.focus()', { field }).resolve().type)).toBe('Boolean');
            expect(() => domql.query('field.focus()', { field }).evaluate()).toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining('it executes an effect once.\nUse executeAsync().') }));
        });

        it('resolve on a receiver of unknown type, whose declarations of the name agree on what they request', async () => {
            expect(domql.query('target?.scrollTo({ block = 0 })', { target: null }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
            expect(await execute('target?.scrollTo({ block = 0 })', { target: null })).toBeNull();
        });
    });

    describe('dispatch', () => {
        it('dispatches a custom event of the type and the detail given, answering whether a listener cancelled it', async () => {
            const heard = [];

            panel.addEventListener('panel-opened', event => {
                heard.push({ type: event.type, bubbles: event.bubbles, cancelable: event.cancelable, detail: event.detail });
                event.preventDefault();
            });

            expect(await execute('panel.dispatch({ type = "panel-opened", detail = { key = "a1", rows = [1, 2] } })', { panel })).toBe(true);
            expect(await execute('panel.dispatch({ type = "panel-closed" })', { panel })).toBe(false);
            expect(heard).toEqual([{ type: 'panel-opened', bubbles: false, cancelable: true, detail: { key: 'a1', rows: [1, 2] } }]);
        });

        it('bubbles where it is told to, as a change a control reports', async () => {
            const reached = [];

            panel.addEventListener('change', event => reached.push({ at: 'panel', target: event.target.id, detail: event.detail }));

            await execute('field.dispatch({ type = "change" })', { field });
            await execute('field.dispatch({ type = "change", bubbles = true })', { field });

            expect(reached).toEqual([{ at: 'panel', target: 'field', detail: null }]);
        });

        it('dispatches at the document and the window', async () => {
            const reached = [];

            document.addEventListener('ready', event => reached.push(`document ${event.detail}`));
            window.addEventListener('ready', event => reached.push(`window ${event.detail}`));

            await execute('Domql.document.dispatch({ type = "ready", detail = 1, bubbles = true })');
            await execute('Domql.window.dispatch({ type = "ready", detail = 2 })');

            expect(reached).toEqual(['document 1', 'window 1', 'window 2']);
        });
    });

    describe('focus', () => {
        it('focuses an element that can take focus, answering that focus landed on it', async () => {
            expect(await execute('field.focus()', { field })).toBe(true);
            expect(document.activeElement).toBe(field);
        });

        it('answers false where focus doesn\'t land on the element, as the browser refuses an element that can\'t take focus', async () => {
            const plain = document.getElementById('plain');

            field.focus();
            // The simulated document focuses any element, so this one refuses as a browser would.
            plain.focus = () => {};

            expect(await execute('plain.focus()', { plain })).toBe(false);
            expect(document.activeElement).toBe(field);
        });

        it('passes on whether focusing scrolls the element into view', async () => {
            const calls = [];

            field.focus = options => calls.push(options);

            await execute('field.focus()', { field });
            await execute('field.focus({ preventScroll = true })', { field });

            expect(calls).toEqual([{ preventScroll: false }, { preventScroll: true }]);
        });
    });

    describe('scrollTo and scrollBy', () => {
        it('scroll an element to an offset along an axis of its writing mode, and by one, answering whether it moved', async () => {
            expect(await execute('panel.scrollTo({ block = 40 })', { panel })).toBe(true);
            expect(panel.scrollTop).toBe(40);
            expect(await execute('panel.scrollTo({ block = 40 })', { panel })).toBe(false);
            expect(await execute('panel.scrollBy({ block = 10, inline = 5 })', { panel })).toBe(true);
            expect([panel.scrollLeft, panel.scrollTop]).toEqual([5, 50]);
        });

        it('leave an axis given no offset, or null, as it is', async () => {
            panel.scrollTop = 30;

            expect(await execute('panel.scrollTo({ inline = 12, block = null })', { panel })).toBe(true);
            expect([panel.scrollLeft, panel.scrollTop]).toEqual([12, 30]);
            expect(await execute('panel.scrollTo()', { panel })).toBe(false);
        });

        it('count an axis whose position the browser gives below 0 from its scroll origin at the end, as under RTL', async () => {
            panel.scrollLeft = -10;

            expect(await execute('panel.scrollTo({ inline = 30 })', { panel })).toBe(true);
            expect(panel.scrollLeft).toBe(-30);
            expect(await execute('panel.scrollBy({ inline = 5 })', { panel })).toBe(true);
            expect(panel.scrollLeft).toBe(-35);
        });

        it('answer an instant scroll without asking for an animation frame, its method answering nothing that says when, and ask the browser for an instant one in a hidden document', async () => {
            const asked = [];
            const frames = vi.spyOn(window, 'requestAnimationFrame');

            panel.scrollTo = options => {
                asked.push(options.behavior);
                panel.scrollTop = options.top;
            };

            expect(await execute('panel.scrollTo({ block = 20, behavior = "instant" })', { panel })).toBe(true);
            expect(await execute('panel.scrollTo({ block = 30 })', { panel })).toBe(true);
            expect(frames).not.toHaveBeenCalled();

            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });

            try {
                expect(await execute('panel.scrollTo({ block = 40, behavior = "smooth" })', { panel })).toBe(true);
                expect(frames).not.toHaveBeenCalled();
            } finally {
                delete document.visibilityState;
                frames.mockRestore();
            }

            expect(asked).toEqual(['instant', 'instant', 'instant']);
            expect(panel.scrollTop).toBe(40);
        });

        it('scroll the window, answering whether it moved', async () => {
            expect(await execute('Domql.window.scrollTo({ block = 100 })')).toBe(true);
            expect(window.scrollY).toBe(100);
            expect(await execute('Domql.window.scrollBy({ block = -25 })')).toBe(true);
            expect(window.scrollY).toBe(75);
            expect(await execute('Domql.window.scrollBy({ block = 0 })')).toBe(false);
        });

        it('answer a smooth scroll once it has ended, the first frame from the third in which it holds still, where the browser\'s scroll method answers nothing that says when', async () => {
            const calls = [];

            // A smooth scroll a browser moves over two frames, its method answering nothing.
            panel.scrollTo = options => {
                calls.push(options);
                requestAnimationFrame(() => {
                    panel.scrollTop = 30;
                    requestAnimationFrame(() => {
                        panel.scrollTop = 60;
                    });
                });
            };

            expect(await execute('panel.scrollTo({ block = 60, behavior = "smooth" })', { panel })).toBe(true);
            expect(panel.scrollTop).toBe(60);
            expect(calls).toEqual([{ top: 60, behavior: 'smooth' }]);
        });

        it('answer a scroll once the browser\'s scroll method says it has ended, where it answers a promise', async () => {
            let end;

            panel.scrollTo = options => new Promise(resolve => {
                end = () => {
                    panel.scrollTop = options.top;
                    resolve();
                };
            });

            const scrolled = execute('panel.scrollTo({ block = 20, behavior = "smooth" })', { panel });

            await Promise.resolve();
            end();

            expect(await scrolled).toBe(true);
        });

        it('stop waiting for a scroll to end where the caller cancels it, rejecting with the signal\'s reason', async () => {
            const controller = new AbortController();

            panel.scrollTo = () => {};

            const scrolled = execute('panel.scrollTo({ block = 20, behavior = "smooth" })', { panel }, { signal: controller.signal });

            controller.abort(new Error('enough'));

            expect((await failureOf(scrolled)).message).toBe('enough');
            expect(reported).toEqual([]);
        });

        it('fail for a behavior a scroll doesn\'t take, where the execution stands', async () => {
            const error = await failureOf(execute('panel.scrollTo({ block = 1, behavior = "fast" })', { panel }));

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', message: expect.stringContaining('"fast" is no scroll behavior'), location: { pointer: '/expression', offset: 0, line: 1, column: 1 } });
            expect(panel.scrollTop).toBe(0);
        });
    });

    describe('media', () => {
        /** A media element whose play answers as given, and which pauses and mutes as a browser's does. */
        const mediaPlaying = answer => {
            document.body.innerHTML = '<audio id="audio"></audio>';

            const audio = document.getElementById('audio');
            let paused = true;

            Object.defineProperty(audio, 'paused', { get: () => paused, configurable: true });
            audio.play = () => answer().then(() => {
                paused = false;
            });
            audio.pause = () => {
                paused = true;
            };

            return audio;
        };

        /** A refusal of the browser's, an error of the name given. */
        const refusal = name => () => Promise.reject(Object.assign(new Error(name), { name }));

        it('plays a media element, answering how the browser took the request', async () => {
            const outcomes = [];

            for (const answer of [() => Promise.resolve(), refusal('NotAllowedError'), refusal('AbortError'), refusal('NotSupportedError')]) {
                outcomes.push(await execute('audio.play()', { audio: mediaPlaying(answer) }));
            }

            expect(outcomes).toEqual(['playing', 'blocked', 'aborted', 'unsupported']);
            expect(await execute('plain.play()', { plain: document.createElement('div') })).toBe('unsupported');
        });

        it('fails where playing fails for a reason the browser names no outcome for, its error the cause', async () => {
            const error = await failureOf(execute('audio.play()', { audio: mediaPlaying(refusal('InvalidStateError')) }));

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', cause: expect.objectContaining({ name: 'InvalidStateError' }) });
        });

        it('pauses, mutes and unmutes a media element, answering whether each changed it, and changes nothing of another element', async () => {
            const audio = mediaPlaying(() => Promise.resolve());

            await execute('audio.play()', { audio });

            expect(await execute('audio.pause()', { audio })).toBe(true);
            expect(await execute('audio.pause()', { audio })).toBe(false);
            expect(await execute('audio.mute()', { audio })).toBe(true);
            expect(audio.muted).toBe(true);
            expect(await execute('audio.mute()', { audio })).toBe(false);
            expect(await execute('audio.unmute()', { audio })).toBe(true);
            expect(audio.muted).toBe(false);
            expect(await execute('audio.unmute()', { audio })).toBe(false);
            expect(await execute('plain.pause()', { plain: document.createElement('div') })).toBe(false);
            expect(await execute('plain.mute()', { plain: document.createElement('div') })).toBe(false);
            expect(await execute('plain.unmute()', { plain: document.createElement('div') })).toBe(false);
        });
    });

    describe('the browser\'s facilities', () => {
        /** A window of its own, its navigator the one given and the rest of what it holds given beside it. */
        const windowWith = (navigator, rest = {}) => ({ document, navigator, location: window.location, ...rest, get window() { return this; } });

        /** Carries out the execution against the window given, as `Domql.window`. */
        const executeIn = (text, given) => domql.query(text).executeAsync({ window: given });

        /** A refusal of the browser's, an error of the name given. */
        const refused = name => () => Promise.reject(Object.assign(new Error(name), { name }));

        it('write text to the clipboard, answering how the browser took the request', async () => {
            const written = [];
            const clipboardOf = writeText => windowWith({ clipboard: { writeText } });

            expect(await executeIn('Domql.window.writeToClipboard("copied")', clipboardOf(text => written.push(text)))).toBe('written');
            expect(await executeIn('Domql.window.writeToClipboard("copied")', clipboardOf(refused('NotAllowedError')))).toBe('refused');
            expect(await executeIn('Domql.window.writeToClipboard("copied")', clipboardOf(refused('DataError')))).toBe('failed');
            expect(await executeIn('Domql.window.writeToClipboard("copied")', windowWith({}))).toBe('unsupported');
            expect(written).toEqual(['copied']);
        });

        it('read the clipboard\'s content of each format asked for, in the order asked, each as text, and none it doesn\'t hold', async () => {
            const item = { types: ['text/plain', 'text/html'], getType: type => Promise.resolve({ text: () => Promise.resolve(type === 'text/html' ? '<b>x</b>' : 'x') }) };
            const reading = read => windowWith({ clipboard: { read } });

            expect(await executeIn('Domql.window.readFromClipboard({ types = ["text/html", "image/png", "text/plain"] })', reading(() => Promise.resolve([item])))).toEqual({
                outcome: 'read',
                entries: [{ type: 'text/html', text: '<b>x</b>' }, { type: 'text/plain', text: 'x' }],
            });
            expect(await executeIn('Domql.window.readFromClipboard() { outcome = it.outcome, count = it.entries.count }', reading(refused('NotAllowedError')))).toEqual({ outcome: 'refused', count: 0 });
        });

        it('read the clipboard\'s text alone where the browser reads no items, and answer unsupported where it offers no clipboard', async () => {
            const texts = windowWith({ clipboard: { readText: () => Promise.resolve('plain') } });

            expect(await executeIn('Domql.window.readFromClipboard()', texts)).toEqual({ outcome: 'read', entries: [{ type: 'text/plain', text: 'plain' }] });
            expect(await executeIn('Domql.window.readFromClipboard({ types = ["text/html"] })', texts)).toEqual({ outcome: 'read', entries: [] });
            expect(await executeIn('Domql.window.readFromClipboard()', windowWith({}))).toEqual({ outcome: 'unsupported', entries: [] });
        });

        it('download text as a file through an object URL, which it revokes once the browser has begun the download', async () => {
            const clicks = [];
            const timers = [];
            const revoked = [];
            const urls = { createObjectURL: blob => `blob:${blob.type}`, revokeObjectURL: url => revoked.push(url) };
            const click = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
                clicks.push({ href: this.getAttribute('href'), name: this.download, attached: this.isConnected });
            });

            try {
                expect(await executeIn('Domql.window.download({ name = "report.csv", content = "a,b", type = "text/csv" })', windowWith({}, { URL: urls, Blob: window.Blob, setTimeout: (callback, delay) => timers.push({ callback, delay }) }))).toBeNull();
            } finally {
                click.mockRestore();
            }

            expect(clicks).toEqual([{ href: 'blob:text/csv', name: 'report.csv', attached: true }]);
            expect(document.querySelector('a[download]')).toBeNull();
            expect(timers.map(timer => timer.delay)).toEqual([60_000]);

            timers[0].callback();

            expect(revoked).toEqual(['blob:text/csv']);
        });

        it('print the page, answering nothing', async () => {
            let printed = 0;

            expect(await executeIn('Domql.window.print()', windowWith({}, { print: () => printed++ }))).toBeNull();
            expect(printed).toBe(1);
        });

        it('request a share of what is given alone, answering how the browser and the user took it', async () => {
            const shared = [];
            const sharing = share => windowWith({ share });

            expect(await executeIn('Domql.window.requestShare({ title = "Report", url = "https://example.com/r" })', sharing(data => shared.push(data)))).toBe('shared');
            expect(await executeIn('Domql.window.requestShare({ text = "x" })', sharing(refused('AbortError')))).toBe('canceled');
            expect(await executeIn('Domql.window.requestShare()', sharing(refused('TypeError')))).toBe('invalid');
            expect(await executeIn('Domql.window.requestShare({ text = "x" })', sharing(refused('NotAllowedError')))).toBe('refused');
            expect(await executeIn('Domql.window.requestShare({ text = "x" })', sharing(refused('InvalidStateError')))).toBe('failed');
            expect(await executeIn('Domql.window.requestShare({ text = "x" })', windowWith({}))).toBe('unsupported');
            expect(shared).toEqual([{ title: 'Report', url: 'https://example.com/r' }]);
        });
    });

    describe('a file\'s source', () => {
        let made;
        let revoked;
        let handles;

        beforeEach(() => {
            document.body.innerHTML = '<input id="picker" type="file"><img id="preview" src="placeholder.png"><img id="other">';
            made = [];
            revoked = [];
            handles = [];
            vi.spyOn(window.URL, 'createObjectURL').mockImplementation(file => {
                made.push(file.name);

                return `blob:${file.name}`;
            });
            vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(url => revoked.push(url));
        });

        afterEach(() => {
            handles.forEach(handle => handle.dispose());
            vi.restoreAllMocks();
        });

        const byId = id => document.getElementById(id);

        /** Gives the file input the files named, as the user chooses them. */
        const choose = (...names) => Object.defineProperty(byId('picker'), 'files', { value: names.map(name => new window.File(['x'], name, { type: 'image/png' })), configurable: true });

        const run = (text, bindings) => {
            const handle = domql.query(text, bindings).run();

            handles.push(handle);

            return handle;
        };

        it('shows the file a file input holds through an object URL of its own, and writes back the source it found once disposed, revoking the URL', () => {
            choose('a.png', 'b.png');

            const handle = run('preview.ownFileSource({ input = picker })', { preview: byId('preview'), picker: byId('picker') });

            expect(byId('preview').getAttribute('src')).toBe('blob:a.png');

            handle.dispose();

            expect(byId('preview').getAttribute('src')).toBe('placeholder.png');
            expect([made, revoked]).toEqual([['a.png'], ['blob:a.png']]);
        });

        it('makes a URL only for a file it doesn\'t show yet, revoking the one it showed once the source no longer shows it', () => {
            choose('a.png', 'b.png');

            const picker = byId('picker');
            const handle = run('target.ownFileSource({ input = picker, index = index })', { target: byId('preview'), picker, index: 0 });

            handle.update({ target: byId('preview'), picker, index: 0 });
            handle.update({ target: byId('preview'), picker, index: 1 });

            expect(byId('preview').getAttribute('src')).toBe('blob:b.png');
            expect([made, revoked]).toEqual([['a.png', 'b.png'], ['blob:a.png']]);

            handle.update({ target: byId('other'), picker, index: 1 });

            expect([byId('preview').getAttribute('src'), byId('other').getAttribute('src')]).toEqual(['placeholder.png', 'blob:b.png']);
            expect(revoked).toEqual(['blob:a.png', 'blob:b.png']);
        });

        it('shows no source where the input holds no file at the place given, and leaves its source where it restores none', () => {
            choose();

            const preview = byId('preview');

            run('preview.ownFileSource({ input = picker, restore = false })', { preview, picker: byId('picker') }).dispose();

            expect(preview.hasAttribute('src')).toBe(false);
            expect(made).toEqual([]);
        });

        it('fails to start for an input that is no file input, making no URL', () => {
            expect(() => run('preview.ownFileSource({ input = other })', { preview: byId('preview'), other: byId('other') })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5007', cause: expect.objectContaining({ message: expect.stringContaining('A img element is no file input') }) }));
            expect(made).toEqual([]);
        });
    });

    describe('placing the selection', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="editor" contenteditable="true"><p id="first">one <b id="bold">two</b></p><p id="second">three</p></div>';
        });

        const byId = id => document.getElementById(id);

        /** The document's selection's first range, by its boundaries. */
        const placed = () => {
            const range = document.getSelection().getRangeAt(0);

            return { start: [range.startContainer.id ?? range.startContainer.data, range.startOffset], end: [range.endContainer.id ?? range.endContainer.data, range.endOffset] };
        };

        it('selects a node, answering that the selection holds it', async () => {
            expect(await execute('Domql.document.selection?.select({ node = bold })', { bold: byId('bold') })).toBe(true);
            expect(placed()).toEqual({ start: ['first', 1], end: ['first', 2] });
        });

        it('selects a node\'s contents, or collapses to their start or their end', async () => {
            const second = byId('second');

            expect(await execute('Domql.document.selection?.selectContents({ node = second })', { second })).toBe(true);
            expect(placed()).toEqual({ start: ['second', 0], end: ['second', 1] });
            expect(await execute('Domql.document.selection?.selectContents({ node = second, collapse = "end" })', { second })).toBe(true);
            expect(placed()).toEqual({ start: ['second', 1], end: ['second', 1] });
            expect(await execute('Domql.document.selection?.selectContents({ node = second, collapse = "start" })', { second })).toBe(true);
            expect(placed()).toEqual({ start: ['second', 0], end: ['second', 0] });
        });

        it('collapses the selection at a point within a node, at its start where no offset is given', async () => {
            const first = byId('first');

            expect(await execute('Domql.document.selection?.collapse({ node = first, offset = 1 })', { first })).toBe(true);
            expect(placed()).toEqual({ start: ['first', 1], end: ['first', 1] });
            expect(await execute('Domql.document.selection?.collapse({ node = first })', { first })).toBe(true);
            expect(placed()).toEqual({ start: ['first', 0], end: ['first', 0] });
        });

        it('fails for an end of the contents it doesn\'t take, and an offset past a node\'s end, which the browser refuses', async () => {
            const second = byId('second');

            expect(await failureOf(execute('Domql.document.selection?.selectContents({ node = second, collapse = "middle" })', { second }))).toMatchObject({ code: 'DOMQL5001', message: expect.stringContaining('"middle" is no end of a node\'s contents') });
            expect(await failureOf(execute('Domql.document.selection?.collapse({ node = second, offset = 9 })', { second }))).toMatchObject({ code: 'DOMQL5001', cause: expect.objectContaining({ name: 'IndexSizeError' }) });
        });
    });

    describe('form controls', () => {
        beforeEach(() => {
            document.body.innerHTML = '<input id="box" type="checkbox"><input id="field" value="draft"><textarea id="notes">old</textarea><select id="list"><option>a</option><option>b</option></select><div id="plain"></div><div id="editor" contenteditable="true">one <b>two</b> three</div>';
        });

        const byId = id => document.getElementById(id);

        it('make a checkbox mixed and not, answering whether it changed it, and change nothing of an element that is no checkbox', async () => {
            const box = byId('box');

            expect(await execute('box.markIndeterminate()', { box })).toBe(true);
            expect(box.indeterminate).toBe(true);
            expect(await execute('box.markIndeterminate()', { box })).toBe(false);
            expect(await execute('box.clearIndeterminate()', { box })).toBe(true);
            expect(box.indeterminate).toBe(false);
            expect(await execute('box.clearIndeterminate()', { box })).toBe(false);
            expect(await execute('field.markIndeterminate()', { field: byId('field') })).toBe(false);
            expect(byId('field').indeterminate).toBe(false);
        });

        it('replace a control\'s value, answering the value it replaced, firing no event, and nothing for an element that is no control', async () => {
            const fields = ['field', 'notes', 'list'].map(byId);
            const events = [];

            fields.forEach(control => ['input', 'change'].forEach(type => control.addEventListener(type, () => events.push(type))));

            expect(await execute('field.replaceValue("")', { field: fields[0] })).toBe('draft');
            expect(await execute('notes.replaceValue("new")', { notes: fields[1] })).toBe('old');
            expect(await execute('list.replaceValue("b")', { list: fields[2] })).toBe('a');
            expect(fields.map(control => control.value)).toEqual(['', 'new', 'b']);
            expect(await execute('plain.replaceValue("x")', { plain: byId('plain') })).toBeNull();
            expect(events).toEqual([]);
        });

        it('place a text control\'s selection, answering that it placed it, and none of an element that exposes none', async () => {
            const field = byId('field');

            expect(await execute('field.select({ start = 1, end = 3 })', { field })).toBe(true);
            expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
            expect(await execute('plain.select({ start = 0, end = 1 })', { plain: byId('plain') })).toBe(false);
        });

        it('place the document\'s selection at offsets in an editable element\'s text, as its selection reads them, an offset past the end held at the end', async () => {
            const editor = byId('editor');

            expect(await execute('editor.select({ start = 2, end = 6 })', { editor })).toBe(true);
            expect(document.getSelection().toString()).toBe('e tw');
            expect(domql.query('editor.selection', { editor }).evaluate()).toEqual({ start: 2, end: 6 });
            expect(await execute('editor.select({ start = 8, end = 99 })', { editor })).toBe(true);
            expect(domql.query('editor.selection', { editor }).evaluate()).toEqual({ start: 8, end: 13 });
        });
    });

    describe('pointer capture', () => {
        /** Gives the element the pointer capture a browser keeps, the pointers given active. */
        const capturing = (element, active) => {
            const held = new Set();
            const refuse = name => Object.assign(new Error(`No active pointer with the given id is found`), { name });

            element.setPointerCapture = id => {
                if (!active.includes(id)) {
                    throw refuse('NotFoundError');
                }

                held.add(id);
            };
            element.releasePointerCapture = id => held.delete(id);
            element.hasPointerCapture = id => held.has(id);
        };

        it('captures an active pointer, answering that the element holds it, and answers false for one that isn\'t active', async () => {
            capturing(field, [3]);

            expect(await execute('field.capturePointer({ pointerId = 3 })', { field })).toBe(true);
            expect(field.hasPointerCapture(3)).toBe(true);
            expect(await execute('field.capturePointer({ pointerId = 4 })', { field })).toBe(false);
        });

        it('releases a capture the element holds, answering whether it did', async () => {
            capturing(field, [3]);
            field.setPointerCapture(3);

            expect(await execute('field.releasePointer({ pointerId = 3 })', { field })).toBe(true);
            expect(await execute('field.releasePointer({ pointerId = 3 })', { field })).toBe(false);
        });

        it('fails where the browser refuses the capture for any other reason, its refusal the cause', async () => {
            field.setPointerCapture = () => {
                throw new TypeError('No pointer');
            };

            const error = await failureOf(execute('field.capturePointer({ pointerId = 1 })', { field }));

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', cause: expect.objectContaining({ name: 'TypeError' }) });
        });
    });

    describe('the top layer', () => {
        it('fails to open or close as a dialog an element that is no dialog, where the execution stands', async () => {
            const error = await failureOf(execute('panel.showModal()', { panel }));

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', message: expect.stringContaining("The execution 'showModal' failed: A div element is no dialog"), location: { pointer: '/expression', offset: 0, line: 1, column: 1 } });
            expect(await failureOf(execute('panel.close({ returnValue = "ok" })', { panel }))).toMatchObject({ code: 'DOMQL5001', message: expect.stringContaining("The execution 'close' failed: A div element is no dialog") });
        });

        it('closes a dialog, answering whether it closed it, with the return value given or the one it had', async () => {
            document.body.innerHTML = '<dialog id="dialog" open>Dialog</dialog>';

            const dialog = document.getElementById('dialog');

            expect(await execute('dialog.close({ returnValue = "saved" })', { dialog })).toBe(true);
            expect([dialog.open, dialog.returnValue]).toEqual([false, 'saved']);
            expect(await execute('dialog.close()', { dialog })).toBe(false);
            expect(dialog.returnValue).toBe('saved');
        });

        it('shows and hides a popover, answering whether it changed it, as the browser\'s popover-open state reads it', async () => {
            const states = { tip: false };
            const tip = document.getElementById('plain');

            // The simulated document knows no popover-open state, so the element keeps its own, as a browser does.
            tip.matches = selector => (selector === ':popover-open' ? states.tip : false);
            tip.showPopover = () => { states.tip = true; };
            tip.hidePopover = () => { states.tip = false; };

            expect(await execute('tip.showPopover()', { tip })).toBe(true);
            expect(await execute('tip.showPopover()', { tip })).toBe(false);
            expect(await execute('tip.hidePopover()', { tip })).toBe(true);
            expect(await execute('tip.hidePopover()', { tip })).toBe(false);
        });
    });

    describe('scrollIntoView', () => {
        it('answers false for an element that has no layout box, which is in no view', async () => {
            expect(await execute('field.scrollIntoView()', { field })).toBe(false);
        });

        it('fails for an alignment it doesn\'t take', async () => {
            const error = await failureOf(execute('field.scrollIntoView({ block = "top" })', { field }));

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5001', message: expect.stringContaining('"top" is no alignment') });
        });
    });
});
