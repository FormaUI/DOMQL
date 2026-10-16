import { describe, it, expect } from 'vitest';
import { SnapshotComparer } from '#domql/snapshots/SnapshotComparer.mjs';
import { DomqlQuery } from '#domql/dom/DomqlQuery.mjs';
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

    return new LanguageResolver(registry, DomqlQuery.bindingsOf(query), null, {}).resolveDefinition(query.definition);
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

        it('builds an object anew from the first field that changed, sharing the fields before and after it that did not', () => {
            const snapshotComparer = snapshotComparerOf('@element { size: self.wobble, key: self attributeOf "key", box: self.wobble }', { element }, { tolerance: 0.5 });
            const previous = freeze({ size: { width: 10, height: 20 }, key: 'a', box: { width: 30, height: 40 } });
            const next = snapshotComparer.reconcile(previous, null, freeze({ size: { width: 10.2, height: 20 }, key: 'b', box: { width: 30, height: 40 } }), null);

            expect(next).not.toBe(previous);
            expect(next).toEqual({ size: { width: 10, height: 20 }, key: 'b', box: { width: 30, height: 40 } });
            expect(next.size).toBe(previous.size);
            expect(next.box).toBe(previous.box);
            expect(Object.keys(next)).toEqual(['size', 'key', 'box']);
            expect(Object.isFrozen(next)).toBe(true);
        });

        it('gives a new object where the previous one has fields the expression does not name, even where every named field is the same', () => {
            const snapshotComparer = snapshotComparerOf('@element { a: self attributeOf "a", b: self attributeOf "b" }', { element });
            const previous = freeze({ a: '1', b: '2', c: '3' });
            const next = snapshotComparer.reconcile(previous, null, freeze({ a: '1', b: '2' }), null);

            expect(next).not.toBe(previous);
            expect(next).toEqual({ a: '1', b: '2' });
        });

        it('gives a new object where the previous one lacks a field the expression names, though it has as many fields and reading the missing one compares equal', () => {
            const snapshotComparer = snapshotComparerOf('@element { a: self attributeOf "a", b: self attributeOf "b" }', { element });
            const previous = freeze({ a: '1', x: '2' });
            const next = snapshotComparer.reconcile(previous, null, freeze({ a: '1' }), null);

            expect(next).not.toBe(previous);
            expect(Object.keys(next)).toEqual(['a', 'b']);
        });

        it('keeps a data object\'s own __proto__ field as an ordinary field, where another field changed and where it first appears', () => {
            const snapshotComparer = snapshotComparerOf('@row', { row: { id: 'a' } });
            const data = text => freeze(JSON.parse(text));
            const previous = data('{ "__proto__": { "polluted": true }, "id": "a" }');
            const changed = snapshotComparer.reconcile(previous, null, data('{ "__proto__": { "polluted": true }, "id": "b" }'), null);
            const appeared = snapshotComparer.reconcile(data('{ "id": "a" }'), null, data('{ "__proto__": { "polluted": true }, "id": "a" }'), null);

            for (const next of [changed, appeared]) {
                expect(Object.keys(next)).toEqual(['__proto__', 'id']);
                expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
                expect(Object.getOwnPropertyDescriptor(next, '__proto__').value).toEqual({ polluted: true });
                expect(next.polluted).toBeUndefined();
            }

            expect(Object.getOwnPropertyDescriptor(changed, '__proto__').value).toBe(Object.getOwnPropertyDescriptor(previous, '__proto__').value);
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

        describe('under an access by name', () => {
            const selecting = (access, name) => ({ branches: new Map([[access, name]]) });

            it('compares a number within the tolerance of the property both values came from, and exactly where they came from different ones', () => {
                const resolved = resolvedOf('@element[if @wide then "wobble" else "size"]?.width', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const access = resolved.definition.query.target.target;

                expect(snapshotComparer.reconcile(100, selecting(access, 'wobble'), 101.5, selecting(access, 'wobble'))).toBe(100);
                expect(snapshotComparer.reconcile(100, selecting(access, 'size'), 101.5, selecting(access, 'size'))).toBe(101.5);
                expect(snapshotComparer.reconcile(100, selecting(access, 'wobble'), 101.5, selecting(access, 'size'))).toBe(101.5);
            });
        });

        describe('under a coalescing operator', () => {
            const selecting = (coalescing, side) => ({ branches: new Map([[coalescing, side]]) });

            it('compares a number within the tolerance of the side both values came from, and exactly where they came from different sides', () => {
                const resolved = resolvedOf('@element.wobble.width ?? @element.steady', { element }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.value), 101.5, selecting(query, query.value))).toBe(100);
                expect(snapshotComparer.reconcile(100, selecting(query, query.fallback), 101.5, selecting(query, query.fallback))).toBe(101.5);
                expect(snapshotComparer.reconcile(100, selecting(query, query.value), 101.5, selecting(query, query.fallback))).toBe(101.5);
            });
        });

        it('compares what an optional chain gives as the chain it holds, within the tolerance of its member', () => {
            const snapshotComparer = snapshotComparerOf('@element { width: (self.parent as "element")?.wobble.width, box: (self.parent as "element")?.wobble { w: self.width } }', { element }, { tolerance: 2 });
            const previous = freeze({ width: 10, box: { w: 10 } });

            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 11, box: { w: 10 } }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 13, box: { w: 10 } }), null).box).toBe(previous.box);
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
