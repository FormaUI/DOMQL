const optional = domql.query(`
    {
        panel = panel { size = context.size },
        ids = ids
    }
`, { panel: null, ids: [] });

optional.evaluate();
// { panel: null, ids: [] }
