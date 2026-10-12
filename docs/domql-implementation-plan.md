# DOMQL Implementation Plan

This plan records the steps that take DOMQL from what is built to what the [specification](domql-specification.md) and the [design](domql-design.md) describe, the decisions that shape them, the state of each step, and where the work departs from the design. The design is authoritative; this plan changes with the work and is retired when every step is done.

## Built

Each item is what exists and what checks it.

- **The language.** Parsing text and creating queries from their definition, with the position of every mistake. Checked by the tests of parsing and of the definition.
- **The vocabulary.** The built-in vocabulary declared as module data, and modules that extend it. Checked by the tests of modules, the registry and the vocabulary.
- **Resolution.** Resolving a definition against the vocabulary and typing its result, without a browser; the resolution is kept for its definition, so the queries parsed alike share it. Checked by the resolver tests and the tests of `Domql.resolve`.
- **Reading.** `read` reads every built-in member except `intersects`, which is maintained, and fails it with an evaluation error that says so; a subscription, which ends in an occurrence source such as `eventsOf`, is subscribed to and never read. `readAsync` waits for the first sample of a maintained member, evaluates again as samples arrive and as what the query depends on changes, and lets go of its observations when it answers, fails or is canceled. Each evaluation records its dependencies. A read answers detached, immutable data. Checked by the evaluator tests, in a simulated DOM, and by the browser tests, in Chromium, for geometry, for state the browser decides and for the reads that wait.
- **Observations.** The built-in vocabulary names the observations that cover its members' changes, as types a module declares, and observations are started, shared and ended through sessions. There is no public API for them yet. Checked by the tests of declarations, of the sessions and of the browser observers, and in Chromium by a test of each type of observation reporting a change.
- **Watching.** `Domql.watch` evaluates a query, reports its snapshot, and evaluates again when what the result depends on changes, at the next animation frame or in the task that reported the change, reporting a snapshot that differs and sharing the branches of the last that did not. A watch follows the document, keeps its dependencies through a failed evaluation, recovers, and is refreshed and disposed through its handle. Checked by the tests of watches and of comparing snapshots, in a simulated DOM, and in Chromium by a watch of a size and of a maintained member.
- **Subscribing.** `Domql.subscribe` answers an event listener, which starts a subscription's occurrence source in the call and, at each occurrence, captures the fields its event type declares and evaluates the object expression that follows the source, inside the source's delivery, handing the immutable result to its callback. A maintained member answers its latest sample, or null while it is pending, and is never waited for; the event listener keeps the sessions its last successful projection read, keeps them through a projection that fails, and lets go of everything when disposed. Checked by the tests of projection and of event listeners, in a simulated DOM, and in Chromium by an event listener of clicks and of a maintained member across occurrences.
- **Actions and behaviors.** `Domql.runAsync` runs an action once, after evaluating its receiver and arguments, and answers a promise of its result, checked against the type the action declares and read through the object expression that follows it; a signal cancels it, and nothing an action changed is undone. `Domql.activate` puts a behavior into effect in the call and answers a `DomqlBehavior`, whose `update` replaces its bindings whole, validating them before anything changes, and whose `dispose` ends it once. Checked by the tests of resolving actions and behaviors, of `runAsync`, and of behaviors, in a simulated DOM, and by the README's examples.
- **Live state.** A watch with `updateStrategy: 'liveState'` keeps its result as one object, updated in place by the change sets between its snapshots, so the root and every object and list beneath it keep their identity, and an item of a list projected from elements keeps its object as it moves. Its callback receives the object and the change set just applied; a failed evaluation leaves the object as it was. Checked by the tests of applying change sets in place, of live state, and of watches that keep it, in a simulated DOM, and by the README's example.
- **Change sets.** A watch that delivers change sets sends a baseline and then JSON Patch change sets, each acknowledged before the next is computed against the state it established, and recovers with a baseline of a new generation that nothing earlier can affect. Lists projected from elements change by element, through identities kept beside the result. A current snapshot applies each update atomically and gives a stale one no effect. Checked by the tests of computing and of applying change sets, each against expected patches and results and together, of the dispatcher and the current snapshot, and of watches delivering to a receiver.
- **The package.** The bundle, with its TypeScript declarations checked against `Domql` and against a TypeScript caller; the READMEs' examples run as tests.

What is not built: explicit receivers, calls and named operations, conditional expressions, local values, the query object, editor tooling and the C# half.

## Decisions

Each decision is open until its state says otherwise, and a step that needs it does not start before. A decision that is built keeps its line here alone, and what it decided is in the specification or the design.

### Done

- **D1. How a declaration names the observations that cover its changes.** Done, built by step 1.
- **D2. How a read waits.** Done, built by step 2.
- **D3. The public API of a watch and an event listener.** Done, built by steps 3 to 5 and 7.
- **D4. What DOMQL owns and what a host owns.** Accepted, and stated by the design.
- **D5. The API of actions and behaviors.** Done, built by step 6.
- **D6. Predicate expressions and parenthesized arguments.** Done; D10 replaces its predicate names combined under one verb, which step 11 removed, and its phrases, which step 10 removes.
- **D7. One camelCase name for every member.** Done.
- **D8. How a caller holds live state.** Done, built by step 7.
- **D9. The fluent builder.** Done, built by step 8; D12 retires it, and step 10 removed it.

### Open

- **Negation.** How a query negates a Boolean, which no construct does yet.
- **A behavior that waits.** A behavior that needs to wait before it is in effect would be applied by an `applyAsync` of its own; it is a possibility for later, no part of D12's API, and decided when one is needed.
- **The occurrence sources a behavior offers.** The specification subscribes to them as subscriptions of their own; how a behavior offers one is decided once a behavior that offers one exists.

### D10. Expressions, receivers and calls

A query, an argument and an object field each take an expression, which produces a value. The grammar describes their syntax; resolution and validation decide whether their receivers, names and types are valid. Every member access, call, named operation and predicate expression has an explicit receiver, and `self` denotes the current value.

The language has:

- **Chains:** an initial expression followed by member access, calls and object expressions, which a named operation may end.
- **Predicate expressions:** `is` or `has` applied to one predicate name.
- **Logical expressions:** Boolean expressions combined with `and` and `or`.
- **Conditional expressions:** `if condition then consequent else alternative`.
- **Groups:** parentheses around any expression.

#### Member access, calls and named operations

Member access, calls and named operations are three distinct constructs, not alternate spellings, and the vocabulary declares which form each operation takes.

| Construct | Syntax | Example |
|---|---|---|
| Member access | `receiver.member` | `self.rect.width` |
| Call | `receiver.method(...)` | `self.closest(".row")` |
| Named operation | `receiver operation argument` | `self attributeOf "data-key"` |

```text
self.rect.width                              // Member access.
self.closest(".row").rect.width              // Call, then member access.
self attributeOf "data-key"                  // Named operation.
(self someNamedOperation "value").something  // Access its result.
```

#### Complete grammar

In this notation, `[...]` means optional, `{...}` means repetition, `|` separates alternatives, `-` means exclusion, and `? ... ?` describes a special sequence.

```ebnf
query            = expression end-of-input

expression       = conditional | disjunction
conditional      = "if" expression "then" expression
                   { "elseif" expression "then" expression }
                   "else" expression

disjunction      = conjunction { "or" conjunction }
conjunction      = operand { "and" operand }
operand          = chain [ predicate ]

chain            = initial { "." ( identifier | call ) | object }
                   [ separator named-operation ]
initial          = "self" | parameter | literal | object | group | identifier
group            = "(" expression ")"

call             = identifier "(" [ expression ] ")"
named-operation  = identifier [ separator initial ]

object           = "{" object-content "}"
object-content   = { local "," } field { "," field } [ "," ]
local            = "let" identifier ":" expression
field            = identifier ":" expression

predicate        = "is" ( string | parameter | "null" )
                 | "has" ( string | parameter )

parameter        = "@" identifier
literal          = string | number | "true" | "false" | "null"

identifier       = name - keyword
name             = letter { letter | digit }
keyword          = "true" | "false" | "null" | "self"
                 | "is" | "has" | "and" | "or"
                 | "if" | "then" | "elseif" | "else"
                 | "let"

number           = [ "-" ] integer [ fraction ] [ exponent ]
integer          = "0" | nonzero-digit { digit }
fraction         = "." digit { digit }
exponent         = ( "e" | "E" ) [ "+" | "-" ] digit { digit }

string           = '"' { string-character | string-escape } '"'
string-character = ? any character except double quote or backslash ?
string-escape    = '\' ( '"' | '\' )

letter           = ? ASCII A–Z or a–z ?
digit            = "0" | nonzero-digit
nonzero-digit    = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

separator        = trivia { trivia }
trivia           = whitespace | line-comment | block-comment
whitespace       = ? a character matched by ECMAScript \s ?

line-comment     = "//" { line-character } [ line-feed ]
line-character   = ? any character except LF ?
line-feed        = ? LF ?

block-comment    = "/*" block-content "*/"
block-content    = ? characters up to, but excluding, the first closing */ ?

end-of-input     = ? end of input ?
```

#### Lexical rules

Trivia, whitespace and comments, may appear before and after any token, including before and after the query, and is ignored, except where `separator` requires at least one trivia item: a named operation needs one between its receiver and its name, and between its name and its argument, so the tokenizer keeps whether trivia came before each token.

```text
self attributeOf "data-key"   // A named operation.
self attributeOf"data-key"    // Refused: no separator before its argument.
```

Trivia never splits a token. A name, a number with its sign, a string, a parameter with its `@`, and the delimiters `//`, `/*` and `*/` are each one token, so `- 1`, `@ panel` and `@/* comment */panel` are refused, while trivia can surround a parameter as it surrounds any token. Tokens are read by the longest valid match. Keywords match whole names, so `isVisible` remains an identifier, and every match is exact: names and keywords are case-sensitive, so `IS` is no keyword and `attributeof` is not `attributeOf`. Names contain only ASCII letters and digits, beginning with a letter, so no name, a parameter's included, holds an underscore.

Strings support only `\"` and `\\` as escapes, and may hold a literal line break. Comment markers inside strings are ordinary text. Block comments do not nest and must close.

What follows from the grammar, stated for whoever implements it:

- A call takes one expression: `self.method(a, b)` is refused, and an options declaration takes `self.method({ a: a, b: b })`.
- An object expression holds at least one field, after its locals, each local followed by a comma, and may end with a comma: `{}` and `{ let x: 1 }` are syntax errors.
- A named operation ends its chain, and a group continues from its result.
- A conditional always has its `else`, so no `else` is left dangling.
- `is null` is a predicate expression, and `has null` is a syntax error.

#### Receivers, calls and named operations

- **`self`.** `self` denotes the current value, and is invalid where there is none, at the top level among them. It is a keyword, so no field, alias or member is named `self`.
- **Explicit receivers.** A bare member and a predicate expression without a subject are refused, with an error that gives the form with `self`:

  ```text
  rect.width
  is "disabled"
  ```

- **Member access** reads a property and takes no argument; whitespace never replaces its dot, so `self rect width` is refused.
- **A call** is parenthesized and takes no argument or one, any expression, which needs no group since the parentheses delimit it; the chain continues after it.
- **A named operation** follows its receiver after a separator, takes no argument or one, an initial expression after another separator, and ends its chain; a group continues from its result, with resolution checking which members that result's type has.
- **One form per declaration.** A property is accessed. An operation or an occurrence source declares its form, a call or a named operation, independent of its return type: calls are the default, and named operations are a deliberate set. That a named operation reads as a sentence about its receiver is guidance for choosing one, never a rule a user applies; the declaration and the documentation decide the form. The built-in vocabulary's forms:

  | Form | Members |
  |---|---|
  | Named operation | `attributeOf`, `computedStyleOf`, `matches`, `matchesMedia`, `supports`, `intersects`, `overlaps`, `eventsOf` |
  | Call | `closest`, `first`, `all`, `at`, `where`, `max`, `min`, `sum`, `get` |

- **The form written is checked.** The parser tells the forms apart by their syntax, and the definition records which was written; resolution refuses a form the declaration does not take, with an error giving the one it does: `'attributeOf' is a named operation: write 'self attributeOf "data-key"'`. Neither a call's nor a named operation's syntax accepts named arguments or several positional ones:

  ```text
  self.attributeOf("data-key")
  @panel intersects root: @container margin: 200
  @panel intersects @container 200
  ```

- **Input form.** A declaration states its input, which its parameter count never selects:
  - **Direct:** the argument supplies the value or the expression of the declaration's one parameter; a direct declaration has exactly one, checked when its module registers.
  - **Options:** the argument is an object expression written in place, whose fields supply the declared parameters.

  Changing a declaration's input form is a breaking change, as renaming it is, so an operation that may grow is declared with options from the start.
- **Options.** The fields are mapped to the parameters before anything is evaluated, and each follows its parameter's rules: a fixed parameter takes a literal or a bound parameter, and an expression parameter is evaluated in its declared context, so the object is never evaluated whole. A field the declaration has no parameter for is refused, naming those it has; a required parameter must be given; a missing optional one takes its default; and where every parameter is optional, the argument can be left out, as in `@sentinel intersects`. The fields follow the rules of every object expression, each written with its name, and there is no positional shortcut:

  ```text
  @panel intersects {
      root: @container,
      margin: 200
  }

  self overlaps { other: @sidebar }
  ```

- **What `self` is in an argument,** stated for each parameter, a parameter an options object supplies included: an expression parameter supplies its declared evaluation context, and a value parameter uses the surrounding current value. The built-in expression parameters are those of `where`, `max`, `min` and `sum`, whose `self` is each item of the receiver; the specification states it for every parameter, so what `self` means is predictable without editor tooling.

  ```text
  @items.where(self is "attached" and self is "visible").count
  @panel { nearEnd: @sentinel intersects { root: self, margin: 200 } }
  ```

  In the first, `self` is each item; in the second, the panel.
- **Properties take no arguments,** so `rect` relative to an element is a call of its own, a distinct request with a distinct name:

  ```text
  self.rect
  self.rectRelativeTo(@panel)
  ```

#### One meaning for logical operators

`is` and `has` each read exactly one predicate name, supplied as a string or a fixed parameter. `and` and `or` combine complete Boolean expressions, and never carry a predicate's subject or verb into another operand:

```text
@panel is "attached" and @enabled

@enabled and @panel is "attached"

@panel is "attached" and @input has "selection"

@panel {
    available: self is "attached" and self is "visible",
    occupied: self has "children" or self has "selection"
}
```

The earlier shorthand `@panel is "attached" and "visible"` no longer applies two predicates to the panel: its right operand is a string, so it fails Boolean type validation, and `@panel is "attached" and @panel is "visible"` is written instead. There is no separate grammar for composing predicate names, so there is one grouping rule, and no predicate is parenthesized merely to combine it with another Boolean expression.

Nullable Boolean operands follow three-valued logic:

| Left | Right | `and` | `or` |
|---|---|---|---|
| true | true | true | true |
| true | false | false | true |
| true | null | null | true |
| false | true | false | true |
| false | false | false | false |
| false | null | false | null |
| null | true | null | true |
| null | false | false | null |
| null | null | null | null |

Null is a Boolean that is unavailable: false decides `and`, true decides `or`, and otherwise null stays unknown. A null operand decides neither operator, so the next operand is evaluated, since it may decide the result. This is separate from the rule that an `if` condition of null selects the alternative.

#### Precedence and grouping

Member access, calls, object expressions and a named operation form a chain before a predicate that follows tests its result. Predicate expressions bind more tightly than `and`, which binds more tightly than `or`.

```text
@panel is "attached" or @input is "disabled" and @enabled
```

The conjunction combines the input's predicate expression and `@enabled` before the disjunction combines their result with the panel's.

Parentheses group any expression:

```text
(@panel is "attached" or @input is "disabled") and @enabled
```

Each position in a conditional takes a complete expression, so

```text
if @enabled then @first else @second and @third
```

places the conjunction inside the alternative. To combine the whole conditional with another expression, write:

```text
(if @enabled then @first else @second) and @third
```

Both branches of a conditional are mandatory. Conditionals may nest in any of their three positions. There is no `?:` and no closing `end`.

#### Validation and evaluation

The condition of an `if`, and every operand of `and` and `or`, must have type `boolean` or `boolean?`. These are type requirements, not syntax restrictions, so the following parse and fail validation:

```text
if 42 then "ready" else "waiting"

@panel.rect and true

(if @enabled then "ready" else "waiting") or false
```

True selects a conditional's consequent; false or null selects its alternative. Only the selected branch is evaluated, and its result is kept as it is, false and null included. A nullable condition does not by itself make the result nullable.

The branches have one underlying type, compared structurally for object types, and may differ in nullability: `number` paired with `number?` or `null` answers `number?`, and `number` paired with `string` is refused.

Every expression is resolved and validated before anything is evaluated, branches and logical operands that may be skipped included. Logical operators evaluate from left to right and stop once the result is decided. A watch follows the dependencies of the expressions actually evaluated.

The structural rules stand: the fields of an object are written with their names, which are unique, and `self` requires a current value. The grammar refuses an empty object expression in text, and a definition's object holds at least one field, as the grammar requires of text.

A parameter that names a predicate supplies a fixed, non-null string. An ordinary Boolean parameter after `and` or `or` is evaluated as a Boolean expression.

#### Conditionals and `elseif`

A conditional may test further conditions, in order, before its alternative: true selects that clause's result, false or null moves to the next clause, and where none is true the alternative is evaluated. `elseif` is a keyword.

```text
if @panel.parent is "attached" then "ready" elseif @panel.parent is null then "unknown" else "waiting"

if @panel.parent is "attached" then
    "ready"
elseif @panel.parent is null then
    "unknown"
else
    "waiting"
```

- **`is null`** is the language's own test of absence: true for a null subject and false otherwise, never null itself, and distinct from `is "null"`, which names a registered predicate. `has` takes no `null`.
- **Every clause writes its subject,** as every predicate expression does, so an `elseif` inherits nothing from the clause before it.
- **How a definition records an `elseif`.** As a conditional nested in the `alternative` of the one before it, with no field of its own. A conditional nested in an alternative is written back as `elseif`, so parsing, writing and parsing again gives the same definition.
- **How `is null` is recorded.** Its `name` is a literal node whose value is null, as a string name is a literal node holding a string, never a bare null; validation accepts it under `is` and refuses it under `has`.

#### Definition consequences

- **The definition's version is 3.** A `member` node is a member access, with no argument; a `call` node and a `namedOperation` node each hold an optional `argument`, one node, recorded as written, which resolution maps onto the declared parameters. `self` is a `self` node, and every member, call, named operation and predicate expression holds its receiver as its `target`. A member, call, named operation or predicate expression without a `target` is refused as a structure error; an omitted target never stands for `self`, so `self.size` and `@panel.size` are distinct definitions.
- **Expressions.** A conditional node has `kind: "conditional"` and the expressions `condition`, `consequent` and `alternative`. A logical node has `kind: "and"` or `kind: "or"` and an `operands` array. A predicate node holds, under `name`, one string-literal node or parameter node naming its predicate, or the literal null of `is null`. A group adds no node; the expression tree records the grouping.
- **Field names** are written, always: a field is `name: expression`, and the language infers none, from a member, a `get` or a predicate's name. A definition's field holds its `name` as a required property.
- **An object argument is read by the declaration's input form.** For an options declaration, its fields map to the parameters; for a direct declaration whose parameter takes an object, it is that parameter's value. An object never means options by itself.

#### The principle

The language composes queries through member access, calls, named operations, object expressions, predicate expressions, logical expressions and conditional expressions. Arithmetic, ordering and other computations are provided by vocabulary members or performed by the caller.

State: **decided.** Step 11 has built logical expressions and groups; step 10 builds explicit receivers, calls and named operations, and step 11 then builds conditionals.

### D11. Local values

An object expression can name a value once, as a local, and use it in the entries after it, so a value read in several places is written and evaluated once.

```text
@panel {
    let items: self.all("[data-key]"),

    width: self.size.width,
    rows: items {
        key: self attributeOf "data-key",
        top: self.rectRelativeTo(@panel).top
    },
    tallest: items.max(self.rect.height),
    attached: self.parent is "attached"
}
```

D10's complete grammar holds its productions: `local`, the locals an object's `object-content` writes before its fields, an `identifier` among the initial expressions, which names a local, and the keyword `let`.

- **A local reads as a field does,** a name and its expression, and `let` alone tells the two apart. An object expression writes its locals before its fields, and still holds at least one field.
- **A bare name is a local.** No chain starts with an identifier otherwise, since every member follows a receiver, so an identifier that starts one names a local and needs no sigil. A name no local in scope has is refused, with an error that gives the form with `self` where the vocabulary has a member of that name: `no local named 'rect'; write 'self.rect'`.
- **Order.** A local is visible to the locals after it, to every field of its object expression and to everything nested in them, and never before it, so a query reads from the top down, a local can use the ones above it, and none can depend on itself. Since the locals come first, the order a definition records is the order the text writes.
- **Scope.** A local's expression is resolved where it is written, so its `self` is the current value of the object expression that holds it, wherever the local is used: inside `rows` above, `self` is each row, and `items` is still the panel's list.
- **Names.** Two locals of one object expression never share a name, and a local never reuses the name of a local an enclosing object expression has in scope, so a name means one thing wherever it is visible. Locals and fields are separate, so `let items: …, items: items` holds a field named after its local.
- **Evaluation.** A local is evaluated once in an evaluation, at its first use, and every use sees that value; one that no evaluated expression uses reads nothing, and a watch follows what was read. Like every expression, it is resolved and validated before anything is evaluated.
- **It is never output.** A local is no field, and the result never holds it.
- **Where.** In an object expression alone; an options object, whose fields map to parameters, holds none.
- **Definition.** An object node holds its locals under `locals`, each a name and a value, in order, and a use of one is a `local` node naming it; a definition is checked by the same order, a local seeing only those before it. The writer writes them back as `let` entries before the fields, so parsing, writing and parsing again gives the same definition.

State: **decided.** Built by step 12, after step 11.

### D12. The API

A caller makes a query object once, from text or a definition with its bindings, and carries out every operation through it. This supersedes D9: the fluent builder is retired.

```js
const panelQuery = domql.query(`
    @panel {
        size: self.size,
        hasFocus: self matches ":focus-within"
    }
`, { panel });

const snapshot = await panelQuery.evaluateAsync();

const watcher = panelQuery
    .select("size")
    .watch(renderSize);

watcher.dispose();
```

#### Creating and binding a query

One entry point takes text or a definition:

```js
domql.query(text, bindings?)
domql.query(definition, bindings?)
```

It answers a reusable query object. Creating one parses the text and checks its structure, and evaluates nothing in the document and has no effect; a text is parsed once and its definition reused for identical text, whatever the bindings, and a resolution is kept for as long as the vocabulary it was made against stands.

```js
const panelQuery = domql.query(text, { panel });

// The same expression with another complete set of bindings.
const otherPanelQuery = panelQuery.with({ panel: otherPanel });

// A query made first, and bound afterwards.
const template = domql.query(text);
const boundQuery = template.with({ panel });
```

`with` answers a new query whose bindings replace the old ones whole; the query it was called on, and every operation running from it, are unaffected. A required binding that is missing fails before anything is carried out. A value that reveals no type of its own is bound with `domql.typed(value, type)`:

```js
const query = domql.query(`
    { panel: @panel { size: self.size }, ids: @ids }
`, {
    panel: domql.typed(null, "element?"),
    ids: domql.typed([], "list<number>")
});
```

#### The query object

| Member | What it is |
|---|---|
| `query.definition` | The immutable definition, without its bindings |
| `query.with(bindings)` | A new query with the same definition, bound to these bindings |
| `query.resolve(options?)` | The query validated against the vocabulary, its resolution open to inspection |
| `query.select(...path)` | A part of its result |
| `query.evaluate(options?)` | Evaluates it synchronously |
| `query.evaluateAsync(options?)` | Evaluates it once, waiting for maintained values |
| `query.watch(onChange, options?)` | Starts a watch, with `onChange` as its first attachment |
| `query.watch(options?)` | Starts a snapshot watch, its consumers attached separately |
| `query.subscribe(onEvent, options?)` | Listens to its occurrence source |
| `query.executeAsync(options?)` | Executes its action once |
| `query.apply(options?)` | Applies its behavior |

Evaluating a query only reads state; executing an action or applying a behavior explicitly requests effects. The request's source decides its kind, so the one entry point serves every request kind, and resolution refuses an operation the kind does not take before anything is evaluated or started, with an error that says what the request does and names the operation it takes:

```text
Cannot execute '@panel.size': it produces a value.
Use evaluate() or evaluateAsync().
```

The object `domql.query` answers is a query object, whatever it holds, and what it describes is its request kind: a query, a subscription, an action or a behavior, as the specification names them. An error a caller reads says what the request does, a value it produces, occurrences it listens to, an effect it executes or a behavior it applies, rather than naming the kind.

#### Evaluating

```js
const snapshot = panelQuery.evaluate();
const later = await panelQuery.evaluateAsync({ signal: controller.signal });
```

Both answer detached, immutable data. `evaluate` keeps its synchronous contract and fails on a maintained member that needs a sample; `evaluateAsync` evaluates any query, waiting where it must, and releases its observations when it settles.

| Operation | Options |
|---|---|
| `evaluate` | `window` |
| `evaluateAsync` | `window`, `signal` |

#### Selecting a result

```js
const size = panelQuery.select("size");
const width = panelQuery.select("size", "width"); // As panelQuery.select("size").select("width").

const currentWidth = await width.evaluateAsync();
const widthWatcher = width.watch(renderWidth);

rowsQuery.select(0, "height");
```

A selection offers `select(...path)`, `evaluate(options?)`, `evaluateAsync(options?)`, `watch(onChange, options?)` and `watch(options?)`. A path holds the names of written fields and list indices that are not negative.

- **A path's shape is checked at once.** `query.select(...)` refuses, without resolving anything, a path item that is neither a written field's name nor an index that is a whole number and not negative, as `-1` and `1.5` are not.
- **A path's fit is checked at resolution.** Whether a field exists, and whether an index applies to a list, is checked when an operation resolves the query, before anything is evaluated or observed; a selection of a query whose vocabulary is not yet registered is therefore made without failing.
- A nullable ancestor and a list index out of range give null.
- A list index follows a position, never a particular element.
- A selection reads the whole query's result, so the whole query decides its dependencies, its failures and its readiness.
- A selection's watch delivers its first value, each change to that value, and what recovery delivers. It watches snapshots alone; a caller that wants live state or change sets of a smaller result writes that result in DOMQL.

#### Watching

```js
const watcher = panelQuery.watch(renderPanel);

const configured = panelQuery.watch(renderPanel, {
    schedule: "frame",
    acceptPartialObservation: false,
    onError: reportError,
    signal: controller.signal,
    window
});
```

The update strategy stays an option, and the handle's type follows it:

```js
panelQuery.watch(renderPanel, { updateStrategy: "snapshot" });
panelQuery.watch((state, changes) => renderLivePanel(state, changes), { updateStrategy: "liveState" });
panelQuery.watch(sendUpdate, { updateStrategy: "changeSet" });
```

| Option | Default and meaning |
|---|---|
| `schedule` | `"frame"`, or `"immediate"` |
| `updateStrategy` | `"snapshot"`, or `"liveState"` or `"changeSet"` |
| `acceptPartialObservation` | `false` |
| `onError` | The window's error reporting, where it is left out |
| `signal` | Disposes the watch when it aborts |
| `window` | The window the watch reads, by default the environment's |

Every watch handle has:

| Member | What it is |
|---|---|
| `status` | `"pending"`, `"ready"`, `"failed"` or `"disposed"` |
| `snapshot` | The last successful immutable snapshot, `undefined` before the first, so a result that is null is told apart from none yet |
| `error` | The latest evaluation failure, cleared by the next success |
| `readyAsync(options?)` | Waits for a successful ready state and answers its immutable snapshot |
| `refreshAsync()` | Evaluates now |
| `dispose()` | Stops the watch and releases its sessions |

A failed watch keeps its last snapshot and goes on observing, so it recovers. `readyAsync({ signal })` cancels that wait alone; it rejects where an evaluation fails while it waits or the watch is disposed, and the watch goes on after a failed evaluation.

#### Sharing a snapshot watch

Each `watch` starts a watch of its own. To share one evaluation, a caller keeps its handle and attaches consumers to it:

```js
const watcher = panelQuery.watch({ onError: reportError });

const panelAttachment = watcher.attach(renderPanel);
const sizeAttachment = watcher.select("size").attach(renderSize);
const focusAttachment = watcher.select("hasFocus").attach(renderFocus);

sizeAttachment.dispose(); // Detaches one consumer.
watcher.dispose();        // Stops the watch and detaches every consumer.
```

- **A snapshot watch** offers `attach(onChange)` and `select(...path)`, whether it was started with a callback or without; a callback given to `watch` is its first attachment. Its query is resolved when the watch starts, so `watcher.select(...)` checks the whole path at once, its shape and its fit to the result's type alike, even before the first snapshot arrives.
- **A selected view** offers `snapshot`, `status`, `error`, `select(...path)`, `attach(onChange)` and `readyAsync(options?)`. It starts no evaluation of its own and needs no disposal.
- **An attachment** offers `status`, `"ready"` or `"disposed"`, and `dispose()`, which detaches its consumer.
- **A late attachment** receives the current snapshot before the updates after it. A failing consumer is isolated from the others, and its failure goes to the owning watch's `onError`.
- **The watch runs until its owner disposes it,** whether or not consumers remain attached.

#### Live state and change sets

A live-state watch adds `watcher.liveState`, the stable object DOMQL keeps current, `undefined` before the first snapshot; the caller reads it and never writes it, and the result is still a non-nullable object or list. A change-set watch adds `watcher.acknowledge(update)` and `watcher.recover()`, which only its handle has. Both deliver through the callback they were started with: `attach` and `select` belong to snapshot watches. The receiving side stays `domql.createSnapshot()`:

```js
const current = domql.createSnapshot();

const watcher = panelQuery.watch(update => {
    const outcome = current.apply(update); // "accepted", "stale" or "failed".

    if (outcome === "accepted") {
        watcher.acknowledge(update);
        renderPanel(current.value);
    } else if (outcome === "failed") {
        watcher.recover();
    }
}, {
    updateStrategy: "changeSet",
    onError: reportError
});
```

Baselines, revisions, acknowledgment, coalescing, atomic application and recovery keep their contracts, and the first callback still follows the call, once the caller holds the handle.

#### Events, actions and behaviors

```js
const clicks = domql.query(`
    (@button eventsOf "click") {
        panelSize: @panel.size
    }
`, { button, panel });

const listener = clicks.subscribe(handleClick, { onError: reportError, signal: controller.signal });

const result = await domql.query(actionText, bindings).executeAsync({ signal: controller.signal });

const behavior = domql.query(behaviorText, bindings).apply({ signal: controller.signal });
behavior.update(nextBindings);
behavior.dispose();
```

- **An event listener** offers `status`, `"ready"` or `"disposed"`, and `dispose()`; `subscribe` takes `window`, `signal` and `onError`. Listening starts in the call, occurrences keep their capture and projection, never waiting for maintained samples, and each `subscribe` owns its own listener.
- **An action** is executed again each time `executeAsync` is called, with `window` and `signal`; cancellation undoes nothing, and its result is detached, immutable data checked against the type the action declares.
- **A behavior's handle** offers `status`, `"ready"` or `"disposed"`, `update(bindings)` and `dispose()`; `apply` takes `window` and `signal`. Applying and updating stay synchronous, and `update` replaces every binding, validates before the behavior is called, and never switches to another behavior's declaration.

#### Lifetimes and callbacks

A `signal` is one lifetime for watches, event listeners and behaviors alike:

```js
const lifetime = new AbortController();

panelQuery.watch(renderPanel, { signal: lifetime.signal });
clicks.subscribe(handleClick, { signal: lifetime.signal });

lifetime.abort();
```

An operation that answers a handle, given a signal already aborted, answers a disposed handle and starts nothing; an operation that answers a promise rejects with the signal's reason. A signal is an option an operation accepts; no handle exposes one, since a `handle.signal` would need a contract of its own. The callback rules stand: deliveries keep their order, a promise a callback returns is not awaited, a failing callback undoes no accepted result, and disposal prevents any new callback while one already running may finish.

#### Tooling and extensions

| API | What it is |
|---|---|
| `domql.format(source)` | The canonical text of a text, a definition or a query object |
| `query.resolve(options?)` | Resolution without evaluation, with its `watch` and `acceptPartialObservation` options |
| `domql.createModule(name, contents, functions)` | A module |
| `domql.registerModule(module)` | Registers a module's vocabulary |
| `domql.createSnapshot()` | A change-set receiver |

There is no `parse`: `domql.query(text).definition` gives a text's immutable definition, without evaluating anything.

`domql.format` takes a text, a definition or a query object, and all three give the same canonical text, which the definition writer writes:

```js
domql.format(text)
domql.format(definition)
domql.format(query)
```

- **What it keeps.** The definition's meaning, and the order of its locals and fields as declared; comments and the original layout are discarded, as a definition holds neither.
- **What it needs.** Neither bindings nor a registered vocabulary: it parses and checks structure as `domql.query` does, and resolves nothing.
- **The layout.** Four spaces of indentation for each level of an object expression; an object expression of one field, with no locals, on one line, `{ size: self.size }`, and one of more on one line for each entry; a conditional with an `elseif` on one line for each clause; one space on each side of `and`, `or`, `is`, `has` and a named operation's separators; and no trailing comma.
- **It is stable.** Formatting text already formatted gives the same text. Module declarations and their implementation contracts stay as designed, observation sessions stay internal, and definitions stay open to programmatic authoring.

#### What it changes

- **The fluent builder is retired,** superseding D9 and what step 8 built: `Domql.build`, the builder's generated vocabulary types and the script that generates them, and D10's builder operations. Step 10 removes it first, before the language changes, so it is never migrated to what it would not survive. A text's result is `unknown` in TypeScript, and a result generic a caller gives is an assertion of its own, never inferred or checked; a definition given to `domql.query` leaves room for a builder later.
- **Exports.** The package exports `domql` and `DomqlError` by name, `import { domql, DomqlError } from "…/domql.js"`; the error class keeps its name, and `domql.specificationVersion` is the version of the specification the implementation follows.
- **Renamed:** `Domql` becomes `domql`, and `Domql.bind` becomes `domql.typed`. Reading a query becomes evaluating it, running an action executing it, and activating a behavior applying it, in the API and in the documents alike: `evaluate`, `evaluateAsync`, `executeAsync` and `apply`; a query's rebinding is `with`, and `resolve` keeps its name, since it resolves the query.
- **Moved onto the query:** evaluating, watching, subscribing, executing and applying, so `Domql.read(text, bindings)` and the other one-call forms give way to `domql.query(text, bindings).evaluate()` and its siblings.
- **Removed:** `parse`, which `query(...).definition` covers.
- **C#** mirrors the query object, with `Domql.Query(text, bindings)` and its operations, and `CancellationToken` for cancellation. `Domql.TryQuery` attempts exactly what `Domql.Query` does, creating a query and checking its syntax and structure without resolving its vocabulary or evaluating anything, so a successful return means the query was created, not that it is ready to be carried out: a syntax or structure failure returns false with a diagnostic, and any other failure is thrown, never swallowed.

State: **decided.** Built by step 13, after step 12.

## Steps

A step is done when its tests pass in the gate, its documents say what it built, and its state here says so. A step that is done keeps its line here alone.

- **1. Observation types and observations.** Done.
- **2. Dependencies and maintained members.** Done.
- **3. Watches.** Done.
- **4. Change sets and recovery.** Done.
- **5. Occurrence sources.** Done.
- **6. Actions and behaviors.** Done.
- **7. Live state.** Done.
- **8. The fluent builder.** Done; step 10 removed it, as D12 decides.

### 9. Measured performance

Make reads and watches cheaper where a measurement shows the work, leaving every result, error, error location and change set as it is.

- **Needs:** nothing new; it works inside what is built.
- **Done when:** each change below is measured on its own and kept only for a gain on the workload it targets that is repeatable beyond that workload's noise, with no meaningful loss on another, compared in the same environment on the same workloads; it lands with the regression tests that hold what it must keep, and the gate passes unchanged; the two changes that alter behavior are decided before they are built.
- **The workloads:** `npm run bench` from `tests/`, outside the gate, in the simulated DOM the tests use: a read of 1,000 shaped rows, and a small read by query and by text; a watch of 1,000 rows refreshed unchanged, and with one row changed under each update strategy; the change set of 1,000 items in six orders. Each baseline, and the measurements of each change, are kept under `.local/`.
- **The changes, in order:**
  1. A node's resolution found by the node, kept within its resolved definition so it never crosses bindings or options, with each node's pointer built once as the definition is resolved. Built: reads 24 to 34 percent faster, a watch's refresh 18 to 21 percent.
  2. Detaching a result in one pass, giving the same frozen result and identities. Built: reads 14 to 25 percent faster again.
  3. Each of these where a measurement shows its cost: each object expression's field names, each declared structure's field types, each node's tolerance and each `get` step's default arguments computed once, from inputs that are frozen; an object expression's object built so that a field named `__proto__` is still an ordinary property. Field names and structure field types are built, reading 5 to 9 and 23 percent faster; the tolerance and the defaults of a `get` step have shown no cost yet.
  4. The key of a call's bindings computed once, likewise, and a watch's change callback made once, which keeping a watch's sessions needs and which was built with it.
- **Decided separately, before they are built:**
  - Keeping an observation's session across a watch's evaluations when the same request repeats. Decided and built for watches, as the design's sessions set out, refreshing a watch 37 to 39 percent faster again; reading once and subscribing take sessions over only where a measurement shows the gain.
  - A list's change set by its longest increasing subsequence, which sends one operation to move the first item to the end, where the current diff sends one for every other item. The current diff takes at most half a millisecond for 1,000 items in any order, so this is a question of a change set's size and of what applying and sending it costs downstream, which the workloads do not yet measure; it changes which operations are sent, and their order, ties and repeated elements are settled with it. Open.
- **State:** in progress. Changes 1 and 2, and the session take-over, are built; change 3 is built in part, and so is change 4, whose key of a call's bindings remains with the change set by longest increasing subsequence.

### 10. Explicit receivers, calls and named operations

Write every receiver, and tell member access, calls and named operations apart, as D10 decides.

- **Needs:** D10, D12.
- **Done when:** the fluent builder is removed first, as D12 decides, with its generated types, the script that generates them and the documents that describe it, and every parser, writer and definition test it exercised kept as a test of its own; text and a definition each write member access, calls and named operations with explicit receivers, parsed, validated, written and resolved as D10 sets out, in definitions of version 3; `self` denotes the current value and is refused where there is none, and a definition whose member, call, named operation or predicate expression has no target is refused; an object argument is read by its declaration's input form; a bare member and a subjectless predicate are refused with an error giving the form with `self`; every operation and occurrence source declares its form and its input, the built-in vocabulary's as D10's table gives, a direct declaration having exactly one parameter, and a form its declaration does not take is refused with an error giving the one it does; an options object maps its fields onto the declared parameters before evaluation, each following its parameter's rules, refusing an unknown field, requiring the required and defaulting the optional; a named operation requires its separators; `rectRelativeTo` reads a rectangle relative to an element; every field is written with its name, a field without one is refused by the syntax and by the definition, and nothing infers one; a parameter is one token with its `@`, and an empty object expression is a syntax error; and the specification, the design, the READMEs and every example and test are written with explicit receivers, the specification stating what `self` is for every parameter.
- **State:** in progress. The fluent builder is removed, with its generated types, the script that generated them and the documents that described it; nothing it exercised was left untested elsewhere, since the parser, the writer and definitions keep tests of their own. Written field names, empty objects and parameters as one token remain, and so do explicit receivers, calls and named operations.

### 11. Conditional and logical expressions

Choose between two values, group expressions and combine Boolean expressions, as D10 decides.

- **Needs:** D10, step 10.
- **Done when:** text and a definition each write a conditional, an `elseif`, a group and a logical expression, parsed, validated, written and resolved as D10 sets out, a definition written back as text with the parentheses its grouping needs; `is` and `has` read one predicate name, held under `name`, and `and` and `or` combine complete Boolean expressions alone, answering as the three-valued table gives; an `elseif` is recorded as a conditional nested in the alternative before it and written back as `elseif`, parsing, writing and parsing again giving the same definition; `is null` answers whether its subject is null; true, false and null conditions select their branches; branches of one type with different nullability answer the nullable type, and branches of different types fail with a validation error naming both; only the selected branch and the operands evaluation reaches are evaluated, and a watch follows what was; a group starts a chain, as `(if @wide then @panel else @sidebar).rect.width` does; and the specification, the design and the READMEs describe them, the earlier shorthand of predicate names replaced.
- **State:** in progress. Groups and logical expressions are built: `is` and `has` read one predicate name under `name`, `and` and `or` combine Boolean expressions by the three-valued table, a definition is written back with the parentheses its grouping needs, and the builder combines with `.and` and `.or`. Conditionals, `elseif` and `is null` remain, after step 10.

### 12. Local values

Name a value once in an object expression and use it after, as D11 decides.

- **Needs:** D11, step 10.
- **Done when:** text and a definition each write locals, parsed, validated, written and resolved as D11 sets out; a bare name starting a chain is a local, and one no local in scope has is refused with an error giving the form with `self` where a member has that name; locals come before the fields, a local is visible only after it, and it refuses a name taken in its object expression or by an enclosing one, and is refused in an options object; its `self` is where it is written; it is evaluated once, at its first use, and never output, and a watch follows what it read; the specification, the design and the READMEs describe it; and the specification's grammar is D10's complete grammar, with its lexical rules, which the parser follows as its contract and which D10's retirement leaves to the specification alone.
- **State:** not started.

### 13. The API

Carry every operation out through a query object, as D12 decides.

- **Needs:** D12, step 12.
- **Done when:** `domql.query` takes text or a definition with its bindings and answers a query object that evaluates nothing until an operation is carried out, a text's definition reused for identical text; `with` answers a new query and `domql.typed` binds a value's type; evaluating, selecting, watching, attaching, subscribing, executing and applying behave as D12 sets out, an operation the request's kind does not take refused with an error naming the one it does, every handle with the members its table gives, a signal ending each lifetime, and an aborted one starting nothing; a path's shape is checked when it is selected and its fit when the query is resolved, and a watch's selections at once; `domql.format` gives one canonical text for a text, a definition or a query object, stable when formatted again; `parse` is gone, `Domql` is `domql`, and the package exports `domql` and `DomqlError`; the TypeScript declarations are complete without the builder's, and compile checks cover the exports, the query object's operations, selections, handles, attachments and every overload of `watch`; the benchmarks and the browser tests use the query object and run, each by its own command; and the specification, the design, the READMEs, the repository's own instructions and every example and test use the query object, and the documents evaluate queries, execute actions and apply behaviors in D12's words.
- **State:** not started.

### 14. Editor tooling

Diagnostics and completion over the grammar and the declaration metadata, without running a capability.

- **Needs:** nothing of the runtime.
- **Done when:** a query text is checked against the declarations available to its project, reporting the same positions and messages as resolution.
- **State:** not started.

### 15. The C# half

The query object of D12 for a .NET host: `Domql.Query(text, bindings)` and its operations, `Domql.TryQuery`, typed mapping and snapshots, with `CancellationToken` for cancellation.

- **Needs:** the JavaScript API settled (step 13), D4, D12.
- **State:** not started.

## Departures from the design

None. A departure is recorded here as it happens, with the reason, until the design is brought into line.
