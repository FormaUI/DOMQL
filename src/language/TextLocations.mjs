/**
 * TextLocations — where in a query text each part of its definition came from, by JSON Pointer
 */

import { DomqlError } from './DomqlError.mjs';

/** @typedef {import('./Parser.mjs').Span} Span */

export class TextLocations {
    #text;
    /** @type {Map<string, Span>} */
    #spans = new Map();

    /**
     * @param {string} text The query text.
     * @param {object} definition The definition read from it.
     * @param {WeakMap<object, Span>} spans The span of text each node, field and argument came from.
     */
    constructor(text, definition, spans) {
        this.#text = text;
        this.#collect(definition.query, '/query', spans);
    }

    /** The text the definition was read from, from which its syntax tree is read again where a tool asks for it, since no query keeps one. */
    get text() {
        return this.#text;
    }

    /** The text position the pointer's part began at, or the nearest enclosing part's. */
    locate(pointer) {
        for (let current = pointer; ; current = current.slice(0, current.lastIndexOf('/'))) {
            const span = this.#spans.get(current);

            if (span) {
                return { pointer, ...DomqlError.locate(this.#text, span.start) };
            }

            if (current === '') {
                return { pointer };
            }
        }
    }

    #collect(node, pointer, spans) {
        const span = spans.get(node);

        if (span) {
            this.#spans.set(pointer, span);
        }

        if (node.target) {
            this.#collect(node.target, `${pointer}/target`, spans);
        }

        if (node.kind === 'member' && typeof node.name !== 'string') {
            this.#collect(node.name, `${pointer}/name`, spans);
        }

        if (node.argument) {
            this.#collect(node.argument, `${pointer}/argument`, spans);
        }

        if (node.kind === 'conditional') {
            if (node.binding !== undefined) {
                const bindingSpan = spans.get(node.binding);

                if (bindingSpan) {
                    this.#spans.set(`${pointer}/binding`, bindingSpan);
                }

                this.#collect(node.binding.value, `${pointer}/binding/value`, spans);
            }

            for (const branch of ['condition', 'consequent', 'alternative']) {
                if (node[branch] !== undefined) {
                    this.#collect(node[branch], `${pointer}/${branch}`, spans);
                }
            }
        }

        if (node.kind === 'equality') {
            this.#collect(node.left, `${pointer}/left`, spans);
            this.#collect(node.right, `${pointer}/right`, spans);
        }

        if (node.kind === 'arithmetic') {
            this.#collect(node.left, `${pointer}/left`, spans);
            this.#collect(node.right, `${pointer}/right`, spans);
        }

        if (node.kind === 'not' || node.kind === 'negate') {
            this.#collect(node.operand, `${pointer}/operand`, spans);
        }

        if (node.kind === 'coalescing') {
            this.#collect(node.value, `${pointer}/value`, spans);
            this.#collect(node.fallback, `${pointer}/fallback`, spans);
        }

        node.operands?.forEach((operand, index) => this.#collect(operand, `${pointer}/operands/${index}`, spans));

        if (node.kind === 'interpolatedString') {
            node.parts.forEach((part, index) => {
                if (part.kind === 'expression') {
                    this.#collect(part.expression, `${pointer}/parts/${index}/expression`, spans);
                }
            });
        }

        if (node.kind === 'body') {
            this.#collect(node.result, `${pointer}/result`, spans);
        }

        for (const entriesProperty of ['locals', 'fields', 'bindings']) {
            node[entriesProperty]?.forEach((entry, index) => {
                const entryPointer = `${pointer}/${entriesProperty}/${index}`;
                const entrySpan = spans.get(entry);

                if (entrySpan) {
                    this.#spans.set(entryPointer, entrySpan);
                }

                this.#collect(entry.value, `${entryPointer}/value`, spans);
            });
        }
    }
}
