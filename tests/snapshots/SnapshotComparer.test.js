import { describe, it, expect } from 'vitest';
import { SnapshotComparer } from '#domql/snapshots/SnapshotComparer.mjs';
import { domql } from '#domql/domql.js';
import { LanguageResolver } from '#domql/language/LanguageResolver.mjs';
import { DomqlModule } from '#domql/language/vocabulary/DomqlModule.mjs';
import { ModuleRegistry } from '#domql/language/vocabulary/ModuleRegistry.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';

/** A module of a size with the tolerance the test gives it, and one of a number with none. */
const property = (name, result, tolerance = {}) => new DomqlModule(name, {
    members: [{ name, function: name, kind: 'property', on: 'element', parameters: [], result, changes: 'constant', reads: 'fresh', ...tolerance }],
}, null);

/** A query resolved against the vocabulary and the two test modules. */
const resolvedOf = (text, bindings, tolerance) => {
    const registry = new ModuleRegistry([Vocabulary.module, property('wobble', 'size', tolerance), property('steady', 'number')]);
    const query = domql.query(text, bindings);

    return new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);
};

/** The comparer of the snapshots of a query, which compares them as a watch does. */
const snapshotComparerOf = (text, bindings = {}, tolerance = {}) => new SnapshotComparer(resolvedOf(text, bindings, tolerance));

const freeze = value => (Array.isArray(value) ? Object.freeze(value.map(freeze)) : (value !== null && typeof value === 'object' ? Object.freeze(Object.fromEntries(Object.entries(value).map(([name, field]) => [name, freeze(field)]))) : value));

describe('SnapshotComparer', () => {
    const element = document.createElement('div');

    describe('reconcile', () => {
        it('gives the previous snapshot itself where nothing changed', () => {
            const snapshotComparer = snapshotComparerOf('@element { a: self attributeOf "a", b: self attributeOf "b" }', { element });
            const previous = freeze({ a: '1', b: '2' });

            expect(snapshotComparer.reconcile(previous, null, freeze({ a: '1', b: '2' }), null)).toBe(previous);
        });

        it('shares every branch that did not change and builds new ones along the paths that did', () => {
            const snapshotComparer = snapshotComparerOf('@element { id: self attributeOf "id", items: self.children { key: self attributeOf "key" } }', { element });
            const previous = freeze({ id: 'x', items: [{ key: 'a' }, { key: 'b' }] });
            const next = snapshotComparer.reconcile(previous, null, freeze({ id: 'x', items: [{ key: 'a' }, { key: 'c' }] }), null);

            expect(next).not.toBe(previous);
            expect(next.items).not.toBe(previous.items);
            expect(next.items[0]).toBe(previous.items[0]);
            expect(next.items[1]).toEqual({ key: 'c' });
            expect(Object.isFrozen(next.items)).toBe(true);
        });

        it('compares a list by position, and gives a new one where its length changed', () => {
            const snapshotComparer = snapshotComparerOf('@element { items: self.children { key: self attributeOf "key" } }', { element });
            const previous = freeze({ items: [{ key: 'a' }, { key: 'b' }] });
            const next = snapshotComparer.reconcile(previous, null, freeze({ items: [{ key: 'a' }] }), null);

            expect(next.items).toEqual([{ key: 'a' }]);
            expect(next.items[0]).toBe(previous.items[0]);
        });

        it('compares strings, Booleans and null exactly', () => {
            const snapshotComparer = snapshotComparerOf('@element { s: self attributeOf "s", b: self matches ".x", n: self attributeOf "none" }', { element });
            const previous = freeze({ s: 'a', b: true, n: null });

            expect(snapshotComparer.reconcile(previous, null, freeze({ s: 'a', b: true, n: null }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ s: 'a', b: false, n: null }), null).b).toBe(false);
            expect(snapshotComparer.reconcile(previous, null, freeze({ s: 'a', b: true, n: 'x' }), null).n).toBe('x');
        });

        it('compares a number exactly where its member declares no tolerance', () => {
            const snapshotComparer = snapshotComparerOf('@element { n: self.steady }', { element });
            const previous = freeze({ n: 10 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ n: 10.001 }), null).n).toBe(10.001);
            expect(snapshotComparer.reconcile(previous, null, freeze({ n: 10 }), null)).toBe(previous);
        });

        it('compares a number within the tolerance of the member that produced it', () => {
            const snapshotComparer = snapshotComparerOf('@element { size: self.wobble }', { element }, { tolerance: 0.5 });
            const previous = freeze({ size: { width: 100, height: 40 } });

            expect(snapshotComparer.reconcile(previous, null, freeze({ size: { width: 100.4, height: 39.6 } }), null)).toBe(previous);

            const next = snapshotComparer.reconcile(previous, null, freeze({ size: { width: 100.6, height: 40 } }), null);

            expect(next.size.width).toBe(100.6);
            expect(next.size.height).toBe(40);
        });

        it('shares the tolerance of a member with the fields of its value', () => {
            const snapshotComparer = snapshotComparerOf('@element { width: self.wobble.width }', { element }, { tolerance: 2 });
            const previous = freeze({ width: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 101.5 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 102.5 }), null).width).toBe(102.5);
        });

        describe('under a conditional', () => {
            /** The identities of a value the conditional gave from the branch. */
            const selecting = (conditional, branch, identities = {}) => ({ ...identities, branches: new Map([[conditional, branch]]) });

            it('compares a number within the tolerance of the member the branch both values came from declares', () => {
                const resolved = resolvedOf('if @wide then @element.wobble.width else @element.steady', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.consequent), 101.5, selecting(query, query.consequent))).toBe(100);
                expect(snapshotComparer.reconcile(100, selecting(query, query.alternative), 101.5, selecting(query, query.alternative))).toBe(101.5);
            });

            it('compares a number exactly where the two values came from different branches', () => {
                const resolved = resolvedOf('if @wide then @element.wobble.width else @other.wobble.width', { element, other: element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.consequent), 101.5, selecting(query, query.alternative))).toBe(101.5);
                expect(snapshotComparer.reconcile(100, null, 101.5, null)).toBe(101.5);
            });

            it('compares the fields of a branch that is an object expression by their own members', () => {
                const resolved = resolvedOf('@element { s: if @wide then @element { w: self.wobble.width, n: self.steady } else null }', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const conditional = resolved.definition.query.fields[0].value;
                const identities = { fields: { s: selecting(conditional, conditional.consequent) } };
                const previous = freeze({ s: { w: 100, n: 5 } });

                expect(snapshotComparer.reconcile(previous, identities, freeze({ s: { w: 101.5, n: 5 } }), identities)).toBe(previous);
                expect(snapshotComparer.reconcile(previous, identities, freeze({ s: { w: 100, n: 5.5 } }), identities).s.n).toBe(5.5);
            });

            it('follows a branch through the field of its value a chain reads', () => {
                const resolved = resolvedOf('(if @wide then @element.wobble else @element.wobble).width', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const conditional = resolved.definition.query.target;

                expect(snapshotComparer.reconcile(100, selecting(conditional, conditional.consequent), 101.5, selecting(conditional, conditional.consequent))).toBe(100);
            });
        });

        it('compares what a local gives as the expression it names, within the tolerance of its member', () => {
            const snapshotComparer = snapshotComparerOf('@element { let width: self.wobble.width, a: width, b: width }', { element }, { tolerance: 2 });
            const previous = freeze({ a: 100, b: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ a: 101.5, b: 101.5 }), null)).toBe(previous);
        });

        it('keeps a number that moved within the tolerance at the one last reported, so the drift cannot add up', () => {
            const snapshotComparer = snapshotComparerOf('@element.wobble.width', { element }, { tolerance: 1 });
            let reported = 100;

            for (const width of [100.6, 101.2, 100.9]) {
                reported = snapshotComparer.reconcile(reported, null, width, null);
            }

            expect(reported).toBe(101.2);
        });

        it('matches the items of a list projected from elements by element, so a reorder shares every item that did not change', () => {
            const snapshotComparer = snapshotComparerOf('@element.children { key: self attributeOf "key", n: self attributeOf "n" }', { element });
            const [a, b, c] = [{ nodeType: 1 }, { nodeType: 1 }, { nodeType: 1 }];
            const identities = list => ({ elements: list, items: list.map(() => null) });
            const previous = freeze([{ key: 'a', n: '1' }, { key: 'b', n: '2' }, { key: 'c', n: '3' }]);
            const next = snapshotComparer.reconcile(previous, identities([a, b, c]), freeze([{ key: 'c', n: '3' }, { key: 'a', n: '9' }, { key: 'b', n: '2' }]), identities([c, a, b]));

            expect(next[0]).toBe(previous[2]);
            expect(next[2]).toBe(previous[1]);
            expect(next[1]).toEqual({ key: 'a', n: '9' });
            expect(next[1]).not.toBe(previous[0]);
        });

        it('matches by element a list a conditional chose, following the identities of the value it gave', () => {
            const snapshotComparer = snapshotComparerOf('if @wide then @element.children { key: self attributeOf "key" } else null', { element, wide: true });
            const [a, b] = [{ nodeType: 1 }, { nodeType: 1 }];
            const identities = list => ({ elements: list, items: list.map(() => null) });
            const previous = freeze([{ key: 'a' }, { key: 'b' }]);
            const next = snapshotComparer.reconcile(previous, identities([a, b]), freeze([{ key: 'b' }, { key: 'a' }]), identities([b, a]));

            expect(next[0]).toBe(previous[1]);
            expect(next[1]).toBe(previous[0]);
        });

        it('compares the items of an object expression over a list', () => {
            const snapshotComparer = snapshotComparerOf('@element.children { key: self attributeOf "key" }', { element });
            const previous = freeze([{ key: 'a' }, null]);

            expect(snapshotComparer.reconcile(previous, null, freeze([{ key: 'a' }, null]), null)).toBe(previous);
        });
    });
});
