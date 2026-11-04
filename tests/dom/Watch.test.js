import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { QueryEvaluation } from '#domql/dom/QueryEvaluation.mjs';
import { Watch } from '#domql/dom/Watch.mjs';

/** Lets the observations deliver and the watches that follow them evaluate. */
const settle = (milliseconds = 0) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** The error a promise rejects with. */
const rejection = promise => promise.then(() => { throw new Error('The promise resolved'); }, error => error);

/** An extension of DOMQL's elements, named for the module that declares it, holding the members given. */
const elementExtension = (moduleName, members) => ({ name: `${moduleName}Elements`, kind: 'extension', target: 'Domql.Element', members });

describe('Watch', () => {
    // Each test loads its own copy of DOMQL, with a registry of its own.
    let isolated;
    let panel;
    let snapshots;
    let failures;
    let reported;
    let watches;
    let gauges;
    let evaluations;
    let broken;

    /** The observation of every attribute of the receiver. */
    const ATTRIBUTES = [{ type: 'mutation', of: 'receiver', attributes: true }];

    /** The property `level`, kept by the observation type `level`, which the module `Level` declares. */
    const levelProperty = () => ({
        name: 'level', kind: 'property', result: 'Number?',
        updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'level', of: 'receiver' }] },
        impl: ({ samples: [sample] }) => sample,
    });

    /** The property `tally`, which counts the evaluations that read it. */
    const tallyProperty = () => ({ name: 'tally', kind: 'property', result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: ATTRIBUTES }, impl: () => ++evaluations });

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" data-n="1"><i data-n="1"></i><i data-n="2"></i></div>';
        panel = document.getElementById('panel');
        snapshots = [];
        failures = [];
        reported = [];
        watches = [];
        gauges = new Map();
        evaluations = 0;
        broken = false;
        window.reportError = error => reported.push(error);

        // A member kept by an observation whose samples the test supplies, one gauge for each element.
        isolated.registerModule(isolated.createModule('Level', {
            observationTypes: [{
                name: 'level', contract: 'maintained',
                impl: ({ request: { target }, notify }) => {
                    const gauge = { sample: { pending: true, value: null }, stopped: 0, notify };

                    gauges.set(target, gauge);

                    return { stop: () => gauge.stopped++, sample: () => gauge.sample };
                },
            }],
            types: [elementExtension('Level', [levelProperty()])],
        }));

        // A member that counts the evaluations that read it, and one that fails while the test says so, both changing with the attributes of their element.
        isolated.registerModule(isolated.createModule('Tally', { types: [elementExtension('Tally', [tallyProperty()])] }));
        isolated.registerModule(isolated.createModule('Flaky', {
            types: [elementExtension('Flaky', [{
                name: 'flaky', kind: 'property', result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: ATTRIBUTES },
                impl: ({ receiver: element }) => {
                    if (broken) {
                        throw new Error('broken');
                    }

                    return Number(element.getAttribute('data-n'));
                },
            }])],
        }));
    });

    afterEach(() => {
        watches.forEach(watch => watch.dispose());
        document.body.innerHTML = '';
    });

    /**
     * Starts a watch of the text, immediate unless the options say otherwise, whose ready results go to `onChange`, its snapshot, or for live state the object and the change set, and whose failed evaluations and handler failures go to `onError`.
     * By default they are collected in `snapshots` and `failures`; an `onError` of null leaves the watch with no listener of its errors.
     */
    const watch = (text, bindings = {}, options = {}) => {
        const { onChange = snapshot => snapshots.push(snapshot), onError = error => failures.push(error), ...watchOptions } = options;
        const created = isolated.query(text, bindings).watch({ schedule: 'immediate', ...watchOptions });

        watches.push(created);
        created.subscribe('change', (_sender, args) => {
            if (args.status === 'failed') {
                return onError?.(args.error);
            }

            return 'liveState' in args ? onChange(args.liveState, args.changes) : onChange(args.value);
        });

        if (onError !== null) {
            created.subscribe('error', (_sender, args) => onError(args.error));
        }

        return created;
    };

    /** Takes the animation frames from the window, so a test runs them when it chooses. */
    const holdFrames = () => {
        const frames = { callbacks: [], canceled: [] };

        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.callbacks.push(callback));
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => frames.canceled.push(handle));

        return frames;
    };

    const change = (element, value) => {
        element.setAttribute('data-n', String(value));

        return settle();
    };

    describe('what wakes it', () => {
        /** What the member `hidden` answers: a value its observation misses, which only an evaluation the watch makes for another reason reads anew. */
        let hidden;

        beforeEach(() => {
            hidden = 1;
            isolated.registerModule(isolated.createModule('Hidden', {
                types: [elementExtension('Hidden', [{ name: 'hidden', kind: 'property', result: 'Number', updates: { changes: 'partly-observable', misses: 'the value the test sets', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-never'] }] }, impl: () => hidden }])],
            }));
        });

        it('follows a local its result never reads, so an edit it reads wakes the watch, which reads what it missed', async () => {
            watch('import Hidden\nlet edited = panel.text\nreturn panel:hidden', { panel }, { acceptPartialObservation: true });
            await settle();

            hidden = 2;
            panel.append('edited');
            await settle();

            expect(snapshots).toEqual([1, 2]);
        });

        it('follows a branch whose dependency changes while its result stays equal, so the change wakes the watch', async () => {
            watch('import Hidden\n{ hidden = panel:hidden, mode = if panel["data-mode"] == "wide" then 1 else 1 end }', { panel }, { acceptPartialObservation: true });
            await settle();

            hidden = 2;
            panel.setAttribute('data-mode', 'wide');
            await settle();

            expect(snapshots).toEqual([{ hidden: 1, mode: 1 }, { hidden: 2, mode: 1 }]);
        });
    });

    describe('the first snapshot', () => {
        it('is reported after the call returns, through the change event every snapshot raises', async () => {
            const watched = watch('panel["data-n"]', { panel });

            expect(watched.status).toBe('pending');
            expect(watched.snapshot).toBeUndefined();
            expect(snapshots).toEqual([]);

            await settle();

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual(['1']);
            expect(watched.snapshot).toBe('1');
        });

        it('waits for the first sample of every maintained member it reads', async () => {
            const [first] = panel.children;
            const watched = watch('import Level\n{ n = item:level }', { item: first });

            await settle();

            expect(watched.status).toBe('pending');
            expect(snapshots).toEqual([]);

            gauges.get(first).sample = { pending: false, value: 4 };
            gauges.get(first).notify();
            await settle();

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual([{ n: 4 }]);
        });

        it('reports a null snapshot, which is read beside the status', async () => {
            const watched = watch('panel.first(".none")?["data-n"]', { panel }, { acceptPartialObservation: true });

            await settle();

            expect(snapshots).toEqual([null]);
            expect(watched.status).toBe('ready');
            expect(watched.snapshot).toBeNull();
        });
    });

    describe('changes', () => {
        it('are followed by an evaluation, which reports a snapshot that differs', async () => {
            watch('panel["data-n"]', { panel });
            await settle();
            await change(panel, 5);

            expect(snapshots).toEqual(['1', '5']);
        });

        it('report nothing when the snapshot is the one last reported', async () => {
            watch('panel["data-n"]', { panel });
            await settle();
            await change(panel, 1);

            expect(snapshots).toEqual(['1']);
        });

        it('are delivered as snapshots that share what did not change', async () => {
            watch('panel { id = it["id"], items = it.children { n = it["data-n"] } }', { panel });
            await settle();
            await change(panel.children[1], 7);

            const [before, after] = snapshots;

            expect(after.items[1]).toEqual({ n: '7' });
            expect(after).not.toBe(before);
            expect(after.items).not.toBe(before.items);
            expect(after.items[0]).toBe(before.items[0]);
            expect(Object.isFrozen(after)).toBe(true);
        });

        it('are followed through the elements the query now reads: one added is observed, one removed is not', async () => {
            watch('panel.children { n = it["data-n"] }', { panel });
            await settle();

            const added = document.createElement('i');

            added.setAttribute('data-n', '3');
            panel.append(added);
            await settle();

            expect(snapshots.at(-1)).toEqual([{ n: '1' }, { n: '2' }, { n: '3' }]);

            await change(added, 9);

            expect(snapshots.at(-1)).toEqual([{ n: '1' }, { n: '2' }, { n: '9' }]);

            added.remove();
            await settle();

            const reports = snapshots.length;

            await change(added, 10);

            expect(snapshots.length).toBe(reports);
        });

        it('wait for the next animation frame when the watch is scheduled so, evaluating once however many fired', async () => {
            const frames = holdFrames();

            watch('import Tally\npanel:tally', { panel }, { schedule: 'frame' });
            await settle();

            expect(snapshots).toEqual([1]);

            panel.setAttribute('data-n', '2');
            panel.setAttribute('data-n', '3');
            panel.setAttribute('data-n', '4');
            await settle();

            expect(snapshots).toEqual([1]);
            expect(frames.callbacks.length).toBe(1);

            frames.callbacks[0]();

            expect(snapshots).toEqual([1, 2]);
            expect(evaluations).toBe(2);
        });

        it('are followed without waiting for an animation frame when the watch is scheduled so', async () => {
            watch('import Tally\npanel:tally', { panel }, { schedule: 'immediate' });
            await settle();

            panel.setAttribute('data-n', '2');
            await settle();

            expect(snapshots).toEqual([1, 2]);
        });
    });

    describe('the class indexer', () => {
        it('follows the class attribute, reporting where the class comes and goes', async () => {
            watch('panel.class["open"]', { panel });
            await settle();

            panel.classList.add('open');
            await settle();
            panel.classList.add('card');
            await settle();
            panel.className = 'card';
            await settle();

            expect(snapshots).toEqual([false, true, false]);
        });
    });

    describe('a measurement of layout', () => {
        /** Scrolls the panel to the block offset, its box laid out, and lets it report the scroll. */
        const scrollPanel = scrollTop => {
            panel.getClientRects = () => [{ left: 0, top: 0, width: 100, height: 50 }];
            Object.entries({ scrollTop, scrollHeight: 400, clientHeight: 50 }).forEach(([name, value]) => Object.defineProperty(panel, name, { value, configurable: true }));
            panel.dispatchEvent(new Event('scroll'));

            return settle();
        };

        it('reports a scroll only where a number it holds moves by more than the tolerance of layout since the last it reported, a part of it read alone included', async () => {
            await scrollPanel(10);
            watch('panel.scroll?.block', { panel }, { acceptPartialObservation: true });
            watch('panel.scroll?.block.offset', { panel }, { acceptPartialObservation: true });
            await settle();

            await scrollPanel(10.03);
            await scrollPanel(10.04);
            await scrollPanel(10.09);
            await scrollPanel(10.12);
            await scrollPanel(10.2);

            expect(snapshots).toEqual([{ offset: 10, extent: 400, viewport: 50 }, 10, { offset: 10.09, extent: 400, viewport: 50 }, 10.09, { offset: 10.2, extent: 400, viewport: 50 }, 10.2]);
        });

        it('reports a computed number exactly, which carries no tolerance', async () => {
            await scrollPanel(10);
            watch('panel.scroll { end = it.block.extent - it.block.offset }', { panel }, { acceptPartialObservation: true });
            await settle();

            await scrollPanel(10.01);

            expect(snapshots).toEqual([{ end: 390 }, { end: 389.99 }]);
        });
    });

    describe('a selector', () => {
        it('evaluates again for the attributes its selector reads and the structure of its tree, and for no other attribute, as a tabindex written in it', async () => {
            const selecting = vi.spyOn(panel, 'querySelectorAll');
            const [first, second] = panel.children;

            watch('panel.all("[data-on]").count', { panel }, { acceptPartialObservation: true });
            await settle();

            first.setAttribute('tabindex', '-1');
            second.setAttribute('tabindex', '0');
            await settle();

            expect(selecting).toHaveBeenCalledTimes(1);

            first.setAttribute('data-on', '');
            await settle();
            panel.append(document.createElement('i'));
            await settle();

            expect(selecting).toHaveBeenCalledTimes(3);
            expect(snapshots).toEqual([0, 1]);
        });

        it('reads an ancestor\'s attribute its selector tests outside the receiver, which its tree holds', async () => {
            const [first] = panel.children;

            watch('first.matches(".open > i")', { first }, { acceptPartialObservation: true });
            await settle();

            panel.classList.add('open');
            await settle();

            expect(snapshots).toEqual([false, true]);
        });
    });

    describe('structure and the window', () => {
        it('follows an element\'s siblings and its place among them as its parent\'s children change', async () => {
            const [first, second] = panel.children;

            watch('item { previous = it.previousSibling?["data-n"], index = it.index }', { item: second }, { acceptPartialObservation: true });
            await settle();

            panel.prepend(document.createElement('b'));
            await settle();
            first.remove();
            await settle();

            expect(snapshots).toEqual([{ previous: '1', index: 1 }, { previous: '1', index: 2 }, { previous: null, index: 1 }]);
        });

        it('follows whether a node holds another as its subtree changes', async () => {
            const [first, second] = panel.children;

            watch('first.contains(second)', { first, second });
            await settle();

            first.append(second);
            await settle();
            panel.append(second);
            await settle();

            expect(snapshots).toEqual([false, true, false]);
        });

        it('follows the capture of a pointer as the browser reports it got and lost, at the element and, once it is removed, at the document', async () => {
            const [item] = panel.children;
            let captured = false;

            item.hasPointerCapture = () => captured;
            watch('item.hasPointerCapture(1)', { item });
            await settle();

            captured = true;
            item.dispatchEvent(new Event('gotpointercapture'));
            await settle();
            captured = false;
            document.dispatchEvent(new Event('lostpointercapture'));
            await settle();

            expect(snapshots).toEqual([false, true, false]);
        });

        it('follows the window\'s URL as its hash changes, which a browser without the Navigation API reports alone', async () => {
            const start = window.location.href;

            watch('Domql.window.location.hash', {}, { acceptPartialObservation: true });
            await settle();

            try {
                window.history.replaceState(null, '', '#moved');
                window.dispatchEvent(new Event('hashchange'));
                await settle();

                expect(snapshots).toEqual(['', '#moved']);
            } finally {
                window.history.replaceState(null, '', start);
            }
        });
    });

    describe('values and text', () => {
        it('follows the text of a subtree as it is edited, a text node\'s data included', async () => {
            panel.innerHTML = '<p>one</p>';
            watch('panel.text', { panel });
            await settle();

            panel.firstElementChild.firstChild.data = 'two';
            await settle();
            panel.append(document.createElement('br'));
            await settle();
            panel.lastElementChild.replaceWith('three');
            await settle();

            expect(snapshots).toEqual(['one', 'two', 'twothree']);
        });

        it('follows a value the user types, and misses one the page\'s code sets, which fires no event', async () => {
            panel.innerHTML = '<input value="a">';

            const field = panel.firstElementChild;

            watch('field.value', { field }, { acceptPartialObservation: true });
            await settle();

            field.value = 'ab';
            field.dispatchEvent(new Event('input', { bubbles: true }));
            await settle();
            field.value = 'abc';
            await settle();

            expect(snapshots).toEqual(['a', 'ab']);
        });

        it('follows a move its members miss where a body reads what causes it, as a sibling\'s text edited moves a block', async () => {
            panel.innerHTML = '<p>first</p><p>second</p>';

            const [first, block] = panel.children;
            let top = 20;

            block.getClientRects = () => [{ left: 0, top, width: 100, height: 20 }];
            panel.getClientRects = () => [{ left: 0, top: 0, width: 100, height: 100 }];

            const moved = [];
            const followed = [];

            watch('block.rectRelativeTo(panel)?.top', { block, panel }, { acceptPartialObservation: true, onChange: value => moved.push(value) });
            watch('let edited = panel.text\nreturn block.rectRelativeTo(panel)?.top', { block, panel }, { acceptPartialObservation: true, onChange: value => followed.push(value) });
            await settle();

            top = 40;
            first.firstChild.data = 'first, now long enough to wrap onto a second line';
            await settle();

            expect(moved).toEqual([20]);
            expect(followed).toEqual([20, 40]);
        });
    });

    describe('a state', () => {
        it.each([
            ['read where it stands', 'panel:lit'],
            ['read as a condition', 'if panel:lit then true else false end'],
        ])('follows the observations its own declaration names, %s', async (_, body) => {
            isolated.registerModule(isolated.createModule('Lit', {
                types: [elementExtension('Lit', [{ name: 'lit', kind: 'property', result: 'Boolean', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', attributes: ['data-lit'] }] }, impl: ({ receiver: element }) => element.hasAttribute('data-lit') }])],
            }));
            watch(`import Lit\n${body}`, { panel });
            await settle();

            panel.setAttribute('data-lit', '');
            await settle();
            panel.setAttribute('data-other', '');
            await settle();
            panel.removeAttribute('data-lit');
            await settle();

            expect(snapshots).toEqual([false, true, false]);
        });
    });

    describe('an element\'s unnamed indexer', () => {
        it('follows the key it is given, observing what that key names and letting go of what it named before', async () => {
            panel.setAttribute('data-which', 'data-a');
            panel.setAttribute('data-a', 'a1');
            panel.setAttribute('data-b', 'b1');
            watch('panel[panel["data-which"] ?? "data-a"]', { panel });
            await settle();

            panel.setAttribute('data-a', 'a2');
            await settle();
            panel.setAttribute('data-which', 'data-b');
            await settle();
            panel.setAttribute('data-a', 'a3');
            await settle();
            panel.setAttribute('data-b', 'b2');
            await settle();

            expect(snapshots).toEqual(['a1', 'a2', 'b1', 'b2']);
        });
    });

    describe('the ARIA view\'s indexer', () => {
        it('observes the attribute it reads through the one observation the full spelling shares, and no other attribute', async () => {
            const observe = vi.spyOn(window.MutationObserver.prototype, 'observe');

            try {
                panel.setAttribute('aria-checked', 'false');
                watch('{ short = panel.aria["checked"], full = panel["aria-checked"] }', { panel });
                await settle();

                expect(observe.mock.calls.filter(([, options]) => options.attributeFilter?.includes('aria-checked'))).toHaveLength(1);

                const reads = vi.spyOn(panel, 'getAttribute');

                panel.setAttribute('aria-expanded', 'true');
                panel.setAttribute('data-n', '2');
                await settle();

                expect(reads).not.toHaveBeenCalled();

                panel.setAttribute('aria-checked', 'mixed');
                await settle();

                expect(snapshots).toEqual([{ short: 'false', full: 'false' }, { short: 'mixed', full: 'mixed' }]);
            } finally {
                observe.mockRestore();
            }
        });

        it('follows a key that changes from checked to expanded, observing aria-expanded and letting go of aria-checked', async () => {
            panel.setAttribute('aria-checked', 'true');
            panel.setAttribute('aria-expanded', 'false');
            panel.setAttribute('data-key', 'checked');
            watch('panel.aria[panel["data-key"]]', { panel });
            await settle();

            panel.setAttribute('data-key', 'expanded');
            await settle();

            const reads = vi.spyOn(panel, 'getAttribute');

            panel.setAttribute('aria-checked', 'mixed');
            await settle();

            expect(reads).not.toHaveBeenCalled();

            panel.setAttribute('aria-expanded', 'true');
            await settle();

            expect(snapshots).toEqual(['true', 'false', 'true']);
        });
    });

    describe('a list\'s unnamed indexer', () => {
        it('follows an index that changes, and the list it indexes as items are added before it', async () => {
            panel.setAttribute('data-i', '0');
            watch('panel.children[panel["data-i"] to Number]?["data-n"]', { panel });
            await settle();

            panel.setAttribute('data-i', '1');
            await settle();
            const added = document.createElement('i');

            added.setAttribute('data-n', '0');
            panel.prepend(added);
            await settle();
            panel.setAttribute('data-i', '5');
            await settle();

            expect(snapshots).toEqual(['1', '2', '1', null]);
        });

        it('answers null through optional access while its receiver is null, and follows the receiver once it is not', async () => {
            panel.setAttribute('data-i', '1');
            watch('panel.first(".group")?.children[panel["data-i"] to Number]?["data-n"]', { panel }, { acceptPartialObservation: true });
            await settle();

            const group = Object.assign(document.createElement('div'), { className: 'group', innerHTML: '<i data-n="a"></i><i data-n="b"></i>' });

            panel.append(group);
            await settle();
            panel.setAttribute('data-i', '0');
            await settle();
            group.remove();
            await settle();

            expect(snapshots).toEqual([null, 'b', 'a', null]);
        });
    });

    describe('arithmetic', () => {
        it('follows what each operand reads, evaluating the left operand and then the right', async () => {
            panel.setAttribute('data-a', '1');
            panel.setAttribute('data-b', '2');
            watch('(panel["data-a"] to Number ?? 0) + (panel["data-b"] to Number ?? 0) * 10', { panel });
            await settle();

            panel.setAttribute('data-a', '5');
            await settle();
            panel.setAttribute('data-b', '3');
            await settle();

            expect(snapshots).toEqual([21, 25, 35]);
            expect(isolated.query('import Tally\npanel:tally - panel:tally', { panel }).evaluate()).toBe(-1);
        });

        it('evaluates no right operand once the left fails', () => {
            const before = evaluations;

            expect(() => isolated.query('import Tally\n(panel.first("[")?.children?.count ?? 0) + panel:tally', { panel }).evaluate()).toThrow("The member 'first' failed");
            expect(evaluations).toBe(before);
        });
    });

    describe('a field the entries after it read', () => {
        it('reuses the value its evaluation gave, evaluating it once each time the watch runs, and updates every field that reads it', async () => {
            watch('import Tally\npanel { count = it:tally, again = count + 1, twice = count * 2 }', { panel });
            await settle();

            expect(evaluations).toBe(1);

            panel.setAttribute('data-n', '2');
            await settle();

            expect(evaluations).toBe(2);
            expect(snapshots).toEqual([{ count: 1, again: 2, twice: 2 }, { count: 2, again: 3, twice: 4 }]);
        });
    });

    describe('the object root', () => {
        it('compares a field read through root as the field itself, reusing its branch and its tolerance through an alias, an argument and a returned reference', async () => {
            const [first] = panel.children;
            let meter = null;

            // A number kept by an observation whose samples the test supplies, compared within a tolerance of 2.
            isolated.registerModule(isolated.createModule('Meter', {
                observationTypes: [{
                    name: 'meter', contract: 'maintained',
                    impl: ({ notify }) => {
                        meter = { sample: { pending: false, value: 100 }, notify };

                        return { stop: () => {}, sample: () => meter.sample };
                    },
                }],
                types: [elementExtension('Meter', [{
                    name: 'meter', kind: 'property', result: 'Number?',
                    updates: { changes: 'observable', reads: 'maintained', tolerance: 2, observations: [{ type: 'meter', of: 'receiver' }] },
                    impl: ({ samples: [sample] }) => sample,
                }])],
            }));

            const read = (value) => {
                meter.sample = { pending: false, value };
                meter.notify();

                return settle();
            };

            watch([
                'import Meter',
                '{',
                '    let pass = function(r) r.s end,',
                '    let back = function(r) r end,',
                '    w = first:meter,',
                '    s = if panel["data-on"] == "1" then first:meter else 0 end,',
                '    alias = do',
                '        let r = root',
                '        return r.s',
                '    end,',
                '    argument = pass(root),',
                '    returned = back(root).s,',
                '    width = back(root).w',
                '}',
            ].join('\n'), { panel, first });
            await settle();

            panel.setAttribute('data-on', '1');
            await settle();
            await read(101.5);
            await read(103);
            panel.removeAttribute('data-on');
            await settle();

            const all = (w, s) => ({ w, s, alias: s, argument: s, returned: s, width: w });

            expect(snapshots).toEqual([all(100, 0), all(100, 100), all(103, 103), all(103, 0)]);
            expect(failures).toEqual([]);
        });
    });

    describe('a function value', () => {
        it('follows the condition that chooses a function, and what the function it chose reads, never what one it did not choose reads', async () => {
            panel.setAttribute('data-a', 'x');
            panel.setAttribute('data-b', 'y');
            watch('let a = () => panel["data-a"] ?? "-"\nlet b = () => panel["data-b"] ?? "-"\nlet pick = if panel["data-on"] == "a" then a else b end\nreturn pick()', { panel });
            await settle();

            panel.setAttribute('data-a', 'x2');
            await settle();
            panel.setAttribute('data-on', 'a');
            await settle();
            panel.setAttribute('data-b', 'y2');
            await settle();
            panel.setAttribute('data-a', 'x3');
            await settle();

            expect(snapshots).toEqual(['y', 'x2', 'x3']);
        });

        it('follows what a function a member is given reads while the member calls it', async () => {
            isolated.registerModule(isolated.createModule('SortBy', {
                types: [{
                    name: 'SortByLists<T>', kind: 'extension', target: 'List<T>',
                    members: [{
                        name: 'sortBy', kind: 'function', arguments: 'positional', result: 'List<T>', updates: { changes: 'derived', reads: 'derived' },
                        parameters: [{ name: 'compare', kind: 'function', parameterTypes: ['T', 'T'], type: 'Number', required: true }],
                        impl: ({ receiver: list, args: { compare } }) => [...list].sort(compare),
                    }],
                }],
            }));

            watch('import SortBy\npanel.children:sortBy((a, b) => (a["data-n"] to Number ?? 0) - (b["data-n"] to Number ?? 0)) { n = it["data-n"] }', { panel });
            await settle();
            panel.children[1].setAttribute('data-n', '0');
            await settle();

            expect(snapshots).toEqual([[{ n: '1' }, { n: '2' }], [{ n: '0' }, { n: '1' }]]);
        });
    });

    describe('a function', () => {
        it('follows what each call reads, the branch a changed condition selects in it, and captures made anew at each evaluation', async () => {
            panel.setAttribute('data-a', '1');
            panel.setAttribute('data-b', '2');
            watch('let read = function(name) if panel["data-on"] == "a" then panel["data-a"] ?? "-" else panel[name] ?? "-" end end\nreturn { b = read("data-b") }', { panel });
            await settle();

            panel.setAttribute('data-b', '3');
            await settle();
            panel.setAttribute('data-on', 'a');
            await settle();
            panel.setAttribute('data-a', '4');
            await settle();

            expect(snapshots).toEqual([{ b: '2' }, { b: '3' }, { b: '1' }, { b: '4' }]);
        });
    });

    describe('a body', () => {
        it('evaluates every binding once each time it runs, an unused one included, following what each read', async () => {
            const before = evaluations;

            watch('import Tally\nlet unused = panel:tally\nreturn 1', { panel }, { schedule: 'immediate' });
            await settle();
            panel.setAttribute('data-x', '1');
            await settle();

            expect(evaluations).toBe(before + 2);
            expect(snapshots).toEqual([1]);
        });
    });

    describe('an interpolated string', () => {
        it('follows what its holes read, reporting its text only where the text changes', async () => {
            panel.setAttribute('data-a', 'x');
            watch('$"<{panel["data-a"] ?? "-"}|{panel["data-b"] ?? "-"}>"', { panel });
            await settle();

            panel.setAttribute('data-a', 'y');
            await settle();
            panel.setAttribute('data-c', 'unread');
            await settle();
            panel.removeAttribute('data-a');
            await settle();

            expect(snapshots).toEqual(['<x|->', '<y|->', '<-|->']);
        });

        it('evaluates a local its holes share once, and a branch no condition selects never', () => {
            const before = evaluations;

            expect(isolated.query('import Tally\npanel { let t = it:tally, text = $"{t}-{t}-{if false then it:tally else 0 end}" }', { panel }).evaluate().text).toBe(`${before + 1}-${before + 1}-0`);
            expect(evaluations).toBe(before + 1);
        });
    });

    describe('a comparison', () => {
        it('evaluates each operand once, and none after the first comparison that is false', () => {
            const before = evaluations;

            expect(isolated.query('import Tally\n0 < panel:tally < 1000000', { panel }).evaluate()).toBe(true);
            expect(evaluations).toBe(before + 1);
            expect(isolated.query('import Tally\n1 < 0 < panel:tally', { panel }).evaluate()).toBe(false);
            expect(evaluations).toBe(before + 1);
        });

        it('follows an operand only while the comparisons before it pass evaluation on to it', async () => {
            watch('import Level\n0 < (try panel["data-on"] to Number ?? 0) < (panel:level ?? 100)', { panel });
            await settle();

            expect(gauges.has(panel)).toBe(false);

            panel.setAttribute('data-on', '5');
            await settle();
            gauges.get(panel).sample = { pending: false, value: 3 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots).toEqual([false, true, false]);

            panel.removeAttribute('data-on');
            await settle();

            expect(gauges.get(panel).stopped).toBe(1);
        });
    });

    describe('a conversion', () => {
        it('follows the value it converts, fails while that value has no conversion, and recovers once it has', async () => {
            const watched = watch('panel["data-n"] to Number', { panel });

            await settle();
            await change(panel, 2);
            await change(panel, 'two');

            expect(watched.status).toBe('failed');
            expect(failures.map(failure => failure.message)).toEqual([expect.stringContaining('The conversion from String to Number rejected its value: "two" is no number')]);

            await change(panel, 3);

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual([1, 2, 3]);
        });

        it('lets an attempted conversion fall back for malformed text without failing, and give the converted value once the text converts', async () => {
            const watched = watch('panel { value = try it["data-n"] to Number ?? 0 }', { panel });

            await settle();
            await change(panel, 'two');

            expect(watched.status).toBe('ready');

            panel.removeAttribute('data-n');
            await settle();
            await change(panel, 3);

            expect(snapshots).toEqual([{ value: 1 }, { value: 0 }, { value: 3 }]);
            expect(failures).toEqual([]);
        });

        it('follows a conditional binding through the value it binds and the branch it takes', async () => {
            watch('if let n = try panel["data-n"] to Number then { n = n } else { n = -1 } end', { panel });
            await settle();
            await change(panel, 'two');
            await change(panel, 5);
            await change(panel, 7);

            expect(snapshots).toEqual([{ n: 1 }, { n: -1 }, { n: 5 }, { n: 7 }]);
            expect(failures).toEqual([]);
        });

        it('lets ?? say what a missing value means, which it follows as the value comes and goes', async () => {
            watch('panel["data-n"] to Number ?? 0', { panel });
            await settle();

            panel.removeAttribute('data-n');
            await settle();
            await change(panel, 4);

            expect(snapshots).toEqual([1, 0, 4]);
            expect(failures).toEqual([]);
        });
    });

    describe('under the immediate schedule', () => {
        /** Starts an immediate watch of the first child's gauge and tally, its first sample delivered, and answers the watch and the gauge. */
        const watchGauge = async (text = 'import Level\nimport Tally\n{ level = first:level, tally = first:tally }') => {
            const [first] = panel.children;
            const created = watch(text, { first });

            await settle();

            const gauge = gauges.get(first);

            gauge.sample = { pending: false, value: 1 };
            gauge.notify();
            await settle();

            return { created, gauge };
        };

        it('evaluates once, in a microtask, for the invalidations it receives before that evaluation begins', async () => {
            const { gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            gauge.notify();
            gauge.notify();

            expect(evaluations).toBe(before);

            await settle();

            expect(evaluations).toBe(before + 1);
        });

        it('evaluates again for an invalidation it receives after its queued evaluation ran', async () => {
            const { gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            await settle();
            gauge.notify();
            await settle();

            expect(evaluations).toBe(before + 2);
        });

        it('lets a queued evaluation go once the watch is disposed', async () => {
            const { created, gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            created.dispose();
            await settle();

            expect(evaluations).toBe(before);
            expect(failures).toEqual([]);
        });

        it('answers a queued evaluation with a refresh that runs before it', async () => {
            const { created, gauge } = await watchGauge();
            const before = evaluations;

            gauge.notify();
            await created.refreshAsync();
            await settle();

            expect(evaluations).toBe(before + 1);
        });

        it('evaluates again for an invalidation it receives while it evaluates', async () => {
            let duringEvaluation = null;

            isolated.registerModule(isolated.createModule('Nudge', {
                types: [elementExtension('Nudge', [{
                    name: 'nudge', kind: 'property', result: 'Number', updates: { changes: 'constant', reads: 'fresh' },
                    impl: () => {
                        const nudge = duringEvaluation;

                        duringEvaluation = null;
                        nudge?.();

                        return 0;
                    },
                }])],
            }));

            const { gauge } = await watchGauge('import Level\nimport Nudge\nimport Tally\n{ level = first:level, tally = first:tally, nudge = first:nudge }');
            const before = evaluations;

            duringEvaluation = () => gauge.notify();
            gauge.notify();
            await settle();

            expect(evaluations).toBe(before + 2);
        });
    });

    describe('a maintained member it first reads after its first snapshot', () => {
        it('is pending in the snapshot reported, which is evaluated again when its first sample arrives', async () => {
            const [first, second] = panel.children;

            watch('import Level\n{ a = first:level }', { first });
            await settle();
            gauges.get(first).sample = { pending: false, value: 1 };
            gauges.get(first).notify();
            await settle();

            expect(snapshots).toEqual([{ a: 1 }]);

            // A watch of the list reads the second child's gauge once it has been added to what is read.
            const listed = watch('import Level\npanel.children { level = it:level }', { panel });

            await settle();
            gauges.get(first).notify();
            await settle();

            expect(listed.status).toBe('pending');

            gauges.get(second).sample = { pending: false, value: 2 };
            gauges.get(second).notify();
            gauges.get(first).sample = { pending: false, value: 1 };
            gauges.get(first).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual([{ level: 1 }, { level: 2 }]);
        });
    });

    describe('an and and an or', () => {
        it('follow the left operand, and the right only while the left passes evaluation on to it', async () => {
            watch('import Level\n{ level = (try panel["data-on"] to Number) or panel:level }', { panel });
            await settle();
            gauges.get(panel).sample = { pending: false, value: 5 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 5 });

            panel.setAttribute('data-on', '2');
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 2 });
            expect(gauges.get(panel).stopped).toBe(1);

            panel.removeAttribute('data-on');
            await settle();
            gauges.get(panel).sample = { pending: false, value: 7 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 7 });
            expect(failures).toEqual([]);
        });
    });

    describe('a local', () => {
        it('holds what it reads only while an evaluation uses it: from when a branch first reaches it until none does', async () => {
            watch('import Level\npanel { let level = it:level, value = if it["data-on"] == null then 0 else @level end }', { panel });
            await settle();

            expect(snapshots).toEqual([{ value: 0 }]);
            expect(gauges.has(panel)).toBe(false);

            panel.setAttribute('data-on', '');
            await settle();
            gauges.get(panel).sample = { pending: false, value: 5 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ value: 5 });

            panel.removeAttribute('data-on');
            await settle();

            expect(snapshots.at(-1)).toEqual({ value: 0 });
            expect(gauges.get(panel).stopped).toBe(1);

            const reports = snapshots.length;

            gauges.get(panel).sample = { pending: false, value: 6 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.length).toBe(reports);
        });
    });

    describe('an optional chain', () => {
        it('holds what it reads past a receiver only while that receiver is present', async () => {
            const item = document.createElement('i');

            watch('import Level\n{ level = (item.parent as Element)?:level }', { item }, { acceptPartialObservation: true });
            await settle();

            expect(snapshots).toEqual([{ level: null }]);
            expect(gauges.size).toBe(0);

            panel.append(item);
            await settle();
            gauges.get(panel).sample = { pending: false, value: 5 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 5 });

            item.remove();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: null });
            expect(gauges.get(panel).stopped).toBe(1);
        });
    });

    describe('a disjunction', () => {
        it('holds what its right operand reads only while it evaluates that operand', async () => {
            const item = panel.querySelector('i');

            watch('import Level\n{ v = (item["data-on"]) == null or item:level == null }', { item });
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: true });
            expect(gauges.has(item)).toBe(false);

            item.setAttribute('data-on', '');
            await settle();
            gauges.get(item).sample = { pending: false, value: 4 };
            gauges.get(item).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: false });

            item.removeAttribute('data-on');
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: true });
            expect(gauges.get(item).stopped).toBe(1);
        });
    });

    describe('a computed property access', () => {
        it('follows what its name reads and the property it selects, holding the one it no longer selects no longer', async () => {
            const item = panel.querySelector('i');

            // A computed property access reads a type's own properties, so the two it chooses between stand within a view of the element, which a cast reads it as.
            isolated.registerModule(isolated.createModule('Readings', {
                types: [
                    { name: 'Readings', kind: 'reference', isInstance: value => value?.nodeType === 1, members: [levelProperty(), tallyProperty()] },
                    elementExtension('Readings', [{ kind: 'operator', name: 'cast', result: 'Readings' }]),
                ],
            }));
            watch('import Readings\n{ v = (item as Readings).[if item["data-on"] == null then "level" else "tally" end] }', { item });
            await settle();
            gauges.get(item).sample = { pending: false, value: 4 };
            gauges.get(item).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: 4 });

            item.setAttribute('data-on', '');
            await settle();

            expect(snapshots.at(-1)).toEqual({ v: evaluations });
            expect(gauges.get(item).stopped).toBe(1);
        });
    });

    describe('a coalescing operator', () => {
        it('holds what its fallback reads only while its value is null', async () => {
            const item = panel.querySelector('i');

            watch('import Level\n{ level = item:level ?? panel:level }', { item, panel });
            await settle();
            gauges.get(item).sample = { pending: false, value: null };
            gauges.get(item).notify();
            await settle();
            gauges.get(panel).sample = { pending: false, value: 2 };
            gauges.get(panel).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 2 });

            gauges.get(item).sample = { pending: false, value: 5 };
            gauges.get(item).notify();
            await settle();

            expect(snapshots.at(-1)).toEqual({ level: 5 });
            expect(gauges.get(panel).stopped).toBe(1);
        });
    });

    describe('the root of a node', () => {
        it('follows a detached node into the document, and the document as its own root', async () => {
            const detached = document.createElement('section');

            watch('{ own = Domql.document.root.children.count, detached = detached.root.children.count }', { detached }, { acceptPartialObservation: true });
            await settle();

            expect(snapshots.at(-1)).toEqual({ own: 1, detached: 0 });

            document.body.append(detached);
            await settle();

            expect(snapshots.at(-1)).toEqual({ own: 1, detached: 1 });
            expect(failures).toEqual([]);
        });
    });

    describe('an evaluation that fails', () => {
        it('is reported, keeps the watch running and its last snapshot, and its recovery reports the snapshot whether or not it differs', async () => {
            const watched = watch('import Flaky\n{ n = panel:flaky }', { panel });

            await settle();
            broken = true;
            await change(panel, 2);

            expect(watched.status).toBe('failed');
            expect(failures.length).toBe(1);
            expect(failures[0].name).toBe('NexoError');
            expect(failures[0].message).toContain("The member 'flaky' failed");
            expect(watched.snapshot).toEqual({ n: 1 });

            broken = false;
            await change(panel, 1);

            expect(watched.status).toBe('ready');
            expect(snapshots).toEqual([{ n: 1 }, { n: 1 }]);
        });

        it('keeps the dependencies of its last success together with those the failure recorded', async () => {
            const watched = watch('import Flaky\n{ n = panel:flaky }', { panel });

            await settle();
            broken = true;
            await change(panel, 2);
            await change(panel, 3);
            await change(panel, 4);

            expect(watched.status).toBe('failed');
            expect(failures.length).toBe(3);

            broken = false;
            await change(panel, 5);

            expect(snapshots.at(-1)).toEqual({ n: 5 });
        });
    });

    describe('the sessions of its evaluations', () => {
        /** Registers a member observed through a probe of its element, which fails for an element marked bad, and answers what the probes show: the elements observed, how often one started and stopped, and how to report a change of one. */
        const registerProbe = () => {
            const probes = { live: new Set(), started: 0, stopped: 0, notify: new Map(), calls: 0, during: null };

            isolated.registerModule(isolated.createModule('Probe', {
                observationTypes: [{
                    name: 'probe', contract: 'invalidation',
                    impl: ({ request: { target }, notify }) => {
                        probes.started++;
                        probes.live.add(target);
                        probes.notify.set(target, notify);

                        return {
                            stop: () => {
                                probes.stopped++;
                                probes.live.delete(target);
                            },
                        };
                    },
                }],
                types: [elementExtension('Probe', [{
                    name: 'probe', kind: 'property', result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'probe', of: 'receiver' }] },
                    impl: ({ receiver: element }) => {
                        probes.calls++;

                        const during = probes.during;

                        probes.during = null;
                        during?.();

                        if (element.hasAttribute('data-bad')) {
                            throw new Error('bad');
                        }

                        return Number(element.getAttribute('data-n'));
                    },
                }])],
            }));

            return probes;
        };

        it('pass from evaluation to evaluation through failures, keep reporting, and are all let go when the watch is disposed', async () => {
            const probes = registerProbe();
            const watched = watch('import Probe\npanel.children { p = it:probe }', { panel });
            const [first, second] = [...panel.children];

            await watched.refreshAsync();

            expect([...probes.live]).toEqual([first, second]);

            // A failure that takes over the probes of the first two items and acquires one for the third.
            const third = document.createElement('i');

            third.setAttribute('data-bad', '');
            panel.append(third);
            await rejection(watched.refreshAsync());
            await settle();

            expect(watched.status).toBe('failed');
            expect([probes.started, probes.stopped]).toEqual([3, 0]);

            // A second failure, which no longer reads the first item.
            first.remove();
            await rejection(watched.refreshAsync());
            await settle();

            expect([...probes.live]).toEqual([second, third]);
            expect([probes.started, probes.stopped]).toEqual([3, 1]);

            // The recovery takes over what the failures held.
            third.removeAttribute('data-bad');
            third.setAttribute('data-n', '3');
            await watched.refreshAsync();

            expect(watched.status).toBe('ready');
            expect(snapshots.at(-1)).toEqual([{ p: 2 }, { p: 3 }]);
            expect([probes.started, probes.stopped]).toEqual([3, 1]);

            // A probe the recovery took over still reports to the watch.
            second.setAttribute('data-n', '7');
            probes.notify.get(second)();
            await settle();

            expect(snapshots.at(-1)).toEqual([{ p: 7 }, { p: 3 }]);

            watched.dispose();

            expect(probes.live.size).toBe(0);
            expect(probes.stopped).toBe(probes.started);
        });

        it('ask for another evaluation when one of them reports a change during an evaluation', async () => {
            const probes = registerProbe();
            const watched = watch('import Probe\n{ p = panel:probe }', { panel });

            await watched.refreshAsync();

            const calls = probes.calls;

            probes.during = () => probes.notify.get(panel)();
            await watched.refreshAsync();
            await settle();

            expect(probes.calls - calls).toBe(2);
        });
    });

    describe('a handler that fails', () => {
        it('is raised as an error event and leaves the watch running with the state it was handed accepted', async () => {
            let fails = true;
            const watched = watch('panel["data-n"]', { panel }, {
                onChange: snapshot => {
                    snapshots.push(snapshot);

                    if (fails) {
                        throw new Error('consumer');
                    }
                },
            });

            await settle();

            expect(failures.map(error => error.message)).toEqual(['consumer']);
            expect(watched.status).toBe('ready');

            fails = false;
            await change(panel, 2);

            expect(snapshots).toEqual(['1', '2']);
        });

        it('is reported when it rejects, and is not waited for', async () => {
            const watched = watch('panel["data-n"]', { panel }, { onChange: () => Promise.reject(new Error('later')) });

            await settle();

            expect(failures.map(error => error.message)).toEqual(['later']);
            expect(watched.status).toBe('ready');
        });

        it('goes to the diagnostic reporting where no error listener receives it', async () => {
            watch('panel["data-n"]', { panel }, { onChange: () => { throw new Error('consumer'); }, onError: null });
            await settle();

            expect(reported.map(error => error.message)).toEqual(['consumer']);
        });

        it('sends the failure of the error handler to the diagnostic reporting, calling nothing again', async () => {
            watch('panel["data-n"]', { panel }, {
                onChange: () => { throw new Error('consumer'); },
                onError: error => {
                    failures.push(error);

                    return Promise.reject(new Error('error handler'));
                },
            });
            await settle();

            expect(failures.length).toBe(1);
            expect(reported.map(error => error.message)).toEqual(['error handler']);
        });

        it('lets the handlers of other watches run when one fails', async () => {
            const others = [];

            watch('panel["data-n"]', { panel }, { onChange: () => { throw new Error('first'); } });
            watch('panel["data-n"]', { panel }, { onChange: snapshot => others.push(snapshot) });
            await settle();
            await change(panel, 2);

            expect(others).toEqual(['1', '2']);
        });

        it('leaves the watch reporting where its error handler and the window\'s error reporting fail too', async () => {
            let reportings = 0;

            window.reportError = () => {
                reportings++;
                throw new Error('reporting');
            };

            const watched = watch('panel["data-n"]', { panel }, {
                onChange: snapshot => {
                    snapshots.push(snapshot);
                    throw new Error('consumer');
                },
                onError: () => { throw new Error('error handler'); },
            });

            await settle();
            await change(panel, 2);

            expect(snapshots).toEqual(['1', '2']);
            expect(reportings).toBe(2);
            expect(watched.status).toBe('ready');
        });
    });

    describe('other watches of the same observations', () => {
        it('go on when one is disposed', async () => {
            const first = [];
            const second = [];
            const disposed = watch('panel["data-n"]', { panel }, { onChange: snapshot => first.push(snapshot) });

            watch('panel["data-n"]', { panel }, { onChange: snapshot => second.push(snapshot) });
            await settle();
            disposed.dispose();
            await change(panel, 2);

            expect(first).toEqual(['1']);
            expect(second).toEqual(['1', '2']);
        });

        it('go on when one fails to evaluate, which recovers on its own', async () => {
            const failing = [];
            const other = [];
            const failed = watch('import Flaky\npanel:flaky', { panel }, { onChange: snapshot => failing.push(snapshot) });

            watch('panel["data-n"]', { panel }, { onChange: snapshot => other.push(snapshot) });
            await settle();

            broken = true;
            await change(panel, 2);

            expect(failed.status).toBe('failed');
            expect(other).toEqual(['1', '2']);

            broken = false;
            await change(panel, 3);

            expect(failed.status).toBe('ready');
            expect(failing).toEqual([1, 3]);
            expect(other).toEqual(['1', '2', '3']);
        });

        it('keep the observations both read running where a watch of other bindings is ready before the first is disposed', async () => {
            const started = [];
            const stopped = [];

            isolated.registerModule(isolated.createModule('Reach', {
                observationTypes: [{
                    name: 'reach', contract: 'invalidation',
                    impl: ({ request: { target } }) => {
                        started.push(target.id);

                        return { stop: () => stopped.push(target.id) };
                    },
                }],
                types: [elementExtension('Reach', [{ name: 'reach', kind: 'property', result: 'Number', updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'reach', of: 'receiver' }] }, impl: () => 1 }])],
            }));
            document.body.innerHTML = '<i id="a"></i><i id="b"></i><i id="c"></i>';

            const [a, b, c] = ['a', 'b', 'c'].map(id => document.getElementById(id));
            const query = isolated.query('import Reach\n{ x = x:reach, y = y:reach }', { x: a, y: b });
            const replaced = query.watch({ schedule: 'immediate' });

            watches.push(replaced);
            await replaced.readyAsync();

            expect(started).toEqual(['a', 'b']);

            const replacement = query.with({ x: b, y: c }).watch({ schedule: 'immediate' });

            watches.push(replacement);
            await replacement.readyAsync();
            replaced.dispose();

            expect(started).toEqual(['a', 'b', 'c']);
            expect(stopped).toEqual(['a']);
        });
    });

    describe('refreshAsync', () => {
        it('evaluates now and settles once the snapshot has been handed to the handlers', async () => {
            const watched = watch('import Tally\npanel:tally', { panel }, { schedule: 'frame' });

            await settle();
            await watched.refreshAsync();

            expect(snapshots).toEqual([1, 2]);
        });

        it('evaluates once when it comes before the first evaluation, which it snapshots', async () => {
            const watched = watch('import Tally\npanel:tally', { panel });
            const refreshing = watched.refreshAsync();

            await refreshing;
            await settle();

            expect(snapshots).toEqual([1]);
            expect(evaluations).toBe(1);
        });

        it('settles without delivering where the snapshot did not change', async () => {
            const watched = watch('panel["data-n"]', { panel });

            await settle();
            await watched.refreshAsync();

            expect(snapshots).toEqual(['1']);
        });

        it('does not wait for a promise a handler returns, so a handler can await a refresh', async () => {
            let nested;
            const watched = watch('import Tally\npanel:tally', { panel }, {
                onChange: async snapshot => {
                    snapshots.push(snapshot);

                    if (snapshot === 1) {
                        nested = watched.refreshAsync();
                        await nested;
                    }
                },
            });

            await settle();
            await nested;

            expect(snapshots).toEqual([1, 2]);
        });

        it('rejects with the failure of its evaluation, which is reported as well', async () => {
            const watched = watch('import Flaky\n{ n = panel:flaky }', { panel });

            await settle();
            broken = true;

            const error = await rejection(watched.refreshAsync());

            expect(error.message).toContain("The member 'flaky' failed");
            expect(failures).toEqual([error]);
        });

        it('settles without delivering where disposal cancels it', async () => {
            const [first] = panel.children;
            const watched = watch('import Level\n{ n = item:level }', { item: first });

            await settle();

            const refreshing = watched.refreshAsync();

            watched.dispose();

            await expect(refreshing).resolves.toBeUndefined();
            expect(snapshots).toEqual([]);
        });

        it('rejects when called after disposal', async () => {
            const watched = watch('panel["data-n"]', { panel });

            watched.dispose();

            const error = await rejection(watched.refreshAsync());

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5005', message: expect.stringContaining('A disposed watch cannot be refreshed') });
            expect(error.location).toEqual({});
        });

        it('is canceled by its signal alone, rejecting with its reason, and the watch goes on', async () => {
            const watched = watch('panel["data-n"]', { panel }, { schedule: 'frame' });
            const lifetime = new AbortController();

            lifetime.abort(new Error('stopped'));

            await expect(watched.refreshAsync({ signal: lifetime.signal })).rejects.toThrow('stopped');
            await watched.refreshAsync();
            expect(snapshots).toEqual(['1']);
            expect(watched.status).toBe('ready');
        });

        describe('taking new samples', () => {
            /** The probe each element's observation of the type `probe` keeps: the sample it reports, and the new samples asked of it, which a test answers. */
            let probes;

            beforeEach(() => {
                probes = new Map();

                // A member kept by an observation whose report lags behind the page until a new sample is taken.
                isolated.registerModule(isolated.createModule('Probe', {
                    observationTypes: [{
                        name: 'probe', contract: 'maintained',
                        impl: ({ request: { target } }) => {
                            const probe = { reported: { pending: false, value: 1 }, asked: [] };

                            probes.set(target, probe);

                            return {
                                stop: () => {},
                                sample: () => probe.reported,
                                resampleAsync: () => new Promise((resolve, reject) => probe.asked.push({ resolve, reject })),
                            };
                        },
                    }],
                    types: [elementExtension('Probe', [{
                        name: 'probe', kind: 'property', result: 'Number?',
                        updates: { changes: 'observable', reads: 'maintained', observations: [{ type: 'probe', of: 'receiver' }] },
                        impl: ({ samples: [sample] }) => sample,
                    }])],
                }));
            });

            it('evaluates once every maintained observation the last evaluation read has taken a new sample, reading it', async () => {
                const [first] = panel.children;
                const watched = watch('import Probe\nimport Level\n{ near = item:probe, level = item:level }', { item: first });

                await settle();
                gauges.get(first).sample = { pending: false, value: 4 };
                gauges.get(first).notify();
                await settle();

                // The page moved, and the browser has not reported it yet.
                const probe = probes.get(first);
                const refreshing = watched.refreshAsync({ resample: true });

                await settle();

                expect(probe.asked).toHaveLength(1);
                expect(snapshots).toEqual([{ near: 1, level: 4 }]);

                probe.reported = { pending: false, value: 2 };
                probe.asked[0].resolve();
                await refreshing;

                expect(snapshots).toEqual([{ near: 1, level: 4 }, { near: 2, level: 4 }]);
            });

            it('evaluates at once where the watch has not evaluated yet, having read nothing to sample again', async () => {
                const [first] = panel.children;
                const watched = watch('import Probe\n{ near = item:probe }', { item: first });

                await watched.refreshAsync({ resample: true });

                expect(probes.get(first).asked).toEqual([]);
                expect(snapshots).toEqual([{ near: 1 }]);
            });

            it('rejects with DOMQL5022 where an observation fails to take a new sample, and the watch goes on', async () => {
                const [first] = panel.children;
                const watched = watch('import Probe\n{ near = item:probe }', { item: first });

                await settle();

                const refreshing = rejection(watched.refreshAsync({ resample: true }));
                const lost = new Error('lost');

                probes.get(first).asked[0].reject(lost);

                const error = await refreshing;

                expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5022', message: "The observation 'probe' failed to take a new sample: lost", cause: lost });
                expect(error.location).toEqual({});
                expect(watched.status).toBe('ready');
                expect(snapshots).toEqual([{ near: 1 }]);
            });

            it('settles without delivering where disposal ends its wait for samples', async () => {
                const [first] = panel.children;
                const watched = watch('import Probe\n{ near = item:probe }', { item: first });

                await settle();

                const refreshing = watched.refreshAsync({ resample: true });

                watched.dispose();

                await expect(refreshing).resolves.toBeUndefined();
                expect(snapshots).toEqual([{ near: 1 }]);
            });

            it('is canceled by its signal while it waits, and the samples it asked for change nothing', async () => {
                const [first] = panel.children;
                const watched = watch('import Probe\n{ near = item:probe }', { item: first });
                const lifetime = new AbortController();

                await settle();

                const refreshing = rejection(watched.refreshAsync({ resample: true, signal: lifetime.signal }));

                lifetime.abort(new Error('stopped'));
                probes.get(first).asked[0].resolve();

                expect((await refreshing).message).toBe('stopped');
                await settle();
                expect(snapshots).toEqual([{ near: 1 }]);
            });
        });
    });

    describe('under the delayed schedule', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        /** Lets the observations deliver and the time given pass, running the timers due in it. */
        const pass = milliseconds => vi.advanceTimersByTimeAsync(milliseconds);

        it('evaluates once its delay has passed with no invalidation, each invalidation starting the wait again, its first evaluation following the call', async () => {
            watch('import Tally\npanel:tally', { panel }, { schedule: 'delayed', delay: 100 });
            await pass(0);

            expect(snapshots).toEqual([1]);

            panel.setAttribute('data-n', '2');
            await pass(60);
            panel.setAttribute('data-n', '3');
            await pass(60);

            expect(evaluations).toBe(1);

            await pass(40);

            expect(snapshots).toEqual([1, 2]);
            expect(evaluations).toBe(2);
        });

        it('evaluates at once on a refresh, which ends the wait, and evaluates nothing once disposed', async () => {
            const watched = watch('import Tally\npanel:tally', { panel }, { schedule: 'delayed', delay: 100 });

            await pass(0);
            panel.setAttribute('data-n', '2');
            await pass(50);
            await watched.refreshAsync();

            expect(snapshots).toEqual([1, 2]);

            await pass(200);
            panel.setAttribute('data-n', '3');
            await pass(50);
            watched.dispose();
            await pass(200);

            expect(evaluations).toBe(2);
        });

        it('is refused without a delay above 0, and a delay is refused under another schedule', () => {
            for (const options of [{ schedule: 'delayed' }, { schedule: 'delayed', delay: 0 }, { schedule: 'delayed', delay: '100' }, { delay: 100 }, { schedule: 'immediate', delay: 100 }]) {
                expect(() => isolated.query('panel["data-n"]', { panel }).watch(options)).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2019' }));
            }
        });
    });

    describe('reporting on parts', () => {
        it('reports a snapshot whole only where a part it reports on changed, keeping the last one it reported until then', async () => {
            const [first] = panel.children;
            const watched = watch('{ n = panel["data-n"], m = first["data-n"] }', { panel, first }, { reportOn: ['n'] });

            await settle();
            await change(first, 5);

            expect(snapshots).toEqual([{ n: '1', m: '1' }]);
            expect(watched.snapshot).toEqual({ n: '1', m: '1' });

            await change(panel, 2);

            expect(snapshots).toEqual([{ n: '1', m: '1' }, { n: '2', m: '5' }]);
        });

        it('hands live state the changes since the last snapshot it reported, through a path into a part', async () => {
            const [first] = panel.children;
            const calls = [];

            watch('{ state = { n = panel["data-n"] }, m = first["data-n"] }', { panel, first }, { updateStrategy: 'liveState', reportOn: [['state', 'n']], onChange: (state, changes) => calls.push(changes) });

            await settle();
            await change(first, 5);
            await change(first, 6);
            await change(panel, 2);

            expect(calls).toEqual([[], [{ op: 'replace', path: '/state/n', value: '2' }, { op: 'replace', path: '/m', value: '6' }]]);
        });

        it('is refused where it is no list of paths, and where a path doesn\'t fit the result', () => {
            for (const reportOn of ['n', [], [3]]) {
                expect(() => isolated.query('{ n = panel["data-n"] }', { panel }).watch({ reportOn })).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2020' }));
            }

            expect(() => isolated.query('{ n = panel["data-n"] }', { panel }).watch({ reportOn: ['size'] })).toThrow(expect.objectContaining({ kind: 'validation' }));
        });
    });

    describe('sourceOf', () => {
        it('answers the element each item of a list in the snapshot came from, as the items move, and through a projection, a filter and a selected view', async () => {
            const [first, second] = panel.children;
            const watched = watch('{ rows = panel.children.where(it["data-n"] != null) { n = it["data-n"] } { label = it.n } }', { panel });

            expect(watched.sourceOf('rows', 0)).toBeNull();

            await settle();

            expect([watched.sourceOf('rows', 0), watched.sourceOf('rows', 1)]).toEqual([first, second]);

            panel.insertBefore(second, first);
            await settle();

            expect([watched.sourceOf('rows', 0), watched.sourceOf('rows', 1)]).toEqual([second, first]);
            expect(watched.select('rows').sourceOf(1)).toBe(first);
            expect(watched.sourceOf('rows', 2)).toBeNull();
        });

        it('answers null for an item of a list no projection built, or one that descends from data', async () => {
            const watched = watch('{ ns = [1, 2], keys = ["a", "b"] { key = it } }', {});

            await settle();

            expect(watched.sourceOf('ns', 0)).toBeNull();
            expect(watched.sourceOf('keys', 1)).toBeNull();
        });

        it('answers the element an item came from in a watch that keeps live state, and in one of a selection, its path relative to the part', async () => {
            const [first, second] = panel.children;
            const living = watch('{ rows = panel.children { n = it["data-n"] } }', { panel }, { updateStrategy: 'liveState' });
            const selected = isolated.query('{ rows = panel.children { n = it["data-n"] } }', { panel }).select('rows').watch({ schedule: 'immediate' });

            watches.push(selected);
            await settle();

            expect(living.sourceOf('rows', 1)).toBe(second);
            expect(selected.sourceOf(0)).toBe(first);
        });

        it('refuses a path that ends at no list\'s item, or that doesn\'t fit the result', () => {
            const watched = watch('{ rows = panel.children { n = it["data-n"] } }', { panel });

            expect(() => watched.sourceOf('rows')).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2016' }));
            expect(() => watched.sourceOf('rows', 0, 'n')).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2016' }));
            expect(() => watched.sourceOf('columns', 0)).toThrow(expect.objectContaining({ kind: 'validation' }));
        });
    });

    describe('readyAsync', () => {
        it('rejects when called after disposal, even where the watch was ready', async () => {
            const watched = watch('panel["data-n"]', { panel });

            await settle();
            watched.dispose();

            const error = await rejection(watched.readyAsync());

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5005', message: expect.stringContaining('A disposed watch is never ready') });
            expect(error.location).toEqual({});
        });

        it('rejects a caller waiting for the watch to be ready where the watch is disposed first', async () => {
            const [first] = panel.children;
            const watched = watch('import Level\n{ n = item:level }', { item: first });

            await settle();

            const waiting = rejection(watched.readyAsync());

            expect(watched.status).toBe('pending');

            watched.dispose();

            const error = await waiting;

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5014', message: expect.stringContaining('The watch was disposed before it was ready') });
            expect(error.location).toEqual({});
        });
    });

    describe('dispose', () => {
        it('ends the watch: it reports nothing more and lets go of every observation', async () => {
            const [first] = panel.children;
            const watched = watch('import Level\n{ n = item:level, id = panel["data-n"] }', { item: first, panel });

            await settle();
            gauges.get(first).sample = { pending: false, value: 1 };
            gauges.get(first).notify();
            await settle();

            watched.dispose();

            expect(watched.status).toBe('disposed');
            expect(gauges.get(first).stopped).toBe(1);

            await change(panel, 9);
            gauges.get(first).notify();
            await settle();

            expect(snapshots).toEqual([{ n: 1, id: '1' }]);
        });

        it('cancels the evaluation it scheduled', async () => {
            const frames = holdFrames();
            const watched = watch('import Tally\npanel:tally', { panel }, { schedule: 'frame' });

            await settle();
            panel.setAttribute('data-n', '2');
            await settle();
            watched.dispose();
            frames.callbacks[0]();

            expect(snapshots).toEqual([1]);
        });

        it('prevents the first snapshot when it comes before it', async () => {
            const watched = watch('panel["data-n"]', { panel });

            watched.dispose();
            await settle();

            expect(snapshots).toEqual([]);
        });

        it('does nothing when it is repeated', async () => {
            const watched = watch('panel["data-n"]', { panel });

            await settle();
            watched.dispose();
            watched.dispose();

            expect(watched.status).toBe('disposed');
        });

        it('lets a handler already running finish, and starts none after', async () => {
            let finished = false;
            const watched = watch('panel["data-n"]', { panel }, {
                onChange: async snapshot => {
                    snapshots.push(snapshot);
                    watched.dispose();
                    await settle();
                    finished = true;
                },
            });

            await settle(5);
            await change(panel, 3);

            expect(finished).toBe(true);
            expect(snapshots).toEqual(['1']);
        });
    });

    describe('keeping live state', () => {
        /** A watch that keeps its result as live state, recording each object and change set its ready change events carry, and what the object held at that moment. */
        const watchLive = (text, bindings) => {
            const calls = [];
            const watched = watch(text, bindings, {
                updateStrategy: 'liveState',
                onChange: (state, changes) => calls.push({ state, changes, seen: JSON.parse(JSON.stringify(state)) }),
            });

            return { watched, calls };
        };

        it('hands its change handler one object, kept current in place, with the change set just applied to it', async () => {
            const { watched, calls } = watchLive('panel { n = it["data-n"], rows = it.children { n = it["data-n"] } }', { panel });

            await settle();
            await change(panel.children[1], 7);

            expect(calls).toHaveLength(2);
            expect(calls[0].changes).toEqual([]);
            expect(calls[1].state).toBe(calls[0].state);
            expect(calls[1].changes).toEqual([{ op: 'replace', path: '/rows/1/n', value: '7' }]);
            expect(calls[1].seen).toEqual({ n: '1', rows: [{ n: '1' }, { n: '7' }] });
            expect(watched.liveState).toBe(calls[0].state);
            expect(watched.snapshot).toEqual(calls[1].seen);
            expect(Object.isFrozen(watched.snapshot)).toBe(true);
        });

        it('keeps the object of each item as its element moves, and adds and removes items in place', async () => {
            const [first, second] = panel.children;
            const { watched } = watchLive('{ rows = panel.children { n = it["data-n"] } }', { panel });

            await settle();

            const { rows } = watched.liveState;
            const [rowOfFirst, rowOfSecond] = rows;
            const added = document.createElement('i');

            added.setAttribute('data-n', '3');
            panel.insertBefore(second, first);
            panel.append(added);
            await settle();

            expect(watched.liveState.rows).toBe(rows);
            expect(rows).toEqual([{ n: '2' }, { n: '1' }, { n: '3' }]);
            expect(rows[0]).toBe(rowOfSecond);
            expect(rows[1]).toBe(rowOfFirst);

            first.remove();
            await settle();

            expect(rows).toEqual([{ n: '2' }, { n: '3' }]);
            expect(rows[0]).toBe(rowOfSecond);
        });

        it('puts each element\'s object back in its place after a reorder that changed no data, once a change follows', async () => {
            const [first, second] = panel.children;

            first.setAttribute('data-n', '0');
            second.setAttribute('data-n', '0');

            const { watched } = watchLive('{ rows = panel.children { n = it["data-n"] } }', { panel });

            await settle();

            const { rows } = watched.liveState;
            const rowOfSecond = rows[1];

            // The elements swap, which leaves the result as it was, and then the second one changes.
            panel.insertBefore(second, first);
            await settle();
            second.setAttribute('data-n', '5');
            await settle();

            expect(rows).toEqual([{ n: '5' }, { n: '0' }]);
            expect(rows[0]).toBe(rowOfSecond);
        });

        describe('change sets a host coalesces', () => {
            /** Applies a change set as JSON Patch applies a document, one operation after another, moving an item itself rather than a copy of it, and answers the document it gives. */
            const applyPatch = (document, operations) => {
                const tokensOf = pointer => (pointer === '' ? [] : pointer.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~')));
                const parentOf = tokens => tokens.slice(0, -1).reduce((node, token) => node[Array.isArray(node) ? Number(token) : token], document);
                const take = tokens => {
                    const parent = parentOf(tokens);
                    const last = tokens.at(-1);

                    if (Array.isArray(parent)) {
                        return parent.splice(Number(last), 1)[0];
                    }

                    const value = parent[last];

                    delete parent[last];

                    return value;
                };
                const put = (tokens, value, adds) => {
                    const parent = parentOf(tokens);
                    const last = tokens.at(-1);

                    if (Array.isArray(parent) && adds) {
                        parent.splice(last === '-' ? parent.length : Number(last), 0, value);
                    } else {
                        parent[Array.isArray(parent) ? Number(last) : last] = value;
                    }
                };

                for (const operation of operations) {
                    const tokens = tokensOf(operation.path);

                    if (tokens.length === 0) {
                        document = structuredClone(operation.value);
                    } else if (operation.op === 'remove') {
                        take(tokens);
                    } else if (operation.op === 'move') {
                        put(tokens, take(tokensOf(operation.from)), true);
                    } else {
                        put(tokens, structuredClone(operation.value), operation.op === 'add');
                    }
                }

                return document;
            };

            /** A watch of each row's value as live state, recording every ready event's snapshot and change set. */
            const watchRows = () => {
                const events = [];
                const watched = isolated.query('{ rows = panel.children { n = it["data-n"] } }', { panel }).watch({ schedule: 'immediate', updateStrategy: 'liveState' });

                watches.push(watched);
                watched.subscribe('change', (sender, args) => events.push({ snapshot: args.snapshot, changes: args.changes }));

                return { watched, events };
            };

            it('compose: concatenated in order, they take the first event\'s snapshot to the last one\'s, each item kept as the object of its element', async () => {
                const [first, second] = panel.children;
                const { events } = watchRows();
                const third = document.createElement('i');

                await settle();

                // The receiving side's copy, its first row the first element's and its second the second's.
                const copy = structuredClone(events[0].snapshot);
                const [rowOfFirst, rowOfSecond] = copy.rows;

                // While one delivery is in flight, the rows move, change, enter and leave, each in a change set of its own.
                panel.insertBefore(second, first);
                await settle();
                first.setAttribute('data-n', '10');
                await settle();
                third.setAttribute('data-n', '3');
                panel.prepend(third);
                await settle();
                panel.append(second);
                second.setAttribute('data-n', '20');
                await settle();

                const changes = events.slice(1).flatMap(event => event.changes);
                const applied = applyPatch(copy, changes);

                expect(events).toHaveLength(5);
                expect(changes).toContainEqual({ op: 'move', from: '/rows/1', path: '/rows/0' });
                expect(applied).toBe(copy);
                expect(applied).toEqual(events.at(-1).snapshot);
                expect(applied).toEqual({ rows: [{ n: '3' }, { n: '10' }, { n: '20' }] });
                expect(applied.rows[1]).toBe(rowOfFirst);
                expect(applied.rows[2]).toBe(rowOfSecond);
            });

            it('give the latest snapshot as a new baseline, sent whole as one operation replacing the root', async () => {
                const { watched, events } = watchRows();

                await settle();
                await change(panel.children[0], 5);

                const copy = applyPatch(structuredClone(events[0].snapshot), [{ op: 'replace', path: '', value: watched.snapshot }]);

                expect(copy).toEqual({ rows: [{ n: '5' }, { n: '2' }] });
                expect(copy).toEqual(events.at(-1).snapshot);
            });
        });

        it('leaves the object as it was through a failed evaluation, and brings it up to date in one change set on recovery', async () => {
            const { watched, calls } = watchLive('import Flaky\n{ n = panel:flaky, m = panel["data-n"] }', { panel });

            await settle();
            broken = true;
            await change(panel, 4);

            expect(watched.status).toBe('failed');
            expect(watched.liveState).toEqual({ n: 1, m: '1' });
            expect(failures.length).toBeGreaterThan(0);

            broken = false;
            await change(panel, 5);

            expect(watched.liveState).toEqual({ n: 5, m: '5' });
            expect(calls.at(-1).changes).toEqual([{ op: 'replace', path: '/n', value: 5 }, { op: 'replace', path: '/m', value: '5' }]);
        });

        it('hands its change handler an empty change set when an evaluation recovers from a failure with the result it had', async () => {
            const { calls } = watchLive('import Flaky\n{ n = panel:flaky }', { panel });

            await settle();
            broken = true;
            await change(panel, 1);
            broken = false;
            await change(panel, 1);

            expect(calls).toHaveLength(2);
            expect(calls.at(-1).changes).toEqual([]);
        });

        it('stops changing the object once disposed, and the caller keeps it as it last was', async () => {
            const { watched } = watchLive('{ n = panel["data-n"] }', { panel });

            await settle();

            const state = watched.liveState;

            watched.dispose();
            await change(panel, 9);

            expect(state).toEqual({ n: '1' });
        });

        it('is refused for a result that is no object or list, or that can be null', () => {
            expect(() => watch('panel["data-n"]', { panel }, { updateStrategy: 'liveState' })).toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3001', message: expect.stringContaining('Live state keeps one object current') }));
            expect(() => watch('item { n = it["data-n"] }', { item: null }, { updateStrategy: 'liveState' })).toThrow(expect.objectContaining({ kind: 'validation', code: 'DOMQL3001', message: expect.stringContaining('put it in a top-level object expression') }));
        });

        it('is held only by a watch that keeps live state', async () => {
            const watched = watch('{ n = panel["data-n"] }', { panel });

            await settle();

            expect(watched.liveState).toBeUndefined();
        });
    });

    describe('a query that is watched', () => {
        it('is refused when a member only partly observes its changes, unless the watch accepts that', () => {
            const query = isolated.query('panel.rect', { panel });
            const error = (() => {
                try {
                    query.watch();
                } catch (failure) {
                    return failure;
                }

                throw new Error('The watch was created');
            })();

            expect(error.name).toBe('NexoError');
            expect(error.kind).toBe('validation');
            expect(error.code).toBe('DOMQL3003');
            expect(error.message).toContain('rect');

            watches.push(query.watch({ acceptPartialObservation: true }));
        });

        it('takes a schedule and an update strategy that exist', () => {
            const query = isolated.query('panel["id"]', { panel });

            for (const [options, code] of [[{ schedule: 'later' }, 'DOMQL2003'], [{ updateStrategy: 'patch' }, 'DOMQL2004']]) {
                expect(() => query.watch(options)).toThrow(expect.objectContaining({ name: 'NexoError', kind: 'structure', code }));
            }
        });

        it('takes listeners of its change and error events alone, each with the function that handles them', () => {
            const watched = watch('panel["id"]', { panel });

            for (const [eventName, handler, code] of [['change', 3, 'DOMQL2007'], ['error', 3, 'DOMQL2007'], ['changed', () => {}, 'DOMQL2008']]) {
                expect(() => watched.subscribe(eventName, handler)).toThrow(expect.objectContaining({ name: 'NexoError', kind: 'structure', code }));
            }
        });

        it('is a query: a request that is not one is refused when the watch is made', () => {
            const subscription = isolated.query('panel.on("click") { ratio = Domql.window.devicePixelRatio }', { panel });

            expect(subscription.resolve({ watch: true }).kind).toBe('subscription');
            expect(() => subscription.watch()).toThrow(expect.objectContaining({ name: 'NexoError', kind: 'validation', code: 'DOMQL3004', message: expect.stringContaining('it listens to events.\nUse subscribe()') }));
        });

        it('is scheduled by animation frame only in a window that has them', () => {
            const query = isolated.query('panel["id"]', { panel });
            const frameless = { document, reportError: () => {} };

            expect(() => query.watch({ window: frameless })).toThrow(expect.objectContaining({ kind: 'structure', code: 'DOMQL2006' }));
            watches.push(query.watch({ window: frameless, schedule: 'immediate' }));
        });

        it('needs a browser window', () => {
            expect(() => isolated.query('Domql.window.devicePixelRatio').watch({ window: null })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5002' }));
        });
    });
});

describe('Watch cleanup', () => {
    /** A session that counts its disposals, and fails them where it is told to. */
    const session = failure => {
        const held = { disposed: 0 };

        held.dispose = () => {
            held.disposed++;

            if (failure !== undefined) {
                throw failure;
            }
        };

        return held;
    };

    it('lets go of every evaluation it holds where letting go of one fails, and reports the failure', async () => {
        const evaluations = [];
        const reported = [];
        const snapshots = [];
        const evaluator = {
            evaluate: () => {
                const sessions = [session(new Error(`stuck ${evaluations.length + 1}`)), session()];

                evaluations.push(sessions);

                const owner = {};

                return new QueryEvaluation({ value: evaluations.length, isPending: false, dependencies: [], sessions: sessions.map(held => ({ session: held, owner })), owner, error: null });
            },
        };
        const watch = new Watch({
            evaluator,
            observations: null,
            comparer: { reconcile: (_last, _identities, next) => next },
            window,
            reportError: error => reported.push(error),
            checkPath: () => {},
            options: { schedule: 'immediate' },
        });

        watch.subscribe('change', (_sender, args) => snapshots.push(args.value));
        await watch.refreshAsync();
        await watch.refreshAsync();
        watch.dispose();

        expect(snapshots).toEqual([1, 2]);
        expect(evaluations.flat().map(held => held.disposed)).toEqual([1, 1, 1, 1]);
        expect(reported.map(error => error.message)).toEqual(['stuck 1', 'stuck 2']);
        expect(watch.status).toBe('disposed');
    });
});
