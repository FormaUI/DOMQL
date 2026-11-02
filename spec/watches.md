# Watches

<a id="watching"></a>
<a id="watching-and-dependencies"></a>

A **watch** keeps a query's result current: it evaluates the query, reports a snapshot of the result, and evaluates again when something the result depends on changes, reporting only a snapshot that differs. What it depends on is what its last evaluation read, each member with the observations it names, so a watch follows the document as the document changes, and a member's declaration says what the watch can follow of it.

```js
const watch = panelQuery.watch();

watch.subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderPanel(args.value);
    }
});

watch.dispose(); // Stops the watch and every listener subscribed to it.
```

In this document:

1. [The watch and its handle](#the-watch-and-its-handle)
2. [How a member changes](#how-a-member-changes)
3. [Accepting partial observation](#accepting-partial-observation)
4. [Dependencies](#dependencies)
5. [When a watch evaluates](#watching-when-a-watch-evaluates)
6. [Elements that leave the document](#elements-that-leave-the-document)
7. [Trees and slots a watch follows](#trees-and-slots-a-watch-follows)
8. [When evaluation fails](#when-evaluation-fails)
9. [Sharing a watch](#sharing-a-watch)

<a id="the-watch-and-its-handle"></a>

## The watch and its handle

`query.watch(options?)` starts a watch and answers its handle, a `DomqlWatch`. Its options are its `schedule`, `frame` by default or `immediate`; its `updateStrategy`, `snapshot` by default or `liveState`, as [results](results.md) set out; whether it accepts partial observation; its `signal`, which disposes it when it aborts; its `window`; and its [`owner`](api.md#api-the-owner). What the watch delivers reaches the listeners its handle's `subscribe` adds, as [events of a handle](api.md#events-of-a-handle) sets out.

- **The first evaluation** runs in a microtask the call queues, after `watch` returns and before any later task, so a caller subscribes before any event is raised; a `refreshAsync` called before then runs that evaluation at once instead. Its result is the first `"change"` event.
- **Status.** `status` is `pending` until the first snapshot is available, the samples of the maintained members it reads included, and `ready` from then on. After an evaluation fails it is `failed`: the watch keeps running and keeps its last successful snapshot, if it has one, and returns to `ready` with its next successful evaluation. Once ended it is `disposed`. `snapshot` is the last successful snapshot, `undefined` before the first, so a result that is null is told apart from none yet, and `error` is the latest evaluation failure, cleared by the next success.
- **`readyAsync(options?)`** waits for a successful ready state and answers its snapshot. Its `signal` cancels that wait alone; it rejects where an evaluation fails while it waits or the watch is disposed, and the watch goes on after a failed evaluation.
- **`refreshAsync(options?)`** evaluates now instead of at the schedule, and answers a promise that settles once that evaluation has completed and the event it produced, if any, has been raised. Where that evaluation waits, as the first snapshot does for the first samples of the maintained members it reads, or as one does that failed having read a member still pending, the promise settles with the evaluation that ends the wait. It does not wait for a promise a handler returns, so a handler can await a refresh. It rejects with the failure of its evaluation, which its `"change"` event reports too; it resolves without delivering where disposal cancels it; and it rejects where called after disposal. Its options are `resample` and `signal`, below.

<a id="watching-resampling"></a>

- **Resampling.** A maintained member reads the latest sample its observation took, which can lag behind the page: the browser reports an intersection after it lays a frame out, so a watch that evaluates in that frame, or refreshes before it, reads where the element was before. `refreshAsync({ resample: true })` first has every maintained observation the watch's last evaluation read take a new sample, waits until each has arrived, and only then evaluates, so a sentinel refreshed after a load reads where the load left it.
  - An observation that takes no new sample, its type offering none, is read as it stands, as [extension modules](vocabulary.md#extension-modules) set out.
  - A watch that has not evaluated yet has read nothing, so it evaluates at once.
  - An observation that fails to take a new sample rejects the refresh with `DOMQL5022`, its failure the `cause`, and the watch goes on.
- **`signal`** cancels a refresh's wait alone, rejecting it with the signal's reason; the watch goes on, and evaluates at its schedule.
- **An equal result.** A refresh raises no event where its result equals the last one reported. A caller that needs the result whatever it is, as one rebuilding its copy after a reconnection, reads `snapshot` once the refresh settles: it is the snapshot the next change set is computed against.
<a id="watching-source-elements"></a>

- **`sourceOf(...path)`** answers the reference the list item at the path in `snapshot` descends from, its [provenance](results.md#results-change-sets), as the element a row was projected from, so a handler in the browser writes to the element an item came from:

  ```js
  rows.subscribe("change", (sender, args) => {
      args.value.forEach((row, index) => sender.sourceOf(index).classList.toggle("wide", row.width > 400));
  });
  ```

  - It answers null where the item descends from data or from null, where no projection built its list, where the path reaches no item, as past a list's end, and before the first snapshot.
  - A path is checked as `select` checks one, against the result's type, and one that ends at anything but a list's item is refused with `DOMQL2016`.
  - It reads the snapshot the watch has now, as `snapshot` does, so a handler reads it before it awaits anything.
  - The reference never enters a result, so a caller that keeps a copy of a result elsewhere, as across an interop boundary, has none.
- **`dispose()`** cancels the evaluation the watch scheduled, lets go of every observation the watch holds, stops every listener subscribed to it, sets the status to `disposed` and prevents any new handler call; a handler already running may finish. Disposing again does nothing.
- **The watch runs until its owner disposes it,** whether or not listeners remain on it.

<a id="how-a-member-changes"></a>

## How a member changes

Every member declares how its result changes, by the categories [Nexo defines](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/runtime/members.md#how-a-member-changes), and a watch decides by each what it may follow:

| Category | As in DOMQL | In a watch |
| --- | --- | --- |
| Constant | Whether the browser offers a capability, as `Domql.window.share()` asks | Allowed; it never invalidates. |
| Observable | A size, which a resize observation covers | Allowed. |
| Partly observable | A computed style, which a rule outside the element can change unobserved | Allowed when the caller accepts partial observation for that watch; a change the observations miss reaches the watch at its next evaluation, which `refreshAsync` or another observed change causes. |
| Unobserved | A member that names no observations | A validation error. |

A watch is checked against every member its query may read. A member of a value of `Any` is selected as the query is evaluated, so the watch is checked against every declaration of its name Nexo could select, as Nexo's [candidate declarations](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/runtime/resolution.md) overestimate them: a watch over `panel:bag.rect`, where a module's extension member `bag` answers `Any`, takes `acceptPartialObservation`, as one over `panel.rect` does.
| Derived | A list's `first` or `where` | Allowed wherever what it derives from is. |

A literal is constant, so a watched object expression can carry one: `viewport { kind = "viewport", width = it.size?.width }`.

<a id="accepting-partial-observation"></a>

## Accepting partial observation

Accepting partial observation is an option of the watch, `acceptPartialObservation`, chosen when the caller starts it, beside its schedule; it applies to that watch alone and leaves the query's meaning unchanged. A watch over a partly observable member without it is a validation error naming each such member, by the type its declaration is for, and the changes its observations miss. An evaluation once needs no acceptance, since it keeps nothing current.

<a id="dependencies"></a>

## Dependencies

A watch's dependencies are what its last evaluation actually read: each member applied to its receiver and arguments, with that member's observations, each observed as the evaluation reaches it. Dependencies belong to the complete query.

- **Every evaluation holds its dependencies afresh:** it goes on observing what the evaluation before it observed wherever it reaches the same observation again, starts the observations it reaches for the first time, and stops those it no longer reaches. What a watch observes therefore follows the document: in `table.all("tbody tr").max(it.rect?.height)`, the watch depends on what the selector matches within the table, and on the height of each row it matched. A row added starts being observed after the evaluation the addition causes, and a row removed stops being observed.
- **A value argument is a dependency of its own.** `target.intersects({ root = panel })` depends on the intersection of the target with the panel; `it.intersects({ root = it.parent as Element })` also depends on which element is the parent, and a new parent is observed after the evaluation its change causes.
- **An expression argument contributes its dependencies for every item** it was evaluated against or called with.
- **A chain that met null depends on what it read before the null,** so `it.closest(".row")` finding nothing still depends on the ancestors it searched, and the watch evaluates again when one starts to match.
- **A watch keeps its bindings.** A query `with` other bindings starts a watch of its own. When the replacement watch is ready before the old watch is disposed, shared observations with matching targets and identifying arguments remain running throughout the replacement.

<a id="dependencies-following-what-a-member-misses"></a>

### Following a change a member misses

A query follows a change its members miss by reading a member that observes it. A body's local runs whether or not anything uses it, as Nexo's [ordered evaluation](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/language/scripts.md#bodies-ordered-evaluation) sets out, so it adds the dependency without adding to the result. A row a sibling's edit moves, which `rectRelativeTo` misses, is followed by reading the text around it:

```domql
let edited = panel.text
return item.rectRelativeTo(panel)?.top
```

The watch evaluates again whenever the panel's text changes, and reports the row's position where it moved. Reading `text` reads the whole subtree at each evaluation, so a member that observes the change more narrowly serves better where one does. A watch takes no dependency of its own beside its query's, so the definition carries every dependency its watch follows.

<a id="watching-when-a-watch-evaluates"></a>

## When a watch evaluates

Invalidation, evaluation and delivery each keep their own schedule. An observation invalidates the watch at once. The watch evaluates at the next animation frame, once however many observations fired, among the frame's reads, after the writes module code asks for with [`env.frame`](vocabulary.md#extension-modules-environment), so it reads what they wrote, or, under `immediate`, without waiting for an animation frame, where its caller needs a change handled as soon as it is reported, such as at mutation delivery: the first invalidation queues an evaluation in a microtask, and the invalidations received before that evaluation begins share it, so the records one delivery of mutations brings evaluate once, and an invalidation received after it begins, or while it runs, asks for another. Separate native callbacks each reach a microtask of their own, so a resize the browser reports for each element in its own callback evaluates once for each; the frame schedule evaluates once for them all. When the caller receives the snapshot is the caller's own.

<a id="watching-when-handlers-run"></a>

**When its handlers run.** A watch raises its `"change"` event as its evaluation completes, so its handlers run where it evaluates:

- **Under `immediate`,** within the microtask checkpoint of the delivery that invalidated it: a mutation delivery's, after the observers notified in it, and before any task or animation frame, so a handler acts on a mutation before the browser runs anything else or paints.
- **Under `frame`,** inside the animation frame, among its reads, after the writes module code and DOMQL's [owned writes](vocabulary.md#execution-element-owned-writes) ask the frame for, and before the browser lays the frame out and paints it, so a handler may write what it measured, and a resize that write causes is reported before paint.

A watch evaluates its whole query each time. A member may keep its result until its own observations fire, as long as the result is the one a full evaluation would give.

<a id="elements-that-leave-the-document"></a>

## Elements that leave the document

A member that answered null because its element is detached depends on whether that element is attached, so a watch reading it evaluates again when the same element returns to the document, and observes it again from that evaluation. Removing an element changes the results that read it, and a watch over them runs on until its caller ends it.

<a id="trees-and-slots-a-watch-follows"></a>

## Trees and slots a watch follows

A watch follows its receivers through shadow trees and slots by the observation targets `root` and `roots`, the trees a node is in and the trees that can show it, as [trees and slots](nodes-and-shadow-trees.md#trees-and-slots) define them.

- **A move is followed.** Moving a receiver, or one of its flat-tree ancestors, to another tree or slot evaluates the watch again, a move that leaves the receiver attached and an assignment made by hand included, and that evaluation observes the receiver's new root and roots and lets go of those it left. A node moved within or between trees the watch observes is observed.
- **Into the document.** A receiver in a detached tree is followed into the document through whether it is attached, a detached tree inserted into the document included, and a detached node another document owns, as a template's content does, is followed into the document all the same, through the document the watch runs against.
- **One move is not followed.** A detached tree inserted into another detached tree or into a shadow root, even one in the document, changes nothing inside any root the watch observes: nothing in the inserted tree changes, a shadow root's changes reach no observation of the document, and only an observation of the tree it enters would report the insertion, a tree no watch can know of beforehand. A result that move changes is reported only when something else evaluates the watch again, another change or a refresh, and the watch observes the tree the receiver entered from then on.
- **The members that move changes are partly observable for it:** `parent` and a node's `root` miss a detached tree inserted into another detached tree or into a shadow root, `attached` misses only a detached tree inserted into a shadow root in the document, and `shadow.elements` misses a detached tree holding the slot inserted into a shadow tree that assigns it nothing.

<a id="when-evaluation-fails"></a>

## When evaluation fails

A watch whose evaluation fails raises a failed `"change"` event, and keeps the dependencies of its last successful evaluation together with those the failed one recorded before failing. It evaluates again when any of them changes or its caller refreshes it, and its next successful evaluation reports its snapshot whether or not it equals the last one reported; a watch that keeps live state hands over an empty change set where the snapshot equals the last one.

<a id="sharing-a-watch"></a>

## Sharing a watch

Each `watch` starts a watch of its own. To share one evaluation, a caller keeps its handle and subscribes to it and to views of it:

```js
const watch = panelQuery.watch({ acceptPartialObservation: true });

watch.select("size").subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        renderSize(args.value);
    }
});
```

A selected view of a snapshot watch, which `watch.select(...path)` answers, offers `snapshot`, `status`, `error`, `select(...path)`, `sourceOf(...path)`, its path relative to the part, `subscribe(eventName, handler, options?)` and `readyAsync(options?)`. A selected view belongs to the running watch it was selected from, where a [selection](queries.md#selecting-a-result) belongs to a query: it starts no evaluation of its own and needs no disposal, so it has no `dispose()`; each listener subscribed to it stops by its own `dispose()` or `signal`, and disposing the watch stops them all, as it stops its own. Its handlers' sender is the owning watch, and their `value` is the selected part, raised where that part changed, and after a failed evaluation whether or not it did. A watch's query is resolved when the watch starts, so `watch.select(...)` checks the whole path at once, its shape and its fit to the result's type alike, even before the first snapshot arrives. A live-state watch offers no selected views.
