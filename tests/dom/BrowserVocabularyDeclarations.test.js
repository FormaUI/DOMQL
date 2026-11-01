import { describe, it, expect } from 'vitest';
import { nexo } from '@formaui-net/nexo';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserVocabularyDeclarations } from '#domql/dom/BrowserVocabularyDeclarations.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';

/** The error a call throws: its code, its message, and where its location says it is. */
const refusalOf = call => {
    try {
        call();
    } catch (error) {
        return { code: error.code, message: error.message, ...error.location };
    }

    throw new Error('The call threw nothing');
};

/** A property a test module declares, constant and read fresh. */
const declaration = overrides => ({ name: 'charts', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, ...overrides });

/** A module whose one extension, of DOMQL's type, holds the members given. */
const extensionModule = (name, target, members) => nexo.createModule(name, { types: [{ name: `${name}${target}s`, kind: 'extension', target: `Domql.${target}`, members }] });

/** A declaration within a type, as `Type.name`: an unnamed indexer as `Type[]`, and an operator by the syntax that invokes it, as `Aria as Element`. */
const nameOf = (type, member) => {
    if (member.kind === 'operator') {
        return `${type.name} ${member.name === 'cast' ? 'as' : 'to'} ${member.result}`;
    }

    return member.name === undefined ? `${type.name}[]` : `${type.name}.${member.name}`;
};

describe('BrowserVocabularyDeclarations', () => {
    const { module } = BrowserVocabularyDeclarations;
    const registry = nexo.createRegistry([module]);
    const referenceTypes = module.types.filter(type => type.kind === 'reference');

    /** Each member within a reference type, with the type it stands within. */
    const typeMembers = referenceTypes.flatMap(type => type.members.map(member => ({ type, member })));

    /** The members the evaluator invokes: the module members, and those within its reference types but the event source and the cast, which the host and Nexo carry out. */
    const evaluated = [...module.members, ...typeMembers.map(({ member }) => member)].filter(member => member.invokedBy !== 'host' && member.kind !== 'operator');

    it('is a module of its own name, made by createModule as any module is, beside Nexo\'s own', () => {
        expect(module.name).toBe('Domql');
        expect('isBuiltIn' in module).toBe(false);
        expect(registry.moduleNames).toEqual(['Nexo', 'Domql']);
    });

    it('declares the DOM\'s reference types, the views of an element and the structured types of its measurements and events', () => {
        expect(module.types.map(type => `${type.kind} ${type.name}${type.supertype === undefined ? '' : ` : ${type.supertype}`}${type.abstract ? ', abstract' : ''}`)).toEqual([
            'reference Node, abstract', 'reference Element : Node', 'reference Document : Node', 'reference DocumentFragment : Node', 'reference ShadowRoot : Node', 'reference Window', 'reference Shadow', 'reference Aria', 'reference Range',
            'structured Size', 'structured Rectangle', 'structured Selection', 'structured DocumentSelection', 'structured Grid', 'structured Scroll', 'structured ScrollAxis', 'structured Playback', 'structured Location', 'structured DomEvent', 'structured PointerEvent', 'structured KeyboardEvent', 'structured DragEvent',
        ]);
        expect(module.types.filter(type => type.kind === 'structured').map(type => `${type.name} { ${type.members.map(member => `${member.name}: ${member.result}`).join(', ')} }`)).toEqual([
            'Size { width: Number, height: Number }',
            'Rectangle { left: Number, top: Number, right: Number, bottom: Number, width: Number, height: Number }',
            'Selection { start: Number, end: Number }',
            'DocumentSelection { type: String, collapsed: Boolean, rangeCount: Number, anchorElement: Element?, focusElement: Element?, range: Range? }',
            'Grid { columns: List<Number> }',
            'Scroll { inline: ScrollAxis, block: ScrollAxis }',
            'ScrollAxis { offset: Number, extent: Number, viewport: Number }',
            'Playback { paused: Boolean, muted: Boolean, ended: Boolean, currentTime: Number, duration: Number?, volume: Number }',
            'Location { href: String, pathname: String, search: String, hash: String }',
            'DomEvent { target: Element? }',
            'PointerEvent { target: Element, button: Number, buttons: Number, clientX: Number, clientY: Number, pointerType: String? }',
            'KeyboardEvent { target: Element, key: String, code: String }',
            'DragEvent { target: Element, clientX: Number, clientY: Number }',
        ]);
        expect(module.types.filter(type => type.kind === 'structured').flatMap(type => type.members).every(member => member.kind === 'property' && member.updates === undefined && member.impl === undefined)).toBe(true);
    });

    it('declares each member the specification lists within the type it reads', () => {
        expect(typeMembers.map(({ type, member }) => nameOf(type, member)).sort()).toEqual([
            'Node.children', 'Node.parent', 'Node.root', 'Node.host', 'Node.first', 'Node.all', 'Node.contains',
            'Element.disabled', 'Element.readonly', 'Element.textEditable', 'Element.focus', 'Element.focusWithin', 'Element.displayed', 'Element.focusable', 'Element.hover', 'Element.popoverOpen', 'Element.checked', 'Element.indeterminate', 'Element.autofilled',
            'Element.localName', 'Element.classes', 'Element.text', 'Element.html', 'Element.value', 'Element.playback', 'Element.inlineStyle',
            'Element.rect', 'Element.clientRect', 'Element.size', 'Element.clientSize', 'Element.scroll', 'Element.grid', 'Element.selection', 'Element.shadow', 'Element.aria', 'Element.direction', 'Element.attached', 'Element.hasChildren', 'Element.hasSelection',
            'Element.previousSibling', 'Element.nextSibling', 'Element.index', 'Element.hasPointerCapture',
            'Element[]', 'Element.attribute', 'Element.class', 'Element.style', 'Element.intersects', 'Element.overlaps', 'Element.matches', 'Element.rectRelativeTo', 'Element.closest', 'Element.scrollContainer', 'Element.on',
            'Document.visible', 'Document.focus', 'Document.activeElement', 'Document.selection', 'Document.on',
            'Window.size', 'Window.scroll', 'Window.devicePixelRatio', 'Window.location', 'Window.shortcutModifier', 'Window.media', 'Window.share', 'Window.clipboard', 'Window.on',
            'Shadow.root', 'Shadow.elements',
            'Aria.checked', 'Aria.disabled', 'Aria[]', 'Aria.attribute', 'Aria as Element',
            'Range.rect', 'Range.collapsed', 'Range.text', 'Range.startElement', 'Range.endElement', 'Range.commonAncestor', 'Range.intersects', 'Range.all', 'Range.offsetsIn',
        ].sort());
    });

    it('declares the indexers of elements, of ARIA views and of the window, an attribute read alike by its unnamed indexer and by attribute', () => {
        const indexers = typeMembers.filter(({ member }) => member.kind === 'indexer');

        expect(indexers.map(({ type, member }) => `${nameOf(type, member)}[${member.parameters.map(parameter => `${parameter.name}: ${parameter.type}`).join(', ')}]: ${member.result}`)).toEqual([
            'Element[][name: String]: String?', 'Element.attribute[name: String]: String?', 'Element.class[name: String]: Boolean', 'Element.style[property: String]: String?', 'Element.inlineStyle[property: String]: String?',
            'Window.media[query: String]: Boolean',
            'Aria[][name: String]: String?', 'Aria.attribute[name: String]: String?',
        ]);

        const element = document.createElement('div');
        const browser = nexo.createRegistry([BrowserModule.create()]);

        element.setAttribute('data-key', 'a1');
        element.setAttribute('aria-checked', 'true');

        const resolution = browser.resolve('{ unnamed = el["data-key"], named = el.attribute["data-key"], aria = el.aria["checked"], ariaNamed = el.aria.attribute["checked"] }', { el: element }, { imports: ['Domql'] });

        expect(resolution.usedDeclarations.filter(use => use.declaration.kind === 'indexer').map(use => use.qualifiedName)).toEqual(['Element[]', 'Element.attribute', 'Aria[]', 'Aria.attribute']);
        expect(resolution.createEvaluator({ el: element }, { window, document }).evaluate().value).toEqual({ unnamed: 'a1', named: 'a1', aria: 'true', ariaNamed: 'true' });
    });

    it('reads, with Nexo\'s own members of lists, the members of the list of an element\'s children', () => {
        const resolution = registry.resolve('{ count = el.children.count, first = el.children.first == null, last = el.children.last == null, item = el.children[0] == null, max = el.children.max(it.size?.width), min = el.children.min(it.size?.width), sum = el.children.sum(it.size?.width), where = el.children.where(it.attached).count }', { el: document.createElement('div') }, { imports: ['Domql'] });
        const nexoUses = resolution.usedDeclarations.filter(use => registry.getDeclaringModuleName(use.declaration) === 'Nexo').map(use => use.qualifiedName);

        expect(nexoUses).toEqual(['List.count', 'List.first', 'List.last', 'List[]', 'List.max', 'List.min', 'List.sum', 'List.where', 'List.count']);
    });

    it('declares the tolerance of layout on each member that measures it in CSS pixels, and on no other', () => {
        const measured = typeMembers.filter(({ member }) => member.updates?.tolerance !== undefined).map(({ type, member }) => `${nameOf(type, member)} within ${member.updates.tolerance}`);

        expect(measured).toEqual([
            'Element.rect within 0.05', 'Element.clientRect within 0.05', 'Element.size within 0.05', 'Element.clientSize within 0.05', 'Element.scroll within 0.05', 'Element.grid within 0.05', 'Element.rectRelativeTo within 0.05',
            'Window.size within 0.05', 'Window.scroll within 0.05', 'Range.rect within 0.05',
        ]);
    });

    it('gives every member the evaluator invokes observation coverage and, where partial, what it misses', () => {
        for (const member of evaluated) {
            expect(member.updates.changes).toBeTypeOf('string');
            expect(member.updates.changes === 'partly-observable' ? member.updates.misses : 'n/a').toBeTruthy();
        }
    });

    it('declares each member once within its type', () => {
        for (const type of module.types) {
            const keys = type.members.map(member => nameOf(type, member));

            expect(new Set(keys).size, type.name).toBe(keys.length);
        }
    });

    it('declares each test as a Boolean member, a presence test named with has', () => {
        const tests = typeMembers.filter(({ member }) => member.result === 'Boolean' && member.kind === 'property').map(({ type, member }) => nameOf(type, member));

        expect(tests).toEqual(['Element.attached', 'Element.hasChildren', 'Element.hasSelection', 'Range.collapsed']);
    });

    it('declares the tests of elements, the document, the window and ARIA views as Boolean functions, the state the browser sets rather than one that follows from structure', () => {
        const tests = typeMembers.filter(({ member }) => member.kind === 'function' && member.result === 'Boolean' && member.parameters.length === 0).map(({ type, member }) => `${nameOf(type, member)}()`);

        expect(tests).toEqual([
            'Element.disabled()', 'Element.readonly()', 'Element.textEditable()', 'Element.focus()', 'Element.focusWithin()', 'Element.displayed()', 'Element.focusable()', 'Element.hover()', 'Element.popoverOpen()', 'Element.checked()', 'Element.indeterminate()', 'Element.autofilled()',
            'Document.visible()', 'Document.focus()', 'Window.share()', 'Window.clipboard()', 'Aria.checked()', 'Aria.disabled()',
        ]);
    });

    it('declares the document a query runs against and its window as module members of Domql, read through its namespace', () => {
        expect(module.members.map(member => `${member.name}: ${member.result}`)).toEqual(['document: Document', 'window: Window']);
        expect(registry.resolve('{ visible = Domql.document.visible(), width = Domql.window.size.width }', {}, { imports: ['Domql'] }).usedDeclarations.map(use => use.qualifiedName)).toEqual(['Domql.document', 'Document.visible', 'Domql.window', 'Window.size', 'Size.width']);
    });

    it('lets one name answer on different receivers', () => {
        expect(referenceTypes.filter(type => type.members.some(member => member.name === 'size')).map(type => type.name)).toEqual(['Element', 'Window']);
    });

    describe('recognizing a value', () => {
        const host = document.createElement('div');
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const values = {
            range: document.createRange(),
            element: document.createElement('div'),
            document,
            fragment: document.createDocumentFragment(),
            shadowRoot,
            window,
            text: document.createTextNode('text'),
            comment: document.createComment('comment'),
            data: { nodeType: 1 },
        };

        it('gives a bound element, document, document fragment, shadow root and window their types, and a text or a comment node, and data that names a nodeType, none', () => {
            expect(Object.fromEntries(Object.entries(values).map(([name, value]) => [name, module.typeOf(value)]))).toEqual({
                range: 'Range', element: 'Element', document: 'Document', fragment: 'DocumentFragment', shadowRoot: 'ShadowRoot', window: 'Window', text: null, comment: null, data: null,
            });
        });

        it('admits each value to its type, its supertype and, an element, the views of it, and a text or a comment node, and data that names a nodeType, to none', () => {
            expect(Object.fromEntries(Object.entries(values).map(([name, value]) => [name, referenceTypes.filter(type => type.isInstance(value)).map(type => type.name)]))).toEqual({
                range: ['Range'],
                element: ['Node', 'Element', 'Shadow', 'Aria'],
                document: ['Node', 'Document'],
                fragment: ['Node', 'DocumentFragment'],
                shadowRoot: ['Node', 'ShadowRoot'],
                window: ['Window'],
                text: [],
                comment: [],
                data: [],
            });
        });

        it('binds each node and the window as the reference its type recognizes, refusing a text or a comment node and binding data that names a nodeType as data', () => {
            const { element, fragment, text, comment, data } = values;
            const bindings = registry.createBindings({ element, document, fragment, shadowRoot, window, data });

            expect(['element', 'document', 'fragment', 'shadowRoot', 'window', 'data'].map(name => bindings.getType(name))).toEqual(['Element', 'Document', 'DocumentFragment', 'ShadowRoot', 'Window', '{ nodeType: Number }']);
            expect(bindings.readValue('element')).toBe(element);

            for (const node of [text, comment]) {
                expect(refusalOf(() => registry.createBindings({ node }))).toMatchObject({ code: 'NEXO2034', binding: 'node' });
            }
        });

        it('recognizes no window in data that is its own window, since a window holds its document, and leaves the data to be refused as data that reaches itself', () => {
            const looping = { n: 1 };

            looping.window = looping;

            expect(module.typeOf(looping)).toBeNull();
            expect(referenceTypes.filter(type => type.isInstance(looping))).toEqual([]);
            expect(refusalOf(() => registry.createBindings({ looping }))).toMatchObject({ code: 'NEXO2022', binding: 'looping' });
        });
    });

    it('casts an element\'s ARIA view back to the element, answering it as it is', () => {
        const aria = module.types.find(type => type.name === 'Aria');
        const element = document.createElement('div');
        const browser = nexo.createRegistry([BrowserModule.create()]);

        element.id = 'checkbox';

        // Its one operator, a cast without an implementation, answers the view as it is.
        expect(aria.members.filter(member => member.kind === 'operator').map(member => ({ name: member.name, result: member.result, impl: member.impl }))).toEqual([{ name: 'cast', result: 'Element', impl: undefined }]);

        const resolution = browser.resolve('(el.aria as Element)["id"]', { el: element }, { imports: ['Domql'] });

        expect(resolution.usedDeclarations.map(use => use.qualifiedName)).toEqual(['Element.aria', 'Aria as Element', 'Element[]']);
        expect(resolution.createEvaluator({ el: element }, { window, document }).evaluate().value).toBe('checkbox');
    });

    it('lets another module extend an element, a kind of node included, with a member of a name the DOM vocabulary answers, read with : beside DOMQL\'s own', () => {
        const sizes = extensionModule('Sizes', 'Element', [declaration({ name: 'size' })]);
        const parents = extensionModule('Parents', 'ShadowRoot', [declaration({ name: 'parent' })]);
        const extended = nexo.createRegistry([module, sizes, parents]);
        const resolution = extended.resolve('import Parents\nimport Sizes\nreturn { own = el.size?.width, extended = el:size, parent = shadowRoot.parent == null, extendedParent = shadowRoot:parent }', { el: document.createElement('div'), shadowRoot: document.createElement('div').attachShadow({ mode: 'open' }) }, { imports: ['Domql'] });

        expect(extended.moduleNames).toEqual(['Nexo', 'Domql', 'Sizes', 'Parents']);
        expect(resolution.usedDeclarations.filter(use => ['size', 'parent'].includes(use.name)).map(use => `${use.qualifiedName} of ${extended.getDeclaringModuleName(use.declaration)}`)).toEqual([
            'Element.size of Domql', 'Element.size of Sizes', 'Node.parent of Domql', 'ShadowRoot.parent of Parents',
        ]);
    });

    it('lets a module beside it declare a member and a Boolean function of any name on an element', () => {
        const charts = extensionModule('Charts', 'Element', [
            declaration({ name: 'palette' }),
            declaration({ name: 'plotted', kind: 'function', result: 'Boolean', parameters: [], updates: { changes: 'unobserved', reads: 'fresh' } }),
        ]);
        const extended = nexo.createRegistry([module, charts]);
        const resolution = extended.resolve('import Charts\nreturn { palette = el:palette, plotted = el:plotted() }', { el: document.createElement('div') }, { imports: ['Domql'] });

        expect(resolution.usedDeclarations.map(use => extended.getDeclaringModuleName(use.declaration))).toEqual(['Charts', 'Charts']);
    });

    it('declares on as the event source of elements, the document and the window, once in each, a host call making a subscription, whose fixed type selects through the type selector event', () => {
        const sources = typeMembers.filter(({ member }) => member.name === 'on');

        expect(sources.map(({ type }) => type.name)).toEqual(['Element', 'Document', 'Window']);

        for (const { type, member } of sources) {
            expect(member).toMatchObject({ kind: 'function', invokedBy: 'host', result: '@selected', parameters: [{ name: 'type', fixed: true, selects: 'type', selector: 'event' }] });
            expect(DispatchTable.get(member)).toEqual({ requestKind: 'subscription', executionMode: null, implementation: undefined, type: type.name });
        }

        expect(module.typeSelectors).toEqual([{ name: 'event' }]);
        expect(module.mappings.every(mapping => mapping.selector === 'event')).toBe(true);
        expect(module.mappings.map(mapping => `${mapping.key}: ${mapping.type}`)).toEqual([
            'click: PointerEvent', 'pointerdown: PointerEvent', 'pointerup: PointerEvent', 'keydown: KeyboardEvent', 'keyup: KeyboardEvent', 'drop: DragEvent',
            'focus: DomEvent', 'blur: DomEvent', 'input: DomEvent', 'scroll: DomEvent', 'resize: DomEvent',
        ]);
    });

    it('refuses a key a module declares for the type selector event that the DOM vocabulary maps already', () => {
        expect(refusalOf(() => nexo.createRegistry([module, nexo.createModule('Twice', { mappings: [{ selector: 'event', key: 'click', type: 'Domql.DomEvent' }] })]))).toMatchObject({
            code: 'NEXO4038',
            message: expect.stringContaining("The type selector 'event' maps the key 'click' already, as the module 'Domql' declared it"),
            module: 'Twice',
            declarationKey: 'key',
        });
    });

    describe('observations', () => {
        const covered = declaration => ['observable', 'partly-observable'].includes(declaration.updates.changes);

        it('are named by every member whose changes they cover, and by no other', () => {
            for (const declaration of evaluated) {
                expect(declaration.updates.observations.length > 0, declaration.name).toBe(covered(declaration));
            }
        });

        it('are of types the module declares', () => {
            const types = new Set(module.observationTypes.map(type => type.name));
            const named = evaluated.flatMap(declaration => declaration.updates.observations.map(observation => observation.type));

            expect(named.every(type => types.has(type))).toBe(true);
            expect([...new Set(named)].sort()).toEqual([...types].sort());
        });

        it('observe the window, the document, and the receiver\'s root, roots and children, the targets the module declares', () => {
            const named = evaluated.flatMap(declaration => declaration.updates.observations.map(observation => observation.of)).filter(of => typeof of === 'string' && of !== 'receiver');

            expect(module.observationTargets).toEqual([{ name: 'window' }, { name: 'document' }, { name: 'root', from: 'receiver' }, { name: 'roots', from: 'receiver', count: 'many' }, { name: 'children', from: 'receiver', count: 'many' }]);
            expect([...new Set(named)].sort()).toEqual(module.observationTargets.map(target => target.name).sort());
        });

        it('are maintained only for the member that reads maintained values', () => {
            const maintained = evaluated.filter(declaration => declaration.updates.observations.some(observation => registry.getObservationType(observation.type).contract === 'maintained'));

            expect(maintained.map(declaration => declaration.name)).toEqual(['intersects']);
            expect(maintained.every(declaration => declaration.updates.reads === 'maintained')).toBe(true);
        });
    });
});
