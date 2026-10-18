domql.query(`
    panel {
        let items = context.all("[data-key]"),

        count = items.count,
        tallest = items.max(context.rect?.height)
    }
`, { panel }).evaluate();
// { count: 3, tallest: 64 }
