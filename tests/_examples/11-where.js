domql.query(`
    panel.all("[data-key]")
        .where(context.aria:["selected"] == "true")
        .count
`, { panel }).evaluate();
// 1
