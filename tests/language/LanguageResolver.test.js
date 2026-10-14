import { describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';
import { DomqlError } from '#domql/language/DomqlError.mjs';
import { DomqlModule } from '#domql/language/vocabulary/DomqlModule.mjs';
import { LanguageResolver } from '#domql/language/LanguageResolver.mjs';
import { ModuleRegistry } from '#domql/language/vocabulary/ModuleRegistry.mjs';
import { Vocabulary } from '#domql/language/vocabulary/Vocabulary.mjs';

const panel = document.createElement('div');

const resolve = (text, bindings = { panel }, options = {}) => domql.query(text, bindings).resolve(options);
const failure = (text, bindings, options) => {
    try {
        resolve(text, bindings, options);
    } catch (error) {
        expect(error).toBeInstanceOf(DomqlError);
        expect(error.kind).toBe('validation');

        return error;
    }

    throw new Error('The query was resolved');
};

describe('LanguageResolver', () => {
    describe('types', () => {
        it('types a property of the window', () => {
            expect(resolve('@window.size').type.toString()).toBe('size');
        });

        it('types a field of a structured type read through an optional access, nullable where its receiver can be null', () => {
            expect(resolve('@panel.size?.width').type.toString()).toBe('number?');
        });

        it('types a list property and an aggregate over its items', () => {
            expect(resolve('@panel.children.count').type.toString()).toBe('number');
            expect(resolve('@panel.children.sum(self.size?.width)').type.toString()).toBe('number');
            expect(resolve('@panel.children.max(self.size?.width)').type.toString()).toBe('number?');
        });

        it('keeps the item type through where, first and at', () => {
            expect(resolve('@panel.children.where(self is "attached").first?.size').type.toString()).toBe('size?');
            expect(resolve('@panel.children.at(0)?.size').type.toString()).toBe('size?');
        });

        it('types an object expression by its written field names', () => {
            expect(resolve('@panel { size: self.size, hasFocus: self is "focused" }').type.toString()).toBe('{ size: size?, hasFocus: boolean }');
        });

        it('types a bound value by the type it has', () => {
            expect(resolve('@count', { count: 3 }).type.toString()).toBe('number');
            expect(resolve('@nothing', { nothing: null }).type.toString()).toBe('null');
        });

        it.each([
            ['the result', '@panel.loose'],
            ['a field', '@panel { v: self.loose }'],
            ['an argument', '@panel.children.at(@panel.loose)'],
            ['an expression', '@panel.children.where(self.loose).count'],
            ['a receiver', '@panel.loose.count'],
            ['a subject', '@panel.loose is "attached"'],
        ])('refuses a type parameter no receiver gives an argument as %s, so its value never reaches a result', (_, text) => {
            const registry = new ModuleRegistry([Vocabulary.module, new DomqlModule('loose', {
                members: [{ name: 'loose', function: 'loose', kind: 'property', on: 'element', parameters: [], result: 'T', changes: 'constant', reads: 'fresh' }],
            }, null)]);
            const query = domql.query(text, { panel });

            expect(() => new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition)).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringMatching(/\bT\b/) }));
        });
    });

    describe('requests', () => {
        it('resolves a chain of properties and operations as a query', () => {
            expect(resolve('@panel.size').kind).toBe('query');
        });

        it('resolves an event source as a subscription', () => {
            const resolved = resolve('(@document eventsOf "keydown") { key: self.key }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type.toString()).toBe('event<{ key: string }>');
        });

        it('shapes the events of a source by the fields of its payload', () => {
            const resolved = resolve('(@panel eventsOf "click") { clientX: self.clientX, button: self.button }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type.toString()).toBe('event<{ clientX: number, button: number }>');
        });

        it('refuses an answer that is no data', () => {
            expect(failure('@panel.parent').message).toContain('no data');
            expect(failure('(@panel eventsOf "click") { target: self.target }').message).toContain('no data');
        });

        it('refuses a member after an event source', () => {
            expect(failure('(@panel eventsOf "click").count').message).toContain('event source');
        });

        it('refuses an event source as an argument', () => {
            expect(failure('@panel matches (@panel eventsOf "click")').message).toContain('event source');
        });
    });

    describe('actions and behaviors', () => {
        /** A module whose one member, named for it, is an action or a behavior on an element. */
        const member = (name, kind, result) => new DomqlModule(name, {
            members: [{ name, function: name, kind, on: 'element', parameters: [], result, changes: 'unobserved', reads: 'fresh' }],
        });
        const registry = new ModuleRegistry([Vocabulary.module, member('step', 'action', 'boolean'), member('pick', 'action', 'element'), member('focusTrap', 'behavior', 'null')]);
        const resolveWith = text => {
            const query = domql.query(text, { panel });

            return new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);
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

        it('resolves an action as an action request, typed by its result', () => {
            const resolved = resolveWith('@panel.step()');

            expect(resolved.kind).toBe('action');
            expect(resolved.type.toString()).toBe('boolean');
        });

        it('shapes the result of an action by the object expression that follows it, which stays an action request', () => {
            const resolved = resolveWith('@panel.pick() { id: self attributeOf "id" }');

            expect(resolved.kind).toBe('action');
            expect(resolved.type.toString()).toBe('{ id: string? }');
        });

        it('refuses an action whose result is no data, unless an object expression follows it', () => {
            expect(failureWith('@panel.pick()').message).toContain('no data');
        });

        it('resolves a behavior as a behavior request, which takes no object expression', () => {
            expect(resolveWith('@panel.focusTrap()').kind).toBe('behavior');
            expect(failureWith('@panel.focusTrap() { id: self attributeOf "id" }').message).toContain('A behavior request ends its chain and takes no object expression');
        });

        it('refuses a member after an action, and an action or a behavior inside a query', () => {
            expect(failureWith('@panel.step().count').message).toContain('follows an action');
            expect(failureWith('{ moved: @panel.step() }').message).toContain('is an action');
            expect(failureWith('@panel matches (@panel.focusTrap())').message).toContain('is a behavior');
        });
    });

    describe('receivers', () => {
        it('refuses a member the receiver does not declare', () => {
            const error = failure('@panel.devicePixelRatio');

            expect(error.message).toContain('not available on element');
        });

        it('refuses an unknown member', () => {
            expect(failure('@panel.nonsense').message).toContain('no member of the vocabulary');
        });

        it('refuses a list member on an element and an element member on a list', () => {
            expect(failure('@panel.count').message).toContain('not available');
            expect(failure('@panel.children.size').message).toContain('not available on list<element>');
        });

        it('resolves an optional access of null whatever its name, and an optional call by its name and form, of the result its declarations share made nullable', () => {
            expect(resolve('null?.size').type.toString()).toBe('size?');
            expect(resolve('null?.sise').type.toString()).toBe('null');
            expect(failure('null?.sise()').message).toContain('no member of the vocabulary');
            expect(failure('null?.size()').message).toContain('is a property');
        });

        it('refuses an expression on a receiver that has no items', () => {
            expect(failure('@panel.sum(self.size?.width)').message).toContain('not available');
        });
    });

    describe('arguments', () => {
        it('refuses a missing required argument', () => {
            expect(failure('@panel matches').message).toContain("requires the argument 'selector'");
        });

        it('refuses a value where an operation takes its arguments as the fields of an object', () => {
            const error = failure('@panel overlaps @panel');

            expect(error.message).toContain('as the fields of an object');
            expect(error.location.pointer).toBe('/query/argument');
        });

        it('refuses an argument given to an operation that takes none', () => {
            const registry = new ModuleRegistry([Vocabulary.module, new DomqlModule('ping', {
                members: [{ name: 'ping', function: 'ping', kind: 'operation', on: 'element', parameters: [], result: 'boolean', changes: 'constant', reads: 'fresh' }],
            }, null)]);
            const query = domql.query('@panel.ping(1)', { panel });

            expect(() => new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition)).toThrow(expect.objectContaining({ message: expect.stringContaining("'ping' takes no argument") }));
        });

        it('refuses an argument of the wrong type', () => {
            expect(failure('@panel matches 3').message).toContain('expects string and finds number');
        });

        it('refuses a field of an options object that names no parameter, and one that leaves a required parameter out', () => {
            const unknown = failure('@panel overlaps { other: @panel, nonsense: 1 }');

            expect(unknown.message).toContain("no parameter 'nonsense'; it takes other, margin");
            expect(unknown.location.pointer).toBe('/query/argument/fields/1');
            expect(failure('@panel overlaps { margin: 1 }').message).toContain("requires the argument 'other'");
        });

        it('refuses an access or a call of a receiver that can be null, giving the optional form', () => {
            expect(failure('@panel.parent.size').message).toContain("'size' follows element?, which can be null: write '@panel.parent?.size'");
            expect(failure('null.size').message).toContain("'size' follows null: write 'null?.size'");
            expect(failure('@panel.first(".a").closest(".b")').message).toContain(`write '@panel.first(".a")?.closest(".b")'`);
            expect(failure('(@panel.parent?.children).count').message).toContain("write '(@panel.parent?.children)?.count'");
        });

        it('types an optional chain nullable where an optional access of it can meet null, and as its chain otherwise', () => {
            expect(resolve('@panel.parent?.size').type.toString()).toBe('size?');
            expect(resolve('@panel.parent?.children.count').type.toString()).toBe('number?');
            expect(resolve('@panel?.children.count').type.toString()).toBe('number');
            expect(resolve('@panel.parent?.rect?.width').type.toString()).toBe('number?');
        });

        it('lets an infix call and a predicate expression propagate a null receiver', () => {
            expect(resolve('@panel.parent attributeOf "id"').type.toString()).toBe('string?');
            expect(resolve('@panel.parent is "attached"').type.toString()).toBe('boolean?');
        });

        it('refuses a member written in a form its declaration does not take, giving the form it does', () => {
            expect(failure('@panel.attributeOf("id")').message).toContain(`'attributeOf' uses infix-call syntax: write '@panel attributeOf "id"'`);
            expect(failure('@panel closest ".row"').message).toContain(`'closest' uses call syntax: write '@panel.closest(".row")'`);
            expect(failure('@panel.parent()').message).toContain("'parent' is a property: write '@panel.parent'");
            expect(failure('@panel.size?.width()').message).toContain("write '@panel.size?.width'");
        });

        it('resolves an omitted argument to its default', () => {
            const resolved = resolve('@panel intersects');
            const [, margin] = resolved.getResolution('/query').arguments;

            expect(resolved.type.toString()).toBe('boolean?');
            expect(margin.isDefault).toBe(true);
            expect(margin.value).toBe(0);
        });

        it('accepts a null for a parameter that accepts it', () => {
            expect(resolve('@panel intersects { root: null }').type.toString()).toBe('boolean?');
        });
    });

    describe('null', () => {
        it('makes a call answer null for a null argument of a propagating parameter', () => {
            const resolved = resolve('@panel matches @selector', { panel, selector: null });

            expect(resolved.type.toString()).toBe('boolean?');
        });

        it('makes a call answer null for a written null on a propagating parameter', () => {
            expect(resolve('@window matchesMedia "(min-width: 1px)"').type.toString()).toBe('boolean');
            expect(resolve('@window matchesMedia null').type.toString()).toBe('boolean?');
        });

        it('lets an aggregate expression produce null per item', () => {
            expect(resolve('@panel.children.sum(self.size?.width)').type.toString()).toBe('number');
        });

        it('refuses an aggregate expression of another type', () => {
            expect(failure('@panel.children.sum(self attributeOf "id")').message).toContain('must produce number?');
        });
    });

    describe('fixed names', () => {
        it('resolves a predicate of a receiver', () => {
            const resolved = resolve('@panel is "disabled"');

            expect(resolved.type.toString()).toBe('boolean');
            expect(resolved.getResolution('/query/name').predicate.name).toBe('disabled');
        });

        it('takes the name from a bound string', () => {
            expect(resolve('@panel is @name', { panel, name: 'focused' }).type.toString()).toBe('boolean');
        });

        it('refuses a predicate the receiver has not', () => {
            expect(failure('@panel is "visible"').message).toContain('no predicate of element');
            expect(failure('@panel is "nonsense"').message).toContain("'is' reads");
        });

        it('keeps is and has apart', () => {
            expect(failure('@panel has "disabled"').message).toContain('no predicate');
            expect(resolve('@panel has "children"').type.toString()).toBe('boolean');
        });

        it('refuses a name that is null, unbound text or no string', () => {
            expect(failure('@panel is @name', { panel, name: null }).message).toContain('never null');
            expect(failure('@panel is @name', { panel, name: 3 }).message).toContain('never null');
            expect(failure('@panel is @document').message).toContain('never null');
        });

        it('resolves the chain of names a get reads to the type at its end', () => {
            expect(resolve('@panel.get("size.width")').type.toString()).toBe('number?');
            expect(resolve('@panel.get("children.count")').type.toString()).toBe('number');
        });

        it('refuses a get of a chain that names nothing', () => {
            expect(failure('@panel.get("size.depth")').message).toContain("'depth' names no property");
            expect(failure('@panel.get("matches")').message).toContain('reads without arguments');
        });

        it('resolves an event type and a feature', () => {
            expect(resolve('(@document eventsOf "keydown") { key: self.key }').type.toString()).toBe('event<{ key: string }>');
            expect(resolve('@window supports "share"').type.toString()).toBe('boolean');
        });

        it('refuses an event type or a feature the vocabulary does not declare', () => {
            expect(failure('@panel eventsOf "nonsense"').message).toContain('no event type');
            expect(failure('@window supports "nonsense"').message).toContain('no feature');
        });
    });

    describe('modules', () => {
        it('resolves against the types, predicates and events a registered module contributes', () => {
            const module = new DomqlModule('charts', {
                types: [{ name: 'chartEvent', fields: { value: 'number' } }],
                eventTypes: [{ name: 'chart-selected', payload: 'chartEvent' }],
                predicates: [{ verb: 'is', name: 'plotted', function: 'isPlotted', on: 'element', changes: 'constant', reads: 'fresh' }],
            });

            const registry = new ModuleRegistry([Vocabulary.module, module]);
            const element = document.createElement('div');
            const resolveWith = text => {
                const query = domql.query(text, { panel: element });

                return new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);
            };
            const events = resolveWith('(@panel eventsOf "chart-selected") { value: self.value }');
            const predicate = resolveWith('@panel is "plotted"');

            expect(events.type.toString()).toBe('event<{ value: number }>');
            expect(predicate.type.toString()).toBe('boolean');
        });
    });

    describe('observation', () => {
        it('lets a query follow anything', () => {
            expect(() => resolve('@panel matches ":hover"')).not.toThrow();
        });

        it('refuses a watch of a partly observable member unless it accepts partial observation', () => {
            const error = failure('@panel matches ":hover"', { panel }, { watch: true });

            expect(error.message).toContain('misses pointer state');
            expect(() => resolve('@panel matches ":hover"', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('lets a watch follow what is observable', () => {
            expect(() => resolve('@panel.size', { panel }, { watch: true })).not.toThrow();
        });

        it('lists the declarations a request uses', () => {
            const names = resolve('@panel.children.count').usedDeclarations.map(use => use.declaration.name);

            expect(names).toEqual(['children', 'count']);
        });
    });

    describe('errors', () => {
        it('locates an error in the query text', () => {
            const error = failure('@panel matches 3');

            expect(error.location.line).toBe(1);
            expect(error.location.column).toBe(16);
            expect(error.location.pointer).toBe('/query/argument');
        });

        it('points into a definition that has no text', () => {
            const definition = {
                version: 5,
                query: { kind: 'member', target: { kind: 'parameter', name: 'panel' }, name: 'nonsense', arguments: [] },
            };

            try {
                domql.query(definition, { panel }).resolve();
            } catch (error) {
                expect(error.location.pointer).toBe('/query');

                return;
            }

            throw new Error('The query was resolved');
        });

        it('resolves without a browser-bound evaluation', () => {
            expect(resolve('@panel.size').definition).toBe(domql.query('@panel.size', { panel }).definition);
        });
    });

    describe('predicate expressions', () => {
        it('type a predicate expression as a Boolean, nullable where its subject is', () => {
            expect(resolve('@panel is "attached"').type.toString()).toBe('boolean');
            expect(resolve('@panel.parent is "attached"').type.toString()).toBe('boolean?');
        });

        it('read their name under their verb alone', () => {
            expect(failure('@panel is "children"').message).toContain('\'is "children"\' is no predicate');
            expect(resolve('@panel has "children"').type.toString()).toBe('boolean');
        });

        it('refuse a subject that is no value, and test a subject of unknown type by the predicate\'s name alone', () => {
            expect(failure('(@panel eventsOf "click") { clientX: self.clientX } is "attached"').message).toContain('event source');
            expect(resolve('null is "attached"').type.toString()).toBe('boolean?');
            expect(failure('null is "nonsense"').message).toContain('no predicate');
        });

    });

    describe('logical expressions', () => {
        it('type an and or an or as a Boolean, nullable where an operand is', () => {
            expect(resolve('@panel is "attached" and @panel is "focused"').type.toString()).toBe('boolean');
            expect(resolve('@panel is "attached" or @panel.parent is "attached"').type.toString()).toBe('boolean?');
            expect(resolve('@panel is "attached" and null').type.toString()).toBe('boolean?');
            expect(resolve('@on or @off', { on: true, off: null }).type.toString()).toBe('boolean?');
        });

        it('resolve every operand with its own location, the current value of each the one around the expression', () => {
            const resolved = resolve('@panel { both: self is "attached" and (self is "disabled" or self is "focused") }');

            expect(resolved.getResolution('/query/fields/0/value/operands/0/name').predicate.name).toBe('attached');
            expect(resolved.getResolution('/query/fields/0/value/operands/1/operands/1/name').predicate.name).toBe('focused');
        });

        it('validate an operand that evaluation might never reach', () => {
            const error = failure('@panel is "attached" or @panel is "nonsense"');

            expect(error.message).toContain('\'is "nonsense"\' is no predicate');
            expect(error.location.pointer).toBe('/query/operands/1/name');
        });

        it.each([
            ['a string, as the earlier shorthand of names gives', '@panel is "attached" and "visible"', '/query/operands/1', 'string'],
            ['a number', '@panel is "attached" or 3', '/query/operands/1', 'number'],
            ['a structure', '@panel.rect and true', '/query/operands/0', 'rectangle?'],
        ])('refuse an operand that is %s, naming its type', (_, text, pointer, type) => {
            const error = failure(text);

            expect(error.message).toContain(`'${text.includes(' or ') ? 'or' : 'and'}' combines Boolean expressions, and this one is ${type}`);
            expect(error.location.pointer).toBe(pointer);
        });

        it('count every operand when a watch asks what can be followed', () => {
            const error = failure('@panel is "attached" or @panel is "textEditable"', { panel }, { watch: true });

            expect(error.message).toContain('is textEditable');
            expect(() => resolve('@panel is "attached" or @panel is "textEditable"', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('let a group start a chain', () => {
            expect(resolve('(@panel).children.count').type.toString()).toBe('number');
        });
    });

    describe('locals', () => {
        it('type a use of a local as the value it names', () => {
            expect(resolve('@panel { let size: self.size, width: size?.width }').type.toString()).toBe('{ width: number? }');
            expect(resolve('@panel { let rows: self.children, rows: rows { key: self attributeOf "data-key" } }').type.toString()).toBe('{ rows: list<{ key: string? }> }');
        });

        it('resolve a local where it is written, whatever current value its use has', () => {
            expect(resolve('@panel { let size: self.size, rows: self.children { size: size } }').type.toString()).toBe('{ rows: list<{ size: size? }> }');
        });

        it('let a local hold what is no data, which no field can', () => {
            expect(resolve('@panel { let first: self.children.at(0), key: first attributeOf "data-key" }').type.toString()).toBe('{ key: string? }');
        });

        it('validate a local no field uses', () => {
            expect(failure('@panel { let wrong: self.nonsense, a: 1 }').location.pointer).toBe('/query/locals/0/value');
        });

        it('refuse a local that is no value', () => {
            expect(failure('@panel { let clicks: self eventsOf "click", a: 1 }').message).toContain("The local 'clicks' is an event source, and a local is a value");
        });
    });

    describe('conditionals', () => {
        it('type a conditional by its branches, nullable where either is', () => {
            expect(resolve('if @wide then 1 else 2', { panel, wide: true }).type.toString()).toBe('number');
            expect(resolve('if @wide then @panel.size?.width else 0', { panel, wide: true }).type.toString()).toBe('number?');
            expect(resolve('if @wide then "on" else null', { panel, wide: true }).type.toString()).toBe('string?');
            expect(resolve('if @wide then { width: 1 } else { width: @panel.size?.width }', { panel, wide: true }).type.toString()).toBe('{ width: number? }');
        });

        it('type an elseif as the conditional it is nested in the alternative', () => {
            expect(resolve('if @a then 1 elseif @b then null else 3', { a: true, b: false }).type.toString()).toBe('number?');
        });

        it('refuse branches of different types, naming both', () => {
            const error = failure('if @wide then 1 else "one"', { panel, wide: true });

            expect(error.message).toContain("The branches of 'if' are of one type, and these are number and string");
            expect(error.location.pointer).toBe('/query/alternative');
            expect(failure('if @wide then { a: 1 } else { b: 1 }', { panel, wide: true }).message).toContain('{ a: number } and { b: number }');
        });

        it('refuse a condition that is no Boolean, and accept a nullable one', () => {
            const error = failure('if @panel.size then 1 else 2');

            expect(error.message).toContain("The condition of 'if' is a Boolean expression, and this one is size?");
            expect(error.location.pointer).toBe('/query/condition');
            expect(resolve('if @panel.parent is "attached" then 1 else 2').type.toString()).toBe('number');
        });

        it('validate a branch that evaluation might never reach', () => {
            expect(failure('if @wide then 1 else @panel.nonsense', { panel, wide: true }).location.pointer).toBe('/query/alternative');
        });

        it('type is null as a Boolean that is never null, whatever its subject', () => {
            expect(resolve('@panel.parent is null').type.toString()).toBe('boolean');
            expect(resolve('null is null').type.toString()).toBe('boolean');
        });
    });

    describe('the resolved definition', () => {
        it('names each field of each object expression once, as it is written', () => {
            const resolved = resolve('@panel { size: self.size, kind: self attributeOf "role", attached: self is "attached", clientSize: self.get("clientSize"), rows: self.all("i") { rect: self.rect } }');
            const { query } = resolved.definition;

            expect(resolved.fieldNamesOf(query)).toEqual(['size', 'kind', 'attached', 'clientSize', 'rows']);
            expect(resolved.fieldNamesOf(query.fields[4].value)).toEqual(['rect']);
        });

        it('finds each node, by the node itself, with its pointer and its resolution', () => {
            const resolved = resolve('@panel.all("i") { h: self.size?.height, on: self is "attached" or self is "focused" }');
            const { query } = resolved.definition;
            const [chain, on] = query.fields.map(field => field.value);
            const height = chain.target;

            expect(resolved.pointerOf(query.target)).toBe('/query/target');
            expect(resolved.resolutionOf(query.target).declaration.name).toBe('all');
            expect(resolved.pointerOf(height.target)).toBe('/query/fields/0/value/target/target');
            expect(resolved.resolutionOf(height).kind).toBe('field');
            expect(resolved.resolutionOf(chain)).toBeUndefined();
            expect(resolved.pointerOf(on.operands[1].name)).toBe('/query/fields/1/value/operands/1/name');
            expect(resolved.resolutionOf(on.operands[1].name).predicate.name).toBe('focused');
            expect(resolved.resolutionOf(query)).toBeUndefined();
        });
    });
});

