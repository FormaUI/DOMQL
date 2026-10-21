const optional = domql.query(`
    {
        panel = panel { size = it.size },
        ids = ids
    }
`, { panel: null, ids: [] });

optional.evaluate();
// { panel: null, ids: [] }
