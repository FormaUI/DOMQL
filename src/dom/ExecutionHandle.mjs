/**
 * ExecutionHandle — one continuous execution run: it starts the instance its implementation creates, replaces the bindings it runs with when updated, raises the failures it reports while it runs, and disposes it
 */

import { LexicaError } from '@formaui/lexica';
import { EventDispatcher } from './EventDispatcher.mjs';

/**
 * A continuous execution prepared against one binding set: its declaration, null while a receiver of unknown type has selected none, its name, the implementation that starts it, the receiver and arguments it is started or updated with,
 * which are null where the preparation was skipped, the environment, and where it stands.
 * @typedef {{ declaration: object | null, name: string, start: Function | undefined, receiver: unknown, args: Record<string, unknown> | null, environment: object, location: object }} PreparedExecution
 */

export class ExecutionHandle {
    #prepare;
    #eventDispatcher;
    /** The declaration of the execution, or null while a receiver of unknown type has selected none. */
    #declaration;

    /** The instance the execution's implementation created, or null while a skipped preparation leaves nothing to start. @type {{ update: Function, dispose: Function } | null} */
    #instance = null;

    /** `ready` from the call that ran it on, and `disposed` once ended. @type {'ready' | 'disposed'} */
    #status = 'ready';

    /** The signal that disposes it when it aborts, which it lets go of once disposed otherwise, so a signal that outlives it keeps nothing of it. @type {AbortSignal | null} */
    #signal = null;
    #disposeOnAbort = () => this.dispose();

    /**
     * Runs the execution, which has started once the constructor returns; an execution that cannot start fails it, and leaves nothing running. A signal already aborted answers a handle that is disposed and starts nothing.
     * @param {object} dependencies What the handle runs, and what it works with.
     * @param {PreparedExecution} dependencies.execution The execution prepared against its first bindings.
     * @param {(bindings: unknown) => PreparedExecution} dependencies.prepare Prepares the execution against other bindings, throwing a validation or an evaluation error where they cannot be used.
     * @param {(error: unknown) => void} dependencies.reportError The environment's error reporting, which a failure of disposing the execution reaches, and one no `error` listener receives.
     * @param {AbortSignal} [dependencies.signal] Disposes the execution when it aborts.
     */
    constructor({ execution, prepare, reportError, signal }) {
        this.#prepare = prepare;
        this.#eventDispatcher = new EventDispatcher({ sender: this, description: 'An execution', eventNames: ['error'], reportError });
        this.#declaration = execution.declaration;

        if (signal?.aborted === true) {
            this.dispose();

            return;
        }

        this.#instance = execution.args === null ? null : this.#start(execution);
        this.#signal = signal ?? null;
        signal?.addEventListener('abort', this.#disposeOnAbort, { once: true });
    }

    /** `ready` from the call that ran it on, and `disposed` once ended. */
    get status() {
        return this.#status;
    }

    /**
     * Adds a listener of the execution's `error` events, each a failure it reports while it runs, and answers it.
     * @param {'error'} eventName
     * @param {(sender: ExecutionHandle, args: { error: unknown }) => unknown} handler
     * @param {{ signal?: AbortSignal }} [options]
     */
    subscribe(eventName, handler, options) {
        return this.#eventDispatcher.subscribe(eventName, handler, options);
    }

    /**
     * Replaces the bindings the execution runs with, whole. The bindings are checked, the request resolved again and its receiver and arguments prepared before anything changes; a failure there throws, and leaves the execution running
     * as it was. Only then does the execution's own update receive the new receiver and arguments; a failure there throws an evaluation error, and the execution keeps what it last accepted.
     * @param {Record<string, unknown>} bindings The values supplied by parameter name.
     */
    update(bindings) {
        if (this.#status === 'disposed') {
            throw LexicaError.evaluation('A disposed execution cannot be updated', {});
        }

        const execution = this.#prepare(bindings);

        // A receiver of unknown type selects no declaration, so an execution that has none yet takes the one its bindings select, and keeps it.
        if (execution.declaration !== null && this.#declaration !== null && execution.declaration !== this.#declaration) {
            throw LexicaError.validation(`These bindings select the execution '${execution.name}', which is another execution; run it as one of its own`, execution.location);
        }

        this.#declaration = execution.declaration ?? this.#declaration;

        if (execution.args === null) {
            // A skipped preparation leaves nothing to run, so the instance ends.
            this.#disposeInstance();

            return;
        }

        if (this.#instance === null) {
            this.#instance = this.#start(execution);

            return;
        }

        try {
            this.#instance.update(execution.receiver, execution.args);
        } catch (error) {
            throw LexicaError.evaluation(`The execution '${execution.name}' failed to update`, execution.location, { cause: error });
        }
    }

    /** Ends the execution: disposes the instance its implementation created, reporting a failure of that, stops its listeners, and marks the handle disposed whatever happened. Disposing again does nothing. */
    dispose() {
        if (this.#status === 'disposed') {
            return;
        }

        this.#status = 'disposed';
        this.#signal?.removeEventListener('abort', this.#disposeOnAbort);
        this.#disposeInstance();
        this.#eventDispatcher.dispose();
    }

    /** Has the execution's implementation create its instance, which must answer how it is updated and disposed; a failure it reports while it runs is raised as an `error` event. */
    #start({ name, start, receiver, args, environment, location }) {
        let instance;

        try {
            instance = start({ receiver, args, env: environment, reportError: error => this.#eventDispatcher.raiseError(error) });
        } catch (error) {
            throw LexicaError.evaluation(`The execution '${name}' failed to start`, location, { cause: error });
        }

        if (typeof instance?.update !== 'function' || typeof instance?.dispose !== 'function') {
            // What answered no way to update it is still let go of, where it offers a way to.
            try {
                instance?.dispose?.();
            } catch (error) {
                this.#eventDispatcher.reportError(error);
            }

            throw LexicaError.evaluation(`The execution '${name}' started and answered no update and dispose`, location);
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
