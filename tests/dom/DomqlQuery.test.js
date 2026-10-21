import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/** Lets the observations deliver and the watches that follow them evaluate. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** The error a call throws, or a promise rejects with. */
const failureOf = async call => {
    try {
        await call();
    } catch (error) {
        return error;
    }

    throw new Error('The call succeeded');
};

describe('DomqlQuery', () => {
    // Each test loads its own copy of DOMQL, with a registry of its own.
    let isolated;
    let LexicaError;
    let panel;
    let calls;
    let reported;
    let evaluations;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated, LexicaError } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-n="1"><i data-n="1"></i><i data-n="2"></i></div>';
        panel = document.getElementById('panel');
        calls = [];
        reported = [];
        evaluations = 0;
        window.reportError = error => reported.push(error);

        const attributes = [{ type: 'mutation', of: 'receiver', attributes: true }];

        // A member that counts the evaluations that read it, a once execution and a continuous one that record their calls, and a source that records its starts.
        isolated.registerModule(isolated.createModule('tally', {
            members: [{ name: 'tally', kind: 'property', target: 'element', result: 'number', updates: { changes: 'observable', reads: 'fresh', observations: attributes }, implementation: () => ++evaluations }],
        }));
        isolated.registerModule(isolated.createModule('mark', {
            members: [{ name: 'mark', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', target: 'element', parameters: [], result: 'boolean', implementation: () => (calls.push('mark'), true) }],
        }));
        isolated.registerModule(isolated.createModule('glow', {
            members: [{
                name: 'glow', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous', target: 'element', parameters: [],
                implementation: ({ reportError }) => {
                    calls.push('glow');

                    return { update: () => {}, dispose: () => calls.push('dispose'), fail: reportError };
                },
            }],
        }));
        isolated.registerModule(isolated.createModule('beat', {
            members: [{
                name: 'beat', kind: 'function', invokedBy: 'host', requestKind: 'subscription', target: 'element', arguments: 'positional',
                parameters: [{ name: 'type', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
                result: 'number', implementation: () => (calls.push('beat'), { stop: () => calls.push('stop') }),
            }],
        }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('an operation the request does not take', () => {
        it.each([
            ['evaluating a once execution', () => isolated.query('panel.mark()', { panel }).evaluate(), "Cannot evaluate 'panel.mark()': it executes an effect once.\nUse executeAsync()."],
            ['watching a continuous execution', () => isolated.query('panel.glow()', { panel }).watch(), "Cannot watch 'panel.glow()': it keeps an effect running.\nUse run()."],
            ['executing a query', () => isolated.query('panel.tally', { panel }).executeAsync(), "Cannot execute 'panel.tally': it produces a value.\nUse evaluate(), evaluateAsync() or watch()."],
            ['running a once execution', () => isolated.query('panel.mark()', { panel }).run(), "Cannot run 'panel.mark()': it executes an effect once.\nUse executeAsync()."],
            ['subscribing to a query', () => isolated.query('panel.tally', { panel }).subscribe(() => {}), "Cannot subscribe to 'panel.tally': it produces a value.\nUse evaluate(), evaluateAsync() or watch()."],
            ['evaluating a subscription', () => isolated.query('panel.beat("beat")', { panel }).evaluate(), "Cannot evaluate 'panel.beat(\"beat\")': it listens to events.\nUse subscribe()."],
        ])('is refused before anything runs: %s', async (_, operation, message) => {
            const error = await failureOf(operation);

            await settle();

            expect(error).toBeInstanceOf(LexicaError);
            expect(error.kind).toBe('validation');
            expect(error.message).toContain(message);
            expect(calls).toEqual([]);
            expect(evaluations).toBe(0);
        });
    });

    describe('a signal already aborted', () => {
        const aborted = () => AbortSignal.abort(new Error('aborted'));

        it('answers a disposed watch that never evaluates', async () => {
            const watch = isolated.query('panel.tally', { panel }).watch({ schedule: 'immediate', signal: aborted() });

            await settle();

            expect(watch.status).toBe('disposed');
            expect(evaluations).toBe(0);
        });

        it('answers a disposed event listener whose source never starts', () => {
            const listener = isolated.query('panel.beat("beat")', { panel }).subscribe(() => {}, { signal: aborted() });

            expect(listener.status).toBe('disposed');
            expect(calls).toEqual([]);
        });

        it('answers a disposed execution handle that never starts', () => {
            const execution = isolated.query('panel.glow()', { panel }).run({ signal: aborted() });

            expect(execution.status).toBe('disposed');
            expect(calls).toEqual([]);
        });

        it('rejects an execution with its reason, executing nothing, and an evaluation, evaluating nothing', async () => {
            const signal = aborted();

            await expect(isolated.query('panel.mark()', { panel }).executeAsync({ signal })).rejects.toBe(signal.reason);
            await expect(isolated.query('panel.tally', { panel }).evaluateAsync({ signal })).rejects.toBe(signal.reason);
            expect(calls).toEqual([]);
            expect(evaluations).toBe(0);
        });

        it('answers a stopped listener of a watch, which hears nothing', async () => {
            const heard = [];
            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate' });
            const listener = watch.subscribe('change', (sender, args) => heard.push(args.value), { signal: aborted() });

            await settle();

            expect(listener.status).toBe('disposed');
            expect(heard).toEqual([]);
            watch.dispose();
        });
    });

    describe('a signal that outlives what it ends', () => {
        it('is let go of by a watch, a listener, an event listener and an execution handle disposed otherwise', () => {
            const signal = new AbortController().signal;
            const added = [];
            const removed = [];

            vi.spyOn(signal, 'addEventListener').mockImplementation((type, listener) => added.push(listener));
            vi.spyOn(signal, 'removeEventListener').mockImplementation((type, listener) => removed.push(listener));

            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate', signal });
            const listener = watch.subscribe('change', () => {}, { signal });
            const events = isolated.query('panel.beat("beat")', { panel }).subscribe(() => {}, { signal });
            const execution = isolated.query('panel.glow()', { panel }).run({ signal });

            listener.dispose();
            watch.dispose();
            events.dispose();
            execution.dispose();

            expect(added).toHaveLength(4);
            expect(removed).toEqual(expect.arrayContaining(added));
        });
    });

    describe('a watch\'s listeners', () => {
        it('receive the result the watch has first when they subscribe late, and the changes after it', async () => {
            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate' });

            await settle();
            panel.setAttribute('data-n', '2');
            await settle();

            const heard = [];

            // The change follows the subscription at once, and the result the watch had still comes first.
            watch.subscribe('change', (sender, args) => heard.push(args.value));
            panel.setAttribute('data-n', '3');
            await settle();

            expect(heard).toEqual(['2', '3']);
            watch.dispose();
        });

        it('each receive the event where another throws, the failure reaching the watch\'s error listeners', async () => {
            const heard = [];
            const errors = [];
            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', () => {
                throw new Error('first');
            });
            watch.subscribe('change', async () => {
                throw new Error('second');
            });
            watch.subscribe('change', (sender, args) => heard.push(args.value));
            watch.subscribe('error', (sender, args) => errors.push(args.error.message));
            await settle();

            expect(heard).toEqual(['1']);
            expect(errors).toEqual(['first', 'second']);
            expect(reported).toEqual([]);
            expect(watch.status).toBe('ready');
            watch.dispose();
        });

        it('send a failure of an error listener to the window\'s error reporting, and never to the error listeners again', async () => {
            const errors = [];
            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', () => {
                throw new Error('change');
            });
            watch.subscribe('error', (sender, args) => {
                errors.push(args.error.message);
                throw new Error('error');
            });
            await settle();

            expect(errors).toEqual(['change']);
            expect(reported.map(error => error.message)).toEqual(['error']);
            watch.dispose();
        });

        it('send a failure no error listener receives to the window\'s error reporting', async () => {
            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', () => {
                throw new Error('unheard');
            });
            await settle();

            expect(reported.map(error => error.message)).toEqual(['unheard']);
            watch.dispose();
        });

        it.each([
            ['an event the watch does not raise', watch => watch.subscribe('changes', () => {}), "no 'changes'"],
            ['a handler that is no function', watch => watch.subscribe('change', 'render'), 'function'],
        ])('refuse %s', (_, subscribe, message) => {
            const watch = isolated.query('panel:attribute["data-n"]', { panel }).watch({ schedule: 'immediate' });
            let error;

            try {
                subscribe(watch);
            } catch (failure) {
                error = failure;
            }

            expect(error.kind).toBe('structure');
            expect(error.message).toContain(message);
            watch.dispose();
        });
    });

    describe('selected views', () => {
        it('share the watch\'s evaluation, and raise their part only where it changed', async () => {
            const query = isolated.query('panel { n = it:attribute["data-n"], tally = it.tally, rows = it.children { n = it:attribute["data-n"] } }', { panel });
            const watch = query.watch({ schedule: 'immediate' });
            const second = [];
            const tallies = [];

            await settle();

            // Views selected and listened to once the watch runs start no evaluation of their own.
            watch.select('rows', 1, 'n').subscribe('change', (sender, args) => second.push([args.value, sender === watch]));
            watch.select('tally').subscribe('change', (sender, args) => tallies.push(args.value));
            await settle();

            expect(evaluations).toBe(1);

            panel.children[1].setAttribute('data-n', '7');
            await settle();
            panel.children[0].setAttribute('data-n', '5');
            await settle();

            // Each evaluation of the watch reaches the view once, and the view's part is the watch's own.
            expect(evaluations).toBe(3);
            expect(tallies).toEqual([1, 2, 3]);
            expect(tallies.at(-1)).toBe(watch.snapshot.tally);
            expect(second).toEqual([['2', true], ['7', true]]);
            expect(watch.select('rows', 1).snapshot).toEqual({ n: '7' });
            expect(await watch.select('rows', 1, 'n').readyAsync()).toBe('7');
            watch.dispose();
        });

        it('stop a listener by its own signal, leaving the watch and its other listeners running', async () => {
            const controller = new AbortController();
            const watch = isolated.query('panel { n = it:attribute["data-n"] }', { panel }).watch({ schedule: 'immediate' });
            const stopped = [];
            const running = [];
            const listener = watch.select('n').subscribe('change', (sender, args) => stopped.push(args.value), { signal: controller.signal });

            watch.subscribe('change', (sender, args) => running.push(args.value.n));
            await settle();
            controller.abort();
            panel.setAttribute('data-n', '2');
            await settle();

            expect(listener.status).toBe('disposed');
            expect(watch.status).toBe('ready');
            expect(stopped).toEqual(['1']);
            expect(running).toEqual(['1', '2']);
            watch.dispose();
        });

        it('stop with the watch when its signal aborts, which ends the work it owns', async () => {
            const controller = new AbortController();
            const watch = isolated.query('panel { n = it:attribute["data-n"], tally = it.tally }', { panel }).watch({ schedule: 'immediate', signal: controller.signal });
            const listener = watch.select('n').subscribe('change', () => {});

            await settle();
            controller.abort();
            panel.setAttribute('data-n', '2');
            await settle();

            expect(watch.status).toBe('disposed');
            expect(listener.status).toBe('disposed');
            expect(evaluations).toBe(1);
        });

        it('check a path\'s fit against the result at once, and belong to snapshot watches alone', () => {
            const watch = isolated.query('panel { n = it:attribute["data-n"] }', { panel }).watch({ schedule: 'immediate' });
            const live = isolated.query('panel { n = it:attribute["data-n"] }', { panel }).watch({ schedule: 'immediate', updateStrategy: 'liveState' });

            expect(() => watch.select('missing')).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("'missing'") }));
            expect(() => watch.select('n', 0)).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining('no list') }));
            expect(() => watch.select(-1)).toThrow(expect.objectContaining({ kind: 'structure' }));
            expect(() => live.select('n')).toThrow(expect.objectContaining({ kind: 'structure' }));
            watch.dispose();
            live.dispose();
        });
    });

    describe('a selection', () => {
        it('selects a field a keyword names, as an access after a dot reads one', () => {
            expect(isolated.query('r', { r: { then: 5 } }).select('then').evaluate()).toBe(5);
            expect(isolated.query('r', { r: { null: 6 } }).select('null').evaluate()).toBe(6);
            expect(() => isolated.query('r', { r: { then: 5 } }).select('a-b')).toThrow(expect.objectContaining({ kind: 'structure' }));
        });

        it('evaluates the whole query and answers the part, null past a null or an index out of range', () => {
            const query = isolated.query('panel { n = it:attribute["data-n"], rows = it.children { n = it:attribute["data-n"] } }', { panel });

            expect(query.select('rows', 1, 'n').evaluate()).toBe('2');
            expect(query.select('rows').select(0).evaluate()).toEqual({ n: '1' });
            expect(query.select('rows', 9, 'n').evaluate()).toBeNull();
        });

        it('checks its shape when made and its fit when an operation resolves the query, so a vocabulary not yet registered makes it without failing', () => {
            const query = isolated.query('panel { z = it.zoom }', { panel });
            const selection = query.select('z');

            expect(() => query.select('1x')).toThrow(expect.objectContaining({ kind: 'structure' }));
            expect(() => query.select(1.5)).toThrow(expect.objectContaining({ kind: 'structure' }));
            expect(() => selection.evaluate()).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining('zoom') }));
            expect(() => isolated.query('panel { n = 1 }', { panel }).select('m').evaluate()).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("'m'"), location: { pointer: '/expression', offset: 0, line: 1, column: 1 } }));
        });

        it('watches the part, raised where it changed, and refuses to keep it as live state', async () => {
            const selection = isolated.query('panel { n = it:attribute["data-n"], rows = it.children { n = it:attribute["data-n"] } }', { panel }).select('rows', 0, 'n');
            const watch = selection.watch({ schedule: 'immediate' });
            const heard = [];

            watch.subscribe('change', (sender, args) => heard.push(args.value));
            await settle();
            panel.setAttribute('data-n', '5');
            await settle();
            panel.children[0].setAttribute('data-n', '9');
            await settle();

            expect(heard).toEqual(['1', '9']);
            expect(watch.snapshot).toBe('9');
            expect(() => selection.watch({ updateStrategy: 'liveState' })).toThrow(expect.objectContaining({ kind: 'structure' }));
            watch.dispose();
        });
    });

    describe('binding', () => {
        it('makes a new query with with, leaving the query it was called on and what runs from it as they were', async () => {
            const other = document.createElement('div');

            other.setAttribute('data-n', '8');

            const query = isolated.query('panel:attribute["data-n"]', { panel });
            const watch = query.watch({ schedule: 'immediate' });
            const rebound = query.with({ panel: other });

            await settle();

            expect(rebound).not.toBe(query);
            expect(rebound.definition).toBe(query.definition);
            expect(rebound.evaluate()).toBe('8');
            expect(query.evaluate()).toBe('1');
            expect(watch.snapshot).toBe('1');
            watch.dispose();
        });

        it('makes a query from text alone, refusing an operation until a required binding is supplied', () => {
            const template = isolated.query('panel:attribute["data-n"]');

            expect(() => template.evaluate()).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining("No local in scope or script parameter is named 'panel'") }));
            expect(template.with({ panel }).evaluate()).toBe('1');
        });

        it('refuses a query object another DOMQL instance made, naming how to make it here', async () => {
            vi.resetModules();

            const { domql: other } = await import('#domql/domql.js');
            const foreign = other.query('panel:attribute["data-n"]', { panel });

            expect(() => isolated.query(foreign)).toThrow(expect.objectContaining({ kind: 'structure', message: expect.stringContaining('query.definition') }));
            expect(() => isolated.query(isolated.query('panel', { panel }))).toThrow(expect.objectContaining({ kind: 'structure', message: expect.stringContaining('query.with(bindings)') }));
            expect(isolated.query(foreign.definition, { panel }).evaluate()).toBe('1');
        });
    });

    describe('a continuous execution', () => {
        it('raises a failure it reports while it runs to its error listeners, and stops them when disposed', () => {
            let instance;

            isolated.registerModule(isolated.createModule('spark', {
                members: [{ name: 'spark', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous', target: 'element', parameters: [], implementation: ({ reportError }) => (instance = { update: () => {}, dispose: () => {}, fail: reportError }) }],
            }));

            const execution = isolated.query('panel.spark()', { panel }).run();
            const errors = [];
            const listener = execution.subscribe('error', (sender, args) => errors.push([args.error.message, sender === execution]));

            instance.fail(new Error('flicker'));
            execution.dispose();
            instance.fail(new Error('after'));

            expect(errors).toEqual([['flicker', true]]);
            expect(listener.status).toBe('disposed');
            expect(reported.map(error => error.message)).toEqual(['after']);
        });
    });
});
