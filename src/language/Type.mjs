/**
 * Type — a DOMQL type: a named type, a list, an event source, an object type or a type parameter, each nullable or not
 */

const NAME = /^@?[A-Za-z][A-Za-z0-9]*$/;
const TYPE_PARAMETER = /^(?:[A-Z]|@[A-Za-z][A-Za-z0-9]*)$/;

export class Type {
    /** @type {Map<string, Type | null>} */
    static #parsed = new Map();

    /** The type's kind: named, list, event, object, typeParameter or null. */
    kind;

    /** The type's name, for a named type or a type parameter. */
    name;

    /** The type of a list's items, or of an event source's event data. */
    itemType;

    /** An object type's field types by name. */
    fieldTypes;

    /** Whether the type admits null. */
    isNullable;

    constructor(kind, { name = null, itemType = null, fieldTypes = null, isNullable = false } = {}) {
        this.kind = kind;
        this.name = name;
        this.itemType = itemType;
        this.fieldTypes = fieldTypes;
        this.isNullable = isNullable;
        Object.freeze(this);
    }

    /** The type the notation writes, or null where it is not a type. */
    static parse(text) {
        if (!Type.#parsed.has(text)) {
            Type.#parsed.set(text, new TypeReader(text).readAll());
        }

        return Type.#parsed.get(text);
    }

    /** A named type. */
    static createNamedType(name, isNullable = false) {
        return new Type('named', { name, isNullable });
    }

    /** A list of the item type. */
    static createListType(itemType, isNullable = false) {
        return new Type('list', { itemType, isNullable });
    }

    /** An event source whose events carry data of the item type. */
    static createEventType(itemType, isNullable = false) {
        return new Type('event', { itemType, isNullable });
    }

    /** The object type of the field types, by name. */
    static createObjectType(fieldTypes, isNullable = false) {
        return new Type('object', { fieldTypes, isNullable });
    }

    /** A type parameter a declaration's types write, whose argument matching infers. */
    static createTypeParameter(name, isNullable = false) {
        return new Type('typeParameter', { name, isNullable });
    }

    /** The type of a written null. */
    static get null() {
        return Type.#null;
    }

    static #null = new Type('null', { isNullable: true });

    /** The same type, admitting null. */
    toNullable() {
        return this.isNullable ? this : new Type(this.kind, { name: this.name, itemType: this.itemType, fieldTypes: this.fieldTypes, isNullable: true });
    }

    /** The same type, admitting no null. */
    toNonNullable() {
        return !this.isNullable || this.kind === 'null' ? this : new Type(this.kind, { name: this.name, itemType: this.itemType, fieldTypes: this.fieldTypes, isNullable: false });
    }

    /** Whether the two types are the same, nullability included. */
    equals(otherType) {
        if (this.kind !== otherType.kind || this.name !== otherType.name || this.isNullable !== otherType.isNullable) {
            return false;
        }

        if (this.itemType !== null) {
            return this.itemType.equals(otherType.itemType);
        }

        if (this.fieldTypes !== null) {
            return this.fieldTypes.size === otherType.fieldTypes.size && [...this.fieldTypes].every(([name, fieldType]) => otherType.fieldTypes.get(name)?.equals(fieldType) === true);
        }

        return true;
    }

    /** The notation of the type. */
    toString() {
        let text;

        switch (this.kind) {
            case 'list':
            case 'event':
                text = `${this.kind}<${this.itemType}>`;
                break;
            case 'object':
                text = `{ ${[...this.fieldTypes].map(([name, fieldType]) => `${name}: ${fieldType}`).join(', ')} }`;
                break;
            case 'null':
                return 'null';
            default:
                text = this.name;
        }

        return this.isNullable ? `${text}?` : text;
    }

    /**
     * Whether the actual type matches the declared one, structure for structure: a type parameter the declared type writes matches any type, the first time it is met, and records that type as its argument; a parameter met again matches the type it recorded, nullability aside.
     * @param {Type} declaredType
     * @param {Type} actualType
     * @param {Map<string, Type>} typeArguments The arguments inferred so far, by parameter name, which matching adds to.
     */
    static tryMatchType(declaredType, actualType, typeArguments) {
        if (declaredType.kind === 'typeParameter') {
            const typeArgument = typeArguments.get(declaredType.name);

            if (typeArgument === undefined) {
                typeArguments.set(declaredType.name, actualType);

                return true;
            }

            return typeArgument.toNonNullable().equals(actualType.toNonNullable());
        }

        if (declaredType.kind !== actualType.kind || declaredType.name !== actualType.name) {
            return false;
        }

        return declaredType.itemType === null || Type.tryMatchType(declaredType.itemType, actualType.itemType, typeArguments);
    }

    /**
     * The type with each type parameter that has an argument replaced by it, nullable where the parameter is; a concrete type, and a parameter with no argument, stay as they are.
     * @param {Map<string, Type>} typeArguments The arguments, by parameter name.
     */
    resolveTypeParameters(typeArguments) {
        if (this.kind === 'typeParameter') {
            const typeArgument = typeArguments.get(this.name);

            if (typeArgument === undefined) {
                return this;
            }

            return this.isNullable ? typeArgument.toNullable() : typeArgument;
        }

        if (this.itemType !== null) {
            return new Type(this.kind, { itemType: this.itemType.resolveTypeParameters(typeArguments), isNullable: this.isNullable });
        }

        return this;
    }

    /**
     * The least type holding a value of either type: their one structure, nullable wherever either is, null being of every nullable type; null where their structures differ.
     * @param {Type} firstType
     * @param {Type} secondType
     */
    static merge(firstType, secondType) {
        if (firstType.kind === 'null') {
            return secondType.toNullable();
        }

        if (secondType.kind === 'null') {
            return firstType.toNullable();
        }

        if (firstType.kind !== secondType.kind || firstType.name !== secondType.name) {
            return null;
        }

        const isNullable = firstType.isNullable || secondType.isNullable;

        if (firstType.itemType !== null) {
            const itemType = Type.merge(firstType.itemType, secondType.itemType);

            return itemType === null ? null : new Type(firstType.kind, { itemType, isNullable });
        }

        if (firstType.fieldTypes !== null) {
            if (firstType.fieldTypes.size !== secondType.fieldTypes.size) {
                return null;
            }

            const fieldTypes = new Map();

            for (const [name, fieldType] of firstType.fieldTypes) {
                const otherFieldType = secondType.fieldTypes.get(name);
                const merged = otherFieldType === undefined ? null : Type.merge(fieldType, otherFieldType);

                if (merged === null) {
                    return null;
                }

                fieldTypes.set(name, merged);
            }

            return Type.createObjectType(fieldTypes, isNullable);
        }

        return isNullable ? firstType.toNullable() : firstType;
    }

    /** Whether a value of this type may stand where the other type is declared, a list by its items, and an event source by its event data. */
    isAssignableTo(otherType) {
        if (this.kind === 'null') {
            return otherType.isNullable;
        }

        if (this.isNullable && !otherType.isNullable) {
            return false;
        }

        if (this.kind !== otherType.kind || this.name !== otherType.name) {
            return false;
        }

        return this.itemType === null || this.itemType.isAssignableTo(otherType.itemType);
    }
}

class TypeReader {
    #text;
    #offset = 0;

    constructor(text) {
        this.#text = typeof text === 'string' ? text : '';
    }

    readAll() {
        const type = this.#readType();

        return type !== null && this.#offset === this.#text.length ? type : null;
    }

    #readType() {
        const word = /@?[A-Za-z][A-Za-z0-9]*/y;
        word.lastIndex = this.#offset;
        const match = word.exec(this.#text);

        if (match === null || !NAME.test(match[0])) {
            return null;
        }

        this.#offset = word.lastIndex;

        let type;

        if (this.#text[this.#offset] === '<') {
            if (match[0] !== 'list' && match[0] !== 'event') {
                return null;
            }

            this.#offset++;
            const itemType = this.#readType();

            if (itemType === null || this.#text[this.#offset] !== '>') {
                return null;
            }

            this.#offset++;
            type = match[0] === 'list' ? Type.createListType(itemType) : Type.createEventType(itemType);
        } else if (match[0] === 'null') {
            type = Type.null;
        } else if (TYPE_PARAMETER.test(match[0])) {
            type = Type.createTypeParameter(match[0]);
        } else if (match[0] === 'list' || match[0] === 'event') {
            return null;
        } else {
            type = Type.createNamedType(match[0]);
        }

        if (this.#text[this.#offset] === '?') {
            this.#offset++;
            type = type.toNullable();
        }

        return type;
    }
}
