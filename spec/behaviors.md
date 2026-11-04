# Behaviors

<a id="behaviors"></a>

A **behavior** is a [continuous execution](executions.md#executions-running-continuously) an extension module declares, running on the page for an owner: a placement, a gesture, an editor. DOMQL keeps each running instance of it where the module's other declarations find it, so a caller reaches "this owner's behavior on this element" with the element and the owner alone, and no token passed by hand in every query: its commands reach it, its occurrences reach the subscriptions to its event sources, and the state it offers is read by its members, which a watch follows.

```js
const drops = domql.query('import DragDrop\nzone:drops() { key = it.target?["data-key"] }', { zone }).subscribe(handleDrop, { owner: sidebar });
const dropZone = domql.query('import DragDrop\nzone:dropZone({ targets = "[data-key]" })', { zone }).run({ owner: sidebar });

await domql.query('import DragDrop\nzone:cancelDrag()', { zone }).executeAsync({ owner: sidebar });
```

In this document:

1. [The owner](#behaviors-the-owner)
2. [The running instance](#behaviors-the-running-instance)
3. [Commands](#behaviors-commands)
4. [Occurrences](#behaviors-occurrences)
5. [Handling inside the native dispatch](#behaviors-synchronous-handling)
6. [State](#behaviors-state)

<a id="behaviors-the-owner"></a>

## The owner

Every operation is carried out for an **owner**, the `owner` its options give: `evaluate`, `evaluateAsync`, `watch`, `subscribe`, `executeAsync` and `run` each take one, as [the API](api.md#api-the-owner) sets out. An owner is any value, an object or a string among them, and two owners are the same where they are the same value, as a map tells its keys apart; an operation that names none is carried out for null, the owner every such operation shares.

- **What an implementation receives.** Every implementation an operation reaches receives its owner as `env.owner`, a member's as an event source's and an execution's, in the [environment](vocabulary.md#extension-modules-environment) the operation gives them.
- **What it decides.** A continuous execution runs for its owner, and the declarations that reach a behavior find the instance running for theirs. Nothing else depends on it: two owners' queries read the same document alike.

<a id="behaviors-the-running-instance"></a>

## The running instance

A continuous execution's implementation answers an object with `update` and `dispose`, its **running instance**, and may offer more on it, as `open()`, `measure()` or what it holds. DOMQL keeps each running instance by the module that declares it, its name, its owner and the receiver it runs on, undefined for a module member, from the moment it starts until it ends:

- **Several on one receiver.** Two instances of one behavior may run for one owner on one receiver. The one a declaration reaches is the latest to start or to move there, and once it ends, the one before it, if it still runs.
- **Moving.** An update whose receiver is another moves the instance there, once its own `update` accepts it; an update its `update` refuses leaves it where it ran.
- **Ending.** The instance ends as its handle is disposed, as an update skips its preparation, and as an update that fails to start it leaves its handle with none, as [running continuously](executions.md#executions-running-continuously) sets out; no declaration reaches it from then on, its own disposal included.

<a id="behaviors-commands"></a>

## Commands

A **command** is a once execution that reaches a running behavior, as a popover's `open` and `close`, a frame's `measure`, or an editor's `execute`, `setHtml` and `beginLinkDialog`. Its declaration names the behavior by its `behavior` key, the name of a continuous execution its own module declares, as [extension modules](vocabulary.md#extension-modules-host-calls) set out.

- **What it reaches.** `executeAsync` prepares the command as it prepares every once execution, then finds the instance of its behavior running for its owner on its receiver, which its implementation receives as `instance` beside its receiver, its arguments, its environment and its signal.
- **None running.** Where no instance of its behavior runs for its owner on its receiver, the command executes nothing and its promise rejects with the evaluation error `DOMQL5016`, located at the command, so a caller tells a behavior that has ended from a command that failed.
- **Anything else** is a once execution's, as [executing once](executions.md#executions-executing-once) sets out: its result, its failure, its cancellation, and a skipped preparation, which finds nothing and resolves to null.

<a id="behaviors-occurrences"></a>

## Occurrences

What a behavior reports, a drop, a move, a placement or an editor's change, is an **occurrence**: a value it hands to an event source its module declares, whose subscriptions shape it as they shape any event, as [subscribing](events.md#subscribing) sets out. The source names the behavior by its `behavior` key, and DOMQL carries it out, so it declares no implementation and no parameters.

- **Delivering.** A behavior's implementation receives `deliver(source, value)`, which hands the value to the source of that name, from the moment its implementation starts until its instance ends: to every subscription of that source listening for the instance's owner on the receiver it runs on now, each projecting it through its own object expression and calling its handler, in the order they subscribed, before `deliver` returns. Each subscription hears every occurrence: none is dropped or combined with another, but by a subscription that [throttles](events.md#events-throttling) what it hands its handler, which hands it the latest one ready instead. A subscription made while an occurrence is delivered hears from the next one on. Since `deliver` calls every handler before it returns, consecutive deliveries reach every subscription, of one owner or of several, in the order they are made, as [order across handles](api.md#api-order-across-handles) sets out.
- **A delivery inside a handler.** Delivering is synchronous and depth-first: an occurrence delivered while a handler handles another, as by a handler that moves the behavior, reaches every subscription before the delivery that caused it calls its next handler. So a subscription after the one whose handler delivered hears the later occurrence first: with subscriptions A and B, A delivering 2 while it handles 1 is heard as A1, A2, B2, B1. A handler that needs every subscription to hear the two in order defers what delivers the second, as to a microtask.
- **What a subscription hears.** A subscription to a behavior's source listens for its owner on its receiver, whichever instance of the behavior runs there, and every instance where several do. It starts listening as it is made, before any instance runs, and goes on listening as an instance ends and another starts, or as an update gives it other arguments, until it is disposed, so a caller that replaces a behavior loses nothing of what happens between.
- **Moving to another receiver.** An update that moves an instance to another receiver moves its occurrences there: the subscriptions listening on the receiver it left hear nothing more of it, and those listening on the one it entered hear it from the update on. A subscription made for the new receiver before the update loses nothing.

<a id="behaviors-acknowledgment"></a>

**Acknowledgment.** `deliver` answers a promise that settles once each subscription has applied the occurrence: a handler applies it as it returns, or, where it returns a promise, as that promise fulfils. It rejects with the first failure as that happens, while other subscriptions may still be applying the occurrence, so a rejection says that one subscription failed, never that the others are done; a behavior deciding whether to deliver again learns from it nothing of the others. The promise rejects with an evaluation error located at the behavior, where no subscription listens, `DOMQL5017`, and where the instance has ended, `DOMQL5018`, having delivered nothing; with `DOMQL5024`, located at the subscription, where a throttled subscription dropped it for a later one; with `DOMQL5017` located at the subscription, where a subscription is disposed before it applied the occurrence; and with `DOMQL5020` located there, its `cause` the failure, where the subscription's projection fails, which its handler receives as a failed event, or its handler throws or rejects, which goes to the window's error reporting as well. A source its module has none of reaching the behavior rejects with `DOMQL5019`, raised as an `"error"` event of the behavior's handle too, since it is the module's mistake. A behavior may leave the promise: DOMQL handles it, so nothing reports a rejection no one awaited.

The `deliver` an event source of a module's own implementation receives answers the same acknowledgment, of its one subscription.

<a id="behaviors-synchronous-handling"></a>

## Handling inside the native dispatch

What must be decided before the browser's dispatch of an event ends, cancelling it, consuming a key, claiming a click or capturing a pointer, is decided inside a behavior's own listeners, which the behavior adds to the page and the browser calls within that dispatch, as for any script. A subscription never cancels what it hears, as [`on`](events.md#event-sources) never does.

- **Delivering is synchronous.** `deliver` captures the occurrence, projects it for every subscription and calls every handler before it returns, so a handler runs inside the native dispatch of the listener that delivered, and an execution it carries out at once has the [activation](vocabulary.md#built-in-executions) the event gives. A handler's own asynchronous work goes on after the dispatch, as the promise it returns.
- **Delivering never throws.** Nothing that happens to an occurrence, no subscription, a projection or a handler failing, or an ended instance, throws into the listener that delivers it: it reaches the promise `deliver` answers, and the handler or the window's error reporting where it always does, so the listener goes on with its own work, as applying a press it passes through after delivering.

<a id="behaviors-state"></a>

## State

What a behavior holds that a caller reads rather than hears, a placement's side or an editor's selection, is **state it offers**: a member of its module that the evaluator invokes, declaring the behavior by its `behavior` key, and read with `:` as any extension member is, `popover:placement`.

- **What it reads.** Its implementation receives `instance`, the instance of its behavior running for the environment's owner on its receiver, as a command finds it, or null where none runs, beside what every member's implementation receives, and reads alone, as every member does. A member of a module member behavior, which runs on no receiver, is a module member too.
- **How a watch follows it.** The member names DOMQL's observation `behavior`, of its receiver, `{ type: 'behavior', of: 'receiver', behavior: 'anchoredPlacement' }`, which invalidates a watch reading it as an instance of the behavior of that name starts on the receiver, is updated, moves there or away, or ends, and each time the instance says that what it offers may have changed, through the `notify()` its implementation receives. The observation follows behaviors by their name, whatever module and owner they belong to, so the member's own reading tells what changed for its owner.
- **Its type** is the member's own, data a result holds, as the instance offers it through the member's implementation; the instance itself never reaches a result.
