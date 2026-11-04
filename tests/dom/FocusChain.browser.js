import { afterEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/**
 * Focus inside open shadow roots, moved between text inputs, which every engine focuses on a click, read two ways after each move: evaluated afresh, which is what the browser decides, and watched, which is what the focus observation
 * caught. A move inside one root reaches no further than that root, since its target and its related target both retarget to the root's host, so a watch hearing the
 * document alone keeps reporting where the focus was.
 */
describe('focus within open shadow roots', () => {
    let watches = [];

    afterEach(() => {
        watches.forEach(watch => watch.dispose());
        watches = [];
        document.body.innerHTML = '';
    });

    /** Waits for the observers to deliver, which they do before the next frame, and for the watch to evaluate. */
    const settle = async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    /** A host in the parent with an open shadow root holding the markup, answering the root. */
    const rootIn = (parent, markup) => {
        const host = document.createElement('div');

        parent.append(host);

        const root = host.attachShadow({ mode: 'open' });

        root.innerHTML = markup;

        return root;
    };

    /** Watches the query, and answers what the watch last reported and what the browser decides now, after each cause. */
    const watching = async (text, bindings = {}) => {
        const reported = [];
        const watch = domql.query(text, bindings).watch({ schedule: 'immediate', acceptPartialObservation: true });

        watch.subscribe('change', (sender, args) => reported.push(args.status === 'failed' ? args.error : args.value));
        watches.push(watch);
        await settle();

        return async cause => {
            await cause();
            await settle();

            return { watched: reported.at(-1), decided: domql.query(text, bindings).evaluate() };
        };
    };

    const ACTIVE = 'Domql.document.activeElement?["id"]';

    it('follows the focus from one element of a root to another, which the document never hears', async () => {
        const root = rootIn(document.body, '<input id="a"><div id="wrap"><input id="b"></div>');
        const [a, b, wrap] = ['a', 'b', 'wrap'].map(id => root.getElementById(id));

        await userEvent.click(a);

        const active = await watching(ACTIVE);
        const focused = await watching('b.focused', { b });
        const within = await watching('wrap.matches(":focus-within")', { wrap });

        expect(await active(() => userEvent.click(b))).toEqual({ watched: 'b', decided: 'b' });
        expect(await focused(() => {})).toEqual({ watched: true, decided: true });
        expect(await within(() => {})).toEqual({ watched: true, decided: true });
        expect(await active(() => userEvent.click(a))).toEqual({ watched: 'a', decided: 'a' });
        expect(await focused(() => {})).toEqual({ watched: false, decided: false });
        expect(await within(() => {})).toEqual({ watched: false, decided: false });
    });

    it('follows the focus into a root nested in another, inside the inner root, and back out', async () => {
        const outer = rootIn(document.body, '<input id="a"><div id="inner"></div>');
        const inner = rootIn(outer.getElementById('inner'), '<input id="c"><input id="d">');
        const [a, c, d] = [outer.getElementById('a'), inner.getElementById('c'), inner.getElementById('d')];

        await userEvent.click(a);

        const active = await watching(ACTIVE);
        const dFocused = await watching('d.focused', { d });

        expect(await active(() => userEvent.click(c))).toEqual({ watched: 'c', decided: 'c' });
        expect(await active(() => userEvent.click(d))).toEqual({ watched: 'd', decided: 'd' });
        expect(await dFocused(() => {})).toEqual({ watched: true, decided: true });
        expect(await active(() => userEvent.click(c))).toEqual({ watched: 'c', decided: 'c' });
        expect(await dFocused(() => {})).toEqual({ watched: false, decided: false });
        expect(await active(() => userEvent.click(a))).toEqual({ watched: 'a', decided: 'a' });
    });

    it('follows the focus moved by script, inside a root and between roots', async () => {
        const first = rootIn(document.body, '<input id="a"><input id="b">');
        const second = rootIn(document.body, '<input id="c">');
        const [a, b, c] = [first.getElementById('a'), first.getElementById('b'), second.getElementById('c')];

        a.focus();

        const active = await watching(ACTIVE);

        expect(await active(() => b.focus())).toEqual({ watched: 'b', decided: 'b' });
        expect(await active(() => c.focus())).toEqual({ watched: 'c', decided: 'c' });
        expect(await active(() => a.focus())).toEqual({ watched: 'a', decided: 'a' });
    });

    it('follows the focused element removed, which moves the focus away and fires no event, in the document and inside a root', async () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="outside">');

        const root = rootIn(document.body, '<input id="a"><input id="b">');
        const [outside, b] = [document.getElementById('outside'), root.getElementById('b')];

        await userEvent.click(b);

        const active = await watching(ACTIVE);

        expect(await active(() => b.remove())).toEqual({ watched: null, decided: null });
        expect(await active(() => userEvent.click(outside))).toEqual({ watched: 'outside', decided: 'outside' });
        expect(await active(() => outside.remove())).toEqual({ watched: null, decided: null });
    });
});
