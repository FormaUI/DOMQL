# DOMQL Specification v1.0.0-alpha

DOMQL reads the DOM and shapes the result as data. Its queries are written in [Lexica](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md), whose specification defines the language: expressions, names, types, functions, requests, vocabulary contracts and definitions. This specification defines what DOMQL adds: the DOM's nodes and shadow trees, the built-in vocabulary, and how a query is evaluated and watched.

An implementation may cover only part of it; the [README's status](../README.md#status) states what this one implements.

<a id="version"></a>

**Version.** This specification describes DOMQL on [definition version 32](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#version), the target of separating Lexica from DOMQL. DOMQL's implementation still reads version 31, which writes the implicit parameter `context` and reads `document` and `window` as roots, and [Lexica's implementation plan](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-implementation-plan.md#31-separate-the-language-from-the-dom) lists where the two differ until version 32 lands. The [DOMQL design](domql-design.md) describes how requests are built, prepared and carried out.

<a id="reading-this-specification"></a>

## Reading this specification

Start with [A query at a glance](#a-query-at-a-glance), and use the contents below to find a built-in member. Examples illustrate the rules, code containing `…` is a fragment, and examples explicitly described as errors are intentionally invalid.

### Contents

- [A query at a glance](#a-query-at-a-glance)
- [Nodes](#nodes)
- [Shadow trees](#shadow-trees)
- [Evaluation and watching](#evaluation-and-watching)
- [Built-in vocabulary](#built-in-vocabulary)
- [Examples and usage](#examples-and-usage)

<a id="a-query-at-a-glance"></a>

## A query at a glance

```domql
panel {
    let rows = it.all("[data-key]"),
    width = it.size?.width,
    items = rows {
        key = it:["data-key"],
        selected = it.aria:["selected"] == "true"
    },
    count = rows.count
}
```

- `panel` reads an element supplied by the caller.
- `panel { … }` shapes a result object. Within its fields, `it` is the panel.
- `let rows = …` names an intermediate value. It is not an output field.
- `it:["data-key"]` reads an attribute through the default indexer.
- `rows { … }` projects each list item. Inside that projection, `it` is the item.
- `?.` continues only when its receiver is not null.
- `width`, `items` and `count` are result fields. Fields and locals use `=`; equality uses `==`.

A query's result contains data. To return information about an element, project the fields you need rather than returning the element itself. See [A complete query](#a-complete-query) for an input document, a full query and its result.

<a id="nodes"></a>

## Nodes

A node is a value of the DOM tree. DOMQL's module declares the nodes as [reference types](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#reference-types): `node`, abstract, and beneath it its kinds, `element`, `document`, `documentFragment`, a document fragment that is no shadow root, and `shadowRoot`, each recognized by its test, so a bound node is classified as the kind it is and never as `node` itself. `window` is a reference type of a hierarchy of its own, no node.

<a id="nodes-kinds-fit-where-a-node-does"></a>

### Kinds fit where a node does

As Lexica's reference types set out, a value of a kind fits where a `node` is expected, and a `node` fits where a kind is expected only through a cast, so a kind's own members, such as an element's `rect`, are read of a `node` through one: `(panel.parent as "element")?.rect`.

<a id="nodes-of-two-kinds"></a>

### Of two kinds

Values of two different kinds, a conditional's branches, a coalescing operator's sides or the items of a bound list, are of the type `node`, the nearest supertype they share, so `if wide then panel else domql.document end` is a `node`.

<a id="nodes-declaring-on-a-node"></a>

### Declaring on a node

A member declared on `node` is a member of every kind, and DOMQL's module declares no member of the same name on a kind, which Lexica refuses within one module, so no declaration overrides another.

<a id="shadow-trees"></a>

## Shadow trees

Every crossing of a shadow boundary is written, so a query shows the relationship it follows:

```domql
host.shadow.root            // Into the shadow tree an element hosts.
element.root.host           // Out of the shadow tree an element is in, to its host.
slot.shadow.elements        // The elements a slot shows.
```

<a id="shadow-trees-selectors-never-pierce-a-shadow-root"></a>

### Selectors never pierce a shadow root

`first`, `all` and `closest` select within their receiver's own tree, so `host.all("p")` holds no element of the host's shadow tree, and `host.shadow.root?.all("p")` selects within it. `parent` never crosses a boundary either: a direct child of a shadow root has that root as its parent, and reaches the host through `root.host`.

<a id="shadow-trees-the-view"></a>

### The view

An element's `shadow` is a value of the type `shadow`, which has no data form, so a result never holds one. It is the same for its element whatever changes, and its members answer the element's shadow relationships as they are.

<a id="shadow-trees-shadowroot"></a>

### `shadow.root`

`shadow.root` is the open shadow root the element hosts, and null where it hosts none or a closed one.

<a id="shadow-trees-shadowelements"></a>

### `shadow.elements`

`shadow.elements` is a slot's assigned elements, flattened, as `assignedElements({ flatten: true })` answers them: it follows assignment through forwarded slots, takes the slot's fallback where nothing is assigned to it, answers elements alone, filters nothing by visibility and enters no assigned element's own shadow tree.

A slot that yields no element answers the empty list, as one does whose assigned nodes are text alone, since assigned text suppresses the fallback, and one outside a shadow tree, whatever its fallback. An element that is no slot answers null, so null tells an element that is no slot from a slot that shows nothing.

<a id="evaluation"></a>

<a id="evaluation-and-watching"></a>

## Evaluation and watching

A query is evaluated as Lexica evaluates an expression, synchronously, and each member declares how it reads by [Lexica's contract](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#how-a-member-reads): DOMQL's members read fresh from the document, as an attribute or a box is, maintained by a browser observation, as `intersects` is, captured, as an event's data is, or derived, as a list's `count` is.

Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are.

A maintained member is **pending** until its first sample arrives, as Lexica sets out. `evaluate()` fails on a maintained member, since reading it waits for the first sample, which a synchronous evaluation cannot; `evaluateAsync` and a watch wait for its first sample, and an event's object expression reads it as null while it is pending. The evaluator keeps pending apart from unavailable; the [DOMQL design](domql-design.md) sets out when a request waits for first samples.

Evaluating a query is read-only, as [Lexica requires](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#how-a-member-reads) of every vocabulary. A measurement that needs the document changed first, such as measuring columns at their intrinsic widths under a temporary class, is an action of its own.

A member whose result depends on what happened before, as well as on the document as it is, is captured: it keeps that history while a watch or an event listener holds it, and documents what an evaluation once reports without it.

In this section: [Elements that leave the document](#elements-that-leave-the-document) · [How a member changes](#how-a-member-changes).

<a id="elements-that-leave-the-document"></a>

### Elements that leave the document

An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout.

<a id="how-a-member-changes"></a>

### How a member changes

Every member declares how its result changes, by the categories [Lexica defines](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#how-a-member-changes), and a watch decides by each what it may follow:

| Category | As in DOMQL | In a watch |
| --- | --- | --- |
| Constant | Whether the browser offers a capability `supports` asks | Allowed; it never invalidates. |
| Observable | A size, which a resize observation covers | Allowed. |
| Partly observable | A computed style, which a rule outside the element can change unobserved | Allowed when the caller accepts partial observation for that watch; a change the observations miss reaches the watch at its next evaluation, which `refreshAsync` or another observed change causes. |
| Unobserved | A member that names no observations | A validation error. |
| Derived | A list's `first` or `where` | Allowed wherever what it derives from is. |

A literal is constant, so a watched object expression can carry one: `viewport { kind = "viewport", width = it.size?.width }`.

A watch can miss a detached tree inserted into another tree: nothing in the inserted tree changes, a shadow root's changes reach no observation of the document, and only an observation of the tree it enters would report the insertion, a tree no watch can know of beforehand.

Each member that can miss one is partly observable for what it misses: `parent` and a node's `root` miss a detached tree inserted into another detached tree or into a shadow root, `attached` misses only a detached tree inserted into a shadow root in the document, and `shadow.elements` misses a detached tree holding the slot inserted into a shadow tree that assigns it nothing. A watch of one sees the tree a receiver entered at the next evaluation another change or a refresh causes, observing that tree from then on.

A detached tree inserted into the document, a node moved within or between trees a watch observes, and a detached node another document owns, as a template's content does, inserted into the document are each observed.

<a id="built-in-vocabulary"></a>

## Built-in vocabulary

The built-in vocabulary exposes properties and functions over familiar browser concepts. Properties and functions are named in camelCase. Names are case-sensitive. Measurements use CSS pixels unless stated otherwise. Built-in members expose state or event sources; actions and behaviors come from extensions.

A field of a structured value, such as a rectangle's `width`, is data the value holds, read by property access, and is constant for that value. A property is read by property access, and a function is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out.

A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

In this section: [Module members](#module-members) · [Properties](#properties) · [Functions](#functions) · [Predicates](#conditions) · [Built-in conversions](#built-in-conversions) · [Event sources](#event-sources).

Lexica's own module declares the members of lists, `count`, `first`, `last`, `item`, `max`, `min`, `sum` and `where`, and the verbs `is`, `has` and `supports`; the entries below for them point to Lexica's specification, which defines them.

<a id="module-members"></a>

### Module members

DOMQL's module, `domql`, declares two [module members](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#namespaces-module-members), read through its namespace, each with no receiver:

| Member | Type | Reads | Changes |
| --- | --- | --- | --- |
| `domql.document` | `document` | The document the query runs against, from the environment its host gives | Constant for an evaluator |
| `domql.window` | `window` | That document's window, which is also the layout viewport | Constant for an evaluator |

Neither needs a binding, and a caller's binding named `domql` is read as `~domql`.

<a id="properties"></a>

### Properties

A property exposes a value, read by property access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as the section on evaluation defines.

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

#### Window: size

**Type:** `size`   **Reads:** Fresh

**Result.** The layout viewport's `width` and `height`, excluding scrollbars

**Changes.** Observable, a viewport scrollbar appearing or going included: the window's `resize` and its visual viewport's `resize` are observed

<a id="property-window-devicepixelratio"></a>

<a id="properties-window-devicepixelratio"></a>

#### Window: devicePixelRatio

**Type:** `number`   **Reads:** Fresh

**Result.** Device pixels per CSS pixel

**Changes.** Observable

<a id="property-element-rect"></a>

<a id="properties-element-rect"></a>

#### Element: rect

**Type:** `rectangle?`   **Reads:** Fresh

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport

**Changes.** Partly observable: its own size, the scrolling of its scroll containers, the window's size and the structure of the trees it is in are observed; a move none of them causes, as a sibling before it growing or a margin or padding around it changing, and transforms and animations, are not

<a id="property-element-size"></a>

<a id="properties-element-size"></a>

#### Element: size

**Type:** `size?`   **Reads:** Fresh

**Result.** Its border box's `width` and `height`

**Changes.** Observable

<a id="property-element-clientsize"></a>

<a id="properties-element-clientsize"></a>

#### Element: clientSize

**Type:** `size?`   **Reads:** Fresh

**Result.** Its padding box's `width` and `height`, without scrollbars

**Changes.** Partly observable: its border box and its content box are observed, so a scrollbar appearing or going and a border changing are; a border and padding changing so that one grows by as much as the other shrinks, which leaves both boxes as they were, is not

<a id="property-element-grid"></a>

<a id="properties-element-grid"></a>

#### Element: grid

**Type:** `grid?`   **Reads:** Fresh

**Result.** Its grid's `columns`, the sizes of its column tracks, an empty list for an element that is no grid, and null while it has no layout box

**Changes.** Partly observable, as `style`

<a id="property-element-selection"></a>

<a id="properties-element-selection"></a>

#### Element: selection

**Type:** `selection?`   **Reads:** Fresh

**Result.** Its selection's `start` and `end`, null for an element whose selection the browser does not expose: one that is no text input or text area, and an input of a type the selection API excludes, as `number`, `email` and `date` are

**Changes.** Partly observable: input and selection events are observed, assignments by script are not

<a id="property-node-children"></a>

<a id="properties-node-children"></a>

#### Node: children

**Type:** `list<element>`   **Reads:** Fresh

**Result.** Its child elements, in document order

**Changes.** Observable

<a id="property-node-parent"></a>

<a id="properties-node-parent"></a>

#### Node: parent

**Type:** `node?`   **Reads:** Fresh

**Result.** Its parent in the DOM tree: a shadow root for the nodes directly in it, and null for a document, a document fragment, a shadow root and the topmost element of a detached tree, so it never crosses a shadow boundary

**Changes.** Partly observable: its detached tree inserted into another detached tree or into a shadow root is not observed

<a id="property-node-root"></a>

<a id="properties-node-root"></a>

#### Node: root

**Type:** `node`   **Reads:** Fresh

**Result.** The root of its tree: the document, a document fragment, the shadow root it is in, or the topmost element of a detached tree

**Changes.** Partly observable, as `parent`

<a id="property-node-host"></a>

<a id="properties-node-host"></a>

#### Node: host

**Type:** `element?`   **Reads:** Fresh

**Result.** A shadow root's host, and null for any other node

**Changes.** Constant

<a id="property-element-shadow"></a>

<a id="properties-element-shadow"></a>

#### Element: shadow

**Type:** `shadow`   **Reads:** Fresh

**Result.** Its view of its shadow relationships

**Changes.** Constant

<a id="property-element-aria"></a>

<a id="properties-element-aria"></a>

#### Element: aria

**Type:** `aria`   **Reads:** Fresh

**Result.** Its view of its ARIA states, whose [predicates](#conditions) `is` tests and whose default indexer reads its ARIA attributes

**Changes.** Constant

<a id="property-shadow-view-root"></a>

<a id="properties-shadow-view-root"></a>

#### Shadow view: root

**Type:** `shadowRoot?`   **Reads:** Fresh

**Result.** The open shadow root its element hosts, null where it hosts none or a closed one

**Changes.** Partly observable: a root attached as its element connects to its document is observed, one attached at any other time is not

<a id="property-shadow-view-elements"></a>

<a id="properties-shadow-view-elements"></a>

#### Shadow view: elements

**Type:** `list<element>?`   **Reads:** Fresh

**Result.** The elements its slot shows, flattened, as the section on shadow trees sets out, and null for an element that is no slot

**Changes.** Partly observable: assignment, the fallback and the slot's moves are observed; its detached tree inserted into a shadow tree that assigns it nothing is not

<a id="property-element-attached"></a>

<a id="properties-element-attached"></a>

#### Element: attached

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether the element is attached to the document, including through a shadow root

**Changes.** Partly observable: the structure of the document and of every shadow root between the element and the document is observed; its detached tree inserted into a shadow root in the document is not

<a id="property-element-haschildren"></a>

<a id="properties-element-haschildren"></a>

#### Element: hasChildren

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether it has at least one child element

**Changes.** Observable, through its child list

<a id="property-element-hasselection"></a>

<a id="properties-element-hasselection"></a>

#### Element: hasSelection

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether a selection of at least one character lies within it: a non-collapsed selection in a text input or text area, or a non-collapsed document selection within its content; a collapsed caret is no selection

**Changes.** Partly observable: input and selection events are observed, assignments by script are not

<a id="property-list-count-first-last"></a>

<a id="properties-list-count-first-last"></a>

#### List: count, first, last

`count`, `first` and `last` are properties [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#lists) declares, which owns lists, and Lexica's specification defines.

<a id="functions"></a>

### Functions

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

#### Window: media

**Syntax:** `:media[query]`   **Signature:** `query`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether the media query matches

**Changes.** Observable: the query's matching, as the browser reports it changing

<a id="function-element-attribute"></a>

<a id="functions-element-attribute"></a>

#### Element: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The attribute's value

**Changes.** Observable

<a id="function-aria-view-attribute"></a>

<a id="functions-aria-view-attribute"></a>

#### ARIA view: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The value of the element's own attribute `aria-` and the name, as the element's `:attribute` reads it, so `it.aria:["checked"]` is `it:["aria-checked"]`: the string as written, or null where the attribute is absent, never a Boolean

**Changes.** Observable: that attribute

<a id="function-element-class"></a>

<a id="functions-element-class"></a>

#### Element: class

**Syntax:** `:class[name]`   **Signature:** `name`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its class list holds the class, one token: an empty name, or one holding a tab, a line feed, a form feed, a carriage return or a space, is an evaluation error

**Changes.** Observable: its `class` attribute

<a id="function-any-is-has-supports"></a>

<a id="functions-any-is-has-supports"></a>

#### Any: is, has, supports

`is`, `has` and `supports` are [Lexica's verbs](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#predicates), which ask a predicate by its name; DOMQL declares the predicates they ask of its receivers, as [predicates](#conditions) set out.

<a id="function-element-style"></a>

<a id="functions-element-style"></a>

#### Element: style

**Syntax:** `:style[property]`   **Signature:** `property`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The property's computed value, custom properties included, null where the element is detached or the value is empty

**Changes.** Partly observable: its own size and attributes are observed, rules matching from elsewhere are not

<a id="function-element-intersects"></a>

<a id="functions-element-intersects"></a>

#### Element: intersects

**Syntax:** `intersects({ root, margin })`   **Signature:** optional `root`: `element?`, the window when omitted or null; optional `margin`: `number`, 0 when omitted → `boolean?`   **Reads:** Maintained   **Fixed arguments:** None

**Result.** Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it

**Changes.** Observable

<a id="function-element-overlaps"></a>

<a id="functions-element-overlaps"></a>

#### Element: overlaps

**Syntax:** `overlaps({ other, margin })`   **Signature:** required `other`: `element`; optional `margin`: `number`, 0 when omitted → `boolean?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its border box overlaps the other's, grown by the margin, compared as rectangles, null where either has no layout box, and, as `other` propagates null, where `other` is null

**Changes.** Partly observable, as `rect`, and the size of `other`

<a id="function-element-matches"></a>

<a id="functions-element-matches"></a>

#### Element: matches

**Syntax:** `matches(selector)`   **Signature:** `selector`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether it matches the selector

**Changes.** Partly observable: attributes, structure, focus and popovers opening and closing, `:popover-open`, are observed; pointer state such as `:hover` and control state such as `:checked` are not

<a id="function-element-rectrelativeto"></a>

<a id="functions-element-rectrelativeto"></a>

#### Element: rectRelativeTo

**Syntax:** `rectRelativeTo(relativeTo)`   **Signature:** `relativeTo`: `element` → `rectangle?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box, null where either has no layout box, and, as `relativeTo` propagates null, where `relativeTo` is null

**Changes.** Partly observable, as `rect`, and the size of `relativeTo`

<a id="function-element-closest"></a>

<a id="functions-element-closest"></a>

#### Element: closest

**Syntax:** `closest(selector)`   **Signature:** `selector`: `string` → `element?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The nearest matching ancestor, itself included

**Changes.** Partly observable, as `matches`

<a id="function-node-first-all"></a>

<a id="functions-node-first-all"></a>

#### Node: first, all

**Syntax:** `first(selector)`, `all(selector)`   **Signature:** `selector`: `string` → `element?`, `list<element>`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The first matching descendant, and the matching descendants in document order, within its own tree

**Changes.** Partly observable, as `matches`

<a id="function-list-item"></a>

<a id="functions-list-item"></a>

#### List: item

`:item[index]`, the default indexer `:[index]`, is a function [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#lists) declares, which owns lists, and Lexica's specification defines.

<a id="function-list-max-min-sum"></a>

<a id="functions-list-max-min-sum"></a>

#### List: max, min, sum

`max`, `min` and `sum` are functions [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#lists) declares, which owns lists, and Lexica's specification defines.

<a id="function-list-where"></a>

<a id="functions-list-where"></a>

#### List: where

`where` is a function [Lexica's own module](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#lists) declares, which owns lists, and Lexica's specification defines.

<a id="conditions"></a>

<a id="predicates"></a>

### Predicates

DOMQL's predicates ask the DOM with Lexica's three verbs: `is` a state the user, the browser or the page sets and clears over time, `it.is("checked")`; `has` a possession or a presence, `it.has("focus")`; and `supports` a capability, `domql.window.supports("share")`.

Each follows [Lexica's predicate contract](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#predicates): it is asked with its one verb, its name is fixed, it applies to the receivers it declares, and it answers a Boolean or fails the evaluation. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it, as `attached`, `hasChildren` and `hasSelection` are, and `has` with the name of a presence such as `has("children")` is refused naming the property that answers it, `hasChildren`. Predicates compose as Booleans do: `it:class["open"] and it.has("focus-within")`.

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

#### Element: is("disabled")

**Reads:** Fresh

**True when.** The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `it:["disabled"]`, a separate question

**Changes.** Observable: its own and its ancestors' `disabled` attributes and the structure between them

<a id="condition-element-is-readonly"></a>

<a id="conditions-element-isreadonly"></a>

#### Element: is("readonly")

**Reads:** Fresh

**True when.** Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes

**Changes.** Observable: its `readonly` and `type` attributes

<a id="condition-element-is-text-editable"></a>

<a id="conditions-element-istext-editable"></a>

#### Element: is("text-editable")

**Reads:** Fresh

**True when.** The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, as the nearest `contenteditable` of a state, its own or an ancestor's, decides: `true`, the empty value and `plaintext-only` make it editable and `false` does not, while an invalid value, `inherit` among them, inherits, as the attribute does natively; where none decides, the document's design mode does.

An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root

**Changes.** Partly observable: everything `disabled` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not

<a id="condition-element-has-focus"></a>

<a id="conditions-element-hasfocus"></a>

#### Element: has("focus")

**Reads:** Fresh

**True when.** It is the focused element of its tree

**Changes.** Observable: focus moving, and the focused element removed, which moves focus away

<a id="condition-element-has-focus-within"></a>

<a id="conditions-element-hasfocus-within"></a>

#### Element: has("focus-within")

**Reads:** Fresh

**True when.** It matches `:focus-within`: it or an element within it is focused, across the shadow trees it hosts

**Changes.** Observable, as `focus` is

<a id="condition-element-is-hover"></a>

<a id="conditions-element-ishover"></a>

#### Element: is("hover")

**Reads:** Fresh

**True when.** It matches `:hover`: the pointer is over it or over an element within it

**Changes.** Partly observable: the pointer moving over and off elements is observed; an element moving under a pointer that does not move, where the browser fires no pointer event for it, is not

<a id="condition-element-is-popover-open"></a>

<a id="conditions-element-ispopover-open"></a>

#### Element: is("popover-open")

**Reads:** Fresh

**True when.** It matches `:popover-open`: it is a popover that is showing

**Changes.** Observable: its showing and hiding, its `popover` attribute removed and its removal included

<a id="condition-element-is-checked"></a>

<a id="conditions-element-ischecked"></a>

#### Element: is("checked")

**Reads:** Fresh

**True when.** It matches `:checked`: a checked checkbox or radio button, or a selected option

**Changes.** Partly observable: the user's input in its tree, a radio button another of its group unchecks and an option its select changes included, form resets, the `checked` and `selected` attributes and the structure of its tree are observed; a script setting `checked` or `selected`, or a select's `value` or `selectedIndex`, fires no event and is not

<a id="condition-document-is-visible"></a>

<a id="conditions-document-isvisible"></a>

#### Document: is("visible")

**Reads:** Fresh

**True when.** The document is visible

**Changes.** Observable

<a id="condition-document-has-focus"></a>

<a id="conditions-document-hasfocus"></a>

#### Document: has("focus")

**Reads:** Fresh

**True when.** Focus is anywhere within the document

**Changes.** Observable

<a id="condition-window-supports-share"></a>

<a id="conditions-window-supportsshare"></a>

#### Window: supports("share")

**Reads:** Fresh

**True when.** The browser offers the Web Share API, `navigator.share`, in this context; it says nothing of whether a particular share succeeds, which takes the user's activation, data the browser can share and the user's choice

**Changes.** Constant

<a id="condition-window-supports-clipboard"></a>

<a id="conditions-window-supportsclipboard"></a>

#### Window: supports("clipboard")

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

#### ARIA view: is("checked")

**Reads:** Fresh

**True when.** The element's own `aria-checked` is `true`, compared ignoring ASCII case; a missing attribute, `false`, `mixed`, the empty string and any other value, padded with spaces included, answer false

**Changes.** Observable: its `aria-checked` attribute

<a id="condition-aria-view-is-disabled"></a>

<a id="conditions-aria-view-isdisabled"></a>

#### ARIA view: is("disabled")

**Reads:** Fresh

**True when.** The element's own `aria-disabled` is `true`, compared as `checked` compares; an ancestor's `aria-disabled` is not read

**Changes.** Observable: its `aria-disabled` attribute

So `it.is("checked") or it.aria.is("checked")` is whether either says checked, and `it.aria:["checked"] == "mixed"` tells a mixed state, which an ARIA predicate answers false for, from the others. The ARIA view's default indexer reads the attribute written on the element, as `it:["aria-checked"]` does, and never the element's effective accessibility state.

No other ARIA attribute is a predicate until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean; an extension declares one on the ARIA view, a type it does not own, as the [rules for extensions](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#extensions) let any module do.

<a id="conditions-related-questions"></a>

#### Related questions

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

### Built-in conversions

The built-in vocabulary declares four conversions, each rejecting a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `string` | `number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `number` | `string` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `boolean` | `string` | `"true"` or `"false"` |
| `string` | `boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

<a id="event-sources"></a>

### Event sources

An event source follows [Lexica's contract](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-specification.md#events-and-event-types): it delivers things that happened, is subscribed to and never read or watched, and the object expression following it is evaluated against each event, captured as the members its event type declares.

| Available on | Source | Type | Delivers | Reads | Fixed |
| --- | --- | --- | --- | --- | --- |
| Element, document, window | `on(type)` | `type`: `string` → `event<T>` for the event type `type` names | The native events of that type as they reach it, each with the members its declared event type offers, such as a pointer event's `button`, `clientX` and `clientY`; a type the vocabulary declares no event type for is a validation error | Captured at dispatch | `type` |

The built-in event types, and the members each event offers:

| Event types | Event data type | Members |
| --- | --- | --- |
| `click`, `pointerdown`, `pointerup` | `pointerEvent` | `target`: `element`, `button`: `number`, `buttons`: `number`, `clientX`: `number`, `clientY`: `number`, `pointerType`: `string?` |
| `keydown`, `keyup` | `keyboardEvent` | `target`: `element`, `key`: `string`, `code`: `string` |
| `drop` | `dragEvent` | `target`: `element`, `clientX`: `number`, `clientY`: `number` |
| `focus`, `blur`, `input`, `scroll`, `resize` | `domEvent` | `target`: `element?` |

An event is captured when it is dispatched. A member the event carries no value of its type for is null where its type is nullable, as Lexica sets out, so `domEvent`'s `target` is null for a scroll or a resize that targets the document or the window, and `pointerEvent`'s `pointerType` for a browser that dispatches a click as a mouse event.

`on` listens passively, so it never delays or prevents what the page does with an event.

<a id="examples-and-usage"></a>

## Examples and usage

In this section: [What a query runs against](#what-a-query-runs-against) · [A complete query](#a-complete-query) · [Examples](#examples).

<a id="what-a-query-runs-against"></a>

### What a query runs against

A query is evaluated against a document, with each parameter it names bound to something in that document or to plain data. `panel` is not found by the query: it stands for the element the caller bound under the name `panel`, which is how a query reaches a particular element without a selector for it.

A query that names `panel` and `sentinel` is given those two elements, and fails to prepare when either is not bound. `domql.document` and `domql.window` need no binding, since they are always the document being queried and its window.

Conceptually, a caller supplies the query's text and the bindings, and gets back a result shaped like the query:

```text
result = evaluate(query, bindings: { panel: <the list panel>, sentinel: <the end marker> })
```

The bindings name only what the caller chooses. The complete query below also reads `domql.window` and `domql.document`, which are absent from them because they are the document the query runs against and its window, which no caller chooses; a caller's binding named `window` or `document` is read by that name, as any other binding is.

A caller can take that result once, keep it current as the document changes, or take one at each event the query subscribes to; how it asks for each is the [design](domql-design.md)'s to say. A value query is evaluated or watched alike; subscribing needs an event source, whose projection uses the same expression language.

<a id="a-complete-query"></a>

### A complete query

A list panel asks, in one query, how it is laid out, what it holds, what is in view and what the window around it is doing. The document it is asked of holds a panel of three items, the second selected, and an end marker below them, bound as `panel` and `sentinel`:

```html
<div id="panel" style="display: grid; grid-template-columns: repeat(3, 1fr)">
    <div data-key="a1">…</div>
    <div data-key="a2" aria-selected="true">…</div>
    <div data-key="a3">…</div>
</div>
<div id="sentinel"></div>
```

The query reads it:

```domql
/* A list panel, its items and the window around it. */
{
    // The panel's items, read once for the fields that use them.
    let rows = panel.all("[data-key]"),

    // The panel itself.
    panel = panel {
        size = it.size,
        hasFocus = it.has("focus-within"),
        tier = it:style["--layout-tier"],
        columns = it.grid?.columns.count
    },

    // Every item, and the items in the panel's view; the field above hides
    // the binding panel, which ~panel reads.
    items = rows {
        key = it:["data-key"],
        height = it.rect?.height,
        selected = it.aria:["selected"] == "true"
    },
    inView = rows.where(it.intersects({ root = ~panel })).count,
    tallest = rows.max(it.rect?.height),

    // Whether the end of the list is near, and which item is selected.
    nearEnd = sentinel.intersects({ root = ~panel, margin = 200 }),
    current = ~panel.first("[aria-selected=true]")?:["data-key"],

    // The window around it.
    window = domql.window { size = it.size, dark = it:media["(prefers-color-scheme: dark)"] },
    visible = domql.document.is("visible"),
    kind = "list"
}
```

Its result, with three items and the second selected:

```json
{
  "panel": { "size": { "width": 640, "height": 480 }, "hasFocus": false, "tier": "medium", "columns": 3 },
  "items": [
    { "key": "a1", "height": 48, "selected": false },
    { "key": "a2", "height": 64, "selected": true },
    { "key": "a3", "height": 48, "selected": false }
  ],
  "inView": 2,
  "tallest": 64,
  "nearEnd": false,
  "current": "a2",
  "window": { "size": { "width": 1280, "height": 800 }, "dark": true },
  "visible": true,
  "kind": "list"
}
```

With no item selected, `current` is null. With an empty panel, `items` is an empty list, `inView` is 0, and `tallest` and `current` are null.

`intersects` reads maintained values, so the result comes from an asynchronous evaluation or a watch, which wait for its first samples; a synchronous evaluation of the query fails, since it cannot wait.

Watching the query requires accepting partial observation, since `all`, `style`, `grid`, `rect` and `first` are partly observable, which the refusal names as `node.all`, `element.style`, `element.grid`, `element.rect` and `node.first`, each with the changes it misses; the watch then follows the items the panel holds, each item's height, attributes and intersection, the panel's size and focus, the sentinel's intersection, the media query and the document's visibility.

<a id="examples"></a>

### Examples

| Asks | Query |
| --- | --- |
| Whether an element is near the end of a scrolling panel | `sentinel.intersects({ root = panel, margin = 200 })` |
| How many items of a list are in its view | `list.all("li").where(it.intersects({ root = list })).count` |
| A layout tier a container query sets | `header:style["--layout-tier"]` |
| How many columns a grid lays out | `cards.grid?.columns.count` |
| A table's tallest row | `table.all("tbody tr").max(it.rect?.height)` |
| Each column's key and width | `table.all("[data-column]") { key = it:["data-column"], width = it.rect?.width }` |
| A panel's size, and whether focus is within it | `panel { size = it.size, hasFocus = it.has("focus-within") }` |
| A text field's selection | `field.selection { start = it.start, finish = it.end }` |
| Whether sharing is available | `domql.window.supports("share")` |
| The ids of the text-editable elements in a panel | `panel.all("*").where(it.is("text-editable")) { id = it:["id"] }` |
| An element's states and what it holds | `target { attached = it.attached, disabled = it.is("disabled"), hasChildren = it.hasChildren, hasSelection = it.hasSelection }` |
| Whether a control cannot take text | `input.is("disabled") or input.is("readonly")` |
| A control's state, one word | `input { state = if it.is("disabled") then "locked" elseif it.is("readonly") then "read" else "open" end }` |
| Whether an element has no parent | `panel.parent == null` |
| The width of an element's parent element, null where the parent is none or no element | `(try panel.parent as "element")?.rect?.width` |
| A list's size and its tallest item, the list read once | `panel { let items = it.all("[data-key]"), count = items.count, tallest = items.max(it.rect?.height) }` |
