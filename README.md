# DOMQL

**A declarative approach to managing the DOM.**

DOMQL is a small, extensible query language and JavaScript library. Use it to read information from the document, track changes, respond to events and update its content or state.

DOMQL is a FormaUI product, developed alongside [Forma](https://github.com/FormaUI/Forma). It stands on its own and works independently of any UI framework.

> **Preview:** DOMQL is not yet published to npm or NuGet. You can [build and try it locally](#build-and-try-it).

## Features

- **Choose your result shape.** Read attributes, dimensions, element state and browser state into named fields.
- **Work with collections.** Project items, filter them, count them and calculate summaries.
- **Keep results current.** Watch for changes and receive immutable snapshots or an object updated in place.
- **Handle missing values.** Use optional access, fallbacks and conditionals directly in your query. Only `null` and `false` are falsey, and `and` and `or` return the operand that decides them, so `panel:["data-label"] or "untitled"` gives a label or a default.
- **Name the steps.** Write a query as locals and the `return` that gives its result, as `let width = panel.rect?.width ?? 0` and then `return width / 2`, or a `do … end` block wherever a value stands; every conditional ends with `end`. An argument holds a simple expression, so a block or a conditional of locals is bound to a local first, as `let adjusted = do … end` and then `calculate(adjusted)`.
- **Reuse a calculation.** Declare a function as a local and call it by name, as `let measure = function(box) box.rect?.width ?? 0 end` and then `measure(panel)`; each call is checked against its own arguments.
- **Calculate and compare.** Derive values with `+`, `-`, `*`, `/` and `%`, as `(context.clientSize?.width ?? 0) - 24`, and test them with `<`, `<=`, `>` and `>=`, chained for a range, as `0 < width <= 600`. Both take numbers alone, so a value that can be missing takes a fallback first, and division by zero is an error, never infinity.
- **Build text.** Insert values into text with an interpolated string, as `$"{context.children.count} items"`, which takes strings and numbers alone, so a missing value takes a fallback first, as `{name ?? "Unknown"}`.
- **Write any character.** Strings take `\n`, `\t`, `\e` and the other common escapes, and `\u{…}` names any character by its code point, as `"\u{200B}"` writes a zero-width space you could not see otherwise.
- **Convert values explicitly.** Read attribute text as a number or a Boolean with `to`, or attempt it with `try … to "number"`, which answers null for text that does not convert; with `to` alone, such text is an error, never a silent default. Casts work the same way: `as` fails for a node of another kind, and `try … as` answers null.
- **Reuse queries.** Evaluate again, bind different targets, or store and exchange definitions as JSON. A binding is read by its name, or as `~name` where a local or a field shares that name or a reserved word names it.
- **Read the evaluation context.** `context` is the value an expression is evaluated against, the element an object expression follows or each item of a list, and `~` alone is the same, as `panel { width = ~.rect?.width }` reads the panel's width.
- **Name anything.** Fields, locals, functions and members take any name, `end`, `to` and `null` among them, as `{ end = selection.end }` does; written alone such a word keeps its meaning, so a local or a field it names is read as `@end`. A field's name is read by the fields after it, as `{ count = rows.count, label = $"{count} rows" }` does.
- **Read the object being built.** Inside an object expression, `root` refers to the outermost object being built, so a nested object reads its fields, as `outermost` is 4 in `{ bar = 4, inner = { bar = 2, outermost = root.bar } }`. Only fields whose initializers have completed are available, and `root` itself is never part of a result.
- **Catch invalid requests early.** DOMQL checks bindings, member names, arguments and types before evaluation.
- **Read events as data.** Subscribe to an event source and choose the fields each event delivers.
- **Extend the vocabulary.** Add typed members, observations, actions and behaviors through modules.
- **Use JavaScript or TypeScript.** The library ships as one minified ES module with type declarations.

## Your first query

Suppose a panel contains three items:

```html
<div id="panel">
    <div data-key="a1"></div>
    <div data-key="a2" aria-selected="true"></div>
    <div data-key="a3"></div>
</div>
```

This query reads the item count and each item's key and selection state:

```js
import { domql } from './src/domql.js';

const panel = document.getElementById('panel');

const query = domql.query(`
    panel {
        count = context.children.count,
        items = context.all("[data-key]") {
            key = context:["data-key"],
            selected = context.aria:["selected"] == "true"
        }
    }
`, { panel });

const snapshot = query.evaluate();
```

The result is plain data:

```json
{
    "count": 3,
    "items": [
        { "key": "a1", "selected": false },
        { "key": "a2", "selected": true },
        { "key": "a3", "selected": false }
    ]
}
```

`panel` is the element you supplied in `{ panel }`. Inside each object expression, `context` refers to the current element. The field names you write become the field names in the result; after a list, the object expression runs for each item.

Snapshots are immutable and contain no live DOM references. You can retain a snapshot, serialize it or pass it to another part of your application.

The source import above works when serving the repository. For the packaged bundle, see [Install and load](nuget/README.md#install-and-load).

## Read again or watch for changes

Creating a query does not read the DOM. Evaluate the same query whenever you need a new snapshot:

```js
// For this example only: your app, a UI library or the user changes the page; DOMQL only reads it.
panel.children[0].setAttribute('aria-selected', 'true');

const next = query.evaluate();

console.log(next.items[0].selected);     // true
console.log(snapshot.items[0].selected); // false
```

Earlier snapshots keep their values. You can also reuse the definition with another element through `query.with({ panel: anotherPanel })`.

To receive updates automatically, start a watch:

```js
const watch = query.watch({
    acceptPartialObservation: true
});

watch.subscribe('change', (sender, args) => {
    if (args.status === 'failed') {
        console.error('The query could not be evaluated.');
        return;
    }

    console.log(args.value);
});
```

The listener receives the initial snapshot and then a new snapshot when the result changes. By default, DOMQL combines observed changes into one evaluation at the next animation frame. Unchanged results are not delivered again.

Some DOM members cannot report every change. For example, `matches` cannot track pointer state such as `:hover`. A watch using partly observable members requires `acceptPartialObservation: true`; without it, DOMQL reports which members have gaps and what they miss.

Refresh explicitly when your application knows about a change the watch cannot detect, and dispose of the watch when you no longer need it:

```js
await watch.refreshAsync();
watch.dispose();
```

The [watch guide](nuget/README.md#watch-a-query) covers observation limits, live state, scheduling and errors.

## Filter and summarize

Build on the same panel to count selected items:

```js
const selectedCount = domql.query(`
    panel.all("[data-key]")
        .where(context.aria:["selected"] == "true")
        .count
`, { panel }).evaluate();
```

`where` evaluates its expression for each item. Collections also support `first`, `last`, indexing by position as `:[2]`, `min`, `max` and `sum`. Locals let you reuse a value within a query, while conditionals and null handling let you choose what the result should contain.

See [The language](nuget/README.md#the-language) for focused examples of each feature, including casts, conversions, shadow trees and access by property name.

## Choose how to use a request

| You want to… | Use |
| --- | --- |
| Read the current state once | `query.evaluate()` |
| Wait for a browser observation, such as an intersection sample | `query.evaluateAsync()` |
| Keep a result current | `query.watch()` |
| Project each event into data | `query.subscribe(handler)` |
| Run an action supplied by a module | `query.executeAsync()` |
| Apply a behavior until it is disposed | `query.apply()` |

Queries are read-only. Actions and behaviors are separate requests supplied by extension modules. Async evaluation, watches, event subscriptions, actions and behaviors accept an `AbortSignal` for cancellation.

## How DOMQL differs from jQuery

With jQuery, your JavaScript selects elements, reads values and assembles a result. With DOMQL, a query describes the values and their result shape, and the runtime validates and evaluates it.

| | jQuery | DOMQL |
| --- | --- | --- |
| Main abstraction | Element collections with methods | Typed requests |
| Reading data | JavaScript assembles the result | A query describes the result |
| Keeping data current | Application code repeats its reads | A watch tracks declared observations |
| Events | Handlers work with events | Subscriptions project events into data |
| Changing the page | DOM manipulation methods | Module-defined actions and behaviors |
| Extension | Plugins | Typed vocabulary modules |

DOMQL is useful when you want a reusable description of DOM state, especially when several values need to stay current together. You can use it alongside ordinary JavaScript and other DOM libraries.

## Extend the vocabulary

Modules add typed members and their implementations without changing the query syntax. Use them to expose application state or additional browser capabilities. Modules can also declare how their values are observed and provide event sources, actions and behaviors.

See [Extend the vocabulary](nuget/README.md#extend-the-vocabulary) for a complete example.

## Status

The features listed above are implemented in the current preview. Editor tooling and C# integration are planned; the NuGet package currently distributes the JavaScript library.

The [implementation plan](docs/domql-implementation-plan.md) tracks remaining work and open decisions.

## Build and try it

Clone the repository. You'll need Node.js with npm, PowerShell and the .NET SDK pinned in `nuget/global.json`. See [CONTRIBUTING.md](CONTRIBUTING.md#set-up) for setup details.

From the repository root, run the build and checks:

```powershell
./build.ps1
```

Include the real-browser tests with:

```powershell
./build.ps1 -Browser
```

Build a local NuGet package with:

```powershell
./publish.ps1
```

The package is written to `artifacts/`. It supplies the JavaScript bundle at `_content/domql/domql.js`, with TypeScript declarations alongside it. The [library guide](nuget/README.md#install-and-load) explains how to load it.

## Documentation

- [Library guide](nuget/README.md) — install DOMQL, learn the language and use the API.
- [Language specification](docs/domql-specification.md) — precise syntax, types and vocabulary contracts.
- [Runtime design](docs/domql-design.md) — runtime architecture and public API contracts.
- [Implementation plan](docs/domql-implementation-plan.md) — remaining work and open decisions.
- [Contributing](CONTRIBUTING.md) — report a bug, develop a change and run the checks.
- [Security](SECURITY.md) — report a vulnerability privately.

## License

[Apache-2.0](LICENSE).
