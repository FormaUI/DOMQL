/**
 * Tokenizer — the tokens of a DOMQL text
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';

/**
 * @typedef {object} Token
 * @property {'name' | 'parameter' | 'literal' | 'keyword' | 'self' | 'end' | '.' | '?.' | '?[' | '?:' | '??' | '(?' | '==' | '!=' | ',' | ':' | '(' | ')' | '{' | '}' | '[' | ']'} type
 * @property {unknown} [value] A name's, a parameter's or a keyword's text, or a literal's value.
 * @property {number} start
 * @property {number} end
 * @property {boolean} spaced Whether trivia, whitespace or a comment, comes before it, as an infix call's separator requires.
 */

const PUNCTUATION = new Set(['.', ',', ':', '(', ')', '{', '}', '[', ']']);
const NAME = /[A-Za-z][A-Za-z0-9]*/y;
const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const SPACE = /\s/;

export class Tokenizer {
    #text;
    #offset = 0;

    /** @param {string} text The query text. */
    constructor(text) {
        this.#text = text;
    }

    /** Reads every token of the text, ending with an `end` token. */
    tokenize() {
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
        const before = this.#offset;

        this.#skipTrivia();

        const spaced = this.#offset > before;

        return { ...this.#readToken(), spaced };
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
            return this.#readParameter(start);
        }

        if (character === '"') {
            return this.#readString(start);
        }

        if (character === '-' || (character >= '0' && character <= '9')) {
            return this.#readNumber(start);
        }

        NAME.lastIndex = start;

        if (NAME.test(this.#text)) {
            this.#offset = NAME.lastIndex;

            const name = this.#text.slice(start, this.#offset);

            // A hyphen right after a name is never a negative number, which whitespace or a parenthesis comes before.
            if (this.#text[this.#offset] === '-') {
                throw DomqlError.syntax(`A name holds no hyphen: '${name}-…' is written in camelCase, as clientSize is`, this.#text, this.#offset);
            }

            if (Names.isLiteral(name)) {
                return { type: 'literal', value: Names.literalValueOf(name), start, end: this.#offset };
            }

            // `self` is a keyword, given a token type of its own for the parser, which reads it where a value stands.
            if (name === 'self') {
                return { type: 'self', start, end: this.#offset };
            }

            return { type: Names.isKeyword(name) ? 'keyword' : 'name', value: name, start, end: this.#offset };
        }

        // A single `=` or `!` is no operator; an equality is written `==` or `!=`, and a negation `not`.
        if (character === '=' || character === '!') {
            throw DomqlError.syntax(`Unexpected '${character}': an equality is written '==' or '!=', and a negation 'not'`, this.#text, start);
        }

        throw DomqlError.syntax(`Unexpected '${character}'`, this.#text, start);
    }

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
                    throw DomqlError.syntax('A block comment is never closed', this.#text, this.#offset);
                }

                this.#offset = commentEnd + 2;
            } else {
                return;
            }
        }
    }

    /** Reads a parameter, its `@` and its name one token, so nothing comes between them. */
    #readParameter(start) {
        NAME.lastIndex = start + 1;

        if (!NAME.test(this.#text)) {
            throw DomqlError.syntax("A parameter is written as '@' and its name, with nothing between them, as '@panel'", this.#text, start + 1);
        }

        this.#offset = NAME.lastIndex;

        const name = this.#text.slice(start + 1, this.#offset);

        if (this.#text[this.#offset] === '-') {
            throw DomqlError.syntax(`A name holds no hyphen: '${name}-…' is written in camelCase, as clientSize is`, this.#text, this.#offset);
        }

        if (!Names.isName(name)) {
            throw DomqlError.syntax(`'@${name}' names no parameter: '${name}' is a reserved word`, this.#text, start + 1);
        }

        return { type: 'parameter', value: name, start, end: this.#offset };
    }

    #readString(start) {
        let value = '';
        let offset = start + 1;

        while (offset < this.#text.length) {
            const character = this.#text[offset];

            if (character === '"') {
                this.#offset = offset + 1;

                return { type: 'literal', value, start, end: this.#offset };
            }

            if (character === '\\') {
                const escaped = this.#text[offset + 1];

                if (escaped !== '"' && escaped !== '\\') {
                    throw DomqlError.syntax('A string escapes only \\" and \\\\', this.#text, offset);
                }

                value += escaped;
                offset += 2;
            } else {
                value += character;
                offset++;
            }
        }

        throw DomqlError.syntax('A string is never closed', this.#text, start);
    }

    #readNumber(start) {
        NUMBER.lastIndex = start;

        if (!NUMBER.test(this.#text)) {
            throw DomqlError.syntax('A number is written as in JSON', this.#text, start);
        }

        this.#offset = NUMBER.lastIndex;

        return { type: 'literal', value: Number(this.#text.slice(start, this.#offset)), start, end: this.#offset };
    }
}
