# Changelog

Each release of DOMQL's packages, newest first. The NuGet package `formaui-net.DOMQL` carries the runtime version, and the npm package `@formaui-net/domql` will carry the same once it is made. An entry names the version of DOMQL's specification the release implements, the Nexo language and definition format it runs on, and what changed in the implementation. What changed in DOMQL's contract is in the [version history](VERSION-HISTORY.md).

- **An entry is dated when its release is cut,** and reads *Unreleased* until then. [Cutting a release](CONTRIBUTING.md#cut-a-release) tags its commit, and its packages are published from that tag.
- **A change a caller can notice** is listed in the newest entry while it is unreleased. Once it is released, the change opens the next version's entry, and the sources declare that version in the same commit.

<a id="v1-0-0-beta-1"></a>

## `1.0.0-beta.1`

*Unreleased · specification `1.0.0-beta.2` · Nexo language `1.0.0-beta.40` · definition format 38*

- The first beta, and the first release. The [version history](VERSION-HISTORY.md) records what came before it.
- Runs on Nexo's language `1.0.0-beta.40`, as the [version history](VERSION-HISTORY.md#v1-0-0-beta-2) sets out: `and` and `or` typed where their value is used, a selection into a dictionary's `entries` and a pair's `key` and `value`, and a module's maintained members declaring nullable results, among the rest.
- A query declares its bindings' types, `domql.query(text, bindings, { types })`, so data binds as a module's structured type, a map as a dictionary and a set as a list; `DomqlQueryOptions` types the options.
- A class or a property an owned write keeps survives a framework rendering the element twice in quick succession, where the holder yielded to the second render and dropped it.
- A query's text keeps the resolutions of its 16 bindings used most recently, where each string an update bound for the first time kept one more, about 4 KB, for as long as the text was in use.
- An owned write that keeps its value keeps its one observer through its updates, about 4 µs an update less in Chromium.
