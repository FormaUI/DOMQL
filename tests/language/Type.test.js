import { describe, it, expect } from 'vitest';
import { Type } from '#domql/language/Type.mjs';

describe('Type', () => {
    describe('parse', () => {
        it.each([
            ['number', 'named', 'number', false],
            ['element?', 'named', 'element', true],
            ['rectangle', 'named', 'rectangle', false],
            ['T', 'typeParameter', 'T', false],
            ['T?', 'typeParameter', 'T', true],
            ['@selected', 'typeParameter', '@selected', false],
            ['null', 'null', null, true],
            ['never', 'never', null, false],
        ])('reads %s', (text, kind, name, isNullable) => {
            const type = Type.parse(text);

            expect(type).toMatchObject({ kind, name, isNullable });
        });

        it('reads lists and events by their item types', () => {
            expect(Type.parse('list<number>').itemType.name).toBe('number');
            expect(Type.parse('list<T>?')).toMatchObject({ kind: 'list', isNullable: true });
            expect(Type.parse('event<@selected>').itemType.kind).toBe('typeParameter');
            expect(Type.parse('list<list<element?>>').itemType.itemType.isNullable).toBe(true);
        });

        it.each(['', 'list', 'list<>', 'list<number', 'number<number>', '1number', 'a-b', 'list<number>>', 'number?!', null, 5])('refuses %s', text => {
            expect(Type.parse(text)).toBeNull();
        });

        it('answers one type for one notation', () => {
            expect(Type.parse('list<number>')).toBe(Type.parse('list<number>'));
        });
    });

    describe('create', () => {
        it('makes each kind of type, nullable where asked', () => {
            expect(Type.createNamedType('number').equals(Type.parse('number'))).toBe(true);
            expect(Type.createListType(Type.parse('element'), true).equals(Type.parse('list<element>?'))).toBe(true);
            expect(Type.createEventType(Type.parse('number')).equals(Type.parse('event<number>'))).toBe(true);
            expect(Type.createTypeParameter('T', true).equals(Type.parse('T?'))).toBe(true);
            expect(Type.createObjectType(new Map([['width', Type.parse('number')]]), true).toString()).toBe('{ width: number }?');
        });
    });

    describe('toString', () => {
        it.each(['number', 'element?', 'list<T>', 'list<element>?', 'event<@selected>', 'null', 'never', 'list<never>', 'list<null>'])('writes %s back as it was read', text => {
            expect(Type.parse(text).toString()).toBe(text);
        });

        it('writes an object type by its field types', () => {
            expect(Type.createObjectType(new Map([['width', Type.createNamedType('number')]])).toString()).toBe('{ width: number }');
        });
    });

    describe('tryMatchType', () => {
        it('records the argument a type parameter matches', () => {
            const typeArguments = new Map();

            expect(Type.tryMatchType(Type.parse('list<T>'), Type.parse('list<element>'), typeArguments)).toBe(true);
            expect(typeArguments.get('T').toString()).toBe('element');
        });

        it('keeps an item type\'s nullability in the argument it records', () => {
            const typeArguments = new Map();

            Type.tryMatchType(Type.parse('list<T>'), Type.parse('list<number?>'), typeArguments);

            expect(typeArguments.get('T').toString()).toBe('number?');
        });

        it('matches concrete types, recording nothing', () => {
            const typeArguments = new Map();

            expect(Type.tryMatchType(Type.parse('list<element>'), Type.parse('list<element>'), typeArguments)).toBe(true);
            expect(typeArguments.size).toBe(0);
        });

        it.each([
            ['list<T>', 'number'],
            ['list<T>', 'event<number>'],
            ['element', 'window'],
            ['rectangle', 'size'],
        ])('refuses %s against %s', (declaredType, actualType) => {
            expect(Type.tryMatchType(Type.parse(declaredType), Type.parse(actualType), new Map())).toBe(false);
        });

        it('matches never, which no value is, against whatever is declared, recording it for a type parameter', () => {
            const typeArguments = new Map();

            expect(Type.tryMatchType(Type.parse('list<T>'), Type.parse('list<never>'), typeArguments)).toBe(true);
            expect(typeArguments.get('T')).toBe(Type.never);
            expect(Type.tryMatchType(Type.parse('list<number>'), Type.parse('list<never>'), new Map())).toBe(true);
            expect(Type.tryMatchType(Type.parse('element'), Type.never, new Map())).toBe(true);
        });

        it('requires a type parameter met twice to match one type', () => {
            const typeArguments = new Map([['T', Type.parse('number')]]);

            expect(Type.tryMatchType(Type.parse('T'), Type.parse('number?'), typeArguments)).toBe(true);
            expect(Type.tryMatchType(Type.parse('T'), Type.parse('string'), typeArguments)).toBe(false);
        });
    });

    describe('resolveTypeParameters', () => {
        it('replaces a type parameter by its argument, keeping the nullability the parameter wrote', () => {
            const typeArguments = new Map([['T', Type.parse('element')]]);

            expect(Type.parse('T?').resolveTypeParameters(typeArguments).toString()).toBe('element?');
            expect(Type.parse('list<T>').resolveTypeParameters(typeArguments).toString()).toBe('list<element>');
        });

        it('leaves a concrete type, and a type parameter with no argument, as they are', () => {
            const concrete = Type.parse('number');

            expect(concrete.resolveTypeParameters(new Map([['T', Type.parse('element')]]))).toBe(concrete);
            expect(Type.parse('U').resolveTypeParameters(new Map()).toString()).toBe('U');
        });
    });

    describe('merge', () => {
        const merge = (firstType, secondType) => Type.merge(Type.parse(firstType), Type.parse(secondType))?.toString() ?? null;

        it('answers the one type of both, nullable where either is', () => {
            expect(merge('number', 'number')).toBe('number');
            expect(merge('number', 'number?')).toBe('number?');
            expect(merge('null', 'string')).toBe('string?');
            expect(merge('list<element>', 'list<element?>')).toBe('list<element?>');
        });

        it('answers the other type for never, which adds no value', () => {
            expect(merge('never', 'number')).toBe('number');
            expect(merge('element?', 'never')).toBe('element?');
            expect(merge('never', 'null')).toBe('null');
            expect(merge('list<never>', 'list<number>')).toBe('list<number>');
        });

        it('merges object types field by field, whatever their order', () => {
            const firstType = Type.createObjectType(new Map([['a', Type.parse('number')], ['b', Type.parse('string')]]));
            const secondType = Type.createObjectType(new Map([['b', Type.parse('string?')], ['a', Type.parse('number')]]));

            expect(Type.merge(firstType, secondType).toString()).toBe('{ a: number, b: string? }');
        });

        it('answers a node for two different kinds of node, nullable where either is', () => {
            expect(merge('element', 'document')).toBe('node');
            expect(merge('shadowRoot?', 'node')).toBe('node?');
            expect(merge('documentFragment', 'documentFragment')).toBe('documentFragment');
            expect(merge('element', 'window')).toBeNull();
        });

        it('answers null for types of different structures', () => {
            expect(merge('number', 'string')).toBeNull();
            expect(merge('list<number>', 'list<string>')).toBeNull();
            expect(Type.merge(Type.createObjectType(new Map([['a', Type.parse('number')]])), Type.createObjectType(new Map([['b', Type.parse('number')]])))).toBeNull();
        });
    });

    describe('isAssignableTo', () => {
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
            ['never', 'number', true],
            ['never', 'element?', true],
            ['list<never>', 'list<string>', true],
            ['list<null>', 'list<number?>', true],
            ['list<null>', 'list<number>', false],
            ['element', 'node', true],
            ['shadowRoot?', 'node?', true],
            ['list<document>', 'list<node>', true],
            ['node', 'element', false],
            ['document', 'element', false],
            ['window', 'node', false],
        ])('answers %s to %s as %s', (actualType, otherType, answer) => {
            expect(Type.parse(actualType).isAssignableTo(Type.parse(otherType))).toBe(answer);
        });
    });

    it('converts between nullable and non-nullable', () => {
        expect(Type.parse('number').toNullable().toString()).toBe('number?');
        expect(Type.parse('number?').toNonNullable().toString()).toBe('number');
        expect(Type.null.toNonNullable()).toBe(Type.null);
        expect(Type.never.toNullable()).toBe(Type.null);
    });
});
