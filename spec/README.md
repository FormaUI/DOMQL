# DOMQL Specification v1.0.0-beta.2

DOMQL reads the DOM and shapes what it reads as data, keeps that data current as the document changes, delivers the page's events as data, and carries out the executions its own module and its extensions declare. Its queries are scripts written in [Nexo](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/README.md), whose specification holds two contracts: the language's, what a script means, and the runtime's, how a host binds, resolves and evaluates a script. DOMQL declares the DOM as Nexo's domain, in a module like any other, and is the host that carries each query out against a document. It adds no language rule: a rule of the language or of its runtime is Nexo's, and this specification links to it.

This specification is the authoritative contract for DOMQL. It states what DOMQL is, not how far its implementation has come: [the status overview](../docs/features-status.md) says what this repository implements, and [the design](../docs/domql-design.md) how it is built.

<a id="version"></a>

**Version.** This specification describes DOMQL's version `1.0.0-beta.2`, which changes as DOMQL's contract does, apart from its runtime's version and from Nexo's language. It describes DOMQL on Nexo's language version `1.0.0-beta.41`, of [definition version 38](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/README.md#version). An implementation says which specification it follows, and which language version its Nexo runtime follows, in `domql.info.versions`, as [the API](api.md#api-entry-points-and-operations) sets out.

## What it covers

Five layers meet whenever a query runs. Nexo's specification covers the first two, and this one the two that are DOMQL's:

| Layer | What it owns | Documents |
| --- | --- | --- |
| The language | What a query means: its imports, syntax, names and scope, values and types, expressions and functions, members, extensions, and the contracts a vocabulary keeps | [Nexo's language](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/README.md) |
| The runtime | Binding, resolving and evaluating a script for a host, the modules it registers, its definitions and its results | [Nexo's runtime](https://github.com/FormaUI/Nexo/blob/v1.0.0-beta.2/spec/runtime/hosting.md) |
| DOMQL's module | The DOM as Nexo's domain: its nodes and shadow trees, its members, its states among them, its event sources and event types, its executions, and the observations that follow its changes | [Nodes and shadow trees](nodes-and-shadow-trees.md), [vocabulary](vocabulary.md), [events](events.md) |
| DOMQL, the host | Carrying a query out against a document: evaluating it, watching it, and invoking its host calls, delivering its events, carrying out its executions and keeping its behaviors where their module reaches them, through the API a caller uses | [Queries](queries.md), [evaluation](evaluation.md), [watches](watches.md), [results](results.md), [events](events.md), [executions](executions.md), [behaviors](behaviors.md), [the API](api.md), [errors](errors.md) |
| The caller | The application around DOMQL: which queries it makes, when it carries each out, and what it does with each result | The caller's own |

<a id="reading-this-specification"></a>

## Reading this specification

Start with [queries](queries.md), which shows a query with its parameters and its result, and look up a member in [the vocabulary](vocabulary.md). Examples illustrate the rules. Code containing `…` is a fragment, and examples explicitly described as errors are intentionally invalid.

## Documents

1. [Queries](queries.md): what a query is and what it runs against, making a query and binding its parameters, resolution, request kinds and their operations, and selecting part of a result.
2. [Nodes and shadow trees](nodes-and-shadow-trees.md): the DOM's node types, how kinds of node fit together, every crossing of a shadow boundary, and the trees and slots a node is in.
3. [Built-in vocabulary](vocabulary.md): the `Domql` module, its types, module members, properties, functions, states, executions, conversions and observations, and the modules that extend it, loaded on request where their caller says so.
4. [Evaluation](evaluation.md): evaluating a query once, how DOMQL's members read, waiting for maintained members, and the window an evaluation needs.
5. [Watches](watches.md): keeping a result current, what a watch follows and what it may miss, when it evaluates, how it fails, and sharing it.
6. [Results](results.md): snapshots, live state and change sets, how change sets compose, when a watch reports a result that differs, and keeping a copy of a result elsewhere, coalescing what it sends.
7. [Events](events.md): event sources, event types, subscribing to events, the reactions a subscription carries out as it hears each, and throttling what it delivers.
8. [Executions](executions.md): executing once and running continuously.
9. [Behaviors](behaviors.md): an operation's owner, a behavior's running instance, the commands that reach it, its occurrences and their acknowledgment, handling inside the native dispatch, and the state it offers.
10. [The API](api.md): every entry point, operation and handle, the events a handle raises, their order across handles, lifetimes and errors.
11. [Errors](errors.md): the codes of DOMQL's own conditions.
12. [Examples](examples.md): a complete query with its document and result, and queries by what they ask.
13. [Terms](terms.md): the glossary.
