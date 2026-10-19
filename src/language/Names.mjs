/**
 * Names — DOMQL's names: how one is spelled, and the words that keep a meaning of their own where an expression stands
 */

/** A letter followed by letters and digits, which is also a JavaScript identifier. */
const PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const LITERALS = new Map([['true', true], ['false', false], ['null', null]]);
const KEYWORDS = new Set(['context', 'not', 'try', 'as', 'to', 'and', 'or', 'if', 'then', 'elseif', 'else', 'let', 'do', 'end', 'return', 'function']);

/** The roots, which their names stand for where an expression stands: the document and the window the query runs against, and the object root, a reference to the outermost object being built. */
const ROOTS = new Set(['document', 'window', 'root']);

export class Names {
    /** The words that keep their meaning where an expression stands, which a reference to a local or a field of their name writes after `@`: those that write a literal, the keywords and the roots. */
    static reservedWords = Object.freeze([...LITERALS.keys(), ...KEYWORDS, ...ROOTS]);

    /** Whether the text is a name: a letter followed by letters and digits, a reserved word among them, since a declaration's position tells it from the word. */
    static isName(text) {
        return typeof text === 'string' && PATTERN.test(text);
    }

    /** Whether the word is reserved: one a reference to a local or a field of its name writes after `@`, since written alone it keeps its own meaning. */
    static isReservedWord(word) {
        return LITERALS.has(word) || KEYWORDS.has(word) || ROOTS.has(word);
    }

    /** Whether the word is a keyword. */
    static isKeyword(word) {
        return KEYWORDS.has(word);
    }

    /** Whether the word names a root. */
    static isRoot(word) {
        return ROOTS.has(word);
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
