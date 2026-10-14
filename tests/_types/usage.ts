// How a TypeScript caller uses DOMQL, which the declarations must accept; the test compiles this file.
import { domql, DomqlError } from '../../src/domql.js';
import type { DomqlBehavior, DomqlChangeOperation, DomqlDefinition, DomqlDefinitionNode, DomqlEvaluateAsyncOptions, DomqlEventListener, DomqlLiveStateWatch, DomqlLiveStateWatchOptions, DomqlModule, DomqlModuleContents, DomqlModuleFunctions, DomqlOperationOptions, DomqlPredicateName, DomqlQuery, DomqlReadOnly, DomqlResolvedDefinition, DomqlResultArgs, DomqlSelectedView, DomqlSelection, DomqlWatch, DomqlWatchOptions } from '../../src/domql.js';

const panel = document.createElement('div');
const controller = new AbortController();
const signal = controller.signal;

// A query object is made from text or a definition, and bound again by `with`.
const query: DomqlQuery<{ count: number }> = domql.query<{ count: number }>('@panel { count: self.children.count }', { panel });
const optional = domql.query('@panel { size: self.size }', { panel: null, ids: [] });
const definition: DomqlDefinition = query.definition;
const created: DomqlQuery<{ count: number }> = domql.query<{ count: number }>(definition, { panel });
const rebound: DomqlQuery<{ count: number }> = query.with({ panel: document.body });
const bound: boolean = rebound.bindings.has('panel');
const version: string = domql.info.version;
const specificationVersion: string = domql.info.specificationVersion;
const formatted: string = domql.format(query);
const formattedText: string = domql.format(domql.format(definition));

// @ts-expect-error A request is formatted from its text, its definition or a query object.
domql.format(42);

const resolved: DomqlResolvedDefinition = created.resolve({ watch: true, acceptPartialObservation: true });
const kind: 'query' | 'subscription' | 'action' | 'behavior' = resolved.kind;
const typeText: string = resolved.type.toString();

// A query is evaluated once, synchronously or waiting for its maintained members.
const answer = query.evaluate();
const count: number = answer.count;
const anything: unknown = optional.evaluate({ window });
const waited: Promise<{ count: number }> = query.evaluateAsync({ window, signal });
const evaluating: DomqlEvaluateAsyncOptions = { window, signal };
const shorthand: number = domql.query<number>('@panel.children.count', { panel }).evaluate();

// A selection is a part of the query's result, every operation on it carried out on the whole query.
const selection: DomqlSelection<number> = query.select<number>('count');
const selected: number = selection.evaluate({ window });
const selectedAsync: Promise<number> = selection.evaluateAsync(evaluating);
const selectedWatch: DomqlWatch<number> = selection.watch({ schedule: 'immediate' });
const key: DomqlSelection<string> = domql.query('@panel.children { key: self attributeOf "data-key" }', { panel }).select('items').select<string>(0, 'key');

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
const living: DomqlLiveStateWatch<{ rows: { key: string }[] }> = domql.query<{ rows: { key: string }[] }>('{ rows: @panel.children { key: self attributeOf "data-key" } }', { panel }).watch({
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
const clicks: DomqlEventListener = domql.query<{ x: number }>('(@panel eventsOf "click") { x: self.clientX }', { panel }).subscribe((sender, args) => {
    const listener: DomqlEventListener = sender;

    return args.status === 'ready' ? [listener, args.value.x] : args.error;
}, { window, signal });
const operating: DomqlOperationOptions = { window, signal };
const keys: DomqlEventListener = domql.query<{ key: string }>('(@panel eventsOf "keydown") { key: self.key }', { panel }).subscribe((sender, args) => args.status, operating);
const clicking: 'ready' | 'disposed' = clicks.status;

keys.dispose();

// @ts-expect-error A subscription takes the function that handles each event.
query.subscribe({});

// @ts-expect-error A failure of a subscription's event reaches its handler, so it takes no other.
query.subscribe(() => {}, { onError: () => {} });

// A source takes the function it delivers each event to, and answers what stops it.
const sourceFunctions: DomqlModuleFunctions = {
    beats: (element: Element, _args: Record<string, unknown>, _environment: { window: Window }, deliver: (event: unknown) => void) => {
        const timer = setInterval(() => deliver({ n: element.childElementCount }), 1000);

        return { stop: () => clearInterval(timer) };
    },
};

// An action is executed once and promises its result; a behavior is in effect until its handle is disposed.
const moved: Promise<boolean> = domql.query<boolean>('@panel.step("forward")', { panel }).executeAsync({ window, signal });
const stepped: Promise<boolean> = domql.query<boolean>('@panel.step("back")', { panel }).executeAsync();
const trap: DomqlBehavior = domql.query('@dialog.focusTrap()', { dialog: panel }).apply({ window, signal });
const trapping: 'ready' | 'disposed' = trap.status;
const reported: DomqlEventListener = trap.subscribe('error', (sender, args) => {
    const behavior: DomqlBehavior = sender;

    return [behavior, args.error];
}, { signal });

trap.update({ dialog: panel });
trap.dispose();

// @ts-expect-error A behavior's handle is updated with bindings.
trap.update('@dialog.focusTrap()');

// @ts-expect-error A query is bound again with bindings.
query.with('@panel.children.count');

// @ts-expect-error A behavior raises error events alone.
trap.subscribe('change', () => {});

// A module declares its vocabulary as data, beside the functions that carry it out.
const contents: DomqlModuleContents = {
    types: [{ name: 'childMetrics', fields: { childCount: 'number' } }],
    members: [{ name: 'metrics', function: 'readMetrics', kind: 'property', on: 'element', parameters: [], result: 'childMetrics', changes: 'unobserved', reads: 'fresh', tolerance: 0.5 }],
    eventTypes: [{ name: 'chart-selected', payload: 'number' }],
    predicates: [{ verb: 'is', name: 'plotted', function: 'isPlotted', on: 'element', changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: true }] }],
    features: ['share'],
    observationTypes: [{ name: 'chartsChanged', contract: 'maintained', identity: ['root'], shared: true, function: 'observeCharts' }],
};
const functions: DomqlModuleFunctions = {
    readMetrics: (element: Element) => ({ childCount: element.children.length }),
    isPlotted: () => true,
};
const module: DomqlModule = domql.createModule('metrics', contents, functions);

domql.registerModule(module);

// @ts-expect-error A member is one of the kinds the language has.
domql.createModule('bad', { members: [{ name: 'bad', function: 'bad', kind: 'method', on: 'element', result: 'number', changes: 'constant', reads: 'fresh' }] });

// A failure is a DomqlError, which the package exports as a class.
try {
    domql.query('@panel.nonsense', { panel }).evaluate();
} catch (error) {
    if (error instanceof DomqlError) {
        const failureKind: 'syntax' | 'structure' | 'validation' | 'module' | 'evaluation' = error.kind;
        const line: number | undefined = error.location.line;
        const name: 'DomqlError' = error.name;

        console.error(failureKind, line, name);
    }
}

// @ts-expect-error DOMQL makes its errors, so a caller constructs none.
new DomqlError();

// @ts-expect-error A query is made from text or a definition.
domql.query(42);

// @ts-expect-error A query object is made from text or a definition, never from another query object.
domql.query(query);

const tested = domql.query('@panel is "attached" or @panel is "focused"', { panel }).definition.query;

if (tested.kind === 'or') {
    const first: DomqlDefinitionNode = tested.operands[0];

    if (first.kind === 'predicate') {
        const verb: 'is' | 'has' = first.verb;
        const name: DomqlPredicateName = first.name;
    }
}

// @ts-expect-error A predicate expression reads its predicate under is or has.
const misread: DomqlDefinitionNode = { kind: 'predicate', verb: 'was', name: { kind: 'literal', value: 'attached' } };

const named: DomqlDefinitionNode = { kind: 'object', target: { kind: 'parameter', name: 'panel' }, locals: [{ name: 'size', value: { kind: 'member', target: { kind: 'self' }, name: 'size' } }], fields: [{ name: 'width', value: { kind: 'optionalChain', target: { kind: 'member', target: { kind: 'local', name: 'size' }, name: 'width', optional: true } } }] };

// @ts-expect-error An infix call applies its receiver's null policy, and is never optional.
const optionalOperation: DomqlDefinitionNode = { kind: 'infixCall', target: { kind: 'self' }, name: 'attributeOf', optional: true };

// @ts-expect-error A local is named, as a field is.
const unnamed: DomqlDefinitionNode = { kind: 'object', locals: [{ value: { kind: 'self' } }], fields: [] };

export { bound, version, specificationVersion, formatted, formattedText, kind, typeText, count, anything, waited, shorthand, selected, selectedAsync, selectedWatch, key, listening, status, snapshot, failure, ready, refreshed, viewed, viewStatus, viewReady, smaller, held, livingSnapshot, livingReady, livingRefreshed, watchedAgain, keptAgain, clicking, sourceFunctions, moved, stepped, trapping, reported };
