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
  - A member's argument form is positional or options, never both, and `on("click")` keeps its form, so the option is a structured value its parameter constructs from the object expression written there, as Nexo's [constructing a structure](https://github.com/FormaUI/Nexo/blob/2cb596ea0d1a1fc624552783b30139379124bb67/spec/language/types.md#types-constructing-a-structure) sets out.
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
