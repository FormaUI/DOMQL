/**
 * Parser — a DOMQL text read into its definition, with where in the text each part of it came from
 */

import { DomqlError } from './DomqlError.mjs';
import { Specification } from './Specification.mjs';
import { Tokenizer } from './Tokenizer.mjs';

/** @typedef {import('./Tokenizer.mjs').Token} Token */
/** @typedef {{ start: number, end: number }} Span */

const TOKEN_NAMES = {
    name: 'a name',
    literal: 'a literal',
    end: 'the end of the query',
};

/** The verbs that test a value against predicates. */
const VERBS = new Set(['is', 'has']);

export class Parser {
    #text;
    /** @type {Token[]} */
    #tokens;
    #index = 0;
    /** @type {WeakMap<object, Span>} */
    #spans = new WeakMap();

    /** @param {string} text The query text. */
    constructor(text) {
        this.#text = text;
        this.#tokens = new Tokenizer(text).tokenize();
    }

    /** Reads the text into its definition, with the span of text each of its nodes, fields and arguments came from. */
    parse() {
        const query = this.#parseExpression();
        this.#expect('end');

        return { definition: { version: Specification.definitionVersion, query }, spans: this.#spans };
    }

    /** Reads an expression: operands joined by `and` and `or`, `and` binding tighter. */
    #parseExpression() {
        return this.#parseLogical('or', () => this.#parseLogical('and', () => this.#parseOperand()));
    }

    /** Reads an operand: a chain, a chain followed by a predicate expression of its value, or a predicate expression of the current value. */
    #parseOperand() {
        const start = this.#token.start;

        if (this.#isVerb()) {
            return this.#parsePredicate(null, start);
        }

        const chain = this.#parseChain();

        return this.#isVerb() ? this.#parsePredicate(chain, start) : chain;
    }

    #parseChain() {
        const start = this.#token.start;
        let node;

        if (this.#token.type === 'name') {
            const { member, isPhrase } = this.#parseMember(null, start, true);

            node = member;

            // A member whose arguments follow it without parentheses is a phrase, which ends its chain.
            if (isPhrase) {
                if (this.#token.type === '.' || this.#token.type === '{') {
                    throw DomqlError.syntax('A member whose arguments are not in parentheses ends its chain; put them in parentheses to continue from its result', this.#text, this.#token.start);
                }

                return node;
            }
        } else {
            node = this.#parseInitial();
        }

        for (;;) {
            if (this.#token.type === '.') {
                this.#advance();

                if (this.#isVerb()) {
                    throw DomqlError.syntax(`'${this.#token.value}' tests a value and is no member: write '${this.#token.value}' after the value, without a dot`, this.#text, this.#token.start);
                }

                node = this.#parseMember(node, start, false).member;
            } else if (this.#token.type === '{') {
                node = this.#parseObject(node, start);
            } else {
                return node;
            }
        }
    }

    #parseInitial() {
        const token = this.#token;

        switch (token.type) {
            case 'parameter':
                this.#advance();

                return this.#span({ kind: 'parameter', name: token.value }, token.start);
            case 'literal':
                this.#advance();

                return this.#span({ kind: 'literal', value: token.value }, token.start);
            case '{':
                return this.#parseObject(null, token.start);
            case '(': {
                // A group records the expression it holds, which a chain may then continue from.
                this.#advance();
                const expression = this.#parseExpression();
                this.#expect(')');

                return expression;
            }
            default:
                throw this.#unexpected('a value');
        }
    }

    /** Reads a literal or a parameter reference, which takes no member after it: a dot continues from the call. */
    #parseLiteralOrParameter() {
        const token = this.#token;
        this.#advance();

        return this.#span(token.type === 'literal' ? { kind: 'literal', value: token.value } : { kind: 'parameter', name: token.value }, token.start);
    }

    /** Reads a member: a name, and its arguments in parentheses or, where it starts a chain, without them, which makes it a phrase. */
    #parseMember(target, start, startsChain) {
        const name = this.#expect('name');
        const member = target ? { kind: 'member', target, name: name.value, arguments: [] } : { kind: 'member', name: name.value, arguments: [] };
        let isPhrase = false;

        if (this.#token.type === '(') {
            this.#advance();
            this.#parseList(')', () => member.arguments.push(this.#parseEntry()));
        } else if (this.#token.type === 'literal' || this.#token.type === 'parameter') {
            if (!startsChain) {
                throw DomqlError.syntax(`Arguments after a dot are enclosed in parentheses: write '${name.value}(…)'`, this.#text, this.#token.start);
            }

            // Arguments given without parentheses are literals and parameters alone, so where they end is decided by the text.
            while (this.#token.type === 'literal' || this.#token.type === 'parameter') {
                const argumentStart = this.#token.start;
                member.arguments.push(this.#span({ value: this.#parseLiteralOrParameter() }, argumentStart));
            }

            isPhrase = true;
        }

        return { member: this.#span(member, start), isPhrase };
    }

    /** Reads a predicate expression: its verb and the one predicate name it reads, of the subject's value or, without one, of the current value. */
    #parsePredicate(subject, start) {
        const verb = this.#token.value;

        this.#advance();

        const name = this.#parsePredicateName(verb);
        const node = subject ? { kind: 'predicate', verb, target: subject, name } : { kind: 'predicate', verb, name };

        return this.#span(node, start);
    }

    /** Reads operands joined by the operator, answering the operand alone where there is one. */
    #parseLogical(operator, parseOperand) {
        const start = this.#token.start;
        const first = parseOperand();

        if (!this.#isOperator(operator)) {
            return first;
        }

        const operands = [first];

        while (this.#isOperator(operator)) {
            this.#advance();
            operands.push(parseOperand());
        }

        return this.#span({ kind: operator, operands }, start);
    }

    /** Reads the one predicate name a predicate expression reads: a string or a parameter. */
    #parsePredicateName(verb) {
        const token = this.#token;

        if (token.type === 'literal' && typeof token.value === 'string') {
            this.#advance();

            return this.#span({ kind: 'literal', value: token.value }, token.start);
        }

        if (token.type === 'parameter') {
            return this.#parseLiteralOrParameter();
        }

        if (token.type === '(') {
            throw DomqlError.syntax(`'${verb}' reads one predicate name; combine predicate expressions with and and or, as in '@panel is "attached" and @panel is "visible"'`, this.#text, token.start);
        }

        throw this.#unexpected('a predicate named by a string or a parameter');
    }

    #parseObject(target, start) {
        this.#expect('{');

        const node = target ? { kind: 'object', target, fields: [] } : { kind: 'object', fields: [] };

        if (this.#token.type === '}') {
            throw DomqlError.syntax('An object expression holds at least one field, as { size: size }', this.#text, this.#token.start);
        }

        this.#parseList('}', () => node.fields.push(this.#parseField()));

        return this.#span(node, start);
    }

    /** Reads entries separated by commas up to the closing token, a comma after the last allowed. */
    #parseList(closing, parseEntry) {
        while (this.#token.type !== closing) {
            parseEntry();

            if (this.#token.type === ',') {
                this.#advance();
            } else if (this.#token.type !== closing) {
                throw this.#unexpected(`',' or '${closing}'`);
            }
        }

        this.#advance();
    }

    /** Reads a field: its name, a colon and its value. */
    #parseField() {
        if (!(this.#token.type === 'name' && this.#tokens[this.#index + 1].type === ':')) {
            if ((this.#token.type === 'literal' || this.#token.type === 'operator') && this.#tokens[this.#index + 1].type === ':') {
                return this.#parseEntry();
            }

            throw DomqlError.syntax('A field is written with its name and a colon before its value, as size: size', this.#text, this.#token.start);
        }

        return this.#parseEntry();
    }

    /** Reads a field or an argument: a value, named where a name and a colon come first. */
    #parseEntry() {
        const start = this.#token.start;

        if (this.#token.type === 'literal' && this.#tokens[this.#index + 1].type === ':') {
            throw DomqlError.syntax(`'${this.#text.slice(this.#token.start, this.#token.end)}' is a literal, and names nothing`, this.#text, start);
        }

        if (this.#token.type === 'operator' && this.#tokens[this.#index + 1].type === ':') {
            throw DomqlError.syntax(`'${this.#token.value}' is an operator, and names nothing`, this.#text, start);
        }

        if (this.#token.type === 'name' && this.#tokens[this.#index + 1].type === ':') {
            const name = this.#token.value;
            this.#index += 2;

            return this.#span({ name, value: this.#parseExpression() }, start);
        }

        return this.#span({ value: this.#parseExpression() }, start);
    }

    get #token() {
        return this.#tokens[this.#index];
    }

    #isVerb() {
        return this.#token.type === 'operator' && VERBS.has(this.#token.value);
    }

    #isOperator(operator) {
        return this.#token.type === 'operator' && this.#token.value === operator;
    }

    #advance() {
        this.#index++;
    }

    #expect(type) {
        const token = this.#token;

        if (token.type !== type) {
            throw this.#unexpected(TOKEN_NAMES[type] ?? `'${type}'`);
        }

        this.#advance();

        return token;
    }

    #span(part, start) {
        this.#spans.set(part, { start, end: this.#tokens[this.#index - 1].end });

        return part;
    }

    #unexpected(expected) {
        const token = this.#token;
        const found = token.type === 'end' ? TOKEN_NAMES.end : `'${this.#text.slice(token.start, token.end)}'`;

        return DomqlError.syntax(`Expected ${expected}, found ${found}`, this.#text, token.start);
    }
}
