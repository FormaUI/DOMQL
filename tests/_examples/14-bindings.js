const optional = Domql.parse(`
    {
        panel: @panel { size: self.size },
        ids: @ids
    }
`, { panel: null, ids: [] });

Domql.read(optional);
// { panel: null, ids: [] }
