domql.registerModule(domql.createModule('Marks', {
    types: [{
        name: 'MarkElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'mark',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'once',
            arguments: 'positional',
            parameters: [{ name: 'label', kind: 'value', type: 'String', required: true, nulls: 'propagate' }],
            result: 'Boolean',
            impl: ({ receiver: element, args: { label } }) => {
                const changed = element.dataset.mark !== label;

                element.dataset.mark = label;

                return changed;
            }
        }]
    }]
}));

await domql.executeAsync('import Marks\npanel:mark("reviewed")', { panel });
// true
