/**
 * EventDispatcher — the events a handle raises, delivered to the listeners subscribed to each in the order they subscribed, each failure kept from the others
 */

import { LexicaError } from '@formaui/lexica';

export class EventDispatcher {
    #sender;
    #description;
    #reportError;

    /** The subscriptions of each event, in the order they were made: each listener, its handler, and what the handle keeps for it. @type {Map<string, { listener: Listener, handler: Function, state: object }[]>} */
    #subscriptions = new Map();

    #isDisposed = false;

    /**
     * @param {object} dependencies What raises the events, which they are, and where a failure no listener receives goes.
     * @param {object} dependencies.sender The handle each handler is called with first.
     * @param {string} dependencies.description What the handle is, for a refusal to name: `A watch`.
     * @param {string[]} dependencies.eventNames The events the handle raises; `error` among them receives the failures of the others' handlers.
     * @param {(error: unknown) => void} dependencies.reportError The environment's error reporting, which a failure of an `error` handler reaches, and one no `error` listener receives.
     */
    constructor({ sender, description, eventNames, reportError }) {
        this.#sender = sender;
        this.#description = description;
        this.#reportError = error => {
            try {
                reportError(error);
            } catch {
                // Keep a reporter failure from interrupting the caller.
            }
        };

        for (const eventName of eventNames) {
            this.#subscriptions.set(eventName, []);
        }
    }

    /**
     * Adds a listener of the event and answers it. Its `signal` option stops it when it aborts, and one already aborted answers a listener that is stopped.
     * @param {string} eventName The event.
     * @param {(sender: object, args: object) => unknown} handler What the listener calls with the handle and each event's arguments. What it returns is not awaited.
     * @param {{ signal?: AbortSignal }} [options]
     * @param {object} [state] What the handle keeps for this listener, which `raise` hands back.
     */
    subscribe(eventName, handler, options = {}, state = {}) {
        const subscriptions = this.#subscriptions.get(eventName);

        if (subscriptions === undefined) {
            throw LexicaError.structure(`${this.#description} raises ${[...this.#subscriptions.keys()].map(name => `'${name}'`).join(' and ')}, and no '${eventName}'`, {});
        }

        if (typeof handler !== 'function') {
            throw LexicaError.structure('A listener takes the function that handles each event', {});
        }

        const subscription = { listener: null, handler, state };
        const { signal } = options;
        const stopOnAbort = () => subscription.listener.dispose();

        // A listener stopped otherwise lets go of its signal, so a signal that outlives it keeps nothing of it.
        subscription.listener = new Listener(() => {
            const index = subscriptions.indexOf(subscription);

            if (index !== -1) {
                subscriptions.splice(index, 1);
            }

            signal?.removeEventListener('abort', stopOnAbort);
        });

        if (this.#isDisposed || signal?.aborted === true) {
            subscription.listener.dispose();

            return subscription.listener;
        }

        subscriptions.push(subscription);
        signal?.addEventListener('abort', stopOnAbort, { once: true });

        return subscription.listener;
    }

    /**
     * Calls the handler of each listener of the event, in the order they subscribed, with the handle and the arguments `argsOf` makes for that listener, an object of its own; a listener it makes none for is skipped.
     * A handler that throws or rejects keeps no other from the event, and its failure is raised as an `error` event, or reported where it is an `error` handler's or no `error` listener receives it.
     * @param {string} eventName The event.
     * @param {(state: object) => object | undefined} argsOf The arguments for a listener, from what the handle keeps for it.
     */
    raise(eventName, argsOf) {
        for (const subscription of [...this.#subscriptions.get(eventName)]) {
            if (this.#isDisposed) {
                return;
            }

            if (subscription.listener.status === 'disposed') {
                continue;
            }

            const args = argsOf(subscription.state);

            if (args !== undefined) {
                this.#call(eventName, subscription.handler, Object.freeze(args));
            }
        }
    }

    /** Raises the failure as an `error` event, or reports it where no `error` listener receives it. */
    raiseError(error) {
        if (this.#isDisposed || !(this.#subscriptions.get('error')?.length > 0)) {
            this.#reportError(error);

            return;
        }

        this.raise('error', () => ({ error }));
    }

    /** Reports the failure to the environment's error reporting, for one that belongs to no listener. */
    reportError(error) {
        this.#reportError(error);
    }

    /** Stops every listener and calls no handler again; one already running may finish. */
    dispose() {
        this.#isDisposed = true;

        for (const subscriptions of this.#subscriptions.values()) {
            for (const { listener } of [...subscriptions]) {
                listener.dispose();
            }
        }
    }

    #call(eventName, handler, args) {
        // A failure of an error handler is never handed to the error handlers again.
        const fail = eventName === 'error' ? error => this.#reportError(error) : error => this.raiseError(error);

        try {
            const result = handler(this.#sender, args);

            if (typeof result?.then === 'function') {
                result.then(undefined, fail);
            }
        } catch (error) {
            fail(error);
        }
    }
}

/** A listener of one event: `ready` until it is stopped, and `disposed` from then on. */
class Listener {
    #stop;
    #status = 'ready';

    /** @param {() => void} stop Removes the listener from its event. */
    constructor(stop) {
        this.#stop = stop;
    }

    /** `ready` while it listens, and `disposed` once it is stopped. */
    get status() {
        return this.#status;
    }

    /** Stops the listener, so its handler is called no more; one already running may finish. Disposing again does nothing. */
    dispose() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#status = 'disposed';
        this.#stop();
    }
}
