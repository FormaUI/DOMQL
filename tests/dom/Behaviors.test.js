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
                message: 'A command, a once execution, and an event source of occurrences name by their behavior the continuous execution of their module whose running instance they reach, and no other declaration names one',
                module: 'Desk', type: 'DeskElements', declarationKey: 'behavior',
            };

            expect(refusalOf([hostCall('lamp', { requestKind: 'execution', executionMode: 'continuous', behavior: 'lamp' })])).toEqual({ ...refused, declaration: 'lamp' });
            expect(refusalOf([behavior, { name: 'glow', kind: 'property', result: 'Number', behavior: 'lamp', updates: { changes: 'constant', reads: 'fresh' } }])).toEqual({ ...refused, declaration: 'glow' });
            expect(refusalOf([behavior, hostCall('light', { requestKind: 'execution', executionMode: 'once', behavior: '' })])).toEqual({ ...refused, declaration: 'light' });
            expect(refusalOf([behavior, hostCall('light', { requestKind: 'execution', executionMode: 'once', behavior: 7 })])).toEqual({ ...refused, declaration: 'light' });
        });
    });
});

describe('Behaviors\' occurrences', () => {
    let isolated;
    let zone;
    let other;
    let reported;

    /** The running instances of the zone behavior, in the order they started. */
    let zones;

    const hostCall = (name, overrides) => ({ name, kind: 'function', invokedBy: 'host', ...overrides });

    /**
     * A module of a zone behavior, `zone(label)`, whose instance delivers what `drop(key)` and `hover(key)` give it to its event sources `drops` and `hovers`, and its deliver as it was given; and `beats`, an event
     * source of its own implementation, whose deliver the tests keep.
     */
    const zonesModule = () => isolated.createModule('Zones', {
        types: [
            { name: 'Drop', kind: 'structured', members: [{ name: 'key', kind: 'property', result: 'String' }, { name: 'label', kind: 'property', result: 'String' }] },
            {
                name: 'ZoneElements', kind: 'extension', target: 'Domql.Element',
                members: [
                    hostCall('zone', {
                        requestKind: 'execution', executionMode: 'continuous', arguments: 'positional',
                        parameters: [{ name: 'label', kind: 'value', type: 'String', required: true }],
                        impl: ({ args: { label }, deliver }) => {
                            const instance = {
                                label, deliver,
                                drop: key => deliver('drops', { key, label: instance.label }),
                                hover: key => deliver('hovers', { key, label: instance.label }),
                                update: (receiver, next) => Object.assign(instance, next),
                                dispose: () => {},
                            };

                            zones.push(instance);

                            return instance;
                        },
                    }),
                    hostCall('drops', { requestKind: 'subscription', behavior: 'zone', result: 'Drop' }),
                    hostCall('hovers', { requestKind: 'subscription', behavior: 'zone', result: 'Drop' }),
                ],
            },
        ],
    });

    const run = (bindings, options, label = 'files') => isolated.query(`import Zones\nzone?:zone("${label}")`, bindings).run(options);

    /** Subscribes to a source of the zone behavior, keeping what each handler receives. */
    const listen = (source, bindings, options, handle = () => {}) => {
        const received = [];
        const listener = isolated.query(`import Zones\nzone:${source}() { key = it.key, label = it.label }`, bindings).subscribe((sender, args) => {
            received.push(args.status === 'ready' ? args.value : { status: args.status, code: args.error.code });

            return handle(args);
        }, options);

        return { received, listener };
    };

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="zone"></div><div id="other"></div>';
        zone = document.getElementById('zone');
        other = document.getElementById('other');
        reported = [];
        zones = [];
        window.reportError = error => reported.push(error);
        isolated.registerModule(zonesModule());
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete window.reportError;
    });

    describe('a subscription to a behavior\'s source', () => {
        it('hears every occurrence the behavior delivers to its source, in the order delivered and never coalesced, each subscription in the order it subscribed', () => {
            const order = [];
            const first = listen('drops', { zone }, {}, args => order.push(['first', args.value.key]));
            const second = listen('drops', { zone }, {}, args => order.push(['second', args.value.key]));
            const hovers = listen('hovers', { zone });

            run({ zone });
            zones[0].drop('a');
            zones[0].drop('a');
            zones[0].hover('b');
            zones[0].drop('c');

            expect(first.received).toEqual([{ key: 'a', label: 'files' }, { key: 'a', label: 'files' }, { key: 'c', label: 'files' }]);
            expect(second.received).toEqual(first.received);
            expect(hovers.received).toEqual([{ key: 'b', label: 'files' }]);
            expect(order).toEqual([['first', 'a'], ['second', 'a'], ['first', 'a'], ['second', 'a'], ['first', 'c'], ['second', 'c']]);
        });

        it('projects each occurrence and calls each handler before deliver returns, inside the native dispatch of the listener that delivers it', () => {
            const order = [];

            listen('drops', { zone }, {}, () => order.push('handled'));
            run({ zone });
            zone.addEventListener('click', event => {
                zones[0].drop('a');
                order.push(event.eventPhase === Event.AT_TARGET ? 'delivered while dispatching' : 'delivered after');
            });
            zone.click();

            expect(order).toEqual(['handled', 'delivered while dispatching']);
        });

        it('never throws into the code that delivers, whatever a handler does, and hands every other subscription the occurrence', () => {
            const quiet = listen('drops', { zone });

            listen('drops', { zone }, {}, () => {
                throw new Error('broken handler');
            });
            run({ zone });

            let after = false;

            expect(() => {
                zones[0].drop('a');
                after = true;
            }).not.toThrow();
            expect(after).toBe(true);
            expect(quiet.received).toEqual([{ key: 'a', label: 'files' }]);
            expect(reported.map(error => error.message)).toEqual(['broken handler']);
        });

        it('outlives the behavior\'s replacement and release, hearing an instance started after it subscribed', () => {
            const drops = listen('drops', { zone });
            const first = run({ zone });

            zones[0].drop('a');
            first.update({ zone, label: 'images' });
            zones[0].drop('b');
            first.dispose();
            run({ zone }, {}, 'notes');
            zones[1].drop('c');

            expect(drops.received).toEqual([{ key: 'a', label: 'files' }, { key: 'b', label: 'files' }, { key: 'c', label: 'notes' }]);
            expect(drops.listener.status).toBe('ready');
        });

        it('hears the behavior of its own owner on its own receiver alone, every instance running there', () => {
            const owned = listen('drops', { zone }, { owner: 'sidebar' });
            const unowned = listen('drops', { zone });
            const elsewhere = listen('drops', { zone: other }, { owner: 'sidebar' });

            run({ zone }, { owner: 'sidebar' });
            run({ zone }, { owner: 'sidebar' }, 'notes');
            run({ zone });
            zones[0].drop('a');
            zones[1].drop('b');
            zones[2].drop('c');

            expect(owned.received).toEqual([{ key: 'a', label: 'files' }, { key: 'b', label: 'notes' }]);
            expect(unowned.received).toEqual([{ key: 'c', label: 'files' }]);
            expect(elsewhere.received).toEqual([]);
        });

        it('hears nothing more of a behavior an update moves to another receiver, whose subscriptions hear it from the update on, one subscribed before the update losing nothing', () => {
            const left = listen('drops', { zone });
            const entered = listen('drops', { zone: other });
            const zoneOf = run({ zone });

            zones[0].drop('a');
            zoneOf.update({ zone: other });
            zones[0].drop('b');

            expect(left.received).toEqual([{ key: 'a', label: 'files' }]);
            expect(entered.received).toEqual([{ key: 'b', label: 'files' }]);
        });

        it('stops hearing once disposed, and starts nothing of its own where its receiver is null', () => {
            const drops = listen('drops', { zone });

            run({ zone });
            drops.listener.dispose();
            zones[0].drop('a');

            const skipped = isolated.query('import Zones\nzone?:drops() { key = it.key }', { zone: null }).subscribe(() => {});

            expect(drops.received).toEqual([]);
            expect(skipped.status).toBe('ready');
        });
    });

    describe('deliver\'s promise', () => {
        it('settles once every subscription has applied the occurrence: its handler returned, and the promise it returned fulfilled', async () => {
            let finish;
            const order = [];

            listen('drops', { zone }, {}, () => order.push('sync'));
            listen('drops', { zone }, {}, () => new Promise(resolve => {
                finish = resolve;
            }).then(() => order.push('async')));
            run({ zone });

            const delivered = zones[0].drop('a').then(() => order.push('acknowledged'));

            await Promise.resolve();
            expect(order).toEqual(['sync']);

            finish();
            await delivered;

            expect(order).toEqual(['sync', 'async', 'acknowledged']);
        });

        it('rejects where no subscription listens, or one ends before it applies the occurrence, with DOMQL5017', async () => {
            run({ zone });

            await expect(zones[0].drop('a')).rejects.toMatchObject({ kind: 'evaluation', code: 'DOMQL5017', location: { pointer: '/expression/chain', offset: 13, line: 2, column: 1 } });

            const { listener } = listen('drops', { zone }, {}, () => new Promise(() => {}));
            const pending = zones[0].drop('b');

            listener.dispose();

            await expect(pending).rejects.toMatchObject({ kind: 'evaluation', code: 'DOMQL5017', message: expect.stringContaining('The subscription ended before it applied the occurrence') });
            expect(reported).toEqual([]);
        });

        it('rejects where a subscription fails to apply it, with DOMQL5020 whose cause is the failure, the handler\'s going to the window\'s error reporting as well', async () => {
            const thrown = new Error('broken handler');

            listen('drops', { zone }, {}, () => {
                throw thrown;
            });
            run({ zone });

            await expect(zones[0].drop('a')).rejects.toMatchObject({ kind: 'evaluation', code: 'DOMQL5020', cause: thrown, location: { pointer: '/expression/context', offset: 13, line: 2, column: 1 } });
            expect(reported).toEqual([thrown]);
        });

        it('rejects where the subscription\'s projection fails, which its handler receives, and where the handler\'s promise rejects', async () => {
            const failed = isolated.query('import Zones\nzone:drops() { size = (it.key to Number) }', { zone }).subscribe(() => {});
            const rejected = new Error('rejected');

            run({ zone });

            await expect(zones[0].drop('x')).rejects.toMatchObject({ code: 'DOMQL5020', cause: expect.objectContaining({ kind: 'evaluation' }) });

            failed.dispose();
            listen('drops', { zone }, {}, () => Promise.reject(rejected));

            await expect(zones[0].drop('a')).rejects.toMatchObject({ code: 'DOMQL5020', cause: rejected });
            expect(reported).toEqual([rejected]);
        });

        it('rejects, delivering nothing, once the behavior has ended, and is never reported where the behavior leaves it', async () => {
            const drops = listen('drops', { zone });
            const zoneOf = run({ zone });
            const { deliver } = zones[0];

            zoneOf.dispose();

            await expect(deliver('drops', { key: 'a', label: 'late' })).rejects.toMatchObject({ code: 'DOMQL5018', location: { pointer: '/expression/chain', offset: 13, line: 2, column: 1 } });
            expect(drops.received).toEqual([]);

            deliver('drops', { key: 'b', label: 'left' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(reported).toEqual([]);
        });

        it('rejects a source its behavior has none of, raised as an error event of the behavior\'s handle', async () => {
            const zoneOf = run({ zone });
            const errors = [];

            zoneOf.subscribe('error', (sender, args) => errors.push(args.error));

            await expect(zones[0].deliver('presses', {})).rejects.toMatchObject({ kind: 'evaluation', code: 'DOMQL5019', message: expect.stringContaining("'presses' is no event source of 'zone', whose occurrences are delivered to 'drops', 'hovers'") });
            expect(errors.map(error => error.code)).toEqual(['DOMQL5019']);
        });

        it('acknowledges an event an event source of a module\'s own delivers, as its subscription applies it', async () => {
            let deliver;

            isolated.registerModule(isolated.createModule('Beats', {
                types: [{
                    name: 'BeatElements', kind: 'extension', target: 'Domql.Element',
                    members: [hostCall('beats', {
                        requestKind: 'subscription', result: 'Number',
                        impl: ({ deliver: delivers }) => {
                            deliver = delivers;

                            return { stop: () => {} };
                        },
                    })],
                }],
            }));

            const received = [];
            const beats = isolated.query('import Beats\nzone:beats()', { zone }).subscribe((sender, args) => received.push(args.value));

            await expect(deliver(1)).resolves.toBeUndefined();

            beats.dispose();

            await expect(deliver(2)).rejects.toMatchObject({ code: 'DOMQL5017' });
            expect(received).toEqual([1]);
        });
    });

    describe('a behavior\'s event source', () => {
        const refusalOf = members => {
            try {
                isolated.createModule('Desk', { types: [{ name: 'DeskElements', kind: 'extension', target: 'Domql.Element', members }] });
            } catch (error) {
                return { code: error.code, message: error.message.replace(/ [(]in the module .*$/, ''), ...error.location };
            }

            throw new Error('The module was created');
        };
        const lamp = hostCall('lamp', { requestKind: 'execution', executionMode: 'continuous' });

        it('is refused where it declares an implementation or parameters, since DOMQL carries it out', () => {
            expect(refusalOf([lamp, hostCall('glows', { requestKind: 'subscription', behavior: 'lamp', result: 'Number', impl: () => ({ stop() {} }) })])).toEqual({
                code: 'DOMQL4013',
                message: 'An event source of a behavior is carried out by DOMQL, which delivers each occurrence the behavior hands it, so it declares no impl',
                module: 'Desk', type: 'DeskElements', declaration: 'glows', declarationKey: 'impl',
            });
            expect(refusalOf([lamp, hostCall('glows', { requestKind: 'subscription', behavior: 'lamp', result: 'Number', arguments: 'positional', parameters: [{ name: 'kind', kind: 'value', type: 'String', required: true }] })])).toEqual({
                code: 'DOMQL4013',
                message: 'An event source of a behavior delivers each occurrence the behavior hands it, which no argument selects, so it declares no parameters',
                module: 'Desk', type: 'DeskElements', declaration: 'glows', declarationKey: 'parameters',
            });
        });

        it('is refused where its behavior is no continuous execution of its module', () => {
            expect(refusalOf([lamp, hostCall('glows', { requestKind: 'subscription', behavior: 'lantern', result: 'Number' })]).code).toBe('DOMQL4012');
        });
    });
});
