const layersByDocument = new WeakMap();
const layersOf = page => {
    let layers = layersByDocument.get(page);

    if (layers === undefined) {
        layers = [];
        layersByDocument.set(page, layers);
    }

    return layers;
};

domql.registerModule(domql.createModule('Layers', {
    types: [{
        name: 'LayerElements',
        kind: 'extension',
        target: 'Domql.Element',
        members: [{
            name: 'layer',
            kind: 'function',
            invokedBy: 'host',
            requestKind: 'execution',
            executionMode: 'continuous',
            impl: ({ receiver: element, env }) => {
                const layers = layersOf(env.document);

                layers.push(element);

                return {
                    update: () => {},
                    dispose: () => layers.splice(layers.indexOf(element), 1)
                };
            }
        }]
    }, {
        name: 'LayerDocuments',
        kind: 'extension',
        target: 'Domql.Document',
        members: [{
            name: 'layerCount',
            kind: 'property',
            result: 'Number',
            updates: { changes: 'unobserved', reads: 'fresh' },
            impl: ({ receiver: page }) => layersOf(page).length
        }]
    }]
}));

const layer = domql.query('import Layers\npanel:layer()', { panel }).run();

domql.query('import Layers\nDomql.document:layerCount').evaluate();
// 1

layer.dispose();
