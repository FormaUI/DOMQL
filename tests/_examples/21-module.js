const metricsModule = domql.createModule('metrics', {
    types: [{
        name: 'ChildMetrics',
        fields: { childCount: 'Number' }
    }],
    members: [{
        name: 'metrics',
        kind: 'property',
        target: 'Element',
        result: 'ChildMetrics',
        updates: { changes: 'unobserved', reads: 'fresh' },
        implementation: ({ receiver: element }) => ({ childCount: element.children.length })
    }]
});

domql.registerModule(metricsModule);

domql.query('panel.metrics { childCount = it.childCount }', { panel }).evaluate();
// { childCount: 3 }
