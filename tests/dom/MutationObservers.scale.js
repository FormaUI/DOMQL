import { describe, it } from 'vitest';
import { domql } from '#domql/domql.js';
import { allocatedDuring, formatLoad, formatSummary, metricOf, MutationCallbacks, nextTask, printTable, runRounds, summaryOf } from '../_scale/Measuring.js';

/**
 * Transient measurements beside many of DOMQL's mutation observers, in Chromium: `env.measureUnder` takes the records of every observer DOMQL runs in the window before its read and again after it, so a measurement
 * costs more as a window runs more observers, as a watch of many rows does, one for each row whose attribute it reads.
 */

/** The environment of the latest behavior started, whose `measureUnder` a measurement calls outside every evaluation, as a behavior's own code does. */
let environment = null;

domql.registerModule(domql.createModule('Columns', {
    types: [{
        name: 'ColumnElements', kind: 'extension', target: 'Domql.Element',
        members: [{
            name: 'fitting', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous',
            impl: ({ env }) => {
                environment = env;

                return { update: () => {}, dispose: () => {} };
            },
        }],
    }],
}));

const OBSERVERS = [0, 100, 1000, 10000];
const MEASUREMENTS = 20;

/** Columns a table fits to their content, each measured under the class `fit`, which lays it out at its content's width. */
const createColumns = () => {
    const header = document.body.appendChild(document.createElement('div'));

    header.innerHTML = `<style>.column { display: inline-block; width: 60px; overflow: hidden; white-space: nowrap } .column.fit { width: max-content }</style>${Array.from({ length: MEASUREMENTS }, (_, index) => `<div class="column">Column heading ${index}</div>`).join('')}`;

    return { header, columns: [...header.querySelectorAll('.column')] };
};

/** Rows whose key a watch reads, each through an observation of its own attribute, so the window runs about one mutation observer a row. */
const createRows = count => {
    const host = document.body.appendChild(document.createElement('div'));

    host.innerHTML = Array.from({ length: count }, (_, index) => `<div class="row" data-k="r${index}"></div>`).join('');

    return host;
};

describe('Transient measurements beside many observers', () => {
    it('times a measurement, and a table\'s fit of its columns, as the window runs more of DOMQL\'s observers', async () => {
        const { header, columns } = createColumns();
        const fitting = domql.query('import Columns\nheader:fitting()', { header }).run();
        const callbacks = new MutationCallbacks(window);
        const rows = [];

        callbacks.install();

        try {
            for (const count of OBSERVERS) {
                const host = createRows(count);
                const before = callbacks.created;
                const watch = count === 0 ? null : domql.query('host.all(".row") { key = it.attribute["data-k"] }', { host }).watch({ acceptPartialObservation: true });

                await watch?.readyAsync();

                const observers = callbacks.created - before;
                const width = column => column.getBoundingClientRect().width;
                const nothing = () => 0;
                const byHand = (read, column) => {
                    const written = column.getAttribute('class');

                    column.classList.add('fit');

                    try {
                        return read(column);
                    } finally {
                        column.setAttribute('class', written);
                    }
                };
                // DOMQL's measurement, reading the width or nothing, and the same change made and undone by hand, which drains no observer, for what the measurement adds to it.
                const cases = [
                    { name: 'measureUnder, reading the width', run: column => environment.measureUnder(column, { class: 'fit' }, () => width(column)) },
                    { name: 'measureUnder, reading nothing', run: column => environment.measureUnder(column, { class: 'fit' }, nothing) },
                    { name: 'by hand, reading the width', run: column => byHand(width, column) },
                ];
                const timed = await runRounds(cases.map(({ name, run }) => ({
                    name,
                    measure: async () => {
                        let elapsed = 0;

                        // A fit of every column, each its own measurement, ten fits a round, each in a task of its own.
                        for (let fit = 0; fit < 10; fit++) {
                            await nextTask();

                            const start = performance.now();

                            columns.forEach(run);
                            elapsed += performance.now() - start;
                        }

                        return (elapsed * 1000) / (10 * MEASUREMENTS);
                    },
                })), { rounds: 7 });

                for (const { name, run } of cases) {
                    const bytes = await allocatedDuring(async () => {
                        for (let fit = 0; fit < 10; fit++) {
                            columns.forEach(run);
                            await nextTask();
                        }
                    });
                    const microseconds = summaryOf(metricOf(timed.get(name)));

                    rows.push([`${count} rows, ${observers} observers made, ${name}`, formatSummary(microseconds, 1), ((microseconds.median * MEASUREMENTS) / 1000).toFixed(2), (bytes / (10 * MEASUREMENTS)).toFixed(0), formatLoad(timed.get(name).load)]);
                }

                watch?.dispose();
                host.remove();
            }
        } finally {
            callbacks.uninstall();
            fitting.dispose();
            header.remove();
        }

        printTable(`A transient measurement beside DOMQL's observers: µs a measurement, 10 fits of ${MEASUREMENTS} columns a round, 7 rounds, median (least–greatest); bytes a measurement from the heap profiler`, [
            'Observers, way',
            'µs a measurement',
            `ms a fit of ${MEASUREMENTS}`,
            'bytes a measurement',
            'load',
        ], rows);
    }, 900000);
});
