domql.query(`
    panel {
        count = it.children.count,
        attached = it.attached,
        hasChildren = it.hasChildren
    }
`, { panel }).evaluate();
// { count: 3, attached: true, hasChildren: true }
