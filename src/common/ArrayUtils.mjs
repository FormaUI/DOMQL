/**
 * ArrayUtils — operations on JavaScript arrays that need no knowledge of the language, a document or snapshots
 */

export class ArrayUtils {
    /** The first index of the list that holds no value at all, a hole, or -1 where every index holds one; an index that holds `undefined` holds a value. */
    static findMissingIndex(list) {
        for (let index = 0; index < list.length; index++) {
            if (!(index in list)) {
                return index;
            }
        }

        return -1;
    }
}
