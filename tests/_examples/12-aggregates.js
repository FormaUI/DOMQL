domql.query(
    'panel.all("[data-key]").max(context.rect?.height)',
    { panel }
).evaluate();
// 64
