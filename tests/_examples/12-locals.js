Domql.read(`
    @panel {
        let items: self.all("[data-key]"),
        count: items.count,
        tallest: items.max(self.rect.height)
    }
`, { panel });
// { count: 3, tallest: 64 }
