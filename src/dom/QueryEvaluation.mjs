/**
 * QueryEvaluation — one evaluation of a query: its result, what the result depends on, and the sessions that keep those dependencies observed
 */

/**
 * What one call of a member depended on: the member, where it stands in the query, and the observations that cover its changes, each resolved against the call.
 * @typedef {{ member: string, pointer: string, observations: { type: string, target: object, arguments: Record<string, any> }[] }} Dependency
 */

export class QueryEvaluation {
    #sessions;
    #isDisposed = false;

    /** The sessions a later evaluation may take over, or null for an evaluation none replaces. @type {import('./SessionCache.mjs').SessionCache | null} */
    #sessionCache;

    /** The sessions a later evaluation took over, which are its own from then on. @type {Set<import('./ObservationSession.mjs').ObservationSession>} */
    #takenOver = new Set();

    /**
     * @param {object} outcome What the evaluation produced.
     * @param {unknown} outcome.value The detached result, in which a member still waiting for its first sample answers null, or undefined where the evaluation produced none.
     * @param {import('../snapshots/SnapshotPatcher.mjs').Identities} outcome.identities The elements the result's lists were projected from.
     * @param {boolean} outcome.isPending Whether a maintained member the result reads is still waiting for its first sample.
     * @param {Dependency[] | null} outcome.dependencies What the evaluation read, including what it read before it failed, or null where its caller asked for no record.
     * @param {import('./ObservationSession.mjs').ObservationSession[]} outcome.sessions The sessions that hold the dependencies' observations.
     * @param {import('./SessionCache.mjs').SessionCache | null} [outcome.sessionCache] The sessions a later evaluation may take over.
     * @param {Error | null} outcome.error The failure that ended the evaluation, or null.
     */
    constructor({ value, identities = null, isPending, dependencies, sessions, sessionCache = null, error }) {
        this.value = value;
        this.identities = identities;
        this.isPending = isPending;
        this.dependencies = dependencies === null ? null : Object.freeze(dependencies);
        this.error = error;
        this.#sessions = sessions;
        this.#sessionCache = sessionCache;
    }

    /** Whether the evaluation has let go of its observations. */
    get isDisposed() {
        return this.#isDisposed;
    }

    /**
     * The session it holds whose request the observation resolves to at the target with the arguments, and which is not disposed; it becomes the later evaluation's own. Null where it holds none.
     * @param {object} observation The observation a declaration names.
     * @param {Record<string, unknown>} args The call's arguments by parameter name.
     * @param {object} target What the observation would observe now.
     * @returns {import('./SessionCache.mjs').CachedSession | null}
     */
    takeOver(observation, args, target) {
        const cachedSession = this.#isDisposed ? null : this.#sessionCache?.find(observation, args, target, this.#takenOver) ?? null;

        if (cachedSession !== null) {
            this.#takenOver.add(cachedSession.session);
        }

        return cachedSession;
    }

    /**
     * Disposes every session the evaluation holds and no later one took over, so the observations only it needed stop. Disposing again does nothing.
     * Every session is disposed even where one fails to be, and the first failure is thrown once all of them have been.
     */
    dispose() {
        if (this.#isDisposed) {
            return;
        }

        this.#isDisposed = true;

        let failure = null;

        for (const session of this.#sessions) {
            if (this.#takenOver.has(session)) {
                continue;
            }

            try {
                session.dispose();
            } catch (error) {
                failure ??= { error };
            }
        }

        if (failure !== null) {
            throw failure.error;
        }
    }
}
