import { afterEach, describe, expect, it } from 'vitest';
import { domql } from '#domql/domql.js';

/** The window's size as the scrollbars of its viewport appear and go, which resize no window and only a browser showing scrollbars changes. */
describe('window.size where scrollbars take up the viewport\'s room', () => {
    /** Waits for an animation frame, and for the observers that fire after the frame that changed the layout. */
    const frame = async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 0));
    };
    const viewport = () => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });

    afterEach(() => {
        document.documentElement.style.overflowY = '';
        document.body.innerHTML = '';
    });

    it('follows a vertical scrollbar and a horizontal one each appearing and going', async () => {
        document.body.style.margin = '0';
        document.body.innerHTML = '<div id="content" style="width: 10px; height: 10px"></div>';

        const content = document.getElementById('content');
        const snapshots = [];
        const expected = [];
        const watch = domql.query('window.size').watch();

        watch.subscribe('change', (sender, args) => snapshots.push(args.value));
        await frame();
        expected.push(viewport());

        content.style.height = '5000px';
        await frame();
        expected.push(viewport());
        content.style.height = '10px';
        await frame();
        expected.push(viewport());

        // With its vertical overflow hidden, the viewport gains a horizontal scrollbar alone, which shortens it and resizes no element.
        document.documentElement.style.overflowY = 'hidden';
        content.style.width = '5000px';
        await frame();
        expected.push(viewport());
        content.style.width = '10px';
        await frame();
        expected.push(viewport());
        watch.dispose();

        expect(expected[1].width).toBeLessThan(expected[0].width);
        expect(expected[3].height).toBeLessThan(expected[0].height);
        expect(snapshots).toEqual(expected);
    });
});
