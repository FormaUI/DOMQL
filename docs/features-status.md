# Features Status

## Current state

**DOMQL's vocabulary, queries, watches, events and executions are implemented on Lexica's language `1.0.0-alpha.33`, definition version 33. The specification describes DOMQL's `1.0.0-alpha.277`, which declares the DOM as DOMQL's own types; the implementation follows `1.0.0-alpha.276`, with `1.0.0-alpha.277`'s indexer forms and type names. Next is the [migration to Nexo](#migration-to-nexo), the language Lexica became.**

| Version | Implementation | Specification |
| --- | --- | --- |
| DOMQL specification | `1.0.0-alpha.276` | `1.0.0-alpha.277` |
| Lexica language | `1.0.0-alpha.33` | `1.0.0-alpha.33` |
| Definition format | 33 | 33 |

- **The language DOMQL runs on.** DOMQL builds against Lexica at the commit `lexica.commit` pins, `0e98b3e`. Lexica has since been renamed Nexo, its repository [FormaUI/Nexo](https://github.com/FormaUI/Nexo), which keeps that commit; DOMQL's documents link to [Lexica's documents at it](https://github.com/FormaUI/Nexo/blob/0e98b3e118d1dc448a8040c4a6f236088b108a7b/spec/README.md), and call the language Nexo once the migration's fourth checkpoint adopts it.
- **Packages.** The bundle and type declarations are built, with Lexica bundled inside `domql.js`. npm and NuGet packages are packed locally but unpublished.
- **The C# half** is designed and not started.

The [specification](../spec/README.md) defines the contract, and the [design](domql-design.md) explains the architecture. The [version history](../VERSION-HISTORY.md) records what each version changed. This file tracks DOMQL's implementation and its remaining work. "Implemented" means built and tested in the gate for the current implementation version; it does not imply that later specification changes are implemented.

<a id="remaining-work"></a>

## Remaining work

| Work | State |
| --- | --- |
| [Migration to Nexo](#migration-to-nexo) | Four checkpoints, the first next |
| [The C# half](#the-c-half) | After the migration |
| [Planned capabilities](#planned-capabilities) | Planned, in the order they are listed |
| [Release](#release) | After the migration, on Nexo's published packages |

- **Breaking changes are made directly,** without compatibility layers, migration notes or deprecations, until the beta.
- **Documents move with their change.** The READMEs, the library guide, the specification, the type declarations, the version history and this file change in the commit that changes what they describe.
- **Every change passes the gate,** browser tests included.

<a id="features"></a>

## Features

Each feature, the contract that states it, its state in the implementation, and the version the implementation has followed it since, whose changes [the version history](../VERSION-HISTORY.md) records.

### The DOM's vocabulary

| Feature | Contract | State | Since |
| --- | --- | --- | --- |
| Nodes and shadow trees, crossed explicitly | [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md) | Implemented in part: the node types are built into Lexica until the [first checkpoint](#checkpoint-1--declarations-and-the-runtime) declares them as DOMQL's own reference types | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Properties, functions and indexers of the DOM | [Built-in vocabulary](../spec/vocabulary.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Lexica's indexer forms and type names in PascalCase | [Types](../spec/vocabulary.md#vocabulary-types) | Implemented | [`alpha.277`](../VERSION-HISTORY.md#v1-0-0-alpha-277) |
| `domql.document` and `domql.window` | [Module members](../spec/vocabulary.md#module-members) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Boolean functions | [Boolean functions](../spec/vocabulary.md#boolean-functions) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Conversions, Lexica's, which DOMQL's queries use | [Built-in conversions](../spec/vocabulary.md#built-in-conversions) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Observation types, shared in sessions | [Observation types](../spec/vocabulary.md#observations-types) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Observation targets DOMQL declares and resolves | [Observation targets](../spec/vocabulary.md#observations-targets) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Event sources and event types | [Events](../spec/events.md#event-sources) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Extension modules: their types, members, observations, event sources and executions | [Extension modules](../spec/vocabulary.md#extension-modules) | Implemented in part: declared in Lexica's flat shape until the [first checkpoint](#checkpoint-1--declarations-and-the-runtime) | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| The DOM declared as DOMQL's own reference types, and the cast from `Aria` to `Element` | [Nodes](../spec/nodes-and-shadow-trees.md#nodes), [types](../spec/vocabulary.md#vocabulary-types) | Planned: the [first checkpoint](#checkpoint-1--declarations-and-the-runtime) | — |
| Diagnostic codes of DOMQL's own | [The API](../spec/api.md#api-errors) | Planned: the [first checkpoint](#checkpoint-1--declarations-and-the-runtime) | — |

### The host

| Feature | Contract | State | Since |
| --- | --- | --- | --- |
| Queries from text or a definition, `with`, `select` and `resolve` | [Queries](../spec/queries.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Evaluating once, and waiting for maintained members | [Evaluation](../spec/evaluation.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Watches, their dependencies and partial observation | [Watches](../spec/watches.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Snapshots, live state and change sets | [Results](../spec/results.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Subscriptions to event sources | [Events](../spec/events.md#subscribing) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Executions, once and continuous, carried out over Lexica's host calls | [Executions](../spec/executions.md), [host calls DOMQL carries out](../spec/vocabulary.md#extension-modules-host-calls) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Handles: their events, lifetimes and errors | [The API](../spec/api.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| `domql.info.versions` | [The API](../spec/api.md#api-entry-points-and-operations) | Implemented | [`alpha.275`](../VERSION-HISTORY.md#v1-0-0-alpha-275) |
| The JavaScript bundle and its TypeScript declarations | [README](../README.md#build-and-try-it) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| The C# half | [Design](domql-design.md#the-c-half) | Planned: [after the migration](#the-c-half) | — |

<a id="migration-to-nexo"></a>
<a id="implementation-plan"></a>

## Migration to Nexo

DOMQL moves from Lexica at `0e98b3e` to Nexo in four checkpoints, in order, each on a Nexo commit `lexica.commit` pins as it lands. Nexo keeps a checklist for each, of every change DOMQL adopts and where DOMQL uses what changed: [DOMQL's migration](https://github.com/FormaUI/Nexo/blob/main/docs/features-status.md#domqls-migration). This section holds what DOMQL decides at each.

- **Each checkpoint is whole.** It moves every aspect it touches to its final form, and passes DOMQL's gate, browser tests included, on the Nexo commit it pins.
- **Nexo's later versions.** Nexo's checklists reach its language `1.0.0-alpha.39`. Its later versions are adopted at the fourth checkpoint, as Nexo's [language history](https://github.com/FormaUI/Nexo/blob/main/LANGUAGE-HISTORY.md) sets out: an extension member is read with `:`, never `.`, and an extension access's names are read by the declarations they name, in definition format 38. DOMQL's own members stay `.`, and those other modules declare in extensions of DOMQL's types are read with `:`.

| Checkpoint | Work | State |
| --- | --- | --- |
| 1 | [Declarations and the runtime](#checkpoint-1--declarations-and-the-runtime) | Next |
| 2 | [Scripts and imports](#checkpoint-2--scripts-and-imports) | Planned |
| 3 | [Collections in results](#checkpoint-3--collections-in-results) | Planned |
| 4 | [Host additions and the rename](#checkpoint-4--host-additions-and-the-rename) | Planned |

<a id="checkpoint-1--declarations-and-the-runtime"></a>

### Checkpoint 1 — Declarations and the runtime

DOMQL's vocabulary and its use of the runtime move once.

- **Its vocabulary, rewritten once:**
  - Each type with its members, its structured types' stored properties among them, its indexers as the `indexer` kind, with a `name` for a named indexer and without one for a type's unnamed indexer, and `impl`.
  - `on` declared once in each of `Element`, `Document` and `Window`, the receivers it listens on, reusing one JavaScript declaration.
  - `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, `Window`, and the views `Shadow` and `Aria`, given by an element's `shadow` and `aria` alone. DOMQL's `typeOf` recognizes a bound node as its kind and the window as `Window`, each type's `isInstance` checks membership, and text and comment nodes are refused as bindings.
  - The cast from `Aria` to `Element`, without an `impl`, so `(panel.aria as Element).aria` reads the element's view again; an `Element` still can't be cast to either view.
  - The module named `Domql`, so its queries read `Domql.document`, `Domql.window` and `panel as Domql.Element`; the package, its file `domql.js` and the product keep their names.
- **Diagnostic codes.** DOMQL's own conditions take `DOMQL` codes, with a catalog in its specification, bounded to the conditions it reports today; an error of the language passing through DOMQL keeps its own code and takes no second, DOMQL one.
- **Its catalog of host calls** reading types' and extensions' members and `impl`, a JavaScript declaration reused across types mapping each declaration the runtime makes of it.
- **Binding through DOMQL's registry** when a query is made, keeping the bindings that query captured. Binding and repeated evaluation are measured with DOMQL's scale workloads before the runtime caches any membership answer.
- **Ownership and visibility.** Members other modules declare on DOMQL's types are extensions: competing extensions both register and are refused only where a query uses them ambiguously, and from the fourth checkpoint they are read with `:`, apart from DOMQL's own. DOMQL follows the language's visibility rules, and nothing of its own changes for them.
- **Deferred selection.** Admission and observation stay two mechanisms:

  | Mechanism | Purpose |
  | --- | --- |
  | The used declarations, and the candidate declarations of each deferred access | Decide, before a watch starts, whether the query satisfies the watch's observation policy |
  | `beforeInvoke` | Establish observations for the receivers and arguments evaluation actually reaches |

  A watch checks the combined declarations under the existing rules: an unobserved member is refused, a partly observable one requires `acceptPartialObservation`, and constant, observable and derived members follow their contracts. It starts no observation for a candidate, and its dependencies remain what each evaluation reads, refreshed on each one. Candidates are an overestimate, so a watch can be refused for a declaration its values never select; that refusal names the deferred access and the candidates at fault, and says to make the receiver's type known or to name its extension. Refusals stay findable before a watch starts. `resolve` reports the deferred accesses, and a host call on a receiver whose type is known only during evaluation is refused before anything is invoked.
- **Projection sources.** `SnapshotComparer` and `SnapshotPatcher` match a list's items by source identity only where both lists give a unique, non-null source that the runtime classifies as a reference for every item, and by position otherwise, checked against reordered and duplicate references, repeated equal data values and null inputs. DOMQL reads the classification the runtime reports, never inferring it from `typeof`, JavaScript identity, a DOM check or another recognition.
- **Tests:** every test module in the final shape and named in PascalCase, conversions declared as operators, and the registration's refusal of competing extensions replaced by ambiguity where a query uses them.
- **Documents:** the watches document's admission by candidate declarations; the specification's extension shape and `impl`; its heading for `is`, `has` and `supports` named apart from the language's `Any`; the results document and the design no longer saying sources come from elements; and the library guide's module examples and their fixtures.

**Completion:** DOMQL's vocabulary in the final shape, bound and typed by its registry, passes the gate, browser tests included.

Contracts: [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md), [Types](../spec/vocabulary.md#vocabulary-types), [Extension modules](../spec/vocabulary.md#extension-modules), [Results](../spec/results.md).

<a id="checkpoint-2--scripts-and-imports"></a>
<a id="checkpoint-2--script-text-and-imports"></a>

### Checkpoint 2 — Scripts and imports

DOMQL's queries move to Nexo's script text once.

- **Imports.** DOMQL supplies `Domql` as every query's import. An application configures further imports once, which apply to every query, and a query may write its own, an identical import counting once. The same effective imports apply to parsing, resolution and caching, and formatting writes a definition's imports but those a caller names as supplied by the destination. Registering a module adds nothing to an existing query's imports and makes no lookup of it ambiguous.
- **Definitions.** DOMQL's definitions, tests and type declarations record imports and the definition version the checkpoint's Nexo commit reads.
- **Versions:** the language row and the definition format follow that commit.
- **Documents:** the queries and API documents describe imports and the effective imports DOMQL supplies.

**Completion:** DOMQL's queries in Nexo's script text pass the gate, browser tests included.

Contracts: [Queries](../spec/queries.md), [the API](../spec/api.md).

<a id="checkpoint-3--collections-in-results"></a>

### Checkpoint 3 — Collections in results

DOMQL's handling of results moves once to Nexo's collections.

- **Comparing and patching:** `SnapshotComparer`, `SnapshotPatcher` and live state compare and apply dictionaries, in their exported form `{ entries: [{ key, value }, …] }` and in their order, and pairs, `{ key, value }`, every change set reproducing the next result from its baseline.
- **Addressing:** result paths and selections address the exported forms, a numeric dictionary key never taken for a list index, and say whether a selection follows a position or a key.
- **Matching:** items matched by the sources and the lineage the runtime reports, as the [first checkpoint](#checkpoint-1--declarations-and-the-runtime) matches by sources, DOMQL deciding the policy and the runtime promising no unique correspondence.
- **Documents:** the results document and the API describe dictionaries and pairs in results.

**Completion:** DOMQL's results holding lists and dictionaries pass the gate, browser tests included.

Contracts: [Results](../spec/results.md).

<a id="checkpoint-4--host-additions-and-the-rename"></a>

### Checkpoint 4 — Host additions and the rename

DOMQL adopts the language's additions for hosts, its later versions, and its name.

- **Resolutions kept while current.** A resolution is kept while the runtime says it is current, rather than while the registry's revision stands, and an integration test shows a watch and a subscription running when a module registers keep evaluating and delivering.
- **The rename.** The language is called Nexo throughout DOMQL's documents and messages; DOMQL imports `nexo` and `NexoError`, depends on `@formaui/nexo`, and builds from a checkout of [FormaUI/Nexo](https://github.com/FormaUI/Nexo) named `formaui-net.Nexo`, in its build and in CI. Its links into the language's specification move to Nexo's documents, `spec/language/` and `spec/runtime/`, at the commit it pins.
- **The verbs.** `is`, `has` and `supports` leave DOMQL's documents, which describe them as another way to call a Boolean function; its queries call none.
- **Nexo's later versions:** extension members read with `:`, an extension access's names read by their declarations, and definition format 38, in DOMQL's extension modules, examples, tests and type declarations.
- **Versions:** the language row and the definition format follow the commit it pins.

**Completion:** DOMQL on Nexo, named so, passes the gate, browser tests included.

Contracts: the [version history](../VERSION-HISTORY.md) entry the checkpoint adds, and Nexo's [language history](https://github.com/FormaUI/Nexo/blob/main/LANGUAGE-HISTORY.md).

<a id="the-c-half"></a>
<a id="part-4--the-c-half"></a>

## The C# half

The C# half follows the migration, so its API is built on the final query text, imports, definition version and result representations, never reworked after them.

- **Its API,** as [the design](domql-design.md#the-c-half) sets out: `Domql.Query` and `Domql.Query<T>` from text or a definition, binding its parameters; `Domql.TryQuery`, answering false with a diagnostic for a syntax or structure failure; and `query.Definition`. A `DomqlQuery<T>` maps a result onto `T` by its declared contract, and a `DomqlQuery` answers a `DomqlSnapshot`.
- **Results:** lists, dictionaries and pairs mapped onto `T` and read through a `DomqlSnapshot` by their exported forms.
- **Imports:** the effective imports the [second checkpoint](#checkpoint-2--scripts-and-imports) sets, `Domql` and those the application configures among them, applied as the JavaScript half applies them.
- **Its adapter's synchronization:** live state with its baseline from the first ready event, one update at a time, no partial state, obsolete watches rejected, recovery from uncertainty, and handler failures reported, not retried.
- **One way of applying:** its application of change sets passes the conformance corpus the JavaScript patcher passes too.
- **Diagnostics:** an error of the language it reports keeps its code.

**Completion:** the C# half passes the gate, its conformance corpus included.

Contracts: [The C# half](domql-design.md#the-c-half), [keeping a copy of a result](../spec/results.md#results-keeping-a-copy).

<a id="planned-capabilities"></a>

## Planned capabilities

What DOMQL lacks for an application to do its browser work through it: changes to the page DOMQL carries out itself, behaviors that report back and take commands, and the vocabulary, events, observation, API and timing below. They were found by reading a large body of component scripts against DOMQL as it stands. Each has an identifier, and each name is provisional: the specification settles it.

The language's part is Nexo's already, adopted with the [migration](#migration-to-nexo): numbers, strings, structured values written in place or bound, an item's position in a list, and resolutions that stay current across a registration, from its language `1.0.0-alpha.36`.

**The order of the work:**

1. **The host side.** The C# half (A1), change sets against an acknowledged result and a refresh that delivers (A2, A3), modules loaded on request (A4); occurrences a behavior offers and its owner (C1, C4); DOMQL's observations for module code (C5); `scroll` with its `children` target (V1, O1); and the first executions, focus and scrolling (X1, X2).
2. **Input.** Module state per document (C8), synchronous handling stated (C10), ordered delivery (A5), capture-phase observing (E1), and pointer, wheel and keyboard members (E2, E3, E9).
3. **Presentation.** The top-layer executions (X3), commands to a running behavior (C3), the focused element and direction (V3, V4), focus events (E5), owned writes and their ownership (X5, A10), nullable options (C11) and the frame promise (T2).
4. **Virtualization.** State a behavior offers and history per holder (C2, C9), the scroll container, the padding box and tolerance (V2, V11, V13), and siblings (V9).
5. **Gestures and files.** Pointer and drag events (E2, E4), pointer capture (X4), files (V14, X10), dispatch (X8) and continuous measurement (O3).
6. **Dialogs and frames.** Presentation events (E7), `displayed()` and `focusable()` (V5), size limits (V12) and ordered executions (T3).
7. **The remaining facilities.** Browser facilities and form controls (X6, X7), reactions in the browser (A7), and value, playback and autofill (V6, V15, V16, O4, E8).
8. **Editing and data views.** The document selection and editing events (V7, V8, V10, E6, X9, O6, A8), and transient measurement with subtree-scoped `all` (C7, O2, T1).

<a id="planned-vocabulary"></a>

### Vocabulary

| | Addition |
| --- | --- |
| V1 | `Element.scroll` → `Scroll? { inline { offset, extent, viewport }, block { offset, extent, viewport } }`, the offset logical from the start under RTL, `extent` the scroll extent and `viewport` the client extent; partly observable through `scroll` events on the receiver, `resize { box: client }` and its children's boxes and child list ([O1](#planned-observation)). `domql.window.scroll` gives the window's |
| V2 | `Element.scrollContainer({ axis })` → `Element?`, the nearest scroll container, crossing shadow roots to the host |
| V3 | `Document.activeElement` → `Element?`, the focused element, through shadow roots; observable through `focusin` and `focusout` on the document |
| V4 | `Element.direction` → `String`, `"ltr"` or `"rtl"`, observing `dir` along its ancestors and the document element; `it.style["direction"]` misses an ancestor's change, as a change to `<html dir>` is |
| V5 | Boolean functions `displayed()`, `checkVisibility({ visibilityProperty: true })`, and `focusable()`, decided natively |
| V6 | `Element.value` → `String?`, observable through `input` and `change`, partly observable; Boolean function `indeterminate()` |
| V7 | `Element.text` (`textContent`) and `Element.html` (`innerHTML`), observable through subtree mutation with `characterData`; or the Boolean `Element.hasText` |
| V8 | The document selection, `domql.document.selection` → `DocumentSelection? { type, collapsed, rangeCount, anchorElement, focusElement, range }`, and a `Range` type, `{ rect, collapsed, text, startElement, endElement, commonAncestor, intersects(node), all(selector), offsetsIn(element) }`; observable through `selectionchange`. `Element.selection` extended to an editing host. The Selection API fires `selectionchange` for script-made selections too, so these may be observable rather than partly observable, which `hasSelection`'s contract denies today; a browser test settles it |
| V9 | `Node.contains(other)` → `Boolean`; element siblings or `Element.index`; optionally `Element.follows(other)` |
| V10 | `Element.localName`, `Element.classList` → `List<String>`, `Element.inlineStyle[property]` (the declared value) |
| V11 | `Element.clientRect` → `Rectangle?`, the padding box |
| V12 | `Element.sizeLimits { minWidth, minHeight, maxWidth, maxHeight }`, or a conversion of a `px` length: `style["min-width"]` answers `"120px"`, which the String-to-Number conversion refuses |
| V13 | A `tolerance` declared on `rect`, `size`, `clientSize` and `scroll`, so a watch compares within it; the language takes one on a member of a number or a structured result already |
| V14 | `Element.files` → `List<File>?`, `File { name, size, type, lastModified }` |
| V15 | Boolean function `autofilled()`, with the autofill observation ([O4](#planned-observation)) |
| V16 | `media.playback { paused, muted, ended, currentTime, duration, volume }`, observed through media events |
| V17 | `Window.location { href }`, `Document.documentElement`, and a platform fact that replaces the deprecated `navigator.platform` |
| V18 | Function `hasPointerCapture(pointerId)` → `Boolean` |

<a id="planned-events"></a>

### Events

| | Addition |
| --- | --- |
| E1 | Listening in the capture phase, `on(type, { capture = true })`, for observing alone ([D2](#open-decisions)); the `event` observation type takes `capture` already |
| E2 | Pointer: `pointermove`, `pointercancel`, `lostpointercapture`, `dblclick`, `touchmove`; members `pointerId`, `detail`, `timeStamp` and the modifiers `ctrlKey`, `metaKey`, `altKey`, `shiftKey` |
| E3 | `wheel` as `WheelEvent { target, deltaX, deltaY, deltaMode, timeStamp }` with the modifiers |
| E4 | Drag: `dragenter`, `dragover`, `dragleave`, `dragstart`, `dragend`; `DragEvent.types` → `List<String>` |
| E5 | `focusin` and `focusout` as `FocusEvent { target, relatedTarget: Element? }`; today's `focus` and `blur` don't bubble and carry no related target |
| E6 | Editing: `beforeinput` and `input` as `InputEvent { inputType, data, isComposing }`, `paste`, `copy`, `cut` as `ClipboardEvent { types }`, `compositionstart`, `compositionend`, and `selectionchange` on the document |
| E7 | Presentation: `close`, `cancel`, `beforetoggle`, `toggle` as `ToggleEvent { oldState, newState }` |
| E8 | `animationstart`, `animationend`, `animationcancel` (`animationName`); `load`, `error`; media `play`, `pause`, `volumechange`, `ended` |
| E9 | Keyboard members `repeat` and `isComposing`; `defaultPrevented` and `composedPath` on every event |

<a id="planned-observation"></a>

### Observation

Page-wide module state needs nothing new: it is a member of a module's extension of `Document`, observing its receiver, and the document owns it, as [C8](#planned-extension-contract)'s state per document has it.

| | Addition |
| --- | --- |
| O1 | An observation target `children`, each child element of the receiver, so `Element.scroll` follows its content's sizes |
| O2 | `all` and `first` observed on the receiver's subtree, rather than attributes and children across its whole root; today a watch reading them evaluates again on any attribute change in the document, a behavior's own `tabindex` writes included |
| O3 | Opt-in continuous measurement each frame while a module holds it, so a subscriber follows content moving under a still pointer |
| O4 | An `autofill` observation, through the stylesheet animation adapter; media events for `playback`; `dir` along the ancestry for `direction` |
| O6 | A watch naming an invalidation beyond its members', or a member reading a subtree's text ([V7](#planned-vocabulary)), so `rectRelativeTo` follows a block that a sibling's edit moved |

<a id="planned-executions"></a>

### Executions

DOMQL's first built-in executions. Three names below would collide with DOMQL's Boolean functions `focus()`, `clipboard()` and `share()`, so they are written `takeFocus`, `writeClipboard` and `requestShare`.

| | Addition |
| --- | --- |
| X1 | `element.takeFocus({ preventScroll })` → `Boolean`, whether focus landed |
| X2 | `scrollTo({ inline, block, behavior })` and `scrollBy(…)` on an element and on the window, logical under RTL, answering whether they moved; `scrollIntoView({ block, inline, behavior })` |
| X3 | `showPopover()`, `hidePopover()`, `showModal()`, `close({ returnValue })` |
| X4 | `capturePointer({ pointerId })`, `releasePointer({ pointerId })` → `Boolean` |
| X5 | Engine-owned writes, each declaring its ownership and released on dispose: a class, an inline style property, `hidden`, `tabIndex`, and, continuous, attributes kept against a host's patch, `element.attributes({ lang, dir })` |
| X6 | Form controls: `writeIndeterminate(Boolean)`, `writeValue(String)` → `String?`, the value replaced, dispatching no event, and `writeSelection({ start, end })` → `Boolean` |
| X7 | Browser facilities: `domql.window.writeClipboard(text)` → `"written"`, `"refused"` or `"failed"`; `readClipboardText()` and `readClipboard({ types })`; `download({ name, content, type })`; `print()`; `requestShare({ title, url, text })` → `"shared"`, `"canceled"`, `"refused"` or `"invalid"`; `media.play()` → `"playing"`, `"blocked"`, `"aborted"` or `"unsupported"`, `pause()`, `writeMuted(Boolean)`; at low priority, `domql.document.writeCookie({ … })` |
| X8 | `dispatch({ type, bubbles, detail })`, answering whether it was cancelled |
| X9 | Selection placement: `domql.document.selection.select({ node })`, `selectContents({ node, collapse })`, `collapse({ node, offset })` |
| X10 | Image sources from selected files, their object URLs owned and revoked by the execution: built in, or a module's |

<a id="planned-extension-contract"></a>

### The extension contract

A behavior's occurrences, state, commands and owner (C1 to C4), and reactions in the browser (A7), are DOMQL's, never the language's: the language knows who invokes a function and nothing of its lifecycle.

| | Addition |
| --- | --- |
| C1 | **Occurrences a behavior offers:** an event source bound to the owner's running continuous execution on the receiver, which delivers in the order the behavior calls `deliver`, never coalesced, and outlives the execution's replacement and release ([open decision](#open-decisions)). It reopens the design's [event sources a continuous execution offers](domql-design.md#decisions-not-taken) |
| C2 | **State a behavior offers:** a module member backed by the running instance, which a watch reads and follows |
| C3 | **Commands to a running behavior:** one instance per receiver that the module's once executions and sources find, so commands such as `fit`, `measure`, `raise`, `open`, `close` and an editor's `execute` reach it; today a module keeps its own `WeakMap` of running instances |
| C4 | **The owner's identity** in what an implementation receives, so "this owner's behavior on this element" needs no token passed by hand in every query |
| C5 | **DOMQL's observations for module code:** `env.observe({ type, target, … }, notify)` → `{ stop() }` over the shared resize, mutation and intersection pools, and the frame schedule, `env.frame(…)`, under which a module may write before it reads |
| C6 | **Queries from module code:** an implementation reaching its DOMQL instance to evaluate or watch a query, `env.domql` |
| C7 | **A transient measurement:** apply a class, read, restore, and have DOMQL drain its own mutation observers of the records it caused, `env.measureUnder(element, { class }, read)`; without it every watch reading `matches`, `closest`, `first` or `all` evaluates again after each measurement |
| C8 | **Module state per document,** keyed by `env.document`, with an optional hook at a document's first use and last release |
| C9 | **Captured members with history per holder,** for a value that depends on what the member measured before: DOMQL states that an implementation's `env` is one per evaluator, as `#createEvaluator` makes it, so a module keys its history by `env` and receiver; the language keeps such history the holder's |
| C10 | **Synchronous handling stated:** an execution's own listeners run inside the native dispatch, and a module's `deliver` captures and projects synchronously, as the implementation does today |
| C11 | **A null argument that doesn't skip:** DOMQL's executions say a null argument skips the call, while the language skips only where the parameter propagates null, so DOMQL narrows its wording to the language's rule, and a null option, as a bound of `null` meaning the viewport, is passed as it stands |
| C12 | **Nested option objects holding an element,** `buttons = { container = root, … }`: an option declared a structured type, which an object expression written there constructs from Nexo's language `1.0.0-alpha.36`, its `container` a reference |
| C13 | **A kept function argument,** as a predicate a running behavior keeps and calls later; the language forbids a host call to keep a function today, so what a behavior keeps is data |

<a id="planned-api-and-host"></a>

### API and host

| | Addition |
| --- | --- |
| A1 | **The C# half,** as [planned](#the-c-half): typed queries mapped onto records, watches, once and continuous executions and subscriptions, with failures reported, never discarded. Its acknowledgement follows the application of an update, never the application's handlers |
| A2 | **Change sets against an acknowledged result,** `watch.changesSince(snapshot)` or composition of pending change sets, so one delivery in flight carries everything since the receiver's last acknowledged state while list items stay matched by their sources; a host can't compute it, since item identity lives in metadata a result never holds |
| A3 | **A refresh that delivers an equal result,** `refreshAsync({ rebaseline: true })`; today a refresh raises nothing when the result is unchanged, while a reconnection and a sentinel refreshed after a load each need it delivered |
| A4 | **Modules loaded on request,** a loader by module, or the imports a definition names, which the [second checkpoint](#checkpoint-2--scripts-and-imports) brings, so a module is registered before the query that names it is resolved; `run` starts synchronously, so its implementation must be loaded first |
| A5 | **Ordered occurrence delivery to C#,** bounded, never coalesced, failing explicitly on overflow, and updates to several handles kept in their invocation order, since the order of activations can decide which handle takes precedence |
| A6 | **An execution's lifetime anchored to its element,** `run({ anchor })`, disposing it once the element has left the document a frame later; a host can build it from a watch of `it.attached` |
| A7 | **Reactions run in the browser:** a once execution DOMQL runs when a route or an event source delivers, with no round trip, so transient activation holds for the clipboard, sharing, playback and select-on-focus; and several executions in one crossing |
| A8 | **Source elements for a local consumer:** a watch in the browser whose result items carry the elements they came from, so a JavaScript handler can write to them |
| A9 | **Delivery options:** a throttle on a subscription; a delayed schedule beside `frame` and `immediate`; reporting when a subset of fields changes while delivering all of them. A subscription delivered by frame reopens the design's [decision not taken](domql-design.md#decisions-not-taken) |
| A10 | **Ownership of written styles and classes** against a framework that renders the same elements: an exclusive owner, or an isolated layer per component |

<a id="planned-timing"></a>

### Timing

| | Addition |
| --- | --- |
| T1 | An `immediate` watch's handlers run within the microtask checkpoint of the mutation delivery that invalidated it, before any task or frame |
| T2 | A `frame` watch's handlers run inside the animation frame, before paint, so a handler can write what it measured; a frame phase for executions' writes |
| T3 | Executions carried out in one task keep their order, so opening then focusing happens in one task |

<a id="release"></a>
<a id="release-work"></a>

## Release

Complete the migration before publishing packages.

<a id="consuming-lexica"></a>

### Consuming the language

**Current:** DOMQL depends on `@formaui/lexica` through `file:.lexica`, which the build fills with Lexica at the commit `lexica.commit` pins, `0e98b3e`, taken from a checkout beside this one named `formaui-net.Lexica`, or links to the checkout `LEXICA_SOURCE` names; CI checks Lexica out at the same commit. It imports the language's entry point alone, and bundles it into `domql.js`. The language's tests that run through DOMQL's entry point are DOMQL's integration tests.

**Remaining:**

1. Depend on Nexo's released packages, `@formaui/nexo` and `formaui-net.Nexo`, each of an exact version.
2. Write the NuGet bundle with `../nexo/nexo.js` as an import, and the npm bundle with `@formaui/nexo`, rather than carrying the language inside.
3. Have the gate check that DOMQL's packages depend on Nexo's and Nexo's on nothing of DOMQL's, and run DOMQL's tests against the packaged Nexo.

Needs Nexo's packages, which its [release](https://github.com/FormaUI/Nexo/blob/main/docs/features-status.md#release) publishes.

### Packages

**Current:** packed locally; neither the npm nor the NuGet package is published.

**Remaining:** publish both, once DOMQL consumes a released Nexo. Before publishing, advance the runtime version, and check that the README and `domql.info.versions` name the specification and language versions the package implements.

### Beta

**Current:** the documents and the module API have been audited. The behavior of a cast inside an optional enclosed access is settled.

**Remaining:**

- Add `CHANGELOG.md`, empty until the first change after the beta.
- Set the beta version to `1.0.0-beta` wherever the beta version is written or checked; number packages `1.0.0-beta.N`.

Beta means no breaking redesign is planned and remaining limitations are documented. Breaking changes after beta require migration guidance.

<a id="backlog"></a>

## Backlog

This work is separate from the plan above. No order is assigned here.

| Work | Status | Remaining |
| --- | --- | --- |
| Editor tooling | Planned | Nexo's, through its syntax tree, in its [tooling](https://github.com/FormaUI/Nexo/blob/main/docs/features-status.md#tooling) |

**Verification outside the gate.** `domql.window.size` following a scrollbar that appears or goes is shown only by an experiment outside the gate, since the gate's Chromium hides scrollbars; a browser test with a launch of its own would bring it in without changing the other tests' geometry. Performance is measured outside the gate too, by `npm run bench` and `npm run scale` from `tests/`.

<a id="open-decisions"></a>

## Open decisions

| Decision | State |
| --- | --- |
| A flat-tree parent | A parent across slots, beside the tree's own `parent` and `root`, waits until its uses and its meaning are clear. |
| Which changes are built in | Proposed: generic web-platform changes are DOMQL's built-in executions, and an application's algorithms its own modules. A change is built in where it is one platform call with a platform result, as focusing, scrolling, showing a popover, capturing a pointer and writing the clipboard are, and a module's where it carries a policy, as stepping, placement, gestures and roving focus do. DOMQL stays independent of its consumers, and every consumer needs the generic half. |
| `on` stays passive | Proposed: `on` never cancels. Cancelling an event, consuming a key, claiming a click and capturing a pointer stay synchronous inside a module's own listeners, and `on` gains the capture phase for observing alone ([E1](#planned-events)). A cancelling subscription would have to decide synchronously, before any caller sees the event. |
| A behavior's occurrences | Proposed: a behavior's occurrences are event sources of the module that declares the behavior, bound to the running continuous execution of the same owner on the same receiver, and outliving its replacement and release ([C1](#planned-extension-contract)). Every behavior that reports needs it. |

<a id="deferred"></a>

## Deferred

| Work | Why it waits | Reopened by |
| --- | --- | --- |
| A list's change set by its longest increasing subsequence | It would send one operation to move the first item to the end, where today's diff sends one for every other item; today's diff takes at most half a millisecond for 1,000 items in any order, though it can grow quadratically with a large reorder. It is decided by the total cost of generating, delivering and applying a change set, never by generating one alone. | A workload that measures delivering and applying change sets |
| Incremental evaluation | Re-evaluating only what changed saves nothing for the changes lists most often see: `matches`, `all`, `closest` and the ancestry `rect` follows observe a whole tree, and layout, insertion, removal, moving and scrolling invalidate every row. It saves much only for edits of a row's own attributes and class, and is sound only with each selector analysed for what it reads. | A workload that needs that saving |

Decisions considered and not taken, with what would reopen each, are in [the design](domql-design.md#decisions-not-taken).
