import { describe, it, expect } from 'vitest';
import { SessionCache } from '#domql/dom/SessionCache.mjs';

describe('SessionCache', () => {
    const observation = Object.freeze({ type: 'probe', of: 'receiver' });

    /** A session on the target, owned by the owner, kept in the cache as its owner acquires it. */
    const keep = (sessionCache, target, owner) => {
        const cachedSession = { request: { type: 'probe', target, arguments: {} }, session: { isDisposed: false }, values: { type: 'probe', target, arguments: {} }, owner };

        sessionCache.keep(observation, cachedSession);

        return cachedSession;
    };

    it('finds a session wherever the same observation is made of the same target again', () => {
        const sessionCache = new SessionCache();
        const owner = {};
        const target = {};
        const cachedSession = keep(sessionCache, target, owner);

        expect(sessionCache.find(observation, {}, target, owner)).toBe(cachedSession);
        expect(sessionCache.find(observation, {}, {}, owner)).toBeNull();
    });

    it('gives a session to the evaluation that reaches it, once', () => {
        const sessionCache = new SessionCache();
        const cachedSession = keep(sessionCache, {}, {});
        const next = {};

        sessionCache.beginEvaluation();

        expect(sessionCache.claim(cachedSession, next)).toBe(true);
        expect(sessionCache.claim(cachedSession, next)).toBe(false);
        expect(cachedSession.owner).toBe(next);
    });

    it('lets go of the sessions no evaluation reached once their owner has let them go, and keeps those still held', () => {
        const sessionCache = new SessionCache();
        const first = {};
        const reached = keep(sessionCache, {}, first);
        const stillHeld = keep(sessionCache, {}, first);
        const ended = keep(sessionCache, {}, first);

        sessionCache.beginEvaluation();
        sessionCache.claim(reached, {});
        ended.session.isDisposed = true;
        sessionCache.beginEvaluation();

        expect(sessionCache.size).toBe(2);
        expect(sessionCache.find(observation, {}, stillHeld.request.target, {})).toBe(stillHeld);
    });

    it('looks through nothing when the last evaluation reached every session', () => {
        const sessionCache = new SessionCache();
        const owner = {};

        keep(sessionCache, {}, owner).session.isDisposed = true;
        keep(sessionCache, {}, owner);
        sessionCache.beginEvaluation();

        expect(sessionCache.size).toBe(2);
    });
});
