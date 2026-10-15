# DOMQL Design v1.0.0-alpha

The [DOMQL specification](domql-specification.md) defines the language. This design sets out how DOMQL runs and is used: how requests are made and prepared, how an evaluation waits and a watch stays current, how results and changes are delivered, how events hold their observations, how actions are executed and behaviors applied, what DOMQL owns beside its host, how modules extend the vocabulary, and the API a caller uses.

This design describes the whole runtime, and the [README](../README.md#status) states what this implementation covers.

## Scope

| Decision | Contract |
| --- | --- |
| A small language | Chains, object expressions and their locals, lists, predicate expressions, logical expressions, negations and conditionals, with literals and parameters. Arithmetic, ordering and anything else a query needs computed belongs to a member or to the caller. |
| An open vocabulary | Everything a query can ask about is a member a vocabulary contributes; the built-in vocabulary and every extension follow one contract, and adding a member leaves the grammar unchanged. |
| Queries read, requests act | Evaluating, watching or subscribing to a request reads the document and changes nothing, whatever vocabulary it uses; an action or a behavior is a request of its own kind, carried out only when its caller executes or applies it. |
| One meaning | A query evaluates the same way for every caller, however it was written. |
| Two ways in | A query is parsed from text or created from its JSON definition, and each produces a definition with the same meaning, validated and evaluated alike. |
| Visible mistakes | A misspelling or a wrong argument is an error before anything is evaluated; a member's fit to its receiver is checked once the receiver's type is specific enough, which a null receiver's is not; null is always a result. |

## Preparation

An extension a request names is loaded when the request is prepared, before it is first carried out, and preparation validates it against the vocabulary, as the specification sets out.

### Evaluating

`query.evaluate()` resolves the query, then evaluates it once against the document in a single synchronous pass, following the resolution rather than looking names up again. A resolution is kept for its definition, for the options it was made under, for the types of its bindings and the strings, numbers, Booleans and nulls they bind, which can select what a member reads, and for the vocabulary it was made against, and is released with the definition, so an unchanged query, and every query made from the same text, is resolved once however often it is evaluated; what an evaluation reads is always the document as it is. Evaluating needs a browser window, the one it is given or the one the environment holds, and fails with an evaluation error where there is none, while making and resolving a query need none. The result is a detached copy, frozen, that holds nothing of the document. A member whose function answers a type other than the one it declares has broken its contract, and the evaluation fails with an evaluation error naming the member and where it stands in the query; so does a member whose function throws, with the thrown error as its cause. A member a module declares and does not implement fails the evaluation the same way. A member maintained by an observation cannot be read in a single synchronous pass and fails `evaluate`, with an evaluation error naming the member; `evaluateAsync` waits for it. A request of another kind is refused, as [operations and request kinds](#operations-and-request-kinds) sets out.

### Waiting for maintained members

A maintained member is pending until its first sample arrives, as the specification defines.

- **`evaluateAsync`, and a watch's first snapshot,** wait for the first sample of every pending member they read, evaluating again as samples arrive and as what they depend on changes, until an evaluation reads no pending member; only that result is delivered. The caller can cancel the wait, and a member that can produce no sample reports itself unavailable. The wait completes at the first evaluation that reads no pending member; dependencies that keep introducing pending members can keep it waiting until the caller cancels it.
- **A maintained member a watch first reads after its first snapshot** is pending in the snapshot the watch reports, and the watch evaluates again when its first sample arrives.
- **Inside an event's object expression,** a maintained member answers its latest sample, or null while pending, and is never waited for.
- **`evaluateAsync` evaluates any query,** answering as soon as an evaluation reads no pending member, so a query that reads none answers from its first evaluation and a caller can use it for every query. Its `signal` cancels it: one already aborted evaluates nothing, and one that aborts while it waits rejects the promise with its reason.
- **A failure seen through a pending member waits.** An evaluation that fails having read a maintained member still pending reports nothing and waits for that member's sample, since the failure may come from the null the member answered.
- **One result, not one instant.** The result is made of fresh reads and of the samples available when the last evaluation ran, and does not promise that every measurement was taken at the same moment.

### Sessions

Every observation a query starts is reached through a session, which the query disposes when `evaluateAsync` settles or is canceled, when the watch or the subscription ends, and when an evaluation no longer depends on it. An observation already running for another query is reached through a session of its own, which leaves its lifetime to its other sessions; the last session to be disposed stops it. Equivalent requests share one observation where their type permits it; a request's identity is its type, its target, the arguments its type says belong to it, and the window it belongs to, so two requests that differ in an argument that changes what is observed, such as an intersection's root or margin, never share. A session gives its consumer the change notifications of the observation and, for a maintained observation, its latest sample, until the consumer disposes it. A session whose callback fails is reported and does not keep the others from hearing of a change. A watch's evaluation takes over a session of the evaluations it replaces wherever it would acquire that same observation again, a shared one with the same type, target and arguments, so a session belongs to one evaluation at a time and an observation the watch keeps needing goes on reporting from one evaluation to the next. An evaluation once acquires the observations of the maintained members it reads, whose samples it needs, and holds those of its other members only while it waits, since a complete result needs nothing more observed; a watch holds them all. Disposing an evaluation disposes every session even where one fails to be disposed: a watch, an event listener and a waiting evaluation each attempt every cleanup, report a failure of one to the window's error reporting, and never let it replace their result, their error or their cancellation.

## Watching and dependencies

A watch keeps a query's result current: it evaluates the query, reports a snapshot of the result, and evaluates again when something the result depends on changes, reporting only a snapshot that differs.

### The watch and its handle

`query.watch(options?)` starts a watch and answers its handle, a `DomqlWatch`. Its options are its `schedule`, `frame` by default or `immediate`; its `updateStrategy`, `snapshot` by default or `liveState`; whether it accepts partial observation; its `signal`, which disposes it when it aborts; and its `window`. What the watch delivers reaches the listeners its handle's `subscribe` adds, as [events of a handle](#events-of-a-handle) sets out.

- **The first evaluation** runs in a microtask the call queues, after `watch` returns and before any later task, so a caller subscribes before any event is raised; a `refreshAsync` called before then runs that evaluation at once instead. Its result is the first `"change"` event.
- **Status.** `status` is `pending` until the first snapshot is available, the samples of the maintained members it reads included, and `ready` from then on. After an evaluation fails it is `failed`: the watch keeps running and keeps its last successful snapshot, if it has one, and returns to `ready` with its next successful evaluation. Once ended it is `disposed`. `snapshot` is the last successful snapshot, `undefined` before the first, so a result that is null is told apart from none yet, and `error` is the latest evaluation failure, cleared by the next success.
- **`readyAsync(options?)`** waits for a successful ready state and answers its snapshot. Its `signal` cancels that wait alone; it rejects where an evaluation fails while it waits or the watch is disposed, and the watch goes on after a failed evaluation.
- **`refreshAsync()`** evaluates now instead of at the schedule, and answers a promise that settles once that evaluation has completed and the event it produced, if any, has been raised. It does not wait for a promise a handler returns, so a handler can await a refresh. It rejects with the failure of its evaluation, which its `"change"` event reports too; it resolves without delivering where disposal cancels it; and it rejects where called after disposal.
- **`dispose()`** cancels the evaluation the watch scheduled, disposes every session, stops every listener subscribed to it, sets the status to `disposed` and prevents any new handler call; a handler already running may finish. Disposing again does nothing.

### Events of a handle

A running watch or behavior raises events, which the listeners subscribed to it receive; a query object holds none, so queries shared between callers never share their listeners. `subscribe(eventName, handler, options?)` adds a listener and answers a `DomqlEventListener`, with `status`, `ready` or `disposed`, and `dispose()`, which stops it; its `signal` option stops it when it aborts.

```js
const watcher = panelQuery.watch();

const listener = watcher.subscribe("change", (sender, args) => {
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
| `"change"` | A watch, to its own listeners and to those of its selected views | `status: "ready"` with `value`, or for live state `liveState`, `snapshot` and `changes`, as [live state](#live-state) sets out; or `status: "failed"` with `error`, the evaluation's failure, after which the watch goes on observing and recovers |
| `"error"` | A watch or a behavior | `error`, a failure that belongs to no result: a handler that throws or rejects, or a behavior failing while it runs; it changes no status |

- **A handler** is called with `(sender, args)`: the handle that raised the event, and an object of its own for each event, holding what that event carries. A snapshot it carries is immutable; the live state it carries is the object DOMQL keeps current, mutable by DOMQL alone and read-only to the handler.
- **`args.status` and `sender.status`.** `args.status` is the status the event reports; `sender.status` is the handle's status now, which may have moved on by the time an asynchronous handler resumes.
- **A late listener misses nothing.** A listener subscribed to a watch or a selected view that already has a result receives that result first, before the events after it.
- **Each listener's first ready event establishes its baseline:** the current whole value, with an empty change set for live state, and the changes after it are relative to that value. Later events may have empty changes too, so a listener that applies changes tracks whether it has its baseline.
- **Order.** Handlers run in the order their listeners were subscribed, and receive each event in the order the events were raised. DOMQL does not wait for the promise a handler returns, so the continuations of asynchronous handlers can overlap; a caller that needs them one at a time arranges that at its own delivery boundary.
- **Failures.** A handler that throws or rejects keeps no other handler from the event, undoes no result, does not stop the watch, and is reported to the `"error"` handlers of the watch or behavior that raised the event. A failure of an `"error"` handler, and an `"error"` event no listener receives, go to the window's error reporting; no handler is called with its own failure, nothing is called again, and no other handle is interrupted.
- **Disposal** prevents any new handler call; one already running may finish. Disposing a handle stops every listener subscribed to it.

### Sharing a watch

Each `watch` starts a watch of its own. To share one evaluation, a caller keeps its handle and subscribes to it and to views of it:

```js
const watcher = panelQuery.watch();

watcher.select("size").subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderSize(args.value);
    }
});
```

- **A selected view of a snapshot watch,** which `watcher.select(...path)` answers, offers `snapshot`, `status`, `error`, `select(...path)`, `subscribe(eventName, handler, options?)` and `readyAsync(options?)`. A selected view belongs to the running watch it was selected from, where a selection belongs to a query: it starts no evaluation of its own and needs no disposal, so it has no `dispose()`; each listener subscribed to it stops by its own `dispose()` or `signal`, and disposing the watch stops them all, as it stops its own. Its handlers' sender is the owning watch, and their `value` is the selected part, raised where that part changed, and after a failed evaluation whether or not it did. A watch's query is resolved when the watch starts, so `watcher.select(...)` checks the whole path at once, its shape and its fit to the result's type alike, even before the first snapshot arrives. A live-state watch offers no selected views.
- **The watch runs until its owner disposes it,** whether or not listeners remain on it.

### Accepting partial observation

Accepting partial observation is an option of the watch, chosen when the caller starts it, beside its schedule; it applies to that watch alone and leaves the query's meaning unchanged. A watch over a partly observable member without it is a validation error naming each such member and the changes its observations miss. An evaluation once needs no acceptance, since it keeps nothing current.

### Dependencies

A watch's dependencies are what its last evaluation actually read, recorded as it evaluated: each member applied to its receiver and arguments, with that member's observations. Dependencies belong to the complete query.

- **Every evaluation records its dependencies afresh,** and the watch subscribes to the observations the new set names and releases the ones it no longer names. What a watch observes therefore follows the document: in `@table.all("tbody tr").max(self.rect?.height)`, the watch depends on what the selector matches within the table, and on the height of each row it matched. A row added starts being observed after the evaluation the addition causes, and a row removed stops being observed.
- **A value argument is a dependency of its own.** `@target intersects { root: @panel }` depends on the intersection of the target with the panel; `self intersects { root: self.parent as "element" }` also depends on which element is the parent, and a new parent is observed after the evaluation its change causes.
- **An expression argument contributes its dependencies for every item** it was evaluated against.
- **A chain that met null depends on what it read before the null,** so `self.closest(".row")` finding nothing still depends on the ancestors it searched, and the watch evaluates again when one starts to match.
- **A watch keeps its bindings.** A query `with` other bindings starts a watch of its own.

Invalidation, evaluation and delivery each keep their own schedule. An observation invalidates the watch at once. The watch evaluates at the next animation frame, once however many observations fired, or immediately, in the task that reported the change, where its caller needs a change handled at the moment it is reported, such as at mutation delivery. When the caller receives the snapshot is the caller's own. Watches that depend on the same target through the same observation share one observation.

Evaluating the whole query each time is the design. A member may keep its result until its own observations fire, as long as the result is the one a full evaluation would give.

### Elements that leave the document

A member that answered null because its element is detached depends on whether that element is attached, so a watch reading it evaluates again when the same element returns to the document, and observes it again from that evaluation. Removing an element changes the results that read it, and a watch over them runs on until its caller ends it.

### Trees and slots

A watch follows its receivers through shadow trees, by two scopes of observation a module can name.

- **A node's root** is the root of the tree it is in, as `getRootNode` answers: its document, the shadow root it is in, or the top of a detached tree. An observation of it sees a change inside a shadow tree, which an observation of the document never reaches.
- **Its flat-tree ancestry** is found step by step from the node. A step goes to the slot the node is assigned to, where it is assigned to one; from a node whose parent is a shadow root, to that root's host; and otherwise to the node's parent. The nodes the steps reach are its **flat-tree ancestors**, which `is "textEditable"` reads for `inert`.
- **Its roots** are collected along those steps, nearest first, and each kept once: the shadow root each step to a host leaves; the open shadow root of each host whose child a step leaves, since that root's slots may come to take the child; and the node the steps end at, its document or the top of a detached tree. A node's own root is always among them, a slotted node's too, since it is a child of its host and in its host's tree; the shadow root a node hosts is not.
- **A closed shadow root hides its slots' assignments,** so a node assigned to one of its slots steps to its parent instead, and the roots past that slot are reached only from a node inside that root.

Moving a receiver, or one of its flat-tree ancestors, to another tree or slot evaluates the watch again, a move that leaves the receiver attached and an assignment made by hand included, and that evaluation observes the receiver's new root and roots and lets go of those it left. A receiver in a detached tree is followed into the document through whether it is attached. One move is not followed, since the browser reports nothing of it: a detached tree inserted into another detached tree or into a shadow root, even one in the document, changes nothing inside any root the watch observes, so a result that move changes is reported only when something else evaluates the watch again, and the members it changes are partly observable. A detached node another document owns, as a template's content does, is followed into the document all the same, through the document the watch runs against.

### When evaluation fails

A watch whose evaluation fails raises a failed `"change"` event, and keeps the dependencies of its last successful evaluation together with those the failed one recorded before failing. It evaluates again when any of them changes or its caller refreshes it, and its next successful evaluation reports its snapshot whether or not it equals the last one reported; a watch that keeps live state hands over an empty change set where the snapshot equals the last one.

### Cached state, snapshots and change sets

A watch keeps its result as cached state and hands its caller snapshots or live state:

| Concept | Is |
| --- | --- |
| Cached state | The watch's own copy of its result, updated in place as individual values change |
| Snapshot | An immutable result captured at one moment |
| Live state | A stable object a JavaScript caller holds, updated in place as the cached state is |
| Baseline | A complete result, establishing the state the changes after it are relative to |
| Change set | The fields and list entries that changed, relative to the result it was computed against |

A snapshot never changes once delivered. A new snapshot reuses every immutable branch that did not change and builds new ones only along the paths that did. Live state is the one value that changes under its holder: reading it at two moments can give two results, so it is chosen explicitly and is never a snapshot. Live state is brought up to date by change sets, and each one it applies reaches its caller beside it.

- **Change sets.** A change set is a [JSON Patch](https://www.rfc-editor.org/rfc/rfc6902) document limited to `replace`, `add`, `remove` and `move`, whose paths are JSON Pointers into the result; applying it to the result it was computed against gives the new result. A field the change set leaves out is unchanged, and a field that became null is replaced with null. An object expression's fields are fixed, so `add` and `remove` apply to list items alone.
- **Lists.** A list whose items come from elements changes by element: an element entering is added, one leaving is removed, one changing position is moved, and one whose result changed is changed inside its item. Any other list changes by position.
- **Identity.** A list projected from elements is matched by element, and two elements can project to the same data, so the identity of each item cannot be read back from a snapshot. Evaluation keeps the element each item came from as metadata beside the result, which the comparer and the change sets use and which neither a result nor a change set ever holds. A list that was not projected from elements, one with a null item, and one in which an element stands twice are matched by position.
- **What a change set reproduces.** A change set takes the result it was computed against to the reconciled snapshot, the one the watch reports, with every comparison and tolerance applied; it never describes a different, raw evaluation.

Evaluating only what changed and delivering only what changed are separate: a watch that evaluates its whole query still hands live state only the changes in its result.

### Live state

A watch keeps its result as live state when its caller chooses it as its update strategy, `updateStrategy: 'liveState'`, beside `snapshot`, so a watch delivers one kind of update.

- **What its event carries.** A ready `"change"` event carries `liveState`, the live object, the same one at every event; `snapshot`, the immutable snapshot the object was brought to; and `changes`, the change set just applied to it, computed against the snapshot the object was last brought to, immutable too. A handler that renders the whole object ignores the changes; one that patches a view of its own reads them. A listener's first ready event is its baseline: the object as it is, and an empty change set.
- **`args.snapshot` and `sender.snapshot`.** `args.snapshot` is the snapshot that event delivered; `sender.snapshot` is the watch's snapshot now, which may have moved on before queued work reads it. A caller that forwards the snapshot and the changes keeps them as they are, without copying them.
- **What keeps its identity.** The root, and every object and list beneath it while its path holds an object or a list: a field that changes is set on the object that holds it, an item added, removed or moved changes the list in place, and an item of a list projected from elements keeps its object as it moves, as change sets move it by element. A branch is a new object only where its value stops being one, as when a field turns from an object to null and back.
- **What it can hold.** The result must be an object or a list that is not nullable, since null has no identity to keep; a watch over another result is refused with a validation error that suggests a top-level object expression. Its values are data, as every result is.
- **Ownership.** The object belongs to the watch, which writes it; a caller reads it and never writes it, and the declarations type it as read-only. It is not frozen, since the watch updates it, and a caller that keeps a version copies it or keeps its snapshot.
- **Timing and failure.** Each change set is applied whole before its event is raised, in the evaluation that produced it. A failed evaluation leaves the object as it was, raises a failed `"change"` event and sets the status to `failed`; the next successful one brings the object up to date in one change set. A watch disposed stops changing the object, and its caller keeps it as it last was.
- **The handle.** `watcher.liveState` is the live object, `undefined` before the first result, and `snapshot` answers the immutable snapshot as a snapshot watch's does.

### Comparing snapshots

A watch reports a snapshot that differs from the last one it reported, compared field by field and item by item. Strings, Booleans and null compare exactly; a number compares within the tolerance its member declares, and exactly where it declares none.

A number a conditional gave compares within the tolerance of the member its branch read where the number last reported came from the same branch, and exactly where it came from another, which is a different reading whose difference no tolerance absorbs. A number a coalescing operator gave compares the same way, by the side it came from, its value or its fallback, and one an access by name gave by the property its name selected. A conditional can select a different branch at each place in the result, as for each item of a list, so evaluation keeps the branch each conditional selected for each place beside the elements its lists came from, and the comparer reads it there.

## Event delivery

An event's object expression is evaluated as the specification defines, and its result, immutable data, reaches the caller by the caller's own delivery.

A maintained member in an event's object expression reads its latest sample, or null while it is pending, never waits for a later one and never revises a result already delivered:

```
(@button eventsOf "click") {
    nearEnd: @sentinel intersects { root: @panel }
}
```

The subscription holds the sessions its object expressions acquire. After each successful evaluation it keeps the sessions that evaluation read and disposes the rest, so an observation one event started serves the next: the first event reports null for a member still pending, and a later one reads the sample that arrived meanwhile. A failed evaluation delivers no result and reports its failure as a failed event; the subscription keeps the sessions it held before it and disposes those the failed attempt acquired. Ending the subscription disposes every session it holds, and an observation another holder still has a session on runs on.

`query.subscribe(handler, options?)` listens to a subscription and answers a `DomqlEventListener`, the subscription's handle, with `status` and `dispose()` alone, as every event listener has; its options are `window` and `signal`, which disposes it when it aborts. The handler is called with `(sender, args)`: the event listener, and for each event `status: "ready"` with the event's result as `value`, or `status: "failed"` with `error` alone where capturing or projecting the event fails. Its handler's calls follow the order and the disposal of [events of a handle](#events-of-a-handle).

```js
const clicks = domql.query(`
    (@button eventsOf "click") {
        panelSize: @panel.size
    }
`, { button, panel });

const listener = clicks.subscribe((sender, args) => {
    if (args.status === "ready") {
        handleClick(args.value);
    }
}, { signal });
```

- **Listening starts in the call.** The event listener starts its source before `subscribe` returns, so an event dispatched right after the call is heard, and a source that cannot start fails the call with an evaluation error whose cause is what the source threw. Its `status` is `ready` from the call on and `disposed` once ended; it never waits for an event.
- **Events during the start.** A source may deliver while it starts. Those events are captured and projected at once, and the handler receives them once the caller holds the event listener, before any later event; where the start fails, the handler never receives them and the sessions they opened are disposed.
- **The receiver and the arguments** of the source are evaluated once, as listening starts, so an event listener does not follow a receiver that changes, and listens to nothing where the receiver or an argument is null.
- **A failed event,** one whose capture or object expression fails, reaches the handler with `status: "failed"` and leaves the event listener `ready`, listening; the next event is captured and projected again. A failure of the handler itself goes to the window's error reporting, and the handler is never called with its own failure.
- **`dispose()`** ends the listening, disposes every session the event listener holds and prevents any new handler call; one already running may finish. Disposing again does nothing.

## Actions and behaviors

An action is executed and a behavior applied, each through an operation of its own, and no other operation carries either out, as [operations and request kinds](#operations-and-request-kinds) sets out.

### Executing an action

`query.executeAsync(options?)` executes an action and answers a promise of its result; its options are `window` and `signal`. Each call executes the action again.

- **Evaluation first.** The receiver and the arguments are evaluated first, synchronously, as `evaluate` evaluates them; a failure there rejects the promise and executes nothing, and an action whose receiver or an argument is null is not executed, its result being null, as a member's is.
- **The result.** The action's function receives the receiver, the arguments, the environment and the signal, and may answer its result or a promise of it. The result must be of the type the action declares, and data alone; a result of another type rejects the promise with an evaluation error naming the action. An object expression that follows the action is evaluated against the result once it arrives, as `evaluate` evaluates a query, so a member maintained by an observation fails it, and the promise answers detached, immutable data.
- **Failure.** A failure of the action, whatever it throws, rejects the promise with an evaluation error naming the action, whose cause is what was thrown; nothing goes to the error reporting while the caller holds the promise.
- **Cancellation.** A signal already aborted rejects with its reason and executes nothing. A signal that aborts while the action runs rejects the promise with its reason at once, and the action learns of it through the signal it was given; what the action does after that is its own, its result is discarded, and a failure it reports afterwards goes to the window's error reporting, since no caller waits for it.
- **No rollback.** An action can change the document before it fails or is canceled, and DOMQL never undoes what it did; an action that can be undone offers that as an action of its own.

### Applying a behavior

`query.apply(options?)` puts a behavior into effect and answers a `DomqlBehavior`, its handle, which belongs to the caller that applied it; its options are `window` and `signal`, which disposes the behavior when it aborts.

```js
const behavior = domql.query(`@dialog.focusTrap()`, { dialog }).apply({ signal });

behavior.subscribe("error", (sender, args) => reportError(args.error));
behavior.update({ dialog: otherDialog });
behavior.dispose();
```

- **Applying is synchronous.** The behavior's function receives the receiver, the arguments and the environment, starts the behavior before it returns, and answers an object with `update` and `dispose`. A failure to start, or an answer without both, throws an evaluation error naming the behavior, whose cause is what was thrown, and leaves nothing running. A behavior whose receiver or an argument is null has nothing to apply, and its handle is `ready` with no instance.
- **The handle.** `status` is `ready` from the call on and `disposed` once ended, and `subscribe(eventName, handler, options?)` adds a listener to its `"error"` events. A failure inside the running behavior, after it started, which the behavior reports through the reporter its function receives, raises an `"error"` event on the handle, and reaches the window's error reporting where no listener receives it.
- **`update(bindings)`** replaces the bindings whole, as `with` binds a query, so a caller states every parameter and nothing is left over from before. It validates first: the bindings are checked, the request is resolved again against them, and the receiver and the arguments are evaluated, and any failure throws, a validation or an evaluation error, leaving the behavior running with its earlier bindings. A resolution that would select a different member is refused with a validation error, since that is another behavior to apply. A behavior applied to a receiver of unknown type, a null binding, has selected no declaration yet: the first update whose receiver selects one commits the behavior to it, and every update after it is held to that declaration, one that binds null again included. Only then does the behavior's `update` receive the new receiver and arguments; a failure there throws an evaluation error naming the behavior, and the behavior keeps the bindings it last accepted. An update that supplies a receiver to a handle with no instance applies one, and one that leaves the receiver or an argument null disposes the one that ran. Updating a disposed behavior throws.
- **`dispose()`** ends the behavior once: it calls the behavior's `dispose`, reports a failure of it to the window's error reporting, stops the handle's listeners, and marks the handle `disposed` whatever happened. Disposing again does nothing, and the behavior's module stays registered.

## DOMQL and its host

DOMQL owns the semantics every host shares: evaluation, dependency recording, observation sessions, snapshots, live state, and the change sets that describe updates to that state, their format and the rules for applying them. A host owns transport, reconnection and who owns a watch, and maintains its own representation of the result by applying a watch's change sets in order, by DOMQL's rules: each change set is applied completely before the updated result is exposed. Where the host can no longer establish that its result is synchronized, it discards that result and starts a fresh watch, whose first delivery carries the complete result as its baseline, from which the host rebuilds its own. A host implements the application of change sets, never deciding for itself what changed or applying one by rules of its own, and DOMQL does not know what a connection is.

## Modules

An extension is registered as a module, which declares under its name the state members, event sources, actions and behaviors it contributes and supplies the implementation that carries each out; requests resolve against those declarations. The declarations are data, each member's DOMQL name, signature, result type, argument types and kinds and the request kinds it supports, so they can be read without running the implementations. A module associates two things explicitly, and neither is derived from the other: an operation's DOMQL name, `computedStyleOf`, and the function that carries it out, whatever that function is called. A module registers under a name of its own, and registering a name twice is an error.

```js
domql.registerModule(new VirtualizerDomqlModule(Virtualizer));
domql.registerModule(new InputRouterDomqlModule(InputRouter));
```

### Declarations

A module is created with its members and, once it can carry them out, the functions they name; declarations are validated when the module is created and checked against the registry when it is registered. The built-in vocabulary is the module `builtIn`, whose identity no other module takes and whose members stand without a namespace; any other module adds members to its own types and a single member named for itself to any other.

- **A declaration** names the member's DOMQL name, and the key of its function in the module's functions, independent of its name; its kind, one of property, operation, source, action and behavior; for a member that is no property, its form, a call by default or an infix call, and, where it has parameters, its input, direct for its one parameter or options for several, as the specification sets out; the types it applies to; its parameters; its result type; its observation coverage; and, for a member that answers a number, the `tolerance` within which a watch compares it, exactly where it declares none.
- **A parameter** is a value or an expression. An expression is evaluated against each item of the list it follows and declares the type it produces. A parameter declares whether it is required, its default where it is not, and whether a null argument propagates, making the call answer null, or is accepted.
- **A fixed parameter** names something the vocabulary resolves before any evaluation, and declares what it selects: a predicate, an event type or a feature.
- **Observations.** A member that changes observably or partly observably names the observations that cover its changes. An observation is of a type, observes the receiver, the receiver's root, its roots, the window, the document or an argument of the member, and gives the arguments its type takes, as `{ type: 'resize', of: 'receiver' }` does; a member that changes in any other way names none. The receiver's **root** and its **roots** are those [trees and slots](#trees-and-slots) defines: a member that depends on the structure around its receiver observes its root, as `all` and `closest` do, and one that depends on any tree its receiver is shown in observes its roots, as `rect` does for scrolling. An observation of the roots is one request at each, so it is an invalidation, and a maintained observation, which gives its member one sample, observes one target. A module declares a type of observation by a camelCase name, its contract, the arguments that belong to an observation's identity, whether equivalent requests share one, and the function that starts one, which takes the request, the function it calls when something may have changed and the environment, and answers an object whose `stop` ends the observation and, for a maintained type, whose `sample` answers its latest sample. The built-in vocabulary's types are `resize`, `mutation`, `attachment`, `intersection`, `media`, `pixelRatio`, `event` and `visibility`, each shared; `intersection` is maintained, and the others are invalidations. A type is either an invalidation observation, which says that a result may have changed and carries no value, or a maintained observation, which provides a sample a member reads and is pending until its first arrives; a member that reads maintained values names a maintained observation, and no other member does.
- **Functions.** A member or a predicate takes its receiver, its arguments by name and the environment, and a member that reads maintained values also its samples, in the order its declaration names the observations. A source takes its receiver, its arguments, the environment and the function it delivers each event to, and answers an object whose `stop` ends the listening. An action takes its receiver, its arguments, the environment and `{ signal }`, and answers its result or a promise of it. A behavior takes its receiver, its arguments, the environment and `{ reportError }`, starts before it returns, and answers an object whose `update(receiver, args)` applies new arguments and whose `dispose` ends it.
- **Types, events, predicates and features** are contributed by modules as data: structured types with their fields, event types with the type of their event data, predicates under `is` or `has` with the types they apply to, and the features `supports` names.
- **Observation coverage** states how a member changes (constant, observable, partly observable with the changes it misses, unobserved, or derived from its receiver and arguments) and how it reads (fresh, maintained, captured or derived).

`query.resolve(options?)` resolves a request: it resolves every member against the registry, types the result and records what each member resolved to, without a browser and without evaluating anything. A watch over a member that is unobserved is refused, and one over a partly observable member is refused unless it accepts partial observation.

A module is given the capability it exposes, never an instance of it, since instances belong to the callers that apply them. A module exposes a capability through DOMQL without the capability depending on DOMQL: the capability keeps an API of its own, and its module lives beside it or in an integration package for it.

- **The registry holds definitions.** One registry per document holds every registered module's declarations, shared by all its callers. The instances behaviors create, the event listeners subscribed to them and the state of whoever applied them are scoped to their callers, never to the registry.
- **Registering is not applying.** Registering a module makes its capability understood; applying one of its behaviors creates an instance for its caller and target. Disposing that instance leaves the module registered.
- **Loading follows requests.** A module is registered before a request naming it is prepared, by its caller or on demand by the caller's environment, so a request loads only the modules it names.

## Tooling

Preparation is authoritative: it validates every request against the vocabulary available before the request runs, whether text or a definition produced it. Three properties keep validation open to editor tooling, such as analyzers and completion, which can follow without changing the language:

- **Locations.** Text positions and definition-node locations are kept, so a diagnostic names the member, argument or object expression that failed; the mapping from text to definition can be kept apart from the definition.
- **Declarative metadata.** A module's declarations are data, so a tool understands them without running a capability's implementation.
- **Independent validation.** Structural and vocabulary validation run without a browser, given the metadata and the bindings' types.

A tool can check a query text known when the code is written against the metadata available to its project; text built at run time, modules registered at run time and checks that depend on bound values remain preparation's.

### Formatting

`domql.format(source)` takes a text, a definition or a query object, and all three give the same canonical text, which the definition writer writes.

- **What it keeps.** The definition's meaning, and the order of its locals and fields as declared; comments and the original layout are discarded, as a definition holds neither.
- **What it needs.** Neither bindings nor a registered vocabulary: it parses and checks structure as `domql.query` does, and resolves nothing.
- **The layout.** Four spaces of indentation for each level of an object expression; an object expression of one field, with no locals, on one line, `{ size: self.size }`, and one of more on one line for each entry; a conditional with an `elseif` on one line for each clause; one space on each side of `and`, `or`, `is`, `has` and an infix call's separators; and no trailing comma.
- **It is stable.** Formatting text already formatted gives the same text.

## Callers

A caller makes a query object from text or a definition, binding its parameters, and carries out every operation through it: it evaluates a query once or watches it, subscribes to a subscription, executes an action, or applies, updates and disposes a behavior; a watch's caller also chooses its schedule, its update strategy and whether it accepts partial observation. The request is prepared before it is first carried out. Each parameter is bound under the name the request uses, with a value the specification allows. A result is data, which a caller receives in its own language's form.

### The API

Each entry point, operation and handle is listed here with what it takes, and the section it names defines how it behaves. The package exports `domql` and `DomqlError` by name.

| JavaScript | C# | Meaning |
| --- | --- | --- |
| `domql.query(text, bindings?)`, `domql.query(definition, bindings?)` | `Domql.Query(text, bindings)`, `Domql.Query<T>(text, bindings)`, and from a definition alike | Makes a query object, binding its parameters, as [making a query](#making-a-query) sets out |
| | `Domql.TryQuery(…)`, `Domql.TryQuery<T>(…)` | Attempts exactly what `Domql.Query` does, answering false with a diagnostic for a syntax or structure failure |
| `query.definition` | `query.Definition` | The query's immutable definition, without its bindings |
| `query.with(bindings)` | | A new query with the same definition, bound to these bindings |
| `query.resolve(options?)` | | Resolves and types a request without evaluating anything; its options `watch` and `acceptPartialObservation` resolve it as a watch would, as [declarations](#declarations) sets out |
| `query.select(...path)` | | A part of its result, as [selecting a result](#selecting-a-result) sets out |
| `query.evaluate(options?)` | | Evaluates a query once, as [evaluating](#evaluating) sets out; its option is `window` |
| `query.evaluateAsync(options?)` | | Evaluates a query once, waiting for its maintained members, as [waiting for maintained members](#waiting-for-maintained-members) sets out; its options are `window` and `signal` |
| `query.watch(options?)` | | Watches a query, answering a `DomqlWatch`, as [the watch and its handle](#the-watch-and-its-handle) sets out |
| `query.subscribe(handler, options?)` | | Subscribes to a subscription, answering a `DomqlEventListener`, as [event delivery](#event-delivery) sets out |
| `query.executeAsync(options?)` | | Executes an action once, answering a promise of its result, as [executing an action](#executing-an-action) sets out |
| `query.apply(options?)` | | Applies a behavior, answering a `DomqlBehavior`, as [applying a behavior](#applying-a-behavior) sets out |
| `domql.format(source)` | | The canonical text of a text, a definition or a query object, as [formatting](#formatting) sets out |
| `domql.createModule(name, contents, functions)` | | Creates a module from its declarations and the functions they name, as [declarations](#declarations) sets out |
| `domql.registerModule(module)` | | Registers a module's declarations in the document's registry, as [modules](#modules) sets out |
| `domql.info` | | Which build this is and which specification it follows: `version`, the package's version, `1.0.0-alpha+source` where DOMQL runs from its sources, and `specificationVersion`, the version of the specification it follows |

| Object | Members | Defined in |
| --- | --- | --- |
| `DomqlQuery` | `definition`, `with(bindings)`, `resolve(options?)`, `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(options?)`, `subscribe(handler, options?)`, `executeAsync(options?)`, `apply(options?)` | [Making a query](#making-a-query) |
| `DomqlSelection` | `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(options?)` | [Selecting a result](#selecting-a-result) |
| `DomqlWatch` | `status`, `snapshot`, `error`, `readyAsync(options?)`, `refreshAsync()`, `subscribe(eventName, handler, options?)`, `dispose()`, and `select(...path)` for snapshots or `liveState` for live state | [The watch and its handle](#the-watch-and-its-handle), [live state](#live-state) |
| `DomqlSelectedView` | `snapshot`, `status`, `error`, `select(...path)`, `subscribe(eventName, handler, options?)`, `readyAsync(options?)` | [Sharing a watch](#sharing-a-watch) |
| `DomqlEventListener` | `status`, `dispose()` | [Events of a handle](#events-of-a-handle), [event delivery](#event-delivery) |
| `DomqlBehavior` | `status`, `update(bindings)`, `subscribe(eventName, handler, options?)`, `dispose()` | [Applying a behavior](#applying-a-behavior) |

- **Names.** Almost every operation answers directly, so the plain name is the synchronous one, and every operation that answers a promise takes the suffix `Async`, as `evaluateAsync`, `readyAsync`, `refreshAsync` and `executeAsync` do.

### Operations and request kinds

Evaluating a query only reads state; executing an action or applying a behavior explicitly requests effects. The request's source decides its kind, so the one entry point serves every request kind, and resolution refuses an operation the kind does not take before anything is evaluated or started, with a validation error that says what the request does and names the operation it takes:

```text
Cannot execute '@panel.size': it produces a value.
Use evaluate(), evaluateAsync() or watch().
```

The object `domql.query` answers is a query object, whatever it holds, and what it describes is its request kind: a query, a subscription, an action or a behavior, as the specification names them. An error a caller reads says what the request does, a value it produces, events it listens to, an effect it executes or a behavior it applies, rather than naming the kind.

| Request kind | Its operations |
| --- | --- |
| Query | `evaluate`, `evaluateAsync`, `watch`, `select` |
| Subscription | `subscribe` |
| Action | `executeAsync` |
| Behavior | `apply` |

### Making a query

`domql.query` takes text or a definition, and each produces a definition with the same meaning, prepared, validated and evaluated alike. Making a query parses the text and checks its structure, and describes work: it reads nothing in the document, starts no observation and makes no call across an interop boundary, and evaluating, watching, subscribing, executing and applying belong to the caller that carries it out. A text is parsed once and its definition reused for identical text, whatever the bindings. A definition created directly serves tooling and integrations. A query belongs to the instance of the library that made it, and an instance refuses another's query with an error that names how to reuse it. A page can hold several instances, as independently bundled libraries each carry their own, and a query passes between them as its definition and a plain object of bindings, which the receiving instance validates and resolves against its own vocabulary. The refusal decides ownership alone, and validation and resolution enforce the contracts a definition meets.

JavaScript makes a query from text, and binds its definition anew:

```js
// From text, binding its parameters by name.
const panelQuery = domql.query(`
    @panel {
        size: self.size,
        hasFocus: self matches ":focus-within"
    }
`, { panel });

// The same definition, bound to another panel; the text named the parameter `panel`.
const otherPanelQuery = panelQuery.with({ panel: otherPanel });

// From a definition, as tooling and integrations make one.
const fromDefinition = domql.query(panelQuery.definition, { panel });
```

`with` answers a new query whose bindings replace the old ones whole; the query it was called on, and every operation running from it, are unaffected. A query can be made without its bindings and bound afterwards, and a required binding that is missing fails before anything is carried out.

C# writes text, and names the type its result maps onto, or none:

```csharp
public sealed record PanelState(double? Width, bool? HasFocus);

DomqlQuery<PanelState> typed = Domql.Query<PanelState>(
    """
    @panel {
        width: self.size?.width,
        hasFocus: self matches ":focus-within"
    }
    """,
    ("panel", panel));

DomqlQuery untyped = Domql.Query("@panel { size: self.size }", ("panel", panel));
```

A binding declares no type: every value is typed from itself, a null, an empty list and a list holding nulls among them, so a query is made for an element that is not there yet as it is for one that is.

```js
const query = domql.query("{ panel: @panel { size: self.size }, ids: @ids }", { panel: null, ids: [] });

const another = query.with({ panel: otherPanel, ids: [1, 2] });
```

With the first bindings, the result is the following: an object expression following the null `panel` is null, and `ids` is the empty list.

```json
{ "panel": null, "ids": [] }
```

A `DomqlQuery<T>` answers a `T`, mapped by its declared contract, which matches the result's fields to the constructor parameters of `T` by name regardless of case, so a field `nearend` fills a parameter `NearEnd`, and reports an ambiguity where two fields differ only in case, since DOMQL itself tells them apart; a `DomqlQuery` answers a `DomqlSnapshot` giving structured access to its values. C# has no C# type standing for each vocabulary concept: a module contributes its declarations and implementations, and the text names what the query reads. `Domql.TryQuery` attempts exactly what `Domql.Query` does, making a query and checking the syntax and the structural rules that need no vocabulary, an empty object expression, a duplicate field and a reserved name among them, without resolving its vocabulary or evaluating anything, so a successful return means the query was made, not that it is ready to be carried out: a syntax or structure failure returns false with a diagnostic, and any other failure is thrown, never swallowed. A vocabulary failure, such as an unknown member, arrives when the query is prepared. C# cancels with a `CancellationToken` where JavaScript takes a `signal`.

### Selecting a result

`query.select(...path)` answers a selection, a part of the query's result. A selection belongs to the query, as its definition and bindings do, and every operation on it starts work of its own, where a selected view belongs to a running watch, as [sharing a watch](#sharing-a-watch) sets out. It offers `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)` and `watch(options?)`. A path holds the names of written fields and list indices that are not negative; a local is no field, so it is never part of a path.

```js
const width = panelQuery.select("size", "width"); // As panelQuery.select("size").select("width").

const currentWidth = await width.evaluateAsync();

rowsQuery.select(0, "height");
```

- **A path's shape is checked at once.** `select` refuses, without resolving anything, a path item that is neither a written field's name nor an index that is a whole number and not negative, as `-1` and `1.5` are not.
- **A path's fit is checked at resolution.** Whether a field exists, and whether an index applies to a list, is checked when an operation resolves the query, before anything is evaluated or observed; a selection of a query whose vocabulary is not yet registered is therefore made without failing.
- **What it gives.** A nullable ancestor and a list index out of range give null, and a list index follows a position, never a particular element.
- **The whole query.** A selection reads the whole query's result, so the whole query decides its dependencies, its failures and its readiness.
- **Its watch** delivers its first value, each change to that value, and its value again after a failed evaluation. It watches snapshots alone; a caller that wants live state of a smaller result writes that result in DOMQL.

### Lifetimes

A `signal` is one lifetime for watches, event listeners and behaviors alike:

```js
const lifetime = new AbortController();

panelQuery.watch({ signal: lifetime.signal });
clicks.subscribe((sender, args) => handleClick(args.value), { signal: lifetime.signal });

lifetime.abort();
```

An operation that answers a handle, given a signal already aborted, answers a disposed handle and starts nothing; an operation that answers a promise rejects with the signal's reason. A signal is an option an operation accepts, and no handle exposes one.
