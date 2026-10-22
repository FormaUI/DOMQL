domql.query(`
    panel.all("[data-key]") {
        key = it["data-key"],
        selected = it.aria["selected"] == "true"
    }
`, { panel }).evaluate();
// [
//   { key: 'a1', selected: false },
//   { key: 'a2', selected: true },
//   { key: 'a3', selected: false }
// ]
