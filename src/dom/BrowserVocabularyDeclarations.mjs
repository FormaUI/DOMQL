/**
 * BrowserVocabularyDeclarations — the declarations of DOMQL's vocabulary, the DOM's: its nodes, elements, shadow trees, ARIA views and window, their members, Boolean functions among them, events and observations, and the document and the window a query reads, as the specification's tables state them
 */

import { nexo } from '@formaui-net/nexo';
import { DispatchTable } from './DispatchTable.mjs';

const { createValueParameterDeclaration: valueParameter, createPropertyDeclaration: property, createFunctionDeclaration: func, createIndexerDeclaration: indexer } = nexo.declarations;

/** The observations the members share. */
const RESIZE = { type: 'resize', of: 'receiver' };
const WINDOW_RESIZE = { type: 'resize', of: 'window' };
const SCROLLING = { type: 'event', of: 'roots', types: ['scroll'], capture: true };
const FOCUS = { type: 'event', of: 'document', types: ['focusin', 'focusout'] };
// A popover opening or closing changes no attribute; its toggle event, which does not bubble, is heard as it is captured at the root.
const POPOVERS = { type: 'event', of: 'root', types: ['toggle'], capture: true };
const ATTRIBUTES = { type: 'mutation', of: 'receiver', attributes: true };
const CHILDREN = { type: 'mutation', of: 'receiver', childList: true };
const STRUCTURE = { type: 'mutation', of: 'root', attributes: true, childList: true, subtree: true };
// The padding box changes where its border box or its content box does, which the client box observes both of.
const CLIENT_RESIZE = { type: 'resize', of: 'receiver', box: 'client' };
// An element's scroll: its own scroll events, its scrollport, and its extent, which its children's boxes decide.
const ELEMENT_SCROLL = [{ type: 'event', of: 'receiver', types: ['scroll'] }, CLIENT_RESIZE, { type: 'resize', of: 'children' }];
// The style along the flat-tree ancestry: the attributes and structure of every tree it passes through.
const ANCESTRY_STYLE = { type: 'mutation', of: 'roots', attributes: true, childList: true, subtree: true };
const TEXT_SELECTION = [
    { type: 'event', of: 'receiver', types: ['select', 'input'] },
    { type: 'event', of: 'document', types: ['selectionchange'] },
];

const SELECTOR_PARAMETERS = [valueParameter('selector', 'String')];

/** The tolerance of a measurement of layout in CSS pixels: a twentieth of a pixel, more than a unit of the browser's layout and less than a device pixel. */
const LAYOUT_TOLERANCE = 0.05;

/** The updates of a declaration, observable unless they say otherwise and read fresh, with the observations that cover its changes. */
const updatesOf = ({ changes = 'observable', reads = 'fresh', ...rest } = {}) => ({ changes, reads, ...rest });

const MATCHING = { changes: 'partly-observable', misses: 'pointer state such as :hover and control state such as :checked' };
const GEOMETRY = { changes: 'partly-observable', misses: 'a move its own size, the scrolling of its scroll containers, the window\'s size and the structure of its trees do not cause, as a sibling before it growing or a margin or padding around it changing, and transforms and animations' };
const STYLE = { changes: 'partly-observable', misses: 'rules matching from elsewhere' };
// Whether a box is rendered, which its own size and the attributes and structure along its flat-tree ancestry decide, and a stylesheet beside them.
const RENDERING = [ANCESTRY_STYLE, RESIZE];
const RENDERING_MISSES = 'a stylesheet\'s rules hiding or showing it where its box keeps its size, as a box of no size, and content-visibility skipping it';
const MEASURED = { tolerance: LAYOUT_TOLERANCE };

/**
 * The kind of node a value is, by the type its `nodeType` names, or null where it is no element, document or fragment. A node holds functions, which data never does, so data that names a `nodeType` is never taken for one;
 * a node of another window is one as well, since nothing here reads a global.
 */
const nodeKindOf = value => {
    if (typeof value?.getRootNode !== 'function') {
        return null;
    }

    switch (value.nodeType) {
        case 1:
            return 'Element';
        case 9:
            return 'Document';
        case 11:
            return value.host === undefined ? 'DocumentFragment' : 'ShadowRoot';
        default:
            return null;
    }
};

/** Whether the value is a window: its own `window`, holding a document, which data that reaches itself never holds. */
const isWindow = value => value !== null && typeof value === 'object' && value.window === value && nodeKindOf(value.document) === 'Document';

/** A reference type, its membership the test given, holding the members given. */
const referenceType = (name, isInstance, members, rest = {}) => ({ name, kind: 'reference', ...rest, isInstance, members });

/** A structured type, its data shape the properties given by name and type. */
const structuredType = (name, properties) => ({ name, kind: 'structured', members: Object.entries(properties).map(([propertyName, result]) => property(propertyName, result)) });

export class BrowserVocabularyDeclarations {
    /** The name of DOMQL's module, which every query imports. */
    static moduleName = 'Domql';

    /**
     * DOMQL's module, made as every module DOMQL carries out is, through its dispatch table: its declarations, each carrying the implementation given for it where one is.
     * @param {Record<string, Function>} [implementations] The implementations, by the key each declaration is carried out under.
     */
    static createModule(implementations = {}) {
        // A declaration takes the implementation given under its key, and none where none is given, which leaves it resolved against and never invoked.
        const implementing = (key, declaration) => (implementations[key] === undefined ? declaration : { ...declaration, impl: implementations[key] });
        const observationType = (name, contract, key, rest = {}) => implementing(key, { name, contract, ...rest });
        const test = (key, name, { updates }) => implementing(key, func(name, 'Boolean', { updates }));

        // The event source, a host call its subscription listens to, delivering each event of the type its fixed argument selects: one declaration, standing in each type it listens on.
        const on = implementing('on', { ...func('on', '@selected', { invokedBy: 'host', parameters: [valueParameter('type', 'String', { fixed: true, selects: 'type', selector: 'event' })] }), requestKind: 'subscription' });

        return DispatchTable.createModule(BrowserVocabularyDeclarations.moduleName, {
            // A bound value's type: the kind of node it is, or the window. A text or a comment node is none, and is refused as a binding.
            typeOf: value => nodeKindOf(value) ?? (isWindow(value) ? 'Window' : null),

            types: [
                referenceType('Node', value => nodeKindOf(value) !== null, [
                    implementing('children', property('children', 'List<Element>', { updates: updatesOf({ observations: [CHILDREN] }) })),
                    implementing('parent', property('parent', 'Node?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] }) })),
                    implementing('root', property('root', 'Node', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                    implementing('host', property('host', 'Element?', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('firstMatching', func('first', 'Element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                    implementing('all', func('all', 'List<Element>', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                ], { abstract: true }),

                referenceType('Element', value => nodeKindOf(value) === 'Element', [
                    // The tests of elements, each a Boolean function as the browser decides it, its native semantics: a pseudo-class's matching.
                    test('disabled', 'disabled', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'root', attributes: ['disabled'], childList: true, subtree: true }] }) }),
                    test('readOnly', 'readonly', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['readonly', 'type'] }] }) }),
                    test('textEditable', 'textEditable', { updates: updatesOf({ changes: 'partly-observable', misses: 'the document\'s design mode', observations: [{ type: 'mutation', of: 'roots', attributes: ['disabled', 'readonly', 'type', 'contenteditable', 'inert'], childList: true, subtree: true }] }) }),
                    test('focused', 'focus', { updates: updatesOf({ observations: [FOCUS] }) }),
                    test('focusWithin', 'focusWithin', { updates: updatesOf({ observations: [FOCUS] }) }),
                    test('displayed', 'displayed', { updates: updatesOf({ changes: 'partly-observable', misses: RENDERING_MISSES, observations: RENDERING }) }),
                    test('focusable', 'focusable', { updates: updatesOf({ changes: 'partly-observable', misses: `${RENDERING_MISSES}, a visibility a stylesheet's rules change, the inertness a modal dialog gives the rest of the document, and the document's design mode`, observations: RENDERING }) }),
                    test('hover', 'hover', { updates: updatesOf({ changes: 'partly-observable', misses: 'an element moving under a pointer that does not move, where the browser fires no pointer event for it', observations: [{ type: 'event', of: 'document', types: ['pointerover', 'pointerout'] }] }) }),
                    test('popoverOpen', 'popoverOpen', { updates: updatesOf({ observations: [POPOVERS] }) }),
                    test('checked', 'checked', {
                        updates: updatesOf({
                            changes: 'partly-observable',
                            misses: 'the page\'s code setting checked or selected, or a select\'s value or selectedIndex, which fires no event',
                            observations: [{ type: 'event', of: 'root', types: ['input', 'change', 'reset'], capture: true }, { type: 'mutation', of: 'root', attributes: ['checked', 'selected'], childList: true, subtree: true }],
                        }),
                    }),

                    implementing('rect', property('rect', 'Rectangle?', { updates: updatesOf({ ...GEOMETRY, ...MEASURED, observations: [RESIZE, SCROLLING, WINDOW_RESIZE] }) })),
                    implementing('clientRect', property('clientRect', 'Rectangle?', { updates: updatesOf({ ...GEOMETRY, ...MEASURED, observations: [CLIENT_RESIZE, SCROLLING, WINDOW_RESIZE] }) })),
                    implementing('size', property('size', 'Size?', { updates: updatesOf({ ...MEASURED, observations: [RESIZE] }) })),
                    implementing('clientSize', property('clientSize', 'Size?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a change that leaves its border box and its content box as they were, as its border and padding changing by the same amount', ...MEASURED, observations: [CLIENT_RESIZE] }) })),
                    implementing('scroll', property('scroll', 'Scroll?', {
                        updates: updatesOf({
                            changes: 'partly-observable',
                            misses: 'its extent changing where no child\'s border box does, as a descendant overflowing a child of a fixed size or a child\'s margin changing, and its writing mode changing',
                            ...MEASURED,
                            observations: ELEMENT_SCROLL,
                        }),
                    })),
                    implementing('grid', property('grid', 'Grid?', { updates: updatesOf({ ...STYLE, ...MEASURED, observations: [RESIZE, ATTRIBUTES] }) })),
                    implementing('selection', property('selection', 'Selection?', { updates: updatesOf({ changes: 'partly-observable', misses: 'selections the page\'s code sets', observations: TEXT_SELECTION }) })),
                    implementing('shadow', property('shadow', 'Shadow', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('aria', property('aria', 'Aria', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('direction', property('direction', 'String', { updates: updatesOf({ changes: 'partly-observable', misses: 'the text that decides an ancestor\'s dir="auto", or its own', observations: [{ type: 'mutation', of: 'roots', attributes: ['dir'], childList: true, subtree: true }] }) })),
                    implementing('attached', property('attached', 'Boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into a shadow root in the document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                    implementing('hasChildren', property('hasChildren', 'Boolean', { updates: updatesOf({ observations: [CHILDREN] }) })),
                    implementing('hasSelection', property('hasSelection', 'Boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'selections the page\'s code sets', observations: TEXT_SELECTION }) })),

                    // An attribute, read by the named indexer and by the element's unnamed one alike.
                    ...[null, 'attribute'].map(name => implementing('attribute', indexer(name, 'String?', { parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }] }] }) }))),
                    implementing('class', indexer('class', 'Boolean', { parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['class'] }] }) })),
                    implementing('style', indexer('style', 'String?', { parameters: [valueParameter('property', 'String')], updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                    implementing('intersects', func('intersects', 'Boolean?', {
                        arguments: 'options',
                        parameters: [valueParameter('root', 'Element?', { default: null, nulls: 'accept', omitted: 'the window' }), valueParameter('margin', 'Number', { default: 0 })],
                        updates: updatesOf({ reads: 'maintained', observations: [{ type: 'intersection', of: 'receiver', root: { argument: 'root' }, margin: { argument: 'margin' } }] }),
                    })),
                    implementing('overlaps', func('overlaps', 'Boolean?', { arguments: 'options', parameters: [valueParameter('other', 'Element'), valueParameter('margin', 'Number', { default: 0 })], updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, { type: 'resize', of: { argument: 'other' } }, SCROLLING, WINDOW_RESIZE] }) })),
                    implementing('matches', func('matches', 'Boolean', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                    implementing('rect', func('rectRelativeTo', 'Rectangle?', { parameters: [valueParameter('relativeTo', 'Element')], updates: updatesOf({ ...GEOMETRY, ...MEASURED, observations: [RESIZE, { type: 'resize', of: { argument: 'relativeTo' } }, SCROLLING, WINDOW_RESIZE] }) })),
                    implementing('closest', func('closest', 'Element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                    implementing('scrollContainer', func('scrollContainer', 'Element?', {
                        arguments: 'options',
                        parameters: [valueParameter('axis', 'String?', { default: null, nulls: 'accept', omitted: 'either axis' })],
                        updates: updatesOf({ changes: 'partly-observable', misses: 'a stylesheet changing which rules apply', observations: [ANCESTRY_STYLE] }),
                    })),
                    on,
                ], { supertype: 'Node' }),

                referenceType('Document', value => nodeKindOf(value) === 'Document', [
                    // The document's own state, each a Boolean function as the browser decides it.
                    test('visible', 'visible', { updates: updatesOf({ observations: [{ type: 'visibility', of: 'receiver' }] }) }),
                    test('hasFocus', 'focus', { updates: updatesOf({ observations: [{ type: 'event', of: 'window', types: ['focus', 'blur'] }] }) }),
                    implementing('activeElement', property('activeElement', 'Element?', { updates: updatesOf({ observations: [FOCUS] }) })),
                    on,
                ], { supertype: 'Node' }),

                referenceType('DocumentFragment', value => nodeKindOf(value) === 'DocumentFragment', [], { supertype: 'Node' }),
                referenceType('ShadowRoot', value => nodeKindOf(value) === 'ShadowRoot', [], { supertype: 'Node' }),

                referenceType('Window', isWindow, [
                    implementing('windowSize', property('size', 'Size', { updates: updatesOf({ ...MEASURED, observations: [WINDOW_RESIZE] }) })),
                    implementing('windowScroll', property('scroll', 'Scroll', {
                        updates: updatesOf({
                            changes: 'partly-observable',
                            misses: 'the document\'s extent changing where its root element\'s border box does not, as content positioned outside it, and its writing mode changing',
                            ...MEASURED,
                            observations: [{ type: 'event', of: 'window', types: ['scroll'] }, WINDOW_RESIZE, { type: 'resize', of: 'document' }],
                        }),
                    })),
                    implementing('devicePixelRatio', property('devicePixelRatio', 'Number', { updates: updatesOf({ observations: [{ type: 'pixelRatio', of: 'window' }] }) })),
                    implementing('media', indexer('media', 'Boolean', { parameters: [valueParameter('query', 'String')], updates: updatesOf({ observations: [{ type: 'media', of: 'window', query: { argument: 'query' } }] }) })),

                    // The capabilities the window's browser offers, each the presence of the API it names, which says nothing of whether a particular use of it succeeds.
                    test('supportsShare', 'share', { updates: updatesOf({ changes: 'constant' }) }),
                    test('supportsClipboard', 'clipboard', { updates: updatesOf({ changes: 'constant' }) }),
                    on,
                ]),

                // The views of an element, each the element itself, of the view's type, so each accepts every element.
                referenceType('Shadow', value => nodeKindOf(value) === 'Element', [
                    implementing('shadowRoot', property('root', 'ShadowRoot?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a shadow root attached at any time but as the element connects to its document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                    implementing('assignedElements', property('elements', 'List<Element>?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree holding the slot inserted into a shadow tree that assigns it nothing', observations: [{ type: 'event', of: 'receiver', types: ['slotchange'] }, { type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                ]),

                referenceType('Aria', value => nodeKindOf(value) === 'Element', [
                    // The ARIA tests of an element's ARIA view, each its own attribute's value read under its own contract, never its native state.
                    test('ariaChecked', 'checked', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-checked'] }] }) }),
                    test('ariaDisabled', 'disabled', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-disabled'] }] }) }),
                    ...[null, 'attribute'].map(name => implementing('ariaAttribute', indexer(name, 'String?', { parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name', prefix: 'aria-' }] }] }) }))),

                    // The view is the element itself, so the cast answers it as it is, and reads it as the element again.
                    { kind: 'operator', name: 'cast', result: 'Element' },
                ]),

                structuredType('Size', { width: 'Number', height: 'Number' }),
                structuredType('Rectangle', { left: 'Number', top: 'Number', right: 'Number', bottom: 'Number', width: 'Number', height: 'Number' }),
                structuredType('Selection', { start: 'Number', end: 'Number' }),
                structuredType('Grid', { columns: 'List<Number>' }),
                // How far a box is scrolled along each of its logical axes, and along one of them.
                structuredType('Scroll', { inline: 'ScrollAxis', block: 'ScrollAxis' }),
                structuredType('ScrollAxis', { offset: 'Number', extent: 'Number', viewport: 'Number' }),
                // An event such as scroll or resize can target the document or the window, which is no element.
                structuredType('DomEvent', { target: 'Element?' }),
                // A browser that dispatches a click as a mouse event gives it no pointer type.
                structuredType('PointerEvent', { target: 'Element', button: 'Number', buttons: 'Number', clientX: 'Number', clientY: 'Number', pointerType: 'String?' }),
                structuredType('KeyboardEvent', { target: 'Element', key: 'String', code: 'String' }),
                structuredType('DragEvent', { target: 'Element', clientX: 'Number', clientY: 'Number' }),
            ],

            // The event types `on` listens to, each a key of the type selector `event` mapping to the type its events are captured as.
            typeSelectors: [{ name: 'event' }],
            mappings: [
                { selector: 'event', key: 'click', type: 'PointerEvent' },
                { selector: 'event', key: 'pointerdown', type: 'PointerEvent' },
                { selector: 'event', key: 'pointerup', type: 'PointerEvent' },
                { selector: 'event', key: 'keydown', type: 'KeyboardEvent' },
                { selector: 'event', key: 'keyup', type: 'KeyboardEvent' },
                { selector: 'event', key: 'drop', type: 'DragEvent' },
                { selector: 'event', key: 'focus', type: 'DomEvent' },
                { selector: 'event', key: 'blur', type: 'DomEvent' },
                { selector: 'event', key: 'input', type: 'DomEvent' },
                { selector: 'event', key: 'scroll', type: 'DomEvent' },
                { selector: 'event', key: 'resize', type: 'DomEvent' },
            ],

            observationTypes: [
                observationType('resize', 'invalidation', 'observeResize', { identity: ['box'] }),
                observationType('mutation', 'invalidation', 'observeMutation', { identity: ['attributes', 'childList', 'subtree', 'characterData'] }),
                observationType('attachment', 'invalidation', 'observeAttachment'),
                observationType('intersection', 'maintained', 'observeIntersection', { identity: ['root', 'margin'] }),
                observationType('media', 'invalidation', 'observeMedia', { identity: ['query'] }),
                observationType('pixelRatio', 'invalidation', 'observePixelRatio'),
                observationType('event', 'invalidation', 'observeEvents', { identity: ['types', 'capture'] }),
                observationType('visibility', 'invalidation', 'observeVisibility'),
            ],

            // The targets the observations observe besides the receiver and an argument: the window and the document; the receiver's root, the root of the tree it is in, and its roots, every root of its flat-tree ancestry through slots and shadow hosts;
            // and its children, each child element it holds.
            observationTargets: [{ name: 'window' }, { name: 'document' }, { name: 'root', from: 'receiver' }, { name: 'roots', from: 'receiver', count: 'many' }, { name: 'children', from: 'receiver', count: 'many' }],

            members: [
                // The document the query runs against and its window, read through DOMQL's namespace from the environment its evaluator is given.
                implementing('document', property('document', 'Document', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('window', property('window', 'Window', { updates: updatesOf({ changes: 'constant' }) })),
            ],
        });
    }

    /** DOMQL's module as its declarations alone, which is enough to resolve a query and carries nothing out. */
    static get module() {
        return BrowserVocabularyDeclarations.createModule();
    }
}
