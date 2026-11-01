/**
 * Provenance — the references a list's items descend from, as Nexo records them, by which a list's items are matched from one snapshot to the next
 */

export class Provenance {
    /**
     * The reference each item of a list descends from, its provenance, the source the earliest projection it descends from recorded, or null where the list is matched by position: no projection built it, an item descends
     * from data or from null, or one reference stands in it twice. Nexo classifies each source, so the kind it reports, never the value, says what is a reference.
     * @param {object | null} metadata The metadata Nexo gave the list.
     * @param {number} length The number of items the list holds.
     * @returns {unknown[] | null}
     */
    static referencesOf(metadata, length) {
        const provenance = metadata?.provenance ?? null;

        if (provenance === null || provenance.length !== length || provenance.some(source => source.kind !== 'reference')) {
            return null;
        }

        const references = provenance.map(source => source.value);

        return new Set(references).size === length ? references : null;
    }
}
