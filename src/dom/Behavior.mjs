/**
 * Behavior — one applied behavior: it applies the instance its module creates, replaces the bindings it runs with when updated, raises the failures it reports while it runs, and disposes it
 */

import { DomqlError } from '../language/DomqlError.mjs';
import { EventDispatcher } from './EventDispatcher.mjs';

/** @typedef {{ declaration: object, name: string, start: Function, receiver: unknown, args: Record<string, unknown> | null, environment: object, location: object }} BehaviorCall */

export class Behavior {
    #prepare;
    #eventDispatcher;
    /** The declaration of the behavior, or null while a receiver of unknown type has selected none. */
    #declaration;

    /** The instance the behavior's module created, or null while a null receiver or argument leaves nothing to apply. @type {{ update: Function, dispose: Function } | null} */
    #instance = null;

    /** `ready` from the call that applied it on, and `disposed` once ended. @type {'ready' | 'disposed'} */
    #status = 'ready';

    /** The signal that disposes it when it aborts, which it lets go of once disposed otherwise, so a signal that outlives it keeps nothing of it. @type {AbortSignal | null} */
    #signal = null;
    #disposeOnAbort = () => this.dispose();

    /**
     * Applies the behavior, which has started once the constructor returns; a behavior that cannot start fails it, and leaves nothing running. A signal already aborted answers a behavior that is disposed and starts nothing.
     * @param {object} dependencies What the behavior applies, and what it works with.
     * @param {BehaviorCall} dependencies.call The behavior resolved against its first bindings.
     * @param {(bindings: unknown) => BehaviorCall} dependencies.prepare Resolves the behavior against other bindings, throwing a validation or an evaluation error where they cannot be used.
     * @param {(error: unknown) => void} dependencies.reportError The environment's error reporting, which a failure of disposing the behavior reaches, and one no `error` listener receives.
     * @param {AbortSignal} [dependencies.signal] Disposes the behavior when it aborts.
     */
    constructor({ call, prepare, reportError, signal }) {
        this.#prepare = prepare;
        this.#eventDispatcher = new EventDispatcher({ sender: this, description: 'A behavior', eventNames: ['error'], reportError });
        this.#declaration = call.declaration;

        if (signal?.aborted === true) {
            this.dispose();

            return;
        }

        this.#instance = call.args === null ? null : this.#start(call);
        this.#signal = signal ?? null;
        signal?.addEventListener('abort', this.#disposeOnAbort, { once: true });
    }

    /** `ready` from the call that applied it on, and `disposed` once ended. */
    get status() {
        return this.#status;
    }

    /**
     * Adds a listener of the behavior's `error` events, each a failure the behavior reports while it runs, and answers it.
     * @param {'error'} eventName
     * @param {(sender: Behavior, args: { error: unknown }) => unknown} handler
     * @param {{ signal?: AbortSignal }} [options]
     */
    subscribe(eventName, handler, options) {
        return this.#eventDispatcher.subscribe(eventName, handler, options);
    }

    /**
     * Replaces the bindings the behavior runs with, whole. The bindings are checked, the request resolved again and its receiver and arguments evaluated before anything changes; a failure there throws, and leaves the behavior running as it was.
     * Only then does the behavior's own update receive the new receiver and arguments; a failure there throws an evaluation error, and the behavior keeps what it last accepted.
     * @param {Record<string, unknown>} bindings The values supplied by parameter name.
     */
    update(bindings) {
        if (this.#status === 'disposed') {
            throw DomqlError.evaluation('A disposed behavior cannot be updated', {});
        }

        const call = this.#prepare(bindings);

        // A receiver of unknown type selects no declaration, so a behavior that has none yet takes the one its bindings select, and keeps it.
        if (call.declaration !== null && this.#declaration !== null && call.declaration !== this.#declaration) {
            throw DomqlError.validation(`These bindings select the behavior '${call.name}', which is another behavior; apply it as one of its own`, call.location);
        }

        this.#declaration = call.declaration ?? this.#declaration;

        if (call.args === null) {
            // A null receiver or argument leaves nothing to activate, so the instance ends.
            this.#disposeInstance();

            return;
        }

        if (this.#instance === null) {
            this.#instance = this.#start(call);

            return;
        }

        try {
            this.#instance.update(call.receiver, call.args);
        } catch (error) {
            throw DomqlError.evaluation(`The behavior '${call.name}' failed to update`, call.location, { cause: error });
        }
    }

    /** Ends the behavior: disposes the instance its module created, reporting a failure of that, stops its listeners, and marks the behavior disposed whatever happened. Disposing again does nothing. */
    dispose() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#status = 'disposed';
        this.#signal?.removeEventListener('abort', this.#disposeOnAbort);
        this.#disposeInstance();
        this.#eventDispatcher.dispose();
    }

    /** Has the behavior's module create its instance, which must answer how it is updated and disposed; a failure it reports while it runs is raised as an `error` event. */
    #start({ name, start, receiver, args, environment, location }) {
        let instance;

        try {
            instance = start(receiver, args, environment, { reportError: error => this.#eventDispatcher.raiseError(error) });
        } catch (error) {
            throw DomqlError.evaluation(`The behavior '${name}' failed to start`, location, { cause: error });
        }

        if (typeof instance?.update !== 'function' || typeof instance?.dispose !== 'function') {
            // What answered no way to update it is still let go of, where it offers a way to.
            try {
                instance?.dispose?.();
            } catch (error) {
                this.#eventDispatcher.reportError(error);
            }

            throw DomqlError.evaluation(`The behavior '${name}' started and answered no update and dispose`, location);
        }

        return instance;
    }

    #disposeInstance() {
        const instance = this.#instance;

        this.#instance = null;

        try {
            instance?.dispose();
        } catch (error) {
            this.#eventDispatcher.reportError(error);
        }
    }
}
