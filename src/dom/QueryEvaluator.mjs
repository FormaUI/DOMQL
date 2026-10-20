/**
 * QueryEvaluator — DOMQL's observing host over Lexica's evaluator: evaluates a resolved request once, or recording what it depends on and holding the observations that cover it, so a watch, a wait and an event listener learn when to evaluate again
 */

import { Evaluator } from '@formaui/lexica/language/Evaluator.mjs';
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

/** What the host answers `beforeInvoke` with for a member whose sample is pending. */
const PENDING = Object.freeze({ pending: true });

export class QueryEvaluator {
    /** Lexica's evaluator of the request, which this host observes. @type {Evaluator} */
    #evaluator;

    #moduleRegistry;

    /** What the evaluation in progress records, or null where none does. @type {ObservationContext | null} */
    #observationContext = null;

    /** The hooks through which the evaluator reports each invocation to the observing evaluation in progress. */
    #host = Object.freeze({
        beforeInvoke: request => this.#observe(request),
        afterInvoke: (request, value) => this.#followDetachedReceiver(request, value),
    });

    /**
     * @param {import('@formaui/lexica/language/vocabulary/LexicaRegistry.mjs').LexicaRegistry} moduleRegistry The vocabulary the request was resolved against.
     * @param {import('@formaui/lexica/language/ResolvedDefinition.mjs').ResolvedDefinition} resolvedDefinition The resolved definition to read.
     * @param {import('@formaui/lexica/language/ParameterBindings.mjs').ParameterBindings} parameterBindings What the request's parameters are bound to.
     * @param {Environment} environment The window and the document the roots stand for.
     * @param {import('@formaui/lexica/language/TextLocations.mjs').TextLocations | null} locations Where in a text each part of the definition came from.
     */
    constructor(moduleRegistry, resolvedDefinition, parameterBindings, environment, locations) {
        this.#moduleRegistry = moduleRegistry;
        this.#evaluator = new Evaluator(moduleRegistry, resolvedDefinition, parameterBindings, environment, locations);
    }

    /** The result of evaluating the query once: immutable data holding no reference to the document. A member maintained by an observation fails it, since its first sample cannot arrive during a synchronous evaluation. */
    evaluateOnce() {
        return this.#evaluator.evaluate().value;
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
        return this.#evaluateWithObservations({ observations, onChange, holdsAllObservations, replaces, consumer, recordsDependencies, waits: true }, host => this.#evaluator.evaluate(host));
    }

    /** What starts the event source the subscription ends in, as Lexica's evaluator resolves it. */
    resolveSource() {
        return this.#evaluator.resolveSource();
    }

    /** What executes the action the request ends in, as Lexica's evaluator resolves it. */
    resolveAction() {
        return this.#evaluator.resolveAction();
    }

    /** What starts the behavior the request ends in, as Lexica's evaluator resolves it. */
    resolveBehavior() {
        return this.#evaluator.resolveBehavior();
    }

    /** The result of an action, read through the object expression that follows it, as Lexica's evaluator reads it once. */
    projectResult(result, execution) {
        return this.#evaluator.projectResult(result, execution);
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
        return this.#evaluateWithObservations({ observations, onChange: () => {}, holdsAllObservations: false, replaces: null, consumer, recordsDependencies: false, waits: false }, host => this.#evaluator.project(event, host));
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
            ({ value, identities } = produce(this.#host));
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

    /**
     * Records what the call depends on and holds its observations, answering the samples of its maintained observations, in the order the declaration names them.
     * Answers that a sample is still pending, which makes the member answer null and the evaluation pending.
     */
    #observe({ declaration, receiver, args, pointer }) {
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

        dependencies?.push({ member: declaration.name, pointer, observations: requests });

        if (isPending) {
            this.#observationContext.isPending = true;

            return PENDING;
        }

        return samples;
    }

    /** A member that answered null for an element that is detached depends on whether the element is attached, so it is read again when the element returns. */
    #followDetachedReceiver({ declaration, receiver, pointer }, value) {
        if (value !== null || receiver?.nodeType !== 1 || receiver.isConnected || this.#moduleRegistry.getObservationType('attachment') === undefined || this.#observationContext.followedAttachments.has(receiver)) {
            return;
        }

        this.#observationContext.followedAttachments.add(receiver);

        const cachedSession = this.#holdAt(ATTACHMENT_OBSERVATION, NO_ARGUMENTS, receiver);

        this.#observationContext.dependencies?.push({ member: declaration.name, pointer, observations: [cachedSession.request] });
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
}
