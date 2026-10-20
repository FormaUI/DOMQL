/**
 * VocabularyImplementations — the implementations that carry out the DOM vocabulary's members and predicates
 */

/** The input types `readonly` applies to. */
const READ_ONLY_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'date', 'month', 'week', 'time', 'datetime-local', 'number']);

/** The input types that take text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/** The values of `contenteditable` that make content editable. */
const EDITABLE_VALUES = new Set(['', 'true', 'plaintext-only']);

export class VocabularyImplementations {
    /**
     * Each implementation reads, from one object by name, the receiver, the arguments by parameter name and the environment the request is read in; a maintained member also its samples, and a source the function it delivers each event to, answering what stops it.
     * @type {Record<string, (input: { receiver: unknown, args: Record<string, any>, env: { window: Window, document: Document }, samples?: unknown[], deliver?: (event: unknown) => void }) => unknown>}
     */
    static get implementations() {
        return {
            windowSize: ({ receiver: window }) => {
                const documentElement = window.document.documentElement;

                return { width: documentElement.clientWidth, height: documentElement.clientHeight };
            },
            devicePixelRatio: ({ receiver: window }) => window.devicePixelRatio,
            // The property reads the rectangle against the layout viewport, and rectRelativeTo against the element it is given.
            rect: ({ receiver: element, args: { relativeTo = null } }) => VocabularyImplementations.#rect(element, relativeTo),
            size: ({ receiver: element }) => {
                const rect = VocabularyImplementations.#box(element);

                return rect === null ? null : { width: rect.width, height: rect.height };
            },
            clientSize: ({ receiver: element }) => VocabularyImplementations.#hasBox(element) ? { width: element.clientWidth, height: element.clientHeight } : null,
            grid: ({ receiver: element }) => VocabularyImplementations.#hasBox(element) ? { columns: VocabularyImplementations.#columns(element) } : null,
            selection: ({ receiver: element }) => VocabularyImplementations.#selection(element),
            children: ({ receiver: node }) => [...node.children],
            parent: ({ receiver: node }) => node.parentNode ?? null,
            root: ({ receiver: node }) => node.getRootNode(),
            host: ({ receiver: node }) => (node.nodeType === 11 && node.host !== undefined ? node.host : null),
            shadow: ({ receiver: element }) => element,
            aria: ({ receiver: element }) => element,
            ariaChecked: ({ receiver: element }) => VocabularyImplementations.#isAriaTrue(element, 'aria-checked'),
            ariaDisabled: ({ receiver: element }) => VocabularyImplementations.#isAriaTrue(element, 'aria-disabled'),
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
            overlaps: ({ receiver: element, args: { other, margin } }) => VocabularyImplementations.#overlaps(element, other, margin),
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
            readOnly: ({ receiver: element }) => VocabularyImplementations.#isReadOnly(element),
            textEditable: ({ receiver: element }) => VocabularyImplementations.#isTextEditable(element),
            focused: ({ receiver: element }) => element.getRootNode().activeElement === element,
            focusWithin: ({ receiver: element }) => element.matches(':focus-within'),
            hover: ({ receiver: element }) => element.matches(':hover'),
            popoverOpen: ({ receiver: element }) => element.matches(':popover-open'),
            checked: ({ receiver: element }) => element.matches(':checked'),
            visible: ({ receiver: document }) => document.visibilityState === 'visible',
            hasChildren: ({ receiver: element }) => element.childElementCount > 0,
            hasSelection: ({ receiver: element }) => VocabularyImplementations.#hasSelection(element),
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

    static #rect(element, relativeTo) {
        const box = VocabularyImplementations.#box(element);

        if (box === null) {
            return null;
        }

        const origin = relativeTo === null ? { left: 0, top: 0 } : VocabularyImplementations.#box(relativeTo);

        if (origin === null) {
            return null;
        }

        const left = box.left - origin.left;
        const top = box.top - origin.top;

        return { left, top, right: left + box.width, bottom: top + box.height, width: box.width, height: box.height };
    }

    static #overlaps(element, other, margin) {
        const first = VocabularyImplementations.#box(element);
        const second = VocabularyImplementations.#box(other);

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
        const start = VocabularyImplementations.#range(element);

        return start === null ? null : { start: start[0], end: start[1] };
    }

    static #range(element) {
        if (!VocabularyImplementations.#isTextControl(element)) {
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
        if (VocabularyImplementations.#isUnderInert(element)) {
            return false;
        }

        if (VocabularyImplementations.#isTextControl(element)) {
            const isText = element.localName === 'textarea' || TEXT_INPUT_TYPES.has(element.type);

            return isText && !element.matches(':disabled') && !element.readOnly;
        }

        return VocabularyImplementations.#isContentEditable(element);
    }

    /**
     * Whether the element or an ancestor of it in the flat tree has the `inert` attribute: through the slot each is assigned to and the host above each shadow root.
     * A slot in a closed shadow root hides its assignment, so an inert ancestor past it is found only from an element inside that root.
     */
    static #isUnderInert(element) {
        for (let current = element; current !== null;) {
            if (current.nodeType === 1 && current.hasAttribute('inert')) {
                return true;
            }

            const parent = current.assignedSlot ?? current.parentNode;

            // A shadow root is a document fragment with a host, where the flat tree continues.
            current = parent?.nodeType === 11 && parent.host !== undefined ? parent.host : (parent?.nodeType === 1 ? parent : null);
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

    static #hasSelection(element) {
        if (VocabularyImplementations.#isTextControl(element)) {
            const range = VocabularyImplementations.#range(element);

            return range !== null && range[0] !== range[1];
        }

        const selection = element.ownerDocument.defaultView.getSelection();

        return selection !== null && selection.rangeCount > 0 && !selection.isCollapsed && element.contains(selection.getRangeAt(0).commonAncestorContainer);
    }
}
