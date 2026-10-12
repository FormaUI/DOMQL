Domql.read(`
    @panel {
        count: children.count,
        attached: is "attached",
        children: has "children",
    }
`, { panel });
// { count: 3, attached: true, children: true }
