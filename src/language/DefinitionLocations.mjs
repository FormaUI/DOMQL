/**
 * DefinitionLocations — where in a definition its caller supplied each part of its canonical copy came from, for one whose validation moved a part
 */

export class DefinitionLocations {
    #definition;
    #partIndexes;

    /**
     * @param {object} definition The canonical copy.
     * @param {WeakMap<object, number[]>} partIndexes The index each part of an interpolated string had in the caller's definition, by the canonical node, for each node whose parts validation moved.
     */
    constructor(definition, partIndexes) {
        this.#definition = definition;
        this.#partIndexes = partIndexes;
    }

    /** The pointer into the caller's definition of the part the pointer names in the canonical copy: the same pointer, but for each part of an interpolated string validation moved, which its original index names. */
    locate(pointer) {
        const segments = pointer.split('/').slice(1);
        const original = [];
        let node = this.#definition;

        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];

            original.push(segment);

            if (segment === 'parts' && this.#partIndexes.has(node) && index + 1 < segments.length) {
                const part = Number(segments[++index]);

                original.push(String(this.#partIndexes.get(node)[part] ?? part));
                node = node.parts[part];
            } else {
                node = node?.[segment];
            }
        }

        return { pointer: segments.length === 0 ? pointer : `/${original.join('/')}` };
    }
}
