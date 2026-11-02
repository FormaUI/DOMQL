# Errors

<a id="errors"></a>

Every failure DOMQL reports is a `NexoError`, with its `code`, its `kind`, its `message` and the `location` it concerns, as Nexo's [errors](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/runtime/errors.md#diagnostics-codes) set out. A caller reads the code, the kind and the location, never the message.

- **Nexo's conditions** keep their codes, `NEXO` and four digits, as Nexo's catalogs give them: [the language's](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/language/errors.md) for what a query may express, and [the runtime's](https://github.com/FormaUI/Nexo/blob/e989dee2c662f0608e9a61b10afdf317a323fb90/spec/runtime/errors.md) for definitions, bindings, declarations and the API. A Nexo error passing through DOMQL keeps its code and takes no second one.
- **DOMQL's own conditions** take codes of DOMQL's prefix, `DOMQL` and four digits, in the ranges Nexo's kinds use, as the tables below give them.
- **A code is stable.** It names its condition, never its wording. A new condition takes a new code, and a retired code is never reused.

When each kind of failure is reported, the [API's errors](api.md#api-errors) set out.

In this document:

1. [Structure errors](#errors-structure)
2. [Validation errors](#errors-validation)
3. [Module errors](#errors-module)
4. [Evaluation errors](#errors-evaluation)

<a id="errors-structure"></a>

## Structure errors

A caller's use of the API, refused where it is made.

| Code | Condition |
| --- | --- |
| `DOMQL2001` | `domql.query` given a query object, which `query.with(bindings)` binds anew |
| `DOMQL2002` | `domql.query` or `domql.format` given a query object another DOMQL instance made, which is made here from its definition |
| `DOMQL2003` | A watch scheduled neither `frame` nor `immediate` |
| `DOMQL2004` | A watch's update strategy neither `snapshot` nor `liveState` |
| `DOMQL2005` | A selection watched as live state |
| `DOMQL2006` | A watch scheduled by animation frame in a window that has none |
| `DOMQL2007` | A subscription or a listener given a handler that is no function |
| `DOMQL2008` | A listener subscribed to an event its handle doesn't raise |
| `DOMQL2009` | A selected view of a watch that keeps live state |
| `DOMQL2010` | `env.observe` given a request without a type or a target, or a `notify` that is no function |
| `DOMQL2011` | `env.frame` given a callback that is no function or a phase neither `write` nor `read`, or in a window without animation frames |
| `DOMQL2012` | `env.measureUnder` given an element that is none, a class that is no one token, or a `read` that is no function |

<a id="errors-validation"></a>

## Validation errors

A request refused as it is resolved, before anything is evaluated or started, located in the query.

| Code | Condition |
| --- | --- |
| `DOMQL3001` | Live state of a result that is no object or list, or may be null |
| `DOMQL3002` | A watch over a member whose changes no observation covers |
| `DOMQL3003` | A watch over a partly observable member, without accepting partial observation |
| `DOMQL3004` | A request carried out by an operation of another request kind |
| `DOMQL3005` | A host call on a receiver of unknown type, whose host calls of its name disagree on what they request |
| `DOMQL3006` | A continuous execution's update whose bindings select another execution |

<a id="errors-module"></a>

## Module errors

A module refused as it is created or registered, and a host call carried out that its module gives nothing to carry it out, located in the module, at the declaration and the key concerned, and at the type it stands within where it stands within one.

| Code | Condition |
| --- | --- |
| `DOMQL4001` | A member the evaluator invokes declaring a `requestKind` or an `executionMode` |
| `DOMQL4002` | A host call whose `requestKind` is missing, or neither `subscription` nor `execution` |
| `DOMQL4003` | An event source declaring an `executionMode` |
| `DOMQL4004` | An event source declaring no `result` |
| `DOMQL4005` | An execution whose `executionMode` is missing, or neither `once` nor `continuous` |
| `DOMQL4006` | A continuous execution declaring a `result` |
| `DOMQL4007` | A host call's `impl` that is no function |
| `DOMQL4008` | A module declaring observation targets, registered |
| `DOMQL4009` | A host call registered without the request it makes, in a module `domql.createModule` didn't make |
| `DOMQL4010` | A host call carried out that has no `impl` |
| `DOMQL4011` | A `behavior` declared by a continuous execution, or naming none by a name |
| `DOMQL4012` | A `behavior` naming no continuous execution of its module |
| `DOMQL4013` | An event source of a behavior declaring an `impl` or parameters, which DOMQL carries out |

<a id="errors-evaluation"></a>

## Evaluation errors

A failure while a request is carried out, located in the query where it concerns one.

| Code | Condition |
| --- | --- |
| `DOMQL5001` | A once execution failing, its failure the error's `cause` |
| `DOMQL5002` | An evaluation without a window |
| `DOMQL5003` | An event source failing to start listening |
| `DOMQL5004` | An event source starting and answering nothing that stops it |
| `DOMQL5005` | A disposed handle updated, refreshed or waited for |
| `DOMQL5006` | A continuous execution failing to update |
| `DOMQL5007` | A continuous execution failing to start |
| `DOMQL5008` | A continuous execution starting and answering no `update` and `dispose` |
| `DOMQL5009` | An observation of a type no registered module declares |
| `DOMQL5010` | An observation of a type its module gives no `impl` |
| `DOMQL5011` | An observation failing to start |
| `DOMQL5012` | An observation starting and offering no `stop`, or a maintained one no `sample` |
| `DOMQL5013` | A maintained observation's sample that is no `{ pending, value }`, with a value once it is not pending |
| `DOMQL5014` | A watch disposed while a caller waits for it to be ready |
| `DOMQL5015` | A running subscription or a once execution a module registered since made stale, whose request prepared again reaches no host call, or another |
| `DOMQL5016` | A command carried out where no instance of its behavior runs for its owner on its receiver |
| `DOMQL5017` | An occurrence no subscription applied: none listened as it was delivered, or one ended before it applied it |
| `DOMQL5018` | An occurrence delivered after its behavior's instance ended |
| `DOMQL5019` | An occurrence delivered to an event source its behavior has none of |
| `DOMQL5020` | An occurrence a subscription failed to apply: its projection failed, or its handler threw or rejected, its failure the error's `cause` |
| `DOMQL5021` | An execution, or an operation environment's `observe`, `frame` or `measureUnder`, while a query is evaluated, which reads alone |
| `DOMQL5022` | A maintained observation failing to take the new sample a refresh asked for, its failure the error's `cause` |
