# Queries

<a id="queries"></a>

A **query** is a Lexica script that DOMQL carries out against a document. It names what it reads, as an element's size, the items of a list or whether focus is within a panel, and shapes what it reads as data. A caller makes a query object from the query's text or its definition, binds the query's parameters to elements of the document or to plain data, and carries it out: it evaluates the query once, keeps its result current, takes a result at each event the query subscribes to, or carries out the execution it asks for, once or running until it is disposed.

A query is read, checked and resolved by Lexica, against DOMQL's module and any module its caller registers, so DOMQL adds no syntax, and what a query can say is Lexica's to define. A query evaluates the same way for every caller, however it was written.

<a id="a-query-at-a-glance"></a>

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

In this document:

1. [What a query runs against](#what-a-query-runs-against)
2. [Making a query](#making-a-query)
3. [Resolution](#queries-resolution)
4. [Request kinds and their operations](#operations-and-request-kinds)
5. [Selecting a result](#selecting-a-result)

<a id="what-a-query-runs-against"></a>

## What a query runs against

A query is evaluated against a document, with each parameter it names bound to something in that document or to plain data. `panel` is not found by the query: it stands for the element the caller bound under the name `panel`, which is how a query reaches a particular element without a selector for it.

A query that names `panel` and `sentinel` is given those two elements, and fails to resolve when either is not bound. `domql.document` and `domql.window` need no binding, since they are always the document being queried and its window.

Conceptually, a caller supplies the query's text and the bindings, and gets back a result shaped like the query:

```text
result = evaluate(query, bindings: { panel: <the list panel>, sentinel: <the end marker> })
```

The bindings name only what the caller chooses. The complete query also reads `domql.window` and `domql.document`, which are absent from them because they are the document the query runs against and its window, which no caller chooses; a caller's binding named `window` or `document` is read by that name, as any other binding is.

A caller can take that result once, keep it current as the document changes, or take one at each event the query subscribes to, as [evaluation](evaluation.md), [watching](watching.md) and [events](events.md) set out. A value is evaluated or watched alike; subscribing needs an event source, whose projection uses the same expression language.

<a id="making-a-query"></a>

## Making a query

`domql.query` takes text or a definition, and each produces a definition with the same meaning, resolved, validated and evaluated alike. Making a query parses the text and checks its structure, and describes work: it reads nothing in the document, starts no observation and makes no call across an interop boundary, and evaluating, watching, subscribing, executing and applying belong to the caller that carries it out. A text is parsed once and its definition reused for identical text, whatever the bindings. A definition created directly serves tooling and integrations.

```js
// From text, binding its parameters by name.
const panelQuery = domql.query(`
    panel {
        size = it.size,
        hasFocus = it.has("focus-within")
    }
`, { panel });

// The same definition, bound to another panel; the text named the parameter `panel`.
const otherPanelQuery = panelQuery.with({ panel: otherPanel });

// From a definition, as tooling and integrations make one.
const fromDefinition = domql.query(panelQuery.definition, { panel });
```

<a id="making-a-query-bindings"></a>

### Binding its parameters

Each parameter is bound under the name the query uses, with a value Lexica's [script parameters and bindings](https://github.com/FormaUI/Lexica/blob/main/spec/scripts.md#scripts-script-parameters) allow, and a result is data, which a caller receives in its own language's form. `with` answers a new query whose bindings replace the old ones whole; the query it was called on, and every operation running from it, are unaffected. A query can be made without its bindings and bound afterwards, and a required binding that is missing fails before anything is carried out.

A binding declares no type: every value is typed from itself, a null, an empty list and a list holding nulls among them, so a query is made for an element that is not there yet as it is for one that is.

```js
const query = domql.query("{ panel = panel { size = it.size }, ids = ids }", { panel: null, ids: [] });

const another = query.with({ panel: otherPanel, ids: [1, 2] });
```

With the first bindings, the result is the following: an object expression following the null `panel` is null, and `ids` is the empty list.

```json
{ "panel": null, "ids": [] }
```

<a id="making-a-query-instances"></a>

### The instance a query belongs to

A query belongs to the instance of the library that made it, and an instance refuses another's query with an error that names how to reuse it. A page can hold several instances, as independently bundled libraries each carry their own, and a query passes between them as its definition and a plain object of bindings, which the receiving instance validates and resolves against its own vocabulary. The refusal decides ownership alone, and validation and resolution enforce the contracts a definition meets.

<a id="queries-resolution"></a>
<a id="preparation"></a>

## Resolution

A request is resolved before it is first carried out, and resolution validates it against the vocabulary registered then, as Lexica's [resolution](https://github.com/FormaUI/Lexica/blob/main/spec/runtime.md#runtime-bindings-and-resolution) sets out; a module a request names is registered by its caller beforehand. A misspelling or a wrong argument is an error before anything is evaluated; a member's fit to its receiver is checked once the receiver's type is specific enough, which a null receiver's is not; null is always a result.

`query.resolve(options?)` resolves a request without evaluating anything, and answers its kind and its type; it needs no browser. Its options `watch` and `acceptPartialObservation` resolve it as a watch would, so a watch's refusal of a partly observable member, as [accepting partial observation](watching.md#accepting-partial-observation) sets out, is found before a watch starts.

<a id="operations-and-request-kinds"></a>

## Request kinds and their operations

Evaluating, watching or subscribing to a request reads the document and changes nothing, whatever vocabulary it uses; an [execution](executions.md) explicitly requests effects, carried out only when its caller executes or runs it. The request's source decides its kind: a query gives a value, or ends in a [host call](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-host-calls), which DOMQL carries out as its declaration says, by subscribing to an event source, or by executing once or running continuously an execution of that mode. The one entry point serves every request kind, and resolution refuses an operation the kind does not take before anything is evaluated or started, with a validation error that says what the request does and names the operation it takes:

```text
Cannot execute 'panel.size': it produces a value.
Use evaluate(), evaluateAsync() or watch().
```

The object `domql.query` answers is a query object, whatever it holds, and what it describes is its request kind. An error a caller reads says what the request does, a value it produces, events it listens to, an effect it executes once or one it keeps running, rather than naming the kind.

| Request kind | Its query ends in | Its operations |
| --- | --- | --- |
| Value | A member the evaluator reads, or none | `evaluate`, `evaluateAsync`, `watch`, `select` |
| Subscription | An event source | `subscribe` |
| Once execution | An execution whose mode is `once` | `executeAsync` |
| Continuous execution | An execution whose mode is `continuous` | `run` |

<a id="selecting-a-result"></a>

## Selecting a result

`query.select(...path)` answers a selection, a part of the query's result. A selection belongs to the query, as its definition and bindings do, and every operation on it starts work of its own, where a selected view belongs to a running watch, as [sharing a watch](watching.md#sharing-a-watch) sets out. It offers `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)` and `watch(options?)`. A path holds the names of written fields and list indices that are not negative; a local is no field, so it is never part of a path.

```js
const width = panelQuery.select("size", "width"); // As panelQuery.select("size").select("width").

const currentWidth = await width.evaluateAsync();

rowsQuery.select(0, "height");
```

- **A path's shape is checked at once.** `select` refuses, without resolving anything, a path item that is neither a written field's name nor an index that is a whole number and not negative, as `-1` and `1.5` are not.
- **A path's fit is checked at resolution.** Whether a field exists, and whether an index applies to a list, is checked when an operation resolves the query, before anything is evaluated or observed; a selection of a query whose vocabulary is not yet registered is therefore made without failing.
- **What it gives.** A nullable ancestor and a list index out of range give null, and a list index follows a position, never a particular element.
- **The whole query.** A selection reads the whole query's result, so the whole query decides its dependencies, its failures and its readiness.
- **Its watch** delivers its first value, each change to that value, and its value again after a failed evaluation. It watches snapshots alone; a caller that wants live state of a smaller result writes that result in DOMQL.
