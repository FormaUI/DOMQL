/**
 * DefinitionWriter — a definition's node as the DOMQL text that writes it, parenthesized where its grouping needs it
 */

/** How tightly each kind of expression binds, the loosest lowest: one written where a tighter one stands is parenthesized. */
const PRECEDENCE = { conditional: 0, or: 1, and: 2, predicate: 3, namedOperation: 4 };

/** How tightly a chain binds that no named operation ends: a member access, a call, an object expression, `self`, a local, a literal or a parameter. */
const CHAIN_PRECEDENCE = 5;

/** The nodes that stand as an initial expression, and so as a named operation's argument without parentheses. */
const INITIAL_EXPRESSION_KINDS = new Set(['self', 'local', 'parameter', 'literal']);

export class DefinitionWriter {
    /**
     * The text that writes the node.
     * @param {object} node A node of a definition.
     */
    static write(node) {
        switch (node.kind) {
            case 'literal':
                return JSON.stringify(node.value);
            case 'parameter':
                return `@${node.name}`;
            case 'self':
                return 'self';
            case 'local':
                return node.name;
            case 'member':
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE)}.${node.name}`;
            case 'call':
                return `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE)}.${node.name}(${node.argument === undefined ? '' : DefinitionWriter.write(node.argument)})`;
            case 'namedOperation': {
                const head = `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE)} ${node.name}`;

                return node.argument === undefined ? head : `${head} ${DefinitionWriter.#argument(node.argument)}`;
            }
            case 'predicate':
                return `${DefinitionWriter.#within(node.target, PRECEDENCE.namedOperation)} ${node.verb} ${DefinitionWriter.write(node.name)}`;
            case 'conditional':
                return `if ${DefinitionWriter.#clauses(node)}`;
            case 'and':
            case 'or':
                return node.operands.map(operand => DefinitionWriter.#within(operand, PRECEDENCE[node.kind] + 1)).join(` ${node.kind} `);
            default: {
                const locals = (node.locals ?? []).map(local => `let ${local.name}: ${DefinitionWriter.write(local.value)}`);
                const objectText = `{ ${[...locals, ...node.fields.map(field => `${field.name}: ${DefinitionWriter.write(field.value)}`)].join(', ')} }`;

                return node.target === undefined ? objectText : `${DefinitionWriter.#within(node.target, CHAIN_PRECEDENCE)} ${objectText}`;
            }
        }
    }

    /** A conditional's clauses after its `if`: a conditional nested in its alternative is written as an `elseif`, and one in its condition or consequent in parentheses. */
    static #clauses(node) {
        const clause = `${DefinitionWriter.#within(node.condition, PRECEDENCE.or)} then ${DefinitionWriter.#within(node.consequent, PRECEDENCE.or)}`;

        return node.alternative.kind === 'conditional'
            ? `${clause} elseif ${DefinitionWriter.#clauses(node.alternative)}`
            : `${clause} else ${DefinitionWriter.write(node.alternative)}`;
    }

    /** The text of a named operation's argument: an initial expression as it is, and anything else in parentheses. */
    static #argument(node) {
        const text = DefinitionWriter.write(node);

        return INITIAL_EXPRESSION_KINDS.has(node.kind) || (node.kind === 'object' && node.target === undefined) ? text : `(${text})`;
    }

    /** The text of the node where an expression of at least the given precedence stands: in parentheses where its own precedence is lower. */
    static #within(node, precedence) {
        const text = DefinitionWriter.write(node);

        return (PRECEDENCE[node.kind] ?? CHAIN_PRECEDENCE) < precedence ? `(${text})` : text;
    }
}
