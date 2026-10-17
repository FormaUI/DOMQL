domql.query(
    'panel.all("[data-key]").max(self.rect?.height)',
    { panel }
).evaluate();
// 64
