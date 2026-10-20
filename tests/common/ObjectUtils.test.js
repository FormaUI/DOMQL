import { describe, it, expect } from 'vitest';
import { ObjectUtils } from '#domql/common/ObjectUtils.mjs';

describe('ObjectUtils', () => {
    class Point {
        constructor() {
            this.x = 1;
        }
    }

    describe('isNonArrayObject', () => {
        it('accepts every object that is neither null nor an array, a class instance and an object with no prototype included', () => {
            for (const value of [{}, { a: 1 }, Object.create(null), new Point(), new Date(0), new Map()]) {
                expect(ObjectUtils.isNonArrayObject(value)).toBe(true);
            }
        });

        it('refuses null, a list and every value that is no object', () => {
            for (const value of [null, undefined, [], [1], 'text', 1, true, () => {}]) {
                expect(ObjectUtils.isNonArrayObject(value)).toBe(false);
            }
        });
    });

    describe('isPlainObject', () => {
        it('accepts an object whose prototype is Object.prototype or null, as a literal, parsed JSON and Object.create(null) are', () => {
            for (const value of [{}, { a: 1 }, JSON.parse('{ "a": 1 }'), Object.create(null)]) {
                expect(ObjectUtils.isPlainObject(value)).toBe(true);
            }
        });

        it('refuses a class instance, a list, null and every value that is no object', () => {
            for (const value of [new Point(), new Date(0), new Map(), [], null, undefined, 'text', 1]) {
                expect(ObjectUtils.isPlainObject(value)).toBe(false);
            }
        });
    });

    describe('defineDataProperty', () => {
        it('writes an ordinary field by assignment', () => {
            const object = { a: 1 };

            ObjectUtils.defineDataProperty(object, 'a', 2);
            ObjectUtils.defineDataProperty(object, 'b', 3);

            expect(object).toEqual({ a: 2, b: 3 });
        });

        it('writes a field named __proto__ as an own data field, leaving the prototype as it was', () => {
            const object = {};
            const value = { polluted: true };

            ObjectUtils.defineDataProperty(object, '__proto__', value);

            expect(Object.keys(object)).toEqual(['__proto__']);
            expect(Object.getOwnPropertyDescriptor(object, '__proto__')).toEqual({ value, writable: true, enumerable: true, configurable: true });
            expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
            expect(object.polluted).toBeUndefined();
        });
    });
});
