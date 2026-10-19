# DOMQL Specification v1.0.0-alpha

DOMQL is a language for reading the DOM and shaping the result as data. A query can run once, be watched for changes, or project data from each event. Actions and behaviors are separate kinds of request.

The language defines expressions, names, types and result shapes. A vocabulary defines what those expressions can read or request: an element's size, an attribute, a condition, an event source, or an extension's operations. Adding vocabulary does not change the grammar.

This specification defines the whole language, its vocabulary contracts and its JSON definition format. An implementation may cover only part of it; the [README's status](../README.md#status) states what this one implements. The [DOMQL design](domql-design.md) describes how requests are built, prepared and carried out.

<a id="reading-this-specification"></a>

## Reading this specification

Start with [A query at a glance](#a-query-at-a-glance). Use the contents below to find a rule or a built-in member. The [formal grammar](#syntax) and [glossary](#terms) are appendices, so the language can be read before its notation.

Examples illustrate the rules. Code containing `…` is a fragment, and examples explicitly described as errors are intentionally invalid. Type notation such as `T?`, `list<T>` and `never` describes types; it does not declare a type in a query.

### Contents

- [A query at a glance](#a-query-at-a-glance)
- [Values and types](#values-and-types)
- [Names and scope](#names-and-scope)
- [Access and calls](#access-and-calls)
- [Expressions](#expressions)
- [Calculations and reuse](#calculations-and-reuse)
- [Requests](#requests)
- [Evaluation and watching](#evaluation-and-watching)
- [Vocabulary contracts](#vocabulary-contracts)
- [Built-in vocabulary](#built-in-vocabulary)
- [Definition](#definition)
- [Errors and diagnostics](#errors-and-diagnostics)
- [Examples and usage](#examples-and-usage)
- [Syntax](#syntax)
- [Terms](#terms)

<a id="a-query-at-a-glance"></a>

## A query at a glance

```domql
panel {
    let rows = context.all("[data-key]"),
    width = context.size?.width,
    items = rows {
        key = context:["data-key"],
        selected = context.aria:["selected"] == "true"
    },
    count = rows.count
}
```

- `panel` reads an element supplied by the caller.
- `panel { … }` shapes a result object. Within its fields, `context` is the panel.
- `let rows = …` names an intermediate value. It is not an output field.
- `context:["data-key"]` reads an attribute through the default indexer.
- `rows { … }` projects each list item. Inside that projection, `context` is the item.
- `?.` continues only when its receiver is not null.
- `width`, `items` and `count` are result fields. Fields and locals use `=`; equality uses `==`.

A query's result contains data. To return information about an element, project the fields you need rather than returning the element itself. See [A complete query](#a-complete-query) for an input document, a full query and its result.

<a id="values"></a>

<a id="values-and-types"></a>

## Values and types

A value is a number, a string, a Boolean, null, a list, a structured value such as a rectangle, a node such as an element or the document, the window, an element's shadow or ARIA view, or an event source. A member's signature declares its result type, as the section on types sets out, and a result marked `?` can be null by itself; an optional access answers null where its receiver is null, and any member answers null where an argument is null and its parameter propagates null.

A result is data: numbers, strings, Booleans, null, lists and objects. A node, the window, an element's shadow or ARIA view, or an event source has no data form, so a query whose result would contain one is a validation error; a query reads the facts it needs of a node through an object expression.

In this section: [Objects](#objects) · [Lists](#lists) · [Types](#types) · [Nodes](#nodes) · [Shadow trees](#shadow-trees) · [No implicit conversion](#no-implicit-conversion) · [Nullability](#nullability) · [Bindings](#bindings) · [Receivers of unknown type](#receivers-of-unknown-type) · [Null](#null).

<a id="objects"></a>

### Objects

- A field is written with its name before its `=`, `width = context.rect?.width`, whatever its value is, and the language infers no name: a field without one is a syntax error, as is an object expression without a field.
- Two fields of one object expression with the same name are an error when the query is created.
- A result keeps its fields in the order the object expression names them.
- An object expression following null is null.

<a id="lists"></a>

### Lists

- A list keeps the order of its source: a member that makes a list says where its order comes from, as `all` takes document order, and a bound list keeps the caller's; `where`, and an object expression following a list, keep its items in that order.
- An object expression following a list applies to each item and answers a list of the same length, in the same order; an item that is null answers null at its position, so over a list whose items can be null it answers a list of objects that can be null: `xs { a = 1 }` over a `list<element?>` is a `list<{ a: number }?>`.
- A member following a list is a member of the list itself: `context.all("tr").count` counts rows.
- `count` of an empty list is 0, and `sum` is 0. `max` and `min` of an empty list are null.
- `max`, `min` and `sum` take a number expression, skip items whose expression is null, and answer null for `max` and `min`, and 0 for `sum`, when every item was skipped.
- `where` takes a predicate and keeps the items it is truthy for, leaving out an item whose predicate is null or false.
- `first`, `last` and the list's default indexer, `:[index]`, answer null when the list has no such item.

CSS selectors and `where` are the two ways a query filters: a selector chooses elements as the browser matches them, and `where` chooses list items by any value the vocabulary offers, by its truthiness.

<a id="types"></a>

### Types

Every value has a type. Every member declares the types it accepts and returns. Type checking happens during preparation, before evaluation.

A request that cannot be typed fails with a validation error identifying the location, expected type and actual type. DOMQL infers types from expressions and caller bindings.

<a id="types-type-families"></a>

#### Type families

| Family | Types and meaning |
| --- | --- |
| Scalar data | `number`, `string`, `boolean` |
| DOM nodes | `node` and its kinds: `element`, `document`, `documentFragment`, `shadowRoot` |
| Browser window | `window` |
| Views | `shadow`, an element's shadow relationships; `aria`, its ARIA states |
| Lists | `list<T>`, a list whose items have type `T` |
| Structured values | Named fields of declared types, such as `rectangle`, `size`, `selection` and `grid` |
| Query objects | The field types inferred from an object expression |
| Event sources | `event<T>`, a source whose event data has type `T` |

Modules may declare additional types.

<a id="types-nullable-and-empty-types"></a>

#### Nullable and empty types

| Notation | Meaning |
| --- | --- |
| `T?` | A value of type `T`, or null |
| `null` | The type of null alone; fits every nullable type |
| `never` | A type with no values; fits every type |
| `list<never>` | The type of an empty list; fits every list type |

`null` and `never` here are type notation. `never` is not an expression-language word, and the expression literal `null` is a value rather than a type declaration.

<a id="nodes"></a>

### Nodes

A node is a value of the DOM tree, and its kinds are `element`, `document`, `documentFragment`, a document fragment that is no shadow root, and `shadowRoot`. `window` is no node.

<a id="nodes-kinds-fit-where-a-node-does"></a>

#### Kinds fit where a node does

A value of a kind fits where a `node` is expected, and a `node` fits where a kind is expected only through a cast, so a kind's own members, such as an element's `rect`, are read of a `node` through one: `(panel.parent as "element")?.rect`.

<a id="nodes-of-two-kinds"></a>

#### Of two kinds

Values of two different kinds, a conditional's branches, a coalescing operator's sides or the items of a bound list, are of the type `node`, so `if wide then panel else document end` is a `node`.

<a id="nodes-declaring-on-a-node"></a>

#### Declaring on a node

A member declared on `node` is a member of every kind, and no member of the same name can be declared on a kind, so no declaration overrides another.

<a id="shadow-trees"></a>

### Shadow trees

Every crossing of a shadow boundary is written, so a query shows the relationship it follows:

```domql
host.shadow.root            // Into the shadow tree an element hosts.
element.root.host           // Out of the shadow tree an element is in, to its host.
slot.shadow.elements        // The elements a slot shows.
```

<a id="shadow-trees-selectors-never-pierce-a-shadow-root"></a>

#### Selectors never pierce a shadow root

`first`, `all` and `closest` select within their receiver's own tree, so `host.all("p")` holds no element of the host's shadow tree, and `host.shadow.root?.all("p")` selects within it. `parent` never crosses a boundary either: a direct child of a shadow root has that root as its parent, and reaches the host through `root.host`.

<a id="shadow-trees-the-view"></a>

#### The view

An element's `shadow` is a value of the type `shadow`, which has no data form, so a result never holds one. It is the same for its element whatever changes, and its members answer the element's shadow relationships as they are.

<a id="shadow-trees-shadowroot"></a>

#### `shadow.root`

`shadow.root` is the open shadow root the element hosts, and null where it hosts none or a closed one.

<a id="shadow-trees-shadowelements"></a>

#### `shadow.elements`

`shadow.elements` is a slot's assigned elements, flattened, as `assignedElements({ flatten: true })` answers them: it follows assignment through forwarded slots, takes the slot's fallback where nothing is assigned to it, answers elements alone, filters nothing by visibility and enters no assigned element's own shadow tree.

A slot that yields no element answers the empty list, as one does whose assigned nodes are text alone, since assigned text suppresses the fallback, and one outside a shadow tree, whatever its fallback. An element that is no slot answers null, so null tells an element that is no slot from a slot that shows nothing.

<a id="no-implicit-conversion"></a>

### No implicit conversion

DOMQL performs no implicit type conversion. Explicit data conversion uses [`to`](#conversions).

A `number` is not a `boolean`, a `string` is not a `number`, and an `element` is not a `string`. `context:[200]` where `context` is an element, whose default indexer takes an attribute's name, `context.intersects({ root = 5 })`, and an element supplied where a list is required are validation errors; a list's default indexer takes a number, so `rows:[2]` is valid.

[Truthiness](#truthiness) tests a value without converting its type. A predicate takes any value, and its member receives the value's truthiness: every number, zero included, is truthy, so `xs.where(context)` keeps every item of a list of numbers.

<a id="nullability"></a>

### Nullability

Nullability is part of a type, and null follows the signature.

<a id="nullability-receiver-nullability"></a>

#### Receiver nullability

`panel.first(".row").rect` is a validation error, since `first` answers an `element?`, and `panel.first(".row")?.rect` answers null without invoking `rect` where the panel holds no row; its type is `rectangle?`, since an optional chain is nullable where an optional access of it can meet null.

A member written with `?.` or `?:`, a test among them, answers null for a null receiver, so `panel.first(".row")?.matches(".open")` is a `boolean?` that is null where there is no row.

<a id="nullability-a-null-argument-follows-the-parameter"></a>

#### A null argument follows the parameter

A parameter is declared either to propagate null, which is the default and makes the call answer null without running, or to accept null with a meaning of its own, as `intersects` accepts a null `root` to mean the window. Preparation never rejects an evaluated argument for being nullable; it rejects a type that cannot match.

A fixed argument that names a declaration, the type of `on` and the feature of `supports`, is different, and so is the name of a bracket property access: each must resolve to a non-null string during preparation, because a declaration cannot be looked up from null, and a bracket property access could not determine its result type.

Preparation determines every name such an expression can give, from literals, bound values, locals, conditional bindings, conditionals, `??`, `and` and `or`. A bracket property access is refused where an outcome can be null or false or names no property, and a fixed argument where one can be null or names no declaration; a binding is typed by its value, so `panel[name]` and `button.on(name)` are validation errors alike where `name` is bound to null.

<a id="nullability-a-written-null-is-an-expression-that-produces-null"></a>

#### A written null is an expression that produces null

`null` as a literal has no special treatment, and the signature and the evaluation rules decide what a call does with it.

<a id="nullability-null-is-unavailable-too"></a>

#### Null is unavailable too

An element is a valid receiver of `selection`; one that is no text input answers null, as an unavailable value does. A receiver of the wrong type, a number for `rect`, is a validation error, and a module that returns a value of a type other than the one it declared has broken its contract, which is an evaluation error and never a quiet null.

<a id="bindings"></a>

### Bindings

A binding takes its type from its value, and a caller declares none. It is named by a letter followed by letters and digits, a reserved word among them, which a query reads as `~` and the name, as `~as` and `~window` do.

- A node is of its kind: an element is an `element`, a document a `document`, a shadow root a `shadowRoot` and any other document fragment a `documentFragment`, and a node of another kind, such as text, is no binding.
- A number, a string and a Boolean are `number`, `string` and `boolean`.
- Null is a `null`.
- A list is a `list<T>`, `T` the type its items share, `node` for nodes of different kinds, made nullable where one of them is null: `[element, null]` is a `list<element?>`. A list of nulls alone, `[null]` or `[null, null]`, is a `list<null>`, whose items can only be null, and the empty list is a `list<never>`, which holds no item.
- An object is of the object type of its fields' types, each typed as a binding is.
- A list whose items share no type has no type, because DOMQL has no union types and a list holds items of one type, so binding `[1, "two"]` is a structure error.

A tool that checks a query without running it takes the same values, or values of the same types, for the bindings, since vocabulary declarations alone cannot establish the type of `panel`.

<a id="receivers-of-unknown-type"></a>

### Receivers of unknown type

A receiver of the type `null`, a null binding or the literal `null`, says nothing of what it would be, and neither does a `never`, the item of an empty list. The concession is to missing type information alone: a receiver whose type is known is checked as always, a nullable one included, so `panel.parent?.sise` is refused for an element `panel` whatever its parent is.

A receiver of the type `null` can be null, so it takes `?.`, and a `never`, which no value has, takes `.`. A name applied to a receiver of unknown type resolves without choosing one declaration:

<a id="receivers-of-unknown-type-any-property"></a>

#### Any property

A name written as a property is accepted whatever it is, since the fields of a bound object are named by its data, as `row?.id` for a null `row` and `rows { id = context.id }` for empty `rows` are; it is checked once its receiver's type is known.

<a id="receivers-of-unknown-type-known-calls-alone"></a>

#### Known calls alone

A name written as a call or an indexer is a member's, written in the form, and given the arguments, that at least one of its declarations takes; a name no member has, one written as a call where every declaration is a property, and one given an argument none takes are validation errors, since data names no operation.

<a id="receivers-of-unknown-type-the-request-keeps-its-kind"></a>

#### The request keeps its kind

The declarations that take the name as it is written agree on the request kind they make, and the request is of that kind, so it takes the operations of its kind and is refused the others.

Declarations that disagree on their kind are refused as ambiguous, and a cast to a kind of node says which a null receiver means: `(thing as "element")?.ping()` takes the element's declaration of `ping` for a null `thing`.

<a id="receivers-of-unknown-type-what-it-answers"></a>

#### What it answers

A query answers null, a subscription listens to nothing, an action is not executed and answers null, and a behavior is applied with nothing started, as with any null receiver.

Its type is the result type those declarations share, made nullable for a receiver of the type `null`, which answers null, and as they declare it for a `never`, which is never evaluated, so `rows { count = context.children.count }` is valid for empty `rows` and `rows { count = context.children.sise }` is refused.

Where they share none, or the name is no member's, it is `null` for a `null` and a `never` for a `never`: a `never` fits wherever a value of any type stands, so `rows { done = not context.complete }` is valid for empty `rows`, and checked once they hold items.

<a id="receivers-of-unknown-type-what-is-checked-later"></a>

#### What is checked later

Whether the name applies to its receiver is checked once the receiver's type is specific enough, when the binding is bound to an element, a list or another value that reveals its type.

<a id="receivers-of-unknown-type-an-object-expression"></a>

#### An object expression

An object expression following such a receiver, or applied to the items of a `list<never>`, resolves its fields against a `never`, so a call in it is still checked; its type is the object type of its fields, made nullable after a null, and a list of it after an empty list, which answers the empty list.

An operation on a `list<never>` runs, as on any list, so it resolves to one declaration as any receiver does: the vocabulary declares a name once for any receiver, and where more than one of its declarations takes a `list<never>`, as only a type holding `never` allows, the request is refused as ambiguous.

<a id="null"></a>

### Null

Null answers both "there is no such value", as when `closest` finds no element, and "the value is unavailable", as when an element has no layout to measure. One null for both keeps results simple, at the cost of telling the two apart; a member whose consumers need the difference offers it separately, as `attached` says whether an element is still attached to the document.

An optional access of null answers null and ends its chain. `??` supplies a fallback for null. Errors fail the result rather than becoming null; see [Errors and diagnostics](#errors-and-diagnostics).

<a id="names-and-scope"></a>

## Names and scope

In this section: [Names and resolution](#names-and-resolution) · [Names and reserved words](#names-and-reserved-words) · [Tokens and whitespace](#tokens-and-whitespace) · [Strings and escapes](#strings-and-escapes) · [Comments](#comments) · [Case-sensitive names](#case-sensitive-names).

<a id="names-and-resolution"></a>

### Names and resolution

A name at the start of a chain reads the nearest visible local or field of that name. If none is in scope, it reads the parameter of that name, the caller's binding. A bare name read before a local of that name declared later in the same scope is a structure error, since it reads no binding there; a field of that name written later leaves it reading the binding. `context`, or bare `~`, reads the evaluation context.

Members always have an explicit receiver. Equality always has both operands. The reader does not need vocabulary knowledge to decide what a name applies to.

<a id="names-and-resolution-evaluation-context-by-position"></a>

#### Evaluation context by position

| Position | What `context` means |
| --- | --- |
| Top-level query | No evaluation context is available |
| Object expression following a value | The value it follows |
| Object expression following a list | The current item |
| Object expression following no value | The surrounding evaluation context, if one exists |
| Value argument | The evaluation context where the call is written |
| Expression or predicate argument | The context declared by the member |

In `viewport { width = context.rect?.width }`, `context` is the viewport.

In `panel { layout = { width = context.size?.width, height = context.size?.height } }`, both nested fields still read the panel. The nested object groups fields without changing the context.

At the top level, `{ anchor = anchor.rect, open = popup.is("popover-open") }` has no evaluation context. Each field reads a binding, a literal or another expression that does not require one.

`context.size`, `{ size = context.size }` and `target.intersects({ root = context })` at the top level are errors because there is no evaluation context.

<a id="names-and-resolution-explicit-receivers"></a>

#### Explicit receivers

Writing a member without its receiver is an error. If the evaluation context has that member, the diagnostic suggests the form with `context`:

| Written | Suggested form |
| --- | --- |
| `rect.width` | `context.rect` |
| `closest(".row")` | `context.closest(…)` |

An equality without its left operand is an error as well; write both values, for example `context == null`.

<a id="names-and-resolution-parameters-and-roots"></a>

#### Parameters and roots

Parameters resolve the same way inside object expressions and arguments as elsewhere. Their bindings may be nodes or data: numbers, strings, Booleans, null, lists or objects. Lists and objects may contain nodes.

`document` and `window` require no value from the caller: `document` is the document the query runs against, and `window` its window, which is also the layout viewport. Written inside an object expression, `root` refers to the outermost object being built, the [object root](#locals-the-object-root). A caller can still pass a value under one of these names; read it as `~document`, `~window` or `~root`.

<a id="names-and-resolution-projection-example"></a>

#### Projection example

```domql
viewport {
    // The viewport's width, and whether focus is within it.
    width = context.rect?.width,
    hasFocus = context.has("focus-within"),
    columns = context.all("[data-column]") { key = context:["data-column"], width = context.rect?.width }
}
```

<a id="names-and-reserved-words"></a>

### Names and reserved words

A name starts with an ASCII letter and continues with ASCII letters or digits. For example, `rectRelativeTo` is a name. Names contain no hyphens and are also valid JavaScript identifiers.

An **identifier** is a name that is not reserved. Reserved words are:

| Category | Words |
| --- | --- |
| Literals | `true`, `false`, `null` |
| Roots | `document`, `window`, `root` |
| Context and operators | `context`, `not`, `try`, `as`, `to`, `and`, `or` |
| Control flow and declarations | `if`, `then`, `elseif`, `else`, `let`, `do`, `end`, `return`, `function` |

Reserved words match whole names, exactly. `isVisible` and `nullable` are identifiers. All names are case-sensitive, so `TRUE` and `Context` are identifiers too.

The **keywords** are the reserved words other than the literals' words and the roots' names: `context` and the words of operators, control flow and declarations.

<a id="names-and-reserved-words-declaring-and-accessing-a-reserved-name"></a>

#### Declaring and accessing a reserved name

A declaration accepts any name, including a reserved word. This applies to fields, locals, functions, function parameters and conditional bindings. Write the name without `@`:

```domql
panel { true = true, context = context.attached }
```

The same rule applies to member and indexer names after `.`, `?.`, `:` and `?:`. For example, `value.null` reads a member named `null`, and `panel:end["key"]` invokes an indexer named `end`.

`let @to = 1`, `{ @true = 1 }` and `value.@null` are syntax errors.

<a id="names-and-reserved-words-referring-to-a-reserved-local-or-field"></a>

#### Referring to a reserved local or field

In an expression, a reserved word retains its language meaning regardless of scope. After `let window = 1`, an unprefixed `window` still reads the root.

Write `@` directly before a reserved word to read the nearest local or field of that name:

```domql
{ let to = "3", value = @to to "number" }
```

A reserved reference with no such local or field is a structure error:

> No local or field named 'window' is in scope. Use '~window' to read the caller's binding.

`@` is valid only directly before a reserved word, and a keyword alone reads no local or field. These are syntax errors:

| Form | Diagnostic guidance |
| --- | --- |
| `@panel` | Use `panel`; the name is not reserved. |
| `@ window` or `@` | A reserved word must follow `@` directly. |
| `to` in a value position | `Found 'to', a keyword: write '@to' for the local or field of that name`. |

<a id="names-and-reserved-words-referring-to-the-callers-binding"></a>

#### Referring to the caller's binding

`~name` reads the caller's binding regardless of any local or field with the same name. Reserved names are allowed: `~as` and `~window` read the bindings `as` and `window`.

The name must follow `~` directly. With no name directly after it, bare `~` reads the evaluation context, so `~.size` is `context.size`. Canonical text writes `context`.

<a id="names-and-reserved-words-names-in-strings-and-supplied-data"></a>

#### Names in strings and supplied data

A string containing a reserved word remains an ordinary string:

- `context:["null"]` reads an attribute named `null`.
- `value["null"]` is bracket property access and resolves the member `value.null`.

The name restrictions apply to declarations in a query. Supplied data keeps all its own keys. Bound objects and objects returned by members retain every field, including `__proto__`, as an ordinary own field in results, snapshots and live state.

<a id="names-and-reserved-words-canonical-spelling-of-names"></a>

#### Canonical spelling of names

| Name position | Canonical text |
| --- | --- |
| Declaration, field name or member name | The name as written, without a prefix |
| Reference to a local or field | Its name; `@name` if reserved |
| Reference to a caller's binding | Its name if not reserved or hidden; `~name` otherwise |
| Root | `document`, `window` or `root` |
| Evaluation context | `context` |

These rules also apply to extension declarations and definitions created directly. A definition stores names without `@` or `~`; its node kind distinguishes a local reference from a parameter. `context` and bare `~` both produce a `context` node.

<a id="tokens-and-whitespace"></a>

### Tokens and whitespace

Tokens are names, numbers, strings and the punctuation shown in the [grammar](#syntax). The tokenizer uses the longest match.

The following forms are each one token and cannot contain whitespace:

| Token | Invalid separated form |
| --- | --- |
| `?.` | `? .` |
| `?[` | `? [` |
| `?:` | `? :` |
| `??` | `? ?` |
| `(?` | `( ?` |
| `<=` | `< =` |
| `>=` | `> =` |
| `=>` | `= >` |
| `==` | `= =` |
| `!=` | `! =` |

Whitespace, including line breaks, and comments are **trivia**. Trivia may appear between tokens, never inside a token. No rule requires trivia between tokens that are already distinguishable: `a to"number"` means `a to "number"`.

<a id="tokens-and-whitespace-assignment-and-member-punctuation"></a>

#### Assignment and member punctuation

Fields, locals and conditional bindings put `=` between a name and its value. A colon after a name begins an indexer.

- `count: context.size` is a syntax error that suggests `count = …`.
- `=` in another position is a syntax error that explains that `==` compares values.
- Bracket property access has no preceding dot. `context.[name]` and `context?.[name]` are syntax errors that suggest `context[name]` and `context?[name]`.

<a id="tokens-and-whitespace-numbers-and-the-minus-sign"></a>

#### Numbers and the minus sign

A number token has no sign. `-` is always an operator: arithmetic negation or subtraction.

| Text | Meaning |
| --- | --- |
| `-5` or `- 5` | Negate 5 |
| `a-b` | Subtract `b` from `a` |
| `client-size` | Subtract `size` from `client` |

In a property access such as `context.client-size`, where the receiver has no member `client` and has the corresponding camelCase member, the diagnostic suggests `context.clientSize`. A bare `client-size` reads `client` and `size` as names, with no such suggestion.

HTML and CSS names containing hyphens are strings: `element:["data-key"]`.

`/` divides unless it begins a comment: `a / b` divides, while `a //b` begins a line comment.

<a id="tokens-and-whitespace-interpolated-string-prefix"></a>

#### Interpolated-string prefix

`$"` begins an [interpolated string](#interpolated-strings). The dollar sign must be directly before the quote. `$` elsewhere is a syntax error; `$ "…"` specifically reports that no space may separate them.

<a id="strings-and-escapes"></a>

### Strings and escapes

Strings come in two families: a **string**, written in double quotes, whose backslashes begin escapes, and a **raw string**, written in single quotes, whose backslashes are text. Each is written inline, on one line, or as a **block**, on lines of its own, and `$` before either makes it interpolated, as [Interpolated strings](#interpolated-strings) describes. Every form gives an ordinary `string`:

| Form | Name |
| --- | --- |
| `"…"` | String |
| `'…'` | Raw string |
| `$"…"` | Interpolated string |
| `$'…'` | Interpolated raw string |
| `"""…"""` | String block |
| `'''…'''` | Raw block |
| `$"""…"""` | Interpolated string block |
| `$'''…'''` | Interpolated raw block |

```domql
let path = 'C:\Users\Eyal\'
return {
    path = path,
    pattern = '\d{3}-\d{2}',
    message = $"""
        Saved to {path}

        Done.
        """
}
```

<a id="strings-and-escapes-escapes"></a>

#### Escapes

A string and a string block take these escape sequences:

| Escape | Character |
| --- | --- |
| `\"` | Double quote |
| `\\` | Backslash |
| `\n` | Line feed |
| `\r` | Carriage return |
| `\t` | Tab |
| `\e` | Escape, U+001B |
| `\u{…}` | Unicode scalar value written with one to six hexadecimal digits |

Examples of Unicode escapes are `\u{A0}` for a no-break space, `\u{200B}` for a zero-width space and `\u{1F600}` for 😀.

A surrogate value from D800 through DFFF, a value above 10FFFF, or any unrecognized escape is a syntax error.

Characters other than a line break may also appear literally, tabs included. `"😀"` and `"\u{1F600}"` have the same value, as do `"\e"` and `"\u{1B}"`.

<a id="strings-and-escapes-raw-strings"></a>

#### Raw strings

A raw string's backslashes are text, a trailing one included, so `'C:\Users\Eyal\'`, `'\d{3}-\d{2}'` and `'[data-state="open"]'` hold exactly what they show. Its one convention is its quote doubled: `'It''s ready'` is `It's ready`, as `"It's ready"` is, and `''` is the empty string. A raw string has no escapes, so a character it cannot show, an invisible one among them, is written in a string instead.

<a id="strings-and-escapes-one-line"></a>

#### One line

An inline string, `"…"`, `'…'`, `$"…"` or `$'…'`, holds no line break between its delimiters; one written there is a syntax error suggesting `\n` or a block. An escape or an inserted value may still give its value a line break, as `"First\nSecond"` and `$"Content: {text}"` do.

<a id="strings-and-escapes-blocks"></a>

#### Blocks

A block is opened by three or more matching quotes, `$` directly before them where it is interpolated, followed directly by a line break, and closed by as many of the same quote, the first text after the indentation of a later line. The query continues after the closing delimiter on its line, a call, an access, a comma or a comment:

```domql
{
    label = '''
        Ready
        ''',
    count = 3
}
```

- **The margin.** The closing delimiter's indentation is the margin removed from each line of the block's text. Each line that is not blank begins with exactly that whitespace, tabs and spaces alike, and one that does not is a syntax error. A blank line shorter than the margin is empty, and whitespace beyond the margin is kept.
- **The boundaries.** The line break after the opening delimiter and the one before the closing delimiter are no part of the text; blank lines within it are kept. LF, CRLF and a lone CR each break a line, and the text holds each as LF; an escape writes any other line ending.
- **Before anything else.** The margin is removed from the source text before escapes are read and before interpolation, so no inserted value is trimmed or reindented.
- **Quotes within.** A run of the delimiter's quote at least as long as the delimiter in a block's text is a syntax error unless it is the closing delimiter, and the diagnostic suggests a longer one, as four quotes hold `'''`. A closing run has exactly the delimiter's length. A string block's escaped quote is in no run, a raw block has no escape and doubles no quote, and the strings within an interpolation follow their own rules, so their quotes are in no run either.
- **Malformed delimiters.** An opening delimiter with anything after it on its line, a block never closed and a closing run longer than its delimiter each have a diagnostic of their own.

<a id="strings-and-escapes-where-a-string-literal-is-required"></a>

#### Where a string literal is required

Every form that does not interpolate stands wherever the grammar requires a string literal, a cast's or a conversion's type name among them, so `panel as 'element'` is `panel as "element"`. An interpolated form is an expression and stands in none of them, even with text alone.

<a id="strings-and-escapes-canonical-spelling-of-strings"></a>

#### Canonical spelling of strings

Canonical text writes every string as an inline string, `"…"`, and every interpolated one as `$"…"`, whatever form it was written in, escaping what it must: a raw string and a block give the same value written so. Formatting a query's source keeps each string's family and its inline or block form, and its value, significant whitespace included.

It writes a double quote and a backslash as `\"` and `\\`, and line feed, carriage return, tab and escape as `\n`, `\r`, `\t` and `\e`.

Other invisible characters use `\u{…}` with uppercase hexadecimal digits and no leading zeros:

| Unicode category | Characters escaped | Examples |
| --- | --- | --- |
| Cc | Control characters | `\u{0}`, `\u{7F}` |
| Cf | Format characters | `\u{200B}` |
| Zl, Zp | Line and paragraph separators | Unicode line and paragraph separators |
| Zs | Space separators other than U+0020 | No-break space, `\u{A0}` |

All other characters appear as themselves, including accented letters and emoji. A zero-width joiner is still escaped, so the joined emoji is written `"👩\u{200D}💻"`. Its value is unchanged, and its composition is visible.

<a id="comments"></a>

### Comments

A line comment begins with `//` and continues to the next LF or the end of input.

A block comment begins with `/*` and ends at the first `*/`. Block comments do not nest. An unclosed block comment is a syntax error.

Comment markers inside a string are text: `"https://example.com"` and `"/* */"` retain those characters.

<a id="case-sensitive-names"></a>

### Case-sensitive names

Every name in DOMQL is case-sensitive, and nothing normalizes one: `size` and `Size` are different names, and so are `panel` and `Panel`. A name is resolved exactly as it is written, and each kind of name is spelled by its own convention:

<a id="case-sensitive-names-members"></a>

#### Members

Members are named in camelCase, properties and operations alike: `size`, `clientSize`, `devicePixelRatio`, `rectRelativeTo`. A member has one name, the same in a text and a definition. `context["clientSize"]` reads that property by the same name.

<a id="case-sensitive-names-field-names-and-bindings"></a>

#### Field names and bindings

Field names and bindings keep the exact spelling their author gave them, so `hasFocus` and `hasfocus` are two fields, and a binding `panel` is not a binding `Panel`.

<a id="case-sensitive-names-strings"></a>

#### Strings

Strings are preserved exactly: `kind = "List"` answers `List`. A string names a member or field only in a bracket property access, which reads the one its string names, exactly, a data field whose key is no DOMQL name among them, as `o["data-key"]` reads a bound object's field `data-key`. A value passed to a browser API, such as a selector, an attribute's name or value, or an event type, follows that API's own case rules.

A field answers the key its name is written as, and how a consumer matches keys to its own members is its own: a consumer that cannot tell `hasFocus` from `hasfocus` reports the ambiguity, and the language is unaffected. How a module names an operation in DOMQL, and which function carries it out, is the module's declaration.

<a id="access-and-calls"></a>

## Access and calls

In this section: [Property access, calls and indexers](#property-access-calls-and-indexers) · [Bracket property access](#bracket-property-access) · [Arguments](#arguments) · [Simple expressions](#simple-expressions).

<a id="property-access-calls-and-indexers"></a>

### Property access, calls and indexers

Property access, calls and indexers are distinct constructs. The vocabulary declares which form a member takes.

| Construct | Required form | Optional form | Example |
| --- | --- | --- | --- |
| Dot property access | `receiver.property` | `receiver?.property` | `context.children.count` |
| Bracket property access | `receiver[name]` | `receiver?[name]` | `context[name]` |
| Call | `receiver.method(…)` | `receiver?.method(…)` | `context.closest(".row")` |
| Named indexer | `receiver:indexer[key]` | `receiver?:indexer[key]` | `context:attribute["data-key"]` |
| Default indexer | `receiver:[key]` | `receiver?:[key]` | `context:["data-key"]` |

```domql
context.children.count                            // A dot property access.
context.closest(".row")?.rect?.width              // A call, then optional access.
context:attribute["data-key"]                     // A named indexer.
window:media["(min-width: 40em)"]             // Another named indexer.
context.closest("[data-group]")?.matches(".open") ?? false
```

<a id="property-access-calls-and-indexers-property-access"></a>

#### Property access

A dot property access reads a property and takes no arguments. Whitespace cannot replace the dot: `context rect width` is an error suggesting `context.rect`.

Bracket property access chooses a property by name. It follows the same member contract as dot access; see [Bracket property access](#bracket-property-access).

<a id="property-access-calls-and-indexers-required-access-and-optional-chains"></a>

#### Required access and optional chains

Required access needs a receiver whose type cannot be null. A nullable receiver is a validation error that suggests optional access.

Optional access reads or invokes the member only when its receiver is not null. Otherwise it answers null and skips the remainder of that chain, including argument or key evaluation.

For example, `panel.parent?.children.count` answers null when the panel has no parent. Otherwise `.count` counts its parent's children.

A group ends the optional chain. In `(panel.parent?.children).count`, `.count` receives a `list<element>?`, so this is a validation error.

Optional access is also valid on a receiver whose current type cannot be null. A parameter typed by one binding may be nullable under another.

<a id="property-access-calls-and-indexers-optional-enclosed-access"></a>

#### Optional enclosed access

`(? … )` makes every member access in its enclosed member chain optional:

| Written | Equivalent accesses |
| --- | --- |
| `(?panel.first(".row").rect.width)` | `panel?.first(".row")?.rect?.width` |
| `(?(panel.parent as "element").rect.width)` | `(panel?.parent as "element")?.rect?.width` |
| `(?((a.x ?? b) as "element").rect)` | `((a.x ?? b) as "element")?.rect` |

The enclosed form requires a receiver followed by at least one property access, call or indexer. Its receiver is an input, `context`, a parameter, a root, a literal, an interpolated string, a local, a local function's call or an object expression, or a grouped cast.

Accesses in a grouped cast's target also become optional. A coalescing target in parentheses, an already optional enclosed target, call arguments, indexer keys and bracket property names retain their own rules.

An optional enclosed access written directly as a call's argument is a syntax error, since `(?` is one token: the call writes it in parentheses of its own, `.closest((?…))`.

The closing parenthesis ends the enclosed optional chain. `(?x.y.z)?.a.b` is `(x?.y?.z)?.a.b`; `.b` still requires a non-null `a`.

A projection or any other expression beyond that member chain is a syntax error. The definition records the individual accesses as optional. Canonical text writes `?.`, `?[` and `?:` rather than the enclosed shorthand.

<a id="property-access-calls-and-indexers-calls"></a>

#### Calls

A call takes zero or more positional arguments inside parentheses, separated by commas. Each argument is a [simple expression](#simple-expressions). The chain may continue after the call.

Argument count and types come from the signature. `context.closest(".a", ".b")` is a validation error because `closest` takes one argument.

Calls do not accept named arguments. `context.rectRelativeTo(relativeTo = other)` is a syntax error suggesting an options object. A member declared with options takes one object, for example `sentinel.intersects({ root = panel, margin = 200 })`.

<a id="property-access-calls-and-indexers-named-indexers"></a>

#### Named indexers

A named indexer takes one key, written in brackets after the colon and name. The key is a [simple expression](#simple-expressions).

| Form | Meaning |
| --- | --- |
| `context:attribute["data-key"]` | Invoke `attribute` with one key |
| `context:style[property]` | Compute the key and invoke `style` |
| `x:lookup["a"]["b"]` | Invoke `lookup`, then read property `b` of its result |
| `window.size["width"]` | Read property `width` of `size` |

The indexer's brackets are required. `context:attribute`, `context:attribute[]` and `context:attribute["a", "b"]` are syntax errors.

`?:` is the optional form. For a null receiver it answers null without evaluating the key.

A colon after a complete value can only begin an indexer. In `{ key = context:attribute["data-key"] }`, the `=` introduces the field value, and the colon invokes its indexer.

<a id="property-access-calls-and-indexers-default-indexers"></a>

#### Default indexers

Omitting the indexer name selects the receiver type's default indexer:

| Form | Equivalent named indexer |
| --- | --- |
| `context:["data-key"]` on an element | `context:attribute["data-key"]` |
| `list:[2]` | `list:item[2]`, the third item |

`?:[…]` is the optional form. A receiver type has at most one default indexer. If it has none, preparation fails with a validation error asking for an indexer name.

<a id="property-access-calls-and-indexers-member-form-and-parsing"></a>

#### Member form and parsing

A property must be read as a property. Operations, event sources, actions and behaviors use calls, and only an operation can be declared an indexer, which is invoked as one.

Using another form is a validation error that gives the required form:

> 'attribute' is an indexer: write 'context:attribute[…]'

The text alone determines construct boundaries. Parsing does not consult the vocabulary or the number of parameters a member declares.

<a id="bracket-property-access"></a>

### Bracket property access

Bracket property access chooses a property by name. `context["rect"]` and `context.rect` resolve the same member, with the same implementation, type, null behavior and observations.

```domql
target {
    let name = if wide then "size" else "clientSize" end,

    bounds = context["rect"],
    chosen = context[name],
    named = context[property ?? "size"]
}
```

<a id="bracket-property-access-determining-possible-names"></a>

#### Determining possible names

Preparation must determine every property name the expression can produce. Only these forms participate, recursively:

| Form | Names considered |
| --- | --- |
| String literal | That string |
| `null` | No string name; null must be removed before the final result |
| Bound parameter | The value settled during preparation |
| Local | Names determined from its value |
| Conditional binding | Names determined from its value's truthy part, without null or false |
| Conditional | Names from its possible branches |
| Coalescing | Its value's names, plus the fallback's if the value may be null |
| `and` | Falsey parts of operands before the last, plus the last operand's values |
| `or` | Truthy parts of operands before the last, plus the last operand's values |

A fixed test or operand can decide the selection during preparation. An unreached branch, fallback or operand contributes no names. A test decided only at evaluation leaves both branches' names possible; evaluation reads the selected property.

Every branch, fallback and operand is still validated for syntax and types. In `context["size" ?? context:["x"]]`, only `size` needs name resolution; the fallback is neither evaluated nor observed.

<a id="bracket-property-access-name-expression-types"></a>

#### Name expression types

The complete expression must produce a string. Null is allowed within it only where removed, as `property ?? "size"` removes a null binding. A possible false or other non-string value is a validation error.

Logical expressions participate only when their types fit. `context[wide and "size" or "rect"]` can select either string when its fixed operands settle it.

The falsey part can also be known from a nullable non-Boolean operand: `context.first(".a") and "size"` gives null or a name. The final bracket expression must still remove the possible null.

`context[context.attached and "size" or "clientSize"]` is refused because no type holds both false and a string. Write the choice as a conditional:

`context[if context.attached then "size" else "clientSize" end]`.

An expression outside the permitted forms, such as `context[context:["data-name"]]`, is a validation error saying its names cannot be determined.

<a id="bracket-property-access-validation-and-result-type"></a>

#### Validation and result type

Every possible name must be a property of the receiver. Their result types must merge as conditional branches do. In the example above, `context[name]` is a `size?`.

Resolution is retained for the strings supplied by the current bindings. Rebinding a name requires resolving it again.

<a id="bracket-property-access-evaluation-and-observation"></a>

#### Evaluation and observation

The name is computed once, then the selected property is read. `[…]` requires a non-null receiver. `?[…]` answers null for a null receiver without evaluating the name.

For an unknown receiver type, preparation still determines the possible names. Whether each names a property is checked when the receiver type becomes known.

A watch follows both what computing the name reads and the selected property's dependencies. Either may cause reevaluation and switch the selection.

<a id="bracket-property-access-one-property-at-a-time"></a>

#### One property at a time

A name selects one property. `context["grid.columns"]` does not follow a path. Operations require calls; numeric list indexing uses the default indexer, `list:[2]`.

A field is always named, as in `bounds = context["rect"]`.

When the name is a string literal that is a DOMQL name, its definition is the same as dot access: `context["rect"]` has the definition of `context.rect`.

<a id="arguments"></a>

### Arguments

A call takes its arguments by position, none or several, and an indexer its one key, each a simple expression, and the member's declaration states what they supply, its **input**:

<a id="arguments-positional"></a>

#### Positional

Positional: the arguments supply the member's parameters in order, as `".row"` supplies the selector in `context.closest(".row")` and `"data-key"` the name in `context:attribute["data-key"]`.

Its required parameters come before its optional ones, so the parameters left out are the last: a required one must be given, a missing optional one takes its default, and more arguments than it has parameters is a validation error, `'closest' takes one argument, and is given 2`, which for a member with optional parameters says how many it takes at most, `'…' takes at most 2 arguments, and is given 3`.

<a id="arguments-options"></a>

#### Options

Options: the one argument is an object expression written in place, whose fields supply the member's parameters by name, as `{ root = panel, margin = 200 }` does for `intersects`.

Each field follows its parameter's rules; a field the member has no parameter for is a validation error naming those it has, a required parameter must be given, and a missing optional one takes its default. Where every parameter is optional, the argument can be left out, as in `sentinel.intersects()`, and a second argument is a validation error.

An object means options only by its member's input: the object a positional member is given is its parameter's value.

An options object follows the ordinary rules of an object expression. Its options are evaluated once each, in the order they are written, whatever order the member declares its parameters in. Each written option is in scope by its name after its initializer, as [a field is](#locals-fields-as-names), so in `sentinel.intersects({ margin = 200, root = if margin > 100 then panel else null end })` the `root` option reads the `margin` written before it. Where no object expression encloses it, an options object builds the [object root](#locals-the-object-root), each option a field of it after its initializer, of the value and type it was given, an element included; inside one, `root` keeps the enclosing object root, whose fields the options never join. A default the member supplies introduces no name and no field. An option the member declares as an expression or a predicate is evaluated by the member, against the context it supplies, with the names and the object root of the place it is written; it has no single value, so reading it by its name or through `root` after its initializer is a validation error, which no enclosing name of its spelling escapes.

Every parameter of a member is declared as one of four kinds, and the evaluator treats them differently; a parameter an options object supplies is the same.

- A **value argument** is evaluated once, where the call is written, against the same evaluation context as the chain it appears in, so its `context` is that evaluation context. In `viewport { intersects = context.first(".item")?.intersects({ root = context.parent as "element" }) }`, `context.parent` is the viewport's parent, not the item's. At the top level, where there is no evaluation context, a value argument starts from a parameter, a root, a local, a literal, an object expression or another input: `target.intersects({ root = target.parent as "element" })`.
- An **expression argument** is evaluated by the member against each item of the list the member follows, which is its `context`. In `table.all("tbody tr").max(context.rect?.height)`, `context` is each row. The built-in vocabulary's expression parameters are those of `max`, `min` and `sum`.
- A **predicate argument** is an expression argument of any value, and the member receives its truthiness, a Boolean, for each item it evaluates it against: in `panel.children.where(context:["data-key"])`, the element's attribute is truthy wherever it is present, empty or not. The built-in vocabulary's predicate is that of `where`.
- A **function argument** is a function value, an arrow function written as the argument or a function passed by its name, which the member calls with arguments of the types its **callback contract** declares, taking a result of the contract's result type. Preparation checks each function the value may be against the contract, and evaluation checks the member's arguments and the function's result. The member calls it only while its own invocation lasts, and a call after that fails. The built-in vocabulary has no function parameters, so `where`, `max`, `min` and `sum` take contextual expressions, and an arrow function given to one is a validation error saying its parameter takes a contextual expression, as `rows.where(context.visible)`; a module declares them.

A value argument can be declared **fixed**, where it selects something validation needs before evaluation, such as the event type whose members `on` offers or the condition `is`, `has` or `supports` asks.

A fixed argument is a string the query's preparation settles, without reading the document or depending on an event: a literal, a bound parameter, a local or a conditional binding holding one, a local holding a `do` block whose locals and result all settle, a function parameter within a call's body, which is resolved with its arguments, and an `and`, an `or`, a conditional or a coalescing operator whose result they settle by the rules that evaluate it everywhere, as `window { let feature = "share", supportsShare = context.supports(feature) }` and `panel.is(wide and "disabled" or "readonly")` are.

A member's value is read from the document, so an expression that needs one to settle is a validation error, as `if panel.attached then "share" else "share" end` is; the side an expression does not take is validated and selects nothing, so a name only it holds is never looked up.

Because the kind is part of the signature, preparation validates every kind before evaluation, and evaluation records the dependencies of value, expression, predicate and function arguments.

<a id="simple-expressions"></a>

### Simple expressions

A **simple expression** is an expression allowed in a delimited value position:

- A member call's or local function call's argument.
- An indexer's key.
- The name expression in bracket property access.
- An interpolation in an interpolated string.

Simple expressions include values, references, arithmetic, comparisons, logical expressions, property accesses, indexers, calls, and object expressions or interpolated strings whose contents are also simple. They also include a simple conditional: one `if` branch and one `else` branch, each containing one simple value.

```domql
let calculate = function(width, gap) width - gap end
let adjusted = do
    let doubled = (panel.rect?.width ?? 0) * 2
    return doubled + 1
end
return calculate(adjusted, if wide then 10 else 20 end)
```

<a id="simple-expressions-excluded-constructs"></a>

#### Excluded constructs

A simple expression cannot contain a `do` block, a local declaration, a conditional binding, `return`, a function declaration, or a conditional beyond the simple form.

A function declaration is a syntax error there, as anywhere a function stands other than alone as a local's initializer, and so are a local declaration and `return` written where the value itself stands. The others are structure errors that ask for the value to be bound to a local first:

| Invalid expression | Reason |
| --- | --- |
| `calculate(do return 10 end)` | Contains a `do` block |
| `calculate(if let w = panel.size?.width then w else 0 end)` | Contains a conditional binding |
| `calculate(if compact then return 10 else return 20 end)` | Contains `return` |
| `$"Total: {do return 10 end}"` | Contains a `do` block |

<a id="simple-expressions-recursive-restrictions"></a>

#### Recursive restrictions

The restrictions apply through parentheses, conditional tests and branches, nested calls, indexers, bracket property access, object fields and interpolations. Adding parentheses or line breaks does not change them.

`calculate((do return 10 end))` is refused. `calculate((if compact then 10 else 20 end))` is allowed.

A simple conditional cannot contain another conditional anywhere within it. An `elseif`, a nested conditional in a branch, and a conditional inside a call or interpolation within that branch are all refused.

<a id="simple-expressions-calling-a-function"></a>

#### Calling a function

The restriction applies to what is written at the argument position. A function called there may use locals, `do` blocks, full conditionals and `return` in its own body.

`calculate(double(width))` can therefore be valid. `calculate(double)` passes a function itself and is a validation error.

<a id="simple-expressions-validation"></a>

#### Validation

The grammar names these positions with `simple-expression`. Its productions can reach a parenthesized full expression, so structural validation also enforces the restrictions. It applies equally to parsed text and directly created definitions, and identifies the construct that violates them.

<a id="expressions"></a>

## Expressions

Expressions read values, compute new values and choose which values to read. All expressions are typed before evaluation. A branch that is not reached is still validated, but is not evaluated or observed.

In this section: [Expression structure and precedence](#expression-structure-and-precedence) · [Tests](#tests) · [Truthiness](#truthiness) · [Equalities](#equalities) · [Arithmetic](#arithmetic) · [Comparisons](#comparisons) · [Logical expressions, negations and groups](#logical-expressions-negations-and-groups) · [Conditionals](#conditionals) · [Coalescing operators](#coalescing-operators) · [Casts](#casts) · [Conversions](#conversions) · [Attempts](#attempts) · [Interpolated strings](#interpolated-strings).

<a id="expression-structure-and-precedence"></a>

### Expression structure and precedence

An operator is present only when its token is written. A value alone is not implicitly an equality, a test, a cast or a conversion.

The following table gives the relative binding of operators. Restrictions below still apply: sharing a row or appearing in the table does not make every combination legal.

| From tighter to looser | Forms |
| --- | --- |
| Member chains and projection | `.`, `?.`, `[…]`, `?[…]`, `:name[…]`, `?:name[…]`, `{ … }` |
| Casts and conversions | `as`, `to`; `try` applies to one cast or conversion |
| Arithmetic negation | Unary `-` |
| Multiplication and division | `*`, `/`, `%` |
| Addition and subtraction | `+`, `-` |
| Equality or numeric comparison | `==`, `!=`; `<`, `<=`, `>`, `>=` |
| Logical negation | `not` |
| Conjunction | `and` |
| Disjunction | `or` |

`??` has its own grouping rules. It must be separated by parentheses from binary arithmetic, equality, comparisons, `not`, `and` and `or`. See [Coalescing operators](#coalescing-operators).

<a id="expression-structure-and-precedence-equality-and-comparison-boundaries"></a>

#### Equality and comparison boundaries

Equality does not chain: `a == b == c` is a syntax error. Group an equality when comparing its Boolean result: `(a == b) == c`.

Numeric comparisons may form a chain only when every operator points the same way. Group a comparison beside an equality: `(a < b) == c`.

<a id="expression-structure-and-precedence-cast-and-conversion-boundaries"></a>

#### Cast and conversion boundaries

`as` begins a cast. Casts do not chain without parentheses, and a member chain continues from a cast only through a group.

`to` converts the value before it. Conversions written in succession run from left to right. A member chain continues from a conversion only through a group.

`to` remains usable as a declared name or member name:

| Use | Example |
| --- | --- |
| Field | `{ from = 1, to = 2 }` |
| Local | `{ let to = "3", value = @to to "number" }` |
| Caller binding | `~to` |
| Property | `range.to` |
| Call | `range.to()` |
| Indexer | `range:to[1]` |

<a id="expression-structure-and-precedence-attempt-boundaries"></a>

#### Attempt boundaries

`try` must precede one conversion or cast. Group an inner operation to make clear which operation is attempted:

- `try (a to "string") to "number"` attempts the outer conversion.
- `try a to "string" to "number"` is a syntax error.
- `try node as "element" to "string"` is a syntax error.

<a id="expression-structure-and-precedence-conditional-bindings"></a>

#### Conditional bindings

A conditional binding exists only where `let` follows `if` or `elseif`. It binds the whole condition after `=`. See [Conditionals](#conditionals).

<a id="expression-structure-and-precedence-members-require-their-punctuation"></a>

#### Members require their punctuation

A name after a complete value cannot invoke a member without its punctuation. `panel matches ".open"` is a syntax error that suggests `panel.matches(…)`.

A chain consists of its input and the member accesses and object expressions that continue it. `42` and `panel` are chains with no continuation.

Conditions and the operands of `not`, `and` and `or` accept values and test their [truthiness](#truthiness), rather than requiring Boolean values.

<a id="tests"></a>

### Tests

A test is a member that answers a Boolean, read as every member is.

```domql
document.is("visible")
panel.first("input")?.is("disabled")
input.hasSelection
input.is(state)
```

<a id="tests-members"></a>

#### Members

A test is a property or an operation whose result is a `boolean` or a `boolean?`: `context.is("disabled")` asks whether an element is disabled, and `context.matches(".toolbar > button:first-child")` whether it matches a selector. A test of presence is named with `has`, as `hasChildren` and `hasSelection` are, since `children` and `selection` read what is present.

A test follows the access rules as every member does, so one of a receiver that can be null is read with `?.` and is a `boolean?`, and `input[state]` reads the Boolean property a binding names, such as `hasChildren`, as the section on bracket property access sets out. The built-in vocabulary's tests are in its table of properties, and a module declares a test as it declares any member.

<a id="tests-no-test-by-name-after-"></a>

#### No test by name after `==`

`==` compares values, so `input == "disabled"` compares an element with a string, a validation error that gives the member to write, `input.is("disabled")`.

<a id="truthiness"></a>

### Truthiness

Only null and false are **falsey**. Every other value is **truthy**.

| Falsey | Truthy examples |
| --- | --- |
| `null`, `false` | `true`, `0`, `""`, `"false"`, empty lists, empty objects |

Conditions, conditional bindings, `and`, `or`, `not` and predicate arguments test truthiness. Testing truthiness converts nothing and invokes no conversion.

<a id="truthiness-declared-boolean-results"></a>

#### Declared Boolean results

A member declared to return `boolean` must return a Boolean. Truthiness does not relax its contract: another result type is an evaluation error wherever the value is used.

<a id="truthiness-stable-references-and-narrowing"></a>

#### Stable references and narrowing

A condition or a logical operand can establish facts about a stable reference: a local, conditional binding, parameter or evaluation context. Each is tracked by identity, not spelling. A local in one object expression says nothing about a same-named local in another, and each nested evaluation context has its own identity.

| Outcome | Guaranteed fact |
| --- | --- |
| A reference is truthy | It is not null |
| A reference is falsey | It is null or false |
| `ref == null` is true | `ref` is null |
| `ref != null` is true | `ref` is not null |
| `not e` | Reverses the guarantees of `e` |
| An `and` is truthy | Every operand was truthy; all their guarantees hold |
| An `or` is falsey | Every operand was falsey; all their guarantees hold |

When several paths can produce an outcome, only guarantees shared by all paths survive. A falsey `and` or truthy `or` may have stopped at different operands. `a != null or b != null` therefore guarantees neither value individually is non-null.

A member is read anew at each occurrence and is never narrowed. Bind its value to a local to test it once and reuse it.

<a id="truthiness-where-narrowing-applies"></a>

#### Where narrowing applies

The right operand of `and` sees its left operand as truthy. The right operand of `or` sees its left operand as falsey.

A conditional's consequent sees its condition as truthy. Its alternative and later `elseif` clauses see that condition as falsey.

A narrowed Boolean remains a Boolean; the type system does not distinguish literal true from literal false.

<a id="truthiness-validation-and-evaluation"></a>

#### Validation and evaluation

Narrowing changes neither evaluation nor the requirement to validate every operand and branch. Unreached operands and branches are not evaluated or observed and cannot cause runtime failures.

<a id="equalities"></a>

### Equalities

`a == b` compares two values, and `a != b` is its negation.

```domql
action == "save"
panel.parent == null
left:["name"] == right:["name"]
(try item.parent as "element") == panel
count != 0
```

<a id="equalities-comparison"></a>

#### Comparison

Strings compare exactly, by code unit; numbers numerically, so `-0 == 0` is true; Booleans by value; and nodes by identity, so `a == b` asks whether they are the same node. Nothing is converted.

<a id="equalities-null"></a>

#### Null

Null equals only null, and a value of any type is compared with null, one that cannot be null included, so `panel.parent == null` asks whether the panel has a parent.

<a id="equalities-types"></a>

#### Types

Two values whose types fit neither way, as `"1" == 1` or an `element` with a `document`, are a validation error naming both; an `element` and a `node` fit, as do a `number` and a `number?`. A structured value, a list, an object, the window and a view are compared with null alone, and an event source, an action or a behavior is no operand of `==` or `!=`.

<a id="equalities-results"></a>

#### Results

An equality answers a `boolean`, never null, evaluating both operands once, from left to right, and a watch follows what both read. Where it decides a path, a comparison with null [narrows](#truthiness) a stable reference, so `a != null and a.rect` reads a local `a` that is not null; it narrows no member, which is read anew wherever it is written.

<a id="equalities-"></a>

#### `!=`

`!=` has the definition of `not` around `==`, and the canonical text writes it so: `not (a == b)` and `not a == b` are both written `a != b`.

<a id="equalities-binding"></a>

#### Binding

A dot binds tighter than `==`, and so do an indexer, a cast, a conversion, an attempt and arithmetic, so `panel:["role"] == null` tests the attribute and `panel.matches(".open") == false` tests the match.

An equality takes an additive expression on either side, including a chain, cast, conversion, attempt or arithmetic expression, and does not chain, so `a == b == c` is a syntax error and `(a == b) == c` compares the first's result; it stands beside a coalescing operator or a [comparison](#comparisons) only where a group holds one of them, `(count ?? 0) == 0` and `(a < b) == c`.

For a nullable Boolean `x`, comparing and negating answer differently where `x` is null:

| Expression | Where `x` is null | Same as |
| --- | --- | --- |
| `x == true` | false | `x ?? false` |
| `x == false` | false | `not (x ?? true)` |
| `x != true` | true | `not (x ?? false)` |
| `x != false` | true | `x ?? true` |

<a id="arithmetic"></a>

### Arithmetic

`+`, `-`, `*`, `/` and `%` compute with numbers, and `-` before a value negates it, so a query derives the values it needs from the ones it reads: remaining space, a size's difference, a position relative to another element.

```domql
panel {
    remaining = (context.clientSize?.width ?? 0) - (context.first(".content")?.rect?.width ?? 0),
    half = (context.rect?.width ?? 0) / 2,
    padded = (context.rect?.width ?? 0) + 24
}
```

<a id="arithmetic-numbers-alone"></a>

#### Numbers alone

Both operands are numbers, and nothing converts to one but `to`, so `"2" + 1` is a validation error and `+` joins no text. An operand that can be null is a validation error too, so missing data never becomes zero: give it a fallback, `(… ?? 0)`, or test it first.

<a id="arithmetic-precedence"></a>

#### Precedence

An arithmetic negation binds tightest of them, then `*`, `/` and `%`, then `+` and `-`; operators of one level associate to the left, so `10 - 3 - 2` is 5, and parentheses group as they do anywhere.

Arithmetic binds tighter than an equality and a comparison and looser than a conversion, so `counter:["data-count"] to "number" + 1` converts the attribute and then adds one, a validation error since the attribute can be missing, written `(counter:["data-count"] to "number" ?? 0) + 1` to give it a fallback first, and `(a + b) to "string"` converts the sum. `-x to "number"` negates the converted value, and `(-x) to "number"` converts the negated one.

<a id="arithmetic-attempts"></a>

#### Attempts

`try` applies to the conversion or the cast written after it, and that attempt is an operand of arithmetic, so `try x to "number" + 1` is `(try x to "number") + 1`, a validation error since its left operand can be null; `(try x to "number" ?? 0) + 1` gives its fallback first.

<a id="arithmetic-beside-"></a>

#### Beside `??`

`??` and binary arithmetic stand apart, one of them grouped, as it stands apart from `and`, `or`, an equality and a comparison: `a ?? b + 1` is a syntax error, written `(a ?? b) + 1` or `a ?? (b + 1)`. An arithmetic negation is no binary arithmetic, so `value ?? -1` stands.

<a id="arithmetic-literals"></a>

#### Literals

An arithmetic negation of a numeric literal is that negative literal in a definition, `-0` included, as the parsed text holds it, so `-5 to "string"` negates a conversion, a validation error since what `-` negates is a number, and `(-5) to "string"` converts the literal `-5`, giving `"-5"`.

<a id="arithmetic-evaluation"></a>

#### Evaluation

The left operand is evaluated, then the right; arithmetic does not short-circuit, and an operand that fails fails it. Numbers are IEEE 754 doubles, so `0.1 + 0.2` is `0.30000000000000004`, and `%` is the remainder with the sign of the dividend, so `-5 % 3` is `-2`.

A division or a remainder by zero, and a result no finite number holds, are evaluation errors at the operation, so neither infinity nor NaN reaches a result.

<a id="arithmetic-watching"></a>

#### Watching

Arithmetic reads what its operands read, and observes nothing of its own. A computed number is compared exactly, whatever tolerance a member it reads declares, since a product or a quotient changes the scale a tolerance was set for.

<a id="comparisons"></a>

### Comparisons

`<`, `<=`, `>` and `>=` order two numbers, and a chain of them pointing one way orders several, so a query tests a value it reads or calculates against a bound or a range.

```domql
panel {
    isWide = (context.rect?.width ?? 0) >= 600,
    fits = 0 < (context.clientSize?.width ?? 0) - 32 <= 400
}
```

<a id="comparisons-numbers-alone"></a>

#### Numbers alone

Every operand is a number, as arithmetic's are, and nothing converts to one but `to`, so `"a" < "b"` is a validation error and text is ordered by no comparison. An operand that can be null is a validation error too: give it a fallback, `(w ?? 0) < 600`, or test it first. A comparison answers a `boolean`, never null.

<a id="comparisons-chains"></a>

#### Chains

`0 < width <= 600` is `0 < width and width <= 600`, its middle operand evaluated once.

Every operator of a chain points one way, `<` and `<=` or `>` and `>=`, strict and inclusive mixed, so `a < b <= c` and `a >= b > c` are chains, and `a < b > c` is a syntax error at the `>` that turns it; a peak or a valley is written with `and`, as `b > a and b > c`.

A comparison in parentheses is a Boolean, so `(a < b) < c` is a validation error, never a chain.

<a id="comparisons-binding"></a>

#### Binding

Arithmetic binds tighter than a comparison, and a comparison tighter than `not`, `and` and `or`, so `0 < width - padding * 2 <= 600 and enabled` reads as written and `not a < b` is `not (a < b)`.

A comparison stands at an equality's level and apart from it, one of them grouped, so `a < b == c` is a syntax error written `(a < b) == c`, and apart from a coalescing operator, so `w ?? 0 < 600` is written `(w ?? 0) < 600`.

<a id="comparisons-evaluation"></a>

#### Evaluation

Operands are evaluated from left to right, each at most once, and the first comparison that is false answers false without evaluating the operands after it, as an `and` stops at a falsey operand.

Numbers compare as IEEE 754 doubles, so `-0 < 0` is false; every number a query holds is finite, since a literal, a binding, a member's result, a conversion and arithmetic each give a finite number or none.

<a id="comparisons-watching"></a>

#### Watching

A watch follows what the operands it evaluated read, and an operand a false comparison left unevaluated contributes nothing. A comparison answers a Boolean, which a snapshot compares exactly, so a member's tolerance does not soften its boundary: `width >= 600` changes each time a width crosses 600, and a boundary that should hold until a value moves further is the vocabulary's to declare.

<a id="logical-expressions-negations-and-groups"></a>

### Logical expressions, negations and groups

`and` and `or` answer the operand that decides them, `not` answers whether a value is falsey, and parentheses group any expression.

```domql
panel.attached and enabled
input.is("disabled") or (input.is("readonly") and input.is("text-editable"))
panel { available = context.attached and not busy }
panel { let input = context.first("input"), width = input and input.rect?.width }
panel:["data-label"] or "untitled"
```

<a id="logical-expressions-negations-and-groups-operands"></a>

#### Operands

An operand of `and` and `or`, and what `not` negates, is any value, an event source, an action or a behavior being a validation error; each later operand sees what the operands before it guarantee where it is reached, as [narrowing](#truthiness) sets out.

<a id="logical-expressions-negations-and-groups-binding"></a>

#### Binding

An equality binds tighter than `not`, `not` tighter than `and`, and `and` tighter than `or`, so `panel.attached or not input == null and enabled` combines the negation of the input's equality and `enabled` before the panel's test. `not` associates to the right, so `not not a` negates `a` twice, and `and not` and `or not` are `and` and `or` of a negation.

<a id="logical-expressions-negations-and-groups-results"></a>

#### Results

`and` answers its first falsey operand, or its last where every one before it is truthy, and `or` its first truthy operand, or its last where every one before it is falsey, each as it is, never copied or converted: `null and "value"` is null, `0 or 10` is 0 and `"" or "fallback"` is the empty string.

`not` answers a `boolean`, true where its operand is falsey. Of Booleans, they answer what Boolean logic does.

<a id="logical-expressions-negations-and-groups-type"></a>

#### Type

`and` is of the falsey part of each operand before its last, merged with its last, and `or` of the truthy part, merged with its last: a value that can be null has null for its falsey part and itself without null for its truthy part, a Boolean is a Boolean in both, and any other value is truthy only.

So `panel.first(".a") and 5` is a `number?`, `name or "untitled"` a `string` where `name` is a string, and Booleans give a `boolean`. Where fixed operands, literals and bound parameters, decide it, it is of the one that does, so `true and "value"` is a `string`.

Values no one type holds are a validation error, as `context.is("disabled") and context` in an object expression, which gives false or an element: unlike Lua, DOMQL types every expression, and offers no type for false or true beside another, so a conditional chooses between values of one type, `if context.is("disabled") then context else null end`, where null is an acceptable alternative.

<a id="logical-expressions-negations-and-groups-not-a-conditional"></a>

#### Not a conditional

`and` and `or` choose a value only where the value that decides them is the one wanted: `true and false or "fallback"` is "fallback", since false is falsey, so a choice whose chosen value can be false or null is a conditional, `if condition then value else fallback end`.

<a id="logical-expressions-negations-and-groups-evaluation"></a>

#### Evaluation

Operands are evaluated from left to right, each once, and evaluation stops at the first that decides the result, a falsey one for `and` and a truthy one for `or`, so the operands after it are unreached: they are still validated, but are not evaluated or observed and cannot produce runtime failures.

A watch follows the operands evaluation reached, so it holds what an operand reads only while evaluation reaches it.

<a id="logical-expressions-negations-and-groups-groups"></a>

#### Groups

A parenthesized expression holds an expression and adds nothing of its own, so `((panel))` is `panel`, and as a chain input it can start a chain: `(panel).children.count`.

<a id="conditionals"></a>

### Conditionals

A conditional chooses a branch by truthiness. It starts with `if`, has a `then` branch and an `else` branch, and closes with `end`. Optional `elseif` clauses are tested in order.

Each branch is a [body](#bodies): one expression, or locals followed by `return`. Every branch of one conditional must use the same result style.

```domql
if wide then panel else sidebar end
if let row = cell.closest(".row") then { key = row:["data-key"], top = row.rect?.top } else null end
if panel.first("input")?.is("disabled") then "locked" elseif panel.first("input") == null then "empty" else "open" end
panel { state = if context.is("disabled") then "locked" else "open" end }
{ let target = if wide then panel else sidebar end, width = target.rect?.width }
```

The first answers an element, which no result holds, so it stands within a larger query, as the conditional of the last does.

<a id="conditionals-conditions-and-selection"></a>

#### Conditions and selection

A condition may be any value. An event source, action or behavior is not a condition and causes a validation error.

A truthy condition selects its consequent. A falsey condition continues to the next clause. If no condition is truthy, the `else` branch is selected.

The branches see the facts guaranteed by each condition's outcome; see [Truthiness](#truthiness). An always-truthy condition is valid, including a list. To test whether a list has items, use `panel.hasChildren` or `items.count != 0`.

<a id="conditionals-conditional-bindings"></a>

#### Conditional bindings

`if let name = value then … else … end` evaluates `value` once, binds it, and tests its truthiness.

| Bound value | Selected path |
| --- | --- |
| null or false | The next clause or `else` |
| Zero, empty text, empty list or any other truthy value | The consequent |

The name has the value's type without null. A Boolean remains a Boolean. A value that cannot be null can still select the alternative if it is false.

The name is visible throughout its consequent, including nested expressions. It is absent from its own initializer, the alternative and later `elseif` clauses.

Where no local, field or function parameter of that name is in scope, using the name in its own initializer is a structure error rather than a caller-binding reference: `if let k = k then …` is refused, and `if let k = ~k then …` reads the caller's binding. Where one is in scope, the initializer reads it. In the alternative and later clauses, the name again reads what it reads outside the conditional.

The name follows local naming rules, and may hide an outer local, field or caller binding. Event sources, actions and behaviors cannot be bound as conditional values. `elseif let` follows the same rules.

<a id="conditionals-branch-types"></a>

#### Branch types

All branches are required. Their types must merge, with object types compared structurally. Nullability may differ.

| Branch types | Conditional type |
| --- | --- |
| `number`, `number?` | `number?` |
| `number`, `null` | `number?` |
| `number`, `string` | Validation error naming both types |

<a id="conditionals-evaluation-and-watching"></a>

#### Evaluation and watching

Only the selected branch is evaluated. Its value is returned unchanged, including false or null. Every other branch is validated, but not evaluated or observed.

A watch follows each tested condition or bound value through the selected clause, then the selected branch.

<a id="conditionals-grouping-and-chain-receivers"></a>

#### Grouping and chain receivers

A branch takes a whole body, including an ungrouped conditional. In `if a then b else c and d end`, the `and` belongs to the alternative.

A conditional used as a condition or as an operand of any operator, arithmetic, a comparison, `??` and `not` among them, must be grouped. For example: `if (if a then b else c end) then 1 else 2 end`.

A conditional cannot be a chain receiver, even when grouped. `(if wide then panel else sidebar end).rect?.width` is a syntax error. Bind the conditional to a local first, then continue from the local.

There is no `?:` conditional form. Each `elseif` writes its entire condition or binding; it inherits nothing from the previous clause.

<a id="coalescing-operators"></a>

### Coalescing operators

A coalescing operator answers its value where it is not null, and otherwise its fallback: `value ?? fallback`.

```domql
panel.rect?.width ?? 0
panel:["data-label"] ?? panel:["title"] ?? "untitled"
panel.first("input")?.is("disabled") ?? true
```

<a id="coalescing-operators-evaluation"></a>

#### Evaluation

The value is evaluated once, and the fallback only where the value is null, so a watch follows what the fallback reads while the value is null alone. False, zero and the empty string are values, which the fallback never replaces.

A fallback that evaluation does not reach is still validated, but is not evaluated or observed and cannot produce runtime failures, and a failure of either side that evaluation does reach stays a failure.

<a id="coalescing-operators-null-alone"></a>

#### Null alone

`??` falls back for null and `or` for null and false: `false ?? true` is false, and `false or true` is true. `try value to "number" ?? 0` gives a default for null alone, which an attempt's rejection is.

<a id="coalescing-operators-type"></a>

#### Type

The value and the fallback are of one type, compared as a conditional's branches are, and the whole is of the value's type made non-null where the fallback's is, so `panel.rect?.width ?? 0` is a `number`.

A value of the type `null` gives the fallback's type, and `??` after a value that cannot be null is valid, since a binding typed from its value may be one that can.

<a id="coalescing-operators-association"></a>

#### Association

`??` associates to the right, so `a ?? b ?? 0` is `a ?? (b ?? 0)`, and each side is a chain, a cast, a conversion, an attempt or an arithmetic negation, or binary arithmetic only in a group, as arithmetic sets out.

<a id="coalescing-operators-grouping"></a>

#### Grouping

A coalescing operator stands beside `not`, `and`, `or`, an equality and a comparison only where a group holds one of them, so `enabled ?? false and ready` and `a ?? b == null` are syntax errors, while `(enabled ?? false) and ready` and `enabled ?? (ready and visible)` each say what they mean.

<a id="casts"></a>

### Casts

A cast answers a node as one of its kinds: `target as "type"` answers its target itself where it is of that type, and null where it is null. A node of another kind fails the evaluation, which [an attempt](#attempts), `try target as "type"`, answers null for instead.

```domql
panel.parent as "element"
(panel.parent as "element")?.rect?.width
(preferred ?? fallback) as "element"
(?(panel.parent as "element").rect.width)
(try panel.parent as "element")?.rect?.width
```

The first and the third answer an element, which no result holds, so each stands within a larger query, as the casts of the others do.

<a id="casts-target-type"></a>

#### Target type

The type is a quoted type name, `node` or one of its kinds, and the cast is of that type, nullable where its target can be null, so `panel.parent as "element"` is an `element?` and `panel as "element"`, with `panel` bound to an element, an `element`; an attempted cast is nullable always.

A type that is no node is a validation error naming those a cast takes.

<a id="casts-strict"></a>

#### Strict

A cast states the kind the query expects, and a node of another kind fails the evaluation with an evaluation error naming what it is, as `The cast to element rejected its value: it is a document`, so a document where an element is expected is an error, never a silent null.

A cast that probes which kind a node is is attempted, `(try item.parent as "element") == panel`.

<a id="casts-what-it-narrows"></a>

#### What it casts

A cast of a `node` to one of its kinds, and one to its target's own type, to `node`, or of null is valid, since a binding typed from its value may already be of the type or null. A cast of a target that can never be of the type, such as `5 as "element"` or `document as "element"`, is a validation error.

A cast converts nothing and narrows nothing outside itself: its target keeps its type wherever else it is read.

<a id="casts-cast-target"></a>

#### Cast target

Its target is a receiver and the members after it, a coalescing operator in parentheses, or an optional enclosed access: `panel.parent as "element"`, `(preferred ?? fallback) as "element"` and `(?panel.parent) as "element"`. Any other grouped expression is no target, so `(if wide then a else b end) as "element"` is a syntax error, and neither is a chain an object expression continues.

<a id="casts-binding"></a>

#### Binding

A cast binds looser than access, so a call receives it only through a group: `(panel.parent as "element")?.matches(".row")` tests the cast. A chain continues from a cast only through a group, `(panel.parent as "element")?.rect`, and a cast takes another as its target only in one, `(node as "node") as "element"`, so `panel.parent as "element".rect` and `a as "node" as "element"` are syntax errors.

<a id="casts-in-an-optional-enclosed-access"></a>

#### In an optional enclosed access

In an optional enclosed access , a cast in parentheses is a receiver, and the accesses of its own target become optional with the enclosed access's: `(?(panel.parent as "element").rect.width)` is `(panel?.parent as "element")?.rect?.width`.

A target that is a coalescing operator in parentheses or an optional enclosed access is cast as it is and keeps its own rules: `(?((preferred ?? fallback) as "element").rect)` is `((preferred ?? fallback) as "element")?.rect`.

<a id="casts-evaluation"></a>

#### Evaluation

The target is evaluated once, and the cast answers it unchanged where it is of the type.

<a id="conversions"></a>

### Conversions

A conversion answers a value converted to another type of data: `value to "type"` evaluates its value, carries out the conversion the vocabulary declares from the value's type to the type it names, and answers the converted value. A cast converts nothing, and a conversion casts nothing.

```domql
panel:["data-count"] to "number"
panel:["data-count"] to "number" ?? 0
panel:["aria-expanded"] to "boolean"
panel.children.count to "string"
```

<a id="conversions-target-type"></a>

#### Target type

The type is a quoted type name: `number`, `string`, `boolean`, or a structured type that holds data alone, whatever its fields hold, lists of data among them, as `grid` holds its columns.

A conversion converts data, so a node, a structured type that holds one, and an event source are no type it converts between, and what reads the document stays a member's, which declares how it changes; a node is cast to one of its kinds with `as`.

A list itself is no type a conversion converts between, and neither is a type that can be null. A name no type has is a validation error, as is any other target.

<a id="conversions-one-declared-conversion"></a>

#### One declared conversion

A value converts to another type only through the one conversion the vocabulary declares from its type to that type. Conversions never chain on their own: a Boolean converts to a string and a string to a number, and `enabled to "number"` is still a validation error, whose message names the types a Boolean converts to. A query that means both conversions writes both.

<a id="conversions-a-value-already-of-the-type"></a>

#### A value already of the type

A value already of the type answers itself, so `5 to "number"` is 5. This is the language's rule, and no conversion is declared from a type to itself.

<a id="conversions-null"></a>

#### Null

A conversion of null answers null without converting, and its type is the type it converts to, made nullable where its value can be null.

A value of the type null, a null binding, converts to any type a conversion can name, however many conversions reach it, since nothing is converted; a value whose type is known is checked by that type without null, so `panel.closest(".row") to "string"` is a validation error, as a conversion from an element is declared nowhere.

<a id="conversions-what-fails"></a>

#### What fails

A value its conversion rejects, as `"12px" to "number"`, fails the evaluation with an evaluation error naming the conversion, the reason it gave and where it stands. A conversion that fails otherwise, by throwing or by answering a value not of its type, has a fault, which fails the evaluation too.

A failure never answers null or a default: `?? 0` gives a missing attribute a value, and leaves a malformed one an error, for which [an attempt](#attempts) answers null instead. A watch whose conversion fails is failed until its value converts again.

<a id="conversions-evaluation"></a>

#### Evaluation

The value is evaluated once, and a conversion reads nothing but that value, so what a watch of a conversion depends on is what its value depends on.

<a id="attempts"></a>

### Attempts

`try` attempts the one conversion or cast written after it, and answers null where that operation rejects its value: `try value to "type"` answers the converted value where the conversion accepts the value, and `try target as "type"` answers its target where it is of the type. Its type is the operation's, made nullable.

It handles a value its operation rejects without failing, as `??` handles a missing one, so the two together give a value either way:

```domql
panel { count = try context:["data-count"] to "number" ?? 0 }
(try panel.parent as "element")?.rect?.width
```

A missing attribute is null, which converts to null, and malformed text is rejected, so both give zero, and text that converts gives its number; a parent that is a document or a shadow root is rejected, so the width is null for it, as it is for a missing parent.

A [conditional binding](#conditionals) gives the converted value a name where the query uses it more than once, `if let count = try context:["data-count"] to "number" then … else … end`.

<a id="attempts-one-operation"></a>

#### One operation

`try` attempts the one conversion or cast written after it, and nothing else, so it is no general catch of errors: a failure while its value is evaluated, a rejection by a conversion or a strict cast that value holds among them, fails the evaluation as it would anywhere, so `try (node as "element").parent as "element"` attempts the outer cast alone.

A conversion of a conversion or of a cast is grouped to say which one is attempted, `try (a to "string") to "number"`, so `try a to "string" to "number"` and `try node as "element" to "string"` are syntax errors, as is `try` before anything that is neither, another `try` among them.

<a id="attempts-one-set-of-rules"></a>

#### One set of rules

An attempt resolves as its operation does strictly, so a cast to a type that is no node or of a target that can never be of it, a conversion to a target no type has, a pair no conversion is declared for, and a nullable value whose type has no conversion are validation errors for both.

It answers a value already of the type as it is, and null for null.

<a id="attempts-a-rejection-alone-is-null"></a>

#### A rejection alone is null

A cast rejects a node of another kind, and a conversion the value it calls `reject` for. A conversion that throws, rejects with a reason that is no string, rejects and then answers, or answers a value not of its type has a fault, which fails the evaluation whether or not the conversion is attempted.

<a id="attempts-null-means-a-rejection"></a>

#### Null means a rejection

For a non-null input, a successful conversion returns a non-null value of its declared target type. A conversion returning null is a fault, including under `try`. Consequently, for a stable bound value, `value != null and try value to "type" == null` is true exactly when the conversion rejects that value.

A cast answers its target itself, so the same holds for `try target as "type"`. Faults remain errors.

<a id="attempts-evaluation"></a>

#### Evaluation

Its value is evaluated once and its operation carried out once, and what a watch of it depends on is what its value depends on.

<a id="attempts-binding"></a>

#### Binding

`try` binds tighter than `==`, `!=` and `??`, and looser than the operation it attempts, so `try v to "number" == 5` compares the converted value, `(try node as "element") != null` asks whether the node is an element, and `try v to "number" ?? 0` gives its fallback for both null and a rejection.

It stands where an equality operand stands; a conversion of its result groups it, `(try v to "number") to "string"`, and a cast takes none as its target, so `(try a as "node") as "element"` is a syntax error.

A result that keeps the converted number and tells a missing value from a malformed one says which it is beside the value, reading the attribute once through a local:

```domql
panel {
    let count = context:["data-count"],
    count = if let n = try count to "number" then { status = "valid", value = n }
    elseif count == null then { status = "missing", value = null }
    else { status = "malformed", value = null } end
}
```

<a id="interpolated-strings"></a>

### Interpolated strings

`$"…"` joins text and inserted values, and so do `$'…'` and the interpolated blocks, `$"""…"""` and `$'''…'''`. Each interpolation is `{`, one [simple expression](#simple-expressions), then `}`. Arithmetic `+` does not join text.

```domql
panel {
    label = $"{context:["data-count"] ?? "no"} unread in {context.children.count} rows",
    title = $"{{panel}} {context:["id"] ?? "untitled"}"
}
```

<a id="interpolated-strings-text-and-braces"></a>

#### Text and braces

Text follows its family's rules: an interpolated string's and its block's escapes, consumed whole, so `\u{7B}` inserts a brace without opening an interpolation, and an interpolated raw string's literal backslashes and doubled quote, as `$'C:\Users\{name}\Documents\'` and `$'It''s {name}'` show.

Double a brace to include it as text, `{{` or `}}`, in both families. For a binding `name` equal to `Eyal`, `$"{{{name}}}"` produces `{Eyal}`, as `$'{{{name}}}'` does.

A lone `}` is a syntax error. `\{` is not an escape. Without `$`, every brace is text: `"Use {name}"` and `'Use {name}'` have no interpolation.

<a id="interpolated-strings-interpolation-expressions"></a>

#### Interpolation expressions

An interpolation uses the scope and evaluation context where the interpolated string appears. It may contain its own strings, objects, comments and interpolated strings, subject to the simple-expression restrictions.

An interpolation stands on one source line, its `{`, its expression and its `}`, in a block as inline: a line break in the expression, its comments or its strings is a syntax error, so no block stands in an interpolation, and a longer calculation belongs in a local whose name is interpolated.

An interpolation that begins with an object expression groups it in parentheses: `$"{({ x = 1 }.x)}"` inserts 1, and `$"{ { x = 1 }.x}"` is a syntax error suggesting the group, whatever whitespace or comment stands before the object expression; `{{` is always a literal brace in text. An empty interpolation is a syntax error.

<a id="interpolated-strings-accepted-values"></a>

#### Accepted values

| Interpolation value | Inserted text |
| --- | --- |
| Non-null string | The string itself |
| Non-null number | The built-in number-to-string representation |
| Nullable value | Validation error; supply a fallback or test it first |
| Boolean, list, object, node or other value | Validation error; explicitly convert or choose text |

Negative zero inserts `0`, and `1e21` inserts `1e+21`. A nullable name can use `{name ?? "Unknown"}`. A Boolean can use `to "string"` or a conditional, such as `{if done then "Done" else "Pending" end}`.

Interpolation calls no module-registered conversion. The result is plain text, escaped for no other language.

<a id="interpolated-strings-result-and-evaluation"></a>

#### Result and evaluation

An interpolated string returns a non-null `string` and can start a chain, like a string literal.

It cannot settle a fixed argument or a bracket property's possible names, even if it contains text alone. It also cannot replace a string literal required by the grammar, such as a cast or conversion type name.

Interpolations evaluate once each, from left to right. A shared local is evaluated once under the local's rules. A failed interpolation fails the entire string; no partial text is returned.

A watch follows the interpolations' dependencies and compares the resulting text exactly. A member's numeric tolerance does not carry into a number inserted as text.

<a id="interpolated-strings-canonical-text"></a>

#### Canonical text

Canonical text always uses `$"…"`, with text escaped as an ordinary string and braces doubled. Each interpolation's expression is on one line, with no padding inside the braces, and one that begins with an object expression is grouped in parentheses.

<a id="calculations-and-reuse"></a>

## Calculations and reuse

In this section: [Bodies](#bodies) · [Locals](#locals) · [Functions](#functions).

<a id="bodies"></a>

### Bodies

A **body** produces one value. It is either a single expression, or an ordered sequence of locals followed by `return` and the result expression.

A query is a body. So is a `do … end` block, a conditional branch, and a local function's body.

```domql
let width = panel.rect?.width ?? 0
let padding = 12
return {
    wide = width - padding * 2 >= 600,
    doubled = do
        let half = width / 2
        return half * 4
    end
}
```

<a id="bodies-result-forms"></a>

#### Result forms

A single-expression body needs no `return`: `panel.rect?.width` and each branch of `if wide then 1 else 2 end` are examples.

A body with locals must introduce its result with `return`. A body may also use `return` without locals, as in `return 0`.

Only locals may precede the result. An unused standalone calculation, such as `panel.rect.width` before `return 42`, is a syntax error:

> Only locals may precede a body's result.

Line breaks do not end an initializer. `let available = width` followed on the next line by `- padding * 2` is still one local declaration.

Bodies place local declarations one after another. Object expressions use the same local construct but separate entries with commas.

<a id="bodies-one-result-at-the-end"></a>

#### One result at the end

The result must be a value. An event source, action or behavior is a validation error here.

Nothing follows the result. A later local, a second `return`, or a `return` without a value is a syntax error. A result may itself be a conditional or `do` block, each of which produces its own body's value.

<a id="bodies-return-belongs-to-its-body"></a>

#### Return belongs to its body

`return` completes the body it ends, never an enclosing body.

In `let x = if wide then let n = 3 return n * 2 else return 0 end`, the truthy branch returns 6 to the initializer. A query result of `return x + 1` then gives 7.

A `do` block's `return` similarly gives the block's value, and evaluation continues outside the block.

<a id="bodies-conditional-branch-style"></a>

#### Conditional branch style

Within one conditional, either every branch uses `return` or none does. If one branch declares locals, all its sibling branches must use `return`.

Mixing the styles is a syntax error:

> All branches of this conditional must give their results with return, or none of them

A nested conditional chooses its own style. An `else` whose expression is a conditional, `else if … end`, may follow branches of expressions with a conditional of either style, and may follow branches that use `return` with one whose branches use `return` too, the definition an `elseif` gives, which the canonical text writes as `elseif`. After branches that use `return`, an `else if … end` of expression branches is a syntax error.

<a id="bodies-positions-and-scope"></a>

#### Positions and scope

`return` stands at the end of a query body, a `do` body, a function body or a conditional branch. It cannot appear among object fields.

A body's local is visible after its initializer, through later locals, the result and everything nested in them. It cannot read itself or a later local. `let a = b let b = 1 return a` is a structure error rather than a read of the caller's `b`.

Two locals in one body cannot share a name. A nested body may hide an enclosing name. A local accepts any name, including a reserved word, and is never reassigned.

<a id="bodies-ordered-evaluation"></a>

#### Ordered evaluation

Every local runs once in declaration order each time its body runs, including unused locals. The result runs after them.

A failed local fails the body even if nothing uses it. A watch follows every evaluated local's dependencies.

Object-expression locals instead run at first use; an unused object local does not run. See [Locals](#locals).

<a id="bodies-using-a-bodys-value"></a>

#### Using a body's value

A `do` block or conditional must be grouped when used as an operand. Neither can be a chain receiver, grouped or not. Bind its value to a local before continuing a chain.

A [simple expression](#simple-expressions) cannot contain a `do` block or a full conditional. An argument that needs such a calculation uses a local holding its value.

<a id="bodies-fixed-arguments"></a>

#### Fixed arguments

A local holding a `do` block can settle a fixed argument only if every local evaluated in that block and its result can settle it. Reads made by unused body locals cannot be discarded.

For example, `let state = do let chosen = "disabled" return chosen end` may supply `context.is(state)`. A body local whose value cannot settle a fixed argument, as one that reads the document or holds an interpolated string, prevents the block from settling one.

<a id="bodies-definition-and-canonical-text"></a>

#### Definition and canonical text

A body with explicit `return` is a `body` node containing ordered `locals` and a `result`. A body containing just an expression is that expression's own node, except a `do` block's: a `do` block is always a `do` node holding its body, so `do 7 end` is a `do` node whose body is the literal's node. A `body` node stands only as a query's, a `do` block's, a function's or a conditional branch's body.

Within one conditional, branches are all `body` nodes or none are; a branch that is a `do` block is an implicit branch, whose result is its `do` node. The alternative may itself be a conditional: after branches that use `return`, one whose branches use `return` too, as an `elseif` gives; after expression branches, one of either style.

Canonical text places each body local and its result on separate lines. A conditional with implicit results and no `elseif` stays on one line, and a `do` block as its branch is written without parentheses: `if w then do 1 end else 2 end`. Explicit-return branches are indented within their clauses, and `end` stands on its own line.

<a id="locals"></a>

### Locals

A local names an intermediate value with `let`. Later entries use that name, so the value is written and evaluated once.

```domql
panel {
    let items = context.all("[data-key]"),

    width = context.size?.width,
    rows = items {
        key = context:["data-key"],
        top = context.rectRelativeTo(panel)?.top
    },
    tallest = items.max(context.rect?.height),
    attached = context.attached
}
```

<a id="locals-declaration-and-use"></a>

#### Declaration and use

An object expression writes its locals before its first field. Each local is `let name = initializer`, followed by a comma. The object must still have at least one field: `{ let x = 1 }` is a syntax error.

A local name can start a chain, take a projection, or supply an argument. A reserved local name uses `@name` when referenced. A local holding a value cannot be called: `items(…)` is a validation error.

Locals occur only in bodies and object expressions. A [simple expression](#simple-expressions) holds no body, and an object expression inside one, a member's options object among them, declares no locals.

<a id="locals-sequential-scope"></a>

#### Sequential scope

A local is visible after its initializer, through later locals, fields and everything nested in them, including arguments. It is not visible in its own initializer or before its declaration.

If a name is declared as a local later in the same scope, an earlier bare reference is a structure error. It never falls back to the caller's binding. Both of these are refused regardless of caller bindings:

- `{ let a = b, let b = 1, c = a }`
- `{ let n = n, a = 1 }`

Use `~name` to read the caller's binding explicitly, even before or beneath a same-named local. `{ let n = ~n + 1, value = n }` reads the supplied `n`. A missing explicit caller binding is a validation error.

A local in a sibling or unrelated scope does not hide a caller binding. In `{ a = panel { let n = 1, v = n }, b = n }`, field `b` reads the caller's `n`.

<a id="locals-resolution-and-diagnostics"></a>

#### Resolution and diagnostics

An [identifier](#names-and-reserved-words) reads the nearest visible local, field, conditional binding or function parameter of that name. If none is visible, it reads the value the caller passed under that name, and preparation fails if the caller passed none; a reference before a local of its name declared later in the same scope is refused instead, as [sequential scope](#locals-sequential-scope) sets out.

When the evaluation context has a member of that name, the diagnostic suggests its receiver:

> No local in scope or binding is named 'rect'; write 'context.rect' for the member of the evaluation context

<a id="locals-duplicate-names-and-shadowing"></a>

#### Duplicate names and shadowing

Two locals in one object expression cannot share a name. Neither can two fields. Both are structure errors.

A local or field can hide a name from an outer scope: a local, field, conditional binding or caller binding. The nearest visible declaration wins; `~name` still reads the caller binding. Reserved names are allowed.

A field may reuse a local's name. Its initializer reads the local, then the field hides it:

`panel { let items = context.all("li"), items = items.count, more = items + 1 }`.

Here `items` in `more` is the count field.

<a id="locals-fields-as-names"></a>

#### Fields as names

A field's name becomes visible after its value, throughout later fields and expressions nested in them. Its own initializer reads the enclosing name.

After `let count = 10`, the object `{ before = count, count = count + 1, after = count }` gives 10, 11 and 11.

A field reference reuses the value and dependencies already obtained; it evaluates nothing again. Each application of a projection, including each list item, has its own fields. Outside the object expression, the name resumes its enclosing meaning.

<a id="locals-the-object-root"></a>

#### The object root

Written inside an object expression, `root` refers to the outermost object being built, the object root. A nested object reads the object root's fields through it, even where a nearer field has the same name:

```domql
{
    bar = 4,
    inner = {
        bar = 2,
        nearest = bar,        // 2
        outermost = root.bar  // 4
    }
}
```

- **Where it exists.** `root` must be written inside an object expression, and elsewhere is a structure error; a function declared outside every object expression cannot use it, even when it is called inside one. Each evaluation and each event builds a new object root. When `rows { … }` has no enclosing object expression, each item gets its own object root. Nested objects and projections retain the enclosing object root, and an options object follows the same rules, as [Options](#arguments-options) describes.
- **Which fields it has.** At each reference, only fields of the object root whose initializers have already completed in the declared field order are accessible. The field currently being initialized and later fields are unavailable:

```domql
{
    inner = {
        value = root.inner // Error: inner is still being built.
    }
}
```

- **Aliases and functions.** An alias, as `let r = root`, retains the set of fields available where it was declared, even when used later. A function that uses `root` itself captures the fields available where the function is declared, while a function parameter given `root` receives those available where the call passes it.
- **No extra work.** `root.bar` reuses the value already computed for `bar`, and nothing is evaluated again; a watch treats it as that field.
- **Not part of a result.** A reference to the object root may be held in a local, passed to a function and returned from one, but cannot itself be included in the query's result data: `{ copy = root }` is a validation error. Read a field instead, as `root.bar`.

<a id="locals-object-root-references"></a>

#### Object root references

A function's result keeps the fields of the reference it returns. After `let identity = function(value) value end`, `identity(root).a` reads `a` wherever `a` is available where the call passes `root`, and `{ copy = identity(root) }` is refused as `{ copy = root }` is.

Where a conditional or `??` can give either of two references, both must refer to the same object root with the same fields available; nullability combines as usual, so `if wide then root else null end` gives a reference that can be null, whose fields are read with `?.`. Any other pair is a validation error, as branches of different types are.

<a id="locals-captured-context"></a>

#### Captured context

A local's `context` is the evaluation context of the object expression declaring it, regardless of where the local is used. In the example, `context` inside `rows` is the current row, while `items` remains the panel's list.

<a id="locals-lazy-evaluation-in-objects"></a>

#### Lazy evaluation in objects

Each evaluation of each object-expression application has its own locals. A local runs at most once, at its first use. An unused local never runs and contributes no observation dependencies.

In `panel.children { let r = context.rect, … }`, each child has its own `r`. The next evaluation creates fresh locals.

A [body's](#bodies) locals differ: they run in order, even when unused. All locals are still resolved and validated before evaluation.

<a id="locals-output"></a>

#### Output

A local is not a field and is never included in the result. It may hold values that a query result cannot contain, such as an element or a list of elements.

<a id="functions"></a>

### Functions

A **function** names a calculation a query repeats. It is declared in one of two forms, held by a local, called by that local's name with its **arguments**, and passed, held and returned as a value within the query.

```domql
let measure = function(box, padding)
    let width = box.rect?.width ?? 0
    return width - padding * 2
end
return {
    panel = measure(panel, 12),
    sidebar = measure(sidebar, 0)
}
```

<a id="functions-declaring-one"></a>

#### Declaring one

A **regular function** is `function`, its **function parameters** in parentheses and its body, closed by `end`. Its body follows the rules of a [body](#bodies): an expression alone, as `function(x) x * 2 end`, or locals and a `return`, which completes the body and gives the call its value.

An **arrow function** is its parameters, `=>` and one simple expression, whose value is its result:

```domql
let answer = () => 42
let isVisible = row => row.visible
let isShown = (row) => row.visible
let byPrice = (left, right) => left.price - right.price
return answer()
```

Parentheses are optional for exactly one parameter and required for none or several. An arrow function declares no locals and holds no body, so `x => let y = …` and `x => do … end` are refused, and so is `x => y => x + y`, whose body is no simple expression; a function that holds more is a regular function bound to a local and passed by its name. Laying the expression out across lines changes nothing.

Either form is a local's initializer, of a body or of an object expression, and an arrow function is also an argument, as `apply(row => row.visible, panel)` is. Neither stands anywhere else: a field, an operand, a conditional's branch and a result hold neither, and a regular function written directly as an argument is a syntax error:

> A function declared with 'function' cannot appear directly as an argument. Bind it to a local and pass its name, or use an arrow function.

A definition holding either where text could not write it is a structure error. An object expression's function local is in scope within it, as any local is, and is no field.

Its function parameters are names of the function, two of one function never the same, visible in its body alone, where each hides an outer local, field or caller binding of its name; `~name` still reads the caller's binding.

<a id="functions-calling-one"></a>

#### Calling one

`name(argument, …)` calls the function a local or a function parameter of that name holds, with as many arguments as it declares function parameters, `seven()` with none, each a [simple expression](#simple-expressions) or an arrow function; each argument is evaluated once, from left to right, in the caller's scope, and the body then evaluates with each function parameter holding its argument. A call is a value a chain continues from, as `first(panel).children.count` does.

An operation of a vocabulary keeps its own form, `context.closest(".row")`, with the arguments its signature takes. A name no local function has is a validation error, which gives the form with `context` where the evaluation context has a member of that name, and so is a call of a local that holds a value, and a call given the wrong number of arguments.

<a id="functions-as-values"></a>

#### Functions as values

A function's name read without a call is a **function value**, held by a local, passed as an argument and returned by a function, as either form is:

```domql
let isAttached = row => row.attached
let shown = isAttached
let apply = function(test, row) test(row) end
let getTest = () => shown
let test = getTest()
return apply(test, panel)
```

A conditional or a coalescing operator may choose between functions, as `let pick = if wide then measure else count end` does: a call of `pick` is checked against each function it may be, and their results merge by the rules [branches](#conditionals) follow, a call whose functions give no one type a validation error. A value that may be null is never called; bind a function to call in its place first, as `let call = pick ?? count` does.

A function value is used within the query, and the query's result holds data alone: a field or a result that would hold a function is a validation error, and a function is never compared, interpolated, converted or given to a member's value parameter.

<a id="functions-what-it-sees"></a>

#### What it sees

A function captures the locals, the evaluation context and the object root where it is declared: its body reads them, its function parameters and its own locals, and never the caller's locals, so in `let a = 1`, `let f = function() a end` and a `do` block whose local `a` is 2 and that calls `f()`, the call gives 1. Its function parameters are ordinary ones, so an argument never replaces the evaluation context or the object root it captured. A watch's evaluation captures them anew each time.

<a id="functions-never-recursive"></a>

#### Never recursive

No function calls itself, directly, through another or through a function passed to it. A local's value sees neither its own local nor the locals after it, and preparation follows each call into the functions it may reach, so `let invoke = function(f) f(f) end` with `invoke(invoke)` is a validation error.

<a id="functions-resolved-for-each-call"></a>

#### Resolved for each call

The declaration is checked for what no argument decides, its names, its scope and its function parameters; each call resolves the body of each function it may call against that call's argument types, so one function serves arguments of different types, and a function nothing calls is never resolved further. A call settles no fixed argument.

<a id="functions-watching"></a>

#### Watching

A call reads what its arguments and the branches its body selects read, and a branch it does not select reads nothing. A call of a value that may be one of several functions reads what chose the function and what the one it called reads.

<a id="functions-definition"></a>

#### Definition

A function is a `function` node of its function parameters and its body, and an arrow function one marked `arrow: true`, whose body is its expression and is validated as a simple expression; a call is a `functionCall` node of the name and its arguments.

<a id="requests"></a>

## Requests

A request is one of four kinds, and the last member of its chain, before any object expression following it, decides which:

| Kind | Its chain ends in | Its caller |
| --- | --- | --- |
| Query | A value | Evaluates it once or watches it |
| Subscription | An event source | Subscribes to it |
| Action | An action | Executes it once, receiving its result |
| Behavior request | A behavior | Applies it, updates it with new bindings, and disposes it |

An action is a member its module carries out once when the caller executes the request, and a behavior one its module starts when the caller applies the request and runs until it is updated or disposed; each is a member kind of its own, which an extension declares, with signatures as every member has. An object expression can follow an action to shape its result.

An action or a behavior ends its request's chain, so one inside a query, an argument or another request's object expression is a validation error.

Evaluating or watching a query never performs an action or configures a behavior: a query only reads, and an action or a behavior request acts only when its caller executes or applies it. A behavior belongs to the caller that applied it.

```domql
// An action of a scroll extension: step the viewport forward, answering whether it moved.
viewport.scroll({ axis = "inline" }).step({ direction = "forward" })

// A behavior request of a scroll extension: page the viewport with the wheel while Shift is held.
viewport.scroll({ axis = "inline" }).wheelPaging({ modifier = "shift" })
```

<a id="events"></a>

### Events

A chain that ends in an event source is subscribed to, in two stages. The source hands each event to the evaluator, which evaluates the object expression following it at once, in the task the source delivers it in, with that event as its evaluation context.

The result is immutable data, and that result, never the browser's live event object or the object expression still to evaluate, is what reaches the caller, by the caller's own delivery. An event in DOMQL is what its source delivers, read through the event data it captured; the browser's own event object is never a value of the language.

Here the event source is the built-in vocabulary's native drop event:

```domql
zone.on("drop") { key = context.target?.closest("[data-drop-target]")?:["data-drop-key"] }
```

The object expression reads the event's own members, such as its target, and anything else a parameter reaches. Its members are read once per event, never watched, so an unobserved member is allowed in it.

An event source documents its members, which of them it captured when the event happened, and when it delivers the event, such as before or after the browser carries out the action it reports; everything else it reads is read as it is evaluated.

Each subscription starts its event source with its own delivery, so two callers subscribed on one element each receive their own events.

<a id="evaluation"></a>

<a id="evaluation-and-watching"></a>

## Evaluation and watching

A query is evaluated synchronously, without yielding, and a member's implementation is synchronous.

Each member declares how it obtains its value.

| Reading | Meaning |
| --- | --- |
| Fresh | Read from the document as the query evaluates, such as an attribute or a box. |
| Maintained | Kept by an observation the member holds, and read as that observation's latest sample, such as the browser's intersection observation. |
| Captured | A sample taken at a moment the member documents, such as the history a member keeps or what an event carried. |
| Derived | As the items it selects and the expression it evaluates read, such as a list's `count` or `max`. |

Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are.

A maintained member's observation starts the first time an evaluation reads it, and the member is **pending** until its first sample arrives. `evaluate()` fails on a maintained member, since reading it waits for the first sample, which a synchronous evaluation cannot; `evaluateAsync` and a watch wait for its first sample, and an event's object expression reads it as null while it is pending. The evaluator keeps pending apart from unavailable; the [DOMQL design](domql-design.md) sets out when a request waits for first samples.

Evaluating a query is read-only for every vocabulary. A measurement that needs the document changed first, such as measuring columns at their intrinsic widths under a temporary class, is an action of its own.

A member whose result depends on what happened before, as well as on the document as it is, is captured: it keeps that history while a watch or an event listener holds it, and documents what an evaluation once reports without it.

In this section: [Elements that leave the document](#elements-that-leave-the-document) · [How a member changes](#how-a-member-changes).

<a id="elements-that-leave-the-document"></a>

### Elements that leave the document

An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`.

An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout.

<a id="how-a-member-changes"></a>

### How a member changes

Every member declares how its result changes, for a given receiver and arguments.

| Category | Meaning | In a watch |
| --- | --- | --- |
| Constant | The result never changes, as a literal's, or whether the browser offers a capability `supports` asks. | Allowed; it never invalidates. |
| Observable | The member names observations that cover every change to its result, such as a resize observation for a size. | Allowed. |
| Partly observable | The member names the observations it can make and documents the changes they miss, such as a computed style changed by a rule outside the element. | Allowed when the caller accepts partial observation for that watch; a change the observations miss reaches the watch at its next evaluation, which `refreshAsync` or another observed change causes. |
| Unobserved | The member can be read but names no observations. | A validation error. |
| Derived | The result changes as the items it selects and the expression it evaluates do, such as a list's `first` or `where`. | Allowed wherever what it derives from is. |

A literal is constant, so a watched object expression can carry one: `viewport { kind = "viewport", width = context.size?.width }`.

A watch can miss a detached tree inserted into another tree: nothing in the inserted tree changes, a shadow root's changes reach no observation of the document, and only an observation of the tree it enters would report the insertion, a tree no watch can know of beforehand.

Each member that can miss one is partly observable for what it misses: `parent` and a node's `root` miss a detached tree inserted into another detached tree or into a shadow root, `attached` misses only a detached tree inserted into a shadow root in the document, and `shadow.elements` misses a detached tree holding the slot inserted into a shadow tree that assigns it nothing. A watch of one sees the tree a receiver entered at the next evaluation another change or a refresh causes, observing that tree from then on.

A detached tree inserted into the document, a node moved within or between trees a watch observes, and a detached node another document owns, as a template's content does, inserted into the document are each observed.

<a id="vocabulary-contracts"></a>

## Vocabulary contracts

In this section: [What a member declares](#what-a-member-declares) · [Extensions](#extensions).

<a id="what-a-member-declares"></a>

### What a member declares

A member declares its kind, its signature and its runtime contract. Its kind is `property`, `operation`, `eventSource`, `action` or `behavior`, and the kind of the request a chain ending in it makes follows from it: a property or an operation makes a query, an event source a subscription, an action an action and a behavior a behavior request. The signature supplies enough information to validate a request before evaluation.

<a id="what-a-member-declares-signature"></a>

#### Signature

| Declaration | Specifies |
| --- | --- |
| Receiver type | Which values have this member |
| Form | Property access, call or named indexer |
| Input | Positional arguments or one options object |
| Parameters | Order, name, type, argument kind, required status or default, null policy, whether it is fixed and, for a fixed one, what it selects, an event type or a condition, for an expression or a predicate, its evaluation context, each item, and for a function, the types of the arguments it is called with, its type being its result's; only an operation declares a function parameter, which is required, has no null policy and is given to no observation |
| Result type | The type the member must return |

Optional and nullable are separate. An optional parameter can be omitted; a nullable parameter can receive null. Unless a vocabulary table marks a parameter optional, it is required.

Omitting a required argument is a validation error. Supplying null follows the parameter's null policy.

<a id="what-a-member-declares-call-and-indexer-forms"></a>

#### Call and indexer forms

An operation, an event source, an action or a behavior is written as a call. An operation may instead declare an indexer with exactly one required value parameter, supplied as its bracketed key. Its input is positional, and its key has the declared parameter type.

An indexer may be the default for its receivers. Registration refuses a second default for the same receiver.

Positional input lists parameters in order, with required parameters before optional ones; creating the module checks this order. Options input takes one object whose fields supply the declared parameters.

Changing a member's input is a breaking change, like renaming it. An operation expected to grow uses options from the start.

<a id="what-a-member-declares-evaluation-contract"></a>

#### Evaluation contract

In addition to the signature, a member declares how it reads, how its result changes, the changes it misses, which a partly observable member states, and the observations that cover its changes, which an observable or a partly observable member names and no other does; its request kind follows from its kind.

An expression parameter declares the item type it evaluates against and the result type it requires. A predicate accepts a value expression and receives its truthiness as a Boolean.

| List operation | Contract |
| --- | --- |
| `where`, `:[index]`, `first`, `last` | Preserve `T` from a `list<T>` |
| `where` | Evaluate a predicate against each `T`; the predicate may produce any value |
| `max`, `min`, `sum` | Evaluate against each `T` and require `number?` |

Aggregates consume null per item rather than propagating it to the entire call. `max` and `min` skip null values and return null if all items were skipped. `sum` skips null values and returns zero if all were skipped or the list is empty.

Thus `table.all("tbody tr").max(context.rect?.height)` and `panel.all("[data-key]").where(context.intersects({ root = panel })).count` are valid even though the expressions can return null.

An object expression following `event<T>` evaluates against event data of type `T`.

<a id="what-a-member-declares-numeric-tolerance"></a>

#### Numeric tolerance

A member may declare a tolerance for its numeric result and every number within a structured result. When comparing snapshots, a watch treats an absolute difference no greater than this tolerance as unchanged. This rule applies regardless of the member's form.

<a id="extensions"></a>

### Extensions

An extension adds members under one name of its own, a member of a built-in type whose value carries the extension's members: `viewport.scroll({ axis = "inline" })` is a scroll extension's view of an element along an axis, and `canScrollForward` is one of its members.

The name is the extension's namespace: a member it declares on a type it does not own is named for the extension, and on a type of its own it names its members freely. A member whose name is already declared for an overlapping receiver, by the built-in vocabulary or by another module, is refused at registration, so a module named as a built-in member or condition cannot add it on that member's or condition's receivers.

Its conditions follow the same rule: on a type it does not own it names a condition for itself, and on its own types it names them freely; a name already declared for an overlapping receiver is refused, whatever its verb.

Types, event types and observation types each share one namespace across every module, the built-in one included, and a name already declared there is refused at registration too.

An extension is a module, made by `createModule` from its name, its declarations and the functions that carry them out, and registered with `registerModule`; a declaration that breaks the contract is a module error, raised when the module is created or when it is registered.

The built-in vocabulary declares the native event types its callers need, and an extension can declare more. A subscription observes an event as it reaches its target and leaves its course to the page.

An extension can define types of its own, properties, operations written as calls or as named indexers, conditions, event sources, event types, observation types, actions and behaviors, and conversions to and from its own types, one for each source type and target, and follows the built-in vocabulary's contract throughout: every member declares its signature, its argument kinds, its result type and how it changes, and evaluating a query stays read-only and synchronous.

<a id="built-in-vocabulary"></a>

## Built-in vocabulary

The built-in vocabulary exposes properties and operations over familiar browser concepts. Properties and operations are named in camelCase. Names are case-sensitive. Measurements use CSS pixels unless stated otherwise. Built-in members expose state or event sources; actions and behaviors come from extensions.

A field of a structured value, such as a rectangle's `width`, is data the value holds, read by property access, and is constant for that value. A property is read by property access, and an operation is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out.

A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

In this section: [Properties](#properties) · [Operations](#operations) · [Conditions](#conditions) · [Built-in conversions](#built-in-conversions) · [Event sources](#event-sources).

<a id="properties"></a>

### Properties

A property exposes a value, read by property access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as the section on evaluation defines.

| Receiver | Property | Type |
| --- | --- | --- |
| Window | [`size`](#property-window-size) | `size` |
| Window | [`devicePixelRatio`](#property-window-devicepixelratio) | `number` |
| Element | [`rect`](#property-element-rect) | `rectangle?` |
| Element | [`size`](#property-element-size) | `size?` |
| Element | [`clientSize`](#property-element-clientsize) | `size?` |
| Element | [`grid`](#property-element-grid) | `grid?` |
| Element | [`selection`](#property-element-selection) | `selection?` |
| Node | [`children`](#property-node-children) | `list<element>` |
| Node | [`parent`](#property-node-parent) | `node?` |
| Node | [`root`](#property-node-root) | `node` |
| Node | [`host`](#property-node-host) | `element?` |
| Element | [`shadow`](#property-element-shadow) | `shadow` |
| Element | [`aria`](#property-element-aria) | `aria` |
| Shadow view | [`root`](#property-shadow-view-root) | `shadowRoot?` |
| Shadow view | [`elements`](#property-shadow-view-elements) | `list<element>?` |
| Element | [`attached`](#property-element-attached) | `boolean` |
| Element | [`hasChildren`](#property-element-haschildren) | `boolean` |
| Element | [`hasSelection`](#property-element-hasselection) | `boolean` |
| List | [`count`, `first`, `last`](#property-list-count-first-last) | `number`, `T?`, `T?` for a `list<T>` |

<a id="property-window-size"></a>

<a id="properties-window-size"></a>

#### Window: size

**Type:** `size`   **Reads:** Fresh

**Result.** The layout viewport's `width` and `height`, excluding scrollbars

**Changes.** Observable, a viewport scrollbar appearing or going included: the window's `resize` and its visual viewport's `resize` are observed

<a id="property-window-devicepixelratio"></a>

<a id="properties-window-devicepixelratio"></a>

#### Window: devicePixelRatio

**Type:** `number`   **Reads:** Fresh

**Result.** Device pixels per CSS pixel

**Changes.** Observable

<a id="property-element-rect"></a>

<a id="properties-element-rect"></a>

#### Element: rect

**Type:** `rectangle?`   **Reads:** Fresh

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport

**Changes.** Partly observable: its own size, the scrolling of its scroll containers, the window's size and the structure of the trees it is in are observed; a move none of them causes, as a sibling before it growing or a margin or padding around it changing, and transforms and animations, are not

<a id="property-element-size"></a>

<a id="properties-element-size"></a>

#### Element: size

**Type:** `size?`   **Reads:** Fresh

**Result.** Its border box's `width` and `height`

**Changes.** Observable

<a id="property-element-clientsize"></a>

<a id="properties-element-clientsize"></a>

#### Element: clientSize

**Type:** `size?`   **Reads:** Fresh

**Result.** Its padding box's `width` and `height`, without scrollbars

**Changes.** Partly observable: its border box and its content box are observed, so a scrollbar appearing or going and a border changing are; a border and padding changing so that one grows by as much as the other shrinks, which leaves both boxes as they were, is not

<a id="property-element-grid"></a>

<a id="properties-element-grid"></a>

#### Element: grid

**Type:** `grid?`   **Reads:** Fresh

**Result.** Its grid's `columns`, the sizes of its column tracks, an empty list for an element that is no grid, and null while it has no layout box

**Changes.** Partly observable, as `style`

<a id="property-element-selection"></a>

<a id="properties-element-selection"></a>

#### Element: selection

**Type:** `selection?`   **Reads:** Fresh

**Result.** Its selection's `start` and `end`, null for an element whose selection the browser does not expose: one that is no text input or text area, and an input of a type the selection API excludes, as `number`, `email` and `date` are

**Changes.** Partly observable: input and selection events are observed, assignments by script are not

<a id="property-node-children"></a>

<a id="properties-node-children"></a>

#### Node: children

**Type:** `list<element>`   **Reads:** Fresh

**Result.** Its child elements, in document order

**Changes.** Observable

<a id="property-node-parent"></a>

<a id="properties-node-parent"></a>

#### Node: parent

**Type:** `node?`   **Reads:** Fresh

**Result.** Its parent in the DOM tree: a shadow root for the nodes directly in it, and null for a document, a document fragment, a shadow root and the topmost element of a detached tree, so it never crosses a shadow boundary

**Changes.** Partly observable: its detached tree inserted into another detached tree or into a shadow root is not observed

<a id="property-node-root"></a>

<a id="properties-node-root"></a>

#### Node: root

**Type:** `node`   **Reads:** Fresh

**Result.** The root of its tree: the document, a document fragment, the shadow root it is in, or the topmost element of a detached tree

**Changes.** Partly observable, as `parent`

<a id="property-node-host"></a>

<a id="properties-node-host"></a>

#### Node: host

**Type:** `element?`   **Reads:** Fresh

**Result.** A shadow root's host, and null for any other node

**Changes.** Constant

<a id="property-element-shadow"></a>

<a id="properties-element-shadow"></a>

#### Element: shadow

**Type:** `shadow`   **Reads:** Fresh

**Result.** Its view of its shadow relationships

**Changes.** Constant

<a id="property-element-aria"></a>

<a id="properties-element-aria"></a>

#### Element: aria

**Type:** `aria`   **Reads:** Fresh

**Result.** Its view of its ARIA states, whose [conditions](#conditions) `is` tests and whose default indexer reads its ARIA attributes

**Changes.** Constant

<a id="property-shadow-view-root"></a>

<a id="properties-shadow-view-root"></a>

#### Shadow view: root

**Type:** `shadowRoot?`   **Reads:** Fresh

**Result.** The open shadow root its element hosts, null where it hosts none or a closed one

**Changes.** Partly observable: a root attached as its element connects to its document is observed, one attached at any other time is not

<a id="property-shadow-view-elements"></a>

<a id="properties-shadow-view-elements"></a>

#### Shadow view: elements

**Type:** `list<element>?`   **Reads:** Fresh

**Result.** The elements its slot shows, flattened, as the section on shadow trees sets out, and null for an element that is no slot

**Changes.** Partly observable: assignment, the fallback and the slot's moves are observed; its detached tree inserted into a shadow tree that assigns it nothing is not

<a id="property-element-attached"></a>

<a id="properties-element-attached"></a>

#### Element: attached

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether the element is attached to the document, including through a shadow root

**Changes.** Partly observable: the structure of the document and of every shadow root between the element and the document is observed; its detached tree inserted into a shadow root in the document is not

<a id="property-element-haschildren"></a>

<a id="properties-element-haschildren"></a>

#### Element: hasChildren

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether it has at least one child element

**Changes.** Observable, through its child list

<a id="property-element-hasselection"></a>

<a id="properties-element-hasselection"></a>

#### Element: hasSelection

**Type:** `boolean`   **Reads:** Fresh

**Result.** Whether a selection of at least one character lies within it: a non-collapsed selection in a text input or text area, or a non-collapsed document selection within its content; a collapsed caret is no selection

**Changes.** Partly observable: input and selection events are observed, assignments by script are not

<a id="property-list-count-first-last"></a>

<a id="properties-list-count-first-last"></a>

#### List: count, first, last

**Type:** `number`, `T?`, `T?` for a `list<T>`   **Reads:** As their items

**Result.** The number of items, the first item and the last item, null where a list has none

**Changes.** As their items

<a id="operations"></a>

### Operations

An operation performs a lookup, a calculation or a selection with the argument it is given. A name with parentheses, as `closest(selector)`, is a call, `context.closest(".row")`; a name in brackets after a colon, as `:attribute[name]`, is a named indexer, `context:attribute["data-key"]`; and braces show an options object, whose fields supply the parameters, as `intersects({ root, margin })` does, `context.intersects({ root = panel })`.

Each operation states what it answers, how its result changes, how it reads, and which of its parameters are fixed.

| Receiver | Operation |
| --- | --- |
| Window | [`:media[query]`](#operation-window-media) |
| Element | [`:attribute[name]`, the default indexer, `:[name]`](#operation-element-attribute) |
| ARIA view | [`:attribute[name]`, the default indexer, `:[name]`](#operation-aria-view-attribute) |
| Element | [`:class[name]`](#operation-element-class) |
| Any | [`is(name)`, `has(name)`, `supports(name)`](#operation-any-is-has-supports) |
| Element | [`:style[property]`](#operation-element-style) |
| Element | [`intersects({ root, margin })`](#operation-element-intersects) |
| Element | [`overlaps({ other, margin })`](#operation-element-overlaps) |
| Element | [`matches(selector)`](#operation-element-matches) |
| Element | [`rectRelativeTo(relativeTo)`](#operation-element-rectrelativeto) |
| Element | [`closest(selector)`](#operation-element-closest) |
| Node | [`first(selector)`, `all(selector)`](#operation-node-first-all) |
| List | [`:item[index]`, the default indexer, `:[index]`](#operation-list-item) |
| List | [`max(expression)`, `min(expression)`, `sum(expression)`](#operation-list-max-min-sum) |
| List | [`where(expression)`](#operation-list-where) |

<a id="operation-window-media"></a>

<a id="operations-window-media"></a>

#### Window: media

**Syntax:** `:media[query]`   **Signature:** `query`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether the media query matches

**Changes.** Observable: the query's matching, as the browser reports it changing

<a id="operation-element-attribute"></a>

<a id="operations-element-attribute"></a>

#### Element: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The attribute's value

**Changes.** Observable

<a id="operation-aria-view-attribute"></a>

<a id="operations-aria-view-attribute"></a>

#### ARIA view: attribute

**Syntax:** `:attribute[name]`, the default indexer, `:[name]`   **Signature:** `name`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The value of the element's own attribute `aria-` and the name, as the element's `:attribute` reads it, so `context.aria:["checked"]` is `context:["aria-checked"]`: the string as written, or null where the attribute is absent, never a Boolean

**Changes.** Observable: that attribute

<a id="operation-element-class"></a>

<a id="operations-element-class"></a>

#### Element: class

**Syntax:** `:class[name]`   **Signature:** `name`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its class list holds the class, one token: an empty name, or one holding a tab, a line feed, a form feed, a carriage return or a space, is an evaluation error

**Changes.** Observable: its `class` attribute

<a id="operation-any-is-has-supports"></a>

<a id="operations-any-is-has-supports"></a>

#### Any: is, has, supports

**Syntax:** `is(name)`, `has(name)`, `supports(name)`   **Signature:** `name`: `string` → `boolean`   **Reads:** As the condition   **Fixed arguments:** `name`

**Result.** Whether the condition of the name its verb asks holds for the receiver, as [conditions](#conditions) set out

**Changes.** As the condition

<a id="operation-element-style"></a>

<a id="operations-element-style"></a>

#### Element: style

**Syntax:** `:style[property]`   **Signature:** `property`: `string` → `string?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The property's computed value, custom properties included, null where the element is detached or the value is empty

**Changes.** Partly observable: its own size and attributes are observed, rules matching from elsewhere are not

<a id="operation-element-intersects"></a>

<a id="operations-element-intersects"></a>

#### Element: intersects

**Syntax:** `intersects({ root, margin })`   **Signature:** optional `root`: `element?`, the window when omitted or null; optional `margin`: `number`, 0 when omitted → `boolean?`   **Reads:** Maintained   **Fixed arguments:** None

**Result.** Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it

**Changes.** Observable

<a id="operation-element-overlaps"></a>

<a id="operations-element-overlaps"></a>

#### Element: overlaps

**Syntax:** `overlaps({ other, margin })`   **Signature:** required `other`: `element`; optional `margin`: `number`, 0 when omitted → `boolean?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether its border box overlaps the other's, grown by the margin, compared as rectangles, null where either has no layout box, and, as `other` propagates null, where `other` is null

**Changes.** Partly observable, as `rect`, and the size of `other`

<a id="operation-element-matches"></a>

<a id="operations-element-matches"></a>

#### Element: matches

**Syntax:** `matches(selector)`   **Signature:** `selector`: `string` → `boolean`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Whether it matches the selector

**Changes.** Partly observable: attributes, structure, focus and popovers opening and closing, `:popover-open`, are observed; pointer state such as `:hover` and control state such as `:checked` are not

<a id="operation-element-rectrelativeto"></a>

<a id="operations-element-rectrelativeto"></a>

#### Element: rectRelativeTo

**Syntax:** `rectRelativeTo(relativeTo)`   **Signature:** `relativeTo`: `element` → `rectangle?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box, null where either has no layout box, and, as `relativeTo` propagates null, where `relativeTo` is null

**Changes.** Partly observable, as `rect`, and the size of `relativeTo`

<a id="operation-element-closest"></a>

<a id="operations-element-closest"></a>

#### Element: closest

**Syntax:** `closest(selector)`   **Signature:** `selector`: `string` → `element?`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The nearest matching ancestor, itself included

**Changes.** Partly observable, as `matches`

<a id="operation-node-first-all"></a>

<a id="operations-node-first-all"></a>

#### Node: first, all

**Syntax:** `first(selector)`, `all(selector)`   **Signature:** `selector`: `string` → `element?`, `list<element>`   **Reads:** Fresh   **Fixed arguments:** None

**Result.** The first matching descendant, and the matching descendants in document order, within its own tree

**Changes.** Partly observable, as `matches`

<a id="operation-list-item"></a>

<a id="operations-list-item"></a>

#### List: item

**Syntax:** `:item[index]`, the default indexer, `:[index]`   **Signature:** `index`: `number` → `T?`   **Reads:** As its items   **Fixed arguments:** None

**Result.** The item at the index, counted from zero, null for an index past the end, a negative one, which never counts from the end, and a fractional one; `-0` is `0`

**Changes.** As its items

<a id="operation-list-max-min-sum"></a>

<a id="operations-list-max-min-sum"></a>

#### List: max, min, sum

**Syntax:** `max(expression)`, `min(expression)`, `sum(expression)`   **Signature:** `expression`: `T` → `number?`; answers `number?`, `number?`, `number`   **Reads:** As their items   **Fixed arguments:** None

**Result.** An aggregate over a number expression, as the section on lists defines

**Changes.** As their items and expressions

<a id="operation-list-where"></a>

<a id="operations-list-where"></a>

#### List: where

**Syntax:** `where(expression)`   **Signature:** `expression`: a predicate of `T`; answers `list<T>`   **Reads:** As its items   **Fixed arguments:** None

**Result.** The items for which the predicate is truthy

**Changes.** As its items and expression

<a id="conditions"></a>

### Conditions

A condition is a Boolean question of its receiver, under a name of its own, asked with one of three verbs, each an ordinary call: `is` asks a state the user, the browser or the page sets and clears over time, `context.is("checked")`; `has` a possession or a presence, `context.has("focus")`; and `supports` a capability, `window.supports("share")`.

Each condition is asked with its one verb, so none stands in for another, and asking it with another is a validation error giving the verb to write, as `context.is("focus")` is. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it, as `attached`, `hasChildren` and `hasSelection` are.

<a id="conditions-condition-declarations"></a>

#### Condition declarations

Each condition is a declaration of its own, with its name, the verb that asks it, `is` where it names none, the receivers it applies to, the function that tests it, how it changes, how it reads, the changes it misses where it is partly observable, and the observations that cover it.

A test of a condition follows the condition's contract alone, so a watch of one partly observable condition needs partial observation accepted, and a watch of others does not.

<a id="conditions-fixed-condition-names"></a>

#### Fixed condition names

The name is fixed, as a [fixed argument](#arguments) is: a string the query's preparation settles without reading the document, a literal, a bound parameter, or a local, a conditional binding, a conditional, a `??`, an `and` or an `or` that settles to one, never null, which selects the condition's declaration when the query is prepared.

<a id="conditions-receiver-types"></a>

#### Receiver types

Each verb is declared on any receiver, which says only that any receiver can be asked: the condition of the name decides which receivers it applies to, so a name no condition the verb asks has is a validation error naming the conditions the verb asks, and for `has` the Boolean member that answers the presence where the receiver has one, as `hasChildren` answers for `has("children")`; and a condition of other receivers is one naming the condition, the receivers it applies to, the receiver and the conditions the verb asks of it.

<a id="conditions-it-is-a-call-as-any-other"></a>

#### It is a call as any other

`.` requires a receiver that cannot be null, and `?.is(…)` answers null for a null receiver without testing its condition; either is validated as written, its name included, whatever its receiver is when it is evaluated.

<a id="conditions-boolean-result"></a>

#### Boolean result

Its type is a Boolean that cannot be null, made nullable where `?.` reads a receiver that can be. A condition whose function answers anything else, or throws, fails the evaluation with an evaluation error that names the condition, the verb that selects it and the module that declares it.

<a id="conditions-conditions-compose-as-booleans-do"></a>

#### Conditions compose as Booleans do

Conditions compose as Booleans do: `context:class["open"] and context.has("focus-within")`.

The built-in vocabulary declares these conditions, each asked with `is` but where the table names its verb, and each with its native semantics: what the browser itself decides, as its pseudo-class matches, as the document reports its own state, or as the browser offers an API.

| Receiver | Condition |
| --- | --- |
| Element | [`disabled`](#condition-element-is-disabled) |
| Element | [`readonly`](#condition-element-is-readonly) |
| Element | [`text-editable`](#condition-element-is-text-editable) |
| Element | [`focus`, asked with `has`](#condition-element-has-focus) |
| Element | [`focus-within`, asked with `has`](#condition-element-has-focus-within) |
| Element | [`hover`](#condition-element-is-hover) |
| Element | [`popover-open`](#condition-element-is-popover-open) |
| Element | [`checked`](#condition-element-is-checked) |
| Document | [`visible`](#condition-document-is-visible) |
| Document | [`focus`, asked with `has`](#condition-document-has-focus) |
| Window | [`share`, asked with `supports`](#condition-window-supports-share) |
| Window | [`clipboard`, asked with `supports`](#condition-window-supports-clipboard) |

<a id="condition-element-is-disabled"></a>

<a id="conditions-element-isdisabled"></a>

#### Element: is("disabled")

**Reads:** Fresh

**True when.** The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `context:["disabled"]`, a separate question

**Changes.** Observable: its own and its ancestors' `disabled` attributes and the structure between them

<a id="condition-element-is-readonly"></a>

<a id="conditions-element-isreadonly"></a>

#### Element: is("readonly")

**Reads:** Fresh

**True when.** Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes

**Changes.** Observable: its `readonly` and `type` attributes

<a id="condition-element-is-text-editable"></a>

<a id="conditions-element-istext-editable"></a>

#### Element: is("text-editable")

**Reads:** Fresh

**True when.** The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, as the nearest `contenteditable` of a state, its own or an ancestor's, decides: `true`, the empty value and `plaintext-only` make it editable and `false` does not, while an invalid value, `inherit` among them, inherits, as the attribute does natively; where none decides, the document's design mode does.

An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root

**Changes.** Partly observable: everything `disabled` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not

<a id="condition-element-has-focus"></a>

<a id="conditions-element-hasfocus"></a>

#### Element: has("focus")

**Reads:** Fresh

**True when.** It is the focused element of its tree

**Changes.** Observable: focus moving, and the focused element removed, which moves focus away

<a id="condition-element-has-focus-within"></a>

<a id="conditions-element-hasfocus-within"></a>

#### Element: has("focus-within")

**Reads:** Fresh

**True when.** It matches `:focus-within`: it or an element within it is focused, across the shadow trees it hosts

**Changes.** Observable, as `focus` is

<a id="condition-element-is-hover"></a>

<a id="conditions-element-ishover"></a>

#### Element: is("hover")

**Reads:** Fresh

**True when.** It matches `:hover`: the pointer is over it or over an element within it

**Changes.** Partly observable: the pointer moving over and off elements is observed; an element moving under a pointer that does not move, where the browser fires no pointer event for it, is not

<a id="condition-element-is-popover-open"></a>

<a id="conditions-element-ispopover-open"></a>

#### Element: is("popover-open")

**Reads:** Fresh

**True when.** It matches `:popover-open`: it is a popover that is showing

**Changes.** Observable: its showing and hiding, its `popover` attribute removed and its removal included

<a id="condition-element-is-checked"></a>

<a id="conditions-element-ischecked"></a>

#### Element: is("checked")

**Reads:** Fresh

**True when.** It matches `:checked`: a checked checkbox or radio button, or a selected option

**Changes.** Partly observable: the user's input in its tree, a radio button another of its group unchecks and an option its select changes included, form resets, the `checked` and `selected` attributes and the structure of its tree are observed; a script setting `checked` or `selected`, or a select's `value` or `selectedIndex`, fires no event and is not

<a id="condition-document-is-visible"></a>

<a id="conditions-document-isvisible"></a>

#### Document: is("visible")

**Reads:** Fresh

**True when.** The document is visible

**Changes.** Observable

<a id="condition-document-has-focus"></a>

<a id="conditions-document-hasfocus"></a>

#### Document: has("focus")

**Reads:** Fresh

**True when.** Focus is anywhere within the document

**Changes.** Observable

<a id="condition-window-supports-share"></a>

<a id="conditions-window-supportsshare"></a>

#### Window: supports("share")

**Reads:** Fresh

**True when.** The browser offers the Web Share API, `navigator.share`, in this context; it says nothing of whether a particular share succeeds, which takes the user's activation, data the browser can share and the user's choice

**Changes.** Constant

<a id="condition-window-supports-clipboard"></a>

<a id="conditions-window-supportsclipboard"></a>

#### Window: supports("clipboard")

**Reads:** Fresh

**True when.** The browser offers the asynchronous clipboard, `navigator.clipboard`, which it does in a secure context alone; it says nothing of whether reading or writing is permitted, which the user and the browser decide when it is asked

**Changes.** Constant

A condition's ARIA counterpart is no part of it: `context.is("checked")` is what `:checked` matches, whatever `aria-checked` says. An element's ARIA states are conditions of its ARIA view, `context.aria`, a value of the type `aria`, which has no data form, so a result never holds one, and `context.aria.is("checked")` tests one.

Each reads the element's own attribute under a contract of its own, falling back on no native state, and observes that attribute:

| Receiver | Condition |
| --- | --- |
| ARIA view | [`checked`](#condition-aria-view-is-checked) |
| ARIA view | [`disabled`](#condition-aria-view-is-disabled) |

<a id="condition-aria-view-is-checked"></a>

<a id="conditions-aria-view-ischecked"></a>

#### ARIA view: is("checked")

**Reads:** Fresh

**True when.** The element's own `aria-checked` is `true`, compared ignoring ASCII case; a missing attribute, `false`, `mixed`, the empty string and any other value, padded with spaces included, answer false

**Changes.** Observable: its `aria-checked` attribute

<a id="condition-aria-view-is-disabled"></a>

<a id="conditions-aria-view-isdisabled"></a>

#### ARIA view: is("disabled")

**Reads:** Fresh

**True when.** The element's own `aria-disabled` is `true`, compared as `checked` compares; an ancestor's `aria-disabled` is not read

**Changes.** Observable: its `aria-disabled` attribute

So `context.is("checked") or context.aria.is("checked")` is whether either says checked, and `context.aria:["checked"] == "mixed"` tells a mixed state, which an ARIA condition answers false for, from the others. The ARIA view's default indexer reads the attribute written on the element, as `context:["aria-checked"]` does, and never the element's effective accessibility state.

No other ARIA attribute is a condition until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean; an extension declares one on the ARIA view, a type it does not own, under its module's own name alone, as the [namespace rule](#extensions) sets out.

<a id="conditions-related-questions"></a>

#### Related questions

`context.has("focus")` asks whether the element itself is focused, `context.has("focus-within")` whether focus is anywhere within it, and an extension can offer richer focus semantics, as a condition of elements under its module's own name or as conditions of its own types; they are separate questions with separate names.

`readonly` and `text-editable` are separate questions too, and neither is the other's opposite:

| Element | `readonly` | `text-editable` |
| --- | --- | --- |
| An enabled, writable text input | false | true |
| A read-only text input | true | false |
| A disabled text input without `readonly` | false | false |
| An ordinary static element | false | false |
| An editable content region | false | true |

<a id="built-in-conversions"></a>

### Built-in conversions

The built-in vocabulary declares four conversions, each rejecting a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `string` | `number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `number` | `string` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `boolean` | `string` | `"true"` or `"false"` |
| `string` | `boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

<a id="event-sources"></a>

### Event sources

An event source delivers things that happened. It is subscribed to, never read or watched, and the object expression following it is evaluated against each event.

| Available on | Source | Type | Delivers | Reads | Fixed |
| --- | --- | --- | --- | --- | --- |
| Element, document, window | `on(type)` | `type`: `string` → `event<T>` for the event type `type` names | The native events of that type as they reach it, each with the members its declared event type offers, such as a pointer event's `button`, `clientX` and `clientY`; a type the vocabulary declares no event type for is a validation error | Captured at dispatch | `type` |

The built-in event types, and the members each event offers:

| Event types | Event data type | Members |
| --- | --- | --- |
| `click`, `pointerdown`, `pointerup` | `pointerEvent` | `target`: `element`, `button`: `number`, `buttons`: `number`, `clientX`: `number`, `clientY`: `number`, `pointerType`: `string?` |
| `keydown`, `keyup` | `keyboardEvent` | `target`: `element`, `key`: `string`, `code`: `string` |
| `drop` | `dragEvent` | `target`: `element`, `clientX`: `number`, `clientY`: `number` |
| `focus`, `blur`, `input`, `scroll`, `resize` | `domEvent` | `target`: `element?` |

An event is captured as the members its type declares when it is dispatched.

A member the event carries no value of its type for is null where its type is nullable, as `domEvent`'s `target` is for a scroll or a resize that targets the document or the window, and `pointerEvent`'s `pointerType` for a browser that dispatches a click as a mouse event; where its type is not nullable, the capture fails, and the subscription reports it as it reports a failed object expression.

`on` listens passively, so it never delays or prevents what the page does with an event.

<a id="definition"></a>

## Definition

A query's **definition** is a JSON document recording its meaning: every query, parsed from text or created directly, is one definition, and preparation, validation and evaluation work on the definition alone. It records what the text means, never its punctuation, and comments, commas and layout leave no trace in it.

A document holds the definition's `version` and the `query` node. The version changes whenever the definition's shape or meaning does, and a definition of a version other than the one an implementation reads is a structure error. Each node is an object whose `kind` says what it is:

| Kind | Properties | Records |
| --- | --- | --- |
| `literal` | `value`, a JSON string, a finite number, a Boolean or null | A literal |
| `parameter` | `name` | A parameter, the caller's binding of the name; text writes it alone where its name is no reserved word, no local, field or function parameter of its name is in scope and no local of its name is declared later in its scope, and after `~` otherwise |
| `context` | None | The evaluation context |
| `root` | `name`, `document`, `window` or `root` | A root |
| `local` | `name` | A use of a local, a function parameter or a field, one in scope where it stands |
| `member` | `name`, the member's name, or for a bracket property access whose expression is no string literal that is a name, that expression's node; `target`, the receiver; and `optional`, true, where it is written with `?.` or `?[` | A property access, or a bracket property access |
| `call` | `name`; `arguments`, its arguments in order, empty where it is given none; `target`, the receiver; and `optional`, true, where it is written with `?.` | A call |
| `indexer` | `name`, left out for the default indexer; `argument`, its key; `target`, the receiver; and `optional`, true, where it is written with `?:` | A named indexer, or the receiver's default indexer |
| `object` | `fields`; `locals`, where it has any; and `target`, the node the object expression follows | An object expression; without a target, one keeping the evaluation context around it, which at the top level is absent |
| `equality` | `left` and `right`, the two expressions it compares | An equality; `!=` is a `not` holding one |
| `body` | `locals`, each its `name` and its `value`, in order, and `result`, the value the body gives | A body: a query's, a `do` block's, a function's or a conditional branch's, and nowhere else |
| `do` | `body`, an expression alone or a `body` node | A do block |
| `function` | `parameters`, the names it declares, and `body`, the body a call evaluates | A function, a local's initializer alone |
| `functionCall` | `name`, the local function's name, and `arguments`, as many as its parameters | A call of a local function |
| `interpolatedString` | `parts`, its text and its interpolations in order: each `{ "kind": "text", "value": … }`, the characters the text stands for, or `{ "kind": "expression", "expression": … }` | An interpolated string; adjacent text is one part and empty text none, and a diagnostic names a part by the index the definition it was created from gave it |
| `comparison` | `operands`, two or more expressions, and `operators`, one of `<`, `<=`, `>` and `>=` between each two | A comparison, or a chain of them |
| `conditional` | `condition`, the expression it tests, or `binding`, the `name` it binds and the `value` it binds to it, one of them; and `consequent` and `alternative`, two expressions | A conditional, `if let` holding a binding; an `elseif` is a conditional nested in the alternative before it |
| `coalescing` | `value` and `fallback`, two expressions | A coalescing operator |
| `cast` | `type`, the name of the type it casts to, and `target`, the expression it casts | A cast |
| `conversion` | `type`, the name of the type it converts to, and `target`, the expression it converts | A conversion |
| `try` | `target`, the conversion or the cast it attempts | An attempt |
| `optionalChain` | `target`, the chain it holds | An optional chain: the chain of property accesses, calls, indexers and object expressions whose optional accesses end at it, holding at least one |
| `and`, `or` | `operands`, two or more expressions | A logical expression |
| `not` | `operand`, the expression it negates | A negation |
| `arithmetic` | `operator`, one of `+`, `-`, `*`, `/` and `%`, and `left` and `right`, its operands | An arithmetic operation |
| `negate` | `operand`, the number it negates | An arithmetic negation of a number; a numeric literal negated is the negative literal |

A parenthesized expression adds no node, the expression it holds standing in its place, and neither does an optional enclosed access, whose accesses are recorded as optional and its optional chain where it ends, so `panel.attached and (panel.is("disabled"))` is an `and` of two members:

```json
{
  "kind": "and",
  "operands": [
    { "kind": "member", "target": { "kind": "parameter", "name": "panel" }, "name": "attached" },
    { "kind": "call", "target": { "kind": "parameter", "name": "panel" }, "name": "is", "arguments": [{ "kind": "literal", "value": "disabled" }] }
  ]
}
```

Every property access, call and indexer holds its receiver as its `target`, and every equality its `left` and its `right`, required, and an omitted target never stands for `context`, so `context.size` and `panel.size` are distinct definitions.

A call's `arguments` are its argument nodes in order, and an indexer's `argument` its key's node, each recorded as written; where a call's member takes options, its one argument is an object node whose fields resolution maps onto the member's parameters.

A field is an object holding its `name` and its `value` node, both required; an object expression's fields keep their order, and an object expression holds at least one. A local is an object of the same two properties, and an object expression's locals keep their order, its definition leaving `locals` out where it has none.

`panel { size = context.size, hasFocus = context.has("focus-within") }` has this definition:

```json
{
  "version": 30,
  "query": {
    "kind": "object",
    "target": { "kind": "parameter", "name": "panel" },
    "fields": [
      { "name": "size", "value": { "kind": "member", "target": { "kind": "context" }, "name": "size" } },
      {
        "name": "hasFocus",
        "value": {
          "kind": "call",
          "target": { "kind": "context" },
          "name": "has",
          "arguments": [{ "kind": "literal", "value": "focus-within" }]
        }
      }
    ]
  }
}
```

A chain is recorded as a succession of targets: in `panel.all("li").count`, `count` is a property access whose target is the call `all`, whose target is the parameter `panel`. A chain that holds an optional access is the target of an `optionalChain` node, which records where its short-circuit ends, so `panel.parent?.children.count`, one optional chain, and `(panel.parent?.children).count`, a property access of one, are distinct definitions.

A definition names its parameters and never holds their values. An element is bound to its name when the query is created, through whatever mechanism the caller's environment offers, so the same definition serves every binding.

<a id="validation"></a>

### Validation

Validation happens before evaluation. Structure is checked when the request is created; vocabulary and types are checked when it is prepared.

<a id="validation-syntax-and-structure"></a>

#### Syntax and structure

Text must follow the syntax. A directly created definition must follow the same node structures and structural rules.

| Area | Required structure |
| --- | --- |
| Fields | Every field has a name and value; names are unique within an object expression; an object expression has at least one field. |
| Locals | Each has a name and value; names are unique within a body or object expression; references name an in-scope local or field. |
| Declaration order | No reference uses a local before its declaration or within its own initializer. A name written alone cannot fall back to a caller binding when that local is declared later in the same scope. |
| Explicit parameters | A definition's `parameter` node, written as `~name` when necessary, reads the caller's binding regardless of local declarations. |
| Simple expressions | Arguments, indexer keys, bracket property names and interpolations obey the restrictions recursively; an object expression within one, as an options object, declares no locals, though it may use those in scope. |
| Members | Every property access, call and indexer has a receiver. |
| Equality | Both operands are present. |
| Comparisons | At least two operands; exactly one operator between each pair; every operator is one of `<`, `<=`, `>`, `>=` and points in the same direction. |
| Interpolated strings | Every part is text containing a string, or an expression part. |
| Bodies | Locals and one result are present; local names are unique and are not used before declaration; a body stands only as a query's, a do block's, a function's or a conditional branch's. |
| Chain receivers | A conditional or body cannot be a chain receiver. |
| Functions | Each is a local initializer, or an arrow function that is also an argument, with unique parameter names; an arrow function's body is a simple expression; a function cannot be called before its local is declared. |
| Optional access | Each optional access is within an optional chain, following the targets of property accesses, calls, indexers and object expressions; each optional chain contains an optional access. |
| Context | `context` cannot appear where no evaluation context is available, including a top-level object's unqualified fields. |
| Logical expressions | `and` and `or` have at least two operands; `not` has its operand. |
| Arithmetic | An arithmetic node has a supported operator and both operands; a `negate` node has its operand. |
| Coalescing | Both value and fallback are present. |
| Casts | The type is a string and the whole target has the form text writes a cast's target in. |
| Literals | A literal is a string, a finite number, a Boolean or null, so a number no finite number holds, as `1e999`, is refused in text as in a definition. |

A cast's target is checked whole: a receiver, which is the evaluation context, a parameter, a root, a local, a literal, an interpolated string, a function call, an untargeted object expression or a grouped cast, and the property accesses, calls and indexers after it, an optional chain of them included; or a coalescing operator or a cast as it is, grouped, as the [cast rules](#casts) set out. A definition whose cast target is otherwise is a structure error, so every definition accepted writes text that parses.

A binding may be named `document` or `window`, as any name can, and a query reads it as `~document` or `~window`.

<a id="validation-vocabulary-and-types"></a>

#### Vocabulary and types

Preparation checks the following contracts:

| Area | Required contract |
| --- | --- |
| Member resolution | Every member and extension exists and uses its declared form. |
| Arguments | Positional arguments match the signature's order and count; options use one object whose fields name the member's parameters; every required parameter is supplied. |
| Types and kinds | Receivers, arguments, expressions and bindings fit their declared types; each argument uses its declared argument kind. |
| Required access | Access written with `.` has a receiver that cannot be null. Other required access forms follow the same nullability rule. |
| Fixed arguments | Preparation settles each to a non-null string without reading the document: a literal, a bound parameter, or a local, a conditional binding, a conditional, a `??`, an `and` or an `or` that settles to one, a function parameter within a call's body where the call's argument settles, and a `do` block whose locals and result settle, as [Arguments](#arguments) and [Bodies](#bodies-fixed-arguments) set out. |
| Bracket property access | Preparation determines every possible property name; each names a property of the receiver and their types merge. |
| Local use | Each reference is in scope; a value local is used as a value, a function local as a call. |
| Casts | The target type is `node` or a node kind, and the operand can be of that type. |
| Conversions and attempts | The target type and conversion pair are valid; an attempt follows the same validation rules as its strict operation. |
| Equality | Operand types fit in at least one direction. Values other than strings, numbers, Booleans and nodes compare only with null. |
| Arithmetic and comparisons | Every operand is a non-null number. |
| Interpolation | Every interpolation gives a non-null string or number. |
| Function calls | The local or function parameter holds a function, never null; the argument count matches each function it may be, whose body resolves against that call's argument types, their results merging; no call reaches a function within its own call. |
| Conditions and logical operands | Each is a value. Truthiness determines the branch; an event source, action or behavior cannot be used as that value. |
| Coalescing | Value and fallback have compatible types. |
| Conditionals | Branch result types are compatible. |
| Evaluation context | Each expression is valid in the context declared by its member. |
| Request kind | The caller uses the request as its declared kind. |
| Output | A query result contains data alone. |
| Watching | Every member the query may read has an observation contract the watch accepts. |

All branches and operands are validated even when evaluation will not reach them. Watching rules are checked before evaluation as well; an unreachable branch does not exempt an unwatchable member from validation.

<a id="validation-diagnostics"></a>

#### Diagnostics

A syntax error identifies its position in the text, its offset, line and column. A structure, validation or evaluation error identifies its node in the definition, expressed as a JSON Pointer, and, where the request was made from text, its position in the text as well. An error in a binding names the binding, and a module error the module and the declaration, located by neither.

An evaluation error fails the entire result and is delivered to the caller in its place. See [Errors and diagnostics](#errors-and-diagnostics).

<a id="errors-and-diagnostics"></a>

## Errors and diagnostics

An absent or unavailable value is null. Invalid syntax, an invalid definition or binding, an invalid request, an invalid module and an evaluation failure are errors, of the kinds `syntax`, `structure`, `validation`, `module` and `evaluation`. `try` handles only a cast or conversion rejecting its value.

In this section: [Absence and unavailable values](#absence-and-unavailable-values) · [Syntax errors](#syntax-errors) · [Structure errors](#structure-errors) · [Preparation and type errors](#preparation-and-type-errors) · [Evaluation errors](#evaluation-errors).

<a id="absence-and-unavailable-values"></a>

### Absence and unavailable values

| Situation | Result |
| --- | --- |
| `closest` or `first` matches no element | null |
| `all` matches no element | An empty list |
| A supported measurement is unavailable | null, as the member documents |

<a id="syntax-errors"></a>

### Syntax errors

| Situation | Result |
| --- | --- |
| Text that does not follow the syntax | A syntax error, with its position |
| An argument written as a named one, as `relativeTo = other` | A syntax error, giving a member call the form of an options object |
| A comparison chain whose operators point two ways | A syntax error at the operator that turns it |
| `@` in a declaration or before a field's or a member's name, `@` before a name that is no reserved word, or `@` before no word | A syntax error giving the form to write |
| A keyword where a value stands | A syntax error giving the reserved reference; `then`, `elseif`, `else` and `end` give the value expected instead: `Expected a value, found 'then'` |
| A conditional without its `end`, a conditional whose branches give their results in two styles, anything after a body's result, or a `return` with no value | A syntax error |
| Locals whose body's result has no `return` | A syntax error: `Introduce the body's result with return.` |
| An expression no local holds before a body's `return` | A syntax error: `Only locals may precede a body's result.` |
| A function that is no local's initializer, or an arrow function that is neither that nor an argument | A syntax error in text, and a structure error in a definition |
| A regular function written directly as an argument | A syntax error in text, and a structure error in a definition: `A function declared with 'function' cannot appear directly as an argument. Bind it to a local and pass its name, or use an arrow function.` |
| An arrow function whose body is no simple expression | A syntax error in text, and a structure error in a definition, saying its body is a simple expression |
| A conditional or a `do` block that is the receiver of a chain | A syntax error, or a structure error in a definition, saying to bind its value first |
| An interpolated string with a space after its `$`, an interpolation with no expression, or a lone `}` in its text | A syntax error at what is written so |
| A line break written in an inline string, raw or not and interpolated or not | A syntax error at the line break, suggesting `\n` or a block |
| A block whose opening delimiter has anything after it on its line, that is never closed, whose closing run is longer than its delimiter, whose text holds a run of quotes as long as its delimiter, or one of whose lines lacks its margin | A syntax error naming the delimiter, the run or the line, a run suggesting a longer delimiter |
| An interpolation holding a line break, a line comment or a block, or one beginning with an object expression | A syntax error, saying an interpolation stands on one line or suggesting the group `{({ … })}` |

<a id="structure-errors"></a>

### Structure errors

| Situation | Result |
| --- | --- |
| A definition that does not follow its structure | A structure error, with its node's location |
| A do block, a local, a conditional binding, a `return`, or a conditional beyond an if branch and an else branch of simple values, within an argument, an indexer's key, a bracket property access or an interpolation | A structure error naming the part, which a local holds first |
| A reserved reference, or a definition's local, that no local or field in scope answers | A structure error: `No local or field named 'window' is in scope. Use '~window' to read the caller's binding.` |
| A function calling itself or one declared after it, or two parameters of one name | A structure error |
| A body anywhere but a query's, a do block's, a function's or a conditional branch's | A structure error: `A body is a query's, a do block's, a function's or a conditional branch's, and stands nowhere else` |
| A cast in a definition whose target is none text could write | A structure error at the target |
| A `root` written outside every object expression | A structure error: `'root' refers to the outermost object being built, and no object expression encloses it here` |
| A numeric literal no finite number holds, as `1e999`, in text or in a definition | A structure error: `A literal is a string, a finite number, a Boolean or null` |
| Bindings that are no plain object, a binding not named by a letter followed by letters and digits, or one that is no node or data | A structure error naming the binding, as `A binding is named by a letter followed by letters and digits` |

A module whose declarations break the declaration contract, or whose names registration finds taken, fails with an error of its own kind, `module`, when it is created or registered, naming the module and the declaration.

<a id="preparation-and-type-errors"></a>

### Preparation and type errors

| Situation | Result |
| --- | --- |
| A misspelled member or extension, or a parameter the caller did not bind | A validation error, with its location |
| A fixed argument preparation cannot settle | A validation error: `The argument 'name' of 'is' selects from the vocabulary, so it is a string the query's preparation settles without reading the document, …` |
| An access or a call written with `.` whose receiver can be null | A validation error giving the form with `?.` |
| A name no local or field in scope has | A validation error, giving the form with `context` where the evaluation context has a member of that name |
| A member written in a form its declaration does not take, an argument that does not supply its input, or more arguments than it takes | A validation error giving the form, the input or the number of arguments it takes |
| A cast to a type that is no node, or of a target that can never be of its type | A validation error naming the types |
| An equality of two values whose types fit neither way, or of a value that is no string, number, Boolean or node with one that is not null | A validation error naming the types, and the test to write where a value is compared with the name of one of its Boolean members |
| An operand of `and`, `or` or `not`, a condition or a conditional binding of what is no value | A validation error naming what it is |
| An arithmetic operand that can be null, or that is no number | A validation error naming the operand, and the fallback to give it |
| A call no local function answers, a call of a local holding a value or a function that may be null, a call given the wrong number of arguments, or one whose functions give no one type | A validation error naming the function |
| A call that reaches a function within its own call, through a function passed to it | A validation error |
| A field or a result that would hold a function, or a function given to a member's value parameter | A validation error |
| A function given to a function parameter of another number of parameters, of a result of another type, or that may be null, or an arrow function given to a contextual-expression parameter | A validation error naming the parameter |
| An interpolation of a value that can be null, or of no string or number | A validation error naming the interpolation, and the fallback or the conversion to give it |
| A comparison operand that can be null, or that is no number | A validation error naming the operand, and the fallback to give it |
| An `and` or an `or` whose operands give values no one type holds | A validation error naming them, and the conditional to write where null is an acceptable alternative |
| Branches of different types | A validation error naming the types |
| A receiver, an argument, an expression or a binding of the wrong type, an argument of the wrong kind, or a missing required one | A validation error naming where, the expected type and the type found |
| A result that would contain a node or an event source | A validation error |
| A field read through `root` whose initializer has not completed where `root` is written | A validation error naming the fields completed there |
| A read, by its name or through `root`, of an option its member declares as an expression or a predicate | A validation error: `Option 'by' is an expression evaluated by the member against its supplied context; it has no single value to read here` |
| A field or a result that would hold `root` | A validation error: `The field 'copy' would hold root, the object being built, which no result holds; read its fields, as root.name` |
| A request used as another kind: reading or watching an event source, subscribing to a value, running a query, or reading an action or a behavior | A validation error |
| An action or a behavior inside a query, an argument or another request's object expression | A validation error |
| Watching a partly observable member without accepting partial observation | A validation error naming each such member by the type its declaration is for, as `shadow.root` and `node.root` are, and the changes it misses |

<a id="evaluation-errors"></a>

### Evaluation errors

| Situation | Result |
| --- | --- |
| A node a strict cast rejects, or a value a conversion rejects | An evaluation error naming what was rejected; null under `try` |
| A division or a remainder by zero, or an arithmetic result no finite number holds | An evaluation error at the operation |
| A module returning a value of a type other than the one it declared | An evaluation error |
| A member failing unexpectedly while it evaluates | An evaluation error |

A query is validated before any evaluation, as the section on validation sets out. An evaluation error fails the whole result, and the caller receives the error in its place.

<a id="examples-and-usage"></a>

## Examples and usage

In this section: [What a query runs against](#what-a-query-runs-against) · [A complete query](#a-complete-query) · [Examples](#examples).

<a id="what-a-query-runs-against"></a>

### What a query runs against

A query is evaluated against a document, with each parameter it names bound to something in that document or to plain data. `panel` is not found by the query: it stands for the element the caller bound under the name `panel`, which is how a query reaches a particular element without a selector for it.

A query that names `panel` and `sentinel` is given those two elements, and fails to prepare when either is not bound. `document` and `window` need no binding, since they are always the document being queried and its window.

Conceptually, a caller supplies the query's text and the bindings, and gets back a result shaped like the query:

```text
result = evaluate(query, bindings: { panel: <the list panel>, sentinel: <the end marker> })
```

The bindings name only what the caller chooses. The complete query below also uses `document` and `window`, which are absent from them because they are the document the query runs against and its window, which no caller chooses; a caller's binding of either name would be read as `~document` or `~window`.

A caller can take that result once, keep it current as the document changes, or take one at each event the query subscribes to; how it asks for each is the [design](domql-design.md)'s to say. A value query is evaluated or watched alike; subscribing needs an event source, whose projection uses the same expression language.

<a id="a-complete-query"></a>

### A complete query

A list panel asks, in one query, how it is laid out, what it holds, what is in view and what the window around it is doing. The document it is asked of holds a panel of three items, the second selected, and an end marker below them, bound as `panel` and `sentinel`:

```html
<div id="panel" style="display: grid; grid-template-columns: repeat(3, 1fr)">
    <div data-key="a1">…</div>
    <div data-key="a2" aria-selected="true">…</div>
    <div data-key="a3">…</div>
</div>
<div id="sentinel"></div>
```

The query reads it:

```domql
/* A list panel, its items and the window around it. */
{
    // The panel's items, read once for the fields that use them.
    let rows = panel.all("[data-key]"),

    // The panel itself.
    panel = panel {
        size = context.size,
        hasFocus = context.has("focus-within"),
        tier = context:style["--layout-tier"],
        columns = context.grid?.columns.count
    },

    // Every item, and the items in the panel's view; the field above hides
    // the binding panel, which ~panel reads.
    items = rows {
        key = context:["data-key"],
        height = context.rect?.height,
        selected = context.aria:["selected"] == "true"
    },
    inView = rows.where(context.intersects({ root = ~panel })).count,
    tallest = rows.max(context.rect?.height),

    // Whether the end of the list is near, and which item is selected.
    nearEnd = sentinel.intersects({ root = ~panel, margin = 200 }),
    current = ~panel.first("[aria-selected=true]")?:["data-key"],

    // The window around it.
    window = window { size = context.size, dark = context:media["(prefers-color-scheme: dark)"] },
    visible = document.is("visible"),
    kind = "list"
}
```

Its result, with three items and the second selected:

```json
{
  "panel": { "size": { "width": 640, "height": 480 }, "hasFocus": false, "tier": "medium", "columns": 3 },
  "items": [
    { "key": "a1", "height": 48, "selected": false },
    { "key": "a2", "height": 64, "selected": true },
    { "key": "a3", "height": 48, "selected": false }
  ],
  "inView": 2,
  "tallest": 64,
  "nearEnd": false,
  "current": "a2",
  "window": { "size": { "width": 1280, "height": 800 }, "dark": true },
  "visible": true,
  "kind": "list"
}
```

With no item selected, `current` is null. With an empty panel, `items` is an empty list, `inView` is 0, and `tallest` and `current` are null.

`intersects` reads maintained values, so the result comes from an asynchronous evaluation or a watch, which wait for its first samples; a synchronous evaluation of the query fails, since it cannot wait.

Watching the query requires accepting partial observation, since `all`, `style`, `grid`, `rect` and `first` are partly observable, which the refusal names as `node.all`, `element.style`, `element.grid`, `element.rect` and `node.first`, each with the changes it misses; the watch then follows the items the panel holds, each item's height, attributes and intersection, the panel's size and focus, the sentinel's intersection, the media query and the document's visibility.

<a id="examples"></a>

### Examples

| Asks | Query |
| --- | --- |
| Whether an element is near the end of a scrolling panel | `sentinel.intersects({ root = panel, margin = 200 })` |
| How many items of a list are in its view | `list.all("li").where(context.intersects({ root = list })).count` |
| A layout tier a container query sets | `header:style["--layout-tier"]` |
| How many columns a grid lays out | `cards.grid?.columns.count` |
| A table's tallest row | `table.all("tbody tr").max(context.rect?.height)` |
| Each column's key and width | `table.all("[data-column]") { key = context:["data-column"], width = context.rect?.width }` |
| A panel's size, and whether focus is within it | `panel { size = context.size, hasFocus = context.has("focus-within") }` |
| A text field's selection | `field.selection { start = context.start, finish = context.end }` |
| Whether sharing is available | `window.supports("share")` |
| The ids of the text-editable elements in a panel | `panel.all("*").where(context.is("text-editable")) { id = context:["id"] }` |
| An element's states and what it holds | `target { attached = context.attached, disabled = context.is("disabled"), hasChildren = context.hasChildren, hasSelection = context.hasSelection }` |
| Whether a control cannot take text | `input.is("disabled") or input.is("readonly")` |
| A control's state, one word | `input { state = if context.is("disabled") then "locked" elseif context.is("readonly") then "read" else "open" end }` |
| Whether an element has no parent | `panel.parent == null` |
| The width of an element's parent element, null where the parent is none or no element | `(try panel.parent as "element")?.rect?.width` |
| A list's size and its tallest item, the list read once | `panel { let items = context.all("[data-key]"), count = items.count, tallest = items.max(context.rect?.height) }` |

<a id="syntax"></a>

## Syntax

This appendix gives the formal grammar. The explanations in [Names and scope](#names-and-scope), [Access and calls](#access-and-calls), [Expressions](#expressions) and [Calculations and reuse](#calculations-and-reuse) define its rules and restrictions.

In this notation, `[...]` means optional, `{...}` means repetition, `|` separates alternatives, `-` means exclusion, and `? ... ?` describes a special sequence. Each name describes a written form or the category a position holds. Trivia never stands inside a token: `@word`, `~name`, `(?` and `$"` are each written whole, with nothing between their characters.

```ebnf
query                         = body end-of-input

body                          = { local } "return" expression
                              | expression

expression                    = conditional-expression | do-expression
                              | simple-value-expression
parenthesized-expression      = "(" expression ")"

conditional-expression        = "if" conditional-clause "then" body
                                { "elseif" conditional-clause "then" body }
                                "else" body "end"
do-expression                 = "do" body "end"
conditional-clause            = conditional-binding | simple-value-expression
conditional-binding           = "let" local-name "=" simple-value-expression

simple-expression             = simple-value-expression
                              | simple-conditional-expression
simple-conditional-expression = "if" simple-value-expression "then" simple-value-expression
                                "else" simple-value-expression "end"

local                         = "let" local-name "=" local-initializer
local-initializer             = expression | function-expression | arrow-function

function-expression           = "function" "(" [ function-parameter-list ] ")"
                                body "end"
function-parameter-list       = function-parameter { "," function-parameter }
function-parameter            = local-name

simple-value-expression       = coalescing | disjunction | or-operand

coalescing                    = coalescing-operand "??"
                                ( coalescing-operand | coalescing )
coalescing-operand            = arithmetic-negation

disjunction                   = or-operand "or" or-operand
                                { "or" or-operand }
or-operand                    = conjunction | and-operand

conjunction                   = and-operand "and" and-operand
                                { "and" and-operand }
and-operand                   = negation | equality | comparison | additive

negation                      = "not"
                                ( negation | equality | comparison | additive )

equality                      = additive
                                ( "==" | "!=" )
                                additive

comparison                    = additive ( "<" | "<=" ) additive
                                { ( "<" | "<=" ) additive }
                              | additive ( ">" | ">=" ) additive
                                { ( ">" | ">=" ) additive }

additive                      = multiplicative
                                { ( "+" | "-" ) multiplicative }
multiplicative                = arithmetic-negation
                                { ( "*" | "/" | "%" ) arithmetic-negation }
arithmetic-negation           = "-" arithmetic-negation | equality-operand

equality-operand              = chain | cast | conversion | attempt
attempt                       = "try" attempted-operation
attempted-operation           = attempted-conversion | cast
                              | "(" ( conversion | cast | attempted-operation ) ")"
attempted-conversion          = chain "to" string

conversion                    = conversion-target "to" string
conversion-target             = chain | cast | conversion

cast                          = cast-target "as" string
cast-target                   = receiver { member-expression } | enclosed-cast-target
enclosed-cast-target          = "(" coalescing ")" | optional-enclosed-access

chain                         = chain-input { member-expression | object }
chain-input                   = input | enclosed-expression

member-chain                  = receiver member-expression { member-expression }
optional-enclosed-access      = "(?" member-chain ")"
receiver                      = input | "(" cast ")"

input                         = value | object | identifier | interpolated-string
                              | reserved-reference | query-parameter
                              | function-call
reserved-reference            = "@" reserved-word
query-parameter               = "~" name
function-call                 = ( identifier | reserved-reference )
                                "(" [ argument-list ] ")"
argument-list                 = argument { "," argument }
argument                      = simple-expression | arrow-function
arrow-function                = arrow-parameters "=>" simple-expression
arrow-parameters              = function-parameter | "(" [ function-parameter-list ] ")"
value                         = "context" | "~" | literal | root
root                          = "document" | "window" | "root"

enclosed-expression           = parenthesized-expression | optional-enclosed-access

member-expression             = dot-property-access | bracket-property-access
                              | member-call | indexer
dot-property-access           = ( "." | "?." ) member-name
bracket-property-access       = ( "[" | "?[" ) simple-expression "]"
member-call                   = ( "." | "?." ) member-name
                                "(" [ function-argument-list ] ")"
indexer                       = ( ":" | "?:" ) [ member-name ]
                                "[" simple-expression "]"

object                        = "{" object-content "}"
object-content                = { local "," } field { "," field } [ "," ]
field                         = field-name "=" expression

literal                       = string | number | "true" | "false" | "null"

identifier                    = name - reserved-word
local-name                    = name
field-name                    = name
member-name                   = name
name                          = letter { letter | digit }
reserved-word                 = "true" | "false" | "null" | keyword
                              | "document" | "window"
keyword                       = "context" | "not" | "try" | "as" | "to" | "and" | "or"
                              | "if" | "then" | "elseif" | "else" | "let"
                              | "do" | "end" | "return" | "function"

number                        = integer [ fraction ] [ exponent ]
integer                       = "0" | nonzero-digit { digit }
fraction                      = "." digit { digit }
exponent                      = ( "e" | "E" ) [ "+" | "-" ] digit { digit }

string                        = inline-string | raw-string | string-block | raw-block
inline-string                 = '"' { string-character | string-escape } '"'
string-character              = ? any character except double quote, backslash
                                  or a line break ?
raw-string                    = "'" { raw-character | "''" } "'"
raw-character                 = ? any character except single quote or a line break ?
string-block                  = ? three or more double quotes and a line break, the
                                  block's lines and its closing delimiter, as Blocks
                                  describes, its text of string-character,
                                  string-escape and line breaks ?
raw-block                     = ? three or more single quotes and a line break, the
                                  block's lines and its closing delimiter, as Blocks
                                  describes, its text any characters ?
string-escape                 = '\' ( '"' | '\' | "n" | "r" | "t" | "e" | unicode-escape )
unicode-escape                = "u{" hex-digit [ hex-digit [ hex-digit
                                [ hex-digit [ hex-digit [ hex-digit ] ] ] ] ] "}"
hex-digit                     = digit | "A" | "B" | "C" | "D" | "E" | "F"
                              | "a" | "b" | "c" | "d" | "e" | "f"

interpolated-string           = "$" ( '"' { interpolated-part } '"'
                                    | "'" { raw-interpolated-part } "'"
                                    | ? a string block or a raw block whose text
                                        holds interpolated parts or
                                        raw-interpolated parts ? )
interpolated-part             = interpolated-character | string-escape
                              | "{{" | "}}" | interpolation
raw-interpolated-part         = raw-interpolated-character | "''"
                              | "{{" | "}}" | interpolation
interpolation                 = "{" simple-expression "}"
                              (* on one line, beginning with no object expression *)
interpolated-character        = ? any character except double quote, backslash,
                                  a brace or a line break ?
raw-interpolated-character    = ? any character except single quote, a brace
                                  or a line break ?

letter                        = ? ASCII A–Z or a–z ?
digit                         = "0" | nonzero-digit
nonzero-digit                 = "1" | "2" | "3" | "4" | "5"
                              | "6" | "7" | "8" | "9"

trivia                        = whitespace | line-comment | block-comment
whitespace                    = ? a character matched by ECMAScript \s ?

line-comment                  = "//" { line-character } [ line-feed ]
line-character                = ? any character except LF ?
line-feed                     = ? LF ?

block-comment                 = "/*" block-content "*/"
block-content                 = ? characters up to, but excluding, the first closing */ ?

end-of-input                  = ? end of input ?
```

<a id="grammar-terminology"></a>

### Grammar terminology

The grammar uses several terms more narrowly than the prose:

| Grammar rule | Meaning |
| --- | --- |
| `value` | The forms listed by that production: the evaluation context, a literal or a root |
| `input` | What a chain can start from |
| `receiver` | The starting form of a member chain or cast target: an input or a parenthesized cast |
| `equality-operand` | A chain, cast, conversion or attempt, used within the arithmetic productions |
| `coalescing-operand` | An arithmetic negation or an equality operand, never binary arithmetic, which stands apart from `??` unless one of them is grouped |

In the prose, **value** means any value an expression has; type resolution determines its type. A member's **input declaration** is a separate concept: it declares what the member's arguments supply. See [Arguments](#arguments).

<a id="terms"></a>

## Terms

In this section: [Queries and values](#queries-and-values) · [Chains and members](#chains-and-members) · [Expressions](#expressions-1) · [Vocabulary and requests](#vocabulary-and-requests).

<a id="queries-and-values"></a>

### Queries and values

| Term | Meaning | Reference |
| --- | --- | --- |
| Query | A value expression or body whose evaluation produces a result | [Requests](#requests) |
| Result | The data produced by a query | [Values and types](#values-and-types) |
| Type | The category of a value and the members it supports | [Types](#types) |
| Node | A DOM value of kind element, document, document fragment or shadow root | [Nodes](#nodes) |
| Object expression | An expression that names the fields of its output object | [Objects](#objects) |
| Object type | A description of an object's fields and their types | [Types](#types) |
| Field | A named value included in an object | [Objects](#objects) |
| Body | What a query, a do block, a function or a conditional branch holds: an expression alone, or locals and the `return` that gives its result | [Bodies](#bodies) |
| Do block | `do … end`, a body evaluated where it stands, giving its result | [Bodies](#bodies) |
| Local | A name declared with `let` in a body or an object expression, visible after its declaration through its scope, holding a value or a function | [Locals](#locals) |
| Function | A calculation a call evaluates, a regular function or an arrow function, held by a local and passed as a value | [Functions](#functions) |
| Regular function | `function(…) … end`, whose body is a body | [Functions](#functions-declaring-one) |
| Arrow function | `parameters => expression`, whose body is one simple expression, a local's initializer or an argument | [Functions](#functions-declaring-one) |
| Function value | A function read by its name without a call, or an arrow function written as an argument, used within the query and never part of its result | [Functions as values](#functions-as-values) |
| Callback contract | The argument types and the result type a member declares for a function parameter, which a function given to it is checked against | [Arguments](#arguments) |
| Function parameter | A name a function declares, holding the argument each call gives it | [Functions](#functions) |
| Parameter | A name through which a query reads a caller-supplied value | [Bindings](#bindings) |
| Parameter binding, or binding | The value a caller supplies for a parameter | [Bindings](#bindings) |
| Query parameter | `~name`, reading the caller's binding of the name whatever local or field shares it | [Names and reserved words](#names-and-reserved-words-referring-to-the-callers-binding) |
| Root | `document`, `window` or `root`: the document the query runs against, its window and the object root | [Names and resolution](#names-and-resolution-parameters-and-roots) |
| Object root | The outermost object being built, which `root`, written inside an object expression, refers to, reading the fields whose initializers have completed | [The object root](#locals-the-object-root) |
| Tree root | The root of a node's tree, read as `node.root` | [Node: root](#property-node-root) |
| Reserved word | A word that keeps its meaning where an expression stands: a literal's word, a keyword or a root's name | [Names and reserved words](#names-and-reserved-words) |
| Keyword | A reserved word other than the literals' words and the roots' names, as `let`, `if` and `context` | [Names and reserved words](#names-and-reserved-words) |
| Reserved reference | `@word`, reading the local or the field a reserved word names | [Names and reserved words](#names-and-reserved-words-referring-to-a-reserved-local-or-field) |
| Evaluation context | The value against which the current expression runs, read as `context` or bare `~` | [Names and resolution](#names-and-resolution) |

<a id="chains-and-members"></a>

### Chains and members

| Term | Meaning | Reference |
| --- | --- | --- |
| Chain input | What a chain starts from: the evaluation context, a literal, a root, a name, a reserved reference, a query parameter, an object expression, an interpolated string, a function call, a parenthesized expression or an optional enclosed access | [Syntax](#syntax) |
| Chain | An input followed by zero or more member accesses and object expressions | [Expression structure and precedence](#expression-structure-and-precedence) |
| Receiver | The value before a member access, call or indexer | [Access and calls](#access-and-calls) |
| Member | A property, operation or other declared facility of a type | [Vocabulary contracts](#vocabulary-contracts) |
| Property access | A property read using a dot or brackets | [Property access, calls and indexers](#property-access-calls-and-indexers) |
| Call | `name(…)`, written after a receiver to invoke an operation, an event source, an action or a behavior, which stay distinct member kinds, or after a local function's name to call it | [Arguments](#arguments) |
| Named indexer | A keyed operation written after a colon | [Property access, calls and indexers](#property-access-calls-and-indexers) |
| Default indexer | `:[key]`, the indexer a receiver's type declares its default | [Property access, calls and indexers](#property-access-calls-and-indexers-default-indexers) |
| Argument | An expression supplied to a call, or an indexer's key | [Arguments](#arguments) |
| Positional and options inputs | What a member's arguments supply: its parameters in order, or one options object whose fields name them | [Arguments](#arguments) |
| Options object | The one object expression given to a member that takes options, whose fields supply its parameters | [Arguments](#arguments-options) |
| Value, expression and predicate arguments | An argument evaluated once where the call is written; one the member evaluates against each context its signature declares; and one of those whose truthiness the member receives | [Arguments](#arguments) |
| Fixed argument | A value argument the query's preparation settles to a string that selects a declaration, as those of `is` and `on` do | [Arguments](#arguments) |
| Optional chain | A chain whose optional access stops it with null for a null receiver | [Property access, calls and indexers](#property-access-calls-and-indexers) |
| Optional enclosed access | `(? … )`, shorthand making every access in a member chain optional | [Property access, calls and indexers](#property-access-calls-and-indexers) |

<a id="expressions-1"></a>

### Expressions

| Term | Meaning | Reference |
| --- | --- | --- |
| Test | A member that answers a Boolean | [Tests](#tests) |
| Equality | `==`, comparing two values; `!=` negates it | [Equalities](#equalities) |
| Truthy / falsey | Every value is truthy except null and false | [Truthiness](#truthiness) |
| Logical expression | `and` or `or`, returning the operand that decides it | [Logical expressions](#logical-expressions-negations-and-groups) |
| Negation | `not`, answering whether a value is falsey | [Logical expressions](#logical-expressions-negations-and-groups) |
| Conditional | An `if` expression selecting a branch by truthiness | [Conditionals](#conditionals) |
| Conditional binding | `if let` or `elseif let`, naming and testing a value once | [Conditionals](#conditionals) |
| Coalescing operator | `??`, returning its fallback only when its value is null | [Coalescing operators](#coalescing-operators) |
| Parenthesized expression | An expression grouped by parentheses | [Logical expressions](#logical-expressions-negations-and-groups) |
| Cast | `as`, answering a node as one of its kinds | [Casts](#casts) |
| Conversion | `to`, converting data to another declared type | [Conversions](#conversions) |
| Attempt | `try`, returning null when the one cast or conversion it attempts rejects its value | [Attempts](#attempts) |
| Arithmetic negation | `-` before a number, negating it | [Arithmetic](#arithmetic) |
| Interpolation | An interpolated string's `{…}`, inserting the text of the simple expression it holds | [Interpolated strings](#interpolated-strings) |
| String | `"…"`, text whose backslashes begin escapes; also the type every form gives | [Strings and escapes](#strings-and-escapes) |
| Raw string | `'…'`, text whose backslashes are text and whose doubled quote is one quote | [Raw strings](#strings-and-escapes-raw-strings) |
| Interpolated string | `$"…"`, or `$'…'` for an interpolated raw string, text holding interpolations | [Interpolated strings](#interpolated-strings) |
| Block | A string, raw or not and interpolated or not, written on lines of its own between delimiters of three or more quotes, its margin removed | [Blocks](#strings-and-escapes-blocks) |
| Simple expression | The restricted expression an argument, an indexer's key, a bracket property name or an interpolation holds | [Simple expressions](#simple-expressions) |

<a id="vocabulary-and-requests"></a>

### Vocabulary and requests

| Term | Meaning | Reference |
| --- | --- | --- |
| Vocabulary | A set of types and their declared members | [Vocabulary contracts](#vocabulary-contracts) |
| Built-in vocabulary | The vocabulary supplied with DOMQL | [Built-in vocabulary](#built-in-vocabulary) |
| Extension | A vocabulary registered under its own name | [Extensions](#extensions) |
| Module | An extension's unit of registration, made by `createModule` and registered with `registerModule` | [Extensions](#extensions) |
| Condition | A Boolean question of a receiver under a name of its own, asked with its verb | [Conditions](#conditions) |
| Verb | `is`, `has` or `supports`, the call that asks a condition by its name | [Conditions](#conditions) |
| Observation | What a member names to learn that its result may have changed, or to keep the sample it reads | [How a member changes](#how-a-member-changes) |
| Watch | A query kept current, evaluated again when an observation reports a change | [Evaluation and watching](#evaluation-and-watching) |
| Event source | A member producing a stream of events | [Events](#events) |
| Event | Something that happened, delivered by a source | [Events](#events) |
| Event type | A declaration of the data an event offers | [Event sources](#event-sources) |
| Event data | What an event source captured of an event | [Event sources](#event-sources) |
| Action | A member kind of its own, which its module carries out once when the caller executes the request | [Requests](#requests) |
| Behavior | A member kind of its own, which its module starts when the caller applies the request and which runs until updated or disposed | [Requests](#requests) |
| Request | A query, subscription, action or behavior request | [Requests](#requests) |
| Definition | The JSON document recording a request's meaning | [Definition](#definition) |
