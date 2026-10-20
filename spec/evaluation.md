# Evaluation

<a id="evaluation"></a>
<a id="evaluation-and-watching"></a>

**Evaluating** a query reads the document once and answers its result. DOMQL evaluates a query as Lexica's [runtime](https://github.com/FormaUI/Lexica/blob/main/spec/runtime.md#runtime-evaluation) evaluates a script, synchronously, against the document it runs against, and each member declares how it reads. A caller evaluates with `evaluate`, which answers at once, or with `evaluateAsync`, which also waits for the browser's first report of what a maintained member reads.

```js
const query = domql.query('{ size = panel.size, nearEnd = sentinel.intersects({ root = panel }) }', { panel, sentinel });

query.evaluate();            // Throws an evaluation error: intersects is maintained, and has no sample yet.
await query.evaluateAsync(); // { size: { width: 640, height: 480 }, nearEnd: false }
```

Evaluating a query is read-only, as [Lexica requires](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#how-a-member-reads) of every vocabulary. A measurement that needs the document changed first, such as measuring columns at their intrinsic widths under a temporary class, is an action of its own.

In this document:

1. [Evaluating a query](#evaluating)
2. [How DOMQL's members read](#evaluation-how-members-read)
3. [Waiting for maintained members](#waiting-for-maintained-members)
4. [The window an evaluation needs](#evaluation-environments)

<a id="evaluating"></a>

## Evaluating a query

`query.evaluate(options?)` resolves the query, then evaluates it once against the document in a single synchronous pass, following the resolution rather than looking names up again. What an evaluation reads is always the document as it is. Its option is `window`.

- **The result** is a detached copy, frozen, that holds nothing of the document. A structure a member answers is taken by its declared fields alone, each read as the value offers it, a getter's included, so a field beside them never reaches a result and an instance of a class answers as the fields it declares.
- **A member that breaks its contract.** A member whose function answers a type other than the one it declares has broken its contract, and the evaluation fails with an evaluation error naming the member and where it stands in the query; so does a member whose function throws, with the thrown error as its cause. A request that uses a member a module declares and does not implement is refused before anything is evaluated, with a module error naming the declaration, as Lexica's [declarations without an implementation](https://github.com/FormaUI/Lexica/blob/main/spec/modules.md#modules-declarations-without-an-implementation) set out.
- **A maintained member** cannot be read in a single synchronous pass and fails `evaluate`, with an evaluation error naming the member; `evaluateAsync` waits for it.
- **A request of another kind** is refused, as [request kinds and their operations](queries.md#operations-and-request-kinds) set out.

<a id="evaluation-how-members-read"></a>

## How DOMQL's members read

Each member declares how it reads by [Lexica's contract](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#how-a-member-reads): DOMQL's members read fresh from the document, as an attribute or a box is, maintained by a browser observation, as `intersects` is, captured, as an event's data is, or derived, as a list's `count` is.

A member whose result depends on what happened before, as well as on the document as it is, is captured: it keeps that history while a watch or an event listener holds it, and documents what an evaluation once reports without it.

<a id="waiting-for-maintained-members"></a>

## Waiting for maintained members

A maintained member is **pending** until its first sample arrives, as Lexica sets out, and DOMQL keeps pending apart from unavailable. `evaluate` fails on a maintained member, since reading it waits for the first sample, which a synchronous evaluation cannot.

- **`evaluateAsync`, and a watch's first snapshot,** wait for the first sample of every pending member they read, evaluating again as samples arrive and as what they depend on changes, until an evaluation reads no pending member; only that result is delivered. The caller can cancel the wait, and a member that can produce no sample reports itself unavailable. The wait completes at the first evaluation that reads no pending member; dependencies that keep introducing pending members can keep it waiting until the caller cancels it.
- **A maintained member a watch first reads after its first snapshot** is pending in the snapshot the watch reports, and the watch evaluates again when its first sample arrives.
- **Inside an event's object expression,** a maintained member is never waited for, as [maintained members in an event](events.md#events-maintained-members) set out.
- **`evaluateAsync(options?)` evaluates any query,** answering as soon as an evaluation reads no pending member, so a query that reads none answers from its first evaluation and a caller can use it for every query. Its options are `window` and `signal`; its `signal` cancels it: one already aborted evaluates nothing, and one that aborts while it waits rejects the promise with its reason.
- **A failure seen through a pending member waits.** An evaluation that fails having read a maintained member still pending reports nothing and waits for that member's sample, since the failure may come from the null the member answered.
- **One result, not one instant.** The result is made of fresh reads and of the samples available when the last evaluation ran, and does not promise that every measurement was taken at the same moment.

<a id="evaluation-environments"></a>

## The window an evaluation needs

Evaluating needs a browser window, the one an operation's `window` option gives or, where it gives none, the one the environment holds, and fails with an evaluation error where there is none. That window is `domql.window`, and its document is `domql.document`, the document the query runs against. Making and resolving a query need no window, so a query is made and resolved in Node.js without a DOM.

Every operation that carries a request out, `evaluate`, `evaluateAsync`, `watch`, `subscribe`, `executeAsync` and `apply`, takes the `window` option.
