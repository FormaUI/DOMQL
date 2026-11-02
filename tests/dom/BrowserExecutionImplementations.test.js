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
