# Features Status

## Current state

**DOMQL's vocabulary, queries, watches, events and executions are implemented on Nexo's language `1.0.0-beta.15`, definition version 38. The specification describes DOMQL's `1.0.0-alpha.291`, which the implementation follows: the DOM declared as DOMQL's own types, read through the `Domql` module every query imports. Next is [the C# half](#the-c-half).**

| Version | Implementation | Specification |
| --- | --- | --- |
| DOMQL specification | `1.0.0-alpha.291` | `1.0.0-alpha.291` |
| Nexo language | `1.0.0-beta.15` | `1.0.0-beta.15` |
| Definition format | 38 | 38 |

- **The language DOMQL runs on.** DOMQL builds against Nexo at the commit `nexo.commit` pins, `2cb596e`, Nexo's `1.0.0-beta.15`, and its documents link to [Nexo's documents at it](https://github.com/FormaUI/Nexo/blob/2cb596ea0d1a1fc624552783b30139379124bb67/spec/README.md). The language was called Lexica before the [migration](#migration-to-nexo).
- **Packages.** The bundle and type declarations are built, with Nexo bundled inside `domql.js`. npm and NuGet packages are packed locally but unpublished.
- **The C# half** is designed and not started.

The [specification](../spec/README.md) defines the contract, and the [design](domql-design.md) explains the architecture. The [version history](../VERSION-HISTORY.md) records what each version changed. This file tracks DOMQL's implementation and its remaining work. "Implemented" means built and tested in the gate for the current implementation version; it does not imply that later specification changes are implemented.

<a id="remaining-work"></a>

## Remaining work

| Work | State |
| --- | --- |
| [The C# half](#the-c-half) | Next |
| [Planned capabilities](#planned-capabilities) | Planned, in the order they are listed |
| [Release](#release) | On Nexo's published packages |

- **Breaking changes are made directly,** without compatibility layers, migration notes or deprecations, until the beta.
- **Documents move with their change.** The READMEs, the library guide, the specification, the type declarations, the version history and this file change in the commit that changes what they describe.
- **Every change passes the gate,** browser tests included.

<a id="features"></a>

## Features

Each feature, the contract that states it, its state in the implementation, and the version the implementation has followed it since, whose changes [the version history](../VERSION-HISTORY.md) records.

### The DOM's vocabulary

| Feature | Contract | State | Since |
| --- | --- | --- | --- |
| Nodes and shadow trees, crossed explicitly | [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Properties, functions and indexers of the DOM | [Built-in vocabulary](../spec/vocabulary.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Nexo's indexer forms and type names in PascalCase | [Types](../spec/vocabulary.md#vocabulary-types) | Implemented | [`alpha.277`](../VERSION-HISTORY.md#v1-0-0-alpha-277) |
| `Domql.document` and `Domql.window` | [Module members](../spec/vocabulary.md#module-members) | Implemented | [`alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) |
| Boolean functions | [Boolean functions](../spec/vocabulary.md#boolean-functions) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Conversions, Nexo's, which DOMQL's queries use | [Built-in conversions](../spec/vocabulary.md#built-in-conversions) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Observation types, shared in sessions | [Observation types](../spec/vocabulary.md#observations-types) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Observation targets DOMQL declares and resolves | [Observation targets](../spec/vocabulary.md#observations-targets) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Event sources and event types | [Events](../spec/events.md#event-sources) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Listening in the capture phase, `on(type, { capture = true })`, for observing alone | [Event sources](../spec/events.md#event-sources) | Implemented, as [D27](decisions.md#d27) records | [`alpha.288`](../VERSION-HISTORY.md#v1-0-0-alpha-288) |
| Pointer, touch, wheel and drag events, their pointer, count, time, modifiers, touches and formats | [Event types](../spec/events.md#event-types) | Implemented, as [D28](decisions.md#d28) and [D29](decisions.md#d29) record | [`alpha.289`](../VERSION-HISTORY.md#v1-0-0-alpha-289) |
| Focus, editing, clipboard, composition, presentation, animation, loading and media events | [Event types](../spec/events.md#event-types) | Implemented, as [D30](decisions.md#d30) to [D32](decisions.md#d32) record | [`alpha.290`](../VERSION-HISTORY.md#v1-0-0-alpha-290) |
| A key's repeat, composition and modifiers, AltGr among them, and every event's time, cancellation and path | [Event types](../spec/events.md#event-types) | Implemented, as [D33](decisions.md#d33) records | [`alpha.291`](../VERSION-HISTORY.md#v1-0-0-alpha-291) |
| Extension modules: their types, extensions read with `:`, observations, event sources and executions | [Extension modules](../spec/vocabulary.md#extension-modules) | Implemented | [`alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) |
| The DOM declared as DOMQL's own reference types, and the cast from `Aria` to `Element` | [Nodes](../spec/nodes-and-shadow-trees.md#nodes), [types](../spec/vocabulary.md#vocabulary-types) | Implemented | [`alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) |
| Diagnostic codes of DOMQL's own | [Errors](../spec/errors.md) | Implemented | [`alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) |
| Scrolling: `scroll` of an element and of the window, `scrollContainer`, and the padding box, `clientRect` | [Element `scroll`](../spec/vocabulary.md#property-element-scroll), [`scrollContainer`](../spec/vocabulary.md#function-element-scrollcontainer), [`clientRect`](../spec/vocabulary.md#property-element-clientrect) | Implemented | [`alpha.280`](../VERSION-HISTORY.md#v1-0-0-alpha-280) |
| Measurements of layout compared within a tolerance | [Tolerance](../spec/vocabulary.md#vocabulary-tolerance) | Implemented | [`alpha.280`](../VERSION-HISTORY.md#v1-0-0-alpha-280) |
| The observation target `children`, and a document's size | [Observation targets](../spec/vocabulary.md#observations-targets) | Implemented | [`alpha.280`](../VERSION-HISTORY.md#v1-0-0-alpha-280) |
| The focused element, `Domql.document.activeElement`, through open shadow roots | [`activeElement`](../spec/vocabulary.md#property-document-activeelement) | Implemented | [`alpha.281`](../VERSION-HISTORY.md#v1-0-0-alpha-281) |
| An element's `direction`, as `dir` decides it along its ancestry | [`direction`](../spec/vocabulary.md#property-element-direction) | Implemented | [`alpha.281`](../VERSION-HISTORY.md#v1-0-0-alpha-281) |
| Boolean functions `displayed()` and `focusable()` | [`displayed`](../spec/vocabulary.md#boolean-function-element-displayed), [`focusable`](../spec/vocabulary.md#boolean-function-element-focusable) | Implemented | [`alpha.281`](../VERSION-HISTORY.md#v1-0-0-alpha-281) |
| A control's `value`, and Boolean functions `indeterminate()` and `autofilled()` | [`value`](../spec/vocabulary.md#property-element-value), [`indeterminate`](../spec/vocabulary.md#boolean-function-element-indeterminate), [`autofilled`](../spec/vocabulary.md#boolean-function-element-autofilled) | Implemented; no observation follows autofill itself, as [D17](decisions.md#d17) records | [`alpha.282`](../VERSION-HISTORY.md#v1-0-0-alpha-282) |
| An element's `text`, `html`, `localName`, `classes` and `inlineStyle[property]` | [`text`](../spec/vocabulary.md#property-element-text), [`html`](../spec/vocabulary.md#property-element-html), [`inlineStyle`](../spec/vocabulary.md#function-element-inlinestyle) | Implemented | [`alpha.282`](../VERSION-HISTORY.md#v1-0-0-alpha-282) |
| A media element's `playback`, observed through its media events | [`playback`](../spec/vocabulary.md#property-element-playback) | Implemented | [`alpha.282`](../VERSION-HISTORY.md#v1-0-0-alpha-282) |
| The document selection, `Domql.document.selection`, its `Range`, and an editable element's `selection` | [Document `selection`](../spec/vocabulary.md#property-document-selection), [`Range`](../spec/vocabulary.md#property-range-rect), [Element `selection`](../spec/vocabulary.md#property-element-selection) | Implemented; an element's `selection` and `hasSelection` observable, as [D20](decisions.md#d20) records | [`alpha.283`](../VERSION-HISTORY.md#v1-0-0-alpha-283) |
| Siblings, an element's `index` and `contains(other)`; `follows(other)` declined, as [D22](decisions.md#d22) records | [Siblings](../spec/vocabulary.md#property-element-siblings), [`index`](../spec/vocabulary.md#property-element-index), [`contains`](../spec/vocabulary.md#function-node-contains) | Implemented | [`alpha.284`](../VERSION-HISTORY.md#v1-0-0-alpha-284) |
| The window's `location`, followed through the Navigation API, and its `shortcutModifier`; `Document.documentElement` declined, as [D23](decisions.md#d23) records | [`location`](../spec/vocabulary.md#property-window-location), [`shortcutModifier`](../spec/vocabulary.md#property-window-shortcutmodifier) | Implemented | [`alpha.284`](../VERSION-HISTORY.md#v1-0-0-alpha-284) |
| `all`, `first`, `matches` and `closest` observing what their selector reads, the `selector` observation | [`matches`](../spec/vocabulary.md#function-element-matches), [observation types](../spec/vocabulary.md#observations-types) | Implemented | [`alpha.286`](../VERSION-HISTORY.md#v1-0-0-alpha-286) |
| An element's `sizeLimits` in pixels, and a file input's `files` | [`sizeLimits`](../spec/vocabulary.md#property-element-sizelimits), [`files`](../spec/vocabulary.md#property-element-files) | Implemented | [`alpha.285`](../VERSION-HISTORY.md#v1-0-0-alpha-285) |
| `hasPointerCapture(pointerId)` | [`hasPointerCapture`](../spec/vocabulary.md#function-element-haspointercapture) | Implemented | [`alpha.284`](../VERSION-HISTORY.md#v1-0-0-alpha-284) |
| Following a change a member misses through a body's local | [Following a change a member misses](../spec/watches.md#dependencies-following-what-a-member-misses) | Implemented | [`alpha.282`](../VERSION-HISTORY.md#v1-0-0-alpha-282) |

### The host

| Feature | Contract | State | Since |
| --- | --- | --- | --- |
| Queries from text or a definition, `with`, `select` and `resolve` | [Queries](../spec/queries.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Imports, `Domql` supplied to every query | [Its imports](../spec/queries.md#making-a-query-imports) | Implemented | [`alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) |
| Evaluating once, and waiting for maintained members | [Evaluation](../spec/evaluation.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Watches, their dependencies and partial observation | [Watches](../spec/watches.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Snapshots, live state and change sets | [Results](../spec/results.md) | Implemented; a selection takes a dictionary or a pair whole | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Items matched by provenance, and dictionaries and pairs in results | [Change sets](../spec/results.md#results-change-sets), [dictionaries and pairs](../spec/results.md#results-collections) | Implemented | [`alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) |
| Subscriptions to event sources | [Events](../spec/events.md#subscribing) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| Executions, once and continuous, carried out over Nexo's host calls | [Executions](../spec/executions.md), [host calls DOMQL carries out](../spec/vocabulary.md#extension-modules-host-calls) | Implemented | [`alpha.276`](../VERSION-HISTORY.md#v1-0-0-alpha-276) |
| Handles: their events, lifetimes and errors | [The API](../spec/api.md) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| `domql.info.versions` | [The API](../spec/api.md#api-entry-points-and-operations) | Implemented | [`alpha.275`](../VERSION-HISTORY.md#v1-0-0-alpha-275) |
| The JavaScript bundle and its TypeScript declarations | [README](../README.md#build-and-try-it) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| The C# half | [Design](domql-design.md#the-c-half) | Planned: [next](#the-c-half) | — |

<a id="migration-to-nexo"></a>
<a id="implementation-plan"></a>

## Migration to Nexo

DOMQL moved from Lexica at `0e98b3e`, language `1.0.0-alpha.33`, to Nexo's language `1.0.0-beta.3`, the language Lexica became, at `559334c`, and has followed Nexo's commits since. Nexo's checklist for the move, of every change DOMQL adopted and where DOMQL used what changed, is [DOMQL's migration](https://github.com/FormaUI/Nexo/blob/c9db3adc838ab8d16a6aa1626ce6df5a61b50f79/docs/features-status.md#domqls-migration), as Nexo kept it until the move was done. DOMQL's [version `1.0.0-alpha.278`](../VERSION-HISTORY.md#v1-0-0-alpha-278) records what changed for its callers.

- **One pin.** The migration was planned in checkpoints, each on a Nexo commit pinned as Nexo's work landed. Nexo reached its beta first, and its checklists describe the beta, so DOMQL moved to the beta at one pin, its checkpoints the order of the work, and passed its gate once on the beta: pinning a commit for each checkpoint would have meant writing against interfaces Nexo had already changed again.
- **Imports.** DOMQL supplies its own module, `Domql`, as every query's import, and a query writes its other imports. An application configures no imports of its own, so a query's text means the same whatever was configured, as [D4](decisions.md#d4) records.
- **Errors.** DOMQL's own conditions take `DOMQL` codes, catalogued in [errors](../spec/errors.md), bounded to the conditions it reports today; an error of Nexo's passing through DOMQL keeps its own code.
- **Module errors.** A module error of DOMQL's own, as its dispatch table's refusals are, is built with `NexoError.module`, which Nexo declared for its hosts in language `1.0.0-beta.2` for DOMQL's migration, as its [decisions](https://github.com/FormaUI/Nexo/blob/main/docs/decisions.md#d29) record.
- **Host calls on a receiver of unknown type.** What such a call requests is read from the candidates Nexo answers for it, every declaration that takes the call as it is written, which Nexo answers from language `1.0.0-beta.3` for DOMQL, as its [decisions](https://github.com/FormaUI/Nexo/blob/main/docs/decisions.md#d30) record. DOMQL read them from an index of its own before, which counted host calls a query could not reach.
- **What the migration found in Nexo since,** fixed in Nexo's languages `1.0.0-beta.4` to `1.0.0-beta.8`, as its [decisions](https://github.com/FormaUI/Nexo/blob/main/docs/decisions.md#d31) record: a host call on a value of `Any` is refused as Nexo resolves it, where DOMQL refused it as a value to evaluate; a module's own type named `Pair` is named by that name in its declarations; `@Domql` standing alone gives `~Domql`; a watch made stale by a module recognizing values compares within each value's tolerance, as Nexo keeps origins across resolutions of one definition; and a member read through a value of `Any` is compared within the tolerance it declares.

Contracts: [Queries](../spec/queries.md), [types](../spec/vocabulary.md#vocabulary-types), [extension modules](../spec/vocabulary.md#extension-modules), [results](../spec/results.md), [errors](../spec/errors.md).

<a id="the-c-half"></a>
<a id="part-4--the-c-half"></a>

## The C# half

The C# half follows the migration, so its API is built on the final query text, imports, definition version and result representations, never reworked after them.

- **Its API,** as [the design](domql-design.md#the-c-half) sets out: `Domql.Query` and `Domql.Query<T>` from text or a definition, binding its parameters; `Domql.TryQuery`, answering false with a diagnostic for a syntax or structure failure; and `query.Definition`. A `DomqlQuery<T>` maps a result onto `T` by its declared contract, and a `DomqlQuery` answers a `DomqlSnapshot`.
- **Results:** lists, dictionaries and pairs mapped onto `T` and read through a `DomqlSnapshot` by their exported forms.
- **Imports:** `Domql`, which DOMQL supplies to every query, applied as the JavaScript half applies it.
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

1. **The host side.** The C# half (A1), change sets against an acknowledged result and a refresh that delivers (A2, A3), modules loaded on request (A4); occurrences a behavior offers and its owner (C1, C4); DOMQL's observations for module code (C5); and the first executions, focus and scrolling (X1, X2).
2. **Input.** Module state per document (C8), synchronous handling stated (C10) and ordered delivery (A5).
3. **Presentation.** The top-layer executions (X3), commands to a running behavior (C3), owned writes and their ownership (X5, A10), nullable options (C11) and the frame promise (T2).
4. **Virtualization.** State a behavior offers and history per holder (C2, C9).
5. **Gestures and files.** Pointer capture (X4), files (X10), dispatch (X8) and continuous measurement (O3).
6. **Dialogs and frames.** Ordered executions (T3).
7. **The remaining facilities.** Browser facilities and form controls (X6, X7), and reactions in the browser (A7).
8. **Editing and data views.** Selection placement (X9, A8), and transient measurement (C7, T1).

<a id="planned-vocabulary"></a>

### Vocabulary

None remains: V1 to V18 are implemented, as [the features](#the-doms-vocabulary) show, or declined where [the decisions](decisions.md) say why: `checkVisibility({ visibilityProperty: true })` ([D14](decisions.md#d14)), `hasText` ([D15](decisions.md#d15)), `follows(other)` ([D22](decisions.md#d22)) and `Document.documentElement` ([D23](decisions.md#d23)).

<a id="planned-events"></a>

### Events

None remains: E1 to E9 are implemented, as [the features](#the-doms-vocabulary) show. `on` takes a `Listening` option ([D27](decisions.md#d27)), a click shares `PointerEvent` with the pointer events ([D28](decisions.md#d28)), `touchend` and `touchcancel` are declined, since pointer events cover them ([D29](decisions.md#d29)), `focus` and `blur` are each a `FocusEvent` ([D30](decisions.md#d30)), and every event carries its time, its cancellation and its path ([D33](decisions.md#d33)).

<a id="planned-observation"></a>

### Observation

Page-wide module state needs nothing new: it is a member of a module's extension of `Document`, observing its receiver, and the document owns it, as [C8](#planned-extension-contract)'s state per document has it.

O1, O2, O4 and O6 are implemented, as [the features](#the-doms-vocabulary) show: O2 observes what a selector reads rather than the receiver's subtree ([D26](decisions.md#d26)), O4's autofill observation is declined, since it would write a stylesheet into the page ([D17](decisions.md#d17)), and O6 is a body's local reading what a member misses ([D19](decisions.md#d19)).

| | Addition |
| --- | --- |
| O3 | Opt-in continuous measurement each frame while a module holds it, so a subscriber follows content moving under a still pointer |

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
| X7 | Browser facilities: `Domql.window.writeClipboard(text)` → `"written"`, `"refused"` or `"failed"`; `readClipboardText()` and `readClipboard({ types })`; `download({ name, content, type })`; `print()`; `requestShare({ title, url, text })` → `"shared"`, `"canceled"`, `"refused"` or `"invalid"`; `media.play()` → `"playing"`, `"blocked"`, `"aborted"` or `"unsupported"`, `pause()`, `writeMuted(Boolean)`; at low priority, `Domql.document.writeCookie({ … })` |
| X8 | `dispatch({ type, bubbles, detail })`, answering whether it was cancelled |
| X9 | Selection placement: `Domql.document.selection.select({ node })`, `selectContents({ node, collapse })`, `collapse({ node, offset })` |
| X10 | Image sources from selected files, their object URLs owned and revoked by the execution: built in, or a module's |

<a id="planned-extension-contract"></a>

### The extension contract

A behavior's occurrences, state, commands and owner (C1 to C4), and reactions in the browser (A7), are DOMQL's, never the language's: the language knows who invokes a function and nothing of its lifecycle.

| | Addition |
| --- | --- |
| C1 | **Occurrences a behavior offers:** an event source bound to the owner's running continuous execution on the receiver, which delivers in the order the behavior calls `deliver`, never coalesced, and outlives the execution's replacement and release ([D3](decisions.md#d3)). It reopens the design's [event sources a continuous execution offers](domql-design.md#decisions-not-taken) |
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
| A4 | **Modules loaded on request,** a loader by module, or the imports a definition names, so a module is registered before the query that names it is resolved; `run` starts synchronously, so its implementation must be loaded first |
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

Consume a released Nexo before publishing packages.

<a id="consuming-lexica"></a>
<a id="consuming-nexo"></a>

### Consuming the language

**Current:** DOMQL depends on `@formaui-net/nexo` through `file:.nexo`, which the build fills with Nexo at the commit `nexo.commit` pins, `2cb596e`, taken from a checkout beside this one named `formaui-net.Nexo`, or links to the checkout `NEXO_SOURCE` names; CI checks Nexo out at the same commit. It imports the language's entry point alone, and bundles it into `domql.js`. The language's tests that run through DOMQL's entry point are DOMQL's integration tests.

**Remaining:**

1. Depend on Nexo's released packages, `@formaui-net/nexo` and `formaui-net.Nexo`, each of an exact version.
2. Write the NuGet bundle with `../nexo/nexo.js` as an import, and the npm bundle with `@formaui-net/nexo`, rather than carrying the language inside.
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

**Verification outside the gate.** Performance is measured outside the gate, by `npm run bench` and `npm run scale` from `tests/`. `Domql.window.size` following a scrollbar that appears or goes runs in the gate, as a browser test with a launch of its own.

<a id="open-decisions"></a>

## Open decisions

None. The [decisions](decisions.md) record each one taken without stopping to ask, for review: what is built in ([D1](decisions.md#d1)), a passive `on` ([D2](decisions.md#d2)), a behavior's occurrences ([D3](decisions.md#d3)), imports a query writes ([D4](decisions.md#d4)) and no flat-tree parent ([D5](decisions.md#d5)).

<a id="deferred"></a>

## Deferred

| Work | Why it waits | Reopened by |
| --- | --- | --- |
| A list's change set by its longest increasing subsequence | It would send one operation to move the first item to the end, where today's diff sends one for every other item; today's diff takes at most half a millisecond for 1,000 items in any order, though it can grow quadratically with a large reorder. It is decided by the total cost of generating, delivering and applying a change set, never by generating one alone. | A workload that measures delivering and applying change sets |
| Incremental evaluation | Re-evaluating only what changed saves nothing for the changes lists most often see: `matches`, `all`, `closest` and the ancestry `rect` follows observe a whole tree, and layout, insertion, removal, moving and scrolling invalidate every row. It saves much only for edits of a row's own attributes and class, and is sound only with each selector analysed for what it reads. | A workload that needs that saving |

Decisions considered and not taken, with what would reopen each, are in [the design](domql-design.md#decisions-not-taken).
