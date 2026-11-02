# Events

<a id="events"></a>
<a id="event-delivery"></a>

An **event source** delivers things that happened, as a click or a key pressed, and a **subscription** shapes each event it delivers into data, read as the event is dispatched. An event source is a [host call](https://github.com/FormaUI/Nexo/blob/cf5cb6f30f3326c0be12ec6369d24540ffaba5e2/spec/language/members.md#members-host-calls) DOMQL carries out by subscribing to it, and a subscription is a query whose chain ends in one: a caller subscribes to it, and the caller's handler receives one result for each event, immutable data that holds no event object and no element.

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

An event source is subscribed to, and never read or watched: DOMQL starts it as its caller subscribes, and has each event it delivers projected through the object expression that follows it, as Nexo [projects a value its host supplies](https://github.com/FormaUI/Nexo/blob/cf5cb6f30f3326c0be12ec6369d24540ffaba5e2/spec/runtime/host-calls.md#runtime-host-calls), each event captured as the members of the type its event type maps to.

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

DOMQL's module declares the [type selector](https://github.com/FormaUI/Nexo/blob/cf5cb6f30f3326c0be12ec6369d24540ffaba5e2/spec/language/vocabulary.md#vocabulary-type-selectors) `event`, whose keys are the event types, and a module extends it with event types of its own as it extends DOMQL's types. The built-in event types, the type each maps to, and the members each event offers:

| Event types | Type | Members |
| --- | --- | --- |
| `click`, `dblclick`, `pointerdown`, `pointerup`, `pointermove`, `pointercancel`, `lostpointercapture` | `PointerEvent` | `target`: `Element`, `button`: `Number`, `buttons`: `Number`, `clientX`: `Number`, `clientY`: `Number`, `pointerType`: `String?`, `pointerId`: `Number?`, `detail`: `Number`, and the modifiers |
| `touchstart`, `touchmove` | `TouchEvent` | `target`: `Element`, `touches`: `List<Touch>`, and the modifiers |
| `wheel` | `WheelEvent` | `target`: `Element`, `deltaX`: `Number`, `deltaY`: `Number`, `deltaMode`: `Number`, and the modifiers |
| `keydown`, `keyup` | `KeyboardEvent` | `target`: `Element`, `key`: `String`, `code`: `String`, `repeat`: `Boolean`, `isComposing`: `Boolean`, the modifiers, and `altGraphKey`: `Boolean` |
| `dragstart`, `dragenter`, `dragover`, `dragleave`, `dragend`, `drop` | `DragEvent` | `target`: `Element`, `clientX`: `Number`, `clientY`: `Number`, `types`: `List<String>`, and the modifiers |
| `focus`, `blur`, `focusin`, `focusout` | `FocusEvent` | `target`: `Element?`, `relatedTarget`: `Element?` |
| `beforeinput`, `input` | `InputEvent` | `target`: `Element?`, `inputType`: `String`, `data`: `String?`, `isComposing`: `Boolean` |
| `paste`, `copy`, `cut` | `ClipboardEvent` | `target`: `Element`, `types`: `List<String>` |
| `compositionstart`, `compositionend` | `CompositionEvent` | `target`: `Element`, `data`: `String` |
| `beforetoggle`, `toggle` | `ToggleEvent` | `target`: `Element`, `oldState`: `String`, `newState`: `String` |
| `animationstart`, `animationend`, `animationcancel` | `AnimationEvent` | `target`: `Element`, `animationName`: `String` |
| `scroll`, `resize`, `selectionchange`, `close`, `cancel`, `load`, `error`, `play`, `pause`, `volumechange`, `ended` | `DomEvent` | `target`: `Element?` |

Every event type holds, beside its own, the members every event carries: `timeStamp`: `Number`, `defaultPrevented`: `Boolean` and `composedPath`: `List<Element>`. The **modifiers** are `ctrlKey`, `metaKey`, `altKey` and `shiftKey`, each a `Boolean`, whether that key was held as the event was dispatched. A `Touch` is one point touching the surface, `{ identifier, clientX, clientY }`, each a `Number`.

An event is captured when it is dispatched. Each member is the event's own property of its name, as the browser answers it:

- **Every event's.** A `timeStamp` is the time it was dispatched, in milliseconds from the document's time origin, and `defaultPrevented` whether a listener that ran before the subscription's cancelled it, which a listener nearer its target, or one added before it where it listens, can have done.
- **A pointer's and a wheel's.** A `detail` is the count of clicks a click or a `dblclick` makes, and a `deltaMode` the unit of a wheel's deltas, `0` for pixels, `1` for lines and `2` for pages.
- **A key's.** `repeat` is whether the key is held down and repeating, and the modifiers are the keys held with it.
- **Focus.** A `relatedTarget` is the element focus leaves, for a `focus` or a `focusin`, or moves to, for a `blur` or a `focusout`; `focusin` and `focusout` bubble, where `focus` and `blur` don't.
- **Editing.** An `inputType` is the kind of edit, as `insertText` or `deleteContentBackward`, and its `data` the text it inserts, null where it inserts none; a composition's `data` is the text it composes; and `selectionchange` reaches the document, or a text control whose selection moves.
- **Presentation and animation.** A toggle's `oldState` and `newState` are `"open"` or `"closed"`, as a popover, a `details` element and a dialog report them, and an animation's `animationName` the name of its keyframes.

DOMQL reads these members for the event, since no property of it answers them as data:

- **`pointerId` and `pointerType`** are null where the event carries no pointer: a click the keyboard caused, which the browser gives the pointer `-1` and the type `""`, a `dblclick`, which is a mouse event, and a click a browser dispatches as a mouse event.
- **`touches`** holds the points touching the surface, in the order the event's touch list holds them, and none where it carries no touch list.
- **`types`** holds the formats a drag carries, as its data transfer lists them, `"Files"` while it carries files, or a clipboard event's, as its clipboard data lists them, and none where it carries neither. The data itself is no member, since the browser holds a drag's back until the drop and a clipboard event's is the page's to read.
- **`inputType`** is `""`, and **`isComposing`** false, for an input event that says neither, as HTML fires at a select, a checkbox or a radio button.
- **`altGraphKey`** is whether AltGr was held, as the event's `getModifierState("AltGraph")` answers it, which no property says.
- **`composedPath`** holds the elements the event passes through, from its target outwards, as its composed path lists them where the subscription hears it: shadow roots, the document and the window are left out, and so are the elements of a closed shadow tree the subscription stands outside of.

DOMQL reads these members so for every event `on` delivers, of a module's event type as of its own.

A member the event carries no value of its type for is null where its type is nullable, as Nexo sets out:

- **`DomEvent`'s `target`,** for a scroll or a resize that targets the document or the window, and a `selectionchange` at the document.
- **`FocusEvent`'s `target`,** for the window gaining or losing focus, and its **`relatedTarget`**, where focus comes from or goes to no element of the window.

<a id="subscribing"></a>

## Subscribing

An event's object expression is evaluated as the event arrives, and its result, immutable data, reaches the caller by the caller's own delivery. `query.subscribe(handler, options?)` listens to a subscription and answers a `DomqlEventListener`, the subscription's handle, with `status` and `dispose()` alone, as every event listener has; its options are `window`, [`owner`](api.md#api-the-owner) and `signal`, which disposes it when it aborts. The handler is called with `(sender, args)`: the event listener, and for each event `status: "ready"` with the event's result as `value`, or `status: "failed"` with `error` alone where capturing or projecting the event fails. Its handler's calls follow the order and the disposal of [events of a handle](api.md#events-of-a-handle).

- **Listening starts in the call.** The event listener starts its source before `subscribe` returns, so an event dispatched right after the call is heard, and a source that cannot start fails the call with an evaluation error whose cause is what the source threw. Its `status` is `ready` from the call on and `disposed` once ended; it never waits for an event.
- **Events during the start.** A source may deliver while it starts. Those events are captured and projected at once, and the handler receives them once the caller holds the event listener, before any later event; where the start fails, the handler never receives them and the observations they started are let go of.
- **The receiver and the arguments** of the source are prepared once, as listening starts, so an event listener does not follow a receiver that changes; a skipped preparation, where the receiver is null, or an argument whose parameter propagates null is null, starts nothing, and the event listener is `ready` and listens to nothing.
- **A failed event,** one whose capture or object expression fails, reaches the handler with `status: "failed"` and leaves the event listener `ready`, listening; the next event is captured and projected again. A failure of the handler itself goes to the window's error reporting, and the handler is never called with its own failure.
- **Applying an event.** The handler applies an event as it returns, or, where it returns a promise, as that promise fulfils. DOMQL calls the handler with the next event without waiting for it, and the source that delivered the event learns when it was applied from what its `deliver` answers, as a behavior's [acknowledgment](behaviors.md#behaviors-acknowledgment) sets out.
- **A behavior's source.** An event source a module declares for a [behavior](behaviors.md#behaviors-occurrences) delivers the occurrences every instance of the behavior running for the subscription's owner on its receiver hands it, from the subscription's start on, whether or not an instance runs as it starts.
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
