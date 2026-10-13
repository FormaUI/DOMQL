/**
 * EventListener — owns an event subscription, projects each event,
 * and retains its observation sessions until replaced or disposed.
 */

import { DomqlError } from '../language/DomqlError.mjs';
import { CallbackDispatcher } from './CallbackDispatcher.mjs';

export class EventListener {
    #evaluator;
    #observations;
    #callbackDispatcher;

    /** What stops the source, once it has started. @type {{ stop: () => void } | null} */
    #sourceHandle = null;

    /** `ready` while the event listener listens, and `disposed` once it is ended. @type {'ready' | 'disposed'} */
    #status = 'ready';

    /** The last projection that succeeded, whose sessions keep the observations it read, so the next event reads what they sampled meanwhile. @type {import('./QueryEvaluation.mjs').QueryEvaluation | null} */
    #lastProjection = null;

    /** The callbacks waiting until the caller has the event listener, in the order their events arrived, or null once callbacks run as their events do. @type {(() => void)[] | null} */
    #heldCallbacks = [];

    /**
     * Starts listening, so an event delivered once the constructor returns is heard; a source that cannot start fails it.
     * A source may deliver while it starts: those events are captured and projected at once, and their callbacks run once the caller has the event listener, before those of any later event.
     * @param {object} dependencies What the event listener listens to, and what it works with.
     * @param {import('./QueryEvaluator.mjs').QueryEvaluator} dependencies.evaluator Evaluates the subscription.
     * @param {import('./Observations.mjs').Observations} dependencies.observations The observations of the window, which the projections hold sessions on.
     * @param {(error: unknown) => void} dependencies.reportError The diagnostic reporting boundary, which a failure of `onError` reaches and an error reaches where there is no `onError`.
     * @param {object} dependencies.configuration The subscription configuration the caller chose.
     * @param {(result: unknown) => unknown} dependencies.configuration.onEvent Receives the result of each event's projection. What it returns is not awaited.
     * @param {((error: unknown) => unknown) | undefined} dependencies.configuration.onError Receives a failure of a capture, of a projection and of `onEvent`; by default they go to the diagnostic reporting boundary.
     */
    constructor({ evaluator, observations, reportError, configuration: { onEvent, onError } }) {
        this.#evaluator = evaluator;
        this.#observations = observations;
        this.#callbackDispatcher = new CallbackDispatcher({ onUpdate: onEvent, onError, reportError, isDisposed: () => this.#status === 'disposed' });

        try {
            this.#sourceHandle = this.#start(evaluator.resolveSource());
        } catch (error) {
            // A failed start ends the event listener: it lets go of what the events delivered while it started opened, drops their callbacks, and ignores what the source still delivers.
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
    }

    /** `ready` while the event listener listens, and `disposed` once it is ended. */
    get status() {
        return this.#status;
    }

    /** Ends the event listener: stops listening, disposes every session and prevents any new callback invocation; a callback already running may finish. Disposing again does nothing. */
    dispose() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#status = 'disposed';

        try {
            this.#sourceHandle?.stop();
        } catch (error) {
            this.#callbackDispatcher.reportError(error);
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
                this.#runOrHold(() => this.#callbackDispatcher.handleError(error));

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
     * Projects the captured event synchronously during source delivery, then dispatches its immutable result.
     * A successful projection replaces the sessions the event listener retains; one that fails dispatches its error instead, lets go of the sessions it opened and keeps those retained before it.
     */
    #receive(event) {
        const projection = this.#evaluator.project(event, { observations: this.#observations });

        if (projection.error !== null) {
            this.#release(projection);
            this.#runOrHold(() => this.#callbackDispatcher.handleError(projection.error));

            return;
        }

        // The projection holds its sessions before the last lets go of its own, so an observation both read keeps running.
        const last = this.#lastProjection;

        this.#lastProjection = projection;
        this.#release(last);
        this.#runOrHold(() => this.#callbackDispatcher.dispatch(projection.value));
    }

    /** Runs the callback now, or after those held before it while the caller does not have the event listener yet. */
    #runOrHold(callback) {
        if (this.#heldCallbacks === null) {
            callback();
        } else {
            this.#heldCallbacks.push(callback);
        }
    }

    /** Runs the held callbacks in order, including any their own callbacks cause, and then lets callbacks run as their events do. */
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
            this.#callbackDispatcher.reportError(error);
        }
    }
}
