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
    root: { properties: ['kind', 'name'], required: ['name'] },
    context: { properties: ['kind'], required: [] },
    local: { properties: ['kind', 'name'], required: ['name'] },
    member: { properties: ['kind', 'target', 'name', 'optional'], required: ['target', 'name'] },
    call: { properties: ['kind', 'target', 'name', 'optional', 'arguments'], required: ['target', 'name', 'arguments'] },
    indexer: { properties: ['kind', 'target', 'name', 'optional', 'argument'], required: ['target', 'argument'] },
    object: { properties: ['kind', 'target', 'locals', 'fields'], required: ['fields'] },
    optionalChain: { properties: ['kind', 'target'], required: ['target'] },
    equality: { properties: ['kind', 'left', 'right'], required: ['left', 'right'] },
    comparison: { properties: ['kind', 'operands', 'operators'], required: ['operands', 'operators'] },
    interpolatedString: { properties: ['kind', 'parts'], required: ['parts'] },
    conditional: { properties: ['kind', 'condition', 'binding', 'consequent', 'alternative'], required: ['consequent', 'alternative'] },
    body: { properties: ['kind', 'bindings', 'result'], required: ['bindings', 'result'] },
    function: { properties: ['kind', 'parameters', 'body'], required: ['parameters', 'body'] },
    functionCall: { properties: ['kind', 'name', 'arguments'], required: ['name', 'arguments'] },
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
const CAST_TARGET_KINDS = new Set(['context', 'parameter', 'root', 'local', 'literal', 'interpolatedString', 'functionCall', 'object', 'member', 'call', 'indexer', 'optionalChain', 'coalescing', 'cast']);

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

/** Where a node's evaluation context stands: absent at the top level, present in an object expression following a value, unknown in an argument. */
const CurrentValueAvailability = Object.freeze({ absent: 'absent', present: 'present', unknown: 'unknown' });

export class DefinitionValidator {
    /** Where in the definition its caller supplied each part of a canonical copy came from, for each copy whose validation moved a part. @type {WeakMap<object, DefinitionLocations>} */
    static #suppliedLocations = new WeakMap();

    #locations;

    /** The index each part of an interpolated string had in the definition being validated, by the canonical node, for each node whose parts validation moved. @type {WeakMap<object, number[]>} */
    #partIndexes = new WeakMap();

    /** Whether validation moved a part of the definition, which its locations then say. */
    #hasMovedParts = false;

    /** The names of the locals and the fields in scope where the node being validated stands. @type {Set<string>} */
    #localNames = new Set();

    /** The names of the locals declared later in a scope the node being validated stands in, the local whose value it is among them, which no parameter there may name. @type {Set<string>} */
    #laterNames = new Set();

    /** The optional chain the node being validated continues, with whether an access of it is optional so far; null where it continues none. @type {{ hasOptional: boolean } | null} */
    #chain = null;

    /**
     * The simple expression the node being validated stands in, an argument, an indexer's key, a bracket property access's name or an interpolation's expression, with what its message calls it and whether a conditional holds the node;
     * null outside one. A simple expression nested in another keeps the conditional that holds it.
     * @type {{ holder: string, isInConditional: boolean } | null}
     */
    #simpleExpression = null;

    /** The parameters of a definition parsed from text that were written with `~`, which read the caller's binding wherever they stand; null for a definition not parsed from text. @type {WeakSet<object> | null} */
    #externals;

    /**
     * @param {TextLocations | null} locations Where in a text each part of the definition came from, for one parsed from text.
     * @param {WeakSet<object> | null} externals The parameters a text wrote with `~`, for one parsed from text.
     */
    constructor(locations = null, externals = null) {
        this.#locations = locations;
        this.#externals = externals;
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
            this.#fail(pointer, 'A node is an object whose kind is literal, parameter, root, context, local, member, call, indexer, object, optionalChain, equality, comparison, interpolatedString, body, function, functionCall, arithmetic, negate, conditional, coalescing, not, cast, conversion, try, and or or');
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
                if (!Names.isName(node.name)) {
                    this.#fail(`${pointer}/name`, 'A binding is named by a letter followed by letters and digits');
                }

                // A name a text wrote alone reads the local in scope of its name, so one before a later local of its name reads nothing; `~` and a definition's parameter read the caller's binding wherever they stand.
                if (this.#locations !== null && !this.#externals?.has(node)) {
                    this.#requireBindingName(node.name, pointer);
                }

                return Object.freeze({ kind: 'parameter', name: node.name });
            case 'root':
                if (!Names.isRoot(node.name)) {
                    this.#fail(`${pointer}/name`, 'A root is document or window');
                }

                return Object.freeze({ kind: 'root', name: node.name });
            case 'context':
                if (currentValueAvailability === CurrentValueAvailability.absent) {
                    this.#fail(pointer, "'context' is the evaluation context, and the top level has none; a chain there starts with a parameter, a literal or an object expression");
                }

                return Object.freeze({ kind: 'context' });
            case 'local':
                this.#requireName(node.name, `${pointer}/name`);

                // A local is read where one of its name, or a field, is in scope, which `@` and a reserved word name as a name written alone does any other.
                if (!this.#localNames.has(node.name)) {
                    this.#fail(pointer, `No local or field named '${node.name}' is in scope. Use '~${node.name}' to read the caller's binding.`);
                }

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
            case 'body':
                return this.#validateBody(node, pointer, currentValueAvailability);
            case 'function':
                this.#fail(pointer, 'A function is the value of a local, as let name = function(…) … end, and stands nowhere else');
                break;
            case 'functionCall':
                return this.#validateFunctionCall(node, pointer, currentValueAvailability);
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
     * A binding's name is any name, which hides a local or a field of its name outside it, in scope in the consequent alone, never in its own value or the alternative.
     */
    #validateConditional(node, pointer, currentValueAvailability) {
        if ((node.condition === undefined) === (node.binding === undefined)) {
            this.#fail(pointer, 'A conditional holds a condition or a binding, one of them');
        }

        if (this.#simpleExpression !== null) {
            return this.#validateSimpleConditional(node, pointer, currentValueAvailability);
        }

        // Every branch of one conditional is a body, whose `return` gives its result, or none is; an `elseif` continues its style, and the alternative of one whose branches are expressions may hold a conditional of either, as `else if … end` writes one.
        const isExplicit = node.consequent?.kind === 'body';
        const alternative = node.alternative;
        const isConsistent = alternative?.kind === 'conditional' ? !isExplicit || alternative.consequent?.kind === 'body' : (alternative?.kind === 'body') === isExplicit;

        if (!isConsistent) {
            this.#fail(pointer, 'All branches of this conditional must give their results with return, or none of them');
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


        const value = this.#validateWithLater([name], () => this.#validateNode(node.binding.value, `${bindingPointer}/value`, currentValueAvailability));

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

    /**
     * Validates a conditional within a simple expression: a test and two branches, each a simple value expression, so it binds no value, its branches give their values without `return` or locals,
     * and it holds no other conditional, an `elseif` among them, through any path, a group, a call, an indexer or an interpolation included.
     */
    #validateSimpleConditional(node, pointer, currentValueAvailability) {
        const simpleExpression = this.#simpleExpression;
        const { holder } = simpleExpression;

        if (simpleExpression.isInConditional) {
            this.#fail(pointer, `${holder} is a simple expression, whose conditional holds no other conditional, elseif included: bind the conditional's value to a local first, and use the local`);
        }

        if (node.binding !== undefined) {
            this.#fail(`${pointer}/binding`, `${holder} is a simple expression, whose conditional tests a value and binds none: bind the conditional's value to a local first, and use the local`);
        }

        for (const branch of ['consequent', 'alternative']) {
            if (node[branch]?.kind === 'body') {
                this.#fail(`${pointer}/${branch}`, `${holder} is a simple expression, whose conditional gives each branch's value without return or locals, as if … then … else … end does: bind the conditional's value to a local first, and use the local`);
            }
        }

        this.#simpleExpression = { holder, isInConditional: true };

        try {
            return Object.freeze({
                kind: 'conditional',
                condition: this.#validateNode(node.condition, `${pointer}/condition`, currentValueAvailability),
                consequent: this.#validateNode(node.consequent, `${pointer}/consequent`, currentValueAvailability),
                alternative: this.#validateNode(node.alternative, `${pointer}/alternative`, currentValueAvailability),
            });
        } finally {
            this.#simpleExpression = simpleExpression;
        }
    }

    /**
     * Validates a simple expression the holder names: the node and everything within it, which hold no do block, no local, no conditional binding, no `return`, and no conditional beyond an if branch and an else branch of simple value expressions.
     * A simple expression within another keeps the conditional that holds it.
     */
    #validateSimpleExpression(node, pointer, currentValueAvailability, holder) {
        const enclosingSimpleExpression = this.#simpleExpression;

        this.#simpleExpression = { holder, isInConditional: enclosingSimpleExpression?.isInConditional ?? false };

        try {
            return this.#validateNode(node, pointer, currentValueAvailability);
        } finally {
            this.#simpleExpression = enclosingSimpleExpression;
        }
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

    /** Validates an and or an or: two or more expressions it combines, each with the evaluation context the and or the or has. */
    #validateLogical(node, pointer, currentValueAvailability) {
        this.#requireArray(node.operands, `${pointer}/operands`);

        if (node.operands.length < 2) {
            this.#fail(`${pointer}/operands`, `An ${node.kind} combines two or more expressions`);
        }

        return Object.freeze({ kind: node.kind, operands: Object.freeze(node.operands.map((operand, index) => this.#validateNode(operand, `${pointer}/operands/${index}`, currentValueAvailability))) });
    }

    /** Validates a comparison: two or more operands, each with the evaluation context the comparison has, and between each two of them a comparison operator, every one pointing one way. */
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
     * Validates an interpolated string: its parts, each text, a string, or an expression, which has the evaluation context the string has.
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
                parts.push(Object.freeze({ kind: 'expression', expression: this.#validateSimpleExpression(part.expression, `${partPointer}/expression`, currentValueAvailability, "An interpolation's expression") }));
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

    /**
     * Validates a body: its bindings, each with its name and value, in scope after its value, through the bindings after it and the result, and seen by no value before it, and its result, each with the evaluation context the body has.
     * A body's binding may reuse a name an enclosing scope has, which it hides, and two of one body never share one.
     */
    #validateBody(node, pointer, currentValueAvailability) {
        if (this.#simpleExpression !== null) {
            this.#fail(pointer, `${this.#simpleExpression.holder} is a simple expression, which holds no do block: bind the block's value to a local first, and use the local`);
        }

        this.#requireArray(node.bindings, `${pointer}/bindings`);

        const names = node.bindings.map(binding => binding?.name);
        const enclosingLocalNames = this.#localNames;
        const enclosingChain = this.#chain;
        const bound = new Set();

        // A body's bindings and its result continue no chain of what holds it.
        this.#chain = null;

        try {
            const bindings = node.bindings.map((binding, index) => {
                const bindingPointer = `${pointer}/bindings/${index}`;

                this.#requireProperties(binding, bindingPointer, ENTRY_PROPERTIES);
                this.#requireName(binding.name, `${bindingPointer}/name`);

                if (bound.has(binding.name)) {
                    this.#fail(bindingPointer, `Two locals of one body are named '${binding.name}'`);
                }

                bound.add(binding.name);

                const value = this.#validateWithLater(names.slice(index), () => this.#validateLocalValue(binding.value, `${bindingPointer}/value`, currentValueAvailability));

                this.#localNames = new Set(this.#localNames).add(binding.name);

                return Object.freeze({ name: binding.name, value });
            });

            return Object.freeze({ kind: 'body', bindings: Object.freeze(bindings), result: this.#validateNode(node.result, `${pointer}/result`, currentValueAvailability) });
        } finally {
            this.#localNames = enclosingLocalNames;
            this.#chain = enclosingChain;
        }
    }

    /** Validates a local's value, which a function may be, as no other node's is. */
    #validateLocalValue(value, pointer, currentValueAvailability) {
        return value?.kind === 'function' ? this.#validateFunction(value, pointer, currentValueAvailability) : this.#validateNode(value, pointer, currentValueAvailability);
    }

    /**
     * Validates a function: its parameters, each a name of its own, and its body, which sees them and the locals in scope where the function is declared, with the evaluation context it has there.
     * Its own local and those declared after it stay later names in its body, so it calls neither, directly or through another function.
     */
    #validateFunction(node, pointer, currentValueAvailability) {
        this.#requireProperties(node, pointer, NODE_PROPERTIES.function);
        this.#requireArray(node.parameters, `${pointer}/parameters`);

        const seen = new Set();

        node.parameters.forEach((parameter, index) => {
            const parameterPointer = `${pointer}/parameters/${index}`;

            this.#requireName(parameter, parameterPointer);

            if (seen.has(parameter)) {
                this.#fail(parameterPointer, `Two parameters of one function are named '${parameter}'`);
            }

            seen.add(parameter);
        });

        const enclosingLocalNames = this.#localNames;
        const enclosingChain = this.#chain;

        this.#localNames = new Set([...this.#localNames, ...node.parameters]);
        this.#chain = null;

        try {
            return Object.freeze({ kind: 'function', parameters: Object.freeze([...node.parameters]), body: this.#validateNode(node.body, `${pointer}/body`, currentValueAvailability) });
        } finally {
            this.#localNames = enclosingLocalNames;
            this.#chain = enclosingChain;
        }
    }

    /** Validates a call of a local function: its name, which no function calls before its local is declared, itself included, and its arguments. */
    #validateFunctionCall(node, pointer, currentValueAvailability) {
        this.#requireName(node.name, `${pointer}/name`);

        if (this.#laterNames.has(node.name)) {
            this.#fail(pointer, `'${node.name}' is called before the local of that name is declared in its scope, so no function calls itself or one declared after it`);
        }

        const enclosingChain = this.#chain;

        this.#chain = null;

        try {
            return Object.freeze({ kind: 'functionCall', name: node.name, arguments: this.#validateArguments(node.arguments, `${pointer}/arguments`, currentValueAvailability) });
        } finally {
            this.#chain = enclosingChain;
        }
    }

    /** Validates a call's arguments, each a simple expression. */
    #validateArguments(argumentNodes, pointer, currentValueAvailability) {
        this.#requireArray(argumentNodes, pointer);

        return Object.freeze(argumentNodes.map((argument, index) => this.#validateSimpleExpression(argument, `${pointer}/${index}`, currentValueAvailability, 'An argument')));
    }

    /** Refuses a conditional or a body as the receiver of a chain, whose value a local holds first. */
    #refuseBlockReceiver(target, pointer) {
        if (target?.kind === 'conditional' || target?.kind === 'body') {
            this.#fail(`${pointer}/target`, `${target.kind === 'body' ? 'A do block' : 'A conditional'} is never the receiver of a chain: bind its value to a local first, and continue from the local`);
        }
    }

    #validateLiteral(node, pointer) {
        const { value } = node;

        if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !Number.isFinite(value)) {
            this.#fail(`${pointer}/value`, 'A literal is a string, a finite number, a Boolean or null');
        }

        return Object.freeze({ kind: 'literal', value });
    }

    /** Validates a property access, a call or an indexer: its name, its receiver, whether it is optional, which it is within an optional chain alone, and a call's arguments or an indexer's key, each a simple expression whose evaluation context its declaration decides. */
    #validateMember(node, pointer, currentValueAvailability) {
        this.#refuseBlockReceiver(node.target, pointer);

        const name = node.kind === 'member' && ObjectUtils.isNonArrayObject(node.name) ? this.#validateNameExpression(node.name, `${pointer}/name`, currentValueAvailability) : node.name;

        // A name a bracket property access's expression gave is checked as that expression, and a default indexer has none; any other is a member's name, which any word can be, a reserved word among them.
        if (name === node.name && !(node.kind === 'indexer' && name === undefined) && !Names.isName(name)) {
            this.#fail(`${pointer}/name`, 'A member is named by a letter followed by letters and digits');
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

        if (node.kind === 'member') {
            return access;
        }

        this.#chain = null;

        if (node.kind === 'call') {
            return Object.freeze({ ...access, arguments: this.#validateArguments(node.arguments, `${pointer}/arguments`, CurrentValueAvailability.unknown) });
        }

        return Object.freeze({ ...access, argument: this.#validateSimpleExpression(node.argument, `${pointer}/argument`, CurrentValueAvailability.unknown, "An indexer's key") });
    }

    /** Validates the expression a bracket property access holds, which continues no chain; a string literal that is a name is the name itself, as `.` writes it, so an access has one definition. */
    #validateNameExpression(node, pointer, currentValueAvailability) {
        const enclosingChain = this.#chain;

        this.#chain = null;

        try {
            const expression = this.#validateSimpleExpression(node, pointer, currentValueAvailability, 'The name a bracket property access reads');

            return expression.kind === 'literal' && Names.isName(expression.value) ? expression.value : expression;
        } finally {
            this.#chain = enclosingChain;
        }
    }

    #validateObject(node, pointer, currentValueAvailability) {
        this.#refuseBlockReceiver(node.target, pointer);

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
            if (node.locals !== undefined && this.#simpleExpression !== null) {
                this.#fail(`${pointer}/locals/0`, `${this.#simpleExpression.holder} is a simple expression, whose object expressions hold no locals: bind each value to a local before the expression, and use the local`);
            }

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

                // A field is in scope after its value, through the fields after it, hiding a local or a field of its name outside it.
                names.add(name);
                this.#localNames = new Set(this.#localNames).add(name);

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

    /** Validates an object expression's locals in order, each seeing those before it, and leaves every one in scope for its fields; a local may hide one of its name outside its object expression, and two of one never share a name. */
    #validateLocals(locals, pointer, currentValueAvailability) {
        this.#requireArray(locals, pointer);

        const names = locals.map(local => local?.name);
        const declared = new Set();

        return locals.map((local, index) => {
            const localPointer = `${pointer}/${index}`;
            this.#requireProperties(local, localPointer, ENTRY_PROPERTIES);
            this.#requireName(local.name, `${localPointer}/name`);

            // A local's value and the locals before it see neither it nor the locals after it, whose names no parameter there reads.
            const value = this.#validateWithLater(names.slice(index), () => this.#validateLocalValue(local.value, `${localPointer}/value`, currentValueAvailability));
            const { name } = local;

            if (declared.has(name)) {
                this.#fail(localPointer, `Two locals of one object expression are named '${name}'`);
            }

            declared.add(name);
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
     * Refuses a parameter that text could not write: one named as a local or a field in scope where it stands, which the name reads there instead, and one named as a local declared later in its scope,
     * the local whose value it is among them, which a name reads only after its declaration and never as a binding of that name before it.
     */
    #requireBindingName(name, pointer) {
        if (this.#localNames.has(name)) {
            this.#fail(pointer, `'${name}' names the local or field in scope here, so no binding of that name is read where it is`);
        }

        if (this.#laterNames.has(name)) {
            this.#fail(pointer, `'${name}' is used before the local of that name is declared in its scope: a local is read after its declaration, and the name reads no binding before it`);
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
            this.#fail(pointer, 'A name is a letter followed by letters and digits');
        }
    }

    #fail(pointer, message) {
        throw DomqlError.structure(message, this.#locations?.locate(pointer) ?? { pointer });
    }
}
