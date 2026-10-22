import { it } from 'vitest';
import { domql } from '#domql/domql.js';

/** The sizes of table a watch's phases are timed at, in Chromium, whose layout and observers are a browser's own. */
const SIZES = [1000, 10000, 100000];

/** Each row as data: its key, whether it is selected, and its box. */
const ROWS_TEXT = 'table.all("tr") { key = it.attribute["data-key"], selected = it.matches(".selected"), box = it.rect { width = it.width, height = it.height } }';

/** How many times a phase runs before it is timed, and how many times it is timed, at a size: fewer for a larger table, never fewer than three. */
const runsOf = rows => ({ warmUp: 2, iterations: Math.max(3, Math.min(50, Math.round(200000 / rows))) });

/** A table of rows, in the document, each with a key and a cell. */
const createTable = rows => {
    const table = document.createElement('table');
    const body = document.createElement('tbody');

    for (let index = 0; index < rows; index++) {
        const row = document.createElement('tr');

        row.setAttribute('data-key', `r${index}`);
        row.className = index % 7 === 0 ? 'selected' : '';
        row.innerHTML = '<td>x</td>';
        body.append(row);
    }

    table.append(body);
    document.body.append(table);

    return table;
};

// A watch is evaluated by the phase alone, so no frame evaluates it while another phase is timed.
window.requestAnimationFrame = () => 1;
window.cancelAnimationFrame = () => {};

/** The script memory in use once garbage is collected, or null where the browser exposes neither collection nor a precise measure. */
const usedMemory = () => {
    if (typeof window.gc !== 'function' || performance.memory === undefined) {
        return null;
    }

    window.gc();
    window.gc();

    return performance.memory.usedJSHeapSize;
};

/** Times a phase: `prepare` runs untimed before each run, `run` is timed, and `after` runs untimed after it with what `run` answered; the warm-up runs go unreported. */
const time = async (rows, { prepare = async () => null, run, after = async () => {} }) => {
    const { warmUp, iterations } = runsOf(rows);
    const durations = [];

    for (let index = 0; index < warmUp + iterations; index++) {
        const prepared = await prepare();
        const start = performance.now();

        const ran = await run(prepared);
        const duration = performance.now() - start;

        await after(ran);

        if (index >= warmUp) {
            durations.push(duration);
        }
    }

    durations.sort((a, b) => a - b);

    return { warmUp, iterations, median: durations[Math.floor(durations.length / 2)], min: durations[0], max: durations.at(-1) };
};

/** A line for the phase: its median, least and greatest time, the median's cost a row, and how it was run. */
const report = (rows, phase, { warmUp, iterations, median, min, max }) => {
    const ms = value => value.toFixed(1);

    console.log(`${rows} rows, ${phase}: ${ms(median)} ms (${ms(min)} to ${ms(max)}), ${(median * 1000 / rows).toFixed(2)} µs a row; ${iterations} timed after ${warmUp} warm-up`);
};

/** A watch of the table, once its first snapshot is delivered. */
const startWatch = async (table, updateStrategy = 'snapshot') => {
    const watch = domql.query(ROWS_TEXT, { table }).watch({ updateStrategy, acceptPartialObservation: true });

    watch.subscribe('change', () => {});
    await watch.readyAsync();

    return watch;
};

it.each(SIZES)('times a watch of %i rows phase by phase', async rows => {
    document.body.innerHTML = '';

    const table = createTable(rows);
    const allRows = [...table.querySelectorAll('tr')];
    const row = allRows[rows / 2];
    const query = domql.query(ROWS_TEXT, { table });

    report(rows, 'read', await time(rows, { run: () => query.evaluate() }));
    report(rows, 'start to the first snapshot', await time(rows, { run: () => startWatch(table), after: watch => watch.dispose() }));
    report(rows, 'dispose', await time(rows, { prepare: () => startWatch(table), run: watch => watch.dispose() }));

    for (const updateStrategy of ['snapshot', 'liveState']) {
        const watch = await startWatch(table, updateStrategy);

        if (updateStrategy === 'snapshot') {
            report(rows, 'refresh, unchanged', await time(rows, { run: () => watch.refreshAsync() }));
        }

        report(rows, `refresh, one row changed, ${updateStrategy === 'snapshot' ? 'delivering snapshots' : 'keeping live state'}`, await time(rows, {
            run: () => {
                row.classList.toggle('selected');

                return watch.refreshAsync();
            },
        }));

        // Every row's class changes before the timing starts, so only the refresh is timed, comparing and delivering every row anew.
        report(rows, `refresh, every row changed, ${updateStrategy === 'snapshot' ? 'delivering snapshots' : 'keeping live state'}`, await time(rows, {
            prepare: async () => allRows.forEach(each => each.classList.toggle('selected')),
            run: () => watch.refreshAsync(),
        }));
        watch.dispose();
    }

    const before = usedMemory();
    const watch = await startWatch(table);
    const held = usedMemory();

    watch.dispose();

    if (before !== null) {
        console.log(`${rows} rows, memory: a watch holds ${((held - before) / 1048576).toFixed(1)} MB of script memory, ${((held - before) / rows).toFixed(0)} bytes a row`);
    }

    table.remove();
}, 600000);
