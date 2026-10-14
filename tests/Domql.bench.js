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

/** How many items a windowed list draws in its range, beside the one it keeps drawn outside it. */
const DRAWN = 60;

/** Each drawn item of a windowed list, its spacers left out: its key, where it stands and how tall it is. */
const WINDOWED_TEXT = '@list.children.where(self attributeOf "data-spacer" is null) { key: self attributeOf "data-key", top: self.rect.top, height: self.rect.height }';

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

        return { list, closing, watch };
    };

    const unchanged = createWatch();
    const resized = createWatch();
    const scrolled = createWatch();
    let next = DRAWN;
    let scrolledBy = 0;

    bench('unchanged', async () => {
        await unchanged.watch.refreshAsync();
    });

    bench('one item resized', async () => {
        const item = resized.list.children[DRAWN / 2];

        item.layout.height = item.layout.height === 40 ? 64 : 40;
        layOut(resized.list);
        await resized.watch.refreshAsync();
    });

    bench('scrolled by one item: the first drawn leaves, the next is drawn', async () => {
        scrolled.list.children[1].remove();
        scrolled.closing.before(createItem(`i${next++}`));
        scrolledBy += 40;
        layOut(scrolled.list, scrolledBy);
        await scrolled.watch.refreshAsync();
    });
});
