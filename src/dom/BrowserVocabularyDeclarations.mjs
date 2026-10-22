/**
 * BrowserVocabularyDeclarations — the declarations of DOMQL's vocabulary, the DOM's: its nodes, elements, shadow trees, ARIA views and window, their members, Boolean functions among them, events and observations, and the document and the window a query reads, as the specification's tables state them
 */

import { lexica } from '@formaui/lexica';
import { DispatchTable } from './DispatchTable.mjs';

const { valueParameter, property } = lexica.declarations;

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
const TEXT_SELECTION = [
    { type: 'event', of: 'receiver', types: ['select', 'input'] },
    { type: 'event', of: 'document', types: ['selectionchange'] },
];

const SELECTOR_PARAMETERS = [valueParameter('selector', 'String')];

/** The updates of a declaration, observable unless they say otherwise and read fresh, with the observations that cover its changes. */
const updatesOf = ({ changes = 'observable', reads = 'fresh', ...rest } = {}) => ({ changes, reads, ...rest });

const MATCHING = { changes: 'partly-observable', misses: 'pointer state such as :hover and control state such as :checked' };
const GEOMETRY = { changes: 'partly-observable', misses: 'a move its own size, the scrolling of its scroll containers, the window\'s size and the structure of its trees do not cause, as a sibling before it growing or a margin or padding around it changing, and transforms and animations' };
const STYLE = { changes: 'partly-observable', misses: 'rules matching from elsewhere' };

export class BrowserVocabularyDeclarations {
    /** The name of DOMQL's module. */
    static moduleName = 'domql';

    /**
     * DOMQL's module, made as every module DOMQL carries out is, through its dispatch table: its declarations, each carrying the implementation given for it where one is.
     * @param {Record<string, Function>} [implementations] The implementations, by the key each declaration is carried out under.
     */
    static createModule(implementations = {}) {
        // A declaration takes the implementation given under its key, and none where none is given, which leaves it resolved against and never invoked.
        const implementing = (key, declaration) => (implementations[key] === undefined ? declaration : { ...declaration, implementation: implementations[key] });
        const observationType = (name, contract, key, rest = {}) => implementing(key, { name, contract, ...rest });
        const test = (key, name, target, { updates }) => implementing(key, lexica.declarations.function(name, target, 'Boolean', { updates }));

        return DispatchTable.createModule(BrowserVocabularyDeclarations.moduleName, {
            types: [
                { name: 'Size', fields: { width: 'Number', height: 'Number' } },
                { name: 'Rectangle', fields: { left: 'Number', top: 'Number', right: 'Number', bottom: 'Number', width: 'Number', height: 'Number' } },
                { name: 'Selection', fields: { start: 'Number', end: 'Number' } },
                { name: 'Grid', fields: { columns: 'List<Number>' } },
                // An event such as scroll or resize can target the document or the window, which is no element.
                { name: 'DomEvent', fields: { target: 'Element?' } },
                // A browser that dispatches a click as a mouse event gives it no pointer type.
                { name: 'PointerEvent', fields: { target: 'Element', button: 'Number', buttons: 'Number', clientX: 'Number', clientY: 'Number', pointerType: 'String?' } },
                { name: 'KeyboardEvent', fields: { target: 'Element', key: 'String', code: 'String' } },
                { name: 'DragEvent', fields: { target: 'Element', clientX: 'Number', clientY: 'Number' } },
            ],

            // The event types `on` listens to, each a key of the type selector `event` mapping to the type its events are captured as.
            typeSelectors: [{ name: 'event' }],
            selectableTypes: [
                { name: 'click', selector: 'event', type: 'PointerEvent' },
                { name: 'pointerdown', selector: 'event', type: 'PointerEvent' },
                { name: 'pointerup', selector: 'event', type: 'PointerEvent' },
                { name: 'keydown', selector: 'event', type: 'KeyboardEvent' },
                { name: 'keyup', selector: 'event', type: 'KeyboardEvent' },
                { name: 'drop', selector: 'event', type: 'DragEvent' },
                { name: 'focus', selector: 'event', type: 'DomEvent' },
                { name: 'blur', selector: 'event', type: 'DomEvent' },
                { name: 'input', selector: 'event', type: 'DomEvent' },
                { name: 'scroll', selector: 'event', type: 'DomEvent' },
                { name: 'resize', selector: 'event', type: 'DomEvent' },
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

            // The targets the observations observe besides the receiver and an argument: the window and the document, and the receiver's root, the root of the tree it is in, and its roots, every root of its flat-tree ancestry through slots and shadow hosts.
            observationTargets: [{ name: 'window' }, { name: 'document' }, { name: 'root', from: 'receiver' }, { name: 'roots', from: 'receiver', count: 'many' }],

            members: [
                // The document the query runs against and its window, read through DOMQL's namespace from the environment its evaluator is given.
                implementing('document', property('document', null, 'Document', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('window', property('window', null, 'Window', { updates: updatesOf({ changes: 'constant' }) })),

                // The tests of elements and of the document, each a Boolean function as the browser decides it, its native semantics: a pseudo-class's matching, or the document's own state.
                test('disabled', 'disabled', 'Element', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'root', attributes: ['disabled'], childList: true, subtree: true }] }) }),
                test('readOnly', 'readonly', 'Element', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['readonly', 'type'] }] }) }),
                test('textEditable', 'textEditable', 'Element', { updates: updatesOf({ changes: 'partly-observable', misses: 'the document\'s design mode', observations: [{ type: 'mutation', of: 'roots', attributes: ['disabled', 'readonly', 'type', 'contenteditable', 'inert'], childList: true, subtree: true }] }) }),
                test('focused', 'focus', 'Element', { updates: updatesOf({ observations: [FOCUS] }) }),
                test('focusWithin', 'focusWithin', 'Element', { updates: updatesOf({ observations: [FOCUS] }) }),
                test('hover', 'hover', 'Element', { updates: updatesOf({ changes: 'partly-observable', misses: 'an element moving under a pointer that does not move, where the browser fires no pointer event for it', observations: [{ type: 'event', of: 'document', types: ['pointerover', 'pointerout'] }] }) }),
                test('popoverOpen', 'popoverOpen', 'Element', { updates: updatesOf({ observations: [POPOVERS] }) }),
                test('checked', 'checked', 'Element', {
                    updates: updatesOf({
                        changes: 'partly-observable',
                        misses: 'the page\'s code setting checked or selected, or a select\'s value or selectedIndex, which fires no event',
                        observations: [{ type: 'event', of: 'root', types: ['input', 'change', 'reset'], capture: true }, { type: 'mutation', of: 'root', attributes: ['checked', 'selected'], childList: true, subtree: true }],
                    }),
                }),
                test('visible', 'visible', 'Document', { updates: updatesOf({ observations: [{ type: 'visibility', of: 'receiver' }] }) }),
                test('hasFocus', 'focus', 'Document', { updates: updatesOf({ observations: [{ type: 'event', of: 'window', types: ['focus', 'blur'] }] }) }),

                // The capabilities the window's browser offers, each the presence of the API it names, which says nothing of whether a particular use of it succeeds.
                test('supportsShare', 'share', 'Window', { updates: updatesOf({ changes: 'constant' }) }),
                test('supportsClipboard', 'clipboard', 'Window', { updates: updatesOf({ changes: 'constant' }) }),

                // The ARIA tests of an element's ARIA view, each its own attribute's value read under its own contract, never its native state.
                test('ariaChecked', 'checked', 'Aria', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-checked'] }] }) }),
                test('ariaDisabled', 'disabled', 'Aria', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-disabled'] }] }) }),

                implementing('windowSize', property('size', 'Window', 'Size', { updates: updatesOf({ observations: [WINDOW_RESIZE] }) })),
                implementing('devicePixelRatio', property('devicePixelRatio', 'Window', 'Number', { updates: updatesOf({ observations: [{ type: 'pixelRatio', of: 'window' }] }) })),
                implementing('rect', property('rect', 'Element', 'Rectangle?', { updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, SCROLLING, WINDOW_RESIZE] }) })),
                implementing('size', property('size', 'Element', 'Size?', { updates: updatesOf({ observations: [RESIZE] }) })),
                implementing('clientSize', property('clientSize', 'Element', 'Size?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a change that leaves its border box and its content box as they were, as its border and padding changing by the same amount', observations: [{ type: 'resize', of: 'receiver', box: 'client' }] }) })),
                implementing('grid', property('grid', 'Element', 'Grid?', { updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                implementing('selection', property('selection', 'Element', 'Selection?', { updates: updatesOf({ changes: 'partly-observable', misses: 'selections the page\'s code sets', observations: TEXT_SELECTION }) })),
                implementing('children', property('children', 'Node', 'List<Element>', { updates: updatesOf({ observations: [CHILDREN] }) })),
                implementing('parent', property('parent', 'Node', 'Node?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] }) })),
                implementing('root', property('root', 'Node', 'Node', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                implementing('host', property('host', 'Node', 'Element?', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('shadow', property('shadow', 'Element', 'Shadow', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('aria', property('aria', 'Element', 'Aria', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('shadowRoot', property('root', 'Shadow', 'ShadowRoot?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a shadow root attached at any time but as the element connects to its document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                implementing('assignedElements', property('elements', 'Shadow', 'List<Element>?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree holding the slot inserted into a shadow tree that assigns it nothing', observations: [{ type: 'event', of: 'receiver', types: ['slotchange'] }, { type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                implementing('attached', property('attached', 'Element', 'Boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into a shadow root in the document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                implementing('hasChildren', property('hasChildren', 'Element', 'Boolean', { updates: updatesOf({ observations: [CHILDREN] }) })),
                implementing('hasSelection', property('hasSelection', 'Element', 'Boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'selections the page\'s code sets', observations: TEXT_SELECTION }) })),

                implementing('media', lexica.declarations.function('media', 'Window', 'Boolean', { syntax: 'indexer', parameters: [valueParameter('query', 'String')], updates: updatesOf({ observations: [{ type: 'media', of: 'window', query: { argument: 'query' } }] }) })),
                implementing('attribute', lexica.declarations.function('attribute', 'Element', 'String?', { syntax: 'indexer', isDefault: true, parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }] }] }) })),
                implementing('ariaAttribute', lexica.declarations.function('attribute', 'Aria', 'String?', { syntax: 'indexer', isDefault: true, parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name', prefix: 'aria-' }] }] }) })),
                implementing('class', lexica.declarations.function('class', 'Element', 'Boolean', { syntax: 'indexer', parameters: [valueParameter('name', 'String')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['class'] }] }) })),
                implementing('style', lexica.declarations.function('style', 'Element', 'String?', { syntax: 'indexer', parameters: [valueParameter('property', 'String')], updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                implementing('intersects', lexica.declarations.function('intersects', 'Element', 'Boolean?', {
                    arguments: 'options',
                    parameters: [valueParameter('root', 'Element?', { default: null, nulls: 'accept', omitted: 'the window' }), valueParameter('margin', 'Number', { default: 0 })],
                    updates: updatesOf({ reads: 'maintained', observations: [{ type: 'intersection', of: 'receiver', root: { argument: 'root' }, margin: { argument: 'margin' } }] }),
                })),
                implementing('overlaps', lexica.declarations.function('overlaps', 'Element', 'Boolean?', { arguments: 'options', parameters: [valueParameter('other', 'Element'), valueParameter('margin', 'Number', { default: 0 })], updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, { type: 'resize', of: { argument: 'other' } }, SCROLLING, WINDOW_RESIZE] }) })),
                implementing('matches', lexica.declarations.function('matches', 'Element', 'Boolean', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                implementing('rect', lexica.declarations.function('rectRelativeTo', 'Element', 'Rectangle?', { parameters: [valueParameter('relativeTo', 'Element')], updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, { type: 'resize', of: { argument: 'relativeTo' } }, SCROLLING, WINDOW_RESIZE] }) })),
                implementing('closest', lexica.declarations.function('closest', 'Element', 'Element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                implementing('firstMatching', lexica.declarations.function('first', 'Node', 'Element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                implementing('all', lexica.declarations.function('all', 'Node', 'List<Element>', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),

                // The event source, a host call its subscription listens to, delivering each event of the type its fixed argument selects.
                implementing('on', { ...lexica.declarations.function('on', ['Element', 'Document', 'Window'], '@selected', { invokedBy: 'host', parameters: [valueParameter('type', 'String', { fixed: true, selects: 'type', selector: 'event' })] }), requestKind: 'subscription' }),
            ],
        });
    }

    /** DOMQL's module as its declarations alone, which is enough to resolve a query and carries nothing out. */
    static get module() {
        return BrowserVocabularyDeclarations.createModule();
    }
}
