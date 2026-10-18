domql.query(`
    panel {
        count = context.children.count,
        attached = context.attached,
        hasChildren = context.hasChildren
    }
`, { panel }).evaluate();
// { count: 3, attached: true, hasChildren: true }
