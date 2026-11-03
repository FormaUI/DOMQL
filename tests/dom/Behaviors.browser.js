import { afterEach, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { cdp, userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/**
 * A behavior an editor keeps, in a real browser, whose selection events the browser queues and whose input the user's press, keyboard and input method give: the state it offers, its commands and reactions, and
 * the occurrences its own listeners deliver.
 */
describe('Behaviors in a browser', () => {
    let handles;
    let log;

    /** A host call of an element extension. */
    const hostCall = (name, overrides) => ({ name, kind: 'function', invokedBy: 'host', ...overrides });

    /**
     * An editor a module keeps on an editing host. It offers its caret, whether the selection is bold and collapsed, and says it may have changed only where that changes; it carries out a command, answering the
     * markup and the caret the command leaves; it delivers a shortcut its keydown listener claims to `shortcuts`, and the markup to `flushes` as focus leaves.
     */
    class Editor {
        #receiver;
        #notify;
        #deliver;
        #key = null;
        #controller = new AbortController();

        caret = null;

        constructor(receiver, { env, notify, deliver }) {
            this.#receiver = receiver;
            this.#notify = notify;
            this.#deliver = deliver;

            const { signal } = this.#controller;

            receiver.addEventListener('blur', () => {
                log.push('blur');
                this.#deliver('flushes', { html: receiver.innerHTML });
            }, { signal });
            receiver.addEventListener('keydown', event => {
                if (event.ctrlKey && event.key === 'b') {
                    event.preventDefault();
                    this.#deliver('shortcuts', { command: 'bold' });
                }
            }, { signal });
            env.document.addEventListener('selectionchange', () => this.#report(), { signal });
        }

        /** Carries out the command and answers what it leaves, saying what the editor offers may have changed. */
        execute(command) {
            this.#receiver.ownerDocument.execCommand(command);
            this.#report();
            this.#notify();

            return { html: this.#receiver.innerHTML, caret: this.caret };
        }

        update() {}

        dispose() {
            this.#controller.abort();
        }

        /** Takes the caret where the selection is in the editing host, and says so where it changed. */
        #report() {
            const document = this.#receiver.ownerDocument;
            const selection = document.getSelection();

            if (selection.rangeCount === 0 || !this.#receiver.contains(selection.anchorNode)) {
                return;
            }

            const caret = { bold: document.queryCommandState('bold'), collapsed: selection.isCollapsed };
            const key = JSON.stringify(caret);

            if (key !== this.#key) {
                this.#key = key;
                this.caret = caret;
                this.#notify();
            }
        }
    }

    const editors = () => domql.createModule('Editors', {
        types: [
            { name: 'Caret', kind: 'structured', members: [{ name: 'bold', kind: 'property', result: 'Boolean' }, { name: 'collapsed', kind: 'property', result: 'Boolean' }] },
            { name: 'Answer', kind: 'structured', members: [{ name: 'html', kind: 'property', result: 'String' }, { name: 'caret', kind: 'property', result: 'Caret?' }] },
            { name: 'Flush', kind: 'structured', members: [{ name: 'html', kind: 'property', result: 'String' }] },
            { name: 'Shortcut', kind: 'structured', members: [{ name: 'command', kind: 'property', result: 'String' }] },
            {
                name: 'EditorElements', kind: 'extension', target: 'Domql.Element',
                members: [
                    hostCall('edit', { requestKind: 'execution', executionMode: 'continuous', impl: ({ receiver, env, notify, deliver }) => new Editor(receiver, { env, notify, deliver }) }),
                    hostCall('execute', {
                        requestKind: 'execution', executionMode: 'once', behavior: 'edit', arguments: 'positional',
                        parameters: [{ name: 'command', kind: 'value', type: 'String', required: true }],
                        result: 'Answer',
                        impl: ({ instance, args: { command } }) => instance.execute(command),
                    }),
                    {
                        name: 'caret', kind: 'property', result: 'Caret?', behavior: 'edit',
                        updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'behavior', of: 'receiver', behavior: 'edit' }] },
                        impl: ({ instance }) => instance?.caret ?? null,
                    },
                    hostCall('flushes', { requestKind: 'subscription', behavior: 'edit', result: 'Flush' }),
                    hostCall('shortcuts', { requestKind: 'subscription', behavior: 'edit', result: 'Shortcut' }),
                ],
            },
        ],
    });

    // The file's copy of DOMQL holds the module for every test.
    beforeAll(() => domql.registerModule(editors()));

    beforeEach(() => {
        handles = [];
        log = [];
        document.body.innerHTML = '<div id="canvas" contenteditable="true"><p>one two</p></div><button id="send">Send</button>';
    });

    afterEach(() => {
        handles.forEach(handle => handle.dispose());
        document.getSelection().removeAllRanges();
        document.body.innerHTML = '';
    });

    /** Keeps the handle to dispose once the test ends. */
    const kept = handle => {
        handles.push(handle);

        return handle;
    };

    /** Waits for the queued selection events to be dispatched, the frames after them to run, and the watches to evaluate. */
    const settle = async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    const canvas = () => document.getElementById('canvas');

    /** Starts the editor on the canvas, focuses it and selects the text given of its paragraph, from the offset to the end. */
    const editing = async (start, end = start) => {
        const host = canvas();
        const text = host.querySelector('p').firstChild;

        kept(domql.query('import Editors\ncanvas:edit()', { canvas: host }).run());
        host.focus();
        document.getSelection().setBaseAndExtent(text, start, text, end);
        await settle();

        return host;
    };

    /** Watches the caret the editor offers, under the immediate schedule, keeping each value it reports. */
    const watchingCaret = host => {
        const values = [];
        const watch = kept(domql.query('import Editors\ncanvas:caret { bold = it.bold, collapsed = it.collapsed }', { canvas: host }).watch({ schedule: 'immediate' }));

        watch.subscribe('change', (sender, args) => {
            log.push('change');
            values.push(args.value);
        });

        return values;
    };

    describe('the state an editor offers', () => {
        it('is reported once by a watch after a command that changes it, before the command\'s answer reaches its caller, the selection events the browser queues after it reporting nothing more', async () => {
            const host = await editing(4, 7);
            const carets = watchingCaret(host);

            await settle();
            expect(carets).toEqual([{ bold: false, collapsed: false }]);

            const answer = await domql.query('import Editors\ncanvas:execute("bold") { html = it.html, bold = it.caret?.bold }', { canvas: host }).executeAsync().then(value => {
                log.push('answer');

                return value;
            });

            await settle();

            expect(answer).toEqual({ html: '<p>one <b>two</b></p>', bold: true });
            expect(carets).toEqual([{ bold: false, collapsed: false }, { bold: true, collapsed: false }]);
            expect(log).toEqual(['change', 'change', 'answer']);
        });

        it('is reported by nothing where a command says it may have changed and it reads as it did', async () => {
            const host = await editing(4, 7);
            const carets = watchingCaret(host);

            await settle();
            await domql.query('import Editors\ncanvas:execute("unknown") { html = it.html }', { canvas: host }).executeAsync();
            await settle();

            expect(carets).toEqual([{ bold: false, collapsed: false }]);
        });

        it('is changed by a reaction to the editor\'s own occurrence, whose handler hears it, with the reaction\'s answer, before the watch reports the change', async () => {
            const host = await editing(4, 7);
            const carets = watchingCaret(host);
            const answers = [];
            const reaction = domql.query('import Editors\ncanvas:execute(event.command) { html = it.html, bold = it.caret?.bold }', { canvas: host });

            await settle();
            kept(domql.query('import Editors\ncanvas:shortcuts() { command = it.command }', { canvas: host }).subscribe((sender, args) => {
                log.push('handler');
                answers.push(...args.reactions);
            }, { reactions: [reaction] }));
            log.length = 0;

            await userEvent.keyboard('{Control>}b{/Control}');
            await settle();

            expect(log).toEqual(['handler', 'change']);
            expect(await answers[0]).toEqual({ html: '<p>one <b>two</b></p>', bold: true });
            expect(carets.at(-1)).toEqual({ bold: true, collapsed: false });
        });
    });

    describe('an occurrence an editor\'s blur delivers', () => {
        /** Records the press's own events, at the document, as they are dispatched. */
        const recordingPress = () => {
            const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'keydown', 'keyup'];
            const record = event => log.push(event.type === 'keydown' || event.type === 'keyup' ? `${event.type} ${event.key}` : event.type);

            types.forEach(type => document.addEventListener(type, record, true));

            return () => types.forEach(type => document.removeEventListener(type, record, true));
        };

        it('reaches its handler within the blur a press on a button causes, before the press is released and the button clicked', async () => {
            const host = await editing(7);
            const flushes = [];

            kept(domql.query('import Editors\ncanvas:flushes() { html = it.html }', { canvas: host }).subscribe((sender, args) => {
                log.push('handler');
                flushes.push(args.value);
            }));

            const stop = recordingPress();

            log.length = 0;
            await userEvent.click(document.getElementById('send'));
            stop();

            expect(log).toEqual(['pointerdown', 'mousedown', 'blur', 'handler', 'pointerup', 'mouseup', 'click']);
            expect(flushes).toEqual([{ html: '<p>one two</p>' }]);
        });

        it('reaches its handler within the blur Tab causes, before the key that presses the button', async () => {
            const host = await editing(7);

            kept(domql.query('import Editors\ncanvas:flushes() { html = it.html }', { canvas: host }).subscribe(() => log.push('handler')));

            const stop = recordingPress();

            log.length = 0;
            await userEvent.tab();
            await userEvent.keyboard('{Enter}');
            stop();

            expect(document.activeElement).toBe(document.getElementById('send'));
            expect(log).toEqual(['keydown Tab', 'blur', 'handler', 'keyup Tab', 'keydown Enter', 'click', 'keyup Enter']);
        });
    });

    describe('a composition an input method makes', () => {
        it('is told apart by its events, and completes in an editing host whose state a watch reads and whose class an owned write keeps', async () => {
            const host = await editing(7);
            const carets = watchingCaret(host);
            const heard = [];
            const listen = (type, projection) => kept(domql.query(`canvas.on("${type}") ${projection}`, { canvas: host }).subscribe((sender, args) => heard.push({ type, ...args.value })));

            listen('compositionstart', '{ data = it.data }');
            listen('compositionend', '{ data = it.data }');
            listen('input', '{ inputType = it.inputType, data = it.data, isComposing = it.isComposing }');
            listen('keydown', '{ key = it.key, isComposing = it.isComposing }');

            const marked = kept(domql.query('canvas.ownClass({ name = "editing", present = present, keep = true })', { canvas: host, present: true }).run());
            const session = cdp();

            await settle();
            await session.send('Input.imeSetComposition', { text: 'に', selectionStart: 1, selectionEnd: 1 });
            await settle();

            // A key pressed while the composition is open, and the owned class written again, as a framework's patch and an update each would.
            await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Process', code: 'KeyN', windowsVirtualKeyCode: 229 });
            await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Process', code: 'KeyN', windowsVirtualKeyCode: 229 });
            host.className = '';
            marked.update({ canvas: host, present: false });
            marked.update({ canvas: host, present: true });
            await settle();
            await session.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
            await settle();
            await session.send('Input.insertText', { text: '日本' });
            await settle();

            expect(host.innerHTML).toBe('<p>one two日本</p>');
            expect(host.className).toBe('editing');
            expect(heard).toEqual([
                { type: 'compositionstart', data: '' },
                { type: 'input', inputType: 'insertCompositionText', data: 'に', isComposing: true },
                { type: 'keydown', key: 'Process', isComposing: true },
                { type: 'input', inputType: 'insertCompositionText', data: 'にほ', isComposing: true },
                { type: 'input', inputType: 'insertCompositionText', data: '日本', isComposing: true },
                { type: 'compositionend', data: '日本' },
            ]);
            expect(carets.at(-1)).toEqual({ bold: false, collapsed: true });
        });
    });
});
