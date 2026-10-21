# Built-in vocabulary

<a id="built-in-vocabulary"></a>
<a id="vocabulary"></a>

The **built-in vocabulary** is what DOMQL's module, `domql`, declares: the DOM's types, and the module members, properties, functions, predicates, conversions, event sources and observations a query reads them through. Everything a query can ask about is a member a module contributes, DOMQL's own module and every extension by one contract, so adding a member leaves the grammar unchanged.

```domql
panel.size?.width                        // A property of an element, then a field of the size it answers.
panel:["data-key"]                       // An attribute, through the default indexer.
panel.closest(".row")                    // A function, given its selector.
panel.is("disabled")                     // A predicate, asked with is.
domql.window:media["(min-width: 40em)"]  // A named indexer of the window, a module member.
```

Properties and functions are named in camelCase, and names are case-sensitive. Built-in members expose state or event sources; actions and behaviors come from extensions. A property is read by property access, and a function is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out. A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

Lexica's own module declares the members of lists, `count`, `first`, `last`, `item`, `max`, `min`, `sum` and `where`, and the verbs `is`, `has` and `supports`; the entries below for them point to Lexica's specification, which defines them. DOMQL's event sources and event types are set out in [events](events.md).

In this document:

1. [Module members](#module-members)
2. [Types](#vocabulary-types)
3. [Measurements and layout](#vocabulary-measurements-and-layout)
4. [Properties](#properties)
5. [Functions](#functions)
6. [Predicates](#conditions)
7. [Built-in conversions](#built-in-conversions)
8. [Observations](#observations)
9. [Extension modules](#extension-modules)

<a id="module-members"></a>

## Module members

DOMQL's module, `domql`, declares two [module members](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#namespaces-module-members), read through its namespace, each with no receiver:

| Member | Type | Reads | Changes |
| --- | --- | --- | --- |
| `domql.document` | `document` | The document the query runs against, from the environment DOMQL gives its evaluator | Constant for an evaluator |
| `domql.window` | `window` | That document's window, which is also the layout viewport | Constant for an evaluator |

Neither needs a binding, and a caller's binding named `domql` is read as `~domql`.

<a id="vocabulary-types"></a>

## Types

Besides the [nodes](nodes-and-shadow-trees.md#nodes) and the window, which a query reads through and a result never holds, DOMQL's module declares structured types, which hold data, and two views, which give an element's relationships members of their own:

| Type | What it is | Fields |
| --- | --- | --- |
| `size` | A width and a height | `width`, `height`: `number` |
| `rectangle` | A box's edges and size | `left`, `top`, `right`, `bottom`, `width`, `height`: `number` |
| `selection` | A text selection's range | `start`, `end`: `number` |
| `grid` | A grid's column tracks | `columns`: `list<number>` |
| `shadow` | An element's [shadow view](nodes-and-shadow-trees.md#shadow-trees-the-view) | None, since it has no data form |
| `aria` | An element's [ARIA view](#conditions) | None, since it has no data form |

A field of a structured value, such as a rectangle's `width`, is data the value holds, read by property access, and is constant for that value. Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are. The types of event data are set out in [events](events.md#event-types).

<a id="vocabulary-measurements-and-layout"></a>
<a id="elements-without-a-layout-box"></a>

## Measurements and layout

Measurements use CSS pixels unless stated otherwise. An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout. A watch that read null of a detached element follows it back into the document, as [elements that leave the document](watching.md#elements-that-leave-the-document) sets out.

<a id="properties"></a>

## Properties

A property exposes a value, read by property access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as [how DOMQL's members read](evaluation.md#evaluation-how-members-read) and [how a member changes](watching.md#how-a-member-changes) define.

| Receiver | Property | Type |
| --- | --- | --- |
| Window | [`size`](#property-window-size) | `size` |
| Window | [`devicePixelRatio`](#property-window-devicepixelratio) | `number` |
| Element | [`rect`](#property-element-rect) | `rectangle?` |
| Element | [`size`](#property-element-size) | `size?` |
| Element | [`clientSize`](#property-element-clientsize) | `size?` |
| Element | [`grid`](#property-element-grid) | `grid?` |
| Element | [`selection`](#property-element-selection) | `selection?` |
| Node | [`children`](#property-node-children) | `list<element>` |
| Node | [`parent`](#property-node-parent) | `node?` |
| Node | [`root`](#property-node-root) | `node` |
| Node | [`host`](#property-node-host) | `element?` |
| Element | [`shadow`](#property-element-shadow) | `shadow` |
| Element | [`aria`](#property-element-aria) | `aria` |
| Shadow view | [`root`](#property-shadow-view-root) | `shadowRoot?` |
| Shadow view | [`elements`](#property-shadow-view-elements) | `list<element>?` |
| Element | [`attached`](#property-element-attached) | `boolean` |
| Element | [`hasChildren`](#property-element-haschildren) | `boolean` |
| Element | [`hasSelection`](#property-element-hasselection) | `boolean` |

<a id="property-window-size"></a>

<a id="properties-window-size"></a>

### Window: size

**Type:** `size`   **Reads:** Fresh

**Result.** The layout viewport's `width` and `height`, excluding scrollbars

**Changes.** Observable, a viewport scrollbar appearing or going included: the window's `resize` and its visual viewport's `resize` are observed

<a id="property-window-devicepixelratio"></a>

<a id="properties-window-devicepixelratio"></a>

### Window: devicePixelRatio

**Type:** `number`   **Reads:** Fresh

**Result.** Device pixels per CSS pixel

**Changes.** Observable

<a id="property-element-rect"></a>

<a id="properties-element-rect"></a>

### Element: rect

**Type:** `rectangle?`   **Reads:** Fresh

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport

**Changes.** Partly observable: its own size, the scrolling of its scroll containers, the window's size and the structure of the trees it is in are observed; a move none of them causes, as a sibling before it growing or a margin or padding around it changing, and transforms and animations, are not

<a id="property-element-size"></a>

<a id="properties-element-size"></a>

### Element: size

**Type:** `size?`   **Reads:** Fresh

**Result.** Its border box's `width` and `height`

**Changes.** Observable

<a id="property-element-clientsize"></a>

<a id="properties-element-clientsize"></a>

### Element: clientSize

**Type:** `size?`   **Reads:** Fresh

**Result.** Its padding box's `width` and `height`, without scrollbars

**Changes.** Partly observable: its border box and its content box are observed, so a scrollbar appearing or going and a border changing are; a border and padding changing so that one grows by as much as the other shrinks, which leaves both boxes as they were, is not

<a id="property-element-grid"></a>

<a id="properties-element-grid"></a>

### Element: grid

**Type:** `grid?`   **Reads:** Fresh

**Result.** Its grid's `columns`, the sizes of its column tracks, an empty list for an element that is no grid, and null while it has no layout box

**Changes.** Partly observable, as `style`

<a id="property-element-selection"></a>

<a id="properties-element-selection"></a>

### Element: selection

**Type:** `selection?`   **Reads:** Fresh

**Result.** Its selection's `start` and `end`, null for an element whose selection the browser does not expose: one that is no text input or text area, and an input of a type the selection API excludes, as `number`, `email` and `date` are

**Changes.** Partly observable: input and selection events are observed, assignments by script are not

<a id="property-node-children"></a>

<a id="properties-node-children"></a>

### Node: children

**Type:** `list<element>`   **Reads:** Fresh

**Result.** Its child elements, in document order

**Changes.** Observable

<a id="property-node-parent"></a>

<a id="properties-node-parent"></a>

### Node: parent

**Type:** `node?`   **Reads:** Fresh

**Result.** Its parent in the DOM tree: a shadow root for the nodes directly in it, and null for a document, a document fragment, a shadow root and the topmost element of a detached tree, so it never crosses a shadow boundary

**Changes.** Partly observable: its detached tree inserted into another detached tree or into a shadow root is not observed

<a id="property-node-root"></a>

<a id="properties-node-root"></a>

### Node: root

**Type:** `node`   **Reads:** Fresh

**Result.** The root of its tree: the document, a document fragment, the shadow root it is in, or the topmost element of a detached tree

**Changes.** Partly observable, as `parent`

<a id="property-node-host"></a>

<a id="properties-node-host"></a>

### Node: host

**Type:** `element?`   **Reads:** Fresh

**Result.** A shadow root's host, and null for any other node

**Changes.** Constant

<a id="property-element-shadow"></a>

<a id="properties-element-shadow"></a>

### Element: shadow

**Type:** `shadow`   **Reads:** Fresh

**Result.** Its view of its shadow relationships

**Changes.** Constant

<a id="property-element-aria"></a>

<a id="properties-element-aria"></a>

### Element: aria

**Type:** `aria`   **Reads:** Fresh

**Result.** Its view of its ARIA states, whose [predicates](#conditions) `is` tests and whose default indexer reads its ARIA attributes

**Changes.** Constant

<a id="property-shadow-view-root"></a>

<a id="properties-shadow-view-root"></a>

### Shadow view: root

**Type:** `shadowRoot?`   **Reads:** Fresh

**Result.** The open shadow root its element hosts, null where it hosts none or a closed one

**Changes.** Partly observable: a root attached as its element connects to its document is observed, one attached at any other time is not

<a id="property-shadow-view-elements"></a>

<a id="properties-shadow-view-elements"></a>

### Shadow view: elements

**Type:** `list<element>?`   **Reads:** Fresh

**Result.** The elements its slot shows, flattened, as [`shadow.elements`](nodes-and-shadow-trees.md#shadow-trees-shadowelements) sets out, and null for an element that is no slot

**Changes.** Partly observable: assignment, the fallback and the slot's moves are observed; its detached tree inserted into a shadow tree that assigns it nothing is not

<a id="property-element-attached"></a>

<a id="properties-element-attached"></a>

### Element: attached

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether the element is attached to the document, including through a shadow root

**Changes.** Partly observable: the structure of the document and of every shadow root between the element and the document is observed; its detached tree inserted into a shadow root in the document is not

<a id="property-element-haschildren"></a>

<a id="properties-element-haschildren"></a>

### Element: hasChildren

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether it has at least one child element

**Changes.** Observable, through its child list

<a id="property-element-hasselection"></a>

<a id="properties-element-hasselection"></a>

### Element: hasSelection

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether a selection of at least one character lies within it: a non-collapsed selection in a text input or text area, or a non-collapsed document selection within its content; a collapsed caret is no selection

**Changes.** Partly observable: input and selection events are observed, assignments by script are not

<a id="property-list-count-first-last"></a>

<a id="properties-list-count-first-last"></a>

### List: count, first, last

`count`, `first` and `last` are properties [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-list-members) declares, which owns lists, and Lexica's specification defines.

<a id="functions"></a>

## Functions

A function performs a lookup, a calculation or a selection with the argument it is given. A name with parentheses, as `closest(selector)`, is a call, `it.closest(".row")`; a name in brackets after a colon, as `:attribute[name]`, is a named indexer, `it:attribute["data-key"]`; and braces show an options object, whose fields supply the parameters, as `intersects({ root, margin })` does, `it.intersects({ root = panel })`.

Each function states what it answers, how its result changes, how it reads, and which of its parameters are fixed.

| Receiver | Function |
| --- | --- |
| Window | [`:media[query]`](#function-window-media) |
| Element | [`:attribute[name]`, the default indexer, `:[name]`](#function-element-attribute) |
| ARIA view | [`:attribute[name]`, the default indexer, `:[name]`](#function-aria-view-attribute) |
| Element | [`:class[name]`](#function-element-class) |
| Element | [`:style[property]`](#function-element-style) |
| Element | [`intersects({ root, margin })`](#function-element-intersects) |
| Element | [`overlaps({ other, margin })`](#function-element-overlaps) |
| Element | [`matches(selector)`](#function-element-matches) |
| Element | [`rectRelativeTo(relativeTo)`](#function-element-rectrelativeto) |
| Element | [`closest(selector)`](#function-element-closest) |
| Node | [`first(selector)`, `all(selector)`](#function-node-first-all) |

<a id="function-window-media"></a>

<a id="functions-window-media"></a>

### Window: media

**Syntax:** `:media[query]`   **Signature:** `query`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether the media query matches

**Changes.** Observable: the query's matching, as the browser reports it changing

<a id="function-element-attribute"></a>

<a id="functions-element-attribute"></a>

### Element: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The attribute's value

**Changes.** Observable

<a id="function-aria-view-attribute"></a>

<a id="functions-aria-view-attribute"></a>

### ARIA view: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The value of the element's own attribute `aria-` and the name, as the element's `:attribute` reads it, so `it.aria:["checked"]` is `it:["aria-checked"]`: the string as written, or null where the attribute is absent, never a Boolean

**Changes.** Observable: that attribute

<a id="function-element-class"></a>

<a id="functions-element-class"></a>

### Element: class

**Syntax:** `:class[name]`   **Signature:** `name`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its class list holds the class, one token: an empty name, or one holding a tab, a line feed, a form feed, a carriage return or a space, is an evaluation error

**Changes.** Observable: its `class` attribute

<a id="function-any-is-has-supports"></a>

<a id="functions-any-is-has-supports"></a>

### Any: is, has, supports

`is`, `has` and `supports` are [Lexica's verbs](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#predicates), which ask a predicate by its name; DOMQL declares the predicates they ask of its receivers, as [predicates](#conditions) set out.

<a id="function-element-style"></a>

<a id="functions-element-style"></a>

### Element: style

**Syntax:** `:style[property]`   **Signature:** `property`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The property's computed value, custom properties included, null where the element is detached or the value is empty

**Changes.** Partly observable: its own size and attributes are observed, rules matching from elsewhere are not

<a id="function-element-intersects"></a>

<a id="functions-element-intersects"></a>

### Element: intersects

**Syntax:** `intersects({ root, margin })`   **Signature:** optional `root`: `element?`, the window when omitted or null; optional `margin`: `number`, 0 when omitted → `boolean?`   **Reads:** Maintained   **Fixed arguments:** None

**Result.** Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it

**Changes.** Observable

<a id="function-element-overlaps"></a>

<a id="functions-element-overlaps"></a>

### Element: overlaps

**Syntax:** `overlaps({ other, margin })`   **Signature:** required `other`: `element`; optional `margin`: `number`, 0 when omitted → `boolean?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its border box overlaps the other's, grown by the margin, compared as rectangles, null where either has no layout box, and, as `other` propagates null, where `other` is null

**Changes.** Partly observable, as `rect`, and the size of `other`

<a id="function-element-matches"></a>

<a id="functions-element-matches"></a>

### Element: matches

**Syntax:** `matches(selector)`   **Signature:** `selector`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether it matches the selector

**Changes.** Partly observable: attributes, structure, focus and popovers opening and closing, `:popover-open`, are observed; pointer state such as `:hover` and control state such as `:checked` are not

<a id="function-element-rectrelativeto"></a>

<a id="functions-element-rectrelativeto"></a>

### Element: rectRelativeTo

**Syntax:** `rectRelativeTo(relativeTo)`   **Signature:** `relativeTo`: `element` → `rectangle?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box, null where either has no layout box, and, as `relativeTo` propagates null, where `relativeTo` is null

**Changes.** Partly observable, as `rect`, and the size of `relativeTo`

<a id="function-element-closest"></a>

<a id="functions-element-closest"></a>

### Element: closest

**Syntax:** `closest(selector)`   **Signature:** `selector`: `string` → `element?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The nearest matching ancestor, itself included

**Changes.** Partly observable, as `matches`

<a id="function-node-first-all"></a>

<a id="functions-node-first-all"></a>

### Node: first, all

**Syntax:** `first(selector)`, `all(selector)`   **Signature:** `selector`: `string` → `element?`, `list<element>`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The first matching descendant, and the matching descendants in document order, within its own tree

**Changes.** Partly observable, as `matches`

<a id="function-list-item"></a>

<a id="functions-list-item"></a>

### List: item

`:item[index]`, the default indexer `:[index]`, is a function [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-list-members) declares, which owns lists, and Lexica's specification defines.

<a id="function-list-max-min-sum"></a>

<a id="functions-list-max-min-sum"></a>

### List: max, min, sum

`max`, `min` and `sum` are functions [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-list-members) declares, which owns lists, and Lexica's specification defines.

<a id="function-list-where"></a>

<a id="functions-list-where"></a>

### List: where

`where` is a function [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-list-members) declares, which owns lists, and Lexica's specification defines.

<a id="conditions"></a>

<a id="predicates"></a>

## Predicates

DOMQL's predicates ask the DOM with Lexica's three verbs: `is` a state the user, the browser or the page sets and clears over time, `it.is("checked")`; `has` a possession or a presence, `it.has("focus")`; and `supports` a capability, `domql.window.supports("share")`.

Each follows [Lexica's predicate contract](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#predicates): it is asked with its one verb, its name is fixed, it applies to the receivers it declares, and it answers a Boolean or fails the evaluation. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it, as `attached`, `hasChildren` and `hasSelection` are, and `has` with the name of a presence such as `has("children")` is refused naming the property that answers it, `hasChildren`. Predicates compose as Booleans do: `it:class["open"] and it.has("focus-within")`.

<a id="conditions-condition-declarations"></a>

<a id="conditions-fixed-condition-names"></a>

<a id="conditions-receiver-types"></a>

<a id="conditions-it-is-a-call-as-any-other"></a>

<a id="conditions-boolean-result"></a>

<a id="conditions-conditions-compose-as-booleans-do"></a>

The built-in vocabulary declares these predicates, each asked with `is` but where the table names its verb, and each with its native semantics: what the browser itself decides, as its pseudo-class matches, as the document reports its own state, or as the browser offers an API.

| Receiver | Predicate |
| --- | --- |
| Element | [`disabled`](#condition-element-is-disabled) |
| Element | [`readonly`](#condition-element-is-readonly) |
| Element | [`text-editable`](#condition-element-is-text-editable) |
| Element | [`focus`, asked with `has`](#condition-element-has-focus) |
| Element | [`focus-within`, asked with `has`](#condition-element-has-focus-within) |
| Element | [`hover`](#condition-element-is-hover) |
| Element | [`popover-open`](#condition-element-is-popover-open) |
| Element | [`checked`](#condition-element-is-checked) |
| Document | [`visible`](#condition-document-is-visible) |
| Document | [`focus`, asked with `has`](#condition-document-has-focus) |
| Window | [`share`, asked with `supports`](#condition-window-supports-share) |
| Window | [`clipboard`, asked with `supports`](#condition-window-supports-clipboard) |

<a id="condition-element-is-disabled"></a>

<a id="conditions-element-isdisabled"></a>

### Element: is("disabled")

**Reads:** Fresh

**True when.** The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `it:["disabled"]`, a separate question

**Changes.** Observable: its own and its ancestors' `disabled` attributes and the structure between them

<a id="condition-element-is-readonly"></a>

<a id="conditions-element-isreadonly"></a>

### Element: is("readonly")

**Reads:** Fresh

**True when.** Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes

**Changes.** Observable: its `readonly` and `type` attributes

<a id="condition-element-is-text-editable"></a>

<a id="conditions-element-istext-editable"></a>

### Element: is("text-editable")

**Reads:** Fresh

**True when.** The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, as the nearest `contenteditable` of a state, its own or an ancestor's, decides: `true`, the empty value and `plaintext-only` make it editable and `false` does not, while an invalid value, `inherit` among them, inherits, as the attribute does natively; where none decides, the document's design mode does.

An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root

**Changes.** Partly observable: everything `disabled` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not

<a id="condition-element-has-focus"></a>

<a id="conditions-element-hasfocus"></a>

### Element: has("focus")

**Reads:** Fresh

**True when.** It is the focused element of its tree

**Changes.** Observable: focus moving, and the focused element removed, which moves focus away

<a id="condition-element-has-focus-within"></a>

<a id="conditions-element-hasfocus-within"></a>

### Element: has("focus-within")

**Reads:** Fresh

**True when.** It matches `:focus-within`: it or an element within it is focused, across the shadow trees it hosts

**Changes.** Observable, as `focus` is

<a id="condition-element-is-hover"></a>

<a id="conditions-element-ishover"></a>

### Element: is("hover")

**Reads:** Fresh

**True when.** It matches `:hover`: the pointer is over it or over an element within it

**Changes.** Partly observable: the pointer moving over and off elements is observed; an element moving under a pointer that does not move, where the browser fires no pointer event for it, is not

<a id="condition-element-is-popover-open"></a>

<a id="conditions-element-ispopover-open"></a>

### Element: is("popover-open")

**Reads:** Fresh

**True when.** It matches `:popover-open`: it is a popover that is showing

**Changes.** Observable: its showing and hiding, its `popover` attribute removed and its removal included

<a id="condition-element-is-checked"></a>

<a id="conditions-element-ischecked"></a>

### Element: is("checked")

**Reads:** Fresh

**True when.** It matches `:checked`: a checked checkbox or radio button, or a selected option

**Changes.** Partly observable: the user's input in its tree, a radio button another of its group unchecks and an option its select changes included, form resets, the `checked` and `selected` attributes and the structure of its tree are observed; a script setting `checked` or `selected`, or a select's `value` or `selectedIndex`, fires no event and is not

<a id="condition-document-is-visible"></a>

<a id="conditions-document-isvisible"></a>

### Document: is("visible")

**Reads:** Fresh

**True when.** The document is visible

**Changes.** Observable

<a id="condition-document-has-focus"></a>

<a id="conditions-document-hasfocus"></a>

### Document: has("focus")

**Reads:** Fresh

**True when.** Focus is anywhere within the document

**Changes.** Observable

<a id="condition-window-supports-share"></a>

<a id="conditions-window-supportsshare"></a>

### Window: supports("share")

**Reads:** Fresh

**True when.** The browser offers the Web Share API, `navigator.share`, in this context; it says nothing of whether a particular share succeeds, which takes the user's activation, data the browser can share and the user's choice

**Changes.** Constant

<a id="condition-window-supports-clipboard"></a>

<a id="conditions-window-supportsclipboard"></a>

### Window: supports("clipboard")

**Reads:** Fresh

**True when.** The browser offers the asynchronous clipboard, `navigator.clipboard`, which it does in a secure context alone; it says nothing of whether reading or writing is permitted, which the user and the browser decide when it is asked

**Changes.** Constant

A predicate's ARIA counterpart is no part of it: `it.is("checked")` is what `:checked` matches, whatever `aria-checked` says. An element's ARIA states are predicates of its ARIA view, `it.aria`, a value of the type `aria`, which has no data form, so a result never holds one, and `it.aria.is("checked")` tests one.

Each reads the element's own attribute under a contract of its own, falling back on no native state, and observes that attribute:

| Receiver | Predicate |
| --- | --- |
| ARIA view | [`checked`](#condition-aria-view-is-checked) |
| ARIA view | [`disabled`](#condition-aria-view-is-disabled) |

<a id="condition-aria-view-is-checked"></a>

<a id="conditions-aria-view-ischecked"></a>

### ARIA view: is("checked")

**Reads:** Fresh

**True when.** The element's own `aria-checked` is `true`, compared ignoring ASCII case; a missing attribute, `false`, `mixed`, the empty string and any other value, padded with spaces included, answer false

**Changes.** Observable: its `aria-checked` attribute

<a id="condition-aria-view-is-disabled"></a>

<a id="conditions-aria-view-isdisabled"></a>

### ARIA view: is("disabled")

**Reads:** Fresh

**True when.** The element's own `aria-disabled` is `true`, compared as `checked` compares; an ancestor's `aria-disabled` is not read

**Changes.** Observable: its `aria-disabled` attribute

So `it.is("checked") or it.aria.is("checked")` is whether either says checked, and `it.aria:["checked"] == "mixed"` tells a mixed state, which an ARIA predicate answers false for, from the others. The ARIA view's default indexer reads the attribute written on the element, as `it:["aria-checked"]` does, and never the element's effective accessibility state.

No other ARIA attribute is a predicate until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean; an extension declares one on the ARIA view, a type it does not own, as the [rules for extensions](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#extensions) let any module do.

<a id="conditions-related-questions"></a>

### Related questions

`it.has("focus")` asks whether the element itself is focused, `it.has("focus-within")` whether focus is anywhere within it, and an extension can offer richer focus semantics, as a predicate of elements under its module's own name or as predicates of its own types; they are separate questions with separate names.

`readonly` and `text-editable` are separate questions too, and neither is the other's opposite:

| Element | `readonly` | `text-editable` |
| --- | --- | --- |
| An enabled, writable text input | false | true |
| A read-only text input | true | false |
| A disabled text input without `readonly` | false | false |
| An ordinary static element | false | false |
| An editable content region | false | true |

<a id="built-in-conversions"></a>

## Built-in conversions

The built-in vocabulary declares four conversions, each rejecting a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `string` | `number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `number` | `string` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `boolean` | `string` | `"true"` or `"false"` |
| `string` | `boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

<a id="observations"></a>

## Observations

A member names the [observations](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#observations) that cover its changes, each by its type and its target, and DOMQL starts each one that a watch, a waiting evaluation or an event's object expression needs, and stops it once nothing needs it. DOMQL's module declares the browser's observations as eight observation types, which the members of any module can name, and four observation targets.

<a id="observations-types"></a>

### Observation types

Each type is shared by equivalent requests, those of the same target and the same arguments of its identity in the same window, so two requests that differ in an argument that changes what is observed, such as an intersection's root or margin, never share.

| Type | Contract | Observes | Arguments | Identity |
| --- | --- | --- | --- | --- |
| `resize` | Invalidation | The size of an element's box, or of the window's layout viewport, a viewport scrollbar appearing or going included | `box`: the box `ResizeObserver` observes, `border-box` when omitted, or `client`, the border box and the content box both | `box` |
| `mutation` | Invalidation | A node's attributes, its children or its text, and its descendants' where `subtree` says so | `attributes`: `true`, or a list of attribute names; `childList`, `subtree` and `characterData`, Booleans, false when omitted; at least one of attributes, children and text is observed | All four |
| `attachment` | Invalidation | Whether a node is attached to its document, through every shadow root between them, a node another document owns inserted into the window's document included | None | None |
| `intersection` | Maintained | Whether the browser reports an element intersecting a root, or the window where the root is null, grown by a margin in CSS pixels; pending until its first report | `root`, an element or null, null when omitted; `margin`, a number, 0 when omitted | `root`, `margin` |
| `media` | Invalidation | Whether a media query matches | `query`, the media query | `query` |
| `pixelRatio` | Invalidation | The device pixel ratio | None | None |
| `event` | Invalidation | Events of the given types reaching the target, or reaching it in the capture phase | `types`, a list of event types; `capture`, a Boolean, false when omitted | `types`, `capture` |
| `visibility` | Invalidation | Whether the document is visible | None | None |

<a id="observations-targets"></a>

### Observation targets

An observation observes its member's receiver, an argument, `{ argument }`, or a target DOMQL's module declares, as Lexica's [observation targets](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#observations-targets) set out:

| Target | Found from the receiver | Observes |
| --- | --- | --- |
| `window` | No | The window the query runs against |
| `document` | No | The document the query runs against |
| `root` | Yes, one target | The receiver's [root](nodes-and-shadow-trees.md#trees-and-slots) |
| `roots` | Yes, several targets | The receiver's [roots](nodes-and-shadow-trees.md#trees-and-slots), which no maintained observation observes, since it gives its member one sample |

DOMQL resolves each target as it starts an observation, and each evaluation that reaches the member finds `root` and `roots` again, so a watch observes the trees its receiver is in as the receiver moves, as [trees and slots a watch follows](watching.md#trees-and-slots-a-watch-follows) set out.

<a id="extension-modules"></a>

## Extension modules

A module extends the built-in vocabulary as Lexica's [modules](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#modules) set out: it declares types of its own, and members, predicates, event types, observation types and conversions on its own types or, under the [rules for extensions](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#extensions), on DOMQL's. `domql.createModule(name, contents)` creates one from its declarations, each that runs code carrying its implementation, and `domql.registerModule(module)` registers it in the instance's registry, which holds DOMQL's module and every module registered with it. A request is resolved against the vocabulary registered when it is first carried out, so a module a query names is registered beforehand, once, rather than for every evaluation.

- **What an implementation receives.** Every implementation receives the one object Lexica's [implementations](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-what-an-implementation-receives) receive, whose `env` holds the `window` and the `document` the query runs against.
- **Reading.** A member's implementation is synchronous and reads alone, as Lexica requires of every vocabulary, so evaluating, watching and subscribing change nothing; a change to the page is an [action or a behavior](actions-and-behaviors.md).
- **Observations.** A member of any module names DOMQL's observation types and targets as DOMQL's own members do. An observation type a module declares is started by its implementation, which receives `request`, the observation's `type`, its `target` and its `arguments`, each argument the member names resolved to its value; `notify`, which it calls when what it observes may have changed; and `env`. It answers an object whose `stop()` ends the observation and, for a maintained observation, whose `sample()` answers its latest sample, `{ pending, value }`.
