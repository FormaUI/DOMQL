import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/** Lets every task and microtask queued so far run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('MutationObservers', () => {
    let isolated;
    let panel;
    let cell;

    /** What the module's observation type measured, and the environment its implementation received. */
    let measured;
    let observationEnvironment;

    /**
     * A module whose maintained member, `measuredWidth`, keeps what its observation type, `measuring`, measures of its receiver under the class `wide`, and whose behavior, `measurer`, keeps its environment.
     */
    const measuresModule = () => isolated.createModule('Measures', {
        observationTypes: [{
            name: 'measuring', contract: 'maintained', shared: false,
            impl: ({ request: { target }, env }) => {
                observationEnvironment = env;

                const value = env.measureUnder(target, { class: 'wide' }, () => target.className);

                measured.push(value);

                return { stop: () => {}, sample: () => ({ pending: false, value }) };
            },
        }],
        types: [{
            name: 'MeasureElements', kind: 'extension', target: 'Domql.Element',
            members: [
                {
                    name: 'measuredClass', kind: 'property', result: 'String',
                    updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'measuring', of: 'receiver' }] },
                    impl: ({ samples: [value] }) => value,
                },
                {
                    name: 'measuredHere', kind: 'property', result: 'String',
                    updates: { changes: 'constant', reads: 'fresh' },
                    impl: ({ receiver, env }) => env.measureUnder(receiver, { class: 'wide' }, () => receiver.className),
                },
            ],
        }],
    });

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" class="open"><span id="cell"></span></div>';
        panel = document.getElementById('panel');
        cell = document.getElementById('cell');
        measured = [];
        isolated.registerModule(measuresModule());
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('a transient measurement', () => {
        it('reads an element under a class it lacks, and restores its class attribute as it was', async () => {
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            expect(measured).toEqual(['open wide']);
            expect(panel.getAttribute('class')).toBe('open');

            observationEnvironment.measureUnder(cell, { class: 'wide' }, () => measured.push(cell.className));

            expect(measured).toEqual(['open wide', 'wide']);
            expect(cell.hasAttribute('class')).toBe(false);
        });

        it('reads an element holding the class already as it is', async () => {
            panel.className = 'wide';
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            expect(measured).toEqual(['wide']);
        });

        it('evaluates no watch again for the class it applied and took away, where every watch that reads it is DOMQL\'s', async () => {
            const evaluations = [];
            const wide = isolated.query('panel { wide = it.matches(".wide"), cells = it.all(".wide").count }', { panel }).watch({ schedule: 'immediate', acceptPartialObservation: true });

            wide.subscribe('change', (sender, args) => evaluations.push(args.value));
            await wide.readyAsync();
            await settle();

            const measuring = isolated.query('import Measures\npanel:measuredClass', { panel }).watch({ schedule: 'immediate' });

            await measuring.readyAsync();
            await settle();

            expect(measured).toEqual(['open wide']);
            expect(evaluations).toEqual([{ wide: false, cells: 0 }]);

            wide.dispose();
            measuring.dispose();
        });

        it('hands on the records of every other change, those recorded before it and those its read made', async () => {
            const values = [];
            const watched = isolated.query('panel { key = it["data-key"], wide = it.matches(".wide") }', { panel }).watch({ schedule: 'immediate', acceptPartialObservation: true });

            watched.subscribe('change', (sender, args) => values.push(args.value));
            await watched.readyAsync();
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            panel.setAttribute('data-key', 'before');
            observationEnvironment.measureUnder(panel, { class: 'wide' }, () => panel.setAttribute('data-key', 'during'));
            await settle();

            expect(values).toEqual([{ key: null, wide: false }, { key: 'during', wide: false }]);
            watched.dispose();
        });

        it('is refused while a member\'s implementation reads, which reads alone', () => {
            expect(() => isolated.query('import Measures\npanel:measuredHere', { panel }).evaluate()).toThrow(expect.objectContaining({
                kind: 'evaluation',
                code: 'NEXO5007',
                cause: expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5021' }),
            }));
            expect(panel.getAttribute('class')).toBe('open');
        });

        it('is refused an element that is none, a class that is no one token, or a read that is no function', async () => {
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            for (const [element, options, read] of [[document, { class: 'wide' }, () => 1], [panel, { class: 'a b' }, () => 1], [panel, { class: '' }, () => 1], [panel, {}, () => 1], [panel, { class: 'wide' }, null]]) {
                expect(() => observationEnvironment.measureUnder(element, options, read)).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2012' }));
            }
        });
    });
});
