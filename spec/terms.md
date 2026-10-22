# Terms

<a id="terms"></a>

Each term this specification uses, what it means, and where its authoritative explanation is. A term here defines nothing its linked document does not, and a term of the language, as a script, a binding, a member or a request kind, is [Lexica's](https://github.com/FormaUI/Lexica/blob/main/spec/terms.md).

In this document:

1. [Queries and their callers](#terms-queries)
2. [The DOM and its vocabulary](#terms-vocabulary)
3. [Watches and results](#terms-watches-and-results)
4. [Events and executions](#terms-events-and-executions)

<a id="terms-queries"></a>

## Queries and their callers

| Term | Meaning | Reference |
| --- | --- | --- |
| Query | A Lexica script DOMQL carries out against a document | [Queries](queries.md#queries) |
| Query object | What `domql.query` answers: a query's definition and its bindings, through which every operation on it is carried out | [Making a query](queries.md#making-a-query) |
| Caller | The application that makes queries and carries them out, and does what it chooses with each result | [The API](api.md#api) |
| Resolution | Resolving a request against the vocabulary registered when it is first carried out, as Lexica resolves a script | [Resolution](queries.md#queries-resolution) |
| Operation | What a caller carries a request out with: `evaluate`, `evaluateAsync`, `watch`, `select`, `subscribe`, `executeAsync` or `run`, as its request kind takes | [Request kinds and their operations](queries.md#operations-and-request-kinds) |
| Selection | A part of a query's result, which belongs to the query and whose every operation starts work of its own | [Selecting a result](queries.md#selecting-a-result) |
| Handle | What an operation that keeps running answers, through which its caller follows it and ends it: a watch, an event listener or an execution handle | [The API](api.md#api-objects) |
| Window's error reporting | Where a failure no handler or caller receives goes: the window's `reportError`, or the console | [Errors](api.md#api-errors) |

<a id="terms-vocabulary"></a>

## The DOM and its vocabulary

| Term | Meaning | Reference |
| --- | --- | --- |
| Built-in vocabulary | What DOMQL's module, `domql`, declares | [Built-in vocabulary](vocabulary.md#built-in-vocabulary) |
| Node | A value of the DOM tree, of a kind of node: an element, a document, a document fragment or a shadow root | [Nodes](nodes-and-shadow-trees.md#nodes) |
| Shadow view | An element's `shadow`, whose members answer its shadow relationships | [The view](nodes-and-shadow-trees.md#shadow-trees-the-view) |
| ARIA view | An element's `aria`, whose Boolean functions and unnamed indexer read its own ARIA attributes | [Boolean functions](vocabulary.md#boolean-functions) |
| A node's root | The root of the tree the node is in | [Trees and slots](nodes-and-shadow-trees.md#trees-and-slots) |
| Flat-tree ancestors | The nodes reached from a node step by step, through the slot it is assigned to, a shadow root's host, or its parent | [Trees and slots](nodes-and-shadow-trees.md#trees-and-slots) |
| A node's roots | The roots of the trees that hold or can show a node, collected along its flat-tree ancestry | [Trees and slots](nodes-and-shadow-trees.md#trees-and-slots) |
| Layout box | The box the browser generates for an element, without which a member that needs layout answers null | [Measurements and layout](vocabulary.md#vocabulary-measurements-and-layout) |
| Observation | What a member names to learn that its result may have changed, or to keep the sample it reads | [Observations](vocabulary.md#observations) |
| Observation target | What an observation observes besides a receiver or an argument: `window`, `document`, `root` or `roots` | [Observation targets](vocabulary.md#observations-targets) |
| Extension module | A module that adds to the built-in vocabulary, registered in an instance's registry | [Extension modules](vocabulary.md#extension-modules) |

<a id="terms-watches-and-results"></a>

## Watches and results

| Term | Meaning | Reference |
| --- | --- | --- |
| Pending | A maintained member's state until its first sample arrives | [Waiting for maintained members](evaluation.md#waiting-for-maintained-members) |
| Watch | What keeps a query's result current, evaluating again when something it depends on changes | [Watches](watches.md#watching) |
| Dependencies | What a watch's last evaluation read, each member with its observations | [Dependencies](watches.md#dependencies) |
| Partial observation | A watch's acceptance of members whose observations miss some of their changes | [Accepting partial observation](watches.md#accepting-partial-observation) |
| Selected view | A part of a running watch's result, which belongs to the watch and starts no evaluation of its own | [Sharing a watch](watches.md#sharing-a-watch) |
| Snapshot | An immutable result captured at one moment | [Results](results.md#results) |
| Live state | A stable object a watch keeps current in place by change sets | [Live state](results.md#live-state) |
| Baseline | A complete result, establishing the state the changes after it are relative to | [Results](results.md#results) |
| Change set | The fields and list entries that changed, as a JSON Patch document, relative to the result it was computed against | [Change sets](results.md#results-change-sets) |

<a id="terms-events-and-executions"></a>
<a id="terms-events-actions-and-behaviors"></a>

## Events and executions

| Term | Meaning | Reference |
| --- | --- | --- |
| Host call | Lexica's call of a function the host invokes, which ends a query; DOMQL carries each out as an event source or an execution | [Host calls](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#members-host-calls) |
| Event source | A host call that delivers things that happened, as `on(type)` does | [Event sources](events.md#event-sources) |
| Event type | A key of DOMQL's type selector `event`, which names the type its events are captured as | [Event types](events.md#event-types) |
| Subscription | A query whose chain ends in an event source, which shapes each event into data | [Events](events.md#events) |
| Event listener | The handle of a subscription, and of each listener subscribed to a handle's events | [Subscribing](events.md#subscribing), [events of a handle](api.md#events-of-a-handle) |
| Execution | A host call that changes the page, of the execution mode its declaration gives | [Executions](executions.md#executions) |
| Once execution | An execution that changes the page once and answers its result, carried out by `executeAsync` | [Executing once](executions.md#executions-executing-once) |
| Continuous execution | An execution that starts something running on the page until it is updated or disposed, carried out by `run` | [Running continuously](executions.md#executions-running-continuously) |
| Execution handle | A `DomqlExecutionHandle`, through which the caller updates or disposes a continuous execution | [Running continuously](executions.md#executions-running-continuously) |
