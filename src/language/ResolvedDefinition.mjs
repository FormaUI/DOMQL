/**
 * ResolvedDefinition — a definition resolved against the vocabulary: its request kind, the type of its result, and what each of its nodes resolved to
 */

export class ResolvedDefinition {
    #definition;
    #kind;
    #type;
    #resolutions;
    #usedDeclarations;

    /** Each node of the definition's query, by the node itself, with its JSON Pointer and what it resolved to. @type {Map<object, { pointer: string, resolution: object | undefined }>} */
    #nodes = new Map();

    /** The name of each field of each object expression of the definition's query, in order, by the expression's node. @type {Map<object, string[]>} */
    #fieldNames = new Map();

    /**
     * @param {object} definition The request's definition, whose every node is an object of its own.
     * @param {'query' | 'subscription' | 'action' | 'behavior'} kind The request's kind.
     * @param {import('./Type.mjs').Type} type The type of its result.
     * @param {Map<string, object>} resolutions What each member node, by its JSON Pointer, resolved to.
     * @param {object[]} usedDeclarations The declarations the request uses, each with the pointer that used it.
     */
    constructor(definition, kind, type, resolutions, usedDeclarations) {
        this.#definition = definition;
        this.#kind = kind;
        this.#type = type;
        this.#resolutions = resolutions;
        this.#usedDeclarations = Object.freeze([...usedDeclarations]);
        this.#index(definition.query, '/query');
    }

    /** The request's definition. */
    get definition() {
        return this.#definition;
    }

    /** The request's kind: a query, a subscription, an action or a behavior request. */
    get kind() {
        return this.#kind;
    }

    /** The type of the request's result. */
    get type() {
        return this.#type;
    }

    /** The declarations the request uses, with where each is used. */
    get usedDeclarations() {
        return this.#usedDeclarations;
    }

    /** What the member node at the pointer resolved to. */
    getResolution(pointer) {
        return this.#resolutions.get(pointer);
    }

    /**
     * What the node of the definition resolved to.
     * @internal
     */
    resolutionOf(node) {
        return this.#nodes.get(node)?.resolution;
    }

    /**
     * The JSON Pointer of the node of the definition.
     * @internal
     */
    pointerOf(node) {
        return this.#nodes.get(node)?.pointer;
    }

    /**
     * The name of each field of the object expression node of the definition, in order: the name it was given, or the one it infers.
     * @internal
     */
    fieldNamesOf(node) {
        return this.#fieldNames.get(node);
    }

    /** Records the node at the pointer and every node beneath it, each with its pointer and its resolution. */
    #index(node, pointer) {
        this.#nodes.set(node, { pointer, resolution: this.#resolutions.get(pointer) });

        if (node.target !== undefined) {
            this.#index(node.target, `${pointer}/target`);
        }

        switch (node.kind) {
            case 'member':
                if (typeof node.name !== 'string') {
                    this.#index(node.name, `${pointer}/name`);
                }
                break;
            case 'call':
            case 'infixCall':
                if (node.argument !== undefined) {
                    this.#index(node.argument, `${pointer}/argument`);
                }
                break;
            case 'object':
                node.locals?.forEach((local, index) => this.#index(local.value, `${pointer}/locals/${index}/value`));
                node.fields.forEach((field, index) => this.#index(field.value, `${pointer}/fields/${index}/value`));
                this.#fieldNames.set(node, node.fields.map(field => field.name));
                break;
            case 'predicate':
                this.#index(node.name, `${pointer}/name`);
                break;
            case 'conditional':
                for (const branch of ['condition', 'consequent', 'alternative']) {
                    this.#index(node[branch], `${pointer}/${branch}`);
                }
                break;
            case 'and':
            case 'or':
                node.operands.forEach((operand, index) => this.#index(operand, `${pointer}/operands/${index}`));
                break;
            case 'coalescing':
                this.#index(node.value, `${pointer}/value`);
                this.#index(node.fallback, `${pointer}/fallback`);
                break;
        }
    }
}
