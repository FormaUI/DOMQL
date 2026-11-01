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

<a id="d8"></a>

## D8 — Measurements of layout compare within a twentieth of a pixel

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** Every member that measures layout in CSS pixels declares a tolerance of 0.05: `rect`, `clientRect`, `rectRelativeTo`, `size`, `clientSize`, `scroll` and `grid` of an element, and `size` and `scroll` of the window.
- **Why:**
  - It is more than a unit of the browser's layout, 1/64 of a pixel in Chromium and WebKit and 1/60 in Firefox, so a box settling by one, and the rounding of `left` plus `width`, report nothing.
  - It is less than a device pixel at any ratio a screen has, so a move anyone can see is reported. A watch compares with the measurement it last reported, so small steps are reported once they add up.
  - Nexo takes a tolerance on a structured result and applies it to every number it holds, the parts of a nested one included, so `scroll` declares one tolerance for `Scroll { inline, block }`, and a part a query reads alone, as `it.scroll?.block.offset`, keeps it. A watch test settles it.
  - Every measurement of layout takes it, `rectRelativeTo`, `clientRect`, `grid` and the window's members among them, so one concept has one contract.
- **Declined:**
  - Half a pixel, which absorbs the jitter of rounding but loses a move a screen of ratio 2 shows.
  - A tolerance on the members the plan named alone, which would compare one measurement two ways.
  - A tolerance on values read from computed style, which a stylesheet decides and layout never moves.

<a id="d9"></a>

## D9 — `scroll` is logical, its offset measured from its scroll origin

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `scroll` answers `Scroll { inline, block }`, each a `ScrollAxis { offset, extent, viewport }`, along the axes of the box's writing mode. `offset` is the browser's scroll position without its sign, so it is measured from the scroll origin, the start of the content. `extent` is the scrolling area's size and `viewport` the scrollport's, its padding box without scrollbars.
- **Why:**
  - Under RTL, and in a vertical writing mode whose lines run right to left, browsers answer a scroll position from 0 down to the negative of its range. The offset from the origin is the same number in every direction, so a query asks `it.inline.offset > 0` whatever the direction.
  - The inline axis is the one a list of chips or tabs scrolls along, whatever the writing mode, so a query names the axis it means.
  - `viewport` keeps the plan's name: the scrollport is the viewport of its scroll container in CSS's own terms.
- **Declined:**
  - Physical `x` and `y`, which make every query that handles RTL or a vertical writing mode compute the offset itself.
  - An offset from the inline start where the browser places the scroll origin at the end, as in a reversed flex container: the browser's own origin is the start of the content there, and computing another needs the box's alignment, which no API answers.

<a id="d10"></a>

## D10 — `scrollContainer` finds what the user can scroll

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `scrollContainer({ axis })` answers the nearest flat-tree ancestor whose computed overflow along the axis is `auto` or `scroll`, either axis where `axis` is omitted or null, and null where none is. The root element, and the body while the root's overflow is `visible`, give their overflow to the viewport and are never answered.
- **Why:**
  - Its uses are dragging that scrolls a list and a virtualized list measuring its scrollport, which need the box the user scrolls. A box that hides its overflow is a scroll container in CSS's terms, but no user scrolls it.
  - A slotted element is laid out in its slot's box, so the walk follows the flat tree, as `inert` does for `textEditable`.
  - A box whose overflow is not `visible` along one axis computes `visible` as `auto` along the other, so the axis matters where the other is `hidden`, as in a vertical list with `overflow-x: hidden`. A browser test settles it.
- **Declined:**
  - Following the containing block, so a fixed-position element answers none: no API answers which box scrolls a positioned element, and a consumer that positions one knows it.
  - `hidden` counted as scrollable, which would let a drag scroll a box its author clipped.

<a id="d11"></a>

## D11 — The `children` target follows its child list itself

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** DOMQL declares the observation target `children`, each child element of the receiver, and observes the receiver's child list wherever a member observes it, as it observes each root's structure for `roots`. A `resize` of a document observes the document's root element.
- **Why:**
  - A member that observes each child needs the children that come and go observed too. Doing it for every such member, as `roots` does, keeps an extension module's declaration from having to repeat it.
  - The window's scrolling area grows as the document's root element does, and a document has no box of its own, so its size is its root element's.
- **Declined:**
  - Declaring the child list beside `children` in every member, which an extension module could leave out and miss every child added.
  - A target for the document's root element, a sixth target for one member.
