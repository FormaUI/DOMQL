import { describe, it, expect } from 'vitest';
import { LexicaModule } from '#lexica/language/vocabulary/LexicaModule.mjs';
import { LexicaRegistry } from '#lexica/language/vocabulary/LexicaRegistry.mjs';
import { Vocabulary } from '#lexica/language/vocabulary/Vocabulary.mjs';
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
const declaration = overrides => ({ name: 'charts', kind: 'property', target: 'element', result: 'number', updates: { changes: 'constant', reads: 'fresh' }, ...overrides });

describe('BrowserVocabulary', () => {
    const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module]);
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
            expect(member.updates.changes).toBeTypeOf('string');
            expect(member.updates.changes === 'partly-observable' ? member.updates.misses : 'n/a').toBeTruthy();
        }
    });

    it('declares each member once on its target', () => {
        const keys = module.members.map(member => `${member.target}:${member.name}`);

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('declares each test as a Boolean member, a presence test named with has', () => {
        const tests = module.members.filter(member => member.result === 'boolean' && member.kind === 'property').map(member => `${member.target}.${member.name}`);

        expect(tests).toEqual(['element.attached', 'element.hasChildren', 'element.hasSelection']);
    });

    it('declares the predicates of elements and of the document, each tested with is, the state the browser sets rather than one that follows from structure', () => {
        const predicates = module.predicates.map(predicate => `${predicate.target}.${predicate.verb}("${predicate.name}")`);

        expect(predicates).toEqual([
            'element.is("disabled")', 'element.is("readonly")', 'element.is("text-editable")', 'element.has("focus")', 'element.has("focus-within")', 'element.is("hover")', 'element.is("popover-open")', 'element.is("checked")',
            'document.is("visible")', 'document.has("focus")', 'window.supports("share")', 'window.supports("clipboard")', 'aria.is("checked")', 'aria.is("disabled")',
        ]);
    });

    it('lets one name answer on different receivers', () => {
        expect(registry.getMembers('size').map(member => member.target)).toEqual(['window', 'element']);
    });

    it('refuses a module\'s member the DOM vocabulary already answers on the same receiver, a kind of node included', () => {
        expect(messageOf(() => new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, new LexicaModule('size', { members: [declaration({ name: 'size', target: 'element' })] })]))).toContain('declared already');
        expect(messageOf(() => new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, new LexicaModule('parent', { members: [declaration({ name: 'parent', target: 'shadowRoot' })] })]))).toContain('declared already');
    });

    it('lets a module beside it declare a member and a predicate of any name on an element', () => {
        const charts = new LexicaModule('charts', {
            members: [declaration({ name: 'palette' })],
            predicates: [{ name: 'plotted', target: 'element', updates: { changes: 'unobserved', reads: 'fresh' } }],
        });
        const extended = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, charts]);

        expect(extended.getMembers('palette').map(member => extended.getOwner(member))).toEqual(['charts']);
        expect(extended.getPredicates('plotted').map(predicate => extended.getOwner(predicate))).toEqual(['charts']);
    });

    it('refuses an event type a module declares that the DOM vocabulary declares', () => {
        expect(messageOf(() => new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, new LexicaModule('twice', { eventTypes: [{ name: 'click', data: 'domEvent' }] })]))).toContain("'click' is declared already");
    });

    describe('observations', () => {
        const members = [...module.members, ...module.predicates];
        const covered = declaration => ['observable', 'partly-observable'].includes(declaration.updates.changes);

        it('are named by every member whose changes they cover, and by no other', () => {
            for (const declaration of members) {
                expect(declaration.updates.observations.length > 0, declaration.name).toBe(covered(declaration));
            }
        });

        it('are of types the module declares', () => {
            const types = new Set(module.observationTypes.map(type => type.name));
            const named = members.flatMap(declaration => declaration.updates.observations.map(observation => observation.type));

            expect(named.every(type => types.has(type))).toBe(true);
            expect([...new Set(named)].sort()).toEqual([...types].sort());
        });

        it('observe the window, the document, and the receiver\'s root and roots, the targets the module declares', () => {
            const named = members.flatMap(declaration => declaration.updates.observations.map(observation => observation.of)).filter(of => typeof of === 'string' && of !== 'receiver');

            expect(module.observationTargets).toEqual([{ name: 'window' }, { name: 'document' }, { name: 'root', from: 'receiver' }, { name: 'roots', from: 'receiver', count: 'many' }]);
            expect([...new Set(named)].sort()).toEqual(module.observationTargets.map(target => target.name).sort());
        });

        it('are maintained only for the member that reads maintained values', () => {
            const maintained = members.filter(declaration => declaration.updates.observations.some(observation => registry.getObservationType(observation.type).contract === 'maintained'));

            expect(maintained.map(declaration => declaration.name)).toEqual(['intersects']);
            expect(maintained.every(declaration => declaration.updates.reads === 'maintained')).toBe(true);
        });
    });
});
