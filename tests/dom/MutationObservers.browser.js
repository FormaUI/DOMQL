import { afterEach, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { domql as isolated } from '#domql/domql.js';

/** The next animation frame, after the ones already asked for. */
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

describe('MutationObservers in a browser', () => {
    let column;

    /** What the module's observation type measured of the column's width under the class `fit`, which lays it out at its content's width. */
    let measured;

    const measuresModule = () => isolated.createModule('Measures', {
        observationTypes: [{
            name: 'fitting', contract: 'maintained', shared: false,
            impl: ({ request: { target }, env }) => {
                const value = env.measureUnder(target, { class: 'fit' }, () => target.getBoundingClientRect().width);

                measured.push(value);

                return { stop: () => {}, sample: () => ({ pending: false, value }) };
            },
        }],
        types: [{
            name: 'MeasureElements', kind: 'extension', target: 'Domql.Element',
            members: [{
                name: 'fittedWidth', kind: 'property', result: 'Number',
                updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'fitting', of: 'receiver' }] },
                impl: ({ samples: [value] }) => value,
            }],
        }],
    });

    beforeAll(() => isolated.registerModule(measuresModule()));

    beforeEach(async () => {
        document.head.insertAdjacentHTML('beforeend', '<style id="fitting">.fit { width: max-content !important; }</style>');
        document.body.innerHTML = '<div id="column" style="width: 50px"><span style="display: inline-block; width: 120px"></span></div>';
        column = document.getElementById('column');
        measured = [];
    });

    afterEach(() => {
        document.getElementById('fitting').remove();
        document.body.innerHTML = '';
    });

    it('measures under a class that lays the element out otherwise, while the watches reading its box and its classes report nothing', async () => {
        const reports = [];
        const watch = isolated.query('column { width = it.rect?.width, fitted = it.matches(".fit") }', { column }).watch({ acceptPartialObservation: true });

        watch.subscribe('change', (sender, args) => reports.push(args.value));
        await watch.readyAsync();

        const fitted = await isolated.query('import Measures\ncolumn:fittedWidth', { column }).evaluateAsync();

        await nextFrame();
        await nextFrame();

        expect(fitted).toBe(120);
        expect(measured).toEqual([120]);
        expect(column.getAttribute('class')).toBeNull();
        expect(reports).toEqual([{ width: 50, fitted: false }]);
        watch.dispose();
    });
});
