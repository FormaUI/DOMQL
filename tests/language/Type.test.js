import { describe, it, expect } from 'vitest';
import { Type } from '#domql/language/Type.mjs';

describe('Type', () => {
    describe('parse', () => {
        it.each([
            ['number', 'named', 'number', false],
            ['element?', 'named', 'element', true],
            ['rectangle', 'named', 'rectangle', false],
            ['T', 'variable', 'T', false],
            ['T?', 'variable', 'T', true],
            ['@selected', 'variable', '@selected', false],
            ['null', 'null', null, true],
        ])('reads %s', (text, kind, name, isNullable) => {
            const type = Type.parse(text);

            expect(type).toMatchObject({ kind, name, isNullable });
        });

        it('reads lists and occurrences by their items', () => {
            expect(Type.parse('list<number>').item.name).toBe('number');
            expect(Type.parse('list<T>?')).toMatchObject({ kind: 'list', isNullable: true });
            expect(Type.parse('occurrence<@selected>').item.kind).toBe('variable');
            expect(Type.parse('list<list<element?>>').item.item.isNullable).toBe(true);
        });

        it.each(['', 'list', 'list<>', 'list<number', 'number<number>', '1number', 'a-b', 'list<number>>', 'number?!', null, 5])('refuses %s', text => {
            expect(Type.parse(text)).toBeNull();
        });

        it('answers one type for one notation', () => {
            expect(Type.parse('list<number>')).toBe(Type.parse('list<number>'));
        });
    });

    describe('toString', () => {
        it.each(['number', 'element?', 'list<T>', 'list<element>?', 'occurrence<@selected>', 'null'])('writes %s back as it was read', text => {
            expect(Type.parse(text).toString()).toBe(text);
        });

        it('writes an object type by its fields', () => {
            expect(Type.object(new Map([['width', Type.named('number')]])).toString()).toBe('{ width: number }');
        });
    });

    describe('unify', () => {
        it('binds a variable to the part of the type it stands for', () => {
            const bindings = new Map();

            expect(Type.unify(Type.parse('list<T>'), Type.parse('list<element>'), bindings)).toBe(true);
            expect(bindings.get('T').toString()).toBe('element');
        });

        it('keeps an item\'s nullability when it binds', () => {
            const bindings = new Map();

            Type.unify(Type.parse('list<T>'), Type.parse('list<number?>'), bindings);

            expect(bindings.get('T').toString()).toBe('number?');
        });

        it.each([
            ['list<T>', 'number'],
            ['list<T>', 'occurrence<number>'],
            ['element', 'window'],
            ['rectangle', 'size'],
        ])('refuses %s against %s', (pattern, actual) => {
            expect(Type.unify(Type.parse(pattern), Type.parse(actual), new Map())).toBe(false);
        });

        it('requires a variable met twice to stand for one type', () => {
            const bindings = new Map([['T', Type.parse('number')]]);

            expect(Type.unify(Type.parse('T'), Type.parse('number?'), bindings)).toBe(true);
            expect(Type.unify(Type.parse('T'), Type.parse('string'), bindings)).toBe(false);
        });
    });

    describe('substitute', () => {
        it('replaces a bound variable, keeping the nullability the pattern wrote', () => {
            const bindings = new Map([['T', Type.parse('element')]]);

            expect(Type.substitute(Type.parse('T?'), bindings).toString()).toBe('element?');
            expect(Type.substitute(Type.parse('list<T>'), bindings).toString()).toBe('list<element>');
            expect(Type.substitute(Type.parse('number'), bindings).toString()).toBe('number');
        });

        it('leaves a variable nothing bound', () => {
            expect(Type.substitute(Type.parse('U'), new Map()).toString()).toBe('U');
        });
    });

    describe('join', () => {
        const join = (first, second) => Type.join(Type.parse(first), Type.parse(second))?.toString() ?? null;

        it('answers the one type of both, nullable where either is', () => {
            expect(join('number', 'number')).toBe('number');
            expect(join('number', 'number?')).toBe('number?');
            expect(join('null', 'string')).toBe('string?');
            expect(join('list<element>', 'list<element?>')).toBe('list<element?>');
        });

        it('joins object types field by field, whatever their order', () => {
            const first = Type.object(new Map([['a', Type.parse('number')], ['b', Type.parse('string')]]));
            const second = Type.object(new Map([['b', Type.parse('string?')], ['a', Type.parse('number')]]));

            expect(Type.join(first, second).toString()).toBe('{ a: number, b: string? }');
        });

        it('answers null for types of different structures', () => {
            expect(join('number', 'string')).toBeNull();
            expect(join('list<number>', 'list<string>')).toBeNull();
            expect(Type.join(Type.object(new Map([['a', Type.parse('number')]])), Type.object(new Map([['b', Type.parse('number')]])))).toBeNull();
        });
    });

    describe('isAssignable', () => {
        it.each([
            ['number', 'number', true],
            ['number', 'number?', true],
            ['number?', 'number', false],
            ['number?', 'number?', true],
            ['null', 'number?', true],
            ['null', 'number', false],
            ['number', 'string', false],
            ['list<number>', 'list<number>', true],
            ['list<number>', 'list<number?>', true],
            ['list<number?>', 'list<number>', false],
            ['list<number>', 'list<string>', false],
            ['number', 'list<number>', false],
            ['element', 'window', false],
        ])('answers %s to %s as %s', (actual, expected, answer) => {
            expect(Type.isAssignable(Type.parse(actual), Type.parse(expected))).toBe(answer);
        });
    });

    it('converts between nullable and non-nullable', () => {
        expect(Type.parse('number').toNullable().toString()).toBe('number?');
        expect(Type.parse('number?').toNonNullable().toString()).toBe('number');
        expect(Type.null.toNonNullable()).toBe(Type.null);
    });
});
