import { describe, it, expect } from 'vitest';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserObservers } from '#domql/dom/BrowserObservers.mjs';
import { BrowserVocabulary } from '#domql/dom/BrowserVocabulary.mjs';
import { VocabularyImplementations } from '#domql/dom/VocabularyImplementations.mjs';

/** The declarations of a module that run code: its members, observation types, conversions and predicates. */
const declarationsOf = module => [...module.members, ...module.observationTypes, ...module.conversions, ...module.predicates];

describe('BrowserModule', () => {
    const module = BrowserModule.create();
    const keys = Object.keys({ ...VocabularyImplementations.implementations, ...BrowserObservers.implementations });

    it('is the DOM vocabulary', () => {
        expect(module.name).toBe('domql');
        expect(module.members.map(member => member.name)).toEqual(BrowserVocabulary.module.members.map(member => member.name));
    });

    it('carries out every member, conversion and predicate and starts every observation type the vocabulary declares', () => {
        for (const declaration of declarationsOf(module)) {
            expect(declaration.implementation, declaration.name ?? `${declaration.from} to ${declaration.to}`).toBeTypeOf('function');
        }
    });

    it('supplies no implementation that no declaration takes', () => {
        // Each key's stand-in answers the key, so the stand-ins the declarations carry name the keys they take.
        const standIns = Object.fromEntries(keys.map(key => [key, () => key]));
        const taken = declarationsOf(BrowserVocabulary.createModule(standIns)).map(declaration => declaration.implementation?.());

        expect([...new Set(taken)].sort()).toEqual([...keys].sort());
    });

    it('leaves the DOM vocabulary alone declaring, with no implementation to carry anything out', () => {
        expect(declarationsOf(BrowserVocabulary.module).filter(declaration => declaration.implementation !== undefined)).toEqual([]);
    });
});
