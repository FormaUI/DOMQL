import { describe, it, expect } from 'vitest';
import { DomqlQuery } from '#domql/dom/DomqlQuery.mjs';
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
            expect(resolve('window.size').type.toString()).toBe('size');
        });

        it('types a field of a structured type read through an optional access, nullable where its receiver can be null', () => {
            expect(resolve('panel.size?.width').type.toString()).toBe('number?');
        });

        it('types a list property and an aggregate over its items', () => {
            expect(resolve('panel.children.count').type.toString()).toBe('number');
            expect(resolve('panel.children.sum(self.size?.width)').type.toString()).toBe('number');
            expect(resolve('panel.children.max(self.size?.width)').type.toString()).toBe('number?');
        });

        it('keeps the item type through where, first and at', () => {
            expect(resolve('panel.children.where(self.attached).first?.size').type.toString()).toBe('size?');
            expect(resolve('panel.children:[0]?.size').type.toString()).toBe('size?');
        });

        it('types an object expression by its written field names', () => {
            expect(resolve('panel { size = self.size, hasFocus = self.has("focus") }').type.toString()).toBe('{ size: size?, hasFocus: boolean }');
        });

        it('types a bound value by the type it has', () => {
            expect(resolve('count', { count: 3 }).type.toString()).toBe('number');
            expect(resolve('nothing', { nothing: null }).type.toString()).toBe('null');
        });

        it.each([
            ['the result', 'panel.loose'],
            ['a field', 'panel { v = self.loose }'],
            ['an argument', 'panel.children:[panel.loose]'],
            ['an expression', 'panel.children.where(self.loose).count'],
            ['an operand of and', 'panel.loose and 1'],
            ['a condition', 'if panel.loose then 1 else 2'],
            ['what not negates', 'not panel.loose'],
            ['a conditional binding', 'if let v = panel.loose then 1 else 2'],
            ['a receiver', 'panel.loose.count'],
            ['a subject', 'panel.loose.attached'],
        ])('refuses a type parameter no receiver gives an argument as %s, so its value never reaches a result', (_, text) => {
            const registry = new ModuleRegistry([Vocabulary.module, new DomqlModule('loose', {
                members: [{ name: 'loose', function: 'loose', kind: 'property', on: 'element', parameters: [], result: 'T', changes: 'constant', reads: 'fresh' }],
            }, null)]);
            const query = domql.query(text, { panel });

            expect(() => new LanguageResolver(registry, DomqlQuery.bindingsOf(query), null, {}).resolveDefinition(query.definition)).toThrow(expect.objectContaining({ kind: 'validation', message: expect.stringMatching(/\bT\b/) }));
        });
    });

    describe('requests', () => {
        it('resolves a chain of properties and operations as a query', () => {
            expect(resolve('panel.size').kind).toBe('query');
        });

        it('resolves an event source as a subscription', () => {
            const resolved = resolve('document.on("keydown") { key = self.key }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type.toString()).toBe('event<{ key: string }>');
        });

        it('shapes the events of a source by the fields of its payload', () => {
            const resolved = resolve('panel.on("click") { clientX = self.clientX, button = self.button }');

            expect(resolved.kind).toBe('subscription');
            expect(resolved.type.toString()).toBe('event<{ clientX: number, button: number }>');
        });

        it('refuses an answer that is no data', () => {
            expect(failure('panel.parent').message).toContain('no data');
            expect(failure('panel.on("click") { target = self.target }').message).toContain('no data');
        });

        it('refuses a member after an event source', () => {
            expect(failure('panel.on("click").count').message).toContain('event source');
        });

        it('refuses an event source as an argument', () => {
            expect(failure('panel.matches(panel.on("click"))').message).toContain('event source');
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

            return new LanguageResolver(registry, DomqlQuery.bindingsOf(query), null, {}).resolveDefinition(query.definition);
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
            const resolved = resolveWith('panel.step()');

            expect(resolved.kind).toBe('action');
            expect(resolved.type.toString()).toBe('boolean');
        });

        it('shapes the result of an action by the object expression that follows it, which stays an action request', () => {
            const resolved = resolveWith('panel.pick() { id = self:attribute["id"] }');

            expect(resolved.kind).toBe('action');
            expect(resolved.type.toString()).toBe('{ id: string? }');
        });

        it('refuses an action whose result is no data, unless an object expression follows it', () => {
            expect(failureWith('panel.pick()').message).toContain('no data');
        });

        it('resolves a behavior as a behavior request, which takes no object expression', () => {
            expect(resolveWith('panel.focusTrap()').kind).toBe('behavior');
            expect(failureWith('panel.focusTrap() { id = self:attribute["id"] }').message).toContain('A behavior request ends its chain and takes no object expression');
        });

        it('refuses a member after an action, and an action or a behavior inside a query', () => {
            expect(failureWith('panel.step().count').message).toContain('follows an action');
            expect(failureWith('{ moved = panel.step() }').message).toContain('is an action');
            expect(failureWith('panel.matches(panel.focusTrap())').message).toContain('is a behavior');
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
            expect(failure('panel.sum(self.size?.width)').message).toContain('not available');
        });
    });

    describe('arguments', () => {
        it('refuses a missing required argument', () => {
            expect(failure('panel.matches()').message).toContain("requires the argument 'selector'");
        });

        it('refuses a value where an operation takes its arguments as the fields of an object', () => {
            const error = failure('panel.overlaps(panel)');

            expect(error.message).toContain('as the fields of an object');
            expect(error.location.pointer).toBe('/query/argument');
        });

        it('refuses an argument given to an operation that takes none', () => {
            const registry = new ModuleRegistry([Vocabulary.module, new DomqlModule('ping', {
                members: [{ name: 'ping', function: 'ping', kind: 'operation', on: 'element', parameters: [], result: 'boolean', changes: 'constant', reads: 'fresh' }],
            }, null)]);
            const query = domql.query('panel.ping(1)', { panel });

            expect(() => new LanguageResolver(registry, DomqlQuery.bindingsOf(query), null, {}).resolveDefinition(query.definition)).toThrow(expect.objectContaining({ message: expect.stringContaining("'ping' takes no argument") }));
        });

        it('refuses an argument of the wrong type', () => {
            expect(failure('panel.matches(3)').message).toContain('expects string and finds number');
        });

        it('refuses a field of an options object that names no parameter, and one that leaves a required parameter out', () => {
            const unknown = failure('panel.overlaps({ other = panel, nonsense = 1 })');

            expect(unknown.message).toContain("no parameter 'nonsense'; it takes other, margin");
            expect(unknown.location.pointer).toBe('/query/argument/fields/1');
            expect(failure('panel.overlaps({ margin = 1 })').message).toContain("requires the argument 'other'");
        });

        it('refuses an access or a call of a receiver that can be null, giving the optional form', () => {
            expect(failure('panel.first(".a").size').message).toContain(`'size' follows element?, which can be null: write 'panel.first(".a")?.size'`);
            expect(failure('null.size').message).toContain("'size' follows null: write 'null?.size'");
            expect(failure('panel.first(".a").closest(".b")').message).toContain(`write 'panel.first(".a")?.closest(".b")'`);
            expect(failure('(panel.parent?.children).count').message).toContain("write '(panel.parent?.children)?.count'");
        });

        it('types an optional chain nullable where an optional access of it can meet null, and as its chain otherwise', () => {
            expect(resolve('(panel.parent as "element")?.size').type.toString()).toBe('size?');
            expect(resolve('panel.parent?.children.count').type.toString()).toBe('number?');
            expect(resolve('panel?.children.count').type.toString()).toBe('number');
            expect(resolve('(panel.parent as "element")?.rect?.width').type.toString()).toBe('number?');
        });

        it('types a coalescing operator as its value made non-null where its fallback is, and as their merged type', () => {
            expect(resolve('panel.rect?.width ?? 0').type.toString()).toBe('number');
            expect(resolve('panel.rect?.width ?? (panel.parent as "element")?.rect?.width').type.toString()).toBe('number?');
            expect(resolve('panel.children.count ?? 0').type.toString()).toBe('number');
            expect(resolve('null ?? "none"').type.toString()).toBe('string');
        });

        it('refuses a coalescing operator whose sides are of different types, or no values', () => {
            expect(failure('panel.rect?.width ?? "none"').message).toContain("The value and the fallback of '??' are of one type, and these are number? and string");
            expect(failure('panel.on("click") ?? 0').message).toContain("The value of '??' is a value, and this one is an event source");
        });

        // A node is no data, so its type is read from the refusal of a result that would hold one.
        const heldType = (text, bindings) => failure(text, bindings).message.match(/would hold (\S+),/)[1];

        it('types a node\'s tree members, and a node of two kinds as a node', () => {
            expect(heldType('panel.parent')).toBe('node?');
            expect(heldType('panel.root')).toBe('node');
            expect(heldType('panel.root.host')).toBe('element?');
            expect(resolve('document.all("p").count').type.toString()).toBe('number');
            expect(heldType('if wide then panel else document', { panel, wide: true })).toBe('node');
        });

        it('types an element\'s shadow view by its own members, which are no element\'s, and refuses it as data', () => {
            expect(resolve('panel.shadow.root?.children.count').type.toString()).toBe('number?');
            expect(resolve('panel.shadow.elements?.count').type.toString()).toBe('number?');
            expect(heldType('panel.shadow')).toBe('shadow');
            expect(failure('panel.shadow.rect').message).toContain("'rect' is not available on shadow");
            expect(failure('panel.root.shadow').message).toContain("'shadow' is not available on node");
        });

        it('types a strict cast as the type it casts to, nullable where its target can be null, and an attempted one as that type made nullable', () => {
            expect(heldType('panel.parent as "element"')).toBe('element?');
            expect(resolve('(panel.parent as "element")?.rect?.width').type.toString()).toBe('number?');
            expect(heldType('panel as "element"')).toBe('element');
            expect(heldType('panel as "node"')).toBe('node');
            expect(heldType('null as "shadowRoot"')).toBe('shadowRoot?');
            expect(heldType('try panel as "element"')).toBe('element?');
            expect(heldType('try panel.parent as "element"')).toBe('element?');
            expect(resolve('try n to "number"', { n: '1' }).type.toString()).toBe('number?');
            expect(resolve('try n to "number" ?? 0', { n: '1' }).type.toString()).toBe('number');
        });

        it('refuses a cast to a type that is no node, and one its target can never be', () => {
            expect(failure('panel as "widget"').message).toContain("'as' casts to node or one of its kinds, element, document, documentFragment, shadowRoot, and 'widget' is none of them");
            expect(failure('document as "element"').message).toContain('A value of document can never be cast to element');
            expect(failure('try document as "element"').message).toContain('A value of document can never be cast to element');
            expect(failure('try panel as "widget"').message).toContain("'as' casts to node or one of its kinds");
            expect(failure('5 as "element"').message).toContain('A value of number can never be cast to element');
        });

        it('types an optional-access group as the optional chain it writes', () => {
            expect(resolve('(?(panel.parent as "element").rect.width)').type.toString()).toBe('number?');
            expect(resolve('(?panel.children.count)').type.toString()).toBe('number');
        });

        it('takes a call of a receiver that can be null only through optional access, which answers null where it is', () => {
            expect(failure('(panel.parent as "element").matches(".row")').message).toContain(`write '(panel.parent as "element")?.matches(".row")'`);
            expect(resolve('(panel.parent as "element")?.matches(".row")').type.toString()).toBe('boolean?');
            expect(resolve('panel.matches(".row")').type.toString()).toBe('boolean');
        });

        it('refuses a member written in a form its declaration does not take, giving the form it does', () => {
            expect(failure('window.media("(min-width: 1px)")').message).toContain(`'media' is an indexer: write 'window:media["(min-width: 1px)"]'`);
            expect(failure('panel.attribute("id")').message).toContain(`'attribute' is an indexer: write 'panel:attribute["id"]'`);
            expect(failure('panel:closest[".row"]').message).toContain(`'closest' uses call syntax: write 'panel.closest(".row")'`);
            expect(failure('panel.parent()').message).toContain("'parent' is a property: write 'panel.parent'");
            expect(failure('panel.size?.width()').message).toContain("write 'panel.size?.width'");
        });

        it('resolves an omitted argument to its default', () => {
            const resolved = resolve('panel.intersects()');
            const [, margin] = resolved.getResolution('/query').arguments;

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
            expect(resolve('window:media["(min-width: 1px)"]').type.toString()).toBe('boolean');
            expect(resolve('window:media[null]').type.toString()).toBe('boolean?');
        });

        it('lets an aggregate expression produce null per item', () => {
            expect(resolve('panel.children.sum(self.size?.width)').type.toString()).toBe('number');
        });

        it('refuses an aggregate expression of another type', () => {
            expect(failure('panel.children.sum(self:attribute["id"])').message).toContain('must produce number?');
        });
    });

    describe('fixed names', () => {
        it('resolves an access by name to the type the properties its names name share', () => {
            expect(resolve('panel["children"].count').type.toString()).toBe('number');
            expect(resolve('panel[name]', { panel, name: 'size' }).type.toString()).toBe('size?');
            expect(resolve('panel { let name = if wide then "size" else "clientSize", s = self[name] }', { panel, wide: true }).type.toString()).toBe('{ s: size? }');
            expect(resolve('panel[null ?? "size"]').type.toString()).toBe('size?');
        });

        it('determines the names a conditional binding gives as its value does, without null, in its consequent', () => {
            expect(resolve('panel[if let name = chosen then name else "clientSize"]', { panel, chosen: 'size' }).type.toString()).toBe('size?');
            expect(resolve('if let name = chosen then panel[name] else null', { panel, chosen: 'size' }).type.toString()).toBe('size?');
            expect(failure('if let name = panel:["data-name"] then panel[name] else null', { panel }).message).toContain('An access by name reads a name determined when the query is prepared');
        });

        it.each([
            ['an and and an or settle, a flag bound true', 'panel[wide and "size" or "rect"]', { wide: true }, 'size?'],
            ['an and and an or settle, a flag bound false', 'panel[wide and "size" or "rect"]', { wide: false }, 'rectangle?'],
            ['an and and an or choose between, by a value read when the query is evaluated', 'panel[panel.first(".a") and "size" or "clientSize"]', {}, 'size?'],
            ['an or gives past a falsey middle operand, which passes evaluation on', 'panel[wide and label or "rect"]', { wide: true, label: null }, 'rectangle?'],
            ['an or gives from a truthy middle operand', 'panel[wide and label or "rect"]', { wide: true, label: 'size' }, 'size?'],
            ['an or gives past a null operand', 'panel[first or second]', { first: null, second: 'size' }, 'size?'],
            ['a conditional whose fixed condition selects one branch, the other left unread', 'panel[if wide then "size" else "nonsense"]', { wide: true }, 'size?'],
            ['a conditional whose condition is read when the query is evaluated, either branch possible', 'panel[if panel.attached then "size" else "clientSize"]', {}, 'size?'],
            ['a coalescing operator whose value cannot be null, its fallback never asked for names', 'panel["size" ?? panel:["x"]]', {}, 'size?'],
        ])('resolves an access by name to the names %s', (_, text, bindings, type) => {
            expect(resolve(text, { panel, ...bindings }).type.toString()).toBe(type);
        });

        it.each([
            ['an and that can give false', 'panel[wide and "size"]', { wide: false }, "An access by name reads a string, and 'wide and \"size\"' can be false"],
            ['a name an and and an or reach that no property has', 'panel[wide and "nonsense" or "size"]', { wide: true }, "'nonsense' is no member of the vocabulary"],
            ['an and of a Boolean member and a name, whose values no one type holds', 'panel { v = self[self.attached and "size" or "clientSize"] }', {}, "What 'and' gives is false or string"],
            ['a value that is no name', 'panel[count]', { count: 5 }, 'An access by name reads a name determined when the query is prepared'],
            ['a fallback whose names go unasked, which is validated all the same', 'panel["size" ?? panel.nonsense]', {}, "'nonsense' is no member of the vocabulary"],
        ])('refuses an access by name through %s', (_, text, bindings, message) => {
            expect(failure(text, { panel, ...bindings }).message).toContain(message);
        });

        it('refuses an access by name whose names cannot be determined, can be null, name no property or are of different types', () => {
            expect(failure('panel[panel:attribute["data-name"]]').message).toContain('An access by name reads a name determined when the query is prepared');
            expect(failure('panel[name]', { panel, name: null }).message).toContain("An access by name reads a string, and 'name' can be null");
            expect(failure('panel["depth"]').message).toContain("'depth' is no member of the vocabulary");
            expect(failure('panel[if panel.attached then "size" else "children"]', { panel }).message).toContain('are of one type, and these are size?, list<element>');
        });

        it('refuses an access by name of a receiver that can be null, giving the optional form', () => {
            expect(failure('panel.first(".a")[name]', { panel, name: 'size' }).message).toContain(`write 'panel.first(".a")?[name]'`);
            expect(resolve('panel.first(".a")?[name]', { panel, name: 'size' }).type.toString()).toBe('size?');
            expect(resolve('row?[name]', { row: null, name: 'id' }).type.toString()).toBe('null');
        });

        it('resolves an event type and a feature', () => {
            expect(resolve('document.on("keydown") { key = self.key }').type.toString()).toBe('event<{ key: string }>');
            expect(resolve('window.supports("share")').type.toString()).toBe('boolean');
        });

        it('resolves a feature held in a local whose value is a literal or a bound parameter, and refuses one whose value reads the document', () => {
            expect(resolve('window { let feature = "share", supportsShare = self.supports(feature) }').type.toString()).toBe('{ supportsShare: boolean }');
            expect(resolve('window { let feature = chosen, supportsShare = self.supports(feature) }', { chosen: 'share' }).type.toString()).toBe('{ supportsShare: boolean }');
            expect(failure('window { let feature = if panel.attached then "share" else "clipboard", supportsShare = self.supports(feature) }', { panel }).message).toContain('a string the query\'s preparation settles');
        });

        it.each([
            ['an and and an or', 'window.supports(wide and "share" or "clipboard")', { wide: true }],
            ['an and and an or, the other way', 'window.supports(wide and "clipboard" or "share")', { wide: false }],
            ['a conditional', 'window.supports(if wide then "share" else "nothing")', { wide: true }],
            ['a conditional binding', 'window.supports(if let f = feature then f else "nothing")', { feature: 'share' }],
            ['a coalescing operator whose value is null', 'window.supports(feature ?? "share")', { feature: null }],
            ['a coalescing operator whose value is not', 'window.supports(feature ?? "nothing")', { feature: 'share' }],
            ['a local holding one of them', 'window { let f = wide and "share" or "nothing", supported = self.supports(f) }', { wide: true }],
        ])('resolves a feature %s settles when the query is prepared, the side it does not take left unselected', (_, text, bindings) => {
            expect(() => resolve(text, bindings)).not.toThrow();
        });

        it('refuses a feature an expression settles to a name the vocabulary lacks, and one that reads the document to settle', () => {
            expect(failure('window.supports(wide and "share" or "nothing")', { wide: false }).message).toContain("'nothing' is no condition 'supports' asks; it asks share, clipboard");
            expect(failure('window.supports(if panel.attached then "share" else "share")', { panel }).message).toContain("a string the query's preparation settles");
            expect(failure('window.supports(panel:["data-f"] ?? "share")', { panel }).message).toContain("a string the query's preparation settles");
        });

        it('resolves a feature a conditional binding holds where its value is a literal or a bound parameter, and refuses one any other expression gives', () => {
            expect(resolve('if let feature = "share" then window.supports(feature) else false').type.toString()).toBe('boolean');
            expect(resolve('if let feature = chosen then window.supports(feature) else false', { chosen: 'share' }).type.toString()).toBe('boolean');
            expect(failure('if let feature = panel:["data-f"] then window.supports(feature) else false', { panel }).message).toContain('a string the query\'s preparation settles');
        });

        it('refuses an event type or a feature the vocabulary does not declare', () => {
            expect(failure('panel.on("nonsense")').message).toContain('no event type');
            expect(failure('window.supports("nonsense")').message).toContain("'nonsense' is no condition 'supports' asks");
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

                return new LanguageResolver(registry, DomqlQuery.bindingsOf(query), null, {}).resolveDefinition(query.definition);
            };
            const events = resolveWith('panel.on("chart-selected") { value = self.value }');
            const test = resolveWith('panel.charts');

            expect(events.type.toString()).toBe('event<{ value: number }>');
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
            expect(error.location.pointer).toBe('/query/argument');
        });

        it('points into a definition that has no text', () => {
            const definition = {
                version: 19,
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
            expect(resolve('panel.size').definition).toBe(domql.query('panel.size', { panel }).definition);
        });
    });

    describe('equalities', () => {
        it('type an equality as a Boolean that is never null, whatever its operands', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('boolean');
            expect(resolve('panel.first("a")?.rect?.width == 0').type.toString()).toBe('boolean');
            expect(resolve('panel != panel').type.toString()).toBe('boolean');
            expect(resolve('panel.parent == document').type.toString()).toBe('boolean');
            expect(resolve('panel.rect == null').type.toString()).toBe('boolean');
            expect(resolve('missing == "x"', { missing: null }).type.toString()).toBe('boolean');
        });

        it('refuse two values whose types fit neither way', () => {
            expect(failure('"1" == 1').message).toContain("'==' compares values whose types fit one way or the other, and string and number fit neither way");
            expect(failure('panel == document').message).toContain('element and document fit neither way');
            expect(failure('panel.attached == "true"').message).toContain('boolean and string fit neither way');
        });

        it('compare a value that is no string, number, Boolean or node with null alone', () => {
            expect(failure('panel.rect == panel.rect').message).toContain("'==' compares a value of rectangle with null alone");
            expect(failure('panel.children == panel.children').message).toContain('a value of list<element> with null alone');
            expect(failure('window == window').message).toContain('a value of window with null alone');
            expect(failure('panel.on("click") { x = self.clientX } == null').message).toContain("'==' compares values, and this is an event source");
        });

        it('give the test to write for a value compared with the name of one of its Boolean members or its conditions, and nothing for any other', () => {
            expect(failure('panel == "attached"').message).toContain("a test is the member that answers it, so write 'panel.attached'");
            expect(failure('panel != "attached"').message).toContain("write 'not panel.attached'");
            expect(failure('panel == state', { panel, state: 'disabled' }).message).toContain("write 'panel.is(state)'");
            expect(failure('panel != "disabled"').message).toContain(`write 'not panel.is("disabled")'`);
            expect(failure('panel.first("a") == "focus"').message).toContain(`write 'panel.first("a")?.has("focus")'`);
            expect(failure('panel == "visible"').message).not.toContain('write');
            expect(failure('panel == "Attached"').message).not.toContain('write');
            expect(failure('panel == "children"').message).not.toContain('write');
        });
    });

    describe('tests', () => {
        it('resolve a test as the Boolean member or the condition it is, nullable where an optional access reads it', () => {
            const resolved = resolve('panel.is("disabled")');

            expect(resolved.type.toString()).toBe('boolean');
            expect(resolved.getResolution('/query').declaration.name).toBe('is');
            expect(resolved.getResolution('/query').contract.name).toBe('disabled');
            expect(resolve('(panel.parent as "element")?.attached').type.toString()).toBe('boolean?');
            expect(resolve('panel[name]', { panel, name: 'attached' }).type.toString()).toBe('boolean');
            expect(resolve('document.is("visible") and document.has("focus")').type.toString()).toBe('boolean');
        });

        it('refuse a test the receiver has not', () => {
            expect(failure('panel.is("visible")').message).toContain("'visible' is a condition of document, not of element");
            expect(failure('document.attached').message).toContain("'attached' is not available on document");
        });

        it('give the member that answers a presence has asks of no condition, where the receiver\'s type declares that member, and the verb that asks a condition of another', () => {
            expect(failure('panel.has("children")').message).toContain("'children' is no condition 'has' asks");
            expect(failure('panel.has("children")').message).toContain("the member 'hasChildren' answers whether it has children");
            expect(failure('panel.has("nonsense")').message).not.toContain('hasNonsense');
            expect(failure('panel.has("Children")').message).not.toContain('hasChildren');
            expect(failure('panel.is("focus")').message).toContain(`'focus' is asked with 'has', not 'is': write '.has("focus")'`);
            expect(failure('window.is("share")').message).toContain(`'share' is asked with 'supports', not 'is': write '.supports("share")'`);
            expect(failure('document.has("visible")').message).toContain(`'visible' is asked with 'is', not 'has': write '.is("visible")'`);
            expect(resolve('document.has("focus") and window.supports("share")').type.toString()).toBe('boolean');
        });

        it('test for null with is null, a Boolean that is never null, whatever its subject', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('boolean');
            expect(resolve('null == null').type.toString()).toBe('boolean');
            expect(failure('panel.on("click") { clientX = self.clientX } == null').message).toContain('event source');
        });
    });

    describe('narrowing', () => {
        const local = (name, text) => `panel { let ${name} = self.first(".a"), let other = self.first(".b"), r = ${text} }`;

        it.each([
            ['the right operand of an and, where the left is the local', local('a', 'a and a.rect'), '{ r: rectangle? }'],
            ['the right operand of an and, where the left says the local is not null', local('a', 'a != null and a.attached'), '{ r: boolean }'],
            ['the right operand of an or, where the left says the local is null', local('a', 'a == null or a.attached'), '{ r: boolean }'],
            ['the right operand of an or, where the left negates the local', local('a', 'not a or a.attached'), '{ r: boolean }'],
            ['the consequent, where the condition is the local', local('a', 'if a then a.attached else false'), '{ r: boolean }'],
            ['the alternative, where the condition says the local is null', local('a', 'if a == null then false else a.attached'), '{ r: boolean }'],
            ['the consequent, where an and of conditions holds both', local('a', 'if a != null and other != null then a.attached and other.attached else false'), '{ r: boolean }'],
            ['the consequent, where every path of an or holds the local', local('a', 'if (a != null and other != null) or (a != null and panel.attached) then a.attached else false'), '{ r: boolean }'],
            ['a later elseif, where an earlier condition says the local is null', local('a', 'if a == null then 0 elseif a.attached then 1 else 2'), '{ r: number }'],
            ['the consequent of a binding, where its value is the local', local('a', 'if let b = a then a.attached and b.attached else false'), '{ r: boolean }'],
        ])('narrows a local in %s', (_, text, type) => {
            expect(resolve(text).type.toString()).toBe(type);
        });

        it.each([
            ['an or, which says neither is not null', local('a', 'if a != null or other != null then a.attached else false'), '/query/fields/0/value/consequent'],
            ['the alternative of a condition that is the local', local('a', 'if a then false else a.attached'), '/query/fields/0/value/alternative'],
            ['a member read anew, whose text is the same', 'panel.first(".a") and panel.first(".a").attached', '/query/operands/1'],
            ['another local of the same name, in another object expression', 'panel { x = { let a = self.first(".a"), v = a and a.attached }, y = { let a = self.first(".b"), v = a.attached } }', '/query/fields/1/value/fields/0/value'],
        ])('narrows nothing through %s', (_, text, pointer) => {
            const error = failure(text);

            expect(error.message).toContain("write '");
            expect(error.message).toContain('?.attached');
            expect(error.location.pointer).toBe(pointer);
        });

        it('keeps what it knows of a local in the object expressions and the expressions nested where it holds', () => {
            expect(resolve('panel { let a = self.first(".a"), v = a and panel.children { w = a.attached, u = self.attached } }').type.toString()).toBe('{ v: list<{ w: boolean, u: boolean }>? }');
            expect(resolve('panel { let a = self.first(".a"), v = a and panel.children.where(a.attached).count }').type.toString()).toBe('{ v: number? }');
        });
    });

    describe('logical expressions', () => {
        it('type an and, an or and a not as a Boolean', () => {
            expect(resolve('panel.attached and panel.has("focus")').type.toString()).toBe('boolean');
            expect(resolve('panel.attached or (((panel.parent as "element")?.attached) ?? false)').type.toString()).toBe('boolean');
            expect(resolve('not panel.attached').type.toString()).toBe('boolean');
        });

        it('type an and and an or as the operands that can decide them: the falsey part of each before the last, for and, the truthy part for or, and the last', () => {
            expect(resolve('panel.attached or (panel.parent as "element")?.attached').type.toString()).toBe('boolean?');
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
            ['a Boolean and an element', 'panel.attached and panel', "What 'and' gives is false or element, which no one type holds; write 'if panel.attached then panel else null' if null is an acceptable alternative"],
            ['a Boolean or a number', 'panel.attached or 3', "What 'or' gives is true or number, which no one type holds; a conditional, 'if … then … else …', chooses between values of one type"],
            ['a nullable Boolean and a string', '(panel.parent as "element")?.attached and "x"', "What 'and' gives is false or null or string"],
        ])('refuse an and or an or of %s, whose values no one type holds', (_, text, message) => {
            const error = failure(text);

            expect(error.message).toContain(message);
            expect(error.location.pointer).toBe('/query');
        });

        it('refuse an operand that is no value', () => {
            expect(failure('panel.on("click") and true').message).toContain("An operand of 'and' is a value, and this one is an event source");
            expect(failure('not panel.on("click")').message).toContain("What 'not' negates is a value, and this one is an event source");
        });

        it('resolve every operand with its own location, the current value of each the one around the expression', () => {
            const resolved = resolve('panel { both = self.attached and (self.is("disabled") or self.has("focus")) }');

            expect(resolved.getResolution('/query/fields/0/value/operands/0').declaration.name).toBe('attached');
            expect(resolved.getResolution('/query/fields/0/value/operands/1/operands/1').contract.name).toBe('focus');
        });

        it('validate an operand that evaluation might never reach', () => {
            const error = failure('panel.attached or panel.nonsense');

            expect(error.message).toContain("'nonsense' is no member of the vocabulary");
            expect(error.location.pointer).toBe('/query/operands/1');
        });

        it('count every operand when a watch asks what can be followed', () => {
            const error = failure('panel.attached or panel.is("text-editable")', { panel }, { watch: true });

            expect(error.message).toContain(`'is("text-editable")'`);
            expect(() => resolve('panel.attached or panel.is("text-editable")', { panel }, { watch: true, acceptPartialObservation: true })).not.toThrow();
        });

        it('let a group start a chain', () => {
            expect(resolve('(panel).children.count').type.toString()).toBe('number');
        });
    });

    describe('locals', () => {
        it('type a use of a local as the value it names', () => {
            expect(resolve('panel { let size = self.size, width = size?.width }').type.toString()).toBe('{ width: number? }');
            expect(resolve('panel { let rows = self.children, rows = rows { key = self:attribute["data-key"] } }').type.toString()).toBe('{ rows: list<{ key: string? }> }');
        });

        it('resolve a local where it is written, whatever current value its use has', () => {
            expect(resolve('panel { let size = self.size, rows = self.children { size = size } }').type.toString()).toBe('{ rows: list<{ size: size? }> }');
        });

        it('let a local hold what is no data, which no field can', () => {
            expect(resolve('panel { let first = self.children:[0], key = first?:attribute["data-key"] }').type.toString()).toBe('{ key: string? }');
        });

        it('validate a local no field uses', () => {
            expect(failure('panel { let wrong = self.nonsense, a = 1 }').location.pointer).toBe('/query/locals/0/value');
        });

        it('refuse a local that is no value', () => {
            expect(failure('panel { let clicks = self.on("click"), a = 1 }').message).toContain("The local 'clicks' is an event source, and a local is a value");
        });
    });

    describe('conditionals', () => {
        it('type a conditional by its branches, nullable where either is', () => {
            expect(resolve('if wide then 1 else 2', { panel, wide: true }).type.toString()).toBe('number');
            expect(resolve('if wide then panel.size?.width else 0', { panel, wide: true }).type.toString()).toBe('number?');
            expect(resolve('if wide then "on" else null', { panel, wide: true }).type.toString()).toBe('string?');
            expect(resolve('if wide then { width = 1 } else { width = panel.size?.width }', { panel, wide: true }).type.toString()).toBe('{ width: number? }');
        });

        it('type an elseif as the conditional it is nested in the alternative', () => {
            expect(resolve('if a then 1 elseif b then null else 3', { a: true, b: false }).type.toString()).toBe('number?');
        });

        it('refuse branches of different types, naming both', () => {
            const error = failure('if wide then 1 else "one"', { panel, wide: true });

            expect(error.message).toContain("The branches of 'if' are of one type, and these are number and string");
            expect(error.location.pointer).toBe('/query/alternative');
            expect(failure('if wide then { a = 1 } else { b = 1 }', { panel, wide: true }).message).toContain('{ a: number } and { b: number }');
        });

        it('take a condition of any value, and refuse one that is no value', () => {
            expect(resolve('if panel.size then 1 else 2').type.toString()).toBe('number');
            expect(resolve('if (panel.parent as "element")?.attached then 1 else 2').type.toString()).toBe('number');
            expect(resolve('if panel.children then 1 else 2').type.toString()).toBe('number');

            const error = failure('if panel.on("click") then 1 else 2');

            expect(error.message).toContain("The condition of 'if' is a value, and this one is an event source");
            expect(error.location.pointer).toBe('/query/condition');
        });

        it('validate a branch that evaluation might never reach', () => {
            expect(failure('if wide then 1 else panel.nonsense', { panel, wide: true }).location.pointer).toBe('/query/alternative');
        });

        it('type is null as a Boolean that is never null, whatever its subject', () => {
            expect(resolve('panel.parent == null').type.toString()).toBe('boolean');
            expect(resolve('null == null').type.toString()).toBe('boolean');
        });
    });

    describe('the resolved definition', () => {
        it('names each field of each object expression once, as it is written', () => {
            const resolved = resolve('panel { size = self.size, kind = self:attribute["role"], attached = self.attached, clientSize = self["clientSize"], rows = self.all("i") { rect = self.rect } }');
            const { query } = resolved.definition;

            expect(resolved.fieldNamesOf(query)).toEqual(['size', 'kind', 'attached', 'clientSize', 'rows']);
            expect(resolved.fieldNamesOf(query.fields[4].value)).toEqual(['rect']);
        });

        it('finds each node, by the node itself, with its pointer and its resolution', () => {
            const resolved = resolve('panel.all("i") { h = self.size?.height, on = self.attached or self.has("focus") }');
            const { query } = resolved.definition;
            const [chain, on] = query.fields.map(field => field.value);
            const height = chain.target;

            expect(resolved.pointerOf(query.target)).toBe('/query/target');
            expect(resolved.resolutionOf(query.target).declaration.name).toBe('all');
            expect(resolved.pointerOf(height.target)).toBe('/query/fields/0/value/target/target');
            expect(resolved.resolutionOf(height).kind).toBe('field');
            expect(resolved.resolutionOf(chain)).toBeUndefined();
            expect(resolved.pointerOf(on.operands[1])).toBe('/query/fields/1/value/operands/1');
            expect(resolved.resolutionOf(on.operands[1]).contract.name).toBe('focus');
            expect(resolved.resolutionOf(query)).toBeUndefined();
        });
    });
});

