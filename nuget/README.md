# DOMQL

> **Preview, not yet published to NuGet.** The package `formaui-net.DOMQL` is not on NuGet yet. Build it from the [repository](https://github.com/FormaUI/Forma.DOMQL#development) to try it, as [Install and load](#install-and-load) shows.

DOMQL is a small, extensible query language for reading DOM state as plain data. Describe what you need, and receive a snapshot shaped by your query.

DOMQL is a FormaUI product, developed alongside [Forma](https://github.com/FormaUI/Forma). It is both a language and a JavaScript library, and it stands on its own.

The `formaui-net.DOMQL` NuGet package supplies the JavaScript library as a single minified ES module at `_content/domql/domql.js`. It can be used by applications and libraries. The API documented here runs in JavaScript.

## Current capabilities

Available now:

- Parse query text, or create queries from JSON definitions.
- Validate structure, bindings, vocabulary names and types.
- Resolve queries without reading the DOM.
- Perform synchronous one-shot reads and receive immutable data snapshots.
- Wait for values the browser keeps, such as `intersects`, with `readAsync`.
- Watch a query and receive a snapshot each time its result changes, or one object kept current in place.
- Subscribe to events and receive the projection of each one.
- Run actions once and activate behaviors that stay in effect until disposed.
- Extend the vocabulary through modules.

## Install and load

The package is not published to NuGet yet. Build it from the repository with `./publish.ps1`, which writes it to `artifacts/`, and add it from there:

```sh
dotnet add package formaui-net.DOMQL --prerelease --source ./artifacts
```

Once it is published, `dotnet add package formaui-net.DOMQL --prerelease` adds it from NuGet.

In a .NET web application hosted at the site root, import the static web asset from a JavaScript module:

```js
import { Domql } from '/_content/domql/domql.js';
```

If the application is hosted under a subpath, include that base path in the URL. The bundle can also be served directly in a non-.NET application. For building a local package, see the [repository README](https://github.com/FormaUI/Forma.DOMQL#development).

## TypeScript

The package serves `domql.d.ts` beside `domql.js`, so a TypeScript project that imports the bundle by its path has the types of the whole API: `Domql`, the queries it makes, the resolved definition, `DomqlError` and the module declarations.

```ts
import { Domql } from '/_content/domql/domql.js';

const count = Domql.read<number>('@panel.children.count', { panel });
```

## Read a query

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

const query = Domql.parse(`
    @panel {
        count: self.children.count,
        items: self.all("[data-key]") {
            key: self attributeOf "data-key",
            selected: self matches "[aria-selected=true]"
        }
    }
`, { panel });

const snapshot = Domql.read(query);
// {
//   count: 3,
//   items: [
//     { key: 'a1', selected: false },
//     { key: 'a2', selected: true },
//     { key: 'a3', selected: false }
//   ]
// }
```

`@panel` refers to the supplied binding; it is not an ID lookup. `parse` constructs the query without reading the DOM. `read` resolves it as needed and returns the current result synchronously. The snapshot is immutable and contains no live element references.

For a query used once, `resolve`, `read`, `readAsync`, `watch` and `subscribe` also take its text and bindings directly, with any options or configuration after them: `Domql.read('@panel.children.count', { panel })`. The text is parsed the same way, through the same cache; parse a query yourself to reuse it. The bindings always come second, so a text without any passes `{}` before a configuration: `Domql.watch('@window.size', {}, { onChange: size => render(size) })`.

## Read again or bind another target

Reuse a query for repeated reads. Resolution is cached when compatible; DOM values are read again, and earlier snapshots remain unchanged.

```js
const countQuery = Domql.parse('@panel.children.count', { panel });

Domql.read(countQuery);
// 3

const emptyPanel = document.createElement('div');
const rebound = Domql.create(countQuery.definition, { panel: emptyPanel });

Domql.read(rebound);
// 0
```

The definition contains the query structure without bound values. `create` reuses it with new bindings and leaves the original query unchanged.

A query belongs to the DOMQL instance that created it. A page holds more than one instance when independently bundled libraries each include DOMQL, and an instance refuses another's query with an error saying how to reuse it: pass its definition and a plain object of bindings to `create`, as in `Domql.create(otherQuery.definition, { panel })`. The receiving instance validates the definition and resolves it against its own vocabulary, so a member another instance registered is unknown to it.

## Wait for values the browser keeps

Some values come from a browser observation, such as whether an element intersects the viewport. `read` refuses them, since their first sample cannot arrive during a synchronous read; `readAsync` waits for it:

```js
const inView = await Domql.readAsync('@panel intersects', { panel });
// true
```

`readAsync` takes a `signal` to cancel the wait, reads a query with no such value as well, and lets go of every observation it started when it answers, fails or is canceled.

## Watch a query

`watch` keeps a query's result current: `onChange` receives a snapshot, then a new one each time the result changes. Here it watches the empty panel bound above:

```js
const watch = Domql.watch(rebound, {
    onChange: count => console.log(count)
});

await watch.refreshAsync();
// 0

emptyPanel.append(document.createElement('div'));
await watch.refreshAsync();
// 1

watch.dispose();
```

A watch evaluates again on its own at the next animation frame after something it reads changes. `refreshAsync` evaluates now and settles once the snapshot has been handed to `onChange`, which is how the example waits between its steps. `dispose` ends the watch and lets go of its observations. Pass `onError` to hear of a failed evaluation or a failing callback; the watch keeps running.

A watch can also keep its result as live state: one object it updates in place, which `onChange` receives every time with the change set just applied to it, and `watch.liveState` holds. Objects and lists inside it keep their identity, and an item of a list projected from elements keeps its object as it moves:

```js
const live = Domql.watch('{ count: @panel.children.count }', { panel: emptyPanel }, {
    updateStrategy: 'liveState',
    onChange: state => console.log(state.count)
});

await live.refreshAsync();
// 1

emptyPanel.append(document.createElement('div'));
await live.refreshAsync();
// 2

live.dispose();
```

The object belongs to the watch, so read it and never write it, and copy it or watch snapshots where a version must be kept. Its result is an object or a list that is never null, since null has no identity to keep.

## Subscribe to events

`subscribe` evaluates the object expression that follows an event source, such as `eventsOf`, for each event, and hands `onEvent` the result:

```js
const clicks = Domql.subscribe(`
    (@panel eventsOf "click") {
        key: self.target.closest("[data-key]") attributeOf "data-key"
    }
`, { panel }, {
    onEvent: click => console.log(click.key)
});

panel.querySelector('[data-key="a2"]').click();
// 'a2'

clicks.dispose();
```

The object expression reads what the event carried, such as its `target`, `button` or `clientX`, and anything else a parameter reaches, at the moment the event is dispatched. The event listener it answers starts listening in the call, observes events as they reach the receiver and leaves their course to the page. A value the browser keeps, such as `intersects`, is null until the browser first reports it, and is never waited for. Pass `onError` to hear of a failed projection or a failing callback; the event listener keeps listening until `dispose` ends it.

## The language

### Chains, operations and names

Every member has its receiver written before it, and `self` is the current value, the one an object expression or an argument works on. A property is read with a dot, `@panel.children`; an operation is a call, with parentheses, `@panel.closest(".row")`, or a named operation, after a space, `@panel attributeOf "data-key"`, as the vocabulary declares each. Members are named in camelCase, such as `clientSize`, `attributeOf`, `computedStyleOf` and `matchesMedia`, and all DOMQL names are case-sensitive.

```js
Domql.read('@panel.children.count', { panel });
// 3

Domql.read('@panel.get("children.count")', { panel });
// 3

Domql.read('@panel is "attached"', { panel });
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
(if @wide then @panel else @sidebar).rect.width
```

Its branches are of one type, nullable where either is, and a conditional that is a condition, an operand or the start of a chain is grouped.

A call or a named operation takes one argument. A named operation's argument is a literal, a parameter, `self`, a local, an object or a group, and an operation with several parameters takes them as the fields of one object:

```text
self.closest(".row").rect.height
self attributeOf "data-key"
self attributeOf @attributeName
@sentinel intersects { root: @panel, margin: 200 }
(self.closest("[data-group]") attributeOf "data-group") is "set"
```

A named operation ends its chain, and a group continues from its result. Writing a member in a form it does not take is an error that gives the one it does, as `'attributeOf' is a named operation: write 'self attributeOf "data-key"'`. Commas separate the fields of an object expression.

### Objects and lists

An object expression chooses output fields, each written with the name it answers under, `width: self.rect.width`; DOMQL infers no name, so a field without one is a syntax error.

```js
Domql.read(`
    @panel {
        count: self.children.count,
        attached: self is "attached",
        children: self has "children",
    }
`, { panel });
// { count: 3, attached: true, children: true }
```

Trailing commas, `//` line comments and `/* */` block comments are supported.

An object expression following a list projects each item:

```js
Domql.read(`
    @panel.all("[data-key]") {
        key: self attributeOf "data-key",
        selected: self matches "[aria-selected=true]"
    }
`, { panel });
// [
//   { key: 'a1', selected: false },
//   { key: 'a2', selected: true },
//   { key: 'a3', selected: false }
// ]
```

A member following a list operates on the list itself. Use `count`, `first`, `last` and `at(index)` to inspect it, or `where`, `max`, `min` and `sum` with expressions evaluated against each item:

```js
Domql.read(`
    @panel.all("[data-key]")
        .where(self matches "[aria-selected=true]")
        .count
`, { panel });
// 1

Domql.read('@panel.all("[data-key]").max(self.rect.height)', { panel });
// 64
```

`where` keeps items whose expression is true. `rect.height` is the height in CSS pixels of an element's border box, so the tallest item above is the 64px one. Aggregates skip null expression results. With no numeric results, `max` and `min` return null, while `sum` returns zero.

An object expression can name a value once with `let`, as a local, and use it by its name in the entries after it. Its locals come before its fields, and the result never holds them:

```js
Domql.read(`
    @panel {
        let items: self.all("[data-key]"),
        count: items.count,
        tallest: items.max(self.rect.height)
    }
`, { panel });
// { count: 3, tallest: 64 }
```

A local's `self` is the value where it is written, wherever it is used. It is evaluated at most once for each value its object expression applies to, at its first use, and not at all where nothing uses it. A bare name is always a local, so a member of the current value is written with `self`, as `self.rect`.

### Null and unavailable values

Null represents a missing or unavailable value; it does not hide an invalid query. A chain or targeted object expression whose receiver is null returns null.

```js
Domql.read(
    '@panel.first(".missing") attributeOf "data-key"',
    { panel }
);
// null
```

Geometry such as `rect` and `size` is null when the element is detached or has no layout box, including when it or an ancestor has `display: none`. A measurable box with zero dimensions still returns those zero dimensions. Attachment and measurement availability are separate questions.

### Bind values that are not there yet

Bindings may contain elements or supported data, and each takes its type from its value, so an element that is not there yet is bound as null and an empty list as it is. A property of a null binding, or of the items of an empty list, answers null and is checked once the value's type is known; a call is still checked against the vocabulary.

```js
const optional = Domql.parse(`
    {
        panel: @panel { size: self.size },
        ids: @ids
    }
`, { panel: null, ids: [] });

Domql.read(optional);
// { panel: null, ids: [] }
```

Keep independent results in a top-level object expression when one target may be null. Writing `@panel { size: self.size, ids: @ids }` instead would make the entire result null while `panel` is null.

## API and errors

| API | Purpose |
| --- | --- |
| `Domql.parse(text, bindings)` | Construct a query from text. |
| `Domql.create(definition, bindings)` | Construct a query from a reusable definition. |
| `query.definition` | Access the immutable definition without its bound values. |
| `Domql.resolve(text, bindings, options)`, `Domql.resolve(query, options)` | Check names and types without evaluating the query. |
| `Domql.read(text, bindings, options)`, `Domql.read(query, options)` | Read once, optionally using an explicitly supplied `window`. A member kept by an observation, such as `intersects`, fails it. |
| `Domql.readAsync(text, bindings, options)`, `Domql.readAsync(query, options)` | Read once, waiting for the first sample of every member kept by an observation. Returns a promise; `signal` cancels it, and the `window` is optional. |
| `Domql.createModule(name, contents, functions)` | Create an extension module. |
| `Domql.watch(text, bindings, configuration)`, `Domql.watch(query, configuration)` | Keep a query's result current: `onChange` receives a snapshot, then each snapshot that differs; `updateStrategy` chooses live state instead. Returns a handle with `status`, `lastSnapshot`, `liveState`, `refreshAsync()` and `dispose()`. |
| `Domql.subscribe(text, bindings, configuration)`, `Domql.subscribe(query, configuration)` | Subscribe to an event source: `onEvent` receives each projected result, evaluated as the event is dispatched. Returns an event listener with `status` and `dispose()`. |
| `Domql.runAsync(text, bindings, options)`, `Domql.runAsync(query, options)` | Run an action once. Returns a promise of its result, read through the object expression that follows the action; `signal` cancels it, and what the action changed stays changed. |
| `Domql.activate(text, bindings, options)`, `Domql.activate(query, options)` | Activate a behavior, in effect once the call returns. Returns a handle with `status`, `update(bindings)` and `dispose()`. |
| `Domql.registerModule(module)` | Make a module available to query resolution. |

`resolve` checks a query without a browser and without reading anything:

```js
const resolved = Domql.resolve('@panel.children.count', { panel: null });

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
| `evaluation` | A failure while reading the query |

```js
try {
    Domql.read('@panel attributeOf 200', { panel });
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

In a browser, DOMQL uses the default window and its document. To read against another supported DOM environment, pass its window to `Domql.read(query, { window: suppliedWindow })`. Both `@window` and `@document` then refer to that environment. Node.js can run parsing and resolution; document reads require a supplied DOM environment, and reading without one fails with an `evaluation` error. DOM emulators do not provide full browser layout behavior.

## Extend the vocabulary

A module contributes declarations as data and the functions that implement them. A member's DOMQL name and the key of its function are independent. Functions for synchronous reads must be synchronous and read-only.

This example adds a `metrics` member to elements, exposing a child count:

```js
const metricsModule = Domql.createModule('metrics', {
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

Domql.registerModule(metricsModule);

Domql.read('@panel.metrics { childCount: self.childCount }', { panel });
// { childCount: 3 }
```

The result can change, so it is not declared `constant`. This module names no observation and therefore declares `unobserved`: it supports reads, without promising watch support. Register a module once during setup, rather than before each read.

Modules can also declare event types, predicates, supported feature names and event sources. A source's function takes the receiver, the arguments, the environment and the function it delivers each event to, and answers an object whose `stop` ends the listening; each event is captured as the fields its event type declares. An action or a behavior is a member a module declares, as the next section shows.

## Run actions and activate behaviors

An action is an operation carried out once. `runAsync` evaluates its receiver and arguments, calls its function, which may return a promise, and returns a promise of the result:

```js
Domql.registerModule(Domql.createModule('mark', {
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

await Domql.runAsync('@panel.mark("reviewed")', { panel });
// true
```

An object expression can follow an action to shape its result. Pass a `signal` to cancel the run: the promise rejects with the signal's reason, and the action is told through the signal it receives. DOMQL never undoes what an action changed, including when it fails.

A behavior stays in effect until it is disposed. `activate` puts it into effect before it returns, and the handle it returns updates it with new bindings or ends it:

```js
Domql.registerModule(Domql.createModule('highlight', {
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

const highlight = Domql.activate('@panel.highlight(@color)', { panel, color: 'gold' });
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
