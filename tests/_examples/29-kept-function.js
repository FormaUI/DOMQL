domql.registerModule(domql.createModule('Filters', {
    types: [{
        name: 'FilterElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'clickFilter',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'continuous',
            arguments: 'options',
            parameters: [{ name: 'when', kind: 'function', type: 'Boolean', parameterTypes: ['Domql.Element'] }],
            impl: ({ receiver: element, args, deliver }) => {
                let { when } = args;
                const filter = event => {
                    if (when(event.target)) {
                        deliver('filtered', event.target);
                    }
                };

                element.addEventListener('click', filter);

                return {
                    update: (target, next) => {
                        when = next.when;
                    },
                    dispose: () => element.removeEventListener('click', filter)
                };
            }
        }, {
            name: 'filtered',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'subscription',
            behavior: 'clickFilter',
            result: 'Domql.Element'
        }]
    }]
}));

const filtered = domql.query('import Filters\npanel:filtered() { key = it["data-key"] }', { panel }).subscribe((sender, args) => console.log(args.value));
const clickFilter = domql.query('import Filters\npanel:clickFilter({ when = it["data-unread"] != null })', { panel }).run();

panel.querySelector('[data-key="a3"]').click();
panel.querySelector('[data-key="a2"]').click();
// { key: 'a2' }

clickFilter.dispose();
filtered.dispose();
