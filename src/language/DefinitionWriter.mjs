/**
 * DefinitionWriter — a definition's node as the DOMQL text that writes it, parenthesized where its grouping needs it
 */

/** How tightly each kind of expression binds, the loosest lowest: one written where a tighter one stands is parenthesized. */
const BINDING = { or: 1, and: 2, predicate: 3 };

/** How tightly a chain binds: a member, an object expression, a literal or a parameter. */
const CHAIN = 4;

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
            case 'member': {
                const target = node.target === undefined ? '' : `${DefinitionWriter.#within(node.target, CHAIN)}.`;
                const args = node.arguments.length === 0 ? '' : `(${node.arguments.map(entry => DefinitionWriter.#entry(entry)).join(', ')})`;

                return `${target}${node.name}${args}`;
            }
            case 'predicate': {
                const target = node.target === undefined ? '' : `${DefinitionWriter.#within(node.target, CHAIN)} `;

                return `${target}${node.verb} ${DefinitionWriter.write(node.name)}`;
            }
            case 'and':
            case 'or':
                return node.operands.map(operand => DefinitionWriter.#within(operand, BINDING[node.kind] + 1)).join(` ${node.kind} `);
            default: {
                const target = node.target === undefined ? '' : `${DefinitionWriter.#within(node.target, CHAIN)} `;

                return `${target}{ ${node.fields.map(entry => DefinitionWriter.#entry(entry)).join(', ')} }`;
            }
        }
    }

    static #entry(entry) {
        return entry.name === undefined ? DefinitionWriter.write(entry.value) : `${entry.name}: ${DefinitionWriter.write(entry.value)}`;
    }

    /** The text of the node where an expression binding at least as tightly as the given binding stands: in parentheses where it binds more loosely. */
    static #within(node, binding) {
        const text = DefinitionWriter.write(node);

        return (BINDING[node.kind] ?? CHAIN) < binding ? `(${text})` : text;
    }
}
