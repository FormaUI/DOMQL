# DOMQL library guide

**A declarative approach to managing the DOM.**

DOMQL is a small, extensible query language and JavaScript library. Use it to read information from the document, track changes, respond to events and update its content or state. This guide takes you from your first query to watching results, handling events and extending the library.

DOMQL is a FormaUI product, developed alongside [Forma](https://github.com/FormaUI/Forma). It stands on its own and works independently of any UI framework.

> **Preview:** `formaui-net.DOMQL` is not yet published to NuGet. [Build the package locally](#install-and-load) to try it. The package distributes a JavaScript ES module; the API in this guide runs in JavaScript.

## Current capabilities

- Shape DOM and browser state into immutable snapshots.
- Filter and summarize collections; handle missing values and choose results with conditionals.
- Convert values explicitly, such as attribute text to numbers, with errors for text that does not convert, or test first whether it converts.
- Reuse queries with new bindings, or create them from JSON definitions.
- Validate query structure, names and types before evaluation.
- Evaluate once, wait for browser observations, or watch for changed results.
- Choose snapshots or live state updated in place, and select part of a result.
- Project events into data and cancel ongoing operations with an `AbortSignal`.
- Extend the vocabulary with typed members, observations, actions and behaviors.
- Use TypeScript declarations for the public API.

## In this guide

- [Install and load](#install-and-load)
- [Evaluate a query](#evaluate-a-query)
- [Reuse a query](#evaluate-again-or-bind-another-target)
- [Wait for a browser observation](#wait-for-a-browser-observation)
- [Watch a query](#watch-a-query)
- [Subscribe to events](#subscribe-to-events)
- [The language](#the-language)
- [API and errors](#api-and-errors)
- [Environments](#environments)
- [Extend the vocabulary](#extend-the-vocabulary)
- [Execute actions and apply behaviors](#execute-actions-and-apply-behaviors)

## Install and load

Build the repository with `./publish.ps1`. This writes the local NuGet package to `artifacts/`; see the [repository setup instructions](https://github.com/FormaUI/Forma.DOMQL#build-and-try-it) for prerequisites.

From your application's project directory, add the package using that folder as the source. Adjust the path to your local `artifacts/` directory:

```sh
dotnet add package formaui-net.DOMQL --prerelease --source ./artifacts
```

In a .NET web application hosted at the site root, import DOMQL from a JavaScript module:

```js
import { domql } from '/_content/domql/domql.js';
```

If your application uses a URL subpath, include it before `/_content/`. You can also serve the generated bundle directly in a non-.NET application.

### TypeScript

The package includes `domql.d.ts` beside `domql.js`, covering the query API, returned handles, errors and module declarations. Make those declarations available to your TypeScript project when importing the bundle by its path.

You can supply a result type when creating a query:

```ts
import { domql } from '/_content/domql/domql.js';

const panel = document.getElementById('panel');

if (panel === null) {
    throw new Error('The example needs an element with id="panel".');
}

const count = domql.query<number>('@panel.children.count', { panel }).evaluate();
```

## Evaluate a query

The examples use this panel. Run them after its elements exist, with the markup rendered without additional styling:

```html
<div id="panel">
    <div data-key="a1" data-unread="2" style="height: 48px"></div>
    <div data-key="a2" data-unread="5" style="height: 64px" aria-selected="true"></div>
    <div data-key="a3" style="height: 48px"></div>
</div>
```

Read its child count and the key and selection state of each item:

```js
const panel = document.getElementById('panel');

const query = domql.query(`
    @panel {
        count: self.children.count,
        items: self.all("[data-key]") {
            key: self:["data-key"],
            selected: self.aria:["selected"] == "true"
        }
    }
`, { panel });

const snapshot = query.evaluate();
```

The result is:

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

Three parts of the query are worth understanding first:

- `@panel` reads the binding supplied in `{ panel }`. It is not an ID lookup.
- An object expression chooses output fields. Here, the outer result has `count` and `items`.
- An object expression after a list runs for each item. Inside it, `self` refers to that item.

`domql.query` creates the query without reading the DOM. `evaluate()` resolves it as needed and reads the current values synchronously. The returned snapshot is immutable and contains no live element references.

## Evaluate again or bind another target

Call `evaluate()` again to read the current state. Earlier snapshots remain unchanged. DOMQL reuses parsed text and compatible resolutions, but reads DOM values again.

Use `with` to create a query with different bindings:

```js
const countQuery = domql.query('@panel.children.count', { panel });

countQuery.evaluate();
// 3

const emptyPanel = document.createElement('div');
const rebound = countQuery.with({ panel: emptyPanel });

rebound.evaluate();
// 0
```

`with` leaves the original query and its running watches unchanged.

### Reuse a definition

`query.definition` contains the immutable query structure without bindings. Pass it to `domql.query(definition, bindings)` to create another query, or store it as JSON for later use.

A query object belongs to the DOMQL instance that created it. If independently bundled libraries each contain DOMQL, pass the definition and a plain bindings object between them:

```js
const localQuery = domql.query(otherQuery.definition, { panel });
```

The receiving instance validates the definition against its own vocabulary. Modules registered only in the other instance are not available to it.

## Wait for a browser observation

Some values need an initial sample from a browser observer, such as whether an element is in view, which `intersects` reports. Count the items the viewport shows, as a lazy loader or an impression tracker needs, and wait for the browser's first report on each:

```js
const visibleItems = await domql.query(
    '@panel.all("[data-key]").where(self.intersects()).count',
    { panel }
).evaluateAsync();
// 3: every item of the example panel is in view
```

DOMQL starts one intersection observation for each item and waits until each has reported. Synchronous `evaluate()` rejects queries that require an observation sample.

`evaluateAsync()` also accepts ordinary queries. Pass `{ signal }` to cancel a pending evaluation. Observations started for the evaluation are released when it completes, fails or is canceled.

## Watch a query

Use `watch()` when you want updates as the result changes. It returns a handle that you subscribe to and later dispose.

Keep a toolbar in step with the panel's selection, whichever code selects an item:

```js
const selection = domql.query(`
    @panel.children
        .where(self.aria:["selected"] == "true") {
            key: self:["data-key"]
        }
`, { panel }).watch();

selection.subscribe('change', (sender, args) => {
    if (args.status === 'failed') {
        console.error('The query could not be evaluated.');
        return;
    }

    console.log(args.value.map(item => item.key));
});

await selection.refreshAsync();
// ['a2']

// For this example only: your app, a UI library or the user changes the page; DOMQL only observes it.
panel.children[0].setAttribute('aria-selected', 'true');
await selection.refreshAsync();
// ['a1', 'a2']

panel.children[0].removeAttribute('aria-selected');
await selection.refreshAsync();
// ['a2']

selection.dispose();
```

The query says what the toolbar needs, and the watch works out what to observe: the panel's children and the two attributes it reads of each, an item added included. It reads the attribute rather than `matches`, so every change it depends on is observed and the watch needs no option, as [observation limits](#observation-limits) explains. The listener receives an initial snapshot and then a new one when the result changes, never one equal to the last. Handlers receive `(sender, args)`, where `sender` is the watch handle.

A watch responds automatically to observed changes, normally at the next animation frame. The example calls `refreshAsync()` to make each step explicit: it evaluates immediately and resolves after listeners have received the result. Use `schedule: 'immediate'` to evaluate without waiting for the next frame: the first invalidation queues an evaluation in a microtask, and invalidations received before that evaluation begins share it, while resizes the browser reports one element at a time evaluate once for each, which the frame schedule batches.

Call `dispose()` when you no longer need updates. It stops the watch's listeners and releases its observations.

### Observation limits

A watch can only respond to changes reported by its members' observations. Some members have gaps: `matches` misses pointer state such as `:hover`, and `rect` can miss position changes that none of its observations detect.

Watching a partly observable member requires an explicit option:

```js
const itemWatch = query.watch({
    acceptPartialObservation: true
});
```

Without that option, DOMQL rejects the watch and identifies the members and changes it cannot fully observe. A missed change appears in the next evaluation, whether triggered by another observed change or by `refreshAsync()`. Dispose of `itemWatch` when you finish using it.

### Failures and selected results

A failed evaluation is delivered as a `change` event with `status: 'failed'`. A handler failure is reported through the watch's `error` event. Neither stops the watch. Inspect `watch.status`, `watch.snapshot` and `watch.error` for its current state.

For an object result, `watch.select('items')` creates a view of that field and shares the existing watch's evaluation. Use `query.select('items')` before starting an operation when you want that operation to return only the selected part.

### Live state

By default, each update is an immutable snapshot. Use `updateStrategy: 'liveState'` when you want one object updated in place.

Live state suits a view that patches what changed rather than rendering everything again. This example uses a list of its own and can be run independently:

```js
const list = document.createElement('ul');

list.innerHTML = '<li data-key="b1">Apples</li><li data-key="b2">Pears</li>';

const live = domql.query(`
    @list.children {
        key: self:["data-key"],
        selected: self.aria:["selected"] == "true"
    }
`, { list }).watch({ updateStrategy: 'liveState' });

live.subscribe('change', (sender, args) => {
    if (args.status === 'failed') {
        console.error('The query could not be evaluated.');
        return;
    }

    console.log(args.changes);
});

await live.refreshAsync();
// []

const pears = live.liveState[1];

// For this example only: your app, a UI library or the user changes the page; DOMQL only observes it.
list.children[1].setAttribute('aria-selected', 'true');
await live.refreshAsync();
// [{ op: 'replace', path: '/1/selected', value: true }]

console.log(live.liveState[1] === pears);
// true

live.dispose();
```

The first event is the baseline, with no changes. Selecting the pears changes one field, so the change set holds that one replacement, and the object for the pears is the same object, now selected.

The current object is available as `watch.liveState` and as `args.liveState` in change events. `args.changes` contains the applied change set. Objects and lists retain their identity; in a list projected from elements, an item's object follows the element when it moves.

Treat live state as read-only: the watch owns and updates it. Use snapshots or copy the data if you need to retain a previous version. Live state requires a non-null object or list result.

## Subscribe to events

An event subscription turns each event into a record of what happened and the state around it at that moment. Record which item a click activated, whether it was already selected, and how many items were selected then:

```js
const activations = domql.query(`
    @panel.on("click") {
        let item: self.target?.closest("[data-key]"),

        key: item?:["data-key"],
        wasSelected: item?.aria:["selected"] == "true",
        selectedCount: @panel.all("[aria-selected=true]").count
    }
`, { panel }).subscribe((sender, args) => {
    if (args.status === 'failed') {
        console.error('The event could not be projected.');
        return;
    }

    console.log(args.value);
});

// For this example only: the user clicks the second item; DOMQL only listens.
panel.querySelector('[data-key="a2"]').click();
// { key: 'a2', wasSelected: true, selectedCount: 1 }

activations.dispose();
```

Each record is plain data read as the event was dispatched, holding no event object and no element, so it can go straight into application state, a log or a message to a worker, and a handler that runs later still sees the state of that moment. The query is checked when you subscribe, so a misspelled member fails then rather than at the first click.

The object expression reads event fields such as `target`, `button` and `clientX`, and anything else the bindings reach. The subscription does not change the event's propagation or default behavior.

Listening starts during `subscribe()` and ends with `dispose()`. A failed projection reaches the handler with `status: 'failed'`; a handler failure goes to the window's error reporting. The subscription continues in either case.

Event projections do not wait for browser observations. A maintained value such as `intersects` is null until its first sample arrives.

## The language

Each code block in this section shows a separate query or JavaScript example. Examples that use `panel` refer to the original three-item markup above.

### Read properties and call members

Use a dot to read a property:

```domql
@panel.children.count
```

Members that take input use the form declared by the vocabulary. `all` is a call with parentheses; this query counts its matches:

```domql
@panel.all("[data-key]").count
```

`matches` is a call too, which tests an element against a selector, for a question only a selector asks, such as where the element stands among its siblings:

```domql
@button.matches(".toolbar > button:first-child")
```

A named indexer reads a value of its receiver by a key, written after a colon with the key in brackets. `attribute` reads an attribute, `style` a computed style, and `class` whether the element has a class; the window's `media` reads whether a media query matches, which a watch follows as it begins and ceases to:

```domql
@panel:attribute["data-key"]
@panel:style["display"]
@panel:class["open"]
@window:media["(min-width: 40em)"]
```

The key can be any expression of the type the indexer takes, such as a binding, `@panel:attribute[@name]`. An element's default indexer is `attribute`, so `@panel:["data-key"]` reads the attribute too, and a list's is `item`, so `@panel.children:[0]` is its first child. Use `?:` when the receiver can be null: `@panel.first(".row")?:["data-key"]` is null when there is no row, and its key is not evaluated.

All DOMQL names are case-sensitive and use names such as `clientSize`, `rectRelativeTo` and `devicePixelRatio`. Strings passed to browser APIs, including selectors and attribute names, follow the browser's rules.

Calls take one argument. When a member takes options, pass an object whose fields supply its parameters. This query checks for an intersection with a margin around the panel and needs `evaluateAsync()`:

```domql
@sentinel.intersects({ root: @panel, margin: 200 })
```

A call whose receiver can be null is written with `?.`, which skips the call, its argument included, and answers null where the receiver is null. This asks whether the nearest group is open, and is false where there is none:

```domql
self.closest("[data-group]")?.matches(".open") ?? false
```

Using the wrong call form produces an error that shows the expected form.

### Choose output fields

An object expression gives each result field a name:

```js
domql.query(`
    @panel {
        count: self.children.count,
        attached: self.attached,
        hasChildren: self.hasChildren
    }
`, { panel }).evaluate();
// { count: 3, attached: true, hasChildren: true }
```

Every output field needs an explicit name. Separate fields with commas; a trailing comma is allowed. Queries also support `//` line comments and `/* */` block comments.

Raw DOM nodes cannot appear in a result. For example, `@panel.children` reads a list of elements but cannot be returned by `evaluate()` as data. Project the properties you need instead.

### Project and filter lists

An object expression after a list runs for each item, with `self` referring to that item:

```js
domql.query(`
    @panel.all("[data-key]") {
        key: self:["data-key"],
        selected: self.aria:["selected"] == "true"
    }
`, { panel }).evaluate();
// [
//   { key: 'a1', selected: false },
//   { key: 'a2', selected: true },
//   { key: 'a3', selected: false }
// ]
```

A list keeps the order of its source, here the document's, and neither projecting nor filtering it reorders it.

A member after a list operates on the list itself. Use `count`, `first`, `last` and its default indexer, `:[index]`, as `self.children:[2]` for the third child, to inspect it. Use `where` to keep items whose expression is truthy:

```js
domql.query(`
    @panel.all("[data-key]")
        .where(self.aria:["selected"] == "true")
        .count
`, { panel }).evaluate();
// 1
```

### Summarize a collection

`max`, `min` and `sum` evaluate an expression for each item. This reads the tallest item's border-box height in CSS pixels:

```js
domql.query(
    '@panel.all("[data-key]").max(self.rect?.height)',
    { panel }
).evaluate();
// 64
```

Aggregates skip null expression results. If there are no numeric results, `max` and `min` return null; `sum` returns zero.

### Reuse a value with a local

Declare a local with `let` before the output fields, then refer to it by name:

```js
domql.query(`
    @panel {
        let items: self.all("[data-key]"),

        count: items.count,
        tallest: items.max(self.rect?.height)
    }
`, { panel }).evaluate();
// { count: 3, tallest: 64 }
```

Locals are not included in the result. A local is evaluated on first use, at most once for each value its object expression applies to. Unused locals are not evaluated.

`self` inside a local refers to the value where the local is declared. A bare name refers to a local; use `self.rect`, for example, to read a member of the current value.

### Handle missing values

Null means a value is missing or unavailable. Use `?.` to read through a value that may be null and `??` to supply a fallback:

```js
domql.query(
    '@panel.first("input")?.is("disabled") ?? false',
    { panel }
).evaluate();
// false: the example panel has no input.
```

If `first("input")` returns null, optional access skips the rest of that chain. `??` then supplies `false`. Accessing a nullable receiver with `.` is a validation error.

You can also make every access in a group optional:

```domql
(?@panel.first(".row").rect.height)
```

This is shorthand for `@panel?.first(".row")?.rect?.height`.

Geometry such as `rect` and `size` is null when an element is detached or has no layout box, including when it or an ancestor has `display: none`. A box with zero dimensions still returns zero dimensions.

A targeted object expression returns null when its receiver is null, as optional access does. For example:

```js
domql.query(
    '@panel.first(".missing")?:["data-key"]',
    { panel }
).evaluate();
// null
```

Null does not hide an invalid query. An unknown member or incompatible argument remains an error.

### Test a condition

An element's state that the user or the browser changes, such as whether it is checked, disabled or focused, is a condition. Test it with `.is`, which follows the browser's own rules, and the matching ARIA state with `.aria.is`:

```domql
@control { checked: self.is("checked"), ariaChecked: self.aria.is("checked") }
```

Ask a possession with `.has`, as `self.has("focus")`, and a capability with `.supports`, as `@window.supports("share")`. `.is("checked")` is true for a checked checkbox or radio button, or a selected option, as `:checked` matches. `.aria.is("checked")` is true only where `aria-checked` is `"true"`; read `self.aria:["checked"]`, the attribute's own text as `self:["aria-checked"]` reads it, or null where it is absent, to tell `"mixed"` from `"false"`. The two never stand in for each other, so write `self.is("checked") or self.aria.is("checked")` where either counts. Elements are asked `is("disabled")`, `is("readonly")`, `is("text-editable")`, `is("hover")`, `is("popover-open")`, `is("checked")`, `has("focus")` and `has("focus-within")`; the document `is("visible")` and `has("focus")`; and the window `supports("share")` and `supports("clipboard")`.

### Compare and combine conditions

Use `==` and `!=` to compare values. Nodes are compared by identity. The result is always a non-null Boolean, including when testing for null:

```domql
@panel.parent == null
```

Use `and`, `or` and `not` for Boolean logic:

```domql
@input.is("disabled") or (@input.is("readonly") and not @input.is("text-editable"))
```

`not` binds more tightly than `and`, which binds more tightly than `or`. Evaluation stops as soon as an operand determines the answer: the operands after it are still validated, but are not evaluated or observed and cannot fail at run time.

Only `null` and `false` are falsey; every other value is truthy, including `0`, `""` and an empty list. A condition, an operand of `and`, `or` or `not`, and the expression of `where` can be any value. `and` and `or` return the operand that decides them, so they also choose values:

```domql
@panel:["data-label"] or "untitled"
@panel { let input: self.first("input"), width: input and input.rect?.width }
```

In the second line, `input.rect` reads the input with a plain `.`, because the right side of `and` runs only when `input` is truthy. DOMQL narrows locals, `if let` names, parameters and `self` this way, but not members, which are read again wherever they are written.

`or` falls back for `null` and `false`, and `??` for `null` alone: `false or true` is `true`, and `false ?? true` is `false`.

Unlike Lua, DOMQL types every expression, so `and` and `or` must give values of one type. `self.is("disabled") and self` could give `false` or an element, and is refused; write `if self.is("disabled") then self else null` if `null` is an acceptable alternative. Use a conditional whenever the chosen value may itself be `false` or `null`.

Mixing `??` with `==`, `!=`, `not`, `and` or `or` requires parentheses around one of the expressions.

### Choose a result with a conditional

Use `if`, `then` and `else` to choose between values. Add `elseif` for another condition:

```domql
@input {
    state: if self.is("disabled") then "locked"
           elseif self.is("readonly") then "read"
           else "open"
}
```

Conditions are tested in order, and only the selected branch is evaluated; the others are still validated, but are not evaluated or observed and cannot fail at run time. Branches must have compatible types; the result is nullable if either branch can be null. Group a conditional when using it as a condition, an operand or the start of a member chain.

Use `if let` to name a value and choose by whether it is truthy. The name is available in the `then` branch alone, where it cannot be null:

```domql
if let row: @cell.closest(".row")
then { key: row:["data-key"], top: row.rect?.top }
else null
```

`if let` tests truthiness as `if` does, so `0`, empty text and an empty list take the `then` branch, and `false` takes `else`. It pairs with `try`: `if let count: try @panel:["data-count"] to "number" then … else …` converts once and uses the number in its branch.

### Cast a node

`parent` and `root` return nodes, which may be elements, documents, document fragments or shadow roots. Use `as` when a node must be of a specific kind, and `try … as` when it may be of another:

```domql
(@panel.parent as "element")?.rect?.width
(try @panel.parent as "element")?.rect?.width
```

The first fails with an error if the parent is not an element, such as a document or a shadow root, and the second returns null for it. Both return null for a missing parent, and the optional accesses account for that and for an element without a layout box.

### Convert a value

Attributes hold text. Use `to` to convert a value to another type, such as the unread counts the items carry:

```js
domql.query(
    '@panel.all("[data-key]").sum(self:["data-unread"] to "number" ?? 0)',
    { panel }
).evaluate();
// 7
```

`to` converts what comes before it, here the attribute. An item without the attribute gives null, which `?? 0` counts as zero. Text that is no number, such as `"5 new"`, fails the evaluation with an error rather than becoming null or zero.

To handle text that does not convert yourself, attempt the conversion with `try`, which answers null where the conversion rejects the value:

```domql
@panel { count: try self:["data-count"] to "number" ?? 0 }
```

A missing attribute and malformed text both give null, so `?? 0` supplies zero, and valid text converts to its number. A fault in a conversion, such as one that throws, is still an error.

A conversion never answers null for text it accepts, so where text is present, a null from `try` means the text was malformed. To keep the number and still tell missing text from malformed text, return a status beside the value:

```domql
@panel {
    let count: self:["data-count"],
    count: if let n: try count to "number" then { status: "valid", value: n }
    elseif count == null then { status: "missing", value: null }
    else { status: "malformed", value: null }
}
```

The attribute is read once into a local, so both checks see the same text.

The built-in conversions are from a string to a number or a Boolean, and from a number or a Boolean to a string. A string converts to a number when it is written as HTML writes a number, such as `"-12"`, `" 3.5 "` or `"1e3"`, and to a Boolean when it is exactly `"true"` or `"false"`. A value already of the type converts to itself.

`to` is not `as`: a cast narrows a node to one of its kinds and converts nothing.

### Cross a shadow boundary

Selectors do not enter shadow roots automatically. Access the open shadow root explicitly:

```domql
@host.shadow.root?.all("p").count
```

`shadow.root` is null when there is no open shadow root. `@element.root.host` accesses the host of the shadow tree containing an element. `@slot.shadow.elements` reads the elements a slot displays and returns null when the receiver is not a slot.

### Choose a property by name

Use brackets when the property name comes from a string:

```js
domql.query('@panel[@name].count', {
    panel,
    name: 'children'
}).evaluate();
// 3
```

DOMQL must be able to determine the possible property names during preparation and validate them against the receiver. This supports literals, bound parameters, locals and `if let` names holding supported name expressions, conditionals, `??`, `and` and `or`; it is not unrestricted lookup from an arbitrary runtime string. See the specification for the full rules.

### Bind values that are not there yet

Bindings can contain DOM elements or supported data. Bind a target as null when it is not available yet:

```js
const optional = domql.query(`
    {
        panel: @panel { size: self.size },
        ids: @ids
    }
`, { panel: null, ids: [] });

optional.evaluate();
// { panel: null, ids: [] }
```

A binding's type comes from its value. Null bindings and empty lists can leave a type unknown; applicable property checks are deferred until the type is known, while calls are still checked against the vocabulary. Use optional access when reading a member from a nullable binding.

Keep independent results in a top-level object, as above. If you instead write `@panel { size: self.size, ids: @ids }`, the entire result is null while `panel` is null.

## API and errors

| API | Purpose |
| --- | --- |
| `domql.query(text, bindings)` | Create a query from text. Also accepts a definition instead of text. |
| `query.definition` | Read the immutable definition, without bindings. |
| `query.with(bindings)` | Create a new query with the same definition and new bindings. |
| `query.resolve(options)` | Validate names and types without evaluating. |
| `query.select(...path)` | Select the part returned by `evaluate`, `evaluateAsync` or `watch`. |
| `query.evaluate(options)` | Read a snapshot synchronously. Accepts an optional `window`; rejects members that require observation samples. |
| `query.evaluateAsync(options)` | Read a snapshot, waiting for required observation samples. Accepts `signal` and `window`. |
| `query.watch(options)` | Start a watch. Options include `acceptPartialObservation`, `schedule`, `updateStrategy`, `signal` and `window`. |
| `query.subscribe(handler, options)` | Project events into data. Returns a listener with `status` and `dispose()`. |
| `query.executeAsync(options)` | Execute a module-defined action and return a promise of its projected result. |
| `query.apply(options)` | Activate a module-defined behavior. Returns a handle with `status`, `update(bindings)`, `subscribe('error', handler)` and `dispose()`. |
| `domql.format(source)` | Return canonical query text from text, a definition or a query object; no bindings or registered vocabulary are needed. |
| `domql.createModule(name, contents, functions)` | Create an extension module. |
| `domql.registerModule(module)` | Register a module for query resolution. |
| `domql.info` | Read the build's `version` and `specificationVersion`. |

A watch handle exposes `status`, `snapshot`, `error`, `readyAsync()`, `refreshAsync()`, `subscribe(eventName, handler)` and `dispose()`. Snapshot watches support `select(...path)`; live-state watches expose `liveState`. See [Watch a query](#watch-a-query) for examples.

### Choose the matching operation

DOMQL rejects operations that do not match the request before running them. The error identifies the request kind and its supported operations. For example, a read query is evaluated; an action is executed.

### Cancel an operation

Pass an `AbortSignal` in the options for `evaluateAsync`, `watch`, `subscribe`, `executeAsync` or `apply`. Aborting ends the operation and releases its resources. An already-aborted signal prevents the operation from starting. Cancellation does not undo changes made by an action.

### Validate without evaluating

`resolve()` checks names and types without reading the DOM and can run without a browser:

```js
const resolved = domql.query('@panel?.children.count', { panel: null }).resolve();

resolved.kind;            // 'query'
resolved.type.toString(); // 'number?'
```

### Handle errors

DOMQL reports failures as a `DomqlError` with `kind`, `message` and a structured `location`. The location identifies a text position, a definition node by JSON Pointer, or the relevant binding or declaration. Use these structured fields rather than matching message text.

| Kind | Failure |
| --- | --- |
| `syntax` | Invalid query text |
| `structure` | Invalid definition structure or binding |
| `validation` | Unknown members, incompatible types, invalid arguments or unsupported request usage |
| `module` | Invalid module declarations |
| `evaluation` | A failure while evaluating the query |

```js
try {
    domql.query('@panel:[200]', { panel }).evaluate();
} catch (error) {
    if (error?.name !== 'DomqlError') {
        throw error;
    }

    console.error(error.kind, error.message, error.location);
    // validation
    // The argument 'name' of 'attribute' expects string and finds number
    // (line 1, column 9, at /query/argument)
}
```

A misspelled member is an error; a selector with no match returns null. Raw elements are not valid snapshot data, so project the properties you want rather than returning the elements themselves.

## Environments

In a browser, DOMQL uses the default window and document. Queries can access them as `@window` and `@document`.

To use another supported DOM environment, pass its window to `query.evaluate({ window: suppliedWindow })`. `@window` and `@document` then refer to that environment.

Node.js can create and resolve queries without a DOM. Evaluation requires a supplied DOM environment; without one, it fails with an `evaluation` error. DOM emulators do not provide full browser layout behavior.

## Extend the vocabulary

Modules add capabilities to DOMQL without changing its syntax. Each module supplies declarations describing its types and members, plus JavaScript functions that implement them.

A member's DOMQL name does not have to match its implementation function's key. Functions used for synchronous query evaluation must be synchronous and read-only.

This example adds a `metrics` member to elements, exposing a child count:

```js
const metricsModule = domql.createModule('metrics', {
    types: [{
        name: 'childMetrics',
        fields: { childCount: 'number' }
    }],
    members: [{
        name: 'metrics',
        function: 'readMetrics',
        kind: 'property',
        on: 'element',
        parameters: [],
        result: 'childMetrics',
        changes: 'unobserved',
        reads: 'fresh'
    }]
}, {
    readMetrics: element => ({ childCount: element.children.length })
});

domql.registerModule(metricsModule);

domql.query('@panel.metrics { childCount: self.childCount }', { panel }).evaluate();
// { childCount: 3 }
```

`reads: 'fresh'` means evaluation reads the value at that time. The result can change, but this example provides no observation to report changes, so it declares `changes: 'unobserved'`. It supports evaluation without promising watch support.

Register modules once during setup, rather than on every evaluation.

Modules can also declare Boolean members, event types, conditions asked with `is`, `has` or `supports`, event sources, and conversions to and from their own types, each naming the type it converts from, the type it converts to and the function that converts a value. That function receives the value and `{ reject }`, and calls `reject(reason)` for a value it cannot convert, which stops it at once; any other exception it throws is reported as a fault. A condition names the function that tests it and its own observations. An event source receives the receiver, arguments, environment and an event-delivery callback. It returns an object with a `stop` method to end listening. Each event is captured using the fields declared by its event type.

The [runtime design](https://github.com/FormaUI/Forma.DOMQL/blob/main/docs/domql-design.md) describes the full extension contracts. The next section shows action and behavior modules.

## Execute actions and apply behaviors

### Execute an action once

Actions are module-defined operations that can change the page. `executeAsync()` evaluates the receiver and arguments, invokes the action, and returns a promise of its result. The action's implementation may also return a promise.

This example registers an action that sets a data attribute and reports whether the value changed:

```js
domql.registerModule(domql.createModule('mark', {
    members: [{
        name: 'mark',
        function: 'mark',
        kind: 'action',
        on: 'element',
        input: 'direct',
        parameters: [{ name: 'label', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
        result: 'boolean',
        changes: 'unobserved',
        reads: 'fresh'
    }]
}, {
    mark: (element, { label }) => {
        const changed = element.dataset.mark !== label;

        element.dataset.mark = label;

        return changed;
    }
}));

await domql.query('@panel.mark("reviewed")', { panel }).executeAsync();
// true
```

An object expression after an action can shape its result.

To cancel, pass `{ signal }` to `executeAsync()`. The promise rejects with the signal's reason, and the implementation receives the cancellation through its signal. Changes already made remain in place, including when an action fails.

### Apply a behavior

A behavior remains active until disposed. `apply()` activates it before returning a handle. Use that handle to update its bindings, subscribe to `error` events or dispose of it.

This example maintains a data attribute while the behavior is active:

```js
domql.registerModule(domql.createModule('highlight', {
    members: [{
        name: 'highlight',
        function: 'highlight',
        kind: 'behavior',
        on: 'element',
        input: 'direct',
        parameters: [{ name: 'color', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
        result: 'null',
        changes: 'unobserved',
        reads: 'fresh'
    }]
}, {
    highlight: (element, { color }) => {
        let current = element;

        current.dataset.highlight = color;

        return {
            update: (target, { color: next }) => {
                delete current.dataset.highlight;
                current = target;
                current.dataset.highlight = next;
            },
            dispose: () => delete current.dataset.highlight
        };
    }
}));

const highlight = domql.query('@panel.highlight(@color)', { panel, color: 'gold' }).apply();
console.log(panel.dataset.highlight);
// 'gold'

highlight.update({ panel, color: 'teal' });
console.log(panel.dataset.highlight);
// 'teal'

highlight.dispose();
console.log(panel.dataset.highlight);
// undefined
```

`update()` replaces the complete bindings object and validates it before applying a change. A validation failure leaves the current behavior running. Disposing the behavior ends that instance; its module remains registered.

## Learn more

- [Repository README](https://github.com/FormaUI/Forma.DOMQL): what DOMQL is for, what is built, and how to build and test it.
- [Language specification](https://github.com/FormaUI/Forma.DOMQL/blob/main/docs/domql-specification.md): syntax, types, null semantics and vocabulary contracts.
- [Runtime design](https://github.com/FormaUI/Forma.DOMQL/blob/main/docs/domql-design.md): resolution, evaluation, modules, watching, subscribing to events, actions and behaviors.

The specification and design describe the intended contracts. The [current capabilities](#current-capabilities) section lists what this preview implements.
