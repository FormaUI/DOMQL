/**
 * ResultPath — a path into a query's result, of field names and list indices: its shape, the type it reaches and the value it reads
 */

import { DomqlError } from './DomqlError.mjs';
import { Names } from './Names.mjs';
import { Type } from './Type.mjs';

export class ResultPath {
    /** Refuses a path item that is neither a name nor a list index, a whole number that is not negative, before anything is resolved. */
    static checkShape(path) {
        for (const item of path) {
            const isIndex = Number.isInteger(item) && item >= 0;

            if (!isIndex && !(typeof item === 'string' && Names.isName(item))) {
                throw DomqlError.structure(`A path holds the names of fields and list indices that are whole numbers and not negative, and ${JSON.stringify(item) ?? String(item)} is neither`, {});
            }
        }
    }

    /**
     * The type the path reaches in the result's type, nullable where a step it passes is; a type that says nothing of its value takes any path, which is checked once its type is known.
     * @param {Type} resultType The result's type.
     * @param {(string | number)[]} path
     * @param {import('./vocabulary/ModuleRegistry.mjs').ModuleRegistry} moduleRegistry Where a structured type's fields are declared.
     * @param {() => object} locationOf Where a path that does not fit the result is refused, found only when one is.
     */
    static typeAt(resultType, path, moduleRegistry, locationOf) {
        let type = resultType;
        let isNullable = false;

        for (const item of path) {
            if (type.kind === 'null' || type.kind === 'never') {
                return Type.null;
            }

            isNullable ||= type.isNullable;

            if (typeof item === 'number') {
                if (type.kind !== 'list') {
                    throw DomqlError.validation(`The path indexes ${type.toNonNullable()}, which is no list`, locationOf());
                }

                // An index out of range gives null.
                type = type.itemType;
                isNullable = true;
                continue;
            }

            const fieldType = ResultPath.#fieldTypeOf(type, item, moduleRegistry);

            if (fieldType === null) {
                throw DomqlError.validation(`The path names '${item}', which ${type.toNonNullable()} does not hold`, locationOf());
            }

            type = fieldType;
        }

        return isNullable ? type.toNullable() : type;
    }

    /** The value the path reaches in the result: null where a step it passes is null, and where an index is out of range. */
    static valueAt(value, path) {
        let current = value;

        for (const item of path) {
            if (current === null || current === undefined) {
                return null;
            }

            current = current[item] ?? null;
        }

        return current;
    }

    static #fieldTypeOf(type, name, moduleRegistry) {
        if (type.kind === 'object') {
            return type.fieldTypes.get(name) ?? null;
        }

        const structure = type.kind === 'named' ? moduleRegistry.getType(type.name) : undefined;
        const text = structure?.fields[name];

        return text === undefined ? null : Type.parse(text);
    }
}
