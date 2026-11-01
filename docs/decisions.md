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

<a id="d12"></a>

## D12 — `activeElement` is the focused element, through open shadow roots

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `Domql.document.activeElement` answers the element that has focus, descending through each open shadow root a focused host holds, and null where the document reports none, its body or its root element.
- **Why:**
  - The document reports its body while no element has focus, so a query that asks which element has focus would otherwise test for the body itself.
  - Focus restored or kept within a surface needs the element inside a component, not the host the document retargets it to.
  - `focusin` and `focusout` are composed, so focus moving inside a shadow tree reaches the document, and Chromium fires them as a focused element is removed. A browser test settles it, so the member is observable.
- **Declined:**
  - Answering the body as the document does, which makes every query tell "nothing" from a focused body.
  - Stopping at the host, which a query would have to step into by hand, root by root.

<a id="d13"></a>

## D13 — `direction` is what `dir` decides

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `direction` answers `"ltr"` or `"rtl"` as `:dir()` matches, the directionality HTML gives through `dir` along the ancestry, past a shadow host. It observes the `dir` attributes and the structure of the trees its flat-tree ancestry passes through, and misses the text that decides `dir="auto"`, so it is partly observable.
- **Why:**
  - `dir` is how a page sets its direction, the document element's included, and the browser decides `:dir()` without layout, so a detached element answers too.
  - A stylesheet's `direction` stays readable through `style["direction"]`, which is a different question.
  - Following the text under every `dir="auto"` would evaluate a watch again at every keystroke in the document.
- **Declined:**
  - The computed `direction`, which misses an ancestor's `dir` changing since no observation of its own attributes sees it, and answers nothing for a detached element.
  - Observing text under the ancestry, for the rare `dir="auto"`.

<a id="d14"></a>

## D14 — `displayed()` and `focusable()`, and no visibility function

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** An element has the Boolean functions `displayed()`, whether the browser renders a box for it as `checkVisibility()` decides, and `focusable()`, whether it can take focus as HTML's focusable areas decide. No Boolean function answers `checkVisibility({ visibilityProperty: true })`.
- **Why:**
  - A Boolean function takes no argument, so the plan's `checkVisibility({ visibilityProperty: true })` can't be one, and `displayed()` serves the queries that filter what a surface shows.
  - No API answers whether an element can take focus, so `focusable()` follows HTML's list: displayed and visible, neither disabled nor inert, and given a `tabindex` or focusable by default. A browser test checks it against what `focus()` focuses.
  - Both observe the attributes and structure along the flat-tree ancestry and the element's own size, so a box a stylesheet hides is observed wherever its size changes.
- **Declined:**
  - An element's `visible()`, beside the document's, for a question no query needs apart from `focusable()`.
  - Deciding focusability by trying `focus()`, which changes the page.
  - A `tabbable()`, which a query answers as `it.focusable() and (it["tabindex"] ?? "0") != "-1"` where it needs one.

<a id="d15"></a>

## D15 — `text` and `html` read a subtree, and no `hasText`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `text` answers `textContent` and `html` answers `innerHTML`. `text` is observable through its subtree's structure and text; `html` observes its attributes too, and is partly observable, since a change inside the content of a template it holds, which it serializes, reaches no observation of the subtree. No `hasText` is declared.
- **Why:**
  - `textContent` and `innerHTML` are what a page's own code reads of an editable region, so a query reads what the page's code would.
  - `it.text != ""`, or Nexo's own `trim` and `length` on it, answers what `hasText` would, so a Boolean of its own adds a name and no question.
- **Declined:**
  - `innerText`, which needs layout and answers differently as styles change, with nothing to observe them.
  - Calling `html` observable, which a template's content would contradict.

<a id="d16"></a>

## D16 — `classes`, `inlineStyle` and `localName`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** An element's class list is `classes`, a `List<String>` of each class once in the order first written. Its declared inline style is the named indexer `inlineStyle[property]`, null where the `style` attribute declares none. Its `localName` is constant.
- **Why:**
  - DOMQL names its members as plain words, `children` and `parent` among them, and a list of strings is no `DOMTokenList`, so the plan's `classList` became `classes`, beside the `class[name]` test.
  - `inlineStyle` sits beside `style`, the computed value, and reads the other question: what the element itself declares, as a style editor shows it.
- **Declined:** `classList`, the platform's name for a live token list a query never holds.

<a id="d17"></a>

## D17 — `autofilled()` without an autofill observation

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `autofilled()` matches `:autofill`, or `:-webkit-autofill` where a browser knows no other, and observes the user's input and changes in its tree. It is partly observable: the browser filling a field on its own, as a password manager does as the page loads, fires no event. O4's autofill observation is not built.
- **Why:**
  - The adapter the plan named writes a stylesheet into the page that starts an animation on `:autofill` and listens for it. Watching never changes the page, and an `animation-name` of its own would replace the page's animations on every field.
  - The browser fires `input` and `change` as it fills a field the user chose a suggestion for, which is the change an application acts on.
- **Declined:**
  - The stylesheet animation adapter, for the reasons above.
  - Polling `:autofill`, which spends a frame's work on every watched field to catch a change that happens once.
- **Reopened by:** an event or an observer the browser offers for autofill.

<a id="d18"></a>

## D18 — `playback` is a structured member of elements

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `playback` answers `Playback { paused, muted, ended, currentTime, duration, volume }` for an `audio` or a `video` element and null for any other. `duration` is null until the metadata loads and for a stream without an end. It observes the element's media events and is partly observable, since the current time advances between two `timeupdate` events.
- **Why:**
  - DOMQL declares no type for media elements, and a member of every element answering null for the others keeps one member where a type of its own would add a kind of node.
  - The browser answers `NaN` and `Infinity` for a duration it doesn't know, and DOMQL's numbers are finite, so null says it.
  - The media events are O4's playback observation, built as the plan names it.
- **Declined:** following the current time every frame, which would evaluate a watch sixty times a second for a member a player reads as it chooses.

<a id="d19"></a>

## D19 — A query follows what its members miss through a body's local

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** A watch takes no dependency of its own beside its query's. A query that needs a change its members miss reads a member that observes it, in a body's local where its result needs nothing of it, as `let edited = panel.text` before `return item.rectRelativeTo(panel)?.top`. The specification shows it in [following a change a member misses](../spec/watches.md#dependencies-following-what-a-member-misses).
- **Why:**
  - Nexo runs a body's locals in order whether or not anything uses them, and records their reads, so the dependency needs no feature of its own. A watch test settles it.
  - A dependency the query states travels with its definition, so a definition carried to another instance follows the same changes.
- **Declined:** a watch option naming an invalidation beyond its query's, which a definition would not carry and which repeats what a local already says.

<a id="d20"></a>

## D20 — The document selection, and what a browser test settled of it

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `Domql.document.selection` answers a `DocumentSelection { type, collapsed, rangeCount, anchorElement, focusElement, range }`, captured as it stands, and its `range` is a `Range`, a reference type whose members read the live range: `rect`, `collapsed`, `text`, `startElement`, `endElement`, `commonAncestor`, `intersects(node)`, `all(selector)` and `offsetsIn(element)`. DOMQL's `typeOf` recognizes a live range a host binds. An element's `selection` and `hasSelection` become observable.
- **Why:**
  - A browser test settled what the plan left open. Chromium fires `selectionchange` for every selection the page's code makes, collapses or moves, at the document, and for a text control's, at the control, from which it bubbles to the document: `setSelectionRange`, `select()` and a value the page's code sets each fire it.
  - The same test found the one change that fires none: the nodes holding the selection removed, which collapses it. So `selection` and `hasSelection` observe their own subtree as well, and the document's `selection` the document's structure, which leaves only a removal inside a shadow tree unobserved.
  - The facts of one selection belong together, so they are one structured value, captured once, as a rectangle's edges are. Its range stays a reference, since what it holds is read on demand, and a structure holding a reference is read through an object expression, as an event is.
  - A `Range`'s members observe the selection and the document, so a range the page's code moves, other than the selection's, is missed, and they are partly observable.
- **Declined:**
  - `DocumentSelection` as a reference type read fresh member by member, which could answer a type of one selection and a range of the next.
  - Keeping `selection` and `hasSelection` partly observable, which the browser no longer justifies.

<a id="d21"></a>

## D21 — An editable element's `selection` is the document's, in its text

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** For an element whose content is editable, `selection` answers the document's selection as offsets in the element's `text`, `{ start, end }` as a text control's are, and null where the selection lies not wholly within it. It applies to every editable element, an editing host's descendants included.
- **Why:**
  - An editor reads the caret as it reads a text area's, and offsets in `text` agree with what `text` answers, in UTF-16 code units as Nexo's strings count them.
  - A paragraph inside an editing host answers its own offsets, which a block-by-block editor needs; limiting it to the host would answer null there for no reason.
- **Declined:** the editing host alone, as the plan wrote, for the reason above.
