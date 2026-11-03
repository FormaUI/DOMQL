import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

/** The next animation frame, after the ones already asked for. */
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

/** When a watch's handlers run, in a real browser's event loop. */
describe('Watch timing in a browser', () => {
    let panel;
    let order;

    // The window's animation frames, counted, each callback marked as running inside its frame.
    const native = window.requestAnimationFrame;
    let frame = 0;
    let insideFrame = false;

    beforeEach(() => {
        document.body.innerHTML = '<div id="panel" data-n="1" style="width: 40px; height: 20px"></div>';
        panel = document.getElementById('panel');
        order = [];
        window.requestAnimationFrame = callback => native.call(window, time => {
            frame = time;
            insideFrame = true;

            try {
                callback(time);
            } finally {
                insideFrame = false;
            }
        });
    });

    afterEach(() => {
        window.requestAnimationFrame = native;
        document.body.innerHTML = '';
    });

    describe('an immediate watch', () => {
        it('runs its handlers within the microtask checkpoint of the mutation delivery that invalidated it, before any task or frame', async () => {
            const watch = domql.query('panel["data-n"]', { panel }).watch({ schedule: 'immediate' });

            watch.subscribe('change', (sender, args) => order.push(`handled ${args.value}`));
            await watch.readyAsync();
            order.length = 0;

            // The page's own observer is notified in the same delivery, a task and a frame are asked for after the mutation.
            new MutationObserver(() => order.push('delivered')).observe(panel, { attributes: true });
            panel.dataset.n = '2';

            const channel = new MessageChannel();

            channel.port1.onmessage = () => order.push('task');
            channel.port2.postMessage(null);
            setTimeout(() => order.push('timer'), 0);
            requestAnimationFrame(() => order.push('frame'));

            await nextFrame();
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(order.slice(0, 2)).toEqual(['delivered', 'handled 2']);
            expect(order.slice(2).sort()).toEqual(['frame', 'task', 'timer']);
        });
    });

    describe('a frame watch', () => {
        it('runs its handlers inside the animation frame, before paint, so a write it makes is laid out and observed in that frame', async () => {
            const watch = domql.query('panel["data-n"]', { panel }).watch();
            const resized = [];

            new ResizeObserver(() => resized.push(frame)).observe(panel);
            watch.subscribe('change', (sender, args) => {
                order.push({ value: args.value, insideFrame, frame });

                if (args.value === '2') {
                    panel.style.width = '80px';
                }
            });
            await watch.readyAsync();
            await nextFrame();
            await nextFrame();
            order.length = 0;
            resized.length = 0;

            panel.dataset.n = '2';
            await nextFrame();
            await nextFrame();

            expect(order).toEqual([{ value: '2', insideFrame: true, frame: expect.any(Number) }]);
            // The resize the handler's write caused is reported before the next frame, as the browser does before it paints.
            expect(resized).toEqual([order[0].frame]);
            watch.dispose();
        });

        it('reads an owned write kept against another writer, written again among the frame\'s writes, before the watch evaluates in that frame', async () => {
            const owned = domql.query('panel.ownAttribute({ name = "data-n", value = "owned", keep = true })', { panel }).run();
            const watch = domql.query('panel["data-n"]', { panel }).watch();
            const values = [];

            watch.subscribe('change', (sender, args) => values.push(args.value));
            await watch.readyAsync();
            await nextFrame();
            values.length = 0;

            // Another writer's change invalidates the watch and has the owned write write its value again, both in the next frame, the write first.
            panel.dataset.n = 'patched';
            await nextFrame();
            await nextFrame();

            expect(panel.dataset.n).toBe('owned');
            expect(values).toEqual([]);
            owned.dispose();
            watch.dispose();
        });
    });

    describe('a refresh that takes new samples', () => {
        it('reads where a load left a sentinel, which a refresh reading the sample the browser reported before misses', async () => {
            document.body.innerHTML = '<div id="list" style="height: 100px; overflow: auto"><div id="rows" style="height: 50px"></div><div id="sentinel" style="height: 1px"></div></div>';

            const [list, rows, sentinel] = ['list', 'rows', 'sentinel'].map(id => document.getElementById(id));
            const watch = domql.query('{ nearEnd = sentinel.intersects({ root = list }) }', { sentinel, list }).watch();

            expect(await watch.readyAsync()).toEqual({ nearEnd: true });

            // A load pushes the sentinel out of view, which the browser reports only after it lays out its next frame.
            rows.style.height = '500px';
            await watch.refreshAsync();
            expect(watch.snapshot).toEqual({ nearEnd: true });

            await watch.refreshAsync({ resample: true });
            expect(watch.snapshot).toEqual({ nearEnd: false });

            rows.style.height = '50px';
            await watch.refreshAsync({ resample: true });
            expect(watch.snapshot).toEqual({ nearEnd: true });
            watch.dispose();
        });

        /** A list 200 pixels high, its sentinel after its items, which a load appends five of, 30 pixels each, and a watch of whether the sentinel is within 200 pixels of the list's end. */
        const feed = () => {
            document.body.innerHTML = '<div id="list" style="height: 200px; overflow: auto"><div id="items"></div><div id="sentinel" style="height: 1px"></div></div>';

            const [list, items, sentinel] = ['list', 'items', 'sentinel'].map(id => document.getElementById(id));
            const watch = domql.query('sentinel { isIntersecting = it.intersects({ root = list, margin = 200 }) }', { sentinel, list }).watch();
            const load = () => items.append(...Array.from({ length: 5 }, () => Object.assign(document.createElement('div'), { style: 'height: 30px' })));

            return { list, items, sentinel, watch, load };
        };

        it('fills a list page by page while a refresh that takes new samples reads its sentinel in reach, stops once a load leaves it out of reach, and loads again as a scroll brings it near', async () => {
            const { list, items, watch, load } = feed();
            const states = [];
            const changes = [];

            // A load is followed by a refresh that takes new samples, whose snapshot says whether to load again, whether or not it raised a change.
            const loadWhileInReach = async state => {
                while (state.isIntersecting) {
                    load();
                    await watch.refreshAsync({ resample: true });
                    state = watch.snapshot;
                    states.push(state.isIntersecting);
                }
            };

            watch.subscribe('change', (sender, args) => changes.push(args.value.isIntersecting));
            await loadWhileInReach(await watch.readyAsync());

            // The sentinel stands at 150, 300 and then 450 pixels, the last past the list's 200 and its margin of 200.
            expect(states).toEqual([true, true, false]);
            expect(items.children.length).toBe(15);
            await nextFrame();
            await nextFrame();
            expect(changes).toEqual([true, false]);

            // A scroll of 100 pixels brings the sentinel to 350, within reach, which the watch reports as a change.
            const nearEnd = new Promise(resolve => watch.subscribe('change', (sender, args) => args.value.isIntersecting && resolve(args.value)));

            list.scrollTop = 100;
            await loadWhileInReach(await nearEnd);

            expect(states).toEqual([true, true, false, false]);
            expect(items.children.length).toBe(20);
            expect(changes).toEqual([true, false, true, false]);
            watch.dispose();
        });

        it('stalls a loop that loads only on a change once a load leaves the sentinel in reach, since a refresh whose result equals the last raises none', async () => {
            const { list, items, sentinel, watch, load } = feed();
            const refreshes = [];

            watch.subscribe('change', (sender, args) => {
                if (args.value.isIntersecting) {
                    load();
                    refreshes.push(sender.refreshAsync({ resample: true }));
                }
            });
            await watch.readyAsync();
            await Promise.all(refreshes);
            await nextFrame();
            await nextFrame();

            // One load, from the first state, leaves the sentinel at 150 pixels, 50 above the list's end and in reach, and nothing loads after it.
            expect(refreshes.length).toBe(1);
            expect(items.children.length).toBe(5);
            expect(watch.snapshot).toEqual({ isIntersecting: true });
            expect(sentinel.getBoundingClientRect().top - list.getBoundingClientRect().bottom).toBe(-50);
            watch.dispose();
        });

        it('raises the ready state readyAsync answers as the first change of every listener: within its evaluation to one subscribed before, before readyAsync answers, and in a microtask to one subscribed after', async () => {
            const { watch } = feed();
            const order = [];

            watch.subscribe('change', (sender, args) => order.push(['before', args]));
            expect(watch.status).toBe('pending');

            order.push(['ready', await watch.readyAsync()]);
            watch.subscribe('change', (sender, args) => order.push(['after', args]));
            order.push(['subscribed']);
            await Promise.resolve();

            expect(order).toEqual([
                ['before', { status: 'ready', value: { isIntersecting: true } }],
                ['ready', { isIntersecting: true }],
                ['subscribed'],
                ['after', { status: 'ready', value: { isIntersecting: true } }],
            ]);
            watch.dispose();
        });
    });
});
