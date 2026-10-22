# Contributing to DOMQL

Thanks for helping improve DOMQL. Bug reports, documentation fixes and code contributions are welcome.

For a small fix, you can open a pull request directly. For a larger change, open an issue first so we can agree on the approach before you spend time implementing it. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Set up

DOMQL is a JavaScript library. A small .NET project builds its NuGet package.

You'll need:

- Node.js and npm.
- PowerShell to run the build scripts.
- The .NET SDK pinned in `nuget/global.json`.

DOMQL is written in [Lexica](https://github.com/FormaUI/Lexica), which it builds against at the commit `lexica.commit` pins, taken from a checkout beside this one, until a Lexica package is released. Clone both into one folder, `formaui-net.Lexica` beside `formaui-net.DOMQL`.

After cloning the repositories, run the build, which extracts the pinned Lexica into `.lexica`, installs the dependencies and runs the unit tests:

```sh
pwsh ./build.ps1
```

To work on Lexica and DOMQL together, set `LEXICA_SOURCE` to a Lexica checkout, and the build links `.lexica` to its working tree; unset it to build against the pinned commit again.

Run the full build from the repository root:

```powershell
./build.ps1
```

## Find your way around

| Location | Contents |
| --- | --- |
| `src/dom/` | DOM evaluation, observations, watches, events, executions and the dispatch table of host calls |
| `src/snapshots/` | Snapshot comparison and updates |
| `tests/` | Tests arranged to match the source folders |
| `scripts/` | Bundling scripts |
| `nuget/` | Package project and library guide |
| `spec/` | The specification, split by subject, with its index |
| `docs/` | The design and the status overview |

The [Lexica specification](https://github.com/FormaUI/Lexica/blob/main/spec/README.md) defines the language and its runtime, and the [DOMQL specification](spec/README.md) the DOM vocabulary, how queries are carried out, and the public API. The [Lexica design](https://github.com/FormaUI/Lexica/blob/main/docs/lexica-design.md) and the [DOMQL design](docs/domql-design.md) set out how each is built. If a change affects either contract, update the relevant document before implementing it. The [status overview](docs/features-status.md) tracks what is implemented, what is being built, and what remains.

## Develop a change

Keep each change focused, and follow the surrounding code's conventions. Use `.editorconfig` for formatting and style.

Add or update tests for every source module you change. Test through the public API where possible, and place tests beside the corresponding source responsibility under `tests/`.

Choose the test environment that can verify the behavior:

| What you are testing | Where it belongs |
| --- | --- |
| Structure, attributes and other behavior that needs no layout | The simulated-DOM unit tests |
| Layout, geometry or browser-managed state | A `*.browser.js` file, run in headless Chromium |
| Files read or compiled by tests | An underscore folder, such as `tests/_examples/` or `tests/_types/` |

The simulated DOM does not calculate layout. Run browser tests from the repository root with:

```powershell
./build.ps1 -Browser
```

You can also run `npm run test:browser` from `tests/`.

Two details to keep in mind:

- **Module registration persists.** A test that registers a module needs its own `domql` instance. Call `vi.resetModules()` and import it afresh so tests remain independent of execution order.
- **README examples are tested.** When you change an example in the package guide, update its fixture in `tests/_examples/` and the answer `tests/PackageReadme.test.js` expects. The repository README's examples run as they are written.

For performance changes, run `npm run bench` from `tests/` for simulated-DOM benchmarks and `npm run scale` for Chromium workloads with 1,000 to 100,000 rows. Compare against a baseline, keep gains that repeat beyond measurement noise, and record a conclusion that decides something in the [design](docs/domql-design.md), beside the decision it settles. Benchmarks are separate from the build gate.

## Before opening a pull request

Run `./build.ps1` from the repository root. This is the build gate: it runs tests, bundles the library, builds the package without warnings and checks formatting. Include the browser tests when your change affects browser behavior. CI runs the gate with browser tests on Linux for every pull request and push to `main`.

In your pull request, explain the problem, the resulting behavior and how you verified the change. Mention any related issue and any checks you could not run.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org): `type(scope): description`.

Keep the subject under 50 characters. Add a body when the change needs context, wrap it at 72 characters, and explain what changes for the user and why. Avoid a file-by-file account of the implementation. Each commit should cover one coherent change and pass the build on its own. Leave out attribution trailers.

## Report a bug

A useful bug report includes:

- The DOMQL version and browser or DOM environment.
- The query and bindings, with a minimal document that reproduces the problem.
- The result you expected and the result or error you received.
- Reproduction steps, including relevant DOM changes if the issue involves a watch.

Please remove private data from examples. For a possible vulnerability, use the private reporting channels in [SECURITY.md](SECURITY.md).
