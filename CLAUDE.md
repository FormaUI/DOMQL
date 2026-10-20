# Working on DOMQL

DOMQL is a query language and JavaScript library for the DOM: reading information from the document, keeping it current, responding to events and updating the page's content or state. Its queries are written in Lexica, and DOMQL defines the DOM as Lexica's domain. A query only reads; the document changes only through an action or a behavior, each a request of its own kind that a module supplies. Source ES modules live in `src/`; the build produces one minified bundle, distributed by the `formaui-net.DOMQL` NuGet package.

## Before making a change

Read the documents that govern the affected contract:

| Document | Authority |
| --- | --- |
| [Lexica specification](https://github.com/FormaUI/Lexica/blob/main/spec/README.md) | The language, Lexica's, in its own repository: syntax, resolution, values, requests, vocabulary contracts, definitions and diagnostics |
| [DOMQL specification](spec/README.md) | DOMQL's module and DOMQL as host: queries, nodes and shadow trees, the built-in vocabulary, evaluation, watching, results, events, actions and behaviors, and the public API, one document per subject |
| [Lexica design](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-design.md) | How Lexica is built: its stages, registries, evaluation and tooling |
| [DOMQL design](docs/domql-design.md) | How DOMQL is built: its architecture, preparation, sessions, watching, comparing and patching, the C# half, and the decisions not taken |
| [Status](docs/status.md) | What is implemented, what is in progress, what remains, open decisions and deferred work |
| [Library guide](nuget/README.md) | Using DOMQL by example; it ships in the package, so it links absolutely |
| `.editorconfig` | Code style; read it before writing C# |

Update the specification before changing a contract, the vocabulary, the API or what an operation does, and the design before changing how DOMQL is built. Each subject has one home: state a rule where it belongs and link to it elsewhere; a rule of the language is Lexica's. Record a gap between the design and the code in the status overview until it closes, and update a row's status as soon as its work lands.

Use these sources rather than inventing scope, status or style rules.

## Repository structure

| Path | Responsibility |
| --- | --- |
| `src/domql.js` | Entry point that composes the library's modules |
| `src/dom/` | Evaluation, watches, events, actions, behaviors, observations, sessions and built-in implementations |
| `src/snapshots/` | Computing, comparing, dispatching and applying snapshot updates using identity metadata; no DOM access |
| `tests/` | Tests mirroring the source folders |
| `scripts/` | Bundling scripts |
| `spec/` | The specification, one document per subject, indexed by `spec/README.md` |
| `docs/` | The design and the status overview |
| `nuget/` | The package project, which distributes the bundle, and the library guide |
| `.local/` | Personal experiments, spikes, notes and benchmark baselines; ignored by Git |

Add a folder when a new responsibility needs one. Keep dependencies in this direction:

- `dom/` may depend on Lexica and `snapshots/`.
- `snapshots/` may depend on Lexica.

The language is [Lexica](https://github.com/FormaUI/Lexica), the package `@formaui/lexica`, which DOMQL imports by its name and depends on through `file:../formaui-net.Lexica`, a checkout beside this one, until a Lexica package is released. A change to the language is made there, and a change DOMQL needs of it in both repositories together.

Pass the window and document into DOM code; do not read globals there. Importing the language layer and resolving a query must work without a DOM.

## Implementation conventions

- Express one concept per module as a class. Supply collaborators through its constructor and use `#`-private implementation details. A family of pure helpers is a class with static members.
- Keep the entry point responsible for composition rather than re-exporting internal modules.
- Keep a module's registration separate from the instances it creates, as defined in the design.
- Use native modern browser APIs in `src/`, with no external runtime libraries or polyfills. Scripts are ES modules.
- Keep DOMQL independent of its consumers. Source code and documentation must not describe it as serving Forma, a component framework, Blazor or a consumer's watcher or engine. Mention FormaUI as publisher and Forma as a companion product only in package metadata and README introductions.
- Report failures at their origin as a `LexicaError` with a location. Never swallow a rejection.
- State each cache's validity and release conditions. Measure the work it saves.

### Names and types

Use names that explain their role in context. Short names are fine when their meaning is clear; rename only when the reader otherwise has to infer what they mean.

| Convention | Example or rule |
| --- | --- |
| Parameter names describe roles | `text`, `definition`, `bindings`; avoid naming by type alone |
| Keyed retrieval uses `getXxx(key)` | Applies whether or not the key may be absent |
| A value derived from a subject uses `xxxOf(subject)` | Judge by what the call means, not by storage details |
| Promise-returning operations end in `Async` | `evaluate` and `evaluateAsync`; no suffix on the synchronous form |
| Optional settings use `options` | Each setting has a default and the whole object may be omitted |
| Required inputs are separate parameters | For example, the handler passed to `subscribe` |
| Exported declaration names start with `Domql` | Lexica's own keep Lexica's names, as `LexicaError` does. Declare a class only when the bundle exports that class; otherwise use an interface for returned objects |
| Product and API names are consistent | `DOMQL` in prose, `Domql` in type names, `domql` for the exported object |
| Capability modules use a consistent suffix | `{Capability}DomqlModule` |

### Bundle and declarations

`scripts/bundle.mjs` uses esbuild to generate `nuget/wwwroot/domql.js`. Keep this minified bundle as small as the sources allow; it is generated and ignored by Git. esbuild is a development dependency and is not shipped in the package.

Maintain `src/domql.d.ts` by hand. The bundler copies it beside the bundle. Keep the bundle test and the TypeScript caller test passing so the published JavaScript and declarations agree.

## Tests and verification

Add or update a test for every source module changed. Test through `domql` and the objects it returns, asserting exact definitions, error kinds and locations. Avoid clock-based waits for work the test controls.

Tests mirror `src/` under `tests/`. Layout, geometry and browser-managed state belong in `*.browser.js` files beside the other tests for that code; happy-dom does not calculate layout. Files tests read or compile belong in underscore folders: `tests/_examples/` for README fixtures and their shared document, and `tests/_types/` for the TypeScript caller.

| Command | Run from | Purpose |
| --- | --- | --- |
| `npm test` | `tests/` | Unit tests |
| `npm run test:browser` | `tests/` | Headless Chromium tests |
| `npm run bench` | `tests/` | Benchmarks, outside the gate |
| `npm run scale` | `tests/` | A watch of 1,000 to 100,000 rows timed in Chromium, outside the gate |
| `./build.ps1` | Repository root | Tests, bundle, package build and format check |
| `./build.ps1 -Browser` | Repository root | Gate including browser tests |
| `./publish.ps1` | Repository root | Gate followed by package creation |

Every compiler warning is a build failure. Keep `*.bench.js` and `*.scale.js` beside the corresponding tests, store baselines in `.local/`, and record a measurement that decides something in the design, beside the decision it settles.

## Documentation and versions

The specification states the contract; the design explains how DOMQL is built to meet it. Avoid duplicating their contracts. Keep documentation examples valid and checked by the parser. Comments and summaries state what a thing is, rather than narrating how or why it was implemented.

Use these version rules:

- Package version: `1.0.0-alpha.N`, where N is the number of commits in the build's history. The package project counts it once and passes it to bundling.
- `domql.info.version` reports that package version. Packing rejects a bundle with a different version. Running from source reports `1.0.0-alpha+source`.
- Specification version: `1.0.0-alpha`. Keep the specification title, design title, `Specification.mjs` and `domql.info.specificationVersion` aligned. Preserve the version-alignment test.

## Review and Git

Keep changes focused on the requested work. Present each piece for review and iterate until the maintainer considers it complete.

Leave finished changes unstaged. Report what changed, the build gate's result and any checks you could not run. Propose a commit message for the maintainer to use.

Ask for permission before each state-changing Git command, once the work is ready to review. This includes `add`, `commit`, `push`, `reset`, `restore`, `stash` and path-scoped `checkout`.

## Commit messages

Describe the durable change, not the session that produced it. Follow the format in [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages).

- Make the title cover the whole commit. Split unrelated work when one honest title cannot cover it.
- Add a body only when the title needs context.
- Explain the resulting change; omit implementation narration, file or member inventories, test counts and routine verification.
- Do not add attribution trailers such as `Co-Authored-By`.
