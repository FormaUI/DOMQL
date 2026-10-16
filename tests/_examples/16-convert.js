domql.query(
    '@panel.all("[data-key]").sum(self:["data-unread"] to "number" ?? 0)',
    { panel }
).evaluate();
// 7
