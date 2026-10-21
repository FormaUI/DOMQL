# Executions

<a id="executions"></a>
<a id="actions-and-behaviors"></a>

An **execution** is a [host call](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-host-calls) DOMQL carries out to change the page. A **once execution** changes it once and answers its result; a **continuous execution** starts something that runs on the page until it is updated or disposed, and has no result. DOMQL's module declares neither: an [extension module](vocabulary.md#extension-modules) declares each, with its execution mode and the implementation that carries it out. `executeAsync` carries out a once execution and `run` a continuous one, and no other operation carries out either, as [request kinds and their operations](queries.md#operations-and-request-kinds) set out.

```js
// A once execution a module declares, carried out each time it is executed.
const changed = await domql.query('panel.mark("reviewed")', { panel }).executeAsync();

// A continuous execution a module declares, running until it is disposed.
const trap = domql.query(`dialog.focusTrap()`, { dialog }).run({ signal });

trap.subscribe("error", (sender, args) => reportError(args.error));
trap.update({ dialog: otherDialog });
trap.dispose();
```

In this document:

1. [Executing once](#executions-executing-once)
2. [Running continuously](#executions-running-continuously)

<a id="executing-an-action"></a>
<a id="executions-executing-once"></a>

## Executing once

`query.executeAsync(options?)` carries out a once execution and answers a promise of its result; its options are `window` and `signal`. Each call executes it again.

- **Preparation first.** Its receiver and its arguments are prepared first, synchronously, as [Lexica's preparation](https://github.com/FormaUI/Lexica/blob/main/spec/runtime.md#runtime-host-calls) evaluates them; a failure there rejects the promise and executes nothing. A skipped preparation, where the receiver or an argument is null, executes nothing, and the promise resolves to null, as a member's null is.
- **The result.** The execution's implementation receives the receiver, the arguments, the environment and the signal, and may answer its result or a promise of it. The result must be of the type the execution declares, and data alone; a result of another type rejects the promise with an evaluation error naming the execution. An object expression that follows the execution is evaluated against the result once it arrives, as `evaluate` evaluates a query, so a member maintained by an observation fails it, and the promise answers detached, immutable data.
- **Failure.** A failure of the execution, whatever it throws, rejects the promise with an evaluation error naming the execution, whose cause is what was thrown; nothing goes to the error reporting while the caller holds the promise.
- **Cancellation.** A signal already aborted rejects with its reason and executes nothing. A signal that aborts while the execution runs rejects the promise with its reason at once, and the execution learns of it through the signal it was given; what it does after that is its own, its result is discarded, and a failure it reports afterwards goes to the window's error reporting, since no caller waits for it.
- **No rollback.** An execution can change the document before it fails or is canceled, and DOMQL never undoes what it did; an execution that can be undone offers that as an execution of its own.

<a id="applying-a-behavior"></a>
<a id="executions-running-continuously"></a>

## Running continuously

`query.run(options?)` starts a continuous execution and answers a `DomqlExecutionHandle`, its handle, which belongs to the caller that started it; the execution has started when the call returns, though work it began may still be under way. Its options are `window` and `signal`, which disposes the execution when it aborts.

- **Starting is synchronous.** The execution's implementation receives the receiver, the arguments and the environment, starts the execution before it returns, and answers an object with `update` and `dispose`. A failure to start, or an answer without both, throws an evaluation error naming the execution, whose cause is what was thrown, and leaves nothing running. A skipped preparation, where the receiver or an argument is null, has nothing to start, and its handle is `ready` with no instance.
- **The handle.** `status` is `ready` from the call on and `disposed` once ended, and `subscribe(eventName, handler, options?)` adds a listener to its `"error"` events. A failure inside the running execution, after it started, which the execution reports through the reporter its implementation receives, raises an `"error"` event on the handle, and reaches the window's error reporting where no listener receives it.
- **`update(bindings)`** replaces the bindings whole, as `with` binds a query, so a caller states every parameter and nothing is left over from before. It validates first: the bindings are checked, the request is resolved again against them, and the receiver and the arguments are prepared, and any failure throws, a validation or an evaluation error, leaving the execution running with its earlier bindings. A resolution that would select a different member is refused with a validation error, since that is another execution to run. An execution run on a receiver of unknown type, a null binding, has selected no declaration yet: the first update whose receiver selects one commits the execution to it, and every update after it is held to that declaration, one that binds null again included. Only then does the execution's `update` receive the new receiver and arguments; a failure there throws an evaluation error naming the execution, and the execution keeps the bindings it last accepted. Updating a disposed execution throws.
- **A handle with no instance** stays `ready`, whether its start was skipped or an update disposed the instance that ran, and it follows its bindings as a running one does: an update whose preparation is prepared starts an instance, as `run` does, a failure to start throwing as it does there and leaving the handle with no instance; an update whose preparation is skipped leaves it with none, and one that skips while an instance runs disposes that instance.
- **`dispose()`** ends the execution once: it calls the running instance's `dispose`, where one runs, and reports a failure of it to the window's error reporting; it stops the handle's listeners, and marks the handle `disposed` whatever happened, a handle with no instance alike. Disposing again does nothing, and the execution's module stays registered.
