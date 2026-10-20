# DOMQL

**A declarative approach to managing the DOM.**

DOMQL is a query language and JavaScript library for the DOM. Use it to read information from the document, keep it current, respond to events and update the page's content or state. Its queries are written in [Lexica](https://github.com/FormaUI/Lexica), a general-purpose, embeddable language that lets applications define their own domain. DOMQL defines the DOM as that domain, and adds the observation, watching and events that follow it as it changes.

DOMQL is a FormaUI product, developed alongside [Forma](https://github.com/FormaUI/Forma). It stands on its own and works independently of any UI framework.

> **Alpha.** DOMQL reads Lexica's definition version 31, which writes the implicit parameter `context`; its specification describes version 32, which writes `it` and reads `domql.document` and `domql.window`. It is not yet published to npm or NuGet; you can [build and try it locally](#build-and-try-it). See [the status overview](docs/status.md).

## Features

- Queries that shape DOM and browser state into plain data
- Projections, filters and summaries of collections
- Watches that keep a result current, as snapshots or live state
- Optional access, fallbacks and conditionals
- Locals, functions and calculations
- Strings, interpolation, conversions and casts
- Shadow trees crossed explicitly
- Event subscriptions projected into data
- Typed extension modules: members, observations, actions and behaviors
- Validation before anything is evaluated
- Definitions as JSON
- One ES module with TypeScript declarations

## Your first query

Suppose a panel contains three items:

```html
<div id="panel">
    <div data-key="a1"></div>
    <div data-key="a2" aria-selected="true"></div>
    <div data-key="a3"></div>
</div>
```

This query reads the item count and each item's key and selection state:

```js
import { domql } from './src/domql.js';

const panel = document.getElementById('panel');

const query = domql.query(`
    panel {
        count = context.children.count,
        items = context.all("[data-key]") {
            key = context:["data-key"],
            selected = context.aria:["selected"] == "true"
        }
    }
`, { panel });

const snapshot = query.evaluate();
```

The result is plain data:

```json
{
    "count": 3,
    "items": [
        { "key": "a1", "selected": false },
        { "key": "a2", "selected": true },
        { "key": "a3", "selected": false }
    ]
}
```

Inside each object expression, `context` is the current element, and the field names you write become the result's. A snapshot is immutable and holds no live DOM reference, so evaluating again gives a new one and leaves the old one as it was:

```js
// Your app, a UI library or the user changes the page; DOMQL only reads it.
panel.children[0].setAttribute('aria-selected', 'true');

const next = query.evaluate();

console.log(next.items[0].selected);     // true
console.log(snapshot.items[0].selected); // false
```

The source import above works when serving the repository; the [library guide](nuget/README.md#install-and-load) loads the packaged bundle, and goes on to watching, events, the language and extensions.

## How DOMQL differs from jQuery

| | jQuery | DOMQL |
| --- | --- | --- |
| Main abstraction | Element collections with methods | Typed requests |
| Reading data | JavaScript assembles the result | A query describes the result |
| Keeping data current | Application code repeats its reads | A watch tracks declared observations |
| Events | Handlers work with events | Subscriptions project events into data |
| Changing the page | DOM manipulation methods | Module-defined actions and behaviors |
| Extension | Plugins | Typed vocabulary modules |

## Documents

| Document | What it holds |
| --- | --- |
| [Library guide](nuget/README.md) | Install DOMQL, learn the language by example and use the API |
| [DOMQL specification](spec/README.md) | The DOM's nodes and shadow trees, the built-in vocabulary, and how a query is evaluated and watched |
| [Lexica specification](https://github.com/FormaUI/Lexica/blob/main/spec/README.md) | The language DOMQL is written in |
| [Design](docs/domql-design.md) | How the runtime works, and its API |
| [Status](docs/status.md) | What is implemented, what is being built, and what remains |
| [Contributing](CONTRIBUTING.md) | Report a bug, develop a change and run the checks |
| [Security](SECURITY.md) | Report a vulnerability privately |

## Build and try it

Clone the repository. You'll need Node.js with npm, PowerShell and the .NET SDK pinned in `nuget/global.json`; [CONTRIBUTING.md](CONTRIBUTING.md#set-up) has the details.

```powershell
./build.ps1           # The build and the checks
./build.ps1 -Browser  # With the real-browser tests
./publish.ps1         # A local NuGet package, in artifacts/
```

The package supplies the bundle at `_content/domql/domql.js`, with its TypeScript declarations beside it.

## License

[Apache-2.0](LICENSE).
