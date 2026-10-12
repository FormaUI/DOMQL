/**
 * DefinitionWriter — a definition's node as the DOMQL text that writes it, parenthesized where its grouping needs it
 */

/** How tightly each kind of expression binds, the loosest lowest: one written where a tighter one stands is parenthesized. */
const BINDING = { or: 1, and: 2, predicate: 3, namedOperation: 4 };

/** How tightly a chain binds that no named operation ends: a member access, a call, an object expression, `self`, a literal or a parameter. */
const CHAIN = 5;

/** The nodes that stand as an initial expression, and so as a named operation's argument without parentheses. */
const INITIAL = new Set(['self', 'parameter', 'literal']);

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
            case 'member':
                return `${DefinitionWriter.#within(node.target, CHAIN)}.${node.name}`;
            case 'call':
                return `${DefinitionWriter.#within(node.target, CHAIN)}.${node.name}(${node.argument === undefined ? '' : DefinitionWriter.write(node.argument)})`;
            case 'namedOperation': {
                const head = `${DefinitionWriter.#within(node.target, CHAIN)} ${node.name}`;

                return node.argument === undefined ? head : `${head} ${DefinitionWriter.#argument(node.argument)}`;
            }
            case 'predicate':
                return `${DefinitionWriter.#within(node.target, BINDING.namedOperation)} ${node.verb} ${DefinitionWriter.write(node.name)}`;
            case 'and':
            case 'or':
                return node.operands.map(operand => DefinitionWriter.#within(operand, BINDING[node.kind] + 1)).join(` ${node.kind} `);
            default: {
                const fields = `{ ${node.fields.map(field => `${field.name}: ${DefinitionWriter.write(field.value)}`).join(', ')} }`;

                return node.target === undefined ? fields : `${DefinitionWriter.#within(node.target, CHAIN)} ${fields}`;
            }
        }
    }

    /** The text of a named operation's argument: an initial expression as it is, and anything else in parentheses. */
    static #argument(node) {
        const text = DefinitionWriter.write(node);

        return INITIAL.has(node.kind) || (node.kind === 'object' && node.target === undefined) ? text : `(${text})`;
    }

    /** The text of the node where an expression binding at least as tightly as the given binding stands: in parentheses where it binds more loosely. */
    static #within(node, binding) {
        const text = DefinitionWriter.write(node);

        return (BINDING[node.kind] ?? CHAIN) < binding ? `(${text})` : text;
    }
}
