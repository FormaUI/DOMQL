import { describe, it, expect, beforeEach } from 'vitest';
import { SnapshotComparer } from '#domql/snapshots/SnapshotComparer.mjs';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { Evaluator } from '#lexica/language/Evaluator.mjs';
import { LanguageResolver } from '#lexica/language/LanguageResolver.mjs';
import { ParameterBindings } from '#lexica/language/ParameterBindings.mjs';
import { ParsedTexts } from '#lexica/language/ParsedTexts.mjs';
import { LexicaModule } from '#lexica/language/vocabulary/LexicaModule.mjs';
import { LexicaRegistry } from '#lexica/language/vocabulary/LexicaRegistry.mjs';
import { Vocabulary } from '#lexica/language/vocabulary/Vocabulary.mjs';

/** What the test modules' members answer at the next evaluation, which a test sets as the page would change. */
let state;

/** A property of an element the test module of its name declares, answering what the state holds under its name. */
const property = (name, result, tolerance) => new LexicaModule(name, {
    members: [{ name, kind: 'property', target: 'Element', result, updates: { changes: 'constant', reads: 'fresh', tolerance }, implementation: () => state[name] }],
});

/** A module of a meter, whose default indexer reads a level, and one of a reading, an indexer of an element, each answering the state's `r` within a tolerance of 2. */
const indexerModules = () => {
    const key = [{ name: 'key', kind: 'value', type: 'String', required: true, nulls: 'propagate' }];
    const level = { kind: 'function', syntax: 'indexer', arguments: 'positional', parameters: key, result: 'Number', updates: { changes: 'constant', reads: 'fresh', tolerance: 2 }, implementation: () => state.r };

    return [
        new LexicaModule('meter', {
            types: [{ name: 'Meter', fields: { name: 'String' } }],
            members: [
                { name: 'meter', kind: 'property', target: 'Element', result: 'Meter', updates: { changes: 'constant', reads: 'fresh' }, implementation: () => ({ name: 'm' }) },
                { ...level, name: 'level', target: 'Meter', default: true },
            ],
        }),
        new LexicaModule('reading', { members: [{ ...level, name: 'reading', target: 'Element' }] }),
    ];
};

/**
 * A query as a watch evaluates it: each snapshot evaluates it against the page and the state as they are, answering its value and the metadata Lexica gives it,
 * and `reconcile` compares two snapshots as the watch's comparer does. `wobble` answers a size within the tolerance given, `maybe` a size that can be null within it, `girth` a size and `steady` a number with none.
 */
const watchOf = (text, bindings, { tolerance = 0.5 } = {}) => {
    const registry = new LexicaRegistry([Vocabulary.module, BrowserModule.create(), property('wobble', 'Size', tolerance), property('maybe', 'Size?', tolerance), property('girth', 'Size'), property('steady', 'Number?'), ...indexerModules()]);
    const definition = ParsedTexts.parse(text);
    const locations = ParsedTexts.locationsOf(definition);
    const comparer = new SnapshotComparer();
    // A resolution serves the bindings of its resolution key alone, as a watch's cache keeps one for each.
    const resolutionsByKey = new Map();
    const resolutionOf = parameterBindings => {
        if (!resolutionsByKey.has(parameterBindings.resolutionKey)) {
            resolutionsByKey.set(parameterBindings.resolutionKey, new LanguageResolver(registry, parameterBindings, locations, {}).resolveDefinition(definition));
        }

        return resolutionsByKey.get(parameterBindings.resolutionKey);
    };

    return {
        snapshot: (values = bindings) => {
            const parameterBindings = new ParameterBindings(values);

            return new Evaluator(registry, resolutionOf(parameterBindings), parameterBindings, { window, document }, locations).evaluate();
        },
        reconcile: (previous, next) => comparer.reconcile(previous.value, previous.metadata, next.value, next.metadata),
    };
};

/** An element with the attributes given, and the children given within it. */
const elementOf = (attributes = {}, children = []) => {
    const element = document.createElement('div');

    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    children.forEach(child => element.append(child));

    return element;
};

describe('SnapshotComparer', () => {
    beforeEach(() => {
        state = { wobble: { width: 100, height: 40 }, maybe: { width: 100, height: 40 }, girth: { width: 100, height: 40 }, steady: 10, r: 100 };
    });

    describe('reconcile', () => {
        it('gives the previous snapshot itself where nothing changed', () => {
            const element = elementOf({ a: '1', b: '2' });
            const watch = watchOf('element { a = it.attribute["a"], b = it.attribute["b"] }', { element });
            const previous = watch.snapshot();

            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);
        });

        it('shares every branch that did not change and builds new ones along the paths that did', () => {
            const second = elementOf({ key: 'b' });
            const element = elementOf({ id: 'x' }, [elementOf({ key: 'a' }), second]);
            const watch = watchOf('element { id = it.attribute["id"], items = it.children { key = it.attribute["key"] } }', { element });
            const previous = watch.snapshot();

            second.setAttribute('key', 'c');

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next).not.toBe(previous.value);
            expect(next.items).not.toBe(previous.value.items);
            expect(next.items[0]).toBe(previous.value.items[0]);
            expect(next.items[1]).toEqual({ key: 'c' });
            expect(Object.isFrozen(next.items)).toBe(true);
        });

        it('builds an object anew from the first field that changed, sharing the fields before and after it that did not', () => {
            const element = elementOf({ key: 'a' });
            const watch = watchOf('element { size = it.wobble, key = it.attribute["key"], box = it.girth }', { element });

            state.wobble = { width: 10, height: 20 };
            state.girth = { width: 30, height: 40 };

            const previous = watch.snapshot();

            state.wobble = { width: 10.2, height: 20 };
            element.setAttribute('key', 'b');

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next).not.toBe(previous.value);
            expect(next).toEqual({ size: { width: 10, height: 20 }, key: 'b', box: { width: 30, height: 40 } });
            expect(next.size).toBe(previous.value.size);
            expect(next.box).toBe(previous.value.box);
            expect(Object.keys(next)).toEqual(['size', 'key', 'box']);
            expect(Object.isFrozen(next)).toBe(true);
        });

        it('gives a new object where the previous one has fields the expression does not name, even where every named field is the same', () => {
            const element = elementOf({ a: '1', b: '2' });
            const watch = watchOf('element { a = it.attribute["a"], b = it.attribute["b"] }', { element });
            const next = watch.snapshot();
            const previous = { value: Object.freeze({ a: '1', b: '2', c: '3' }), metadata: next.metadata };
            const reconciled = watch.reconcile(previous, next);

            expect(reconciled).not.toBe(previous.value);
            expect(reconciled).toEqual({ a: '1', b: '2' });
        });

        it('gives a new object where the previous one lacks a field the expression names, though it has as many fields and reading the missing one compares equal', () => {
            const element = elementOf({ a: '1' });
            const watch = watchOf('element { a = it.attribute["a"], b = it.attribute["b"] }', { element });
            const next = watch.snapshot();
            const previous = { value: Object.freeze({ a: '1', x: '2' }), metadata: next.metadata };
            const reconciled = watch.reconcile(previous, next);

            expect(reconciled).not.toBe(previous.value);
            expect(Object.keys(reconciled)).toEqual(['a', 'b']);
        });

        it('keeps a data object\'s own __proto__ field as an ordinary field, where another field changed and where it first appears', () => {
            const data = text => JSON.parse(text);
            const watch = watchOf('row', { row: data('{ "__proto__": { "polluted": true }, "id": "a" }') });
            const previous = watch.snapshot();
            const changed = watch.reconcile(previous, watch.snapshot({ row: data('{ "__proto__": { "polluted": true }, "id": "b" }') }));
            const appeared = watchOf('row', { row: data('{ "id": "a" }') });
            const appearedNext = appeared.reconcile(appeared.snapshot(), appeared.snapshot({ row: data('{ "__proto__": { "polluted": true }, "id": "a" }') }));

            for (const next of [changed, appearedNext]) {
                expect(Object.keys(next)).toEqual(['__proto__', 'id']);
                expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
                expect(Object.getOwnPropertyDescriptor(next, '__proto__').value).toEqual({ polluted: true });
                expect(next.polluted).toBeUndefined();
            }

            expect(Object.getOwnPropertyDescriptor(changed, '__proto__').value).toBe(Object.getOwnPropertyDescriptor(previous.value, '__proto__').value);
        });

        it('compares a list by position where its items came from no reference, and gives a new one where its length changed', () => {
            const second = elementOf({ key: 'b' });
            const element = elementOf({}, [elementOf({ key: 'a' }), second]);
            const watch = watchOf('element { keys = it.children { key = it.attribute["key"] }.where(it.key != null) }', { element });
            const previous = watch.snapshot();

            second.remove();

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next.keys).toEqual([{ key: 'a' }]);
            expect(next.keys).not.toBe(previous.value.keys);
            expect(next.keys[0]).toBe(previous.value.keys[0]);
        });

        it('compares strings, Booleans and null exactly', () => {
            const element = elementOf({ s: 'a', class: 'x' });
            const watch = watchOf('element { s = it.attribute["s"], b = it.matches(".x"), n = it.attribute["none"] }', { element });
            const previous = watch.snapshot();

            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

            element.removeAttribute('class');
            expect(watch.reconcile(previous, watch.snapshot()).b).toBe(false);

            element.setAttribute('class', 'x');
            element.setAttribute('none', 'x');
            expect(watch.reconcile(previous, watch.snapshot()).n).toBe('x');
        });

        it('compares a number exactly where its member declares no tolerance', () => {
            const watch = watchOf('element { n = it.steady }', { element: elementOf() });
            const previous = watch.snapshot();

            state.steady = 10.001;
            expect(watch.reconcile(previous, watch.snapshot()).n).toBe(10.001);

            state.steady = 10;
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);
        });

        it('compares a computed number exactly, whatever the tolerance of the members its operands read', () => {
            const watch = watchOf('element { w = it.wobble.width * 10, v = it.wobble.width + 0 }', { element: elementOf() }, { tolerance: 2 });
            const previous = watch.snapshot();

            state.wobble = { width: 100.1, height: 40 };

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next.w).toBe(1001);
            expect(next.v).toBe(100.1);
        });

        it.each([
            ['a named indexer', 'element { r = it.reading["x"] }'],
            ['an unnamed indexer', 'element { r = it.meter["x"] }'],
            ['an optional indexer', 'element { r = it?.reading["x"] }'],
        ])('compares a number %s answered within its tolerance, as a call or a property is', (_, text) => {
            const watch = watchOf(text, { element: elementOf() });
            const previous = watch.snapshot();
            const at = r => ((state.r = r), watch.reconcile(previous, watch.snapshot()));

            expect(at(101)).toBe(previous.value);
            expect(at(98)).toBe(previous.value);
            expect(at(102.5).r).toBe(102.5);
        });

        it('treats a difference exactly at the tolerance as unchanged, and one beyond it as a change', () => {
            const watch = watchOf('element { r = it.reading["x"] }', { element: elementOf() });
            const previous = watch.snapshot();
            const at = r => ((state.r = r), watch.reconcile(previous, watch.snapshot()));

            expect(at(102)).toBe(previous.value);
            expect(at(98)).toBe(previous.value);
            expect(at(102.25).r).toBe(102.25);
            expect(at(97.75).r).toBe(97.75);
        });

        it('measures each change from the snapshot it keeps, so small steps that add up beyond the tolerance report the value they reach', () => {
            const watch = watchOf('element { r = it.reading["x"] }', { element: elementOf() });
            let kept = watch.snapshot();
            const reported = [];

            for (const r of [100.75, 101.5, 102, 102.75, 103.5, 104.25, 105]) {
                state.r = r;

                const next = watch.snapshot();
                const value = watch.reconcile(kept, next);

                if (value !== kept.value) {
                    reported.push(value.r);
                    kept = { value, metadata: next.metadata };
                }
            }

            expect(reported).toEqual([102.75, 105]);
        });

        it('compares a number within the tolerance of the member that produced it', () => {
            const watch = watchOf('element { size = it.wobble }', { element: elementOf() });
            const previous = watch.snapshot();

            state.wobble = { width: 100.4, height: 39.6 };
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

            state.wobble = { width: 100.6, height: 40 };

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next.size.width).toBe(100.6);
            expect(next.size.height).toBe(40);
        });

        it('shares the tolerance of a member with the fields of its value', () => {
            const watch = watchOf('element { width = it.wobble.width }', { element: elementOf() }, { tolerance: 2 });
            const previous = watch.snapshot();

            state.wobble = { width: 101.5, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

            state.wobble = { width: 102.5, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot()).width).toBe(102.5);
        });

        describe('under a conditional', () => {
            it('compares a number within the tolerance of the member the branch both values came from declares', () => {
                const element = elementOf();
                const watch = watchOf('if wide then element.wobble.width else element.steady end', { element, wide: true }, { tolerance: 2 });
                const previous = watch.snapshot();

                state.wobble = { width: 101.5, height: 40 };
                expect(watch.reconcile(previous, watch.snapshot())).toBe(100);

                state.steady = 100;

                const narrow = watch.snapshot({ element, wide: false });

                state.steady = 101.5;
                expect(watch.reconcile(narrow, watch.snapshot({ element, wide: false }))).toBe(101.5);
            });

            it('compares what a conditional binding gives as the value it binds, within the tolerance of its member, where both values came from its consequent', () => {
                const watch = watchOf('if let width = element.maybe?.width then { a = width, b = width } else null end', { element: elementOf() }, { tolerance: 2 });
                const previous = watch.snapshot();

                state.maybe = { width: 101.5, height: 40 };
                expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

                state.maybe = { width: 103, height: 40 };
                expect(watch.reconcile(previous, watch.snapshot())).toEqual({ a: 103, b: 103 });
            });

            it('compares what an and or an or gave as the operand it gave, within that operand\'s tolerance, and exactly where the operand has none', () => {
                const watch = watchOf('element.steady or element.wobble.width', { element: elementOf() }, { tolerance: 2 });

                state.steady = null;

                const fromWobble = watch.snapshot();

                state.wobble = { width: 101.5, height: 40 };
                expect(watch.reconcile(fromWobble, watch.snapshot())).toBe(100);

                state.steady = 100;

                const fromSteady = watch.snapshot();

                state.steady = 101.5;
                expect(watch.reconcile(fromSteady, watch.snapshot())).toBe(101.5);

                state.steady = null;
                expect(watch.reconcile(fromSteady, watch.snapshot())).toBe(101.5);
            });

            it('compares a number exactly where the two values came from different branches', () => {
                const element = elementOf();
                const watch = watchOf('if wide then element.wobble.width else other.wobble.width end', { element, other: element, wide: true }, { tolerance: 2 });
                const previous = watch.snapshot();

                state.wobble = { width: 101.5, height: 40 };
                expect(watch.reconcile(previous, watch.snapshot({ element, other: element, wide: false }))).toBe(101.5);
            });

            it('compares the fields of a branch that is an object expression by their own members', () => {
                const element = elementOf();
                const watch = watchOf('element { s = if wide then element { w = it.wobble.width, n = it.steady } else null end }', { element, wide: true }, { tolerance: 2 });

                state.steady = 5;

                const previous = watch.snapshot();

                state.wobble = { width: 101.5, height: 40 };
                expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

                state.wobble = { width: 100, height: 40 };
                state.steady = 5.5;
                expect(watch.reconcile(previous, watch.snapshot()).s.n).toBe(5.5);
            });

            it('follows a branch through the field of its value a chain reads from the local holding it', () => {
                const watch = watchOf('let size = if wide then element.wobble else element.girth end\nreturn size.width', { element: elementOf(), wide: true }, { tolerance: 2 });
                const previous = watch.snapshot();

                state.wobble = { width: 101.5, height: 40 };
                expect(watch.reconcile(previous, watch.snapshot())).toBe(100);
            });
        });

        describe('under a computed property access', () => {
            it('compares a number within the tolerance of the property both values came from, and exactly where they came from different ones', () => {
                const element = elementOf();
                const watch = watchOf('element.[if wide then "wobble" else "girth" end]?.width', { element, wide: true }, { tolerance: 2 });
                const wide = watch.snapshot();

                state.wobble = { width: 101.5, height: 40 };
                expect(watch.reconcile(wide, watch.snapshot())).toBe(100);

                const narrow = watch.snapshot({ element, wide: false });

                state.girth = { width: 101.5, height: 40 };
                expect(watch.reconcile(narrow, watch.snapshot({ element, wide: false }))).toBe(101.5);
                expect(watch.reconcile(wide, watch.snapshot({ element, wide: false }))).toBe(101.5);
            });
        });

        describe('under a coalescing operator', () => {
            it('compares a number within the tolerance of the side both values came from, and exactly where they came from different sides', () => {
                const watch = watchOf('element.maybe?.width ?? element.steady', { element: elementOf() }, { tolerance: 2 });
                const fromValue = watch.snapshot();

                state.maybe = { width: 101.5, height: 40 };
                expect(watch.reconcile(fromValue, watch.snapshot())).toBe(100);

                state.maybe = null;
                state.steady = 100;

                const fromFallback = watch.snapshot();

                state.steady = 101.5;
                expect(watch.reconcile(fromFallback, watch.snapshot())).toBe(101.5);

                state.maybe = { width: 101.5, height: 40 };
                expect(watch.reconcile(fromFallback, watch.snapshot())).toBe(101.5);
            });
        });

        it('compares what an optional chain gives as the chain it holds, within the tolerance of its member', () => {
            const element = elementOf();
            const watch = watchOf('element { width = (it.parent as Element)?.wobble.width, box = (it.parent as Element)?.wobble { w = it.width } }', { element }, { tolerance: 2 });

            elementOf({}, [element]);
            state.wobble = { width: 10, height: 40 };

            const previous = watch.snapshot();

            state.wobble = { width: 11, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

            state.wobble = { width: 13, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot()).width).toBe(13);
        });

        it('compares what a local gives as the expression it names, within the tolerance of its member', () => {
            const watch = watchOf('element { let width = it.wobble.width, a = width, b = width }', { element: elementOf() }, { tolerance: 2 });
            const previous = watch.snapshot();

            state.wobble = { width: 101.5, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);
        });

        it('compares what a do block and a call of a local function give as the expression their body gives, within the tolerance of its member', () => {
            const watch = watchOf('element { let read = function(e) e.wobble.width end, a = do let w = it.wobble.width return w end, b = read(it) }', { element: elementOf() }, { tolerance: 2 });
            const previous = watch.snapshot();

            state.wobble = { width: 101.5, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);

            state.wobble = { width: 102.5, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot())).toEqual({ a: 102.5, b: 102.5 });
        });

        it('compares what a call of one of several functions gives as the body of the one both values came from, and exactly where they came from different ones', () => {
            const element = elementOf();
            const watch = watchOf('let a = () => element.wobble.width\nlet b = () => element.steady\nlet pick = if wide then a else b end\nreturn pick()', { element, wide: true }, { tolerance: 2 });
            const first = watch.snapshot();

            state.wobble = { width: 101.5, height: 40 };
            expect(watch.reconcile(first, watch.snapshot())).toBe(100);

            state.steady = 100;

            const second = watch.snapshot({ element, wide: false });

            state.steady = 101.5;
            expect(watch.reconcile(second, watch.snapshot({ element, wide: false }))).toBe(101.5);
            expect(watch.reconcile(first, watch.snapshot({ element, wide: false }))).toBe(101.5);
        });

        it('compares a field read through root as the field it reads, within the tolerance of its member', () => {
            const watch = watchOf('element { width = it.wobble.width, again = root.width, named = root.[name] }', { element: elementOf(), name: 'width' }, { tolerance: 2 });
            const previous = watch.snapshot();

            state.wobble = { width: 101.5, height: 40 };
            expect(watch.reconcile(previous, watch.snapshot())).toBe(previous.value);
        });

        it('keeps a number that moved within the tolerance at the one last reported, so the drift cannot add up', () => {
            const watch = watchOf('element.wobble.width', { element: elementOf() }, { tolerance: 1 });
            let reported = watch.snapshot();

            for (const width of [100.6, 101.2, 100.9]) {
                state.wobble = { width, height: 40 };

                const next = watch.snapshot();

                reported = { value: watch.reconcile(reported, next), metadata: next.metadata };
            }

            expect(reported.value).toBe(101.2);
        });

        it('matches the items of a list projected from elements by element, so a reorder shares every item that did not change', () => {
            const [a, b, c] = [elementOf({ key: 'a', n: '1' }), elementOf({ key: 'b', n: '2' }), elementOf({ key: 'c', n: '3' })];
            const element = elementOf({}, [a, b, c]);
            const watch = watchOf('element.children { key = it.attribute["key"], n = it.attribute["n"] }', { element });
            const previous = watch.snapshot();

            element.prepend(c);
            a.setAttribute('n', '9');

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next[0]).toBe(previous.value[2]);
            expect(next[2]).toBe(previous.value[1]);
            expect(next[1]).toEqual({ key: 'a', n: '9' });
            expect(next[1]).not.toBe(previous.value[0]);
        });

        it('matches by element a list a conditional chose, following the metadata of the value it gave', () => {
            const [a, b] = [elementOf({ key: 'a' }), elementOf({ key: 'b' })];
            const element = elementOf({}, [a, b]);
            const watch = watchOf('if wide then element.children { key = it.attribute["key"] } else null end', { element, wide: true });
            const previous = watch.snapshot();

            element.prepend(b);

            const next = watch.reconcile(previous, watch.snapshot());

            expect(next[0]).toBe(previous.value[1]);
            expect(next[1]).toBe(previous.value[0]);
        });

        it('compares the items of an object expression over a list, an item that is null staying null', () => {
            const element = elementOf({}, [elementOf({ key: 'a' }), elementOf({ key: 'b' })]);
            const watch = watchOf('element.children { key = it.attribute["key"] }', { element });
            const { metadata } = watch.snapshot();
            const previous = { value: Object.freeze([Object.freeze({ key: 'a' }), null]), metadata };

            expect(watch.reconcile(previous, { value: Object.freeze([Object.freeze({ key: 'a' }), null]), metadata })).toBe(previous.value);
        });
    });
});
