# Decisions

Decisions taken without stopping to ask, kept here so they can be reviewed and reversed.

- Each entry says what was decided, why, and what was declined.
- A rule a decision settles is stated in the [specification](../spec/README.md) or the [design](domql-design.md) too.
- Ideas considered and not adopted, with the measurements that decided them, are the design's [decisions not taken](domql-design.md#decisions-not-taken).

Each entry is one of three kinds:

| Kind | Meaning |
| --- | --- |
| Contract | A rule of DOMQL's contract, which the specification states |
| Design | How DOMQL is built, which the design states |
| Process | How DOMQL's records, versions and repositories are kept |

<a id="d1"></a>

## D1 — Platform changes are built in, policies are modules'

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** A change to the page is one of DOMQL's built-in executions where it is one platform call with a platform result: focusing, scrolling, showing a popover or a dialog, capturing a pointer, writing the clipboard. A change that carries a policy is a module's: stepping to a stop, placing a surface, a gesture, roving focus.
- **Why:**
  - Every application needs the generic half, and writes it the same way.
  - A policy differs between applications, and DOMQL stays independent of any of them.
- **Declined:**
  - Leaving every execution to modules, which would have each application declare `focus()` again.
  - Building policies in, which would make DOMQL one application's library.

<a id="d2"></a>

## D2 — `on` stays passive

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** A subscription never cancels its event. Cancelling an event, consuming a key, claiming a click and capturing a pointer stay synchronous, inside a module's own listeners. `on` listens in the capture phase too, for observing alone ([E1](features-status.md#planned-events)).
- **Why:**
  - A subscription projects its event and delivers it to a caller, who may be across an interop boundary. Cancelling must be decided before the native dispatch ends, before any caller sees the event.
  - An input owner that decides who acts on an event needs every cancellation to go through it, which a cancelling `on` would bypass.
- **Declined:** An `on` option that cancels where a predicate holds: the predicate would run inside the dispatch, which is a module's listener by another name.

<a id="d3"></a>

## D3 — A behavior's occurrences are its module's event sources

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** A behavior reports what happens as an event source its module declares, bound to the running continuous execution of the same owner on the same receiver ([C1](features-status.md#planned-extension-contract)). A subscription to it outlives the execution's replacement and release, and delivers in the order the behavior reports, never coalesced.
- **Why:**
  - Every behavior that reports needs one shape: drops, moves, placements, selections, editor changes.
  - Subscribing apart from running lets a caller replace a behavior's options without losing occurrences, and start listening before the behavior starts.
- **Declined:**
  - A continuous execution's handle raising events of its own, which ends with the execution, so a replacement loses what happens in between.
  - A subscription per execution handle, which couples the caller's listening to the behavior's lifetime.

<a id="d4"></a>

## D4 — A query writes its imports

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** Every query imports `Domql`, which DOMQL supplies, and writes its other imports. An application configures no imports of its own.
- **Why:** A query's text then means the same in every application, and a definition records every import it needs, so it can be carried between instances and checked alone.
- **Declined:** Imports an application configures for every query, which would make one text mean different things in two applications, and hide what a definition depends on.

<a id="d5"></a>

## D5 — No flat-tree parent

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** DOMQL declares no parent across slots. A query follows the tree's own `parent` and `root`, and crosses shadow roots explicitly.
- **Why:**
  - The work that walks the flat tree, focus order across slots among it, runs inside a module's listeners, which read the platform directly and decide synchronously.
  - No query a consumer needs reads a slotted element's flat-tree parent.
- **Declined:** A `flatParent` beside `parent`, whose meaning changes as slots are assigned, with no consumer to settle how a watch observes that.
- **Reopened by:** a query that must follow an element through the slot it is assigned to.

<a id="d6"></a>

## D6 — A consumer's analysis lives with the consumer

*November 1, 2026*

- **Kind:** Process.
- **Decision:** The account of what one application needs of DOMQL lives in that application's repository. DOMQL's status lists the capabilities by identifier, without naming a consumer.
- **Why:** DOMQL stays independent of its consumers, as its working rules require, and an application's analysis changes with that application.
- **Declined:** Keeping the analysis in DOMQL's documents, where it was until the documents were cleaned up.

<a id="d7"></a>

## D7 — A host call's request is read from Nexo's candidates

*November 1, 2026*

- **Kind:** Design.
- **Decision:** What a host call on a receiver of unknown type requests is read from the candidates Nexo answers for it, through DOMQL's dispatch table. A watch is checked against Nexo's candidate declarations, every declaration a member of a value of `Any` could select.
- **Why:** DOMQL's own index of host calls by name counted calls a query could not reach, and its watch check missed members a value of `Any` selects. Nexo already decides both.
- **Declined:** Repeating Nexo's lookup in DOMQL, which drifts from the language's rules.
