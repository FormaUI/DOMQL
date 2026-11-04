import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { MutationObservers } from '#domql/dom/MutationObservers.mjs';

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
                    name: 'measuredClass', kind: 'property', result: 'String?',
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

        it('restores the class attribute where its read throws, the failure reaching its caller', async () => {
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            const failure = new Error('read failed');

            expect(() => observationEnvironment.measureUnder(panel, { class: 'tall' }, () => {
                throw failure;
            })).toThrow(failure);
            expect(panel.getAttribute('class')).toBe('open');
        });

        it('nests a measurement under another class inside one, each restoring the attribute as it found it', async () => {
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            const read = observationEnvironment.measureUnder(panel, { class: 'tall' }, () => [panel.className, observationEnvironment.measureUnder(panel, { class: 'dense' }, () => panel.className), panel.className]);

            expect(read).toEqual(['open tall', 'open tall dense', 'open tall']);
            expect(panel.getAttribute('class')).toBe('open');
        });

        it('undoes a class its read writes, since a read writes nothing: the attribute stands as it was before the measurement', async () => {
            await isolated.query('import Measures\npanel:measuredClass', { panel }).evaluateAsync();

            observationEnvironment.measureUnder(panel, { class: 'tall' }, () => panel.classList.add('written'));

            expect(panel.getAttribute('class')).toBe('open');
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

describe('The observers a transient measurement drains', () => {
    let observers;
    let native;
    let panel;
    let cell;

    /** Each native observer made, in the order they were made, and how many times its records were taken. */
    let made;
    let taken;

    /** What each observer's callback received, by its name: each record's type, target and attribute. */
    let received;

    /** An observer of DOMQL's, named, observing the node with the options given; its native observer is the latest made. */
    const observing = (name, target, options, window = globalThis.window) => {
        const observer = observers.create(window, records => received.push([name, ...records.map(({ type, target: node, attributeName }) => `${type} ${node.id} ${attributeName}`)]));

        observer.observe(target, options);

        return { name, observer, native: made.at(-1) };
    };

    /** The names of the observers whose records were taken, and how many times each. */
    const drained = all => all.filter(({ native: observer }) => taken.has(observer)).map(({ name, native: observer }) => `${name} ${taken.get(observer)}`);

    beforeEach(() => {
        native = window.MutationObserver;
        made = [];
        taken = new Map();
        received = [];
        window.MutationObserver = class extends native {
            constructor(callback) {
                super(callback);
                made.push(this);
            }

            takeRecords() {
                taken.set(this, (taken.get(this) ?? 0) + 1);

                return super.takeRecords();
            }
        };
        observers = new MutationObservers();
        document.body.innerHTML = '<div id="panel"><span id="cell"></span></div><aside id="aside"></aside>';
        panel = document.getElementById('panel');
        cell = document.getElementById('cell');
    });

    afterEach(() => {
        window.MutationObserver = native;
        document.body.innerHTML = '';
    });

    it('takes records only from those that record a change of the element\'s class, and leaves every other one\'s to its own delivery', async () => {
        const all = [
            observing('the element\'s attributes', cell, { attributes: true }),
            observing('a class within an ancestor', panel, { attributes: true, attributeFilter: ['class'], subtree: true }),
            observing('a filter implying attributes', panel, { attributeFilter: ['id', 'class'], subtree: true }),
            observing('the element\'s other attribute', cell, { attributes: true, attributeFilter: ['data-key'] }),
            observing('an ancestor\'s children', panel, { childList: true, subtree: true }),
            observing('an ancestor\'s own attributes', panel, { attributes: true }),
            observing('another element\'s subtree', document.getElementById('aside'), { attributes: true, subtree: true }),
            observing('another window\'s observer', cell, { attributes: true }, { MutationObserver: window.MutationObserver }),
        ];

        cell.setAttribute('data-key', 'before');

        expect(observers.measureUnder(cell, 'wide', () => cell.className)).toBe('wide');
        expect(cell.hasAttribute('class')).toBe(false);
        expect(drained(all)).toEqual(['the element\'s attributes 2', 'a class within an ancestor 2', 'a filter implying attributes 2']);

        await settle();

        // The drained hand on what else they recorded, the change of the key; the rest are delivered as they recorded it, the other window's observer the class's change among it.
        expect(received.sort()).toEqual([
            ['another window\'s observer', 'attributes cell data-key', 'attributes cell class', 'attributes cell class'],
            ['the element\'s attributes', 'attributes cell data-key'],
            ['the element\'s other attribute', 'attributes cell data-key'],
        ]);
    });

    it('takes none from an observer that observes the node otherwise since, or is disconnected, and takes them again once it observes so again', () => {
        const otherwise = observing('observing children since', panel, { attributes: true, subtree: true });
        const disconnected = observing('disconnected', cell, { attributes: true });
        const again = observing('observing again', cell, { attributes: true });

        otherwise.observer.observe(panel, { childList: true, subtree: true });
        disconnected.observer.disconnect();
        again.observer.disconnect();
        again.observer.observe(panel, { attributes: true, attributeFilter: ['class'], subtree: true });

        observers.measureUnder(cell, 'wide', () => null);

        expect(drained([otherwise, disconnected, again])).toEqual(['observing again 2']);
    });

    it('takes none from any observer for an element holding the class already, which it reads as it is', () => {
        const all = [observing('the element\'s attributes', cell, { attributes: true })];

        cell.className = 'wide';

        expect(observers.measureUnder(cell, 'wide', () => cell.className)).toBe('wide');
        expect(drained(all)).toEqual([]);
    });
});
