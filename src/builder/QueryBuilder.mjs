/**
 * QueryBuilder — the builder of one query: it hands the build's callback `q`, records the query the callback describes as expressions, and binds the targets and values the query meets
 */

import { DefinitionWriter } from '../language/DefinitionWriter.mjs';
import { DomqlError } from '../language/DomqlError.mjs';
import { Specification } from '../language/Specification.mjs';
import { TypedBinding } from '../language/TypedBinding.mjs';
import { Expression } from './Expression.mjs';

export class QueryBuilder {
    /** The name each bound value is bound under. @type {Map<unknown, string>} */
    #names = new Map();

    /** The value each name is bound to. @type {Map<string, unknown>} */
    #values = new Map();

    #nextName = 1;

    /**
     * Calls the callback once with the builder, and returns the definition the query it answers records and the bindings it binds, by name.
     * @param {(q: { from: (target: unknown) => unknown }) => unknown} callback Describes the query, starting at `q.from`.
     * @returns {{ definition: object, bindings: Record<string, unknown> }}
     */
    static build(callback) {
        if (typeof callback !== 'function') {
            throw DomqlError.structure('A build takes the callback that describes its query, as `Domql.build(q => q.from(target)…)`', {});
        }

        const builder = new QueryBuilder();
        // `from` reads nothing of its receiver, so it works taken from the builder.
        const q = Object.freeze({ from: target => builder.#from(target) });
        const result = callback(q);
        const node = Expression.isExpression(result) ? Expression.nodeOf(result) : null;

        if (node === null) {
            throw DomqlError.structure('A build answers the query its callback describes, an expression that starts at `q.from`', {});
        }

        return { definition: { version: Specification.definitionVersion, query: node }, bindings: Object.fromEntries(builder.#values) };
    }

    /**
     * The failure, located further by its failing node written as DOMQL text, and the member that node is an argument of; a failure that names no node is as it was.
     * @param {unknown} error What failed as the built query was validated or resolved.
     * @param {object} definition The built definition.
     */
    static locate(error, definition) {
        const pointer = error instanceof DomqlError ? error.location.pointer : undefined;

        if (pointer === undefined || !pointer.startsWith('/query')) {
            return error;
        }

        let node = definition;
        let argumentOf;
        const segments = pointer.slice(1).split('/');

        for (const [index, segment] of segments.entries()) {
            if (node?.kind === 'member' && segment === 'arguments' && index < segments.length - 1) {
                argumentOf = node.name;
            }

            node = node?.[segment];
        }

        const failing = node?.kind === undefined ? node?.value : node;

        return failing?.kind === undefined ? error : error.relocate(argumentOf === undefined ? { text: DefinitionWriter.write(failing) } : { text: DefinitionWriter.write(failing), argumentOf });
    }

    /** A member read on the node: one without arguments, which a call gives them. */
    member(node, name) {
        return node === null ? { kind: 'member', name, arguments: [] } : { kind: 'member', target: node, name, arguments: [] };
    }

    /** The member the node is, called with the arguments: by position, and a plain object last gives them by name. */
    call(node, args) {
        if (node?.kind !== 'member' || node.arguments.length > 0) {
            throw DomqlError.structure(`Only a member is called, and once: ${node === null ? 'the current value' : `\`${DefinitionWriter.write(node)}\``} is not one`, {});
        }

        const last = args.at(-1);
        const named = QueryBuilder.#isPlainObject(last) ? Object.entries(last).map(([name, value]) => ({ name, value: this.#argument(value) })) : [];
        const positional = (named.length > 0 || QueryBuilder.#isPlainObject(last) ? args.slice(0, -1) : args).map(value => ({ value: this.#argument(value) }));

        return Expression.create({ ...node, arguments: [...positional, ...named] }, this);
    }

    /** An object expression that follows the node, whose fields the projection returns from an expression for the current value. */
    select(node, projection) {
        if (typeof projection !== 'function') {
            throw DomqlError.structure('`select` takes a projection, a function that returns the object\'s fields', {});
        }

        const fields = this.#fields(projection(Expression.create(null, this)));

        return Expression.create(node === null ? { kind: 'object', fields } : { kind: 'object', target: node, fields }, this);
    }

    /** A predicate expression of the node, reading the one predicate the name names: a string, or an expression of a parameter bound to one. */
    predicate(node, verb, name) {
        const nameNode = typeof name === 'string' ? { kind: 'literal', value: name } : Expression.isExpression(name) ? Expression.nodeOf(name) : null;

        if (nameNode?.kind !== 'literal' && nameNode?.kind !== 'parameter') {
            throw DomqlError.structure(`\`${verb}\` reads one predicate, named by a string or by a parameter \`q.from\` binds, and was given ${QueryBuilder.#describe(name)}; combine predicate expressions with \`and\` and \`or\``, {});
        }

        return Expression.create(node === null ? { kind: 'predicate', verb, name: nameNode } : { kind: 'predicate', verb, target: node, name: nameNode }, this);
    }

    /** The node and the expressions given combined by the operator, an and that follows an and continuing it, as the text that writes them reads. */
    logical(operator, node, others) {
        if (node === null) {
            throw DomqlError.structure(`\`${operator}\` follows an expression, never the current value itself`, {});
        }

        if (others.length === 0 || !others.every(other => Expression.isExpression(other))) {
            throw DomqlError.structure(`\`${operator}\` combines expressions, and was given ${others.length === 0 ? 'none' : others.map(other => (Expression.isExpression(other) ? 'an expression' : QueryBuilder.#describe(other))).join(', ')}`, {});
        }

        const rest = others.map(other => this.#nodeOf(other, `An operand of \`${operator}\``));

        return Expression.create({ kind: operator, operands: node.kind === operator ? [...node.operands, ...rest] : [node, ...rest] }, this);
    }

    /** Where a query starts: the document or the window as the roots they stand for, a value bound under the name an object gives it, or one bound under a name the build gives. */
    #from(target) {
        const root = QueryBuilder.#rootOf(target);

        if (root !== null) {
            return Expression.create({ kind: 'parameter', name: root }, this);
        }

        if (QueryBuilder.#isPlainObject(target)) {
            const entries = Object.entries(target);

            if (entries.length !== 1) {
                throw DomqlError.structure('`q.from({ name: value })` names one target', {});
            }

            return Expression.create({ kind: 'parameter', name: this.#bind(entries[0][1], entries[0][0]) }, this);
        }

        if (target === null || typeof target !== 'object') {
            throw DomqlError.structure('`q.from` starts at an element, the document, the window, a typed binding or `{ name: value }`', {});
        }

        return Expression.create({ kind: 'parameter', name: this.#bind(target) }, this);
    }

    /** An argument's node: an expression's node, a function's expression argument over each item, a literal, or a parameter the value is bound to. */
    #argument(value) {
        if (Expression.isExpression(value)) {
            return this.#nodeOf(value, 'An argument');
        }

        if (typeof value === 'function') {
            return this.#expressionArgument(value(Expression.create(null, this)));
        }

        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
            return { kind: 'literal', value };
        }

        return { kind: 'parameter', name: QueryBuilder.#rootOf(value) ?? this.#bind(value) };
    }

    /** What an expression argument answers for each item: an expression or a literal, though not `true` or `false`, which `!` and `===` over an expression answer. */
    #expressionArgument(result) {
        if (Expression.isExpression(result)) {
            return this.#nodeOf(result, 'An expression argument');
        }

        if (result === null || ['string', 'number'].includes(typeof result)) {
            return { kind: 'literal', value: result };
        }

        throw DomqlError.structure(`An expression argument answers an expression, a string, a number or null, and this one answers ${QueryBuilder.#describe(result)}, which \`!\`, \`===\` and other operators over an expression answer as the query is built`, {});
    }

    /** A projection's fields, in order: each an expression, a nested object, or a string, a number or null as it is written. */
    #fields(object) {
        if (!QueryBuilder.#isPlainObject(object)) {
            throw DomqlError.structure('A projection returns an object whose properties are the fields of the object expression', {});
        }

        return Object.entries(object).map(([name, value]) => ({ name, value: this.#field(name, value) }));
    }

    #field(name, value) {
        if (Expression.isExpression(value)) {
            return this.#nodeOf(value, `The field '${name}'`);
        }

        if (QueryBuilder.#isPlainObject(value)) {
            return { kind: 'object', fields: this.#fields(value) };
        }

        if (value === null || ['string', 'number'].includes(typeof value)) {
            return { kind: 'literal', value };
        }

        throw DomqlError.structure(`The field '${name}' is an expression, a nested object, a string, a number or null, and is ${QueryBuilder.#describe(value)}; \`true\` and \`false\` are refused, since \`!\` and \`===\` over an expression answer them as the query is built, so a Boolean field is written in text`, {});
    }

    #nodeOf(expression, what) {
        const node = Expression.nodeOf(expression);

        if (node === null) {
            throw DomqlError.structure(`${what} is an expression, never the current value itself`, {});
        }

        return node;
    }

    /** The name the value is bound under: the one it was given, the one asked for, or the next the build gives. */
    #bind(value, name = undefined) {
        const given = this.#names.get(value);

        if (given !== undefined) {
            if (name !== undefined && name !== given) {
                throw DomqlError.structure(`One value is bound twice, as '${given}' and as '${name}'`, { binding: name });
            }

            return given;
        }

        if (name !== undefined && this.#values.has(name)) {
            throw DomqlError.structure(`The name '${name}' is given to two values`, { binding: name });
        }

        let bound = name;

        while (bound === undefined || this.#values.has(bound)) {
            bound = `p${this.#nextName++}`;
        }

        this.#names.set(value, bound);
        this.#values.set(bound, value);

        return bound;
    }

    /** The root the document or the window stands as, wherever a build meets it, `document` or `window`, or null for any other value. */
    static #rootOf(value) {
        if (value?.nodeType === 9) {
            return 'document';
        }

        return value !== null && value !== undefined && value.window === value ? 'window' : null;
    }

    static #isPlainObject(value) {
        if (typeof value !== 'object' || value === null || value instanceof TypedBinding) {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);

        return prototype === Object.prototype || prototype === null;
    }

    static #describe(value) {
        return typeof value === 'boolean' || value === undefined ? String(value) : `a ${typeof value}`;
    }
}
