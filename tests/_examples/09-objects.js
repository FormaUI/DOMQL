Domql.read(`
    @panel {
        count: self.children.count,
        attached: self is "attached",
        children: self has "children",
    }
`, { panel });
// { count: 3, attached: true, children: true }
