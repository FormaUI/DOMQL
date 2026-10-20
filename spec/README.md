# DOMQL Specification v1.0.0-alpha

DOMQL reads the DOM and shapes the result as data. Its queries are written in [Lexica](https://github.com/FormaUI/Lexica/blob/main/spec/README.md), whose specification defines the language: expressions, names, types, functions, requests, vocabulary contracts and definitions. This specification defines what DOMQL adds: the DOM's nodes and shadow trees, the built-in vocabulary, and how a query is evaluated and watched. It adds no language rule; a rule of the language is Lexica's, and this specification links to it.

This specification is the authoritative contract for DOMQL. It states what DOMQL is, not how far its implementation has come: [the status overview](../docs/status.md) says what this repository implements, and [the design](../docs/domql-design.md) how its runtime builds, prepares and carries out requests.

<a id="version"></a>

**Version.** This specification describes DOMQL on Lexica's [definition version 32](https://github.com/FormaUI/Lexica/blob/main/spec/README.md#version).

<a id="reading-this-specification"></a>

## Reading this specification

Start with [a query at a glance](#a-query-at-a-glance), and look up a built-in member in [the built-in vocabulary](vocabulary.md). Examples illustrate the rules, code containing `…` is a fragment, and examples explicitly described as errors are intentionally invalid.

## Documents

| Document | What it specifies |
| --- | --- |
| [Nodes and shadow trees](nodes-and-shadow-trees.md) | The DOM's node types, how kinds of node fit together, and every crossing of a shadow boundary |
| [Evaluation and watching](evaluation-and-watching.md) | How DOMQL's members read, how each changes and what a watch may follow, elements that leave the document, and what a query runs against |
| [Built-in vocabulary](vocabulary.md) | Every module member, property, function, predicate, conversion and event source DOMQL declares |
| [Examples](examples.md) | A complete query with its document and result, and queries by what they ask |

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

A query's result contains data. To return information about an element, project the fields you need rather than returning the element itself. See [a complete query](examples.md#a-complete-query) for an input document, a full query and its result.
