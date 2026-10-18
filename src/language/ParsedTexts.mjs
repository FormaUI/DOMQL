/**
 * ParsedTexts — the definitions of the query texts parsed most recently
 */

import { DefinitionValidator } from './DefinitionValidator.mjs';
import { Lowering } from './Lowering.mjs';
import { Parser } from './Parser.mjs';
import { TextLocations } from './TextLocations.mjs';

/** The most texts whose definitions are kept. */
const CAPACITY = 256;

export class ParsedTexts {
    /** Each kept text's definition, the least recently parsed first. @type {Map<string, object>} */
    static #definitions = new Map();

    /** @type {WeakMap<object, TextLocations>} */
    static #locations = new WeakMap();

    /** Where each part of the definition came from: in its text, for one parsed from text, or in the definition its caller supplied, where validation moved a part; null otherwise. */
    static locationsOf(definition) {
        return ParsedTexts.#locations.get(definition) ?? DefinitionValidator.locationsOf(definition);
    }

    /** The text the definition was parsed from, or null for a definition not parsed from text. */
    static textOf(definition) {
        return ParsedTexts.#locations.get(definition)?.text ?? null;
    }

    /** The validated, frozen definition the text parses into, kept for the next parse of the same text. */
    static parse(text) {
        const kept = ParsedTexts.#definitions.get(text);

        if (kept) {
            ParsedTexts.#definitions.delete(text);
            ParsedTexts.#definitions.set(text, kept);

            return kept;
        }

        // The tree is lowered and let go: a kept definition holds its locations, never its tokens or their trivia.
        const { definition, spans, queryParameters } = Lowering.lower(new Parser(text).parse());
        const locations = new TextLocations(text, definition, spans);
        const validated = new DefinitionValidator(locations, queryParameters).validate(definition);

        ParsedTexts.#locations.set(validated, locations);

        ParsedTexts.#definitions.set(text, validated);

        if (ParsedTexts.#definitions.size > CAPACITY) {
            ParsedTexts.#definitions.delete(ParsedTexts.#definitions.keys().next().value);
        }

        return validated;
    }
}
