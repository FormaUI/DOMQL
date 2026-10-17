/**
 * SyntaxTree — the lossless syntax tree of a DOMQL text: its constructs, each a node named after the grammar rule that produces it, holding its tokens and the nodes within it, every token with the trivia before it
 */

/** @typedef {import('./Tokenizer.mjs').Token} Token */
/** @typedef {{ kind: string, children: (SyntaxNode | Token)[] }} SyntaxNode */
/** @typedef {{ kind: 'query', text: string, children: [SyntaxNode | Token, Token] }} QueryNode */
/** @typedef {{ kind: 'whitespace' | 'line-comment' | 'block-comment', start: number, end: number }} TriviaPiece */

/**
 * The kinds a node is, each a construct of the grammar, which tooling reads as they are; a rule that only passes an operand on, a level of precedence or a repetition, is none of them.
 * A contract within DOMQL until a public tooling API stabilizes it.
 */
export const NODE_KINDS = Object.freeze([
    'query',
    'conditional-expression',
    'conditional-binding',
    'disjunction',
    'conjunction',
    'negation',
    'equality',
    'comparison',
    'additive',
    'multiplicative',
    'arithmetic-negation',
    'coalescing',
    'attempt',
    'conversion',
    'cast',
    'chain',
    'dot-property-access',
    'bracket-property-access',
    'function-call',
    'indexer',
    'parenthesized-expression',
    'optional-enclosed-access',
    'member-chain',
    'receiver',
    'object',
    'local',
    'field',
]);

export class SyntaxTree {
    /** Whether the child is a token rather than a node. */
    static isToken(child) {
        return child.kind === undefined;
    }

    /** Where the node's first token begins, its trivia left out. */
    static startOf(child) {
        let current = child;

        while (!SyntaxTree.isToken(current)) {
            current = current.children[0];
        }

        return current.start;
    }

    /** Where the node's last token ends. */
    static endOf(child) {
        let current = child;

        while (!SyntaxTree.isToken(current)) {
            current = current.children.at(-1);
        }

        return current.end;
    }

    /**
     * The tokens of the node, in the order of the text.
     * @param {SyntaxNode | Token} child
     * @returns {Generator<Token>}
     */
    static *tokensOf(child) {
        if (SyntaxTree.isToken(child)) {
            yield child;

            return;
        }

        for (const each of child.children) {
            yield* SyntaxTree.tokensOf(each);
        }
    }

    /**
     * The text the tree was read from, rebuilt from its tokens and the trivia before each, the end of the text's included.
     * @param {QueryNode} tree
     */
    static textOf(tree) {
        let text = '';

        for (const token of SyntaxTree.tokensOf(tree)) {
            text += tree.text.slice(token.leading, token.end);
        }

        return text;
    }

    /**
     * The trivia before the token, each piece whitespace, a line comment or a block comment, in the order of the text.
     * @param {Token} token
     * @param {string} text The text the token was read from.
     * @returns {TriviaPiece[]}
     */
    static triviaOf(token, text) {
        const pieces = [];

        for (let offset = token.leading; offset < token.start;) {
            const start = offset;

            if (text.startsWith('//', offset)) {
                const lineEnd = text.indexOf('\n', offset);

                offset = lineEnd === -1 || lineEnd >= token.start ? token.start : lineEnd + 1;
                pieces.push({ kind: 'line-comment', start, end: offset });
            } else if (text.startsWith('/*', offset)) {
                offset = text.indexOf('*/', offset + 2) + 2;
                pieces.push({ kind: 'block-comment', start, end: offset });
            } else {
                while (offset < token.start && !text.startsWith('//', offset) && !text.startsWith('/*', offset)) {
                    offset++;
                }

                pieces.push({ kind: 'whitespace', start, end: offset });
            }
        }

        return pieces;
    }
}
