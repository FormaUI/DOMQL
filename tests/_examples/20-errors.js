try {
    domql.query('panel[200]', { panel }).evaluate();
} catch (error) {
    if (error?.name !== 'LexicaError') {
        throw error;
    }

    console.error(error.kind, error.message, error.location);
    // validation
    // The argument 'name' of 'attribute' expects String and finds Number
    // (line 1, column 7, at /expression/argument)
}
