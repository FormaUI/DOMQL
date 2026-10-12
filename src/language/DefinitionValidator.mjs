/**
 * DefinitionValidator — a definition checked against DOMQL's structure, as its canonical, frozen copy
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';
import { Specification } from './Specification.mjs';

/** @typedef {import('./TextLocations.mjs').TextLocations} TextLocations */

/** The properties each kind of node holds, and those it requires. */
const NODES = {
    literal: { properties: ['kind', 'value'], required: ['value'] },
    parameter: { properties: ['kind', 'name'], required: ['name'] },
    self: { properties: ['kind'], required: [] },
    member: { properties: ['kind', 'target', 'name'], required: ['target', 'name'] },
    call: { properties: ['kind', 'target', 'name', 'argument'], required: ['target', 'name'] },
    namedOperation: { properties: ['kind', 'target', 'name', 'argument'], required: ['target', 'name'] },
    object: { properties: ['kind', 'target', 'fields'], required: ['fields'] },
    predicate: { properties: ['kind', 'verb', 'target', 'name'], required: ['verb', 'target', 'name'] },
    and: { properties: ['kind', 'operands'], required: ['operands'] },
    or: { properties: ['kind', 'operands'], required: ['operands'] },
};

/** The verbs a predicate expression reads its predicate under. */
const VERBS = ['is', 'has'];

/** What a field of an object expression holds: its name, always written, and its value. */
const FIELD = { properties: ['name', 'value'], required: ['name', 'value'] };

/** Where a node's current value stands: absent at the top level, present in an object expression following a value, unknown in an argument. */
const Scope = Object.freeze({ absent: 'absent', present: 'present', unknown: 'unknown' });

export class DefinitionValidator {
    #locations;

    /** @param {TextLocations | null} locations Where in a text each part of the definition came from, for one parsed from text. */
    constructor(locations = null) {
        this.#locations = locations;
    }

    /** Checks the definition's structure, returning its canonical, frozen copy. */
    validate(definition) {
        this.#requireProperties(definition, '', { properties: ['version', 'query'], required: ['version', 'query'] });

        if (definition.version !== Specification.definitionVersion) {
            this.#fail('/version', `A definition is of version ${Specification.definitionVersion}`);
        }

        return Object.freeze({ version: Specification.definitionVersion, query: this.#validateNode(definition.query, '/query', Scope.absent) });
    }

    #validateNode(node, pointer, scope) {
        if (!DefinitionValidator.#isObject(node) || !Object.hasOwn(NODES, node.kind)) {
            this.#fail(pointer, 'A node is an object whose kind is literal, parameter, self, member, call, namedOperation, object, predicate, and or or');
        }

        this.#requireProperties(node, pointer, NODES[node.kind]);

        switch (node.kind) {
            case 'literal':
                return this.#validateLiteral(node, pointer);
            case 'parameter':
                this.#requireName(node.name, `${pointer}/name`);

                return Object.freeze({ kind: 'parameter', name: node.name });
            case 'self':
                if (scope === Scope.absent) {
                    this.#fail(pointer, "'self' is the current value, and the top level has none; a chain there starts with a parameter, a literal or an object expression");
                }

                return Object.freeze({ kind: 'self' });
            case 'member':
            case 'call':
            case 'namedOperation':
                return this.#validateMember(node, pointer, scope);
            case 'predicate':
                return this.#validatePredicate(node, pointer, scope);
            case 'and':
            case 'or':
                return this.#validateLogical(node, pointer, scope);
            default:
                return this.#validateObject(node, pointer, scope);
        }
    }

    #validatePredicate(node, pointer, scope) {
        if (!VERBS.includes(node.verb)) {
            this.#fail(`${pointer}/verb`, 'A predicate expression reads its predicate under is or has');
        }

        const target = this.#validateNode(node.target, `${pointer}/target`, scope);
        const name = this.#validateName(node.name, `${pointer}/name`);

        return Object.freeze({ kind: 'predicate', verb: node.verb, target, name });
    }

    /** Validates the one name a predicate expression reads: a string or a parameter. */
    #validateName(node, pointer) {
        if (!DefinitionValidator.#isObject(node) || (node.kind !== 'literal' && node.kind !== 'parameter')) {
            this.#fail(pointer, 'A predicate expression names its predicate by a string or a parameter');
        }

        const name = this.#validateNode(node, pointer, Scope.unknown);

        if (name.kind === 'literal' && typeof name.value !== 'string') {
            this.#fail(`${pointer}/value`, 'A predicate is named by a string');
        }

        return name;
    }

    /** Validates an and or an or: two or more expressions it combines, each with the current value the and or the or has. */
    #validateLogical(node, pointer, scope) {
        this.#requireArray(node.operands, `${pointer}/operands`);

        if (node.operands.length < 2) {
            this.#fail(`${pointer}/operands`, `An ${node.kind} combines two or more expressions`);
        }

        return Object.freeze({ kind: node.kind, operands: Object.freeze(node.operands.map((operand, index) => this.#validateNode(operand, `${pointer}/operands/${index}`, scope))) });
    }

    #validateLiteral(node, pointer) {
        const { value } = node;

        if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
            this.#fail(`${pointer}/value`, 'A literal is a string, a finite number, a Boolean or null');
        }

        return Object.freeze({ kind: 'literal', value });
    }

    /** Validates a member access, a call or a named operation: its name, its receiver and the one argument a call or a named operation may take, whose current value its declaration decides. */
    #validateMember(node, pointer, scope) {
        this.#requireName(node.name, `${pointer}/name`);

        const target = this.#validateNode(node.target, `${pointer}/target`, scope);

        if (node.kind === 'member' || node.argument === undefined) {
            return Object.freeze({ kind: node.kind, target, name: node.name });
        }

        const argument = this.#validateNode(node.argument, `${pointer}/argument`, Scope.unknown);

        return Object.freeze({ kind: node.kind, target, name: node.name, argument });
    }

    #validateObject(node, pointer, scope) {
        const target = node.target === undefined ? undefined : this.#validateNode(node.target, `${pointer}/target`, scope);

        this.#requireArray(node.fields, `${pointer}/fields`);

        if (node.fields.length === 0) {
            this.#fail(pointer, 'An object expression names at least one field');
        }

        const fieldScope = target === undefined ? scope : Scope.present;

        /** @type {Set<string>} */
        const names = new Set();

        const fields = node.fields.map((field, index) => {
            const fieldPointer = `${pointer}/fields/${index}`;
            this.#requireProperties(field, fieldPointer, FIELD);
            this.#requireName(field.name, `${fieldPointer}/name`);

            const value = this.#validateNode(field.value, `${fieldPointer}/value`, fieldScope);
            const { name } = field;

            if (names.has(name)) {
                this.#fail(fieldPointer, `Two fields of one object expression are named '${name}'`);
            }

            names.add(name);

            return Object.freeze({ name, value });
        });

        return Object.freeze(target === undefined
            ? { kind: 'object', fields: Object.freeze(fields) }
            : { kind: 'object', target, fields: Object.freeze(fields) });
    }

    #requireProperties(part, pointer, { properties, required }) {
        if (!DefinitionValidator.#isObject(part)) {
            this.#fail(pointer, 'This part of a definition is an object');
        }

        for (const key of Object.keys(part)) {
            if (!properties.includes(key)) {
                this.#fail(pointer, `'${key}' is no property of this part of a definition`);
            }
        }

        for (const key of required) {
            if (!Object.hasOwn(part, key)) {
                this.#fail(pointer, `This part of a definition requires '${key}'`);
            }
        }
    }

    #requireArray(value, pointer) {
        if (!Array.isArray(value)) {
            this.#fail(pointer, 'This part of a definition is an array');
        }
    }

    #requireName(value, pointer) {
        if (!Names.isName(value)) {
            this.#fail(pointer, 'A name is a letter followed by letters and digits, and never true, false, null, is, has, and or or');
        }
    }

    #fail(pointer, message) {
        throw DomqlError.structure(message, this.#locations?.locate(pointer) ?? { pointer });
    }

    static #isObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
