/**
 * ObjectUtils — tests and a write on JavaScript objects that need no knowledge of the language
 */

export class ObjectUtils {
    /** Whether the value is an object that is neither null nor an array, class instances included. */
    static isNonArrayObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /** Whether the value is an object whose prototype is `Object.prototype` or null, as an object literal, parsed JSON and `Object.create(null)` are. */
    static isPlainObject(value) {
        if (typeof value !== 'object' || value === null) {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);

        return prototype === Object.prototype || prototype === null;
    }

    /**
     * Writes the value to the object's field by assignment, as an ordinary data object takes one, and defines a field named `__proto__` as an own data property, which assigning it would not do,
     * changing the object's prototype instead. It makes no promise about an object whose fields have setters of their own.
     */
    static defineDataProperty(object, name, value) {
        if (name === '__proto__') {
            Object.defineProperty(object, name, { value, writable: true, enumerable: true, configurable: true });
        } else {
            object[name] = value;
        }
    }
}
