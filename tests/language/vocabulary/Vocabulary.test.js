import { describe, it, expect } from 'vitest';
import { ModuleRegistry } from '#domql/language/vocabulary/ModuleRegistry.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';

describe('Vocabulary', () => {
    const registry = new ModuleRegistry([Vocabulary.module]);
    const names = [
        'size', 'devicePixelRatio', 'rect', 'clientSize', 'grid', 'selection', 'children', 'parent', 'count', 'first', 'last',
        'matchesMedia', 'is', 'has', 'supports', 'attribute', 'style', 'intersects', 'overlaps', 'matches', 'closest',
        'all', 'at', 'max', 'min', 'sum', 'where', 'on',
    ];

    it('declares each member the specification lists', () => {
        expect(names.filter(name => registry.getMembers(name).length === 0)).toEqual([]);
    });

    it.each(['is', 'has', 'supports'])('declares %s as the one call that asks a condition of its verb, of any receiver, carried out by the condition it selects', verb => {
        const [declaration] = registry.getMembers(verb);

        expect(registry.getMembers(verb)).toHaveLength(1);
        expect(declaration).toMatchObject({ kind: 'operation', form: 'call', on: 'any', result: 'boolean', changes: 'derived', reads: 'derived' });
        expect(declaration.parameters[0]).toMatchObject({ name: 'name', type: 'string', fixed: true, selects: 'condition' });
    });

    it('gives every member observation coverage and, where partial, what it misses', () => {
        for (const member of Vocabulary.module.members) {
            expect(member.changes).toBeTypeOf('string');
            expect(member.changes === 'partly-observable' ? member.misses : 'n/a').toBeTruthy();
        }
    });

    it('names every function key a module of functions would supply', () => {
        const keys = Vocabulary.module.members.map(member => `${member.on}:${member.name}:${member.function}`);

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('declares each test as a Boolean member, a presence test named with has', () => {
        const tests = Vocabulary.module.members.filter(member => member.result === 'boolean' && member.kind === 'property').map(member => `${member.on}.${member.name}`);

        expect(tests).toEqual(['element.attached', 'element.hasChildren', 'element.hasSelection']);
    });

    it('declares the conditions of elements and of the document, each tested with is, the state the browser sets rather than one that follows from structure', () => {
        const conditions = Vocabulary.module.conditions.map(condition => `${condition.on}.${condition.verb}("${condition.name}")`);

        expect(conditions).toEqual([
            'element.is("disabled")', 'element.is("readonly")', 'element.is("text-editable")', 'element.has("focus")', 'element.has("focus-within")', 'element.is("hover")', 'element.is("popover-open")', 'element.is("checked")',
            'document.is("visible")', 'document.has("focus")', 'window.supports("share")', 'window.supports("clipboard")', 'aria.is("checked")', 'aria.is("disabled")',
        ]);
    });

describe('observations', () => {
        const members = [...Vocabulary.module.members, ...Vocabulary.module.conditions];
        const covered = declaration => ['observable', 'partly-observable'].includes(declaration.changes);

        it('are named by every member whose changes they cover, and by no other', () => {
            for (const declaration of members) {
                expect(declaration.observations.length > 0, declaration.name).toBe(covered(declaration));
            }
        });

        it('are of types the built-in module declares', () => {
            const types = new Set(Vocabulary.module.observationTypes.map(type => type.name));
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
