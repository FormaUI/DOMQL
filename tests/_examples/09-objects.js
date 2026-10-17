domql.query(`
    panel {
        count: self.children.count,
        attached: self.attached,
        hasChildren: self.hasChildren
    }
`, { panel }).evaluate();
// { count: 3, attached: true, hasChildren: true }
