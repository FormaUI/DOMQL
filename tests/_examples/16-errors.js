try {
    domql.query('@panel attributeOf 200', { panel }).evaluate();
} catch (error) {
    if (error?.name !== 'DomqlError') {
        throw error;
    }

    console.error(error.kind, error.message, error.location);
    // validation
    // The argument 'name' of 'attributeOf' expects string and finds number
    // (line 1, column 20, at /query/argument)
}
