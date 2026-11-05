# Contributing to DOMQL

Thanks for helping improve DOMQL. Bug reports, documentation fixes and code contributions are welcome.

For a small fix, you can open a pull request into `dev` directly. For a larger change, open an issue first so we can agree on the approach before you spend time implementing it. Until 1.0, DOMQL takes fixes rather than features, as [what 1.0 requires](docs/features-status.md#what-1-0-requires) sets out. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Set up

DOMQL is a JavaScript library. A small .NET project builds its NuGet package.

You'll need:

- Node.js and npm.
- PowerShell to run the build scripts.
- The .NET SDK pinned in `nuget/global.json`.

DOMQL is written in [Nexo](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/README.md), which it builds against at the release `nexo.release` pins, taken from its tag in a checkout of [FormaUI/Nexo](https://github.com/FormaUI/Nexo) beside this one, until it consumes a published package. Clone it beside this repository under the name the build looks for:

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

The [Nexo specification](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/spec/README.md) defines the language and its runtime, and the [DOMQL specification](spec/README.md) the DOM vocabulary, how queries are carried out, and the public API. The [Nexo design](https://github.com/FormaUI/Nexo/blob/v1.0.0-preview.1/docs/nexo-design.md) and the [DOMQL design](docs/domql-design.md) set out how each is built. If a change affects either contract, update the relevant document before implementing it. The [status overview](docs/features-status.md) tracks what is implemented, what is being built, and what remains.

## Develop a change

Keep each change focused, and follow the surrounding code's conventions. Use `.editorconfig` for formatting and style.

A change lands on `dev`, from a branch of its own, `feature/<name>` or `fix/<name>`, as [landing work](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/branches.md#landing-work) sets out; `main` holds the latest release, and advances only by promotion.

Since DOMQL's beta, two rules hold for a change its callers can notice:

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

For performance changes, run `npm run bench` from `tests/` for simulated-DOM benchmarks and `npm run scale` for Chromium workloads: a watch of 1,000 to 100,000 rows, a drag through owned writes, an edit in a large editor, a behavior's deliveries and owners, and transient measurements beside many observers. Name a file to run one workload, as `npm run scale -- dom/OwnedWrites.scale.js`; each reports the machine's load as it ran, its own included, so compare runs made at a low load alone. Compare against a baseline, keep gains that repeat beyond measurement noise, and record a conclusion that decides something in the [design](docs/domql-design.md), beside the decision it settles. Report the memory a change retains apart from what it allocates: a bound can slow a case's allocation and still end growth that outlived disposal, as [D84](docs/decisions.md#d84) did. Benchmarks are separate from the build gate.

<a id="versions-and-releases"></a>

## Versions and releases

DOMQL follows [FormaUI Versioning `v1.0.0-preview.1`](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/README.md), the rules every FormaUI project versions, branches, commits, releases and packages by. DOMQL states here what those rules leave to a project.

**The public contract,** which the [stages](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/versions.md#stages)' promises cover:

- the [specification](spec/README.md): the DOM's vocabulary, the module that declares it, and DOMQL as the host that carries queries out, one document per subject;
- the runtime's API, as the specification's [API](spec/api.md) states it and `src/domql.d.ts` declares it.

The language a query is written in is Nexo's, and its contract is Nexo's.

**The versions,** each declared once, in `src/Versions.mjs`:

| Version | Declared as | What carries it | Its history |
| --- | --- | --- | --- |
| The package version | `runtime` | The package, the bundle, the release's tag and `domql.info.versions.runtime` | The [changelog](CHANGELOG.md) |
| The specification version | `specification` | DOMQL's contract, the [specification](spec/README.md) | The [version history](VERSION-HISTORY.md) |
| The language version | `language`, read from the Nexo runtime DOMQL runs on | Nothing of DOMQL's: it names the Nexo language DOMQL runs on, the release `nexo.release` pins | Nexo's |

**The gates.** The fast gate, `./build.ps1 -Browser`, runs the tests, the tests in a real browser, the bundle, the package project's build with no warnings and the format check. The full gate, `./build.ps1 -Browser -Full`, runs it, then packs the package and its symbols into `artifacts/`, checks each holds exactly the files its list in `scripts/packages/` names, and installs the package outside the repository from a local feed into a web application whose published `domql.js` resolves a query.

**The workflows:**

| Workflow | Runs on | What it does |
| --- | --- | --- |
| `ci.yml` | Every push but `main`'s, and every pull request | The fast gate, and on a push to `candidate` the full gate, which keeps the packages it verified as its `packages` artifact |
| `promotion.yml` | A pull request into `main` | The [promotion check](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/releases.md#promotion) |
| `release.yml` | A `v*` tag's push, in the `release` environment, which only `v*` tags deploy to | The [release check](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/releases.md#the-release-check), then the full gate's packages attached to the tag's GitHub release with their digests, and the NuGet package published through trusted publishing |

`dev` and `main` require `ci.yml`'s `Gate`, and `main` the `Promotion` check too.

**The packages:**

| Package | What it holds | Its targets | Its feed | Depends on |
| --- | --- | --- | --- | --- |
| NuGet, `formaui-net.DOMQL` | The bundle, `domql.js`, with Nexo inside it, and its declarations, served at `_content/domql/`, with the README, license and notice, as `scripts/packages/nuget.files` lists them, and its symbols beside it, as `scripts/packages/nuget-symbols.files` lists them | `net11.0` applications | nuget.org | Nothing: it carries the Nexo release `nexo.release` pins inside its bundle |

DOMQL publishes no npm package yet: `package.json` is private, and the npm package waits for DOMQL to consume Nexo's published packages, as the status's [packages](docs/features-status.md#packages) set out. A package of DOMQL's that depends on Nexo's names the lowest Nexo version DOMQL works with.

The [changelog](CHANGELOG.md) records each release, and the [version history](VERSION-HISTORY.md) each specification version, by their own rules.

<a id="cut-a-release"></a>

## Cut a release

A release is a candidate that passed its full gate, promoted to `main` and tagged there, as [FormaUI Versioning's releases](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/releases.md) set out. Publishing its package is the step after it.

1. **Set the release on `dev`.** Pause merges unrelated to it, as [stabilizing a candidate](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/branches.md#stabilizing-a-candidate) sets out. Check that `src/Versions.mjs` declares the release's version and `nexo.release` the Nexo release it builds against, date the changelog's newest entry by the day of the release, and date the version history's newest entry where it reads *Unreleased*.
2. **Select the candidate.** Fast-forward `candidate` to `dev`'s tip, `git push origin dev:candidate`. `ci.yml` runs the full gate on it. A fix lands on `dev`, and `candidate` moves to the corrected tip.
3. **Promote it.** Open a pull request from `candidate` into `main`, which `promotion.yml` checks. Once the check passes, a release signer fast-forwards `main` to it, `git push origin candidate:main`.
4. **Tag it.** A release signer tags `main`'s commit with an annotated, signed tag, `git tag -s v1.0.0-preview.1 -m "DOMQL 1.0.0-preview.1"`, and pushes it, `git push origin v1.0.0-preview.1`. A pushed tag is never moved or deleted.
5. **Publish it.** The tag's push runs `release.yml`, which publishes the package. A run that fails runs again for the same tag, and publishes what the feed lacks.

After a release, the next change a caller can notice opens the changelog's next entry, and the next change to DOMQL's contract the version history's, as [advancing a version](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/versions.md#advancing-a-version) sets out.

## Before opening a pull request

Run `./build.ps1` from the repository root. This is the build gate: it runs tests, bundles the library, builds the package without warnings and checks formatting. Include the browser tests when your change affects browser behavior. CI runs the gate with browser tests on Linux for every pull request and every push but `main`'s, and the full gate on a push to `candidate`.

In your pull request, explain the problem, the resulting behavior and how you verified the change. Mention any related issue and any checks you could not run.

## Commit messages

Write each commit as [FormaUI Versioning's commits](https://github.com/FormaUI/Versioning/blob/v1.0.0-preview.1/docs/commits.md) set out: one purpose, passing the gate on its own, its message a Conventional Commit, `type(domql): description`, with no attribution trailer.

## Report a bug

A useful bug report includes:

- The DOMQL version and browser or DOM environment.
- The query and bindings, with a minimal document that reproduces the problem.
- The result you expected and the result or error you received.
- Reproduction steps, including relevant DOM changes if the issue involves a watch.

Please remove private data from examples. For a possible vulnerability, use the private reporting channels in [SECURITY.md](SECURITY.md).
