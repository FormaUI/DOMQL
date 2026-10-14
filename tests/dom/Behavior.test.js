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

describe('Behavior', () => {
    // Each test loads its own copy of DOMQL, with a registry of its own.
    let isolated;
    let panel;
    let other;
    let calls;
    let reported;
    let breaks;

    /** A behavior module: its one member, named for it, on an element, taking a color. */
    const behavior = (name, start) => isolated.createModule(name, {
        members: [{
            name, function: name, kind: 'behavior', on: 'element', result: 'null', changes: 'unobserved', reads: 'fresh',
            input: 'direct',
            parameters: [{ name: 'color', kind: 'value', type: 'string', required: true, nulls: 'propagate' }],
        }],
    }, { [name]: start });

    /** Applies the behavior the text requests, bound to the bindings. */
    const apply = (text, bindings = {}) => isolated.query(text, bindings).apply();

    beforeEach(async () => {
        vi.resetModules();
        ({ domql: isolated } = await import('#domql/domql.js'));
        document.body.innerHTML = '<div id="panel"></div><div id="other"></div>';
        panel = document.getElementById('panel');
        other = document.getElementById('other');
        calls = [];
        reported = [];
        breaks = new Set();
        window.reportError = error => reported.push(error);

        // Marks its element with the color while it is in effect.
        isolated.registerModule(behavior('highlight', (element, { color }, environment, context) => {
            calls.push({ call: 'start', element, color, environment, context });
            element.dataset.highlight = color;

            let current = element;

            return {
                update: (next, { color: nextColor }) => {
                    calls.push({ call: 'update', element: next, color: nextColor });

                    if (breaks.has('update')) {
                        throw new Error('stuck');
                    }

                    delete current.dataset.highlight;
                    current = next;
                    current.dataset.highlight = nextColor;
                },
                dispose: () => {
                    calls.push({ call: 'dispose', element: current });
                    delete current.dataset.highlight;

                    if (breaks.has('dispose')) {
                        throw new Error('held');
                    }
                },
            };
        }));
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    describe('applying', () => {
        it('puts the behavior into effect in the call, with its receiver, arguments, environment and reporter', () => {
            const highlight = apply('@panel.highlight(@color)', { panel, color: 'gold' });

            expect(highlight.status).toBe('ready');
            expect(panel.dataset.highlight).toBe('gold');
            expect(calls).toEqual([{ call: 'start', element: panel, color: 'gold', environment: { window, document }, context: { reportError: expect.any(Function) } }]);
        });

        it('takes a behavior request made from its definition', () => {
            const { definition } = isolated.query('@panel.highlight("teal")');

            isolated.query(definition, { panel }).apply();

            expect(panel.dataset.highlight).toBe('teal');
        });

        it('raises a failure the behavior reports while it runs as an error event, which reaches the window\'s error reporting where no listener takes it', () => {
            const highlight = apply('@panel.highlight("gold")', { panel });
            const received = [];

            calls[0].context.reportError(new Error('unheard'));
            highlight.subscribe('error', (sender, args) => received.push({ sender, args }));
            calls[0].context.reportError(new Error('flicker'));

            expect(received).toEqual([{ sender: highlight, args: { error: expect.objectContaining({ message: 'flicker' }) } }]);
            expect(reported.map(error => error.message)).toEqual(['unheard']);
        });

        it('applies nothing where its receiver is null, until an update supplies one', () => {
            const highlight = apply('@item.highlight("gold")', { item: null });

            expect(calls).toEqual([]);

            highlight.update({ item: panel });

            expect(panel.dataset.highlight).toBe('gold');
            expect(calls.map(call => call.call)).toEqual(['start']);

            highlight.update({ item: null });

            expect(panel.dataset.highlight).toBeUndefined();
            expect(calls.map(call => call.call)).toEqual(['start', 'dispose']);
        });

        it('fails the call where the behavior cannot start, or answers no way to update and dispose it, leaving nothing running', () => {
            let disposed = 0;

            isolated.registerModule(behavior('broken', () => { throw new Error('closed'); }));
            isolated.registerModule(behavior('partial', () => ({ dispose: () => disposed++ })));

            const thrown = getError(() => apply('@panel.broken("gold")', { panel }));

            expect(thrown).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The behavior 'broken' failed to start") });
            expect(thrown.cause.message).toBe('closed');
            expect(getError(() => apply('@panel.partial("gold")', { panel }))).toMatchObject({ kind: 'evaluation', message: expect.stringContaining('answered no update and dispose') });
            expect(disposed).toBe(1);
        });

        it('is refused for a request of another kind, and a behavior request is refused by the other calls', () => {
            expect(getError(() => apply('@panel.children.count', { panel }))).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot apply '@panel.children.count': it produces a value.\nUse evaluate(), evaluateAsync() or watch().") });
            expect(getError(() => isolated.query('@panel.highlight("gold")', { panel }).evaluate())).toMatchObject({ kind: 'validation', message: expect.stringContaining("Cannot evaluate '@panel.highlight(\"gold\")': it applies a behavior.\nUse apply().") });
            expect(calls).toEqual([]);
        });
    });

    describe('updating', () => {
        it('replaces the bindings whole, handing the behavior its new receiver and arguments', () => {
            const highlight = apply('@target.highlight(@color)', { target: panel, color: 'gold' });

            highlight.update({ target: other, color: 'teal' });

            expect(panel.dataset.highlight).toBeUndefined();
            expect(other.dataset.highlight).toBe('teal');
            expect(calls.at(-1)).toEqual({ call: 'update', element: other, color: 'teal' });
        });

        it('validates the bindings before anything changes, leaving the behavior as it was', () => {
            const highlight = apply('@target.highlight(@color)', { target: panel, color: 'gold' });

            expect(getError(() => highlight.update({ target: other }))).toMatchObject({ kind: 'validation', message: expect.stringContaining("The parameter '@color' is not bound") });
            expect(getError(() => highlight.update({ target: other, color: 7 }))).toMatchObject({ kind: 'validation' });
            expect(getError(() => highlight.update(null))).toMatchObject({ kind: 'structure' });
            expect(panel.dataset.highlight).toBe('gold');
            expect(calls.map(call => call.call)).toEqual(['start']);
        });

        it('throws a failure of the behavior\'s own update, which keeps what it last accepted', () => {
            const highlight = apply('@target.highlight(@color)', { target: panel, color: 'gold' });

            breaks.add('update');

            const error = getError(() => highlight.update({ target: other, color: 'teal' }));

            expect(error).toMatchObject({ kind: 'evaluation', message: expect.stringContaining("The behavior 'highlight' failed to update") });
            expect(error.cause.message).toBe('stuck');
            expect(panel.dataset.highlight).toBe('gold');
            expect(highlight.status).toBe('ready');
        });

        it('updates the same behavior after another module was registered', () => {
            const highlight = apply('@panel.highlight(@color)', { panel, color: 'gold' });

            isolated.registerModule(behavior('glow', () => ({ update: () => {}, dispose: () => {} })));
            highlight.update({ panel, color: 'teal' });

            expect(panel.dataset.highlight).toBe('teal');
        });

        it('throws once the behavior is disposed', () => {
            const highlight = apply('@panel.highlight("gold")', { panel });

            highlight.dispose();

            expect(getError(() => highlight.update({ panel }))).toMatchObject({ kind: 'evaluation', message: 'A disposed behavior cannot be updated' });
        });
    });

    describe('disposing', () => {
        it('ends the behavior once, however often it is disposed', () => {
            const highlight = apply('@panel.highlight("gold")', { panel });

            highlight.dispose();
            highlight.dispose();

            expect(highlight.status).toBe('disposed');
            expect(panel.dataset.highlight).toBeUndefined();
            expect(calls.map(call => call.call)).toEqual(['start', 'dispose']);
        });

        it('reports a failure of the behavior\'s own dispose, and ends the behavior all the same', () => {
            const highlight = apply('@panel.highlight("gold")', { panel });

            breaks.add('dispose');
            highlight.dispose();

            expect(highlight.status).toBe('disposed');
            expect(reported.map(error => error.message)).toEqual(['held']);
        });

        it('leaves the behavior\'s module registered, so it applies again', () => {
            apply('@panel.highlight("gold")', { panel }).dispose();
            apply('@panel.highlight("teal")', { panel });

            expect(panel.dataset.highlight).toBe('teal');
        });
    });
});
