# Events

<a id="events"></a>
<a id="event-delivery"></a>

An **event source** delivers things that happened, as a click or a key pressed, and a **subscription** shapes each event it delivers into data, read as the event is dispatched. A subscription is a query whose chain ends in an event source: a caller subscribes to it, and the caller's handler receives one result for each event, immutable data that holds no event object and no element.

```js
const clicks = domql.query(`
    button.on("click") {
        panelSize = panel.size
    }
`, { button, panel });

const listener = clicks.subscribe((sender, args) => {
    if (args.status === "ready") {
        handleClick(args.value);
    }
}, { signal });
```

In this document:

1. [Event sources](#event-sources)
2. [Event types](#event-types)
3. [Subscribing](#subscribing)
4. [Maintained members in an event](#events-maintained-members)

<a id="event-sources"></a>

## Event sources

An event source follows [Lexica's contract](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#events-and-event-types): it delivers things that happened, is subscribed to and never read or watched, and the object expression following it is evaluated against each event, captured as the members its event type declares.

| Available on | Source | Type | Delivers | Reads | Fixed |
| --- | --- | --- | --- | --- | --- |
| Element, document, window | `on(type)` | `type`: `string` → `event<T>` for the event type `type` names | The native events of that type as they reach it, each with the members its declared event type offers, such as a pointer event's `button`, `clientX` and `clientY`; a type the vocabulary declares no event type for is a validation error | Captured at dispatch | `type` |

`on` listens passively, so it never delays or prevents what the page does with an event.

<a id="event-types"></a>

## Event types

The built-in event types, and the members each event offers:

| Event types | Event data type | Members |
| --- | --- | --- |
| `click`, `pointerdown`, `pointerup` | `pointerEvent` | `target`: `element`, `button`: `number`, `buttons`: `number`, `clientX`: `number`, `clientY`: `number`, `pointerType`: `string?` |
| `keydown`, `keyup` | `keyboardEvent` | `target`: `element`, `key`: `string`, `code`: `string` |
| `drop` | `dragEvent` | `target`: `element`, `clientX`: `number`, `clientY`: `number` |
| `focus`, `blur`, `input`, `scroll`, `resize` | `domEvent` | `target`: `element?` |

An event is captured when it is dispatched. A member the event carries no value of its type for is null where its type is nullable, as Lexica sets out, so `domEvent`'s `target` is null for a scroll or a resize that targets the document or the window, and `pointerEvent`'s `pointerType` for a browser that dispatches a click as a mouse event.

<a id="subscribing"></a>

## Subscribing

An event's object expression is evaluated as the event arrives, and its result, immutable data, reaches the caller by the caller's own delivery. `query.subscribe(handler, options?)` listens to a subscription and answers a `DomqlEventListener`, the subscription's handle, with `status` and `dispose()` alone, as every event listener has; its options are `window` and `signal`, which disposes it when it aborts. The handler is called with `(sender, args)`: the event listener, and for each event `status: "ready"` with the event's result as `value`, or `status: "failed"` with `error` alone where capturing or projecting the event fails. Its handler's calls follow the order and the disposal of [events of a handle](api.md#events-of-a-handle).

- **Listening starts in the call.** The event listener starts its source before `subscribe` returns, so an event dispatched right after the call is heard, and a source that cannot start fails the call with an evaluation error whose cause is what the source threw. Its `status` is `ready` from the call on and `disposed` once ended; it never waits for an event.
- **Events during the start.** A source may deliver while it starts. Those events are captured and projected at once, and the handler receives them once the caller holds the event listener, before any later event; where the start fails, the handler never receives them and the observations they started are let go of.
- **The receiver and the arguments** of the source are evaluated once, as listening starts, so an event listener does not follow a receiver that changes, and listens to nothing where the receiver or an argument is null.
- **A failed event,** one whose capture or object expression fails, reaches the handler with `status: "failed"` and leaves the event listener `ready`, listening; the next event is captured and projected again. A failure of the handler itself goes to the window's error reporting, and the handler is never called with its own failure.
- **`dispose()`** ends the listening, lets go of every observation the event listener holds and prevents any new handler call; one already running may finish. Disposing again does nothing.

<a id="events-maintained-members"></a>

## Maintained members in an event

A maintained member in an event's object expression reads its latest sample, or null while it is pending, never waits for a later one and never revises a result already delivered:

```domql
button.on("click") {
    nearEnd = sentinel.intersects({ root = panel })
}
```

The subscription holds the observations its object expressions start. After each successful evaluation it keeps those that evaluation read and lets go of the rest, so an observation one event started serves the next: the first event reports null for a member still pending, and a later one reads the sample that arrived meanwhile. A failed evaluation delivers no result and reports its failure as a failed event; the subscription keeps the observations it held before it and lets go of those the failed attempt started. Ending the subscription lets go of every observation it holds, and an observation another holder still holds runs on.
