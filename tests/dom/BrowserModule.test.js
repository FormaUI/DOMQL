import { describe, it, expect } from 'vitest';
import { BrowserExecutionImplementations } from '#domql/dom/BrowserExecutionImplementations.mjs';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserObservationImplementations } from '#domql/dom/BrowserObservationImplementations.mjs';
import { BrowserVocabularyDeclarations } from '#domql/dom/BrowserVocabularyDeclarations.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';
import { BrowserVocabularyImplementations } from '#domql/dom/BrowserVocabularyImplementations.mjs';

/**
 * The declarations of a module that run code: its module members, the members and operators within its reference types, the host calls within its structured types, and its observation types. A structured type's data
 * shape runs none, since Nexo reads it from the data.
 */
const declarationsOf = module => [
    ...module.members,
    ...module.types.filter(type => type.kind === 'reference').flatMap(type => type.members),
    ...module.types.filter(type => type.kind === 'structured').flatMap(type => type.members.filter(member => member.invokedBy === 'host')),
    ...module.observationTypes,
];

/** What carries the declaration out: its own implementation, or a host call's, which DOMQL's dispatch table keeps. */
const implementationOf = declaration => declaration.impl ?? DispatchTable.get(declaration)?.implementation;

/** Whether the declaration is a cast, which, without an implementation, answers its value as it is. */
const isCast = declaration => declaration.kind === 'operator' && declaration.name === 'cast';

describe('BrowserModule', () => {
    const module = BrowserModule.create();
    const keys = Object.keys({ ...BrowserVocabularyImplementations.implementations, ...BrowserExecutionImplementations.implementations, ...BrowserObservationImplementations.implementations });

    it('is the DOM vocabulary', () => {
        const shapeOf = declared => declared.types.map(type => [type.name, type.members.map(member => member.name ?? `${type.name}[]`)]);

        expect(module.name).toBe('Domql');
        expect(module.members.map(member => member.name)).toEqual(BrowserVocabularyDeclarations.module.members.map(member => member.name));
        expect(shapeOf(module)).toEqual(shapeOf(BrowserVocabularyDeclarations.module));
    });

    it('carries out every member and starts every observation type the vocabulary declares, the cast of an ARIA view alone answering its value as it is', () => {
        for (const declaration of declarationsOf(module).filter(candidate => !isCast(candidate))) {
            expect(implementationOf(declaration), declaration.name).toBeTypeOf('function');
        }

        expect(declarationsOf(module).filter(isCast).map(declaration => [declaration.result, implementationOf(declaration)])).toEqual([['Element', undefined]]);
    });

    it('supplies no implementation that no declaration takes', () => {
        // Each key's stand-in answers the key, so the stand-ins the declarations carry name the keys they take.
        const standIns = Object.fromEntries(keys.map(key => [key, () => key]));
        const taken = declarationsOf(BrowserVocabularyDeclarations.createModule(standIns)).filter(declaration => !isCast(declaration)).map(declaration => implementationOf(declaration)?.());

        expect([...new Set(taken)].sort()).toEqual([...keys].sort());
    });

    it('leaves the DOM vocabulary alone declaring, with no implementation to carry anything out', () => {
        expect(declarationsOf(BrowserVocabularyDeclarations.module).filter(declaration => implementationOf(declaration) !== undefined)).toEqual([]);
    });
});
