/**
 * QueryEvaluator — evaluates a resolved request, answering detached data: a query as it reads now, and a subscription's projection of each event its source delivers
 */

import { DomqlError } from '../language/DomqlError.mjs';
import { Type } from '../language/Type.mjs';
import { Observations } from './Observations.mjs';
import { QueryEvaluation } from './QueryEvaluation.mjs';

/** @typedef {{ window: Window, document: Document }} Environment */

/** What a predicate answers. */
const BOOLEAN = Type.createNamedType('boolean');

/** The observation of whether an element is attached, which a member that answered null for a detached element depends on. */
const ATTACHMENT_OBSERVATION = Object.freeze({ type: 'attachment', of: 'receiver' });

/** What follows a receiver's flat-tree ancestry at each of its roots: the structure of the root's tree, and the slots its elements are assigned to. */
const ANCESTRY_OBSERVATIONS = Object.freeze([
    Object.freeze({ type: 'mutation', of: 'roots', childList: true, subtree: true }),
    Object.freeze({ type: 'event', of: 'roots', types: Object.freeze(['slotchange']) }),
]);

/** The arguments of a call that takes none. */
const NO_ARGUMENTS = Object.freeze({});

export class QueryEvaluator {
    /** The fields of each declared structure, each with its type parsed, by the structure: valid for as long as the structure, which is frozen, and released with it. @type {WeakMap<object, [string, Type][]>} */
    static #fieldTypes = new WeakMap();

    #moduleRegistry;
    #resolvedDefinition;
    #parameterBindings;
    #environment;
    #locations;

    /** The element each item of a list an object expression projected came from, by the list it produced, for the evaluation in progress. @type {WeakMap<unknown[], (Element | null)[]>} */
    #elementsOf = new WeakMap();

    /** The branch each conditional selected for each field of an object an object expression gave, by the object, for the evaluation in progress. @type {WeakMap<object, Map<string, Map<object, object>>>} */
    #branchesOf = new WeakMap();

    /** The branch each conditional selected for the value being evaluated at its place in the result, by the conditional, or null where none has. @type {Map<object, object> | null} */
    #branches = null;

    /** The frame of locals of the innermost application of an object expression that has any, with the value of each evaluated so far, inside those of the applications enclosing it; null outside every one. @type {{ node: object, item: unknown, values: Map<string, { value: unknown, branches: Map<object, object> | null }>, enclosing: object | null } | null} */
    #localsFrame = null;

    /** What the evaluation in progress records, or null where none does. @type {{ observations: import('./Observations.mjs').Observations, onChange: () => void, holdsAll: boolean, replaces: QueryEvaluation[] | null, dependencies: object[], sessions: object[], heldSessions: Map<object, Map<unknown, object[]>> | null, unheld: object[], rootOf: WeakMap<object, object>, rootsOf: WeakMap<object, object[]>, followedRoots: WeakSet<object>, followedAttachments: WeakSet<object>, isPending: boolean } | null} */
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
     * @param {QueryEvaluation[] | null} [recording.replaces] The evaluations this one replaces, as a watch's next evaluation replaces its last: it takes over a session of theirs wherever its call would acquire that same observation again, a shared one, and a later evaluation may take over its own. Null where none is replaced.
     */
    evaluate({ observations, onChange, holdsAll = false, replaces = null }) {
        return this.#record({ observations, onChange, holdsAll, replaces, waits: true }, () => this.#queryResult());
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
        return this.#record({ observations, onChange: () => {}, holdsAll: false, replaces: null, waits: false }, () => {
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
    #record({ observations, onChange, holdsAll, replaces, waits }, produce) {
        const recording = { observations, onChange, holdsAll, replaces, dependencies: [], sessions: [], heldSessions: replaces === null ? null : new Map(), unheld: [], rootOf: new WeakMap(), rootsOf: new WeakMap(), followedRoots: new WeakSet(), followedAttachments: new WeakSet(), isPending: false };
        let value;
        let identities = null;
        let error = null;

        this.#recording = recording;

        try {
            ({ value, identities } = produce());
        } catch (failure) {
            // A member read through a pending one saw null where a sample will be, so its failure says nothing until the sample arrives.
            error = waits && recording.isPending ? null : failure;
        } finally {
            this.#recording = null;
        }

        if (waits && recording.isPending) {
            try {
                // The pending result waits on whatever changes the evaluation depended on, so it holds them now.
                for (const request of recording.unheld) {
                    recording.sessions.push(observations.acquire(request, onChange));
                }
            } catch (failure) {
                error = failure;
            }
        }

        return new QueryEvaluation({ value, identities, isPending: recording.isPending, dependencies: recording.dependencies, sessions: recording.sessions, heldSessions: recording.heldSessions, error });
    }

    /** The detached result, and the identities of the elements its lists were projected from, which the result itself never holds. */
    #queryResult() {
        if (this.#resolvedDefinition.kind !== 'query') {
            this.#fail(`A ${this.#resolvedDefinition.kind} request is not evaluated`, '/query');
        }

        return this.#evaluateResult();
    }

    #evaluate(node, current) {
        switch (node.kind) {
            case 'literal':
                return node.value;
            case 'parameter':
                return this.#parameter(node);
            case 'self':
                return current;
            case 'local':
                return this.#local(node);
            case 'member':
            case 'call':
            case 'infixCall':
                return this.#member(node, current);
            case 'predicate':
                return this.#predicate(node, current);
            case 'conditional':
                return this.#conditional(node, current);
            case 'optionalChain':
                // An access that meets null answers null, and so does everything after it in its chain, which is evaluated no further.
                return this.#evaluate(node.target, current);
            case 'coalescing':
                return this.#coalescing(node, current);
            case 'and':
                return this.#and(node, current);
            case 'or':
                return this.#or(node, current);
            case 'not':
                return this.#evaluate(node.operand, current) !== true;
            case 'cast': {
                // A cast answers its target where it is of the type, and null where it is of another or is null.
                const value = this.#evaluate(node.target, current);

                return value !== null && this.#conformsNamed(value, node.type) ? value : null;
            }
            default:
                return this.#object(node, current);
        }
    }

    /** The value of the branch the condition selects, true selecting the consequent and false or null the alternative; the other branch is never evaluated, and the one selected is recorded for the value's place in the result. */
    #conditional(node, current) {
        const branch = this.#evaluate(node.condition, current) === true ? node.consequent : node.alternative;

        (this.#branches ??= new Map()).set(node, branch);

        return this.#evaluate(branch, current);
    }

    /** The value, evaluated once, where it is not null, and otherwise the fallback, evaluated only then; the side it answers is recorded for the value's place in the result, as a conditional's branch is. */
    #coalescing(node, current) {
        const value = this.#evaluate(node.value, current);
        const side = value === null ? node.fallback : node.value;

        (this.#branches ??= new Map()).set(node, side);

        return value === null ? this.#evaluate(node.fallback, current) : value;
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

    /** Tests the subject, evaluated once, against the predicate the predicate expression names; a predicate expression of null is null. */
    #predicate(node, current) {
        const subject = this.#evaluate(node.target, current);

        if (node.name.kind === 'literal' && node.name.value === null) {
            return subject === null;
        }

        return subject === null ? null : this.#invoke(this.#resolvedDefinition.resolutionOf(node.name).predicate, subject, {}, BOOLEAN, node.name);
    }

    /** The operands combined by and, left to right: false as soon as one is false, so no operand after it is evaluated, and true where none is. */
    #and(node, current) {
        return node.operands.every(operand => this.#evaluate(operand, current) === true);
    }

    /** The operands combined by or, left to right: true as soon as one is true, so no operand after it is evaluated, and false where none is. */
    #or(node, current) {
        return node.operands.some(operand => this.#evaluate(operand, current) === true);
    }

    #parameter(node) {
        switch (node.name) {
            case 'window':
                return this.#environment.window;
            case 'document':
                return this.#environment.document;
            default:
                return this.#parameterBindings.get(node.name);
        }
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

    /** Carries out a declaration's function, or a predicate's, checking that its result is of the declared type. */
    #invoke(declaration, receiver, args, type, node) {
        const implementation = this.#moduleRegistry.getFunction(declaration);

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

        if (!this.#conforms(value, type)) {
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

            return [];
        }

        const { observations, dependencies } = this.#recording;
        const requests = [];
        const samples = [];
        let isPending = false;
        let roots = null;
        const collectObservation = (request, session) => {
            requests.push(request);

            if (session?.contract === 'maintained') {
                const sample = session.sample();

                isPending ||= sample.pending;
                samples.push(sample.value);
            }
        };

        (declaration.observations ?? []).forEach((observation, place) => {
            // An observation of the receiver's roots is one request at each of them.
            if (observation.of === 'roots') {
                roots ??= this.#rootsOf(receiver);
                roots.forEach((root, index) => {
                    const held = this.#holdAt(node, index === 0 ? place : `${place}:${index}`, receiver, observation, args, root);

                    if (held !== null) {
                        collectObservation(held.request, held.session);
                    }
                });

                return;
            }

            if (observation.of === 'root') {
                const root = Observations.rootOf(receiver, this.#recording.rootOf);
                const held = this.#holdAt(node, place, receiver, observation, args, root);

                if (held !== null) {
                    collectObservation(held.request, held.session);
                }

                // An observation of its root's structure sees the receiver leave it, so only a detached tree, which moves without a change inside it, needs more.
                if (QueryEvaluator.#followsItsRoot(observation)) {
                    this.#followAttachment(receiver, node, root, requests);
                } else {
                    roots ??= this.#rootsOf(receiver);
                }

                return;
            }

            const takenOver = this.#takeOver(node, place, receiver, values => observations.resolvesTo(observation, { receiver, args }, values));
            const request = takenOver?.request ?? observations.resolve(observation, { receiver, args });

            if (request !== null) {
                collectObservation(request, takenOver?.session ?? this.#hold(request, node, place, receiver));
            }
        });

        if (roots !== null) {
            this.#followAncestry(receiver, node, roots, requests);
        }

        dependencies.push({ member: declaration.name, pointer: this.#pointerOf(node), observations: requests });

        if (isPending) {
            this.#recording.isPending = true;

            return null;
        }

        return samples;
    }

    /** A member that answered null because its element is detached depends on whether the element is attached, so it is read again when the element returns. */
    #followDetachedReceiver(declaration, receiver, value, node) {
        if (this.#recording === null || value !== null || receiver?.nodeType !== 1 || receiver.isConnected || this.#moduleRegistry.getObservationType('attachment') === undefined || this.#recording.followedAttachments.has(receiver)) {
            return;
        }

        this.#recording.followedAttachments.add(receiver);

        const { observations } = this.#recording;
        const takenOver = this.#takeOver(node, 'attachment', receiver, values => observations.resolvesTo(ATTACHMENT_OBSERVATION, { receiver, args: NO_ARGUMENTS }, values));
        const request = takenOver?.request ?? observations.resolve(ATTACHMENT_OBSERVATION, { receiver, args: NO_ARGUMENTS });

        if (takenOver === null) {
            this.#hold(request, node, 'attachment', receiver);
        }

        this.#recording.dependencies.push({ member: declaration.name, pointer: this.#pointerOf(node), observations: [request] });
    }

    /**
     * Follows the flat-tree ancestry of a receiver whose roots a call observes, once an evaluation: the structure of each root and the slots assigned in it, so moving the receiver or an ancestor to another tree or slot evaluates again and rebinds what observes its roots; and, for a receiver in a detached tree, whether it is attached, since moving a detached tree changes nothing inside it.
     * @param {unknown} receiver The call's receiver.
     * @param {object} node The node whose call observes the receiver's roots.
     * @param {object[]} roots The roots of the receiver's ancestry.
     * @param {object[]} requests The requests the call records, which these join.
     */
    #followAncestry(receiver, node, roots, requests) {
        const { followedRoots } = this.#recording;

        // Every receiver leaving a root changes the root's own structure, so each root is followed once an evaluation, whichever receiver is in it.
        roots.forEach(root => {
            if (followedRoots.has(root)) {
                return;
            }

            followedRoots.add(root);
            ANCESTRY_OBSERVATIONS.forEach((observation, index) => {
                if (this.#moduleRegistry.getObservationType(observation.type) !== undefined) {
                    requests.push(this.#holdAt(node, `ancestry:${index}`, receiver, observation, NO_ARGUMENTS, root).request);
                }
            });
        });

        this.#followAttachment(receiver, node, roots.at(-1) ?? null, requests);
    }

    /** Follows whether the receiver is attached, once an evaluation, where the outermost root of its ancestry is the top of a detached tree, which moves without a change inside any root. */
    #followAttachment(receiver, node, outermost, requests) {
        const { followedAttachments } = this.#recording;

        if (outermost === null || outermost.nodeType === 9 || (outermost.nodeType === 11 && outermost.host !== undefined) || followedAttachments.has(receiver) || this.#moduleRegistry.getObservationType(ATTACHMENT_OBSERVATION.type) === undefined) {
            return;
        }

        followedAttachments.add(receiver);
        requests.push(this.#holdAt(node, 'ancestry:attachment', receiver, ATTACHMENT_OBSERVATION, NO_ARGUMENTS, receiver).request);
    }

    /** Whether the observation of a receiver's root sees the receiver leave it: a mutation of the root's children through its subtree. */
    static #followsItsRoot(observation) {
        return observation.type === 'mutation' && observation.childList === true && observation.subtree === true;
    }

    /** The roots of the receiver's flat-tree ancestry, each node's found once an evaluation, so receivers that share an ancestry walk it once. */
    #rootsOf(receiver) {
        return Observations.rootsOf(receiver, this.#recording.rootsOf);
    }

    /**
     * The request the observation resolves to at the target, and its session: the one an evaluation this one replaces holds for it at the place, or a new one; null where the target is null.
     * @returns {{ request: object, session: import('./ObservationSession.mjs').ObservationSession | null } | null}
     */
    #holdAt(node, place, receiver, observation, args, target) {
        const takenOver = this.#takeOver(node, place, receiver, values => Observations.resolvesAt(observation, { args }, target, values));

        if (takenOver !== null) {
            return takenOver;
        }

        const request = this.#recording.observations.resolveAt(observation, { args }, target);

        return request === null ? null : { request, session: this.#hold(request, node, place, receiver) };
    }

    /**
     * Holds the observation of the request, answering its session, or leaves it unheld where only a pending evaluation needs it and answers null.
     * A session of a shared observation is kept where the node's call acquired it, at the observation's place among those the call observes and for its receiver, for a later evaluation to take over.
     */
    #hold(request, node, place, receiver) {
        const { observations, onChange, holdsAll, sessions, heldSessions, unheld } = this.#recording;
        const observationType = this.#moduleRegistry.getObservationType(request.type);

        if (observationType !== undefined && observationType.contract === 'invalidation' && !holdsAll) {
            unheld.push(request);

            return null;
        }

        const session = observations.acquire(request, onChange);

        sessions.push(session);

        if (heldSessions !== null && observationType.shared !== false) {
            this.#keep(node, receiver, { place, request, session, values: Observations.valuesOf(request) });
        }

        return session;
    }

    /** The session an evaluation this one replaces holds at the place, where `accepts` finds its request still the call's, which becomes this evaluation's own; null where none does. */
    #takeOver(node, place, receiver, accepts) {
        const { replaces, sessions } = this.#recording;

        if (replaces === null) {
            return null;
        }

        for (const evaluation of replaces) {
            const held = evaluation.takeOver(node, place, receiver, accepts);

            if (held !== null) {
                sessions.push(held.session);
                this.#keep(node, receiver, held);

                return held;
            }
        }

        return null;
    }

    /** Keeps the session where the node's call acquired it, for its receiver, for a later evaluation to take over. */
    #keep(node, receiver, held) {
        const byNode = this.#recording.heldSessions;
        let byReceiver = byNode.get(node);

        if (byReceiver === undefined) {
            byReceiver = new Map();
            byNode.set(node, byReceiver);
        }

        const candidates = byReceiver.get(receiver);

        if (candidates === undefined) {
            byReceiver.set(receiver, [held]);
        } else {
            candidates.push(held);
        }
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

    /** The event as the fields its type declares, read now, so a projection never holds what the source delivered. */
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

    #object(node, current) {
        const hasTarget = node.target !== undefined;
        const target = hasTarget ? this.#evaluate(node.target, current) : current;
        const apply = item => item === null && hasTarget
            ? null
            : this.#applyObjectExpression(node, item);

        if (!(hasTarget && Array.isArray(target))) {
            return apply(target);
        }

        const items = target.map(apply);

        // A list of elements is projected item by item, so each item keeps the element it came from; two elements can project to the same data.
        if (target.length > 0 && target.every(item => item === null || item?.nodeType === 1)) {
            this.#elementsOf.set(items, [...target]);
        }

        return items;
    }

    /** The object an object expression gives the item: each of its fields, in order, under its name, evaluated against the item with the expression's locals in scope, with the branches each field's conditionals selected. */
    #applyObjectExpression(node, item) {
        const names = this.#resolvedDefinition.fieldNamesOf(node);
        const object = {};
        const enclosingBranches = this.#branches;
        const enclosingLocals = this.#localsFrame;
        let branches = null;

        if (node.locals !== undefined) {
            this.#localsFrame = { node, item, values: new Map(), enclosing: enclosingLocals };
        }

        try {
            node.fields.forEach((field, index) => {
                this.#branches = null;
                QueryEvaluator.#define(object, names[index], this.#evaluate(field.value, item));

                if (this.#branches !== null) {
                    (branches ??= new Map()).set(names[index], this.#branches);
                }
            });
        } finally {
            this.#branches = enclosingBranches;
            this.#localsFrame = enclosingLocals;
        }

        if (branches !== null) {
            this.#branchesOf.set(object, branches);
        }

        return object;
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
            default: {
                const structure = this.#moduleRegistry.getType(name);

                return structure !== undefined && QueryEvaluator.#isRecord(value) && QueryEvaluator.#fieldTypesOf(structure).every(([field, type]) => this.#conforms(value[field], type));
            }
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

    /** The identities of a value with the branches its conditionals selected beside them, or the identities alone where none did. */
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
