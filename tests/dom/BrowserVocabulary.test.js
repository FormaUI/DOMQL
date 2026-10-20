import { describe, it, expect } from 'vitest';
import { LexicaModule } from '@formaui/lexica/language/vocabulary/LexicaModule.mjs';
import { LexicaRegistry } from '@formaui/lexica/language/vocabulary/LexicaRegistry.mjs';
import { BrowserVocabulary } from '#domql/dom/BrowserVocabulary.mjs';

/** The message an error a call throws carries. */
const messageOf = call => {
    try {
        call();
    } catch (error) {
        return error.message;
    }

    throw new Error('The call threw nothing');
};

/** A property of an element a test module declares. */
const declaration = overrides => ({ name: 'charts', function: 'charts', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh', ...overrides });

describe('BrowserVocabulary', () => {
    const registry = new LexicaRegistry(BrowserVocabulary.modules);
    const { module } = BrowserVocabulary;
    const names = [
        'size', 'devicePixelRatio', 'rect', 'clientSize', 'grid', 'selection', 'children', 'parent', 'count', 'first', 'last',
        'media', 'is', 'has', 'supports', 'attribute', 'style', 'intersects', 'overlaps', 'matches', 'closest',
        'all', 'item', 'max', 'min', 'sum', 'where', 'on',
    ];

    it('is a module of its own name, made by createModule as any module is, beside Lexica\'s own', () => {
        expect(module.name).toBe('domql');
        expect('isBuiltIn' in module).toBe(false);
        expect(registry.moduleNames).toEqual(['lexica', 'domql']);
    });

    it('declares, with Lexica\'s built-in vocabulary, each member the specification lists', () => {
        expect(names.filter(name => registry.getMembers(name).length === 0)).toEqual([]);
    });

    it('gives every member observation coverage and, where partial, what it misses', () => {
        for (const member of module.members) {
            expect(member.changes).toBeTypeOf('string');
            expect(member.changes === 'partly-observable' ? member.misses : 'n/a').toBeTruthy();
        }
    });

    it('names every function key a module of functions would supply', () => {
        const keys = module.members.map(member => `${member.on}:${member.name}:${member.function}`);

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('declares each test as a Boolean member, a presence test named with has', () => {
        const tests = module.members.filter(member => member.result === 'boolean' && member.kind === 'property').map(member => `${member.on}.${member.name}`);

        expect(tests).toEqual(['element.attached', 'element.hasChildren', 'element.hasSelection']);
    });

    it('declares the conditions of elements and of the document, each tested with is, the state the browser sets rather than one that follows from structure', () => {
        const conditions = module.conditions.map(condition => `${condition.on}.${condition.verb}("${condition.name}")`);

        expect(conditions).toEqual([
            'element.is("disabled")', 'element.is("readonly")', 'element.is("text-editable")', 'element.has("focus")', 'element.has("focus-within")', 'element.is("hover")', 'element.is("popover-open")', 'element.is("checked")',
            'document.is("visible")', 'document.has("focus")', 'window.supports("share")', 'window.supports("clipboard")', 'aria.is("checked")', 'aria.is("disabled")',
        ]);
    });

    it('lets one name answer on different receivers', () => {
        expect(registry.getMembers('size').map(member => member.on)).toEqual(['window', 'element']);
    });

    it('refuses a module\'s member the DOM vocabulary already answers on the same receiver, a kind of node included', () => {
        expect(messageOf(() => new LexicaRegistry([...BrowserVocabulary.modules, new LexicaModule('size', { members: [declaration({ name: 'size', on: 'element' })] })]))).toContain('declared already');
        expect(messageOf(() => new LexicaRegistry([...BrowserVocabulary.modules, new LexicaModule('parent', { members: [declaration({ name: 'parent', on: 'shadowRoot' })] })]))).toContain('declared already');
    });

    it('lets a module beside it declare a member and a condition of any name on an element', () => {
        const charts = new LexicaModule('charts', {
            members: [declaration({ name: 'palette' })],
            conditions: [{ name: 'plotted', function: 'isPlotted', on: 'element', changes: 'unobserved', reads: 'fresh', observations: [] }],
        });
        const extended = new LexicaRegistry([...BrowserVocabulary.modules, charts]);

        expect(extended.getMembers('palette').map(member => extended.getOwner(member))).toEqual(['charts']);
        expect(extended.getConditions('plotted').map(condition => extended.getOwner(condition))).toEqual(['charts']);
    });

    it('refuses an event type a module declares that the DOM vocabulary declares', () => {
        expect(messageOf(() => new LexicaRegistry([...BrowserVocabulary.modules, new LexicaModule('twice', { eventTypes: [{ name: 'click', data: 'domEvent' }] })]))).toContain("'click' is declared already");
    });

    describe('observations', () => {
        const members = [...module.members, ...module.conditions];
        const covered = declaration => ['observable', 'partly-observable'].includes(declaration.changes);

        it('are named by every member whose changes they cover, and by no other', () => {
            for (const declaration of members) {
                expect(declaration.observations.length > 0, declaration.name).toBe(covered(declaration));
            }
        });

        it('are of types the module declares', () => {
            const types = new Set(module.observationTypes.map(type => type.name));
            const named = members.flatMap(declaration => declaration.observations.map(observation => observation.type));

            expect(named.every(type => types.has(type))).toBe(true);
            expect([...new Set(named)].sort()).toEqual([...types].sort());
        });

        it('are maintained only for the member that reads maintained values', () => {
            const maintained = members.filter(declaration => declaration.observations.some(observation => registry.getObservationType(observation.type).contract === 'maintained'));

            expect(maintained.map(declaration => declaration.name)).toEqual(['intersects']);
            expect(maintained.every(declaration => declaration.reads === 'maintained')).toBe(true);
        });
    });
});
