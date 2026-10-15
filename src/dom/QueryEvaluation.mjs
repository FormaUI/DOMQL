/**
 * QueryEvaluation — one evaluation of a query: its result, what the result depends on, and the sessions that keep those dependencies observed
 */

/**
 * What one call of a member depended on: the member, where it stands in the query, and the observations that cover its changes, each resolved against the call.
 * @typedef {{ member: string, pointer: string, observations: { type: string, target: object, arguments: Record<string, any> }[] }} Dependency
 */

export class QueryEvaluation {
    #sessions;
    #owner;
    #isDisposed = false;

    /** The sessions the evaluation hands on to the one that replaces it, or null once it has, and for an evaluation none replaces. @type {import('./SessionCache.mjs').SessionCache | null} */
    #sessionCache;

    /**
     * @param {object} outcome What the evaluation produced.
     * @param {unknown} outcome.value The detached result, in which a member still waiting for its first sample answers null, or undefined where the evaluation produced none.
     * @param {import('../snapshots/SnapshotPatcher.mjs').Identities} outcome.identities The elements the result's lists were projected from.
     * @param {boolean} outcome.isPending Whether a maintained member the result reads is still waiting for its first sample.
     * @param {Dependency[] | null} outcome.dependencies What the evaluation read, including what it read before it failed, or null where its caller asked for no record.
     * @param {import('./SessionCache.mjs').CachedSession[]} outcome.sessions The sessions that hold the dependencies' observations, each of which it owns until a later evaluation takes it.
     * @param {object} outcome.owner What stands for the evaluation as the owner of its sessions.
     * @param {import('./SessionCache.mjs').SessionCache | null} [outcome.sessionCache] The sessions it hands on to the evaluation that replaces it.
     * @param {Error | null} outcome.error The failure that ended the evaluation, or null.
     */
    constructor({ value, identities = null, isPending, dependencies, sessions, owner, sessionCache = null, error }) {
        this.value = value;
        this.identities = identities;
        this.isPending = isPending;
        this.dependencies = dependencies === null ? null : Object.freeze(dependencies);
        this.error = error;
        this.#sessions = sessions;
        this.#owner = owner;
        this.#sessionCache = sessionCache;
    }

    /** Whether the evaluation has let go of its observations. */
    get isDisposed() {
        return this.#isDisposed;
    }

    /**
     * Hands its sessions on to the evaluation that replaces it, which takes each it observes again; null where it has none to hand on, having handed them on already or let them go.
     * @returns {import('./SessionCache.mjs').SessionCache | null}
     */
    handOverSessionCache() {
        const sessionCache = this.#isDisposed ? null : this.#sessionCache;

        this.#sessionCache = null;

        return sessionCache;
    }

    /**
     * Disposes every session the evaluation still owns, those no later evaluation took, so the observations only it needed stop. Disposing again does nothing.
     * Every session is disposed even where one fails to be, and the first failure is thrown once all of them have been.
     */
    dispose() {
        if (this.#isDisposed) {
            return;
        }

        this.#isDisposed = true;

        let failure = null;

        for (const cachedSession of this.#sessions) {
            if (cachedSession.owner !== this.#owner) {
                continue;
            }

            try {
                cachedSession.session.dispose();
            } catch (error) {
                failure ??= { error };
            }
        }

        if (failure !== null) {
            throw failure.error;
        }
    }
}
