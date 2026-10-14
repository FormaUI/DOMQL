import { bench, describe } from 'vitest';
import { domql } from '#domql/domql.js';

/** How many rows a table holds. */
const ROWS = 1000;

/** The row the workloads that change one row change. */
const CHANGED = ROWS / 2;

/** Each row as data: its key, whether it is selected, and its box. */
const ROWS_TEXT = '@table.all("tr") { key: self attributeOf "data-key", selected: self matches ".selected", box: self.rect { width: self.width, height: self.height } }';

/** Each row as data again, its fields reading locals and choosing by conditionals. */
const LOCALS_TEXT = '@table.all("tr") { let key: self attributeOf "data-key", let box: self.rect, key: key, state: if self matches ".selected" then "selected" else "plain", width: box.width, height: if key is null then 0 else box.height }';

/** A table of rows, in the document, each with a key. */
const createTable = () => {
    const table = document.createElement('table');
    const body = document.createElement('tbody');

    for (let index = 0; index < ROWS; index++) {
        const row = document.createElement('tr');

        row.setAttribute('data-key', `r${index}`);
        row.className = index % 7 === 0 ? 'selected' : '';
        body.append(row);
    }

    table.append(body);
    document.body.append(table);

    return table;
};

// A watch is refreshed by the workload alone, so no frame evaluates it between iterations.
window.requestAnimationFrame = () => 1;
window.cancelAnimationFrame = () => {};

describe('evaluate', () => {
    const table = createTable();
    const panel = document.createElement('div');

    panel.setAttribute('data-key', 'panel');
    document.body.append(panel);

    const rows = domql.query(ROWS_TEXT, { table });
    const locals = domql.query(LOCALS_TEXT, { table });
    const small = domql.query('@panel { key: self attributeOf "data-key", open: self matches ".open", count: self.children.count }', { panel });

    bench(`a list of ${ROWS} rows, each shaped`, () => {
        rows.evaluate();
    });

    bench(`a list of ${ROWS} rows, each shaped through locals and conditionals`, () => {
        locals.evaluate();
    });

    bench('a small object, as a query', () => {
        small.evaluate();
    });

    bench('a small object, from its text and bindings', () => {
        domql.query('@panel { key: self attributeOf "data-key", open: self matches ".open", count: self.children.count }', { panel }).evaluate();
    });
});

describe(`a watch of ${ROWS} rows, refreshed`, () => {
    /** A watch of a table of its own, and the table's row that changes. */
    const createWatch = (updateStrategy, text = ROWS_TEXT) => {
        const table = createTable();
        const watch = domql.query(text, { table }).watch({
            updateStrategy,
            acceptPartialObservation: true,
        });

        watch.subscribe('change', () => {});

        return { watch, row: table.querySelectorAll('tr')[CHANGED] };
    };

    const unchanged = createWatch('snapshot');
    const snapshots = createWatch('snapshot');
    const liveState = createWatch('liveState');
    const locals = createWatch('snapshot', LOCALS_TEXT);

    bench('unchanged', async () => {
        await unchanged.watch.refreshAsync();
    });

    bench('unchanged, its rows shaped through locals and conditionals', async () => {
        await locals.watch.refreshAsync();
    });

    bench('one row changed, delivering snapshots', async () => {
        snapshots.row.classList.toggle('selected');
        await snapshots.watch.refreshAsync();
    });

    bench('one row changed, keeping live state', async () => {
        liveState.row.classList.toggle('selected');
        await liveState.watch.refreshAsync();
    });
});
