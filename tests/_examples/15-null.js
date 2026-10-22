domql.query(
    'panel.first(".missing")?["data-key"]',
    { panel }
).evaluate();
// null
