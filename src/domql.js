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
import { Versions } from './Versions.mjs';
import { lexica, LexicaError } from '@formaui/lexica';

/**
 * How a request is resolved.
 * @typedef {object} DomqlResolveOptions
 * @property {boolean} [watch] Whether the query will be watched.
 * @property {boolean} [acceptPartialObservation] Whether a watch accepts members whose changes its observations only partly cover.
 */

/**
 * How a query is evaluated once.
 * @typedef {object} DomqlEvaluateOptions
 * @property {Window} [window] The window `window` stands for, and whose document `document` stands for; by default the environment's.
 */

/**
 * How a query is evaluated once, waiting for its maintained members.
 * @typedef {object} DomqlEvaluateAsyncOptions
 * @property {Window} [window] The window `window` stands for, and whose document `document` stands for; by default the environment's.
 * @property {AbortSignal} [signal] Cancels the evaluation, which then rejects with the signal's reason.
 */

/**
 * How a query is watched.
 * @typedef {object} DomqlWatchOptions
 * @property {'frame' | 'immediate'} [schedule] When an evaluation follows a change: at the next animation frame, once however many observations fired, or, without waiting for an animation frame, in a microtask the first invalidation queues, which the invalidations received before it begins share.
 * @property {'snapshot' | 'liveState'} [updateStrategy] What the watch's events carry: each snapshot whole, or one object the watch keeps current in place, which keeps its identity.
 * @property {boolean} [acceptPartialObservation] Whether the watch accepts a member whose observations only partly cover its changes.
 * @property {AbortSignal} [signal] Disposes the watch when it aborts.
 * @property {Window} [window] The window `window` stands for, and whose document `document` stands for; by default the environment's.
 */

/**
 * How a subscription is listened to, or an action executed, or a behavior applied.
 * @typedef {object} DomqlOperationOptions
 * @property {Window} [window] The window `window` stands for, and whose document `document` stands for; by default the environment's.
 * @property {AbortSignal} [signal] Ends what the operation started when it aborts.
 */

/** Each operation that carries a request out: the kind of request it takes, and what a refusal says it was asked to do. */
const OPERATIONS = {
    evaluate: { kind: 'value', verb: 'evaluate' },
    evaluateAsync: { kind: 'value', verb: 'evaluate' },
    watch: { kind: 'value', verb: 'watch' },
    subscribe: { kind: 'subscription', verb: 'subscribe to' },
    executeAsync: { kind: 'action', verb: 'execute' },
    apply: { kind: 'behavior', verb: 'apply' },
};

/** What a request of each kind does, and the operations it takes, for a refusal to say. */
const REQUEST_KINDS = {
    value: { does: 'it produces a value', takes: 'evaluate(), evaluateAsync() or watch()' },
    subscription: { does: 'it listens to events', takes: 'subscribe()' },
    action: { does: 'it executes an effect', takes: 'executeAsync()' },
    behavior: { does: 'it applies a behavior', takes: 'apply()' },
};

/** When a watch evaluates after a change, and what its events carry. */
const WATCH_SCHEDULES = ['frame', 'immediate'];
const WATCH_UPDATE_STRATEGIES = ['snapshot', 'liveState'];

class Domql {
    static #moduleRegistry = lexica.createRegistry([BrowserModule.create()]);

    /**
     * The resolutions of each definition, by the resolution key of the bindings they were made against, valid for the registry revision they were made at and released with the definition.
     * Queries that share a definition, as those made from the same text do, and whose bindings have one resolution key, share its resolution; a watch's policy is checked against it each time.
     * @type {WeakMap<object, { revision: number, byKey: Map<string, object> }>}
     */
    static #resolutionsByDefinition = new WeakMap();

    /**
     * The observations of each window, so requests carried out in one window share the observations they have in common.
     * @type {WeakMap<Window, Observations>}
     */
    static #observationsByWindow = new WeakMap();

    /** What carries out the operations of the query objects this instance makes. @type {import('./dom/DomqlQuery.mjs').QueryOperations} */
    static #operations = Object.freeze({
        resolve: (query, options) => Domql.#resolvedDefinitionOf(Domql.#resolve(query, options ?? {})),
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
            return new DomqlQuery(lexica.parse(source), lexica.bind(bindings), Domql.#operations);
        }

        if (source instanceof DomqlQuery) {
            throw LexicaError.structure('A query object is made from text or a definition; one is bound anew with query.with(bindings)', {});
        }

        if (typeof source?.with === 'function') {
            throw LexicaError.structure('A query object is made from text or a definition; one another DOMQL instance made is made here from its definition, as domql.query(query.definition, bindings)', {});
        }

        return new DomqlQuery(lexica.validate(source), lexica.bind(bindings), Domql.#operations);
    }

    /**
     * The canonical text of a request, given as its text, its definition or a query object, which the three give alike. It parses and checks the structure as `query` does, and needs no bindings and no registered vocabulary, since it resolves nothing; formatting the text it gives gives that text again.
     * Comments and the original layout are discarded, as a definition holds neither, and the order of the locals and the fields is kept.
     * @param {string | object | DomqlQuery} source The request's text, its definition, or a query object this instance made.
     * @returns {string}
     */
    static format(source) {
        if (source instanceof DomqlQuery) {
            return lexica.format(source.definition);
        }

        if (typeof source?.with === 'function') {
            throw LexicaError.structure('A query object another DOMQL instance made is formatted from its definition, as domql.format(query.definition)', {});
        }

        return lexica.format(source);
    }

    /**
     * Creates a module from the vocabulary it declares, each declaration that runs code carrying its implementation.
     * @param {string} name The module's name.
     * @param {object} contents What the module declares.
     */
    static createModule(name, contents) {
        return lexica.createModule(name, contents);
    }

    /** Registers a module's vocabulary, which every request resolved afterwards may use. */
    static registerModule(module) {
        Domql.#moduleRegistry.registerModule(module);
    }

    /** Evaluates the query once, synchronously, answering the part of its result the path reaches. */
    static #evaluate(query, path, { window = globalThis.window }) {
        const resolution = Domql.#resolveFor('evaluate', query);

        resolution.typeAt(path);

        return lexica.paths.valueAt(Domql.#createEvaluator(query, resolution, window).evaluateOnce(), path);
    }

    /**
     * Evaluates the query once, waiting for the first sample of every maintained member it reads, and answers a promise of the part of its result the path reaches.
     * The query is evaluated again as samples arrive and as what it depends on changes, until an evaluation reads no pending member; every observation it started is released when it settles, fails or is canceled.
     */
    static async #evaluateAsync(query, path, { window = globalThis.window, signal }) {
        signal?.throwIfAborted();

        const resolution = Domql.#resolveFor('evaluateAsync', query);

        resolution.typeAt(path);

        const evaluator = Domql.#createEvaluator(query, resolution, window);
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
                    settle(() => resolve(lexica.paths.valueAt(next.value, path)));
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
            throw LexicaError.structure(`A watch is scheduled as ${WATCH_SCHEDULES.join(' or ')}`, {});
        }

        if (!WATCH_UPDATE_STRATEGIES.includes(updateStrategy)) {
            throw LexicaError.structure(`The update strategy of a watch is ${WATCH_UPDATE_STRATEGIES.join(' or ')}`, {});
        }

        if (updateStrategy === 'liveState' && path.length > 0) {
            throw LexicaError.structure('A selection is watched as snapshots alone; write the smaller result in DOMQL to keep it as live state', {});
        }

        const resolution = Domql.#resolveFor('watch', query, { watch: true, acceptPartialObservation: acceptPartialObservation === true });

        // Live state is one object that keeps its identity, which null and a single value have none of.
        // The type's notation tells it: a nullable type ends in `?`, an object type is written in braces and a list as `list<…>`.
        if (updateStrategy === 'liveState' && (resolution.type.endsWith('?') || !(resolution.type.startsWith('{') || resolution.type.startsWith('list<')))) {
            throw LexicaError.validation(`Live state keeps one object current, so its result is an object or a list that is never null, and this one is ${resolution.type}; put it in a top-level object expression`, Domql.#locationOf(query));
        }

        resolution.typeAt(path);

        const evaluator = Domql.#createEvaluator(query, resolution, window);

        if (schedule === 'frame' && typeof window.requestAnimationFrame !== 'function') {
            throw LexicaError.structure("A watch scheduled by animation frame needs a window that has them; schedule it as 'immediate' otherwise", {});
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
            throw LexicaError.structure('A subscription takes the function that handles each event', {});
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
        const createActionError = error => LexicaError.evaluation(`The action '${action.name}' failed: ${error?.message ?? String(error)}`, action.location, { cause: error });

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
                returnValue = action.execute({ receiver: action.receiver, args: action.args, env: action.environment, signal: signal ?? new AbortController().signal });
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
     * Applies the behavior, which has started once the call returns, and answers its handle, which belongs to the caller. Disposing the handle ends the behavior and leaves its module registered.
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

    /** The resolved definition `query.resolve` answers for each resolution, its declared fields alone, one for each resolution so that a resolution reused answers the same object. @type {WeakMap<object, object>} */
    static #resolvedDefinitions = new WeakMap();

    /** The declared fields of a resolution, frozen, holding none of the resolution itself, so its evaluator and what else Lexica gives a host stay DOMQL's own. */
    static #resolvedDefinitionOf(resolution) {
        let resolvedDefinition = Domql.#resolvedDefinitions.get(resolution);

        if (resolvedDefinition === undefined) {
            resolvedDefinition = Object.freeze({
                definition: resolution.definition,
                kind: resolution.kind,
                type: resolution.type,
                usedDeclarations: resolution.usedDeclarations,
                typeAt: path => resolution.typeAt(path),
                locate: pointer => resolution.locate(pointer),
            });
            Domql.#resolvedDefinitions.set(resolution, resolvedDefinition);
        }

        return resolvedDefinition;
    }

    static #resolve(query, options) {
        const revision = Domql.#moduleRegistry.revision;
        let resolutions = Domql.#resolutionsByDefinition.get(query.definition);

        if (resolutions === undefined || resolutions.revision !== revision) {
            resolutions = { revision, byKey: new Map() };
            Domql.#resolutionsByDefinition.set(query.definition, resolutions);
        }

        const bindings = DomqlQuery.bindingsOf(query);
        let resolution = resolutions.byKey.get(bindings.resolutionKey);

        if (resolution === undefined) {
            resolution = Domql.#moduleRegistry.resolve(query.definition, bindings);
            resolutions.byKey.set(bindings.resolutionKey, resolution);
        }

        if (options.watch === true && resolution.kind === 'value') {
            Domql.#checkWatch(resolution, options.acceptPartialObservation === true);
        }

        return resolution;
    }

    /**
     * Refuses a watch over a member whose changes no observation covers, and one over a member whose observations cover its changes in part unless the watch accepts partial observation, naming each at the first place it is used.
     * Lexica tells how each declaration the request uses changes; what may be watched is DOMQL's to decide.
     */
    static #checkWatch(resolution, acceptsPartialObservation) {
        const { usedDeclarations } = resolution;
        const unobserved = usedDeclarations.filter(use => use.declaration.updates?.changes === 'unobserved');

        if (unobserved.length > 0) {
            throw LexicaError.validation(`A watch cannot follow ${unobserved.map(use => `'${use.name}'`).join(', ')}, which name no observations`, resolution.locate(unobserved[0].pointer));
        }

        const partlyObservableUses = usedDeclarations.filter(use => use.declaration.updates?.changes === 'partly-observable');

        if (partlyObservableUses.length > 0 && !acceptsPartialObservation) {
            const missesByName = [...new Map(partlyObservableUses.map(use => [use.name, use.declaration.updates.misses])).entries()];

            throw LexicaError.validation(`A watch over ${missesByName.map(([name, misses]) => `'${name}' (which misses ${misses})`).join(', ')} is refused unless the watch accepts partial observation`, resolution.locate(partlyObservableUses[0].pointer));
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
        const { kind, verb } = OPERATIONS[operation];

        if (resolution.kind !== kind) {
            const { does, takes } = REQUEST_KINDS[resolution.kind];

            throw LexicaError.validation(`Cannot ${verb} '${lexica.quote(query.definition)}': ${does}.\nUse ${takes}.`, Domql.#locationOf(query));
        }

        return resolution;
    }

    /** Where the request stands, for a failure that belongs to the whole of it. */
    static #locationOf(query) {
        return lexica.locate(query.definition, '/expression');
    }

    /** Creates the evaluator of a resolved request in its window, which an evaluation needs. */
    static #createEvaluator(query, resolution, window) {
        if (!window?.document) {
            throw LexicaError.evaluation('DOMQL cannot evaluate without a browser window. Pass a window explicitly when running outside a browser.', {});
        }

        return new QueryEvaluator(Domql.#moduleRegistry, resolution.createEvaluator(DomqlQuery.bindingsOf(query), { window, document: window.document }));
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

export { LexicaError };
