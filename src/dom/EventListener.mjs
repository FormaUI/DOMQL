/**
 * EventListener — owns an event subscription: it projects each event, hands its handler the result or the failure, acknowledges each event once its handler has applied it, and retains its observation sessions until replaced
 * or disposed
 */

import { NexoError } from '@formaui-net/nexo';

/** A promise of an event's acknowledgment, with what settles it. @typedef {{ promise: Promise<void>, resolve: () => void, reject: (error: unknown) => void }} Acknowledgment */

export class EventListener {
    #evaluator;
    #sourceOf;
    #getLocation;

    /** The host call the source was started for, through which each event is projected, prepared again where a registration made its resolution stale. @type {object | null} */
    #preparedCall = null;

    /** The host call the source was started with, whose kept functions it calls until it stops, which a call prepared again for projecting never replaces. @type {object | null} */
    #sourceCall = null;
    #observations;
    #handler;
    #reportError;

    /** What carries out the subscription's reactions to an event's projected value, answering a promise of each one's result, or null for a subscription that has none. @type {((value: unknown) => readonly Promise<unknown>[]) | null} */
    #react;

    /** The interval a throttle hands the handler at most one event in, in milliseconds, or null for a subscription that hands it every event; and the window's timers it waits on. */
    #throttle;
    #timers;

    /** The timer of the throttle's interval running, or null while none runs. */
    #interval = null;

    /** The event a throttle holds until its interval ends: the handler's call, and the acknowledgment that follows it; null while it holds none. @type {{ callback: () => Promise<void>, acknowledgment: Acknowledgment } | null} */
    #held = null;

    /**
     * The failure the acknowledgment of an event a throttle dropped rejects with, `DOMQL5024` located at the subscription, and the call it was made for: made as the first event is dropped and kept for every later one
     * projected through the same call, since it names the same place; a call prepared again makes another. Null before the first. @type {{ call: object, error: NexoError } | null}
     */
    #dropped = null;

    /** What stops the source, once it has started. @type {{ stop: () => void } | null} */
    #sourceHandle = null;

    /** `ready` while the event listener listens, and `disposed` once it is ended. @type {'ready' | 'disposed'} */
    #status = 'ready';

    /** The signal that disposes it when it aborts, which it lets go of once disposed otherwise, so a signal that outlives it keeps nothing of it. @type {AbortSignal | null} */
    #signal = null;
    #disposeOnAbort = () => this.dispose();

    /** The last projection that succeeded, whose sessions keep the observations it read, so the next event reads what they sampled meanwhile. @type {import('./QueryEvaluation.mjs').QueryEvaluation | null} */
    #lastProjection = null;

    /** The handler calls waiting until the caller has the event listener, in the order their events arrived, or null once the handler is called as events arrive. @type {(() => void)[] | null} */
    #heldCallbacks = [];

    /** The events delivered whose handler has not applied them yet, each with its acknowledgment, which disposal rejects. @type {Set<Acknowledgment>} */
    #acknowledgments = new Set();

    /**
     * Starts listening, so an event delivered once the constructor returns is heard; a source that cannot start fails it, and a signal already aborted answers an event listener that is disposed and starts nothing.
     * The subscription's host call is prepared as listening starts, its receiver and arguments evaluated once. A source may deliver while it starts: those events are captured and projected at once, and the handler receives them once
     * the caller has the event listener, before any later event.
     * @param {object} dependencies What the event listener listens to, and what it works with.
     * @param {import('./QueryEvaluator.mjs').QueryEvaluator} dependencies.evaluator Prepares the subscription's host call and projects each event.
     * @param {(call: object) => (deliver: (event: unknown) => Promise<void>) => { stop: () => void }} dependencies.sourceOf What starts the prepared call's event source, given the function each event is handed to, refusing a
     * source its module gives no implementation; whatever its start throws is its failure to start.
     * @param {(pointer: string) => object} dependencies.getLocation Where a pointer into the subscription's definition stands, which a failure to start is located at.
     * @param {import('./Observations.mjs').Observations} dependencies.observations The observations of the window, which the projections hold sessions on.
     * @param {(error: unknown) => void} dependencies.reportError The environment's error reporting, which a failure of the handler reaches.
     * @param {(sender: EventListener, args: object) => unknown} dependencies.handler Receives the event listener and, for each event, `status: 'ready'` with its projected result as `value`, and the promises of its reactions'
     * results as `reactions` where it has reactions, or `status: 'failed'` with the `error` that capturing or projecting it raised. What it returns is not awaited.
     * @param {((value: unknown) => readonly Promise<unknown>[]) | null} [dependencies.react] Carries out the subscription's reactions to an event's projected value, within its delivery; null where it has none.
     * @param {number | null} [dependencies.throttle] The interval the handler hears at most one event in, the latest, in milliseconds; null where it hears every event.
     * @param {{ set: (callback: () => void, delay: number) => unknown, clear: (timer: unknown) => void }} [dependencies.timers] The window's timers, which a throttle waits on.
     * @param {AbortSignal} [dependencies.signal] Disposes the event listener when it aborts.
     */
    constructor({ evaluator, sourceOf, getLocation, observations, reportError, handler, react = null, throttle = null, timers, signal }) {
        this.#evaluator = evaluator;
        this.#react = react;
        this.#throttle = throttle;
        this.#timers = timers;
        this.#sourceOf = sourceOf;
        this.#getLocation = getLocation;
        this.#observations = observations;
        this.#handler = handler;
        this.#reportError = error => {
            try {
                reportError(error);
            } catch {
                // Keep a reporter failure from interrupting the caller.
            }
        };

        if (signal?.aborted === true) {
            this.#status = 'disposed';
            this.#heldCallbacks = null;

            return;
        }

        try {
            this.#sourceHandle = this.#start(evaluator.prepareHostCall());
        } catch (error) {
            // A failed start ends the event listener: it lets go of what the events delivered while it started opened, drops their handler calls, and ignores what the source still delivers.
            this.#status = 'disposed';
            this.#heldCallbacks = null;
            this.#release(this.#lastProjection);
            this.#lastProjection = null;
            this.#sourceCall?.dispose?.();
            this.#sourceCall = null;
            this.#rejectAcknowledgments();

            throw error;
        }

        if (this.#heldCallbacks.length === 0) {
            this.#heldCallbacks = null;
        } else {
            queueMicrotask(() => this.#runHeldCallbacks());
        }

        this.#signal = signal ?? null;
        signal?.addEventListener('abort', this.#disposeOnAbort, { once: true });
    }

    /** `ready` while the event listener listens, and `disposed` once it is ended. */
    get status() {
        return this.#status;
    }

    /** Ends the event listener: stops listening, disposes every session and prevents any new handler call; one already running may finish. Disposing again does nothing. */
    dispose() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#status = 'disposed';
        this.#signal?.removeEventListener('abort', this.#disposeOnAbort);

        // The event a throttle holds is never handed over, and its acknowledgment rejects with the others.
        if (this.#interval !== null) {
            this.#timers.clear(this.#interval);
            this.#interval = null;
        }

        this.#held = null;

        try {
            this.#sourceHandle?.stop();
        } catch (error) {
            this.#reportError(error);
        }

        // The functions the source was started with end once it has stopped.
        this.#sourceCall?.dispose?.();
        this.#sourceCall = null;
        this.#release(this.#lastProjection);
        this.#lastProjection = null;
        this.#rejectAcknowledgments();
    }

    /** Starts the source the prepared call names and answers what stops it; a skipped call, whose receiver is null or an argument whose parameter propagates null is null, has nothing to listen to. */
    #start(call) {
        if (call.kind === 'skipped') {
            return { stop: () => {} };
        }

        const { declaration: { name }, pointer } = call;
        const location = this.#getLocation(pointer);

        this.#sourceCall = call;
        this.#preparedCall = call;

        const start = this.#sourceOf(call);

        // Each event is projected during its delivery, captured as its type declares before anything else reads it, and answers its acknowledgment, which a source may leave.
        const deliver = event => this.#receive(event);

        let sourceHandle;

        try {
            sourceHandle = start(deliver);
        } catch (error) {
            throw NexoError.evaluation('DOMQL5003', `The event source '${name}' failed to start listening`, location, { cause: error });
        }

        if (typeof sourceHandle?.stop !== 'function') {
            throw NexoError.evaluation('DOMQL5004', `The event source '${name}' started listening and answered nothing that stops it`, location);
        }

        return sourceHandle;
    }

    /**
     * Captures and projects the event through the prepared call synchronously during source delivery, then hands the handler its immutable result, and answers the event's acknowledgment, which settles once the handler has
     * applied it. A successful projection replaces the sessions the event listener retains; one that fails, in capturing the event or in projecting it, hands the handler its error instead, lets go of the sessions it opened
     * and keeps those retained before it, and the event listener goes on listening. A projection refused because a module registered since made the resolution stale is made again through the subscription prepared again.
     * Nothing it does throws into the source that delivers the event.
     */
    #receive(event) {
        if (this.#status === 'disposed') {
            return EventListener.#rejected(this.#ended());
        }

        try {
            return this.#project(event);
        } catch (error) {
            return EventListener.#rejected(error);
        }
    }

    /** Projects the event and has its handler called, now or once the caller holds the event listener, answering the promise that settles once the handler has applied it. */
    #project(event) {
        let projection = this.#evaluator.project(this.#preparedCall, event, { observations: this.#observations, consumer: this });

        if (projection.error?.code === 'NEXO2040') {
            this.#release(projection);

            const error = this.#prepareAgain();

            if (error !== null) {
                // The handler hears of the failure before the event listener ends, and after the events held before it while the listener starts.
                return this.#hand(false, () => {
                    const applied = this.#call({ status: 'failed', error });

                    this.dispose();

                    return applied;
                });
            }

            projection = this.#evaluator.project(this.#preparedCall, event, { observations: this.#observations, consumer: this });
        }

        if (projection.error !== null) {
            this.#release(projection);

            return this.#hand(false, () => this.#call({ status: 'failed', error: projection.error }));
        }

        // The projection holds its sessions before the last lets go of its own, so an observation both read keeps running.
        const last = this.#lastProjection;

        this.#lastProjection = projection;
        this.#release(last);

        // Reactions are carried out within the event's delivery, whenever the handler hears of them.
        if (this.#react !== null) {
            const reactions = this.#react(projection.value);

            return this.#runOrHold(() => this.#call({ status: 'ready', value: projection.value, reactions }));
        }

        return this.#hand(true, () => this.#call({ status: 'ready', value: projection.value }));
    }

    /**
     * Hands the event to the handler, now or once the caller holds the event listener, answering what follows its call. A throttle hands over at once an event heard while no interval runs, starting one, and holds one
     * heard during it until it ends, dropping the one held before; a failed event, never dropped, hands over the event held before it and then itself.
     */
    #hand(isReady, callback) {
        if (this.#throttle === null) {
            return this.#runOrHold(callback);
        }

        if (this.#interval === null) {
            this.#startInterval();

            return this.#runOrHold(callback);
        }

        if (!isReady) {
            this.#handHeld();

            return this.#runOrHold(callback);
        }

        const dropped = this.#held;
        const acknowledgment = this.#acknowledge();

        this.#held = { callback, acknowledgment };
        dropped?.acknowledgment.reject(this.#droppedFailure());

        return acknowledgment.promise;
    }

    /** The failure of an event the throttle dropped for a later one, the one made for the call each event is projected through. */
    #droppedFailure() {
        if (this.#dropped?.call !== this.#preparedCall) {
            this.#dropped = { call: this.#preparedCall, error: NexoError.evaluation('DOMQL5024', 'The subscription\'s throttle dropped the occurrence for a later one', this.#getLocation(this.#preparedCall.pointer)) };
        }

        return this.#dropped.error;
    }

    /** Starts the throttle's interval, at whose end the event it holds, if any, is handed over, and the next interval starts. */
    #startInterval() {
        this.#interval = this.#timers.set(() => {
            this.#interval = null;

            if (this.#held !== null) {
                this.#handHeld();
                this.#startInterval();
            }
        }, this.#throttle);
    }

    /** Hands the event the throttle holds to the handler, its acknowledgment following the handler's call. */
    #handHeld() {
        const held = this.#held;

        if (held !== null) {
            this.#held = null;
            this.#runOrHold(held.callback).then(held.acknowledgment.resolve, held.acknowledgment.reject);
        }
    }

    /** A promise of an acknowledgment that waits, kept until it settles, so disposal rejects it, and handled, so a source that leaves it is never reported for it. @returns {Acknowledgment} */
    #acknowledge() {
        const acknowledgment = {};

        acknowledgment.promise = new Promise((resolve, reject) => {
            acknowledgment.resolve = () => {
                this.#acknowledgments.delete(acknowledgment);
                resolve();
            };
            acknowledgment.reject = error => {
                this.#acknowledgments.delete(acknowledgment);
                reject(error);
            };
        });
        acknowledgment.promise.catch(() => {});
        this.#acknowledgments.add(acknowledgment);

        return acknowledgment;
    }

    /** Rejects every acknowledgment still waiting, since the event listener ended before its handler applied the event. */
    #rejectAcknowledgments() {
        for (const acknowledgment of [...this.#acknowledgments]) {
            acknowledgment.reject(this.#ended());
        }
    }

    /** The failure of an event the event listener did not apply, having ended. */
    #ended() {
        return NexoError.evaluation('DOMQL5017', 'The subscription ended before it applied the occurrence', this.#preparedCall === null ? {} : this.#getLocation(this.#preparedCall.pointer));
    }

    /** The failure of an event the handler received and did not apply: the failure of its projection, or of the handler itself. */
    #failed(cause) {
        return NexoError.evaluation('DOMQL5020', `The subscription failed to apply the occurrence: ${cause?.message ?? String(cause)}`, this.#getLocation(this.#preparedCall.pointer), { cause });
    }

    /** A promise rejected with the failure, handled, so a source that leaves it is never reported for it. */
    static #rejected(error) {
        const promise = Promise.reject(error);

        promise.catch(() => {});

        return promise;
    }

    /** The acknowledgment of an event its handler applied as it returned, one promise for them all, since it holds nothing of the event. */
    static #applied = Promise.resolve();

    /**
     * Prepares the subscription again, through a current resolution, for one a module registered since made stale, and projects through that call from then on where it is prepared for the declaration the source
     * listens through; answers null then, and otherwise the failure that ends the event listener. The source keeps the receiver and the arguments it started with, so they are never evaluated again.
     */
    #prepareAgain() {
        const listening = this.#preparedCall;
        let call;

        try {
            call = this.#evaluator.prepareHostCall();
        } catch (error) {
            return error;
        }

        // A call prepared again projects alone, so it keeps none of the functions its arguments give; the source keeps those it started with.
        call.dispose?.();

        if (call.kind !== 'prepared' || call.declaration !== listening.declaration) {
            return NexoError.evaluation('DOMQL5015', `A module registered since made the request of '${listening.declaration.name}' stale, and preparing it again reaches ${call.kind === 'prepared' ? 'another host call' : 'no host call'}; subscribe again`, this.#getLocation(listening.pointer));
        }

        this.#preparedCall = call;

        return null;
    }

    /**
     * Calls the handler with the event listener and the event's arguments, unless it is disposed, and answers the promise that settles once the handler has applied the event: as it returns, or as the promise it returns
     * fulfils. A failure of the handler, thrown or rejected, goes to the environment's error reporting, and never back to the handler; it rejects the promise, as a failed event the handler received does.
     */
    #call(args) {
        if (this.#status === 'disposed') {
            return EventListener.#rejected(this.#ended());
        }

        let result;

        try {
            result = this.#handler(this, Object.freeze(args));
        } catch (error) {
            this.#reportError(error);

            return EventListener.#rejected(this.#failed(error));
        }

        if (typeof result?.then !== 'function') {
            return args.status === 'ready' ? EventListener.#applied : EventListener.#rejected(this.#failed(args.error));
        }

        // A handler applies the event once the promise it returned fulfils, unless the event listener ends first.
        const acknowledgment = this.#acknowledge();

        try {
            result.then(() => (args.status === 'ready' ? acknowledgment.resolve() : acknowledgment.reject(this.#failed(args.error))), error => {
                this.#reportError(error);
                acknowledgment.reject(this.#failed(error));
            });
        } catch (error) {
            this.#reportError(error);
            acknowledgment.reject(this.#failed(error));
        }

        return acknowledgment.promise;
    }

    /** Runs the handler call now, or after those held before it while the caller does not have the event listener yet, answering what it answers, or a promise that follows it once it runs. */
    #runOrHold(callback) {
        if (this.#heldCallbacks === null) {
            return callback();
        }

        const acknowledgment = this.#acknowledge();

        this.#heldCallbacks.push(() => callback().then(acknowledgment.resolve, acknowledgment.reject));

        return acknowledgment.promise;
    }

    /** Runs the held handler calls in order, including any they cause, and then lets the handler be called as events arrive. */
    #runHeldCallbacks() {
        const held = this.#heldCallbacks;

        for (let index = 0; index < held.length; index++) {
            held[index]();
        }

        this.#heldCallbacks = null;
    }

    /** Disposes a projection's sessions, reporting a failure to, so it keeps nothing else from happening. */
    #release(projection) {
        try {
            projection?.dispose();
        } catch (error) {
            this.#reportError(error);
        }
    }
}
