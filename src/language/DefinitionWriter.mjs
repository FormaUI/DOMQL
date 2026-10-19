/**
 * DefinitionWriter — a definition's node as the DOMQL text that writes it, parenthesized where its grouping needs it: on one line, as a diagnostic quotes it, or laid out on lines, as formatting gives its canonical text
 */

import { Names } from './Names.mjs';

/** The escape the canonical text writes for each character it escapes with a letter or the character itself; any other character it escapes it writes as a Unicode escape. */
const ESCAPED = Object.freeze({ '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\u001B': '\\e' });

/** The characters the canonical text escapes: a double quote, a backslash, and every character that shows nothing of itself, a control, a format, a line or paragraph separator, or a space separator but the space. */
const ESCAPED_CHARACTERS = /["\\\p{Cc}\p{Cf}\p{Zl}\p{Zp}]|(?! )\p{Zs}/gu;

/** How tightly each kind of expression binds, the loosest lowest: one written where a tighter one stands is parenthesized. An optional chain is a cast's target as it is, and is grouped where a chain continues from it, since its short-circuit ends where it does. */
const PRECEDENCE = { conditional: 0, body: 0, do: 0, function: 0, coalescing: 1, or: 2, and: 3, not: 4, equality: 5, comparison: 5, additive: 6, multiplicative: 7, negate: 8, try: 9, conversion: 10, cast: 11, optionalChain: 12 };

/** How tightly a chain binds that no optional chain holds: a property access, a call, an indexer, an object expression, `context`, a local, a literal or a parameter. */
const CHAIN_PRECEDENCE = 13;

/** The indentation of one level of an object expression laid out on lines. */
const INDENTATION = '    ';

export class DefinitionWriter {
    /**
     * The text that writes the node on one line.
     * @param {object} node A node of a definition.
     */
    static write(node) {
        DefinitionWriter.#markQueryParameters(node, new Set(), new Set());

        return DefinitionWriter.#write(node, null);
    }

    /**
     * The canonical text of the node, laid out on lines: an object expression of one field and no locals, whose value is on one line, stays on one line, and any other has a line for each entry, indented a level; a conditional with an `elseif` has a line for each clause.
     * @param {object} node A node of a definition.
     */
    static format(node) {
        DefinitionWriter.#markQueryParameters(node, new Set(), new Set());

        // A query that is a body writes its bindings and its return alone, which a do block elsewhere encloses.
        return node.kind === 'body' ? DefinitionWriter.#bodyText(node, 0) : DefinitionWriter.#write(node, 0);
    }

    /**
     * The text that writes the node: on one line where the level is null, and otherwise laid out on lines, its line beginning at the level's indentation.
     * @param {object} node
     * @param {number | null} level
     */
    /** The parameters a name written alone would not read: those a reserved word names, and those a local of their name stands in scope of or is declared after in their scope, which the text writes with `~`. @type {WeakSet<object>} */
    static #queryParameters = new WeakSet();

    /** Marks each parameter in the node that the text writes with `~`, one a reserved word names or a local or a field in scope hides, following the locals and the fields each object expression and the name each conditional binding brings into scope, and those declared later in it. */
    static #markQueryParameters(node, inScope, later) {
        if (Array.isArray(node)) {
            node.forEach(item => DefinitionWriter.#markQueryParameters(item, inScope, later));

            return;
        }

        if (node === null || typeof node !== 'object') {
            return;
        }

        switch (node.kind) {
            case 'parameter':
                if (Names.isReservedWord(node.name) || inScope.has(node.name) || later.has(node.name)) {
                    DefinitionWriter.#queryParameters.add(node);
                }

                return;
            case 'object': {
                DefinitionWriter.#markQueryParameters(node.target, inScope, later);

                const names = (node.locals ?? []).map(local => local.name);
                let scope = inScope;

                node.locals?.forEach((local, index) => {
                    DefinitionWriter.#markQueryParameters(local.value, scope, new Set([...later, ...names.slice(index)]));
                    scope = new Set([...scope, local.name]);
                });
                // A field is in scope after its value, through the fields after it.
                node.fields.forEach(field => {
                    DefinitionWriter.#markQueryParameters(field.value, scope, later);
                    scope = new Set([...scope, field.name]);
                });

                return;
            }
            case 'function':
                DefinitionWriter.#markQueryParameters(node.body, new Set([...inScope, ...node.parameters]), later);

                return;
            case 'body': {
                const names = node.locals.map(local => local.name);
                let scope = inScope;

                node.locals.forEach((local, index) => {
                    DefinitionWriter.#markQueryParameters(local.value, scope, new Set([...later, ...names.slice(index)]));
                    scope = new Set([...scope, local.name]);
                });
                DefinitionWriter.#markQueryParameters(node.result, scope, later);

                return;
            }
            case 'conditional':
                if (node.binding !== undefined) {
                    // A binding's value reads no name of its own, which a text writes with `~` for the caller's binding, as a local's value does.
                    DefinitionWriter.#markQueryParameters(node.binding.value, inScope, new Set([...later, node.binding.name]));
                    DefinitionWriter.#markQueryParameters(node.consequent, new Set([...inScope, node.binding.name]), later);
                    DefinitionWriter.#markQueryParameters(node.alternative, inScope, later);

                    return;
                }
                break;
            default:
                break;
        }

        Object.values(node).forEach(value => DefinitionWriter.#markQueryParameters(value, inScope, later));
    }

    static #write(node, level) {
        switch (node.kind) {
            case 'literal':
                return DefinitionWriter.#literal(node.value);
            case 'parameter':
                return DefinitionWriter.#queryParameters.has(node) ? `~${node.name}` : node.name;
            case 'context':
                return 'context';
            case 'root':
                return node.name;
            case 'local':
                return DefinitionWriter.#reference(node.name);
            case 'member':
                return typeof node.name === 'string'
                    ? `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${DefinitionWriter.#dot(node)}${node.name}`
                    : `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${node.optional === true ? '?' : ''}[${DefinitionWriter.#write(node.name, level)}]`;
            case 'call':
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${DefinitionWriter.#dot(node)}${node.name}(${DefinitionWriter.#arguments(node, level)})`;
            case 'indexer':
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${node.optional === true ? '?:' : ':'}${node.name ?? ''}[${DefinitionWriter.#write(node.argument, level)}]`;
            case 'optionalChain':
                return DefinitionWriter.#write(node.target, level);
            case 'equality':
                return DefinitionWriter.#equality(node, '==', level);
            case 'interpolatedString':
                return DefinitionWriter.#interpolatedString(node);
            case 'comparison':
                // A chain is written as one, an operator between each two of its operands.
                return node.operands.map((operand, index) => `${index === 0 ? '' : ` ${node.operators[index - 1]} `}${DefinitionWriter.#within(operand, PRECEDENCE.additive, level)}`).join('');
            case 'conditional':
                return DefinitionWriter.#conditional(node, level);
            case 'function':
                return DefinitionWriter.#function(node, level);
            case 'functionCall':
                return `${DefinitionWriter.#reference(node.name)}(${DefinitionWriter.#arguments(node, level)})`;
            case 'do':
                return DefinitionWriter.#block('do', node.body, level);
            case 'body':
                // A query's body, which a do block, a function and a conditional's branch each write their own way.
                return DefinitionWriter.#bodyText(node, level);
            case 'coalescing':
                // A coalescing operator associates to the right, so a fallback that is one is written as it is.
                return `${DefinitionWriter.#within(node.value, PRECEDENCE.negate, level)} ?? ${node.fallback.kind === 'coalescing' ? DefinitionWriter.#write(node.fallback, level) : DefinitionWriter.#within(node.fallback, PRECEDENCE.negate, level)}`;
            case 'arithmetic': {
                // Operators of one level associate to the left, so a right operand of that level is grouped.
                const precedence = DefinitionWriter.#precedenceOf(node);

                return `${DefinitionWriter.#within(node.left, precedence, level)} ${node.operator} ${DefinitionWriter.#within(node.right, precedence + 1, level)}`;
            }
            case 'negate': {
                // A negated negative number, or an arithmetic negation, is grouped, so the signs never run together.
                const { operand } = node;
                const runsTogether = operand.kind === 'negate' || (operand.kind === 'literal' && typeof operand.value === 'number' && (operand.value < 0 || Object.is(operand.value, -0)));

                return `-${runsTogether ? `(${DefinitionWriter.#write(operand, level)})` : DefinitionWriter.#within(operand, PRECEDENCE.negate, level)}`;
            }
            case 'not':
                // The negation of an equality is written as `!=`, which is its canonical text.
                return node.operand.kind === 'equality' ? DefinitionWriter.#equality(node.operand, '!=', level) : `not ${DefinitionWriter.#within(node.operand, PRECEDENCE.not, level)}`;
            case 'cast':
                return `${DefinitionWriter.#within(node.target, PRECEDENCE.optionalChain, level)} as ${DefinitionWriter.#literal(node.type)}`;
            case 'conversion':
                // A conversion converts what is before it, so one that converts another is written as it is.
                return `${DefinitionWriter.#within(node.target, PRECEDENCE.conversion, level)} to ${DefinitionWriter.#literal(node.type)}`;
            case 'try':
                return `try ${DefinitionWriter.#attempted(node.target, level)}`;
            case 'and':
            case 'or':
                return node.operands.map(operand => DefinitionWriter.#within(operand, PRECEDENCE[node.kind] + 1, level)).join(` ${node.kind} `);
            default: {
                const objectText = DefinitionWriter.#object(node, level);

                return node.target === undefined ? objectText : `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)} ${objectText}`;
            }
        }
    }

    /** The dot before an access or a call: `?.` for an optional one, and `.` for one that requires its receiver. */
    static #dot(node) {
        return node.optional === true ? '?.' : '.';
    }

    /**
     * A literal as DOMQL writes it: a string in double quotes, a double quote, a backslash, a line feed, a carriage return, a tab and an escape character escaped by their letters,
     * any other control, format or separator character but the space as a Unicode escape in upper-case hexadecimal, and every other character as itself; negative zero as `-0`, which JSON writes as zero; anything else as JSON writes it.
     */
    static #literal(value) {
        if (typeof value === 'string') {
            return `"${DefinitionWriter.#stringText(value)}"`;
        }

        return Object.is(value, -0) ? '-0' : JSON.stringify(value);
    }

    /** A string's characters as a string writes them between its quotes, each escape as the canonical text writes it. */
    static #stringText(value) {
        return value.replaceAll(ESCAPED_CHARACTERS, character => ESCAPED[character] ?? `\\u{${character.codePointAt(0).toString(16).toUpperCase()}}`);
    }

    /**
     * An interpolated string: its text as a string's, each brace doubled, and each interpolation's expression on one line, as a diagnostic quotes it, so no layout breaks the string,
     * with a space after its `{` where the expression begins with one, whose two braces would read as a brace of the text.
     */
    static #interpolatedString(node) {
        const parts = node.parts.map(part => {
            if (part.kind === 'text') {
                return DefinitionWriter.#stringText(part.value.replaceAll(/[{}]/g, '$&$&'));
            }

            const expression = DefinitionWriter.#write(part.expression, null);

            return `{${expression.startsWith('{') ? ' ' : ''}${expression}}`;
        });

        return `$"${parts.join('')}"`;
    }

    /** An object expression's braces and entries, its locals first: on one line, or with a line for each entry where it is laid out on lines and is more than one field on one line. */
    static #object(node, level) {
        const inner = level === null ? null : level + 1;
        const entries = [
            ...(node.locals ?? []).map(local => `let ${local.name} = ${DefinitionWriter.#write(local.value, inner)}`),
            ...node.fields.map(field => `${field.name} = ${DefinitionWriter.#write(field.value, inner)}`),
        ];

        if (level === null || (node.locals === undefined && entries.length === 1 && !entries[0].includes('\n'))) {
            return `{ ${entries.join(', ')} }`;
        }

        const indentation = INDENTATION.repeat(level + 1);

        return `{\n${entries.map(entry => `${indentation}${entry}`).join(',\n')}\n${INDENTATION.repeat(level)}}`;
    }

    /** The operation `try` attempts: a cast as it is, and a conversion whose value is grouped where it is a conversion or a cast, so `try` attempts the conversion alone. */
    static #attempted(node, level) {
        if (node.kind !== 'conversion') {
            return DefinitionWriter.#write(node, level);
        }

        const value = node.target.kind === 'conversion' || node.target.kind === 'cast' ? `(${DefinitionWriter.#write(node.target, level)})` : DefinitionWriter.#within(node.target, PRECEDENCE.conversion, level);

        return `${value} to ${DefinitionWriter.#literal(node.type)}`;
    }

    /** An equality, or its negation, as its operator writes it: two equality operands, each grouped where it binds more loosely than arithmetic. */
    static #equality(node, operator, level) {
        return `${DefinitionWriter.#within(node.left, PRECEDENCE.additive, level)} ${operator} ${DefinitionWriter.#within(node.right, PRECEDENCE.additive, level)}`;
    }

    /**
     * How tightly the node binds: an arithmetic node by its operator's level, a negative number as an arithmetic negation, since its `-` is one in text, so what follows it, a conversion or an access, groups it,
     * and any other by its kind's.
     */
    static #precedenceOf(node) {
        if (node.kind === 'arithmetic') {
            return node.operator === '+' || node.operator === '-' ? PRECEDENCE.additive : PRECEDENCE.multiplicative;
        }

        if (node.kind === 'literal' && typeof node.value === 'number' && (node.value < 0 || Object.is(node.value, -0))) {
            return PRECEDENCE.negate;
        }

        return PRECEDENCE[node.kind] ?? CHAIN_PRECEDENCE;
    }

    /** A reference to a local or a field: its name, after `@` where a reserved word names it, which written alone keeps its own meaning. */
    static #reference(name) {
        return Names.isReservedWord(name) ? `@${name}` : name;
    }

    /** A call's arguments, separated by commas. */
    static #arguments(node, level) {
        return node.arguments.map(argument => DefinitionWriter.#write(argument, level)).join(', ');
    }

    /** A function: its parameters, and its body as a block writes it; an arrow function its parameters, one alone or several in parentheses, `=>` and the expression that is its body. */
    static #function(node, level) {
        if (node.arrow === true) {
            const parameters = node.parameters.length === 1 ? node.parameters[0] : `(${node.parameters.join(', ')})`;

            return `${parameters} => ${DefinitionWriter.#write(node.body, level)}`;
        }

        return DefinitionWriter.#block(`function(${node.parameters.join(', ')})`, node.body, level);
    }

    /**
     * A block, a function or a do block, after its header: a body of one expression on its line, or a body that returns its result on the lines a level within it, its `end` back at the block's own; on one line where the level is null.
     * A body of one expression laid out on lines of its own goes a level within the block, as one that returns does.
     */
    static #block(header, body, level) {
        if (body.kind !== 'body') {
            const written = level === null ? null : DefinitionWriter.#write(body, level + 1);

            return written === null || !written.includes('\n') ? `${header} ${DefinitionWriter.#write(body, level)} end` : `${header}\n${INDENTATION.repeat(level + 1)}${written}\n${INDENTATION.repeat(level)}end`;
        }

        return level === null
            ? `${header} ${DefinitionWriter.#bodyText(body, null)} end`
            : `${header}\n${INDENTATION.repeat(level + 1)}${DefinitionWriter.#bodyText(body, level + 1)}\n${INDENTATION.repeat(level)}end`;
    }

    /** A body's locals and the `return` that gives its result, each on a line of the level's indentation, or on one line where the level is null. */
    static #bodyText(node, level) {
        const entries = [...node.locals.map(local => `let ${local.name} = ${DefinitionWriter.#write(local.value, level)}`), `return ${DefinitionWriter.#write(node.result, level)}`];

        return entries.join(level === null ? ' ' : `\n${INDENTATION.repeat(level)}`);
    }

    /**
     * A conditional's clauses, each a condition or a binding, and the `end` that closes them: a conditional of its own style nested in its alternative is written as an `elseif`, and one in its condition or consequent in parentheses; every branch gives its result with `return` where the branches are bodies.
     * On one line where the level is null, or where it has no `elseif` and its branches are expressions; otherwise each clause begins a line, its branch after it where the branches are expressions and on the lines a level within it where they are bodies.
     */
    static #conditional(node, level) {
        const clauses = [];
        let current = node;

        for (;;) {
            const test = current.binding === undefined
                ? DefinitionWriter.#within(current.condition, PRECEDENCE.coalescing, level)
                : `let ${current.binding.name} = ${DefinitionWriter.#within(current.binding.value, PRECEDENCE.coalescing, level)}`;

            clauses.push({ header: `${clauses.length === 0 ? 'if' : 'elseif'} ${test} then`, branch: current.consequent, isAlternative: false });

            // An alternative that is a conditional of the same style is an `elseif`; one of the other is the expression an implicit conditional's `else` gives.
            if (current.alternative.kind !== 'conditional' || (current.alternative.consequent.kind === 'body') !== (current.consequent.kind === 'body')) {
                clauses.push({ header: 'else', branch: current.alternative, isAlternative: true });
                break;
            }

            current = current.alternative;
        }

        const branchText = ({ branch, isAlternative }, branchLevel) => {
            if (branch.kind === 'body') {
                return DefinitionWriter.#bodyText(branch, branchLevel);
            }

            // A do block closes itself with its `end`, so it is a branch as it is; a conditional in a consequent is grouped.
            return isAlternative || branch.kind === 'do' ? DefinitionWriter.#write(branch, branchLevel) : DefinitionWriter.#within(branch, PRECEDENCE.coalescing, branchLevel);
        };
        const hasBody = clauses.some(clause => clause.branch.kind === 'body');

        if (level === null || (clauses.length === 2 && !hasBody)) {
            return `${clauses.map(clause => `${clause.header} ${branchText(clause, level)}`).join(' ')} end`;
        }

        const lineBreak = `\n${INDENTATION.repeat(level)}`;

        if (!hasBody) {
            return [...clauses.map(clause => `${clause.header} ${branchText(clause, level)}`), 'end'].join(lineBreak);
        }

        return [...clauses.map(clause => `${clause.header}\n${INDENTATION.repeat(level + 1)}${branchText(clause, level + 1)}`), 'end'].join(lineBreak);
    }

    /** The text of the node where an expression of at least the given precedence stands: in parentheses where its own precedence is lower. */
    static #within(node, precedence, level) {
        const text = DefinitionWriter.#write(node, level);

        return DefinitionWriter.#precedenceOf(node) < precedence ? `(${text})` : text;
    }
}
