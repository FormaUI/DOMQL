/**
 * Parser — a DOMQL text read into its definition, with where in the text each part of it came from
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';
import { Specification } from './Specification.mjs';
import { Tokenizer } from './Tokenizer.mjs';

/** @typedef {import('./Tokenizer.mjs').Token} Token */
/** @typedef {{ start: number, end: number }} Span */

const TOKEN_DESCRIPTIONS = {
    name: 'a name',
    literal: 'a literal',
    end: 'the end of the query',
};


/** The tokens a chain input starts with, and so the argument of an infix call. */
const CHAIN_INPUT_STARTS = new Set(['self', 'parameter', 'literal', 'name', '{', '(', '(?']);

/** The tokens that continue a chain after what is before them. */
const CHAIN_CONTINUATIONS = new Set(['.', '?.', '[', '?[', ':', '?:', '{']);

/** The tokens that, after a space, make the name before them a member written without its receiver, which no local is: an argument. */
const ARGUMENT_STARTS = new Set(['self', 'parameter', 'literal']);

export class Parser {
    #text;
    /** @type {Token[]} */
    #tokens;
    #index = 0;
    /** @type {WeakMap<object, Span>} */
    #spans = new WeakMap();

    /** The coalescing operators read where no group holds them, which no `and`, `or` or equality may stand beside. @type {WeakSet<object>} */
    #ungroupedCoalescings = new WeakSet();

    /** The conversions read after another conversion of the same chain, without a group between them, which `try` refuses to test. @type {WeakSet<object>} */
    #chainedConversions = new WeakSet();

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

            return this.#parseConditionalExpression(start);
        }

        return this.#parseCondition();
    }

    /** Reads what a condition is: a disjunction, or an or-operand alone, a coalescing operator among them, which stands beside neither `and` nor `or`. */
    #parseCondition() {
        return this.#parseLogical('or', () => this.#parseOrOperand());
    }

    /** Reads an or-operand: a conjunction, or an and-operand alone. */
    #parseOrOperand() {
        return this.#parseLogical('and', () => this.#parseAndOperand());
    }

    /** Reads an and-operand: a negation, an equality, or an equality operand alone. */
    #parseAndOperand() {
        return this.#isKeyword('not') ? this.#parseNegation() : this.#parseEquality();
    }

    /** Reads a negation: `not` and what it negates, another negation, an equality or an equality operand, so it associates to the right; a coalescing operator stands beside it only where a group holds it. */
    #parseNegation() {
        const start = this.#token.start;

        this.#advance();

        const operand = this.#parseAndOperand();

        if (this.#ungroupedCoalescings.has(operand)) {
            throw DomqlError.syntax("'??' and 'not' stand apart, one of them grouped: write 'not (… ?? …)' or '(not …) ?? …'", this.#text, this.#spans.get(operand).start);
        }

        return this.#recordSpan({ kind: 'not', operand }, start);
    }

    /** Reads a conditional after its `if` or an `elseif`: its condition, a logical term or an operand, its consequent, and its alternative, an `elseif` being a conditional nested there. */
    #parseConditionalExpression(start) {
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
            alternative = this.#parseConditionalExpression(elseifStart);
        } else if (this.#isKeyword('else')) {
            this.#advance();
            alternative = this.#parseExpression();
        } else {
            throw this.#unexpected("'elseif' or 'else', which every conditional ends with");
        }

        return this.#recordSpan({ kind: 'conditional', condition, consequent, alternative }, start);
    }

    /**
     * Reads an equality: an equality operand, `==` or `!=`, and the equality operand it compares with, `!=` recorded as the negation of `==`; an equality operand alone where neither follows it, or the coalescing operator that takes it where `??` follows it.
     * An equality does not chain, and stands beside a coalescing operator only where a group holds one of them.
     */
    #parseEquality() {
        const start = this.#token.start;

        this.#refuseOperandStart(start);

        const left = this.#parseEqualityOperand();

        if (this.#token.type === '??') {
            return this.#parseCoalescingOperator(left, start);
        }

        if (!this.#isEqualityOperator()) {
            return left;
        }

        const operator = this.#token.type;
        const isNegated = operator === '!=';

        this.#advance();

        const rightStart = this.#token.start;

        this.#refuseOperandStart(rightStart);

        const equality = this.#recordSpan({ kind: 'equality', left, right: this.#parseEqualityOperand() }, start);

        if (this.#token.type === '??') {
            throw DomqlError.syntax(`'??' and '${operator}' stand apart, one of them grouped: write '(… ${operator} …) ?? …' or '… ${operator} (… ?? …)'`, this.#text, this.#token.start);
        }

        if (this.#isEqualityOperator()) {
            throw DomqlError.syntax("An equality compares two values and does not chain: write '(… == …) == …' to compare its result", this.#text, this.#token.start);
        }

        return isNegated ? this.#recordSpan({ kind: 'not', operand: equality }, start) : equality;
    }

    /** Whether the current token compares the value before it: `==` or `!=`. */
    #isEqualityOperator() {
        return this.#token.type === '==' || this.#token.type === '!=';
    }

    /**
     * Reads a test of a conversion after its `try`: the one conversion it tests, the equality operand that follows, recorded as a convertibility of the value that conversion converts.
     * It tests that conversion alone, so a chain of conversions is grouped to say which it tests, and anything that is no conversion is refused.
     */
    #parseTry(start) {
        this.#advance();

        if (this.#isKeyword('try')) {
            throw DomqlError.syntax('\'try\' tests a conversion, and no other test: write \'try … to "type"\'', this.#text, this.#token.start);
        }

        const conversion = this.#parseEqualityOperand();

        if (conversion.kind !== 'conversion') {
            throw DomqlError.syntax('\'try\' tests a conversion: write \'try … to "type"\'', this.#text, start);
        }

        if (this.#chainedConversions.has(conversion)) {
            throw DomqlError.syntax(`'try' tests one conversion: group the value it converts, as in 'try (… to "${conversion.target.type}") to "${conversion.type}"'`, this.#text, start);
        }

        return this.#recordSpan({ kind: 'convertibility', type: conversion.type, target: conversion.target }, start);
    }

    /** Refuses what an equality operand cannot start with: `==` or `!=`, which compares the value written before it, and a conditional, which is grouped where it is an operand. */
    #refuseOperandStart(start) {
        if (this.#isEqualityOperator()) {
            throw DomqlError.syntax(`'${this.#token.type}' compares the value written before it: write 'self ${this.#token.type} …' to compare the current value`, this.#text, start);
        }

        if (this.#isKeyword('if')) {
            throw DomqlError.syntax('A conditional that is an operand is enclosed in parentheses: write (if … then … else …)', this.#text, start);
        }
    }

    /** Reads a coalescing operator after its value: `??` and its fallback, an equality operand or another coalescing operator, so it associates to the right. */
    #parseCoalescingOperator(value, start) {
        this.#advance();

        const fallbackStart = this.#token.start;

        if (this.#isKeyword('not')) {
            throw DomqlError.syntax("'??' and 'not' stand apart, one of them grouped: write '… ?? (not …)'", this.#text, fallbackStart);
        }

        this.#refuseOperandStart(fallbackStart);

        const fallbackValue = this.#parseEqualityOperand();
        const fallback = this.#token.type === '??' ? this.#parseCoalescingOperator(fallbackValue, fallbackStart) : fallbackValue;

        if (this.#isEqualityOperator()) {
            const operator = this.#token.type;

            throw DomqlError.syntax(`'??' and '${operator}' stand apart, one of them grouped: write '(… ?? …) ${operator} …' or '… ?? (… ${operator} …)'`, this.#text, this.#token.start);
        }

        const node = this.#recordSpan({ kind: 'coalescing', value, fallback }, start);

        this.#ungroupedCoalescings.add(node);

        return node;
    }

    /** Reads an equality operand: a chain, held by an optional chain where one of its accesses is optional, the infix call that may end it, and the conversions that follow, each converting what is before it. */
    #parseEqualityOperand() {
        const start = this.#token.start;

        if (this.#isKeyword('try')) {
            return this.#parseTry(start);
        }
        const chain = this.#parseChain();
        let value = chain.isOptional ? this.#recordSpan({ kind: 'optionalChain', target: chain.node }, start) : chain.node;

        if (this.#isKeyword('as')) {
            value = this.#parseCast(value, chain, start);
        }

        if (this.#isInfixName() && !this.#isConversion()) {
            value = this.#parseInfixCall(value, start);
        }

        while (this.#isInfixName()) {
            if (!this.#isConversion()) {
                const written = value.kind === 'conversion' ? `'(… to "${value.type}") ${this.#token.value} …'` : `'(… ${value.name} …) ${this.#token.value} …'`;

                throw DomqlError.syntax(`${value.kind === 'conversion' ? 'A conversion' : 'An infix call'} ends its chain; group it to continue from its result, as in ${written}`, this.#text, this.#token.start);
            }

            const converted = this.#parseConversion(value, start);

            // A conversion of what the conversion before it in this chain converted is written ungrouped, which a test of one conversion refuses.
            if (value.kind === 'conversion' && value === converted.target && this.#spans.get(value)?.start === start) {
                this.#chainedConversions.add(converted);
            }

            value = converted;
        }

        return value;
    }

    /** Whether a name stands where an infix call's is written, after its receiver and a space: one a colon follows names the next field, which a comma comes before. */
    #isInfixName() {
        if (this.#token.type !== 'name') {
            return false;
        }

        if (this.#tokens[this.#index + 1].type === ':') {
            throw this.#unexpected("',' before the next field");
        }

        if (!this.#token.spaced) {
            throw DomqlError.syntax(`'${this.#token.value}' follows its receiver after a space or a comment, as an infix call does`, this.#text, this.#token.start);
        }

        return true;
    }

    /** Whether the name where an infix call's would stand is `to`, which converts what is before it there, since no infix call is named so. */
    #isConversion() {
        return this.#token.value === 'to';
    }

    /** Whether the current name is `to` with a quoted type after it, which only a conversion writes, so no local an argument or a chain starts with. */
    #startsConversion() {
        const next = this.#tokens[this.#index + 1];

        return this.#token.type === 'name' && this.#token.value === 'to' && next.type === 'literal' && typeof next.value === 'string';
    }

    /** Reads a conversion after the value it converts: `to` and the quoted name of the type it converts to. It ends its chain, as an infix call does, and another conversion may follow it. */
    #parseConversion(target, start) {
        this.#advance();

        const token = this.#token;

        if (token.type !== 'literal' || typeof token.value !== 'string') {
            throw this.#unexpected('the quoted name of the type it converts to, as in to "number"');
        }

        if (!token.spaced) {
            throw DomqlError.syntax("The type a conversion converts to follows 'to' after a space or a comment", this.#text, token.start);
        }

        this.#advance();

        const node = this.#recordSpan({ kind: 'conversion', type: token.value, target }, start);

        if (this.#continuesChain()) {
            throw DomqlError.syntax(`A conversion ends its chain; group it to continue from its result, as in '(… to "${token.value}").value'`, this.#text, this.#token.start);
        }

        if (this.#isKeyword('as')) {
            throw DomqlError.syntax(`A conversion's result is cast only in a group: write '(… to "${token.value}") as …'`, this.#text, this.#token.start);
        }

        return node;
    }

    /** Reads a chain: a chain input and the member-access expressions and object expressions that continue it, and whether an access of it is optional, which a group within it leaves to its own chain. */
    #parseChain() {
        const start = this.#token.start;
        const input = this.#token.type === '(' ? 'expressionGroup' : this.#token.type === '(?' ? 'optionalAccessGroup' : 'input';
        let node = this.#parseChainInput();
        const grouped = node.kind;
        let isOptional = false;
        let isContinued = false;
        let hasObject = false;

        for (;; isContinued = true) {
            if (this.#token.type === '[' || this.#token.type === '?[') {
                const optional = this.#token.type === '?[';

                node = this.#parseAccessByName(node, start, optional);
                isOptional ||= optional;
            } else if (this.#token.type === ':' || this.#token.type === '?:') {
                const optional = this.#token.type === '?:';

                node = this.#parseIndexer(node, start, optional);
                isOptional ||= optional;
            } else if (this.#token.type === '.' || this.#token.type === '?.') {
                const optional = this.#token.type === '?.';

                this.#advance();
                this.#refuseDotBeforeBrackets(optional);

                node = this.#parseMemberAccessExpression(node, start, optional);
                isOptional ||= optional;
            } else if (this.#token.type === '{') {
                node = this.#parseObject(node, start);
                hasObject = true;
            } else {
                return { node, isOptional, input, grouped, isContinued, hasObject };
            }
        }
    }

    /**
     * Reads a cast after its target: `as` and the quoted name of the type it casts to. Its target is a receiver and the member-access expressions after it, a coalescing operator in parentheses, or an optional-access group, and a cast continues a chain only from a group.
     */
    #parseCast(target, chain, start) {
        const isTarget = !chain.hasObject && (chain.input === 'input'
            || (chain.input === 'expressionGroup' && (chain.grouped === 'cast' || (chain.grouped === 'coalescing' && !chain.isContinued)))
            || (chain.input === 'optionalAccessGroup' && !chain.isContinued));

        if (!isTarget) {
            throw DomqlError.syntax(`A cast's target is a receiver and the member-access expressions after it, a coalescing operator in parentheses, or an optional-access group, and this is none of them`, this.#text, start);
        }

        return this.#readCast(target, start);
    }

    /** Reads `as` and the quoted type name after a cast's target, which nothing continues but a group. */
    #readCast(target, start) {
        this.#advance();

        const token = this.#token;

        if (token.type !== 'literal' || typeof token.value !== 'string') {
            throw this.#unexpected('the quoted name of the type it casts to, as in as "element"');
        }

        this.#advance();

        const node = this.#recordSpan({ kind: 'cast', type: token.value, target }, start);

        if (this.#continuesChain()) {
            throw DomqlError.syntax(`A cast continues a chain only from a group: write '(… as "${token.value}")…'`, this.#text, this.#token.start);
        }

        if (this.#isKeyword('as')) {
            throw DomqlError.syntax(`A cast's target holds a cast only in a group: write '(… as "${token.value}") as …'`, this.#text, this.#token.start);
        }

        return node;
    }

    /** Reads a chain input: an input, an expression group, or an optional-access group. */
    #parseChainInput() {
        const token = this.#token;

        switch (token.type) {
            case '(': {
                // An expression group records the expression it holds, which a chain may then continue from, and groups a coalescing operator it holds.
                this.#advance();
                const expression = this.#parseExpression();
                this.#expect(')');
                this.#ungroupedCoalescings.delete(expression);

                return expression;
            }
            case '(?':
                return this.#parseOptionalAccessGroup();
            default:
                return this.#parseInput();
        }
    }

    /**
     * Reads an optional-access group: its member-access chain, a receiver followed by at least one member-access expression, every access of which is optional, held by the optional chain its closing parenthesis ends.
     * It is notation for those accesses, so it adds no node of its own.
     */
    #parseOptionalAccessGroup() {
        const start = this.#token.start;

        this.#advance();

        const receiverStart = this.#token.start;
        const { node, accesses } = this.#parseMemberAccessChain(this.#parseReceiver(), receiverStart);

        if (accesses === 0) {
            throw DomqlError.syntax('An optional-access group holds a receiver and at least one access after it, as (?@panel.first(".row").rect)', this.#text, this.#token.start);
        }

        if (this.#token.type !== ')') {
            throw this.#unexpected("')' closing the optional-access group, which holds accesses and calls alone");
        }

        this.#advance();

        return this.#recordSpan({ kind: 'optionalChain', target: node }, start);
    }

    /** Reads a receiver within an optional-access group: an input, or a grouped cast, its own target's accesses optional as the group's are, where its target is no group that keeps its own rules. */
    #parseReceiver() {
        const start = this.#token.start;

        if (this.#token.type === '(?') {
            throw DomqlError.syntax('The receiver of an optional-access group is `self`, a parameter, a literal, a local, an object expression or a grouped cast, as in (?@panel.first(".row").rect)', this.#text, start);
        }

        if (this.#token.type !== '(') {
            return this.#parseInput();
        }

        this.#advance();

        const targetStart = this.#token.start;
        const target = this.#parseCastTarget(targetStart);

        if (!this.#isKeyword('as')) {
            throw DomqlError.syntax('A group as the receiver of an optional-access group holds a cast, as in (?(@node.parent as "element").rect)', this.#text, this.#token.start);
        }

        const cast = this.#readCast(target, targetStart);

        this.#expect(')');

        return this.#spans.has(cast) ? cast : this.#recordSpan(cast, start);
    }

    /**
     * Reads the target of a cast that is the receiver of an optional-access group: a coalescing operator in parentheses or an optional-access group, each keeping its own rules as it does outside one,
     * or a receiver and the member-access expressions after it, every one of them optional.
     */
    #parseCastTarget(start) {
        if (this.#token.type === '(?' || (this.#token.type === '(' && !this.#groupHoldsCast())) {
            const target = this.#parseChainInput();

            if (target.kind !== 'coalescing' && target.kind !== 'optionalChain') {
                throw DomqlError.syntax(`A cast's target is a receiver and the member-access expressions after it, a coalescing operator in parentheses, or an optional-access group, and this is none of them`, this.#text, start);
            }

            if (this.#continuesChain() && this.#token.type !== '{') {
                throw DomqlError.syntax('A grouped target is cast as it is, with nothing after it but its cast, as in ((@a ?? @b) as "element")', this.#text, this.#token.start);
            }

            return target;
        }

        const { node, accesses } = this.#parseMemberAccessChain(this.#parseReceiver(), start);

        return accesses > 0 ? this.#recordSpan({ kind: 'optionalChain', target: node }, start) : node;
    }

    /**
     * Whether the group the current parenthesis opens holds a cast at its own level, outside any group, brackets or braces within it: one that holds `as` there and no `??` or other keyword,
     * since a cast's own level holds its target's receiver and accesses alone, while a coalescing operator's side or a conditional's branch may be a cast.
     */
    #groupHoldsCast() {
        let depth = 0;
        let holdsAs = false;

        for (let index = this.#index; index < this.#tokens.length; index++) {
            const token = this.#tokens[index];

            if (token.type === '(' || token.type === '(?' || token.type === '[' || token.type === '?[' || token.type === '{') {
                depth++;
            } else if (token.type === ')' || token.type === ']' || token.type === '}') {
                depth--;

                if (depth === 0) {
                    return holdsAs;
                }
            } else if (depth === 1 && token.type === '??') {
                return false;
            } else if (depth === 1 && token.type === 'keyword') {
                if (token.value !== 'as') {
                    return false;
                }

                holdsAs = true;
            } else if (token.type === 'end') {
                return false;
            }
        }

        return false;
    }

    /** Reads the rest of a member-access chain within an optional-access group, the member-access expressions after its receiver, every one of them optional, and how many there are. */
    #parseMemberAccessChain(receiver, start) {
        let node = receiver;
        let accesses = 0;

        while (this.#continuesChain() && this.#token.type !== '{') {
            if (this.#token.type === '[' || this.#token.type === '?[') {
                node = this.#parseAccessByName(node, start, true);
                accesses++;
                continue;
            }

            if (this.#token.type === ':' || this.#token.type === '?:') {
                node = this.#parseIndexer(node, start, true);
                accesses++;
                continue;
            }

            const optional = this.#token.type === '?.';

            this.#advance();
            this.#refuseDotBeforeBrackets(optional);

            node = this.#parseMemberAccessExpression(node, start, true);
            accesses++;
        }

        return { node, accesses };
    }

    /** Reads an input: a value, `self`, a parameter or a literal; a local; or an object expression. */
    #parseInput() {
        const token = this.#token;

        // A name that starts a chain is a local, which takes no argument, so one an argument follows is a member written without its receiver.
        if (token.type === 'name') {
            const next = this.#tokens[this.#index + 1];

            if (this.#startsConversion()) {
                throw DomqlError.syntax(`'to' converts the value written before it: write 'self to ${this.#text.slice(next.start, next.end)}' to convert the current value`, this.#text, token.start);
            }

            if (next.type === '(' || (next.spaced && ARGUMENT_STARTS.has(next.type))) {
                throw DomqlError.syntax(`'${token.value}' follows no receiver: write ${this.#memberForm(token.value)} for a member of the current value`, this.#text, token.start);
            }
        }

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
            default:
                throw this.#unexpected('a value');
        }
    }

    /** Whether the current token continues a chain: an access, an access by name, an indexer, each optional or not, or an object expression. */
    #continuesChain() {
        return CHAIN_CONTINUATIONS.has(this.#token.type);
    }

    /**
     * Reads an indexer after its receiver: `:`, or `?:` where it is optional, the indexer's name, or none for the receiver's default indexer, and its one key in brackets, an expression.
     * The parser knows no indexer: the vocabulary says which a name is and which is a receiver's default, and a bracket after the indexer's own is an access by name of what it answers.
     */
    #parseIndexer(target, start, optional) {
        this.#advance();

        if (this.#token.type !== 'name' && this.#token.type !== '[') {
            throw this.#unexpected('the name of an indexer, or its key in brackets for the default one, as in :attribute["id"] or :["id"]');
        }

        const name = this.#token.type === 'name' ? this.#token.value : null;
        const written = name === null ? 'The default indexer' : `The indexer '${name}'`;

        if (name !== null) {
            this.#advance();
        }

        if (this.#token.type !== '[') {
            throw DomqlError.syntax(`${written} takes its key in brackets, as in :${name}[…]`, this.#text, this.#token.start);
        }

        this.#advance();

        if (this.#token.type === ']') {
            throw DomqlError.syntax(`${written} takes one key in its brackets`, this.#text, this.#token.start);
        }

        const argument = this.#parseExpression();

        if (this.#token.type === ',') {
            throw DomqlError.syntax(`${written} takes one key`, this.#text, this.#token.start);
        }

        this.#expect(']');

        const node = name === null ? { kind: 'indexer', target, argument } : { kind: 'indexer', target, name, argument };

        return this.#recordSpan(optional ? { ...node, optional } : node, start);
    }

    /** Refuses brackets after the dot just read: an access by name follows its receiver with no dot, as `[…]`, or `?[…]` where it is optional. */
    #refuseDotBeforeBrackets(optional) {
        if (this.#token.type === '[' || this.#token.type === '?[') {
            const message = optional ? "An optional access by name is written '?[…]', with no dot before it" : "An access by name is written '[…]' after its receiver, with no dot before it";

            throw DomqlError.syntax(message, this.#text, this.#tokens[this.#index - 1].start);
        }
    }

    /**
     * Reads an access by name, its expression in brackets, which `?[` makes optional: a member access whose name is that expression's node, or the name itself where the expression is a string literal that is a name, as `.` writes it.
     */
    #parseAccessByName(target, start, optional) {
        this.#advance();

        const expression = this.#parseExpression();

        this.#expect(']');

        const name = expression.kind === 'literal' && Names.isName(expression.value) ? expression.value : expression;

        return this.#recordSpan(optional ? { kind: 'member', target, name, optional } : { kind: 'member', target, name }, start);
    }

    /** Reads a member-access expression after its dot, or the `?.` of an optional access: a member access, or a call expression where parentheses follow the name. */
    #parseMemberAccessExpression(target, start, optional) {
        const name = this.#expect('name').value;
        const access = optional ? { target, name, optional } : { target, name };

        // `(?` is one token, so a call's parenthesis cannot also open the optional-access group that is its argument.
        if (this.#token.type === '(?' && !this.#token.spaced) {
            throw DomqlError.syntax(`A call whose argument is an optional-access group writes the group in parentheses of its own: '.${name}((?…))'`, this.#text, this.#token.start);
        }

        if (this.#token.type !== '(') {
            if (this.#token.type === 'literal' || this.#token.type === 'parameter') {
                throw DomqlError.syntax(`An argument after a dot is enclosed in parentheses, as a call's is, '.${name}(…)'; an infix call follows its receiver after a space, without a dot`, this.#text, this.#token.start);
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

    /** Reads an infix call: its name and, after a separator, the chain input that is its argument; it ends its chain. */
    #parseInfixCall(target, start) {
        const name = this.#token.value;

        this.#advance();

        let node = { kind: 'infixCall', target, name };

        // A name a colon follows names the next field, which a comma comes before.
        if (this.#token.type === 'name' && this.#tokens[this.#index + 1].type === ':') {
            throw this.#unexpected("',' before the next field");
        }

        // An argument that can be left out is, where a conversion follows the infix call.
        if (CHAIN_INPUT_STARTS.has(this.#token.type) && !this.#startsConversion()) {
            if (!this.#token.spaced) {
                throw DomqlError.syntax(`The argument of '${name}' follows it after a space or a comment`, this.#text, this.#token.start);
            }

            node = { kind: 'infixCall', target, name, argument: this.#parseChainInput() };
        }

        this.#recordSpan(node, start);

        if (this.#continuesChain()) {
            throw DomqlError.syntax(`An infix call ends its chain; group it to continue from its result, as in '(… ${name} …).value'`, this.#text, this.#token.start);
        }

        return node;
    }

    /** How a member of the current value is written, for a name an argument follows with no receiver before it: a call, or an infix call. */
    #memberForm(name) {
        return this.#tokens[this.#index + 1].type === '(' ? `'self.${name}(…)'` : `'self ${name} …'`;
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
            this.#refuseUngroupedCoalescing(operands.at(-1), operator);
            this.#advance();
            operands.push(parseOperand());
        }

        this.#refuseUngroupedCoalescing(operands.at(-1), operator);

        return this.#recordSpan({ kind: operator, operands }, start);
    }

    /** Refuses a coalescing operator no group holds as an operand of `and` or `or`, which it never stands beside. */
    #refuseUngroupedCoalescing(operand, operator) {
        if (this.#ungroupedCoalescings.has(operand)) {
            throw DomqlError.syntax(`'??' and '${operator}' stand apart, one of them grouped: write '(… ?? …) ${operator} …' or '… ?? (… ${operator} …)'`, this.#text, this.#spans.get(operand).start);
        }
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
