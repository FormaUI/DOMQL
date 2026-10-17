# DOMQL Specification v1.0.0-alpha

DOMQL is a small language for querying the DOM: a query names what its caller wants to know about a document and its elements, and evaluating it gives one result shaped the way it asked. The same query is evaluated once, watched for changes, or evaluated at each event in the document, and the actions and behaviors a caller asks the browser for are requests of their own kinds. The language knows how to name values and shape results; what can be asked about, an element's size, a computed style, whether it matches a selector, comes from a vocabulary beside it, so adding to what can be asked never changes the language.

This specification defines the language: its syntax, what each request means, the contracts of its vocabulary and the definition every request has. The [DOMQL design](domql-design.md) sets out how requests are built, prepared and carried out.

This specification describes the whole language. An implementation may cover part of it; the [README](../README.md#status) states what this one implements.

## Terms

A **query** is a value expression whose evaluation produces a **result**. A **chain input** is `self`, a parameter, a local, a literal, an object expression or a group, and a **chain** follows **members** from one, each of the value before it, its **receiver**: a **member access** reads a property, `self.rect`, or one its name names in brackets, an **access by name**, `self[name]`, a **call** invokes an operation with parentheses, `self.closest(".row")`, and a **named indexer** invokes one with its key in brackets after a colon, `self:attribute["data-key"]`. An access or a call written with `.` requires a receiver that cannot be null, and an **optional** one, written with `?.`, or with `?[` for an access by name, reads its receiver where it is not null and ends its chain with null where it is; the chain it ends is an **optional chain**. A member belongs to a **type**, such as an element, a list or a rectangle, and a call or an indexer takes an **argument**. A **node** is a value of the DOM tree, an element, a document, a document fragment or a shadow root, each a **kind** of node, a **cast**, `as`, answers a node as one of its kinds, a **conversion**, `to`, answers a value converted to another type of data, each failing for a value it rejects, and an **attempt**, `try`, answers null where the cast or the conversion it attempts rejects its value. `self` is the **current value**, the value an object expression or an argument is evaluated against. An **object expression** names the **fields** of the **object** it produces, each with a value, and the object's **object type** describes those fields and their types. A **local** names a value in an object expression, written once with `let` and used by its name in the entries after it. A **test** is a member that answers a Boolean, such as `self.is("disabled")`, and an **equality**, `==`, compares two values, with `!=` its negation. A value is **truthy** unless it is null or false, which are **falsey**. A **logical expression**, `and` or `or`, answers the operand that decides it, a **negation**, `not`, answers whether a value is falsey, a **conditional** chooses between two values by whether a condition is truthy, or by whether the value of a **conditional binding**, `if let`, is, a **coalescing operator**, `??`, answers a value where it is not null and its fallback where it is, an **expression group** is an expression in parentheses, and an **optional-access group**, `(? … )`, holds a **member-access chain**, a receiver and the accesses after it, every one of them optional. A **parameter** is a name a query reads a value through, such as `panel`, and a **parameter binding**, a **binding** for short, is the value the caller supplies for it, such as an element. A **vocabulary** is a set of types and their members; the **built-in vocabulary** comes with DOMQL, and an **extension** is a vocabulary registered under a name of its own. An **event source** is a member whose value is a stream of **events**, things that happened, rather than state; an event belongs to an **event type**, such as `click`, and what its source captured of it is its **event data**. An **action** is an operation the browser carries out once, and a **behavior** one that runs on until it is updated or disposed; a **request** is a query, a subscription, an action or a behavior request. A query's **definition** is the JSON document recording its meaning, and every request has one.

## Syntax

In this notation, `[...]` means optional, `{...}` means repetition, `|` separates alternatives, `-` means exclusion, and `? ... ?` describes a special sequence. Each name describes a form written or the category a position holds.

```ebnf
query                     = expression end-of-input

expression                = conditional-expression | condition
expression-group          = "(" expression ")"

conditional-expression    = "if" clause-test "then" expression
                            { "elseif" clause-test "then" expression }
                            "else" expression
clause-test               = conditional-binding | condition
conditional-binding       = "let" identifier "=" condition

condition                 = coalescing-operator | disjunction | or-operand

coalescing-operator       = additive "??"
                            ( additive | coalescing-operator )

disjunction               = or-operand "or" or-operand
                            { "or" or-operand }
or-operand                = conjunction | and-operand

conjunction               = and-operand "and" and-operand
                            { "and" and-operand }
and-operand               = negation | equality | additive

negation                  = "not"
                            ( negation | equality | additive )

equality                  = additive
                            ( "==" | "!=" )
                            additive

additive                  = multiplicative
                            { ( "+" | "-" ) multiplicative }
multiplicative            = arithmetic-negation
                            { ( "*" | "/" | "%" ) arithmetic-negation }
arithmetic-negation       = "-" arithmetic-negation | equality-operand

equality-operand          = chain | cast | conversion | attempt
attempt                   = "try" ( conversion | cast )

conversion                = conversion-target "to" string
conversion-target         = chain | cast | conversion

cast                      = cast-target "as" string
cast-target               = receiver { member-access-expression } | cast-target-group
cast-target-group         = "(" coalescing-operator ")" | optional-access-group

chain                     = chain-input { member-access-expression | object }
chain-input               = input | group

member-access-chain       = receiver member-access-expression { member-access-expression }
optional-access-group     = "(?" member-access-chain ")"
receiver                  = input | "(" cast ")"

input                     = value | object | identifier
value                     = "self" | literal

group                     = expression-group | optional-access-group

member-access-expression  = ( "." | "?." ) ( identifier | call-expression )
                          | ( "[" | "?[" ) expression "]"
                          | ( ":" | "?:" ) [ identifier ] "[" expression "]"
call-expression           = identifier "(" [ expression ] ")"

object                    = "{" object-content "}"
object-content            = { local "," } field { "," field } [ "," ]
local                     = "let" identifier "=" expression
field                     = identifier "=" expression

literal                   = string | number | "true" | "false" | "null"

identifier                = name - reserved-word
name                      = letter { letter | digit }
reserved-word             = "true" | "false" | "null" | keyword
keyword                   = "self" | "not" | "try" | "as" | "and" | "or"
                          | "if" | "then" | "elseif" | "else" | "let"

number                    = integer [ fraction ] [ exponent ]
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

trivia                    = whitespace | line-comment | block-comment
whitespace                = ? a character matched by ECMAScript \s ?

line-comment              = "//" { line-character } [ line-feed ]
line-character            = ? any character except LF ?
line-feed                 = ? LF ?

block-comment             = "/*" block-content "*/"
block-content             = ? characters up to, but excluding, the first closing */ ?

end-of-input              = ? end of input ?
```

An identifier is a name that is no reserved word, as `rectRelativeTo` is; it holds no hyphen, so every identifier is also a JavaScript identifier. No reserved word, a literal's or a keyword, can be used as a name, even where its position would tell it apart, as in `self.null` or `{ null = 1 }`, so one naming rule holds everywhere; the restriction applies equally to text queries and to definitions created directly, wherever a name is declared or supplied: a member, a parameter, a field's or a local's name, and an extension's declaration. A string holding a reserved word stays an ordinary string, so `self:["null"]` reads the attribute named `null`. The rule is for the names a query declares; supplied data keeps its own keys: a bound object, and one a member answers, keeps every field it has, whatever its key, `__proto__` included, as an ordinary field of its own, in a result, its snapshots and live state alike. `document` and `window` name the roots, and no binding or local can take either. They are ordinary names everywhere else, so `window = window { size = self.size }` names a field `window`. A field's, a local's and a binding's value follows `=`, so a colon after a name only ever begins an indexer, and `=` anywhere else is a syntax error that says `==` compares values; a field written with a colon, as `count: self.size`, is a syntax error that gives `count = …`. The tokens are names, numbers, strings and the punctuation the rules quote, `?.`, `?[`, `?:`, `??` and `(?` each being one token, so `? .`, `? [`, `? :`, `? ?` and `( ?` are syntax errors, and an access by name takes no dot before its brackets, so `self.[name]` and `self?.[name]` are syntax errors whose messages give the form without the dot. Trivia, which is whitespace, line breaks included, and comments, may stand between any two tokens and never inside one, and no rule requires it, so `a to"number"` is `a to "number"`. A name is written alone, with nothing before it, so `@panel` is a syntax error that gives `panel`. A number is written without a sign, and `-` is always an operator, the negation of what follows it or a subtraction, so `-5`, `- 5` and `a-b` read as `-5`, `-5` and `a - b`, and `client-size` subtracts `size` from `client`: a name of HTML or CSS that holds a hyphen is a string, as `element:["data-key"]` writes it. `/` divides where no comment begins, so `a / b` divides and `a //b` begins a comment. Tokens are read by the longest match, and a reserved word matches a whole name alone, so `isVisible` and `nullable` are identifiers; every match is exact, so `IS` is no keyword. A string takes `\"` and `\\` as its only escapes, and may hold a line break. A block comment does not nest, so the first `*/` closes it, and one never closed is a syntax error. Inside a string, `//` and `/*` are text, so `"https://example.com"` and `"/* */"` read as written.

A conjunction exists only where `and` is written, a disjunction only where `or` is, a negation only where `not` is and an equality only where `==` or `!=` is, so an expression with none of them is an equality operand. An equality takes an equality operand on either side, so it does not chain, and `a == b == c` is a syntax error. An attempt exists only where `try` is written, before the one conversion or cast it attempts, a conversion whose value is no conversion or cast written without a group, so `try (a to "string") to "number"` attempts the second conversion, and `try a to "string" to "number"` and `try node as "element" to "string"` are syntax errors. A conditional binding exists only where `let` follows `if` or `elseif`, and binds the whole condition after its colon. A cast exists only where `as` is written, and holds another cast only inside parentheses, so casts do not chain, and a chain continues from one only through a group. A conversion exists only where `to` follows a value: it converts what is before it, so `self:["data-count"] to "number"` converts the attribute; conversions chain from left to right, and a chain continues from one only through a group. `to` is a keyword after a value alone, and stays a name everywhere else, as a field in `{ from = 1, to = 2 }`, a parameter in `to`, a local in `{ let to = "3", value = to to "number" }`, a property in `range.to`, a call in `range.to()` and an indexer in `range:to[1]` are. Any other name after a value is a member written without the dot or the colon that joins it to its receiver, so `panel matches ".open"` is a syntax error that gives the form `panel.matches(…)`. A chain is its chain input and the member-access expressions and object expressions that continue it, so `42` and `panel` are chains of their input alone. The grammar's `value` rule names `self`, a parameter and a literal, the forms that stand for a value by themselves, while a value in this specification's prose is any value a query has, whose type resolution decides. The grammar's `input` rule names what a chain starts from, and its `receiver` rule what a member-access chain and a cast target start from, an input or a cast in parentheses, while a member's input declaration, which the section on arguments sets out, says how its argument is supplied. A condition and an operand of `not`, `and` or `or` are any value, tested for its [truthiness](#truthiness), so a Boolean parameter, `if wide then …`, a property answering one, `self.has("focus") and enabled`, and one that can be null, `self.intersects() and enabled`, are written as they read.

```domql
viewport {
    // The viewport's width, and whether focus is within it.
    width = self.rect?.width,
    hasFocus = self.has("focus-within"),
    columns = self.all("[data-column]") { key = self:["data-column"], width = self.rect?.width }
}
```

### Member access, calls and indexers

Member access, calls and indexers are distinct constructs, not alternate spellings of one, and the vocabulary declares which form each member takes.

| Construct | Syntax | Example |
| --- | --- | --- |
| Member access | `receiver.member` | `self.children.count` |
| Optional access | `receiver?.member` | `self.rect?.width` |
| Access by name | `receiver[name]` | `self[name]` |
| Call | `receiver.method(argument)` | `self.closest(".row")` |
| Named indexer | `receiver:indexer[key]` | `self:attribute["data-key"]` |

```domql
self.children.count                            // Member access.
self.closest(".row")?.rect?.width              // A call, then optional access.
self:attribute["data-key"]                     // A named indexer.
window:media["(min-width: 40em)"]             // Another named indexer.
self.closest("[data-group]")?.matches(".open") ?? false
```

- **Member access** reads a property and takes no argument; whitespace never stands for its dot, so `self rect width` is an error that gives the form `self.rect`.
- **Required and optional access.** `.` requires a receiver that cannot be null, and a nullable one is a validation error that gives the form with `?.`. `?.` reads a member, or calls an operation, of a receiver that is not null, and answers null for one that is, skipping the rest of its chain: in `panel.parent?.children.count`, a panel without a parent gives null, and otherwise `.count` counts its parent's children. A group ends a chain, so in `(panel.parent?.children).count` the `.count` follows a `list<element>?` and is a validation error. `?.` on a receiver that cannot be null is valid, since a binding typed from its value may be one that can.
- **Optional-access groups.** `(?panel.first(".row").rect.width)` is `panel?.first(".row")?.rect?.width`: an optional-access group holds a member-access chain, a receiver, `self`, a parameter, a literal, a local, an object expression or a cast in parentheses, followed by at least one access, call or named indexer, and makes every access of it optional, those of a grouped cast's own target included, so `(?(panel.parent as "element").rect.width)` is `(panel?.parent as "element")?.rect?.width`; a target that is a coalescing operator in parentheses or an optional-access group keeps its own rules, as a call's argument does, so `(?((a.x ?? b) as "element").rect)` is `((a.x ?? b) as "element")?.rect`. Its closing parenthesis ends its optional chain, so `(?x.y.z)?.a.b` is `(x?.y?.z)?.a.b`, whose `.b` requires an `a` that is not null. Anything else inside it is a syntax error, an object expression among them, and a call's argument keeps its own rules. It is notation for its accesses: the definition records them as optional, and the canonical text writes them with `?.`, `?[` and `?:`.
- **A call** takes no argument or one, any expression, inside its parentheses, and the chain continues after it.
- **A named indexer** writes a colon after its receiver, then the indexer's name and its one key in brackets, any expression, as `self:attribute["data-key"]` and `self:style[property]` do, and the chain continues after it. The brackets are the indexer's own, so `self:attribute` and `self:attribute[]` are syntax errors, as is a second key, `self:attribute["a", "b"]`. A bracket after them is an access by name of what the indexer answers, as one after a member is: `x:lookup["a"]["b"]` invokes `lookup` and reads `b` of what it answers, as `panel.size["width"]` reads `width` of the panel's size. `?:` invokes it on a receiver that can be null, answering null for one that is without evaluating its key, as `?.` does for a call. A colon after a complete value can only begin an indexer, since the colon of a field or a local follows the name that starts its entry, so `{ key = self:attribute["data-key"] }` is a field whose value invokes one.
- **The default indexer.** A colon and a key in brackets with no name between them, `self:["data-key"]`, invoke the receiver's default indexer, the one indexer the vocabulary declares the default for the receiver's type, as `attribute` is an element's and `item` a list's, so `self:["data-key"]` reads the attribute as `self:attribute["data-key"]` does, and `list:[2]` the list's third item. `?:[…]` invokes it on a receiver that can be null. A receiver whose type has no default indexer is a validation error that says to name one, and a receiver has one at most.
- **One argument.** Neither form takes named arguments or several positional ones: an operation with several parameters takes them as the fields of one object, `sentinel.intersects({ root = panel, margin = 200 })`, so `self.closest(".a", ".b")` is a syntax error.
- **The form a member takes** is its declaration's: a property is accessed, and an operation or an event source is a call, unless an operation is declared a named indexer. Writing a member in another form is a validation error that gives the form it takes: `'attribute' is an indexer: write 'self:attribute[…]'`. The forms of the built-in vocabulary are in its tables.

The boundaries are decided by the text alone, never by how many parameters an operation declares, so the grammar needs no vocabulary and every member of every vocabulary takes it alike.

## Names and resolution

Every member access, call and indexer has its receiver written before it, and every equality both of its operands, and `self` is the **current value**, so a reader never has to guess what a name applies to: a name that starts a chain is the local of that name in scope where it stands, and otherwise a parameter, the caller's binding of it, and `self` is the current value. A member written without its receiver, as `rect.width` or `closest(".row")`, is an error that gives the form with `self` where the current value has a member of that name, and an equality without its left operand, as `is null`, one that gives the form `self is …`.

- **At the top level** there is no current value, so a query starts with a parameter, a literal or an object expression, and `self` there is an error, in a field or a value argument as in the query itself: `self.size`, `{ size = self.size }` and `target.intersects({ root = self })` alike.
- **Inside an object expression**, the current value is the value it follows: in `viewport { width = self.rect?.width }`, `self` is the viewport. An object expression at the top level, `{ anchor = anchor.rect, open = popup.is("popover-open") }`, has no current value, so each of its fields starts with a parameter, a literal or an object expression.
- **An object expression following no value** keeps the current value around it, so it groups fields: in `panel { layout = { width = self.size?.width, height = self.size?.height } }`, `self` is the panel. At the top level that value is absent.
- **Parameters** resolve the same way everywhere, inside object expressions and arguments alike. A parameter's value is a node, or data: a number, a string, a Boolean, null, a list or an object, as a behavior's configuration is, and a list or an object can hold nodes.
- **The roots** are predefined parameters: `document` is the document and `window` is the browser window, its layout viewport and what it supports. No binding can take either name.

### Arguments

A call or an indexer takes one argument, and its declaration states what that argument supplies, its **input**:

- **Direct:** the argument is the value or the expression of the member's one parameter, as `"data-key"` is in `self:attribute["data-key"]`.
- **Options:** the argument is an object expression written in place, whose fields supply the member's parameters by name, as `{ root = panel, margin = 200 }` does for `intersects`. Each field follows its parameter's rules; a field the member has no parameter for is a validation error naming those it has, a required parameter must be given, and a missing optional one takes its default. Where every parameter is optional, the argument can be left out, as in `sentinel.intersects()`. An object means options only by its member's input: the object a direct member is given is its one parameter's value.

Every parameter of a member is declared as one of three kinds, and the evaluator treats them differently; a parameter an options object supplies is the same.

- A **value argument** is evaluated once, where the call is written, against the same current value as the chain it appears in, so its `self` is that current value. In `viewport { intersects = self.first(".item").intersects({ root = self.parent as "element" }) }`, `self.parent` is the viewport's parent, not the item's. At the top level, where there is no current value, a value argument starts with a parameter, a literal or an object expression: `target.intersects({ root = target.parent as "element" })`.
- An **expression argument** is evaluated by the member against a context the member's signature declares, such as each item of a list, which is its `self`. In `table.all("tbody tr").max(self.rect?.height)`, `self` is each row. The built-in vocabulary's expression parameters are those of `max`, `min` and `sum`.
- A **predicate argument** is an expression argument of any value, and the member receives its truthiness, a Boolean, for each item it evaluates it against: in `panel.children.where(self:["data-key"])`, the element's attribute is truthy wherever it is present, empty or not. The built-in vocabulary's predicate is that of `where`.

A value argument can be declared **fixed**, where it selects something validation needs before evaluation, such as the event type whose members `on` offers or the condition `is`, `has` or `supports` asks. A fixed argument is a string the query's preparation settles, without reading the document or depending on an event: a literal, a bound parameter, a local or a conditional binding holding one, and an `and`, an `or`, a conditional or a coalescing operator whose result they settle by the rules that evaluate it everywhere, as `window { let feature = "share", supportsShare = self.supports(feature) }` and `panel.is(wide and "expanded" or "collapsed")` are. A member's value is read from the document, so an expression that needs one to settle is a validation error, as `if panel.attached then "share" else "share"` is; the side an expression does not take is validated and selects nothing, so a name only it holds is never looked up.

Because the kind is part of the signature, the evaluator validates every kind before evaluation and records the dependencies of value, expression and predicate arguments while it evaluates.

### Tests

A test is a member that answers a Boolean, read as every member is.

```domql
document.is("visible")
panel.first("input")?.is("disabled")
input.hasSelection
input.is(state)
```

- **Members.** A test is a property or an operation whose result is a `boolean` or a `boolean?`: `self.is("disabled")` asks whether an element is disabled, and `self.matches(".toolbar > button:first-child")` whether it matches a selector. A test of presence is named with `has`, as `hasChildren` and `hasSelection` are, since `children` and `selection` read what is present. A test follows the access rules as every member does, so one of a receiver that can be null is read with `?.` and is a `boolean?`, and `input[state]` reads the test a binding names, as the section on access by name sets out. The built-in vocabulary's tests are in its table of properties, and a module declares a test as it declares any member.
- **No test by name after `==`.** `==` compares values, so `input == "disabled"` compares an element with a string, a validation error that gives the member to write, `input.is("disabled")`.

### Equalities

`a == b` compares two values, and `a != b` is its negation.

```domql
action == "save"
panel.parent == null
left:["name"] == right:["name"]
(try item.parent as "element") == panel
count != 0
```

- **Comparison.** Strings compare exactly, by code unit; numbers numerically, so `-0 == 0` is true; Booleans by value; and nodes by identity, so `a == b` asks whether they are the same node. Nothing is converted.
- **Null** equals only null, and a value of any type is compared with null, one that cannot be null included, so `panel.parent == null` asks whether the panel has a parent.
- **Types.** Two values whose types fit neither way, as `"1" == 1` or an `element` with a `document`, are a validation error naming both; an `element` and a `node` fit, as do a `number` and a `number?`. A structured value, a list, an object, the window, a view and an event source are compared with null alone.
- **Results.** An equality answers a `boolean`, never null, evaluating both operands once, from left to right, and a watch follows what both read. Where it decides a path, a comparison with null [narrows](#truthiness) a stable reference, so `a != null and a.rect` reads a local `a` that is not null; it narrows no member, which is read anew wherever it is written.
- **`!=`** has the definition of `not` around `==`, and the canonical text writes it so: `not (a == b)` and `not a == b` are both written `a != b`.
- **Binding.** A dot binds tighter than `==`, and so do an indexer, a cast, a conversion, an attempt and arithmetic, so `panel:["role"] == null` tests the attribute and `panel.matches(".open") == false` tests the match. An equality takes an equality operand on either side, a chain, a cast, a conversion or an attempt, and does not chain, so `a == b == c` is a syntax error and `(a == b) == c` compares the first's result; it stands beside a coalescing operator only where a group holds one of them, `(count ?? 0) == 0`.

For a nullable Boolean `x`, comparing and negating answer differently where `x` is null:

| Expression | Where `x` is null | Same as |
| --- | --- | --- |
| `x == true` | false | `x ?? false` |
| `x == false` | false | `not (x ?? true)` |
| `x != true` | true | `not (x ?? false)` |
| `x != false` | true | `x ?? true` |

### Truthiness

Null and false are falsey, and every other value is truthy: `0`, the empty string, `"false"`, an empty list and an empty object among them. A condition, a conditional binding, an operand of `and`, `or` and `not`, and a predicate argument test a value for its truthiness, which converts nothing and calls no conversion, so `"false"` is truthy and no equality makes it false.

- **Declared Booleans stay Booleans.** A member declared to answer a `boolean` answers one, and one that answers anything else fails the evaluation, as every member answering a value not of its type does, wherever its value is tested.
- **Narrowing.** Where a test decides the path an evaluation takes, what reaches that path knows what the test guarantees of the stable references it tests: locals, conditional bindings, parameters and the current value, each by its own identity, so a local of one object expression tells nothing of another's of the same name, and a nested object expression's `self` is its own. A reference tested on its own is, where it is truthy, not null, and where it is falsey, null or false; `ref == null` says it is null and `ref != null` that it is not, `not` turns what a test guarantees around, and an `and` that is truthy guarantees what each of its operands does, as an `or` that is falsey does. Where paths meet, only what each of them guarantees holds: an `and` that is falsey, or an `or` that is truthy, guarantees only what every way of reaching that outcome does, so `a != null or b != null` guarantees neither. A member is read anew wherever it is written, so it is never narrowed, and the same text read twice tells nothing of the second read; a local holds a value to test once and use after.
- **Where it applies.** The right operand of an `and` sees its left operand truthy, and that of an `or` sees it falsey; a conditional's consequent sees its condition truthy, and its alternative, a later `elseif` among them, sees it falsey. A narrowed Boolean stays a Boolean, since no type tells true from false.
- **Evaluation.** Narrowing changes no evaluation and validates nothing less: every operand and branch is validated, and an operand or a branch that evaluation does not reach is not evaluated or observed and cannot produce runtime failures.

### Arithmetic

`+`, `-`, `*`, `/` and `%` compute with numbers, and `-` before a value negates it, so a query derives the values it needs from the ones it reads: remaining space, a size's difference, a position relative to another element.

```domql
panel {
    remaining = (self.clientSize?.width ?? 0) - (self.first(".content")?.rect?.width ?? 0),
    half = (self.rect?.width ?? 0) / 2,
    padded = (self.rect?.width ?? 0) + 24
}
```

- **Numbers alone.** Both operands are numbers, and nothing converts to one but `to`, so `"2" + 1` is a validation error and `+` joins no text. An operand that can be null is a validation error too, so missing data never becomes zero: give it a fallback, `(… ?? 0)`, or test it first.
- **Precedence.** A negation binds tightest of them, then `*`, `/` and `%`, then `+` and `-`; operators of one level associate to the left, so `10 - 3 - 2` is 5, and parentheses group as they do anywhere. Arithmetic binds tighter than `==` and `!=` and looser than a conversion, so `counter:["data-count"] to "number" + 1` would convert the attribute and then add one, and `(a + b) to "string"` converts the sum. `-x to "number"` negates the converted value, and `(-x) to "number"` converts the negated one.
- **Attempts.** `try` applies to the conversion or the cast written after it, and that attempt is an operand of arithmetic, so `try x to "number" + 1` is `(try x to "number") + 1`, a validation error since its left operand can be null; `(try x to "number" ?? 0) + 1` gives its fallback first.
- **Beside `??`.** `??` and binary arithmetic stand apart, one of them grouped, as it stands apart from `and`, `or` and an equality: `a ?? b + 1` is a syntax error, written `(a ?? b) + 1` or `a ?? (b + 1)`. A negation is no binary arithmetic, so `value ?? -1` stands.
- **Literals.** A negation of a numeric literal is that negative literal in a definition, `-0` included, as the parsed text holds it, so `-5 to "string"` negates a conversion, and `(-5) to "string"` converts the literal `-5`.
- **Evaluation.** The left operand is evaluated, then the right; arithmetic does not short-circuit, and an operand that fails fails it. Numbers are IEEE 754 doubles, so `0.1 + 0.2` is `0.30000000000000004`, and `%` is the remainder with the sign of the dividend, so `-5 % 3` is `-2`. A division or a remainder by zero, and a result no finite number holds, are evaluation errors at the operation, so neither infinity nor NaN reaches a result.
- **Watching.** Arithmetic reads what its operands read, and observes nothing of its own. A computed number is compared exactly, whatever tolerance a member it reads declares, since a product or a quotient changes the scale a tolerance was set for.

### Logical expressions, negations and groups

`and` and `or` answer the operand that decides them, `not` answers whether a value is falsey, and parentheses group any expression.

```domql
panel.attached and enabled
input.is("disabled") or (input.is("readonly") and input.is("text-editable"))
panel { available = self.attached and not busy }
panel { let input = self.first("input"), width = input and input.rect?.width }
panel:["data-label"] or "untitled"
```

- **Operands.** An operand of `and` and `or`, and what `not` negates, is any value, an event source, an action or a behavior being a validation error; each later operand sees what the operands before it guarantee where it is reached, as [narrowing](#truthiness) sets out.
- **Binding.** An equality binds tighter than `not`, `not` tighter than `and`, and `and` tighter than `or`, so `panel.attached or not input == null and enabled` combines the negation of the input's equality and `enabled` before the panel's test. `not` associates to the right, so `not not a` negates `a` twice, and `and not` and `or not` are `and` and `or` of a negation.
- **Results.** `and` answers its first falsey operand, or its last where every one before it is truthy, and `or` its first truthy operand, or its last where every one before it is falsey, each as it is, never copied or converted: `null and "value"` is null, `0 or 10` is 0 and `"" or "fallback"` is the empty string. `not` answers a `boolean`, true where its operand is falsey. Of Booleans, they answer what Boolean logic does.
- **Type.** `and` is of the falsey part of each operand before its last, merged with its last, and `or` of the truthy part, merged with its last: a value that can be null has null for its falsey part and itself without null for its truthy part, a Boolean is a Boolean in both, and any other value is truthy only. So `panel.first(".a") and 5` is a `number?`, `name or "untitled"` a `string` where `name` is a string, and Booleans give a `boolean`. Where fixed operands, literals and bound parameters, decide it, it is of the one that does, so `true and "value"` is a `string`. Values no one type holds are a validation error, as `self.is("disabled") and self`, which gives false or an element: unlike Lua, DOMQL types every expression, and offers no type for false or true beside another, so a conditional chooses between values of one type, `if self.is("disabled") then self else null`, where null is an acceptable alternative.
- **Not a conditional.** `and` and `or` choose a value only where the value that decides them is the one wanted: `true and false or "fallback"` is "fallback", since false is falsey, so a choice whose chosen value can be false or null is a conditional, `if condition then value else fallback`.
- **Evaluation.** Operands are evaluated from left to right, each once, and evaluation stops at the first that decides the result, a falsey one for `and` and a truthy one for `or`, so the operands after it are unreached: they are still validated, but are not evaluated or observed and cannot produce runtime failures. A watch follows the operands evaluation reached, so it holds what an operand reads only while evaluation reaches it.
- **Groups.** An expression group holds an expression and adds nothing of its own, so `((panel))` is `panel`, and as a chain input it can start a chain: `(panel).children.count`.

### Conditionals

A conditional chooses between two values: `if` a condition `then` its consequent `else` its alternative, taking the consequent where the condition is truthy. Further conditions, each with `elseif`, are tested in order before the alternative. A clause can bind a value in place of its condition, `if let name = value`, and takes its consequent where that value is truthy.

```domql
if wide then panel else sidebar
if let row = cell.closest(".row") then { key = row:["data-key"], top = row.rect?.top } else null
if panel.first("input")?.is("disabled") then "locked" elseif panel.first("input") == null then "empty" else "open"
panel { state = if self.is("disabled") then "locked" else "open" }
(if wide then panel else sidebar).rect?.width
```

- **Conditions.** A condition is any value, an event source, an action or a behavior being a validation error. A truthy condition selects the clause's value; a falsey one moves to the next clause, and where no condition is truthy, the alternative is the value. The consequent sees what the condition's being truthy guarantees of the stable references it tests, and the alternative, a later `elseif` among them, what its being falsey does, as [narrowing](#truthiness) sets out. A condition that is always truthy is valid, as a list is, even an empty one, so whether a list has items is asked of it, `panel.hasChildren` or `items.count != 0`.
- **Conditional bindings.** `if let name = value then … else …` evaluates its value once and takes its consequent where the value is truthy, with the name bound to it, and moves to the next clause where it is null or false. `0`, empty text and an empty list take the consequent; a value that is always falsey never does, and a value that cannot be null still moves on where it is false. The name has the value's type without null, a Boolean staying a Boolean, and it is visible throughout its consequent, nested expressions included, and nowhere else: neither in the value it binds, nor in the alternative, nor in a later `elseif`. In the value it binds, its name is a structure error rather than the caller's binding of that name, as a local's is in its own value, so `if let k = k then …` is refused; in the alternative and a later clause, the name is the caller's binding again. It is named as a local is, so it never reuses the name of a local in scope. The value is any value, and an event source, an action or a behavior is a validation error. `elseif let` binds as `if let` does.
- **Branches.** Every branch is mandatory, and they are of one type, compared structurally for object types, which may differ in nullability: a conditional is nullable wherever a branch is, so `number` and `number?`, or `number` and `null`, give `number?`, while `number` and `string` are a validation error naming both.
- **Evaluation.** Only the selected branch is evaluated, and its value is kept as it is, false and null included. The branches not selected are unreached: they are still validated, but are not evaluated or observed and cannot produce runtime failures. A watch follows what was evaluated: each condition and bound value up to the clause taken, and that clause's branch.
- **Grouping.** A consequent and an alternative each take a whole expression, an ungrouped conditional included, so `if a then b else c and d` holds the `and` in its alternative. A conditional that is a condition, an operand of `and` or `or`, an operand of an equality, or the start of a chain is grouped: `if (if a then b else c) then 1 else 2` and `(if wide then panel else sidebar).rect?.width`. A conditional has no `?:` form and no closing `end`.
- **Every clause writes its whole condition or binding,** so an `elseif` inherits nothing from the clause before it.

### Coalescing operators

A coalescing operator answers its value where it is not null, and otherwise its fallback: `value ?? fallback`.

```domql
panel.rect?.width ?? 0
panel:["data-label"] ?? panel:["title"] ?? "untitled"
panel.first("input")?.is("disabled") ?? true
```

- **Evaluation.** The value is evaluated once, and the fallback only where the value is null, so a watch follows what the fallback reads while the value is null alone. False, zero and the empty string are values, which the fallback never replaces. A fallback that evaluation does not reach is still validated, but is not evaluated or observed and cannot produce runtime failures, and a failure of either side that evaluation does reach stays a failure.
- **Null alone.** `??` falls back for null and `or` for null and false: `false ?? true` is false, and `false or true` is true. `try value to "number" ?? 0` gives a default for null alone, which an attempt's rejection is.
- **Type.** The value and the fallback are of one type, compared as a conditional's branches are, and the whole is of the value's type made non-null where the fallback's is, so `panel.rect?.width ?? 0` is a `number`. A value of the type `null` gives the fallback's type, and `??` after a value that cannot be null is valid, since a binding typed from its value may be one that can.
- **Association.** `??` associates to the right, so `a ?? b ?? 0` is `a ?? (b ?? 0)`, and each side is a chain, a cast, a conversion, an attempt or a negation, or binary arithmetic only in a group, as arithmetic sets out.
- **Grouping.** A coalescing operator stands beside `not`, `and`, `or` and an equality only where a group holds one of them, so `enabled ?? false and ready` and `a ?? b == null` are syntax errors, while `(enabled ?? false) and ready` and `enabled ?? (ready and visible)` each say what they mean.

### Casts

A cast answers a node as one of its kinds: `target as "type"` answers its target itself where it is of that type, and null where it is null. A node of another kind fails the evaluation, which [an attempt](#attempts), `try target as "type"`, answers null for instead.

```domql
panel.parent as "element"
(panel.parent as "element")?.rect?.width
(preferred ?? fallback) as "element"
(?(panel.parent as "element").rect.width)
(try panel.parent as "element")?.rect?.width
```

- **The type** is a quoted type name, `node` or one of its kinds, and the cast is of that type, nullable where its target can be null, so `panel.parent as "element"` is an `element?` and `panel as "element"`, with `panel` bound to an element, an `element`; an attempted cast is nullable always. A type that is no node is a validation error naming those a cast takes.
- **Strict.** A cast states the kind the query expects, and a node of another kind fails the evaluation with an evaluation error naming what it is, as `The cast to element rejected its value: it is a document`, so a document where an element is expected is an error, never a silent null. A cast that probes which kind a node is is attempted, `(try item.parent as "element") == panel`.
- **What it narrows.** A cast of a `node` narrows it to a kind, and one to its target's own type, to `node`, or of null is valid, since a binding typed from its value may already be of the type or null. A cast of a target that can never be of the type, such as `5 as "element"` or `document as "element"`, is a validation error. A cast converts nothing and narrows nothing outside itself: its target keeps its type wherever else it is read.
- **Its target** is a receiver and the member-access expressions after it, a coalescing operator in parentheses, or an optional-access group: `panel.parent as "element"`, `(preferred ?? fallback) as "element"` and `(?panel.parent) as "element"`. Any other grouped expression is no target, so `(if wide then a else b) as "element"` is a syntax error, and neither is a chain an object expression continues.
- **Binding.** A cast binds looser than access, so a call receives it only through a group: `(panel.parent as "element").matches(".row")` tests the cast. A chain continues from a cast only through a group, `(panel.parent as "element")?.rect`, and a cast takes another as its target only in one, `(node as "node") as "element"`, so `panel.parent as "element".rect` and `a as "node" as "element"` are syntax errors.
- **In an optional-access group**, a cast in parentheses is a receiver, and the accesses of its own target become optional with the group's: `(?(panel.parent as "element").rect.width)` is `(panel?.parent as "element")?.rect?.width`. A target that is a coalescing operator in parentheses or an optional-access group is cast as it is and keeps its own rules: `(?((preferred ?? fallback) as "element").rect)` is `((preferred ?? fallback) as "element")?.rect`.
- **Evaluation.** The target is evaluated once, and the cast answers it unchanged where it is of the type.

### Conversions

A conversion answers a value converted to another type of data: `value to "type"` evaluates its value, carries out the conversion the vocabulary declares from the value's type to the type it names, and answers the converted value. A cast converts nothing, and a conversion narrows nothing.

```domql
panel:["data-count"] to "number"
panel:["data-count"] to "number" ?? 0
panel:["aria-expanded"] to "boolean"
panel.children.count to "string"
```

- **The type** is a quoted type name: `number`, `string`, `boolean`, or a structured type that holds data alone, whatever its fields hold, lists of data among them, as `grid` holds its columns. A conversion converts data, so a node, a structured type that holds one, and an event source are no type it converts between, and what reads the document stays a member's, which declares how it changes; a node is narrowed to one of its kinds with `as`. A list itself is no type a conversion converts between, and neither is a type that can be null. A name no type has is a validation error, as is any other target.
- **One declared conversion.** A value converts to another type only through the one conversion the vocabulary declares from its type to that type. Conversions never chain on their own: a Boolean converts to a string and a string to a number, and `enabled to "number"` is still a validation error, whose message names the types a Boolean converts to. A query that means both conversions writes both.
- **A value already of the type** answers itself, so `5 to "number"` is 5. This is the language's rule, and no conversion is declared from a type to itself.
- **Null.** A conversion of null answers null without converting, and its type is the type it converts to, made nullable where its value can be null. A value of the type null, a null binding, converts to any type a conversion can name, however many conversions reach it, since nothing is converted; a value whose type is known is checked by that type without null, so `panel.closest(".row") to "string"` is a validation error, as a conversion from an element is declared nowhere.
- **What fails.** A value its conversion rejects, as `"12px" to "number"`, fails the evaluation with an evaluation error naming the conversion, the reason it gave and where it stands. A conversion that fails otherwise, by throwing or by answering a value not of its type, has a fault, which fails the evaluation too. A failure never answers null or a default: `?? 0` gives a missing attribute a value, and leaves a malformed one an error, for which [an attempt](#attempts) answers null instead. A watch whose conversion fails is failed until its value converts again.
- **Evaluation.** The value is evaluated once, and a conversion reads nothing but that value, so what a watch of a conversion depends on is what its value depends on.

### Attempts

`try` attempts the one conversion or cast written after it, and answers null where that operation rejects its value: `try value to "type"` answers the converted value where the conversion accepts the value, and `try target as "type"` answers its target where it is of the type. Its type is the operation's, made nullable. It handles a value its operation rejects without failing, as `??` handles a missing one, so the two together give a value either way:

```domql
panel { count = try self:["data-count"] to "number" ?? 0 }
(try panel.parent as "element")?.rect?.width
```

A missing attribute is null, which converts to null, and malformed text is rejected, so both give zero, and text that converts gives its number; a parent that is a document or a shadow root is rejected, so the width is null for it, as it is for a missing parent. A [conditional binding](#conditionals) gives the converted value a name where the query uses it more than once, `if let count = try self:["data-count"] to "number" then … else …`.

- **One operation.** `try` attempts the one conversion or cast written after it, and nothing else, so it is no general catch of errors: a failure while its value is evaluated, a rejection by a conversion or a strict cast that value holds among them, fails the evaluation as it would anywhere, so `try (node as "element").parent as "element"` attempts the outer cast alone. A conversion of a conversion or of a cast is grouped to say which one is attempted, `try (a to "string") to "number"`, so `try a to "string" to "number"` and `try node as "element" to "string"` are syntax errors, as is `try` before anything that is neither, another `try` among them. Another kind of operation takes `try` once it declares a rejection of its own.
- **One set of rules.** An attempt resolves as its operation does strictly, so a cast to a type that is no node or of a target that can never be of it, a conversion to a target no type has, a pair no conversion is declared for, and a nullable value whose type has no conversion are validation errors for both. It answers a value already of the type as it is, and null for null.
- **A rejection alone is null.** A cast rejects a node of another kind, and a conversion the value it calls `reject` for. A conversion that throws, rejects with a reason that is no string, rejects and then answers, or answers a value not of its type has a fault, which fails the evaluation whether or not the conversion is attempted.
- **Null means a rejection.** For a non-null input, a successful conversion returns a non-null value of its declared target type. A converter returning null is a fault, including under `try`. Consequently, for a stable bound value, `value != null and try value to "type" == null` is true exactly when the conversion rejects that value. A cast answers its target itself, so the same holds for `try target as "type"`. Faults remain errors.
- **Evaluation.** Its value is evaluated once and its operation carried out once, and what a watch of it depends on is what its value depends on.
- **Binding.** `try` binds tighter than `==`, `!=` and `??`, and looser than the operation it attempts, so `try v to "number" == 5` compares the converted value, `(try node as "element") != null` asks whether the node is an element, and `try v to "number" ?? 0` gives its fallback for both null and a rejection. It stands where an equality operand stands; a conversion of its result groups it, `(try v to "number") to "string"`, and a cast takes none as its target, so `(try a as "node") as "element"` is a syntax error.

A result that keeps the converted number and tells a missing value from a malformed one says which it is beside the value, reading the attribute once through a local:

```domql
panel {
    let count = self:["data-count"],
    count = if let n = try count to "number" then { status = "valid", value = n }
    elseif count == null then { status = "missing", value = null }
    else { status = "malformed", value = null }
}
```

### Locals

An object expression can name a value once, as a **local**, and use it by its name in the entries after it, so a value read in several places is written and evaluated once.

```domql
panel {
    let items = self.all("[data-key]"),

    width = self.size?.width,
    rows = items {
        key = self:["data-key"],
        top = self.rectRelativeTo(panel)?.top
    },
    tallest = items.max(self.rect?.height),
    attached = self.attached
}
```

- **Writing one.** A local is written as a field is, a name, `=` and a value, after `let`. An object expression writes its locals before its first field, each followed by a comma, and still holds at least one field, so `{ let x = 1 }` is a syntax error.
- **Using one.** A name that starts a chain is the local of that name in scope, as `items` is above, and stands where any chain input does: a chain continues from it, an object expression follows it, and a call takes it as its argument. A local takes no argument, so `items(…)` is a syntax error.
- **Scope.** A local is visible to the locals after it, to every field of its object expression and to everything nested in them, arguments included, and never before it, so none can depend on itself. A name no local in scope has is the caller's binding of that name, a parameter; one the caller did not bind is a validation error, which gives the form with `self` where the current value has a member of that name: `No local in scope or binding is named 'rect'; write 'self.rect' for the member of the current value`. A name used before a local of it is declared later in the same scope, the local whose value it is among them, is a structure error, never the caller's binding of that name, so `{ let a = b, let b = 1, c = a }` and `{ let n = n, a = 1 }` are refused whatever the caller binds; a local of that name in a sibling or an unrelated scope leaves the name the caller's, so in `{ a = self { let n = 1, v = n }, b = n }` the field `b` reads the binding `n`.
- **Names.** Two locals of one object expression never share a name, and a local never reuses the name of one an enclosing object expression or a conditional binding has in scope, so a name means one thing wherever it is visible; either is a structure error. A local may take a binding's name, which reads the local wherever it is in scope, the binding going unused there, and no local takes `document` or `window`, which name the roots. Locals and fields are separate, so `let items = …, items = items` holds a field named after its local.
- **Its `self`** is the current value of the object expression that holds it, wherever it is used: inside `rows` above, `self` is each row, and `items` is still the panel's list.
- **Evaluation.** During each evaluation, each application of an object expression has its own locals. Each local is evaluated at most once, at its first use within that application, and every use there sees that value: in `panel.children { let r = self.rect, … }`, each child gets its own `r`, and a later evaluation gets fresh locals. An unused local evaluates nothing and contributes no observation dependencies, and a watch follows what was read. Like every expression, it is resolved and validated before anything is evaluated.
- **It is never output.** A local is no field, and the result never holds it, so it can hold what no field can, such as an element or a list of them.
- **Where.** In an object expression alone: an options object, whose fields supply its member's parameters, holds none, and a local there is a validation error.

### Case-sensitive names

Every name in DOMQL is case-sensitive, and nothing normalizes one: `size` and `Size` are different names, and so are `panel` and `Panel`. A name is resolved exactly as it is written, and each kind of name is spelled by its own convention:

- **Members** are named in camelCase, properties and operations alike: `size`, `clientSize`, `devicePixelRatio`, `rectRelativeTo`. A member has one name, the same in a text and a definition. `self["clientSize"]` reads that property by the same name.
- **Field names and bindings** keep the exact spelling their author gave them, so `hasFocus` and `hasfocus` are two fields, and a binding `panel` is not a binding `Panel`.
- **Strings** are preserved exactly: `kind = "List"` answers `List`. A string is read as a DOMQL name only where it names a member, as an access by name reads one, and it is then read exactly. A value passed to a browser API, such as a selector, an attribute's name or value, or an event type, follows that API's own case rules.

A field answers the key its name is written as, and how a consumer matches keys to its own members is its own: a consumer that cannot tell `hasFocus` from `hasfocus` reports the ambiguity, and the language is unaffected. How a module names an operation in DOMQL, and which function carries it out, is the module's declaration.

## Values

A value is a number, a string, a Boolean, null, a list, a structured value such as a rectangle, a node such as an element or the document, the window, or an event source. A member's signature declares its result type, as the section on types sets out, and a result marked `?` can be null by itself; an optional access answers null where its receiver is null, and any member answers null where an argument is null and its parameter propagates null.

A result is data: numbers, strings, Booleans, null, lists and objects. A node, an element's shadow view or an event source has no data form, so a query whose result would contain one is a validation error; a query reads the facts it needs of a node through an object expression.

### Objects

- A field is written with its name before its `=`, `width = self.rect?.width`, whatever its value is, and the language infers no name: a field without one is a syntax error, as is an object expression without a field.
- Two fields of one object expression with the same name are an error when the query is created.
- A result keeps its fields in the order the object expression names them.
- An object expression following null is null.

### Lists

- A list keeps the order of its source: a member that makes a list says where its order comes from, as `all` takes document order, and a bound list keeps the caller's; `where`, and an object expression following a list, keep its items in that order.
- An object expression following a list applies to each item and answers a list of the same length, in the same order; an item that is null answers null at its position.
- A member following a list is a member of the list itself: `self.all("tr").count` counts rows.
- `count` of an empty list is 0, and `sum` is 0. `max` and `min` of an empty list are null.
- `max`, `min` and `sum` take a number expression, skip items whose expression is null, and answer null for `max` and `min` when every item was skipped.
- `where` takes a predicate and keeps the items it is truthy for, leaving out an item whose predicate is null or false.
- `first`, `last` and the list's default indexer, `:[index]`, answer null when the list has no such item.

CSS selectors and `where` are the two ways a query filters: a selector chooses elements as the browser matches them, and `where` chooses list items by any value the vocabulary offers, by its truthiness.

## Types

A value has a type, and every member declares the types it works with. Type checking is part of preparation: a request that cannot be typed is a validation error naming where it fails, the type it expected and the type it found, before anything is evaluated.

The types are `number`, `string`, `boolean`, `node` and its kinds, `element`, `document`, `documentFragment` and `shadowRoot`, `window`, `shadow`, an element's view of its shadow relationships, and `aria`, its view of its ARIA states; `list<T>` of items of type `T`; the structured values, each with named fields of declared types, such as `rectangle`, `size`, `selection` and `grid`, the object types of the objects a query's object expressions produce, and any a module declares; and `event<T>`, an event source whose events carry event data of type `T`. A module can declare types of its own. `null` is a value of every type that is written with a `?`: `T?` is a `T` or null. Null alone is of the type `null`, which fits every nullable type, and `never` is the type no value has, which fits every type, so `list<never>`, the type of the empty list, fits every list type. Both are names of the type notation, and neither is a word of the expression language.

### What a member declares

An operation's or an event source's form is a call. An operation can be declared a named indexer instead, for one that reads a value of its receiver by a key: its one parameter, a required value parameter, is the key in its brackets, of whatever type it declares, and its input is direct. It declares its input, the shape of its argument: direct, the value of its one parameter, which its module's registration checks, or options, an object whose fields supply its parameters, however many it has. Changing a member's input is a breaking change, as renaming it is, so an operation that may grow is declared with options from the start. An indexer can be declared the default of its receivers, which `:[…]` invokes without naming it; registration refuses a second default for a receiver one already has.

A member's signature declares its receiver type, its form and its input, then each parameter's order, name, type, whether it is required or what it defaults to, and how it handles null, and its result type. Optional and nullable are separate: an optional parameter may be omitted, and a nullable one may be given null. Unless a table marks a parameter optional, it is required: omitting a required argument is a validation error, and supplying null follows its declared null policy. It is only part of the member's contract: the member also declares its evaluation context, how it changes and how it reads, and the request kind it belongs to. A parameter is a value argument, an expression argument or a predicate argument, and an expression argument declares the type of the item it is evaluated against and the type it must produce, while a predicate's type is `boolean`, the truthiness its member receives:

- `list<T>` keeps `T` through `where`, `:[index]`, `first` and `last`.
- `where` evaluates its predicate against a `T`, of any value.
- `max`, `min` and `sum` evaluate their expression against a `T` and require a `number?`.

These expressions declare a nullable result because they consume null per item instead of propagating it to the whole call: `max` and `min` skip it and answer null when every item was skipped, and `sum` skips it and answers zero when every item was skipped or the list is empty. So `table.all("tbody tr").max(self.rect?.height)` and `panel.all("[data-key]").where(self.intersects({ root = panel }))` are valid although `rect?.height` and `intersects` can answer null.

- An object expression following an `event<T>` is evaluated against that event, a `T`.

### Nodes

A node is a value of the DOM tree, and its kinds are `element`, `document`, `documentFragment`, a document fragment that is no shadow root, and `shadowRoot`. `window` is no node.

- **Kinds fit where a node does.** A value of a kind fits where a `node` is expected, and a `node` fits where a kind is expected only through a cast, so a kind's own members, such as an element's `rect`, are read of a `node` through one: `(panel.parent as "element")?.rect`.
- **Of two kinds.** Values of two different kinds, a conditional's branches, a coalescing operator's sides or the items of a bound list, are of the type `node`, so `if wide then panel else document` is a `node`.
- **Declaring on a node.** A member declared on `node` is a member of every kind, and no member of the same name can be declared on a kind, so no declaration overrides another.

### Shadow trees

Every crossing of a shadow boundary is written, so a query shows the relationship it follows:

```domql
host.shadow.root            // Into the shadow tree an element hosts.
element.root.host           // Out of the shadow tree an element is in, to its host.
slot.shadow.elements        // The elements a slot shows.
```

- **Selectors never pierce a shadow root.** `first`, `all` and `closest` select within their receiver's own tree, so `host.all("p")` holds no element of the host's shadow tree, and `host.shadow.root?.all("p")` selects within it. `parent` never crosses a boundary either: a direct child of a shadow root has that root as its parent, and reaches the host through `root.host`.
- **The view.** An element's `shadow` is a value of the type `shadow`, which has no data form, so a result never holds one. It is the same for its element whatever changes, and its members answer the element's shadow relationships as they are.
- **`shadow.root`** is the open shadow root the element hosts, and null where it hosts none or a closed one.
- **`shadow.elements`** is a slot's assigned elements, flattened, as `assignedElements({ flatten: true })` answers them: it follows assignment through forwarded slots, takes the slot's fallback where nothing is assigned to it, answers elements alone, filters nothing by visibility and enters no assigned element's own shadow tree. A slot that yields no element answers the empty list, as one does whose assigned nodes are text alone, since assigned text suppresses the fallback, and one outside a shadow tree, whatever its fallback. An element that is no slot answers null, so null tells an element that is no slot from a slot that shows nothing.

### No implicit conversion

DOMQL converts nothing implicitly, and a value converts only where a query writes `to`, as [conversions](#conversions) set out: a `number` is not a `boolean`, a `string` is not a `number`, and an `element` is not a `string`. `self:[200]`, `self.intersects({ root = 5 })` and a `where` whose expression produces a `number` are each validation errors, as is an `element` where a `list` is required.

### Nullability

Nullability is part of a type, and null follows the signature.

- **Access requires a receiver that cannot be null, and optional access reads one that can.** `panel.first(".row").rect` is a validation error, since `first` answers an `element?`, and `panel.first(".row")?.rect` answers null without invoking `rect` where the panel holds no row; its type is `rectangle?`, since an optional chain is nullable where an optional access of it can meet null. A member written with `?.` or `?:`, a test among them, answers null for a null receiver, so `panel.first(".row")?.matches(".open")` is a `boolean?` that is null where there is no row.
- **A null argument follows the parameter.** A parameter is declared either to propagate null, which is the default and makes the call answer null without running, or to accept null with a meaning of its own, as `intersects` accepts a null `root` to mean the window. Preparation never rejects an evaluated argument for being nullable; it rejects a type that cannot match. A fixed argument that names a declaration, the type of `on` and the feature of `supports`, is different, and so is the name of an access by name: each must resolve to a non-null string during preparation, because a declaration cannot be looked up from null, and an access by name could not determine its result type. A nullable binding is accepted when its value supplies a valid name, and an actual null is a validation error for `panel[name]` and `button.on(name)` alike.
- **A written null is an expression that produces null.** `null` as a literal has no special treatment, and the signature and the evaluation rules decide what a call does with it.
- **Null is unavailable too.** An element is a valid receiver of `selection`; one that is no text input answers null, as an unavailable value does. A receiver of the wrong type, a number for `rect`, is a validation error, and a module that returns a value of a type other than the one it declared has broken its contract, which is an evaluation error and never a quiet null.

### Bindings

A binding takes its type from its value, and a caller declares none.

- A node is of its kind: an element is an `element`, a document a `document`, a shadow root a `shadowRoot` and any other document fragment a `documentFragment`, and a node of another kind, such as text, is no binding.
- A number, a string and a Boolean are `number`, `string` and `boolean`.
- Null is a `null`.
- A list is a `list<T>`, `T` the type its items share, `node` for nodes of different kinds, made nullable where one of them is null: `[element, null]` is a `list<element?>`. A list of nulls alone, `[null]` or `[null, null]`, is a `list<null>`, whose items can only be null, and the empty list is a `list<never>`, which holds no item.
- An object is of the object type of its fields' types, each typed as a binding is.
- A list whose items share no type has no type, because DOMQL has no union types and a list holds items of one type, so binding `[1, "two"]` is a structure error.

A tool that checks a query without running it takes the same values, or values of the same types, for the bindings, since vocabulary declarations alone cannot establish the type of `panel`.

### Receivers of unknown type

A receiver of the type `null`, a null binding or the literal `null`, says nothing of what it would be, and neither does a `never`, the item of an empty list. The concession is to missing type information alone: a receiver whose type is known is checked as always, a nullable one included, so `panel.parent?.sise` is refused for an element `panel` whatever its parent is. A receiver of the type `null` can be null, so it takes `?.`, and a `never`, which no value has, takes `.`. A name applied to a receiver of unknown type resolves without choosing one declaration:

- **Any property.** A name written as a property is accepted whatever it is, since the fields of a bound object are named by its data, as `row?.id` for a null `row` and `rows { id = self.id }` for empty `rows` are; it is checked once its receiver's type is known.
- **Known calls alone.** A name written as a call or an indexer is a member's, written in the form, and given the arguments, that at least one of its declarations takes; a name no member has, one written as a call where every declaration is a property, and one given an argument none takes are validation errors, since data names no operation.
- **The request keeps its kind.** The declarations that take the name as it is written agree on the request kind they make, and the request is of that kind, so it takes the operations of its kind and is refused the others. Declarations that disagree on their kind are refused as ambiguous, and a cast to a kind of node says which a null receiver means: `(thing as "element")?.ping()` takes the element's declaration of `ping` for a null `thing`.
- **What it answers.** A query answers null, a subscription listens to nothing, an action is not executed and answers null, and a behavior is applied with nothing started, as with any null receiver. Its type is the result type those declarations share, made nullable for a receiver of the type `null`, which answers null, and as they declare it for a `never`, which is never evaluated, so `rows { count = self.children.count }` is valid for empty `rows` and `rows { count = self.children.sise }` is refused. Where they share none, or the name is no member's, it is `null` for a `null` and a `never` for a `never`: a `never` fits wherever a value of any type stands, so `rows { done = not self.complete }` is valid for empty `rows`, and checked once they hold items.
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

Evaluating or watching a query never performs an action or configures a behavior: a query only reads, and an action or a behavior request acts only when its caller executes or applies it. A behavior belongs to the caller that applied it.

```domql
// An action: step the viewport forward, answering whether it moved.
viewport.scroll({ axis = "inline" }).step({ direction = "forward" })

// A behavior request: page the viewport with the wheel while Shift is held.
viewport.scroll({ axis = "inline" }).wheelPaging({ modifier = "shift" })
```

## Events

A chain that ends in an event source is subscribed to, in two stages. The source hands each event to the evaluator, which evaluates the object expression following it at once, in the task the source delivers it in, with that event as its current value. The result is immutable data, and that result, never the browser's live event object or the object expression still to evaluate, is what reaches the caller, by the caller's own delivery. An event in DOMQL is what its source delivers, read through the event data it captured; the browser's own event object is never a value of the language. Here the event source is the built-in vocabulary's native drop event:

```domql
zone.on("drop") { key = self.target?.closest("[data-drop-target]")?:["data-drop-key"] }
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
| Derived | As the items it selects and the expression it evaluates read, such as a list's `count` or `max`. |

Facts that must describe one measurement are members of one structured value, which is captured once and read by each of its members, as a rectangle's edges are.

A maintained member's observation starts the first time an evaluation reads it, and the member is **pending** until its first sample arrives. A pending member answers null, and the evaluator keeps pending apart from unavailable; the [DOMQL design](domql-design.md) sets out when a request waits for first samples.

Evaluating a query is read-only for every vocabulary. A measurement that needs the document changed first, such as measuring columns at their intrinsic widths under a temporary class, is an action of its own.

A member whose result depends on what happened before, as well as on the document as it is, is captured: it keeps that history while a watch or an event listener holds it, and documents what an evaluation once reports without it.

### Elements that leave the document

An element is a value whether or not it is in the document. A member that needs an element's layout answers null while the element has no layout box: while it is detached, and while the browser generates no box for it, as when it or an ancestor is `display: none` or it is `display: contents`. An element with a layout box whose dimensions are zero has actual measurements of zero, and one hidden visually that keeps its box measures as it is. Its attributes and structure still read, and `attached` says whether it is attached, whatever its layout.

## How a member changes

Every member declares how its result changes, for a given receiver and arguments.

| Category | Meaning | In a watch |
| --- | --- | --- |
| Constant | The result never changes, as a literal's, or whether the browser offers a capability `supports` asks. | Allowed; it never invalidates. |
| Observable | The member names observations that cover every change to its result, such as a resize observation for a size. | Allowed. |
| Partly observable | The member names the observations it can make and documents the changes they miss, such as a computed style changed by a rule outside the element. | Allowed when the caller accepts partial observation for that watch; a change the sources miss reaches the watch through an explicit refresh or a local invalidation. |
| Unobserved | The member can be read but names no observations. | A validation error. |
| Derived | The result changes as the items it selects and the expression it evaluates do, such as a list's `first` or `where`. | Allowed wherever what it derives from is. |

A literal is constant, so a watched object expression can carry one: `viewport { kind = "viewport", width = self.size?.width }`.

A watch does not see a detached tree inserted into another detached tree or into a shadow root, even one in the document: nothing in the inserted tree changes, a shadow root's changes reach no observation of the document, and only an observation of the tree it enters would report the insertion, a tree no watch can know of beforehand. `parent`, `root`, `attached` and `shadow.elements` are partly observable for that change alone, and a watch of one sees the tree a receiver entered at the next evaluation another change or a refresh causes, observing that tree from then on. A detached tree inserted into the document, a node moved within or between trees a watch observes, and a detached node another document owns, as a template's content does, inserted into the document are each observed.

## Null

Null answers both "there is no such value", as when `closest` finds no element, and "the value is unavailable", as when an element has no layout to measure. One null for both keeps results simple, at the cost of telling the two apart; a member whose consumers need the difference offers it separately, as `attached` says whether an element is still attached to the document.

An optional access of null is null and ends its chain, a coalescing operator answers its fallback for it, so a chain that meets null answers null from there on, and a mistake is always an error:

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
| A cast to a type that is no node, or of a target that can never be of its type | A validation error naming the types |
| A node a strict cast rejects, or a value a conversion rejects | An evaluation error naming what was rejected; null under `try` |
| An equality of two values whose types fit neither way, or of a value that is no string, number, Boolean or node with one that is not null | A validation error naming the types, and the test to write where a value is compared with the name of one of its Boolean members |
| An operand of `and`, `or` or `not`, a condition or a conditional binding of what is no value | A validation error naming what it is |
| An arithmetic operand that can be null, or that is no number | A validation error naming the operand, and the fallback to give it |
| A division or a remainder by zero, or an arithmetic result no finite number holds | An evaluation error at the operation |
| An `and` or an `or` whose operands give values no one type holds | A validation error naming them, and the conditional to write where null is an acceptable alternative |
| Branches of different types | A validation error naming the types |
| A receiver, an argument, an expression or a binding of the wrong type, an argument of the wrong kind, or a missing required one | A validation error naming where, the expected type and the type found |
| A module returning a value of a type other than the one it declared | An evaluation error |
| A result that would contain a node or an event source | A validation error |
| A request used as another kind: reading or watching an event source, subscribing to a value, running a query, or reading an action or a behavior | A validation error |
| An action or a behavior inside a query, an argument or another request's object expression | A validation error |
| Watching a partly observable member without accepting partial observation | A validation error naming each such member by the type its declaration is for, as `shadow.root` and `node.root` are, and the changes it misses |
| A member failing unexpectedly while it evaluates | An evaluation error |

A query is validated before any evaluation, as the section on validation sets out. An evaluation error fails the whole result, and the caller receives the error in its place.

## Built-in vocabulary

The built-in vocabulary exposes properties and operations over familiar browser concepts. Properties and operations are named in camelCase. Names are case-sensitive. Measurements use CSS pixels unless stated otherwise. Built-in members expose state or event sources; actions and behaviors come from extensions.

A property of a structured value, such as a rectangle's `width`, reads data the value holds and is constant for that value. A property is read by member access, and an operation is written as a call or as a named indexer, as its declaration says; the tables write each as it is written, with a receiver left out. A member available on a node is available on each of its kinds, one available on an element on elements alone, and one available on a shadow view on an element's `shadow`.

### Properties

A property exposes a value, read by member access, and takes no argument. Each property states what it answers, how its result changes, and how it reads, as the section on evaluation defines.

| Available on | Property | Type | Answers | Changes | Reads |
| --- | --- | --- | --- | --- | --- |
| Window | `size` | `size` | The layout viewport's `width` and `height` | Observable | Fresh |
| Window | `devicePixelRatio` | `number` | Device pixels per CSS pixel | Observable | Fresh |
| Element | `rect` | `rectangle?` | Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to the layout viewport | Partly observable: its own size, the scrolling of its scroll containers, the window's size and the structure of the trees it is in are observed; a move none of them causes, as a sibling before it growing or a margin or padding around it changing, and transforms and animations, are not | Fresh |
| Element | `size` | `size?` | Its border box's `width` and `height` | Observable | Fresh |
| Element | `clientSize` | `size?` | Its padding box's `width` and `height`, without scrollbars | Partly observable: its border box and its content box are observed, so a scrollbar appearing or going and a border changing are; a border and padding changing by the same amount, which leaves both as they were, is not | Fresh |
| Element | `grid` | `grid?` | Its grid's `columns`, the sizes of its column tracks, an empty list for an element that is no grid, and null while it has no layout box | Partly observable, as `style` | Fresh |
| Element | `selection` | `selection?` | Its selection's `start` and `end`, null for an element that is no text input or text area | Partly observable: input and selection events are observed, assignments by script are not | Fresh |
| Node | `children` | `list<element>` | Its child elements, in document order | Observable | Fresh |
| Node | `parent` | `node?` | Its parent in the DOM tree: a shadow root for the nodes directly in it, and null for a document, a document fragment, a shadow root and the topmost element of a detached tree, so it never crosses a shadow boundary | Partly observable: its detached tree inserted into another detached tree or into a shadow root is not observed | Fresh |
| Node | `root` | `node` | The root of its tree: the document, a document fragment, the shadow root it is in, or the topmost element of a detached tree | Partly observable, as `parent` | Fresh |
| Node | `host` | `element?` | A shadow root's host, and null for any other node | Constant | Fresh |
| Element | `shadow` | `shadow` | Its view of its shadow relationships | Constant | Fresh |
| Element | `aria` | `aria` | Its view of its ARIA states, whose [conditions](#conditions) `is` tests and whose default indexer reads its ARIA attributes | Constant | Fresh |
| Shadow view | `root` | `shadowRoot?` | The open shadow root its element hosts, null where it hosts none or a closed one | Partly observable: a root attached as its element connects to its document is observed, one attached at any other time is not | Fresh |
| Shadow view | `elements` | `list<element>?` | The elements its slot shows, flattened, as the section on shadow trees sets out, and null for an element that is no slot | Partly observable: assignment, the fallback and the slot's moves are observed; its detached tree inserted into a shadow tree that assigns it nothing is not | Fresh |
| Element | `attached` | `boolean` | Whether the element is attached to the document, including through a shadow root | Partly observable: the structure of the document and of every shadow root between the element and the document is observed; its detached tree inserted into a shadow root in the document is not | Fresh |
| Element | `hasChildren` | `boolean` | Whether it has at least one child element | Observable, through its child list | Fresh |
| Element | `hasSelection` | `boolean` | Whether a selection of at least one character lies within it: a non-collapsed selection in a text input or text area, or a non-collapsed document selection within its content; a collapsed caret is no selection | Partly observable: input and selection events are observed, assignments by script are not | Fresh |
| List | `count`, `first`, `last` | `number`, `T?`, `T?` for a `list<T>` | The number of items, the first item and the last item, null where a list has none | As their items | As their items |

### Operations

An operation performs a lookup, a calculation or a selection with the argument it is given. A name with parentheses, as `closest(selector)`, is a call, `self.closest(".row")`; a name in brackets after a colon, as `:attribute[name]`, is a named indexer, `self:attribute["data-key"]`; and braces show an options object, whose fields supply the parameters, as `intersects({ root, margin })` does, `self.intersects({ root = panel })`. Each operation states what it answers, how its result changes, how it reads, and which of its parameters are fixed.

| Available on | Operation | Type | Answers | Changes | Reads | Fixed |
| --- | --- | --- | --- | --- | --- | --- |
| Window | `:media[query]` | `query`: `string` → `boolean` | Whether the media query matches | Observable: the query's matching, as the browser reports it changing | Fresh |  |
| Element | `:attribute[name]`, the default indexer, `:[name]` | `name`: `string` → `string?` | The attribute's value | Observable | Fresh |  |
| ARIA view | `:attribute[name]`, the default indexer, `:[name]` | `name`: `string` → `string?` | The value of the element's own attribute `aria-` and the name, as the element's `:attribute` reads it, so `self.aria:["checked"]` is `self:["aria-checked"]`: the string as written, or null where the attribute is absent, never a Boolean | Observable: that attribute | Fresh |  |
| Element | `:class[name]` | `name`: `string` → `boolean` | Whether its class list holds the class, one token: an empty name, or one holding a tab, a line feed, a form feed, a carriage return or a space, is an evaluation error | Observable: its `class` attribute | Fresh |  |
| Any | `is(name)`, `has(name)`, `supports(name)` | `name`: `string` → `boolean` | Whether the condition of the name its verb asks holds for the receiver, as [conditions](#conditions) set out | As the condition | As the condition | `name` |
| Element | `:style[property]` | `property`: `string` → `string?` | The property's computed value, custom properties included | Partly observable: its own size and attributes are observed, rules matching from elsewhere are not | Fresh |  |
| Element | `intersects({ root, margin })` | optional `root`: `element?`, the window when omitted or null; optional `margin`: `number`, 0 when omitted → `boolean?` | Whether the browser's intersection observation reports it intersecting the root, or the window without a root, grown by the margin, with its ancestors' clipping applied as the browser applies it | Observable | Maintained |  |
| Element | `overlaps({ other, margin })` | required `other`: `element`; optional `margin`: `number`, 0 when omitted → `boolean?` | Whether its border box overlaps the other's, grown by the margin, compared as rectangles | Partly observable, as `rect` | Fresh |  |
| Element | `matches(selector)` | `selector`: `string` → `boolean` | Whether it matches the selector | Partly observable: attributes, structure, focus and popovers opening and closing, `:popover-open`, are observed; pointer state such as `:hover` and control state such as `:checked` are not | Fresh |  |
| Element | `rectRelativeTo(relativeTo)` | `relativeTo`: `element` → `rectangle?` | Its border box's `left`, `top`, `right`, `bottom`, `width` and `height`, relative to `relativeTo`'s border box | Partly observable, as `rect`, and the size of `relativeTo` | Fresh |  |
| Element | `closest(selector)` | `selector`: `string` → `element?` | The nearest matching ancestor, itself included | Partly observable, as `matches` | Fresh |  |
| Node | `first(selector)`, `all(selector)` | `selector`: `string` → `element?`, `list<element>` | The first matching descendant, and the matching descendants in document order, within its own tree | Partly observable, as `matches` | Fresh |  |
| List | `:item[index]`, the default indexer, `:[index]` | `index`: `number` → `T?` | The item at the index, counted from zero, null for an index past the end, a negative one, which never counts from the end, and a fractional one; `-0` is `0` | As its items | As its items |  |
| List | `max(expression)`, `min(expression)`, `sum(expression)` | `expression`: `T` → `number?`; answers `number?`, `number?`, `number` | An aggregate over a number expression, as the section on lists defines | As their items and expressions | As their items |  |
| List | `where(expression)` | `expression`: a predicate of `T`; answers `list<T>` | The items for which the predicate is truthy | As its items and expression | As its items |  |

### Conditions

A condition is a Boolean question of its receiver, under a name of its own, asked with one of three verbs, each an ordinary call: `is` asks a state the user, the browser or the page sets and clears over time, `self.is("checked")`; `has` a possession or a presence, `self.has("focus")`; and `supports` a capability, `window.supports("share")`. Each condition is asked with its one verb, so none stands in for another, and asking it with another is a validation error giving the verb to write, as `self.is("focus")` is. A Boolean that follows from the receiver's structure, or from another member's value, is a property of it, as `attached`, `hasChildren` and `hasSelection` are.

- **Each condition is a declaration of its own,** with the receivers it applies to, the function that tests it, how it changes, how it reads, the changes it misses where it is partly observable, and the observations that cover it. A test of a condition follows the condition's contract alone, so a watch of one partly observable condition needs partial observation accepted, and a watch of others does not.
- **The name is fixed,** as a [fixed argument](#arguments) is: a string the query's preparation settles, from literals and bound parameters, which selects the condition's declaration when the query is prepared.
- **Its receivers are the condition's.** Each verb is declared on any receiver, which says only that any receiver can be asked: the condition of the name decides which receivers it applies to, so a name no condition has is a validation error naming the conditions the vocabulary declares, and a condition of other receivers is one naming the condition, the receiver and the conditions the receiver has.
- **It is a call as any other.** `.` requires a receiver that cannot be null, and `?.is(…)` answers null for a null receiver without testing its condition; either is validated as written, its name included, whatever its receiver is when it is evaluated.
- **Its type is a Boolean that cannot be null,** made nullable where `?.` reads a receiver that can be. A condition whose function answers anything else, or throws, fails the evaluation with an evaluation error that names the condition, `is` and the module that declares it.
- **Conditions compose as Booleans do:** `self:class["open"] and self.has("focus-within")`.

The built-in vocabulary declares these conditions, each asked with `is` but where the table names its verb, and each with its native semantics: what the browser itself decides, as its pseudo-class matches, as the document reports its own state, or as the browser offers an API.

| Receiver | Condition | True where | How it changes | Reads |
| --- | --- | --- | --- | --- |
| Element | `disabled` | The element matches `:disabled`, as the browser decides it: by its own `disabled` attribute, a disabled ancestor `fieldset` other than through that fieldset's first `legend`, or a disabled `optgroup` holding an `option`; whether it carries a `disabled` attribute is `self:["disabled"]`, a separate question | Observable: its own and its ancestors' `disabled` attributes and the structure between them | Fresh |
| Element | `readonly` | Native `readonly` applies to the control and is set: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password`, `date`, `month`, `week`, `time`, `datetime-local` or `number`; any other element answers false, whatever its attributes | Observable: its `readonly` and `type` attributes | Fresh |
| Element | `text-editable` | The element supports text editing and its current state permits it: a text area, or an input whose type is `text`, `search`, `url`, `tel`, `email`, `password` or `number`, that is neither disabled nor read-only; or an element whose content is editable, by its own or an ancestor's `contenteditable` of `true` or `plaintext-only`, or by the document's design mode. An element with the `inert` attribute, itself or on an ancestor in the flat tree, which goes from each node to the slot it is assigned to, or otherwise to its parent, and from a shadow root to its host, is not text editable: this is the attribute's inertness, so the inertness a modal dialog gives the rest of the document does not count, and a slot in a closed shadow root hides an inert ancestor past it unless the element is inside that root | Partly observable: everything `disabled` observes, the `readonly` and `type` attributes, the `contenteditable` attributes of the element and its ancestors, the `inert` attributes along its flat tree, and the structure and slot assignments between them are observed; the document's design mode is not | Fresh |
| Element | `focus`, asked with `has` | It is the focused element of its tree | Observable: focus moving, and the focused element removed, which moves focus away | Fresh |
| Element | `focus-within`, asked with `has` | It matches `:focus-within`: it or an element within it is focused, across the shadow trees it hosts | Observable, as `focus` is | Fresh |
| Element | `hover` | It matches `:hover`: the pointer is over it or over an element within it | Partly observable: the pointer moving over and off elements is observed; an element moving under a pointer that does not move is missed where the browser fires no pointer event for it, which Chromium does | Fresh |
| Element | `popover-open` | It matches `:popover-open`: it is a popover that is showing | Observable: its showing and hiding, its `popover` attribute removed and its removal included | Fresh |
| Element | `checked` | It matches `:checked`: a checked checkbox or radio button, or a selected option | Partly observable: the user's input in its tree, a radio button another of its group unchecks and an option its select changes included, form resets, the `checked` and `selected` attributes and the structure of its tree are observed; a script setting `checked` or `selected`, or a select's `value` or `selectedIndex`, fires no event and is not | Fresh |
| Document | `visible` | The document is visible | Observable | Fresh |
| Document | `focus`, asked with `has` | Focus is anywhere within the document | Observable | Fresh |
| Window | `share`, asked with `supports` | The browser offers the Web Share API, `navigator.share`, in this context; it says nothing of whether a particular share succeeds, which takes the user's activation, data the browser can share and the user's choice | Constant | Fresh |
| Window | `clipboard`, asked with `supports` | The browser offers the asynchronous clipboard, `navigator.clipboard`, which it does in a secure context alone; it says nothing of whether reading or writing is permitted, which the user and the browser decide when it is asked | Constant | Fresh |

A condition's ARIA counterpart is no part of it: `self.is("checked")` is what `:checked` matches, whatever `aria-checked` says. An element's ARIA states are conditions of its ARIA view, `self.aria`, a value of the type `aria`, which has no data form, so a result never holds one, and `self.aria.is("checked")` tests one. Each reads the element's own attribute under a contract of its own, falling back on no native state, and observes that attribute:

| Receiver | Condition | True where | How it changes | Reads |
| --- | --- | --- | --- | --- |
| ARIA view | `checked` | The element's own `aria-checked` is `true`, compared ignoring ASCII case; a missing attribute, `false`, `mixed`, the empty string and any other value, padded with spaces included, answer false | Observable: its `aria-checked` attribute | Fresh |
| ARIA view | `disabled` | The element's own `aria-disabled` is `true`, compared as `checked` compares; an ancestor's `aria-disabled` is not read | Observable: its `aria-disabled` attribute | Fresh |

So `self.is("checked") or self.aria.is("checked")` is whether either says checked, and `self.aria:["checked"] == "mixed"` tells a mixed state, which an ARIA condition answers false for, from the others. The ARIA view's default indexer reads the attribute written on the element, as `self:["aria-checked"]` does, and never the element's effective accessibility state. No other ARIA attribute is a condition until one is declared, each with a contract of its own, since not every ARIA attribute is a Boolean.

### Built-in conversions

The built-in vocabulary declares four conversions, each rejecting a value it cannot convert:

| From | To | Converts |
| --- | --- | --- |
| `string` | `number` | HTML's valid floating-point syntax after trimming: the ASCII whitespace at either end, tab, line feed, form feed, carriage return and space, is removed, and the whole of what remains is an optional `-`, digits with an optional fraction, or a fraction alone, and an optional exponent, `e` or `E` with an optional sign, so `"-12"`, `" 3.5 "`, `".5"` and `"1e3"` convert; empty text, `"+1"`, `"1."`, `"0x10"`, `"Infinity"` and `"12px"` fail, as does a number too large to be finite, `"1e999"` |
| `number` | `string` | The shortest decimal text that reads back as the same number, as ECMAScript's `Number::toString` writes it, in exponent form from `1e21` up and below `1e-6`, as `"1e+21"` and `"1e-7"`; negative zero is written `"0"`, the one number that does not read back as itself. Every number of DOMQL is finite |
| `boolean` | `string` | `"true"` or `"false"` |
| `string` | `boolean` | `"true"` and `"false"`, exactly; any other text fails, `"TRUE"`, `"1"` and `" true"` among them |

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

An event is captured as the members its type declares when it is dispatched. A member the event carries no value of its type for is null where its type is nullable, as `domEvent`'s `target` is for a scroll or a resize that targets the document or the window, and `pointerEvent`'s `pointerType` for a browser that dispatches a click as a mouse event; where its type is not nullable, the capture fails, and the subscription reports it as it reports a failed object expression. `on` listens passively, so it never delays or prevents what the page does with an event.

`self.has("focus")` asks whether the element itself is focused, `self.has("focus-within")` whether focus is anywhere within it, and an extension can offer richer focus semantics under names of its own; they are separate questions with separate names.

`readonly` and `text-editable` are separate questions too, and neither is the other's opposite:

| Element | `readonly` | `text-editable` |
| --- | --- | --- |
| An enabled, writable text input | false | true |
| A read-only text input | true | false |
| A disabled text input without `readonly` | false | false |
| An ordinary static element | false | false |
| An editable content region | false | true |

### Access by name

An access by name reads the property a name names, the name written as an expression in brackets: `self["rect"]` and `self.rect` resolve the same member, with its one implementation, type, null behavior and observation sources, and `self[name]` reads the one the bindings name.

```domql
target {
    let name = if wide then "size" else "clientSize",

    bounds = self["rect"],
    chosen = self[name],
    named = self[property ?? "size"]
}
```

- **The names.** Preparation determines every name the expression can give through these forms alone, applied recursively: a string literal; `null`; a bound parameter, whose value is settled then; a local whose value is one of these forms; a conditional binding's name, whose names are its value's without null; a conditional whose branches are; a coalescing operator whose sides are, whose names are its value's and, where its value can be null, its fallback's; and an `and` or an `or` whose operands are, whose values are the falsey part, for `and`, or the truthy part, for `or`, of each operand before its last, and its last's, as evaluation gives them, so `self[wide and "size" or "rect"]` reads one of the two, and the falsey part of an `and`'s operand that names nothing is told from its type, as `self.first(".a") and "size"` gives null or a name. A test or an operand whose value is fixed decides when the query is prepared, so a branch, a fallback or an operand evaluation would not reach gives no name, while a test decided only when the query is evaluated leaves both branches' names possible, of which evaluation reads the one it selects; a value that can be false or that is no string is a validation error as null is. Every branch, fallback and operand is validated as it is everywhere, its syntax and its types, whether or not its names are determined, so `self["size" ?? self:["x"]]` reads `size` and leaves the fallback's names unasked, never evaluating or observing it. An `and` or an `or` takes part only where it types, so a Boolean beside a name, `self[self.attached and "size" or "clientSize"]`, is refused, since no type holds false and a string, and the choice is written as a conditional, `self[if self.attached then "size" else "clientSize"]`. The whole expression must give a string, null allowed only where an expression removes it, as `property ?? "size"` does where `property` is bound to null. Any other expression, such as `self[self:["data-name"]]`, is a validation error that says its names cannot be determined.
- **Validation and type.** Every name it can give is a property of the receiver, and their types are of one type, as a conditional's branches are, so `self[name]` above is a `size?`. A resolution is kept for the strings a query's bindings bind, so a name bound anew is resolved anew.
- **Evaluation.** The name is computed once, and the property it selects is read. `[…]` requires a receiver that cannot be null, as `.` does, and `?[…]` answers null for one that is, without evaluating the name; on a receiver of unknown type, the names are still determined when the query is prepared, and whether each is a property is checked once its type is known.
- **Observation.** A watch follows what the name read and the property it selected, so a change to either evaluates the query again and the selection can switch.
- **One property.** A name names one property, as `.` does: `self["grid.columns"]` names no property, an operation is reached through a call, and indexing a list by number is its default indexer, `list:[2]`.
- **Fields.** A field holding an access by name is named as every field is, `bounds = self["rect"]`, and a string literal that is a name is the name itself, so `self["rect"]` has the definition of `self.rect`.

## Extensions

An extension adds members under one name of its own, a member of a built-in type whose value carries the extension's members: `viewport.scroll({ axis = "inline" })` is a scroll extension's view of an element along an axis, and `canScrollForward` is one of its members. The name is the extension's namespace: a member it declares on a type it does not own is named for the extension, so extensions never collide with each other or with the built-in vocabulary, and on a type of its own it names its members freely, a name another member already answers on the same receiver being refused. Its states follow the same rule: on a type it does not own it declares a single state named for itself, and on its own types it names them freely, a name another state already has for the same receivers being refused.

The built-in vocabulary declares the native event types its callers need, and an extension can declare more. A subscription observes an event as it reaches its target and leaves its course to the page.

An extension can define types of its own, named indexers, conditions, event sources, actions and behaviors, and conversions to and from its own types, one for each source type and target, and follows the built-in vocabulary's contract throughout: every member declares its signature, its argument kinds, its result type and how it changes, and evaluating a query stays read-only and synchronous.

## Definition

A query's **definition** is a JSON document recording its meaning: every query, parsed from text or created directly, is one definition, and preparation, validation and evaluation work on the definition alone. It records what the text means, never its punctuation, and comments, commas and layout leave no trace in it.

A document holds the definition's `version` and the `query` node. The version changes whenever the definition's shape or meaning does, and a definition of a version other than the one an implementation reads is a structure error. Each node is an object whose `kind` says what it is:

| Kind | Properties | Records |
| --- | --- | --- |
| `literal` | `value`, a JSON string, number, Boolean or null | A literal |
| `parameter` | `name` | A parameter, the caller's binding of the name, the roots `document` and `window` included; it stands nowhere a local of its name is in scope, which text would read instead |
| `self` | None | The current value |
| `local` | `name` | A use of a local |
| `member` | `name`, the member's name, or for an access by name whose expression is no string literal that is a name, that expression's node; `target`, the receiver; and `optional`, true, where it is written with `?.` or `?[` | A member access, or an access by name |
| `call` | `name`; `argument`, its one argument, where it is given one; `target`, the receiver; and `optional`, true, where it is written with `?.` | A call |
| `indexer` | `name`, left out for the default indexer; `argument`, its key; `target`, the receiver; and `optional`, true, where it is written with `?:` | A named indexer, or the receiver's default indexer |
| `object` | `fields`; `locals`, where it has any; and `target`, the node the object expression follows | An object expression; without a target, one keeping the current value around it, which at the top level is absent |
| `equality` | `left` and `right`, the two expressions it compares | An equality; `!=` is a `not` holding one |
| `conditional` | `condition`, the expression it tests, or `binding`, the `name` it binds and the `value` it binds to it, one of them; and `consequent` and `alternative`, two expressions | A conditional, `if let` holding a binding; an `elseif` is a conditional nested in the alternative before it |
| `coalescing` | `value` and `fallback`, two expressions | A coalescing operator |
| `cast` | `type`, the name of the type it casts to, and `target`, the expression it casts | A cast |
| `conversion` | `type`, the name of the type it converts to, and `target`, the expression it converts | A conversion |
| `try` | `target`, the conversion or the cast it attempts | An attempt |
| `optionalChain` | `target`, the chain it holds | An optional chain: the chain of member accesses, calls and object expressions whose optional accesses end at it, holding at least one |
| `and`, `or` | `operands`, two or more expressions | A logical expression |
| `not` | `operand`, the expression it negates | A negation |
| `arithmetic` | `operator`, one of `+`, `-`, `*`, `/` and `%`, and `left` and `right`, its operands | An arithmetic operation |
| `negate` | `operand`, the number it negates | A negation of a number; a numeric literal negated is the negative literal |

An expression group adds no node, the expression it holds standing in its place, and neither does an optional-access group, whose accesses are recorded as optional and its optional chain where it ends, so `panel.attached and (panel.is("disabled"))` is an `and` of two member accesses:

```json
{
  "kind": "and",
  "operands": [
    { "kind": "member", "target": { "kind": "parameter", "name": "panel" }, "name": "attached" },
    { "kind": "member", "target": { "kind": "parameter", "name": "panel" }, "name": "disabled" }
  ]
}
```

Every member access, call and indexer holds its receiver as its `target`, and every equality its `left` and its `right`, required, and an omitted target never stands for `self`, so `self.size` and `panel.size` are distinct definitions. A call's or an indexer's `argument` is one node, recorded as written; where its member takes options, it is an object node whose fields resolution maps onto the member's parameters. A field is an object holding its `name` and its `value` node, both required; an object expression's fields keep their order, and an object expression holds at least one. A local is an object of the same two properties, and an object expression's locals keep their order, its definition leaving `locals` out where it has none.

`panel { size = self.size, hasFocus = self.has("focus-within") }` has this definition:

```json
{
  "version": 20,
  "query": {
    "kind": "object",
    "target": { "kind": "parameter", "name": "panel" },
    "fields": [
      { "name": "size", "value": { "kind": "member", "target": { "kind": "self" }, "name": "size" } },
      {
        "name": "hasFocus",
        "value": {
          "kind": "call",
          "target": { "kind": "self" },
          "name": "has",
          "argument": { "kind": "literal", "value": "focus-within" }
        }
      }
    ]
  }
}
```

A chain is recorded as a succession of targets: in `panel.all("li").count`, `count` is a member access whose target is the call `all`, whose target is the parameter `panel`. A chain that holds an optional access is the target of an `optionalChain` node, which records where its short-circuit ends, so `panel.parent?.children.count`, one optional chain, and `(panel.parent?.children).count`, a member access of one, are distinct definitions.

A definition names its parameters and never holds their values. An element is bound to its name when the query is created, through whatever mechanism the caller's environment offers, so the same definition serves every binding.

### Validation

A query is validated in two stages, both before any evaluation.

- **Structure,** when the query is created: the definition follows the node structures and structural validation rules this specification defines, which need no vocabulary: every field with its name, unique within its object expression; every local with its name, which no other local in scope where it is written has, and none named `document` or `window`; no parameter where a local of its name is in scope, nor before a local of its name declared later in its scope; no object expression without a field; every member access, call and indexer with its receiver, and every equality with both of its operands; every optional access within an optional chain, through the targets of member accesses, calls and object expressions alone, and every optional chain holding one; no `self` at the top level, nor in a field of an object expression there, since there is no current value for it to stand for; every `and` and `or` of two or more expressions; every arithmetic node with one of its operators and both operands, and every `negate` with its operand; every coalescing with its value and its fallback; every cast with a string type and a target its grammar takes, `self`, a parameter, a local, a literal, an object expression following nothing, a member access, a call, an optional chain, a coalescing operator or another cast; and no binding supplied under the name `document` or `window`. Text that does not follow the syntax fails here as a syntax error.
- **Vocabulary,** when the query is prepared: every member and extension exists and is written in the form its declaration takes, every argument supplies its member's input, directly or as an options object whose fields name its parameters, every receiver, argument, expression and binding has the type its signature declares and every argument its kind, every access and call written with `.` has a receiver that cannot be null, every fixed argument is a literal, a bound parameter or a local whose value is one of them, every access by name gives names determined when the query is prepared, each a property of its receiver and all of one type, every local a name uses is in scope where it is used, is a value and stands in no options object, every cast names `node` or one of its kinds and has a target that can be of it, the operands of every equality are of types that fit one way or the other, one of them null where either is no string, number, Boolean or node, every operand of `and` and `or`, what every `not` negates and every condition is a Boolean that cannot be null, the value and the fallback of every coalescing operator are values of one type, the branches of every conditional are of one type, every expression is valid in the context its member declares, the request is used as its kind, the result holds only data, and a watch's members can be watched.

A failure in either stage names where it is: its position in the text, or its node's location in the definition, as a JSON Pointer.

## What a query runs against

A query is evaluated against a document, with each parameter it names bound to something in that document or to plain data. `panel` is not found by the query: it stands for the element the caller bound under the name `panel`, which is how a query reaches a particular element without a selector for it. A query that names `panel` and `sentinel` is given those two elements, and fails to prepare when either is not bound. The roots `document` and `window` need no binding, since they are always the document being queried and its window.

Conceptually, a caller supplies the query's text and the bindings, and gets back a result shaped like the query:

```text
result = evaluate(query, bindings: { panel: <the list panel>, sentinel: <the end marker> })
```

The bindings name only what the caller chooses. The complete query below also uses `document` and `window`, which are absent from them because they are the document the query runs against and its window, so no caller chooses them and none can bind them.

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

```domql
/* A list panel, its items and the window around it. */
{
    // The panel's items, read once for the fields that use them.
    let items = panel.all("[data-key]"),

    // The panel itself.
    panel = panel {
        size = self.size,
        hasFocus = self.has("focus-within"),
        tier = self:style["--layout-tier"],
        columns = self.grid?.columns.count
    },

    // Every item, and the items in the panel's view.
    items = items {
        key = self:["data-key"],
        height = self.rect?.height,
        selected = self.aria:["selected"] == "true"
    },
    inView = items.where(self.intersects({ root = panel })).count,
    tallest = items.max(self.rect?.height),

    // Whether the end of the list is near, and which item is selected.
    nearEnd = sentinel.intersects({ root = panel, margin = 200 }),
    current = panel.first("[aria-selected=true]")?:["data-key"],

    // The window around it.
    window = window { size = self.size, dark = self:media["(prefers-color-scheme: dark)"] },
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

With no item selected, `current` is null. With an empty panel, `items` is an empty list, `inView` is 0, and `tallest` and `current` are null. Watching the query requires accepting partial observation, since `matches`, `style`, `grid`, `rect`, `all` and `first` are partly observable; the watch then follows the items the panel holds, each item's height, attributes and intersection, the panel's size and focus, the sentinel's intersection, the media query and the document's visibility.

## Examples

| Asks | Query |
| --- | --- |
| Whether an element is near the end of a scrolling panel | `sentinel.intersects({ root = panel, margin = 200 })` |
| How many items of a list are in its view | `list.all("li").where(self.intersects({ root = list })).count` |
| A layout tier a container query sets | `header:style["--layout-tier"]` |
| How many columns a grid lays out | `cards.grid?.columns.count` |
| A table's tallest row | `table.all("tbody tr").max(self.rect?.height)` |
| Each column's key and width | `table.all("[data-column]") { key = self:["data-column"], width = self.rect?.width }` |
| A panel's size, and whether focus is within it | `panel { size = self.size, hasFocus = self.has("focus-within") }` |
| A text field's selection | `field.selection { start = self.start, end = self.end }` |
| Whether sharing is available | `window.supports("share")` |
| The ids of the text-editable elements in a panel | `panel.all("*").where(self.is("text-editable")) { id = self:["id"] }` |
| An element's states and what it holds | `target { attached = self.attached, disabled = self.is("disabled"), hasChildren = self.hasChildren, hasSelection = self.hasSelection }` |
| Whether a control cannot take text | `input.is("disabled") or input.is("readonly")` |
| A control's state, one word | `input { state = if self.is("disabled") then "locked" elseif self.is("readonly") then "read" else "open" }` |
| Whether an element has no parent | `panel.parent == null` |
| The width of an element's parent element, null where the parent is none or no element | `(try panel.parent as "element")?.rect?.width` |
| A list's size and its tallest item, the list read once | `panel { let items = self.all("[data-key]"), count = items.count, tallest = items.max(self.rect?.height) }` |
