/**
 * Observations — opens sessions on observations, shares one underlying observation between equivalent requests, and stops it when its last session is disposed
 */

import { DomqlError } from '../language/DomqlError.mjs';
import { ObservationSession } from './ObservationSession.mjs';

/** The properties of an observation that are not arguments of its type. */
const OBSERVATION_PROPERTIES = new Set(['type', 'of']);

export class Observations {
    /** The names of the arguments each observation a declaration names gives its type, by the observation. @type {WeakMap<object, string[]>} */
    static #argumentNames = new WeakMap();

    #moduleRegistry;
    #environment;
    #reportError;

    /**
     * What is observed on each target, by the identity of the request: held while a holder holds it, so an observation outlives neither its sessions nor its target.
     * @type {WeakMap<object, Map<string, { observation: any, holders: Set<ObservationSession>, observed: Map<string, any>, key: string }>>}
     */
    #targets = new WeakMap();

    /** Every observation running, so they can all be ended. */
    #running = new Set();

    /** The numbers that tell objects apart in an identity. @type {WeakMap<object, number>} */
    #numbers = new WeakMap();
    #nextNumber = 1;
    #nextUnshared = 1;

    /**
     * @param {import('../language/vocabulary/ModuleRegistry.mjs').ModuleRegistry} moduleRegistry The vocabulary whose observation types start the observations.
     * @param {{ window: Window, document: Document }} environment The window the observations belong to; observations of two windows never share.
     * @param {{ reportError?: (error: unknown) => void }} [options] Where a failure of a holder's callback, or of stopping an observation, is reported, by default the window's. A failure of the report itself is dropped, so reporting never interrupts what reports.
     */
    constructor(moduleRegistry, environment, { reportError } = {}) {
        const report = reportError ?? (error => (environment.window.reportError ? environment.window.reportError(error) : console.error(error)));

        this.#moduleRegistry = moduleRegistry;
        this.#environment = environment;
        this.#reportError = error => {
            try {
                report(error);
            } catch {
                // Nothing is left to report to.
            }
        };
    }

    /**
     * Resolves an observation a declaration names against a call into the request to start: the type, the target the observation names, and its arguments with each argument it names replaced by its value.
     * Answers null where the target is an argument that is null, which has nothing to observe.
     * @param {object} observation The observation a declaration names.
     * @param {{ receiver: unknown, args: Record<string, unknown> }} call The call's receiver and its arguments by parameter name.
     */
    resolve(observation, { receiver, args }) {
        return this.resolveAt(observation, { args }, this.#targetOf(observation.of, receiver, args));
    }

    /**
     * Resolves an observation against a call at the target given, as `resolve` does at the target the observation names; null where the target is null.
     * A scope of several targets, `roots`, resolves to one request at each of them.
     * @param {object} observation The observation a declaration names.
     * @param {{ args: Record<string, unknown> }} call The call's arguments by parameter name.
     * @param {object | null | undefined} target What the request observes.
     */
    resolveAt(observation, { args }, target) {
        if (target === null || target === undefined) {
            return null;
        }

        const resolved = {};

        for (const [name, value] of Object.entries(observation)) {
            if (!OBSERVATION_PROPERTIES.has(name)) {
                resolved[name] = Observations.#resolveValue(value, args);
            }
        }

        return { type: observation.type, target, arguments: resolved };
    }

    /**
     * The values a request was resolved with, as a copy: its type, its target and its arguments, a list copied item by item, so a list the caller changes in place later is told apart.
     * @param {{ type: string, target: object, arguments: Record<string, any> }} request The request, as `resolve` answers it.
     */
    static valuesOf(request) {
        const values = {};

        for (const [name, value] of Object.entries(request.arguments)) {
            values[name] = Observations.#copy(value);
        }

        return { type: request.type, target: request.target, arguments: values };
    }

    /**
     * The root of the tree the node is in, as `getRootNode` answers it: its document, the shadow root it is in, or the top of a detached tree; null for anything that is no node.
     * @param {unknown} node The receiver.
     * @param {WeakMap<object, object>} [known] The roots already found of other nodes, which this adds to, so nodes of one tree walk it once; it lasts while the tree stays as it is.
     */
    static rootOf(node, known = new WeakMap()) {
        if (typeof node?.getRootNode !== 'function') {
            return null;
        }

        // A node whose parent's root is known, and is in the parent's tree, has that root.
        const parent = node.parentNode;
        const fromParent = parent === null || (parent.nodeType === 11 && parent.host !== undefined) ? undefined : known.get(parent);

        if (fromParent !== undefined) {
            return fromParent;
        }

        const steps = [];
        let root;

        for (let current = node; ;) {
            root = known.get(current);

            if (root !== undefined) {
                break;
            }

            const parent = current.parentNode;

            if (parent === null) {
                root = current;
                break;
            }

            steps.push(current);

            if (parent.nodeType === 11 && parent.host !== undefined) {
                root = parent;
                break;
            }

            current = parent;
        }

        steps.forEach(stepped => known.set(stepped, root));

        return root;
    }

    /**
     * The roots of the node's flat-tree ancestry, nearest first, each once, as the design defines them: stepping to the slot a node is assigned to, or from a shadow root to its host, or otherwise to its parent, the shadow root each step to a host leaves, the open shadow root of each host whose child a step leaves, and the node the steps end at.
     * A slot in a closed shadow root hides its assignment, so the roots past it are reached only from a node inside that root. Anything that is no node has none.
     * @param {unknown} node The receiver.
     * @param {WeakMap<object, object[]>} [known] The roots already found of other nodes, which this adds to, so nodes that share an ancestry walk it once; it lasts while the tree stays as it is.
     * @returns {object[]}
     */
    static rootsOf(node, known = new WeakMap()) {
        if (typeof node?.getRootNode !== 'function') {
            return [];
        }

        // A node whose parent's roots are known, and whose parent is no shadow root and hosts none, has those roots.
        const parent = node.parentNode;
        const fromParent = parent === null || parent.nodeType === 11 || (parent.shadowRoot ?? null) !== null ? undefined : known.get(parent);

        if (fromParent !== undefined) {
            return fromParent;
        }

        // Each step up adds the root it enters, if any, and goes on to where the flat tree continues, until a node whose roots are known or the top of a tree.
        const steps = [];
        let roots;

        for (let current = node; roots === undefined;) {
            roots = known.get(current);

            if (roots !== undefined) {
                break;
            }

            const parent = current.parentNode;

            if (parent === null) {
                roots = [current];
                known.set(current, roots);
            } else if (parent.nodeType === 11 && parent.host !== undefined) {
                // A shadow root is a document fragment with a host, where its tree's ancestry continues.
                steps.push({ node: current, entered: parent });
                current = parent.host;
            } else {
                // Only a host's child can be assigned to a slot, and a closed host's slots hide it.
                const shadowRoot = parent.shadowRoot ?? null;
                const slot = shadowRoot === null ? null : current.assignedSlot ?? null;

                steps.push({ node: current, entered: shadowRoot });
                current = slot ?? parent;
            }
        }

        for (let index = steps.length - 1; index >= 0; index--) {
            const { node: stepped, entered } = steps[index];

            if (entered !== null && !roots.includes(entered)) {
                roots = [entered, ...roots];
            }

            known.set(stepped, roots);
        }

        return roots;
    }

    /**
     * What the observation observes for the call: its receiver, its receiver's root, the window, the document, or an argument; a scope of several targets, `roots`, has none of its own.
     * @param {object} observation The observation a declaration names.
     * @param {unknown} receiver The call's receiver.
     * @param {Record<string, unknown>} args The call's arguments by parameter name.
     */
    targetOf(observation, receiver, args) {
        return this.#targetOf(observation.of, receiver, args);
    }

    /**
     * Whether resolving the observation against the call at the target would give the request the values were recorded from: the same type, the same target, and arguments the same by the rules an identity follows, a list item by item and an object by reference, with null and a missing value alike.
     * @param {object} observation The observation a declaration names.
     * @param {Record<string, unknown>} args The call's arguments by parameter name.
     * @param {object | null} target What the request would observe.
     * @param {{ type: string, target: object, arguments: Record<string, any> }} values The values, as `valuesOf` answers them.
     */
    static resolvesAt(observation, args, target, values) {
        if (observation.type !== values.type || target !== values.target) {
            return false;
        }

        for (const name of Observations.#argumentNamesOf(observation)) {
            if (!Observations.#resolvesValueTo(observation[name], args, values.arguments[name])) {
                return false;
            }
        }

        return true;
    }

    /** The names of the arguments the observation gives its type, found once for each observation a declaration names, which is frozen. */
    static #argumentNamesOf(observation) {
        let names = Observations.#argumentNames.get(observation);

        if (names === undefined) {
            names = Object.keys(observation).filter(name => !OBSERVATION_PROPERTIES.has(name));
            Observations.#argumentNames.set(observation, names);
        }

        return names;
    }

    /**
     * Holds the observation the request names, starting it where no equivalent request holds one, and answers the session.
     * @param {{ type: string, target: object, arguments: Record<string, any> } | null} request What to observe, as `resolve` answers it.
     * @param {() => void} onChange Called, synchronously, when something may have changed. What it returns is ignored: a promise it returns is not awaited, and a rejection of it is not caught here.
     */
    acquire(request, onChange) {
        if (request === null) {
            return ObservationSession.none();
        }

        const type = this.#moduleRegistry.getObservationType(request.type);

        if (type === undefined) {
            throw DomqlError.evaluation(`The observation type '${request.type}' is declared by no module`, {});
        }

        const key = type.shared ? this.#identityOf(type, request) : `${type.name}#${this.#nextUnshared++}`;
        let observed = this.#targets.get(request.target);

        if (observed === undefined) {
            observed = new Map();
            this.#targets.set(request.target, observed);
        }

        let entry = observed.get(key);

        if (entry === undefined) {
            const created = { observation: null, holders: new Set(), observed, key };

            created.observation = this.#start(type, request, () => {
                for (const holder of [...created.holders]) {
                    holder.notify();
                }
            });
            entry = created;
            observed.set(key, entry);
            this.#running.add(entry);
        }

        const session = new ObservationSession({
            contract: type.contract,
            observation: entry.observation,
            onChange,
            end: ended => this.#end(entry, ended),
            reportError: this.#reportError,
        });

        entry.holders.add(session);

        return session;
    }

    /** Ends every observation and disposes every session, for a host that is done with the window. */
    dispose() {
        for (const entry of [...this.#running]) {
            for (const session of [...entry.holders]) {
                session.dispose();
            }
        }
    }

    /** How many observations are running, which ends with the last session of each. */
    get runningCount() {
        return this.#running.size;
    }

    #targetOf(scope, receiver, args) {
        switch (scope) {
            case 'receiver':
                return receiver;
            case 'root':
                return typeof receiver?.getRootNode === 'function' ? receiver.getRootNode() : null;
            case 'window':
                return this.#environment.window;
            case 'document':
                return this.#environment.document;
            default:
                return args[scope.argument];
        }
    }

    static #resolveValue(value, args) {
        if (Array.isArray(value)) {
            return value.map(item => Observations.#resolveValue(item, args));
        }

        if (value !== null && typeof value === 'object') {
            if (typeof value.argument !== 'string') {
                throw new TypeError('An observation gives literals, lists of them and arguments of the member');
            }

            return args[value.argument];
        }

        return value;
    }

    /** Whether a value an observation declares resolves against the arguments to the recorded value. */
    static #resolvesValueTo(declared, args, recorded) {
        if (Array.isArray(declared)) {
            if (!Array.isArray(recorded) || recorded.length !== declared.length) {
                return false;
            }

            for (let index = 0; index < declared.length; index++) {
                if (!Observations.#resolvesValueTo(declared[index], args, recorded[index])) {
                    return false;
                }
            }

            return true;
        }

        if (declared !== null && typeof declared === 'object') {
            return Observations.#isSame(args[declared.argument], recorded);
        }

        return declared === recorded;
    }

    /** Whether two values are the same by the rules an identity follows. */
    static #isSame(value, recorded) {
        if (value === null || value === undefined) {
            return recorded === null || recorded === undefined;
        }

        if (Array.isArray(value)) {
            return Array.isArray(recorded) && recorded.length === value.length && value.every((item, index) => Observations.#isSame(item, recorded[index]));
        }

        return value === recorded;
    }

    /** A copy of the value in which each list is copied item by item, and everything else, an object included, is itself, as an identity tells objects apart. */
    static #copy(value) {
        return Array.isArray(value) ? value.map(item => Observations.#copy(item)) : value;
    }

    #start(type, request, notify) {
        const start = this.#moduleRegistry.getFunction(type);

        if (start === undefined) {
            throw DomqlError.evaluation(`The module '${this.#moduleRegistry.getOwner(type)}' supplies no function for the observation type '${type.name}'`, {});
        }

        let observation;

        try {
            observation = start(request, notify, this.#environment);
        } catch (error) {
            throw DomqlError.evaluation(`The observation '${type.name}' failed to start: ${error?.message ?? String(error)}`, {}, { cause: error });
        }

        if (typeof observation?.stop !== 'function' || (type.contract === 'maintained' && typeof observation.sample !== 'function')) {
            observation?.stop?.();

            throw DomqlError.evaluation(`The observation type '${type.name}' started an observation that offers ${type.contract === 'maintained' ? 'no stop or no sample' : 'no stop'}`, {});
        }

        return observation;
    }

    #end(entry, session) {
        entry.holders.delete(session);

        if (entry.holders.size > 0) {
            return;
        }

        entry.observed.delete(entry.key);
        this.#running.delete(entry);

        try {
            entry.observation.stop();
        } catch (error) {
            this.#reportError(error);
        }
    }

    /** The request's identity: its type and the arguments that belong to the type's identity, with objects told apart by number. */
    #identityOf(type, request) {
        return [type.name, ...type.identity.map(name => this.#identityKeyOf(request.arguments[name]))].join('|');
    }

    #identityKeyOf(value) {
        if (value === null || value === undefined) {
            return 'null';
        }

        if (Array.isArray(value)) {
            return `[${value.map(item => this.#identityKeyOf(item)).join(',')}]`;
        }

        if (typeof value === 'object' || typeof value === 'function') {
            if (!this.#numbers.has(value)) {
                this.#numbers.set(value, this.#nextNumber++);
            }

            return `#${this.#numbers.get(value)}`;
        }

        return JSON.stringify(value);
    }
}
