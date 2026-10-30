# Version history

Each version of DOMQL, newest first, with the features it added and what it changed. A version names DOMQL's contract, its [specification](spec/README.md): the DOM's vocabulary, the module that declares it, and DOMQL as the host that carries queries out. The language is Lexica's, so each entry also names the Lexica language version and definition format it describes.

- Each version is dated by the day the specification first described it.
- A change stands in the first version whose implementation follows it. A version the specification describes ahead of the implementation says so, and says which of its changes the implementation has already.
- Until the beta, a version may break what the one before it allowed, and each entry says what it breaks.

<a id="v1-0-0-alpha-277"></a>

## `1.0.0-alpha.277`

*October 22, 2026 · Lexica language `1.0.0-alpha.33` · definition format 33 · implemented in part*

**Vocabulary**

- [Nodes](spec/nodes-and-shadow-trees.md#nodes): DOMQL declares the DOM as reference types of its own, which it recognizes and checks: `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, and `Window`. Text and comment nodes are refused as bindings.
- [Types](spec/vocabulary.md#vocabulary-types): the views `Shadow` and `Aria` are types, and `Aria` casts back to its element. Every type is named in PascalCase, as `Element`, `Size` and `PointerEvent`.
- [Extension modules](spec/vocabulary.md#extension-modules): a module names DOMQL's types qualified by its module, as `domql.Aria` and `domql.Rectangle`.

**Queries**

- [Queries](spec/queries.md#a-query-at-a-glance): queries write Lexica's indexer forms. A named indexer is `panel.attribute["id"]`, a type's unnamed indexer `panel["data-key"]`, and a property read by a computed name `panel.[name]`.

**Implemented so far:** the PascalCase type names and the indexer forms. The declared node types arrive with the [migration's first checkpoint](docs/features-status.md#migration-to-nexo).

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
