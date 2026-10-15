/**
 * QueryEvaluator — evaluates a resolved request, answering detached data: a query as it reads now, a subscription's projection of each event its source delivers, and an action's result read through the object expression that follows it
 */

import { DomqlError } from '../language/DomqlError.mjs';
import { Type } from '../language/Type.mjs';
import { SessionCache } from './SessionCache.mjs';
import { Observations } from './Observations.mjs';
import { QueryEvaluation } from './QueryEvaluation.mjs';

/** @typedef {{ window: Window, document: Document }} Environment */


/** The observation of whether an element is attached, which a member that answered null for a detached element depends on. */
const ATTACHMENT_OBSERVATION = Object.freeze({ type: 'attachment', of: 'receiver' });

/** What follows a receiver's flat-tree ancestry at each of its roots: the structure of the root's tree, and the slots its elements are assigned to. */
const ANCESTRY_OBSERVATIONS = Object.freeze([
    Object.freeze({ type: 'mutation', of: 'roots', childList: true, subtree: true }),
    Object.freeze({ type: 'event', of: 'roots', types: Object.freeze(['slotchange']) }),
]);

/** The arguments of a call that takes none. */
const NO_ARGUMENTS = Object.freeze({});

/** The samples of a call that reads none. */
const NO_SAMPLES = Object.freeze([]);

/** The observations of a declaration that names none. */
const NO_OBSERVATIONS = Object.freeze([]);

export class QueryEvaluator {
    /** The fields of each declared structure, each with its type parsed, by the structure: valid for as long as the structure, which is frozen, and released with it. @type {WeakMap<object, [string, Type][]>} */
    static #fieldTypes = new WeakMap();

    /**
     * The function each node of a resolved definition compiles to, by the definition and then the node, with the registry they were compiled against: built once, it holds what the node's evaluation needs that no evaluation changes, and takes the evaluator, which holds what one does, and the current value.
     * @type {WeakMap<object, { registry: object, functions: Map<object, (evaluator: QueryEvaluator, current: unknown) => unknown> }>}
     */
    static #compiled = new WeakMap();

    /** The functions this evaluator's nodes compile to. @type {Map<object, (evaluator: QueryEvaluator, current: unknown) => unknown>} */
    #compiledFunctions;

    #moduleRegistry;
    #resolvedDefinition;
    #parameterBindings;
    #environment;
    #locations;

    /** The element each item of a list an object expression projected came from, by the list it produced, for the evaluation in progress. @type {WeakMap<unknown[], (Element | null)[]>} */
    #elementsOf = new WeakMap();

    /** The selections made for each field of an object an object expression gave, as `#branches` holds them, by the object and then the field's name, for the evaluation in progress. @type {WeakMap<object, Map<string, Map<object, object | string>>>} */
    #branchesOf = new WeakMap();

    /**
     * The selections made for the value being evaluated at its place in the result, by the node that made each: the branch a conditional or a coalescing selected, as its node, and the name an access by name selected; null where none has been made.
     * A result's identities hold them as their `branches`, a name kept from when conditionals alone made them.
     * @type {Map<object, object | string> | null}
     */
    #branches = null;

    /** The frame of locals of the innermost application of an object expression that has any, with the value of each evaluated so far, inside those of the applications enclosing it; null outside every one. @type {{ node: object, item: unknown, values: Map<string, { value: unknown, branches: Map<object, object | string> | null }>, enclosing: object | null } | null} */
    #localsFrame = null;

    /** What the evaluation in progress records, or null where none does. @type {{ observations: import('./Observations.mjs').Observations, onChange: () => void, holdsAll: boolean, replaces: QueryEvaluation[] | null, dependencies: object[] | null, sessions: import('./SessionCache.mjs').CachedSession[], owner: object, sessionCache: SessionCache, unheld: object[], rootOf: WeakMap<object, object>, rootsOf: WeakMap<object, object[]>, followedRoots: WeakSet<object>, followedAttachments: WeakSet<object>, isPending: boolean } | null} */
    #recording = null;

    /** The identities of the value `#detach` detached last. @type {import('../snapshots/SnapshotPatcher.mjs').Identities} */
    #detachedIdentities = null;

    /**
     * The terminal member's node and value while evaluating its projection.
     * The value is an event or an action result. The context is null outside a projection.
     * @type {{ node: object, value: unknown } | null}
     */
    #projectionContext = null;

    /**
     * @param {import('../language/vocabulary/ModuleRegistry.mjs').ModuleRegistry} moduleRegistry The vocabulary the request was resolved against.
     * @param {import('../language/ResolvedDefinition.mjs').ResolvedDefinition} resolvedDefinition The resolved definition to read.
     * @param {import('../language/ParameterBindings.mjs').ParameterBindings} parameterBindings What the request's parameters are bound to.
     * @param {Environment} environment The window and the document the roots stand for.
     * @param {import('../language/TextLocations.mjs').TextLocations | null} locations Where in a text each part of the definition came from.
     */
    constructor(moduleRegistry, resolvedDefinition, parameterBindings, environment, locations) {
        this.#moduleRegistry = moduleRegistry;
        this.#resolvedDefinition = resolvedDefinition;
        this.#parameterBindings = parameterBindings;
        this.#environment = environment;
        this.#locations = locations;

        let compiled = QueryEvaluator.#compiled.get(resolvedDefinition);

        if (compiled === undefined || compiled.registry !== moduleRegistry) {
            compiled = { registry: moduleRegistry, functions: new Map() };
            QueryEvaluator.#compiled.set(resolvedDefinition, compiled);
        }

        this.#compiledFunctions = compiled.functions;
    }

    /** The result of evaluating the query once: immutable data holding no reference to the document. A member maintained by an observation fails it, since its first sample cannot arrive during a synchronous evaluation. */
    evaluateOnce() {
        return this.#queryResult().value;
    }

    /**
     * Evaluates the query and records what the evaluation depended on, holding each dependency's observations through sessions that call `onChange` when something may have changed.
     * A maintained member whose first sample has not arrived is pending and answers null, and the evaluation is pending with it. A failure ends the evaluation without throwing, keeping the dependencies it recorded before failing and answering nothing.
     * The caller disposes the evaluation, which it does after it has the next one, so an observation both need keeps running.
     * The observations that keep a maintained member's sample are always held. The others are held where the caller keeps the result current, and otherwise only while the evaluation is pending, since a result that is complete needs nothing more observed.
     * @param {object} recording Where the dependencies are observed.
     * @param {import('./Observations.mjs').Observations} recording.observations The observations of the window the query is evaluated in.
     * @param {() => void} recording.onChange Called, synchronously, when something the result depends on may have changed.
     * @param {boolean} [recording.holdsAll] Whether every dependency's observation is held, as a watch holds them, rather than those a pending evaluation waits on.
     * @param {QueryEvaluation[] | null} [recording.replaces] The evaluations this one replaces, the latest last, as a watch's next evaluation replaces its last: it carries on the sessions the latest hands on, which hold every one the watch's evaluations kept, and takes a shared one wherever its call observes the same again, and a later evaluation may take its own. Null where none is replaced.
     * @param {boolean} [recording.recordsDependencies] Whether the evaluation answers a record of each call it depended on, which nothing it holds needs, since its sessions keep what it depends on observed; without one, its dependencies are null.
     */
    evaluate({ observations, onChange, holdsAll = false, replaces = null, recordsDependencies = false }) {
        return this.#record({ observations, onChange, holdsAll, replaces, recordsDependencies, waits: true }, () => this.#queryResult());
    }

    /**
     * Resolves the event source the subscription ends in into what starts it: the source's name, the function that carries it out, the receiver and arguments it is called with and the environment, how each event it delivers is captured, and where it stands, for a failure to name.
     * The receiver and arguments are evaluated once, now; where one of them is null there is nothing to listen to, and the answer is null.
     * `capture` answers an event as the fields its type declares, read as it is called: a field the event does not carry as a value its type admits is null where the type is nullable, and fails the capture where it is not; an event of a type with no fields is taken whole, where it is of its type.
     * @returns {{ name: string, start: Function, capture: (event: unknown) => unknown, receiver: unknown, args: Record<string, unknown>, environment: Environment, location: object } | null}
     */
    resolveSource() {
        const call = this.#resolveCall('subscription', 'subscribed to');

        return call.args === null ? null : { name: call.name, start: call.implementation, capture: event => this.#capture(event, call.node), receiver: call.receiver, args: call.args, environment: call.environment, location: call.location };
    }

    /**
     * Resolves the action the request ends in into what executes it: the action's name, the function that carries it out, the receiver and arguments it is called with and the environment, and where it stands, for a failure to name.
     * The receiver and arguments are evaluated once, now, as `evaluateOnce` evaluates them; where one of them is null the action is not executed, and the answer is null.
     * @returns {{ name: string, execute: Function, receiver: unknown, args: Record<string, unknown>, environment: Environment, location: object } | null}
     */
    resolveAction() {
        const call = this.#resolveCall('action', 'executed');

        return call.args === null ? null : { name: call.name, execute: call.implementation, receiver: call.receiver, args: call.args, environment: call.environment, location: call.location };
    }

    /**
     * Resolves the behavior the request ends in into what starts it: the behavior's declaration and name, the function that carries it out, the receiver and arguments it is called with and the environment, and where it stands, for a failure to name.
     * The receiver and arguments are evaluated now, as `evaluateOnce` evaluates them; where one of them is null there is nothing to start, and the arguments are null.
     * @returns {{ declaration: object, name: string, start: Function, receiver: unknown, args: Record<string, unknown> | null, environment: Environment, location: object }}
     */
    resolveBehavior() {
        const call = this.#resolveCall('behavior', 'applied');

        return { declaration: call.declaration, name: call.name, start: call.implementation, receiver: call.receiver, args: call.args, environment: call.environment, location: call.location };
    }

    /**
     * The result of an action, checked against the type the action declares and read through the object expression that follows it, if one does: an immutable snapshot containing no live DOM references.
     * The object expression is evaluated as `evaluateOnce` evaluates a query, so a member maintained by an observation fails it. A result of another type, or an object expression that fails, throws an evaluation error.
     * @param {unknown} result What the action's function answered, or null for an action that was not executed, since its receiver or an argument was null.
     * @param {{ wasExecuted?: boolean }} [execution] Whether the action was executed, so its result is checked against the type it declares.
     */
    projectResult(result, { wasExecuted = true } = {}) {
        const { node, pointer } = this.#terminalMemberNode();
        const { declaration, type } = this.#resolvedDefinition.resolutionOf(node);

        if (wasExecuted && !this.#conforms(result, type)) {
            this.#fail(`The action '${declaration.name}' answered ${QueryEvaluator.#describe(result)}, and it declares ${type}`, pointer);
        }

        this.#projectionContext = { node, value: result };

        try {
            return this.#evaluateResult().value;
        } finally {
            this.#projectionContext = null;
        }
    }

    /**
     * The member the request ends in, evaluated up to its call: its declaration, the function that carries it out, and its receiver and arguments, which are null where the receiver or an argument is.
     * A member that follows a receiver of unknown type has no declaration and no function, and its receiver is null.
     */
    #resolveCall(kind, operationDescription) {
        if (this.#resolvedDefinition.kind !== kind) {
            this.#fail(`A ${this.#resolvedDefinition.kind} request is not ${operationDescription}`, '/query');
        }

        const { node, pointer } = this.#terminalMemberNode();
        const resolution = this.#resolvedDefinition.resolutionOf(node);
        const { declaration } = resolution;
        const receiver = this.#evaluate(node.target, null);

        if (declaration === null) {
            return { declaration, name: node.name, implementation: null, receiver, args: null, environment: this.#environment, location: this.#locate(pointer), node };
        }

        const args = receiver === null ? null : this.#arguments(resolution, null);

        const implementation = this.#moduleRegistry.getFunction(declaration);

        if (implementation === undefined) {
            this.#fail(`The module '${this.#moduleRegistry.getOwner(declaration)}' supplies no function for '${declaration.name}'`, pointer);
        }

        return { declaration, name: declaration.name, implementation, receiver, args, environment: this.#environment, location: this.#locate(pointer), node };
    }

    /**
     * Evaluates the object expression that follows the event source against one event, as its source captured it, and records the observations its maintained members read.
     * A maintained member answers its latest sample, or null while the sample is pending, and is never waited for; the evaluation holds the sessions that keep its samples, so the caller keeps them for the next event and disposes the evaluation once it has the next one. A failure ends the evaluation without throwing.
     * @param {unknown} event The event, as `capture` answered it.
     * @param {object} recording Where the dependencies are observed.
     * @param {import('./Observations.mjs').Observations} recording.observations The observations of the window the subscription listens in.
     */
    project(event, { observations }) {
        return this.#record({ observations, onChange: () => {}, holdsAll: false, replaces: null, recordsDependencies: false, waits: false }, () => {
            const { node } = this.#terminalMemberNode();

            this.#projectionContext = { node, value: event };

            try {
                return this.#evaluateResult();
            } finally {
                this.#projectionContext = null;
            }
        });
    }

    /** Runs an evaluation that records what it depends on, answering the evaluation; one that waits holds what a pending result waits on, and lets a failure seen through a pending member pass. */
    #record({ observations, onChange, holdsAll, replaces, recordsDependencies, waits }, produce) {
        // A watch's sessions are carried from each evaluation to the next, so one it keeps needing is taken where it is rather than moved.
        const sessionCache = replaces?.at(-1)?.handOverSessionCache() ?? new SessionCache();

        sessionCache.beginEvaluation();

        const owner = {};
        const recording = { observations, onChange, holdsAll, replaces, dependencies: recordsDependencies ? [] : null, sessions: [], owner, sessionCache, unheld: [], rootOf: new WeakMap(), rootsOf: new WeakMap(), followedRoots: new WeakSet(), followedAttachments: new WeakSet(), isPending: false };
        let value;
        let identities = null;
        let error = null;

        this.#recording = recording;

        try {
            ({ value, identities } = produce());
        } catch (failure) {
            // An evaluation that fails having read a maintained member still pending reports nothing and waits for its sample, since the failure may come from the null the member answered, and nothing tells which failures do; one that fails before it reads a pending member reports its failure.
            error = waits && recording.isPending ? null : failure;
        } finally {
            this.#recording = null;
        }

        if (waits && recording.isPending) {
            try {
                // The pending result waits on whatever changes the evaluation depended on, so it holds them now.
                for (const request of recording.unheld) {
                    recording.sessions.push({ request, session: observations.acquire(request, onChange), values: null, owner });
                }
            } catch (failure) {
                error = failure;
            }
        }

        return new QueryEvaluation({ value, identities, isPending: recording.isPending, dependencies: recording.dependencies, sessions: recording.sessions, owner, sessionCache: replaces === null ? null : sessionCache, error });
    }

    /** The detached result, and the identities of the elements its lists were projected from, which the result itself never holds. */
    #queryResult() {
        if (this.#resolvedDefinition.kind !== 'query') {
            this.#fail(`A ${this.#resolvedDefinition.kind} request is not evaluated`, '/query');
        }

        return this.#evaluateResult();
    }

    #evaluate(node, current) {
        return this.#getCompiledFunction(node)(this, current);
    }

    /** The function the node compiles to, built the first time it is asked for and kept for every evaluation of its resolved definition. */
    #getCompiledFunction(node) {
        let compiledFunction = this.#compiledFunctions.get(node);

        if (compiledFunction === undefined) {
            compiledFunction = this.#compileNode(node);
            this.#compiledFunctions.set(node, compiledFunction);
        }

        return compiledFunction;
    }

    /** The node as a function of the evaluator and the current value, each kind evaluated as its section of the specification sets out, the nodes it holds compiled with it. */
    #compileNode(node) {
        switch (node.kind) {
            case 'literal': {
                const { value } = node;

                return () => value;
            }
            case 'parameter':
                if (node.name === 'window') {
                    return evaluator => evaluator.#environment.window;
                }

                if (node.name === 'document') {
                    return evaluator => evaluator.#environment.document;
                }

                return evaluator => evaluator.#parameterBindings.get(node.name);
            case 'self':
                return (evaluator, current) => current;
            case 'local':
                return evaluator => evaluator.#local(node);
            case 'member':
            case 'call':
            case 'infixCall':
                return this.#compileMember(node);
            case 'equality': {
                const left = this.#getCompiledFunction(node.left);
                const right = this.#getCompiledFunction(node.right);

                return (evaluator, current) => {
                    const value = left(evaluator, current);

                    return value === right(evaluator, current);
                };
            }
            case 'conditional': {
                const condition = this.#getCompiledFunction(node.condition);
                const consequent = this.#getCompiledFunction(node.consequent);
                const alternative = this.#getCompiledFunction(node.alternative);

                // The branch the condition selects is recorded for the value's place in the result.
                return (evaluator, current) => {
                    const isTrue = condition(evaluator, current) === true;

                    (evaluator.#branches ??= new Map()).set(node, isTrue ? node.consequent : node.alternative);

                    return (isTrue ? consequent : alternative)(evaluator, current);
                };
            }
            case 'optionalChain':
                // An access that meets null answers null, and so does everything after it in its chain, which is evaluated no further.
                return this.#getCompiledFunction(node.target);
            case 'coalescing': {
                const value = this.#getCompiledFunction(node.value);
                const fallback = this.#getCompiledFunction(node.fallback);

                return (evaluator, current) => {
                    const answer = value(evaluator, current);

                    (evaluator.#branches ??= new Map()).set(node, answer === null ? node.fallback : node.value);

                    return answer === null ? fallback(evaluator, current) : answer;
                };
            }
            case 'and': {
                const operands = node.operands.map(operand => this.#getCompiledFunction(operand));

                return (evaluator, current) => {
                    for (const operand of operands) {
                        if (operand(evaluator, current) !== true) {
                            return false;
                        }
                    }

                    return true;
                };
            }
            case 'or': {
                const operands = node.operands.map(operand => this.#getCompiledFunction(operand));

                return (evaluator, current) => {
                    for (const operand of operands) {
                        if (operand(evaluator, current) === true) {
                            return true;
                        }
                    }

                    return false;
                };
            }
            case 'not': {
                const operand = this.#getCompiledFunction(node.operand);

                return (evaluator, current) => operand(evaluator, current) !== true;
            }
            case 'cast': {
                const target = this.#getCompiledFunction(node.target);
                const { type } = node;

                // A cast answers its target where it is of the type, and null where it is of another or is null.
                return (evaluator, current) => {
                    const value = target(evaluator, current);

                    return value !== null && evaluator.#conformsNamed(value, type) ? value : null;
                };
            }
            case 'object':
                return this.#compileObject(node);
            default:
                this.#fail(`A '${node.kind}' node has no evaluation`, this.#pointerOf(node));
        }
    }

    /**
     * A member access, a call or an infix call, with its resolution, its function, its arguments and the check of its result made once.
     * An access by name, and a member of a receiver of unknown type, which answers null without reading anything, are evaluated as the node itself says.
     */
    #compileMember(node) {
        const resolution = this.#resolvedDefinition.resolutionOf(node);

        if (resolution === undefined || resolution.kind === 'byName' || (resolution.kind !== 'field' && resolution.declaration === null)) {
            return (evaluator, current) => evaluator.#member(node, current);
        }

        const target = this.#getCompiledFunction(node.target);

        if (resolution.kind === 'field') {
            const { name } = resolution;

            return (evaluator, current) => {
                if (evaluator.#projectionContext !== null && node === evaluator.#projectionContext.node) {
                    return evaluator.#projectionContext.value;
                }

                const receiver = target(evaluator, current);

                return receiver === null ? null : receiver[name] ?? null;
            };
        }

        const { declaration, type } = resolution;
        const implementation = this.#moduleRegistry.getFunction(declaration);
        const conforms = this.#compileConformance(type);
        const argumentsOf = this.#compileArguments(resolution);

        return (evaluator, current) => {
            // A projection stands the event or the result where its member is, so that member is never read again.
            if (evaluator.#projectionContext !== null && node === evaluator.#projectionContext.node) {
                return evaluator.#projectionContext.value;
            }

            const receiver = target(evaluator, current);

            if (receiver === null) {
                return null;
            }

            const args = argumentsOf(evaluator, current);

            return args === null ? null : evaluator.#call(declaration, implementation, conforms, receiver, args, type, node);
        };
    }

    /** The arguments a call is given, each argument's plan made once: its default or fixed value, an expression evaluated against each item, or a value, null where it makes the call answer null. */
    #compileArguments(resolution) {
        if (resolution.arguments.length === 0) {
            return () => NO_ARGUMENTS;
        }

        const plans = resolution.arguments.map(argument => {
            const { parameter } = argument;

            if (argument.isDefault || parameter.fixed) {
                return { name: parameter.name, kind: 'constant', value: argument.isDefault ? parameter.default : argument.value };
            }

            return { name: parameter.name, kind: parameter.kind, evaluate: this.#getCompiledFunction(argument.node), propagates: parameter.nulls === 'propagate' };
        });

        return (evaluator, current) => {
            const args = {};

            for (const plan of plans) {
                if (plan.kind === 'constant') {
                    args[plan.name] = plan.value;
                } else if (plan.kind === 'expression') {
                    const { evaluate } = plan;

                    args[plan.name] = item => evaluate(evaluator, item);
                } else {
                    const value = plan.evaluate(evaluator, current);

                    if (value === null && plan.propagates) {
                        return null;
                    }

                    args[plan.name] = value;
                }
            }

            return args;
        };
    }

    /** An object expression, its target, its fields' names and values and whether it holds locals found once; applied to each item of a list it follows, and to the value it follows otherwise. */
    #compileObject(node) {
        const hasTarget = node.target !== undefined;
        const target = hasTarget ? this.#getCompiledFunction(node.target) : null;
        const names = this.#resolvedDefinition.fieldNamesOf(node);
        const fields = node.fields.map((field, index) => ({ name: names[index], evaluate: this.#getCompiledFunction(field.value) }));

        return (evaluator, current) => {
            const value = hasTarget ? target(evaluator, current) : current;

            if (!(hasTarget && Array.isArray(value))) {
                return value === null && hasTarget ? null : evaluator.#applyFields(node, fields, value);
            }

            const items = [];
            let isOfElements = value.length > 0;

            for (const item of value) {
                items.push(item === null ? null : evaluator.#applyFields(node, fields, item));
                isOfElements &&= item === null || item?.nodeType === 1;
            }

            // A list of elements is projected item by item, so each item keeps the element it came from; two elements can project to the same data.
            if (isOfElements) {
                evaluator.#elementsOf.set(items, [...value]);
            }

            return items;
        };
    }

    /** The object the fields give the item, evaluated against it in order with the expression's locals in scope, with the branches each field's conditionals selected; a field's name is a name, so it is assigned as it is. */
    #applyFields(node, fields, item) {
        const object = {};
        const enclosingBranches = this.#branches;
        const enclosingLocals = this.#localsFrame;
        let branches = null;

        if (node.locals !== undefined) {
            this.#localsFrame = { node, item, values: new Map(), enclosing: enclosingLocals };
        }

        try {
            for (const field of fields) {
                this.#branches = null;

                const value = field.evaluate(this, item);

                object[field.name] = value;

                if (this.#branches !== null) {
                    (branches ??= new Map()).set(field.name, this.#branches);
                }
            }
        } finally {
            this.#branches = enclosingBranches;
            this.#localsFrame = enclosingLocals;
        }

        if (branches !== null) {
            this.#branchesOf.set(object, branches);
        }

        return object;
    }

    /** Whether a value is one the type admits, as `#conforms` answers, with the type's structure, and each declared structure's fields, found once. */
    #compileConformance(type) {
        const admits = this.#compileAdmission(type);

        return value => (value === undefined ? false : value === null ? type.isNullable : admits(value));
    }

    #compileAdmission(type) {
        switch (type.kind) {
            case 'typeParameter':
                return () => true;
            case 'list': {
                const item = this.#compileConformance(type.itemType);

                return value => Array.isArray(value) && QueryEvaluator.#holeOf(value) === -1 && value.every(item);
            }
            case 'object': {
                const fields = [...type.fieldTypes].map(([name, fieldType]) => [name, this.#compileConformance(fieldType)]);

                return value => QueryEvaluator.#isRecord(value) && fields.every(([name, conforms]) => conforms(value[name]));
            }
            default: {
                const { name } = type;
                const structure = this.#moduleRegistry.getType(name);

                // A compiled function holds no evaluator, so it holds nothing an evaluation bound.
                if (structure === undefined) {
                    return value => QueryEvaluator.#isOfBuiltIn(value, name) ?? false;
                }

                const fields = QueryEvaluator.#fieldTypesOf(structure).map(([field, fieldType]) => [field, this.#compileConformance(fieldType)]);

                return value => QueryEvaluator.#isRecord(value) && fields.every(([field, conforms]) => conforms(value[field]));
            }
        }
    }

    /**
     * The value of the local the node names: evaluated at its first use in the application of the object expression that holds it, against that application's current value and the locals in scope where it is written, and the same value at every later use there.
     * The branches its conditionals selected are recorded at every place in the result it is used.
     */
    #local(node) {
        let frame = this.#localsFrame;

        while (!frame.node.locals.some(local => local.name === node.name)) {
            frame = frame.enclosing;
        }

        let entry = frame.values.get(node.name);

        if (entry === undefined) {
            const enclosingLocals = this.#localsFrame;
            const enclosingBranches = this.#branches;

            this.#localsFrame = frame;
            this.#branches = null;

            try {
                entry = { value: this.#evaluate(frame.node.locals.find(local => local.name === node.name).value, frame.item), branches: this.#branches };
            } finally {
                this.#localsFrame = enclosingLocals;
                this.#branches = enclosingBranches;
            }

            frame.values.set(node.name, entry);
        }

        if (entry.branches !== null) {
            const branches = (this.#branches ??= new Map());

            entry.branches.forEach((branch, conditional) => branches.set(conditional, branch));
        }

        return entry.value;
    }

    #member(node, current) {
        // A projection stands the event or the result where its member is, so that member is never read again.
        if (node === this.#projectionContext?.node) {
            return this.#projectionContext.value;
        }

        const receiver = this.#evaluate(node.target, current);

        if (receiver === null) {
            return null;
        }

        const resolution = this.#resolvedDefinition.resolutionOf(node);

        if (resolution.kind !== 'byName') {
            return this.#read(resolution, receiver, node, current);
        }

        // An access by name computes its name once and reads the property it selects, which is recorded for the value's place in the result.
        const name = this.#evaluate(node.name, current);

        (this.#branches ??= new Map()).set(node, name);

        return this.#read(resolution.candidates.get(name), receiver, node, current);
    }

    /** Reads the member the resolution names of the receiver: a field of its data, or the declaration's function with the arguments it is given. */
    #read(resolution, receiver, node, current) {
        if (resolution.kind === 'field') {
            return receiver[resolution.name] ?? null;
        }

        const args = this.#arguments(resolution, current);

        return args === null ? null : this.#invoke(resolution.declaration, receiver, args, resolution.type, node);
    }

    /** The arguments by parameter name, or null where a null argument makes the call answer null. */
    #arguments(resolution, current) {
        const args = {};

        for (const argument of resolution.arguments) {
            const { parameter } = argument;

            if (argument.isDefault || parameter.fixed) {
                args[parameter.name] = argument.isDefault ? parameter.default : argument.value;
            } else if (parameter.kind === 'expression') {
                args[parameter.name] = item => this.#evaluate(argument.node, item);
            } else {
                const value = this.#evaluate(argument.node, current);

                if (value === null && parameter.nulls === 'propagate') {
                    return null;
                }

                args[parameter.name] = value;
            }
        }

        return args;
    }

    /** Carries out a declaration's function, checking that its result is of the declared type. */
    #invoke(declaration, receiver, args, type, node) {
        return this.#call(declaration, this.#moduleRegistry.getFunction(declaration), value => this.#conforms(value, type), receiver, args, type, node);
    }

    /** Carries out the function of a declaration whose function and check of its result are found already. */
    #call(declaration, implementation, conforms, receiver, args, type, node) {
        if (implementation === undefined) {
            this.#fail(`The module '${this.#moduleRegistry.getOwner(declaration)}' supplies no function for '${declaration.name}'`, this.#pointerOf(node));
        }

        const samples = this.#observe(declaration, receiver, args, node);

        if (samples === null) {
            return null;
        }

        let value;

        try {
            value = implementation(receiver, args, this.#environment, samples);
        } catch (error) {
            throw DomqlError.evaluation(`The member '${declaration.name}' failed: ${error?.message ?? String(error)}`, this.#locate(this.#pointerOf(node)), { cause: error });
        }

        if (!conforms(value)) {
            this.#fail(`The member '${declaration.name}' answered ${QueryEvaluator.#describe(value)}, and it declares ${type}`, this.#pointerOf(node));
        }

        this.#followDetachedReceiver(declaration, receiver, value, node);

        return value;
    }

    /**
     * Records what the call depends on and holds its observations, answering the samples of its maintained observations, in the order the declaration names them.
     * Answers null where a sample is still pending, which makes the member answer null and the evaluation pending.
     */
    #observe(declaration, receiver, args, node) {
        if (this.#recording === null) {
            if (declaration.reads === 'maintained') {
                this.#fail(`The member '${declaration.name}' is maintained by an observation, and reading it waits for the first sample, which a synchronous evaluation cannot`, this.#pointerOf(node));
            }

            return NO_SAMPLES;
        }

        const { observations, dependencies } = this.#recording;
        const observationDeclarations = declaration.observations ?? NO_OBSERVATIONS;
        const requests = dependencies === null ? null : [];
        let samples = NO_SAMPLES;
        let isPending = false;
        let roots = null;

        for (let place = 0; place < observationDeclarations.length; place++) {
            const observationDeclaration = observationDeclarations[place];

            // An observation of the receiver's roots is one request at each of them.
            if (observationDeclaration.of === 'roots') {
                roots ??= this.#rootsOf(receiver);

                for (let index = 0; index < roots.length; index++) {
                    const held = this.#holdAt(observationDeclaration, args, roots[index]);

                    if (held !== null) {
                        requests?.push(held.request);

                        if (held.session?.contract === 'maintained') {
                            const sample = held.session.sample();

                            isPending ||= sample.pending;
                            (samples === NO_SAMPLES ? (samples = []) : samples).push(sample.value);
                        }
                    }
                }

                continue;
            }

            const isOfRoot = observationDeclaration.of === 'root';
            const target = isOfRoot ? Observations.rootOf(receiver, this.#recording.rootOf) : observations.targetOf(observationDeclaration, receiver, args);
            const held = this.#holdAt(observationDeclaration, args, target);

            if (held !== null) {
                requests?.push(held.request);

                if (held.session?.contract === 'maintained') {
                    const sample = held.session.sample();

                    isPending ||= sample.pending;
                    (samples === NO_SAMPLES ? (samples = []) : samples).push(sample.value);
                }
            }

            if (isOfRoot) {
                // An observation of its root's structure sees the receiver leave it, so only a detached tree, which moves without a change inside it, needs more.
                if (QueryEvaluator.#followsItsRoot(observationDeclaration)) {
                    this.#followAttachment(receiver, target, requests);
                } else {
                    roots ??= this.#rootsOf(receiver);
                }
            }
        }

        if (roots !== null) {
            this.#followAncestry(receiver, roots, requests);
        }

        dependencies?.push({ member: declaration.name, pointer: this.#pointerOf(node), observations: requests });

        if (isPending) {
            this.#recording.isPending = true;

            return null;
        }

        return samples;
    }

    /** A member that answered null for an element that is detached depends on whether the element is attached, so it is read again when the element returns. */
    #followDetachedReceiver(declaration, receiver, value, node) {
        if (this.#recording === null || value !== null || receiver?.nodeType !== 1 || receiver.isConnected || this.#moduleRegistry.getObservationType('attachment') === undefined || this.#recording.followedAttachments.has(receiver)) {
            return;
        }

        this.#recording.followedAttachments.add(receiver);

        const held = this.#holdAt(ATTACHMENT_OBSERVATION, NO_ARGUMENTS, receiver);

        this.#recording.dependencies?.push({ member: declaration.name, pointer: this.#pointerOf(node), observations: [held.request] });
    }

    /**
     * Follows the flat-tree ancestry of a receiver whose roots a call observes, once an evaluation: the structure of each root and the slots assigned in it, so moving the receiver or an ancestor to another tree or slot evaluates again and rebinds what observes its roots; and, for a receiver in a detached tree, whether it is attached, since moving a detached tree changes nothing inside it.
     * @param {unknown} receiver The call's receiver.
     * @param {object[]} roots The roots of the receiver's ancestry.
     * @param {object[] | null} requests The requests the call records, which these join, or null where the evaluation records none.
     */
    #followAncestry(receiver, roots, requests) {
        const { followedRoots } = this.#recording;

        // Every receiver leaving a root changes the root's own structure, so each root is followed once an evaluation, whichever receiver is in it.
        roots.forEach(root => {
            if (followedRoots.has(root)) {
                return;
            }

            followedRoots.add(root);
            ANCESTRY_OBSERVATIONS.forEach(observationDeclaration => {
                if (this.#moduleRegistry.getObservationType(observationDeclaration.type) !== undefined) {
                    const held = this.#holdAt(observationDeclaration, NO_ARGUMENTS, root);

                    requests?.push(held.request);
                }
            });
        });

        this.#followAttachment(receiver, roots.at(-1) ?? null, requests);
    }

    /** Follows whether the receiver is attached, once an evaluation, where the outermost root of its ancestry is the top of a detached tree, which moves without a change inside any root. */
    #followAttachment(receiver, outermost, requests) {
        const { followedAttachments } = this.#recording;

        if (outermost === null || outermost.nodeType === 9 || (outermost.nodeType === 11 && outermost.host !== undefined) || followedAttachments.has(receiver) || this.#moduleRegistry.getObservationType(ATTACHMENT_OBSERVATION.type) === undefined) {
            return;
        }

        followedAttachments.add(receiver);
        const held = this.#holdAt(ATTACHMENT_OBSERVATION, NO_ARGUMENTS, receiver);

        requests?.push(held.request);
    }

    /** Whether the observation of a receiver's root sees the receiver leave it: a mutation of the root's children through its subtree. */
    static #followsItsRoot(observationDeclaration) {
        return observationDeclaration.type === 'mutation' && observationDeclaration.childList === true && observationDeclaration.subtree === true;
    }

    /** The roots of the receiver's flat-tree ancestry, each node's found once an evaluation, so receivers that share an ancestry walk it once. */
    #rootsOf(receiver) {
        return Observations.rootsOf(receiver, this.#recording.rootsOf);
    }

    /**
     * The request the observation resolves to at the target, and its session: the one this evaluation already holds for it, the one an evaluation this one replaces holds, which becomes this one's own, or a new one; null where the target is null.
     * The session is null where the evaluation leaves the request unheld, acquiring it only where the evaluation turns out pending.
     * @returns {import('./SessionCache.mjs').CachedSession | null}
     */
    #holdAt(observationDeclaration, args, target) {
        if (target === null || target === undefined) {
            return null;
        }

        const { sessionCache, owner, sessions } = this.#recording;
        const cachedSession = sessionCache.find(observationDeclaration, args, target, owner);

        if (cachedSession === null) {
            return this.#hold(this.#recording.observations.resolveAt(observationDeclaration, { args }, target), observationDeclaration);
        }

        if (sessionCache.claim(cachedSession, owner)) {
            sessions.push(cachedSession);
        }

        return cachedSession;
    }

    /**
     * Holds the observation of the request, answering it with its session, or leaves it unheld where only a pending evaluation needs it, with no session.
     * A shared observation is kept under the observation and its target, held or unheld, for every later call of this evaluation that observes the same and, held, for a later evaluation to take.
     * @returns {import('./SessionCache.mjs').CachedSession}
     */
    #hold(request, observationDeclaration) {
        const { observations, onChange, holdsAll, sessions, sessionCache, unheld, owner } = this.#recording;
        const observationType = this.#moduleRegistry.getObservationType(request.type);
        const cachedSession = { request, session: null, values: null, owner };

        if (observationType !== undefined && observationType.contract === 'invalidation' && !holdsAll) {
            unheld.push(request);
        } else {
            cachedSession.session = observations.acquire(request, onChange);
            sessions.push(cachedSession);
        }

        // A type no module declares is refused by `acquire` before here, so the type is known.
        if (observationType.shared !== false) {
            cachedSession.values = Observations.valuesOf(request);
            sessionCache.keep(observationDeclaration, cachedSession);
        }

        return cachedSession;
    }

    /** The member a subscription, an action or a behavior request ends in, and where it stands: the object expressions of a request each follow the one before, and the first follows that member, which an optional chain may hold. */
    #terminalMemberNode() {
        let node = this.#resolvedDefinition.definition.query;
        let pointer = '/query';

        while (node.kind === 'object' || node.kind === 'optionalChain') {
            node = node.target;
            pointer = `${pointer}/target`;
        }

        return { node, pointer };
    }

    /** The event as the fields its type declares, each read and checked now as the event gives it, or the event itself where its type declares no structure; copying the projection's result is what isolates the data it answers. */
    #capture(event, node) {
        const pointer = this.#pointerOf(node);
        const { declaration, type } = this.#resolvedDefinition.resolutionOf(node);
        const { itemType } = type;
        const structure = itemType.kind === 'named' ? this.#moduleRegistry.getType(itemType.name) : undefined;

        if (structure === undefined) {
            if (!this.#conforms(event, itemType)) {
                this.#fail(`The source '${declaration.name}' delivered ${QueryEvaluator.#describe(event)}, and its event data is ${itemType}`, pointer);
            }

            return event;
        }

        const captured = {};

        for (const [name, fieldType] of QueryEvaluator.#fieldTypesOf(structure)) {
            const value = event?.[name];

            if (this.#conforms(value, fieldType)) {
                captured[name] = value;
            } else if (fieldType.isNullable) {
                captured[name] = null;
            } else {
                this.#fail(`The source '${declaration.name}' delivered an event whose '${name}' is ${QueryEvaluator.#describe(value)}, and its type declares ${fieldType}`, pointer);
            }
        }

        return captured;
    }

    /** Whether the value is one the type admits. */
    #conforms(value, type) {
        if (value === undefined) {
            return false;
        }

        if (value === null) {
            return type.isNullable;
        }

        switch (type.kind) {
            case 'typeParameter':
                return true;
            case 'list':
                return Array.isArray(value) && QueryEvaluator.#holeOf(value) === -1 && value.every(item => this.#conforms(item, type.itemType));
            case 'object':
                return QueryEvaluator.#isRecord(value) && [...type.fieldTypes].every(([name, fieldType]) => this.#conforms(value[name], fieldType));
            default:
                return this.#conformsNamed(value, type.name);
        }
    }

    #conformsNamed(value, name) {
        const isOfBuiltIn = QueryEvaluator.#isOfBuiltIn(value, name);

        if (isOfBuiltIn !== undefined) {
            return isOfBuiltIn;
        }

        const structure = this.#moduleRegistry.getType(name);

        return structure !== undefined && QueryEvaluator.#isRecord(value) && QueryEvaluator.#fieldTypesOf(structure).every(([field, type]) => this.#conforms(value[field], type));
    }

    /** Whether the value is of the built-in type the name names, or undefined where the name names a structure a module declares. */
    static #isOfBuiltIn(value, name) {
        switch (name) {
            case 'number':
                return Number.isFinite(value);
            case 'string':
                return typeof value === 'string';
            case 'boolean':
                return typeof value === 'boolean';
            case 'element':
                return value?.nodeType === 1;
            case 'document':
                return value?.nodeType === 9;
            case 'documentFragment':
                return value?.nodeType === 11 && value.host === undefined;
            case 'shadowRoot':
                return value?.nodeType === 11 && value.host !== undefined;
            case 'node':
                return value?.nodeType === 1 || value?.nodeType === 9 || value?.nodeType === 11;
            // An element's shadow view is the element itself, which its type, never its value, tells from the element.
            case 'shadow':
                return value?.nodeType === 1;
            case 'window':
                return value?.window === value;
            default:
                return undefined;
        }
    }

    #fail(message, pointer) {
        throw DomqlError.evaluation(message, this.#locate(pointer));
    }

    /** Where the node stands in the definition, as a JSON Pointer. */
    #pointerOf(node) {
        return this.#resolvedDefinition.pointerOf(node);
    }

    #locate(pointer) {
        return this.#locations?.locate(pointer) ?? { pointer };
    }

    /** The fields of the declared structure, in order, each with its type. */
    static #fieldTypesOf(structure) {
        let fields = QueryEvaluator.#fieldTypes.get(structure);

        if (fields === undefined) {
            fields = Object.entries(structure.fields).map(([name, text]) => [name, Type.parse(text)]);
            QueryEvaluator.#fieldTypes.set(structure, fields);
        }

        return fields;
    }

    static #isRecord(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /** The first index of the list that holds no value, or -1 where every index holds one. */
    static #holeOf(list) {
        for (let index = 0; index < list.length; index++) {
            if (!(index in list)) {
                return index;
            }
        }

        return -1;
    }

    /** What the value is, for a message: nothing, a node, or its data where it has any. */
    static #describe(value) {
        if (value === undefined) {
            return 'nothing';
        }

        if (typeof value?.nodeType === 'number') {
            return value.nodeType === 1 ? 'an element' : 'a node';
        }

        const hole = Array.isArray(value) ? QueryEvaluator.#holeOf(value) : -1;

        if (hole !== -1) {
            return `a list with a hole at index ${hole}`;
        }

        try {
            return JSON.stringify(value) ?? String(value);
        } catch {
            return Object.prototype.toString.call(value);
        }
    }

    /** The query evaluated and detached, with its identities, which the evaluator lets go of once it hands them over, so it holds no element between evaluations. */
    #evaluateResult() {
        this.#elementsOf = new WeakMap();
        this.#branchesOf = new WeakMap();
        this.#branches = null;

        try {
            const value = this.#detach(this.#evaluate(this.#resolvedDefinition.definition.query, null));

            return { value, identities: QueryEvaluator.#withBranches(this.#detachedIdentities, this.#branches) };
        } finally {
            this.#detachedIdentities = null;
            this.#branches = null;
        }
    }

    /**
     * A frozen copy of the data sharing no structure with the original; the identities that follow its structure are left in `#detachedIdentities`: for a list projected from elements, the element each item came from, for a field, the branch each conditional selected for its value, and null where nothing beneath holds either.
     */
    #detach(value) {
        if (Array.isArray(value)) {
            const detached = [];
            const itemIdentities = [];
            let hasIdentities = false;

            for (const item of value) {
                detached.push(this.#detach(item));
                itemIdentities.push(this.#detachedIdentities);
                hasIdentities ||= this.#detachedIdentities !== null;
            }

            const elements = this.#elementsOf.get(value) ?? null;

            this.#detachedIdentities = elements === null && !hasIdentities ? null : { elements, items: itemIdentities };

            return Object.freeze(detached);
        }

        if (QueryEvaluator.#isRecord(value)) {
            const detached = {};
            const branches = this.#branchesOf.get(value);
            let fieldIdentities = null;

            for (const name of Object.keys(value)) {
                QueryEvaluator.#define(detached, name, this.#detach(value[name]));

                const identities = QueryEvaluator.#withBranches(this.#detachedIdentities, branches?.get(name) ?? null);

                if (identities !== null) {
                    fieldIdentities ??= {};
                    QueryEvaluator.#define(fieldIdentities, name, identities);
                }
            }

            this.#detachedIdentities = fieldIdentities === null ? null : { fields: fieldIdentities };

            return Object.freeze(detached);
        }

        this.#detachedIdentities = null;

        return value;
    }

    /** The identities of a value with the selections made for it beside them, as their `branches`, or the identities alone where none were made. */
    static #withBranches(identities, branches) {
        return branches === null ? identities : { ...identities, branches };
    }

    /** Gives the object a field of its own holding the value, a field named `__proto__` included, as a data object's fields are. */
    static #define(object, name, value) {
        if (name === '__proto__') {
            Object.defineProperty(object, name, { value, writable: true, enumerable: true, configurable: true });
        } else {
            object[name] = value;
        }
    }
}
