# DOMQL Implementation Plan

This plan records the steps that take DOMQL from what is built to what the [specification](domql-specification.md) and the [design](domql-design.md) describe, the decisions that shape them, the state of each step, and where the work departs from the design. The design is authoritative; this plan changes with the work and is retired when every step is done.

## Built

Each item is what exists and what checks it.

- **The language.** Parsing text and creating queries from their definition, with the position of every mistake. Checked by the tests of parsing and of the definition.
- **The fluent builder.** `Domql.build(q => q.from(target)…)` records the query its callback describes as expressions, binds the targets and values it meets, checks the definition and resolves it as it is built, naming a failure's failing node as DOMQL text, and answers a query typed by the result its projection describes; a query built again alike shares its definition and its resolution. Checked by the tests of the builder against the definitions the equivalent texts parse to, of writing a definition as text, and of the declarations, which a TypeScript caller compiles against and which a test keeps in step with the vocabulary.
- **The vocabulary.** The built-in vocabulary declared as module data, and modules that extend it. Checked by the tests of modules, the registry and the vocabulary.
- **Resolution.** Resolving a definition against the vocabulary and typing its result, without a browser; the resolution is kept for its definition, so the queries parsed or built alike share it. Checked by the resolver tests and the tests of `Domql.resolve`.
- **Reading.** `read` reads every built-in member except `intersects`, which is maintained, and fails it with an evaluation error that says so; a subscription, which ends in an occurrence source such as `eventsOf`, is subscribed to and never read. `readAsync` waits for the first sample of a maintained member, evaluates again as samples arrive and as what the query depends on changes, and lets go of its observations when it answers, fails or is canceled. Each evaluation records its dependencies. A read answers detached, immutable data. Checked by the evaluator tests, in a simulated DOM, and by the browser tests, in Chromium, for geometry, for state the browser decides and for the reads that wait.
- **Observations.** The built-in vocabulary names the observations that cover its members' changes, as types a module declares, and observations are started, shared and ended through sessions. There is no public API for them yet. Checked by the tests of declarations, of the sessions and of the browser observers, and in Chromium by a test of each type of observation reporting a change.
- **Watching.** `Domql.watch` evaluates a query, reports its snapshot, and evaluates again when what the result depends on changes, at the next animation frame or in the task that reported the change, reporting a snapshot that differs and sharing the branches of the last that did not. A watch follows the document, keeps its dependencies through a failed evaluation, recovers, and is refreshed and disposed through its handle. Checked by the tests of watches and of comparing snapshots, in a simulated DOM, and in Chromium by a watch of a size and of a maintained member.
- **Subscribing.** `Domql.subscribe` answers an event listener, which starts a subscription's occurrence source in the call and, at each occurrence, captures the fields its event type declares and evaluates the object expression that follows the source, inside the source's delivery, handing the immutable result to its callback. A maintained member answers its latest sample, or null while it is pending, and is never waited for; the event listener keeps the sessions its last successful projection read, keeps them through a projection that fails, and lets go of everything when disposed. Checked by the tests of projection and of event listeners, in a simulated DOM, and in Chromium by an event listener of clicks and of a maintained member across occurrences.
- **Actions and behaviors.** `Domql.runAsync` runs an action once, after evaluating its receiver and arguments, and answers a promise of its result, checked against the type the action declares and read through the object expression that follows it; a signal cancels it, and nothing an action changed is undone. `Domql.activate` puts a behavior into effect in the call and answers a `DomqlBehavior`, whose `update` replaces its bindings whole, validating them before anything changes, and whose `dispose` ends it once. Checked by the tests of resolving actions and behaviors, of `runAsync`, and of behaviors, in a simulated DOM, and by the README's examples.
- **Live state.** A watch with `updateStrategy: 'liveState'` keeps its result as one object, updated in place by the change sets between its snapshots, so the root and every object and list beneath it keep their identity, and an item of a list projected from elements keeps its object as it moves. Its callback receives the object and the change set just applied; a failed evaluation leaves the object as it was. Checked by the tests of applying change sets in place, of live state, and of watches that keep it, in a simulated DOM, and by the README's example.
- **Change sets.** A watch that delivers change sets sends a baseline and then JSON Patch change sets, each acknowledged before the next is computed against the state it established, and recovers with a baseline of a new generation that nothing earlier can affect. Lists projected from elements change by element, through identities kept beside the result. A current snapshot applies each update atomically and gives a stale one no effect. Checked by the tests of computing and of applying change sets, each against expected patches and results and together, of the dispatcher and the current snapshot, and of watches delivering to a receiver.
- **The package.** The bundle, with its TypeScript declarations checked against `Domql` and against a TypeScript caller; the READMEs' examples run as tests.

What is not built: explicit receivers, calls and named operations, conditional expressions, editor tooling and the C# half.

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
- **D9. The fluent builder.** Done, built by step 8.

### Open

- **Negation.** How a query negates a Boolean, which no construct does yet.
- **A behavior that waits.** A behavior that needs to wait before it is in effect would be activated by an `activateAsync` of its own, decided when one is needed.
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
initial          = "self" | parameter | literal | object | group
group            = "(" expression ")"

call             = identifier "(" [ expression ] ")"
named-operation  = identifier [ separator initial ]

object           = "{" [ field { "," field } [ "," ] ] "}"
field            = [ identifier ":" ] expression

predicate        = "is" ( string | parameter | "null" )
                 | "has" ( string | parameter )

parameter        = "@" identifier
literal          = string | number | "true" | "false" | "null"

identifier       = name - keyword
name             = letter { letter | digit }
keyword          = "true" | "false" | "null" | "self"
                 | "is" | "has" | "and" | "or"
                 | "if" | "then" | "elseif" | "else"

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

Whitespace and comments are ignored between tokens, including before and after the query, except where `separator` requires them: a named operation needs at least one whitespace character or comment between its receiver and its name, and between its name and its argument, so the tokenizer keeps whether trivia came before each token.

```text
self attributeOf "data-key"   // A named operation.
self attributeOf"data-key"    // Refused: no separator before its argument.
```

Names and numbers consume the longest matching token. Keywords match whole names, so `isVisible` remains an identifier. Names are case-sensitive and contain only ASCII letters and digits, beginning with a letter.

Strings support only `\"` and `\\` as escapes. Comment markers inside strings are ordinary text. Block comments do not nest and must close.

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
- **Options.** The fields are mapped to the parameters before anything is evaluated, and each follows its parameter's rules: a fixed parameter takes a literal or a bound parameter, and an expression parameter is evaluated in its declared context, so the object is never evaluated whole. A field the declaration has no parameter for is refused, naming those it has; a required parameter must be given; a missing optional one takes its default; and where every parameter is optional, the argument can be left out, as in `@sentinel intersects`. The fields follow the rules of every object expression, their names written or inferred, and there is no positional shortcut:

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

The structural rules stand: an object is never empty, its field names are unique, an unnamed field has a name to infer, and `self` requires a current value. A field holding a conditional or a logical expression takes a name of its own.

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
- **How a definition records an `elseif`.** As a conditional nested in the `alternative` of the one before it, with no field of its own; the builder nests `conditional` calls for one. A conditional nested in an alternative is written back as `elseif`, so parsing, writing and parsing again gives the same definition.
- **How `is null` is recorded.** Its `name` is a literal node whose value is null, as a string name is a literal node holding a string, never a bare null; validation accepts it under `is` and refuses it under `has`.

#### Definition and builder consequences

- **The definition's version is 3.** A `member` node is a member access, with no argument; a `call` node and a `namedOperation` node each hold an optional `argument`, one node, recorded as written, which resolution maps onto the declared parameters. `self` is a `self` node, and every member, call, named operation and predicate expression holds its receiver as its `target`. A member, call, named operation or predicate expression without a `target` is refused as a structure error; an omitted target never stands for `self`, so `self.size` and `@panel.size` are distinct definitions.
- **Expressions.** A conditional node has `kind: "conditional"` and the expressions `condition`, `consequent` and `alternative`. A logical node has `kind: "and"` or `kind: "or"` and an `operands` array. A predicate node holds, under `name`, one string-literal node or parameter node naming its predicate, or the literal null of `is null`. A group adds no node; the expression tree records the grouping.
- **Field names** are inferred from the last member, call or named operation of a chain and from a predicate's literal name: `self.rect.width` is `width`, `self.closest(".row")` is `closest`, `self attributeOf "data-key"` is `attributeOf` and `self is "disabled"` is `disabled`; `self` alone infers nothing.
- **The builder.** JavaScript's own conditional and logical operators cannot record anything on builder objects, so the builder writes them as calls: `condition.conditional(consequent, alternative)`, `expression.and(other)` and `expression.or(other)`. The callback records each member read or called on an expression as it is written, and `build` settles its form when it resolves the query, as it already does once the callback returns: the definition it answers records a member access, a call or a named operation as each declaration specifies, so `view.intersects({ root: panel, margin: 200 })` gives a named-operation node, which the writer writes as `@p1 intersects { root: @p2, margin: 200 }`. A form a declaration does not take never arises from the builder, since its JavaScript spelling is the same for all three; only the definition `build` answers is a contract, and what the callback records on the way never leaves the builder. The projection's parameter stands for `self`.
- **A plain object is read by the declaration's input form.** For an options declaration, its fields map to the parameters; for a direct declaration whose parameter takes an object, it is that parameter's value. A plain object never means options by itself, in the builder or in text, and this replaces the rule that a plain object given last always gives arguments by name.

#### The principle

The language composes queries through member access, calls, named operations, object expressions, predicate expressions, logical expressions and conditional expressions. Arithmetic, ordering and other computations are provided by vocabulary members or performed by the caller.

State: **decided.** Step 11 has built logical expressions and groups; step 10 builds explicit receivers, calls and named operations, and step 11 then builds conditionals.

## Steps

A step is done when its tests pass in the gate, its documents say what it built, and its state here says so. A step that is done keeps its line here alone.

- **1. Observation types and observations.** Done.
- **2. Dependencies and maintained members.** Done.
- **3. Watches.** Done.
- **4. Change sets and recovery.** Done.
- **5. Occurrence sources.** Done.
- **6. Actions and behaviors.** Done.
- **7. Live state.** Done.
- **8. The fluent builder.** Done.

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

- **Needs:** D10.
- **Done when:** text, a definition and the builder each write member access, calls and named operations with explicit receivers, parsed, validated, written and resolved as D10 sets out, in definitions of version 3; `self` denotes the current value and is refused where there is none, and a definition whose member, call, named operation or predicate expression has no target is refused; the builder settles each form when it resolves, and reads a plain object by its declaration's input form; a bare member and a subjectless predicate are refused with an error giving the form with `self`; every operation and occurrence source declares its form and its input, the built-in vocabulary's as D10's table gives, a direct declaration having exactly one parameter, and a form its declaration does not take is refused with an error giving the one it does; an options object maps its fields onto the declared parameters before evaluation, each following its parameter's rules, refusing an unknown field, requiring the required and defaulting the optional; a named operation requires its separators; `rectRelativeTo` reads a rectangle relative to an element; and the specification, the design, the READMEs and every example and test are written with explicit receivers, the specification stating what `self` is for every parameter.
- **State:** not started.

### 11. Conditional and logical expressions

Choose between two values, group expressions and combine Boolean expressions, as D10 decides.

- **Needs:** D10, step 10.
- **Done when:** text, a definition and the builder each write a conditional, an `elseif`, a group and a logical expression, parsed, validated, written and resolved as D10 sets out, a definition written back as text with the parentheses its grouping needs; `is` and `has` read one predicate name, held under `name`, and `and` and `or` combine complete Boolean expressions alone, answering as the three-valued table gives; an `elseif` is recorded as a conditional nested in the alternative before it and written back as `elseif`, parsing, writing and parsing again giving the same definition; `is null` answers whether its subject is null; true, false and null conditions select their branches; branches of one type with different nullability answer the nullable type, and branches of different types fail with a validation error naming both; only the selected branch and the operands evaluation reaches are evaluated, and a watch follows what was; a group starts a chain, as `(if @wide then @panel else @sidebar).rect.width` does; and the specification, the design and the READMEs describe them, the earlier shorthand of predicate names replaced.
- **State:** in progress. Groups and logical expressions are built: `is` and `has` read one predicate name under `name`, `and` and `or` combine Boolean expressions by the three-valued table, a definition is written back with the parentheses its grouping needs, and the builder combines with `.and` and `.or`. Conditionals, `elseif` and `is null` remain, after step 10.

### 12. Editor tooling

Diagnostics and completion over the grammar and the declaration metadata, without running a capability.

- **Needs:** nothing of the runtime.
- **Done when:** a query text is checked against the declarations available to its project, reporting the same positions and messages as resolution.
- **State:** not started.

### 13. The C# half

`Parse`, `TryParse`, typed mapping and snapshots for a .NET host.

- **Needs:** the JavaScript API settled (steps 1 to 7), D4.
- **State:** not started.

## Departures from the design

None. A departure is recorded here as it happens, with the reason, until the design is brought into line.
