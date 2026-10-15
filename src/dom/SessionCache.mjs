/**
 * SessionCache — the sessions a watch's evaluations hold, by the observation each was acquired for and then its target, so every call that observes the same holds one session and each evaluation carries the cache on to the next
 */

import { Observations } from './Observations.mjs';

/**
 * One entry of the cache: the request its session was acquired for, the session, null where the evaluation leaves the request unheld until it is pending, the values the request was resolved with,
 * and the evaluation that owns the session, which disposes it unless a later evaluation took it.
 * @typedef {{ request: { type: string, target: object, arguments: Record<string, any> }, session: import('./ObservationSession.mjs').ObservationSession | null, values: object, owner: object }} CachedSession
 */

export class SessionCache {
    /** The content of each observation a declaration names, by the observation, which is frozen, so declarations that name the same observation hold its sessions together. @type {WeakMap<object, string>} */
    static #contents = new WeakMap();

    /** The cached sessions, by the content of their observation and then their target: one, or several where their arguments differ. @type {Map<string, Map<object, CachedSession | CachedSession[]>>} */
    #byObservation = new Map();

    /** How many cached sessions there are. */
    #size = 0;

    /** How many of them the evaluation using the cache owns, counted as it takes each. */
    #owned = 0;

    /** How many sessions it holds, those of every evaluation of the watch until the next evaluation takes out the ones no longer held. */
    get size() {
        return this.#size;
    }

    /**
     * Readies the cache for an evaluation, taking out the cached sessions no longer held: those the last evaluation did not reach and their owner has since let go, which there can be only
     * where it owned fewer than the cache holds. One a watch's last successful evaluation still holds after a failed one stays, for the next to take.
     */
    beginEvaluation() {
        if (this.#owned < this.#size) {
            this.#removeEnded();
        }

        this.#owned = 0;
    }

    /**
     * The cached session whose request the observation resolves to at the target with the arguments, and which is still held, or left unheld by the owner given; null where none is.
     * @param {object} observation The observation a declaration names.
     * @param {Record<string, unknown>} args The call's arguments by parameter name.
     * @param {object} target What the observation would observe.
     * @param {object} owner The evaluation looking, whose sessions left unheld it alone finds.
     * @returns {CachedSession | null}
     */
    find(observation, args, target, owner) {
        const candidates = this.#byObservation.get(SessionCache.#contentOf(observation))?.get(target);

        if (candidates === undefined) {
            return null;
        }

        if (!Array.isArray(candidates)) {
            return SessionCache.#matches(candidates, observation, args, target, owner) ? candidates : null;
        }

        for (const cachedSession of candidates) {
            if (SessionCache.#matches(cachedSession, observation, args, target, owner)) {
                return cachedSession;
            }
        }

        return null;
    }

    /**
     * Makes the cached session the owner's, answering whether it was another evaluation's until now.
     * @param {CachedSession} cachedSession A cached session `find` answered.
     * @param {object} owner The evaluation that reached it.
     */
    claim(cachedSession, owner) {
        if (cachedSession.owner === owner) {
            return false;
        }

        cachedSession.owner = owner;
        this.#owned++;

        return true;
    }

    /**
     * Keeps a session its owner has just acquired, under the observation and its request's target.
     * @param {object} observation The observation a declaration names.
     * @param {CachedSession} cachedSession The session and what it was acquired for.
     */
    keep(observation, cachedSession) {
        const content = SessionCache.#contentOf(observation);
        let byTarget = this.#byObservation.get(content);

        if (byTarget === undefined) {
            byTarget = new Map();
            this.#byObservation.set(content, byTarget);
        }

        const { target } = cachedSession.request;
        const candidates = byTarget.get(target);

        if (candidates === undefined) {
            byTarget.set(target, cachedSession);
        } else if (Array.isArray(candidates)) {
            candidates.push(cachedSession);
        } else {
            byTarget.set(target, [candidates, cachedSession]);
        }

        this.#size++;
        this.#owned++;
    }

    /** Takes out every cached session that is no longer held. */
    #removeEnded() {
        for (const byTarget of this.#byObservation.values()) {
            for (const [target, candidates] of byTarget) {
                const held = (Array.isArray(candidates) ? candidates : [candidates]).filter(SessionCache.#isHeld);

                this.#size -= (Array.isArray(candidates) ? candidates.length : 1) - held.length;

                if (held.length === 0) {
                    byTarget.delete(target);
                } else {
                    byTarget.set(target, held.length === 1 ? held[0] : held);
                }
            }
        }
    }

    /** The observation's content, written once for each observation. */
    static #contentOf(observation) {
        let content = SessionCache.#contents.get(observation);

        if (content === undefined) {
            content = JSON.stringify(observation);
            SessionCache.#contents.set(observation, content);
        }

        return content;
    }

    static #isHeld(cachedSession) {
        return cachedSession.session !== null && !cachedSession.session.isDisposed;
    }

    static #matches(cachedSession, observation, args, target, owner) {
        const isAvailable = cachedSession.session === null ? cachedSession.owner === owner : !cachedSession.session.isDisposed;

        return isAvailable && Observations.resolvesAt(observation, args, target, cachedSession.values);
    }
}
