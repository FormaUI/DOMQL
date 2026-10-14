/**
 * domql — makes query objects from text or a definition, through which every request is evaluated, watched, subscribed to, executed or applied, and registers the modules that extend the vocabulary
 */

import { SnapshotComparer } from './snapshots/SnapshotComparer.mjs';
import { Behavior } from './dom/Behavior.mjs';
import { BrowserModule } from './dom/BrowserModule.mjs';
import { DomqlQuery } from './dom/DomqlQuery.mjs';
import { Observations } from './dom/Observations.mjs';
import { QueryEvaluator } from './dom/QueryEvaluator.mjs';
import { EventListener } from './dom/EventListener.mjs';
import { Watch } from './dom/Watch.mjs';
import { DefinitionValidator } from './language/DefinitionValidator.mjs';
import { DefinitionWriter } from './language/DefinitionWriter.mjs';
import { DomqlError } from './language/DomqlError.mjs';
import { DomqlModule } from './language/vocabulary/DomqlModule.mjs';
import { LanguageResolver } from './language/LanguageResolver.mjs';
import { ModuleRegistry } from './language/vocabulary/ModuleRegistry.mjs';
import { ParameterBindings } from './language/ParameterBindings.mjs';
import { ParsedTexts } from './language/ParsedTexts.mjs';
import { ResultPath } from './language/ResultPath.mjs';
import { Specification } from './language/Specification.mjs';

/**
 * How a request is resolved.
 * @typedef {object} DomqlResolveOptions
 * @property {boolean} [watch] Whether the query will be watched.
 * @property {boolean} [acceptPartialObservation] Whether a watch accepts members whose changes its observations only partly cover.
 */

/**
 * How a query is evaluated once.
 * @typedef {object} DomqlEvaluateOptions
 * @property {Window} [window] The window `@window` stands for, and whose document `@document` stands for; by default the environment's.
 */

/**
 * How a query is evaluated once, waiting for its maintained members.
 * @typedef {object} DomqlEvaluateAsyncOptions
 * @property {Window} [window] The window `@window` stands for, and whose document `@document` stands for; by default the environment's.
 * @property {AbortSignal} [signal] Cancels the evaluation, which then rejects with the signal's reason.
 */

/**
 * How a query is watched.
 * @typedef {object} DomqlWatchOptions
 * @property {'frame' | 'immediate'} [schedule] When an evaluation follows a change: at the next animation frame, once however many observations fired, or in the task that reported it.
 * @property {'snapshot' | 'liveState'} [updateStrategy] What the watch's events carry: each snapshot whole, or one object the watch keeps current in place, which keeps its identity.
 * @property {boolean} [acceptPartialObservation] Whether the watch accepts a member whose observations only partly cover its changes.
 * @property {AbortSignal} [signal] Disposes the watch when it aborts.
 * @property {Window} [window] The window `@window` stands for, and whose document `@document` stands for; by default the environment's.
 */

/**
 * How a subscription is listened to, or an action executed, or a behavior applied.
 * @typedef {object} DomqlOperationOptions
 * @property {Window} [window] The window `@window` stands for, and whose document `@document` stands for; by default the environment's.
 * @property {AbortSignal} [signal] Ends what the operation started when it aborts.
 */

/** Each operation that carries a request out: the kind of request it takes, and what a refusal says it was asked to do. */
const OPERATIONS = {
    evaluate: { kind: 'query', verb: 'evaluate' },
    evaluateAsync: { kind: 'query', verb: 'evaluate' },
    watch: { kind: 'query', verb: 'watch' },
    subscribe: { kind: 'subscription', verb: 'subscribe to' },
    executeAsync: { kind: 'action', verb: 'execute' },
    apply: { kind: 'behavior', verb: 'apply' },
};

/** What a request of each kind does, and the operations it takes, for a refusal to say. */
const REQUEST_KINDS = {
    query: { does: 'it produces a value', takes: 'evaluate(), evaluateAsync() or watch()' },
    subscription: { does: 'it listens to events', takes: 'subscribe()' },
    action: { does: 'it executes an effect', takes: 'executeAsync()' },
    behavior: { does: 'it applies a behavior', takes: 'apply()' },
};

/**
 * The version of this build of the library: the package's version, which bundling sets, or, where DOMQL runs from its sources, the library's version marked as source by its build metadata.
 * @type {string}
 */
const LIBRARY_VERSION = typeof DOMQL_VERSION === 'string' ? DOMQL_VERSION : '1.0.0-alpha+source';

/** When a watch evaluates after a change, and what its events carry. */
const WATCH_SCHEDULES = ['frame', 'immediate'];
const WATCH_UPDATE_STRATEGIES = ['snapshot', 'liveState'];

class Domql {
    static #moduleRegistry = new ModuleRegistry([BrowserModule.create()]);

    /**
     * The resolutions of each definition, by the options they were made under and the resolution key of the bindings they were made against, valid for the registry revision they were made at and released with the definition.
     * Queries that share a definition, as those made from the same text do, and whose bindings have one resolution key, share its resolution.
     * @type {WeakMap<object, { revision: number, byKey: Map<string, import('./language/ResolvedDefinition.mjs').ResolvedDefinition> }>}
     */
    static #resolutionsByDefinition = new WeakMap();

    /**
     * The observations of each window, so requests carried out in one window share the observations they have in common.
     * @type {WeakMap<Window, Observations>}
     */
    static #observationsByWindow = new WeakMap();

    /** What carries out the operations of the query objects this instance makes. @type {import('./dom/DomqlQuery.mjs').QueryOperations} */
    static #operations = Object.freeze({
        resolve: (query, options) => Domql.#resolve(query, options ?? {}),
        evaluate: (query, path, options) => Domql.#evaluate(query, path, options ?? {}),
        evaluateAsync: (query, path, options) => Domql.#evaluateAsync(query, path, options ?? {}),
        watch: (query, path, options) => Domql.#watch(query, path, options ?? {}),
        subscribe: (query, handler, options) => Domql.#subscribe(query, handler, options ?? {}),
        executeAsync: (query, options) => Domql.#executeAsync(query, options ?? {}),
        apply: (query, options) => Domql.#apply(query, options ?? {}),
    });

    /**
     * Makes a query object from a request's text or its definition, binding its parameters. It parses the text, a text being parsed once and its definition reused for identical text, and checks the structure; it evaluates nothing and has no effect.
     * A query object of another DOMQL instance is refused, with how to make it here from its definition.
     * @param {string | object} source The request's text, or its definition.
     * @param {Record<string, unknown>} [bindings] The values supplied by parameter name.
     * @returns {DomqlQuery}
     */
    static query(source, bindings = {}) {
        if (typeof source === 'string') {
            return new DomqlQuery(ParsedTexts.parse(source), new ParameterBindings(bindings), Domql.#operations);
        }

        if (source instanceof DomqlQuery) {
            throw DomqlError.structure('A query object is made from text or a definition; one is bound anew with query.with(bindings)', {});
        }

        if (typeof source?.with === 'function') {
            throw DomqlError.structure('A query object is made from text or a definition; one another DOMQL instance made is made here from its definition, as domql.query(query.definition, bindings)', {});
        }

        return new DomqlQuery(new DefinitionValidator().validate(source), new ParameterBindings(bindings), Domql.#operations);
    }

    /**
     * The canonical text of a request, given as its text, its definition or a query object, which the three give alike. It parses and checks the structure as `query` does, and needs no bindings and no registered vocabulary, since it resolves nothing; formatting the text it gives gives that text again.
     * Comments and the original layout are discarded, as a definition holds neither, and the order of the locals and the fields is kept.
     * @param {string | object | DomqlQuery} source The request's text, its definition, or a query object this instance made.
     * @returns {string}
     */
    static format(source) {
        if (source instanceof DomqlQuery) {
            return DefinitionWriter.format(source.definition.query);
        }

        if (typeof source?.with === 'function') {
            throw DomqlError.structure('A query object another DOMQL instance made is formatted from its definition, as domql.format(query.definition)', {});
        }

        const definition = typeof source === 'string' ? ParsedTexts.parse(source) : new DefinitionValidator().validate(source);

        return DefinitionWriter.format(definition.query);
    }

    /**
     * Creates a module from the vocabulary it declares and the functions that carry the members out.
     * @param {string} name The module's name.
     * @param {object} contents What the module declares.
     * @param {Record<string, Function> | null} functions The functions the members name.
     */
    static createModule(name, contents, functions = null) {
        return new DomqlModule(name, contents, functions);
    }

    /** Registers a module's vocabulary, which every request resolved afterwards may use. */
    static registerModule(module) {
        Domql.#moduleRegistry.registerModule(module);
    }

    /** Evaluates the query once, synchronously, answering the part of its result the path reaches. */
    static #evaluate(query, path, { window = globalThis.window }) {
        const resolvedDefinition = Domql.#resolveFor('evaluate', query);

        Domql.#typeAt(query, resolvedDefinition, path);

        return ResultPath.valueAt(Domql.#createEvaluator(query, resolvedDefinition, window).evaluateOnce(), path);
    }

    /**
     * Evaluates the query once, waiting for the first sample of every maintained member it reads, and answers a promise of the part of its result the path reaches.
     * The query is evaluated again as samples arrive and as what it depends on changes, until an evaluation reads no pending member; every observation it started is released when it settles, fails or is canceled.
     */
    static async #evaluateAsync(query, path, { window = globalThis.window, signal }) {
        signal?.throwIfAborted();

        const resolvedDefinition = Domql.#resolveFor('evaluateAsync', query);

        Domql.#typeAt(query, resolvedDefinition, path);

        const evaluator = Domql.#createEvaluator(query, resolvedDefinition, window);
        const observations = Domql.#getObservations(window);
        const reportError = Domql.#createErrorReporter(window);

        return new Promise((resolve, reject) => {
            let queryEvaluation = null;
            let isScheduled = false;
            let isSettled = false;

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

                const next = evaluator.evaluate({ observations, onChange: schedule });

                // The next evaluation holds its observations before the last releases its own, so one both need keeps running.
                release(queryEvaluation);
                queryEvaluation = next;

                if (next.error !== null) {
                    settle(() => reject(next.error));
                } else if (!next.isPending) {
                    settle(() => resolve(ResultPath.valueAt(next.value, path)));
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
            throw DomqlError.structure(`A watch is scheduled as ${WATCH_SCHEDULES.join(' or ')}`, {});
        }

        if (!WATCH_UPDATE_STRATEGIES.includes(updateStrategy)) {
            throw DomqlError.structure(`The update strategy of a watch is ${WATCH_UPDATE_STRATEGIES.join(' or ')}`, {});
        }

        if (updateStrategy === 'liveState' && path.length > 0) {
            throw DomqlError.structure('A selection is watched as snapshots alone; write the smaller result in DOMQL to keep it as live state', {});
        }

        const resolvedDefinition = Domql.#resolveFor('watch', query, { watch: true, acceptPartialObservation: acceptPartialObservation === true });

        // Live state is one object that keeps its identity, which null and a single value have none of.
        if (updateStrategy === 'liveState' && (resolvedDefinition.type.isNullable || (resolvedDefinition.type.kind !== 'object' && resolvedDefinition.type.kind !== 'list'))) {
            throw DomqlError.validation(`Live state keeps one object current, so its result is an object or a list that is never null, and this one is ${resolvedDefinition.type}; put it in a top-level object expression`, Domql.#locationOf(query));
        }

        Domql.#typeAt(query, resolvedDefinition, path);

        const evaluator = Domql.#createEvaluator(query, resolvedDefinition, window);

        if (schedule === 'frame' && typeof window.requestAnimationFrame !== 'function') {
            throw DomqlError.structure("A watch scheduled by animation frame needs a window that has them; schedule it as 'immediate' otherwise", {});
        }

        return new Watch({
            evaluator,
            observations: Domql.#getObservations(window),
            comparer: new SnapshotComparer(resolvedDefinition),
            window,
            reportError: Domql.#createErrorReporter(window),
            checkPath: selected => Domql.#typeAt(query, resolvedDefinition, selected),
            options: { schedule, updateStrategy, path, signal },
        });
    }

    /**
     * Listens to the subscription's event source from the call on, so an event that follows the call is heard, and answers the event listener; a source that cannot start fails the call.
     * Each event is captured and projected through the object expression that follows the source, in the task the event is delivered in, and the handler receives the event listener and the result, or the failure. The source's receiver and arguments are evaluated once, as listening starts.
     */
    static #subscribe(query, handler, { window = globalThis.window, signal }) {
        if (typeof handler !== 'function') {
            throw DomqlError.structure('A subscription takes the function that handles each event', {});
        }

        return new EventListener({
            evaluator: Domql.#createEvaluator(query, Domql.#resolveFor('subscribe', query), window),
            observations: Domql.#getObservations(window),
            reportError: Domql.#createErrorReporter(window),
            handler,
            signal,
        });
    }

    /**
     * Executes the action once and answers a promise of its result, an immutable snapshot containing no live DOM references, read through the object expression that follows the action where one does.
     * The receiver and arguments are evaluated first; a failure there rejects and executes nothing, and where one of them is null the action is not executed and its result is null. The action's function receives the signal, and may answer its result or a promise of it, which must be of the type the action declares.
     * A failure of the action rejects with an evaluation error whose cause is what it threw. A signal that aborts rejects with its reason at once; the action learns of it through the signal, its result is then discarded, and a failure it reports afterwards goes to the window's error reporting. DOMQL never undoes what an action changed.
     */
    static async #executeAsync(query, { window = globalThis.window, signal }) {
        signal?.throwIfAborted();

        const evaluator = Domql.#createEvaluator(query, Domql.#resolveFor('executeAsync', query), window);
        const action = evaluator.resolveAction();

        if (action === null) {
            return evaluator.projectResult(null, { wasExecuted: false });
        }

        const reportError = Domql.#createErrorReporter(window);
        const createActionError = error => DomqlError.evaluation(`The action '${action.name}' failed: ${error?.message ?? String(error)}`, action.location, { cause: error });

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
                returnValue = action.execute(action.receiver, action.args, action.environment, { signal: signal ?? new AbortController().signal });
            } catch (error) {
                settle(() => reject(createActionError(error)));

                return;
            }

            Promise.resolve(returnValue).then(result => {
                // A result that arrives after the execution was canceled is discarded.
                if (isSettled) {
                    return;
                }

                let value;

                try {
                    value = evaluator.projectResult(result);
                } catch (error) {
                    settle(() => reject(error));

                    return;
                }

                settle(() => resolve(value));
            }, error => {
                // No caller waits for a failure that arrives after the execution was canceled, so it goes to the error reporting.
                if (isSettled) {
                    reportError(createActionError(error));
                } else {
                    settle(() => reject(createActionError(error)));
                }
            });
        });
    }

    /**
     * Applies the behavior, which is in effect once the call returns, and answers its handle, which belongs to the caller. Disposing the handle ends the behavior and leaves its module registered.
     * The receiver and arguments are evaluated now; where one of them is null there is nothing to apply until an update supplies one. A behavior that cannot start fails the call and leaves nothing running.
     */
    static #apply(query, { window = globalThis.window, signal }) {
        const resolveBehavior = request => Domql.#createEvaluator(request, Domql.#resolveFor('apply', request), window).resolveBehavior();

        return new Behavior({
            call: resolveBehavior(query),
            // An update binds the same definition anew, so it is validated and resolved as the first bindings were.
            prepare: bindings => resolveBehavior(query.with(bindings)),
            reportError: Domql.#createErrorReporter(window),
            signal,
        });
    }

    static #resolve(query, options) {
        const revision = Domql.#moduleRegistry.revision;
        let resolutions = Domql.#resolutionsByDefinition.get(query.definition);

        if (resolutions === undefined || resolutions.revision !== revision) {
            resolutions = { revision, byKey: new Map() };
            Domql.#resolutionsByDefinition.set(query.definition, resolutions);
        }

        const key = `${options.watch === true}|${options.acceptPartialObservation === true}|${query.bindings.resolutionKey}`;

        if (!resolutions.byKey.has(key)) {
            resolutions.byKey.set(key, new LanguageResolver(Domql.#moduleRegistry, query.bindings, ParsedTexts.locationsOf(query.definition), options).resolveDefinition(query.definition));
        }

        return resolutions.byKey.get(key);
    }

    /**
     * Resolves a request for the operation that carries it out, refusing it with a validation error that says what the request does and names the operations it takes, where it is not of the kind the operation takes, before anything is evaluated or started.
     * @param {keyof typeof OPERATIONS} operation
     * @param {DomqlQuery} query The request.
     * @param {DomqlResolveOptions} [options] How the request is resolved.
     */
    static #resolveFor(operation, query, options = {}) {
        const resolvedDefinition = Domql.#resolve(query, options);
        const { kind, verb } = OPERATIONS[operation];

        if (resolvedDefinition.kind !== kind) {
            const { does, takes } = REQUEST_KINDS[resolvedDefinition.kind];

            throw DomqlError.validation(`Cannot ${verb} '${DefinitionWriter.write(query.definition.query)}': ${does}.\nUse ${takes}.`, Domql.#locationOf(query));
        }

        return resolvedDefinition;
    }

    /** Refuses a path that does not fit the type of the query's result, finding where the request stands only when it does. */
    static #typeAt(query, resolvedDefinition, path) {
        return ResultPath.typeAt(resolvedDefinition.type, path, Domql.#moduleRegistry, () => Domql.#locationOf(query));
    }

    /** Where the request stands, for a failure that belongs to the whole of it. */
    static #locationOf(query) {
        return ParsedTexts.locationsOf(query.definition)?.locate('/query') ?? { pointer: '/query' };
    }

    /** Creates the evaluator of a resolved request in its window, which an evaluation needs. */
    static #createEvaluator(query, resolvedDefinition, window) {
        if (!window?.document) {
            throw DomqlError.evaluation('DOMQL cannot evaluate without a browser window. Pass a window explicitly when running outside a browser.', {});
        }

        return new QueryEvaluator(Domql.#moduleRegistry, resolvedDefinition, query.bindings, { window, document: window.document }, ParsedTexts.locationsOf(query.definition));
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
    createModule: (name, contents, functions) => Domql.createModule(name, contents, functions),
    registerModule: module => Domql.registerModule(module),
    info: Object.freeze({ version: LIBRARY_VERSION, specificationVersion: Specification.version }),
});

export { DomqlError };
