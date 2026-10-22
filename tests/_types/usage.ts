// How a TypeScript caller uses DOMQL, which the declarations must accept; the test compiles this file.
import { domql, LexicaError } from '../../src/domql.js';
import type { DomqlChangeOperation, DomqlConversionImplementationInput, DomqlDefinition, DomqlDefinitionNode, DomqlEvaluateAsyncOptions, DomqlEventListener, DomqlExecutionHandle, DomqlLiveStateWatch, DomqlLiveStateWatchOptions, DomqlMemberDeclaration, DomqlModule, DomqlModuleContents, DomqlOperationOptions, DomqlQuery, DomqlReadOnly, DomqlResolvedDefinition, DomqlResultArgs, DomqlSelectedView, DomqlSelection, DomqlWatch, DomqlWatchOptions } from '../../src/domql.js';

const panel = document.createElement('div');
const controller = new AbortController();
const signal = controller.signal;

// A query object is made from text or a definition, and bound again by `with`.
const query: DomqlQuery<{ count: number }> = domql.query<{ count: number }>('panel { count = it.children.count }', { panel });
const optional = domql.query('panel { size = it.size }', { panel: null, ids: [] });
const definition: DomqlDefinition = query.definition;
const created: DomqlQuery<{ count: number }> = domql.query<{ count: number }>(definition, { panel });
const rebound: DomqlQuery<{ count: number }> = query.with({ panel: document.body });
// @ts-expect-error A query's bindings are no part of its API; `with` binds it anew.
const bound: unknown = rebound.bindings;
const version: string = domql.info.versions.runtime;
const specificationVersion: string = domql.info.versions.specification;
const languageVersion: string = domql.info.versions.language;
const formatted: string = domql.format(query);
const formattedText: string = domql.format(domql.format(definition));

// @ts-expect-error A request is formatted from its text, its definition or a query object.
domql.format(42);

const resolved: DomqlResolvedDefinition = created.resolve({ watch: true, acceptPartialObservation: true });
const kind: 'value' | 'subscription' | 'execution' = resolved.kind;
const executionMode: 'once' | 'continuous' | null = resolved.executionMode;
const typeText: string | null = resolved.type;
const countType: string = resolved.typeAt(['count']);
const usedNames: readonly string[] = resolved.usedDeclarations.map(used => used.name);

// A query is evaluated once, synchronously or waiting for its maintained members.
const answer = query.evaluate();
const count: number = answer.count;
const anything: unknown = optional.evaluate({ window });
const waited: Promise<{ count: number }> = query.evaluateAsync({ window, signal });
const evaluating: DomqlEvaluateAsyncOptions = { window, signal };
const shorthand: number = domql.query<number>('panel.children.count', { panel }).evaluate();

// A selection is a part of the query's result, every operation on it carried out on the whole query.
const selection: DomqlSelection<number> = query.select<number>('count');
const selected: number = selection.evaluate({ window });
const selectedAsync: Promise<number> = selection.evaluateAsync(evaluating);
const selectedWatch: DomqlWatch<number> = selection.watch({ schedule: 'immediate' });
const key: DomqlSelection<string> = domql.query('panel.children { key = it.attribute["data-key"] }', { panel }).select('items').select<string>(0, 'key');

// @ts-expect-error A path item is a field's name or a list index.
query.select(true);

// @ts-expect-error A query carries its own bindings, so only its options are given to an operation.
query.evaluate({ panel });

// A snapshot watch raises each result as a change event, and a failure that belongs to no result as an error event.
const watch: DomqlWatch<{ count: number }> = query.watch({ schedule: 'immediate', updateStrategy: 'snapshot', acceptPartialObservation: true, signal, window });
const changes: DomqlEventListener = watch.subscribe('change', (sender, args) => {
    const handle: DomqlWatch<{ count: number }> = sender;

    if (args.status === 'ready') {
        const total: number = args.value.count;

        return [handle, total];
    }

    return args.error;
}, { signal });
const failures: DomqlEventListener = watch.subscribe('error', (sender, args) => Promise.resolve(args.error));
const listening: 'ready' | 'disposed' = changes.status;
const status: 'pending' | 'ready' | 'failed' | 'disposed' = watch.status;
const snapshot: { count: number } | undefined = watch.snapshot;
const failure: unknown = watch.error;
const ready: Promise<{ count: number }> = watch.readyAsync({ signal });
const refreshed: Promise<void> = watch.refreshAsync();

failures.dispose();

// A selected view is a part of the running watch, whose handlers' sender is the watch.
const view: DomqlSelectedView<number> = watch.select<number>('count');
const viewed: number | undefined = view.snapshot;
const viewStatus: 'pending' | 'ready' | 'failed' | 'disposed' = view.status;
const viewReady: Promise<number> = view.readyAsync({ signal });
const smaller: DomqlSelectedView<string> = watch.select('rows').select<string>(0, 'key');

view.subscribe('change', (sender, args) => {
    const owner: DomqlWatch = sender;

    return args.status === 'ready' ? [owner, args.value + 1] : args.error;
});
watch.dispose();

// @ts-expect-error A selected view belongs to the watch, which disposes it.
view.dispose();

// @ts-expect-error A watch raises change and error events.
watch.subscribe('changed', () => {});

// @ts-expect-error A change event is a result or a failure, so its value is read once its status is ready.
watch.subscribe('change', (sender, args) => args.value.count);

// @ts-expect-error An error event carries the failure alone.
watch.subscribe('error', (sender, args: DomqlResultArgs<{ count: number }>) => args);

// @ts-expect-error A snapshot watch keeps no live state.
watch.liveState;

// @ts-expect-error A watch is scheduled by frame or immediately.
query.watch({ schedule: 'later' });

// @ts-expect-error The update strategy of a watch is snapshots or live state.
query.watch({ updateStrategy: 'changeSet' });

// @ts-expect-error A watch's events reach the handlers subscribed to it.
query.watch({ onChange: () => {} });

// Live state is one object the watch keeps current, which the caller reads and never writes.
const living: DomqlLiveStateWatch<{ rows: { key: string }[] }> = domql.query<{ rows: { key: string }[] }>('{ rows = panel.children { key = it.attribute["data-key"] } }', { panel }).watch({
    updateStrategy: 'liveState',
    signal,
});

living.subscribe('change', (sender, args) => {
    const handle: DomqlLiveStateWatch<{ rows: { key: string }[] }> = sender;

    if (args.status === 'ready') {
        const first: string | undefined = args.liveState.rows[0]?.key;
        const brought: { rows: { key: string }[] } = args.snapshot;
        const applied: readonly DomqlChangeOperation[] = args.changes;

        // @ts-expect-error Live state is read-only to the caller that holds it.
        args.liveState.rows[0].key = 'changed';

        return [handle, first, brought, applied];
    }

    return args.error;
});
living.subscribe('error', (sender, args) => console.error(args.error));

const held: DomqlReadOnly<{ rows: { key: string }[] }> | undefined = living.liveState;
const livingSnapshot: { rows: { key: string }[] } | undefined = living.snapshot;
const livingReady: Promise<{ rows: { key: string }[] }> = living.readyAsync();
const livingRefreshed: Promise<void> = living.refreshAsync();

living.dispose();

// @ts-expect-error A live-state watch offers no selected views.
living.select('rows');

// The options of a watch, by their names.
const watching: DomqlWatchOptions = { schedule: 'immediate', signal };
const keeping: DomqlLiveStateWatchOptions = { updateStrategy: 'liveState', acceptPartialObservation: true };
const watchedAgain: DomqlWatch<{ count: number }> = query.watch(watching);
const keptAgain: DomqlLiveStateWatch<{ count: number }> = query.watch(keeping);

// A subscription's handler receives the event listener and each event's result, or the failure that produced none.
const clicks: DomqlEventListener = domql.query<{ x: number }>('panel.on("click") { x = it.clientX }', { panel }).subscribe((sender, args) => {
    const listener: DomqlEventListener = sender;

    return args.status === 'ready' ? [listener, args.value.x] : args.error;
}, { window, signal });
const operating: DomqlOperationOptions = { window, signal };
const keys: DomqlEventListener = domql.query<{ key: string }>('panel.on("keydown") { key = it.key }', { panel }).subscribe((sender, args) => args.status, operating);
const clicking: 'ready' | 'disposed' = clicks.status;

keys.dispose();

// @ts-expect-error A subscription takes the function that handles each event.
query.subscribe({});

// @ts-expect-error A failure of a subscription's event reaches its handler, so it takes no other.
query.subscribe(() => {}, { onError: () => {} });

// An event source is a host call making a subscription, whose implementation takes the function it delivers each event to, and answers what stops it.
const source: DomqlMemberDeclaration = {
    name: 'beats',
    kind: 'function',
    invokedBy: 'host',
    requestKind: 'subscription',
    target: 'Element',
    arguments: 'positional',
    parameters: [{ name: 'type', kind: 'value', type: 'String', required: true, fixed: true, selects: 'type', selector: 'event', nulls: 'propagate' }],
    result: '@selected',
    implementation: ({ receiver, deliver }) => {
        const element = receiver as Element;
        const timer = setInterval(() => deliver?.({ n: element.childElementCount }), 1000);

        return { stop: () => clearInterval(timer) };
    },
};

// A once execution is carried out and promises its result; a continuous execution runs until its handle is disposed.
const moved: Promise<boolean> = domql.query<boolean>('panel.step("forward")', { panel }).executeAsync({ window, signal });
const stepped: Promise<boolean> = domql.query<boolean>('panel.step("back")', { panel }).executeAsync();
const trap: DomqlExecutionHandle = domql.query('dialog.focusTrap()', { dialog: panel }).run({ window, signal });
const trapping: 'ready' | 'disposed' = trap.status;
const reported: DomqlEventListener = trap.subscribe('error', (sender, args) => {
    const execution: DomqlExecutionHandle = sender;

    return [execution, args.error];
}, { signal });

// An execution is a host call declaring its mode, a continuous one declaring no result.
const focusTrap: DomqlMemberDeclaration = {
    name: 'focusTrap',
    kind: 'function',
    invokedBy: 'host',
    requestKind: 'execution',
    executionMode: 'continuous',
    target: 'Element',
    implementation: ({ receiver, reportError }) => ({ update: () => {}, dispose: () => reportError?.(receiver) }),
};

// @ts-expect-error An execution runs once or continuously.
const looping: DomqlMemberDeclaration = { name: 'loop', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'forever' };

trap.update({ dialog: panel });
trap.dispose();

// @ts-expect-error An execution's handle is updated with bindings.
trap.update('dialog.focusTrap()');

// @ts-expect-error A query is bound again with bindings.
query.with('panel.children.count');

// @ts-expect-error An execution's handle raises error events alone.
trap.subscribe('change', () => {});

// A module declares its vocabulary as data, each declaration that runs code carrying its implementation.
const contents: DomqlModuleContents = {
    types: [{ name: 'ChildMetrics', fields: { childCount: 'Number' } }],
    members: [{
        name: 'metrics',
        kind: 'property',
        target: 'Element',
        result: 'ChildMetrics',
        updates: { changes: 'unobserved', reads: 'fresh', tolerance: 0.5 },
        implementation: ({ receiver }) => ({ childCount: (receiver as Element).children.length }),
    }, {
        // A test of its receiver is a function whose result is a Boolean, called as `it.metrics.charted()` or given to a verb, as `it.metrics.has(metrics.charted)`.
        name: 'charted',
        kind: 'function',
        target: 'ChildMetrics',
        result: 'Boolean',
        updates: { changes: 'constant', reads: 'fresh' },
        implementation: ({ receiver }) => (receiver as { childCount: number }).childCount > 0,
    }],
    selectableTypes: [{ name: 'chart-selected', selector: 'event', type: 'Number' }],
    observationTypes: [{ name: 'chartsChanged', contract: 'maintained', identity: ['root'], shared: true, implementation: ({ notify }) => ({ stop: () => notify(), sample: () => ({ pending: true }) }) }],
    // A conversion's implementation takes the value and the reject that stops it.
    conversions: [{ from: 'String', to: 'ChildMetrics', implementation: ({ value, reject }) => (typeof value === 'string' && /^[0-9]+$/.test(value) ? { childCount: Number(value) } : reject(`${String(value)} is no count`)) }],
};
const module: DomqlModule = domql.createModule('metrics', contents);

domql.registerModule(module);

// @ts-expect-error A module declares its tests as members, functions whose result is a Boolean, and no predicates.
domql.createModule('tests', { predicates: [] });

// @ts-expect-error A module is created from its contents alone, each declaration carrying its implementation.
domql.createModule('metrics', contents, {});

// @ts-expect-error A conversion names the type it converts to.
domql.createModule('partial', { conversions: [{ from: 'String', implementation: () => 0 }] });

// A conversion is a node of a definition, which names the type it converts to and what it converts.
const converted: DomqlDefinitionNode = { kind: 'conversion', type: 'Number', target: { kind: 'parameter', name: 'count' } };
const attempted: DomqlDefinitionNode = { kind: 'try', target: { kind: 'conversion', type: 'Number', target: { kind: 'parameter', name: 'count' } } };
const probed: DomqlDefinitionNode = { kind: 'try', target: { kind: 'cast', type: 'Element', target: { kind: 'parameter', name: 'node' } } };
const binding: DomqlDefinitionNode = { kind: 'conditional', binding: { name: 'n', value: attempted }, consequent: { kind: 'local', name: 'n' }, alternative: { kind: 'literal', value: 0 } };

// A named indexer is a syntax a member declares, and an indexer node of the member access its name is written in, which holds its key; an indexer node names nothing itself.
const keyed: DomqlDefinitionNode = { kind: 'indexer', target: { kind: 'member', target: { kind: 'parameter', name: 'panel' }, name: 'attribute' }, argument: { kind: 'literal', value: 'id' } };
// @ts-expect-error An indexer node has no name.
const namedIndexer: DomqlDefinitionNode = { kind: 'indexer', target: { kind: 'parameter', name: 'panel' }, name: 'attribute', argument: { kind: 'literal', value: 'id' } };
const booleanFunctions: DomqlModuleContents = {
    members: [{ name: 'lit', kind: 'function', target: 'Element', result: 'Boolean', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-lit'] }] } }],
};

const indexers: DomqlModuleContents = {
    members: [{ name: 'token', kind: 'function', syntax: 'indexer', target: 'Element', parameters: [{ name: 'name', kind: 'value', type: 'String', required: true, nulls: 'propagate' }], result: 'String?', updates: { changes: 'constant', reads: 'fresh' } }],
};

// A rejection never returns, so nothing follows it.
const rejected: never = ({} as DomqlConversionImplementationInput).reject('no count');

// @ts-expect-error A member is one of the kinds the language has.
domql.createModule('bad', { members: [{ name: 'bad', kind: 'method', target: 'Element', result: 'Number', updates: { changes: 'constant', reads: 'fresh' } }] });

// A failure is a LexicaError, which the package exports as a class.
try {
    domql.query('panel.nonsense', { panel }).evaluate();
} catch (error) {
    if (error instanceof LexicaError) {
        const failureKind: 'syntax' | 'structure' | 'validation' | 'module' | 'evaluation' = error.kind;
        const line: number | undefined = error.location.line;
        const name: 'LexicaError' = error.name;

        console.error(failureKind, line, name);
    }
}

// @ts-expect-error DOMQL makes its errors, so a caller constructs none.
new LexicaError();

// @ts-expect-error A query is made from text or a definition.
domql.query(42);

// @ts-expect-error A query object is made from text or a definition, never from another query object.
domql.query(query);

const tested = domql.query('panel.attached or panel == null', { panel }).definition.expression;

if (tested.kind === 'or') {
    const second: DomqlDefinitionNode = tested.operands[1];

    if (second.kind === 'equality') {
        const compared: DomqlDefinitionNode = second.right;
    }
}

// @ts-expect-error A predicate is no node: a test is a member that answers a Boolean, called or given to a verb.
const misread: DomqlDefinitionNode = { kind: 'predicate', verb: 'is', target: { kind: 'it' }, name: { kind: 'literal', value: null } };

const named: DomqlDefinitionNode = { kind: 'object', target: { kind: 'parameter', name: 'panel' }, locals: [{ name: 'size', value: { kind: 'member', target: { kind: 'it' }, name: 'size' } }], fields: [{ name: 'width', value: { kind: 'optionalChain', target: { kind: 'member', target: { kind: 'local', name: 'size' }, name: 'width', optional: true } } }] };

// @ts-expect-error An infixCall is no node: a function is a call or an indexer.
const infixCall: DomqlDefinitionNode = { kind: 'infixCall', target: { kind: 'it' }, name: 'matches' };

// @ts-expect-error A local is named, as a field is.
const unnamed: DomqlDefinitionNode = { kind: 'object', locals: [{ value: { kind: 'it' } }], fields: [] };

export { bound, version, specificationVersion, languageVersion, formatted, formattedText, kind, typeText, count, anything, waited, shorthand, selected, selectedAsync, selectedWatch, key, listening, status, snapshot, failure, ready, refreshed, viewed, viewStatus, viewReady, smaller, held, livingSnapshot, livingReady, livingRefreshed, watchedAgain, keptAgain, clicking, source, moved, stepped, trapping, reported };
