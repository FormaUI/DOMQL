const resolved = domql.query('@panel.children.count', { panel: null }).resolve();

resolved.kind;            // 'query'
resolved.type.toString(); // 'number?'
