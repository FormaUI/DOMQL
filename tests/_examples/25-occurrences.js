domql.registerModule(domql.createModule('Pickers', {
    types: [{
        name: 'PickerElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'picker',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'continuous',
            impl: ({ receiver: element, deliver }) => {
                const pick = event => deliver('picks', event.target);

                element.addEventListener('click', pick);

                return {
                    update: () => {},
                    dispose: () => element.removeEventListener('click', pick)
                };
            }
        }, {
            name: 'picks',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'subscription',
            behavior: 'picker',
            result: 'Domql.Element'
        }]
    }]
}));

const picks = domql.query('import Pickers\npanel:picks() { key = it["data-key"] }', { panel }).subscribe((sender, args) => console.log(args.value));
const picker = domql.query('import Pickers\npanel:picker()', { panel }).run();

panel.querySelector('[data-key="a3"]').click();
// { key: 'a3' }

picker.dispose();
picks.dispose();
