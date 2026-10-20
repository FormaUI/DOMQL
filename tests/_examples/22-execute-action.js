domql.registerModule(domql.createModule('mark', {
    members: [{
        name: 'mark',
        kind: 'action',
        target: 'element',
        arguments: 'positional',
        parameters: [{ name: 'label', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
        result: 'boolean',
        implementation: ({ receiver: element, args: { label } }) => {
            const changed = element.dataset.mark !== label;

            element.dataset.mark = label;

            return changed;
        }
    }]
}));

await domql.query('panel.mark("reviewed")', { panel }).executeAsync();
// true
