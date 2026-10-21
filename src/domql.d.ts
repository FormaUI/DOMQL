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

/** How a subscription is listened to, or an execution carried out once or run. */
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

/** The handle of a continuous execution the caller ran: it runs from the call that ran it until it is disposed. */
export interface DomqlExecutionHandle {
    /** `ready` while it runs, and `disposed` once it is ended. */
    readonly status: 'ready' | 'disposed';
    /** Replaces the bindings the execution runs with, whole. A failure throws and leaves the execution running as it was; bindings that select another execution are refused. */
    update(bindings: DomqlBindings): void;
    /** Listens to the failures the execution reports while it runs. */
    subscribe(eventName: 'error', handler: (sender: DomqlExecutionHandle, args: DomqlErrorArgs) => unknown, options?: DomqlListenOptions): DomqlEventListener;
    /** Ends the execution, stops its listeners and leaves its module registered. Disposing again does nothing. */
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
    /** Carries out the once execution the query ends in, and answers a promise of its result. A signal that aborts rejects with its reason; DOMQL never undoes what the execution changed. */
    executeAsync(options?: DomqlOperationOptions): Promise<T>;
    /** Runs the continuous execution the query ends in, which has started once the call returns, and answers its handle. */
    run(options?: DomqlOperationOptions): DomqlExecutionHandle;
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
    /** What the request asks for: a value, a subscription to an event source, or an execution. */
    readonly kind: 'value' | 'subscription' | 'execution';
    /** How an execution runs, once or continuously; null for a request of another kind. */
    readonly executionMode: 'once' | 'continuous' | null;
    /** The type of the request's result, in type notation, such as `number?` or `list<element>`; null for an execution that answers none. */
    readonly type: string | null;
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
    /** The field of the declaration a module error is about, as `updates.misses`. */
    field?: string;
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
    /** What it observes: the receiver; a target the module declaring its type declares, by its name, as DOMQL's `window`, `document`, `root` and `roots` are; or the argument of the member that names it. A member without a target has no receiver, and observes neither it nor a target found from it. */
    of: string | DomqlArgumentReference;
    [argument: string]: DomqlObservationValue | undefined;
}

/** How a member or a predicate changes and reads, the changes it misses, the tolerance it is compared within and the observations that cover its changes. */
export interface DomqlUpdates {
    changes: DomqlChangeCategory;
    reads: DomqlReadingMode;
    /** The changes a partly observable declaration's observations miss; required where it is partly observable, and refused otherwise. */
    misses?: string;
    /** How far a number it returns, or each number a structured result of it holds, may move before a host reports a different result; taken by a numeric or a structured result alone. */
    tolerance?: number;
    /** The observations that cover its changes, which an observable or partly observable declaration names and no other does. */
    observations?: DomqlObservationDeclaration[];
}

/** What an implementation of an observation type receives: the request it observes, the function it calls when something may have changed, and the environment. */
export interface DomqlObservationImplementationInput {
    readonly request: Readonly<Record<string, unknown>>;
    readonly notify: () => void;
    readonly env: unknown;
}

/** A type of observation: what its observations provide, and the implementation that starts one. */
export interface DomqlObservationTypeDeclaration {
    name: string;
    /** A signal that a result may have changed, or a sampled value a member reads. */
    contract: 'invalidation' | 'maintained';
    /** The arguments that belong to the identity of an observation, beside its target. */
    identity?: string[];
    /** Whether equivalent requests share one observation; one that is not shared is kept for each of its host's evaluations alone. */
    shared?: boolean;
    /** Starts an observation, and answers an object whose `stop` ends it and, for a maintained one, whose `sample` answers its latest sample as `{ pending, value }`, pending until the first arrives. */
    implementation?: (input: DomqlObservationImplementationInput) => { stop(): void; sample?(): { pending: boolean; value?: unknown } };
}

/** A target a module's observation types observe besides the receiver and an argument of the member, which DOMQL's own module alone declares. */
export interface DomqlObservationTargetDeclaration {
    /** Its name, which an observation's `of` gives, and never `receiver`. */
    name: string;
    /** Whether it is found from the receiver, so a member without a target observes none of it, or independent of it, the default. */
    from?: 'receiver';
    /** Whether it is several targets, each observed alike, which a maintained observation never observes, or one, the default. */
    count?: 'many';
}

/** What an implementation of a conversion receives: the value, never null, and `reject`. */
export interface DomqlConversionImplementationInput {
    readonly value: unknown;
    /**
     * Rejects the value, which has no conversion, with a reason that is a diagnostic string. It throws a signal private to Domql and to this attempt at the conversion,
     * so it never returns and the implementation stops where it calls it, unlike a promise's `reject`. Any other exception it throws, and a value not of the type it converts to, is a fault.
     */
    reject(reason: string): never;
}

/** A conversion from one type of data to another, which `to` asks for: a value already of a type converts to itself, so none is declared from a type to itself. */
export interface DomqlConversionDeclaration {
    /** The type it converts from: `number`, `string`, `boolean` or a structured type. */
    from: string;
    /** The type it converts to: `number`, `string`, `boolean` or a structured type. */
    to: string;
    /** Converts the value, reading nothing else, and answers the converted value, of the type it converts to, or calls `reject` where the value has none. */
    implementation?: (input: DomqlConversionImplementationInput) => unknown;
}

/** A parameter of a member. */
export interface DomqlParameterDeclaration {
    name: string;
    /**
     * A value, an expression evaluated against each item, a predicate, an expression of any value whose truthiness the implementation receives, or a function the expression declares,
     * which the implementation calls while its own invocation lasts and only a function the evaluator invokes takes.
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
    /** What a fixed parameter names, and only a fixed one: the predicate a verb asks, or a type, which a function's result writes as `@selected`, through the type selector `selector` names, as `on`'s type does through `event`. */
    selects?: 'predicate' | 'type';
    /** The type selector a parameter that selects a type selects through. */
    selector?: string;
    /** Whether a null argument makes the call answer null, or is accepted; a function parameter leaves it out, since a function is never null. */
    nulls?: 'propagate' | 'accept';
    /** What an expression or a predicate argument is evaluated against. */
    context?: 'item';
    /** What the member does where an optional argument is left out, said in words for its documentation. */
    omitted?: string;
}

/** What a member's or a predicate's implementation receives, by name: its receiver, which a module member has none of, its arguments by parameter name, the environment, and what its kind adds. */
export interface DomqlImplementationInput {
    readonly receiver?: unknown;
    readonly args: Readonly<Record<string, unknown>>;
    readonly env: unknown;
    /** A member that reads maintained values: its observations' latest samples, in the order its declaration names them. */
    readonly samples?: readonly unknown[];
    /** An event source: the function each event is handed to. */
    readonly deliver?: (event: unknown) => void;
    /** A once execution: the signal that aborts it. */
    readonly signal?: AbortSignal;
    /** A continuous execution: where a failure while it runs is reported. */
    readonly reportError?: (error: unknown) => void;
}

/**
 * A property or a function a module adds, each taking the fields it needs alone; a member without a target is a module member, read through its module's namespace.
 * A property answers a value, and a function the evaluator invokes its result. A function the host invokes is a host call DOMQL carries out by its request kind: an event source answers an object whose `stop` ends the listening;
 * a once execution its result or a promise of it; and a continuous execution an object whose `update(receiver, args)` applies new arguments and whose `dispose` ends it.
 */
export interface DomqlMemberDeclaration {
    /** The DOMQL name. */
    name: string;
    kind: 'property' | 'function';
    /** Who invokes a function: the evaluator, the default, or DOMQL as the host, a host call that takes value parameters alone and no updates. */
    invokedBy?: 'evaluator' | 'host';
    /** The request a host call makes: a subscription to an event source, or an execution. */
    requestKind?: 'subscription' | 'execution';
    /** How an execution runs: once, answering its result, or continuously, until it is updated or disposed. */
    executionMode?: 'once' | 'continuous';
    /** The types it applies to, in DOMQL's notation, or none for a module member. */
    target?: string | string[];
    /** How a member that is no property is written: a function call, `it.device("lamp")`, the default, or a named indexer, `it:setting["mode"]`, a function whose one required value parameter is its key. A property takes none. */
    syntax?: 'function-call' | 'indexer';
    /** The form its arguments take where it has parameters, an optional one included: one for each parameter, in order, the required ones before the optional ones, or one options object whose fields supply them; an indexer's is positional. */
    arguments?: 'positional' | 'options';
    /** Whether an indexer is the default of its receivers, which `:[…]` invokes, as `item` is a list's; a module designates one at most for a receiver type. */
    default?: boolean;
    /** Its parameters; a property takes none. */
    parameters?: DomqlParameterDeclaration[];
    /** The type of its result, in DOMQL's notation: an event source's the type of each event it delivers, `@selected` where its type is selected; a once execution's the type of its result; and a continuous execution declares none. */
    result?: string;
    /** How it changes and reads; a property and a function the evaluator invokes take it, and a host call refuses it. */
    updates?: DomqlUpdates;
    /** What carries it out, given one object it reads by name; a member without one is resolved against and never invoked, and a verb, which its predicate carries out, takes none. */
    implementation?: (input: DomqlImplementationInput) => unknown;
}

/** What a module declares. */
export interface DomqlModuleContents {
    /** The structured types it declares, each with its fields' types. */
    types?: { name: string; fields: Record<string, string> }[];
    members?: DomqlMemberDeclaration[];
    /** The predicates it declares, each asked by name with its verb. */
    predicates?: DomqlPredicateDeclaration[];
    /** The type selectors it declares, each by its name alone. */
    typeSelectors?: { name: string }[];
    /** The keys it declares for type selectors, its own or a module's registered before it, as an event type is a key of DOMQL's selector `event`, each mapping to a type. */
    selectableTypes?: { name: string; selector: string; type: string }[];
    /** The types of observation it declares. */
    observationTypes?: DomqlObservationTypeDeclaration[];
    /** The conversions it declares, each to or from one of its own types, and one for each source and target. */
    conversions?: DomqlConversionDeclaration[];
}

/**
 * A predicate: a Boolean of its receivers, which its verb asks by name, as `.is("name")` does, carried out by its own implementation under its own updates, so one predicate's observability is no other's.
 * A module names a predicate freely on its own types, and on any other names it for itself, as it does members; a name is declared once for overlapping receivers, whatever its verb.
 */
export interface DomqlPredicateDeclaration {
    /** Its name, words of letters and digits joined by hyphens, as `focus-within` is. */
    name: string;
    /** The verb that asks it, its one kind of Boolean question: `is` a state, the default, `has` a possession or a presence, and `supports` a capability. */
    verb?: 'is' | 'has' | 'supports';
    /** The types it applies to, in DOMQL's notation; a predicate always names one. */
    target: string | string[];
    updates: DomqlUpdates & { changes: 'constant' | 'observable' | 'partly-observable' | 'unobserved'; reads: 'fresh' | 'maintained' };
    /** Tests it, given what a member's implementation is, its name as `args.name`, and answers a Boolean. */
    implementation?: (input: DomqlImplementationInput) => boolean;
}

/** A vocabulary's declarations as data, each that runs code carrying its implementation. */
export interface DomqlModule {
    readonly name: string;
    readonly types: readonly { readonly name: string; readonly fields: Readonly<Record<string, string>> }[];
    readonly members: readonly DomqlMemberDeclaration[];
    readonly predicates: readonly DomqlPredicateDeclaration[];
    readonly typeSelectors: readonly { readonly name: string }[];
    readonly selectableTypes: readonly { readonly name: string; readonly selector: string; readonly type: string }[];
    readonly observationTypes: readonly DomqlObservationTypeDeclaration[];
    readonly observationTargets: readonly DomqlObservationTargetDeclaration[];
    readonly conversions: readonly DomqlConversionDeclaration[];
}

/** The versions DOMQL reports, which change apart. */
export interface DomqlVersions {
    /** The DOMQL runtime release version, which the package and the bundle carry. */
    readonly runtime: string;
    /** The DOMQL specification version the implementation follows. */
    readonly specification: string;
    /** The language specification version the Lexica runtime DOMQL runs on follows, its `lexica.info.versions.language`. */
    readonly language: string;
}

/** Which build of DOMQL this is, and what it follows. */
export interface DomqlInfo {
    readonly versions: DomqlVersions;
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
    /** Creates a module from the vocabulary it declares, each declaration that runs code carrying its implementation. */
    createModule(name: string, contents: DomqlModuleContents): DomqlModule;
    /** Registers a module's vocabulary, which every request resolved afterwards may use. */
    registerModule(module: DomqlModule): void;
}

export declare const domql: Domql;
