domql.query(
    'panel.all("[data-key]").sum(context:["data-unread"] to "number" ?? 0)',
    { panel }
).evaluate();
// 7
