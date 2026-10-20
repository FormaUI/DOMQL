import { describe, it, expect } from 'vitest';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserVocabulary } from '#domql/dom/BrowserVocabulary.mjs';

describe('BrowserModule', () => {
    const module = BrowserModule.create();
    const declared = [...module.members, ...module.observationTypes, ...module.conversions, ...module.conditions].map(declaration => declaration.function).filter(key => key !== undefined);

    it('is the DOM vocabulary', () => {
        expect(module.name).toBe('domql');
        expect(module.members.map(member => member.name)).toEqual(BrowserVocabulary.module.members.map(member => member.name));
    });

    it('carries out every member, conversion and condition and starts every observation type the vocabulary declares', () => {
        for (const key of declared) {
            expect(module.functions[key], key).toBeTypeOf('function');
        }
    });

    it('supplies no function that no declaration names', () => {
        expect(Object.keys(module.functions).sort()).toEqual([...new Set(declared)].sort());
    });

    it('leaves the DOM vocabulary alone declaring, with no function to carry anything out', () => {
        expect(BrowserVocabulary.module.functions).toBeNull();
    });
});
