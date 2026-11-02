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

/** A computed length in CSS pixels, as `120px` or `-0.5px`. */
const PIXELS = /^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?px$/i;

/** The media elements. */
const MEDIA_ELEMENTS = new Set(['audio', 'video']);

/** The platforms whose primary shortcut modifier is Meta, Command on their keyboards, by the name `navigator.userAgentData` gives them. */
const APPLE_PLATFORMS = new Set(['macOS', 'iOS']);

/** A `tabindex` that HTML's rules for parsing integers read as an integer. */
const TAB_INDEX = /^[\t\n\f\r ]*[-+]?[0-9]/;

/**
 * The members DOMQL reads for an event, by name, where no property of the event answers them as data: a pointer the event carries none of, which a click the keyboard caused gives as `-1` and `""` and a mouse event
 * lacks; the points a touch list holds; the formats a drag's data transfer or a clipboard event's data lists, each none where the event carries none; an edit's kind and whether it is composed, empty and false
 * for an input event that says neither, as HTML fires at a select or a checkbox; whether AltGr is held, which only a method answers; and the elements the event passes through, its composed path's elements alone.
 * Every other member is the event's own property.
 * @type {Map<string, (event: Event) => unknown>}
 */
const EVENT_MEMBERS = new Map([
    ['pointerId', event => (typeof event.pointerId === 'number' && event.pointerId !== -1 ? event.pointerId : null)],
    ['pointerType', event => (typeof event.pointerType === 'string' && event.pointerType !== '' ? event.pointerType : null)],
    ['touches', event => Array.from(event.touches ?? [])],
    ['types', event => Array.from((event.dataTransfer ?? event.clipboardData)?.types ?? [])],
    ['inputType', event => event.inputType ?? ''],
    ['isComposing', event => event.isComposing === true],
    ['altGraphKey', event => typeof event.getModifierState === 'function' && event.getModifierState('AltGraph') === true],
    ['composedPath', event => (typeof event.composedPath === 'function' ? event.composedPath().filter(target => target.nodeType === 1) : [])],
]);

/** What reads an event as DOMQL delivers it: a member DOMQL reads for it, and otherwise the event's own property, read from the event itself. */
const EVENT_READING = { get: (event, name) => (EVENT_MEMBERS.has(name) ? EVENT_MEMBERS.get(name)(event) : Reflect.get(event, name)) };

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
                const rect = BrowserVocabularyImplementations.boxOf(element);

                return rect === null ? null : { width: rect.width, height: rect.height };
            },
            clientSize: ({ receiver: element }) => BrowserVocabularyImplementations.#hasBox(element) ? { width: element.clientWidth, height: element.clientHeight } : null,
            clientRect: ({ receiver: element }) => BrowserVocabularyImplementations.clientRectOf(element),
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
            on: ({ receiver: target, args: { type, options }, deliver }) => {
                // Listening observes each event as it reaches the target, in the capture phase where its option says so, and a passive listener leaves its course to the page.
                // Each event is delivered as DOMQL reads it, with the members it reads for the event.
                const capture = options?.capture === true;
                const listener = event => deliver(new Proxy(event, EVENT_READING));

                target.addEventListener(type, listener, { passive: true, capture });

                return { stop: () => target.removeEventListener(type, listener, { capture }) };
            },

            attached: ({ receiver: element }) => element.isConnected,
            disabled: ({ receiver: element }) => element.matches(':disabled'),
            readOnly: ({ receiver: element }) => BrowserVocabularyImplementations.#isReadOnly(element),
            textEditable: ({ receiver: element }) => BrowserVocabularyImplementations.#isTextEditable(element),
            focused: ({ receiver: element }) => element.getRootNode().activeElement === element,
            focusWithin: ({ receiver: element }) => element.matches(':focus-within'),
            contains: ({ receiver: node, args: { other } }) => node.contains(other),
            previousSibling: ({ receiver: element }) => element.previousElementSibling,
            nextSibling: ({ receiver: element }) => element.nextElementSibling,
            index: ({ receiver: element }) => (element.parentNode === null ? null : Array.prototype.indexOf.call(element.parentNode.children, element)),
            hasPointerCapture: ({ receiver: element, args: { pointerId } }) => element.hasPointerCapture(pointerId),
            location: ({ receiver: window }) => {
                const { href, pathname, search, hash } = window.location;

                return { href, pathname, search, hash };
            },
            shortcutModifier: ({ receiver: window }) => (BrowserVocabularyImplementations.#isApple(window.navigator) ? 'Meta' : 'Control'),
            displayed: ({ receiver: element }) => element.isConnected && element.checkVisibility(),
            indeterminate: ({ receiver: element }) => element.matches(':indeterminate'),
            autofilled: ({ receiver: element }) => BrowserVocabularyImplementations.#isAutofilled(element),
            localName: ({ receiver: element }) => element.localName,
            classes: ({ receiver: element }) => [...element.classList],
            text: ({ receiver: element }) => element.textContent,
            html: ({ receiver: element }) => element.innerHTML,
            value: ({ receiver: element }) => (VALUE_ELEMENTS.has(element.localName) ? element.value : null),
            playback: ({ receiver: element }) => BrowserVocabularyImplementations.#playback(element),
            files: ({ receiver: element }) => (element.localName === 'input' && element.type === 'file' && element.files !== null ? [...element.files].map(({ name, size, type, lastModified }) => ({ name, bytes: size, type, lastModified })) : null),
            sizeLimits: ({ receiver: element }) => BrowserVocabularyImplementations.#sizeLimits(element),
            inlineStyle: ({ receiver: element, args: { property } }) => element.style.getPropertyValue(property) || null,
            focusable: ({ receiver: element }) => BrowserVocabularyImplementations.#isFocusable(element),
            direction: ({ receiver: element }) => (element.matches(':dir(rtl)') ? 'rtl' : 'ltr'),
            activeElement: ({ receiver: document }) => BrowserVocabularyImplementations.#activeElement(document),
            documentSelection: ({ receiver: document }) => BrowserVocabularyImplementations.#documentSelection(document),
            rangeRect: ({ receiver: range }) => BrowserVocabularyImplementations.#rangeRect(range),
            rangeCollapsed: ({ receiver: range }) => range.collapsed,
            rangeText: ({ receiver: range }) => range.toString(),
            startElement: ({ receiver: range }) => BrowserVocabularyImplementations.#elementOf(range.startContainer),
            endElement: ({ receiver: range }) => BrowserVocabularyImplementations.#elementOf(range.endContainer),
            commonAncestor: ({ receiver: range }) => BrowserVocabularyImplementations.#elementOf(range.commonAncestorContainer),
            rangeIntersects: ({ receiver: range, args: { node } }) => range.intersectsNode(node),
            rangeAll: ({ receiver: range, args: { selector } }) => BrowserVocabularyImplementations.#allIn(range, selector),
            offsetsIn: ({ receiver: range, args: { element } }) => BrowserVocabularyImplementations.#offsetsIn(range, element),
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
    static boxOf(element) {
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
    static clientRectOf(element) {
        const box = BrowserVocabularyImplementations.boxOf(element);

        if (box === null) {
            return null;
        }

        const left = box.left + element.clientLeft;
        const top = box.top + element.clientTop;
        const { clientWidth: width, clientHeight: height } = element;

        return { left, top, right: left + width, bottom: top + height, width, height };
    }

    /** Whether the element's writing mode lays its lines out vertically, which makes its inline axis vertical and its block axis horizontal. */
    static isVertical(element) {
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

        return BrowserVocabularyImplementations.isVertical(element) ? { inline: vertical, block: horizontal } : { inline: horizontal, block: vertical };
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
        const physical = axis === null ? null : (axis === 'inline') !== BrowserVocabularyImplementations.isVertical(element) ? 'overflowX' : 'overflowY';
        const isScrollable = style => (physical === null ? USER_SCROLLABLE.has(style.overflowX) || USER_SCROLLABLE.has(style.overflowY) : USER_SCROLLABLE.has(style[physical]));

        for (let current = BrowserVocabularyImplementations.flatParentOf(element); current !== null; current = BrowserVocabularyImplementations.flatParentOf(current)) {
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
    static flatParentOf(element) {
        const parent = element.assignedSlot ?? element.parentNode;

        // A shadow root is a document fragment with a host, where the flat tree continues.
        if (parent?.nodeType === 11 && parent.host !== undefined) {
            return parent.host;
        }

        return parent?.nodeType === 1 ? parent : null;
    }

    static #rect(element, relativeTo) {
        const box = BrowserVocabularyImplementations.boxOf(element);

        if (box === null) {
            return null;
        }

        const origin = relativeTo === null ? { left: 0, top: 0 } : BrowserVocabularyImplementations.boxOf(relativeTo);

        if (origin === null) {
            return null;
        }

        const left = box.left - origin.left;
        const top = box.top - origin.top;

        return { left, top, right: left + box.width, bottom: top + box.height, width: box.width, height: box.height };
    }

    static #overlaps(element, other, margin) {
        const first = BrowserVocabularyImplementations.boxOf(element);
        const second = BrowserVocabularyImplementations.boxOf(other);

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

    /**
     * The start and end of the selection of a text input or text area; of an element whose content is editable, the document's selection as offsets in its text, null where it lies not wholly within it; and null for any
     * other element.
     */
    static #selection(element) {
        if (!BrowserVocabularyImplementations.#isTextControl(element) && element.isContentEditable) {
            const selection = element.ownerDocument.getSelection();

            return selection === null || selection.rangeCount === 0 ? null : BrowserVocabularyImplementations.#offsetsIn(selection.getRangeAt(0), element);
        }

        const start = BrowserVocabularyImplementations.#range(element);

        return start === null ? null : { start: start[0], end: start[1] };
    }

    /** The document's selection as it stands, or null where the document has none to offer, as one without a browsing context. */
    static #documentSelection(document) {
        const selection = document.getSelection();

        if (selection === null) {
            return null;
        }

        return {
            type: selection.type,
            collapsed: selection.isCollapsed,
            rangeCount: selection.rangeCount,
            anchorElement: BrowserVocabularyImplementations.#elementOf(selection.anchorNode),
            focusElement: BrowserVocabularyImplementations.#elementOf(selection.focusNode),
            range: selection.rangeCount === 0 ? null : selection.getRangeAt(0),
        };
    }

    /** The element a boundary of a range is in: the node itself where it is an element, the element holding its text otherwise, and null for a document, a fragment or no node. */
    static #elementOf(node) {
        if (node === null || node === undefined) {
            return null;
        }

        return node.nodeType === 1 ? node : node.parentElement ?? null;
    }

    /** The bounding box of what a range holds, relative to the layout viewport, or null where it lies in a tree that is not attached. */
    static #rangeRect(range) {
        if (!range.commonAncestorContainer.isConnected) {
            return null;
        }

        const { left, top, width, height } = range.getBoundingClientRect();

        return { left, top, right: left + width, bottom: top + height, width, height };
    }

    /** The elements matching the selector that the range intersects, in document order: the ancestors of what it holds, then the elements within it. */
    static #allIn(range, selector) {
        const ancestor = range.commonAncestorContainer;
        const holder = ancestor.nodeType === 1 ? ancestor : ancestor.parentNode;
        const ancestors = [];

        for (let current = BrowserVocabularyImplementations.#elementOf(ancestor); current !== null; current = current.parentElement) {
            if (current.matches(selector)) {
                ancestors.unshift(current);
            }
        }

        const within = holder === null || typeof holder.querySelectorAll !== 'function' ? [] : [...holder.querySelectorAll(selector)].filter(element => range.intersectsNode(element));

        return [...ancestors, ...within];
    }

    /** A range's start and end as offsets in the element's text, as `text` reads it, or null where either boundary lies outside the element. */
    static #offsetsIn(range, element) {
        const isWithin = node => node === element || element.contains(node);

        if (!isWithin(range.startContainer) || !isWithin(range.endContainer)) {
            return null;
        }

        const before = element.ownerDocument.createRange();

        before.setStart(element, 0);
        before.setEnd(range.startContainer, range.startOffset);

        const start = before.toString().length;

        before.setEnd(range.endContainer, range.endOffset);

        return { start, end: before.toString().length };
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
        for (let current = element; current !== null; current = BrowserVocabularyImplementations.flatParentOf(current)) {
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

    /**
     * Whether the window runs on an Apple platform, as `navigator.userAgentData` names it, or, in a browser that offers none, as `navigator.platform` does, the one signal such a browser gives, an iPad's that names a Mac
     * included.
     */
    static #isApple(navigator) {
        const platform = navigator.userAgentData?.platform;

        return platform === undefined ? /^(Mac|iPhone|iPad|iPod)/.test(navigator.platform ?? '') : APPLE_PLATFORMS.has(platform);
    }

    /** Whether the browser has filled the field, as `:autofill` matches, or the prefixed `:-webkit-autofill` in a browser that knows no other. */
    static #isAutofilled(element) {
        try {
            return element.matches(':autofill');
        } catch {
            return element.matches(':-webkit-autofill');
        }
    }

    /** The limits of the element's size as its computed style holds them, each in pixels or null where it is none, as `auto`, `none`, a percentage or a keyword; null where it is detached. */
    static #sizeLimits(element) {
        if (!element.isConnected) {
            return null;
        }

        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const pixelsOf = value => (PIXELS.test(value) ? Number.parseFloat(value) : null);

        return { minWidth: pixelsOf(style.minWidth), minHeight: pixelsOf(style.minHeight), maxWidth: pixelsOf(style.maxWidth), maxHeight: pixelsOf(style.maxHeight) };
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
