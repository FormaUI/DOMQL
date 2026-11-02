domql.registerModuleLoader('Unread', async () => domql.createModule('Unread', {
    types: [{
        name: 'UnreadElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'unread',
            kind: 'property',
            result: 'Number',
            updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-unread'] }] },
            impl: ({ receiver: element }) => Number(element.getAttribute('data-unread') ?? 0)
        }]
    }]
}));

const unread = domql.query('import Unread\npanel.children.sum(it:unread)', { panel });

await domql.loadModulesAsync(unread);
unread.evaluate();
// 7
