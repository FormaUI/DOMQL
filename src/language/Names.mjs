/**
 * Names — DOMQL's names: how one is spelled
 */

/** A letter followed by letters and digits, which is also a JavaScript identifier. */
const PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

/** The keywords: the literal tokens, `self` and the operators, which no name can be. */
const RESERVED = new Set(['true', 'false', 'null', 'self', 'is', 'has', 'and', 'or']);

export class Names {
    /** Whether the text is a name: a letter followed by letters and digits, and no keyword. */
    static isName(text) {
        return typeof text === 'string' && PATTERN.test(text) && !RESERVED.has(text);
    }
}
