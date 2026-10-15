/**
 * SnapshotComparer — compares the snapshots of a query's result, so a watch reports one that differs and shares what did not change
 */

export class SnapshotComparer {
    #resolvedDefinition;

    /** @param {import('../language/ResolvedDefinition.mjs').ResolvedDefinition} resolvedDefinition The resolved definition whose snapshots are compared. */
    constructor(resolvedDefinition) {
        this.#resolvedDefinition = resolvedDefinition;
    }

    /**
     * The next snapshot, in which every branch equal to the previous snapshot's is the previous branch itself, so a snapshot that did not change is the previous one and a new snapshot shares what it did not change.
     * Strings, Booleans and null compare exactly, and a number compares within the tolerance the member that produced it declares, and exactly where it declares none.
     * An item of a list projected from elements is compared with the previous item of the same element, wherever it stood, so a reordered list shares the items that did not change.
     * @param {unknown} previous The snapshot last reported.
     * @param {import('./SnapshotPatcher.mjs').Identities} previousIdentities The elements the previous snapshot's lists were projected from.
     * @param {unknown} next The snapshot to compare, which is frozen.
     * @param {import('./SnapshotPatcher.mjs').Identities} nextIdentities The elements the next snapshot's lists were projected from, which it follows.
     */
    reconcile(previous, previousIdentities, next, nextIdentities) {
        return this.#reconcileNode(this.#resolvedDefinition.definition.query, previous, previousIdentities, next, nextIdentities);
    }

    #reconcileNode(node, previous, previousIdentities, next, nextIdentities) {
        // A local gives the value of the expression it names, compared as that expression is, and an optional chain the value of the chain it holds.
        if (node.kind === 'local') {
            return this.#reconcileNode(this.#resolvedDefinition.resolutionOf(node).value, previous, previousIdentities, next, nextIdentities);
        }

        if (node.kind === 'optionalChain') {
            return this.#reconcileNode(node.target, previous, previousIdentities, next, nextIdentities);
        }

        // A conditional and a coalescing each give the value of the side they selected, compared as that side is where both values came from it.
        if (node.kind === 'conditional' || node.kind === 'coalescing') {
            const branch = SnapshotComparer.#branchOf(node, previousIdentities, nextIdentities);

            return branch === null
                ? SnapshotComparer.#reconcileValue(previous, previousIdentities, next, nextIdentities, null)
                : this.#reconcileNode(branch, previous, previousIdentities, next, nextIdentities);
        }

        if (node.kind !== 'object' || next === null || typeof next !== 'object') {
            return SnapshotComparer.#reconcileValue(previous, previousIdentities, next, nextIdentities, this.#toleranceOf(node, previousIdentities, nextIdentities));
        }

        if (!Array.isArray(next)) {
            return this.#reconcileFields(node, previous, previousIdentities, next, nextIdentities);
        }

        // An object expression that follows a list projects each of its items, which are matched by element where the list was projected from elements and by position otherwise.
        const previousItems = Array.isArray(previous) ? previous : [];
        const previousIndexes = SnapshotComparer.#matchByElement(previousIdentities, previousItems.length, nextIdentities, next.length);
        const isSameLength = Array.isArray(previous) && previous.length === next.length;

        // The items are gathered only from the first that is not the previous list's at its place, until which they are the previous list's own.
        let items = null;

        for (let index = 0; index < next.length; index++) {
            const previousIndex = previousIndexes === null ? index : previousIndexes[index];
            const item = next[index] === null ? null : this.#reconcileFields(node, previousIndex === -1 ? undefined : previousItems[previousIndex], previousIdentities?.items?.[previousIndex] ?? null, next[index], nextIdentities?.items?.[index] ?? null);

            if (items === null && isSameLength && item === previous[index]) {
                continue;
            }

            items ??= previousItems.slice(0, index);
            items.push(item);
        }

        return items === null && isSameLength ? previous : Object.freeze(items ?? []);
    }

    #reconcileFields(node, previous, previousIdentities, next, nextIdentities) {
        const previousRecord = SnapshotComparer.#isRecord(previous) ? previous : undefined;
        const names = this.#resolvedDefinition.fieldNamesOf(node);
        const isSameShape = previousRecord !== undefined && SnapshotComparer.#hasFieldCount(previousRecord, names.length);

        // The fields are gathered only from the first that is not the previous object's, until which they are the previous object's own.
        let fields = null;

        for (let index = 0; index < names.length; index++) {
            const name = names[index];
            const value = this.#reconcileNode(node.fields[index].value, previousRecord?.[name], previousIdentities?.fields?.[name] ?? null, next[name], nextIdentities?.fields?.[name] ?? null);

            if (fields === null && isSameShape && Object.hasOwn(previousRecord, name) && value === previousRecord[name]) {
                continue;
            }

            if (fields === null) {
                fields = {};

                for (let earlier = 0; earlier < index; earlier++) {
                    fields[names[earlier]] = previousRecord[names[earlier]];
                }
            }

            fields[name] = value;
        }

        return fields === null ? (isSameShape ? previousRecord : Object.freeze({})) : Object.freeze(fields);
    }

    /** Whether the record has exactly as many fields as given, counted without a list of their names. */
    static #hasFieldCount(record, count) {
        let found = 0;

        for (const name in record) {
            if (Object.hasOwn(record, name) && ++found > count) {
                return false;
            }
        }

        return found === count;
    }

    /** For each next item, the index of the previous item projected from its element, or -1 for an element that entered; null where either list is matched by position. */
    static #matchByElement(previousIdentities, previousLength, nextIdentities, nextLength) {
        const previousElements = previousIdentities?.elements ?? null;
        const nextElements = nextIdentities?.elements ?? null;
        const canMatchByElement = (elements, length) => elements !== null && elements.length === length && !elements.includes(null) && new Set(elements).size === length;

        if (!canMatchByElement(previousElements, previousLength) || !canMatchByElement(nextElements, nextLength)) {
            return null;
        }

        const previousIndexByElement = new Map(previousElements.map((element, previousIndex) => [element, previousIndex]));

        return nextElements.map(element => previousIndexByElement.get(element) ?? -1);
    }

    /** The tolerance of the member that produced the value, which a field of its value shares, through the expression a local names and the branch a conditional selected for both values; null for a value that is no member's. */
    #toleranceOf(node, previousIdentities, nextIdentities) {
        if (node.kind === 'local') {
            return this.#toleranceOf(this.#resolvedDefinition.resolutionOf(node).value, previousIdentities, nextIdentities);
        }

        if (node.kind === 'optionalChain') {
            return this.#toleranceOf(node.target, previousIdentities, nextIdentities);
        }

        if (node.kind === 'conditional' || node.kind === 'coalescing') {
            const branch = SnapshotComparer.#branchOf(node, previousIdentities, nextIdentities);

            return branch === null ? null : this.#toleranceOf(branch, previousIdentities, nextIdentities);
        }

        if (node.kind !== 'member' && node.kind !== 'call' && node.kind !== 'infixCall') {
            return null;
        }

        let resolution = this.#resolvedDefinition.resolutionOf(node);

        // An access by name gave the value of the property it selected, compared within that one's tolerance where both values came from it.
        if (resolution?.kind === 'byName') {
            const name = SnapshotComparer.#branchOf(node, previousIdentities, nextIdentities);

            if (name === null) {
                return null;
            }

            resolution = resolution.candidates.get(name);
        }

        if (resolution?.kind === 'field') {
            return this.#toleranceOf(node.target, previousIdentities, nextIdentities);
        }

        return resolution?.declaration?.tolerance ?? null;
    }

    /** The branch the conditional selected for both values, or null where they came from different branches, or either from none recorded, which compare exactly. */
    static #branchOf(node, previousIdentities, nextIdentities) {
        const branch = nextIdentities?.branches?.get(node) ?? null;

        return branch !== null && branch === (previousIdentities?.branches?.get(node) ?? null) ? branch : null;
    }

    /** The previous value where the next equals it, and the next otherwise, with the branches that are equal shared and the items of a list projected from elements matched by element. */
    static #reconcileValue(previous, previousIdentities, next, nextIdentities, tolerance) {
        if (previous === next) {
            return previous;
        }

        if (typeof previous === 'number' && typeof next === 'number') {
            return tolerance !== null && Math.abs(previous - next) <= tolerance ? previous : next;
        }

        if (Array.isArray(previous) && Array.isArray(next)) {
            const previousIndexes = SnapshotComparer.#matchByElement(previousIdentities, previous.length, nextIdentities, next.length);
            const items = next.map((item, index) => {
                const previousIndex = previousIndexes === null ? (index < previous.length ? index : -1) : previousIndexes[index];

                return previousIndex === -1 ? item : SnapshotComparer.#reconcileValue(previous[previousIndex], previousIdentities?.items?.[previousIndex] ?? null, item, nextIdentities?.items?.[index] ?? null, tolerance);
            });

            return SnapshotComparer.#sameItems(previous, items) ? previous : Object.freeze(items);
        }

        if (SnapshotComparer.#isRecord(previous) && SnapshotComparer.#isRecord(next)) {
            const fields = Object.fromEntries(Object.entries(next).map(([name, field]) => [name, name in previous ? SnapshotComparer.#reconcileValue(previous[name], previousIdentities?.fields?.[name] ?? null, field, nextIdentities?.fields?.[name] ?? null, tolerance) : field]));

            return SnapshotComparer.#sameFields(previous, fields) ? previous : Object.freeze(fields);
        }

        return next;
    }

    static #sameItems(previous, items) {
        return Array.isArray(previous) && previous.length === items.length && items.every((item, index) => item === previous[index]);
    }

    static #sameFields(previous, fields) {
        if (!SnapshotComparer.#isRecord(previous)) {
            return false;
        }

        const names = Object.keys(fields);

        return names.length === Object.keys(previous).length && names.every(name => fields[name] === previous[name]);
    }

    static #isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
