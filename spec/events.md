# Events

<a id="events"></a>
<a id="event-delivery"></a>

An **event source** delivers things that happened, as a click or a key pressed, and a **subscription** shapes each event it delivers into data, read as the event is dispatched. An event source is a [host call](https://github.com/FormaUI/Nexo/blob/2cb596ea0d1a1fc624552783b30139379124bb67/spec/language/members.md#members-host-calls) DOMQL carries out by subscribing to it, and a subscription is a query whose chain ends in one: a caller subscribes to it, and the caller's handler receives one result for each event, immutable data that holds no event object and no element.

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

An event source is subscribed to, and never read or watched: DOMQL starts it as its caller subscribes, and has each event it delivers projected through the object expression that follows it, as Nexo [projects a value its host supplies](https://github.com/FormaUI/Nexo/blob/2cb596ea0d1a1fc624552783b30139379124bb67/spec/runtime/host-calls.md#runtime-host-calls), each event captured as the members of the type its event type maps to.

| Available on | Source | Delivers | Fixed |
| --- | --- | --- | --- |
| Element, document, window | `on(type, options?)`, `type`: `String`, selecting through the type selector `event`; optional `options`: `Listening?`, `{ capture }`, at the target and as it bubbles when omitted or null | The native events of that type as they reach it, each with the members its event type offers, such as a pointer event's `button`, `clientX` and `clientY`; a type the selector maps no type to is a validation error | `type` |

`on` listens passively, so it never delays or prevents what the page does with an event. It hears an event as it reaches its receiver at its target and as it bubbles, and, given `{ capture = true }`, as it is captured on its way to its target, before any listener nearer the target runs, so a listener there that stops the event hides nothing from it:

```domql
Domql.document.on("click", { capture = true }) {
    key = it.target.closest("[data-key]")?["data-key"]
}
```

A subscription listening in the capture phase observes alone, as every subscription does: it never stops or cancels what it hears.

<a id="event-types"></a>

## Event types

DOMQL's module declares the [type selector](https://github.com/FormaUI/Nexo/blob/2cb596ea0d1a1fc624552783b30139379124bb67/spec/language/vocabulary.md#vocabulary-type-selectors) `event`, whose keys are the event types, and a module extends it with event types of its own as it extends DOMQL's types. The built-in event types, the type each maps to, and the members each event offers:

| Event types | Type | Members |
| --- | --- | --- |
| `click`, `dblclick`, `pointerdown`, `pointerup`, `pointermove`, `pointercancel`, `lostpointercapture` | `PointerEvent` | `target`: `Element`, `button`: `Number`, `buttons`: `Number`, `clientX`: `Number`, `clientY`: `Number`, `pointerType`: `String?`, `pointerId`: `Number?`, `detail`: `Number`, `timeStamp`: `Number`, and the modifiers |
| `touchstart`, `touchmove` | `TouchEvent` | `target`: `Element`, `touches`: `List<Touch>`, `timeStamp`: `Number`, and the modifiers |
| `wheel` | `WheelEvent` | `target`: `Element`, `deltaX`: `Number`, `deltaY`: `Number`, `deltaMode`: `Number`, `timeStamp`: `Number`, and the modifiers |
| `keydown`, `keyup` | `KeyboardEvent` | `target`: `Element`, `key`: `String`, `code`: `String` |
| `dragstart`, `dragenter`, `dragover`, `dragleave`, `dragend`, `drop` | `DragEvent` | `target`: `Element`, `clientX`: `Number`, `clientY`: `Number`, `types`: `List<String>`, `timeStamp`: `Number`, and the modifiers |
| `focus`, `blur`, `input`, `scroll`, `resize` | `DomEvent` | `target`: `Element?` |

The **modifiers** are `ctrlKey`, `metaKey`, `altKey` and `shiftKey`, each a `Boolean`, whether that key was held as the event was dispatched. A `Touch` is one point touching the surface, `{ identifier, clientX, clientY }`, each a `Number`.

An event is captured when it is dispatched. Each member is the event's own property of its name, as the browser answers it, a `detail` the count of clicks a click or a `dblclick` makes, a `timeStamp` the time it was dispatched in milliseconds from the document's time origin, and a `deltaMode` the unit of a wheel's deltas, `0` for pixels, `1` for lines and `2` for pages, but for these, which DOMQL reads for the event since no property of it answers them as data:

- **`pointerId` and `pointerType`** are null where the event carries no pointer: a click the keyboard caused, which the browser gives the pointer `-1` and the type `""`, a `dblclick`, which is a mouse event, and a click a browser dispatches as a mouse event.
- **`touches`** holds the points touching the surface, in the order the event's touch list holds them, and none where it carries no touch list.
- **`types`** holds the formats a drag carries, as its data transfer lists them, `"Files"` while it carries files, and none where it carries no data transfer. The data itself is no member, since the browser holds it back until the drop.

DOMQL reads these members so for every event `on` delivers, of a module's event type as of its own.

A member the event carries no value of its type for is null where its type is nullable, as Nexo sets out, so `DomEvent`'s `target` is null for a scroll or a resize that targets the document or the window.

<a id="subscribing"></a>

## Subscribing

An event's object expression is evaluated as the event arrives, and its result, immutable data, reaches the caller by the caller's own delivery. `query.subscribe(handler, options?)` listens to a subscription and answers a `DomqlEventListener`, the subscription's handle, with `status` and `dispose()` alone, as every event listener has; its options are `window` and `signal`, which disposes it when it aborts. The handler is called with `(sender, args)`: the event listener, and for each event `status: "ready"` with the event's result as `value`, or `status: "failed"` with `error` alone where capturing or projecting the event fails. Its handler's calls follow the order and the disposal of [events of a handle](api.md#events-of-a-handle).

- **Listening starts in the call.** The event listener starts its source before `subscribe` returns, so an event dispatched right after the call is heard, and a source that cannot start fails the call with an evaluation error whose cause is what the source threw. Its `status` is `ready` from the call on and `disposed` once ended; it never waits for an event.
- **Events during the start.** A source may deliver while it starts. Those events are captured and projected at once, and the handler receives them once the caller holds the event listener, before any later event; where the start fails, the handler never receives them and the observations they started are let go of.
- **The receiver and the arguments** of the source are prepared once, as listening starts, so an event listener does not follow a receiver that changes; a skipped preparation, where the receiver or an argument is null, starts nothing, and the event listener is `ready` and listens to nothing.
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
