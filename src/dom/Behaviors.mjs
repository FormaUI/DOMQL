/**
 * Behaviors — the continuous executions running in one instance of DOMQL, each by its module, its name, its owner and its receiver, so the commands and the members its module declares reach the one running for their owner
 * on their receiver; the subscriptions to its occurrences, which hear every instance of it running for their owner on their receiver; and the observations of the state it offers
 */

import { NexoError } from '@formaui-net/nexo';

/**
 * One running instance of a continuous execution: the module that declares it, its name, its owner, the receiver it runs on now, what its implementation answered, null while it starts, and whether it has ended.
 * @typedef {{ module: string, name: string, owner: unknown, receiver: unknown, instance: object | null, hasEnded: boolean }} RunningBehavior
 */

/** What hears an occurrence: it projects the value it is handed and calls its subscription's handler, and answers a promise that settles once the handler has applied it. @typedef {(value: unknown) => Promise<void>} OccurrenceReceiver */

export class Behaviors {
    /**
     * The instances running, by their module and name, then their owner, then their receiver, each receiver's in the order they started. An entry is made as an instance starts and released as the last of its receiver ends,
     * and a receiver's entry goes with its last instance, so nothing outlives what runs.
     * @type {Map<string, Map<unknown, Map<unknown, RunningBehavior[]>>>}
     */
    #running = new Map();

    /**
     * The receivers of each event source of a behavior, by the module, the behavior and the source, then their owner, then their receiver, each receiver's in the order they subscribed. An entry is made as a subscription
     * starts and released as the last of its receiver ends, so a subscription outlives no listening of its own.
     * @type {Map<string, Map<unknown, Map<unknown, OccurrenceReceiver[]>>>}
     */
    #listening = new Map();

    /**
     * The rejection an occurrence no subscription hears answers, by the running instance and the source it is delivered to, `DOMQL5017` located at the behavior: made, handled, as the first such occurrence is
     * delivered, and answered for each after it, since what it says, the source, the behavior and where it stands, is the same for each. It is let go of as a subscription to the source starts listening for the
     * instance's owner on the receiver it runs on, and as the instance ends, after which an occurrence rejects otherwise.
     * @type {WeakMap<RunningBehavior, Map<string, Promise<never>>>}
     */
    #unheard = new WeakMap();

    /**
     * What each observation of the state behaviors offer calls, by the behavior's name and then the receiver it observes, so a behavior of that name starting, updated, moving or ending there, or saying the state it offers
     * changed, tells it. An entry is made as an observation starts and released as the last of its receiver stops.
     * @type {Map<string, Map<unknown, (() => void)[]>>}
     */
    #observing = new Map();

    /**
     * Adds an instance that has started, the latest of its owner on its receiver, which tells the observations of its state there.
     * @param {RunningBehavior} running
     */
    start(running) {
        Behaviors.#entriesAt(this.#running, Behaviors.#keyOf(running.module, running.name), running.owner, running.receiver, true).push(running);
        this.#tell(running.name, running.receiver);
    }

    /**
     * Tells the observations of the state a running instance offers that an update gave it other arguments, moving it first where the update gave it another receiver, where it becomes the latest of its owner and where its
     * occurrences go from then on; the observations of the receiver it left are told too.
     */
    update(running, receiver) {
        if (Object.is(running.receiver, receiver)) {
            this.#tell(running.name, receiver);

            return;
        }

        this.#remove(running);
        this.#tell(running.name, running.receiver);
        running.receiver = receiver;
        this.start(running);
    }

    /** Ends a running instance, so nothing finds it again and it delivers nothing more, and tells the observations of its state; ending it again does nothing. */
    end(running) {
        if (running.hasEnded) {
            return;
        }

        running.hasEnded = true;
        this.#remove(running);
        this.#unheard.delete(running);
        this.#tell(running.name, running.receiver);
    }

    /** Tells the observations of the state a running instance offers that it may have changed, as the instance says; an instance that has ended tells nothing. */
    notify(running) {
        if (!running.hasEnded && running.instance !== null) {
            this.#tell(running.name, running.receiver);
        }
    }

    /**
     * Observes the state the behaviors of a name offer on the receiver, whichever module and owner they belong to, calling `notify` as one starts, is updated, moves or ends there, or says what it offers changed; answers
     * what stops it.
     * @param {string} name The behavior's name.
     * @param {unknown} receiver What it runs on.
     * @param {() => void} notify
     * @returns {{ stop: () => void }}
     */
    observe(name, receiver, notify) {
        let receivers = this.#observing.get(name);

        if (receivers === undefined) {
            receivers = new Map();
            this.#observing.set(name, receivers);
        }

        let notifiers = receivers.get(receiver);

        if (notifiers === undefined) {
            notifiers = [];
            receivers.set(receiver, notifiers);
        }

        notifiers.push(notify);

        return {
            stop: () => {
                const index = notifiers.indexOf(notify);

                if (index === -1) {
                    return;
                }

                notifiers.splice(index, 1);

                if (notifiers.length === 0 && receivers.get(receiver) === notifiers) {
                    receivers.delete(receiver);

                    if (receivers.size === 0 && this.#observing.get(name) === receivers) {
                        this.#observing.delete(name);
                    }
                }
            },
        };
    }

    /** Calls every observation of the state the behaviors of the name offer on the receiver, each as it was when this began. */
    #tell(name, receiver) {
        const notifiers = this.#observing.get(name)?.get(receiver);

        if (notifiers !== undefined) {
            for (const notify of [...notifiers]) {
                notify();
            }
        }
    }

    /**
     * The instance of the behavior a module declares that runs for the owner on the receiver, the latest to start or to move there where several do, or null where none does.
     * @param {string} module The module that declares it.
     * @param {string} name Its name.
     * @param {unknown} owner The owner it runs for.
     * @param {unknown} receiver What it runs on, undefined for a module member.
     */
    find(module, name, owner, receiver) {
        return this.#running.get(Behaviors.#keyOf(module, name))?.get(owner)?.get(receiver)?.at(-1)?.instance ?? null;
    }

    /**
     * Listens to an event source of a behavior for the owner on the receiver, whichever instance of it runs there, now or later, and answers what stops the listening.
     * @param {{ module: string, behavior: string, source: string, owner: unknown, receiver: unknown }} source
     * @param {OccurrenceReceiver} receive
     * @returns {{ stop: () => void }}
     */
    listen({ module, behavior, source, owner, receiver }, receive) {
        const key = Behaviors.#keyOf(module, behavior, source);
        const receivers = Behaviors.#entriesAt(this.#listening, key, owner, receiver, true);

        receivers.push(receive);

        // The instances running for the owner on the receiver are heard from now on, so the rejection kept for an occurrence no subscription heard goes.
        for (const running of Behaviors.#entriesAt(this.#running, Behaviors.#keyOf(module, behavior), owner, receiver) ?? []) {
            this.#unheard.get(running)?.delete(source);
        }

        return {
            stop: () => {
                const index = receivers.indexOf(receive);

                if (index !== -1) {
                    receivers.splice(index, 1);
                    Behaviors.#prune(this.#listening, key, owner, receiver);
                }
            },
        };
    }

    /**
     * Hands an occurrence of the running instance to every subscription of its source listening for its owner on its receiver, in the order they subscribed, each projecting it and calling its handler before this returns,
     * and answers a promise that settles once each has applied it, or rejects with the first failure, and with `DOMQL5017` where none listens.
     * @param {RunningBehavior} running The instance delivering it.
     * @param {string} source The event source it is an occurrence of.
     * @param {unknown} value The occurrence.
     * @param {object} location Where the behavior stands, which a delivery no subscription hears is located at.
     * @returns {Promise<void>}
     */
    deliver(running, source, value, location) {
        const receivers = this.#listening.get(Behaviors.#keyOf(running.module, running.name, source))?.get(running.owner)?.get(running.receiver);

        if (receivers === undefined) {
            return this.#unheardBy(running, source, location);
        }

        // A handler that subscribes or stops another as it receives the occurrence changes who hears the next, never this one.
        return Promise.all([...receivers].map(receive => receive(value))).then(() => undefined);
    }

    /** The rejection of an occurrence of the running instance's source that no subscription hears, made at the first and answered until a subscription to the source listens for it. */
    #unheardBy(running, source, location) {
        let rejections = this.#unheard.get(running);

        if (rejections === undefined) {
            rejections = new Map();
            this.#unheard.set(running, rejections);
        }

        let rejected = rejections.get(source);

        if (rejected === undefined) {
            rejected = Promise.reject(NexoError.evaluation('DOMQL5017', `No subscription of '${source}' listens for this owner on this receiver, so no subscriber applied the occurrence '${running.name}' delivered`, location));

            // Handled as it is made, so a behavior that leaves it is never reported for it.
            rejected.catch(() => {});
            rejections.set(source, rejected);
        }

        return rejected;
    }

    /** Takes the entry out of its receiver's instances, releasing every map it leaves empty. */
    #remove(running) {
        const key = Behaviors.#keyOf(running.module, running.name);
        const instances = this.#running.get(key)?.get(running.owner)?.get(running.receiver);
        const index = instances?.indexOf(running) ?? -1;

        if (index !== -1) {
            instances.splice(index, 1);
            Behaviors.#prune(this.#running, key, running.owner, running.receiver);
        }
    }

    /** The entries kept under the key, the owner and the receiver, made where `creates` says so, and undefined otherwise where there are none. */
    static #entriesAt(root, key, owner, receiver, creates = false) {
        let owners = root.get(key);

        if (owners === undefined) {
            if (!creates) {
                return undefined;
            }

            owners = new Map();
            root.set(key, owners);
        }

        let receivers = owners.get(owner);

        if (receivers === undefined) {
            if (!creates) {
                return undefined;
            }

            receivers = new Map();
            owners.set(owner, receivers);
        }

        let entries = receivers.get(receiver);

        if (entries === undefined && creates) {
            entries = [];
            receivers.set(receiver, entries);
        }

        return entries;
    }

    /** Releases the entries kept under the key, the owner and the receiver where they are empty, and every map that leaves empty. */
    static #prune(root, key, owner, receiver) {
        const owners = root.get(key);
        const receivers = owners?.get(owner);

        if (receivers === undefined || receivers.get(receiver)?.length !== 0) {
            return;
        }

        receivers.delete(receiver);

        if (receivers.size === 0) {
            owners.delete(owner);

            if (owners.size === 0) {
                root.delete(key);
            }
        }
    }

    /** The key of a module's behavior, or of one of its event sources; no module's name, and no member's, holds a line feed. */
    static #keyOf(...names) {
        return names.join('\n');
    }
}
