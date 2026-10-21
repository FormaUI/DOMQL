domql.query(`
    panel.all("[data-key]")
        .where(it.aria:["selected"] == "true")
        .count
`, { panel }).evaluate();
// 1
