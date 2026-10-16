/**
 * VocabularyFunctions — the functions that carry out the built-in vocabulary's members
 */

/** The input types `readonly` applies to. */
const READ_ONLY_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'date', 'month', 'week', 'time', 'datetime-local', 'number']);

/** The input types that take text. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number']);

/** The values of `contenteditable` that make content editable. */
const EDITABLE_VALUES = new Set(['', 'true', 'plaintext-only']);

/** The ASCII whitespace a text converted to a number is trimmed of at either end: tab, line feed, form feed, carriage return and space. */
const SURROUNDING_ASCII_WHITESPACE = /^[\t\n\f\r ]+|[\t\n\f\r ]+$/g;

/** HTML's valid floating-point number: an optional minus, digits with an optional fraction or a fraction alone, and an optional exponent whose sign is optional. */
const VALID_FLOATING_POINT_NUMBER = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;

export class VocabularyFunctions {
    /**
     * Each function takes the receiver, the arguments by parameter name, and the environment the request is read in; a source also takes the function it delivers each event to, and answers what stops it.
     * @type {Record<string, (receiver: unknown, args: Record<string, any>, environment: { window: Window, document: Document }) => unknown>}
     */
    static get functions() {
        return {
            // A conversion takes the value, never null, and `reject`, which stops it for a value that has no conversion; it answers the converted value.
            stringToNumber: (text, { reject }) => {
                const trimmed = text.replace(SURROUNDING_ASCII_WHITESPACE, '');

                if (!VALID_FLOATING_POINT_NUMBER.test(trimmed)) {
                    reject(`${JSON.stringify(text)} is no number, which is written as HTML's valid floating-point number, as -12, 3.5, .5 or 1e3 are`);
                }

                const number = Number(trimmed);

                if (!Number.isFinite(number)) {
                    reject(`${JSON.stringify(text)} is too large a number to be finite`);
                }

                return number;
            },
            // The shortest text that reads back as the same number, as ECMAScript writes it, and negative zero as "0".
            numberToString: number => String(number),
            booleanToString: value => String(value),
            stringToBoolean: (text, { reject }) => {
                if (text !== 'true' && text !== 'false') {
                    reject(`${JSON.stringify(text)} is no Boolean, which is written "true" or "false"`);
                }

                return text === 'true';
            },
            windowSize: window => {
                const documentElement = window.document.documentElement;

                return { width: documentElement.clientWidth, height: documentElement.clientHeight };
            },
            devicePixelRatio: window => window.devicePixelRatio,
            // The property reads the rectangle against the layout viewport, and rectRelativeTo against the element it is given.
            rect: (element, { relativeTo = null }) => VocabularyFunctions.#rect(element, relativeTo),
            size: element => {
                const rect = VocabularyFunctions.#box(element);

                return rect === null ? null : { width: rect.width, height: rect.height };
            },
            clientSize: element => VocabularyFunctions.#hasBox(element) ? { width: element.clientWidth, height: element.clientHeight } : null,
            grid: element => VocabularyFunctions.#hasBox(element) ? { columns: VocabularyFunctions.#columns(element) } : null,
            selection: element => VocabularyFunctions.#selection(element),
            children: node => [...node.children],
            parent: node => node.parentNode ?? null,
            root: node => node.getRootNode(),
            host: node => (node.nodeType === 11 && node.host !== undefined ? node.host : null),
            shadow: element => element,
            shadowRoot: element => element.shadowRoot ?? null,
            assignedElements: element => (typeof element.assignedElements === 'function' ? element.assignedElements({ flatten: true }) : null),
            count: items => items.length,
            first: items => items.at(0) ?? null,
            last: items => items.at(-1) ?? null,

            matchesMedia: (window, { query }) => window.matchMedia(query).matches,
            supports: (window, { feature }) => VocabularyFunctions.#supports(window, feature),
            attributeOf: (element, { name }) => element.getAttribute(name),
            computedStyleOf: (element, { property }) => {
                if (!element.isConnected) {
                    return null;
                }

                const value = element.ownerDocument.defaultView.getComputedStyle(element).getPropertyValue(property).trim();

                return value === '' ? null : value;
            },
            intersects: (_receiver, _args, _environment, [isIntersecting]) => isIntersecting,
            overlaps: (element, { other, margin }) => VocabularyFunctions.#overlaps(element, other, margin),
            matches: (element, { selector }) => element.matches(selector),
            closest: (element, { selector }) => element.closest(selector),
            firstMatching: (node, { selector }) => node.querySelector(selector),
            all: (node, { selector }) => [...node.querySelectorAll(selector)],
            at: (items, { index }) => Number.isInteger(index) && index >= 0 && index < items.length ? items[index] : null,
            max: (items, { expression }) => VocabularyFunctions.#extreme(items, expression, Math.max),
            min: (items, { expression }) => VocabularyFunctions.#extreme(items, expression, Math.min),
            sum: (items, { expression }) => VocabularyFunctions.#numbers(items, expression).reduce((total, number) => total + number, 0),
            where: (items, { expression }) => items.filter(item => expression(item) === true),
            on: (target, { type }, _environment, deliver) => {
                // Listening observes each event as it reaches the target, and a passive listener leaves its course to the page.
                target.addEventListener(type, deliver, { passive: true });

                return { stop: () => target.removeEventListener(type, deliver) };
            },

            attached: element => element.isConnected,
            disabled: element => element.matches(':disabled'),
            readOnly: element => VocabularyFunctions.#isReadOnly(element),
            textEditable: element => VocabularyFunctions.#isTextEditable(element),
            focused: element => element.getRootNode().activeElement === element,
            visible: document => document.visibilityState === 'visible',
            hasChildren: element => element.childElementCount > 0,
            hasSelection: element => VocabularyFunctions.#hasSelection(element),
            hasFocus: document => document.hasFocus(),
        };
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
        const box = VocabularyFunctions.#box(element);

        if (box === null) {
            return null;
        }

        const origin = relativeTo === null ? { left: 0, top: 0 } : VocabularyFunctions.#box(relativeTo);

        if (origin === null) {
            return null;
        }

        const left = box.left - origin.left;
        const top = box.top - origin.top;

        return { left, top, right: left + box.width, bottom: top + box.height, width: box.width, height: box.height };
    }

    static #overlaps(element, other, margin) {
        const first = VocabularyFunctions.#box(element);
        const second = VocabularyFunctions.#box(other);

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
        const start = VocabularyFunctions.#range(element);

        return start === null ? null : { start: start[0], end: start[1] };
    }

    static #range(element) {
        if (!VocabularyFunctions.#isTextControl(element)) {
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

    static #supports(window, feature) {
        return feature === 'share' ? typeof window.navigator.share === 'function' : window.navigator.clipboard !== undefined;
    }

    /** The largest or smallest of the numbers an expression produces, null where it produces none. */
    static #extreme(items, expression, choose) {
        const numbers = VocabularyFunctions.#numbers(items, expression);

        return numbers.length === 0 ? null : numbers.reduce((current, number) => choose(current, number));
    }

    /** The numbers an expression produces for the items, leaving out the items it produces null for. */
    static #numbers(items, expression) {
        return items.map(item => expression(item)).filter(number => number !== null);
    }

    static #isReadOnly(element) {
        if (element.localName === 'textarea') {
            return element.readOnly;
        }

        return element.localName === 'input' && READ_ONLY_INPUT_TYPES.has(element.type) && element.readOnly;
    }

    static #isTextEditable(element) {
        if (VocabularyFunctions.#isUnderInert(element)) {
            return false;
        }

        if (VocabularyFunctions.#isTextControl(element)) {
            const isText = element.localName === 'textarea' || TEXT_INPUT_TYPES.has(element.type);

            return isText && !element.matches(':disabled') && !element.readOnly;
        }

        return VocabularyFunctions.#isContentEditable(element);
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

    /** Whether the element's own or nearest ancestor's `contenteditable` makes its content editable, or the document's design mode does. */
    static #isContentEditable(element) {
        for (let current = element; current !== null; current = current.parentElement) {
            const value = current.getAttribute('contenteditable');

            if (value !== null && value.toLowerCase() !== 'inherit') {
                return EDITABLE_VALUES.has(value.toLowerCase());
            }
        }

        return element.ownerDocument.designMode === 'on';
    }

    static #hasSelection(element) {
        if (VocabularyFunctions.#isTextControl(element)) {
            const range = VocabularyFunctions.#range(element);

            return range !== null && range[0] !== range[1];
        }

        const selection = element.ownerDocument.defaultView.getSelection();

        return selection !== null && selection.rangeCount > 0 && !selection.isCollapsed && element.contains(selection.getRangeAt(0).commonAncestorContainer);
    }
}
