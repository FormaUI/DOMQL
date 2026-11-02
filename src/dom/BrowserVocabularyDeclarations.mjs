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
// What a selector reads within the receiver's tree: its structure, the attributes the selector tests, and focus and popovers where it tests them.
const SELECTOR = { type: 'selector', of: 'root', selector: { argument: 'selector' } };
// The padding box changes where its border box or its content box does, which the client box observes both of.
const CLIENT_RESIZE = { type: 'resize', of: 'receiver', box: 'client' };
// An element's scroll: its own scroll events, its scrollport, and its extent, which its children's boxes decide.
const ELEMENT_SCROLL = [{ type: 'event', of: 'receiver', types: ['scroll'] }, CLIENT_RESIZE, { type: 'resize', of: 'children' }];
// The style along the flat-tree ancestry: the attributes and structure of every tree it passes through.
const ANCESTRY_STYLE = { type: 'mutation', of: 'roots', attributes: true, childList: true, subtree: true };
// The user's input in a tree: input and change events, and a form's reset, captured at the root, since reset does not bubble.
const USER_INPUT = { type: 'event', of: 'root', types: ['input', 'change', 'reset'], capture: true };
// What a media element reports of its playback.
const MEDIA_EVENTS = { type: 'event', of: 'receiver', types: ['play', 'pause', 'playing', 'ended', 'volumechange', 'timeupdate', 'durationchange', 'seeking', 'seeked', 'emptied', 'loadedmetadata'] };
// The document's selection changing, which the browser reports for every selection the user or the page's code makes, a text control's included, which bubbles from the control.
const SELECTION_CHANGE = { type: 'event', of: 'document', types: ['selectionchange'] };
// A selection within an element: its own selection events, the document's, and its subtree, whose nodes removed take a selection with them without a selectionchange.
const TEXT_SELECTION = [
    { type: 'event', of: 'receiver', types: ['select', 'input'] },
    SELECTION_CHANGE,
    { type: 'mutation', of: 'receiver', attributes: ['type'], childList: true, characterData: true, subtree: true },
];
// A range of the document: the selection changing, and the document's structure and text, which move a range's boundaries.
const RANGE_CHANGES = [SELECTION_CHANGE, { type: 'mutation', of: 'document', childList: true, characterData: true, subtree: true }];
const RANGE_MISSES = 'the page\'s code moving a range other than the selection\'s, and a change inside a shadow tree';

const SELECTOR_PARAMETERS = [valueParameter('selector', 'String')];

/** How a scroll moves: as the box's `scroll-behavior` decides, where it is omitted, at once, or smoothly. */
const SCROLL_BEHAVIOR = valueParameter('behavior', 'String', { default: 'auto' });

/** Where a scroll goes, or how far, along each logical axis of the box, an axis left as it is where it is omitted or null. */
const SCROLL_PARAMETERS = [
    valueParameter('inline', 'Number?', { default: null, nulls: 'accept', omitted: 'the axis left as it is' }),
    valueParameter('block', 'Number?', { default: null, nulls: 'accept', omitted: 'the axis left as it is' }),
    SCROLL_BEHAVIOR,
];

/** The modifier keys an event of a pointer, a touch, the wheel, a drag or the keyboard carries, each whether it was held as the event was dispatched. */
const MODIFIERS = { ctrlKey: 'Boolean', metaKey: 'Boolean', altKey: 'Boolean', shiftKey: 'Boolean' };

/** What every event carries: when it was dispatched, whether a listener before the subscription's cancelled it, and the elements it passes through. */
const EVENT = { timeStamp: 'Number', defaultPrevented: 'Boolean', composedPath: 'List<Element>' };

/** The tolerance of a measurement of layout in CSS pixels: a twentieth of a pixel, more than a unit of the browser's layout and less than a device pixel. */
const LAYOUT_TOLERANCE = 0.05;

/** The updates of a declaration, observable unless they say otherwise and read fresh, with the observations that cover its changes. */
const updatesOf = ({ changes = 'observable', reads = 'fresh', ...rest } = {}) => ({ changes, reads, ...rest });

const MATCHING = { changes: 'partly-observable', misses: 'pointer state such as :hover, control state such as :checked, state no attribute holds, as :target, and a shadow host\'s state that :host() tests' };
const GEOMETRY = { changes: 'partly-observable', misses: 'a move its own size, the scrolling of its scroll containers, the window\'s size and the structure of its trees do not cause, as a sibling before it growing or a margin or padding around it changing, and transforms and animations' };
const STYLE = { changes: 'partly-observable', misses: 'rules matching from elsewhere' };
// Whether a box is rendered, which its own size and the attributes and structure along its flat-tree ancestry decide, and a stylesheet beside them.
const RENDERING = [ANCESTRY_STYLE, RESIZE];
const RENDERING_MISSES = 'a stylesheet\'s rules hiding or showing it where its box keeps its size, as a box of no size, and content-visibility skipping it';
const MEASURED = { tolerance: LAYOUT_TOLERANCE };
// An element's place among its siblings, which the structure of its tree decides, as its parent does.
const SIBLINGS = { changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] };

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

/** Whether the value is a range of a document: a live range, which a static range is not, since it lacks `intersectsNode`. */
const isRange = value => value !== null && typeof value === 'object' && typeof value.intersectsNode === 'function' && typeof value.getBoundingClientRect === 'function' && nodeKindOf(value.commonAncestorContainer?.ownerDocument ?? value.commonAncestorContainer) === 'Document';

/** Whether the value is a window: its own `window`, holding a document, which data that reaches itself never holds. */
const isWindow = value => value !== null && typeof value === 'object' && value.window === value && nodeKindOf(value.document) === 'Document';

/** A reference type, its membership the test given, holding the members given. */
const referenceType = (name, isInstance, members, rest = {}) => ({ name, kind: 'reference', ...rest, isInstance, members });

/** A structured type, its data shape the properties given by name and type. */
const structuredType = (name, properties) => ({ name, kind: 'structured', members: Object.entries(properties).map(([propertyName, result]) => property(propertyName, result)) });

/** An event type, a structured type holding the members given and those every event carries. */
const eventType = (name, properties) => structuredType(name, { ...properties, ...EVENT });

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

        // A built-in execution, a host call DOMQL carries out once, answering its result, or keeps running, as its mode says.
        const execution = (key, name, result, { mode = 'once', ...options } = {}) => implementing(key, { ...func(name, result, { invokedBy: 'host', ...options }), requestKind: 'execution', executionMode: mode });

        // The event source, a host call its subscription listens to, delivering each event of the type its fixed argument selects, in the capture phase where its option says so: one declaration, standing in each type it listens on.
        const on = implementing('on', {
            ...func('on', '@selected', {
                invokedBy: 'host',
                parameters: [
                    valueParameter('type', 'String', { fixed: true, selects: 'type', selector: 'event' }),
                    valueParameter('options', 'Listening?', { default: null, nulls: 'accept', omitted: 'at the target and as it bubbles' }),
                ],
            }),
            requestKind: 'subscription',
        });

        return DispatchTable.createModule(BrowserVocabularyDeclarations.moduleName, {
            // A bound value's type: the kind of node it is, or the window. A text or a comment node is none, and is refused as a binding.
            typeOf: value => nodeKindOf(value) ?? (isWindow(value) ? 'Window' : isRange(value) ? 'Range' : null),

            types: [
                referenceType('Node', value => nodeKindOf(value) !== null, [
                    implementing('children', property('children', 'List<Element>', { updates: updatesOf({ observations: [CHILDREN] }) })),
                    implementing('parent', property('parent', 'Node?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] }) })),
                    implementing('root', property('root', 'Node', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                    implementing('host', property('host', 'Element?', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('firstMatching', func('first', 'Element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [SELECTOR] }) })),
                    implementing('all', func('all', 'List<Element>', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [SELECTOR] }) })),
                    implementing('contains', func('contains', 'Boolean', { parameters: [valueParameter('other', 'Node')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', childList: true, subtree: true }] }) })),
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
                            observations: [USER_INPUT, { type: 'mutation', of: 'root', attributes: ['checked', 'selected'], childList: true, subtree: true }],
                        }),
                    }),
                    test('indeterminate', 'indeterminate', {
                        updates: updatesOf({
                            changes: 'partly-observable',
                            misses: 'the page\'s code setting indeterminate or checked, which fires no event',
                            observations: [USER_INPUT, { type: 'mutation', of: 'root', attributes: ['checked', 'name', 'type', 'value'], childList: true, subtree: true }],
                        }),
                    }),
                    test('autofilled', 'autofilled', { updates: updatesOf({ changes: 'partly-observable', misses: 'the browser filling a field on its own, as a password manager does as the page loads, which fires no event', observations: [USER_INPUT] }) }),

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
                    implementing('selection', property('selection', 'Selection?', { updates: updatesOf({ observations: TEXT_SELECTION }) })),
                    implementing('shadow', property('shadow', 'Shadow', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('aria', property('aria', 'Aria', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('localName', property('localName', 'String', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('classes', property('classes', 'List<String>', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['class'] }] }) })),
                    implementing('text', property('text', 'String', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', childList: true, characterData: true, subtree: true }] }) })),
                    implementing('html', property('html', 'String', { updates: updatesOf({ changes: 'partly-observable', misses: 'a change inside the content of a template it holds', observations: [{ type: 'mutation', of: 'receiver', attributes: true, childList: true, characterData: true, subtree: true }] }) })),
                    implementing('files', property('files', 'List<File>?', { updates: updatesOf({ changes: 'partly-observable', misses: 'the page\'s code assigning its files, which fires no event', observations: [USER_INPUT, { type: 'mutation', of: 'receiver', attributes: ['type'] }] }) })),
                    implementing('sizeLimits', property('sizeLimits', 'SizeLimits?', { updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                    implementing('value', property('value', 'String?', {
                        updates: updatesOf({
                            changes: 'partly-observable',
                            misses: 'the page\'s code setting its value, or a select\'s selectedIndex, which fires no event',
                            observations: [USER_INPUT, { type: 'mutation', of: 'receiver', attributes: ['value', 'selected', 'type'], childList: true, characterData: true, subtree: true }],
                        }),
                    })),
                    implementing('playback', property('playback', 'Playback?', { updates: updatesOf({ changes: 'partly-observable', misses: 'its current time advancing between two timeupdate events', observations: [MEDIA_EVENTS] }) })),
                    implementing('direction', property('direction', 'String', { updates: updatesOf({ changes: 'partly-observable', misses: 'the text that decides an ancestor\'s dir="auto", or its own', observations: [{ type: 'mutation', of: 'roots', attributes: ['dir'], childList: true, subtree: true }] }) })),
                    implementing('attached', property('attached', 'Boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into a shadow root in the document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                    implementing('hasChildren', property('hasChildren', 'Boolean', { updates: updatesOf({ observations: [CHILDREN] }) })),
                    implementing('hasSelection', property('hasSelection', 'Boolean', { updates: updatesOf({ observations: TEXT_SELECTION }) })),
                    implementing('previousSibling', property('previousSibling', 'Element?', { updates: updatesOf(SIBLINGS) })),
                    implementing('nextSibling', property('nextSibling', 'Element?', { updates: updatesOf(SIBLINGS) })),
                    implementing('index', property('index', 'Number?', { updates: updatesOf(SIBLINGS) })),
                    implementing('hasPointerCapture', func('hasPointerCapture', 'Boolean', {
                        parameters: [valueParameter('pointerId', 'Number')],
                        updates: updatesOf({ observations: [{ type: 'event', of: 'receiver', types: ['gotpointercapture', 'lostpointercapture'] }, { type: 'event', of: 'document', types: ['lostpointercapture'] }] }),
                    })),

                    // An attribute, read by the named indexer and by the element's unnamed one alike.
                    ...[null, 'attribute'].map(name => implementing('attribute', indexer(name, 'String?', { parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }] }] }) }))),
                    implementing('class', indexer('class', 'Boolean', { parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['class'] }] }) })),
                    implementing('style', indexer('style', 'String?', { parameters: [valueParameter('property', 'String')], updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                    implementing('inlineStyle', indexer('inlineStyle', 'String?', { parameters: [valueParameter('property', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['style'] }] }) })),
                    implementing('intersects', func('intersects', 'Boolean?', {
                        arguments: 'options',
                        parameters: [valueParameter('root', 'Element?', { default: null, nulls: 'accept', omitted: 'the window' }), valueParameter('margin', 'Number', { default: 0 })],
                        updates: updatesOf({ reads: 'maintained', observations: [{ type: 'intersection', of: 'receiver', root: { argument: 'root' }, margin: { argument: 'margin' } }] }),
                    })),
                    implementing('overlaps', func('overlaps', 'Boolean?', { arguments: 'options', parameters: [valueParameter('other', 'Element'), valueParameter('margin', 'Number', { default: 0 })], updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, { type: 'resize', of: { argument: 'other' } }, SCROLLING, WINDOW_RESIZE] }) })),
                    implementing('matches', func('matches', 'Boolean', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [SELECTOR] }) })),
                    implementing('rect', func('rectRelativeTo', 'Rectangle?', { parameters: [valueParameter('relativeTo', 'Element')], updates: updatesOf({ ...GEOMETRY, ...MEASURED, observations: [RESIZE, { type: 'resize', of: { argument: 'relativeTo' } }, SCROLLING, WINDOW_RESIZE] }) })),
                    implementing('closest', func('closest', 'Element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [SELECTOR] }) })),
                    implementing('scrollContainer', func('scrollContainer', 'Element?', {
                        arguments: 'options',
                        parameters: [valueParameter('axis', 'String?', { default: null, nulls: 'accept', omitted: 'either axis' })],
                        updates: updatesOf({ changes: 'partly-observable', misses: 'a stylesheet changing which rules apply', observations: [ANCESTRY_STYLE] }),
                    })),
                    on,

                    // The changes DOMQL makes to an element, each one platform call answering what it did.
                    execution('takeFocus', 'takeFocus', 'Boolean', { arguments: 'options', parameters: [valueParameter('preventScroll', 'Boolean', { default: false })] }),
                    execution('scrollTo', 'scrollTo', 'Boolean', { arguments: 'options', parameters: SCROLL_PARAMETERS }),
                    execution('scrollBy', 'scrollBy', 'Boolean', { arguments: 'options', parameters: SCROLL_PARAMETERS }),
                    execution('scrollIntoView', 'scrollIntoView', 'Boolean', { arguments: 'options', parameters: [valueParameter('block', 'String', { default: 'start' }), valueParameter('inline', 'String', { default: 'nearest' }), SCROLL_BEHAVIOR] }),
                    execution('showPopover', 'showPopover', 'Boolean'),
                    execution('hidePopover', 'hidePopover', 'Boolean'),
                    execution('showModal', 'showModal', 'Boolean'),
                    execution('closeDialog', 'close', 'Boolean', { arguments: 'options', parameters: [valueParameter('returnValue', 'String?', { default: null, nulls: 'accept', omitted: 'the dialog\'s return value left as it is' })] }),
                ], { supertype: 'Node' }),

                referenceType('Document', value => nodeKindOf(value) === 'Document', [
                    // The document's own state, each a Boolean function as the browser decides it.
                    test('visible', 'visible', { updates: updatesOf({ observations: [{ type: 'visibility', of: 'receiver' }] }) }),
                    test('hasFocus', 'focus', { updates: updatesOf({ observations: [{ type: 'event', of: 'window', types: ['focus', 'blur'] }] }) }),
                    implementing('activeElement', property('activeElement', 'Element?', { updates: updatesOf({ observations: [FOCUS] }) })),
                    implementing('documentSelection', property('selection', 'DocumentSelection?', {
                        updates: updatesOf({
                            changes: 'partly-observable',
                            misses: 'the nodes holding the selection removed from a shadow tree, which collapses it without a selectionchange',
                            observations: [SELECTION_CHANGE, { type: 'mutation', of: 'receiver', childList: true, subtree: true }],
                        }),
                    })),
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
                    implementing('location', property('location', 'Location', { updates: updatesOf({ changes: 'partly-observable', misses: 'in a browser without the Navigation API, a change the history API makes, which fires no event', observations: [{ type: 'navigation', of: 'window' }] }) })),
                    implementing('shortcutModifier', property('shortcutModifier', 'String', { updates: updatesOf({ changes: 'constant' }) })),
                    implementing('media', indexer('media', 'Boolean', { parameters: [valueParameter('query', 'String')], updates: updatesOf({ observations: [{ type: 'media', of: 'window', query: { argument: 'query' } }] }) })),

                    // The capabilities the window's browser offers, each the presence of the API it names, which says nothing of whether a particular use of it succeeds.
                    test('supportsShare', 'share', { updates: updatesOf({ changes: 'constant' }) }),
                    test('supportsClipboard', 'clipboard', { updates: updatesOf({ changes: 'constant' }) }),
                    on,

                    // The changes DOMQL makes to the window, each one platform call answering what it did.
                    execution('windowScrollTo', 'scrollTo', 'Boolean', { arguments: 'options', parameters: SCROLL_PARAMETERS }),
                    execution('windowScrollBy', 'scrollBy', 'Boolean', { arguments: 'options', parameters: SCROLL_PARAMETERS }),
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

                // A range of a document, as the document's selection holds one, read as it stands at each read.
                referenceType('Range', isRange, [
                    implementing('rangeRect', property('rect', 'Rectangle?', { updates: updatesOf({ ...GEOMETRY, ...MEASURED, observations: [...RANGE_CHANGES, WINDOW_RESIZE, { type: 'event', of: 'document', types: ['scroll'], capture: true }] }) })),
                    implementing('rangeCollapsed', property('collapsed', 'Boolean', { updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                    implementing('rangeText', property('text', 'String', { updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                    implementing('startElement', property('startElement', 'Element?', { updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                    implementing('endElement', property('endElement', 'Element?', { updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                    implementing('commonAncestor', property('commonAncestor', 'Element?', { updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                    implementing('rangeIntersects', func('intersects', 'Boolean', { parameters: [valueParameter('node', 'Node')], updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                    implementing('rangeAll', func('all', 'List<Element>', {
                        parameters: SELECTOR_PARAMETERS,
                        updates: updatesOf({ changes: 'partly-observable', misses: `${RANGE_MISSES}, ${MATCHING.misses}`, observations: [...RANGE_CHANGES, { ...SELECTOR, of: 'document' }] }),
                    })),
                    implementing('offsetsIn', func('offsetsIn', 'Selection?', { parameters: [valueParameter('element', 'Element')], updates: updatesOf({ changes: 'partly-observable', misses: RANGE_MISSES, observations: RANGE_CHANGES }) })),
                ]),

                structuredType('Size', { width: 'Number', height: 'Number' }),
                structuredType('Rectangle', { left: 'Number', top: 'Number', right: 'Number', bottom: 'Number', width: 'Number', height: 'Number' }),
                structuredType('Selection', { start: 'Number', end: 'Number' }),
                // The document's selection as it stands: its type, whether it is collapsed, its ranges, the elements its anchor and its focus are in, and its first range.
                structuredType('DocumentSelection', { type: 'String', collapsed: 'Boolean', rangeCount: 'Number', anchorElement: 'Element?', focusElement: 'Element?', range: 'Range?' }),
                structuredType('Grid', { columns: 'List<Number>' }),
                // How far a box is scrolled along each of its logical axes, and along one of them.
                structuredType('Scroll', { inline: 'ScrollAxis', block: 'ScrollAxis' }),
                structuredType('ScrollAxis', { offset: 'Number', extent: 'Number', viewport: 'Number' }),
                // A media element's playback; its duration unknown until its metadata loads, and without an end for a stream.
                structuredType('Playback', { paused: 'Boolean', muted: 'Boolean', ended: 'Boolean', currentTime: 'Number', duration: 'Number?', volume: 'Number' }),
                // The parts of the window's URL a page navigates by.
                structuredType('Location', { href: 'String', pathname: 'String', search: 'String', hash: 'String' }),
                // The limits a box's size is kept within, each null where it is no length in pixels.
                structuredType('SizeLimits', { minWidth: 'Number?', minHeight: 'Number?', maxWidth: 'Number?', maxHeight: 'Number?' }),
                // A file a user chose, without its content.
                structuredType('File', { name: 'String', bytes: 'Number', type: 'String', lastModified: 'Number' }),
                // How an event source listens: in the capture phase, or at the target and as the event bubbles.
                structuredType('Listening', { capture: 'Boolean' }),
                // An event such as scroll or resize can target the document or the window, which is no element.
                eventType('DomEvent', { target: 'Element?' }),
                // Focus leaving one element for another, each null where it is no element of this window.
                eventType('FocusEvent', { target: 'Element?', relatedTarget: 'Element?' }),
                // An edit, its kind empty and composing false for an input event that says neither, as one at a select or a checkbox.
                eventType('InputEvent', { target: 'Element?', inputType: 'String', data: 'String?', isComposing: 'Boolean' }),
                eventType('ClipboardEvent', { target: 'Element', types: 'List<String>' }),
                eventType('CompositionEvent', { target: 'Element', data: 'String' }),
                eventType('ToggleEvent', { target: 'Element', oldState: 'String', newState: 'String' }),
                eventType('AnimationEvent', { target: 'Element', animationName: 'String' }),
                // A click the keyboard caused, a dblclick, which is a mouse event, and a click a browser dispatches as one carry no pointer, so no pointer id or type.
                eventType('PointerEvent', { target: 'Element', button: 'Number', buttons: 'Number', clientX: 'Number', clientY: 'Number', pointerType: 'String?', pointerId: 'Number?', detail: 'Number', ...MODIFIERS }),
                // A touch event, and each point touching the surface as it is dispatched.
                eventType('TouchEvent', { target: 'Element', touches: 'List<Touch>', ...MODIFIERS }),
                structuredType('Touch', { identifier: 'Number', clientX: 'Number', clientY: 'Number' }),
                eventType('WheelEvent', { target: 'Element', deltaX: 'Number', deltaY: 'Number', deltaMode: 'Number', ...MODIFIERS }),
                // A key, whether it repeats as it is held, whether it is part of a composition, and the keys held with it, AltGr among them.
                eventType('KeyboardEvent', { target: 'Element', key: 'String', code: 'String', repeat: 'Boolean', isComposing: 'Boolean', ...MODIFIERS, altGraphKey: 'Boolean' }),
                // A drag's formats, as its data transfer lists them, the data itself held back by the browser until the drop.
                eventType('DragEvent', { target: 'Element', clientX: 'Number', clientY: 'Number', types: 'List<String>', ...MODIFIERS }),
            ],

            // The event types `on` listens to, each a key of the type selector `event` mapping to the type its events are captured as.
            typeSelectors: [{ name: 'event' }],
            mappings: [
                ...['click', 'dblclick', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'lostpointercapture'].map(key => ({ selector: 'event', key, type: 'PointerEvent' })),
                ...['touchstart', 'touchmove'].map(key => ({ selector: 'event', key, type: 'TouchEvent' })),
                { selector: 'event', key: 'wheel', type: 'WheelEvent' },
                { selector: 'event', key: 'keydown', type: 'KeyboardEvent' },
                { selector: 'event', key: 'keyup', type: 'KeyboardEvent' },
                ...['dragstart', 'dragenter', 'dragover', 'dragleave', 'dragend', 'drop'].map(key => ({ selector: 'event', key, type: 'DragEvent' })),
                ...['focus', 'blur', 'focusin', 'focusout'].map(key => ({ selector: 'event', key, type: 'FocusEvent' })),
                ...['beforeinput', 'input'].map(key => ({ selector: 'event', key, type: 'InputEvent' })),
                ...['paste', 'copy', 'cut'].map(key => ({ selector: 'event', key, type: 'ClipboardEvent' })),
                ...['compositionstart', 'compositionend'].map(key => ({ selector: 'event', key, type: 'CompositionEvent' })),
                ...['beforetoggle', 'toggle'].map(key => ({ selector: 'event', key, type: 'ToggleEvent' })),
                ...['animationstart', 'animationend', 'animationcancel'].map(key => ({ selector: 'event', key, type: 'AnimationEvent' })),
                ...['scroll', 'resize', 'selectionchange', 'close', 'cancel', 'load', 'error', 'play', 'pause', 'volumechange', 'ended'].map(key => ({ selector: 'event', key, type: 'DomEvent' })),
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
                observationType('navigation', 'invalidation', 'observeNavigation'),
                observationType('selector', 'invalidation', 'observeSelector', { identity: ['selector'] }),
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
