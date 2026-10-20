import { describe, it, expect } from 'vitest';
import { BrowserModule } from '#domql/dom/BrowserModule.mjs';
import { BrowserObservers } from '#domql/dom/BrowserObservers.mjs';
import { Observations } from '#domql/dom/Observations.mjs';
import { LexicaRegistry } from '#lexica/language/vocabulary/LexicaRegistry.mjs';

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

describe('BrowserObservers', () => {
    describe('pixelRatio', () => {
        const watch = fake => {
            const observations = new Observations(new LexicaRegistry([BrowserModule.create()]), { window: fake, document });
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
            const observation = BrowserObservers.functions.observeResize({ type: 'resize', target: element, arguments: { box: 'client' } }, () => changes++, { window: fake });

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

            expect(() => BrowserObservers.functions.observeResize({ type: 'resize', target: element, arguments: { box: 'client' } }, () => {}, { window: fake })).toThrow('cannot observe');
            expect(fake.observers.map(observer => observer.isDisconnected)).toEqual([true, true]);
        });
    });
});
