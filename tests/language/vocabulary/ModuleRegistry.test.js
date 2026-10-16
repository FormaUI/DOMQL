import { describe, it, expect } from 'vitest';
import { DomqlModule } from '#domql/language/vocabulary/DomqlModule.mjs';
import { ModuleRegistry } from '#domql/language/vocabulary/ModuleRegistry.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';
import { declaration, messageOf } from './declarations.mjs';

describe('ModuleRegistry', () => {
    const own = () => new DomqlModule('charts', {
        types: [{ name: 'chart', fields: { points: 'number' } }],
        members: [declaration({ name: 'points', on: 'chart' }), declaration({ name: 'charts', on: 'element' })],
    });

    it('registers the built-in module and a module beside it', () => {
        expect(new ModuleRegistry([Vocabulary.module, own()]).moduleNames).toEqual(['builtIn', 'charts']);
    });

    it('refuses a module registered twice', () => {
        expect(messageOf(() => new ModuleRegistry([own(), own()]))).toContain('name is taken');
    });

    it('refuses what no createModule made, naming it', () => {
        expect(messageOf(() => new ModuleRegistry([{ name: 'fake', members: [] }]))).toContain('A module is registered as createModule makes it');
    });

    it('refuses a type a declaration names that neither DOMQL nor a module registered with it declares', () => {
        const failing = contents => messageOf(() => new ModuleRegistry([Vocabulary.module, new DomqlModule('charts', contents)]));

        expect(failing({ members: [declaration({ name: 'charts', result: 'chart' })] })).toContain("'chart' names the type 'chart', which neither DOMQL nor a module registered with it declares");
        expect(failing({ members: [declaration({ name: 'charts', result: 'list<chart?>' })] })).toContain("'list<chart?>' names the type 'chart'");
        expect(failing({ types: [{ name: 'chart', fields: { axis: 'axis' } }] })).toContain("names the type 'axis'");
        expect(failing({ eventTypes: [{ name: 'chartclick', payload: 'chartEvent' }] })).toContain("names the type 'chartEvent'");
        expect(failing({ members: [declaration({ name: 'charts', kind: 'operation', input: 'direct', parameters: [{ name: 'range', kind: 'value', type: 'range', required: true, nulls: 'propagate' }] })] })).toContain("names the type 'range'");
    });

    it('takes a type the module declares wherever it declares it, and one an earlier module declares, whatever the order of the declarations', () => {
        const axes = new DomqlModule('axes', { types: [{ name: 'axis', fields: { length: 'number' } }] });
        const charts = new DomqlModule('charts', {
            members: [declaration({ name: 'charts', result: 'chart' })],
            types: [{ name: 'chart', fields: { axis: 'axis', domain: 'list<number>' } }],
        });

        expect(() => new ModuleRegistry([Vocabulary.module, axes, charts])).not.toThrow();
        expect(messageOf(() => new ModuleRegistry([Vocabulary.module, charts, axes]))).toContain("names the type 'axis'");
    });

    it('refuses a default its parameter does not admit, by its type, its nullability and a structure\'s fields', () => {
        const range = new DomqlModule('ranges', { types: [{ name: 'range', fields: { start: 'number', end: 'number?' } }] });
        const registering = (type, value) => () => new ModuleRegistry([Vocabulary.module, range, new DomqlModule('charts', {
            members: [declaration({ name: 'charts', kind: 'operation', input: 'direct', parameters: [{ name: 'value', kind: 'value', type, required: false, default: value, nulls: 'propagate' }] })],
        })]);

        expect(messageOf(registering('number', 'many'))).toContain("The default of 'value' is no number");
        expect(messageOf(registering('number', null))).toContain('is no number');
        expect(messageOf(registering('list<string>', ['a', 1]))).toContain('is no list<string>');
        expect(messageOf(registering('range', { start: 0 }))).toContain('is no range');
        expect(messageOf(registering('element?', {}))).toContain('is no element?');
        expect(registering('number?', null)).not.toThrow();
        expect(registering('list<string>', ['a', 'b'])).not.toThrow();
        expect(registering('range', { start: 0, end: null })).not.toThrow();
    });

    it('refuses a member outside the module own types unless it is named for the module', () => {
        const module = new DomqlModule('charts', { members: [declaration({ name: 'other' })] });

        expect(messageOf(() => new ModuleRegistry([module]))).toContain("named for the module, 'charts'");
    });

    it('refuses a member the registry already answers on the same receiver', () => {
        const module = new DomqlModule('charts', { members: [declaration({ name: 'charts', on: 'element' }), declaration({ name: 'charts', on: 'element' })] });

        expect(messageOf(() => new ModuleRegistry([module]))).toContain('declared already');
        expect(messageOf(() => new ModuleRegistry([Vocabulary.module, new DomqlModule('size', { members: [declaration({ name: 'size', on: 'element' })] })]))).toContain('declared already');
    });

    it('refuses a member on a kind of node that the same name on node already answers', () => {
        expect(messageOf(() => new ModuleRegistry([Vocabulary.module, new DomqlModule('parent', { members: [declaration({ name: 'parent', on: 'shadowRoot' })] })]))).toContain('declared already');
    });

    it('lets one name answer on different receivers', () => {
        const owners = new ModuleRegistry([Vocabulary.module]).getMembers('size').map(member => member.on);

        expect(owners).toEqual(['window', 'element']);
    });

    it('refuses an event or a type declared twice', () => {
        const events = new DomqlModule('twice', { eventTypes: [{ name: 'click', payload: 'domEvent' }] });

        expect(messageOf(() => new ModuleRegistry([Vocabulary.module, events]))).toContain("'click' is declared already");
    });

describe('observation types', () => {
        const types = [{ name: 'ticks', contract: 'invalidation', function: 'startTicks' }, { name: 'sampled', contract: 'maintained', function: 'startSampled' }];
        const functions = { startTicks: () => ({}), startSampled: () => ({}), zoom: () => 1 };
        const watching = (overrides, moduleTypes = types) => new DomqlModule('charts', { observationTypes: moduleTypes, members: [declaration({ name: 'charts', changes: 'observable', observations: [{ type: 'ticks', of: 'receiver' }], ...overrides })] }, functions);

        it('are declared by a module, which its members and the members of later modules use', () => {
            const later = new DomqlModule('later', { members: [declaration({ name: 'later', changes: 'observable', observations: [{ type: 'ticks', of: 'receiver' }] })] });

            expect(() => new ModuleRegistry([watching({}), later])).not.toThrow();
            expect(new ModuleRegistry([watching({})]).getObservationType('ticks')).toMatchObject({ name: 'ticks', contract: 'invalidation', shared: true });
        });

        it('are declared once', () => {
            expect(messageOf(() => new ModuleRegistry([watching({}), new DomqlModule('again', { observationTypes: [types[0]] }, functions)]))).toContain("observation type 'ticks' is declared already");
        });

        it('are declared by some module for every observation a member names', () => {
            expect(messageOf(() => new ModuleRegistry([watching({ observations: [{ type: 'unknown', of: 'receiver' }] })]))).toContain("observation type 'unknown' is declared by no module");
        });

        it('give a member that reads maintained values a maintained observation, and give no other member one', () => {
            expect(() => new ModuleRegistry([watching({ reads: 'maintained', observations: [{ type: 'sampled', of: 'receiver' }] })])).not.toThrow();
            expect(messageOf(() => new ModuleRegistry([watching({ reads: 'maintained' })]))).toContain('names a maintained observation');
            expect(messageOf(() => new ModuleRegistry([watching({ observations: [{ type: 'sampled', of: 'receiver' }] })]))).toContain('reads maintained values');
        });

        it('give a maintained observation one target, never the roots of a receiver, which are as many as its ancestry has', () => {
            expect(() => new ModuleRegistry([watching({ reads: 'maintained', observations: [{ type: 'sampled', of: 'root' }] })])).not.toThrow();
            expect(messageOf(() => new ModuleRegistry([watching({ reads: 'maintained', observations: [{ type: 'sampled', of: 'roots' }] })]))).toContain("The maintained observation 'sampled' gives one sample, so it observes one target, never a receiver's roots");
        });

        it('start with the function their module supplies', () => {
            const registry = new ModuleRegistry([watching({})]);

            expect(registry.getFunction(registry.getObservationType('ticks'))).toBe(functions.startTicks);
        });
    });
});
