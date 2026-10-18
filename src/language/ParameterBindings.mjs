/**
 * ParameterBindings — the values a query's parameters are bound to, by name
 */

import { ArrayUtils } from '../common/ArrayUtils.mjs';
import { ObjectUtils } from '../common/ObjectUtils.mjs';
import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';
import { Type } from './Type.mjs';

export class ParameterBindings {
    /** @type {Map<string, unknown>} */
    #values = new Map();

    /** @type {Map<string, Type>} */
    #types = new Map();

    /** @param {Record<string, unknown>} parameters Each parameter's name and the value it is bound to. */
    constructor(parameters = {}) {
        if (!ObjectUtils.isPlainObject(parameters)) {
            throw DomqlError.structure('Bindings are a plain object of names and the values bound to them', {});
        }

        for (const [name, value] of Object.entries(parameters)) {
            // A binding a reserved word names is read as `~` and its name, which written alone keeps its own meaning.
            if (!Names.isName(name)) {
                throw DomqlError.structure('A binding is named by a letter followed by letters and digits', { binding: name });
            }

            // A node is bound as its kind, asked once; anything else is data, checked and typed through its items and fields.
            const nodeKind = ParameterBindings.#nodeKindOf(value);

            if (nodeKind === null && !ParameterBindings.#isBindable(value, new Set())) {
                throw DomqlError.structure('A binding is a node, an element, a document, a fragment or a shadow root, or data: a number, a string, a Boolean, null, a list holding a value at every index, or an object', { binding: name });
            }

            const type = nodeKind === null ? ParameterBindings.#typeOf(value) : Type.createNamedType(nodeKind);

            if (type === null) {
                throw DomqlError.structure('A list whose items have different types has no type, since DOMQL has no union types and a list holds items of one type', { binding: name });
            }

            this.#types.set(name, type);
            this.#values.set(name, value);
        }
    }

    /** Whether a value is bound to the name. */
    has(name) {
        return this.#values.has(name);
    }

    /** The value bound to the name. */
    get(name) {
        return this.#values.get(name);
    }

    /** The type of the value bound to the name, which the value reveals. */
    getType(name) {
        return this.#types.get(name);
    }

    /**
     * What resolving a definition against these bindings depends on: each name with its type, and its value where that is a string, a number, a Boolean or null, since a bound string can select what a member reads.
     * Two bindings with one key resolve a definition alike, so they can share its resolution.
     */
    get resolutionKey() {
        return [...this.#types.keys()].sort().map(name => {
            const value = this.#values.get(name);
            const isPrimitive = value === null || ['string', 'number', 'boolean'].includes(typeof value);

            return `${name}:${this.#types.get(name)}${isPrimitive ? `=${JSON.stringify(value)}` : ''}`;
        }).join(';');
    }

    /**
     * The type a bindable value reveals: null is a null, a list's items share one type, nullable where one of them is null, the empty list's being never, and an object is of its fields' types.
     * Null where a list's items, at any depth, have different types, which no type holds.
     */
    static #typeOf(value) {
        if (value === null) {
            return Type.null;
        }

        const nodeKind = ParameterBindings.#nodeKindOf(value);

        if (nodeKind !== null) {
            return Type.createNamedType(nodeKind);
        }

        if (typeof value !== 'object') {
            return Type.createNamedType(typeof value);
        }

        if (Array.isArray(value)) {
            let itemType = Type.never;

            for (const item of value) {
                const type = ParameterBindings.#typeOf(item);

                itemType = type === null ? null : Type.merge(itemType, type);

                if (itemType === null) {
                    return null;
                }
            }

            return Type.createListType(itemType);
        }

        const fieldTypes = new Map();

        for (const [name, field] of Object.entries(value)) {
            const type = ParameterBindings.#typeOf(field);

            if (type === null) {
                return null;
            }

            fieldTypes.set(name, type);
        }

        return Type.createObjectType(fieldTypes);
    }

    /** The kind of node the value is, element, document, documentFragment or shadowRoot, or null where it is none of them. */
    static #nodeKindOf(value) {
        if (typeof Node === 'undefined' || !(value instanceof Node)) {
            return null;
        }

        switch (value.nodeType) {
            case Node.ELEMENT_NODE:
                return 'element';
            case Node.DOCUMENT_NODE:
                return 'document';
            case Node.DOCUMENT_FRAGMENT_NODE:
                return value.host === undefined ? 'documentFragment' : 'shadowRoot';
            default:
                return null;
        }
    }

    static #isBindable(value, ancestors) {
        if (ParameterBindings.#nodeKindOf(value) !== null) {
            return true;
        }

        return ParameterBindings.#isData(value, ancestors);
    }

    static #isData(value, ancestors) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') {
            return true;
        }

        if (typeof value === 'number') {
            return Number.isFinite(value);
        }

        if (typeof value !== 'object' || ancestors.has(value)) {
            return false;
        }

        if (!Array.isArray(value) && !ObjectUtils.isPlainObject(value)) {
            return false;
        }

        if (Array.isArray(value) && ArrayUtils.findMissingIndex(value) !== -1) {
            return false;
        }

        ancestors.add(value);
        const isData = Object.values(value).every(item => ParameterBindings.#isBindable(item, ancestors));
        ancestors.delete(value);

        return isData;
    }
}
