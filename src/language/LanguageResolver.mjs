/**
 * LanguageResolver — resolves a DOMQL definition against the vocabulary and validates its types, before anything is evaluated
 */

import { DefinitionWriter } from './DefinitionWriter.mjs';
import { DomqlError } from './DomqlError.mjs';
import { ResolvedDefinition } from './ResolvedDefinition.mjs';
import { Type } from './Type.mjs';

const DATA_TYPE_NAMES = new Set(['number', 'string', 'boolean']);

/** How each form of a declaration is written, and the node that writes it. */
const FORM_NODE_KINDS = { access: 'member', call: 'call', infix: 'infixCall', indexer: 'indexer' };

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
        const result = this.#resolveNode(definition.query, '/query', { current: null, locals: new Map() });

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
                return this.#resolveParameter(node, pointer);
            case 'self':
                if (scope.current === null) {
                    this.#fail("'self' is the current value, and there is none here", pointer);
                }

                return { type: scope.current, kind: 'query', isFixed: false };
            case 'local':
                return this.#resolveLocal(node, pointer, scope);
            case 'member':
            case 'call':
            case 'infixCall':
            case 'indexer':
                return this.#resolveMember(node, pointer, scope);
            case 'equality':
                return this.#resolveEquality(node, pointer, scope, false);
            case 'conditional':
                return this.#resolveConditional(node, pointer, scope);
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
            case 'convertibility':
                this.#resolveConversion(node, pointer, scope);

                return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
            case 'and':
            case 'or':
                return this.#resolveLogical(node, pointer, scope);
            default:
                return this.#resolveObject(node, pointer, scope);
        }
    }

    /** Resolves a coalescing: a value and a fallback of one type, as a conditional's branches are, its type the value's made non-null where the fallback's is; the whole is resolved before any of it is evaluated. */
    #resolveCoalescing(node, pointer, scope) {
        const [value, fallback] = ['value', 'fallback'].map(side => {
            const result = this.#resolveNode(node[side], `${pointer}/${side}`, scope);

            if (result.kind !== 'query') {
                this.#fail(`The ${side} of '??' is a value, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, `${pointer}/${side}`);
            }

            return result.type;
        });

        // A value of the type null is never anything but null, so the fallback's type is the whole's.
        const type = value.kind === 'null' ? fallback : Type.merge(value.toNonNullable(), fallback);

        if (type === null) {
            this.#fail(`The value and the fallback of '??' are of one type, and these are ${value} and ${fallback}`, `${pointer}/fallback`);
        }

        return { type, kind: 'query', isFixed: false };
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
     * For an equality of a value and a string that names one of the value's Boolean members, as `@input == "disabled"` or `@input == @state` writes one, the member to write, negated for `is not`; nothing for any other.
     * The name is read exactly, and the member is one the value's type declares.
     */
    #testOf(node, left, right, isNegated) {
        if (!right.isFixed || typeof right.value !== 'string' || (node.right.kind !== 'literal' && node.right.kind !== 'parameter')) {
            return '';
        }

        const receiverType = left.type.toNonNullable();
        const declares = this.#moduleRegistry.getMembers(right.value).some(candidate => candidate.kind === 'property' && candidate.result === 'boolean' && LanguageResolver.#matchesReceiver(candidate, receiverType, new Map()));

        if (!declares) {
            return '';
        }

        const name = node.right.kind === 'literal' ? right.value : node.right;
        const access = left.type.isNullable ? { kind: 'member', target: node.left, name, optional: true } : { kind: 'member', target: node.left, name };

        return `: a test is the member that answers it, so write '${DefinitionWriter.write(isNegated ? { kind: 'not', operand: access } : access)}'`;
    }

    /** Resolves a conditional: a Boolean condition, and two branches of one type, nullable where either is; the whole is resolved before any of it is evaluated. */
    #resolveConditional(node, pointer, scope) {
        const condition = this.#resolveNode(node.condition, `${pointer}/condition`, scope);

        this.#requireBoolean(condition, node.condition, "The condition of 'if'", `${pointer}/condition`);

        const branches = ['consequent', 'alternative'].map(branch => {
            const result = this.#resolveNode(node[branch], `${pointer}/${branch}`, scope);

            if (result.kind !== 'query') {
                this.#fail(`A branch of 'if' is a value, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, `${pointer}/${branch}`);
            }

            return result.type;
        });
        const type = Type.merge(...branches);

        if (type === null) {
            this.#fail(`The branches of 'if' are of one type, and these are ${branches[0]} and ${branches[1]}`, `${pointer}/alternative`);
        }

        return { type, kind: 'query', isFixed: false };
    }

    /** Resolves an and or an or: every expression it combines, each a Boolean that cannot be null, so the whole is validated before any of it is evaluated, and answers a Boolean. */
    #resolveLogical(node, pointer, scope) {
        node.operands.forEach((operand, index) => {
            const operandPointer = `${pointer}/operands/${index}`;

            this.#requireBoolean(this.#resolveNode(operand, operandPointer, scope), operand, `An operand of '${node.kind}'`, operandPointer);
        });

        return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
    }

    /**
     * Resolves a cast: its target, a value, and the type it casts to, a node or one of its kinds, its result that type made nullable.
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
            this.#fail(`A value of ${from.toNonNullable()} can never be cast to ${node.type}: the cast would always answer null`, pointer);
        }

        return { type: type.toNullable(), kind: 'query', isFixed: false };
    }

    /**
     * Resolves a conversion, or the conversion a convertibility tests: its target, a value, and the type of data it converts to, its result of that type, nullable where the target is.
     * A value already of the type answers itself, which no declaration overrides; any other takes the one conversion declared from its type to that one, never a chain of them.
     * A target of unknown type chooses none: null answers null, and a never is never evaluated.
     */
    #resolveConversion(node, pointer, scope) {
        const target = this.#resolveNode(node.target, `${pointer}/target`, scope);

        if (target.kind !== 'query') {
            this.#fail(`${node.kind === 'conversion' ? "What 'to' converts" : "What 'try' tests"} is a value, and this one is ${LanguageResolver.#descriptionOf(target.kind)}`, `${pointer}/target`);
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

    /** Resolves a negation: what it negates, a Boolean that cannot be null, and answers a Boolean. */
    #resolveNot(node, pointer, scope) {
        // An equality is negated as `!=` writes it, so the member a refusal gives is negated too.
        const operand = node.operand.kind === 'equality' ? this.#resolveEquality(node.operand, `${pointer}/operand`, scope, true) : this.#resolveNode(node.operand, `${pointer}/operand`, scope);

        this.#requireBoolean(operand, node.operand, "What 'not' negates", `${pointer}/operand`);

        return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
    }

    /** Refuses what is no Boolean that cannot be null where one stands: null is never false, so a nullable one says what absence means with `??`. */
    #requireBoolean(result, node, what, pointer) {
        if (result.kind !== 'query') {
            this.#fail(`${what} is a Boolean, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, pointer);
        }

        const { type } = result;

        // A never, which a member of the items of an empty list answers, is checked once a value reveals its type.
        if (type.kind === 'never' || (type.kind === 'named' && type.name === 'boolean' && !type.isNullable)) {
            return;
        }

        if (type.isNullable && (type.kind === 'null' || (type.kind === 'named' && type.name === 'boolean'))) {
            const text = DefinitionWriter.write({ kind: 'coalescing', value: node, fallback: { kind: 'literal', value: false } });

            this.#fail(`${what} is a Boolean that cannot be null, and this one is ${type}: write '(${text})', or '?? true', to say what its absence means`, pointer);
        }

        this.#fail(`${what} is a Boolean, and this one is ${type}`, pointer);
    }

    /** Resolves a local: what the one in scope with its name resolved to where it was written. A name no local in scope has is refused, with the form of the current value's member of that name where it has one. */
    #resolveLocal(node, pointer, scope) {
        const local = scope.locals.get(node.name);

        if (local === undefined) {
            const form = scope.current === null ? null : this.#memberForm(scope.current, node.name);

            this.#fail(`No local named '${node.name}' is in scope${form === null ? '' : `; write '${form}' for the member of the current value`}`, pointer);
        }

        this.#resolutions.set(pointer, { kind: 'local', name: node.name, value: local.value });

        return local.result;
    }

    /** How the member of the type with the name is written with `self` as its receiver, or null where the type has none. */
    #memberForm(type, name) {
        if (this.#fieldTypeOf(type, name) !== null) {
            return `self.${name}`;
        }

        const declaration = this.#moduleRegistry.getMembers(name).find(candidate => LanguageResolver.#matchesReceiver(candidate, type, new Map()));

        if (declaration === undefined) {
            return null;
        }

        if (declaration.kind === 'property') {
            return `self.${name}`;
        }

        return { infix: `self ${name} …`, indexer: `self:${name}[…]` }[declaration.form] ?? `self.${name}(…)`;
    }

    #resolveLiteral(node) {
        const { value } = node;
        const type = value === null ? Type.null : Type.createNamedType(typeof value);

        return { type, kind: 'query', isFixed: true, value };
    }

    #resolveParameter(node, pointer) {
        if (node.name === 'document' || node.name === 'window') {
            return { type: Type.createNamedType(node.name), kind: 'query', isFixed: false };
        }

        if (!this.#bindings.has(node.name)) {
            this.#fail(`The parameter '@${node.name}' is not bound`, pointer);
        }

        return { type: this.#bindings.getType(node.name), kind: 'query', isFixed: true, value: this.#bindings.get(node.name) };
    }

    #resolveMember(node, pointer, scope) {
        const receiver = this.#resolveNode(node.target, `${pointer}/target`, scope);
        const isDefaultIndexer = node.kind === 'indexer' && node.name === undefined;
        const written = isDefaultIndexer ? ':[…]' : typeof node.name === 'string' ? node.name : `[${DefinitionWriter.write(node.name)}]`;

        if (receiver.kind !== 'query') {
            this.#fail(`'${written}' follows ${LanguageResolver.#descriptionOf(receiver.kind)}, which takes no members`, pointer);
        }

        // An access and a call require a receiver that cannot be null, and an optional one reads it where it is not null, ending its chain with null where it is; an infix call applies its receiver's null policy.
        if (receiver.type.isNullable && node.kind !== 'infixCall') {
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
     * Resolves an access by name: the names its expression can give, which preparation determines, each a property of the receiver, their types of one type as a conditional's branches are.
     * The resolution keeps each name's, so evaluation reads the one the name selects; on a receiver of unknown type, whether each is a property and whether their types agree are checked once its type is known.
     */
    #resolveByName(node, pointer, scope, receiverType) {
        const namePointer = `${pointer}/name`;
        const name = this.#resolveNode(node.name, namePointer, scope);
        const possible = name.kind === 'query' ? this.#possibleNamesOf(node.name, scope) : null;

        if (possible === null) {
            this.#fail(`An access by name reads a name determined when the query is prepared, which a string literal, null, a bound parameter, a local holding one, or a conditional or a '??' of them gives, and '${DefinitionWriter.write(node.name)}' is none of them`, namePointer);
        }

        if (possible.canBeNull || possible.names.size === 0) {
            this.#fail(`An access by name reads a string, and '${DefinitionWriter.write(node.name)}' can be null`, namePointer);
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
     * The names an access by name's expression can give, determined through these forms alone: a string literal, null, a bound parameter, a local whose value is one of them, a conditional whose branches are, and a `??` of them, whose names are its value's and, where its value can be null, its fallback's.
     * Null is tracked through them, so a `??` can remove it; any other expression gives no names that can be determined, and answers null.
     * @returns {{ names: Set<string>, canBeNull: boolean } | null}
     */
    #possibleNamesOf(node, scope) {
        const of = value => (typeof value === 'string' ? { names: new Set([value]), canBeNull: false } : value === null ? { names: new Set(), canBeNull: true } : null);

        switch (node.kind) {
            case 'literal':
                return of(node.value);
            case 'parameter':
                return node.name === 'document' || node.name === 'window' ? null : of(this.#bindings.get(node.name));
            case 'local': {
                const local = scope.locals.get(node.name);

                return local === undefined ? null : this.#possibleNamesOf(local.value, local.scope);
            }
            case 'conditional': {
                const sides = [node.consequent, node.alternative].map(branch => this.#possibleNamesOf(branch, scope));

                return sides.includes(null) ? null : { names: new Set(sides.flatMap(side => [...side.names])), canBeNull: sides.some(side => side.canBeNull) };
            }
            case 'coalescing': {
                const value = this.#possibleNamesOf(node.value, scope);
                const fallback = this.#possibleNamesOf(node.fallback, scope);

                if (value === null || fallback === null) {
                    return null;
                }

                return { names: new Set([...value.names, ...(value.canBeNull ? fallback.names : [])]), canBeNull: value.canBeNull && fallback.canBeNull };
            }
            default:
                return null;
        }
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
            this.#fail(`'${node.name}' is no member of the vocabulary${this.#presenceTestOf(node, receiverType)}`, pointer);
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

        // A state carries the request out as it declares itself, so its contract is the one a watch checks and the evaluation follows, beside the declaration the request invokes.
        const contract = resolved.selected?.contract ?? null;
        const used = contract === null ? { declaration, name: LanguageResolver.#qualifiedNameOf(declaration, receiverType) } : { declaration: contract, name: `:${declaration.name}["${contract.name}"]` };

        this.#usedDeclarations.push({ ...used, pointer });
        this.#resolutions.set(pointer, { kind: 'member', declaration, contract, receiverType, type: declared, arguments: resolved.arguments, selected: resolved.selected });

        const type = receiverType.isNullable || resolved.isNullable ? declared.toNullable() : declared;

        return { type, kind: LanguageResolver.#requestKindOf(declaration), isFixed: false };
    }

    /**
     * Resolves a name applied to a receiver of unknown type, which chooses no declaration among the candidates, those of its name or, for a default indexer, every default indexer. A property is accepted whatever its name, since a bound object's fields are named by its data; a call or an infix call must be a member's, written in the form and given the arguments one of its declarations takes. The declarations that take it agree on the kind of request they make.
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

        const described = { access: 'is a property', call: 'uses call syntax', infix: 'uses infix-call syntax', indexer: 'is an indexer' }[form];

        // An indexer takes its key in brackets, which a node written another way may not give.
        if (form === 'indexer' && node.argument === undefined) {
            this.#fail(`'${node.name}' ${described}: write '${DefinitionWriter.write(node.target)}${node.optional === true ? '?:' : ':'}${node.name}[…]'`, pointer);
        }

        const written = form === 'access' ? LanguageResolver.#accessOf(node) : { ...node, kind: FORM_NODE_KINDS[form] };

        this.#fail(`'${node.name}' ${described}: write '${DefinitionWriter.write(written)}'`, pointer);
    }

    /** The argument a call or an infix call is given, as the value of each parameter it supplies: the one parameter of a direct declaration, or the fields of an options object, each by its name. */
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

            if (parameter.kind === 'expression') {
                const isOfUnknownType = LanguageResolver.#isOfUnknownType(receiverType);

                if (receiverType.kind !== 'list' && !isOfUnknownType) {
                    this.#fail(`'${declaration.name}' evaluates its expression against the items of a list, and ${receiverType.toNonNullable()} has none`, valuePointer);
                }

                result = this.#resolveNode(given.node, valuePointer, { current: isOfUnknownType ? Type.never : receiverType.itemType.toNonNullable(), locals: scope.locals });
                this.#requireQuery(result, parameter, declaration, valuePointer);

                if (!result.type.isAssignableTo(expected)) {
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
            this.#fail(`The argument '${parameter.name}' of '${declaration.name}' selects from the vocabulary, so it is a string literal, a parameter bound to a string or a local holding one, never null`, pointer);
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
            case 'state':
                return { selected: { name, type: Type.createNamedType('boolean'), contract: this.#stateFor(name, declaration, receiverType, pointer) } };
            default:
                if (!this.#moduleRegistry.hasFeature(name)) {
                    this.#fail(`'${name}' is no feature the vocabulary declares`, pointer);
                }

                return { selected: { name, type: Type.createNamedType('string') } };
        }
    }

    /**
     * The state of the name that applies to the receiver, whose declaration carries the request out: its function, how it changes and the observations that cover it.
     * A receiver of unknown type selects none, and takes any name a state has; a name no state has, and one no state of the receiver's type has, are refused, naming those it has.
     */
    #stateFor(name, declaration, receiverType, pointer) {
        const states = this.#moduleRegistry.getStates(name);
        const written = `'${declaration.name}'`;

        if (states.length === 0) {
            const names = this.#moduleRegistry.stateNames;

            this.#fail(`'${name}' is no state the vocabulary declares${names.length === 0 ? '' : `; it declares ${names.join(', ')}`}`, pointer);
        }

        if (LanguageResolver.#isOfUnknownType(receiverType)) {
            return null;
        }

        const [state] = states.filter(candidate => LanguageResolver.#matchesAny(candidate.on, receiverType));

        if (state === undefined) {
            const available = this.#moduleRegistry.stateNames.filter(other => this.#moduleRegistry.getStates(other).some(candidate => LanguageResolver.#matchesAny(candidate.on, receiverType)));

            this.#fail(`'${name}' is a state of ${states.flatMap(candidate => [candidate.on].flat()).join(', ')}, not of ${receiverType.toNonNullable()}${available.length === 0 ? `, which has no state ${written} tests` : `, whose states are ${available.join(', ')}`}`, pointer);
        }

        return state;
    }

    #resolveObject(node, pointer, scope) {
        const target = node.target === undefined ? null : this.#resolveNode(node.target, `${pointer}/target`, scope);

        if (target?.kind === 'behavior') {
            this.#fail('A behavior request ends its chain and takes no object expression', pointer);
        }

        // An object expression that follows an action shapes its result, and the request stays an action; one that follows an event source keeps it a subscription.
        const kind = target?.kind === 'action' || target?.kind === 'subscription' ? target.kind : 'query';

        let current = scope.current;

        if (target !== null) {
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
            const result = this.#resolveNode(local.value, valuePointer, { current, locals });

            if (result.kind !== 'query') {
                this.#fail(`The local '${local.name}' is ${LanguageResolver.#descriptionOf(result.kind)}, and a local is a value`, valuePointer);
            }

            locals = new Map(locals).set(local.name, { result, value: local.value, scope: { current, locals } });
        });

        const fieldTypes = new Map();

        node.fields.forEach((field, index) => {
            const fieldPointer = `${pointer}/fields/${index}`;
            const { name } = field;
            const result = this.#resolveNode(field.value, `${fieldPointer}/value`, { current, locals });

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

    /** The member access that writes the node's name after its receiver, optional where the node is. */
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

    /**
     * For `has` written as a presence test, as `@input has "selection"`, the Boolean member the receiver's type declares for it, as the form to write; nothing for any other name or receiver.
     * The name is read exactly, as a presence test's was, so `"Selection"` names nothing.
     */
    #presenceTestOf(node, receiverType) {
        if (node.kind !== 'infixCall' || node.name !== 'has' || node.argument?.kind !== 'literal' || typeof node.argument.value !== 'string' || !/^[a-z]/.test(node.argument.value)) {
            return '';
        }

        const name = `has${node.argument.value[0].toUpperCase()}${node.argument.value.slice(1)}`;
        const declares = this.#moduleRegistry.getMembers(name).some(candidate => candidate.result === 'boolean' && LanguageResolver.#matchesReceiver(candidate, receiverType, new Map()));

        return declares ? `: a presence test is the member that answers it, so write '${DefinitionWriter.write({ kind: 'member', target: node.target, name })}'` : '';
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
