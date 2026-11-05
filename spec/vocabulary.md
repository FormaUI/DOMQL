# Built-in vocabulary

<a id="built-in-vocabulary"></a>
<a id="vocabulary"></a>

The **built-in vocabulary** is what DOMQL's module, `Domql`, declares: the DOM's types, and the module members, properties, states among them, functions, event sources, executions and observations a query reads and changes them through. Everything a query can ask about is a member a module contributes, DOMQL's own module and every extension by one contract, so adding a member leaves the grammar unchanged.

```domql
panel.size?.width                        // A property of an element, then a property of the size it answers.
panel["data-key"]                        // An attribute, through the unnamed indexer.
panel.closest(".row")                    // A function, given its selector.
panel.disabled                           // A state, a Boolean property of the element.
Domql.window.media["(min-width: 40em)"]  // A named indexer of the window, a module member.
```

Properties and functions are named in camelCase, and names are case-sensitive. Built-in members expose state or event sources, and built-in executions change the page, each one platform call; an execution that carries a policy comes from an extension. A property is read by property access, and a function is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out. A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

<a id="vocabulary-properties-and-functions"></a>

**Properties and functions.** The vocabulary follows Nexo's rule for [states and tests](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/vocabulary.md#vocabulary-boolean-functions): a property names what its receiver is, has or is in, and a function does work or takes what it needs.

- **A state is a property.** What the user, the browser or the page sets and clears, as whether an element is checked, focused or hovered, is a Boolean property read without a call, `panel.checked`, as [states](#states) set out.
- **An execution is a function.** A change DOMQL makes is named by the verb it carries out and called with its parentheses, whether or not it takes an argument, `panel.focus()`, as [executions](#built-in-executions) set out.
- **A member that takes an argument is a function** whatever it answers, as `matches(selector)` and `contains(other)` are.

Nexo's own module declares the members of lists, among them `count`, `first`, `last`, `max`, `min`, `sum`, `where` and the unnamed indexer `[index]`, and those of numbers and strings; the entries below for the members of lists a query of the DOM reads most point to Nexo's specification, which defines them all. DOMQL's event sources and event types are set out in [events](events.md).

In this document:

1. [Module members](#module-members)
2. [Types](#vocabulary-types)
3. [Measurements and layout](#vocabulary-measurements-and-layout)
4. [Properties](#properties)
5. [Functions](#functions)
6. [States](#states)
7. [Executions](#built-in-executions)
8. [Built-in conversions](#built-in-conversions)
9. [Observations](#observations)
10. [Extension modules](#extension-modules)

<a id="module-members"></a>

## Module members

DOMQL's module, `Domql`, declares two [module members](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/modules.md#namespaces-module-members), read through its namespace, each with no receiver:

| Member | Type | Reads | Changes |
| --- | --- | --- | --- |
| `Domql.document` | `Document` | The document the query runs against, from the environment DOMQL gives its evaluator | Constant for an evaluator |
| `Domql.window` | `Window` | That document's window, which is also the layout viewport | Constant for an evaluator |

Neither needs a binding, and a caller's binding named `Domql` is read as `~Domql`, since every query imports DOMQL's module under that name.

<a id="vocabulary-types"></a>

## Types

DOMQL's module declares each of its types with its members, as Nexo's [declaring a type](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/modules.md#modules-declaring-a-type) sets out: its reference types, which a query reads through and a result never holds, and its structured types, which hold data. Its `typeOf` recognizes the values a host binds, and each reference type's `isInstance` checks membership:

| Reference type | Supertype | What it is | Where a value has the type |
| --- | --- | --- | --- |
| `Node` | None, abstract | A [node](nodes-and-shadow-trees.md#nodes) of the DOM tree | A member's result, as `parent`'s and `root`'s, or a declared binding; never `typeOf`, since it is abstract |
| `Element`, `Document`, `DocumentFragment`, `ShadowRoot` | `Node` | The kinds of node | DOMQL's `typeOf`, a member's result, as the items of `children` are, or a declared binding |
| `Window` | None | The window a query runs in | DOMQL's `typeOf`, `Domql.window`'s result, or a declared binding |
| `Shadow` | None | An element's [shadow view](nodes-and-shadow-trees.md#shadow-trees-the-view) | An element's `shadow`, or a declared binding |
| `Aria` | None | An element's [ARIA view](#states) | An element's `aria`, or a declared binding |
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
| `Listening` | How an event source listens: in the capture phase, or at the target and as it bubbles | `capture`: `Boolean` |

`on`, an event source, is one declaration DOMQL's module gives each of `Element`, `Document` and `Window`, the receivers it listens on, and `Listening` its option, as [event sources](events.md#event-sources) set out.

A property of a structured value's data shape, such as a rectangle's `width`, is data the value holds, read by property access, and is constant for that value. A structured value that holds a reference, as a `DocumentSelection` holds its `range`, is read through an object expression, as an event is, since no result holds a reference. Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are. The types of event data are set out in [events](events.md#event-types).

<a id="vocabulary-measurements-and-layout"></a>
<a id="elements-without-a-layout-box"></a>

## Measurements and layout

Measurements use CSS pixels unless stated otherwise. An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout. A watch that read null of a detached element follows it back into the document, as [elements that leave the document](watches.md#elements-that-leave-the-document) sets out.

<a id="vocabulary-tolerance"></a>

**Tolerance.** A member that measures layout in CSS pixels declares a [tolerance](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/members.md#what-a-member-declares-numeric-tolerance) of 0.05, a twentieth of a pixel, for every number it answers, so a watch reports a measurement only once it moves by more than that from the one it last reported, as [comparing snapshots](results.md#comparing-snapshots) sets out:

- **What it absorbs.** A box settling by a unit of the browser's layout, 1/64 of a pixel in Chromium and WebKit and 1/60 in Firefox, and the rounding of the arithmetic that answers a measurement, as `right` is `left` and `width` added.
- **What it reports.** Any move a device pixel shows, which is a quarter of a pixel at a device pixel ratio of 4. A move made in steps smaller than the tolerance is reported once the steps add up to more, since each is compared with the measurement last reported.
- **Who declares it.** `rect`, `clientRect`, `rectRelativeTo`, `size`, `clientSize`, `scroll` and `grid` of an element, and `size` and `scroll` of the window. A number computed from one, as `it.rect?.width / 2`, compares exactly, as Nexo's [arithmetic](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/expressions.md#arithmetic-watching) sets out, and an evaluation once is never rounded.

Scrolling reads the same way, along the axes of a box's writing mode:

```domql
(panel.scroll?.block.offset ?? 0) > 0                // Whether it is scrolled from the start of its content.
item.scrollContainer({ axis = "block" })?.clientRect // The padding box of the box that scrolls it.
```

<a id="properties"></a>

## Properties

A property exposes a value, read by property access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as [how DOMQL's members read](evaluation.md#evaluation-how-members-read) and [how a member changes](watches.md#how-a-member-changes) define. The states the browser sets, Boolean properties as well, are set out in [states](#states).

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

- `offset`, how far it is scrolled from its scroll origin into its content, from 0 to `extent - viewport`, so 0 shows the start of its content in every direction. Where its style places the scroll origin at its right or its bottom, the browser counts the position from 0 down to the negative of its range, and `offset` is its distance from 0: under RTL, in a writing mode whose lines or blocks run that way, and along a flex container's main axis where its `flex-direction` is reversed, or its cross axis where it wraps in reverse, each reversal undoing another. A position past either end, as an elastic overscroll bounces to, reads as that end.
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

**Result.** Its view of its ARIA states, which its [states](#states) read and its unnamed indexer reads as its ARIA attributes

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

**Changes.** Observable: focus moving, inside an open shadow root too, and the focused element removed, which moves focus away, through the [`focus`](#observations-types) observation

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

`count`, `first` and `last` are properties [Nexo's own module](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

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

**Result.** Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it. It is the browser's report whatever the layout: false for an element or a root that has no layout box, detached or hidden, rather than the null other members that need a layout answer. It is null only until the browser first reports the element against that root and margin, as for any [maintained member](evaluation.md#waiting-for-maintained-members) read for the first time.

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

**Changes.** Partly observable: what its selector reads in the tree it is in, through the [`selector`](#observations-types) observation: the tree's structure and the attributes the selector tests, focus moving where it tests focus, and popovers opening and closing where it tests `:popover-open`; pointer state such as `:hover`, control state such as `:checked`, state no attribute holds, as `:target`, and a shadow host's state that `:host()` tests are not. An attribute the selector never tests, as a `tabindex` written in the tree is for `.row`, evaluates no watch again

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

**Changes.** Partly observable: as `collapsed`, and what its selector reads in the document, as [`matches`](#function-element-matches) observes it in its tree, which misses what `matches` misses

<a id="function-range-offsetsin"></a>

### Range: offsetsIn

**Syntax:** `offsetsIn(element)`   **Signature:** `element`: `Element` → `Selection?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Its start and its end as offsets in the element's [`text`](#property-element-text), in UTF-16 code units, as Nexo's strings count them; null where either boundary lies outside the element

**Changes.** Partly observable, as `collapsed`

<a id="function-list-item"></a>

<a id="functions-list-item"></a>

### List: item

The unnamed indexer, `[index]`, is an indexer [Nexo's own module](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="function-list-max-min-sum"></a>

<a id="functions-list-max-min-sum"></a>

### List: max, min, sum

`max`, `min` and `sum` are functions [Nexo's own module](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="function-list-where"></a>

<a id="functions-list-where"></a>

### List: where

`where` is a function [Nexo's own module](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/collections.md#collections-list-members) declares, which owns lists, and Nexo's specification defines.

<a id="states"></a>

<a id="boolean-functions"></a>

<a id="conditions"></a>

<a id="predicates"></a>

## States

A **state** is what the user, the browser or the page sets and clears over time, as whether an element is checked; a presence, as whether it is focused; or a capability the browser offers, as whether it can share. Each is a Boolean property, as Nexo's [states and tests](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/vocabulary.md#vocabulary-boolean-functions) set out:

- **Reading one.** A query reads a state where it stands, `it.checked`, or through its module, its receiver first, `Domql.checked(it)`, and each way reaches the one declaration, whose observations follow it.
- **Filtering by one.** A query filters by a state with a body, `rows.where(it.checked)`. Only a function has a reference, so `rows.where(Domql.checked)` is refused (NEXO3076).
- **Composing them.** States compose as Booleans do: `it.class["open"] and it.focusWithin`.

Each applies to the receivers it declares, and answers a Boolean or fails the evaluation. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it too, as `attached`, `hasChildren` and `hasSelection` are, which [properties](#properties) set out.

<a id="conditions-condition-declarations"></a>

<a id="conditions-fixed-condition-names"></a>

<a id="conditions-receiver-types"></a>

<a id="conditions-it-is-a-call-as-any-other"></a>

<a id="conditions-boolean-result"></a>

<a id="conditions-conditions-compose-as-booleans-do"></a>

The built-in vocabulary declares these states, each with its native semantics: what the browser itself decides, as its pseudo-class matches, as the document reports its own state, or as the browser offers an API.

| Receiver | State |
| --- | --- |
| Element | [`disabled`](#state-element-disabled) |
| Element | [`readonly`](#state-element-readonly) |
| Element | [`textEditable`](#state-element-texteditable) |
| Element | [`focused`](#state-element-focused) |
| Element | [`focusWithin`](#state-element-focuswithin) |
| Element | [`displayed`](#state-element-displayed) |
| Element | [`focusable`](#state-element-focusable) |
| Element | [`hovered`](#state-element-hovered) |
| Element | [`popoverOpen`](#state-element-popoveropen) |
| Element | [`checked`](#state-element-checked) |
| Element | [`indeterminate`](#state-element-indeterminate) |
| Element | [`autofilled`](#state-element-autofilled) |
| Document | [`visible`](#state-document-visible) |
| Document | [`focused`](#state-document-focused) |
| Window | [`canShare`](#state-window-canshare) |
| Window | [`hasClipboard`](#state-window-hasclipboard) |

<a id="state-element-disabled"></a>

<a id="boolean-function-element-disabled"></a>

<a id="condition-element-is-disabled"></a>

<a id="conditions-element-isdisabled"></a>

### Element: disabled

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `it["disabled"]`, a separate question

**Changes.** Observable: its own and its ancestors' `disabled` attributes and the structure between them

<a id="state-element-readonly"></a>

<a id="boolean-function-element-readonly"></a>

<a id="condition-element-is-readonly"></a>

<a id="conditions-element-isreadonly"></a>

### Element: readonly

**Type:** `Boolean`   **Reads:** Fresh

**True when.** Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes

**Changes.** Observable: its `readonly` and `type` attributes

<a id="state-element-texteditable"></a>

<a id="boolean-function-element-texteditable"></a>

<a id="condition-element-is-text-editable"></a>

<a id="conditions-element-istext-editable"></a>

### Element: textEditable

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, as the nearest `contenteditable` of a state, its own or an ancestor's, decides: `true`, the empty value and `plaintext-only` make it editable and `false` does not, while an invalid value, `inherit` among them, inherits, as the attribute does natively; where none decides, the document's design mode does.

An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root

**Changes.** Partly observable: everything `disabled` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not

<a id="state-element-focused"></a>

<a id="boolean-function-element-focus"></a>

<a id="condition-element-has-focus"></a>

<a id="conditions-element-hasfocus"></a>

### Element: focused

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It is the focused element of its tree

**Changes.** Observable: focus moving, inside an open shadow root too, and the focused element removed, which moves focus away, through the [`focus`](#observations-types) observation

<a id="state-element-focuswithin"></a>

<a id="boolean-function-element-focuswithin"></a>

<a id="condition-element-has-focus-within"></a>

<a id="conditions-element-hasfocus-within"></a>

### Element: focusWithin

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It matches `:focus-within`: it or an element within it is focused, across the shadow trees it hosts

**Changes.** Observable, as `focused` is

<a id="state-element-displayed"></a>

<a id="boolean-function-element-displayed"></a>

### Element: displayed

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The browser renders a box for it, as `checkVisibility()` decides: it is attached, neither it nor an ancestor is `display: none`, it is not `display: contents`, and no ancestor's `content-visibility` skips its content. A box hidden by `visibility` or by its opacity, and one of no size, is displayed

**Changes.** Partly observable: its size, and the attributes and the structure of every tree its flat-tree ancestry passes through, are observed; a stylesheet's rules hiding or showing it where its box keeps its size, as a box of no size, and `content-visibility` skipping it, are not

<a id="state-element-focusable"></a>

<a id="boolean-function-element-focusable"></a>

### Element: focusable

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It can take focus, as HTML's focusable areas decide, since no API of the browser answers it:

- It is displayed and visible, as `checkVisibility({ visibilityProperty: true })` decides.
- It is neither disabled, as `disabled` decides, nor inert, as `textEditable` reads the `inert` attribute along its flat tree.
- It has a `tabindex` HTML reads as an integer, a negative one included, or is focusable by default: an `a` or an `area` with an `href`, a `button`, a `select`, a `textarea`, an `iframe`, an `input` of any type but `hidden`, its `details`'s first `summary`, an `audio` or a `video` with `controls`, or an editing host, an element whose content is editable while its parent's is not.

Whether the Tab key reaches it, and in what order, is sequential focus navigation, which `focusable` doesn't answer, and no test of `tabindex` alone does either, since the browser's order counts more than it. A module that navigates focus owns it, as [D96](../docs/decisions.md#d96) records

**Changes.** Partly observable: as `displayed`; a visibility a stylesheet's rules change, the inertness a modal dialog gives the rest of the document and the document's design mode are not observed either

<a id="state-element-hovered"></a>

<a id="boolean-function-element-hover"></a>

<a id="condition-element-is-hover"></a>

<a id="conditions-element-ishover"></a>

### Element: hovered

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It matches `:hover`: the pointer is over it or over an element within it

**Changes.** Partly observable: the pointer moving over and off elements is observed; an element moving under a pointer that does not move, where the browser fires no pointer event for it, is not

<a id="state-element-popoveropen"></a>

<a id="boolean-function-element-popoveropen"></a>

<a id="condition-element-is-popover-open"></a>

<a id="conditions-element-ispopover-open"></a>

### Element: popoverOpen

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It matches `:popover-open`: it is a popover that is showing

**Changes.** Observable: its showing and hiding, its `popover` attribute removed and its removal included

<a id="state-element-checked"></a>

<a id="boolean-function-element-checked"></a>

<a id="condition-element-is-checked"></a>

<a id="conditions-element-ischecked"></a>

### Element: checked

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It matches `:checked`: a checked checkbox or radio button, or a selected option

**Changes.** Partly observable: the user's input in its tree, a radio button another of its group unchecks and an option its select changes included, form resets, the `checked` and `selected` attributes and the structure of its tree are observed; the page's code setting `checked` or `selected`, or a select's `value` or `selectedIndex`, fires no event and is not

<a id="state-element-indeterminate"></a>

<a id="boolean-function-element-indeterminate"></a>

### Element: indeterminate

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It matches `:indeterminate`: a checkbox the page's code made mixed, a radio button none of whose group is checked, or a progress bar without a value

**Changes.** Partly observable: the user's input in its tree and form resets, the `checked`, `name`, `type` and `value` attributes and the structure of its tree are observed; the page's code setting `indeterminate` or `checked` fires no event and is not

<a id="state-element-autofilled"></a>

<a id="boolean-function-element-autofilled"></a>

### Element: autofilled

**Type:** `Boolean`   **Reads:** Fresh

**True when.** It matches `:autofill`, or `:-webkit-autofill` in a browser that knows no other: the browser filled its value, from a saved address or password, and the user has not edited it since

**Changes.** Partly observable: the user's input and changes in its tree are observed, which the browser fires as it fills a field the user chose a suggestion for; the browser filling a field on its own, as a password manager does as the page loads, fires no event and is not. No observation follows the filling itself, since one would write a stylesheet into the page, which watching never does

<a id="state-document-visible"></a>

<a id="boolean-function-document-visible"></a>

<a id="condition-document-is-visible"></a>

<a id="conditions-document-isvisible"></a>

### Document: visible

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The document is visible

**Changes.** Observable

<a id="state-document-focused"></a>

<a id="boolean-function-document-focus"></a>

<a id="condition-document-has-focus"></a>

<a id="conditions-document-hasfocus"></a>

### Document: focused

**Type:** `Boolean`   **Reads:** Fresh

**True when.** Focus is anywhere within the document

**Changes.** Observable

<a id="state-window-canshare"></a>

<a id="boolean-function-window-share"></a>

<a id="condition-window-supports-share"></a>

<a id="conditions-window-supportsshare"></a>

### Window: canShare

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The browser offers the Web Share API, `navigator.share`, in this context; it says nothing of whether a particular share succeeds, which takes the user's activation, data the browser can share and the user's choice

**Changes.** Constant

<a id="state-window-hasclipboard"></a>

<a id="boolean-function-window-clipboard"></a>

<a id="condition-window-supports-clipboard"></a>

<a id="conditions-window-supportsclipboard"></a>

### Window: hasClipboard

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The browser offers the asynchronous clipboard, `navigator.clipboard`, which it does in a secure context alone; it says nothing of whether reading or writing is permitted, which the user and the browser decide when it is asked

**Changes.** Constant

A state's ARIA counterpart is no part of it: `it.checked` is what `:checked` matches, whatever `aria-checked` says. An element's ARIA states are states of its ARIA view, `it.aria`, a value of the type `Aria`, which has no data form, so a result never holds one, and `it.aria.checked` reads one.

Each reads the element's own attribute under a contract of its own, falling back on no native state, and observes that attribute:

| Receiver | State |
| --- | --- |
| ARIA view | [`checked`](#state-aria-view-checked) |
| ARIA view | [`disabled`](#state-aria-view-disabled) |

<a id="state-aria-view-checked"></a>

<a id="boolean-function-aria-view-checked"></a>

<a id="condition-aria-view-is-checked"></a>

<a id="conditions-aria-view-ischecked"></a>

### ARIA view: checked

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The element's own `aria-checked` is `true`, compared ignoring ASCII case; a missing attribute, `false`, `mixed`, the empty string and any other value, padded with spaces included, answer false

**Changes.** Observable: its `aria-checked` attribute

<a id="state-aria-view-disabled"></a>

<a id="boolean-function-aria-view-disabled"></a>

<a id="condition-aria-view-is-disabled"></a>

<a id="conditions-aria-view-isdisabled"></a>

### ARIA view: disabled

**Type:** `Boolean`   **Reads:** Fresh

**True when.** The element's own `aria-disabled` is `true`, compared as `checked` compares; an ancestor's `aria-disabled` is not read

**Changes.** Observable: its `aria-disabled` attribute

So `it.checked or it.aria.checked` is whether either says checked, and `it.aria["checked"] == "mixed"` tells a mixed state, which the ARIA view's `checked` answers false for, from the others. The ARIA view's unnamed indexer reads the attribute written on the element, as `it["aria-checked"]` does, and never the element's effective accessibility state.

No other ARIA attribute has a state until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean; an extension declares one on the ARIA view, a type it does not own, as the [rules for extensions](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/extensions.md#extensions) let any module do.

<a id="conditions-related-questions"></a>

### Related questions

`it.focused` asks whether the element itself is focused, `it.focusWithin` whether focus is anywhere within it, `it.focusable` whether it can take focus, and `Domql.document.activeElement` which element has it, while `it.focus()` moves focus to it; an extension can offer richer focus semantics, as a state of elements under its module's own name or of its own types; they are separate questions with separate names.

`readonly` and `textEditable` are separate questions too, and neither is the other's opposite:

| Element | `readonly` | `textEditable` |
| --- | --- | --- |
| An enabled, writable text input | false | true |
| A read-only text input | true | false |
| A disabled text input without `readonly` | false | false |
| An ordinary static element | false | false |
| An editable content region | false | true |

<a id="built-in-executions"></a>

## Executions

DOMQL's module declares these [executions](executions.md), each a host call DOMQL carries out: a once execution, which `executeAsync` carries out and which answers its result, and a continuous one, which `run` starts and which answers none. Each is one call of the platform's, and answers what the platform did in DOMQL's types; a change that carries a policy, as stepping focus through a list or placing a surface, is an extension's.

Each is a function named by the verb it carries out, called with its parentheses whether or not it takes an argument, as [properties and functions](#vocabulary-properties-and-functions) set out. A change that sets a state one way or the other is two executions, one for each way, as `mute()` and `unmute()` are, where the state it sets is read as a property, as `focus()` sets what `focused` reads.

```domql
field.focus()                                     // Whether focus landed on the field.
list.scrollTo({ block = 0, behavior = "smooth" }) // Whether the list moved, once it has.
```

Each states its syntax and signature, as a function's does, what it does and answers, and what it needs of the user. An argument of a value it takes none of, as a behavior it doesn't know, fails the execution with an evaluation error whose cause says why, before it changes anything; a failure the platform reports fails it alike, its cause the platform's error. A receiver that is null, or a null argument whose parameter propagates null, skips the execution, as [executing once](executions.md#executions-executing-once) sets out; a null argument whose parameter accepts null is passed as it stands, as `ownAttribute`'s `value` is.

**Activation.** A browser lets a page do some things only while the user has just acted, its **transient activation**, which a click, a key press or a tap gives for a few seconds. An execution that needs it says so. A subscription's handler runs inside the event's dispatch, so an execution it carries out at once has the activation the event gives, as a subscription's [reactions](events.md#events-reactions) do for a caller across a boundary; one carried out after a round trip may find it expired.

| Receiver | Execution | Mode |
| --- | --- | --- |
| Element, document, window | [`dispatch({ type, bubbles, detail })`](#execution-dispatch) | Once |
| Element | [`focus({ preventScroll })`](#execution-element-focus) | Once |
| Element, window | [`scrollTo({ inline, block, behavior })`, `scrollBy({ inline, block, behavior })`](#execution-scrollto-scrollby) | Once |
| Element | [`scrollIntoView({ block, inline, behavior })`](#execution-element-scrollintoview) | Once |
| Element | [`capturePointer({ pointerId })`, `releasePointer({ pointerId })`](#execution-element-capturepointer-releasepointer) | Once |
| Element | [`showPopover()`, `hidePopover()`](#execution-element-showpopover-hidepopover) | Once |
| Element | [`showModal()`, `close({ returnValue })`](#execution-element-showmodal-close) | Once |
| Element | [`play()`, `pause()`, `mute()`, `unmute()`](#execution-element-play-pause-mute-unmute) | Once |
| Window | [`writeToClipboard(text)`, `readFromClipboard({ types })`](#execution-window-writetoclipboard-readfromclipboard) | Once |
| Window | [`download({ name, content, type })`](#execution-window-download) | Once |
| Window | [`print()`](#execution-window-print) | Once |
| Window | [`requestShare({ title, text, url })`](#execution-window-requestshare) | Once |
| Element | [`markIndeterminate()`, `clearIndeterminate()`](#execution-element-markindeterminate-clearindeterminate) | Once |
| Element | [`replaceValue(value)`](#execution-element-replacevalue) | Once |
| Element | [`select({ start, end })`](#execution-element-select) | Once |
| Document selection | [`select({ node })`, `selectContents({ node, collapse })`, `collapse({ node, offset })`](#execution-document-selection-placement) | Once |
| Element | [`ownAttribute({ name, value, restore, keep })`, `ownClass({ name, present, restore, keep })`, `ownStyle({ property, value, restore, keep })`, `ownText({ value, restore, keep })`](#execution-element-owned-writes) | Continuous |
| Element | [`ownFileSource({ input, index, restore })`](#execution-element-ownfilesource) | Continuous |

<a id="execution-dispatch"></a>

### Element, document and window: dispatch

**Syntax:** `dispatch({ type, bubbles, detail })`   **Signature:** `type`: `String`; optional `bubbles`: `Boolean`, false when omitted; optional `detail`: `Any?`, null when omitted → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Dispatches a `CustomEvent` of the type at the receiver, as the page's code does with `dispatchEvent`: cancelable, bubbling where `bubbles` is true, not composed, so it stays within its shadow tree, and its `detail` the data given. An event of a native type, as `change`, reaches its listeners as a custom event, whose default action, as a link's navigation, never runs, and none carries the user's activation, since the browser marks none it didn't dispatch itself as trusted

**Answers.** Whether a listener cancelled it, as `preventDefault` does

<a id="execution-element-focus"></a>

<a id="execution-element-takefocus"></a>

### Element: focus

**Syntax:** `focus({ preventScroll })`   **Signature:** optional `preventScroll`: `Boolean`, false when omitted → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Moves focus to the element, as its `focus()` does in the page's code, scrolling it into view unless `preventScroll` is true

**Answers.** Whether focus landed on it, as its [`focused`](#state-element-focused) reads afterwards: false where it can't take focus, as one disabled, inert, hidden or no focusable area is, and focus stays where it was

<a id="execution-scrollto-scrollby"></a>

### Element and window: scrollTo, scrollBy

**Syntax:** `scrollTo({ inline, block, behavior })`, `scrollBy({ inline, block, behavior })`   **Signature:** optional `inline`, `block`: `Number?`, the axis left as it is when omitted or null; optional `behavior`: `String`, `"auto"` when omitted → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Scrolls the box along the axes of its writing mode, as its [`scroll`](#property-element-scroll) reads them, the window's along those of the document's root element, as [its `scroll`](#property-window-scroll) reads them. `scrollTo` sets each axis's offset from the scroll origin to the number given, and `scrollBy` moves it by the number given, toward the end of the content where it is positive, so `scrollTo({ inline = 0 })` shows the start of the content under RTL too, where the browser counts the position down from 0. Which way an axis runs is its box's style's, as `scroll` reads it, never its position's, so a scroll from an offset of 0 goes into the content of a reversed flex container too. The browser holds the offset within the box's scroll range. `behavior` is `"auto"`, as the box's `scroll-behavior` decides, `"instant"` or `"smooth"`.

<a id="execution-scroll-instant"></a>

A scroll is **instant** where its `behavior` is `"instant"`, or `"auto"` where the box computes `scroll-behavior: auto`, the root element for the window, whose `scroll-behavior` the viewport takes. A scroll in a hidden document is instant whatever its behavior: the document lays out no frame to animate it in, so DOMQL asks the browser for an instant scroll there

**Answers.** Whether its position moved, once the scroll has ended. An instant scroll ends as the browser's method returns, so it answers without waiting for an animation frame. A smooth scroll is waited for, as the browser's scroll method reports its end, and, in a browser whose method reports none, until the first animation frame from the third in which the box holds still; a document hidden while it runs lays out no frame, so it ends, and answers, once the document is shown again. False where it was there already, where its scroll range holds it, and where it scrolls nothing, as a box that is no scroll container

<a id="execution-element-scrollintoview"></a>

### Element: scrollIntoView

**Syntax:** `scrollIntoView({ block, inline, behavior })`   **Signature:** optional `block`: `String`, `"start"` when omitted; optional `inline`: `String`, `"nearest"` when omitted; optional `behavior`: `String`, `"auto"` when omitted → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Scrolls each box that holds the element, and the window, so it shows, aligned along each axis of its writing mode at the `"start"`, the `"center"` or the `"end"`, or at the `"nearest"` edge, which leaves an axis it shows along as it is; `behavior` as `scrollTo` takes it. Under `"auto"` it is [instant](#execution-scroll-instant) where every box it may move computes `scroll-behavior: auto`: each scroll container among the element's flat-tree ancestors, one whose overflow is not `visible` or `clip`, and the viewport, as the root element gives it

**Answers.** Whether it is in view once the scroll has ended, waited for as `scrollTo` waits, an instant one not at all: its border box overlaps the layout viewport and the padding box of every flat-tree ancestor that clips its overflow, compared as [`overlaps`](#function-element-overlaps) compares boxes. False where it has no layout box, and where a box that clips without scrolling, as one of `overflow: clip`, holds it outside its edges

<a id="execution-element-capturepointer-releasepointer"></a>

### Element: capturePointer, releasePointer

**Syntax:** `capturePointer({ pointerId })`, `releasePointer({ pointerId })`   **Signature:** `pointerId`: `Number` → `Boolean`   **Mode:** Once   **Activation:** An active pointer

**Does.** Captures the pointer to the element, so the pointer's events target it until the capture is released or the pointer ends, as the browser's `setPointerCapture` does, or releases a capture the element holds, as `releasePointerCapture` does

**Answers.** `capturePointer` answers whether the element holds the capture afterwards, as [`hasPointerCapture`](#function-element-haspointercapture) answers at once, before the browser reports it, and false for a pointer that is not active and for an element in no document, which the browser refuses; `releasePointer` answers whether it released a capture the element held, and false where it held none. A refusal of any other kind fails the execution, its cause the browser's error

**Activation.** The pointer must be active: a mouse's while a button is pressed, and a touch's or a pen's while it touches. A capture carried out while the pointer's `pointerdown` is handled, from a subscription's handler, holds from that event on; one asked after a round trip may find the pointer released

<a id="execution-element-showpopover-hidepopover"></a>

### Element: showPopover, hidePopover

**Syntax:** `showPopover()`, `hidePopover()`   **Signature:** → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Shows the popover in the top layer, or hides it, as the browser's own `showPopover()` and `hidePopover()` do, firing its `beforetoggle` and `toggle` events and hiding the other popovers its showing closes

**Answers.** Whether it changed the popover, as [`popoverOpen`](#state-element-popoveropen) reads it afterwards. An element already in the state asked for answers false without calling the browser, which would leave it as it is or refuse it, as some browsers do: `showPopover()` answers false for a popover showing already, and `hidePopover()` for one hidden already and for an element that is no popover; each answers false too where a `beforetoggle` listener keeps the popover as it was. `showPopover()` fails for an element that is no popover, and for one in no document, which the browser refuses, its refusal the failure's cause

<a id="execution-element-showmodal-close"></a>

### Element: showModal, close

**Syntax:** `showModal()`, `close({ returnValue })`   **Signature:** `close`: optional `returnValue`: `String?`, the dialog's return value left as it is when omitted or null → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Opens a dialog modally, in the top layer, making the rest of the document inert, or closes it, setting its `returnValue` to the one given, as the browser's own `showModal()` and `close()` do, firing its `close` event

**Answers.** Whether it changed the dialog: `showModal()` answers false for a dialog open modally already, and `close` for one closed already, without calling the browser. Each fails for an element that is no dialog, and `showModal()` for a dialog open without being modal or in no document, which the browser refuses, its refusal the failure's cause

<a id="execution-element-play-pause-mute-unmute"></a>

<a id="execution-element-play-pause-writemuted"></a>

### Element: play, pause, mute, unmute

**Syntax:** `play()`, `pause()`, `mute()`, `unmute()`   **Signature:** `play` → `String`; `pause`, `mute`, `unmute` → `Boolean`   **Mode:** Once   **Activation:** The browser's autoplay policy, for `play`

**Does.** Plays an `audio` or a `video` element, pauses it, mutes it or unmutes it, as its own `play()`, `pause()` and `muted` do in the page's code

**Answers.** `play` answers how the browser took the request, once it settles it: `"playing"`; `"blocked"`, where its autoplay policy refuses to play without the user's activation; `"aborted"`, where a pause or a new source interrupts it first; and `"unsupported"`, where it can play no source the element has, and for an element that is no media element. A failure of another kind fails the execution, its cause the browser's error. `pause`, `mute` and `unmute` answer whether they changed the element, as its [`playback`](#property-element-playback) reads it afterwards: false where it was so already and for an element that is no media element, which they leave as it is

**Activation.** Most browsers play a muted element without the user's activation and want it for sound; a browser test shows headless Chromium blocking either until the user acts, and playing from a subscription's handler of the click

<a id="execution-window-writetoclipboard-readfromclipboard"></a>

<a id="execution-window-writeclipboard-readclipboard"></a>

### Window: writeToClipboard, readFromClipboard

**Syntax:** `writeToClipboard(text)`, `readFromClipboard({ types })`   **Signature:** `writeToClipboard`: `text`: `String` → `String`; `readFromClipboard`: optional `types`: `List<String>`, `["text/plain"]` when omitted → `ClipboardContent`   **Mode:** Once   **Activation:** As the browser decides

**Does.** Writes the text to the clipboard, as `navigator.clipboard.writeText` does, or reads what the clipboard holds of each format asked for, as `navigator.clipboard.read` does, each as text; where the browser reads no items, its `readText` serves `text/plain` alone

**Answers.** `writeToClipboard` answers how the browser took the request: `"written"`; `"refused"`, where it refuses without the user's activation, a permission or a focused document; `"unsupported"`, where it offers no asynchronous clipboard, as outside a secure context, which [`hasClipboard`](#state-window-hasclipboard) tells beforehand; and `"failed"` for any other error. `readFromClipboard` answers a `ClipboardContent { outcome, entries }`, its `outcome` `"read"` or one of the others, and its `entries` each a `ClipboardEntry { type, text }` of a format asked for that the clipboard holds, in the order asked, none where it read nothing

**Activation.** Writing needs a focused document, and the user's activation or the clipboard's permission, as the browser decides; reading needs the clipboard's read permission, or the user's leave, which some browsers ask for as the page reads. A browser test shows headless Chromium refusing both to a page given no permission

<a id="execution-window-download"></a>

### Window: download

**Syntax:** `download({ name, content, type })`   **Signature:** `name`, `content`: `String`; optional `type`: `String`, `"text/plain"` when omitted → none   **Mode:** Once   **Activation:** As the browser decides

**Does.** Has the browser download the content as a file of the name and the media type given, through an object URL of its own, which it revokes a minute after asking, once the browser has begun the download

**Answers.** Nothing: the browser says nothing of whether it downloaded the file. A browser may ask the user first, and may block downloads a page starts without the user's activation, or many of

<a id="execution-window-print"></a>

### Window: print

**Syntax:** `print()`   **Signature:** → none   **Mode:** Once   **Activation:** None

**Does.** Opens the browser's dialog for printing the page, as its `print()` does, which holds the page until the user closes it in most browsers

**Answers.** Nothing, once the browser's call returns

<a id="execution-window-requestshare"></a>

### Window: requestShare

**Syntax:** `requestShare({ title, text, url })`   **Signature:** optional `title`, `text`, `url`: `String?`, shared without it when omitted or null → `String`   **Mode:** Once   **Activation:** Transient activation

**Does.** Asks the browser to share what is given, as `navigator.share` does, with the user's choice of where

**Answers.** How the browser and the user took the request, once they settle it: `"shared"`; `"canceled"`, where the user dismissed it; `"refused"`, where the browser refuses it, as without the user's activation; `"invalid"`, where it can't share what is given, as nothing at all; `"unsupported"`, where it offers no Web Share API, which [`canShare`](#state-window-canshare) tells beforehand; and `"failed"` for any other error

<a id="execution-element-markindeterminate-clearindeterminate"></a>

<a id="execution-element-writeindeterminate"></a>

### Element: markIndeterminate, clearIndeterminate

**Syntax:** `markIndeterminate()`, `clearIndeterminate()`   **Signature:** → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Makes a checkbox show as mixed, or clears it, as its `indeterminate` property does in the page's code, which fires no event and leaves whether it is checked as it is: the DOM keeps the mixed state apart from `checked`

**Answers.** Whether it changed it, as [`indeterminate`](#state-element-indeterminate) reads it afterwards: false where it was so already, and for an element that is no checkbox, which it leaves as it is

<a id="execution-element-replacevalue"></a>

<a id="execution-element-writevalue"></a>

### Element: replaceValue

**Syntax:** `replaceValue(value)`   **Signature:** `value`: `String` → `String?`   **Mode:** Once   **Activation:** None

**Does.** Sets the value of an `input`, a `textarea` or a `select`, as its `value` property does in the page's code, which fires no event, so a watch of its [`value`](#property-element-value) misses it; a select's selects the option of that value, and none where none has it

**Answers.** The value it replaced, as `value` read it before; null for any other element, which it leaves as it is. A file input given any value but the empty string fails, as the browser refuses it

<a id="execution-element-select"></a>

<a id="execution-element-writeselection"></a>

### Element: select

**Syntax:** `select({ start, end })`   **Signature:** `start`, `end`: `Number` → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Places the selection as its [`selection`](#property-element-selection) reads it: a text input's or a text area's at those offsets, as `setSelectionRange` does, and, for an element whose content is editable, the document's selection at those offsets in its [`text`](#property-element-text); an offset past the end is held at the end, and a start after the end is moved to it. It moves no focus

**Answers.** Whether it placed the selection; false for an element whose selection the browser doesn't expose, as one that is neither a text control nor editable and an input of a type the selection API excludes, as `number`, which `selection` answers null for

<a id="execution-document-selection-placement"></a>

### Document selection: select, selectContents, collapse

**Syntax:** `select({ node })`, `selectContents({ node, collapse })`, `collapse({ node, offset })`   **Signature:** `node`: `Node`; `selectContents`: optional `collapse`: `String?`, `"start"` or `"end"`, the whole of the contents selected when omitted or null; `collapse`: optional `offset`: `Number`, 0 when omitted → `Boolean`   **Mode:** Once   **Activation:** None

**Does.** Places the document's selection, which [`Domql.document.selection`](#property-document-selection) reads and stands for, so a query writes `Domql.document.selection?.select({ node = image })`: around the node, as a range's `selectNode` does; around its contents, as `selectNodeContents` does, or collapsed to their start or their end; or collapsed at the point `offset` names within the node, a child's place within an element and a character's within text, as `collapse` does. It moves no focus, and fires the document's `selectionchange`

**Answers.** Whether the selection holds the place afterwards; false where the node lies outside the document, as one detached is, which the browser takes no selection of. An end other than these fails the execution, and so do an offset past the node's end and selecting a node with no parent, their cause the browser's refusal

<a id="execution-element-owned-writes"></a>

### Element: ownAttribute, ownClass, ownStyle, ownText

**Syntax:** `ownAttribute({ name, value, restore, keep })`, `ownClass({ name, present, restore, keep })`, `ownStyle({ property, value, restore, keep })`, `ownText({ value, restore, keep })`   **Signature:** `name`, `property`: `String`; `value`: `String?`, none where it is null; `present`: `Boolean`, true when omitted; optional `restore`: `Boolean`, true when omitted; optional `keep`: `Boolean`, false when omitted   **Mode:** Continuous   **Activation:** None

**Does.** Holds one **target** of the element at its value while it runs, an **owned write**: an attribute by its `name`, absent where `value` is null, as `hidden` and `tabindex` are attributes; a class of its class list by its `name`, there where `present` is true; a property of its inline style, as its `style` attribute declares it, declared none where `value` is null; or its **text**, the data of the one text node it holds, none where `value` is null. It writes the value as it starts and as an update gives another, and an update that binds another element, or names another target, ends its holding of the first and holds the other.

- **Holders.** Each owned write running on a target is one of its holders, among those DOMQL's instance runs: the latest to start applies its value, and ending it gives the target back to the one before it, which writes its value again; ending one that is not the latest writes nothing.
- **Ending the last.** Disposing the last holder of a target writes back the value the target held before the first began, where its `restore` is true, and leaves the value as it stands where it is false: a value the page keeps once it is written, as a document's `lang` and `dir`, and a position a gesture commits, are not restored.
- **A text** is written into the text node the element holds, in place, so a framework that rendered that node goes on holding it; an element that holds none gets one, which restoring takes away. An element holding any other node, an element or a second text among them, fails the start or the update, since its text would replace what it holds.
- **Another writer.** DOMQL writes to a target as a holding ends only where the target still holds the value DOMQL last wrote, so a value another writer wrote since, as a framework rendering the element, stands. Where the latest holder's `keep` is true, it writes its value again among the next animation frame's writes, before the watches of that frame read it, each time another writer changes it, as against a framework's patch rewriting an attribute; where it is false, the other writer's value stands until an update writes the holder's again. DOMQL never writes again against a holder of its own.

<a id="execution-element-owned-writes-yielding"></a>

- **Another holder.** A writer that writes its own value again in answer to DOMQL's, in the microtasks after it or among the writes of the two frames after it, keeps a value of its own, as a module's code holding the document's `lang` does: its answer restores the attribute or the text the target is part of as that writer left it before DOMQL wrote again. The holder yields to it rather than fight it: the other writer's value stands, and every writer's after it, until an update writes the holder's again and keeps it from then on.
- **A render is a patch, however soon it comes.** A framework writes an attribute or a text as its own render changes it, so each write is a value it hadn't written just before. A write within those frames that leaves the attribute or the text otherwise than that writer left it is a patch, as the first was, and the holder writes its value again, as [D83](../docs/decisions.md#d83) records.
- **A heuristic, beside an outside writer.** These two rules judge a writer DOMQL doesn't run by what it writes: a framework replaying the same class string and an independent writer defending that string make the same mutations, and the holder may take either for the other. Two of DOMQL's own holdings hand a target over exactly, through the holder stack, as [D94](../docs/decisions.md#d94) records.

<a id="execution-element-owned-writes-framework"></a>

**Beside a framework.** A target holds one value at a time, so each attribute, class, inline style property and text of an element a framework renders is either the framework's or an owned write's, never shared:

| The target is | Hold it with | So that |
| --- | --- | --- |
| Rendered by the framework, as part of a whole `class` or `style` attribute | `keep = true` | A patch that writes the whole attribute again, wiping the class or the property, is undone before paint, however soon one render follows another, and a writer is yielded to only where it writes its own value again in answer |
| Committed to the framework, as a position a gesture ends with | `restore = false`, ended once its host confirms that the framework's render of the committed value has reached the page, as by a command to the behavior after that render. The [acknowledgment](behaviors.md#behaviors-acknowledgment) of the occurrence reporting the commit says only that its handler applied it, which may be no more than asking for the render | The value stands as the holding ends, and the framework's render of the committed value takes the target over without a frame of the old one |
| A rendered node's text, as a count written as the reader types | `ownText` | The framework's own text node is written in place, so the nodes it holds stay the ones it rendered |

Module code holds a target the same way, through an owned write it runs with [`env.domql`](#extension-modules-environment), so its holdings and every other caller's take turns as holders do.

**Answers.** Nothing, as every continuous execution. A name that is no class, an attribute name the browser refuses, an element whose text would replace other nodes, and a failure to write, fail the start or the update, which leaves the execution holding what it held

<a id="execution-element-ownfilesource"></a>

### Element: ownFileSource

**Syntax:** `ownFileSource({ input, index, restore })`   **Signature:** `input`: `Element`; optional `index`: `Number`, 0 when omitted; optional `restore`: `Boolean`, true when omitted → none   **Mode:** Continuous   **Activation:** None

**Does.** Shows a file the user chose as the element's source, as an image's or a media element's: an [owned write](#execution-element-owned-writes) of its `src` attribute, held at an object URL of the file the file input holds at the index, among [`files`](#property-element-files), and absent where it holds none there. The URL is the execution's own: it makes one as a file is first shown, keeps it while an update shows the same file on the same element, and revokes it once the source no longer shows it, as an update showing another file and disposing do. It reads the input's files as it starts and as it is updated, so an update after the user chooses shows the new choice. Disposing writes back the source the element held before, as an owned write does, where `restore` is true

**Answers.** Nothing, as every continuous execution. An `input` that is no file input fails the start or the update

<a id="built-in-conversions"></a>

## Built-in conversions

A query converts with the four conversions [Nexo's own module](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/modules.md#vocabulary-conversions) declares between the language's types of data, which DOMQL's module, owning none of those types, declares none of; each rejects a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `String` | `Number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `Number` | `String` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `Boolean` | `String` | `"true"` or `"false"` |
| `String` | `Boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

<a id="observations"></a>

## Observations

A member names the [observations](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/observations.md#observations) that cover its changes, each by its type and its target, and DOMQL starts each one that a watch, a waiting evaluation or an event's object expression needs, and stops it once nothing needs it. DOMQL's module declares the browser's observations as eleven observation types, each animation frame as a twelfth, and the state a behavior offers as a thirteenth, which the members of any module and module code through its [environment](#extension-modules-environment) can name, and five observation targets.

<a id="observations-types"></a>

### Observation types

Each type is shared by equivalent requests, those of the same target and the same arguments of its identity in the same window, so two requests that differ in an argument that changes what is observed, such as an intersection's root or margin, never share.

| Type | Contract | Observes | Arguments | Identity |
| --- | --- | --- | --- | --- |
| `resize` | Invalidation | The size of an element's box, of a document's root element's, or of the window's layout viewport, a viewport scrollbar appearing or going included | `box`: the box `ResizeObserver` observes, `border-box` when omitted, or `client`, the border box and the content box both | `box` |
| `mutation` | Invalidation | A node's attributes, its children or its text, and its descendants' where `subtree` says so | `attributes`: `true`, or a list of attribute names; `childList`, `subtree` and `characterData`, Booleans, false when omitted; at least one of attributes, children and text is observed | All four |
| `attachment` | Invalidation | Whether a node is attached to its document, through every shadow root between them, a node another document owns inserted into the window's document included | None | None |
| `intersection` | Maintained | Whether the browser reports an element intersecting a root, or the window where the root is null, grown by a margin in CSS pixels; pending until its first report. It takes a new sample by observing the element again, which the browser reports after it lays out its next frame | `root`, an element or null, null when omitted; `margin`, a number, 0 when omitted | `root`, `margin` |
| `media` | Invalidation | Whether a media query matches | `query`, the media query | `query` |
| `pixelRatio` | Invalidation | The device pixel ratio | None | None |
| `event` | Invalidation | Events of the given types reaching the target, or reaching it in the capture phase | `types`, a list of event types; `capture`, a Boolean, false when omitted | `types`, `capture` |
| `focus` | Invalidation | The focus moving in a document, followed into every open shadow root it is within, since a move inside one root reaches no further than it, and the focused element removed, which moves the focus away, an event for which not every browser fires | None | None |
| `visibility` | Invalidation | Whether the document is visible | None | None |
| `navigation` | Invalidation | The window's URL: the Navigation API's current entry changing, which every navigation within the document and the history API change, or, in a browser without it, the window's `popstate` and `hashchange` | None | None |
| `frame` | Invalidation | Each animation frame of the window, at the start of its writes, while it is held, so what reads it is evaluated again in that frame's reads: **continuous measurement**, which follows what moves under no change another observation reports, as content moving under a still pointer | None | None |
| `behavior` | Invalidation | The [state a behavior offers](behaviors.md#behaviors-state) on a receiver: an instance of the behavior of that name starting there, updated, moving there or away, or ending, and its saying that what it offers may have changed | `behavior`, the behavior's name | `behavior` |
| `selector` | Invalidation | What a selector reads in a tree: its structure and the attributes the selector tests, a class for `.`, an id for `#`, each attribute an attribute selector names and what each pseudo-class reads, as `disabled` for `:disabled`, every attribute for a pseudo-class whose reads DOMQL doesn't know; focus moving, as the `focus` observation follows it, where it tests `:focus`, `:focus-within` or `:focus-visible`; and popovers opening and closing, where it tests `:popover-open` | `selector`, the selector | `selector` |

<a id="observations-targets"></a>

### Observation targets

An observation observes its member's receiver, an argument, `{ argument }`, or a target DOMQL's module declares, as Nexo's [observation targets](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/observations.md#observations-targets) set out:

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

A module extends the built-in vocabulary as Nexo's [modules](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/modules.md#modules) set out: it declares types of its own, each with its members and operators, states among them, and event types, executions and observation types, and adds members to DOMQL's types in its [extensions](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/extensions.md#extensions), each naming the one type it extends qualified, as `{ name: 'ChartElements', kind: 'extension', target: 'Domql.Element', members: [/* … */] }` adds members to elements. `domql.createModule(name, contents)` creates one from its declarations, each that runs code carrying its implementation as its `impl`, and `domql.registerModule(module)` registers it in the instance's registry, which holds DOMQL's module and every module registered with it. A request is resolved against the modules it imports, registered by then, so a module a query imports is registered beforehand, once, rather than for every evaluation.

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

- **A query imports it, and reads its extensions with `:`.** A query that uses a module's vocabulary imports the module, `import Charts`, as [its imports](queries.md#making-a-query-imports) set out, and reads a member an extension adds with `:`, never `.`: `panel:palette`, or `panel:ChartElements.palette` where two of its extensions declare one name, as Nexo's [extension access](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/extensions.md#extensions-access) sets out. DOMQL's own members stand within its types, so a query reads them with `.`.
- **DOMQL's members win on its types.** A name DOMQL's type declares is read with `.` as DOMQL's, and an extension's member of that name is read with `:` alone. Two modules' extensions declaring one name both register, and a query that reads the name where neither is more specific is refused where it does so (NEXO3024), naming the extensions to write.
- **States and work.** A module declares a state as a Boolean property, and a member that does work or takes an argument as a function, as [properties and functions](#vocabulary-properties-and-functions) set out; Nexo refuses neither form, so a module follows the rule itself.
- **What an implementation receives.** Every implementation receives the one object Nexo's [implementations](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/members.md#members-what-an-implementation-receives) receive, whose `env` is the [environment](#extension-modules-environment) of the operation that reaches it.
- **Arguments.** A host call's implementation receives its arguments as Nexo prepares them, by parameter name. A null argument whose parameter accepts null is passed as it stands, as a bound of null meaning the viewport, and one whose parameter propagates null skips the call, as [Nexo's null arguments](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/members.md#nullability-a-null-argument-follows-the-parameter) set out. An option of a structured type, written in place as an object expression, as `buttons = { container = viewport, step = 3 }`, is [constructed](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/types.md#types-constructing-a-structure) as that type's data, a field of a reference type holding the element it names, and reaches the implementation as a frozen structure.

<a id="extension-modules-kept-functions"></a>

- **Kept functions.** A host call's function argument, as a test of what a behavior hears, `when = it.matches(".pick")`, reaches its implementation as a function it keeps and calls later, a [kept function](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/host-calls.md#runtime-host-calls-kept-functions): each call reads the page as it is then, through the locals and the bindings the call was prepared with, as a query evaluated once reads, so a member it reads reads alone, and is checked against the parameter's contract. DOMQL ends the functions an execution keeps as the execution ends: a continuous execution's as its instance ends, and as an update gives its instance others, once the instance accepted them; a once execution's as its implementation's answer settles, a canceled one's among them; and an event source's as its subscription ends. A call of one afterwards fails with Nexo's NEXO5051, which the implementation receives as it does any failure of the call.
- **Reading.** A member's implementation is synchronous and reads alone, as Nexo requires of every vocabulary, so evaluating, watching and subscribing change nothing; a change to the page is an [execution](executions.md).
- **Event types.** A module adds event types of its own as keys of DOMQL's type selector `event`, each a mapping, `{ selector: 'event', key, type }`, naming the type its events are captured as, so `on` listens to them as it listens to the built-in ones.
- **Observations.** A member of any module names DOMQL's observation types and targets as DOMQL's own members do. DOMQL resolves the targets its own module declares alone, so a module declaring observation targets of its own is refused when it is registered, and an observation type a module declares, which owns no target, observes the receiver or an argument. An observation type a module declares is started by its implementation, which receives `request`, the observation's `type`, its `target` and its `arguments`, each argument the member names resolved to its value; `notify`, which it calls when what it observes may have changed; and `env`, [an observation's environment](#extension-modules-observation-environment). It answers an object whose `stop()` ends the observation and, for a maintained observation, whose `sample()` answers its latest sample, `{ pending, value }`. A maintained observation whose sample can lag behind the page, as one the browser reports after it lays a frame out, offers `resampleAsync()` too: it takes a new sample and answers a promise that settles once that sample has arrived, which a [refresh that resamples](watches.md#watching-resampling) waits for. One that offers none is read as it stands, its sample taken to be current whenever `sample()` answers it.

<a id="extension-modules-environment"></a>

### The environment

An operation gives every implementation it reaches one environment, its `env`, made as the operation starts and the same until it ends: a watch's every evaluation, a subscription's every event, and a continuous execution's start, its every update and the members its preparations read receive the same one, and another operation receives another. It is frozen, and holds:

| Member | What it is |
| --- | --- |
| `window` | The window the query runs against, `Domql.window` |
| `document` | Its document, `Domql.document` |
| `owner` | Who the operation is carried out for, as [the owner](behaviors.md#behaviors-the-owner) sets out |
| `domql` | The instance of DOMQL the operation belongs to, its `domql`, through which module code makes and carries out queries of its own; an operation it carries out runs in the global window unless its `window` option says otherwise, so module code passes `{ window: env.window }` |
| `observe(request, notify)` | Holds an observation through the window's own, those its watches share: `request` is `{ type, target, …arguments }`, by an [observation type](#observations-types) a registered module declares, and `notify` is called as the observation reports a change, as a watch's evaluation would be invalidated: a `mutation` at mutation delivery, in its microtask. It answers an object whose `stop()` lets the observation go, the last holder stopping it, and, for a maintained observation, whose `sample()` answers its latest sample. A request without a type or a target, or a `notify` that is no function, is refused with `DOMQL2010` |
| `frame(callback, options?)` | Runs `callback` once in the window's next animation frame, given the frame's time, in its `phase`: `"write"`, the default, before every read of that frame, or `"read"`, among the reads, the evaluations of the watches scheduled by frame among them, as [when a watch evaluates](watches.md#watching-when-a-watch-evaluates) sets out. A read a write asks for runs in that frame, and anything else a frame asks for in the next. It answers an object whose `cancel()` withdraws the callback. A callback that is no function, another phase, or a window without animation frames is refused with `DOMQL2011`; a callback's failure goes to the window's error reporting, and every other callback of the frame runs |
| `measureUnder(element, { class }, read)` | A **transient measurement**: adds the class, one token, to the element, answers what `read()` answers, and restores the element's class attribute as it was, whatever `read` does; DOMQL then drains every mutation observer of its own in the element's window of the records the class's change caused, so no watch, waiting evaluation or observation of DOMQL's evaluates again for it, and hands each the records of every other change in a microtask, as its own delivery would. An element holding the class already is read as it is. A resize or an intersection the class causes is restored before the browser reports one. What else observes the page, a framework's own observers among them, sees the class come and go. An element that is none, a class that is no one token, or a `read` that is no function is refused with `DOMQL2012`. `read` is synchronous and writes nothing: a class it adds is undone with the rest of the attribute, and a promise it answers is answered as it is, after the class is gone. A measurement nested inside one, of another class, restores the attribute as it found it, and a `read` that throws leaves it restored too, as [D98](../docs/decisions.md#d98) records |

**Reading alone.** A member's implementation reads alone, so while a query is evaluated, a host call prepared or a value projected, `observe`, `frame` and `measureUnder` of an operation's environment are refused with `DOMQL5021`, and so are `executeAsync` and `run` of any query object of the instance, which [executions](executions.md) set out; an evaluation, once or waiting, a watch and a subscription may still be started, since they change nothing. A behavior, a once execution and an event source run outside every evaluation, and use them all.

<a id="extension-modules-history-per-holder"></a>

**History per holder.** The environment is one per operation, so a member that reads captured values, keeping what it measured before as Nexo's [captured reading](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/members.md#how-a-member-reads) has its holder keep it, keys that history by its environment and its receiver, in a `WeakMap` of its own: each watch, wait and subscription keeps its own, from its start to its end, and lets it go with the operation, and an evaluation once, whose environment is its own, reports what it sees with none.

<a id="extension-modules-state-per-document"></a>

**State per document.** A module keeps what it holds for a page, as the stack of its scopes, by `env.document`, in a `WeakMap` of its own. A module's code is the same wherever it is registered, so that state is one for each document across every instance of DOMQL that registers that copy of the module's code, each instance with a registry of its own. Two copies of the code, bundled apart, are two modules with a map each, so a service the whole document shares, as one routing its input or coordinating its culture, is loaded once to coordinate, as [D99](../docs/decisions.md#d99) records. The module makes it as it first meets the document, keeps it while the document lives, and lets it go with the document; DOMQL holds none of it, so it never resets it. A module that must start before any request, as one following the document from its start, starts as its own code loads, given the document.

<a id="extension-modules-observation-environment"></a>

**An observation's environment.** An observation type's implementation receives an environment of its window's own, the same for every observation of that window: `window`, `document`, `domql`, `observe`, `frame` and `measureUnder`, and no owner, since one observation serves every holder. Its tools are never refused, since an observation starts as a query is evaluated: an observation type may observe through DOMQL's observations, schedule a frame, and measure under a class as it starts and as it samples, the one change watching makes, since it restores the element before it returns.

<a id="extension-modules-registering"></a>

### Registering a module while requests run

A query's imports decide what it resolves against, so a module registered later changes no resolution's meaning: a running watch, subscription or continuous execution keeps the resolution it has, and goes on evaluating and delivering, as Nexo keeps a resolution [current](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/resolution.md#runtime-reuse).

- **A module that recognizes values.** A module declaring a `typeOf` may recognize values a resolution captures, so it makes stale the resolutions that may meet such a value, as Nexo's [reusing a resolution](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/resolution.md#runtime-reuse) sets out: one whose host call supplies `DomEvent`, whose `target` is a nullable reference, among them. An operation started after it resolves its request again.
- **A running watch or a waiting evaluation made stale** resolves its request again at its next evaluation, which evaluates the whole query anew, as each of its evaluations does, so it goes on as before. A watch compares that evaluation's result as it compares any, within each value's tolerance: Nexo gives every resolution of one definition the same [origins](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/evaluation.md#runtime-results) where it selects the same declarations. Resolving again checks what starting the watch checked, and its refusal is that evaluation's failure.
- **A subscription or a once execution made stale** prepares its request again where a value its host call supplies is next projected: at the next event, or as the execution's result arrives. Where that preparation reaches the declaration it was carried out through, the value is projected through it, its locals and the object expression evaluated as that preparation finds them, and a subscription goes on listening with the receiver and the arguments its event source started with. Where it reaches none, or another, the subscription hands its handler the failure `DOMQL5015` and ends, and the once execution rejects with it, its effect standing. Where preparing it again fails, the subscription hands its handler that failure and ends, and the once execution rejects with it.

<a id="extension-modules-loading"></a>

### Loading a module on request

A query is resolved against the modules registered by then, and `run` starts its execution before it returns, so a module a query imports is registered before the query is carried out. A module the page loads only when a query first needs it is **loaded on request**: its caller registers a loader for it by its name, and loads what a query imports before carrying the query out.

```js
domql.registerModuleLoader("Charts", async () => (await import("./charts.js")).createChartsModule(domql));

const chart = domql.query("import Charts\npanel:palette", { panel });

await domql.loadModulesAsync(chart);
chart.evaluate();
```

- **`domql.registerModuleLoader(name, load)`** registers the loader of the module of that name: `load()` answers the module, as `domql.createModule` creates it, or a promise of it, and registers nothing itself. A name that is no module's name, as an empty one, a `load` that is no function, and a second loader for one name are refused with `DOMQL2013`.
- **`domql.loadModulesAsync(modules)`** loads every module named that the instance doesn't hold yet, each through its loader, and registers it, answering a promise that settles once each named is registered. `modules` names them as the imports of a query object, a definition or a text, or as a list of module names. Anything else is refused with `DOMQL2014`, and a query object of another instance as `domql.query` refuses it.
  - **Once for each module.** A load asked for while one of the same module is under way shares it, and a module the instance holds is not loaded again, so loading is safe to ask for before every query. A module another caller registered meanwhile, by the loader's own code or any other, is registered no second time.
  - **Failures,** each located at the module: a module neither registered nor given a loader rejects with `DOMQL4015`; a loader that throws or rejects, with `DOMQL5023`, its failure the `cause`; and one answering no module of its name, with `DOMQL4014`. A registration that fails rejects with its own error. Nothing is registered for a load that fails, and the next load asks the loader again.
- **A module that names another's types** is registered after it, so its loader loads that one first, `await domql.loadModulesAsync(["Gestures"])`, before answering its own.
- **Not loaded yet.** A request importing a module that has a loader, and is not registered yet, is refused as it is resolved with `DOMQL3007`, located at the import, rather than Nexo's refusal of a module it doesn't know. No operation loads a module itself: an execution would lose the order and the activation of the call that carries it out.

<a id="extension-modules-host-calls"></a>

### Host calls DOMQL carries out

A module declares an event source or an execution as a [host call](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/language/members.md#members-host-calls), a function with `invokedBy: 'host'`, within a type, within an extension, or among its module members, and gives DOMQL what Nexo leaves to its host: the `requestKind` the call makes, `subscription` for an event source or `execution`; an execution's `executionMode`, `once` or `continuous`; and the `impl` that carries it out. `domql.createModule` keeps these in DOMQL's own catalog, and gives Nexo the declaration without them, so Nexo resolves and prepares the call and DOMQL alone invokes it. One declaration standing within several types, as DOMQL's `on` does within `Element`, `Document` and `Window`, is kept for each.

| Host call | `requestKind` | `executionMode` | Its `result` | Its implementation receives | It answers |
| --- | --- | --- | --- | --- | --- |
| Event source | `subscription` | Refused | The type of each event it delivers, `@selected` where an event type selects it | `receiver`, `args`, `env` and `deliver`, which each event is handed to and which answers its [acknowledgment](behaviors.md#behaviors-acknowledgment) | An object whose `stop()` ends the listening |
| Event source of a behavior, declaring `behavior` | `subscription` | Refused | The type of each occurrence it delivers | Nothing: DOMQL carries it out, so it declares no `impl` and no parameters | — |
| Once execution | `execution` | `once` | The type of its result | `receiver`, `args`, `env` and `signal`, which aborts it | Its result, or a promise of it |
| Command, a once execution declaring `behavior` | `execution` | `once` | The type of its result | What a once execution receives, and `instance`, the running instance of its behavior | Its result, or a promise of it |
| Continuous execution | `execution` | `continuous` | None; one declared is refused | `receiver`, `args`, `env`, `reportError`, which a failure while it runs is reported through, `deliver(source, value)`, which hands an [occurrence](behaviors.md#behaviors-occurrences) to its module's event source of that name, and `notify()`, which says the [state it offers](behaviors.md#behaviors-state) may have changed | An object whose `update(receiver, args)` applies new arguments and whose `dispose()` ends it, started before it returns |

A [command](behaviors.md#behaviors-commands) and an [event source of occurrences](behaviors.md#behaviors-occurrences) declare the behavior they reach as their `behavior`, the name of a continuous execution their module declares, which DOMQL keeps beside their request kind and gives Nexo the declaration without; so does a member the evaluator invokes reading the [state a behavior offers](behaviors.md#behaviors-state), whose implementation receives the behavior's `instance`. A behavior itself names none.

`domql.createModule` refuses, with a module error naming the declaration, the type it stands within and the key, of the code [errors](errors.md#errors-module) give, a host call whose `requestKind` is missing or neither `subscription` nor `execution`; an execution whose `executionMode` is missing or neither `once` nor `continuous`; an event source given an `executionMode`, or declaring no result, since each event it delivers is the value its subscription projects; a member the evaluator invokes given either key, an unnamed indexer named `[]`, as Nexo names it; a continuous execution that declares a result; a `behavior` on a continuous execution, or naming no behavior by a name; one naming no continuous execution of its module; and an event source of a behavior declaring an `impl` or parameters. `domql.registerModule` refuses a module declaring a host call its catalog holds nothing of, as a module `domql.createModule` did not make. So an execution whose mode was left out is refused as an execution missing its mode.

On a receiver of unknown type, a host call has no declaration yet, so its [candidates](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/runtime/host-calls.md#runtime-host-calls), every declaration that takes the call as it is written, say what it does, as they say who invokes it. Where they disagree on what they request, the request is refused as ambiguous with a validation error, located at the call.
