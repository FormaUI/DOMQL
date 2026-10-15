import { describe, it, expect } from 'vitest';
import { ArrayUtils } from '#domql/common/ArrayUtils.mjs';

describe('ArrayUtils', () => {
    describe('findMissingIndex', () => {
        it('answers -1 for a list every index of which holds a value, an empty list included', () => {
            expect(ArrayUtils.findMissingIndex([])).toBe(-1);
            expect(ArrayUtils.findMissingIndex([1, null, 'x'])).toBe(-1);
        });

        it('counts an index holding undefined as holding a value, since it looks only at whether the index is present', () => {
            expect(ArrayUtils.findMissingIndex([undefined])).toBe(-1);
            expect(ArrayUtils.findMissingIndex(new Array(1))).toBe(0);
        });

        it('answers the first index that holds no value', () => {
            const list = [1, 2, 3, 4];

            delete list[2];
            delete list[3];

            expect(ArrayUtils.findMissingIndex(list)).toBe(2);
            expect(ArrayUtils.findMissingIndex([1, , 3])).toBe(1);
        });
    });
});
