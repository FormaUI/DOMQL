/**
 * BrowserVocabularyImplementations — the implementations that carry out the DOM vocabulary's members
 */

/** The input types `readonly` applies to. */
const READ_ONLY_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'date', 'month', 'week', 'time', 'datetime-local', 'number']);

/** The input types that take text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/** The values of `contenteditable` that make content editable. */
const EDITABLE_VALUES = new Set(['', 'true', 'plaintext-only']);

/** The values of `overflow` along an axis that let the user scroll it. */
const USER_SCROLLABLE = new Set(['auto', 'scroll']);

/** The axes `scrollContainer` takes, by name. */
const AXES = new Set(['inline', 'block']);

/** The elements focusable by default where they are enabled, as HTML's focusable areas name them, beside those with a condition of their own: a link, a summary, a media element and an editing host. */
const FOCUSABLE_ELEMENTS = new Set(['button', 'select', 'textarea', 'iframe']);

/** The elements whose value the user edits. */
const VALUE_ELEMENTS = new Set(['input', 'textarea', 'select']);

/** The media elements. */
const MEDIA_ELEMENTS = new Set(['audio', 'video']);

/** A `tabindex` that HTML's rules for parsing integers read as an integer. */
const TAB_INDEX = /^[\t\n\f\r ]*[-+]?[0-9]/;

export class BrowserVocabularyImplementations {
    /**
     * Each implementation reads, from one object by name, the receiver, the arguments by parameter name and the environment the request is read in; a maintained member also its samples, and a source the function it delivers each event to, answering what stops it.
     * @type {Record<string, (input: { receiver: unknown, args: Record<string, any>, env: { window: Window, document: Document }, samples?: unknown[], deliver?: (event: unknown) => void }) => unknown>}
     */
    static get implementations() {
        return {
            document: ({ env }) => env.document,
            window: ({ env }) => env.window,
            windowSize: ({ receiver: window }) => {
                const documentElement = window.document.documentElement;

                return { width: documentElement.clientWidth, height: documentElement.clientHeight };
            },
            devicePixelRatio: ({ receiver: window }) => window.devicePixelRatio,
            // The property reads the rectangle against the layout viewport, and rectRelativeTo against the element it is given.
            rect: ({ receiver: element, args: { relativeTo = null } }) => BrowserVocabularyImplementations.#rect(element, relativeTo),
            size: ({ receiver: element }) => {
                const rect = BrowserVocabularyImplementations.#box(element);

                return rect === null ? null : { width: rect.width, height: rect.height };
            },
            clientSize: ({ receiver: element }) => BrowserVocabularyImplementations.#hasBox(element) ? { width: element.clientWidth, height: element.clientHeight } : null,
            clientRect: ({ receiver: element }) => BrowserVocabularyImplementations.#clientRect(element),
            scroll: ({ receiver: element }) => BrowserVocabularyImplementations.#hasBox(element) ? BrowserVocabularyImplementations.#scroll(element, element, element) : null,
            windowScroll: ({ receiver: window }) => {
                const root = window.document.documentElement;
                const area = window.document.scrollingElement ?? root;

                return BrowserVocabularyImplementations.#scroll(root, { scrollLeft: window.scrollX, scrollTop: window.scrollY, scrollWidth: area.scrollWidth, scrollHeight: area.scrollHeight }, root);
            },
            scrollContainer: ({ receiver: element, args: { axis } }) => BrowserVocabularyImplementations.#scrollContainer(element, axis),
            grid: ({ receiver: element }) => BrowserVocabularyImplementations.#hasBox(element) ? { columns: BrowserVocabularyImplementations.#columns(element) } : null,
            selection: ({ receiver: element }) => BrowserVocabularyImplementations.#selection(element),
            children: ({ receiver: node }) => [...node.children],
            parent: ({ receiver: node }) => node.parentNode ?? null,
            root: ({ receiver: node }) => node.getRootNode(),
            host: ({ receiver: node }) => (node.nodeType === 11 && node.host !== undefined ? node.host : null),
            shadow: ({ receiver: element }) => element,
            aria: ({ receiver: element }) => element,
            ariaChecked: ({ receiver: element }) => BrowserVocabularyImplementations.#isAriaTrue(element, 'aria-checked'),
            ariaDisabled: ({ receiver: element }) => BrowserVocabularyImplementations.#isAriaTrue(element, 'aria-disabled'),
            shadowRoot: ({ receiver: element }) => element.shadowRoot ?? null,
            assignedElements: ({ receiver: element }) => (typeof element.assignedElements === 'function' ? element.assignedElements({ flatten: true }) : null),

            media: ({ receiver: window, args: { query } }) => window.matchMedia(query).matches,
            supportsShare: ({ receiver: window }) => typeof window.navigator.share === 'function',
            supportsClipboard: ({ receiver: window }) => window.navigator.clipboard !== undefined,
            attribute: ({ receiver: element, args: { name } }) => element.getAttribute(name),
            // The ARIA view's attribute of the name, the element's own attribute `aria-` and the name, read as the attribute indexer reads it.
            ariaAttribute: ({ receiver: element, args: { name } }) => element.getAttribute(`aria-${name}`),
            // A class is one token, as a class list takes one: never empty, and holding none of the ASCII whitespace that separates its tokens.
            class: ({ receiver: element, args: { name } }) => {
                if (name === '' || /[\t\n\f\r ]/.test(name)) {
                    throw new Error(`${JSON.stringify(name)} is no class, which is one token: never empty, and holding no tab, line feed, form feed, carriage return or space`);
                }

                return element.classList.contains(name);
            },
            style: ({ receiver: element, args: { property } }) => {
                if (!element.isConnected) {
                    return null;
                }

                const value = element.ownerDocument.defaultView.getComputedStyle(element).getPropertyValue(property).trim();

                return value === '' ? null : value;
            },
            intersects: ({ samples: [isIntersecting] }) => isIntersecting,
            overlaps: ({ receiver: element, args: { other, margin } }) => BrowserVocabularyImplementations.#overlaps(element, other, margin),
            matches: ({ receiver: element, args: { selector } }) => element.matches(selector),
            closest: ({ receiver: element, args: { selector } }) => element.closest(selector),
            firstMatching: ({ receiver: node, args: { selector } }) => node.querySelector(selector),
            all: ({ receiver: node, args: { selector } }) => [...node.querySelectorAll(selector)],
            on: ({ receiver: target, args: { type }, deliver }) => {
                // Listening observes each event as it reaches the target, and a passive listener leaves its course to the page.
                target.addEventListener(type, deliver, { passive: true });

                return { stop: () => target.removeEventListener(type, deliver) };
            },

            attached: ({ receiver: element }) => element.isConnected,
            disabled: ({ receiver: element }) => element.matches(':disabled'),
            readOnly: ({ receiver: element }) => BrowserVocabularyImplementations.#isReadOnly(element),
            textEditable: ({ receiver: element }) => BrowserVocabularyImplementations.#isTextEditable(element),
            focused: ({ receiver: element }) => element.getRootNode().activeElement === element,
            focusWithin: ({ receiver: element }) => element.matches(':focus-within'),
            displayed: ({ receiver: element }) => element.isConnected && element.checkVisibility(),
            indeterminate: ({ receiver: element }) => element.matches(':indeterminate'),
            autofilled: ({ receiver: element }) => BrowserVocabularyImplementations.#isAutofilled(element),
            localName: ({ receiver: element }) => element.localName,
            classes: ({ receiver: element }) => [...element.classList],
            text: ({ receiver: element }) => element.textContent,
            html: ({ receiver: element }) => element.innerHTML,
            value: ({ receiver: element }) => (VALUE_ELEMENTS.has(element.localName) ? element.value : null),
            playback: ({ receiver: element }) => BrowserVocabularyImplementations.#playback(element),
            inlineStyle: ({ receiver: element, args: { property } }) => element.style.getPropertyValue(property) || null,
            focusable: ({ receiver: element }) => BrowserVocabularyImplementations.#isFocusable(element),
            direction: ({ receiver: element }) => (element.matches(':dir(rtl)') ? 'rtl' : 'ltr'),
            activeElement: ({ receiver: document }) => BrowserVocabularyImplementations.#activeElement(document),
            hover: ({ receiver: element }) => element.matches(':hover'),
            popoverOpen: ({ receiver: element }) => element.matches(':popover-open'),
            checked: ({ receiver: element }) => element.matches(':checked'),
            visible: ({ receiver: document }) => document.visibilityState === 'visible',
            hasChildren: ({ receiver: element }) => element.childElementCount > 0,
            hasSelection: ({ receiver: element }) => BrowserVocabularyImplementations.#hasSelection(element),
            hasFocus: ({ receiver: document }) => document.hasFocus(),
        };
    }

    /** Whether the element's own ARIA attribute of the name is `true`, compared ignoring ASCII case as ARIA's token values are, so a missing attribute, `false`, `mixed` and any other value answer false. */
    static #isAriaTrue(element, name) {
        return element.getAttribute(name)?.toLowerCase() === 'true';
    }

    /** Whether the element has a layout box: it is attached and the browser generates a box for it, which it does not for `display: none` or `display: contents`. A box of no size is still a box. */
    static #hasBox(element) {
        return element.isConnected && element.getClientRects().length > 0;
    }

    /**
     * The element's border box, or null where it has no layout box. Its client rects answer both for nearly every element: none where it has no box, and one that is its bounding box
     * where it is laid out whole; an element split into several, as an inline one across lines, asks the browser for the box that bounds them.
     */
    static #box(element) {
        if (!element.isConnected) {
            return null;
        }

        const rects = element.getClientRects();

        if (rects.length === 0) {
            return null;
        }

        return rects.length === 1 ? rects[0] : element.getBoundingClientRect();
    }

    /** Its padding box without scrollbars, relative to the layout viewport: its border box moved in by its left and top borders, as `clientLeft` and `clientTop` give them, and of its client size. */
    static #clientRect(element) {
        const box = BrowserVocabularyImplementations.#box(element);

        if (box === null) {
            return null;
        }

        const left = box.left + element.clientLeft;
        const top = box.top + element.clientTop;
        const { clientWidth: width, clientHeight: height } = element;

        return { left, top, right: left + width, bottom: top + height, width, height };
    }

    /** Whether the element's writing mode lays its lines out vertically, which makes its inline axis vertical and its block axis horizontal. */
    static #isVertical(element) {
        return /^(vertical|sideways)/.test(element.ownerDocument.defaultView.getComputedStyle(element).writingMode);
    }

    /**
     * How far a box is scrolled along each logical axis of the element's writing mode: each offset its scroll position without its sign, which the browser gives below 0 where its scroll origin lies at the right or the
     * bottom, as under RTL; its extent, of the scrolling area; and its viewport, of the scrollport.
     * @param {Element} element Whose writing mode names the axes.
     * @param {{ scrollLeft: number, scrollTop: number, scrollWidth: number, scrollHeight: number }} position The scroll position and the scrolling area.
     * @param {{ clientWidth: number, clientHeight: number }} port The scrollport.
     */
    static #scroll(element, position, port) {
        const horizontal = { offset: Math.abs(position.scrollLeft), extent: position.scrollWidth, viewport: port.clientWidth };
        const vertical = { offset: Math.abs(position.scrollTop), extent: position.scrollHeight, viewport: port.clientHeight };

        return BrowserVocabularyImplementations.#isVertical(element) ? { inline: vertical, block: horizontal } : { inline: horizontal, block: vertical };
    }

    /**
     * The nearest of the element's flat-tree ancestors the user can scroll along the axis, of the element's writing mode, or either axis; null where none is.
     * The root element and, while the root's overflow is visible, the body, give their overflow to the viewport, so neither is answered.
     */
    static #scrollContainer(element, axis) {
        if (axis !== null && !AXES.has(axis)) {
            throw new Error(`${JSON.stringify(axis)} is no axis: an axis is "inline" or "block", and either is taken where it is omitted or null`);
        }

        const window = element.ownerDocument.defaultView;
        const { documentElement, body } = element.ownerDocument;
        const physical = axis === null ? null : (axis === 'inline') !== BrowserVocabularyImplementations.#isVertical(element) ? 'overflowX' : 'overflowY';
        const isScrollable = style => (physical === null ? USER_SCROLLABLE.has(style.overflowX) || USER_SCROLLABLE.has(style.overflowY) : USER_SCROLLABLE.has(style[physical]));

        for (let current = BrowserVocabularyImplementations.#flatParentOf(element); current !== null; current = BrowserVocabularyImplementations.#flatParentOf(current)) {
            if (current === documentElement) {
                return null;
            }

            if (current === body && BrowserVocabularyImplementations.#propagatesOverflow(window, documentElement)) {
                continue;
            }

            if (isScrollable(window.getComputedStyle(current))) {
                return current;
            }
        }

        return null;
    }

    /** Whether the root element's overflow is visible on both axes, which gives the body's overflow to the viewport. */
    static #propagatesOverflow(window, documentElement) {
        const style = window.getComputedStyle(documentElement);

        return style.overflowX === 'visible' && style.overflowY === 'visible';
    }

    /** The element's parent in the flat tree: the slot it is assigned to, or the host of the shadow root it stands in, or its parent element; null at the top. */
    static #flatParentOf(element) {
        const parent = element.assignedSlot ?? element.parentNode;

        // A shadow root is a document fragment with a host, where the flat tree continues.
        if (parent?.nodeType === 11 && parent.host !== undefined) {
            return parent.host;
        }

        return parent?.nodeType === 1 ? parent : null;
    }

    static #rect(element, relativeTo) {
        const box = BrowserVocabularyImplementations.#box(element);

        if (box === null) {
            return null;
        }

        const origin = relativeTo === null ? { left: 0, top: 0 } : BrowserVocabularyImplementations.#box(relativeTo);

        if (origin === null) {
            return null;
        }

        const left = box.left - origin.left;
        const top = box.top - origin.top;

        return { left, top, right: left + box.width, bottom: top + box.height, width: box.width, height: box.height };
    }

    static #overlaps(element, other, margin) {
        const first = BrowserVocabularyImplementations.#box(element);
        const second = BrowserVocabularyImplementations.#box(other);

        if (first === null || second === null) {
            return null;
        }

        return first.left - margin < second.right && second.left < first.right + margin && first.top - margin < second.bottom && second.top < first.bottom + margin;
    }

    /** The sizes of the element's grid column tracks, an empty list for an element that is no grid. */
    static #columns(element) {
        const style = element.ownerDocument.defaultView.getComputedStyle(element);

        if (!/grid/.test(style.display)) {
            return [];
        }

        return style.gridTemplateColumns.split(/\s+/).map(track => Number.parseFloat(track)).filter(size => Number.isFinite(size));
    }

    /** The start and end of the selection of a text input or text area, or null for any other element. */
    static #selection(element) {
        const start = BrowserVocabularyImplementations.#range(element);

        return start === null ? null : { start: start[0], end: start[1] };
    }

    static #range(element) {
        if (!BrowserVocabularyImplementations.#isTextControl(element)) {
            return null;
        }

        try {
            const { selectionStart, selectionEnd } = element;

            return selectionStart === null || selectionEnd === null ? null : [selectionStart, selectionEnd];
        } catch {
            return null;
        }
    }

    static #isTextControl(element) {
        return element.localName === 'textarea' || element.localName === 'input';
    }

    static #isReadOnly(element) {
        if (element.localName === 'textarea') {
            return element.readOnly;
        }

        return element.localName === 'input' && READ_ONLY_INPUT_TYPES.has(element.type) && element.readOnly;
    }

    static #isTextEditable(element) {
        if (BrowserVocabularyImplementations.#isUnderInert(element)) {
            return false;
        }

        if (BrowserVocabularyImplementations.#isTextControl(element)) {
            const isText = element.localName === 'textarea' || TEXT_INPUT_TYPES.has(element.type);

            return isText && !element.matches(':disabled') && !element.readOnly;
        }

        return BrowserVocabularyImplementations.#isContentEditable(element);
    }

    /**
     * Whether the element or an ancestor of it in the flat tree has the `inert` attribute: through the slot each is assigned to and the host above each shadow root.
     * A slot in a closed shadow root hides its assignment, so an inert ancestor past it is found only from an element inside that root.
     */
    static #isUnderInert(element) {
        for (let current = element; current !== null; current = BrowserVocabularyImplementations.#flatParentOf(current)) {
            if (current.hasAttribute('inert')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether the element's content is editable by the nearest `contenteditable` of a state, its own or an ancestor's, `true`, an empty value or `plaintext-only` making it so and `false` not,
     * an invalid value, `inherit` among them, inheriting as the attribute does natively, or otherwise by the document's design mode.
     */
    static #isContentEditable(element) {
        for (let current = element; current !== null; current = current.parentElement) {
            const value = current.getAttribute('contenteditable')?.toLowerCase();

            if (value === 'false') {
                return false;
            }

            if (EDITABLE_VALUES.has(value)) {
                return true;
            }
        }

        return element.ownerDocument.designMode === 'on';
    }

    /** Whether the browser has filled the field, as `:autofill` matches, or the prefixed `:-webkit-autofill` in a browser that knows no other. */
    static #isAutofilled(element) {
        try {
            return element.matches(':autofill');
        } catch {
            return element.matches(':-webkit-autofill');
        }
    }

    /** The playback of a media element, or null for any other element: its duration null until it is known, and for a stream without an end. */
    static #playback(element) {
        if (!MEDIA_ELEMENTS.has(element.localName)) {
            return null;
        }

        const { paused, muted, ended, currentTime, duration, volume } = element;

        return { paused, muted, ended, currentTime, duration: Number.isFinite(duration) ? duration : null, volume };
    }

    /** The focused element of the document, through each open shadow root a focused host holds, or null where the document reports none, its body or its root element. */
    static #activeElement(document) {
        let active = document.activeElement;

        if (active === null || active === document.body || active === document.documentElement) {
            return null;
        }

        while (active.shadowRoot?.activeElement) {
            active = active.shadowRoot.activeElement;
        }

        return active;
    }

    /**
     * Whether the element is focusable, as HTML's focusable areas decide it: rendered and visible, neither disabled nor inert, and either given a `tabindex` HTML reads as an integer or focusable by default, as a link with
     * an `href`, an enabled control, an `iframe`, its `details`'s first `summary`, a media element with `controls` and an editing host are.
     */
    static #isFocusable(element) {
        if (!element.isConnected || !element.checkVisibility({ visibilityProperty: true }) || element.matches(':disabled') || BrowserVocabularyImplementations.#isUnderInert(element)) {
            return false;
        }

        if (TAB_INDEX.test(element.getAttribute('tabindex') ?? '')) {
            return true;
        }

        switch (element.localName) {
            case 'a':
            case 'area':
                return element.hasAttribute('href');
            case 'input':
                return element.type !== 'hidden';
            case 'summary':
                return element.parentElement?.localName === 'details' && element.parentElement.querySelector(':scope > summary') === element;
            case 'audio':
            case 'video':
                return element.hasAttribute('controls');
            default:
                return FOCUSABLE_ELEMENTS.has(element.localName) || (element.isContentEditable && element.parentElement?.isContentEditable !== true);
        }
    }

    static #hasSelection(element) {
        if (BrowserVocabularyImplementations.#isTextControl(element)) {
            const range = BrowserVocabularyImplementations.#range(element);

            return range !== null && range[0] !== range[1];
        }

        const selection = element.ownerDocument.defaultView.getSelection();

        return selection !== null && selection.rangeCount > 0 && !selection.isCollapsed && element.contains(selection.getRangeAt(0).commonAncestorContainer);
    }
}
