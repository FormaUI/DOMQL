/**
 * DefinitionWriter — a definition's node as the DOMQL text that writes it, parenthesized where its grouping needs it: on one line, as a diagnostic quotes it, or laid out on lines, as formatting gives its canonical text
 */

/** How tightly each kind of expression binds, the loosest lowest: one written where a tighter one stands is parenthesized. An optional chain is an infix call's receiver as it is, and is grouped where a chain continues from it, since its short-circuit ends where it does. */
const PRECEDENCE = { conditional: 0, coalescing: 1, or: 2, and: 3, not: 4, equality: 5, convertibility: 5, conversion: 6, infixCall: 7, cast: 8, optionalChain: 9 };

/** How tightly a chain binds that no infix call ends and no optional chain holds: a member access, a call, an object expression, `self`, a local, a literal or a parameter. */
const CHAIN_PRECEDENCE = 10;

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
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE, level)}${node.optional === true ? '?:' : ':'}${node.name}[${DefinitionWriter.#write(node.argument, level)}]`;
            case 'optionalChain':
                return DefinitionWriter.#write(node.target, level);
            case 'infixCall': {
                const head = `${DefinitionWriter.#within(node.target, PRECEDENCE.cast, level)} ${node.name}`;

                return node.argument === undefined ? head : `${head} ${DefinitionWriter.#argument(node.argument, level)}`;
            }
            case 'equality':
                return DefinitionWriter.#equality(node, 'is', level);
            case 'convertibility':
                return DefinitionWriter.#convertibility(node, 'is', level);
            case 'conditional':
                return DefinitionWriter.#conditional(node, level);
            case 'coalescing':
                // A coalescing operator associates to the right, so a fallback that is one is written as it is.
                return `${DefinitionWriter.#within(node.value, PRECEDENCE.conversion, level)} ?? ${node.fallback.kind === 'coalescing' ? DefinitionWriter.#write(node.fallback, level) : DefinitionWriter.#within(node.fallback, PRECEDENCE.conversion, level)}`;
            case 'not':
                // The negation of an equality or a convertibility is written as `is not`, which is its canonical text.
                if (node.operand.kind === 'equality') {
                    return DefinitionWriter.#equality(node.operand, 'is not', level);
                }

                return node.operand.kind === 'convertibility' ? DefinitionWriter.#convertibility(node.operand, 'is not', level) : `not ${DefinitionWriter.#within(node.operand, PRECEDENCE.not, level)}`;
            case 'cast':
                return `${DefinitionWriter.#within(node.target, PRECEDENCE.optionalChain, level)} as ${DefinitionWriter.#literal(node.type)}`;
            case 'conversion':
                // A conversion converts what is before it, so one that converts another is written as it is.
                return `${DefinitionWriter.#within(node.target, PRECEDENCE.conversion, level)} to ${DefinitionWriter.#literal(node.type)}`;
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

    /**
     * An equality, or its negation, as its operator writes it: two equality operands, each grouped where it binds more loosely than a conversion,
     * and a right operand that converts a local named `convertible` grouped too, since `is convertible to` reads a convertibility.
     */
    static #equality(node, operator, level) {
        const right = DefinitionWriter.#within(node.right, PRECEDENCE.conversion, level);

        return `${DefinitionWriter.#within(node.left, PRECEDENCE.conversion, level)} ${operator} ${DefinitionWriter.#convertsConvertible(node.right) ? `(${right})` : right}`;
    }

    /** Whether the node is a conversion whose value, through the conversions it converts, is a local named `convertible`. */
    static #convertsConvertible(node) {
        let current = node;

        while (current.kind === 'conversion') {
            current = current.target;
        }

        return current !== node && current.kind === 'local' && current.name === 'convertible';
    }

    /** A convertibility, or its negation, as its operator writes it: an equality operand, grouped where it binds more loosely than a conversion, `convertible to` and the quoted type. */
    static #convertibility(node, operator, level) {
        return `${DefinitionWriter.#within(node.target, PRECEDENCE.conversion, level)} ${operator} convertible to ${DefinitionWriter.#literal(node.type)}`;
    }

    /** A conditional's clauses: a conditional nested in its alternative is written as an `elseif`, and one in its condition or consequent in parentheses; laid out on lines, one with an `elseif` has a line for each clause. */
    static #conditional(node, level) {
        const clauses = [];
        let current = node;

        for (;;) {
            clauses.push(`${clauses.length === 0 ? 'if' : 'elseif'} ${DefinitionWriter.#within(current.condition, PRECEDENCE.coalescing, level)} then ${DefinitionWriter.#within(current.consequent, PRECEDENCE.coalescing, level)}`);

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

        return (PRECEDENCE[node.kind] ?? CHAIN_PRECEDENCE) < precedence ? `(${text})` : text;
    }
}
