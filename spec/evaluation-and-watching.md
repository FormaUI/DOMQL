# Evaluation and watching

<a id="evaluation"></a>
<a id="evaluation-and-watching"></a>

A query is evaluated as Lexica evaluates an expression, synchronously, and each member declares how it reads by [Lexica's contract](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#how-a-member-reads): DOMQL's members read fresh from the document, as an attribute or a box is, maintained by a browser observation, as `intersects` is, captured, as an event's data is, or derived, as a list's `count` is.

Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are.

A maintained member is **pending** until its first sample arrives, as Lexica sets out. `evaluate()` fails on a maintained member, since reading it waits for the first sample, which a synchronous evaluation cannot; `evaluateAsync` and a watch wait for its first sample, and an event's object expression reads it as null while it is pending. The evaluator keeps pending apart from unavailable; the [DOMQL design](../docs/domql-design.md) sets out when a request waits for first samples.

Evaluating a query is read-only, as [Lexica requires](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#how-a-member-reads) of every vocabulary. A measurement that needs the document changed first, such as measuring columns at their intrinsic widths under a temporary class, is an action of its own.

A member whose result depends on what happened before, as well as on the document as it is, is captured: it keeps that history while a watch or an event listener holds it, and documents what an evaluation once reports without it.

In this document: [Elements that leave the document](#elements-that-leave-the-document) · [How a member changes](#how-a-member-changes) · [What a query runs against](#what-a-query-runs-against).

<a id="elements-that-leave-the-document"></a>

## Elements that leave the document

An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout.

<a id="how-a-member-changes"></a>

## How a member changes

Every member declares how its result changes, by the categories [Lexica defines](https://github.com/FormaUI/Lexica/blob/main/spec/members.md#how-a-member-changes), and a watch decides by each what it may follow:

| Category | As in DOMQL | In a watch |
| --- | --- | --- |
| Constant | Whether the browser offers a capability `supports` asks | Allowed; it never invalidates. |
| Observable | A size, which a resize observation covers | Allowed. |
| Partly observable | A computed style, which a rule outside the element can change unobserved | Allowed when the caller accepts partial observation for that watch; a change the observations miss reaches the watch at its next evaluation, which `refreshAsync` or another observed change causes. |
| Unobserved | A member that names no observations | A validation error. |
| Derived | A list's `first` or `where` | Allowed wherever what it derives from is. |

A literal is constant, so a watched object expression can carry one: `viewport { kind = "viewport", width = it.size?.width }`.

A watch can miss a detached tree inserted into another tree: nothing in the inserted tree changes, a shadow root's changes reach no observation of the document, and only an observation of the tree it enters would report the insertion, a tree no watch can know of beforehand.

Each member that can miss one is partly observable for what it misses: `parent` and a node's `root` miss a detached tree inserted into another detached tree or into a shadow root, `attached` misses only a detached tree inserted into a shadow root in the document, and `shadow.elements` misses a detached tree holding the slot inserted into a shadow tree that assigns it nothing. A watch of one sees the tree a receiver entered at the next evaluation another change or a refresh causes, observing that tree from then on.

A detached tree inserted into the document, a node moved within or between trees a watch observes, and a detached node another document owns, as a template's content does, inserted into the document are each observed.

<a id="what-a-query-runs-against"></a>

## What a query runs against

A query is evaluated against a document, with each parameter it names bound to something in that document or to plain data. `panel` is not found by the query: it stands for the element the caller bound under the name `panel`, which is how a query reaches a particular element without a selector for it.

A query that names `panel` and `sentinel` is given those two elements, and fails to prepare when either is not bound. `domql.document` and `domql.window` need no binding, since they are always the document being queried and its window.

Conceptually, a caller supplies the query's text and the bindings, and gets back a result shaped like the query:

```text
result = evaluate(query, bindings: { panel: <the list panel>, sentinel: <the end marker> })
```

The bindings name only what the caller chooses. The complete query below also reads `domql.window` and `domql.document`, which are absent from them because they are the document the query runs against and its window, which no caller chooses; a caller's binding named `window` or `document` is read by that name, as any other binding is.

A caller can take that result once, keep it current as the document changes, or take one at each event the query subscribes to; how it asks for each is the [design](../docs/domql-design.md)'s to say. A value query is evaluated or watched alike; subscribing needs an event source, whose projection uses the same expression language.
