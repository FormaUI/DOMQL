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
    });
});
