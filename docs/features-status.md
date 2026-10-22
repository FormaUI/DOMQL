# Features Status

## Current state

**DOMQL's vocabulary, queries, watches, events and executions are implemented on Lexica's definition version 33. DOMQL builds against a pinned Lexica commit, [part 0](#part-0--a-pinned-lexica) of the [implementation plan](#implementation-plan), so it migrates once at each of its three checkpoints; the next is [checkpoint 1](#checkpoint-1--declarations-and-the-runtime), once Lexica's units 1 and 2 land.**

| Version | Implementation | Specification |
| --- | --- | --- |
| DOMQL specification | `1.0.0-alpha.276` | `1.0.0-alpha.277` |
| Lexica language | `1.0.0-alpha.33` | `1.0.0-alpha.33` |
| Definition format | 33 | 33 |

DOMQL's queries write the implicit parameter `it` and read the document and the window through its module, as `domql.document` and `domql.window`. Its queries write Lexica's indexers and computed properties, `panel.attribute["id"]`, `panel["id"]` and `panel.[name]`, but its vocabulary still uses Lexica's flat member declarations, and its node types are still built into Lexica. The specification describes the replacement, which the plan's checkpoints deliver.

The bundle and type declarations are built, with Lexica bundled inside `domql.js`. npm and NuGet packages are packed locally but unpublished. The C# half is designed and not started.

The [specification](../spec/README.md) defines the contract; the [design](domql-design.md) explains the architecture. The language is Lexica's, and [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md) tracks it. This file tracks DOMQL's implementation and its remaining work. "Implemented" means built and tested in the gate for the current implementation version; it does not imply that later specification changes are implemented.

## Implementation plan

DOMQL follows [Lexica's implementation plan](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#implementation-plan), whose units are grouped by the code they rewrite.

- **Three migration checkpoints.** DOMQL builds against a pinned Lexica commit, so Lexica's stages land without breaking it, and migrates once after Lexica's unit 2, once after its unit 3, and once after its unit 4; the release then changes how it consumes Lexica, through the published packages. Each checkpoint moves every aspect it touches to its final form, and passes DOMQL's gate, browser tests included, on the Lexica commit it pins.
- **Breaking changes are made directly,** without compatibility layers, migration notes or deprecations, until the beta.
- **Documents move with their checkpoint.** The READMEs, the library guide, the specification, the type declarations and this file change in the checkpoint that changes what they describe.

| Part | Follows | Work | State |
| --- | --- | --- | --- |
| 0 | — | [A pinned Lexica](#part-0--a-pinned-lexica) | ✅ Done |
| 1 | Lexica's units 1 and 2 | [Declarations and the runtime](#checkpoint-1--declarations-and-the-runtime) | Planned |
| 2 | Lexica's unit 3 | [Script text and imports](#checkpoint-2--script-text-and-imports) | Planned |
| 3 | Lexica's unit 4 | [Collections in results](#checkpoint-3--collections-in-results) | Planned |
| 4 | Checkpoint 3 | [The C# half](#part-4--the-c-half) | Planned |
| Release | Lexica's unit 7 | [Release work](#release-work) | Planned |

### Part 0 — A pinned Lexica

✅ **Done.** DOMQL builds against Lexica at the commit `lexica.commit` pins, locally and in CI, so Lexica's stages land without reaching it until the pin moves; `LEXICA_SOURCE` links a Lexica checkout's working tree instead, for a change made in both. `CLAUDE.md` and `CONTRIBUTING.md` describe both, and the README names definition version 33.

### Checkpoint 1 — Declarations and the runtime

DOMQL's vocabulary and its use of Lexica's runtime move once, on Lexica's unit 2 commit.

- **Its vocabulary, rewritten once:**
  - Each type with its members, its structured types' stored properties among them, its indexers as the `indexer` kind, with a `name` for a named indexer and without one for a type's unnamed indexer, and `impl`.
  - `on` declared once in each of `Element`, `Document` and `Window`, the receivers it listens on, reusing one JavaScript declaration.
  - `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, `Window`, and the views `Shadow` and `Aria`, given by an element's `shadow` and `aria` alone. DOMQL's `typeOf` recognizes a bound node as its kind and the window as `Window`, each type's `isInstance` checks membership, and text and comment nodes are refused as bindings.
  - The cast from `Aria` to `Element`, without an `impl`, so `(panel.aria as Element).aria` reads the element's view again; an `Element` still can't be cast to either view.
  - The module named `Domql`, so its queries read `Domql.document`, `Domql.window` and `panel as Domql.Element`; the package, its file `domql.js` and the product keep their names.
- **Diagnostic codes.** DOMQL's own conditions take `DOMQL` codes, with a catalog in its specification, bounded to the conditions it reports today; a Lexica error passing through DOMQL keeps its Lexica code and takes no second, DOMQL one.
- **Its catalog of host calls** reading types' and extensions' members and `impl`, a JavaScript declaration reused across types mapping each declaration Lexica makes of it.
- **Binding through DOMQL's registry** when a query is made, keeping the bindings that query captured. Binding and repeated evaluation are measured with DOMQL's scale workloads before Lexica caches any membership answer.
- **Ownership and visibility.** Extension modules declare members on DOMQL's types under Lexica's owner precedence: DOMQL's own member wins, one extension resolves, and competing extensions both register and are refused only where a query uses them ambiguously. DOMQL follows Lexica's visibility rules, and nothing of its own changes for them.
- **Deferred selection.** Admission and observation stay two mechanisms:

  | Mechanism | Purpose |
  | --- | --- |
  | The used declarations, and the candidate declarations of each deferred access | Decide, before a watch starts, whether the query satisfies the watch's observation policy |
  | `beforeInvoke` | Establish observations for the receivers and arguments evaluation actually reaches |

  A watch checks the combined declarations under the existing rules: an unobserved member is refused, a partly observable one requires `acceptPartialObservation`, and constant, observable and derived members follow their contracts. It starts no observation for a candidate, and its dependencies remain what each evaluation reads, refreshed on each one. Candidates are an overestimate, so a watch can be refused for a declaration its values never select; that refusal names the deferred access and the candidates at fault, and says to make the receiver's type known or to select its extension explicitly. Refusals stay findable before a watch starts. `resolve` reports the deferred accesses, and a host call on a receiver whose type is known only during evaluation is refused before anything is invoked.
- **Projection sources.** `SnapshotComparer` and `SnapshotPatcher` match a list's items by source identity only where both lists give a unique, non-null source that Lexica classifies as a reference for every item, and by position otherwise, checked against reordered and duplicate references, repeated equal data values and null inputs. DOMQL reads the classification Lexica reports, never inferring it from `typeof`, JavaScript identity, a DOM check or another recognition.
- **Tests:** every test module in Lexica's final shape and named in PascalCase, conversions declared as operators, and the registration's refusal of competing extensions replaced by ambiguity where a query uses them.
- **Documents:** the watches document's admission by candidate declarations; the specification's extension shape and `impl`; its heading for `is`, `has` and `supports` named apart from Lexica's `Any`; the results document and the design no longer saying sources come from elements; and the NuGet README's module examples and their fixtures.

**Completion:** DOMQL's vocabulary in the final shape, bound and typed by its registry, passes the gate, browser tests included, on Lexica's unit 2 commit.

Contracts: [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md), [Types](../spec/vocabulary.md#vocabulary-types), [Extension modules](../spec/vocabulary.md#extension-modules), [Results](../spec/results.md).

### Checkpoint 2 — Script text and imports

DOMQL's queries move to Lexica's script text once, on Lexica's unit 3 commit.

- **Imports.** DOMQL supplies `Domql` as every query's import. An application configures further imports once, which apply to every query, and a query may write its own, an identical import counting once. The same effective imports apply to parsing, resolution and caching, and formatting writes a definition's imports but those a caller names as supplied by the destination. Registering a module adds nothing to an existing query's imports and makes no lookup of it ambiguous.
- **Definition version 34.** DOMQL's definitions, tests and type declarations record imports and the extensions explicit accesses select, and a host call reached through an extension access is carried out as any other.
- **Versions:** the Lexica language row follows `1.0.0-alpha.34`, and definition format 34.
- **Documents:** the queries and API documents describe imports and the effective imports DOMQL supplies.

**Completion:** DOMQL's queries on definition version 34 pass the gate, browser tests included, on Lexica's unit 3 commit.

Contracts: [Queries](../spec/queries.md), [the API](../spec/api.md).

### Checkpoint 3 — Collections in results

DOMQL's handling of results moves once to Lexica's collections, on Lexica's unit 4 commit.

- **Comparing and patching:** `SnapshotComparer`, `SnapshotPatcher` and live state compare and apply dictionaries, in their exported form `{ entries: [{ key, value }, …] }` and in their order, and pairs, `{ key, value }`, every change set reproducing the next result from its baseline.
- **Addressing:** result paths and selections address the exported forms, a numeric dictionary key never taken for a list index, and say whether a selection follows a position or a key.
- **Matching:** items matched by the sources and the lineage Lexica reports, as [checkpoint 1](#checkpoint-1--declarations-and-the-runtime) matches by sources, DOMQL deciding the policy and Lexica promising no unique correspondence.
- **Documents:** the results document and the API describe dictionaries and pairs in results.

**Completion:** DOMQL's results holding lists and dictionaries pass the gate, browser tests included, on Lexica's unit 4 commit.

Contracts: [Results](../spec/results.md), [Lexica's collections](https://github.com/FormaUI/Lexica/blob/main/docs/proposals/collections.md).

### Part 4 — The C# half

The C# half follows checkpoint 3, so its API is built on the final query text, imports, definition version and result representations, never reworked after them.

- **Its API,** as [the design](domql-design.md#the-c-half) sets out: `Domql.Query` and `Domql.Query<T>` from text or a definition, binding its parameters; `Domql.TryQuery`, answering false with a diagnostic for a syntax or structure failure; and `query.Definition`. A `DomqlQuery<T>` maps a result onto `T` by its declared contract, and a `DomqlQuery` answers a `DomqlSnapshot`.
- **Results:** lists, dictionaries and pairs mapped onto `T` and read through a `DomqlSnapshot` by their exported forms.
- **Imports:** the effective imports checkpoint 2 sets, `Domql` and those the application configures among them, applied as the JavaScript half applies them.
- **Its adapter's synchronization:** live state with its baseline from the first ready event, one update at a time, no partial state, obsolete watches rejected, recovery from uncertainty, and handler failures reported, not retried.
- **One way of applying:** its application of change sets passes the conformance corpus the JavaScript patcher passes too.
- **Diagnostics:** a Lexica error it reports keeps its Lexica code.

**Completion:** the C# half passes the gate, its conformance corpus included.

Contracts: [The C# half](domql-design.md#the-c-half), [keeping a copy of a result](../spec/results.md#results-keeping-a-copy).

## Release work

Complete the implementation plan, in Lexica and DOMQL, before publishing packages.

### Consuming Lexica

**Current:** DOMQL depends on `@formaui/lexica` through `file:.lexica`, which the build fills with Lexica at the commit `lexica.commit` pins, `0e98b3e`, taken from a checkout beside this one, or links to the checkout `LEXICA_SOURCE` names; CI checks Lexica out at the same commit. It imports Lexica's entry point alone, and bundles it into `domql.js`. Lexica's tests that run through DOMQL's entry point are DOMQL's integration tests.

**Remaining:**

1. Depend on a released Lexica, its NuGet and npm packages, each of an exact version.
2. Write the NuGet bundle with `../lexica/lexica.js` as an import, and the npm bundle with `@formaui/lexica`, rather than carrying Lexica inside.
3. Have the gate check that DOMQL's packages depend on Lexica's and Lexica's on nothing of DOMQL's, and run DOMQL's tests against the packaged Lexica.

Needs Lexica's packages, which its [unit 7](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#unit-7--release) publishes.

### Packages

**Current:** packed locally; neither the npm nor the NuGet package is published.

**Remaining:** publish both, once DOMQL consumes a released Lexica.

### Beta

**Current:** the documents and the module API have been audited. The behavior of a cast inside an optional enclosed access is settled.

**Remaining:**

- Add `CHANGELOG.md`, empty until the first change after the beta.
- Set the beta version to `1.0.0-beta` wherever the beta version is written or checked; number packages `1.0.0-beta.N`.

Beta means no breaking redesign is planned and remaining limitations are documented. Breaking changes after beta require migration guidance.

## Backlog

This work is separate from the implementation plan above. No order is assigned here.

| Work | Status | Remaining |
| --- | --- | --- |
| Editor tooling | Planned | Lexica's, through its syntax tree, in its [unit 6](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#unit-6--tooling) |

**Verification outside the gate.** `domql.window.size` following a scrollbar that appears or goes is shown only by an experiment outside the gate, since the gate's Chromium hides scrollbars; a browser test with a launch of its own would bring it in without changing the other tests' geometry. Performance is measured outside the gate too, by `npm run bench` and `npm run scale` from `tests/`.

## Implemented capabilities

These capabilities work in the current implementation. The planned replacements and remaining limitations are described above.

### The DOM vocabulary

| Area | Implemented | Contract |
| --- | --- | --- |
| Nodes and shadow trees | Nodes, their kinds and shadow trees, the node types built into Lexica until [checkpoint 1](#checkpoint-1--declarations-and-the-runtime) | [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md) |
| Members | Properties, functions and Boolean functions | [Built-in vocabulary](../spec/vocabulary.md) |
| Conversions | Lexica's conversions, which DOMQL's queries use | [Built-in conversions](../spec/vocabulary.md#built-in-conversions) |
| Events | Event sources and event types | [Events](../spec/events.md#event-sources) |
| Observations | Observation types, and the observation targets DOMQL declares and resolves | [Observation types](../spec/vocabulary.md#observations-types), [targets](../spec/vocabulary.md#observations-targets) |
| Module members | `domql.document` and `domql.window` | [Module members](../spec/vocabulary.md#module-members) |
| Extension modules | Modules declaring their own types and members, in Lexica's current declaration shape | [Extension modules](../spec/vocabulary.md#extension-modules) |

### The host

| Area | Implemented | Contract |
| --- | --- | --- |
| Queries | From text or a definition, `with`, `select` and `resolve` | [Queries](../spec/queries.md) |
| Evaluation | `evaluate` and `evaluateAsync` | [Evaluation](../spec/evaluation.md) |
| Watches | Their dependencies and partial observation | [Watches](../spec/watches.md) |
| Results | Snapshots, live state and change sets | [Results](../spec/results.md) |
| Subscriptions | Listening to event sources | [Events](../spec/events.md#subscribing) |
| Executions | Once and continuous | [Executions](../spec/executions.md) |
| Handles | Their events, lifetimes and errors | [The API](../spec/api.md) |
| Build | The JavaScript bundle and its TypeScript declarations | [README](../README.md#build-and-try-it) |

### Host calls and executions

**Implemented.** DOMQL carries out Lexica's [host calls](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#host-calls): an event source and the executions are host calls, whose request kinds, execution modes and implementations DOMQL keeps in a catalog of its own, carried out by `subscribe`, `executeAsync` and `run`.

- `domql.createModule` keeps each host call's request kind, execution mode and implementation. It refuses a missing or unknown request kind, an execution without its mode, an event source given one or declaring no result, either field on a function the evaluator invokes, and a result on a continuous execution.
- `on` is a host call whose fixed `type` selects through DOMQL's type selector `event`, its event types the selector's keys.
- Each operation reads the resolution's host call, looks its declaration up in the catalog, by its name on a receiver of unknown type, and prepares it through `prepareCall`.
- `run` answers a `DomqlExecutionHandle`.

The library guide and the README describe executions, and the declarations type them.

Contracts: [Executions](../spec/executions.md), [Events](../spec/events.md), [Host calls DOMQL carries out](../spec/vocabulary.md#extension-modules-host-calls).

### Definition version 32

The first two slices of Lexica's version 32 plan, and DOMQL's part of each, are complete. The unfinished third slice became the [implementation plan](#implementation-plan).

- **The declaration shape:** DOMQL's vocabulary declared in Lexica's one shape, its implementations taking one object.
- **The version 32 definition:** `domql.document` and `domql.window` as module members of `domql`; its observation targets, `window`, `document`, `root` and `roots`, declared and resolved by its own observations; its tests as Boolean functions, which the verbs are given by reference; and its queries, examples, READMEs and guide moved to `it`, `domql.document` and `domql.window`.

## Open decisions

| Decision | State |
| --- | --- |
| A flat-tree parent | A parent across slots, beside the tree's own `parent` and `root`, waits until its uses and its meaning are clear. |

## Deferred

| Work | Why it waits | Reopened by |
| --- | --- | --- |
| A list's change set by its longest increasing subsequence | It would send one operation to move the first item to the end, where today's diff sends one for every other item; today's diff takes at most half a millisecond for 1,000 items in any order, though it can grow quadratically with a large reorder. It is decided by the total cost of generating, delivering and applying a change set, never by generating one alone. | A workload that measures delivering and applying change sets |
| Incremental evaluation | Re-evaluating only what changed saves nothing for the changes lists most often see: `matches`, `all`, `closest` and the ancestry `rect` follows observe a whole tree, and layout, insertion, removal, moving and scrolling invalidate every row. It saves much only for edits of a row's own attributes and class, and is sound only with each selector analysed for what it reads. | A workload that needs that saving |

Decisions considered and not taken, with what would reopen each, are in [the design](domql-design.md#decisions-not-taken).
