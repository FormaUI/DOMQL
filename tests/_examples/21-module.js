const metricsModule = domql.createModule('Metrics', {
    types: [{
        name: 'ChildMetrics',
        kind: 'structured',
        members: [{ name: 'childCount', kind: 'property', result: 'Number' }]
    }, {
        name: 'MetricElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'metrics',
            kind: 'property',
            result: 'ChildMetrics',
            updates: { changes: 'unobserved', reads: 'fresh' },
            impl: ({ receiver: element }) => ({ childCount: element.children.length })
        }]
    }]
});

domql.registerModule(metricsModule);

domql.query('import Metrics\npanel:metrics { childCount = it.childCount }', { panel }).evaluate();
// { childCount: 3 }
