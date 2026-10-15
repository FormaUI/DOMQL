/**
 * DefinitionValidator — a definition checked against DOMQL's structure, as its canonical, frozen copy
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';
import { Specification } from './Specification.mjs';

/** @typedef {import('./TextLocations.mjs').TextLocations} TextLocations */

/** The properties each kind of node holds, and those it requires. */
const NODE_PROPERTIES = {
    literal: { properties: ['kind', 'value'], required: ['value'] },
    parameter: { properties: ['kind', 'name'], required: ['name'] },
    self: { properties: ['kind'], required: [] },
    local: { properties: ['kind', 'name'], required: ['name'] },
    member: { properties: ['kind', 'target', 'name', 'optional'], required: ['target', 'name'] },
    call: { properties: ['kind', 'target', 'name', 'optional', 'argument'], required: ['target', 'name'] },
    infixCall: { properties: ['kind', 'target', 'name', 'argument'], required: ['target', 'name'] },
    object: { properties: ['kind', 'target', 'locals', 'fields'], required: ['fields'] },
    optionalChain: { properties: ['kind', 'target'], required: ['target'] },
    predicate: { properties: ['kind', 'verb', 'target', 'name'], required: ['verb', 'target', 'name'] },
    conditional: { properties: ['kind', 'condition', 'consequent', 'alternative'], required: ['condition', 'consequent', 'alternative'] },
    coalescing: { properties: ['kind', 'value', 'fallback'], required: ['value', 'fallback'] },
    and: { properties: ['kind', 'operands'], required: ['operands'] },
    or: { properties: ['kind', 'operands'], required: ['operands'] },
};

/** The kinds of node that continue a chain through their target, and so carry its optional chain to the access their target is. */
const CHAIN_KINDS = new Set(['member', 'call', 'object']);

/** The verbs a predicate expression reads its predicate under. */
const VERBS = ['is', 'has'];

/** What a local and a field of an object expression each hold: a name, always written, and a value. */
const ENTRY_PROPERTIES = { properties: ['name', 'value'], required: ['name', 'value'] };

/** Where a node's current value stands: absent at the top level, present in an object expression following a value, unknown in an argument. */
const CurrentValueAvailability = Object.freeze({ absent: 'absent', present: 'present', unknown: 'unknown' });

export class DefinitionValidator {
    #locations;

    /** The names of the locals in scope where the node being validated stands. @type {Set<string>} */
    #localNames = new Set();

    /** The optional chain the node being validated continues, with whether an access of it is optional so far; null where it continues none. @type {{ hasOptional: boolean } | null} */
    #chain = null;

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

        return Object.freeze({ version: Specification.definitionVersion, query: this.#validateNode(definition.query, '/query', CurrentValueAvailability.absent) });
    }

    #validateNode(node, pointer, currentValueAvailability) {
        if (!DefinitionValidator.#isObject(node) || !Object.hasOwn(NODE_PROPERTIES, node.kind)) {
            this.#fail(pointer, 'A node is an object whose kind is literal, parameter, self, local, member, call, infixCall, object, optionalChain, predicate, conditional, coalescing, and or or');
        }

        this.#requireProperties(node, pointer, NODE_PROPERTIES[node.kind]);

        const enclosingChain = this.#chain;

        // A chain continues through a member access's, a call's and an object expression's target alone, so any other node ends it.
        if (!CHAIN_KINDS.has(node.kind)) {
            this.#chain = null;
        }

        try {
            return this.#validateKind(node, pointer, currentValueAvailability);
        } finally {
            this.#chain = enclosingChain;
        }
    }

    #validateKind(node, pointer, currentValueAvailability) {
        switch (node.kind) {
            case 'literal':
                return this.#validateLiteral(node, pointer);
            case 'parameter':
                this.#requireName(node.name, `${pointer}/name`);

                return Object.freeze({ kind: 'parameter', name: node.name });
            case 'self':
                if (currentValueAvailability === CurrentValueAvailability.absent) {
                    this.#fail(pointer, "'self' is the current value, and the top level has none; a chain there starts with a parameter, a literal or an object expression");
                }

                return Object.freeze({ kind: 'self' });
            case 'local':
                this.#requireName(node.name, `${pointer}/name`);

                return Object.freeze({ kind: 'local', name: node.name });
            case 'member':
            case 'call':
            case 'infixCall':
                return this.#validateMember(node, pointer, currentValueAvailability);
            case 'predicate':
                return this.#validatePredicate(node, pointer, currentValueAvailability);
            case 'conditional':
                return Object.freeze({
                    kind: 'conditional',
                    condition: this.#validateNode(node.condition, `${pointer}/condition`, currentValueAvailability),
                    consequent: this.#validateNode(node.consequent, `${pointer}/consequent`, currentValueAvailability),
                    alternative: this.#validateNode(node.alternative, `${pointer}/alternative`, currentValueAvailability),
                });
            case 'and':
            case 'or':
                return this.#validateLogical(node, pointer, currentValueAvailability);
            case 'optionalChain':
                return this.#validateOptionalChain(node, pointer, currentValueAvailability);
            case 'coalescing':
                return Object.freeze({
                    kind: 'coalescing',
                    value: this.#validateNode(node.value, `${pointer}/value`, currentValueAvailability),
                    fallback: this.#validateNode(node.fallback, `${pointer}/fallback`, currentValueAvailability),
                });
            default:
                return this.#validateObject(node, pointer, currentValueAvailability);
        }
    }

    /** Validates an optional chain: the chain whose optional accesses end at it, at least one of them, since a chain with none is the chain alone. */
    #validateOptionalChain(node, pointer, currentValueAvailability) {
        const chain = { hasOptional: false };

        this.#chain = chain;

        const target = this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability);

        if (!chain.hasOptional) {
            this.#fail(pointer, 'An optional chain holds a chain with an optional access, written ?.');
        }

        return Object.freeze({ kind: 'optionalChain', target });
    }

    #validatePredicate(node, pointer, currentValueAvailability) {
        if (!VERBS.includes(node.verb)) {
            this.#fail(`${pointer}/verb`, 'A predicate expression reads its predicate under is or has');
        }

        const target = this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability);
        const name = this.#validateName(node.name, `${pointer}/name`, node.verb);

        return Object.freeze({ kind: 'predicate', verb: node.verb, target, name });
    }

    /** Validates the one name a predicate expression reads: a string or a parameter, or under `is` the null it tests for. */
    #validateName(node, pointer, verb) {
        if (!DefinitionValidator.#isObject(node) || (node.kind !== 'literal' && node.kind !== 'parameter')) {
            this.#fail(pointer, 'A predicate expression names its predicate by a string or a parameter');
        }

        const name = this.#validateNode(node, pointer, CurrentValueAvailability.unknown);

        if (name.kind === 'literal' && typeof name.value !== 'string' && !(name.value === null && verb === 'is')) {
            this.#fail(`${pointer}/value`, verb === 'is' ? 'A predicate is named by a string, and is null tests for null' : `A predicate is named by a string, and '${verb}' takes no null`);
        }

        return name;
    }

    /** Validates an and or an or: two or more expressions it combines, each with the current value the and or the or has. */
    #validateLogical(node, pointer, currentValueAvailability) {
        this.#requireArray(node.operands, `${pointer}/operands`);

        if (node.operands.length < 2) {
            this.#fail(`${pointer}/operands`, `An ${node.kind} combines two or more expressions`);
        }

        return Object.freeze({ kind: node.kind, operands: Object.freeze(node.operands.map((operand, index) => this.#validateNode(operand, `${pointer}/operands/${index}`, currentValueAvailability))) });
    }

    #validateLiteral(node, pointer) {
        const { value } = node;

        if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
            this.#fail(`${pointer}/value`, 'A literal is a string, a finite number, a Boolean or null');
        }

        return Object.freeze({ kind: 'literal', value });
    }

    /** Validates a member access, a call or an infix call: its name, its receiver, whether an access or a call is optional, which it is within an optional chain alone, and the one argument a call or an infix call may take, whose current value its declaration decides. */
    #validateMember(node, pointer, currentValueAvailability) {
        const name = node.kind === 'member' && DefinitionValidator.#isObject(node.name) ? this.#validateNameExpression(node.name, `${pointer}/name`, currentValueAvailability) : node.name;

        // A name an access by name's expression gave is checked as that expression; any other is a name, a call's and an infix call's always.
        if (name === node.name) {
            this.#requireName(name, `${pointer}/name`);
        }

        if (node.optional !== undefined) {
            if (node.optional !== true) {
                this.#fail(`${pointer}/optional`, 'An optional access holds optional: true, and a required one leaves it out');
            }

            if (this.#chain === null) {
                this.#fail(pointer, 'An optional access stands within an optional chain, which ends where a null receiver ends it');
            }

            this.#chain.hasOptional = true;
        }

        const target = this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability);
        const access = Object.freeze({ kind: node.kind, target, name, ...(node.optional === true ? { optional: true } : {}) });

        if (node.kind === 'member' || node.argument === undefined) {
            return access;
        }

        this.#chain = null;

        const argument = this.#validateNode(node.argument, `${pointer}/argument`, CurrentValueAvailability.unknown);

        return Object.freeze({ ...access, argument });
    }

    /** Validates the expression an access by name holds, which continues no chain; a string literal that is a name is the name itself, as `.` writes it, so an access has one definition. */
    #validateNameExpression(node, pointer, currentValueAvailability) {
        const enclosingChain = this.#chain;

        this.#chain = null;

        try {
            const expression = this.#validateNode(node, pointer, currentValueAvailability);

            return expression.kind === 'literal' && Names.isName(expression.value) ? expression.value : expression;
        } finally {
            this.#chain = enclosingChain;
        }
    }

    #validateObject(node, pointer, currentValueAvailability) {
        const target = node.target === undefined ? undefined : this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability);

        this.#requireArray(node.fields, `${pointer}/fields`);

        if (node.fields.length === 0) {
            this.#fail(pointer, 'An object expression names at least one field');
        }

        const fieldCurrentValueAvailability = target === undefined ? currentValueAvailability : CurrentValueAvailability.present;
        const enclosingLocalNames = this.#localNames;

        // An object expression's entries continue no chain of the one it follows.
        this.#chain = null;

        try {
            const locals = node.locals === undefined ? [] : this.#validateLocals(node.locals, `${pointer}/locals`, fieldCurrentValueAvailability);

            /** @type {Set<string>} */
            const names = new Set();

            const fields = node.fields.map((field, index) => {
                const fieldPointer = `${pointer}/fields/${index}`;
                this.#requireProperties(field, fieldPointer, ENTRY_PROPERTIES);
                this.#requireName(field.name, `${fieldPointer}/name`);

                const value = this.#validateNode(field.value, `${fieldPointer}/value`, fieldCurrentValueAvailability);
                const { name } = field;

                if (names.has(name)) {
                    this.#fail(fieldPointer, `Two fields of one object expression are named '${name}'`);
                }

                names.add(name);

                return Object.freeze({ name, value });
            });

            return Object.freeze({
                kind: 'object',
                ...(target === undefined ? {} : { target }),
                ...(locals.length === 0 ? {} : { locals: Object.freeze(locals) }),
                fields: Object.freeze(fields),
            });
        } finally {
            this.#localNames = enclosingLocalNames;
        }
    }

    /** Validates an object expression's locals in order, each seeing those before it, and leaves every one in scope for its fields; no local reuses a name in scope. */
    #validateLocals(locals, pointer, currentValueAvailability) {
        this.#requireArray(locals, pointer);

        return locals.map((local, index) => {
            const localPointer = `${pointer}/${index}`;
            this.#requireProperties(local, localPointer, ENTRY_PROPERTIES);
            this.#requireName(local.name, `${localPointer}/name`);

            const value = this.#validateNode(local.value, `${localPointer}/value`, currentValueAvailability);
            const { name } = local;

            if (this.#localNames.has(name)) {
                this.#fail(localPointer, `A local named '${name}' is already in scope, and a name means one thing wherever it is visible`);
            }

            this.#localNames = new Set(this.#localNames).add(name);

            return Object.freeze({ name, value });
        });
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
            this.#fail(pointer, `A name is a letter followed by letters and digits, and no reserved word: ${Names.reservedWords.join(', ')}`);
        }
    }

    #fail(pointer, message) {
        throw DomqlError.structure(message, this.#locations?.locate(pointer) ?? { pointer });
    }

    static #isObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}
