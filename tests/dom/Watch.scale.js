import { describe, it } from 'vitest';
import { domql } from '#domql/domql.js';
import { allocatedDuring, formatLoad, formatSummary, ManualFrames, metricOf, nextTask, printTable, runRounds, summaryOf } from '../_scale/Measuring.js';

/**
 * One edit in a large editor, in Chromium: a watch of a mark's position within an editor, beside an editor of 10 KB, 100 KB and 1 MB of text. D19's watch follows the edits `rectRelativeTo` misses by reading the
 * editor's text into a local; beside it, a watch reading the position alone, and one following the same edits through a member that reads nothing of them. Each edit changes one text node: before the mark, which
 * moves it; after it, which doesn't; or outside the editor.
 */

/** How many times a watch has read the editor's text, and the characters it materialized; and how many times it has read the mark's box, once each evaluation. */
let textReads = 0;
let textCharacters = 0;
let markReads = 0;

domql.registerModule(domql.createModule('Edits', {
    types: [{
        name: 'EditElements', kind: 'extension', target: 'Domql.Element',
        members: [{
            // What `text` observes, its subtree's structure and text, answering nothing of it.
            name: 'edits', kind: 'property', result: 'Number',
            updates: { changes: 'observable', reads: 'fresh', observations: [{ type: 'mutation', of: 'receiver', childList: true, characterData: true, subtree: true }] },
            impl: () => 0,
        }],
    }],
}));

const WATCHES = [
    { name: 'reading the text (D19)', text: 'let edited = panel.text\nreturn item.rectRelativeTo(panel)?.top' },
    { name: 'a member observing edits', text: 'import Edits\nlet edited = panel:edits\nreturn item.rectRelativeTo(panel)?.top' },
    { name: 'the position alone', text: 'item.rectRelativeTo(panel)?.top' },
];

const SIZES = [10_000, 100_000, 1_000_000];
const PARAGRAPH = 'The quick brown fox jumps over the lazy dog while the editor keeps every word of its long document. ';
const SENTENCE = ' A sentence typed into the paragraph, long enough to take a line of its own.';
const EDITS_A_ROUND = 20;

/**
 * An editor of paragraphs holding about `size` characters, each paragraph one text node, the mark a paragraph of its own halfway through, and an aside outside it. The editor's text is counted as a watch reads it.
 */
const createEditor = size => {
    const count = Math.ceil(size / PARAGRAPH.length);
    const editor = document.createElement('div');
    const aside = document.createElement('aside');

    editor.contentEditable = 'true';
    editor.spellcheck = false;
    editor.style.cssText = 'width: 640px; height: 600px; overflow: auto; font: 14px/20px sans-serif';
    editor.innerHTML = Array.from({ length: count }, (_, index) => (index === count >> 1 ? '<p id="mark">The mark.</p>' : `<p>${PARAGRAPH}</p>`)).join('');
    aside.innerHTML = '<p>Saved a moment ago.</p>';
    document.body.append(editor, aside);

    const nativeText = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');

    Object.defineProperty(editor, 'textContent', {
        configurable: true,
        get() {
            const text = nativeText.get.call(this);

            textReads++;
            textCharacters += text.length;

            return text;
        },
        set(value) {
            nativeText.set.call(this, value);
        },
    });

    const paragraphs = editor.querySelectorAll('p');
    const mark = editor.querySelector('#mark');
    const nativeRects = Element.prototype.getClientRects;

    // `rectRelativeTo` reads its receiver's boxes once each evaluation.
    mark.getClientRects = function () {
        markReads++;

        return nativeRects.call(this);
    };

    return {
        editor,
        mark,
        characters: nativeText.get.call(editor).length,
        // Each edit lengthens its paragraph by a sentence or shortens it again, one text node's data changed.
        edits: {
            'before the mark': paragraphs[count >> 2].firstChild,
            'after the mark': paragraphs[(count * 3) >> 2].firstChild,
            'outside the editor': aside.firstChild.firstChild,
        },
        remove: () => {
            editor.remove();
            aside.remove();
        },
    };
};

const toggle = node => {
    if (node.data.endsWith(SENTENCE)) {
        node.deleteData(node.data.length - SENTENCE.length, SENTENCE.length);
    } else {
        node.appendData(SENTENCE);
    }
};

describe('One edit in a large editor', () => {
    it('counts the evaluations and the text one edit costs, and times its layout and its evaluation, as the editor grows', async () => {
        const frames = new ManualFrames(window);
        const rows = [];
        const reads = [];

        frames.install();

        try {
            for (const size of SIZES) {
                const { editor, mark, characters, edits, remove } = createEditor(size);
                const nativeBox = Element.prototype.getBoundingClientRect;
                const positionNow = () => nativeBox.call(mark).top - nativeBox.call(editor).top;

                editor.getBoundingClientRect();

                // Reading the text alone, for what materializing it costs at this size.
                const textTimes = [];

                for (let round = 0; round < 7; round++) {
                    window.gc();

                    const start = performance.now();

                    for (let index = 0; index < 20; index++) {
                        void editor.textContent;
                    }

                    textTimes.push((performance.now() - start) / 20);
                }

                reads.push([`${(characters / 1000).toFixed(0)} K characters`, formatSummary(summaryOf(textTimes), 3)]);

                for (const watched of WATCHES) {
                    const watch = domql.query(watched.text, { panel: editor, item: mark }).watch({ acceptPartialObservation: true });
                    let changes = 0;

                    watch.subscribe('change', () => changes++);
                    await watch.readyAsync();

                    // Every edit is timed in the same steps: the edit, its microtasks, the layout it needs, then the frame, whose reads evaluate the watch; a frame runs whether or not the watch asked for one.
                    const editOnce = async node => {
                        const counts = { textReads, textCharacters, changes, markReads };

                        toggle(node);
                        await nextTask();

                        const start = performance.now();

                        editor.offsetHeight;

                        const laidOut = performance.now();

                        frames.run();

                        const evaluated = performance.now();

                        return {
                            layout: laidOut - start,
                            frame: evaluated - laidOut,
                            evaluations: markReads - counts.markReads,
                            textReads: textReads - counts.textReads,
                            characters: textCharacters - counts.textCharacters,
                            changes: changes - counts.changes,
                            isStale: watch.snapshot === undefined || Math.abs(watch.snapshot - positionNow()) > 0.05,
                        };
                    };
                    const timed = await runRounds(Object.entries(edits).map(([where, node]) => ({
                        name: where,
                        measure: async () => {
                            const sums = { layout: 0, frame: 0, evaluations: 0, textReads: 0, characters: 0, changes: 0, stale: 0 };

                            for (let index = 0; index < EDITS_A_ROUND; index++) {
                                const edit = await editOnce(node);

                                sums.layout += edit.layout;
                                sums.frame += edit.frame;
                                sums.evaluations += edit.evaluations;
                                sums.textReads += edit.textReads;
                                sums.characters += edit.characters;
                                sums.changes += edit.changes;
                                sums.stale += edit.isStale ? 1 : 0;
                            }

                            return Object.fromEntries(Object.entries(sums).map(([key, sum]) => [key, key === 'stale' ? sum : sum / EDITS_A_ROUND]));
                        },
                    })));

                    // Allocation: the edits of a round sampled by the heap profiler, each edit's bytes.
                    for (const [where, node] of Object.entries(edits)) {
                        const samples = [];

                        for (let round = 0; round < 3; round++) {
                            samples.push((await allocatedDuring(async () => {
                                for (let index = 0; index < EDITS_A_ROUND; index++) {
                                    await editOnce(node);
                                }
                            })) / EDITS_A_ROUND);
                        }

                        const entry = timed.get(where);
                        const of = (key, digits) => formatSummary(summaryOf(metricOf(entry, key)), digits);

                        rows.push([
                            `${(characters / 1000).toFixed(0)} K, ${watched.name}, ${where}`,
                            of('evaluations', 2),
                            of('textReads', 2),
                            (summaryOf(metricOf(entry, 'characters')).median / 1000).toFixed(0),
                            of('changes', 2),
                            metricOf(entry, 'stale').reduce((sum, value) => sum + value, 0),
                            of('layout', 3),
                            of('frame', 3),
                            formatSummary(summaryOf(samples.map(bytes => bytes / 1024)), 0),
                            formatLoad(entry.load),
                        ]);
                    }

                    watch.dispose();
                }

                remove();
            }
        } finally {
            frames.uninstall();
        }

        printTable('Reading an editor\'s text, its `textContent`: ms a read, 7 rounds of 20, median (least–greatest)', ['Editor', 'ms a read'], reads);

        printTable(`One edit in a large editor: ${EDITS_A_ROUND} edits a round, 5 rounds, median (least–greatest) of each round's mean an edit; K characters a watch read an edit; KB the script heap allocated an edit, from the heap profiler, 3 rounds, which leaves out the text read, a string the browser holds outside it`, [
            'Editor, watch, edit',
            'evaluations',
            'text reads',
            'K characters read',
            'changes',
            'stale answers',
            'layout, ms',
            'frame, ms',
            'KB on the script heap',
            'load',
        ], rows);
    }, 900000);
});
