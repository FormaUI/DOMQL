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

/** A property or an operation; an operation is a call unless it says it is named, and takes its one parameter directly unless it says it takes options. */
function member(kind, name, on, result, { function: implementation = name, parameters = [], changes = 'observable', reads = 'fresh', misses, observations, form, input } = {}) {
    const declaration = { name, function: implementation, kind, on, parameters, result, changes, reads };

    if (kind !== 'property') {
        declaration.form = form ?? 'call';

        if (parameters.length > 0) {
            declaration.input = input ?? 'direct';
        }
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
const operation = (name, on, result, options) => member('operation', name, on, result, options);

/** A predicate the verb reads. */
function predicate(verb, name, on, { changes = 'observable', reads = 'fresh', misses, observations } = {}) {
    const declaration = { verb, name, function: `${verb}${name[0].toUpperCase()}${name.slice(1)}`, on, changes, reads };

    if (observations !== undefined) {
        declaration.observations = observations;
    }

    if (misses !== undefined) {
        declaration.misses = misses;
    }

    return declaration;
}

/** The observations the members share. */
const RESIZE = { type: 'resize', of: 'receiver' };
const WINDOW_RESIZE = { type: 'resize', of: 'window' };
const SCROLLING = { type: 'event', of: 'roots', types: ['scroll'], capture: true };
const FOCUS = { type: 'event', of: 'document', types: ['focusin', 'focusout'] };
const ATTRIBUTES = { type: 'mutation', of: 'receiver', attributes: true };
const CHILDREN = { type: 'mutation', of: 'receiver', childList: true };
const STRUCTURE = { type: 'mutation', of: 'root', attributes: true, childList: true, subtree: true };
const TEXT_SELECTION = [
    { type: 'event', of: 'receiver', types: ['select', 'input'] },
    { type: 'event', of: 'document', types: ['selectionchange'] },
];

const SELECTOR_PARAMETERS = [valueParameter('selector', 'string')];
const MATCHING = { changes: 'partly-observable', misses: 'pointer state such as :hover and control state such as :checked' };
const GEOMETRY = { changes: 'partly-observable', misses: 'transforms and animations' };
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

            features: ['share', 'clipboard'],

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

            predicates: [
                predicate('is', 'attached', 'element', { changes: 'partly-observable', misses: 'a detached tree inserted into a shadow root in the document', observations: [{ type: 'attachment', of: 'receiver' }] }),
                predicate('is', 'disabled', 'element', { observations: [{ type: 'mutation', of: 'root', attributes: ['disabled'], childList: true, subtree: true }] }),
                predicate('is', 'readOnly', 'element', { observations: [{ type: 'mutation', of: 'receiver', attributes: ['readonly', 'type'] }] }),
                predicate('is', 'textEditable', 'element', { changes: 'partly-observable', misses: 'the document\'s design mode', observations: [{ type: 'mutation', of: 'roots', attributes: ['disabled', 'readonly', 'type', 'contenteditable', 'inert'], childList: true, subtree: true }] }),
                predicate('is', 'focused', 'element', { observations: [FOCUS] }),
                predicate('is', 'visible', 'document', { observations: [{ type: 'visibility', of: 'receiver' }] }),
                predicate('has', 'children', 'element', { observations: [CHILDREN] }),
                predicate('has', 'selection', 'element', { changes: 'partly-observable', misses: 'selections assigned by script', observations: TEXT_SELECTION }),
                predicate('has', 'focus', 'document', { observations: [{ type: 'event', of: 'window', types: ['focus', 'blur'] }] }),
            ],

            members: [
                property('size', 'window', 'size', { function: 'windowSize', observations: [WINDOW_RESIZE] }),
                property('devicePixelRatio', 'window', 'number', { observations: [{ type: 'pixelRatio', of: 'window' }] }),
                property('rect', 'element', 'rectangle?', { ...GEOMETRY, observations: [RESIZE, SCROLLING, WINDOW_RESIZE] }),
                property('size', 'element', 'size?', { observations: [RESIZE] }),
                property('clientSize', 'element', 'size?', { observations: [RESIZE] }),
                property('grid', 'element', 'grid?', { ...STYLE, observations: [RESIZE, ATTRIBUTES] }),
                property('selection', 'element', 'selection?', { changes: 'partly-observable', misses: 'selections assigned by script', observations: TEXT_SELECTION }),
                property('children', 'node', 'list<element>', { observations: [CHILDREN] }),
                property('parent', 'node', 'node?', { changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }] }),
                property('root', 'node', 'node', { changes: 'partly-observable', misses: 'a detached tree inserted into another detached tree or into a shadow root', observations: [{ type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }),
                property('host', 'node', 'element?', { changes: 'constant' }),
                property('shadow', 'element', 'shadow', { changes: 'constant' }),
                property('root', 'shadow', 'shadowRoot?', { function: 'shadowRoot', changes: 'partly-observable', misses: 'a shadow root attached at any time but as the element connects to its document', observations: [{ type: 'attachment', of: 'receiver' }] }),
                property('elements', 'shadow', 'list<element>?', { function: 'assignedElements', changes: 'partly-observable', misses: 'a detached tree holding the slot inserted into a shadow tree that assigns it nothing', observations: [{ type: 'event', of: 'receiver', types: ['slotchange'] }, { type: 'mutation', of: 'root', childList: true, subtree: true }, { type: 'attachment', of: 'receiver' }] }),
                property('count', 'list<T>', 'number', { changes: 'derived', reads: 'derived' }),
                property('first', 'list<T>', 'T?', { changes: 'derived', reads: 'derived' }),
                property('last', 'list<T>', 'T?', { changes: 'derived', reads: 'derived' }),

                operation('matchesMedia', 'window', 'boolean', { form: 'infix', parameters: [valueParameter('query', 'string')], observations: [{ type: 'media', of: 'window', query: { argument: 'query' } }] }),
                operation('supports', 'window', 'boolean', { form: 'infix', changes: 'constant', parameters: [valueParameter('feature', 'string', { fixed: true, selects: 'feature' })] }),
                operation('attributeOf', 'element', 'string?', { form: 'infix', parameters: [valueParameter('name', 'string')], observations: [{ type: 'mutation', of: 'receiver', attributes: [{ argument: 'name' }] }] }),
                operation('computedStyleOf', 'element', 'string?', { ...STYLE, form: 'infix', parameters: [valueParameter('property', 'string')], observations: [RESIZE, ATTRIBUTES] }),
                operation('intersects', 'element', 'boolean?', { reads: 'maintained', form: 'infix', input: 'options', parameters: [valueParameter('root', 'element?', { default: null, nulls: 'accept', omitted: 'the window' }), valueParameter('margin', 'number', { default: 0 })], observations: [{ type: 'intersection', of: 'receiver', root: { argument: 'root' }, margin: { argument: 'margin' } }] }),
                operation('overlaps', 'element', 'boolean?', { ...GEOMETRY, form: 'infix', input: 'options', parameters: [valueParameter('other', 'element'), valueParameter('margin', 'number', { default: 0 })], observations: [RESIZE, { type: 'resize', of: { argument: 'other' } }, SCROLLING, WINDOW_RESIZE] }),
                operation('matches', 'element', 'boolean?', { ...MATCHING, form: 'infix', parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS] }),
                operation('rectRelativeTo', 'element', 'rectangle?', { ...GEOMETRY, function: 'rect', parameters: [valueParameter('relativeTo', 'element')], observations: [RESIZE, { type: 'resize', of: { argument: 'relativeTo' } }, SCROLLING, WINDOW_RESIZE] }),
                operation('closest', 'element', 'element?', { ...MATCHING, parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS] }),
                operation('first', 'node', 'element?', { ...MATCHING, function: 'firstMatching', parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS] }),
                operation('all', 'node', 'list<element>', { ...MATCHING, parameters: SELECTOR_PARAMETERS, observations: [STRUCTURE, FOCUS] }),
                operation('at', 'list<T>', 'T?', { changes: 'derived', reads: 'derived', parameters: [valueParameter('index', 'number')] }),
                operation('max', 'list<T>', 'number?', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('number?')] }),
                operation('min', 'list<T>', 'number?', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('number?')] }),
                operation('sum', 'list<T>', 'number', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('number?')] }),
                operation('where', 'list<T>', 'list<T>', { changes: 'derived', reads: 'derived', parameters: [expressionParameter('boolean?')] }),

                { ...operation('eventsOf', ['element', 'document', 'window'], 'event<@selected>', { form: 'infix', changes: 'constant', reads: 'captured', parameters: [valueParameter('type', 'string', { fixed: true, selects: 'eventType' })] }), kind: 'source' },
            ],
        }, functions);
    }

    /** The built-in module as its declarations alone, which is enough to resolve a query and carries nothing out. */
    static get module() {
        return Vocabulary.createModule();
    }
}
