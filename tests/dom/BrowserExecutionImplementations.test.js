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
            expect(domql.query('field.takeFocus()', { field }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
            expect(String(domql.query('field.takeFocus()', { field }).resolve().type)).toBe('Boolean');
            expect(() => domql.query('field.takeFocus()', { field }).evaluate()).toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining('it executes an effect once.\nUse executeAsync().') }));
        });

        it('resolve on a receiver of unknown type, whose declarations of the name agree on what they request', async () => {
            expect(domql.query('target?.scrollTo({ block = 0 })', { target: null }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'once' });
            expect(await execute('target?.scrollTo({ block = 0 })', { target: null })).toBeNull();
        });
    });

    describe('takeFocus', () => {
        it('focuses an element that can take focus, answering that focus landed on it', async () => {
            expect(await execute('field.takeFocus()', { field })).toBe(true);
            expect(document.activeElement).toBe(field);
        });

        it('answers false where focus doesn\'t land on the element, as the browser refuses an element that can\'t take focus', async () => {
            const plain = document.getElementById('plain');

            field.focus();
            // The simulated document focuses any element, so this one refuses as a browser would.
            plain.focus = () => {};

            expect(await execute('plain.takeFocus()', { plain })).toBe(false);
            expect(document.activeElement).toBe(field);
        });

        it('passes on whether focusing scrolls the element into view', async () => {
            const calls = [];

            field.focus = options => calls.push(options);

            await execute('field.takeFocus()', { field });
            await execute('field.takeFocus({ preventScroll = true })', { field });

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

    describe('form controls', () => {
        beforeEach(() => {
            document.body.innerHTML = '<input id="box" type="checkbox"><input id="field" value="draft"><textarea id="notes">old</textarea><select id="list"><option>a</option><option>b</option></select><div id="plain"></div><div id="editor" contenteditable="true">one <b>two</b> three</div>';
        });

        const byId = id => document.getElementById(id);

        it('make a checkbox mixed and not, answering whether it changed it, and change nothing of an element that is no checkbox', async () => {
            const box = byId('box');

            expect(await execute('box.writeIndeterminate(true)', { box })).toBe(true);
            expect(box.indeterminate).toBe(true);
            expect(await execute('box.writeIndeterminate(true)', { box })).toBe(false);
            expect(await execute('box.writeIndeterminate(false)', { box })).toBe(true);
            expect(await execute('field.writeIndeterminate(true)', { field: byId('field') })).toBe(false);
            expect(byId('field').indeterminate).toBe(false);
        });

        it('write a control\'s value, answering the value it replaced, firing no event, and nothing for an element that is no control', async () => {
            const fields = ['field', 'notes', 'list'].map(byId);
            const events = [];

            fields.forEach(control => ['input', 'change'].forEach(type => control.addEventListener(type, () => events.push(type))));

            expect(await execute('field.writeValue("")', { field: fields[0] })).toBe('draft');
            expect(await execute('notes.writeValue("new")', { notes: fields[1] })).toBe('old');
            expect(await execute('list.writeValue("b")', { list: fields[2] })).toBe('a');
            expect(fields.map(control => control.value)).toEqual(['', 'new', 'b']);
            expect(await execute('plain.writeValue("x")', { plain: byId('plain') })).toBeNull();
            expect(events).toEqual([]);
        });

        it('place a text control\'s selection, answering that it placed it, and none of an element that exposes none', async () => {
            const field = byId('field');

            expect(await execute('field.writeSelection({ start = 1, end = 3 })', { field })).toBe(true);
            expect([field.selectionStart, field.selectionEnd]).toEqual([1, 3]);
            expect(await execute('plain.writeSelection({ start = 0, end = 1 })', { plain: byId('plain') })).toBe(false);
        });

        it('place the document\'s selection at offsets in an editable element\'s text, as its selection reads them, an offset past the end held at the end', async () => {
            const editor = byId('editor');

            expect(await execute('editor.writeSelection({ start = 2, end = 6 })', { editor })).toBe(true);
            expect(document.getSelection().toString()).toBe('e tw');
            expect(domql.query('editor.selection', { editor }).evaluate()).toEqual({ start: 2, end: 6 });
            expect(await execute('editor.writeSelection({ start = 8, end = 99 })', { editor })).toBe(true);
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
