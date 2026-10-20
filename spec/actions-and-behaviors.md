# Actions and behaviors

<a id="actions-and-behaviors"></a>

An **action** changes the page once and answers its result, and a **behavior** starts something that runs on the page until it is updated or disposed, as Lexica's [actions and behaviors](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-actions-and-behaviors) define them. DOMQL's module declares neither; an [extension module](vocabulary.md#extension-modules) declares each, with the implementation that carries it out. An action is executed and a behavior applied, each through an operation of its own, and no other operation carries either out, as [request kinds and their operations](queries.md#operations-and-request-kinds) set out.

```js
// An action a module declares, executed once.
const changed = await domql.query('panel.mark("reviewed")', { panel }).executeAsync();

// A behavior a module declares, applied until it is disposed.
const behavior = domql.query(`dialog.focusTrap()`, { dialog }).apply({ signal });

behavior.subscribe("error", (sender, args) => reportError(args.error));
behavior.update({ dialog: otherDialog });
behavior.dispose();
```

In this document:

1. [Executing an action](#executing-an-action)
2. [Applying a behavior](#applying-a-behavior)

<a id="executing-an-action"></a>

## Executing an action

`query.executeAsync(options?)` executes an action and answers a promise of its result; its options are `window` and `signal`. Each call executes the action again.

- **Evaluation first.** The receiver and the arguments are evaluated first, synchronously, as `evaluate` evaluates them; a failure there rejects the promise and executes nothing, and an action whose receiver or an argument is null is not executed, its result being null, as a member's is.
- **The result.** The action's function receives the receiver, the arguments, the environment and the signal, and may answer its result or a promise of it. The result must be of the type the action declares, and data alone; a result of another type rejects the promise with an evaluation error naming the action. An object expression that follows the action is evaluated against the result once it arrives, as `evaluate` evaluates a query, so a member maintained by an observation fails it, and the promise answers detached, immutable data.
- **Failure.** A failure of the action, whatever it throws, rejects the promise with an evaluation error naming the action, whose cause is what was thrown; nothing goes to the error reporting while the caller holds the promise.
- **Cancellation.** A signal already aborted rejects with its reason and executes nothing. A signal that aborts while the action runs rejects the promise with its reason at once, and the action learns of it through the signal it was given; what the action does after that is its own, its result is discarded, and a failure it reports afterwards goes to the window's error reporting, since no caller waits for it.
- **No rollback.** An action can change the document before it fails or is canceled, and DOMQL never undoes what it did; an action that can be undone offers that as an action of its own.

<a id="applying-a-behavior"></a>

## Applying a behavior

`query.apply(options?)` starts a behavior and answers a `DomqlBehavior`, its handle, which belongs to the caller that applied it; the behavior has started when the call returns, though work it began may still be under way. Its options are `window` and `signal`, which disposes the behavior when it aborts.

- **Applying is synchronous.** The behavior's function receives the receiver, the arguments and the environment, starts the behavior before it returns, and answers an object with `update` and `dispose`. A failure to start, or an answer without both, throws an evaluation error naming the behavior, whose cause is what was thrown, and leaves nothing running. A behavior whose receiver or an argument is null has nothing to apply, and its handle is `ready` with no instance.
- **The handle.** `status` is `ready` from the call on and `disposed` once ended, and `subscribe(eventName, handler, options?)` adds a listener to its `"error"` events. A failure inside the running behavior, after it started, which the behavior reports through the reporter its function receives, raises an `"error"` event on the handle, and reaches the window's error reporting where no listener receives it.
- **`update(bindings)`** replaces the bindings whole, as `with` binds a query, so a caller states every parameter and nothing is left over from before. It validates first: the bindings are checked, the request is resolved again against them, and the receiver and the arguments are evaluated, and any failure throws, a validation or an evaluation error, leaving the behavior running with its earlier bindings. A resolution that would select a different member is refused with a validation error, since that is another behavior to apply. A behavior applied to a receiver of unknown type, a null binding, has selected no declaration yet: the first update whose receiver selects one commits the behavior to it, and every update after it is held to that declaration, one that binds null again included. Only then does the behavior's `update` receive the new receiver and arguments; a failure there throws an evaluation error naming the behavior, and the behavior keeps the bindings it last accepted. An update that supplies a receiver to a handle with no instance applies one, and one that leaves the receiver or an argument null disposes the one that ran. Updating a disposed behavior throws.
- **`dispose()`** ends the behavior once: it calls the behavior's `dispose`, reports a failure of it to the window's error reporting, stops the handle's listeners, and marks the handle `disposed` whatever happened. Disposing again does nothing, and the behavior's module stays registered.
