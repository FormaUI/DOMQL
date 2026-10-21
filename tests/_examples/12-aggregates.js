domql.query(
    'panel.all("[data-key]").max(it.rect?.height)',
    { panel }
).evaluate();
// 64
