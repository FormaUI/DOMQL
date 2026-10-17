import { bench, describe } from 'vitest';
import { domql } from '#domql/domql.js';

/**
 * The sizes of table each workload of rows runs at, so a cost that grows faster than the rows shows: the simulated document the benchmarks use is fit for comparing
 * commits at these sizes, while how a watch scales, and what starting and disposing one costs, are measured in Chromium by `npm run scale`.
 */
const SIZES = [100, 1000, 10000, 100000];

/** Each row as data: its key, whether it is selected, and its box. */
const ROWS_TEXT = 'table.all("tr") { key: self:attribute["data-key"], selected: self.matches(".selected"), box: self.rect { width: self.width, height: self.height } }';

/** Each row as data again, its fields reading locals and choosing by conditionals. */
const LOCALS_TEXT = 'table.all("tr") { let key: self:attribute["data-key"], let box: self.rect, key: key, state: if self.matches(".selected") then "selected" else "plain", width: box?.width, height: if key == null then 0 else box?.height }';

/** A table of rows, in the document, each with a key. */
const createTable = rows => {
    const table = document.createElement('table');
    const body = document.createElement('tbody');

    for (let index = 0; index < rows; index++) {
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

/** What the workload running now holds, released as the next workload builds its own. */
let running = null;

/**
 * The resources of a workload, built at its first iteration, which is a warm-up and goes unreported, and released when the next workload builds its own, so each
 * workload has the document to itself and no workload pays for another's rows or observers; the runner calls no hook of a group's in a benchmark.
 */
const resourcesOf = build => {
    let resources = null;

    return () => {
        if (resources === null) {
            running?.release();
            resources = build();
            running = { release: () => { resources.release(); resources = null; } };
        }

        return resources;
    };
};

describe('a small object', () => {
    const panel = document.createElement('div');

    panel.setAttribute('data-key', 'panel');
    document.body.append(panel);

    const small = domql.query('panel { key: self:attribute["data-key"], open: self.matches(".open"), count: self.children.count }', { panel });

    bench('read as a query', () => {
        small.evaluate();
    });

    bench('read from its text and bindings', () => {
        domql.query('panel { key: self:attribute["data-key"], open: self.matches(".open"), count: self.children.count }', { panel }).evaluate();
    });
});

for (const rows of SIZES) {
    describe(`a list of ${rows} rows, each shaped, read`, () => {
        /** A query of a table of its own. */
        const createQuery = text => {
            const table = createTable(rows);

            return { query: domql.query(text, { table }), release: () => table.remove() };
        };

        const shaped = resourcesOf(() => createQuery(ROWS_TEXT));
        const locals = resourcesOf(() => createQuery(LOCALS_TEXT));

        bench('shaped', () => {
            shaped().query.evaluate();
        });

        bench('through locals and conditionals', () => {
            locals().query.evaluate();
        });
    });

    describe(`a watch of ${rows} rows, refreshed`, () => {
        /** A watch of a table of its own, and the table's row that changes. */
        const createWatch = (updateStrategy, text = ROWS_TEXT) => {
            const table = createTable(rows);
            const watch = domql.query(text, { table }).watch({
                updateStrategy,
                acceptPartialObservation: true,
            });

            watch.subscribe('change', () => {});

            return {
                watch,
                row: table.querySelectorAll('tr')[rows / 2],
                release: () => {
                    watch.dispose();
                    table.remove();
                },
            };
        };

        const unchanged = resourcesOf(() => createWatch('snapshot'));
        const locals = resourcesOf(() => createWatch('snapshot', LOCALS_TEXT));
        const snapshots = resourcesOf(() => createWatch('snapshot'));
        const liveState = resourcesOf(() => createWatch('liveState'));

        bench('unchanged', async () => {
            await unchanged().watch.refreshAsync();
        });

        bench('unchanged, its rows shaped through locals and conditionals', async () => {
            await locals().watch.refreshAsync();
        });

        bench('one row changed, delivering snapshots', async () => {
            const { watch, row } = snapshots();

            row.classList.toggle('selected');
            await watch.refreshAsync();
        });

        bench('one row changed, keeping live state', async () => {
            const { watch, row } = liveState();

            row.classList.toggle('selected');
            await watch.refreshAsync();
        });
    });
}

/** How many items a windowed list draws in its range, beside the one it keeps drawn outside it. */
const DRAWN = 60;

/** Each drawn item of a windowed list, its spacers left out: its key, where it stands and how tall it is. */
const WINDOWED_TEXT = 'list.children.where(self:attribute["data-spacer"] is null) { key: self:attribute["data-key"], top: self.rect?.top, height: self.rect?.height }';

/** An item of a windowed list, with a height that can change and the box its list's layout gives it, since the test environment lays nothing out. */
const createItem = (key, height = 40) => {
    const item = document.createElement('div');

    item.setAttribute('data-key', key);
    item.layout = { height, box: null };
    item.getBoundingClientRect = () => item.layout.box;
    item.getClientRects = () => [item.layout.box];

    return item;
};

/** Lays the list's items out as a browser would, one under another from the scroll offset, so a resize moves the items below it and a scroll moves every one. */
const layOut = (list, scrolledBy = 0) => {
    let top = -scrolledBy;

    for (const element of list.children) {
        if (element.layout !== undefined) {
            element.layout.box = { left: 0, top, width: 300, height: element.layout.height, right: 300, bottom: top + element.layout.height };
            top += element.layout.height;
        }
    }
};

/** A spacer, standing for a run of items the list does not draw. */
const createSpacer = () => {
    const spacer = document.createElement('div');

    spacer.setAttribute('data-spacer', '');

    return spacer;
};

/** A windowed list as a virtualizer draws one: a spacer, the drawn range, a spacer, one item kept drawn far below the range, and a last spacer. */
const createWindowedList = () => {
    const list = document.createElement('div');
    const closing = createSpacer();

    list.append(createSpacer());

    for (let index = 0; index < DRAWN; index++) {
        list.append(createItem(`i${index}`));
    }

    list.append(closing, createItem('kept'), createSpacer());
    document.body.append(list);
    layOut(list);

    return { list, closing };
};

describe(`a windowed list of ${DRAWN} drawn items, watched as live state and refreshed`, () => {
    /** A watch of a windowed list of its own. */
    const createWatch = () => {
        const { list, closing } = createWindowedList();
        const watch = domql.query(WINDOWED_TEXT, { list }).watch({ updateStrategy: 'liveState', acceptPartialObservation: true });

        watch.subscribe('change', () => {});

        return {
            list,
            closing,
            watch,
            release: () => {
                watch.dispose();
                list.remove();
            },
        };
    };

    const unchanged = resourcesOf(createWatch);
    const resized = resourcesOf(createWatch);
    const scrolled = resourcesOf(createWatch);
    let next = DRAWN;
    let scrolledBy = 0;

    bench('unchanged', async () => {
        await unchanged().watch.refreshAsync();
    });

    bench('one item resized', async () => {
        const { list, watch } = resized();
        const item = list.children[DRAWN / 2];

        item.layout.height = item.layout.height === 40 ? 64 : 40;
        layOut(list);
        await watch.refreshAsync();
    });

    bench('scrolled by one item: the first drawn leaves, the next is drawn', async () => {
        const { list, closing, watch } = scrolled();

        list.children[1].remove();
        closing.before(createItem(`i${next++}`));
        scrolledBy += 40;
        layOut(list, scrolledBy);
        await watch.refreshAsync();
    });
});
