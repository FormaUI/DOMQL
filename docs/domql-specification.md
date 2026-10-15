# DOMQL Specification v1.0.0-alpha

DOMQL is a small language for querying the DOM: a query names what its caller wants to know about a document and its elements, and evaluating it gives one result shaped the way it asked. The same query is evaluated once, watched for changes, or evaluated at each event in the document, and the actions and behaviors a caller asks the browser for are requests of their own kinds. The language knows how to name values and shape results; what can be asked about, an element's size, a computed style, whether it matches a selector, comes from a vocabulary beside it, so adding to what can be asked never changes the language.

This specification defines the language: its syntax, what each request means, the contracts of its vocabulary and the definition every request has. The [DOMQL design](domql-design.md) sets out how requests are built, prepared and carried out.

This specification describes the whole language. An implementation may cover part of it; the [README](../README.md#status) states what this one implements.

## Terms

A **query** is a value expression whose evaluation produces a **result**. A **chain input** is `self`, a parameter, a local, a literal, an object expression or a group, and a **chain** follows **members** from one, each of the value before it, its **receiver**: a **member access** reads a property, `self.rect`, a **call** invokes an operation with parentheses, `self.closest(".row")`, and an **infix call** writes the member's name after its receiver, `self attributeOf "data-key"`, followed by an optional argument, which may be omitted where the member's declaration permits it. An access or a call written with `.` requires a receiver that cannot be null, and an **optional** one, written with `?.`, reads its receiver where it is not null and ends its chain with null where it is; the chain it ends is an **optional chain**. A member belongs to a **type**, such as an element, a list or a rectangle, and a call or an infix call can take an **argument**. `self` is the **current value**, the value an object expression or an argument is evaluated against. An **object expression** names the **fields** of the **object** it produces, each with a value, and the object's **object type** describes those fields and their types. A **local** names a value in an object expression, written once with `let` and used by its name in the entries after it. A **predicate expression** asks whether a value satisfies a **predicate**, a name the vocabulary registers, with `is` or `has`. A **logical expression** combines Boolean expressions with `and` and `or`, a **conditional** chooses between two values by a Boolean condition, a **coalescing operator**, `??`, answers a value where it is not null and its fallback where it is, an **expression group** is an expression in parentheses, and an **optional-access group**, `(? … )`, holds an **access chain**, a receiver and the accesses after it, every one of them optional. A **parameter** is a name a query reads a value through, such as `@panel`, and a **binding** is the value the caller supplies for it, such as an element. A **vocabulary** is a set of types and their members; the **built-in vocabulary** comes with DOMQL, and an **extension** is a vocabulary registered under a name of its own. An **event source** is a member whose value is a stream of **events**, things that happened, rather than state; an event belongs to an **event type**, such as `click`, and what its source captured of it is its **event data**. An **action** is an operation the browser carries out once, and a **behavior** one that runs on until it is updated or disposed; a **request** is a query, a subscription, an action or a behavior request. A query's **definition** is the JSON document recording its meaning, and every request has one.

## Syntax

In this notation, `[...]` means optional, `{...}` means repetition, `|` separates alternatives, `-` means exclusion, and `? ... ?` describes a special sequence. A name ending in `-term` names the forms a level of `and` and `or` accepts, as `conjunction-term` names what `or` joins; every other name describes a form written or the category a position holds.

```
query                     = expression end-of-input

expression                = conditional | coalescing-operator | logical-term | operand
expression-group          = "(" expression ")"

conditional               = "if" condition "then" expression
                            { "elseif" condition "then" expression }
                            "else" expression

condition                 = coalescing-operator | logical-term | operand

coalescing-operator       = equality-operand "??"
                            ( equality-operand | coalescing-operator )

logical-term              = disjunction | conjunction
disjunction               = conjunction-term "or" conjunction-term
                            { "or" conjunction-term }
conjunction-term          = conjunction | operand
conjunction               = operand "and" operand { "and" operand }

operand                   = equality-operand [ predicate ]

equality-operand          = chain | infix-call-expression
infix-call-expression     = chain separator infix-call
infix-call                = identifier [ separator chain-input ]

chain                     = chain-input { access-expression | object }
chain-input               = input | group

access-chain              = receiver access-expression { access-expression }
optional-access-group     = "(?" access-chain ")"
receiver                  = input

input                     = value | object | identifier
value                     = "self" | parameter | literal

group                     = expression-group | optional-access-group

access-expression         = ( "." | "?." ) ( identifier | call-expression )
call-expression           = identifier "(" [ expression ] ")"

object                    = "{" object-content "}"
object-content            = { local "," } field { "," field } [ "," ]
local                     = "let" identifier ":" expression
field                     = identifier ":" expression

predicate                 = "is" ( string | parameter | "null" )
                          | "has" ( string | parameter )

parameter                 = "@" identifier
literal                   = string | number | "true" | "false" | "null"

identifier                = name - reserved-word
name                      = letter { letter | digit }
reserved-word             = "true" | "false" | "null" | keyword
keyword                   = "self" | "is" | "has" | "and" | "or"
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
nonzero-digit             = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

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

An identifier is a name that is no reserved word, as `matchesMedia` is; it holds no hyphen, so every identifier is also a JavaScript identifier. No reserved word, a literal's or a keyword, can be used as a name, even where its position would tell it apart, as in `self.null` or `{ null: 1 }`, so one naming rule holds everywhere; the restriction applies equally to text queries and to definitions created directly, wherever a name is declared or supplied: a member, a parameter, a field's or a local's name, and an extension's or a predicate's declaration. A string holding a reserved word stays an ordinary string, so `self attributeOf "null"` reads the attribute named `null`. `document` and `window` name the roots, and no binding can take either. They are ordinary names everywhere else, so `window: @window { size: self.size }` names a field `window`. The tokens are names, numbers, strings and the punctuation the rules quote, `?.`, `??` and `(?` each being one token, so `? .`, `? ?` and `( ?` are syntax errors. Trivia, which is whitespace, line breaks included, and comments, may stand between any two tokens and never inside one, and is required where the grammar writes `separator`: between an infix call's receiver and its name, and between its name and its argument, so `self attributeOf"id"` is a syntax error. A parameter is one token, its `@` and its name together, so `@ panel` and `@/* the panel */panel` are syntax errors, as `- 5` is no number. Tokens are read by the longest match, and a reserved word matches a whole name alone, so `isVisible` and `nullable` are identifiers; every match is exact, so `IS` is no keyword. A string takes `\"` and `\\` as its only escapes, and may hold a line break. A block comment does not nest, so the first `*/` closes it, and one never closed is a syntax error. Inside a string, `//` and `/*` are text, so `"https://example.com"` and `"/* */"` read as written.

A conjunction exists only where `and` is written, and a disjunction only where `or` is, so an expression with neither is an operand. A chain is its chain input and the access expressions and object expressions that continue it, so `42` and `@panel` are chains of their input alone. The grammar's `value` rule names `self`, a parameter and a literal, the forms that stand for a value by themselves, while a value in this specification's prose is any value a query has, whose type resolution decides. The grammar's `input` rule names what a chain or an access chain starts from, while a member's input declaration, which the section on arguments sets out, says how its argument is supplied. A condition and an operand of `and` or `or` are Boolean by type, which validation checks, so a Boolean parameter, `if @wide then …`, and an operation answering a Boolean, `self matches ":focus" and @enabled`, are written as they read.

```
@viewport {
    // The viewport's width, and whether focus is within it.
    width: self.rect?.width,
    hasFocus: self matches ":focus-within",
    columns: self.all("[data-column]") { key: self attributeOf "data-column", width: self.rect?.width }
}
```

### Member access, calls and infix calls

Member access, calls and infix calls are three distinct constructs, not alternate spellings of one, and the vocabulary declares which form each member takes.

| Construct | Syntax | Example |
| --- | --- | --- |
| Member access | `receiver.member` | `self.children.count` |
| Optional access | `receiver?.member` | `self.rect?.width` |
| Call | `receiver.method(argument)` | `self.closest(".row")` |
| Infix call | `receiver member argument` | `self attributeOf "data-key"` |

```
self.children.count                            // Member access.
self.closest(".row")?.rect?.width              // A call, then optional access.
self attributeOf "data-key"                    // An infix call.
(self.closest("[data-group]") attributeOf "data-group") is "set"
```

- **Member access** reads a property and takes no argument; whitespace never stands for its dot, so `self rect width` is a syntax error.
- **Required and optional access.** `.` requires a receiver that cannot be null, and a nullable one is a validation error that gives the form with `?.`. `?.` reads a member, or calls an operation, of a receiver that is not null, and answers null for one that is, skipping the rest of its chain: in `@panel.parent?.children.count`, a panel without a parent gives null, and otherwise `.count` counts its parent's children. A group ends a chain, so in `(@panel.parent?.children).count` the `.count` follows a `list<element>?` and is a validation error. `?.` on a receiver that cannot be null is valid, since a binding typed from its value may be one that can.
- **Optional-access groups.** `(?@panel.parent.rect.width)` is `@panel?.parent?.rect?.width`: an optional-access group holds an access chain, a receiver, `self`, a parameter, a literal, a local or an object expression, followed by at least one access or call, and makes every access of it optional. Its closing parenthesis ends its optional chain, so `(?@x.y.z)?.a.b` is `(@x?.y?.z)?.a.b`, whose `.b` requires an `a` that is not null. Anything else inside it is a syntax error, an object expression or an infix call among them, and a call's argument keeps its own rules. It is notation for its accesses: the definition records them as optional, and the canonical text writes them with `?.`.
- **A call** takes no argument or one, any expression, inside its parentheses, and the chain continues after it.
- **An infix call** writes the member's name after its receiver and a separator, followed by an optional argument, a chain input after another separator: `self`, a parameter, a local, a literal, an object expression or a group. The argument may be omitted where the member's declaration permits it. It ends its chain, and a group continues from its result.
- **One argument.** Neither form takes named arguments or several positional ones: an operation with several parameters takes them as the fields of one object, `@sentinel intersects { root: @panel, margin: 200 }`, so `self.closest(".a", ".b")` and `@panel intersects @container 200` are syntax errors.
- **The form a member takes** is its declaration's: a property is accessed, and an operation or an event source is a call unless it is declared an infix call. Writing a member in another form is a validation error that gives the form it takes: `'attributeOf' uses infix-call syntax: write 'self attributeOf "data-key"'`. The forms of the built-in vocabulary are in its tables.

The boundaries are decided by the text alone, never by how many parameters an operation declares, so the grammar needs no vocabulary and every member of every vocabulary takes it alike.

## Names and resolution

Every member access, call, infix call and predicate expression has its receiver written before it, and `self` is the **current value**, so a reader never has to guess what a name applies to: a name starting with `@` is a parameter, `self` is the current value, and a bare name that starts a chain is a local. A member written without its receiver, as `rect.width`, names no local, a validation error that gives the form with `self` where the current value has a member of that name; one given an argument, as `attributeOf "id"`, and a predicate expression without a subject, as `is "disabled"`, are syntax errors that give the form with `self`.

- **At the top level** there is no current value, so a query starts with a parameter, a literal or an object expression, and `self` there is a structure error.
- **Inside an object expression**, the current value is the value it follows: in `@viewport { width: self.rect?.width }`, `self` is the viewport. An object expression at the top level, `{ anchor: @anchor.rect, open: @popup matches ":popover-open" }`, has no current value, so each of its fields starts with a parameter, a literal or an object expression.
- **An object expression following no value** keeps the current value around it, so it groups fields: in `@panel { layout: { width: self.size?.width, height: self.size?.height } }`, `self` is the panel. At the top level that value is absent.
- **Parameters** resolve the same way everywhere, inside object expressions and arguments alike. A parameter's value is an element, or data: a number, a string, a Boolean, null, a list or an object, as a behavior's configuration is, and a list or an object can hold elements.
- **The roots** are predefined parameters: `@document` is the document and `@window` is the browser window, its layout viewport and what it supports. No binding can take either name.

### Arguments

A call or an infix call takes one argument, and its declaration states what that argument supplies, its **input**:

- **Direct:** the argument is the value or the expression of the member's one parameter, as `"data-key"` is in `self attributeOf "data-key"`.
- **Options:** the argument is an object expression written in place, whose fields supply the member's parameters by name, as `{ root: @panel, margin: 200 }` does for `intersects`. Each field follows its parameter's rules; a field the member has no parameter for is a validation error naming those it has, a required parameter must be given, and a missing optional one takes its default. Where every parameter is optional, the argument can be left out, as in `@sentinel intersects`. An object means options only by its member's input: the object a direct member is given is its one parameter's value.

Every parameter of a member is declared as one of two kinds, and the evaluator treats them differently; a parameter an options object supplies is the same.

- A **value argument** is evaluated once, where the call is written, against the same current value as the chain it appears in, so its `self` is that current value. In `@viewport { intersects: self.first(".item") intersects { root: self.parent } }`, `self.parent` is the viewport's parent, not the item's. At the top level, where there is no current value, a value argument starts with a parameter, a literal or an object expression: `@target intersects { root: @target.parent }`.
- An **expression argument** is evaluated by the member against a context the member's signature declares, such as each item of a list, which is its `self`. In `@table.all("tbody tr").max(self.rect?.height)`, `self` is each row. The built-in vocabulary's expression parameters are those of `where`, `max`, `min` and `sum`.

A value argument can be declared **fixed**, where it selects something validation needs before evaluation, such as the event type whose members `eventsOf` offers, the feature `supports` names or the member `get` reads. A fixed argument is a literal or a bound parameter, whose value is settled when the query is prepared; any other value is a validation error.

Because the kind is part of the signature, the evaluator validates every kind before evaluation and records the dependencies of value and expression arguments while it evaluates.

### Predicate expressions

`is` asks about a state or a classification, and `has` about presence. Each tests a **subject** against one predicate, a name the vocabulary registers for that verb, as the section on predicates lists for the built-in vocabulary. The grammar defines the verbs; the vocabulary defines which predicates exist, the types each applies to and how each changes, so a new predicate adds no syntax.

```
@document is "visible"
@panel.parent is "attached"
@input has "selection"
@panel is @state
@panel.parent is null
```

- **The subject** is the value of the chain before the verb, always written. A dot binds tighter than a verb, so `@panel.parent is "attached"` tests the panel's parent, and an infix call's result can be tested too, `@panel attributeOf "role" is "set"`. The current value is tested as `self`, inside an object expression or an expression argument: `@panel { attached: self is "attached" }` and `@panel.all("input").where(self is "disabled")`.
- **One predicate.** A predicate expression reads one predicate name, and combining predicate expressions is a logical expression's work: `@panel is "attached" and @panel is "visible"` tests the panel twice, while `@panel is "attached" and "visible"` is an `and` whose second operand is the string `"visible"`, which fails validation.
- **Evaluation.** The subject is evaluated, and the predicate is applied to it.
- **Names.** A predicate is named by a string, read exactly, or by a bound parameter, which is fixed: it is settled when the query is prepared and must supply a non-null string. `@panel is @state` takes its name from the bindings.
- **Results.** A predicate expression answers a `boolean`. Its subject propagates null as an infix call's receiver does: a predicate expression of null answers null, and its type is `boolean?` when its subject's is nullable.
- **`is null`** is the language's own test of absence: true for a subject that is null and false for any other, never null itself, so its type is `boolean` whatever its subject's. It is distinct from `is "null"`, which names a registered predicate, and `has` takes no `null`. A predicate the verb does not register, or one that does not apply to the subject's type, is a validation error naming it.
- **The predicate expression ends its operand.** Nothing follows one but `and`, `or` or the end of its expression, neither a member nor an object expression; a predicate expression can be a field's value, an argument, an operand or a whole query.

### Logical expressions and groups

`and` and `or` combine Boolean expressions, and parentheses group any expression.

```
@panel is "attached" and @enabled
@input is "disabled" or (@input is "readOnly" and @input is "textEditable")
@panel { available: self is "attached" and self is "visible" }
(@panel is "attached" or @input is "disabled") and @enabled
```

- **Operands.** Every operand of `and` and `or` is a `boolean` or a `boolean?`, and an operand of another type is a validation error naming it. A predicate expression binds tighter than `and`, and `and` tighter than `or`, so `@panel is "attached" or @input is "disabled" and @enabled` combines the input's predicate expression and `@enabled` before the panel's.
- **Results.** Null is a Boolean that is unavailable. `and` answers false where an operand is false, and otherwise null where an operand is null and true where none is; `or` answers true where an operand is true, and otherwise null where an operand is null and false where none is:

| Left | Right | `and` | `or` |
| --- | --- | --- | --- |
| true | true | true | true |
| true | false | false | true |
| true | null | null | true |
| false | true | false | true |
| false | false | false | false |
| false | null | false | null |
| null | true | null | true |
| null | false | false | null |
| null | null | null | null |

- **Evaluation.** Operands are evaluated from left to right, and evaluation stops at the first that decides the result, false for `and` and true for `or`; a null decides neither, so the next operand is evaluated, since it may. Every operand is resolved and validated before anything is evaluated all the same, and a watch follows the operands evaluation reached.
- **Type.** A logical expression is a `boolean`, and a `boolean?` where an operand can be null.
- **Groups.** An expression group holds an expression and adds nothing of its own, so `((@panel))` is `@panel`, and as a chain input it can start a chain: `(@panel).children.count`.

### Conditionals

A conditional chooses between two values: `if` a Boolean condition `then` its consequent `else` its alternative. Further conditions, each with `elseif`, are tested in order before the alternative.

```
if @wide then @panel else @sidebar
if @panel.parent is "attached" then "ready" elseif @panel.parent is null then "unknown" else "waiting"
@panel { state: if self is "disabled" then "locked" else "open" }
(if @wide then @panel else @sidebar).rect?.width
```

- **Conditions.** A condition is a `boolean` or a `boolean?`, and one of another type is a validation error naming it. True selects the clause's value; false or null moves to the next clause, and where no condition is true, the alternative is the value. A nullable condition does not by itself make the conditional nullable.
- **Branches.** Every branch is mandatory, and they are of one type, compared structurally for object types, which may differ in nullability: a conditional is nullable wherever a branch is, so `number` and `number?`, or `number` and `null`, give `number?`, while `number` and `string` are a validation error naming both.
- **Evaluation.** Only the selected branch is evaluated, and its value is kept as it is, false and null included. Every branch is resolved and validated before anything is evaluated all the same, and a watch follows what was evaluated.
- **Grouping.** A consequent and an alternative each take a whole expression, an ungrouped conditional included, so `if @a then @b else @c and @d` holds the `and` in its alternative. A conditional that is a condition, an operand of `and` or `or`, the subject of a predicate expression, or the start of a chain is grouped: `if (if @a then @b else @c) then 1 else 2` and `(if @wide then @panel else @sidebar).rect?.width`. A conditional has no `?:` form and no closing `end`.
- **Every clause writes its subject,** as every predicate expression does, so an `elseif` inherits nothing from the clause before it.

### Coalescing operators

A coalescing operator answers its value where it is not null, and otherwise its fallback: `value ?? fallback`.

```
@panel.rect?.width ?? 0
@panel attributeOf "data-label" ?? @panel attributeOf "title" ?? "untitled"
(@enabled ?? false) and @ready
```

- **Evaluation.** The value is evaluated once, and the fallback only where the value is null, so a watch follows what the fallback reads while the value is null alone. False, zero and the empty string are values, which the fallback never replaces, and a failure of either side stays a failure.
- **Type.** The value and the fallback are of one type, compared as a conditional's branches are, and the whole is of the value's type made non-null where the fallback's is, so `@panel.rect?.width ?? 0` is a `number`. A value of the type `null` gives the fallback's type, and `??` after a value that cannot be null is valid, since a binding typed from its value may be one that can.
- **Association.** `??` associates to the right, so `@a ?? @b ?? 0` is `@a ?? (@b ?? 0)`, and each side is an equality operand: a chain or an infix call.
- **Grouping.** A coalescing operator stands beside `and`, `or` and a predicate expression only where a group holds one of them, so `@enabled ?? false and @ready` and `@a ?? @b is "attached"` are syntax errors, while `(@enabled ?? false) and @ready` and `@enabled ?? (@ready and @visible)` each say what they mean.

### Locals

An object expression can name a value once, as a **local**, and use it by its name in the entries after it, so a value read in several places is written and evaluated once.

```
@panel {
    let items: self.all("[data-key]"),

    width: self.size?.width,
    rows: items {
        key: self attributeOf "data-key",
        top: self.rectRelativeTo(@panel)?.top
    },
    tallest: items.max(self.rect?.height),
    attached: self.parent is "attached"
}
```

- **Writing one.** A local is written as a field is, a name, a colon and a value, after `let`. An object expression writes its locals before its first field, each followed by a comma, and still holds at least one field, so `{ let x: 1 }` is a syntax error.
- **Using one.** A bare name that starts a chain is a local, as `items` is above, and stands where any chain input does: a chain continues from it, an object expression follows it, and an infix call takes it as its argument. A local takes no argument, so `items(…)` is a syntax error.
- **Scope.** A local is visible to the locals after it, to every field of its object expression and to everything nested in them, arguments included, and never before it, so none can depend on itself. A name no local in scope has is a validation error, which gives the form with `self` where the current value has a member of that name: `No local named 'rect' is in scope; write 'self.rect' for the member of the current value`.
- **Names.** Two locals of one object expression never share a name, and a local never reuses the name of one an enclosing object expression has in scope, so a name means one thing wherever it is visible; either is a structure error. Locals and fields are separate, so `let items: …, items: items` holds a field named after its local.
- **Its `self`** is the current value of the object expression that holds it, wherever it is used: inside `rows` above, `self` is each row, and `items` is still the panel's list.
- **Evaluation.** During each evaluation, each application of an object expression has its own locals. Each local is evaluated at most once, at its first use within that application, and every use there sees that value: in `@panel.children { let r: self.rect, … }`, each child gets its own `r`, and a later evaluation gets fresh locals. An unused local evaluates nothing and contributes no observation dependencies, and a watch follows what was read. Like every expression, it is resolved and validated before anything is evaluated.
- **It is never output.** A local is no field, and the result never holds it, so it can hold what no field can, such as an element or a list of them.
- **Where.** In an object expression alone: an options object, whose fields supply its member's parameters, holds none, and a local there is a validation error.

### Case-sensitive names

Every name in DOMQL is case-sensitive, and nothing normalizes one: `size` and `Size` are different names, and so are `@panel` and `@Panel`. A name is resolved exactly as it is written, and each kind of name is spelled by its own convention:

- **Members** are named in camelCase, properties and operations alike: `size`, `clientSize`, `matchesMedia`, `attributeOf`, `eventsOf`. A member has one name, the same in a text and a definition. `self.get("clientSize")` reads that property by the same name.
- **Predicates** keep their declared spelling, which `is` and `has` read from a string: `self is "readOnly"`, `self is "scroll.atEnd"`.
- **Field names and bindings** keep the exact spelling their author gave them, so `hasFocus` and `hasfocus` are two fields, and a binding `panel` is not a binding `Panel`.
- **Strings** are preserved exactly: `kind: "List"` answers `List`. A string is read as a DOMQL name only where a member interprets it as one, as `get`, `is` and `has` do, and it is then read exactly. A value passed to a browser API, such as a selector, an attribute's name or value, or an event type, follows that API's own case rules.

A field answers the key its name is written as, and how a consumer matches keys to its own members is its own: a consumer that cannot tell `hasFocus` from `hasfocus` reports the ambiguity, and the language is unaffected. How a module names an operation in DOMQL, and which function carries it out, is the module's declaration.

## Values

A value is a number, a string, a Boolean, null, a list, a structured value such as a rectangle, an element, the window, the document, or an event source. A member's signature declares its result type, as the section on types sets out, and a result marked `?` can be null by itself; an optional access answers null where its receiver is null, as an infix call does, and any member answers null where an argument is null and its parameter propagates null.

A result is data: numbers, strings, Booleans, null, lists and objects. An element or an event source has no data form, so a query whose result would contain one is a validation error; a query reads the facts it needs of an element through an object expression.

### Objects

- A field is written with its name before its colon, `width: self.rect?.width`, whatever its value is, and the language infers no name: a field without one is a syntax error, as is an object expression without a field.
- Two fields of one object expression with the same name are an error when the query is created.
- A result keeps its fields in the order the object expression names them.
- An object expression following null is null.

### Lists

- An object expression following a list applies to each item and answers a list of the same length, in the same order; an item that is null answers null at its position.
- A member following a list is a member of the list itself: `self.all("tr").count` counts rows.
- `count` of an empty list is 0, and `sum` is 0. `max` and `min` of an empty list are null.
- `max`, `min` and `sum` take a number expression, skip items whose expression is null, and answer null for `max` and `min` when every item was skipped.
- `where` takes a Boolean expression and keeps the items it is true for, leaving out an item whose expression is null; an expression of any other type is a validation error.
- `first`, `last` and `at` answer null when the list has no such item.

CSS selectors and `where` are the two ways a query filters: a selector chooses elements as the browser matches them, and `where` chooses list items by any Boolean the vocabulary offers.

## Types

A value has a type, and every member declares the types it works with. Type checking is part of preparation: a request that cannot be typed is a validation error naming where it fails, the type it expected and the type it found, before anything is evaluated.

The types are `number`, `string`, `boolean`, `element`, `window` and `document`; `list<T>` of items of type `T`; the structured values, each with named fields of declared types, such as `rectangle`, `size` and `selection`, the object types of the objects a query's object expressions produce, and any a module declares; and `event<T>`, an event source whose events carry event data of type `T`. A module can declare types of its own. `null` is a value of every type that is written with a `?`: `T?` is a `T` or null. Null alone is of the type `null`, which fits every nullable type, and `never` is the type no value has, which fits every type, so `list<never>`, the type of the empty list, fits every list type. Both are names of the type notation, and neither is a word of the expression language.

### What a member declares

An operation's or an event source's form is a call unless it is declared an infix call, which is a deliberate choice for one that reads as a sentence about its receiver, and the documentation states it. Its input is direct where it has exactly one parameter, which its module's registration checks, and options where it has several. Changing a member's input is a breaking change, as renaming it is, so an operation that may grow is declared with options from the start.

A member's signature declares its receiver type, its form and its input, then each parameter's order, name, type, whether it is required or what it defaults to, and how it handles null, and its result type. Optional and nullable are separate: an optional parameter may be omitted, and a nullable one may be given null. Unless a table marks a parameter optional, it is required: omitting a required argument is a validation error, and supplying null follows its declared null policy. It is only part of the member's contract: the member also declares its evaluation context, how it changes and how it reads, and the request kind it belongs to. A parameter is a value argument or an expression argument, and an expression argument declares the type of the item it is evaluated against and the type it must produce:

- `list<T>` keeps `T` through `where`, `at`, `first` and `last`.
- `where` evaluates its expression against a `T` and requires a `boolean?`.
- `max`, `min` and `sum` evaluate their expression against a `T` and require a `number?`.

These expressions declare a nullable result because they consume null per item instead of propagating it to the whole call: `where` leaves out an item whose expression is null, `max` and `min` skip it and answer null when every item was skipped, and `sum` skips it and answers zero when every item was skipped or the list is empty. So `@table.all("tbody tr").max(self.rect?.height)` and `@panel.all("[data-key]").where(self intersects { root: @panel })` are valid although `rect?.height` and `intersects` can answer null.

- An object expression following an `event<T>` is evaluated against that event, a `T`.

### No conversion

DOMQL converts nothing implicitly: a `number` is not a `boolean`, a `string` is not a `number`, and an `element` is not a `string`. `self attributeOf 200`, `self intersects { root: 5 }` and a `where` whose expression produces a `number` are each validation errors, as is an `element` where a `list` is required.

### Nullability

Nullability is part of a type, and null follows the signature.

- **Access requires a receiver that cannot be null, and optional access reads one that can.** `@panel.parent.rect` is a validation error, since `parent` is an `element?`, and `@panel.parent?.rect` answers null without invoking `rect` where the panel has no parent; its type is `rectangle?`, since an optional chain is nullable where an optional access of it can meet null. An infix call and a predicate expression propagate a null receiver: `@panel.parent attributeOf "id"` answers null where there is no parent.
- **A null argument follows the parameter.** A parameter is declared either to propagate null, which is the default and makes the call answer null without running, or to accept null with a meaning of its own, as `intersects` accepts a null `root` to mean the window. Preparation never rejects an evaluated argument for being nullable; it rejects a type that cannot match. A fixed argument that names a declaration, the name of `get`, the type of `eventsOf` and the feature of `supports`, is different, and so is a predicate name a predicate expression takes from a parameter: each must resolve to a non-null string during preparation, a literal or a bound parameter alike, because a declaration cannot be looked up from null, and `get` could not determine its result type. A nullable binding is accepted when its value supplies a valid name, and an actual null is a validation error for `@panel.get(@name)`, `@panel is @name` and `@button eventsOf @name` alike.
- **A written null is an expression that produces null.** `null` as a literal has no special treatment, and the signature and the evaluation rules decide what a call does with it.
- **Null is unavailable too.** An element is a valid receiver of `selection`; one that is no text input answers null, as an unavailable value does. A receiver of the wrong type, a number for `rect`, is a validation error, and a module that returns a value of a type other than the one it declared has broken its contract, which is an evaluation error and never a quiet null.

### Bindings

A binding takes its type from its value, and a caller declares none.

- An element is an `element`, and a number, a string and a Boolean are `number`, `string` and `boolean`.
- Null is a `null`.
- A list is a `list<T>`, `T` the type its items share, made nullable where one of them is null: `[element, null]` is a `list<element?>`. A list of nulls alone, `[null]` or `[null, null]`, is a `list<null>`, whose items can only be null, and the empty list is a `list<never>`, which holds no item.
- An object is of the object type of its fields' types, each typed as a binding is.
- A list whose items have different types has no type, because DOMQL has no union types and a list holds items of one type, so binding `[1, "two"]` is a structure error.

A tool that checks a query without running it takes the same values, or values of the same types, for the bindings, since vocabulary declarations alone cannot establish the type of `@panel`.

### Receivers of unknown type

A receiver of the type `null`, a null binding or the literal `null`, says nothing of what it would be, and neither does a `never`, the item of an empty list. The concession is to missing type information alone: a receiver whose type is known is checked as always, a nullable one included, so `@panel.parent?.sise` is refused for an element `panel` whatever its parent is. A receiver of the type `null` can be null, so it takes `?.`, and a `never`, which no value has, takes `.`. A name applied to a receiver of unknown type resolves without choosing one declaration:

- **Any property.** A name written as a property is accepted whatever it is, since the fields of a bound object are named by its data, as `@row?.id` for a null `row` and `@rows { id: self.id }` for empty `rows` are; it is checked once its receiver's type is known.
- **Known calls alone.** A name written as a call or an infix call is a member's, written in the form, and given the arguments, that at least one of its declarations takes; a name no member has, one written as a call where every declaration is a property, and one given an argument none takes are validation errors, since data names no operation.
- **The request keeps its kind.** The declarations that take the name as it is written agree on the request kind they make, and the request is of that kind, so it takes the operations of its kind and is refused the others. Declarations that disagree on their kind are refused as ambiguous.
- **What it answers.** A query answers null, a subscription listens to nothing, an action is not executed and answers null, and a behavior is applied with nothing in effect, as with any null receiver. Its type is the result type those declarations share, made nullable, and `null` where they share none or the name is no member's.
- **What is checked later.** Whether the name applies to its receiver is checked once the receiver's type is specific enough, when the binding is bound to an element, a list or another value that reveals its type.
- **An object expression** following such a receiver, or applied to the items of a `list<never>`, resolves its fields against a `never`, so a call in it is still checked; its type is the object type of its fields, made nullable after a null, and a list of it after an empty list, which answers the empty list.

An operation on a `list<never>` runs, as on any list, so it resolves to one declaration as any receiver does: the vocabulary declares a name once for any receiver, and where more than one of its declarations takes a `list<never>`, as only a type holding `never` allows, the request is refused as ambiguous.

## Requests

A request is one of four kinds, and the member its chain ends in decides which:

| Kind | Its chain ends in | Its caller |
| --- | --- | --- |
| Query | A value | Evaluates it once or watches it |
| Subscription | An event source | Subscribes to it |
| Action | An action | Executes it once, receiving its result |
| Behavior request | A behavior | Applies it, updates it with new bindings, and disposes it |

An action is an operation the browser carries out once, and a behavior is one that runs on in the browser until it is updated or disposed; both are members an extension declares, with signatures as every member has. An object expression can follow an action to shape its result. An action or a behavior ends its request's chain, so one inside a query, an argument or another request's object expression is a validation error.

Evaluating or watching a query never performs an action or configures a behavior: a query only reads, and an action or a behavior request acts only when its caller executes or applies it. A behavior belongs to the caller that applied it, and the event sources it offers are subscribed to, each as a subscription of its own.

```
// An action: step the viewport forward, answering whether it moved.
@viewport.scroll({ axis: "inline" }).step({ direction: "forward" })

// A behavior request: page the viewport with the wheel while Shift is held.
@viewport.scroll({ axis: "inline" }).wheelPaging({ modifier: "shift" })
```

## Events

A chain that ends in an event source is subscribed to, in two stages. The source hands each event to the evaluator, which evaluates the object expression following it at once, in the task the source delivers it in, with that event as its current value. The result is immutable data, and that result, never the browser's live event object or the object expression still to evaluate, is what reaches the caller, by the caller's own delivery. An event in DOMQL is what its source delivers, read through the event data it captured; the browser's own event object is never a value of the language. Here the event source is the built-in vocabulary's native drop event:

```
(@zone eventsOf "drop") { key: self.target?.closest("[data-drop-target]") attributeOf "data-drop-key" }
```

The object expression reads the event's own members, such as its target, and anything else a parameter reaches. Its members are read once per event, never watched, so an unobserved member is allowed in it. An event source documents its members, which of them it captured when the event happened, and when it delivers the event, such as before or after the browser carries out the action it reports; everything else it reads is read as it is evaluated. An extension's event source can report only what its caller started, so two callers subscribed on one element each hear their own.

## Evaluation

A query is evaluated synchronously, without yielding, and a member's implementation is synchronous.

Each member declares how it obtains its value.

| Reading | Meaning |
| --- | --- |
| Fresh | Read from the document as the query evaluates, such as an attribute or a box. |
| Maintained | Kept by an observation the member holds, and read as that observation's latest sample, such as the browser's intersection observation. |
| Captured | A sample taken at a moment the member documents, such as the history a member keeps or what an event carried. |

Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are.

A maintained member's observation starts the first time an evaluation reads it, and the member is **pending** until its first sample arrives. A pending member answers null, and the evaluator keeps pending apart from unavailable; the [DOMQL design](domql-design.md) sets out when a request waits for first samples.

Evaluating a query is read-only for every vocabulary. A measurement that needs the document changed first, such as measuring columns at their intrinsic widths under a temporary class, is an action of its own.

A member whose result depends on what happened before, as well as on the document as it is, is captured: it keeps that history while a watch or an event listener holds it, and documents what an evaluation once reports without it.

### Elements that leave the document

An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`. An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `is "attached"` says whether it is attached, whatever its layout.

## How a member changes

Every member declares how its result changes, for a given receiver and arguments.

| Category | Meaning | In a watch |
| --- | --- | --- |
| Constant | The result never changes, as a literal's, or whether the browser supports a feature. | Allowed; it never invalidates. |
| Observable | The member names observations that cover every change to its result, such as a resize observation for a size. | Allowed. |
| Partly observable | The member names the observations it can make and documents the changes they miss, such as a computed style changed by a rule outside the element. | Allowed when the caller accepts partial observation for that watch; a change the sources miss reaches the watch through an explicit refresh or a local invalidation. |
| Unobserved | The member can be read but names no observations. | A validation error. |

A literal is constant, so a watched object expression can carry one: `@viewport { kind: "viewport", width: self.size?.width }`.

## Null

Null answers both "there is no such value", as when `closest` finds no element, and "the value is unavailable", as when an element has no layout to measure. One null for both keeps results simple, at the cost of telling the two apart; a member whose consumers need the difference offers it separately, as `is "attached"` says whether an element is still attached to the document.

An optional access of null is null and ends its chain, an infix call and a predicate expression of null are null, a coalescing operator answers its fallback for it, so a chain that meets null answers null from there on, and a mistake is always an error:

| Situation | Result |
| --- | --- |
| `closest` or `first` matches no element | null |
| `all` matches no element | An empty list |
| A supported measurement is unavailable | null, as the member documents |
| Text that does not follow the syntax | A syntax error, with its position |
| A definition that does not follow its structure | A structure error, with its node's location |
| A misspelled member or extension, or a parameter the caller did not bind | A validation error, with its location |
| An access or a call written with `.` whose receiver can be null | A validation error giving the form with `?.` |
| A name no local in scope has, or a local in an options object | A validation error, giving the form with `self` where the current value has a member of that name |
| A member written in a form its declaration does not take, or an argument that does not supply its input | A validation error giving the form or the input it takes |
| A predicate its verb does not register, or one that does not apply to its subject | A validation error naming it |
| An operand of `and` or `or` that is no Boolean | A validation error naming its type |
| A condition that is no Boolean, or branches of different types | A validation error naming the types |
| A receiver, an argument, an expression or a binding of the wrong type, an argument of the wrong kind, or a missing required one | A validation error naming where, the expected type and the type found |
| A module returning a value of a type other than the one it declared | An evaluation error |
| A result that would contain an element or an event source | A validation error |
| A request used as another kind: reading or watching an event source, subscribing to a value, running a query, or reading an action or a behavior | A validation error |
| An action or a behavior inside a query, an argument or another request's object expression | A validation error |
| Watching a partly observable member without accepting partial observation | A validation error naming each such member and the changes it misses |
| A member failing unexpectedly while it evaluates | An evaluation error |

A query is validated before any evaluation, as the section on validation sets out. An evaluation error fails the whole result, and the caller receives the error in its place.

## Built-in vocabulary

The built-in vocabulary exposes properties and operations over familiar browser concepts. Properties and operations are named in camelCase. Names are case-sensitive. Measurements use CSS pixels unless stated otherwise. Built-in members expose state or event sources; actions and behaviors come from extensions.

A property of a structured value, such as a rectangle's `width`, reads data the value holds and is constant for that value. A property is read by member access, and an operation is written as a call or as an infix call, as its declaration says; the tables write each as it is written, with a receiver left out.

### Properties

A property exposes a value, read by member access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as the section on evaluation defines.

| Available on | Property | Type | Answers | Changes | Reads |
| --- | --- | --- | --- | --- | --- |
| Window | `size` | `size` | The layout viewport's `width` and `height` | Observable | Fresh |
| Window | `devicePixelRatio` | `number` | Device pixels per CSS pixel | Observable | Fresh |
| Element | `rect` | `rectangle?` | Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport | Partly observable: size and the scrolling of its scroll containers are observed, transforms and animations are not | Fresh |
| Element | `size` | `size?` | Its border box's `width` and `height` | Observable | Fresh |
| Element | `clientSize` | `size?` | Its padding box's `width` and `height`, without scrollbars | Observable | Fresh |
| Element | `grid.columns` | `list<number>?` | The sizes of its grid's column tracks, an empty list for an element that is no grid | Partly observable, as `computedStyleOf` | Fresh |
| Element | `selection` | `selection?` | Its selection's `start` and `end`, null for an element that is no text input or text area | Partly observable: input and selection events are observed, assignments by script are not | Fresh |
| Element | `children` | `list<element>` | Its child elements, in document order | Observable | Fresh |
| Element | `parent` | `element?` | Its parent element | Observable | Fresh |
| List | `count`, `first`, `last` | `number`, `T?`, `T?` for a `list<T>` | The number of items, the first item and the last item, null where a list has none | As their items | As their items |

### Operations

An operation performs a lookup, a calculation or a selection with the argument it is given. A name followed by its parameter, as `attributeOf name`, is an infix call, `self attributeOf "data-key"`; a name with parentheses, as `closest(selector)`, is a call, `self.closest(".row")`; and braces show an options object, whose fields supply the parameters, as `intersects { root, margin }` does, `self intersects { root: @panel }`. Each operation states what it answers, how its result changes, how it reads, and which of its parameters are fixed.

| Available on | Operation | Type | Answers | Changes | Reads | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| Window | `matchesMedia query` | `query`: `string` → `boolean` | Whether the media query matches | Observable | Fresh |  |
| Window | `supports feature` | `feature`: `string` → `boolean` | Whether the browser offers a feature from the vocabulary's registered list, such as `"share"`; a name not on the list is a validation error | Constant | Fresh | `feature` |
| Element | `attributeOf name` | `name`: `string` → `string?` | The attribute's value | Observable | Fresh |  |
| Element | `computedStyleOf property` | `property`: `string` → `string?` | The property's computed value, custom properties included | Partly observable: its own size and attributes are observed, rules matching from elsewhere are not | Fresh |  |
| Element | `intersects { root, margin }` | optional `root`: `element?`, the window when omitted or null; optional `margin`: `number`, 0 when omitted → `boolean?` | Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it | Observable | Maintained |  |
| Element | `overlaps { other, margin }` | required `other`: `element`; optional `margin`: `number`, 0 when omitted → `boolean?` | Whether its border box overlaps the other's, grown by the margin, compared as rectangles | Partly observable, as `rect` | Fresh |  |
| Element | `matches selector` | `selector`: `string` → `boolean?` | Whether it matches the selector | Partly observable: attributes, structure, focus and popovers' open state are observed; pointer state such as `:hover` and control state such as `:checked` are not | Fresh |  |
| Element | `rectRelativeTo(relativeTo)` | `relativeTo`: `element` → `rectangle?` | Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box | Partly observable, as `rect`, and the size of `relativeTo` | Fresh |  |
| Element | `closest(selector)`, `first(selector)`, `all(selector)` | `selector`: `string` → `element?`, `element?`, `list<element>` | The nearest matching ancestor, itself included; the first matching descendant; the matching descendants, in document order | Partly observable, as `matches` | Fresh |  |
| Any value with members | `get(name)` | `name`: `string` → the type of the property or operation `name` names | The property or operation, or chain of them, `name` names, read as direct access reads it | As its member | As its member | `name` |
| List | `at(index)` | `index`: `number` → `T?` | The item at the index, null where there is none | As its items | As its items |  |
| List | `max(expression)`, `min(expression)`, `sum(expression)` | `expression`: `T` → `number?`; answers `number?`, `number?`, `number` | An aggregate over a number expression, as the section on lists defines | As their items and expressions | As their items |  |
| List | `where(expression)` | `expression`: `T` → `boolean?`; answers `list<T>` | The items for which a Boolean expression holds | As its items and expression | As its items |  |

### Event sources

An event source delivers things that happened. It is subscribed to, never read or watched, and the object expression following it is evaluated against each event.

| Available on | Source | Type | Delivers | Reads | Fixed |
| --- | --- | --- | --- | --- | --- |
| Element, document, window | `eventsOf type` | `type`: `string` → `event<T>` for the event type `type` names | The native events of that type as they reach it, each with the members its declared event type offers, such as a pointer event's `button`, `clientX` and `clientY`; a type the vocabulary declares no event type for is a validation error | Captured at dispatch | `type` |

The built-in event types, and the members each event offers:

| Event types | Event data type | Members |
| --- | --- | --- |
| `click`, `pointerdown`, `pointerup` | `pointerEvent` | `target`: `element`, `button`: `number`, `buttons`: `number`, `clientX`: `number`, `clientY`: `number`, `pointerType`: `string?` |
| `keydown`, `keyup` | `keyboardEvent` | `target`: `element`, `key`: `string`, `code`: `string` |
| `drop` | `dragEvent` | `target`: `element`, `clientX`: `number`, `clientY`: `number` |
| `focus`, `blur`, `input`, `scroll`, `resize` | `domEvent` | `target`: `element?` |

An event is captured as the members its type declares when it is dispatched. A member the event carries no value of its type for is null where its type is nullable, as `domEvent`'s `target` is for a scroll or a resize that targets the document or the window, and `pointerEvent`'s `pointerType` for a browser that dispatches a click as a mouse event; where its type is not nullable, the capture fails, and the subscription reports it as it reports a failed object expression. `eventsOf` listens passively, so it never delays or prevents what the page does with an event.

`self is "focused"` asks whether the element itself is focused, `self matches ":focus-within"` whether focus is anywhere within it, and an extension can offer richer focus semantics under names of its own; they are separate questions with separate names.

`is "readOnly"` and `is "textEditable"` are separate questions too, and neither is the other's opposite:

| Element | `is "readOnly"` | `is "textEditable"` |
| --- | --- | --- |
| An enabled, writable text input | false | true |
| A read-only text input | true | false |
| A disabled text input without `readonly` | false | false |
| An ordinary static element | false | false |
| An editable content region | false | true |

### Predicates

A predicate is a name the vocabulary registers for `is` or `has` with its contract: what it answers, the types it applies to, how it changes and how it reads; the section on predicate expressions sets out how a predicate expression reads one. A predicate's name is read exactly, as the section on case-sensitive names sets out. An extension registers predicates of its own under its namespace, such as `is "scroll.atEnd"`. Each concept has one canonical spelling, so no predicate is an alias of another. `is` and `has` have separate predicate names: a predicate is registered for one of them, and naming it through the other is a validation error, so `is "children"` and `has "disabled"` fail.

| Predicate | Of | Answers | Changes | Reads |
| --- | --- | --- | --- | --- |
| `is "attached"` | An element | Whether the element is attached to the document, including through a shadow root | Observable, through the structure of the document and of every shadow root between the element and the document | Fresh |
| `is "disabled"` | An element | Whether the element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `self attributeOf "disabled"`, a separate question | Observable: its own and its ancestors' `disabled` attributes and the structure between them | Fresh |
| `is "readOnly"` | An element | Whether native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes | Observable: its `readonly` and `type` attributes | Fresh |
| `is "textEditable"` | An element | Whether the element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, by its own or an ancestor's `contenteditable` of `true` or `plaintext-only`, or by the document's design mode. An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root | Partly observable: everything `is "disabled"` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not | Fresh |
| `is "focused"` | An element | Whether it is the focused element | Observable | Fresh |
| `is "visible"` | The document | Whether the document is visible | Observable | Fresh |
| `has "children"` | An element | Whether it has at least one child element | Observable, through its child list | Fresh |
| `has "selection"` | An element | Whether a selection of at least one character lies within it: a non-collapsed selection in a text input or text area, or a non-collapsed document selection within its content; a collapsed caret is no selection | Partly observable: input and selection events are observed, assignments by script are not | Fresh |
| `has "focus"` | The document | Whether focus is anywhere within the document | Observable | Fresh |

### Reading by name

`get` reads a member its receiver offers, named by a string, through the same declaration as direct access: `self.get("rect")` and `self.rect` resolve the same member, with its one implementation, type, null behavior and observation sources. A dotted name is a chain of members, each segment validated against the value before it, so `self.get("grid.columns")` is `self.grid?.columns`; the string names members, never query text.

```
@target {
    rect: self.get("rect"),
    clientSize: self.get("clientSize"),
    disabled: self is "disabled",
    hasChildren: self has "children"
}
```

This answers the fields `rect`, `clientSize`, `disabled` and `hasChildren`. The current value decides which names resolve, built-in and extension members alike:

```
{
    window: @window { devicePixelRatio: self.get("devicePixelRatio") },
    input: @input { selection: self.get("selection") }
}
```

- **Names.** A field holding a `get` is named as every field is, `bounds: self.get("rect")`, whatever name the `get` reads.
- **Continuing.** A member after a `get` continues from the value it read, so `self.get("rect")?.width` is `self.rect?.width`; an object expression after it reads that value's fields, as `self.get("rect") { width: self.width, height: self.height }` does.
- **Readable members only.** A `get` reads a member that takes no arguments, or none it requires; an action, a behavior or an event source it names is a validation error, so a `get` never acts.
- **Fixed names.** The name is fixed, a literal or a bound parameter settled when the query is prepared.

| Form | Asks | Example |
| --- | --- | --- |
| `get`, a call | For a value | `self.get("rect")` |
| `is`, a predicate expression | About a state or a classification | `self is "disabled"` |
| `has`, a predicate expression | About presence | `self has "children"` |

## Extensions

An extension adds members under one name of its own, a member of a built-in type whose value carries the extension's members: `@viewport.scroll({ axis: "inline" })` is a scroll extension's view of an element along an axis, and `canScrollForward` is one of its members. The name is the extension's namespace, so extensions never collide with each other or with the built-in vocabulary, whose member names are reserved.

The built-in vocabulary declares the native event types its callers need, and an extension can declare more. A subscription observes an event as it reaches its target and leaves its course to the page.

An extension can define types of its own, event sources, actions and behaviors, and follows the built-in vocabulary's contract throughout: every member declares its signature, its argument kinds, its result type and how it changes, and evaluating a query stays read-only and synchronous.

## Definition

A query's **definition** is a JSON document recording its meaning: every query, parsed from text or created directly, is one definition, and preparation, validation and evaluation work on the definition alone. It records what the text means, never its punctuation, and comments, commas and layout leave no trace in it.

A document holds the definition's `version` and the `query` node. Each node is an object whose `kind` says what it is:

| Kind | Properties | Records |
| --- | --- | --- |
| `literal` | `value`, a JSON string, number, Boolean or null | A literal |
| `parameter` | `name` | A parameter, the roots `document` and `window` included |
| `self` | None | The current value |
| `local` | `name` | A use of a local |
| `member` | `name`; `target`, the receiver; and `optional`, true, where it is written with `?.` | A member access |
| `call` | `name`; `argument`, its one argument, where it is given one; `target`, the receiver; and `optional`, true, where it is written with `?.` | A call |
| `infixCall` | `name`; `argument`, its one argument, where it is given one; and `target`, the receiver | An infix call |
| `object` | `fields`; `locals`, where it has any; and `target`, the node the object expression follows | An object expression; without a target, one keeping the current value around it, which at the top level is absent |
| `predicate` | `verb`, `is` or `has`; `name`, a `literal` holding a string or a `parameter`, the predicate it reads, or under `is` a `literal` holding null, for `is null`; and `target`, the node whose value it tests | A predicate expression |
| `conditional` | `condition`, `consequent` and `alternative`, three expressions | A conditional; an `elseif` is a conditional nested in the alternative before it |
| `coalescing` | `value` and `fallback`, two expressions | A coalescing operator |
| `optionalChain` | `target`, the chain it holds | An optional chain: the chain of member accesses, calls and object expressions whose optional accesses end at it, holding at least one |
| `and`, `or` | `operands`, two or more expressions | A logical expression |

An expression group adds no node, the expression it holds standing in its place, and neither does an optional-access group, whose accesses are recorded as optional and its optional chain where it ends, so `@panel is "attached" and (@panel is "disabled")` is an `and` of two predicate expressions:

```json
{
  "kind": "and",
  "operands": [
    { "kind": "predicate", "verb": "is", "target": { "kind": "parameter", "name": "panel" }, "name": { "kind": "literal", "value": "attached" } },
    { "kind": "predicate", "verb": "is", "target": { "kind": "parameter", "name": "panel" }, "name": { "kind": "literal", "value": "disabled" } }
  ]
}
```

Every member access, call, infix call and predicate expression holds its receiver as its `target`, required, and an omitted target never stands for `self`, so `self.size` and `@panel.size` are distinct definitions. A call's or an infix call's `argument` is one node, recorded as written; where its member takes options, it is an object node whose fields resolution maps onto the member's parameters. A field is an object holding its `name` and its `value` node, both required; an object expression's fields keep their order, and an object expression holds at least one. A local is an object of the same two properties, and an object expression's locals keep their order, its definition leaving `locals` out where it has none.

`@panel { size: self.size, hasFocus: self matches ":focus-within" }` has this definition:

```json
{
  "version": 6,
  "query": {
    "kind": "object",
    "target": { "kind": "parameter", "name": "panel" },
    "fields": [
      { "name": "size", "value": { "kind": "member", "target": { "kind": "self" }, "name": "size" } },
      {
        "name": "hasFocus",
        "value": {
          "kind": "infixCall",
          "target": { "kind": "self" },
          "name": "matches",
          "argument": { "kind": "literal", "value": ":focus-within" }
        }
      }
    ]
  }
}
```

A chain is recorded as a succession of targets: in `@panel.all("li").count`, `count` is a member access whose target is the call `all`, whose target is the parameter `panel`. A chain that holds an optional access is the target of an `optionalChain` node, which records where its short-circuit ends, so `@panel.parent?.children.count`, one optional chain, and `(@panel.parent?.children).count`, a member access of one, are distinct definitions.

A definition names its parameters and never holds their values. An element is bound to its name when the query is created, through whatever mechanism the caller's environment offers, so the same definition serves every binding.

### Validation

A query is validated in two stages, both before any evaluation.

- **Structure,** when the query is created: the definition follows the node structures and structural validation rules this specification defines, which need no vocabulary: every field with its name, unique within its object expression; every local with its name, which no other local in scope where it is written has; no object expression without a field; every member access, call, infix call and predicate expression with its receiver; every optional access within an optional chain, through the targets of member accesses, calls and object expressions alone, and every optional chain holding one; no `self` at the top level, nor in a field of an object expression there, since there is no current value for it to stand for; every predicate expression's verb `is` or `has`, and its name a string literal or a parameter, or under `is` the null literal of `is null`; every `and` and `or` of two or more expressions; every coalescing with its value and its fallback; and no binding supplied under the name `document` or `window`. Text that does not follow the syntax fails here as a syntax error.
- **Vocabulary,** when the query is prepared: every member and extension exists and is written in the form its declaration takes, every argument supplies its member's input, directly or as an options object whose fields name its parameters, every receiver, argument, expression and binding has the type its signature declares and every argument its kind, every access and call written with `.` has a receiver that cannot be null, every fixed argument is a literal or a bound parameter, every chain of members a `get` names resolves to a readable member, every predicate a predicate expression names is registered for its verb and applies to its subject, every local a name uses is in scope where it is used, is a value and stands in no options object, every operand of `and` and `or` and every condition is a Boolean, the value and the fallback of every coalescing operator are values of one type, the branches of every conditional are of one type, every expression is valid in the context its member declares, the request is used as its kind, the result holds only data, and a watch's members can be watched.

A failure in either stage names where it is: its position in the text, or its node's location in the definition, as a JSON Pointer.

## What a query runs against

A query is evaluated against a document, with each parameter it names bound to something in that document or to plain data. `@panel` is not found by the query: it stands for the element the caller bound under the name `panel`, which is how a query reaches a particular element without a selector for it. A query that names `@panel` and `@sentinel` is given those two elements, and fails to prepare when either is not bound. The roots `@document` and `@window` need no binding, since they are always the document being queried and its window.

Conceptually, a caller supplies the query's text and the bindings, and gets back a result shaped like the query:

```text
result = evaluate(query, bindings: { panel: <the list panel>, sentinel: <the end marker> })
```

The bindings name only what the caller chooses. The complete query below also uses `@document` and `@window`, which are absent from them because they are the document the query runs against and its window, so no caller chooses them and none can bind them.

A caller can take that result once, keep it current as the document changes, or take one at each event the query subscribes to; how it asks for each is the [design](domql-design.md)'s to say. A value query is evaluated or watched alike; subscribing needs an event source, whose projection uses the same expression language.

## A complete query

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

```
/* A list panel, its items and the window around it. */
{
    // The panel's items, read once for the fields that use them.
    let items: @panel.all("[data-key]"),

    // The panel itself.
    panel: @panel {
        size: self.size,
        hasFocus: self matches ":focus-within",
        tier: self computedStyleOf "--layout-tier",
        columns: self.grid?.columns.count
    },

    // Every item, and the items in the panel's view.
    items: items {
        key: self attributeOf "data-key",
        height: self.rect?.height,
        selected: self matches "[aria-selected=true]"
    },
    inView: items.where(self intersects { root: @panel }).count,
    tallest: items.max(self.rect?.height),

    // Whether the end of the list is near, and which item is selected.
    nearEnd: @sentinel intersects { root: @panel, margin: 200 },
    current: @panel.first("[aria-selected=true]") attributeOf "data-key",

    // The window around it.
    window: @window { size: self.size, dark: self matchesMedia "(prefers-color-scheme: dark)" },
    visible: @document is "visible",
    kind: "list"
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

With no item selected, `current` is null. With an empty panel, `items` is an empty list, `inView` is 0, and `tallest` and `current` are null. Watching the query requires accepting partial observation, since `matches`, `computedStyleOf`, `grid.columns`, `all` and `first` are partly observable; the watch then follows the items the panel holds, each item's height, attributes and intersection, the panel's size and focus, the sentinel's intersection, the media query and the document's visibility.

## Examples

| Asks | Query |
| --- | --- |
| Whether an element is near the end of a scrolling panel | `@sentinel intersects { root: @panel, margin: 200 }` |
| How many items of a list are in its view | `@list.all("li").where(self intersects { root: @list }).count` |
| A layout tier a container query sets | `@header computedStyleOf "--layout-tier"` |
| How many columns a grid lays out | `@cards.grid?.columns.count` |
| A table's tallest row | `@table.all("tbody tr").max(self.rect?.height)` |
| Each column's key and width | `@table.all("[data-column]") { key: self attributeOf "data-column", width: self.rect?.width }` |
| A panel's size, and whether focus is within it | `@panel { size: self.size, hasFocus: self matches ":focus-within" }` |
| A text field's selection | `@field.selection { start: self.start, end: self.end }` |
| Whether sharing is available | `@window supports "share"` |
| The ids of the text-editable elements in a panel | `@panel.all("*").where(self is "textEditable") { id: self attributeOf "id" }` |
| An element's states and what it holds | `@target { attached: self is "attached", disabled: self is "disabled", hasChildren: self has "children", hasSelection: self has "selection" }` |
| Whether a control cannot take text | `@input is "disabled" or @input is "readOnly"` |
| A control's state, one word | `@input { state: if self is "disabled" then "locked" elseif self is "readOnly" then "read" else "open" }` |
| Whether an element has a parent | `@panel.parent is null` |
| A list's size and its tallest item, the list read once | `@panel { let items: self.all("[data-key]"), count: items.count, tallest: items.max(self.rect?.height) }` |
