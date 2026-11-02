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

    it('starts nothing for a receiver that is null, until an update binds one', () => {
        const handle = run('target?.ownClass({ name = "open" })', { target: null });

        expect(handle.status).toBe('ready');

        handle.update({ target: panel });

        expect(panel.classList.contains('open')).toBe(true);
        expect(reported).toEqual([]);
    });
});
