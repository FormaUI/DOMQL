# Built-in vocabulary

<a id="built-in-vocabulary"></a>
<a id="vocabulary"></a>

The **built-in vocabulary** is what DOMQL's module, `domql`, declares: the DOM's types, and the module members, properties, functions, Boolean functions among them, event sources and observations a query reads them through. Everything a query can ask about is a member a module contributes, DOMQL's own module and every extension by one contract, so adding a member leaves the grammar unchanged.

```domql
panel.size?.width                        // A property of an element, then a field of the size it answers.
panel:["data-key"]                       // An attribute, through the default indexer.
panel.closest(".row")                    // A function, given its selector.
panel.disabled()                         // A Boolean function, which tests the element.
domql.window:media["(min-width: 40em)"]  // A named indexer of the window, a module member.
```

Properties and functions are named in camelCase, and names are case-sensitive. Built-in members expose state or event sources; executions come from extensions. A property is read by property access, and a function is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out. A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

Lexica's own module declares the members of lists, `count`, `first`, `last`, `item`, `max`, `min`, `sum` and `where`, and the verbs `is`, `has` and `supports`; the entries below for them point to Lexica's specification, which defines them. DOMQL's event sources and event types are set out in [events](events.md).

In this document:

1. [Module members](#module-members)
2. [Types](#vocabulary-types)
3. [Measurements and layout](#vocabulary-measurements-and-layout)
4. [Properties](#properties)
5. [Functions](#functions)
6. [Boolean functions](#boolean-functions)
7. [Built-in conversions](#built-in-conversions)
8. [Observations](#observations)
9. [Extension modules](#extension-modules)

<a id="module-members"></a>

## Module members

DOMQL's module, `domql`, declares two [module members](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#namespaces-module-members), read through its namespace, each with no receiver:

| Member | Type | Reads | Changes |
| --- | --- | --- | --- |
| `domql.document` | `Document` | The document the query runs against, from the environment DOMQL gives its evaluator | Constant for an evaluator |
| `domql.window` | `Window` | That document's window, which is also the layout viewport | Constant for an evaluator |

Neither needs a binding, and a caller's binding named `domql` is read as `~domql`.

<a id="vocabulary-types"></a>

## Types

DOMQL's module declares each of its types with its members, as Lexica's [declaring a type](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#modules-declaring-a-type) sets out: its reference types, which a query reads through and a result never holds, and its structured types, which hold data. Its `typeOf` recognizes the values a host binds, and each reference type's `isInstance` checks membership:

| Reference type | Supertype | What it is | Where a value has the type |
| --- | --- | --- | --- |
| `Node` | None, abstract | A [node](nodes-and-shadow-trees.md#nodes) of the DOM tree | A member's result, as `parent`'s and `root`'s, or a declared binding; never `typeOf`, since it is abstract |
| `Element`, `Document`, `DocumentFragment`, `ShadowRoot` | `Node` | The kinds of node | DOMQL's `typeOf`, a member's result, as the items of `children` are, or a declared binding |
| `Window` | None | The window a query runs in | DOMQL's `typeOf`, `domql.window`'s result, or a declared binding |
| `Shadow` | None | An element's [shadow view](nodes-and-shadow-trees.md#shadow-trees-the-view) | An element's `shadow`, or a declared binding |
| `Aria` | None | An element's [ARIA view](#conditions) | An element's `aria`, or a declared binding |

`Shadow` and `Aria` are views: an element's `shadow` and `aria` answer the element itself, of the view's type, whose `isInstance` accepts every element, and no wrapper is made or kept. DOMQL's `typeOf` never answers a view, and neither view is cast to from an `Element`, since memberships that accept one value relate no types. `Aria` declares a cast to `Element`, without an `impl`, so `(panel.aria as Element).aria` reads the element's view again. Each node type, `Window` and each view has no data form, so no result holds one.

| Structured type | What it is | Fields |
| --- | --- | --- |
| `Size` | A width and a height | `width`, `height`: `Number` |
| `Rectangle` | A box's edges and size | `left`, `top`, `right`, `bottom`, `width`, `height`: `Number` |
| `Selection` | A text selection's range | `start`, `end`: `Number` |
| `Grid` | A grid's column tracks | `columns`: `List<Number>` |

`on`, an event source, is one declaration DOMQL's module gives each of `Element`, `Document` and `Window`, the receivers it listens on.

A field of a structured value, such as a rectangle's `width`, is data the value holds, read by property access, and is constant for that value. Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are. The types of event data are set out in [events](events.md#event-types).

<a id="vocabulary-measurements-and-layout"></a>
<a id="elements-without-a-layout-box"></a>

## Measurements and layout

Measurements use CSS pixels unless stated otherwise. An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout. A watch that read null of a detached element follows it back into the document, as [elements that leave the document](watches.md#elements-that-leave-the-document) sets out.

<a id="properties"></a>

## Properties

A property exposes a value, read by property access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as [how DOMQL's members read](evaluation.md#evaluation-how-members-read) and [how a member changes](watches.md#how-a-member-changes) define.

| Receiver | Property | Type |
| --- | --- | --- |
| Window | [`size`](#property-window-size) | `Size` |
| Window | [`devicePixelRatio`](#property-window-devicepixelratio) | `Number` |
| Element | [`rect`](#property-element-rect) | `Rectangle?` |
| Element | [`size`](#property-element-size) | `Size?` |
| Element | [`clientSize`](#property-element-clientsize) | `Size?` |
| Element | [`grid`](#property-element-grid) | `Grid?` |
| Element | [`selection`](#property-element-selection) | `Selection?` |
| Node | [`children`](#property-node-children) | `List<Element>` |
| Node | [`parent`](#property-node-parent) | `Node?` |
| Node | [`root`](#property-node-root) | `Node` |
| Node | [`host`](#property-node-host) | `Element?` |
| Element | [`shadow`](#property-element-shadow) | `Shadow` |
| Element | [`aria`](#property-element-aria) | `Aria` |
| Shadow view | [`root`](#property-shadow-view-root) | `ShadowRoot?` |
| Shadow view | [`elements`](#property-shadow-view-elements) | `List<Element>?` |
| Element | [`attached`](#property-element-attached) | `Boolean` |
| Element | [`hasChildren`](#property-element-haschildren) | `Boolean` |
| Element | [`hasSelection`](#property-element-hasselection) | `Boolean` |

<a id="property-window-size"></a>

<a id="properties-window-size"></a>

### Window: size

**Type:** `Size`   **Reads:** Fresh

**Result.** The layout viewport's `width` and `height`, excluding scrollbars

**Changes.** Observable, a viewport scrollbar appearing or going included: the window's `resize` and its visual viewport's `resize` are observed

<a id="property-window-devicepixelratio"></a>

<a id="properties-window-devicepixelratio"></a>

### Window: devicePixelRatio

**Type:** `Number`   **Reads:** Fresh

**Result.** Device pixels per CSS pixel

**Changes.** Observable

<a id="property-element-rect"></a>

<a id="properties-element-rect"></a>

### Element: rect

**Type:** `Rectangle?`   **Reads:** Fresh

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport

**Changes.** Partly observable: its own size, the scrolling of its scroll containers, the window's size and the structure of the trees it is in are observed; a move none of them causes, as a sibling before it growing or a margin or padding around it changing, and transforms and animations, are not

<a id="property-element-size"></a>

<a id="properties-element-size"></a>

### Element: size

**Type:** `Size?`   **Reads:** Fresh

**Result.** Its border box's `width` and `height`

**Changes.** Observable

<a id="property-element-clientsize"></a>

<a id="properties-element-clientsize"></a>

### Element: clientSize

**Type:** `Size?`   **Reads:** Fresh

**Result.** Its padding box's `width` and `height`, without scrollbars

**Changes.** Partly observable: its border box and its content box are observed, so a scrollbar appearing or going and a border changing are; a border and padding changing so that one grows by as much as the other shrinks, which leaves both boxes as they were, is not

<a id="property-element-grid"></a>

<a id="properties-element-grid"></a>

### Element: grid

**Type:** `Grid?`   **Reads:** Fresh

**Result.** Its grid's `columns`, the sizes of its column tracks, an empty list for an element that is no grid, and null while it has no layout box

**Changes.** Partly observable, as `style`

<a id="property-element-selection"></a>

<a id="properties-element-selection"></a>

### Element: selection

**Type:** `Selection?`   **Reads:** Fresh

**Result.** Its selection's `start` and `end`, null for an element whose selection the browser does not expose: one that is no text input or text area, and an input of a type the selection API excludes, as `Number`, `email` and `date` are

**Changes.** Partly observable: input and selection events are observed, a selection the page's code sets is not

<a id="property-node-children"></a>

<a id="properties-node-children"></a>

### Node: children

**Type:** `List<Element>`   **Reads:** Fresh

**Result.** Its child elements, in document order

**Changes.** Observable

<a id="property-node-parent"></a>

<a id="properties-node-parent"></a>

### Node: parent

**Type:** `Node?`   **Reads:** Fresh

**Result.** Its parent in the DOM tree: a shadow root for the nodes directly in it, and null for a document, a document fragment, a shadow root and the topmost element of a detached tree, so it never crosses a shadow boundary

**Changes.** Partly observable: its detached tree inserted into another detached tree or into a shadow root is not observed

<a id="property-node-root"></a>

<a id="properties-node-root"></a>

### Node: root

**Type:** `Node`   **Reads:** Fresh

**Result.** The root of its tree: the document, a document fragment, the shadow root it is in, or the topmost element of a detached tree

**Changes.** Partly observable, as `parent`

<a id="property-node-host"></a>

<a id="properties-node-host"></a>

### Node: host

**Type:** `Element?`   **Reads:** Fresh

**Result.** A shadow root's host, and null for any other node

**Changes.** Constant

<a id="property-element-shadow"></a>

<a id="properties-element-shadow"></a>

### Element: shadow

**Type:** `Shadow`   **Reads:** Fresh

**Result.** Its view of its shadow relationships

**Changes.** Constant

<a id="property-element-aria"></a>

<a id="properties-element-aria"></a>

### Element: aria

**Type:** `Aria`   **Reads:** Fresh

**Result.** Its view of its ARIA states, which its [Boolean functions](#boolean-functions) test and its default indexer reads as its ARIA attributes

**Changes.** Constant

<a id="property-shadow-view-root"></a>

<a id="properties-shadow-view-root"></a>

### Shadow view: root

**Type:** `ShadowRoot?`   **Reads:** Fresh

**Result.** The open shadow root its element hosts, null where it hosts none or a closed one

**Changes.** Partly observable: a root attached as its element connects to its document is observed, one attached at any other time is not

<a id="property-shadow-view-elements"></a>

<a id="properties-shadow-view-elements"></a>

### Shadow view: elements

**Type:** `List<Element>?`   **Reads:** Fresh

**Result.** The elements its slot shows, flattened, as [`shadow.elements`](nodes-and-shadow-trees.md#shadow-trees-shadowelements) sets out, and null for an element that is no slot

**Changes.** Partly observable: assignment, the fallback and the slot's moves are observed; its detached tree inserted into a shadow tree that assigns it nothing is not

<a id="property-element-attached"></a>

<a id="properties-element-attached"></a>

### Element: attached

**Type:** `Boolean`   **Reads:** Fresh

**Result.** Whether the element is attached to the document, including through a shadow root

**Changes.** Partly observable: the structure of the document and of every shadow root between the element and the document is observed; its detached tree inserted into a shadow root in the document is not

<a id="property-element-haschildren"></a>

<a id="properties-element-haschildren"></a>

### Element: hasChildren

**Type:** `Boolean`   **Reads:** Fresh

**Result.** Whether it has at least one child element

**Changes.** Observable, through its child list

<a id="property-element-hasselection"></a>

<a id="properties-element-hasselection"></a>

### Element: hasSelection

**Type:** `Boolean`   **Reads:** Fresh

**Result.** Whether a selection of at least one character lies within it: a non-collapsed selection in a text input or text area, or a non-collapsed document selection within its content; a collapsed caret is no selection

**Changes.** Partly observable: input and selection events are observed, a selection the page's code sets is not

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

**Syntax:** `:media[query]`   **Signature:** `query`: `String` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether the media query matches

**Changes.** Observable: the query's matching, as the browser reports it changing

<a id="function-element-attribute"></a>

<a id="functions-element-attribute"></a>

### Element: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The attribute's value

**Changes.** Observable

<a id="function-aria-view-attribute"></a>

<a id="functions-aria-view-attribute"></a>

### ARIA view: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The value of the element's own attribute `aria-` and the name, as the element's `:attribute` reads it, so `it.aria:["checked"]` is `it:["aria-checked"]`: the string as written, or null where the attribute is absent, never a Boolean

**Changes.** Observable: that attribute

<a id="function-element-class"></a>

<a id="functions-element-class"></a>

### Element: class

**Syntax:** `:class[name]`   **Signature:** `name`: `String` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its class list holds the class, one token: an empty name, or one holding a tab, a line feed, a form feed, a carriage return or a space, is an evaluation error

**Changes.** Observable: its `class` attribute

<a id="function-any-is-has-supports"></a>

<a id="functions-any-is-has-supports"></a>

### Any: is, has, supports

`is`, `has` and `supports` are [Lexica's verbs](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-verbs), each given a test of its receiver as a function: one of DOMQL's [Boolean functions](#boolean-functions) by reference, `it.is(domql.checked)`, an arrow function, or an implicit body, `panel.is(it.disabled() or it.readonly())`.

<a id="function-element-style"></a>

<a id="functions-element-style"></a>

### Element: style

**Syntax:** `:style[property]`   **Signature:** `property`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The property's computed value, custom properties included, null where the element is detached or the value is empty

**Changes.** Partly observable: its own size and attributes are observed, rules matching from elsewhere are not

<a id="function-element-intersects"></a>

<a id="functions-element-intersects"></a>

### Element: intersects

**Syntax:** `intersects({ root, margin })`   **Signature:** optional `root`: `Element?`, the window when omitted or null; optional `margin`: `Number`, 0 when omitted → `Boolean?`   **Reads:** Maintained   **Fixed arguments:** None

**Result.** Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it

**Changes.** Observable

<a id="function-element-overlaps"></a>

<a id="functions-element-overlaps"></a>

### Element: overlaps

**Syntax:** `overlaps({ other, margin })`   **Signature:** required `other`: `Element`; optional `margin`: `Number`, 0 when omitted → `Boolean?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its border box overlaps the other's, grown by the margin, compared as rectangles, null where either has no layout box, and, as `other` propagates null, where `other` is null

**Changes.** Partly observable, as `rect`, and the size of `other`

<a id="function-element-matches"></a>

<a id="functions-element-matches"></a>

### Element: matches

**Syntax:** `matches(selector)`   **Signature:** `selector`: `String` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether it matches the selector

**Changes.** Partly observable: attributes, structure, focus and popovers opening and closing, `:popover-open`, are observed; pointer state such as `:hover` and control state such as `:checked` are not

<a id="function-element-rectrelativeto"></a>

<a id="functions-element-rectrelativeto"></a>

### Element: rectRelativeTo

**Syntax:** `rectRelativeTo(relativeTo)`   **Signature:** `relativeTo`: `Element` → `Rectangle?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box, null where either has no layout box, and, as `relativeTo` propagates null, where `relativeTo` is null

**Changes.** Partly observable, as `rect`, and the size of `relativeTo`

<a id="function-element-closest"></a>

<a id="functions-element-closest"></a>

### Element: closest

**Syntax:** `closest(selector)`   **Signature:** `selector`: `String` → `Element?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The nearest matching ancestor, itself included

**Changes.** Partly observable, as `matches`

<a id="function-node-first-all"></a>

<a id="functions-node-first-all"></a>

### Node: first, all

**Syntax:** `first(selector)`, `all(selector)`   **Signature:** `selector`: `String` → `Element?`, `List<Element>`   **Reads:** Fresh   **Fixed arguments:** None

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

<a id="boolean-functions"></a>

<a id="conditions"></a>

<a id="predicates"></a>

## Boolean functions

DOMQL tests the DOM with [Boolean functions](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-boolean-functions), functions whose result is a Boolean: of a state the user, the browser or the page sets and clears over time, as `it.checked()` is; of a presence, as `it.focus()` is; and of a capability, as `domql.window.share()` is. A query calls one on its receiver, calls it through its module, `domql.checked(it)`, or gives it by reference to one of [Lexica's verbs](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-verbs), `it.is(domql.checked)`, and each way reaches the one declaration, whose observations follow it.

Each applies to the receivers it declares, takes no argument, and answers a Boolean or fails the evaluation. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it, as `attached`, `hasChildren` and `hasSelection` are. Boolean functions compose as Booleans do: `it:class["open"] and it.focusWithin()`.

<a id="conditions-condition-declarations"></a>

<a id="conditions-fixed-condition-names"></a>

<a id="conditions-receiver-types"></a>

<a id="conditions-it-is-a-call-as-any-other"></a>

<a id="conditions-boolean-result"></a>

<a id="conditions-conditions-compose-as-booleans-do"></a>

The built-in vocabulary declares these Boolean functions, each with its native semantics: what the browser itself decides, as its pseudo-class matches, as the document reports its own state, or as the browser offers an API.

| Receiver | Boolean function |
| --- | --- |
| Element | [`disabled`](#boolean-function-element-disabled) |
| Element | [`readonly`](#boolean-function-element-readonly) |
| Element | [`textEditable`](#boolean-function-element-texteditable) |
| Element | [`focus`](#boolean-function-element-focus) |
| Element | [`focusWithin`](#boolean-function-element-focuswithin) |
| Element | [`hover`](#boolean-function-element-hover) |
| Element | [`popoverOpen`](#boolean-function-element-popoveropen) |
| Element | [`checked`](#boolean-function-element-checked) |
| Document | [`visible`](#boolean-function-document-visible) |
| Document | [`focus`](#boolean-function-document-focus) |
| Window | [`share`](#boolean-function-window-share) |
| Window | [`clipboard`](#boolean-function-window-clipboard) |

<a id="boolean-function-element-disabled"></a>

<a id="condition-element-is-disabled"></a>

<a id="conditions-element-isdisabled"></a>

### Element: disabled

**Syntax:** `disabled()`   **Reads:** Fresh

**True when.** The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `it:["disabled"]`, a separate question

**Changes.** Observable: its own and its ancestors' `disabled` attributes and the structure between them

<a id="boolean-function-element-readonly"></a>

<a id="condition-element-is-readonly"></a>

<a id="conditions-element-isreadonly"></a>

### Element: readonly

**Syntax:** `readonly()`   **Reads:** Fresh

**True when.** Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `Number`; any other element answers false, whatever its attributes

**Changes.** Observable: its `readonly` and `type` attributes

<a id="boolean-function-element-texteditable"></a>

<a id="condition-element-is-text-editable"></a>

<a id="conditions-element-istext-editable"></a>

### Element: textEditable

**Syntax:** `textEditable()`   **Reads:** Fresh

**True when.** The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `Number`, that is neither disabled nor read-only; or an element whose content is editable, as the nearest `contenteditable` of a state, its own or an ancestor's, decides: `true`, the empty value and `plaintext-only` make it editable and `false` does not, while an invalid value, `inherit` among them, inherits, as the attribute does natively; where none decides, the document's design mode does.

An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root

**Changes.** Partly observable: everything `disabled` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not

<a id="boolean-function-element-focus"></a>

<a id="condition-element-has-focus"></a>

<a id="conditions-element-hasfocus"></a>

### Element: focus

**Syntax:** `focus()`   **Reads:** Fresh

**True when.** It is the focused element of its tree

**Changes.** Observable: focus moving, and the focused element removed, which moves focus away

<a id="boolean-function-element-focuswithin"></a>

<a id="condition-element-has-focus-within"></a>

<a id="conditions-element-hasfocus-within"></a>

### Element: focusWithin

**Syntax:** `focusWithin()`   **Reads:** Fresh

**True when.** It matches `:focus-within`: it or an element within it is focused, across the shadow trees it hosts

**Changes.** Observable, as `focus` is

<a id="boolean-function-element-hover"></a>

<a id="condition-element-is-hover"></a>

<a id="conditions-element-ishover"></a>

### Element: hover

**Syntax:** `hover()`   **Reads:** Fresh

**True when.** It matches `:hover`: the pointer is over it or over an element within it

**Changes.** Partly observable: the pointer moving over and off elements is observed; an element moving under a pointer that does not move, where the browser fires no pointer event for it, is not

<a id="boolean-function-element-popoveropen"></a>

<a id="condition-element-is-popover-open"></a>

<a id="conditions-element-ispopover-open"></a>

### Element: popoverOpen

**Syntax:** `popoverOpen()`   **Reads:** Fresh

**True when.** It matches `:popover-open`: it is a popover that is showing

**Changes.** Observable: its showing and hiding, its `popover` attribute removed and its removal included

<a id="boolean-function-element-checked"></a>

<a id="condition-element-is-checked"></a>

<a id="conditions-element-ischecked"></a>

### Element: checked

**Syntax:** `checked()`   **Reads:** Fresh

**True when.** It matches `:checked`: a checked checkbox or radio button, or a selected option

**Changes.** Partly observable: the user's input in its tree, a radio button another of its group unchecks and an option its select changes included, form resets, the `checked` and `selected` attributes and the structure of its tree are observed; the page's code setting `checked` or `selected`, or a select's `value` or `selectedIndex`, fires no event and is not

<a id="boolean-function-document-visible"></a>

<a id="condition-document-is-visible"></a>

<a id="conditions-document-isvisible"></a>

### Document: visible

**Syntax:** `visible()`   **Reads:** Fresh

**True when.** The document is visible

**Changes.** Observable

<a id="boolean-function-document-focus"></a>

<a id="condition-document-has-focus"></a>

<a id="conditions-document-hasfocus"></a>

### Document: focus

**Syntax:** `focus()`   **Reads:** Fresh

**True when.** Focus is anywhere within the document

**Changes.** Observable

<a id="boolean-function-window-share"></a>

<a id="condition-window-supports-share"></a>

<a id="conditions-window-supportsshare"></a>

### Window: share

**Syntax:** `share()`   **Reads:** Fresh

**True when.** The browser offers the Web Share API, `navigator.share`, in this context; it says nothing of whether a particular share succeeds, which takes the user's activation, data the browser can share and the user's choice

**Changes.** Constant

<a id="boolean-function-window-clipboard"></a>

<a id="condition-window-supports-clipboard"></a>

<a id="conditions-window-supportsclipboard"></a>

### Window: clipboard

**Syntax:** `clipboard()`   **Reads:** Fresh

**True when.** The browser offers the asynchronous clipboard, `navigator.clipboard`, which it does in a secure context alone; it says nothing of whether reading or writing is permitted, which the user and the browser decide when it is asked

**Changes.** Constant

A Boolean function's ARIA counterpart is no part of it: `it.checked()` is what `:checked` matches, whatever `aria-checked` says. An element's ARIA states are Boolean functions of its ARIA view, `it.aria`, a value of the type `Aria`, which has no data form, so a result never holds one, and `it.aria.checked()` tests one.

Each reads the element's own attribute under a contract of its own, falling back on no native state, and observes that attribute:

| Receiver | Boolean function |
| --- | --- |
| ARIA view | [`checked`](#boolean-function-aria-view-checked) |
| ARIA view | [`disabled`](#boolean-function-aria-view-disabled) |

<a id="boolean-function-aria-view-checked"></a>

<a id="condition-aria-view-is-checked"></a>

<a id="conditions-aria-view-ischecked"></a>

### ARIA view: checked

**Syntax:** `checked()`   **Reads:** Fresh

**True when.** The element's own `aria-checked` is `true`, compared ignoring ASCII case; a missing attribute, `false`, `mixed`, the empty string and any other value, padded with spaces included, answer false

**Changes.** Observable: its `aria-checked` attribute

<a id="boolean-function-aria-view-disabled"></a>

<a id="condition-aria-view-is-disabled"></a>

<a id="conditions-aria-view-isdisabled"></a>

### ARIA view: disabled

**Syntax:** `disabled()`   **Reads:** Fresh

**True when.** The element's own `aria-disabled` is `true`, compared as `checked` compares; an ancestor's `aria-disabled` is not read

**Changes.** Observable: its `aria-disabled` attribute

So `it.checked() or it.aria.checked()` is whether either says checked, and `it.aria:["checked"] == "mixed"` tells a mixed state, which the ARIA view's `checked` answers false for, from the others. The ARIA view's default indexer reads the attribute written on the element, as `it:["aria-checked"]` does, and never the element's effective accessibility state.

No other ARIA attribute has a Boolean function until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean; an extension declares one on the ARIA view, a type it does not own, as the [rules for extensions](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#extensions) let any module do.

<a id="conditions-related-questions"></a>

### Related questions

`it.focus()` asks whether the element itself is focused, `it.focusWithin()` whether focus is anywhere within it, and an extension can offer richer focus semantics, as a Boolean function of elements under its module's own name or of its own types; they are separate questions with separate names.

`readonly` and `textEditable` are separate questions too, and neither is the other's opposite:

| Element | `readonly` | `textEditable` |
| --- | --- | --- |
| An enabled, writable text input | false | true |
| A read-only text input | true | false |
| A disabled text input without `readonly` | false | false |
| An ordinary static element | false | false |
| An editable content region | false | true |

<a id="built-in-conversions"></a>

## Built-in conversions

A query converts with the four conversions [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/spec/vocabulary.md#vocabulary-conversions) declares between the language's types of data, which DOMQL's module, owning none of those types, declares none of; each rejects a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `String` | `Number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `Number` | `String` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `Boolean` | `String` | `"true"` or `"false"` |
| `String` | `Boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

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

DOMQL resolves each target as it starts an observation, and each evaluation that reaches the member finds `root` and `roots` again, so a watch observes the trees its receiver is in as the receiver moves, as [trees and slots a watch follows](watches.md#trees-and-slots-a-watch-follows) set out.

<a id="extension-modules"></a>

## Extension modules

A module extends the built-in vocabulary as Lexica's [modules](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#modules) set out: it declares types of its own, each with its members and operators, Boolean functions among them, and event types, executions and observation types, and adds members to DOMQL's types in its [extensions](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#extensions), as `{ type: 'domql.Aria', members: [/* description */] }` adds one to the ARIA view, a foreign type named qualified. `domql.createModule(name, contents)` creates one from its declarations, each that runs code carrying its implementation, and `domql.registerModule(module)` registers it in the instance's registry, which holds DOMQL's module and every module registered with it. A request is resolved against the vocabulary registered when it is first carried out, so a module a query names is registered beforehand, once, rather than for every evaluation.

- **What an implementation receives.** Every implementation receives the one object Lexica's [implementations](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-what-an-implementation-receives) receive, whose `env` holds the `window` and the `document` the query runs against.
- **Reading.** A member's implementation is synchronous and reads alone, as Lexica requires of every vocabulary, so evaluating, watching and subscribing change nothing; a change to the page is an [execution](executions.md).
- **Event types.** A module adds event types of its own as keys of DOMQL's type selector `event`, each a selectable type naming the type its events are captured as, so `on` listens to them as it listens to the built-in ones.
- **Observations.** A member of any module names DOMQL's observation types and targets as DOMQL's own members do. DOMQL resolves the targets its own module declares alone, so a module declaring observation targets of its own is refused when it is registered, and an observation type a module declares, which owns no target, observes the receiver or an argument. An observation type a module declares is started by its implementation, which receives `request`, the observation's `type`, its `target` and its `arguments`, each argument the member names resolved to its value; `notify`, which it calls when what it observes may have changed; and `env`. It answers an object whose `stop()` ends the observation and, for a maintained observation, whose `sample()` answers its latest sample, `{ pending, value }`.

<a id="extension-modules-host-calls"></a>

### Host calls DOMQL carries out

A module declares an event source or an execution as a [host call](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-host-calls), a function with `invokedBy: 'host'`, and gives DOMQL what Lexica leaves to its host: the `requestKind` the call makes, `subscription` for an event source or `execution`; an execution's `executionMode`, `once` or `continuous`; and the `implementation` that carries it out. `domql.createModule` keeps these in DOMQL's own catalog, and gives Lexica the declaration without them, so Lexica resolves and prepares the call and DOMQL alone invokes it.

| Host call | `requestKind` | `executionMode` | Its `result` | Its implementation receives | It answers |
| --- | --- | --- | --- | --- | --- |
| Event source | `subscription` | Refused | The type of each event it delivers, `@selected` where an event type selects it | `receiver`, `args`, `env` and `deliver`, which each event is handed to | An object whose `stop()` ends the listening |
| Once execution | `execution` | `once` | The type of its result | `receiver`, `args`, `env` and `signal`, which aborts it | Its result, or a promise of it |
| Continuous execution | `execution` | `continuous` | None; one declared is refused | `receiver`, `args`, `env` and `reportError`, which a failure while it runs is reported through | An object whose `update(receiver, args)` applies new arguments and whose `dispose()` ends it, started before it returns |

`domql.createModule` refuses, with a module error naming the declaration and the field, a host call whose `requestKind` is missing or neither `subscription` nor `execution`; an execution whose `executionMode` is missing or neither `once` nor `continuous`; an event source given an `executionMode`, or declaring no result, since each event it delivers is the value its subscription projects; a function the evaluator invokes given either field; and a continuous execution that declares a result. `domql.registerModule` refuses a module declaring a host call its catalog holds nothing of, as a module `domql.createModule` did not make. So an execution whose mode was left out is refused as an execution missing its mode.

On a receiver of unknown type, a host call has no declaration yet, so the host calls of its name that DOMQL's modules declare say what the request does, as Lexica's declarations of the name say who invokes it; where they disagree, the request is refused as ambiguous with a validation error.
