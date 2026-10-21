# DOMQL Design v1.0.0-alpha.276

The [DOMQL specification](../spec/README.md) is the contract: DOMQL's module, which declares the DOM as Lexica's domain, and the host that carries queries out against a document. This design sets out how this implementation is built to meet it, and the reasons behind the choices that shape it. It describes version 32, as the specification does, and the C# half, which is designed and not yet built; [the status overview](features-status.md) says where the implementation still differs. [Lexica's design](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-design.md) sets out how the language and its runtime are built.

In this document:

1. [Architecture](#architecture)
2. [Resolution](#resolution)
3. [Sessions](#sessions)
4. [Watching](#watching)
5. [Comparing and patching](#comparing-and-patching)
6. [Host calls and their operations](#host-calls-and-their-operations)
7. [The C# half](#the-c-half)
8. [Decisions not taken](#decisions-not-taken)

## Architecture

DOMQL is Lexica's host. It registers its module in a Lexica registry beside the modules its callers register, resolves each request through that registry, and evaluates through Lexica's evaluator, giving each evaluation the hooks that record what it reads. Everything that spans evaluations is DOMQL's: waiting for samples, observations and their sessions, watches, snapshots and their change sets, subscriptions, and the lifetimes of actions and behaviors.

| Part | What it does | Source |
| --- | --- | --- |
| Entry point | Makes query objects from text or a definition, keeps their resolutions, registers modules, and composes the parts below into the public API | `domql.js` |
| Query objects | A request's definition and bindings, through which every operation on it is carried out | `DomqlQuery` |
| The module | DOMQL's declarations, the implementations of its members, and the functions that start its observations | `BrowserVocabulary`, `VocabularyImplementations`, `BrowserObservers`, `BrowserModule` |
| Evaluation | Lexica's evaluator under hooks that record what an evaluation reads and hold the sessions that keep it observed | `QueryEvaluator`, `QueryEvaluation` |
| Observations | Sessions on shared observations, each observation started on its first session and stopped with its last | `Observations`, `ObservationSession`, `SessionCache` |
| Watches | Keeping a result current: scheduling evaluations and delivering each result that differs | `Watch` |
| Host calls | What DOMQL keeps of each host call a module declares: the request it makes, an execution's mode, and its implementation | `DispatchTable` |
| Events and executions | Listening to event sources, raising a handle's events, and running continuous executions | `EventListener`, `EventDispatcher`, `ExecutionHandle` |
| Snapshots | Comparing results, computing and applying change sets, and keeping live state | `SnapshotComparer`, `SnapshotPatcher`, `LiveState` |

The DOM enters as late as it can. Making and resolving a query read no DOM, so they work in Node.js; code under `src/dom/` reads the window and the document it is given, never a global, and code under `src/snapshots/` reads no DOM at all, only the results and the metadata Lexica records beside them. Dependencies point one way: `dom/` depends on Lexica and `snapshots/`, and `snapshots/` on Lexica alone.

## Resolution

A resolution is kept for its definition, for the options it was made under, for the types of its bindings and the strings, numbers, Booleans and nulls they bind, which can select what a member reads, and for the vocabulary it was made against, and is released with the definition, so an unchanged query, and every query made from the same text, is resolved once however often it is evaluated. A text is parsed once through Lexica's cache of parsed texts, so identical texts share one definition and therefore one set of resolutions, whatever their bindings. Registering a module advances the registry's revision, and a resolution made before it is made again, so a request never runs against a vocabulary it was not resolved against.

The registry belongs to the instance of the library, as the observations do, one set for each window, so two bundles on one page never share a vocabulary, a resolution or an observation, and a query passes between them as its definition and its bindings.

## Sessions

Every observation a query starts is reached through a session, which the query disposes when `evaluateAsync` settles or is canceled, when the watch or the subscription ends, and when an evaluation no longer depends on it. An observation already running for another query is reached through a session of its own, which leaves its lifetime to its other sessions; the last session to be disposed stops it. Equivalent requests share one observation where their type permits it; a request's identity is its type, its target, the arguments its type says belong to it, and the window it belongs to, so two requests that differ in an argument that changes what is observed never share.

- **What a session gives.** A session gives its consumer the change notifications of the observation and, for a maintained observation, its latest sample, until the consumer disposes it. A session whose callback fails is reported and does not keep the others from hearing of a change.
- **Taking over.** A watch's evaluation takes over a session of the evaluations it replaces wherever it would acquire that same observation again, a shared one with the same type, target and arguments, so a session belongs to one evaluation at a time and an observation the watch keeps needing goes on reporting from one evaluation to the next. A subscription does the same from one event to the next, keeping the sessions an evaluation read and disposing the rest.
- **What an evaluation holds.** An evaluation once acquires the observations of the maintained members it reads, whose samples it needs, and holds those of its other members only while it waits, since a complete result needs nothing more observed; a watch holds them all.
- **Disposal.** Disposing an evaluation disposes every session even where one fails to be disposed, and reports each failure to the window's error reporting, as the specification's [errors](../spec/api.md#api-errors) require.

## Watching

A watch evaluates its whole query each time, and its dependencies are what that evaluation read, recorded by the hooks Lexica's evaluator calls around each member's implementation: a branch not taken records nothing, so what a watch observes follows the branches its evaluations take. Evaluating only what changed would save little for the changes lists most often see, as [the status overview](features-status.md#deferred) records.

## Comparing and patching

The comparer reads what Lexica's [result metadata](https://github.com/FormaUI/Lexica/blob/main/spec/runtime.md#runtime-results) records beside each value: the source of each projected item, by which a list projected from elements is matched where its sources are elements, each standing once; the origin of each value, which tells whether a number came from the same branch, operand or property as the number before it; and the tolerance it compares within. A result therefore holds data alone, and a change set never names an element.

The patcher computes the change set that takes one reconciled snapshot to the next, and applies change sets in place to live state.

## Host calls and their operations

Lexica resolves and evaluates the queries DOMQL gives it; DOMQL decides when those evaluations occur and what the browser does with the inputs a host call prepares. Subscribing, executing once and running continuously are DOMQL's contracts with its callers, so Lexica knows none of them: it knows only that a function is one its host invokes, resolves and prepares the call, and projects the values DOMQL hands back.

DOMQL keeps the rest in a catalog of its own. `domql.createModule` takes each host call's request kind, execution mode and implementation out of the declaration, keeps them by the declaration, and gives Lexica the signature, so the module a caller writes is one object and Lexica never holds an implementation it must not call. An operation reads its query's host call from the resolution, looks its declaration up in the catalog, and refuses the call where the catalog says another operation carries it out. The request kind is declared, never inferred from a missing field, so an execution whose mode is left out is refused as an execution, where an inferred kind would take it silently for an event source. A host call on a receiver of unknown type has no declaration yet, so the host calls of its name in the catalog say what it requests, and a name whose host calls disagree is refused as ambiguous, as Lexica refuses declarations that disagree on who invokes them. Preparation, the null rule and the checking of every value an implementation answers stay Lexica's, so a subscription, a once execution and a continuous execution read their receivers, their arguments and their results by the rules a query reads its members by.

## The C# half

The C# half carries a watch to a .NET application, which starts a watch and receives its results; it is a caller that keeps its own copy of each result, as [keeping a copy of a result](../spec/results.md#results-keeping-a-copy) sets out. Its API follows the JavaScript one:

| C# | Meaning |
| --- | --- |
| `Domql.Query(text, bindings)`, `Domql.Query<T>(text, bindings)`, and from a definition alike | Makes a query object, binding its parameters, as `domql.query` does |
| `Domql.TryQuery(…)`, `Domql.TryQuery<T>(…)` | Attempts exactly what `Domql.Query` does, answering false with a diagnostic for a syntax or structure failure |
| `query.Definition` | The query's immutable definition, without its bindings |

C# writes text, and names the type its result maps onto, or none:

```csharp
public sealed record PanelState(double? Width, bool HasFocus);

DomqlQuery<PanelState> typed = Domql.Query<PanelState>(
    """
    panel {
        width = it.size?.width,
        hasFocus = it.focusWithin()
    }
    """,
    ("panel", panel));

DomqlQuery untyped = Domql.Query("panel { size = it.size }", ("panel", panel));
```

A `DomqlQuery<T>` answers a `T`, mapped by its declared contract, which matches the result's fields to the constructor parameters of `T` by name regardless of case, so a field `nearend` fills a parameter `NearEnd`, and reports an ambiguity where two fields differ only in case, since DOMQL itself tells them apart; a `DomqlQuery` answers a `DomqlSnapshot` giving structured access to its values. C# has no C# type standing for each vocabulary concept: a module contributes its declarations and implementations, and the text names what the query reads. `Domql.TryQuery` attempts exactly what `Domql.Query` does, making a query and checking the syntax and the structural rules that need no vocabulary, an empty object expression, a duplicate field and a reserved name among them, without resolving its vocabulary or evaluating anything, so a successful return means the query was made, not that it is ready to be carried out: a syntax or structure failure returns false with a diagnostic, and any other failure is thrown, never swallowed. A vocabulary failure, such as an unknown member, arrives when the query is resolved. C# cancels with a `CancellationToken` where JavaScript takes a `signal`.

Its adapter owns the synchronization:

- **Live state by default.** It watches live state, and takes its baseline from the first ready event's `args.snapshot`.
- **One update at a time.** It queues the immutable changes after the baseline and delivers them in order, sending the next only once the receiving side acknowledges that the one before was applied completely. Acknowledgment follows application alone, never the application's handlers, and a failed delivery stops every further update of that watch.
- **No partial state.** No consumer observes a change set partly applied: access to the C# result during an update follows an explicit rule, a result whose application failed becomes unusable, and the application's handlers are notified once the update is applied.
- **Obsolete watches rejected.** The receiving side rejects a delivery from an obsolete watch before applying it, through a token of its own for the watch it follows.
- **Recovery from uncertainty.** Where applying an update throws, a call rejects, or a call times out leaving its outcome uncertain, the adapter first invalidates the old watch, so its late applications and acknowledgments change neither the replacement result nor the new queue, then disposes it and rebuilds the result from a fresh watch's baseline. Where the connection is lost with the components holding its results, their replacements start watches of their own; where it resumes with them, an update unanswered across the interruption is uncertain and recovered as a timeout is.
- **Handler failures reported, not retried.** An exception from an application handler is reported without restarting synchronization, since the state was already accepted.
- **One way of applying.** Its application of change sets passes a conformance corpus the JavaScript patcher passes too: each case a previous result, a change set and the result they give, reviewed independently of either applier, moves and escaped paths among them.

## Decisions not taken

Each of these was considered, measured where cost decided it, and not adopted. It is reopened only by the need its row names.

| Decision | Why not | Reopened by |
| --- | --- | --- |
| Observing every box's position | `rect` keeps its own size, its scroll containers' scrolling, the window's size and its trees' structure, and stays partly observable. Observing its trees' mutations would cost a refresh for each one, about 50 ms for 10,000 rows in Chromium, and still miss a move a stylesheet, an image or a font causes. An intersection observer for each box caught nearly every move, but a watch of shaped rows started 78 to 88% slower and held about 60% more script memory a row, and scrolling 5,000 watched rows took 68 ms a frame rather than 17. | A consumer that needs the moves of a few chosen boxes followed without a refresh, as an opt-in for them |
| One native observer shared by every element | Routing records through one `ResizeObserver` and one `MutationObserver` was correct, but disposed 55 to 111% slower and held 13% more script memory a row. Under `immediate`, one layout change resizing 1,000 rows evaluated a watch twice rather than 1,001 times, at the same disposal and memory cost for every watch of a box. | An implementation whose disposal and memory both cost less, or a workload in which the renderer's memory at that scale matters |
| `watch.update` for new bindings | A caller starts a watch of the new bindings and disposes the old one once the new one is ready; every observation both read of the same target and arguments runs on throughout. | A consumer that needs its listeners or its live state's identity kept through new bindings |
| A subscription delivered by frame | Every event is projected in the task it is dispatched in. Delivering later and dropping events are separate features, and a frame schedule would have to say whether it queues, keeps the latest or combines a frame's events; waiting for events to go quiet is the caller's policy. | A consumer that needs events by frame, and says which of those it needs |
| Event sources a continuous execution offers | Neither a continuous execution's declaration nor its implementation offers one, and the specification promises none. | A continuous execution with events its caller would subscribe to |
| A continuous execution that waits, `runAsync` | `run` answers synchronously, with the execution started; asynchronous work it began may still be under way. | A caller that needs to know when a continuous execution is ready, beyond its having started |
| A window the viewport decides | `rows.where(it.intersects({ root = panel }))` already answers which rendered rows intersect a panel. It holds an observation for every candidate and selects only rendered rows, so it is no virtualization. | A consumer that needs DOMQL itself to decide which rows are rendered |
