// How a TypeScript caller uses DOMQL, which the declarations must accept; the test compiles this file.
import { domql, NexoError } from '../../src/domql.js';
import type { DomqlChangeOperation, DomqlOperatorImplementationInput, DomqlTypeDeclaration, DomqlDefinition, DomqlDefinitionNode, DomqlEvaluateAsyncOptions, DomqlEventListener, DomqlExecutionHandle, DomqlLiveStateWatch, DomqlLiveStateWatchOptions, DomqlMemberDeclaration, DomqlModule, DomqlModuleContents, DomqlOperationOptions, DomqlQuery, DomqlReadOnly, DomqlResolvedDefinition, DomqlResultArgs, DomqlSelectedView, DomqlSelection, DomqlWatch, DomqlWatchOptions } from '../../src/domql.js';

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
const usedNames: readonly string[] = resolved.usedDeclarations.map(used => used.qualifiedName);

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
    arguments: 'positional',
    parameters: [{ name: 'type', kind: 'value', type: 'String', required: true, fixed: true, selects: 'type', selector: 'event', nulls: 'propagate' }],
    result: '@selected',
    impl: ({ receiver, deliver }) => {
        const element = receiver as Element;
        const timer = setInterval(() => deliver?.({ n: element.childElementCount }), 1000);

        return { stop: () => clearInterval(timer) };
    },
};

// A once execution is carried out and promises its result; a continuous execution runs until its handle is disposed.
const moved: Promise<boolean> = domql.query<boolean>('import Steps\npanel:step("forward")', { panel }).executeAsync({ window, signal });
const stepped: Promise<boolean> = domql.query<boolean>('import Steps\npanel:step("back")', { panel }).executeAsync();
const trap: DomqlExecutionHandle = domql.query('import Traps\ndialog:focusTrap()', { dialog: panel }).run({ window, signal });
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
    impl: ({ receiver, reportError }) => ({ update: () => {}, dispose: () => reportError?.(receiver) }),
};

// @ts-expect-error An execution runs once or continuously.
const looping: DomqlMemberDeclaration = { name: 'loop', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'forever' };

// A command names the behavior whose running instance it reaches, which its implementation receives beside the environment's owner.
const release: DomqlMemberDeclaration = {
    name: 'release',
    kind: 'function',
    invokedBy: 'host',
    requestKind: 'execution',
    executionMode: 'once',
    behavior: 'focusTrap',
    result: 'Boolean',
    impl: ({ instance, env }) => {
        const owner: unknown = env.owner;
        const document: Document = env.document;

        return instance.release(owner, document);
    },
};

// Every operation is carried out for an owner, any value.
const owned: DomqlExecutionHandle = domql.query('import Traps\ndialog:focusTrap()', { dialog: panel }).run({ owner: { component: 7 } });
const released: Promise<boolean> = domql.query<boolean>('import Traps\ndialog:release()', { dialog: panel }).executeAsync({ owner: 'menu' });
const ownedCount: number = domql.query<number>('panel.children.count', { panel }).evaluate({ owner: 'menu' });
const ownedWatch: DomqlWatch<number> = domql.query<number>('panel.children.count', { panel }).watch({ owner: 'menu' });

// @ts-expect-error A command names its behavior by its name.
const unnamedBehavior: DomqlMemberDeclaration = { name: 'release', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', behavior: true };

trap.update({ dialog: panel });
trap.dispose();

// @ts-expect-error An execution's handle is updated with bindings.
trap.update('import Traps\ndialog:focusTrap()');

// @ts-expect-error A query is bound again with bindings.
query.with('panel.children.count');

// @ts-expect-error An execution's handle raises error events alone.
trap.subscribe('change', () => {});

// A module declares its vocabulary as data, each declaration that runs code carrying its implementation: its own types, and extensions of DOMQL's, whose members a query reads with `:`.
const contents: DomqlModuleContents = {
    types: [{
        name: 'ChildMetrics',
        kind: 'structured',
        members: [{ name: 'childCount', kind: 'property', result: 'Number' }, {
            // A test of its receiver is a function whose result is a Boolean, called as `it:metrics.charted()`.
            name: 'charted',
            kind: 'function',
            result: 'Boolean',
            updates: { changes: 'constant', reads: 'fresh' },
            impl: ({ receiver }) => (receiver as { childCount: number }).childCount > 0,
        }],
    }, {
        name: 'MetricElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'metrics',
            kind: 'property',
            result: 'ChildMetrics',
            updates: { changes: 'unobserved', reads: 'fresh', tolerance: 0.5 },
            impl: ({ receiver }) => ({ childCount: (receiver as Element).children.length }),
        }, source, focusTrap],
    }, {
        // An operator's implementation takes the value and the reject that stops it.
        name: 'MetricStrings',
        kind: 'extension',
        target: 'String',
        members: [{ kind: 'operator', name: 'convert', result: 'ChildMetrics', impl: ({ value, reject }) => (typeof value === 'string' && /^[0-9]+$/.test(value) ? { childCount: Number(value) } : reject(`${String(value)} is no count`)) }],
    }],
    mappings: [{ selector: 'event', key: 'chart-selected', type: 'Number' }],
    observationTypes: [{ name: 'chartsChanged', contract: 'maintained', identity: ['root'], shared: true, impl: ({ notify }) => ({ stop: () => notify(), sample: () => ({ pending: true }) }) }],
};
const module: DomqlModule = domql.createModule('Metrics', contents);
const declaredType: DomqlTypeDeclaration = module.types[0];

domql.registerModule(module);

// A reference type of a module's own recognizes its values, as its module's typeOf does.
const lamps: DomqlModuleContents = {
    typeOf: value => (value instanceof HTMLButtonElement ? 'Lamp' : null),
    types: [{ name: 'Lamp', kind: 'reference', isInstance: value => value instanceof HTMLButtonElement, members: [] }],
};

// @ts-expect-error A module declares its tests as members, functions whose result is a Boolean, and no predicates.
domql.createModule('Tests', { predicates: [] });

// @ts-expect-error A module is created from its contents alone, each declaration carrying its implementation.
domql.createModule('Metrics', contents, {});

// @ts-expect-error A reference type says whether a value belongs to it.
domql.createModule('Partial', { types: [{ name: 'Lamp', kind: 'reference' }] });

// @ts-expect-error A member stands within a type or an extension, which gives it its receiver, so it names no target.
domql.createModule('Targeted', { members: [{ name: 'lit', kind: 'property', target: 'Element', result: 'Boolean' }] });

// A conversion is a node of a definition, which names the type it converts to and what it converts.
const converted: DomqlDefinitionNode = { kind: 'conversion', type: 'Number', operand: { kind: 'scriptParameter', name: 'count' } };
const attempted: DomqlDefinitionNode = { kind: 'try', operand: { kind: 'conversion', type: 'Number', operand: { kind: 'scriptParameter', name: 'count' } } };
const probed: DomqlDefinitionNode = { kind: 'try', operand: { kind: 'cast', type: 'Element', operand: { kind: 'scriptParameter', name: 'node' } } };
const binding: DomqlDefinitionNode = { kind: 'conditional', binding: { name: 'n', value: attempted }, consequent: { kind: 'local', name: 'n' }, alternative: { kind: 'literal', value: 0 } };

// A named indexer is a member of its own kind, and an indexer access of the member access its name is written in, which holds its key; an indexer access names nothing itself.
const keyed: DomqlDefinitionNode = { kind: 'indexerAccess', receiver: { kind: 'memberAccess', receiver: { kind: 'scriptParameter', name: 'panel' }, name: 'style' }, argument: { kind: 'literal', value: 'color' } };
// @ts-expect-error An indexer access has no name.
const namedIndexer: DomqlDefinitionNode = { kind: 'indexerAccess', receiver: { kind: 'scriptParameter', name: 'panel' }, name: 'style', argument: { kind: 'literal', value: 'color' } };
const booleanFunctions: DomqlModuleContents = {
    types: [{ name: 'LitElements', kind: 'extension', target: 'Domql.Element', members: [{ name: 'lit', kind: 'function', result: 'Boolean', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-lit'] }] } }] }],
};

const indexers: DomqlModuleContents = {
    types: [{ name: 'TokenElements', kind: 'extension', target: 'Domql.Element', members: [{ name: 'token', kind: 'indexer', parameters: [{ name: 'name', kind: 'value', type: 'String', required: true, nulls: 'propagate' }], result: 'String?', updates: { changes: 'constant', reads: 'fresh' } }] }],
};

// A rejection never returns, so nothing follows it.
const rejected: never = ({} as DomqlOperatorImplementationInput).reject('no count');

// @ts-expect-error A member is one of the kinds the language has.
domql.createModule('Bad', { members: [{ name: 'bad', kind: 'method', result: 'Number', updates: { changes: 'constant', reads: 'fresh' } }] });

// A failure is a NexoError, which the package exports as a class.
try {
    domql.query('panel.nonsense', { panel }).evaluate();
} catch (error) {
    if (error instanceof NexoError) {
        const failureKind: 'syntax' | 'structure' | 'validation' | 'module' | 'evaluation' = error.kind;
        const code: string = error.code;
        const line: number | undefined = error.location.line;
        const name: 'NexoError' = error.name;

        console.error(failureKind, code, line, name);
    }
}

// @ts-expect-error A caller constructs no NexoError directly.
new NexoError();

// A module's implementation builds a failure of its own through the factory of its kind.
const chartRefusal: NexoError = NexoError.module('CHARTS4001', 'A chart declares its axes', { module: 'Charts', declaration: 'chart' });
const chartFailure: NexoError = NexoError.evaluation('CHARTS5001', 'The chart could not be measured', {}, { cause: chartRefusal });

console.error(chartRefusal.kind, chartFailure.code);

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

// @ts-expect-error A predicate is no node: a test is a member that answers a Boolean, read or called as any member is.
const misread: DomqlDefinitionNode = { kind: 'predicate', verb: 'is', receiver: { kind: 'it' }, name: { kind: 'literal', value: null } };

const named: DomqlDefinitionNode = { kind: 'object', context: { kind: 'scriptParameter', name: 'panel' }, locals: [{ name: 'size', value: { kind: 'memberAccess', receiver: { kind: 'it' }, name: 'size' } }], objectFields: [{ name: 'width', value: { kind: 'optionalChain', chain: { kind: 'memberAccess', receiver: { kind: 'local', name: 'size' }, name: 'width', optional: true } } }] };

// @ts-expect-error An infixCall is no node: a function is a call or an indexer.
const infixCall: DomqlDefinitionNode = { kind: 'infixCall', receiver: { kind: 'it' }, name: 'matches' };

// @ts-expect-error A local is named, as an object field is.
const unnamed: DomqlDefinitionNode = { kind: 'object', locals: [{ value: { kind: 'it' } }], objectFields: [] };

// A collection expression writes a list or a dictionary, and a position counts from a list's end.
const listed: DomqlDefinitionNode = { kind: 'list', items: [{ kind: 'literal', value: 1 }] };
const last: DomqlDefinitionNode = { kind: 'indexerAccess', receiver: { kind: 'local', name: 'rows' }, argument: { kind: 'fromEndIndex', offset: { kind: 'literal', value: 1 } } };
const imported: DomqlDefinition = { version: 38, imports: [{ module: 'Domql' }], expression: { kind: 'memberAccess', receiver: { kind: 'namespace', name: 'Domql' }, name: 'document' } };

export { release, owned, released, ownedCount, ownedWatch, bound, version, specificationVersion, languageVersion, formatted, formattedText, kind, typeText, count, anything, waited, shorthand, selected, selectedAsync, selectedWatch, key, listening, status, snapshot, failure, ready, refreshed, viewed, viewStatus, viewReady, smaller, held, livingSnapshot, livingReady, livingRefreshed, watchedAgain, keptAgain, clicking, source, moved, stepped, trapping, reported };
