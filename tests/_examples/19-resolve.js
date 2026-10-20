const resolved = domql.query('panel?.children.count', { panel: null }).resolve();

resolved.kind; // 'value'
resolved.type; // 'number?'
