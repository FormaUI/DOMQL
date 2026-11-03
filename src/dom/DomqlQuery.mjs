/**
 * DomqlQuery — a query object: a request's definition and the values its parameters are bound to, through which every operation on the request is carried out
 */

import { nexo } from '@formaui-net/nexo';

/**
 * What carries a query object's operations out, in the DOMQL instance that made it, and binds its parameters there.
 * @typedef {object} QueryOperations
 * @property {(values: Record<string, unknown>, options?: { types?: Record<string, string> }) => object} bind
 * @property {(query: DomqlQuery, options?: object) => object} resolve
 * @property {(query: DomqlQuery, path: (string | number)[], options?: object) => unknown} evaluate
 * @property {(query: DomqlQuery, path: (string | number)[], options?: object) => Promise<unknown>} evaluateAsync
 * @property {(query: DomqlQuery, path: (string | number)[], options?: object) => object} watch
 * @property {(query: DomqlQuery, handler: Function, options?: object) => object} subscribe
 * @property {(query: DomqlQuery, options?: object) => Promise<unknown>} executeAsync
 * @property {(query: DomqlQuery, options?: object) => object} run
 */

export class DomqlQuery {
    #definition;
    #bindings;
    #values;
    #options;
    #operations;

    /**
     * @param {object} definition The request's validated, frozen definition.
     * @param {object} bindings The values its parameters are bound to, as the registry it is resolved against binds them.
     * @param {QueryOperations} operations What carries its operations out.
     * @param {Record<string, unknown>} values The values given by parameter name, which `bindings` binds.
     * @param {{ types?: Record<string, string> }} [options] The bindings' options, the types they declare among them, which every binding of this query and of the queries `with` makes from it keeps.
     */
    constructor(definition, bindings, operations, values, options) {
        this.#definition = definition;
        this.#bindings = bindings;
        this.#operations = operations;
        this.#values = values;
        this.#options = options;
    }

    /** The immutable definition, without its bindings. */
    get definition() {
        return this.#definition;
    }

    /** The values a query's parameters are bound to, which DOMQL prepares and evaluates it with; no part of a query object's API, which binds anew through `with`. */
    static bindingsOf(query) {
        return query.#bindings;
    }

    /** Whether the value is a query object itself, as this instance made it, rather than another instance's or anything standing in for one. */
    static isQuery(value) {
        return value !== null && typeof value === 'object' && #values in value;
    }

    /** The values given by parameter name, as the caller gave them, which a reaction binds again beside its event; no part of a query object's API. */
    static valuesOf(query) {
        return query.#values;
    }

    /** A new query object with the same definition, bound to these bindings, which replace the old ones whole, each of the type this query declares for it; this one, and every operation running from it, are unaffected. */
    with(bindings) {
        return new DomqlQuery(this.#definition, this.#operations.bind(bindings, this.#options), this.#operations, bindings, this.#options);
    }

    /** The request validated against the vocabulary and typed, without evaluating anything; its options resolve it as a watch would. */
    resolve(options) {
        return this.#operations.resolve(this, options);
    }

    /** A part of the query's result, whose path's shape is checked at once and its fit when an operation resolves the query. */
    select(...path) {
        nexo.paths.validate(path);

        return new DomqlSelection(this, path, this.#operations);
    }

    /** Evaluates the query once, synchronously, answering detached, immutable data; a maintained member that needs a sample fails it. */
    evaluate(options) {
        return this.#operations.evaluate(this, [], options);
    }

    /** Evaluates the query once, waiting for the first sample of every maintained member it reads, and answers a promise of detached, immutable data. */
    evaluateAsync(options) {
        return this.#operations.evaluateAsync(this, [], options);
    }

    /** Starts a watch of the query and answers its handle, whose listeners receive its results. */
    watch(options) {
        return this.#operations.watch(this, [], options);
    }

    /** Listens to the subscription's event source from the call on, calling the handler with the event listener and each event's result, and answers the event listener. */
    subscribe(handler, options) {
        return this.#operations.subscribe(this, handler, options);
    }

    /** Carries out the once execution the request ends in, and answers a promise of its result. */
    executeAsync(options) {
        return this.#operations.executeAsync(this, options);
    }

    /** Runs the continuous execution the request ends in, which has started once the call returns, and answers its handle. */
    run(options) {
        return this.#operations.run(this, options);
    }
}

/** A part of a query's result: it belongs to the query, and every operation on it starts work of its own on the whole query. */
class DomqlSelection {
    #query;
    #path;
    #operations;

    constructor(query, path, operations) {
        this.#query = query;
        this.#path = path;
        this.#operations = operations;
    }

    /** A smaller part, as `query.select` with the longer path. */
    select(...path) {
        nexo.paths.validate(path);

        return new DomqlSelection(this.#query, [...this.#path, ...path], this.#operations);
    }

    /** Evaluates the whole query once, synchronously, answering the part. */
    evaluate(options) {
        return this.#operations.evaluate(this.#query, this.#path, options);
    }

    /** Evaluates the whole query once, waiting for its maintained members, answering a promise of the part. */
    evaluateAsync(options) {
        return this.#operations.evaluateAsync(this.#query, this.#path, options);
    }

    /** Starts a watch of the whole query whose snapshots are the part, raised where the part changed. */
    watch(options) {
        return this.#operations.watch(this.#query, this.#path, options);
    }
}
