import { cdp, commands } from '@vitest/browser/context';

/**
 * What the workloads of `npm run scale` measure with: rounds whose median and range are reported, the machine's load each ran under, allocation sampled by the browser's heap profiler, memory read once garbage is
 * collected, animation frames run by hand, and the mutation observers' callbacks counted.
 */

/** The median of the values. */
export const median = values => {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = sorted.length >> 1;

    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** The median, least and greatest of the values. */
export const summaryOf = values => ({ median: median(values), min: Math.min(...values), max: Math.max(...values) });

/** A summary as `median (least–greatest)`, each with the digits given. */
export const formatSummary = ({ median: middle, min, max }, digits = 1) => `${middle.toFixed(digits)} (${min.toFixed(digits)}–${max.toFixed(digits)})`;

/** A load, a fraction of the machine's processor time, as a percentage. */
export const formatLoad = load => `${(load * 100).toFixed(0)}%`;

/** The machine's processor time so far, read in Node by the config's command. */
const processorTimes = () => commands.processorTimes();

/**
 * Runs `run` and answers what it answered with the processor time the machine spent busy and in all while it ran, summed over its logical processors, and their share, its load, this run's own included: one busy
 * processor of sixteen is about 6%. Windows counts processor time in ticks of about 16 ms, so a load read over less than a second is rough.
 * @template T
 * @param {() => Promise<T> | T} run
 * @returns {Promise<{ result: T, busy: number, total: number, load: number }>}
 */
export const underLoad = async run => {
    const before = await processorTimes();
    const result = await run();
    const after = await processorTimes();
    const busy = after.busy - before.busy;
    const total = Math.max(1, after.total - before.total);

    return { result, busy, total, load: busy / total };
};

/**
 * Runs each case in each round, the order reversed every other round so neither case always runs first, and answers each case's measurements, one a round, with the load its rounds ran under together. A case measures
 * one round and answers a number, or an object of numbers.
 * @param {{ name: string, measure: () => Promise<number | Record<string, number>> | number | Record<string, number> }[]} cases
 * @param {{ rounds?: number }} [options]
 * @returns {Promise<Map<string, { values: (number | Record<string, number>)[], load: number }>>}
 */
export const runRounds = async (cases, { rounds = 5 } = {}) => {
    const results = new Map(cases.map(({ name }) => [name, { values: [], busy: 0, total: 0, load: 0 }]));

    for (let round = 0; round < rounds; round++) {
        for (const { name, measure } of round % 2 === 0 ? cases : [...cases].reverse()) {
            const { result, busy, total } = await underLoad(measure);
            const entry = results.get(name);

            entry.values.push(result);
            entry.busy += busy;
            entry.total += total;
            entry.load = entry.busy / entry.total;
        }
    }

    return results;
};

/** The measurements of one metric across a case's rounds, from what `runRounds` answered for it. */
export const metricOf = ({ values }, key) => values.map(value => (key === undefined ? value : value[key]));

/** The script memory in use once garbage is collected twice, a task apart so what a collection finalizes is released, or null where the browser exposes neither collection nor a precise measure. */
export const usedMemory = async () => {
    if (typeof window.gc !== 'function' || performance.memory === undefined) {
        return null;
    }

    for (let index = 0; index < 3; index++) {
        window.gc();
        await nextTask();
    }

    return performance.memory.usedJSHeapSize;
};

/** The noise of reading memory: the greatest difference among three readings with nothing between them, in bytes, or null where memory can't be read. */
export const memoryNoise = async () => {
    const readings = [await usedMemory(), await usedMemory(), await usedMemory()];

    return readings[0] === null ? null : Math.max(...readings) - Math.min(...readings);
};

/** The bytes a heap profile's samples stand for, the profiler scaling each sample to the allocations it stands for. */
const bytesOf = node => node.selfSize + node.children.reduce((total, child) => total + bytesOf(child), 0);

/**
 * The bytes allocated while `run` ran, as the browser's sampling heap profiler estimates them, objects collected meanwhile included, so a cost that garbage collection hides still counts. The profiler samples every
 * 128 bytes on average, so a count of a few kilobytes is near its precision; a run of thousands of operations reads per operation well within it.
 * @param {() => Promise<void> | void} run
 */
export const allocatedDuring = async run => {
    const session = cdp();
    let profile;

    await session.send('HeapProfiler.enable');
    await session.send('HeapProfiler.collectGarbage');
    await session.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });

    try {
        await run();
    } finally {
        ({ profile } = await session.send('HeapProfiler.stopSampling'));
        await session.send('HeapProfiler.disable');
    }

    return bytesOf(profile.head);
};

/** A profile node's function, named by its name, its file and its line. */
const functionOf = ({ callFrame: { functionName, url, lineNumber } }) => `${functionName || '(anonymous)'} ${url.split('/').pop().split('?')[0]}:${lineNumber + 1}`;

/** The entries of a map of amounts by key, the greatest first, each with its share of the total. */
const greatest = (amounts, count) => {
    const total = [...amounts.values()].reduce((sum, amount) => sum + amount, 0);

    return [...amounts].sort((first, second) => second[1] - first[1]).slice(0, count).map(([name, amount]) => ({ name, amount, share: amount / total }));
};

/**
 * Where the time went while `run` ran, from the browser's sampling profiler: each function's own time, the greatest `count` of them, with their share. Given `within`, a function's name, it counts only the samples
 * taken inside a call of that function, so a workload profiles its own operation apart from what measures it; otherwise every sample's, the idle time between tasks included.
 * @param {() => Promise<void> | void} run
 * @param {number} [count]
 * @param {{ within?: string }} [options]
 */
export const timeProfileDuring = async (run, count = 12, { within } = {}) => {
    const session = cdp();
    let profile;

    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 50 });
    await session.send('Profiler.start');

    try {
        await run();
    } finally {
        ({ profile } = await session.send('Profiler.stop'));
        await session.send('Profiler.disable');
    }

    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const parents = new Map(profile.nodes.flatMap(node => (node.children ?? []).map(child => [child, node.id])));
    const isWithin = id => {
        for (let current = id; current !== undefined; current = parents.get(current)) {
            if (nodes.get(current).callFrame.functionName === within) {
                return true;
            }
        }

        return false;
    };
    const own = new Map();

    profile.samples.forEach((id, index) => {
        if (within === undefined || isWithin(id)) {
            const name = functionOf(nodes.get(id));

            own.set(name, (own.get(name) ?? 0) + (profile.timeDeltas[index + 1] ?? 0));
        }
    });

    return greatest(own, count);
};

/**
 * Where the allocation went while `run` ran, from the browser's sampling heap profiler, objects collected meanwhile included: each function's own allocation, the greatest `count` of them, with their share of it.
 * Given `within`, a function's name, it counts only what was allocated inside a call of that function.
 * @param {() => Promise<void> | void} run
 * @param {number} [count]
 * @param {{ within?: string }} [options]
 */
export const allocationProfileDuring = async (run, count = 12, { within } = {}) => {
    const session = cdp();
    let profile;

    await session.send('HeapProfiler.enable');
    await session.send('HeapProfiler.collectGarbage');
    await session.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });

    try {
        await run();
    } finally {
        ({ profile } = await session.send('HeapProfiler.stopSampling'));
        await session.send('HeapProfiler.disable');
    }

    const own = new Map();
    const visit = (node, isCounted) => {
        const counts = isCounted || within === undefined || node.callFrame.functionName === within;

        if (counts) {
            const name = functionOf(node);

            own.set(name, (own.get(name) ?? 0) + node.selfSize);
        }

        node.children.forEach(child => visit(child, counts));
    };

    visit(profile.head, false);

    return greatest(own, count);
};

/** Prints a profile's greatest functions under its title, each its amount in the unit given and its share. */
export const printProfile = (title, entries, { unit, scale = 1, digits = 1 }) => {
    printTable(title, ['Function', unit, 'share'], entries.map(({ name, amount, share }) => [name, (amount * scale).toFixed(digits), `${(share * 100).toFixed(1)}%`]));
};

/** One channel, whose message is the next task, so a step waits for its microtasks without a timer's least delay. */
const channel = new MessageChannel();
const waiting = [];

channel.port1.onmessage = () => waiting.shift()?.();

/** A promise that settles in the next task, once every microtask queued before it has run. */
export const nextTask = () =>
    new Promise(resolve => {
        waiting.push(resolve);
        channel.port2.postMessage(null);
    });

/**
 * Animation frames run by hand: the window's `requestAnimationFrame` keeps what it is asked for until `run` calls it, so a workload times the frame's work alone, at the moment it chooses, where the browser's own frames
 * would interleave with what it times. The browser still lays out and paints on its own between tasks.
 */
export class ManualFrames {
    #window;
    #callbacks = new Map();
    #next = 1;
    #native;

    /** @param {Window} window The window whose animation frames it runs, from `install` until `uninstall`. */
    constructor(window) {
        this.#window = window;
    }

    /** How many callbacks wait for the next frame. */
    get pending() {
        return this.#callbacks.size;
    }

    install() {
        this.#native = { request: this.#window.requestAnimationFrame, cancel: this.#window.cancelAnimationFrame };
        this.#window.requestAnimationFrame = callback => {
            const id = this.#next++;

            this.#callbacks.set(id, callback);

            return id;
        };
        this.#window.cancelAnimationFrame = id => this.#callbacks.delete(id);
    }

    uninstall() {
        this.#window.requestAnimationFrame = this.#native.request;
        this.#window.cancelAnimationFrame = this.#native.cancel;
        this.#callbacks.clear();
    }

    /** Runs the frame: every callback asked for before it, given the frame's time; what they ask for waits for the next. Answers how many ran. */
    run() {
        const callbacks = [...this.#callbacks.values()];
        const time = performance.now();

        this.#callbacks.clear();
        callbacks.forEach(callback => callback(time));

        return callbacks.length;
    }
}

/**
 * Counts the mutation observers created in the window from `install` until `uninstall`, DOMQL's among them, their callbacks, the records they are handed, and the time their callbacks take. An observer created
 * before it is not counted, so it is installed before what is measured creates its observers.
 */
export class MutationCallbacks {
    #window;
    #native;

    created = 0;
    callbacks = 0;
    records = 0;
    milliseconds = 0;

    /** @param {Window} window */
    constructor(window) {
        this.#window = window;
    }

    install() {
        const counts = this;
        const Native = (this.#native = this.#window.MutationObserver);

        this.#window.MutationObserver = class extends Native {
            constructor(callback) {
                counts.created++;
                super((records, observer) => {
                    const start = performance.now();

                    counts.callbacks++;
                    counts.records += records.length;

                    try {
                        callback(records, observer);
                    } finally {
                        counts.milliseconds += performance.now() - start;
                    }
                });
            }
        };
    }

    uninstall() {
        this.#window.MutationObserver = this.#native;
    }

    reset() {
        this.callbacks = 0;
        this.records = 0;
        this.milliseconds = 0;
    }
}

/** Prints a table: its title, its header and its rows, each cell padded to its column, the first left-aligned and the rest right-aligned, so runs compare line by line. */
export const printTable = (title, header, rows) => {
    const widths = header.map((cell, column) => Math.max(cell.length, ...rows.map(row => String(row[column]).length)));
    const line = row => row.map((cell, column) => (column === 0 ? String(cell).padEnd(widths[column]) : String(cell).padStart(widths[column]))).join('  ');

    console.log([``, title, line(header), widths.map(width => '-'.repeat(width)).join('  '), ...rows.map(line)].join('\n'));
};
