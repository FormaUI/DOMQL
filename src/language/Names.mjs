/**
 * Names — DOMQL's names: how one is spelled, and the words none can be
 */

/** A letter followed by letters and digits, which is also a JavaScript identifier. */
const PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const LITERALS = new Map([['true', true], ['false', false], ['null', null]]);
const KEYWORDS = new Set(['self', 'not', 'try', 'as', 'and', 'or', 'if', 'then', 'elseif', 'else', 'let', 'do', 'end', 'return', 'function']);

export class Names {
    /** The words no name can be: those that write a literal, and the keywords. */
    static reservedWords = Object.freeze([...LITERALS.keys(), ...KEYWORDS]);

    /** Whether the text is a name: a letter followed by letters and digits, and no reserved word. */
    static isName(text) {
        return typeof text === 'string' && PATTERN.test(text) && !LITERALS.has(text) && !KEYWORDS.has(text);
    }

    /**
     * Whether the text names a member a property access or a call reads after its dot, or an indexer after its colon: a letter followed by letters and digits, and no word that writes a literal.
     * A keyword names one there, where only a member's name stands, as `selection.end` reads the field `end`.
     */
    static isMemberName(text) {
        return typeof text === 'string' && PATTERN.test(text) && !LITERALS.has(text);
    }

    /** Whether the text names a caller's binding: a letter followed by letters and digits, a reserved word among them, which a query reads as `~` and the name, but `self`, the current value, which no binding takes. */
    static isBindingName(text) {
        return typeof text === 'string' && PATTERN.test(text) && text !== 'self';
    }

    /** Whether the word is a keyword. */
    static isKeyword(word) {
        return KEYWORDS.has(word);
    }

    /** Whether the word writes a literal. */
    static isLiteral(word) {
        return LITERALS.has(word);
    }

    /** The value of the literal the word writes. */
    static literalValueOf(word) {
        return LITERALS.get(word);
    }
}
