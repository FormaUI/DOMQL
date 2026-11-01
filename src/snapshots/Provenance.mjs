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

    /**
     * Whether two lists of one length each record a provenance for every item, and the item at each place descends from the same source value in both, as the items of a list that kept their places do. Matching such
     * lists by reference matches each item with the item at its own place, as matching by position does, so neither list's references need be listed; they are compared place by place, and nothing is allocated.
     * @param {object | null} previousMetadata The metadata Nexo gave the previous list.
     * @param {number} previousLength The number of items the previous list holds.
     * @param {object | null} nextMetadata The metadata Nexo gave the next list.
     * @param {number} nextLength The number of items the next list holds.
     */
    static keepsPlaces(previousMetadata, previousLength, nextMetadata, nextLength) {
        const previous = previousMetadata?.provenance ?? null;
        const next = nextMetadata?.provenance ?? null;

        if (previous === null || next === null || previousLength !== nextLength || previous.length !== previousLength || next.length !== nextLength) {
            return false;
        }

        for (let index = 0; index < nextLength; index++) {
            if (previous[index].value !== next[index].value) {
                return false;
            }
        }

        return true;
    }
}
