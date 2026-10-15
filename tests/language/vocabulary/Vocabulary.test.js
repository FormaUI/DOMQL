import { describe, it, expect } from 'vitest';
import { ModuleRegistry } from '#domql/language/vocabulary/ModuleRegistry.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';

describe('Vocabulary', () => {
    const registry = new ModuleRegistry([Vocabulary.module]);
    const names = [
        'size', 'devicePixelRatio', 'rect', 'clientSize', 'grid', 'selection', 'children', 'parent', 'count', 'first', 'last',
        'matchesMedia', 'supports', 'attributeOf', 'computedStyleOf', 'intersects', 'overlaps', 'matches', 'closest',
        'all', 'at', 'max', 'min', 'sum', 'where', 'eventsOf',
    ];

    it('declares each member the specification lists', () => {
        expect(names.filter(name => registry.getMembers(name).length === 0)).toEqual([]);
    });

    it('declares no member for is and has, which are operators of the language', () => {
        expect(registry.getMembers('is')).toEqual([]);
        expect(registry.getMembers('has')).toEqual([]);
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

        expect(tests).toEqual(['element.attached', 'element.disabled', 'element.readOnly', 'element.textEditable', 'element.focused', 'element.hasChildren', 'element.hasSelection', 'document.visible', 'document.hasFocus']);
    });

describe('observations', () => {
        const members = Vocabulary.module.members;
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
