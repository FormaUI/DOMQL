import { afterEach, beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { domql as isolated } from '#domql/domql.js';

/** The next animation frame, after the ones already asked for. */
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

describe('FrameSchedule in a browser', () => {
    let box;
    let environment;

    /**
     * A module whose behavior, `framed`, keeps its environment, and whose member, `travel`, reads the box's left edge as the browser lays it out, evaluated again each animation frame through the frame observation, as
     * continuous measurement does.
     */
    const framesModule = () => isolated.createModule('Frames', {
        types: [{
            name: 'FrameElements', kind: 'extension', target: 'Domql.Element',
            members: [
                {
                    name: 'framed', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous',
                    impl: ({ env }) => {
                        environment = env;

                        return { update: () => {}, dispose: () => {} };
                    },
                },
                {
                    name: 'travel', kind: 'property', result: 'Number',
                    updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'frame', of: 'window' }] },
                    impl: ({ receiver }) => Math.round(receiver.getBoundingClientRect().left),
                },
            ],
        }],
    });

    beforeAll(() => isolated.registerModule(framesModule()));

    beforeEach(async () => {
        document.body.innerHTML = '<div id="box" style="position: absolute; left: 0; top: 0; width: 40px; height: 40px"></div>';
        box = document.getElementById('box');
        isolated.query('import Frames\nbox:framed()', { box }).run();
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('runs a module\'s writes before the reads of the same animation frame, a frame watch\'s evaluation among them', async () => {
        const reads = [];
        const watch = isolated.query('box { declared = it.inlineStyle["width"], width = it.rect?.width }', { box }).watch({ acceptPartialObservation: true });

        watch.subscribe('change', (sender, args) => reads.push(args.value));
        await watch.readyAsync();

        // The change is delivered before the frame, so the watch evaluates in it, after the module's write.
        box.style.width = '60px';
        await Promise.resolve();

        let written = null;

        environment.frame(time => {
            written = time;
            box.style.width = '80px';
        });
        environment.frame(time => reads.push(`read in ${time === written ? 'the same frame' : 'another frame'}`), { phase: 'read' });

        await nextFrame();
        await nextFrame();

        expect(reads).toEqual([{ declared: '40px', width: 40 }, { declared: '80px', width: 80 }, 'read in the same frame']);
        watch.dispose();
    });

    it('follows content moving under no change DOMQL observes, through the frame observation, each frame while it is held', async () => {
        const positions = [];
        const watch = isolated.query('import Frames\nbox:travel', { box }).watch();

        watch.subscribe('change', (sender, args) => positions.push(args.value));
        await watch.readyAsync();

        // An animation moves the box without a mutation or a resize, which only a measurement each frame follows.
        const animation = box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100px)' }], { duration: 10000, fill: 'forwards' });

        animation.pause();
        animation.currentTime = 5000;
        await nextFrame();
        await nextFrame();

        expect(positions).toEqual([0, 50]);

        watch.dispose();
        animation.currentTime = 10000;
        await nextFrame();
        await nextFrame();

        expect(positions).toEqual([0, 50]);
    });
});
