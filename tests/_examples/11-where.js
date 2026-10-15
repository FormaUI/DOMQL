domql.query(`
    @panel.all("[data-key]")
        .where(self matches "[aria-selected=true]")
        .count
`, { panel }).evaluate();
// 1
