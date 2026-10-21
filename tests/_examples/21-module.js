const metricsModule = domql.createModule('metrics', {
    types: [{
        name: 'childMetrics',
        fields: { childCount: 'number' }
    }],
    members: [{
        name: 'metrics',
        kind: 'property',
        target: 'element',
        result: 'childMetrics',
        updates: { changes: 'unobserved', reads: 'fresh' },
        implementation: ({ receiver: element }) => ({ childCount: element.children.length })
    }]
});

domql.registerModule(metricsModule);

domql.query('panel.metrics { childCount = it.childCount }', { panel }).evaluate();
// { childCount: 3 }
