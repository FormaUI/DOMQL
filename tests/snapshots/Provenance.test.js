import { describe, it, expect } from 'vitest';
import { Provenance } from '#domql/snapshots/Provenance.mjs';

/** A reference, as Nexo classifies an item's source. */
const reference = value => ({ kind: 'reference', value });

describe('Provenance', () => {
    it('answers the reference each item of a list descends from, in the list\'s order', () => {
        const [first, second] = [{ id: 'first' }, { id: 'second' }];
        const references = Provenance.referencesOf({ provenance: [reference(second), reference(first)] }, 2);

        expect(references).toHaveLength(2);
        expect(references[0]).toBe(second);
        expect(references[1]).toBe(first);
    });

    it('answers null where the list is matched by position: no projection built it, an item descends from data or from null, or one reference stands in it twice', () => {
        const element = { id: 'element' };

        expect(Provenance.referencesOf(null, 0)).toBeNull();
        expect(Provenance.referencesOf({ origin: {} }, 1)).toBeNull();
        expect(Provenance.referencesOf({ provenance: [reference(element)] }, 2)).toBeNull();
        expect(Provenance.referencesOf({ provenance: [reference(element), { kind: 'data', value: { id: 'data' } }] }, 2)).toBeNull();
        expect(Provenance.referencesOf({ provenance: [reference(element), { kind: 'null' }] }, 2)).toBeNull();
        expect(Provenance.referencesOf({ provenance: [reference(element), reference(element)] }, 2)).toBeNull();
    });

    it('tells a reference by the kind Nexo reports, never by its value', () => {
        const element = { id: 'element' };

        expect(Provenance.referencesOf({ provenance: [{ kind: 'data', value: element }] }, 1)).toBeNull();
        expect(Provenance.referencesOf({ provenance: [reference('hall')] }, 1)).toEqual(['hall']);
    });
});
