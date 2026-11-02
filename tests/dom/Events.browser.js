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

    describe('keyboard events and what every event carries', () => {
        it('capture a key the user presses with the modifiers held, and AltGr, which the browser answers through getModifierState alone', async () => {
            document.body.innerHTML = '<input id="field">';

            const field = document.getElementById('field');
            const keys = subscribe('field.on("keydown") { code = it.code, ctrl = it.ctrlKey, shift = it.shiftKey, altGraph = it.altGraphKey, repeat = it.repeat }', { field });

            field.focus();
            await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}');
            keys.splice(0, 2);
            field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '@', code: 'KeyQ', modifierAltGraph: true, repeat: true }));

            expect(keys).toEqual([{ code: 'KeyK', ctrl: true, shift: true, altGraph: false, repeat: false }, { code: 'KeyQ', ctrl: false, shift: false, altGraph: true, repeat: true }]);
        });

        it('capture the elements an event passes through, across an open shadow root, and whether a listener before the subscription cancelled it', async () => {
            document.body.innerHTML = '<div id="host"></div>';

            const host = document.getElementById('host');
            const shadowRoot = host.attachShadow({ mode: 'open' });

            shadowRoot.innerHTML = '<button id="inner">Press</button>';
            shadowRoot.getElementById('inner').addEventListener('click', event => event.preventDefault());

            const clicks = subscribe('Domql.document.on("click") { path = it.composedPath { name = it.localName }, cancelled = it.defaultPrevented, target = it.target.localName }');

            await userEvent.click(shadowRoot.getElementById('inner'));

            expect(clicks).toEqual([{ path: [{ name: 'button' }, { name: 'div' }, { name: 'body' }, { name: 'html' }], cancelled: true, target: 'div' }]);
        });
    });

    describe('focus, editing, presentation, animation, loading and media events', () => {
        /** Waits for the next event of the type at the target. */
        const next = (target, type) => new Promise(resolve => target.addEventListener(type, resolve, { once: true }));

        it('capture focus moving within a container, which focusin and focusout bubble to, with the element it leaves and the one it moves to', async () => {
            document.body.innerHTML = '<div id="panel"><input id="first"><input id="second"></div><button id="outside">Out</button>';

            const panel = document.getElementById('panel');
            const moves = subscribe('panel.on("focusout") { from = it.target?["id"], to = it.relatedTarget?["id"] }', { panel });
            const arrivals = subscribe('panel.on("focusin") { to = it.target?["id"], from = it.relatedTarget?["id"] }', { panel });

            await userEvent.click(document.getElementById('first'));
            await userEvent.click(document.getElementById('second'));
            await userEvent.click(document.getElementById('outside'));

            expect(arrivals).toEqual([{ to: 'first', from: null }, { to: 'second', from: 'first' }]);
            expect(moves).toEqual([{ from: 'first', to: 'second' }, { from: 'second', to: 'outside' }]);
        });

        it('capture an edit the user types, and an input event a select fires, which names no kind', async () => {
            document.body.innerHTML = '<input id="field"><select id="list"><option>1</option><option>2</option></select>';

            const field = document.getElementById('field');
            const list = document.getElementById('list');
            const typed = subscribe('field.on("beforeinput") { kind = it.inputType, data = it.data, composing = it.isComposing }', { field });
            const chosen = subscribe('list.on("input") { kind = it.inputType, data = it.data, composing = it.isComposing }', { list });

            await userEvent.type(field, 'a');
            await userEvent.selectOptions(list, '2');

            expect(typed).toEqual([{ kind: 'insertText', data: 'a', composing: false }]);
            expect(chosen).toEqual([{ kind: '', data: null, composing: false }]);
        });

        it('capture the formats a paste carries from its clipboard data, and a composition\'s text', () => {
            document.body.innerHTML = '<div id="editor" contenteditable="true"></div>';

            const editor = document.getElementById('editor');
            const pastes = subscribe('editor.on("paste") { types = it.types }', { editor });
            const compositions = subscribe('editor.on("compositionend") { data = it.data }', { editor });
            const clipboardData = new DataTransfer();

            clipboardData.setData('text/plain', 'pasted');
            editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData }));
            editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'か' }));

            expect(pastes).toEqual([{ types: ['text/plain'] }]);
            expect(compositions).toEqual([{ data: 'か' }]);
        });

        it('capture a popover, a details element and a dialog toggling, and a dialog closing', async () => {
            document.body.innerHTML = '<div id="tip" popover>Tip</div><details id="more"><summary>More</summary>Text</details><dialog id="dialog">Dialog</dialog>';

            const tip = document.getElementById('tip');
            const more = document.getElementById('more');
            const dialog = document.getElementById('dialog');
            const toggles = subscribe('tip.on("beforetoggle") { from = it.oldState, to = it.newState }', { tip });
            const shown = subscribe('more.on("toggle") { from = it.oldState, to = it.newState }', { more });
            const dialogs = subscribe('dialog.on("toggle") { from = it.oldState, to = it.newState }', { dialog });
            const closes = subscribe('dialog.on("close") { target = it.target?["id"] }', { dialog });

            tip.showPopover();
            more.open = true;
            await next(more, 'toggle');
            dialog.showModal();
            await next(dialog, 'toggle');
            dialog.close();
            await next(dialog, 'close');

            // A modal dialog opening hides the popover.
            expect(toggles).toEqual([{ from: 'closed', to: 'open' }, { from: 'open', to: 'closed' }]);
            expect(shown).toEqual([{ from: 'closed', to: 'open' }]);
            expect(dialogs[0]).toEqual({ from: 'closed', to: 'open' });
            expect(closes).toEqual([{ target: 'dialog' }]);
        });

        it('capture an animation starting and ending, by the name of its keyframes', async () => {
            document.body.innerHTML = '<style>@keyframes fade { from { opacity: 0 } to { opacity: 1 } }</style><div id="box"></div>';

            const box = document.getElementById('box');
            const animations = subscribe('box.on("animationstart") { name = it.animationName }', { box });
            const ended = subscribe('box.on("animationend") { name = it.animationName }', { box });
            const done = next(box, 'animationend');

            box.style.animation = 'fade 10ms';
            await done;

            expect(animations).toEqual([{ name: 'fade' }]);
            expect(ended).toEqual([{ name: 'fade' }]);
        });

        it('capture an image loading and failing, and a media element\'s volume changing', async () => {
            document.body.innerHTML = '<img id="good"><img id="bad"><video id="video"></video>';

            const [good, bad, video] = ['good', 'bad', 'video'].map(id => document.getElementById(id));
            const loads = subscribe('good.on("load") { target = it.target?["id"] }', { good });
            const errors = subscribe('bad.on("error") { target = it.target?["id"] }', { bad });
            const volumes = subscribe('video.on("volumechange") { target = it.target?["id"] }', { video });
            const loaded = next(good, 'load');
            const failed = next(bad, 'error');
            const changed = next(video, 'volumechange');

            good.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            bad.src = 'data:image/png;base64,broken';
            video.volume = 0.5;
            await Promise.all([loaded, failed, changed]);

            expect([loads, errors, volumes]).toEqual([[{ target: 'good' }], [{ target: 'bad' }], [{ target: 'video' }]]);
        });
    });

    describe('reactions', () => {
        it('are carried out inside the dispatch of the event the user\'s press gives, with its activation, before the handler hears of it', async () => {
            document.body.innerHTML = '<button id="button" data-copy="link">Copy</button>';

            const button = document.getElementById('button');
            const order = [];

            // A once execution that answers what it finds as it is invoked: the event being dispatched, whether the user has just acted, and the text it was given.
            domql.registerModule(domql.createModule('Activation', {
                members: [{
                    name: 'activationNow', kind: 'function', invokedBy: 'host', requestKind: 'execution', executionMode: 'once', arguments: 'positional',
                    parameters: [{ name: 'text', kind: 'value', type: 'String', required: true }],
                    result: 'String',
                    impl: ({ args: { text }, env }) => {
                        order.push('reaction');

                        return `${env.window.event?.type} ${env.window.navigator.userActivation.isActive} ${text}`;
                    },
                }],
            }));

            const reaction = domql.query('import Activation\nActivation.activationNow(event.text)');
            const results = [];

            listeners.push(domql.query('button.on("click") { text = it.target?["data-copy"] }', { button }).subscribe((sender, args) => {
                order.push('handler');
                results.push(...args.reactions);
            }, { reactions: [reaction] }));

            await userEvent.click(button);

            expect(order).toEqual(['reaction', 'handler']);
            expect(await results[0]).toBe('click true link');
        });
    });
});
