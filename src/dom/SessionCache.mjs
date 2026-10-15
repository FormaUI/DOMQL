/**
 * SessionCache — the sessions an evaluation holds, by the observation each was acquired for and then its target, so every call that observes the same holds one session and a later evaluation takes it over
 */

import { Observations } from './Observations.mjs';

/**
 * One entry of the cache: the request its session was acquired for, the session, null where the evaluation leaves the request unheld until it is pending, and the values the request was resolved with.
 * @typedef {{ request: { type: string, target: object, arguments: Record<string, any> }, session: import('./ObservationSession.mjs').ObservationSession | null, values: object }} CachedSession
 */

export class SessionCache {
    /** The content of each observation a declaration names, by the observation, which is frozen, so declarations that name the same observation hold its sessions together. @type {WeakMap<object, string>} */
    static #contents = new WeakMap();

    /** The cached sessions, by the content of their observation and then their target: one, or several where their arguments differ. @type {Map<string, Map<object, CachedSession | CachedSession[]>>} */
    #byObservation = new Map();

    /**
     * The cached session whose request the observation resolves to at the target with the arguments, which is not disposed and not among those excluded; null where none is. One left unheld is found only where none are excluded, by the evaluation that left it, since there is no session to take over.
     * @param {object} observation The observation a declaration names.
     * @param {Record<string, unknown>} args The call's arguments by parameter name.
     * @param {object} target What the observation would observe.
     * @param {Set<import('./ObservationSession.mjs').ObservationSession> | null} [excluded] Sessions that are no longer this holder's to give.
     * @returns {CachedSession | null}
     */
    find(observation, args, target, excluded = null) {
        const candidates = this.#byObservation.get(SessionCache.#contentOf(observation))?.get(target);

        if (candidates === undefined) {
            return null;
        }

        if (!Array.isArray(candidates)) {
            return SessionCache.#matches(candidates, observation, args, target, excluded) ? candidates : null;
        }

        for (const cachedSession of candidates) {
            if (SessionCache.#matches(cachedSession, observation, args, target, excluded)) {
                return cachedSession;
            }
        }

        return null;
    }

    /**
     * Keeps the cached session under the observation and its request's target.
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

    static #matches(cachedSession, observation, args, target, excluded) {
        const isAvailable = cachedSession.session === null ? excluded === null : !cachedSession.session.isDisposed && excluded?.has(cachedSession.session) !== true;

        return isAvailable && Observations.resolvesAt(observation, args, target, cachedSession.values);
    }
}
