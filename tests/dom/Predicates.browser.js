import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/**
 * The built-in predicates in a real browser, each asked two ways after every cause: evaluated afresh, which is what the browser decides, and watched, which is what the predicate's observations catch.
 * Where the two agree, the watch caught the change; where only the evaluation moved, the change is one the predicate's contract says a watch misses.
 */
describe('Predicates in a browser', () => {
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

    /** Watches the element's predicate, asked with the verb that asks it, its ARIA predicate where asked, and answers what the watch last reported and what the browser decides now. */
    const watching = async (element, name, isAria = false) => {
        const verb = name === 'focus' || name === 'focus-within' ? 'has' : 'is';
        const text = isAria ? `e.aria.is("${name}")` : `e.${verb}("${name}")`;
        const snapshots = [];
        const watch = domql.query(text, { e: element }).watch({ schedule: 'immediate', acceptPartialObservation: true });

        watch.subscribe('change', (sender, args) => snapshots.push(args.status === 'failed' ? args.error : args.value));
        watches.push(watch);
        await settle();

        return {
            /** What the watch reports and what the browser decides, after the cause has run and the observers have delivered. */
            after: async cause => {
                await cause();
                await settle();

                return { watched: snapshots.at(-1), decided: domql.query(text, { e: element }).evaluate() };
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

    describe('focus and focus-within', () => {
        it('follow focus moving into an element and within it', async () => {
            const { outer, field } = page('<div id="outer"><input id="field"></div><button id="other">x</button>');
            const focus = await watching(field, 'focus');
            const within = await watching(outer, 'focus-within');

            expect(await within.after(() => userEvent.click(field))).toEqual({ watched: true, decided: true });
            expect(focus.watched).toBe(true);
            expect(await within.after(() => userEvent.click(document.getElementById('other')))).toEqual({ watched: false, decided: false });
            expect(focus.watched).toBe(false);
        });

        it('follow the focused element being removed, which moves focus away', async () => {
            const { outer, field } = page('<div id="outer"><input id="field"></div>');
            const within = await watching(outer, 'focus-within');

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

    describe('the ARIA predicates, as their attributes say', () => {
        it('follow aria-checked and aria-disabled as they change, mixed answering false', async () => {
            const { box } = page('<div id="box" role="checkbox"></div>');
            const checked = await watching(box, 'checked', true);
            const disabled = await watching(box, 'disabled', true);

            expect(await checked.after(() => box.setAttribute('aria-checked', 'true'))).toEqual({ watched: true, decided: true });
            expect(await checked.after(() => box.setAttribute('aria-checked', 'mixed'))).toEqual({ watched: false, decided: false });
            expect(await disabled.after(() => box.setAttribute('aria-disabled', 'true'))).toEqual({ watched: true, decided: true });
            expect(await disabled.after(() => box.removeAttribute('aria-disabled'))).toEqual({ watched: false, decided: false });
        });

        it('stay as they are while the native state changes, as the native predicates do while the attributes change', async () => {
            const { box } = page('<input id="box" type="checkbox">');
            const aria = await watching(box, 'checked', true);
            const native = await watching(box, 'checked');

            expect(await aria.after(() => userEvent.click(box))).toEqual({ watched: false, decided: false });
            expect(native.watched).toBe(true);
            expect(await native.after(() => box.setAttribute('aria-checked', 'false'))).toEqual({ watched: true, decided: true });
        });
    });

    describe('popover-open, as :popover-open matches', () => {
        it('follows a popover shown and hidden', async () => {
            const { tip } = page('<div id="tip" popover>tip</div>');
            const open = await watching(tip, 'popover-open');

            expect(await open.after(() => tip.showPopover())).toEqual({ watched: true, decided: true });
            expect(await open.after(() => tip.hidePopover())).toEqual({ watched: false, decided: false });
        });

        it('follows an open popover whose popover attribute is removed, or that is removed itself', async () => {
            const { tip, other } = page('<div id="tip" popover>tip</div><div id="other" popover>other</div>');
            const open = await watching(tip, 'popover-open');
            const otherOpen = await watching(other, 'popover-open');

            await open.after(() => tip.showPopover());

            expect(await open.after(() => tip.removeAttribute('popover'))).toEqual({ watched: false, decided: false });

            await otherOpen.after(() => other.showPopover());

            expect(await otherOpen.after(() => other.remove())).toEqual({ watched: false, decided: false });
        });
    });
});
