domql.query(`
    panel {
        let items = it.all("[data-key]"),

        count = items.count,
        tallest = items.max(it.rect?.height)
    }
`, { panel }).evaluate();
// { count: 3, tallest: 64 }
