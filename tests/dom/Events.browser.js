import { afterEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/** What a subscription captures of the events a real browser dispatches as the user acts. */
describe('Events in a browser', () => {
    const listeners = [];

    afterEach(() => {
        listeners.splice(0).forEach(listener => listener.dispose());
        document.body.innerHTML = '';
    });

    /** Subscribes to the subscription with the bindings, and answers the results its events give, in order. */
    const subscribe = (text, bindings = {}) => {
        const results = [];

        listeners.push(domql.query(text, bindings).subscribe((sender, args) => results.push(args.status === 'ready' ? args.value : args.error.message)));

        return results;
    };

    describe('pointer events', () => {
        it('capture a click of the mouse with its pointer, and one of the keyboard and a dblclick, which carry none', async () => {
            document.body.innerHTML = '<button id="button">Press</button>';

            const button = document.getElementById('button');
            const clicks = subscribe('button.on("click") { hasPointer = it.pointerId != null, kind = it.pointerType, count = it.detail }', { button });
            const doubles = subscribe('button.on("dblclick") { id = it.pointerId, kind = it.pointerType, count = it.detail }', { button });

            await userEvent.click(button);
            clicks.splice(0);
            await userEvent.dblClick(button);
            button.focus();
            clicks.splice(0, 2);
            await userEvent.keyboard('{Enter}');

            expect(doubles).toEqual([{ id: null, kind: null, count: 2 }]);
            expect(clicks).toEqual([{ hasPointer: false, kind: null, count: 0 }]);
        });

        it('capture the pointer moving over an element, its pointer the mouse\'s', async () => {
            document.body.innerHTML = '<div id="area" style="width: 100px; height: 100px"></div>';

            const area = document.getElementById('area');
            const moves = subscribe('area.on("pointermove") { kind = it.pointerType, hasPointer = it.pointerId != null, timed = it.timeStamp > 0 }', { area });

            await userEvent.hover(area);

            expect(moves.length).toBeGreaterThan(0);
            expect(moves[0]).toEqual({ kind: 'mouse', hasPointer: true, timed: true });
        });

        it('capture the keys held as the pointer goes down', async () => {
            document.body.innerHTML = '<button id="button">Press</button>';

            const button = document.getElementById('button');
            const presses = subscribe('button.on("pointerdown") { shift = it.shiftKey, ctrl = it.ctrlKey }', { button });

            await userEvent.keyboard('{Shift>}');
            await userEvent.click(button);
            await userEvent.keyboard('{/Shift}');

            expect(presses).toEqual([{ shift: true, ctrl: false }]);
        });
    });

    describe('touch, wheel and drag events', () => {
        it('capture a wheel turn the browser dispatches, its deltas, their unit and the keys held', () => {
            document.body.innerHTML = '<div id="area"></div>';

            const area = document.getElementById('area');
            const turns = subscribe('area.on("wheel") { y = it.deltaY, mode = it.deltaMode, ctrl = it.ctrlKey }', { area });

            area.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE, ctrlKey: true }));

            expect(turns).toEqual([{ y: 3, mode: 1, ctrl: true }]);
        });

        it('capture the points a touch event holds, from the browser\'s touch list', () => {
            document.body.innerHTML = '<div id="area"></div>';

            const area = document.getElementById('area');
            const touches = subscribe('area.on("touchstart") { points = it.touches { id = it.identifier, x = it.clientX } }', { area });

            area.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 7, target: area, clientX: 12, clientY: 3 })] }));

            expect(touches).toEqual([{ points: [{ id: 7, x: 12 }] }]);
        });

        it('capture the formats a drag carries as it passes over a zone, from its data transfer', async () => {
            document.body.innerHTML = '<div id="source" draggable="true" style="width: 50px; height: 50px">Drag</div><div id="zone" style="width: 100px; height: 100px"></div>';

            const source = document.getElementById('source');
            const zone = document.getElementById('zone');
            const passes = subscribe('zone.on("dragover") { types = it.types }', { zone });
            const starts = subscribe('source.on("dragstart") { types = it.types }', { source });

            source.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', 'moved'));
            await userEvent.dragAndDrop(source, zone);

            expect(starts).toEqual([{ types: [] }]);
            expect(passes.length).toBeGreaterThan(0);
            expect(passes[0]).toEqual({ types: ['text/plain'] });
        });
    });
});
