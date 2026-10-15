import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { Observations } from '#domql/dom/Observations.mjs';
import { QueryEvaluator } from '#domql/dom/QueryEvaluator.mjs';
import { domql } from '#domql/domql.js';
import { DomqlError } from '#domql/language/DomqlError.mjs';
import { DomqlModule } from '#domql/language/vocabulary/DomqlModule.mjs';
import { LanguageResolver } from '#domql/language/LanguageResolver.mjs';
import { ModuleRegistry } from '#domql/language/vocabulary/ModuleRegistry.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';

/** Gives the element a border box, since the test environment lays nothing out. */
const lay = (element, { left = 0, top = 0, width = 0, height = 0 }) => {
    element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
    element.getClientRects = () => [element.getBoundingClientRect()];
};

/** Takes the element's layout box away, as `display: none` does. */
const unlay = element => {
    element.getClientRects = () => [];
};

const read = (text, bindings = {}) => domql.query(text, bindings).evaluate();

/** A module of one number property named for itself, answered by the function. */
const propertyModule = (name, implementation) => new DomqlModule(name, {
    members: [{ name, function: name, kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
}, implementation === undefined ? null : { [name]: implementation });

/** Reads a query against a registry of its own holding the built-in vocabulary and the module, or the modules. */
const readWith = (modules, text, bindings) => {
    const registry = new ModuleRegistry([Vocabulary.module, ...[modules].flat()]);
    const query = domql.query(text, bindings);
    const resolved = new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);

    return new QueryEvaluator(registry, resolved, query.bindings, { window, document }, null).evaluateOnce();
};

/** Two modules, each a Boolean member named for itself that answers what its name says and counts how often it is read. */
const probes = () => {
    const record = { yes: 0, no: 0 };
    const probe = (name, answer) => new DomqlModule(name, {
        members: [{ name, function: name, kind: 'property', on: 'element', parameters: [], result: 'boolean', changes: 'constant', reads: 'fresh' }],
    }, { [name]: () => { record[name]++; return answer; } });

    return { module: [probe('yes', true), probe('no', false)], record };
};

const failureWith = (module, text, bindings) => {
    try {
        readWith(module, text, bindings);
    } catch (error) {
        expect(error).toBeInstanceOf(DomqlError);
        expect(error.kind).toBe('evaluation');

        return error;
    }

    throw new Error('The query was read');
};

const failure = (text, bindings = {}) => {
    try {
        read(text, bindings);
    } catch (error) {
        expect(error).toBeInstanceOf(DomqlError);
        expect(error.kind).toBe('evaluation');

        return error;
    }

    throw new Error('The query was read');
};

describe('QueryEvaluator', () => {
    let panel;
    let items;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="panel">
                <div data-key="a1"></div>
                <div data-key="a2" aria-selected="true"></div>
                <div data-key="a3"></div>
            </div>`;
        panel = document.getElementById('panel');
        items = [...panel.children];
        lay(panel, { width: 640, height: 480 });
        items.forEach((item, index) => lay(item, { top: index * 50, width: 640, height: [48, 64, 48][index] }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('structure', () => {
        it('reads children, counts and selects', () => {
            expect(read('@panel.children.count', { panel })).toBe(3);
            expect(read('@panel.all("[data-key]").count', { panel })).toBe(3);
            expect(read('@panel.first("[aria-selected=true]") attributeOf "data-key"', { panel })).toBe('a2');
            expect(read('@item.closest("#panel") attributeOf "id"', { item: items[0] })).toBe('panel');
        });

        it('answers an empty list where nothing matches and null where an element is expected', () => {
            expect(read('@panel.all(".none").count', { panel })).toBe(0);
            expect(read('@panel.first(".none") attributeOf "id"', { panel })).toBeNull();
            expect(read('@panel.closest(".none") { id: self attributeOf "id" }', { panel })).toBeNull();
        });

        it('reads list items by position', () => {
            expect(read('@panel.children.first { key: self attributeOf "data-key" }', { panel })).toEqual({ key: 'a1' });
            expect(read('@panel.children.last { key: self attributeOf "data-key" }', { panel })).toEqual({ key: 'a3' });
            expect(read('@panel.children.at(1) { key: self attributeOf "data-key" }', { panel })).toEqual({ key: 'a2' });
            expect(read('@panel.children.at(3) { key: self attributeOf "data-key" }', { panel })).toBeNull();
            expect(read('@panel.children.at(-1) { key: self attributeOf "data-key" }', { panel })).toBeNull();
        });

        it('reads the parent', () => {
            expect(read('(@item.parent as "element") { id: self attributeOf "id" }', { item: items[0] })).toEqual({ id: 'panel' });
        });
    });

    describe('nodes', () => {
        const shadowHost = () => {
            const host = document.createElement('div');
            const root = host.attachShadow({ mode: 'open' });

            host.id = 'host';
            root.innerHTML = '<p id="inner"></p>';
            document.body.append(host);

            return { host, root, inner: root.getElementById('inner') };
        };

        it('reads the immediate parent, the root of the tree and a shadow root\'s host', () => {
            const { host, root, inner } = shadowHost();

            expect(read('(@inner.parent as "shadowRoot")?.host attributeOf "id"', { inner })).toBe('host');
            expect(read('@inner.root.host attributeOf "id"', { inner })).toBe('host');
            expect(read('@inner.root.children.count', { inner })).toBe(1);
            expect(read('(@host.root as "document")?.children.count', { host })).toBe(1);
            expect(read('@host.root.host attributeOf "id"', { host })).toBeNull();
            expect(read('@root.parent?.children.count', { root })).toBeNull();
            expect(read('@root.all("p").count', { root })).toBe(1);
            expect(read('@root.first("#inner") attributeOf "id"', { root })).toBe('inner');
        });

        it('casts a node to its kind, and answers null for one of another kind', () => {
            const { inner } = shadowHost();

            expect(read('(@inner.parent as "element") attributeOf "id"', { inner })).toBeNull();
            expect(read('(@item.parent as "element") attributeOf "id"', { item: items[0] })).toBe('panel');
            expect(read('(@item.root as "document")?.children.count', { item: items[0] })).toBe(1);
            expect(read('(@item.root as "shadowRoot")?.children.count', { item: items[0] })).toBeNull();
        });

        it('answers the topmost element of a detached tree as its root, which has no parent', () => {
            const detached = document.createElement('section');

            detached.id = 'top';
            detached.innerHTML = '<b></b>';

            expect(read('(@b.root as "element") attributeOf "id"', { b: detached.firstChild })).toBe('top');
            expect(read('@top.parent?.children.count', { top: detached })).toBeNull();
        });
    });

    describe('null', () => {
        it('answers null from the first null an optional access meets on', () => {
            const detached = document.createElement('div');

            expect(read('(@detached.parent as "element")?.size', { detached })).toBeNull();
            expect(read('@detached.parent?.children.count', { detached })).toBeNull();
            expect(read('@detached { parent: (self.parent as "element")?.size, tag: self attributeOf "id" }', { detached })).toEqual({ parent: null, tag: null });
        });

        it('skips the rest of an optional chain where a receiver is null, reading it where the receiver is present', () => {
            const reads = [];
            const registry = new ModuleRegistry([BrowserModule.create(), propertyModule('probe', element => (reads.push(element), 1))]);
            const readProbe = item => {
                const query = domql.query('(@item.parent as "element")?.probe', { item });
                const resolved = new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);

                return new QueryEvaluator(registry, resolved, query.bindings, { window, document }, null).evaluateOnce();
            };

            expect(readProbe(document.createElement('div'))).toBeNull();
            expect(reads).toEqual([]);
            expect(readProbe(items[0])).toBe(1);
            expect(reads).toEqual([panel]);
        });

        it('answers what an optional-access group reads, and null where a receiver in it is null', () => {
            expect(read('(?@item.parent.children.count)', { item: items[0] })).toBe(items.length);
            expect(read('(?@item.parent.children.count)', { item: document.createElement('div') })).toBeNull();
        });

        it('answers a coalescing operator\'s value where it is not null, and only otherwise evaluates its fallback', () => {
            const reads = [];
            const registry = new ModuleRegistry([BrowserModule.create(), propertyModule('probe', element => (reads.push(element), 7))]);
            const readProbe = text => {
                const query = domql.query(text, { item: items[0] });
                const resolved = new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);

                return new QueryEvaluator(registry, resolved, query.bindings, { window, document }, null).evaluateOnce();
            };

            expect(readProbe('1 ?? @item.probe')).toBe(1);
            expect(reads).toEqual([]);
            expect(readProbe('null ?? @item.probe')).toBe(7);
            expect(reads).toEqual([items[0]]);
            expect(read('@item attributeOf "missing" ?? "first" ?? "second"', { item: items[0] })).toBe('first');
        });

        it('answers null for an attribute the element does not have', () => {
            expect(read('@panel attributeOf "nothing"', { panel })).toBeNull();
        });

        it('answers null for a null argument of a propagating parameter without calling the member', () => {
            expect(read('@panel attributeOf @name', { panel, name: null })).toBeNull();
        });
    });

    describe('object expressions', () => {
        it('names each field as it is written, and keeps their order', () => {
            const answer = read('@panel { count: self.children.count, id: self attributeOf "id", attached: self.attached, children: self.hasChildren }', { panel });

            expect(answer).toEqual({ count: 3, id: 'panel', attached: true, children: true });
            expect(Object.keys(answer)).toEqual(['count', 'id', 'attached', 'children']);
        });

        it('applies an object expression to each item of a list, in order', () => {
            expect(read('@panel.children { key: self attributeOf "data-key", selected: self matches "[aria-selected=true]" }', { panel })).toEqual([
                { key: 'a1', selected: false },
                { key: 'a2', selected: true },
                { key: 'a3', selected: false },
            ]);
        });

        it('reads a top-level list of facts', () => {
            expect(read('{ items: @panel.children.count, kind: "list", none: null }', { panel })).toEqual({ items: 3, kind: 'list', none: null });
        });
    });

    describe('lists', () => {
        it('aggregates the numbers an expression produces', () => {
            expect(read('@panel.children.max(self.rect?.height)', { panel })).toBe(64);
            expect(read('@panel.children.min(self.rect?.height)', { panel })).toBe(48);
            expect(read('@panel.children.sum(self.rect?.height)', { panel })).toBe(160);
        });

        it('answers the aggregates of an empty list', () => {
            expect(read('@panel.all(".none").max(self.rect?.height)', { panel })).toBeNull();
            expect(read('@panel.all(".none").min(self.rect?.height)', { panel })).toBeNull();
            expect(read('@panel.all(".none").sum(self.rect?.height)', { panel })).toBe(0);
        });

        it('skips the items an expression produces null for', () => {
            const detached = [document.createElement('div'), document.createElement('div')];

            expect(read('@els.max(self.rect?.height)', { els: detached })).toBeNull();
            expect(read('@els.sum(self.rect?.height)', { els: detached })).toBe(0);
            expect(read('@els.max(self.rect?.height)', { els: [items[0], ...detached] })).toBe(48);
        });

        it('keeps the items a Boolean expression holds for', () => {
            expect(read('@panel.children.where(self matches "[aria-selected=true]").count', { panel })).toBe(1);
            expect(read('@panel.children.where(self.hasChildren).count', { panel })).toBe(0);
            expect(read('@els.where(self overlaps { other: @panel }).count', { els: [items[0], document.createElement('div')], panel })).toBe(1);
        });
    });

    describe('access by name', () => {
        it('reads what a name names, as direct access does', () => {
            expect(read('@panel["children"].count', { panel })).toBe(3);
            expect(read('@panel["size"]?.width', { panel })).toBe(640);
            expect(read('@panel { size: self["size"], clientSize: self["clientSize"] }', { panel }).size).toEqual({ width: 640, height: 480 });
        });

        it('takes the name from a bound string, a local, a conditional and a coalescing operator', () => {
            expect(read('@panel[@name]?.width', { panel, name: 'size' })).toBe(640);
            expect(read('@panel { let name: if @wide then "size" else "clientSize", width: self[name]?.width }', { panel, wide: true })).toEqual({ width: 640 });
            expect(read('@panel[@name ?? "size"]?.width', { panel, name: null })).toBe(640);
        });

        it('answers null where its receiver is null and it is optional', () => {
            const detached = document.createElement('div');

            expect(read('@detached[@name]?.width', { detached, name: 'size' })).toBeNull();
            expect(read('(@detached.parent as "element")?.[@name]', { detached, name: 'size' })).toBeNull();
        });
    });

    describe('predicates', () => {
        it('answers is and has', () => {
            document.body.insertAdjacentHTML('beforeend', '<button id="b" disabled></button><input id="i" readonly><textarea id="t"></textarea><div id="e" contenteditable="true"><span id="s"></span></div><div inert><div id="n" contenteditable="true"></div></div>');
            const element = id => document.getElementById(id);

            expect(read('@b.disabled', { b: element('b') })).toBe(true);
            expect(read('@panel.disabled', { panel })).toBe(false);
            expect(read('@i.readOnly', { i: element('i') })).toBe(true);
            expect(read('@i.textEditable', { i: element('i') })).toBe(false);
            expect(read('@t.textEditable', { t: element('t') })).toBe(true);
            expect(read('@s.textEditable', { s: element('s') })).toBe(true);
            expect(read('@n.textEditable', { n: element('n') })).toBe(false);
            expect(read('@panel.textEditable', { panel })).toBe(false);
            expect(read('@panel.hasChildren', { panel })).toBe(true);
            expect(read('@item.hasChildren', { item: items[0] })).toBe(false);
        });

        it('answers whether an element is attached', () => {
            expect(read('@panel.attached', { panel })).toBe(true);
            expect(read('@detached.attached', { detached: document.createElement('div') })).toBe(false);
        });

        it('answers whether an element is focused', () => {
            const button = document.createElement('button');
            document.body.append(button);

            expect(read('@button.focused', { button })).toBe(false);

            button.focus();

            expect(read('@button.focused', { button })).toBe(true);
        });

        it('answers the document predicates', () => {
            expect(read('@document.visible')).toBeTypeOf('boolean');
            expect(read('@document.hasFocus')).toBeTypeOf('boolean');
        });

        it('gives a member the document and the window it is read in where an argument names a root', () => {
            const module = new DomqlModule('inside', {
                members: [{ name: 'inside', function: 'inside', kind: 'operation', on: 'element', input: 'direct', parameters: [{ name: 'of', kind: 'value', type: 'document', required: true, nulls: 'propagate' }], result: 'boolean', changes: 'unobserved', reads: 'fresh' }],
            }, { inside: (element, { of }) => element.ownerDocument === of && of === document });
            const panel = document.body.appendChild(document.createElement('div'));

            expect(readWith(module, '@panel.inside(@document)', { panel })).toBe(true);
        });

        it('answers a selection of a text control', () => {
            const input = document.createElement('input');
            input.value = 'hello';
            document.body.append(input);
            input.setSelectionRange(1, 3);

            expect(read('@input.selection { start: self.start, end: self.end }', { input })).toEqual({ start: 1, end: 3 });
            expect(read('@input.hasSelection', { input })).toBe(true);

            input.setSelectionRange(2, 2);

            expect(read('@input.hasSelection', { input })).toBe(false);
            expect(read('@panel.selection { start: self.start }', { panel })).toBeNull();
        });
    });

    describe('Boolean expressions', () => {

        it.each([
            [true, true, true, true],
            [true, false, false, true],
            [false, true, false, true],
            [false, false, false, false],
        ])('combine %s and %s into %s with and, and %s with or', (left, right, and, or) => {
            const bindings = { left: left, right: right };

            expect(read('@left and @right', bindings)).toBe(and);
            expect(read('@left or @right', bindings)).toBe(or);
        });

        it('negate a Boolean with not, as many times as it is written', () => {
            expect(read('not @on', { on: true })).toBe(false);
            expect(read('not @on', { on: false })).toBe(true);
            expect(read('not not @on', { on: true })).toBe(true);
            expect(read('not (@on ?? true)', { on: null })).toBe(false);
        });

        it('read no operand once the result is decided', () => {
            const { module, record } = probes();

            expect(readWith(module, '@panel.no and @panel.yes', { panel })).toBe(false);
            expect(record).toEqual({ yes: 0, no: 1 });
            expect(readWith(module, '@panel.yes or @panel.no', { panel })).toBe(true);
            expect(record).toEqual({ yes: 1, no: 1 });
            expect(readWith(module, '(@nothing ?? false) or @panel.yes', { panel, nothing: null })).toBe(true);
            expect(record).toEqual({ yes: 2, no: 1 });
        });

        it('answer null for a test an optional access reads of null', () => {
            expect(read('@panel.first(".none")?.attached', { panel })).toBeNull();
        });

        it('test the current value inside an object expression and an expression argument', () => {
            expect(read('@panel { attached: self.attached, empty: self.hasChildren }', { panel })).toEqual({ attached: true, empty: true });
            expect(read('@panel.children.where(self.attached and self.focused).count', { panel })).toBe(0);
        });

        it('read a test by a name the bindings hold', () => {
            expect(read('@panel[@state] or @panel[@other]', { panel, state: 'focused', other: 'attached' })).toBe(true);
        });

        it('answer whether a subject is null with is null, never null itself', () => {
            expect(read('@panel.first(".none") is null', { panel })).toBe(true);
            expect(read('@panel.parent is null', { panel })).toBe(false);
            expect(read('null is null')).toBe(true);
        });
    });

    describe('equalities', () => {
        it('compare strings by code unit, numbers numerically, Booleans by value and nodes by identity', () => {
            expect(read('@a is "x"', { a: 'x' })).toBe(true);
            expect(read('@a is "X"', { a: 'x' })).toBe(false);
            expect(read('@a is 0', { a: -0 })).toBe(true);
            expect(read('@a is false', { a: false })).toBe(true);
            expect(read('@a is @b', { a: items[0], b: items[0] })).toBe(true);
            expect(read('@a is not @b', { a: items[0], b: items[1] })).toBe(true);
            expect(read('(@item.parent as "element") is @panel', { item: items[0], panel })).toBe(true);
        });

        it('equal null to null alone, whatever the other value\'s type', () => {
            expect(read('@a is null', { a: null })).toBe(true);
            expect(read('@panel.first(".none") is null', { panel })).toBe(true);
            expect(read('@a is not null', { a: 0 })).toBe(true);
            expect(read('@a is ""', { a: null })).toBe(false);
        });

        it.each([true, false, null])('compare and negate a nullable Boolean %s as the table of nullable Booleans states', x => {
            expect(read('@x is true', { x })).toBe(read('@x ?? false', { x }));
            expect(read('@x is false', { x })).toBe(read('not (@x ?? true)', { x }));
            expect(read('@x is not true', { x })).toBe(read('not (@x ?? false)', { x }));
            expect(read('@x is not false', { x })).toBe(read('@x ?? true', { x }));
        });
    });

    describe('conditionals', () => {
        it.each([
            [true, 'consequent'],
            [false, 'alternative'],
        ])('select by a condition of %s the %s', (condition, branch) => {
            expect(read('if @condition then "consequent" else "alternative"', { condition: condition })).toBe(branch);
        });

        it('move to the next clause where a condition is false, and to the alternative where none is true', () => {
            const bindings = (a, b) => ({ a: a, b: b });

            expect(read('if @a then 1 elseif @b then 2 else 3', bindings(false, true))).toBe(2);
            expect(read('if @a then 1 elseif @b then 2 else 3', bindings(false, false))).toBe(3);
            expect(read('if @a then 1 elseif @b then 2 else 3', bindings(true, true))).toBe(1);
            expect(read('if @a ?? false then 1 elseif @b then 2 else 3', bindings(null, true))).toBe(2);
        });

        it('evaluate only the branch the condition selects', () => {
            const { module, record } = probes();

            expect(readWith(module, 'if @panel.yes then @panel.yes else @panel.no', { panel })).toBe(true);
            expect(record).toEqual({ yes: 2, no: 0 });
        });

        it('keep the value of the selected branch, false and null included', () => {
            expect(read('if @on then false else true', { on: true })).toBe(false);
            expect(read('if @on then null else 1', { on: true })).toBeNull();
        });

        it('start a chain from a group, reading from the element the condition selects', () => {
            expect(read('(if @first then @panel else @other) attributeOf "id"', { first: false, panel, other: items[0] })).toBe(items[0].getAttribute('id'));
        });
    });

    describe('locals', () => {
        /** A module whose `counted` property counts the times it is read, answering the count. */
        const counting = () => {
            const record = { reads: 0 };

            return { module: propertyModule('counted', () => ++record.reads), record };
        };

        it('evaluate a local once for each application of its object expression, giving every use there its value', () => {
            const { module, record } = counting();
            const result = readWith(module, '@rows { let n: self.counted, a: n, b: n }', { rows: items });

            expect(record.reads).toBe(3);
            expect(result).toEqual([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }]);
        });

        it('evaluate a local no evaluated expression uses never', () => {
            const { module, record } = counting();

            expect(readWith(module, '@panel { let n: self.counted, a: 1 }', { panel })).toEqual({ a: 1 });
            expect(readWith(module, '@panel { let n: self.counted, a: if @on then n else 0 }', { panel, on: false })).toEqual({ a: 0 });
            expect(record.reads).toBe(0);
        });

        it('evaluate a local at its first use, wherever that is', () => {
            const { module, record } = counting();

            expect(readWith(module, '@panel { let n: self.counted, a: if @on then n else 0, b: n }', { panel, on: false })).toEqual({ a: 0, b: 1 });
            expect(record.reads).toBe(1);
        });

        it('give a later evaluation fresh locals', () => {
            const { module } = counting();

            expect(readWith(module, '@panel { let n: self.counted, a: n }', { panel })).toEqual({ a: 1 });
            expect(readWith(module, '@panel { let n: self.counted, a: n }', { panel })).toEqual({ a: 2 });
        });

        it('keep the self of where a local is written, used inside a nested projection', () => {
            const result = read('@panel { let owner: self attributeOf "id", rows: self.children { owner: owner, key: self attributeOf "data-key" } }', { panel });

            expect(result.rows).toEqual([{ owner: 'panel', key: 'a1' }, { owner: 'panel', key: 'a2' }, { owner: 'panel', key: 'a3' }]);
        });

        it('give a local to the expression an argument evaluates for each item', () => {
            expect(read('@panel { let selector: "[aria-selected=true]", selected: self.children.where(self matches selector) { key: self attributeOf "data-key" } }', { panel }))
                .toEqual({ selected: [{ key: 'a2' }] });
        });

        it('use the locals before it, and those of an enclosing object expression', () => {
            expect(read('@panel { let rows: self.children, let first: rows.at(0), key: first attributeOf "data-key", inner: self { last: rows.at(2) attributeOf "data-key" } }', { panel }))
                .toEqual({ key: 'a1', inner: { last: 'a3' } });
        });

        it('stand where an access by name\'s name is, with the names they can give', () => {
            expect(read('@panel { let name: "size", width: self[name]?.width }', { panel })).toEqual({ width: 640 });
            expect(read('@panel { let name: @name, let selected: name, width: self[selected]?.width }', { panel, name: 'size' })).toEqual({ width: 640 });
        });
    });

    describe('geometry', () => {
        it('reads a rectangle from the layout viewport and relative to another element', () => {
            expect(read('@item.rect', { item: items[1] })).toEqual({ left: 0, top: 50, right: 640, bottom: 114, width: 640, height: 64 });
            expect(read('@item.rectRelativeTo(@panel)', { item: items[1], panel })).toEqual({ left: 0, top: 50, right: 640, bottom: 114, width: 640, height: 64 });
            expect(read('@item.rect?.height', { item: items[1] })).toBe(64);
        });

        it('answers null for an element without layout', () => {
            const detached = document.createElement('div');

            expect(read('@detached.rect', { detached })).toBeNull();
            expect(read('@item.rectRelativeTo(@detached)', { item: items[0], detached })).toBeNull();
            expect(read('@item.rectRelativeTo(@none)', { item: items[0], none: null })).toBeNull();
        });

        it('answers null for an attached element without a layout box and the actual zero of one with a box of no size', () => {
            const hidden = document.createElement('div');
            document.body.append(hidden);
            lay(hidden, {});

            expect(read('@hidden.size', { hidden })).toEqual({ width: 0, height: 0 });
            expect(read('@hidden.rect?.width', { hidden })).toBe(0);

            unlay(hidden);

            expect(read('@hidden.size', { hidden })).toBeNull();
            expect(read('@hidden.rect', { hidden })).toBeNull();
            expect(read('@hidden.clientSize', { hidden })).toBeNull();
            expect(read('@hidden.grid?.columns', { hidden })).toBeNull();
            expect(read('@hidden.attached', { hidden })).toBe(true);
            expect(read('@item.rectRelativeTo(@hidden)', { item: items[0], hidden })).toBeNull();
            expect(read('@hidden overlaps { other: @item }', { hidden, item: items[0] })).toBeNull();
        });

        it('compares two boxes', () => {
            expect(read('@a overlaps { other: @b }', { a: items[0], b: items[1] })).toBe(false);
            expect(read('@a overlaps { other: @b, margin: 10 }', { a: items[0], b: items[1] })).toBe(true);
            expect(read('@a overlaps { other: @b }', { a: items[0], b: items[0] })).toBe(true);
        });
    });

    describe('the window', () => {
        it('reads the window and its media queries', () => {
            expect(read('@window.size.width')).toBeTypeOf('number');
            expect(read('@window.devicePixelRatio')).toBeTypeOf('number');
            expect(read('@window matchesMedia "(min-width: 0px)"')).toBe(true);
            expect(read('@window { share: self supports "share" }').share).toBeTypeOf('boolean');
        });

        it('reads the window it is given', () => {
            const query = domql.query('@window.devicePixelRatio');

            expect(query.evaluate({ window: { document, devicePixelRatio: 3 } })).toBe(3);
        });
    });

    describe('computed style', () => {
        it('reads a custom property and answers null for one that is not set', () => {
            panel.style.setProperty('--tier', 'medium');

            expect(read('@panel computedStyleOf "--tier"', { panel })).toBe('medium');
            expect(read('@panel computedStyleOf "--none"', { panel })).toBeNull();
        });
    });

    describe('answers', () => {
        it('are the same for a parsed query and one created from its definition', () => {
            const parsed = domql.query('@panel { count: self.children.count, keys: self.children { key: self attributeOf "data-key" } }', { panel });
            const created = domql.query(parsed.definition, { panel });

            expect(created.evaluate()).toEqual(parsed.evaluate());
        });

        it('are immutable data that shares nothing with the bindings', () => {
            const numbers = [1, 2, 3];
            const answer = read('@numbers', { numbers });

            expect(answer).toEqual(numbers);
            expect(answer).not.toBe(numbers);
            expect(Object.isFrozen(answer)).toBe(true);
            expect(Object.isFrozen(read('@panel { size: self.size }', { panel }))).toBe(true);
        });

        it('read a field of a bound object', () => {
            expect(read('@box.width', { box: { width: 5, height: 6 } })).toBe(5);
            expect(read('@box { width: self.width, other: self.height }', { box: { width: 5, height: 6 } })).toEqual({ width: 5, other: 6 });
        });
    });

    describe('errors', () => {
        it('fail where a member fails, naming it and where', () => {
            const error = failure('@panel matches "["', { panel });

            expect(error.message).toContain("The member 'matches' failed");
            expect(error.location.line).toBe(1);
            expect(error.cause).toBeInstanceOf(Error);
        });

        it('fail where a member throws what is no error, keeping it as the cause', () => {
            const error = failureWith(propertyModule('nothing', () => {
                throw null;
            }), '@panel.nothing', { panel });

            expect(error.message).toContain("The member 'nothing' failed: null");
            expect(error.cause).toBeNull();
        });

        it('refuse a member maintained by an observation', () => {
            expect(failure('@item intersects', { item: items[0] }).message).toContain("The member 'intersects' is maintained by an observation");
        });

        it('refuse a request that is not valid before reading anything', () => {
            expect(() => read('@panel.nonsense', { panel })).toThrow(expect.objectContaining({ kind: 'validation' }));
        });

        it('report a module that answers a type other than the one it declares', () => {
            const error = failureWith(propertyModule('broken', () => 'seven'), '@panel.broken', { panel });

            expect(error.message).toContain('answered "seven", and it declares number');
        });

        it('report a module that answers a list with a hole, which holds no value there', () => {
            const gappy = new DomqlModule('gappy', {
                members: [{ name: 'gappy', function: 'gappy', kind: 'property', on: 'element', parameters: [], result: 'list<number?>', changes: 'constant', reads: 'fresh' }],
            }, { gappy: () => [1, , 2] });

            expect(failureWith(gappy, '@panel.gappy', { panel }).message).toContain('answered a list with a hole at index 1, and it declares list<number?>');
        });

        it('name an element a module answers where a number is declared', () => {
            expect(failureWith(propertyModule('leaking', element => element), '@panel.leaking', { panel }).message).toContain('answered an element, and it declares number');
        });

        it('report a module that declares and does not implement', () => {
            expect(failureWith(propertyModule('declared'), '@panel.declared', { panel }).message).toContain("The module 'declared' supplies no function for 'declared'");
        });
    });
});

describe('QueryEvaluator evaluation', () => {
    let panel;
    let rows;
    let observations;
    let evaluations;
    let changes;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel"><i></i><i></i><i></i></div>';
        panel = document.getElementById('panel');
        rows = [...panel.children];
        evaluations = [];
        changes = 0;
    });

    afterEach(() => {
        evaluations.forEach(evaluation => evaluation.dispose());
        document.body.innerHTML = '';
    });

    /** Evaluates the query against the registry, holding its observations in `observations`, and records each call it depends on unless asked not to. */
    const evaluate = (text, bindings = {}, modules = [], holdsAllObservations = false, recordsDependencies = true) => {
        const registry = new ModuleRegistry([BrowserModule.create(), ...modules]);
        const query = domql.query(text, bindings);
        const resolved = new LanguageResolver(registry, query.bindings, null, { watch: true, acceptPartialObservation: true }).resolveDefinition(query.definition);
        const evaluator = new QueryEvaluator(registry, resolved, query.bindings, { window, document }, null);

        observations = new Observations(registry, { window, document });

        const evaluation = evaluator.evaluate({ observations, onChange: () => changes++, holdsAllObservations, recordsDependencies });

        evaluations.push(evaluation);

        return evaluation;
    };

    const membersOf = evaluation => evaluation.dependencies.map(dependency => dependency.member);

    describe('branches', () => {
        /** Whether the conditional each recorded branch belongs to selected its consequent, in the order they were selected. */
        const consequents = identities => [...identities.branches].map(([conditional, branch]) => branch === conditional.consequent);

        it('are recorded beside the identities of the place in the result each conditional gave', () => {
            expect(consequents(evaluate('if @on then 1 else 2', { on: true }).identities)).toEqual([true]);
            expect(consequents(evaluate('@panel { width: if @on then @panel.size?.width else 0 }', { panel, on: false }).identities.fields.width)).toEqual([false]);
        });

        it('record an elseif as the conditional nested in the alternative it is', () => {
            expect(consequents(evaluate('if @a then 1 elseif @b then 2 else 3', { a: false, b: true }).identities)).toEqual([false, true]);
        });

        it('are recorded for each item, which can select a different branch', () => {
            rows[1].setAttribute('data-on', '');

            const { items } = evaluate('@panel.children { pick: if (self attributeOf "data-on") is null then 2 else 1 }', { panel }).identities;

            expect(items.map(item => consequents(item.fields.pick))).toEqual([[true], [false], [true]]);
        });

        it('leave the identities of a result no conditional gave as they were', () => {
            expect(evaluate('@panel { width: @panel.size?.width }', { panel }).identities).toBeNull();
        });

        it('are recorded at every place a local is used, which its conditionals gave', () => {
            const { fields } = evaluate('@panel { let w: if @on then 1 else 2, a: w, b: w }', { panel, on: true }).identities;

            expect(consequents(fields.a)).toEqual([true]);
            expect(consequents(fields.b)).toEqual([true]);
        });
    });

    describe('dependencies', () => {
        it('are each member applied to its receiver and arguments, with the observations that cover it', () => {
            const evaluation = evaluate('@panel attributeOf "id"', { panel });

            expect(evaluation.value).toBe('panel');
            expect(evaluation.dependencies).toEqual([{
                member: 'attributeOf',
                pointer: '/query',
                observations: [{ type: 'mutation', target: panel, arguments: { attributes: ['id'] } }],
            }]);
        });

        it('follow the document: the members read for each item the selector matched', () => {
            const evaluation = evaluate('@panel.all("i").max(self.rect?.height)', { panel });
            const measured = evaluation.dependencies.filter(dependency => dependency.member === 'rect');

            expect(membersOf(evaluation).slice(0, 2)).toEqual(['all', 'max']);
            expect(measured.map(dependency => dependency.observations[0].target)).toEqual(rows);
            expect(measured.every(dependency => dependency.observations[0].type === 'resize')).toBe(true);
        });

        it('stand where each member is written, inside the items of a list and the operands of an or', () => {
            const evaluation = evaluate('@panel.all("i") { h: self.rect?.height, on: self.attached or self.focused }', { panel });

            expect(evaluation.dependencies.map(dependency => [dependency.member, dependency.pointer])).toEqual([
                ['all', '/query/target'],
                ...rows.flatMap(() => [['rect', '/query/fields/0/value/target/target'], ['attached', '/query/fields/1/value/operands/0']]),
            ]);
        });

        it('stand where each operand of an equality is written, both evaluated', () => {
            expect(membersOf(evaluate('@panel attributeOf "id" is @panel.first("i") attributeOf "id"', { panel }))).toEqual(['attributeOf', 'first', 'attributeOf']);
        });

        it('stop where an optional chain meets null, and reach as far as its receivers are present', () => {
            expect(membersOf(evaluate('(@item.parent as "element")?.size', { item: document.createElement('i') }))).toEqual(['parent']);
            expect(membersOf(evaluate('(@item.parent as "element")?.size', { item: rows[0] }))).toEqual(['parent', 'size']);
        });

        it('include those of an argument that is a value of its own', () => {
            const evaluation = evaluate('@row overlaps { other: @panel.parent as "element" }', { row: rows[0], panel });
            const overlaps = evaluation.dependencies.find(dependency => dependency.member === 'overlaps');

            expect(membersOf(evaluation)).toContain('parent');
            expect(overlaps.observations.some(observation => observation.type === 'resize' && observation.target === panel.parentElement)).toBe(true);
        });

        it('include what a chain read before it met null, and nothing after', () => {
            const evaluation = evaluate('@panel.closest(".none") attributeOf "id"', { panel });

            expect(evaluation.value).toBeNull();
            expect(membersOf(evaluation)).toEqual(['closest']);
            expect(evaluation.dependencies[0].observations.length).toBeGreaterThan(0);
        });

        it('include the attachment of an element that answered null because it is detached', () => {
            const detached = document.createElement('div');
            const evaluation = evaluate('@element.rect', { element: detached });
            const attachments = evaluation.dependencies.flatMap(dependency => dependency.observations).filter(observation => observation.type === 'attachment');

            expect(evaluation.value).toBeNull();
            expect(attachments).toEqual([{ type: 'attachment', target: detached, arguments: {} }]);
        });

        it('leave the attachment out for an element that is attached', () => {
            const evaluation = evaluate('@element attributeOf "id"', { element: panel });

            expect(evaluation.dependencies.flatMap(dependency => dependency.observations).some(observation => observation.type === 'attachment')).toBe(false);
        });

        it('include only those of the locals evaluation used', () => {
            expect(membersOf(evaluate('@panel { let s: self.size, let c: self.clientSize, a: s, b: s }', { panel }))).toEqual(['size']);
        });

        it('include only those of the branch a conditional evaluated', () => {
            expect(membersOf(evaluate('if @on then @panel.size else @panel.clientSize', { panel, on: true }))).toEqual(['size']);
            expect(membersOf(evaluate('if @on then @panel.size else @panel.clientSize', { panel, on: false }))).toEqual(['clientSize']);
        });

        it('include the predicates an or reached, and none it did not need', () => {
            const reached = evaluate('@panel.attached or @panel.focused', { panel });
            const both = evaluate('@panel.focused or @panel.attached', { panel });

            expect(membersOf(reached)).toEqual(['attached']);
            expect(membersOf(both)).toEqual(['focused', 'attached']);
        });

        it('are kept with the failure of an evaluation that recorded them before it failed', () => {
            const evaluation = evaluate('{ id: @panel attributeOf "id", boom: @panel.boom }', { panel }, [propertyModule('boom', () => { throw new Error('no'); })]);

            expect(evaluation.error).toBeInstanceOf(DomqlError);
            expect(evaluation.error.message).toContain("The member 'boom' failed");
            expect(evaluation.value).toBeUndefined();
            expect(membersOf(evaluation)).toEqual(['attributeOf', 'boom']);
        });
    });

    /** A member kept by an observation that never samples, so an evaluation that reads it stays pending. */
    const waitingModule = () => new DomqlModule('level', {
        observationTypes: [{ name: 'level', contract: 'maintained', function: 'observeLevel' }],
        members: [{
            name: 'level', function: 'level', kind: 'property', on: 'element', parameters: [], result: 'number?',
            changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }],
        }],
    }, {
        observeLevel: () => ({ stop: () => {}, sample: () => ({ pending: true, value: null }) }),
        level: (_receiver, _args, _environment, [sample]) => sample,
    });

    describe('observations', () => {
        it('are not held for an answer that is complete, which needs nothing more observed', () => {
            const evaluation = evaluate('@panel attributeOf "id"', { panel });

            expect(evaluation.isPending).toBe(false);
            expect(evaluation.dependencies.length).toBe(1);
            expect(observations.runningCount).toBe(0);
        });

        it('are all held for a pending answer, which waits on any of them changing', () => {
            const evaluation = evaluate('{ id: @panel attributeOf "id", level: @panel.level }', { panel }, [waitingModule()]);

            expect(evaluation.isPending).toBe(true);
            expect(evaluation.value).toEqual({ id: 'panel', level: null });
            expect(observations.runningCount).toBe(2);
        });

        it('are all held where the caller keeps the answer current', () => {
            evaluate('@panel attributeOf "id"', { panel }, [], true);

            expect(observations.runningCount).toBe(1);
        });

        it('are held while the evaluation is, and let go when it is disposed', () => {
            const evaluation = evaluate('@panel attributeOf "id"', { panel }, [], true);

            expect(observations.runningCount).toBe(1);

            evaluation.dispose();

            expect(observations.runningCount).toBe(0);
            expect(evaluation.isDisposed).toBe(true);
        });

        it('are followed without a record of each call where the caller asks for none', async () => {
            const evaluation = evaluate('@panel attributeOf "id"', { panel }, [], true, false);

            expect(evaluation.dependencies).toBeNull();
            expect(observations.runningCount).toBe(1);

            panel.setAttribute('id', 'renamed');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });

        it('call the evaluation back when something it depends on changes', async () => {
            evaluate('@panel attributeOf "id"', { panel }, [], true);
            panel.setAttribute('id', 'renamed');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });

        it('are held once for every call that observes the same, so a change calls the evaluation back once', async () => {
            const evaluation = evaluate('@panel.children { on: self matches "[data-on]" }', { panel }, [], true);
            const requests = evaluation.dependencies.flatMap(dependency => dependency.observations);

            expect(evaluation.dependencies.length).toBe(4);
            expect(new Set(requests).size).toBeLessThan(requests.length);

            rows[1].setAttribute('data-on', '');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });

        it('are held once for every call that observes the same while a pending answer waits', async () => {
            const evaluation = evaluate('@panel.children { on: self matches "[data-on]", level: self.level }', { panel }, [waitingModule()]);

            expect(evaluation.isPending).toBe(true);

            rows[1].setAttribute('data-on', '');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });
    });

    describe('sessions an evaluation replaces', () => {
        let started;
        let stopped;

        beforeEach(() => {
            started = 0;
            stopped = 0;
        });

        /** A member observed through a probe of its receiver, shared or not, whose identity is the names its argument gives, none by default. */
        const probeModule = (shared = true) => new DomqlModule('probe', {
            observationTypes: [{ name: 'probe', contract: 'invalidation', identity: ['names'], shared, function: 'observeProbe' }],
            members: [{
                name: 'probe', function: 'probe', kind: 'operation', on: 'element', result: 'number', changes: 'observable', reads: 'fresh',
                input: 'direct',
                parameters: [{ name: 'names', kind: 'value', type: 'list<string>', required: false, default: [], fixed: false, nulls: 'propagate' }],
                observations: [{ type: 'probe', of: 'receiver', names: { argument: 'names' } }],
            }],
        }, {
            observeProbe: () => {
                started++;

                return { stop: () => stopped++ };
            },
            probe: () => 1,
        });

        /** Evaluates the query again and again in one window, as a watch does, counting what each evaluation acquires. */
        const evaluationsOf = (text, bindings, modules) => {
            const registry = new ModuleRegistry([BrowserModule.create(), ...modules]);
            const query = domql.query(text, bindings);
            const resolved = new LanguageResolver(registry, query.bindings, null, { watch: true, acceptPartialObservation: true }).resolveDefinition(query.definition);
            const evaluator = new QueryEvaluator(registry, resolved, query.bindings, { window, document }, null);
            const shared = new Observations(registry, { window, document });
            const acquire = vi.spyOn(shared, 'acquire');

            observations = shared;

            return {
                acquired: () => acquire.mock.calls.length,
                evaluate: replaces => {
                    const evaluation = evaluator.evaluate({ observations: shared, onChange: () => changes++, holdsAllObservations: true, replaces, recordsDependencies: true });

                    evaluations.push(evaluation);

                    return evaluation;
                },
            };
        };

        it('are taken over by every evaluation in turn, each from the one it replaces, so a run of them acquires nothing after the first', () => {
            const run = evaluationsOf('@panel.children { p: self.probe(), w: self.rect?.width }', { panel }, [probeModule()]);
            let last = run.evaluate([]);
            const acquired = run.acquired();

            for (let index = 0; index < 4; index++) {
                const next = run.evaluate([last]);

                last.dispose();
                last = next;
            }

            expect(run.acquired()).toBe(acquired);
            expect([started, stopped]).toEqual([3, 0]);
        });

        it('are taken over where the evaluation observes the same again, so nothing is acquired or stopped', () => {
            const run = evaluationsOf('@panel.children { p: self.probe() }', { panel }, [probeModule()]);
            const first = run.evaluate([]);
            const acquired = run.acquired();
            const second = run.evaluate([first]);

            first.dispose();

            expect(run.acquired()).toBe(acquired);
            expect([started, stopped]).toEqual([3, 0]);
            expect(second.dependencies).toEqual(first.dependencies);

            second.dispose();

            expect([started, stopped]).toEqual([3, 3]);
            expect(observations.runningCount).toBe(0);
        });

        it('are taken from every evaluation replaced, so one only an earlier of them still holds is not started again', () => {
            const run = evaluationsOf('@panel.children { p: self.probe() }', { panel }, [probeModule()]);
            const first = run.evaluate([]);
            const last = rows[2];

            last.remove();

            const second = run.evaluate([first]);

            panel.append(last);

            const third = run.evaluate([first, second]);

            first.dispose();
            second.dispose();

            expect([started, stopped]).toEqual([3, 0]);

            third.dispose();

            expect([started, stopped]).toEqual([3, 3]);
            expect(observations.runningCount).toBe(0);
        });

        it('are acquired again where an argument changed, a bound list changed in place included, and the old one is let go', () => {
            const names = ['a'];
            const run = evaluationsOf('@panel.probe(@names)', { panel, names }, [probeModule()]);
            const first = run.evaluate([]);

            names.push('b');

            const second = run.evaluate([first]);

            first.dispose();

            expect([started, stopped]).toEqual([2, 1]);

            run.evaluate([second]);
            second.dispose();

            expect([started, stopped]).toEqual([2, 1]);
        });

        it('are held once, and taken over once, where the evaluation observes the same twice', () => {
            const run = evaluationsOf('@items { p: self.probe() }', { items: [rows[0], rows[0]] }, [probeModule()]);
            const first = run.evaluate([]);

            expect(run.acquired()).toBe(1);

            const second = run.evaluate([first]);

            first.dispose();

            expect(run.acquired()).toBe(1);
            expect([started, stopped]).toEqual([1, 0]);

            second.dispose();

            expect([started, stopped]).toEqual([1, 1]);
        });

        it('leave an unshared observation to start afresh each evaluation', () => {
            const run = evaluationsOf('@panel.probe()', { panel }, [probeModule(false)]);
            const first = run.evaluate([]);
            const second = run.evaluate([first]);

            first.dispose();

            expect([started, stopped]).toEqual([2, 1]);

            second.dispose();

            expect([started, stopped]).toEqual([2, 2]);
        });

        it('are acquired again where the window\'s observations ended those the replaced evaluation held', () => {
            const run = evaluationsOf('@panel.probe()', { panel }, [probeModule()]);
            const first = run.evaluate([]);

            observations.dispose();

            run.evaluate([first]);
            first.dispose();

            expect([started, stopped]).toEqual([2, 1]);
            expect(observations.runningCount).toBe(1);
        });

        it('are neither taken over nor kept for one where the evaluation replaces none', () => {
            const run = evaluationsOf('@panel.probe()', { panel }, [probeModule()]);
            const first = run.evaluate(null);

            run.evaluate([first]);
            first.dispose();

            expect([started, stopped]).toEqual([1, 0]);
            expect(run.acquired()).toBe(2);
        });
    });
});

describe('QueryEvaluator projection', () => {
    let panel;
    let observations;
    let started;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel"><i></i></div>';
        panel = document.getElementById('panel');
        started = [];
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    /** A module whose source `ticks` delivers events of the type it declares, and records each start. */
    const ticks = payload => new DomqlModule('ticks', {
        types: [{ name: 'tick', fields: { at: 'number', label: 'string?' } }],
        eventTypes: [{ name: 'tick', payload }],
        members: [{ name: 'ticks', function: 'ticks', kind: 'source', on: 'element', input: 'direct', parameters: [{ name: 'type', kind: 'value', type: 'string', required: true, fixed: true, selects: 'eventType', nulls: 'propagate' }], result: 'event<@selected>', changes: 'constant', reads: 'captured' }],
    }, {
        ticks: () => {
            started.push(true);

            return { stop: () => {} };
        },
    });

    const evaluatorOf = (text, bindings = {}, modules = []) => {
        const registry = new ModuleRegistry([BrowserModule.create(), ...modules]);
        const query = domql.query(text, bindings);
        const resolved = new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);

        observations = new Observations(registry, { window, document });

        return new QueryEvaluator(registry, resolved, query.bindings, { window, document }, null);
    };

    const failureOf = call => {
        try {
            call();
        } catch (error) {
            return error;
        }

        throw new Error('The call threw nothing');
    };

    /** Captures the event as the subscription's source does, and projects it. */
    const projectionOf = (evaluator, event) => evaluator.project(evaluator.resolveSource().capture(event), { observations });

    describe('the source', () => {
        it('resolves into what starts it: the function, and the receiver and arguments evaluated now', () => {
            const source = evaluatorOf('@panel.ticks("tick") { at: self.at }', { panel }, [ticks('tick')]).resolveSource();

            expect(source).toMatchObject({ name: 'ticks', receiver: panel, args: { type: 'tick' }, environment: { window, document } });
            expect(typeof source.start).toBe('function');
            expect(started).toEqual([]);
        });

        it('is null where its receiver is, since there is nothing to listen to', () => {
            expect(evaluatorOf('@panel.first(".none")?.ticks("tick") { at: self.at }', { panel }, [ticks('tick')]).resolveSource()).toBeNull();
        });

        it('is refused for a request that is not a subscription', () => {
            expect(failureOf(() => evaluatorOf('@panel.children.count', { panel }).resolveSource())).toMatchObject({ kind: 'evaluation', message: expect.stringContaining('A query request is not subscribed to') });
        });

        it('captures an event as the fields its type declares, a nullable one it does not carry as null', () => {
            const { capture } = evaluatorOf('@panel.ticks("tick") { at: self.at, label: self.label }', { panel }, [ticks('tick')]).resolveSource();

            expect(capture({ at: 1, label: 'first', extra: true })).toEqual({ at: 1, label: 'first' });
            expect(capture({ at: 1 })).toEqual({ at: 1, label: null });
            expect(capture({ at: 1, label: 7 })).toEqual({ at: 1, label: null });
        });

        it('fails a capture where the event carries no value a field that is not nullable admits', () => {
            const { capture } = evaluatorOf('@panel.ticks("tick") { at: self.at }', { panel }, [ticks('tick')]).resolveSource();

            expect(failureOf(() => capture({ at: 'soon' }))).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The source 'ticks' delivered an event whose 'at' is \"soon\", and its type declares number") });
            expect(failureOf(() => capture(null))).toMatchObject({ kind: 'evaluation' });
        });

        it('takes an event whole where its type declares no fields, and fails one that is not of its type', () => {
            const { capture } = evaluatorOf('@panel.ticks("tick")', { panel }, [ticks('number')]).resolveSource();

            expect(capture(5)).toBe(5);
            expect(failureOf(() => capture('five'))).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The source 'ticks' delivered \"five\", and its event data is number") });
        });

        it('captures a native event with its target, and null for a target that is no element', () => {
            const { capture } = evaluatorOf('(@document on "scroll") { id: self.target attributeOf "id" }').resolveSource();

            expect(capture(new window.Event('scroll'))).toEqual({ target: null });
            expect(capture({ target: panel })).toEqual({ target: panel });
            expect(capture({ target: document })).toEqual({ target: null });
        });
    });

    describe('an event', () => {
        it('is projected through the object expression that follows its source, as detached, immutable data', () => {
            const evaluator = evaluatorOf('@panel.ticks("tick") { at: self.at, label: self.label, count: @panel.children.count }', { panel }, [ticks('tick')]);
            const projection = projectionOf(evaluator, { at: 3, label: 'third' });

            expect(projection.error).toBeNull();
            expect(projection.value).toEqual({ at: 3, label: 'third', count: 1 });
            expect(Object.isFrozen(projection.value)).toBe(true);
        });

        it('reads what it captured, and the document as it is', () => {
            const evaluator = evaluatorOf('(@document on "scroll") { id: self.target attributeOf "id" }');

            expect(projectionOf(evaluator, { target: panel }).value).toEqual({ id: 'panel' });
            expect(projectionOf(evaluator, { target: document }).value).toEqual({ id: null });
        });

        it('fails its projection where a member fails, without throwing', () => {
            const evaluator = evaluatorOf('@panel.ticks("tick") { match: @panel matches "[" }', { panel }, [ticks('tick')]);
            const projection = projectionOf(evaluator, { at: 1 });

            expect(projection.value).toBeUndefined();
            expect(projection.error).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The member 'matches' failed") });
        });

        it('stands for its source, which the projection never starts or reads', () => {
            const evaluator = evaluatorOf('@panel.ticks("tick") { at: self.at }', { panel }, [ticks('tick')]);

            projectionOf(evaluator, { at: 1 });
            projectionOf(evaluator, { at: 2 });

            expect(started).toEqual([]);
        });
    });
});
