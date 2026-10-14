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
        expect(await domql.query('@item intersects', { item: inside }).evaluateAsync()).toBe(true);
        expect(await domql.query('@item intersects', { item: outside }).evaluateAsync()).toBe(false);
    });

    it('evaluates whether an element intersects a root, with the margin that widens it', async () => {
        expect(await domql.query('@item intersects { root: @panel }', { item: outside, panel }).evaluateAsync()).toBe(false);
        expect(await domql.query('@item intersects { root: @panel, margin: 500 }', { item: outside, panel }).evaluateAsync()).toBe(true);
    });

    it('evaluates it among the other members of an object expression', async () => {
        const snapshot = await domql.query('@item { near: self intersects, height: self.size?.height, id: self attributeOf "id" }', { item: inside }).evaluateAsync();

        expect(snapshot).toEqual({ near: true, height: 40, id: 'inside' });
    });

    it('is refused by evaluate, which cannot wait for the sample', () => {
        expect(() => domql.query('@item intersects', { item: inside }).evaluate()).toThrow("The member 'intersects' is maintained by an observation");
    });

    it('is canceled by a signal before the browser reports', async () => {
        const controller = new AbortController();
        const evaluating = domql.query('@item intersects', { item: inside }).evaluateAsync({ signal: controller.signal }).catch(error => error);

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
            const watch = domql.query('@item.size', { item: inside }).watch();

            watch.subscribe('change', (sender, args) => snapshots.push(args.value));
            watches.push(watch);
            await frame();

            expect(snapshots).toEqual([{ width: 200, height: 40 }]);

            inside.style.height = '60px';
            await frame();

            expect(snapshots).toEqual([{ width: 200, height: 40 }, { width: 200, height: 60 }]);
            expect(watch.status).toBe('ready');
        });

        it('waits for the browser to report a member it keeps, then follows it', async () => {
            const snapshots = [];
            const watch = domql.query('@item intersects { root: @panel }', { item: outside, panel }).watch();

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
            const watch = domql.query('@item.size', { item: inside }).watch();

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

                listeners.push(domql.query('(@panel eventsOf "click") { id: self.target attributeOf "id", button: self.button, height: self.target?.size?.height }', { panel }).subscribe((sender, args) => results.push(args.value)));
                inside.click();

                expect(results).toEqual([{ id: 'inside', button: 0, height: 40 }]);
            });

            it('answers null for a member the browser has not reported yet, and its sample at a later event', async () => {
                const results = [];

                listeners.push(domql.query('(@panel eventsOf "click") { near: @item intersects { root: @panel } }', { panel, item: outside }).subscribe((sender, args) => results.push(args.value)));

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
