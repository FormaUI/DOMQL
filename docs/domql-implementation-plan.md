# DOMQL Implementation Plan

This plan records the steps that take DOMQL from what is built to what the [specification](domql-specification.md) and the [design](domql-design.md) describe, the decisions that shape them, the state of each step, and where the work departs from the design. The specification is authoritative for the language, and the design for the runtime and its API; this plan changes with the work and is retired when every step is done.

## Built

Each item is what exists and what checks it.

- **The language.** Parsing text and creating queries from their definition, with the position of every mistake, and writing a definition back as text, on one line or laid out as `domql.format` gives a request's canonical text. Checked by the tests of parsing, of the definition and of writing it.
- **Navigation and absence.** Access that requires a receiver that cannot be null, `?.`, optional-access groups, the coalescing operator and access by name, each recorded in the definition and written back as canonical text, a watch following what each evaluates. Checked by the tests of parsing, of the definition, of resolution, of evaluation, of watches and of comparing snapshots.
- **Boolean expressions.** `not`, `and` and `or` of Booleans that cannot be null, and conditions of one, each refusing a Boolean that can be null with the fallback to write, a watch following the operands and clauses evaluation reaches. Checked by the tests of parsing, of resolution, of evaluation and of watches.
- **Nodes, shadow trees and casts.** `node` and its kinds, each a binding can hold, with `parent`, `root`, `host`, `children`, `first` and `all` on every node, a member on a kind of the name of one on `node` refused; an element's `shadow`, whose `root` and `elements` cross into the tree it hosts and the elements a slot shows; and `as`, which casts to `node` and its kinds and refuses a type that is no node and a target that can never be of it. Checked by the tests of types, of parsing, of the definition, of resolution, of evaluation, of writing and of registration, and in Chromium by what the tree's members and the shadow view answer and observe as nodes move, slots are assigned and shadow roots attached.
- **The vocabulary.** The built-in vocabulary declared as module data, and modules that extend it. Checked by the tests of modules, the registry and the vocabulary.
- **Bindings and resolution.** Every binding typed from its value, and a definition resolved against the vocabulary and its result typed, without a browser; the resolution is kept for its definition, so the queries made from one text share it. Checked by the resolver tests and the tests of `query.resolve`.
- **The query object.** `domql.query` makes a query object from text or a definition, `with` binds it anew and `select` takes a part of its result, and every operation is carried out through it, one the request's kind does not take refused before anything runs. Checked by the tests of the query object, of selections and of refusals.
- **Evaluating.** `evaluate` evaluates every built-in member except `intersects`, which is maintained, and fails it with an evaluation error that says so. `evaluateAsync` waits for the first sample of a maintained member, evaluates again as samples arrive and as what the query depends on changes, and lets go of its observations when it answers, fails or is canceled. Each evaluation records its dependencies, and answers detached, immutable data. Checked by the evaluator tests, in a simulated DOM, and by the browser tests, in Chromium, for geometry, for state the browser decides and for the evaluations that wait.
- **Observations.** The built-in vocabulary names the observations that cover its members' changes, as types a module declares, and observations are started, shared and ended through sessions, following a receiver through shadow trees. There is no public API for them. Checked by the tests of declarations, of the sessions and of the browser observers, and in Chromium by a test of each type of observation reporting a change.
- **Watching.** `query.watch` evaluates a query and evaluates it again when what the result depends on changes, at the next animation frame or in the task that reported the change, raising a `change` event for a result that differs, sharing the branches of the last that did not, and an `error` event for a handler that fails. A watch follows the document, keeps its dependencies through a failed evaluation, recovers, is refreshed and disposed through its handle, and shares its evaluation with its selected views; a late listener receives its baseline first, and a signal ends it. Checked by the tests of watches, of their events and views, and of comparing snapshots, in a simulated DOM, and in Chromium by a watch of a size and of a maintained member.
- **Subscribing.** `query.subscribe` answers an event listener, which starts a subscription's event source in the call and, at each event, captures the fields its event type declares and evaluates the object expression that follows the source, inside the source's delivery, handing its handler the immutable result, or the failure of capturing or projecting it. A maintained member answers its latest sample, or null while it is pending, and is never waited for; the event listener keeps the sessions its last successful projection read, keeps them through a projection that fails, and lets go of everything when disposed. Checked by the tests of projection and of event listeners, in a simulated DOM, and in Chromium by an event listener of clicks and of a maintained member across events.
- **Actions and behaviors.** `executeAsync` executes an action once, after evaluating its receiver and arguments, and answers a promise of its result, checked against the type the action declares and read through the object expression that follows it; a signal cancels it, and nothing an action changed is undone. `apply` puts a behavior into effect in the call and answers a `DomqlBehavior`, whose `update` replaces its bindings whole, validating them before anything changes, whose `error` events carry the failures it reports while it runs, and whose `dispose` ends it once. Checked by the tests of resolving actions and behaviors, of executing actions, and of behaviors, in a simulated DOM, and by the README's examples.
- **Live state.** A watch with `updateStrategy: 'liveState'` keeps its result as one object, updated in place by the change sets between its snapshots, so the root and every object and list beneath it keep their identity, and an item of a list projected from elements keeps its object as it moves. Its `change` event carries the object, the snapshot it was brought to and the change set just applied; a failed evaluation leaves the object as it was. Checked by the tests of applying change sets in place, of live state, and of watches that keep it, in a simulated DOM, and by the README's example.
- **Change sets.** The JSON Patch change sets that bring live state up to date, computed between snapshots; lists projected from elements change by element, through identities kept beside the result. Checked by the tests of computing change sets and of applying them in place, each against expected patches and results and together, and of watches that keep live state.
- **The package.** The bundle, exporting `domql` and `DomqlError` and answering the package's version, with its TypeScript declarations checked against `domql` and against a TypeScript caller; the READMEs' examples run as tests.

What is not built: the rest of D13, equality and Boolean members, editor tooling and the C# half.

## Decisions

Each decision is open until its state says otherwise, and a step that needs it does not start before. A decision that is built keeps its line here alone, and what it decided is in the specification or the design.

### Done

- **D1. How a declaration names the observations that cover its changes.** Done, built by step 1.
- **D2. How a read waits.** Done, built by step 2.
- **D3. The public API of a watch and an event listener.** Done, built by steps 3 to 5 and 7.
- **D4. What DOMQL owns and what a host owns.** Accepted, and stated by the design.
- **D5. The API of actions and behaviors.** Done, built by step 6.
- **D6. Predicate expressions and parenthesized arguments.** Done; D10 replaces its predicate names combined under one verb, which step 11 removed, and its phrases, which step 10 removed, and D13 retires its predicate expressions.
- **D7. One camelCase name for every member.** Done.
- **D8. How a caller holds live state.** Done, built by step 7.
- **D9. The fluent builder.** Done, built by step 8; D12 retires it, and step 10 removed it.
- **D10. Expressions, receivers and calls.** Done, built by steps 10 to 12; D13 replaces its three-valued `and` and `or`.
- **D11. Local values.** Done, built by step 12.
- **D12. The API.** Done, built by steps 13 and 16.

### Open

- **A behavior that waits.** A behavior that needs to wait before it is in effect would be applied by an `applyAsync` of its own; it is a possibility for later, no part of D12's API, and decided when one is needed.
- **The event sources a behavior offers.** The specification subscribes to them as subscriptions of their own; how a behavior offers one is decided once a behavior that offers one exists.
- **A flat-tree parent.** A parent across slots, beside the tree's own `parent` and `root` that D13 decides, waits until its uses and its meaning are clear.
- **Saying which declaration a value means.** Where a null receiver or an empty list fits declarations that the specification refuses as ambiguous, a caller has no way to say which it means. A way is designed for the first case that needs one, from that case.
- **Ranges of a list, and rebinding a watch.** A `slice` of a list, a general operation whose indexing, bounds and observation would be specified with it, and updating a running watch's bindings, which would settle whether bindings replace the set, what a failed resolution leaves running, how an update meets an evaluation in progress and which observations and live state survive, are two decisions, each made when a query needs it; a window the viewport decides waits for a need and a measured gain.
- **Incremental evaluation.** Explore incremental evaluation for attribute projections over child elements, including dependency invalidation, retained evaluation state, and fallback to full evaluation. The open question is whether the evaluations that remain valid after a change can be determined reliably: locals, branches and short-circuiting make dependencies conditional, and selectors change membership and order.

### D13. Navigation, absence and tests

Accepted; built by steps 18 to 21, each changing the specification, the design, their examples, the READMEs' and the TypeScript declarations with its code, and each writing the rules of D13's grammar it builds into the specification, the parser's methods and their comments named after them, so the code never follows a grammar the specification does not hold. Access is strict by default and optional where it is written so, a test is an ordinary Boolean member, `is` compares values, and the tree is navigated through nodes as the DOM has them. It supersedes the three-valued `and` and `or`, predicate expressions and `get`, and it decides negation and the members across shadow boundaries, a flat-tree parent apart. Compatibility with the language as built is no constraint.

```
@panel {
    width: self.rect?.width ?? 0,
    hostWidth: (?self.root.host.rect.width),
    parentWidth: (self.parent as "element")?.rect?.width,
    pickerItems: @picker.shadow.root?.all("[role=option]").count,
    editable: not @input.disabled and @input.textEditable,
    saving: @action is "save",
    state: @input[@stateName]
}
```

#### Nodes and the tree

- **Types.** `node` is a type whose kinds are `element`, `document`, `documentFragment` and `shadowRoot`; a value of a kind fits where a `node` is expected, never the reverse, and a kind's own members need a cast from a `node`. `window` is no node. A node has no data form, as an element has none, so a result never holds one.
- **Members of every node.** `parent`, a `node?`, is the immediate parent in the DOM tree: a shadow root for its direct children, the light-DOM parent for an element assigned to a slot, and null for a document, a fragment, a shadow root and the topmost element of a detached tree. `root`, a `node`, is the root of its tree: the document, a fragment, a shadow root, or a detached tree's topmost element, never only a containing shadow root. `host`, an `element?`, is a shadow root's host and null for any other node. `children`, `first` and `all` move from elements to every node, selecting within the receiver's own tree.
- **Members of elements.** `rect`, `closest` and every other element member stay on elements; a direct child of a shadow root reaches the host through `root.host`, and `parent` never crosses a boundary.
- **Declaring.** A member declared on `node` belongs to every kind, and registration refuses a member of the same name declared on a kind, so no rule overrides one.

#### Shadow trees

`shadow` is an element's view of its shadow relationships, a typed value as an extension's view is, with no data form.

- **`shadow.root`**, a `shadowRoot?`, is the open shadow root the element hosts, and null where it hosts none or a closed one.
- **`shadow.elements`**, a `list<element>?`, is a slot's assigned elements, flattened, as `assignedElements({ flatten: true })` answers them: it follows slot assignment through forwarded slots, takes the slot's fallback where nothing is assigned, answers elements only, filters nothing by visibility and enters no assigned element's own shadow tree. A slot that yields no element answers the empty list, as one does whose assigned nodes are text alone, since assigned text suppresses the fallback, and one outside a shadow tree, whatever its fallback; it is null for an element that is no slot. Flattening departs from the platform's default deliberately, so a forwarded slot answers the elements it carries rather than the inner slot.
- **Selectors never pierce a shadow root**, and every crossing is written: `shadow.root` into a tree an element hosts, `root.host` out of the tree an element lives in.

#### Casts

`target as "element"` answers its target, typed as the type it names, where the target is of that type, and null where it is of another or is null; its result is that type made nullable. The type is a quoted type name, fixed when the query is prepared, and for now one of `node` and its kinds; an unknown or unsupported type is a validation error. A cast from `node` narrows, a cast to the target's own type or of null is allowed, since a binding typed from its value may already be of that type or null, and a cast of a non-null target that can never be of the type, such as `5 as "element"`, is a validation error. A cast converts nothing and narrows nothing outside itself. What a cast's target may be is the grammar's, as its notes on cast targets set out.

#### Required and optional access

- **Required.** `.` requires a receiver that cannot be null: `self.rect.width` is a validation error where `rect` is a `rectangle?`, while `self.rect` alone is valid, since a nullable result is no error. A receiver of unknown type, a binding of null, is nullable, and takes `?.` with any property, as step 16 accepts one.
- **Optional.** `?.` reads a member, or calls an operation, of a receiver that is not null, and answers null for one that is, skipping the rest of its chain: in `a?.b.c`, a null `a` gives null, and otherwise `.c` requires a `b` that is not null, written `a?.b?.c` where `b` can be. `?.` on a receiver that cannot be null is allowed, for the same reason a cast to its own type is.
- **Boundaries.** A group ends a chain, so `(a?.b).c` is a required access on a nullable value, a validation error, and the definition records where every optional chain ends. A local holding an optional chain's value holds a nullable value and no policy.
- **Optional-access groups.** `(?…)` makes every access of the `member-access-chain` it holds optional, including those after a group within it, such as a cast's, and its closing parenthesis ends that permission: `(?x.y.z)?.a.b` is `(x?.y?.z)?.a.b`. Its `member-access-chain` is a `receiver`, which may be a grouped cast, followed by at least one access or call; anything else inside it is a syntax error. Its arguments and the bodies of its object expressions keep their own rules. It is notation: parsing rewrites it to `?.`, the definition has no node for it, and the canonical text spells it with `?.`, so `(?self.parent.rect.width)` formats as `self?.parent?.rect?.width`.
- **Nothing else is suppressed.** An unknown member, an invalid argument, an unsupported cast, a module breaking its declared contract and an evaluation failure stay errors, inside `?.` and `(?…)` alike; a member declared non-null that answers null breaks its contract.

#### Access by name

`@input["disabled"]`, `@input[@name]` and `@input[name]` read the property a string expression names, with `?.[…]` as the optional form, at the precedence of `.`, with its receiver, evaluation and observation.

```
@panel {
    let name: if @document.visible then "a" else "b",

    state: @input[name]
}
```

- **The names.** Bracket access takes a string expression whose possible values preparation determines through these forms alone, applied recursively: a string literal; the null literal; a bound parameter, whose value is settled then; a local whose value is any of these forms; a conditional whose branches are each one of them; and a `??` whose left and fallback are each one of them, its possible names its left's values that are not null and, where the left can be null, its fallback's, so `let name: @name ?? "a"` works with `@name` bound to null. Preparation tracks strings and null through these forms and folds no other expression, reading no module's implementation. The whole name expression must produce strings alone: null is allowed only where the expression eliminates it, as `??` does in `@input[null ?? "disabled"]`. Any other expression, such as `@input[self attributeOf "data-state"]`, is a validation error that says its names cannot be determined.
- **Validation and type.** Every possible name must identify a property of the receiver, and the properties' result types must be compatible under the rules of a conditional's branches, so `not @input[name]` is checked as any Boolean is. A resolution is kept for the strings a query's bindings bind, so a name bound anew is resolved anew.
- **Evaluation.** The resolution keeps each candidate's resolved property; evaluation computes the name once and reads the property it selects, so `@input[name]` means `if @document.visible then @input.a else @input.b`. In `receiver?.[name]`, a null receiver skips evaluating the name, as an optional call skips its argument, while preparation still determines and validates it.
- **Observation.** A watch follows what the name read, as `@document.visible` above, and the property it selected, so a change to either evaluates it again and the selection can switch. A number compares within the tolerance of the property selected where the number last reported came from the same property, and exactly where it came from another, as a conditional's branches compare.
- **Receivers of unknown type.** A receiver of unknown type takes `?.[name]` as it takes `?.` with any property: its possible names are still determined when the query is prepared, while whether each is a property and whether their types are compatible are checked once the receiver's type is known, as the specification's rule for such a receiver has it, and its type is the one the specification gives such an access, the result type the declarations of those names share, made nullable, or `null` where they share none.
- **One property.** A bracket names one property, as `.` does: a dotted name is no chain, an operation is reached through a call, and indexing a list by number stays `at`.

It replaces `get`, which also read dotted chains and operations without arguments, so its uses migrate by what they read, and one loses its dynamic form:

| A `get` that read | Becomes |
| --- | --- |
| One property, named by a literal or a binding | A dot or a bracket: `self.rect`, `self[@name]` |
| A dotted chain written as a literal | The chain written out: `@panel.children.count` |
| A dotted chain from a binding | Nothing: a name bound is one property's |
| An operation without arguments | Its call, where its name is known |

#### Absence

The coalescing operator, `value ?? fallback`, answers the value where it is not null, and otherwise evaluates and answers the fallback; false, zero and the empty string are values. Its type is the value's made non-null where the fallback's is, and its operands are of one type as a conditional's branches are. It catches no failure. `??` associates to the right, its value and its fallback each an `equality-operand`, and mixing it with `is`, `is not`, `not`, `and` or `or` without a group is a syntax error, so `(@count ?? 0) is 0` and `@count ?? (0 is 0)` each say what they mean, and `@ready and not @busy ?? false` is refused. `??` on a value that cannot be null is allowed. A number it gave compares within the tolerance of the side it came from where both values came from the same side, and exactly otherwise, as a conditional's branches do.

#### Boolean expressions

`not`, `and`, `or` and a condition take a `boolean`; a `boolean?` is a validation error, as any other type is, and `??` says what absence means at the operand: `not (self intersects { root: @list } ?? true)`. Null is never false, and no truthiness is applied. `and` stops at false and `or` at true, each operand evaluated at most once, every operand prepared and validated before anything is evaluated, and each answers a `boolean`. `not` is a prefix keyword, right-associative, so `not not @a` negates twice; `and not` and `or not` are compositions, not operators of their own. A conditional's condition is a `boolean`, and the clause it selects is evaluated. `where` keeps its declared policy, leaving out an item whose expression is null, which is separate from whether the item itself is null.

#### Equality

`a is b` compares two values and `a is not b` is its complement, the same as `not (a is b)`, with the same definition, and the canonical text writes `is not`. Each answers a `boolean`, evaluating both operands once, from left to right.

- Strings compare exactly, by code unit; numbers numerically, so `-0 is 0` is true; Booleans by value; nodes by identity.
- Null equals only null, and an equality with null is allowed for any type, one that cannot be null included.
- Two types where neither fits the other, such as `"1" is 1` or an `element` with a `document`, are a validation error; nothing is converted.
- Structured values, lists, objects, the window, views and event sources are compared with null alone for now.
- Equality narrows nothing: after `@target is not null`, an access of `@target` follows its type.

For a nullable Boolean `x`, comparing and negating answer differently for null, and the specification states it:

| Expression | Where `x` is null | Same as |
| --- | --- | --- |
| `x is true` | false | `x ?? false` |
| `x is false` | false | `not (x ?? true)` |
| `x is not true` | true | `not (x ?? false)` |
| `x is not false` | true | `x ?? true` |

#### Tests are Boolean members

A test is an ordinary expression that answers a Boolean, `@input.disabled`, `@input matches ":disabled"`, with no verb and no predicate lookup; `is` never selects one, and no quote style does. Each built-in predicate becomes a property, `is "x"` the member `x` and `has "x"` the member `hasX`:

| Predicate | Receiver | Member |
| --- | --- | --- |
| `is "attached"`, `is "disabled"`, `is "readOnly"`, `is "textEditable"`, `is "focused"` | An element | `attached`, `disabled`, `readOnly`, `textEditable`, `focused` |
| `has "children"`, `has "selection"` | An element | `hasChildren`, `hasSelection` |
| `is "visible"`, `has "focus"` | The document | `visible`, `hasFocus` |

- **Collisions.** `has` prefixes its names because `children` and `selection` are members already; every migrated name is checked against the members of its receiver type, `node`'s included, and registration refuses a collision as it refuses any.
- **Contracts.** Each member takes its predicate's receiver type, answers a `boolean`, and keeps its row of how it changes and how it reads, so its observation on a receiver that is not null is unchanged; a nullable receiver follows the access rules, `@x?.disabled` being a `boolean?`.
- **Modules** declare a Boolean member where they declared a predicate; predicate registration, the predicate forms of `is` and `has`, and `has` as a keyword are retired.
- **By name.** `@input[@stateName]` reads one by a bound name, its receiver the input, so a former `has` predicate is named `"hasSelection"` where it was `"selection"`.

#### Infix calls and object expressions

An infix call declares its receiver's null policy as a parameter declares one: it propagates null, accepts it with a meaning of its own, or refuses a nullable receiver when the query is prepared. An optional chain ends before an infix call, which receives its value and applies its policy. An object expression following null is null, and its body sees a current value that is not null; an item of a list that is null answers null at its position. Neither an argument nor an object expression's body inherits the permission of an optional-access group around it.

#### Precedence and grammar

From the tightest: access, calls and access by name, with `.` and `?.`; `as`, which does not chain and continues a chain only from a group, `(self.parent as "element")?.rect`; an infix call, one to an `infix-call-expression`, which ends its chain as D10 decided: its argument is optional and may be a bare name, so in `receiver opA opB` nothing could tell `opB` as `opA`'s argument from an infix call on its result, and a second applies to the first's result only from a group, `(receiver opA x) opB y`, while `a attributeOf "x" attributeOf "y"` is a syntax error; `is` and `is not`, which do not chain, so `a is b is c` is a syntax error and `@left attributeOf "name" is @right attributeOf "name"` compares two attributes; `not`; `and`; `or`; and conditionals, around them as now. `??` stands apart, grouped against `is`, `not`, `and` and `or` by the grammar itself.

This is the complete grammar D13 gives the language, in the specification's notation; it replaces the specification's as steps 18 to 21 build it, and is the specification's whole once step 21 is done:

```ebnf
query                     = expression end-of-input

expression                = conditional-expression | condition
expression-group          = "(" expression ")"

conditional-expression    = "if" condition "then" expression
                            { "elseif" condition "then" expression }
                            "else" expression

condition                 = coalescing-operator | disjunction | or-operand

coalescing-operator       = equality-operand "??"
                            ( equality-operand | coalescing-operator )

disjunction               = or-operand "or" or-operand
                            { "or" or-operand }
or-operand                = conjunction | and-operand

conjunction               = and-operand "and" and-operand
                            { "and" and-operand }
and-operand               = negation | equality | equality-operand

negation                  = "not"
                            ( negation | equality | equality-operand )

equality                  = equality-operand
                            "is" [ "not" ]
                            equality-operand

equality-operand          = chain | cast | infix-call-expression
infix-call-expression     = ( chain | cast ) separator infix-call
infix-call                = identifier [ separator chain-input ]

cast                      = cast-target "as" string
cast-target               = receiver { member-access-expression } | cast-target-group
cast-target-group         = "(" coalescing-operator ")" | optional-access-group

chain                     = chain-input { member-access-expression | object }
chain-input               = input | group

member-access-chain       = receiver member-access-expression { member-access-expression }
optional-access-group     = "(?" member-access-chain ")"
receiver                  = input | "(" cast ")"

input                     = value | object | identifier
value                     = "self" | parameter | literal

group                     = expression-group | optional-access-group

member-access-expression  = ( "." | "?." ) ( identifier | call-expression )
                          | [ "?." ] "[" expression "]"
call-expression           = identifier "(" [ expression ] ")"

object                    = "{" object-content "}"
object-content            = { local "," } field { "," field } [ "," ]
local                     = "let" identifier ":" expression
field                     = identifier ":" expression

parameter                 = "@" identifier
literal                   = string | number | "true" | "false" | "null"

identifier                = name - reserved-word
name                      = letter { letter | digit }
reserved-word             = "true" | "false" | "null" | keyword
keyword                   = "self" | "is" | "not" | "as" | "and" | "or"
                          | "if" | "then" | "elseif" | "else" | "let"

number                    = [ "-" ] integer [ fraction ] [ exponent ]
integer                   = "0" | nonzero-digit { digit }
fraction                  = "." digit { digit }
exponent                  = ( "e" | "E" ) [ "+" | "-" ] digit { digit }

string                    = '"' { string-character | string-escape } '"'
string-character          = ? any character except double quote or backslash ?
string-escape             = '\' ( '"' | '\' )

letter                    = ? ASCII A–Z or a–z ?
digit                     = "0" | nonzero-digit
nonzero-digit             = "1" | "2" | "3" | "4" | "5"
                          | "6" | "7" | "8" | "9"

separator                 = trivia { trivia }
trivia                    = whitespace | line-comment | block-comment
whitespace                = ? a character matched by ECMAScript \s ?

line-comment              = "//" { line-character } [ line-feed ]
line-character            = ? any character except LF ?
line-feed                 = ? LF ?

block-comment             = "/*" block-content "*/"
block-content             = ? characters up to, but excluding, the first closing */ ?

end-of-input              = ? end of input ?
```

- **What changes from the grammar built.** The predicate and its verbs are gone, `has` among the keywords; `not`, `??`, `as`, `?.`, brackets and optional-access groups, `(?…)`, are new; `is` survives as equality alone, and `and` and `or` take a `negation` and an `equality` beside an `equality-operand`. The lexical rules are the specification's, unchanged.
- **Tokens and trivia.** The tokens are names, numbers, strings and the punctuation the rules quote; `?.`, `??` and `(?` are each one token, read by the longest match as every token is, and `[` and `]` are punctuation. Trivia may stand between any two tokens and never inside one, and `separator` requires at least one item of it, so `@input [ @name ]`, `self . rect` and `@input/* note */.disabled` are what they read as, `(?`, `?.` and `??` hold none, and `( ?x.y)` is a syntax error. A name is read whole before it is checked against the reserved words, so `notable`, `isReady` and `asset` are identifiers and a keyword needs no separator to be told from a name, while an infix call keeps its separators, since two identifiers side by side would read as one.
- **The rules.** An `equality-operand` is a `chain`, a `cast` or an `infix-call-expression`: what `??` and `is` take, what `not` and `and` take beside a `negation` and an `equality`, and what `or` takes beside those and a `conjunction`. A `chain` is a `chain-input` and the `member-access-expression`s and object expressions that continue it, so a `chain-input` alone is a `chain`. A `chain-input` is an `input` or a `group`, and is an infix call's argument. An `input` is a `value`, an object expression or a local, and a `value` is `self`, a parameter or a literal, the forms that stand for a value by themselves. A `receiver` is an `input`, or a grouped `cast`, that a `member-access-chain` or a `cast-target` starts from, the receiver of its first access. A `group` is an `expression-group`, `( … )`, or an `optional-access-group`, `(? … )`. An `infix-call-expression` is a receiver and the `infix-call` after it, the member's name and its optional argument, which may be omitted where the member's declaration permits it; a `member-access-expression` is a member access or a call, written as a `call-expression`, after `.` or `?.`, or an access by name, `[…]` or `?.[…]`. Where these notes and D13's prose use the words without code font, they mean what the specification means by them.
- **The specification's words.** The specification's prose shares some of these words, each in a context of its own: a value is any value a query has, where the grammar's `value` rule names the forms that stand for one by themselves; a member's input declaration says how its argument is supplied, direct or options, where the grammar's `input` rule names what a chain starts from; and a receiver is the value any member follows, which the grammar's `receiver` rule is for a member-access chain's first access. Where both could be meant, the prose names which, the grammar's `input` rule or a member's input declaration, and neither is renamed. What the specification called an initial expression is a chain input.
- **Levels.** `??` takes an `equality-operand` on either side, so `a ?? b ?? c` is `a ?? (b ?? c)`, no operand of `is`, `not`, `and` or `or` is an ungrouped `coalescing-operator`, and no operand of `??` is an ungrouped equality or Boolean expression. An `equality` takes an `equality-operand` on either side, and a `cast-target` holds a cast only inside parentheses, so neither chains.
- **Cast targets.** A `cast-target` is a `receiver` and the `member-access-expression`s that follow it, or a `cast-target-group`: a `coalescing-operator` in parentheses, or an `optional-access-group`, so `(@preferred ?? @fallback) as "element"` and `(?@node.parent) as "element"` are casts. Any other grouped expression is deliberately no `cast-target`, `(if @wide then @a else @b) as "element"` being a syntax error, and neither is a `chain` an object expression continues.
- **Optional-access groups.** An optional-access group, `(?…)`, holds a `member-access-chain`, a `receiver` followed by at least one access or call, and makes every access of it optional. A `receiver` that is a grouped cast holds its own `cast-target`, so `(?(self.parent as "element").rect.width)` parses and every access in it, `self.parent`'s included, becomes `?.`; its `cast-target` may hold no access, `(?(@x as "element").rect)`, since the `member-access-chain`'s own access follows the grouped cast. A call's argument keeps the ordinary expression grammar, groups included, and does not inherit the optional-access group's permission.
- **Deliberate limits.** A call takes no argument or one, and several values travel in an object; a bracket takes any expression the grammar allows, and preparation refuses one whose possible names it cannot determine; an object expression holds at least one field, so `{}` and an object of locals alone are syntax errors; an optional-access group holds at least one access; a cast's target is as the cast targets note sets out; a string takes `\"` and `\\` as its only escapes and may hold a line break.
- **Parsing and typing.** The grammar decides what parses and preparation what is valid: `@count ?? (0 is 0)` parses and fails preparation for a number `@count`, since `??`'s operands are of one type, while `if @enabled ?? false then "yes" else "no"` parses and is valid for a nullable Boolean `@enabled`.

#### The definition

A `member` or `call` holds `optional: true` for `?.`, and a `member`'s `name` is the name written, or the node of a bracket's expression where it is no string literal, so `@input["disabled"]` and `@input.disabled` are one definition; an `optionalChain` node holds the chain whose optional accesses end at it under `target`, as every node holds what it follows, so a traversal that follows targets reaches it unchanged, while code that treats a kind of node by its kind recognizes an optional chain as the chain it holds; a `cast` holds its `type` and its `target`; `not` its `operand`; `equality` its `left` and `right`; `coalescing` its `value` and `fallback`. The `predicate` node is retired. An `expression-group` and an `optional-access-group` add no node, and every step that changes the definition's shape raises its version.

#### Observation

`parent` and `root` change with the structure of the tree, which step 17's following of roots and slots observes; `shadow.elements` is observed through `slotchange` and its fallback's structure. A shadow root attached after an evaluation has no notification, so `shadow.root` is partly observable: a watch that accepts partial observation sees it at the next evaluation another change or a refresh causes. Each claim is verified in Chromium before the specification makes it, for reparenting, an ancestor moving, an element detached from the start, forwarded slots and a fallback that changes; a limit found is stated rather than assumed covered. Step 20 found one, a detached tree inserted into another detached tree or into a shadow root, which the browser does not report.

## Steps

A step is done when its tests pass in the gate, its documents say what it built, and its state here says so. A step that is done keeps its line here alone.

- **1. Observation types and observations.** Done.
- **2. Dependencies and maintained members.** Done.
- **3. Watches.** Done.
- **4. Change sets and recovery.** Done; step 13 removed the change-set strategy, and live state keeps its change sets, as D12 decided.
- **5. Event sources.** Done.
- **6. Actions and behaviors.** Done.
- **7. Live state.** Done.
- **8. The fluent builder.** Done; step 10 removed it, as D12 decided.
- **10. Explicit receivers, calls and infix calls.** Done: every receiver is written, and member access, calls and infix calls are distinct, each written in the form its declaration takes.
- **11. Conditional and logical expressions.** Done: conditionals with `elseif`, `is null`, groups, and `and` and `or` by the three-valued table, a watch comparing what a conditional gave by the branch it selected.
- **12. Local values.** Done: `let` names a value once in an object expression, and the specification holds the complete grammar.
- **13. The API.** Done: every operation is carried out through a query object, which watches and behaviors answer with handles that raise events, selections and selected views take a part of a result, a signal ends every lifetime, `domql.format` gives a request's canonical text, and `domql.info` tells the build's version from the specification's.
- **16. Binding types.** Done: every binding takes its type from its value, null as a `null` and the empty list as a `list<never>`, and on a receiver of unknown type a property is accepted until the receiver's type is known, a call is checked by its name, its form and its arguments, and the request keeps its kind, an empty list refusing a tie between declarations as ambiguous.
- **17. Shadow trees in watches.** Done: an observation follows its receiver's root or every root of its flat-tree ancestry, a watch follows a receiver to another tree or slot, and `is "textEditable"` counts an inert ancestor in the flat tree. Following them adds 0.5 to 1 ms to refreshing a watch of 1,000 rows in the simulated DOM, most of it the scrolling each row's `rect` follows at its roots.
- **18. Required and optional access.** Done: `.` requires a receiver that cannot be null and `?.` reads one that can, ending its optional chain with null; an optional-access group makes a chain's accesses optional at once; the coalescing operator falls back where a value is null; and brackets read the property a name determined when the query is prepared names, which replaced `get`.
- **19. Strict Boolean expressions.** Done: `not` negates a Boolean, and `not`, `and`, `or` and a condition take a Boolean that cannot be null, refusing one that can with the fallback to write, which replaced the three-valued `and` and `or`.
- **20. Nodes, shadow trees and casts.** Done: the tree is navigated through nodes, an element's `shadow` crosses into the shadow tree it hosts and to the elements a slot shows, and `as` casts a node to its kind. Chromium tests show that the browser reports no insertion of a detached tree into another detached tree or into a shadow root, so `parent`, `root`, `is "attached"` and `shadow.elements` are partly observable for it.

### 9. Measured performance

Make reads and watches cheaper where a measurement shows the work, leaving every result, error, error location and change set as it is.

- **Needs:** nothing new; it works inside what is built.
- **Done when:** each change below is measured on its own and kept only for a gain on the workload it targets that is repeatable beyond that workload's noise, with no meaningful loss on another, compared in the same environment on the same workloads; it lands with the regression tests that hold what it must keep, and the gate passes unchanged; the two changes that alter behavior are decided before they are built.
- **The workloads:** `npm run bench` from `tests/`, outside the gate, in the simulated DOM the tests use: a read of 1,000 shaped rows, and a small read by query and by text; a read and an unchanged refresh of 1,000 rows whose fields use locals and conditionals; a watch of 1,000 rows refreshed unchanged, and with one row changed under each update strategy; a windowed list as a virtualizer draws one, 60 items between spacers and one kept drawn outside its range, watched as live state and refreshed unchanged, with one item resized and scrolled by one item; the change set of 1,000 items in six orders. Each baseline, and the measurements of each change, are kept under `.local/`.
- **The changes, in order:**
  1. A node's resolution found by the node, kept within its resolved definition so it never crosses bindings or options, with each node's pointer built once as the definition is resolved. Built: reads 24 to 34 percent faster, a watch's refresh 18 to 21 percent.
  2. Detaching a result in one pass, giving the same frozen result and identities. Built: reads 14 to 25 percent faster again.
  3. Each of these where a measurement shows its cost: each object expression's field names, each declared structure's field types, each node's tolerance and each `get` step's default arguments computed once, from inputs that are frozen; an object expression's object built so that a field named `__proto__` is still an ordinary property. Field names and structure field types are built, reading 5 to 9 and 23 percent faster; the tolerance and the defaults of a `get` step have shown no cost yet. A reconciled object or list allocated only at its first difference from the one before it, copying the part that matched, with identity reuse, ordering and change sets as they are, its gain measured on unchanged and changed refreshes alike, since the branching it adds may cost a changed one.
  4. The key of a call's bindings computed once, likewise, and a watch's change callback made once, which keeping a watch's sessions needs and which was built with it.
- **Decided separately, before they are built:**
  - Keeping an observation's session across a watch's evaluations when the same request repeats. Decided and built for watches, as the design's sessions set out, refreshing a watch 37 to 39 percent faster again; reading once and subscribing take sessions over only where a measurement shows the gain.
  - A list's change set by its longest increasing subsequence, which sends one operation to move the first item to the end, where the current diff sends one for every other item. The current diff takes at most half a millisecond for 1,000 items in any order, so this is a question of a change set's size and of what applying and sending it costs downstream, which the workloads do not yet measure; its `indexOf` and `splice` can grow quadratically with a large reorder. It is decided by the total cost of generating, delivering and applying a change set, never by generating it alone; it changes which operations are sent, and their order, ties and repeated elements are settled with it. Open.
- **State:** in progress. Changes 1 and 2, and the session take-over, are built; change 3 is built in part, and so is change 4, whose key of a call's bindings remains with the change set by longest increasing subsequence. Each percentage is the one measured when its change landed, evidence of that change rather than a measure of the runtime now. Compared after step 12 with the commit before step 10, three rounds each, steps 10 to 12 changed no workload beyond its noise, and the workload of locals and conditionals is a baseline of its own. Compared after steps 13 and 16 with the commit before them, three rounds each, no workload changed beyond its noise once a selection's path was checked without finding where the request stands, which a refused path alone needs; before that, a small evaluation was 11 to 13 percent slower. Both sides of that comparison track roots, as step 17 added, so its cost stands as measured when it landed, 0.5 to 1 ms a refresh of 1,000 rows. A windowed list's drawn items, measured through a watch of their keys, tops and heights that leaves the spacers out, laid out in order so a resize moves the items below it and a scroll moves every one, refresh in 0.46 to 0.48 ms unchanged, 0.54 to 0.55 ms with one item resized and 0.77 to 0.78 ms scrolled by one item, each change set carrying the values that moved, the item that left and the one drawn: a list a virtualizer draws needs no machinery of its own.

### 14. Editor tooling

Diagnostics and completion over the grammar and the declaration metadata, without running a capability.

- **Needs:** nothing of the runtime.
- **Done when:** a query text is checked against the declarations available to its project, reporting the same positions and messages as resolution.
- **State:** not started.

### 15. The C# half

The query object of D12 for a .NET host: `Domql.Query(text, bindings)` and its operations, `Domql.TryQuery`, typed mapping and snapshots, with `CancellationToken` for cancellation.

- **Needs:** the JavaScript API settled (step 13), D4, D12.
- **Keeping a watch's result in C#:** the adapter that carries a watch to the host owns its synchronization, and an application starts a watch and receives its results.
  - It watches live state by default.
  - It takes the initial baseline from the first ready event's `args.snapshot`.
  - It queues the changes after it, which are immutable, and delivers one update at a time, in order, sending the next only once the receiving side acknowledges that the one before it was applied completely. This is a scope decision; batching would not in itself need revisions, since consecutive change sets apply in order.
  - The acknowledgment follows application alone, never the application handlers, and a failed delivery stops every further update of that watch.
  - It applies each update so that no consumer observes a change set partly applied: access to the C# result while an update is applied follows an explicit rule, and a result whose application failed becomes unusable. Application handlers are notified once the update is applied.
  - It rejects a delivery from an obsolete watch on the receiving side, before applying it, through a token of its own for the watch it is following.
  - Where applying an update throws, a call rejects, or a call times out, leaving its outcome uncertain, it first invalidates the old watch, so that watch's late applications and acknowledgments change neither the replacement result nor the new queue, and then disposes it and rebuilds the result from a fresh watch's baseline.
  - Where the connection is lost with the components that hold its results, the components that replace them start watches of their own; where a connection resumes with the existing components, an update unanswered across the interruption is uncertain, and the adapter recovers as from a timeout.
  - It reports an exception from an application handler without restarting synchronization, since the state was already accepted.
  - Its application of change sets passes a conformance corpus the JavaScript patcher passes too: each case a previous result, a change set and the result they give, the expected results reviewed independently of either applier, moves and escaped paths among them.
- **State:** not started.

### 21. Equality and Boolean members

Compare values with `is` and `is not`, and turn predicates into Boolean members, as D13 decides.

- **Needs:** steps 19 and 20, for `not` and the identity of nodes.
- **Done when:** `is` and `is not` compare as D13 sets out, refusing two types neither fits and comparing nodes by identity, and `is not` has the definition of `not` around `is`; each built-in predicate is the member D13 names, keeping its receiver, how it changes and how it reads; modules declare Boolean members, and predicate registration, the `predicate` node and `has` as a keyword are gone; `is null` is equality with null; the specification states the table of nullable Booleans, and its examples, the READMEs' and the tests use the members and `@input[@name]` for a name that is bound.
- **State:** not started.

## Departures from the design

None. A departure is recorded here as it happens, with the reason, until the design is brought into line.
