# DOMQL

> **Preview, not yet published to NuGet.** The package `formaui-net.DOMQL` is not on NuGet yet. Build it from the [repository](https://github.com/FormaUI/Forma.DOMQL#development) to try it, as [Install and load](#install-and-load) shows.

DOMQL is a small, extensible query language for reading DOM state as plain data. Describe what you need, and receive a snapshot shaped by your query.

DOMQL is a FormaUI product, developed alongside [Forma](https://github.com/FormaUI/Forma). It is both a language and a JavaScript library, and it stands on its own.

The `formaui-net.DOMQL` NuGet package supplies the JavaScript library as a single minified ES module at `_content/domql/domql.js`. It can be used by applications and libraries. The API documented here runs in JavaScript.

## Current capabilities

Available now:

- Make query objects from text or from JSON definitions, and carry every operation out through them.
- Validate structure, bindings, vocabulary names and types.
- Resolve queries without reading the DOM.
- Evaluate a query once, synchronously, and receive immutable data snapshots.
- Wait for values the browser keeps, such as `intersects`, with `evaluateAsync`.
- Watch a query and receive a snapshot each time its result changes, or one object kept current in place.
- Subscribe to events and receive the projection of each one.
- Execute actions once and apply behaviors that stay in effect until disposed.
- Extend the vocabulary through modules.

## Install and load

The package is not published to NuGet yet. Build it from the repository with `./publish.ps1`, which writes it to `artifacts/`, and add it from there:

```sh
dotnet add package formaui-net.DOMQL --prerelease --source ./artifacts
```

Once it is published, `dotnet add package formaui-net.DOMQL --prerelease` adds it from NuGet.

In a .NET web application hosted at the site root, import the static web asset from a JavaScript module:

```js
import { domql } from '/_content/domql/domql.js';
```

If the application is hosted under a subpath, include that base path in the URL. The bundle can also be served directly in a non-.NET application. For building a local package, see the [repository README](https://github.com/FormaUI/Forma.DOMQL#development).

## TypeScript

The package serves `domql.d.ts` beside `domql.js`, so a TypeScript project that imports the bundle by its path has the types of the whole API: `domql`, the query objects it makes and the handles they answer, the resolved definition, `DomqlError` and the module declarations.

```ts
import { domql } from '/_content/domql/domql.js';

const count = domql.query<number>('@panel.children.count', { panel }).evaluate();
```

## Evaluate a query

Given this markup, which the examples below use throughout:

```html
<div id="panel">
    <div data-key="a1" style="height: 48px"></div>
    <div data-key="a2" style="height: 64px" aria-selected="true"></div>
    <div data-key="a3" style="height: 48px"></div>
</div>
```

Run this after the elements exist:

```js
const panel = document.getElementById('panel');

const query = domql.query(`
    @panel {
        count: self.children.count,
        items: self.all("[data-key]") {
            key: self attributeOf "data-key",
            selected: self matches "[aria-selected=true]"
        }
    }
`, { panel });

const snapshot = query.evaluate();
// {
//   count: 3,
//   items: [
//     { key: 'a1', selected: false },
//     { key: 'a2', selected: true },
//     { key: 'a3', selected: false }
//   ]
// }
```

`@panel` refers to the supplied binding; it is not an ID lookup. `domql.query` makes the query object without reading the DOM, parsing a text once and reusing its definition for identical text. `evaluate` resolves it as needed and returns the current result synchronously. The snapshot is immutable and contains no live element references.

## Evaluate again or bind another target

Reuse a query for repeated evaluations. Resolution is cached when compatible; DOM values are read again, and earlier snapshots remain unchanged.

```js
const countQuery = domql.query('@panel.children.count', { panel });

countQuery.evaluate();
// 3

const emptyPanel = document.createElement('div');
const rebound = countQuery.with({ panel: emptyPanel });

rebound.evaluate();
// 0
```

`with` makes a new query of the same definition with new bindings, and leaves the original query, and every watch running from it, unchanged. `query.definition` is the query structure without bound values, and `domql.query(definition, bindings)` makes a query from it.

A query belongs to the DOMQL instance that created it. A page holds more than one instance when independently bundled libraries each include DOMQL, and an instance refuses another's query object with an error saying how to reuse it: pass its definition and a plain object of bindings to `domql.query`, as in `domql.query(otherQuery.definition, { panel })`. The receiving instance validates the definition and resolves it against its own vocabulary, so a member another instance registered is unknown to it.

## Wait for values the browser keeps

Some values come from a browser observation, such as whether an element intersects the viewport. `evaluate` refuses them, since their first sample cannot arrive during a synchronous evaluation; `evaluateAsync` waits for it:

```js
const inView = await domql.query('@panel intersects', { panel }).evaluateAsync();
// true
```

`evaluateAsync` takes a `signal` to cancel the wait, evaluates a query with no such value as well, and lets go of every observation it started when it answers, fails or is canceled.

## Watch a query

`watch` keeps a query's result current and answers its handle. A listener of its `change` event receives a snapshot, then a new one each time the result changes; each handler is called with the handle and the event's arguments. Here it watches the empty panel bound above:

```js
const watch = rebound.watch();

watch.subscribe('change', (sender, args) => console.log(args.value));

await watch.refreshAsync();
// 0

emptyPanel.append(document.createElement('div'));
await watch.refreshAsync();
// 1

watch.dispose();
```

A watch evaluates again on its own at the next animation frame after something it reads changes. `refreshAsync` evaluates now and settles once the snapshot has been handed to the listeners, which is how the example waits between its steps. `dispose` ends the watch, stops its listeners and lets go of its observations. A failed evaluation arrives as a `change` event whose `status` is `failed`, and a failing handler as an `error` event; the watch keeps running. `watch.select('size')` answers a view of a part of the result, which shares the watch's evaluation.

A watch can also keep its result as live state: one object it updates in place, which its `change` event carries every time as `liveState`, with the change set just applied to it as `changes`, and `watch.liveState` holds. Objects and lists inside it keep their identity, and an item of a list projected from elements keeps its object as it moves:

```js
const live = domql.query('{ count: @panel.children.count }', { panel: emptyPanel }).watch({
    updateStrategy: 'liveState'
});

live.subscribe('change', (sender, args) => console.log(args.liveState.count));

await live.refreshAsync();
// 1

emptyPanel.append(document.createElement('div'));
await live.refreshAsync();
// 2

live.dispose();
```

The object belongs to the watch, so read it and never write it, and copy it or watch snapshots where a version must be kept. Its result is an object or a list that is never null, since null has no identity to keep.

## Subscribe to events

`subscribe` evaluates the object expression that follows an event source, such as `eventsOf`, for each event, and hands its handler the event listener and the result:

```js
const clicks = domql.query(`
    (@panel eventsOf "click") {
        key: self.target?.closest("[data-key]") attributeOf "data-key"
    }
`, { panel }).subscribe((sender, args) => console.log(args.value.key));

panel.querySelector('[data-key="a2"]').click();
// 'a2'

clicks.dispose();
```

The object expression reads what the event carried, such as its `target`, `button` or `clientX`, and anything else a parameter reaches, at the moment the event is dispatched. The event listener it answers starts listening in the call, observes events as they reach the receiver and leaves their course to the page. A value the browser keeps, such as `intersects`, is null until the browser first reports it, and is never waited for. A failed projection reaches the handler with `status` `failed`, and a failing handler goes to the window's error reporting; the event listener keeps listening until `dispose` ends it.

## The language

### Chains, operations and names

Every member has its receiver written before it, and `self` is the current value, the one an object expression or an argument works on. A property is read with a dot, `@panel.children`; an operation is a call, with parentheses, `@panel.closest(".row")`, or a named operation, after a space, `@panel attributeOf "data-key"`, as the vocabulary declares each. Members are named in camelCase, such as `clientSize`, `attributeOf`, `computedStyleOf` and `matchesMedia`, and all DOMQL names are case-sensitive.

```js
domql.query('@panel.children.count', { panel }).evaluate();
// 3

domql.query('@panel.get("children.count")', { panel }).evaluate();
// 3

domql.query('@panel is "attached"', { panel }).evaluate();
// true
```

`get` reads a named member or chain of members. `is` asks about a state or classification and `has` about presence: they are operators that test the value before them against one predicate the vocabulary registers. `and` and `or` combine Boolean expressions:

```text
@input is "disabled" or @input is "readOnly"
@input is "disabled" or (@input is "readOnly" and @input is "textEditable")
@panel has "children" and @enabled
```

`is null` answers whether a value is null, never null itself. `and` binds tighter than `or`, parentheses group any expression, and evaluation stops at the first operand that decides the result. An operand that is null decides neither: `and` answers false where an operand is false, otherwise null where one is null, and true where none is; `or` answers true where an operand is true, otherwise null where one is null, and false where none is. Inside an object expression or an expression argument, `self` tests the current value, as `where(self is "disabled")` does. The strings that name members and predicates are case-sensitive too. Selectors, attribute names and other strings passed to browser APIs follow the browser's own rules.

A conditional chooses between two values, testing its conditions in order; false or null moves to the next clause, and only the branch it selects is evaluated:

```text
if @wide then @panel else @sidebar
@input { state: if self is "disabled" then "locked" elseif self is "readOnly" then "read" else "open" }
(if @wide then @panel else @sidebar).rect?.width
```

Its branches are of one type, nullable where either is, and a conditional that is a condition, an operand or the start of a chain is grouped.

A call or a named operation takes one argument. A named operation's argument is a literal, a parameter, `self`, a local, an object or a group, and an operation with several parameters takes them as the fields of one object:

```text
self.closest(".row")?.rect?.height
self attributeOf "data-key"
self attributeOf @attributeName
@sentinel intersects { root: @panel, margin: 200 }
(self.closest("[data-group]") attributeOf "data-group") is "set"
```

A named operation ends its chain, and a group continues from its result. Writing a member in a form it does not take is an error that gives the one it does, as `'attributeOf' is a named operation: write 'self attributeOf "data-key"'`. Commas separate the fields of an object expression.

### Objects and lists

An object expression chooses output fields, each written with the name it answers under, `width: self.rect?.width`; DOMQL infers no name, so a field without one is a syntax error.

```js
domql.query(`
    @panel {
        count: self.children.count,
        attached: self is "attached",
        children: self has "children",
    }
`, { panel }).evaluate();
// { count: 3, attached: true, children: true }
```

Trailing commas, `//` line comments and `/* */` block comments are supported.

An object expression following a list projects each item:

```js
domql.query(`
    @panel.all("[data-key]") {
        key: self attributeOf "data-key",
        selected: self matches "[aria-selected=true]"
    }
`, { panel }).evaluate();
// [
//   { key: 'a1', selected: false },
//   { key: 'a2', selected: true },
//   { key: 'a3', selected: false }
// ]
```

A member following a list operates on the list itself. Use `count`, `first`, `last` and `at(index)` to inspect it, or `where`, `max`, `min` and `sum` with expressions evaluated against each item:

```js
domql.query(`
    @panel.all("[data-key]")
        .where(self matches "[aria-selected=true]")
        .count
`, { panel }).evaluate();
// 1

domql.query('@panel.all("[data-key]").max(self.rect?.height)', { panel }).evaluate();
// 64
```

`where` keeps items whose expression is true. `rect?.height` is the height in CSS pixels of an element's border box, so the tallest item above is the 64px one. Aggregates skip null expression results. With no numeric results, `max` and `min` return null, while `sum` returns zero.

An object expression can name a value once with `let`, as a local, and use it by its name in the entries after it. Its locals come before its fields, and the result never holds them:

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

A local's `self` is the value where it is written, wherever it is used. It is evaluated at most once for each value its object expression applies to, at its first use, and not at all where nothing uses it. A bare name is always a local, so a member of the current value is written with `self`, as `self.rect`.

### Null and unavailable values

Null represents a missing or unavailable value; it does not hide an invalid query. A member of a value that can be null is read with `?.`, which answers null where the value is null and skips the rest of its chain, and `.` on such a value is an error before anything is evaluated. A named operation or a targeted object expression whose receiver is null returns null.

```js
domql.query(
    '@panel.first(".missing") attributeOf "data-key"',
    { panel }
).evaluate();
// null
```

Geometry such as `rect` and `size` is null when the element is detached or has no layout box, including when it or an ancestor has `display: none`. A measurable box with zero dimensions still returns those zero dimensions. Attachment and measurement availability are separate questions.

### Bind values that are not there yet

Bindings may contain elements or supported data, and each takes its type from its value, so an element that is not there yet is bound as null and an empty list as it is. A property of a null binding, or of the items of an empty list, answers null and is checked once the value's type is known; a call is still checked against the vocabulary.

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

Keep independent results in a top-level object expression when one target may be null. Writing `@panel { size: self.size, ids: @ids }` instead would make the entire result null while `panel` is null.

## API and errors

| API | Purpose |
| --- | --- |
| `domql.query(text, bindings)`, `domql.query(definition, bindings)` | Make a query object from text or from a reusable definition. |
| `query.definition` | Access the immutable definition without its bound values. |
| `query.with(bindings)` | Make a query of the same definition with other bindings. |
| `query.resolve(options)` | Check names and types without evaluating the query. |
| `query.select(...path)` | Select a part of the result, which `evaluate`, `evaluateAsync` and `watch` answer. |
| `query.evaluate(options)` | Evaluate once, optionally using an explicitly supplied `window`. A member kept by an observation, such as `intersects`, fails it. |
| `query.evaluateAsync(options)` | Evaluate once, waiting for the first sample of every member kept by an observation. Returns a promise; `signal` cancels it, and the `window` is optional. |
| `query.watch(options)` | Keep a query's result current. Returns a handle with `status`, `snapshot`, `error`, `readyAsync()`, `refreshAsync()`, `subscribe(eventName, handler)`, `dispose()`, and `select(...path)` for snapshots or `liveState` for live state, which `updateStrategy` chooses. |
| `query.subscribe(handler, options)` | Subscribe to an event source: the handler receives each projected result, evaluated as the event is dispatched. Returns an event listener with `status` and `dispose()`. |
| `query.executeAsync(options)` | Execute an action once. Returns a promise of its result, read through the object expression that follows the action; `signal` cancels it, and what the action changed stays changed. |
| `query.apply(options)` | Apply a behavior, in effect once the call returns. Returns a handle with `status`, `update(bindings)`, `subscribe('error', handler)` and `dispose()`. |
| `domql.format(source)` | Give the canonical text of a query's text, its definition or a query object, without bindings or a registered vocabulary. |
| `domql.createModule(name, contents, functions)` | Create an extension module. |
| `domql.registerModule(module)` | Make a module available to query resolution. |
| `domql.info` | Which build this is, `version`, the package's version, and which specification it follows, `specificationVersion`. |

An operation the request does not take is refused before anything runs, with an error saying what the request does and which operations it takes. A `signal` given to `evaluateAsync`, `watch`, `subscribe`, `executeAsync` or `apply` ends what the operation started when it aborts, and one already aborted starts nothing.

`resolve` checks a query without a browser and without reading anything:

```js
const resolved = domql.query('@panel?.children.count', { panel: null }).resolve();

resolved.kind;            // 'query'
resolved.type.toString(); // 'number?'
```

Failures report a `DomqlError` with a `kind`, `message` and structured `location`. Locations identify text positions, definition nodes by JSON Pointer, or the relevant binding or declaration. Use the structured fields rather than matching error-message text.

| Kind | Failure |
| --- | --- |
| `syntax` | Invalid query text |
| `structure` | Invalid definition structure or binding |
| `validation` | Unknown members, incompatible types, invalid arguments or unsupported request usage |
| `module` | Invalid module declarations |
| `evaluation` | A failure while evaluating the query |

```js
try {
    domql.query('@panel attributeOf 200', { panel }).evaluate();
} catch (error) {
    if (error?.name !== 'DomqlError') {
        throw error;
    }

    console.error(error.kind, error.message, error.location);
    // validation
    // The argument 'name' of 'attributeOf' expects string and finds number
    // (line 1, column 20, at /query/argument)
}
```

A misspelled operation is an error and a missing selector match is null. Raw elements are not valid result data: `@panel.children` fails because its result would hold elements, so project their properties with an object expression.

## Environments

In a browser, DOMQL uses the default window and its document. To evaluate against another supported DOM environment, pass its window to `query.evaluate({ window: suppliedWindow })`. Both `@window` and `@document` then refer to that environment. Node.js can make and resolve queries; evaluating requires a supplied DOM environment, and evaluating without one fails with an `evaluation` error. DOM emulators do not provide full browser layout behavior.

## Extend the vocabulary

A module contributes declarations as data and the functions that implement them. A member's DOMQL name and the key of its function are independent. Functions for synchronous evaluation must be synchronous and read-only.

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

The result can change, so it is not declared `constant`. This module names no observation and therefore declares `unobserved`: it supports evaluation, without promising watch support. Register a module once during setup, rather than before each evaluation.

Modules can also declare event types, predicates, supported feature names and event sources. A source's function takes the receiver, the arguments, the environment and the function it delivers each event to, and answers an object whose `stop` ends the listening; each event is captured as the fields its event type declares. An action or a behavior is a member a module declares, as the next section shows.

## Execute actions and apply behaviors

An action is an operation carried out once. `executeAsync` evaluates its receiver and arguments, calls its function, which may return a promise, and returns a promise of the result:

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

An object expression can follow an action to shape its result. Pass a `signal` to cancel the execution: the promise rejects with the signal's reason, and the action is told through the signal it receives. DOMQL never undoes what an action changed, including when it fails.

A behavior stays in effect until it is disposed. `apply` puts it into effect before it returns, and the handle it returns updates it with new bindings, raises the failures it reports while it runs as `error` events, or ends it:

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

`update` replaces the bindings whole and checks them before anything changes, so a failed update leaves the behavior running as it was. Disposing a behavior leaves its module registered.

## Learn more

- [Repository README](https://github.com/FormaUI/Forma.DOMQL): scope, build and test workflow, and the components to work in.
- [Language specification](https://github.com/FormaUI/Forma.DOMQL/blob/main/docs/domql-specification.md): syntax, types, null semantics and vocabulary contracts.
- [Runtime design](https://github.com/FormaUI/Forma.DOMQL/blob/main/docs/domql-design.md): resolution, evaluation, modules, watching, subscribing to events, actions and behaviors.

The specification and design cover the intended system. Refer to the current capabilities above for what this package implements today.
