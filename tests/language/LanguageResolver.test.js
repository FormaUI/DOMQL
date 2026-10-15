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
            expect(resolve('@panel.children.where(self.attached).first?.size').type.toString()).toBe('size?');
            expect(resolve('@panel.children.at(0)?.size').type.toString()).toBe('size?');
        });

        it('types an object expression by its written field names', () => {
            expect(resolve('@panel { size: self.size, hasFocus: self.focused }').type.toString()).toBe('{ size: size?, hasFocus: boolean }');
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
            ['a subject', '@panel.loose.attached'],
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
            expect(failure('@panel.first(".a").size').message).toContain(`'size' follows element?, which can be null: write '@panel.first(".a")?.size'`);
            expect(failure('null.size').message).toContain("'size' follows null: write 'null?.size'");
            expect(failure('@panel.first(".a").closest(".b")').message).toContain(`write '@panel.first(".a")?.closest(".b")'`);
            expect(failure('(@panel.parent?.children).count').message).toContain("write '(@panel.parent?.children)?.count'");
        });

        it('types an optional chain nullable where an optional access of it can meet null, and as its chain otherwise', () => {
            expect(resolve('(@panel.parent as "element")?.size').type.toString()).toBe('size?');
            expect(resolve('@panel.parent?.children.count').type.toString()).toBe('number?');
            expect(resolve('@panel?.children.count').type.toString()).toBe('number');
            expect(resolve('(@panel.parent as "element")?.rect?.width').type.toString()).toBe('number?');
        });

        it('types a coalescing operator as its value made non-null where its fallback is, and as their merged type', () => {
            expect(resolve('@panel.rect?.width ?? 0').type.toString()).toBe('number');
            expect(resolve('@panel.rect?.width ?? (@panel.parent as "element")?.rect?.width').type.toString()).toBe('number?');
            expect(resolve('@panel.children.count ?? 0').type.toString()).toBe('number');
            expect(resolve('null ?? "none"').type.toString()).toBe('string');
        });

        it('refuses a coalescing operator whose sides are of different types, or no values', () => {
            expect(failure('@panel.rect?.width ?? "none"').message).toContain("The value and the fallback of '??' are of one type, and these are number? and string");
            expect(failure('(@panel eventsOf "click") ?? 0').message).toContain("The value of '??' is a value, and this one is an event source");
        });

        // A node is no data, so its type is read from the refusal of a result that would hold one.
        const heldType = (text, bindings) => failure(text, bindings).message.match(/would hold (\S+),/)[1];

        it('types a node\'s tree members, and a node of two kinds as a node', () => {
            expect(heldType('@panel.parent')).toBe('node?');
            expect(heldType('@panel.root')).toBe('node');
            expect(heldType('@panel.root.host')).toBe('element?');
            expect(resolve('@document.all("p").count').type.toString()).toBe('number');
            expect(heldType('if @wide then @panel else @document', { panel, wide: true })).toBe('node');
        });

        it('types an element\'s shadow view by its own members, which are no element\'s, and refuses it as data', () => {
            expect(resolve('@panel.shadow.root?.children.count').type.toString()).toBe('number?');
            expect(resolve('@panel.shadow.elements?.count').type.toString()).toBe('number?');
            expect(heldType('@panel.shadow')).toBe('shadow');
            expect(failure('@panel.shadow.rect').message).toContain("'rect' is not available on shadow");
            expect(failure('@panel.root.shadow').message).toContain("'shadow' is not available on node");
        });

        it('types a cast as the type it casts to, made nullable', () => {
            expect(heldType('@panel.parent as "element"')).toBe('element?');
            expect(resolve('(@panel.parent as "element")?.rect?.width').type.toString()).toBe('number?');
            expect(heldType('@panel as "element"')).toBe('element?');
            expect(heldType('@panel as "node"')).toBe('node?');
            expect(heldType('null as "shadowRoot"')).toBe('shadowRoot?');
        });

        it('refuses a cast to a type that is no node, and one its target can never be', () => {
            expect(failure('@panel as "widget"').message).toContain("'as' casts to node or one of its kinds, element, document, documentFragment, shadowRoot, and 'widget' is none of them");
            expect(failure('@document as "element"').message).toContain('A value of document can never be cast to element');
            expect(failure('5 as "element"').message).toContain('A value of number can never be cast to element');
        });

        it('types an optional-access group as the optional chain it writes', () => {
            expect(resolve('(?(@panel.parent as "element").rect.width)').type.toString()).toBe('number?');
            expect(resolve('(?@panel.children.count)').type.toString()).toBe('number');
        });

        it('lets an infix call propagate a null receiver', () => {
            expect(resolve('(@panel.parent as "element") attributeOf "id"').type.toString()).toBe('string?');
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
        it('resolves an access by name to the type the properties its names name share', () => {
            expect(resolve('@panel["children"].count').type.toString()).toBe('number');
            expect(resolve('@panel[@name]', { panel, name: 'size' }).type.toString()).toBe('size?');
            expect(resolve('@panel { let name: if @wide then "size" else "clientSize", s: self[name] }', { panel, wide: true }).type.toString()).toBe('{ s: size? }');
            expect(resolve('@panel[null ?? "size"]').type.toString()).toBe('size?');
        });

        it('refuses an access by name whose names cannot be determined, can be null, name no property or are of different types', () => {
            expect(failure('@panel[@panel attributeOf "data-name"]').message).toContain('An access by name reads a name determined when the query is prepared');
            expect(failure('@panel[@name]', { panel, name: null }).message).toContain("An access by name reads a string, and '@name' can be null");
            expect(failure('@panel["depth"]').message).toContain("'depth' is no member of the vocabulary");
            expect(failure('@panel[if @wide then "size" else "children"]', { panel, wide: true }).message).toContain('are of one type, and these are size?, list<element>');
        });

        it('refuses an access by name of a receiver that can be null, giving the optional form', () => {
            expect(failure('@panel.first(".a")[@name]', { panel, name: 'size' }).message).toContain(`write '@panel.first(".a")?.[@name]'`);
            expect(resolve('@panel.first(".a")?.[@name]', { panel, name: 'size' }).type.toString()).toBe('size?');
            expect(resolve('@row?.[@name]', { row: null, name: 'id' }).type.toString()).toBe('null');
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
        it('resolves against the types, Boolean members and events a registered module contributes', () => {
            const module = new DomqlModule('charts', {
                types: [{ name: 'chartEvent', fields: { value: 'number' } }],
                eventTypes: [{ name: 'chart-selected', payload: 'chartEvent' }],
                members: [{ name: 'charts', function: 'charts', kind: 'property', on: 'element', parameters: [], result: 'boolean', changes: 'constant', reads: 'fresh' }],
            });

            const registry = new ModuleRegistry([Vocabulary.module, module]);
            const element = document.createElement('div');
            const resolveWith = text => {
                const query = domql.query(text, { panel: element });

                return new LanguageResolver(registry, query.bindings, null, {}).resolveDefinition(query.definition);
            };
            const events = resolveWith('(@panel eventsOf "chart-selected") { value: self.value }');
            const test = resolveWith('@panel.charts');

            expect(events.type.toString()).toBe('event<{ value: number }>');
            expect(test.type.toString()).toBe('boolean');
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

        it('names each member it refuses by the type its declaration is for', () => {
            const error = failure('{ a: @panel.root.children.count, b: @panel.shadow.root?.children.count, c: @panel.attached, d: @panel.first("p")?.rect?.width }', { panel }, { watch: true });

            expect(error.message).toContain("'node.root' (which misses a detached tree inserted");
            expect(error.message).toContain("'shadow.root' (which misses a shadow root attached");
            expect(error.message).toContain("'element.attached' (which misses");
            expect(error.message).toContain("'node.first' (which misses pointer state");
            expect(error.message).toContain("'element.rect' (which misses transforms");
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
                version: 10,
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

    describe('tests', () => {
        it('resolve a test as the Boolean member it is, nullable where an optional access reads it', () => {
            const resolved = resolve('@panel.disabled');

            expect(resolved.type.toString()).toBe('boolean');
            expect(resolved.getResolution('/query').declaration.name).toBe('disabled');
            expect(resolve('(@panel.parent as "element")?.attached').type.toString()).toBe('boolean?');
            expect(resolve('@panel[@name]', { panel, name: 'focused' }).type.toString()).toBe('boolean');
            expect(resolve('@document.visible and @document.hasFocus').type.toString()).toBe('boolean');
        });

        it('refuse a test the receiver has not', () => {
            expect(failure('@panel.visible').message).toContain("'visible' is not available on element");
            expect(failure('@document.attached').message).toContain("'attached' is not available on document");
        });

        it('give the member to write for has written as the presence test it was, where the receiver\'s type declares that member', () => {
            expect(failure('@panel has "children"').message).toContain("a presence test is the member that answers it, so write '@panel.hasChildren'");
            expect(failure('@document has "focus"').message).toContain("write '@document.hasFocus'");
            expect(failure('@panel has "focus"').message).not.toContain('write');
            expect(failure('@panel has "nonsense"').message).not.toContain('write');
            expect(failure('@panel has "Children"').message).not.toContain('write');
        });

        it('test for null with is null, a Boolean that is never null, whatever its subject', () => {
            expect(resolve('@panel.parent is null').type.toString()).toBe('boolean');
            expect(resolve('null is null').type.toString()).toBe('boolean');
            expect(failure('(@panel eventsOf "click") { clientX: self.clientX } is null').message).toContain('event source');
        });
    });

    describe('logical expressions', () => {
        it('type an and, an or and a not as a Boolean', () => {
            expect(resolve('@panel.attached and @panel.focused').type.toString()).toBe('boolean');
            expect(resolve('@panel.attached or (((@panel.parent as "element")?.attached) ?? false)').type.toString()).toBe('boolean');
            expect(resolve('not @panel.attached').type.toString()).toBe('boolean');
        });

        it('refuse an operand that can be null, giving the fallback to write', () => {
            expect(failure('@panel.attached or (@panel.parent as "element")?.attached').message).toContain(`An operand of 'or' is a Boolean that cannot be null, and this one is boolean?: write '((@panel.parent as "element")?.attached ?? false)', or '?? true', to say what its absence means`);
            expect(failure('@panel.attached and null').message).toContain("and this one is null: write '(null ?? false)'");
            expect(failure('not @off', { off: null }).message).toContain("What 'not' negates is a Boolean that cannot be null, and this one is null");
        });

        it('resolve every operand with its own location, the current value of each the one around the expression', () => {
            const resolved = resolve('@panel { both: self.attached and (self.disabled or self.focused) }');

            expect(resolved.getResolution('/query/fields/0/value/operands/0').declaration.name).toBe('attached');
            expect(resolved.getResolution('/query/fields/0/value/operands/1/operands/1').declaration.name).toBe('focused');
        });

        it('validate an operand that evaluation might never reach', () => {
            const error = failure('@panel.attached or @panel.nonsense');

            expect(error.message).toContain("'nonsense' is no member of the vocabulary");
            expect(error.location.pointer).toBe('/query/operands/1');
        });

        it.each([
            ['a string, as the earlier shorthand of names gives', '@panel.attached and "visible"', '/query/operands/1', 'string'],
            ['a number', '@panel.attached or 3', '/query/operands/1', 'number'],
            ['a structure', '@panel.rect and true', '/query/operands/0', 'rectangle?'],
        ])('refuse an operand that is %s, naming its type', (_, text, pointer, type) => {
            const error = failure(text);

            expect(error.message).toContain(`An operand of '${text.includes(' or ') ? 'or' : 'and'}' is a Boolean, and this one is ${type}`);
            expect(error.location.pointer).toBe(pointer);
        });

        it('count every operand when a watch asks what can be followed', () => {
            const error = failure('@panel.attached or @panel.textEditable', { panel }, { watch: true });

            expect(error.message).toContain("'element.textEditable'");
            expect(() => resolve('@panel.attached or @panel.textEditable', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
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

        it('refuse a condition that is no Boolean, or one that can be null', () => {
            const error = failure('if @panel.size then 1 else 2');

            expect(error.message).toContain("The condition of 'if' is a Boolean, and this one is size?");
            expect(error.location.pointer).toBe('/query/condition');
            expect(failure('if (@panel.parent as "element")?.attached then 1 else 2').message).toContain("The condition of 'if' is a Boolean that cannot be null, and this one is boolean?");
            expect(resolve('if ((@panel.parent as "element")?.attached) ?? false then 1 else 2').type.toString()).toBe('number');
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
            const resolved = resolve('@panel { size: self.size, kind: self attributeOf "role", attached: self.attached, clientSize: self["clientSize"], rows: self.all("i") { rect: self.rect } }');
            const { query } = resolved.definition;

            expect(resolved.fieldNamesOf(query)).toEqual(['size', 'kind', 'attached', 'clientSize', 'rows']);
            expect(resolved.fieldNamesOf(query.fields[4].value)).toEqual(['rect']);
        });

        it('finds each node, by the node itself, with its pointer and its resolution', () => {
            const resolved = resolve('@panel.all("i") { h: self.size?.height, on: self.attached or self.focused }');
            const { query } = resolved.definition;
            const [chain, on] = query.fields.map(field => field.value);
            const height = chain.target;

            expect(resolved.pointerOf(query.target)).toBe('/query/target');
            expect(resolved.resolutionOf(query.target).declaration.name).toBe('all');
            expect(resolved.pointerOf(height.target)).toBe('/query/fields/0/value/target/target');
            expect(resolved.resolutionOf(height).kind).toBe('field');
            expect(resolved.resolutionOf(chain)).toBeUndefined();
            expect(resolved.pointerOf(on.operands[1])).toBe('/query/fields/1/value/operands/1');
            expect(resolved.resolutionOf(on.operands[1]).declaration.name).toBe('focused');
            expect(resolved.resolutionOf(query)).toBeUndefined();
        });
    });
});

