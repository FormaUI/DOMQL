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

/** A module of a meter, whose default indexer reads a level by its key, and one of a reading, an indexer of an element, each answering a number within a tolerance of 2. */
const indexerModules = () => {
    const key = [{ name: 'key', kind: 'value', type: 'string', required: true, nulls: 'propagate' }];
    const level = { function: 'level', kind: 'operation', form: 'indexer', parameters: key, result: 'number', changes: 'constant', reads: 'fresh', tolerance: 2 };

    return [
        new DomqlModule('meter', {
            types: [{ name: 'meter', fields: { name: 'string' } }],
            members: [
                { name: 'meter', function: 'meter', kind: 'property', on: 'element', parameters: [], result: 'meter', changes: 'constant', reads: 'fresh' },
                { ...level, name: 'level', on: 'meter', default: true },
            ],
        }, null),
        new DomqlModule('reading', { members: [{ ...level, name: 'reading', function: 'reading', on: 'element' }] }, null),
    ];
};

/** The comparer of the snapshots of a query that reads the indexer modules, which compares them as a watch does. */
const indexerComparerOf = (text, bindings) => {
    const query = domql.query(text, bindings);

    return new SnapshotComparer(new LanguageResolver(new ModuleRegistry([Vocabulary.module, ...indexerModules()]), DomqlQuery.bindingsOf(query), null, {}).resolveDefinition(query.definition));
};

/** The comparer of the snapshots of a query, which compares them as a watch does. */
const snapshotComparerOf = (text, bindings = {}, tolerance = {}) => new SnapshotComparer(resolvedOf(text, bindings, tolerance));

const freeze = value => (Array.isArray(value) ? Object.freeze(value.map(freeze)) : (value !== null && typeof value === 'object' ? Object.freeze(Object.fromEntries(Object.entries(value).map(([name, field]) => [name, freeze(field)]))) : value));

describe('SnapshotComparer', () => {
    const element = document.createElement('div');

    describe('reconcile', () => {
        it('gives the previous snapshot itself where nothing changed', () => {
            const snapshotComparer = snapshotComparerOf('element { a = context:attribute["a"], b = context:attribute["b"] }', { element });
            const previous = freeze({ a: '1', b: '2' });

            expect(snapshotComparer.reconcile(previous, null, freeze({ a: '1', b: '2' }), null)).toBe(previous);
        });

        it('shares every branch that did not change and builds new ones along the paths that did', () => {
            const snapshotComparer = snapshotComparerOf('element { id = context:attribute["id"], items = context.children { key = context:attribute["key"] } }', { element });
            const previous = freeze({ id: 'x', items: [{ key: 'a' }, { key: 'b' }] });
            const next = snapshotComparer.reconcile(previous, null, freeze({ id: 'x', items: [{ key: 'a' }, { key: 'c' }] }), null);

            expect(next).not.toBe(previous);
            expect(next.items).not.toBe(previous.items);
            expect(next.items[0]).toBe(previous.items[0]);
            expect(next.items[1]).toEqual({ key: 'c' });
            expect(Object.isFrozen(next.items)).toBe(true);
        });

        it('builds an object anew from the first field that changed, sharing the fields before and after it that did not', () => {
            const snapshotComparer = snapshotComparerOf('element { size = context.wobble, key = context:attribute["key"], box = context.wobble }', { element }, { tolerance: 0.5 });
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
            const snapshotComparer = snapshotComparerOf('element { a = context:attribute["a"], b = context:attribute["b"] }', { element });
            const previous = freeze({ a: '1', b: '2', c: '3' });
            const next = snapshotComparer.reconcile(previous, null, freeze({ a: '1', b: '2' }), null);

            expect(next).not.toBe(previous);
            expect(next).toEqual({ a: '1', b: '2' });
        });

        it('gives a new object where the previous one lacks a field the expression names, though it has as many fields and reading the missing one compares equal', () => {
            const snapshotComparer = snapshotComparerOf('element { a = context:attribute["a"], b = context:attribute["b"] }', { element });
            const previous = freeze({ a: '1', x: '2' });
            const next = snapshotComparer.reconcile(previous, null, freeze({ a: '1' }), null);

            expect(next).not.toBe(previous);
            expect(Object.keys(next)).toEqual(['a', 'b']);
        });

        it('keeps a data object\'s own __proto__ field as an ordinary field, where another field changed and where it first appears', () => {
            const snapshotComparer = snapshotComparerOf('row', { row: { id: 'a' } });
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
            const snapshotComparer = snapshotComparerOf('element { items = context.children { key = context:attribute["key"] } }', { element });
            const previous = freeze({ items: [{ key: 'a' }, { key: 'b' }] });
            const next = snapshotComparer.reconcile(previous, null, freeze({ items: [{ key: 'a' }] }), null);

            expect(next.items).toEqual([{ key: 'a' }]);
            expect(next.items[0]).toBe(previous.items[0]);
        });

        it('compares strings, Booleans and null exactly', () => {
            const snapshotComparer = snapshotComparerOf('element { s = context:attribute["s"], b = context.matches(".x"), n = context:attribute["none"] }', { element });
            const previous = freeze({ s: 'a', b: true, n: null });

            expect(snapshotComparer.reconcile(previous, null, freeze({ s: 'a', b: true, n: null }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ s: 'a', b: false, n: null }), null).b).toBe(false);
            expect(snapshotComparer.reconcile(previous, null, freeze({ s: 'a', b: true, n: 'x' }), null).n).toBe('x');
        });

        it('compares a number exactly where its member declares no tolerance', () => {
            const snapshotComparer = snapshotComparerOf('element { n = context.steady }', { element });
            const previous = freeze({ n: 10 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ n: 10.001 }), null).n).toBe(10.001);
            expect(snapshotComparer.reconcile(previous, null, freeze({ n: 10 }), null)).toBe(previous);
        });

        it('compares a computed number exactly, whatever the tolerance of the members its operands read', () => {
            const snapshotComparer = snapshotComparerOf('element { w = context.wobble.width * 10, v = context.wobble.width + 0 }', { element }, { tolerance: 2 });
            const previous = freeze({ w: 1000, v: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ w: 1001, v: 100 }), null).w).toBe(1001);
            expect(snapshotComparer.reconcile(previous, null, freeze({ w: 1000, v: 100.5 }), null).v).toBe(100.5);
        });

        it.each([
            ['a named indexer', 'element { r = context:reading["x"] }'],
            ['a default indexer', 'element { r = context.meter:["x"] }'],
            ['an optional indexer', 'element { r = context?:reading["x"] }'],
        ])('compares a number %s answered within its tolerance, as a call or a property is', (_, text) => {
            const snapshotComparer = indexerComparerOf(text, { element });
            const previous = freeze({ r: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 101 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 98 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 102.5 }), null).r).toBe(102.5);
        });

        it('treats a difference exactly at the tolerance as unchanged, and one beyond it as a change', () => {
            const snapshotComparer = indexerComparerOf('element { r = context:reading["x"] }', { element });
            const previous = freeze({ r: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 102 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 98 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 102.25 }), null).r).toBe(102.25);
            expect(snapshotComparer.reconcile(previous, null, freeze({ r: 97.75 }), null).r).toBe(97.75);
        });

        it('measures each change from the snapshot it keeps, so small steps that add up beyond the tolerance report the value they reach', () => {
            const snapshotComparer = indexerComparerOf('element { r = context:reading["x"] }', { element });
            let kept = freeze({ r: 100 });
            const reported = [];

            for (const r of [100.75, 101.5, 102, 102.75, 103.5, 104.25, 105]) {
                const next = snapshotComparer.reconcile(kept, null, freeze({ r }), null);

                if (next !== kept) {
                    reported.push(next.r);
                    kept = next;
                }
            }

            expect(reported).toEqual([102.75, 105]);
        });

        it('compares a number within the tolerance of the member that produced it', () => {
            const snapshotComparer = snapshotComparerOf('element { size = context.wobble }', { element }, { tolerance: 0.5 });
            const previous = freeze({ size: { width: 100, height: 40 } });

            expect(snapshotComparer.reconcile(previous, null, freeze({ size: { width: 100.4, height: 39.6 } }), null)).toBe(previous);

            const next = snapshotComparer.reconcile(previous, null, freeze({ size: { width: 100.6, height: 40 } }), null);

            expect(next.size.width).toBe(100.6);
            expect(next.size.height).toBe(40);
        });

        it('shares the tolerance of a member with the fields of its value', () => {
            const snapshotComparer = snapshotComparerOf('element { width = context.wobble.width }', { element }, { tolerance: 2 });
            const previous = freeze({ width: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 101.5 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 102.5 }), null).width).toBe(102.5);
        });

        describe('under a conditional', () => {
            /** The identities of a value the conditional gave from the branch. */
            const selecting = (conditional, branch, identities = {}) => ({ ...identities, branches: new Map([[conditional, branch]]) });

            it('compares a number within the tolerance of the member the branch both values came from declares', () => {
                const resolved = resolvedOf('if wide then element.wobble.width else element.steady end', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.consequent), 101.5, selecting(query, query.consequent))).toBe(100);
                expect(snapshotComparer.reconcile(100, selecting(query, query.alternative), 101.5, selecting(query, query.alternative))).toBe(101.5);
            });

            it('compares what a conditional binding gives as the value it binds, within the tolerance of its member, where both values came from its consequent', () => {
                const resolved = resolvedOf('if let width = element.wobble?.width then { a = width, b = width } else null end', { element }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;
                const previous = freeze({ a: 100, b: 100 });

                expect(snapshotComparer.reconcile(previous, selecting(query, query.consequent), freeze({ a: 101.5, b: 101.5 }), selecting(query, query.consequent))).toBe(previous);
                expect(snapshotComparer.reconcile(previous, selecting(query, query.consequent), freeze({ a: 103, b: 100 }), selecting(query, query.consequent))).toEqual({ a: 103, b: 100 });
            });

            it('compares what an and or an or gave as the operand it gave, within that operand\'s tolerance, and exactly where the operand has none', () => {
                const resolved = resolvedOf('element.steady or element.wobble.width', { element }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.operands[1]), 101.5, selecting(query, query.operands[1]))).toBe(100);
                expect(snapshotComparer.reconcile(100, selecting(query, query.operands[0]), 101.5, selecting(query, query.operands[0]))).toBe(101.5);
                expect(snapshotComparer.reconcile(100, selecting(query, query.operands[0]), 101.5, selecting(query, query.operands[1]))).toBe(101.5);
            });

            it('compares a number exactly where the two values came from different branches', () => {
                const resolved = resolvedOf('if wide then element.wobble.width else other.wobble.width end', { element, other: element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.consequent), 101.5, selecting(query, query.alternative))).toBe(101.5);
                expect(snapshotComparer.reconcile(100, null, 101.5, null)).toBe(101.5);
            });

            it('compares the fields of a branch that is an object expression by their own members', () => {
                const resolved = resolvedOf('element { s = if wide then element { w = context.wobble.width, n = context.steady } else null end }', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const conditional = resolved.definition.query.fields[0].value;
                const identities = { fields: { s: selecting(conditional, conditional.consequent) } };
                const previous = freeze({ s: { w: 100, n: 5 } });

                expect(snapshotComparer.reconcile(previous, identities, freeze({ s: { w: 101.5, n: 5 } }), identities)).toBe(previous);
                expect(snapshotComparer.reconcile(previous, identities, freeze({ s: { w: 100, n: 5.5 } }), identities).s.n).toBe(5.5);
            });

            it('follows a branch through the field of its value a chain reads from the local holding it', () => {
                const resolved = resolvedOf('let size = if wide then element.wobble else element.wobble end\nreturn size.width', { element, wide: true }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const conditional = resolved.definition.query.locals[0].value;

                expect(snapshotComparer.reconcile(100, selecting(conditional, conditional.consequent), 101.5, selecting(conditional, conditional.consequent))).toBe(100);
            });
        });

        describe('under a bracket property access', () => {
            const selecting = (access, name) => ({ branches: new Map([[access, name]]) });

            it('compares a number within the tolerance of the property both values came from, and exactly where they came from different ones', () => {
                const resolved = resolvedOf('element[if wide then "wobble" else "size" end]?.width', { element, wide: true }, { tolerance: 2 });
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
                const resolved = resolvedOf('element.wobble.width ?? element.steady', { element }, { tolerance: 2 });
                const snapshotComparer = new SnapshotComparer(resolved);
                const { query } = resolved.definition;

                expect(snapshotComparer.reconcile(100, selecting(query, query.value), 101.5, selecting(query, query.value))).toBe(100);
                expect(snapshotComparer.reconcile(100, selecting(query, query.fallback), 101.5, selecting(query, query.fallback))).toBe(101.5);
                expect(snapshotComparer.reconcile(100, selecting(query, query.value), 101.5, selecting(query, query.fallback))).toBe(101.5);
            });
        });

        it('compares what an optional chain gives as the chain it holds, within the tolerance of its member', () => {
            const snapshotComparer = snapshotComparerOf('element { width = (context.parent as "element")?.wobble.width, box = (context.parent as "element")?.wobble { w = context.width } }', { element }, { tolerance: 2 });
            const previous = freeze({ width: 10, box: { w: 10 } });

            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 11, box: { w: 10 } }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 13, box: { w: 10 } }), null).box).toBe(previous.box);
        });

        it('compares what a local gives as the expression it names, within the tolerance of its member', () => {
            const snapshotComparer = snapshotComparerOf('element { let width = context.wobble.width, a = width, b = width }', { element }, { tolerance: 2 });
            const previous = freeze({ a: 100, b: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ a: 101.5, b: 101.5 }), null)).toBe(previous);
        });

        it('compares what a do block and a call of a local function give as the expression their body gives, within the tolerance of its member', () => {
            const snapshotComparer = snapshotComparerOf('element { let read = function(e) e.wobble.width end, a = do let w = context.wobble.width return w end, b = read(context) }', { element }, { tolerance: 2 });
            const previous = freeze({ a: 100, b: 100 });

            expect(snapshotComparer.reconcile(previous, null, freeze({ a: 101.5, b: 101.5 }), null)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ a: 102.5, b: 102.5 }), null)).toEqual({ a: 102.5, b: 102.5 });
        });

        it('compares what a call of one of several functions gives as the body of the one both values came from, and exactly where they came from different ones', () => {
            const resolved = resolvedOf('let a = () => element.wobble.width\nlet b = () => element.steady\nlet pick = if wide then a else b end\nreturn pick()', { element, wide: true }, { tolerance: 2 });
            const snapshotComparer = new SnapshotComparer(resolved);
            const call = resolved.definition.query.result;
            const [first, second] = resolved.resolutionOf(call).targets.map(target => target.function);
            const calling = target => ({ branches: new Map([[call, target]]) });

            expect(snapshotComparer.reconcile(100, calling(first), 101.5, calling(first))).toBe(100);
            expect(snapshotComparer.reconcile(100, calling(second), 101.5, calling(second))).toBe(101.5);
            expect(snapshotComparer.reconcile(100, calling(first), 101.5, calling(second))).toBe(101.5);
        });

        it('compares a field read through root as the field it reads, within the tolerance of its member', () => {
            const resolved = resolvedOf('element { width = context.wobble.width, again = root.width, named = root[name] }', { element, name: 'width' }, { tolerance: 2 });
            const snapshotComparer = new SnapshotComparer(resolved);
            const bracket = resolved.definition.query.fields[2].value;
            const identities = { fields: { named: { branches: new Map([[bracket, 'width']]) } } };
            const previous = freeze({ width: 100, again: 100, named: 100 });

            expect(snapshotComparer.reconcile(previous, identities, freeze({ width: 101.5, again: 101.5, named: 101.5 }), identities)).toBe(previous);
            expect(snapshotComparer.reconcile(previous, null, freeze({ width: 100, again: 100, named: 101.5 }), null).named).toBe(101.5);
        });

        it('keeps a number that moved within the tolerance at the one last reported, so the drift cannot add up', () => {
            const snapshotComparer = snapshotComparerOf('element.wobble.width', { element }, { tolerance: 1 });
            let reported = 100;

            for (const width of [100.6, 101.2, 100.9]) {
                reported = snapshotComparer.reconcile(reported, null, width, null);
            }

            expect(reported).toBe(101.2);
        });

        it('matches the items of a list projected from elements by element, so a reorder shares every item that did not change', () => {
            const snapshotComparer = snapshotComparerOf('element.children { key = context:attribute["key"], n = context:attribute["n"] }', { element });
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
            const snapshotComparer = snapshotComparerOf('if wide then element.children { key = context:attribute["key"] } else null end', { element, wide: true });
            const [a, b] = [{ nodeType: 1 }, { nodeType: 1 }];
            const identities = list => ({ elements: list, items: list.map(() => null) });
            const previous = freeze([{ key: 'a' }, { key: 'b' }]);
            const next = snapshotComparer.reconcile(previous, identities([a, b]), freeze([{ key: 'b' }, { key: 'a' }]), identities([b, a]));

            expect(next[0]).toBe(previous[1]);
            expect(next[1]).toBe(previous[0]);
        });

        it('compares the items of an object expression over a list', () => {
            const snapshotComparer = snapshotComparerOf('element.children { key = context:attribute["key"] }', { element });
            const previous = freeze([{ key: 'a' }, null]);

            expect(snapshotComparer.reconcile(previous, null, freeze([{ key: 'a' }, null]), null)).toBe(previous);
        });
    });
});
