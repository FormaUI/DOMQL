import { describe, it, expect } from 'vitest';
import { DomqlQuery } from '#domql/dom/DomqlQuery.mjs';
import { domql } from '#domql/domql.js';
import { LexicaError } from '#lexica/language/LexicaError.mjs';
import { LexicaModule } from '#lexica/language/vocabulary/LexicaModule.mjs';
import { LanguageResolver } from '#lexica/language/LanguageResolver.mjs';
import { ParameterBindings } from '#lexica/language/ParameterBindings.mjs';
import { ParsedTexts } from '#lexica/language/ParsedTexts.mjs';
import { LexicaRegistry } from '#lexica/language/vocabulary/LexicaRegistry.mjs';
import { Vocabulary } from '#lexica/language/vocabulary/Vocabulary.mjs';
import { BrowserVocabulary } from '#domql/dom/BrowserVocabulary.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';

const panel = document.createElement('div');

const resolve = (text, bindings = { panel }, options = {}) => domql.query(text, bindings).resolve(options);

/** The resolver's own resolution of the text, against Lexica's and the DOM vocabulary, which tells what each node resolved to as no public resolution does. */
const resolveInLexica = (text, bindings = { panel }) => {
    const definition = ParsedTexts.parse(text);

    return new LanguageResolver(new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module]), new ParameterBindings(bindings), ParsedTexts.locationsOf(definition)).resolveDefinition(definition);
};
const failure = (text, bindings, options) => {
    try {
        resolve(text, bindings, options);
    } catch (error) {
        expect(error).toBeInstanceOf(LexicaError);
        expect(error.kind).toBe('validation');

        return error;
    }

    throw new Error('The query was resolved');
};

describe('LanguageResolver', () => {
    describe('types', () => {
        it('types a property of the window', () => {
            expect(resolve('domql.window.size').type.toString()).toBe('size');
        });

        it('types a field of a structured type read through an optional access, nullable where its receiver can be null', () => {
            expect(resolve('panel.size?.width').type.toString()).toBe('number?');
        });

        it('types a list property and an aggregate over its items', () => {
            expect(resolve('panel.children.count').type.toString()).toBe('number');
            expect(resolve('panel.children.sum(it.size?.width)').type.toString()).toBe('number');
            expect(resolve('panel.children.max(it.size?.width)').type.toString()).toBe('number?');
        });

        it('keeps the item type through where, first and at', () => {
            expect(resolve('panel.children.where(it.attached).first?.size').type.toString()).toBe('size?');
            expect(resolve('panel.children:[0]?.size').type.toString()).toBe('size?');
        });

        it('types an object expression by its written field names', () => {
            expect(resolve('panel { size = it.size, hasFocus = it.focus() }').type.toString()).toBe('{ size: size?, hasFocus: boolean }');
        });

        it('types a bound value by the type it has', () => {
            expect(resolve('count', { count: 3 }).type.toString()).toBe('number');
            expect(resolve('nothing', { nothing: null }).type.toString()).toBe('null');
        });

        it.each([
            ['the result', 'panel.loose'],
            ['a field', 'panel { v = it.loose }'],
            ['an argument', 'panel.children:[panel.loose]'],
            ['an expression', 'panel.children.where(it.loose).count'],
            ['an operand of and', 'panel.loose and 1'],
            ['a condition', 'if panel.loose then 1 else 2 end'],
            ['what not negates', 'not panel.loose'],
            ['a conditional binding', 'if let v = panel.loose then 1 else 2 end'],
            ['a receiver', 'panel.loose.count'],
            ['a subject', 'panel.loose.attached'],
        ])('refuses a type parameter no receiver gives an argument as %s, so its value never reaches a result', (_, text) => {
            const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, new LexicaModule('loose', {
                members: [{ name: 'loose', kind: 'property', target: 'element', result: 'T', updates: { changes: 'constant', reads: 'fresh' } }],
            })]);
            const query = domql.query(text, { panel });

            expect(() => new LanguageResolver(registry, new ParameterBindings({ panel }), null).resolveDefinition(query.definition)).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringMatching(/\bT\b/) }));
        });
    });

    describe('requests', () => {
        it('resolves a chain of properties and functions as a query', () => {
            expect(resolve('panel.size').kind).toBe('value');
        });

        it('resolves an event source as a subscription', () => {
            const resolved = resolve('domql.document.on("keydown") { key = it.key }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type).toBe('{ key: string }');
        });

        it('shapes the events of an event source by the fields of their event data', () => {
            const resolved = resolve('panel.on("click") { clientX = it.clientX, button = it.button }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type).toBe('{ clientX: number, button: number }');
        });

        it('refuses an answer that is no data', () => {
            expect(failure('panel.parent').message).toContain('no data');
            expect(failure('panel.on("click") { target = it.target }').message).toContain('no data');
        });

        it('refuses a member after an event source, a host call', () => {
            expect(failure('panel.on("click").count').message).toContain('follows a host call');
        });

        it('refuses an event source, a host call, as an argument', () => {
            expect(failure('panel.matches(panel.on("click"))').message).toContain('is a host call');
        });
    });

    describe('executions', () => {
        /** A module whose one member, named for it, is an execution of the mode given on an element. */
        const member = (name, executionMode, result) => DispatchTable.createModule(name, {
            members: [{ name, kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode, target: 'element', parameters: [], result }],
        });
        const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, member('step', 'once', 'boolean'), member('pick', 'once', 'element'), member('focusTrap', 'continuous', undefined)]);
        const resolveWith = text => {
            const query = domql.query(text, { panel });

            return new LanguageResolver(registry, new ParameterBindings({ panel }), null).resolveDefinition(query.definition);
        };
        const failureWith = text => {
            try {
                resolveWith(text);
            } catch (error) {
                expect(error.kind).toBe('validation');

                return error;
            }

            throw new Error('The request was resolved');
        };

        it('resolves a once execution as the host call the script ends in, typed by its result', () => {
            const resolved = resolveWith('panel.step()');

            expect(resolved.hostCall.name).toBe('step');
            expect(resolved.type.toString()).toBe('boolean');
        });

        it('shapes the result of a once execution by the result projection that follows it', () => {
            const resolved = resolveWith('panel.pick() { id = it:attribute["id"] }');

            expect(resolved.hostCall.name).toBe('pick');
            expect(resolved.type.toString()).toBe('{ id: string? }');
        });

        it('refuses a once execution whose result is no data, unless a result projection follows it', () => {
            expect(failureWith('panel.pick()').message).toContain('no data');
        });

        it('resolves a continuous execution, which declares no result and so takes no result projection', () => {
            expect(resolveWith('panel.focusTrap()').type).toBeNull();
            expect(failureWith('panel.focusTrap() { id = it:attribute["id"] }').message).toContain('declares no result, since its host supplies no values, so it takes no result projection');
        });

        it('refuses a member after an execution, and an execution inside a query', () => {
            expect(failureWith('panel.step().count').message).toContain('follows a host call');
            expect(failureWith('{ moved = panel.step() }').message).toContain('is a host call');
            expect(failureWith('panel.matches(panel.focusTrap())').message).toContain('is a host call');
        });
    });

    describe('receivers', () => {
        it('refuses a member the receiver does not declare', () => {
            const error = failure('panel.devicePixelRatio');

            expect(error.message).toContain('not available on element');
        });

        it('refuses an unknown member', () => {
            expect(failure('panel.nonsense').message).toContain('no member of the vocabulary');
        });

        it('refuses a list member on an element and an element member on a list', () => {
            expect(failure('panel.count').message).toContain('not available');
            expect(failure('panel.children.size').message).toContain('not available on list<element>');
        });

        it('resolves an optional access of null whatever its name, and an optional call by its name and form, of the result its declarations share made nullable', () => {
            expect(resolve('null?.size').type.toString()).toBe('size?');
            expect(resolve('null?.sise').type.toString()).toBe('null');
            expect(failure('null?.sise()').message).toContain('no member of the vocabulary');
            expect(failure('null?.size()').message).toContain('is a property');
        });

        it('refuses an expression on a receiver that has no items', () => {
            expect(failure('panel.sum(it.size?.width)').message).toContain('not available');
        });
    });

    describe('arguments', () => {
        it('refuses a missing required argument', () => {
            expect(failure('panel.matches()').message).toContain("requires the argument 'selector'");
        });

        it('refuses a value where a function takes its arguments as the fields of an object', () => {
            const error = failure('panel.overlaps(panel)');

            expect(error.message).toContain('as the fields of an object');
            expect(error.location.pointer).toBe('/expression/arguments/0');
        });

        it('supplies positional parameters in order, an optional one left out taking its default, and refuses more arguments than parameters', () => {
            const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, new LexicaModule('clamp', {
                members: [{
                    name: 'clamp', kind: 'function', target: 'element', arguments: 'positional', result: 'number', updates: { changes: 'constant', reads: 'fresh' },
                    parameters: [{ name: 'low', kind: 'value', type: 'number', required: true, nulls: 'propagate' }, { name: 'high', kind: 'value', type: 'number', required: false, default: 10, nulls: 'propagate' }],
                }],
            })]);
            const resolveWith = text => {
                const query = domql.query(text, { panel });

                return new LanguageResolver(registry, new ParameterBindings({ panel }), null).resolveDefinition(query.definition);
            };

            expect(resolveWith('panel.clamp(1, 5)').resolutionOf(domql.query('panel.clamp(1, 5)').definition.expression).arguments.map(argument => argument.parameter.name)).toEqual(['low', 'high']);
            expect(resolveWith('panel.clamp(1)').resolutionOf(domql.query('panel.clamp(1)').definition.expression).arguments[1]).toMatchObject({ isDefault: true, value: 10 });
            expect(() => resolveWith('panel.clamp(1, 5, 9)')).toThrow(expect.objectContaining({ message: expect.stringContaining("'clamp' takes at most 2 arguments, and is given 3"), location: expect.objectContaining({ pointer: '/expression/arguments/2' }) }));
            expect(() => resolveWith('panel.clamp()')).toThrow(expect.objectContaining({ message: expect.stringContaining("'clamp' requires the argument 'low'") }));
        });

        it('refuses more arguments than a member takes, and a second argument where it takes options', () => {
            const closest = failure('panel.closest(".a", ".b")');

            expect(closest.message).toContain("'closest' takes one argument, and is given 2");
            expect(closest.location.pointer).toBe('/expression/arguments/1');
            expect(failure('panel.overlaps({ other = panel }, 1)').message).toContain("'overlaps' takes its arguments as the fields of one object, as { other = … }");
        });

        it('refuses an argument given to a function that takes none', () => {
            const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, new LexicaModule('ping', {
                members: [{ name: 'ping', kind: 'function', target: 'element', parameters: [], result: 'boolean', updates: { changes: 'constant', reads: 'fresh' } }],
            })]);
            const query = domql.query('panel.ping(1)', { panel });

            expect(() => new LanguageResolver(registry, new ParameterBindings({ panel }), null).resolveDefinition(query.definition)).toThrow(expect.objectContaining({ message: expect.stringContaining("'ping' takes no argument") }));
        });

        it('refuses an argument of the wrong type', () => {
            expect(failure('panel.matches(3)').message).toContain('expects string and finds number');
        });

        it('refuses a field of an options object that names no parameter, and one that leaves a required parameter out', () => {
            const unknown = failure('panel.overlaps({ other = panel, nonsense = 1 })');

            expect(unknown.message).toContain("no parameter 'nonsense'; it takes other, margin");
            expect(unknown.location.pointer).toBe('/expression/arguments/0/fields/1');
            expect(failure('panel.overlaps({ margin = 1 })').message).toContain("requires the argument 'other'");
        });

        it('refuses an access or a call of a receiver that can be null, giving the optional form', () => {
            expect(failure('panel.first(".a").size').message).toContain(`'size' follows element?, which can be null: write 'panel.first(".a")?.size'`);
            expect(failure('null.size').message).toContain("'size' follows null: write 'null?.size'");
            expect(failure('panel.first(".a").closest(".b")').message).toContain(`write 'panel.first(".a")?.closest(".b")'`);
            expect(failure('(panel.parent?.children).count').message).toContain("write '(panel.parent?.children)?.count'");
        });

        it('types an optional chain nullable where an optional access of it can meet null, and as its chain otherwise', () => {
            expect(resolve('(panel.parent as element)?.size').type.toString()).toBe('size?');
            expect(resolve('panel.parent?.children.count').type.toString()).toBe('number?');
            expect(resolve('panel?.children.count').type.toString()).toBe('number');
            expect(resolve('(panel.parent as element)?.rect?.width').type.toString()).toBe('number?');
        });

        it('types a coalescing operator as its value made non-null where its fallback is, and as their merged type', () => {
            expect(resolve('panel.rect?.width ?? 0').type.toString()).toBe('number');
            expect(resolve('panel.rect?.width ?? (panel.parent as element)?.rect?.width').type.toString()).toBe('number?');
            expect(resolve('panel.children.count ?? 0').type.toString()).toBe('number');
            expect(resolve('null ?? "none"').type.toString()).toBe('string');
        });

        it('refuses a coalescing operator whose sides are of different types, or no values', () => {
            expect(failure('panel.rect?.width ?? "none"').message).toContain("The value and the fallback of '??' are of one type, and these are number? and string");
            expect(failure('panel.on("click") ?? 0').message).toContain("The value of '??' is a value, and this one is a host call");
        });

        // A node is no data, so its type is read from the refusal of a result that would hold one.
        const heldType = (text, bindings) => failure(text, bindings).message.match(/would hold (\S+),/)[1];

        it('types a node\'s tree members, and a node of two kinds as a node', () => {
            expect(heldType('panel.parent')).toBe('node?');
            expect(heldType('panel.root')).toBe('node');
            expect(heldType('panel.root.host')).toBe('element?');
            expect(resolve('domql.document.all("p").count').type.toString()).toBe('number');
            expect(heldType('if wide then panel else domql.document end', { panel, wide: true })).toBe('node');
        });

        it('types an element\'s shadow view by its own members, which are no element\'s, and refuses it as data', () => {
            expect(resolve('panel.shadow.root?.children.count').type.toString()).toBe('number?');
            expect(resolve('panel.shadow.elements?.count').type.toString()).toBe('number?');
            expect(heldType('panel.shadow')).toBe('shadow');
            expect(failure('panel.shadow.rect').message).toContain("'rect' is not available on shadow");
            expect(failure('panel.root.shadow').message).toContain("'shadow' is not available on node");
        });

        it('types a strict cast as the type it casts to, nullable where its target can be null, and an attempted one as that type made nullable', () => {
            expect(heldType('panel.parent as element')).toBe('element?');
            expect(resolve('(panel.parent as element)?.rect?.width').type.toString()).toBe('number?');
            expect(heldType('panel as element')).toBe('element');
            expect(heldType('panel as node')).toBe('node');
            expect(heldType('null as shadowRoot')).toBe('shadowRoot?');
            expect(heldType('try panel as element')).toBe('element?');
            expect(heldType('try panel.parent as element')).toBe('element?');
            expect(resolve('try n to number', { n: '1' }).type.toString()).toBe('number?');
            expect(resolve('try n to number ?? 0', { n: '1' }).type.toString()).toBe('number');
        });

        it('refuses a cast to a type that is no node, and one its target can never be', () => {
            expect(failure('panel as widget').message).toContain("'as' casts to node or one of its kinds, element, document, documentFragment, shadowRoot, and 'widget' is none of them");
            expect(failure('domql.document as element').message).toContain('A value of document can never be cast to element');
            expect(failure('try domql.document as element').message).toContain('A value of document can never be cast to element');
            expect(failure('try panel as widget').message).toContain("'as' casts to node or one of its kinds");
            expect(failure('5 as element').message).toContain('A value of number can never be cast to element');
        });

        it('types an optional enclosed access as the optional chain it writes', () => {
            expect(resolve('(?(panel.parent as element).rect.width)').type.toString()).toBe('number?');
            expect(resolve('(?panel.children.count)').type.toString()).toBe('number');
        });

        it('takes a call of a receiver that can be null only through optional access, which answers null where it is', () => {
            expect(failure('(panel.parent as element).matches(".row")').message).toContain(`write '(panel.parent as element)?.matches(".row")'`);
            expect(resolve('(panel.parent as element)?.matches(".row")').type.toString()).toBe('boolean?');
            expect(resolve('panel.matches(".row")').type.toString()).toBe('boolean');
        });

        it('refuses a member written in a form its declaration does not take, giving the form it does', () => {
            expect(failure('domql.window.media("(min-width: 1px)")').message).toContain(`'media' is an indexer: write 'domql.window:media["(min-width: 1px)"]'`);
            expect(failure('panel.attribute("id")').message).toContain(`'attribute' is an indexer: write 'panel:attribute["id"]'`);
            expect(failure('panel:closest[".row"]').message).toContain(`'closest' uses call syntax: write 'panel.closest(".row")'`);
            expect(failure('panel.parent()').message).toContain("'parent' is a property: write 'panel.parent'");
            expect(failure('panel.size?.width()').message).toContain("write 'panel.size?.width'");
        });

        it('resolves an omitted argument to its default', () => {
            const resolved = resolveInLexica('panel.intersects()');
            const [, margin] = resolved.getResolution('/expression').arguments;

            expect(resolved.type.toString()).toBe('boolean?');
            expect(margin.isDefault).toBe(true);
            expect(margin.value).toBe(0);
        });

        it('accepts a null for a parameter that accepts it', () => {
            expect(resolve('panel.intersects({ root = null })').type.toString()).toBe('boolean?');
        });
    });

    describe('null', () => {
        it('makes a call answer null for a null argument of a propagating parameter', () => {
            const resolved = resolve('panel.matches(selector)', { panel, selector: null });

            expect(resolved.type.toString()).toBe('boolean?');
        });

        it('makes a call answer null for a written null on a propagating parameter', () => {
            expect(resolve('domql.window:media["(min-width: 1px)"]').type.toString()).toBe('boolean');
            expect(resolve('domql.window:media[null]').type.toString()).toBe('boolean?');
        });

        it('lets an aggregate expression produce null per item', () => {
            expect(resolve('panel.children.sum(it.size?.width)').type.toString()).toBe('number');
        });

        it('refuses an aggregate expression of another type', () => {
            expect(failure('panel.children.sum(it:attribute["id"])').message).toContain('must produce number?');
        });
    });

    describe('fixed names', () => {
        it('resolves a bracket property access to the type the properties its names name share', () => {
            expect(resolve('panel["children"].count').type.toString()).toBe('number');
            expect(resolve('panel[name]', { panel, name: 'size' }).type.toString()).toBe('size?');
            expect(resolve('panel { let name = if wide then "size" else "clientSize" end, s = it[name] }', { panel, wide: true }).type.toString()).toBe('{ s: size? }');
            expect(resolve('panel[null ?? "size"]').type.toString()).toBe('size?');
        });

        it('determines the names a conditional binding gives as its value does, without null, in its consequent', () => {
            expect(resolve('let key = if let name = chosen then name else "clientSize" end\nreturn panel[key]', { panel, chosen: 'size' }).type.toString()).toBe('size?');
            expect(resolve('if let name = chosen then panel[name] else null end', { panel, chosen: 'size' }).type.toString()).toBe('size?');
            expect(failure('if let name = panel:["data-name"] then panel[name] else null end', { panel }).message).toContain('A bracket property access reads a name determined when the expression is resolved');
        });

        it.each([
            ['an and and an or settle, a flag bound true', 'panel[wide and "size" or "rect"]', { wide: true }, 'size?'],
            ['an and and an or settle, a flag bound false', 'panel[wide and "size" or "rect"]', { wide: false }, 'rectangle?'],
            ['an and and an or choose between, by a value read when the query is evaluated', 'panel[panel.first(".a") and "size" or "clientSize"]', {}, 'size?'],
            ['an or gives past a falsey middle operand, which passes evaluation on', 'panel[wide and label or "rect"]', { wide: true, label: null }, 'rectangle?'],
            ['an or gives from a truthy middle operand', 'panel[wide and label or "rect"]', { wide: true, label: 'size' }, 'size?'],
            ['an or gives past a null operand', 'panel[first or second]', { first: null, second: 'size' }, 'size?'],
            ['a conditional whose fixed condition selects one branch, the other left unread', 'panel[if wide then "size" else "nonsense" end]', { wide: true }, 'size?'],
            ['a conditional whose condition is read when the query is evaluated, either branch possible', 'panel[if panel.attached then "size" else "clientSize" end]', {}, 'size?'],
            ['a coalescing operator whose value cannot be null, its fallback never asked for names', 'panel["size" ?? panel:["x"]]', {}, 'size?'],
        ])('resolves a bracket property access to the names %s', (_, text, bindings, type) => {
            expect(resolve(text, { panel, ...bindings }).type.toString()).toBe(type);
        });

        it.each([
            ['an and that can give false', 'panel[wide and "size"]', { wide: false }, "A bracket property access reads a string, and 'wide and \"size\"' can be false"],
            ['a name an and and an or reach that no property has', 'panel[wide and "nonsense" or "size"]', { wide: true }, "'nonsense' is no member of the vocabulary"],
            ['an and of a Boolean member and a name, whose values no one type holds', 'panel { v = it[it.attached and "size" or "clientSize"] }', {}, "What 'and' gives is false or string"],
            ['a value that is no name', 'panel[count]', { count: 5 }, 'A bracket property access reads a name determined when the expression is resolved'],
            ['a fallback whose names go unasked, which is validated all the same', 'panel["size" ?? panel.nonsense]', {}, "'nonsense' is no member of the vocabulary"],
        ])('refuses a bracket property access through %s', (_, text, bindings, message) => {
            expect(failure(text, { panel, ...bindings }).message).toContain(message);
        });

        it('refuses a bracket property access whose names cannot be determined, can be null, name no property or are of different types', () => {
            expect(failure('panel[panel:attribute["data-name"]]').message).toContain('A bracket property access reads a name determined when the expression is resolved');
            expect(failure('panel[name]', { panel, name: null }).message).toContain("A bracket property access reads a string, and 'name' can be null");
            expect(failure('panel["depth"]').message).toContain("'depth' is no member of the vocabulary");
            expect(failure('panel[if panel.attached then "size" else "children" end]', { panel }).message).toContain('are of one type, and these are size?, list<element>');
        });

        it('refuses a bracket property access of a receiver that can be null, giving the optional form', () => {
            expect(failure('panel.first(".a")[name]', { panel, name: 'size' }).message).toContain(`write 'panel.first(".a")?[name]'`);
            expect(resolve('panel.first(".a")?[name]', { panel, name: 'size' }).type.toString()).toBe('size?');
            expect(resolve('row?[name]', { row: null, name: 'id' }).type.toString()).toBe('null');
        });

        it('resolves an event type', () => {
            expect(resolve('domql.document.on("keydown") { key = it.key }').type).toBe('{ key: string }');
        });

        it('resolves an event type held in a local whose value is a literal or a bound parameter, and refuses one whose value reads the document', () => {
            expect(resolve('let type = "keydown"\nreturn domql.document.on(type) { key = it.key }').type).toBe('{ key: string }');
            expect(resolve('let type = chosen\nreturn domql.document.on(type) { key = it.key }', { chosen: 'keydown' }).type).toBe('{ key: string }');
            expect(failure('let type = if panel.attached then "keydown" else "keyup" end\nreturn domql.document.on(type) { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
        });

        it.each([
            ['an and and an or', 'domql.document.on(wide and "keydown" or "keyup") { key = it.key }', { wide: true }],
            ['an and and an or, the other way', 'domql.document.on(wide and "keyup" or "keydown") { key = it.key }', { wide: false }],
            ['a conditional', 'domql.document.on(if wide then "keydown" else "nothing" end) { key = it.key }', { wide: true }],
            ['a conditional binding', 'let chosen = if let t = kind then t else "nothing" end\nreturn domql.document.on(chosen) { key = it.key }', { kind: 'keydown' }],
            ['a coalescing operator whose value is null', 'domql.document.on(kind ?? "keydown") { key = it.key }', { kind: null }],
            ['a coalescing operator whose value is not', 'domql.document.on(kind ?? "nothing") { key = it.key }', { kind: 'keydown' }],
            ['a local holding one of them', 'let t = wide and "keydown" or "nothing"\nreturn domql.document.on(t) { key = it.key }', { wide: true }],
        ])('resolves an event type %s settles when the expression is resolved, the side it does not take left unselected', (_, text, bindings) => {
            expect(() => resolve(text, bindings)).not.toThrow();
        });

        it('refuses an event type an expression settles to a name the vocabulary lacks, and one that reads the document to settle', () => {
            expect(failure('domql.document.on(wide and "keydown" or "nothing") { key = it.key }', { wide: false }).message).toContain("The type selector 'event' maps no type to the key 'nothing'");
            expect(failure('domql.document.on(if panel.attached then "keydown" else "keydown" end) { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
            expect(failure('domql.document.on(panel:["data-t"] ?? "keydown") { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
        });

        it('resolves an event type a conditional binding holds where its value is a literal or a bound parameter, and refuses one any other expression gives', () => {
            expect(resolve('let type = if let chosen = "keydown" then chosen else "keyup" end\nreturn domql.document.on(type) { key = it.key }').type).toBe('{ key: string }');
            expect(resolve('let type = if let chosen = kind then chosen else "keyup" end\nreturn domql.document.on(type) { key = it.key }', { kind: 'keydown' }).type).toBe('{ key: string }');
            expect(failure('let type = if let chosen = panel:["data-t"] then chosen else "keyup" end\nreturn domql.document.on(type) { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
        });

        it('refuses an event type the vocabulary does not declare', () => {
            expect(failure('panel.on("nonsense")').message).toContain("The type selector 'event' maps no type to the key 'nonsense'");
        });
    });

    describe('modules', () => {
        it('resolves against the types, Boolean members and event types a registered module contributes', () => {
            const module = new LexicaModule('charts', {
                types: [{ name: 'chartEvent', fields: { value: 'number' } }],
                selectableTypes: [{ name: 'chart-selected', selector: 'event', type: 'chartEvent' }],
                members: [{ name: 'charts', kind: 'property', target: 'element', result: 'boolean', updates: { changes: 'constant', reads: 'fresh' } }],
            });

            const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabulary.module, module]);
            const element = document.createElement('div');
            const resolveWith = text => {
                const query = domql.query(text, { panel: element });

                return new LanguageResolver(registry, new ParameterBindings({ panel: element }), null).resolveDefinition(query.definition);
            };
            const events = resolveWith('panel.on("chart-selected") { value = it.value }');
            const test = resolveWith('panel.charts');

            expect(events.type.toString()).toBe('{ value: number }');
            expect(test.type.toString()).toBe('boolean');
        });
    });

    describe('observation', () => {
        it('lets a query follow anything', () => {
            expect(() => resolve('panel.matches(":hover")')).not.toThrow();
        });

        it('refuses a watch of a partly observable member unless it accepts partial observation', () => {
            const error = failure('panel.matches(":hover")', { panel }, { watch: true });

            expect(error.message).toContain('misses pointer state');
            expect(() => resolve('panel.matches(":hover")', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('refuses a watch of a client size unless it accepts partial observation, since its border box and its content box can keep their sizes while it changes', () => {
            expect(failure('panel.clientSize', { panel }, { watch: true }).message).toContain("'element.clientSize' (which misses a change that leaves its border box and its content box as they were, as its border and padding changing by the same amount)");
            expect(() => resolve('panel.clientSize', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('names each member it refuses by the type its declaration is for', () => {
            const error = failure('{ a = panel.root.children.count, b = panel.shadow.root?.children.count, c = panel.attached, d = panel.first("p")?.rect?.width }', { panel }, { watch: true });

            expect(error.message).toContain("'node.root' (which misses a detached tree inserted");
            expect(error.message).toContain("'shadow.root' (which misses a shadow root attached");
            expect(error.message).toContain("'element.attached' (which misses");
            expect(error.message).toContain("'node.first' (which misses pointer state");
            expect(error.message).toContain("'element.rect' (which misses a move its own size");
        });

        it('lets a watch follow what is observable', () => {
            expect(() => resolve('panel.size', { panel }, { watch: true })).not.toThrow();
        });

        it('lists the declarations a request uses', () => {
            const names = resolve('panel.children.count').usedDeclarations.map(use => use.declaration.name);

            expect(names).toEqual(['children', 'count']);
        });
    });

    describe('errors', () => {
        it('locates an error in the query text', () => {
            const error = failure('panel.matches(3)');

            expect(error.location.line).toBe(1);
            expect(error.location.column).toBe(15);
            expect(error.location.pointer).toBe('/expression/arguments/0');
        });

        it('points into a definition that has no text', () => {
            const definition = {
                version: 32,
                expression: { kind: 'member', target: { kind: 'parameter', name: 'panel' }, name: 'nonsense', arguments: [] },
            };

            try {
                domql.query(definition, { panel }).resolve();
            } catch (error) {
                expect(error.location.pointer).toBe('/expression');

                return;
            }

            throw new Error('The query was resolved');
        });

        it('resolves without a browser-bound evaluation', () => {
            expect(resolve('panel.size').definition).toBe(domql.query('panel.size', { panel }).definition);
        });
    });

    describe('equalities', () => {
        it('type an equality as a Boolean that is never null, whatever its operands', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('boolean');
            expect(resolve('panel.first("a")?.rect?.width == 0').type.toString()).toBe('boolean');
            expect(resolve('panel != panel').type.toString()).toBe('boolean');
            expect(resolve('panel.parent == domql.document').type.toString()).toBe('boolean');
            expect(resolve('panel.rect == null').type.toString()).toBe('boolean');
            expect(resolve('missing == "x"', { missing: null }).type.toString()).toBe('boolean');
        });

        it('refuse two values whose types fit neither way', () => {
            expect(failure('"1" == 1').message).toContain("'==' compares values whose types fit one way or the other, and string and number fit neither way");
            expect(failure('panel == domql.document').message).toContain('element and document fit neither way');
            expect(failure('panel.attached == "true"').message).toContain('boolean and string fit neither way');
        });

        it('compare a value that is no string, number, Boolean or node with null alone', () => {
            expect(failure('panel.rect == panel.rect').message).toContain("'==' compares a value of rectangle with null alone");
            expect(failure('panel.children == panel.children').message).toContain('a value of list<element> with null alone');
            expect(failure('domql.window == domql.window').message).toContain('a value of window with null alone');
            expect(failure('panel.on("click") { x = it.clientX } == null').message).toContain("'==' compares values, and this is a host call");
        });

        it('give the test to write for a value compared with the name of one of its Boolean members, a property or a function, and nothing for any other', () => {
            expect(failure('panel == "attached"').message).toContain("a test is the member that answers it, so write 'panel.attached'");
            expect(failure('panel != "attached"').message).toContain("write 'not panel.attached'");
            expect(failure('panel == state', { panel, state: 'disabled' }).message).toContain("write 'panel.disabled()'");
            expect(failure('panel != "disabled"').message).toContain("write 'not panel.disabled()'");
            expect(failure('panel.first("a") == "focus"').message).toContain(`write 'panel.first("a")?.focus()'`);
            expect(failure('panel == "visible"').message).not.toContain('write');
            expect(failure('panel == "Attached"').message).not.toContain('write');
            expect(failure('panel == "children"').message).not.toContain('write');
        });
    });

    describe('tests', () => {
        it('resolve a test as the Boolean member it is, a property or a function, nullable where an optional access reads it', () => {
            const resolved = resolveInLexica('panel.disabled()');

            expect(resolved.type.toString()).toBe('boolean');
            expect(resolved.getResolution('/expression').declaration.name).toBe('disabled');
            expect(resolve('(panel.parent as element)?.attached').type.toString()).toBe('boolean?');
            expect(resolve('(panel.parent as element)?.disabled()').type.toString()).toBe('boolean?');
            expect(resolve('panel[name]', { panel, name: 'attached' }).type.toString()).toBe('boolean');
            expect(resolve('domql.document.visible() and domql.document.focus()').type.toString()).toBe('boolean');
        });

        it('refuse a test the receiver has not, naming the receiver that has it', () => {
            expect(failure('panel.visible()').message).toContain("'visible' is not available on element; it is available on document");
            expect(failure('domql.document.attached').message).toContain("'attached' is not available on document; it is available on element");
        });

        it('give a verb the test as a function, a module\'s by reference selected by the receiver it is called with, and refuse a name', () => {
            expect(resolve('panel.has(domql.focus) and domql.document.has(domql.focus)').type.toString()).toBe('boolean');
            expect(resolve('domql.window.supports(domql.share) and domql.document.is(domql.visible)').type.toString()).toBe('boolean');
            expect(resolve('panel.is(x => x.disabled() or x.readonly())').type.toString()).toBe('boolean');
            expect(failure('panel.is(domql.visible)').message).toContain("'domql.visible' names no function that takes those or answers that: it names (document) => boolean");
            expect(failure('panel.has("focus")').message).toContain("The parameter 'test' of 'has' takes a function");
        });

        it('test for null with is null, a Boolean that is never null, whatever its subject', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('boolean');
            expect(resolve('null == null').type.toString()).toBe('boolean');
            expect(failure('panel.on("click") { clientX = it.clientX } == null').message).toContain('a host call');
        });
    });

    describe('narrowing', () => {
        const local = (name, text) => `panel { let ${name} = it.first(".a"), let other = it.first(".b"), r = ${text} }`;

        it.each([
            ['the right operand of an and, where the left is the local', local('a', 'a and a.rect'), '{ r: rectangle? }'],
            ['the right operand of an and, where the left says the local is not null', local('a', 'a != null and a.attached'), '{ r: boolean }'],
            ['the right operand of an or, where the left says the local is null', local('a', 'a == null or a.attached'), '{ r: boolean }'],
            ['the right operand of an or, where the left negates the local', local('a', 'not a or a.attached'), '{ r: boolean }'],
            ['the consequent, where the condition is the local', local('a', 'if a then a.attached else false end'), '{ r: boolean }'],
            ['the alternative, where the condition says the local is null', local('a', 'if a == null then false else a.attached end'), '{ r: boolean }'],
            ['the consequent, where an and of conditions holds both', local('a', 'if a != null and other != null then a.attached and other.attached else false end'), '{ r: boolean }'],
            ['the consequent, where every path of an or holds the local', local('a', 'if (a != null and other != null) or (a != null and panel.attached) then a.attached else false end'), '{ r: boolean }'],
            ['a later elseif, where an earlier condition says the local is null', local('a', 'if a == null then 0 elseif a.attached then 1 else 2 end'), '{ r: number }'],
            ['the consequent of a binding, where its value is the local', local('a', 'if let b = a then a.attached and b.attached else false end'), '{ r: boolean }'],
        ])('narrows a local in %s', (_, text, type) => {
            expect(resolve(text).type.toString()).toBe(type);
        });

        it.each([
            ['an or, which says neither is not null', local('a', 'if a != null or other != null then a.attached else false end'), '/expression/fields/0/value/consequent'],
            ['the alternative of a condition that is the local', local('a', 'if a then false else a.attached end'), '/expression/fields/0/value/alternative'],
            ['a member read anew, whose text is the same', 'panel.first(".a") and panel.first(".a").attached', '/expression/operands/1'],
            ['another local of the same name, in another object expression', 'panel { x = { let a = it.first(".a"), v = a and a.attached }, y = { let a = it.first(".b"), v = a.attached } }', '/expression/fields/1/value/fields/0/value'],
        ])('narrows nothing through %s', (_, text, pointer) => {
            const error = failure(text);

            expect(error.message).toContain("write '");
            expect(error.message).toContain('?.attached');
            expect(error.location.pointer).toBe(pointer);
        });

        it('keeps what it knows of a local in the object expressions and the expressions nested where it holds', () => {
            expect(resolve('panel { let a = it.first(".a"), v = a and panel.children { w = a.attached, u = it.attached } }').type.toString()).toBe('{ v: list<{ w: boolean, u: boolean }>? }');
            expect(resolve('panel { let a = it.first(".a"), v = a and panel.children.where(a.attached).count }').type.toString()).toBe('{ v: number? }');
        });
    });

    describe('logical expressions', () => {
        it('type an and, an or and a not as a Boolean', () => {
            expect(resolve('panel.attached and panel.focus()').type.toString()).toBe('boolean');
            expect(resolve('panel.attached or (((panel.parent as element)?.attached) ?? false)').type.toString()).toBe('boolean');
            expect(resolve('not panel.attached').type.toString()).toBe('boolean');
        });

        it('type an and and an or as the operands that can decide them: the falsey part of each before the last, for and, the truthy part for or, and the last', () => {
            expect(resolve('panel.attached or (panel.parent as element)?.attached').type.toString()).toBe('boolean?');
            expect(resolve('panel.first(".a") and 5').type.toString()).toBe('number?');
            expect(resolve('(panel.first(".a") or panel).attached').type.toString()).toBe('boolean');
            expect(resolve('panel.children.count and panel.size').type.toString()).toBe('size?');
            expect(resolve('panel.rect and true').type.toString()).toBe('boolean?');
            expect(resolve('name or "default"', { name: null }).type.toString()).toBe('string');
            expect(resolve('not off', { off: null }).type.toString()).toBe('boolean');
            expect(resolve('not panel.first(".a")').type.toString()).toBe('boolean');
        });

        it('type an and or an or whose fixed operands decide it as the operand that does', () => {
            expect(resolve('true and "value"').type.toString()).toBe('string');
            expect(resolve('false or "fallback"').type.toString()).toBe('string');
            expect(resolve('true and false or "fallback"').type.toString()).toBe('string');
            expect(resolve('on and panel.children.count', { on: true, panel }).type.toString()).toBe('number');
            expect(resolve('on and panel.children.count', { on: false, panel }).type.toString()).toBe('boolean');
        });

        it.each([
            ['a Boolean and an element', 'panel.attached and panel', "What 'and' gives is false or element, which no one type holds; write 'if panel.attached then panel else null end' if null is an acceptable alternative"],
            ['a Boolean or a number', 'panel.attached or 3', "What 'or' gives is true or number, which no one type holds; a conditional, 'if … then … else … end', chooses between values of one type"],
            ['a nullable Boolean and a string', '(panel.parent as element)?.attached and "x"', "What 'and' gives is false or null or string"],
        ])('refuse an and or an or of %s, whose values no one type holds', (_, text, message) => {
            const error = failure(text);

            expect(error.message).toContain(message);
            expect(error.location.pointer).toBe('/expression');
        });

        it('refuse an operand that is no value', () => {
            expect(failure('panel.on("click") and true').message).toContain("An operand of 'and' is a value, and this one is a host call");
            expect(failure('not panel.on("click")').message).toContain("What 'not' negates is a value, and this one is a host call");
        });

        it('resolve every operand with its own location, the implicit parameter of each the one around the expression', () => {
            const resolved = resolveInLexica('panel { both = it.attached and (it.disabled() or it.focus()) }');

            expect(resolved.getResolution('/expression/fields/0/value/operands/0').declaration.name).toBe('attached');
            expect(resolved.getResolution('/expression/fields/0/value/operands/1/operands/1').declaration.name).toBe('focus');
        });

        it('validate an operand that evaluation might never reach', () => {
            const error = failure('panel.attached or panel.nonsense');

            expect(error.message).toContain("'nonsense' is no member of the vocabulary");
            expect(error.location.pointer).toBe('/expression/operands/1');
        });

        it('count every operand when a watch asks what can be followed', () => {
            const error = failure('panel.attached or panel.textEditable()', { panel }, { watch: true });

            expect(error.message).toContain("'element.textEditable' (which misses the document's design mode)");
            expect(() => resolve('panel.attached or panel.textEditable()', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('let a group start a chain', () => {
            expect(resolve('(panel).children.count').type.toString()).toBe('number');
        });
    });

    describe('locals', () => {
        it('type a use of a local as the value it names', () => {
            expect(resolve('panel { let size = it.size, width = size?.width }').type.toString()).toBe('{ width: number? }');
            expect(resolve('panel { let rows = it.children, rows = rows { key = it:attribute["data-key"] } }').type.toString()).toBe('{ rows: list<{ key: string? }> }');
        });

        it('resolve a local where it is written, whatever implicit parameter its use has', () => {
            expect(resolve('panel { let size = it.size, rows = it.children { size = size } }').type.toString()).toBe('{ rows: list<{ size: size? }> }');
        });

        it('let a local hold what is no data, which no field can', () => {
            expect(resolve('panel { let first = it.children:[0], key = first?:attribute["data-key"] }').type.toString()).toBe('{ key: string? }');
        });

        it('validate a local no field uses', () => {
            expect(failure('panel { let wrong = it.nonsense, a = 1 }').location.pointer).toBe('/expression/locals/0/value');
        });

        it('refuse a local that is no value', () => {
            expect(failure('panel { let clicks = it.on("click"), a = 1 }').message).toContain("The local 'clicks' is a host call, and a local is a value");
        });
    });

    describe('conditionals', () => {
        it('type a conditional by its branches, nullable where either is', () => {
            expect(resolve('if wide then 1 else 2 end', { panel, wide: true }).type.toString()).toBe('number');
            expect(resolve('if wide then panel.size?.width else 0 end', { panel, wide: true }).type.toString()).toBe('number?');
            expect(resolve('if wide then "on" else null end', { panel, wide: true }).type.toString()).toBe('string?');
            expect(resolve('if wide then { width = 1 } else { width = panel.size?.width } end', { panel, wide: true }).type.toString()).toBe('{ width: number? }');
        });

        it('type an elseif as the conditional it is nested in the alternative', () => {
            expect(resolve('if a then 1 elseif b then null else 3 end', { a: true, b: false }).type.toString()).toBe('number?');
        });

        it('refuse branches of different types, naming both', () => {
            const error = failure('if wide then 1 else "one" end', { panel, wide: true });

            expect(error.message).toContain("The branches of 'if' are of one type, and these are number and string");
            expect(error.location.pointer).toBe('/expression/alternative');
            expect(failure('if wide then { a = 1 } else { b = 1 } end', { panel, wide: true }).message).toContain('{ a: number } and { b: number }');
        });

        it('take a condition of any value, and refuse one that is no value', () => {
            expect(resolve('if panel.size then 1 else 2 end').type.toString()).toBe('number');
            expect(resolve('if (panel.parent as element)?.attached then 1 else 2 end').type.toString()).toBe('number');
            expect(resolve('if panel.children then 1 else 2 end').type.toString()).toBe('number');

            const error = failure('if panel.on("click") then 1 else 2 end');

            expect(error.message).toContain("The condition of 'if' is a value, and this one is a host call");
            expect(error.location.pointer).toBe('/expression/condition');
        });

        it('validate a branch that evaluation might never reach', () => {
            expect(failure('if wide then 1 else panel.nonsense end', { panel, wide: true }).location.pointer).toBe('/expression/alternative');
        });

        it('type is null as a Boolean that is never null, whatever its subject', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('boolean');
            expect(resolve('null == null').type.toString()).toBe('boolean');
        });
    });

    describe('the resolved definition', () => {
        it('names each field of each object expression once, as it is written', () => {
            const resolved = resolveInLexica('panel { size = it.size, kind = it:attribute["role"], attached = it.attached, clientSize = it["clientSize"], rows = it.all("i") { rect = it.rect } }');
            const { expression: query } = resolved.definition;

            expect(resolved.fieldNamesOf(query)).toEqual(['size', 'kind', 'attached', 'clientSize', 'rows']);
            expect(resolved.fieldNamesOf(query.fields[4].value)).toEqual(['rect']);
        });

        it('finds each node, by the node itself, with its pointer and its resolution', () => {
            const resolved = resolveInLexica('panel.all("i") { h = it.size?.height, on = it.attached or it.focus() }');
            const { expression: query } = resolved.definition;
            const [chain, on] = query.fields.map(field => field.value);
            const height = chain.target;

            expect(resolved.pointerOf(query.target)).toBe('/expression/target');
            expect(resolved.resolutionOf(query.target).declaration.name).toBe('all');
            expect(resolved.pointerOf(height.target)).toBe('/expression/fields/0/value/target/target');
            expect(resolved.resolutionOf(height).kind).toBe('field');
            expect(resolved.resolutionOf(chain)).toBeUndefined();
            expect(resolved.pointerOf(on.operands[1])).toBe('/expression/fields/1/value/operands/1');
            expect(resolved.resolutionOf(on.operands[1]).declaration.name).toBe('focus');
            expect(resolved.resolutionOf(query)).toBeUndefined();
        });
    });
});

