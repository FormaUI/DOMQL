/**
 * Parser — a DOMQL text read into its definition, with where in the text each part of it came from
 */

import { DomqlError } from './DomqlError.mjs';
import { Specification } from './Specification.mjs';
import { Tokenizer } from './Tokenizer.mjs';

/** @typedef {import('./Tokenizer.mjs').Token} Token */
/** @typedef {{ start: number, end: number }} Span */

const TOKEN_DESCRIPTIONS = {
    name: 'a name',
    literal: 'a literal',
    end: 'the end of the query',
};

/** The verbs that test a value against predicates. */
const VERBS = new Set(['is', 'has']);

/** The tokens an initial expression starts with, and so the argument of a named operation. */
const INITIAL_EXPRESSION_STARTS = new Set(['self', 'parameter', 'literal', 'name', '{', '(']);

/** The tokens that, after a space, make the name before them a member written without its receiver, which no local is: an argument. */
const ARGUMENT_STARTS = new Set(['self', 'parameter', 'literal']);

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

    /** Reads an expression: a conditional, or what a condition is. */
    #parseExpression() {
        if (this.#isKeyword('if')) {
            const start = this.#token.start;

            this.#advance();

            return this.#parseConditional(start);
        }

        return this.#parseCondition();
    }

    /** Reads what a condition is: operands joined by `and` and `or`, `and` binding tighter, or an operand alone. */
    #parseCondition() {
        return this.#parseLogical('or', () => this.#parseLogical('and', () => this.#parseOperand()));
    }

    /** Reads a conditional after its `if` or an `elseif`: its condition, a logical term or an operand, its consequent, and its alternative, an `elseif` being a conditional nested there. */
    #parseConditional(start) {
        if (this.#isKeyword('if')) {
            throw DomqlError.syntax('A conditional that is a condition is enclosed in parentheses: write if (if … then … else …) then …', this.#text, this.#token.start);
        }

        const condition = this.#parseCondition();

        if (!this.#isKeyword('then')) {
            throw this.#unexpected("'then' after the condition");
        }

        this.#advance();

        const consequent = this.#parseExpression();
        let alternative;

        if (this.#isKeyword('elseif')) {
            const elseifStart = this.#token.start;

            this.#advance();
            alternative = this.#parseConditional(elseifStart);
        } else if (this.#isKeyword('else')) {
            this.#advance();
            alternative = this.#parseExpression();
        } else {
            throw this.#unexpected("'elseif' or 'else', which every conditional ends with");
        }

        return this.#recordSpan({ kind: 'conditional', condition, consequent, alternative }, start);
    }

    /** Reads an operand: a value, and a predicate expression of it where a verb follows it. */
    #parseOperand() {
        const start = this.#token.start;

        if (this.#isVerb()) {
            throw DomqlError.syntax(`'${this.#token.value}' tests the value written before it: write 'self ${this.#token.value} …' to test the current value`, this.#text, start);
        }

        if (this.#isKeyword('if')) {
            throw DomqlError.syntax('A conditional that is an operand is enclosed in parentheses: write (if … then … else …)', this.#text, start);
        }

        const value = this.#parseValue();

        return this.#isVerb() ? this.#parsePredicate(value, start) : value;
    }

    /** Reads a value: an initial expression, the member accesses, calls and object expressions that continue it, held by an optional chain where one of its accesses is optional, and the named operation that may end it. */
    #parseValue() {
        const start = this.#token.start;
        const { node, isOptional } = this.#parseChain();
        const value = isOptional ? this.#recordSpan({ kind: 'optionalChain', target: node }, start) : node;

        if (this.#token.type !== 'name') {
            return value;
        }

        // A name a colon follows names the next field, which a comma comes before.
        if (this.#tokens[this.#index + 1].type === ':') {
            throw this.#unexpected("',' before the next field");
        }

        if (!this.#token.spaced) {
            throw DomqlError.syntax(`'${this.#token.value}' follows its receiver after a space or a comment, as a named operation does`, this.#text, this.#token.start);
        }

        return this.#parseNamedOperation(value, start);
    }

    /** Reads a chain: an initial expression and the member accesses, calls and object expressions that continue it, and whether an access of it is optional, which a group within it leaves to its own chain. */
    #parseChain() {
        const start = this.#token.start;

        // A name that starts a chain is a local, which takes no argument, so one an argument follows is a member written without its receiver.
        if (this.#token.type === 'name') {
            const next = this.#tokens[this.#index + 1];

            if (next.type === '(' || (next.spaced && ARGUMENT_STARTS.has(next.type))) {
                throw DomqlError.syntax(`'${this.#token.value}' follows no receiver: write ${this.#memberForm(this.#token.value)} for a member of the current value`, this.#text, start);
            }
        }

        let node = this.#parseInitialExpression();
        let isOptional = false;

        for (;;) {
            if (this.#token.type === '.' || this.#token.type === '?.') {
                const optional = this.#token.type === '?.';

                this.#advance();

                if (this.#isVerb()) {
                    throw DomqlError.syntax(`'${this.#token.value}' tests a value and is no member: write '${this.#token.value}' after the value, without a dot`, this.#text, this.#token.start);
                }

                node = this.#parseAccess(node, start, optional);
                isOptional ||= optional;
            } else if (this.#token.type === '{') {
                node = this.#parseObject(node, start);
            } else {
                return { node, isOptional };
            }
        }
    }

    #parseInitialExpression() {
        const token = this.#token;

        switch (token.type) {
            case 'self':
                this.#advance();

                return this.#recordSpan({ kind: 'self' }, token.start);
            case 'parameter':
                this.#advance();

                return this.#recordSpan({ kind: 'parameter', name: token.value }, token.start);
            case 'literal':
                this.#advance();

                return this.#recordSpan({ kind: 'literal', value: token.value }, token.start);
            case 'name':
                this.#advance();

                return this.#recordSpan({ kind: 'local', name: token.value }, token.start);
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

    /** Reads what follows a dot, or the `?.` of an optional access: a member access, or a call where parentheses follow the name. */
    #parseAccess(target, start, optional) {
        const name = this.#expect('name').value;
        const access = optional ? { target, name, optional } : { target, name };

        if (this.#token.type !== '(') {
            if (this.#token.type === 'literal' || this.#token.type === 'parameter') {
                throw DomqlError.syntax(`An argument after a dot is enclosed in parentheses, as a call's is, '.${name}(…)'; a named operation follows its receiver after a space, without a dot`, this.#text, this.#token.start);
            }

            return this.#recordSpan({ kind: 'member', ...access }, start);
        }

        this.#advance();

        if (this.#token.type === ')') {
            this.#advance();

            return this.#recordSpan({ kind: 'call', ...access }, start);
        }

        if (this.#token.type === 'name' && this.#tokens[this.#index + 1].type === ':') {
            throw DomqlError.syntax(`'${name}' takes one argument, and several parameters are given as the fields of an object, as { ${this.#token.value}: … }`, this.#text, this.#token.start);
        }

        const argument = this.#parseExpression();

        if (this.#token.type === ',') {
            throw DomqlError.syntax(`'${name}' takes one argument, and several parameters are given as the fields of an object, as { … }`, this.#text, this.#token.start);
        }

        this.#expect(')');

        return this.#recordSpan({ kind: 'call', ...access, argument }, start);
    }

    /** Reads a named operation: its name and, after a separator, the initial expression that is its argument; it ends its chain. */
    #parseNamedOperation(target, start) {
        const name = this.#token.value;

        this.#advance();

        let node = { kind: 'namedOperation', target, name };

        // A name a colon follows names the next field, which a comma comes before.
        if (this.#token.type === 'name' && this.#tokens[this.#index + 1].type === ':') {
            throw this.#unexpected("',' before the next field");
        }

        if (INITIAL_EXPRESSION_STARTS.has(this.#token.type)) {
            if (!this.#token.spaced) {
                throw DomqlError.syntax(`The argument of '${name}' follows it after a space or a comment`, this.#text, this.#token.start);
            }

            node = { kind: 'namedOperation', target, name, argument: this.#parseInitialExpression() };
        }

        this.#recordSpan(node, start);

        if (this.#token.type === '.' || this.#token.type === '?.' || this.#token.type === '{' || this.#token.type === 'name') {
            throw DomqlError.syntax(`A named operation ends its chain; group it to continue from its result, as in '(… ${name} …).value'`, this.#text, this.#token.start);
        }

        return node;
    }

    /** How a member of the current value is written, for a name an argument follows with no receiver before it: a call, or a named operation. */
    #memberForm(name) {
        return this.#tokens[this.#index + 1].type === '(' ? `'self.${name}(…)'` : `'self ${name} …'`;
    }

    /** Reads a predicate expression: its verb and the one predicate name it reads, of the subject written before it. */
    #parsePredicate(subject, start) {
        const verb = this.#token.value;

        this.#advance();

        return this.#recordSpan({ kind: 'predicate', verb, target: subject, name: this.#parsePredicateName(verb) }, start);
    }

    /** Reads operands joined by the operator, answering the operand alone where there is one. */
    #parseLogical(operator, parseOperand) {
        const start = this.#token.start;
        const first = parseOperand();

        if (!this.#isKeyword(operator)) {
            return first;
        }

        const operands = [first];

        while (this.#isKeyword(operator)) {
            this.#advance();
            operands.push(parseOperand());
        }

        return this.#recordSpan({ kind: operator, operands }, start);
    }

    /** Reads the one predicate name a predicate expression reads: a string or a parameter, or the null `is null` tests for. */
    #parsePredicateName(verb) {
        const token = this.#token;

        if ((token.type === 'literal' && typeof token.value === 'string') || token.type === 'parameter') {
            return this.#parseInitialExpression();
        }

        if (token.type === 'literal' && token.value === null) {
            if (verb !== 'is') {
                throw DomqlError.syntax(`'${verb}' takes no null; 'is null' tests whether a value is null`, this.#text, token.start);
            }

            return this.#parseInitialExpression();
        }

        if (token.type === '(') {
            throw DomqlError.syntax(`'${verb}' reads one predicate name; combine predicate expressions with and and or, as in '@panel is "attached" and @panel is "visible"'`, this.#text, token.start);
        }

        throw this.#unexpected('a predicate named by a string or a parameter');
    }

    /** Reads an object expression: its locals, each followed by a comma, and then its fields, at least one. */
    #parseObject(target, start) {
        this.#expect('{');

        const node = target ? { kind: 'object', target } : { kind: 'object' };
        const locals = [];

        while (this.#isLocal()) {
            locals.push(this.#parseLocal());

            if (this.#token.type !== ',') {
                throw this.#unexpected("',' after the local, which the fields follow");
            }

            this.#advance();
        }

        if (locals.length > 0) {
            node.locals = locals;
        }

        node.fields = [];

        if (this.#token.type === '}') {
            const example = locals.length > 0 ? '{ let r: self.rect, width: r.width }' : '{ size: self.size }';

            throw DomqlError.syntax(`An object expression holds at least one field${locals.length > 0 ? ' after its locals' : ''}, as ${example}`, this.#text, this.#token.start);
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

        return this.#recordSpan(node, start);
    }

    /** Reads a local: `let`, its name, a colon and its value. */
    #parseLocal() {
        const start = this.#token.start;

        this.#advance();

        if (!(this.#token.type === 'name' && this.#tokens[this.#index + 1]?.type === ':')) {
            this.#refuseName('A local is written with let, its name and a colon before its value, as let r: self.rect');
        }

        return this.#parseEntry(start);
    }

    /** Reads a field: its name, a colon and its value. */
    #parseField() {
        const start = this.#token.start;

        if (this.#isLocal()) {
            throw DomqlError.syntax('A local is written before the fields of its object expression', this.#text, start);
        }

        if (!(this.#token.type === 'name' && this.#tokens[this.#index + 1]?.type === ':')) {
            this.#refuseName('A field is written with its name and a colon before its value, as size: self.size');
        }

        return this.#parseEntry(start);
    }

    /** Refuses what stands where a local or a field is named: a literal or a keyword a colon follows names nothing, and anything else is written as the message gives. */
    #refuseName(message) {
        const token = this.#token;

        if (this.#tokens[this.#index + 1]?.type === ':') {
            if (token.type === 'literal') {
                throw DomqlError.syntax(`'${this.#text.slice(token.start, token.end)}' is a literal, and names nothing`, this.#text, token.start);
            }

            if (token.type === 'keyword' || token.type === 'self') {
                throw DomqlError.syntax(`'${this.#text.slice(token.start, token.end)}' is a keyword, and names nothing`, this.#text, token.start);
            }
        }

        throw DomqlError.syntax(message, this.#text, token.start);
    }

    /** Reads what a local and a field both are after their start: a name, a colon and a value. */
    #parseEntry(start) {
        const name = this.#token.value;
        this.#index += 2;

        return this.#recordSpan({ name, value: this.#parseExpression() }, start);
    }

    get #token() {
        return this.#tokens[this.#index];
    }

    #isVerb() {
        return this.#token.type === 'keyword' && VERBS.has(this.#token.value);
    }

    /** Whether a local starts here: `let`, which a colon after it would make a field's name instead, a keyword that names nothing. */
    #isLocal() {
        return this.#isKeyword('let') && this.#tokens[this.#index + 1]?.type !== ':';
    }

    #isKeyword(word) {
        return this.#token.type === 'keyword' && this.#token.value === word;
    }

    #advance() {
        this.#index++;
    }

    #expect(type) {
        const token = this.#token;

        if (token.type !== type) {
            throw this.#unexpected(TOKEN_DESCRIPTIONS[type] ?? `'${type}'`);
        }

        this.#advance();

        return token;
    }

    #recordSpan(part, start) {
        this.#spans.set(part, { start, end: this.#tokens[this.#index - 1].end });

        return part;
    }

    #unexpected(expected) {
        const token = this.#token;
        const found = token.type === 'end' ? TOKEN_DESCRIPTIONS.end : `'${this.#text.slice(token.start, token.end)}'`;

        return DomqlError.syntax(`Expected ${expected}, found ${found}`, this.#text, token.start);
    }
}
