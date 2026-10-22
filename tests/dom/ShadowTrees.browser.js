import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

/** How many times the member below has been read in the test running. */
let evaluations = 0;

// A member read afresh at each evaluation, observing any attribute in the tree its receiver is in, so each evaluation is a snapshot of its own.
domql.registerModule(domql.createModule('evaluations', {
    members: [{
        name: 'evaluations', kind: 'property', target: 'Element', result: 'Number',
        updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'root', attributes: true, subtree: true }] },
        implementation: () => ++evaluations,
    }],
}));

/** Watches in shadow trees, whose structure, scrolling, slots and inertness only a real browser has. */
describe('Watches in shadow trees', () => {
    let watches;
    let snapshots;

    beforeEach(() => {
        document.body.style.margin = '0';
        evaluations = 0;
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

    const watch = (text, bindings) => {
        const created = domql.query(text, bindings).watch({ schedule: 'immediate', acceptPartialObservation: true });

        created.subscribe('change', (sender, args) => snapshots.push(args.value));
        watches.push(created);

        return created;
    };

    /** A host in the parent with a shadow root of the mode, holding the markup. */
    const host = (parent, markup, mode = 'open', options = {}) => {
        const element = document.createElement('div');

        parent.append(element);

        const root = element.attachShadow({ mode, ...options });

        root.innerHTML = markup;

        return { element, root };
    };

    /** How many snapshots the cause brings, once the observers have delivered. */
    const reports = async cause => {
        const before = snapshots.length;

        cause();
        await settle();

        return snapshots.length - before;
    };

    it('follows children added and removed inside the shadow root its receiver is in', async () => {
        const { root } = host(document.body, '<ul><li></li></ul>');
        const list = root.querySelector('ul');

        watch('list.all("li").count', { list });
        await settle();

        expect(snapshots).toEqual([1]);

        await reports(() => list.append(document.createElement('li')));
        await reports(() => list.firstElementChild.remove());

        expect(snapshots).toEqual([1, 2, 1]);
    });

    it('follows an element inside a closed shadow root that the caller holds', async () => {
        const { root } = host(document.body, '<ul><li></li></ul>', 'closed');
        const list = root.querySelector('ul');

        watch('list.all("li").count', { list });
        await settle();
        await reports(() => list.append(document.createElement('li')));

        expect(snapshots).toEqual([1, 2]);
    });

    it('follows a receiver moved between roots, its new root and never its old one, through repeated moves and until it is disposed', async () => {
        const first = host(document.body, '<p></p>');
        const second = host(document.body, '<p></p>');
        const item = document.createElement('span');

        first.root.append(item);

        const watched = watch('item.evaluations', { item });

        await settle();

        expect(await reports(() => first.root.querySelector('p').setAttribute('data-n', '1'))).toBe(1);
        expect(await reports(() => document.body.setAttribute('data-n', '1'))).toBe(0);
        expect(await reports(() => second.root.append(item))).toBe(1);
        expect(await reports(() => second.root.querySelector('p').setAttribute('data-n', '1'))).toBe(1);
        expect(await reports(() => first.root.querySelector('p').setAttribute('data-n', '2'))).toBe(0);
        expect(await reports(() => first.root.append(item))).toBe(1);
        expect(await reports(() => second.root.querySelector('p').setAttribute('data-n', '2'))).toBe(0);
        expect(await reports(() => first.root.querySelector('p').setAttribute('data-n', '3'))).toBe(1);

        watched.dispose();

        expect(await reports(() => first.root.querySelector('p').setAttribute('data-n', '4'))).toBe(0);
    });

    it('follows a receiver from a detached tree into the document and out of it again', async () => {
        const tree = document.createElement('section');
        const item = document.createElement('span');

        tree.append(item);
        watch('item.evaluations', { item });
        await settle();

        expect(await reports(() => document.body.append(tree))).toBe(1);
        expect(await reports(() => document.body.setAttribute('data-n', '1'))).toBe(1);
        expect(await reports(() => tree.remove())).toBe(1);
        expect(await reports(() => document.body.setAttribute('data-n', '2'))).toBe(0);
    });

    it('follows the scrolling of a container in its own shadow root, and in a root around it', async () => {
        const outer = host(document.body, '<div class="scroller" style="height: 50px; overflow: auto"><div style="height: 20px"></div><div class="host"></div><div style="height: 500px"></div></div>');
        const inner = host(outer.root.querySelector('.host'), '<div class="scroller" style="height: 50px; overflow: auto"><div style="height: 20px"></div><div class="item" style="height: 10px"></div><div style="height: 500px"></div></div>');
        const item = inner.root.querySelector('.item');

        watch('item.rect?.top', { item });
        await settle();

        expect(await reports(() => { inner.root.querySelector('.scroller').scrollTop = 10; })).toBe(1);
        expect(await reports(() => { outer.root.querySelector('.scroller').scrollTop = 10; })).toBe(1);
        expect(snapshots).toEqual([40, 30, 20]);
    });

    it('takes an inert host to make what its shadow root holds no longer text editable, and follows the host', async () => {
        const shadow = host(document.body, '<input>');
        const input = shadow.root.querySelector('input');

        watch('input.textEditable()', { input });
        await settle();
        await reports(() => shadow.element.setAttribute('inert', ''));
        await reports(() => shadow.element.removeAttribute('inert'));

        expect(snapshots).toEqual([true, false, true]);
    });

    it('follows the slot an element is assigned to, by hand, and the inert ancestors that slot has', async () => {
        const shadow = host(document.body, '<div inert><slot class="inert"></slot></div><slot class="open"></slot>', 'open', { slotAssignment: 'manual' });
        const input = document.createElement('input');

        shadow.element.append(input);
        watch('input.textEditable()', { input });
        await settle();
        await reports(() => shadow.root.querySelector('.inert').assign(input));
        await reports(() => shadow.root.querySelector('.open').assign(input));

        expect(snapshots).toEqual([true, false, true]);
    });
});
