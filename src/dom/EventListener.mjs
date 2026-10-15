/**
 * EventListener — owns an event subscription: it projects each event, hands its handler the result or the failure, and retains its observation sessions until replaced or disposed
 */

import { DomqlError } from '../language/DomqlError.mjs';

export class EventListener {
    #evaluator;
    #observations;
    #handler;
    #reportError;

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

    /**
     * Starts listening, so an event delivered once the constructor returns is heard; a source that cannot start fails it, and a signal already aborted answers an event listener that is disposed and starts nothing.
     * A source may deliver while it starts: those events are captured and projected at once, and the handler receives them once the caller has the event listener, before any later event.
     * @param {object} dependencies What the event listener listens to, and what it works with.
     * @param {import('./QueryEvaluator.mjs').QueryEvaluator} dependencies.evaluator Evaluates the subscription.
     * @param {import('./Observations.mjs').Observations} dependencies.observations The observations of the window, which the projections hold sessions on.
     * @param {(error: unknown) => void} dependencies.reportError The environment's error reporting, which a failure of the handler reaches.
     * @param {(sender: EventListener, args: object) => unknown} dependencies.handler Receives the event listener and, for each event, `status: 'ready'` with its projected result as `value`, or `status: 'failed'` with the `error` that capturing or projecting it raised. What it returns is not awaited.
     * @param {AbortSignal} [dependencies.signal] Disposes the event listener when it aborts.
     */
    constructor({ evaluator, observations, reportError, handler, signal }) {
        this.#evaluator = evaluator;
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
            this.#sourceHandle = this.#start(evaluator.resolveSource());
        } catch (error) {
            // A failed start ends the event listener: it lets go of what the events delivered while it started opened, drops their handler calls, and ignores what the source still delivers.
            this.#status = 'disposed';
            this.#heldCallbacks = null;
            this.#release(this.#lastProjection);
            this.#lastProjection = null;

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

        try {
            this.#sourceHandle?.stop();
        } catch (error) {
            this.#reportError(error);
        }

        this.#release(this.#lastProjection);
        this.#lastProjection = null;
    }

    /** Starts the source and answers what stops it; a source whose receiver or an argument is null has nothing to listen to. */
    #start(source) {
        if (source === null) {
            return { stop: () => {} };
        }

        const { name, start, capture, receiver, args, environment, location } = source;

        // The source captures each event as the fields its type declares, during its delivery, before anything else reads it.
        const deliver = event => {
            if (this.#status === 'disposed') {
                return;
            }

            let captured;

            try {
                captured = capture(event);
            } catch (error) {
                this.#runOrHold(() => this.#call({ status: 'failed', error }));

                return;
            }

            this.#receive(captured);
        };

        let sourceHandle;

        try {
            sourceHandle = start(receiver, args, environment, deliver);
        } catch (error) {
            throw DomqlError.evaluation(`The source '${name}' failed to start listening`, location, { cause: error });
        }

        if (typeof sourceHandle?.stop !== 'function') {
            throw DomqlError.evaluation(`The source '${name}' started listening and answered nothing that stops it`, location);
        }

        return sourceHandle;
    }

    /**
     * Projects the captured event synchronously during source delivery, then hands the handler its immutable result.
     * A successful projection replaces the sessions the event listener retains; one that fails hands the handler its error instead, lets go of the sessions it opened and keeps those retained before it, and the event listener goes on listening.
     */
    #receive(event) {
        const projection = this.#evaluator.project(event, { observations: this.#observations, consumer: this });

        if (projection.error !== null) {
            this.#release(projection);
            this.#runOrHold(() => this.#call({ status: 'failed', error: projection.error }));

            return;
        }

        // The projection holds its sessions before the last lets go of its own, so an observation both read keeps running.
        const last = this.#lastProjection;

        this.#lastProjection = projection;
        this.#release(last);
        this.#runOrHold(() => this.#call({ status: 'ready', value: projection.value }));
    }

    /** Calls the handler with the event listener and the event's arguments, unless it is disposed; a failure of the handler, thrown or rejected, goes to the environment's error reporting, and never back to the handler. */
    #call(args) {
        if (this.#status === 'disposed') {
            return;
        }

        try {
            const result = this.#handler(this, Object.freeze(args));

            if (typeof result?.then === 'function') {
                result.then(undefined, this.#reportError);
            }
        } catch (error) {
            this.#reportError(error);
        }
    }

    /** Runs the handler call now, or after those held before it while the caller does not have the event listener yet. */
    #runOrHold(callback) {
        if (this.#heldCallbacks === null) {
            callback();
        } else {
            this.#heldCallbacks.push(callback);
        }
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
