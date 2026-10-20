# Nodes and shadow trees

<a id="nodes"></a>

## Nodes

A node is a value of the DOM tree. DOMQL's module declares the nodes as [reference types](https://github.com/FormaUI/Lexica/blob/main/spec/types.md#reference-types): `node`, abstract, and beneath it its kinds, `element`, `document`, `documentFragment`, a document fragment that is no shadow root, and `shadowRoot`, each recognized by its test, so a bound node is classified as the kind it is and never as `node` itself. `window` is a reference type of a hierarchy of its own, no node.

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
