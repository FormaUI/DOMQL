import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { QueryEvaluation } from '#domql/dom/QueryEvaluation.mjs';
import { Watch } from '#domql/dom/Watch.mjs';

/** Lets the observations deliver and the watches that follow them evaluate. */
const settle = (milliseconds = 0) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** The error a promise rejects with. */
const rejection = promise => promise.then(() => { throw new Error('The promise resolved'); }, error => error);

describe('Watch', () => {
    // Each test loads its own copy of DOMQL, with a registry of its own.
    let isolated;
    let panel;
    let snapshots;
    let failures;
    let reported;
    let watches;
    let gauges;
    let evaluations;
    let broken;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-n="1"><i data-n="1"></i><i data-n="2"></i></div>';
        panel = document.getElementById('panel');
        snapshots = [];
        failures = [];
        reported = [];
        watches = [];
        gauges = new Map();
        evaluations = 0;
        broken = false;
        window.reportError = error => reported.push(error);

        // A member kept by an observation whose samples the test supplies, one gauge for each element.
        isolated.registerModule(isolated.createModule('level', {
            observationTypes: [{ name: 'level', contract: 'maintained', function: 'observeLevel' }],
            members: [{
                name: 'level', function: 'level', kind: 'property', on: 'element', parameters: [], result: 'number?',
                changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }],
            }],
        }, {
            observeLevel: ({ target }, notify) => {
                const gauge = { sample: { pending: true, value: null }, stopped: 0, notify };

                gauges.set(target, gauge);

                return { stop: () => gauge.stopped++, sample: () => gauge.sample };
            },
            level: (_receiver, _args, _environment, [sample]) => sample,
        }));

        // A member that counts the evaluations that read it, and one that fails while the test says so, both changing with the attributes of their element.
        const attributes = [{ type: 'mutation', of: 'receiver', attributes: true }];

        isolated.registerModule(isolated.createModule('tally', {
            members: [{ name: 'tally', function: 'tally', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'observable', reads: 'fresh', observations: attributes }],
        }, { tally: () => ++evaluations }));
        isolated.registerModule(isolated.createModule('flaky', {
            members: [{ name: 'flaky', function: 'flaky', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'observable', reads: 'fresh', observations: attributes }],
        }, {
            flaky: element => {
                if (broken) {
                    throw new Error('broken');
                }

                return Number(element.getAttribute('data-n'));
            },
        }));
    });

    afterEach(() => {
        watches.forEach(watch => watch.dispose());
        document.body.innerHTML = '';
    });

    /**
     * Starts a watch of the text, immediate unless the options say otherwise, whose ready results go to `onChange`, its snapshot, or for live state the object and the change set, and whose failed evaluations and handler failures go to `onError`.
     * By default they are collected in `snapshots` and `failures`; an `onError` of null leaves the watch with no listener of its errors.
     */
    const watch = (text, bindings = {}, options = {}) => {
        const { onChange = snapshot => snapshots.push(snapshot), onError = error => failures.push(error), ...watchOptions } = options;
        const created = isolated.query(text, bindings).watch({ schedule: 'immediate', ...watchOptions });

        watches.push(created);
        created.subscribe('change', (_sender, args) => {
            if (args.status === 'failed') {
                return onError?.(args.error);
            }

            return 'liveState' in args ? onChange(args.liveState, args.changes) : onChange(args.value);
        });

        if (onError !== null) {
            created.subscribe('error', (_sender, args) => onError(args.error));
        }

        return created;
    };

    /** Takes the animation frames from the window, so a test runs them when it chooses. */
    const holdFrames = () => {
        const frames = { callbacks: [], canceled: [] };

        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.callbacks.push(callback));
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => frames.canceled.push(handle));

        return frames;
    };

    const change = (element, value) => {
        element.setAttribute('data-n', String(value));

        return settle();
    };

    describe('the first snapshot', () => {
        it('is reported after the call returns, through the change event every snapshot raises', async () => {
            const watched = watch('@panel attributeOf "data-n"', { panel });

            expect(watched.status).toBe('pending');
            expect(watched.snapshot).toBeUndefined();
            expect(snapshots).toEqual([]);

            await settle();

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual(['1']);
            expect(watched.snapshot).toBe('1');
        });

        it('waits for the first sample of every maintained member it reads', async () => {
            const [first] = panel.children;
            const watched = watch('{ n: @item.level }', { item: first });

            await settle();

            expect(watched.status).toBe('pending');
            expect(snapshots).toEqual([]);

            gauges.get(first).sample = { pending: false, value: 4 };
            gauges.get(first).notify();
            await settle();

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual([{ n: 4 }]);
        });

        it('reports a null snapshot, which is read beside the status', async () => {
            const watched = watch('@panel.first(".none") attributeOf "data-n"', { panel }, { acceptPartialObservation: true });

            await settle();

            expect(snapshots).toEqual([null]);
            expect(watched.status).toBe('ready');
            expect(watched.snapshot).toBeNull();
        });
    });

    describe('changes', () => {
        it('are followed by an evaluation, which reports a snapshot that differs', async () => {
            watch('@panel attributeOf "data-n"', { panel });
            await settle();
            await change(panel, 5);

            expect(snapshots).toEqual(['1', '5']);
        });

        it('report nothing when the snapshot is the one last reported', async () => {
            watch('@panel attributeOf "data-n"', { panel });
            await settle();
            await change(panel, 1);

            expect(snapshots).toEqual(['1']);
        });

        it('are delivered as snapshots that share what did not change', async () => {
            watch('@panel { id: self attributeOf "id", items: self.children { n: self attributeOf "data-n" } }', { panel });
            await settle();
            await change(panel.children[1], 7);

            const [before, after] = snapshots;

            expect(after.items[1]).toEqual({ n: '7' });
            expect(after).not.toBe(before);
            expect(after.items).not.toBe(before.items);
            expect(after.items[0]).toBe(before.items[0]);
            expect(Object.isFrozen(after)).toBe(true);
        });

        it('are followed through the elements the query now reads: one added is observed, one removed is not', async () => {
            watch('@panel.children { n: self attributeOf "data-n" }', { panel });
            await settle();

            const added = document.createElement('i');

            added.setAttribute('data-n', '3');
            panel.append(added);
            await settle();

            expect(snapshots.at(-1)).toEqual([{ n: '1' }, { n: '2' }, { n: '3' }]);

            await change(added, 9);

            expect(snapshots.at(-1)).toEqual([{ n: '1' }, { n: '2' }, { n: '9' }]);

            added.remove();
            await settle();

            const reports = snapshots.length;

            await change(added, 10);

            expect(snapshots.length).toBe(reports);
        });

        it('wait for the next animation frame when the watch is scheduled so, evaluating once however many fired', async () => {
            const frames = holdFrames();

            watch('@panel.tally', { panel }, { schedule: 'frame' });
            await settle();

            expect(snapshots).toEqual([1]);

            panel.setAttribute('data-n', '2');
            panel.setAttribute('data-n', '3');
            panel.setAttribute('data-n', '4');
            await settle();

            expect(snapshots).toEqual([1]);
            expect(frames.callbacks.length).toBe(1);

            frames.callbacks[0]();

            expect(snapshots).toEqual([1, 2]);
            expect(evaluations).toBe(2);
        });

        it('are followed without waiting for an animation frame when the watch is scheduled so', async () => {
            watch('@panel.tally', { panel }, { schedule: 'immediate' });
            await settle();

            panel.setAttribute('data-n', '2');
            await settle();

            expect(snapshots).toEqual([1, 2]);
        });
    });

    describe('a conversion', () => {
        it('follows the value it converts, fails while that value has no conversion, and recovers once it has', async () => {
            const watched = watch('@panel attributeOf "data-n" to "number"', { panel });

            await settle();
            await change(panel, 2);
            await change(panel, 'two');

            expect(watched.status).toBe('failed');
            expect(failures.map(failure => failure.message)).toEqual([expect.stringContaining('The conversion from string to number failed: "two" is no number')]);

            await change(panel, 3);

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual([1, 2, 3]);
        });

        it('lets ?? say what a missing value means, which it follows as the value comes and goes', async () => {
            watch('@panel attributeOf "data-n" to "number" ?? 0', { panel });
            await settle();

            panel.removeAttribute('data-n');
            await settle();
            await change(panel, 4);

            expect(snapshots).toEqual([1, 0, 4]);
            expect(failures).toEqual([]);
        });
    });

    describe('under the immediate schedule', () => {
        /** Starts an immediate watch of the first child's gauge and tally, its first sample delivered, and answers the watch and the gauge. */
        const watchGauge = async (text = '{ level: @first.level, tally: @first.tally }') => {
            const [first] = panel.children;
            const created = watch(text, { first });

            await settle();

            const gauge = gauges.get(first);

            gauge.sample = { pending: false, value: 1 };
            gauge.notify();
            await settle();

            return { created, gauge };
        };

        it('evaluates once, in a microtask, for the invalidations it receives before that evaluation begins', async () => {
            const { gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            gauge.notify();
            gauge.notify();

            expect(evaluations).toBe(before);

            await settle();

            expect(evaluations).toBe(before + 1);
        });

        it('evaluates again for an invalidation it receives after its queued evaluation ran', async () => {
            const { gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            await settle();
            gauge.notify();
            await settle();

            expect(evaluations).toBe(before + 2);
        });

        it('lets a queued evaluation go once the watch is disposed', async () => {
            const { created, gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            created.dispose();
            await settle();

            expect(evaluations).toBe(before);
            expect(failures).toEqual([]);
        });

        it('answers a queued evaluation with a refresh that runs before it', async () => {
            const { created, gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            await created.refreshAsync();
            await settle();

            expect(evaluations).toBe(before + 1);
        });

        it('evaluates again for an invalidation it receives while it evaluates', async () => {
            let duringEvaluation = null;

            isolated.registerModule(isolated.createModule('nudge', {
                members: [{ name: 'nudge', function: 'nudge', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
            }, {
                nudge: () => {
                    const nudge = duringEvaluation;

                    duringEvaluation = null;
                    nudge?.();

                    return 0;
                },
            }));

            const { gauge } = await watchGauge('{ level: @first.level, tally: @first.tally, nudge: @first.nudge }');
            const before = evaluations;

            duringEvaluation = () => gauge.notify();
            gauge.notify();
            await settle();

            expect(evaluations).toBe(before + 2);
        });
    });

    describe('a maintained member it first reads after its first snapshot', () => {
        it('is pending in the snapshot reported, which is evaluated again when its first sample arrives', async () => {
            const [first, second] = panel.children;

            watch('{ a: @first.level }', { first });
            await settle();
            gauges.get(first).sample = { pending: false, value: 1 };
            gauges.get(first).notify();
            await settle();

            expect(snapshots).toEqual([{ a: 1 }]);

            // A watch of the list reads the second child's gauge once it has been added to what is read.
            const listed = watch('@panel.children { level: self.level }', { panel });

            await settle();
            gauges.get(first).notify();
            await settle();

            expect(listed.status).toBe('pending');

            gauges.get(second).sample = { pending: false, value: 2 };
            gauges.get(second).notify();
            gauges.get(first).sample = { pending: false, value: 1 };
            gauges.get(first).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual([{ level: 1 }, { level: 2 }]);
        });
    });

    describe('a local', () => {
        it('holds what it reads only while an evaluation uses it: from when a branch first reaches it until none does', async () => {
            watch('@panel { let level: self.level, value: if self attributeOf "data-on" is null then 0 else level }', { panel });
            await settle();

            expect(snapshots).toEqual([{ value: 0 }]);
            expect(gauges.has(panel)).toBe(false);

            panel.setAttribute('data-on', '');
            await settle();
            gauges.get(panel).sample = { pending: false, value: 5 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ value: 5 });

            panel.removeAttribute('data-on');
            await settle();

            expect(snapshots.at(-1)).toEqual({ value: 0 });
            expect(gauges.get(panel).stopped).toBe(1);

            const reports = snapshots.length;

            gauges.get(panel).sample = { pending: false, value: 6 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.length).toBe(reports);
        });
    });

    describe('an optional chain', () => {
        it('holds what it reads past a receiver only while that receiver is present', async () => {
            const item = document.createElement('i');

            watch('{ level: (@item.parent as "element")?.level }', { item }, { acceptPartialObservation: true });
            await settle();

            expect(snapshots).toEqual([{ level: null }]);
            expect(gauges.size).toBe(0);

            panel.append(item);
            await settle();
            gauges.get(panel).sample = { pending: false, value: 5 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 5 });

            item.remove();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: null });
            expect(gauges.get(panel).stopped).toBe(1);
        });
    });

    describe('a disjunction', () => {
        it('holds what its right operand reads only while it evaluates that operand', async () => {
            const item = panel.querySelector('i');

            watch('{ v: (@item attributeOf "data-on") is null or @item.level is null }', { item });
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: true });
            expect(gauges.has(item)).toBe(false);

            item.setAttribute('data-on', '');
            await settle();
            gauges.get(item).sample = { pending: false, value: 4 };
            gauges.get(item).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: false });

            item.removeAttribute('data-on');
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: true });
            expect(gauges.get(item).stopped).toBe(1);
        });
    });

    describe('an access by name', () => {
        it('follows what its name reads and the property it selects, holding the one it no longer selects no longer', async () => {
            const item = panel.querySelector('i');

            watch('{ v: @item[if @item attributeOf "data-on" is null then "level" else "tally"] }', { item });
            await settle();
            gauges.get(item).sample = { pending: false, value: 4 };
            gauges.get(item).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: 4 });

            item.setAttribute('data-on', '');
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: evaluations });
            expect(gauges.get(item).stopped).toBe(1);
        });
    });

    describe('a coalescing operator', () => {
        it('holds what its fallback reads only while its value is null', async () => {
            const item = panel.querySelector('i');

            watch('{ level: @item.level ?? @panel.level }', { item, panel });
            await settle();
            gauges.get(item).sample = { pending: false, value: null };
            gauges.get(item).notify();
            await settle();
            gauges.get(panel).sample = { pending: false, value: 2 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 2 });

            gauges.get(item).sample = { pending: false, value: 5 };
            gauges.get(item).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 5 });
            expect(gauges.get(panel).stopped).toBe(1);
        });
    });

    describe('the root of a node', () => {
        it('follows a detached node into the document, and the document as its own root', async () => {
            const detached = document.createElement('section');

            watch('{ own: @document.root.children.count, detached: @detached.root.children.count }', { detached }, { acceptPartialObservation: true });
            await settle();

            expect(snapshots.at(-1)).toEqual({ own: 1, detached: 0 });

            document.body.append(detached);
            await settle();

            expect(snapshots.at(-1)).toEqual({ own: 1, detached: 1 });
            expect(failures).toEqual([]);
        });
    });

    describe('an evaluation that fails', () => {
        it('is reported, keeps the watch running and its last snapshot, and its recovery reports the snapshot whether or not it differs', async () => {
            const watched = watch('{ n: @panel.flaky }', { panel });

            await settle();
            broken = true;
            await change(panel, 2);

            expect(watched.status).toBe('failed');
            expect(failures.length).toBe(1);
            expect(failures[0].name).toBe('DomqlError');
            expect(failures[0].message).toContain("The member 'flaky' failed");
            expect(watched.snapshot).toEqual({ n: 1 });

            broken = false;
            await change(panel, 1);

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual([{ n: 1 }, { n: 1 }]);
        });

        it('keeps the dependencies of its last success together with those the failure recorded', async () => {
            const watched = watch('{ n: @panel.flaky }', { panel });

            await settle();
            broken = true;
            await change(panel, 2);
            await change(panel, 3);
            await change(panel, 4);

            expect(watched.status).toBe('failed');
            expect(failures.length).toBe(3);

            broken = false;
            await change(panel, 5);

            expect(snapshots.at(-1)).toEqual({ n: 5 });
        });
    });

    describe('the sessions of its evaluations', () => {
        /** Registers a member observed through a probe of its element, which fails for an element marked bad, and answers what the probes show: the elements observed, how often one started and stopped, and how to report a change of one. */
        const registerProbe = () => {
            const probes = { live: new Set(), started: 0, stopped: 0, notify: new Map(), calls: 0, during: null };

            isolated.registerModule(isolated.createModule('probe', {
                observationTypes: [{ name: 'probe', contract: 'invalidation', function: 'observeProbe' }],
                members: [{ name: 'probe', function: 'probe', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'observable', reads: 'fresh', observations: [{ type: 'probe', of: 'receiver' }] }],
            }, {
                observeProbe: ({ target }, notify) => {
                    probes.started++;
                    probes.live.add(target);
                    probes.notify.set(target, notify);

                    return {
                        stop: () => {
                            probes.stopped++;
                            probes.live.delete(target);
                        },
                    };
                },
                probe: element => {
                    probes.calls++;

                    const during = probes.during;

                    probes.during = null;
                    during?.();

                    if (element.hasAttribute('data-bad')) {
                        throw new Error('bad');
                    }

                    return Number(element.getAttribute('data-n'));
                },
            }));

            return probes;
        };

        it('pass from evaluation to evaluation through failures, keep reporting, and are all let go when the watch is disposed', async () => {
            const probes = registerProbe();
            const watched = watch('@panel.children { p: self.probe }', { panel });
            const [first, second] = [...panel.children];

            await watched.refreshAsync();

            expect([...probes.live]).toEqual([first, second]);

            // A failure that takes over the probes of the first two items and acquires one for the third.
            const third = document.createElement('i');

            third.setAttribute('data-bad', '');
            panel.append(third);
            await rejection(watched.refreshAsync());
            await settle();

            expect(watched.status).toBe('failed');
            expect([probes.started, probes.stopped]).toEqual([3, 0]);

            // A second failure, which no longer reads the first item.
            first.remove();
            await rejection(watched.refreshAsync());
            await settle();

            expect([...probes.live]).toEqual([second, third]);
            expect([probes.started, probes.stopped]).toEqual([3, 1]);

            // The recovery takes over what the failures held.
            third.removeAttribute('data-bad');
            third.setAttribute('data-n', '3');
            await watched.refreshAsync();

            expect(watched.status).toBe('ready');
            expect(snapshots.at(-1)).toEqual([{ p: 2 }, { p: 3 }]);
            expect([probes.started, probes.stopped]).toEqual([3, 1]);

            // A probe the recovery took over still reports to the watch.
            second.setAttribute('data-n', '7');
            probes.notify.get(second)();
            await settle();

            expect(snapshots.at(-1)).toEqual([{ p: 7 }, { p: 3 }]);

            watched.dispose();

            expect(probes.live.size).toBe(0);
            expect(probes.stopped).toBe(probes.started);
        });

        it('ask for another evaluation when one of them reports a change during an evaluation', async () => {
            const probes = registerProbe();
            const watched = watch('{ p: @panel.probe }', { panel });

            await watched.refreshAsync();

            const calls = probes.calls;

            probes.during = () => probes.notify.get(panel)();
            await watched.refreshAsync();
            await settle();

            expect(probes.calls - calls).toBe(2);
        });
    });

    describe('a handler that fails', () => {
        it('is raised as an error event and leaves the watch running with the state it was handed accepted', async () => {
            let fails = true;
            const watched = watch('@panel attributeOf "data-n"', { panel }, {
                onChange: snapshot => {
                    snapshots.push(snapshot);

                    if (fails) {
                        throw new Error('consumer');
                    }
                },
            });

            await settle();

            expect(failures.map(error => error.message)).toEqual(['consumer']);
            expect(watched.status).toBe('ready');

            fails = false;
            await change(panel, 2);

            expect(snapshots).toEqual(['1', '2']);
        });

        it('is reported when it rejects, and is not waited for', async () => {
            const watched = watch('@panel attributeOf "data-n"', { panel }, { onChange: () => Promise.reject(new Error('later')) });

            await settle();

            expect(failures.map(error => error.message)).toEqual(['later']);
            expect(watched.status).toBe('ready');
        });

        it('goes to the diagnostic reporting where no error listener receives it', async () => {
            watch('@panel attributeOf "data-n"', { panel }, { onChange: () => { throw new Error('consumer'); }, onError: null });
            await settle();

            expect(reported.map(error => error.message)).toEqual(['consumer']);
        });

        it('sends the failure of the error handler to the diagnostic reporting, calling nothing again', async () => {
            watch('@panel attributeOf "data-n"', { panel }, {
                onChange: () => { throw new Error('consumer'); },
                onError: error => {
                    failures.push(error);

                    return Promise.reject(new Error('error handler'));
                },
            });
            await settle();

            expect(failures.length).toBe(1);
            expect(reported.map(error => error.message)).toEqual(['error handler']);
        });

        it('lets the handlers of other watches run when one fails', async () => {
            const others = [];

            watch('@panel attributeOf "data-n"', { panel }, { onChange: () => { throw new Error('first'); } });
            watch('@panel attributeOf "data-n"', { panel }, { onChange: snapshot => others.push(snapshot) });
            await settle();
            await change(panel, 2);

            expect(others).toEqual(['1', '2']);
        });

        it('leaves the watch reporting where its error handler and the window\'s error reporting fail too', async () => {
            let reportings = 0;

            window.reportError = () => {
                reportings++;
                throw new Error('reporting');
            };

            const watched = watch('@panel attributeOf "data-n"', { panel }, {
                onChange: snapshot => {
                    snapshots.push(snapshot);
                    throw new Error('consumer');
                },
                onError: () => { throw new Error('error handler'); },
            });

            await settle();
            await change(panel, 2);

            expect(snapshots).toEqual(['1', '2']);
            expect(reportings).toBe(2);
            expect(watched.status).toBe('ready');
        });
    });

    describe('other watches of the same observations', () => {
        it('go on when one is disposed', async () => {
            const first = [];
            const second = [];
            const disposed = watch('@panel attributeOf "data-n"', { panel }, { onChange: snapshot => first.push(snapshot) });

            watch('@panel attributeOf "data-n"', { panel }, { onChange: snapshot => second.push(snapshot) });
            await settle();
            disposed.dispose();
            await change(panel, 2);

            expect(first).toEqual(['1']);
            expect(second).toEqual(['1', '2']);
        });

        it('go on when one fails to evaluate, which recovers on its own', async () => {
            const failing = [];
            const other = [];
            const failed = watch('@panel.flaky', { panel }, { onChange: snapshot => failing.push(snapshot) });

            watch('@panel attributeOf "data-n"', { panel }, { onChange: snapshot => other.push(snapshot) });
            await settle();

            broken = true;
            await change(panel, 2);

            expect(failed.status).toBe('failed');
            expect(other).toEqual(['1', '2']);

            broken = false;
            await change(panel, 3);

            expect(failed.status).toBe('ready');
            expect(failing).toEqual([1, 3]);
            expect(other).toEqual(['1', '2', '3']);
        });

        it('keep the observations both read running where a watch of other bindings is ready before the first is disposed', async () => {
            const started = [];
            const stopped = [];

            isolated.registerModule(isolated.createModule('reach', {
                observationTypes: [{ name: 'reach', contract: 'invalidation', function: 'observeReach' }],
                members: [{ name: 'reach', function: 'reach', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'observable', reads: 'fresh', observations: [{ type: 'reach', of: 'receiver' }] }],
            }, {
                observeReach: ({ target }) => {
                    started.push(target.id);

                    return { stop: () => stopped.push(target.id) };
                },
                reach: () => 1,
            }));
            document.body.innerHTML = '<i id="a"></i><i id="b"></i><i id="c"></i>';

            const [a, b, c] = ['a', 'b', 'c'].map(id => document.getElementById(id));
            const query = isolated.query('{ x: @x.reach, y: @y.reach }', { x: a, y: b });
            const replaced = query.watch({ schedule: 'immediate' });

            watches.push(replaced);
            await replaced.readyAsync();

            expect(started).toEqual(['a', 'b']);

            const replacement = query.with({ x: b, y: c }).watch({ schedule: 'immediate' });

            watches.push(replacement);
            await replacement.readyAsync();
            replaced.dispose();

            expect(started).toEqual(['a', 'b', 'c']);
            expect(stopped).toEqual(['a']);
        });
    });

    describe('refreshAsync', () => {
        it('evaluates now and settles once the snapshot has been handed to the handlers', async () => {
            const watched = watch('@panel.tally', { panel }, { schedule: 'frame' });

            await settle();
            await watched.refreshAsync();

            expect(snapshots).toEqual([1, 2]);
        });

        it('evaluates once when it comes before the first evaluation, which it snapshots', async () => {
            const watched = watch('@panel.tally', { panel });
            const refreshing = watched.refreshAsync();

            await refreshing;
            await settle();

            expect(snapshots).toEqual([1]);
            expect(evaluations).toBe(1);
        });

        it('settles without delivering where the snapshot did not change', async () => {
            const watched = watch('@panel attributeOf "data-n"', { panel });

            await settle();
            await watched.refreshAsync();

            expect(snapshots).toEqual(['1']);
        });

        it('does not wait for a promise a handler returns, so a handler can await a refresh', async () => {
            let nested;
            const watched = watch('@panel.tally', { panel }, {
                onChange: async snapshot => {
                    snapshots.push(snapshot);

                    if (snapshot === 1) {
                        nested = watched.refreshAsync();
                        await nested;
                    }
                },
            });

            await settle();
            await nested;

            expect(snapshots).toEqual([1, 2]);
        });

        it('rejects with the failure of its evaluation, which is reported as well', async () => {
            const watched = watch('{ n: @panel.flaky }', { panel });

            await settle();
            broken = true;

            const error = await rejection(watched.refreshAsync());

            expect(error.message).toContain("The member 'flaky' failed");
            expect(failures).toEqual([error]);
        });

        it('settles without delivering where disposal cancels it', async () => {
            const [first] = panel.children;
            const watched = watch('{ n: @item.level }', { item: first });

            await settle();

            const refreshing = watched.refreshAsync();

            watched.dispose();

            await expect(refreshing).resolves.toBeUndefined();
            expect(snapshots).toEqual([]);
        });

        it('rejects when called after disposal', async () => {
            const watched = watch('@panel attributeOf "data-n"', { panel });

            watched.dispose();

            expect((await rejection(watched.refreshAsync())).message).toContain('disposed');
        });
    });

    describe('dispose', () => {
        it('ends the watch: it reports nothing more and lets go of every observation', async () => {
            const [first] = panel.children;
            const watched = watch('{ n: @item.level, id: @panel attributeOf "data-n" }', { item: first, panel });

            await settle();
            gauges.get(first).sample = { pending: false, value: 1 };
            gauges.get(first).notify();
            await settle();

            watched.dispose();

            expect(watched.status).toBe('disposed');
            expect(gauges.get(first).stopped).toBe(1);

            await change(panel, 9);
            gauges.get(first).notify();
            await settle();

            expect(snapshots).toEqual([{ n: 1, id: '1' }]);
        });

        it('cancels the evaluation it scheduled', async () => {
            const frames = holdFrames();
            const watched = watch('@panel.tally', { panel }, { schedule: 'frame' });

            await settle();
            panel.setAttribute('data-n', '2');
            await settle();
            watched.dispose();

            expect(frames.canceled).toEqual([1]);

            frames.callbacks[0]();

            expect(snapshots).toEqual([1]);
        });

        it('prevents the first snapshot when it comes before it', async () => {
            const watched = watch('@panel attributeOf "data-n"', { panel });

            watched.dispose();
            await settle();

            expect(snapshots).toEqual([]);
        });

        it('does nothing when it is repeated', async () => {
            const watched = watch('@panel attributeOf "data-n"', { panel });

            await settle();
            watched.dispose();
            watched.dispose();

            expect(watched.status).toBe('disposed');
        });

        it('lets a handler already running finish, and starts none after', async () => {
            let finished = false;
            const watched = watch('@panel attributeOf "data-n"', { panel }, {
                onChange: async snapshot => {
                    snapshots.push(snapshot);
                    watched.dispose();
                    await settle();
                    finished = true;
                },
            });

            await settle(5);
            await change(panel, 3);

            expect(finished).toBe(true);
            expect(snapshots).toEqual(['1']);
        });
    });

    describe('keeping live state', () => {
        /** A watch that keeps its result as live state, recording each object and change set its ready change events carry, and what the object held at that moment. */
        const watchLive = (text, bindings) => {
            const calls = [];
            const watched = watch(text, bindings, {
                updateStrategy: 'liveState',
                onChange: (state, changes) => calls.push({ state, changes, seen: JSON.parse(JSON.stringify(state)) }),
            });

            return { watched, calls };
        };

        it('hands its change handler one object, kept current in place, with the change set just applied to it', async () => {
            const { watched, calls } = watchLive('@panel { n: self attributeOf "data-n", rows: self.children { n: self attributeOf "data-n" } }', { panel });

            await settle();
            await change(panel.children[1], 7);

            expect(calls).toHaveLength(2);
            expect(calls[0].changes).toEqual([]);
            expect(calls[1].state).toBe(calls[0].state);
            expect(calls[1].changes).toEqual([{ op: 'replace', path: '/rows/1/n', value: '7' }]);
            expect(calls[1].seen).toEqual({ n: '1', rows: [{ n: '1' }, { n: '7' }] });
            expect(watched.liveState).toBe(calls[0].state);
            expect(watched.snapshot).toEqual(calls[1].seen);
            expect(Object.isFrozen(watched.snapshot)).toBe(true);
        });

        it('keeps the object of each item as its element moves, and adds and removes items in place', async () => {
            const [first, second] = panel.children;
            const { watched } = watchLive('{ rows: @panel.children { n: self attributeOf "data-n" } }', { panel });

            await settle();

            const { rows } = watched.liveState;
            const [rowOfFirst, rowOfSecond] = rows;
            const added = document.createElement('i');

            added.setAttribute('data-n', '3');
            panel.insertBefore(second, first);
            panel.append(added);
            await settle();

            expect(watched.liveState.rows).toBe(rows);
            expect(rows).toEqual([{ n: '2' }, { n: '1' }, { n: '3' }]);
            expect(rows[0]).toBe(rowOfSecond);
            expect(rows[1]).toBe(rowOfFirst);

            first.remove();
            await settle();

            expect(rows).toEqual([{ n: '2' }, { n: '3' }]);
            expect(rows[0]).toBe(rowOfSecond);
        });

        it('puts each element\'s object back in its place after a reorder that changed no data, once a change follows', async () => {
            const [first, second] = panel.children;

            first.setAttribute('data-n', '0');
            second.setAttribute('data-n', '0');

            const { watched } = watchLive('{ rows: @panel.children { n: self attributeOf "data-n" } }', { panel });

            await settle();

            const { rows } = watched.liveState;
            const rowOfSecond = rows[1];

            // The elements swap, which leaves the result as it was, and then the second one changes.
            panel.insertBefore(second, first);
            await settle();
            second.setAttribute('data-n', '5');
            await settle();

            expect(rows).toEqual([{ n: '5' }, { n: '0' }]);
            expect(rows[0]).toBe(rowOfSecond);
        });

        it('leaves the object as it was through a failed evaluation, and brings it up to date in one change set on recovery', async () => {
            const { watched, calls } = watchLive('{ n: @panel.flaky, m: @panel attributeOf "data-n" }', { panel });

            await settle();
            broken = true;
            await change(panel, 4);

            expect(watched.status).toBe('failed');
            expect(watched.liveState).toEqual({ n: 1, m: '1' });
            expect(failures.length).toBeGreaterThan(0);

            broken = false;
            await change(panel, 5);

            expect(watched.liveState).toEqual({ n: 5, m: '5' });
            expect(calls.at(-1).changes).toEqual([{ op: 'replace', path: '/n', value: 5 }, { op: 'replace', path: '/m', value: '5' }]);
        });

        it('hands its change handler an empty change set when an evaluation recovers from a failure with the result it had', async () => {
            const { calls } = watchLive('{ n: @panel.flaky }', { panel });

            await settle();
            broken = true;
            await change(panel, 1);
            broken = false;
            await change(panel, 1);

            expect(calls).toHaveLength(2);
            expect(calls.at(-1).changes).toEqual([]);
        });

        it('stops changing the object once disposed, and the caller keeps it as it last was', async () => {
            const { watched } = watchLive('{ n: @panel attributeOf "data-n" }', { panel });

            await settle();

            const state = watched.liveState;

            watched.dispose();
            await change(panel, 9);

            expect(state).toEqual({ n: '1' });
        });

        it('is refused for a result that is no object or list, or that can be null', () => {
            expect(() => watch('@panel attributeOf "data-n"', { panel }, { updateStrategy: 'liveState' })).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining('Live state keeps one object current') }));
            expect(() => watch('@item { n: self attributeOf "data-n" }', { item: null }, { updateStrategy: 'liveState' })).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringContaining('put it in a top-level object expression') }));
        });

        it('is held only by a watch that keeps live state', async () => {
            const watched = watch('{ n: @panel attributeOf "data-n" }', { panel });

            await settle();

            expect(watched.liveState).toBeUndefined();
        });
    });

    describe('a query that is watched', () => {
        it('is refused when a member only partly observes its changes, unless the watch accepts that', () => {
            const query = isolated.query('@panel.rect', { panel });
            const error = (() => {
                try {
                    query.watch();
                } catch (failure) {
                    return failure;
                }

                throw new Error('The watch was created');
            })();

            expect(error.name).toBe('DomqlError');
            expect(error.kind).toBe('validation');
            expect(error.message).toContain('rect');

            watches.push(query.watch({ acceptPartialObservation: true }));
        });

        it('takes a schedule and an update strategy that exist', () => {
            const query = isolated.query('@panel attributeOf "id"', { panel });

            for (const options of [{ schedule: 'later' }, { updateStrategy: 'patch' }]) {
                expect(() => query.watch(options)).toThrow(expect.objectContaining({ name: 'DomqlError', kind: 'structure' }));
            }
        });

        it('takes listeners of its change and error events alone, each with the function that handles them', () => {
            const watched = watch('@panel attributeOf "id"', { panel });

            for (const [eventName, handler] of [['change', 3], ['error', 3], ['changed', () => {}]]) {
                expect(() => watched.subscribe(eventName, handler)).toThrow(expect.objectContaining({ name: 'DomqlError', kind: 'structure' }));
            }
        });

        it('is a query: a request that is not one is refused when the watch is made', () => {
            const subscription = isolated.query('(@panel on "click") { ratio: @window.devicePixelRatio }', { panel });

            expect(subscription.resolve({ watch: true }).kind).toBe('subscription');
            expect(() => subscription.watch()).toThrow(expect.objectContaining({ name: 'DomqlError', kind: 'validation', message: expect.stringContaining('it listens to events.\nUse subscribe()') }));
        });

        it('is scheduled by animation frame only in a window that has them', () => {
            const query = isolated.query('@panel attributeOf "id"', { panel });
            const frameless = { document, reportError: () => {} };

            expect(() => query.watch({ window: frameless })).toThrow(expect.objectContaining({ kind: 'structure' }));
            watches.push(query.watch({ window: frameless, schedule: 'immediate' }));
        });

        it('needs a browser window', () => {
            expect(() => isolated.query('@window.devicePixelRatio').watch({ window: null })).toThrow(expect.objectContaining({ kind: 'evaluation' }));
        });
    });
});

describe('Watch cleanup', () => {
    /** A session that counts its disposals, and fails them where it is told to. */
    const session = failure => {
        const held = { disposed: 0 };

        held.dispose = () => {
            held.disposed++;

            if (failure !== undefined) {
                throw failure;
            }
        };

        return held;
    };

    it('lets go of every evaluation it holds where letting go of one fails, and reports the failure', async () => {
        const evaluations = [];
        const reported = [];
        const snapshots = [];
        const evaluator = {
            evaluate: () => {
                const sessions = [session(new Error(`stuck ${evaluations.length + 1}`)), session()];

                evaluations.push(sessions);

                const owner = {};

                return new QueryEvaluation({ value: evaluations.length, isPending: false, dependencies: [], sessions: sessions.map(held => ({ session: held, owner })), owner, error: null });
            },
        };
        const watch = new Watch({
            evaluator,
            observations: null,
            comparer: { reconcile: (_last, _identities, next) => next },
            window,
            reportError: error => reported.push(error),
            checkPath: () => {},
            options: { schedule: 'immediate' },
        });

        watch.subscribe('change', (_sender, args) => snapshots.push(args.value));
        await watch.refreshAsync();
        await watch.refreshAsync();
        watch.dispose();

        expect(snapshots).toEqual([1, 2]);
        expect(evaluations.flat().map(held => held.disposed)).toEqual([1, 1, 1, 1]);
        expect(reported.map(error => error.message)).toEqual(['stuck 1', 'stuck 2']);
        expect(watch.status).toBe('disposed');
    });
});
