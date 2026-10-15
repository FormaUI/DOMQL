domql.query(
    '@panel.first("input")?.disabled ?? false',
    { panel }
).evaluate();
// false: the example panel has no input.
