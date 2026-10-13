const resolved = Domql.resolve('@panel.children.count', { panel: null });

resolved.kind;            // 'query'
resolved.type.toString(); // 'number?'
