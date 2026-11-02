/**
 * ExecutionHandle — one continuous execution run for its owner: it starts the instance its implementation creates, keeps it where its module's commands find it, delivers the occurrences it hands on, replaces the bindings
 * it runs with when updated, raises the failures it reports while it runs, and disposes it
 */

import { NexoError } from '@formaui-net/nexo';
import { EventDispatcher } from './EventDispatcher.mjs';

/**
 * A continuous execution prepared against one binding set: its declaration, null while a receiver of unknown type has selected none, its name, the module that declares it and the event sources its occurrences are
 * delivered to, each null with its declaration, the implementation that starts it, the receiver and arguments it is started or updated with, which are null where the preparation was skipped, the environment, and where it
 * stands.
 * @typedef {{ declaration: object | null, name: string, module: string | null, sources: ReadonlySet<string> | null, start: Function | undefined, receiver: unknown, args: Record<string, unknown> | null, environment: object, location: object }} PreparedExecution
 */

export class ExecutionHandle {
    #prepare;
    #eventDispatcher;
    #behaviors;
    #owner;

    /** Where the running instance is kept for its module's commands, null while none runs. @type {import('./Behaviors.mjs').RunningBehavior | null} */
    #running = null;
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
     * @param {import('./Behaviors.mjs').Behaviors} dependencies.behaviors Where the running instance is kept for its owner on its receiver, which its module's commands find it in.
     * @param {unknown} dependencies.owner The owner the execution runs for.
     * @param {AbortSignal} [dependencies.signal] Disposes the execution when it aborts.
     */
    constructor({ execution, prepare, reportError, behaviors, owner, signal }) {
        this.#prepare = prepare;
        this.#behaviors = behaviors;
        this.#owner = owner;
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
            throw NexoError.evaluation('DOMQL5005', 'A disposed execution cannot be updated', {});
        }

        const execution = this.#prepare(bindings);

        // A receiver of unknown type selects no declaration, so an execution that has none yet takes the one its bindings select, and keeps it.
        if (execution.declaration !== null && this.#declaration !== null && execution.declaration !== this.#declaration) {
            throw NexoError.validation('DOMQL3006', `These bindings select the execution '${execution.name}', which is another execution; run it as one of its own`, execution.location);
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
            throw NexoError.evaluation('DOMQL5006', `The execution '${execution.name}' failed to update`, execution.location, { cause: error });
        }

        // An update that moves the execution to another receiver moves it there for its commands and its occurrences too, and the state it offers may have changed.
        this.#behaviors.update(this.#running, execution.receiver);
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

    /**
     * Has the execution's implementation create its instance, which must answer how it is updated and disposed, and keeps it for its owner on its receiver, the latest there; a failure it reports while it runs is raised as
     * an `error` event, and each occurrence it hands `deliver`, from its start on, is delivered to the subscriptions of its source listening for its owner on its receiver.
     */
    #start({ name, module, sources, start, receiver, args, environment, location }) {
        const running = { module, name, owner: this.#owner, receiver, instance: null, hasEnded: false };
        let instance;

        try {
            instance = start({
                receiver,
                args,
                env: environment,
                reportError: error => this.#eventDispatcher.raiseError(error),
                deliver: (source, value) => this.#deliver(running, sources, location, source, value),
                notify: () => this.#behaviors.notify(running),
            });
        } catch (error) {
            running.hasEnded = true;

            throw NexoError.evaluation('DOMQL5007', `The execution '${name}' failed to start`, location, { cause: error });
        }

        if (typeof instance?.update !== 'function' || typeof instance?.dispose !== 'function') {
            running.hasEnded = true;

            // What answered no way to update it is still let go of, where it offers a way to.
            try {
                instance?.dispose?.();
            } catch (error) {
                this.#eventDispatcher.reportError(error);
            }

            throw NexoError.evaluation('DOMQL5008', `The execution '${name}' started and answered no update and dispose`, location);
        }

        running.instance = instance;
        this.#behaviors.start(running);
        this.#running = running;

        return instance;
    }

    /**
     * Delivers an occurrence the running instance hands on to the subscriptions of its source, synchronously, and answers a promise that settles once each has applied it. It never throws into the code that calls it: an
     * instance that has ended delivers nothing and rejects, and a source its behavior has none of rejects and is raised as an `error` event, since it is the module's mistake. The promise is handled, so a behavior that
     * leaves it is never reported for it.
     */
    #deliver(running, sources, location, source, value) {
        let delivered;

        try {
            if (running.hasEnded) {
                delivered = Promise.reject(NexoError.evaluation('DOMQL5018', `The execution '${running.name}' has ended, and delivers nothing more`, location));
            } else if (!sources.has(source)) {
                const error = NexoError.evaluation('DOMQL5019', `'${String(source)}' is no event source of '${running.name}', whose occurrences ${sources.size === 0 ? 'no source of its module delivers' : `are delivered to ${[...sources].map(name => `'${name}'`).join(', ')}`}`, location);

                this.#eventDispatcher.raiseError(error);
                delivered = Promise.reject(error);
            } else {
                delivered = this.#behaviors.deliver(running, source, value, location);
            }
        } catch (error) {
            delivered = Promise.reject(error);
        }

        delivered.catch(() => {});

        return delivered;
    }

    /** Ends the running instance: no command finds it from then on, and its implementation's own disposal runs, a failure of which is reported. */
    #disposeInstance() {
        const instance = this.#instance;

        this.#instance = null;

        // An instance that has ended delivers nothing more, its own disposal included.
        if (this.#running !== null) {
            this.#behaviors.end(this.#running);
            this.#running = null;
        }

        try {
            instance?.dispose();
        } catch (error) {
            this.#eventDispatcher.reportError(error);
        }
    }
}
