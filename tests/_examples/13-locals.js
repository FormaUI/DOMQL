domql.query(`
    panel {
        let items: self.all("[data-key]"),

        count: items.count,
        tallest: items.max(self.rect?.height)
    }
`, { panel }).evaluate();
// { count: 3, tallest: 64 }
