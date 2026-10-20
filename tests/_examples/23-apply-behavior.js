domql.registerModule(domql.createModule('highlight', {
    members: [{
        name: 'highlight',
        kind: 'behavior',
        target: 'element',
        arguments: 'positional',
        parameters: [{ name: 'color', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
        result: 'null',
        implementation: ({ receiver: element, args: { color } }) => {
            let current = element;

            current.dataset.highlight = color;

            return {
                update: (target, { color: next }) => {
                    delete current.dataset.highlight;
                    current = target;
                    current.dataset.highlight = next;
                },
                dispose: () => delete current.dataset.highlight
            };
        }
    }]
}));

const highlight = domql.query('panel.highlight(color)', { panel, color: 'gold' }).apply();
console.log(panel.dataset.highlight);
// 'gold'

highlight.update({ panel, color: 'teal' });
console.log(panel.dataset.highlight);
// 'teal'

highlight.dispose();
console.log(panel.dataset.highlight);
// undefined
