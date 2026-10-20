/**
 * LiveState — one object a watch keeps current in place: it keeps its identity, and so does every object and list beneath it while its path holds one
 */

import { SnapshotPatcher } from './SnapshotPatcher.mjs';

export class LiveState {
    /** The object the caller holds, or null before the first snapshot. @type {object | unknown[] | null} */
    #state = null;

    /** The snapshot the state was last brought to, and the metadata Lexica gave it, against which the next change set is computed. */
    #snapshot = null;
    #metadata = null;

    /** The object the caller holds, the same from the first snapshot on, or null before it. */
    get state() {
        return this.#state;
    }

    /**
     * Brings the state to the snapshot, in place, and returns the change set that did, frozen. The first snapshot builds the state, and returns no changes.
     * @param {object | unknown[]} snapshot The result, an object or a list.
     * @param {object | null} metadata The metadata Lexica gave it, whose projected lists tell the references their items came from.
     * @returns {readonly import('./SnapshotPatcher.mjs').ChangeOperation[]}
     */
    update(snapshot, metadata) {
        let changes = [];

        if (this.#state === null) {
            this.#state = Array.isArray(snapshot) ? [] : {};
            SnapshotPatcher.applyInPlace(this.#state, [{ op: 'replace', path: '', value: snapshot }]);
        } else {
            changes = SnapshotPatcher.changeSetBetween(this.#snapshot, this.#metadata, snapshot, metadata);
            SnapshotPatcher.applyInPlace(this.#state, changes);
        }

        this.#snapshot = snapshot;
        this.#metadata = metadata;

        return Object.freeze(changes.map(operation => Object.freeze(operation)));
    }
}
