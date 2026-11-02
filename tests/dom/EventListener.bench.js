import { bench, describe } from 'vitest';
import { domql } from '#domql/domql.js';

/** How many rows the larger projection reads for each event. */
const ROWS = 100;

/** A panel in the document, with a key. */
const createPanel = () => {
    const panel = document.createElement('div');

    panel.setAttribute('data-key', 'panel');
    document.body.append(panel);

    return panel;
};

/** A list of rows in the document, each with a key, every seventh selected. */
const createList = rows => {
    const list = document.createElement('div');

    for (let index = 0; index < rows; index++) {
        const row = document.createElement('div');

        row.setAttribute('data-key', `r${index}`);
        row.className = index % 7 === 0 ? 'selected' : '';
        list.append(row);
    }

    document.body.append(list);

    return list;
};

/** A click, which each benchmark dispatches again; its listener projects it in the task it is dispatched in. */
const click = new window.MouseEvent('click', { clientX: 4, clientY: 2 });

describe('an event projected as it is delivered', () => {
    const panel = createPanel();
    const list = createList(ROWS);

    domql.query('panel.on("click") { button = it.button, x = it.clientX, open = panel.matches(".open"), key = panel.attribute["data-key"] }', { panel }).subscribe(() => {});
    domql.query('list.on("click") { button = it.button, items = list.children { key = it.attribute["data-key"], selected = it.matches(".selected") } }', { list }).subscribe(() => {});

    bench('its fields and the panel it is heard on', () => {
        panel.dispatchEvent(click);
    });

    bench(`its fields and each of ${ROWS} rows of the list it is heard on`, () => {
        list.dispatchEvent(click);
    });
});
