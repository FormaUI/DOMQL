import { describe, it, expect } from 'vitest';
import { QueryEvaluation } from '#domql/dom/QueryEvaluation.mjs';

describe('QueryEvaluation', () => {
    /** A session that counts its disposals, and fails them where it is told to. */
    const session = failure => {
        const held = { disposed: 0 };

        held.dispose = () => {
            held.disposed++;

            if (failure !== undefined) {
                throw failure;
            }
        };

        return held;
    };

    /** An evaluation that owns the sessions, cached as it holds them, and hands on the cache given. */
    const evaluationOf = (sessions, sessionCache = null) => {
        const owner = {};

        return new QueryEvaluation({ value: 1, isPending: false, dependencies: [], sessions: sessions.map(held => ({ session: held, owner })), owner, sessionCache, error: null });
    };

    it('disposes every session once, however often it is disposed', () => {
        const sessions = [session(), session()];
        const evaluation = evaluationOf(sessions);

        evaluation.dispose();
        evaluation.dispose();

        expect(sessions.map(held => held.disposed)).toEqual([1, 1]);
        expect(evaluation.isDisposed).toBe(true);
    });

    it('disposes every session where one fails to be disposed, and then throws the first failure', () => {
        const first = new Error('first');
        const sessions = [session(first), session(new Error('second')), session()];
        const evaluation = evaluationOf(sessions);

        expect(() => evaluation.dispose()).toThrow(first);
        expect(sessions.map(held => held.disposed)).toEqual([1, 1, 1]);
        expect(() => evaluation.dispose()).not.toThrow();
    });

    it('leaves a session a later evaluation took to that evaluation', () => {
        const kept = session();
        const taken = session();
        const owner = {};
        const cachedSessions = [{ session: kept, owner }, { session: taken, owner }];
        const evaluation = new QueryEvaluation({ value: 1, isPending: false, dependencies: [], sessions: cachedSessions, owner, error: null });

        cachedSessions[1].owner = {};
        evaluation.dispose();

        expect([kept.disposed, taken.disposed]).toEqual([1, 0]);
    });

    it('hands its sessions on once, and none once it has let them go', () => {
        const sessionCache = {};
        const evaluation = evaluationOf([], sessionCache);
        const disposed = evaluationOf([], {});

        disposed.dispose();

        expect(evaluation.handOverSessionCache()).toBe(sessionCache);
        expect(evaluation.handOverSessionCache()).toBeNull();
        expect(disposed.handOverSessionCache()).toBeNull();
    });
});
