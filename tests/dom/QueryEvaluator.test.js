import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';
import { Observations } from '#domql/dom/Observations.mjs';
import { QueryEvaluator } from '#domql/dom/QueryEvaluator.mjs';
import { domql } from '#domql/domql.js';
import { nexo, NexoError } from '@formaui-net/nexo';

/** Gives the element a border box, since the test environment lays nothing out. */
const lay = (element, { left = 0, top = 0, width = 0, height = 0 }) => {
    element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
    element.getClientRects = () => [element.getBoundingClientRect()];
};

/** Gives the element a scroll position, a scrolling area, a scrollport and borders, as a browser lays them out. */
const scrollTo = (element, { scrollLeft = 0, scrollTop = 0, scrollWidth = 0, scrollHeight = 0, clientWidth = 0, clientHeight = 0, clientLeft = 0, clientTop = 0 }) => {
    Object.entries({ scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight, clientLeft, clientTop }).forEach(([name, value]) => Object.defineProperty(element, name, { value, configurable: true }));
};

/** Takes the element's layout box away, as `display: none` does. */
const unlay = element => {
    element.getClientRects = () => [];
};

const read = (text, bindings = {}) => domql.query(text, bindings).evaluate();

/** The name of a test's module, its member's name with a capital. */
const moduleNameOf = name => `${name[0].toUpperCase()}${name.slice(1)}`;

/** A module, named for its member, whose one extension adds the members given to DOMQL's elements, and the module's other contents. */
const elementModule = (name, members, contents = {}) => nexo.createModule(moduleNameOf(name), {
    ...contents,
    types: [...(contents.types ?? []), { name: `${moduleNameOf(name)}Elements`, kind: 'extension', target: 'Domql.Element', members }],
});

/** A module of one number property of elements named for itself, answered by the function, and declared without an implementation where none is given; a query imports it and reads the property with `:`. */
const propertyModule = (name, impl) => elementModule(name, [{ name, kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, ...(impl === undefined ? {} : { impl }) }]);

/** Creates the evaluator of a query against the registry, binding its values there, with DOMQL's module supplied as its import. */
const evaluatorWith = (registry, text, bindings = {}) => {
    const values = registry.createBindings(bindings);
    const resolved = registry.resolve(text, values, { imports: ['Domql'] });

    return new QueryEvaluator(registry, resolved.createEvaluator(values, { window, document }));
};

/** Reads a query against a registry of its own holding Nexo's module, DOMQL's with its implementations, and the module, or the modules. */
const readWith = (modules, text, bindings) => evaluatorWith(nexo.createRegistry([BrowserModule.create(), ...[modules].flat()]), text, bindings).evaluateOnce();

/** Two modules, each a Boolean member named for itself that answers what its name says and counts how often it is read. */
const probes = () => {
    const record = { yes: 0, no: 0 };
    const probe = (name, answer) => elementModule(name, [{ name, kind: 'property', result: 'Boolean', updates: { changes: 'constant', reads: 'fresh' }, impl: () => { record[name]++; return answer; } }]);

    return { module: [probe('yes', true), probe('no', false)], record };
};

const failureWith = (module, text, bindings) => {
    try {
        readWith(module, text, bindings);
    } catch (error) {
        expect(error).toBeInstanceOf(NexoError);
        expect(error.kind).toBe('evaluation');

        return error;
    }

    throw new Error('The query was read');
};

const failure = (text, bindings = {}) => {
    try {
        read(text, bindings);
    } catch (error) {
        expect(error).toBeInstanceOf(NexoError);
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
            expect(read('panel.children.count', { panel })).toBe(3);
            expect(read('panel.all("[data-key]").count', { panel })).toBe(3);
            expect(read('panel.first("[aria-selected=true]")?.attribute["data-key"]', { panel })).toBe('a2');
            expect(read('item.closest("#panel")?.attribute["id"]', { item: items[0] })).toBe('panel');
        });

        it('answers an empty list where nothing matches and null where an element is expected', () => {
            expect(read('panel.all(".none").count', { panel })).toBe(0);
            expect(read('panel.first(".none")?.attribute["id"]', { panel })).toBeNull();
            expect(read('panel.closest(".none") { id = it.attribute["id"] }', { panel })).toBeNull();
        });

        it('reads list items by position', () => {
            expect(read('panel.children.first { key = it.attribute["data-key"] }', { panel })).toEqual({ key: 'a1' });
            expect(read('panel.children.last { key = it.attribute["data-key"] }', { panel })).toEqual({ key: 'a3' });
            expect(read('panel.children[1] { key = it.attribute["data-key"] }', { panel })).toEqual({ key: 'a2' });
            expect(read('panel.children[3] { key = it.attribute["data-key"] }', { panel })).toBeNull();
            expect(read('panel.children[-1] { key = it.attribute["data-key"] }', { panel })).toBeNull();
        });

        it('reads the parent', () => {
            expect(read('(item.parent as Element) { id = it.attribute["id"] }', { item: items[0] })).toEqual({ id: 'panel' });
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

            expect(read('(inner.parent as ShadowRoot)?.host?.attribute["id"]', { inner })).toBe('host');
            expect(read('inner.root.host?.attribute["id"]', { inner })).toBe('host');
            expect(read('inner.root.children.count', { inner })).toBe(1);
            expect(read('(host.root as Document)?.children.count', { host })).toBe(1);
            expect(read('host.root.host?.attribute["id"]', { host })).toBeNull();
            expect(read('~root.parent?.children.count', { root })).toBeNull();
            expect(read('~root.all("p").count', { root })).toBe(1);
            expect(read('~root.first("#inner")?.attribute["id"]', { root })).toBe('inner');
        });

        it('casts a node to its kind, failing for one of another kind, which an attempted cast answers null for', () => {
            const { inner } = shadowHost();

            expect(() => read('(inner.parent as Element)?.attribute["id"]', { inner })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'NEXO5001', message: expect.stringContaining("The cast to Element rejected its value: it is a Node that isn't an Element") }));
            expect(read('(try inner.parent as Element)?.attribute["id"]', { inner })).toBeNull();
            expect(read('(item.parent as Element)?.attribute["id"]', { item: items[0] })).toBe('panel');
            expect(read('(item.root as Document)?.children.count', { item: items[0] })).toBe(1);
            expect(read('(try item.root as ShadowRoot)?.children.count', { item: items[0] })).toBeNull();
        });

        it('answers the topmost element of a detached tree as its root, which has no parent', () => {
            const detached = document.createElement('section');

            detached.id = 'top';
            detached.innerHTML = '<b></b>';

            expect(read('(b.root as Element)?.attribute["id"]', { b: detached.firstChild })).toBe('top');
            expect(read('top.parent?.children.count', { top: detached })).toBeNull();
        });
    });

    describe('null', () => {
        it('answers null from the first null an optional access meets on', () => {
            const detached = document.createElement('div');

            expect(read('(detached.parent as Element)?.size', { detached })).toBeNull();
            expect(read('detached.parent?.children.count', { detached })).toBeNull();
            expect(read('detached { parent = (it.parent as Element)?.size, tag = it.attribute["id"] }', { detached })).toEqual({ parent: null, tag: null });
        });

        it('skips the rest of an optional chain where a receiver is null, reading it where the receiver is present', () => {
            const reads = [];
            const registry = nexo.createRegistry([BrowserModule.create(), propertyModule('probe', ({ receiver }) => (reads.push(receiver), 1))]);
            const readProbe = item => evaluatorWith(registry, 'import Probe\n(item.parent as Element)?:probe', { item }).evaluateOnce();

            expect(readProbe(document.createElement('div'))).toBeNull();
            expect(reads).toEqual([]);
            expect(readProbe(items[0])).toBe(1);
            expect(reads).toEqual([panel]);
        });

        it('answers what an optional enclosed access reads, and null where a receiver in it is null', () => {
            expect(read('(?item.parent.children.count)', { item: items[0] })).toBe(items.length);
            expect(read('(?item.parent.children.count)', { item: document.createElement('div') })).toBeNull();
        });

        it('answers a coalescing operator\'s value where it is not null, and only otherwise evaluates its fallback', () => {
            const reads = [];
            const registry = nexo.createRegistry([BrowserModule.create(), propertyModule('probe', ({ receiver }) => (reads.push(receiver), 7))]);
            const readProbe = text => evaluatorWith(registry, `import Probe\n${text}`, { item: items[0] }).evaluateOnce();

            expect(readProbe('1 ?? item:probe')).toBe(1);
            expect(reads).toEqual([]);
            expect(readProbe('null ?? item:probe')).toBe(7);
            expect(reads).toEqual([items[0]]);
            expect(read('item.attribute["missing"] ?? "first" ?? "second"', { item: items[0] })).toBe('first');
        });

        it('answers null for an attribute the element does not have', () => {
            expect(read('panel.attribute["nothing"]', { panel })).toBeNull();
        });

        it('answers null for a null argument of a propagating parameter without calling the member', () => {
            expect(read('panel.attribute[name]', { panel, name: null })).toBeNull();
        });
    });

    describe('object expressions', () => {
        it('names each field as it is written, and keeps their order', () => {
            const answer = read('panel { count = it.children.count, id = it.attribute["id"], attached = it.attached, children = it.hasChildren }', { panel });

            expect(answer).toEqual({ count: 3, id: 'panel', attached: true, children: true });
            expect(Object.keys(answer)).toEqual(['count', 'id', 'attached', 'children']);
        });

        it('applies an object expression to each item of a list, in order', () => {
            expect(read('panel.children { key = it.attribute["data-key"], selected = it.matches("[aria-selected=true]") }', { panel })).toEqual([
                { key: 'a1', selected: false },
                { key: 'a2', selected: true },
                { key: 'a3', selected: false },
            ]);
        });

        it('reads a top-level list of facts', () => {
            expect(read('{ items = panel.children.count, kind = "list", none = null }', { panel })).toEqual({ items: 3, kind: 'list', none: null });
        });
    });

    describe('lists', () => {
        it('aggregates the numbers an expression produces', () => {
            expect(read('panel.children.max(it.rect?.height)', { panel })).toBe(64);
            expect(read('panel.children.min(it.rect?.height)', { panel })).toBe(48);
            expect(read('panel.children.sum(it.rect?.height)', { panel })).toBe(160);
        });

        it('answers the aggregates of an empty list', () => {
            expect(read('panel.all(".none").max(it.rect?.height)', { panel })).toBeNull();
            expect(read('panel.all(".none").min(it.rect?.height)', { panel })).toBeNull();
            expect(read('panel.all(".none").sum(it.rect?.height)', { panel })).toBe(0);
        });

        it('skips the items an expression produces null for', () => {
            const detached = [document.createElement('div'), document.createElement('div')];

            expect(read('els.max(it.rect?.height)', { els: detached })).toBeNull();
            expect(read('els.sum(it.rect?.height)', { els: detached })).toBe(0);
            expect(read('els.max(it.rect?.height)', { els: [items[0], ...detached] })).toBe(48);
        });

        it('keeps the items a Boolean expression holds for', () => {
            expect(read('panel.children.where(it.matches("[aria-selected=true]")).count', { panel })).toBe(1);
            expect(read('panel.children.where(it.hasChildren).count', { panel })).toBe(0);
            expect(read('els.where(it.overlaps({ other = panel })).count', { els: [items[0], document.createElement('div')], panel })).toBe(1);
        });
    });

    describe('computed property access', () => {
        it('reads what a name names, as a dot property access does', () => {
            expect(read('panel.["children"].count', { panel })).toBe(3);
            expect(read('panel.["size"]?.width', { panel })).toBe(640);
            expect(read('panel { size = it.["size"], clientSize = it.["clientSize"] }', { panel }).size).toEqual({ width: 640, height: 480 });
        });

        it('takes the name from a bound string, a local, a conditional and a coalescing operator', () => {
            expect(read('panel.[name]?.width', { panel, name: 'size' })).toBe(640);
            expect(read('panel { let name = if wide then "size" else "clientSize" end, width = it.[name]?.width }', { panel, wide: true })).toEqual({ width: 640 });
            expect(read('panel.[name ?? "size"]?.width', { panel, name: null })).toBe(640);
        });

        it('answers null where its receiver is null and it is optional', () => {
            const detached = document.createElement('div');

            expect(read('detached.[name]?.width', { detached, name: 'size' })).toBeNull();
            expect(read('(detached.parent as Element)?.[name]', { detached, name: 'size' })).toBeNull();
        });
    });

    describe('tests and conditions', () => {
        it('answers is and has', () => {
            document.body.insertAdjacentHTML('beforeend', '<button id="b" disabled></button><input id="i" readonly><textarea id="t"></textarea><div id="e" contenteditable="true"><span id="s"></span></div><div inert><div id="n" contenteditable="true"></div></div>');
            const element = id => document.getElementById(id);

            expect(read('b.disabled()', { b: element('b') })).toBe(true);
            expect(read('panel.disabled()', { panel })).toBe(false);
            expect(read('i.readonly()', { i: element('i') })).toBe(true);
            expect(read('i.textEditable()', { i: element('i') })).toBe(false);
            expect(read('t.textEditable()', { t: element('t') })).toBe(true);
            expect(read('s.textEditable()', { s: element('s') })).toBe(true);
            expect(read('n.textEditable()', { n: element('n') })).toBe(false);
            expect(read('panel.textEditable()', { panel })).toBe(false);
            expect(read('panel.hasChildren', { panel })).toBe(true);
            expect(read('item.hasChildren', { item: items[0] })).toBe(false);
        });

        it('answers whether an element is attached', () => {
            expect(read('panel.attached', { panel })).toBe(true);
            expect(read('detached.attached', { detached: document.createElement('div') })).toBe(false);
        });

        it('answers whether an element is focused', () => {
            const button = document.createElement('button');
            document.body.append(button);

            expect(read('button.focus()', { button })).toBe(false);

            button.focus();

            expect(read('button.focus()', { button })).toBe(true);
        });

        it('reads the document\'s focused element, null where its body has focus', () => {
            const button = document.createElement('button');

            button.id = 'button';
            document.body.append(button);
            button.blur();

            expect(read('Domql.document.activeElement == null')).toBe(true);

            button.focus();

            expect(read('Domql.document.activeElement?["id"]')).toBe('button');
        });

        it('answers whether an element is focusable, by its kind, its tabindex and its state', () => {
            document.body.innerHTML = '<button id="b"></button><button id="off" disabled></button><div id="d"></div><div id="t" tabindex="-1"></div><a id="a"></a><a id="h" href="#"></a><input id="i" type="hidden">';

            const focusable = id => read('e.focusable()', { e: document.getElementById(id) });

            expect(['b', 'off', 'd', 't', 'a', 'h', 'i'].map(focusable)).toEqual([true, false, false, true, false, true, false]);
            expect(read('e.focusable()', { e: document.createElement('button') })).toBe(false);
        });

        it('answers the document\'s conditions', () => {
            expect(read('Domql.document.visible()')).toBeTypeOf('boolean');
            expect(read('Domql.document.focus()')).toBeTypeOf('boolean');
        });

        it('gives a member the document and the window it is read in where an argument names a root', () => {
            const module = elementModule('inside', [{ name: 'inside', kind: 'function', arguments: 'positional', parameters: [{ name: 'of', kind: 'value', type: 'Domql.Document', required: true, nulls: 'propagate' }], result: 'Boolean', updates: { changes: 'unobserved', reads: 'fresh' }, impl: ({ receiver: element, args: { of } }) => element.ownerDocument === of && of === document }]);
            const panel = document.body.appendChild(document.createElement('div'));

            expect(readWith(module, 'import Inside\npanel:inside(Domql.document)', { panel })).toBe(true);
        });

        it('answers a selection of a text control', () => {
            const input = document.createElement('input');
            input.value = 'hello';
            document.body.append(input);
            input.setSelectionRange(1, 3);

            expect(read('input.selection { start = it.start, finish = it.end }', { input })).toEqual({ start: 1, finish: 3 });
            expect(read('input.hasSelection', { input })).toBe(true);

            input.setSelectionRange(2, 2);

            expect(read('input.hasSelection', { input })).toBe(false);
            expect(read('panel.selection { start = it.start }', { panel })).toBeNull();
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

            expect(read('left and right', bindings)).toBe(and);
            expect(read('left or right', bindings)).toBe(or);
        });

        it('negate a Boolean with not, as many times as it is written', () => {
            expect(read('not on', { on: true })).toBe(false);
            expect(read('not on', { on: false })).toBe(true);
            expect(read('not not on', { on: true })).toBe(true);
            expect(read('not (on ?? true)', { on: null })).toBe(false);
        });

        it('read no operand once the result is decided', () => {
            const { module, record } = probes();

            expect(readWith(module, 'import No\nimport Yes\npanel:no and panel:yes', { panel })).toBe(false);
            expect(record).toEqual({ yes: 0, no: 1 });
            expect(readWith(module, 'import No\nimport Yes\npanel:yes or panel:no', { panel })).toBe(true);
            expect(record).toEqual({ yes: 1, no: 1 });
            expect(readWith(module, 'import Yes\n(nothing ?? false) or panel:yes', { panel, nothing: null })).toBe(true);
            expect(record).toEqual({ yes: 2, no: 1 });
        });

        it('answer null for a test an optional access reads of null', () => {
            expect(read('panel.first(".none")?.attached', { panel })).toBeNull();
        });

        it('test the implicit parameter inside an object expression and an expression argument', () => {
            expect(read('panel { attached = it.attached, empty = it.hasChildren }', { panel })).toEqual({ attached: true, empty: true });
            expect(read('panel.children.where(it.attached and it.focus()).count', { panel })).toBe(0);
        });

        it('read a test by reference, and a member by the name the bindings hold', () => {
            // A reference to a module's function takes its receiver first; Domql.focus alone names Element's and Document's, so it would be ambiguous.
            expect(read('let isFocused = Domql.focusWithin\nreturn isFocused(panel) or panel.[other]', { panel, other: 'attached' })).toBe(true);
        });

        it('answer whether a subject is null with is null, never null itself', () => {
            expect(read('panel.first(".none") == null', { panel })).toBe(true);
            expect(read('panel.parent == null', { panel })).toBe(false);
            expect(read('null == null')).toBe(true);
        });
    });

    describe('equalities', () => {
        it('compare strings by code unit, numbers numerically, Booleans by value and nodes by identity', () => {
            expect(read('a == "x"', { a: 'x' })).toBe(true);
            expect(read('a == "X"', { a: 'x' })).toBe(false);
            expect(read('a == 0', { a: -0 })).toBe(true);
            expect(read('a == false', { a: false })).toBe(true);
            expect(read('a == b', { a: items[0], b: items[0] })).toBe(true);
            expect(read('a != b', { a: items[0], b: items[1] })).toBe(true);
            expect(read('(item.parent as Element) == panel', { item: items[0], panel })).toBe(true);
        });

        it('equal null to null alone, whatever the other value\'s type', () => {
            expect(read('a == null', { a: null })).toBe(true);
            expect(read('panel.first(".none") == null', { panel })).toBe(true);
            expect(read('a != null', { a: 0 })).toBe(true);
            expect(read('a == ""', { a: null })).toBe(false);
        });

        it.each([true, false, null])('compare and negate a nullable Boolean %s as the table of nullable Booleans states', x => {
            expect(read('x == true', { x })).toBe(read('x ?? false', { x }));
            expect(read('x == false', { x })).toBe(read('not (x ?? true)', { x }));
            expect(read('x != true', { x })).toBe(read('not (x ?? false)', { x }));
            expect(read('x != false', { x })).toBe(read('x ?? true', { x }));
        });
    });

    describe('conditionals', () => {
        it.each([
            [true, 'consequent'],
            [false, 'alternative'],
        ])('select by a condition of %s the %s', (condition, branch) => {
            expect(read('if condition then "consequent" else "alternative" end', { condition: condition })).toBe(branch);
        });

        it('move to the next clause where a condition is false, and to the alternative where none is true', () => {
            const bindings = (a, b) => ({ a: a, b: b });

            expect(read('if a then 1 elseif b then 2 else 3 end', bindings(false, true))).toBe(2);
            expect(read('if a then 1 elseif b then 2 else 3 end', bindings(false, false))).toBe(3);
            expect(read('if a then 1 elseif b then 2 else 3 end', bindings(true, true))).toBe(1);
            expect(read('if a ?? false then 1 elseif b then 2 else 3 end', bindings(null, true))).toBe(2);
        });

        it('evaluate only the branch the condition selects', () => {
            const { module, record } = probes();

            expect(readWith(module, 'import No\nimport Yes\nif panel:yes then panel:yes else panel:no end', { panel })).toBe(true);
            expect(record).toEqual({ yes: 2, no: 0 });
        });

        it('keep the value of the selected branch, false and null included', () => {
            expect(read('if on then false else true end', { on: true })).toBe(false);
            expect(read('if on then null else 1 end', { on: true })).toBeNull();
        });

        it('give a local the element the condition selects, which a chain continues from', () => {
            expect(read('let target = if first then panel else other end\nreturn target.attribute["id"]', { first: false, panel, other: items[0] })).toBe(items[0].getAttribute('id'));
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
            const result = readWith(module, 'import Counted\nrows { let n = it:counted, a = n, b = n }', { rows: items });

            expect(record.reads).toBe(3);
            expect(result).toEqual([{ a: 1, b: 1 }, { a: 2, b: 2 }, { a: 3, b: 3 }]);
        });

        it('evaluate a local no evaluated expression uses never', () => {
            const { module, record } = counting();

            expect(readWith(module, 'import Counted\npanel { let n = it:counted, a = 1 }', { panel })).toEqual({ a: 1 });
            expect(readWith(module, 'import Counted\npanel { let n = it:counted, a = if on then n else 0 end }', { panel, on: false })).toEqual({ a: 0 });
            expect(record.reads).toBe(0);
        });

        it('evaluate a local at its first use, wherever that is', () => {
            const { module, record } = counting();

            expect(readWith(module, 'import Counted\npanel { let n = it:counted, a = if on then n else 0 end, b = n }', { panel, on: false })).toEqual({ a: 0, b: 1 });
            expect(record.reads).toBe(1);
        });

        it('give a later evaluation fresh locals', () => {
            const { module } = counting();

            expect(readWith(module, 'import Counted\npanel { let n = it:counted, a = n }', { panel })).toEqual({ a: 1 });
            expect(readWith(module, 'import Counted\npanel { let n = it:counted, a = n }', { panel })).toEqual({ a: 2 });
        });

        it('keep the context of where a local is written, used inside a nested projection', () => {
            const result = read('panel { let owner = it.attribute["id"], rows = it.children { owner = owner, key = it.attribute["data-key"] } }', { panel });

            expect(result.rows).toEqual([{ owner: 'panel', key: 'a1' }, { owner: 'panel', key: 'a2' }, { owner: 'panel', key: 'a3' }]);
        });

        it('give a local to the expression an argument evaluates for each item', () => {
            expect(read('panel { let selector = "[aria-selected=true]", selected = it.children.where(it.matches(selector)) { key = it.attribute["data-key"] } }', { panel }))
                .toEqual({ selected: [{ key: 'a2' }] });
        });

        it('use the locals before it, and those of an enclosing object expression', () => {
            expect(read('panel { let rows = it.children, let first = rows[0], key = first?.attribute["data-key"], inner = it { last = rows[2]?.attribute["data-key"] } }', { panel }))
                .toEqual({ key: 'a1', inner: { last: 'a3' } });
        });

        it('stand where a computed property access\'s name is, with the names they can give', () => {
            expect(read('panel { let name = "size", width = it.[name]?.width }', { panel })).toEqual({ width: 640 });
            expect(read('panel { let name = chosen, let selected = name, width = it.[selected]?.width }', { panel, chosen: 'size' })).toEqual({ width: 640 });
        });
    });

    describe('geometry', () => {
        it('reads a rectangle from the layout viewport and relative to another element', () => {
            expect(read('item.rect', { item: items[1] })).toEqual({ left: 0, top: 50, right: 640, bottom: 114, width: 640, height: 64 });
            expect(read('item.rectRelativeTo(panel)', { item: items[1], panel })).toEqual({ left: 0, top: 50, right: 640, bottom: 114, width: 640, height: 64 });
            expect(read('item.rect?.height', { item: items[1] })).toBe(64);
        });

        it('answers null for an element without layout', () => {
            const detached = document.createElement('div');

            expect(read('detached.rect', { detached })).toBeNull();
            expect(read('item.rectRelativeTo(detached)', { item: items[0], detached })).toBeNull();
            expect(read('item.rectRelativeTo(none)', { item: items[0], none: null })).toBeNull();
        });

        it('answers null for an attached element without a layout box and the actual zero of one with a box of no size', () => {
            const hidden = document.createElement('div');
            document.body.append(hidden);
            lay(hidden, {});

            expect(read('hidden.size', { hidden })).toEqual({ width: 0, height: 0 });
            expect(read('hidden.rect?.width', { hidden })).toBe(0);

            unlay(hidden);

            expect(read('hidden.size', { hidden })).toBeNull();
            expect(read('hidden.rect', { hidden })).toBeNull();
            expect(read('hidden.clientSize', { hidden })).toBeNull();
            expect(read('hidden.grid?.columns', { hidden })).toBeNull();
            expect(read('hidden.attached', { hidden })).toBe(true);
            expect(read('item.rectRelativeTo(hidden)', { item: items[0], hidden })).toBeNull();
            expect(read('hidden.overlaps({ other = item })', { hidden, item: items[0] })).toBeNull();
        });

        it('compares two boxes', () => {
            expect(read('a.overlaps({ other = b })', { a: items[0], b: items[1] })).toBe(false);
            expect(read('a.overlaps({ other = b, margin = 10 })', { a: items[0], b: items[1] })).toBe(true);
            expect(read('a.overlaps({ other = b })', { a: items[0], b: items[0] })).toBe(true);
        });
    });

    describe('values and text', () => {
        it('reads the value of a control the user edits, and null for any other element', () => {
            document.body.innerHTML = '<input id="field" value="typed"><textarea id="area">written</textarea><select id="list"><option>a</option><option selected>b</option></select><div id="plain"></div>';

            const value = id => read('e.value', { e: document.getElementById(id) });

            expect(['field', 'area', 'list', 'plain'].map(value)).toEqual(['typed', 'written', 'b', null]);
        });

        it('reads an element\'s text, its markup, its name, its classes and an inline style property as it is declared', () => {
            document.body.innerHTML = '<p id="p" class="lead  wide lead" style="margin-top: 2em; --tier: low">Hello <b>world</b></p>';

            const p = document.getElementById('p');

            expect(read('p { text = it.text, html = it.html, name = it.localName, classes = it.classes, margin = it.inlineStyle["margin-top"], tier = it.inlineStyle["--tier"], none = it.inlineStyle["color"] }', { p })).toEqual({
                text: 'Hello world', html: 'Hello <b>world</b>', name: 'p', classes: ['lead', 'wide'], margin: '2em', tier: 'low', none: null,
            });
        });

        it('reads the playback of a media element, its unknown duration null, and null for any other element', () => {
            const video = document.createElement('video');

            video.muted = true;

            expect(read('{ video = video.playback, plain = plain.playback }', { video, plain: panel })).toEqual({
                video: { paused: true, muted: true, ended: false, currentTime: 0, duration: null, volume: 1 }, plain: null,
            });
        });

        it('answers whether a field is autofilled, which nothing has filled', () => {
            document.body.innerHTML = '<input id="field">';

            expect(read('e.autofilled()', { e: document.getElementById('field') })).toBe(false);
        });
    });

    describe('size limits and files', () => {
        it('reads the limits of a box\'s size in pixels, each null where it is no length in pixels, and none for a detached element', () => {
            panel.style.cssText = 'min-width: 120px; min-height: 2.5px; max-width: 50%; max-height: none';

            expect(read('panel.sizeLimits', { panel })).toEqual({ minWidth: 120, minHeight: 2.5, maxWidth: null, maxHeight: null });
            expect(read('detached.sizeLimits', { detached: document.createElement('div') })).toBeNull();
        });

        it('reads the files a file input holds, none for one that holds none, and null for any other element', () => {
            const picker = document.createElement('input');
            const field = document.createElement('input');

            picker.type = 'file';

            expect(read('{ picker = picker.files, field = field.files, panel = panel.files }', { picker, field, panel })).toEqual({ picker: [], field: null, panel: null });
        });
    });

    describe('siblings and containment', () => {
        it('reads an element\'s siblings and its place among them, and null for each where it has no parent', () => {
            const detached = document.createElement('div');

            expect(read('item { previous = it.previousSibling?["data-key"], next = it.nextSibling?["data-key"], index = it.index }', { item: items[1] })).toEqual({ previous: 'a1', next: 'a3', index: 1 });
            expect(read('item { previous = it.previousSibling?["data-key"], index = it.index }', { item: items[0] })).toEqual({ previous: null, index: 0 });
            expect(read('detached { previous = it.previousSibling == null, next = it.nextSibling == null, index = it.index }', { detached })).toEqual({ previous: true, next: true, index: null });
            expect(read('Domql.document.first("html")?.index')).toBe(0);
        });

        it('answers whether a node holds another, itself included, within its own tree, and null for a null other', () => {
            const host = document.createElement('div');
            const shadowRoot = host.attachShadow({ mode: 'open' });

            shadowRoot.innerHTML = '<p></p>';
            panel.append(host);

            expect(read('{ child = panel.contains(item), itself = panel.contains(panel), parent = item.contains(panel), shadowed = panel.contains(shadowed), none = panel.contains(none) }', { panel, item: items[2], shadowed: shadowRoot.firstElementChild, none: null })).toEqual({
                child: true, itself: true, parent: false, shadowed: false, none: null,
            });
            expect(read('Domql.document.contains(panel)', { panel })).toBe(true);
        });

        it('answers whether an element holds the capture of a pointer', () => {
            items[0].hasPointerCapture = pointerId => pointerId === 7;

            expect(read('{ held = item.hasPointerCapture(7), other = item.hasPointerCapture(1) }', { item: items[0] })).toEqual({ held: true, other: false });
        });
    });

    describe('the window\'s location and platform', () => {
        /** A window of its own, its navigator the one given. */
        const windowWith = navigator => ({ document, navigator, location: window.location, get window() { return this; } });

        it('reads the parts of the window\'s URL a page navigates by', () => {
            const { href, pathname, search, hash } = window.location;

            expect(read('Domql.window.location')).toEqual({ href, pathname, search, hash });
        });

        it('names the primary shortcut modifier, Meta on Apple platforms and Control elsewhere, from the platform the user agent names, or the one navigator.platform does where it names none', () => {
            const modifierOf = navigator => domql.query('Domql.window.shortcutModifier').evaluate({ window: windowWith(navigator) });

            expect(modifierOf({ userAgentData: { platform: 'macOS' }, platform: 'MacIntel' })).toBe('Meta');
            expect(modifierOf({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe('Control');
            expect(modifierOf({ userAgentData: { platform: 'Linux' } })).toBe('Control');
            expect(modifierOf({ platform: 'MacIntel' })).toBe('Meta');
            expect(modifierOf({ platform: 'iPhone' })).toBe('Meta');
            expect(modifierOf({ platform: 'Win32' })).toBe('Control');
            expect(modifierOf({})).toBe('Control');
        });
    });

    describe('the document selection', () => {
        beforeEach(() => {
            document.body.innerHTML = '<div id="editor"><p id="p">hello <b id="b">world</b> again</p><a id="link" href="#">link</a></div>';
        });

        const byId = id => document.getElementById(id);

        it('reads the selection as it stands, the elements its anchor and focus are in, and its first range', () => {
            document.getSelection().setBaseAndExtent(byId('b').firstChild, 1, byId('link').firstChild, 2);

            expect(read('Domql.document.selection { type = it.type, collapsed = it.collapsed, count = it.rangeCount, anchor = it.anchorElement?["id"], focus = it.focusElement?["id"] }')).toEqual({
                type: 'Range', collapsed: false, count: 1, anchor: 'b', focus: 'link',
            });
            expect(read('Domql.document.selection?.range { text = it.text, collapsed = it.collapsed, start = it.startElement?["id"], end = it.endElement?["id"], common = it.commonAncestor?["id"] }')).toEqual({
                text: 'orld againli', collapsed: false, start: 'b', end: 'link', common: 'editor',
            });
        });

        it('reads the elements a range touches, its offsets in an element\'s text, and whether it intersects a node', () => {
            document.getSelection().setBaseAndExtent(byId('b').firstChild, 1, byId('link').firstChild, 2);

            expect(read('Domql.document.selection?.range { touched = it.all("div, b, a") { id = it["id"] }, inEditor = it.offsetsIn(editor), inParagraph = it.offsetsIn(p), crosses = it.intersects(p) }', { editor: byId('editor'), p: byId('p') })).toEqual({
                touched: [{ id: 'editor' }, { id: 'b' }, { id: 'link' }], inEditor: { start: 7, end: 19 }, inParagraph: null, crosses: true,
            });
        });

        it('answers no range for a selection that holds none, and reads a range bound as a value', () => {
            document.getSelection().removeAllRanges();

            expect(read('Domql.document.selection { type = it.type, collapsed = it.collapsed, hasRange = it.range != null }')).toEqual({ type: 'None', collapsed: true, hasRange: false });

            const range = document.createRange();

            range.selectNodeContents(byId('b'));

            expect(read('range { text = it.text, start = it.startElement?["id"] }', { range })).toEqual({ text: 'world', start: 'b' });
        });
    });

    describe('scrolling', () => {
        it('reads how far an element is scrolled along each axis of its writing mode, its offset without the sign RTL gives it', () => {
            scrollTo(panel, { scrollLeft: -30, scrollTop: 12.5, scrollWidth: 900, scrollHeight: 1200, clientWidth: 640, clientHeight: 480 });

            expect(read('panel.scroll', { panel })).toEqual({ inline: { offset: 30, extent: 900, viewport: 640 }, block: { offset: 12.5, extent: 1200, viewport: 480 } });
            expect(read('panel.scroll { room = it.inline.extent - it.inline.viewport }', { panel })).toEqual({ room: 260 });

            panel.style.writingMode = 'vertical-rl';

            expect(read('panel.scroll', { panel })).toEqual({ inline: { offset: 12.5, extent: 1200, viewport: 480 }, block: { offset: 30, extent: 900, viewport: 640 } });
        });

        it('answers null for an element without a layout box', () => {
            const detached = document.createElement('div');

            unlay(items[0]);

            expect(read('detached.scroll', { detached })).toBeNull();
            expect(read('item.scroll', { item: items[0] })).toBeNull();
            expect(read('detached.clientRect', { detached })).toBeNull();
            expect(read('item.clientRect', { item: items[0] })).toBeNull();
        });

        it('reads the window\'s scroll, its viewport the window\'s size', () => {
            const scroll = read('Domql.window.scroll');

            expect(scroll.inline).toEqual({ offset: 0, extent: document.documentElement.scrollWidth, viewport: read('Domql.window.size.width') });
            expect(scroll.block.viewport).toBe(read('Domql.window.size.height'));
        });

        it('reads the padding box without scrollbars, moved in by the borders from the border box', () => {
            lay(panel, { left: 10, top: 20, width: 660, height: 500 });
            scrollTo(panel, { clientWidth: 640, clientHeight: 480, clientLeft: 4, clientTop: 2 });

            expect(read('panel.clientRect', { panel })).toEqual({ left: 14, top: 22, right: 654, bottom: 502, width: 640, height: 480 });
        });

        it('finds the nearest ancestor the user can scroll, along an axis or either, and none above the root element', () => {
            document.body.innerHTML = `
                <div id="outer" style="overflow-x: scroll">
                    <div id="clipped" style="overflow-y: hidden">
                        <div id="middle" style="overflow-y: auto"><span id="inner"></span></div>
                    </div>
                </div>`;

            const named = text => read(`${text}?["id"]`, { inner: document.getElementById('inner'), middle: document.getElementById('middle'), outer: document.getElementById('outer') });

            expect(named('inner.scrollContainer()')).toBe('middle');
            expect(named('inner.scrollContainer({ axis = "block" })')).toBe('middle');
            expect(named('inner.scrollContainer({ axis = "inline" })')).toBe('outer');
            expect(named('inner.scrollContainer({ axis = null })')).toBe('middle');
            expect(named('middle.scrollContainer()')).toBe('outer');
            expect(named('outer.scrollContainer()')).toBeNull();
            expect(read('Domql.document.first("html")?.scrollContainer() == null')).toBe(true);
        });

        it('refuses an axis it does not name, where the call stands', () => {
            const error = failure('{ container = panel.scrollContainer({ axis = "x" })?["id"] }', { panel });

            expect(error).toMatchObject({ code: 'NEXO5007', location: { pointer: '/expression/objectFields/0/value/chain/receiver', line: 1, column: 15 } });
            expect(error.message).toContain('"x" is no axis');
        });
    });

    describe('the window', () => {
        it('reads the window and its media queries', () => {
            expect(read('Domql.window.size.width')).toBeTypeOf('number');
            expect(read('Domql.window.devicePixelRatio')).toBeTypeOf('number');
            expect(read('Domql.window.media["(min-width: 0px)"]')).toBe(true);
            expect(read('Domql.window { share = it.share() }').share).toBeTypeOf('boolean');
        });

        it('reads the window it is given', () => {
            const query = domql.query('Domql.window.devicePixelRatio');

            expect(query.evaluate({ window: { document, devicePixelRatio: 3, get window() { return this; } } })).toBe(3);
        });
    });

    describe('computed style', () => {
        it('reads a custom property and answers null for one that is not set', () => {
            panel.style.setProperty('--tier', 'medium');

            expect(read('panel.style["--tier"]', { panel })).toBe('medium');
            expect(read('panel.style["--none"]', { panel })).toBeNull();
        });
    });

    describe('answers', () => {
        it('are the same for a parsed query and one created from its definition', () => {
            const parsed = domql.query('panel { count = it.children.count, keys = it.children { key = it.attribute["data-key"] } }', { panel });
            const created = domql.query(parsed.definition, { panel });

            expect(created.evaluate()).toEqual(parsed.evaluate());
        });

        it('are immutable data that shares nothing with the bindings', () => {
            const numbers = [1, 2, 3];
            const answer = read('numbers', { numbers });

            expect(answer).toEqual(numbers);
            expect(answer).not.toBe(numbers);
            expect(Object.isFrozen(answer)).toBe(true);
            expect(Object.isFrozen(read('panel { size = it.size }', { panel }))).toBe(true);
        });

        it('read a field of a bound object', () => {
            expect(read('box.width', { box: { width: 5, height: 6 } })).toBe(5);
            expect(read('box { width = it.width, other = it.height }', { box: { width: 5, height: 6 } })).toEqual({ width: 5, other: 6 });
        });
    });

    describe('errors', () => {
        it('fail where a member fails, naming it and where', () => {
            const error = failure('panel.matches("[")', { panel });

            expect(error.code).toBe('NEXO5007');
            expect(error.message).toContain("The member 'matches' failed");
            expect(error.location.line).toBe(1);
            expect(error.cause).toBeInstanceOf(Error);
        });

        it('fail where a member throws what is no error, keeping it as the cause', () => {
            const error = failureWith(propertyModule('nothing', () => {
                throw null;
            }), 'import Nothing\npanel:nothing', { panel });

            expect(error.code).toBe('NEXO5007');
            expect(error.message).toContain("The member 'nothing' failed: null");
            expect(error.cause).toBeNull();
        });

        it('refuse a member maintained by an observation', () => {
            expect(failure('item.intersects()', { item: items[0] })).toMatchObject({ code: 'NEXO5011', message: expect.stringContaining("The member 'intersects' is maintained by an observation") });
        });

        it('refuse a request that is not valid before reading anything', () => {
            expect(() => read('panel.nonsense', { panel })).toThrow(expect.objectContaining({ kind: 'validation', code: 'NEXO3001' }));
        });

        it('report a module that answers a type other than the one it declares', () => {
            const error = failureWith(propertyModule('broken', () => 'seven'), 'import Broken\npanel:broken', { panel });

            expect(error.code).toBe('NEXO5006');
            expect(error.message).toContain('answered "seven", and it declares Number');
        });

        it('report a module that answers a list with a hole, which holds no value there', () => {
            const gappy = elementModule('gappy', [{ name: 'gappy', kind: 'property', result: 'List<Number?>', updates: { changes: 'constant', reads: 'fresh' }, impl: () => [1, , 2] }]);

            expect(failureWith(gappy, 'import Gappy\npanel:gappy', { panel })).toMatchObject({ code: 'NEXO5006', message: expect.stringContaining('answered a list with a hole at index 1, and it declares List<Number?>') });
        });

        it('name an element a module answers where a number is declared', () => {
            expect(failureWith(propertyModule('leaking', ({ receiver }) => receiver), 'import Leaking\npanel:leaking', { panel })).toMatchObject({ code: 'NEXO5006', message: expect.stringContaining('answered an instance of HTMLDivElement, and it declares Number') });
        });

        it('report a module that declares and does not implement', () => {
            expect(() => readWith(propertyModule('declared'), 'import Declared\npanel:declared', { panel })).toThrow(expect.objectContaining({
                kind: 'module',
                code: 'NEXO4001',
                message: expect.stringContaining("'Element.declared' has no implementation"),
                location: { module: 'Declared', type: 'DeclaredElements', declaration: 'declared', declarationKey: 'impl' },
            }));
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
        const registry = nexo.createRegistry([BrowserModule.create(), ...modules]);
        const evaluator = evaluatorWith(registry, text, bindings);

        observations = new Observations(registry, { window, document });

        const evaluation = evaluator.evaluate({ observations, onChange: () => changes++, holdsAllObservations, recordsDependencies });

        evaluations.push(evaluation);

        return evaluation;
    };

    const membersOf = evaluation => evaluation.dependencies.map(dependency => dependency.member);

    describe('metadata', () => {
        /** Evaluates the query again each time it is called, with one evaluator, as a watch does, so its values' origins compare across the evaluations. */
        const watching = (text, bindings = {}) => {
            const registry = nexo.createRegistry([BrowserModule.create()]);
            const evaluator = evaluatorWith(registry, text, bindings);

            observations = new Observations(registry, { window, document });

            return () => {
                const evaluation = evaluator.evaluate({ observations, onChange: () => changes++ });

                evaluations.push(evaluation);

                return evaluation;
            };
        };

        it('gives a value the origin of the branch its conditional selected, the same each evaluation and another for the other branch', () => {
            const next = watching('panel { pick = if (panel.attribute["data-on"]) == null then 1 else 2 end }', { panel });
            const off = next().metadata.objectFields.pick.origin;

            expect(next().metadata.objectFields.pick.origin).toBe(off);

            panel.setAttribute('data-on', '');

            expect(next().metadata.objectFields.pick.origin).not.toBe(off);
        });

        it('gives a value the origin of the operand an and or an or gave', () => {
            const next = watching('panel.attribute["data-a"] or panel.attribute["id"]', { panel });
            const fromId = next().metadata.origin;

            panel.setAttribute('data-a', 'x');

            expect(next().metadata.origin).not.toBe(fromId);
        });

        it('describes each item of a projection by the branch it selected', () => {
            rows[1].setAttribute('data-on', '');

            const { metadata } = watching('panel.children { pick = if (it.attribute["data-on"]) == null then 2 else 1 end }', { panel })();

            expect(metadata.sources).toEqual(rows.map(row => ({ kind: 'reference', value: row })));
            expect(metadata.items[0].objectFields.pick.origin).toBe(metadata.items[2].objectFields.pick.origin);
            expect(metadata.items[1].objectFields.pick.origin).not.toBe(metadata.items[0].objectFields.pick.origin);
        });

        it('gives every place a local is used the origin of the expression it holds', () => {
            const { objectFields } = watching('panel { let w = if (panel.attribute["data-on"]) == null then panel.size?.width else 0 end, a = w, b = w }', { panel })().metadata;

            expect(objectFields.a.origin).toBe(objectFields.b.origin);
        });
    });

    describe('dependencies', () => {
        it('are each member applied to its receiver and arguments, with the observations that cover it', () => {
            const evaluation = evaluate('panel.attribute["id"]', { panel });

            expect(evaluation.value).toBe('panel');
            expect(evaluation.dependencies).toEqual([{
                member: 'attribute',
                pointer: '/expression',
                observations: [{ type: 'mutation', target: panel, arguments: { attributes: ['id'] } }],
            }]);
        });

        it('follow the document: the members read for each item the selector matched', () => {
            const evaluation = evaluate('panel.all("i").max(it.rect?.height)', { panel });
            const measured = evaluation.dependencies.filter(dependency => dependency.member === 'rect');

            expect(membersOf(evaluation).slice(0, 2)).toEqual(['all', 'max']);
            expect(measured.map(dependency => dependency.observations[0].target)).toEqual(rows);
            expect(measured.every(dependency => dependency.observations[0].type === 'resize')).toBe(true);
        });

        it('stand where each member is written, inside the items of a list and the operands of an or', () => {
            const evaluation = evaluate('panel.all("i") { h = it.rect?.height, on = it.attached or it.focus() }', { panel });

            expect(evaluation.dependencies.map(dependency => [dependency.member, dependency.pointer])).toEqual([
                ['all', '/expression/context'],
                ...rows.flatMap(() => [['rect', '/expression/objectFields/0/value/chain/receiver'], ['attached', '/expression/objectFields/1/value/operands/0']]),
            ]);
        });

        it('stand where each operand of an equality is written, both evaluated', () => {
            expect(membersOf(evaluate('panel.attribute["id"] == panel.first("i")?.attribute["id"]', { panel }))).toEqual(['attribute', 'first', 'attribute']);
            // An unnamed indexer has no name, which its dependency says as null.
            expect(membersOf(evaluate('panel["id"] == panel.aria["label"]', { panel }))).toEqual([null, 'aria', null]);
        });

        it('stop where an optional chain meets null, and reach as far as its receivers are present', () => {
            expect(membersOf(evaluate('(item.parent as Element)?.size', { item: document.createElement('i') }))).toEqual(['parent']);
            expect(membersOf(evaluate('(item.parent as Element)?.size', { item: rows[0] }))).toEqual(['parent', 'size']);
        });

        it('include those of an argument that is a value of its own', () => {
            const evaluation = evaluate('row.overlaps({ other = panel.parent as Element })', { row: rows[0], panel });
            const overlaps = evaluation.dependencies.find(dependency => dependency.member === 'overlaps');

            expect(membersOf(evaluation)).toContain('parent');
            expect(overlaps.observations.some(observation => observation.type === 'resize' && observation.target === panel.parentElement)).toBe(true);
        });

        it('include what a chain read before it met null, and nothing after', () => {
            const evaluation = evaluate('panel.closest(".none")?.attribute["id"]', { panel });

            expect(evaluation.value).toBeNull();
            expect(membersOf(evaluation)).toEqual(['closest']);
            expect(evaluation.dependencies[0].observations.length).toBeGreaterThan(0);
        });

        it('include the attachment of an element that answered null because it is detached', () => {
            const detached = document.createElement('div');
            const evaluation = evaluate('element.rect', { element: detached });
            const attachments = evaluation.dependencies.flatMap(dependency => dependency.observations).filter(observation => observation.type === 'attachment');

            expect(evaluation.value).toBeNull();
            expect(attachments).toEqual([{ type: 'attachment', target: detached, arguments: {} }]);
        });

        it('include the attachment of a detached element once an evaluation, however many of its members answered null, and that of each such element', () => {
            const [first, second] = [document.createElement('div'), document.createElement('div')];
            const evaluation = evaluate('{ a = first.rect, b = first.size, c = second.rect, d = first.style["color"] }', { first, second });
            const attachments = evaluation.dependencies.flatMap(dependency => dependency.observations).filter(observation => observation.type === 'attachment');

            expect(evaluation.value).toEqual({ a: null, b: null, c: null, d: null });
            expect(attachments).toEqual([{ type: 'attachment', target: first, arguments: {} }, { type: 'attachment', target: second, arguments: {} }]);
        });

        it('leave the attachment out for an element that is attached', () => {
            const evaluation = evaluate('element.attribute["id"]', { element: panel });

            expect(evaluation.dependencies.flatMap(dependency => dependency.observations).some(observation => observation.type === 'attachment')).toBe(false);
        });

        it('include only those of the locals evaluation used', () => {
            expect(membersOf(evaluate('panel { let s = it.size, let c = it.clientSize, a = s, b = s }', { panel }))).toEqual(['size']);
        });

        it('include only those of the branch a conditional evaluated', () => {
            expect(membersOf(evaluate('if on then panel.size else panel.clientSize end', { panel, on: true }))).toEqual(['size']);
            expect(membersOf(evaluate('if on then panel.size else panel.clientSize end', { panel, on: false }))).toEqual(['clientSize']);
        });

        it('include the tests an or reached, and none it did not need', () => {
            const reached = evaluate('panel.attached or panel.focus()', { panel });
            const both = evaluate('panel.focus() or panel.attached', { panel });

            expect(membersOf(reached)).toEqual(['attached']);
            expect(membersOf(both)).toEqual(['focus', 'attached']);
        });

        it('are kept with the failure of an evaluation that recorded them before it failed', () => {
            const evaluation = evaluate('import Boom\n{ id = panel.attribute["id"], boom = panel:boom }', { panel }, [propertyModule('boom', () => { throw new Error('no'); })]);

            expect(evaluation.error).toBeInstanceOf(NexoError);
            expect(evaluation.error.code).toBe('NEXO5007');
            expect(evaluation.error.message).toContain("The member 'boom' failed");
            expect(evaluation.value).toBeUndefined();
            expect(membersOf(evaluation)).toEqual(['attribute', 'boom']);
        });
    });

    /** A member kept by an observation that never samples, so an evaluation that reads it stays pending. */
    const waitingModule = () => elementModule('level', [{
        name: 'level', kind: 'property', result: 'Number?',
        updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] },
        impl: ({ samples: [sample] }) => sample,
    }], {
        observationTypes: [{ name: 'level', contract: 'maintained', impl: () => ({ stop: () => {}, sample: () => ({ pending: true, value: null }) }) }],
    });

    describe('observations', () => {
        it('are not held for an answer that is complete, which needs nothing more observed', () => {
            const evaluation = evaluate('panel.attribute["id"]', { panel });

            expect(evaluation.isPending).toBe(false);
            expect(evaluation.dependencies.length).toBe(1);
            expect(observations.runningCount).toBe(0);
        });

        it('are all held for a pending answer, which waits on any of them changing', () => {
            const evaluation = evaluate('import Level\n{ id = panel.attribute["id"], level = panel:level }', { panel }, [waitingModule()]);

            expect(evaluation.isPending).toBe(true);
            expect(evaluation.value).toEqual({ id: 'panel', level: null });
            expect(observations.runningCount).toBe(2);
        });

        it('are all held where the caller keeps the answer current', () => {
            evaluate('panel.attribute["id"]', { panel }, [], true);

            expect(observations.runningCount).toBe(1);
        });

        it('are held while the evaluation is, and let go when it is disposed', () => {
            const evaluation = evaluate('panel.attribute["id"]', { panel }, [], true);

            expect(observations.runningCount).toBe(1);

            evaluation.dispose();

            expect(observations.runningCount).toBe(0);
            expect(evaluation.isDisposed).toBe(true);
        });

        it('are followed without a record of each call where the caller asks for none', async () => {
            const evaluation = evaluate('panel.attribute["id"]', { panel }, [], true, false);

            expect(evaluation.dependencies).toBeNull();
            expect(observations.runningCount).toBe(1);

            panel.setAttribute('id', 'renamed');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });

        it('call the evaluation back when something it depends on changes', async () => {
            evaluate('panel.attribute["id"]', { panel }, [], true);
            panel.setAttribute('id', 'renamed');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });

        it('are held once for every call that observes the same, so a change calls the evaluation back once', async () => {
            const evaluation = evaluate('panel.children { on = it.matches("[data-on]") }', { panel }, [], true);
            const requests = evaluation.dependencies.flatMap(dependency => dependency.observations);

            expect(evaluation.dependencies.length).toBe(4);
            expect(new Set(requests).size).toBeLessThan(requests.length);

            rows[1].setAttribute('data-on', '');

            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);
        });

        it('observe each child of the receiver where a member names its children, following the child list', async () => {
            const marked = elementModule('marked', [{
                name: 'marked', kind: 'property', result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'children', attributes: ['data-on'] }] },
                impl: ({ receiver }) => receiver.querySelectorAll(':scope > [data-on]').length,
            }]);
            const evaluation = evaluate('import Marked\npanel:marked', { panel }, [marked], true);

            expect(evaluation.value).toBe(0);
            expect(evaluation.dependencies[0].observations.map(request => `${request.type} of ${request.target === panel ? 'panel' : `row ${rows.indexOf(request.target)}`}`)).toEqual(['mutation of panel', 'mutation of row 0', 'mutation of row 1', 'mutation of row 2']);
            expect(observations.runningCount).toBe(4);

            rows[1].setAttribute('data-on', '');
            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(1);

            panel.append(document.createElement('i'));
            await new Promise(resolve => setTimeout(resolve));

            expect(changes).toBe(2);
        });

        it('observe no child of a receiver that holds none, and of a window none', () => {
            const empty = document.createElement('div');
            const evaluation = evaluate('empty.scroll', { empty }, [], true);

            expect(evaluation.dependencies[0].observations.map(request => request.type)).toEqual(['event', 'resize', 'mutation']);
        });

        it('are held once for every call that observes the same while a pending answer waits', async () => {
            const evaluation = evaluate('import Level\npanel.children { on = it.matches("[data-on]"), level = it:level }', { panel }, [waitingModule()]);

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
        const probeModule = (shared = true) => elementModule('probe', [{
            name: 'probe', kind: 'function', result: 'Number',
            arguments: 'positional',
            parameters: [{ name: 'names', kind: 'value', type: 'List<String>', required: false, default: [], fixed: false, nulls: 'propagate' }],
            updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'probe', of: 'receiver', names: { argument: 'names' } }] },
            impl: () => 1,
        }], {
            observationTypes: [{
                name: 'probe', contract: 'invalidation', identity: ['names'], shared,
                impl: () => {
                    started++;

                    return { stop: () => stopped++ };
                },
            }],
        });

        /** Evaluates the query again and again in one window, as a watch does, counting what each evaluation acquires. */
        const evaluationsOf = (text, bindings, modules) => {
            const registry = nexo.createRegistry([BrowserModule.create(), ...modules]);
            const evaluator = evaluatorWith(registry, text, bindings);
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
            const run = evaluationsOf('import Probe\npanel.children { p = it:probe(), w = it.rect?.width }', { panel }, [probeModule()]);
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
            const run = evaluationsOf('import Probe\npanel.children { p = it:probe() }', { panel }, [probeModule()]);
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
            const run = evaluationsOf('import Probe\npanel.children { p = it:probe() }', { panel }, [probeModule()]);
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

        it('are acquired again where an argument changed, and the old one is let go', () => {
            const run = evaluationsOf('import Probe\npanel:probe(if (panel.attribute["data-two"]) == null then one else two end)', { panel, one: ['a'], two: ['a', 'b'] }, [probeModule()]);
            const first = run.evaluate([]);

            panel.setAttribute('data-two', '');

            const second = run.evaluate([first]);

            first.dispose();

            expect([started, stopped]).toEqual([2, 1]);

            run.evaluate([second]);
            second.dispose();

            expect([started, stopped]).toEqual([2, 1]);
        });

        it('stay where a bound list was changed in place, since the bindings hold a copy of it', () => {
            const names = ['a'];
            const run = evaluationsOf('import Probe\npanel:probe(names)', { panel, names }, [probeModule()]);
            const first = run.evaluate([]);

            names.push('b');

            const second = run.evaluate([first]);

            first.dispose();
            second.dispose();

            expect([started, stopped]).toEqual([1, 1]);
        });

        it('are held once, and taken over once, where the evaluation observes the same twice', () => {
            const run = evaluationsOf('import Probe\nitems { p = it:probe() }', { items: [rows[0], rows[0]] }, [probeModule()]);
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
            const run = evaluationsOf('import Probe\npanel:probe()', { panel }, [probeModule(false)]);
            const first = run.evaluate([]);
            const second = run.evaluate([first]);

            first.dispose();

            expect([started, stopped]).toEqual([2, 1]);

            second.dispose();

            expect([started, stopped]).toEqual([2, 2]);
        });

        it('are acquired again where the window\'s observations ended those the replaced evaluation held', () => {
            const run = evaluationsOf('import Probe\npanel:probe()', { panel }, [probeModule()]);
            const first = run.evaluate([]);

            observations.dispose();

            run.evaluate([first]);
            first.dispose();

            expect([started, stopped]).toEqual([2, 1]);
            expect(observations.runningCount).toBe(1);
        });

        it('are neither taken over nor kept for one where the evaluation replaces none', () => {
            const run = evaluationsOf('import Probe\npanel:probe()', { panel }, [probeModule()]);
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

    /** A module whose source `ticks` delivers events of the type its key maps to in the type selector `event`, and records each start. */
    const ticks = type => DispatchTable.createModule('Ticks', {
        types: [
            { name: 'Tick', kind: 'structured', members: [{ name: 'at', kind: 'property', result: 'Number' }, { name: 'label', kind: 'property', result: 'String?' }] },
            {
                name: 'TickElements', kind: 'extension', target: 'Domql.Element', members: [{
                    name: 'ticks', kind: 'function', invokedBy: 'host', requestKind: 'subscription', arguments: 'positional', parameters: [{ name: 'type', kind: 'value', type: 'String', required: true, fixed: true, selects: 'type', selector: 'event', nulls: 'propagate' }], result: '@selected',
                    impl: () => {
                        started.push(true);

                        return { stop: () => {} };
                    },
                }],
            },
        ],
        mappings: [{ selector: 'event', key: 'tick', type }],
    });

    const evaluatorOf = (text, bindings = {}, modules = []) => {
        const registry = nexo.createRegistry([BrowserModule.create(), ...modules]);

        observations = new Observations(registry, { window, document });

        return evaluatorWith(registry, text, bindings);
    };

    const failureOf = call => {
        try {
            call();
        } catch (error) {
            return error;
        }

        throw new Error('The call threw nothing');
    };

    /** Captures the event as its type declares and projects it, through the subscription's host call prepared for it. */
    const projectionOf = (evaluator, event) => evaluator.project(evaluator.prepareHostCall(), event, { observations });

    /** A scroll as `on` delivers one targeting the value given: its target, and what every event carries. */
    const scrollAt = target => ({ target, timeStamp: 0, defaultPrevented: false, composedPath: [] });

    describe('the host call', () => {
        it('is prepared into what starts it: its declaration, the receiver and the arguments prepared now, its implementation in DOMQL\'s dispatch table, and nothing started', () => {
            const call = evaluatorOf('import Ticks\npanel:ticks("tick") { at = it.at }', { panel }, [ticks('Tick')]).prepareHostCall();

            expect(call).toMatchObject({ kind: 'prepared', declaration: { name: 'ticks' }, receiver: panel, args: { type: 'tick' } });
            expect(typeof DispatchTable.get(call.declaration).implementation).toBe('function');
            expect(started).toEqual([]);
        });

        it('is skipped where its receiver is null, since there is nothing to listen to', () => {
            expect(evaluatorOf('import Ticks\npanel.first(".none")?:ticks("tick") { at = it.at }', { panel }, [ticks('Tick')]).prepareHostCall()).toMatchObject({ kind: 'skipped' });
        });

        it('is refused for a request that ends in no host call', () => {
            expect(failureOf(() => evaluatorOf('panel.children.count', { panel }).prepareHostCall())).toMatchObject({ kind: 'evaluation', code: 'NEXO5014', message: expect.stringContaining('The script gives a value and ends in no host call, so there is nothing to prepare') });
        });
    });

    describe('capturing an event', () => {
        it('keeps the fields its type declares, a nullable one it does not carry as null', () => {
            const evaluator = evaluatorOf('import Ticks\npanel:ticks("tick") { at = it.at, label = it.label }', { panel }, [ticks('Tick')]);

            expect(projectionOf(evaluator, { at: 1, label: 'first', extra: true }).value).toEqual({ at: 1, label: 'first' });
            expect(projectionOf(evaluator, { at: 1 }).value).toEqual({ at: 1, label: null });
        });

        it('fails where the event carries mistyped data, whether its field is nullable or not', () => {
            const evaluator = evaluatorOf('import Ticks\npanel:ticks("tick") { at = it.at }', { panel }, [ticks('Tick')]);

            expect(projectionOf(evaluator, { at: 'soon' }).error).toMatchObject({ kind: 'evaluation', code: 'NEXO5015', message: expect.stringContaining("The host call 'ticks' supplied a value whose 'at' is \"soon\", and 'at' is declared Number") });
            expect(projectionOf(evaluator, { at: 1, label: 7 }).error).toMatchObject({ kind: 'evaluation', code: 'NEXO5015', message: expect.stringContaining("whose 'label' is 7, and 'label' is declared String?") });
            expect(projectionOf(evaluator, null).error).toMatchObject({ kind: 'evaluation', code: 'NEXO5015' });
        });

        it('takes an event whole where its type declares no fields, and fails one that is not of its type', () => {
            const evaluator = evaluatorOf('import Ticks\npanel:ticks("tick")', { panel }, [ticks('Number')]);

            expect(projectionOf(evaluator, 5).value).toBe(5);
            expect(projectionOf(evaluator, 'five').error).toMatchObject({ kind: 'evaluation', code: 'NEXO5015', message: expect.stringContaining("The host call 'ticks' supplied \"five\", and it declares Number") });
        });

        it('keeps an event\'s target, and null for one it carries none of or that is no element, a reference of another type', () => {
            const evaluator = evaluatorOf('Domql.document.on("scroll") { id = it.target?.attribute["id"] }');

            expect(projectionOf(evaluator, scrollAt(undefined)).value).toEqual({ id: null });
            expect(projectionOf(evaluator, scrollAt(panel)).value).toEqual({ id: 'panel' });
            expect(projectionOf(evaluator, scrollAt(document)).value).toEqual({ id: null });
        });

        it('fails an event that carries less than its type declares, as a native event without the members DOMQL reads for it carries no composed path', () => {
            const evaluator = evaluatorOf('Domql.document.on("scroll") { id = it.target?.attribute["id"] }');

            expect(projectionOf(evaluator, new window.Event('scroll')).error).toMatchObject({ kind: 'evaluation', code: 'NEXO5015' });
        });
    });

    describe('an event', () => {
        it('is projected through the object expression that follows its source, as detached, immutable data', () => {
            const evaluator = evaluatorOf('import Ticks\npanel:ticks("tick") { at = it.at, label = it.label, count = panel.children.count }', { panel }, [ticks('Tick')]);
            const projection = projectionOf(evaluator, { at: 3, label: 'third' });

            expect(projection.error).toBeNull();
            expect(projection.value).toEqual({ at: 3, label: 'third', count: 1 });
            expect(Object.isFrozen(projection.value)).toBe(true);
        });

        it('reads what it captured, and the document as it is', () => {
            const evaluator = evaluatorOf('Domql.document.on("scroll") { id = it.target?.attribute["id"] }');

            expect(projectionOf(evaluator, scrollAt(panel)).value).toEqual({ id: 'panel' });
            expect(projectionOf(evaluator, scrollAt(document)).value).toEqual({ id: null });
        });

        it('fails its projection where a member fails, without throwing', () => {
            const evaluator = evaluatorOf('import Ticks\npanel:ticks("tick") { match = panel.matches("[") }', { panel }, [ticks('Tick')]);
            const projection = projectionOf(evaluator, { at: 1 });

            expect(projection.value).toBeUndefined();
            expect(projection.error).toMatchObject({ kind: 'evaluation', code: 'NEXO5007', message: expect.stringContaining("The member 'matches' failed") });
        });

        it('holds the observations of its maintained members alone, each read in the order its member names them, and none of those of its other members, whose changes it does not follow', () => {
            const level = elementModule('level', [{
                name: 'level', kind: 'property', result: 'Number?',
                updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'gauge', of: 'receiver' }, { type: 'dial', of: 'receiver' }] },
                impl: ({ samples: [gauge, dial] }) => gauge * 10 + dial,
            }], {
                observationTypes: [
                    { name: 'gauge', contract: 'maintained', impl: () => ({ stop: () => {}, sample: () => ({ pending: false, value: 4 }) }) },
                    { name: 'dial', contract: 'maintained', impl: () => ({ stop: () => {}, sample: () => ({ pending: false, value: 2 }) }) },
                ],
            });
            const evaluator = evaluatorOf('import Ticks\nimport Level\npanel:ticks("tick") { at = it.at, level = panel:level, count = panel.children.count, id = panel.attribute["id"], hidden = panel.first("i")?.matches(".x") }', { panel }, [ticks('Tick'), level]);
            const projection = projectionOf(evaluator, { at: 1 });

            expect(projection.error).toBeNull();
            expect(projection.value).toEqual({ at: 1, level: 42, count: 1, id: 'panel', hidden: false });
            expect(projection.dependencies).toBeNull();
            expect(observations.runningCount).toBe(2);

            projection.dispose();

            expect(observations.runningCount).toBe(0);
        });

        it('stands for its source, which the projection never starts or reads', () => {
            const evaluator = evaluatorOf('import Ticks\npanel:ticks("tick") { at = it.at }', { panel }, [ticks('Tick')]);

            projectionOf(evaluator, { at: 1 });
            projectionOf(evaluator, { at: 2 });

            expect(started).toEqual([]);
        });
    });
});
