/**
 * Tokenizer — the tokens of a DOMQL text: strictly, as a query reads them, refusing the first text that is no token, or tolerantly, as tooling reads any text, an invalid token standing for each such text with its diagnostic
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';

/**
 * The types a token is, which tooling reads as they are: `invalid` for text that is no token, and `end` for the end of the text, after its last trivia.
 * A contract within DOMQL until a public tooling API stabilizes it.
 */
export const TOKEN_TYPES = Object.freeze(['name', 'literal', 'keyword', 'self', 'invalid', 'end', '.', '?.', '?[', '?:', '??', '(?', '==', '!=', '=', '+', '-', '*', '/', '%', ',', ':', '(', ')', '{', '}', '[', ']']);

/**
 * @typedef {object} Token
 * @property {'name' | 'literal' | 'keyword' | 'self' | 'invalid' | 'end' | '.' | '?.' | '?[' | '?:' | '??' | '(?' | '==' | '!=' | '=' | '+' | '-' | '*' | '/' | '%' | ',' | ':' | '(' | ')' | '{' | '}' | '[' | ']'} type
 * @property {unknown} [value] A name's or a keyword's text, or a literal's value.
 * @property {number} start
 * @property {number} end
 * @property {number} leading Where the trivia before it begins, at its start where there is none, so every character of the text belongs to one token or to the trivia before one.
 * @property {boolean} spaced Whether trivia, whitespace or a comment, comes before it, which tells an argument written after a name from one of the name's own.
 * @property {{ message: string, offset: number }} [diagnostic] Why an invalid token is no token, and where the text first fails.
 */

/** The tokens of one character, the arithmetic operators among them: `-` is always an operator, negation or subtraction, so no number begins with it, and `/` is one wherever no comment begins. */
const PUNCTUATION = new Set(['.', ',', ':', '(', ')', '{', '}', '[', ']', '+', '-', '*', '/', '%']);
const NAME = /[A-Za-z][A-Za-z0-9]*/y;
const NUMBER = /(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const SPACE = /\s/;

export class Tokenizer {
    #text;
    #offset = 0;

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

        // `(?` opens an optional-access group, one token, so no trivia stands inside it.
        if (this.#text.startsWith('(?', start)) {
            this.#offset += 2;

            return { type: '(?', start, end: this.#offset };
        }

        if (PUNCTUATION.has(character)) {
            this.#offset++;

            return { type: character, start, end: this.#offset };
        }

        if (['?.', '?[', '?:', '??', '==', '!='].some(operator => this.#text.startsWith(operator, start))) {
            this.#offset += 2;

            return { type: this.#text.slice(start, this.#offset), start, end: this.#offset };
        }

        if (character === '@') {
            return this.#readAt(start);
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

    /** Reads what `@` begins, which names nothing, since a binding is named by its name alone: an invalid token over the `@` and the name after it, whose diagnostic gives the name to write. */
    #readAt(start) {
        NAME.lastIndex = start + 1;

        if (!NAME.test(this.#text)) {
            return this.#invalid(start, start + 1, "'@' names nothing: a binding is named by its name alone, as panel", start);
        }

        const name = this.#text.slice(start + 1, NAME.lastIndex);

        return this.#invalid(start, NAME.lastIndex, `A binding is named by its name alone: write '${name}', with no '@'`, start);
    }

    /** Reads a string, invalid where it escapes a character no escape is for, at the first such escape, or where it is never closed, running then to the end of the text. */
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
                const escaped = this.#text[offset + 1];

                if (escaped !== '"' && escaped !== '\\') {
                    diagnostic ??= { message: 'A string escapes only \\" and \\\\', offset };
                    offset++;
                    continue;
                }

                value += escaped;
                offset += 2;
            } else {
                value += character;
                offset++;
            }
        }

        const unclosed = diagnostic ?? { message: 'A string is never closed', offset: start };

        return this.#invalid(start, this.#text.length, unclosed.message, unclosed.offset);
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
