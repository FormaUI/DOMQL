domql.query(`
    @panel {
        count: self.children.count,
        attached: self.attached,
        children: self.hasChildren,
    }
`, { panel }).evaluate();
// { count: 3, attached: true, children: true }
