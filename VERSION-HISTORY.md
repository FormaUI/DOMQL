# Version history

Each version of DOMQL, newest first, with the features it added and what it changed. A version names DOMQL's contract, its [specification](spec/README.md): the DOM's vocabulary, the module that declares it, and DOMQL as the host that carries queries out. The language is Nexo's, called Lexica before `1.0.0-alpha.278`, so each entry also names the language version and definition format it describes.

- Each version is dated by the day the specification first described it.
- A change stands in the first version whose implementation follows it. A version the specification describes ahead of the implementation says so, and says which of its changes the implementation has already.
- Until the beta, a version may break what the one before it allowed, and each entry says what it breaks.

<a id="v1-0-0-alpha-292"></a>

## `1.0.0-alpha.292`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL's module declares its first executions: focusing an element and scrolling, each one browser call answering what it did.

**Executions**

- [Built-in executions](spec/vocabulary.md#built-in-executions): DOMQL's module declares executions of its own, beside those an extension module declares, as [executions](spec/executions.md) set out, each carried out by `executeAsync`.
- [`takeFocus({ preventScroll })`](spec/vocabulary.md#execution-element-takefocus) focuses an element and answers whether focus landed on it, as [D34](docs/decisions.md#d34) records.
- [`scrollTo({ inline, block, behavior })` and `scrollBy(…)`](spec/vocabulary.md#execution-scrollto-scrollby), of an element and of the window, scroll along the axes of the box's writing mode, from its scroll origin under RTL too, and answer whether it moved; [`scrollIntoView({ block, inline, behavior })`](spec/vocabulary.md#execution-element-scrollintoview) answers whether the element is in view. Each answers once the scroll has ended, as [D35](docs/decisions.md#d35) records.

<a id="v1-0-0-alpha-291"></a>

## `1.0.0-alpha.291`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL delivers a key's repeat, composition and modifiers, and every event's time, cancellation and path.

**Events**

- [`KeyboardEvent`](spec/events.md#event-types) adds `repeat`, `isComposing`, the modifiers `ctrlKey`, `metaKey`, `altKey` and `shiftKey`, and `altGraphKey`, whether AltGr was held, which DOMQL reads through `getModifierState("AltGraph")`, as [D33](docs/decisions.md#d33) records.
- Every event type holds `timeStamp`, `defaultPrevented` and `composedPath`, the elements the event passes through from its target outwards, shadow roots, the document and the window left out. A module's own event type declares those it reads.

**Breaking:** a module's host call that supplies a value of one of DOMQL's event types, as an execution answering a `Domql.DomEvent`, supplies `timeStamp`, `defaultPrevented` and `composedPath` as well.

<a id="v1-0-0-alpha-290"></a>

## `1.0.0-alpha.290`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL delivers the events of focus, editing, the clipboard, composition, presentation, animation, loading and media.

**Events**

- [Event types](spec/events.md#event-types): `focusin` and `focusout`, beside `focus` and `blur`, are each a `FocusEvent { target, relatedTarget }`, the element focus leaves or moves to, as [D30](docs/decisions.md#d30) records; `focus` and `blur` were a `DomEvent`.
- `beforeinput` and `input` are an `InputEvent { target, inputType, data, isComposing }`, its kind `""` for an input event that names none, as a select fires; `paste`, `copy` and `cut` a `ClipboardEvent { target, types }`; `compositionstart` and `compositionend` a `CompositionEvent { target, data }`; and `selectionchange` a `DomEvent`, as [D31](docs/decisions.md#d31) records. `input` was a `DomEvent`.
- `beforetoggle` and `toggle` are a `ToggleEvent { target, oldState, newState }`; `animationstart`, `animationend` and `animationcancel` an `AnimationEvent { target, animationName }`; and `close`, `cancel`, `load`, `error`, `play`, `pause`, `volumechange` and `ended` a `DomEvent`, as [D32](docs/decisions.md#d32) records.

<a id="v1-0-0-alpha-289"></a>

## `1.0.0-alpha.289`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL delivers the events of a pointer, a touch, the wheel and a drag, with the pointer, the count, the time and the keys held.

**Events**

- [Event types](spec/events.md#event-types): `dblclick`, `pointermove`, `pointercancel` and `lostpointercapture` are each a `PointerEvent`, which adds `pointerId`, `detail`, `timeStamp` and the modifiers `ctrlKey`, `metaKey`, `altKey` and `shiftKey`; its `pointerId` and `pointerType` are null where the event carries no pointer, as [D28](docs/decisions.md#d28) records.
- `touchstart` and `touchmove` are a `TouchEvent { target, touches, timeStamp }`, each touch a `Touch { identifier, clientX, clientY }`; `wheel` a `WheelEvent { target, deltaX, deltaY, deltaMode, timeStamp }`; and `dragstart`, `dragenter`, `dragover`, `dragleave` and `dragend` beside `drop` a `DragEvent`, which adds `types`, `timeStamp` and the modifiers, as [D29](docs/decisions.md#d29) records.
- `on` reads `pointerId`, `pointerType`, `touches` and `types` for every event it delivers, where no property of the event answers them as data.

**Breaking:** a click the keyboard caused answers a null `pointerType`, where it answered `""`.

<a id="v1-0-0-alpha-288"></a>

## `1.0.0-alpha.288`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL listens to an event in the capture phase, as it travels to its target, for observing alone.

**Events**

- [`on(type, options?)`](spec/events.md#event-sources) takes `{ capture = true }`, a [`Listening`](spec/vocabulary.md#vocabulary-types), and listens as an event is captured on its way to its target, before any listener nearer the target runs, so it observes an event a listener there stops; without it, `on` listens at the target and as the event bubbles, as before, as [D27](docs/decisions.md#d27) records. Either way it listens passively.

<a id="v1-0-0-alpha-287"></a>

## `1.0.0-alpha.287`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL moves to Nexo's language `1.0.0-beta.15`, which settles what Nexo's status left open. What a query notices of it:

- **Membership compares by key equality alone.** `contains`, `indexOf`, `distinct` and `distinctBy` take numbers, strings, Booleans, references and null, so a list of elements works as before, and one of objects, lists or values of `Any` is refused (NEXO3083), where it was compared by identity.
- **A result path is checked wherever it is given,** so `select` refuses a malformed path as it did, and steps into an object's own fields and a list's items alone.
- **A module's declarations name Nexo's own types qualified,** as `Nexo.Number`, where the module declares a type of that name.
- **Conditions Nexo told apart by message have codes of their own,** NEXO5043 to NEXO5050 among them, as [Nexo's language history](https://github.com/FormaUI/Nexo/blob/2cb596ea0d1a1fc624552783b30139379124bb67/LANGUAGE-HISTORY.md) records.

**Breaking:** a query that tested membership in a list of objects, lists or values of `Any` is refused; test a key field instead, as `items.any(it.id == id)`.

<a id="v1-0-0-alpha-286"></a>

## `1.0.0-alpha.286`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL observes a selector for what it reads, so a watch of `all`, `first`, `matches` or `closest` evaluates again only where its selector could match differently.

**Vocabulary**

- [Observation types](spec/vocabulary.md#observations-types): `selector`, what a selector reads in a tree: its structure and the attributes the selector tests, focus where it tests focus and popovers where it tests `:popover-open`, as [D26](docs/decisions.md#d26) records.
- [`matches`](spec/vocabulary.md#function-element-matches), [`closest`](spec/vocabulary.md#function-element-closest), [`first` and `all`](spec/vocabulary.md#function-node-first-all), and a range's [`all`](spec/vocabulary.md#function-range-all), observe it. They observed every attribute of their tree, and focus and popovers whatever their selector; an attribute their selector never tests, as a `tabindex` written in the tree, no longer evaluates a watch again.

<a id="v1-0-0-alpha-285"></a>

## `1.0.0-alpha.285`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads the limits of a box's size in pixels and the files a file input holds.

**Vocabulary**

- [`sizeLimits`](spec/vocabulary.md#property-element-sizelimits) answers a `SizeLimits { minWidth, minHeight, maxWidth, maxHeight }` in CSS pixels, each null where the computed limit is no length, as [D24](docs/decisions.md#d24) records.
- [`files`](spec/vocabulary.md#property-element-files) answers a file input's `List<File>`, each `File { name, bytes, type, lastModified }`, as [D25](docs/decisions.md#d25) records.

<a id="v1-0-0-alpha-284"></a>

## `1.0.0-alpha.284`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads an element's siblings and place, whether a node holds another, a pointer's capture, the window's URL and its shortcut modifier.

**Vocabulary**

- [`previousSibling`, `nextSibling`](spec/vocabulary.md#property-element-siblings) and [`index`](spec/vocabulary.md#property-element-index) answer an element's neighbours and its place among its parent's child elements, and [`contains(other)`](spec/vocabulary.md#function-node-contains) whether a node holds another, as [D22](docs/decisions.md#d22) records.
- [`hasPointerCapture(pointerId)`](spec/vocabulary.md#function-element-haspointercapture) answers whether an element holds a pointer's capture, observed through the capture events.
- [`Domql.window.location`](spec/vocabulary.md#property-window-location) answers a `Location { href, pathname, search, hash }`, and [`shortcutModifier`](spec/vocabulary.md#property-window-shortcutmodifier) `"Meta"` or `"Control"`, as [D23](docs/decisions.md#d23) records.
- [Observation types](spec/vocabulary.md#observations-types): `navigation`, the window's URL, through the Navigation API where the browser offers it.

<a id="v1-0-0-alpha-283"></a>

## `1.0.0-alpha.283`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads the document's selection and the range it holds, and follows a selection the page's code makes.

**Vocabulary**

- [`Domql.document.selection`](spec/vocabulary.md#property-document-selection) answers a `DocumentSelection { type, collapsed, rangeCount, anchorElement, focusElement, range }`, read through an object expression since it holds references.
- [`Range`](spec/vocabulary.md#vocabulary-types) is a reference type with [`rect`](spec/vocabulary.md#property-range-rect), `collapsed`, `text`, `startElement`, `endElement`, `commonAncestor`, [`intersects(node)`](spec/vocabulary.md#function-range-intersects), [`all(selector)`](spec/vocabulary.md#function-range-all) and [`offsetsIn(element)`](spec/vocabulary.md#function-range-offsetsin), and DOMQL's `typeOf` recognizes a range a host binds.
- [`selection`](spec/vocabulary.md#property-element-selection) answers, for an element whose content is editable, the document's selection as offsets in its text, as [D21](docs/decisions.md#d21) records.
- `selection` and `hasSelection` are observable: the browser fires `selectionchange` for a selection the page's code sets, and they observe their subtree for the nodes that take a selection with them, as [D20](docs/decisions.md#d20) records. A watch of either needs no partial observation.

<a id="v1-0-0-alpha-282"></a>

## `1.0.0-alpha.282`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads what a user entered, an element's text, markup, name, classes and declared style, and a media element's playback.

**Vocabulary**

- [`value`](spec/vocabulary.md#property-element-value) answers the value of an `input`, a `textarea` or a `select`, and null for any other element.
- [`indeterminate()`](spec/vocabulary.md#boolean-function-element-indeterminate) and [`autofilled()`](spec/vocabulary.md#boolean-function-element-autofilled) test `:indeterminate` and `:autofill`; no observation follows autofill itself, as [D17](docs/decisions.md#d17) records.
- [`text`](spec/vocabulary.md#property-element-text) and [`html`](spec/vocabulary.md#property-element-html) answer a subtree's text and markup, as [D15](docs/decisions.md#d15) records.
- [`localName`](spec/vocabulary.md#property-element-localname), [`classes`](spec/vocabulary.md#property-element-classes) and [`inlineStyle[property]`](spec/vocabulary.md#function-element-inlinestyle) answer an element's name, its class list and its declared style, as [D16](docs/decisions.md#d16) records.
- [`playback`](spec/vocabulary.md#property-element-playback) answers a media element's playback, observed through its media events, as [D18](docs/decisions.md#d18) records.

**Watches**

- [Following a change a member misses](spec/watches.md#dependencies-following-what-a-member-misses): a body's local that reads a member observing the change, as `text` does an edit, makes a watch follow it, as [D19](docs/decisions.md#d19) records.

<a id="v1-0-0-alpha-281"></a>

## `1.0.0-alpha.281`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads the focused element, an element's direction, and whether an element is displayed and can take focus.

**Vocabulary**

- [`Domql.document.activeElement`](spec/vocabulary.md#property-document-activeelement) answers the focused element through open shadow roots, and null while no element has focus, as [D12](docs/decisions.md#d12) records.
- [`direction`](spec/vocabulary.md#property-element-direction) answers `"ltr"` or `"rtl"` as `dir` decides it along an element's ancestry, the document element's included, as [D13](docs/decisions.md#d13) records.
- [`displayed()`](spec/vocabulary.md#boolean-function-element-displayed) answers whether the browser renders a box for an element, and [`focusable()`](spec/vocabulary.md#boolean-function-element-focusable) whether it can take focus, as [D14](docs/decisions.md#d14) records.

<a id="v1-0-0-alpha-280"></a>

## `1.0.0-alpha.280`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads how far a box is scrolled, the box that scrolls it and its padding box, and compares its measurements of layout within a twentieth of a pixel.

**Vocabulary**

- [`scroll`](spec/vocabulary.md#property-element-scroll), of an element and [of the window](spec/vocabulary.md#property-window-scroll), answers how far it is scrolled along each axis of its writing mode: a `Scroll { inline, block }`, each a `ScrollAxis { offset, extent, viewport }`, its offset from the start of its content under RTL too.
- [`scrollContainer({ axis })`](spec/vocabulary.md#function-element-scrollcontainer) answers the nearest flat-tree ancestor the user can scroll, along an axis or either.
- [`clientRect`](spec/vocabulary.md#property-element-clientrect) answers an element's padding box without scrollbars, relative to the layout viewport.
- [Tolerance](spec/vocabulary.md#vocabulary-tolerance): every member that measures layout in CSS pixels declares a tolerance of 0.05, `rect`, `rectRelativeTo`, `size`, `clientSize` and `grid` among them, as [D8](docs/decisions.md#d8) records.
- [Observation targets](spec/vocabulary.md#observations-targets): `children`, each child element of the receiver, whose child list DOMQL observes beside them. A `resize` of a document observes its root element.
- `readonly`, `textEditable` and `selection` name the input type `number` as HTML does; the specification wrote `Number`.

**Breaking:** a watch no longer reports a measurement of layout that moved by 0.05 of a pixel or less since the one it last reported. A query that needs every change compares a number it computes, as `it.rect?.top + 0`, which carries no tolerance.

<a id="v1-0-0-alpha-279"></a>

## `1.0.0-alpha.279`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL moves to Nexo's language `1.0.0-beta.8`, which fixes what DOMQL's migration found in it.

**Queries**

- [Registering a module](spec/vocabulary.md#extension-modules-registering): a watch or a waiting evaluation made stale by a module recognizing values compares its next result within each value's tolerance, as Nexo keeps a definition's origins across its resolutions. It compared that result exactly.
- [Watches](spec/watches.md#how-a-member-changes): a member read through a value of `Any` is compared within the tolerance it declares, as Nexo now records it. Its value was compared exactly.
- A host call on a value of `Any`, where every declaration of its name is a host call, is refused as Nexo resolves it (NEXO3092). DOMQL refused it as a value to evaluate, and evaluating it failed.

**API**

- `NexoError`'s factories, `structure`, `validation`, `module` and `evaluation`, are declared, so a module written in TypeScript builds a failure of its own.

**Breaking:** a query ending in a host call on a value of `Any` fails to resolve with NEXO3092; every operation refused it before. Cast its receiver, or name the extension the call is declared in.

<a id="v1-0-0-alpha-278"></a>

## `1.0.0-alpha.278`

*November 1, 2026 · Nexo language `1.0.0-beta.3` · definition format 38*

DOMQL moves from Lexica's language `1.0.0-alpha.33` to Nexo's beta, the language Lexica became, and implements `1.0.0-alpha.277` with it.

**Queries**

- [Imports](spec/queries.md#making-a-query-imports): every query imports DOMQL's module, `Domql`, which DOMQL supplies, so its text writes no import of it. A query that uses another module imports it, `import Charts`, and a definition records its imports.
- [Module members](spec/vocabulary.md#module-members): DOMQL's module is named `Domql`, so a query reads `Domql.document` and `Domql.window`.
- [Extension modules](spec/vocabulary.md#extension-modules): a member another module adds to DOMQL's types stands in an extension, `{ name, kind: 'extension', target: 'Domql.Element', members }`, and a query reads it with `:`, as `panel:palette`. DOMQL's own members are read with `.`.
- [Resolution](spec/queries.md#queries-resolution): a resolution is kept while Nexo says it is current, so registering a module leaves running requests as they were, and a running request a module declaring a `typeOf` makes stale is [resolved or prepared again](spec/vocabulary.md#extension-modules-registering) where it next evaluates or projects.
- [Host calls on a receiver of unknown type](spec/vocabulary.md#extension-modules-host-calls): what such a call requests is what Nexo's candidates for it request, every declaration that takes it as it is written, and a call whose candidates disagree is refused where it stands.
- [Watches](spec/watches.md#how-a-member-changes): a watch is checked against every declaration a member of a value of `Any` could select, as Nexo's candidate declarations name them.

**Vocabulary**

- [Types](spec/vocabulary.md#vocabulary-types): DOMQL declares the DOM as reference types of its own, its members within them, as `1.0.0-alpha.277` specified. Text and comment nodes are refused as bindings.
- [Extension modules](spec/vocabulary.md#extension-modules): a declaration carries its implementation as `impl`; a host call stands within a type, an extension or among the module members; event types are mappings of the type selector `event`; conversions are operators.

**Results**

- [Identity](spec/results.md#results-change-sets): a list's items are matched by the references they descend from, so a projection of a projection's items, and a list filtered or ordered from one, keep their identity.
- [Dictionaries and pairs](spec/results.md#results-collections) are compared and changed as data, in the form a result exports them.

**Errors**

- [Errors](spec/errors.md): every failure is a `NexoError` with a `code`. DOMQL's own conditions take `DOMQL` codes, catalogued.

**Breaking:**

- The package exports `NexoError` where it exported `LexicaError`, and an error's module location names `declarationKey` where it named `field`.
- `domql.document` and `domql.window` are `Domql.document` and `Domql.window`, and a type is named `Domql.Element` where it was `domql.Element`.
- A member another module adds to DOMQL's types is declared in an extension and read with `:`, and its query imports its module. A flat member with a `target` is refused.
- A declaration's `implementation` is its `impl`; `selectableTypes` are `mappings`, `{ selector, key, type }`; a module's `conversions` are operators of its types; a structured type is `{ name, kind: 'structured', members }`.
- `query.resolve()` answers `getLocation(pointer)` where it answered `locate(pointer)`, and each used declaration's `qualifiedName` beside its declared `name`.
- A definition is of format 38: `{ version, imports, expression }`, with Nexo's node names.
- The verbs `is`, `has` and `supports` are gone; a query calls a Boolean function, `it.checked()` or `Domql.checked(it)`.
- A query's text follows Nexo's line structure, a body that uses `return` laid out a local to a line.

<a id="v1-0-0-alpha-277"></a>

## `1.0.0-alpha.277`

*October 22, 2026 · Lexica language `1.0.0-alpha.33` · definition format 33 · implemented in `1.0.0-alpha.278`*

**Vocabulary**

- [Nodes](spec/nodes-and-shadow-trees.md#nodes): DOMQL declares the DOM as reference types of its own, which it recognizes and checks: `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, and `Window`. Text and comment nodes are refused as bindings.
- [Types](spec/vocabulary.md#vocabulary-types): the views `Shadow` and `Aria` are types, and `Aria` casts back to its element. Every type is named in PascalCase, as `Element`, `Size` and `PointerEvent`.
- [Extension modules](spec/vocabulary.md#extension-modules): a module names DOMQL's types qualified by its module, as `domql.Aria` and `domql.Rectangle`.

**Queries**

- [Queries](spec/queries.md#a-query-at-a-glance): queries write Lexica's indexer forms. A named indexer is `panel.attribute["id"]`, a type's unnamed indexer `panel["data-key"]`, and a property read by a computed name `panel.[name]`.

**Implemented in two steps:** the PascalCase type names and the indexer forms here, and the declared node types with the [migration to Nexo](docs/features-status.md#migration-to-nexo), in `1.0.0-alpha.278`.

**Breaking:**

- Type names are written in PascalCase: `as element` is now `as Element`, and `to number` is now `to Number`.
- An unnamed indexer is `it["data-key"]` where it was `it:["data-key"]`, and a named one `it.attribute["id"]` where it was `it:attribute["id"]`.

<a id="v1-0-0-alpha-276"></a>

## `1.0.0-alpha.276`

*October 21, 2026 · Lexica language `1.0.0-alpha.32` · definition format 32*

**Vocabulary**

- [Module members](spec/vocabulary.md#module-members): queries reach the document and the window through DOMQL's module, as `domql.document` and `domql.window`.
- [Boolean functions](spec/vocabulary.md#boolean-functions): the DOM's tests are Boolean functions, called on their receivers, as `it.focusWithin()`, or passed by reference. Hyphenated names became camelCase.
- [Observation targets](spec/vocabulary.md#observations-targets): DOMQL's module declares its observation targets, `window`, `document`, `root` and `roots`, and resolves them itself. A registered module declaring targets of its own is refused.

**Host**

- [Host calls DOMQL carries out](spec/vocabulary.md#extension-modules-host-calls): event sources and executions are Lexica's host calls. `domql.createModule` keeps each one's request kind, execution mode and implementation, and `subscribe`, `executeAsync` and `run` prepare and carry them out.
- [Events](spec/events.md#event-sources): `on` is a host call whose fixed `type` selects through the type selector `event`, its keys the event types.
- [Executions](spec/executions.md#executions-running-continuously): `run` starts a continuous execution and answers a `DomqlExecutionHandle`.
- [The API](spec/api.md#api-entry-points-and-operations): `resolve` answers an execution's mode.

**Queries**

- [Queries](spec/queries.md#a-query-at-a-glance): queries write the implicit parameter `it`, Lexica's definition version 32.

**Breaking:**

- Queries write `it` where they wrote `context`, and `domql.document` and `domql.window` where they read `document` and `window` as roots.
- A test is a Boolean function called on its receiver, as `it.checked()` where `it.is("checked")` asked it, and `it.focusWithin()` where `it.has("focus-within")` did.
- `run` replaces `apply`.

<a id="v1-0-0-alpha-275"></a>

## `1.0.0-alpha.275`

*October 21, 2026 · Lexica language `1.0.0-alpha.31` · definition format 31*

The first numbered version: DOMQL as it stood on October 21, with everything [before it](#before-1-0-0-alpha-275).

- [The API](spec/api.md#api-entry-points-and-operations): `domql.info.versions` reports three versions, declared in one place: the runtime's release, the specification the implementation follows, and the language version its Lexica runtime follows.

<a id="before-1-0-0-alpha-275"></a>

## Before `1.0.0-alpha.275`

DOMQL began on October 9, 2026, as a query language and a JavaScript library for the DOM, at its specification `1.0.1`. Its language moved into [Lexica](https://github.com/FormaUI/Nexo/blob/0e98b3e118d1dc448a8040c4a6f236088b108a7b/spec/README.md) on October 19, and DOMQL became Lexica's host, declaring the DOM as Lexica's domain. Versions were first numbered on October 21. These are the features DOMQL had by then, each named as it is today.

**October 9: reading the DOM**

- [Queries](spec/queries.md#making-a-query): a query reads the DOM through a typed vocabulary, which modules declare as data, and is checked against it before anything is evaluated.
- [Evaluation](spec/evaluation.md#evaluating): evaluating once gives plain, detached data. An element with no layout box reads null for its geometry.
- [Results](spec/results.md#results-snapshots): a snapshot holds data alone, never a live DOM reference.
- The library is one bundled ES module with TypeScript declarations, served from the NuGet package at `_content/domql/domql.js`.

**October 10: keeping data current**

- [Observations](spec/vocabulary.md#observations): members declare how their values change, and the observations that follow them are shared between the requests that read them.
- [Waiting for maintained members](spec/evaluation.md#waiting-for-maintained-members): `evaluateAsync` waits for a member's first sample.
- [Watches](spec/watches.md#watching): a watch keeps a query's result current, evaluating again when what it read changes.
- [Change sets](spec/results.md#results-change-sets) and [live state](spec/results.md#live-state): a watch delivers each new result as a change set, or keeps one live object current in place.
- [Subscriptions](spec/events.md#subscribing): a query subscribes to events and projects each one into data.
- [Executions](spec/executions.md#executions): modules declare changes to the page, carried out once or kept running.
- [The API](spec/api.md#api-objects): every exported type is named with the prefix `Domql`.

**October 12 to 19: the query language**

- The language grew a conditional, locals, Boolean combinations, optional chains and fallbacks, casts, conversions and attempts, indexers, arithmetic, comparisons, escapes, interpolation, bodies, local functions and arrow functions, all of which are now Lexica's.
- [Shadow trees](spec/nodes-and-shadow-trees.md#shadow-trees): an element's shadow relationships are read explicitly, and a watch follows changes into the shadow trees it reads.
- [Queries](spec/queries.md#making-a-query-instances): every operation is carried out through a query object, and a request gives its canonical text.

**October 19 and 20: Lexica's host**

- The language and its runtime moved to Lexica, and DOMQL builds on Lexica's public API.
- [Extension modules](spec/vocabulary.md#extension-modules): DOMQL's module is an ordinary Lexica module, declared in Lexica's one declaration shape, and other modules extend it as they would any other.
- [Resolution](spec/queries.md#queries-resolution): `resolve` answers what a query uses, before anything is evaluated.
