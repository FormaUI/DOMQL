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

/** The tokens an initial expression starts with, and so the argument of a named operation. */
const INITIAL_STARTS = new Set(['self', 'parameter', 'literal', '{', '(']);

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

    /** Reads the text into its definition, with the span of text each of its nodes and fields came from. */
    parse() {
        const query = this.#parseExpression();
        this.#expect('end');

        return { definition: { version: Specification.definitionVersion, query }, spans: this.#spans };
    }

    /** Reads an expression: operands joined by `and` and `or`, `and` binding tighter. */
    #parseExpression() {
        return this.#parseLogical('or', () => this.#parseLogical('and', () => this.#parseOperand()));
    }

    /** Reads an operand: a chain, and a predicate expression of its value where a verb follows it. */
    #parseOperand() {
        const start = this.#token.start;

        if (this.#isVerb()) {
            throw DomqlError.syntax(`'${this.#token.value}' tests the value written before it: write 'self ${this.#token.value} …' to test the current value`, this.#text, start);
        }

        const chain = this.#parseChain();

        return this.#isVerb() ? this.#parsePredicate(chain, start) : chain;
    }

    /** Reads a chain: an initial expression, the member accesses, calls and object expressions that follow it, and the named operation that may end it. */
    #parseChain() {
        const start = this.#token.start;

        if (this.#token.type === 'name') {
            throw DomqlError.syntax(`'${this.#token.value}' follows no receiver: write ${this.#receiverForm(this.#token.value)} for a member of the current value`, this.#text, start);
        }

        let node = this.#parseInitial();

        for (;;) {
            if (this.#token.type === '.') {
                this.#advance();

                if (this.#isVerb()) {
                    throw DomqlError.syntax(`'${this.#token.value}' tests a value and is no member: write '${this.#token.value}' after the value, without a dot`, this.#text, this.#token.start);
                }

                node = this.#parseAccess(node, start);
            } else if (this.#token.type === '{') {
                node = this.#parseObject(node, start);
            } else if (this.#token.type === 'name') {
                // A name a colon follows names the next field, which a comma comes before.
                if (this.#tokens[this.#index + 1].type === ':') {
                    throw this.#unexpected("',' before the next field");
                }

                if (!this.#token.spaced) {
                    throw DomqlError.syntax(`'${this.#token.value}' follows its receiver after a space or a comment, as a named operation does`, this.#text, this.#token.start);
                }

                return this.#parseNamedOperation(node, start);
            } else {
                return node;
            }
        }
    }

    #parseInitial() {
        const token = this.#token;

        switch (token.type) {
            case 'self':
                this.#advance();

                return this.#span({ kind: 'self' }, token.start);
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

    /** Reads what follows a dot: a member access, or a call where parentheses follow the name. */
    #parseAccess(target, start) {
        const name = this.#expect('name').value;

        if (this.#token.type !== '(') {
            if (this.#token.type === 'literal' || this.#token.type === 'parameter') {
                throw DomqlError.syntax(`An argument after a dot is enclosed in parentheses, as a call's is, '.${name}(…)'; a named operation follows its receiver after a space, without a dot`, this.#text, this.#token.start);
            }

            return this.#span({ kind: 'member', target, name }, start);
        }

        this.#advance();

        if (this.#token.type === ')') {
            this.#advance();

            return this.#span({ kind: 'call', target, name }, start);
        }

        if (this.#token.type === 'name' && this.#tokens[this.#index + 1].type === ':') {
            throw DomqlError.syntax(`'${name}' takes one argument, and several parameters are given as the fields of an object, as { ${this.#token.value}: … }`, this.#text, this.#token.start);
        }

        const argument = this.#parseExpression();

        if (this.#token.type === ',') {
            throw DomqlError.syntax(`'${name}' takes one argument, and several parameters are given as the fields of an object, as { … }`, this.#text, this.#token.start);
        }

        this.#expect(')');

        return this.#span({ kind: 'call', target, name, argument }, start);
    }

    /** Reads a named operation: its name and, after a separator, the initial expression that is its argument; it ends its chain. */
    #parseNamedOperation(target, start) {
        const name = this.#token.value;

        this.#advance();

        let node = { kind: 'namedOperation', target, name };

        if (INITIAL_STARTS.has(this.#token.type)) {
            if (!this.#token.spaced) {
                throw DomqlError.syntax(`The argument of '${name}' follows it after a space or a comment`, this.#text, this.#token.start);
            }

            node = { kind: 'namedOperation', target, name, argument: this.#parseInitial() };
        }

        this.#span(node, start);

        if (this.#token.type === '.' || this.#token.type === '{' || this.#token.type === 'name') {
            throw DomqlError.syntax(`A named operation ends its chain; group it to continue from its result, as in '(… ${name} …).value'`, this.#text, this.#token.start);
        }

        return node;
    }

    /** How a member of the current value is written, for a name written with no receiver. */
    #receiverForm(name) {
        const next = this.#tokens[this.#index + 1];

        if (next.type === '(') {
            return `'self.${name}(…)'`;
        }

        return next.spaced && INITIAL_STARTS.has(next.type) ? `'self ${name} …'` : `'self.${name}'`;
    }

    /** Reads a predicate expression: its verb and the one predicate name it reads, of the subject written before it. */
    #parsePredicate(subject, start) {
        const verb = this.#token.value;

        this.#advance();

        return this.#span({ kind: 'predicate', verb, target: subject, name: this.#parsePredicateName(verb) }, start);
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

        if ((token.type === 'literal' && typeof token.value === 'string') || token.type === 'parameter') {
            return this.#parseInitial();
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
            throw DomqlError.syntax('An object expression holds at least one field, as { size: self.size }', this.#text, this.#token.start);
        }

        while (this.#token.type !== '}') {
            node.fields.push(this.#parseField());

            if (this.#token.type === ',') {
                this.#advance();
            } else if (this.#token.type !== '}') {
                throw this.#unexpected("',' or '}'");
            }
        }

        this.#advance();

        return this.#span(node, start);
    }

    /** Reads a field: its name, a colon and its value. */
    #parseField() {
        const start = this.#token.start;
        const isNamed = this.#tokens[this.#index + 1]?.type === ':';

        if (isNamed && this.#token.type === 'literal') {
            throw DomqlError.syntax(`'${this.#text.slice(this.#token.start, this.#token.end)}' is a literal, and names nothing`, this.#text, start);
        }

        if (isNamed && (this.#token.type === 'operator' || this.#token.type === 'self')) {
            throw DomqlError.syntax(`'${this.#text.slice(this.#token.start, this.#token.end)}' is a keyword, and names nothing`, this.#text, start);
        }

        if (!(isNamed && this.#token.type === 'name')) {
            throw DomqlError.syntax('A field is written with its name and a colon before its value, as size: self.size', this.#text, start);
        }

        const name = this.#token.value;
        this.#index += 2;

        return this.#span({ name, value: this.#parseExpression() }, start);
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
