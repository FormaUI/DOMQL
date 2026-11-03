import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

/** The writes DOMQL owns while they run, `ownAttribute`, `ownClass` and `ownStyle`, run through `domql` against the simulated document. */
describe('OwnedWrites', () => {
    // Each test loads its own copy of domql, with a registry of its own, whose owned writes share their targets.
    let domql;
    let panel;
    let other;
    let reported;
    let handles;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel" lang="en" class="base" style="color: red"></div><div id="other"></div>';
        panel = document.getElementById('panel');
        other = document.getElementById('other');
        reported = [];
        handles = [];
        window.reportError = error => reported.push(error);
    });

    afterEach(() => {
        handles.forEach(handle => handle.dispose());
        document.body.innerHTML = '';
    });

    /** Runs the continuous execution the text ends in, with the bindings, answering its handle. */
    const run = (text, bindings) => {
        const handle = domql.query(text, bindings).run();

        handles.push(handle);

        return handle;
    };

    /** Lets a mutation be observed and the frame after it run. */
    const nextFrame = async () => {
        await Promise.resolve();
        await new Promise(resolve => requestAnimationFrame(resolve));
    };

    describe('an attribute', () => {
        it('is held at its value while the write runs, updated with its bindings, and written back as it was found once disposed', () => {
            const handle = run('panel.ownAttribute({ name = "tabindex", value = value })', { panel, value: '-1' });

            expect(domql.query('panel.ownAttribute({ name = "x", value = null })', { panel }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'continuous', type: null });
            expect(panel.getAttribute('tabindex')).toBe('-1');

            handle.update({ panel, value: '0' });

            expect(panel.getAttribute('tabindex')).toBe('0');

            handle.dispose();

            expect(panel.hasAttribute('tabindex')).toBe(false);
        });

        it('is held absent where its value is null, and keeps a value the page keeps where it restores none', () => {
            const absent = run('panel.ownAttribute({ name = "lang", value = null })', { panel });

            expect(panel.hasAttribute('lang')).toBe(false);

            absent.dispose();

            expect(panel.getAttribute('lang')).toBe('en');

            run('panel.ownAttribute({ name = "lang", value = "he", restore = false })', { panel }).dispose();

            expect(panel.getAttribute('lang')).toBe('he');
        });

        it('moves to the element an update binds, letting go of the one it held', () => {
            const handle = run('target.ownAttribute({ name = "hidden", value = "" })', { target: panel });

            handle.update({ target: other });

            expect([panel.hasAttribute('hidden'), other.hasAttribute('hidden')]).toEqual([false, true]);
        });

        it('fails to start for a name the browser refuses, and leaves its write as it was where an update names one', () => {
            expect(() => run('panel.ownAttribute({ name = "1 x", value = "" })', { panel })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5007', message: expect.stringContaining("The execution 'ownAttribute' failed to start") }));

            const handle = run('panel.ownAttribute({ name = name, value = "on" })', { panel, name: 'data-state' });

            expect(() => handle.update({ panel, name: '1 x' })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5006' }));
            expect(panel.getAttribute('data-state')).toBe('on');

            handle.dispose();

            expect(panel.hasAttribute('data-state')).toBe(false);
        });
    });

    describe('holders of one target', () => {
        it('apply the latest holder\'s value, give the target back to the one before as it ends, and write back the value found as the last ends', () => {
            const first = run('panel.ownAttribute({ name = "tabindex", value = "-1" })', { panel });
            const second = run('panel.ownAttribute({ name = "tabindex", value = "0" })', { panel });

            expect(panel.getAttribute('tabindex')).toBe('0');

            second.dispose();

            expect(panel.getAttribute('tabindex')).toBe('-1');

            first.dispose();

            expect(panel.hasAttribute('tabindex')).toBe(false);
        });

        it('leave the latest holder\'s value as it is where one before it ends, and the target the last finds where it is the one whose restoring decides', () => {
            const first = run('panel.ownAttribute({ name = "tabindex", value = "-1", restore = false })', { panel });
            const second = run('panel.ownAttribute({ name = "tabindex", value = "0" })', { panel });

            first.dispose();

            expect(panel.getAttribute('tabindex')).toBe('0');

            second.dispose();

            expect(panel.hasAttribute('tabindex')).toBe(false);
        });

        it('leave another writer\'s value standing, writing nothing as they end', () => {
            const first = run('panel.ownAttribute({ name = "lang", value = "fr" })', { panel });
            const second = run('panel.ownAttribute({ name = "lang", value = "de" })', { panel });

            panel.setAttribute('lang', 'it');
            second.dispose();

            expect(panel.getAttribute('lang')).toBe('it');

            first.dispose();

            expect(panel.getAttribute('lang')).toBe('it');
        });

        it('are an instance\'s own, so another instance\'s writes are another writer\'s', async () => {
            vi.resetModules();

            const { domql: another } = await import('#domql/domql.js');
            const mine = run('panel.ownAttribute({ name = "lang", value = "fr" })', { panel });
            const theirs = another.query('panel.ownAttribute({ name = "lang", value = "de" })', { panel }).run();

            mine.dispose();

            expect(panel.getAttribute('lang')).toBe('de');

            theirs.dispose();

            expect(panel.getAttribute('lang')).toBe('fr');
        });
    });

    describe('keeping a value', () => {
        it('writes the value again before the next frame where another writer changes it, while the write keeps it', async () => {
            const handle = run('panel.ownAttribute({ name = "lang", value = "he", restore = false, keep = true })', { panel });

            panel.setAttribute('lang', 'en');
            await nextFrame();

            expect(panel.getAttribute('lang')).toBe('he');

            handle.update({ panel });
            panel.removeAttribute('lang');
            await nextFrame();

            expect(panel.getAttribute('lang')).toBe('he');
        });

        it('lets another writer\'s value stand where the write doesn\'t keep it, or once it is disposed', async () => {
            run('panel.ownAttribute({ name = "dir", value = "rtl" })', { panel });

            panel.setAttribute('dir', 'ltr');
            await nextFrame();

            expect(panel.getAttribute('dir')).toBe('ltr');

            const kept = run('panel.ownAttribute({ name = "dir", value = "rtl", keep = true })', { panel });

            kept.dispose();
            panel.setAttribute('dir', 'auto');
            await nextFrame();

            expect(panel.getAttribute('dir')).toBe('auto');
        });

        it('yields to another writer that writes its value again in answer, rather than fight it, until an update writes the holder\'s again', async () => {
            const written = [];

            // Another writer that keeps its own value too, writing it again as soon as it is changed, as a module's code holding the document's language does.
            const holder = new MutationObserver(() => {
                if (panel.getAttribute('lang') !== 'de') {
                    panel.setAttribute('lang', 'de');
                }
            });
            const handle = run('panel.ownAttribute({ name = "lang", value = value, restore = false, keep = true })', { panel, value: 'he' });
            const recorder = new MutationObserver(records => written.push(...records.map(() => panel.getAttribute('lang'))));

            recorder.observe(panel, { attributes: true, attributeFilter: ['lang'] });
            holder.observe(panel, { attributes: true, attributeFilter: ['lang'] });
            panel.setAttribute('lang', 'de');

            for (let frame = 0; frame < 6; frame++) {
                await nextFrame();
            }

            expect(panel.getAttribute('lang')).toBe('de');
            expect(written.filter(value => value === 'he').length).toBeLessThanOrEqual(1);

            // Having yielded, the write lets every other writer's value stand, until an update writes its own again and keeps it.
            holder.disconnect();
            panel.setAttribute('lang', 'en');
            await nextFrame();
            await nextFrame();

            expect(panel.getAttribute('lang')).toBe('en');

            handle.update({ panel, value: 'fr' });
            panel.setAttribute('lang', 'en');
            await nextFrame();

            expect(panel.getAttribute('lang')).toBe('fr');
            recorder.disconnect();
        });

        it('stops alternating with another instance\'s write that keeps its value too, writing again in a frame of its own', async () => {
            vi.resetModules();

            const { domql: another } = await import('#domql/domql.js');
            const values = [];
            const recorder = new MutationObserver(records => values.push(...records.map(() => panel.getAttribute('dir'))));

            recorder.observe(panel, { attributes: true, attributeFilter: ['dir'] });
            run('panel.ownAttribute({ name = "dir", value = "rtl", keep = true })', { panel });

            const theirs = another.query('panel.ownAttribute({ name = "dir", value = "ltr", keep = true })', { panel }).run();

            for (let frame = 0; frame < 10; frame++) {
                await nextFrame();
            }

            const settled = values.length;

            for (let frame = 0; frame < 5; frame++) {
                await nextFrame();
            }

            expect(values.length).toBe(settled);
            expect(settled).toBeLessThanOrEqual(5);
            theirs.dispose();
            recorder.disconnect();
        });

        it('goes on keeping its value against patches that don\'t answer its writes, each a frame or more apart', async () => {
            run('panel.ownClass({ name = "dragging", keep = true })', { panel });

            for (let patch = 0; patch < 3; patch++) {
                panel.className = 'base';
                await nextFrame();
                await nextFrame();
                await nextFrame();

                expect(panel.classList.contains('dragging')).toBe(true);
            }
        });

        it('goes on keeping its value against a framework rendering again within the frames after its write, each render a value the framework hasn\'t written before', async () => {
            const handle = run('panel.ownClass({ name = "dragging", keep = true })', { panel });
            const renders = ['base active', 'base active focused', 'base focused', 'base'];

            for (const render of renders) {
                panel.className = render;
                await nextFrame();

                expect(panel.className).toBe(`${render} dragging`);
            }

            // A writer that restores the value it wrote, in answer, keeps a value of its own, and is yielded to.
            const holder = new MutationObserver(() => {
                if (panel.className !== 'base') {
                    panel.className = 'base';
                }
            });

            holder.observe(panel, { attributes: true, attributeFilter: ['class'] });
            panel.className = 'base';

            for (let frame = 0; frame < 6; frame++) {
                await nextFrame();
            }

            expect(panel.className).toBe('base');
            holder.disconnect();
            handle.update({ panel });
            expect(panel.className).toBe('base dragging');
        });

        it('is the latest holder\'s alone, so a holder that keeps its value before another never fights it', async () => {
            run('panel.ownAttribute({ name = "lang", value = "fr", keep = true })', { panel });
            run('panel.ownAttribute({ name = "lang", value = "de" })', { panel });
            await nextFrame();

            expect(panel.getAttribute('lang')).toBe('de');
        });
    });

    describe('a class', () => {
        it('is held present, or absent, while the write runs, and its presence written back as it was found', () => {
            const added = run('panel.ownClass({ name = "dragging" })', { panel });
            const removed = run('panel.ownClass({ name = "base", present = false })', { panel });

            expect([...panel.classList]).toEqual(['dragging']);

            added.dispose();
            removed.dispose();

            expect([...panel.classList]).toEqual(['base']);
        });

        it('is kept against a framework that writes the whole class attribute, where the write keeps it', async () => {
            run('panel.ownClass({ name = "autofilled", keep = true })', { panel });

            panel.className = 'base rerendered';
            await nextFrame();

            expect([...panel.classList]).toEqual(['base', 'rerendered', 'autofilled']);
        });

        it('fails to start for a name that is no class', () => {
            expect(() => run('panel.ownClass({ name = "a b" })', { panel })).toThrow(expect.objectContaining({ kind: 'evaluation', code: 'DOMQL5007', cause: expect.objectContaining({ message: expect.stringContaining('"a b" is no class') }) }));
        });
    });

    describe('an inline style property', () => {
        it('is held at its value while the write runs, declared none where it is null, and written back as it was declared', () => {
            const color = run('panel.ownStyle({ property = "color", value = null })', { panel });
            const height = run('panel.ownStyle({ property = "min-height", value = "120px" })', { panel });

            expect([panel.style.getPropertyValue('color'), panel.style.getPropertyValue('min-height')]).toEqual(['', '120px']);

            color.dispose();
            height.dispose();

            expect([panel.style.getPropertyValue('color'), panel.style.getPropertyValue('min-height')]).toEqual(['red', '']);
        });

        it('leaves a position a gesture committed where it restores none', () => {
            run('panel.ownStyle({ property = "left", value = "40px", restore = false })', { panel }).dispose();

            expect(panel.style.getPropertyValue('left')).toBe('40px');
        });
    });

    describe('a text', () => {
        it('is held in the one text node the element holds, written in place so a framework that rendered the node keeps it, and written back as it was found', () => {
            other.textContent = '0';

            const node = other.firstChild;
            const handle = run('other.ownText({ value = count })', { other, count: '12' });

            expect(domql.query('other.ownText({ value = null })', { other }).resolve()).toMatchObject({ kind: 'execution', executionMode: 'continuous', type: null });
            expect(other.firstChild).toBe(node);
            expect(node.data).toBe('12');

            handle.update({ other, count: '13' });

            expect(other.firstChild).toBe(node);
            expect(node.data).toBe('13');

            handle.dispose();

            expect(other.firstChild).toBe(node);
            expect(node.data).toBe('0');
        });

        it('adds a text node to an element that holds none, and takes it away as it ends where it restores, as for a value of null', () => {
            const handle = run('other.ownText({ value = "3 left" })', { other });

            expect(other.childNodes.length).toBe(1);
            expect(other.textContent).toBe('3 left');

            handle.update({ other });
            handle.dispose();

            expect(other.childNodes.length).toBe(0);
            expect(run('other.ownText({ value = null })', { other }) && other.childNodes.length).toBe(0);
        });

        it('fails to start for an element that holds other nodes, whose text would replace them', () => {
            other.innerHTML = '<b>bold</b>';

            const error = (() => {
                try {
                    run('other.ownText({ value = "x" })', { other });
                } catch (failure) {
                    return failure;
                }

                return null;
            })();

            expect(error).toMatchObject({ kind: 'evaluation', code: 'DOMQL5007' });
            expect(error.cause.message).toContain('The element holds nodes beside one text');
            expect(other.innerHTML).toBe('<b>bold</b>');
        });

        it('is kept against a framework that writes the node\'s data, where the write keeps it', async () => {
            other.textContent = '0';
            run('other.ownText({ value = "12", keep = true })', { other });

            other.firstChild.data = '0';
            await nextFrame();

            expect(other.textContent).toBe('12');
        });
    });

    it('starts nothing for a receiver that is null, until an update binds one', () => {
        const handle = run('target?.ownClass({ name = "open" })', { target: null });

        expect(handle.status).toBe('ready');

        handle.update({ target: panel });

        expect(panel.classList.contains('open')).toBe(true);
        expect(reported).toEqual([]);
    });
});
