import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/**
 * The built-in Boolean functions in a real browser, each called two ways after every cause: evaluated afresh, which is what the browser decides, and watched, which is what the function's observations catch.
 * Where the two agree, the watch caught the change; where only the evaluation moved, the change is one the function's contract says a watch misses.
 */
describe('Boolean functions in a browser', () => {
    let watches;

    beforeEach(() => {
        watches = [];
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

    /** The page the markup writes, and each element of it by its id. */
    const page = markup => {
        document.body.innerHTML = markup;

        return new Proxy({}, { get: (_, id) => document.getElementById(id) });
    };

    /** Watches the element's Boolean function, or its ARIA view's where asked, and answers what the watch last reported and what the browser decides now. */
    const watching = (element, name, isAria = false) => watchingQuery(isAria ? `e.aria.${name}()` : `e.${name}()`, { e: element });

    /** Watches the query, and answers what the watch last reported and what the browser decides now. */
    const watchingQuery = async (text, bindings) => {
        const snapshots = [];
        const watch = domql.query(text, bindings).watch({ schedule: 'immediate', acceptPartialObservation: true });

        watch.subscribe('change', (sender, args) => snapshots.push(args.status === 'failed' ? args.error : args.value));
        watches.push(watch);
        await settle();

        return {
            /** What the watch reports and what the browser decides, after the cause has run and the observers have delivered. */
            after: async cause => {
                await cause();
                await settle();

                return { watched: snapshots.at(-1), decided: domql.query(text, bindings).evaluate() };
            },
            get watched() {
                return snapshots.at(-1);
            },
        };
    };

    describe('checked, as :checked matches', () => {
        it('follows a checkbox the user ticks and unticks', async () => {
            const { box } = page('<input id="box" type="checkbox">');
            const checked = await watching(box, 'checked');

            expect(checked.watched).toBe(false);
            expect(await checked.after(() => userEvent.click(box))).toEqual({ watched: true, decided: true });
            expect(await checked.after(() => userEvent.click(box))).toEqual({ watched: false, decided: false });
        });

        it('follows a radio button another of its group unchecks, which fires no event at it', async () => {
            const { a, b } = page('<input id="a" type="radio" name="g" checked><input id="b" type="radio" name="g">');
            const checked = await watching(a, 'checked');

            expect(checked.watched).toBe(true);
            expect(await checked.after(() => userEvent.click(b))).toEqual({ watched: false, decided: false });
        });

        it('follows an option the user selects, whose selection fires its events at its select', async () => {
            const { list, second } = page('<select id="list"><option id="first">1</option><option id="second">2</option></select>');
            const checked = await watching(second, 'checked');

            expect(checked.watched).toBe(false);
            expect(await checked.after(() => userEvent.selectOptions(list, '2'))).toEqual({ watched: true, decided: true });
        });

        it('follows a form reset, which restores the default the checked attribute gives', async () => {
            const { form, box } = page('<form id="form"><input id="box" type="checkbox"></form>');
            const checked = await watching(box, 'checked');

            await checked.after(() => userEvent.click(box));

            expect(await checked.after(() => form.reset())).toEqual({ watched: false, decided: false });
        });

        it('follows the checked attribute of a box the user has not touched, which sets its checkedness', async () => {
            const { box } = page('<input id="box" type="checkbox">');
            const checked = await watching(box, 'checked');

            expect(await checked.after(() => box.setAttribute('checked', ''))).toEqual({ watched: true, decided: true });
        });

        it('misses the page\'s code setting checked, selected or a select\'s value, which fires no event', async () => {
            const { box, list, second } = page('<input id="box" type="checkbox"><select id="list"><option>1</option><option id="second">2</option></select>');
            const boxChecked = await watching(box, 'checked');
            const optionChecked = await watching(second, 'checked');

            expect(await boxChecked.after(() => { box.checked = true; })).toEqual({ watched: false, decided: true });
            expect(await optionChecked.after(() => { list.value = '2'; })).toEqual({ watched: false, decided: true });
        });
    });

    describe('disabled, as :disabled matches', () => {
        it('follows a control a fieldset disables, but for one in its first legend', async () => {
            const { set, outside, inLegend } = page('<fieldset id="set"><legend><input id="inLegend"></legend><input id="outside"></fieldset>');
            const disabled = await watching(outside, 'disabled');
            const legendDisabled = await watching(inLegend, 'disabled');

            expect(await disabled.after(() => set.setAttribute('disabled', ''))).toEqual({ watched: true, decided: true });
            expect(await legendDisabled.after(() => {})).toEqual({ watched: false, decided: false });
        });

        it('follows a control moved out of the first legend of a disabled fieldset', async () => {
            const { set, inLegend } = page('<fieldset id="set" disabled><legend><input id="inLegend"></legend></fieldset>');
            const disabled = await watching(inLegend, 'disabled');

            expect(disabled.watched).toBe(false);
            expect(await disabled.after(() => set.append(inLegend))).toEqual({ watched: true, decided: true });
        });
    });

    describe('focus and focusWithin', () => {
        it('follow focus moving into an element and within it', async () => {
            const { outer, field } = page('<div id="outer"><input id="field"></div><button id="other">x</button>');
            const focus = await watching(field, 'focus');
            const within = await watching(outer, 'focusWithin');

            expect(await within.after(() => userEvent.click(field))).toEqual({ watched: true, decided: true });
            expect(focus.watched).toBe(true);
            expect(await within.after(() => userEvent.click(document.getElementById('other')))).toEqual({ watched: false, decided: false });
            expect(focus.watched).toBe(false);
        });

        it('follow the focused element being removed, which moves focus away', async () => {
            const { outer, field } = page('<div id="outer"><input id="field"></div>');
            const within = await watching(outer, 'focusWithin');

            await within.after(() => field.focus());

            expect(await within.after(() => field.remove())).toEqual({ watched: false, decided: false });
        });
    });

    describe('hover, as :hover matches', () => {
        it('follows the pointer moving over an element and off it', async () => {
            const { target, away } = page('<div id="target" style="width: 100px; height: 100px">t</div><div id="away" style="width: 100px; height: 100px">a</div>');
            const hover = await watching(target, 'hover');

            expect(await hover.after(() => userEvent.hover(target))).toEqual({ watched: true, decided: true });
            expect(await hover.after(() => userEvent.hover(away))).toEqual({ watched: false, decided: false });
        });

        it('follows an element moving under a pointer that does not move, which Chromium fires pointer events for', async () => {
            const { target, away } = page('<div id="target" style="position: absolute; left: 0; top: 0; width: 100px; height: 100px">t</div><div id="away" style="position: absolute; left: 200px; top: 0; width: 100px; height: 100px">a</div>');
            const hover = await watching(away, 'hover');

            await userEvent.hover(target);
            await settle();

            expect(await hover.after(() => { away.style.left = '0'; away.style.zIndex = '1'; })).toEqual({ watched: true, decided: true });
        });
    });

    describe('the ARIA view\'s Boolean functions, as their attributes say', () => {
        it('follow aria-checked and aria-disabled as they change, mixed answering false', async () => {
            const { box } = page('<div id="box" role="checkbox"></div>');
            const checked = await watching(box, 'checked', true);
            const disabled = await watching(box, 'disabled', true);

            expect(await checked.after(() => box.setAttribute('aria-checked', 'true'))).toEqual({ watched: true, decided: true });
            expect(await checked.after(() => box.setAttribute('aria-checked', 'mixed'))).toEqual({ watched: false, decided: false });
            expect(await disabled.after(() => box.setAttribute('aria-disabled', 'true'))).toEqual({ watched: true, decided: true });
            expect(await disabled.after(() => box.removeAttribute('aria-disabled'))).toEqual({ watched: false, decided: false });
        });

        it('stay as they are while the native state changes, as the native functions do while the attributes change', async () => {
            const { box } = page('<input id="box" type="checkbox">');
            const aria = await watching(box, 'checked', true);
            const native = await watching(box, 'checked');

            expect(await aria.after(() => userEvent.click(box))).toEqual({ watched: false, decided: false });
            expect(native.watched).toBe(true);
            expect(await native.after(() => box.setAttribute('aria-checked', 'false'))).toEqual({ watched: true, decided: true });
        });
    });

    describe('displayed, as checkVisibility decides', () => {
        it('follows a box hidden and shown by its attributes, its ancestor\'s and its own moves', async () => {
            const { outer, box } = page('<div id="outer"><div id="box" style="height: 10px">x</div></div>');
            const displayed = await watching(box, 'displayed');

            expect(displayed.watched).toBe(true);
            expect(await displayed.after(() => { box.hidden = true; })).toEqual({ watched: false, decided: false });
            expect(await displayed.after(() => { box.hidden = false; })).toEqual({ watched: true, decided: true });
            expect(await displayed.after(() => { outer.style.display = 'none'; })).toEqual({ watched: false, decided: false });
            expect(await displayed.after(() => { outer.style.display = ''; box.remove(); })).toEqual({ watched: false, decided: false });
            expect(await displayed.after(() => document.body.append(box))).toEqual({ watched: true, decided: true });
            expect(await displayed.after(() => { box.style.visibility = 'hidden'; })).toEqual({ watched: true, decided: true });
        });

        it('follows a stylesheet\'s rule hiding a box of a size, through its size, and misses one of no size', async () => {
            const { sized, empty } = page('<div id="sized" style="height: 10px">x</div><div id="empty" style="width: 0"></div>');
            const style = document.head.appendChild(document.createElement('style'));

            try {
                const sizedDisplayed = await watching(sized, 'displayed');
                const emptyDisplayed = await watching(empty, 'displayed');

                expect(await sizedDisplayed.after(() => style.sheet.insertRule('#sized { display: none }'))).toEqual({ watched: false, decided: false });
                expect(await emptyDisplayed.after(() => style.sheet.insertRule('#empty { display: none }'))).toEqual({ watched: true, decided: false });
            } finally {
                style.remove();
            }
        });
    });

    describe('focusable, as HTML\'s focusable areas decide', () => {
        it('answers for the elements focusable by default, those a tabindex makes so, and the disabled, inert, hidden and invisible', () => {
            const markup = {
                button: '<button>b</button>', disabledButton: '<button disabled>b</button>', link: '<a href="#">a</a>', anchor: '<a>a</a>', input: '<input>', hiddenInput: '<input type="hidden">',
                select: '<select></select>', textarea: '<textarea></textarea>', div: '<div>d</div>', tabbable: '<div tabindex="0">d</div>', scripted: '<div tabindex="-1">d</div>', badIndex: '<div tabindex="x">d</div>',
                host: '<div contenteditable>e<b>f</b></div>', summary: '<details><summary>s</summary></details>', video: '<video controls></video>', silentVideo: '<video></video>',
                inert: '<div inert><button>b</button></div>', invisible: '<button style="visibility: hidden">b</button>', undisplayed: '<button style="display: none">b</button>',
            };

            document.body.innerHTML = Object.entries(markup).map(([id, html]) => `<div id="${id}">${html}</div>`).join('');

            const focusable = element => domql.query('e.focusable()', { e: element }).evaluate();
            const answers = Object.fromEntries(Object.keys(markup).map(id => {
                const container = document.getElementById(id);

                return [id, focusable(container.querySelector('summary, #inert button') ?? container.firstElementChild)];
            }));

            expect(answers).toEqual({
                button: true, disabledButton: false, link: true, anchor: false, input: true, hiddenInput: false, select: true, textarea: true, div: false, tabbable: true, scripted: true, badIndex: false,
                host: true, summary: true, video: true, silentVideo: false, inert: false, invisible: false, undisplayed: false,
            });
            expect(focusable(document.querySelector('#host b'))).toBe(false);
            expect(focusable(document.createElement('button'))).toBe(false);
        });

        it('agrees with the browser, which focuses what it answers true for and nothing else', () => {
            document.body.innerHTML = '<button id="a">a</button><div id="b">b</div><div id="c" tabindex="-1">c</div><a id="d">d</a><span contenteditable id="e"><b id="f">f</b></span><input id="g" disabled>';

            for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
                const element = document.getElementById(id);

                element.focus();

                expect(domql.query('e.focusable()', { e: element }).evaluate(), id).toBe(document.activeElement === element);

                element.blur();
            }
        });

        it('follows a tabindex given and taken, and a control disabled', async () => {
            const { box, control } = page('<div id="box">x</div><button id="control">b</button>');
            const boxFocusable = await watching(box, 'focusable');
            const controlFocusable = await watching(control, 'focusable');

            expect(await boxFocusable.after(() => box.setAttribute('tabindex', '-1'))).toEqual({ watched: true, decided: true });
            expect(await boxFocusable.after(() => box.removeAttribute('tabindex'))).toEqual({ watched: false, decided: false });
            expect(await controlFocusable.after(() => { control.disabled = true; })).toEqual({ watched: false, decided: false });
        });
    });

    describe('direction, as :dir() matches', () => {
        it('reads the direction dir gives along its ancestry, a shadow host\'s included', () => {
            const { outer, inner, host } = page('<div id="outer" dir="rtl"><p id="inner"></p></div><div id="host" dir="rtl"></div>');
            const shadowRoot = host.attachShadow({ mode: 'open' });

            shadowRoot.innerHTML = '<p></p>';

            expect(domql.query('{ outer = outer.direction, inner = inner.direction, shadowed = shadowed.direction, body = Domql.document.first("body")?.direction }', { outer, inner, shadowed: shadowRoot.firstElementChild }).evaluate()).toEqual({ outer: 'rtl', inner: 'rtl', shadowed: 'rtl', body: 'ltr' });
        });

        it('follows dir changing on the document element and on an ancestor, and misses the text that decides dir="auto"', async () => {
            const { inner, auto, word } = page('<div id="outer"><p id="inner"></p></div><div dir="auto" id="auto"><span id="word">abc</span></div>');
            const direction = await watchingQuery('e.direction', { e: inner });
            const autoDirection = await watchingQuery('e.direction', { e: auto });

            try {
                expect(await direction.after(() => document.documentElement.setAttribute('dir', 'rtl'))).toEqual({ watched: 'rtl', decided: 'rtl' });
                expect(await direction.after(() => document.getElementById('outer').setAttribute('dir', 'ltr'))).toEqual({ watched: 'ltr', decided: 'ltr' });
                expect(await autoDirection.after(() => { word.firstChild.data = 'שלום'; })).toEqual({ watched: 'ltr', decided: 'rtl' });
            } finally {
                document.documentElement.removeAttribute('dir');
            }
        });
    });

    describe('activeElement, the document\'s focused element', () => {
        it('reads the focused element through open shadow roots, and null where the body has focus', () => {
            const { host, field } = page('<input id="field"><div id="host"></div>');
            const shadowRoot = host.attachShadow({ mode: 'open' });

            shadowRoot.innerHTML = '<input id="inner">';

            const active = () => domql.query('Domql.document.activeElement?["id"]').evaluate();

            expect(active()).toBeNull();

            field.focus();

            expect(active()).toBe('field');

            shadowRoot.getElementById('inner').focus();

            expect(active()).toBe('inner');
        });

        it('follows focus moving, and the focused element removed', async () => {
            const { field, other } = page('<input id="field"><input id="other">');
            const active = await watchingQuery('Domql.document.activeElement?["id"]', {});

            expect(await active.after(() => field.focus())).toEqual({ watched: 'field', decided: 'field' });
            expect(await active.after(() => userEvent.click(other))).toEqual({ watched: 'other', decided: 'other' });
            expect(await active.after(() => other.remove())).toEqual({ watched: null, decided: null });
        });
    });

    describe('popoverOpen, as :popover-open matches', () => {
        it('follows a popover shown and hidden', async () => {
            const { tip } = page('<div id="tip" popover>tip</div>');
            const open = await watching(tip, 'popoverOpen');

            expect(await open.after(() => tip.showPopover())).toEqual({ watched: true, decided: true });
            expect(await open.after(() => tip.hidePopover())).toEqual({ watched: false, decided: false });
        });

        it('follows an open popover whose popover attribute is removed, or that is removed itself', async () => {
            const { tip, other } = page('<div id="tip" popover>tip</div><div id="other" popover>other</div>');
            const open = await watching(tip, 'popoverOpen');
            const otherOpen = await watching(other, 'popoverOpen');

            await open.after(() => tip.showPopover());

            expect(await open.after(() => tip.removeAttribute('popover'))).toEqual({ watched: false, decided: false });

            await otherOpen.after(() => other.showPopover());

            expect(await otherOpen.after(() => other.remove())).toEqual({ watched: false, decided: false });
        });
    });
});
