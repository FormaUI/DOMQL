domql.query(`
    @panel {
        count: self.children.count,
        attached: self is "attached",
        children: self has "children",
    }
`, { panel }).evaluate();
// { count: 3, attached: true, children: true }
