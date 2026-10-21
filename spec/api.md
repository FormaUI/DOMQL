# The API

<a id="api"></a>
<a id="the-api"></a>
<a id="callers"></a>

A caller reaches DOMQL through one object, `domql`: it makes a query object from text or a definition, binding its parameters, and carries out every operation through it. It evaluates a query once or watches it, subscribes to a subscription, executes a once execution, or runs, updates and disposes a continuous one; a watch's caller also chooses its schedule, its update strategy and whether it accepts partial observation. An operation that keeps running answers a handle, through which its caller follows it and ends it. The package exports `domql` and `LexicaError` by name, and its TypeScript declarations type a query by its result, `domql.query<T>(…)`, and each handle by what it delivers.

```js
const panelQuery = domql.query("panel { size = it.size }", { panel });

const result = panelQuery.evaluate();               // Its result, once.
const width = panelQuery.select("size", "width");  // A part of its result, a selection.
const watch = panelQuery.watch({ signal });         // A handle that keeps its result current until the signal aborts.
```

In this document:

1. [Entry points and operations](#api-entry-points-and-operations)
2. [Objects](#api-objects)
3. [Events of a handle](#events-of-a-handle)
4. [Lifetimes](#lifetimes)
5. [Errors](#api-errors)

<a id="api-entry-points-and-operations"></a>

## Entry points and operations

Each entry point and operation is listed here with what it takes, and the section it names defines how it behaves.

| Entry point or operation | Meaning |
| --- | --- |
| `domql.query(text, bindings?)`, `domql.query(definition, bindings?)` | Makes a query object, binding its parameters, as [making a query](queries.md#making-a-query) sets out |
| `query.definition` | The query's immutable definition, without its bindings |
| `query.with(bindings)` | A new query with the same definition, bound to these bindings |
| `query.resolve(options?)` | Resolves and types a request without evaluating anything, as [resolution](queries.md#queries-resolution) sets out |
| `query.select(...path)` | A part of its result, as [selecting a result](queries.md#selecting-a-result) sets out |
| `query.evaluate(options?)` | Evaluates a query once, as [evaluating a query](evaluation.md#evaluating) sets out; its option is `window` |
| `query.evaluateAsync(options?)` | Evaluates a query once, waiting for its maintained members, as [waiting for maintained members](evaluation.md#waiting-for-maintained-members) sets out; its options are `window` and `signal` |
| `query.watch(options?)` | Watches a query, answering a `DomqlWatch`, as [the watch and its handle](watches.md#the-watch-and-its-handle) sets out |
| `query.subscribe(handler, options?)` | Subscribes to a subscription, answering a `DomqlEventListener`, as [subscribing](events.md#subscribing) sets out |
| `query.executeAsync(options?)` | Carries out a once execution, answering a promise of its result, as [executing once](executions.md#executions-executing-once) sets out |
| `query.run(options?)` | Starts a continuous execution, answering a `DomqlExecutionHandle`, as [running continuously](executions.md#executions-running-continuously) sets out |
| `domql.format(source)` | The canonical text of a text, a definition or a query object, as [formatting](https://github.com/FormaUI/Lexica/blob/main/spec/definition.md#definition-canonical-text) sets out |
| `domql.createModule(name, contents)` | Creates a module from its declarations, each that runs code carrying its implementation, as [extension modules](vocabulary.md#extension-modules) set out |
| `domql.registerModule(module)` | Registers a module's declarations in the instance's registry, as [extension modules](vocabulary.md#extension-modules) set out |
| `domql.info` | Which build this is and what it follows, in `versions`: `runtime`, the runtime release version, which the package and the bundle carry, its sources reporting the same; `specification`, the version of DOMQL's specification it follows; and `language`, the language specification version the Lexica runtime it runs on follows, its `lexica.info.versions.language` |

Almost every operation answers directly, so the plain name is the synchronous one, and every operation that answers a promise takes the suffix `Async`, as `evaluateAsync`, `readyAsync`, `refreshAsync` and `executeAsync` do.

<a id="api-objects"></a>

## Objects

| Object | Members | Defined in |
| --- | --- | --- |
| `DomqlQuery` | `definition`, `with(bindings)`, `resolve(options?)`, `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(options?)`, `subscribe(handler, options?)`, `executeAsync(options?)`, `run(options?)` | [Making a query](queries.md#making-a-query) |
| `DomqlSelection` | `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(options?)` | [Selecting a result](queries.md#selecting-a-result) |
| `DomqlWatch` | `status`, `snapshot`, `error`, `readyAsync(options?)`, `refreshAsync()`, `subscribe(eventName, handler, options?)`, `dispose()`, and `select(...path)` for snapshots or `liveState` for live state | [The watch and its handle](watches.md#the-watch-and-its-handle), [live state](results.md#live-state) |
| `DomqlSelectedView` | `snapshot`, `status`, `error`, `select(...path)`, `subscribe(eventName, handler, options?)`, `readyAsync(options?)` | [Sharing a watch](watches.md#sharing-a-watch) |
| `DomqlEventListener` | `status`, `dispose()` | [Events of a handle](#events-of-a-handle), [subscribing](events.md#subscribing) |
| `DomqlExecutionHandle` | `status`, `update(bindings)`, `subscribe(eventName, handler, options?)`, `dispose()` | [Running continuously](executions.md#executions-running-continuously) |

<a id="events-of-a-handle"></a>

## Events of a handle

A running watch or continuous execution raises events, which the listeners subscribed to it receive; a query object holds none, so queries shared between callers never share their listeners. `subscribe(eventName, handler, options?)` adds a listener and answers a `DomqlEventListener`, with `status`, `ready` or `disposed`, and `dispose()`, which stops it; its `signal` option stops it when it aborts.

```js
const watch = panelQuery.watch({ acceptPartialObservation: true });

const listener = watch.subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderPanel(args.value);
    } else {
        showError(args.error);
    }
}, { signal });

listener.dispose(); // Stops this listener.
```

| Event | Raised by | `args` |
| --- | --- | --- |
| `"change"` | A watch, to its own listeners and to those of its selected views | `status: "ready"` with `value`, or for live state `liveState`, `snapshot` and `changes`, as [live state](results.md#live-state) sets out; or `status: "failed"` with `error`, the evaluation's failure, after which the watch goes on observing and recovers |
| `"error"` | A watch or a continuous execution's handle | `error`, a failure that belongs to no result: a handler that throws or rejects, or a continuous execution failing while it runs; it changes no status |

- **A handler** is called with `(sender, args)`: the handle that raised the event, and an object of its own for each event, holding what that event carries. A snapshot it carries is immutable; the live state it carries is the object DOMQL keeps current, mutable by DOMQL alone and read-only to the handler.
- **`args.status` and `sender.status`.** `args.status` is the status the event reports; `sender.status` is the handle's status now, which may have moved on by the time an asynchronous handler resumes.
- **A late listener misses nothing.** A listener subscribed to a watch or a selected view that already has a result receives that result first, before the events after it.
- **Each listener's first ready event establishes its baseline:** the current whole value, with an empty change set for live state, and the changes after it are relative to that value. Later events may have empty changes too, so a listener that applies changes tracks whether it has its baseline.
- **Order.** Handlers run in the order their listeners were subscribed, and receive each event in the order the events were raised. DOMQL does not wait for the promise a handler returns, so the continuations of asynchronous handlers can overlap; a caller that needs them one at a time arranges that at its own delivery boundary.
- **Failures.** A handler that throws or rejects keeps no other handler from the event, undoes no result, does not stop the watch, and is reported to the `"error"` handlers of the watch or execution handle that raised the event. A failure of an `"error"` handler, and an `"error"` event no listener receives, go to the window's error reporting; no handler is called with its own failure, nothing is called again, and no other handle is interrupted.
- **Disposal** prevents any new handler call; one already running may finish. Disposing a handle stops every listener subscribed to it.

<a id="lifetimes"></a>

## Lifetimes

A `signal` is one lifetime for watches, event listeners and continuous executions alike:

```js
const lifetime = new AbortController();

panelQuery.watch({ acceptPartialObservation: true, signal: lifetime.signal });
clicks.subscribe((sender, args) => handleClick(args.value), { signal: lifetime.signal });

lifetime.abort();
```

An operation that answers a handle, given a signal already aborted, answers a disposed handle and starts nothing; an operation that answers a promise rejects with the signal's reason. A signal is an option an operation accepts, and no handle exposes one.

<a id="api-errors"></a>

## Errors

Every failure is a `LexicaError` with its `kind`, its `message` and the `location` it concerns, as Lexica's [diagnostics and errors](https://github.com/FormaUI/Lexica/blob/main/spec/diagnostics-and-errors.md) set out, and a caller reads the kind and the location rather than the message. A failure is reported where it arises: a syntax or structure failure as the query is made; a module failure as a module is created or registered, or as a request that uses a declaration without an implementation is resolved; a validation failure as the request is resolved; and an evaluation failure as it is carried out, a missing window among them.

A failure no handler or caller receives, as an `"error"` event no listener receives, a failure of an `"error"` handler or of a subscription's handler, or one a once execution reports after its caller stopped waiting, goes to the **window's error reporting**, its `reportError`, or the console where the window has none. A watch, an event listener and a waiting evaluation let go of every observation they hold even where letting go of one fails: each attempts every cleanup, reports a failure of one to the window's error reporting, and never lets it replace its result, its error or its cancellation.
