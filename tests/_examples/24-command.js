domql.registerModule(domql.createModule('Disclosures', {
    types: [{
        name: 'DisclosureElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'disclosure',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'continuous',
            impl: ({ receiver: element }) => ({
                open: () => element.toggleAttribute('data-open', true),
                update: () => {},
                dispose: () => element.removeAttribute('data-open')
            })
        }, {
            name: 'open',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'once',
            behavior: 'disclosure',
            result: 'Boolean',
            impl: ({ instance }) => instance.open()
        }]
    }]
}));

const disclosure = domql.query('import Disclosures\npanel:disclosure()', { panel }).run({ owner: 'menu' });

await domql.query('import Disclosures\npanel:open()', { panel }).executeAsync({ owner: 'menu' });
// true

disclosure.dispose();
