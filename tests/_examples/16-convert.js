domql.query(
    'panel.all("[data-key]").sum(it:["data-unread"] to number ?? 0)',
    { panel }
).evaluate();
// 7
