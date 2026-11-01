import { bench, describe } from 'vitest';
import { nexo } from '@formaui-net/nexo';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { SnapshotComparer } from '#domql/snapshots/SnapshotComparer.mjs';
import { SnapshotPatcher } from '#domql/snapshots/SnapshotPatcher.mjs';

/** How many items a list holds. */
const ITEMS = 1000;

/** The elements the items were projected from, and each item, the same object in every order. */
const elements = Array.from({ length: ITEMS }, () => document.createElement('tr'));
const items = elements.map((_element, index) => Object.freeze({ key: `r${index}` }));

/** What each item was projected from: its element, a reference. */
const sources = elements.map(element => ({ kind: 'reference', value: element }));

/** A list in the order the indices give, with the metadata Nexo gives a list projected from elements: each item's source, its provenance as well. */
const listOf = order => [Object.freeze(order.map(index => items[index])), { items: order.map(() => null), sources: order.map(index => sources[index]), provenance: order.map(index => sources[index]) }];

/** The indices in their order. */
const ordered = Array.from({ length: ITEMS }, (_item, index) => index);

/** A shuffle a fixed seed repeats, so every run compares the same orders. */
const shuffled = () => {
    const order = [...ordered];
    let seed = 1;

    for (let index = order.length - 1; index > 0; index--) {
        seed = (seed * 16807) % 2147483647;

        const other = seed % (index + 1);

        [order[index], order[other]] = [order[other], order[index]];
    }

    return order;
};

/** Each order the list changes to, by how it changed. */
const reorders = {
    unchanged: ordered,
    'the first moved to the end': [...ordered.slice(1), 0],
    'the last moved to the start': [ITEMS - 1, ...ordered.slice(0, -1)],
    'two swapped': ordered.map(index => (index === 10 ? ITEMS - 10 : index === ITEMS - 10 ? 10 : index)),
    reversed: [...ordered].reverse(),
    shuffled: shuffled(),
};

describe(`the change set of ${ITEMS} items matched by element`, () => {
    const [previous, previousIdentities] = listOf(ordered);

    for (const [name, order] of Object.entries(reorders)) {
        const [next, nextIdentities] = listOf(order);

        bench(name, () => {
            SnapshotPatcher.changeSetBetween(previous, previousIdentities, next, nextIdentities);
        });
    }
});

/** The sizes of table whose shaped rows change. */
const SIZES = [1000, 10000];

/** Each row as data: its key, whether it is selected, and its box. */
const ROWS_TEXT = 'table.all("tr") { key = it.attribute["data-key"], selected = it.matches(".selected"), box = it.rect { width = it.width, height = it.height } }';

/** DOMQL's module, against which the rows are evaluated as a watch evaluates them. */
const registry = nexo.createRegistry([BrowserModule.create()]);

/**
 * The snapshots a watch of a table of rows would report, each later one reconciled against the first as its comparer reconciles it, with the metadata Nexo gave each: the first, one with one row's class changed, and one with
 * every row's class changed. The table leaves the document once they are read, so each size's rows are its own.
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

    table.querySelectorAll('tr')[rows >> 1].classList.toggle('selected');

    const oneChanged = reconciled(evaluator.evaluate());

    table.querySelectorAll('tr').forEach(row => row.classList.toggle('selected'));

    const everyChanged = reconciled(evaluator.evaluate());

    table.remove();

    return { first, oneChanged, everyChanged };
};

for (const rows of SIZES) {
    describe(`the change set of ${rows} shaped rows`, () => {
        const { first, oneChanged, everyChanged } = snapshotsOf(rows);

        bench('one row changed', () => {
            SnapshotPatcher.changeSetBetween(first.value, first.metadata, oneChanged.value, oneChanged.metadata);
        });

        bench('every row changed', () => {
            SnapshotPatcher.changeSetBetween(first.value, first.metadata, everyChanged.value, everyChanged.metadata);
        });
    });
}
