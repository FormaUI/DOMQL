# Results

<a id="results"></a>
<a id="snapshots-live-state-and-change-sets"></a>

A query's **result** is data: an evaluation answers it once, and a watch reports it again each time it differs. A watch hands its caller snapshots or live state, as its update strategy says, and every update it delivers after the first is relative to the one before it:

| Concept | Is |
| --- | --- |
| Snapshot | An immutable result captured at one moment |
| Live state | A stable object a JavaScript caller holds, updated in place by the change sets between snapshots |
| Baseline | A complete result, establishing the state the changes after it are relative to |
| Change set | The fields and list entries that changed, relative to the result it was computed against |

```js
const live = domql.query(`
    list.children {
        key = it["data-key"],
        selected = it.aria["selected"] == "true"
    }
`, { list }).watch({ updateStrategy: "liveState" });

live.subscribe("change", (sender, args) => {
    if (args.status === "ready") {
        patchList(args.changes); // [{ op: "replace", path: "/1/selected", value: true }] once the second item is selected.
    }
});
```

In this document:

1. [Snapshots](#results-snapshots)
2. [Change sets](#results-change-sets)
3. [Live state](#live-state)
4. [Comparing snapshots](#comparing-snapshots)
5. [Dictionaries and pairs](#results-collections)
6. [Keeping a copy of a result](#results-keeping-a-copy)

<a id="results-snapshots"></a>

## Snapshots

A snapshot never changes once delivered. A new snapshot reuses every immutable branch that did not change and builds new ones only along the paths that did. Live state is the one value that changes under its holder: reading it at two moments can give two results, so it is chosen explicitly and is never a snapshot. Live state is brought up to date by change sets, and each one it applies reaches its caller beside it.

<a id="results-change-sets"></a>

## Change sets

- **What a change set is.** A change set is a [JSON Patch](https://www.rfc-editor.org/rfc/rfc6902) document limited to `replace`, `add`, `remove` and `move`, whose paths are JSON Pointers into the result; applying it to the result it was computed against gives the new result. A field the change set leaves out is unchanged, and a field that became null is replaced with null. An object expression's fields are fixed, so `add` and `remove` apply to list items alone.
- **Lists.** A list whose items descend from elements changes by element: an element entering is added, one leaving is removed, one changing position is moved, and one whose result changed is changed inside its item. Any other list changes by position.
- **Identity.** Two elements can project to the same data, so the identity of each item cannot be read back from a snapshot. Each item is matched by the reference it descends from, its provenance, which Nexo's [result metadata](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/runtime/evaluation.md#runtime-results-provenance) records beside the result and which neither a result nor a change set ever holds: the source the earliest projection the item descends from read, which Nexo classifies as a reference or as data. A list projected from elements is matched by element, and so are a projection of its items and a list filtered, sliced or ordered from it, each by the element its item first came from.
- **Matched by position.** A list no projection built, one an item of which descends from data or from null, and one in which an element stands twice, are matched by position. DOMQL reads the classification Nexo reports, never inferring a reference from the value.
- **What a change set reproduces.** A change set takes the result it was computed against to the reconciled snapshot, the one the watch reports, with every comparison and tolerance applied; it never describes a different, raw evaluation.

<a id="results-composing"></a>

- **Composing.** Each change set is computed against the snapshot of the event before it, and is applied one operation after another, as JSON Patch applies a document. So the change sets of consecutive events, concatenated in order, are one change set: it takes the snapshot the first was computed against to the last one's snapshot. Each item stays matched by its source throughout, since an operation of a later change set reaches the item where the ones before it left it.

Evaluating only what changed and delivering only what changed are separate: a watch that evaluates its whole query still hands live state only the changes in its result.

<a id="live-state"></a>

## Live state

A watch keeps its result as live state when its caller chooses it as its update strategy, `updateStrategy: 'liveState'`, beside `snapshot`, so a watch delivers one kind of update.

- **What its event carries.** A ready `"change"` event carries `liveState`, the live object, the same one at every event; `snapshot`, the immutable snapshot the object was brought to; and `changes`, the change set just applied to it, computed against the snapshot the object was last brought to, immutable too. A handler that renders the whole object ignores the changes; one that patches a view of its own reads them. A listener's first ready event is its baseline: the object as it is, and an empty change set.
- **`args.snapshot` and `sender.snapshot`.** `args.snapshot` is the snapshot that event delivered; `sender.snapshot` is the watch's snapshot now, which may have moved on before queued work reads it. A caller that forwards the snapshot and the changes keeps them as they are, without copying them.
- **What keeps its identity.** The root, and every object and list beneath it while its path holds an object or a list: a field that changes is set on the object that holds it, an item added, removed or moved changes the list in place, and an item of a list projected from elements keeps its object as it moves, as change sets move it by element. A branch is a new object only where its value stops being one, as when a field turns from an object to null and back.
- **What it can hold.** The result must be an object or a list that is not nullable, since null has no identity to keep; a watch over another result is refused with a validation error that suggests a top-level object expression. Its values are data, as every result is.
- **Ownership.** The object belongs to the watch, which writes it; a caller reads it and never writes it, and the declarations type it as read-only. It is not frozen, since the watch updates it, and a caller that keeps a version copies it or keeps its snapshot.
- **Timing and failure.** Each change set is applied whole before its event is raised, in the evaluation that produced it. A failed evaluation leaves the object as it was, raises a failed `"change"` event and sets the status to `failed`; the next successful one brings the object up to date in one change set. A watch disposed stops changing the object, and its caller keeps it as it last was.
- **The handle.** `watch.liveState` is the live object, `undefined` before the first result, and `snapshot` answers the immutable snapshot as a snapshot watch's does.

<a id="comparing-snapshots"></a>

## Comparing snapshots

A watch reports a snapshot that differs from the last one it reported, compared field by field and item by item. Strings, Booleans and null compare exactly; a number compares within the tolerance its member declares, and exactly where it declares none; a number arithmetic computed compares exactly, whatever tolerance a member it reads declares.

A number a conditional gave compares within the tolerance of the member its branch read where the number last reported came from the same branch, and exactly where it came from another, which is a different reading whose difference no tolerance absorbs. A number a coalescing operator gave compares the same way, by the side it came from, its value or its fallback, one an `and` or an `or` gave by the operand it answered, and one a computed property access gave by the property its name selected. A conditional can select a different branch at each place in the result, as for each item of a list, and each place is compared by the branch selected there.

<a id="results-collections"></a>

## Dictionaries and pairs

A result holds a dictionary or a pair as data, in the form Nexo [exports](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/runtime/evaluation.md#runtime-host-forms) them: a dictionary as `{ entries: [{ key, value }, …] }`, its entries in their order, and a pair as `{ key, value }`.

- **Compared and changed as data.** A watch compares them as it compares any object and list, and a change set addresses them in that form: an entry's value is changed at `/counts/entries/0/value`, and an entry entering or leaving is added or removed at its position in `entries`.
- **A key is data.** A numeric key is an entry's `key`, never a list index, and a change set reaches an entry by its position in `entries`, never by its key. A [selection](queries.md#selecting-a-result) takes a dictionary or a pair whole.
- **Every change set reproduces the next result** from the one it was computed against, the dictionary's entries in the order the next result holds them.

<a id="results-keeping-a-copy"></a>
<a id="domql-and-its-host"></a>

## Keeping a copy of a result

DOMQL owns the semantics every caller shares: evaluation, dependency recording, observation, snapshots, live state, and the change sets that describe updates to that state, their format and the rules for applying them. A caller that keeps its own representation of a result, as one across an interop boundary does, owns its transport, its reconnection and who owns a watch, and maintains that representation by applying a watch's change sets in order, by DOMQL's rules: each change set is applied completely before the updated result is exposed. Where it can no longer establish that its result is synchronized, it discards that result and starts a fresh watch, whose first delivery carries the complete result as its baseline, from which it rebuilds its own. It implements the application of change sets, never deciding for itself what changed or applying one by rules of its own, and DOMQL does not know what a connection is.

<a id="results-coalescing"></a>

**Coalescing.** A caller that keeps one delivery in flight sends what accumulated meanwhile as one change set, in either of two ways:

| Sends | Is | Costs |
| --- | --- | --- |
| The change sets of the events since the receiving side's last acknowledged state, concatenated in order | One change set from that state to the latest snapshot, its items matched by their sources, as [composing](#results-composing) sets out | Grows with the changes, never with the result |
| The latest event's snapshot whole, as one operation replacing the root, `[{ op: "replace", path: "", value: snapshot }]` | A new baseline, which the receiving side applies as it applies any change set | The whole result, however little changed |

Either is a change set, applied completely before the updated result is exposed, so the receiving side needs no rule of its own for it. The caller chooses between them by size alone.
