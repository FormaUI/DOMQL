import { describe, it, expect } from 'vitest';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';

/** The module error creating a module throws: its code, its message, and where its location says it is. */
const refusalOf = contents => {
    try {
        DispatchTable.createModule('Desk', contents);
    } catch (error) {
        expect(error.kind).toBe('module');

        return { code: error.code, message: error.message, ...error.location };
    }

    throw new Error('The module was created');
};

/** A host call, named `mark`, with what a test changes. */
const hostCall = (overrides = {}) => ({ name: 'mark', kind: 'function', invokedBy: 'host', parameters: [], ...overrides });

/** An extension of DOMQL's elements holding the members given. */
const elementExtension = members => ({ name: 'DeskElements', kind: 'extension', target: 'Domql.Element', members });

describe('DispatchTable', () => {
    it('keeps each host call\'s request kind, execution mode and implementation, and gives Nexo the declaration without them', () => {
        const start = () => ({ stop: () => {} });
        const execute = () => true;
        const module = DispatchTable.createModule('Desk', {
            members: [
                hostCall({ name: 'beats', requestKind: 'subscription', result: 'Number', impl: start }),
                hostCall({ requestKind: 'execution', executionMode: 'once', result: 'Boolean', impl: execute }),
                { name: 'size', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, impl: () => 1 },
            ],
        });
        const [beats, mark, size] = module.members;

        expect(DispatchTable.get(beats)).toEqual({ requestKind: 'subscription', executionMode: null, implementation: start, type: null });
        expect(DispatchTable.get(mark)).toEqual({ requestKind: 'execution', executionMode: 'once', implementation: execute, type: null });
        expect(DispatchTable.get(size)).toBeUndefined();
        expect([beats, mark].map(declaration => ['requestKind', 'executionMode', 'impl'].some(key => key in declaration))).toEqual([false, false]);
        expect(typeof size.impl).toBe('function');
    });

    it('keeps a host call standing within a type, and one declaration standing in several types for each declaration the module makes of it', () => {
        const start = () => ({ stop: () => {} });
        const beats = hostCall({ name: 'beats', requestKind: 'subscription', result: 'Number', impl: start });
        const module = DispatchTable.createModule('Desk', {
            types: [
                { name: 'Lamp', kind: 'reference', isInstance: () => false, members: [beats] },
                { name: 'Fan', kind: 'reference', isInstance: () => false, members: [{ name: 'speed', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' } }, beats] },
                elementExtension([hostCall({ requestKind: 'execution', executionMode: 'continuous' })]),
            ],
        });
        const [lamp, fan, extension] = module.types;

        expect(DispatchTable.get(lamp.members[0])).toEqual({ requestKind: 'subscription', executionMode: null, implementation: start, type: 'Lamp' });
        expect(DispatchTable.get(fan.members[1])).toEqual({ requestKind: 'subscription', executionMode: null, implementation: start, type: 'Fan' });
        expect(DispatchTable.get(fan.members[0])).toBeUndefined();
        expect(DispatchTable.get(extension.members[0])).toEqual({ requestKind: 'execution', executionMode: 'continuous', implementation: undefined, type: 'DeskElements' });
        expect('impl' in lamp.members[0]).toBe(false);
    });

    it('keeps a host call declared without an implementation, resolved against and never carried out', () => {
        const [mark] = DispatchTable.createModule('Desk', { members: [hostCall({ requestKind: 'execution', executionMode: 'continuous' })] }).members;

        expect(DispatchTable.get(mark)).toEqual({ requestKind: 'execution', executionMode: 'continuous', implementation: undefined, type: null });
    });

    it('refuses a host call whose request kind is missing or unknown', () => {
        for (const requestKind of [undefined, 'action']) {
            expect(refusalOf({ members: [hostCall({ requestKind, executionMode: 'once', result: 'Boolean' })] })).toMatchObject({ code: 'DOMQL4002', module: 'Desk', declaration: 'mark', declarationKey: 'requestKind', message: expect.stringContaining("A host call declares the request it makes, requestKind 'subscription' or 'execution'") });
        }
    });

    it('refuses an execution whose mode is missing or unknown, an execution whose mode was left out being an execution missing its mode', () => {
        for (const executionMode of [undefined, 'forever']) {
            expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode })] })).toMatchObject({ code: 'DOMQL4005', declaration: 'mark', declarationKey: 'executionMode', message: expect.stringContaining("An execution declares how it runs, executionMode 'once' or 'continuous'") });
        }
    });

    it('refuses an event source given a mode or declaring no result, and a continuous execution declaring one', () => {
        expect(refusalOf({ members: [hostCall({ requestKind: 'subscription', executionMode: 'once', result: 'Number' })] })).toMatchObject({ code: 'DOMQL4003', declarationKey: 'executionMode', message: expect.stringContaining('so it declares no executionMode') });
        expect(refusalOf({ members: [hostCall({ requestKind: 'subscription' })] })).toMatchObject({ code: 'DOMQL4004', declarationKey: 'result', message: expect.stringContaining('An event source declares the type of each event it delivers') });
        expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode: 'continuous', result: 'Boolean' })] })).toMatchObject({ code: 'DOMQL4006', declarationKey: 'result', message: expect.stringContaining('A continuous execution runs until it is updated or disposed and answers no result') });
    });

    it('refuses either key on a member the evaluator invokes, and an impl that is no function', () => {
        const evaluated = { name: 'zoom', kind: 'function', parameters: [], result: 'Number', updates: { changes: 'constant', reads: 'fresh' } };

        expect(refusalOf({ members: [{ ...evaluated, requestKind: 'execution' }] })).toMatchObject({ code: 'DOMQL4001', declaration: 'zoom', declarationKey: 'requestKind', message: expect.stringContaining('A member the evaluator invokes makes no request of its own') });
        expect(refusalOf({ members: [{ ...evaluated, executionMode: 'once' }] })).toMatchObject({ code: 'DOMQL4001', declaration: 'zoom', declarationKey: 'executionMode' });
        expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode: 'once', result: 'Boolean', impl: 'mark' })] })).toMatchObject({ code: 'DOMQL4007', declarationKey: 'impl', message: expect.stringContaining('Its impl is a function') });
    });

    it('names an unnamed indexer that declares either key as Nexo names it, as []', () => {
        const indexer = { kind: 'indexer', parameters: [{ name: 'key', kind: 'value', type: 'String' }], result: 'String?', updates: { changes: 'constant', reads: 'fresh' }, requestKind: 'execution' };

        expect(refusalOf({ types: [elementExtension([indexer])] })).toEqual({ code: 'DOMQL4001', module: 'Desk', type: 'DeskElements', declaration: '[]', declarationKey: 'requestKind', message: expect.stringContaining('A member the evaluator invokes makes no request of its own, so it declares no requestKind') });
    });

    it('names the type a refused host call stands within', () => {
        expect(refusalOf({ types: [elementExtension([hostCall({ requestKind: 'execution' })])] })).toMatchObject({ code: 'DOMQL4005', module: 'Desk', type: 'DeskElements', declaration: 'mark', declarationKey: 'executionMode' });
    });

    it('names a type that declares type parameters by its local name, as Nexo does', () => {
        expect(refusalOf({ types: [{ name: 'DeskLists<T>', kind: 'extension', target: 'List<T>', members: [hostCall({ requestKind: 'execution' })] }] })).toMatchObject({ code: 'DOMQL4005', type: 'DeskLists' });
    });

    it('leaves contents Nexo refuses to Nexo, which names what is wrong with them', () => {
        expect(refusalOf([]).code).toBe('NEXO4501');
        expect(refusalOf({ members: {} })).toEqual({ code: 'NEXO4503', module: 'Desk', declarationKey: 'members', message: expect.stringContaining("A module's members are a list") });
        expect(refusalOf({ members: [hostCall({ requestKind: 'execution', executionMode: 'once', result: 'Boolean', updates: { changes: 'constant', reads: 'fresh' } })] })).toEqual({ code: 'NEXO4030', module: 'Desk', declaration: 'mark', declarationKey: 'updates', message: expect.stringContaining('so it declares no updates') });
    });
});
