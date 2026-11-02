# Behaviors

<a id="behaviors"></a>

A **behavior** is a [continuous execution](executions.md#executions-running-continuously) an extension module declares, running on the page for an owner: a placement, a gesture, an editor. DOMQL keeps each running instance of it where the module's other declarations find it, so a caller reaches "this owner's behavior on this element" with the element and the owner alone, and no token passed by hand in every query.

```js
const placement = domql.query('import Placement\npopover:anchoredPlacement({ anchor = trigger })', { popover, trigger }).run({ owner: menu });

await domql.query('import Placement\npopover:open()', { popover }).executeAsync({ owner: menu });
```

In this document:

1. [The owner](#behaviors-the-owner)
2. [The running instance](#behaviors-the-running-instance)
3. [Commands](#behaviors-commands)

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
