domql.query(
    '@panel.first(".missing") attributeOf "data-key"',
    { panel }
).evaluate();
// null
