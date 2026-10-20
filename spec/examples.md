# Examples

<a id="examples-and-usage"></a>

These examples show the vocabulary and its host together: one complete query with the document it reads and the result it answers, and short queries by the question each asks.

In this document:

1. [A complete query](#a-complete-query)
2. [Queries by what they ask](#examples)

<a id="a-complete-query"></a>

## A complete query

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

## Queries by what they ask

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
