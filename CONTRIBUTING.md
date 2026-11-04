# Contributing to DOMQL

Thanks for helping improve DOMQL. Bug reports, documentation fixes and code contributions are welcome.

For a small fix, you can open a pull request directly. For a larger change, open an issue first so we can agree on the approach before you spend time implementing it. Until 1.0, DOMQL takes fixes rather than features, as [what 1.0 requires](docs/features-status.md#what-1-0-requires) sets out. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Set up

DOMQL is a JavaScript library. A small .NET project builds its NuGet package.

You'll need:

- Node.js and npm.
- PowerShell to run the build scripts.
- The .NET SDK pinned in `nuget/global.json`.

DOMQL is written in [Nexo](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/README.md), which it builds against at the release `nexo.release` pins, taken from its tag in a checkout of [FormaUI/Nexo](https://github.com/FormaUI/Nexo) beside this one, until it consumes a published package. Clone it beside this repository under the name the build looks for:

```sh
git clone https://github.com/FormaUI/Nexo.git formaui-net.Nexo
```

After cloning the repositories, run the build, which extracts the pinned Nexo into `.nexo`, installs the dependencies and runs the unit tests:

```sh
pwsh ./build.ps1
```

To work on Nexo and DOMQL together, set `NEXO_SOURCE` to a Nexo checkout, and the build links `.nexo` to its working tree; unset it to build against the pinned release again.

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
| `VERSION-HISTORY.md` | Each DOMQL version and what it changed |
| `CHANGELOG.md` | Each release of the packages and what it changed |

The [Nexo specification](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/README.md) defines the language and its runtime, and the [DOMQL specification](spec/README.md) the DOM vocabulary, how queries are carried out, and the public API. The [Nexo design](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/docs/nexo-design.md) and the [DOMQL design](docs/domql-design.md) set out how each is built. If a change affects either contract, update the relevant document before implementing it. The [status overview](docs/features-status.md) tracks what is implemented, what is being built, and what remains.

## Develop a change

Keep each change focused, and follow the surrounding code's conventions. Use `.editorconfig` for formatting and style.

Since DOMQL entered its beta, two rules hold for a change its callers can notice:

- **A break says how to migrate.** A version that breaks what the one before it allowed says how to migrate, beside the break, in its entry in the [version history](VERSION-HISTORY.md).
- **A change a caller can notice is listed** in the [changelog](CHANGELOG.md), by its rules.

Add or update tests for every source module you change. Test through the public API where possible, and place tests beside the corresponding source responsibility under `tests/`.

Choose the test environment that can verify the behavior:

| What you are testing | Where it belongs |
| --- | --- |
| Structure, attributes and other behavior that needs no layout | The simulated-DOM unit tests |
| Layout, geometry or browser-managed state | A `*.browser.js` file, run in headless Chromium |
| What browser engines decide differently, as where a focus event inside a shadow root reaches or where a box's scroll origin lies | A `*.browser.js` file named in `tests/vitest.engines.config.js` too, run in Chromium, Firefox and WebKit |
| Files read or compiled by tests | An underscore folder, such as `tests/_examples/` or `tests/_types/` |

The simulated DOM does not calculate layout. Run browser tests from the repository root with:

```powershell
./build.ps1 -Browser
```

You can also run `npm run test:browser` from `tests/`, and `npm run test:engines` for the tests run in each engine.

Two details to keep in mind:

- **Module registration persists.** A test that registers a module needs its own `domql` instance. Call `vi.resetModules()` and import it afresh so tests remain independent of execution order.
- **README examples are tested.** When you change an example in the package guide, update its fixture in `tests/_examples/` and the answer `tests/PackageReadme.test.js` expects. The repository README's examples run as they are written.

For performance changes, run `npm run bench` from `tests/` for simulated-DOM benchmarks and `npm run scale` for Chromium workloads with 1,000 to 100,000 rows. Compare against a baseline, keep gains that repeat beyond measurement noise, and record a conclusion that decides something in the [design](docs/domql-design.md), beside the decision it settles. Benchmarks are separate from the build gate.

<a id="cut-a-release"></a>

## Cut a release

A release is a signed tag on the commit that dates it. The [changelog](CHANGELOG.md) says what each release changed in the implementation, and the [version history](VERSION-HISTORY.md) what each specification version changed in DOMQL's contract.

1. Date the changelog's newest entry by the day of the release, and the version history's newest entry where it reads *Unreleased*.
2. Pass the gate, `./build.ps1 -Browser`, and commit.
3. Tag the commit with a signed tag named for the release, as `git tag -s v1.0.0-beta.1`, and push the tag.
4. Pack the packages from the tag with `./publish.ps1`, and publish them.

After a release, the next change a caller can notice opens the changelog's next entry, and the next change to DOMQL's contract the version history's.

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
