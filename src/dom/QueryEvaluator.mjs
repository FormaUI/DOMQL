/**
 * QueryEvaluator — evaluates a resolved request, answering detached data: a query as it reads now, a subscription's projection of each event its source delivers, and an action's result read through the object expression that follows it
 */

import { ArrayUtils } from '../common/ArrayUtils.mjs';
import { ObjectUtils } from '../common/ObjectUtils.mjs';
import { DomqlError } from '../language/DomqlError.mjs';
import { Type } from '../language/Type.mjs';
import { DomqlModule } from '../language/vocabulary/DomqlModule.mjs';
import { SessionCache } from './SessionCache.mjs';
import { Observations } from './Observations.mjs';
import { QueryEvaluation } from './QueryEvaluation.mjs';

/** @typedef {{ window: Window, document: Document }} Environment */

/**
 * What an evaluation that observes holds while it runs: where its dependencies are observed, the sessions it acquires and those it leaves for later, and what it has found of the trees its receivers are in.
 * @typedef {object} ObservationContext
 * @property {import('./Observations.mjs').Observations} observations The observations of the window the evaluation runs in.
 * @property {() => void} onChange Called when something the evaluation depends on may have changed.
 * @property {boolean} holdsAllObservations Whether every observation is held, as a watch holds them, rather than those a pending evaluation waits on alone.
 * @property {QueryEvaluation[] | null} replaces The evaluations this one replaces, the latest last, or null where it replaces none.
 * @property {object[] | null} dependencies A record of each call the evaluation depended on, or null where its caller asked for none.
 * @property {import('./SessionCache.mjs').CachedSession[]} sessions The sessions the evaluation owns, which it disposes unless a later evaluation takes them.
 * @property {object} owner What stands for the evaluation as the owner of its sessions.
 * @property {object | null} consumer Whose evaluations the sessions serve, which an observation of a type that is not shared is kept for.
 * @property {SessionCache} sessionCache The sessions of the watch's evaluations, which this one takes from and adds to.
 * @property {object[]} deferredRequests The requests it leaves unheld, acquired only where the evaluation turns out pending.
 * @property {WeakMap<object, object>} rootOf The root of each node found so far.
 * @property {WeakMap<object, object[]>} rootsOf The roots of each node's flat-tree ancestry found so far.
 * @property {WeakSet<object>} followedRoots The roots whose structure the evaluation already follows.
 * @property {WeakSet<object>} followedAttachments The receivers whose attachment the evaluation already follows.
 * @property {boolean} isPending Whether a maintained member it read is still waiting for its first sample.
 */

/**
 * The locals of one application of an object expression: the values of those evaluated so far, inside the frame of the application enclosing it.
 * @typedef {object} LocalsFrame
 * @property {object} node The object expression whose locals the frame holds.
 * @property {unknown} item What the expression is applied to, which its locals are evaluated against.
 * @property {Map<string, { value: unknown, selections: Map<object, object | string> | null }>} values Each local evaluated so far, by its name, with the selections its evaluation made.
 * @property {LocalsFrame | null} enclosing The frame of the application enclosing this one, or null for the outermost.
 */


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
    static #fieldTypesByStructure = new WeakMap();

    /**
     * The function each node of a resolved definition compiles to, by the definition and then the node, with the registry they were compiled against: built once, it holds what the node's evaluation needs that no evaluation changes, and takes the evaluator, which holds what one does, and the current value.
     * @type {WeakMap<object, { registry: object, functions: Map<object, (evaluator: QueryEvaluator, current: unknown) => unknown> }>}
     */
    static #compilationCache = new WeakMap();

    /** The functions this evaluator's nodes compile to. @type {Map<object, (evaluator: QueryEvaluator, current: unknown) => unknown>} */
    #compiledFunctions;

    #moduleRegistry;
    #resolvedDefinition;
    #parameterBindings;
    #environment;
    #locations;

    /** The element each item of a list an object expression projected came from, by the list it produced, for the evaluation in progress. @type {WeakMap<unknown[], (Element | null)[]>} */
    #sourceElementsByList = new WeakMap();

    /** The selections made for each field of an object an object expression gave, as `#selections` holds them, by the object and then the field's name, for the evaluation in progress. @type {WeakMap<object, Map<string, Map<object, object | string>>>} */
    #fieldSelectionsByObject = new WeakMap();

    /**
     * The selections made for the value being evaluated at its place in the result, by the node that made each: the branch a conditional or a coalescing selected, as its node, and the name an access by name selected; null where none has been made.
     * A result's identities hold them as their `branches`, a name kept from when conditionals alone made them.
     * @type {Map<object, object | string> | null}
     */
    #selections = null;

    /** The frame of locals of the innermost application of an object expression that has any, with the value of each evaluated so far, inside those of the applications enclosing it; null outside every one. @type {LocalsFrame | null} */
    #localsFrame = null;

    /** What the evaluation in progress records, or null where none does. @type {ObservationContext | null} */
    #observationContext = null;

    /** The identities of the value `#copyResult` detached last. @type {import('../snapshots/SnapshotPatcher.mjs').Identities} */
    #copiedIdentities = null;

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

        let compilation = QueryEvaluator.#compilationCache.get(resolvedDefinition);

        if (compilation === undefined || compilation.registry !== moduleRegistry) {
            compilation = { registry: moduleRegistry, functions: new Map() };
            QueryEvaluator.#compilationCache.set(resolvedDefinition, compilation);
        }

        this.#compiledFunctions = compilation.functions;
    }

    /** The result of evaluating the query once: immutable data holding no reference to the document. A member maintained by an observation fails it, since its first sample cannot arrive during a synchronous evaluation. */
    evaluateOnce() {
        return this.#evaluateQuery().value;
    }

    /**
     * Evaluates the query and records what the evaluation depended on, holding each dependency's observations through sessions that call `onChange` when something may have changed.
     * A maintained member whose first sample has not arrived is pending and answers null, and the evaluation is pending with it. A failure ends the evaluation without throwing, keeping the dependencies it recorded before failing and answering nothing.
     * The caller disposes the evaluation, which it does after it has the next one, so an observation both need keeps running.
     * The observations that keep a maintained member's sample are always held. The others are held where the caller keeps the result current, and otherwise only while the evaluation is pending, since a result that is complete needs nothing more observed.
     * @param {object} observationContext Where the dependencies are observed.
     * @param {import('./Observations.mjs').Observations} observationContext.observations The observations of the window the query is evaluated in.
     * @param {() => void} observationContext.onChange Called, synchronously, when something the result depends on may have changed.
     * @param {boolean} [observationContext.holdsAllObservations] Whether every dependency's observation is held, as a watch holds them, rather than those a pending evaluation waits on.
     * @param {QueryEvaluation[] | null} [observationContext.replaces] The evaluations this one replaces, the latest last, as a watch's next evaluation replaces its last: it carries on the sessions the latest hands on, which hold every one the watch's evaluations kept, and takes a shared one wherever its call observes the same again, and a later evaluation may take its own. Null where none is replaced.
     * @param {object | null} [observationContext.consumer] Whose evaluations these are, a watch's or a wait's, so an observation of a type that is not shared is reached again by its later evaluations.
     * @param {boolean} [observationContext.recordsDependencies] Whether the evaluation answers a record of each call it depended on, which nothing it holds needs, since its sessions keep what it depends on observed; without one, its dependencies are null.
     */
    evaluate({ observations, onChange, holdsAllObservations = false, replaces = null, consumer = null, recordsDependencies = false }) {
        return this.#evaluateWithObservations({ observations, onChange, holdsAllObservations, replaces, consumer, recordsDependencies, waits: true }, () => this.#evaluateQuery());
    }

    /**
     * Resolves the event source the subscription ends in into what starts it: the source's name, the function that carries it out, the receiver and arguments it is called with and the environment, how each event it delivers is captured, and where it stands, for a failure to name.
     * The receiver and arguments are evaluated once, now; where one of them is null there is nothing to listen to, and the answer is null.
     * `capture` answers an event as the fields its type declares, read as it is called: a field the event does not carry as a value its type admits is null where the type is nullable, and fails the capture where it is not; an event of a type with no fields is taken whole, where it is of its type.
     * @returns {{ name: string, start: Function, capture: (event: unknown) => unknown, receiver: unknown, args: Record<string, unknown>, environment: Environment, location: object } | null}
     */
    resolveSource() {
        const call = this.#resolveCall('subscription', 'subscribed to');

        return call.args === null ? null : { name: call.name, start: call.implementation, capture: event => this.#captureEvent(event, call.node), receiver: call.receiver, args: call.args, environment: call.environment, location: call.location };
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
        const { node, pointer } = this.#findTerminalMember();
        const { declaration, type } = this.#resolvedDefinition.resolutionOf(node);

        if (wasExecuted && !this.#conforms(result, type)) {
            this.#fail(`The action '${declaration.name}' answered ${QueryEvaluator.#describe(result)}, and it declares ${type}`, pointer);
        }

        const copyStructures = QueryEvaluator.#compileStructureCopy(type, this.#moduleRegistry);

        this.#projectionContext = { node, value: copyStructures === null ? result : copyStructures(result) };

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

        const { node, pointer } = this.#findTerminalMember();
        const resolution = this.#resolvedDefinition.resolutionOf(node);
        const { declaration } = resolution;
        const receiver = this.#evaluateNode(node.target, null);

        if (declaration === null) {
            return { declaration, name: node.name, implementation: null, receiver, args: null, environment: this.#environment, location: this.#locate(pointer), node };
        }

        const args = receiver === null ? null : this.#evaluateArguments(resolution, null);

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
     * @param {object} observationContext Where the dependencies are observed.
     * @param {import('./Observations.mjs').Observations} observationContext.observations The observations of the window the subscription listens in.
     * @param {object | null} [observationContext.consumer] The event listener the projections serve, so an observation of a type that is not shared is reached again by its later projections.
     */
    project(event, { observations, consumer = null }) {
        return this.#evaluateWithObservations({ observations, onChange: () => {}, holdsAllObservations: false, replaces: null, consumer, recordsDependencies: false, waits: false }, () => {
            const { node } = this.#findTerminalMember();

            this.#projectionContext = { node, value: event };

            try {
                return this.#evaluateResult();
            } finally {
                this.#projectionContext = null;
            }
        });
    }

    /** Runs an evaluation that records what it depends on, answering the evaluation; one that waits holds what a pending result waits on, and lets a failure seen through a pending member pass. */
    #evaluateWithObservations({ observations, onChange, holdsAllObservations, replaces, consumer, recordsDependencies, waits }, produce) {
        // A watch's sessions are carried from each evaluation to the next, so one it keeps needing is taken where it is rather than moved.
        const sessionCache = replaces?.at(-1)?.handOverSessionCache() ?? new SessionCache();

        sessionCache.beginEvaluation();

        const owner = {};
        const observationContext = { observations, onChange, holdsAllObservations, replaces, dependencies: recordsDependencies ? [] : null, sessions: [], owner, consumer, sessionCache, deferredRequests: [], rootOf: new WeakMap(), rootsOf: new WeakMap(), followedRoots: new WeakSet(), followedAttachments: new WeakSet(), isPending: false };
        let value;
        let identities = null;
        let error = null;

        this.#observationContext = observationContext;

        try {
            ({ value, identities } = produce());
        } catch (failure) {
            // An evaluation that fails having read a maintained member still pending reports nothing and waits for its sample, since the failure may come from the null the member answered, and nothing tells which failures do; one that fails before it reads a pending member reports its failure.
            error = waits && observationContext.isPending ? null : failure;
        } finally {
            this.#observationContext = null;
        }

        if (waits && observationContext.isPending) {
            try {
                // The pending result waits on whatever changes the evaluation depended on, so it holds them now.
                for (const request of observationContext.deferredRequests) {
                    observationContext.sessions.push({ request, session: observations.acquire(request, onChange, consumer), values: null, owner });
                }
            } catch (failure) {
                error = failure;
            }
        }

        return new QueryEvaluation({ value, identities, isPending: observationContext.isPending, dependencies: observationContext.dependencies, sessions: observationContext.sessions, owner, sessionCache: replaces === null ? null : sessionCache, error });
    }

    /** The detached result, and the identities of the elements its lists were projected from, which the result itself never holds. */
    #evaluateQuery() {
        if (this.#resolvedDefinition.kind !== 'query') {
            this.#fail(`A ${this.#resolvedDefinition.kind} request is not evaluated`, '/query');
        }

        return this.#evaluateResult();
    }

    #evaluateNode(node, currentValue) {
        return this.#getCompiledFunction(node)(this, currentValue);
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
                return (evaluator, currentValue) => currentValue;
            case 'local':
                return evaluator => evaluator.#evaluateLocal(node);
            case 'member':
            case 'call':
            case 'infixCall':
                return this.#compileMember(node);
            case 'equality': {
                const left = this.#getCompiledFunction(node.left);
                const right = this.#getCompiledFunction(node.right);

                return (evaluator, currentValue) => {
                    const value = left(evaluator, currentValue);

                    return value === right(evaluator, currentValue);
                };
            }
            case 'conditional': {
                const condition = this.#getCompiledFunction(node.condition);
                const consequent = this.#getCompiledFunction(node.consequent);
                const alternative = this.#getCompiledFunction(node.alternative);

                // The branch the condition selects is recorded for the value's place in the result.
                return (evaluator, currentValue) => {
                    const isTrue = condition(evaluator, currentValue) === true;

                    (evaluator.#selections ??= new Map()).set(node, isTrue ? node.consequent : node.alternative);

                    return (isTrue ? consequent : alternative)(evaluator, currentValue);
                };
            }
            case 'optionalChain':
                // An access that meets null answers null, and so does everything after it in its chain, which is evaluated no further.
                return this.#getCompiledFunction(node.target);
            case 'coalescing': {
                const value = this.#getCompiledFunction(node.value);
                const fallback = this.#getCompiledFunction(node.fallback);

                return (evaluator, currentValue) => {
                    const answer = value(evaluator, currentValue);

                    (evaluator.#selections ??= new Map()).set(node, answer === null ? node.fallback : node.value);

                    return answer === null ? fallback(evaluator, currentValue) : answer;
                };
            }
            case 'and': {
                const operands = node.operands.map(operand => this.#getCompiledFunction(operand));

                return (evaluator, currentValue) => {
                    for (const operand of operands) {
                        if (operand(evaluator, currentValue) !== true) {
                            return false;
                        }
                    }

                    return true;
                };
            }
            case 'or': {
                const operands = node.operands.map(operand => this.#getCompiledFunction(operand));

                return (evaluator, currentValue) => {
                    for (const operand of operands) {
                        if (operand(evaluator, currentValue) === true) {
                            return true;
                        }
                    }

                    return false;
                };
            }
            case 'not': {
                const operand = this.#getCompiledFunction(node.operand);

                return (evaluator, currentValue) => operand(evaluator, currentValue) !== true;
            }
            case 'cast': {
                const target = this.#getCompiledFunction(node.target);
                const { type } = node;

                // A cast answers its target where it is of the type, and null where it is of another or is null.
                return (evaluator, currentValue) => {
                    const value = target(evaluator, currentValue);

                    return value !== null && evaluator.#conformsNamed(value, type) ? value : null;
                };
            }
            case 'conversion':
                return this.#compileConversion(node);
            case 'object':
                return this.#compileObject(node);
            default:
                this.#fail(`A '${node.kind}' node has no evaluation`, this.#pointerOf(node));
        }
    }

    /**
     * A conversion, with its target evaluated once. Null converts to null, and a value already of the type to itself, without a conversion; a conversion that rejects its value fails the evaluation.
     */
    #compileConversion(node) {
        const target = this.#getCompiledFunction(node.target);
        const { declaration, type } = this.#resolvedDefinition.resolutionOf(node);

        if (declaration === null) {
            return target;
        }

        const name = DomqlModule.conversionNameOf(declaration);
        const attempt = QueryEvaluator.#compileConversionAttempt(declaration, type, this.#moduleRegistry);

        return (evaluator, currentValue) => {
            const value = target(evaluator, currentValue);

            if (value === null) {
                return null;
            }

            const outcome = attempt(evaluator, value, node);

            if (!outcome.isAccepted) {
                evaluator.#fail(`The conversion from ${name} rejected its value: ${outcome.reason}`, evaluator.#pointerOf(node));
            }

            return outcome.value;
        };
    }

    /**
     * The conversion of a value that is not null: its converted value where it accepts the value, or the reason it rejected it with.
     * A rejection is the signal `reject` throws for this attempt alone; any other exception, a reason that is no string, a rejection the conversion caught and answered past, and a value not of the type are faults, which fail the evaluation.
     */
    static #compileConversionAttempt(declaration, type, moduleRegistry) {
        const name = DomqlModule.conversionNameOf(declaration);
        const convert = moduleRegistry.getFunction(declaration);
        const conforms = QueryEvaluator.#compileTypeCheck(type, moduleRegistry);
        const copyStructure = QueryEvaluator.#compileStructureCopy(type, moduleRegistry);

        return (evaluator, value, node) => {
            if (convert === undefined) {
                evaluator.#fail(`The module '${moduleRegistry.getOwner(declaration)}' supplies no function for the conversion from ${name}`, evaluator.#pointerOf(node));
            }

            const rejection = { isRejected: false, reason: null };
            const reject = reason => {
                rejection.isRejected = true;
                rejection.reason = reason;

                throw rejection;
            };
            let converted;

            try {
                converted = convert(value, { reject });
            } catch (error) {
                if (error !== rejection) {
                    throw DomqlError.evaluation(`The conversion from ${name} failed: ${error?.message ?? String(error)}`, evaluator.#locate(evaluator.#pointerOf(node)), { cause: error });
                }

                if (typeof rejection.reason !== 'string') {
                    evaluator.#fail(`The conversion from ${name} rejected its value with a reason that is no string`, evaluator.#pointerOf(node));
                }

                return { isAccepted: false, reason: rejection.reason };
            }

            if (rejection.isRejected) {
                evaluator.#fail(`The conversion from ${name} rejected its value and then answered one`, evaluator.#pointerOf(node));
            }

            if (!conforms(converted)) {
                evaluator.#fail(`The conversion from ${name} answered ${QueryEvaluator.#describe(converted)}, and it converts to ${type}`, evaluator.#pointerOf(node));
            }

            return { isAccepted: true, value: copyStructure === null ? converted : copyStructure(converted) };
        };
    }

    /**
     * A member access, a call or an infix call, with its resolution, its function, its arguments and the check of its result made once.
     * An access by name, and a member of a receiver of unknown type, which answers null without reading anything, are evaluated as the node itself says.
     */
    #compileMember(node) {
        const resolution = this.#resolvedDefinition.resolutionOf(node);

        if (resolution === undefined || resolution.kind === 'byName' || (resolution.kind !== 'field' && resolution.declaration === null)) {
            return (evaluator, currentValue) => evaluator.#evaluateMember(node, currentValue);
        }

        const target = this.#getCompiledFunction(node.target);

        if (resolution.kind === 'field') {
            const { name } = resolution;

            return (evaluator, currentValue) => {
                if (evaluator.#projectionContext !== null && node === evaluator.#projectionContext.node) {
                    return evaluator.#projectionContext.value;
                }

                const receiver = target(evaluator, currentValue);

                return receiver === null ? null : receiver[name] ?? null;
            };
        }

        const { declaration, type } = resolution;
        const implementation = this.#moduleRegistry.getFunction(declaration);
        const conforms = QueryEvaluator.#compileTypeCheck(type, this.#moduleRegistry);
        const copyStructures = QueryEvaluator.#compileStructureCopy(type, this.#moduleRegistry);
        const evaluateArguments = this.#compileArguments(resolution);

        return (evaluator, currentValue) => {
            // A projection stands the event or the result where its member is, so that member is never read again.
            if (evaluator.#projectionContext !== null && node === evaluator.#projectionContext.node) {
                return evaluator.#projectionContext.value;
            }

            const receiver = target(evaluator, currentValue);

            if (receiver === null) {
                return null;
            }

            const args = evaluateArguments(evaluator, currentValue);

            return args === null ? null : evaluator.#invokeImplementation(declaration, implementation, conforms, copyStructures, receiver, args, type, node);
        };
    }

    /** The arguments a call is given, each argument's plan made once: its default or fixed value, an expression evaluated against each item, or a value, null where it makes the call answer null. */
    #compileArguments(resolution) {
        if (resolution.arguments.length === 0) {
            return () => NO_ARGUMENTS;
        }

        const argumentPlans = resolution.arguments.map(argument => {
            const { parameter } = argument;

            if (argument.isDefault || parameter.fixed) {
                return { name: parameter.name, kind: 'constant', value: argument.isDefault ? parameter.default : argument.value };
            }

            return { name: parameter.name, kind: parameter.kind, evaluate: this.#getCompiledFunction(argument.node), propagatesNull: parameter.nulls === 'propagate' };
        });

        return (evaluator, currentValue) => {
            const args = {};

            for (const plan of argumentPlans) {
                if (plan.kind === 'constant') {
                    args[plan.name] = plan.value;
                } else if (plan.kind === 'expression') {
                    const { evaluate } = plan;

                    args[plan.name] = item => evaluate(evaluator, item);
                } else {
                    const value = plan.evaluate(evaluator, currentValue);

                    if (value === null && plan.propagatesNull) {
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

        return (evaluator, currentValue) => {
            const value = hasTarget ? target(evaluator, currentValue) : currentValue;

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
                evaluator.#sourceElementsByList.set(items, [...value]);
            }

            return items;
        };
    }

    /** The object the fields give the item, evaluated against it in order with the expression's locals in scope, with the selections made for each field; a field's name is a name, so it is assigned as it is. */
    #applyFields(node, fields, item) {
        const object = {};
        const enclosingSelections = this.#selections;
        const enclosingLocals = this.#localsFrame;
        let fieldSelections = null;

        if (node.locals !== undefined) {
            this.#localsFrame = { node, item, values: new Map(), enclosing: enclosingLocals };
        }

        try {
            for (const field of fields) {
                this.#selections = null;

                const value = field.evaluate(this, item);

                object[field.name] = value;

                if (this.#selections !== null) {
                    (fieldSelections ??= new Map()).set(field.name, this.#selections);
                }
            }
        } finally {
            this.#selections = enclosingSelections;
            this.#localsFrame = enclosingLocals;
        }

        if (fieldSelections !== null) {
            this.#fieldSelectionsByObject.set(object, fieldSelections);
        }

        return object;
    }

    /**
     * The copy a type makes of a value it admits: a declared structure as its declared fields alone, each read as the value offers it, a getter's included, so its declaration is the shape a result holds,
     * and a list item by item; null for a type that holds no declared structure, whose values stand as they are. A structure's fields are found at its first copy, so a structure that holds itself is copied as deep as its value goes.
     */
    static #compileStructureCopy(type, moduleRegistry) {
        switch (type.kind) {
            case 'list': {
                const copyItem = QueryEvaluator.#compileStructureCopy(type.itemType, moduleRegistry);

                return copyItem === null ? null : value => (value === null ? null : value.map(item => (item === null ? null : copyItem(item))));
            }
            case 'named': {
                const structure = moduleRegistry.getType(type.name);

                if (structure === undefined) {
                    return null;
                }

                // It holds the registry alone, never an evaluator, so it holds nothing an evaluation bound.
                let fields = null;
                let isFlat = false;

                return value => {
                    if (value === null) {
                        return null;
                    }

                    if (fields === null) {
                        fields = QueryEvaluator.#fieldTypesOf(structure).map(([name, fieldType]) => [name, QueryEvaluator.#compileStructureCopy(fieldType, moduleRegistry)]);
                        isFlat = fields.every(([, copyField]) => copyField === null);
                    }

                    // An answer that is a plain object of its declared fields alone, none of them a structure, is its declared shape already, as a built-in member's is.
                    if (isFlat && QueryEvaluator.#holdsExactly(value, structure.fields, fields.length)) {
                        return value;
                    }

                    const copy = {};

                    for (const [name, copyField] of fields) {
                        const field = value[name];

                        // A field's name is a name, so it is assigned as it is.
                        copy[name] = copyField === null || field === null ? field : copyField(field);
                    }

                    return copy;
                };
            }
            default:
                return null;
        }
    }

    /** Whether the value is a plain object whose own keys are the declared fields alone. */
    static #holdsExactly(value, declaredFields, count) {
        if (Object.getPrototypeOf(value) !== Object.prototype) {
            return false;
        }

        let found = 0;

        for (const key in value) {
            if (!Object.hasOwn(declaredFields, key)) {
                return false;
            }

            found++;
        }

        return found === count;
    }

    /** Whether a value is one the type admits, as `#conforms` answers, with the type's structure found once and each declared structure's fields at its first check. */
    static #compileTypeCheck(type, moduleRegistry) {
        const admits = QueryEvaluator.#compileNonNullTypeCheck(type, moduleRegistry);

        return value => (value === undefined ? false : value === null ? type.isNullable : admits(value));
    }

    /** A compiled function holds the registry alone, never an evaluator, so it holds nothing an evaluation bound; a structure that holds itself is checked as deep as its value goes. */
    static #compileNonNullTypeCheck(type, moduleRegistry) {
        switch (type.kind) {
            case 'typeParameter':
                return () => true;
            case 'list': {
                const checkItem = QueryEvaluator.#compileTypeCheck(type.itemType, moduleRegistry);

                return value => Array.isArray(value) && ArrayUtils.findMissingIndex(value) === -1 && value.every(checkItem);
            }
            case 'object': {
                const fields = [...type.fieldTypes].map(([name, fieldType]) => [name, QueryEvaluator.#compileTypeCheck(fieldType, moduleRegistry)]);

                return value => ObjectUtils.isNonArrayObject(value) && fields.every(([name, conforms]) => conforms(value[name]));
            }
            default: {
                const { name } = type;
                const structure = moduleRegistry.getType(name);

                if (structure === undefined) {
                    return value => QueryEvaluator.#isOfBuiltIn(value, name) ?? false;
                }

                let fields = null;

                return value => {
                    if (!ObjectUtils.isNonArrayObject(value)) {
                        return false;
                    }

                    fields ??= QueryEvaluator.#fieldTypesOf(structure).map(([field, fieldType]) => [field, QueryEvaluator.#compileTypeCheck(fieldType, moduleRegistry)]);

                    return fields.every(([field, conforms]) => conforms(value[field]));
                };
            }
        }
    }

    /**
     * The value of the local the node names: evaluated at its first use in the application of the object expression that holds it, against that application's current value and the locals in scope where it is written, and the same value at every later use there.
     * The selections its evaluation made are recorded at every place in the result it is used.
     */
    #evaluateLocal(node) {
        let frame = this.#localsFrame;

        while (!frame.node.locals.some(local => local.name === node.name)) {
            frame = frame.enclosing;
        }

        let cachedLocal = frame.values.get(node.name);

        if (cachedLocal === undefined) {
            const enclosingLocals = this.#localsFrame;
            const enclosingSelections = this.#selections;

            this.#localsFrame = frame;
            this.#selections = null;

            try {
                cachedLocal = { value: this.#evaluateNode(frame.node.locals.find(local => local.name === node.name).value, frame.item), selections: this.#selections };
            } finally {
                this.#localsFrame = enclosingLocals;
                this.#selections = enclosingSelections;
            }

            frame.values.set(node.name, cachedLocal);
        }

        if (cachedLocal.selections !== null) {
            const selections = (this.#selections ??= new Map());

            cachedLocal.selections.forEach((selection, node) => selections.set(node, selection));
        }

        return cachedLocal.value;
    }

    #evaluateMember(node, currentValue) {
        // A projection stands the event or the result where its member is, so that member is never read again.
        if (node === this.#projectionContext?.node) {
            return this.#projectionContext.value;
        }

        const receiver = this.#evaluateNode(node.target, currentValue);

        if (receiver === null) {
            return null;
        }

        const resolution = this.#resolvedDefinition.resolutionOf(node);

        if (resolution.kind !== 'byName') {
            return this.#readResolvedMember(resolution, receiver, node, currentValue);
        }

        // An access by name computes its name once and reads the property it selects, which is recorded for the value's place in the result.
        const name = this.#evaluateNode(node.name, currentValue);

        (this.#selections ??= new Map()).set(node, name);

        return this.#readResolvedMember(resolution.candidates.get(name), receiver, node, currentValue);
    }

    /** Reads the member the resolution names of the receiver: a field of its data, or the declaration's function with the arguments it is given. */
    #readResolvedMember(resolution, receiver, node, currentValue) {
        if (resolution.kind === 'field') {
            return receiver[resolution.name] ?? null;
        }

        const args = this.#evaluateArguments(resolution, currentValue);

        return args === null ? null : this.#invokeMember(resolution.declaration, receiver, args, resolution.type, node);
    }

    /** The arguments by parameter name, or null where a null argument makes the call answer null. */
    #evaluateArguments(resolution, currentValue) {
        const args = {};

        for (const argument of resolution.arguments) {
            const { parameter } = argument;

            if (argument.isDefault || parameter.fixed) {
                args[parameter.name] = argument.isDefault ? parameter.default : argument.value;
            } else if (parameter.kind === 'expression') {
                args[parameter.name] = item => this.#evaluateNode(argument.node, item);
            } else {
                const value = this.#evaluateNode(argument.node, currentValue);

                if (value === null && parameter.nulls === 'propagate') {
                    return null;
                }

                args[parameter.name] = value;
            }
        }

        return args;
    }

    /** Carries out a declaration's function, checking that its result is of the declared type. */
    #invokeMember(declaration, receiver, args, type, node) {
        return this.#invokeImplementation(declaration, this.#moduleRegistry.getFunction(declaration), value => this.#conforms(value, type), QueryEvaluator.#compileStructureCopy(type, this.#moduleRegistry), receiver, args, type, node);
    }

    /** Carries out the function of a declaration whose function, check of its result and copy of the structures it holds are found already. */
    #invokeImplementation(declaration, implementation, conforms, copyStructures, receiver, args, type, node) {
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

        return copyStructures === null ? value : copyStructures(value);
    }

    /**
     * Records what the call depends on and holds its observations, answering the samples of its maintained observations, in the order the declaration names them.
     * Answers null where a sample is still pending, which makes the member answer null and the evaluation pending.
     */
    #observe(declaration, receiver, args, node) {
        if (this.#observationContext === null) {
            if (declaration.reads === 'maintained') {
                this.#fail(`The member '${declaration.name}' is maintained by an observation, and reading it waits for the first sample, which a synchronous evaluation cannot`, this.#pointerOf(node));
            }

            return NO_SAMPLES;
        }

        const { observations, dependencies } = this.#observationContext;
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
                    const cachedSession = this.#holdAt(observationDeclaration, args, roots[index]);

                    if (cachedSession !== null) {
                        requests?.push(cachedSession.request);

                        if (cachedSession.session?.contract === 'maintained') {
                            const sample = cachedSession.session.sample();

                            isPending ||= sample.pending;
                            (samples === NO_SAMPLES ? (samples = []) : samples).push(sample.value);
                        }
                    }
                }

                continue;
            }

            const isOfRoot = observationDeclaration.of === 'root';
            const target = isOfRoot ? Observations.rootOf(receiver, this.#observationContext.rootOf) : observations.targetOf(observationDeclaration, receiver, args);
            const cachedSession = this.#holdAt(observationDeclaration, args, target);

            if (cachedSession !== null) {
                requests?.push(cachedSession.request);

                if (cachedSession.session?.contract === 'maintained') {
                    const sample = cachedSession.session.sample();

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
            this.#observationContext.isPending = true;

            return null;
        }

        return samples;
    }

    /** A member that answered null for an element that is detached depends on whether the element is attached, so it is read again when the element returns. */
    #followDetachedReceiver(declaration, receiver, value, node) {
        if (this.#observationContext === null || value !== null || receiver?.nodeType !== 1 || receiver.isConnected || this.#moduleRegistry.getObservationType('attachment') === undefined || this.#observationContext.followedAttachments.has(receiver)) {
            return;
        }

        this.#observationContext.followedAttachments.add(receiver);

        const cachedSession = this.#holdAt(ATTACHMENT_OBSERVATION, NO_ARGUMENTS, receiver);

        this.#observationContext.dependencies?.push({ member: declaration.name, pointer: this.#pointerOf(node), observations: [cachedSession.request] });
    }

    /**
     * Follows the flat-tree ancestry of a receiver whose roots a call observes, once an evaluation: the structure of each root and the slots assigned in it, so moving the receiver or an ancestor to another tree or slot evaluates again and rebinds what observes its roots; and, for a receiver in a detached tree, whether it is attached, since moving a detached tree changes nothing inside it.
     * @param {unknown} receiver The call's receiver.
     * @param {object[]} roots The roots of the receiver's ancestry.
     * @param {object[] | null} requests The requests the call records, which these join, or null where the evaluation records none.
     */
    #followAncestry(receiver, roots, requests) {
        const { followedRoots } = this.#observationContext;

        // Every receiver leaving a root changes the root's own structure, so each root is followed once an evaluation, whichever receiver is in it.
        roots.forEach(root => {
            if (followedRoots.has(root)) {
                return;
            }

            followedRoots.add(root);
            ANCESTRY_OBSERVATIONS.forEach(observationDeclaration => {
                if (this.#moduleRegistry.getObservationType(observationDeclaration.type) !== undefined) {
                    const cachedSession = this.#holdAt(observationDeclaration, NO_ARGUMENTS, root);

                    requests?.push(cachedSession.request);
                }
            });
        });

        this.#followAttachment(receiver, roots.at(-1) ?? null, requests);
    }

    /** Follows whether the receiver is attached, once an evaluation, where the outermost root of its ancestry is the top of a detached tree, which moves without a change inside any root. */
    #followAttachment(receiver, outermostRoot, requests) {
        const { followedAttachments } = this.#observationContext;

        if (outermostRoot === null || outermostRoot.nodeType === 9 || (outermostRoot.nodeType === 11 && outermostRoot.host !== undefined) || followedAttachments.has(receiver) || this.#moduleRegistry.getObservationType(ATTACHMENT_OBSERVATION.type) === undefined) {
            return;
        }

        followedAttachments.add(receiver);
        const cachedSession = this.#holdAt(ATTACHMENT_OBSERVATION, NO_ARGUMENTS, receiver);

        requests?.push(cachedSession.request);
    }

    /** Whether the observation of a receiver's root sees the receiver leave it: a mutation of the root's children through its subtree. */
    static #followsItsRoot(observationDeclaration) {
        return observationDeclaration.type === 'mutation' && observationDeclaration.childList === true && observationDeclaration.subtree === true;
    }

    /** The roots of the receiver's flat-tree ancestry, each node's found once an evaluation, so receivers that share an ancestry walk it once. */
    #rootsOf(receiver) {
        return Observations.rootsOf(receiver, this.#observationContext.rootsOf);
    }

    /**
     * The request the observation resolves to at the target, and its session: the one this evaluation already holds for it, the one an evaluation this one replaces holds, which becomes this one's own, or a new one; null where the target is null.
     * The session is null where the evaluation leaves the request unheld, acquiring it only where the evaluation turns out pending, and one this evaluation already holds may be such an entry, its acquisition deferred.
     * @returns {import('./SessionCache.mjs').CachedSession | null}
     */
    #holdAt(observationDeclaration, args, target) {
        if (target === null || target === undefined) {
            return null;
        }

        const { sessionCache, owner, sessions } = this.#observationContext;
        const cachedSession = sessionCache.find(observationDeclaration, args, target, owner);

        if (cachedSession === null) {
            return this.#hold(this.#observationContext.observations.resolveAt(observationDeclaration, { args }, target), observationDeclaration);
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
        const { observations, onChange, holdsAllObservations, sessions, sessionCache, deferredRequests, owner, consumer } = this.#observationContext;
        const observationType = this.#moduleRegistry.getObservationType(request.type);
        const cachedSession = { request, session: null, values: null, owner };

        if (observationType !== undefined && observationType.contract === 'invalidation' && !holdsAllObservations) {
            deferredRequests.push(request);
        } else {
            cachedSession.session = observations.acquire(request, onChange, consumer);
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
    #findTerminalMember() {
        let node = this.#resolvedDefinition.definition.query;
        let pointer = '/query';

        while (node.kind === 'object' || node.kind === 'optionalChain') {
            node = node.target;
            pointer = `${pointer}/target`;
        }

        return { node, pointer };
    }

    /** The event as the fields its type declares, each read and checked now as the event gives it, or the event itself where its type declares no structure; copying the projection's result is what isolates the data it answers. */
    #captureEvent(event, node) {
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
                const copyStructures = QueryEvaluator.#compileStructureCopy(fieldType, this.#moduleRegistry);

                captured[name] = copyStructures === null ? value : copyStructures(value);
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
                return Array.isArray(value) && ArrayUtils.findMissingIndex(value) === -1 && value.every(item => this.#conforms(item, type.itemType));
            case 'object':
                return ObjectUtils.isNonArrayObject(value) && [...type.fieldTypes].every(([name, fieldType]) => this.#conforms(value[name], fieldType));
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

        return structure !== undefined && ObjectUtils.isNonArrayObject(value) && QueryEvaluator.#fieldTypesOf(structure).every(([field, type]) => this.#conforms(value[field], type));
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
        let fields = QueryEvaluator.#fieldTypesByStructure.get(structure);

        if (fields === undefined) {
            fields = Object.entries(structure.fields).map(([name, text]) => [name, Type.parse(text)]);
            QueryEvaluator.#fieldTypesByStructure.set(structure, fields);
        }

        return fields;
    }

    /** What the value is, for a message: nothing, a node, or its data where it has any. */
    static #describe(value) {
        if (value === undefined) {
            return 'nothing';
        }

        if (typeof value?.nodeType === 'number') {
            return value.nodeType === 1 ? 'an element' : 'a node';
        }

        const hole = Array.isArray(value) ? ArrayUtils.findMissingIndex(value) : -1;

        if (hole !== -1) {
            return `a list with a hole at index ${hole}`;
        }

        // A promise and an instance of a class are named as they are, since what they would be written as says nothing of them.
        if (typeof value?.then === 'function') {
            return 'a promise';
        }

        if (value !== null && typeof value === 'object' && !Array.isArray(value) && !ObjectUtils.isPlainObject(value)) {
            return `an instance of ${value.constructor?.name || 'a class'}`;
        }

        try {
            return JSON.stringify(value) ?? String(value);
        } catch {
            return Object.prototype.toString.call(value);
        }
    }

    /** The query evaluated and detached, with its identities, which the evaluator lets go of once it hands them over, so it holds no element between evaluations. */
    #evaluateResult() {
        this.#sourceElementsByList = new WeakMap();
        this.#fieldSelectionsByObject = new WeakMap();
        this.#selections = null;

        try {
            const value = this.#copyResult(this.#evaluateNode(this.#resolvedDefinition.definition.query, null));

            return { value, identities: QueryEvaluator.#withSelections(this.#copiedIdentities, this.#selections) };
        } finally {
            this.#copiedIdentities = null;
            this.#selections = null;
        }
    }

    /**
     * A frozen copy of the data sharing no structure with the original; the identities that follow its structure are left in `#copiedIdentities`: for a list projected from elements, the element each item came from, for a field, the selections made for its value, as `branches`, and null where nothing beneath holds either.
     */
    #copyResult(value) {
        if (Array.isArray(value)) {
            const copy = [];
            const itemIdentities = [];
            let hasIdentities = false;

            for (const item of value) {
                copy.push(this.#copyResult(item));
                itemIdentities.push(this.#copiedIdentities);
                hasIdentities ||= this.#copiedIdentities !== null;
            }

            const elements = this.#sourceElementsByList.get(value) ?? null;

            this.#copiedIdentities = elements === null && !hasIdentities ? null : { elements, items: itemIdentities };

            return Object.freeze(copy);
        }

        if (ObjectUtils.isNonArrayObject(value)) {
            const copy = {};
            const fieldSelections = this.#fieldSelectionsByObject.get(value);
            let fieldIdentities = null;

            for (const name of Object.keys(value)) {
                const field = this.#copyResult(value[name]);

                // A read copies every field of every row, so an ordinary field is assigned here, where the assignment sees only the copies' shapes; sharing the one in `defineDataProperty` with live state's writes made reads measurably slower.
                if (name === '__proto__') {
                    ObjectUtils.defineDataProperty(copy, name, field);
                } else {
                    copy[name] = field;
                }

                const identities = QueryEvaluator.#withSelections(this.#copiedIdentities, fieldSelections?.get(name) ?? null);

                if (identities !== null) {
                    fieldIdentities ??= {};
                    ObjectUtils.defineDataProperty(fieldIdentities, name, identities);
                }
            }

            this.#copiedIdentities = fieldIdentities === null ? null : { fields: fieldIdentities };

            return Object.freeze(copy);
        }

        this.#copiedIdentities = null;

        return value;
    }

    /** The identities of a value with the selections made for it beside them, as their `branches`, or the identities alone where none were made. */
    static #withSelections(identities, selections) {
        return selections === null ? identities : { ...identities, branches: selections };
    }
}
