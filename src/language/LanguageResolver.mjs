/**
 * LanguageResolver — resolves a DOMQL definition against the vocabulary and validates its types, before anything is evaluated
 */

import { DefinitionWriter } from './DefinitionWriter.mjs';
import { DomqlError } from './DomqlError.mjs';
import { ResolvedDefinition } from './ResolvedDefinition.mjs';
import { Type } from './Type.mjs';

const DATA_TYPE_NAMES = new Set(['number', 'string', 'boolean']);

/** How each form of a declaration is written, and the node that writes it. */
const FORM_NODE_KINDS = { access: 'member', call: 'call', indexer: 'indexer' };

/** No facts, the set a scope starts with: what narrows a stable reference on a path. */
const NO_FACTS = new Map();

export class LanguageResolver {
    #moduleRegistry;
    #bindings;
    #locations;
    #options;

    /** @type {Map<string, object>} */
    #resolutions = new Map();

    /** @type {object[]} */
    #usedDeclarations = [];

    /** The optional chains being resolved, the innermost last, each with whether an optional access of it can meet a null receiver. @type {{ shortCircuits: boolean }[]} */
    #chains = [];

    /**
     * @param {import('./vocabulary/ModuleRegistry.mjs').ModuleRegistry} moduleRegistry The vocabulary to resolve against.
     * @param {import('./ParameterBindings.mjs').ParameterBindings} bindings What the request's parameters are bound to.
     * @param {import('./TextLocations.mjs').TextLocations | null} locations Where in a text each part of the definition came from.
     * @param {{ watch?: boolean, acceptPartialObservation?: boolean }} options How the request will be carried out.
     */
    constructor(moduleRegistry, bindings, locations, options) {
        this.#moduleRegistry = moduleRegistry;
        this.#bindings = bindings;
        this.#locations = locations;
        this.#options = options;
    }

    /** Resolves and types the definition, answering what it resolved to or throwing where it cannot. */
    resolveDefinition(definition) {
        const result = this.#resolveNode(definition.query, '/query', { current: null, currentKey: {}, locals: new Map(), facts: NO_FACTS });

        const resultType = result.kind === 'subscription' && result.type.kind === 'event' ? result.type.itemType : result.type;

        if (result.kind !== 'behavior' && !this.#isData(resultType)) {
            this.#fail(`The result would hold ${resultType}, which is no data; read the facts it needs through an object expression`, '/query');
        }

        if (this.#options.watch === true && result.kind === 'query') {
            this.#checkWatch();
        }

        return new ResolvedDefinition(definition, result.kind, result.type, this.#resolutions, this.#usedDeclarations);
    }

    #resolveNode(node, pointer, scope) {
        switch (node.kind) {
            case 'literal':
                return this.#resolveLiteral(node);
            case 'parameter':
                return this.#resolveParameter(node, pointer, scope);
            case 'self':
                if (scope.current === null) {
                    this.#fail("'self' is the current value, and there is none here", pointer);
                }

                return { type: scope.facts.get(scope.currentKey) ?? scope.current, kind: 'query', isFixed: false };
            case 'local':
                return this.#resolveLocal(node, pointer, scope);
            case 'member':
            case 'call':
            case 'indexer':
                return this.#resolveMember(node, pointer, scope);
            case 'equality':
                return this.#resolveEquality(node, pointer, scope, false);
            case 'arithmetic':
                // A subtraction of a bare name from a property access may be one name written with a hyphen, as `self.client-size` is, which a failure to find the member suggests.
                const access = node.left.kind === 'optionalChain' ? node.left.target : node.left;

                if (node.operator === '-' && access.kind === 'member' && typeof access.name === 'string' && (node.right.kind === 'parameter' || node.right.kind === 'local')) {
                    this.#joinedNames.set(access, `${access.name}${node.right.name[0].toUpperCase()}${node.right.name.slice(1)}`);
                }

                for (const side of ['left', 'right']) {
                    this.#requireNumber(this.#resolveNode(node[side], `${pointer}/${side}`, scope), `The ${side} operand of '${node.operator}'`, `${pointer}/${side}`);
                }

                return { type: Type.createNamedType('number'), kind: 'query', isFixed: false };
            case 'negate':
                this.#requireNumber(this.#resolveNode(node.operand, `${pointer}/operand`, scope), "What '-' negates", `${pointer}/operand`);

                return { type: Type.createNamedType('number'), kind: 'query', isFixed: false };
            case 'interpolatedString':
                node.parts.forEach((part, index) => {
                    if (part.kind === 'expression') {
                        this.#requireInterpolated(this.#resolveNode(part.expression, `${pointer}/parts/${index}/expression`, scope), `${pointer}/parts/${index}/expression`);
                    }
                });

                return { type: Type.createNamedType('string'), kind: 'query', isFixed: false };
            case 'comparison':
                // Each operand is named by the operator it stands after, the first by the one after it.
                node.operands.forEach((operand, index) => {
                    const what = index === 0 ? `The left operand of '${node.operators[0]}'` : `The right operand of '${node.operators[index - 1]}'`;

                    this.#requireNumber(this.#resolveNode(operand, `${pointer}/operands/${index}`, scope), what, `${pointer}/operands/${index}`, 'a comparison');
                });

                return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
            case 'conditional':
                return this.#resolveConditional(node, pointer, scope);
            case 'body':
                return this.#resolveBody(node, pointer, scope);
            case 'optionalChain':
                return this.#resolveOptionalChain(node, pointer, scope);
            case 'coalescing':
                return this.#resolveCoalescing(node, pointer, scope);
            case 'not':
                return this.#resolveNot(node, pointer, scope);
            case 'cast':
                return this.#resolveCast(node, pointer, scope);
            case 'conversion':
                return this.#resolveConversion(node, pointer, scope);
            case 'try':
                return this.#resolveTry(node, pointer, scope);
            case 'and':
            case 'or':
                return this.#resolveLogical(node, pointer, scope);
            default:
                return this.#resolveObject(node, pointer, scope);
        }
    }

    /** The result each test and operand resolved to, by its node, which the values a bracket property access can give follow where it is fixed or its type tells its falsey part. @type {WeakMap<object, object>} */
    #decidingResults = new WeakMap();

    /**
     * Resolves a coalescing: a value and a fallback of one type, as a conditional's branches are, its type the value's made non-null where the fallback's is; the whole is resolved before any of it is evaluated.
     * Where the value is fixed, it is the side that value selects, fixed where that side is.
     */
    #resolveCoalescing(node, pointer, scope) {
        const results = ['value', 'fallback'].map(side => {
            const result = this.#resolveNode(node[side], `${pointer}/${side}`, scope);

            if (result.kind !== 'query') {
                this.#fail(`The ${side} of '??' is a value, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, `${pointer}/${side}`);
            }

            this.#decidingResults.set(node[side], result);

            return result;
        });
        const [value, fallback] = results.map(result => result.type);

        // A value of the type null is never anything but null, so the fallback's type is the whole's.
        const type = value.kind === 'null' ? fallback : Type.merge(value.toNonNullable(), fallback);

        if (type === null) {
            this.#fail(`The value and the fallback of '??' are of one type, and these are ${value} and ${fallback}`, `${pointer}/fallback`);
        }

        return LanguageResolver.#fixedAs(type, results[0].isFixed ? results[results[0].value === null ? 1 : 0] : null);
    }

    /** Resolves an optional chain: the chain it holds, nullable where an optional access of it can meet a null receiver, which ends the chain with null. */
    #resolveOptionalChain(node, pointer, scope) {
        const chain = { shortCircuits: false };

        this.#chains.push(chain);

        try {
            const result = this.#resolveNode(node.target, `${pointer}/target`, scope);

            return chain.shortCircuits ? { type: result.type.toNullable(), kind: result.kind, isFixed: false } : result;
        } finally {
            this.#chains.pop();
        }
    }

    /**
     * Resolves an equality: two values, compared, and answers a Boolean that is never null, whatever their types.
     * A string, a number, a Boolean or a node is compared with a value of a type one of theirs fits, and a value of any other type with null alone; a value of the type null, and a never, compare with any.
     * Where `==`, or `!=` as it is negated, compares a value with a string that names one of its Boolean members, the refusal gives the member to write.
     */
    #resolveEquality(node, pointer, scope, isNegated) {
        const left = this.#resolveNode(node.left, `${pointer}/left`, scope);
        const right = this.#resolveNode(node.right, `${pointer}/right`, scope);

        for (const [side, result] of [['left', left], ['right', right]]) {
            if (result.kind !== 'query') {
                this.#fail(`'==' compares values, and this is ${LanguageResolver.#descriptionOf(result.kind)}`, `${pointer}/${side}`);
            }
        }

        if (!LanguageResolver.#comparesWithAny(left.type) && !LanguageResolver.#comparesWithAny(right.type)) {
            const leftType = left.type.toNonNullable();
            const rightType = right.type.toNonNullable();

            for (const [side, type] of [['left', leftType], ['right', rightType]]) {
                if (!LanguageResolver.#isComparable(type)) {
                    this.#fail(`'==' compares a value of ${type} with null alone, since only strings, numbers, Booleans and nodes are compared with each other`, `${pointer}/${side}`);
                }
            }

            if (!leftType.isAssignableTo(rightType) && !rightType.isAssignableTo(leftType)) {
                this.#fail(`'==' compares values whose types fit one way or the other, and ${leftType} and ${rightType} fit neither way${this.#testOf(node, left, right, isNegated)}`, pointer);
            }
        }

        return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
    }

    /**
     * For an equality of a value and a string that names one of the value's Boolean members or one of its conditions, as `input == "disabled"` or `input == state` writes one, the test to write, negated for `!=`: the member, or the condition asked with its verb; nothing for any other.
     * The name is read exactly, and the member or the condition is one the value's type has.
     */
    #testOf(node, left, right, isNegated) {
        if (!right.isFixed || typeof right.value !== 'string' || (node.right.kind !== 'literal' && node.right.kind !== 'parameter')) {
            return '';
        }

        const receiverType = left.type.toNonNullable();
        const declares = this.#moduleRegistry.getMembers(right.value).some(candidate => candidate.kind === 'property' && candidate.result === 'boolean' && LanguageResolver.#matchesReceiver(candidate, receiverType, new Map()));
        const condition = declares ? undefined : this.#moduleRegistry.getConditions(right.value).find(candidate => LanguageResolver.#matchesAny(candidate.on, receiverType));

        if (!declares && condition === undefined) {
            return '';
        }

        const optional = left.type.isNullable ? { optional: true } : {};
        const name = node.right.kind === 'literal' ? right.value : node.right;
        const test = declares ? { kind: 'member', target: node.left, name, ...optional } : { kind: 'call', target: node.left, name: condition.verb, argument: node.right, ...optional };

        return `: a test is the member that answers it, so write '${DefinitionWriter.write(isNegated ? { kind: 'not', operand: test } : test)}'`;
    }

    /**
     * Resolves a conditional: a condition, any value, or a binding, any value, whose name the consequent alone sees, bound to that value where it is truthy; and two branches of one type, nullable where either is.
     * The consequent sees what the condition's being truthy guarantees of the stable references it tests, and the alternative what its being falsey does. The whole is resolved before any of it is evaluated.
     */
    #resolveConditional(node, pointer, scope) {
        const test = node.binding === undefined ? node.condition : node.binding.value;
        const testPointer = node.binding === undefined ? `${pointer}/condition` : `${pointer}/binding/value`;
        const tested = this.#resolveNode(test, testPointer, scope);

        this.#requireValue(tested, node.binding === undefined ? "The condition of 'if'" : "What 'if let' binds", testPointer);
        this.#decidingResults.set(test, tested);

        const truthyScope = LanguageResolver.#withFacts(scope, this.#factsOf(test, scope, true));
        const falseyScope = LanguageResolver.#withFacts(scope, this.#factsOf(test, scope, false));
        let consequentScope = truthyScope;

        if (node.binding !== undefined) {
            // The consequent is taken where the value is truthy, so it sees the value without null, fixed where the value is fixed; a value that is always falsey is never bound, and is a never there.
            const isFalsey = tested.isFixed && !LanguageResolver.#isTruthy(tested.value);
            const type = isFalsey ? Type.never : LanguageResolver.#truthyPartOf(tested.type);
            const result = tested.isFixed && !isFalsey ? { type, kind: 'query', isFixed: true, value: tested.value } : { type, kind: 'query', isFixed: false };

            consequentScope = LanguageResolver.#consequentScopeOf(node, truthyScope, result);
        }

        const results = ['consequent', 'alternative'].map(branch => {
            const result = this.#resolveNode(node[branch], `${pointer}/${branch}`, branch === 'consequent' ? consequentScope : falseyScope);

            if (result.kind !== 'query') {
                this.#fail(`A branch of 'if' is a value, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, `${pointer}/${branch}`);
            }

            return result;
        });
        const branches = results.map(result => result.type);
        const type = Type.merge(...branches);

        if (type === null) {
            this.#fail(`The branches of 'if' are of one type, and these are ${branches[0]} and ${branches[1]}`, `${pointer}/alternative`);
        }

        // A fixed condition, or a fixed value bound, selects its branch when the query is prepared, and the conditional is fixed where that branch is.
        return LanguageResolver.#fixedAs(type, tested.isFixed ? results[LanguageResolver.#isTruthy(tested.value) ? 0 : 1] : null);
    }

    /** A result of the type, fixed to the value of the result that decides it where that one is fixed: a value preparation settles, from literals and bound parameters, without reading the document. */
    static #fixedAs(type, deciding) {
        return deciding?.isFixed ? { type, kind: 'query', isFixed: true, value: deciding.value } : { type, kind: 'query', isFixed: false };
    }

    /**
     * Resolves an and or an or: every value it combines, each seeing what the operands before it guarantee where it is reached, truthy ones for `and` and falsey ones for `or`, so the whole is validated before any of it is evaluated.
     * It answers the operand that decides it: `and` the falsey part of an operand before the last, or the last, and `or` the truthy part of one, or the last; values of more than one type no type holds, which is refused.
     * Where fixed operands decide it, it is the one that does, fixed.
     */
    #resolveLogical(node, pointer, scope) {
        const passesWhenTruthy = node.kind === 'and';
        const results = [];
        let passed = NO_FACTS;

        node.operands.forEach((operand, index) => {
            const operandPointer = `${pointer}/operands/${index}`;
            const operandScope = LanguageResolver.#withFacts(scope, passed);
            const result = this.#resolveNode(operand, operandPointer, operandScope);

            this.#requireValue(result, `An operand of '${node.kind}'`, operandPointer);
            this.#decidingResults.set(operand, result);
            results.push(result);
            passed = LanguageResolver.#unionOf(passed, this.#factsOf(operand, operandScope, passesWhenTruthy));
        });

        const last = results.length - 1;

        // Operands whose values are fixed decide it before anything is evaluated, the operand that decides it giving its value and its type.
        for (let index = 0; index <= last && results[index].isFixed; index++) {
            if (index === last || LanguageResolver.#isTruthy(results[index].value) !== passesWhenTruthy) {
                return results[index];
            }
        }

        const parts = results.map((result, index) => (index === last ? result.type : LanguageResolver.#partOf(result, !passesWhenTruthy)));
        const type = parts.reduce((merged, part) => (merged === null ? null : Type.merge(merged, part)));

        if (type === null) {
            const described = [...new Set(parts.flatMap((part, index) => LanguageResolver.#describePart(part, index === last ? null : !passesWhenTruthy)))];
            const rewrite = node.kind === 'and' && node.operands.length === 2
                ? `write 'if ${DefinitionWriter.write(node.operands[0])} then ${DefinitionWriter.write(node.operands[1])} else null end' if null is an acceptable alternative`
                : "a conditional, 'if … then … else … end', chooses between values of one type";

            this.#fail(`What '${node.kind}' gives is ${described.join(' or ')}, which no one type holds; ${rewrite}`, pointer);
        }

        return { type, kind: 'query', isFixed: false };
    }

    /** Whether a value is truthy: every value is but null and false. */
    static #isTruthy(value) {
        return value !== null && value !== false;
    }

    /** The type a value of the type has where it is truthy: the type without null, a Boolean staying one, since no type tells true from false. */
    static #truthyPartOf(type) {
        return type.kind === 'null' ? Type.never : type.toNonNullable();
    }

    /** The type a value of the type has where it is falsey: a Boolean where it is one, null where it can be null, and never where it is always truthy. */
    static #falseyPartOf(type) {
        if (type.kind === 'named' && type.name === 'boolean') {
            return type;
        }

        return type.isNullable ? Type.null : Type.never;
    }

    /** The part of a result that is truthy, or falsey, told from its value where the value is fixed. */
    static #partOf(result, isTruthy) {
        if (result.isFixed) {
            return LanguageResolver.#isTruthy(result.value) === isTruthy ? result.type : Type.never;
        }

        return isTruthy ? LanguageResolver.#truthyPartOf(result.type) : LanguageResolver.#falseyPartOf(result.type);
    }

    /** How a refusal names the part of an operand's type: a Boolean's truthy part as true and its falsey one as false, with null where it can be null; the last operand's, of no part, as its type. */
    static #describePart(part, isTruthy) {
        if (part.kind === 'never') {
            return [];
        }

        if (isTruthy === null || !(part.kind === 'named' && part.name === 'boolean')) {
            return [String(part)];
        }

        return isTruthy ? ['true'] : part.isNullable ? ['false', 'null'] : ['false'];
    }

    /**
     * What the node's being truthy, or falsey, guarantees of the stable references it tests, each by its identity: a local, a conditional binding, a parameter or the current value.
     * A reference itself tells its own truthiness, `== null` whether it is null, `not` the opposite, and `and` and `or` what every operand tells on the path taken, or only what each path that reaches the outcome shares.
     */
    #factsOf(node, scope, isTruthy) {
        switch (node.kind) {
            case 'local':
            case 'parameter':
            case 'self': {
                const reference = this.#referenceOf(node, scope);

                return reference === null ? NO_FACTS : new Map([[reference.key, isTruthy ? LanguageResolver.#truthyPartOf(reference.type) : LanguageResolver.#falseyPartOf(reference.type)]]);
            }
            case 'equality': {
                const isNull = side => side.kind === 'literal' && side.value === null;
                const tested = isNull(node.right) ? node.left : isNull(node.left) ? node.right : null;
                const reference = tested === null ? null : this.#referenceOf(tested, scope);

                if (reference === null) {
                    return NO_FACTS;
                }

                return new Map([[reference.key, isTruthy ? Type.null : LanguageResolver.#truthyPartOf(reference.type)]]);
            }
            case 'not':
                return this.#factsOf(node.operand, scope, !isTruthy);
            case 'and':
            case 'or': {
                const passesWhenTruthy = node.kind === 'and';
                const isEveryPassed = isTruthy === passesWhenTruthy;
                const stops = [];
                let passed = NO_FACTS;

                for (const operand of node.operands) {
                    const operandScope = LanguageResolver.#withFacts(scope, passed);

                    if (!isEveryPassed) {
                        stops.push(LanguageResolver.#unionOf(passed, this.#factsOf(operand, operandScope, !passesWhenTruthy)));
                    }

                    passed = LanguageResolver.#unionOf(passed, this.#factsOf(operand, operandScope, passesWhenTruthy));
                }

                return isEveryPassed ? passed : LanguageResolver.#commonOf(stops);
            }
            default:
                return NO_FACTS;
        }
    }

    /** The identity and the type, where it is resolved, of a stable reference, or null for one that is none: a member's value is read anew where it is used, so it tells nothing of a later read. */
    #referenceOf(node, scope) {
        switch (node.kind) {
            case 'local': {
                const local = scope.locals.get(node.name);

                return local === undefined || local.result === null ? null : { key: local, type: scope.facts.get(local) ?? local.result.type };
            }
            case 'parameter': {
                if (node.name === 'document' || node.name === 'window' || !this.#bindings.has(node.name)) {
                    return null;
                }

                const key = `@${node.name}`;

                return { key, type: scope.facts.get(key) ?? this.#bindings.getType(node.name) };
            }
            case 'self':
                return scope.current === null ? null : { key: scope.currentKey, type: scope.facts.get(scope.currentKey) ?? scope.current };
            default:
                return null;
        }
    }

    /** The scope with the facts added, a later fact on a reference narrowing it further. */
    static #withFacts(scope, facts) {
        return facts.size === 0 ? scope : { ...scope, facts: LanguageResolver.#unionOf(scope.facts, facts) };
    }

    /** Both sets of facts, the second's type for a reference both hold, since it was found where the first holds. */
    static #unionOf(first, second) {
        return second.size === 0 ? first : first.size === 0 ? second : new Map([...first, ...second]);
    }

    /** The facts every set holds, each reference typed as any of them allows; a reference one set lacks tells nothing. */
    static #commonOf(sets) {
        const [first, ...rest] = sets;
        const common = new Map();

        for (const [key, type] of first) {
            const merged = rest.reduce((sum, set) => (sum === null || !set.has(key) ? null : Type.merge(sum, set.get(key))), type);

            if (merged !== null) {
                common.set(key, merged);
            }
        }

        return common;
    }

    /**
     * Resolves a cast: its target, a value, and the type it casts to, a node or one of its kinds, its result of that type, nullable where the target is, since null passes through it.
     * A target that can never be of the type is refused, while one that always is, and null, are not, since a binding typed from its value may be either.
     */
    #resolveCast(node, pointer, scope) {
        const target = this.#resolveNode(node.target, `${pointer}/target`, scope);
        const type = Type.createNamedType(node.type);

        if (target.kind !== 'query') {
            this.#fail(`A cast's target is a value, and this one is ${LanguageResolver.#descriptionOf(target.kind)}`, `${pointer}/target`);
        }

        if (!type.isNode) {
            this.#fail(`'as' casts to node or one of its kinds, ${Type.nodeKinds.join(', ')}, and '${node.type}' is none of them`, pointer);
        }

        const from = target.type;
        const canBe = from.kind === 'null' || from.kind === 'never' || (from.isNode && (from.name === 'node' || type.name === 'node' || from.name === type.name));

        if (!canBe) {
            this.#fail(`A value of ${from.toNonNullable()} can never be cast to ${node.type}: the cast would always reject it`, pointer);
        }

        return { type: from.kind === 'null' || from.isNullable ? type.toNullable() : type, kind: 'query', isFixed: false };
    }

    /** Resolves an attempt: the conversion or the cast it attempts, as it resolves strictly, its result made nullable, since a rejection answers null. */
    #resolveTry(node, pointer, scope) {
        const result = this.#resolveNode(node.target, `${pointer}/target`, scope);

        return { type: result.type.toNullable(), kind: 'query', isFixed: false };
    }

    /**
     * Resolves a conversion: its target, a value, and the type of data it converts to, its result of that type, nullable where the target is.
     * A value already of the type answers itself, which no declaration overrides; any other takes the one conversion declared from its type to that one, never a chain of them.
     * A target of unknown type chooses none: null answers null, and a never is never evaluated.
     */
    #resolveConversion(node, pointer, scope) {
        const target = this.#resolveNode(node.target, `${pointer}/target`, scope);

        if (target.kind !== 'query') {
            this.#fail(`What 'to' converts is a value, and this one is ${LanguageResolver.#descriptionOf(target.kind)}`, `${pointer}/target`);
        }

        const to = Type.parse(node.type);

        if (to === null || to.kind !== 'named' || to.isNullable || !this.#moduleRegistry.isConvertible(to.name)) {
            const cast = to?.kind === 'named' && to.isNode ? `; a node is narrowed to one of its kinds with 'as', as in … as "${node.type}"` : '';

            this.#fail(`'to' converts to a type of data named as it is declared, number, string, boolean or a structured type the vocabulary declares, and '${node.type}' is none of them${cast}`, pointer);
        }

        const from = target.type;

        if (from.kind === 'null' || from.kind === 'never') {
            this.#resolutions.set(pointer, { kind: 'conversion', declaration: null });

            return { type: from.kind === 'null' ? to.toNullable() : to, kind: 'query', isFixed: false };
        }

        const source = from.toNonNullable();
        const isIdentity = source.kind === 'named' && source.name === to.name;
        const declaration = isIdentity || source.kind !== 'named' ? undefined : this.#moduleRegistry.getConversion(source.name, to.name);

        if (!isIdentity && declaration === undefined) {
            const targets = source.kind === 'named' ? this.#moduleRegistry.getConversionTargets(source.name) : [];
            const available = targets.length === 0 ? `${source} converts to nothing` : `${source} converts to ${targets.join(', ')}`;

            this.#fail(`No conversion from ${source} to ${to.name} is declared, and ${available}`, pointer);
        }

        this.#resolutions.set(pointer, { kind: 'conversion', declaration: declaration ?? null, type: to });

        return { type: from.isNullable ? to.toNullable() : to, kind: 'query', isFixed: false };
    }

    /** The scope a conditional binding's consequent is resolved in: the scope around it, with the binding's name a local holding its value, of the result given. */
    static #consequentScopeOf(node, scope, result) {
        return { ...scope, locals: new Map(scope.locals).set(node.binding.name, { result, value: node.binding.value, scope, binding: node }) };
    }

    /** Resolves a negation: what it negates, any value, and answers a Boolean, true where that value is falsey. */
    #resolveNot(node, pointer, scope) {
        // An equality is negated as `!=` writes it, so the member a refusal gives is negated too.
        const operand = node.operand.kind === 'equality' ? this.#resolveEquality(node.operand, `${pointer}/operand`, scope, true) : this.#resolveNode(node.operand, `${pointer}/operand`, scope);

        this.#requireValue(operand, "What 'not' negates", `${pointer}/operand`);

        return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
    }

    /**
     * Refuses what the operation, arithmetic unless another is named, takes no part in: what is no value, a value that can be null, which a fallback or a test removes first,
     * and a value of any type but a number, which nothing converts to one but `to`.
     */
    #requireNumber(result, what, pointer, operation = 'arithmetic') {
        this.#requireValue(result, what, pointer);

        const { type } = result;

        if (type.kind === 'never') {
            return;
        }

        if (type.isNullable || type.kind === 'null') {
            this.#fail(`${what} can be null, and ${operation} takes numbers alone: give it a fallback, as in (… ?? 0), or test it first`, pointer);
        }

        if (type.kind !== 'named' || type.name !== 'number') {
            this.#fail(`${what} is a number, and this one is ${type}; a conversion makes a number of text, as in … to "number"`, pointer);
        }
    }

    /** Refuses what an interpolation inserts no text for: what is no value, a value that can be null, which a fallback or a test removes first, and a value of any type but a string or a number, a Boolean's text given by `to`. */
    #requireInterpolated(result, pointer) {
        const what = 'An interpolation';

        this.#requireValue(result, what, pointer);

        const { type } = result;

        if (type.kind === 'never') {
            return;
        }

        if (type.isNullable || type.kind === 'null') {
            this.#fail(`${what} can be null: give it a fallback, as in (… ?? "…"), or test it first`, pointer);
        }

        if (type.kind !== 'named' || (type.name !== 'string' && type.name !== 'number')) {
            const hint = type.kind === 'named' && type.name === 'boolean' ? '; give its text with … to "string", or choose it with a conditional' : '';

            this.#fail(`${what} inserts a string or a number, and this one is ${type}${hint}`, pointer);
        }
    }

    /** Refuses what is no value where one is tested for its truthiness, an event source, an action or a behavior, and a value whose type no receiver gives, which tells nothing of whether it can be falsey. */
    #requireValue(result, what, pointer) {
        if (result.kind !== 'query') {
            this.#fail(`${what} is a value, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, pointer);
        }

        if (LanguageResolver.#holdsTypeParameter(result.type)) {
            this.#fail(`${what} produces ${result.type}, a type no receiver gives`, pointer);
        }
    }

    /**
     * Resolves a body: each binding against the scope and the bindings before it, a value, and the result against them all, its type the result's.
     * It is fixed only where every binding and its result are, so a read a binding makes, used or not, is never discarded.
     */
    #resolveBody(node, pointer, scope) {
        let locals = scope.locals;
        let isFixed = true;

        node.bindings.forEach((binding, index) => {
            const valuePointer = `${pointer}/bindings/${index}/value`;
            const bindingScope = { ...scope, locals };
            const result = this.#resolveNode(binding.value, valuePointer, bindingScope);

            if (result.kind !== 'query') {
                this.#fail(`The binding '${binding.name}' is ${LanguageResolver.#descriptionOf(result.kind)}, and a binding is a value`, valuePointer);
            }

            isFixed &&= result.isFixed;
            locals = new Map(locals).set(binding.name, { result, value: binding.value, scope: bindingScope });
        });

        const result = this.#resolveNode(node.result, `${pointer}/result`, { ...scope, locals });

        // A body gives a value, as a field holds one: an event source, an action and a behavior are requests of their own.
        if (result.kind !== 'query') {
            this.#fail(`A body gives a value, and its result is ${LanguageResolver.#descriptionOf(result.kind)}`, `${pointer}/result`);
        }

        return isFixed && result.isFixed ? result : { type: result.type, kind: result.kind, isFixed: false };
    }

    /** Resolves a local: what the one in scope with its name resolved to where it was written. A name no local in scope has is refused, with the form of the current value's member of that name where it has one. */
    #resolveLocal(node, pointer, scope) {
        const local = scope.locals.get(node.name);

        if (local === undefined) {
            const form = scope.current === null ? null : this.#memberForm(scope.current, node.name);

            this.#fail(`No local named '${node.name}' is in scope${form === null ? '' : `; write '${form}' for the member of the current value`}`, pointer);
        }

        // A binding's value is evaluated once, by its conditional, which a use of its name reads; either records the expression its value came from.
        this.#resolutions.set(pointer, local.binding === undefined ? { kind: 'local', name: node.name, value: local.value } : { kind: 'binding', conditional: local.binding, value: local.value });

        const narrowed = scope.facts.get(local);

        return narrowed === undefined ? local.result : { ...local.result, type: narrowed };
    }

    /** The names a property access joins with the bare name a subtraction takes from it, by the access, which a failure to find its member suggests. @type {WeakMap<object, string>} */
    #joinedNames = new WeakMap();

    /**
     * For a property access no member is named as, which a subtraction takes a bare name from, the suggestion of the member the two names joined in camelCase name, as `client` and `size` join as `clientSize`,
     * where the receiver's type has one of that name, compared ignoring case and written as the member spells it; nothing for any other access.
     */
    #joinedNameHintOf(node, receiverType) {
        const joined = this.#joinedNames.get(node)?.toLowerCase();

        if (joined === undefined || LanguageResolver.#isOfUnknownType(receiverType)) {
            return '';
        }

        const name = this.#moduleRegistry.memberNames.find(candidate => candidate.toLowerCase() === joined && this.#memberForm(receiverType, candidate) !== null);

        if (name === undefined) {
            return '';
        }

        // The access written with the member's name, less that name, is its receiver as the access writes it, grouped where it needs to be and ending in `?` where the access is optional.
        const receiver = DefinitionWriter.write({ ...node, name }).slice(0, -(name.length + 1));

        return `. Did you mean '${this.#memberForm(receiverType, name, receiver)}'?`;
    }

    /** How the member of the type with the name is written after the receiver, `self` unless another is given, or null where the type has none. */
    #memberForm(type, name, receiver = 'self') {
        if (this.#fieldTypeOf(type, name) !== null) {
            return `${receiver}.${name}`;
        }

        const declaration = this.#moduleRegistry.getMembers(name).find(candidate => LanguageResolver.#matchesReceiver(candidate, type, new Map()));

        if (declaration === undefined) {
            return null;
        }

        if (declaration.kind === 'property') {
            return `${receiver}.${name}`;
        }

        return declaration.form === 'indexer' ? `${receiver}:${name}[…]` : `${receiver}.${name}(…)`;
    }

    #resolveLiteral(node) {
        const { value } = node;
        const type = value === null ? Type.null : Type.createNamedType(typeof value);

        return { type, kind: 'query', isFixed: true, value };
    }

    #resolveParameter(node, pointer, scope) {
        if (node.name === 'document' || node.name === 'window') {
            return { type: Type.createNamedType(node.name), kind: 'query', isFixed: false };
        }

        // A name no local in scope has reads the caller's binding, and one the caller did not bind may be a member written without its receiver; where a local of its name is in scope, it was written with `~`, which reads no local.
        if (!this.#bindings.has(node.name) && scope.locals.has(node.name)) {
            this.#fail(`No binding is named '${node.name}', and '~${node.name}' reads the caller's binding alone: write '${node.name}' for the local of that name`, pointer);
        }

        if (!this.#bindings.has(node.name)) {
            const form = scope.current === null ? null : this.#memberForm(scope.current, node.name);

            this.#fail(`No local in scope or binding is named '${node.name}'${form === null ? '' : `; write '${form}' for the member of the current value`}`, pointer);
        }

        return { type: scope.facts.get(`@${node.name}`) ?? this.#bindings.getType(node.name), kind: 'query', isFixed: true, value: this.#bindings.get(node.name) };
    }

    #resolveMember(node, pointer, scope) {
        const receiver = this.#resolveNode(node.target, `${pointer}/target`, scope);
        const isDefaultIndexer = node.kind === 'indexer' && node.name === undefined;
        const written = isDefaultIndexer ? ':[…]' : typeof node.name === 'string' ? node.name : `[${DefinitionWriter.write(node.name)}]`;

        if (receiver.kind !== 'query') {
            this.#fail(`'${written}' follows ${LanguageResolver.#descriptionOf(receiver.kind)}, which takes no members`, pointer);
        }

        // A member requires a receiver that cannot be null, and an optional one reads it where it is not null, ending its chain with null where it is.
        if (receiver.type.isNullable) {
            if (node.optional !== true) {
                const follows = receiver.type.kind === 'null' ? 'null' : `${receiver.type}, which can be null`;

                this.#fail(`'${written}' follows ${follows}: write '${DefinitionWriter.write({ ...node, optional: true })}' to read it where it is not`, pointer);
            }

            this.#chains.at(-1).shortCircuits = true;
        }

        const receiverType = node.optional === true ? receiver.type.toNonNullable() : receiver.type;

        if (isDefaultIndexer) {
            return this.#resolveDefaultIndexer(node, pointer, scope, receiverType);
        }

        if (typeof node.name !== 'string') {
            return this.#resolveByName(node, pointer, scope, receiverType);
        }

        return this.#resolveMemberOf(node, pointer, scope, receiverType);
    }

    /**
     * Resolves a default indexer: the one indexer the vocabulary declares the default for the receiver's type, resolved as the indexer it names would be.
     * A receiver of unknown type chooses none, and takes the key every default indexer could; a receiver whose type has none is refused.
     */
    #resolveDefaultIndexer(node, pointer, scope, receiverType) {
        const defaults = this.#moduleRegistry.getDefaultIndexers();

        if (LanguageResolver.#isOfUnknownType(receiverType)) {
            return this.#resolveOnUnknownType(node, pointer, scope, receiverType, defaults);
        }

        const matching = defaults.filter(declaration => LanguageResolver.#matchesReceiver(declaration, receiverType, new Map()));

        if (matching.length === 0) {
            this.#fail(`${receiverType.toNonNullable()} has no default indexer: name the indexer, as in ':name[…]'`, pointer);
        }

        // The vocabulary declares one default indexer for any receiver, so only a type holding never fits more than one.
        if (matching.length > 1) {
            this.#fail(`Default indexers are declared for ${matching.flatMap(declaration => [declaration.on].flat()).join(' and ')}, and ${receiverType.toNonNullable()} fits more than one, so which applies is ambiguous`, pointer);
        }

        return this.#resolveMemberOf({ ...node, name: matching[0].name }, pointer, scope, receiverType);
    }

    /**
     * Resolves a bracket property access: the names its expression can give, which preparation determines, each a property of the receiver, their types of one type as a conditional's branches are.
     * The resolution keeps each name's, so evaluation reads the one the name selects; on a receiver of unknown type, whether each is a property and whether their types agree are checked once its type is known.
     */
    #resolveByName(node, pointer, scope, receiverType) {
        const namePointer = `${pointer}/name`;
        const name = this.#resolveNode(node.name, namePointer, scope);
        const possible = name.kind === 'query' ? this.#possibleNamesOf(node.name, scope) : null;

        if (possible === null || possible.canBeOther) {
            this.#fail(`A bracket property access reads a name determined when the query is prepared, which a string literal, null, a bound parameter, a local holding one, or a conditional, a '??', an 'and' or an 'or' of them gives, and '${DefinitionWriter.write(node.name)}' is none of them`, namePointer);
        }

        if (possible.canBeFalse) {
            this.#fail(`A bracket property access reads a string, and '${DefinitionWriter.write(node.name)}' can be false`, namePointer);
        }

        if (possible.canBeNull || possible.names.size === 0) {
            this.#fail(`A bracket property access reads a string, and '${DefinitionWriter.write(node.name)}' can be null`, namePointer);
        }

        const candidates = new Map();
        const types = [];

        for (const candidate of possible.names) {
            const access = { kind: 'member', target: node.target, name: candidate, ...(node.optional === true ? { optional: true } : {}) };

            types.push(this.#resolveMemberOf(access, pointer, scope, receiverType).type);
            candidates.set(candidate, this.#resolutions.get(pointer));
        }

        let type = types.reduce((merged, candidateType) => (merged === null ? null : Type.merge(merged, candidateType)), Type.never);

        if (type === null) {
            if (!LanguageResolver.#isOfUnknownType(receiverType)) {
                this.#fail(`The properties '${DefinitionWriter.write(node.name)}' can name are of one type, and these are ${types.join(', ')}`, namePointer);
            }

            type = Type.null;
        }

        this.#resolutions.set(pointer, { kind: 'byName', candidates });

        return { type, kind: 'query', isFixed: false };
    }

    /**
     * The values a bracket property access's expression can give, determined through these forms alone: a string literal, null, a bound parameter, a local whose value is one of them, a conditional binding's name, truthy, whose value is,
     * and a conditional, a `??`, an `and` and an `or` of them, each by the rules that evaluate it: a conditional gives its branches', a `??` its value's and, where its value can be null, its fallback's, and an `and` or an `or` the part of each operand before its last that decides it, falsey for `and` and truthy for `or`, and its last's.
     * A test or an operand whose value is fixed decides when the query is prepared, so what evaluation would not reach gives nothing; the falsey part of an `and`'s operand that names nothing is told from its type.
     * The names are the strings it can give, and null, false and any other value are tracked beside them, so a `??` can remove null; any other expression gives no values that can be determined, and answers null.
     * @returns {{ names: Set<string>, canBeNull: boolean, canBeFalse: boolean, canBeOther: boolean } | null}
     */
    #possibleNamesOf(node, scope) {
        switch (node.kind) {
            case 'literal':
                return LanguageResolver.#possibleOf(node.value);
            case 'parameter':
                return node.name === 'document' || node.name === 'window' ? null : LanguageResolver.#possibleOf(this.#bindings.get(node.name));
            case 'local': {
                const local = scope.locals.get(node.name);
                const possible = local === undefined ? null : this.#possibleNamesOf(local.value, local.scope);

                // A conditional binding's name is used where its value is truthy.
                return possible !== null && local.binding !== undefined ? LanguageResolver.#partOfPossible(possible, true) : possible;
            }
            case 'conditional': {
                const tested = this.#decidingResults.get(node.binding === undefined ? node.condition : node.binding.value);
                const consequentScope = node.binding === undefined ? scope : LanguageResolver.#consequentScopeOf(node, scope, null);
                const branches = [[node.consequent, consequentScope], [node.alternative, scope]];
                const reached = tested?.isFixed ? [branches[LanguageResolver.#isTruthy(tested.value) ? 0 : 1]] : branches;
                const sides = reached.map(([branch, branchScope]) => this.#possibleNamesOf(branch, branchScope));

                return sides.includes(null) ? null : sides.reduce(LanguageResolver.#unionOfPossible);
            }
            case 'coalescing': {
                const value = this.#possibleNamesOf(node.value, scope);

                if (value === null || !value.canBeNull) {
                    return value;
                }

                const fallback = this.#possibleNamesOf(node.fallback, scope);

                return fallback === null ? null : LanguageResolver.#unionOfPossible({ ...value, canBeNull: false }, fallback);
            }
            case 'and':
            case 'or': {
                const decidesWhenTruthy = node.kind === 'or';
                const last = node.operands.length - 1;
                let possible = LanguageResolver.#possibleOf(undefined);

                for (let index = 0; index < last; index++) {
                    const operand = node.operands[index];
                    const result = this.#decidingResults.get(operand);

                    // A fixed operand decides, giving its value, or passes evaluation on, giving nothing.
                    if (result?.isFixed) {
                        if (LanguageResolver.#isTruthy(result.value) === decidesWhenTruthy) {
                            return LanguageResolver.#unionOfPossible(possible, LanguageResolver.#possibleOf(result.value));
                        }

                        continue;
                    }

                    const operandPossible = this.#possibleNamesOf(operand, scope);

                    if (operandPossible !== null) {
                        possible = LanguageResolver.#unionOfPossible(possible, LanguageResolver.#partOfPossible(operandPossible, decidesWhenTruthy));
                    } else if (!decidesWhenTruthy && result !== undefined) {
                        possible = LanguageResolver.#unionOfPossible(possible, LanguageResolver.#falseyPossibleOf(result.type));
                    } else {
                        return null;
                    }
                }

                const lastPossible = this.#possibleNamesOf(node.operands[last], scope);

                return lastPossible === null ? null : LanguageResolver.#unionOfPossible(possible, lastPossible);
            }
            default:
                return null;
        }
    }

    /** The values a value gives: a string, its name, null, false, or any other value; undefined gives none. */
    static #possibleOf(value) {
        return {
            names: typeof value === 'string' ? new Set([value]) : new Set(),
            canBeNull: value === null,
            canBeFalse: value === false,
            canBeOther: value !== undefined && value !== null && value !== false && typeof value !== 'string',
        };
    }

    /** The values two sets of them give together. */
    static #unionOfPossible(first, second) {
        return {
            names: new Set([...first.names, ...second.names]),
            canBeNull: first.canBeNull || second.canBeNull,
            canBeFalse: first.canBeFalse || second.canBeFalse,
            canBeOther: first.canBeOther || second.canBeOther,
        };
    }

    /** The truthy part of the values, its names and any other value, or the falsey part, null and false. */
    static #partOfPossible(possible, isTruthy) {
        return isTruthy
            ? { names: possible.names, canBeNull: false, canBeFalse: false, canBeOther: possible.canBeOther }
            : { names: new Set(), canBeNull: possible.canBeNull, canBeFalse: possible.canBeFalse, canBeOther: false };
    }

    /** The falsey values a value of the type can give, which no name is: false for a Boolean and null where it can be null. */
    static #falseyPossibleOf(type) {
        const isBoolean = type.kind === 'named' && type.name === 'boolean';

        return { names: new Set(), canBeNull: type.isNullable, canBeFalse: isBoolean, canBeOther: false };
    }

    /** Resolves the member the node names on a receiver of the type, which its receiver's null policy has already been applied to. */
    #resolveMemberOf(node, pointer, scope, receiverType) {
        if (LanguageResolver.#isOfUnknownType(receiverType)) {
            return this.#resolveOnUnknownType(node, pointer, scope, receiverType);
        }

        const field = this.#fieldTypeOf(receiverType, node.name);

        if (field !== null) {
            if (node.kind !== 'member') {
                this.#fail(`'${node.name}' is a field of ${receiverType.toNonNullable()} and takes no argument: write '${DefinitionWriter.write(LanguageResolver.#accessOf(node))}'`, pointer);
            }

            this.#resolutions.set(pointer, { kind: 'field', name: node.name, receiverType });

            return { type: receiverType.isNullable ? field.toNullable() : field, kind: 'query', isFixed: false };
        }

        const candidates = this.#moduleRegistry.getMembers(node.name);

        if (candidates.length === 0) {
            this.#fail(`'${node.name}' is no member of the vocabulary${this.#joinedNameHintOf(node, receiverType)}`, pointer);
        }

        const matching = candidates.filter(candidate => LanguageResolver.#matchesReceiver(candidate, receiverType, new Map()));

        if (matching.length === 0) {
            this.#fail(`'${node.name}' is not available on ${receiverType.toNonNullable()}; it is available on ${candidates.flatMap(candidate => [candidate.on].flat()).join(', ')}`, pointer);
        }

        // The vocabulary declares a name once for any receiver, so only a type holding never fits more than one declaration.
        if (matching.length > 1) {
            this.#fail(`'${node.name}' is declared for ${matching.flatMap(candidate => [candidate.on].flat()).join(' and ')}, and ${receiverType.toNonNullable()} fits more than one, so which applies is ambiguous`, pointer);
        }

        const [declaration] = matching;

        this.#checkForm(declaration, node, pointer);

        const typeArguments = new Map();
        LanguageResolver.#matchesReceiver(declaration, receiverType, typeArguments);

        const resolved = this.#resolveArguments(declaration, node, pointer, scope, receiverType, typeArguments);

        const resultTypeArguments = new Map(typeArguments);

        if (resolved.selected !== undefined) {
            resultTypeArguments.set('@selected', resolved.selected.type);
        }

        const declared = Type.parse(declaration.result).resolveTypeParameters(resultTypeArguments);

        // A condition carries the request out as it declares itself, so its contract is the one a watch checks and the evaluation follows, beside the declaration the request invokes.
        const contract = resolved.selected?.contract ?? null;
        const used = contract === null ? { declaration, name: LanguageResolver.#qualifiedNameOf(declaration, receiverType) } : { declaration: contract, name: `${declaration.name}("${contract.name}")` };

        this.#usedDeclarations.push({ ...used, pointer });
        this.#resolutions.set(pointer, { kind: 'member', declaration, contract, receiverType, type: declared, arguments: resolved.arguments, selected: resolved.selected });

        const type = receiverType.isNullable || resolved.isNullable ? declared.toNullable() : declared;

        return { type, kind: LanguageResolver.#requestKindOf(declaration), isFixed: false };
    }

    /**
     * Resolves a name applied to a receiver of unknown type, which chooses no declaration among the candidates, those of its name or, for a default indexer, every default indexer. A property is accepted whatever its name, since a bound object's fields are named by its data; a call or an indexer must be a member's, written in the form and given the arguments one of its declarations takes. The declarations that take it agree on the kind of request they make.
     * Its type is the result type they share, made nullable, or left to the optional chain an optional access of null ends, and null where they share none or the name is no member's. Nothing applied to such a receiver is evaluated, so its arguments leave no resolution behind.
     */
    #resolveOnUnknownType(node, pointer, scope, receiverType, candidates = this.#moduleRegistry.getMembers(node.name)) {
        const isAccess = node.kind === 'member';
        const fields = isAccess ? this.#moduleRegistry.getFieldTypes(node.name) : [];
        const written = candidates.filter(candidate => FORM_NODE_KINDS[candidate.kind === 'property' ? 'access' : candidate.form] === node.kind);

        if (!isAccess && candidates.length === 0) {
            this.#fail(this.#moduleRegistry.getFieldTypes(node.name).length > 0 ? `'${node.name}' is a field and takes no argument: write '${DefinitionWriter.write(LanguageResolver.#accessOf(node))}'` : `'${node.name}' is no member of the vocabulary`, pointer);
        }

        if (!isAccess && written.length === 0) {
            this.#checkForm(candidates[0], node, pointer);
        }

        const fitting = [];
        let failure = null;

        for (const declaration of written) {
            const attempt = this.#tryResolveArguments(declaration, node, pointer, scope, receiverType);

            if (attempt.error === undefined) {
                fitting.push({ declaration, resolved: attempt.resolved });
            } else {
                failure ??= attempt.error;
            }
        }

        if (!isAccess && fitting.length === 0) {
            throw failure;
        }

        // An access may name a field of data, which is a value.
        const kinds = new Set([...fitting.map(({ declaration }) => LanguageResolver.#requestKindOf(declaration)), ...(isAccess ? ['query'] : [])]);

        if (kinds.size > 1) {
            this.#fail(`'${node.name}' follows a value whose type is unknown, and its declarations make ${[...kinds].map(kind => LanguageResolver.#descriptionOf(kind)).join(' or ')}, so what it requests is ambiguous`, pointer);
        }

        const resultTypes = [
            ...fitting.map(({ declaration, resolved }) => Type.parse(declaration.result).resolveTypeParameters(new Map(resolved.selected === undefined ? [] : [['@selected', resolved.selected.type]]))),
            ...fields.map(text => Type.parse(text)),
        ];
        const shared = resultTypes.reduce((merged, type) => (merged === null ? null : Type.merge(merged, type)), Type.never);
        // A member of a never is never evaluated, since no value has that type, so it answers what its declarations share as they declare it, and where none says what it would answer, nothing yet: a never, which fits wherever a value of any type is required.
        const isNever = receiverType.kind === 'never';
        // An optional access of null ends its chain, which is nullable for it, so its own type is the one its declarations share.
        const isShortCircuited = node.optional === true && receiverType.kind === 'null';
        const unknown = isNever ? Type.never : Type.null;
        const type = shared === null || shared.kind === 'never' || LanguageResolver.#holdsTypeParameter(shared) ? unknown : isNever || isShortCircuited ? shared : shared.toNullable();

        this.#resolutions.set(pointer, { kind: 'member', declaration: null, receiverType, type, arguments: [] });

        return { type, kind: [...kinds][0], isFixed: false };
    }

    /** Resolves the arguments the declaration would take, leaving no resolution and no use behind, and answers them or the failure that refuses them. */
    #tryResolveArguments(declaration, node, pointer, scope, receiverType) {
        const resolutions = new Map(this.#resolutions);
        const usedCount = this.#usedDeclarations.length;

        try {
            return { resolved: this.#resolveArguments(declaration, node, pointer, scope, receiverType, new Map()) };
        } catch (error) {
            if (!(error instanceof DomqlError)) {
                throw error;
            }

            return { error };
        } finally {
            this.#resolutions = resolutions;
            this.#usedDeclarations.length = usedCount;
        }
    }

    /** Refuses a member written in a form its declaration does not take, with the form it does: a property is accessed, and an operation called or named as its declaration says. */
    #checkForm(declaration, node, pointer) {
        const form = declaration.kind === 'property' ? 'access' : declaration.form;

        if (FORM_NODE_KINDS[form] === node.kind) {
            return;
        }

        const described = { access: 'is a property', call: 'uses call syntax', indexer: 'is an indexer' }[form];

        // An indexer takes its key in brackets, which a node written another way may not give.
        if (form === 'indexer' && node.argument === undefined) {
            this.#fail(`'${node.name}' ${described}: write '${DefinitionWriter.write(node.target)}${node.optional === true ? '?:' : ':'}${node.name}[…]'`, pointer);
        }

        const written = form === 'access' ? LanguageResolver.#accessOf(node) : { ...node, kind: FORM_NODE_KINDS[form] };

        this.#fail(`'${node.name}' ${described}: write '${DefinitionWriter.write(written)}'`, pointer);
    }

    /** The argument a call or an indexer is given, as the value of each parameter it supplies: the one parameter of a direct declaration, or the fields of an options object, each by its name. */
    #suppliedArguments(declaration, node, pointer) {
        const { parameters } = declaration;
        const supplied = new Map();
        const argumentPointer = `${pointer}/argument`;

        if (node.argument === undefined) {
            return supplied;
        }

        if (parameters.length === 0) {
            this.#fail(`'${declaration.name}' takes no argument`, argumentPointer);
        }

        if (declaration.input !== 'options') {
            supplied.set(parameters[0].name, { node: node.argument, pointer: argumentPointer });

            return supplied;
        }

        if (node.argument.kind !== 'object' || node.argument.target !== undefined) {
            this.#fail(`'${declaration.name}' takes its arguments as the fields of an object, as { ${parameters[0].name}: … }`, argumentPointer);
        }

        if (node.argument.locals !== undefined) {
            this.#fail(`'${declaration.name}' takes its arguments as the fields of an object, whose fields are its parameters, so it holds no locals`, `${argumentPointer}/locals/0`);
        }

        node.argument.fields.forEach((field, index) => {
            const parameter = parameters.find(candidate => candidate.name === field.name);

            if (parameter === undefined) {
                this.#fail(`'${declaration.name}' has no parameter '${field.name}'; it takes ${parameters.map(candidate => candidate.name).join(', ')}`, `${argumentPointer}/fields/${index}`);
            }

            supplied.set(parameter.name, { node: field.value, pointer: `${argumentPointer}/fields/${index}/value` });
        });

        return supplied;
    }

    #resolveArguments(declaration, node, pointer, scope, receiverType, typeArguments) {
        const parameters = declaration.parameters;
        const supplied = this.#suppliedArguments(declaration, node, pointer);

        const resolved = [];
        let isNullable = false;
        let selected;

        for (const parameter of parameters) {
            const given = supplied.get(parameter.name);

            if (given === undefined) {
                if (parameter.required) {
                    this.#fail(`'${declaration.name}' requires the argument '${parameter.name}'`, pointer);
                }

                resolved.push({ parameter, isDefault: true, value: parameter.default });
                continue;
            }

            const valuePointer = given.pointer;
            const expected = Type.parse(parameter.type).resolveTypeParameters(typeArguments);
            let result;

            if (parameter.kind === 'expression' || parameter.kind === 'predicate') {
                const isOfUnknownType = LanguageResolver.#isOfUnknownType(receiverType);

                if (receiverType.kind !== 'list' && !isOfUnknownType) {
                    this.#fail(`'${declaration.name}' evaluates its expression against the items of a list, and ${receiverType.toNonNullable()} has none`, valuePointer);
                }

                result = this.#resolveNode(given.node, valuePointer, { current: isOfUnknownType ? Type.never : receiverType.itemType.toNonNullable(), currentKey: {}, locals: scope.locals, facts: scope.facts });
                this.#requireQuery(result, parameter, declaration, valuePointer);

                // A predicate takes any value, which its function receives as its truthiness, but none whose type no receiver gives.
                if (parameter.kind === 'predicate' && LanguageResolver.#holdsTypeParameter(result.type)) {
                    this.#fail(`The expression of '${declaration.name}' produces ${result.type}, a type no receiver gives`, valuePointer);
                }

                if (parameter.kind === 'expression' && !result.type.isAssignableTo(expected)) {
                    this.#fail(`The expression of '${declaration.name}' must produce ${expected} and produces ${result.type}`, valuePointer);
                }
            } else {
                result = this.#resolveNode(given.node, valuePointer, scope);
                this.#requireQuery(result, parameter, declaration, valuePointer);

                if (!this.#checkValue(result, expected, parameter, declaration, valuePointer)) {
                    isNullable = true;
                }
            }

            if (parameter.fixed === true) {
                const selection = this.#select(parameter, result, declaration, receiverType, valuePointer);

                selected = selection.selected ?? selected;
            }

            resolved.push({ parameter, isDefault: false, pointer: valuePointer, node: given.node, value: parameter.fixed === true ? result.value : undefined });
        }

        return { arguments: resolved, isNullable, selected };
    }

    /** Checks a value argument against its parameter, answering false where a null makes the call answer null. */
    #checkValue(result, expected, parameter, declaration, pointer) {
        const actual = result.type;
        const wrong = () => this.#fail(`The argument '${parameter.name}' of '${declaration.name}' expects ${expected} and finds ${actual}`, pointer);

        if (actual.kind === 'null') {
            if (expected.isNullable) {
                return true;
            }

            if (parameter.nulls === 'propagate') {
                return false;
            }

            wrong();
        }

        if (parameter.nulls === 'propagate') {
            if (!actual.toNonNullable().isAssignableTo(expected.toNonNullable())) {
                wrong();
            }

            return !actual.isNullable;
        }

        if (!actual.isAssignableTo(expected)) {
            wrong();
        }

        return true;
    }

    #requireQuery(result, parameter, declaration, pointer) {
        if (result.kind !== 'query') {
            this.#fail(`The argument '${parameter.name}' of '${declaration.name}' is ${LanguageResolver.#descriptionOf(result.kind)}, and an argument is a value`, pointer);
        }
    }

    /** Resolves what a fixed argument selects from the vocabulary, which must be known before anything is evaluated. */
    #select(parameter, result, declaration, receiverType, pointer) {
        if (!result.isFixed || typeof result.value !== 'string') {
            this.#fail(`The argument '${parameter.name}' of '${declaration.name}' selects from the vocabulary, so it is a string the query's preparation settles, from literals and bound parameters, never null`, pointer);
        }

        const name = result.value;

        switch (parameter.selects) {
            case 'eventType': {
                const event = this.#moduleRegistry.getEventType(name);

                if (event === undefined) {
                    this.#fail(`'${name}' is no event type the vocabulary declares`, pointer);
                }

                return { selected: { name, type: Type.parse(event.payload) } };
            }
            default:
                return { selected: { name, type: Type.createNamedType('boolean'), contract: this.#conditionFor(name, declaration, receiverType, pointer) } };
        }
    }

    /**
     * The condition of the name that applies to the receiver and that the verb asks, the call's name, whose declaration carries the request out: its function, how it changes and the observations that cover it.
     * A receiver of unknown type selects none, and takes any name a condition of the verb has; a name no condition of the verb has, one the receiver's type answers to another verb, and one no condition of the receiver's type has, are refused, naming those it has.
     */
    #conditionFor(name, declaration, receiverType, pointer) {
        const verb = declaration.name;
        const written = `'${verb}'`;
        const namesOf = predicate => this.#moduleRegistry.conditionNames.filter(other => this.#moduleRegistry.getConditions(other).some(predicate));
        const all = this.#moduleRegistry.getConditions(name);
        const conditions = all.filter(candidate => candidate.verb === verb);
        const isOfUnknownType = LanguageResolver.#isOfUnknownType(receiverType);

        // A condition another verb asks of the receiver is written with that verb, the one question it is.
        const asked = all.find(candidate => candidate.verb !== verb && (isOfUnknownType || LanguageResolver.#matchesAny(candidate.on, receiverType)));

        if (asked !== undefined && !conditions.some(candidate => isOfUnknownType || LanguageResolver.#matchesAny(candidate.on, receiverType))) {
            this.#fail(`'${name}' is asked with '${asked.verb}', not ${written}: write '.${asked.verb}(${DefinitionWriter.write({ kind: 'literal', value: name })})'`, pointer);
        }

        if (conditions.length === 0) {
            const names = namesOf(candidate => candidate.verb === verb);

            this.#fail(`'${name}' is no condition ${written} asks${names.length === 0 ? '' : `; it asks ${names.join(', ')}`}${this.#presenceMemberOf(verb, name, receiverType)}`, pointer);
        }

        if (isOfUnknownType) {
            return null;
        }

        const [condition] = conditions.filter(candidate => LanguageResolver.#matchesAny(candidate.on, receiverType));

        if (condition === undefined) {
            const available = namesOf(candidate => candidate.verb === verb && LanguageResolver.#matchesAny(candidate.on, receiverType));

            this.#fail(`'${name}' is a condition of ${conditions.flatMap(candidate => [candidate.on].flat()).join(', ')}, not of ${receiverType.toNonNullable()}${available.length === 0 ? `, which has no condition ${written} asks` : `, whose conditions ${written} asks are ${available.join(', ')}`}`, pointer);
        }

        return condition;
    }

    /** For a name `has` asks that no condition has, the Boolean member the receiver's type declares for the presence it names, as `children` names `hasChildren`; nothing for any other verb, name or receiver. */
    #presenceMemberOf(verb, name, receiverType) {
        if (verb !== 'has' || !/^[a-z]/.test(name)) {
            return '';
        }

        const member = `has${name[0].toUpperCase()}${name.slice(1)}`;
        const declares = this.#moduleRegistry.getMembers(member).some(candidate => candidate.kind === 'property' && candidate.result === 'boolean' && LanguageResolver.#matchesReceiver(candidate, receiverType, new Map()));

        return declares ? `; the member '${member}' answers whether it has ${name}` : '';
    }

    #resolveObject(node, pointer, scope) {
        const target = node.target === undefined ? null : this.#resolveNode(node.target, `${pointer}/target`, scope);

        if (target?.kind === 'behavior') {
            this.#fail('A behavior request ends its chain and takes no object expression', pointer);
        }

        // An object expression that follows an action shapes its result, and the request stays an action; one that follows an event source keeps it a subscription.
        const kind = target?.kind === 'action' || target?.kind === 'subscription' ? target.kind : 'query';

        let current = scope.current;
        let currentKey = scope.currentKey;

        if (target !== null) {
            currentKey = {};

            // An object expression following null is never applied, so its fields are resolved against no value.
            if (target.type.kind === 'null') {
                current = Type.never;
            } else {
                current = target.type.kind === 'list' || target.type.kind === 'event' ? target.type.itemType.toNonNullable() : target.type.toNonNullable();
            }
        }

        // Each local is resolved where it is written, against the current value and the locals before it, and every field sees them all.
        let locals = scope.locals;

        node.locals?.forEach((local, index) => {
            const valuePointer = `${pointer}/locals/${index}/value`;
            const result = this.#resolveNode(local.value, valuePointer, { current, currentKey, locals, facts: scope.facts });

            if (result.kind !== 'query') {
                this.#fail(`The local '${local.name}' is ${LanguageResolver.#descriptionOf(result.kind)}, and a local is a value`, valuePointer);
            }

            locals = new Map(locals).set(local.name, { result, value: local.value, scope: { current, currentKey, locals, facts: scope.facts } });
        });

        const fieldTypes = new Map();

        node.fields.forEach((field, index) => {
            const fieldPointer = `${pointer}/fields/${index}`;
            const { name } = field;
            const result = this.#resolveNode(field.value, `${fieldPointer}/value`, { current, currentKey, locals, facts: scope.facts });

            if (result.kind !== 'query') {
                this.#fail(`The field '${name}' is ${LanguageResolver.#descriptionOf(result.kind)}, and a field is a value`, `${fieldPointer}/value`);
            }

            if (!this.#isData(result.type)) {
                this.#fail(`The field '${name}' would hold ${result.type}, which is no data; read the facts it needs through an object expression`, `${fieldPointer}/value`);
            }

            fieldTypes.set(name, result.type);
        });

        const objectType = Type.createObjectType(fieldTypes);
        const isNullable = target?.type.isNullable === true;

        if (target?.type.kind === 'list') {
            return { type: Type.createListType(objectType, isNullable), kind, isFixed: false };
        }

        if (target?.type.kind === 'event') {
            return { type: Type.createEventType(objectType, isNullable), kind: 'subscription', isFixed: false };
        }

        return { type: isNullable ? objectType.toNullable() : objectType, kind, isFixed: false };
    }

    #checkWatch() {
        const unobserved = this.#usedDeclarations.filter(use => use.declaration.changes === 'unobserved');

        if (unobserved.length > 0) {
            this.#fail(`A watch cannot follow ${unobserved.map(use => `'${use.name}'`).join(', ')}, which name no observations`, unobserved[0].pointer);
        }

        const partlyObservableUses = this.#usedDeclarations.filter(use => use.declaration.changes === 'partly-observable');

        if (partlyObservableUses.length > 0 && this.#options.acceptPartialObservation !== true) {
            const missesByName = [...new Map(partlyObservableUses.map(use => [use.name, use.declaration.misses])).entries()];

            this.#fail(`A watch over ${missesByName.map(([name, misses]) => `'${name}' (which misses ${misses})`).join(', ')} is refused unless the watch accepts partial observation`, partlyObservableUses[0].pointer);
        }
    }

    /** The type of the field a structured type or an object type declares under the name, or null. */
    #fieldTypeOf(type, name) {
        if (type.kind === 'object') {
            return type.fieldTypes.get(name) ?? null;
        }

        const structure = type.kind === 'named' ? this.#moduleRegistry.getType(type.name) : undefined;
        const text = structure?.fields[name];

        return text === undefined ? null : Type.parse(text);
    }

    /** Whether values of the type are data; a structure already being checked counts as data where it holds itself, since its other fields are checked where it is first met. */
    #isData(type, checking = new Set()) {
        switch (type.kind) {
            case 'null':
            case 'never':
                return true;
            case 'list':
                return this.#isData(type.itemType, checking);
            case 'object':
                return [...type.fieldTypes.values()].every(fieldType => this.#isData(fieldType, checking));
            case 'named': {
                if (DATA_TYPE_NAMES.has(type.name) || checking.has(type.name)) {
                    return true;
                }

                const structure = this.#moduleRegistry.getType(type.name);

                if (structure === undefined) {
                    return false;
                }

                checking.add(type.name);

                return Object.values(structure.fields).every(text => this.#isData(Type.parse(text), checking));
            }
            default:
                return false;
        }
    }

    #fail(message, pointer) {
        throw DomqlError.validation(message, this.#locations?.locate(pointer) ?? { pointer });
    }

    /** What a request of the kind is, for a message: a subscription is an event source. */
    static #descriptionOf(kind) {
        switch (kind) {
            case 'subscription':
                return 'an event source';
            case 'action':
                return 'an action';
            default:
                return `a ${kind}`;
        }
    }

    /** The property access that writes the node's name after its receiver, optional where the node is. */
    static #accessOf(node) {
        return { kind: 'member', target: node.target, name: node.name, ...(node.optional === true ? { optional: true } : {}) };
    }

    static #requestKindOf(declaration) {
        switch (declaration.kind) {
            case 'source':
                return 'subscription';
            case 'action':
            case 'behavior':
                return declaration.kind;
            default:
                return 'query';
        }
    }

    /** Whether the type says nothing of what its value would be: null's, a null binding's, and never's, which no value has. */
    static #isOfUnknownType(type) {
        return type.kind === 'null' || type.kind === 'never';
    }

    /** Whether the type writes a type parameter anywhere in it. */
    static #holdsTypeParameter(type) {
        if (type.kind === 'typeParameter') {
            return true;
        }

        if (type.itemType !== null) {
            return LanguageResolver.#holdsTypeParameter(type.itemType);
        }

        return type.fieldTypes !== null && [...type.fieldTypes.values()].some(fieldType => LanguageResolver.#holdsTypeParameter(fieldType));
    }

    /**
     * The member's name qualified by the type of the declaration the receiver matched, as `node.root` and `shadow.root` are, so two members of one name are told apart; a declaration for any receiver keeps its name alone.
     * A list or an event source is named by its kind, as `list.count` is.
     */
    static #qualifiedNameOf(declaration, receiverType) {
        const base = receiverType.toNonNullable();
        const on = [declaration.on].flat().find(text => text !== 'any' && Type.tryMatchType(Type.parse(text), base, new Map()));

        if (on === undefined) {
            return declaration.name;
        }

        const type = Type.parse(on);

        return `${type.kind === 'named' ? type.name : type.kind}.${declaration.name}`;
    }

    /** Whether a value of the type compares with a value of any type: null, which equals null alone, or a never, which no value has. */
    static #comparesWithAny(type) {
        return type.kind === 'null' || type.kind === 'never';
    }

    /** Whether values of the type are compared with each other, rather than with null alone: strings, numbers, Booleans and nodes. */
    static #isComparable(type) {
        return type.kind === 'named' && (['string', 'number', 'boolean'].includes(type.name) || type.isNode);
    }

    /** Whether the declaration applies to the receiver, recording the arguments of the type parameters its types write. */
    static #matchesReceiver(declaration, receiverType, typeArguments) {
        return LanguageResolver.#matchesAny(declaration.on, receiverType, typeArguments);
    }

    static #matchesAny(on, receiverType, typeArguments = new Map()) {
        const base = receiverType.toNonNullable();

        return [on].flat().some(text => {
            if (text === 'any') {
                return base.kind === 'named' || base.kind === 'list' || base.kind === 'object';
            }

            return Type.tryMatchType(Type.parse(text), base, typeArguments);
        });
    }
}
