try {
    domql.query('panel[200]', { panel }).evaluate();
} catch (error) {
    if (error?.name !== 'NexoError') {
        throw error;
    }

    console.error(error.code, error.kind, error.message, error.location);
    // NEXO3042
    // validation
    // The argument 'name' of '[…]' expects String and finds Number
    // (line 1, column 7, at /expression/argument)
}
