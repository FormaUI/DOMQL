import { describe, it, expect } from 'vitest';
import { nexo, NexoError } from '@formaui-net/nexo';
import { domql } from '#domql/domql.js';
import { LanguageResolver } from '#nexo/language/LanguageResolver.mjs';
import { ParameterBindings } from '#nexo/language/ParameterBindings.mjs';
import { ParsedTexts } from '#nexo/language/ParsedTexts.mjs';
import { NexoRegistry } from '#nexo/language/vocabulary/NexoRegistry.mjs';
import { Vocabulary } from '#nexo/language/vocabulary/Vocabulary.mjs';
import { BrowserVocabularyDeclarations } from '#domql/dom/BrowserVocabularyDeclarations.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';

const panel = document.createElement('div');

const resolve = (text, bindings = { panel }, options = {}) => domql.query(text, bindings).resolve(options);

/** How a member that never changes reads. */
const CONSTANT = { changes: 'constant', reads: 'fresh' };

/** An extension of DOMQL's elements, named for the module it stands in, holding the members given. */
const elementExtension = (moduleName, members) => ({ name: `${moduleName}Elements`, kind: 'extension', target: 'Domql.Element', members });

/** A registry of DOMQL's declarations and the modules given, resolving a text with each module supplied as an import, as DOMQL supplies its own. */
const registryOf = (...modules) => {
    const registry = nexo.createRegistry([BrowserVocabularyDeclarations.module, ...modules]);
    const imports = ['Domql', ...modules.map(module => module.name)];

    return { resolve: (text, bindings = { panel }) => registry.resolve(text, bindings, { imports }) };
};

/** The resolver's own resolution of the text, against Nexo's and the DOM vocabulary and the modules given, which tells what each node resolved to as no public resolution does. */
const resolveInNexo = (text, bindings = { panel }, modules = []) => {
    const definition = nexo.parse(text, { imports: ['Domql', ...modules.map(module => module.name)] });
    const registry = new NexoRegistry([Vocabulary.module, BrowserVocabularyDeclarations.module, ...modules]);

    return new LanguageResolver(registry, new ParameterBindings(registry, bindings), ParsedTexts.locationsOf(definition)).resolveDefinition(definition);
};

/** The validation error of the code given that resolving the query throws. */
const failure = (code, text, bindings, options) => {
    try {
        resolve(text, bindings, options);
    } catch (error) {
        expect(error).toBeInstanceOf(NexoError);
        expect(error.kind).toBe('validation');
        expect(error.code).toBe(code);

        return error;
    }

    throw new Error('The query was resolved');
};

describe('LanguageResolver', () => {
    describe('types', () => {
        it('types a property of the window', () => {
            expect(resolve('Domql.window.size').type.toString()).toBe('Size');
        });

        it('types a field of a structured type read through an optional access, nullable where its receiver can be null', () => {
            expect(resolve('panel.size?.width').type.toString()).toBe('Number?');
        });

        it('types a list property and an aggregate over its items', () => {
            expect(resolve('panel.children.count').type.toString()).toBe('Number');
            expect(resolve('panel.children.sum(it.size?.width)').type.toString()).toBe('Number');
            expect(resolve('panel.children.max(it.size?.width)').type.toString()).toBe('Number?');
        });

        it('keeps the item type through where, first and at', () => {
            expect(resolve('panel.children.where(it.attached).first?.size').type.toString()).toBe('Size?');
            expect(resolve('panel.children[0]?.size').type.toString()).toBe('Size?');
        });

        it('types an object expression by its written field names', () => {
            expect(resolve('panel { size = it.size, hasFocus = it.focused }').type.toString()).toBe('{ size: Size?, hasFocus: Boolean }');
        });

        it('types a bound value by the type it has', () => {
            expect(resolve('count', { count: 3 }).type.toString()).toBe('Number');
            expect(resolve('nothing', { nothing: null }).type.toString()).toBe('null');
        });

        it('refuses a member whose result writes a type parameter nothing binds, so its value never reaches a result', () => {
            const loose = nexo.createModule('Loose', { types: [elementExtension('Loose', [{ name: 'loose<T>', kind: 'property', result: 'T', updates: CONSTANT }])] });

            expect(() => registryOf(loose)).toThrow(expect.objectContaining({
                kind: 'module',
                code: 'NEXO4011',
                message: expect.stringMatching(/\bT\b/),
                location: { module: 'Loose', type: 'LooseElements', declaration: 'loose', declarationKey: 'result' },
            }));
        });
    });

    describe('requests', () => {
        it('resolves a chain of properties and functions as a query', () => {
            expect(resolve('panel.size').kind).toBe('value');
        });

        it('resolves an event source as a subscription', () => {
            const resolved = resolve('Domql.document.on("keydown") { key = it.key }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type).toBe('{ key: String }');
        });

        it('shapes the events of an event source by the fields of their event data', () => {
            const resolved = resolve('panel.on("click") { clientX = it.clientX, button = it.button }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type).toBe('{ clientX: Number, button: Number }');
        });

        it('refuses an answer that is no data', () => {
            expect(failure('NEXO3043', 'panel.parent').message).toContain('no data');
            expect(failure('NEXO3043', 'panel.on("click") { target = it.target }').message).toContain('no data');
        });

        it('refuses a member after an event source, a host call', () => {
            expect(failure('NEXO3048', 'panel.on("click").count').message).toContain('follows a host call');
        });

        it('refuses an event source, a host call, as an argument', () => {
            expect(failure('NEXO3048', 'panel.matches(panel.on("click"))').message).toContain('is a host call');
        });
    });

    describe('executions', () => {
        /** A module of the name, whose one member is an execution of the mode given on an element. */
        const member = (moduleName, name, executionMode, result) => DispatchTable.createModule(moduleName, {
            types: [elementExtension(moduleName, [{ name, kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode, parameters: [], ...(result === undefined ? {} : { result }) }])],
        });
        const { resolve: resolveWith } = registryOf(member('Step', 'step', 'once', 'Boolean'), member('Pick', 'pick', 'once', 'Domql.Element'), member('FocusTrap', 'focusTrap', 'continuous'));
        const failureWith = (code, text) => {
            try {
                resolveWith(text);
            } catch (error) {
                expect(error.kind).toBe('validation');
                expect(error.code).toBe(code);

                return error;
            }

            throw new Error('The request was resolved');
        };

        it('resolves a once execution as the host call the script ends in, typed by its result', () => {
            const resolved = resolveWith('panel:step()');

            expect(resolved.hostCall.name).toBe('step');
            expect(resolved.type.toString()).toBe('Boolean');
        });

        it('shapes the result of a once execution by the result projection that follows it', () => {
            const resolved = resolveWith('panel:pick() { id = it.attribute["id"] }');

            expect(resolved.hostCall.name).toBe('pick');
            expect(resolved.type.toString()).toBe('{ id: String? }');
        });

        it('refuses a once execution whose result is no data, unless a result projection follows it', () => {
            expect(failureWith('NEXO3043', 'panel:pick()').message).toContain('no data');
        });

        it('resolves a continuous execution, which declares no result and so takes no result projection', () => {
            expect(resolveWith('panel:focusTrap()').type).toBeNull();
            expect(failureWith('NEXO3049', 'panel:focusTrap() { id = it.attribute["id"] }').message).toContain('declares no result, since its host supplies no values, so it takes no result projection');
        });

        it('refuses a member after an execution, and an execution inside a query', () => {
            expect(failureWith('NEXO3048', 'panel:step().count').message).toContain('follows a host call');
            expect(failureWith('NEXO3048', '{ moved = panel:step() }').message).toContain('is a host call');
            expect(failureWith('NEXO3048', 'panel.matches(panel:focusTrap())').message).toContain('is a host call');
        });
    });

    describe('receivers', () => {
        it('refuses a member the receiver does not declare', () => {
            const error = failure('NEXO3001', 'panel.devicePixelRatio');

            expect(error.message).toContain('not available on Element');
        });

        it('refuses an unknown member', () => {
            expect(failure('NEXO3001', 'panel.nonsense').message).toContain('no member of the vocabulary');
        });

        it('refuses a list member on an element and an element member on a list', () => {
            expect(failure('NEXO3001', 'panel.count').message).toContain('not available');
            expect(failure('NEXO3001', 'panel.children.size').message).toContain('not available on List<Element>');
        });

        it('resolves an optional access of null whatever its name, and an optional call by its name and form, of the result its declarations share made nullable', () => {
            expect(resolve('null?.size').type.toString()).toBe('Size?');
            expect(resolve('null?.sise').type.toString()).toBe('null');
            expect(failure('NEXO3001', 'null?.sise()').message).toContain('no member of the vocabulary');
            expect(failure('NEXO3017', 'null?.size()').message).toContain('is a property');
        });

        it('refuses an expression on a receiver that has no items', () => {
            expect(failure('NEXO3001', 'panel.sum(it.size?.width)').message).toContain('not available');
        });
    });

    describe('arguments', () => {
        it('refuses a missing required argument', () => {
            expect(failure('NEXO3080', 'panel.matches()').message).toContain("requires the argument 'selector'");
        });

        it('refuses a value where a function takes its arguments as the object fields of an object', () => {
            const error = failure('NEXO3057', 'panel.overlaps(panel)');

            expect(error.message).toContain('as the object fields of an object');
            expect(error.location.pointer).toBe('/expression/arguments/0');
        });

        it('supplies positional parameters in order, an optional one left out taking its default, and refuses more arguments than parameters', () => {
            const clamp = nexo.createModule('Clamp', {
                types: [elementExtension('Clamp', [{
                    name: 'clamp', kind: 'function', arguments: 'positional', result: 'Number', updates: CONSTANT,
                    parameters: [{ name: 'low', kind: 'value', type: 'Number', required: true, nulls: 'propagate' }, { name: 'high', kind: 'value', type: 'Number', required: false, default: 10, nulls: 'propagate' }],
                }])],
            });
            const { resolve: resolveWith } = registryOf(clamp);
            const argumentsOf = text => resolveInNexo(text, { panel }, [clamp]).getResolution('/expression').arguments;

            expect(argumentsOf('panel:clamp(1, 5)').map(argument => argument.parameter.name)).toEqual(['low', 'high']);
            expect(argumentsOf('panel:clamp(1)')[1]).toMatchObject({ isDefault: true, value: 10 });
            expect(() => resolveWith('panel:clamp(1, 5, 9)')).toThrow(expect.objectContaining({ code: 'NEXO3058', message: expect.stringContaining("'clamp' takes at most 2 arguments, and is given 3"), location: expect.objectContaining({ pointer: '/expression/arguments/2' }) }));
            expect(() => resolveWith('panel:clamp()')).toThrow(expect.objectContaining({ code: 'NEXO3080', message: expect.stringContaining("'clamp' requires the argument 'low'") }));
        });

        it('refuses more arguments than a member takes, and a second argument where it takes options', () => {
            const closest = failure('NEXO3058', 'panel.closest(".a", ".b")');

            expect(closest.message).toContain("'closest' takes one argument, and is given 2");
            expect(closest.location.pointer).toBe('/expression/arguments/1');
            expect(failure('NEXO3058', 'panel.overlaps({ other = panel }, 1)').message).toContain("'overlaps' takes its arguments as the object fields of one object, as { other = … }");
        });

        it('refuses an argument given to a function that takes none', () => {
            const ping = nexo.createModule('Ping', { types: [elementExtension('Ping', [{ name: 'ping', kind: 'function', parameters: [], result: 'Boolean', updates: CONSTANT }])] });

            expect(() => registryOf(ping).resolve('panel:ping(1)')).toThrow(expect.objectContaining({ code: 'NEXO3058', message: expect.stringContaining("'ping' takes no argument") }));
        });

        it('refuses an argument of the wrong type', () => {
            expect(failure('NEXO3042', 'panel.matches(3)').message).toContain('expects String and finds Number');
        });

        it('refuses an object field of an options object that names no parameter, and one that leaves a required parameter out', () => {
            const unknown = failure('NEXO3018', 'panel.overlaps({ other = panel, nonsense = 1 })');

            expect(unknown.message).toContain("no parameter 'nonsense'; it takes other, margin");
            expect(unknown.location.pointer).toBe('/expression/arguments/0/objectFields/1');
            expect(failure('NEXO3080', 'panel.overlaps({ margin = 1 })').message).toContain("requires the argument 'other'");
        });

        it('refuses an access or a call of a receiver that can be null, giving the optional form', () => {
            expect(failure('NEXO3008', 'panel.first(".a").size').message).toContain(`'size' follows Element?, which can be null: write 'panel.first(".a")?.size'`);
            expect(failure('NEXO3008', 'null.size').message).toContain("'size' follows null: write 'null?.size'");
            expect(failure('NEXO3008', 'panel.first(".a").closest(".b")').message).toContain(`write 'panel.first(".a")?.closest(".b")'`);
            expect(failure('NEXO3008', '(panel.parent?.children).count').message).toContain("write '(panel.parent?.children)?.count'");
        });

        it('types an optional chain nullable where an optional access of it can meet null, and as its chain otherwise', () => {
            expect(resolve('(panel.parent as Element)?.size').type.toString()).toBe('Size?');
            expect(resolve('panel.parent?.children.count').type.toString()).toBe('Number?');
            expect(resolve('panel?.children.count').type.toString()).toBe('Number');
            expect(resolve('(panel.parent as Element)?.rect?.width').type.toString()).toBe('Number?');
        });

        it('types a coalescing operator as its value made non-null where its fallback is, and as their merged type', () => {
            expect(resolve('panel.rect?.width ?? 0').type.toString()).toBe('Number');
            expect(resolve('panel.rect?.width ?? (panel.parent as Element)?.rect?.width').type.toString()).toBe('Number?');
            expect(resolve('panel.children.count ?? 0').type.toString()).toBe('Number');
            expect(resolve('null ?? "none"').type.toString()).toBe('String');
        });

        it('refuses a coalescing operator whose sides are of different types, or no values', () => {
            expect(failure('NEXO3041', 'panel.rect?.width ?? "none"').message).toContain("The value and the fallback of '??' are of one type, and these are Number? and String");
            expect(failure('NEXO3048', 'panel.on("click") ?? 0').message).toContain("The value of '??' is a value, and this one is a host call");
        });

        // A node is no data, so its type is read from the refusal of a result that would hold one.
        const heldType = (text, bindings) => failure('NEXO3043', text, bindings).message.match(/would hold (\S+),/)[1];

        it('types a node\'s tree members, and a node of two kinds as a node', () => {
            expect(heldType('panel.parent')).toBe('Node?');
            expect(heldType('panel.root')).toBe('Node');
            expect(heldType('panel.root.host')).toBe('Element?');
            expect(resolve('Domql.document.all("p").count').type.toString()).toBe('Number');
            expect(heldType('if wide then panel else Domql.document end', { panel, wide: true })).toBe('Node');
        });

        it('types an element\'s shadow view by its own members, which are no element\'s, and refuses it as data', () => {
            expect(resolve('panel.shadow.root?.children.count').type.toString()).toBe('Number?');
            expect(resolve('panel.shadow.elements?.count').type.toString()).toBe('Number?');
            expect(heldType('panel.shadow')).toBe('Shadow');
            expect(failure('NEXO3001', 'panel.shadow.rect').message).toContain("'rect' is not available on Shadow");
            expect(failure('NEXO3001', 'panel.root.shadow').message).toContain("'shadow' is not available on Node");
        });

        it('types a strict cast as the type it casts to, nullable where its target can be null, and an attempted one as that type made nullable', () => {
            expect(heldType('panel.parent as Element')).toBe('Element?');
            expect(resolve('(panel.parent as Element)?.rect?.width').type.toString()).toBe('Number?');
            expect(heldType('panel as Element')).toBe('Element');
            expect(heldType('panel as Node')).toBe('Node');
            expect(heldType('null as ShadowRoot')).toBe('ShadowRoot?');
            expect(heldType('try panel as Element')).toBe('Element?');
            expect(heldType('try panel.parent as Element')).toBe('Element?');
            expect(resolve('try n to Number', { n: '1' }).type.toString()).toBe('Number?');
            expect(resolve('try n to Number ?? 0', { n: '1' }).type.toString()).toBe('Number');
        });

        it('refuses a cast to a type that is no reference type, and one its target can never be', () => {
            expect(failure('NEXO3019', 'panel as widget').message).toContain("'as' casts to a reference type, and 'widget' is none");
            expect(failure('NEXO3060', 'Domql.document as Element').message).toContain('A value of Document can never be cast to Element');
            expect(failure('NEXO3060', 'try Domql.document as Element').message).toContain('A value of Document can never be cast to Element');
            expect(failure('NEXO3019', 'try panel as widget').message).toContain("'as' casts to a reference type");
            expect(failure('NEXO3060', '5 as Element').message).toContain('A value of Number can never be cast to Element');
        });

        it('types an optional enclosed access as the optional chain it writes', () => {
            expect(resolve('(?(panel.parent as Element).rect.width)').type.toString()).toBe('Number?');
            expect(resolve('(?panel.children.count)').type.toString()).toBe('Number');
        });

        it('takes a call of a receiver that can be null only through optional access, which answers null where it is', () => {
            expect(failure('NEXO3008', '(panel.parent as Element).matches(".row")').message).toContain(`write '(panel.parent as Element)?.matches(".row")'`);
            expect(resolve('(panel.parent as Element)?.matches(".row")').type.toString()).toBe('Boolean?');
            expect(resolve('panel.matches(".row")').type.toString()).toBe('Boolean');
        });

        it('refuses a member written in a form its declaration does not take, giving the form it does', () => {
            expect(failure('NEXO3011', 'Domql.window.media("(min-width: 1px)")').message).toContain(`'media' is an indexer: write 'Domql.window.media["(min-width: 1px)"]'`);
            expect(failure('NEXO3011', 'panel.attribute("id")').message).toContain(`'attribute' is an indexer: write 'panel.attribute["id"]'`);
            expect(failure('NEXO3054', 'panel.closest[".row"]').message).toContain(`'closest' uses call syntax: write 'panel.closest(".row")'`);
            expect(failure('NEXO3017', 'panel.parent()').message).toContain("'parent' is a property: write 'panel.parent'");
            expect(failure('NEXO3017', 'panel.size?.width()').message).toContain("write 'panel.size?.width'");
        });

        it('resolves an omitted argument to its default', () => {
            const resolved = resolveInNexo('panel.intersects()');
            const [, margin] = resolved.getResolution('/expression').arguments;

            expect(resolved.type.toString()).toBe('Boolean?');
            expect(margin.isDefault).toBe(true);
            expect(margin.value).toBe(0);
        });

        it('accepts a null for a parameter that accepts it', () => {
            expect(resolve('panel.intersects({ root = null })').type.toString()).toBe('Boolean?');
        });
    });

    describe('null', () => {
        it('makes a call answer null for a null argument of a propagating parameter', () => {
            const resolved = resolve('panel.matches(selector)', { panel, selector: null });

            expect(resolved.type.toString()).toBe('Boolean?');
        });

        it('makes a call answer null for a written null on a propagating parameter', () => {
            expect(resolve('Domql.window.media["(min-width: 1px)"]').type.toString()).toBe('Boolean');
            expect(resolve('Domql.window.media[null]').type.toString()).toBe('Boolean?');
        });

        it('lets an aggregate expression produce null per item', () => {
            expect(resolve('panel.children.sum(it.size?.width)').type.toString()).toBe('Number');
        });

        it('refuses an aggregate expression of another type', () => {
            expect(failure('NEXO3042', 'panel.children.sum(it.attribute["id"])').message).toContain('must produce Number?');
        });
    });

    describe('fixed names', () => {
        it('resolves a computed property access to the type the properties its names name share', () => {
            expect(resolve('panel.["children"].count').type.toString()).toBe('Number');
            expect(resolve('panel.[name]', { panel, name: 'size' }).type.toString()).toBe('Size?');
            expect(resolve('panel { let name = if wide then "size" else "clientSize" end, s = it.[name] }', { panel, wide: true }).type.toString()).toBe('{ s: Size? }');
            expect(resolve('panel.[null ?? "size"]').type.toString()).toBe('Size?');
        });

        it('determines the names a conditional binding gives as its value does, without null, in its consequent', () => {
            expect(resolve('let key = if let name = chosen then name else "clientSize" end\nreturn panel.[key]', { panel, chosen: 'size' }).type.toString()).toBe('Size?');
            expect(resolve('if let name = chosen then panel.[name] else null end', { panel, chosen: 'size' }).type.toString()).toBe('Size?');
            expect(failure('NEXO3014', 'if let name = panel["data-name"] then panel.[name] else null end', { panel }).message).toContain('A computed property access reads a name determined when the expression is resolved');
        });

        it.each([
            ['an and and an or settle, a flag bound true', 'panel.[wide and "size" or "rect"]', { wide: true }, 'Size?'],
            ['an and and an or settle, a flag bound false', 'panel.[wide and "size" or "rect"]', { wide: false }, 'Rectangle?'],
            ['an and and an or choose between, by a value read when the query is evaluated', 'panel.[panel.first(".a") and "size" or "clientSize"]', {}, 'Size?'],
            ['an or gives past a falsey middle operand, which passes evaluation on', 'panel.[wide and label or "rect"]', { wide: true, label: null }, 'Rectangle?'],
            ['an or gives from a truthy middle operand', 'panel.[wide and label or "rect"]', { wide: true, label: 'size' }, 'Size?'],
            ['an or gives past a null operand', 'panel.[first or second]', { first: null, second: 'size' }, 'Size?'],
            ['a conditional whose fixed condition selects one branch, the other left unread', 'panel.[if wide then "size" else "nonsense" end]', { wide: true }, 'Size?'],
            ['a conditional whose condition is read when the query is evaluated, either branch possible', 'panel.[if panel.attached then "size" else "clientSize" end]', {}, 'Size?'],
            ['a coalescing operator whose value cannot be null, its fallback never asked for names', 'panel.["size" ?? panel["x"]]', {}, 'Size?'],
            ['an and of a Boolean member and a name, whose false the or after it replaces', 'panel { v = it.[it.attached and "size" or "clientSize"] }', {}, '{ v: Size? }'],
        ])('resolves a computed property access to the names %s', (_, text, bindings, type) => {
            expect(resolve(text, { panel, ...bindings }).type.toString()).toBe(type);
        });

        it.each([
            ['an and that can give false', 'panel.[wide and "size"]', { wide: false }, 'NEXO3013', "A computed property access reads a string, and 'wide and \"size\"' can be false"],
            ['a name an and and an or reach that no property has', 'panel.[wide and "nonsense" or "size"]', { wide: true }, 'NEXO3056', "'nonsense' is no member of the vocabulary"],
            ['a value that is no name', 'panel.[count]', { count: 5 }, 'NEXO3013', "A computed property access reads a string, and 'count' can be a value that is not one"],
            ['a fallback whose names go unasked, which is validated all the same', 'panel.["size" ?? panel.nonsense]', {}, 'NEXO3001', "'nonsense' is no member of the vocabulary"],
        ])('refuses a computed property access through %s', (_, text, bindings, code, message) => {
            expect(failure(code, text, { panel, ...bindings }).message).toContain(message);
        });

        it('refuses a computed property access whose names cannot be determined, can be null, name no property or are of different types', () => {
            expect(failure('NEXO3014', 'panel.[panel.attribute["data-name"]]').message).toContain('A computed property access reads a name determined when the expression is resolved');
            expect(failure('NEXO3013', 'panel.[name]', { panel, name: null }).message).toContain("A computed property access reads a string, and 'name' can be null");
            expect(failure('NEXO3001', 'panel.["depth"]').message).toContain("'depth' is no member of the vocabulary");
            expect(failure('NEXO3015', 'panel.[if panel.attached then "size" else "children" end]', { panel }).message).toContain('are of one type, and these are Size?, List<Element>');
        });

        it('refuses a computed property access of a receiver that can be null, giving the optional form', () => {
            expect(failure('NEXO3008', 'panel.first(".a").[name]', { panel, name: 'size' }).message).toContain(`write 'panel.first(".a")?.[name]'`);
            expect(resolve('panel.first(".a")?.[name]', { panel, name: 'size' }).type.toString()).toBe('Size?');
            expect(resolve('row?.[name]', { row: null, name: 'id' }).type.toString()).toBe('null');
        });

        it('resolves an event type', () => {
            expect(resolve('Domql.document.on("keydown") { key = it.key }').type).toBe('{ key: String }');
        });

        it('resolves an event type held in a local whose value is a literal or a bound parameter, and refuses one whose value reads the document', () => {
            expect(resolve('let type = "keydown"\nreturn Domql.document.on(type) { key = it.key }').type).toBe('{ key: String }');
            expect(resolve('let type = chosen\nreturn Domql.document.on(type) { key = it.key }', { chosen: 'keydown' }).type).toBe('{ key: String }');
            expect(failure('NEXO3006', 'let type = if panel.attached then "keydown" else "keyup" end\nreturn Domql.document.on(type) { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
        });

        it.each([
            ['an and and an or', 'Domql.document.on(wide and "keydown" or "keyup") { key = it.key }', { wide: true }],
            ['an and and an or, the other way', 'Domql.document.on(wide and "keyup" or "keydown") { key = it.key }', { wide: false }],
            ['a conditional', 'Domql.document.on(if wide then "keydown" else "nothing" end) { key = it.key }', { wide: true }],
            ['a conditional binding', 'let chosen = if let t = kind then t else "nothing" end\nreturn Domql.document.on(chosen) { key = it.key }', { kind: 'keydown' }],
            ['a coalescing operator whose value is null', 'Domql.document.on(kind ?? "keydown") { key = it.key }', { kind: null }],
            ['a coalescing operator whose value is not', 'Domql.document.on(kind ?? "nothing") { key = it.key }', { kind: 'keydown' }],
            ['a local holding one of them', 'let t = wide and "keydown" or "nothing"\nreturn Domql.document.on(t) { key = it.key }', { wide: true }],
        ])('resolves an event type %s settles when the expression is resolved, the side it does not take left unselected', (_, text, bindings) => {
            expect(() => resolve(text, bindings)).not.toThrow();
        });

        it('refuses an event type an expression settles to a name the vocabulary lacks, and one that reads the document to settle', () => {
            expect(failure('NEXO3050', 'Domql.document.on(wide and "keydown" or "nothing") { key = it.key }', { wide: false }).message).toContain("The type selector 'event' maps no type to the key 'nothing'");
            expect(failure('NEXO3006', 'Domql.document.on(if panel.attached then "keydown" else "keydown" end) { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
            expect(failure('NEXO3006', 'Domql.document.on(panel["data-t"] ?? "keydown") { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
        });

        it('resolves an event type a conditional binding holds where its value is a literal or a bound parameter, and refuses one any other expression gives', () => {
            expect(resolve('let type = if let chosen = "keydown" then chosen else "keyup" end\nreturn Domql.document.on(type) { key = it.key }').type).toBe('{ key: String }');
            expect(resolve('let type = if let chosen = kind then chosen else "keyup" end\nreturn Domql.document.on(type) { key = it.key }', { kind: 'keydown' }).type).toBe('{ key: String }');
            expect(failure('NEXO3006', 'let type = if let chosen = panel["data-t"] then chosen else "keyup" end\nreturn Domql.document.on(type) { key = it.key }', { panel }).message).toContain("a string the expression's resolution settles");
        });

        it('refuses an event type the vocabulary does not declare', () => {
            expect(failure('NEXO3050', 'panel.on("nonsense")').message).toContain("The type selector 'event' maps no type to the key 'nonsense'");
        });
    });

    describe('modules', () => {
        it('resolves against the types, Boolean members and event types a registered module contributes', () => {
            const module = nexo.createModule('Charts', {
                types: [
                    { name: 'ChartEvent', kind: 'structured', members: [{ name: 'value', kind: 'property', result: 'Number' }] },
                    elementExtension('Charts', [{ name: 'charts', kind: 'property', result: 'Boolean', updates: CONSTANT }]),
                ],
                mappings: [{ selector: 'event', key: 'chart-selected', type: 'ChartEvent' }],
            });
            const registry = registryOf(module);
            const element = document.createElement('div');
            const events = registry.resolve('panel.on("chart-selected") { value = it.value }', { panel: element });
            const test = registry.resolve('panel:charts', { panel: element });

            expect(events.type.toString()).toBe('{ value: Number }');
            expect(test.type.toString()).toBe('Boolean');
        });
    });

    describe('observation', () => {
        it('lets a query follow anything', () => {
            expect(() => resolve('panel.matches(":hover")')).not.toThrow();
        });

        it('refuses a watch of a partly observable member unless it accepts partial observation', () => {
            const error = failure('DOMQL3003', 'panel.matches(":hover")', { panel }, { watch: true });

            expect(error.message).toContain('misses pointer state');
            expect(() => resolve('panel.matches(":hover")', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('refuses a watch of a client size unless it accepts partial observation, since its border box and its content box can keep their sizes while it changes', () => {
            expect(failure('DOMQL3003', 'panel.clientSize', { panel }, { watch: true }).message).toContain("'Element.clientSize' (which misses a change that leaves its border box and its content box as they were, as its border and padding changing by the same amount)");
            expect(() => resolve('panel.clientSize', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('names each member it refuses by the type its declaration is for', () => {
            const error = failure('DOMQL3003', '{ a = panel.root.children.count, b = panel.shadow.root?.children.count, c = panel.attached, d = panel.first("p")?.rect?.width }', { panel }, { watch: true });

            expect(error.message).toContain("'Node.root' (which misses a detached tree inserted");
            expect(error.message).toContain("'Shadow.root' (which misses a shadow root attached");
            expect(error.message).toContain("'Element.attached' (which misses");
            expect(error.message).toContain("'Node.first' (which misses pointer state");
            expect(error.message).toContain("'Element.rect' (which misses a move its own size");
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
            const error = failure('NEXO3042', 'panel.matches(3)');

            expect(error.location.line).toBe(1);
            expect(error.location.column).toBe(15);
            expect(error.location.pointer).toBe('/expression/arguments/0');
        });

        it('points into a definition that has no text', () => {
            const definition = {
                version: 38,
                imports: [{ module: 'Domql' }],
                expression: { kind: 'call', callee: { kind: 'memberAccess', receiver: { kind: 'scriptParameter', name: 'panel' }, name: 'nonsense' }, arguments: [] },
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
            expect(resolve('panel.parent == null').type.toString()).toBe('Boolean');
            expect(resolve('panel.first("a")?.rect?.width == 0').type.toString()).toBe('Boolean');
            expect(resolve('panel != panel').type.toString()).toBe('Boolean');
            expect(resolve('panel.parent == Domql.document').type.toString()).toBe('Boolean');
            expect(resolve('Domql.window == Domql.window').type.toString()).toBe('Boolean');
            expect(resolve('panel.rect == null').type.toString()).toBe('Boolean');
            expect(resolve('missing == "x"', { missing: null }).type.toString()).toBe('Boolean');
        });

        it('refuse two values whose types fit neither way', () => {
            expect(failure('NEXO3030', '"1" == 1').message).toContain("'==' compares values whose types fit one way or the other, and String and Number fit neither way");
            expect(failure('NEXO3030', 'panel == Domql.document').message).toContain('Element and Document fit neither way');
            expect(failure('NEXO3030', 'panel.attached == "true"').message).toContain('Boolean and String fit neither way');
        });

        it('compare a value that is no string, number, Boolean or reference with null alone', () => {
            expect(failure('NEXO3066', 'panel.rect == panel.rect').message).toContain("'==' compares a value of Rectangle with null alone");
            expect(failure('NEXO3066', 'panel.children == panel.children').message).toContain('a value of List<Element> with null alone');
            expect(failure('NEXO3048', 'panel.on("click") { x = it.clientX } == null').message).toContain("'==' compares values, and this is a host call");
        });

        it('give the state to read for a value compared with the name of one of its Boolean properties, and nothing for any other, an execution of the name among them', () => {
            expect(failure('NEXO3030', 'panel == "attached"').message).toContain("a test is the member that answers it, so write 'panel.attached'");
            expect(failure('NEXO3030', 'panel != "attached"').message).toContain("write 'not panel.attached'");
            expect(failure('NEXO3030', 'panel == state', { panel, state: 'disabled' }).message).toContain("write 'panel.[state]'");
            expect(failure('NEXO3030', 'panel != "disabled"').message).toContain("write 'not panel.disabled'");
            expect(failure('NEXO3030', 'panel.first("a") == "focused"').message).toContain(`write 'panel.first("a")?.focused'`);
            expect(failure('NEXO3030', 'panel == "focus"').message).not.toContain('write');
            expect(failure('NEXO3030', 'panel == "visible"').message).not.toContain('write');
            expect(failure('NEXO3030', 'panel == "Attached"').message).not.toContain('write');
            expect(failure('NEXO3030', 'panel == "children"').message).not.toContain('write');
        });
    });

    describe('states', () => {
        it('resolve a state as the Boolean property it is, nullable where an optional access reads it', () => {
            const resolved = resolve('panel.disabled');

            expect(resolved.type.toString()).toBe('Boolean');
            expect(resolved.usedDeclarations.find(use => use.pointer === '/expression').name).toBe('disabled');
            expect(resolve('(panel.parent as Element)?.attached').type.toString()).toBe('Boolean?');
            expect(resolve('(panel.parent as Element)?.disabled').type.toString()).toBe('Boolean?');
            expect(resolve('panel.[name]', { panel, name: 'attached' }).type.toString()).toBe('Boolean');
            expect(resolve('panel.[name]', { panel, name: 'focusWithin' }).type.toString()).toBe('Boolean');
            expect(resolve('Domql.document.visible and Domql.document.focused').type.toString()).toBe('Boolean');
        });

        it('refuse a state the receiver has not, naming the receiver that has it, and a state called, giving the property to read', () => {
            expect(failure('NEXO3001', 'panel.visible').message).toContain("'visible' is not available on Element; it is available on Document");
            expect(failure('NEXO3001', 'Domql.document.attached').message).toContain("'attached' is not available on Document; it is available on Element");
            expect(failure('NEXO3017', 'panel.disabled()').message).toContain("'disabled' is a property: write 'panel.disabled'");
        });

        it('read a state through its module, the receiver it is given selecting its declaration, and refuse a receiver it does not take and a reference to it, which only a function has', () => {
            const resolved = resolve('Domql.focused(panel) and Domql.focused(Domql.document)');

            expect(resolved.type.toString()).toBe('Boolean');
            expect(resolved.usedDeclarations.map(use => use.qualifiedName)).toEqual(['Element.focused', 'Domql.document', 'Document.focused']);
            expect(resolve('Domql.canShare(Domql.window) and Domql.visible(Domql.document)').type.toString()).toBe('Boolean');
            expect(failure('NEXO3042', 'Domql.visible(panel)').message).toContain("'Domql.visible' takes a receiver of Document, and is given Element");
            expect(failure('NEXO3076', 'let test = Domql.visible\nreturn test(Domql.document)').message).toContain("'Domql.visible' is a property, read with its receiver as Domql.visible(receiver), and only a function has a reference");
        });

        it('test for null with is null, a Boolean that is never null, whatever its subject', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('Boolean');
            expect(resolve('null == null').type.toString()).toBe('Boolean');
            expect(failure('NEXO3048', 'panel.on("click") { clientX = it.clientX } == null').message).toContain('a host call');
        });
    });

    describe('narrowing', () => {
        const local = (name, text) => `panel { let ${name} = it.first(".a"), let other = it.first(".b"), r = ${text} }`;

        it.each([
            ['the right operand of an and, where the left is the local', local('a', 'a and a.rect'), '{ r: Rectangle? }'],
            ['the right operand of an and, where the left says the local is not null', local('a', 'a != null and a.attached'), '{ r: Boolean }'],
            ['the right operand of an or, where the left says the local is null', local('a', 'a == null or a.attached'), '{ r: Boolean }'],
            ['the right operand of an or, where the left negates the local', local('a', 'not a or a.attached'), '{ r: Boolean }'],
            ['the consequent, where the condition is the local', local('a', 'if a then a.attached else false end'), '{ r: Boolean }'],
            ['the alternative, where the condition says the local is null', local('a', 'if a == null then false else a.attached end'), '{ r: Boolean }'],
            ['the consequent, where an and of conditions holds both', local('a', 'if a != null and other != null then a.attached and other.attached else false end'), '{ r: Boolean }'],
            ['the consequent, where every path of an or holds the local', local('a', 'if (a != null and other != null) or (a != null and panel.attached) then a.attached else false end'), '{ r: Boolean }'],
            ['a later elseif, where an earlier condition says the local is null', local('a', 'if a == null then 0 elseif a.attached then 1 else 2 end'), '{ r: Number }'],
            ['the consequent of a binding, where its value is the local', local('a', 'if let b = a then a.attached and b.attached else false end'), '{ r: Boolean }'],
        ])('narrows a local in %s', (_, text, type) => {
            expect(resolve(text).type.toString()).toBe(type);
        });

        it.each([
            ['an or, which says neither is not null', local('a', 'if a != null or other != null then a.attached else false end'), '/expression/objectFields/0/value/consequent'],
            ['the alternative of a condition that is the local', local('a', 'if a then false else a.attached end'), '/expression/objectFields/0/value/alternative'],
            ['a member read anew, whose text is the same', 'panel.first(".a") and panel.first(".a").attached', '/expression/operands/1'],
            ['another local of the same name, in another object expression', 'panel { x = { let a = it.first(".a"), v = a and a.attached }, y = { let a = it.first(".b"), v = a.attached } }', '/expression/objectFields/1/value/objectFields/0/value'],
        ])('narrows nothing through %s', (_, text, pointer) => {
            const error = failure('NEXO3008', text);

            expect(error.message).toContain("write '");
            expect(error.message).toContain('?.attached');
            expect(error.location.pointer).toBe(pointer);
        });

        it('keeps what it knows of a local in the object expressions and the expressions nested where it holds', () => {
            expect(resolve('panel { let a = it.first(".a"), v = a and panel.children { w = a.attached, u = it.attached } }').type.toString()).toBe('{ v: List<{ w: Boolean, u: Boolean }>? }');
            expect(resolve('panel { let a = it.first(".a"), v = a and panel.children.where(a.attached).count }').type.toString()).toBe('{ v: Number? }');
        });
    });

    describe('logical expressions', () => {
        it('type an and, an or and a not as a Boolean', () => {
            expect(resolve('panel.attached and panel.focused').type.toString()).toBe('Boolean');
            expect(resolve('panel.attached or (((panel.parent as Element)?.attached) ?? false)').type.toString()).toBe('Boolean');
            expect(resolve('not panel.attached').type.toString()).toBe('Boolean');
        });

        it('type an and and an or as the operands that can decide them: the falsey part of each before the last, for and, the truthy part for or, and the last', () => {
            expect(resolve('panel.attached or (panel.parent as Element)?.attached').type.toString()).toBe('Boolean?');
            expect(resolve('panel.first(".a") and 5').type.toString()).toBe('Number?');
            expect(resolve('(panel.first(".a") or panel).attached').type.toString()).toBe('Boolean');
            expect(resolve('panel.children.count and panel.size').type.toString()).toBe('Size?');
            expect(resolve('panel.rect and true').type.toString()).toBe('Boolean?');
            expect(resolve('name or "default"', { name: null }).type.toString()).toBe('String');
            expect(resolve('not off', { off: null }).type.toString()).toBe('Boolean');
            expect(resolve('not panel.first(".a")').type.toString()).toBe('Boolean');
        });

        it('type an and or an or whose fixed operands decide it as the operand that does', () => {
            expect(resolve('true and "value"').type.toString()).toBe('String');
            expect(resolve('false or "fallback"').type.toString()).toBe('String');
            expect(resolve('true and false or "fallback"').type.toString()).toBe('String');
            expect(resolve('on and panel.children.count', { on: true, panel }).type.toString()).toBe('Number');
            expect(resolve('on and panel.children.count', { on: false, panel }).type.toString()).toBe('Boolean');
        });

        it.each([
            ['a Boolean and an element', 'panel.attached and panel', "What 'and' gives is false or Element, which no one type holds; write 'if panel.attached then panel else null end' if null is an acceptable alternative"],
            ['a Boolean or a number', 'panel.attached or 3', "What 'or' gives is true or Number, which no one type holds; a conditional, 'if … then … else … end', chooses between values of one type"],
            ['a nullable Boolean and a string', '(panel.parent as Element)?.attached and "x"', "What 'and' gives is false or null or String"],
        ])('refuse an and or an or of %s, whose values no one type holds', (_, text, message) => {
            const error = failure('NEXO3040', text);

            expect(error.message).toContain(message);
            expect(error.location.pointer).toBe('/expression');
        });

        it('refuse an operand that is no value', () => {
            expect(failure('NEXO3048', 'panel.on("click") and true').message).toContain("An operand of 'and' is a value, and this one is a host call");
            expect(failure('NEXO3048', 'not panel.on("click")').message).toContain("What 'not' negates is a value, and this one is a host call");
        });

        it('resolve every operand with its own location, the implicit parameter of each the one around the expression', () => {
            const { usedDeclarations } = resolve('panel { both = it.attached and (it.disabled or it.focused) }');
            const nameAt = pointer => usedDeclarations.find(use => use.pointer === pointer).name;

            expect(nameAt('/expression/objectFields/0/value/operands/0')).toBe('attached');
            expect(nameAt('/expression/objectFields/0/value/operands/1/operands/1')).toBe('focused');
        });

        it('validate an operand that evaluation might never reach', () => {
            const error = failure('NEXO3001', 'panel.attached or panel.nonsense');

            expect(error.message).toContain("'nonsense' is no member of the vocabulary");
            expect(error.location.pointer).toBe('/expression/operands/1');
        });

        it('count every operand when a watch asks what can be followed', () => {
            const error = failure('DOMQL3003', 'panel.attached or panel.textEditable', { panel }, { watch: true });

            expect(error.message).toContain("'Element.textEditable' (which misses the document's design mode)");
            expect(() => resolve('panel.attached or panel.textEditable', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('let a group start a chain', () => {
            expect(resolve('(panel).children.count').type.toString()).toBe('Number');
        });
    });

    describe('locals', () => {
        it('type a use of a local as the value it names', () => {
            expect(resolve('panel { let size = it.size, width = size?.width }').type.toString()).toBe('{ width: Number? }');
            expect(resolve('panel { let rows = it.children, rows = rows { key = it.attribute["data-key"] } }').type.toString()).toBe('{ rows: List<{ key: String? }> }');
        });

        it('resolve a local where it is written, whatever implicit parameter its use has', () => {
            expect(resolve('panel { let size = it.size, rows = it.children { size = size } }').type.toString()).toBe('{ rows: List<{ size: Size? }> }');
        });

        it('let a local hold what is no data, which no object field can', () => {
            expect(resolve('panel { let first = it.children[0], key = first?.attribute["data-key"] }').type.toString()).toBe('{ key: String? }');
        });

        it('validate a local no object field uses', () => {
            expect(failure('NEXO3001', 'panel { let wrong = it.nonsense, a = 1 }').location.pointer).toBe('/expression/locals/0/value');
        });

        it('refuse a local that is no value', () => {
            expect(failure('NEXO3048', 'panel { let clicks = it.on("click"), a = 1 }').message).toContain("The local 'clicks' is a host call, and a local is a value");
        });
    });

    describe('conditionals', () => {
        it('type a conditional by its branches, nullable where either is', () => {
            expect(resolve('if wide then 1 else 2 end', { panel, wide: true }).type.toString()).toBe('Number');
            expect(resolve('if wide then panel.size?.width else 0 end', { panel, wide: true }).type.toString()).toBe('Number?');
            expect(resolve('if wide then "on" else null end', { panel, wide: true }).type.toString()).toBe('String?');
            expect(resolve('if wide then { width = 1 } else { width = panel.size?.width } end', { panel, wide: true }).type.toString()).toBe('{ width: Number? }');
        });

        it('type an elseif as the conditional it is nested in the alternative', () => {
            expect(resolve('if a then 1 elseif b then null else 3 end', { a: true, b: false }).type.toString()).toBe('Number?');
        });

        it('refuse branches of different types, naming both', () => {
            const error = failure('NEXO3041', 'if wide then 1 else "one" end', { panel, wide: true });

            expect(error.message).toContain("The branches of 'if' are of one type, and these are Number and String");
            expect(error.location.pointer).toBe('/expression/alternative');
            expect(failure('NEXO3041', 'if wide then { a = 1 } else { b = 1 } end', { panel, wide: true }).message).toContain('{ a: Number } and { b: Number }');
        });

        it('take a condition of any value, and refuse one that is no value', () => {
            expect(resolve('if panel.size then 1 else 2 end').type.toString()).toBe('Number');
            expect(resolve('if (panel.parent as Element)?.attached then 1 else 2 end').type.toString()).toBe('Number');
            expect(resolve('if panel.children then 1 else 2 end').type.toString()).toBe('Number');

            const error = failure('NEXO3048', 'if panel.on("click") then 1 else 2 end');

            expect(error.message).toContain("The condition of 'if' is a value, and this one is a host call");
            expect(error.location.pointer).toBe('/expression/condition');
        });

        it('validate a branch that evaluation might never reach', () => {
            expect(failure('NEXO3001', 'if wide then 1 else panel.nonsense end', { panel, wide: true }).location.pointer).toBe('/expression/alternative');
        });

        it('type is null as a Boolean that is never null, whatever its subject', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('Boolean');
            expect(resolve('null == null').type.toString()).toBe('Boolean');
        });
    });

    describe('the resolved definition', () => {
        it('names each object field of each object expression once, as it is written', () => {
            const resolved = resolve('panel { size = it.size, kind = it.attribute["role"], attached = it.attached, clientSize = it.["clientSize"], rows = it.all("i") { rect = it.rect } }');
            const { expression: query } = resolved.definition;

            expect(query.objectFields.map(field => field.name)).toEqual(['size', 'kind', 'attached', 'clientSize', 'rows']);
            expect(query.objectFields[4].value.objectFields.map(field => field.name)).toEqual(['rect']);
            expect(resolved.type).toBe('{ size: Size?, kind: String?, attached: Boolean, clientSize: Size?, rows: List<{ rect: Rectangle? }> }');
        });

        it('finds each node, by the node itself, with its pointer and its resolution', () => {
            const resolved = resolveInNexo('panel.all("i") { h = it.size?.height, on = it.attached or it.focused }');
            const { expression: query } = resolved.definition;
            const [chain, on] = query.objectFields.map(field => field.value);
            const height = chain.chain;

            expect(resolved.pointerOf(query.context)).toBe('/expression/context');
            expect(resolved.resolutionOf(query.context).declaration.name).toBe('all');
            expect(resolved.pointerOf(height.receiver)).toBe('/expression/objectFields/0/value/chain/receiver');
            expect(resolved.resolutionOf(height).kind).toBe('dataProperty');
            expect(resolved.resolutionOf(chain)).toBeUndefined();
            expect(resolved.pointerOf(on.operands[1])).toBe('/expression/objectFields/1/value/operands/1');
            expect(resolved.resolutionOf(on.operands[1]).declaration.name).toBe('focused');
            expect(resolved.resolutionOf(query).kind).toBe('projection');
        });
    });
});
