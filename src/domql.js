/**
 * domql — makes query objects from text or a definition, through which every request is evaluated, watched, subscribed to, executed once or run, and registers the modules that extend the vocabulary, loading on request
 * those its callers give loaders of
 */

import { SnapshotComparer } from './snapshots/SnapshotComparer.mjs';
import { Behaviors } from './dom/Behaviors.mjs';
import { BrowserModule } from './dom/BrowserModule.mjs';
import { DomqlQuery } from './dom/DomqlQuery.mjs';
import { ExecutionHandle } from './dom/ExecutionHandle.mjs';
import { DispatchTable } from './dom/DispatchTable.mjs';
import { FrameSchedule } from './dom/FrameSchedule.mjs';
import { MutationObservers } from './dom/MutationObservers.mjs';
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
 * @property {unknown} [owner] Who carries the request out, which every implementation it reaches receives as `env.owner`; null, the owner every operation that names none shares, by default.
 */

/**
 * How a query is evaluated once, waiting for its maintained members.
 * @typedef {object} DomqlEvaluateAsyncOptions
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 * @property {unknown} [owner] Who carries the request out, which every implementation it reaches receives as `env.owner`; null by default.
 * @property {AbortSignal} [signal] Cancels the evaluation, which then rejects with the signal's reason.
 */

/**
 * How a query is watched.
 * @typedef {object} DomqlWatchOptions
 * @property {'frame' | 'immediate' | 'delayed'} [schedule] When an evaluation follows a change: at the next animation frame, once however many observations fired; without waiting for an animation frame, in a microtask the first invalidation queues, which the invalidations received before it begins share; or once its delay has passed with no invalidation.
 * @property {number} [delay] How long the delayed schedule waits with no invalidation, in milliseconds above 0.
 * @property {(string | (string | number)[])[]} [reportOn] The parts whose change alone has a snapshot reported, whole, each a field's name or a list of path items.
 * @property {'snapshot' | 'liveState'} [updateStrategy] What the watch's events carry: each snapshot whole, or one object the watch keeps current in place, which keeps its identity.
 * @property {boolean} [acceptPartialObservation] Whether the watch accepts a member whose observations only partly cover its changes.
 * @property {AbortSignal} [signal] Disposes the watch when it aborts.
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 * @property {unknown} [owner] Who watches, which every implementation the watch reaches receives as `env.owner`; null by default.
 */

/**
 * How a subscription is listened to: as any operation, with the once executions it carries out as it hears each event, and the interval its handler hears at most one event in.
 * @typedef {DomqlOperationOptions & { reactions?: DomqlQuery[], throttle?: number }} DomqlSubscribeOptions
 */

/**
 * How a subscription is listened to, or an execution carried out once or run.
 * @typedef {object} DomqlOperationOptions
 * @property {Window} [window] The window `Domql.window` stands for, and whose document `Domql.document` stands for; by default the environment's.
 * @property {unknown} [owner] Who carries the request out, which every implementation it reaches receives as `env.owner`, and for whom a continuous execution runs; null by default.
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

/** The phases of an animation frame: the writes, then the reads. */
const FRAME_PHASES = ['write', 'read'];

/** When a watch evaluates after a change, and what its events carry. */
const WATCH_SCHEDULES = ['frame', 'immediate', 'delayed'];
const WATCH_UPDATE_STRATEGIES = ['snapshot', 'liveState'];

class Domql {
    /** The continuous executions running, each kept for its owner on its receiver, where its module's commands find it. */
    static #behaviors = new Behaviors();

    /** The mutation observers this instance runs, which a transient measurement drains of the records its own change caused. */
    static #mutationObservers = new MutationObservers();

    static #browserModule = BrowserModule.create({ behaviors: Domql.#behaviors, mutationObservers: Domql.#mutationObservers });
    static #moduleRegistry = nexo.createRegistry([Domql.#browserModule]);

    /** The loader of each module loaded on request, by its name, which a load asks where the registry holds no module of that name; kept for the instance's life. @type {Map<string, () => unknown>} */
    static #moduleLoaders = new Map();

    /** The load of each module under way, by its name, which every load asking for that module meanwhile shares; released as it settles, so a failed one is asked of its loader again. @type {Map<string, Promise<void>>} */
    static #loadingModules = new Map();

    /** The imports DOMQL supplies to every query it reads and writes: its own module, under its own name. */
    static #imports = Object.freeze([Domql.#browserModule.name]);

    /**
     * The resolutions of each definition, by the resolution key of the bindings they were made against, each kept while it is current and released with the definition.
     * Queries that share a definition, as those made from the same text do, and whose bindings have one resolution key, share its resolution; a watch's policy is checked against it each time.
     * @type {WeakMap<object, Map<string, object>>}
     */
    static #resolutionsByDefinition = new WeakMap();

    /**
     * What each window's operations share: its observations, so requests carried out in one window share those they have in common; its animation frames, whose writes run before its reads; and the tools an
     * environment offers, an operation's refusing what reads alone must not do, and an observation's.
     * @type {WeakMap<Window, { observations: Observations, frames: FrameSchedule, tools: object }>}
     */
    static #windowsServices = new WeakMap();

    /** What carries out the operations of the query objects this instance makes. @type {import('./dom/DomqlQuery.mjs').QueryOperations} */
    static #operations = Object.freeze({
        bind: (bindings, options) => Domql.#bind(bindings, options),
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
     * @param {{ types?: Record<string, string> }} [options] The bindings' options, as Nexo's `createBindings` takes them: `types` declares a top-level binding's type by its notation, which every binding of the query keeps.
     * @returns {DomqlQuery}
     */
    static query(source, bindings = {}, options = undefined) {
        if (typeof source === 'string') {
            const definition = nexo.parse(source, { imports: Domql.#imports });

            return new DomqlQuery(definition, Domql.#bind(bindings, options), Domql.#operations, bindings, Domql.#keep(options));
        }

        if (source instanceof DomqlQuery) {
            throw NexoError.structure('DOMQL2001', 'A query object is made from text or a definition; one is bound anew with query.with(bindings)', {});
        }

        if (typeof source?.with === 'function') {
            throw NexoError.structure('DOMQL2002', 'A query object is made from text or a definition; one another DOMQL instance made is made here from its definition, as domql.query(query.definition, bindings)', {});
        }

        const definition = nexo.validate(source);

        return new DomqlQuery(definition, Domql.#bind(bindings, options), Domql.#operations, bindings, Domql.#keep(options));
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
        return DispatchTable.createModule(name, contents, Domql.#behaviors);
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

    /**
     * Registers the loader of the module of the name given, which `loadModulesAsync` asks for it where this instance holds no module of that name: `load()` answers the module, or a promise of it, and registers nothing
     * itself. A name that is no module's, a `load` that is no function, and a second loader for one name are refused.
     * @param {string} name The module's name.
     * @param {() => unknown} load Answers the module.
     */
    static registerModuleLoader(name, load) {
        if (typeof name !== 'string' || name === '' || typeof load !== 'function') {
            throw NexoError.structure('DOMQL2013', 'A module loader is registered by the name of the module it loads, and is the function that answers that module', {});
        }

        if (Domql.#moduleLoaders.has(name)) {
            throw NexoError.structure('DOMQL2013', `A loader of the module '${name}' is registered already, and a module has one loader`, {});
        }

        Domql.#moduleLoaders.set(name, load);
    }

    /**
     * Loads every module named that this instance doesn't hold yet, each through its loader, and registers it, answering a promise that settles once each named is registered: those a query object, a definition or a
     * text imports, or those a list names. A load of a module already under way is shared, and a failed one is asked of its loader again by the next load.
     * @param {DomqlQuery | object | string | string[]} modules What names the modules.
     * @returns {Promise<void>}
     */
    static loadModulesAsync(modules) {
        let names;

        try {
            names = Domql.#moduleNamesOf(modules);
        } catch (error) {
            return Promise.reject(error);
        }

        return Promise.all(names.map(name => Domql.#loadModuleAsync(name))).then(() => undefined);
    }

    /** The names of the modules a query object, a definition or a text imports, or a list names, each once. */
    static #moduleNamesOf(modules) {
        if (Array.isArray(modules)) {
            if (!modules.every(name => typeof name === 'string' && name !== '')) {
                throw NexoError.structure('DOMQL2014', 'A list of the modules to load holds their names', {});
            }

            return [...new Set(modules)];
        }

        let definition;

        if (modules instanceof DomqlQuery) {
            ({ definition } = modules);
        } else if (typeof modules?.with === 'function') {
            throw NexoError.structure('DOMQL2002', 'A query object another DOMQL instance made is loaded for from its definition, as domql.loadModulesAsync(query.definition)', {});
        } else if (typeof modules === 'string') {
            definition = nexo.parse(modules, { imports: Domql.#imports });
        } else if (modules !== null && typeof modules === 'object') {
            definition = nexo.validate(modules);
        } else {
            throw NexoError.structure('DOMQL2014', 'The modules to load are named by the imports of a query object, a definition or a text, or by a list of their names', {});
        }

        return [...new Set(definition.imports.map(({ module }) => module))];
    }

    /** Loads the module of the name through its loader and registers it, unless this instance holds it; a load already under way is shared until it settles. */
    static #loadModuleAsync(name) {
        if (Domql.#moduleRegistry.moduleNames.includes(name)) {
            return Promise.resolve();
        }

        let loading = Domql.#loadingModules.get(name);

        if (loading === undefined) {
            const load = Domql.#moduleLoaders.get(name);

            if (load === undefined) {
                return Promise.reject(NexoError.module('DOMQL4015', `The module '${name}' is neither registered nor loaded on request; register it, or a loader of it with domql.registerModuleLoader, before a query that imports it is carried out`, { module: name }));
            }

            loading = Domql.#registerLoadedModuleAsync(name, load).finally(() => Domql.#loadingModules.delete(name));
            Domql.#loadingModules.set(name, loading);
        }

        return loading;
    }

    /** Asks the loader for its module and registers it, unless this instance came to hold one of its name meanwhile. */
    static async #registerLoadedModuleAsync(name, load) {
        let module;

        try {
            module = await load();
        } catch (error) {
            throw NexoError.evaluation('DOMQL5023', `The module '${name}' failed to load: ${error?.message ?? String(error)}`, { module: name }, { cause: error });
        }

        if (module === null || typeof module !== 'object' || module.name !== name) {
            throw NexoError.module('DOMQL4014', `The loader of the module '${name}' answered ${typeof module?.name === 'string' ? `the module '${module.name}'` : 'no module'}, where it answers the module of its name`, { module: name });
        }

        if (!Domql.#moduleRegistry.moduleNames.includes(name)) {
            Domql.registerModule(module);
        }
    }

    /** Every member the module declares, each with the name of the type it stands within, null for a module member; contents that are no list hold none. */
    static #membersOf(module) {
        const listOf = value => (Array.isArray(value) ? value : []);

        return [...listOf(module?.members).map(declaration => ({ declaration, type: null })), ...listOf(module?.types).flatMap(type => listOf(type?.members).map(declaration => ({ declaration, type: type.name })))];
    }

    /** The bindings' options a query keeps, once binding has checked them: a copy, so a change its caller makes afterwards reaches none of its bindings. */
    static #keep(options) {
        if (options === undefined) {
            return undefined;
        }

        return Object.freeze(options.types === undefined ? { ...options } : { ...options, types: Object.freeze({ ...options.types }) });
    }

    /** Binds the values given by parameter name through DOMQL's registry, which every query resolves against, each binding whose type the options declare captured as that type. */
    static #bind(bindings, options) {
        return Domql.#moduleRegistry.createBindings(bindings, options);
    }

    /** Evaluates the query once, synchronously, answering the part of its result the path reaches. */
    static #evaluate(query, path, { window = globalThis.window, owner = null }) {
        const resolution = Domql.#resolveFor('evaluate', query);

        Domql.#checkPath(resolution, path);

        return nexo.paths.valueAt(Domql.#createEvaluator(query, resolution, Domql.#createEnvironment(window, owner)).evaluateOnce(), path);
    }

    /**
     * Evaluates the query once, waiting for the first sample of every maintained member it reads, and answers a promise of the part of its result the path reaches.
     * The query is evaluated again as samples arrive and as what it depends on changes, until an evaluation reads no pending member; every observation it started is released when it settles, fails or is canceled.
     */
    static async #evaluateAsync(query, path, { window = globalThis.window, owner = null, signal }) {
        signal?.throwIfAborted();

        const resolution = Domql.#resolveFor('evaluateAsync', query);

        Domql.#checkPath(resolution, path);

        const evaluator = Domql.#createEvaluator(query, resolution, Domql.#createEnvironment(window, owner), () => Domql.#resolveFor('evaluateAsync', query));
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
    static #watch(query, path, { schedule = 'frame', delay, reportOn, updateStrategy = 'snapshot', acceptPartialObservation = false, signal, window = globalThis.window, owner = null }) {
        if (!WATCH_SCHEDULES.includes(schedule)) {
            throw NexoError.structure('DOMQL2003', `A watch is scheduled as ${WATCH_SCHEDULES.join(', ')}`, {});
        }

        if ((schedule === 'delayed') !== (delay !== undefined) || (delay !== undefined && !Domql.#isInterval(delay))) {
            throw NexoError.structure('DOMQL2019', "A watch scheduled as 'delayed' takes the delay it waits with no invalidation, a number of milliseconds above 0, and a watch of another schedule takes none", {});
        }

        const reportedPaths = Domql.#reportedPathsOf(reportOn, path);

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

        Domql.#checkPath(resolution, path);
        reportedPaths?.forEach(reported => resolution.typeAt(reported));

        const evaluator = Domql.#createEvaluator(query, resolution, Domql.#createEnvironment(window, owner), () => Domql.#resolveFor('watch', query, { watch: true, acceptPartialObservation: acceptPartialObservation === true }));

        if (schedule === 'frame' && typeof window.requestAnimationFrame !== 'function') {
            throw NexoError.structure('DOMQL2006', "A watch scheduled by animation frame needs a window that has them; schedule it as 'immediate' otherwise", {});
        }

        return new Watch({
            evaluator,
            observations: Domql.#getObservations(window),
            comparer: new SnapshotComparer(),
            frames: Domql.#servicesOf(window).frames,
            timers: schedule === 'delayed' ? Domql.#timersOf(window) : undefined,
            reportError: Domql.#createErrorReporter(window),
            checkPath: selected => resolution.typeAt(selected),
            options: { schedule, delay, reportOn: reportedPaths, updateStrategy, path, signal },
        });
    }

    /** Whether the value is an interval a schedule or a throttle waits: a number of milliseconds above 0. */
    static #isInterval(value) {
        return typeof value === 'number' && Number.isFinite(value) && value > 0;
    }

    /** The whole paths into the result of the parts a watch reports on, each a field's name or a list of path items relative to the part the watch reports, or null where it reports every change. */
    static #reportedPathsOf(reportOn, path) {
        if (reportOn === undefined) {
            return null;
        }

        if (!Array.isArray(reportOn) || reportOn.length === 0 || !reportOn.every(part => typeof part === 'string' || Array.isArray(part))) {
            throw NexoError.structure('DOMQL2020', "A watch's reportOn is a list of the parts it reports on, each a field's name or a list of path items", {});
        }

        return reportOn.map(part => {
            const relative = typeof part === 'string' ? [part] : part;

            nexo.paths.validate(relative);

            return [...path, ...relative];
        });
    }

    /** The window's timers, which a delayed schedule and a throttle wait on. */
    static #timersOf(window) {
        return { set: (callback, delay) => window.setTimeout(callback, delay), clear: timer => window.clearTimeout(timer) };
    }

    /**
     * Listens to the subscription's event source from the call on, so an event that follows the call is heard, and answers the event listener; a source that cannot start fails the call.
     * Each event is captured and projected through the object expression that follows the source, in the task the event is delivered in, and the handler receives the event listener and the result, or the failure. The source's receiver and arguments are evaluated once, as listening starts.
     * An event source of a behavior is DOMQL's to carry out: it listens to the occurrences every instance of the behavior running for its owner on its receiver delivers, now or later.
     * Its reactions are carried out as each event is projected, within its delivery, before the handler receives the event with a promise of each one's result.
     */
    static #subscribe(query, handler, { window = globalThis.window, owner = null, signal, reactions, throttle }) {
        if (typeof handler !== 'function') {
            throw NexoError.structure('DOMQL2007', 'A subscription takes the function that handles each event', {});
        }

        if (throttle !== undefined && !Domql.#isInterval(throttle)) {
            throw NexoError.structure('DOMQL2017', "A subscription's throttle is the interval it hands its handler at most one event in, a number of milliseconds above 0", {});
        }

        if (throttle !== undefined && reactions !== undefined) {
            throw NexoError.structure('DOMQL2018', 'A subscription that reacts to its events hands its handler every event its reactions ran for, so it takes no throttle', {});
        }

        const react = reactions === undefined ? null : Domql.#reactionsOf(reactions, window, owner);
        const resolution = Domql.#resolveFor('subscribe', query);
        const environment = Domql.#createEnvironment(window, owner);

        return new EventListener({
            evaluator: Domql.#createEvaluator(query, resolution, environment, () => Domql.#resolveFor('subscribe', query)),
            sourceOf: call => {
                const { module, behavior } = DispatchTable.get(call.declaration);

                if (behavior !== null) {
                    return deliver => Domql.#behaviors.listen({ module, behavior, source: call.declaration.name, owner, receiver: call.receiver }, deliver);
                }

                const start = Domql.#implementationOf(call);

                return deliver => start({ receiver: call.receiver, args: call.args, env: environment, deliver });
            },
            getLocation: pointer => resolution.getLocation(pointer),
            observations: Domql.#getObservations(window),
            reportError: Domql.#createErrorReporter(window),
            handler,
            react,
            throttle: throttle ?? null,
            timers: throttle === undefined ? undefined : Domql.#timersOf(window),
            signal,
        });
    }

    /**
     * What carries out a subscription's reactions for an event, in their order, each a once execution bound to its own values and `event`, the event's projected value, for the subscription's owner in its window, and
     * answers a promise of each one's result, frozen in a list; a list holding anything but query objects this instance made is refused.
     */
    static #reactionsOf(reactions, window, owner) {
        if (!Array.isArray(reactions) || !reactions.every(reaction => DomqlQuery.isQuery(reaction))) {
            throw NexoError.structure('DOMQL2015', "A subscription's reactions are a list of query objects this instance made, each ending in a once execution", {});
        }

        const fixed = [...reactions];
        const options = { window, owner };
        const carryOut = (reaction, value) => {
            try {
                return Domql.#executeAsync(reaction.with({ ...DomqlQuery.valuesOf(reaction), event: value }), options);
            } catch (error) {
                return Promise.reject(error);
            }
        };

        return value => Object.freeze(fixed.map(reaction => carryOut(reaction, value)));
    }

    /**
     * Carries out the once execution the request ends in and answers a promise of its result, an immutable snapshot containing no live DOM references, read through the object expression that follows the execution where one does.
     * Its host call is prepared first; a failure there rejects and executes nothing, and a skipped preparation, where the receiver is null or an argument whose parameter propagates null is null, executes nothing and resolves
     * to null. The execution's implementation receives
     * the signal, and may answer its result or a promise of it, which Nexo captures as the type the execution declares; one that declares none resolves to null. A failure of the execution rejects with an evaluation error whose cause
     * is what it threw. A signal that aborts rejects with its reason at once; the execution learns of it through the signal, its result is then discarded, and a failure it reports afterwards goes to the window's error reporting. DOMQL
     * never undoes what an execution changed. A command, a once execution reaching a behavior, finds the instance of that behavior running for its owner on its receiver, and rejects, executing nothing, where none runs.
     */
    static async #executeAsync(query, { window = globalThis.window, owner = null, signal }) {
        signal?.throwIfAborted();
        Domql.#refuseWhileEvaluating('An execution');

        const resolution = Domql.#resolveFor('executeAsync', query);
        const environment = Domql.#createEnvironment(window, owner);
        const evaluator = Domql.#createEvaluator(query, resolution, environment, () => Domql.#resolveFor('executeAsync', query));
        const call = evaluator.prepareHostCall();

        if (call.kind === 'skipped') {
            return null;
        }

        const location = resolution.getLocation(call.pointer);
        const { name } = call.declaration;
        const { module, behavior } = DispatchTable.get(call.declaration);
        const reached = behavior === null ? {} : { instance: Domql.#behaviors.find(module, behavior, owner, call.receiver) };
        let execute;

        // The functions the call keeps last as long as its implementation runs, which one never invoked never does.
        try {
            execute = Domql.#implementationOf(call);

            if (reached.instance === null) {
                throw NexoError.evaluation('DOMQL5016', `No '${behavior}' runs for this owner on this receiver, and the command '${name}' reaches its running instance alone`, location);
            }
        } catch (error) {
            call.dispose();

            throw error;
        }

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
                returnValue = execute({ receiver: call.receiver, args: call.args, env: environment, signal: signal ?? new AbortController().signal, ...reached });
            } catch (error) {
                call.dispose();
                settle(() => reject(createExecutionError(error)));

                return;
            }

            Promise.resolve(returnValue).then(result => {
                // The execution has ended, canceled or not, so the functions it kept end with it.
                call.dispose();

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
                call.dispose();

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
     * Its host call is prepared now; a skipped preparation, where the receiver is null or an argument whose parameter propagates null is null, has nothing to start until an update supplies one. An execution that cannot
     * start fails the call and leaves nothing running.
     * The execution runs for its owner, and its running instance is kept on its receiver for its module's commands. Its environment is the handle's, through every update.
     */
    static #run(query, { window = globalThis.window, owner = null, signal }) {
        Domql.#refuseWhileEvaluating('A continuous execution');

        const resolution = Domql.#resolveFor('run', query);
        const environment = Domql.#createEnvironment(window, owner);

        // An update binds the same definition anew, so it is validated, resolved and prepared as the first bindings were.
        const prepare = (request, resolved = Domql.#resolveFor('run', request)) => {
            const call = Domql.#createEvaluator(request, resolved, environment).prepareHostCall();
            const isPrepared = call.kind === 'prepared';

            return {
                declaration: resolved.hostCall.declaration,
                name: resolved.hostCall.name,
                disposeCall: isPrepared ? call.dispose : () => {},
                module: isPrepared ? DispatchTable.get(call.declaration).module : null,
                sources: isPrepared ? DispatchTable.sourcesOf(call.declaration) : null,
                start: isPrepared ? Domql.#implementationOf(call) : undefined,
                receiver: isPrepared ? call.receiver : null,
                args: isPrepared ? call.args : null,
                environment,
                location: resolved.getLocation(call.pointer),
            };
        };

        return new ExecutionHandle({
            execution: prepare(query, resolution),
            prepare: bindings => prepare(query.with(bindings)),
            reportError: Domql.#createErrorReporter(window),
            behaviors: Domql.#behaviors,
            owner,
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
            try {
                resolution = Domql.#moduleRegistry.resolve(query.definition, bindings);
            } catch (error) {
                throw Domql.#unloadedImportOf(query.definition, error) ?? error;
            }

            resolutions.set(bindings.resolutionKey, resolution);
        }

        if (options.watch === true && resolution.hostCall === null) {
            Domql.#checkWatch(resolution, options.acceptPartialObservation === true);
        }

        return resolution;
    }

    /** The refusal of an import naming a module loaded on request that is not loaded yet, where Nexo refused an import of a module the registry does not hold; null for any other failure. */
    static #unloadedImportOf(definition, error) {
        if (error?.code !== 'NEXO3002') {
            return null;
        }

        const moduleNames = Domql.#moduleRegistry.moduleNames;
        const index = definition.imports.findIndex(({ module }) => !moduleNames.includes(module) && Domql.#moduleLoaders.has(module));

        if (index === -1) {
            return null;
        }

        const { module } = definition.imports[index];

        return NexoError.validation('DOMQL3007', `'import ${module}' names a module loaded on request, which is not loaded yet; await domql.loadModulesAsync before carrying the query out`, nexo.getLocation(definition, `/imports/${index}`));
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

    /** Refuses a path that does not fit the result of a request that gives a value; the empty path reaches the whole result, which every such request has, so only a part's path is checked. */
    static #checkPath(resolution, path) {
        if (path.length > 0) {
            resolution.typeAt(path);
        }
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

        // A call prepared again projects alone, so it keeps none of the functions its arguments give.
        again.dispose?.();

        if (again.kind !== 'prepared' || again.declaration !== call.declaration) {
            throw NexoError.evaluation('DOMQL5015', `A module registered since made the request of '${call.declaration.name}' stale, and preparing it again reaches ${again.kind === 'prepared' ? 'another host call' : 'no host call'}; carry it out again`, location);
        }

        return again.project(result).value;
    }

    /**
     * Creates the environment of one operation, which every implementation the operation reaches receives as its `env`, from the operation's start to its end: the window and its document, which an evaluation needs; the
     * operation's owner; this instance of DOMQL; and the tools that observe, schedule and measure through the window's own, which refuse what reads alone must not do.
     */
    static #createEnvironment(window, owner) {
        if (!window?.document) {
            throw NexoError.evaluation('DOMQL5002', 'DOMQL cannot evaluate without a browser window. Pass a window explicitly when running outside a browser.', {});
        }

        return Object.freeze({ window, document: window.document, owner, domql, ...Domql.#servicesOf(window).tools });
    }

    /**
     * What the window's operations share, made at the first that needs it: its observations, whose implementations receive an environment of their own, which observes, schedules and measures whenever they ask, since an
     * observation's start runs as a query is evaluated; its animation frames; and the tools an operation's environment offers, which refuse to run while a query is evaluated, since a member's implementation reads alone.
     */
    static #servicesOf(window) {
        let services = Domql.#windowsServices.get(window);

        if (services === undefined) {
            const frames = new FrameSchedule(window, Domql.#createErrorReporter(window));
            const tools = {
                observe: (request, notify) => Domql.#observe(services.observations, request, notify),
                frame: (callback, options) => Domql.#requestFrame(window, frames, callback, options),
                measureUnder: (element, options, read) => Domql.#measureUnder(element, options, read),
            };
            const refusing = Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, (...args) => {
                Domql.#refuseWhileEvaluating(`env.${name}`);

                return tool(...args);
            }]));

            services = {
                observations: new Observations(Domql.#moduleRegistry, Object.freeze({ window, document: window.document, domql, ...tools })),
                frames,
                tools: Object.freeze(refusing),
            };
            Domql.#windowsServices.set(window, services);
        }

        return services;
    }

    /** Refuses what changes the page, or holds an observation, while a query is evaluated, since a member's implementation, and everything it calls, reads alone. */
    static #refuseWhileEvaluating(what) {
        if (QueryEvaluator.isEvaluating) {
            throw NexoError.evaluation('DOMQL5021', `${what} is refused while a query is evaluated, since a member's implementation reads alone; an observation type's implementation observes, schedules and measures through the environment it receives`, {});
        }
    }

    /**
     * Observes through the window's observations, which the watches of the window share: `{ type, target, …arguments }`, by an observation type a registered module declares, calling `notify` as the observation reports a
     * change, and answers what stops it and, for a maintained observation, its latest sample.
     */
    static #observe(observations, request, notify) {
        if (request === null || typeof request !== 'object' || typeof request.type !== 'string' || request.target === null || request.target === undefined || typeof notify !== 'function') {
            throw NexoError.structure('DOMQL2010', 'An observation module code holds names its type and its target, { type, target, …arguments }, and takes the function it notifies', {});
        }

        const { type, target, ...args } = request;
        const session = observations.acquire({ type, target, arguments: args }, notify);

        return session.contract === 'maintained' ? Object.freeze({ stop: () => session.dispose(), sample: () => session.sample() }) : Object.freeze({ stop: () => session.dispose() });
    }

    /** Runs the callback in the window's next animation frame, among its writes, before the frame's reads, or among its reads, as its phase says, and answers what withdraws it. */
    static #requestFrame(window, frames, callback, { phase = 'write' } = {}) {
        if (typeof callback !== 'function' || !FRAME_PHASES.includes(phase) || typeof window.requestAnimationFrame !== 'function') {
            throw NexoError.structure('DOMQL2011', `A frame takes the function it runs, in its ${FRAME_PHASES.join(' or ')} phase, in a window that has animation frames`, {});
        }

        return Object.freeze(frames.request(callback, phase));
    }

    /** Reads an element under a class it lacks, restoring it afterwards, and drains this instance's mutation observers of the records the class's change caused. */
    static #measureUnder(element, { class: name } = {}, read) {
        if (element?.nodeType !== 1 || typeof name !== 'string' || name === '' || /[\t\n\f\r ]/.test(name) || typeof read !== 'function') {
            throw NexoError.structure('DOMQL2012', 'A transient measurement takes an element, the class it reads it under, { class }, one token, and the function that reads it', {});
        }

        return Domql.#mutationObservers.measureUnder(element, name, read);
    }

    /**
     * Creates the evaluator of a resolved request in its operation's environment; given how to resolve the request again, it evaluates and prepares through a current resolution where a registration made this one stale.
     */
    static #createEvaluator(query, resolution, environment, resolveAgain = null) {
        const createEvaluator = current => current.createEvaluator(DomqlQuery.bindingsOf(query), environment);

        return new QueryEvaluator(Domql.#moduleRegistry, createEvaluator(resolution), resolveAgain === null ? null : { resolution, resolveAgain, createEvaluator });
    }

    /** Returns the observations shared by everything carried out in the window, creating them on first use. */
    static #getObservations(window) {
        return Domql.#servicesOf(window).observations;
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

/** DOMQL: makes query objects, formats requests, registers the modules that extend the vocabulary and loads those loaded on request, and says which build it is and which specification it follows. */
export const domql = Object.freeze({
    query: (source, bindings, options) => Domql.query(source, bindings, options),
    format: source => Domql.format(source),
    createModule: (name, contents) => Domql.createModule(name, contents),
    registerModule: module => Domql.registerModule(module),
    registerModuleLoader: (name, load) => Domql.registerModuleLoader(name, load),
    loadModulesAsync: modules => Domql.loadModulesAsync(modules),
    info: Object.freeze({ versions: Object.freeze({ runtime: Versions.runtime, specification: Versions.specification, language: Versions.language }) }),
});

export { NexoError };
