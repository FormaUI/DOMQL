domql.query(`
    panel.all("[data-key]") {
        key: self:["data-key"],
        selected: self.aria:["selected"] == "true"
    }
`, { panel }).evaluate();
// [
//   { key: 'a1', selected: false },
//   { key: 'a2', selected: true },
//   { key: 'a3', selected: false }
// ]
