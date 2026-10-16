domql.query(
    '@panel.first(".missing")?:attribute["data-key"]',
    { panel }
).evaluate();
// null
