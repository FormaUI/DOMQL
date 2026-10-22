domql.query(
    'panel.all("[data-key]").sum(it["data-unread"] to Number ?? 0)',
    { panel }
).evaluate();
// 7
