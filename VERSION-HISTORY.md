# Version history

Each version of DOMQL, newest first, with the features it added and what it changed. A version names DOMQL's contract, its [specification](spec/README.md): the DOM's vocabulary, the module that declares it, and DOMQL as the host that carries queries out. The language is Nexo's, called Lexica before `1.0.0-alpha.278`, so each entry also names the language version and definition format it describes.

- **A version collects the changes made between two releases.** The first change to DOMQL's contract after a [release](CHANGELOG.md) opens the next version's entry, which reads *Unreleased*, and each later change joins it. The release that first implements the version dates it, and fixes it.
- **Versions before `1.0.0-beta.2` advanced with each change,** before DOMQL's first release, each dated by the day the specification first described it.
- **A change stands in the first version whose implementation follows it.**
- **From `1.0.0-beta.1` on, an entry leads with examples** of what its version changed: a query's in a `domql` block, a caller's or a module's in a `js` block, each line's comment saying what it does at that version and what it did before. The list below them is the reference. A version the specification describes ahead of the implementation says so, and says which of its changes the implementation has already.

Each entry says what its version breaks:

- **Before the beta,** a version could break what the one before it allowed, with no guidance on migrating.
- **From `1.0.0-beta.1` on,** no breaking redesign is planned. A version that breaks what the one before it allowed says, beside each break, how a query, a caller or a module migrates.

<a id="v1-0-0-beta-2"></a>

## `1.0.0-beta.2`

*Unreleased · Nexo language `1.0.0-beta.41` · definition format 38*

```domql
input.disabled                                             // a state, a Boolean property; input.disabled() before, NEXO3017 now
panel.all("input").where(it.checked).count                 // a state filtered with a body; where(Domql.checked) before, NEXO3076 now
panel.hovered and Domql.document.focused                   // panel.hover() and Domql.document.focus() before
Domql.window.canShare or Domql.window.hasClipboard         // Domql.window.share() or Domql.window.clipboard() before
(panel.rect?.width ?? 0).round()                           // Nexo's rounding, a function; .round before, NEXO3017 now
panel { state = it.attached and "here" or "away" }         // a String; NEXO3040 before
panel { state = it.attached and "here" }                   // NEXO3040, false or a String, as before
Domql.["window"].size                                      // Domql.window.size; NEXO1000 before
1.e3                                                       // NEXO3001, now saying to write 1e3
```

```js
await domql.query('field.focus()', { field }).executeAsync();                        // moves focus to the field; field.takeFocus() before
await domql.query('audio.mute()', { audio }).executeAsync();                         // audio.writeMuted(true) before; unmute() is writeMuted(false)
await domql.query('box.markIndeterminate()', { box }).executeAsync();                // box.writeIndeterminate(true) before; clearIndeterminate() is writeIndeterminate(false)
await domql.query('field.replaceValue("")', { field }).executeAsync();               // field.writeValue("") before
await domql.query('field.select({ start = 0, end = 4 })', { field }).executeAsync(); // field.writeSelection({ … }) before
domql.query('Domql.window.writeToClipboard(event.text)');                            // writeClipboard before; readFromClipboard() is readClipboard()
```

```js
const query = domql.query('{ counts = ["a" = 1, "b" = 2] }');

query.select('counts', 'entries', 1, 'value').evaluate();  // 2; NEXO3602 before
query.select('counts', 'b').evaluate();                    // NEXO3602: a dictionary holds its entries
domql.query('import Routes\nRoutes.first(routes)', { routes }, { types: { routes: 'List<Routes.Route>' } });  // routes captured as routes; NEXO3042 before
domql.format('-(-1)');                                     // '1'; '-(-1)' before
```

```js
domql.query('frame.ownClass({ name = "dragging", keep = true })', { frame }).run();

frame.className = 'window active';          // a render: DOMQL writes dragging again in the next frame
frame.className = 'window active focused';  // a render a frame later: 'window active focused dragging'; dragging dropped before
```

```js
const updates = { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] };

{ name: 'level', kind: 'property', result: 'Number', updates }   // NEXO4071 from createModule; accepted before
{ name: 'level', kind: 'property', result: 'Number?', updates }  // accepted: a query reads (panel:level ?? 0) > 20
{ name: 'lit', kind: 'property', result: 'Boolean', updates }    // a state, read as panel:lit; a function before, called as panel:lit()
typeOf: value => undefined                                        // NEXO5002 as a binding asks it; answer null
```

DOMQL moves to Nexo's language `1.0.0-beta.41`, by way of `1.0.0-beta.40`, as [D76](docs/decisions.md#d76) and [D87](docs/decisions.md#d87) record, and follows its rule that a property names what its receiver is, has or is in, and a function does work: DOMQL's states are properties, as D87 records, and its executions are named by their verbs, as [D88](docs/decisions.md#d88) records. Nexo's [language history](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/LANGUAGE-HISTORY.md#v1-0-0-beta-41) sets out its own changes by version; those below are the ones a query, a caller and a module meet.

**Vocabulary**

- [States](spec/vocabulary.md#states) are Boolean properties, read without a call, as Nexo's [states and tests](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/language/vocabulary.md#vocabulary-boolean-functions) set out: an element's `disabled`, `readonly`, `textEditable`, `focusWithin`, `displayed`, `focusable`, `popoverOpen`, `checked`, `indeterminate` and `autofilled`, the document's `visible`, and the ARIA view's `checked` and `disabled`, each a function before.
- Five states take new names as they become properties: an element's `hover` and `focus` are `hovered` and `focused`, the document's `focus` is `focused`, and the window's `share` and `clipboard` are `canShare` and `hasClipboard`.
- A state is read through its module as before, `Domql.checked(it)`, and filtered by with a body, `rows.where(it.checked)`; a reference to one, `rows.where(Domql.checked)`, is refused (NEXO3076), since only a function has one.

**Queries**

- Nexo's own members that make a value of their receiver are functions: a number's `round()`, `floor()`, `ceiling()`, `truncate()` and `abs()`, a text's `trim()`, `lowercase()` and `uppercase()`, and a list's `reverse()`, `distinct()` and `flatten()`, each a property before.
- A letter right after a number makes one invalid token, NEXO1000, so `1else` is refused, where it read as `1` and `else`.
- [`and` and `or`](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/language/expressions.md#logical-expressions-negations-and-groups-type) share a type only where their value is used: `it.attached and "here" or "away"` is a `String`, where it was refused.
- A conversion of a value of `Any` converts by the type the value turns out to be, failing with NEXO5053 where nothing converts it, where it was refused at resolution.
- A computed name through a namespace reads as it does after `@`: `Domql.["window"]` is `Domql.window`.
- [A query declares its bindings' types](spec/queries.md#making-a-query-declared-types), `domql.query(text, bindings, { types })`, capturing data as a module's structured type, a map as a dictionary, where every binding was typed from its value.
- A query nesting deeper than 256 levels is refused, NEXO1072, a chain of more than 256 terms, NEXO2046, and a string holding a surrogate standing alone, NEXO1049.
- Diagnostics say what to write: `1.e3`, `value to List<Number>` and `element as Element?` among them.

**Executions**

- [Built-in executions](spec/vocabulary.md#built-in-executions) are named by the verb they carry out: `focus()`, `writeToClipboard(text)`, `readFromClipboard({ types })`, `replaceValue(value)` and `select({ start, end })`, which were `takeFocus`, `writeClipboard`, `readClipboard`, `writeValue` and `writeSelection`.
- Writing a state one way or the other is two executions, each taking nothing: `mute()` and `unmute()`, which were `writeMuted(true)` and `writeMuted(false)`, and `markIndeterminate()` and `clearIndeterminate()`, which were `writeIndeterminate(true)` and `writeIndeterminate(false)`. Each answers whether it changed the element, as before.
- [A render is a patch, however soon it comes](spec/vocabulary.md#execution-element-owned-writes-yielding): a holder that keeps its value yields only to a writer that restores its own value in answer. A framework rendering an element again within the two frames after DOMQL wrote a kept value again, each render a value of its own, is written against as its first render was, where the holder yielded to it and lost the class or the property, as [D83](docs/decisions.md#d83) records.

**Watches**

- [What an evaluation gives](spec/watches.md#watching-what-an-evaluation-gives): a watch's result is the one a full evaluation of its query would give, and how much of the query it evaluates again is DOMQL's, where it promised to evaluate the whole query each time. It still does; the promise no longer holds a later release to it, as [D86](docs/decisions.md#d86) records.

**Results**

- [A selection](spec/queries.md#selecting-a-result) steps into a dictionary's `entries` and a pair's `key` and `value`, the form [a result holds them](spec/results.md#results-collections) in, where a path into either was refused.
- `domql.format` writes a negated number literal as the number, `-(-1)` as `1`, and a call's arguments after a block's `end` on lines of their own.
- Data a result holds nesting deeper than 1,000 levels is refused, NEXO5052, and a `sum` or a `sequence` no finite number holds, NEXO5020.

**Modules**

- [A member reading maintained values](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/runtime/members.md) declares a result that can be null, NEXO4071, since it reads as null until its first sample arrives.
- A module's `typeOf` answering nothing is a fault, NEXO5002.
- A fixed parameter is required and takes no default, NEXO4072, and an observation takes no expression or predicate parameter, NEXO4055.
- A module error names a declaration only by a name that is a string.
- A module declares a state as a Boolean property, and a test that does work as a function, as [properties and functions](spec/vocabulary.md#vocabulary-properties-and-functions) set out; Nexo refuses neither form.
- A member given a structure from a value of `Any` receives the structure's declared properties alone, where it received the value as it was.

**Breaking:**

- A state called is refused, NEXO3017, which writes the property to read: write `input.disabled` for `input.disabled()`. `Domql.checked(it)` reads as it did.
- A state passed by reference is refused, NEXO3076. Filter with a body, `rows.where(it.checked)`, for `rows.where(Domql.checked)`.
- A state or an execution named as before is refused, NEXO3001. Write:
  - `hovered` for `hover()`, `focused` for the document's `focus()`, `canShare` for `share()` and `hasClipboard` for `clipboard()`;
  - `focus()` for `takeFocus()`, `writeToClipboard` for `writeClipboard`, `readFromClipboard` for `readClipboard`, `replaceValue` for `writeValue` and `select` for `writeSelection`;
  - `mute()` for `writeMuted(true)` and `unmute()` for `writeMuted(false)`, and `markIndeterminate()` for `writeIndeterminate(true)` and `clearIndeterminate()` for `writeIndeterminate(false)`. A caller that chose the Boolean as it ran chooses the query instead.
- An element's `focus()` is the execution that moves focus, where it read whether the element had it. A query that reads it as a value is refused, as a host call is wherever a value is read: `evaluate` refuses `panel.focus()`, DOMQL3004, and `panel.focus() and ready` is refused, NEXO3048. Read `panel.focused`.
- Nexo's members that make a value of their receiver are called. Write `x.round()`, `name.trim()` and `items.reverse()`, which NEXO3017 gives where the property is read.
- A module that declared a state as a function declares it as a property, `kind: 'property'` with no `parameters`, and a query reads it without the call, filtering by it with a body.
- A number a letter follows with no space is refused. Write a space between them, `1 else`.
- A module whose member read a property its structured parameter doesn't declare, from a value of `Any`, declares it in the structure, or declares the parameter `Any` and reads the value as it is.
- A module declaring a member that reads maintained values with a result that can't be null is refused. Declare it nullable, `Number?`, and give a query's reads of it a fallback, `(panel:level ?? 0) > 20`.
- A `typeOf` answering `undefined` is a fault, NEXO5002. Answer `null` for a value of none of the module's types.
- A module declaring a fixed parameter optional or with a default is refused. Make it required; neither form ever let a query leave the argument out.
- `value and x`, where `value` is of `Any`, is of `Any`. Give it a fallback, or test it where one type is needed.
- An object expression after a member declared `Any` that answers a list applies to the list once. Declare the member's result as a list, `List<Any>`, so it applies to each item.
- A query nesting deeper than 256 levels, summing more than 256 terms, or holding a string with a surrogate standing alone, is refused. Group part of a long chain, as `a + b + (c + d)` does, and write the whole character.
- A caller that compared `domql.format`'s text for such a negation or such a call reads the new text, which parses to the same definition.
- A holder that keeps its value writes it again against a writer that answers with a new value each time, as code animating the property it holds does, where it yielded. Hold the target with `keep = false`, or end the holding while the other writer writes it.
- A module member's implementation is no longer promised a call at each evaluation of a watch, though it still gets one. Count nothing on its calls, and keep what must follow every evaluation out of it: a member reads alone.

<a id="v1-0-0-beta-1"></a>

## `1.0.0-beta.1`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

The first beta. DOMQL's contract is that of `1.0.0-alpha.318`, unchanged. What changes is the promise a version makes about the next one, as [D75](docs/decisions.md#d75) records:

- **Stability:** no breaking redesign is planned.
- **Migration:** a later version that breaks what this one allows says how to migrate.
- **Limitations:** the status overview documents what waits. [The C# half](docs/features-status.md#the-c-half) (A1) and A5's queue, which carries the order of delivery across the boundary, wait for their design. The [deferred work](docs/features-status.md#deferred) says what would reopen each of its items.

The runtime takes `1.0.0-beta.1` too, its first release, which the [changelog](CHANGELOG.md) records.

**Breaking:** nothing.

<a id="v1-0-0-alpha-318"></a>

## `1.0.0-alpha.318`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

A watch can wait for a burst of changes to end and report only where chosen parts change, and a subscription can throttle what it hands its handler.

**Watches**

- [The delayed schedule](spec/watches.md#watching-delayed): `schedule: 'delayed'` with a `delay` evaluates once the delay has passed with no invalidation, each one starting the wait again, and `refreshAsync()` flushes it early, as [D73](docs/decisions.md#d73) records. The new `DOMQL2019` refuses a delay out of place.

**Results**

- [Reporting on parts](spec/results.md#results-reporting-on-parts): `reportOn`, a list of paths, has a snapshot reported, whole, only where one of those parts changed; a snapshot not reported is not kept. The new `DOMQL2020` refuses one that is no list of paths.

**Events**

- [Throttling](spec/events.md#events-throttling): `throttle` hands the handler at most one event each interval, the latest, the first at once; a failed event is never dropped, and a dropped occurrence's acknowledgment rejects with the new `DOMQL5024`. `DOMQL2017` and `DOMQL2018` refuse a throttle out of range, or beside reactions. A subscription delivered by animation frame stays declined.

**Breaking:** nothing.

<a id="v1-0-0-alpha-317"></a>

## `1.0.0-alpha.317`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

A watch answers the element each list item came from to a handler in the browser, beside its result.

**Watches**

- [`sourceOf(...path)`](spec/watches.md#watching-source-elements): the reference the list item at the path in the watch's snapshot descends from, its provenance, as the element a row was projected from, or null where it descends from data, as [D72](docs/decisions.md#d72) records; a selected view answers it for a path relative to its part. A path ending at anything but a list's item is refused with the new `DOMQL2016`.

**Breaking:** nothing.

<a id="v1-0-0-alpha-316"></a>

## `1.0.0-alpha.316`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

A subscription carries out reactions, once executions run inside each event's delivery with the user's activation, with no round trip to a caller across a boundary.

**Events**

- [Reactions](spec/events.md#events-reactions): `subscribe` takes `reactions`, query objects each ending in a once execution, carried out in their order as each event is projected, inside its delivery and before the handler, each bound to its own values and `event`, the event's projected value, for the subscription's owner. The handler's ready event carries `reactions`, a promise of each one's result, settling after the handler was called, as [D71](docs/decisions.md#d71) records. A list of anything but the instance's query objects is refused with the new `DOMQL2015`.

**Breaking:** nothing.

<a id="v1-0-0-alpha-315"></a>

## `1.0.0-alpha.315`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

Owned writes hold what DOMQL and module code write beside a framework that renders the same elements: an element's text among them, kept against the framework's patches without fighting a writer that keeps its own value.

**Executions**

- [`ownText({ value, restore, keep })`](spec/vocabulary.md#execution-element-owned-writes): an owned write of an element's text, written into the one text node it holds, in place, so a framework that rendered the node keeps it; an element that holds none gets one, and one holding other nodes fails the start or the update.
- [Another holder](spec/vocabulary.md#execution-element-owned-writes-yielding): a holder that keeps its value yields to a writer that writes its own value again in answer, within the two frames after DOMQL wrote it again, where two such writers alternated once a frame; it keeps its value again from its next update.
- [Beside a framework](spec/vocabulary.md#execution-element-owned-writes-framework): each target of a rendered element is the framework's or an owned write's, a rendered attribute kept with `keep`, a committed position held with `restore = false` until the framework applied the commit, and module code holding what it writes through owned writes it runs with `env.domql`, as [D70](docs/decisions.md#d70) records.

**Breaking:** a holder that keeps its value no longer writes it again against a writer that writes its own again in answer.

<a id="v1-0-0-alpha-314"></a>

## `1.0.0-alpha.314`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

DOMQL promises the order of what it delivers across handles, and of what a caller asks of several handles.

**The API**

- [Order across handles](spec/api.md#api-order-across-handles): an occurrence reaches every subscription listening before `deliver` returns, an event of `on` within its dispatch, and a watch's change as its evaluation completes, so handlers hear what happens in the order it happens, across handles, subscriptions and owners; `run`, `update`, `dispose` and `executeAsync` take effect within their calls, so calls to several handles take effect in the order they are made, as [D69](docs/decisions.md#d69) records.

**Breaking:** nothing.

<a id="v1-0-0-alpha-313"></a>

## `1.0.0-alpha.313`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

A module can be loaded on request, through a loader by its name, before the query that imports it is carried out.

**Modules**

- [Loading a module on request](spec/vocabulary.md#extension-modules-loading): `domql.registerModuleLoader(name, load)` registers the loader of a module, and `domql.loadModulesAsync(modules)` loads and registers every module named that the instance doesn't hold yet, those a query object, a definition or a text imports, or a list names, sharing a load under way, as [D68](docs/decisions.md#d68) records.
- New codes: `DOMQL2013` and `DOMQL2014` for their misuse; `DOMQL3007` for a request importing a module whose loader hasn't run yet, refused at the import; `DOMQL4014` for a loader answering no module of its name, `DOMQL4015` for a module neither registered nor given a loader, and `DOMQL5023` for a loader that fails.

**Breaking:** nothing.

<a id="v1-0-0-alpha-312"></a>

## `1.0.0-alpha.312`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

An instant scroll answers as soon as the browser has made it, and a scroll in a hidden document no longer waits for the document to be shown.

**Executions**

- [Instant scrolls](spec/vocabulary.md#execution-scroll-instant): `scrollTo`, `scrollBy` and `scrollIntoView` answer an instant scroll as the browser's method returns, without waiting for an animation frame. A scroll is instant where its behavior is `"instant"`, or `"auto"` where every box it may move computes `scroll-behavior: auto`: the box itself, the root element for the window, and for `scrollIntoView` each scroll container holding the element and the viewport, as [D67](docs/decisions.md#d67) records. A browser whose scroll methods answer no promise had them answered three frames late.
- A scroll in a hidden document is asked for as instant whatever its behavior, so it answers at once rather than once the document is shown again.

**Breaking:** nothing.

<a id="v1-0-0-alpha-311"></a>

## `1.0.0-alpha.311`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

A watch's refresh takes new samples of the maintained members it reads where it is asked to, so a sentinel refreshed after a load reads where the load left it.

**Watches**

- [Resampling](spec/watches.md#watching-resampling): `refreshAsync({ resample: true })` has every maintained observation the watch's last evaluation read take a new sample, and evaluates once each has arrived; a failure to take one rejects the refresh with the new `DOMQL5022`, and the watch goes on, as [D66](docs/decisions.md#d66) records.
- A refresh takes a `signal`, which cancels its wait alone. A refresh still raises no event where its result is unchanged: a caller that needs the result reads `snapshot` once it settles, and `rebaseline` is declined.

**Observations**

- [Extension modules](spec/vocabulary.md#extension-modules): a maintained observation type may offer `resampleAsync()`, which takes a new sample and answers a promise that settles once it has arrived; one offering none is read as it stands.
- [`intersection`](spec/vocabulary.md#observations-types) takes a new sample by observing its element again.

**Breaking:** nothing.

<a id="v1-0-0-alpha-310"></a>

## `1.0.0-alpha.310`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

DOMQL promises that change sets compose, so a host that keeps one delivery in flight coalesces them itself.

**Results**

- [Composing](spec/results.md#results-composing): the change sets of consecutive events, concatenated in order, are one change set from the first's snapshot to the last's, each item matched by its source throughout, as [D65](docs/decisions.md#d65) records.
- [Coalescing](spec/results.md#results-coalescing): a host sends what accumulated during a delivery as that concatenation, or as the latest snapshot whole, one operation replacing the root, choosing by size alone.

**Breaking:** nothing.

<a id="v1-0-0-alpha-309"></a>

## `1.0.0-alpha.309`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

DOMQL promises when a watch's handlers run, and the order of executions carried out together, and keeps an owned write's value among a frame's writes.

**Watches**

- [When its handlers run](spec/watches.md#watching-when-handlers-run): an `immediate` watch's handlers run within the microtask checkpoint of the delivery that invalidated it, a mutation delivery's before any task or frame, as [D62](docs/decisions.md#d62) records; a `frame` watch's inside the animation frame, among its reads, after the frame's writes and before paint, as [D63](docs/decisions.md#d63) records.

**Executions**

- [Order](spec/executions.md#executions-executing-once): an execution's implementation is invoked within the call that carries it out, so executions carried out in one task keep their order, as [D64](docs/decisions.md#d64) records.
- [Owned writes](spec/vocabulary.md#execution-element-owned-writes): a holder that keeps its value writes it again among the next frame's writes, before the watches of that frame read it, where it wrote it in a frame of its own.

**Breaking:** nothing.

<a id="v1-0-0-alpha-308"></a>

## `1.0.0-alpha.308`

*November 2, 2026 · Nexo language `1.0.0-beta.20` · definition format 38*

DOMQL moves to Nexo's language `1.0.0-beta.20`, whose host calls take function arguments their host keeps, and a behavior keeps a test it is given and calls it as it hears each event.

**Executions**

- [Kept functions](spec/vocabulary.md#extension-modules-kept-functions): a host call's function argument reaches its implementation as a function it keeps and calls later, each call reading the page as it is then and reading alone. DOMQL ends it as the execution keeping it ends: a continuous execution's instance ending or accepting other arguments, a once execution's answer settling, a subscription ending; a call afterwards fails with Nexo's NEXO5051, as [D61](docs/decisions.md#d61) records.
- A host call declaring an expression or a predicate parameter is refused with Nexo's NEXO4056, which refused a function parameter too.

**Breaking:** nothing.

<a id="v1-0-0-alpha-307"></a>

## `1.0.0-alpha.307`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL states how a host call's options reach its implementation: a null passed as it stands where its parameter accepts null, and a structured option written in place.

**Executions**

- [Arguments](spec/vocabulary.md#extension-modules): a skipped preparation is one whose receiver is null, or an argument whose parameter propagates null is null; a null argument whose parameter accepts null is passed as it stands, as a bound of null meaning the viewport, as [D59](docs/decisions.md#d59) records. DOMQL's documents said any null argument skips the call, which its preparation never did.
- [Arguments](spec/vocabulary.md#extension-modules): an option of a structured type, written in place as an object expression, reaches the implementation as that type's frozen data, its reference fields holding the elements they name, as [D60](docs/decisions.md#d60) records.

**Breaking:** nothing.

<a id="v1-0-0-alpha-306"></a>

## `1.0.0-alpha.306`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL states where a module keeps what it holds for a document, and a member what it measured before.

**The environment**

- [State per document](spec/vocabulary.md#extension-modules-state-per-document): a module keeps it by `env.document` in a `WeakMap` of its own, one for each document across every instance of DOMQL that registers the module, never reset by DOMQL, which offers no hook at a document's first use or last release, as [D57](docs/decisions.md#d57) records.
- [History per holder](spec/vocabulary.md#extension-modules-history-per-holder): the environment is one per operation, so a captured member keys its history by its environment and its receiver, each watch, wait and subscription keeping its own, as [D58](docs/decisions.md#d58) records.

**Breaking:** nothing.

<a id="v1-0-0-alpha-305"></a>

## `1.0.0-alpha.305`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL gives module code its observations, its animation frames, its instance and a transient measurement, and measures continuously where a module asks it to.

**The environment**

- [`env.observe` and `env.frame`](spec/vocabulary.md#extension-modules-environment): module code holds an observation through the window's shared observations, a mutation notifying at its delivery, and runs a write in the next animation frame before the watches DOMQL evaluates in it read, or a read among them, as [D53](docs/decisions.md#d53) records.
- [`env.domql`](spec/vocabulary.md#extension-modules-environment): the instance of DOMQL the operation belongs to. While a query is evaluated, `executeAsync` and `run`, and an operation environment's `observe`, `frame` and `measureUnder`, are refused with `DOMQL5021`, as [D54](docs/decisions.md#d54) records.
- [`env.measureUnder(element, { class }, read)`](spec/vocabulary.md#extension-modules-environment): a transient measurement, which DOMQL's own mutation observers never hear, for an observation type while a watch runs, as [D55](docs/decisions.md#d55) records.
- [An observation's environment](spec/vocabulary.md#extension-modules-observation-environment): an observation type's implementation receives the window's own, whose tools it may always use.
- `DOMQL2010`, `DOMQL2011` and `DOMQL2012` refuse what `observe`, `frame` and `measureUnder` don't take.

**Observations**

- [`frame`](spec/vocabulary.md#observations-types): continuous measurement, invalidating what reads it at the start of each animation frame while it is held, its cost measured, as [D56](docs/decisions.md#d56) records.

**Watches**

- [When a watch evaluates](spec/watches.md#watching-when-a-watch-evaluates): a watch scheduled by frame evaluates among the frame's reads, after the writes module code asks for.

**Breaking:** an execution carried out while a query is evaluated, by a member's implementation, is refused with `DOMQL5021`, where it ran; such a member carries it out from a behavior instead.

<a id="v1-0-0-alpha-304"></a>

## `1.0.0-alpha.304`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL lets a behavior's module offer what the behavior holds as members, which a watch follows.

**Behaviors**

- [State](spec/behaviors.md#behaviors-state): a member the evaluator invokes declaring `behavior` reads the state that behavior offers, its implementation receiving the instance running for the environment's owner on its receiver, or null, as [D52](docs/decisions.md#d52) records. A behavior's implementation receives `notify()`, which says what it offers may have changed.

**Observations**

- [`behavior`](spec/vocabulary.md#observations-types), DOMQL's eleventh observation type, invalidates a watch as an instance of the behavior it names starts on its target, is updated, moves there or away, or ends, and as the instance notifies.

**Breaking:** nothing.

<a id="v1-0-0-alpha-303"></a>

## `1.0.0-alpha.303`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL delivers a behavior's occurrences to the subscriptions of its module's event sources, and tells the behavior once they have applied each.

**Behaviors**

- [Occurrences](spec/behaviors.md#behaviors-occurrences): an event source declaring `behavior` is carried out by DOMQL. A behavior's implementation receives `deliver(source, value)`, and every subscription of that source listening for its owner on its receiver hears it, from every instance running there, in the order delivered and never coalesced, through the behavior's replacement and release, as [D49](docs/decisions.md#d49) records. `domql.createModule` refuses such a source declaring an `impl` or parameters, `DOMQL4013`.
- [Acknowledgment](spec/behaviors.md#behaviors-acknowledgment): `deliver` answers a promise that settles once each subscription has applied the occurrence, a handler's returned promise included, and rejects with `DOMQL5017` to `DOMQL5020` where nothing applied it, as [D50](docs/decisions.md#d50) records. The `deliver` of a module's own event source answers it too.
- [Handling inside the native dispatch](spec/behaviors.md#behaviors-synchronous-handling): `deliver` projects and calls every handler before it returns, and never throws into the listener that delivers, as [D51](docs/decisions.md#d51) records.

**Breaking:** an event source's `deliver` answers a promise where it answered nothing. A source that ignored what it answered goes on as it was; one that relied on its answering nothing reads the promise instead.

<a id="v1-0-0-alpha-302"></a>

## `1.0.0-alpha.302`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL carries every operation out for an owner, and a module's commands reach the behavior running for theirs.

**Behaviors**

- [The owner](spec/behaviors.md#behaviors-the-owner): every operation takes an `owner` option, any value, null by default, which every implementation it reaches receives as `env.owner`, as [D47](docs/decisions.md#d47) records.
- [The environment](spec/vocabulary.md#extension-modules-environment): an operation gives every implementation it reaches one frozen environment, from its start to its end, a continuous execution's every update included.
- [Commands](spec/behaviors.md#behaviors-commands): a once execution declaring `behavior` reaches the running instance of that continuous execution of its module, for its owner on its receiver, the latest where several run, and rejects with `DOMQL5016` where none does, as [D48](docs/decisions.md#d48) records. `domql.createModule` refuses a `behavior` on any other declaration, `DOMQL4011`, and one naming no continuous execution of the module, `DOMQL4012`.

**Breaking:** every environment holds `owner` beside `window` and `document`, and a continuous execution's is one object through its updates. An implementation that compared its environment whole reads the members it needs instead.

<a id="v1-0-0-alpha-301"></a>

## `1.0.0-alpha.301`

*November 2, 2026 · Nexo language `1.0.0-beta.19` · definition format 38*

DOMQL moves to Nexo's language `1.0.0-beta.19`. Its runtime is that of `1.0.0-beta.15`, whose tooling Nexo withdrew until it is designed, and a text that ends inside a collection, as `[10,`, is refused with NEXO1000 where a `TypeError` escaped.

**Breaking:** nothing.

<a id="v1-0-0-alpha-300"></a>

## `1.0.0-alpha.300`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL shows a file the user chose as an element's source.

**Executions**

- [`ownFileSource({ input, index, restore })`](spec/vocabulary.md#execution-element-ownfilesource) holds an element's `src` at an object URL of the file a file input holds, an owned write whose URL is the execution's own, revoked once the source no longer shows it, as [D44](docs/decisions.md#d44) records.

<a id="v1-0-0-alpha-299"></a>

## `1.0.0-alpha.299`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL places the document's selection around a node, around its contents or at a point.

**Executions**

- [`Domql.document.selection?.select({ node })`, `selectContents({ node, collapse })` and `collapse({ node, offset })`](spec/vocabulary.md#execution-document-selection-placement) place the document's selection, which the selection read of it stands for, and answer whether the selection holds the place, as [D43](docs/decisions.md#d43) records.

<a id="v1-0-0-alpha-298"></a>

## `1.0.0-alpha.298`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL dispatches an event of the page's own.

**Executions**

- [`dispatch({ type, bubbles, detail })`](spec/vocabulary.md#execution-dispatch), of an element, the document and the window, dispatches a cancelable `CustomEvent` and answers whether a listener cancelled it, as [D42](docs/decisions.md#d42) records.

<a id="v1-0-0-alpha-297"></a>

## `1.0.0-alpha.297`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL writes and reads the clipboard, downloads, prints, shares and plays media, each answering how the browser took the request.

**Executions**

- [`Domql.window.writeClipboard(text)` and `readClipboard({ types })`](spec/vocabulary.md#execution-window-writeclipboard-readclipboard), [`download({ name, content, type })`](spec/vocabulary.md#execution-window-download), [`print()`](spec/vocabulary.md#execution-window-print) and [`requestShare({ title, text, url })`](spec/vocabulary.md#execution-window-requestshare), each stating what it needs of the user's activation, as [D40](docs/decisions.md#d40) records.
- A media element's [`play()`, `pause()` and `writeMuted(muted)`](spec/vocabulary.md#execution-element-play-pause-writemuted): `play` answers `"playing"`, `"blocked"`, `"aborted"` or `"unsupported"`, and the others whether they changed it.
- `readClipboardText()` is declined beside `readClipboard()`, and `writeCookie` declined, as [D41](docs/decisions.md#d41) records.

<a id="v1-0-0-alpha-296"></a>

## `1.0.0-alpha.296`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL writes a form control's state as the page's code does, firing no event.

**Executions**

- [`writeIndeterminate(indeterminate)`](spec/vocabulary.md#execution-element-writeindeterminate) answers whether it changed a checkbox, [`writeValue(value)`](spec/vocabulary.md#execution-element-writevalue) the value it replaced, and [`writeSelection({ start, end })`](spec/vocabulary.md#execution-element-writeselection) whether it placed the selection, an editable element's at offsets in its text; an element each doesn't apply to answers false or null, as [D39](docs/decisions.md#d39) records.

<a id="v1-0-0-alpha-295"></a>

## `1.0.0-alpha.295`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL owns writes to an element while they run: an attribute, a class, or an inline style property.

**Executions**

- [`ownAttribute({ name, value, restore, keep })`, `ownClass({ name, present, restore, keep })` and `ownStyle({ property, value, restore, keep })`](spec/vocabulary.md#execution-element-owned-writes) are continuous executions, each holding one target of an element at its value while it runs, as [D38](docs/decisions.md#d38) records. The latest holder of a target applies its value and hands it back to the one before it as it ends; the last writes back the value it found where it restores, and a holder that keeps its value writes it again before the next frame where another writer changes it.

<a id="v1-0-0-alpha-294"></a>

## `1.0.0-alpha.294`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL captures a pointer to an element and releases it.

**Executions**

- [`capturePointer({ pointerId })` and `releasePointer({ pointerId })`](spec/vocabulary.md#execution-element-capturepointer-releasepointer) answer whether the element holds the capture afterwards and whether it released one it held, a pointer that is not active answering false, as [D37](docs/decisions.md#d37) records.

<a id="v1-0-0-alpha-293"></a>

## `1.0.0-alpha.293`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL shows and hides popovers and dialogs.

**Executions**

- [`showPopover()` and `hidePopover()`](spec/vocabulary.md#execution-element-showpopover-hidepopover), and [`showModal()` and `close({ returnValue })`](spec/vocabulary.md#execution-element-showmodal-close), each answer whether they changed the element, and false, without calling the browser, where it is in the state asked for already, as [D36](docs/decisions.md#d36) records.

<a id="v1-0-0-alpha-292"></a>

## `1.0.0-alpha.292`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL's module declares its first executions: focusing an element and scrolling, each one browser call answering what it did.

**Executions**

- [Built-in executions](spec/vocabulary.md#built-in-executions): DOMQL's module declares executions of its own, beside those an extension module declares, as [executions](spec/executions.md) set out, each carried out by `executeAsync`.
- [`takeFocus({ preventScroll })`](spec/vocabulary.md#execution-element-takefocus) focuses an element and answers whether focus landed on it, as [D34](docs/decisions.md#d34) records.
- [`scrollTo({ inline, block, behavior })` and `scrollBy(…)`](spec/vocabulary.md#execution-scrollto-scrollby), of an element and of the window, scroll along the axes of the box's writing mode, from its scroll origin under RTL too, and answer whether it moved; [`scrollIntoView({ block, inline, behavior })`](spec/vocabulary.md#execution-element-scrollintoview) answers whether the element is in view. Each answers once the scroll has ended, as [D35](docs/decisions.md#d35) records.

<a id="v1-0-0-alpha-291"></a>

## `1.0.0-alpha.291`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL delivers a key's repeat, composition and modifiers, and every event's time, cancellation and path.

**Events**

- [`KeyboardEvent`](spec/events.md#event-types) adds `repeat`, `isComposing`, the modifiers `ctrlKey`, `metaKey`, `altKey` and `shiftKey`, and `altGraphKey`, whether AltGr was held, which DOMQL reads through `getModifierState("AltGraph")`, as [D33](docs/decisions.md#d33) records.
- Every event type holds `timeStamp`, `defaultPrevented` and `composedPath`, the elements the event passes through from its target outwards, shadow roots, the document and the window left out. A module's own event type declares those it reads.

**Breaking:** a module's host call that supplies a value of one of DOMQL's event types, as an execution answering a `Domql.DomEvent`, supplies `timeStamp`, `defaultPrevented` and `composedPath` as well.

<a id="v1-0-0-alpha-290"></a>

## `1.0.0-alpha.290`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL delivers the events of focus, editing, the clipboard, composition, presentation, animation, loading and media.

**Events**

- [Event types](spec/events.md#event-types): `focusin` and `focusout`, beside `focus` and `blur`, are each a `FocusEvent { target, relatedTarget }`, the element focus leaves or moves to, as [D30](docs/decisions.md#d30) records; `focus` and `blur` were a `DomEvent`.
- `beforeinput` and `input` are an `InputEvent { target, inputType, data, isComposing }`, its kind `""` for an input event that names none, as a select fires; `paste`, `copy` and `cut` a `ClipboardEvent { target, types }`; `compositionstart` and `compositionend` a `CompositionEvent { target, data }`; and `selectionchange` a `DomEvent`, as [D31](docs/decisions.md#d31) records. `input` was a `DomEvent`.
- `beforetoggle` and `toggle` are a `ToggleEvent { target, oldState, newState }`; `animationstart`, `animationend` and `animationcancel` an `AnimationEvent { target, animationName }`; and `close`, `cancel`, `load`, `error`, `play`, `pause`, `volumechange` and `ended` a `DomEvent`, as [D32](docs/decisions.md#d32) records.

<a id="v1-0-0-alpha-289"></a>

## `1.0.0-alpha.289`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL delivers the events of a pointer, a touch, the wheel and a drag, with the pointer, the count, the time and the keys held.

**Events**

- [Event types](spec/events.md#event-types): `dblclick`, `pointermove`, `pointercancel` and `lostpointercapture` are each a `PointerEvent`, which adds `pointerId`, `detail`, `timeStamp` and the modifiers `ctrlKey`, `metaKey`, `altKey` and `shiftKey`; its `pointerId` and `pointerType` are null where the event carries no pointer, as [D28](docs/decisions.md#d28) records.
- `touchstart` and `touchmove` are a `TouchEvent { target, touches, timeStamp }`, each touch a `Touch { identifier, clientX, clientY }`; `wheel` a `WheelEvent { target, deltaX, deltaY, deltaMode, timeStamp }`; and `dragstart`, `dragenter`, `dragover`, `dragleave` and `dragend` beside `drop` a `DragEvent`, which adds `types`, `timeStamp` and the modifiers, as [D29](docs/decisions.md#d29) records.
- `on` reads `pointerId`, `pointerType`, `touches` and `types` for every event it delivers, where no property of the event answers them as data.

**Breaking:** a click the keyboard caused answers a null `pointerType`, where it answered `""`.

<a id="v1-0-0-alpha-288"></a>

## `1.0.0-alpha.288`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL listens to an event in the capture phase, as it travels to its target, for observing alone.

**Events**

- [`on(type, options?)`](spec/events.md#event-sources) takes `{ capture = true }`, a [`Listening`](spec/vocabulary.md#vocabulary-types), and listens as an event is captured on its way to its target, before any listener nearer the target runs, so it observes an event a listener there stops; without it, `on` listens at the target and as the event bubbles, as before, as [D27](docs/decisions.md#d27) records. Either way it listens passively.

<a id="v1-0-0-alpha-287"></a>

## `1.0.0-alpha.287`

*November 1, 2026 · Nexo language `1.0.0-beta.15` · definition format 38*

DOMQL moves to Nexo's language `1.0.0-beta.15`, which settles what Nexo's status left open. What a query notices of it:

- **Membership compares by key equality alone.** `contains`, `indexOf`, `distinct` and `distinctBy` take numbers, strings, Booleans, references and null, so a list of elements works as before, and one of objects, lists or values of `Any` is refused (NEXO3083), where it was compared by identity.
- **A result path is checked wherever it is given,** so `select` refuses a malformed path as it did, and steps into an object's own fields and a list's items alone.
- **A module's declarations name Nexo's own types qualified,** as `Nexo.Number`, where the module declares a type of that name.
- **Conditions Nexo told apart by message have codes of their own,** NEXO5043 to NEXO5050 among them, as [Nexo's language history](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/LANGUAGE-HISTORY.md) records.

**Breaking:** a query that tested membership in a list of objects, lists or values of `Any` is refused; test a key field instead, as `items.any(it.id == id)`.

<a id="v1-0-0-alpha-286"></a>

## `1.0.0-alpha.286`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL observes a selector for what it reads, so a watch of `all`, `first`, `matches` or `closest` evaluates again only where its selector could match differently.

**Vocabulary**

- [Observation types](spec/vocabulary.md#observations-types): `selector`, what a selector reads in a tree: its structure and the attributes the selector tests, focus where it tests focus and popovers where it tests `:popover-open`, as [D26](docs/decisions.md#d26) records.
- [`matches`](spec/vocabulary.md#function-element-matches), [`closest`](spec/vocabulary.md#function-element-closest), [`first` and `all`](spec/vocabulary.md#function-node-first-all), and a range's [`all`](spec/vocabulary.md#function-range-all), observe it. They observed every attribute of their tree, and focus and popovers whatever their selector; an attribute their selector never tests, as a `tabindex` written in the tree, no longer evaluates a watch again.

<a id="v1-0-0-alpha-285"></a>

## `1.0.0-alpha.285`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads the limits of a box's size in pixels and the files a file input holds.

**Vocabulary**

- [`sizeLimits`](spec/vocabulary.md#property-element-sizelimits) answers a `SizeLimits { minWidth, minHeight, maxWidth, maxHeight }` in CSS pixels, each null where the computed limit is no length, as [D24](docs/decisions.md#d24) records.
- [`files`](spec/vocabulary.md#property-element-files) answers a file input's `List<File>`, each `File { name, bytes, type, lastModified }`, as [D25](docs/decisions.md#d25) records.

<a id="v1-0-0-alpha-284"></a>

## `1.0.0-alpha.284`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads an element's siblings and place, whether a node holds another, a pointer's capture, the window's URL and its shortcut modifier.

**Vocabulary**

- [`previousSibling`, `nextSibling`](spec/vocabulary.md#property-element-siblings) and [`index`](spec/vocabulary.md#property-element-index) answer an element's neighbours and its place among its parent's child elements, and [`contains(other)`](spec/vocabulary.md#function-node-contains) whether a node holds another, as [D22](docs/decisions.md#d22) records.
- [`hasPointerCapture(pointerId)`](spec/vocabulary.md#function-element-haspointercapture) answers whether an element holds a pointer's capture, observed through the capture events.
- [`Domql.window.location`](spec/vocabulary.md#property-window-location) answers a `Location { href, pathname, search, hash }`, and [`shortcutModifier`](spec/vocabulary.md#property-window-shortcutmodifier) `"Meta"` or `"Control"`, as [D23](docs/decisions.md#d23) records.
- [Observation types](spec/vocabulary.md#observations-types): `navigation`, the window's URL, through the Navigation API where the browser offers it.

<a id="v1-0-0-alpha-283"></a>

## `1.0.0-alpha.283`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads the document's selection and the range it holds, and follows a selection the page's code makes.

**Vocabulary**

- [`Domql.document.selection`](spec/vocabulary.md#property-document-selection) answers a `DocumentSelection { type, collapsed, rangeCount, anchorElement, focusElement, range }`, read through an object expression since it holds references.
- [`Range`](spec/vocabulary.md#vocabulary-types) is a reference type with [`rect`](spec/vocabulary.md#property-range-rect), `collapsed`, `text`, `startElement`, `endElement`, `commonAncestor`, [`intersects(node)`](spec/vocabulary.md#function-range-intersects), [`all(selector)`](spec/vocabulary.md#function-range-all) and [`offsetsIn(element)`](spec/vocabulary.md#function-range-offsetsin), and DOMQL's `typeOf` recognizes a range a host binds.
- [`selection`](spec/vocabulary.md#property-element-selection) answers, for an element whose content is editable, the document's selection as offsets in its text, as [D21](docs/decisions.md#d21) records.
- `selection` and `hasSelection` are observable: the browser fires `selectionchange` for a selection the page's code sets, and they observe their subtree for the nodes that take a selection with them, as [D20](docs/decisions.md#d20) records. A watch of either needs no partial observation.

<a id="v1-0-0-alpha-282"></a>

## `1.0.0-alpha.282`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads what a user entered, an element's text, markup, name, classes and declared style, and a media element's playback.

**Vocabulary**

- [`value`](spec/vocabulary.md#property-element-value) answers the value of an `input`, a `textarea` or a `select`, and null for any other element.
- [`indeterminate()`](spec/vocabulary.md#boolean-function-element-indeterminate) and [`autofilled()`](spec/vocabulary.md#boolean-function-element-autofilled) test `:indeterminate` and `:autofill`; no observation follows autofill itself, as [D17](docs/decisions.md#d17) records.
- [`text`](spec/vocabulary.md#property-element-text) and [`html`](spec/vocabulary.md#property-element-html) answer a subtree's text and markup, as [D15](docs/decisions.md#d15) records.
- [`localName`](spec/vocabulary.md#property-element-localname), [`classes`](spec/vocabulary.md#property-element-classes) and [`inlineStyle[property]`](spec/vocabulary.md#function-element-inlinestyle) answer an element's name, its class list and its declared style, as [D16](docs/decisions.md#d16) records.
- [`playback`](spec/vocabulary.md#property-element-playback) answers a media element's playback, observed through its media events, as [D18](docs/decisions.md#d18) records.

**Watches**

- [Following a change a member misses](spec/watches.md#dependencies-following-what-a-member-misses): a body's local that reads a member observing the change, as `text` does an edit, makes a watch follow it, as [D19](docs/decisions.md#d19) records.

<a id="v1-0-0-alpha-281"></a>

## `1.0.0-alpha.281`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads the focused element, an element's direction, and whether an element is displayed and can take focus.

**Vocabulary**

- [`Domql.document.activeElement`](spec/vocabulary.md#property-document-activeelement) answers the focused element through open shadow roots, and null while no element has focus, as [D12](docs/decisions.md#d12) records.
- [`direction`](spec/vocabulary.md#property-element-direction) answers `"ltr"` or `"rtl"` as `dir` decides it along an element's ancestry, the document element's included, as [D13](docs/decisions.md#d13) records.
- [`displayed()`](spec/vocabulary.md#boolean-function-element-displayed) answers whether the browser renders a box for an element, and [`focusable()`](spec/vocabulary.md#boolean-function-element-focusable) whether it can take focus, as [D14](docs/decisions.md#d14) records.

<a id="v1-0-0-alpha-280"></a>

## `1.0.0-alpha.280`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL reads how far a box is scrolled, the box that scrolls it and its padding box, and compares its measurements of layout within a twentieth of a pixel.

**Vocabulary**

- [`scroll`](spec/vocabulary.md#property-element-scroll), of an element and [of the window](spec/vocabulary.md#property-window-scroll), answers how far it is scrolled along each axis of its writing mode: a `Scroll { inline, block }`, each a `ScrollAxis { offset, extent, viewport }`, its offset from the start of its content under RTL too.
- [`scrollContainer({ axis })`](spec/vocabulary.md#function-element-scrollcontainer) answers the nearest flat-tree ancestor the user can scroll, along an axis or either.
- [`clientRect`](spec/vocabulary.md#property-element-clientrect) answers an element's padding box without scrollbars, relative to the layout viewport.
- [Tolerance](spec/vocabulary.md#vocabulary-tolerance): every member that measures layout in CSS pixels declares a tolerance of 0.05, `rect`, `rectRelativeTo`, `size`, `clientSize` and `grid` among them, as [D8](docs/decisions.md#d8) records.
- [Observation targets](spec/vocabulary.md#observations-targets): `children`, each child element of the receiver, whose child list DOMQL observes beside them. A `resize` of a document observes its root element.
- `readonly`, `textEditable` and `selection` name the input type `number` as HTML does; the specification wrote `Number`.

**Breaking:** a watch no longer reports a measurement of layout that moved by 0.05 of a pixel or less since the one it last reported. A query that needs every change compares a number it computes, as `it.rect?.top + 0`, which carries no tolerance.

<a id="v1-0-0-alpha-279"></a>

## `1.0.0-alpha.279`

*November 1, 2026 · Nexo language `1.0.0-beta.8` · definition format 38*

DOMQL moves to Nexo's language `1.0.0-beta.8`, which fixes what DOMQL's migration found in it.

**Queries**

- [Registering a module](spec/vocabulary.md#extension-modules-registering): a watch or a waiting evaluation made stale by a module recognizing values compares its next result within each value's tolerance, as Nexo keeps a definition's origins across its resolutions. It compared that result exactly.
- [Watches](spec/watches.md#how-a-member-changes): a member read through a value of `Any` is compared within the tolerance it declares, as Nexo now records it. Its value was compared exactly.
- A host call on a value of `Any`, where every declaration of its name is a host call, is refused as Nexo resolves it (NEXO3092). DOMQL refused it as a value to evaluate, and evaluating it failed.

**API**

- `NexoError`'s factories, `structure`, `validation`, `module` and `evaluation`, are declared, so a module written in TypeScript builds a failure of its own.

**Breaking:** a query ending in a host call on a value of `Any` fails to resolve with NEXO3092; every operation refused it before. Cast its receiver, or name the extension the call is declared in.

<a id="v1-0-0-alpha-278"></a>

## `1.0.0-alpha.278`

*November 1, 2026 · Nexo language `1.0.0-beta.3` · definition format 38*

DOMQL moves from Lexica's language `1.0.0-alpha.33` to Nexo's beta, the language Lexica became, and implements `1.0.0-alpha.277` with it.

**Queries**

- [Imports](spec/queries.md#making-a-query-imports): every query imports DOMQL's module, `Domql`, which DOMQL supplies, so its text writes no import of it. A query that uses another module imports it, `import Charts`, and a definition records its imports.
- [Module members](spec/vocabulary.md#module-members): DOMQL's module is named `Domql`, so a query reads `Domql.document` and `Domql.window`.
- [Extension modules](spec/vocabulary.md#extension-modules): a member another module adds to DOMQL's types stands in an extension, `{ name, kind: 'extension', target: 'Domql.Element', members }`, and a query reads it with `:`, as `panel:palette`. DOMQL's own members are read with `.`.
- [Resolution](spec/queries.md#queries-resolution): a resolution is kept while Nexo says it is current, so registering a module leaves running requests as they were, and a running request a module declaring a `typeOf` makes stale is [resolved or prepared again](spec/vocabulary.md#extension-modules-registering) where it next evaluates or projects.
- [Host calls on a receiver of unknown type](spec/vocabulary.md#extension-modules-host-calls): what such a call requests is what Nexo's candidates for it request, every declaration that takes it as it is written, and a call whose candidates disagree is refused where it stands.
- [Watches](spec/watches.md#how-a-member-changes): a watch is checked against every declaration a member of a value of `Any` could select, as Nexo's candidate declarations name them.

**Vocabulary**

- [Types](spec/vocabulary.md#vocabulary-types): DOMQL declares the DOM as reference types of its own, its members within them, as `1.0.0-alpha.277` specified. Text and comment nodes are refused as bindings.
- [Extension modules](spec/vocabulary.md#extension-modules): a declaration carries its implementation as `impl`; a host call stands within a type, an extension or among the module members; event types are mappings of the type selector `event`; conversions are operators.

**Results**

- [Identity](spec/results.md#results-change-sets): a list's items are matched by the references they descend from, so a projection of a projection's items, and a list filtered or ordered from one, keep their identity.
- [Dictionaries and pairs](spec/results.md#results-collections) are compared and changed as data, in the form a result exports them.

**Errors**

- [Errors](spec/errors.md): every failure is a `NexoError` with a `code`. DOMQL's own conditions take `DOMQL` codes, catalogued.

**Breaking:**

- The package exports `NexoError` where it exported `LexicaError`, and an error's module location names `declarationKey` where it named `field`.
- `domql.document` and `domql.window` are `Domql.document` and `Domql.window`, and a type is named `Domql.Element` where it was `domql.Element`.
- A member another module adds to DOMQL's types is declared in an extension and read with `:`, and its query imports its module. A flat member with a `target` is refused.
- A declaration's `implementation` is its `impl`; `selectableTypes` are `mappings`, `{ selector, key, type }`; a module's `conversions` are operators of its types; a structured type is `{ name, kind: 'structured', members }`.
- `query.resolve()` answers `getLocation(pointer)` where it answered `locate(pointer)`, and each used declaration's `qualifiedName` beside its declared `name`.
- A definition is of format 38: `{ version, imports, expression }`, with Nexo's node names.
- The verbs `is`, `has` and `supports` are gone; a query calls a Boolean function, `it.checked()` or `Domql.checked(it)`.
- A query's text follows Nexo's line structure, a body that uses `return` laid out a local to a line.

<a id="v1-0-0-alpha-277"></a>

## `1.0.0-alpha.277`

*October 22, 2026 · Lexica language `1.0.0-alpha.33` · definition format 33 · implemented in `1.0.0-alpha.278`*

**Vocabulary**

- [Nodes](spec/nodes-and-shadow-trees.md#nodes): DOMQL declares the DOM as reference types of its own, which it recognizes and checks: `Node`, abstract, with `Element`, `Document`, `DocumentFragment` and `ShadowRoot` beneath it, and `Window`. Text and comment nodes are refused as bindings.
- [Types](spec/vocabulary.md#vocabulary-types): the views `Shadow` and `Aria` are types, and `Aria` casts back to its element. Every type is named in PascalCase, as `Element`, `Size` and `PointerEvent`.
- [Extension modules](spec/vocabulary.md#extension-modules): a module names DOMQL's types qualified by its module, as `domql.Aria` and `domql.Rectangle`.

**Queries**

- [Queries](spec/queries.md#a-query-at-a-glance): queries write Lexica's indexer forms. A named indexer is `panel.attribute["id"]`, a type's unnamed indexer `panel["data-key"]`, and a property read by a computed name `panel.[name]`.

**Implemented in two steps:** the PascalCase type names and the indexer forms here, and the declared node types with the [migration to Nexo](docs/features-status.md#migration-to-nexo), in `1.0.0-alpha.278`.

**Breaking:**

- Type names are written in PascalCase: `as element` is now `as Element`, and `to number` is now `to Number`.
- An unnamed indexer is `it["data-key"]` where it was `it:["data-key"]`, and a named one `it.attribute["id"]` where it was `it:attribute["id"]`.

<a id="v1-0-0-alpha-276"></a>

## `1.0.0-alpha.276`

*October 21, 2026 · Lexica language `1.0.0-alpha.32` · definition format 32*

**Vocabulary**

- [Module members](spec/vocabulary.md#module-members): queries reach the document and the window through DOMQL's module, as `domql.document` and `domql.window`.
- [Boolean functions](spec/vocabulary.md#boolean-functions): the DOM's tests are Boolean functions, called on their receivers, as `it.focusWithin()`, or passed by reference. Hyphenated names became camelCase.
- [Observation targets](spec/vocabulary.md#observations-targets): DOMQL's module declares its observation targets, `window`, `document`, `root` and `roots`, and resolves them itself. A registered module declaring targets of its own is refused.

**Host**

- [Host calls DOMQL carries out](spec/vocabulary.md#extension-modules-host-calls): event sources and executions are Lexica's host calls. `domql.createModule` keeps each one's request kind, execution mode and implementation, and `subscribe`, `executeAsync` and `run` prepare and carry them out.
- [Events](spec/events.md#event-sources): `on` is a host call whose fixed `type` selects through the type selector `event`, its keys the event types.
- [Executions](spec/executions.md#executions-running-continuously): `run` starts a continuous execution and answers a `DomqlExecutionHandle`.
- [The API](spec/api.md#api-entry-points-and-operations): `resolve` answers an execution's mode.

**Queries**

- [Queries](spec/queries.md#a-query-at-a-glance): queries write the implicit parameter `it`, Lexica's definition version 32.

**Breaking:**

- Queries write `it` where they wrote `context`, and `domql.document` and `domql.window` where they read `document` and `window` as roots.
- A test is a Boolean function called on its receiver, as `it.checked()` where `it.is("checked")` asked it, and `it.focusWithin()` where `it.has("focus-within")` did.
- `run` replaces `apply`.

<a id="v1-0-0-alpha-275"></a>

## `1.0.0-alpha.275`

*October 21, 2026 · Lexica language `1.0.0-alpha.31` · definition format 31*

The first numbered version: DOMQL as it stood on October 21, with everything [before it](#before-1-0-0-alpha-275).

- [The API](spec/api.md#api-entry-points-and-operations): `domql.info.versions` reports three versions, declared in one place: the runtime's release, the specification the implementation follows, and the language version its Lexica runtime follows.

<a id="before-1-0-0-alpha-275"></a>

## Before `1.0.0-alpha.275`

DOMQL began on October 9, 2026, as a query language and a JavaScript library for the DOM, at its specification `1.0.1`. Its language moved into [Lexica](https://github.com/FormaUI/Nexo/blob/0e98b3e118d1dc448a8040c4a6f236088b108a7b/spec/README.md) on October 19, and DOMQL became Lexica's host, declaring the DOM as Lexica's domain. Versions were first numbered on October 21. These are the features DOMQL had by then, each named as it is today.

**October 9: reading the DOM**

- [Queries](spec/queries.md#making-a-query): a query reads the DOM through a typed vocabulary, which modules declare as data, and is checked against it before anything is evaluated.
- [Evaluation](spec/evaluation.md#evaluating): evaluating once gives plain, detached data. An element with no layout box reads null for its geometry.
- [Results](spec/results.md#results-snapshots): a snapshot holds data alone, never a live DOM reference.
- The library is one bundled ES module with TypeScript declarations, served from the NuGet package at `_content/domql/domql.js`.

**October 10: keeping data current**

- [Observations](spec/vocabulary.md#observations): members declare how their values change, and the observations that follow them are shared between the requests that read them.
- [Waiting for maintained members](spec/evaluation.md#waiting-for-maintained-members): `evaluateAsync` waits for a member's first sample.
- [Watches](spec/watches.md#watching): a watch keeps a query's result current, evaluating again when what it read changes.
- [Change sets](spec/results.md#results-change-sets) and [live state](spec/results.md#live-state): a watch delivers each new result as a change set, or keeps one live object current in place.
- [Subscriptions](spec/events.md#subscribing): a query subscribes to events and projects each one into data.
- [Executions](spec/executions.md#executions): modules declare changes to the page, carried out once or kept running.
- [The API](spec/api.md#api-objects): every exported type is named with the prefix `Domql`.

**October 12 to 19: the query language**

- The language grew a conditional, locals, Boolean combinations, optional chains and fallbacks, casts, conversions and attempts, indexers, arithmetic, comparisons, escapes, interpolation, bodies, local functions and arrow functions, all of which are now Lexica's.
- [Shadow trees](spec/nodes-and-shadow-trees.md#shadow-trees): an element's shadow relationships are read explicitly, and a watch follows changes into the shadow trees it reads.
- [Queries](spec/queries.md#making-a-query-instances): every operation is carried out through a query object, and a request gives its canonical text.

**October 19 and 20: Lexica's host**

- The language and its runtime moved to Lexica, and DOMQL builds on Lexica's public API.
- [Extension modules](spec/vocabulary.md#extension-modules): DOMQL's module is an ordinary Lexica module, declared in Lexica's one declaration shape, and other modules extend it as they would any other.
- [Resolution](spec/queries.md#queries-resolution): `resolve` answers what a query uses, before anything is evaluated.
