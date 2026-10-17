domql.query(`
    panel.all("[data-key]")
        .where(self.aria:["selected"] == "true")
        .count
`, { panel }).evaluate();
// 1
