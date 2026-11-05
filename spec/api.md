# The API

<a id="api"></a>
<a id="the-api"></a>
<a id="callers"></a>

A caller uses DOMQL through one object, `domql`. A query is a short script, written as text, that reads the page, listens to it or changes it, and the values its names stand for are given beside it, as its **bindings**:

```js
await domql.executeAsync('field.focus()', { field }); // Moves the focus to the element `field` is bound to.
```

Here `'field.focus()'` is the query, and `{ field }` binds the name `field` in it to an element of the page.

In this document:

1. [Two ways to run a query](#api-two-ways-to-run-a-query)
2. [Entry points and operations](#api-entry-points-and-operations)
3. [Objects](#api-objects)
4. [Events of a handle](#events-of-a-handle)
5. [Order across handles](#api-order-across-handles)
6. [Lifetimes](#lifetimes)
7. [Errors](#api-errors)

<a id="api-two-ways-to-run-a-query"></a>
<a id="api-carrying-a-request-out-at-once"></a>

## Two ways to run a query

A query runs in one of two ways, and runs the same in both:

- **Directly, in one call,** for a query used once: `domql.evaluate(text, bindings)` answers its result.
- **Through a query object,** for a query used again: `domql.query(text, bindings)` makes the object, which holds the query and its bindings, and the object's methods run it, as often as needed. `domql.query(text, bindings).evaluate()` answers what `domql.evaluate(text, bindings)` does.

```js
// Once, directly.
const size = domql.evaluate('panel.size', { panel });

// Again and again, through a query object.
const panelQuery = domql.query('panel { size = it.size }', { panel });
const now = panelQuery.evaluate();                 // Its result now.
const width = panelQuery.select('size', 'width');  // Its width alone: width.evaluate() runs the query and answers it.
const watch = panelQuery.watch({ signal });        // Its result kept current until the signal aborts.
```

Both ways offer the same six operations. Which one a query takes follows from what it does: a query that reads the page is evaluated or watched, one that listens to it is subscribed to, and one that changes it is executed or run.

| Operation | What it does | Returns |
| --- | --- | --- |
| `evaluate` | Runs a query that reads the page, once | Its result |
| `evaluateAsync` | Runs it once, first waiting for the values that arrive later from an observer, as whether an element is in view | A promise of its result |
| `watch` | Keeps its result current as the page changes | A `DomqlWatch` |
| `subscribe` | Calls a handler with each event a query listens for, as each click | A `DomqlEventListener` |
| `executeAsync` | Makes a change once, as moving the focus | A promise of what the change answers |
| `run` | Starts a change that keeps running, as a trap holding the focus in a dialog, until its handle ends it | A `DomqlExecutionHandle` |

- **Their arguments.** Run directly, an operation takes the query's text, or its [definition](queries.md#making-a-query), then its bindings, then its options: `domql.watch(text, bindings, options)`. `subscribe` takes its handler after the bindings: `domql.subscribe(text, bindings, handler, options)`. Through a query object, an operation takes its options alone, `query.watch(options)`, `subscribe` its handler first, `query.subscribe(handler, options)`.
- **Their options.** Each operation's own are listed [below](#api-entry-points-and-operations). Run directly, an operation takes the query object's own option too, `types`, which [declares a binding's type](queries.md#making-a-query-declared-types): `domql.evaluate(text, bindings, { types, window })`.
- **Their failures.** An operation whose name ends in `Async` reports every failure by rejecting its promise, a text that isn't a valid query included. The others throw it.
- **When to keep a query object.** To run a query again, to bind it to other values with `query.with(bindings)`, to select part of its result with `query.select(...path)`, or to check it with `query.resolve()` before running it. Running a query directly costs no more than through an object: DOMQL reuses the work of reading and checking a text it has seen.

An operation that keeps running, a watch, a subscription or a running change, answers a **handle**, through which its caller follows it and ends it. The package exports `domql` and `NexoError` by name, and its TypeScript declarations type a query by its result, `domql.query<T>(…)` and `domql.evaluate<T>(…)`, and each handle by what it delivers.

<a id="api-entry-points-and-operations"></a>

## Entry points and operations

Each entry point and operation is listed here with what it takes, and the section it names defines how it behaves.

| Entry point or operation | Meaning |
| --- | --- |
| `domql.query(text, bindings?, options?)`, `domql.query(definition, bindings?, options?)` | Makes a query object, binding its parameters, each of the type `options.types` [declares](queries.md#making-a-query-declared-types) for it, as [making a query](queries.md#making-a-query) sets out |
| `domql.evaluate(text, bindings?, options?)`, and `domql.evaluateAsync`, `domql.watch`, `domql.executeAsync` and `domql.run` alike; `domql.subscribe(text, bindings, handler, options?)` | Runs a query directly, in one call, as the query object `domql.query(text, bindings)` makes runs it, as [two ways to run a query](#api-two-ways-to-run-a-query) sets out; each takes a definition in place of the text too |
| `query.definition` | The query's immutable definition, without its bindings |
| `query.with(bindings)` | A new query with the same definition, bound to these bindings, of the types the query declares |
| `query.resolve(options?)` | Resolves and types a request without evaluating anything, as [resolution](queries.md#queries-resolution) sets out |
| `query.select(...path)` | A part of its result, as [selecting a result](queries.md#selecting-a-result) sets out |
| `query.evaluate(options?)` | Evaluates a query once, as [evaluating a query](evaluation.md#evaluating) sets out; its options are `window` and `owner` |
| `query.evaluateAsync(options?)` | Evaluates a query once, waiting for its maintained members, as [waiting for maintained members](evaluation.md#waiting-for-maintained-members) sets out; its options are `window`, `owner` and `signal` |
| `query.watch(options?)` | Watches a query, answering a `DomqlWatch`, as [the watch and its handle](watches.md#the-watch-and-its-handle) sets out |
| `query.subscribe(handler, options?)` | Subscribes to a subscription, answering a `DomqlEventListener`, as [subscribing](events.md#subscribing) sets out |
| `query.executeAsync(options?)` | Carries out a once execution, answering a promise of its result, as [executing once](executions.md#executions-executing-once) sets out |
| `query.run(options?)` | Starts a continuous execution, answering a `DomqlExecutionHandle`, as [running continuously](executions.md#executions-running-continuously) sets out |
| `domql.format(source)` | The canonical text of a text, a definition or a query object, as [formatting](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/definition.md#definition-canonical-text) sets out |
| `domql.createModule(name, contents)` | Creates a module from its declarations, each that runs code carrying its implementation, as [extension modules](vocabulary.md#extension-modules) set out |
| `domql.registerModule(module)` | Registers a module's declarations in the instance's registry, as [extension modules](vocabulary.md#extension-modules) set out |
| `domql.registerModuleLoader(name, load)` | Registers the loader of a module loaded on request, as [loading a module on request](vocabulary.md#extension-modules-loading) sets out |
| `domql.loadModulesAsync(modules)` | Loads and registers every module named that the instance doesn't hold yet, answering a promise, as [loading a module on request](vocabulary.md#extension-modules-loading) sets out |
| `domql.info` | Which build this is and what it follows, in `versions`: `runtime`, the runtime release version, which the package and the bundle carry, its sources reporting the same; `specification`, the version of DOMQL's specification it follows; and `language`, the language specification version the Nexo runtime it runs on follows, its `nexo.info.versions.language` |

Almost every operation answers directly, so the plain name is the synchronous one, and every operation that answers a promise takes the suffix `Async`, as `evaluateAsync`, `readyAsync`, `refreshAsync` and `executeAsync` do.

<a id="api-the-owner"></a>

**The owner.** Every operation takes an `owner` among its options, who carries the request out: any value, null by default, the owner every operation that names none shares. Every implementation the operation reaches receives it as `env.owner`; a continuous execution runs for it, and a command reaches the behavior running for it, as [behaviors](behaviors.md#behaviors-the-owner) set out.

<a id="api-objects"></a>

## Objects

| Object | Members | Defined in |
| --- | --- | --- |
| `DomqlQuery` | `definition`, `with(bindings)`, `resolve(options?)`, `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(options?)`, `subscribe(handler, options?)`, `executeAsync(options?)`, `run(options?)` | [Making a query](queries.md#making-a-query) |
| `DomqlSelection` | `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(options?)` | [Selecting a result](queries.md#selecting-a-result) |
| `DomqlWatch` | `status`, `snapshot`, `error`, `sourceOf(...path)`, `readyAsync(options?)`, `refreshAsync(options?)`, `subscribe(eventName, handler, options?)`, `dispose()`, and `select(...path)` for snapshots or `liveState` for live state | [The watch and its handle](watches.md#the-watch-and-its-handle), [live state](results.md#live-state) |
| `DomqlSelectedView` | `snapshot`, `status`, `error`, `select(...path)`, `sourceOf(...path)`, `subscribe(eventName, handler, options?)`, `readyAsync(options?)` | [Sharing a watch](watches.md#sharing-a-watch) |
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

<a id="api-order-across-handles"></a>

## Order across handles

What DOMQL delivers reaches its handlers within the call or the callback that causes it, and what a caller asks of a handle takes effect within the call that asks it. So handlers hear what happens in the order it happens, across handles, subscriptions and owners, and a caller's calls take effect in the order it makes them:

| What | When it reaches its handlers, or takes effect |
| --- | --- |
| An occurrence a behavior delivers | Before `deliver` returns, every subscription listening for it called, as [delivering](behaviors.md#behaviors-occurrences) sets out; so a behavior that delivers a dismissal to one owner and then an action to another has the first owner's handlers called before the second's; an occurrence a handler delivers inside it reaches every subscription before the delivery around it goes on, so a later subscription hears it first |
| An event of `on` | Within the browser's dispatch of that event, as [subscribing](events.md#subscribing) sets out, in the order the browser dispatches events |
| A watch's change | As its evaluation completes, at its schedule, as [when its handlers run](watches.md#watching-when-handlers-run) sets out; so it follows the occurrences and events of the task that changed what it read |
| `run`, `update`, `dispose` and `executeAsync` | Within the call: an execution starts, is updated or ends, and a once execution's implementation is invoked, before the call returns, as [executing once](executions.md#executions-executing-once) and [running continuously](executions.md#executions-running-continuously) set out; so updates to several handles apply in the order they are made, and a command reaches the instance the latest of them left running |

- **A promise a handler returns** is not waited for before the next handler is called, so the continuations of asynchronous handlers can interleave, and each occurrence's [acknowledgment](behaviors.md#behaviors-acknowledgment) settles as its own subscriptions apply it.
- **A caller that forwards what it hears,** as a host across an interop boundary does, keeps this order by sending in the order its handlers are called, through one queue for all its handles; that queue, its bounds and its transport are the caller's, as [keeping a copy of a result](results.md#results-keeping-a-copy) sets out. It sends each as it is queued, rather than once the far side has acknowledged the one before it: what the browser dispatches next, as the click after a blur, reaches the far side by a route of its own and overtakes what waits.

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

Every failure is a `NexoError` with its `code`, its `kind`, its `message` and the `location` it concerns, as Nexo's [errors](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/errors.md) set out, and a caller reads the code, the kind and the location rather than the message. A condition of Nexo's keeps its `NEXO` code, and one of DOMQL's own takes a `DOMQL` code, as [errors](errors.md) catalog them. A failure is reported where it arises: a syntax or structure failure as the query is made; a module failure as a module is created or registered, or as a request that uses a declaration without an implementation is carried out; a validation failure as the request is resolved; and an evaluation failure as it is carried out, a missing window among them.

A failure no handler or caller receives, as an `"error"` event no listener receives, a failure of an `"error"` handler or of a subscription's handler, or one a once execution reports after its caller stopped waiting, goes to the **window's error reporting**, its `reportError`, or the console where the window has none. A watch, an event listener and a waiting evaluation let go of every observation they hold even where letting go of one fails: each attempts every cleanup, reports a failure of one to the window's error reporting, and never lets it replace its result, its error or its cancellation.
