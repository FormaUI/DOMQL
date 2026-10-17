/**
 * Lowering — a syntax tree turned into the definition it writes, with the span of text each node, field, local and binding of it came from
 */

import { Names } from './Names.mjs';
import { Specification } from './Specification.mjs';
import { SyntaxTree } from './SyntaxTree.mjs';

/** @typedef {import('./Parser.mjs').Span} Span */
/** @typedef {import('./SyntaxTree.mjs').SyntaxNode} SyntaxNode */

/** The tokens that make an access optional. */
const OPTIONAL_ACCESSES = new Set(['?.', '?[', '?:']);

export class Lowering {
    /** @type {WeakMap<object, Span>} */
    #spans = new WeakMap();

    /** The names of the locals in scope where the node being lowered stands, which a name reads; any other name reads the caller's binding. @type {Set<string>} */
    #localNames = new Set();

    /**
     * The definition the tree writes, and the span of text each of its nodes, fields, locals and bindings came from, which the tree is no longer needed for.
     * @param {import('./SyntaxTree.mjs').QueryNode} tree
     */
    static lower(tree) {
        const lowering = new Lowering();
        const query = lowering.#lower(tree.children[0]);

        return { definition: { version: Specification.definitionVersion, query }, spans: lowering.#spans };
    }

    #lower(child) {
        if (SyntaxTree.isToken(child)) {
            return this.#lowerToken(child);
        }

        const { children } = child;

        switch (child.kind) {
            case 'conditional-expression':
                return this.#lowerConditional(children, 0, SyntaxTree.endOf(child));
            case 'disjunction':
            case 'conjunction':
                return this.#span({ kind: child.kind === 'disjunction' ? 'or' : 'and', operands: children.filter((_, index) => index % 2 === 0).map(operand => this.#lower(operand)) }, child);
            case 'negation':
                return this.#span({ kind: 'not', operand: this.#lower(children[1]) }, child);
            case 'equality': {
                // `!=` is the negation of `==`, which spans what the equality does.
                const equality = this.#span({ kind: 'equality', left: this.#lower(children[0]), right: this.#lower(children[2]) }, child);

                return children[1].type === '!=' ? this.#span({ kind: 'not', operand: equality }, child) : equality;
            }
            case 'additive':
            case 'multiplicative': {
                // Operators of one level associate to the left, each operation spanning from the first operand to its own right operand.
                let value = this.#lower(children[0]);

                for (let index = 1; index < children.length; index += 2) {
                    value = { kind: 'arithmetic', operator: children[index].type, left: value, right: this.#lower(children[index + 1]) };
                    this.#spans.set(value, { start: SyntaxTree.startOf(child), end: SyntaxTree.endOf(children[index + 1]) });
                }

                return value;
            }
            case 'arithmetic-negation': {
                // A negation of a numeric literal is the negative literal, negative zero included, as the text writes it.
                const [, operand] = children;

                if (SyntaxTree.isToken(operand) && operand.type === 'literal' && typeof operand.value === 'number') {
                    return this.#span({ kind: 'literal', value: -operand.value }, child);
                }

                return this.#span({ kind: 'negate', operand: this.#lower(operand) }, child);
            }
            case 'coalescing-operator':
                return this.#span({ kind: 'coalescing', value: this.#lower(children[0]), fallback: this.#lower(children[2]) }, child);
            case 'attempt':
                return this.#span({ kind: 'try', target: this.#lower(children[1]) }, child);
            case 'conversion':
                return this.#span({ kind: 'conversion', type: children[2].value, target: this.#lower(children[0]) }, child);
            case 'cast': {
                // A cast's target written as a member-access chain within an optional-access group is the optional chain of its accesses.
                const [target] = children;

                return this.#span({ kind: 'cast', type: children[2].value, target: target.kind === 'member-access-chain' ? this.#optionalChainOf(target, target) : this.#lower(target) }, child);
            }
            case 'expression-group':
            case 'receiver':
                return this.#lower(children[1]);
            case 'optional-access-group':
                return this.#optionalChainOf(children[1], child);
            case 'chain':
                return this.#lowerChain(child);
            case 'object':
                return this.#lowerObject(child, undefined, SyntaxTree.startOf(child));
            default:
                throw new TypeError(`No definition is lowered from a ${child.kind}`);
        }
    }

    #lowerToken(token) {
        switch (token.type) {
            case 'self':
                return this.#span({ kind: 'self' }, token);
            case 'literal':
                return this.#span({ kind: 'literal', value: token.value }, token);
            case 'name':
                // A name is the local its lexical scope declares, and otherwise the caller's binding, a parameter of the definition.
                return this.#span({ kind: this.#localNames.has(token.value) ? 'local' : 'parameter', name: token.value }, token);
            default:
                throw new TypeError(`No definition is lowered from the token '${token.type}'`);
        }
    }

    /** The conditional whose clause begins at the index, its `if` or an `elseif`, with every clause after it its alternative, each spanning from its keyword to the end of the last alternative. */
    #lowerConditional(children, index, end) {
        const start = children[index].start;
        const test = children[index + 1];
        const isBinding = test.kind === 'conditional-binding';
        const tested = isBinding ? this.#span({ name: test.children[1].value, value: this.#lower(test.children[3]) }, test) : this.#lower(test);
        // A binding's name is in scope in its consequent alone.
        const consequent = isBinding ? this.#lowerWithin([tested.name], children[index + 3]) : this.#lower(children[index + 3]);
        const next = children[index + 4];
        const alternative = next.value === 'elseif' ? this.#lowerConditional(children, index + 4, end) : this.#lower(children[index + 5]);
        const node = isBinding ? { kind: 'conditional', binding: tested, consequent, alternative } : { kind: 'conditional', condition: tested, consequent, alternative };

        this.#spans.set(node, { start, end });

        return node;
    }

    /** A chain's input and what continues it, each part spanning from the chain's start to its own end, held by an optional chain where an access of it is optional. */
    #lowerChain(chain) {
        const { children } = chain;
        const start = SyntaxTree.startOf(chain);
        let value = this.#lower(children[0]);
        let isOptional = false;

        for (let index = 1; index < children.length; index++) {
            const part = children[index];

            if (part.kind === 'object') {
                value = this.#lowerObject(part, value, start);
            } else {
                isOptional ||= OPTIONAL_ACCESSES.has(part.children[0].type);
                value = this.#lowerAccess(part, value, start, false);
            }
        }

        return isOptional ? this.#span({ kind: 'optionalChain', target: value }, chain) : value;
    }

    /**
     * A member-access expression after its receiver: a member access, a call, an access by name, its name the name a string literal is where it is one, or an indexer, spanning from the start given to its own end,
     * and optional where its token says so or where every access is, as an optional-access group makes them.
     */
    #lowerAccess(part, target, start, isEveryOptional) {
        const [first, second] = part.children;
        const optional = isEveryOptional || OPTIONAL_ACCESSES.has(first.type);
        let node;

        if (first.type === '.' || first.type === '?.') {
            const isCall = second.kind === 'call-expression';
            const name = isCall ? second.children[0].value : second.value;
            const access = optional ? { target, name, optional } : { target, name };

            if (!isCall) {
                node = { kind: 'member', ...access };
            } else {
                node = second.children.length === 4 ? { kind: 'call', ...access, argument: this.#lower(second.children[2]) } : { kind: 'call', ...access };
            }
        } else if (first.type === '[' || first.type === '?[') {
            const expression = this.#lower(second);
            const name = expression.kind === 'literal' && Names.isName(expression.value) ? expression.value : expression;

            node = optional ? { kind: 'member', target, name, optional } : { kind: 'member', target, name };
        } else {
            const isNamed = second.type === 'name';
            const argument = this.#lower(part.children[isNamed ? 3 : 2]);
            const indexer = isNamed ? { kind: 'indexer', target, name: second.value, argument } : { kind: 'indexer', target, argument };

            node = optional ? { ...indexer, optional } : indexer;
        }

        this.#spans.set(node, { start, end: SyntaxTree.endOf(part) });

        return node;
    }

    /** The optional chain of a member-access chain's accesses, every one of them optional, spanning what the span node does. */
    #optionalChainOf(chain, spanned) {
        const { children } = chain;
        const start = SyntaxTree.startOf(chain);
        let value = this.#lower(children[0]);

        for (let index = 1; index < children.length; index++) {
            value = this.#lowerAccess(children[index], value, start, true);
        }

        return this.#span({ kind: 'optionalChain', target: value }, spanned);
    }

    /** An object expression, of the target it follows where it follows one, spanning from the start given, its locals left out where it has none. */
    #lowerObject(object, target, start) {
        const node = target === undefined ? { kind: 'object' } : { kind: 'object', target };
        const locals = [];
        const fields = [];
        const enclosingLocalNames = this.#localNames;

        // Each local is in scope after its value, through the locals and the fields after it.
        for (const child of object.children) {
            if (child.kind === 'local') {
                const local = this.#span({ name: child.children[1].value, value: this.#lower(child.children[3]) }, child);

                locals.push(local);
                this.#localNames = new Set(this.#localNames).add(local.name);
            } else if (child.kind === 'field') {
                fields.push(this.#span({ name: child.children[0].value, value: this.#lower(child.children[2]) }, child));
            }
        }

        this.#localNames = enclosingLocalNames;

        if (locals.length > 0) {
            node.locals = locals;
        }

        node.fields = fields;
        this.#spans.set(node, { start, end: SyntaxTree.endOf(object) });

        return node;
    }

    /** The child lowered with the names in scope besides those already. */
    #lowerWithin(names, child) {
        const enclosingLocalNames = this.#localNames;

        this.#localNames = new Set([...this.#localNames, ...names]);

        try {
            return this.#lower(child);
        } finally {
            this.#localNames = enclosingLocalNames;
        }
    }

    /** Records the part as spanning the syntax node or token. */
    #span(part, spanned) {
        this.#spans.set(part, { start: SyntaxTree.startOf(spanned), end: SyntaxTree.endOf(spanned) });

        return part;
    }
}
