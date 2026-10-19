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

    /** The text the tree was read from, which spells each word a name is. */
    #text;

    /** The names of the locals and the fields in scope where the node being lowered stands, which a name reads; any other name reads the caller's binding. @type {Set<string>} */
    #localNames = new Set();

    /** The parameters written with `~`, which read the caller's binding wherever they stand, whatever local shares their name. @type {WeakSet<object>} */
    #queryParameters = new WeakSet();

    /**
     * The definition the tree writes, the span of text each of its nodes, fields, locals and bindings came from, which the tree is no longer needed for, and the parameters written with `~`.
     * @param {import('./SyntaxTree.mjs').QueryNode} tree
     */
    static lower(tree) {
        const lowering = new Lowering(tree.text);
        const query = lowering.#lower(tree.children[0]);

        return { definition: { version: Specification.definitionVersion, query }, spans: lowering.#spans, queryParameters: lowering.#queryParameters };
    }

    /** @param {string} text The text the tree was read from. */
    constructor(text) {
        this.#text = text;
    }

    #lower(child) {
        if (SyntaxTree.isToken(child)) {
            return this.#lowerToken(child);
        }

        const { children } = child;

        switch (child.kind) {
            case 'conditional-expression':
                return this.#lowerConditional(children, 0, SyntaxTree.endOf(child));
            case 'body':
                return this.#lowerBody(child);
            case 'function-expression': {
                // Its parameters are in scope in its body alone, beside the locals in scope where it is declared.
                const close = children.findIndex(part => SyntaxTree.isToken(part) && part.type === ')');
                const parameters = children.slice(2, close).filter(part => part.type !== ',').map(part => this.#wordOf(part));
                const enclosingLocalNames = this.#localNames;

                this.#localNames = new Set([...this.#localNames, ...parameters]);

                try {
                    return this.#span({ kind: 'function', parameters, body: this.#lower(children.at(-2)) }, child);
                } finally {
                    this.#localNames = enclosingLocalNames;
                }
            }
            case 'arrow-function': {
                // Its parameters, one name alone or names in parentheses, are in scope in its body alone, an expression whose value is its result.
                const arrow = children.findIndex(part => SyntaxTree.isToken(part) && part.type === '=>');
                const parameters = children.slice(0, arrow).filter(part => part.type !== ',' && part.type !== '(' && part.type !== ')').map(part => this.#wordOf(part));
                const enclosingLocalNames = this.#localNames;

                this.#localNames = new Set([...this.#localNames, ...parameters]);

                try {
                    return this.#span({ kind: 'function', parameters, body: this.#lower(children.at(-1)), arrow: true }, child);
                } finally {
                    this.#localNames = enclosingLocalNames;
                }
            }
            case 'function-call':
                return this.#span({ kind: 'functionCall', name: children[0].value, arguments: this.#argumentsOf(children.slice(2, -1)) }, child);
            case 'do-expression':
                // A do block holds its body, an expression alone or locals and the `return` that gives its result.
                return this.#span({ kind: 'do', body: this.#lower(children[1]) }, child);
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
            case 'comparison':
                // A chain is one comparison, its operands in order and an operator between each two.
                return this.#span({ kind: 'comparison', operands: children.filter((_, index) => index % 2 === 0).map(operand => this.#lower(operand)), operators: children.filter((_, index) => index % 2 === 1).map(operator => operator.type) }, child);
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
                // An arithmetic negation of a numeric literal is the negative literal, negative zero included, as the text writes it.
                const [, operand] = children;

                if (SyntaxTree.isToken(operand) && operand.type === 'literal' && typeof operand.value === 'number') {
                    return this.#span({ kind: 'literal', value: -operand.value }, child);
                }

                return this.#span({ kind: 'negate', operand: this.#lower(operand) }, child);
            }
            case 'coalescing':
                return this.#span({ kind: 'coalescing', value: this.#lower(children[0]), fallback: this.#lower(children[2]) }, child);
            case 'attempt':
                return this.#span({ kind: 'try', target: this.#lower(children[1]) }, child);
            case 'conversion':
                return this.#span({ kind: 'conversion', type: children[2].value, target: this.#lower(children[0]) }, child);
            case 'cast': {
                // A cast's target written as a member chain within an optional enclosed access is the optional chain of its accesses.
                const [target] = children;

                return this.#span({ kind: 'cast', type: children[2].value, target: target.kind === 'member-chain' ? this.#optionalChainOf(target, target) : this.#lower(target) }, child);
            }
            case 'parenthesized-expression':
            case 'receiver':
                return this.#lower(children[1]);
            case 'optional-enclosed-access':
                return this.#optionalChainOf(children[1], child);
            case 'chain':
                return this.#lowerChain(child);
            case 'object':
                return this.#lowerObject(child, undefined, SyntaxTree.startOf(child));
            case 'interpolated-string':
                // Its text and its interpolations in the order written, each run of text the characters it stands for; a run that stands for none, a block's margin before an interpolation, is no part.
                return this.#span({
                    kind: 'interpolatedString',
                    parts: children.slice(1, -1)
                        .filter(part => !SyntaxTree.isToken(part) || part.value !== '')
                        .map(part => (SyntaxTree.isToken(part) ? { kind: 'text', value: part.value } : { kind: 'expression', expression: this.#lower(part.children[1]) })),
                }, child);
            default:
                throw new TypeError(`No definition is lowered from a ${child.kind}`);
        }
    }

    #lowerToken(token) {
        switch (token.type) {
            case 'context':
                return this.#span({ kind: 'context' }, token);
            case 'literal':
                return this.#span({ kind: 'literal', value: token.value }, token);
            case 'name':
                // A root's name is the root wherever it stands; any other name is the local or the field its lexical scope declares, and otherwise the caller's binding, a parameter of the definition.
                if (Names.isRoot(token.value)) {
                    return this.#span({ kind: 'root', name: token.value }, token);
                }

                return this.#span({ kind: this.#localNames.has(token.value) ? 'local' : 'parameter', name: token.value }, token);
            case 'reserved-reference':
                // A reserved word after `@` is the local or the field of its name, which validation finds in scope or refuses.
                return this.#span({ kind: 'local', name: token.value }, token);
            case 'query-parameter': {
                const parameter = this.#span({ kind: 'parameter', name: token.value }, token);

                this.#queryParameters.add(parameter);

                return parameter;
            }
            default:
                throw new TypeError(`No definition is lowered from the token '${token.type}'`);
        }
    }

    /** A body: its locals in order, each in scope after its value, through the locals after it and the result, which its `return` gives. */
    #lowerBody(body) {
        const { children } = body;
        const enclosingLocalNames = this.#localNames;
        const locals = [];

        try {
            for (const part of children.slice(0, -2)) {
                const local = this.#span({ name: this.#wordOf(part.children[1]), value: this.#lower(part.children[3]) }, part);

                locals.push(local);
                this.#localNames = new Set(this.#localNames).add(local.name);
            }

            return this.#span({ kind: 'body', locals, result: this.#lower(children.at(-1)) }, body);
        } finally {
            this.#localNames = enclosingLocalNames;
        }
    }

    /** The conditional whose clause begins at the index, its `if` or an `elseif`, with every clause after it its alternative, each spanning from its keyword to the end of the last alternative. */
    #lowerConditional(children, index, end) {
        const start = children[index].start;
        const test = children[index + 1];
        const isBinding = test.kind === 'conditional-binding';
        const tested = isBinding ? this.#span({ name: this.#wordOf(test.children[1]), value: this.#lower(test.children[3]) }, test) : this.#lower(test);
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
     * A member after its receiver: a dot property access, a call, a bracket property access, its name the name a string literal is where it is one, or an indexer, spanning from the start given to its own end,
     * and optional where its token says so or where every access is, as an optional enclosed access makes them.
     */
    #lowerAccess(part, target, start, isEveryOptional) {
        const [first, second] = part.children;
        const optional = isEveryOptional || OPTIONAL_ACCESSES.has(first.type);
        let node;

        switch (part.kind) {
            case 'dot-property-access': {
                const name = this.#wordOf(second);

                node = optional ? { kind: 'member', target, name, optional } : { kind: 'member', target, name };
                break;
            }
            case 'member-call': {
                const name = this.#wordOf(second);
                const call = { kind: 'call', target, name, arguments: this.#argumentsOf(part.children.slice(3, -1)) };

                node = optional ? { ...call, optional } : call;
                break;
            }
            case 'bracket-property-access': {
                const expression = this.#lower(second);
                const name = expression.kind === 'literal' && Names.isName(expression.value) ? expression.value : expression;

                node = optional ? { kind: 'member', target, name, optional } : { kind: 'member', target, name };
                break;
            }
            default: {
                const isNamed = second.type !== '[';
                const argument = this.#lower(part.children[isNamed ? 3 : 2]);
                const indexer = isNamed ? { kind: 'indexer', target, name: this.#wordOf(second), argument } : { kind: 'indexer', target, argument };

                node = optional ? { ...indexer, optional } : indexer;
            }
        }

        this.#spans.set(node, { start, end: SyntaxTree.endOf(part) });

        return node;
    }

    /** The arguments a call's parentheses hold, the commas between them left out. */
    #argumentsOf(parts) {
        return parts.filter(part => !(SyntaxTree.isToken(part) && part.type === ',')).map(argument => this.#lower(argument));
    }

    /** The optional chain of a member chain's accesses, every one of them optional, spanning what the span node does. */
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

        // Each local is in scope after its value, through the locals and the fields after it, and each field after its value, through the fields after it.
        for (const child of object.children) {
            if (child.kind === 'local') {
                const local = this.#span({ name: this.#wordOf(child.children[1]), value: this.#lower(child.children[3]) }, child);

                locals.push(local);
                this.#localNames = new Set(this.#localNames).add(local.name);
            } else if (child.kind === 'field') {
                const field = this.#span({ name: this.#wordOf(child.children[0]), value: this.#lower(child.children[2]) }, child);

                fields.push(field);
                this.#localNames = new Set(this.#localNames).add(field.name);
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

    /** The word a token writes, as the text spells it. */
    #wordOf(token) {
        return this.#text.slice(token.start, token.end);
    }

    /** Records the part as spanning the syntax node or token. */
    #span(part, spanned) {
        this.#spans.set(part, { start: SyntaxTree.startOf(spanned), end: SyntaxTree.endOf(spanned) });

        return part;
    }
}
