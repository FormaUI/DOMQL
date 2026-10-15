const optional = domql.query(`
    {
        panel: @panel { size: self.size },
        ids: @ids
    }
`, { panel: null, ids: [] });

optional.evaluate();
// { panel: null, ids: [] }
