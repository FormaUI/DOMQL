import { describe, it, expect } from 'vitest';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserObservationImplementations } from '#domql/dom/BrowserObservationImplementations.mjs';
import { BrowserVocabularyDeclarations } from '#domql/dom/BrowserVocabularyDeclarations.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';
import { BrowserVocabularyImplementations } from '#domql/dom/BrowserVocabularyImplementations.mjs';

/** The declarations of a module that run code: its members, observation types and conversions. */
const declarationsOf = module => [...module.members, ...module.observationTypes, ...module.conversions];

/** What carries the declaration out: its own implementation, or a host call's, which DOMQL's dispatch table keeps. */
const implementationOf = declaration => declaration.implementation ?? DispatchTable.get(declaration)?.implementation;

describe('BrowserModule', () => {
    const module = BrowserModule.create();
    const keys = Object.keys({ ...BrowserVocabularyImplementations.implementations, ...BrowserObservationImplementations.implementations });

    it('is the DOM vocabulary', () => {
        expect(module.name).toBe('domql');
        expect(module.members.map(member => member.name)).toEqual(BrowserVocabularyDeclarations.module.members.map(member => member.name));
    });

    it('carries out every member and conversion and starts every observation type the vocabulary declares', () => {
        for (const declaration of declarationsOf(module)) {
            expect(implementationOf(declaration), declaration.name ?? `${declaration.from} to ${declaration.to}`).toBeTypeOf('function');
        }
    });

    it('supplies no implementation that no declaration takes', () => {
        // Each key's stand-in answers the key, so the stand-ins the declarations carry name the keys they take.
        const standIns = Object.fromEntries(keys.map(key => [key, () => key]));
        const taken = declarationsOf(BrowserVocabularyDeclarations.createModule(standIns)).map(declaration => implementationOf(declaration)?.());

        expect([...new Set(taken)].sort()).toEqual([...keys].sort());
    });

    it('leaves the DOM vocabulary alone declaring, with no implementation to carry anything out', () => {
        expect(declarationsOf(BrowserVocabularyDeclarations.module).filter(declaration => implementationOf(declaration) !== undefined)).toEqual([]);
    });
});
