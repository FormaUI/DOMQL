# Features Status

## Current state

**DOMQL's vocabulary, queries, watches, events and executions are implemented on Nexo's language `1.0.0-beta.20`, definition version 38. The specification describes DOMQL's `1.0.0-alpha.308`, which the implementation follows: the DOM declared as DOMQL's own types, read through the `Domql` module every query imports. Next are the [planned capabilities](#planned-capabilities) of the host side; the C# half waits for its design.**

| Version | Implementation | Specification |
| --- | --- | --- |
| DOMQL specification | `1.0.0-alpha.308` | `1.0.0-alpha.308` |
| Nexo language | `1.0.0-beta.20` | `1.0.0-beta.20` |
| Definition format | 38 | 38 |

- **The language DOMQL runs on.** DOMQL builds against Nexo at the commit `nexo.commit` pins, `e989dee`, Nexo's `1.0.0-beta.20`, and its documents link to [Nexo's documents at it](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/README.md). The language was called Lexica before the [migration](#migration-to-nexo).
- **Packages.** The bundle and type declarations are built, with Nexo bundled inside `domql.js`. npm and NuGet packages are packed locally but unpublished.
- **The C# half** waits for its design, as [D46](decisions.md#d46) records.

The [specification](../spec/README.md) defines the contract, and the [design](domql-design.md) explains the architecture. The [version history](../VERSION-HISTORY.md) records what each version changed. This file tracks DOMQL's implementation and its remaining work. "Implemented" means built and tested in the gate for the current implementation version; it does not imply that later specification changes are implemented.

<a id="remaining-work"></a>

## Remaining work

| Work | State |
| --- | --- |
| [The C# half](#the-c-half) | Waits for its design |
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
| Continuous measurement, the `frame` observation, its cost measured | [Observation types](../spec/vocabulary.md#observations-types) | Implemented, as [D56](decisions.md#d56) records | [`alpha.305`](../VERSION-HISTORY.md#v1-0-0-alpha-305) |
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
| A chosen file shown as an element's source, `ownFileSource`, its object URL owned and revoked | [`ownFileSource`](../spec/vocabulary.md#execution-element-ownfilesource) | Implemented, as [D44](decisions.md#d44) records | [`alpha.300`](../VERSION-HISTORY.md#v1-0-0-alpha-300) |
| Placing the document's selection, `select`, `selectContents` and `collapse` of `Domql.document.selection` | [Selection placement](../spec/vocabulary.md#execution-document-selection-placement) | Implemented, as [D43](decisions.md#d43) records | [`alpha.299`](../VERSION-HISTORY.md#v1-0-0-alpha-299) |
| `dispatch`, a custom event of the page's own, of an element, the document and the window | [`dispatch`](../spec/vocabulary.md#execution-dispatch) | Implemented, as [D42](decisions.md#d42) records | [`alpha.298`](../VERSION-HISTORY.md#v1-0-0-alpha-298) |
| Built-in executions: focusing, `takeFocus`, and scrolling, `scrollTo`, `scrollBy` and `scrollIntoView`, of an element and of the window | [Executions](../spec/vocabulary.md#built-in-executions) | Implemented, as [D34](decisions.md#d34) and [D35](decisions.md#d35) record | [`alpha.292`](../VERSION-HISTORY.md#v1-0-0-alpha-292) |
| Pointer capture, `capturePointer` and `releasePointer` | [`capturePointer`](../spec/vocabulary.md#execution-element-capturepointer-releasepointer) | Implemented, as [D37](decisions.md#d37) records | [`alpha.294`](../VERSION-HISTORY.md#v1-0-0-alpha-294) |
| The browser's facilities, `writeClipboard`, `readClipboard`, `download`, `print` and `requestShare`, and a media element's `play`, `pause` and `writeMuted`; `readClipboardText` and `writeCookie` declined, as [D40](decisions.md#d40) and [D41](decisions.md#d41) record | [`writeClipboard`](../spec/vocabulary.md#execution-window-writeclipboard-readclipboard), [`requestShare`](../spec/vocabulary.md#execution-window-requestshare), [`play`](../spec/vocabulary.md#execution-element-play-pause-writemuted) | Implemented | [`alpha.297`](../VERSION-HISTORY.md#v1-0-0-alpha-297) |
| A form control's writes, `writeIndeterminate`, `writeValue` and `writeSelection`, firing no event | [`writeValue`](../spec/vocabulary.md#execution-element-writevalue), [`writeSelection`](../spec/vocabulary.md#execution-element-writeselection) | Implemented, as [D39](decisions.md#d39) records | [`alpha.296`](../VERSION-HISTORY.md#v1-0-0-alpha-296) |
| Owned writes of an attribute, a class and an inline style property, `ownAttribute`, `ownClass` and `ownStyle`, each restoring and keeping its value as it says | [Owned writes](../spec/vocabulary.md#execution-element-owned-writes) | Implemented, as [D38](decisions.md#d38) records | [`alpha.295`](../VERSION-HISTORY.md#v1-0-0-alpha-295) |
| The top layer's executions, `showPopover`, `hidePopover`, `showModal` and `close` | [`showPopover`](../spec/vocabulary.md#execution-element-showpopover-hidepopover), [`showModal`](../spec/vocabulary.md#execution-element-showmodal-close) | Implemented, as [D36](decisions.md#d36) records | [`alpha.293`](../VERSION-HISTORY.md#v1-0-0-alpha-293) |
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
| An operation's owner, which every implementation receives in one environment for the operation | [The owner](../spec/behaviors.md#behaviors-the-owner), [the environment](../spec/vocabulary.md#extension-modules-environment) | Implemented, as [D47](decisions.md#d47) records | [`alpha.302`](../VERSION-HISTORY.md#v1-0-0-alpha-302) |
| Commands to a running behavior, reaching its instance for their owner on their receiver | [Commands](../spec/behaviors.md#behaviors-commands) | Implemented, as [D48](decisions.md#d48) records | [`alpha.302`](../VERSION-HISTORY.md#v1-0-0-alpha-302) |
| Occurrences a behavior offers, through event sources of its module bound to its owner and receiver | [Occurrences](../spec/behaviors.md#behaviors-occurrences) | Implemented, as [D49](decisions.md#d49) records | [`alpha.303`](../VERSION-HISTORY.md#v1-0-0-alpha-303) |
| A delivery acknowledged once each subscription applied it | [Acknowledgment](../spec/behaviors.md#behaviors-acknowledgment) | Implemented, as [D50](decisions.md#d50) records | [`alpha.303`](../VERSION-HISTORY.md#v1-0-0-alpha-303) |
| State a behavior offers, read by its module's members and followed through the `behavior` observation | [State](../spec/behaviors.md#behaviors-state) | Implemented, as [D52](decisions.md#d52) records | [`alpha.304`](../VERSION-HISTORY.md#v1-0-0-alpha-304) |
| DOMQL's observations and frames for module code, `env.observe` and `env.frame`, a frame's writes before its reads | [The environment](../spec/vocabulary.md#extension-modules-environment) | Implemented, as [D53](decisions.md#d53) records | [`alpha.305`](../VERSION-HISTORY.md#v1-0-0-alpha-305) |
| Queries from module code, `env.domql`, and no execution while a query is evaluated | [The environment](../spec/vocabulary.md#extension-modules-environment) | Implemented, as [D54](decisions.md#d54) records | [`alpha.305`](../VERSION-HISTORY.md#v1-0-0-alpha-305) |
| A transient measurement, `env.measureUnder`, which DOMQL's own observers never hear | [The environment](../spec/vocabulary.md#extension-modules-environment) | Implemented, as [D55](decisions.md#d55) records | [`alpha.305`](../VERSION-HISTORY.md#v1-0-0-alpha-305) |
| A module's state per document, one across every instance of DOMQL | [State per document](../spec/vocabulary.md#extension-modules-state-per-document) | Implemented, as [D57](decisions.md#d57) records | [`alpha.306`](../VERSION-HISTORY.md#v1-0-0-alpha-306) |
| A captured member's history, kept per holder by the operation's environment | [History per holder](../spec/vocabulary.md#extension-modules-history-per-holder) | Implemented, as [D58](decisions.md#d58) records | [`alpha.306`](../VERSION-HISTORY.md#v1-0-0-alpha-306) |
| A null argument passed as it stands where its parameter accepts null | [Arguments](../spec/vocabulary.md#extension-modules) | Implemented, as [D59](decisions.md#d59) records | [`alpha.307`](../VERSION-HISTORY.md#v1-0-0-alpha-307) |
| Nested options holding an element, a structured option written in place | [Arguments](../spec/vocabulary.md#extension-modules) | Implemented, as [D60](decisions.md#d60) records | [`alpha.307`](../VERSION-HISTORY.md#v1-0-0-alpha-307) |
| Kept functions, a host call's function arguments its implementation calls later, ended as the execution ends | [Kept functions](../spec/vocabulary.md#extension-modules-kept-functions) | Implemented, as [D61](decisions.md#d61) records | [`alpha.308`](../VERSION-HISTORY.md#v1-0-0-alpha-308) |
| Handling inside the native dispatch, delivering synchronously and never throwing into the listener | [Handling inside the native dispatch](../spec/behaviors.md#behaviors-synchronous-handling) | Implemented, as [D51](decisions.md#d51) records | [`alpha.303`](../VERSION-HISTORY.md#v1-0-0-alpha-303) |
| `domql.info.versions` | [The API](../spec/api.md#api-entry-points-and-operations) | Implemented | [`alpha.275`](../VERSION-HISTORY.md#v1-0-0-alpha-275) |
| The JavaScript bundle and its TypeScript declarations | [README](../README.md#build-and-try-it) | Implemented | [Before `alpha.275`](../VERSION-HISTORY.md#before-1-0-0-alpha-275) |
| The C# half | [Design](domql-design.md#the-c-half) | Waits for its design | — |

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

**Waits for its design.** The C# half is out of the current work until it is designed, as [D46](decisions.md#d46) records; the outline below is where its design starts.

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

1. **The host side.** Change sets against an acknowledged result and a refresh that delivers (A2, A3), modules loaded on request (A4) and ordered delivery (A5).
2. **Presentation.** Ownership of written styles and classes against a framework (A10) and the frame promise (T2).
3. **Dialogs and frames.** Ordered executions (T3).
4. **The remaining facilities.** Reactions in the browser (A7).
5. **Editing and data views.** Source elements for a local consumer (A8), and the timing of an immediate watch (T1).

<a id="planned-vocabulary"></a>

### Vocabulary

None remains: V1 to V18 are implemented, as [the features](#the-doms-vocabulary) show, or declined where [the decisions](decisions.md) say why: `checkVisibility({ visibilityProperty: true })` ([D14](decisions.md#d14)), `hasText` ([D15](decisions.md#d15)), `follows(other)` ([D22](decisions.md#d22)) and `Document.documentElement` ([D23](decisions.md#d23)).

<a id="planned-events"></a>

### Events

None remains: E1 to E9 are implemented, as [the features](#the-doms-vocabulary) show. What their decisions settled:

- `on` takes a `Listening` option for the capture phase ([D27](decisions.md#d27)).
- A click shares `PointerEvent` with the pointer events ([D28](decisions.md#d28)).
- `touchend` and `touchcancel` are declined, since pointer events cover them ([D29](decisions.md#d29)).
- `focus` and `blur` are each a `FocusEvent` ([D30](decisions.md#d30)).
- Every event carries its time, its cancellation and its path ([D33](decisions.md#d33)).

<a id="planned-observation"></a>

### Observation

Page-wide module state needs nothing new: it is a member of a module's extension of `Document`, observing its receiver, and the module keeps it by its document, as [state per document](../spec/vocabulary.md#extension-modules-state-per-document) has it.

None remains: O1 to O4 and O6 are implemented, as [the features](#the-doms-vocabulary) show: O2 observes what a selector reads rather than the receiver's subtree ([D26](decisions.md#d26)), O3 is the `frame` observation ([D56](decisions.md#d56)), O4's autofill observation is declined, since it would write a stylesheet into the page ([D17](decisions.md#d17)), and O6 is a body's local reading what a member misses ([D19](decisions.md#d19)).

<a id="planned-executions"></a>

### Executions

None remains: X1 to X10 are implemented, as [the features](#the-doms-vocabulary) show. Three are named apart from DOMQL's Boolean functions `focus()`, `clipboard()` and `share()`: `takeFocus`, `writeClipboard` and `requestShare`. What their decisions settled:

- Focusing answers whether focus landed ([D34](decisions.md#d34)).
- A scroll is logical and answers once it has ended ([D35](decisions.md#d35)).
- The top layer's executions answer whether they changed it ([D36](decisions.md#d36)).
- A pointer's capture answers whether the element holds it ([D37](decisions.md#d37)).
- An owned write says whether it restores and keeps its value ([D38](decisions.md#d38)).
- A form control's writes answer what they changed ([D39](decisions.md#d39)).
- The browser's facilities answer how the browser took the request, and `readClipboardText` is declined beside `readClipboard` ([D40](decisions.md#d40)); `writeCookie` is declined ([D41](decisions.md#d41)).
- `dispatch` answers whether a listener cancelled its event ([D42](decisions.md#d42)).
- The document's selection places itself ([D43](decisions.md#d43)).
- A chosen file's source is built in, its object URL the execution's own ([D44](decisions.md#d44)).

<a id="planned-extension-contract"></a>

### The extension contract

A behavior's occurrences, state, commands and owner (C1 to C4), and reactions in the browser (A7), are DOMQL's, never the language's: the language knows who invokes a function and nothing of its lifecycle.

| | Addition |
| --- | --- |









<a id="planned-api-and-host"></a>

### API and host

| | Addition |
| --- | --- |
| A1 | **The C# half,** waiting for its design, as [outlined](#the-c-half): typed queries mapped onto records, watches, once and continuous executions and subscriptions, with failures reported, never discarded. Its acknowledgement follows the application of an update, never the application's handlers |
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

**Current:** DOMQL depends on `@formaui-net/nexo` through `file:.nexo`, which the build fills with Nexo at the commit `nexo.commit` pins, `e989dee`, taken from a checkout beside this one named `formaui-net.Nexo`, or links to the checkout `NEXO_SOURCE` names; CI checks Nexo out at the same commit. It imports the language's entry point alone, and bundles it into `domql.js`. The language's tests that run through DOMQL's entry point are DOMQL's integration tests.

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
| Editor tooling | Waits for Nexo's design | Nexo's, through its syntax tree, in its [tooling](https://github.com/FormaUI/Nexo/blob/main/docs/features-status.md#tooling), which waits for its design |

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
