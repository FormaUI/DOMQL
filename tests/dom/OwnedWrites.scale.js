import { describe, it } from 'vitest';
import { domql } from '#domql/domql.js';
import {
    allocatedDuring,
    allocationProfileDuring,
    formatLoad,
    formatSummary,
    ManualFrames,
    memoryNoise,
    metricOf,
    MutationCallbacks,
    nextTask,
    printProfile,
    printTable,
    runRounds,
    summaryOf,
    timeProfileDuring,
    usedMemory,
} from '../_scale/Measuring.js';

/**
 * A drag, or an anchored popover following its anchor, through owned writes, in Chromium. Each pointer step updates the two properties that place the element and four of its frame's geometry, while a renderer writes
 * the element's whole `class` and `style` attributes as its own state changes, with the position it last rendered. The gesture ends by committing its position, which the renderer renders; its host ends the holdings,
 * the position's with `restore = false`, once that render has reached the page, as D94 sets out.
 */

const hostCall = (name, overrides) => ({ name, kind: 'function', invokedBy: 'host', ...overrides });

/** The properties that place the element, which the gesture commits, so they are held with `restore = false`; and its frame's geometry, given back as the holding ends. */
const POSITION = ['left', 'top'];
const GEOMETRY = ['width', 'height', 'max-width', 'max-height'];
const PROPERTIES = [...POSITION, ...GEOMETRY];

/**
 * The text holding a property: its value a number the query writes with its unit, or the string itself, bound anew at each step. A binding of `number` or `string` may name a tag after a colon, as `number:warm`, which
 * the text carries as a comment, so it is a text no gesture before ran.
 */
const textOf = (property, binding) => {
    const [way, tag] = binding.split(':');
    const value = way === 'number' ? '$"{x}px"' : 'value';

    return `element.ownStyle({ property = "${property}", value = ${value}, keep = true${POSITION.includes(property) ? ', restore = false' : ''} })${tag === undefined ? '' : ` // ${tag}`}`;
};

/** The bindings of a property's value. */
const bindingsOf = (element, binding, x) => (binding.startsWith('number') ? { element, x } : { element, value: `${x}px` });

/** Each property's value at a pointer's place: the position follows it, and the frame's geometry grows with the distance moved and shrinks with the room left. */
const valuesAt = (x, y, start) => ({
    left: x + 0.5,
    top: y + 0.5,
    width: 320 + (x - start.x) * 0.25,
    height: 200 + (y - start.y) * 0.25,
    'max-width': 1280 - x - 0.5,
    'max-height': 720 - y - 0.5,
});

/**
 * A drag a module keeps on an element: from a press it holds the class `dragging` and each property through owned writes it runs with `env.domql`, for its owner, updating them at each move; as the pointer is released
 * it delivers the position it commits to `commits`, and `release()` ends its holdings.
 */
class Drag {
    #element;
    #env;
    #deliver;
    #binding;
    #controller = new AbortController();
    #holdings = null;
    #start = null;
    #position = null;

    constructor(element, { env, deliver, binding }) {
        this.#element = element;
        this.#env = env;
        this.#deliver = deliver;
        this.#binding = binding;

        const { signal } = this.#controller;

        element.addEventListener('pointerdown', event => this.#press(event), { signal });
        element.addEventListener('pointermove', event => this.#move(event), { signal });
        element.addEventListener('pointerup', () => this.#deliver('commits', this.#position), { signal });
    }

    #run(text, bindings) {
        return this.#env.domql.query(text, bindings).run({ owner: this.#env.owner, window: this.#env.window });
    }

    #press(event) {
        const element = this.#element;
        const values = valuesAt(event.clientX, event.clientY, (this.#start = { x: event.clientX, y: event.clientY }));

        this.#holdings = new Map([['dragging', this.#run('element.ownClass({ name = "dragging", keep = true })', { element })]]);

        for (const property of PROPERTIES) {
            this.#holdings.set(property, this.#run(textOf(property, this.#binding), bindingsOf(element, this.#binding, values[property])));
        }

        this.#position = { left: values.left, top: values.top };
    }

    #move(event) {
        if (this.#holdings === null) {
            return;
        }

        const values = valuesAt(event.clientX, event.clientY, this.#start);

        for (const property of PROPERTIES) {
            this.#holdings.get(property).update(bindingsOf(this.#element, this.#binding, values[property]));
        }

        this.#position = { left: values.left, top: values.top };
    }

    /** Ends the holdings: the position stands, and the frame's geometry and the class are given back where nothing wrote them since. */
    release() {
        this.#holdings?.forEach(holding => holding.dispose());
        this.#holdings = null;

        return true;
    }

    update() {}

    dispose() {
        this.#controller.abort();
        this.release();
    }
}

domql.registerModule(domql.createModule('Dragging', {
    types: [
        { name: 'Position', kind: 'structured', members: [{ name: 'left', kind: 'property', result: 'Number' }, { name: 'top', kind: 'property', result: 'Number' }] },
        {
            name: 'DraggingElements', kind: 'extension', target: 'Domql.Element',
            members: [
                hostCall('drag', {
                    requestKind: 'execution', executionMode: 'continuous', arguments: 'positional',
                    parameters: [{ name: 'binding', kind: 'value', type: 'String', required: true }],
                    impl: ({ receiver, env, deliver, args: { binding } }) => new Drag(receiver, { env, deliver, binding }),
                }),
                hostCall('commits', { requestKind: 'subscription', behavior: 'drag', result: 'Position' }),
                hostCall('release', { requestKind: 'execution', executionMode: 'once', behavior: 'drag', result: 'Boolean', impl: ({ instance }) => instance.release() }),
            ],
        },
    ],
}));

/**
 * A renderer of the element, as a framework's component: it writes the element's whole `class` and `style` as its own state changes, each render a value it hadn't written just before, and with the position its state
 * holds, the one it last rendered, until a commit gives it another. It renders in a microtask after its state changes, as a framework batches a render.
 */
class Renderer {
    #element;
    #active = false;
    #layer = 1;
    #position;
    renders = 0;
    milliseconds = 0;

    constructor(element, position) {
        this.#element = element;
        this.#position = position;
        this.#render();
    }

    /** Its state changes, so it renders again. */
    change() {
        this.#active = !this.#active;
        this.#layer++;
        queueMicrotask(() => this.#render());
    }

    /** A commit gives it a position, which it renders. */
    commit(position) {
        this.#position = position;
        this.change();
    }

    #render() {
        const start = performance.now();

        this.#element.setAttribute('class', this.#active ? 'window active' : 'window');
        this.#element.setAttribute('style', `position: absolute; left: ${this.#position.left}px; top: ${this.#position.top}px; z-index: ${this.#layer}`);
        this.renders++;
        this.milliseconds += performance.now() - start;
    }
}

const STEPS = 240;
const START = { x: 100, y: 80 };

/** A page of some content beside the dragged element, so a layout has more than one box to place. */
const createPage = () => {
    const page = document.body.appendChild(document.createElement('main'));

    page.innerHTML = Array.from({ length: 200 }, (_, index) => `<section><h3>Section ${index}</h3><p>Some text of the section, which wraps where the page is narrow.</p></section>`).join('');

    return page;
};

/**
 * A window the gesture drags: its element, its renderer, its behavior and the subscription that renders a commit, for an owner. `binding` says how the gesture binds each value.
 */
const createWindow = (binding, owner) => {
    const element = document.body.appendChild(document.createElement('div'));
    const renderer = new Renderer(element, { left: START.x, top: START.y });
    const behavior = binding === null ? null : domql.query('import Dragging\nelement:drag(binding)', { element, binding }).run({ owner });
    const commits = binding === null ? null : domql.query('import Dragging\nelement:commits() { left = it.left, top = it.top }', { element }).subscribe((sender, { value }) => renderer.commit(value), { owner });

    return {
        element,
        renderer,
        owner,
        isDragged: behavior !== null,
        dispose: () => {
            commits?.dispose();
            behavior?.dispose();
            element.remove();
        },
    };
};

const pointer = (element, type, x, y) => element.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true }));

/**
 * One gesture: a press, `STEPS` moves, each a frame, the renderer rendering every `renderEvery` steps, and the release, whose commit the renderer renders; once a frame has run after that render, the host releases
 * the holdings. Each step dispatches its move, lets its microtasks run, runs the frame by hand, then lays the page out. Answers what each phase of a step took on average, the worst step, and what went wrong.
 */
const gesture = async ({ element, renderer, owner, isDragged }, { frames, callbacks, renderEvery }) => {
    const totals = { move: 0, callbacks: 0, frame: 0, layout: 0, render: 0, worst: 0, worstUncollected: 0 };
    let stale = 0;
    let collected = 0;

    callbacks.reset();
    renderer.milliseconds = 0;

    const pressStart = performance.now();

    pointer(element, 'pointerdown', START.x, START.y);

    const press = performance.now() - pressStart;

    await nextTask();
    frames.run();

    const before = { callbacks: callbacks.callbacks, records: callbacks.records, milliseconds: callbacks.milliseconds, renders: renderer.renders };
    let framesRun = 0;

    for (let step = 1; step <= STEPS; step++) {
        const x = START.x + step;
        const y = START.y + step;
        const ran = callbacks.milliseconds;
        const rendered = renderer.milliseconds;
        const heap = performance.memory.usedJSHeapSize;
        const start = performance.now();

        pointer(element, 'pointermove', x, y);

        const moved = performance.now();

        if (step % renderEvery === 0) {
            renderer.change();
        }

        await nextTask();

        const settled = performance.now();

        framesRun += frames.run();

        const framed = performance.now();

        element.getBoundingClientRect();

        const laidOut = performance.now();
        const values = valuesAt(x, y, START);

        if (parseFloat(element.style.left) !== values.left || parseFloat(element.style.top) !== values.top || element.style.width !== `${values.width}px`) {
            stale++;
        }

        const domqlCallbacks = callbacks.milliseconds - ran;
        const work = moved - start + domqlCallbacks + (framed - settled) + (laidOut - framed);

        // A heap smaller than before the step was collected during it.
        const isCollected = performance.memory.usedJSHeapSize < heap;

        collected += isCollected ? 1 : 0;
        totals.move += moved - start;
        totals.callbacks += domqlCallbacks;
        totals.render += renderer.milliseconds - rendered;
        totals.frame += framed - settled;
        totals.layout += laidOut - framed;
        totals.worst = Math.max(totals.worst, work);
        totals.worstUncollected = isCollected ? totals.worstUncollected : Math.max(totals.worstUncollected, work);
    }

    const during = { callbacks: callbacks.callbacks - before.callbacks, records: callbacks.records - before.records, renders: renderer.renders - before.renders };

    // The release: the commit is delivered, its handler asks the renderer to render it, a frame runs after that render, and the host then ends the holdings.
    const committed = valuesAt(START.x + STEPS, START.y + STEPS, START);
    const releaseStart = performance.now();

    pointer(element, 'pointerup', START.x + STEPS, START.y + STEPS);
    await nextTask();
    frames.run();
    element.getBoundingClientRect();

    const positionAfterRender = parseFloat(element.style.left) === committed.left && parseFloat(element.style.top) === committed.top;

    if (isDragged) {
        await domql.query('import Dragging\nelement:release()', { element }).executeAsync({ owner });
    }

    const release = performance.now() - releaseStart;

    await nextTask();
    frames.run();

    const left = {
        position: parseFloat(element.style.left) === committed.left && parseFloat(element.style.top) === committed.top,
        geometry: GEOMETRY.every(property => element.style.getPropertyValue(property) === ''),
        dragging: !element.classList.contains('dragging'),
    };

    return {
        move: (totals.move * 1000) / STEPS,
        update: (totals.move * 1000) / STEPS / PROPERTIES.length,
        callbacks: (totals.callbacks * 1000) / STEPS,
        frame: (totals.frame * 1000) / STEPS,
        layout: (totals.layout * 1000) / STEPS,
        render: (totals.render * 1000) / STEPS,
        total: ((totals.move + totals.callbacks + totals.frame + totals.layout) * 1000) / STEPS,
        worst: totals.worst,
        worstUncollected: totals.worstUncollected,
        collected,
        callbacksPerStep: during.callbacks / STEPS,
        recordsPerStep: during.records / STEPS,
        framesPerStep: framesRun / STEPS,
        rendersPerStep: during.renders / STEPS,
        press,
        release,
        stale,
        wrong: (positionAfterRender ? 0 : 1) + (left.position ? 0 : 1) + (left.geometry ? 0 : 1) + (left.dragging ? 0 : 1),
    };
};

const VARIANTS = [
    { name: 'numbers, renders every 8th step', binding: 'number', renderEvery: 8 },
    { name: 'strings, renders every 8th step', binding: 'string', renderEvery: 8 },
    { name: 'numbers, renders every step', binding: 'number', renderEvery: 1 },
    { name: 'strings, renders every step', binding: 'string', renderEvery: 1 },
];

describe('A drag through owned writes', () => {
    it('times each step of a gesture, its allocation, its observers\' callbacks, its handoff, and what it retains once ended', async () => {
        const frames = new ManualFrames(window);
        const callbacks = new MutationCallbacks(window);
        const page = createPage();

        frames.install();
        callbacks.install();

        try {
            // Every path a gesture takes runs first through texts of their own, so what follows measures what DOMQL keeps rather than the code the engine compiles.
            for (const variant of VARIANTS) {
                const warming = createWindow(`${variant.binding}:warm`, 'warm');

                await gesture(warming, { frames, callbacks, renderEvery: variant.renderEvery });
                warming.dispose();
            }

            // What a window retains once it has ended: a window of one gesture, from before it, the first to run its texts in the first pass; then, from after it, a window of 10 gestures, and with it one of 40
            // more. A second pass runs it all again, its texts no longer new.
            const retained = [];

            for (const pass of [1, 2]) {
                for (const variant of VARIANTS) {
                    const ended = async (owner, count) => {
                        const window = createWindow(variant.binding, owner);

                        for (let index = 0; index < count; index++) {
                            await gesture(window, { frames, callbacks, renderEvery: variant.renderEvery });
                        }

                        window.dispose();

                        return usedMemory();
                    };
                    const before = await usedMemory();
                    const one = (await ended(`one ${pass} ${variant.name}`, 1)) - before;
                    const start = await usedMemory();
                    const ten = (await ended(`ten ${pass} ${variant.name}`, 10)) - start;
                    const fifty = (await ended(`forty ${pass} ${variant.name}`, 40)) - start;

                    retained.push({ pass, name: variant.name, one, ten, fifty });
                }
            }

            // Time: a window for each variant, two gestures to warm up, then one gesture a round.
            const windows = new Map(VARIANTS.map(variant => [variant.name, createWindow(variant.binding, variant.name)]));

            for (const variant of VARIANTS) {
                for (let index = 0; index < 2; index++) {
                    await gesture(windows.get(variant.name), { frames, callbacks, renderEvery: variant.renderEvery });
                }
            }

            const timed = await runRounds(VARIANTS.map(variant => ({ name: variant.name, measure: () => gesture(windows.get(variant.name), { frames, callbacks, renderEvery: variant.renderEvery }) })), { rounds: 7 });

            // Allocation: a gesture sampled by the heap profiler, less the same gesture of a window no behavior drags, which its renderer and the steps themselves allocate.
            const allocated = new Map();
            const unheld = new Map();

            for (const variant of VARIANTS) {
                const plain = createWindow(null, 'plain');
                const samples = [];
                const baselines = [];

                for (let round = 0; round < 5; round++) {
                    baselines.push(await allocatedDuring(() => gesture(plain, { frames, callbacks, renderEvery: variant.renderEvery })));
                    samples.push(await allocatedDuring(() => gesture(windows.get(variant.name), { frames, callbacks, renderEvery: variant.renderEvery })));
                }

                plain.dispose();
                allocated.set(variant.name, summaryOf(samples.map((bytes, index) => (bytes - baselines[index]) / STEPS)));
                unheld.set(variant.name, summaryOf(baselines.map(bytes => bytes / STEPS)));
            }

            // Where the move's six updates spend their time and allocation, by function, inside the behavior's move handler, in three gestures and one, the renderer rendering every 8th step.
            const profiles = [];

            for (const variant of VARIANTS.filter(({ renderEvery }) => renderEvery === 8)) {
                const run = count => async () => {
                    for (let index = 0; index < count; index++) {
                        await gesture(windows.get(variant.name), { frames, callbacks, renderEvery: variant.renderEvery });
                    }
                };

                profiles.push({ variant, time: await timeProfileDuring(run(3), 14, { within: '#move' }), allocation: await allocationProfileDuring(run(1), 14, { within: '#move' }) });
            }

            windows.forEach(window => window.dispose());

            const of = (name, key, digits = 1) => formatSummary(summaryOf(metricOf(timed.get(name), key)), digits);

            printTable(`A drag through owned writes, ${STEPS} steps a gesture, 7 gestures, median (least–greatest) of each gesture's mean, in µs a step: the move's updates, DOMQL's observers' callbacks, the frame's writes and reads, style and layout`, [
                'Variant',
                'move (6 updates)',
                'µs an update',
                'callbacks',
                'frame',
                'layout',
                'sum',
                'worst step, ms',
                'worst uncollected, ms',
                'steps collected',
                'load',
            ], VARIANTS.map(({ name }) => [
                name,
                of(name, 'move'),
                of(name, 'update'),
                of(name, 'callbacks'),
                of(name, 'frame'),
                of(name, 'layout'),
                of(name, 'total'),
                of(name, 'worst', 2),
                of(name, 'worstUncollected', 2),
                of(name, 'collected', 0),
                formatLoad(timed.get(name).load),
            ]));

            printTable('Each step\'s work beside it: callbacks, records and frames a step, in the 7 gestures; DOMQL\'s allocation a step, less a window no behavior drags, and that window\'s, from the heap profiler, 5 gestures', [
                'Variant',
                'callbacks',
                'records',
                'frames',
                'renders',
                'renderer µs',
                'bytes (DOMQL)',
                'bytes (no drag)',
            ], VARIANTS.map(({ name }) => [name, of(name, 'callbacksPerStep', 2), of(name, 'recordsPerStep', 1), of(name, 'framesPerStep', 2), of(name, 'rendersPerStep', 3), of(name, 'render', 1), formatSummary(allocated.get(name), 0), formatSummary(unheld.get(name), 0)]));

            const noise = await memoryNoise();

            printTable('The handoff in the 7 gestures: the press, which starts the holdings, and from the release to the holdings ended, median (least–greatest); the steps whose frame showed another position, and what was wrong once released', [
                'Variant',
                'press, ms',
                'release to released, ms',
                'frames showing another position',
                'wrong at the end',
            ], VARIANTS.map(({ name }) => [
                name,
                of(name, 'press', 2),
                of(name, 'release', 2),
                metricOf(timed.get(name), 'stale').reduce((sum, value) => sum + value, 0),
                metricOf(timed.get(name), 'wrong').reduce((sum, value) => sum + value, 0),
            ]));

            printTable(`What a window retains once it has ended, in KB: one of 1 gesture from before it, the first to run its texts in pass 1; then, from after it, one of 10 gestures, and with it one of 40 more. Reading memory varied by ${(noise / 1024).toFixed(1)} KB with nothing between`, [
                'Pass, variant',
                'a window of 1 gesture',
                'of 10',
                'and of 40 after it',
            ], retained.map(({ pass, name, one, ten, fifty }) => [`${pass}, ${name}`, (one / 1024).toFixed(1), (ten / 1024).toFixed(1), (fifty / 1024).toFixed(1)]));

            for (const { variant, time, allocation } of profiles) {
                printProfile(`Where a move's six updates spend their time, ${variant.name}: each function's own time inside the move handler, µs a move, in 3 gestures, and its share`, time, { unit: 'µs a move', scale: 1 / (3 * STEPS), digits: 2 });
                printProfile(`Where a move's six updates allocate, ${variant.name}: each function's own inside the move handler, bytes a move, in 1 gesture, and its share`, allocation, { unit: 'bytes a move', scale: 1 / STEPS, digits: 0 });
            }
        } finally {
            callbacks.uninstall();
            frames.uninstall();
            page.remove();
        }
    }, 900000);
});
