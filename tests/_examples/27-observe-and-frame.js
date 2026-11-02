domql.registerModule(domql.createModule('Counts', {
    types: [{
        name: 'CountElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'childCount',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'continuous',
            impl: ({ receiver: element, env }) => {
                let frame = null;
                const write = () => {
                    frame = null;
                    element.dataset.count = String(element.children.length);
                };
                const children = env.observe({ type: 'mutation', target: element, childList: true }, () => {
                    frame ??= env.frame(write);
                });

                write();

                return {
                    update: () => {},
                    dispose: () => {
                        children.stop();
                        frame?.cancel();
                    }
                };
            }
        }]
    }]
}));

const childCount = domql.query('import Counts\npanel:childCount()', { panel }).run();

panel.append(document.createElement('div'));

// For this example only: wait for the next frame to be painted.
await new Promise(resolve => setTimeout(resolve, 50));
console.log(panel.dataset.count);
// '4'

childCount.dispose();
