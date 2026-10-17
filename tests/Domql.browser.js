import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

/** The evaluations that wait for a browser's observations, which only a real browser delivers. */
describe('domql evaluateAsync in a browser', () => {
    let panel;
    let inside;
    let outside;

    beforeEach(() => {
        document.body.style.margin = '0';
        document.body.innerHTML = `
            <div id="panel" style="position: relative; width: 200px; height: 100px; overflow: auto">
                <div id="inside" style="height: 40px"></div>
                <div id="outside" style="height: 40px; margin-top: 400px"></div>
            </div>`;
        panel = document.getElementById('panel');
        inside = document.getElementById('inside');
        outside = document.getElementById('outside');
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('evaluates whether an element intersects the viewport, once the browser has reported it', async () => {
        expect(await domql.query('item.intersects()', { item: inside }).evaluateAsync()).toBe(true);
        expect(await domql.query('item.intersects()', { item: outside }).evaluateAsync()).toBe(false);
    });

    it('evaluates whether an element intersects a root, with the margin that widens it', async () => {
        expect(await domql.query('item.intersects({ root = panel })', { item: outside, panel }).evaluateAsync()).toBe(false);
        expect(await domql.query('item.intersects({ root = panel, margin = 500 })', { item: outside, panel }).evaluateAsync()).toBe(true);
    });

    it('evaluates it among the other members of an object expression', async () => {
        const snapshot = await domql.query('item { near = self.intersects(), height = self.size?.height, id = self:attribute["id"] }', { item: inside }).evaluateAsync();

        expect(snapshot).toEqual({ near: true, height: 40, id: 'inside' });
    });

    it('is refused by evaluate, which cannot wait for the sample', () => {
        expect(() => domql.query('item.intersects()', { item: inside }).evaluate()).toThrow("The member 'intersects' is maintained by an observation");
    });

    it('is canceled by a signal before the browser reports', async () => {
        const controller = new AbortController();
        const evaluating = domql.query('item.intersects()', { item: inside }).evaluateAsync({ signal: controller.signal }).catch(error => error);

        controller.abort(new Error('not needed'));

        expect((await evaluating).message).toBe('not needed');
    });

    describe('watch', () => {
        const watches = [];
        const settle = (milliseconds = 0) => new Promise(resolve => setTimeout(resolve, milliseconds));
        /** Waits for an animation frame, and for the observers that fire after the frame that changed the layout. */
        const frame = async () => {
            await new Promise(resolve => requestAnimationFrame(resolve));
            await new Promise(resolve => requestAnimationFrame(resolve));
            await settle();
        };

        afterEach(() => {
            watches.splice(0).forEach(watch => watch.dispose());
        });

        it('follows the layout a browser decides, reporting a snapshot when the size changes', async () => {
            const snapshots = [];
            const watch = domql.query('item.size', { item: inside }).watch();

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            watches.push(watch);
            await frame();

            expect(snapshots).toEqual([{ width: 200, height: 40 }]);

            inside.style.height = '60px';
            await frame();

            expect(snapshots).toEqual([{ width: 200, height: 40 }, { width: 200, height: 60 }]);
            expect(watch.status).toBe('ready');
        });

        it('follows a box through its own size and the structure around it, and misses a move nothing it observes causes until a refresh', async () => {
            const snapshots = [];
            const watch = domql.query('item.rect?.top', { item: outside }).watch({ acceptPartialObservation: true });

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            watches.push(watch);
            await frame();

            expect(snapshots).toEqual([440]);

            panel.style.paddingTop = '30px';
            await frame();
            inside.style.height = '60px';
            await frame();

            expect(snapshots).toEqual([440]);
            expect(outside.getBoundingClientRect().top).toBe(490);

            await watch.refreshAsync();

            expect(snapshots).toEqual([440, 490]);

            const inserted = document.createElement('div');

            inserted.style.height = '20px';
            panel.insertBefore(inserted, outside);
            await frame();

            expect(snapshots).toEqual([440, 490, 510]);
        });

        it('follows a popover opening and closing, by script and by its button, which change no attribute', async () => {
            panel.insertAdjacentHTML('beforeend', '<button id="opener" popovertarget="tip">Tip</button><div id="tip" popover>A tip</div>');

            const tip = document.getElementById('tip');
            const snapshots = [];
            const watch = domql.query('{ open = tip.matches(":popover-open"), count = panel.all(":popover-open").count }', { tip, panel }).watch({ acceptPartialObservation: true });

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            watches.push(watch);
            await frame();

            tip.showPopover();
            await frame();
            tip.hidePopover();
            await frame();
            document.getElementById('opener').click();
            await frame();

            expect(snapshots).toEqual([
                { open: false, count: 0 },
                { open: true, count: 1 },
                { open: false, count: 0 },
                { open: true, count: 1 },
            ]);
        });

        it('follows a client size through its border box and its content box, and misses a change that leaves both as they were until a refresh', async () => {
            const box = document.createElement('div');

            box.style.cssText = 'box-sizing: border-box; width: 200px; height: 100px; padding: 10px; border: 10px solid';
            document.body.append(box);

            const snapshots = [];
            const watch = domql.query('box.clientSize?.width', { box }).watch({ acceptPartialObservation: true });

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            watches.push(watch);
            await frame();

            expect(snapshots).toEqual([180]);

            // A border alone narrows the content box, keeping the border box at 200 pixels.
            box.style.borderWidth = '2px';
            await frame();

            expect(box.clientWidth).toBe(196);
            expect(snapshots).toEqual([180, 196]);

            // From a border of 2 and a padding of 10, a border of 4 and a padding of 8 keep both boxes as they were, and narrow the client box to 192.
            box.style.borderWidth = '4px';
            box.style.padding = '8px';
            await frame();

            expect(box.clientWidth).toBe(192);
            expect(snapshots).toEqual([180, 196]);

            await watch.refreshAsync();

            expect(snapshots).toEqual([180, 196, 192]);

            // Padding alone changes the content box and leaves the client box as it was, so nothing is delivered.
            box.style.padding = '20px';
            await frame();

            expect(snapshots).toEqual([180, 196, 192]);

            box.style.width = '220px';
            await frame();

            expect(snapshots).toEqual([180, 196, 192, 212]);
        });

        it('evaluates a client size twice under the immediate schedule where both of its boxes report one resize', async () => {
            // Each box reports through a ResizeObserver callback of its own, and each callback reaches a microtask of its own.
            let evaluations = 0;

            domql.registerModule(domql.createModule('clientEvaluations', {
                members: [{ name: 'clientEvaluations', function: 'count', kind: 'property', on: 'element', parameters: [], result: 'number', changes: 'constant', reads: 'fresh' }],
            }, { count: () => ++evaluations }));

            const box = document.createElement('div');

            box.style.cssText = 'width: 200px; height: 100px; padding: 10px';
            document.body.append(box);

            const watch = domql.query('box { width = self.clientSize?.width, evaluations = self.clientEvaluations }', { box }).watch({ schedule: 'immediate', acceptPartialObservation: true });

            watches.push(watch);
            await watch.readyAsync();
            await frame();

            const before = evaluations;

            box.style.width = '240px';
            await frame();

            expect(evaluations - before).toBe(2);
            expect(watch.snapshot.width).toBe(260);
        });

        it('waits for the browser to report a member it keeps, then follows it', async () => {
            const snapshots = [];
            const watch = domql.query('item.intersects({ root = panel })', { item: outside, panel }).watch();

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            watches.push(watch);
            await frame();

            expect(snapshots).toEqual([false]);

            panel.scrollTop = 420;
            await frame();

            expect(snapshots).toEqual([false, true]);
        });

        it('stops reporting once it is disposed', async () => {
            const snapshots = [];
            const watch = domql.query('item.size', { item: inside }).watch();

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            await frame();
            watch.dispose();
            inside.style.height = '80px';
            await frame();

            expect(snapshots).toEqual([{ width: 200, height: 40 }]);
        });

        describe('subscribe', () => {
            const listeners = [];

            afterEach(() => {
                listeners.splice(0).forEach(listener => listener.dispose());
            });

            it('delivers the projection of a click, with what the event carried', () => {
                const results = [];

                listeners.push(domql.query('panel.on("click") { id = self.target?:attribute["id"], button = self.button, height = self.target?.size?.height }', { panel }).subscribe((sender, args) => results.push(args.value)));
                inside.click();

                expect(results).toEqual([{ id: 'inside', button: 0, height: 40 }]);
            });

            it('answers null for a member the browser has not reported yet, and its sample at a later event', async () => {
                const results = [];

                listeners.push(domql.query('panel.on("click") { near = item.intersects({ root = panel }) }', { panel, item: outside }).subscribe((sender, args) => results.push(args.value)));

                panel.click();
                await frame();
                panel.click();
                panel.scrollTop = 420;
                await frame();
                panel.click();

                expect(results).toEqual([{ near: null }, { near: false }, { near: true }]);
            });
        });
    });
});
