Domql.read(`
    @panel.all("[data-key]") {
        key: self attributeOf "data-key",
        selected: self matches "[aria-selected=true]"
    }
`, { panel });
// [
//   { key: 'a1', selected: false },
//   { key: 'a2', selected: true },
//   { key: 'a3', selected: false }
// ]
