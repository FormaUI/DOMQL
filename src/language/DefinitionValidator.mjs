/**
 * DefinitionValidator — a definition checked against DOMQL's structure, as its canonical, frozen copy
 */

import { ObjectUtils } from '../common/ObjectUtils.mjs';
import { DefinitionLocations } from './DefinitionLocations.mjs';
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
    indexer: { properties: ['kind', 'target', 'name', 'optional', 'argument'], required: ['target', 'argument'] },
    object: { properties: ['kind', 'target', 'locals', 'fields'], required: ['fields'] },
    optionalChain: { properties: ['kind', 'target'], required: ['target'] },
    equality: { properties: ['kind', 'left', 'right'], required: ['left', 'right'] },
    comparison: { properties: ['kind', 'operands', 'operators'], required: ['operands', 'operators'] },
    interpolatedString: { properties: ['kind', 'parts'], required: ['parts'] },
    conditional: { properties: ['kind', 'condition', 'binding', 'consequent', 'alternative'], required: ['consequent', 'alternative'] },
    arithmetic: { properties: ['kind', 'operator', 'left', 'right'], required: ['operator', 'left', 'right'] },
    negate: { properties: ['kind', 'operand'], required: ['operand'] },
    coalescing: { properties: ['kind', 'value', 'fallback'], required: ['value', 'fallback'] },
    not: { properties: ['kind', 'operand'], required: ['operand'] },
    cast: { properties: ['kind', 'type', 'target'], required: ['type', 'target'] },
    conversion: { properties: ['kind', 'type', 'target'], required: ['type', 'target'] },
    try: { properties: ['kind', 'target'], required: ['target'] },
    and: { properties: ['kind', 'operands'], required: ['operands'] },
    or: { properties: ['kind', 'operands'], required: ['operands'] },
};

/** The kinds of node that continue a chain through their target, and so carry its optional chain to the access their target is. */
const CHAIN_KINDS = new Set(['member', 'call', 'indexer', 'object']);

/** The kinds of node a cast's target can be, as text writes one: a receiver and its accesses, a coalescing operator, another cast, or an optional chain. */
const CAST_TARGET_KINDS = new Set(['self', 'parameter', 'local', 'literal', 'interpolatedString', 'object', 'member', 'call', 'indexer', 'optionalChain', 'coalescing', 'cast']);

/** The operators an arithmetic node holds. */
const ARITHMETIC_OPERATORS = ['+', '-', '*', '/', '%'];

/** The direction each comparison operator points, which every operator of a chain shares. */
/** The properties each kind of part of an interpolated string has. */
const INTERPOLATION_PARTS = Object.freeze({
    text: { properties: ['kind', 'value'], required: ['value'] },
    expression: { properties: ['kind', 'expression'], required: ['expression'] },
});

const COMPARISON_DIRECTIONS = Object.freeze({ '<': 'ascending', '<=': 'ascending', '>': 'descending', '>=': 'descending' });

/** The kinds of node `try` attempts: the operations with a rejection of their own, which an attempt answers null for. */
const ATTEMPTED_KINDS = new Set(['conversion', 'cast']);

/** What a local and a field of an object expression each hold: a name, always written, and a value. */
const ENTRY_PROPERTIES = { properties: ['name', 'value'], required: ['name', 'value'] };

/** Where a node's current value stands: absent at the top level, present in an object expression following a value, unknown in an argument. */
const CurrentValueAvailability = Object.freeze({ absent: 'absent', present: 'present', unknown: 'unknown' });

export class DefinitionValidator {
    /** Where in the definition its caller supplied each part of a canonical copy came from, for each copy whose validation moved a part. @type {WeakMap<object, DefinitionLocations>} */
    static #suppliedLocations = new WeakMap();

    #locations;

    /** The index each part of an interpolated string had in the definition being validated, by the canonical node, for each node whose parts validation moved. @type {WeakMap<object, number[]>} */
    #partIndexes = new WeakMap();

    /** Whether validation moved a part of the definition, which its locations then say. */
    #hasMovedParts = false;

    /** The names of the locals in scope where the node being validated stands. @type {Set<string>} */
    #localNames = new Set();

    /** The names of the locals declared later in a scope the node being validated stands in, the local whose value it is among them, which no parameter there may name. @type {Set<string>} */
    #laterNames = new Set();

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

        const validated = Object.freeze({ version: Specification.definitionVersion, query: this.#validateNode(definition.query, '/query', CurrentValueAvailability.absent) });

        // A definition parsed from text has its text's locations; one a caller supplied, where a part moved, has locations that name its parts as the caller did.
        if (this.#locations === null && this.#hasMovedParts) {
            DefinitionValidator.#suppliedLocations.set(validated, new DefinitionLocations(validated, this.#partIndexes));
        }

        return validated;
    }

    /** Where in the definition its caller supplied each part of the canonical copy came from, or null where validation moved none, so each part's pointer is the caller's. */
    static locationsOf(definition) {
        return DefinitionValidator.#suppliedLocations.get(definition) ?? null;
    }

    #validateNode(node, pointer, currentValueAvailability) {
        // A member that takes an argument is written as a call or an indexer, so an infix call is no node, and the message says which nodes take its place.
        if (ObjectUtils.isNonArrayObject(node) && node.kind === 'infixCall') {
            this.#fail(pointer, 'An infixCall is no node: an operation is a call node, or an indexer node for a named or default indexer');
        }

        if (!ObjectUtils.isNonArrayObject(node) || !Object.hasOwn(NODE_PROPERTIES, node.kind)) {
            this.#fail(pointer, 'A node is an object whose kind is literal, parameter, self, local, member, call, indexer, object, optionalChain, equality, comparison, interpolatedString, arithmetic, negate, conditional, coalescing, not, cast, conversion, try, and or or');
        }

        this.#requireProperties(node, pointer, NODE_PROPERTIES[node.kind]);

        const enclosingChain = this.#chain;

        // A chain continues through a property access's, a call's and an object expression's target alone, so any other node ends it.
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
                this.#requireBindingName(node.name, pointer);

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
            case 'indexer':
                return this.#validateMember(node, pointer, currentValueAvailability);
            case 'equality':
                return Object.freeze({
                    kind: 'equality',
                    left: this.#validateNode(node.left, `${pointer}/left`, currentValueAvailability),
                    right: this.#validateNode(node.right, `${pointer}/right`, currentValueAvailability),
                });
            case 'comparison':
                return this.#validateComparison(node, pointer, currentValueAvailability);
            case 'interpolatedString':
                return this.#validateInterpolatedString(node, pointer, currentValueAvailability);
            case 'arithmetic':
                if (!ARITHMETIC_OPERATORS.includes(node.operator)) {
                    this.#fail(`${pointer}/operator`, `An arithmetic operator is ${ARITHMETIC_OPERATORS.join(', ')}`);
                }

                return Object.freeze({
                    kind: 'arithmetic',
                    operator: node.operator,
                    left: this.#validateNode(node.left, `${pointer}/left`, currentValueAvailability),
                    right: this.#validateNode(node.right, `${pointer}/right`, currentValueAvailability),
                });
            case 'negate':
                return Object.freeze({ kind: 'negate', operand: this.#validateNode(node.operand, `${pointer}/operand`, currentValueAvailability) });
            case 'conditional':
                return this.#validateConditional(node, pointer, currentValueAvailability);
            case 'and':
            case 'or':
                return this.#validateLogical(node, pointer, currentValueAvailability);
            case 'optionalChain':
                return this.#validateOptionalChain(node, pointer, currentValueAvailability);
            case 'not':
                return Object.freeze({ kind: 'not', operand: this.#validateNode(node.operand, `${pointer}/operand`, currentValueAvailability) });
            case 'cast':
                return this.#validateCast(node, pointer, currentValueAvailability);
            case 'conversion':
                if (typeof node.type !== 'string') {
                    this.#fail(`${pointer}/type`, 'A conversion names the type it converts to by a string');
                }

                return Object.freeze({ kind: 'conversion', type: node.type, target: this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability) });
            case 'try':
                if (!ATTEMPTED_KINDS.has(node.target?.kind)) {
                    this.#fail(`${pointer}/target`, "What 'try' attempts is a conversion or a cast");
                }

                return Object.freeze({ kind: 'try', target: this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability) });
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

    /**
     * Validates a conditional: a condition or a binding, exactly one of them, its consequent and its alternative.
     * A binding's name is a name no local in scope has, in scope in the consequent alone, never in its own value or the alternative.
     */
    #validateConditional(node, pointer, currentValueAvailability) {
        if ((node.condition === undefined) === (node.binding === undefined)) {
            this.#fail(pointer, 'A conditional holds a condition or a binding, one of them');
        }

        if (node.condition !== undefined) {
            return Object.freeze({
                kind: 'conditional',
                condition: this.#validateNode(node.condition, `${pointer}/condition`, currentValueAvailability),
                consequent: this.#validateNode(node.consequent, `${pointer}/consequent`, currentValueAvailability),
                alternative: this.#validateNode(node.alternative, `${pointer}/alternative`, currentValueAvailability),
            });
        }

        const bindingPointer = `${pointer}/binding`;

        this.#requireProperties(node.binding, bindingPointer, ENTRY_PROPERTIES);
        this.#requireName(node.binding.name, `${bindingPointer}/name`);

        const { name } = node.binding;

        this.#requireLocalName(name, bindingPointer);

        const value = this.#validateWithLater([name], () => this.#validateNode(node.binding.value, `${bindingPointer}/value`, currentValueAvailability));

        if (this.#localNames.has(name)) {
            this.#fail(bindingPointer, `A local named '${name}' is already in scope, and a name means one thing wherever it is visible`);
        }

        const enclosingLocalNames = this.#localNames;

        this.#localNames = new Set(this.#localNames).add(name);

        let consequent;

        try {
            consequent = this.#validateNode(node.consequent, `${pointer}/consequent`, currentValueAvailability);
        } finally {
            this.#localNames = enclosingLocalNames;
        }

        return Object.freeze({
            kind: 'conditional',
            binding: Object.freeze({ name, value }),
            consequent,
            alternative: this.#validateNode(node.alternative, `${pointer}/alternative`, currentValueAvailability),
        });
    }

    /** Validates a cast: the quoted type it casts to, and its target, which is a receiver and its accesses, a coalescing operator, another cast, or an optional chain, as text can write one. */
    #validateCast(node, pointer, currentValueAvailability) {
        if (typeof node.type !== 'string') {
            this.#fail(`${pointer}/type`, 'A cast names the type it casts to by a string');
        }

        const target = this.#validateNode(node.target, `${pointer}/target`, currentValueAvailability);

        if (!CAST_TARGET_KINDS.has(target.kind) || (target.kind === 'object' && target.target !== undefined)) {
            this.#fail(`${pointer}/target`, "A cast's target is a receiver and the members after it, a coalescing operator in parentheses, or an optional enclosed access");
        }

        return Object.freeze({ kind: 'cast', type: node.type, target });
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

    /** Validates an and or an or: two or more expressions it combines, each with the current value the and or the or has. */
    #validateLogical(node, pointer, currentValueAvailability) {
        this.#requireArray(node.operands, `${pointer}/operands`);

        if (node.operands.length < 2) {
            this.#fail(`${pointer}/operands`, `An ${node.kind} combines two or more expressions`);
        }

        return Object.freeze({ kind: node.kind, operands: Object.freeze(node.operands.map((operand, index) => this.#validateNode(operand, `${pointer}/operands/${index}`, currentValueAvailability))) });
    }

    /** Validates a comparison: two or more operands, each with the current value the comparison has, and between each two of them a comparison operator, every one pointing one way. */
    #validateComparison(node, pointer, currentValueAvailability) {
        this.#requireArray(node.operands, `${pointer}/operands`);

        if (node.operands.length < 2) {
            this.#fail(`${pointer}/operands`, 'A comparison compares two or more expressions');
        }

        this.#requireArray(node.operators, `${pointer}/operators`);

        if (node.operators.length !== node.operands.length - 1) {
            this.#fail(`${pointer}/operators`, 'A comparison has an operator between each two of its operands, one fewer than they are');
        }

        node.operators.forEach((operator, index) => {
            if (!Object.hasOwn(COMPARISON_DIRECTIONS, operator)) {
                this.#fail(`${pointer}/operators/${index}`, 'A comparison operator is <, <=, > or >=');
            }

            if (COMPARISON_DIRECTIONS[operator] !== COMPARISON_DIRECTIONS[node.operators[0]]) {
                this.#fail(`${pointer}/operators/${index}`, 'A comparison chain keeps one direction: its operators are all < and <=, or all > and >=');
            }
        });

        return Object.freeze({
            kind: 'comparison',
            operands: Object.freeze(node.operands.map((operand, index) => this.#validateNode(operand, `${pointer}/operands/${index}`, currentValueAvailability))),
            operators: Object.freeze([...node.operators]),
        });
    }

    /**
     * Validates an interpolated string: its parts, each text, a string, or an expression, which has the current value the string has.
     * Adjacent text is one part and empty text none, so a string written in text and its definition hold the same parts.
     */
    #validateInterpolatedString(node, pointer, currentValueAvailability) {
        this.#requireArray(node.parts, `${pointer}/parts`);

        const parts = [];
        const indexes = [];

        node.parts.forEach((part, index) => {
            const partPointer = `${pointer}/parts/${index}`;

            if (!ObjectUtils.isNonArrayObject(part) || !Object.hasOwn(INTERPOLATION_PARTS, part.kind)) {
                this.#fail(partPointer, 'A part of an interpolated string is an object whose kind is text or expression');
            }

            this.#requireProperties(part, partPointer, INTERPOLATION_PARTS[part.kind]);

            if (part.kind === 'expression') {
                parts.push(Object.freeze({ kind: 'expression', expression: this.#validateNode(part.expression, `${partPointer}/expression`, currentValueAvailability) }));
                indexes.push(index);

                return;
            }

            if (typeof part.value !== 'string') {
                this.#fail(`${partPointer}/value`, 'The text of an interpolated string is a string');
            }

            if (part.value === '') {
                return;
            }

            const previous = parts.at(-1);

            if (previous?.kind === 'text') {
                parts[parts.length - 1] = Object.freeze({ kind: 'text', value: previous.value + part.value });
            } else {
                parts.push(Object.freeze({ kind: 'text', value: part.value }));
                indexes.push(index);
            }
        });

        const validated = Object.freeze({ kind: 'interpolatedString', parts: Object.freeze(parts) });

        // A part joined into the text before it, or empty and dropped, moves each after it, which a diagnostic still names by the index the caller gave it.
        if (indexes.some((original, index) => original !== index)) {
            this.#partIndexes.set(validated, indexes);
            this.#hasMovedParts = true;
        }

        return validated;
    }

    #validateLiteral(node, pointer) {
        const { value } = node;

        if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
            this.#fail(`${pointer}/value`, 'A literal is a string, a finite number, a Boolean or null');
        }

        return Object.freeze({ kind: 'literal', value });
    }

    /** Validates a property access, a call or an indexer: its name, its receiver, whether it is optional, which it is within an optional chain alone, and the one argument a call or an indexer takes, whose current value its declaration decides. */
    #validateMember(node, pointer, currentValueAvailability) {
        const name = node.kind === 'member' && ObjectUtils.isNonArrayObject(node.name) ? this.#validateNameExpression(node.name, `${pointer}/name`, currentValueAvailability) : node.name;

        // A name a bracket property access's expression gave is checked as that expression, and a default indexer has none; any other is a name, a call's always.
        if (name === node.name && !(node.kind === 'indexer' && name === undefined)) {
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
        const access = Object.freeze({ kind: node.kind, target, ...(name === undefined ? {} : { name }), ...(node.optional === true ? { optional: true } : {}) });

        if (node.kind === 'member' || node.argument === undefined) {
            return access;
        }

        this.#chain = null;

        const argument = this.#validateNode(node.argument, `${pointer}/argument`, CurrentValueAvailability.unknown);

        return Object.freeze({ ...access, argument });
    }

    /** Validates the expression a bracket property access holds, which continues no chain; a string literal that is a name is the name itself, as `.` writes it, so an access has one definition. */
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

        const names = locals.map(local => local?.name);

        return locals.map((local, index) => {
            const localPointer = `${pointer}/${index}`;
            this.#requireProperties(local, localPointer, ENTRY_PROPERTIES);
            this.#requireName(local.name, `${localPointer}/name`);
            this.#requireLocalName(local.name, localPointer);

            // A local's value and the locals before it see neither it nor the locals after it, whose names no parameter there reads.
            const value = this.#validateWithLater(names.slice(index), () => this.#validateNode(local.value, `${localPointer}/value`, currentValueAvailability));
            const { name } = local;

            if (this.#localNames.has(name)) {
                this.#fail(localPointer, `A local named '${name}' is already in scope, and a name means one thing wherever it is visible`);
            }

            this.#localNames = new Set(this.#localNames).add(name);

            return Object.freeze({ name, value });
        });
    }

    /** What validating answers, with the names given declared later in its scope besides those already. */
    #validateWithLater(names, validate) {
        const enclosingLaterNames = this.#laterNames;

        this.#laterNames = new Set([...this.#laterNames, ...names]);

        try {
            return validate();
        } finally {
            this.#laterNames = enclosingLaterNames;
        }
    }

    /**
     * Refuses a parameter that text could not write: one named as a local in scope where it stands, which the name reads there instead, and one named as a local declared later in its scope,
     * the local whose value it is among them, which a name reads only after its declaration and never as a binding of that name before it.
     */
    #requireBindingName(name, pointer) {
        if (this.#localNames.has(name)) {
            this.#fail(pointer, `'${name}' names the local in scope here, so no binding of that name is read where it is`);
        }

        if (this.#laterNames.has(name)) {
            this.#fail(pointer, `'${name}' is used before the local of that name is declared in its scope: a local is read after its declaration, and the name reads no binding before it`);
        }
    }

    /** Refuses a local named as a root, which its name stands for everywhere. */
    #requireLocalName(name, pointer) {
        if (name === 'document' || name === 'window') {
            this.#fail(pointer, `'${name}' names a root, which no local takes`);
        }
    }

    #requireProperties(part, pointer, { properties, required }) {
        if (!ObjectUtils.isNonArrayObject(part)) {
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
}
