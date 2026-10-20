/**
 * The types of DOMQL's public API, shipped beside domql.js.
 */

/** How a request will be carried out, which resolution checks it against. */
export interface DomqlResolveOptions {
    /** Whether the query will be watched. */
    watch?: boolean;
    /** Whether a watch accepts members whose changes its observations only partly cover. */
    acceptPartialObservation?: boolean;
}

/** How a query is evaluated once. */
export interface DomqlEvaluateOptions {
    /** The window `window` stands for, and whose document `document` stands for; by default the environment's. */
    window?: Window;
}

/** How a query is evaluated once, waiting for its maintained members. */
export interface DomqlEvaluateAsyncOptions extends DomqlEvaluateOptions {
    /** Cancels the evaluation, which then rejects with the signal's reason. */
    signal?: AbortSignal;
}

/** How a query is watched, its events carrying each snapshot whole. */
export interface DomqlWatchOptions {
    /** When an evaluation follows a change: at the next animation frame, once however many observations fired (the default), or, without waiting for an animation frame, in a microtask the first invalidation queues, which the invalidations received before it begins share. */
    schedule?: 'frame' | 'immediate';
    /** What the watch's events carry: each snapshot whole, the default. */
    updateStrategy?: 'snapshot';
    /** Whether the watch accepts a member whose observations only partly cover its changes; a watch over one without it is a validation error. */
    acceptPartialObservation?: boolean;
    /** Disposes the watch when it aborts; one already aborted answers a watch that is disposed and starts nothing. */
    signal?: AbortSignal;
    /** The window `window` stands for, and whose document `document` stands for; by default the environment's. */
    window?: Window;
}

/** How a query is watched when its result is kept as live state: one object the watch keeps current in place, which keeps its identity. */
export interface DomqlLiveStateWatchOptions extends Omit<DomqlWatchOptions, 'updateStrategy'> {
    /** Keeps one object current in place; the result must be an object or a list that is never null. */
    updateStrategy: 'liveState';
}

/** How a subscription is listened to, an action executed, or a behavior applied. */
export interface DomqlOperationOptions {
    /** The window `window` stands for, and whose document `document` stands for; by default the environment's. */
    window?: Window;
    /** Ends what the operation started when it aborts; one already aborted starts nothing. */
    signal?: AbortSignal;
}

/** How a listener of a handle's events listens. */
export interface DomqlListenOptions {
    /** Stops the listener when it aborts; one already aborted answers a listener that is stopped. */
    signal?: AbortSignal;
}

/** A listener: it listens from the call that answered it until it is disposed. */
export interface DomqlEventListener {
    /** `ready` while it listens, and `disposed` once it is ended. */
    readonly status: 'ready' | 'disposed';
    /** Stops listening and prevents any new handler call; a handler already running may finish. Disposing again does nothing. */
    dispose(): void;
}

/** What an event of a result carries: the result, or the failure that produced none. */
export type DomqlResultArgs<T> =
    | { readonly status: 'ready'; readonly value: T }
    | { readonly status: 'failed'; readonly error: unknown };

/** What a live-state watch's change event carries: the object kept current, the immutable snapshot it was brought to and the change set just applied, empty in a listener's first event; or the failure that produced none. */
export type DomqlLiveStateArgs<T> =
    | { readonly status: 'ready'; readonly liveState: DomqlReadOnly<T>; readonly snapshot: T; readonly changes: readonly DomqlChangeOperation[] }
    | { readonly status: 'failed'; readonly error: unknown };

/** What an error event carries: a failure that belongs to no result. */
export interface DomqlErrorArgs {
    readonly error: unknown;
}

/** A behavior the caller applied: it runs from the call that applied it until it is disposed. */
export interface DomqlBehavior {
    /** `ready` while it runs, and `disposed` once it is ended. */
    readonly status: 'ready' | 'disposed';
    /** Replaces the bindings the behavior runs with, whole. A failure throws and leaves the behavior running as it was; bindings that select another behavior are refused. */
    update(bindings: DomqlBindings): void;
    /** Listens to the failures the behavior reports while it runs. */
    subscribe(eventName: 'error', handler: (sender: DomqlBehavior, args: DomqlErrorArgs) => unknown, options?: DomqlListenOptions): DomqlEventListener;
    /** Ends the behavior, stops its listeners and leaves its module registered. Disposing again does nothing. */
    dispose(): void;
}

/** A value seen through read-only types all the way down, as the live state a watch keeps is to the caller that holds it. */
export type DomqlReadOnly<T> = T extends readonly (infer I)[] ? readonly DomqlReadOnly<I>[] : T extends object ? { readonly [K in keyof T]: DomqlReadOnly<T[K]> } : T;

/** One operation of a change set: a JSON Patch operation limited to replace, add, remove and move, whose paths are JSON Pointers into the result. */
export type DomqlChangeOperation =
    | { readonly op: 'replace' | 'add'; readonly path: string; readonly value: unknown }
    | { readonly op: 'remove'; readonly path: string }
    | { readonly op: 'move'; readonly from: string; readonly path: string };

/** A path item: the name of a field, or a list index that is a whole number and not negative. */
export type DomqlPathItem = string | number;

/** What every watch has: the handle of a query kept current. */
interface DomqlWatchBase<T> {
    /** `pending` until the first snapshot is available, `ready` while the watch has a current one, `failed` after an evaluation fails, and `disposed` once it is ended. */
    readonly status: 'pending' | 'ready' | 'failed' | 'disposed';
    /** The last successful immutable snapshot, undefined before the first, so a result that is null is told apart from none yet. */
    readonly snapshot: T | undefined;
    /** The latest evaluation failure, cleared by the next success; null where there is none. */
    readonly error: unknown;
    /** Waits for a successful ready state and answers its snapshot; it rejects where an evaluation fails while it waits or the watch is disposed, and its signal cancels the wait alone. */
    readyAsync(options?: DomqlListenOptions): Promise<T>;
    /** Evaluates now, and settles once the evaluation has completed and the event it produced, if any, has been raised. */
    refreshAsync(): Promise<void>;
    /** Ends the watch: cancels what it scheduled, disposes every observation session and stops every listener, its views' included. */
    dispose(): void;
}

/** A watch whose events carry each snapshot whole. */
export interface DomqlWatch<T = unknown> extends DomqlWatchBase<T> {
    /** Listens to each result: a snapshot that differs, or a failed evaluation; a listener that subscribes once the watch has a result receives it first. */
    subscribe(eventName: 'change', handler: (sender: DomqlWatch<T>, args: DomqlResultArgs<T>) => unknown, options?: DomqlListenOptions): DomqlEventListener;
    /** Listens to the failures that belong to no result, such as a handler that throws. */
    subscribe(eventName: 'error', handler: (sender: DomqlWatch<T>, args: DomqlErrorArgs) => unknown, options?: DomqlListenOptions): DomqlEventListener;
    /** A selected view: a part of the watch's result, which shares its evaluation, and whose path is checked against the result's type at once. */
    select<U = unknown>(...path: DomqlPathItem[]): DomqlSelectedView<U>;
}

/** A watch that keeps its result as live state. */
export interface DomqlLiveStateWatch<T = unknown> extends DomqlWatchBase<T> {
    /** The object the watch keeps current, the same from the first result on; undefined before it. The caller reads it and never writes it. */
    readonly liveState: DomqlReadOnly<T> | undefined;
    /** Listens to each result: the object brought up to date, or a failed evaluation; a listener that subscribes once the watch has a result receives it first, with no changes. */
    subscribe(eventName: 'change', handler: (sender: DomqlLiveStateWatch<T>, args: DomqlLiveStateArgs<T>) => unknown, options?: DomqlListenOptions): DomqlEventListener;
    /** Listens to the failures that belong to no result, such as a handler that throws. */
    subscribe(eventName: 'error', handler: (sender: DomqlLiveStateWatch<T>, args: DomqlErrorArgs) => unknown, options?: DomqlListenOptions): DomqlEventListener;
}

/** A part of a snapshot watch's result: it belongs to the running watch, starts no evaluation of its own and needs no disposal. */
export interface DomqlSelectedView<T = unknown> {
    /** The watch's status. */
    readonly status: 'pending' | 'ready' | 'failed' | 'disposed';
    /** The part of the watch's last successful snapshot, undefined before the first. */
    readonly snapshot: T | undefined;
    /** The watch's latest evaluation failure, cleared by the next success. */
    readonly error: unknown;
    /** A smaller part. */
    select<U = unknown>(...path: DomqlPathItem[]): DomqlSelectedView<U>;
    /** Listens to the part: raised where it changed, and after a failed evaluation; the sender is the owning watch. */
    subscribe(eventName: 'change', handler: (sender: DomqlWatch, args: DomqlResultArgs<T>) => unknown, options?: DomqlListenOptions): DomqlEventListener;
    /** Waits for the watch's successful ready state and answers the part. */
    readyAsync(options?: DomqlListenOptions): Promise<T>;
}

/** A DOMQL definition: the JSON document that records a query's meaning, without the values its parameters are bound to. */
export interface DomqlDefinition {
    readonly version: number;
    readonly expression: DomqlDefinitionNode;
}

/** A node of a definition. */
export type DomqlDefinitionNode =
    | { readonly kind: 'literal'; readonly value: string | number | boolean | null }
    | { readonly kind: 'parameter'; readonly name: string }
    | { readonly kind: 'root'; readonly name: 'document' | 'window' | 'root' }
    | { readonly kind: 'context' }
    | { readonly kind: 'local'; readonly name: string }
    | { readonly kind: 'member'; readonly target: DomqlDefinitionNode; readonly name: string | DomqlDefinitionNode; readonly optional?: true }
    | { readonly kind: 'call'; readonly target: DomqlDefinitionNode; readonly name: string; readonly optional?: true; readonly arguments: readonly DomqlDefinitionNode[] }
    | { readonly kind: 'indexer'; readonly target: DomqlDefinitionNode; readonly name?: string; readonly argument: DomqlDefinitionNode; readonly optional?: true }
    | { readonly kind: 'object'; readonly target?: DomqlDefinitionNode; readonly locals?: readonly DomqlDefinitionLocal[]; readonly fields: readonly DomqlDefinitionField[] }
    | { readonly kind: 'optionalChain'; readonly target: DomqlDefinitionNode }
    | { readonly kind: 'coalescing'; readonly value: DomqlDefinitionNode; readonly fallback: DomqlDefinitionNode }
    | { readonly kind: 'not'; readonly operand: DomqlDefinitionNode }
    | { readonly kind: 'function'; readonly parameters: readonly string[]; readonly body: DomqlDefinitionNode; readonly arrow?: true }
    | { readonly kind: 'functionCall'; readonly name: string; readonly arguments: readonly DomqlDefinitionNode[] }
    | { readonly kind: 'body'; readonly locals: readonly DomqlDefinitionLocal[]; readonly result: DomqlDefinitionNode }
    | { readonly kind: 'do'; readonly body: DomqlDefinitionNode }
    | { readonly kind: 'interpolatedString'; readonly parts: readonly ({ readonly kind: 'text'; readonly value: string } | { readonly kind: 'expression'; readonly expression: DomqlDefinitionNode })[] }
    | { readonly kind: 'comparison'; readonly operands: readonly DomqlDefinitionNode[]; readonly operators: readonly ('<' | '<=' | '>' | '>=')[] }
    | { readonly kind: 'arithmetic'; readonly operator: '+' | '-' | '*' | '/' | '%'; readonly left: DomqlDefinitionNode; readonly right: DomqlDefinitionNode }
    | { readonly kind: 'negate'; readonly operand: DomqlDefinitionNode }
    | { readonly kind: 'cast'; readonly type: string; readonly target: DomqlDefinitionNode }
    | { readonly kind: 'conversion'; readonly type: string; readonly target: DomqlDefinitionNode }
    | { readonly kind: 'try'; readonly target: DomqlDefinitionNode }
    | { readonly kind: 'equality'; readonly left: DomqlDefinitionNode; readonly right: DomqlDefinitionNode }
    | { readonly kind: 'conditional'; readonly condition?: DomqlDefinitionNode; readonly binding?: { readonly name: string; readonly value: DomqlDefinitionNode }; readonly consequent: DomqlDefinitionNode; readonly alternative: DomqlDefinitionNode }
    | { readonly kind: 'and' | 'or'; readonly operands: readonly DomqlDefinitionNode[] };

/** A local of a body or an object expression: its name, which a `local` node uses, and the value it names, never output. */
export interface DomqlDefinitionLocal {
    readonly name: string;
    readonly value: DomqlDefinitionNode;
}

/** A field of an object expression: its name, always written, and its value. */
export interface DomqlDefinitionField {
    readonly name: string;
    readonly value: DomqlDefinitionNode;
}

/** The values supplied by parameter name, each typed from the value itself. */
export interface DomqlBindings {
    [name: string]: unknown;
}

/**
 * A query object: a request's definition and the values its parameters are bound to, through which every operation on it is carried out.
 * It belongs to the DOMQL instance that made it; another instance makes it again from its definition and a plain object of bindings.
 */
export interface DomqlQuery<T = unknown> {
    /** The immutable definition, without its bindings. */
    readonly definition: DomqlDefinition;
    /** The type of the result the query produces, for TypeScript alone: the caller's type argument asserts it, and no query holds it. */
    readonly [domqlResult]?: { result(value: T): void };
    /** A new query object with the same definition, bound to these bindings, which replace the old ones whole. */
    with(bindings: DomqlBindings): DomqlQuery<T>;
    /** The request validated against the vocabulary and typed, without evaluating anything. */
    resolve(options?: DomqlResolveOptions): DomqlResolvedDefinition;
    /** A part of the query's result, whose path's shape is checked at once and its fit when an operation resolves the query. */
    select<U = unknown>(...path: DomqlPathItem[]): DomqlSelection<U>;
    /** Evaluates the query once, synchronously, answering detached, immutable data; a maintained member that needs a sample fails it. */
    evaluate(options?: DomqlEvaluateOptions): T;
    /** Evaluates the query once, waiting for its maintained members, and answers a promise of detached, immutable data. */
    evaluateAsync(options?: DomqlEvaluateAsyncOptions): Promise<T>;
    /** Starts a watch of the query, whose events carry each snapshot whole. */
    watch(options?: DomqlWatchOptions): DomqlWatch<T>;
    /** Starts a watch of the query that keeps its result as live state. */
    watch(options: DomqlLiveStateWatchOptions): DomqlLiveStateWatch<T>;
    /** Listens to the subscription's event source from the call on, and answers the event listener; the handler receives it and each event's result, or the failure that capturing or projecting the event raised. */
    subscribe(handler: (sender: DomqlEventListener, args: DomqlResultArgs<T>) => unknown, options?: DomqlOperationOptions): DomqlEventListener;
    /** Executes the action once, and answers a promise of its result. A signal that aborts rejects with its reason; DOMQL never undoes what the action changed. */
    executeAsync(options?: DomqlOperationOptions): Promise<T>;
    /** Applies the behavior, which has started once the call returns, and answers its handle. */
    apply(options?: DomqlOperationOptions): DomqlBehavior;
}

/** A part of a query's result: it belongs to the query, and every operation on it starts work of its own on the whole query. */
export interface DomqlSelection<T = unknown> {
    /** A smaller part. */
    select<U = unknown>(...path: DomqlPathItem[]): DomqlSelection<U>;
    /** Evaluates the whole query once, synchronously, answering the part. */
    evaluate(options?: DomqlEvaluateOptions): T;
    /** Evaluates the whole query once, waiting for its maintained members, answering a promise of the part. */
    evaluateAsync(options?: DomqlEvaluateAsyncOptions): Promise<T>;
    /** Starts a watch of the whole query whose snapshots are the part, raised where the part changed. */
    watch(options?: DomqlWatchOptions): DomqlWatch<T>;
}

declare const domqlResult: unique symbol;
/** A query resolved against the registered vocabulary. */
export interface DomqlResolvedDefinition {
    readonly definition: DomqlDefinition;
    /** The kind of request: a value, a subscription, an action or a behavior request. */
    readonly kind: 'value' | 'subscription' | 'action' | 'behavior';
    /** The type of the request's result, in type notation, such as `number?` or `list<element>`. */
    readonly type: string;
    /** The declarations the request uses, with the name a message gives each and where each is used. */
    readonly usedDeclarations: readonly { readonly declaration: object; readonly name: string; readonly pointer: string }[];
    /** The type a result path reaches, in type notation, refusing a path the type does not hold. */
    typeAt(path: readonly (string | number)[]): string;
    /** Where a JSON Pointer stands in the text the definition was read from. */
    locate(pointer: string): LexicaErrorLocation;
}

/** Where a failure is. */
export interface LexicaErrorLocation {
    /** The failing node's JSON Pointer into the definition. */
    pointer?: string;
    offset?: number;
    line?: number;
    column?: number;
    binding?: string;
    module?: string;
    declaration?: string;
}

/** A failure of Lexica or of DOMQL, in the stage it happened in, and where. Its `name` is `LexicaError`. */
export declare class LexicaError extends Error {
    private constructor();
    readonly name: 'LexicaError';
    readonly kind: 'syntax' | 'structure' | 'validation' | 'module' | 'evaluation';
    readonly location: LexicaErrorLocation;
}

/** How a member changes. */
export type DomqlChangeCategory = 'constant' | 'observable' | 'partly-observable' | 'unobserved' | 'derived';

/** How a member reads. */
export type DomqlReadingMode = 'fresh' | 'maintained' | 'captured' | 'derived';

/** A reference to the argument a call gives for a parameter of the member. */
export interface DomqlArgumentReference {
    argument: string;
}

/** An argument of the member with a prefix joined to it, for a value parameter of type `string`, as `{ argument: 'name', prefix: 'aria-' }` names the attribute `aria-` and the name. */
export interface DomqlPrefixedArgumentReference extends DomqlArgumentReference {
    /** What is joined before the argument, a string no empty one. */
    prefix: string;
}

/** A value an observation gives: a literal, a list of values, or an argument of the member, which can carry a prefix. */
export type DomqlObservationValue = string | number | boolean | null | DomqlArgumentReference | DomqlPrefixedArgumentReference | DomqlObservationValue[];

/** An observation that covers a member's changes: its type, what it observes, and the arguments its type takes. */
export interface DomqlObservationDeclaration {
    /** The name of the type of observation, which a module declares. */
    type: string;
    /** What it observes: the receiver; its root, the root of the tree it is in; its roots, every root of its flat-tree ancestry through slots and shadow hosts, each observed alike; the window; the document; or the argument of the member that names it. A watch follows the receiver to another root or slot, and rebinds what observes its root or roots. */
    of: 'receiver' | 'root' | 'roots' | 'window' | 'document' | DomqlArgumentReference;
    [argument: string]: DomqlObservationValue | undefined;
}

/** A type of observation: what its observations provide, and the function that starts one. */
export interface DomqlObservationTypeDeclaration {
    name: string;
    /** A signal that a result may have changed, or a sampled value a member reads. */
    contract: 'invalidation' | 'maintained';
    /** The arguments that belong to the identity of an observation, beside its target. */
    identity?: string[];
    /** Whether equivalent requests share one observation; one that is not shared is kept for each watch, `evaluateAsync` call or event listener alone, whose later evaluations reach it again. */
    shared?: boolean;
    /** The key of the function that starts an observation, among the module's functions. */
    function: string;
}

/** A conversion from one type of data to another, which `to` asks for: a value already of a type converts to itself, so none is declared from a type to itself. */
export interface DomqlConversionDeclaration {
    /** The type it converts from: `number`, `string`, `boolean` or a structured type. */
    from: string;
    /** The type it converts to: `number`, `string`, `boolean` or a structured type. */
    to: string;
    /** The key of the function that converts, among the module's functions. */
    function: string;
}

/** What the function of a conversion is given beside the value it converts. */
export interface DomqlConversionContext {
    /**
     * Rejects the value, which has no conversion, with a reason that is a diagnostic string. It throws a signal private to DOMQL and to this attempt at the conversion,
     * so it never returns and the function stops where it calls it, unlike a promise's `reject`. Any other exception the function throws, and a value not of the type it converts to, is a fault.
     */
    reject(reason: string): never;
}

/** A parameter of a member. */
export interface DomqlParameterDeclaration {
    name: string;
    /**
     * A value, an expression evaluated against each item, a predicate, an expression of any value whose truthiness the implementation receives, or a function the query declares,
     * which the implementation calls while its own invocation lasts and only a member of kind `function` takes.
     */
    kind: 'value' | 'expression' | 'predicate' | 'function';
    /** The parameter's type, in DOMQL's notation; a predicate's is `boolean`, what the implementation receives, and a function parameter's the type of its function's result. */
    type: string;
    /** The types its function is called with, in order, in DOMQL's notation; only a function parameter declares them. */
    parameters?: string[];
    required: boolean;
    default?: unknown;
    /** Whether the argument names something the vocabulary resolves before any evaluation; a fixed parameter is a value parameter of type `string`. */
    fixed?: boolean;
    /** What a fixed parameter names, and only a fixed one. */
    selects?: 'eventType' | 'condition';
    /** Whether a null argument makes the call answer null, or is accepted; a function parameter leaves it out, since a function is never null. */
    nulls?: 'propagate' | 'accept';
    /** What an expression or a predicate argument is evaluated against. */
    context?: 'item';
    /** What the member does where an optional argument is left out, said in words for its documentation. */
    omitted?: string;
}

/** A property, function, event source, action or behavior a module adds. */
export interface DomqlMemberDeclaration {
    /** The DOMQL name. */
    name: string;
    /** The key of the function that carries it out, among the module's functions; a member whose argument selects a condition names none, since the condition carries it out. */
    function?: string;
    kind: 'property' | 'function' | 'eventSource' | 'action' | 'behavior';
    /** How a member that is no property is written: called, `context.closest(".row")`, the default, or a named indexer, `context:attribute["data-key"]`, a function whose one required value parameter is its key. A property declares none. */
    form?: 'call' | 'indexer';
    /** What its arguments supply, where it has parameters: its parameters, in order, the required ones before the optional ones, or every parameter, as the fields of one options object; an indexer's is positional. */
    input?: 'positional' | 'options';
    /** Whether an indexer is the default of its receivers, which `:[…]` invokes, as `attribute` is an element's; a receiver has one at most. */
    default?: boolean;
    /** The types it applies to, in DOMQL's notation. */
    on: string | string[];
    parameters?: DomqlParameterDeclaration[];
    /** The type of its result, in DOMQL's notation. */
    result: string;
    changes: DomqlChangeCategory;
    reads: DomqlReadingMode;
    /** The changes a partly observable member's observations miss. */
    misses?: string;
    /** How far a number it returns may move before a watch reports a different snapshot; the number must change by more, and exactly where it is not declared. */
    tolerance?: number;
    /** The observations that cover its changes, which an observable or partly observable member names and no other does. */
    observations?: DomqlObservationDeclaration[];
}

/** What a module declares. */
export interface DomqlModuleContents {
    members?: DomqlMemberDeclaration[];
    /** The structured types it declares, each with its fields' types. */
    types?: { name: string; fields: Record<string, string> }[];
    /** The event types it declares, each with the type of its event data. */
    eventTypes?: { name: string; data: string }[];
    /** The types of observation it declares. */
    observationTypes?: DomqlObservationTypeDeclaration[];
    /** The conversions it declares, each to or from one of its own types outside the built-in module, and one for each source and target. */
    conversions?: DomqlConversionDeclaration[];
    /** The conditions it declares, each asked by name with its verb. */
    conditions?: DomqlConditionDeclaration[];
}

/**
 * A condition: a Boolean of its receivers, which its verb asks by name, as `.is("name")` does, carried out by its own function under its own contract, so one condition's observability is no other's.
 * A module names a condition freely on its own types, and on any other names it for itself, as it does members; a name is declared once for overlapping receivers, whatever its verb.
 */
export interface DomqlConditionDeclaration {
    /** Its name, words of letters and digits joined by hyphens, as `focus-within` is. */
    name: string;
    /** The verb that asks it, its one kind of Boolean question: `is` a state, the default, `has` a possession or a presence, and `supports` a capability. */
    verb?: 'is' | 'has' | 'supports';
    /** The key of the function that tests it, among the module's functions, which takes what a member's does, its name as the one argument, and answers a Boolean. */
    function: string;
    /** The types it applies to, in DOMQL's notation. */
    on: string | string[];
    changes: 'constant' | 'observable' | 'partly-observable' | 'unobserved';
    reads: 'fresh' | 'maintained';
    /** The changes a partly observable condition's observations miss. */
    misses?: string;
    /** The observations that cover its changes, which an observable or partly observable condition names and no other does. */
    observations?: DomqlObservationDeclaration[];
}

/**
 * The functions that carry a module's members, observation types, conversions and conditions out, by the key each declaration names.
 * A member takes its receiver, its arguments by name and the environment, and a member that reads maintained values also their values, in the order its declaration names the observations; it is not called while one of them is pending.
 * A structure a member or an action answers is taken by its declared fields alone, read as the value offers them, getters included.
 * An event source takes its receiver, its arguments and the environment, and the function it delivers each event to, and returns an object whose `stop` ends the listening.
 * An action takes its receiver, its arguments, the environment and `{ signal }`, and returns its result or a promise of it.
 * A behavior takes its receiver, its arguments, the environment and `{ reportError }`, starts before it returns, and returns an object whose `update(receiver, args)` applies new arguments and whose `dispose` ends it.
 * An observation type takes the request, the function it calls when something may have changed and the environment, and returns an object whose `stop` ends the observation and, for a maintained one, whose `sample` returns its latest sample as `{ pending, value }`, pending until the first arrives.
 * A condition takes what a member does, its name as `{ name }`, and answers a Boolean.
 * A conversion takes the value, never null, and a `DomqlConversionContext`, reads nothing else, and returns the converted value, of the type it converts to, or calls `reject` where the value has none; `to` fails for a rejected value, and `try … to "type"` answers null.
 */
export type DomqlModuleFunctions = Record<string, (...args: any[]) => unknown>;

/** A vocabulary's members as data, and the functions that carry them out. */
export interface DomqlModule {
    readonly name: string;
    readonly members: readonly DomqlMemberDeclaration[];
    readonly types: readonly { readonly name: string; readonly fields: Readonly<Record<string, string>> }[];
    readonly eventTypes: readonly { readonly name: string; readonly data: string }[];
    readonly observationTypes: readonly DomqlObservationTypeDeclaration[];
    readonly conversions: readonly DomqlConversionDeclaration[];
    readonly conditions: readonly DomqlConditionDeclaration[];
    readonly functions: DomqlModuleFunctions | null;
}

/** Which build of DOMQL this is, and which specification it follows: two versions that change apart. */
export interface DomqlInfo {
    /** The version of this build of the library, as the package numbers it, `1.0.0-alpha.N` for a build of N commits; `1.0.0-alpha+source` where DOMQL runs from its sources. */
    readonly version: string;
    /** The version of the specification this implementation follows, `1.0.0-alpha`, which changes as the language does. */
    readonly specificationVersion: string;
}

/** DOMQL: makes query objects, formats requests, registers the modules that extend the vocabulary, and says which build it is and which specification it follows. */
export interface Domql {
    /** Which build this is, and which specification it follows. */
    readonly info: DomqlInfo;
    /** Makes a query object from a request's text, binding its parameters; it parses and checks the text, and evaluates nothing. */
    query<T = unknown>(text: string, bindings?: DomqlBindings): DomqlQuery<T>;
    /** Makes a query object from a request's definition, binding its parameters. */
    query<T = unknown>(definition: DomqlDefinition, bindings?: DomqlBindings): DomqlQuery<T>;
    /** The canonical text of a request, given as its text, its definition or a query object: it parses and checks the structure, needs no bindings and no registered vocabulary, and formatting what it gives gives that again. */
    format(source: string | DomqlDefinition | DomqlQuery): string;
    /** Creates a module from the vocabulary it declares and the functions that carry the declarations out. */
    createModule(name: string, contents: DomqlModuleContents, functions?: DomqlModuleFunctions | null): DomqlModule;
    /** Registers a module's vocabulary, which every request resolved afterwards may use. */
    registerModule(module: DomqlModule): void;
}

export declare const domql: Domql;
