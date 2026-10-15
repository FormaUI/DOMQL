import { describe, it, expect } from 'vitest';
import { SnapshotPatcher } from '#domql/snapshots/SnapshotPatcher.mjs';

/** Immutable data, as a snapshot is. */
const freeze = value => (Array.isArray(value)
    ? Object.freeze(value.map(freeze))
    : value !== null && typeof value === 'object' ? Object.freeze(Object.fromEntries(Object.entries(value).map(([name, field]) => [name, freeze(field)]))) : value);

/** Elements that stand for themselves, by which a projected list is matched. */
const elements = (...names) => names.map(name => ({ nodeType: 1, name }));

/** The identities of a top-level object whose field `rows` was projected from the elements. */
const rowsOf = rowElements => ({ fields: { rows: { elements: rowElements, items: rowElements.map(() => null) } } });

describe('SnapshotPatcher', () => {
    describe('changeSetBetween', () => {
        it('answers no operation for a result that did not change, shared or equal', () => {
            const result = freeze({ count: 3, rows: [{ key: 'a' }] });

            expect(SnapshotPatcher.changeSetBetween(result, null, result, null)).toEqual([]);
            expect(SnapshotPatcher.changeSetBetween(result, null, freeze({ count: 3, rows: [{ key: 'a' }] }), null)).toEqual([]);
        });

        it('replaces a field that changed, at its path', () => {
            const operations = SnapshotPatcher.changeSetBetween(freeze({ panel: { size: { width: 10, height: 5 } }, kind: 'list' }), null, freeze({ panel: { size: { width: 12, height: 5 } }, kind: 'list' }), null);

            expect(operations).toEqual([{ op: 'replace', path: '/panel/size/width', value: 12 }]);
        });

        it('replaces a value that became null or stopped being null, whole', () => {
            expect(SnapshotPatcher.changeSetBetween(freeze({ panel: { width: 1 } }), null, freeze({ panel: null }), null)).toEqual([{ op: 'replace', path: '/panel', value: null }]);
            expect(SnapshotPatcher.changeSetBetween(freeze({ panel: null }), null, freeze({ panel: { width: 1 } }), null)).toEqual([{ op: 'replace', path: '/panel', value: { width: 1 } }]);
        });

        it('replaces the whole result where it is no object', () => {
            expect(SnapshotPatcher.changeSetBetween(3, null, 4, null)).toEqual([{ op: 'replace', path: '', value: 4 }]);
        });

        it('changes a list that is no projection of elements by position', () => {
            expect(SnapshotPatcher.changeSetBetween(freeze({ ids: [1, 2, 3] }), null, freeze({ ids: [1, 5, 3, 4] }), null)).toEqual([
                { op: 'replace', path: '/ids/1', value: 5 },
                { op: 'add', path: '/ids/3', value: 4 },
            ]);
            expect(SnapshotPatcher.changeSetBetween(freeze({ ids: [1, 2, 3] }), null, freeze({ ids: [1] }), null)).toEqual([
                { op: 'remove', path: '/ids/2' },
                { op: 'remove', path: '/ids/1' },
            ]);
        });

        it('adds and removes the items of elements entering and leaving a projected list', () => {
            const [a, b, c] = elements('a', 'b', 'c');
            const operations = SnapshotPatcher.changeSetBetween(
                freeze({ rows: [{ key: 'a' }, { key: 'b' }] }), rowsOf([a, b]),
                freeze({ rows: [{ key: 'a' }, { key: 'c' }] }), rowsOf([a, c]),
            );

            expect(operations).toEqual([
                { op: 'remove', path: '/rows/1' },
                { op: 'add', path: '/rows/1', value: { key: 'c' } },
            ]);
        });

        it('moves the item of an element that changed position, rather than rewriting the list', () => {
            const [a, b, c] = elements('a', 'b', 'c');
            const operations = SnapshotPatcher.changeSetBetween(
                freeze({ rows: [{ key: 'a' }, { key: 'b' }, { key: 'c' }] }), rowsOf([a, b, c]),
                freeze({ rows: [{ key: 'c' }, { key: 'a' }, { key: 'b' }] }), rowsOf([c, a, b]),
            );

            expect(operations).toEqual([{ op: 'move', from: '/rows/2', path: '/rows/0' }]);
        });

        it('moves and updates items in one change, each update at the item\'s new position', () => {
            const [a, b, c] = elements('a', 'b', 'c');
            const operations = SnapshotPatcher.changeSetBetween(
                freeze({ rows: [{ key: 'a', height: 1 }, { key: 'b', height: 2 }, { key: 'c', height: 3 }] }), rowsOf([a, b, c]),
                freeze({ rows: [{ key: 'b', height: 2 }, { key: 'c', height: 30 }, { key: 'a', height: 10 }] }), rowsOf([b, c, a]),
            );

            expect(operations).toEqual([
                { op: 'move', from: '/rows/1', path: '/rows/0' },
                { op: 'move', from: '/rows/2', path: '/rows/1' },
                { op: 'replace', path: '/rows/1/height', value: 30 },
                { op: 'replace', path: '/rows/2/height', value: 10 },
            ]);
        });

        it('tells apart two elements that project to the same data, by the element and never by the data', () => {
            const [a, b] = elements('a', 'b');

            // The two items swap places and the one now first changes: the change belongs to b, wherever its data stood before.
            const operations = SnapshotPatcher.changeSetBetween(
                freeze({ rows: [{ selected: false }, { selected: false }] }), rowsOf([a, b]),
                freeze({ rows: [{ selected: true }, { selected: false }] }), rowsOf([b, a]),
            );

            expect(operations).toEqual([
                { op: 'move', from: '/rows/1', path: '/rows/0' },
                { op: 'replace', path: '/rows/0/selected', value: true },
            ]);
        });

        it('matches by position a projected list in which an element stands twice or an item is null', () => {
            const [a, b] = elements('a', 'b');

            expect(SnapshotPatcher.changeSetBetween(freeze({ rows: [{ k: 1 }, { k: 1 }] }), rowsOf([a, a]), freeze({ rows: [{ k: 1 }, { k: 2 }] }), rowsOf([a, b]))).toEqual([
                { op: 'replace', path: '/rows/1/k', value: 2 },
            ]);
            expect(SnapshotPatcher.changeSetBetween(freeze({ rows: [null, { k: 1 }] }), rowsOf([null, a]), freeze({ rows: [{ k: 1 }, null] }), rowsOf([a, null]))).toEqual([
                { op: 'replace', path: '/rows/0', value: { k: 1 } },
                { op: 'replace', path: '/rows/1', value: null },
            ]);
        });

        it('escapes a name the way a JSON Pointer does', () => {
            expect(SnapshotPatcher.changeSetBetween(freeze({ 'a/b': 1, '~c': 1 }), null, freeze({ 'a/b': 2, '~c': 2 }), null)).toEqual([
                { op: 'replace', path: '/a~1b', value: 2 },
                { op: 'replace', path: '/~0c', value: 2 },
            ]);
        });
    });

    /** A copy that is mutable throughout, as live state is. */
    const thaw = value => JSON.parse(JSON.stringify(value));

    const roundTrips = [
        ['fields, nulls and positional lists', freeze({ a: 1, b: { c: [1, 2] }, d: null }), null, freeze({ a: 2, b: { c: [2] }, d: { e: 'x' } }), null],
        ['a projected list reordered, updated, grown and shrunk at once', ...(() => {
            const [a, b, c, d, e] = elements('a', 'b', 'c', 'd', 'e');

            return [
                freeze({ rows: [{ k: 'a', n: 1 }, { k: 'b', n: 2 }, { k: 'c', n: 3 }, { k: 'd', n: 4 }] }), rowsOf([a, b, c, d]),
                freeze({ rows: [{ k: 'd', n: 4 }, { k: 'e', n: 5 }, { k: 'b', n: 20 }, { k: 'a', n: 1 }] }), rowsOf([d, e, b, a]),
            ];
        })()],
        ['projected items that hold the same data', ...(() => {
            const [a, b, c] = elements('a', 'b', 'c');

            return [freeze({ rows: [{ x: 0 }, { x: 0 }, { x: 0 }] }), rowsOf([a, b, c]), freeze({ rows: [{ x: 0 }, { x: 1 }, { x: 0 }] }), rowsOf([c, a, b])];
        })()],
    ];

    describe('changeSetBetween, then applyInPlace', () => {
        it.each(roundTrips)('give the next result when the change set is applied in place to the previous one: %s', (_, previous, previousIdentities, next, nextIdentities) => {
            const state = thaw(previous);

            SnapshotPatcher.applyInPlace(state, SnapshotPatcher.changeSetBetween(previous, previousIdentities, next, nextIdentities));

            expect(state).toEqual(next);
        });
    });

    describe('applyInPlace', () => {
        it('writes a field named __proto__ as an ordinary field of its own, whether a change set adds it, replaces it or replaces the whole result', () => {
            const added = thaw({ id: 'a' });
            const replaced = thaw(JSON.parse('{ "__proto__": { "first": true }, "id": "a" }'));
            const whole = thaw({ id: 'a' });

            SnapshotPatcher.applyInPlace(added, [{ op: 'add', path: '/__proto__', value: { polluted: true } }]);
            SnapshotPatcher.applyInPlace(replaced, [{ op: 'replace', path: '/__proto__', value: { polluted: true } }]);
            SnapshotPatcher.applyInPlace(whole, [{ op: 'replace', path: '', value: JSON.parse('{ "__proto__": { "polluted": true }, "id": "b" }') }]);

            for (const state of [added, replaced, whole]) {
                expect(Object.keys(state)).toContain('__proto__');
                expect(Object.getPrototypeOf(state)).toBe(Object.prototype);
                expect(Object.getOwnPropertyDescriptor(state, '__proto__').value).toEqual({ polluted: true });
                expect(state.polluted).toBeUndefined();
            }
        });

        it('changes the state itself, and every object and list the change set reaches into stays the same object', () => {
            const state = thaw({ panel: { size: { width: 10 } }, ids: [1, 2] });
            const { panel, ids } = state;

            SnapshotPatcher.applyInPlace(state, [{ op: 'replace', path: '/panel/size/width', value: 12 }, { op: 'add', path: '/ids/2', value: 3 }]);

            expect(state).toEqual({ panel: { size: { width: 12 } }, ids: [1, 2, 3] });
            expect(state.panel).toBe(panel);
            expect(state.ids).toBe(ids);
        });

        it('moves an item itself, so it keeps its identity', () => {
            const state = thaw({ rows: [{ k: 'a' }, { k: 'b' }] });
            const [first, second] = state.rows;

            SnapshotPatcher.applyInPlace(state, [{ op: 'move', from: '/rows/1', path: '/rows/0' }]);

            expect(state.rows[0]).toBe(second);
            expect(state.rows[1]).toBe(first);
        });

        it('brings a value in as mutable data that nothing else holds', () => {
            const value = freeze({ k: 'c' });
            const state = thaw({ rows: [] });

            SnapshotPatcher.applyInPlace(state, [{ op: 'add', path: '/rows/0', value }]);

            expect(state.rows[0]).toEqual(value);
            expect(state.rows[0]).not.toBe(value);
            expect(Object.isFrozen(state.rows[0])).toBe(false);
        });

        it('replaces the whole result in the state itself, which keeps its kind', () => {
            const object = { a: 1, b: 2 };
            const list = [1, 2, 3];

            SnapshotPatcher.applyInPlace(object, [{ op: 'replace', path: '', value: freeze({ c: 3 }) }]);
            SnapshotPatcher.applyInPlace(list, [{ op: 'replace', path: '', value: freeze([4]) }]);

            expect(object).toEqual({ c: 3 });
            expect(list).toEqual([4]);
            expect(() => SnapshotPatcher.applyInPlace({ a: 1 }, [{ op: 'replace', path: '', value: [1] }])).toThrow(TypeError);
        });

        it.each([
            ['a path past the end of a list', [{ op: 'replace', path: '/rows/3', value: 1 }]],
            ['a field the result does not hold', [{ op: 'replace', path: '/missing', value: 1 }]],
            ['the removal of the whole result', [{ op: 'remove', path: '' }]],
            ['an operation a change set does not have', [{ op: 'copy', from: '/rows/0', path: '/rows/1' }]],
        ])('refuses %s', (_, operations) => {
            expect(() => SnapshotPatcher.applyInPlace(thaw({ rows: [{ k: 'a' }] }), operations)).toThrow(TypeError);
        });
    });
});
