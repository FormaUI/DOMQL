import { afterEach, describe, it, expect } from 'vitest';
import { userEvent } from '@vitest/browser/context';
import { domql } from '#domql/domql.js';

/** What the browser reports of the window's URL, its platform and a pointer's capture, in a real browser. */
describe('The platform in a browser', () => {
    const watches = [];

    afterEach(() => {
        watches.splice(0).forEach(watch => watch.dispose());
        document.body.innerHTML = '';
    });

    const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve))));

    it('follows the window\'s URL as the history API changes it, which the Navigation API reports', async () => {
        const start = window.location.href;
        const snapshots = [];
        const watch = domql.query('Domql.window.location { pathname = it.pathname, hash = it.hash }').watch({ schedule: 'immediate', acceptPartialObservation: true });

        watches.push(watch);
        watch.subscribe('change', (sender, args) => snapshots.push(args.value.hash));

        try {
            await settle();
            window.history.pushState(null, '', '#pushed');
            await settle();
            window.history.replaceState(null, '', '#replaced');
            await settle();

            expect(typeof window.navigation).toBe('object');
            expect(snapshots).toEqual(['', '#pushed', '#replaced']);
        } finally {
            window.history.replaceState(null, '', start);
        }
    });

    it('names the primary shortcut modifier of the platform the browser runs on', () => {
        const isApple = /^(Mac|iPhone|iPad|iPod)/.test(navigator.platform);

        expect(domql.query('Domql.window.shortcutModifier').evaluate()).toBe(isApple ? 'Meta' : 'Control');
    });

    it('answers whether an element holds the capture of a pointer, which it takes as the pointer goes down', async () => {
        document.body.innerHTML = '<div id="handle" style="width: 50px; height: 50px"></div>';

        const handle = document.getElementById('handle');
        const answers = [];

        handle.addEventListener('pointerdown', event => {
            const query = domql.query('handle.hasPointerCapture(id)', { handle, id: event.pointerId });

            answers.push(query.evaluate());
            handle.setPointerCapture(event.pointerId);
            answers.push(query.evaluate());
        });

        await userEvent.click(handle);

        expect(answers).toEqual([false, true]);
    });
});
