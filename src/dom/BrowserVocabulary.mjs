/**
 * BrowserVocabulary — DOMQL's vocabulary, the DOM's: its nodes, elements, shadow trees, ARIA views and window, their members, predicates, events and observations, as the specification's tables state them
 */

import { lexica } from '@formaui/lexica';

const { valueParameter, property, predicate } = lexica.declarations;

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

const SELECTOR_PARAMETERS = [valueParameter('selector', 'string')];

/** The updates of a declaration, observable unless they say otherwise and read fresh, with the observations that cover its changes. */
const updatesOf = ({ changes = 'observable', reads = 'fresh', ...rest } = {}) => ({ changes, reads, ...rest });

const MATCHING = { changes: 'partly-observable', misses: 'pointer state such as :hover and control state such as :checked' };
const GEOMETRY = { changes: 'partly-observable', misses: 'a move its own size, the scrolling of its scroll containers, the window\'s size and the structure of its trees do not cause, as a sibling before it growing or a margin or padding around it changing, and transforms and animations' };
const STYLE = { changes: 'partly-observable', misses: 'rules matching from elsewhere' };

export class BrowserVocabulary {
    /** The name of DOMQL's module. */
    static moduleName = 'domql';

    /**
     * DOMQL's module, made as every module is: its declarations, each carrying the implementation given for it where one is.
     * @param {Record<string, Function>} [implementations] The implementations, by the key each declaration is carried out under.
     */
    static createModule(implementations = {}) {
        // A declaration takes the implementation given under its key, and none where none is given, which leaves it resolved against and never invoked.
        const implementing = (key, declaration) => (implementations[key] === undefined ? declaration : { ...declaration, implementation: implementations[key] });
        const observationType = (name, contract, key, rest = {}) => implementing(key, { name, contract, ...rest });
        const asked = (key, name, target, options) => implementing(key, predicate(name, target, undefined, options));

        return lexica.createModule(BrowserVocabulary.moduleName, {
            types: [
                { name: 'size', fields: { width: 'number', height: 'number' } },
                { name: 'rectangle', fields: { left: 'number', top: 'number', right: 'number', bottom: 'number', width: 'number', height: 'number' } },
                { name: 'selection', fields: { start: 'number', end: 'number' } },
                { name: 'grid', fields: { columns: 'list<number>' } },
                // An event such as scroll or resize can target the document or the window, which is no element.
                { name: 'domEvent', fields: { target: 'element?' } },
                // A browser that dispatches a click as a mouse event gives it no pointer type.
                { name: 'pointerEvent', fields: { target: 'element', button: 'number', buttons: 'number', clientX: 'number', clientY: 'number', pointerType: 'string?' } },
                { name: 'keyboardEvent', fields: { target: 'element', key: 'string', code: 'string' } },
                { name: 'dragEvent', fields: { target: 'element', clientX: 'number', clientY: 'number' } },
            ],

            eventTypes: [
                { name: 'click', data: 'pointerEvent' },
                { name: 'pointerdown', data: 'pointerEvent' },
                { name: 'pointerup', data: 'pointerEvent' },
                { name: 'keydown', data: 'keyboardEvent' },
                { name: 'keyup', data: 'keyboardEvent' },
                { name: 'drop', data: 'dragEvent' },
                { name: 'focus', data: 'domEvent' },
                { name: 'blur', data: 'domEvent' },
                { name: 'input', data: 'domEvent' },
                { name: 'scroll', data: 'domEvent' },
                { name: 'resize', data: 'domEvent' },
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

            // The predicates of elements and of the document, each as the browser decides it, its native semantics: a pseudo-class's matching, or the document's own state.
            predicates: [
                asked('disabled', 'disabled', 'element', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'root', attributes: ['disabled'], childList: true, subtree: true }] }) }),
                asked('readOnly', 'readonly', 'element', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['readonly', 'type'] }] }) }),
                asked('textEditable', 'text-editable', 'element', { updates: updatesOf({ changes: 'partly-observable', misses: 'the document\'s design mode', observations: [{ type: 'mutation', of: 'roots', attributes: ['disabled', 'readonly', 'type', 'contenteditable', 'inert'], childList: true, subtree: true }] }) }),
                asked('focused', 'focus', 'element', { verb: 'has', updates: updatesOf({ observations: [FOCUS] }) }),
                asked('focusWithin', 'focus-within', 'element', { verb: 'has', updates: updatesOf({ observations: [FOCUS] }) }),
                asked('hover', 'hover', 'element', { updates: updatesOf({ changes: 'partly-observable', misses: 'an element moving under a pointer that does not move, where the browser fires no pointer event for it', observations: [{ type: 'event', of: 'document', types: ['pointerover', 'pointerout'] }] }) }),
                asked('popoverOpen', 'popover-open', 'element', { updates: updatesOf({ observations: [POPOVERS] }) }),
                asked('checked', 'checked', 'element', {
                    updates: updatesOf({
                        changes: 'partly-observable',
                        misses: 'a script setting checked or selected, or a select\'s value or selectedIndex, which fires no event',
                        observations: [{ type: 'event', of: 'root', types: ['input', 'change', 'reset'], capture: true }, { type: 'mutation', of: 'root', attributes: ['checked', 'selected'], childList: true, subtree: true }],
                    }),
                }),
                asked('visible', 'visible', 'document', { updates: updatesOf({ observations: [{ type: 'visibility', of: 'receiver' }] }) }),
                asked('hasFocus', 'focus', 'document', { verb: 'has', updates: updatesOf({ observations: [{ type: 'event', of: 'window', types: ['focus', 'blur'] }] }) }),

                // The capabilities the window's browser offers, each the presence of the API it names, which says nothing of whether a particular use of it succeeds.
                asked('supportsShare', 'share', 'window', { verb: 'supports', updates: updatesOf({ changes: 'constant' }) }),
                asked('supportsClipboard', 'clipboard', 'window', { verb: 'supports', updates: updatesOf({ changes: 'constant' }) }),

                // The ARIA predicates of an element's ARIA view, each its own attribute's value read under its own contract, never its native state.
                asked('ariaChecked', 'checked', 'aria', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-checked'] }] }) }),
                asked('ariaDisabled', 'disabled', 'aria', { updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-disabled'] }] }) }),
            ],

            members: [
                implementing('windowSize', property('size', 'window', 'size', { updates: updatesOf({ observations: [WINDOW_RESIZE] }) })),
                implementing('devicePixelRatio', property('devicePixelRatio', 'window', 'number', { updates: updatesOf({ observations: [{ type: 'pixelRatio', of: 'window' }] }) })),
                implementing('rect', property('rect', 'element', 'rectangle?', { updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, SCROLLING, WINDOW_RESIZE] }) })),
                implementing('size', property('size', 'element', 'size?', { updates: updatesOf({ observations: [RESIZE] }) })),
                implementing('clientSize', property('clientSize', 'element', 'size?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a change that leaves its border box and its content box as they were, as its border and padding changing by the same amount', observations: [{ type: 'resize', of: 'receiver', box: 'client' }] }) })),
                implementing('grid', property('grid', 'element', 'grid?', { updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                implementing('selection', property('selection', 'element', 'selection?', { updates: updatesOf({ changes: 'partly-observable', misses: 'selections assigned by script', observations: TEXT_SELECTION }) })),
                implementing('children', property('children', 'node', 'list<element>', { updates: updatesOf({ observations: [CHILDREN] }) })),
                implementing('parent', property('parent', 'node', 'node?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] }) })),
                implementing('root', property('root', 'node', 'node', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                implementing('host', property('host', 'node', 'element?', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('shadow', property('shadow', 'element', 'shadow', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('aria', property('aria', 'element', 'aria', { updates: updatesOf({ changes: 'constant' }) })),
                implementing('shadowRoot', property('root', 'shadow', 'shadowRoot?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a shadow root attached at any time but as the element connects to its document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                implementing('assignedElements', property('elements', 'shadow', 'list<element>?', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree holding the slot inserted into a shadow tree that assigns it nothing', observations: [{ type: 'event', of: 'receiver', types: ['slotchange'] }, { type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }) })),
                implementing('attached', property('attached', 'element', 'boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'a detached tree inserted into a shadow root in the document', observations: [{ type: 'attachment', of: 'receiver' }] }) })),
                implementing('hasChildren', property('hasChildren', 'element', 'boolean', { updates: updatesOf({ observations: [CHILDREN] }) })),
                implementing('hasSelection', property('hasSelection', 'element', 'boolean', { updates: updatesOf({ changes: 'partly-observable', misses: 'selections assigned by script', observations: TEXT_SELECTION }) })),

                implementing('media', lexica.declarations.function('media', 'window', 'boolean', { syntax: 'indexer', parameters: [valueParameter('query', 'string')], updates: updatesOf({ observations: [{ type: 'media', of: 'window', query: { argument: 'query' } }] }) })),
                implementing('attribute', lexica.declarations.function('attribute', 'element', 'string?', { syntax: 'indexer', isDefault: true, parameters: [valueParameter('name', 'string')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }] }] }) })),
                implementing('ariaAttribute', lexica.declarations.function('attribute', 'aria', 'string?', { syntax: 'indexer', isDefault: true, parameters: [valueParameter('name', 'string')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name', prefix: 'aria-' }] }] }) })),
                implementing('class', lexica.declarations.function('class', 'element', 'boolean', { syntax: 'indexer', parameters: [valueParameter('name', 'string')], updates: updatesOf({ observations: [{ type: 'mutation', of: 'receiver', attributes: ['class'] }] }) })),
                implementing('style', lexica.declarations.function('style', 'element', 'string?', { syntax: 'indexer', parameters: [valueParameter('property', 'string')], updates: updatesOf({ ...STYLE, observations: [RESIZE, ATTRIBUTES] }) })),
                implementing('intersects', lexica.declarations.function('intersects', 'element', 'boolean?', {
                    arguments: 'options',
                    parameters: [valueParameter('root', 'element?', { default: null, nulls: 'accept', omitted: 'the window' }), valueParameter('margin', 'number', { default: 0 })],
                    updates: updatesOf({ reads: 'maintained', observations: [{ type: 'intersection', of: 'receiver', root: { argument: 'root' }, margin: { argument: 'margin' } }] }),
                })),
                implementing('overlaps', lexica.declarations.function('overlaps', 'element', 'boolean?', { arguments: 'options', parameters: [valueParameter('other', 'element'), valueParameter('margin', 'number', { default: 0 })], updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, { type: 'resize', of: { argument: 'other' } }, SCROLLING, WINDOW_RESIZE] }) })),
                implementing('matches', lexica.declarations.function('matches', 'element', 'boolean', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                implementing('rect', lexica.declarations.function('rectRelativeTo', 'element', 'rectangle?', { parameters: [valueParameter('relativeTo', 'element')], updates: updatesOf({ ...GEOMETRY, observations: [RESIZE, { type: 'resize', of: { argument: 'relativeTo' } }, SCROLLING, WINDOW_RESIZE] }) })),
                implementing('closest', lexica.declarations.function('closest', 'element', 'element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                implementing('firstMatching', lexica.declarations.function('first', 'node', 'element?', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),
                implementing('all', lexica.declarations.function('all', 'node', 'list<element>', { parameters: SELECTOR_PARAMETERS, updates: updatesOf({ ...MATCHING, observations: [STRUCTURE, FOCUS, POPOVERS] }) })),

                implementing('on', { ...lexica.declarations.function('on', ['element', 'document', 'window'], 'event<@selected>', { parameters: [valueParameter('type', 'string', { fixed: true, selects: 'eventType' })], updates: updatesOf({ changes: 'constant', reads: 'captured' }) }), kind: 'eventSource' }),
            ],
        });
    }

    /** DOMQL's module as its declarations alone, which is enough to resolve a query and carries nothing out. */
    static get module() {
        return BrowserVocabulary.createModule();
    }
}
