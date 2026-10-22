domql.registerModule(domql.createModule('mark', {
    members: [{
        name: 'mark',
        kind: 'function',
        invokedBy: 'host',
        requestKind: 'execution',
        executionMode: 'once',
        target: 'Element',
        arguments: 'positional',
        parameters: [{ name: 'label', kind: 'value', type: 'String', required: true, nulls: 'propagate' }],
        result: 'Boolean',
        implementation: ({ receiver: element, args: { label } }) => {
            const changed = element.dataset.mark !== label;

            element.dataset.mark = label;

            return changed;
        }
    }]
}));

await domql.query('panel.mark("reviewed")', { panel }).executeAsync();
// true
