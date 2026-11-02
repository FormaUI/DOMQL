import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/** Lets every task and microtask queued so far run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('FrameSchedule', () => {
    let isolated;
    let panel;
    let frames;
    let order;
    let reported;

    /** A module whose behavior, `framed`, keeps its environment, and whose member, `width`, reads the panel's inline width as it is evaluated, observing its style. */
    const framesModule = () => isolated.createModule('Frames', {
        types: [{
            name: 'FrameElements', kind: 'extension', target: 'Domql.Element',
            members: [
                {
                    name: 'framed', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'continuous',
                    impl: ({ env }) => ({ env, update: () => {}, dispose: () => {} }),
                },
                {
                    name: 'framedEnvironment', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', behavior: 'framed', result: 'Boolean',
                    impl: ({ instance }) => (environment = instance.env) !== null,
                },
                {
                    name: 'width', kind: 'property', result: 'String?',
                    updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['style'] }] },
                    impl: ({ receiver }) => {
                        order.push(`read ${receiver.style.width}`);

                        return receiver.style.width;
                    },
                },
            ],
        }],
    });

    /** The environment of the panel's running behavior. */
    let environment;

    /** Runs the frame the window was asked for, given its time. */
    const runFrame = (time = 16) => {
        const callbacks = frames.callbacks.splice(0);

        callbacks.forEach(callback => callback(time));
    };

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" style="width: 10px"></div>';
        panel = document.getElementById('panel');
        order = [];
        reported = [];
        frames = { callbacks: [] };
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.callbacks.push(callback));
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
        window.reportError = error => reported.push(error);
        isolated.registerModule(framesModule());
        isolated.query('import Frames\npanel:framed()', { panel }).run();
        await isolated.query('import Frames\npanel:framedEnvironment()', { panel }).executeAsync();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete window.reportError;
        document.body.innerHTML = '';
    });

    it('runs a module\'s writes in the next frame before the watches it evaluates, which read what they wrote', async () => {
        const watch = isolated.query('import Frames\npanel:width', { panel }).watch();

        watch.subscribe('change', (sender, args) => order.push(`change ${args.value}`));
        await settle();
        order.length = 0;

        panel.style.width = '20px';
        await settle();
        environment.frame(time => {
            order.push(`write at ${time}`);
            panel.style.width = '30px';
        });

        expect(frames.callbacks).toHaveLength(1);

        runFrame(16);

        expect(order).toEqual(['write at 16', 'read 30px', 'change 30px']);
        watch.dispose();
    });

    it('runs a read after every write of its frame, and what a frame asks for in its own phase in the next', () => {
        environment.frame(() => {
            order.push('write');
            environment.frame(() => order.push('read asked by the write'), { phase: 'read' });
            environment.frame(() => order.push('write asked by the write'));
        });
        environment.frame(() => {
            order.push('read');
            environment.frame(() => order.push('read asked by the read'), { phase: 'read' });
        }, { phase: 'read' });

        runFrame();

        expect(order).toEqual(['write', 'read', 'read asked by the write']);

        runFrame();

        expect(order).toEqual(['write', 'read', 'read asked by the write', 'write asked by the write', 'read asked by the read']);
    });

    it('withdraws what is canceled, and runs every callback of a frame where one fails, reporting the failure', () => {
        const failure = new Error('broken write');

        environment.frame(() => order.push('canceled')).cancel();
        environment.frame(() => {
            throw failure;
        });
        environment.frame(() => order.push('after the failure'));

        runFrame();

        expect(order).toEqual(['after the failure']);
        expect(reported).toEqual([failure]);
    });

    it('is refused a callback that is no function, or a phase it doesn\'t have', () => {
        const refusal = call => {
            try {
                call();
            } catch (error) {
                return { kind: error.kind, code: error.code };
            }

            return null;
        };
        const refused = { kind: 'structure', code: 'DOMQL2011' };

        expect(refusal(() => environment.frame('later'))).toEqual(refused);
        expect(refusal(() => environment.frame(() => {}, { phase: 'paint' }))).toEqual(refused);
    });

    it('is refused in a window without animation frames', async () => {
        const bare = { document };

        isolated.query('import Frames\npanel:framed()', { panel }).run({ window: bare, owner: 'bare' });
        await isolated.query('import Frames\npanel:framedEnvironment()', { panel }).executeAsync({ window: bare, owner: 'bare' });

        expect(() => environment.frame(() => {})).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2011' }));
    });
});
