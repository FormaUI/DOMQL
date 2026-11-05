# Changelog

Each release of DOMQL's packages, newest first. The npm package `@formaui-net/domql` and the NuGet package `formaui-net.DOMQL` carry the runtime version. An entry names the version of DOMQL's specification the release implements, the Nexo language and definition format it runs on, and what changed in the implementation. What changed in DOMQL's contract is in the [version history](VERSION-HISTORY.md).

- **An entry is dated when its release is cut,** and reads *Unreleased* until then. [Cutting a release](CONTRIBUTING.md#cut-a-release) tags its commit, and its packages are published from that tag.
- **A change a caller can notice** is listed in the newest entry while it is unreleased. Once it is released, the change opens the next version's entry, and the sources declare that version in the same commit.

<a id="v1-0-0-preview-2"></a>

## `1.0.0-preview.2`

*Unreleased · specification `1.0.0-preview.1` · Nexo language `1.0.0-preview.1` · definition format 38*

- DOMQL is published to npm, as `@formaui-net/domql`: its ES module sources and their declarations, which import Nexo from its own package, `@formaui-net/nexo`, from `1.0.0-preview.1` on. A host that installs both loads one Nexo, and catches Nexo's own `NexoError`. Install it with `npm install @formaui-net/domql@preview`.

<a id="v1-0-0-preview-1"></a>

## `1.0.0-preview.1`

*November 5, 2026 · specification `1.0.0-preview.1` · Nexo language `1.0.0-preview.1` · definition format 38*

- The first preview, and the first release, as [FormaUI Versioning's stages](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/versions.md#stages) name it: the runtime and the specification take `1.0.0-preview.1`, with the beta's promise. The [version history](VERSION-HISTORY.md) records what came before it.
- The NuGet package links its release notes to its changelog entry at its tag, records its repository and commit through Source Link, and ships its symbols beside it as a `.snupkg`. It no longer holds the build's `global.json`, which it delivered to a consumer as content.
- Runs on Nexo's language `1.0.0-preview.1`, from Nexo's release `1.0.0-preview.1`, as the [version history](VERSION-HISTORY.md#v1-0-0-preview-1) sets out: `and` and `or` typed where their value is used, a selection into a dictionary's `entries` and a pair's `key` and `value`, a module's maintained members declaring nullable results, the members that make a value of their receiver called as functions, `round()` and `trim()` among them, and an empty line before a body's `return` in `domql.format`'s text, among the rest.
- Each state DOMQL declares is a Boolean property, read without a call, `it.checked`, where it was a function, `it.checked()`. An element's `hover` and `focus`, the document's `focus`, and the window's `share` and `clipboard` are `hovered`, `focused`, `canShare` and `hasClipboard`.
- Each built-in execution is named by its verb: `takeFocus`, `writeClipboard`, `readClipboard`, `writeValue` and `writeSelection` are `focus`, `writeToClipboard`, `readFromClipboard`, `replaceValue` and `select`, and `writeMuted(muted)` and `writeIndeterminate(indeterminate)` are `mute()` and `unmute()`, and `markIndeterminate()` and `clearIndeterminate()`.
- A watch of `focused`, `focusWithin`, `activeElement` or a selector testing focus follows the focus moving inside an open shadow root, and the focused element removed, in every engine.
- A scroll of a reversed flex container goes into its content from an offset of 0, and `scroll` holds an offset within its range during an elastic overscroll.
- A query runs directly, in one call, as a query object runs it: `domql.evaluate`, `evaluateAsync`, `watch`, `executeAsync` and `run` take the request, its bindings and their options, the query's `types` among them, and `domql.subscribe` its handler after the bindings.
- A query declares its bindings' types, `domql.query(text, bindings, { types })`, so data binds as a module's structured type, a map as a dictionary and a set as a list; `DomqlQueryOptions` types the options.
- A class or a property an owned write keeps survives a framework rendering the element twice in quick succession, where the holder yielded to the second render and dropped it.
- A query's text keeps the resolutions of its 16 bindings used most recently, where each string an update bound for the first time kept one more, about 4 KB, for as long as the text was in use.
- An owned write that keeps its value keeps its one observer through its updates, about 4 µs an update less in Chromium.
- A transient measurement drains only the mutation observers that could record its class's change, rather than every one its window runs: beside a watch of 10,000 rows, an observer a row, a measurement takes about 50 µs in Chromium rather than 2 ms, and allocates 0.6 KB rather than 1.4 MB.
- An occurrence no subscription hears, and one a throttle drops, rejects with an error made once rather than one each time: a pointer move no subscription hears takes about 0.2 µs in Chromium rather than 14, and one a throttled subscription hears about 3 µs rather than 16.
- An update of a continuous execution finds where its call stands only where a failure, or an instance it starts, names it: an owned write's update binding a number takes about 1 µs and 220 bytes less in Chromium.
- An occurrence one subscription hears answers that subscription's acknowledgment rather than joining a list of one, about 0.5 µs and 450 bytes an occurrence less in Chromium.
