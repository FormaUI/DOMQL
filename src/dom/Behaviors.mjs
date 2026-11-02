/**
 * Behaviors — the continuous executions running in one instance of DOMQL, each by its module, its name, its owner and its receiver, so the commands its module declares reach the one running for their owner on their receiver
 */

/**
 * One running instance of a continuous execution: the module that declares it, its name, its owner, the receiver it runs on now, and what its implementation answered.
 * @typedef {{ module: string, name: string, owner: unknown, receiver: unknown, instance: object }} RunningBehavior
 */

export class Behaviors {
    /**
     * The instances running, by their module and name, then their owner, then their receiver, each receiver's in the order they started. An entry is made as an instance starts and released as the last of its receiver ends,
     * and a receiver's entry goes with its last instance, so nothing outlives what runs.
     * @type {Map<string, Map<unknown, Map<unknown, RunningBehavior[]>>>}
     */
    #running = new Map();

    /**
     * Adds an instance that has started, the latest of its owner on its receiver, and answers its entry, which moves it to another receiver and ends it.
     * @param {{ module: string, name: string, owner: unknown, receiver: unknown, instance: object }} started
     * @returns {RunningBehavior}
     */
    start({ module, name, owner, receiver, instance }) {
        const running = { module, name, owner, receiver, instance };

        this.#instancesAt(running, true).push(running);

        return running;
    }

    /** Moves a running instance to another receiver, where it becomes the latest of its owner. */
    move(running, receiver) {
        if (Object.is(running.receiver, receiver)) {
            return;
        }

        this.#remove(running);
        running.receiver = receiver;
        this.#instancesAt(running, true).push(running);
    }

    /** Ends a running instance, so nothing finds it again; ending it again does nothing. */
    end(running) {
        this.#remove(running);
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

    /** The instances running of the entry's behavior for its owner on its receiver, made where `creates` says so, and undefined otherwise where there are none. */
    #instancesAt({ module, name, owner, receiver }, creates = false) {
        const key = Behaviors.#keyOf(module, name);
        let owners = this.#running.get(key);

        if (owners === undefined) {
            if (!creates) {
                return undefined;
            }

            owners = new Map();
            this.#running.set(key, owners);
        }

        let receivers = owners.get(owner);

        if (receivers === undefined) {
            if (!creates) {
                return undefined;
            }

            receivers = new Map();
            owners.set(owner, receivers);
        }

        let instances = receivers.get(receiver);

        if (instances === undefined && creates) {
            instances = [];
            receivers.set(receiver, instances);
        }

        return instances;
    }

    /** Takes the entry out of its receiver's instances, releasing every map it leaves empty. */
    #remove(running) {
        const instances = this.#instancesAt(running);
        const index = instances?.indexOf(running) ?? -1;

        if (index === -1) {
            return;
        }

        instances.splice(index, 1);

        if (instances.length > 0) {
            return;
        }

        const key = Behaviors.#keyOf(running.module, running.name);
        const owners = this.#running.get(key);
        const receivers = owners.get(running.owner);

        receivers.delete(running.receiver);

        if (receivers.size === 0) {
            owners.delete(running.owner);

            if (owners.size === 0) {
                this.#running.delete(key);
            }
        }
    }

    /** The key of a module's behavior of a name; neither a module's name nor a member's holds a line feed. */
    static #keyOf(module, name) {
        return `${module}\n${name}`;
    }
}
