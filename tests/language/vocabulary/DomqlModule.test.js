import { describe, it, expect } from 'vitest';
import { DomqlModule } from '#domql/language/vocabulary/DomqlModule.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';
import { declaration, messageOf, parameter } from './declarations.mjs';

describe('DomqlModule', () => {
    it('keeps its declarations as data, without functions', () => {
        const module = new DomqlModule('charts', { members: [declaration({ name: 'charts' })] });

        expect(module.functions).toBeNull();
        expect(module.members[0].name).toBe('charts');
        expect(Object.isFrozen(module.members[0])).toBe(true);
    });

    it('refuses a name with a hyphen, which no name holds', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'chart-size', function: 'chartSize' })] }))).toContain('named as a name is');
        expect(messageOf(() => new DomqlModule('chart-tools', {}))).toContain('named as a name is');
    });

    it('keeps the DOMQL name and the function key apart', () => {
        const module = new DomqlModule('charts', { members: [declaration({ name: 'charts', function: 'chartsKey' })] }, { chartsKey: () => 0 });

        expect(module.members[0]).toMatchObject({ name: 'charts', function: 'chartsKey' });
    });

    it('requires every function a declaration names', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'charts' })] }, {}))).toContain("'zoom'");
    });

    it('refuses the built-in identity to any module but the built-in one', () => {
        expect(messageOf(() => new DomqlModule('builtIn', {}))).toContain('built-in module');
        expect(Vocabulary.module.isBuiltIn).toBe(true);
    });

    it('refuses a declaration without its observation coverage', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ changes: undefined })] }))).toContain('how it changes');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ changes: 'partly-observable' })] }))).toContain('states the changes it misses');
    });

    it('takes a tolerance that is a number that is not negative', () => {
        expect(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', changes: 'unobserved', tolerance: 0.5 })] })).not.toThrow();
        expect(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', changes: 'unobserved', tolerance: 0 })] })).not.toThrow();

        for (const tolerance of [-1, '1', Infinity, null]) {
            expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', changes: 'unobserved', tolerance })] }))).toContain('tolerance');
        }
    });

    it('accepts unobserved coverage', () => {
        expect(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', changes: 'unobserved' })] })).not.toThrow();
    });

    it('writes a property by access alone, and an operation as a call unless it is written infix', () => {
        const zoom = new DomqlModule('charts', { members: [declaration({ kind: 'operation', input: 'direct', parameters: [parameter()] }), declaration({ name: 'pan', function: 'pan', kind: 'operation', form: 'infix' })] });

        expect(zoom.members.map(member => member.form)).toEqual(['call', 'infix']);
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ parameters: [parameter()] })] }))).toContain('A property is accessed');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ form: 'call' })] }))).toContain('A property is accessed');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ kind: 'operation', form: 'phrase' })] }))).toContain('written as call, infix or indexer');
    });

    it('requires an operation with parameters to declare its input, direct for exactly one parameter and options for one or several', () => {
        const two = [parameter({ name: 'first' }), parameter({ name: 'second', required: false, default: 1 })];

        expect(() => new DomqlModule('charts', { members: [declaration({ kind: 'operation', input: 'options', parameters: two })] })).not.toThrow();
        expect(() => new DomqlModule('charts', { members: [declaration({ kind: 'operation', input: 'options', parameters: [parameter()] })] })).not.toThrow();
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ kind: 'operation', parameters: [parameter()] })] }))).toContain('declares its input');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ kind: 'operation', input: 'direct', parameters: two })] }))).toContain('exactly one parameter');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ kind: 'operation', input: 'direct' })] }))).toContain('declares no input');
    });

    it('refuses a default on a required parameter and a fixed parameter that selects nothing', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ parameters: [parameter({ default: 1 })] })] }))).toContain('declares no default');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ parameters: [parameter({ fixed: true })] })] }))).toContain('what it selects');
    });

    it('refuses an expression parameter without its evaluation context', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ parameters: [parameter({ kind: 'expression' })] })] }))).toContain('evaluation context');
    });

    it('refuses a type that is not written as a type', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ result: 'list<' })] }))).toContain('type of its result');
    });

    it.each(['element', 'null', 'never'])('refuses a structured type named %s, a built-in name', name => {
        expect(messageOf(() => new DomqlModule('charts', { types: [{ name, fields: { level: 'number' } }] }))).toContain('built-in names');
    });

    it('refuses what a module does not declare, predicates among them, a test being a member that answers a Boolean', () => {
        expect(messageOf(() => new DomqlModule('charts', { predicates: [] }))).toContain("'predicates' is none of them; a test is a member that answers a Boolean");
        expect(messageOf(() => new DomqlModule('charts', { member: [] }))).toContain("A module declares members, types, eventTypes, features, observationTypes, conversions, states, and 'member' is none of them");
        expect(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', result: 'boolean' })] })).not.toThrow();
    });

    it('refuses a key a declaration does not take, so a misspelled one is never ignored', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', tolerence: 1 })] }))).toContain("A member declares name, function, kind, form, input, default, on, parameters, result, changes, reads, misses, tolerance, observations, and 'tolerence' is none of them");
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', kind: 'operation', input: 'direct', parameters: [parameter({ defualt: 1 })] })] }))).toContain("'defualt' is none of them");
        expect(messageOf(() => new DomqlModule('charts', { types: [{ name: 'chart', fields: { size: 'number' }, field: {} }] }))).toContain("'field' is none of them");
        expect(messageOf(() => new DomqlModule('charts', { eventTypes: [{ name: 'chartclick', payload: 'domEvent', data: 'domEvent' }] }))).toContain("'data' is none of them");
        expect(messageOf(() => new DomqlModule('charts', { observationTypes: [{ name: 'chartWatch', contract: 'invalidation', function: 'watch', share: false }] }))).toContain("'share' is none of them");
    });

    it('refuses contents, lists and functions of the wrong shape with an error that names them', () => {
        expect(messageOf(() => new DomqlModule('charts', null))).toContain("A module's contents are an object declaring members, types, eventTypes, features, observationTypes");
        expect(messageOf(() => new DomqlModule('charts', { members: {} }))).toContain("A module's members are a list");
        expect(messageOf(() => new DomqlModule('charts', { types: 'chart' }))).toContain("A module's types are a list");
        expect(messageOf(() => new DomqlModule('charts', { members: [null] }))).toContain('A member is an object declaring');
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'charts', kind: 'operation', input: 'direct', parameters: {} })] }))).toContain('Its parameters are a list');
        expect(messageOf(() => new DomqlModule('charts', {}, [() => 1]))).toContain("A module's functions are an object holding each function by its key");
    });

    it('refuses a fixed parameter that is no Boolean, selects without being fixed, or is anything but a value parameter of type string', () => {
        const member = overrides => declaration({ name: 'charts', kind: 'operation', input: 'direct', parameters: [parameter({ type: 'string', ...overrides })] });

        expect(messageOf(() => new DomqlModule('charts', { members: [member({ fixed: 'yes' })] }))).toContain('declares whether it is fixed as a Boolean');
        expect(messageOf(() => new DomqlModule('charts', { members: [member({ selects: 'feature' })] }))).toContain('selects nothing, since it is not fixed');
        expect(messageOf(() => new DomqlModule('charts', { members: [member({ type: 'number', fixed: true, selects: 'feature' })] }))).toContain('is a value parameter of type string');
        expect(() => new DomqlModule('charts', { members: [member({ fixed: true, selects: 'feature' })] })).not.toThrow();
    });

    it('refuses a member that selects a member, which an access by name reads', () => {
        const selecting = selects => declaration({ name: 'charts', kind: 'operation', input: 'direct', parameters: [parameter({ type: 'string', fixed: true, selects })] });

        expect(messageOf(() => new DomqlModule('charts', { members: [selecting('member')] }))).toContain('declares what it selects, one of eventType, feature');
        expect(() => new DomqlModule('charts', { members: [selecting('feature')] })).not.toThrow();
    });

    it('refuses a member that selects a predicate, which no member is', () => {
        const selecting = declaration({ name: 'charts', parameters: [parameter({ fixed: true, selects: 'predicate' })] });

        expect(messageOf(() => new DomqlModule('charts', { members: [selecting] }))).toContain('declares what it selects');
    });

describe('observations', () => {
        const attributes = { type: 'mutation', of: 'receiver', attributes: true };
        const observed = overrides => declaration({ name: 'charts', changes: 'observable', observations: [attributes], ...overrides });
        const fails = contents => messageOf(() => new DomqlModule('charts', contents));

        it('are named by a member that changes observably or partly observably, and by no other', () => {
            expect(() => new DomqlModule('charts', { members: [observed()] })).not.toThrow();
            expect(() => new DomqlModule('charts', { members: [observed({ changes: 'partly-observable', misses: 'transforms' })] })).not.toThrow();
            expect(fails({ members: [observed({ observations: [] })] })).toContain('names the observations that cover its changes');
            expect(fails({ members: [declaration({ name: 'charts', changes: 'constant', observations: [attributes] })] })).toContain('names no observations');
            expect(fails({ members: [declaration({ name: 'charts', changes: 'derived', observations: [attributes] })] })).toContain('names no observations');
        });

        it('observe the receiver, its root, its roots, the window, the document or an argument of the member', () => {
            const parameters = [parameter({ name: 'other', type: 'element' })];

            expect(() => new DomqlModule('charts', { members: [observed({ kind: 'operation', input: 'direct', parameters, observations: [{ type: 'resize', of: { argument: 'other' } }] })] })).not.toThrow();
            expect(() => new DomqlModule('charts', { members: [observed({ observations: [{ type: 'event', of: 'window', types: ['focus'] }, { type: 'visibility', of: 'document' }] })] })).not.toThrow();
            expect(fails({ members: [observed({ observations: [{ type: 'resize', of: 'parent' }] })] })).toContain('observes the receiver, its root, its roots, the window, the document or an argument');
            expect(fails({ members: [observed({ observations: [{ type: 'resize', of: { argument: 'missing' } }] })] })).toContain('observes the receiver, its root, its roots, the window, the document or an argument');
            expect(fails({ members: [observed({ observations: [{ type: 'resize' }] })] })).toContain('observes the receiver');
        });

        it('give their arguments literals, lists of literals and arguments of the member', () => {
            const parameters = [parameter({ name: 'name', type: 'string' })];

            expect(() => new DomqlModule('charts', { members: [observed({ kind: 'operation', input: 'direct', parameters, observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }, 'type'], subtree: false, depth: 2 }] })] })).not.toThrow();
            expect(fails({ members: [observed({ observations: [{ type: 'mutation', of: 'receiver', attributes: { anything: 1 } }] })] })).toContain('no literal, list of literals or argument of the member');
            expect(fails({ members: [observed({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'missing' }] }] })] })).toContain('no literal, list of literals or argument of the member');
        });

        it('are named for a type that is a name', () => {
            expect(fails({ members: [observed({ observations: [{ type: 'Not a name', of: 'receiver' }] })] })).toContain('names its type as a name is');
            expect(fails({ members: [observed({ observations: 'resize' })] })).toContain('observations are a list');
        });

    });

    describe('observation types', () => {
        const type = overrides => ({ name: 'ticks', contract: 'invalidation', function: 'startTicks', ...overrides });
        const fails = (observationType, functions) => messageOf(() => new DomqlModule('charts', { observationTypes: [observationType] }, functions));

        it('are kept as data, with the arguments of their identity and whether they are shared', () => {
            const module = new DomqlModule('charts', { observationTypes: [type(), type({ name: 'sampled', contract: 'maintained', identity: ['root'], shared: false, function: 'startSampled' })] }, { startTicks: () => ({}), startSampled: () => ({}) });

            expect(module.observationTypes.map(declared => [declared.name, declared.identity, declared.shared])).toEqual([['ticks', [], true], ['sampled', ['root'], false]]);
            expect(Object.isFrozen(module.observationTypes[0])).toBe(true);
        });

        it('are named, have a contract and name the function that starts them', () => {
            expect(fails(type({ name: 'Not a name' }))).toContain('observation type is named as a name is');
            expect(fails(type({ contract: 'sometimes' }))).toContain('is one of invalidation, maintained');
            expect(fails(type({ function: undefined }))).toContain('function that starts it');
            expect(fails(type({ identity: 'root' }))).toContain('identity');
            expect(fails(type({ shared: 'yes' }))).toContain('whether observations are shared');
        });

        it('need the function they name among the functions of the module', () => {
            expect(fails(type(), {})).toContain("'startTicks'");
        });
    });
});

describe('conversions', () => {
    const conversion = (overrides = {}) => ({ from: 'string', to: 'chart', function: 'parse', ...overrides });
    const declaring = (conversions, functions = null) => new DomqlModule('charts', { types: [{ name: 'chart', fields: { points: 'number' } }], conversions }, functions);

    it('are kept as data, each from a type to another with the function that converts', () => {
        expect(declaring([conversion()]).conversions).toEqual([conversion()]);
    });

    it.each([
        ['a node', { from: 'element' }],
        ['the window', { to: 'window' }],
        ['a shadow view', { from: 'shadow' }],
        ['a list', { to: 'list<number>' }],
        ['a nullable type', { from: 'string?' }],
        ['null', { to: 'null' }],
    ])('convert between types of data alone, never %s', (_, overrides) => {
        expect(messageOf(() => declaring([conversion(overrides)]))).toContain('A conversion is from a type of data to another');
    });

    it('are never declared from a type to itself, which a value already of it converts to', () => {
        expect(messageOf(() => declaring([conversion({ from: 'chart', to: 'chart' })]))).toContain('A value already of a type converts to itself');
    });

    it('name their function as an identifier, and need it among the functions of the module', () => {
        expect(messageOf(() => declaring([conversion({ function: 'to-chart' })]))).toContain('It names its function as an identifier');
        expect(messageOf(() => declaring([conversion()], {}))).toContain("The function 'parse' it names is not among the module's functions (in the module 'charts', in the declaration 'string to chart')");
    });

    it('take from, to and function alone', () => {
        expect(messageOf(() => declaring([conversion({ name: 'parse' })]))).toContain("A conversion declares from, to, function, and 'name' is none of them");
    });

    it('leave no infix call named to, which converts where an infix call is written', () => {
        expect(messageOf(() => new DomqlModule('charts', { members: [declaration({ name: 'to', kind: 'operation', form: 'infix', input: 'direct', parameters: [parameter()] })] }))).toContain("no infix call is named 'to'");
        expect(new DomqlModule('charts', { members: [declaration({ name: 'to', kind: 'operation', input: 'direct', parameters: [parameter()] })] }).members[0].form).toBe('call');
    });
});

describe('states', () => {
    const state = (overrides = {}) => ({ name: 'lit', function: 'isLit', on: 'element', changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-lit'] }], ...overrides });
    const declaring = (states, functions = null) => new DomqlModule('lit', { states }, functions);

    it('are kept as data, each a name, its receivers, its function and its own contract', () => {
        expect(declaring([state()]).states).toEqual([state()]);
        const { observations, ...constant } = state({ changes: 'constant' });

        expect(observations).toHaveLength(1);
        expect(declaring([constant]).states[0].observations).toEqual([]);
    });

    it.each([
        ['a name that is no words joined by hyphens', { name: 'focus_within' }, 'A state is named by words of letters and digits joined by hyphens'],
        ['a name ending in a hyphen', { name: 'focus-' }, 'A state is named by words of letters and digits joined by hyphens'],
        ['no function', { function: undefined }, 'It names its function as an identifier'],
        ['no receivers', { on: [] }, 'It declares the types it applies to'],
        ['a change it derives', { changes: 'derived', observations: undefined }, 'A state changes as constant, observable, partly-observable or unobserved, and reads fresh or maintained'],
        ['a reading it captures', { reads: 'captured' }, 'and reads fresh or maintained'],
        ['an observable change no observation covers', { observations: [] }, 'It changes as observable, so it names the observations that cover its changes'],
        ['a partly observable change that names no misses', { changes: 'partly-observable' }, 'A partly observable member states the changes it misses'],
        ['an observation of an argument, which a state takes none of', { observations: [{ type: 'mutation', of: { argument: 'name' } }] }, "observes the receiver, its root, its roots, the window, the document or an argument of the member"],
        ['a key it does not take', { result: 'boolean' }, "A state declares name, function, on, changes, reads, misses, observations, and 'result' is none of them"],
    ])('refuse %s', (_, overrides, message) => {
        expect(messageOf(() => declaring([state(overrides)]))).toContain(message);
    });

    it('need the function they name among the functions of the module', () => {
        expect(messageOf(() => declaring([state()], {}))).toContain("The function 'isLit' it names is not among the module's functions");
    });

    it('are tested through a member whose fixed argument selects one, which names no function and derives how it changes', () => {
        const selecting = overrides => new DomqlModule('lit', { members: [declaration({ name: 'lit', kind: 'operation', form: 'indexer', function: undefined, changes: 'derived', reads: 'derived', result: 'boolean', parameters: [parameter({ name: 'name', type: 'string', fixed: true, selects: 'state' })], ...overrides })] });

        expect(selecting({}).members[0].function).toBeUndefined();
        expect(messageOf(() => selecting({ function: 'lit' }))).toContain('It selects a state, which carries it out, so it names no function and changes and reads as derived');
        expect(messageOf(() => selecting({ changes: 'constant', reads: 'fresh' }))).toContain('It selects a state, which carries it out');
    });
});
