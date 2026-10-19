/**
 * Type — a DOMQL type: a named type, a list, an event source, an object type, the object root or a type parameter, each nullable or not, the type of null, and the type no value has
 */

const NAME = /^@?[A-Za-z][A-Za-z0-9]*$/;
const TYPE_PARAMETER = /^(?:[A-Z]|@[A-Za-z][A-Za-z0-9]*)$/;

export class Type {
    /** @type {Map<string, Type | null>} */
    static #parsed = new Map();

    /** The type's kind: named, list, event, object, root, typeParameter, null or never. */
    kind;

    /** The type's name, for a named type or a type parameter. */
    name;

    /** The type of a list's items, or of an event source's event data. */
    itemType;

    /** An object type's field types by name, or the fields of the outermost object the object root reads. */
    fieldTypes;

    /** The object expression that builds the outermost object the object root refers to, which its fields belong to; null for any other type. */
    objectExpression;

    /** Whether the type admits null. */
    isNullable;

    constructor(kind, { name = null, itemType = null, fieldTypes = null, objectExpression = null, isNullable = false } = {}) {
        this.kind = kind;
        this.name = name;
        this.itemType = itemType;
        this.fieldTypes = fieldTypes;
        this.objectExpression = objectExpression;
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

    /**
     * The object root, a reference to the outermost object the object expression builds, through which the fields completed where the reference is written are read: its type identifies the object expression and those fields,
     * and holds no data, so no result holds the reference.
     */
    static createRootType(objectExpression, fieldTypes, isNullable = false) {
        return new Type('root', { fieldTypes, objectExpression, isNullable });
    }

    /** A type parameter a declaration's types write, whose argument matching infers. */
    static createTypeParameter(name, isNullable = false) {
        return new Type('typeParameter', { name, isNullable });
    }

    /** The type of null alone, which fits every nullable type. */
    static get null() {
        return Type.#null;
    }

    static #null = new Type('null', { isNullable: true });

    /** The type no value has, which fits every type: the item type of the empty list. */
    static get never() {
        return Type.#never;
    }

    static #never = new Type('never');

    /** The same type, admitting null; never admitting null is null's type. */
    toNullable() {
        if (this.kind === 'never') {
            return Type.null;
        }

        return this.isNullable ? this : new Type(this.kind, { name: this.name, itemType: this.itemType, fieldTypes: this.fieldTypes, objectExpression: this.objectExpression, isNullable: true });
    }

    /** The same type, admitting no null. */
    toNonNullable() {
        return !this.isNullable || this.kind === 'null' ? this : new Type(this.kind, { name: this.name, itemType: this.itemType, fieldTypes: this.fieldTypes, objectExpression: this.objectExpression, isNullable: false });
    }

    /** Whether the two types are the same, nullability included. */
    equals(otherType) {
        if (this.kind !== otherType.kind || this.name !== otherType.name || this.objectExpression !== otherType.objectExpression || this.isNullable !== otherType.isNullable) {
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
            case 'root':
                text = this.fieldTypes.size === 0 ? 'root { }' : `root { ${[...this.fieldTypes].map(([name, fieldType]) => `${name}: ${fieldType}`).join(', ')} }`;
                break;
            case 'null':
                return 'null';
            case 'never':
                return 'never';
            default:
                text = this.name;
        }

        return this.isNullable ? `${text}?` : text;
    }

    /** The kinds of node, each of which fits where a node is declared. */
    static nodeKinds = Object.freeze(['element', 'document', 'documentFragment', 'shadowRoot']);

    /** Whether the type is a node or one of its kinds. */
    get isNode() {
        return this.kind === 'named' && (this.name === 'node' || Type.nodeKinds.includes(this.name));
    }

    /** Whether a value of the actual type is a value of the declared type by kind: the same named type, or a kind of node where a node is declared. */
    static #fitsByName(declaredType, actualType) {
        return declaredType.name === actualType.name || (declaredType.name === 'node' && actualType.isNode);
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

        // No value is a never, so a never matches whatever is declared.
        if (actualType.kind === 'never') {
            return true;
        }

        if (declaredType.kind !== actualType.kind || !Type.#fitsByName(declaredType, actualType)) {
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
        if (firstType.kind === 'never') {
            return secondType;
        }

        if (secondType.kind === 'never') {
            return firstType;
        }

        if (firstType.kind === 'null') {
            return secondType.toNullable();
        }

        if (secondType.kind === 'null') {
            return firstType.toNullable();
        }

        const isNullable = firstType.isNullable || secondType.isNullable;

        // Object roots merge where they identify one object expression and read the same fields, and with nothing else.
        if (firstType.kind === 'root' || secondType.kind === 'root') {
            return firstType.toNonNullable().equals(secondType.toNonNullable()) ? (isNullable ? firstType.toNullable() : firstType.toNonNullable()) : null;
        }

        // Two kinds of node are both nodes, the least type holding either.
        if (firstType.isNode && secondType.isNode && firstType.name !== secondType.name) {
            return Type.createNamedType('node', isNullable);
        }

        if (firstType.kind !== secondType.kind || firstType.name !== secondType.name) {
            return null;
        }

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
        if (this.kind === 'never') {
            return true;
        }

        if (this.kind === 'null') {
            return otherType.isNullable;
        }

        if (this.isNullable && !otherType.isNullable) {
            return false;
        }

        if (this.kind !== otherType.kind || !Type.#fitsByName(otherType, this)) {
            return false;
        }

        // An object root stands where one of its object expression reads the fields it does.
        if (this.kind === 'root') {
            return this.toNonNullable().equals(otherType.toNonNullable());
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
        } else if (match[0] === 'never') {
            type = Type.never;
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
