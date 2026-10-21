# Features Status

What this repository implements today, what is being built, and what remains. The [specification](../spec/README.md) is the contract and the [design](domql-design.md) the architecture; this document tracks how far the implementation has come. The language is Lexica's, and [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md) tracks it.

The implementation follows DOMQL's specification version `1.0.0-alpha.276`, and runs on a Lexica runtime that follows language version `1.0.0-alpha.32`; the specification describes `1.0.0-alpha.277`, on Lexica's language version `1.0.0-alpha.33`, whose types and members version 32's third slice builds. **DOMQL reads definition version 32**: its queries write the implicit parameter `it`, and read the document and the window through its module, as `domql.document` and `domql.window`. [Definition version 32](#definition-version-32) sets out what of it remains.

| Status | Meaning |
| --- | --- |
| Implemented | Built, tested in the gate, and as the specification and the design state |
| Partial | Usable, with the parts named in its row still missing |
| In progress | Being built now |
| Planned | Accepted and not started |
| Deferred | Not planned until the need its row names appears |

## Overview

### The DOM vocabulary

| Area | Status | What remains | Contract |
| --- | --- | --- | --- |
| Nodes and shadow trees | Partial | The node types are still built into Lexica, recognized by `nodeType`; DOMQL declares them as its reference types, recognized by its `typeOf`, in slice 3 | [Nodes and shadow trees](../spec/nodes-and-shadow-trees.md) |
| Properties, functions and Boolean functions | Implemented | | [Built-in vocabulary](../spec/vocabulary.md) |
| Conversions | Implemented | | [Built-in conversions](../spec/vocabulary.md#built-in-conversions) |
| Event sources and event types | Implemented | | [Events](../spec/events.md#event-sources) |
| Observation types | Implemented | | [Observation types](../spec/vocabulary.md#observations-types) |
| `domql.document` and `domql.window` | Implemented | | [Module members](../spec/vocabulary.md#module-members) |
| Observation targets DOMQL declares and resolves | Implemented | | [Observation targets](../spec/vocabulary.md#observations-targets) |
| Extension modules | Partial | Types declaring their members, extension blocks and owner precedence, which come with slice 3 | [Extension modules](../spec/vocabulary.md#extension-modules) |

### The host

| Area | Status | What remains | Contract |
| --- | --- | --- | --- |
| Queries from text or a definition, `with`, `select` and `resolve` | Implemented | | [Queries](../spec/queries.md) |
| `evaluate` and `evaluateAsync` | Implemented | | [Evaluation](../spec/evaluation.md) |
| Watches, their dependencies and partial observation | Implemented | | [Watches](../spec/watches.md) |
| Snapshots, live state and change sets | Implemented | | [Results](../spec/results.md) |
| Subscriptions | Implemented | | [Events](../spec/events.md#subscribing) |
| Once and continuous executions | Implemented | | [Executions](../spec/executions.md) |
| Handles and their events, lifetimes and errors | Implemented | | [The API](../spec/api.md) |

### Delivery

| Area | Status | What remains | Contract |
| --- | --- | --- | --- |
| The JavaScript bundle and its TypeScript declarations | Implemented | Lexica is bundled inside `domql.js` | [README](../README.md#build-and-try-it) |
| Consuming Lexica | Partial | See [consuming Lexica](#consuming-lexica) | |
| npm and NuGet packages | Planned | Packed locally and not published | [Consuming Lexica](#consuming-lexica) |
| Beta | Partial | The documents and the module API are audited; the changelog and the beta version remain | [Beta](#beta) |
| The C# half | Planned | Not started; its API and its synchronization are designed | [The C# half](domql-design.md#the-c-half) |
| Editor tooling | Planned | Lexica's, through its syntax tree | [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md) |

**Verification outside the gate.** `domql.window.size` following a scrollbar that appears or goes is shown only by an experiment outside the gate, since the gate's Chromium hides scrollbars; a browser test with a launch of its own would bring it in without changing the other tests' geometry. Performance is measured outside the gate too, by `npm run bench` and `npm run scale` from `tests/`.

## Definition version 32

Version 32 is built in Lexica and DOMQL together, in three slices; [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#definition-version-32) tracks the whole. DOMQL's part of each:

| Slice | Status | DOMQL's part |
| --- | --- | --- |
| 1. The declaration shape | Implemented | Its vocabulary declared in the new shape, its implementations taking one object |
| 2. The version 32 definition | Implemented | `domql.document` and `domql.window` as module members of `domql`; its observation targets, `window`, `document`, `root` and `roots`, declared and resolved by its own observations, which are built; its tests as Boolean functions, which the verbs are given by reference; its queries, examples, READMEs and guide moved to `it`, `domql.document` and `domql.window` |
| 3. Types and their members | Planned | Its vocabulary in Lexica's declaration shape, its types named in PascalCase, `on` one declaration in each of `Element`, `Document` and `Window`; its reference types `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, `Window`, and the views `Shadow` and `Aria`, recognized by its `typeOf` and checked by each `isInstance`, the views given by `shadow` and `aria` alone; its cast from `Aria` to `Element`; `domql.query` binding through its registry, its bindings captured when a query is made; its scale workloads measuring binding and repeated evaluation; and the comparer matching items by identity only where both lists give a unique, non-null reference source for every item, and by position otherwise, arriving with Lexica's general sources |

**Next step.** Slice 3, built step by step with Lexica's, as [Lexica's status](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#definition-version-32) lists its steps: DOMQL's vocabulary moves to the declaration shape with the first, and declares its reference types with the second.

## Host calls and executions

DOMQL carries out Lexica's [host calls](https://github.com/FormaUI/Lexica/blob/main/docs/features-status.md#host-calls) as the specification describes them: an event source and the executions are host calls, whose request kinds, execution modes and implementations DOMQL keeps in a catalog of its own, carried out by `subscribe`, `executeAsync` and `run`.

**What works.** `domql.createModule` keeping each host call's request kind, execution mode and implementation, and refusing a missing or unknown request kind, an execution without its mode, an event source given one or declaring no result, either field on a function the evaluator invokes, and a result on a continuous execution; `on` as a host call whose fixed `type` selects through DOMQL's type selector `event`, its event types the selector's keys; each operation reading the resolution's host call, looking its declaration up in the catalog, by its name on a receiver of unknown type, and preparing it through `prepareCall`; and `run` answering a `DomqlExecutionHandle`. The library guide and the README describe executions, and the declarations type them.

## Consuming Lexica

DOMQL depends on `@formaui/lexica` through `file:../formaui-net.Lexica`, a local link to a checkout beside this one, imports Lexica's entry point alone, and bundles it into `domql.js`. Lexica's tests that run through DOMQL's entry point are DOMQL's integration tests.

**Remaining.**

1. Depend on a released Lexica, its NuGet and npm packages, each of an exact version.
2. Write the NuGet bundle with `../lexica/lexica.js` as an import, and the npm bundle with `@formaui/lexica`, rather than carrying Lexica inside.
3. Have the gate check that DOMQL's packages depend on Lexica's and Lexica's on nothing of DOMQL's, and run DOMQL's tests against the packaged Lexica.
4. Add a `LEXICA_SOURCE` setting that points DOMQL at a local checkout for coordinated changes.

Needs Lexica's packages, which need version 32 complete.

## Beta

The beta makes the language and the JavaScript API ready for external use: no breaking redesign is planned, the remaining limitations are documented, and a breaking change after it is recorded with migration guidance.

**Done.** The documents and the module API are audited, and a cast inside an optional enclosed access is settled.

**Remaining.** `CHANGELOG.md`, empty until the first change after the beta; the version `1.0.0-beta` wherever a version is written or checked, the package numbered `1.0.0-beta.N`.

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
