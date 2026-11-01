/**
 * domql — makes query objects from text or a definition, through which every request is evaluated, watched, subscribed to, executed once or run, and registers the modules that extend the vocabulary
 */

import { SnapshotComparer } from './snapshots/SnapshotComparer.mjs';
import { BrowserModule } from './dom/BrowserModule.mjs';
import { DomqlQuery } from './dom/DomqlQuery.mjs';
import { ExecutionHandle } from './dom/ExecutionHandle.mjs';
import { DispatchTable } from './dom/DispatchTable.mjs';
import { Observations } from './dom/Observations.mjs';
import { QueryEvaluator } from './dom/QueryEvaluator.mjs';
import { EventListener } from './dom/EventListener.mjs';
import { Watch } from './dom/Watch.mjs';
import { Versions } from './Versions.mjs';
import { nexo, NexoError } from '@formaui-net/nexo';

/**
 * How a request is resolved.
 * @typedef {object} DomqlResolveOptions
 * @property {boolean} [watch] Whether the query will be watched.
 * @property {boolean} [acceptPartialObservation] Whether a watch accepts members whose changes its observations only partly cover.
 */

/**
 * How a query is evaluated once.
 * @typedef {object} DomqlEvaluateOptions
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 */

/**
 * How a query is evaluated once, waiting for its maintained members.
 * @typedef {object} DomqlEvaluateAsyncOptions
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 * @property {AbortSignal} [signal] Cancels the evaluation, which then rejects with the signal's reason.
 */

/**
 * How a query is watched.
 * @typedef {object} DomqlWatchOptions
 * @property {'frame' | 'immediate'} [schedule] When an evaluation follows a change: at the next animation frame, once however many observations fired, or, without waiting for an animation frame, in a microtask the first invalidation queues, which the invalidations received before it begins share.
 * @property {'snapshot' | 'liveState'} [updateStrategy] What the watch's events carry: each snapshot whole, or one object the watch keeps current in place, which keeps its identity.
 * @property {boolean} [acceptPartialObservation] Whether the watch accepts a member whose observations only partly cover its changes.
 * @property {AbortSignal} [signal] Disposes the watch when it aborts.
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 */

/**
 * How a subscription is listened to, or an execution carried out once or run.
 * @typedef {object} DomqlOperationOptions
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 * @property {AbortSignal} [signal] Ends what the operation started when it aborts.
 */

/** Each operation that carries a request out: the request it takes, and what a refusal says it was asked to do. */
const OPERATIONS = {
    evaluate: { request: 'value', verb: 'evaluate' },
    evaluateAsync: { request: 'value', verb: 'evaluate' },
    watch: { request: 'value', verb: 'watch' },
    subscribe: { request: 'subscription', verb: 'subscribe to' },
    executeAsync: { request: 'once', verb: 'execute' },
    run: { request: 'continuous', verb: 'run' },
};

/** What each request does, a value, a subscription, a once execution or a continuous one, and the operations it takes, for a refusal to say. */
const REQUESTS = {
    value: { does: 'it produces a value', takes: 'evaluate(), evaluateAsync() or watch()' },
    subscription: { does: 'it listens to events', takes: 'subscribe()' },
    once: { does: 'it executes an effect once', takes: 'executeAsync()' },
    continuous: { does: 'it keeps an effect running', takes: 'run()' },
};

/** When a watch evaluates after a change, and what its events carry. */
const WATCH_SCHEDULES = ['frame', 'immediate'];
const WATCH_UPDATE_STRATEGIES = ['snapshot', 'liveState'];

class Domql {
    static #browserModule = BrowserModule.create();
    static #moduleRegistry = nexo.createRegistry([Domql.#browserModule]);

    /** The imports DOMQL supplies to every query it reads and writes: its own module, under its own name. */
    static #imports = Object.freeze([Domql.#browserModule.name]);

    /**
     * The resolutions of each definition, by the resolution key of the bindings they were made against, each kept while it is current and released with the definition.
     * Queries that share a definition, as those made from the same text do, and whose bindings have one resolution key, share its resolution; a watch's policy is checked against it each time.
     * @type {WeakMap<object, Map<string, object>>}
     */
    static #resolutionsByDefinition = new WeakMap();

    /**
     * The observations of each window, so requests carried out in one window share the observations they have in common.
     * @type {WeakMap<Window, Observations>}
     */
    static #observationsByWindow = new WeakMap();

    /** What carries out the operations of the query objects this instance makes. @type {import('./dom/DomqlQuery.mjs').QueryOperations} */
    static #operations = Object.freeze({
        bind: bindings => Domql.#bind(bindings),
        resolve: (query, options) => Domql.#resolvedDefinitionOf(Domql.#resolve(query, options ?? {})),
        evaluate: (query, path, options) => Domql.#evaluate(query, path, options ?? {}),
        evaluateAsync: (query, path, options) => Domql.#evaluateAsync(query, path, options ?? {}),
        watch: (query, path, options) => Domql.#watch(query, path, options ?? {}),
        subscribe: (query, handler, options) => Domql.#subscribe(query, handler, options ?? {}),
        executeAsync: (query, options) => Domql.#executeAsync(query, options ?? {}),
        run: (query, options) => Domql.#run(query, options ?? {}),
    });

    /**
     * Makes a query object from a request's text or its definition, binding its parameters through DOMQL's registry. It parses the text with DOMQL's own module supplied as its import, a text being parsed once and its definition reused for identical text, and checks the structure; a definition records its own imports. It evaluates nothing and has no effect.
     * A query object of another DOMQL instance is refused, with how to make it here from its definition.
     * @param {string | object} source The request's text, or its definition.
     * @param {Record<string, unknown>} [bindings] The values supplied by parameter name.
     * @returns {DomqlQuery}
     */
    static query(source, bindings = {}) {
        if (typeof source === 'string') {
            return new DomqlQuery(nexo.parse(source, { imports: Domql.#imports }), Domql.#bind(bindings), Domql.#operations);
        }

        if (source instanceof DomqlQuery) {
            throw NexoError.structure('DOMQL2001', 'A query object is made from text or a definition; one is bound anew with query.with(bindings)', {});
        }

        if (typeof source?.with === 'function') {
            throw NexoError.structure('DOMQL2002', 'A query object is made from text or a definition; one another DOMQL instance made is made here from its definition, as domql.query(query.definition, bindings)', {});
        }

        return new DomqlQuery(nexo.validate(source), Domql.#bind(bindings), Domql.#operations);
    }

    /**
     * The canonical text of a request, given as its text, its definition or a query object, which the three give alike. It parses and checks the structure as `query` does, and writes every import the definition records but DOMQL's own, which DOMQL supplies, needing no bindings, since it resolves nothing; formatting the text it gives gives that text again.
     * Comments and the original layout are discarded, as a definition holds neither, and the order of the locals and the fields is kept.
     * @param {string | object | DomqlQuery} source The request's text, its definition, or a query object this instance made.
     * @returns {string}
     */
    static format(source) {
        if (source instanceof DomqlQuery) {
            return nexo.format(source.definition, { imports: Domql.#imports });
        }

        if (typeof source?.with === 'function') {
            throw NexoError.structure('DOMQL2002', 'A query object another DOMQL instance made is formatted from its definition, as domql.format(query.definition)', {});
        }

        return nexo.format(source, { imports: Domql.#imports });
    }

    /**
     * Creates a module from the vocabulary it declares, each declaration that runs code carrying its implementation, keeping each host call's request kind, execution mode and implementation in DOMQL's dispatch table.
     * @param {string} name The module's name.
     * @param {object} contents What the module declares.
     */
    static createModule(name, contents) {
        return DispatchTable.createModule(name, contents);
    }

    /** Registers a module's vocabulary, which every request resolved afterwards may use; a module declaring observation targets is refused, since DOMQL resolves its own module's alone. */
    static registerModule(module) {
        if (module?.observationTargets?.length > 0) {
            throw NexoError.module('DOMQL4008', `DOMQL resolves the observation targets its own module declares alone, and the module '${module.name}' declares one of its own; its observations observe the receiver, an argument of the member, or window, document, root or roots through one of DOMQL's observation types`, { module: module.name, declarationKey: 'observationTargets' });
        }

        // DOMQL carries a host call out only as its dispatch table keeps it, which a module domql.createModule made holds.
        const unregistered = Domql.#membersOf(module).find(({ declaration }) => declaration?.invokedBy === 'host' && DispatchTable.get(declaration) === undefined);

        if (unregistered !== undefined) {
            const { declaration, type } = unregistered;

            throw NexoError.module('DOMQL4009', `The module '${module.name}' declares the host call '${declaration.name}' without the request it makes; create the module with domql.createModule, which keeps each host call's request kind, execution mode and implementation`, { module: module.name, ...(type === null ? {} : { type }), declaration: declaration.name, declarationKey: 'requestKind' });
        }

        Domql.#moduleRegistry.registerModule(module);
    }

    /** Every member the module declares, each with the name of the type it stands within, null for a module member; contents that are no list hold none. */
    static #membersOf(module) {
        const listOf = value => (Array.isArray(value) ? value : []);

        return [...listOf(module?.members).map(declaration => ({ declaration, type: null })), ...listOf(module?.types).flatMap(type => listOf(type?.members).map(declaration => ({ declaration, type: type.name })))];
    }

    /** Binds the values given by parameter name through DOMQL's registry, which every query resolves against. */
    static #bind(bindings) {
        return Domql.#moduleRegistry.createBindings(bindings);
    }

    /** Evaluates the query once, synchronously, answering the part of its result the path reaches. */
    static #evaluate(query, path, { window = globalThis.window }) {
        const resolution = Domql.#resolveFor('evaluate', query);

        resolution.typeAt(path);

        // A query evaluated once again in the same window, through the same resolution, reuses the evaluator it was last evaluated with. The query keeps none while one evaluates, so an evaluation it runs that evaluates the
        // query again creates its own, and one that fails leaves none kept.
        let kept = DomqlQuery.onceEvaluationOf(query);

        if (kept === null || kept.resolution !== resolution || kept.window !== window) {
            kept = { resolution, window, evaluator: Domql.#createEvaluator(query, resolution, window) };
        } else {
            DomqlQuery.keepOnceEvaluation(query, null);
        }

        const value = kept.evaluator.evaluateOnce();

        DomqlQuery.keepOnceEvaluation(query, kept);

        return nexo.paths.valueAt(value, path);
    }

    /**
     * Evaluates the query once, waiting for the first sample of every maintained member it reads, and answers a promise of the part of its result the path reaches.
     * The query is evaluated again as samples arrive and as what it depends on changes, until an evaluation reads no pending member; every observation it started is released when it settles, fails or is canceled.
     */
    static async #evaluateAsync(query, path, { window = globalThis.window, signal }) {
        signal?.throwIfAborted();

        const resolution = Domql.#resolveFor('evaluateAsync', query);

        resolution.typeAt(path);

        const evaluator = Domql.#createEvaluator(query, resolution, window, () => Domql.#resolveFor('evaluateAsync', query));
        const observations = Domql.#getObservations(window);
        const reportError = Domql.#createErrorReporter(window);

        return new Promise((resolve, reject) => {
            let queryEvaluation = null;
            let isScheduled = false;
            let isSettled = false;

            // What stands for this wait as the consumer of its observations, so each of its evaluations reaches again an observation the one before it started.
            const wait = {};

            // A cleanup that fails is reported, and never replaces the evaluation's result, its failure or its cancellation.
            const release = evaluation => {
                try {
                    evaluation?.dispose();
                } catch (error) {
                    reportError(error);
                }
            };
            const settle = outcome => {
                isSettled = true;
                signal?.removeEventListener('abort', cancel);
                release(queryEvaluation);
                outcome();
            };
            const cancel = () => settle(() => reject(signal.reason));
            const evaluate = () => {
                isScheduled = false;

                if (isSettled) {
                    return;
                }

                const next = evaluator.evaluate({ observations, onChange: schedule, consumer: wait });

                // The next evaluation holds its observations before the last releases its own, so one both need keeps running.
                release(queryEvaluation);
                queryEvaluation = next;

                if (next.error !== null) {
                    settle(() => reject(next.error));
                } else if (!next.isPending) {
                    settle(() => resolve(nexo.paths.valueAt(next.value, path)));
                }
            };
            // An observation reports a change inside its own delivery, so the evaluation that follows waits for it to end.
            const schedule = () => {
                if (!isSettled && !isScheduled) {
                    isScheduled = true;
                    queueMicrotask(evaluate);
                }
            };

            signal?.addEventListener('abort', cancel, { once: true });
            evaluate();
        });
    }

    /** Starts a watch of the query, whose snapshots are the part of its result the path reaches; a signal already aborted answers a watch that is disposed and starts nothing. */
    static #watch(query, path, { schedule = 'frame', updateStrategy = 'snapshot', acceptPartialObservation = false, signal, window = globalThis.window }) {
        if (!WATCH_SCHEDULES.includes(schedule)) {
            throw NexoError.structure('DOMQL2003', `A watch is scheduled as ${WATCH_SCHEDULES.join(' or ')}`, {});
        }

        if (!WATCH_UPDATE_STRATEGIES.includes(updateStrategy)) {
            throw NexoError.structure('DOMQL2004', `The update strategy of a watch is ${WATCH_UPDATE_STRATEGIES.join(' or ')}`, {});
        }

        if (updateStrategy === 'liveState' && path.length > 0) {
            throw NexoError.structure('DOMQL2005', 'A selection is watched as snapshots alone; write the smaller result in DOMQL to keep it as live state', {});
        }

        const resolution = Domql.#resolveFor('watch', query, { watch: true, acceptPartialObservation: acceptPartialObservation === true });

        // Live state is one object that keeps its identity, which null and a single value have none of.
        // The type's notation tells it: a nullable type ends in `?`, an object type is written in braces and a list as `List<…>`.
        if (updateStrategy === 'liveState' && (resolution.type.endsWith('?') || !(resolution.type.startsWith('{') || resolution.type.startsWith('List<')))) {
            throw NexoError.validation('DOMQL3001', `Live state keeps one object current, so its result is an object or a list that is never null, and this one is ${resolution.type}; put it in a top-level object expression`, Domql.#locationOf(query));
        }

        resolution.typeAt(path);

        const evaluator = Domql.#createEvaluator(query, resolution, window, () => Domql.#resolveFor('watch', query, { watch: true, acceptPartialObservation: acceptPartialObservation === true }));

        if (schedule === 'frame' && typeof window.requestAnimationFrame !== 'function') {
            throw NexoError.structure('DOMQL2006', "A watch scheduled by animation frame needs a window that has them; schedule it as 'immediate' otherwise", {});
        }

        return new Watch({
            evaluator,
            observations: Domql.#getObservations(window),
            comparer: new SnapshotComparer(),
            window,
            reportError: Domql.#createErrorReporter(window),
            checkPath: selected => resolution.typeAt(selected),
            options: { schedule, updateStrategy, path, signal },
        });
    }

    /**
     * Listens to the subscription's event source from the call on, so an event that follows the call is heard, and answers the event listener; a source that cannot start fails the call.
     * Each event is captured and projected through the object expression that follows the source, in the task the event is delivered in, and the handler receives the event listener and the result, or the failure. The source's receiver and arguments are evaluated once, as listening starts.
     */
    static #subscribe(query, handler, { window = globalThis.window, signal }) {
        if (typeof handler !== 'function') {
            throw NexoError.structure('DOMQL2007', 'A subscription takes the function that handles each event', {});
        }

        const resolution = Domql.#resolveFor('subscribe', query);

        return new EventListener({
            evaluator: Domql.#createEvaluator(query, resolution, window, () => Domql.#resolveFor('subscribe', query)),
            implementationOf: call => Domql.#implementationOf(call),
            getLocation: pointer => resolution.getLocation(pointer),
            environment: { window, document: window.document },
            observations: Domql.#getObservations(window),
            reportError: Domql.#createErrorReporter(window),
            handler,
            signal,
        });
    }

    /**
     * Carries out the once execution the request ends in and answers a promise of its result, an immutable snapshot containing no live DOM references, read through the object expression that follows the execution where one does.
     * Its host call is prepared first; a failure there rejects and executes nothing, and a skipped preparation, where the receiver or an argument is null, executes nothing and resolves to null. The execution's implementation receives
     * the signal, and may answer its result or a promise of it, which Nexo captures as the type the execution declares; one that declares none resolves to null. A failure of the execution rejects with an evaluation error whose cause
     * is what it threw. A signal that aborts rejects with its reason at once; the execution learns of it through the signal, its result is then discarded, and a failure it reports afterwards goes to the window's error reporting. DOMQL
     * never undoes what an execution changed.
     */
    static async #executeAsync(query, { window = globalThis.window, signal }) {
        signal?.throwIfAborted();

        const resolution = Domql.#resolveFor('executeAsync', query);
        const evaluator = Domql.#createEvaluator(query, resolution, window, () => Domql.#resolveFor('executeAsync', query));
        const call = evaluator.prepareHostCall();

        if (call.kind === 'skipped') {
            return null;
        }

        const location = resolution.getLocation(call.pointer);

        const execute = Domql.#implementationOf(call);
        const { name } = call.declaration;
        const reportError = Domql.#createErrorReporter(window);
        const createExecutionError = error => NexoError.evaluation('DOMQL5001', `The execution '${name}' failed: ${error?.message ?? String(error)}`, location, { cause: error });

        return new Promise((resolve, reject) => {
            let isSettled = false;

            const settle = outcome => {
                isSettled = true;
                signal?.removeEventListener('abort', cancel);
                outcome();
            };
            const cancel = () => settle(() => reject(signal.reason));
            let returnValue;

            signal?.addEventListener('abort', cancel, { once: true });

            try {
                returnValue = execute({ receiver: call.receiver, args: call.args, env: { window, document: window.document }, signal: signal ?? new AbortController().signal });
            } catch (error) {
                settle(() => reject(createExecutionError(error)));

                return;
            }

            Promise.resolve(returnValue).then(result => {
                // A result that arrives after the execution was canceled is discarded.
                if (isSettled) {
                    return;
                }

                let value;

                try {
                    value = call.project === undefined ? null : Domql.#projectResult(evaluator, call, result, location);
                } catch (error) {
                    settle(() => reject(error));

                    return;
                }

                settle(() => resolve(value));
            }, error => {
                // No caller waits for a failure that arrives after the execution was canceled, so it goes to the error reporting.
                if (isSettled) {
                    reportError(createExecutionError(error));
                } else {
                    settle(() => reject(createExecutionError(error)));
                }
            });
        });
    }

    /**
     * Runs the continuous execution the request ends in, which has started once the call returns, and answers its handle, which belongs to the caller. Disposing the handle ends the execution and leaves its module registered.
     * Its host call is prepared now; a skipped preparation, where the receiver or an argument is null, has nothing to start until an update supplies one. An execution that cannot start fails the call and leaves nothing running.
     */
    static #run(query, { window = globalThis.window, signal }) {
        // An update binds the same definition anew, so it is validated, resolved and prepared as the first bindings were.
        const prepare = request => {
            const resolution = Domql.#resolveFor('run', request);
            const call = Domql.#createEvaluator(request, resolution, window).prepareHostCall();
            const isPrepared = call.kind === 'prepared';

            return {
                declaration: resolution.hostCall.declaration,
                name: resolution.hostCall.name,
                start: isPrepared ? Domql.#implementationOf(call) : undefined,
                receiver: isPrepared ? call.receiver : null,
                args: isPrepared ? call.args : null,
                environment: { window, document: window.document },
                location: resolution.getLocation(call.pointer),
            };
        };

        return new ExecutionHandle({
            execution: prepare(query),
            prepare: bindings => prepare(query.with(bindings)),
            reportError: Domql.#createErrorReporter(window),
            signal,
        });
    }

    /** The resolved definition `query.resolve` answers for each resolution, its declared fields alone, one for each resolution so that a resolution reused answers the same object. @type {WeakMap<object, object>} */
    static #resolvedDefinitions = new WeakMap();

    /** The declared fields of a resolution, frozen, holding none of the resolution itself, so its evaluator and what else Nexo gives a host stay DOMQL's own. */
    static #resolvedDefinitionOf(resolution) {
        let resolvedDefinition = Domql.#resolvedDefinitions.get(resolution);

        // What a request asks for is fixed for its resolution: a host call on a receiver of unknown type reaches the modules the request imports alone, each registered before it was resolved.
        if (resolvedDefinition === undefined) {
            const request = Domql.#requestOf(resolution);

            resolvedDefinition = Object.freeze({
                definition: resolution.definition,
                kind: request === 'once' || request === 'continuous' ? 'execution' : request,
                executionMode: request === 'once' || request === 'continuous' ? request : null,
                type: resolution.type,
                usedDeclarations: resolution.usedDeclarations,
                typeAt: path => resolution.typeAt(path),
                getLocation: pointer => resolution.getLocation(pointer),
            });
            Domql.#resolvedDefinitions.set(resolution, resolvedDefinition);
        }

        return resolvedDefinition;
    }

    static #resolve(query, options) {
        let resolutions = Domql.#resolutionsByDefinition.get(query.definition);

        if (resolutions === undefined) {
            resolutions = new Map();
            Domql.#resolutionsByDefinition.set(query.definition, resolutions);
        }

        const bindings = DomqlQuery.bindingsOf(query);
        let resolution = resolutions.get(bindings.resolutionKey);

        // A resolution stays current until a registration may change what it recognizes, which Nexo alone can tell.
        if (resolution === undefined || !resolution.isCurrent) {
            resolution = Domql.#moduleRegistry.resolve(query.definition, bindings);
            resolutions.set(bindings.resolutionKey, resolution);
        }

        if (options.watch === true && resolution.hostCall === null) {
            Domql.#checkWatch(resolution, options.acceptPartialObservation === true);
        }

        return resolution;
    }

    /**
     * Refuses a watch over a member whose changes no observation covers, and one over a member whose observations cover its changes in part unless the watch accepts partial observation, naming each at the first place it is used.
     * Nexo tells how each declaration the request may use changes, those it uses and, where a member of a value of `Any` is selected as it is evaluated, every one it could select; what may be watched is DOMQL's to decide.
     */
    static #checkWatch(resolution, acceptsPartialObservation) {
        const { declarations } = resolution.getCandidateDeclarations();
        const unobserved = declarations.filter(use => use.declaration.updates?.changes === 'unobserved');

        if (unobserved.length > 0) {
            throw NexoError.validation('DOMQL3002', `A watch cannot follow ${unobserved.map(use => `'${use.qualifiedName}'`).join(', ')}, which name no observations`, resolution.getLocation(unobserved[0].pointer));
        }

        const partlyObservableUses = declarations.filter(use => use.declaration.updates?.changes === 'partly-observable');

        if (partlyObservableUses.length > 0 && !acceptsPartialObservation) {
            const missesByName = [...new Map(partlyObservableUses.map(use => [use.qualifiedName, use.declaration.updates.misses])).entries()];

            throw NexoError.validation('DOMQL3003', `A watch over ${missesByName.map(([name, misses]) => `'${name}' (which misses ${misses})`).join(', ')} is refused unless the watch accepts partial observation`, resolution.getLocation(partlyObservableUses[0].pointer));
        }
    }

    /**
     * Resolves a request for the operation that carries it out, refusing it with a validation error that says what the request does and names the operations it takes, where it is not of the kind the operation takes, before anything is evaluated or started.
     * @param {keyof typeof OPERATIONS} operation
     * @param {DomqlQuery} query The request.
     * @param {DomqlResolveOptions} [options] How the request is resolved.
     */
    static #resolveFor(operation, query, options = {}) {
        const resolution = Domql.#resolve(query, options);
        const { request, verb } = OPERATIONS[operation];
        const requested = Domql.#requestOf(resolution);

        if (requested !== request) {
            const { does, takes } = REQUESTS[requested];

            throw NexoError.validation('DOMQL3004', `Cannot ${verb} '${nexo.quote(query.definition, { imports: Domql.#imports })}': ${does}.\nUse ${takes}.`, Domql.#locationOf(query));
        }

        return resolution;
    }

    /**
     * What the resolved request asks for: a value, where it ends in no host call, or what its host call requests as DOMQL's dispatch table keeps it, a subscription or an execution of its mode.
     * A host call on a receiver of unknown type has no declaration yet, so its candidates, every declaration that takes the call as it is written, say what it requests, and are refused as ambiguous where they disagree.
     */
    static #requestOf(resolution) {
        const { hostCall } = resolution;

        if (hostCall === null) {
            return 'value';
        }

        const requests = new Set(hostCall.candidates.map(declaration => {
            const descriptor = DispatchTable.get(declaration);

            return descriptor.requestKind === 'subscription' ? 'subscription' : descriptor.executionMode;
        }));

        if (requests.size !== 1) {
            throw NexoError.validation('DOMQL3005', `'${hostCall.name}' follows a value whose type is unknown, and its host calls disagree on what they request, so what the request does is ambiguous`, resolution.getLocation(hostCall.pointer));
        }

        return [...requests][0];
    }

    /** The implementation that carries the prepared host call out, as DOMQL's dispatch table keeps it, refusing one whose module gives it none, which is resolved against and never carried out. */
    static #implementationOf(call) {
        const { implementation, type } = DispatchTable.get(call.declaration);

        if (implementation === undefined) {
            throw NexoError.module('DOMQL4010', `'${call.declaration.name}' has no impl, so a request that ends in it is resolved and never carried out`, { module: Domql.#moduleRegistry.getDeclaringModuleName(call.declaration), ...(type === null ? {} : { type }), declaration: call.declaration.name, declarationKey: 'impl' });
        }

        return implementation;
    }

    /** Where the request stands, for a failure that belongs to the whole of it. */
    static #locationOf(query) {
        return nexo.getLocation(query.definition, '/expression');
    }

    /**
     * Projects a once execution's result through its prepared call, or, where a module registered while it ran made the request stale, through the call prepared again, which the execution's own declaration must be,
     * refusing it otherwise; the execution's effect stands either way.
     */
    static #projectResult(evaluator, call, result, location) {
        try {
            return call.project(result).value;
        } catch (error) {
            if (error?.code !== 'NEXO2040') {
                throw error;
            }
        }

        const again = evaluator.prepareHostCall();

        if (again.kind !== 'prepared' || again.declaration !== call.declaration) {
            throw NexoError.evaluation('DOMQL5015', `A module registered since made the request of '${call.declaration.name}' stale, and preparing it again reaches ${again.kind === 'prepared' ? 'another host call' : 'no host call'}; carry it out again`, location);
        }

        return again.project(result).value;
    }

    /**
     * Creates the evaluator of a resolved request in its window, which an evaluation needs; given how to resolve the request again, it evaluates and prepares through a current resolution where a registration made
     * this one stale.
     */
    static #createEvaluator(query, resolution, window, resolveAgain = null) {
        if (!window?.document) {
            throw NexoError.evaluation('DOMQL5002', 'DOMQL cannot evaluate without a browser window. Pass a window explicitly when running outside a browser.', {});
        }

        const environment = { window, document: window.document };
        const createEvaluator = current => current.createEvaluator(DomqlQuery.bindingsOf(query), environment);

        return new QueryEvaluator(Domql.#moduleRegistry, createEvaluator(resolution), resolveAgain === null ? null : { resolution, resolveAgain, createEvaluator });
    }

    /** Returns the observations shared by everything carried out in the window, creating them on first use. */
    static #getObservations(window) {
        let observations = Domql.#observationsByWindow.get(window);

        if (observations === undefined) {
            observations = new Observations(Domql.#moduleRegistry, { window, document: window.document });
            Domql.#observationsByWindow.set(window, observations);
        }

        return observations;
    }

    /** Creates the function that reports a failure no handler receives to the window's error reporting; a failure of the reporting itself is dropped. */
    static #createErrorReporter(window) {
        return error => {
            try {
                if (window.reportError) {
                    window.reportError(error);
                } else {
                    console.error(error);
                }
            } catch {
                // Keep a reporter failure from interrupting the caller.
            }
        };
    }
}

/** DOMQL: makes query objects, formats requests, registers the modules that extend the vocabulary, and says which build it is and which specification it follows. */
export const domql = Object.freeze({
    query: (source, bindings) => Domql.query(source, bindings),
    format: source => Domql.format(source),
    createModule: (name, contents) => Domql.createModule(name, contents),
    registerModule: module => Domql.registerModule(module),
    info: Object.freeze({ versions: Object.freeze({ runtime: Versions.runtime, specification: Versions.specification, language: Versions.language }) }),
});

export { NexoError };
