# Features Status

## Current state

**DOMQL's vocabulary, queries, watches, events and executions are implemented on Lexica's definition version 32. The next task is DOMQL's part of Lexica's new type and member declaration model.** Declaring the DOM as DOMQL's own reference types, its view cast, and matching by projection sources follow it.

| Version | Implementation | Specification |
| --- | --- | --- |
| DOMQL specification | `1.0.0-alpha.276` | `1.0.0-alpha.277` |
| Lexica language | `1.0.0-alpha.32` | `1.0.0-alpha.33` |
| Definition format | 32 | 33 |

DOMQL's queries write the implicit parameter `it` and read the document and the window through its module, as `domql.document` and `domql.window`. Its vocabulary still uses Lexica's flat member declarations, and its node types are still built into Lexica. The specification describes the replacement, but that work has not started; it follows Lexica's steps one by one.

The bundle and type declarations are built, with Lexica bundled inside `domql.js`. npm and NuGet packages are packed locally but unpublished. The C# half is designed and not started.

**Next:** [Step 1 — DOMQL's declarations](#next-domqls-declarations), with Lexica's [step 1](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#next-type-and-member-declarations). One [open decision](#open-decisions), a flat-tree parent, does not block this work.

The [specification](../spec/README.md) defines the contract; the [design](domql-design.md) explains the architecture. The language is Lexica's, and [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md) tracks it. This file tracks DOMQL's implementation and its remaining work. "Implemented" means built and tested in the gate for the current implementation version; it does not imply that later specification changes are implemented.

## Next: DOMQL's declarations

**Step 1 — Planned, not started.** Move DOMQL's vocabulary to Lexica's declaration model, as Lexica's step 1 delivers it, and read definition version 33.

- Declare each of DOMQL's types with its members, its structured types' fields among them, its indexers as the `indexer` kind, with a `name` for a named indexer and without one for a type's unnamed indexer, and `impl`.
- Move DOMQL's indexer and computed property forms to Lexica's: `:attribute[…]`, `:class[…]`, `:media[…]` and `:style[…]` to `.attribute[…]`, `.class[…]`, `.media[…]` and `.style[…]`, `:item[…]` and `:[…]` to a type's unnamed indexer, `[…]`, and a property read by a computed name from `[…]` to `.[…]`, in its specification, queries, examples, READMEs and guide.
- Name its types in PascalCase: `Element`, `Size`, `Rectangle`, `PointerEvent` and the rest.
- Declare `on` once in each of `Element`, `Document` and `Window`, the receivers it listens on, reusing one JavaScript declaration.
- Accept a cast or a conversion naming a type qualified by its module, as `panel as domql.Element`, and move DOMQL's queries, examples, READMEs and guide to the PascalCase type names.

**Completion:** DOMQL's vocabulary in the new shape and its queries on definition version 33 pass the gate, browser tests included.

Contracts: [Built-in vocabulary](../spec/vocabulary.md), [Types](../spec/vocabulary.md#vocabulary-types), [Extension modules](../spec/vocabulary.md#extension-modules).

## Remaining implementation sequence

All steps below are **planned, not started**. Each follows the Lexica step of its number and passes DOMQL's gate, browser tests included.

| Step | Work | Outcome |
| --- | --- | --- |
| 2 | Reference types and bindings | DOMQL declares and recognizes its own node types, window and views; Lexica's built-in DOM types are gone |
| 3 | The view cast | `Aria` casts back to `Element` |
| 4 | Ownership | Extension modules follow owner precedence on DOMQL's types |
| 5 | Internal declarations | DOMQL follows Lexica's visibility rules; nothing of its own changes |
| 6 | Projection sources | The comparer matches items by identity only where the sources are references |
| 7 | Specification examples | Lexica's own; DOMQL has no part in it |

### Step 2 — Reference types and bindings

Declare `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, `Window`, and the views `Shadow` and `Aria`. DOMQL's `typeOf` recognizes a bound node as its kind and the window as `Window`, and each type's `isInstance` checks membership. The views are given by an element's `shadow` and `aria` alone. Text and comment nodes are refused as bindings.

Bind through DOMQL's registry when a query is made, keeping the bindings that query captured.

Measure binding and repeated evaluation with DOMQL's scale workloads before Lexica caches any membership answer.

Contracts: [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md), [Types](../spec/vocabulary.md#vocabulary-types).

### Step 3 — The view cast

Declare the cast from `Aria` to `Element`, without an `impl`, so `(panel.aria as Element).aria` reads the element's view again. An `Element` still can't be cast to either view.

Contract: [Types](../spec/vocabulary.md#vocabulary-types).

### Step 4 — Ownership

Let extension modules declare members on DOMQL's types under Lexica's owner precedence: DOMQL's own member wins, one extension resolves, and competing extensions both register and are refused only where a query uses them ambiguously.

Contract: [Extension modules](../spec/vocabulary.md#extension-modules).

### Step 6 — Projection sources

Match a list's items by identity only where both lists give a unique, non-null reference source for every item, and by position otherwise. Check it against reordered and duplicate references, repeated equal data values and null inputs.

Contract: [Results](../spec/results.md).

## Release work

Complete the types and members work, in Lexica and DOMQL, before publishing packages.

### Consuming Lexica

**Current:** DOMQL depends on `@formaui/lexica` through `file:../formaui-net.Lexica`, a local link to a checkout beside this one, imports Lexica's entry point alone, and bundles it into `domql.js`. Lexica's tests that run through DOMQL's entry point are DOMQL's integration tests.

**Remaining:**

1. Depend on a released Lexica, its NuGet and npm packages, each of an exact version.
2. Write the NuGet bundle with `../lexica/lexica.js` as an import, and the npm bundle with `@formaui/lexica`, rather than carrying Lexica inside.
3. Have the gate check that DOMQL's packages depend on Lexica's and Lexica's on nothing of DOMQL's, and run DOMQL's tests against the packaged Lexica.
4. Add a `LEXICA_SOURCE` setting that points DOMQL at a local checkout for coordinated changes.

Needs Lexica's packages, which need Lexica's types and members work complete.

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

This work is separate from the implementation sequence above. No order is assigned here.

| Work | Status | Remaining |
| --- | --- | --- |
| The C# half | Planned | Not started; its API and its synchronization are [designed](domql-design.md#the-c-half) |
| Editor tooling | Planned | Lexica's, through its syntax tree, as [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md) tracks it |

**Verification outside the gate.** `domql.window.size` following a scrollbar that appears or goes is shown only by an experiment outside the gate, since the gate's Chromium hides scrollbars; a browser test with a launch of its own would bring it in without changing the other tests' geometry. Performance is measured outside the gate too, by `npm run bench` and `npm run scale` from `tests/`.

## Implemented capabilities

These capabilities work in the current implementation. The planned replacements and remaining limitations are described above.

### The DOM vocabulary

| Area | Implemented | Contract |
| --- | --- | --- |
| Nodes and shadow trees | Nodes, their kinds and shadow trees, the node types built into Lexica until step 2 | [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md) |
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

The first two slices of Lexica's version 32 plan, and DOMQL's part of each, are complete. The unfinished third slice is now the [types and members sequence](#next-domqls-declarations).

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
