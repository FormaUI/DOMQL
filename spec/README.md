# DOMQL Specification v1.0.0-alpha

DOMQL reads the DOM and shapes what it reads as data, keeps that data current as the document changes, delivers the page's events as data, and carries out the executions its modules declare. Its queries are scripts written in [Lexica](https://github.com/FormaUI/Lexica/blob/main/spec/README.md), whose specification defines the language and the runtime that reads, resolves and evaluates a script. DOMQL declares the DOM as Lexica's domain, in a module like any other, and is the host that carries each query out against a document. It adds no language rule: a rule of the language is Lexica's, and this specification links to it.

This specification is the authoritative contract for DOMQL. It states what DOMQL is, not how far its implementation has come: [the status overview](../docs/status.md) says what this repository implements, and [the design](../docs/domql-design.md) how it is built.

<a id="version"></a>

**Version.** This specification describes DOMQL on Lexica's [definition version 32](https://github.com/FormaUI/Lexica/blob/main/spec/README.md#version).

## What it covers

Five layers meet whenever a query runs. Lexica's specification covers the first two, and this one the two that are DOMQL's:

| Layer | What it owns | Documents |
| --- | --- | --- |
| The language | What a query means: its syntax, names and scope, values and types, expressions and functions, members, and the contracts a vocabulary keeps | [Lexica's specification](https://github.com/FormaUI/Lexica/blob/main/spec/README.md) |
| The runtime | Reading, resolving and evaluating a script for a host, with its bindings and its results | [Lexica's runtime](https://github.com/FormaUI/Lexica/blob/main/spec/runtime.md) |
| DOMQL's module | The DOM as Lexica's domain: its nodes and shadow trees, its members and predicates, its conversions, its event sources and event types, and the observations that follow its changes | [Nodes and shadow trees](nodes-and-shadow-trees.md), [vocabulary](vocabulary.md), [events](events.md) |
| DOMQL, the host | Carrying a query out against a document: evaluating it, watching it, and invoking its host calls, delivering its events and carrying out its executions, through the API a caller uses | [Queries](queries.md), [evaluation](evaluation.md), [watching](watching.md), [results](results.md), [events](events.md), [executions](executions.md), [the API](api.md) |
| The caller | The application around DOMQL: which queries it makes, when it carries each out, and what it does with each result | The caller's own |

<a id="reading-this-specification"></a>

## Reading this specification

Start with [queries](queries.md), which shows a query with its parameters and its result, and look up a member in [the vocabulary](vocabulary.md). Examples illustrate the rules. Code containing `…` is a fragment, and examples explicitly described as errors are intentionally invalid.

## Documents

1. [Queries](queries.md): what a query is and what it runs against, making a query and binding its parameters, resolution, request kinds and their operations, and selecting part of a result.
2. [Nodes and shadow trees](nodes-and-shadow-trees.md): the DOM's node types, how kinds of node fit together, every crossing of a shadow boundary, and the trees and slots a node is in.
3. [Built-in vocabulary](vocabulary.md): the `domql` module, its types, module members, properties, functions, predicates, conversions and observations, and the modules that extend it.
4. [Evaluation](evaluation.md): evaluating a query once, how DOMQL's members read, waiting for maintained members, and the window an evaluation needs.
5. [Watching](watching.md): keeping a result current, what a watch follows and what it may miss, when it evaluates, how it fails, and sharing it.
6. [Results](results.md): snapshots, live state and change sets, when a watch reports a result that differs, and keeping a copy of a result elsewhere.
7. [Events](events.md): event sources, event types, and subscribing to events.
8. [Executions](executions.md): executing once and running continuously.
9. [The API](api.md): every entry point, operation and handle, the events a handle raises, lifetimes and errors.
10. [Examples](examples.md): a complete query with its document and result, and queries by what they ask.
11. [Terms](terms.md): the glossary.
