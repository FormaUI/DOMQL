/**
 * QueryEvaluation — one evaluation of a query: its result, what the result depends on, and the sessions that keep those dependencies observed
 */

/**
 * What one call of a member depended on: the member, where it stands in the query, and the observations that cover its changes, each resolved against the call.
 * @typedef {{ member: string, pointer: string, observations: { type: string, target: object, arguments: Record<string, any> }[] }} Dependency
 */

/**
 * A session an evaluation holds that a later one may take over: the observation's place among those its call observes, the request it was acquired for, the session, and the values the request was resolved with.
 * @typedef {{ place: number | string, request: { type: string, target: object, arguments: Record<string, any> }, session: import('./ObservationSession.mjs').ObservationSession, values: object }} HeldSession
 */

export class QueryEvaluation {
    #sessions;
    #isDisposed = false;

    /** The sessions a later evaluation may take over, by the node whose call acquired each and then its receiver, or null for an evaluation none replaces. @type {Map<object, Map<unknown, HeldSession[]>> | null} */
    #heldSessions;

    /** The sessions a later evaluation took over, which are its own from then on. @type {Set<import('./ObservationSession.mjs').ObservationSession>} */
    #takenOver = new Set();

    /**
     * @param {object} outcome What the evaluation produced.
     * @param {unknown} outcome.value The detached result, in which a member still waiting for its first sample answers null, or undefined where the evaluation produced none.
     * @param {import('../snapshots/SnapshotPatcher.mjs').Identities} outcome.identities The elements the result's lists were projected from.
     * @param {boolean} outcome.isPending Whether a maintained member the result reads is still waiting for its first sample.
     * @param {Dependency[]} outcome.dependencies What the evaluation read, including what it read before it failed.
     * @param {import('./ObservationSession.mjs').ObservationSession[]} outcome.sessions The sessions that hold the dependencies' observations.
     * @param {Map<object, Map<unknown, HeldSession[]>> | null} [outcome.heldSessions] The sessions a later evaluation may take over, by node and receiver.
     * @param {Error | null} outcome.error The failure that ended the evaluation, or null.
     */
    constructor({ value, identities = null, isPending, dependencies, sessions, heldSessions = null, error }) {
        this.value = value;
        this.identities = identities;
        this.isPending = isPending;
        this.dependencies = Object.freeze(dependencies);
        this.error = error;
        this.#sessions = sessions;
        this.#heldSessions = heldSessions;
    }

    /** Whether the evaluation has let go of its observations. */
    get isDisposed() {
        return this.#isDisposed;
    }

    /**
     * The session it holds for the observation at the place among those the node's call observes, for the receiver, whose values `accepts` finds still the call's and which is not disposed; it becomes the later evaluation's own. Null where it holds none.
     * @param {object} node The node whose call observes.
     * @param {number | string} place The observation's place among those the call observes.
     * @param {unknown} receiver The call's receiver.
     * @param {(values: object) => boolean} accepts Whether the values the session's request was resolved with are still the call's.
     * @returns {HeldSession | null}
     */
    takeOver(node, place, receiver, accepts) {
        const candidates = this.#isDisposed ? undefined : this.#heldSessions?.get(node)?.get(receiver);

        if (candidates !== undefined) {
            for (const held of candidates) {
                if (held.place === place && !held.session.isDisposed && !this.#takenOver.has(held.session) && accepts(held.values)) {
                    this.#takenOver.add(held.session);

                    return held;
                }
            }
        }

        return null;
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
