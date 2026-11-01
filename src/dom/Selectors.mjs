/**
 * Selectors — what a CSS selector reads of the document it is matched in: the attributes its compound selectors test, and whether it tests focus or a popover's showing
 */

/** A pseudo-class that tests focus, which focus moving changes. */
const FOCUS = 'focus';

/** A pseudo-class that tests a popover's showing, which its toggle changes. */
const POPOVERS = 'popovers';

/** The attributes a validity pseudo-class reads, beside a control's value, which no attribute holds once it is edited. */
const VALIDITY = ['required', 'pattern', 'min', 'max', 'minlength', 'maxlength', 'step', 'type', 'value'];

/**
 * What each pseudo-class reads beside the structure of its tree: the attributes it tests, none for one that tests structure alone or a state no attribute holds, focus or popovers. A pseudo-class missing here may test
 * any attribute.
 * @type {Map<string, string[] | typeof FOCUS | typeof POPOVERS>}
 */
const PSEUDO_CLASSES = new Map([
    // Structure, which the observation follows, and the selectors their arguments hold, which are read where they stand.
    ...['is', 'where', 'not', 'has', 'matches', 'nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type', 'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type', 'only-of-type', 'empty', 'root', 'scope'].map(name => [name, []]),
    // A state no attribute holds: the pointer's, the URL's, a custom element's, a media element's and the fullscreen element's.
    ...['hover', 'active', 'target', 'target-within', 'visited', 'defined', 'state', 'autofill', '-webkit-autofill', 'fullscreen', 'picture-in-picture', 'playing', 'paused', 'seeking', 'buffering', 'stalled', 'muted', 'volume-locked', 'host', 'host-context'].map(name => [name, []]),
    ...['focus', 'focus-within', 'focus-visible'].map(name => [name, FOCUS]),
    ['popover-open', POPOVERS],
    ...['checked', 'default'].map(name => [name, ['checked', 'selected']]),
    ['indeterminate', ['checked', 'type']],
    ...['disabled', 'enabled'].map(name => [name, ['disabled']]),
    ...['read-only', 'read-write'].map(name => [name, ['readonly', 'disabled', 'contenteditable', 'type']]),
    ...['required', 'optional'].map(name => [name, ['required']]),
    ['placeholder-shown', ['placeholder', 'value']],
    ...['valid', 'invalid', 'in-range', 'out-of-range', 'user-valid', 'user-invalid'].map(name => [name, VALIDITY]),
    ...['link', 'any-link', 'local-link'].map(name => [name, ['href']]),
    ['dir', ['dir']],
    ['lang', ['lang']],
    ...['open', 'closed', 'modal'].map(name => [name, ['open']]),
]);

/** A character an identifier holds, an escape aside. */
const IDENTIFIER = /[-\w\u0080-￿]/;

export class Selectors {
    /**
     * What the selector reads beside the structure of the tree it is matched in: the attributes it tests, null where a pseudo-class it doesn't know may test any; whether it tests focus; and whether it tests a popover's
     * showing. It reads a class for `.`, an id for `#`, each attribute an attribute selector names, in the case written and in lowercase, as HTML matches it, and what each pseudo-class reads. A selector that isn't one
     * reads what its text names, and fails where it is matched.
     * @param {string} selector The selector, as `matches` and `all` are given it.
     * @returns {{ attributes: string[] | null, focus: boolean, popovers: boolean }}
     */
    static readsOf(selector) {
        const attributes = new Set();
        let readsEveryAttribute = false;
        let focus = false;
        let popovers = false;

        for (let index = 0; index < selector.length;) {
            const character = selector[index];

            if (character === '\\') {
                index = Selectors.#identifierAt(selector, index).end;
            } else if (character === '"' || character === '\'') {
                index = Selectors.#stringEndAt(selector, index);
            } else if (character === '.') {
                attributes.add('class');
                index++;
            } else if (character === '#') {
                attributes.add('id');
                index++;
            } else if (character === '[') {
                const { name, end } = Selectors.#attributeAt(selector, index + 1);

                if (name !== '') {
                    attributes.add(name).add(name.toLowerCase());
                }

                index = end;
            } else if (character === ':' && selector[index + 1] === ':') {
                // A pseudo-element matches nothing a query selects, so it reads nothing.
                index = Selectors.#identifierAt(selector, index + 2).end;
            } else if (character === ':') {
                const { name, end } = Selectors.#identifierAt(selector, index + 1);
                const reads = PSEUDO_CLASSES.get(name.toLowerCase());

                if (reads === undefined) {
                    readsEveryAttribute = true;
                } else if (reads === FOCUS) {
                    focus = true;
                } else if (reads === POPOVERS) {
                    popovers = true;
                } else {
                    reads.forEach(attribute => attributes.add(attribute));
                }

                index = end;
            } else {
                index++;
            }
        }

        return { attributes: readsEveryAttribute ? null : [...attributes], focus, popovers };
    }

    /** The identifier starting at the index, its escapes read as the characters they stand for, and the index after it. */
    static #identifierAt(text, start) {
        let name = '';
        let index = start;

        while (index < text.length) {
            if (text[index] === '\\') {
                const hex = /^[0-9a-fA-F]{1,6}[ \t\n]?/.exec(text.slice(index + 1));

                if (hex !== null) {
                    name += String.fromCodePoint(Number.parseInt(hex[0].trim(), 16) || 0xFFFD);
                    index += 1 + hex[0].length;
                } else {
                    name += text[index + 1] ?? '';
                    index += 2;
                }
            } else if (IDENTIFIER.test(text[index])) {
                name += text[index];
                index++;
            } else {
                break;
            }
        }

        return { name, end: index };
    }

    /** The index after the string that opens at the index, its escapes passed over. */
    static #stringEndAt(text, start) {
        const quote = text[start];
        let index = start + 1;

        while (index < text.length && text[index] !== quote) {
            index += text[index] === '\\' ? 2 : 1;
        }

        return index + 1;
    }

    /** The name an attribute selector opening before the index tests, its namespace aside, and the index after its closing bracket. */
    static #attributeAt(text, start) {
        let index = start;

        while (/\s/.test(text[index] ?? '')) {
            index++;
        }

        // A namespace stands before a single bar, never before the `|=` that compares a value.
        let { name, end } = text[index] === '*' ? { name: '', end: index + 1 } : Selectors.#identifierAt(text, index);

        if (text[end] === '|' && text[end + 1] !== '=') {
            ({ name, end } = Selectors.#identifierAt(text, end + 1));
        }

        for (index = end; index < text.length && text[index] !== ']';) {
            index = text[index] === '"' || text[index] === '\'' ? Selectors.#stringEndAt(text, index) : index + (text[index] === '\\' ? 2 : 1);
        }

        return { name, end: index + 1 };
    }
}
