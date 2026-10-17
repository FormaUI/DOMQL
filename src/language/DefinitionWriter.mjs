/**
 * DefinitionWriter — a definition's node as the DOMQL text that writes it, parenthesized where its grouping needs it: on one line, as a diagnostic quotes it, or laid out on lines, as formatting gives its canonical text
 */

/** How tightly each kind of expression binds, the loosest lowest: one written where a tighter one stands is parenthesized. An optional chain is an infix call's receiver as it is, and is grouped where a chain continues from it, since its short-circuit ends where it does. */
const PRECEDENCE = { conditional: 0, coalescing: 1, or: 2, and: 3, not: 4, equality: 5, attempt: 6, conversion: 7, infixCall: 8, cast: 9, optionalChain: 10 };

/** How tightly a chain binds that no infix call ends and no optional chain holds: a member access, a call, an object expression, `self`, a local, a literal or a parameter. */
const CHAIN_PRECEDENCE = 11;

/** The nodes that stand as an input, and so as an infix call's argument without parentheses. */
const INPUT_KINDS = new Set(['self', 'local', 'parameter', 'literal']);

/** The indentation of one level of an object expression laid out on lines. */
const INDENTATION = '    ';

export class DefinitionWriter {
    /**
     * The text that writes the node on one line.
     * @param {object} node A node of a definition.
     */
    static write(node) {
        return DefinitionWriter.#write(node, null);
    }

    /**
     * The canonical text of the node, laid out on lines: an object expression of one field and no locals, whose value is on one line, stays on one line, and any other has a line for each entry, indented a level; a conditional with an `elseif` has a line for each clause.
     * @param {object} node A node of a definition.
     */
    static format(node) {
        return DefinitionWriter.#write(node, 0);
    }

    /**
     * The text that writes the node: on one line where the level is null, and otherwise laid out on lines, its line beginning at the level's indentation.
     * @param {object} node
     * @param {number | null} level
     */
    static #write(node, level) {
        switch (node.kind) {
            case 'literal':
                return DefinitionWriter.#literal(node.value);
            case 'parameter':
                return `@${node.name}`;
            case 'self':
                return 'self';
            case 'local':
                return node.name;
            case 'member':
                return typeof node.name === 'string'
                    ? `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${DefinitionWriter.#dot(node)}${node.name}`
                    : `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${node.optional === true ? '?' : ''}[${DefinitionWriter.#write(node.name, level)}]`;
            case 'call':
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${DefinitionWriter.#dot(node)}${node.name}(${node.argument === undefined ? '' : DefinitionWriter.#write(node.argument, level)})`;
            case 'indexer':
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${node.optional === true ? '?:' : ':'}${node.name ?? ''}[${DefinitionWriter.#write(node.argument, level)}]`;
            case 'optionalChain':
                return DefinitionWriter.#write(node.target, level);
            case 'infixCall': {
                const head = `${DefinitionWriter.#within(node.target, PRECEDENCE.cast, level)} ${node.name}`;

                return node.argument === undefined ? head : `${head} ${DefinitionWriter.#argument(node.argument, level)}`;
            }
            case 'equality':
                return DefinitionWriter.#equality(node, '==', level);
            case 'conditional':
                return DefinitionWriter.#conditional(node, level);
            case 'coalescing':
                // A coalescing operator associates to the right, so a fallback that is one is written as it is.
                return `${DefinitionWriter.#within(node.value, PRECEDENCE.attempt, level)} ?? ${node.fallback.kind === 'coalescing' ? DefinitionWriter.#write(node.fallback, level) : DefinitionWriter.#within(node.fallback, PRECEDENCE.attempt, level)}`;
            case 'not':
                // The negation of an equality is written as `!=`, which is its canonical text.
                return node.operand.kind === 'equality' ? DefinitionWriter.#equality(node.operand, '!=', level) : `not ${DefinitionWriter.#within(node.operand, PRECEDENCE.not, level)}`;
            case 'cast':
                return `${DefinitionWriter.#within(node.target, PRECEDENCE.optionalChain, level)} as ${DefinitionWriter.#literal(node.type)}`;
            case 'conversion':
                // An attempted conversion is written with `try` before the one conversion it attempts, so a value that is a conversion, or binds more loosely than one, is grouped; any other converts what is before it.
                return node.attempt === true
                    ? `try ${DefinitionWriter.#within(node.target, PRECEDENCE.conversion + 1, level)} to ${DefinitionWriter.#literal(node.type)}`
                    : `${DefinitionWriter.#within(node.target, PRECEDENCE.conversion, level)} to ${DefinitionWriter.#literal(node.type)}`;
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

    /** A literal as DOMQL writes it: a string in double quotes, escaping only a double quote and a backslash, as a string is read; negative zero as `-0`, which JSON writes as zero; anything else as JSON writes it. */
    static #literal(value) {
        if (typeof value === 'string') {
            return `"${value.replaceAll(/["\\]/g, '\\$&')}"`;
        }

        return Object.is(value, -0) ? '-0' : JSON.stringify(value);
    }

    /** An object expression's braces and entries, its locals first: on one line, or with a line for each entry where it is laid out on lines and is more than one field on one line. */
    static #object(node, level) {
        const inner = level === null ? null : level + 1;
        const entries = [
            ...(node.locals ?? []).map(local => `let ${local.name}: ${DefinitionWriter.#write(local.value, inner)}`),
            ...node.fields.map(field => `${field.name}: ${DefinitionWriter.#write(field.value, inner)}`),
        ];

        if (level === null || (node.locals === undefined && entries.length === 1 && !entries[0].includes('\n'))) {
            return `{ ${entries.join(', ')} }`;
        }

        const indentation = INDENTATION.repeat(level + 1);

        return `{\n${entries.map(entry => `${indentation}${entry}`).join(',\n')}\n${INDENTATION.repeat(level)}}`;
    }

    /** An equality, or its negation, as its operator writes it: two equality operands, each grouped where it binds more loosely than an attempted conversion. */
    static #equality(node, operator, level) {
        return `${DefinitionWriter.#within(node.left, PRECEDENCE.attempt, level)} ${operator} ${DefinitionWriter.#within(node.right, PRECEDENCE.attempt, level)}`;
    }

    /** A conditional's clauses, each a condition or a binding: a conditional nested in its alternative is written as an `elseif`, and one in its condition or consequent in parentheses; laid out on lines, one with an `elseif` has a line for each clause. */
    static #conditional(node, level) {
        const clauses = [];
        let current = node;

        for (;;) {
            const test = current.binding === undefined
                ? DefinitionWriter.#within(current.condition, PRECEDENCE.coalescing, level)
                : `let ${current.binding.name}: ${DefinitionWriter.#within(current.binding.value, PRECEDENCE.coalescing, level)}`;

            clauses.push(`${clauses.length === 0 ? 'if' : 'elseif'} ${test} then ${DefinitionWriter.#within(current.consequent, PRECEDENCE.coalescing, level)}`);

            if (current.alternative.kind !== 'conditional') {
                clauses.push(`else ${DefinitionWriter.#write(current.alternative, level)}`);
                break;
            }

            current = current.alternative;
        }

        return clauses.join(level === null || clauses.length === 2 ? ' ' : `\n${INDENTATION.repeat(level)}`);
    }

    /** The text of an infix call's argument: an input as it is, and anything else in parentheses. */
    static #argument(node, level) {
        const text = DefinitionWriter.#write(node, level);

        return INPUT_KINDS.has(node.kind) || (node.kind === 'object' && node.target === undefined) ? text : `(${text})`;
    }

    /** The text of the node where an expression of at least the given precedence stands: in parentheses where its own precedence is lower. */
    static #within(node, precedence, level) {
        const text = DefinitionWriter.#write(node, level);

        return DefinitionWriter.#precedenceOf(node) < precedence ? `(${text})` : text;
    }

    /** How tightly the node binds, an attempted conversion as `try` does. */
    static #precedenceOf(node) {
        return node.kind === 'conversion' && node.attempt === true ? PRECEDENCE.attempt : PRECEDENCE[node.kind] ?? CHAIN_PRECEDENCE;
    }
}
