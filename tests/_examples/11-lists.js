Domql.read(`
    @panel.all("[data-key]")
        .where(self matches "[aria-selected=true]")
        .count
`, { panel });
// 1

Domql.read('@panel.all("[data-key]").max(self.rect.height)', { panel });
// 64
