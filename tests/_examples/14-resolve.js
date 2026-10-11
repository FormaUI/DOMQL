const resolved = Domql.resolve('@panel.children.count', {
    panel: Domql.bind(null, 'element?')
});

resolved.kind;            // 'query'
resolved.type.toString(); // 'number?'
