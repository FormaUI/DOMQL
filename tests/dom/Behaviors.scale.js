import { describe, it } from 'vitest';
import { domql, NexoError } from '#domql/domql.js';
import {
    allocatedDuring,
    formatLoad,
    formatSummary,
    ManualFrames,
    memoryNoise,
    metricOf,
    nextTask,
    printProfile,
    printTable,
    runRounds,
    summaryOf,
    timeProfileDuring,
    usedMemory,
} from '../_scale/Measuring.js';

/**
 * Behaviors at the rates and the numbers of owners a page reaches, in Chromium: a behavior delivering pointer moves to none, one or several subscriptions, a throttled one and a slow one among them, and many owners
 * running one behavior, whose watches each read the state their own instance offers.
 */

const hostCall = (name, overrides) => ({ name, kind: 'function', invokedBy: 'host', ...overrides });

/** The instance of `track` started most recently, which a case hands its moves to. */
let tracking = null;

/** The instance of `selection` started most recently, and how many times a watch has read the state an instance offers. */
let selecting = null;
let selectedReads = 0;

domql.registerModule(domql.createModule('Pointing', {
    types: [
        {
            name: 'PointerMove', kind: 'structured',
            members: ['x', 'y', 'pressure'].map(name => ({ name, kind: 'property', result: 'Number' })),
        },
        {
            name: 'PointingElements', kind: 'extension', target: 'Domql.Element',
            members: [
                // A pointer's tracker, delivering each move it is handed, as a behavior's own pointermove listener would.
                hostCall('track', {
                    requestKind: 'execution', executionMode: 'continuous',
                    impl: ({ deliver }) => (tracking = { move: (x, y) => deliver('moves', { x, y, pressure: 0.5 }), update: () => {}, dispose: () => {} }),
                }),
                hostCall('moves', { requestKind: 'subscription', behavior: 'track', result: 'PointerMove' }),
                // A selection an owner keeps, offering the index it selects, and saying it may have changed as it is set.
                hostCall('selection', {
                    requestKind: 'execution', executionMode: 'continuous',
                    impl: ({ notify }) => {
                        const instance = {
                            index: 0,
                            select: index => {
                                instance.index = index;
                                notify();
                            },
                            update: () => {},
                            dispose: () => {},
                        };

                        selecting = instance;

                        return instance;
                    },
                }),
                {
                    name: 'selected', kind: 'property', result: 'Number?', behavior: 'selection',
                    updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'behavior', of: 'receiver', behavior: 'selection' }] },
                    impl: ({ instance }) => {
                        selectedReads++;

                        return instance?.index ?? null;
                    },
                },
            ],
        },
    ],
}));

const TRACK = 'import Pointing\nzone:track()';
const MOVES = 'import Pointing\nzone:moves() { x = it.x, y = it.y }';
const MOVES_AS_THEY_ARE = 'import Pointing\nzone:moves()';

/** A slow handler's work, which ends once the case lets it: one promise its every call answers, so the handler itself costs nothing beside what DOMQL does with what it answers. */
let gate = null;
const openGate = () => {
    let resolve;

    gate = { promise: new Promise(settle => (resolve = settle)), resolve: () => resolve() };
};

const sync = () => {};
const slow = () => gate.promise;

/** The subscriptions of each case, each a text and its options: a handler, and a throttle where it has one. */
const DELIVERY_CASES = [
    { name: 'no subscription', subscriptions: [] },
    { name: 'one, projected', subscriptions: [{ text: MOVES, handler: sync }] },
    { name: 'one, the move as it is', subscriptions: [{ text: MOVES_AS_THEY_ARE, handler: sync }] },
    { name: 'four, projected', subscriptions: Array.from({ length: 4 }, () => ({ text: MOVES, handler: sync })) },
    { name: 'one throttled to 16 ms', subscriptions: [{ text: MOVES, handler: sync, throttle: 16 }] },
    { name: 'one slow async handler', subscriptions: [{ text: MOVES, handler: slow }] },
    { name: 'four: two, throttled, slow', subscriptions: [{ text: MOVES, handler: sync }, { text: MOVES, handler: sync }, { text: MOVES, handler: sync, throttle: 16 }, { text: MOVES, handler: slow }] },
];

/** A case running: its zone, its tracker, its subscriptions, and what ends them. */
const startCase = ({ subscriptions }) => {
    const zone = document.body.appendChild(document.createElement('div'));
    const listeners = subscriptions.map(({ text, handler, throttle }) => domql.query(text, { zone }).subscribe(handler, throttle === undefined ? {} : { throttle }));
    const handle = domql.query(TRACK, { zone }).run();
    const tracker = tracking;

    return {
        move: index => tracker.move(index * 0.5, index * 0.25),
        end: () => {
            handle.dispose();
            listeners.forEach(listener => listener.dispose());
            zone.remove();
        },
    };
};

/** Waits for a throttle's interval to end, so the next run starts with none. */
const afterIntervals = () => new Promise(resolve => setTimeout(resolve, 40));

const BATCH = 4000;

describe('A behavior delivering pointer moves', () => {
    it('times each delivery, its allocation, and the acknowledgments outstanding at a pointer\'s rate', async () => {
        const running = new Map(DELIVERY_CASES.map(entry => [entry.name, startCase(entry)]));

        // Time: a batch of moves, each delivered as one task's work, until the acknowledgments of those a handler applied at once have settled; a slow handler's work ends after the batch, within the time.
        const timed = await runRounds(DELIVERY_CASES.map(({ name }) => ({
            name,
            measure: async () => {
                const { move } = running.get(name);

                openGate();
                window.gc();
                await nextTask();

                const start = performance.now();

                for (let index = 0; index < BATCH; index++) {
                    move(index);
                }

                gate.resolve();
                await nextTask();

                const microseconds = ((performance.now() - start) * 1000) / BATCH;

                await afterIntervals();

                return microseconds;
            },
        })), { rounds: 7 });

        // Allocation: a batch sampled by the heap profiler, less an empty batch's.
        const empty = await allocatedDuring(async () => {
            await nextTask();
        });
        const allocated = new Map();

        for (const { name } of DELIVERY_CASES) {
            const { move } = running.get(name);
            const samples = [];

            for (let round = 0; round < 5; round++) {
                openGate();

                const bytes = await allocatedDuring(async () => {
                    for (let index = 0; index < BATCH; index++) {
                        move(index);
                    }

                    gate.resolve();
                    await nextTask();
                });

                samples.push((bytes - empty) / BATCH);
                await afterIntervals();
            }

            allocated.set(name, summaryOf(samples));
        }

        // Where a move's time goes, by function, for the cases a single subscription or none hears: a batch of moves is all that runs, so every sample counts, the collector's among them.
        const profiles = [];

        for (const name of ['no subscription', 'one, projected', 'one throttled to 16 ms']) {
            const { move } = running.get(name);

            profiles.push({
                name,
                entries: await timeProfileDuring(async () => {
                    for (let index = 0; index < 5 * BATCH; index++) {
                        move(index);
                    }

                    await nextTask();
                }, 14),
            });
            await afterIntervals();
        }

        // Outstanding acknowledgments at a fast pointer's rate: eight moves a tick, a tick each 8 ms, about 1,000 moves a second for a second, a slow handler taking 50 ms each; counted once each tick's
        // microtasks have run, so an acknowledgment counts only while a handler is still applying its move.
        const paced = new Map();

        for (const entry of DELIVERY_CASES) {
            const before = await usedMemory();
            const { move, end } = startCase({ subscriptions: entry.subscriptions.map(subscription => (subscription.handler === slow ? { ...subscription, handler: () => new Promise(resolve => setTimeout(resolve, 50)) } : subscription)) });
            let outstanding = 0;
            let peak = 0;
            let fulfilled = 0;
            let rejected = 0;
            const codes = new Map();
            const samples = [];

            for (let tick = 0; tick < 125; tick++) {
                for (let index = 0; index < 8; index++) {
                    outstanding++;
                    move(tick * 8 + index).then(() => {
                        outstanding--;
                        fulfilled++;
                    }, error => {
                        outstanding--;
                        rejected++;
                        codes.set(error.code, (codes.get(error.code) ?? 0) + 1);
                    });
                }

                await nextTask();
                peak = Math.max(peak, outstanding);
                samples.push(outstanding);
                await new Promise(resolve => setTimeout(resolve, 8));
            }

            await new Promise(resolve => setTimeout(resolve, 200));
            end();

            const after = await usedMemory();

            paced.set(entry.name, { peak, median: summaryOf(samples).median, fulfilled, rejected, codes: [...codes].map(([code, count]) => `${code}×${count}`).join(' ') || '-', remaining: outstanding, retained: after - before });
        }

        // Bytes an acknowledgment holds while its handler applies the move: a batch left waiting on a slow handler, read before and after it settles.
        const waiting = startCase({ subscriptions: [{ text: MOVES, handler: slow }] });

        openGate();

        const settled = await usedMemory();

        for (let index = 0; index < BATCH; index++) {
            waiting.move(index);
        }

        const held = await usedMemory();

        gate.resolve();
        await nextTask();

        const released = await usedMemory();

        waiting.end();
        running.forEach(({ end }) => end());

        printTable(`A behavior delivering pointer moves: ${BATCH} moves a batch, ${timed.values().next().value.values.length} rounds, median (least–greatest); bytes from the heap profiler, 5 batches`, [
            'Subscriptions',
            'µs a move',
            'bytes a move',
            'load',
        ], DELIVERY_CASES.map(({ name }) => {
            const entry = timed.get(name);

            return [name, formatSummary(summaryOf(metricOf(entry)), 2), formatSummary(allocated.get(name), 0), formatLoad(entry.load)];
        }));

        const noise = await memoryNoise();

        printTable(`Acknowledgments outstanding at about 1,000 moves a second for a second, a slow handler taking 50 ms; memory retained once each ended, its readings ${(noise / 1024).toFixed(1)} KB apart with nothing between`, [
            'Subscriptions',
            'peak',
            'median',
            'fulfilled',
            'rejected',
            'by code',
            'left',
            'retained KB',
        ], DELIVERY_CASES.map(({ name }) => {
            const { peak, median, fulfilled, rejected, codes, remaining, retained } = paced.get(name);

            return [name, peak, median, fulfilled, rejected, codes, remaining, (retained / 1024).toFixed(1)];
        }));

        console.log(`\nAn acknowledgment waiting on a slow handler holds ${((held - settled) / BATCH).toFixed(0)} bytes; once settled, ${((released - settled) / 1024).toFixed(1)} KB of ${((held - settled) / 1024).toFixed(1)} KB remain`);

        for (const { name, entries } of profiles) {
            printProfile(`Where a move's time goes, ${name}: each function's own time, µs a move, ${5 * BATCH} moves, and its share of every sample`, entries, { unit: 'µs a move', scale: 1 / (5 * BATCH), digits: 3 });
        }
    }, 600000);

    it('times the parts of an acknowledgment: joining one subscription\'s, and the error a delivery rejects with', async () => {
        // A subscription that applied its move as its handler returned answers one shared, fulfilled promise; joining a list of one copies the list, maps it, and waits for both through `Promise.all`.
        const applied = Promise.resolve();
        const receivers = [() => applied];
        const location = { pointer: '/expression', line: 2, column: 1 };
        const ways = {
            'joined, as delivering does': value => Promise.all([...receivers].map(receive => receive(value))).then(() => undefined),
            'the one acknowledgment as it is': value => receivers[0](value),
            // What a delivery no subscription hears, and a move a throttle drops, each reject with: an evaluation error made for each, whose stack Nexo writes as it is made.
            'a rejection with an evaluation error of its own': () => {
                const rejected = Promise.reject(NexoError.evaluation('DOMQL5017', 'No subscription of \'moves\' listens for this owner on this receiver, so no subscriber applied the occurrence \'track\' delivered', location));

                rejected.catch(() => {});

                return rejected;
            },
        };
        const COUNT = 100000;
        const cases = Object.entries(ways).map(([name, deliver]) => ({
            name,
            deliver,
            measure: async () => {
                window.gc();
                await nextTask();

                const start = performance.now();

                for (let index = 0; index < COUNT; index++) {
                    deliver(index);
                }

                await nextTask();

                return ((performance.now() - start) * 1e6) / COUNT;
            },
        }));
        const timed = await runRounds(cases, { rounds: 7 });
        const rows = [];

        for (const { name, deliver } of cases) {
            const bytes = await allocatedDuring(async () => {
                for (let index = 0; index < COUNT; index++) {
                    deliver(index);
                }

                await nextTask();
            });

            rows.push([name, formatSummary(summaryOf(metricOf(timed.get(name))), 0), (bytes / COUNT).toFixed(0), formatLoad(timed.get(name).load)]);
        }

        printTable(`The parts of an acknowledgment: ${COUNT} a round, 7 rounds, median (least–greatest)`, ['Way', 'ns each', 'bytes each', 'load'], rows);
    }, 600000);
});

describe('Many owners running one behavior', () => {
    const READ = 'import Pointing\ntarget:selected';
    const RUN = 'import Pointing\ntarget:selection()';
    const CHANGES = 20;

    it('counts the evaluations one owner\'s change causes in the watches of the others, and times them', async () => {
        const frames = new ManualFrames(window);
        const rows = [];

        frames.install();

        try {
            for (const owners of [10, 100, 1000]) {
                for (const arrangement of ['one receiver', 'a receiver each']) {
                    const container = document.body.appendChild(document.createElement('div'));
                    const targets = Array.from({ length: arrangement === 'one receiver' ? 1 : owners }, () => container.appendChild(document.createElement('div')));
                    const handles = [];
                    const instances = [];
                    const watches = [];
                    let changes = 0;

                    for (let index = 0; index < owners; index++) {
                        const target = targets[index % targets.length];
                        const owner = `owner ${index}`;

                        handles.push(domql.query(RUN, { target }).run({ owner }));
                        instances.push(selecting);

                        const watch = domql.query(READ, { target }).watch({ owner });

                        watch.subscribe('change', () => changes++);
                        watches.push(watch);
                    }

                    await Promise.all(watches.map(watch => watch.readyAsync()));
                    frames.run();

                    let next = 0;
                    const results = await runRounds([{
                        name: 'change',
                        measure: async () => {
                            let notifying = 0;
                            let evaluating = 0;
                            let reads = 0;
                            let reported = 0;

                            for (let index = 0; index < CHANGES; index++) {
                                const instance = instances[(next * 7) % owners];

                                await nextTask();
                                selectedReads = 0;
                                changes = 0;

                                const start = performance.now();

                                instance.select(++next);

                                const notified = performance.now();

                                frames.run();

                                const evaluated = performance.now();

                                notifying += notified - start;
                                evaluating += evaluated - notified;
                                reads += selectedReads;
                                reported += changes;
                            }

                            return { notifyMicroseconds: (notifying * 1000) / CHANGES, frameMilliseconds: evaluating / CHANGES, evaluations: reads / CHANGES, changes: reported / CHANGES };
                        },
                    }]);
                    const entry = results.get('change');
                    const evaluations = summaryOf(metricOf(entry, 'evaluations'));
                    const frame = summaryOf(metricOf(entry, 'frameMilliseconds'));

                    rows.push([
                        `${owners} owners, ${arrangement}`,
                        evaluations.median.toFixed(0),
                        (evaluations.median - summaryOf(metricOf(entry, 'changes')).median).toFixed(0),
                        summaryOf(metricOf(entry, 'changes')).median.toFixed(0),
                        formatSummary(summaryOf(metricOf(entry, 'notifyMicroseconds')), 0),
                        formatSummary(frame, 3),
                        ((frame.median * 1000) / Math.max(1, evaluations.median)).toFixed(1),
                        formatLoad(entry.load),
                    ]);

                    watches.forEach(watch => watch.dispose());
                    handles.forEach(handle => handle.dispose());
                    container.remove();
                }
            }
        } finally {
            frames.uninstall();
        }

        printTable(`Many owners running one behavior: one owner's state changed ${CHANGES} times a round, 5 rounds, median (least–greatest), the frame that evaluates the watches run by hand`, [
            'Owners',
            'evaluations a change',
            'of them unrelated',
            'changes reported',
            'µs notifying',
            'ms the frame',
            'µs an evaluation',
            'load',
        ], rows);
    }, 600000);
});
