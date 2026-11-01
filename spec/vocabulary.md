# Built-in vocabulary

<a id="built-in-vocabulary"></a>
<a id="vocabulary"></a>

The **built-in vocabulary** is what DOMQL's module, `Domql`, declares: the DOM's types, and the module members, properties, functions, Boolean functions among them, event sources and observations a query reads them through. Everything a query can ask about is a member a module contributes, DOMQL's own module and every extension by one contract, so adding a member leaves the grammar unchanged.

```domql
panel.size?.width                        // A property of an element, then a property of the size it answers.
panel["data-key"]                        // An attribute, through the unnamed indexer.
panel.closest(".row")                    // A function, given its selector.
panel.disabled()                         // A Boolean function, which tests the element.
Domql.window.media["(min-width: 40em)"]  // A named indexer of the window, a module member.
```

Properties and functions are named in camelCase, and names are case-sensitive. Built-in members expose state or event sources; executions come from extensions. A property is read by property access, and a function is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out. A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

Nexo's own module declares the members of lists, among them `count`, `first`, `last`, `max`, `min`, `sum`, `where` and the unnamed indexer `[index]`, and those of numbers and strings; the entries below for the members of lists a query of the DOM reads most point to Nexo's specification, which defines them all. DOMQL's event sources and event types are set out in [events](events.md).

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

DOMQL's module, `Domql`, declares two [module members](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/modules.md#namespaces-module-members), read through its namespace, each with no receiver:

| Member | Type | Reads | Changes |
| --- | --- | --- | --- |
| `Domql.document` | `Document` | The document the query runs against, from the environment DOMQL gives its evaluator | Constant for an evaluator |
| `Domql.window` | `Window` | That document's window, which is also the layout viewport | Constant for an evaluator |

Neither needs a binding, and a caller's binding named `Domql` is read as `~Domql`, since every query imports DOMQL's module under that name.

<a id="vocabulary-types"></a>

## Types

DOMQL's module declares each of its types with its members, as Nexo's [declaring a type](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/modules.md#modules-declaring-a-type) sets out: its reference types, which a query reads through and a result never holds, and its structured types, which hold data. Its `typeOf` recognizes the values a host binds, and each reference type's `isInstance` checks membership:

| Reference type | Supertype | What it is | Where a value has the type |
| --- | --- | --- | --- |
| `Node` | None, abstract | A [node](nodes-and-shadow-trees.md#nodes) of the DOM tree | A member's result, as `parent`'s and `root`'s, or a declared binding; never `typeOf`, since it is abstract |
| `Element`, `Document`, `DocumentFragment`, `ShadowRoot` | `Node` | The kinds of node | DOMQL's `typeOf`, a member's result, as the items of `children` are, or a declared binding |
| `Window` | None | The window a query runs in | DOMQL's `typeOf`, `Domql.window`'s result, or a declared binding |
| `Shadow` | None | An element's [shadow view](nodes-and-shadow-trees.md#shadow-trees-the-view) | An element's `shadow`, or a declared binding |
| `Aria` | None | An element's [ARIA view](#conditions) | An element's `aria`, or a declared binding |
| `Range` | None | A range of a document, as the document's selection holds one | A selection's `range`, DOMQL's `typeOf` for a range a host binds, or a declared binding |

`Shadow` and `Aria` are views: an element's `shadow` and `aria` answer the element itself, of the view's type, whose `isInstance` accepts every element, and no wrapper is made or kept. DOMQL's `typeOf` never answers a view, and an `Element` can't be cast to either view: their memberships accepting every element doesn't make the types related. `Aria` declares a cast to `Element`, without an `impl`, so `(panel.aria as Element).aria` reads the element's view again. Each node type, `Window`, each view and `Range` has no data form, so no result holds one.

| Structured type | What it is | Properties |
| --- | --- | --- |
| `Size` | A width and a height | `width`, `height`: `Number` |
| `Rectangle` | A box's edges and size | `left`, `top`, `right`, `bottom`, `width`, `height`: `Number` |
| `Selection` | A text selection's range | `start`, `end`: `Number` |
| `DocumentSelection` | The document's selection as it stands | `type`: `String`; `collapsed`: `Boolean`; `rangeCount`: `Number`; `anchorElement`, `focusElement`: `Element?`; `range`: `Range?` |
| `Grid` | A grid's column tracks | `columns`: `List<Number>` |
| `Scroll` | How far a box is scrolled along each of its logical axes | `inline`, `block`: `ScrollAxis` |
| `ScrollAxis` | How far a box is scrolled along one axis | `offset`, `extent`, `viewport`: `Number` |
| `Playback` | A media element's playback | `paused`, `muted`, `ended`: `Boolean`; `currentTime`, `volume`: `Number`; `duration`: `Number?` |
| `Location` | The parts of a URL a page navigates by | `href`, `pathname`, `search`, `hash`: `String` |
| `SizeLimits` | The limits a box's size is kept within | `minWidth`, `minHeight`, `maxWidth`, `maxHeight`: `Number?` |
| `File` | A file a user chose, without its content | `name`, `type`: `String`; `bytes`, `lastModified`: `Number` |

`on`, an event source, is one declaration DOMQL's module gives each of `Element`, `Document` and `Window`, the receivers it listens on.

A property of a structured value's data shape, such as a rectangle's `width`, is data the value holds, read by property access, and is constant for that value. A structured value that holds a reference, as a `DocumentSelection` holds its `range`, is read through an object expression, as an event is, since no result holds a reference. Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are. The types of event data are set out in [events](events.md#event-types).

<a id="vocabulary-measurements-and-layout"></a>
<a id="elements-without-a-layout-box"></a>

## Measurements and layout

Measurements use CSS pixels unless stated otherwise. An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout. A watch that read null of a detached element follows it back into the document, as [elements that leave the document](watches.md#elements-that-leave-the-document) sets out.

<a id="vocabulary-tolerance"></a>

**Tolerance.** A member that measures layout in CSS pixels declares a [tolerance](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/members.md#what-a-member-declares-numeric-tolerance) of 0.05, a twentieth of a pixel, for every number it answers, so a watch reports a measurement only once it moves by more than that from the one it last reported, as [comparing snapshots](results.md#comparing-snapshots) sets out:

- **What it absorbs.** A box settling by a unit of the browser's layout, 1/64 of a pixel in Chromium and WebKit and 1/60 in Firefox, and the rounding of the arithmetic that answers a measurement, as `right` is `left` and `width` added.
- **What it reports.** Any move a device pixel shows, which is a quarter of a pixel at a device pixel ratio of 4. A move made in steps smaller than the tolerance is reported once the steps add up to more, since each is compared with the measurement last reported.
- **Who declares it.** `rect`, `clientRect`, `rectRelativeTo`, `size`, `clientSize`, `scroll` and `grid` of an element, and `size` and `scroll` of the window. A number computed from one, as `it.rect?.width / 2`, compares exactly, as Nexo's [arithmetic](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/expressions.md#arithmetic-watching) sets out, and an evaluation once is never rounded.

Scrolling reads the same way, along the axes of a box's writing mode:

```domql
(panel.scroll?.block.offset ?? 0) > 0                // Whether it is scrolled from the start of its content.
item.scrollContainer({ axis = "block" })?.clientRect // The padding box of the box that scrolls it.
```

<a id="properties"></a>

## Properties

A property exposes a value, read by property access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as [how DOMQL's members read](evaluation.md#evaluation-how-members-read) and [how a member changes](watches.md#how-a-member-changes) define.

| Receiver | Property | Type |
| --- | --- | --- |
| Window | [`size`](#property-window-size) | `Size` |
| Window | [`scroll`](#property-window-scroll) | `Scroll` |
| Window | [`devicePixelRatio`](#property-window-devicepixelratio) | `Number` |
| Window | [`location`](#property-window-location) | `Location` |
| Window | [`shortcutModifier`](#property-window-shortcutmodifier) | `String` |
| Element | [`rect`](#property-element-rect) | `Rectangle?` |
| Element | [`clientRect`](#property-element-clientrect) | `Rectangle?` |
| Element | [`size`](#property-element-size) | `Size?` |
| Element | [`clientSize`](#property-element-clientsize) | `Size?` |
| Element | [`scroll`](#property-element-scroll) | `Scroll?` |
| Element | [`grid`](#property-element-grid) | `Grid?` |
| Element | [`selection`](#property-element-selection) | `Selection?` |
| Node | [`children`](#property-node-children) | `List<Element>` |
| Node | [`parent`](#property-node-parent) | `Node?` |
| Node | [`root`](#property-node-root) | `Node` |
| Node | [`host`](#property-node-host) | `Element?` |
| Element | [`shadow`](#property-element-shadow) | `Shadow` |
| Element | [`aria`](#property-element-aria) | `Aria` |
| Element | [`direction`](#property-element-direction) | `String` |
| Element | [`localName`](#property-element-localname) | `String` |
| Element | [`classes`](#property-element-classes) | `List<String>` |
| Element | [`text`](#property-element-text) | `String` |
| Element | [`html`](#property-element-html) | `String` |
| Element | [`value`](#property-element-value) | `String?` |
| Element | [`playback`](#property-element-playback) | `Playback?` |
| Element | [`files`](#property-element-files) | `List<File>?` |
| Element | [`sizeLimits`](#property-element-sizelimits) | `SizeLimits?` |
| Document | [`activeElement`](#property-document-activeelement) | `Element?` |
| Shadow view | [`root`](#property-shadow-view-root) | `ShadowRoot?` |
| Shadow view | [`elements`](#property-shadow-view-elements) | `List<Element>?` |
| Element | [`attached`](#property-element-attached) | `Boolean` |
| Element | [`hasChildren`](#property-element-haschildren) | `Boolean` |
| Element | [`hasSelection`](#property-element-hasselection) | `Boolean` |
| Element | [`previousSibling`, `nextSibling`](#property-element-siblings) | `Element?` |
| Element | [`index`](#property-element-index) | `Number?` |
| Document | [`selection`](#property-document-selection) | `DocumentSelection?` |
| Range | [`rect`](#property-range-rect) | `Rectangle?` |
| Range | [`collapsed`](#property-range-collapsed) | `Boolean` |
| Range | [`text`](#property-range-text) | `String` |
| Range | [`startElement`, `endElement`, `commonAncestor`](#property-range-elements) | `Element?` |

<a id="property-window-size"></a>

<a id="properties-window-size"></a>

### Window: size

**Type:** `Size`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** The layout viewport's `width` and `height`, excluding scrollbars

**Changes.** Observable, a viewport scrollbar appearing or going included: the window's `resize` and its visual viewport's `resize` are observed

<a id="property-window-scroll"></a>

### Window: scroll

**Type:** `Scroll`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** How far the layout viewport is scrolled, as an element's [`scroll`](#property-element-scroll) answers, along the axes of the writing mode of the document's root element: each axis's `offset` from `scrollX` or `scrollY` without its sign, its `extent` the size of the document's scrolling area, and its `viewport` the window's [`size`](#property-window-size) along it

**Changes.** Partly observable: the window's `scroll` events, the window's size and the border box of the document's root element are observed; the document's extent changing where its root element's border box does not, as content positioned outside it, and its writing mode changing, are not

<a id="property-window-devicepixelratio"></a>

<a id="properties-window-devicepixelratio"></a>

### Window: devicePixelRatio

**Type:** `Number`   **Reads:** Fresh

**Result.** Device pixels per CSS pixel

**Changes.** Observable

<a id="property-window-location"></a>

### Window: location

**Type:** `Location`   **Reads:** Fresh

**Result.** The window's URL: its whole `href`, its `pathname`, its `search`, the query with its `?`, and its `hash`, the fragment with its `#`, each the empty string where the URL has none, as `location` answers them

**Changes.** Partly observable: the [`navigation`](#observations-types) observation is observed, which follows every navigation within the document, the history API's `pushState` and `replaceState` included, through the Navigation API; in a browser without it, `popstate` and `hashchange` alone are observed, and a change the history API makes fires neither

<a id="property-window-shortcutmodifier"></a>

### Window: shortcutModifier

**Type:** `String`   **Reads:** Fresh

**Result.** The modifier key a keyboard shortcut is written with on the platform the browser runs on, as a keyboard event's `key` names it: `"Meta"`, the Command key, on an Apple platform, and `"Control"` on any other. The platform is the one `navigator.userAgentData` names, `macOS` and `iOS` being Apple's, and, in a browser that offers none, the one `navigator.platform` names, whose `Mac`, `iPhone`, `iPad` and `iPod` are, an iPad that names itself a Mac included

**Changes.** Constant

<a id="property-element-rect"></a>

<a id="properties-element-rect"></a>

### Element: rect

**Type:** `Rectangle?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport

**Changes.** Partly observable: its own size, the scrolling of its scroll containers, the window's size and the structure of the trees it is in are observed; a move none of them causes, as a sibling before it growing or a margin or padding around it changing, and transforms and animations, are not

<a id="property-element-clientrect"></a>

### Element: clientRect

**Type:** `Rectangle?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** Its padding box without scrollbars, relative to the layout viewport: the border box `rect` answers, moved in by its left and top borders, `clientLeft` and `clientTop`, which hold a scrollbar placed at the left too, and of the size [`clientSize`](#property-element-clientsize) answers

**Changes.** Partly observable, as `rect`, its padding box observed as `clientSize` observes it

<a id="property-element-size"></a>

<a id="properties-element-size"></a>

### Element: size

**Type:** `Size?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** Its border box's `width` and `height`

**Changes.** Observable

<a id="property-element-clientsize"></a>

<a id="properties-element-clientsize"></a>

### Element: clientSize

**Type:** `Size?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** Its padding box's `width` and `height`, without scrollbars

**Changes.** Partly observable: its border box and its content box are observed, so a scrollbar appearing or going and a border changing are; a border and padding changing so that one grows by as much as the other shrinks, which leaves both boxes as they were, is not

<a id="property-element-scroll"></a>

### Element: scroll

**Type:** `Scroll?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** How far it is scrolled along each axis of its writing mode, `inline` and `block`, the inline axis vertical in a vertical writing mode. Along each:

- `offset`, how far it is scrolled from its scroll origin, which is never negative: under RTL, where the scroll origin lies at the right, the browser answers a `scrollLeft` of 0 down to the negative of its range, and `offset` is its distance from 0, so 0 shows the start of its content in every direction.
- `extent`, the size of its scrolling area, as `scrollWidth` or `scrollHeight`.
- `viewport`, the size of its scrollport, its padding box without scrollbars, as `clientWidth` or `clientHeight`.

An element that is no scroll container is scrolled by 0. Null while it has no layout box.

**Changes.** Partly observable: its `scroll` events, its padding box, its child list and its children's border boxes, through the [observation target](#observations-targets) `children`, are observed; its extent changing where no child's border box does, as a descendant overflowing a child of a fixed size or a child's margin changing, and its writing mode changing, are not

<a id="property-element-grid"></a>

<a id="properties-element-grid"></a>

### Element: grid

**Type:** `Grid?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** Its grid's `columns`, the sizes of its column tracks, an empty list for an element that is no grid, and null while it has no layout box

**Changes.** Partly observable, as `style`

<a id="property-element-selection"></a>

<a id="properties-element-selection"></a>

### Element: selection

**Type:** `Selection?`   **Reads:** Fresh

**Result.** Its selection's `start` and `end`: a text input's or a text area's, as the selection API answers them; for any other element whose content is editable, the document's selection as offsets in its [`text`](#property-element-text), as a range's [`offsetsIn`](#function-range-offsetsin) answers them, and null where the selection lies not wholly within it. Null for an element whose selection the browser does not expose: one that is neither a text control nor editable, and an input of a type the selection API excludes, as `number`, `email` and `date` are

**Changes.** Observable: its `select` and `input` events, the document's `selectionchange`, which the browser fires for every selection the user or the page's code makes, a text control's at the control, whence it bubbles, and its `type` attribute and the structure and text of its subtree, whose nodes removed take a selection with them without a `selectionchange`

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

**Result.** Its view of its ARIA states, which its [Boolean functions](#boolean-functions) test and its unnamed indexer reads as its ARIA attributes

**Changes.** Constant

<a id="property-element-direction"></a>

### Element: direction

**Type:** `String`   **Reads:** Fresh

**Result.** Its directionality, `"ltr"` or `"rtl"`, as `:dir()` matches it: the `dir` of the element or of its nearest ancestor that gives one, past the host of the shadow root it stands in, or the text that decides a `dir="auto"`, and `"ltr"` where none decides. It is what `dir` decides, never a stylesheet's `direction`, which `it.style["direction"]` reads

**Changes.** Partly observable: the `dir` attributes and the structure of every tree its flat-tree ancestry passes through are observed, the document element's among them; the text that decides an ancestor's `dir="auto"`, or its own, is not

<a id="property-element-localname"></a>

### Element: localName

**Type:** `String`   **Reads:** Fresh

**Result.** Its local name, in lowercase for an HTML element, as `"div"`

**Changes.** Constant

<a id="property-element-classes"></a>

### Element: classes

**Type:** `List<String>`   **Reads:** Fresh

**Result.** The classes its class list holds, each once, in the order they are first written

**Changes.** Observable: its `class` attribute

<a id="property-element-text"></a>

### Element: text

**Type:** `String`   **Reads:** Fresh

**Result.** The text of its subtree, as `textContent` joins its text nodes in document order: no markup, and the text of no shadow tree, and none of the content of a template it holds

**Changes.** Observable: its subtree's structure and text

<a id="property-element-html"></a>

### Element: html

**Type:** `String`   **Reads:** Fresh

**Result.** The markup of its content, as `innerHTML` serializes it: no shadow tree is serialized, and the content of a template it holds is

**Changes.** Partly observable: its subtree's structure, attributes and text are observed; a change inside the content of a template it holds is not

<a id="property-element-value"></a>

### Element: value

**Type:** `String?`   **Reads:** Fresh

**Result.** The value of an `input`, a `textarea` or a `select`, as its `value` answers it, the empty string where nothing is entered or selected, and null for any other element

**Changes.** Partly observable: the user's input, changes and a form's reset in its tree, its `value`, `selected` and `type` attributes, and the structure and text of its subtree, which a text area's default and a select's options decide, are observed; the page's code setting its value, or a select's `selectedIndex`, fires no event and is not

<a id="property-element-files"></a>

### Element: files

**Type:** `List<File>?`   **Reads:** Fresh

**Result.** The files a file input holds, in the order chosen, each its `name`, its size in `bytes`, its `type`, the media type the browser gives it or the empty string, and its `lastModified`, in milliseconds since 1970 began; the empty list where it holds none, and null for any other element. A file's content is not read

**Changes.** Partly observable: the user's input and changes in its tree, a form's reset among them, and its `type` attribute are observed; the page's code assigning its files fires no event and is not

<a id="property-element-sizelimits"></a>

### Element: sizeLimits

**Type:** `SizeLimits?`   **Reads:** Fresh

**Result.** The limits its computed style keeps its size within, `min-width`, `min-height`, `max-width` and `max-height`, each in CSS pixels where the computed value is a length, a length in `em` resolved, and null where it is none: `auto`, `none`, a percentage, which the browser leaves unresolved, and a keyword, as `min-content`; null where it is detached

**Changes.** Partly observable, as `style`

<a id="property-element-playback"></a>

### Element: playback

**Type:** `Playback?`   **Reads:** Fresh

**Result.** An `audio` or a `video` element's playback: whether it is `paused`, `muted` and `ended`; its `currentTime` and its `duration`, in seconds, the duration null until its metadata has loaded and for a stream without an end; and its `volume`, from 0 to 1. Null for any other element

**Changes.** Partly observable: its media events, `play`, `pause`, `playing`, `ended`, `volumechange`, `timeupdate`, `durationchange`, `seeking`, `seeked`, `emptied` and `loadedmetadata`, are observed; its current time advancing between two `timeupdate` events, which the browser fires every 15 to 250 milliseconds while it plays, is not

<a id="property-document-activeelement"></a>

### Document: activeElement

**Type:** `Element?`   **Reads:** Fresh

**Result.** The focused element: the document's `activeElement`, and, where that is a host whose open shadow root holds the focus, the element focused there, through every such root; null where the document reports none, its body or its root element, as it does while no element has focus. A closed shadow root hides what is focused inside it, so its host is answered

**Changes.** Observable: focus moving, and the focused element removed, which moves focus away

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

**Changes.** Observable, as `selection`

<a id="property-element-siblings"></a>

### Element: previousSibling, nextSibling

**Type:** `Element?`   **Reads:** Fresh

**Result.** The element before it and the element after it among its parent's child elements, a text or a comment node between them passed over, and null where there is none, as at either end and where it has no parent

**Changes.** Partly observable, as `parent`

<a id="property-element-index"></a>

### Element: index

**Type:** `Number?`   **Reads:** Fresh

**Result.** Its place among its parent's child elements, from 0, as an item's place in its parent's `children`; null where it has no parent. A list's order of its own is Nexo's `indexOf`, so `items.indexOf(item)` is an item's place in any list

**Changes.** Partly observable, as `parent`

<a id="property-document-selection"></a>

### Document: selection

**Type:** `DocumentSelection?`   **Reads:** Fresh

**Result.** The document's selection as it stands, as its `getSelection()` answers it: its `type`, `"None"`, `"Caret"` or `"Range"`; whether it is `collapsed`; its `rangeCount`; the elements its anchor and its focus are in, `anchorElement` and `focusElement`, each the node itself where it is an element and the element holding its text otherwise; and its first `range`, null where it holds none. Null where the document offers no selection, as one without a browsing context. A selection inside a shadow tree is reported as the browser reports it to the document, at the shadow host in Chromium. It holds references, so a query reads it through an object expression: `Domql.document.selection { type = it.type, text = it.range?.text }`

**Changes.** Partly observable: its `selectionchange`, which the browser fires for every selection the user or the page's code makes, and the structure of the document, whose nodes removed take the selection with them without one, are observed; the nodes holding the selection removed from a shadow tree are not

<a id="property-range-rect"></a>

### Range: rect

**Type:** `Rectangle?`   **Reads:** Fresh   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** The bounding box of what it holds, relative to the layout viewport, as `getBoundingClientRect` answers it, a caret's of no width included; null where it lies in a tree that is not attached

**Changes.** Partly observable: the document's `selectionchange`, its structure and its text, the window's size and the scrolling of the document's scroll containers are observed; a move none of them causes, as `rect` misses for an element, and a range other than the selection's that the page's code moves, are not

<a id="property-range-collapsed"></a>

### Range: collapsed

**Type:** `Boolean`   **Reads:** Fresh

**Result.** Whether its start and its end are the same point

**Changes.** Partly observable: the document's `selectionchange`, its structure and its text are observed; a range other than the selection's that the page's code moves, and a change inside a shadow tree, are not

<a id="property-range-text"></a>

### Range: text

**Type:** `String`   **Reads:** Fresh

**Result.** The text it holds, as its `toString()` joins its text nodes, in the way an element's [`text`](#property-element-text) joins its own

**Changes.** Partly observable, as `collapsed`

<a id="property-range-elements"></a>

### Range: startElement, endElement, commonAncestor

**Type:** `Element?`   **Reads:** Fresh

**Result.** The element its start is in, its end is in, and the nearest that holds both: each the boundary's node itself where it is an element, the element holding its text otherwise, and null where that node is a document or a document fragment

**Changes.** Partly observable, as `collapsed`

<a id="property-list-count-first-last"></a>

<a id="properties-list-count-first-last"></a>

### List: count, first, last

`count`, `first` and `last` are properties [Nexo's own module](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="functions"></a>

## Functions

A function performs a lookup, a calculation or a selection with the argument it is given. A name with parentheses, as `closest(selector)`, is a call, `it.closest(".row")`; a name with brackets after it, as `attribute[name]`, is a named indexer, `it.attribute["data-key"]`; and braces show an options object, whose fields supply the parameters, as `intersects({ root, margin })` does, `it.intersects({ root = panel })`.

Each function states what it answers, how its result changes, how it reads, and which of its parameters are fixed.

| Receiver | Function |
| --- | --- |
| Window | [`.media[query]`](#function-window-media) |
| Element | [`.attribute[name]`, and the unnamed indexer, `[name]`](#function-element-attribute) |
| ARIA view | [`.attribute[name]`, and the unnamed indexer, `[name]`](#function-aria-view-attribute) |
| Element | [`.class[name]`](#function-element-class) |
| Element | [`.style[property]`](#function-element-style) |
| Element | [`.inlineStyle[property]`](#function-element-inlinestyle) |
| Element | [`intersects({ root, margin })`](#function-element-intersects) |
| Element | [`overlaps({ other, margin })`](#function-element-overlaps) |
| Element | [`matches(selector)`](#function-element-matches) |
| Element | [`rectRelativeTo(relativeTo)`](#function-element-rectrelativeto) |
| Element | [`closest(selector)`](#function-element-closest) |
| Element | [`hasPointerCapture(pointerId)`](#function-element-haspointercapture) |
| Element | [`scrollContainer({ axis })`](#function-element-scrollcontainer) |
| Node | [`first(selector)`, `all(selector)`](#function-node-first-all) |
| Node | [`contains(other)`](#function-node-contains) |
| Range | [`intersects(node)`](#function-range-intersects) |
| Range | [`all(selector)`](#function-range-all) |
| Range | [`offsetsIn(element)`](#function-range-offsetsin) |

<a id="function-window-media"></a>

<a id="functions-window-media"></a>

### Window: media

**Syntax:** `.media[query]`   **Signature:** `query`: `String` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether the media query matches

**Changes.** Observable: the query's matching, as the browser reports it changing

<a id="function-element-attribute"></a>

<a id="functions-element-attribute"></a>

### Element: attribute

**Syntax:** `.attribute[name]`, and the unnamed indexer, `[name]`   **Signature:** `name`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The attribute's value

**Changes.** Observable

<a id="function-aria-view-attribute"></a>

<a id="functions-aria-view-attribute"></a>

### ARIA view: attribute

**Syntax:** `.attribute[name]`, and the unnamed indexer, `[name]`   **Signature:** `name`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The value of the element's own attribute `aria-` and the name, as the element's `:attribute` reads it, so `it.aria["checked"]` is `it["aria-checked"]`: the string as written, or null where the attribute is absent, never a Boolean

**Changes.** Observable: that attribute

<a id="function-element-class"></a>

<a id="functions-element-class"></a>

### Element: class

**Syntax:** `.class[name]`   **Signature:** `name`: `String` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its class list holds the class, one token: an empty name, or one holding a tab, a line feed, a form feed, a carriage return or a space, is an evaluation error

**Changes.** Observable: its `class` attribute


<a id="function-element-style"></a>

<a id="functions-element-style"></a>

### Element: style

**Syntax:** `.style[property]`   **Signature:** `property`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The property's computed value, custom properties included, null where the element is detached or the value is empty

**Changes.** Partly observable: its own size and attributes are observed, rules matching from elsewhere are not

<a id="function-element-inlinestyle"></a>

### Element: inlineStyle

**Syntax:** `.inlineStyle[property]`   **Signature:** `property`: `String` → `String?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The property's value as its `style` attribute declares it, custom properties included, without its priority, and null where it declares none; what applies, whatever declares it, is `style[property]`

**Changes.** Observable: its `style` attribute

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

**Syntax:** `rectRelativeTo(relativeTo)`   **Signature:** `relativeTo`: `Element` → `Rectangle?`   **Reads:** Fresh   **Fixed arguments:** None   **Tolerance:** [0.05](#vocabulary-tolerance)

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box, null where either has no layout box, and, as `relativeTo` propagates null, where `relativeTo` is null

**Changes.** Partly observable, as `rect`, and the size of `relativeTo`

<a id="function-element-closest"></a>

<a id="functions-element-closest"></a>

### Element: closest

**Syntax:** `closest(selector)`   **Signature:** `selector`: `String` → `Element?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The nearest matching ancestor, itself included

**Changes.** Partly observable, as `matches`

<a id="function-element-scrollcontainer"></a>

### Element: scrollContainer

**Syntax:** `scrollContainer({ axis })`   **Signature:** optional `axis`: `String?`, `"inline"` or `"block"`, either axis when omitted or null → `Element?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The nearest of its [flat-tree ancestors](nodes-and-shadow-trees.md#trees-and-slots) the user can scroll along the axis of its writing mode: one whose computed `overflow` along that axis is `auto` or `scroll`, so a scroll container that hides its overflow there, or clips it, is passed over; null where none is, as where the window scrolls it. The document's root element, and its body while the root's `overflow` is `visible`, give their overflow to the viewport, and are never answered. An axis other than these fails the evaluation.

A box whose overflow is not `visible` along one axis computes `visible` as `auto` along the other, so `overflow-y: auto` alone makes a box the user can scroll along both, and `overflow-x: hidden` beside it limits it to one.

**Changes.** Partly observable: the attributes and the structure of every tree its flat-tree ancestry passes through are observed; a stylesheet changing which rules apply is not

<a id="function-element-haspointercapture"></a>

### Element: hasPointerCapture

**Syntax:** `hasPointerCapture(pointerId)`   **Signature:** `pointerId`: `Number` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether it holds the capture of the pointer, as `hasPointerCapture` answers: from the moment the page's code sets it, before the browser reports it

**Changes.** Observable: its `gotpointercapture` and `lostpointercapture` events, and the document's `lostpointercapture`, which the browser fires where the element holding a capture is removed. The browser fires them as it processes the capture at the pointer's next event, so a watch reports a capture set at that event

<a id="function-node-first-all"></a>

<a id="functions-node-first-all"></a>

### Node: first, all

**Syntax:** `first(selector)`, `all(selector)`   **Signature:** `selector`: `String` → `Element?`, `List<Element>`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The first matching descendant, and the matching descendants in document order, within its own tree

**Changes.** Partly observable, as `matches`

<a id="function-node-contains"></a>

### Node: contains

**Syntax:** `contains(other)`   **Signature:** `other`: `Node` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether the other node is it or one of its descendants, within its own tree, so a node in a shadow tree it hosts is not; as `other` propagates null, null where `other` is null

**Changes.** Observable: the structure of its subtree

<a id="function-range-intersects"></a>

### Range: intersects

**Syntax:** `intersects(node)`   **Signature:** `node`: `Node` → `Boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether it holds any part of the node, as `intersectsNode` answers: false for a node of another tree, and true for an ancestor of what it holds

**Changes.** Partly observable, as `collapsed`

<a id="function-range-all"></a>

### Range: all

**Syntax:** `all(selector)`   **Signature:** `selector`: `String` → `List<Element>`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The elements matching the selector that it intersects, in document order: those among the ancestors of what it holds, its common ancestor included, then those within its common ancestor that it holds a part of, so `range.all("a[href]")` holds a link that holds the whole range and every link it crosses

**Changes.** Partly observable: as `collapsed`, the document's attributes and focus moving, and as [`matches`](#function-element-matches) misses, pointer state and control state are not observed

<a id="function-range-offsetsin"></a>

### Range: offsetsIn

**Syntax:** `offsetsIn(element)`   **Signature:** `element`: `Element` → `Selection?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Its start and its end as offsets in the element's [`text`](#property-element-text), in UTF-16 code units, as Nexo's strings count them; null where either boundary lies outside the element

**Changes.** Partly observable, as `collapsed`

<a id="function-list-item"></a>

<a id="functions-list-item"></a>

### List: item

The unnamed indexer, `[index]`, is an indexer [Nexo's own module](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="function-list-max-min-sum"></a>

<a id="functions-list-max-min-sum"></a>

### List: max, min, sum

`max`, `min` and `sum` are functions [Nexo's own module](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="function-list-where"></a>

<a id="functions-list-where"></a>

### List: where

`where` is a function [Nexo's own module](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="boolean-functions"></a>

<a id="conditions"></a>

<a id="predicates"></a>

## Boolean functions

DOMQL tests the DOM with [Boolean functions](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/vocabulary.md#vocabulary-boolean-functions), functions whose result is a Boolean: of a state the user, the browser or the page sets and clears over time, as `it.checked()` is; of a presence, as `it.focus()` is; and of a capability, as `Domql.window.share()` is. A query calls one on its receiver, `it.checked()`, or through its module, `Domql.checked(it)`, and each way reaches the one declaration, whose observations follow it.

Each applies to the receivers it declares, takes no argument, and answers a Boolean or fails the evaluation. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it, as `attached`, `hasChildren` and `hasSelection` are. Boolean functions compose as Booleans do: `it.class["open"] and it.focusWithin()`.

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
| Element | [`displayed`](#boolean-function-element-displayed) |
| Element | [`focusable`](#boolean-function-element-focusable) |
| Element | [`hover`](#boolean-function-element-hover) |
| Element | [`popoverOpen`](#boolean-function-element-popoveropen) |
| Element | [`checked`](#boolean-function-element-checked) |
| Element | [`indeterminate`](#boolean-function-element-indeterminate) |
| Element | [`autofilled`](#boolean-function-element-autofilled) |
| Document | [`visible`](#boolean-function-document-visible) |
| Document | [`focus`](#boolean-function-document-focus) |
| Window | [`share`](#boolean-function-window-share) |
| Window | [`clipboard`](#boolean-function-window-clipboard) |

<a id="boolean-function-element-disabled"></a>

<a id="condition-element-is-disabled"></a>

<a id="conditions-element-isdisabled"></a>

### Element: disabled

**Syntax:** `disabled()`   **Reads:** Fresh

**True when.** The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `it["disabled"]`, a separate question

**Changes.** Observable: its own and its ancestors' `disabled` attributes and the structure between them

<a id="boolean-function-element-readonly"></a>

<a id="condition-element-is-readonly"></a>

<a id="conditions-element-isreadonly"></a>

### Element: readonly

**Syntax:** `readonly()`   **Reads:** Fresh

**True when.** Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes

**Changes.** Observable: its `readonly` and `type` attributes

<a id="boolean-function-element-texteditable"></a>

<a id="condition-element-is-text-editable"></a>

<a id="conditions-element-istext-editable"></a>

### Element: textEditable

**Syntax:** `textEditable()`   **Reads:** Fresh

**True when.** The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, as the nearest `contenteditable` of a state, its own or an ancestor's, decides: `true`, the empty value and `plaintext-only` make it editable and `false` does not, while an invalid value, `inherit` among them, inherits, as the attribute does natively; where none decides, the document's design mode does.

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

<a id="boolean-function-element-displayed"></a>

### Element: displayed

**Syntax:** `displayed()`   **Reads:** Fresh

**True when.** The browser renders a box for it, as `checkVisibility()` decides: it is attached, neither it nor an ancestor is `display: none`, it is not `display: contents`, and no ancestor's `content-visibility` skips its content. A box hidden by `visibility` or by its opacity, and one of no size, is displayed

**Changes.** Partly observable: its size, and the attributes and the structure of every tree its flat-tree ancestry passes through, are observed; a stylesheet's rules hiding or showing it where its box keeps its size, as a box of no size, and `content-visibility` skipping it, are not

<a id="boolean-function-element-focusable"></a>

### Element: focusable

**Syntax:** `focusable()`   **Reads:** Fresh

**True when.** It can take focus, as HTML's focusable areas decide, since no API of the browser answers it:

- It is displayed and visible, as `checkVisibility({ visibilityProperty: true })` decides.
- It is neither disabled, as `disabled()` decides, nor inert, as `textEditable` reads the `inert` attribute along its flat tree.
- It has a `tabindex` HTML reads as an integer, a negative one included, or is focusable by default: an `a` or an `area` with an `href`, a `button`, a `select`, a `textarea`, an `iframe`, an `input` of any type but `hidden`, its `details`'s first `summary`, an `audio` or a `video` with `controls`, or an editing host, an element whose content is editable while its parent's is not.

Whether the Tab key reaches it, which a negative `tabindex` prevents, is another question, which its `tabindex` answers

**Changes.** Partly observable: as `displayed`; a visibility a stylesheet's rules change, the inertness a modal dialog gives the rest of the document and the document's design mode are not observed either

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

<a id="boolean-function-element-indeterminate"></a>

### Element: indeterminate

**Syntax:** `indeterminate()`   **Reads:** Fresh

**True when.** It matches `:indeterminate`: a checkbox the page's code made mixed, a radio button none of whose group is checked, or a progress bar without a value

**Changes.** Partly observable: the user's input in its tree and form resets, the `checked`, `name`, `type` and `value` attributes and the structure of its tree are observed; the page's code setting `indeterminate` or `checked` fires no event and is not

<a id="boolean-function-element-autofilled"></a>

### Element: autofilled

**Syntax:** `autofilled()`   **Reads:** Fresh

**True when.** It matches `:autofill`, or `:-webkit-autofill` in a browser that knows no other: the browser filled its value, from a saved address or password, and the user has not edited it since

**Changes.** Partly observable: the user's input and changes in its tree are observed, which the browser fires as it fills a field the user chose a suggestion for; the browser filling a field on its own, as a password manager does as the page loads, fires no event and is not. No observation follows the filling itself, since one would write a stylesheet into the page, which watching never does

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

So `it.checked() or it.aria.checked()` is whether either says checked, and `it.aria["checked"] == "mixed"` tells a mixed state, which the ARIA view's `checked` answers false for, from the others. The ARIA view's unnamed indexer reads the attribute written on the element, as `it["aria-checked"]` does, and never the element's effective accessibility state.

No other ARIA attribute has a Boolean function until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean; an extension declares one on the ARIA view, a type it does not own, as the [rules for extensions](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/extensions.md#extensions) let any module do.

<a id="conditions-related-questions"></a>

### Related questions

`it.focus()` asks whether the element itself is focused, `it.focusWithin()` whether focus is anywhere within it, `it.focusable()` whether it can take focus, and `Domql.document.activeElement` which element has it; an extension can offer richer focus semantics, as a Boolean function of elements under its module's own name or of its own types; they are separate questions with separate names.

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

A query converts with the four conversions [Nexo's own module](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/modules.md#vocabulary-conversions) declares between the language's types of data, which DOMQL's module, owning none of those types, declares none of; each rejects a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `String` | `Number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `Number` | `String` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `Boolean` | `String` | `"true"` or `"false"` |
| `String` | `Boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

<a id="observations"></a>

## Observations

A member names the [observations](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/observations.md#observations) that cover its changes, each by its type and its target, and DOMQL starts each one that a watch, a waiting evaluation or an event's object expression needs, and stops it once nothing needs it. DOMQL's module declares the browser's observations as nine observation types, which the members of any module can name, and five observation targets.

<a id="observations-types"></a>

### Observation types

Each type is shared by equivalent requests, those of the same target and the same arguments of its identity in the same window, so two requests that differ in an argument that changes what is observed, such as an intersection's root or margin, never share.

| Type | Contract | Observes | Arguments | Identity |
| --- | --- | --- | --- | --- |
| `resize` | Invalidation | The size of an element's box, of a document's root element's, or of the window's layout viewport, a viewport scrollbar appearing or going included | `box`: the box `ResizeObserver` observes, `border-box` when omitted, or `client`, the border box and the content box both | `box` |
| `mutation` | Invalidation | A node's attributes, its children or its text, and its descendants' where `subtree` says so | `attributes`: `true`, or a list of attribute names; `childList`, `subtree` and `characterData`, Booleans, false when omitted; at least one of attributes, children and text is observed | All four |
| `attachment` | Invalidation | Whether a node is attached to its document, through every shadow root between them, a node another document owns inserted into the window's document included | None | None |
| `intersection` | Maintained | Whether the browser reports an element intersecting a root, or the window where the root is null, grown by a margin in CSS pixels; pending until its first report | `root`, an element or null, null when omitted; `margin`, a number, 0 when omitted | `root`, `margin` |
| `media` | Invalidation | Whether a media query matches | `query`, the media query | `query` |
| `pixelRatio` | Invalidation | The device pixel ratio | None | None |
| `event` | Invalidation | Events of the given types reaching the target, or reaching it in the capture phase | `types`, a list of event types; `capture`, a Boolean, false when omitted | `types`, `capture` |
| `visibility` | Invalidation | Whether the document is visible | None | None |
| `navigation` | Invalidation | The window's URL: the Navigation API's current entry changing, which every navigation within the document and the history API change, or, in a browser without it, the window's `popstate` and `hashchange` | None | None |

<a id="observations-targets"></a>

### Observation targets

An observation observes its member's receiver, an argument, `{ argument }`, or a target DOMQL's module declares, as Nexo's [observation targets](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/observations.md#observations-targets) set out:

| Target | Found from the receiver | Observes |
| --- | --- | --- |
| `window` | No | The window the query runs against |
| `document` | No | The document the query runs against |
| `root` | Yes, one target | The receiver's [root](nodes-and-shadow-trees.md#trees-and-slots) |
| `roots` | Yes, several targets | The receiver's [roots](nodes-and-shadow-trees.md#trees-and-slots), which no maintained observation observes, since it gives its member one sample |
| `children` | Yes, several targets | Each child element of the receiver, in document order, none for a receiver that holds none or is no node; no maintained observation observes them either |

DOMQL resolves each target as it starts an observation, and each evaluation that reaches the member finds `root`, `roots` and `children` again, so a watch observes the trees its receiver is in as the receiver moves, as [trees and slots a watch follows](watches.md#trees-and-slots-a-watch-follows) set out, and the children it holds as they come and go. Where a member observes `children`, DOMQL observes the receiver's child list too, as it observes the structure of each of its roots where a member observes `roots`, so a child added is observed from the evaluation its addition causes and a child removed is let go of.

<a id="extension-modules"></a>

## Extension modules

A module extends the built-in vocabulary as Nexo's [modules](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/modules.md#modules) set out: it declares types of its own, each with its members and operators, Boolean functions among them, and event types, executions and observation types, and adds members to DOMQL's types in its [extensions](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/extensions.md#extensions), each naming the one type it extends qualified, as `{ name: 'ChartElements', kind: 'extension', target: 'Domql.Element', members: [/* … */] }` adds members to elements. `domql.createModule(name, contents)` creates one from its declarations, each that runs code carrying its implementation as its `impl`, and `domql.registerModule(module)` registers it in the instance's registry, which holds DOMQL's module and every module registered with it. A request is resolved against the modules it imports, registered by then, so a module a query imports is registered beforehand, once, rather than for every evaluation.

```js
domql.registerModule(domql.createModule("Charts", {
    types: [{
        name: "ChartElements",
        kind: "extension",
        target: "Domql.Element",
        members: [{
            name: "palette",
            kind: "property",
            result: "String?",
            updates: { changes: "observable", reads: "fresh", observations: [{ type: "mutation", of: "receiver", attributes: ["data-palette"] }] },
            impl: ({ receiver: element }) => element.getAttribute("data-palette")
        }]
    }]
}));

domql.query("import Charts\npanel:palette", { panel }).evaluate();
```

- **A query imports it, and reads its extensions with `:`.** A query that uses a module's vocabulary imports the module, `import Charts`, as [its imports](queries.md#making-a-query-imports) set out, and reads a member an extension adds with `:`, never `.`: `panel:palette`, or `panel:ChartElements.palette` where two of its extensions declare one name, as Nexo's [extension access](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/extensions.md#extensions-access) sets out. DOMQL's own members stand within its types, so a query reads them with `.`.
- **DOMQL's members win on its types.** A name DOMQL's type declares is read with `.` as DOMQL's, and an extension's member of that name is read with `:` alone. Two modules' extensions declaring one name both register, and a query that reads the name where neither is more specific is refused where it does so (NEXO3024), naming the extensions to write.
- **What an implementation receives.** Every implementation receives the one object Nexo's [implementations](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/members.md#members-what-an-implementation-receives) receive, whose `env` holds the `window` and the `document` the query runs against.
- **Reading.** A member's implementation is synchronous and reads alone, as Nexo requires of every vocabulary, so evaluating, watching and subscribing change nothing; a change to the page is an [execution](executions.md).
- **Event types.** A module adds event types of its own as keys of DOMQL's type selector `event`, each a mapping, `{ selector: 'event', key, type }`, naming the type its events are captured as, so `on` listens to them as it listens to the built-in ones.
- **Observations.** A member of any module names DOMQL's observation types and targets as DOMQL's own members do. DOMQL resolves the targets its own module declares alone, so a module declaring observation targets of its own is refused when it is registered, and an observation type a module declares, which owns no target, observes the receiver or an argument. An observation type a module declares is started by its implementation, which receives `request`, the observation's `type`, its `target` and its `arguments`, each argument the member names resolved to its value; `notify`, which it calls when what it observes may have changed; and `env`. It answers an object whose `stop()` ends the observation and, for a maintained observation, whose `sample()` answers its latest sample, `{ pending, value }`.

<a id="extension-modules-registering"></a>

### Registering a module while requests run

A query's imports decide what it resolves against, so a module registered later changes no resolution's meaning: a running watch, subscription or continuous execution keeps the resolution it has, and goes on evaluating and delivering, as Nexo keeps a resolution [current](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/resolution.md#runtime-reuse).

- **A module that recognizes values.** A module declaring a `typeOf` may recognize values a resolution captures, so it makes stale the resolutions that may meet such a value, as Nexo's [reusing a resolution](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/resolution.md#runtime-reuse) sets out: one whose host call supplies `DomEvent`, whose `target` is a nullable reference, among them. An operation started after it resolves its request again.
- **A running watch or a waiting evaluation made stale** resolves its request again at its next evaluation, which evaluates the whole query anew, as each of its evaluations does, so it goes on as before. A watch compares that evaluation's result as it compares any, within each value's tolerance: Nexo gives every resolution of one definition the same [origins](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/evaluation.md#runtime-results) where it selects the same declarations. Resolving again checks what starting the watch checked, and its refusal is that evaluation's failure.
- **A subscription or a once execution made stale** prepares its request again where a value its host call supplies is next projected: at the next event, or as the execution's result arrives. Where that preparation reaches the declaration it was carried out through, the value is projected through it, its locals and the object expression evaluated as that preparation finds them, and a subscription goes on listening with the receiver and the arguments its event source started with. Where it reaches none, or another, the subscription hands its handler the failure `DOMQL5015` and ends, and the once execution rejects with it, its effect standing. Where preparing it again fails, the subscription hands its handler that failure and ends, and the once execution rejects with it.

<a id="extension-modules-host-calls"></a>

### Host calls DOMQL carries out

A module declares an event source or an execution as a [host call](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/language/members.md#members-host-calls), a function with `invokedBy: 'host'`, within a type, within an extension, or among its module members, and gives DOMQL what Nexo leaves to its host: the `requestKind` the call makes, `subscription` for an event source or `execution`; an execution's `executionMode`, `once` or `continuous`; and the `impl` that carries it out. `domql.createModule` keeps these in DOMQL's own catalog, and gives Nexo the declaration without them, so Nexo resolves and prepares the call and DOMQL alone invokes it. One declaration standing within several types, as DOMQL's `on` does within `Element`, `Document` and `Window`, is kept for each.

| Host call | `requestKind` | `executionMode` | Its `result` | Its implementation receives | It answers |
| --- | --- | --- | --- | --- | --- |
| Event source | `subscription` | Refused | The type of each event it delivers, `@selected` where an event type selects it | `receiver`, `args`, `env` and `deliver`, which each event is handed to | An object whose `stop()` ends the listening |
| Once execution | `execution` | `once` | The type of its result | `receiver`, `args`, `env` and `signal`, which aborts it | Its result, or a promise of it |
| Continuous execution | `execution` | `continuous` | None; one declared is refused | `receiver`, `args`, `env` and `reportError`, which a failure while it runs is reported through | An object whose `update(receiver, args)` applies new arguments and whose `dispose()` ends it, started before it returns |

`domql.createModule` refuses, with a module error naming the declaration, the type it stands within and the key, of the code [errors](errors.md#errors-module) give, a host call whose `requestKind` is missing or neither `subscription` nor `execution`; an execution whose `executionMode` is missing or neither `once` nor `continuous`; an event source given an `executionMode`, or declaring no result, since each event it delivers is the value its subscription projects; a member the evaluator invokes given either key, an unnamed indexer named `[]`, as Nexo names it; and a continuous execution that declares a result. `domql.registerModule` refuses a module declaring a host call its catalog holds nothing of, as a module `domql.createModule` did not make. So an execution whose mode was left out is refused as an execution missing its mode.

On a receiver of unknown type, a host call has no declaration yet, so its [candidates](https://github.com/FormaUI/Nexo/blob/65d247bc6f6b0dde1b701bbfd41f19a40838174c/spec/runtime/host-calls.md#runtime-host-calls), every declaration that takes the call as it is written, say what it does, as they say who invokes it. Where they disagree on what they request, the request is refused as ambiguous with a validation error, located at the call.
