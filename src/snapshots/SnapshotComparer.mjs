/**
 * SnapshotComparer — compares the snapshots of a query's result, so a watch reports one that differs and shares what did not change
 */

import { ObjectUtils } from '../common/ObjectUtils.mjs';

export class SnapshotComparer {
    /**
     * The next snapshot, in which every branch equal to the previous snapshot's is the previous branch itself, so a snapshot that did not change is the previous one and a new snapshot shares what it did not change.
     * Strings, Booleans and null compare exactly, and a number compares within the tolerance its metadata gives where the previous and the next value have one origin, and exactly where their origins differ or it has none.
     * An item of a list projected from references is compared with the previous item of the same reference, wherever it stood, so a reordered list shares the items that did not change.
     * @param {unknown} previous The snapshot last reported.
     * @param {object | null} previousMetadata The metadata Lexica gave the previous snapshot.
     * @param {unknown} next The snapshot to compare, which is frozen.
     * @param {object | null} nextMetadata The metadata Lexica gave the next snapshot, which it follows.
     */
    reconcile(previous, previousMetadata, next, nextMetadata) {
        return SnapshotComparer.#reconcilePart(previous, previousMetadata, next, nextMetadata);
    }

    /** A part with a record of its fields or of its items is compared part by part, and any other as a value, within its tolerance where both values have one origin. */
    static #reconcilePart(previous, previousMetadata, next, nextMetadata) {
        if (nextMetadata?.items !== undefined && Array.isArray(next)) {
            return SnapshotComparer.#reconcileItems(previous, previousMetadata, next, nextMetadata);
        }

        if (nextMetadata?.fields !== undefined && ObjectUtils.isNonArrayObject(next)) {
            return SnapshotComparer.#reconcileFields(previous, previousMetadata, next, nextMetadata);
        }

        const tolerance = previousMetadata !== null && previousMetadata?.origin === nextMetadata?.origin ? nextMetadata.tolerance : null;

        return SnapshotComparer.#reconcileValue(previous, previousMetadata, next, nextMetadata, tolerance);
    }

    /** A projected list, its items matched by the reference each came from where both lists' references tell them apart, and by position otherwise. */
    static #reconcileItems(previous, previousMetadata, next, nextMetadata) {
        const previousItems = Array.isArray(previous) ? previous : [];
        const previousIndexes = SnapshotComparer.#matchBySource(previousMetadata, previousItems.length, nextMetadata, next.length);
        const isSameLength = Array.isArray(previous) && previous.length === next.length;

        // The items are gathered only from the first that is not the previous list's at its place, until which they are the previous list's own.
        let items = null;

        for (let index = 0; index < next.length; index++) {
            const previousIndex = previousIndexes === null ? index : previousIndexes[index];
            const item = next[index] === null ? null : SnapshotComparer.#reconcilePart(previousIndex === -1 ? undefined : previousItems[previousIndex], previousMetadata?.items?.[previousIndex] ?? null, next[index], nextMetadata.items[index] ?? null);

            if (items === null && isSameLength && item === previous[index]) {
                continue;
            }

            items ??= previousItems.slice(0, index);
            items.push(item);
        }

        return items === null && isSameLength ? previous : Object.freeze(items ?? []);
    }

    /** An object an object expression built, its fields compared in the order written, each by its own record. */
    static #reconcileFields(previous, previousMetadata, next, nextMetadata) {
        const previousRecord = ObjectUtils.isNonArrayObject(previous) ? previous : undefined;
        const names = Object.keys(nextMetadata.fields);
        const isSameShape = previousRecord !== undefined && SnapshotComparer.#hasFieldCount(previousRecord, names.length);

        // The fields are gathered only from the first that is not the previous object's, until which they are the previous object's own.
        let fields = null;

        for (let index = 0; index < names.length; index++) {
            const name = names[index];
            const value = SnapshotComparer.#reconcilePart(previousRecord?.[name], previousMetadata?.fields?.[name] ?? null, next[name], nextMetadata.fields[name]);

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

    /** For each next item, the index of the previous item projected from its reference, or -1 for a reference that entered; null where either list is matched by position. */
    static #matchBySource(previousMetadata, previousLength, nextMetadata, nextLength) {
        const previousSources = previousMetadata?.sources ?? null;
        const nextSources = nextMetadata?.sources ?? null;
        const canMatchBySource = (sources, length) => sources !== null && sources.length === length && !sources.includes(null) && new Set(sources).size === length;

        if (!canMatchBySource(previousSources, previousLength) || !canMatchBySource(nextSources, nextLength)) {
            return null;
        }

        const previousIndexBySource = new Map(previousSources.map((source, previousIndex) => [source, previousIndex]));

        return nextSources.map(source => previousIndexBySource.get(source) ?? -1);
    }

    /** The previous value where the next equals it, and the next otherwise, with the branches that are equal shared, the tolerance applied to every number within, and the items of a projected list matched by reference. */
    static #reconcileValue(previous, previousMetadata, next, nextMetadata, tolerance) {
        if (previous === next) {
            return previous;
        }

        if (typeof previous === 'number' && typeof next === 'number') {
            return tolerance !== null && Math.abs(previous - next) <= tolerance ? previous : next;
        }

        if (Array.isArray(previous) && Array.isArray(next)) {
            const previousIndexes = SnapshotComparer.#matchBySource(previousMetadata, previous.length, nextMetadata, next.length);
            const items = next.map((item, index) => {
                const previousIndex = previousIndexes === null ? (index < previous.length ? index : -1) : previousIndexes[index];

                return previousIndex === -1 ? item : SnapshotComparer.#reconcileValue(previous[previousIndex], previousMetadata?.items?.[previousIndex] ?? null, item, nextMetadata?.items?.[index] ?? null, tolerance);
            });

            return SnapshotComparer.#sameItems(previous, items) ? previous : Object.freeze(items);
        }

        if (ObjectUtils.isNonArrayObject(previous) && ObjectUtils.isNonArrayObject(next)) {
            const fields = Object.fromEntries(Object.entries(next).map(([name, field]) => [name, Object.hasOwn(previous, name) ? SnapshotComparer.#reconcileValue(previous[name], previousMetadata?.fields?.[name] ?? null, field, nextMetadata?.fields?.[name] ?? null, tolerance) : field]));

            return SnapshotComparer.#sameFields(previous, fields) ? previous : Object.freeze(fields);
        }

        return next;
    }

    static #sameItems(previous, items) {
        return Array.isArray(previous) && previous.length === items.length && items.every((item, index) => item === previous[index]);
    }

    static #sameFields(previous, fields) {
        if (!ObjectUtils.isNonArrayObject(previous)) {
            return false;
        }

        const names = Object.keys(fields);

        return names.length === Object.keys(previous).length && names.every(name => fields[name] === previous[name]);
    }
}
