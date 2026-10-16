try {
    domql.query('@panel:[200]', { panel }).evaluate();
} catch (error) {
    if (error?.name !== 'DomqlError') {
        throw error;
    }

    console.error(error.kind, error.message, error.location);
    // validation
    // The argument 'name' of 'attribute' expects string and finds number
    // (line 1, column 9, at /query/argument)
}
