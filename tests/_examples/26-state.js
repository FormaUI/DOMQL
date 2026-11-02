domql.registerModule(domql.createModule('Clicks', {
    types: [{
        name: 'ClickElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'clickCounter',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'continuous',
            impl: ({ receiver: element, notify }) => {
                const counter = { count: 0, update: () => {}, dispose: () => element.removeEventListener('click', count) };
                const count = () => {
                    counter.count++;
                    notify();
                };

                element.addEventListener('click', count);

                return counter;
            }
        }, {
            name: 'clicks',
            kind: 'property',
            result: 'Number?',
            behavior: 'clickCounter',
            updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'behavior', of: 'receiver', behavior: 'clickCounter' }] },
            impl: ({ instance }) => instance?.count ?? null
        }]
    }]
}));

const clickCounter = domql.query('import Clicks\npanel:clickCounter()', { panel }).run();

panel.click();
domql.query('import Clicks\npanel:clicks', { panel }).evaluate();
// 1

clickCounter.dispose();
