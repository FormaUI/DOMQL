import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/** The error a call throws. */
const getError = call => {
    try {
        call();
    } catch (error) {
        return error;
    }

    throw new Error('The call threw nothing');
};

describe('Behaviors', () => {
    // Each test loads its own copy of DOMQL, with a registry of its own.
    let isolated;
    let panel;
    let other;
    let calls;

    /** A host call of an element extension. */
    const hostCall = (name, overrides) => ({ name, kind: 'function', invokedBy: 'host', ...overrides });

    /**
     * A module of a popover behavior, `popover(color)`, whose running instance answers `open()` and offers what it was opened with; its commands, `open(reason)` and `close()`; and a member, `note`, whose implementation
     * reads the environment's owner.
     */
    const popovers = () => isolated.createModule('Popovers', {
        types: [{
            name: 'PopoverElements', kind: 'extension', target: 'Domql.Element',
            members: [
                hostCall('popover', {
                    requestKind: 'execution', executionMode: 'continuous', arguments: 'positional',
                    parameters: [{ name: 'color', kind: 'value', type: 'String', required: true }],
                    impl: ({ receiver, args: { color }, env }) => {
                        const instance = {
                            receiver, color, owner: env.owner, opened: [],
                            open: reason => instance.opened.push(reason),
                            update: (next, { color: nextColor }) => Object.assign(instance, { receiver: next, color: nextColor }),
                            dispose: () => calls.push({ call: 'dispose', color: instance.color }),
                        };

                        calls.push({ call: 'start', color, owner: env.owner });

                        return instance;
                    },
                }),
                hostCall('open', {
                    requestKind: 'execution', executionMode: 'once', behavior: 'popover', arguments: 'positional',
                    parameters: [{ name: 'reason', kind: 'value', type: 'String', required: true }],
                    result: 'String',
                    impl: ({ receiver, args: { reason }, env, instance }) => {
                        calls.push({ call: 'open', receiver, owner: env.owner, color: instance.color });
                        instance.open(reason);

                        return instance.color;
                    },
                }),
                {
                    name: 'note', kind: 'property', result: 'String',
                    updates: { changes: 'constant', reads: 'fresh' },
                    impl: ({ env }) => `for ${env.owner ?? 'nobody'}`,
                },
            ],
        }],
    });

    const run = (text, bindings, options) => isolated.query(`import Popovers\n${text}`, bindings).run(options);
    const execute = (text, bindings, options) => isolated.query(`import Popovers\n${text}`, bindings).executeAsync(options);

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"></div><div id="other"></div>';
        panel = document.getElementById('panel');
        other = document.getElementById('other');
        calls = [];
        isolated.registerModule(popovers());
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('the owner', () => {
        it('reaches every implementation an operation reaches as env.owner, null where the operation names none', async () => {
            expect(isolated.query('import Popovers\npanel:note', { panel }).evaluate({ owner: 'menu' })).toBe('for menu');
            expect(isolated.query('import Popovers\npanel:note', { panel }).evaluate()).toBe('for nobody');
            expect(await isolated.query('import Popovers\npanel:note', { panel }).evaluateAsync({ owner: 'menu' })).toBe('for menu');

            const watch = isolated.query('import Popovers\npanel:note', { panel }).watch({ owner: 'menu', schedule: 'immediate' });

            expect(await watch.readyAsync()).toBe('for menu');
            watch.dispose();

            run('panel:popover("gold")', { panel }, { owner: 'menu' });
            run('other:popover("teal")', { other });

            expect(calls).toEqual([{ call: 'start', color: 'gold', owner: 'menu' }, { call: 'start', color: 'teal', owner: null }]);
        });

        it('is any value, an object as well as a string, told apart as a map tells its keys apart', async () => {
            const owner = { id: 7 };

            run('panel:popover("gold")', { panel }, { owner });

            expect(await execute('panel:open("hover")', { panel }, { owner })).toBe('gold');
            await expect(execute('panel:open("hover")', { panel }, { owner: { id: 7 } })).rejects.toMatchObject({ code: 'DOMQL5016' });
        });

        it('gives one environment to every implementation of one operation, through every update of a continuous execution', () => {
            const environments = [];

            isolated.registerModule(isolated.createModule('Tracks', {
                types: [{
                    name: 'TrackElements', kind: 'extension', target: 'Domql.Element',
                    members: [
                        hostCall('track', {
                            requestKind: 'execution', executionMode: 'continuous', arguments: 'positional',
                            parameters: [{ name: 'label', kind: 'value', type: 'String', required: true }],
                            impl: ({ env }) => {
                                environments.push(env);

                                return { update: () => {}, dispose: () => {} };
                            },
                        }),
                        { name: 'label', kind: 'property', result: 'String', updates: { changes: 'constant', reads: 'fresh' }, impl: ({ receiver, env }) => (environments.push(env), receiver.id) },
                    ],
                }],
            }));

            const tracking = isolated.query('import Tracks\nlet label = panel:label\nreturn panel:track(label)', { panel }).run({ owner: 'menu' });

            tracking.update({ panel: other });

            expect(environments).toHaveLength(3);
            expect(new Set(environments).size).toBe(1);
            expect(environments[0]).toEqual({ window, document, owner: 'menu' });
            expect(Object.isFrozen(environments[0])).toBe(true);
        });
    });

    describe('a command', () => {
        it('reaches the instance of its behavior running for its owner on its receiver, which its implementation receives', async () => {
            run('panel:popover("gold")', { panel }, { owner: 'menu' });

            expect(await execute('panel:open("hover")', { panel }, { owner: 'menu' })).toBe('gold');
            expect(calls.at(-1)).toEqual({ call: 'open', receiver: panel, owner: 'menu', color: 'gold' });
        });

        it('rejects where none runs for its owner on its receiver, executing nothing, located at the command', async () => {
            run('panel:popover("gold")', { panel }, { owner: 'menu' });

            for (const [bindings, options] of [[{ panel }, {}], [{ panel }, { owner: 'list' }], [{ panel: other }, { owner: 'menu' }]]) {
                await expect(execute('panel:open("hover")', bindings, options)).rejects.toMatchObject({
                    kind: 'evaluation',
                    code: 'DOMQL5016',
                    message: expect.stringContaining("No 'popover' runs for this owner on this receiver, and the command 'open' reaches its running instance alone"),
                    location: { pointer: '/expression', offset: 16, line: 2, column: 1 },
                });
            }

            expect(calls.filter(({ call }) => call === 'open')).toEqual([]);
        });

        it('reaches the latest instance where several run for its owner on its receiver, and the one before it once the latest ends', async () => {
            run('panel:popover("gold")', { panel });

            const later = run('panel:popover("teal")', { panel });

            expect(await execute('panel:open("hover")', { panel })).toBe('teal');

            later.dispose();

            expect(await execute('panel:open("hover")', { panel })).toBe('gold');
        });

        it('follows an update that moves its behavior to another receiver, and reaches none once the behavior ends', async () => {
            const popover = run('panel?:popover("gold")', { panel });

            popover.update({ panel: other });

            expect(await execute('panel:open("hover")', { panel: other })).toBe('gold');
            await expect(execute('panel:open("hover")', { panel })).rejects.toMatchObject({ code: 'DOMQL5016' });

            popover.update({ panel: null });

            await expect(execute('panel:open("hover")', { panel: other })).rejects.toMatchObject({ code: 'DOMQL5016' });

            popover.update({ panel });

            expect(await execute('panel:open("hover")', { panel })).toBe('gold');

            popover.dispose();

            await expect(execute('panel:open("hover")', { panel })).rejects.toMatchObject({ code: 'DOMQL5016' });
        });

        it('stays with the receiver it ran on where an update moving it fails', async () => {
            isolated.registerModule(isolated.createModule('Stuck', {
                types: [{
                    name: 'StuckElements', kind: 'extension', target: 'Domql.Element',
                    members: [
                        hostCall('stuck', { requestKind: 'execution', executionMode: 'continuous', impl: () => ({ update: () => { throw new Error('stuck'); }, dispose: () => {} }) }),
                        hostCall('poke', { requestKind: 'execution', executionMode: 'once', behavior: 'stuck', result: 'Boolean', impl: () => true }),
                    ],
                }],
            }));

            const stuck = isolated.query('import Stuck\npanel:stuck()', { panel }).run();

            expect(getError(() => stuck.update({ panel: other })).code).toBe('DOMQL5006');
            expect(await isolated.query('import Stuck\npanel:poke()', { panel }).executeAsync()).toBe(true);
            await expect(isolated.query('import Stuck\npanel:poke()', { panel: other }).executeAsync()).rejects.toMatchObject({ code: 'DOMQL5016' });
        });

        it('reaches a module member behavior, which runs on no receiver', async () => {
            isolated.registerModule(isolated.createModule('Session', {
                members: [
                    hostCall('session', { requestKind: 'execution', executionMode: 'continuous', impl: () => ({ name: 'main', update: () => {}, dispose: () => {} }) }),
                    hostCall('sessionName', { requestKind: 'execution', executionMode: 'once', behavior: 'session', result: 'String', impl: ({ instance }) => instance.name }),
                ],
            }));

            const session = isolated.query('import Session\nSession.session()').run();

            expect(await isolated.query('import Session\nSession.sessionName()').executeAsync()).toBe('main');

            session.dispose();

            await expect(isolated.query('import Session\nSession.sessionName()').executeAsync()).rejects.toMatchObject({ code: 'DOMQL5016' });
        });
    });

    describe('a declaration naming a behavior', () => {
        /** The module error creating a module whose one extension holds the members given throws, with its location's attributes. */
        const refusalOf = members => {
            try {
                isolated.createModule('Desk', { types: [{ name: 'DeskElements', kind: 'extension', target: 'Domql.Element', members }] });
            } catch (error) {
                return { kind: error.kind, code: error.code, message: error.message.replace(/ [(]in the module .*$/, ''), ...error.location };
            }

            throw new Error('The module was created');
        };

        const behavior = hostCall('lamp', { requestKind: 'execution', executionMode: 'continuous' });

        it('is refused where it names no continuous execution of its module, at the declaration and its behavior', () => {
            expect(refusalOf([behavior, hostCall('light', { requestKind: 'execution', executionMode: 'once', behavior: 'lantern' })])).toEqual({
                kind: 'module',
                code: 'DOMQL4012',
                message: "'lantern' is no continuous execution the module 'Desk' declares, whose running instance a declaration naming it reaches",
                module: 'Desk', type: 'DeskElements', declaration: 'light', declarationKey: 'behavior',
            });
            expect(refusalOf([behavior, hostCall('light', { requestKind: 'execution', executionMode: 'once', behavior: 'light' })]).code).toBe('DOMQL4012');
        });

        it('is refused where it is no command, or names its behavior by no name', () => {
            const refused = {
                kind: 'module',
                code: 'DOMQL4011',
                message: 'A command, a once execution, names by its behavior the continuous execution of its module whose running instance it reaches, and no other declaration names one',
                module: 'Desk', type: 'DeskElements', declarationKey: 'behavior',
            };

            expect(refusalOf([hostCall('lamp', { requestKind: 'execution', executionMode: 'continuous', behavior: 'lamp' })])).toEqual({ ...refused, declaration: 'lamp' });
            expect(refusalOf([behavior, { name: 'glow', kind: 'property', result: 'Number', behavior: 'lamp', updates: { changes: 'constant', reads: 'fresh' } }])).toEqual({ ...refused, declaration: 'glow' });
            expect(refusalOf([behavior, hostCall('light', { requestKind: 'execution', executionMode: 'once', behavior: '' })])).toEqual({ ...refused, declaration: 'light' });
            expect(refusalOf([behavior, hostCall('light', { requestKind: 'execution', executionMode: 'once', behavior: 7 })])).toEqual({ ...refused, declaration: 'light' });
        });
    });
});
