import { bench, describe } from 'vitest';
import { nexo } from '@formaui-net/nexo';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { LiveState } from '#domql/snapshots/LiveState.mjs';
import { SnapshotComparer } from '#domql/snapshots/SnapshotComparer.mjs';

/** The sizes of table whose live state is kept. */
const SIZES = [1000, 10000];

/** Each row as data: its key, whether it is selected, and its box. */
const ROWS_TEXT = 'table.all("tr") { key = it.attribute["data-key"], selected = it.matches(".selected"), box = it.rect { width = it.width, height = it.height } }';

/** DOMQL's module, against which the rows are evaluated as a watch evaluates them. */
const registry = nexo.createRegistry([BrowserModule.create()]);

/**
 * The snapshots a watch of a table of rows would report, the second reconciled against the first as its comparer reconciles it, with the metadata Nexo gave each: the first, and one with every row's class changed. The table
 * leaves the document once they are read, so each size's rows are its own.
 */
const snapshotsOf = rows => {
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
    const comparer = new SnapshotComparer();
    const first = evaluator.evaluate();
    const reconciled = result => ({ value: comparer.reconcile(first.value, first.metadata, result.value, result.metadata), metadata: result.metadata });

    table.querySelectorAll('tr').forEach(row => row.classList.toggle('selected'));

    const everyChanged = reconciled(evaluator.evaluate());

    table.remove();

    return { first, everyChanged };
};

for (const rows of SIZES) {
    describe(`the live state of ${rows} shaped rows`, () => {
        const { first, everyChanged } = snapshotsOf(rows);
        const liveState = new LiveState();
        let isChanged = false;

        liveState.update(first.value, first.metadata);

        // Each iteration brings the state to the other snapshot, so every one changes every row.
        bench('brought to every row changed, and back', () => {
            isChanged = !isChanged;

            if (isChanged) {
                liveState.update(everyChanged.value, everyChanged.metadata);
            } else {
                liveState.update(first.value, first.metadata);
            }
        });
    });
}
