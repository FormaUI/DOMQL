# DOMQL Implementation Plan

This plan records the steps that take DOMQL from what is built to what the [specification](domql-specification.md) and the [design](domql-design.md) describe, the decisions that shape them, the state of each step, and where the work departs from the design. The design is authoritative; this plan changes with the work and is retired when every step is done.

## Built

Each item is what exists and what checks it.

- **The language.** Parsing text and creating queries from their definition, with the position of every mistake. Checked by the tests of parsing and of the definition.
- **The vocabulary.** The built-in vocabulary declared as module data, and modules that extend it. Checked by the tests of modules, the registry and the vocabulary.
- **Resolution.** Resolving a definition against the vocabulary and typing its result, without a browser; the resolution is kept for its definition, so the queries parsed alike share it. Checked by the resolver tests and the tests of `Domql.resolve`.
- **Reading.** `read` reads every built-in member except `intersects`, which is maintained, and fails it with an evaluation error that says so; a subscription, which ends in an event source such as `eventsOf`, is subscribed to and never read. `readAsync` waits for the first sample of a maintained member, evaluates again as samples arrive and as what the query depends on changes, and lets go of its observations when it answers, fails or is canceled. Each evaluation records its dependencies. A read answers detached, immutable data. Checked by the evaluator tests, in a simulated DOM, and by the browser tests, in Chromium, for geometry, for state the browser decides and for the reads that wait.
- **Observations.** The built-in vocabulary names the observations that cover its members' changes, as types a module declares, and observations are started, shared and ended through sessions. There is no public API for them yet. Checked by the tests of declarations, of the sessions and of the browser observers, and in Chromium by a test of each type of observation reporting a change.
- **Watching.** `Domql.watch` evaluates a query, reports its snapshot, and evaluates again when what the result depends on changes, at the next animation frame or in the task that reported the change, reporting a snapshot that differs and sharing the branches of the last that did not. A watch follows the document, keeps its dependencies through a failed evaluation, recovers, and is refreshed and disposed through its handle. Checked by the tests of watches and of comparing snapshots, in a simulated DOM, and in Chromium by a watch of a size and of a maintained member.
- **Subscribing.** `Domql.subscribe` answers an event listener, which starts a subscription's event source in the call and, at each event, captures the fields its event type declares and evaluates the object expression that follows the source, inside the source's delivery, handing the immutable result to its callback. A maintained member answers its latest sample, or null while it is pending, and is never waited for; the event listener keeps the sessions its last successful projection read, keeps them through a projection that fails, and lets go of everything when disposed. Checked by the tests of projection and of event listeners, in a simulated DOM, and in Chromium by an event listener of clicks and of a maintained member across events.
- **Actions and behaviors.** `Domql.runAsync` runs an action once, after evaluating its receiver and arguments, and answers a promise of its result, checked against the type the action declares and read through the object expression that follows it; a signal cancels it, and nothing an action changed is undone. `Domql.activate` puts a behavior into effect in the call and answers a `DomqlBehavior`, whose `update` replaces its bindings whole, validating them before anything changes, and whose `dispose` ends it once. Checked by the tests of resolving actions and behaviors, of `runAsync`, and of behaviors, in a simulated DOM, and by the README's examples.
- **Live state.** A watch with `updateStrategy: 'liveState'` keeps its result as one object, updated in place by the change sets between its snapshots, so the root and every object and list beneath it keep their identity, and an item of a list projected from elements keeps its object as it moves. Its callback receives the object and the change set just applied; a failed evaluation leaves the object as it was. Checked by the tests of applying change sets in place, of live state, and of watches that keep it, in a simulated DOM, and by the README's example.
- **Change sets.** The JSON Patch change sets that bring live state up to date, computed between snapshots; lists projected from elements change by element, through identities kept beside the result. Checked by the tests of computing change sets and of applying them in place, each against expected patches and results and together, and of watches that keep live state.
- **The package.** The bundle, with its TypeScript declarations checked against `Domql` and against a TypeScript caller; the READMEs' examples run as tests.

What is not built: the query object, editor tooling and the C# half.

## Decisions

Each decision is open until its state says otherwise, and a step that needs it does not start before. A decision that is built keeps its line here alone, and what it decided is in the specification or the design.

### Done

- **D1. How a declaration names the observations that cover its changes.** Done, built by step 1.
- **D2. How a read waits.** Done, built by step 2.
- **D3. The public API of a watch and an event listener.** Done, built by steps 3 to 5 and 7.
- **D4. What DOMQL owns and what a host owns.** Accepted, and stated by the design.
- **D5. The API of actions and behaviors.** Done, built by step 6.
- **D6. Predicate expressions and parenthesized arguments.** Done; D10 replaces its predicate names combined under one verb, which step 11 removed, and its phrases, which step 10 removed.
- **D7. One camelCase name for every member.** Done.
- **D8. How a caller holds live state.** Done, built by step 7.
- **D9. The fluent builder.** Done, built by step 8; D12 retires it, and step 10 removed it.
- **D10. Expressions, receivers and calls.** Done, built by steps 10 to 12.
- **D11. Local values.** Done, built by step 12.

### Open

- **Negation.** How a query negates a Boolean, which no construct does yet.
- **A behavior that waits.** A behavior that needs to wait before it is in effect would be applied by an `applyAsync` of its own; it is a possibility for later, no part of D12's API, and decided when one is needed.
- **The event sources a behavior offers.** The specification subscribes to them as subscriptions of their own; how a behavior offers one is decided once a behavior that offers one exists.
- **Members across shadow boundaries.** `host`, `shadowRoot` for an open root, and `assignedElements` for a slot are the candidates. Deciding them settles whether `host` applies to any element inside a shadow tree or only to a root, how a shadow root is typed, and whether `assignedElements` gives flattened assignments. A flat-tree parent waits until its uses and its meaning are clear.
- **Saying which declaration a value means.** Where a null receiver or an empty list fits declarations that the specification refuses as ambiguous, a caller has no way to say which it means. A way is designed for the first case that needs one, from that case.
- **Incremental evaluation.** Explore incremental evaluation for attribute projections over child elements, including dependency invalidation, retained evaluation state, and fallback to full evaluation. The open question is whether the evaluations that remain valid after a change can be determined reliably: locals, branches and short-circuiting make dependencies conditional, and selectors change membership and order.

### D12. The API

A caller makes a query object once, from text or a definition with its bindings, and carries out every operation through it. This supersedes D9: the fluent builder is retired.

```js
const panelQuery = domql.query(`
    @panel {
        size: self.size,
        hasFocus: self matches ":focus-within"
    }
`, { panel });

const snapshot = await panelQuery.evaluateAsync();

const watcher = panelQuery.watch();

watcher.select("size").subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderSize(args.value);
    }
});

watcher.dispose();
```

#### Creating and binding a query

One entry point takes text or a definition:

```js
domql.query(text, bindings?)
domql.query(definition, bindings?)
```

It answers a reusable query object. Creating one parses the text and checks its structure, and evaluates nothing in the document and has no effect; a text is parsed once and its definition reused for identical text, whatever the bindings, and a resolution is kept for as long as the vocabulary it was made against stands.

```js
const panelQuery = domql.query(text, { panel });

// The same expression with another complete set of bindings.
const otherPanelQuery = panelQuery.with({ panel: otherPanel });

// A query made first, and bound afterwards.
const template = domql.query(text);
const boundQuery = template.with({ panel });
```

`with` answers a new query whose bindings replace the old ones whole; the query it was called on, and every operation running from it, are unaffected. A required binding that is missing fails before anything is carried out. A binding declares no type: a null, an empty list and a list holding nulls are typed from the value, as the specification sets out.

```js
const query = domql.query(`
    { panel: @panel { size: self.size }, ids: @ids }
`, { panel: null, ids: [] });
```

#### The query object

| Member | What it is |
|---|---|
| `query.definition` | The immutable definition, without its bindings |
| `query.with(bindings)` | A new query with the same definition, bound to these bindings |
| `query.resolve(options?)` | The query validated against the vocabulary, its resolution open to inspection |
| `query.select(...path)` | A part of its result |
| `query.evaluate(options?)` | Evaluates it synchronously |
| `query.evaluateAsync(options?)` | Evaluates it once, waiting for maintained values |
| `query.watch(options?)` | Starts a watch, whose events its handle's listeners receive |
| `query.subscribe(handler, options?)` | Listens to its event source, calling the handler with each event's result |
| `query.executeAsync(options?)` | Executes its action once |
| `query.apply(options?)` | Applies its behavior |

Evaluating a query only reads state; executing an action or applying a behavior explicitly requests effects. The request's source decides its kind, so the one entry point serves every request kind, and resolution refuses an operation the kind does not take before anything is evaluated or started, with an error that says what the request does and names the operation it takes:

```text
Cannot execute '@panel.size': it produces a value.
Use evaluate() or evaluateAsync().
```

The object `domql.query` answers is a query object, whatever it holds, and what it describes is its request kind: a query, a subscription, an action or a behavior, as the specification names them. An error a caller reads says what the request does, a value it produces, events it listens to, an effect it executes or a behavior it applies, rather than naming the kind.

#### Evaluating

```js
const snapshot = panelQuery.evaluate();
const later = await panelQuery.evaluateAsync({ signal: controller.signal });
```

Both answer detached, immutable data. `evaluate` keeps its synchronous contract and fails on a maintained member that needs a sample; `evaluateAsync` evaluates any query, waiting where it must, and releases its observations when it settles.

| Operation | Options |
|---|---|
| `evaluate` | `window` |
| `evaluateAsync` | `window`, `signal` |

#### Selecting a result

```js
const size = panelQuery.select("size");
const width = panelQuery.select("size", "width"); // As panelQuery.select("size").select("width").

const currentWidth = await width.evaluateAsync();
const widthWatcher = width.watch();

rowsQuery.select(0, "height");
```

A selection offers `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)` and `watch(options?)`. A path holds the names of written fields and list indices that are not negative; a local is no field, so it is never part of a path.

- **A path's shape is checked at once.** `query.select(...)` refuses, without resolving anything, a path item that is neither a written field's name nor an index that is a whole number and not negative, as `-1` and `1.5` are not.
- **A path's fit is checked at resolution.** Whether a field exists, and whether an index applies to a list, is checked when an operation resolves the query, before anything is evaluated or observed; a selection of a query whose vocabulary is not yet registered is therefore made without failing.
- A nullable ancestor and a list index out of range give null.
- A list index follows a position, never a particular element.
- A selection reads the whole query's result, so the whole query decides its dependencies, its failures and its readiness.
- A selection's watch delivers its first value, each change to that value, and what recovery delivers. It watches snapshots alone; a caller that wants live state of a smaller result writes that result in DOMQL.

#### Watching

```js
const watcher = panelQuery.watch();

watcher.subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderPanel(args.value);
    } else {
        showError(args.error);
    }
});

const configured = panelQuery.watch({
    schedule: "frame",
    acceptPartialObservation: false,
    signal: controller.signal,
    window
});
```

The update strategy stays an option, and the handle's members follow it:

```js
panelQuery.watch();                                 // Immutable snapshots.
panelQuery.watch({ updateStrategy: "liveState" });  // One object kept current in place.
```

| Option | Default and meaning |
|---|---|
| `schedule` | `"frame"`, or `"immediate"` |
| `updateStrategy` | `"snapshot"`, or `"liveState"` |
| `acceptPartialObservation` | `false` |
| `signal` | Disposes the watch when it aborts |
| `window` | The window the watch reads, by default the environment's |

Every watch handle has:

| Member | What it is |
|---|---|
| `status` | `"pending"`, `"ready"`, `"failed"` or `"disposed"` |
| `snapshot` | The last successful immutable snapshot, `undefined` before the first, so a result that is null is told apart from none yet |
| `error` | The latest evaluation failure, cleared by the next success |
| `readyAsync(options?)` | Waits for a successful ready state and answers its immutable snapshot |
| `refreshAsync()` | Evaluates now |
| `subscribe(eventName, handler, options?)` | Listens to its events, answering a `DomqlEventListener` |
| `dispose()` | Stops the watch, releases its sessions and stops its listeners |

A failed watch keeps its last snapshot and goes on observing, so it recovers. `readyAsync({ signal })` cancels that wait alone; it rejects where an evaluation fails while it waits or the watch is disposed, and the watch goes on after a failed evaluation.

#### Events of a handle

Every running watch and behavior raises events, which the listeners subscribed to it receive; a query object holds none, so queries shared between callers never share their listeners.

```js
const listener = watcher.subscribe("change", (sender, args) => { /* … */ }, { signal });

listener.dispose(); // Stops this listener.
```

- **A handler** is called with `(sender, args)`: the handle that raised the event, and an object of its own for each event, holding what that event carries. A snapshot it carries is immutable; the live state it carries is the object DOMQL keeps current, mutable by DOMQL alone and read-only to the handler.
- **`subscribe(eventName, handler, options?)`** answers a `DomqlEventListener`, as `query.subscribe` does for an event source's events, with `status`, `"ready"` or `"disposed"`, and `dispose()`, which stops it; its `signal` option stops it when it aborts. Disposing a handle stops every listener subscribed to it.
- **The events:**

  | Event | Raised by | `args` |
  |---|---|---|
  | `"change"` | A watch, to its own listeners and to those of its selected views | `status: "ready"` with `value`, or for live state `liveState`, the object kept current in place, `snapshot`, the immutable snapshot for this event, and `changes`, the immutable change set just applied; or `status: "failed"` with `error`, the evaluation's failure, after which the watch goes on observing and recovers |
  | `"error"` | A watch or a behavior | `error`, a failure that belongs to no result: a handler that throws or rejects, or a behavior failing while it runs; it changes no status |

- **`args.status` and `sender.status`.** `args.status` is the status the event reports; `sender.status` is the handle's status now, which may have moved on by the time an asynchronous handler resumes.
- **A late listener misses nothing.** A listener subscribed to a watch or a selected view that already has a result receives that result first, before the events after it. The first result always follows the call that started the watch, so a listener subscribed right after `watch()` receives it.
- **Each listener's first ready event establishes its baseline:** the current whole value, with an empty change set for live state, and the changes after it are relative to that value. Later events may have empty changes too, so a listener that applies changes tracks whether it has its baseline.
- **Order and failures.** Handlers run in the order their listeners were subscribed. A promise a handler returns is not awaited; a handler that throws or rejects keeps no other handler from the event, undoes no result, and is reported to the `"error"` handlers of the watch or behavior that raised the event. A failure of an `"error"` handler or of the handler `query.subscribe` calls, and an `"error"` event no listener receives, go to the environment's error reporting; no handler is called with its own failure, and nothing is called again. Disposal prevents any new handler call; one already running may finish.

#### Sharing a watch

Each `watch` starts a watch of its own. To share one evaluation, a caller keeps its handle and subscribes to it and to views of it:

```js
const watcher = panelQuery.watch();

watcher.subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderPanel(args.value);
    }
});

watcher.select("size").subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderSize(args.value);
    } else {
        showError(args.error);
    }
});
```

- **A selected view of a snapshot watch** offers `snapshot`, `status`, `error`, `select(...path)`, `subscribe(eventName, handler, options?)` and `readyAsync(options?)`. It starts no evaluation of its own and needs no disposal; its handlers' sender is the owning watch, and their `value` is the selected part. A snapshot watch's handle offers `select(...path)` too: its query is resolved when the watch starts, so `watcher.select(...)` checks the whole path at once, its shape and its fit to the result's type alike, even before the first snapshot arrives.
- **The watch runs until its owner disposes it,** whether or not listeners remain on it.

#### Live state

A live-state watch adds `watcher.liveState`, the stable object DOMQL keeps current, `undefined` before the first result; its `"change"` event carries the same object as `args.liveState`, with the immutable snapshot it was brought to as `args.snapshot` and the immutable change set just applied to it as `args.changes`. The caller reads it and never writes it, and the result is still a non-nullable object or list. Selected views belong to snapshot watches.

- **`args.snapshot` and `sender.snapshot`.** `args.snapshot` is the snapshot that event delivered; `sender.snapshot` is the watch's snapshot now, which may have moved on before queued work reads it.
- **Live state's changes are DOMQL's change sets.** A snapshot and every change set are immutable, so a caller that forwards them, as the C# half does, keeps them as they are without copying them. The C# half keeps its own result in step through them, as step 15 sets out.

#### Events, actions and behaviors

```js
const clicks = domql.query(`
    (@button eventsOf "click") {
        panelSize: @panel.size
    }
`, { button, panel });

const listener = clicks.subscribe((sender, args) => handleClick(args.value), { signal: controller.signal });

const result = await domql.query(actionText, bindings).executeAsync({ signal: controller.signal });

const behavior = domql.query(behaviorText, bindings).apply({ signal: controller.signal });
behavior.subscribe("error", (sender, args) => reportError(args.error));
behavior.update(nextBindings);
behavior.dispose();
```

- **An event listener** offers `status`, `"ready"` or `"disposed"`, and `dispose()`, whichever `subscribe` answered it. `query.subscribe` takes `window` and `signal`, and calls its handler with `(sender, args)`, the listener and, for each event, `status: "ready"` with the projected result as `value`, or `status: "failed"` with `error` alone where capturing or projecting the event fails. Listening starts in the call, events keep their capture and projection, never waiting for maintained samples, and each `query.subscribe` owns its own listener. A failed event leaves the listener listening, and the next event is captured and projected again; a failure of the handler itself goes to the environment's error reporting.
- **An action** is executed again each time `executeAsync` is called, with `window` and `signal`; cancellation undoes nothing, and its result is detached, immutable data checked against the type the action declares.
- **A behavior's handle** offers `status`, `"ready"` or `"disposed"`, `update(bindings)`, `subscribe(eventName, handler, options?)` and `dispose()`; `apply` takes `window` and `signal`, and a failure of the behavior while it runs reaches its `"error"` handlers. Applying and updating stay synchronous, and `update` replaces every binding, validates before the behavior is called, and never switches to another behavior's declaration.

#### Lifetimes and callbacks

A `signal` is one lifetime for watches, event listeners and behaviors alike:

```js
const lifetime = new AbortController();

panelQuery.watch({ signal: lifetime.signal });
clicks.subscribe((sender, args) => handleClick(args.value), { signal: lifetime.signal });

lifetime.abort();
```

An operation that answers a handle, given a signal already aborted, answers a disposed handle and starts nothing; an operation that answers a promise rejects with the signal's reason. A signal is an option an operation accepts; no handle exposes one, since a `handle.signal` would need a contract of its own. Every handler follows the rules of a handle's events.

#### Tooling and extensions

| API | What it is |
|---|---|
| `domql.format(source)` | The canonical text of a text, a definition or a query object |
| `query.resolve(options?)` | Resolution without evaluation, with its `watch` and `acceptPartialObservation` options |
| `domql.createModule(name, contents, functions)` | A module |
| `domql.registerModule(module)` | Registers a module's vocabulary |

There is no `parse`: `domql.query(text).definition` gives a text's immutable definition, without evaluating anything.

`domql.format` takes a text, a definition or a query object, and all three give the same canonical text, which the definition writer writes:

```js
domql.format(text)
domql.format(definition)
domql.format(query)
```

- **What it keeps.** The definition's meaning, and the order of its locals and fields as declared; comments and the original layout are discarded, as a definition holds neither.
- **What it needs.** Neither bindings nor a registered vocabulary: it parses and checks structure as `domql.query` does, and resolves nothing.
- **The layout.** Four spaces of indentation for each level of an object expression; an object expression of one field, with no locals, on one line, `{ size: self.size }`, and one of more on one line for each entry; a conditional with an `elseif` on one line for each clause; one space on each side of `and`, `or`, `is`, `has` and a named operation's separators; and no trailing comma.
- **It is stable.** Formatting text already formatted gives the same text. Module declarations and their implementation contracts stay as designed, observation sessions stay internal, and definitions stay open to programmatic authoring.

#### What it changes

- **The fluent builder is retired,** superseding D9 and what step 8 built: `Domql.build`, the builder's generated vocabulary types and the script that generates them, and D10's builder operations. Step 10 removes it first, before the language changes, so it is never migrated to what it would not survive. A text's result is `unknown` in TypeScript, and a result generic a caller gives is an assertion of its own, never inferred or checked; a definition given to `domql.query` leaves room for a builder later.
- **Exports.** The package exports `domql` and `DomqlError` by name, `import { domql, DomqlError } from "…/domql.js"`; the error class keeps its name, and `domql.specificationVersion` is the version of the specification the implementation follows.
- **Renamed:** `Domql` becomes `domql`. Reading a query becomes evaluating it, running an action executing it, and activating a behavior applying it, in the API and in the documents alike: `evaluate`, `evaluateAsync`, `executeAsync` and `apply`; a query's rebinding is `with`, and `resolve` keeps its name, since it resolves the query. Amended after D12 was decided: a resolved definition's `usedMembers` becomes `usedDeclarations`, since it lists the predicates a request uses as well as its members.
- **Moved onto the query:** evaluating, watching, subscribing, executing and applying, so `Domql.read(text, bindings)` and the other one-call forms give way to `domql.query(text, bindings).evaluate()` and its siblings.
- **Events of a handle:** watches and behaviors raise events to the listeners `subscribe` answers, each handler called with `(sender, args)`, so `onChange`, `onError` and attachments give way to `"change"` and `"error"` handlers; the handler `query.subscribe` calls takes the same two arguments and receives a failed capture or projection as a failed event, and every event listener has `status` and `dispose()` alone.
- **Change sets belong to live state alone.** The update strategies are `"snapshot"`, for immutable results, and `"liveState"`, for a mutable one. The change-set strategy is removed, with its acknowledgment, recovery, generations and revisions and the current snapshot that received it, and live state keeps its changes, the comparer, the patcher and identity matching.
- **Removed:** `parse`, which `query(...).definition` covers. Amended after D12 was decided: `Domql.bind` too, with no `domql.typed` in its place, since every binding is typed from its value.
- **C#** mirrors the query object, with `Domql.Query(text, bindings)` and its operations, and `CancellationToken` for cancellation. `Domql.TryQuery` attempts exactly what `Domql.Query` does, creating a query and checking its syntax and structure without resolving its vocabulary or evaluating anything, so a successful return means the query was created, not that it is ready to be carried out: a syntax or structure failure returns false with a diagnostic, and any other failure is thrown, never swallowed.

State: **decided.** Built by step 13, after step 12.

## Steps

A step is done when its tests pass in the gate, its documents say what it built, and its state here says so. A step that is done keeps its line here alone.

- **1. Observation types and observations.** Done.
- **2. Dependencies and maintained members.** Done.
- **3. Watches.** Done.
- **4. Change sets and recovery.** Done; step 13 removed the change-set strategy, and live state keeps its change sets, as D12 decides.
- **5. Event sources.** Done.
- **6. Actions and behaviors.** Done.
- **7. Live state.** Done.
- **8. The fluent builder.** Done; step 10 removed it, as D12 decides.
- **10. Explicit receivers, calls and named operations.** Done: every receiver is written, and member access, calls and named operations are distinct, each written in the form its declaration takes.
- **11. Conditional and logical expressions.** Done: conditionals with `elseif`, `is null`, groups, and `and` and `or` by the three-valued table, a watch comparing what a conditional gave by the branch it selected.
- **12. Local values.** Done: `let` names a value once in an object expression, and the specification holds the complete grammar.
- **16. Binding types.** Done: every binding takes its type from its value, null as a `null` and the empty list as a `list<never>`, and on a receiver of unknown type a property is accepted until the receiver's type is known, a call is checked by its name, its form and its arguments, and the request keeps its kind, an empty list refusing a tie between declarations as ambiguous.
- **17. Shadow trees in watches.** Done: an observation follows its receiver's root or every root of its flat-tree ancestry, a watch follows a receiver to another tree or slot, and `is "textEditable"` counts an inert ancestor in the flat tree. Following them adds 0.5 to 1 ms to refreshing a watch of 1,000 rows in the simulated DOM, most of it the scrolling each row's `rect` follows at its roots.

### 9. Measured performance

Make reads and watches cheaper where a measurement shows the work, leaving every result, error, error location and change set as it is.

- **Needs:** nothing new; it works inside what is built.
- **Done when:** each change below is measured on its own and kept only for a gain on the workload it targets that is repeatable beyond that workload's noise, with no meaningful loss on another, compared in the same environment on the same workloads; it lands with the regression tests that hold what it must keep, and the gate passes unchanged; the two changes that alter behavior are decided before they are built.
- **The workloads:** `npm run bench` from `tests/`, outside the gate, in the simulated DOM the tests use: a read of 1,000 shaped rows, and a small read by query and by text; a read and an unchanged refresh of 1,000 rows whose fields use locals and conditionals; a watch of 1,000 rows refreshed unchanged, and with one row changed under each update strategy; the change set of 1,000 items in six orders. Each baseline, and the measurements of each change, are kept under `.local/`.
- **The changes, in order:**
  1. A node's resolution found by the node, kept within its resolved definition so it never crosses bindings or options, with each node's pointer built once as the definition is resolved. Built: reads 24 to 34 percent faster, a watch's refresh 18 to 21 percent.
  2. Detaching a result in one pass, giving the same frozen result and identities. Built: reads 14 to 25 percent faster again.
  3. Each of these where a measurement shows its cost: each object expression's field names, each declared structure's field types, each node's tolerance and each `get` step's default arguments computed once, from inputs that are frozen; an object expression's object built so that a field named `__proto__` is still an ordinary property. Field names and structure field types are built, reading 5 to 9 and 23 percent faster; the tolerance and the defaults of a `get` step have shown no cost yet. A reconciled object or list allocated only at its first difference from the one before it, copying the part that matched, with identity reuse, ordering and change sets as they are, its gain measured on unchanged and changed refreshes alike, since the branching it adds may cost a changed one.
  4. The key of a call's bindings computed once, likewise, and a watch's change callback made once, which keeping a watch's sessions needs and which was built with it.
- **Decided separately, before they are built:**
  - Keeping an observation's session across a watch's evaluations when the same request repeats. Decided and built for watches, as the design's sessions set out, refreshing a watch 37 to 39 percent faster again; reading once and subscribing take sessions over only where a measurement shows the gain.
  - A list's change set by its longest increasing subsequence, which sends one operation to move the first item to the end, where the current diff sends one for every other item. The current diff takes at most half a millisecond for 1,000 items in any order, so this is a question of a change set's size and of what applying and sending it costs downstream, which the workloads do not yet measure; its `indexOf` and `splice` can grow quadratically with a large reorder. It is decided by the total cost of generating, delivering and applying a change set, never by generating it alone; it changes which operations are sent, and their order, ties and repeated elements are settled with it. Open.
- **State:** in progress. Changes 1 and 2, and the session take-over, are built; change 3 is built in part, and so is change 4, whose key of a call's bindings remains with the change set by longest increasing subsequence. Each percentage is the one measured when its change landed, evidence of that change rather than a measure of the runtime now. Compared after step 12 with the commit before step 10, three rounds each, steps 10 to 12 changed no workload beyond its noise, and the workload of locals and conditionals is a baseline of its own. The next comparison also measures the root tracking step 17 added, 0.5 to 1 ms a refresh of 1,000 rows when it landed.

### 13. The API

Carry every operation out through a query object, as D12 decides.

- **Needs:** D12, steps 12 and 16.
- **Done when:** `domql.query` takes text or a definition with its bindings and answers a query object that evaluates nothing until an operation is carried out, a text's definition reused for identical text; `with` answers a new query, and a binding declares no type; evaluating, selecting, watching, subscribing, executing and applying behave as D12 sets out, an operation the request's kind does not take refused with an error naming the one it does, every handle with the members its table gives, a signal ending each lifetime, and an aborted one starting nothing; watches and behaviors raise events to the listeners their `subscribe` answers, each handler called with `(sender, args)`, a watch and its selected views with `"change"` and both with `"error"`, every event listener with `status` and `dispose()` alone, and the handler `query.subscribe` calls receiving a failed capture or projection as a failed event while its listener listens on, a late listener receiving the current result first, handlers isolated from one another as D12 sets out, and each listener's first ready event its baseline; the update strategies are `"snapshot"` and `"liveState"`, a live-state event carrying its snapshot and its changes, and the change-set strategy is gone, with its acknowledgment, recovery, generations and revisions, the current snapshot and the code nothing else uses, while live state keeps its changes, the comparer, the patcher and identity matching; a path's shape is checked when it is selected and its fit when the query is resolved, and a watch's selections at once; `domql.format` gives one canonical text for a text, a definition or a query object, stable when formatted again; `parse` is gone, `Domql` is `domql`, and the package exports `domql` and `DomqlError`; the TypeScript declarations are complete without the builder's, and compile checks cover the exports, the query object's operations, selections, and handles, their events and their arguments; the benchmarks and the browser tests use the query object and run, each by its own command; and the specification, the design, the READMEs, the repository's own instructions and every example and test use the query object, and the documents evaluate queries, execute actions and apply behaviors in D12's words.
- **State:** in progress. Every operation is carried out through the query object, its handles raise their events, and the examples, the tests, the benchmarks and the READMEs use it; `domql.format`, and the specification and the repository's instructions in D12's words, remain. The change-set strategy is removed, with its acknowledgment, recovery, generations and revisions, the current snapshot and the code nothing else used, and live state keeps its changes, the comparer, the patcher and identity matching.

### 14. Editor tooling

Diagnostics and completion over the grammar and the declaration metadata, without running a capability.

- **Needs:** nothing of the runtime.
- **Done when:** a query text is checked against the declarations available to its project, reporting the same positions and messages as resolution.
- **State:** not started.

### 15. The C# half

The query object of D12 for a .NET host: `Domql.Query(text, bindings)` and its operations, `Domql.TryQuery`, typed mapping and snapshots, with `CancellationToken` for cancellation.

- **Needs:** the JavaScript API settled (step 13), D4, D12.
- **Keeping a watch's result in C#:** the adapter that carries a watch to the host owns its synchronization, and an application starts a watch and receives its results.
  - It watches live state by default.
  - It takes the initial baseline from the first ready event's `args.snapshot`.
  - It queues the changes after it, which are immutable, and delivers one update at a time, in order, sending the next only once the receiving side acknowledges that the one before it was applied completely. This is a scope decision; batching would not in itself need revisions, since consecutive change sets apply in order.
  - The acknowledgment follows application alone, never the application handlers, and a failed delivery stops every further update of that watch.
  - It applies each update so that no consumer observes a change set partly applied: access to the C# result while an update is applied follows an explicit rule, and a result whose application failed becomes unusable. Application handlers are notified once the update is applied.
  - It rejects a delivery from an obsolete watch on the receiving side, before applying it, through a token of its own for the watch it is following.
  - Where applying an update throws, a call rejects, or a call times out, leaving its outcome uncertain, it first invalidates the old watch, so that watch's late applications and acknowledgments change neither the replacement result nor the new queue, and then disposes it and rebuilds the result from a fresh watch's baseline.
  - Where the connection is lost with the components that hold its results, the components that replace them start watches of their own; where a connection resumes with the existing components, an update unanswered across the interruption is uncertain, and the adapter recovers as from a timeout.
  - It reports an exception from an application handler without restarting synchronization, since the state was already accepted.
  - Its application of change sets passes a conformance corpus the JavaScript patcher passes too: each case a previous result, a change set and the result they give, the expected results reviewed independently of either applier, moves and escaped paths among them.
- **State:** not started.

## Departures from the design

None. A departure is recorded here as it happens, with the reason, until the design is brought into line.
