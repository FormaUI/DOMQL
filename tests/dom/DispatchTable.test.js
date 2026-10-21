import { describe, it, expect } from 'vitest';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';

/** The module error creating a module throws: its message, and where its location says it is. */
const refusalOf = contents => {
    try {
        DispatchTable.createModule('desk', contents);
    } catch (error) {
        expect(error.kind).toBe('module');

        return { message: error.message, ...error.location };
    }

    throw new Error('The module was created');
};

/** A host call of an element, named `mark`, with what a test changes. */
const hostCall = (overrides = {}) => ({ name: 'mark', kind: 'function', invokedBy: 'host', target: 'element', parameters: [], ...overrides });

describe('DispatchTable', () => {
    it('keeps each host call\'s request kind, execution mode and implementation, and gives Lexica the declaration without them', () => {
        const start = () => ({ stop: () => {} });
        const execute = () => true;
        const module = DispatchTable.createModule('desk', {
            members: [
                hostCall({ name: 'beats', requestKind: 'subscription', result: 'number', implementation: start }),
                hostCall({ requestKind: 'execution', executionMode: 'once', result: 'boolean', implementation: execute }),
                { name: 'size', kind: 'property', target: 'element', result: 'number', updates: { changes: 'constant', reads: 'fresh' }, implementation: () => 1 },
            ],
        });
        const [beats, mark, size] = module.members;

        expect(DispatchTable.get(beats)).toEqual({ requestKind: 'subscription', executionMode: null, implementation: start });
        expect(DispatchTable.get(mark)).toEqual({ requestKind: 'execution', executionMode: 'once', implementation: execute });
        expect(DispatchTable.get(size)).toBeUndefined();
        expect([beats, mark].map(declaration => ['requestKind', 'executionMode', 'implementation'].some(field => field in declaration))).toEqual([false, false]);
        expect(typeof size.implementation).toBe('function');
    });

    it('keeps a host call declared without an implementation, resolved against and never carried out', () => {
        const [mark] = DispatchTable.createModule('desk', { members: [hostCall({ requestKind: 'execution', executionMode: 'continuous' })] }).members;

        expect(DispatchTable.get(mark)).toEqual({ requestKind: 'execution', executionMode: 'continuous', implementation: undefined });
    });

    it('refuses a host call whose request kind is missing or unknown', () => {
        for (const requestKind of [undefined, 'action']) {
            expect(refusalOf({ members: [hostCall({ requestKind, executionMode: 'once', result: 'boolean' })] })).toMatchObject({ module: 'desk', declaration: 'mark', field: 'requestKind', message: expect.stringContaining("A host call declares the request it makes, requestKind 'subscription' or 'execution'") });
        }
    });

    it('refuses an execution whose mode is missing or unknown, an execution whose mode was left out being an execution missing its mode', () => {
        for (const executionMode of [undefined, 'forever']) {
            expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode })] })).toMatchObject({ declaration: 'mark', field: 'executionMode', message: expect.stringContaining("An execution declares how it runs, executionMode 'once' or 'continuous'") });
        }
    });

    it('refuses an event source given a mode or declaring no result, and a continuous execution declaring one', () => {
        expect(refusalOf({ members: [hostCall({ requestKind: 'subscription', executionMode: 'once', result: 'number' })] })).toMatchObject({ field: 'executionMode', message: expect.stringContaining('so it declares no executionMode') });
        expect(refusalOf({ members: [hostCall({ requestKind: 'subscription' })] })).toMatchObject({ field: 'result', message: expect.stringContaining('An event source declares the type of each event it delivers') });
        expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode: 'continuous', result: 'boolean' })] })).toMatchObject({ field: 'result', message: expect.stringContaining('A continuous execution runs until it is updated or disposed and answers no result') });
    });

    it('refuses either field on a function the evaluator invokes, and an implementation that is no function', () => {
        const evaluated = { name: 'zoom', kind: 'function', target: 'element', parameters: [], result: 'number', updates: { changes: 'constant', reads: 'fresh' } };

        expect(refusalOf({ members: [{ ...evaluated, requestKind: 'execution' }] })).toMatchObject({ declaration: 'zoom', field: 'requestKind', message: expect.stringContaining('A function the evaluator invokes makes no request of its own') });
        expect(refusalOf({ members: [{ ...evaluated, executionMode: 'once' }] })).toMatchObject({ declaration: 'zoom', field: 'executionMode' });
        expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode: 'once', result: 'boolean', implementation: 'mark' })] })).toMatchObject({ field: 'implementation', message: expect.stringContaining('Its implementation is a function') });
    });

    it('leaves contents Lexica refuses to Lexica, which names what is wrong with them', () => {
        expect(refusalOf({ members: {} }).message).toContain("A module's members are a list");
        expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode: 'once', result: 'boolean', updates: { changes: 'constant', reads: 'fresh' } })] })).toMatchObject({ field: 'updates', message: expect.stringContaining('so it declares no updates') });
    });
});
