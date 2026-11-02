import { describe, it, expect } from 'vitest';
import { nexo } from '@formaui-net/nexo';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserObservationImplementations } from '#domql/dom/BrowserObservationImplementations.mjs';
import { Observations } from '#domql/dom/Observations.mjs';

/** A window whose pixel ratio and media queries the test controls, since a browser's cannot be changed from inside it. */
const createWindow = devicePixelRatio => {
    const lists = [];
    const fake = {
        devicePixelRatio,
        lists,
        matchMedia: query => {
            // The listeners by what the page registered, each wrapped to leave once it has run where it asked for that.
            const listeners = new Map();
            const list = {
                query,
                addEventListener: (_type, listener, options) => listeners.set(listener, options?.once ? () => { listeners.delete(listener); listener(); } : listener),
                removeEventListener: (_type, listener) => listeners.delete(listener),
                fire: () => [...listeners.values()].forEach(run => run()),
                get listeners() { return listeners.size; },
            };

            lists.push(list);

            return list;
        },
    };

    return fake;
};

describe('BrowserObservationImplementations', () => {
    describe('pixelRatio', () => {
        const watch = fake => {
            const observations = new Observations(nexo.createRegistry([BrowserModule.create()]), { window: fake, document });
            const changes = [];
            const session = observations.acquire(observations.resolve({ type: 'pixelRatio', of: 'window' }, { receiver: fake, args: {} }), () => changes.push(fake.devicePixelRatio));

            return { observations, changes, session };
        };

        it('listens for the ratio it has now to be left', () => {
            const fake = createWindow(2);

            watch(fake);

            expect(fake.lists.map(list => list.query)).toEqual(['(resolution: 2dppx)']);
        });

        it('reports the ratio changing, and listens for the new ratio to be left', () => {
            const fake = createWindow(1);
            const { changes } = watch(fake);

            fake.devicePixelRatio = 2;
            fake.lists[0].fire();

            expect(changes).toEqual([2]);
            expect(fake.lists.map(list => list.query)).toEqual(['(resolution: 1dppx)', '(resolution: 2dppx)']);
            expect(fake.lists[0].listeners).toBe(0);

            fake.devicePixelRatio = 3;
            fake.lists[1].fire();

            expect(changes).toEqual([2, 3]);
        });

        it('stops listening when its last holder lets go', () => {
            const fake = createWindow(1);
            const { session, observations } = watch(fake);

            session.dispose();

            expect(fake.lists[0].listeners).toBe(0);
            expect(observations.runningCount).toBe(0);
        });

        it('stops listening for the new ratio too, after it changed', () => {
            const fake = createWindow(1);
            const { session } = watch(fake);

            fake.devicePixelRatio = 2;
            fake.lists[0].fire();
            session.dispose();

            expect(fake.lists[1].listeners).toBe(0);
        });
    });

    describe('resize of the client box', () => {
        /** A window whose resize observers the test controls: each records the boxes it observes and whether it is disconnected, and the one `failing` names fails to start. */
        const createResizeWindow = ({ failing = -1 } = {}) => {
            const observers = [];
            const fake = {
                observers,
                ResizeObserver: class {
                    constructor(callback) {
                        this.callback = callback;
                        this.boxes = [];
                        this.isDisconnected = false;
                        observers.push(this);
                    }

                    observe(target, { box }) {
                        if (observers.indexOf(this) === failing) {
                            throw new Error('cannot observe');
                        }

                        this.boxes.push(box);
                    }

                    disconnect() {
                        this.isDisconnected = true;
                    }
                },
            };

            return fake;
        };

        const element = document.createElement('div');

        it('observes the border box and the content box, one observer each, and reports a change either reports after its first report', () => {
            const fake = createResizeWindow();
            let changes = 0;
            const observation = BrowserObservationImplementations.implementations.observeResize({ request: { type: 'resize', target: element, arguments: { box: 'client' } }, notify: () => changes++, env: { window: fake } });

            expect(fake.observers.map(observer => observer.boxes)).toEqual([['border-box'], ['content-box']]);

            fake.observers.forEach(observer => observer.callback([]));
            expect(changes).toBe(0);

            fake.observers[1].callback([]);
            fake.observers[0].callback([]);
            expect(changes).toBe(2);

            observation.stop();
            expect(fake.observers.every(observer => observer.isDisconnected)).toBe(true);
        });

        it('lets go of the border box observer where the content box one fails to start', () => {
            const fake = createResizeWindow({ failing: 1 });

            expect(() => BrowserObservationImplementations.implementations.observeResize({ request: { type: 'resize', target: element, arguments: { box: 'client' } }, notify: () => {}, env: { window: fake } })).toThrow('cannot observe');
            expect(fake.observers.map(observer => observer.isDisconnected)).toEqual([true, true]);
        });
    });

    describe('intersection', () => {
        /** A window whose intersection observer the test controls: it records what it observes and unobserves, and holds the reports the browser has made and not yet delivered. */
        const createIntersectionWindow = () => {
            const fake = {
                observer: null,
                IntersectionObserver: class {
                    constructor(callback, options) {
                        this.callback = callback;
                        this.options = options;
                        this.steps = [];
                        this.queued = [];
                        fake.observer = this;
                    }

                    observe(target) {
                        this.steps.push(['observe', target]);
                    }

                    unobserve(target) {
                        this.steps.push(['unobserve', target]);
                    }

                    takeRecords() {
                        return this.queued.splice(0);
                    }

                    disconnect() {
                        this.steps.push(['disconnect']);
                    }
                },
            };

            return fake;
        };

        const element = document.createElement('div');
        const start = (fake, notify = () => {}) => BrowserObservationImplementations.implementations.observeIntersection({ request: { type: 'intersection', target: element, arguments: { margin: 20 } }, notify, env: { window: fake } });

        it('is pending until the browser first reports the element, and holds its latest report after', () => {
            const fake = createIntersectionWindow();
            let changes = 0;
            const observation = start(fake, () => changes++);

            expect(fake.observer.options).toEqual({ root: null, rootMargin: '20px' });
            expect(observation.sample()).toEqual({ pending: true, value: null });

            fake.observer.callback([{ isIntersecting: false }, { isIntersecting: true }]);

            expect(observation.sample()).toEqual({ pending: false, value: true });
            expect(changes).toBe(1);
        });

        it('takes a new sample by observing the element again, settling at the report that follows, once for every ask before it', async () => {
            const fake = createIntersectionWindow();
            const observation = start(fake);
            const settled = [];

            fake.observer.callback([{ isIntersecting: true }]);

            // A report the browser made before it is asked is no new sample.
            fake.observer.queued.push({ isIntersecting: false });

            const first = observation.resampleAsync().then(() => settled.push('first'));
            const second = observation.resampleAsync().then(() => settled.push('second'));

            expect(observation.sample()).toEqual({ pending: false, value: false });
            expect(fake.observer.steps).toEqual([['observe', element], ['unobserve', element], ['observe', element]]);

            await Promise.resolve();
            expect(settled).toEqual([]);

            fake.observer.callback([{ isIntersecting: true }]);
            await Promise.all([first, second]);

            expect(settled).toEqual(['first', 'second']);
            expect(observation.sample()).toEqual({ pending: false, value: true });
        });

        it('settles a new sample it waits for as it stops', async () => {
            const fake = createIntersectionWindow();
            const observation = start(fake);
            const resampled = observation.resampleAsync();

            observation.stop();

            await expect(resampled).resolves.toBeUndefined();
            expect(fake.observer.steps.at(-1)).toEqual(['disconnect']);
        });
    });

    describe('selector', () => {
        /** Starts the observation of what the selector reads in the document, and answers how often it has reported. */
        const observe = selector => {
            const record = { changes: 0 };

            record.observation = BrowserObservationImplementations.implementations.observeSelector({ request: { type: 'selector', target: document, arguments: { selector } }, notify: () => record.changes++, env: { window } });

            return record;
        };

        const settled = () => new Promise(resolve => setTimeout(resolve));

        it('reports the structure of the tree and the attributes the selector reads, and no other attribute', async () => {
            document.body.innerHTML = '<ul><li class="row">a</li></ul>';

            const record = observe('.row[data-on]');
            const row = document.querySelector('li');

            row.setAttribute('tabindex', '-1');
            await settled();
            expect(record.changes).toBe(0);

            row.setAttribute('data-on', '');
            await settled();
            row.classList.add('lit');
            await settled();
            row.after(document.createElement('li'));
            await settled();
            expect(record.changes).toBe(3);

            record.observation.stop();
            row.setAttribute('data-on', 'x');
            await settled();
            expect(record.changes).toBe(3);
            document.body.innerHTML = '';
        });

        it('reports every attribute for a pseudo-class whose reads are unknown', async () => {
            document.body.innerHTML = '<p></p>';

            const record = observe('p:something-new');

            document.querySelector('p').setAttribute('tabindex', '0');
            await settled();
            expect(record.changes).toBe(1);
            record.observation.stop();
            document.body.innerHTML = '';
        });

        it('reports focus moving only where the selector tests focus, and a popover toggling only where it tests :popover-open', () => {
            const focused = observe(':focus');
            const popover = observe(':popover-open');
            const plain = observe('div');

            document.dispatchEvent(new Event('focusin'));
            document.body.dispatchEvent(new Event('toggle'));

            expect([focused.changes, popover.changes, plain.changes]).toEqual([1, 1, 0]);
            [focused, popover, plain].forEach(record => record.observation.stop());
        });
    });
});
