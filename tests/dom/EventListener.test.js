import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { nexo, NexoError } from '@formaui-net/nexo';
import { BrowserVocabularyDeclarations } from '#domql/dom/BrowserVocabularyDeclarations.mjs';
import { EventListener } from '#domql/dom/EventListener.mjs';

/** Lets a promise a callback returned settle. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** An extension of DOMQL's elements, named for the module that declares it, holding the members given. */
const elementExtension = (moduleName, members) => ({ name: `${moduleName}Elements`, kind: 'extension', target: 'Domql.Element', members });

describe('EventListener', () => {
    // Each test loads its own copy of DOMQL, with a registry of its own.
    let isolated;
    let panel;
    let results;
    let failures;
    let reported;
    let listeners;
    let gauges;
    let stuck;
    let broken;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-n="1"><i id="a" data-n="1"></i><i id="b" data-n="2"></i></div>';
        panel = document.getElementById('panel');
        results = [];
        failures = [];
        reported = [];
        listeners = [];
        gauges = new Map();
        stuck = new Set();
        broken = false;
        window.reportError = error => reported.push(error);

        // A member kept by an observation whose samples the test supplies, one gauge for each element.
        isolated.registerModule(isolated.createModule('Level', {
            observationTypes: [{
                name: 'level', contract: 'maintained',
                impl: ({ request: { target }, notify }) => {
                    const gauge = { sample: { pending: true, value: null }, started: (gauges.get(target)?.started ?? 0) + 1, stopped: gauges.get(target)?.stopped ?? 0, notify };

                    gauges.set(target, gauge);

                    const stop = () => {
                        gauge.stopped++;

                        if (stuck.has(target)) {
                            throw new Error('stuck');
                        }
                    };

                    return { stop, sample: () => gauge.sample };
                },
            }],
            types: [elementExtension('Level', [{
                name: 'level', kind: 'property', result: 'Number?',
                updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] },
                impl: ({ samples: [sample] }) => sample,
            }])],
        }));

        // A member that fails while the test says so.
        isolated.registerModule(isolated.createModule('Flaky', {
            types: [elementExtension('Flaky', [{
                name: 'flaky', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' },
                impl: ({ receiver: element }) => {
                    if (broken) {
                        throw new Error('broken');
                    }

                    return Number(element.getAttribute('data-n'));
                },
            }])],
        }));
    });

    afterEach(() => {
        listeners.forEach(listener => listener.dispose());
        document.body.innerHTML = '';
    });

    /** Records each event's result, or the failure of a failed event. */
    const record = (_sender, args) => {
        if (args.status === 'ready') {
            results.push(args.value);
        } else {
            failures.push(args.error);
        }
    };

    const subscribe = (text, bindings = {}, handler = record) => {
        const created = isolated.query(text, bindings).subscribe(handler);

        listeners.push(created);

        return created;
    };

    /** Registers a module whose source `beats` the function starts, delivering events that carry a number. */
    const registerBeats = start => isolated.registerModule(isolated.createModule('Beats', {
        types: [
            { name: 'Beat', kind: 'structured', members: [{ name: 'n', kind: 'property', result: 'Number' }] },
            elementExtension('Beats', [{ name: 'beats', kind: 'function', invokedBy: 'host', requestKind: 'subscription', arguments: 'positional', parameters: [{ name: 'type', kind: 'value', type: 'String', required: true, fixed: true, selects: 'type', selector: 'event', nulls: 'propagate' }], result: '@selected', impl: start }]),
        ],
        mappings: [{ selector: 'event', key: 'beat', type: 'Beat' }],
    }));

    /** Dispatches an input event at the element, which bubbles to the panel. */
    const input = element => element.dispatchEvent(new window.Event('input', { bubbles: true }));

    describe('subscribing', () => {
        it('starts in the call, so an event that follows it is heard in the task it is dispatched in', () => {
            const listener = subscribe('panel.on("input") { id = it.target?["id"] }', { panel });

            expect(listener.status).toBe('ready');

            input(panel.children[0]);
            input(panel);

            expect(results).toEqual([{ id: 'a' }, { id: 'panel' }]);
            expect(Object.isFrozen(results[0])).toBe(true);
        });

        it('hears the events that reach its receiver alone', () => {
            subscribe('first.on("input") { id = it.target?["id"] }', { first: panel.children[0] });

            input(panel.children[1]);
            input(panel.children[0]);

            expect(results).toEqual([{ id: 'a' }]);
        });

        it('captures what the event carries when it is dispatched', () => {
            subscribe('panel.on("click") { button = it.button, x = it.clientX, kind = it.pointerType }', { panel });

            panel.dispatchEvent(new window.PointerEvent('click', { bubbles: true, button: 2, clientX: 12, pointerType: 'pen' }));

            expect(results).toEqual([{ button: 2, x: 12, kind: 'pen' }]);
        });

        it('listens in the capture phase where its option says so, hearing an event before a listener nearer its target stops it', () => {
            const [first] = panel.children;
            const heard = [];
            const hear = phase => (sender, args) => {
                heard.push(phase);
                record(sender, args);
            };

            first.addEventListener('input', event => {
                heard.push('target');
                event.stopPropagation();
            });
            subscribe('panel.on("input", { capture = true }) { id = it.target?["id"] }', { panel }, hear('capture'));
            subscribe('panel.on("input", { capture = false }) { id = it.target?["id"] }', { panel }, hear('bubble'));
            subscribe('panel.on("input") { id = it.target?["id"] }', { panel }, hear('bubble'));

            input(first);

            expect(heard).toEqual(['capture', 'target']);
            expect(results).toEqual([{ id: 'a' }]);

            input(panel);

            expect(heard).toEqual(['capture', 'target', 'capture', 'bubble', 'bubble']);
        });

        it('stops listening in the phase it listened in', () => {
            const listener = subscribe('panel.on("input", { capture = true }) { id = it.target?["id"] }', { panel });

            input(panel.children[0]);
            listener.dispose();
            input(panel.children[0]);

            expect(results).toEqual([{ id: 'a' }]);
        });

        it('takes a subscription made from its definition, and calls the handler with the event listener', () => {
            const { definition } = isolated.query('panel.on("input") { id = it.target?["id"] }');
            const senders = [];
            const listener = isolated.query(definition, { panel }).subscribe((sender, args) => {
                senders.push(sender);
                record(sender, args);
            });

            listeners.push(listener);
            input(panel);

            expect(results).toEqual([{ id: 'panel' }]);
            expect(senders).toEqual([listener]);
        });

        it('starts the source with its receiver and arguments, and stops it when disposed', () => {
            const calls = [];
            let deliver;
            let stopped = 0;

            registerBeats(({ receiver, args, env: environment, deliver: delivers }) => {
                calls.push({ receiver, args, environment });
                deliver = delivers;

                return { stop: () => stopped++ };
            });

            const listener = subscribe('import Beats\npanel:beats("beat") { n = it.n }', { panel });

            deliver({ n: 5 });
            listener.dispose();
            deliver({ n: 6 });

            expect(calls).toEqual([{ receiver: panel, args: { type: 'beat' }, environment: { window, document } }]);
            expect(results).toEqual([{ n: 5 }]);
            expect(stopped).toBe(1);
        });

        it('projects what the source delivers while it starts at once, and hands it over once the caller has the event listener, before what follows', async () => {
            const [first] = panel.children;
            let deliver;

            registerBeats(({ deliver: delivers }) => {
                deliver = delivers;
                delivers({ n: 1 });
                delivers({ n: 'one' });

                return { stop: () => {} };
            });

            subscribe('import Beats\nimport Level\npanel:beats("beat") { n = it.n, level = item:level }', { panel, item: first });

            expect(results).toEqual([]);
            expect(failures).toEqual([]);
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 0 });

            deliver({ n: 2 });
            await Promise.resolve();

            expect(results).toEqual([{ n: 1, level: null }, { n: 2, level: null }]);
            expect(failures).toHaveLength(1);

            deliver({ n: 3 });

            expect(results).toHaveLength(3);
        });

        it('fails the call where the source cannot start, or answers nothing that stops it', () => {
            registerBeats(({ receiver: element }) => {
                if (element.id === 'a') {
                    throw new Error('closed');
                }

                return {};
            });

            const [first, second] = panel.children;

            expect(() => subscribe('import Beats\nitem:beats("beat") { n = it.n }', { item: first })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5003', message: expect.stringContaining("The event source 'beats' failed to start listening"), location: { pointer: '/expression/context', offset: 13, line: 2, column: 1 }, cause: expect.objectContaining({ message: 'closed' }) }));
            expect(() => subscribe('import Beats\nitem:beats("beat") { n = it.n }', { item: second })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5004', message: expect.stringContaining('answered nothing that stops it'), location: { pointer: '/expression/context', offset: 13, line: 2, column: 1 } }));
        });

        it('fails the call with what the source threw as its cause, even where that is no error', () => {
            registerBeats(() => {
                throw null;
            });

            let error;

            try {
                subscribe('import Beats\npanel:beats("beat") { n = it.n }', { panel });
            } catch (failure) {
                error = failure;
            }

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5003', message: expect.stringContaining("The event source 'beats' failed to start listening") });
            expect(error.location).toEqual({ pointer: '/expression/context', offset: 13, line: 2, column: 1 });
            expect(error.cause).toBeNull();
        });

        it('lets go of what an event delivered while the source started opened, and hands nothing over, where the start then fails', async () => {
            const [first] = panel.children;

            registerBeats(({ deliver }) => {
                deliver({ n: 1 });

                throw new Error('closed');
            });

            expect(() => subscribe('import Beats\nimport Level\npanel:beats("beat") { n = it.n, level = item:level }', { panel, item: first })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5003', location: { pointer: '/expression/context', offset: 26, line: 3, column: 1 } }));
            await Promise.resolve();

            expect(results).toEqual([]);
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 1 });
        });

        it('listens to nothing where the receiver of its source is null', () => {
            const listener = subscribe('panel.first(".none")?.on("input") { id = it.target?["id"] }', { panel });

            input(panel);

            expect(listener.status).toBe('ready');
            expect(results).toEqual([]);
        });

        it('refuses a request that is not a subscription, and a handler that is not a function', () => {
            const subscription = isolated.query('panel.on("input") { id = it.target?["id"] }', { panel });

            expect(() => isolated.query('panel.children.count', { panel }).subscribe(() => {})).toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining("Cannot subscribe to 'panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") }));
            expect(() => subscription.subscribe()).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2007' }));
            expect(() => subscription.subscribe('loudly')).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2007' }));
        });
    });

    describe('sessions', () => {
        it('answer null for a maintained member still pending, and the sample that arrived for a later event', () => {
            const [first] = panel.children;

            subscribe('import Level\npanel.on("input") { level = it.target?:level }', { panel });

            input(first);
            gauges.get(first).sample = { pending: false, value: 4 };
            input(first);

            expect(results).toEqual([{ level: null }, { level: 4 }]);
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 0 });
        });

        it('keep what the last projection read and let go of the rest', () => {
            const [first, second] = panel.children;

            subscribe('import Level\npanel.on("input") { level = it.target?:level }', { panel });

            input(first);
            input(second);

            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 1 });
            expect(gauges.get(second)).toMatchObject({ started: 1, stopped: 0 });
        });

        it('are kept as they were through a projection that fails, which lets go of those it opened and delivers nothing', () => {
            const [first, second] = panel.children;
            const listener = subscribe('import Flaky\nimport Level\npanel.on("input") { level = it.target?:level, n = it.target?:flaky }', { panel });

            input(first);
            broken = true;
            input(second);

            expect(results).toEqual([{ level: null, n: 1 }]);
            expect(failures).toHaveLength(1);
            expect(failures[0].message).toContain("The member 'flaky' failed");
            expect(listener.status).toBe('ready');
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 0 });
            expect(gauges.get(second)).toMatchObject({ started: 1, stopped: 1 });

            broken = false;
            input(first);

            expect(results).toHaveLength(2);
        });
    });

    describe('capture', () => {
        it('hands the handler an event the source cannot capture as a failed event, and keeps listening', () => {
            let deliver;

            registerBeats(({ deliver: delivers }) => {
                deliver = delivers;

                return { stop: () => {} };
            });

            const listener = subscribe('import Beats\npanel:beats("beat") { n = it.n }', { panel });

            deliver({ n: 'one' });
            deliver({ n: 2 });

            expect(failures).toHaveLength(1);
            expect(failures[0].message).toContain("The host call 'beats' supplied a value whose 'n' is \"one\", and 'n' is declared Number");
            expect(results).toEqual([{ n: 2 }]);
            expect(listener.status).toBe('ready');
        });
    });

    describe('the handler', () => {
        it('reports a handler that throws or rejects to the window\'s error reporting, and keeps listening', async () => {
            let calls = 0;

            subscribe('panel.on("input") { id = it.target?["id"] }', { panel }, () => {
                calls++;

                if (calls === 1) {
                    throw new Error('thrown');
                }

                return Promise.reject(new Error('rejected'));
            });

            input(panel);
            input(panel);
            await settle();

            expect(calls).toBe(2);
            expect(reported.map(failure => failure.message)).toEqual(['thrown', 'rejected']);
        });

        it('sends a failure of the handler given a failed event to the window\'s error reporting, and never back to the handler', () => {
            const received = [];

            subscribe('import Flaky\npanel.on("input") { n = it.target?:flaky }', { panel }, (_sender, args) => {
                received.push(args);

                throw new Error('unheard');
            });

            broken = true;
            input(panel);

            expect(received).toEqual([{ status: 'failed', error: expect.objectContaining({ message: expect.stringContaining("The member 'flaky' failed") }) }]);
            expect(reported.map(failure => failure.message)).toEqual(['unheard']);
        });
    });

    describe('disposal', () => {
        it('lets go of every session even where an observation fails to stop, and reports the failure', () => {
            const [first, second] = panel.children;
            const listener = subscribe('import Level\npanel.on("input") { a = first:level, b = second:level }', { panel, first, second });

            stuck.add(first);
            input(panel);
            listener.dispose();

            expect(listener.status).toBe('disposed');
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 1 });
            expect(gauges.get(second)).toMatchObject({ started: 1, stopped: 1 });
            expect(reported.map(failure => failure.message)).toEqual(['stuck']);
        });

        it('stops listening, lets go of every session and calls nothing again', () => {
            const [first] = panel.children;
            const listener = subscribe('import Level\npanel.on("input") { level = it.target?:level }', { panel });

            input(first);
            listener.dispose();
            input(first);

            expect(listener.status).toBe('disposed');
            expect(results).toEqual([{ level: null }]);
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 1 });
            expect(() => listener.dispose()).not.toThrow();
        });

        it('reports a source that fails to stop, and ends the event listener all the same', () => {
            registerBeats(() => ({ stop: () => { throw new Error('stuck'); } }));

            const listener = subscribe('import Beats\npanel:beats("beat") { n = it.n }', { panel });

            listener.dispose();

            expect(listener.status).toBe('disposed');
            expect(reported.map(failure => failure.message)).toEqual(['stuck']);
        });
    });

    describe('other event listeners of the same events', () => {
        it('go on when one is disposed, keeping the observations they share', () => {
            const [first] = panel.children;
            const disposed = subscribe('import Level\npanel.on("input") { level = it.target?:level }', { panel }, () => {});

            subscribe('import Level\npanel.on("input") { level = it.target?:level }', { panel });
            input(first);
            disposed.dispose();
            input(first);

            expect(results).toEqual([{ level: null }, { level: null }]);
            expect(gauges.get(first)).toMatchObject({ started: 1, stopped: 0 });
        });

        it('go on when the projection or the handler of one fails', () => {
            const [first] = panel.children;

            subscribe('import Flaky\npanel.on("input") { n = it.target?:flaky }', { panel });
            subscribe('panel.on("input") { id = it.target?["id"] }', { panel }, () => { throw new Error('consumer'); });
            subscribe('panel.on("input") { id = it.target?["id"] }', { panel });

            broken = true;
            input(first);
            input(first);

            expect(results).toEqual([{ id: 'a' }, { id: 'a' }]);
            expect(failures.map(failure => failure.message)).toEqual([expect.stringContaining('broken'), expect.stringContaining('broken')]);
            expect(reported.map(failure => failure.message)).toEqual(['consumer', 'consumer']);
        });
    });

    describe('a module registered while it listens', () => {
        /** Dispatches a focus event at the panel, an event whose target is a nullable element. */
        const focus = () => panel.dispatchEvent(new window.FocusEvent('focus'));

        /** What a module that recognizes values of its own declares: a typeOf, which a script resolved before it may capture a value through once it is registered. */
        const recognizing = () => ({ typeOf: () => null, types: [{ name: 'Gadget', kind: 'reference', isInstance: () => false }] });

        /** Registers a member answering a value of Any, its element's data-n, which a typeOf registered later may recognize, so a resolution reading it goes stale. */
        const registerBag = () => isolated.registerModule(isolated.createModule('Bag', {
            types: [elementExtension('Bag', [{ name: 'bag', kind: 'property', result: 'Any', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: true }] }, impl: ({ receiver }) => receiver.getAttribute('data-n') }])],
        }));

        it('leaves a watch and a subscription that are running evaluating and delivering, each through the resolution it had, where the module declares no typeOf', async () => {
            const [first] = panel.children;
            const watchQuery = isolated.query('panel { n = it["data-n"], count = it.children.count }', { panel });
            const subscription = isolated.query('panel.on("input") { id = it.target?["id"] }', { panel });
            const snapshots = [];
            const watched = watchQuery.watch({ schedule: 'immediate' });

            listeners.push(watched);
            watched.subscribe('change', (_sender, args) => snapshots.push(args.status === 'ready' ? args.value : args.error));
            listeners.push(subscription.subscribe(record));
            await settle();
            input(first);

            const resolved = [watchQuery.resolve({ watch: true }), subscription.resolve()];

            isolated.registerModule(isolated.createModule('Glow', {
                types: [elementExtension('Glow', [{ name: 'glow', kind: 'property', result: 'Boolean', updates: { changes: 'constant', reads: 'fresh' }, impl: () => true }])],
            }));
            panel.setAttribute('data-n', '2');
            panel.append(document.createElement('i'));
            await settle();
            input(first);

            // The registration leaves both resolutions current, so DOMQL keeps each, and the event's target, a nullable element, is captured as before.
            expect(watchQuery.resolve({ watch: true })).toBe(resolved[0]);
            expect(subscription.resolve()).toBe(resolved[1]);
            expect(snapshots).toEqual([{ n: '1', count: 2 }, { n: '2', count: 3 }]);
            expect(watched.status).toBe('ready');
            expect(results).toEqual([{ id: 'a' }, { id: 'a' }]);
            expect(failures).toEqual([]);
        });

        it('prepares a subscription to events whose target is a nullable element again where a module declaring a typeOf makes it stale, and goes on delivering through its source', () => {
            const subscription = isolated.query('panel.on("focus") { id = it.target?["id"] }', { panel });
            const clicks = isolated.query('panel.on("click") { id = it.target["id"] }', { panel });
            const resolved = subscription.resolve();
            const listener = subscription.subscribe(record);

            listeners.push(listener);

            // The same request resolved by Nexo against DOMQL's declarations, which says whether its resolution is current.
            const registry = nexo.createRegistry([BrowserVocabularyDeclarations.module]);
            const resolution = registry.resolve(subscription.definition, { panel });
            const clickResolution = registry.resolve(clicks.definition, { panel });

            focus();
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            registry.registerModule(nexo.createModule('Gadgets', recognizing()));
            focus();
            focus();

            // A DomEvent's target is an Element?, which the registered typeOf may now recognize; a PointerEvent's, an Element, stays as it was.
            expect(resolution.isCurrent).toBe(false);
            expect(clickResolution.isCurrent).toBe(true);

            // The event listener resolves and prepares the subscription again, which reaches the receiver and the arguments its source listens with, and goes on delivering through that source.
            expect(listener.status).toBe('ready');
            expect(results).toEqual([{ id: 'panel' }, { id: 'panel' }, { id: 'panel' }]);
            expect(failures).toEqual([]);
            expect(subscription.resolve()).not.toBe(resolved);
        });

        it('keeps a stale subscription listening with the receiver it started with, which preparing it again never evaluates for its source', () => {
            const [first, second] = panel.children;

            first.classList.add('target');

            const listener = isolated.query('Domql.document.first(".target")?.on("focus") { id = it.target?["id"] }').subscribe(record);

            listeners.push(listener);
            first.classList.remove('target');
            second.classList.add('target');
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            first.dispatchEvent(new window.FocusEvent('focus'));
            second.dispatchEvent(new window.FocusEvent('focus'));

            expect(results).toEqual([{ id: 'a' }]);
            expect(failures).toEqual([]);
            expect(listener.status).toBe('ready');
        });

        it('ends a stale subscription whose preparation again reaches no host call, with the failure that says to subscribe again', () => {
            const [first] = panel.children;

            first.classList.add('target');

            const listener = isolated.query('Domql.document.first(".target")?.on("focus") { id = it.target?["id"] }').subscribe(record);

            listeners.push(listener);
            first.classList.remove('target');
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            first.dispatchEvent(new window.FocusEvent('focus'));
            first.dispatchEvent(new window.FocusEvent('focus'));

            expect(results).toEqual([]);
            // The failure stands at the call of the source the event listener listens through.
            expect(failures).toEqual([expect.objectContaining({ name: 'NexoError', kind: 'evaluation', code: 'DOMQL5015', message: expect.stringContaining("made the request of 'on' stale, and preparing it again reaches no host call; subscribe again"), location: { pointer: '/expression/chain/context', offset: 0, line: 1, column: 1 } })]);
            expect(listener.status).toBe('disposed');
        });

        it('keeps a watch whose resolution a module declaring a typeOf makes stale evaluating, through the query resolved again', async () => {
            registerBag();

            const snapshots = [];
            const watched = isolated.query('import Bag\n{ n = panel["data-n"], b = panel:bag }', { panel }).watch({ schedule: 'immediate' });

            listeners.push(watched);
            watched.subscribe('change', (_sender, args) => snapshots.push(args.status === 'ready' ? args.value : args.error));
            await settle();
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            panel.setAttribute('data-n', '2');
            await settle();

            expect(snapshots).toEqual([{ n: '1', b: '1' }, { n: '2', b: '2' }]);
            expect(watched.status).toBe('ready');
        });

        it('answers an evaluation that waits, whose resolution a module declaring a typeOf makes stale, through the query resolved again', async () => {
            registerBag();

            const query = isolated.query('import Bag\nimport Level\n{ b = panel:bag, level = panel:level }', { panel });
            const resolved = query.resolve();
            const answer = query.evaluateAsync();

            await settle();
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            panel.setAttribute('data-n', '2');
            gauges.get(panel).sample = { pending: false, value: 4 };
            gauges.get(panel).notify();

            // The evaluation that follows the sample reads the query resolved again, and reaches the observation the first one started.
            await expect(answer).resolves.toEqual({ b: '2', level: 4 });
            expect(query.resolve()).not.toBe(resolved);
            expect(gauges.get(panel)).toMatchObject({ started: 1, stopped: 1 });
        });

        it('ends a stale subscription whose preparation again fails, handing the handler that failure', () => {
            const [, second] = panel.children;

            // The source listens to the child the panel's data-n indexes, which preparing the subscription again evaluates.
            const listener = subscribe('import Flaky\npanel.children[panel:flaky]?.on("focus") { id = it.target?["id"] }', { panel });

            second.dispatchEvent(new window.FocusEvent('focus'));
            broken = true;
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            second.dispatchEvent(new window.FocusEvent('focus'));
            second.dispatchEvent(new window.FocusEvent('focus'));

            expect(results).toEqual([{ id: 'b' }]);
            expect(failures).toEqual([expect.objectContaining({ kind: 'evaluation', code: 'NEXO5007', message: expect.stringContaining("The member 'flaky' failed"), location: { pointer: '/expression/chain/context/callee/receiver/argument', offset: 28, line: 2, column: 16 } })]);
            expect(listener.status).toBe('disposed');
        });

        it('projects a once execution\'s result through the request prepared again where a module declaring a typeOf made it stale while it ran', async () => {
            let finish;

            isolated.registerModule(isolated.createModule('Later', {
                types: [elementExtension('Later', [{ name: 'later', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Domql.DomEvent', impl: () => new Promise(resolve => { finish = resolve; }) }])],
            }));

            const executed = isolated.query('import Later\npanel:later() { id = it.target?["id"] }', { panel }).executeAsync();

            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            finish({ target: panel });

            await expect(executed).resolves.toEqual({ id: 'panel' });
        });

        it('rejects a once execution a module declaring a typeOf made stale while it ran, whose request prepared again reaches no host call, its effect standing', async () => {
            const [first] = panel.children;
            let finish;

            isolated.registerModule(isolated.createModule('Later', {
                types: [elementExtension('Later', [{
                    name: 'later', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', parameters: [], result: 'Domql.DomEvent',
                    impl: ({ receiver: element }) => {
                        element.dataset.state = 'done';

                        return new Promise(resolve => { finish = resolve; });
                    },
                }])],
            }));
            first.classList.add('target');

            const executed = isolated.query('import Later\nDomql.document.first(".target")?:later() { id = it.target?["id"] }').executeAsync();

            first.classList.remove('target');
            isolated.registerModule(isolated.createModule('Gadgets', recognizing()));
            finish({ target: panel });

            await expect(executed).rejects.toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5015', message: expect.stringContaining("made the request of 'later' stale, and preparing it again reaches no host call; carry it out again"), location: { pointer: '/expression/chain/context', offset: 13, line: 2, column: 1 } }));
            expect(first.dataset.state).toBe('done');
        });
    });
});

describe('EventListener preparing again', () => {
    it('ends a stale subscription whose preparation again reaches another host call, with the failure that says to subscribe again', () => {
        // An evaluator whose projections are refused as stale, and whose preparation again reaches another declaration of the source's name.
        const calls = [{ name: 'beats' }, { name: 'beats' }].map(declaration => ({ kind: 'prepared', declaration, receiver: null, args: {}, pointer: '/expression/context' }));
        const received = [];
        const reported = [];
        let deliver;
        let stopped = 0;
        const listener = new EventListener({
            evaluator: {
                prepareHostCall: () => calls.shift(),
                project: () => ({ value: null, error: NexoError.structure('NEXO2040', 'The resolution is stale', {}), dispose: () => {} }),
            },
            implementationOf: () => ({ deliver: delivers }) => {
                deliver = delivers;

                return { stop: () => stopped++ };
            },
            getLocation: pointer => ({ pointer }),
            environment: { window, document },
            observations: null,
            reportError: error => reported.push(error),
            handler: (_sender, args) => received.push(args),
        });

        deliver({ n: 1 });
        deliver({ n: 2 });

        expect(received).toEqual([{ status: 'failed', error: expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5015', message: expect.stringContaining("made the request of 'beats' stale, and preparing it again reaches another host call; subscribe again"), location: { pointer: '/expression/context' } }) }]);
        expect(listener.status).toBe('disposed');
        expect(stopped).toBe(1);
        expect(reported).toEqual([]);
    });
});
