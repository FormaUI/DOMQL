# Replacing Forma's JavaScript with DOMQL

Forma's components do their browser work through 79 scripts, 9,484 lines of JavaScript, and Forma is to be DOMQL's first consumer: each script is to become DOMQL queries, watches, subscriptions and executions, with the algorithms that can't be expressed that way contributed as Forma's own DOMQL modules. This document records what that replacement needs of DOMQL: what DOMQL already provides, what it lacks, and, for every script, what it becomes.

It was written from a reading of every script, its C# wrapper and the components that use it, against DOMQL as it stands:

| Surveyed | At |
| --- | --- |
| Forma | `dadf7311`, the scripts under `src/**/wwwroot/scripts/` (tests and `.local/` excluded) |
| DOMQL | `7406eb4`: specification `1.0.0-alpha.277`, implementation `1.0.0-alpha.276`, on Lexica's language `1.0.0-alpha.33` |
| Lexica | `17a6642`: language `1.0.0-alpha.37`, which DOMQL adopts at its [checkpoints](features-status.md#implementation-plan); the gaps were found against `3973e6e`, language `1.0.0-alpha.35` |

Forma's own plan for the conversion is its [DOM watcher and engine design](https://github.com/FormaUI/Forma/blob/main/docs/dom-watcher-engine-design.md) and its [implementation plan](https://github.com/FormaUI/Forma/blob/main/docs/dom-watcher-engine-implementation-plan.md), whose steps 5 to 11 this document refers to. Their DOMQL examples predate DOMQL's current notation (`@viewport`, `focus.within`, `attribute-of`); this document writes today's (`viewport { width = it.size.width }`, `it.focusWithin()`, `it["data-key"]`). Every addition it proposes is written in DOMQL notation, and every name it proposes is provisional: the specification settles it.

In this document:

1. [The verdict](#the-verdict)
2. [How the scripts map onto DOMQL](#how-the-scripts-map-onto-domql)
3. [Decisions the replacement rests on](#decisions-the-replacement-rests-on)
4. [The gaps](#the-gaps)
5. [What Lexica does](#what-lexica-does)
6. [The scripts, one by one](#the-scripts-one-by-one)
7. [The order of the work](#the-order-of-the-work)
8. [Findings in Forma along the way](#findings-in-forma-along-the-way)

## The verdict

DOMQL's model fits Forma. Its reading half is close to complete for what Forma reads: of the 79 scripts, two become plain watches with nothing added (`GridColumns.js`, `Breakpoint.js`), one more needs only a refresh that delivers an equal result (`IntersectionStateObserver.mjs`), and every observation Forma's foundation runs by hand, its resize and intersection pools, its frame coalescing, its change-only reporting and its detached-element handling, is what a DOMQL watch already does. Its executions, `executeAsync` and `run` with `update` and `dispose`, are the right shape for Forma's actions and behaviors.

What it lacks falls into eight areas, in the order they block the most:

1. **DOMQL carries out no change to the page of its own.** Its module declares no executions, so focusing an element, scrolling, showing a popover or a dialog, capturing a pointer, writing the clipboard and every other change a component asks for has no built-in form. Forma needs about forty built-in executions ([X1 to X10](#executions)).
2. **A behavior can't talk back.** A continuous execution answers nothing and raises only `"error"`, so a running behavior can't offer the occurrences Forma's behaviors report (drops, reorder moves, placements, wheel turns, input actions, selections, editor changes), can't be found by the once executions that command it (`fit`, `measure`, `raise`, `focusItem`, an editor command), and knows nothing of the owner that started it. This is the central gap of the extension contract ([C1 to C4](#the-extension-contract)), and every behavior with a C# callback today needs it.
3. **The vocabulary has no scroll, no focused element, no document selection, no value or text,** and no writing direction followed through its ancestors ([V1 to V18](#vocabulary)).
4. **The event selector has eleven event types and few members.** Forma needs pointer moves and cancellation, wheel, drag, focus with `relatedTarget`, editing, clipboard, presentation and animation events, modifiers, `pointerId` and listening in the capture phase ([E1 to E9](#events)). `on` should stay passive: cancelling stays in modules ([D2](#decisions-the-replacement-rests-on)).
5. **Module code can't build on DOMQL.** An implementation can't start DOMQL's pooled observations, use its frame schedule or evaluate a query, so each Forma module would run its own observers beside DOMQL's ([C5 to C8](#the-extension-contract)).
6. **The host side is unfinished.** The C# half isn't started, a refresh delivers nothing when its result is unchanged, change sets are relative to the previous evaluation rather than to what the receiver acknowledged, and nothing loads a module on request ([A1 to A10](#api-and-host)).
7. **The language had gaps of its own, which Lexica has closed.** DOMQL's Lexica, alpha.33, lacks the list members, imports and extension access of alpha.35. Alpha.35 itself gave no way to construct a structured argument in place or bind one, no member of a number or a string but `sequence`, and failed every running request once any module was registered, which loading Forma's modules on demand would do. Lexica's language alpha.36 closes each, so what remains is DOMQL's adoption of it ([L1 to L6](#language), set out in [what Lexica does](#what-lexica-does)).
8. **Some timing is unpromised.** When an `immediate` watch's handlers run against the mutation delivery that caused them, whether a `frame` watch's handlers run in the animation frame, and whether a module's event delivery projects synchronously, are each unstated ([T1 to T3](#timing)).

## How the scripts map onto DOMQL

Each piece of browser work in a script becomes one of DOMQL's request kinds, or stays where it is:

| Today | Becomes | DOMQL operation |
| --- | --- | --- |
| A read C# asks for once | A query | `evaluate`, `evaluateAsync` |
| A report C# keeps current: a size, a boundary, a tier, whether focus is within | A watch | `watch`, its snapshots or live state |
| An event C# hears | A subscription | `subscribe`, to `on` or to a module's event source |
| A change C# asks for once: focus, scroll, copy, print, a command | A once execution | `executeAsync` |
| A behavior attached for a lifetime: routes, a gesture, a placement, an editor | A continuous execution | `run`, `update`, `dispose` |
| An algorithm no request can express: input ownership, gesture mechanics, placement, virtualization, rich-text editing | A Forma module's implementation | declared through `domql.createModule`, registered with `domql.registerModule` |
| Transport, sessions, tokens, generations, one delivery in flight, reconnection | Forma's host layer around DOMQL | none; DOMQL needs no notion of owners |
| A pure transform (`Sanitizer.js`), Blazor's own lifecycle (`.lib.module.js`), storage | Stays as it is | none |

The Forma modules this produces, each beside the capability it exposes, as Forma's design sets out:

| Module | Its executions and sources | From |
| --- | --- | --- |
| `InputRouterDomqlModule` | routes (continuous), policy (once), matched actions, dismissals and decisions (sources), scope state (members) | `InputRouter.js`, `InputInspector.js` |
| Scrolling | `scrollStep` (once), `scrollInteraction`, `pan`, wheel turns (continuous) | `ScrollContainer.mjs`, `ScrollInteraction.mjs`, `ScrollButtons.mjs`, `PanGesture.js`, `Wheel.js` |
| Focus | `focusInteraction` (continuous), `readerWithin()` (a maintained Boolean function with its own observation type) | `focus/*.mjs` |
| Placement | `anchoredPlacement`, `placement` with its `placementChanges`, `followSelection` (continuous) | `AnchoredPopover.js`, `Frame.js`, `SelectionFollower.js` |
| Presentation | `modalPresentation`, `topLayerPresentation` with `raise` (continuous) | `Dialog.js`, `Window.js` |
| Drag and drop | the drag gesture, `dropZone` with `drops`, file drop, `reorder` with `moves` (continuous) | `DragGesture.js`, `DropZone.js`, `FileDropZone.js`, `ReorderInteraction.js` |
| Files | `filePreview` (continuous), unless built in | `FilePreview.js` |
| `VirtualizerDomqlModule` | `start.virtualizer { offset, viewport, itemSize }`, `reveal` and `scrollTo` | `Virtualize.js` |
| Assets, print, embeds | `loadModule`, `loadScript`, `loadStyle`, `adoptSprite`, `printDocument`, `activate` (once) | `Asset.js`, `Print.js`, `Embedding.js` |
| Culture | kept document attributes, Blazor's navigation as a source | `DocumentCultureSynchronizer.js` |
| `FormaRichText` (composer) | `edit` (continuous), `execute`, `setHtml`, `beginLinkDialog` (once), `changes`, `selections`, `activations` (sources), `blockAlignment` | `RichTextEditor.js` and its modules, `BlockAlignment.js` |
| Data view (product) | `selection` with `selects`, `seeks`, `activates`; `focusItem`, `cancelSeek`; `reserveHeight`; `columnFit` | `SelectionInteraction.js`, `HeightReservation.js`, `ColumnFit.js` |

## Decisions the replacement rests on

These are choices the gaps below assume. Each is a proposal for DOMQL's maintainer to settle.

| | Decision | Why |
| --- | --- | --- |
| D1 | Generic web-platform changes are DOMQL's built-in executions; Forma's algorithms are Forma's modules. A change is built in where it is one platform call with a platform result (focus, scroll, show a popover, capture a pointer, write the clipboard), and Forma's where it carries a policy (stop-aware stepping, placement, gestures, roving focus). | DOMQL stays independent of its consumers, and every consumer needs the generic half. |
| D2 | `on` stays passive and never cancels. Cancelling an event, consuming a key, claiming a click and capturing a pointer stay synchronous inside a module's own listeners: the input router's and the modules that compose it. `on` gains the capture phase for observing alone. | Forma's rule that every input a component acts on is a route on the input router: a cancelling `on` would let a component act on input past the router. A cancelling subscription would also have to decide synchronously, before any caller sees the event. |
| D3 | A behavior's occurrences are event sources of the module that declares the behavior, bound to the running continuous execution of the same owner on the same receiver, and outliving its replacement and release. | Forma's design states this contract ("a subscription outlives the behavior's replacement and release"), and every reporting behavior needs it. |
| D4 | Forma keeps its host layer: the transport to C#, sessions by runtime key, tokens and generations, one delivery in flight with only the latest waiting, suspension and resumption, and reconnection. DOMQL gives it what it can't build itself ([A2](#api-and-host), [A3](#api-and-host)). | They are Forma's interop concerns; DOMQL's `signal` already gives per-owner disposal. |
| D5 | The scripts that only Forma's other modules call synchronously stay plain classes that work without DOMQL (`FocusSurface`, `TabOrder`, `Controls`, `Direction`, `Scrolling`, `FrameScheduler`, the drag gesture), composed inside Forma's modules. | Their callers decide inside native handlers, where no query can run. |

## The gaps

Each gap has an identifier, the addition it calls for, whether it is built into DOMQL or a Forma module needs it of DOMQL's contract, the scripts that need it, and the first step of Forma's plan it blocks: step 5 is the request model, 6 input routing, 7 anchored presentation, 8 virtualization, 9 gestures, files and reordering, 10 dialogs, frames and windows, 11 the remaining actions, and "Composer" and "Data view" the products' own scripts. ✅ marks a gap whose addition is done where it belongs; a gap Lexica closed still waits for DOMQL to adopt the version that closes it ([L1](#language)).

### Vocabulary

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| V1 | `Element.scroll` → `Scroll? { inline { offset, extent, viewport }, block { offset, extent, viewport } }`, the offset logical from the start under RTL, `extent` the scroll extent and `viewport` the client extent; partly observable through `scroll` events on the receiver, `resize { box: client }` and its children's boxes and child list ([O1](#observation)). `domql.window.scroll` gives the window's | `ScrollContainer`, `ScrollStateObserver`, `Scroll.js`, `PanGesture`, `DragGesture`, `Virtualize`, `Scrolling.js`, `InputRouter` (wheel claims), `ReadingPlace` | 5 |
| V2 | `Element.scrollContainer({ axis })` → `Element?`, the nearest scroll container, crossing shadow roots to the host | `DragGesture`, `Virtualize`, `Scrolling.js` | 8 |
| V3 | `Document.activeElement` → `Element?`, the focused element, through shadow roots; observable through `focusin` and `focusout` on the document | `FocusRecovery`, `FocusStateObserver`, `RovingFocus`, `TabOrder`, `Window`, `AnchoredPopover`, `SelectionInteraction` | 7 |
| V4 | `Element.direction` → `String`, `"ltr"` or `"rtl"`, observing `dir` along its ancestors and the document element; `it.style["direction"]` misses an ancestor's change, as `DocumentCultureSynchronizer` makes to `<html dir>` | `Direction.js`, `AnchoredPopover`, `ScrollContainer`, `RovingFocus`, `Scroll.js` | 7 |
| V5 | Boolean functions `displayed()`, `checkVisibility({ visibilityProperty: true })`, and `focusable()`, decided natively | `FocusSurface`, `Dialog`, `Window`, `Controls.js` | 10 |
| V6 | `Element.value` → `String?`, observable through `input` and `change`, partly observable; Boolean function `indeterminate()` | `TextEntry.js`, `CheckBox.js` | 11 |
| V7 | `Element.text` (`textContent`) and `Element.html` (`innerHTML`), observable through subtree mutation with `characterData`; or the Boolean `Element.hasText` | `HeightReservation`, `RichTextEditor.js`, `MediaMarkup`, `BlockAlignment` | Data view |
| V8 | The document selection, `domql.document.selection` → `DocumentSelection? { type, collapsed, rangeCount, anchorElement, focusElement, range }`, and a `Range` type, `{ rect, collapsed, text, startElement, endElement, commonAncestor, intersects(node), all(selector), offsetsIn(element) }`; observable through `selectionchange`. `Element.selection` extended to an editing host. The Selection API fires `selectionchange` for script-made selections too, so these may be observable rather than partly observable, which `hasSelection`'s contract denies today; a browser test settles it | `RichTextEditor.js`, `Canvas`, `SelectionInspector`, `Links`, `TableEditor`, `SelectionFollower` | Composer |
| V9 | `Node.contains(other)` → `Boolean`; element siblings or `Element.index`; optionally `Element.follows(other)` | `Canvas`, `SelectionInspector`, `SelectionFollower`, `Virtualize`, `ReorderInteraction`, `FocusSurface` | 8 |
| V10 | `Element.localName`, `Element.classList` → `List<String>`, `Element.inlineStyle[property]` (the declared value) | `SelectionInspector`, `InputInspector` | Composer |
| V11 | `Element.clientRect` → `Rectangle?`, the padding box | `Virtualize` | 8 |
| V12 | `Element.sizeLimits { minWidth, minHeight, maxWidth, maxHeight }`, or a conversion of a `px` length: `style["min-width"]` answers `"120px"`, which the String-to-Number conversion refuses | `Frame` | 10 |
| V13 | A `tolerance` declared on `rect`, `size`, `clientSize` and `scroll`, so a watch compares within it; Lexica takes one on a member of a number or a structured result already | `Virtualize`, `Frame`, `AnchoredPopover` | 8 |
| V14 | `Element.files` → `List<File>?`, `File { name, size, type, lastModified }` | `FilePreview`, `FileDropZone` | 9 |
| V15 | Boolean function `autofilled()`, with the autofill observation ([O4](#observation)) | `AutofillTracker` | 11 |
| V16 | `media.playback { paused, muted, ended, currentTime, duration, volume }`, observed through media events | `Playback.js` | 11 |
| V17 | `Window.location { href }`, `Document.documentElement`, and a platform fact that replaces the deprecated `navigator.platform` | `DocumentCultureSynchronizer`, `InputRouter` | 6 |
| V18 | Function `hasPointerCapture(pointerId)` → `Boolean` | `Pointer.js` | 9 |

### Events

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| E1 | Listening in the capture phase, `on(type, { capture = true })`, for observing alone ([D2](#decisions-the-replacement-rests-on)); the `event` observation type takes `capture` already | `Window`, `AnchoredPopover`, `SelectionFollower`, `SelectionInteraction`, `ReadingPlace`, `InputInspector`, observers of routed input | 6 |
| E2 | Pointer: `pointermove`, `pointercancel`, `lostpointercapture`, `dblclick`, `touchmove`; members `pointerId`, `detail`, `timeStamp` and the modifiers `ctrlKey`, `metaKey`, `altKey`, `shiftKey` | `DragGesture`, `PanGesture`, `ReorderInteraction`, `Frame`, `Window`, `SelectionInteraction`, `RichTextEditor.js`, `InputRouter` | 9 |
| E3 | `wheel` as `WheelEvent { target, deltaX, deltaY, deltaMode, timeStamp }` with the modifiers | `Wheel.js`, `InputInspector` | 6 |
| E4 | Drag: `dragenter`, `dragover`, `dragleave`, `dragstart`, `dragend`; `DragEvent.types` → `List<String>` | `DropZone`, `FileDropZone` | 9 |
| E5 | `focusin` and `focusout` as `FocusEvent { target, relatedTarget: Element? }`; today's `focus` and `blur` don't bubble and carry no related target | `FocusRecovery`, `FocusStateObserver`, `Window`, `SelectionFollower`, `SelectionInteraction` | 7 |
| E6 | Editing: `beforeinput` and `input` as `InputEvent { inputType, data, isComposing }`, `paste`, `copy`, `cut` as `ClipboardEvent { types }`, `compositionstart`, `compositionend`, and `selectionchange` on the document | `RichTextEditor.js`, `SelectionFollower` | Composer |
| E7 | Presentation: `close`, `cancel`, `beforetoggle`, `toggle` as `ToggleEvent { oldState, newState }` | `Dialog`, `Window`, `AnchoredPopover`, `InputRouter` | 10 |
| E8 | `animationstart`, `animationend`, `animationcancel` (`animationName`); `load`, `error`; media `play`, `pause`, `volumechange`, `ended` | `AutofillTracker`, `FilePreview`, `Playback.js` | 11 |
| E9 | Keyboard members `repeat` and `isComposing`; `defaultPrevented` and `composedPath` on every event | `SelectionInteraction`, `ReadingPlace`, `InputRouter`, `InputInspector` | 6 |

### Observation

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| O1 | An observation target `children`, each child element of the receiver, so `Element.scroll` follows its content's sizes | `ScrollStateObserver` | 5 |
| O2 | `all` and `first` observed on the receiver's subtree, rather than attributes and children across its whole root; today a watch reading them evaluates again on any attribute change in the document, a behavior's own `tabindex` writes included | `SelectionInteraction`, `HeightReservation` | Data view |
| O3 | Opt-in continuous measurement each frame while a module holds it, so a subscriber follows content moving under a still pointer | `DragGesture` (edge scrolling) | 9 |
| O4 | An `autofill` observation, through the stylesheet animation adapter; media events for `playback`; `dir` along the ancestry for `direction` | `AutofillTracker`, `Playback.js`, `Direction.js` | 11 |
| O5 | None to add: page-wide module state is a member of the module's extension of `Document`, observing its receiver, which Lexica and DOMQL support today. Lexica's rule that an observation type observes only the targets its own module declares stays, and the document owns the state, as [C8](#the-extension-contract)'s state per document has it | `InputRouter` (its active stack) | None |
| O6 | A watch naming an invalidation beyond its members', or a member reading a subtree's text ([V7](#vocabulary)), so `rectRelativeTo` follows a block that a sibling's edit moved | `BlockAlignment` | Composer |

### Executions

DOMQL's first executions. Three names below would collide with DOMQL's Boolean functions `focus()`, `clipboard()` and `share()`, so this document writes them `takeFocus`, `writeClipboard` and `requestShare`.

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| X1 | `element.takeFocus({ preventScroll })` → `Boolean`, whether focus landed | `TabOrder`, `RovingFocus`, `FocusRecovery`, `AnchoredPopover`, `Dialog`, `Window`, `SelectionInteraction`, `RichTextEditor.js`, `SelectionFollower`, and `FormaDataTree`'s `FocusAsync` | 5 |
| X2 | `scrollTo({ inline, block, behavior })` and `scrollBy(…)` on an element and on the window, logical under RTL, answering whether they moved; `scrollIntoView({ block, inline, behavior })` | `ScrollContainer`, `Scroll.js`, `Virtualize`, `DragGesture`, `BlockFormatter`, `ReadingPlace` | 5 |
| X3 | `showPopover()`, `hidePopover()`, `showModal()`, `close({ returnValue })` | `AnchoredPopover`, `Window`, `Dialog` | 7 |
| X4 | `capturePointer({ pointerId })`, `releasePointer({ pointerId })` → `Boolean` | `Pointer.js`, `DragGesture` | 9 |
| X5 | Engine-owned writes, each declaring its ownership and released on dispose: a class, an inline style property, `hidden`, `tabIndex`, and, continuous, attributes kept against a host's patch, `element.attributes({ lang, dir })` | `AutofillTracker`, `DropZone`, `ReorderInteraction`, `Frame`, `HeightReservation`, `BlockAlignment`, `SelectionFollower`, `DocumentCultureSynchronizer` | 7 |
| X6 | Form controls: `writeIndeterminate(Boolean)`, `writeValue(String)` → `String?`, the value replaced, dispatching no event, and `writeSelection({ start, end })` → `Boolean` | `CheckBox.js`, `TextEntry.js` | 11 |
| X7 | Browser facilities: `domql.window.writeClipboard(text)` → `"written"`, `"refused"` or `"failed"`; `readClipboardText()` and `readClipboard({ types })`; `download({ name, content, type })`; `print()`; `requestShare({ title, url, text })` → `"shared"`, `"canceled"`, `"refused"` or `"invalid"`; `media.play()` → `"playing"`, `"blocked"`, `"aborted"` or `"unsupported"`, `pause()`, `writeMuted(Boolean)`; at low priority, `domql.document.writeCookie({ … })` | `Clipboard.js`, `Download.js`, `Print.js`, `Share.js`, `Playback.js`, `CultureCookie.js`, `RichTextEditor.js` (paste) | 11 |
| X8 | `dispatch({ type, bubbles, detail })`, answering whether it was cancelled | `FileDropZone`, Forma's design's events capability | 9 |
| X9 | Selection placement: `domql.document.selection.select({ node })`, `selectContents({ node, collapse })`, `collapse({ node, offset })` | `Canvas`, `SelectionMemory`, `BlockFormatter`, `ListFormatter`, `ContentWriter` (generic forms; the editor keeps its own `Range` work) | Composer |
| X10 | Image sources from selected files, their object URLs owned and revoked by the execution: built in, or Forma's files module | `FilePreview` | 9 |

### The extension contract

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| C1 | **Occurrences a behavior offers:** an event source bound to the owner's running continuous execution on the receiver, which delivers in the order the behavior calls `deliver`, never coalesced, and outlives the execution's replacement and release ([D3](#decisions-the-replacement-rests-on)) | `InputRouter` (actions, dismissals), `InputInspector`, `DropZone`, `ReorderInteraction`, `Frame`, `Wheel`, `DragGesture`, `SelectionInteraction`, `RichTextEditor.js` | 5 |
| C2 | **State a behavior offers:** a module member backed by the running instance, which a watch reads and follows | `ColumnFit`, `Virtualize`, the router's scope state | 8 |
| C3 | **Commands to a running behavior:** one instance per receiver that the module's once executions and sources find, so `fit`, `measure`, `raise`, `open`, `close`, `focusItem`, `cancelSeek` and an editor's `execute` reach it; today a module would keep its own `WeakMap`, which Forma's behavior contract forbids | `AnchoredPopover`, `Frame`, `Window`, `FilePreview`, `SelectionInteraction`, `RichTextEditor.js` | 7 |
| C4 | **The owner's identity** in what an implementation receives, so "this owner's behavior on this element" needs no token passed by hand in every query | every behavior | 5 |
| C5 | **DOMQL's observations for module code:** `env.observe({ type, target, … }, notify)` → `{ stop() }` over the shared resize, mutation and intersection pools, and the frame schedule, `env.frame(…)`, under which a module may write before it reads | `ResizeObserverPool`, `IntersectionObserverPool`, `DomElement`, `ScrollButtons`, `RovingFocus`, `FocusRecovery`, `BlockAlignment`, `SelectionFollower` | 5 |
| C6 | **Queries from module code:** an implementation reaching its DOMQL instance to evaluate or watch a query, `env.domql` | `ScrollButtons`, `RovingFocus`, `SelectionInteraction` | 6 |
| C7 | **A transient measurement:** apply a class, read, restore, and have DOMQL drain its own mutation observers of the records it caused, `env.measureUnder(element, { class }, read)`; without it every watch reading `matches`, `closest`, `first` or `all` evaluates again after each measurement | `ColumnFit` | Data view |
| C8 | **Module state per document,** keyed by `env.document`, with an optional hook at a document's first use and last release | `InputRouter` (document listeners), `Asset.js` (its load cache) | 6 |
| C9 | **Captured members with history per holder,** for a value that depends on what the member measured before: DOMQL states that an implementation's `env` is one per evaluator, as `#createEvaluator` makes it, so a module keys its history by `env` and receiver; Lexica keeps such history the holder's ([what Lexica does](#what-lexica-does)) | `Virtualize` (`itemSize`), `Wheel` (gesture grouping), `Window` (focus memory) | 8 |
| C10 | **Synchronous handling stated:** an execution's own listeners run inside the native dispatch, and a module's `deliver` captures and projects synchronously, as the implementation does today | `DragGesture`, `DropZone`, `FileDropZone`, `Frame`, `PanGesture`, `InputRouter` | 6 |
| C11 | **A null argument that doesn't skip:** DOMQL's executions say a null argument skips the call, while Lexica skips only where the parameter propagates null, so DOMQL narrows its wording to Lexica's rule, which serves `Frame`'s `bounds = null`, the viewport, as it stands | `Frame`, `AnchoredPopover`, `Window` | 7 |
| C12 | **Nested option objects holding an element,** `buttons = { container = root, … }`: an option declared a structured type, which an object expression written there constructs since Lexica's alpha.36 ([L4](#language)), its `container` a reference | `ScrollInteraction` | 5 |
| C13 | **A kept function argument,** a route's `when` predicate, if DOMQL-established routes are ever to take one; Lexica forbids a host call to keep a function today, so routes made through DOMQL are data, as C#'s routes are | `InputRouter`, `DragGesture`, `PanGesture` | None |

### API and host

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| A1 | **The C# half,** [part 4](features-status.md#part-4--the-c-half): typed queries mapped onto records, watches, once and continuous executions, subscriptions, with failures reported, never discarded as `Owner.js`'s `.catch(() => {})` does. Its acknowledgement, after the state is applied, differs from Forma's `NotifyAsync`, which settles after the handlers | every consumer | 5 |
| A2 | **Change sets against an acknowledged result,** `watch.changesSince(snapshot)` or composition of pending change sets, so one delivery in flight carries everything since the receiver's last acknowledged state while list items stay matched by their sources; a host can't compute it, since item identity lives in metadata a result never holds | `StateDelivery`, `DomWatcher.mjs` | 5 |
| A3 | **A refresh that delivers an equal result,** `refreshAsync({ rebaseline: true })`; today a refresh raises nothing when the result is unchanged, while a reconnection and a sentinel refreshed after a load each need it delivered | `DomWatcher.js`, `StateDelivery`, `IntersectionStateObserver`, `ScrollStateObserver`, `FocusStateObserver` | 5 |
| A4 | **Modules loaded on request,** a loader by module, or the imports a definition names (Lexica's alpha.35 imports, DOMQL's checkpoint 2), so a module is registered before the query that names it is resolved; `run` starts synchronously, so its implementation must be loaded first | `DomEngine.js`, `DomEngine.mjs`, `DomWatcher.mjs` | 5 |
| A5 | **Ordered occurrence delivery to C#,** bounded, never coalesced, failing explicitly on overflow, and updates to several handles kept in their invocation order, since activation order is the router's precedence | `InputRouter`, `DropZone`, `ReorderInteraction`, `Wheel`, `Frame`, `SelectionInteraction` | 6 |
| A6 | **An execution's lifetime anchored to its element,** `run({ anchor })`, disposing it once the element has left the document a frame later; a host can build it from a watch of `it.attached` | `DomElement`, `DomEngine.mjs` | None |
| A7 | **Reactions run in the browser:** a once execution DOMQL runs when a route or an event source delivers, with no round trip, so transient activation holds for the clipboard, sharing, playback and select-on-focus; and several executions in one crossing | `Clipboard.js`, `Share.js`, `Playback.js`, `TextEntry.js`, `RichTextEditor.js` (keyboard commands, paste), `Dialog` (open, then focus) | 11 |
| A8 | **Source elements for a local consumer:** a watch in the browser whose result items carry the elements they came from, so a JavaScript handler can write to them | `BlockAlignment` | Composer |
| A9 | **Delivery options:** a throttle on a subscription; a delayed schedule beside `frame` and `immediate`; reporting when a subset of fields changes while delivering all of them | `InputInspector`, `RichTextEditor.js` (all optional: a module can keep its own) | None |
| A10 | **Ownership of written styles and classes against Blazor's render,** an exclusive owner or an isolated layer per converted component, Forma's engine's to settle | `Frame`, `AnchoredPopover`, `AutofillTracker` | 7 |

### Language

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| L1 | **Lexica alpha.35, then alpha.37, in DOMQL:** `select`, `take`, `drop`, `takeWhile`, `dropWhile`, `distinct`, `orderBy`, `sequence`, `average`, imports and extension access, which DOMQL's checkpoints 2 and 3 bring | `Virtualize`, `ReorderInteraction`, `SelectionInteraction`, `ScrollContainer`, `ReadingPlace`, `InputInspector` | 5 |
| L2 | ✅ **Numbers:** `round`, `floor`, `ceiling`, `truncate`, `abs`, `clamp`, two-argument `min` and `max`, Lexica's own since alpha.36; a computed number compares exactly, so sub-pixel jitter reports changes a rounded value never would | `ScrollContainer`, `ScrollStateObserver`, `Virtualize`, `Frame` | 5 |
| L3 | ✅ **Strings:** case, trimming, searching, replacement, splitting and slicing, Lexica's own since alpha.36; text is joined by interpolation, `$"{a}{b}"` | `SelectionInspector`, `Markup`, `InlineFormatter`, `HeightReservation` (avoidable with `hasText`) | Composer |
| L4 | ✅ **Structured values written in place or bound:** an object expression written where a structured type is declared constructs it, and a host declares a data binding's type, since alpha.36. Before it, a structure could reach a member only as another member's answer, as reproduced | `InputRouter` (routes, policy), `ScrollInteraction` ([C12](#the-extension-contract)), and every C# record a request passes as an argument ([A1](#api-and-host)) | 5 |
| L5 | ✅ **A list's position of an item,** `indexOf` and `indexWhere`, since alpha.36 | `ReorderInteraction`, `Virtualize` | 9 |
| L6 | ✅ **A registration that leaves current the resolutions it can't change,** since alpha.36. Before it, registering any module failed the next evaluation of every live watch and every projection of every running subscription, as reproduced; DOMQL keeps a resolution while `resolution.isCurrent` holds | Every request running when a module loads ([A4](#api-and-host)) | 5 |

### Timing

| | Addition | Needed by | Blocks |
| --- | --- | --- | --- |
| T1 | An `immediate` watch's handlers run within the microtask checkpoint of the mutation delivery that invalidated it, before any task or frame | `FocusRecovery` (in a query form), `HeightReservation` | Data view |
| T2 | A `frame` watch's handlers run inside the animation frame, before paint, so a handler can write what it measured; a frame phase for executions' writes | `FrameScheduler.js`, `AnchoredPopover` (if split into a watch and a write) | 7 |
| T3 | Executions carried out in one task keep their order, so opening then focusing happens in one task | `Dialog`, `AnchoredPopover` | 10 |

## What Lexica does

Lexica is the language beneath every request, so some gaps were its to close: those only the language can close, and those every host would otherwise close alike. Each was checked against Lexica at `3973e6e`, language `1.0.0-alpha.35`, and decided in Lexica's [host additions proposal](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/host-additions.md), which holds each contract and the reasoning for it; Lexica's language `1.0.0-alpha.36` specifies and implements all five, and `1.0.0-alpha.37`, at `17a6642`, carries a review's corrections to them and leaves the verbs `is`, `has` and `supports` to modules, so DOMQL drops the places it documents them. What follows is what each gives the replacement, and what DOMQL does with it. Each is an intended addition: it accepts what was refused or names what was unnamed, and its interactions with selection and with a module's own extensions were checked and tested rather than assumed away.

| | What Lexica gives | What it settles for the replacement | DOMQL's part |
| --- | --- | --- | --- |
| L6 | ✅ [Current resolutions](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/host-additions.md#current-resolutions): a registration makes a resolution stale only where the resolution may recognize values as it is evaluated, through a declaration that gives it a value of `Any` in any branch, reached or not, or a host call whose supplied type holds a nullable reference, and the module registered declares a `typeOf`; `resolution.isCurrent` answers from what the resolution resolved, never from the paths an evaluation has taken | A watch's evaluator and a subscription's prepared call survive Forma's modules registering on demand (A4): their locals and their results' origins are kept, and a subscription is never prepared again. Forma's modules declare no `typeOf`, so none of them makes a request stale | Keep a resolution while it is current rather than while the revision stands, and add an integration test that a watch and a subscription running when a module registers keep evaluating and delivering, as Lexica's fourth host checkpoint records |
| L4 | ✅ [Structured values](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/host-additions.md#structured-values): an object expression written as a value argument or an option of a structured type, an object field of one so written, an item of a list so written, or a branch or a side of a conditional or a coalescing there, constructs the structure, held to its data shape, a nullable property left out null; a local, a function's answer, a body and a deferred call keep the type they have where they are written, so `board.place({ x = 1 })` constructs where `let point = { x = 1 }` then `board.place(point)` is refused. A host declares a binding's type, `{ routes: 'List<Input.Route>' }`, and its data is captured as a supplied value is: its data shape alone, a missing nullable property null, a reference of another type null where a nullable reference type is declared, and mistyped data refused | The router's routes and policy, nested options holding an element (C12), and every record the C# half passes as an argument (A1) are structured values. Unions are declined: one shape of nullable fields and a `family`, which the router validates, holds a route of any family | Declare those parameters as structured types; have the C# half declare the type of each binding it passes a record through |
| L2 | ✅ [Numbers](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/host-additions.md#numbers): `round`, a half away from zero, `floor`, `ceiling`, `truncate`, `abs`, `min`, `max` and `clamp`, none answering `-0` | Measurements a watch compares are rounded in the query, as Forma's scripts round them today. Tolerance stays a member's: DOMQL declares it on its measuring members (V13), and no tolerance is written by a script or carried through arithmetic | Declare `tolerance` on `rect`, `size`, `clientSize` and `scroll` |
| L3 | ✅ [Strings](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/host-additions.md#strings): `length`, `trim`, `lowercase`, `uppercase`, `startsWith`, `endsWith`, `contains`, `indexOf`, `replace`, `split` and the slice `[range]`, in UTF-16 code units; the empty text found at every position but refused to replace or split at, and a slice never parting a surrogate pair | The composer's and the inspector's small text work reads in queries; regular expressions and locales stay out, and `"120px"` stays CSS's, so a length's pixels are DOMQL's (V12) | Nothing: DOMQL extends no `String`, so Lexica's own members, which win over an extension's, shadow nothing of it |
| L5 | ✅ [Positions](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/host-additions.md#positions): `indexOf` and `indexWhere`, each a `Number?` null where nothing is found | Reorder moves and the virtualizer's first visible item are found in a query | Nothing |

### Kept out of Lexica

| Gap | Decision | Why |
| --- | --- | --- |
| C1 to C4: a behavior's occurrences, state and commands, and its owner | DOMQL's | Lexica knows who invokes a function and nothing of its lifecycle, so that no host's operations become the language's, as its [design](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-design.md#host-calls) sets out. A behavior and its occurrences are two host calls, each a script, and a behavior's state is a maintained member whose observation the running instance feeds |
| A7: reactions in the browser, and several executions in one crossing | DOMQL's | Two scripts: the occurrence is bound to the reaction's script, which is prepared synchronously, as Lexica's synchronous evaluation allows. A host call stays one per script, at its end, so each one's preparation and result type stay its own |
| C13: a kept function argument | Stays deferred in Lexica | It waits for a host call that must call back into its script, with that context and lifetime designed. The routes C# gives are data, and the JavaScript callers keep their functions |
| C9: captured history | DOMQL states that `env` is one per evaluator | Lexica keeps captured history "while its host holds the evaluation", so the holder owns it, and a module keys it by `env` and receiver; L6 keeps the evaluator across registrations |
| C10: synchronous handling | Nothing to add | Lexica evaluates and projects synchronously; DOMQL states its own half |
| C11: a null argument that doesn't skip | Nothing to add | Lexica skips only where a null argument's parameter propagates it; DOMQL narrows its executions' wording to that rule |
| O5: module state per document | Nothing to add | A member of an extension of `Document`, observing its receiver |
| A2, A8: change sets, and source elements for a local consumer | Nothing to add | A result's metadata stays valid after later evaluations, and its sources hold the references: that is what a diff against an acknowledged result, and a JavaScript consumer given its elements, read. Matching is the host's, by sources or by a key it projects, so `identifyBy` stays deferred |
| A4: modules loaded on request | Nothing beyond L6 | `lexica.parse` gives a definition's imports without a registry, so DOMQL loads and registers what a query imports before resolving it |
| The executions' names | DOMQL's | Lexica refuses two members of one name on one type, and who invokes a member can't tell them apart, since `element.focus()` reads as a query and as an execution alike; DOMQL chooses the names, which `takeFocus` stands in for here |

Lexica landed the five additions before its tooling, which is built once on the final syntax and visibility rules. DOMQL adopts them at Lexica's fourth checkpoint, after the second and third (L1); L6 and L4 come first, since module loading and the C# half's records wait on them.

## The scripts, one by one

Each row says what the script becomes, what DOMQL serves today, and the gaps it waits for. Line counts are the script's.

### The DOM watcher and engine foundation

`src/Forma.Framework/Forma.Framework.Browser.Interop/wwwroot/scripts/`, the bridge between C# and the browser that Forma's plan steps 0 to 4 built. Most of it becomes Forma's host layer around DOMQL ([D4](#decisions-the-replacement-rests-on)), and its observation machinery is what a DOMQL watch does already.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `DomWatcher.js` | 47 | Host layer over `watch`, `refreshAsync` and `signal` | The baseline from the first ready event; per-owner release through `signal` | A3 |
| `DomEngine.js` | 62 | Host layer over `executeAsync` and `run`; `scroll.step` becomes the scrolling module's `scrollStep` | `executeAsync`, `run`, `update`, `dispose`; a null receiver skips preparation, standing in for today's element check | A4 |
| `DomWatcher.mjs` | 99 | Host layer: tokens, generations, the receiver | Evaluation, dependencies, `frame` and `immediate`, comparison, failed `"change"` events | A2, A4 |
| `DomEngine.mjs` | 67 | Host layer | `run` | A6 (optional) |
| `DomSession.mjs`, `DomSessionRegistry.mjs` | 61, 54 | Host layer: sessions by runtime key, released engine, then watcher | One `AbortController` per part gives the ordered release | None |
| `DomElement.mjs`, `DomElements.mjs` | 80, 29 | Not needed for watches, which follow a detached element back; for executions, a watch of `it.attached` | `attached` and the `attachment` observation, which cover what resize-based detection misses | A6 (optional) |
| `RegistrationTable.mjs` | 76 | Host layer; its resources become DOMQL handles | `dispose()` on every handle | None |
| `StateDelivery.mjs` | 113 | Host layer over a watch's events: one delivery in flight, latest only, suspension | Immutable, serializable snapshots | A2, A3 |
| `ResizeObserverPool.mjs` | 68 | DOMQL's `resize` observation | Shared by target and `box` | C5, for module code |
| `IntersectionObserverPool.mjs` | 99 | `intersects({ root, margin })` | Maintained, shared by root and margin; Forma uses threshold 0 alone | None |

C# reads a whole state record from each observation today (`ScrollState`, `IntersectionState`, `FocusState`); no change set crosses yet, so A2 matters once Forma moves to live state.

### Scrolling

`scripts/scrolling/`, already converted onto the foundation by Forma's plan step 1.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `ScrollContainer.mjs` | 167 | Its measurement, a watch over `scroll`; its stop-aware step, the scrolling module's once execution `viewport.scrollStep({ direction, axis, stops, frozen })` → `Boolean`; its moves, built-in scrolls | `clientSize`, `all`, `rectRelativeTo`, `max`, `min`, `style["direction"]` | V1, X2, L2, L1 |
| `ScrollStateObserver.mjs` | 109 | A watch: `viewport { canScrollBack = it.scroll?.inline.offset > 1, …, frozenExtent = …, viewportExtent = if showsEdge then it.clientSize?.width else null end }`, accepting partial observation. A detached track gives null where today it keeps its last state | Frame coalescing, change-only reporting | V1, O1, L2, A3 |
| `IntersectionStateObserver.mjs` | 75 | A watch: `sentinel { isIntersecting = it.intersects({ root = panel, margin = 200 }) }`, its first state the browser's own report, as Forma's plan step 5 asks | Everything | A3: the explorer and the emoji picker refresh after each load, and an unchanged `true` must reach them |
| `ScrollInteraction.mjs` | 54 | The scrolling module's continuous `viewport.scrollInteraction({ axis, stops, frozen, wheel, … })`, its wheel route on the input router | `run`, `update`, `dispose` | C12, C5 |
| `ScrollButtons.mjs` | 81 | Part of `scrollInteraction`: the buttons found among the children and routed as clicks | `children`, `matches`, `where` | C6, else its own `MutationObserver` |

### Focus

`scripts/focus/`, converted onto the foundation by Forma's plan step 4. Its decisions are made inside key handlers, so all of it stays a Forma module, `surface.focusInteraction({ wrap, order, roving, heir })`, with `readerWithin()` for the date-time picker.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `FocusInteraction.mjs` | 45 | The focus module's continuous `focusInteraction` | `run`, `update`, `List<String>` arguments | None of its own |
| `FocusSurface.mjs` | 82 | A plain class the modules call synchronously ([D5](#decisions-the-replacement-rests-on)); as a query, `surface.all(selector).where(it.displayed())` | `all`, `matches` | V5, V9 (`follows`, if `neighbor` becomes a query) |
| `TabOrder.mjs` | 66 | Part of `focusInteraction`: Tab and Shift+Tab routed, decided before the default | n/a | X1 |
| `RovingFocus.mjs` | 126 | Part of `focusInteraction`: one Tab stop, owned `tabindex` writes restored on dispose | n/a | X1, X5, V3, C5, C6 |
| `FocusRecovery.mjs` | 57 | Part of `focusInteraction`, at mutation delivery | n/a | X1, C5; in a query form, V3, E5 and T1 |
| `FocusStateObserver.mjs` | 109 | A watch of `field { isWithin = it.readerWithin() }`, a maintained Boolean function the focus module declares with its own observation type; Forma's "within" differs from `:focus-within` for a press inside that drops focus to the page, focus leaving the window and focus removed with its element | A module observation type's `notify`, `stop` and `sample`, and maintained members in a watch's first snapshot | A3 |

### Behaviors

`scripts/behaviors/`, the scripts Forma's plan steps 7 and 9 convert. Most are a Forma module's continuous execution that reports occurrences, so C1 is the gap they share.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `AnchoredPopover.js` | 145 | The placement module's continuous `popover.anchoredPlacement({ anchor, align })`, measuring and writing in one frame, with Tab held inside | `popoverOpen()`, `anchor.rect`, `popover.size`, `domql.window.size` (which leaves out scrollbars, where `innerWidth` includes them), `focusWithin()` | X3, X1, V4, C3 (`open`, `close`), C11 (a null trigger), T2, T3 |
| `AutofillTracker.js` | 36 | A watch of `field { autofilled = it.autofilled() }` and a built-in class write, or CSS matching `:autofill` | `matches(":autofill")` reads it, but nothing observes the change | V15, O4, E8, X5 |
| `DragGesture.js` | 326 | Reusable gesture mechanics, a plain class that the pan, reorder, frame and selection-follower modules compose ([D5](#decisions-the-replacement-rests-on)); its synchronous cancelling, capture and click claim stay inside | `pointerdown`, `pointerup` alone, passive and bubbling | E2, X4, V1, V2, X2, O3, C10; C1 for its stages as occurrences |
| `DropZone.js` | 126 | The drag-and-drop module's continuous `zone.dropZone({ action, accepts, dropEffect, targets, activeClass })`, offering `zone.drops() { key = it.target.closest("[data-drop-target]")?.["data-drop-key"] }` | `drop` alone, which never fires while `on` is passive and nothing cancels `dragover` | C1, E4, X5, C10, A5 |
| `FileDropZone.js` | 47 | A composition over the drop module that assigns the files and dispatches one `change`, inside the drop | `first("input[type=file]")`, `disabled()` | X8, C10 |
| `FilePreview.js` | 86 | A continuous `container.filePreview({ names })`, its `update` the next show, owning the object URLs | `all("[data-forma-preview]")` | V14, X10, E8 |
| `PanGesture.js` | 68 | The scrolling module's continuous `pan`, over the gesture | `class["…"]`, which can't be handed to an execution to evaluate at press time | V1, C13 (or the condition kept in JavaScript) |
| `ReorderInteraction.js` | 220 | The drag-and-drop module's continuous `list.reorder({ dragFromItem })`, offering `list.reorderMoves() { from, to, after }`; C# changes the order | `all`, `rect` | C1, X5, L1, L5 |
| `Scroll.js` | 13 | A built-in scroll: `container.scrollTo({ inline = (container.scroll.inline.extent - container.scroll.inline.viewport) / 2, … })`; only `toCenter` is left in it | `clientSize`, `style["direction"]` | V1, X2 |
| `Wheel.js` | 84 | The router's matched actions with a wheel-turn source, `scope.wheelTurns({ action, modifier }) { direction }`, grouping notches and trackpad gestures | none | E3, C1, C9, A5 |

### Components

`scripts/components/`, the browser sides of `FormaDialog`, `FormaFrame`, `FormaWindow` and `FormaVirtualize`, which Forma's plan steps 8 and 10 convert.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `Dialog.js` | 77 | Built-in `showModal` and `close`, and the presentation module's continuous `dialog.modalPresentation({ closeOnScrimClick, focusWithin })` for the local scrim close and the focus after opening | `dialog["open"]`, `first`, `all` | X3, X1, V5, E7, T3 |
| `Frame.js` | 342 | The placement module's continuous `frame.placement({ box, dragRegion, handle, step, bounds })`, offering `frame.placementChanges() { rect }`, with `measure` and `fit` as commands; its arrow keys become routes | `rect`, `domql.window.size`, `class[…]`, `first(…)` | V12, C1, C3, C11, X5, A10, E2, A5 |
| `Window.js` | 160 | Built-in popover executions and the presentation module's continuous `window.topLayerPresentation({ presented, scrim })` with `raise`: the scrim shown first, a raise deferred while pressed, focus memory | `popoverOpen()`, `focusWithin()` | X3, X1, V3, V5, E1, E2, E5, C3, C9 |
| `Virtualize.js` | 208 | `VirtualizerDomqlModule`: `start.virtualizer { offset, viewport, itemSize }`, a member with measurement history, with `reveal` and `scrollTo`; the C# render, scroll and reveal loop stays C# | `rect`, `clientSize`, `domql.window.size`, `attached`, the `frame` schedule | V1, V2, V11, V13, V9, L1, L2, C2, C9, X2, A5 |

### Operations

`scripts/operations/`, stateless calls C# makes. Most become built-in executions; Forma's plan step 11 converts them as consumers use them.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `Asset.js` | 134 | The assets module's once executions `loadModule`, `loadScript`, `loadStyle`, `adoptSprite` → `Boolean`, with its per-document cache; a relative URL must be resolved against `document.baseURI` once the loader moves | `first("#forma-sprite-definitions")` | C8 |
| `CheckBox.js` | 8 | `checkbox.writeIndeterminate(Boolean)`, or a continuous form that reapplies it to a replaced element | none | X6, V6 |
| `Clipboard.js` | 11 | `domql.window.writeClipboard(text)` → its outcome | `clipboard()`, the availability test | X7, A7 |
| `Download.js` | 22 | `domql.window.download({ name, content, type })`, meaning issued | none | X7 |
| `Embedding.js` | 20 | An integration module's `activate(scriptUrl)` → `Boolean`, outside the generic contracts | none | None beyond the module |
| `Playback.js` | 13 | `media.writeMuted(true)`, then `media.play()` → its outcome, which today's `.catch(() => {})` loses | none | X7, V16, E8, A7 |
| `Pointer.js` | 15 | `capturePointer`, `releasePointer`; `FormaSplitter`'s resize should become a gesture that captures in its press handler | none | X4, V18, E2 |
| `Print.js` | 58 | `domql.window.print()` for the page; the print module's `printDocument({ html, title, className })` for markup, which should give focus back | none | X7 |
| `Share.js` | 17 | `domql.window.requestShare({ title, url })` → its outcome | `share()`, the availability test | X7, A7 |
| `TextEntry.js` | 24 | A watch of `it.selection { start, end }`, which retires `FormaPlainTextEditor`'s click, keyup and debounce plumbing; `writeValue("")` for read-and-clear, `writeSelection` | `selection` | V6, X6, A7 |

### The JavaScript interop foundation

`Forma.Framework.JavaScript.Interop/wwwroot/scripts/`, what other scripts share, with no C# wrapper.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `Controls.js` | 12 | Kept, for synchronous use in handlers ([D5](#decisions-the-replacement-rests-on)); in queries, `focusable()` and `textEditable()` | `matches`, `textEditable()` | V5 |
| `Direction.js` | 10 | Kept for handlers; in queries, `direction` | `style["direction"]`, partly observable | V4, O4 |
| `FrameScheduler.js` | 34 | The `frame` schedule for reads; kept for modules' writes until DOMQL promises its frame | `frame` | T2, C5 |
| `Owner.js` | 15 | Retired by the host layer's transport | n/a | A1, A5 |
| `Sanitizer.js` | 130 | Unchanged: a pure transform of markup | n/a | None |
| `Scrolling.js` | 36 | Kept for the router's and the gesture's synchronous tests; in queries, `scroll` and `scrollContainer` | `style["overflow-y"]` | V1, V2 |

### Culture

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `Forma.Framework.Culture.Browser.Interop/wwwroot/formaui-net.Framework.Culture.Browser.Interop.lib.module.js` | 13 | Unchanged: a Blazor initializer | n/a | None |
| `Forma.Framework.Culture.Browser.Interop/wwwroot/scripts/DocumentCultureSynchronizer.js` | 181 | A culture module: `<html lang>` and `dir` kept against Blazor's patch by a continuous attribute execution, Blazor's enhanced navigation as an event source over the Blazor object, and its hold protocol, which needs a reply from C# | `domql.document.children.first { lang = it["lang"], dir = it["dir"] }` | X5, V17; a browser-to-C# request with a reply, Forma's bridge |
| `Forma.Framework.Culture.Router.Interop/wwwroot/scripts/CultureCookie.js` | 12 | `domql.document.writeCookie({ … })`, or the culture module | none | X7 |

### Input

`Forma.Framework.Input.Interop/wwwroot/scripts/`. The input router is the page's single authority over who owns an input, and stays its own algorithm, independently usable, exposed through `InputRouterDomqlModule` (Forma's plan step 6).

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `InputRouter.js` | 1,172 | `InputRouterDomqlModule`: each registration a continuous `scope.inputRoutes({ routes, modal, escape, closeRequest, pressAway, boundary, parent, within, active })`, the host's policy a once `domql.document.configureInput(policy)`, matched actions and dismissals sources, `scope.inputActions() { action, input { … } }` and `scope.inputDismissals() { action, reason }`, and a scope's activity, foremost state and layer members, its active stack a member of its extension of `Document` | Continuous executions with synchronous `run` and `update`, and event sources whose `deliver` projects synchronously | C1, C4, C8, C10, L4, A5, E1, E2, E3, E9, V17 |
| `InputInspector.js` | 95 | A subscription to the router module's decisions, `domql.document.inputDecisions({ types }) { action, precedence, source, reason, … }` | none | C1, V10, L1, L4, A9 |

What of the router is plain DOMQL: its state, whether a scope is active or foremost, its layer, the active stack and each scope's effective routes, and its occurrences, matched actions, dismissals and the decisions the inspector reads. What stays its algorithm: family matching, specificity and ties, the native-control claim table, the structural walk over `composedPath()`, ambient precedence, press-away with its pass-through, preemptive routes, click claiming, close requests, the host's binding overrides, validation, its document listeners shared across registrations with their per-scope non-passive capture listeners, and `data-forma-layer` stamping. Its JavaScript callers (the gesture, drop zone, reorder, wheel, focus and scrolling modules, the composer and the data view) keep calling its own API, whose `when` and `handle` are functions no DOMQL route can carry ([C13](#the-extension-contract)).

### The composer

`src/Forma.Blazor.Composer/wwwroot/scripts/`, product scripts. The rich-text editor's algorithms stay the composer's, contributed as the `FormaRichText` module the design names, with a view `canvas.richText` beside `aria`. It needs the document selection and a `Range` type more than anything else ([V8](#vocabulary)), and the behavior contract (C1, C3) for its commands, changes and selections.

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `RichTextEditor.js` | 525 | The module's continuous `canvas.richText.edit({ debounceDelay = 400 })`; once executions `execute({ command, value }) { html, selection }`, `setHtml({ html })` and `beginLinkDialog({ selector }) { text, href, count }`; sources `changes() { html }`, `selections() { start, end, collapsed, blockType, styles }` and `activations() { kind, … }`; a property `html` | `closest`, `class[…]`, `attribute[…]`, `style[…]` | C1, C3, V7, V8, E2 (`dblclick`), E6, X1, X7 (clipboard reads), A7 |
| `RichTextEditor/Canvas.mjs` | 226 | The module's implementation; its selection reads become vocabulary | `all`, `closest` | V8, V9, X9 |
| `RichTextEditor/SelectionMemory.mjs` | 67 | The module's implementation: a live `Range` held across focus changes, which no result can hold | n/a | C3 |
| `RichTextEditor/SelectionInspector.mjs` | 146 | The module's `selectionState`, read fresh, so a command's result and the occurrence agree; its colour and quoting normalizations stay JavaScript | `closest`, `class[…]`, `attribute["dir"]`, `style["text-align"]`, `style["direction"]` | V8, V9, V10, L3 |
| `RichTextEditor/InlineFormatter.mjs` | 359 | The module's implementation | n/a | L3 (the marker sweep stays JavaScript) |
| `RichTextEditor/BlockFormatter.mjs` | 146 | The module's implementation; its reveal, a built-in `scrollIntoView` | `children` | X2 |
| `RichTextEditor/ListFormatter.mjs` | 279 | The module's implementation | n/a | None |
| `RichTextEditor/ContentWriter.mjs` | 128 | The module's implementation, inserting at the remembered range | n/a | C3 |
| `RichTextEditor/Links.mjs` | 89 | The module's implementation; the anchors a selection touches, `selection.range.all("a[href]")` | n/a | V8 |
| `RichTextEditor/TableEditor.mjs` | 168 | The module's implementation | n/a | V8 (`anchorElement?.closest("table")`) |
| `RichTextEditor/MediaMarkup.mjs` | 111 | Its builders stay; reading a double-clicked element back can become the activation's projection | `attribute[…]`, `first`, `closest` | V7, E2 |
| `RichTextEditor/Markup.mjs`, `RichTextEditor/Fragments.mjs` | 35, 10 | Pure helpers, unchanged | n/a | None |
| `BlockAlignment.js` | 83 | A continuous `gutter.blockAlignment({ source, rowSelector, blockAttribute })` re-run from DOMQL's observations, or a browser watch whose items carry their rows: `gutter.all(rows) { block = it["data-block"], top = source.children[it["data-block"] to Number]?.rectRelativeTo(gutter)?.top }` | `all`, `children`, the list indexer, `rectRelativeTo` | O6, X5, A8, C5 |
| `SelectionFollower.js` | 272 | The placement module's continuous `bar.placement.followSelection({ owner, side, gap, nudge, handle, activeClass })`, anchored to a `Range`, composing the gesture, `TabOrder` and a router registration | `hasSelection` (which tests the range's common ancestor where the script tests its anchor), `attached`, `domql.window.size` | V8, V9, E5, E1, X1, X5, C5, T2 |

### The data view, the explorer and the Showcase

| Script | Lines | Becomes | DOMQL today | Gaps |
| --- | --- | --- | --- | --- |
| `Forma.Blazor.DataView/…/ColumnFit.js` | 80 | The data grid module's once execution `table.dataGrid.measureColumns({ attribute, measuringClass }) { available, columns { key, width } }` today; its behavior form, one crossing per change, needs a running measurement a watch reads | `(table.parent as Element).clientSize?.width`, `all("[data-column]") { key = it["data-column"] }` | C2, C7 |
| `Forma.Blazor.DataView/…/GridColumns.js` | 60 | A watch of `ruler.grid?.columns.count`, accepting partial observation; reading `cards.style["--forma-data-cards-size"]` in the same query would also follow a card-size change, which the script and `grid` both miss today (unverified) | Everything | None |
| `Forma.Blazor.DataView/…/HeightReservation.js` | 60 | A continuous `region.dataView.reserveHeight({ pageSize })` with an internal `immediate` watch, which re-reserves before paint where today a short page paints first | `first`, `all`, `rect`, `where`, `max`, `count` | V7 (the blank padding rows), X5, O2, T1 |
| `Forma.Blazor.DataView/…/SelectionInteraction.js` | 643 | The data view module's continuous `region.dataView.selection({ itemSelector, itemKeyAttribute, controlSelector, selects, moves, positionAttribute, seeks })`, offering `selects`, `seeks` and `activates`, with once executions `focusItem` and `cancelSeek` that reach it; it keys rows by `data-row-key`, not the design's `data-key`, and overlaps `RovingFocus` and `FocusRecovery` | `["data-item"] as Number`, `all`, `rect` | C1, C3, C4, C6, V3, E1, E2, E5, E9, O2, X1, X5, L1, A5 |
| `Forma.Blazor.Explorer/…/Breakpoint.js` | 57 | A watch of `rows.style["--forma-explorer-header-layout"]`, accepting partial observation | Everything | None |
| `Forma.Blazor.Showcase/…/ReadingPlace.js` | 144 | Demo code: the Showcase isn't packed. Converted, a capture-phase click subscription, the window's scroll and the built-in scrolls, with its storage kept in JavaScript | `clientSize` | E1, E9, V1, X2, L1; `Element.url { pathname }` alone, at low priority |

## The order of the work

The gaps block Forma's steps in this order, which suggests DOMQL's:

1. **Before Forma's step 5, the request model.** The C# half (A1), its delivery (A2, A3) and module loading (A4); occurrences a behavior offers and the owner's identity (C1, C4), since step 5's input-routing consumer needs them; DOMQL's observations for module code (C5); `scroll` with its `children` target and rounding (V1, O1, L2); and the first executions, `takeFocus` and the scrolls (X1, X2). Lexica alpha.35 (L1) arrives with DOMQL's checkpoints 2 and 3, which precede the C# half in DOMQL's own plan, and alpha.37 with the fourth, whose current resolutions and structured values (L6, L4) module loading and the C# half's records need.
2. **Input routing, step 6.** Module state per document (C8), synchronous handling stated (C10), data arguments with optional fields (L4), ordered delivery (A5), capture-phase observing (E1) and the event members the router reports (E2, E3, E9).
3. **Anchored presentation, step 7.** The top-layer executions (X3), commands to a running behavior (C3), the focused element and direction (V3, V4), focus events (E5), engine-owned writes and their ownership (X5, A10), nullable arguments (C11) and the frame promise (T2).
4. **Virtualization, step 8.** State a behavior offers and history per holder (C2, C9), the scroll container, the padding box and tolerance (V2, V11, V13), and siblings (V9).
5. **Gestures, files and reordering, step 9.** Pointer and drag events (E2, E4), pointer capture (X4), files (V14, X10), dispatch (X8), continuous measurement (O3) and an index (L5).
6. **Dialogs, frames and windows, step 10.** Presentation events (E7), `displayed()` and `focusable()` (V5), size limits (V12) and ordered executions (T3).
7. **The remaining actions, step 11.** The browser facilities and form controls (X6, X7), their reactions in the browser (A7), value, playback and autofill (V6, V15, V16, O4, E8).
8. **The products.** The composer's document selection and editing events (V7, V8, V9, V10, E6, X9, O6, A8, L3); the data view's transient measurement and subtree-scoped `all` (C7, O2, T1).

## Findings in Forma along the way

Reading the scripts turned these up. None was reproduced, and each is Forma's to confirm and settle:

- **Swallowed rejections.** `Owner.js`'s `tell`, `InputInspector.js`, `Playback.js`'s `mute`, `Asset.js`'s `attempt` and the rich-text editor's `#tell`, `pasteText` and `pasteWord` discard rejections with `.catch(() => {})`, against Forma's own foundation rule.
- **Results dropped.** `Share.cs` calls `TryInvokeVoidAsync`, so the share's outcome is lost; `CultureCookie.cs` documents that the browser wrote the cookie, which the script can't observe.
- **The input router.** A released scope keeps a stale `data-forma-layer`; `typing` bindings are missing from `BindingFields`, so their specificity and identity are wrong; it reads the deprecated `navigator.platform`.
- **Bypassed routes.** `DragGesture` without an `action` (as `ReorderInteraction`, `Frame` and `SelectionFollower` use it), `Frame`'s own `keydown` and `Dialog`'s scrim `click` act on input outside the input router.
- **`Controls.Interactive`** misses `contenteditable=""` and `plaintext-only`, which the router's key claims count as editable.
- **The rich-text editor.** A native paste isn't intercepted, and C# sanitizes what it commits without writing it back, so the pasted markup stays unsanitized in the canvas until the next `setHtml`; a native undo from a menu isn't cancelled and doesn't match the C# history; `exec` of a paste command answers the content before the paste; keyboard commands make two crossings and race typing; `GetSelectionTextAsync` and `SelectionFollower.UpdateAsync` have no callers.
- **Printing markup** leaves focus on `body` once the frame is removed, and `Print.js` doesn't sanitize, so the boundary lies with its caller.
- **`FormaSplitter`** captures the pointer after a round trip rather than in the press handler, so a quick press and release can come before the capture.
- **`GridColumns.js`** probably misses a change of the cards' size that resizes nothing.
- **`Scroll.js`** now holds only `toCenter`; the rest of its capability moved to `scrolling/`.
