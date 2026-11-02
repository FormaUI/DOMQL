/**
 * BrowserExecutionImplementations — the implementations that carry out DOMQL's built-in executions, each the platform call it names, its answer read in DOMQL's terms
 */

import { BrowserVocabularyImplementations } from './BrowserVocabularyImplementations.mjs';

/** How a scroll moves: as the box's `scroll-behavior` decides, at once, or smoothly. */
const SCROLL_BEHAVIORS = new Set(['auto', 'instant', 'smooth']);

/** Where `scrollIntoView` places an element along an axis. */
const SCROLL_ALIGNMENTS = new Set(['start', 'center', 'end', 'nearest']);

/** The logical axes a scroll names, each with the physical axis it is along. */
const LOGICAL_AXES = ['inline', 'block'];

export class BrowserExecutionImplementations {
    /**
     * Each implementation reads, from one object by name, the receiver, the arguments by parameter name, the environment the request is carried out in and the signal that aborts it, and answers its result or a
     * promise of it.
     * @type {Record<string, (input: { receiver: unknown, args: Record<string, any>, env: { window: Window, document: Document }, signal?: AbortSignal }) => unknown>}
     */
    static get implementations() {
        return {
            // Focusing answers whether focus landed on the element, as its focus() Boolean function reads it.
            takeFocus: ({ receiver: element, args: { preventScroll } }) => {
                element.focus({ preventScroll });

                return element.getRootNode().activeElement === element;
            },
            scrollTo: ({ receiver: element, args, signal }) => BrowserExecutionImplementations.#scroll(BrowserExecutionImplementations.#elementScroller(element), args, 'scrollTo', signal),
            scrollBy: ({ receiver: element, args, signal }) => BrowserExecutionImplementations.#scroll(BrowserExecutionImplementations.#elementScroller(element), args, 'scrollBy', signal),
            windowScrollTo: ({ receiver: window, args, signal }) => BrowserExecutionImplementations.#scroll(BrowserExecutionImplementations.#windowScroller(window), args, 'scrollTo', signal),
            windowScrollBy: ({ receiver: window, args, signal }) => BrowserExecutionImplementations.#scroll(BrowserExecutionImplementations.#windowScroller(window), args, 'scrollBy', signal),
            scrollIntoView: ({ receiver: element, args, signal }) => BrowserExecutionImplementations.#scrollIntoView(element, args, signal),
        };
    }

    /**
     * What scrolling an element reads and calls: the element, which the scroll methods are called on, its position along each physical axis, its sign included, and the element whose writing mode and direction place
     * its scroll origin, itself.
     */
    static #elementScroller(element) {
        return { target: element, window: element.ownerDocument.defaultView, position: () => ({ left: element.scrollLeft, top: element.scrollTop }), placedBy: element };
    }

    /** What scrolling the window reads and calls: the window, its position, and the document's root element, whose writing mode and direction place the viewport's scroll origin, as its `scroll` reads them. */
    static #windowScroller(window) {
        return { target: window, window, position: () => ({ left: window.scrollX, top: window.scrollY }), placedBy: window.document.documentElement };
    }

    /**
     * Each logical axis of a box, the physical one it is along, and whether the browser counts its position down from 0, as it does where the box's scroll origin lies at its right or its bottom: under RTL, and in a
     * writing mode whose lines or blocks run that way. A position already below 0 says so whatever the box's style, as in a reversed flex container.
     */
    static #axesOf(scroller) {
        const { placedBy, window } = scroller;
        const position = scroller.position();
        const style = window.getComputedStyle(placedBy);
        const vertical = BrowserVocabularyImplementations.isVertical(placedBy);
        const rtl = style.direction === 'rtl';
        const reversed = { left: position.left < 0 || (vertical ? /-rl$/.test(style.writingMode) : rtl), top: position.top < 0 || (vertical && (style.writingMode === 'sideways-lr' ? !rtl : rtl)) };
        const along = name => ({ name, reversed: reversed[name] });

        return vertical ? { inline: along('top'), block: along('left') } : { inline: along('left'), block: along('top') };
    }

    /** A scroll's behavior, which it refuses where it is none a scroll takes. */
    static #behaviorOf(behavior) {
        if (!SCROLL_BEHAVIORS.has(behavior)) {
            throw new Error(`${JSON.stringify(behavior)} is no scroll behavior: a scroll is "auto", as the box's scroll-behavior decides, "instant" or "smooth"`);
        }

        return behavior;
    }

    /**
     * Scrolls the box to the offsets given along its logical axes, or by them, each axis left out where it is null, and answers whether its position moved, once the scroll has ended.
     * @param {{ target: Element | Window, window: Window, position: () => { left: number, top: number }, placedBy: Element }} scroller
     * @param {{ inline: number | null, block: number | null, behavior: string }} args
     * @param {'scrollTo' | 'scrollBy'} method
     * @param {AbortSignal | undefined} signal
     */
    static async #scroll(scroller, { inline, block, behavior }, method, signal) {
        const options = { behavior: BrowserExecutionImplementations.#behaviorOf(behavior) };
        const axes = BrowserExecutionImplementations.#axesOf(scroller);

        for (const [axis, value] of LOGICAL_AXES.map(name => [name, name === 'inline' ? inline : block])) {
            if (value !== null) {
                options[axes[axis].name] = axes[axis].reversed ? -value : value;
            }
        }

        const before = scroller.position();

        await BrowserExecutionImplementations.#ended(scroller.window, scroller.target[method](options), scroller.position, signal);

        const after = scroller.position();

        return after.left !== before.left || after.top !== before.top;
    }

    /** Scrolls the element into view, aligned as given, and answers whether it is in view once the scroll has ended. */
    static async #scrollIntoView(element, { block, inline, behavior }, signal) {
        for (const alignment of [block, inline]) {
            if (!SCROLL_ALIGNMENTS.has(alignment)) {
                throw new Error(`${JSON.stringify(alignment)} is no alignment: an element is scrolled into view at the "start", the "center" or the "end", or the "nearest" edge`);
            }
        }

        const options = { block, inline, behavior: BrowserExecutionImplementations.#behaviorOf(behavior) };
        const placement = () => {
            const box = element.getBoundingClientRect();

            return { left: box.left, top: box.top };
        };

        await BrowserExecutionImplementations.#ended(element.ownerDocument.defaultView, element.scrollIntoView(options), placement, signal);

        return BrowserExecutionImplementations.#isInView(element);
    }

    /**
     * Waits until the scroll has ended: for the promise the browser's scroll method answers, where it answers one, and otherwise for the first animation frame, from the third on, in which what the scroll moves
     * holds still, since a smooth scroll begins to move a frame or two after it is asked; a signal that aborts stops the waiting.
     */
    static async #ended(window, answer, read, signal) {
        if (typeof answer?.then === 'function') {
            await answer;

            return;
        }

        let last = read();

        for (let frames = 1; signal?.aborted !== true; frames++) {
            await new Promise(resolve => window.requestAnimationFrame(resolve));

            const next = read();

            if (frames >= 3 && next.left === last.left && next.top === last.top) {
                return;
            }

            last = next;
        }
    }

    /**
     * Whether the element is in view: its border box overlaps the layout viewport and the padding box of every ancestor along its flat tree that clips its overflow, as `overlaps` compares boxes; false where it has
     * no layout box. The root element, and the body while the root's overflow is visible, give their overflow to the viewport, so the viewport stands for them.
     */
    static #isInView(element) {
        const box = BrowserVocabularyImplementations.boxOf(element);

        if (box === null) {
            return false;
        }

        const { documentElement, body, defaultView: window } = element.ownerDocument;
        const overlaps = other => box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom;

        if (!overlaps({ left: 0, top: 0, right: documentElement.clientWidth, bottom: documentElement.clientHeight })) {
            return false;
        }

        const rootStyle = window.getComputedStyle(documentElement);
        const bodyPropagates = rootStyle.overflowX === 'visible' && rootStyle.overflowY === 'visible';

        for (let current = BrowserVocabularyImplementations.flatParentOf(element); current !== null && current !== documentElement; current = BrowserVocabularyImplementations.flatParentOf(current)) {
            const style = window.getComputedStyle(current);
            const visible = style.overflowX === 'visible' && style.overflowY === 'visible';
            const clip = visible || (current === body && bodyPropagates) ? null : BrowserVocabularyImplementations.clientRectOf(current);

            if (clip !== null && !overlaps(clip)) {
                return false;
            }
        }

        return true;
    }
}
