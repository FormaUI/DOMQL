domql.query(
    '@panel.first("input")?.is("disabled") ?? false',
    { panel }
).evaluate();
// false: the example panel has no input.
