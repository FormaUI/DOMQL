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

    #collect(part, pointer, spans) {
        const span = spans.get(part);

        if (span) {
            this.#spans.set(pointer, span);
        }

        if (part.target) {
            this.#collect(part.target, `${pointer}/target`, spans);
        }

        if (part.kind === 'predicate') {
            this.#collect(part.name, `${pointer}/name`, spans);
        }

        if (part.argument) {
            this.#collect(part.argument, `${pointer}/argument`, spans);
        }

        if (part.kind === 'conditional') {
            for (const branch of ['condition', 'consequent', 'alternative']) {
                this.#collect(part[branch], `${pointer}/${branch}`, spans);
            }
        }

        part.operands?.forEach((operand, index) => this.#collect(operand, `${pointer}/operands/${index}`, spans));

        part.fields?.forEach((field, index) => {
            const fieldPointer = `${pointer}/fields/${index}`;
            const fieldSpan = spans.get(field);

            if (fieldSpan) {
                this.#spans.set(fieldPointer, fieldSpan);
            }

            this.#collect(field.value, `${fieldPointer}/value`, spans);
        });
    }
}
