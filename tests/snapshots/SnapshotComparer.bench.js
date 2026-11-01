import { bench, describe } from 'vitest';
import { nexo } from '@formaui-net/nexo';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { SnapshotComparer } from '#domql/snapshots/SnapshotComparer.mjs';

/** The sizes of table whose snapshots are compared. */
const SIZES = [1000, 10000];

/** Each row as data: its key, whether it is selected, and its box. */
const ROWS_TEXT = 'table.all("tr") { key = it.attribute["data-key"], selected = it.matches(".selected"), box = it.rect { width = it.width, height = it.height } }';

/** DOMQL's module, against which the rows are evaluated as a watch evaluates them. */
const registry = nexo.createRegistry([BrowserModule.create()]);

/**
 * The results Nexo answers for a table of rows, with the metadata it gives each, as a watch compares them: one, the same table read again, the table with one row's class changed, and with every row's class changed.
 * The table leaves the document once they are read, so each size's rows are its own.
 */
const resultsOf = rows => {
    const table = document.createElement('table');

    for (let index = 0; index < rows; index++) {
        const row = document.createElement('tr');

        row.setAttribute('data-key', `r${index}`);
        row.className = index % 7 === 0 ? 'selected' : '';
        table.append(row);
    }

    document.body.append(table);

    const bindings = registry.createBindings({ table });
    const evaluator = registry.resolve(ROWS_TEXT, bindings, { imports: ['Domql'] }).createEvaluator(bindings, { window, document });
    const read = () => evaluator.evaluate();
    const first = read();
    const again = read();

    table.querySelectorAll('tr')[rows >> 1].classList.toggle('selected');

    const oneChanged = read();

    table.querySelectorAll('tr').forEach(row => row.classList.toggle('selected'));

    const everyChanged = read();

    table.remove();

    return { first, again, oneChanged, everyChanged };
};

for (const rows of SIZES) {
    describe(`the snapshots of ${rows} shaped rows, reconciled`, () => {
        const { first, again, oneChanged, everyChanged } = resultsOf(rows);
        const comparer = new SnapshotComparer();

        bench('unchanged', () => {
            comparer.reconcile(first.value, first.metadata, again.value, again.metadata);
        });

        bench('one row changed', () => {
            comparer.reconcile(first.value, first.metadata, oneChanged.value, oneChanged.metadata);
        });

        bench('every row changed', () => {
            comparer.reconcile(first.value, first.metadata, everyChanged.value, everyChanged.metadata);
        });
    });
}
