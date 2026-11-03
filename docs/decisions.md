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
  - A range's `rect`, `text`, `collapsed` and `all` answer the types an element's members of those names answer, so a receiver of unknown type reads them as one. `selection` answers a `Selection?` of an element and a `DocumentSelection?` of the document, two questions the plan named alike, so a query reads it of a receiver whose type it knows.
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

<a id="d22"></a>

## D22 — Siblings, `index` and `contains`, and no `follows`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** An element has `previousSibling` and `nextSibling`, its neighbouring elements, and `index`, its place among its parent's child elements, each null where it has no parent; a node has `contains(other)`. No `follows(other)` is declared.
- **Why:**
  - DOMQL's values are elements, never text nodes, so a sibling is an element, and the short name reads as `children` and `parent` do.
  - A list's order is Nexo's own: `all` answers document order and `indexOf` an item's place in it, so `items.indexOf(a) < items.indexOf(b)` answers what `follows` would. `follows` couldn't sort a list either, since Nexo's `orderBy` refuses a reference as its key (NEXO5036).
  - `contains` observes its own subtree's structure, so it is observable; the siblings and `index` observe their tree's as `parent` does, and miss what it misses.
- **Declined:** `follows(other)`, for the reasons above.

<a id="d23"></a>

## D23 — `location`, `shortcutModifier`, and no `documentElement`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** The window has `location`, a `Location { href, pathname, search, hash }`, which a ninth observation type, `navigation`, follows, and `shortcutModifier`, `"Meta"` on an Apple platform and `"Control"` on any other. `Document.documentElement` is not declared.
- **Why:**
  - A browser test settled that the Navigation API fires `currententrychange` for `pushState`, `replaceState`, a hash changing and a traversal, which `popstate` and `hashchange` alone miss for the history API; so `navigation` listens to it where the browser offers it, and `location` is partly observable only in a browser that doesn't.
  - What a page needs of its platform is the modifier its shortcuts use, not the platform's name, so the member answers that, in the names a keyboard event's `key` uses. It reads `navigator.userAgentData` where the browser offers it, and `navigator.platform`, the one signal the others give, where it doesn't.
  - `Domql.document.first(":root")` reads the root element already, and no query needs it observed apart from what `first` observes.
- **Declined:**
  - A `platform` naming the operating system, which every query would map to the modifier itself.
  - `origin` beside the four parts, constant for a document.
  - `documentElement`, for the reason above.

<a id="d24"></a>

## D24 — `sizeLimits` answers lengths in pixels, and no conversion of `px`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `sizeLimits` answers `SizeLimits { minWidth, minHeight, maxWidth, maxHeight }` from the computed style, each a number of CSS pixels where the computed value is a length, and null where it is `auto`, `none`, a percentage or a keyword. It is null for a detached element, and partly observable as `style` is.
- **Why:**
  - The plan's alternative, a conversion from `"120px"` to a number, would be a conversion between Nexo's own types, `String` and `Number`, which a module that owns neither declares none of, and Nexo's own refuses `"12px"` by its contract.
  - A computed percentage stays a percentage, and resolving it needs the containing block, which no API answers, so null says the limit is no length rather than guessing one.
  - The four limits describe one box, so they are one structure, read once.
- **Declined:** resolving `auto` to 0, which is true for a block box and false for a flex or a grid item, whose automatic minimum is its content's.

<a id="d25"></a>

## D25 — `files` answers what a file input holds, without content

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `files` answers a `List<File>` for a file input, each `File { name, bytes, type, lastModified }`, the empty list where it holds none, and null for any other element. It observes the user's input and changes and the input's `type`, and is partly observable, since the page's code assigning files fires no event.
- **Why:**
  - A result is data, and a file's content is no fact a query reads; what an application shows of a chosen file, its name, size and type, is.
  - The type `File` is DOMQL's own, named as the platform names it, and holds only the data its members name.
  - A file's size is `bytes`, where the platform says `size`, since DOMQL's `size` is a box's width and height: a `size` of `Number` beside them would leave a member read through a receiver of unknown type, as `panel?.size`, no result its declarations share, which Nexo's resolution of such a receiver needs. A test of DOMQL's resolution caught it.
- **Declined:** a file's content or an object URL for it, which a module's execution owns ([X10](features-status.md#planned-executions)), since an object URL must be revoked.

<a id="d26"></a>

## D26 — A selector is observed for what it reads, across its tree

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `all`, `first`, `matches` and `closest`, and a range's `all`, observe a tenth observation type, `selector`, of the receiver's root: the tree's structure and the attributes their selector tests, focus moving only where it tests a focus pseudo-class, and popovers only where it tests `:popover-open`. A pseudo-class whose reads DOMQL doesn't know reads every attribute. They stay partly observable, missing pointer state, control state, state no attribute holds and a shadow host's state that `:host()` tests.
- **Why:**
  - The plan scoped them to the receiver's subtree, which misses an ancestor's class in `.open .row`, since a selector matches in the whole tree, and still evaluates a watch again for every write landing inside the receiver, a behavior's own `tabindex` writes and layer stamps among them. What a selector reads, not where, decides what changes its answer.
  - A selector names what it tests in its own text, so a scan of it, which passes over strings and escapes, finds its attributes without parsing its grammar. A watch test shows a `tabindex` written in the tree evaluating nothing again, where it evaluated the watch before.
  - Listening for focus only where a selector tests it keeps every focus move in the document from evaluating each watch of `all` again.
- **Declined:**
  - The receiver's subtree, for the reasons above.
  - A full parse of selectors, which the scan doesn't need: what it reads is the same.

<a id="d27"></a>

## D27 — `on` listens in the capture phase through a `Listening` option

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `on(type, options?)` takes a second, optional positional argument, a `Listening { capture }`, so `on("click", { capture = true })` listens as the event is captured on its way to its target, and `on("click")` as before, at the target and as it bubbles. It listens passively either way, for observing alone, as [D2](#d2) has it.
- **Why:**
  - A member's argument form is positional or options, never both, and `on("click")` keeps its form, so the option is a structured value its parameter constructs from the object expression written there, as Nexo's [constructing a structure](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/spec/language/types.md#types-constructing-a-structure) sets out.
  - A structure leaves room for another listening option without changing the argument form, which would break every subscription.
  - Listening in the capture phase at an ancestor observes an event before any listener nearer its target runs, so a listener there that stops it hides nothing.
- **Declined:**
  - `on` in the options form, `on({ type = "click", capture = true })`, which breaks every subscription written.
  - A positional Boolean, `on("click", true)`, which says nothing where it is read.
  - A source of its own, `onCapture(type)`, a second name for one source differing in an option.

<a id="d28"></a>

## D28 — A click and a pointer event share `PointerEvent`, its pointer null where it carries none

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `click`, `dblclick` and the pointer events `pointerdown`, `pointerup`, `pointermove`, `pointercancel` and `lostpointercapture` each map to `PointerEvent`, whose `pointerId` and `pointerType` are null where the event carries no pointer: a click the keyboard caused, a `dblclick`, and a click a browser dispatches as a mouse event. It carries `detail`, `timeStamp` and the modifiers `ctrlKey`, `metaKey`, `altKey` and `shiftKey`, which touch, wheel and drag events carry too.
- **Why:**
  - A browser test settled it: Chromium dispatches a keyboard click as a pointer event whose `pointerId` is `-1` and whose `pointerType` is `""`, the Pointer Events specification's way of saying no pointer, and a `dblclick` as a mouse event, which has neither. Null says it once, where a query would otherwise test each value.
  - The facts of a click and of a pointer event are the same, a button, a position, a count and the keys held, so one type keeps one contract, as it already made `pointerType` nullable for a click dispatched as a mouse event.
  - The keys held decide what a press, a wheel turn or a drop means, so every event of a pointer, a touch, the wheel and a drag carries them.
- **Declined:**
  - A `MouseEvent` for `click` and `dblclick`, whose `pointerId` would name what it lacks, and which changes the type a click maps to.
  - Keeping `""` for a keyboard click's `pointerType`, which a query tells from a real pointer's only by its value.
- **Breaking:** a keyboard click's `pointerType` is null, where it was `""`.

<a id="d29"></a>

## D29 — Touch, wheel and drag events, and the members DOMQL reads for an event

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `touchstart` and `touchmove` map to `TouchEvent { target, touches, timeStamp }` with the modifiers, each touch a `Touch { identifier, clientX, clientY }`; `wheel` to `WheelEvent { target, deltaX, deltaY, deltaMode, timeStamp }` with the modifiers; and the drag events `dragstart`, `dragenter`, `dragover`, `dragleave` and `dragend` beside `drop` to `DragEvent`, which adds `types`. `on` delivers each event as the native event, reading for it the members no property answers as data: `pointerId` and `pointerType`, `touches` and `types`.
- **Why:**
  - A touch list is no list, and the formats a drag carries are its data transfer's, so DOMQL reads them for the event; every other member is the event's property of its name, so a module's event type reads the native event as before.
  - `types` is what a drop zone decides by while a drag passes over it, since the browser holds the data back until the drop.
  - `touchstart` and `touchmove` are what a gesture observes beside its pointer events, which cover a touch ending as `pointerup` and `pointercancel`.
- **Declined:**
  - `touchend`, `touchcancel` and a touch event's `changedTouches`, which pointer events answer.
  - A drag's data before the drop, which the browser doesn't expose.

<a id="d30"></a>

## D30 — The focus events are each a `FocusEvent`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `focus`, `blur`, `focusin` and `focusout` each map to `FocusEvent { target, relatedTarget }`, `relatedTarget` the element focus leaves or moves to, null where it is none of the window's.
- **Why:**
  - The four are one event, which the browser dispatches as a `FocusEvent`, and differ only in whether they bubble, so one type keeps one contract; `focus` and `blur` keep every member they had and gain the related element.
  - `focusin` and `focusout` bubble, so a subscription on a container hears focus moving within it, and its related element tells whether focus left the container, as `it.relatedTarget == null or not panel.contains(it.relatedTarget)` asks. A browser test settles what Chromium reports.
- **Declined:** keeping `focus` and `blur` a `DomEvent`, which would answer two types for one event.

<a id="d31"></a>

## D31 — Editing events, an edit's kind empty where an input event names none

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `beforeinput` and `input` map to `InputEvent { target, inputType, data, isComposing }`, its `inputType` `""` and its `isComposing` false where the input event says neither; `paste`, `copy` and `cut` to `ClipboardEvent { target, types }`, its formats read as a drag's are; `compositionstart` and `compositionend` to `CompositionEvent { target, data }`; and `selectionchange` to `DomEvent`.
- **Why:**
  - HTML fires a plain `input` event, no `InputEvent`, at a select, a checkbox and a radio button, as a browser test shows, so a member the event lacks would fail every projection of an input event a form fires. An empty kind and no composition are what such an edit is.
  - A clipboard event's formats tell what a paste holds before the page reads it, and its data is the page's own listener's to read, inside the dispatch.
  - `input` keeps the members it had, a `target` that may be null among them, and gains the edit's.
- **Declined:**
  - An `inputType` of `String?`, which every query of an input event would test for null to tell a select's edit from a text field's.
  - A clipboard event's data, which a passive subscription delivers after its listener could have used it.

<a id="d32"></a>

## D32 — Presentation, animation, loading and media events

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `beforetoggle` and `toggle` map to `ToggleEvent { target, oldState, newState }`, each state a `String`; `animationstart`, `animationend` and `animationcancel` to `AnimationEvent { target, animationName }`; and `close`, `cancel`, `load`, `error`, `play`, `pause`, `volumechange` and `ended` to `DomEvent`.
- **Why:**
  - A browser test settled it: Chromium dispatches a `ToggleEvent` for a popover, a `details` element and a dialog alike, so the states are never missing, and a toggle a page dispatches as a plain event fails its projection, as any event of the wrong kind does.
  - A dialog's `close` and `cancel`, an image's `load` and `error` and a media element's events carry nothing a query reads beyond what happened and where, so they are `DomEvent`s, as `scroll` is.
- **Declined:** an animation's `elapsedTime` and `pseudoElement`, which no query needs yet.

<a id="d33"></a>

## D33 — A key's members, and the members every event carries

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `KeyboardEvent` adds `repeat`, `isComposing`, the modifiers `ctrlKey`, `metaKey`, `altKey` and `shiftKey`, and `altGraphKey`, whether AltGr was held. Every event type DOMQL declares holds `timeStamp`, `defaultPrevented` and `composedPath`, the elements the event passes through, from its target outwards.
- **Why:**
  - A shortcut is a key and the modifiers held with it, and a key held down repeats, which a shortcut usually ignores; a key pressed while composing belongs to the composition, not to the page.
  - AltGr types characters on many layouts, where Ctrl+Alt reads the same as it to the modifiers alone, and only `getModifierState("AltGraph")` tells them apart, so DOMQL reads it for the event; `altGraphKey` is named as the modifiers are.
  - The time, whether the event was cancelled and its path are facts of every event, so every event type holds them, as one concept takes one contract; `timeStamp`, which the pointer, touch, wheel and drag events held, now stands beside the others.
  - A query reads elements alone, so `composedPath` leaves out shadow roots, the document and the window; it lists what the browser exposes where the subscription listens, so a closed shadow tree stays closed.
  - A passive subscription reads `defaultPrevented` as its listener runs, so it says what the listeners before it did, which a listener in the capture phase at the window hears before any.
- **Declined:**
  - `getModifierState` for every key, as `CapsLock` and `NumLock`, which no query needs yet.
  - The path's shadow roots and document, which a query can't read as elements.

<a id="d34"></a>

## D34 — Built-in executions, and `takeFocus` answering whether focus landed

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** DOMQL's module declares its first executions, each one platform call answering what the platform did, as [D1](#d1) has it. `takeFocus({ preventScroll })` focuses an element and answers whether focus landed on it, as its `focus()` Boolean function reads it afterwards. An argument of a value an execution takes none of fails it before it changes anything.
- **Why:**
  - Focusing an element that can't take focus does nothing and says nothing, so only reading afterwards tells a caller whether it must try another, as one restoring focus to an element that has gone.
  - `focus()` is the Boolean function that tests focus, so the execution is named for what it does, as the plan named it.
  - A built-in execution's implementation lives apart from the members that read, in its own class, since it changes the page where they never do; both read the geometry the module shares.
- **Declined:**
  - `focusVisible`, which no query needs yet.
  - Failing for an element that can't take focus, which the caller then tells from a failure only by its code.

<a id="d35"></a>

## D35 — Scrolls are logical, and answer once they have ended

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `scrollTo({ inline, block, behavior })` and `scrollBy(…)`, of an element and of the window, take offsets along the axes of the box's writing mode, measured from its scroll origin as `scroll` reads them, and `behavior` `"auto"`, `"instant"` or `"smooth"`; each answers whether the position moved. `scrollIntoView({ block, inline, behavior })` answers whether the element is in view. Each answers once the scroll has ended.
- **Why:**
  - A query computes where to scroll from what `scroll` reads, so writing in the same terms needs no conversion under RTL or in a vertical writing mode, where the browser counts a position down from 0. DOMQL reads the sign from the box's writing mode and direction, or from a position already below 0, as in a reversed flex container.
  - A browser test settled that Chromium's scroll methods answer a promise that settles once the scroll ends, a smooth one included, so the answer waits for it. A browser whose methods answer none is waited for frame by frame, from the third frame, since a browser test measured a smooth scroll beginning to move a frame or two after it is asked.
  - Whether it moved tells a scroll that did something from one already at its end, as a list paged past its last row; whether the element is in view is what a caller acts on next, as focusing what it revealed. In view is judged as `overlaps` judges boxes, against the viewport and each ancestor that clips, so a box of `overflow: clip`, which no scroll reaches, answers false.
- **Declined:**
  - Answering at once, which says nothing of a smooth scroll.
  - Physical `left` and `top`, which every query that handles RTL converts.
  - Waiting for `scrollend`, which fires nothing where nothing moves, so a caller would wait for a scroll that never began.

<a id="d36"></a>

## D36 — The top layer's executions answer whether they changed it

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `showPopover()`, `hidePopover()`, `showModal()` and `close({ returnValue })` each answer whether they changed the element, false where it is in the state asked for already, which they answer without calling the browser. `showPopover()` fails for an element that is no popover or in no document; `showModal()` and `close` fail for an element that is no dialog, and `showModal()` for a dialog open without being modal; each failure's cause is the browser's refusal.
- **Why:**
  - Browsers have thrown `InvalidStateError` for a popover showing already, and a caller that opens a surface it may have opened before needs no failure for it. A browser test shows Chromium leaving such a popover or a modal dialog as it is, so answering false without the call means the same everywhere.
  - Whether it changed is what the caller acts on, as focusing what it just opened, and a `beforetoggle` listener that keeps a popover closed answers false too; whether it shows is `popoverOpen()`'s to read.
  - A dialog open without being modal is in no state `showModal()` asks for, and the browser refuses to change it, so the call fails, as asking an element that is no popover to show does; hiding an element that is no popover changes nothing, so it answers false.
  - `close` keeps the platform's name; no member of an element is named `close` beside it, and its event is a string key, never a member.
- **Declined:**
  - Answering whether the element shows afterwards, which `popoverOpen()` reads, and which can't tell a caller it opened nothing.
  - `togglePopover`, `requestClose` and a popover's `source`, which no query needs yet.

<a id="d37"></a>

## D37 — Pointer capture answers whether the element holds it

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `capturePointer({ pointerId })` answers whether the element holds the pointer's capture afterwards, and false for a pointer that is not active or an element in no document, which the browser refuses. `releasePointer({ pointerId })` answers whether it released a capture the element held.
- **Why:**
  - A pointer can end before a request that crosses a boundary arrives, so a capture asked too late is a fact a caller acts on, not a failure; the answer says the element holds nothing, as `hasPointerCapture` would. Any other refusal is a failure, with the browser's error as its cause.
  - A browser test shows the capture holding at once, before the browser reports it at the pointer's next event, so the answer reads it as `hasPointerCapture` does, and a capture carried out while the press is handled holds.
  - The options form, `{ pointerId }`, leaves room for what a capture may take later without changing how it is written.
- **Declined:** failing for a pointer that is not active, which a caller would catch to learn what the answer says.

<a id="d38"></a>

## D38 — Owned writes hold one target each, and say whether they restore and keep it

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** An owned write is a continuous execution holding one target of an element at its value while it runs: `ownAttribute({ name, value })`, `ownClass({ name, present })` and `ownStyle({ property, value })`, each taking `restore`, true by default, and `keep`, false by default. A target's holders apply the latest one's value, and ending one hands the target back to the one before it; the last writes back the value it found where it restores. DOMQL writes as a holding ends only where the target still holds what DOMQL last wrote, and writes again against another writer only where the latest holder keeps its value, before the next frame.
- **Why:**
  - `hidden`, `tabindex`, `lang` and `dir` are attributes, so one execution writes each, where a member of each would be four names for one write; a class and a style property are parts of an attribute, which another class or property beside them shares, so each is a target of its own.
  - Restoring is the caller's to say: a document's `lang` and `dir`, which the page keeps once written, and a position a gesture commits, outlive the execution, where a class marking a drag does not.
  - Two behaviors can hold one target, as two marking one element busy, and the latest-wins order with hand-back keeps one from undoing the other's write as it ends.
  - Keeping a value against a framework's patch is the caller's choice, since writing again where a holder doesn't ask would fight the page's own renderer; writing again in the next frame, before it is painted, rather than in the mutation's microtask, keeps two writers that each keep a value from starving the page.
- **Declined:**
  - Restoring on every disposal, as the plan wrote, which would undo a value the page keeps.
  - Writing again against a patch by default, as the plan wrote, which fights another holder.
  - `element.attributes({ lang, dir })`, one execution of several attributes, which `ownAttribute` per attribute answers, each restored or kept as its own.
  - A style property's priority, `!important`, which no query needs yet.

<a id="d39"></a>

## D39 — A form control's writes answer what they changed, and nothing of other elements

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `writeIndeterminate(Boolean)` answers whether it changed a checkbox, `writeValue(String)` the value it replaced, and `writeSelection({ start, end })` whether it placed the selection. An element they don't apply to, as one that is no checkbox for the first, no control for the second and one exposing no selection for the third, answers false or null and is left as it is. `writeSelection` places an editable element's selection too, at offsets in its text.
- **Why:**
  - The members that read a control answer null for an element they don't apply to, as `value` and `selection` do, so the writes beside them answer in the same terms rather than failing; a refusal of the browser's own, as a file input's value, still fails.
  - Writing a value and reading what it replaced is one step, as clearing a field and keeping what it held, and firing no event is what the page's own code does, which a caller that reacts to edits relies on.
  - `selection` reads an editable element's selection as offsets in its text, so writing it takes the same offsets; an editor places its caret by them.
- **Declined:**
  - Dispatching `input` or `change` after a write, which a caller does with an execution of its own where it wants one.
  - A selection's direction, which no query needs yet.

<a id="d40"></a>

## D40 — The browser's facilities answer how the browser took the request

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `Domql.window.writeClipboard(text)` answers `"written"`, `"refused"`, `"unsupported"` or `"failed"`; `readClipboard({ types })` a `ClipboardContent { outcome, entries }`, each entry a `ClipboardEntry { type, text }`; `requestShare({ title, text, url })` `"shared"`, `"canceled"`, `"refused"`, `"invalid"`, `"unsupported"` or `"failed"`; a media element's `play()` `"playing"`, `"blocked"`, `"aborted"` or `"unsupported"`; `pause()` and `writeMuted(Boolean)` whether they changed it; and `download({ name, content, type })` and `print()` nothing.
- **Why:**
  - A refusal, a cancellation and a missing facility are what these calls answer in the ordinary course, which a caller acts on, as by offering another way to copy, so each is an answer, and a failure stays one where the browser names nothing a caller can act on, as `"failed"` says for the clipboard and the share.
  - `"unsupported"` joins the answers the plan listed, since a browser can lack the clipboard or the Web Share API, which `clipboard()` and `share()` test beforehand, and an answer saves a test for every call.
  - Reading the clipboard answers its formats as text, since a result is data and holds no binary content, in the order asked, so a paste can prefer `text/html` to `text/plain`; where the browser reads no items, its text alone serves `text/plain`.
  - A download and a print report nothing a page can read, so they answer nothing; a download's object URL is the execution's own, revoked a minute after the browser is asked, once it has begun the download.
  - A browser test settled what headless Chromium allows: it refuses the clipboard to a page given no permission, offers no Web Share API, and blocks playing, a muted element included, until the user acts, so playing from a subscription's handler of a click plays.
- **Declined:** `readClipboardText()`, which `readClipboard()` answers with its default of `["text/plain"]`, so one concept takes one execution.

<a id="d41"></a>

## D41 — No cookie writes

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `Domql.document.writeCookie({ … })`, planned at low priority, is declined.
- **Why:** No use of it is left: what a page keeps of its culture or its choices, a module that owns the policy writes, and a cookie is a server's contract, whose attributes, its path, its expiry and its `SameSite` among them, are a policy rather than one platform call answering what it did.
- **Reopened by:** a query that needs a cookie written where no module owns its policy.

<a id="d42"></a>

## D42 — `dispatch` dispatches a custom event and answers whether it was cancelled

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `dispatch({ type, bubbles, detail })`, on an element, the document and the window, dispatches a `CustomEvent`: cancelable, bubbling where `bubbles` is true, false by default, not composed, its `detail` the data given. It answers whether a listener cancelled it.
- **Why:**
  - A component announces what it did, and a control reports a change its own code made, as a drop zone does once it assigns files, to listeners that react as they react to the user, so the event is the page's own, and a listener's cancelling is how it declines, which the answer carries back.
  - It is always cancelable, so the answer means what it says; it bubbles only where told to, as `new CustomEvent` does, and stays within its shadow tree, as a component's own event does unless it asks to cross.
  - A custom event of a native type reaches the listeners of that type, which is what a framework listening for `change` needs, and runs no default action, which a page's own event never does.
- **Declined:**
  - Constructing native event types, as a `MouseEvent` for `click`, which would make DOMQL a synthetic input source; a module that needs one owns that policy.
  - `composed`, which no query needs yet.

<a id="d43"></a>

## D43 — The document's selection places itself

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `DocumentSelection`, the selection `Domql.document.selection` reads, declares `select({ node })`, `selectContents({ node, collapse })` and `collapse({ node, offset })`, each placing the document's selection, which the value read stands for, and answering whether the selection holds the place afterwards.
- **Why:**
  - A document has one selection, so what a query reads of it names it, and `Domql.document.selection?.select(…)` reads as it does, where a member of `Document` named `select` would read as selecting the document; a document with no selection reads null, so the placement is skipped where nothing could hold it.
  - The three are the generic placements an editor makes before its own range work: around an image, around a block's text or at its end, and at a point. `collapse` takes `"start"` or `"end"` for `selectContents`, the two places a caret goes in a block.
  - A browser takes no range of a node outside the document into its selection, so whether the selection holds the place is what tells a caller its node had gone.
  - A selection placed at offsets in an element's text is `writeSelection`'s, which an editable element takes as its `selection` reads them.
- **Declined:** placing a selection's anchor and focus apart, `setBaseAndExtent`, and extending it, which no query needs yet.

<a id="d44"></a>

## D44 — A file's source is built in, an owned write of `src`

*November 1, 2026*

- **Kind:** Contract.
- **Decision:** `ownFileSource({ input, index, restore })` is a built-in continuous execution, an owned write of the element's `src` at an object URL of the file the input holds at the index. The URL is the execution's own, made as a file is first shown and revoked once the source no longer shows it. It reads the input's files as it starts and as it is updated.
- **Why:**
  - Showing a chosen file is one platform call, an object URL, and one write, its source, with no policy, so it is built in, as [D1](#d1) has it; an object URL left unrevoked holds the file's memory until the page unloads, and only what made it knows when it is no longer shown, so the execution owns it.
  - `src` is an attribute, so the write joins the holders of an element's `src` that `ownAttribute` writes, and restores as they do.
  - A file's content is no data a result holds, as [D25](#d25) has it, so the source is read from the input itself; an update after a watch of `files` reports a new choice shows it, so the execution follows the caller rather than listening for changes of its own.
- **Declined:** following the input's `change` events itself, which would show a choice the caller hasn't acted on, and a module's own execution for it, as the plan allowed.

<a id="d45"></a>

## D45 — An optimization stays only where paired runs show it helps

*November 2, 2026*

- **Kind:** Design.
- **Decision:** Each optimization is measured in paired runs against the commit before it, time and allocation both, and kept only where it helps beyond the runs' noise. The design records each measurement beside the choice it settles. Its decisions not taken record what was tried and dropped.
- **Why:** Most of DOMQL's cost is comparing, patching and projecting results, and the evaluation hooks. Those paths changed most: an event's projection is about 55% faster with about 66% less allocation, and a change set of one changed row about 93% faster.
- **Declined:**
  - Keeping a query's evaluator between reads. A small repeated read was about 31% faster, but reading 1,000 or 10,000 rows once got 4 to 5% slower, beyond the noise.
  - A query keeping its resolution to skip Nexo's resolution key: no gain beyond the noise.

<a id="d46"></a>

## D46 — The C# half waits for its design

*November 2, 2026*

- **Kind:** Process.
- **Decision:** The C# half (A1) is out of the current work until the owner designs it. The design's section and the status's outline stay as where that design starts. Editor tooling, which is Nexo's, waits for Nexo's design too.
- **Why:** The outline names an API and an adapter, but leaves open what a host with a transport of its own takes from it, how a result maps onto records a field discriminates, and how text is checked without a parser in .NET. Those are the owner's to design.
- **Declined:** Building it from the outline, which would settle those questions without the owner.

<a id="d47"></a>

## D47 — Every operation is carried out for an owner, which its implementations receive

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** Every operation takes an `owner` option ([C4](features-status.md#planned-extension-contract)), any value, null by default. Every implementation an operation reaches receives it as `env.owner`, in one frozen environment the operation makes as it starts and keeps until it ends.
- **Why:**
  - "This owner's behavior on this element" is what a command and an occurrence need, and an owner given once to each operation spares passing a token in every query's bindings.
  - The members a behavior offers are read by a watch, so a watch and an evaluation take an owner as well as a subscription and an execution do; one concept, one option, on every operation.
  - Any value serves a host: an object a JavaScript caller holds, or a string or a number a host across a boundary names its components by. Null is an owner like any other, so a caller that gives none still reaches what it ran.
  - One environment for the whole operation lets a module key what it keeps by it, and a continuous execution's environment no longer changes at each update.
- **Declined:**
  - An owner of objects alone, which a host naming its components by key couldn't give without a map of its own.
  - Every operation its own owner by default, which would leave a caller that names none no way to reach what it ran.
  - The owner as a key beside `env`, which a member's implementation never receives, since Nexo builds what it receives.

<a id="d48"></a>

## D48 — A command reaches the latest instance of its behavior, and fails where none runs

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A once execution declaring `behavior`, the name of a continuous execution of its module, is a command ([C3](features-status.md#planned-extension-contract)): it reaches the running instance of that behavior for its owner on its receiver, which its implementation receives as `instance`. Where several run there, it reaches the latest to start or to move there; where none runs, it rejects with `DOMQL5016` and executes nothing.
- **Why:**
  - Every module that reaches a running behavior kept a `WeakMap` of its own by receiver; DOMQL already knows each instance, its owner and its receiver.
  - The instance is what the behavior's implementation answered, so a command calls its methods, `open()` or `measure()`, as the module wrote them, with no protocol between them.
  - Two instances of one behavior may run for one owner on one element, as a host starting a replacement before disposing the one it replaces does, and as two owned writes of one target do. The latest is the one the caller started last, and refusing the second would refuse what owned writes allow.
  - A command with no behavior to reach did nothing the caller asked for, so it fails, with a code a caller tells from the command's own failure.
- **Declined:**
  - Refusing a second instance for one owner on one receiver, which breaks a replacement that starts before it disposes.
  - Resolving to null with none running, which a caller can't tell from a command answering null.
  - `env.instanceOf(name, receiver)`, which every command's implementation would call, and which needs the module's name to tell two modules' behaviors apart.

<a id="d49"></a>

## D49 — A behavior's event sources are DOMQL's, and hear every instance for their owner on their receiver

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An event source declaring `behavior` is carried out by DOMQL ([C1](features-status.md#planned-extension-contract)), so it declares no `impl` and no parameters. A behavior's implementation receives `deliver(source, value)`, and each occurrence reaches every subscription of that source listening for the instance's owner on the receiver it runs on now, from every instance running there. An update that moves an instance to another receiver moves its occurrences there.
- **Why:**
  - [D3](#d3) binds a source to the owner's behavior on the receiver and lets it outlive replacement and release, so the subscription is kept apart from every instance and needs nothing of the source's own to listen.
  - A source carried out by DOMQL can't miss an occurrence or listen to the wrong instance, and a module writes one call where it would write a registry of its subscribers.
  - The source's name says which kind of occurrence a value is, so one behavior offers several, as drops and hovers, through one `deliver`.
  - A subscription bound to a receiver hears what runs on it, so one an update leaves hears nothing more; a caller that moves a behavior subscribes on the new receiver first, since a subscription starts before what it hears.
- **Declined:**
  - Hearing only the latest instance where several run, which loses what an older one reports during a replacement that overlaps it.
  - Parameters filtering what a source delivers, which the subscription's object expression and its handler already decide.
  - A source following its behavior to another receiver, which would make a subscription bound to one element hear another.

<a id="d50"></a>

## D50 — `deliver` answers a promise that settles once each subscription applied the occurrence

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `deliver` answers an acknowledgment ([C14](features-status.md#planned-extension-contract)): a promise that settles once each subscription has applied the occurrence, its handler having returned, and the promise it returned having fulfilled. It rejects with `DOMQL5017` where no subscription listens or one is disposed before applying it, `DOMQL5018` where the instance has ended, `DOMQL5019` for a source its behavior has none of, and `DOMQL5020`, the failure its `cause`, where a projection or a handler fails. DOMQL handles the promise, so a behavior may leave it. The `deliver` an event source of a module's own receives answers it too.
- **Why:**
  - A behavior that must know an occurrence was applied, as a registration resolving only once its first value is applied, or a switch answering "accepted" only once the requester applied it, waits for the subscriber's own completion, which only the handler's promise knows.
  - Every reason nothing was applied is a fact the behavior acts on, as resending or giving up, so each is a code it reads, and none is thrown into its listener.
  - Most behaviors never await it, and an unawaited rejection would be reported by the browser as unhandled, so DOMQL handles it as it makes it.
  - One concept takes one contract: handing a value to a subscription is the same act for an event source of a module's own, so its `deliver` answers the same.
- **Declined:**
  - Resolving with no subscription listening, which would tell a behavior its occurrence was applied when nothing heard it.
  - Waiting for the handler before calling it with the next occurrence, which would delay every subscription for one that is slow; the acknowledgment follows each without holding the others back.
  - An acknowledgment of the host's own transport, which is the caller's handler's to settle, as its promise does.

<a id="d51"></a>

## D51 — Delivering is synchronous, and never throws into the listener that delivers

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A behavior decides what must be decided within the browser's dispatch inside its own listeners ([C10](features-status.md#planned-extension-contract)). `deliver` captures and projects the occurrence and calls every handler before it returns, so a handler runs inside the dispatch, and nothing that happens to the occurrence throws into the listener that delivered it.
- **Why:**
  - Cancelling an event and capturing a pointer must happen before the dispatch ends, as [D2](#d2) keeps them in a module's listeners; a handler running within the dispatch also has the event's activation for an execution it carries out.
  - A listener that delivers and then goes on, as one applying a press it passes through, must not lose its own work to a subscriber's failure, which has a home of its own: the handler's failed event, the window's error reporting, and the acknowledgment.
- **Declined:** Delivering in a microtask, which would leave every handler outside the dispatch and its activation.

<a id="d52"></a>

## D52 — A behavior's state is read by its module's members, which a `behavior` observation keeps current

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A member the evaluator invokes declaring `behavior` reads the state that behavior offers ([C2](features-status.md#planned-extension-contract)): its implementation receives `instance`, the one running for the environment's owner on its receiver, or null. DOMQL's observation type `behavior` invalidates a watch reading it as an instance of that name starts, is updated, moves or ends on its receiver, and as the instance calls the `notify()` its implementation receives.
- **Why:**
  - State is read, not heard, so it is a member, which a watch follows by the observations it names, as every member is followed; a watch then reads the placement a frame keeps rather than replaying its changes.
  - The instance offers what the behavior's implementation holds, so the member reads it as a command does, with no copy kept in DOMQL.
  - Only the behavior knows when what it holds changes, so it says so, as an observation type's implementation calls its `notify`; its start, update, move and end are DOMQL's to tell.
  - An observation's identity holds its arguments alone, so the observation follows a behavior's name, and a name two modules or two owners share costs an evaluation, never a missed change.
- **Declined:**
  - A maintained observation holding the state as its sample, which an owner can't tell apart, since one observation serves every owner.
  - Keeping the state in DOMQL, written by the behavior, which would copy what the instance already holds and still need the behavior to say when.

<a id="d53"></a>

## D53 — Module code observes and schedules through DOMQL's own, a frame's writes before its reads

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An environment offers `observe({ type, target, …arguments }, notify)`, over the window's shared observations, and `frame(callback, { phase })`, over its frame schedule ([C5](features-status.md#planned-extension-contract)). A frame runs the writes module code asks for, then its reads, a frame watch's evaluation among them. A `mutation` observation notifies at mutation delivery, in its microtask, never at a frame.
- **Why:**
  - Module code ran resize and intersection pools of its own beside DOMQL's, observing the same elements twice; sharing the window's observations runs one.
  - A module writing in a frame before DOMQL's watches read it lets them read what it wrote in that frame, with one layout, where a frame of its own would leave them a frame behind or force a layout between.
  - Code that must act before paint, as moving focus to an heir before focus is painted on the body, needs a mutation as it is delivered, so `observe` notifies as the observation reports, and the module chooses a frame itself where it wants one.
- **Declined:**
  - Notifying a mutation at a frame, which loses the delivery's moment.
  - A frame of reads before writes, which leaves a module's write to a frame after the watches that would read it.

<a id="d54"></a>

## D54 — Module code reaches its DOMQL instance, and executes nothing while a query is evaluated

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An environment holds `domql`, the instance the operation belongs to ([C6](features-status.md#planned-extension-contract)). While a query is evaluated, a host call prepared or a value projected, `executeAsync` and `run` are refused with `DOMQL5021`, and so are an operation environment's `observe`, `frame` and `measureUnder`; an evaluation, a watch and a subscription may start, and an observation's environment refuses nothing.
- **Why:**
  - A module that builds on queries, as one finding the arrows among a strip's children, needs the instance its queries are registered in, which only DOMQL knows, since two instances on one page never share a registry.
  - A member's implementation reads alone, which nothing enforced: refusing what changes the page or holds something while an evaluation runs keeps evaluating free of effects, re-entrant or not.
  - An evaluation, a watch and a subscription change nothing as they start, so module code reading through a query of its own, an observation type composing a watch among it, may start them.
  - An observation starts while a query is evaluated, and observing, scheduling and measuring are what an observation type does, so its environment allows them.
- **Declined:**
  - A `domql` bound to the environment's window, which every query object it makes would have to carry; a caller passes `{ window: env.window }` as any caller does.
  - Refusing watches and subscriptions too, which would refuse an observation type built on a watch.

<a id="d55"></a>

## D55 — A transient measurement drains DOMQL's own observers, and is no member's

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `env.measureUnder(element, { class }, read)` adds the class, reads, restores the class attribute as it was, and drains every mutation observer DOMQL runs in the element's window of the records of that element's class attribute, handing each the rest ([C7](features-status.md#planned-extension-contract)). An observation type measures through it while a watch runs; an operation's environment refuses it while a query is evaluated.
- **Why:**
  - A measurement under a class, as a column's wanted width under `max-content`, changes the page for the length of a read, and without draining every watch reading `matches`, `closest`, `first` or `all` would evaluate again after each.
  - DOMQL can drain only its own observers, which it made; a framework's own observers see the class come and go, as they would without DOMQL.
  - The class's change restores itself before a frame is laid out, so no resize or intersection is reported, and the records of other changes keep their delivery, a microtask later.
  - An observation type's measurement is the one change watching makes, restored before it returns; a member reads alone, so it never measures.
- **Declined:**
  - Any change beside one class, an inline style or an attribute, which no measurement asks for yet.
  - Muting DOMQL's observers for the read's length, which would lose a change the read itself makes.

<a id="d56"></a>

## D56 — Continuous measurement is an observation of each frame, held only while it is needed

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** DOMQL's `frame` observation of the window invalidates what reads it at the start of each animation frame's writes while it is held ([O3](features-status.md#planned-observation)), so a watch reading it evaluates again in that frame. A module holds it through `env.observe` or a member naming it, and lets it go when the gesture or the pointer that needs it ends.
- **Why:**
  - Content moving under a still pointer, by an animation or a transform, changes nothing another observation reports, so only measuring each frame follows it.
  - An observation is what a member names and a module holds, and its sessions already end with their holders, so continuous measurement stops as the last lets it go.
  - Its cost was measured in Chromium: holding it costs about 0.03 ms a frame, and a watch reading 1,000 boxes through it about 2.2 ms, which the design records.
- **Declined:** A watch schedule that evaluates each frame, which would measure every member a query reads each frame, where the observation measures those that name it.

<a id="d57"></a>

## D57 — A module's state per document is its own, one across every instance

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A module keeps its state for a document by `env.document` in a `WeakMap` of its own ([C8](features-status.md#planned-extension-contract)), which is one for each document across every instance of DOMQL that registers the module. DOMQL holds no such state and offers no hook at a document's first use or last release.
- **Why:**
  - Each instance of DOMQL has a registry of its own, so state DOMQL kept would be one per instance, and two bundles on one page would each hold a copy; the module's code is one, wherever it is registered.
  - State a document keeps for its life, as the culture it accepted, is started before any request and never reset, which a hook at the last release would contradict; the module makes it on first meeting the document, and starts it as its code loads where it must come first.
  - A module that wants to stop work as its last behavior ends counts its own instances, which its start and its dispose see.
- **Declined:** A store DOMQL keeps by module and document, with hooks at first use and last release, which would split one document's state between instances and reset what must outlive every request.

<a id="d58"></a>

## D58 — A member's history is its holder's, keyed by the operation's environment

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An implementation's environment is one per operation ([C9](features-status.md#planned-extension-contract)), so a captured member keys the history it keeps by its environment and its receiver.
- **Why:**
  - Nexo has a captured member's holder keep its history, and DOMQL's holder of an evaluation is its operation: a watch, a wait or a subscription. One environment for each, the same from its start to its end, is the key that names it, and goes with it.
  - A key a module derives from its environment needs no protocol: a `WeakMap` of its own lets it go with the operation.
- **Declined:** An identifier of the operation in the environment, which a module would key a map by anyway and never release.

<a id="d59"></a>

## D59 — A null argument skips a host call only where its parameter propagates null

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** DOMQL's documents say a skipped preparation is one where the receiver is null, or an argument whose parameter propagates null is null ([C11](features-status.md#planned-extension-contract)); a null argument whose parameter accepts null is passed as it stands.
- **Why:** That is Nexo's rule, which DOMQL's preparation already followed, while its documents said any null argument skips the call. A behavior's options take null as a value, as a bound of null meaning the viewport, an heir of null meaning none, or a maximum length of null meaning no limit, and the wording must not tell a module author otherwise.
- **Declined:** A rule of DOMQL's own, which would make one parameter's null policy mean two things.

<a id="d60"></a>

## D60 — Nested options holding an element are Nexo's structured values

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An option declared a structured type, written in place as an object expression, as `buttons = { container = viewport, step = 3 }`, is constructed as that type's data, its reference fields holding the elements they name, and reaches the implementation frozen ([C12](features-status.md#planned-extension-contract)). DOMQL adds nothing: Nexo constructs it, from its language `1.0.0-alpha.36`.
- **Why:** A test settled that a structured option holding an element, written in place in a continuous execution's options and given null where its field is nullable, reaches the implementation as the structure its type declares, through `run` and through an update, and that a field of another type is refused as the request is resolved.
- **Declined:** An options form of DOMQL's own, which would repeat Nexo's construction of structures.

<a id="d61"></a>

## D61 — A kept function ends as the execution that keeps it ends

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A host call's function argument reaches its implementation as a kept function, which Nexo's language `1.0.0-beta.20` designed for DOMQL ([C13](features-status.md#planned-extension-contract)), as its [decisions](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/decisions.md#d49) record. DOMQL ends it as the execution keeping it ends: a continuous execution's instance ending or accepting other arguments, a once execution's answer settling, a subscription ending. Each call counts as an evaluation of the instance's, so what it reads reads alone.
- **Why:**
  - A running behavior keeps a test of what it hears, as a route's condition, and calls it inside each event's dispatch; data alone left every such test a protocol of the module's own.
  - DOMQL alone knows when what it started ends, so it disposes each prepared call then, and a call after that fails with Nexo's code, where it would read a page the caller has moved on from.
  - An instance that refuses an update keeps the arguments it ran with, so its functions stay open, and the update's are ended; one that accepts them leaves the old ones nothing to serve.
  - A cancelled once execution still runs until its answer settles, as its signal leaves it to, so its functions end then, never as the caller stops waiting.
- **Declined:** Ending a once execution's functions as its caller stops waiting, which would fail calls the execution still makes while it winds down.

<a id="d62"></a>

## D62 — An immediate watch handles a mutation in its delivery's checkpoint

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An `immediate` watch's handlers run within the microtask checkpoint of the delivery that invalidated it, a mutation delivery's before any task or animation frame ([T1](features-status.md#planned-timing)). DOMQL already ran them so; the specification now promises it, and a browser test proves it against a task, a timer and a frame asked for after the mutation.
- **Why:** A caller that must act on a mutation before anything else runs, as moving focus to an heir before focus is painted on the body, needs the promise, not the implementation's habit.
- **Declined:** Running the handlers inside the mutation observer's callback, which would evaluate once for each observer notified rather than once for the delivery.

<a id="d63"></a>

## D63 — A frame watch handles inside the frame, after the frame's writes, and owned writes keep their values there

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A `frame` watch's handlers run inside the animation frame, among its reads, before the browser lays it out and paints it ([T2](features-status.md#planned-timing)). An owned write keeping its value against another writer writes it again among the frame's writes, the phase module code writes in through `env.frame`, so the watches of that frame read it.
- **Why:**
  - A handler that measures and writes, as one placing a surface beside what it measured, must write before paint, which a frame callback does; a browser test proves the handler runs inside the frame and the resize its write causes is reported before the next.
  - Executions' writes and module code's in one phase before the frame's reads let every watch of the frame read one laid-out state, so a kept value never shows a frame late, and never forces a second layout.
- **Declined:** A phase after the reads for executions' writes, which would leave the watches of the frame reading what the writes then undo.

<a id="d64"></a>

## D64 — Executions carried out in one task keep their order

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An execution's implementation is invoked within the call that carries it out, once its preparation has run, so executions carried out in one task are invoked in that order, each seeing what the ones before it changed ([T3](features-status.md#planned-timing)).
- **Why:** Opening a dialog and then focusing within it works only in that order, in one task, since a field of a closed dialog is rendered nowhere; a caller that carries both out together needs the order promised. `executeAsync` and `run` already invoked their implementations so, and a browser test proves it both ways.
- **Declined:** Queuing executions to a microtask or a frame, which would separate them from the user's activation and from the task the caller ordered them in.

<a id="d65"></a>

## D65 — A host coalesces change sets by concatenating them

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** Change sets compose: the change sets of consecutive events, concatenated in order, are one change set from the first's snapshot to the last's, each item matched by its source throughout ([A2](features-status.md#planned-api-and-host)). A host with one delivery in flight sends that concatenation, or the latest snapshot whole as one operation replacing the root. DOMQL computes no change set against an older snapshot.
- **Why:**
  - JSON Patch applies a document's operations one after another, and each change set is computed against the snapshot of the event before it, so an operation of a later change set reaches an item where the earlier ones left it. A test proves it over moves, changes inside moved items, additions and removals, keeping each item's object.
  - Item identity lives in metadata a result never holds, which is why a host couldn't compute a change set itself; concatenating needs none of it.
  - A minimal change set only bounds a delivery's size, a cost rather than a capability, and the snapshot sent whole bounds it too.
- **Declined:** `watch.changesSince(snapshot)`, which would keep the metadata of every snapshot delivered, and with it the elements its lists came from, for as long as the caller holds the snapshot. The design's [decisions not taken](domql-design.md#decisions-not-taken) say what reopens it.

<a id="d66"></a>

## D66 — A refresh takes new samples where it is asked to, and delivering an equal result needs nothing new

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `refreshAsync({ resample: true })` has every maintained observation the watch's last evaluation read take a new sample, and evaluates once each has arrived ([A3](features-status.md#planned-api-and-host)). A maintained observation type offers `resampleAsync()` to take one; one offering none is read as it stands. A failure to take one rejects the refresh with `DOMQL5022`. A refresh also takes a `signal`, which cancels its wait alone. `rebaseline` is declined.
- **Why:**
  - The browser reports an intersection after it lays a frame out, so a frame watch evaluates before the report of that frame, and a refresh after a load reads the sentinel where it was before the load: a refreshed `true` would start another load. A browser test proves the stale read and the new sample.
  - Only the observation knows how to take a sample anew, so it is the observation type's to offer; the `intersection` type observes its element again, which the browser always reports. A type whose sample is computed as it is read is current already, and offers none.
  - A shared observation takes one new sample for every watch holding it, so a refresh never makes another watch's member pending again.
  - A refresh that may wait for the browser should be cancellable, as `readyAsync` and `evaluateAsync` are.
- **Declined:** `refreshAsync({ rebaseline: true })`, a refresh that delivers an equal result. A caller that needs the result whatever it is reads `snapshot` once the refresh settles, the snapshot the next change set is computed against, so delivering it again would add a second way to do one thing.

<a id="d67"></a>

## D67 — An instant scroll answers at once, and a hidden document scrolls instantly

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A scroll is instant where its behavior is `"instant"`, or `"auto"` where every box it may move computes `scroll-behavior: auto`, and it answers as the browser's method returns, waiting for no animation frame. For the window that box is the root element, whose `scroll-behavior` the viewport takes; for `scrollIntoView`, every scroll container among the element's flat-tree ancestors and the viewport. In a hidden document DOMQL asks the browser for an instant scroll whatever the behavior.
- **Why:**
  - A script audit found that where the browser's scroll method answers no promise, an instant scroll was answered after the frames the stillness check waits for, about three frames, though the browser had finished it as its method returned; a caller revealing items by the keyboard felt the delay. Chromium 156 answers a promise that settles at once for an instant scroll, as a probe measured, so the frames were waited for only in browsers whose methods answer none.
  - `scrollIntoView` under `"auto"` moves each scroll container that holds the element as its own `scroll-behavior` says, so it is instant only where every one of them, and the viewport, is; reading each ancestor's style costs little beside the scroll, and a smooth one anywhere waits as before. A body whose overflow goes to the viewport scrolls nothing of its own, and is left out.
  - A hidden document lays out no frame, so a smooth scroll there neither animates nor reports holding still, and its answer would wait until the document is shown. No one sees the animation, so the scroll is asked for as instant and answers at once. Headless Chromium keeps its document visible even with its window minimized, so a test reports the document hidden in its place.
- **Declined:**
  - Treating `"auto"` as smooth for `scrollIntoView` wherever any ancestor might be, which keeps the delay for the common case of no smooth box.
  - Waiting for `scrollend` in a hidden document, which fires nothing where nothing moves, as [D35](#d35) found.
  - Finishing at once a smooth scroll the document is hidden during: it resumes as the document is shown, and answers once it has ended, as any smooth scroll does.

<a id="d68"></a>

## D68 — A module is loaded on request through a loader by its name, before a query importing it is carried out

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `domql.registerModuleLoader(name, load)` registers the loader of a module by its name, and `domql.loadModulesAsync(modules)` loads, and registers, every module named that the instance doesn't hold yet: those a query object, a definition or a text imports, or those a list names ([A4](features-status.md#planned-api-and-host)). A load under way is shared, a module held is never loaded again, and a failed load leaves nothing registered. No operation loads a module itself: a request importing a module that has a loader and is not loaded yet is refused with `DOMQL3007`.
- **Why:**
  - A host that receives queries from elsewhere, as across an interop boundary, knows which modules each needs only from its imports, and registers a module's code when a query first names it. A loader by name, kept by the instance, lets every library register its own modules' loaders independently, and the host load what any query imports without a table of its own.
  - Sharing a load under way and skipping what is held makes loading safe to ask for before every query, where a host's own `import()` and registration would race two queries naming one module into a second registration, which Nexo refuses.
  - `run` starts its execution before it returns, and `executeAsync` invokes its implementation within its call, keeping their order and the user's activation, so loading inside an operation would break both; the caller awaits the load first, and a forgotten load is refused with a code of its own at the import, rather than as a module Nexo doesn't know.
  - A loader that fails, or answers a module of another name, is reported at the module, with the failure as its cause; the next load asks the loader again, since a failed network fetch may succeed later.
  - Two auditors counted it a convenience, since a host can `import()` and register a module itself; it is built all the same, since the consumer's plan treats it as blocking and the races above are the host's to get wrong otherwise.
- **Declined:**
  - One loader for every module, given each name, which every library registering modules would have to share.
  - Loading inside `evaluateAsync` and `executeAsync`, which would make an execution's order and activation depend on whether its module was loaded yet.
  - Modules a module depends on, loaded by DOMQL from its declarations: a loader loads them first itself, through `loadModulesAsync`, since only it knows what its module names.

<a id="d69"></a>

## D69 — What DOMQL delivers reaches its handlers in the order it happens, across handles

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** An occurrence reaches every subscription listening before `deliver` returns, an event of `on` within its dispatch, and a watch's change as its evaluation completes; `run`, `update`, `dispose` and `executeAsync` take effect within their calls. So handlers hear what happens in the order it happens across handles, subscriptions and owners, and calls to several handles take effect in the order they are made ([A5](features-status.md#planned-api-and-host)). The C# half's bounded queue, which never coalesces and fails on overflow, waits with it ([D46](#d46)).
- **Why:**
  - One press can dismiss one owner's scope and act on another's, and the host must hear the dismissal first, since the order of activations decides which scope takes precedence. DOMQL already delivered synchronously ([D51](#d51)), so the order holds; the specification now promises it across handles, and tests prove it for two owners, a slow handler among them, a watch's change after the occurrences of its task, and updates to several handles.
  - A caller that forwards across a boundary keeps the order by sending in the order its handlers are called, through one queue of its own; its bounds and transport are the caller's, as keeping a copy of a result has them.
- **Declined:** A queue of DOMQL's own in JavaScript, which would delay every handler for a guarantee the synchronous delivery already gives.

<a id="d70"></a>

## D70 — Each target of a rendered element is the framework's or an owned write's, and a kept value yields to another holder

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** Ownership against a framework that renders the same elements ([A10](features-status.md#planned-api-and-host)) is exclusive by target: each attribute, class, inline style property and text holds one value, the framework's or the latest owned write's. Owned writes gain `ownText({ value, restore, keep })`, which writes the data of the element's one text node in place. A holder that keeps its value writes it again against a patch, and yields to a writer that writes its own again in answer, within the two frames after, until an update writes the holder's again. Geometry a gesture commits is held with `restore = false` and ended once the framework has applied the commit. Module code holds what it writes through owned writes it runs with `env.domql`.
- **Why:**
  - A framework writes a whole `class` or `style` attribute as it renders, dropping a class or a property it doesn't know, but writes it once, when its own render changes; keeping the value against that patch, before paint, as [D63](#d63) has it, is no fight. A writer that keeps a value of its own, as module code holding the document's `lang` during a navigation does, writes again in answer to every write, and two such writers would alternate once a frame without end, so the holder yields: the consumer's correction asked that keeping never fight another holder. Tests prove both, in the simulated document and in Chromium, with an answer in a microtask and one in a frame of another instance's own.
  - A framework holds the text nodes it rendered and edits them later by reference; writing an element's `textContent` replaces its node and breaks that bookkeeping, so the text is written into the node the element holds, and an element holding other nodes is refused rather than cleared.
  - A committed position must stand as the gesture's holding ends and until the framework renders it, which `restore = false` and the occurrence's [acknowledgment](#d50) already give; keeping it during the commit undoes a render of the old position that comes before the commit is applied.
  - Module code writes natively, so it reaches the same holders by running an owned write through `env.domql`, as any caller does, rather than through a second API that would split one target's holders between two.
- **Declined:**
  - An isolated layer per component, as a stylesheet rule each, which a framework's inline style overrides anyway, and which CSS can't compose for one property; a class per component already isolates what each writes, and holders already hand a target back as each ends.
  - Refusing a second holder of a target, an exclusive owner enforced, which would break a replacement that starts before it disposes, as [D48](#d48) found for behaviors.
  - Telling a holder from a patch by the value it writes, which a class's presence can't tell; the time of the answer does, for every kind of target.
  - An owned-write tool of the environment's own for module code, which `env.domql` already reaches.

<a id="d71"></a>

## D71 — A subscription carries out its reactions inside each event's delivery, and hands their results to its handler

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `subscribe` takes `reactions`, a list of query objects each ending in a once execution ([A7](features-status.md#planned-api-and-host)). For each event it projects, the subscription carries them out in their order, inside the event's delivery and before calling its handler, each bound to its own values and `event`, the event's projected value, for the subscription's owner. The handler's ready event carries `reactions`, a promise of each one's result, settling as `executeAsync`'s does. An event whose projection fails is reacted to by none. Several executions in one crossing are executions carried out in one task, which keep their order ([D64](#d64)).
- **Why:**
  - Writing the clipboard, sharing and playing need the user's activation, and selecting a field's text on focus must come before anything else runs, so a caller across a boundary, which hears the event only after a round trip, can't carry them out in time. A browser test proves a reaction runs inside a click's dispatch, with its activation, before the handler.
  - A route of a module's router delivers every action of a scope through one source, so a reaction reads the event's value, as `execute({ command = event.action })` does, rather than one subscription per action, which no source can filter.
  - The event is the trigger, so its handler hears of it first, with promises of the reactions' results that settle after it; a caller forwarding the event and then each result keeps every result after the event that triggered it, as the consumer's correction asked.
  - A reaction is a once execution like any other, so its result, failure and validation are `executeAsync`'s, its failure confined to its own promise.
  - In five paired rounds, projecting an event and making a small query measured within noise.
- **Declined:**
  - Reactions after the handler, which would leave the handler no promise of their results with the event.
  - Refusing as the subscription starts a reaction that would fail at every event: a reaction reading `event` resolves only once an event binds it, so it is resolved, and fails, as each event binds it, as `executeAsync` would.
  - A batch operation for several executions, which carrying them out in one task already orders.

<a id="d72"></a>

## D72 — A watch answers the element a list item came from, beside its result, never in it

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `watch.sourceOf(...path)` answers the reference the list item at the path in the watch's snapshot descends from, its provenance, as the element a row was projected from, and null where it descends from data or null, where no projection built its list, where the path reaches no item, and before the first snapshot ([A8](features-status.md#planned-api-and-host)). A selected view answers it for a path relative to its part. A path ending at anything but a list's item is refused with `DOMQL2016`.
- **Why:**
  - A handler in the browser that lays out what a watch measured, as a gutter aligning its rows to the blocks of an editor, writes to the elements the items came from; the watch already knows each, from the provenance Nexo records to match items, so the caller needs no second query and no index of its own.
  - A result holds data alone, so it crosses a boundary and is compared as data; an element in it would break both, so the reference is asked for beside the result, and a caller across a boundary never meets one.
  - Asking the watch, rather than finding the element in every event's arguments, costs nothing for the events no handler asks about. It reads the snapshot the watch has now, which a handler has before it awaits anything, as it has `sender.snapshot`.
- **Declined:**
  - Elements in the result, or in a parallel structure in each event's arguments, which would cost for every event and every listener.
  - The immediate input of a projection, where an item came through several, rather than its provenance, the element the first projection read, which is what a handler writes to.

<a id="d73"></a>

## D73 — Delivery options: a delayed schedule a refresh flushes, reporting on parts, and a throttle that keeps the latest

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** A watch takes `schedule: 'delayed'` with a `delay`, evaluating once the delay has passed with no invalidation, and `reportOn`, the parts whose change alone has a snapshot reported, whole ([A9](features-status.md#planned-api-and-host)). A subscription takes `throttle`, handing its handler at most one event each interval, the latest, a failed event never dropped, and the acknowledgment of a dropped occurrence rejecting with `DOMQL5024`. The early flush of a delayed watch is `refreshAsync()`. A subscription delivered by animation frame stays declined.
- **Why:**
  - An editor serializes its content once a burst of typing ends, so the delay restarts at each change and defers the evaluation itself, not only its delivery, as the consumer's correction asked. Its early flush, as the editor losing focus, evaluates now instead of at the schedule, which is what `refreshAsync()` already does; a caller refreshes in that event's handler, inside its dispatch.
  - An editor's state is reported as its selection changes, carrying its content too, so a watch compares the parts it reports on and reports the whole snapshot; a snapshot it doesn't report isn't kept, so the next is compared with the last reported, and live state's change sets stay relative to what its caller holds.
  - An inspector of every input decision shows the latest, so a throttle keeps the latest event of each interval and hands the first at once; every event is still projected in its dispatch, since what it reads is read then. A failure is never dropped, since nothing else would report it, and it hands over the event held before it, so order holds.
  - A subscription with reactions hands its handler every event its reactions ran for, so it takes no throttle, rather than leave the promises of dropped events' reactions to no one.
  - A frame would deliver events away from their dispatch, losing its moment and the user's activation, while a throttle paces by an interval and what a frame renders reads the latest value itself.
  - In twelve paired rounds against the commit before it, evaluating a small query, refreshing watches of 100 and 1,000 rows and projecting an event each measured within noise, their medians from 6% faster to 8% slower and every range crossing zero.
- **Declined:**
  - `flushOn`, a subscription that flushes a delayed watch, which a refresh in the caller's handler already does; the design's [decisions not taken](domql-design.md#decisions-not-taken) say what reopens it.
  - A maximum wait for the delayed schedule, which no consumer asked for.
  - A subscription delivered by animation frame, as above.

<a id="d74"></a>

## D74 — An execution's lifetime is anchored to its element by its caller, with a watch of `attached`

*November 2, 2026*

- **Kind:** Contract.
- **Decision:** `run({ anchor })`, a continuous execution disposed once its element has left the document a frame later ([A6](features-status.md#planned-api-and-host)), is declined. A caller watches `element.attached` and disposes the execution, and the watch, once it reads false, as the library guide shows.
- **Why:**
  - The composition is a few lines, every part of it DOMQL's already: `attached` follows the element through every shadow root, a watch scheduled by frame evaluates once the task that moved the element has ended, so a framework that removes and inserts it in one task leaves its execution running, and `dispose` ends both.
  - Built in, the option would hold the same observation for every execution, and decide for every caller how long a move may take; a caller that needs a longer grace, or none, chooses its schedule.
  - The consumer's survey found the host builds it from a watch of `attached`, and counts it optional.
- **Declined:** The option itself; the design's [decisions not taken](domql-design.md#decisions-not-taken) say what reopens it.

<a id="d75"></a>

## D75 — DOMQL enters the beta at `1.0.0-beta.1`, with the C# half waiting for its design

*November 2, 2026*

- **Kind:** Process.
- **Decision:** DOMQL enters its beta. The specification and the runtime both take `1.0.0-beta.1`. Later betas number on from it, `1.0.0-beta.N`, each version advancing for its own reason as before. The C# half (A1) and A5's queue wait for their design, as [D46](#d46) records.
- **The contract:** it is that of `1.0.0-alpha.318`, unchanged. The version advances because its promise does:
  - No breaking redesign is planned.
  - The limitations are documented: the C# half in the status's [outline](features-status.md#the-c-half), the [deferred work](features-status.md#deferred), and the design's [decisions not taken](domql-design.md#decisions-not-taken), each saying what would reopen it.
  - A later version that breaks what this one allows says how to migrate, beside the break, in the [version history](../VERSION-HISTORY.md).
- **The packages:** the sources declare `1.0.0-beta.1` before it is published, since it is the version due at publication. The [changelog](../CHANGELOG.md) records each release, and the gate holds its newest entry, and both READMEs, to the versions the sources declare. The runtime is no longer numbered by the commit count, so CI checks out the gated commit alone.
- **Why:**
  - Every planned capability is implemented or declined but A1 and A5's queue. What callers use today, the JavaScript half, is complete.
  - The C# half is a client of that contract. It maps results onto records, drives the operations the JavaScript half offers, and carries across the boundary the order that half already keeps ([D69](#d69)). The questions D46 leaves open are its own: a host's own transport, records a field discriminates, and checking text without a parser in .NET. Should its design need more of the JavaScript half, that is an addition, which a beta allows.
  - Nexo holds the same stance: it is in its beta, as its [decisions](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/decisions.md#d27) record, while its tooling waits for its design, as its [status](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/features-status.md#tooling) records.
  - A caller reads `domql.info.versions` to learn what it can rely on. A beta runtime implementing an alpha specification would promise a stability its contract's version denies.
- **Declined:**
  - Waiting for the C# half. Its design has not started, and the JavaScript half would go without a promise until it ends.
  - A bare `1.0.0-beta` for the specification, as the release plan named it. Its second beta would then be `1.0.0-beta.1`, the name the first package already carries, for another contract.
  - Moving the runtime to the beta and keeping the specification at `1.0.0-alpha.318`. The promise is the contract's, and the specification's version names the contract.
  - An empty changelog until the first change after the beta, as the plan named it. The first release is itself an entry, and the gate can check only an entry that exists.
  - Giving the private `package.json` a version now. No npm package is made from it yet; it takes the runtime version when the npm package is made, as the status's [packages](features-status.md#packages) set out.

<a id="d76"></a>

## D76 — DOMQL moves to Nexo's language `1.0.0-beta.40`, following its result paths

*November 3, 2026*

- **Kind:** Contract.
- **Decision:** DOMQL builds against Nexo's `8129205`, its language `1.0.0-beta.40`, and its specification advances to `1.0.0-beta.2`. A selection steps into a dictionary and a pair as Nexo's result paths do, through a dictionary's `entries` and a pair's `key` and `value`.
- **Why:**
  - Nexo's maintenance sweep, its `1.0.0-beta.21` to `1.0.0-beta.40`, fixed faults a query and a module could meet: stack overflows, a hang, unsound typing of `Any`, and texts that read otherwise than they were written.
  - A selection checks its path with Nexo's `typeAt` and reads it with `valueAt`, which now step into the form a result holds a dictionary or a pair in, so a selection reaches every part a result holds.
  - Each break the move brings is one a beta allows with guidance: the [version history](../VERSION-HISTORY.md#v1-0-0-beta-2) gives each its migration.
- **Declined:**
  - Staying on `1.0.0-beta.20`, which would keep the faults the sweep fixed.
  - Refusing a path into a dictionary or a pair in DOMQL's own check, as the specification said. A result holds them as `entries` and `key` and `value`, as a change set addresses them, so a selection that can't reach them would be the one operation that can't.

<a id="d77"></a>

## D77 — DOMQL builds against Nexo's releases

*November 3, 2026*

- **Kind:** Process.
- **Decision:** `nexo.release` pins a release of Nexo, `1.0.0-beta.1` first, and the build extracts the tree of its tag, `v1.0.0-beta.1`, where `nexo.commit` pinned a commit. Every link into Nexo names that tag, so the links move with the pin, `main` among the links it replaces. A link to another commit is a record of the past.
- **Why:**
  - Nexo now advances its language once per release and cuts each release as a signed tag, as its [D66](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/decisions.md#d66) records, so a release is what DOMQL can rely on.
  - A commit pin named one fix, and moving it rewrote a hash in 81 places across 21 documents.
  - A link to Nexo's `main` changes under DOMQL's documents, unseen.
- **Declined:** Waiting for Nexo's packages on a registry, which would keep DOMQL on a commit until they are published; the packages remain the next step, as [consuming the language](features-status.md#consuming-nexo) sets out.

<a id="d78"></a>

## D78 — The gate checks every link a document gives

*November 3, 2026*

- **Kind:** Process.
- **Decision:** A test reads every document and checks each link it gives: to DOMQL's own documents, and into Nexo. A link into Nexo names the release `nexo.release` pins, read from `.nexo`, which holds its tree, or a commit the test names as a record of the past, read from the Nexo checkout's history; CI checks out Nexo's whole history for it. Each link's document must be there, and its anchor too, an `<a id>` or a heading's as GitHub writes it.
- **Why:**
  - Moving the pin rewrote 89 links into Nexo, each checked by a script outside the gate, so a broken one could reach `main`.
  - Nexo renames a section when its subject changes, and a link at the release DOMQL pins must reach what that release holds.
- **Declined:** Allowing a link to any of Nexo's commits, which would let a link meant to follow the pin stay behind it unnoticed.

<a id="d79"></a>

## D79 — A specification version collects the changes between two releases

*November 3, 2026*

- **Kind:** Process.
- **Decision:**
  - DOMQL's specification version advances at most once per release, as Nexo's language version does. The first change to DOMQL's contract after a release opens the next version's entry, which reads *Unreleased*, and each later change joins it. The release that first implements a version dates it.
  - A release is a signed tag, `v` and its version, on the commit that dates its changelog entry. Its packages are published from that tag.
  - `1.0.0-beta.2` is the first version collected so. The versions before it stand as they were declared.
- **Why:**
  - A version a caller relies on is one a release fixes, and DOMQL's version history and Nexo's language history now follow one rule, as Nexo's [D66](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/decisions.md#d66) records.
  - It narrows [D75](#d75)'s rule that each version advances for its own reason: the specification version's reason is now a release whose contract changed.
- **Declined:** Dating a release when its packages are published, which leaves a caller nothing to pin until a registry holds them; DOMQL's packages wait for Nexo's anyway.

<a id="d80"></a>

## D80 — 1.0 waits for six requirements, and no new feature comes before it

*November 3, 2026*

- **Kind:** Process.
- **Decision:**
  - DOMQL is 1.0 once it runs on Nexo's 1.0, its contracts are settled, the C# half is decided, its packages are published, Forma's scripts run on it, and a release candidate breaks nothing, as [what 1.0 requires](features-status.md#what-1-0-requires) sets out.
  - Until then, a change fixes, explains, speeds up or documents, or meets a requirement. A feature lands only where Forma's scripts need it, as a decision records.
- **Why:**
  - The beta promised no breaking redesign, but said nothing about when breaks end.
  - DOMQL's contract holds Nexo's language, so it can be no more settled than Nexo, which waits for its own 1.0 as its [D67](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/decisions.md#d67) records.
  - The planned capabilities came from reading Forma's scripts, so running them is the test of DOMQL's contract.
- **Declined:**
  - Making the C# half a requirement, which would hold 1.0 for a design the owner hasn't decided is needed.
  - Refusing every feature without exception, which would hold 1.0 for the one its own requirement, Forma's scripts, turns out to need.

<a id="d81"></a>

## D81 — A version history entry leads with examples of what changed

*November 3, 2026*

- **Kind:** Process.
- **Decision:** From `1.0.0-beta.1` on, each entry of the [version history](../VERSION-HISTORY.md) leads with examples of what its version changed: a query's in a `domql` block, a caller's or a module's in a `js` block. Each line's comment says what it does at that version and what it did before. The entry's list follows them as the reference. Each example is run at its version when its entry is written; the gate doesn't run them.
- **Why:**
  - The list states each change precisely, but a caller migrating needs the line to write.
  - Nexo's language history follows the same rule, as its [D70](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/docs/decisions.md#d70) records, and running its examples found what `1.0.0-beta.2`'s entry here misstated: a chain's limit counts terms, and a grouped chain is written `a + b + (c + d)`.
- **Declined:** Running the history's examples in the gate, which would make a record of the past change with later versions.

<a id="d82"></a>

## D82 — A query declares its bindings' types

*November 3, 2026*

- **Kind:** Contract.
- **Decision:** `domql.query(text, bindings, { types })` declares the type of a top-level binding by its notation, which Nexo's `createBindings` binds as its [declared types](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.1/spec/runtime/bindings.md#runtime-bindings) do. Every binding made from the query keeps the types, `with`'s, an execution's update and a reaction's, and the query keeps a copy of them.
- **Why:**
  - It is the feature the 1.0 freeze allows, as [D80](#d80) records: replacing Forma's scripts needs it. Forma's input router binds its routes as `List<FormaInput.Route>` and its overrides as a dictionary of structures, and its culture coordinator binds its starting state as a structure. Data typed from itself is of no module's type, so each was refused (NEXO3042), and routes whose families carry different fields could not be bound at all.
  - Nexo already captures data as a declared type, a map as a dictionary and a set as a list, and checks it, so DOMQL passes the types through and adds no rule of its own.
  - The types belong to the query, as its text does, so rebinding it never drops them.
- **Declined:**
  - Writing the data into the query's text, which makes a new definition for each value and resolves each anew.
  - A parameter declared `Any` and every binding normalized to one shape, which gives up the checks a declared type makes.
  - Types given to `with` alone, which would let one query bind the same parameter as two types.

<a id="d83"></a>

## D83 — A kept value yields only to a writer restoring its own

*November 3, 2026*

- **Kind:** Contract.
- **Decision:** A holder that keeps its value yields to another writer only where that writer's answer, within the two frames after DOMQL wrote the value again, restores the attribute or the text the target is part of as the writer left it. A write that leaves anything else is a patch, as a framework's render is, and the holder writes its value again, however soon it comes. This refines [D70](#d70), which yielded to any change within those frames.
- **Why:**
  - Replacing Forma's scripts holds classes on elements Blazor renders: a window's `is-dragging`, a drop zone's active class, a selection bar's active class. A component's class can change as it activates and again as it takes focus, two renders a frame or so apart. A Chromium test rendering the element a frame after DOMQL wrote the class again, then again, showed the holder yield to the second render and lose the class and the property for the rest of the gesture.
  - A framework writes an attribute only as its own render changes it, so it never writes the value it wrote just before. A writer keeping a value of its own, as module code holding `lang` does, restores that value. The whole attribute, a class list or a style declaration, tells the two apart, where the class's presence, which [D70](#d70) declined to judge by, can't.
  - The specification already called the other holder a writer that "writes its own value again in answer"; the implementation judged by the time of the answer alone.
- **Declined:**
  - A longer or shorter window, which only moves the render that is lost.
  - Yielding after several answers in a row, which still loses the class to a burst of renders during a press.
  - Judging by the class's presence or the property's value alone, which a render and a holder change alike.
- **Cost:** a writer that answers with a new value each time, as code animating the property a holder keeps does, is written against once a frame until the holding ends or is updated. Two such writers of one target is a conflict in the page; the holder that should give way holds with `keep = false`.

<a id="d84"></a>

## D84 — A definition keeps the resolutions of its 16 bindings used most recently

*November 4, 2026*

- **Kind:** Implementation.
- **Decision:** DOMQL keeps a definition's resolutions by resolution key, the most recently used last, and lets go of the one used least recently beyond 16. An operation goes on holding the resolution it was made with.
- **Why:**
  - Nexo's resolution key holds every bound string, Boolean and null, since a string can select what a member reads. An owned write updated with a new position each frame, as Forma's anchored popover is, bound a string never bound before at each update, and DOMQL kept a resolution for each for as long as the text was in use. A Chromium probe of 20,000 such updates kept 75.7 MB, about 3.9 KB an update, and disposing the execution released none of it. With the bound, 40,000 updates level off at about 1 MB.
  - An operation holds its resolution through its evaluator, so the cache only shares one between operations made from the same text and key; letting one go changes nothing any operation reads.
  - In paired Chromium runs of 1,000 steps of two updates, the median of nine runs after three warm-ups, an update cycling through 900 strings, which the unbounded cache held all of, went from 15 µs to about 35 µs, since each now resolves anew. One binding a new string each time stayed about 35 µs, and one binding a number written with its unit in the text, `value = $"{x}px"`, about 12 µs.
- **Declined:**
  - Keying a resolution by the bindings whose values decided it. Nexo folds a bound value through conditions, `??`, `and`, `or`, comparisons and computed names, so telling which values decided a resolution means tracking each use in Nexo, for about 20 µs an update a number binding saves today.
  - Releasing a resolution once no operation holds it, through weak references, which would make a repeated evaluation resolve anew whenever the collector ran between two.
  - A bound by the page's memory rather than by count, which no browser API offers to a script.
