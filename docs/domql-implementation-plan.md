# DOMQL Implementation Plan

This plan records the steps that take DOMQL from what is built to what the [specification](domql-specification.md) and the [design](domql-design.md) describe, the decisions that shape them, the state of each step, and where the work departs from the design. The design is authoritative; this plan changes with the work and is retired when every step is done.

## Built

Each item is what exists and what checks it.

- **The language.** Parsing text and creating queries from their definition, with the position of every mistake. Checked by the tests of parsing and of the definition.
- **The vocabulary.** The built-in vocabulary declared as module data, and modules that extend it. Checked by the tests of modules, the registry and the vocabulary.
- **Resolution.** Resolving a definition against the vocabulary and typing its result, without a browser; the resolution is kept for its definition, so the queries parsed alike share it. Checked by the resolver tests and the tests of `Domql.resolve`.
- **Reading.** `read` reads every built-in member except `intersects`, which is maintained, and fails it with an evaluation error that says so; a subscription, which ends in an occurrence source such as `eventsOf`, is subscribed to and never read. `readAsync` waits for the first sample of a maintained member, evaluates again as samples arrive and as what the query depends on changes, and lets go of its observations when it answers, fails or is canceled. Each evaluation records its dependencies. A read answers detached, immutable data. Checked by the evaluator tests, in a simulated DOM, and by the browser tests, in Chromium, for geometry, for state the browser decides and for the reads that wait.
- **Observations.** The built-in vocabulary names the observations that cover its members' changes, as types a module declares, and observations are started, shared and ended through sessions. There is no public API for them yet. Checked by the tests of declarations, of the sessions and of the browser observers, and in Chromium by a test of each type of observation reporting a change.
- **Watching.** `Domql.watch` evaluates a query, reports its snapshot, and evaluates again when what the result depends on changes, at the next animation frame or in the task that reported the change, reporting a snapshot that differs and sharing the branches of the last that did not. A watch follows the document, keeps its dependencies through a failed evaluation, recovers, and is refreshed and disposed through its handle. Checked by the tests of watches and of comparing snapshots, in a simulated DOM, and in Chromium by a watch of a size and of a maintained member.
- **Subscribing.** `Domql.subscribe` answers an event listener, which starts a subscription's occurrence source in the call and, at each occurrence, captures the fields its event type declares and evaluates the object expression that follows the source, inside the source's delivery, handing the immutable result to its callback. A maintained member answers its latest sample, or null while it is pending, and is never waited for; the event listener keeps the sessions its last successful projection read, keeps them through a projection that fails, and lets go of everything when disposed. Checked by the tests of projection and of event listeners, in a simulated DOM, and in Chromium by an event listener of clicks and of a maintained member across occurrences.
- **Actions and behaviors.** `Domql.runAsync` runs an action once, after evaluating its receiver and arguments, and answers a promise of its result, checked against the type the action declares and read through the object expression that follows it; a signal cancels it, and nothing an action changed is undone. `Domql.activate` puts a behavior into effect in the call and answers a `DomqlBehavior`, whose `update` replaces its bindings whole, validating them before anything changes, and whose `dispose` ends it once. Checked by the tests of resolving actions and behaviors, of `runAsync`, and of behaviors, in a simulated DOM, and by the README's examples.
- **Live state.** A watch with `updateStrategy: 'liveState'` keeps its result as one object, updated in place by the change sets between its snapshots, so the root and every object and list beneath it keep their identity, and an item of a list projected from elements keeps its object as it moves. Its callback receives the object and the change set just applied; a failed evaluation leaves the object as it was. Checked by the tests of applying change sets in place, of live state, and of watches that keep it, in a simulated DOM, and by the README's example.
- **Change sets.** A watch that delivers change sets sends a baseline and then JSON Patch change sets, each acknowledged before the next is computed against the state it established, and recovers with a baseline of a new generation that nothing earlier can affect. Lists projected from elements change by element, through identities kept beside the result. A current snapshot applies each update atomically and gives a stale one no effect. Checked by the tests of computing and of applying change sets, each against expected patches and results and together, of the dispatcher and the current snapshot, and of watches delivering to a receiver.
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
- **The occurrence sources a behavior offers.** The specification subscribes to them as subscriptions of their own; how a behavior offers one is decided once a behavior that offers one exists.

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

const watcher = panelQuery
    .select("size")
    .watch(renderSize);

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

`with` answers a new query whose bindings replace the old ones whole; the query it was called on, and every operation running from it, are unaffected. A required binding that is missing fails before anything is carried out. A value that reveals no type of its own is bound with `domql.typed(value, type)`:

```js
const query = domql.query(`
    { panel: @panel { size: self.size }, ids: @ids }
`, {
    panel: domql.typed(null, "element?"),
    ids: domql.typed([], "list<number>")
});
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
| `query.watch(onChange, options?)` | Starts a watch, with `onChange` as its first attachment |
| `query.watch(options?)` | Starts a snapshot watch, its consumers attached separately |
| `query.subscribe(onEvent, options?)` | Listens to its occurrence source |
| `query.executeAsync(options?)` | Executes its action once |
| `query.apply(options?)` | Applies its behavior |

Evaluating a query only reads state; executing an action or applying a behavior explicitly requests effects. The request's source decides its kind, so the one entry point serves every request kind, and resolution refuses an operation the kind does not take before anything is evaluated or started, with an error that says what the request does and names the operation it takes:

```text
Cannot execute '@panel.size': it produces a value.
Use evaluate() or evaluateAsync().
```

The object `domql.query` answers is a query object, whatever it holds, and what it describes is its request kind: a query, a subscription, an action or a behavior, as the specification names them. An error a caller reads says what the request does, a value it produces, occurrences it listens to, an effect it executes or a behavior it applies, rather than naming the kind.

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
const widthWatcher = width.watch(renderWidth);

rowsQuery.select(0, "height");
```

A selection offers `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(onChange, options?)` and `watch(options?)`. A path holds the names of written fields and list indices that are not negative.

- **A path's shape is checked at once.** `query.select(...)` refuses, without resolving anything, a path item that is neither a written field's name nor an index that is a whole number and not negative, as `-1` and `1.5` are not.
- **A path's fit is checked at resolution.** Whether a field exists, and whether an index applies to a list, is checked when an operation resolves the query, before anything is evaluated or observed; a selection of a query whose vocabulary is not yet registered is therefore made without failing.
- A nullable ancestor and a list index out of range give null.
- A list index follows a position, never a particular element.
- A selection reads the whole query's result, so the whole query decides its dependencies, its failures and its readiness.
- A selection's watch delivers its first value, each change to that value, and what recovery delivers. It watches snapshots alone; a caller that wants live state or change sets of a smaller result writes that result in DOMQL.

#### Watching

```js
const watcher = panelQuery.watch(renderPanel);

const configured = panelQuery.watch(renderPanel, {
    schedule: "frame",
    acceptPartialObservation: false,
    onError: reportError,
    signal: controller.signal,
    window
});
```

The update strategy stays an option, and the handle's type follows it:

```js
panelQuery.watch(renderPanel, { updateStrategy: "snapshot" });
panelQuery.watch((state, changes) => renderLivePanel(state, changes), { updateStrategy: "liveState" });
panelQuery.watch(sendUpdate, { updateStrategy: "changeSet" });
```

| Option | Default and meaning |
|---|---|
| `schedule` | `"frame"`, or `"immediate"` |
| `updateStrategy` | `"snapshot"`, or `"liveState"` or `"changeSet"` |
| `acceptPartialObservation` | `false` |
| `onError` | The window's error reporting, where it is left out |
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
| `dispose()` | Stops the watch and releases its sessions |

A failed watch keeps its last snapshot and goes on observing, so it recovers. `readyAsync({ signal })` cancels that wait alone; it rejects where an evaluation fails while it waits or the watch is disposed, and the watch goes on after a failed evaluation.

#### Sharing a snapshot watch

Each `watch` starts a watch of its own. To share one evaluation, a caller keeps its handle and attaches consumers to it:

```js
const watcher = panelQuery.watch({ onError: reportError });

const panelAttachment = watcher.attach(renderPanel);
const sizeAttachment = watcher.select("size").attach(renderSize);
const focusAttachment = watcher.select("hasFocus").attach(renderFocus);

sizeAttachment.dispose(); // Detaches one consumer.
watcher.dispose();        // Stops the watch and detaches every consumer.
```

- **A snapshot watch** offers `attach(onChange)` and `select(...path)`, whether it was started with a callback or without; a callback given to `watch` is its first attachment. Its query is resolved when the watch starts, so `watcher.select(...)` checks the whole path at once, its shape and its fit to the result's type alike, even before the first snapshot arrives.
- **A selected view** offers `snapshot`, `status`, `error`, `select(...path)`, `attach(onChange)` and `readyAsync(options?)`. It starts no evaluation of its own and needs no disposal.
- **An attachment** offers `status`, `"ready"` or `"disposed"`, and `dispose()`, which detaches its consumer.
- **A late attachment** receives the current snapshot before the updates after it. A failing consumer is isolated from the others, and its failure goes to the owning watch's `onError`.
- **The watch runs until its owner disposes it,** whether or not consumers remain attached.

#### Live state and change sets

A live-state watch adds `watcher.liveState`, the stable object DOMQL keeps current, `undefined` before the first snapshot; the caller reads it and never writes it, and the result is still a non-nullable object or list. A change-set watch adds `watcher.acknowledge(update)` and `watcher.recover()`, which only its handle has. Both deliver through the callback they were started with: `attach` and `select` belong to snapshot watches. The receiving side stays `domql.createSnapshot()`:

```js
const current = domql.createSnapshot();

const watcher = panelQuery.watch(update => {
    const outcome = current.apply(update); // "accepted", "stale" or "failed".

    if (outcome === "accepted") {
        watcher.acknowledge(update);
        renderPanel(current.value);
    } else if (outcome === "failed") {
        watcher.recover();
    }
}, {
    updateStrategy: "changeSet",
    onError: reportError
});
```

Baselines, revisions, acknowledgment, coalescing, atomic application and recovery keep their contracts, and the first callback still follows the call, once the caller holds the handle.

#### Events, actions and behaviors

```js
const clicks = domql.query(`
    (@button eventsOf "click") {
        panelSize: @panel.size
    }
`, { button, panel });

const listener = clicks.subscribe(handleClick, { onError: reportError, signal: controller.signal });

const result = await domql.query(actionText, bindings).executeAsync({ signal: controller.signal });

const behavior = domql.query(behaviorText, bindings).apply({ signal: controller.signal });
behavior.update(nextBindings);
behavior.dispose();
```

- **An event listener** offers `status`, `"ready"` or `"disposed"`, and `dispose()`; `subscribe` takes `window`, `signal` and `onError`. Listening starts in the call, occurrences keep their capture and projection, never waiting for maintained samples, and each `subscribe` owns its own listener.
- **An action** is executed again each time `executeAsync` is called, with `window` and `signal`; cancellation undoes nothing, and its result is detached, immutable data checked against the type the action declares.
- **A behavior's handle** offers `status`, `"ready"` or `"disposed"`, `update(bindings)` and `dispose()`; `apply` takes `window` and `signal`. Applying and updating stay synchronous, and `update` replaces every binding, validates before the behavior is called, and never switches to another behavior's declaration.

#### Lifetimes and callbacks

A `signal` is one lifetime for watches, event listeners and behaviors alike:

```js
const lifetime = new AbortController();

panelQuery.watch(renderPanel, { signal: lifetime.signal });
clicks.subscribe(handleClick, { signal: lifetime.signal });

lifetime.abort();
```

An operation that answers a handle, given a signal already aborted, answers a disposed handle and starts nothing; an operation that answers a promise rejects with the signal's reason. A signal is an option an operation accepts; no handle exposes one, since a `handle.signal` would need a contract of its own. The callback rules stand: deliveries keep their order, a promise a callback returns is not awaited, a failing callback undoes no accepted result, and disposal prevents any new callback while one already running may finish.

#### Tooling and extensions

| API | What it is |
|---|---|
| `domql.format(source)` | The canonical text of a text, a definition or a query object |
| `query.resolve(options?)` | Resolution without evaluation, with its `watch` and `acceptPartialObservation` options |
| `domql.createModule(name, contents, functions)` | A module |
| `domql.registerModule(module)` | Registers a module's vocabulary |
| `domql.createSnapshot()` | A change-set receiver |

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
- **Renamed:** `Domql` becomes `domql`, and `Domql.bind` becomes `domql.typed`. Reading a query becomes evaluating it, running an action executing it, and activating a behavior applying it, in the API and in the documents alike: `evaluate`, `evaluateAsync`, `executeAsync` and `apply`; a query's rebinding is `with`, and `resolve` keeps its name, since it resolves the query.
- **Moved onto the query:** evaluating, watching, subscribing, executing and applying, so `Domql.read(text, bindings)` and the other one-call forms give way to `domql.query(text, bindings).evaluate()` and its siblings.
- **Removed:** `parse`, which `query(...).definition` covers.
- **C#** mirrors the query object, with `Domql.Query(text, bindings)` and its operations, and `CancellationToken` for cancellation. `Domql.TryQuery` attempts exactly what `Domql.Query` does, creating a query and checking its syntax and structure without resolving its vocabulary or evaluating anything, so a successful return means the query was created, not that it is ready to be carried out: a syntax or structure failure returns false with a diagnostic, and any other failure is thrown, never swallowed.

State: **decided.** Built by step 13, after step 12.

## Steps

A step is done when its tests pass in the gate, its documents say what it built, and its state here says so. A step that is done keeps its line here alone.

- **1. Observation types and observations.** Done.
- **2. Dependencies and maintained members.** Done.
- **3. Watches.** Done.
- **4. Change sets and recovery.** Done.
- **5. Occurrence sources.** Done.
- **6. Actions and behaviors.** Done.
- **7. Live state.** Done.
- **8. The fluent builder.** Done; step 10 removed it, as D12 decides.

### 9. Measured performance

Make reads and watches cheaper where a measurement shows the work, leaving every result, error, error location and change set as it is.

- **Needs:** nothing new; it works inside what is built.
- **Done when:** each change below is measured on its own and kept only for a gain on the workload it targets that is repeatable beyond that workload's noise, with no meaningful loss on another, compared in the same environment on the same workloads; it lands with the regression tests that hold what it must keep, and the gate passes unchanged; the two changes that alter behavior are decided before they are built.
- **The workloads:** `npm run bench` from `tests/`, outside the gate, in the simulated DOM the tests use: a read of 1,000 shaped rows, and a small read by query and by text; a watch of 1,000 rows refreshed unchanged, and with one row changed under each update strategy; the change set of 1,000 items in six orders. Each baseline, and the measurements of each change, are kept under `.local/`.
- **The changes, in order:**
  1. A node's resolution found by the node, kept within its resolved definition so it never crosses bindings or options, with each node's pointer built once as the definition is resolved. Built: reads 24 to 34 percent faster, a watch's refresh 18 to 21 percent.
  2. Detaching a result in one pass, giving the same frozen result and identities. Built: reads 14 to 25 percent faster again.
  3. Each of these where a measurement shows its cost: each object expression's field names, each declared structure's field types, each node's tolerance and each `get` step's default arguments computed once, from inputs that are frozen; an object expression's object built so that a field named `__proto__` is still an ordinary property. Field names and structure field types are built, reading 5 to 9 and 23 percent faster; the tolerance and the defaults of a `get` step have shown no cost yet.
  4. The key of a call's bindings computed once, likewise, and a watch's change callback made once, which keeping a watch's sessions needs and which was built with it.
- **Decided separately, before they are built:**
  - Keeping an observation's session across a watch's evaluations when the same request repeats. Decided and built for watches, as the design's sessions set out, refreshing a watch 37 to 39 percent faster again; reading once and subscribing take sessions over only where a measurement shows the gain.
  - A list's change set by its longest increasing subsequence, which sends one operation to move the first item to the end, where the current diff sends one for every other item. The current diff takes at most half a millisecond for 1,000 items in any order, so this is a question of a change set's size and of what applying and sending it costs downstream, which the workloads do not yet measure; it changes which operations are sent, and their order, ties and repeated elements are settled with it. Open.
- **State:** in progress. Changes 1 and 2, and the session take-over, are built; change 3 is built in part, and so is change 4, whose key of a call's bindings remains with the change set by longest increasing subsequence.

### 10. Explicit receivers, calls and named operations

Write every receiver, and tell member access, calls and named operations apart, as D10 decides.

- **Needs:** D10, D12.
- **Done when:** the fluent builder is removed first, as D12 decides, with its generated types, the script that generates them and the documents that describe it, and every parser, writer and definition test it exercised kept as a test of its own; text and a definition each write member access, calls and named operations with explicit receivers, parsed, validated, written and resolved as D10 sets out, in definitions of version 3; `self` denotes the current value and is refused where there is none, and a definition whose member, call, named operation or predicate expression has no target is refused; an object argument is read by its declaration's input form; a bare member and a subjectless predicate are refused with an error giving the form with `self`; every operation and occurrence source declares its form and its input, the built-in vocabulary's as D10's table gives, a direct declaration having exactly one parameter, and a form its declaration does not take is refused with an error giving the one it does; an options object maps its fields onto the declared parameters before evaluation, each following its parameter's rules, refusing an unknown field, requiring the required and defaulting the optional; a named operation requires its separators; `rectRelativeTo` reads a rectangle relative to an element; every field is written with its name, a field without one is refused by the syntax and by the definition, and nothing infers one; a parameter is one token with its `@`, and an empty object expression is a syntax error; and the specification, the design, the READMEs and every example and test are written with explicit receivers, the specification stating what `self` is for every parameter.
- **State:** done. The builder went first, so it was never migrated. Every receiver is written, `self` is the current value, and member access, calls and named operations are distinct nodes of definitions of version 3, each checked against the form its declaration takes; an argument supplies its member's input, directly or as an options object, and `rect` relative to an element is `rectRelativeTo`. Every field is written with its name, an empty object expression is a syntax error, and a parameter is one token. The specification states what `self` is in an argument by the kind of its parameter, and names the built-in expression parameters.

### 11. Conditional and logical expressions

Choose between two values, group expressions and combine Boolean expressions, as D10 decides.

- **Needs:** D10, step 10.
- **Done when:** text and a definition each write a conditional, an `elseif`, a group and a logical expression, parsed, validated, written and resolved as D10 sets out, a definition written back as text with the parentheses its grouping needs; `is` and `has` read one predicate name, held under `name`, and `and` and `or` combine complete Boolean expressions alone, answering as the three-valued table gives; an `elseif` is recorded as a conditional nested in the alternative before it and written back as `elseif`, parsing, writing and parsing again giving the same definition; `is null` answers whether its subject is null; true, false and null conditions select their branches; branches of one type with different nullability answer the nullable type, and branches of different types fail with a validation error naming both; only the selected branch and the operands evaluation reaches are evaluated, and a watch follows what was, matching a list a conditional gave by element and comparing a number it gave within the tolerance of the member its branch read, exactly where the branch changed; a group starts a chain, as `(if @wide then @panel else @sidebar).rect.width` does; and the specification, the design and the READMEs describe them, the earlier shorthand of predicate names replaced.
- **State:** done. Groups and logical expressions came first: `is` and `has` read one predicate name under `name`, and `and` and `or` combine Boolean expressions by the three-valued table. Conditionals followed explicit receivers: a condition of false or null moves to the next clause, only the selected branch is evaluated, and the branches join into one type, nullable where either is; an `elseif` is a conditional nested in the alternative before it, written back as `elseif`; and `is null` answers whether its subject is null. Evaluation keeps the branch each conditional selected for each place in the result beside the elements its lists came from, so a watch compares what a conditional gave by the member its branch read, and every list projected from elements is matched by element wherever it stands.

### 12. Local values

Name a value once in an object expression and use it after, as D11 decides.

- **Needs:** D11, step 10.
- **Done when:** text and a definition each write locals, parsed, validated, written and resolved as D11 sets out; a bare name starting a chain is a local, and one no local in scope has is refused with an error giving the form with `self` where a member has that name; locals come before the fields, a local is visible only after it, and it refuses a name taken in its object expression or by an enclosing one, and is refused in an options object; its `self` is where it is written, which using it inside a nested projection leaves unchanged; each application of its object expression in each evaluation evaluates it at most once, at its first use there, so each item of a list gets its own and a later evaluation a fresh one; an unused local evaluates nothing and adds no dependency; it is never output, and a watch follows what it read, each of these with a test of its own; the specification, the design and the READMEs describe it; and the specification's grammar is D10's complete grammar, with its rule names and lexical rules, a condition and an operand of `and` or `or` any operand the grammar allows and Boolean by type, and a conditional that is a condition refused unless grouped, which the parser follows as its contract and which D10's retirement leaves to the specification alone.
- **State:** done. An object expression names its locals with `let` before its fields, and a bare name that starts a chain uses one, resolved where it is written; a name no local in scope has is refused in resolution with the form of the current value's member of that name, and a duplicate or shadowing local by the structure. Each application of an object expression evaluates its locals at their first use, at most once, and a local gives the comparer the expression it names, so its tolerance and branches apply where it is used. The specification holds the complete grammar and every rule D10 and D11 decided, and both are retired.

### 13. The API

Carry every operation out through a query object, as D12 decides.

- **Needs:** D12, step 12.
- **Done when:** `domql.query` takes text or a definition with its bindings and answers a query object that evaluates nothing until an operation is carried out, a text's definition reused for identical text; `with` answers a new query and `domql.typed` binds a value's type; evaluating, selecting, watching, attaching, subscribing, executing and applying behave as D12 sets out, an operation the request's kind does not take refused with an error naming the one it does, every handle with the members its table gives, a signal ending each lifetime, and an aborted one starting nothing; a path's shape is checked when it is selected and its fit when the query is resolved, and a watch's selections at once; `domql.format` gives one canonical text for a text, a definition or a query object, stable when formatted again; `parse` is gone, `Domql` is `domql`, and the package exports `domql` and `DomqlError`; the TypeScript declarations are complete without the builder's, and compile checks cover the exports, the query object's operations, selections, handles, attachments and every overload of `watch`; the benchmarks and the browser tests use the query object and run, each by its own command; and the specification, the design, the READMEs, the repository's own instructions and every example and test use the query object, and the documents evaluate queries, execute actions and apply behaviors in D12's words.
- **State:** not started.

### 14. Editor tooling

Diagnostics and completion over the grammar and the declaration metadata, without running a capability.

- **Needs:** nothing of the runtime.
- **Done when:** a query text is checked against the declarations available to its project, reporting the same positions and messages as resolution.
- **State:** not started.

### 15. The C# half

The query object of D12 for a .NET host: `Domql.Query(text, bindings)` and its operations, `Domql.TryQuery`, typed mapping and snapshots, with `CancellationToken` for cancellation.

- **Needs:** the JavaScript API settled (step 13), D4, D12.
- **State:** not started.

## Departures from the design

None. A departure is recorded here as it happens, with the reason, until the design is brought into line.
