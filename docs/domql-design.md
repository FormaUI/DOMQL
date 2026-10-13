# DOMQL Design v1.0.0-alpha

The [DOMQL specification](domql-specification.md) defines the language. This design sets out how DOMQL runs and is used: how requests are built and prepared, how a read waits and a watch stays current, how results and changes are delivered, how occurrences hold their observations, how actions run and behaviors are activated, what DOMQL owns beside its host, how modules extend the vocabulary, and the API a caller uses.

This design describes the whole runtime. Reading a query once, watching it as snapshots, change sets or live state, subscribing to events, running actions and activating behaviors are built, and the [README](../README.md#status) states what this implementation covers.

## Scope

| Decision | Contract |
| --- | --- |
| A small language | Chains, object expressions, lists, predicate expressions, logical expressions and conditionals, with literals and parameters. Arithmetic, ordering and anything else a query needs computed belongs to a member or to the caller. |
| An open vocabulary | Everything a query can ask about is a member a vocabulary contributes; the built-in vocabulary and every extension follow one contract, and adding a member leaves the grammar unchanged. |
| Queries read, requests act | Reading, watching or subscribing to a query reads the document and changes nothing, whatever vocabulary it uses; an action or a behavior request is a request of its own kind, carried out only when its caller runs or activates it. |
| One meaning | A query evaluates the same way for every caller, however it was written. |
| Two ways in | A query is parsed from text or created from its JSON definition, and each produces a definition with the same meaning, validated and evaluated alike. |
| Visible mistakes | A misspelling or a wrong argument is an error before anything is evaluated; null is always a result. |

## Preparation

An extension a request names is loaded when the request is prepared, before it is first carried out, and preparation validates it against the vocabulary, as the specification sets out.

### Reading

A read resolves the query, then evaluates it once against the document in a single synchronous pass, following the resolution rather than looking names up again. A resolution is kept for its definition, for the options it was made under, for the types of its bindings and the strings, numbers, Booleans and nulls they bind, which can select what a member reads, and for the vocabulary it was made against, and is released with the definition, so an unchanged query, and every query parsed alike, is resolved once however often it is read; what a read evaluates is always the document as it is. A read needs a browser window, the one it is given or the one the environment holds, and fails with an evaluation error where there is none, while parsing, creating and resolving need none. The result is a detached copy, frozen, that holds nothing of the document. A member whose function answers a type other than the one it declares has broken its contract, and the read fails with an evaluation error naming the member and where it stands in the query; so does a member whose function throws, with the thrown error as its cause. A member a module declares and does not implement fails the read the same way. A member maintained by an observation cannot be read in a single synchronous pass and fails it, with an evaluation error naming the member. A subscription, which ends in an occurrence source, is a request of another kind, and a read refuses it with a validation error once it is resolved, before anything is read; so do a watch of one, and a subscription to a query.

### Waiting for maintained members

A maintained member is pending until its first sample arrives, as the specification defines.

- **`readAsync`, and a watch's first snapshot,** wait for the first sample of every pending member they read, evaluating again as samples arrive and as what they depend on changes, until an evaluation reads no pending member; only that result is delivered. The caller can cancel the wait, and a member that can produce no sample reports itself unavailable. The wait completes at the first evaluation that reads no pending member; dependencies that keep introducing pending members can keep it waiting until the caller cancels it.
- **A maintained member a watch first reads after its first snapshot** is pending in the snapshot the watch reports, and the watch evaluates again when its first sample arrives.
- **Inside an occurrence's object expression,** a maintained member answers its latest sample, or null while pending, and is never waited for.
- **`readAsync` reads any query,** answering as soon as an evaluation reads no pending member, so a query that reads none answers from its first evaluation and a caller can use it for every query. Its `signal` cancels it: one already aborted reads nothing, and one that aborts while it waits rejects the promise with its reason.
- **A failure seen through a pending member waits.** An evaluation that fails having read a maintained member still pending reports nothing and waits for that member's sample, since the failure may come from the null the member answered.
- **One result, not one instant.** The result is made of fresh reads and of the samples available when the last evaluation ran, and does not promise that every measurement was taken at the same moment.

### Sessions

Every observation a query starts is reached through a session, which the query disposes when the read succeeds, fails or is canceled, when the watch or the subscription ends, and when an evaluation no longer depends on it. An observation already running for another query is reached through a session of its own, which leaves its lifetime to its other sessions; the last session to be disposed stops it. Equivalent requests share one observation where their type permits it; a request's identity is its type, its target, the arguments its type says belong to it, and the window it belongs to, so two requests that differ in an argument that changes what is observed, such as an intersection's root or margin, never share. A session gives its consumer the change notifications of the observation and, for a maintained observation, its latest sample, until the consumer disposes it. A session whose callback fails is reported and does not keep the others from hearing of a change. A watch's evaluation takes over a session of the evaluations it replaces wherever it would acquire that same observation again, a shared one with the same type, target and arguments, so a session belongs to one evaluation at a time and an observation the watch keeps needing goes on reporting from one evaluation to the next. A read acquires the observations of the maintained members it reads, whose samples it needs, and holds those of its other members only while it waits, since a complete result needs nothing more observed; a watch holds them all. Disposing an evaluation disposes every session even where one fails to be disposed: a watch, an event listener and a waiting read each attempt every cleanup, report a failure of one to the window's error reporting, and never let it replace their result, their error or their cancellation.

## Watching and dependencies

A watch keeps a query's result current: it evaluates the query, reports a snapshot of the result, and evaluates again when something the result depends on changes, reporting only a snapshot that differs.

### The watch and its handle

`Domql.watch` takes its configuration beside the query: `onChange`, which is required and receives every delivery; `onError`, which receives a failed evaluation and a failing `onChange`, and without which they reach the window's error reporting; its `schedule`, `frame` by default or `immediate`; its `updateStrategy`, `snapshot` by default, `changeSet` or `liveState`; whether it accepts partial observation; and its `window`. It answers a `DomqlWatch`, the watch's handle.

- **The first evaluation** runs in a microtask the call queues, after `watch` returns and before any later task, so no callback runs before its caller holds the handle; a `refreshAsync` called before then runs that evaluation at once instead. Its result is the first delivery, through the same `onChange` as every later one.
- **Status.** `status` is `pending` until the first snapshot is available, the samples of the maintained members it reads included, and `ready` from then on. After an evaluation fails it is `failed`: the watch keeps running and keeps its last successful snapshot, if it has one, and returns to `ready` with its next successful evaluation. Once ended it is `disposed`. `lastSnapshot` is the snapshot last reported, null before the first and where the snapshot itself is null, so it is read beside the status, never in place of it.
- **Callbacks.** A callback receives each delivery in delivery order, and DOMQL does not wait for the promise it returns, so the continuations of asynchronous callbacks can overlap; a caller that needs them one at a time arranges that at its own delivery boundary. A callback that throws, or whose promise rejects, leaves the state it was handed accepted, and its failure goes to `onError`; it does not stop the watch. A failure of `onError` itself goes to the window's error reporting, never to `onError` again, and interrupts no other watch.
- **`refreshAsync()`** evaluates now instead of at the schedule, and answers a promise that settles once that evaluation has completed and the delivery it produced, if any, has been handed to the callback. It does not wait for a promise the callback returns, so a callback can await a refresh. It rejects with the failure of its evaluation, which also reaches `onError`; it resolves without delivering where disposal cancels it; and it rejects where called after disposal.
- **`dispose()`** cancels the evaluation the watch scheduled, disposes every session, sets the status to `disposed` and prevents any new callback invocation; a callback already running may finish. Disposing again does nothing.

### Accepting partial observation

Accepting partial observation is an option of the watch, chosen when the caller establishes it, beside its schedule; it applies to that watch alone and leaves the query's meaning unchanged. A watch over a partly observable member without it is a validation error naming each such member and the changes its observations miss. A read needs no acceptance, since it keeps nothing current.

### Dependencies

A watch's dependencies are what its last evaluation actually read, recorded as it evaluated: each member applied to its receiver and arguments, with that member's observations. Dependencies belong to the complete query.

- **Every evaluation records its dependencies afresh,** and the watch subscribes to the observations the new set names and releases the ones it no longer names. What a watch observes therefore follows the document: in `@table.all("tbody tr").max(self.rect.height)`, the watch depends on what the selector matches within the table, and on the height of each row it matched. A row added starts being observed after the evaluation the addition causes, and a row removed stops being observed.
- **A value argument is a dependency of its own.** `@target intersects { root: @panel }` depends on the intersection of the target with the panel; `self intersects { root: self.parent }` also depends on which element is the parent, and a new parent is observed after the evaluation its change causes.
- **An expression argument contributes its dependencies for every item** it was evaluated against.
- **A chain that met null depends on what it read before the null,** so `self.closest(".row")` finding nothing still depends on the ancestors it searched, and the watch evaluates again when one starts to match.
- **A watch keeps its bindings.** Binding different values starts the watch afresh.

Invalidation, evaluation and delivery each keep their own schedule. An observation invalidates the watch at once. The watch evaluates at the next animation frame, once however many observations fired, or immediately, in the task that reported the change, where its caller needs a change handled at the moment it is reported, such as at mutation delivery. When the caller receives the snapshot is the caller's own. Watches that depend on the same target through the same observation share one observation.

Evaluating the whole query each time is the design. A member may keep its result until its own observations fire, as long as the result is the one a full evaluation would give.

### Elements that leave the document

A member that answered null because its element is detached depends on whether that element is attached, so a watch reading it evaluates again when the same element returns to the document, and observes it again from that evaluation. Removing an element changes the results that read it, and a watch over them runs on until its caller ends it.

### When evaluation fails

A watch whose evaluation fails reports the error to its caller, and keeps the dependencies of its last successful evaluation together with those the failed one recorded before failing. It evaluates again when any of them changes or its caller refreshes it, and its next successful evaluation reports its snapshot whether or not it equals the last one reported; a watch that delivers change sets sends an empty change set where the snapshot equals the last one.

### Cached state, change sets and snapshots

A watch keeps its result as cached state and hands its caller snapshots, change sets or live state:

| Concept | Is |
| --- | --- |
| Cached state | The watch's own copy of its result, updated in place as individual values change |
| Baseline | A complete result, establishing the state its receiver starts from |
| Change set | The fields and list entries that changed, relative to the receiver state it was computed against |
| Snapshot | An immutable result captured at one moment |
| Live state | A stable object a JavaScript caller holds, updated in place as the cached state is |

A snapshot never changes once delivered. A new snapshot reuses every immutable branch that did not change and builds new ones only along the paths that did, and a caller taking change sets receives no full snapshot after its baseline. Live state is the one value that changes under its holder: reading it at two moments can give two results, so it is chosen explicitly and is never a snapshot.

- **Baseline.** The first delivery is the complete result.
- **Change sets.** A change set is a [JSON Patch](https://www.rfc-editor.org/rfc/rfc6902) document limited to `replace`, `add`, `remove` and `move`, whose paths are JSON Pointers into the result; applying it to the state it was computed against gives the new result. A field the change set leaves out is unchanged, and a field that became null is replaced with null. An object expression's fields are fixed, so `add` and `remove` apply to list items alone.
- **Lists.** A list whose items come from elements changes by element: an element entering is added, one leaving is removed, one changing position is moved, and one whose result changed is changed inside its item. Any other list changes by position.
- **Coalescing.** Pending changes combine into one change set, computed against the state the change set in flight establishes once accepted, so it carries everything since that one, and changes that cancel out send nothing.
- **Recovery.** Where the receiver's baseline cannot be trusted, after a failed delivery, a lost connection or a new target, the watch sends a fresh complete baseline.

Recovery abandons any delivery still unanswered and installs a fresh baseline, and nothing from before it can touch what follows:

1. **A change set applies only to the state it was computed against.** Its predecessor was accepted, or a recovery established a new baseline.
2. **Recovery invalidates older delivery work.** Once a recovery baseline is accepted, older pending changes and late completions update no state, advance no baseline and occupy no delivery slot.
3. **Applying a change set is atomic to consumers.** One that fails exposes no partial result, and the receiver resynchronizes from a fresh baseline.
4. **A failing handler leaves its state accepted.** It undoes no accepted change, and an accepted change set is never applied again.
5. **Coalescing keeps the receiver's chain of states.** A change set waiting behind one in flight is computed against the state that one establishes once accepted, and a delivery whose outcome is uncertain is followed by a fresh baseline.

Evaluating only what changed and delivering only what changed are separate: a watch that evaluates its whole query still delivers only the changes in its result.

### Delivering change sets

A watch delivers change sets when its caller chooses them as its update strategy, `updateStrategy: 'changeSet'`, which brings baselines, acknowledgment and recovery with it; it delivers each snapshot whole otherwise.

- **Identity.** A list projected from elements is matched by element, and two elements can project to the same data, so the identity of each item cannot be read back from a snapshot. Evaluation keeps the element each item came from as metadata beside the result, which the comparer and the change sets use and which neither a result nor a change set ever holds. A list that was not projected from elements, one with a null item, and one in which an element stands twice are matched by position.
- **What a change set reproduces.** A change set takes the accepted state to the reconciled snapshot, the one the watch reports, with every comparison and tolerance applied; it never describes a different, raw evaluation.
- **An update** names its generation, the revision it starts from and the revision it reaches, whatever carries it, as `generation`, `from` and `to`, beside its `kind`. A baseline starts a generation at revision 0, from null, and carries the whole `snapshot`; a change set goes from one revision of its generation to the next and carries the `patch`.
- **Acknowledgment.** A current snapshot confirms that it applied an update by having its host acknowledge it on the watch, with `watch.acknowledge(update)`. One update waits for acknowledgment at a time; while it waits, the watch keeps the latest snapshot, and once it is acknowledged it computes the next change set against the state that update established, so the changes since combine into one and changes that cancel out send nothing.
- **Recovery.** Where a current snapshot failed to apply an update, was lost or is new, its host recovers the watch, with `watch.recover()`, which abandons the generation, the update waiting in it included, and sends the watch's snapshot as the baseline of the next. A late update or acknowledgment of an abandoned generation changes neither the current snapshot's value nor the watch's bookkeeping, and a watch of another strategy refuses both calls with a structure error.
- **The current snapshot** is DOMQL's, the receiving side a host creates with `Domql.createSnapshot()`: its `apply(update)` applies an update atomically to the snapshot it was computed against, answers `accepted`, `stale` or `failed`, and leaves its value as it was where it fails. Its `value` is the snapshot last accepted, beside its `generation` and `revision`, and every snapshot it held before stays unchanged. The host owns the transport between the watch and the current snapshot, and reports what the current snapshot answered. A callback that fails after the current snapshot accepted an update does not make the update failed.

### Live state

A watch keeps its result as live state when its caller chooses it as its update strategy, `updateStrategy: 'liveState'`, beside `snapshot` and `changeSet`, so a watch delivers one kind of update.

- **What the callback receives.** `onChange(state, changes)`: the live object, the same one at every call, and the change set just applied to it, the JSON Patch operations a change-set watch would send, computed against the snapshot the object was last brought to. A caller that renders the whole object ignores the changes; one that patches a view of its own reads them. The first call is the baseline: the object as first built, and an empty change set.
- **What keeps its identity.** The root, and every object and list beneath it while its path holds an object or a list: a field that changes is set on the object that holds it, an item added, removed or moved changes the list in place, and an item of a list projected from elements keeps its object as it moves, as change sets move it by element. A branch is a new object only where its value stops being one, as when a field turns from an object to null and back.
- **What it can hold.** The result must be an object or a list that is not nullable, since null has no identity to keep; a watch over another result is refused with a validation error that suggests a top-level object expression. Its values are data, as every result is.
- **Ownership.** The object belongs to the watch, which writes it; a caller reads it and never writes it, and the declarations type it as read-only. It is not frozen, since the watch updates it, and a caller that keeps a version copies it or chooses snapshots.
- **Timing and failure.** Each change set is applied whole before `onChange` begins, in the evaluation that produced it. A failed evaluation leaves the object as it was, reaches `onError` and sets the status to `failed`; the next successful one brings the object up to date in one change set. A watch disposed stops changing the object, and its caller keeps it as it last was.
- **The handle.** `watch.liveState` is the live object, null before the first snapshot and for a watch of another strategy, and `lastSnapshot` still answers the immutable snapshot a snapshot watch would.

### Comparing snapshots

A watch reports a snapshot that differs from the last one it reported, compared field by field and item by item. Strings, Booleans and null compare exactly; a number compares within the tolerance its member declares, and exactly where it declares none.

A number a conditional gave compares within the tolerance of the member its branch read where the number last reported came from the same branch, and exactly where it came from another, which is a different reading whose difference no tolerance absorbs. A conditional can select a different branch at each place in the result, as for each item of a list, so evaluation keeps the branch each conditional selected for each place beside the elements its lists came from, and the comparer reads it there.

## Occurrence delivery

An occurrence's object expression is evaluated as the specification defines, and its result, immutable data, reaches the caller by the caller's own delivery.

A maintained member in an occurrence's object expression reads its latest sample, or null while it is pending, never waits for a later one and never revises a result already delivered:

```
(@button eventsOf "click") {
    nearEnd: @sentinel intersects { root: @panel }
}
```

The subscription holds the sessions its object expressions acquire. After each successful evaluation it keeps the sessions that evaluation read and disposes the rest, so an observation one occurrence started serves the next: the first occurrence reports null for a member still pending, and a later one reads the sample that arrived meanwhile. A failed evaluation delivers no result and reports its failure; the subscription keeps the sessions it held before it and disposes those the failed attempt acquired. Ending the subscription disposes every session it holds, and an observation another holder still has a session on runs on.

`Domql.subscribe` takes its configuration beside the subscription: `onEvent`, which is required and receives each occurrence's result, `onError` and `window`. Its callback and failure rules are a watch's, and it answers a `DomqlEventListener`, the subscription's handle.

- **Listening starts in the call.** The event listener starts its source before `subscribe` returns, so an occurrence dispatched right after the call is heard, and a source that cannot start fails the call with an evaluation error whose cause is what the source threw. Its `status` is `ready` from the call on and `disposed` once ended; it never waits for an event.
- **Occurrences during the start.** A source may deliver while it starts. Those occurrences are captured and projected at once, and their callbacks run once the caller holds the event listener, before those of any later occurrence; where the start fails, their callbacks never run and the sessions they opened are disposed.
- **The receiver and the arguments** of the source are evaluated once, as listening starts, so an event listener does not follow a receiver that changes, and listens to nothing where the receiver or an argument is null.
- **A failed occurrence,** one whose capture or object expression fails, is reported to `onError` and leaves the event listener `ready`.
- **`dispose()`** ends the listening, disposes every session the event listener holds and prevents any new callback invocation; a callback already running may finish. Disposing again does nothing.

## Actions and behaviors

An action is run once and a behavior activated, each through an entry point of its own, and a query never runs or activates either: reading, watching and subscribing refuse both requests, and each entry point refuses a request of another kind, with a validation error once it is resolved and before anything is evaluated or started.

### Running an action

`Domql.runAsync(query, options)` runs an action and answers a promise of its result; its options are `window` and `signal`.

- **Evaluation first.** The receiver and the arguments are evaluated first, synchronously, as a read evaluates them; a failure there rejects the promise and runs nothing, and an action whose receiver or an argument is null is not run, its result being null, as a member's is.
- **The result.** The action's function receives the receiver, the arguments, the environment and the signal, and may answer its result or a promise of it. The result must be of the type the action declares, and data alone; a result of another type rejects the promise with an evaluation error naming the action. An object expression that follows the action is evaluated against the result once it arrives, as a read evaluates a query, so a member maintained by an observation fails it, and the promise answers detached, immutable data.
- **Failure.** A failure of the action, whatever it throws, rejects the promise with an evaluation error naming the action, whose cause is what was thrown; nothing goes to the error reporting while the caller holds the promise.
- **Cancellation.** A signal already aborted rejects with its reason and runs nothing. A signal that aborts while the action runs rejects the promise with its reason at once, and the action learns of it through the signal it was given; what the action does after that is its own, its result is discarded, and a failure it reports afterwards goes to the window's error reporting, since no caller waits for it.
- **No rollback.** An action can change the document before it fails or is canceled, and DOMQL never undoes what it did; an action that can be undone offers that as an action of its own.

### Activating a behavior

`Domql.activate(query, options)` puts a behavior into effect and answers a `DomqlBehavior`, its handle, which belongs to the caller that activated it; its option is `window`.

- **Activation is synchronous.** The behavior's function receives the receiver, the arguments and the environment, starts the behavior before it returns, and answers an object with `update` and `dispose`. A failure to start, or an answer without both, throws an evaluation error naming the behavior, whose cause is what was thrown, and leaves nothing running. A behavior whose receiver or an argument is null has nothing to activate, and its handle is `ready` with no instance.
- **The handle.** `status` is `ready` from the call on and `disposed` once ended. A failure inside the running behavior, after it started, goes to the window's error reporting, through the reporter its function receives.
- **`update(bindings)`** replaces the bindings whole, as `create` binds a definition, so a caller states every parameter and nothing is left over from before. It validates first: the bindings are checked, the request is resolved again against them, and the receiver and the arguments are evaluated, and any failure throws, a validation or an evaluation error, leaving the behavior running with its earlier bindings. A resolution that would select a different member is refused with a validation error, since that is another behavior to activate. Only then does the behavior's `update` receive the new receiver and arguments; a failure there throws an evaluation error naming the behavior, and the behavior keeps the bindings it last accepted. An update that supplies a receiver to a handle with no instance activates one, and one that leaves the receiver or an argument null disposes the one that ran. Updating a disposed behavior throws.
- **`dispose()`** ends the behavior once: it calls the behavior's `dispose`, reports a failure of it to the window's error reporting, and marks the handle `disposed` whatever happened. Disposing again does nothing, and the behavior's module stays registered.

## DOMQL and its host

DOMQL owns the semantics every host shares: evaluation, dependency recording, observation sessions, snapshots, baselines, revisions, the computation of change sets and their atomic application, and the ordering rules that keep a stale update from being accepted. A host owns transport, acknowledgment, reconnection, who owns a watch, and asking for a replacement baseline when its receiver cannot be trusted. A host never keeps a second watch or patch implementation: a baseline is how it recovers, and DOMQL does not know what a connection is.

## Modules

An extension is registered as a module, which declares under its name the state members, occurrence sources, actions and behaviors it contributes and supplies the implementation that carries each out; requests resolve against those declarations. The declarations are data, each member's DOMQL name, signature, result type, argument types and kinds and the request kinds it supports, so they can be read without running the implementations. A module associates two things explicitly, and neither is derived from the other: an operation's DOMQL name, `computedStyleOf`, and the function that carries it out, whatever that function is called. A module registers under a name of its own, and registering a name twice is an error.

```js
Domql.registerModule(new VirtualizerDomqlModule(Virtualizer));
Domql.registerModule(new InputRouterDomqlModule(InputRouter));
```

### Declarations

A module is created with its members and, once it can carry them out, the functions they name; declarations are validated when the module is created and checked against the registry when it is registered. The built-in vocabulary is the module `builtIn`, whose identity no other module takes and whose members stand without a namespace; any other module adds members to its own types and a single member named for itself to any other.

- **A declaration** names the member's DOMQL name, and the key of its function in the module's functions, independent of its name; its kind, one of property, operation, source, action and behavior; for a member that is no property, its form, a call by default or a named operation, and, where it has parameters, its input, direct for its one parameter or options for several, as the specification sets out; the types it applies to; its parameters; its result type; its observation coverage; and, for a member that answers a number, the `tolerance` within which a watch compares it, exactly where it declares none.
- **A parameter** is a value or an expression. An expression is evaluated against each item of the list it follows and declares the type it produces. A parameter declares whether it is required, its default where it is not, and whether a null argument propagates, making the call answer null, or is accepted.
- **A fixed parameter** names something the vocabulary resolves before any evaluation, and declares what it selects: a member, a predicate, an occurrence or a feature.
- **Observations.** A member that changes observably or partly observably names the observations that cover its changes. An observation is of a type, observes the receiver, the window, the document or an argument of the member, and gives the arguments its type takes, as `{ type: 'resize', of: 'receiver' }` does; a member that changes in any other way names none. A module declares a type of observation by a camelCase name, its contract, the arguments that belong to an observation's identity, whether equivalent requests share one, and the function that starts one, which takes the request, the function it calls when something may have changed and the environment, and answers an object whose `stop` ends the observation and, for a maintained type, whose `sample` answers its latest sample. The built-in vocabulary's types are `resize`, `mutation`, `attachment`, `intersection`, `media`, `pixelRatio`, `event` and `visibility`, each shared; `intersection` is maintained, and the others are invalidations. A type is either an invalidation observation, which says that a result may have changed and carries no value, or a maintained observation, which provides a sample a member reads and is pending until its first arrives; a member that reads maintained values names a maintained observation, and no other member does.
- **Functions.** A member or a predicate takes its receiver, its arguments by name and the environment, and a member that reads maintained values also its samples, in the order its declaration names the observations. A source takes its receiver, its arguments, the environment and the function it delivers each occurrence to, and answers an object whose `stop` ends the listening. An action takes its receiver, its arguments, the environment and `{ signal }`, and answers its result or a promise of it. A behavior takes its receiver, its arguments, the environment and `{ reportError }`, starts before it returns, and answers an object whose `update(receiver, args)` applies new arguments and whose `dispose` ends it.
- **Types, events, predicates and features** are contributed by modules as data: structured types with their fields, event types with the type of their occurrences, predicates under `is` or `has` with the types they apply to, and the features `supports` names.
- **Observation coverage** states how a member changes (constant, observable, partly observable with the changes it misses, unobserved, or derived from its receiver and arguments) and how it reads (fresh, maintained, captured or derived).

A request is resolved with `Domql.resolve`, which resolves every member against the registry, types the result and records what each member resolved to, without a browser and without evaluating anything. A watch over a member that is unobserved is refused, and one over a partly observable member is refused unless it accepts partial observation.

A module is given the capability it exposes, never an instance of it, since instances belong to the callers that activate them. A module exposes a capability through DOMQL without the capability depending on DOMQL: the capability keeps an API of its own, and its module lives beside it or in an integration package for it.

- **The registry holds definitions.** One registry per document holds every registered module's declarations, shared by all its callers. The instances behaviors create, the event listeners subscribed to them and the state of whoever activated them are scoped to their callers, never to the registry.
- **Registering is not activating.** Registering a module makes its capability understood; activating one of its behaviors creates an instance for its caller and target. Disposing that instance leaves the module registered.
- **Loading follows requests.** A module is registered before a request naming it is prepared, by its caller or on demand by the caller's environment, so a request loads only the modules it names.

## Tooling

Preparation is authoritative: it validates every request against the vocabulary available before the request runs, whether text or a definition produced it. Three properties keep validation open to editor tooling, such as analyzers and completion, which can follow without changing the language:

- **Locations.** Text positions and definition-node locations are kept, so a diagnostic names the member, argument or object expression that failed; the mapping from text to definition can be kept apart from the definition.
- **Declarative metadata.** A module's declarations are data, so a tool understands them without running a capability's implementation.
- **Independent validation.** Structural and vocabulary validation run without a browser, given the metadata and the bindings' types.

A tool can check a query text known when the code is written against the metadata available to its project; text built at run time, modules registered at run time and checks that depend on bound values remain preparation's.

## Callers

A caller creates a request, binding its parameters, and then reads a query once or watches it, subscribes to a subscription, runs an action, or activates, updates and disposes a behavior; a watch's caller also chooses its schedule and whether it accepts partial observation. The request is prepared before it is first carried out. Each parameter is bound under the name the request uses, with a value the specification allows. A result is data, which a caller receives in its own language's form.

### The API

Each entry point and handle is listed here with what it takes, and the section it names defines how it behaves.

| JavaScript | C# | Meaning |
| --- | --- | --- |
| `Domql.parse(text, bindings)` | `Domql.Parse(text, bindings)`, `Domql.Parse<T>(text, bindings)` | Parses text into a query, binding its parameters |
| | `Domql.TryParse(…)`, `Domql.TryParse<T>(…)` | Parses text, answering false with a diagnostic and no query for text that does not follow the syntax or the structural rules |
| `Domql.create(definition, bindings)` | `Domql.Create(definition, bindings)`, `Domql.Create<T>(definition, bindings)` | Creates a query from its definition, binding its parameters |
| `query.definition` | `query.Definition` | The query's definition, without its bound values |
| `Domql.bind(value, type)` | `Domql.Bind(value, type)` | A typed binding, for a value that reveals no type of its own |
| `Domql.resolve(query, options)` | | Resolves and types a request without evaluating anything; its options `watch` and `acceptPartialObservation` resolve it as a watch would, as [declarations](#declarations) sets out |
| `Domql.read(query, options)` | | Reads a query once, as [reading](#reading) sets out; its option is `window` |
| `Domql.readAsync(query, options)` | | Reads a query once, waiting for its maintained members, as [waiting for maintained members](#waiting-for-maintained-members) sets out; its options are `window` and `signal` |
| `Domql.watch(query, configuration)` | | Watches a query, answering a `DomqlWatch`, as [the watch and its handle](#the-watch-and-its-handle) sets out |
| `Domql.createSnapshot()` | | Creates the current snapshot a watch's change sets build, a `DomqlCurrentSnapshot`, as [delivering change sets](#delivering-change-sets) sets out |
| `Domql.subscribe(query, configuration)` | | Subscribes to a subscription, answering a `DomqlEventListener`, as [occurrence delivery](#occurrence-delivery) sets out |
| `Domql.runAsync(query, options)` | | Runs an action once, answering a promise of its result, as [running an action](#running-an-action) sets out |
| `Domql.activate(query, options)` | | Activates a behavior, answering a `DomqlBehavior`, as [activating a behavior](#activating-a-behavior) sets out |
| `Domql.createModule(name, contents, functions)` | | Creates a module from its declarations and the functions they name, as [declarations](#declarations) sets out |
| `Domql.registerModule(module)` | | Registers a module's declarations in the document's registry, as [modules](#modules) sets out |

| Handle | Members | Defined in |
| --- | --- | --- |
| `DomqlWatch` | `status`, `lastSnapshot`, `liveState`, `refreshAsync()`, `dispose()`, and for change sets `acknowledge(update)` and `recover()` | [The watch and its handle](#the-watch-and-its-handle), [delivering change sets](#delivering-change-sets), [live state](#live-state) |
| `DomqlCurrentSnapshot` | `value`, `generation`, `revision`, `apply(update)` | [Delivering change sets](#delivering-change-sets) |
| `DomqlEventListener` | `status`, `dispose()` | [Occurrence delivery](#occurrence-delivery) |
| `DomqlBehavior` | `status`, `update(bindings)`, `dispose()` | [Activating a behavior](#activating-a-behavior) |

- **Text or a query.** A call that resolves, reads, watches, subscribes, runs or activates takes a query or its text: given text, it parses it as `parse` does, through the same cache of parsed texts, with the bindings between the text and the options or the configuration, always in that place, so a request made once needs no query of its own and a query built once serves every call that reuses it.
- **Names.** Almost every operation answers directly, so the plain name is the synchronous one, and every operation that answers a promise takes the suffix `Async`, as `readAsync`, `refreshAsync` and `runAsync` do.

### Making a query

A query is parsed from text or created from a definition, and each produces a definition with the same meaning, prepared, validated and evaluated alike. Constructing a request describes work: it reads nothing in the document, starts no observation and makes no call across an interop boundary, and reading, watching, subscribing, running and activating belong to the caller that carries it out. A definition created directly serves tooling and integrations. A query belongs to the instance of the library that made it, and an instance refuses another's query with an error that names how to reuse it. A page can hold several instances, as independently bundled libraries each carry their own, and a query passes between them as its definition and a plain object of bindings, which the receiving instance validates and resolves against its own vocabulary; a typed binding passes as one that instance makes. The refusal decides ownership alone, and validation and resolution enforce the contracts a definition meets.

JavaScript parses text, or creates a query from a definition:

```js
// From text, binding its parameters by name.
const parsed = Domql.parse(`
    @panel {
        size: self.size,
        hasFocus: self matches ":focus-within"
    }
`, { panel });

// From a definition, bound to another panel; the text named the parameter `panel`.
const another = Domql.create(parsed.definition, { panel: otherPanel });
```

C# writes text, and names the type its result maps onto, or none:

```csharp
public sealed record PanelState(double? Width, bool? HasFocus);

DomqlQuery<PanelState> typed = Domql.Parse<PanelState>(
    """
    @panel {
        width: size.width,
        hasFocus: matches(":focus-within")
    }
    """,
    ("panel", panel));

DomqlQuery untyped = Domql.Parse("@panel { size: self.size }", ("panel", panel));
```

A binding whose value does not reveal its type, an unavailable element, an empty list or a list holding a null, supplies the type with it, and supplies it again through `Create`; a declared type must fit every part of the value, as the specification sets out.

```js
const query = Domql.parse('{ panel: @panel { size: self.size }, ids: @ids }', {
    panel: Domql.bind(null, 'element?'),
    ids: Domql.bind([], 'list<number>')
});

const another = Domql.create(query.definition, {
    panel: Domql.bind(otherPanel, 'element?'),
    ids: Domql.bind([1, 2], 'list<number>')
});
```

```csharp
DomqlQuery query = Domql.Parse(
    "{ panel: @panel { size: self.size }, ids: @ids }",
    ("panel", Domql.Bind(null, "element?")),
    ("ids", Domql.Bind(Array.Empty<int>(), "list<number>")));
```

With the bindings of the first example, the result is the following: an object expression following the null `panel` is null, and `ids` is the empty list.

```json
{ "panel": null, "ids": [] }
```

A `DomqlQuery<T>` answers a `T`, mapped by its declared contract, which matches the result's fields to the constructor parameters of `T` by name regardless of case, so a field `nearend` fills a parameter `NearEnd`, and reports an ambiguity where two fields differ only in case, since DOMQL itself tells them apart; a `DomqlQuery` answers a `DomqlSnapshot` giving structured access to its values. C# has no C# type standing for each vocabulary concept: a module contributes its declarations and implementations, and the text names what the query reads. A `TryParse` checks the syntax and the structural rules that need no vocabulary, an empty object expression, a duplicate field and a reserved name among them; an expected failure there answers false with a diagnostic and no query, and a vocabulary failure, such as an unknown member, arrives when the query is prepared.

Parsing and creating bind the parameters a text or a definition names, by name, and a definition serves any binding. A text is parsed once and kept.

