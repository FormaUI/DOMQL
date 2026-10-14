domql.registerModule(domql.createModule('mark', {
    members: [{
        name: 'mark',
        function: 'mark',
        kind: 'action',
        on: 'element',
        input: 'direct',
        parameters: [{ name: 'label', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
        result: 'boolean',
        changes: 'unobserved',
        reads: 'fresh'
    }]
}, {
    mark: (element, { label }) => {
        const changed = element.dataset.mark !== label;

        element.dataset.mark = label;

        return changed;
    }
}));

await domql.query('@panel.mark("reviewed")', { panel }).executeAsync();
// true
