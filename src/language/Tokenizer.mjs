/**
 * Tokenizer — the tokens of a DOMQL text: strictly, as a query reads them, refusing the first text that is no token, or tolerantly, as tooling reads any text, an invalid token standing for each such text with its diagnostic
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';

/**
 * The types a token is, which tooling reads as they are: `invalid` for text that is no token, and `end` for the end of the text, after its last trivia.
 * An interpolated string is read as its `$"`, its runs of text, the `{` and `}` around each of its holes and its closing quote, the tokens of each hole's expression between them.
 * A contract within DOMQL until a public tooling API stabilizes it.
 */
export const TOKEN_TYPES = Object.freeze(['name', 'literal', 'keyword', 'self', 'invalid', 'end', 'interpolated-string-start', 'interpolated-text', 'hole-start', 'hole-end', 'interpolated-string-end', 'external', 'reserved-reference', '.', '?.', '?[', '?:', '??', '(?', '==', '!=', '<', '<=', '>', '>=', '=', '+', '-', '*', '/', '%', ',', ':', '(', ')', '{', '}', '[', ']']);

/**
 * @typedef {object} Token
 * @property {'name' | 'literal' | 'keyword' | 'self' | 'invalid' | 'end' | 'interpolated-string-start' | 'interpolated-text' | 'hole-start' | 'hole-end' | 'interpolated-string-end' | 'external' | 'reserved-reference' | '.' | '?.' | '?[' | '?:' | '??' | '(?' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '=' | '+' | '-' | '*' | '/' | '%' | ',' | ':' | '(' | ')' | '{' | '}' | '[' | ']'} type
 * @property {unknown} [value] A name's or a keyword's text, the name `~` reads the caller's binding of, the reserved word `@` reads the local or the field of, a literal's value, or the text a run of an interpolated string's text stands for.
 * @property {number} start
 * @property {number} end
 * @property {number} leading Where the trivia before it begins, at its start where there is none, so every character of the text belongs to one token or to the trivia before one.
 * @property {boolean} spaced Whether trivia, whitespace or a comment, comes before it, which tells an argument written after a name from one of the name's own.
 * @property {{ message: string, offset: number }} [diagnostic] Why an invalid token is no token, and where the text first fails.
 */

/** The character each escape a letter or a sign names stands for, after its backslash. */
const ESCAPES = Object.freeze({ '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t', e: '\u001B' });

/** A Unicode escape after its backslash: `u` and one to six hexadecimal digits in braces. */
const UNICODE_ESCAPE = /u\{([0-9A-Fa-f]{1,6})\}/y;

/** The tokens of one character, the arithmetic operators among them: `-` is always an operator, negation or subtraction, so no number begins with it, and `/` is one wherever no comment begins. */
const PUNCTUATION = new Set(['.', ',', ':', '(', ')', '{', '}', '[', ']', '+', '-', '*', '/', '%']);
const NAME = /[A-Za-z][A-Za-z0-9]*/y;
const NUMBER = /(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const SPACE = /\s/;

export class Tokenizer {
    #text;
    #offset = 0;

    /**
     * What is being read, innermost last: the text of an interpolated string, with where its `$"` begins, or the expression of one of its holes, with how many braces its own object expressions have opened, so its `}` is told from theirs.
     * @type {({ kind: 'text', start: number } | { kind: 'hole', depth: number })[]}
     */
    #modes = [];

    /** @param {string} text The query text. */
    constructor(text) {
        this.#text = text;
    }

    /**
     * Every token of the text, ending with an `end` token, read tolerantly: text that is no token is an invalid token holding its diagnostic, and reading goes on after it, so the tokens cover the whole text whatever it holds.
     * @param {string} text
     * @returns {Token[]}
     */
    static scan(text) {
        return new Tokenizer(text).#readAll();
    }

    /** Reads every token of the text, ending with an `end` token, refusing the first text that is no token with its diagnostic. */
    tokenize() {
        const tokens = this.#readAll();

        for (const token of tokens) {
            if (token.type === 'invalid') {
                throw DomqlError.syntax(token.diagnostic.message, this.#text, token.diagnostic.offset);
            }
        }

        return tokens;
    }

    #readAll() {
        /** @type {Token[]} */
        const tokens = [];

        for (let token = this.#read(); ; token = this.#read()) {
            tokens.push(token);

            if (token.type === 'end') {
                return tokens;
            }
        }
    }

    #read() {
        // An interpolated string's text holds no trivia: what stands between its tokens is its own text.
        if (this.#modes.at(-1)?.kind === 'text') {
            const token = this.#readText();

            token.leading = token.start;
            token.spaced = false;

            return token;
        }

        const leading = this.#offset;
        const token = this.#skipTrivia() ?? this.#readToken();

        token.leading = leading;
        token.spaced = token.start > leading;

        return token;
    }

    #readToken() {
        const start = this.#offset;

        if (start >= this.#text.length) {
            return { type: 'end', start, end: start };
        }

        const character = this.#text[start];

        // `(?` opens an optional enclosed access, one token, so no trivia stands inside it.
        if (this.#text.startsWith('(?', start)) {
            this.#offset += 2;

            return { type: '(?', start, end: this.#offset };
        }

        if (character === '$') {
            return this.#readDollar(start);
        }

        const mode = this.#modes.at(-1);

        // A brace in a hole opens or closes an object expression of its expression, and the `}` no object expression is open for closes the hole.
        if (mode?.kind === 'hole' && (character === '{' || character === '}')) {
            if (character === '{') {
                mode.depth++;
            } else if (mode.depth > 0) {
                mode.depth--;
            } else {
                this.#modes.pop();
                this.#offset++;

                return { type: 'hole-end', start, end: this.#offset };
            }
        }

        if (PUNCTUATION.has(character)) {
            this.#offset++;

            return { type: character, start, end: this.#offset };
        }

        if (['?.', '?[', '?:', '??', '==', '!=', '<=', '>='].some(operator => this.#text.startsWith(operator, start))) {
            this.#offset += 2;

            return { type: this.#text.slice(start, this.#offset), start, end: this.#offset };
        }

        if (character === '<' || character === '>') {
            this.#offset++;

            return { type: character, start, end: this.#offset };
        }

        if (character === '@') {
            return this.#readAt(start);
        }

        if (character === '~') {
            return this.#readExternal(start);
        }

        if (character === '"') {
            return this.#readString(start);
        }

        if (character >= '0' && character <= '9') {
            return this.#readNumber(start);
        }

        NAME.lastIndex = start;

        if (NAME.test(this.#text)) {
            this.#offset = NAME.lastIndex;

            const name = this.#text.slice(start, this.#offset);

            if (Names.isLiteral(name)) {
                return { type: 'literal', value: Names.literalValueOf(name), start, end: this.#offset };
            }

            // `self` is a keyword, given a token type of its own for the parser, which reads it where a value stands.
            if (name === 'self') {
                return { type: 'self', start, end: this.#offset };
            }

            return { type: Names.isKeyword(name) ? 'keyword' : 'name', value: name, start, end: this.#offset };
        }

        // A single `=` gives a field, a local or a binding its value, which the parser reads where one stands.
        if (character === '=') {
            this.#offset++;

            return { type: '=', start, end: this.#offset };
        }

        // A single `!` is no operator; an inequality is written `!=`, and a negation `not`.
        if (character === '!') {
            return this.#invalid(start, start + 1, "Unexpected '!': an inequality is written '!=', and a negation 'not'", start);
        }

        return this.#invalid(start, start + 1, `Unexpected '${character}'`, start);
    }

    /** Moves past the trivia before a token, answering an invalid token for a block comment never closed, which runs to the end of the text. */
    #skipTrivia() {
        while (this.#offset < this.#text.length) {
            const character = this.#text[this.#offset];

            if (SPACE.test(character)) {
                this.#offset++;
            } else if (this.#text.startsWith('//', this.#offset)) {
                const lineEnd = this.#text.indexOf('\n', this.#offset);
                this.#offset = lineEnd === -1 ? this.#text.length : lineEnd + 1;
            } else if (this.#text.startsWith('/*', this.#offset)) {
                const commentEnd = this.#text.indexOf('*/', this.#offset + 2);

                if (commentEnd === -1) {
                    return this.#invalid(this.#offset, this.#text.length, 'A block comment is never closed', this.#offset);
                }

                this.#offset = commentEnd + 2;
            } else {
                return null;
            }
        }

        return null;
    }

    /**
     * Reads what `@` begins: a reference to the local or the field a reserved word names, written directly after it, as `@to` reads the local `to`, since the word alone keeps its own meaning;
     * invalid where no reserved word follows it directly, a name that is none being written alone.
     */
    #readAt(start) {
        NAME.lastIndex = start + 1;

        if (!NAME.test(this.#text)) {
            const next = this.#text[start + 1];
            const message = next === undefined || SPACE.test(next)
                ? "A reserved word follows '@' directly, as @to"
                : "'@' and what follows it are no reserved reference, which writes a reserved word directly after '@', as @to";

            return this.#invalid(start, start + 1, message, start);
        }

        const name = this.#text.slice(start + 1, NAME.lastIndex);

        if (!Names.isReservedWord(name)) {
            return this.#invalid(start, NAME.lastIndex, `'${name}' is no reserved word, so it is written alone: write '${name}', with no '@'`, start);
        }

        this.#offset = NAME.lastIndex;

        return { type: 'reserved-reference', value: name, start, end: this.#offset };
    }

    /** Reads what `~` begins: the caller's binding of the name written directly after it, whatever local or field shares its name and a reserved word included, as `~as` reads the binding `as`; invalid where no name follows it directly. */
    #readExternal(start) {
        NAME.lastIndex = start + 1;

        if (!NAME.test(this.#text)) {
            return this.#invalid(start, start + 1, "'~' reads the caller's binding of the name written directly after it, as ~panel", start);
        }

        const name = this.#text.slice(start + 1, NAME.lastIndex);

        this.#offset = NAME.lastIndex;

        return { type: 'external', value: name, start, end: this.#offset };
    }

    /** Reads a string, invalid where an escape in it is none the language has, at the first such escape, or where it is never closed, running then to the end of the text. */
    #readString(start) {
        let value = '';
        let offset = start + 1;
        let diagnostic = null;

        while (offset < this.#text.length) {
            const character = this.#text[offset];

            if (character === '"') {
                this.#offset = offset + 1;

                return diagnostic === null ? { type: 'literal', value, start, end: this.#offset } : this.#invalid(start, this.#offset, diagnostic.message, diagnostic.offset);
            }

            if (character === '\\') {
                const escape = this.#readEscape(offset);

                if (escape.message !== undefined) {
                    diagnostic ??= { message: escape.message, offset };
                    offset++;
                    continue;
                }

                value += escape.character;
                offset = escape.end;
            } else {
                value += character;
                offset++;
            }
        }

        // In a hole, a quote begins a string of the hole's own expression, so one never closed is most often the interpolated string's own quote written before the hole's `}`.
        const message = this.#modes.at(-1)?.kind === 'hole' ? "A string is never closed: an interpolation is closed with '}' before its string's closing quote" : 'A string is never closed';
        const unclosed = diagnostic ?? { message, offset: start };

        return this.#invalid(start, this.#text.length, unclosed.message, unclosed.offset);
    }

    /** Reads what `$` begins: an interpolated string's `$"`, where the quote follows it directly, and otherwise text that is no token, a space between them saying where it stands. */
    #readDollar(start) {
        if (this.#text[start + 1] === '"') {
            this.#offset = start + 2;
            this.#modes.push({ kind: 'text', start });

            return { type: 'interpolated-string-start', start, end: this.#offset };
        }

        let offset = start + 1;

        while (offset < this.#text.length && SPACE.test(this.#text[offset])) {
            offset++;
        }

        const message = offset > start + 1 && this.#text[offset] === '"' ? `An interpolated string starts with '$"', with no space between them` : "Unexpected '$'";

        return this.#invalid(start, start + 1, message, start);
    }

    /**
     * Reads at the offset in an interpolated string's text: its closing quote, the `{` that opens a hole, or a run of its text up to either, an escape read whole as the character it stands for, so the brace of `\u{…}` opens no hole,
     * and a doubled brace as the brace itself. A lone `}` and an escape the language has none of make the run invalid, as text never closed does, which ends the string at the end of the text.
     */
    #readText() {
        const start = this.#offset;
        const mode = this.#modes.at(-1);

        if (this.#text[start] === '"') {
            this.#modes.pop();
            this.#offset = start + 1;

            return { type: 'interpolated-string-end', start, end: this.#offset };
        }

        if (this.#text[start] === '{' && this.#text[start + 1] !== '{') {
            this.#modes.push({ kind: 'hole', depth: 0 });
            this.#offset = start + 1;

            return { type: 'hole-start', start, end: this.#offset };
        }

        let value = '';
        let offset = start;
        let diagnostic = null;

        while (offset < this.#text.length && this.#text[offset] !== '"') {
            const character = this.#text[offset];

            if ((character === '{' || character === '}') && this.#text[offset + 1] === character) {
                value += character;
                offset += 2;
            } else if (character === '{') {
                break;
            } else if (character === '}') {
                diagnostic ??= { message: "A literal '}' in an interpolated string is written '}}'", offset };
                offset++;
            } else if (character === '\\') {
                const escape = this.#readEscape(offset);

                if (escape.message !== undefined) {
                    diagnostic ??= { message: escape.message, offset };
                    offset++;
                } else {
                    value += escape.character;
                    offset = escape.end;
                }
            } else {
                value += character;
                offset++;
            }
        }

        if (offset >= this.#text.length) {
            this.#modes.pop();

            return this.#invalid(start, this.#text.length, diagnostic?.message ?? 'An interpolated string is never closed', diagnostic?.offset ?? mode.start);
        }

        if (diagnostic !== null) {
            return this.#invalid(start, offset, diagnostic.message, diagnostic.offset);
        }

        this.#offset = offset;

        return { type: 'interpolated-text', value, start, end: offset };
    }

    /** Reads the escape whose backslash is at the offset: the character it stands for and where it ends, or the message that says why it is none the language has. */
    #readEscape(offset) {
        const escaped = this.#text[offset + 1];

        if (escaped !== 'u') {
            return Object.hasOwn(ESCAPES, escaped ?? '')
                ? { character: ESCAPES[escaped], end: offset + 2 }
                : { message: 'A string escapes only \\", \\\\, \\n, \\r, \\t, \\e and \\u{…}' };
        }

        UNICODE_ESCAPE.lastIndex = offset + 1;

        const match = UNICODE_ESCAPE.exec(this.#text);

        if (match === null) {
            return { message: 'A Unicode escape is written \\u{…} with one to six hexadecimal digits, as \\u{1F600}' };
        }

        const codePoint = Number.parseInt(match[1], 16);

        if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
            return { message: 'A Unicode escape names a scalar value, and D800 to DFFF are surrogates' };
        }

        if (codePoint > 0x10FFFF) {
            return { message: 'A Unicode escape names a value no greater than 10FFFF' };
        }

        return { character: String.fromCodePoint(codePoint), end: UNICODE_ESCAPE.lastIndex };
    }

    #readNumber(start) {
        NUMBER.lastIndex = start;

        if (!NUMBER.test(this.#text)) {
            return this.#invalid(start, start + 1, 'A number is written as in JSON', start);
        }

        this.#offset = NUMBER.lastIndex;

        return { type: 'literal', value: Number(this.#text.slice(start, this.#offset)), start, end: this.#offset };
    }

    /** An invalid token over the text from the start to the end, which reading goes on after, with the message and the offset its diagnostic gives. */
    #invalid(start, end, message, offset) {
        this.#offset = end;

        return { type: 'invalid', start, end, diagnostic: { message, offset } };
    }
}
