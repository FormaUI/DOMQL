import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

/** What the members of the tree answer and observe as nodes move, and as shadow roots and slots change, which only a real browser has. */
describe('Nodes in a browser', () => {
    let watches;
    let snapshots;

    beforeEach(() => {
        watches = [];
        snapshots = [];
    });

    afterEach(() => {
        watches.forEach(watch => watch.dispose());
        document.body.innerHTML = '';
    });

    /** Waits for the observers to deliver, which they do before the next frame, and for the watch to evaluate. */
    const settle = async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    /** Watches the text, reporting each snapshot, and waits for the first. */
    const watch = async (text, bindings) => {
        const created = domql.query(text, bindings).watch({ schedule: 'immediate', acceptPartialObservation: true });

        created.subscribe('change', (sender, args) => snapshots.push(args.status === 'failed' ? args.error : args.value));
        watches.push(created);
        await settle();

        return created;
    };

    /** The last snapshot once the cause has run and the observers have delivered. */
    const after = async cause => {
        cause();
        await settle();

        return snapshots.at(-1);
    };

    /** The element the markup writes, appended to the parent, or the top of a detached tree of its own where there is none. */
    const element = (markup, parent = document.body) => {
        const template = document.createElement('template');

        template.innerHTML = markup;

        // The element is the page document's, as one it creates is, and with no parent it is the top of a detached tree of its own.
        const created = document.importNode(template.content, true).firstElementChild;

        created.remove();
        parent?.append(created);

        return created;
    };

    describe('parent and root', () => {
        it('follow a node reparented in the document, observing its new parent', async () => {
            const first = element('<div id="first"><i></i></div>');
            const second = element('<div id="second"></div>');
            const item = first.firstElementChild;

            await watch('(@item.parent as "element") attributeOf "id"', { item });

            expect(snapshots).toEqual(['first']);
            expect(await after(() => second.append(item))).toBe('second');
            expect(await after(() => second.setAttribute('id', 'moved'))).toBe('moved');
        });

        it('follow an ancestor moved into a shadow root, the node\'s root changing while its parent does not', async () => {
            const host = element('<div id="host"></div>');
            const root = host.attachShadow({ mode: 'open' });
            const ancestor = element('<section id="ancestor"><i></i></section>');
            const item = ancestor.firstElementChild;

            await watch('{ parent: (@item.parent as "element") attributeOf "id", host: (@item.root as "shadowRoot")?.host attributeOf "id" }', { item });

            expect(snapshots).toEqual([{ parent: 'ancestor', host: null }]);
            expect(await after(() => root.append(ancestor))).toEqual({ parent: 'ancestor', host: 'host' });
            expect(await after(() => document.body.append(ancestor))).toEqual({ parent: 'ancestor', host: null });
        });

        it('follow a node detached from the start into the document', async () => {
            const parent = element('<div id="parent"></div>');
            const item = element('<i></i>', null);

            await watch('{ parent: (@item.parent as "element") attributeOf "id", inDocument: (@item.root as "document") is null }', { item });

            expect(snapshots).toEqual([{ parent: null, inDocument: true }]);
            expect(await after(() => parent.append(item))).toEqual({ parent: 'parent', inDocument: false });
        });

        it('follow a node of another document, as a template\'s content is, adopted into the document', async () => {
            const template = document.createElement('template');

            template.innerHTML = '<i></i>';

            const parent = element('<div id="parent"></div>');
            const item = template.content.firstElementChild;

            // Out of the template's content, the element is the top of a detached tree that another document owns.
            item.remove();

            await watch('{ parent: (@item.parent as "element") attributeOf "id", inDocument: (@item.root as "document") is null }', { item });

            expect(snapshots).toEqual([{ parent: null, inDocument: true }]);
            expect(await after(() => parent.append(item))).toEqual({ parent: 'parent', inDocument: false });
        });

        it('follow a node detached from the start into another detached tree', async () => {
            const tree = element('<div id="tree"></div>', null);
            const item = element('<i></i>', null);

            await watch('{ parent: (@item.parent as "element") attributeOf "id", root: (@item.root as "element") attributeOf "id" }', { item });

            expect(snapshots).toEqual([{ parent: null, root: null }]);
            expect(await after(() => tree.append(item))).toEqual({ parent: 'tree', root: 'tree' });
        });
    });

    describe('shadow.root', () => {
        it('answers an open shadow root, and null for none and for a closed one', async () => {
            const open = element('<div></div>');
            const closed = element('<div></div>');
            const none = element('<div></div>');

            open.attachShadow({ mode: 'open' }).innerHTML = '<p></p>';
            closed.attachShadow({ mode: 'closed' }).innerHTML = '<p></p>';

            await watch('{ open: @open.shadow.root?.children.count, closed: @closed.shadow.root?.children.count, none: @none.shadow.root?.children.count }', { open, closed, none });

            expect(snapshots).toEqual([{ open: 1, closed: null, none: null }]);
        });

        it('misses a root attached to an element in its tree until a refresh, which then observes inside the root', async () => {
            const host = element('<div></div>');
            const created = await watch('@host.shadow.root?.children.count', { host });

            expect(snapshots).toEqual([null]);

            const root = host.attachShadow({ mode: 'open' });

            await settle();

            expect(snapshots).toEqual([null]);
            expect(await after(() => created.refreshAsync())).toBe(0);
            expect(await after(() => root.append(document.createElement('p')))).toBe(1);
        });

        it('sees a root a custom element attaches as it connects', async () => {
            const name = `x-connecting-${Math.random().toString(36).slice(2)}`;

            customElements.define(name, class extends HTMLElement {
                connectedCallback() {
                    this.shadowRoot ?? this.attachShadow({ mode: 'open' }).append(document.createElement('p'));
                }
            });

            const host = document.createElement(name);

            await watch('@host.shadow.root?.children.count', { host });

            expect(snapshots).toEqual([null]);
            expect(await after(() => document.body.append(host))).toBe(1);
        });
    });

    describe('shadow.elements', () => {
        const ids = '@slot.shadow.elements { id: self attributeOf "id" }';

        /** A host whose open shadow root holds the markup, with the light children given. */
        const host = (markup, light = '') => {
            const created = element(`<div>${light}</div>`);

            created.attachShadow({ mode: 'open' }).innerHTML = markup;

            return { host: created, slot: created.shadowRoot.querySelector('slot') };
        };

        it('answers the elements assigned to a slot, and follows them as they are assigned and unassigned', async () => {
            const { host: created, slot } = host('<slot></slot>', '<i id="a"></i>text<i id="b"></i>');

            await watch(ids, { slot });

            expect(snapshots).toEqual([[{ id: 'a' }, { id: 'b' }]]);
            expect(await after(() => created.querySelector('#a').remove())).toEqual([{ id: 'b' }]);
            expect(await after(() => created.append(element('<i id="c"></i>', null)))).toEqual([{ id: 'b' }, { id: 'c' }]);
        });

        it('follows a slot\'s name, which decides what is assigned to it', async () => {
            const { slot } = host('<slot name="one"></slot>', '<i id="a" slot="one"></i><i id="b" slot="two"></i>');

            await watch(ids, { slot });

            expect(snapshots).toEqual([[{ id: 'a' }]]);
            expect(await after(() => slot.setAttribute('name', 'two'))).toEqual([{ id: 'b' }]);
        });

        it('takes the fallback where nothing is assigned, and follows it as it changes', async () => {
            const { host: created, slot } = host('<slot><b id="fallback"></b></slot>');

            await watch(ids, { slot });

            expect(snapshots).toEqual([[{ id: 'fallback' }]]);
            expect(await after(() => slot.append(element('<b id="more"></b>', null)))).toEqual([{ id: 'fallback' }, { id: 'more' }]);
            expect(await after(() => created.append(element('<i id="a"></i>', null)))).toEqual([{ id: 'a' }]);
            expect(await after(() => created.firstElementChild.remove())).toEqual([{ id: 'fallback' }, { id: 'more' }]);
        });

        it('answers the empty list where assigned text suppresses the fallback', async () => {
            const { slot } = host('<slot><b id="fallback"></b></slot>', 'text');

            await watch(ids, { slot });

            expect(snapshots).toEqual([[]]);
        });

        it('answers the empty list for a slot outside a shadow tree, whatever its fallback, and null for an element that is no slot', async () => {
            const slot = element('<slot><b id="fallback"></b></slot>');
            const other = element('<div><b></b></div>');

            await watch('{ slot: @slot.shadow.elements?.count, other: @other.shadow.elements?.count }', { slot, other });

            expect(snapshots).toEqual([{ slot: 0, other: null }]);
        });

        it('flattens forwarded slots, following a forwarding chain that is replaced and the slot it now forwards from', async () => {
            // The outer host's shadow root forwards its light children through its own slot into the inner host's slot.
            const outer = element('<div><i id="a"></i></div>');
            const outerRoot = outer.attachShadow({ mode: 'open' });

            outerRoot.innerHTML = '<div id="inner"><slot id="forwarding"></slot></div>';

            const inner = outerRoot.getElementById('inner');

            inner.attachShadow({ mode: 'open' }).innerHTML = '<slot></slot>';

            const slot = inner.shadowRoot.querySelector('slot');

            await watch(ids, { slot });

            expect(snapshots).toEqual([[{ id: 'a' }]]);
            expect(await after(() => outer.append(element('<i id="b"></i>', null)))).toEqual([{ id: 'a' }, { id: 'b' }]);

            const replacing = element('<slot id="replacing"><b id="fallback"></b></slot>', null);

            expect(await after(() => outerRoot.getElementById('forwarding').replaceWith(replacing))).toEqual([{ id: 'a' }, { id: 'b' }]);
            expect(await after(() => outer.replaceChildren())).toEqual([{ id: 'fallback' }]);
            expect(await after(() => replacing.append(element('<b id="added"></b>', null)))).toEqual([{ id: 'fallback' }, { id: 'added' }]);
        });
    });
});
