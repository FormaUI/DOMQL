/**
 * Vocabulary — the built-in vocabulary, as the specification's tables state it
 */

import { DomqlModule } from './DomqlModule.mjs';

/** A value parameter, required unless it is given a default. */
function valueParameter(name, type, options = {}) {
    const parameter = { name, kind: 'value', type, required: !('default' in options), fixed: false, nulls: 'propagate', ...options };

    if (parameter.fixed === false) {
        delete parameter.selects;
    }

    return parameter;
}

/** An expression parameter, evaluated against each item of the list it follows and producing the type. */
function expressionParameter(type) {
    return { name: 'expression', kind: 'expression', type, context: 'item', required: true, fixed: false, nulls: 'accept' };
}

/** A required predicate, an expression evaluated against each item whose truthiness its function receives. */
function predicateParameter() {
    return { name: 'expression', kind: 'predicate', type: 'boolean', context: 'item', required: true, fixed: false, nulls: 'accept' };
}

/** A property or an operation; an operation is a call unless it says it is named, and takes its one parameter directly unless it says it takes options. */
function member(kind, name, on, result, { function: implementation = name, parameters = [], changes = 'observable', reads = 'fresh', misses, observations, form, input, isDefault = false } = {}) {
    const declaration = { name, function: implementation, kind, on, parameters, result, changes, reads };

    if (kind !== 'property') {
        declaration.form = form ?? 'call';

        if (parameters.length > 0) {
            declaration.input = input ?? 'direct';
        }
    }

    if (isDefault) {
        declaration.default = true;
    }

    if (observations !== undefined) {
        declaration.observations = observations;
    }

    if (implementation === null) {
        delete declaration.function;
    }

    if (misses !== undefined) {
        declaration.misses = misses;
    }

    return declaration;
}

const property = (name, on, result, options) => member('property', name, on, result, options);

/** A condition: a Boolean of its receivers that its verb, `is` unless it says otherwise, asks by name, carried out by its own function under its own contract, observable unless it says otherwise. */
const condition = (name, on, implementation, { verb = 'is', changes = 'observable', reads = 'fresh', misses, observations = [] } = {}) => ({
    name,
    verb,
    function: implementation,
    on,
    changes,
    reads,
    ...(misses === undefined ? {} : { misses }),
    observations,
});
const operation = (name, on, result, options) => member('operation', name, on, result, options);

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
const MATCHING = { changes: 'partly-observable', misses: 'pointer state such as :hover and control state such as :checked' };
const GEOMETRY = { changes: 'partly-observable', misses: 'a move its own size, the scrolling of its scroll containers, the window\'s size and the structure of its trees do not cause, as a sibling before it growing or a margin or padding around it changing, and transforms and animations' };
const STYLE = { changes: 'partly-observable', misses: 'rules matching from elsewhere' };

export class Vocabulary {
    /**
     * The built-in module: its declarations and, where they are given, the functions that carry them out.
     * @param {Record<string, Function> | null} [functions] The functions the declarations name.
     */
    static createModule(functions = null) {
        return DomqlModule.createBuiltIn({
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
                { name: 'click', payload: 'pointerEvent' },
                { name: 'pointerdown', payload: 'pointerEvent' },
                { name: 'pointerup', payload: 'pointerEvent' },
                { name: 'keydown', payload: 'keyboardEvent' },
                { name: 'keyup', payload: 'keyboardEvent' },
                { name: 'drop', payload: 'dragEvent' },
                { name: 'focus', payload: 'domEvent' },
                { name: 'blur', payload: 'domEvent' },
                { name: 'input', payload: 'domEvent' },
                { name: 'scroll', payload: 'domEvent' },
                { name: 'resize', payload: 'domEvent' },
            ],

            observationTypes: [
                { name: 'resize', contract: 'invalidation', identity: ['box'], function: 'observeResize' },
                { name: 'mutation', contract: 'invalidation', identity: ['attributes', 'childList', 'subtree', 'characterData'], function: 'observeMutation' },
                { name: 'attachment', contract: 'invalidation', function: 'observeAttachment' },
                { name: 'intersection', contract: 'maintained', identity: ['root', 'margin'], function: 'observeIntersection' },
                { name: 'media', contract: 'invalidation', identity: ['query'], function: 'observeMedia' },
                { name: 'pixelRatio', contract: 'invalidation', function: 'observePixelRatio' },
                { name: 'event', contract: 'invalidation', identity: ['types', 'capture'], function: 'observeEvents' },
                { name: 'visibility', contract: 'invalidation', function: 'observeVisibility' },
            ],

            // The conditions of elements and of the document, each as the browser decides it, its native semantics: a pseudo-class's matching, or the document's own state.
            conditions: [
                condition('disabled', 'element', 'disabled', { observations: [{ type: 'mutation', of: 'root', attributes: ['disabled'], childList: true, subtree: true }] }),
                condition('readonly', 'element', 'readOnly', { observations: [{ type: 'mutation', of: 'receiver', attributes: ['readonly', 'type'] }] }),
                condition('text-editable', 'element', 'textEditable', { changes: 'partly-observable', misses: 'the document\'s design mode', observations: [{ type: 'mutation', of: 'roots', attributes: ['disabled', 'readonly', 'type', 'contenteditable', 'inert'], childList: true, subtree: true }] }),
                condition('focus', 'element', 'focused', { verb: 'has', observations: [FOCUS] }),
                condition('focus-within', 'element', 'focusWithin', { verb: 'has', observations: [FOCUS] }),
                condition('hover', 'element', 'hover', { changes: 'partly-observable', misses: 'an element moving under a pointer that does not move, where the browser fires no pointer event for it', observations: [{ type: 'event', of: 'document', types: ['pointerover', 'pointerout'] }] }),
                condition('popover-open', 'element', 'popoverOpen', { observations: [POPOVERS] }),
                condition('checked', 'element', 'checked', {
                    changes: 'partly-observable',
                    misses: 'a script setting checked or selected, or a select\'s value or selectedIndex, which fires no event',
                    observations: [{ type: 'event', of: 'root', types: ['input', 'change', 'reset'], capture: true }, { type: 'mutation', of: 'root', attributes: ['checked', 'selected'], childList: true, subtree: true }],
                }),
                condition('visible', 'document', 'visible', { observations: [{ type: 'visibility', of: 'receiver' }] }),
                condition('focus', 'document', 'hasFocus', { verb: 'has', observations: [{ type: 'event', of: 'window', types: ['focus', 'blur'] }] }),

                // The capabilities the window's browser offers, each the presence of the API it names, which says nothing of whether a particular use of it succeeds.
                condition('share', 'window', 'supportsShare', { verb: 'supports', changes: 'constant' }),
                condition('clipboard', 'window', 'supportsClipboard', { verb: 'supports', changes: 'constant' }),

                // The ARIA conditions of an element's ARIA view, each its own attribute's value read under its own contract, never its native state.
                condition('checked', 'aria', 'ariaChecked', { observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-checked'] }] }),
                condition('disabled', 'aria', 'ariaDisabled', { observations: [{ type: 'mutation', of: 'receiver', attributes: ['aria-disabled'] }] }),
            ],

            members: [
                property('size', 'window', 'size', { function: 'windowSize', observations: [WINDOW_RESIZE] }),
                property('devicePixelRatio', 'window', 'number', { observations: [{ type: 'pixelRatio', of: 'window' }] }),
                property('rect', 'element', 'rectangle?', { ...GEOMETRY, observations: [RESIZE, SCROLLING, WINDOW_RESIZE] }),
                property('size', 'element', 'size?', { observations: [RESIZE] }),
                property('clientSize', 'element', 'size?', { changes: 'partly-observable', misses: 'a change that leaves its border box and its content box as they were, as its border and padding changing by the same amount', observations: [{ type: 'resize', of: 'receiver', box: 'client' }] }),
                property('grid', 'element', 'grid?', { ...STYLE, observations: [RESIZE, ATTRIBUTES] }),
                property('selection', 'element', 'selection?', { changes: 'partly-observable', misses: 'selections assigned by script', observations: TEXT_SELECTION }),
                property('children', 'node', 'list<element>', { observations: [CHILDREN] }),
                property('parent', 'node', 'node?', { changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] }),
                property('root', 'node', 'node', { changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }),
                property('host', 'node', 'element?', { changes: 'constant' }),
                property('shadow', 'element', 'shadow', { changes: 'constant' }),
                property('aria', 'element', 'aria', { changes: 'constant' }),
                property('root', 'shadow', 'shadowRoot?', { function: 'shadowRoot', changes: 'partly-observable', misses: 'a shadow root attached at any time but as the element connects to its document', observations: [{ type: 'attachment', of: 'receiver' }] }),
                property('elements', 'shadow', 'list<element>?', { function: 'assignedElements', changes: 'partly-observable', misses: 'a detached tree holding the slot inserted into a shadow tree that assigns it nothing', observations: [{ type: 'event', of: 'receiver', types: ['slotchange'] }, { type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }),
                property('attached', 'element', 'boolean', { changes: 'partly-observable', misses: 'a detached tree inserted into a shadow root in the document', observations: [{ type: 'attachment', of: 'receiver' }] }),
                property('hasChildren', 'element', 'boolean', { observations: [CHILDREN] }),
                property('hasSelection', 'element', 'boolean', { changes: 'partly-observable', misses: 'selections assigned by script', observations: TEXT_SELECTION }),
                property('count', 'list<T>', 'number', { changes: 'derived', reads: 'derived' }),
                property('first', 'list<T>', 'T?', { changes: 'derived', reads: 'derived' }),
                property('last', 'list<T>', 'T?', { changes: 'derived', reads: 'derived' }),

                operation('matchesMedia', 'window', 'boolean', { form: 'infix', parameters: [valueParameter('query', 'string')], observations: [{ type: 'media', of: 'window', query: { argument: 'query' } }] }),
                operation('attribute', 'element', 'string?', { form: 'indexer', isDefault: true, parameters: [valueParameter('name', 'string')], observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }] }] }),
                operation('attribute', 'aria', 'string?', { function: 'ariaAttribute', form: 'indexer', isDefault: true, parameters: [valueParameter('name', 'string')], observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name', prefix: 'aria-' }] }] }),
                operation('class', 'element', 'boolean', { form: 'indexer', parameters: [valueParameter('name', 'string')], observations: [{ type: 'mutation', of: 'receiver', attributes: ['class'] }] }),
                // The verbs that ask a condition: the condition's own declaration carries it out, its function, how it changes and the observations that cover it, so declaring each on any receiver selects the condition's own receivers.
                operation('is', 'any', 'boolean', { function: null, changes: 'derived', reads: 'derived', parameters: [valueParameter('name', 'string', { fixed: true, selects: 'condition' })] }),
                operation('has', 'any', 'boolean', { function: null, changes: 'derived', reads: 'derived', parameters: [valueParameter('name', 'string', { fixed: true, selects: 'condition' })] }),
                operation('supports', 'any', 'boolean', { function: null, changes: 'derived', reads: 'derived', parameters: [valueParameter('name', 'string', { fixed: true, selects: 'condition' })] }),
                operation('style', 'element', 'string?', { ...STYLE, form: 'indexer', parameters: [valueParameter('property', 'string')], observations: [RESIZE, ATTRIBUTES] }),
                operation('intersects', 'element', 'boolean?', { reads: 'maintained', input: 'options', parameters: [valueParameter('root', 'element?', { default: null, nulls: 'accept', omitted: 'the window' }), valueParameter('margin', 'number', { default: 0 })], observations: [{ type: 'intersection', of: 'receiver', root: { argument: 'root' }, margin: { argument: 'margin' } }] }),
                operation('overlaps', 'element', 'boolean?', { ...GEOMETRY, input: 'options', parameters: [valueParameter('other', 'element'), valueParameter('margin', 'number', { default: 0 })], observations: [RESIZE, { type: 'resize', of: { argument: 'other' } }, SCROLLING, WINDOW_RESIZE] }),
                operation('matches', 'element', 'boolean', { ...MATCHING, parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS, POPOVERS] }),
                operation('rectRelativeTo', 'element', 'rectangle?', { ...GEOMETRY, function: 'rect', parameters: [valueParameter('relativeTo', 'element')], observations: [RESIZE, { type: 'resize', of: { argument: 'relativeTo' } }, SCROLLING, WINDOW_RESIZE] }),
                operation('closest', 'element', 'element?', { ...MATCHING, parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS, POPOVERS] }),
                operation('first', 'node', 'element?', { ...MATCHING, function: 'firstMatching', parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS, POPOVERS] }),
                operation('all', 'node', 'list<element>', { ...MATCHING, parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS, POPOVERS] }),
                operation('at', 'list<T>', 'T?', { changes: 'derived', reads: 'derived', parameters: [valueParameter('index', 'number')] }),
                operation('max', 'list<T>', 'number?', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('number?')] }),
                operation('min', 'list<T>', 'number?', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('number?')] }),
                operation('sum', 'list<T>', 'number', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('number?')] }),
                operation('where', 'list<T>', 'list<T>', { changes: 'derived', reads: 'derived', parameters: [predicateParameter()] }),

                { ...operation('on', ['element', 'document', 'window'], 'event<@selected>', { changes: 'constant', reads: 'captured', parameters: [valueParameter('type', 'string', { fixed: true, selects: 'eventType' })] }), kind: 'source' },
            ],

            conversions: [
                { from: 'string', to: 'number', function: 'stringToNumber' },
                { from: 'number', to: 'string', function: 'numberToString' },
                { from: 'boolean', to: 'string', function: 'booleanToString' },
                { from: 'string', to: 'boolean', function: 'stringToBoolean' },
            ],
        }, functions);
    }

    /** The built-in module as its declarations alone, which is enough to resolve a query and carries nothing out. */
    static get module() {
        return Vocabulary.createModule();
    }
}
