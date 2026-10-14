domql.query(`
    @panel.all("[data-key]")
        .where(self matches "[aria-selected=true]")
        .count
`, { panel }).evaluate();
// 1

domql.query('@panel.all("[data-key]").max(self.rect.height)', { panel }).evaluate();
// 64
