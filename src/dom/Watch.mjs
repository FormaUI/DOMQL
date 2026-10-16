/**
 * Watch — keeps a query's result current, evaluating again when something it depends on changes, and raises each result that differs to the listeners subscribed to it and to its selected views
 */

import { LiveState } from '../snapshots/LiveState.mjs';
import { DomqlError } from '../language/DomqlError.mjs';
import { ResultPath } from '../language/ResultPath.mjs';
import { EventDispatcher } from './EventDispatcher.mjs';

/** The change set of a listener's first ready event, which is its baseline. */
const NO_CHANGES = Object.freeze([]);

export class Watch {
    #evaluator;
    #observations;
    #comparer;
    #window;
    #schedule;
    #checkPath;
    #eventDispatcher;

    /** The path into the result the watch reports, empty for the whole result, as a selection's watch reports its part. @type {(string | number)[]} */
    #path;

    /** `pending` until the first snapshot is available, `ready` while the watch has a current one, `failed` after an evaluation fails, and `disposed` once it is ended. @type {'pending' | 'ready' | 'failed' | 'disposed'} */
    #status = 'pending';
    #lastSnapshot = null;
    #lastIdentities = null;
    #hasSnapshot = false;

    /** The latest evaluation failure, cleared by the next success. */
    #error = null;

    /** Whether the next successful evaluation reports its snapshot whether or not it differs, as after a failure. */
    #needsDelivery = false;

    /** The last evaluation that did not fail, and the latest one that did since: the watch holds the sessions of both. @type {import('./QueryEvaluation.mjs').QueryEvaluation | null} */
    #successfulEvaluation = null;

    /** @type {import('./QueryEvaluation.mjs').QueryEvaluation | null} */
    #failedEvaluation = null;

    /** What every session the watch holds calls when something the result depends on may have changed, the one function its evaluations share. */
    #onDependencyChange = () => this.#invalidate();

    /** The animation frame the next evaluation waits for. */
    #frame = null;
    /** Whether an evaluation under the immediate schedule is queued for the next microtask, which the invalidations received before it share. */
    #isQueued = false;
    #isRunning = false;

    /** Whether an evaluation has run, so the first one scheduled at creation is not repeated by a refresh that came before it. */
    #hasRun = false;

    /** What an evaluation asked for while another was running: nothing, an evaluation at the schedule, or one now. @type {'none' | 'schedule' | 'now'} */
    #rerun = 'none';

    /** The refreshes waiting for the next evaluation to complete. @type {{ resolve: () => void, reject: (error: unknown) => void }[]} */
    #pendingRefreshes = [];

    /** The callers waiting for a successful ready state. @type {{ resolve: (snapshot: unknown) => void, reject: (error: unknown) => void }[]} */
    #readyWaiters = [];

    /** The object a watch that delivers live state keeps current in place, or null for a watch of another strategy. @type {LiveState | null} */
    #liveState = null;

    /** The signal that disposes it when it aborts, which it lets go of once disposed otherwise, so a signal that outlives it keeps nothing of it. @type {AbortSignal | null} */
    #signal = null;
    #disposeOnAbort = () => this.dispose();

    /**
     * Starts the watch, whose first evaluation follows the call that created it; a signal already aborted answers a watch that is disposed and starts nothing.
     * @param {object} dependencies What the watch keeps current, and what it works with.
     * @param {import('./QueryEvaluator.mjs').QueryEvaluator} dependencies.evaluator Evaluates the query.
     * @param {import('./Observations.mjs').Observations} dependencies.observations The observations of the window, which the watch holds sessions on.
     * @param {import('../snapshots/SnapshotComparer.mjs').SnapshotComparer} dependencies.comparer Compares the snapshots.
     * @param {Window} dependencies.window The window the watch belongs to.
     * @param {(error: unknown) => void} dependencies.reportError The environment's error reporting, which a failure no listener receives reaches.
     * @param {(path: (string | number)[]) => void} dependencies.checkPath Refuses a path that does not fit the result's type.
     * @param {object} dependencies.options The watch's options.
     * @param {'frame' | 'immediate'} dependencies.options.schedule When an evaluation follows a change: at the next animation frame, once however many observations fired, or, without waiting for an animation frame, in a microtask the first invalidation queues, which the invalidations received before it begins share.
     * @param {'snapshot' | 'liveState'} dependencies.options.updateStrategy What the watch's events carry: each snapshot whole, or one object it keeps current in place.
     * @param {(string | number)[]} [dependencies.options.path] The part of the result the watch reports.
     * @param {AbortSignal} [dependencies.options.signal] Disposes the watch when it aborts.
     */
    constructor({ evaluator, observations, comparer, window, reportError, checkPath, options: { schedule, updateStrategy = 'snapshot', path = [], signal } }) {
        this.#evaluator = evaluator;
        this.#observations = observations;
        this.#comparer = comparer;
        this.#window = window;
        this.#schedule = schedule;
        this.#checkPath = checkPath;
        this.#path = path;
        this.#eventDispatcher = new EventDispatcher({ sender: this, description: 'A watch', eventNames: ['change', 'error'], reportError });

        if (updateStrategy === 'liveState') {
            this.#liveState = new LiveState();
        }

        if (signal?.aborted === true) {
            this.dispose();

            return;
        }

        this.#signal = signal ?? null;
        signal?.addEventListener('abort', this.#disposeOnAbort, { once: true });

        // The first evaluation follows the caller receiving the handle, so a listener subscribed after the call hears it.
        queueMicrotask(() => {
            if (!this.#hasRun) {
                this.#run();
            }
        });
    }

    /** `pending` until the first snapshot is available, `ready` while the watch has a current one, `failed` after an evaluation fails, and `disposed` once it is ended. */
    get status() {
        return this.#status;
    }

    /** The last successful immutable snapshot, or undefined before the first, so a result that is null is told apart from none yet. */
    get snapshot() {
        return this.#hasSnapshot ? ResultPath.valueAt(this.#lastSnapshot, this.#path) : undefined;
    }

    /** The latest evaluation failure, cleared by the next success; null where there is none. */
    get error() {
        return this.#error;
    }

    /** The object a watch that delivers live state keeps current, the same from the first snapshot on; undefined before it, and for a watch of another strategy. */
    get liveState() {
        return this.#liveState !== null && this.#hasSnapshot ? this.#liveState.state : undefined;
    }

    /**
     * Adds a listener of the watch's `change` or `error` events and answers it. A listener of `change` that subscribes once the watch has a result receives that result first, as its baseline.
     * @param {'change' | 'error'} eventName
     * @param {(sender: Watch, args: object) => unknown} handler
     * @param {{ signal?: AbortSignal }} [options]
     */
    subscribe(eventName, handler, options) {
        return this.#subscribeAt([], eventName, handler, options);
    }

    /** A selected view of a snapshot watch: a part of its result, whose path is checked against the result's type at once. */
    select(...path) {
        if (this.#liveState !== null) {
            throw DomqlError.structure('Selected views belong to snapshot watches, and this watch keeps live state; write the smaller result in DOMQL to keep it live', {});
        }

        ResultPath.checkShape(path);
        this.#checkPath([...this.#path, ...path]);

        return new SelectedView(this, path, (eventName, handler, options) => {
            if (eventName !== 'change') {
                throw DomqlError.structure(`A selected view raises 'change', and no '${eventName}'; its watch raises 'error'`, {});
            }

            return this.#subscribeAt(path, eventName, handler, options);
        });
    }

    /**
     * Waits for a successful ready state and answers its snapshot: at once where the watch is ready, and otherwise at the next successful evaluation.
     * It rejects where an evaluation fails while it waits or the watch is disposed, and its `signal` cancels the wait alone.
     * @param {{ signal?: AbortSignal }} [options]
     */
    readyAsync({ signal } = {}) {
        if (this.#status === 'disposed') {
            return Promise.reject(DomqlError.evaluation('A disposed watch is never ready', {}));
        }

        if (signal?.aborted === true) {
            return Promise.reject(signal.reason);
        }

        if (this.#status === 'ready') {
            return Promise.resolve(this.snapshot);
        }

        return new Promise((resolve, reject) => {
            const waiter = {
                resolve: snapshot => {
                    signal?.removeEventListener('abort', cancel);
                    resolve(snapshot);
                },
                reject: error => {
                    signal?.removeEventListener('abort', cancel);
                    reject(error);
                },
            };
            const cancel = () => {
                this.#readyWaiters.splice(this.#readyWaiters.indexOf(waiter), 1);
                reject(signal.reason);
            };

            this.#readyWaiters.push(waiter);
            signal?.addEventListener('abort', cancel, { once: true });
        });
    }

    /**
     * Evaluates now instead of at the schedule, and settles once the evaluation has completed and the event it produced, if any, has been raised; where that evaluation waits for a sample, it settles with the evaluation that ends the wait.
     * It rejects with the failure of its evaluation, resolves without delivering where disposal cancels it, and rejects where called after disposal.
     */
    refreshAsync() {
        if (this.#status === 'disposed') {
            return Promise.reject(DomqlError.evaluation('A disposed watch cannot be refreshed', {}));
        }

        return new Promise((resolve, reject) => {
            this.#pendingRefreshes.push({ resolve, reject });

            if (this.#isRunning) {
                this.#rerun = 'now';
            } else {
                this.#run();
            }
        });
    }

    /** Ends the watch: cancels the evaluation it scheduled, disposes every session, stops every listener, its views' included, and prevents any new handler call; a handler already running may finish. Disposing again does nothing. */
    dispose() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#status = 'disposed';
        this.#signal?.removeEventListener('abort', this.#disposeOnAbort);
        this.#cancelFrame();
        this.#eventDispatcher.dispose();

        this.#release(this.#successfulEvaluation);
        this.#release(this.#failedEvaluation);
        this.#successfulEvaluation = null;
        this.#failedEvaluation = null;

        for (const { resolve } of this.#pendingRefreshes.splice(0)) {
            resolve();
        }

        for (const { reject } of this.#readyWaiters.splice(0)) {
            reject(DomqlError.evaluation('The watch was disposed before it was ready', {}));
        }
    }

    /** Adds a listener of the part at the path, relative to the part the watch reports, and has a listener of `change` that subscribes once the watch has a result receive it first. */
    #subscribeAt(path, eventName, handler, options) {
        // What the watch keeps for a listener of change: the part it listens to, the value it last received, and whether its next ready event is due whatever its value.
        const state = { path: [...this.#path, ...path], hasReceived: false, hasValue: false, value: undefined, isDue: false };
        const listener = this.#eventDispatcher.subscribe(eventName, handler, options, state);

        if (eventName === 'change' && (this.#status === 'ready' || this.#status === 'failed')) {
            queueMicrotask(() => {
                if (!state.hasReceived && listener.status === 'ready') {
                    this.#eventDispatcher.raise('change', target => (target === state ? this.#currentArgsFor(state) : undefined));
                }
            });
        }

        return listener;
    }

    /** The arguments of the result the watch has now, for a listener that has received none yet. */
    #currentArgsFor(state) {
        if (this.#status === 'failed') {
            return this.#failedArgsFor(state);
        }

        return this.#readyArgsFor(state, NO_CHANGES);
    }

    /** The arguments of a failed evaluation, after which the listener's next ready event is due whatever its value. */
    #failedArgsFor(state) {
        state.hasReceived = true;
        state.isDue = true;

        return { status: 'failed', error: this.#error };
    }

    /** The arguments of the snapshot for the listener, or none where the part it listens to is as it last received it; a listener's first ready event of live state is its baseline, with no changes. */
    #readyArgsFor(state, changes) {
        if (this.#liveState !== null) {
            const args = { status: 'ready', liveState: this.#liveState.state, snapshot: this.#lastSnapshot, changes: state.hasValue ? changes : NO_CHANGES };

            state.hasReceived = true;
            state.hasValue = true;

            return args;
        }

        const value = ResultPath.valueAt(this.#lastSnapshot, state.path);

        if (state.hasValue && !state.isDue && Object.is(state.value, value)) {
            return undefined;
        }

        state.hasReceived = true;
        state.hasValue = true;
        state.isDue = false;
        state.value = value;

        return { status: 'ready', value };
    }

    /** Asks for an evaluation at the schedule, which a change to something the result depends on does. */
    #invalidate() {
        if (this.#status === 'disposed') {
            return;
        }

        if (this.#isRunning) {
            if (this.#rerun === 'none') {
                this.#rerun = 'schedule';
            }

            return;
        }

        if (this.#schedule === 'immediate') {
            if (!this.#isQueued) {
                this.#isQueued = true;
                queueMicrotask(() => {
                    // Any evaluation since answers the invalidations this one was queued for, a refresh among them.
                    if (this.#isQueued) {
                        this.#run();
                    }
                });
            }
        } else if (this.#frame === null) {
            this.#frame = this.#window.requestAnimationFrame(() => {
                this.#frame = null;
                this.#run();
            });
        }
    }

    #cancelFrame() {
        if (this.#frame !== null) {
            this.#window.cancelAnimationFrame(this.#frame);
            this.#frame = null;
        }
    }

    #run() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#hasRun = true;
        this.#isQueued = false;
        this.#cancelFrame();

        // The refreshes waiting now are answered by this evaluation, and one asked for while it runs by the next.
        const waiting = this.#pendingRefreshes.splice(0);

        this.#isRunning = true;

        try {
            // The next evaluation takes over the sessions of the ones it replaces wherever it observes the same again.
            const replaces = [this.#successfulEvaluation, this.#failedEvaluation].filter(evaluation => evaluation !== null);

            this.#settle(this.#evaluator.evaluate({ observations: this.#observations, onChange: this.#onDependencyChange, holdsAllObservations: true, replaces, consumer: this }), waiting);
        } finally {
            this.#isRunning = false;
        }

        const rerun = this.#rerun;

        this.#rerun = 'none';

        if (rerun === 'now') {
            this.#run();
        } else if (rerun === 'schedule') {
            this.#invalidate();
        }
    }

    #settle(queryEvaluation, waiting) {
        if (this.#status === 'disposed') {
            this.#release(queryEvaluation);

            for (const { resolve } of waiting) {
                resolve();
            }

            return;
        }

        if (queryEvaluation.error !== null) {
            // The watch keeps the dependencies of its last successful evaluation together with those the failed one recorded.
            this.#release(this.#failedEvaluation);
            this.#failedEvaluation = queryEvaluation;
            this.#status = 'failed';
            this.#error = queryEvaluation.error;
            this.#needsDelivery = true;
            this.#eventDispatcher.raise('change', state => this.#failedArgsFor(state));

            for (const { reject } of this.#readyWaiters.splice(0)) {
                reject(queryEvaluation.error);
            }

            for (const { reject } of waiting) {
                reject(queryEvaluation.error);
            }

            return;
        }

        this.#replace(queryEvaluation);

        // The first snapshot waits for the first sample of every maintained member it reads, and an evaluation that produced none waits for the sample it failed on.
        if (queryEvaluation.value === undefined || (queryEvaluation.isPending && !this.#hasSnapshot)) {
            this.#pendingRefreshes.unshift(...waiting);

            return;
        }

        const next = this.#hasSnapshot ? this.#comparer.reconcile(this.#lastSnapshot, this.#lastIdentities, queryEvaluation.value, queryEvaluation.identities) : queryEvaluation.value;
        const isDue = this.#needsDelivery;
        const isReported = !this.#hasSnapshot || isDue || next !== this.#lastSnapshot;

        this.#lastSnapshot = next;
        this.#lastIdentities = queryEvaluation.identities;
        this.#hasSnapshot = true;
        this.#needsDelivery = false;
        this.#error = null;
        this.#status = 'ready';

        if (isReported) {
            // The change set is applied whole before any handler begins.
            const changes = this.#liveState === null ? NO_CHANGES : this.#liveState.update(next, queryEvaluation.identities);

            this.#eventDispatcher.raise('change', state => this.#readyArgsFor(state, changes));
        }

        const snapshot = this.snapshot;

        for (const { resolve } of this.#readyWaiters.splice(0)) {
            resolve(snapshot);
        }

        for (const { resolve } of waiting) {
            resolve();
        }
    }

    /** Holds the evaluation's sessions and lets go of the ones the evaluations before it held, after it has its own, so an observation both need keeps running. */
    #replace(queryEvaluation) {
        const before = [this.#successfulEvaluation, this.#failedEvaluation];

        this.#successfulEvaluation = queryEvaluation;
        this.#failedEvaluation = null;

        for (const old of before) {
            this.#release(old);
        }
    }

    /** Disposes an evaluation's sessions, reporting a failure to the environment, so every other cleanup and everything after it still happens. */
    #release(queryEvaluation) {
        try {
            queryEvaluation?.dispose();
        } catch (error) {
            this.#eventDispatcher.reportError(error);
        }
    }
}

/** A part of a snapshot watch's result: it starts no evaluation of its own and needs no disposal, and its listeners stop with the watch. */
class SelectedView {
    #watch;
    #path;
    #subscribe;

    /**
     * @param {Watch} watch The watch it was selected from, which its listeners' handlers are called with.
     * @param {(string | number)[]} path The part, relative to what the watch reports.
     * @param {Function} subscribe Adds a listener of the part's changes.
     */
    constructor(watch, path, subscribe) {
        this.#watch = watch;
        this.#path = path;
        this.#subscribe = subscribe;
    }

    /** The watch's status. */
    get status() {
        return this.#watch.status;
    }

    /** The part of the watch's last successful snapshot, or undefined before the first. */
    get snapshot() {
        const snapshot = this.#watch.snapshot;

        return snapshot === undefined ? undefined : ResultPath.valueAt(snapshot, this.#path);
    }

    /** The watch's latest evaluation failure, cleared by the next success. */
    get error() {
        return this.#watch.error;
    }

    /** A smaller part, checked against the result's type at once. */
    select(...path) {
        return this.#watch.select(...this.#path, ...path);
    }

    /**
     * Adds a listener of the part's `change` events, raised where the part changed and after a failed evaluation, and answers it; their sender is the watch.
     * @param {'change'} eventName
     * @param {(sender: Watch, args: object) => unknown} handler
     * @param {{ signal?: AbortSignal }} [options]
     */
    subscribe(eventName, handler, options) {
        return this.#subscribe(eventName, handler, options);
    }

    /** Waits for the watch's successful ready state and answers the part of its snapshot. */
    readyAsync(options) {
        return this.#watch.readyAsync(options).then(snapshot => ResultPath.valueAt(snapshot, this.#path));
    }
}
