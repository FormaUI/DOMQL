/**
 * BrowserExecutionImplementations — the implementations that carry out DOMQL's built-in executions, each the platform call it names, its answer read in DOMQL's terms
 */

import { BrowserVocabularyImplementations } from './BrowserVocabularyImplementations.mjs';
import { OwnedWrites } from './OwnedWrites.mjs';

/** How a scroll moves: as the box's `scroll-behavior` decides, at once, or smoothly. */
const SCROLL_BEHAVIORS = new Set(['auto', 'instant', 'smooth']);

/** Where `scrollIntoView` places an element along an axis. */
const SCROLL_ALIGNMENTS = new Set(['start', 'center', 'end', 'nearest']);

/** The logical axes a scroll names, each with the physical axis it is along. */
const LOGICAL_AXES = ['inline', 'block'];

/** The media elements, which play. */
const MEDIA_ELEMENTS = new Set(['audio', 'video']);

/** How long a download's object URL is kept, in milliseconds, once the browser has been asked to download it. */
const DOWNLOAD_URL_LIFETIME = 60_000;

/** The elements whose value the user edits, and the page's code writes. */
const VALUE_ELEMENTS = new Set(['input', 'textarea', 'select']);

export class BrowserExecutionImplementations {
    /**
     * Each implementation reads, from one object by name, the receiver, the arguments by parameter name, the environment the request is carried out in, and the signal that aborts a once execution or the reporting a
     * continuous one's failures reach; a once execution answers its result or a promise of it, and a continuous one what updates and ends it. The owned writes of one set of implementations share the targets they hold.
     * @type {Record<string, (input: { receiver: unknown, args: Record<string, any>, env: { window: Window, document: Document }, signal?: AbortSignal, reportError?: (error: unknown) => void }) => unknown>}
     */
    static get implementations() {
        const writes = new OwnedWrites();
        const own = (targetOf, valueOf) => ({ receiver: element, args, reportError }) => BrowserExecutionImplementations.#own(writes, element, args, targetOf, valueOf, reportError);

        return {
            // An event of the page's own, a custom event any listener may cancel, answering whether one did.
            dispatch: ({ receiver: target, args: { type, bubbles, detail } }) => {
                const { CustomEvent } = target.ownerDocument?.defaultView ?? target.defaultView ?? target;

                return !target.dispatchEvent(new CustomEvent(type, { bubbles, cancelable: true, detail }));
            },

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

            // A pointer's capture: whether the element holds it afterwards, and whether it let go of one it held.
            capturePointer: ({ receiver: element, args: { pointerId } }) => BrowserExecutionImplementations.#capturePointer(element, pointerId),
            releasePointer: ({ receiver: element, args: { pointerId } }) => BrowserExecutionImplementations.#toggle(element, () => element.hasPointerCapture(pointerId), false, () => element.releasePointerCapture(pointerId)),

            // A media element's playback: how the browser took the request to play, and whether pausing or muting changed it.
            play: ({ receiver: element }) => BrowserExecutionImplementations.#play(element),
            pause: ({ receiver: element }) => MEDIA_ELEMENTS.has(element.localName) && BrowserExecutionImplementations.#toggle(element, () => element.paused, true, () => element.pause()),
            writeMuted: ({ receiver: element, args: { muted } }) => MEDIA_ELEMENTS.has(element.localName) && BrowserExecutionImplementations.#toggle(element, () => element.muted, muted, () => { element.muted = muted; }),

            // The browser's facilities, each answering how the browser took the request.
            writeClipboard: ({ receiver: window, args: { text } }) => BrowserExecutionImplementations.#outcomeOf(window.navigator.clipboard?.writeText?.bind(window.navigator.clipboard), [text], 'written'),
            readClipboard: ({ receiver: window, args: { types } }) => BrowserExecutionImplementations.#readClipboard(window.navigator.clipboard, types),
            download: ({ receiver: window, args }) => BrowserExecutionImplementations.#download(window, args),
            print: ({ receiver: window }) => {
                window.print();
            },
            requestShare: ({ receiver: window, args }) => {
                const data = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null));

                return BrowserExecutionImplementations.#outcomeOf(window.navigator.share?.bind(window.navigator), [data], 'shared', { AbortError: 'canceled', TypeError: 'invalid', DataError: 'invalid' });
            },

            // A form control's state, as the page's code writes it, which fires no event.
            writeIndeterminate: ({ receiver: element, args: { indeterminate } }) => {
                if (element.localName !== 'input' || element.type !== 'checkbox' || element.indeterminate === indeterminate) {
                    return false;
                }

                element.indeterminate = indeterminate;

                return true;
            },
            writeValue: ({ receiver: element, args: { value } }) => {
                if (!VALUE_ELEMENTS.has(element.localName)) {
                    return null;
                }

                const replaced = element.value;

                element.value = value;

                return replaced;
            },
            writeSelection: ({ receiver: element, args: { start, end } }) => BrowserExecutionImplementations.#select(element, start, end),

            // The writes DOMQL owns while they run, each holding its target at its value.
            ownAttribute: own((element, { name }) => OwnedWrites.attribute(element, name), ({ value }) => value),
            ownClass: own((element, { name }) => OwnedWrites.class(element, name), ({ present }) => present),
            ownStyle: own((element, { property }) => OwnedWrites.style(element, property), ({ value }) => value),

            // The top layer: each answers whether it changed the element's state, and false where the element is in that state already, which the platform's calls leave as it is.
            showPopover: ({ receiver: element }) => BrowserExecutionImplementations.#toggle(element, () => element.matches(':popover-open'), true, () => element.showPopover()),
            hidePopover: ({ receiver: element }) => BrowserExecutionImplementations.#toggle(element, () => element.matches(':popover-open'), false, () => element.hidePopover()),
            showModal: ({ receiver: element }) => BrowserExecutionImplementations.#toggle(BrowserExecutionImplementations.#dialog(element), () => element.matches(':modal'), true, () => element.showModal()),
            closeDialog: ({ receiver: element, args: { returnValue } }) => BrowserExecutionImplementations.#toggle(BrowserExecutionImplementations.#dialog(element), () => element.open, false, () => (returnValue === null ? element.close() : element.close(returnValue))),
        };
    }

    /**
     * Places the selection of a text control at the offsets, or the document's selection at those offsets in the text of an element whose content is editable, as `selection` reads each; an offset past the end is held
     * at the end and a start after the end moved to it. Answers whether it placed it: not for an element whose selection the browser does not expose.
     */
    static #select(element, start, end) {
        if (element.localName === 'input' || element.localName === 'textarea') {
            try {
                element.setSelectionRange(start, end);
            } catch (error) {
                // An input of a type the selection API excludes, as number or email, exposes no selection.
                if (error?.name !== 'InvalidStateError') {
                    throw error;
                }

                return false;
            }

            return element.selectionStart !== null;
        }

        if (!element.isContentEditable) {
            return false;
        }

        const document = element.ownerDocument;
        const selection = document.getSelection();

        if (selection === null) {
            return false;
        }

        const range = document.createRange();
        const length = element.textContent.length;
        const to = Math.max(0, Math.min(end, length));
        const from = Math.max(0, Math.min(start, to));

        range.setStart(...BrowserExecutionImplementations.#pointIn(element, from));
        range.setEnd(...BrowserExecutionImplementations.#pointIn(element, to));
        selection.removeAllRanges();
        selection.addRange(range);

        return true;
    }

    /** The node and offset of a point in the element's text, the offset counted in its text nodes in document order, as `text` joins them; the element's end where it holds no text. */
    static #pointIn(element, offset) {
        const walker = element.ownerDocument.createTreeWalker(element, 4);
        let passed = 0;
        let last = null;

        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            if (offset <= passed + node.data.length) {
                return [node, offset - passed];
            }

            passed += node.data.length;
            last = node;
        }

        return last === null ? [element, element.childNodes.length] : [last, last.data.length];
    }

    /**
     * Asks the browser for a facility, and answers how it took the request: the outcome given where it does what was asked; `"refused"` where it refuses, as without the user's activation or a permission; `"unsupported"`
     * where it offers no such facility; an outcome of its own for an error the facility names one for; and `"failed"` for any other error.
     */
    static async #outcomeOf(facility, args, outcome, outcomesByError = {}) {
        if (typeof facility !== 'function') {
            return 'unsupported';
        }

        try {
            await facility(...args);
        } catch (error) {
            const name = error?.name;

            return outcomesByError[name] ?? (name === 'NotAllowedError' || name === 'SecurityError' ? 'refused' : 'failed');
        }

        return outcome;
    }

    /** Reads the clipboard's content of each format asked for, as text, in the order asked, from the first of its items that holds it; where the browser reads no items, its text alone serves `text/plain`. */
    static async #readClipboard(clipboard, types) {
        const entries = [];

        if (typeof clipboard?.read === 'function') {
            const outcome = await BrowserExecutionImplementations.#outcomeOf(async () => {
                const items = await clipboard.read();

                for (const type of types) {
                    const item = items.find(candidate => candidate.types.includes(type));

                    if (item !== undefined) {
                        entries.push({ type, text: await (await item.getType(type)).text() });
                    }
                }
            }, [], 'read');

            return { outcome, entries: outcome === 'read' ? entries : [] };
        }

        if (typeof clipboard?.readText !== 'function') {
            return { outcome: 'unsupported', entries };
        }

        if (!types.includes('text/plain')) {
            return { outcome: 'read', entries };
        }

        const outcome = await BrowserExecutionImplementations.#outcomeOf(async () => {
            entries.push({ type: 'text/plain', text: await clipboard.readText() });
        }, [], 'read');

        return { outcome, entries: outcome === 'read' ? entries : [] };
    }

    /** Has the browser download the text as a file of the name and the media type given, through an object URL kept until the browser has begun the download. */
    static #download(window, { name, content, type }) {
        const url = window.URL.createObjectURL(new window.Blob([content], { type }));
        const link = window.document.createElement('a');

        link.href = url;
        link.download = name;
        link.hidden = true;
        window.document.body.append(link);

        try {
            link.click();
        } finally {
            link.remove();
            window.setTimeout(() => window.URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME);
        }
    }

    /** Plays a media element, and answers how the browser took the request: `"playing"`, `"blocked"` where its autoplay policy refuses, `"aborted"` where a pause or a new source interrupts it, and `"unsupported"` where it can play no source it has, or the element is no media element. */
    static async #play(element) {
        if (!MEDIA_ELEMENTS.has(element.localName)) {
            return 'unsupported';
        }

        try {
            await element.play();
        } catch (error) {
            switch (error?.name) {
                case 'NotAllowedError':
                    return 'blocked';
                case 'AbortError':
                    return 'aborted';
                case 'NotSupportedError':
                    return 'unsupported';
                default:
                    throw error;
            }
        }

        return 'playing';
    }

    /** Starts an owned write of the target its arguments name on the element, at the value they give, and answers what updates it to other arguments, on this element or another, and ends it. */
    static #own(writes, element, args, targetOf, valueOf, reportError) {
        const optionsOf = given => ({ value: valueOf(given), restore: given.restore, keep: given.keep });
        const holding = writes.hold(targetOf(element, args), optionsOf(args), reportError);

        return { update: (receiver, next) => holding.update(targetOf(receiver, next), optionsOf(next)), dispose: () => holding.dispose() };
    }

    /** Brings the element into the state it is in where `isIn` answers `wanted`, and answers whether it did: false where it was in that state already, or a listener, as a beforetoggle one, kept it from changing. */
    static #toggle(element, isIn, wanted, change) {
        if (isIn() === wanted) {
            return false;
        }

        change();

        return isIn() === wanted;
    }

    /** Sets the capture of the pointer to the element, and answers whether it holds it: not for a pointer that is not active, or an element in no document, which the browser refuses. */
    static #capturePointer(element, pointerId) {
        try {
            element.setPointerCapture(pointerId);
        } catch (error) {
            if (error?.name !== 'NotFoundError' && error?.name !== 'InvalidStateError') {
                throw error;
            }
        }

        return element.hasPointerCapture(pointerId);
    }

    /** The element, where it is a dialog, which it refuses otherwise. */
    static #dialog(element) {
        if (element.localName !== 'dialog') {
            throw new Error(`A ${element.localName} element is no dialog, which alone opens modally and closes`);
        }

        return element;
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
