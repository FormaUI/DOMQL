/**
 * LanguageResolver — resolves a DOMQL definition against the vocabulary and validates its types, before anything is evaluated
 */

import { DefinitionWriter } from './DefinitionWriter.mjs';
import { DomqlError } from './DomqlError.mjs';
import { ResolvedDefinition } from './ResolvedDefinition.mjs';
import { Type } from './Type.mjs';

const DATA_TYPE_NAMES = new Set(['number', 'string', 'boolean']);
const READABLE_MEMBER_KINDS = new Set(['property', 'operation']);

/** How each form of a declaration is written, and the node that writes it. */
const FORM_NODE_KINDS = { access: 'member', call: 'call', named: 'namedOperation' };

export class LanguageResolver {
    #moduleRegistry;
    #bindings;
    #locations;
    #options;

    /** @type {Map<string, object>} */
    #resolutions = new Map();

    /** @type {object[]} */
    #usedDeclarations = [];

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
            case 'namedOperation':
                return this.#resolveMember(node, pointer, scope);
            case 'predicate':
                return this.#resolvePredicate(node, pointer, scope);
            case 'conditional':
                return this.#resolveConditional(node, pointer, scope);
            case 'and':
            case 'or':
                return this.#resolveLogical(node, pointer, scope);
            default:
                return this.#resolveObject(node, pointer, scope);
        }
    }

    /** Resolves a predicate expression: its subject, and the predicate name it reads, under its verb and against the subject's type. */
    #resolvePredicate(node, pointer, scope) {
        const { verb } = node;
        const subject = this.#resolveNode(node.target, `${pointer}/target`, scope);

        if (subject.kind !== 'query') {
            this.#fail(`'${verb}' tests ${LanguageResolver.#descriptionOf(subject.kind)}, which is no value`, pointer);
        }

        // Is null answers whether the subject is null, so it is never null itself.
        if (node.name.kind === 'literal' && node.name.value === null) {
            return { type: Type.createNamedType('boolean'), kind: 'query', isFixed: false };
        }

        if (subject.type.kind === 'null') {
            this.#fail(`'${verb}' tests null, which no predicate applies to`, pointer);
        }

        this.#resolvePredicateName(node.name, `${pointer}/name`, verb, subject.type);

        const type = Type.createNamedType('boolean');

        return { type: subject.type.isNullable ? type.toNullable() : type, kind: 'query', isFixed: false };
    }

    /** Resolves the predicate name a predicate expression reads, under its verb and against the subject's type. */
    #resolvePredicateName(node, pointer, verb, subjectType) {
        const predicateName = this.#resolveNode(node, pointer, { current: null, locals: new Map() });

        if (!predicateName.isFixed || typeof predicateName.value !== 'string') {
            this.#fail(`A predicate '${verb}' reads is named by a string, or a parameter bound to a string, never null`, pointer);
        }

        const name = predicateName.value;
        const predicate = this.#moduleRegistry.getPredicate(verb, name);

        if (predicate === undefined || !LanguageResolver.#matchesAny(predicate.on, subjectType)) {
            this.#fail(`'${verb} "${name}"' is no predicate of ${subjectType.toNonNullable()}; '${verb}' reads ${this.#moduleRegistry.getPredicateNames(verb).join(', ')}`, pointer);
        }

        this.#resolutions.set(pointer, { kind: 'predicate', predicate });
        this.#usedDeclarations.push({ declaration: { name: `${verb} ${name}`, changes: predicate.changes, reads: predicate.reads, misses: predicate.misses }, pointer });
    }

    /** Resolves a conditional: a Boolean condition, and two branches of one type, nullable where either is; the whole is resolved before any of it is evaluated. */
    #resolveConditional(node, pointer, scope) {
        const condition = this.#resolveNode(node.condition, `${pointer}/condition`, scope);

        if (condition.kind !== 'query' || !(condition.type.kind === 'null' || (condition.type.kind === 'named' && condition.type.name === 'boolean'))) {
            this.#fail(`The condition of 'if' is a Boolean expression, and this one is ${condition.kind === 'query' ? condition.type : LanguageResolver.#descriptionOf(condition.kind)}`, `${pointer}/condition`);
        }

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

    /** Resolves an and or an or: every expression it combines, each a Boolean, so the whole is validated before any of it is evaluated, and answers a Boolean that is nullable where an operand is. */
    #resolveLogical(node, pointer, scope) {
        let isNullable = false;

        node.operands.forEach((operand, index) => {
            const operandPointer = `${pointer}/operands/${index}`;
            const result = this.#resolveNode(operand, operandPointer, scope);

            if (result.kind !== 'query') {
                this.#fail(`'${node.kind}' combines Boolean expressions, and this one is ${LanguageResolver.#descriptionOf(result.kind)}`, operandPointer);
            }

            if (result.type.kind !== 'null' && !(result.type.kind === 'named' && result.type.name === 'boolean')) {
                this.#fail(`'${node.kind}' combines Boolean expressions, and this one is ${result.type}`, operandPointer);
            }

            isNullable ||= result.type.isNullable;
        });

        const type = Type.createNamedType('boolean');

        return { type: isNullable ? type.toNullable() : type, kind: 'query', isFixed: false };
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

        return declaration.form === 'named' ? `self ${name} …` : `self.${name}(…)`;
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

        return { type: LanguageResolver.#toType(this.#bindings.getType(node.name)), kind: 'query', isFixed: true, value: this.#bindings.get(node.name) };
    }

    #resolveMember(node, pointer, scope) {
        const receiver = this.#resolveNode(node.target, `${pointer}/target`, scope);
        const receiverType = receiver.type;

        if (receiver.kind !== 'query') {
            this.#fail(`'${node.name}' follows ${LanguageResolver.#descriptionOf(receiver.kind)}, which takes no members`, pointer);
        }

        if (receiverType.kind === 'null') {
            this.#fail(`'${node.name}' follows null, which has no members`, pointer);
        }

        const field = this.#fieldTypeOf(receiverType, node.name);

        if (field !== null) {
            if (node.kind !== 'member') {
                this.#fail(`'${node.name}' is a field of ${receiverType.toNonNullable()} and takes no argument: write '${DefinitionWriter.write({ kind: 'member', target: node.target, name: node.name })}'`, pointer);
            }

            this.#resolutions.set(pointer, { kind: 'field', name: node.name, receiverType });

            return { type: receiverType.isNullable ? field.toNullable() : field, kind: 'query', isFixed: false };
        }

        const candidates = this.#moduleRegistry.getMembers(node.name);

        if (candidates.length === 0) {
            this.#fail(`'${node.name}' is no member of the vocabulary`, pointer);
        }

        const declaration = candidates.find(candidate => LanguageResolver.#matchesReceiver(candidate, receiverType, new Map()));

        if (declaration === undefined) {
            this.#fail(`'${node.name}' is not available on ${receiverType.toNonNullable()}; it is available on ${candidates.flatMap(candidate => [candidate.on].flat()).join(', ')}`, pointer);
        }

        this.#checkForm(declaration, node, pointer);

        const typeArguments = new Map();
        LanguageResolver.#matchesReceiver(declaration, receiverType, typeArguments);

        const resolved = this.#resolveArguments(declaration, node, pointer, scope, receiverType, typeArguments);

        const resultTypeArguments = new Map(typeArguments);

        if (resolved.selected !== undefined) {
            resultTypeArguments.set('@selected', resolved.selected.type);
        }

        const declared = Type.parse(declaration.result).resolveTypeParameters(resultTypeArguments);

        this.#usedDeclarations.push({ declaration, pointer });
        this.#resolutions.set(pointer, { kind: 'member', declaration, receiverType, type: declared, arguments: resolved.arguments, selected: resolved.selected, steps: resolved.steps });

        const type = receiverType.isNullable || resolved.isNullable ? declared.toNullable() : declared;

        return { type, kind: LanguageResolver.#requestKindOf(declaration), isFixed: false };
    }

    /** Refuses a member written in a form its declaration does not take, with the form it does: a property is accessed, and an operation called or named as its declaration says. */
    #checkForm(declaration, node, pointer) {
        const form = declaration.kind === 'property' ? 'access' : declaration.form;

        if (FORM_NODE_KINDS[form] === node.kind) {
            return;
        }

        const written = form === 'access' ? { kind: 'member', target: node.target, name: node.name } : { ...node, kind: FORM_NODE_KINDS[form] };
        const described = { access: 'a property', call: 'a call', named: 'a named operation' }[form];

        this.#fail(`'${node.name}' is ${described}: write '${DefinitionWriter.write(written)}'`, pointer);
    }

    /** The argument a call or a named operation is given, as the value of each parameter it supplies: the one parameter of a direct declaration, or the fields of an options object, each by its name. */
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
        let steps;

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
                if (receiverType.kind !== 'list') {
                    this.#fail(`'${declaration.name}' evaluates its expression against the items of a list, and ${receiverType.toNonNullable()} has none`, valuePointer);
                }

                result = this.#resolveNode(given.node, valuePointer, { current: receiverType.itemType.toNonNullable(), locals: scope.locals });
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
                steps = selection.steps ?? steps;
            }

            resolved.push({ parameter, isDefault: false, pointer: valuePointer, node: given.node, value: parameter.fixed === true ? result.value : undefined });
        }

        return { arguments: resolved, isNullable, selected, steps };
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
            this.#fail(`The argument '${parameter.name}' of '${declaration.name}' selects from the vocabulary, so it is a string literal or a parameter bound to a string, never null`, pointer);
        }

        const name = result.value;

        switch (parameter.selects) {
            case 'member':
                return this.#selectMember(receiverType, name, pointer);
            case 'eventType': {
                const event = this.#moduleRegistry.getEventType(name);

                if (event === undefined) {
                    this.#fail(`'${name}' is no event type the vocabulary declares`, pointer);
                }

                return { selected: { name, type: Type.parse(event.payload) } };
            }
            default:
                if (!this.#moduleRegistry.hasFeature(name)) {
                    this.#fail(`'${name}' is no feature the vocabulary declares`, pointer);
                }

                return { selected: { name, type: Type.createNamedType('string') } };
        }
    }

    /** Resolves the chain of names a get reads, each segment against the type before it, answering the type of the last. */
    #selectMember(receiverType, path, pointer) {
        let current = receiverType;
        let isNullable = false;
        const steps = [];

        for (const segment of path.split('.')) {
            isNullable ||= current.isNullable;

            const field = this.#fieldTypeOf(current, segment);

            if (field !== null) {
                steps.push({ kind: 'field', name: segment });
                current = field;
                isNullable ||= field.isNullable;
                continue;
            }

            const declaration = this.#moduleRegistry.getMembers(segment).find(candidate => READABLE_MEMBER_KINDS.has(candidate.kind) && candidate.parameters.every(parameter => !parameter.required) && LanguageResolver.#matchesReceiver(candidate, current, new Map()));

            if (declaration === undefined) {
                this.#fail(`'${segment}' names no property or operation of ${current.toNonNullable()} that reads without arguments`, pointer);
            }

            const typeArguments = new Map();
            LanguageResolver.#matchesReceiver(declaration, current, typeArguments);
            current = Type.parse(declaration.result).resolveTypeParameters(typeArguments);
            steps.push({ kind: 'member', declaration, type: current });
            isNullable ||= current.isNullable;
            this.#usedDeclarations.push({ declaration, pointer });
        }

        return { selected: { name: path, type: isNullable ? current.toNullable() : current }, steps };
    }

    #resolveObject(node, pointer, scope) {
        const target = node.target === undefined ? null : this.#resolveNode(node.target, `${pointer}/target`, scope);

        if (target?.kind === 'behavior') {
            this.#fail('A behavior request ends its chain and takes no object expression', pointer);
        }

        // An object expression that follows an action shapes its result, and the request stays an action.
        const kind = target?.kind === 'action' ? 'action' : 'query';

        let current = scope.current;

        if (target !== null) {
            if (target.type.kind === 'null') {
                this.#fail('An object expression follows null, which has no value to read fields of', pointer);
            }

            current = target.type.kind === 'list' || target.type.kind === 'event' ? target.type.itemType.toNonNullable() : target.type.toNonNullable();
        }

        // Each local is resolved where it is written, against the current value and the locals before it, and every field sees them all.
        let locals = scope.locals;

        node.locals?.forEach((local, index) => {
            const valuePointer = `${pointer}/locals/${index}/value`;
            const result = this.#resolveNode(local.value, valuePointer, { current, locals });

            if (result.kind !== 'query') {
                this.#fail(`The local '${local.name}' is ${LanguageResolver.#descriptionOf(result.kind)}, and a local is a value`, valuePointer);
            }

            locals = new Map(locals).set(local.name, { result, value: local.value });
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
            this.#fail(`A watch cannot follow ${unobserved.map(use => `'${use.declaration.name}'`).join(', ')}, which name no observations`, unobserved[0].pointer);
        }

        const partlyObservableUses = this.#usedDeclarations.filter(use => use.declaration.changes === 'partly-observable');

        if (partlyObservableUses.length > 0 && this.#options.acceptPartialObservation !== true) {
            const missesByName = [...new Map(partlyObservableUses.map(use => [use.declaration.name, use.declaration.misses])).entries()];

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

    #isData(type) {
        switch (type.kind) {
            case 'null':
                return true;
            case 'list':
                return this.#isData(type.itemType);
            case 'object':
                return [...type.fieldTypes.values()].every(fieldType => this.#isData(fieldType));
            case 'named': {
                if (DATA_TYPE_NAMES.has(type.name)) {
                    return true;
                }

                const structure = this.#moduleRegistry.getType(type.name);

                return structure !== undefined && Object.values(structure.fields).every(text => this.#isData(Type.parse(text)));
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

    static #toType(binding) {
        let type;

        switch (binding.kind) {
            case 'list':
                type = Type.createListType(LanguageResolver.#toType(binding.item));
                break;
            case 'object':
                type = Type.createObjectType(new Map([...binding.fields].map(([name, field]) => [name, LanguageResolver.#toType(field)])));
                break;
            default:
                type = Type.createNamedType(binding.kind);
        }

        return binding.isNullable ? type.toNullable() : type;
    }
}
