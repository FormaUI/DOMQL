import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, it, expect, vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const packageReadme = readFileSync(resolve(here, '..', 'nuget', 'README.md'), 'utf8');
const repositoryReadme = readFileSync(resolve(here, '..', 'README.md'), 'utf8');

/** A fixture: the text of a README block, kept as it is written there. */
const fixture = name => readFileSync(resolve(here, '_examples', name), 'utf8').trim();

/** The fenced blocks of a language in a document, in order. */
const blocks = (document, language) => [...document.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map(match => match[1].trim());

/** The value the lines of a comment write, which throws where they write prose or anything else that is no value. */
const valueOf = lines => new Function(`return (${lines.join('\n')});`)();

/** Whether a comment line shows the answer, alone or followed by a colon and what explains it. */
const showsAnswer = (comment, answer) => {
    const at = comment.indexOf(`// ${answer}`);

    return at !== -1 && /^(:.*)?$/.test(comment.slice(at + answer.length + 3));
};

/**
 * The package README's examples, in the order it shows them. Each is a fixture holding the block as written, run in the one scope the README's examples share.
 * `answers` are the comment lines that show what the example gives, one list for each answer; `observed` says where its answers come from:
 * what it reads, what it logs, what it prints, or the list the expression `inspect` evaluates to after it. An example that shows its answer outside its comments
 * names the JSON block that holds it, as `json`, or what it gives, as `gives`.
 */
const examples = [
    { file: '01-evaluate-a-query.js', observed: 'reads', json: 0 },
    { file: '02-evaluate-again.js', observed: 'reads', answers: [['3'], ['0']] },
    { file: '03-reuse-a-definition.js', observed: 'inspected', inspect: '[localQuery.evaluate()]', gives: [3] },
    { file: '04-evaluate-async.js', observed: 'reads', answers: [['3']] },
    { file: '05-watch.js', observed: 'printed', answers: [["['a2']"], ["['a1', 'a2']"], ["['a2']"]] },
    {
        file: '06-accept-partial-observation.js',
        observed: 'inspected',
        inspect: "[(() => { try { query.watch(); } catch (error) { return error.kind; } })()]",
        gives: ['validation'],
    },
    { file: '07-live-state.js', observed: 'printed', answers: [['[]'], ["[{ op: 'replace', path: '/1/selected', value: true }]"], ['true']] },
    { file: '08-subscribe.js', observed: 'printed', answers: [["{ key: 'a2', wasSelected: true, selectedCount: 1 }"]] },
    { file: '09-objects.js', observed: 'reads', answers: [['{ count: 3, attached: true, hasChildren: true }']] },
    {
        file: '10-objects-of-lists.js',
        observed: 'reads',
        answers: [['[', "  { key: 'a1', selected: false },", "  { key: 'a2', selected: true },", "  { key: 'a3', selected: false }", ']']],
    },
    { file: '11-where.js', observed: 'reads', answers: [['1']] },
    { file: '12-aggregates.js', observed: 'reads', answers: [['64']] },
    { file: '13-locals.js', observed: 'reads', answers: [['{ count: 3, tallest: 64 }']] },
    { file: '14-fallback.js', observed: 'reads', answers: [['false']] },
    { file: '15-null.js', observed: 'reads', answers: [['null']] },
    { file: '16-convert.js', observed: 'reads', answers: [['7']] },
    { file: '17-access-by-name.js', observed: 'reads', answers: [['3']] },
    { file: '18-bindings.js', observed: 'reads', answers: [['{ panel: null, ids: [] }']] },
    { file: '19-resolve.js', observed: 'inspected', inspect: '[resolved.kind, resolved.type.toString()]', answers: [["'query'"], ["'number?'"]] },
    {
        file: '20-errors.js',
        observed: 'logged',
        answers: [['validation'], ["The argument 'name' of 'attributeOf' expects string and finds number", '(line 1, column 20, at /query/argument)']],
    },
    { file: '21-module.js', observed: 'reads', answers: [['{ childCount: 3 }']] },
    { file: '22-execute-action.js', observed: 'reads', answers: [['true']] },
    { file: '23-apply-behavior.js', observed: 'printed', answers: [["'gold'"], ["'teal'"], ['undefined']] },
];

/** What an example gives: the values its comments show, those it names, or the result in the JSON block it names. */
const expectedOf = example => {
    if (example.json !== undefined) {
        return [JSON.parse(blocks(packageReadme, 'json')[example.json])];
    }

    return example.gives ?? example.answers.map(valueOf);
};

/** Gives each element with an inline height a layout box of that height, since the test environment lays nothing out. */
const layOut = document => {
    for (const element of document.querySelectorAll('[style*="height"]')) {
        const height = Number.parseFloat(element.style.height);
        const box = { left: 0, top: 0, width: 0, height, right: 0, bottom: height };

        element.getBoundingClientRect = () => box;
        element.getClientRects = () => [box];
    }
};

describe('the package README', () => {
    const results = [];

    beforeAll(async () => {
        vi.resetModules();

        const { domql: real } = await import('#domql/domql.js');

        // Another copy of DOMQL, as an independently bundled library holds, whose query the README passes on by its definition.
        vi.resetModules();

        const { domql: other } = await import('#domql/domql.js');
        const reads = [];
        const logged = [];
        const printed = [];
        const watches = [];

        // The examples call domql as the README writes it: every result an evaluation or an action answers is kept, and every watch a query makes is disposed when they end.
        const kept = query => new Proxy(query, {
            get: (target, key) => {
                switch (key) {
                    case 'evaluate':
                        return options => { const answer = target.evaluate(options); reads.push(answer); return answer; };
                    case 'evaluateAsync':
                        return async options => { const answer = await target.evaluateAsync(options); reads.push(answer); return answer; };
                    case 'executeAsync':
                        return async options => { const answer = await target.executeAsync(options); reads.push(answer); return answer; };
                    case 'watch':
                        return options => { const watch = target.watch(options); watches.push(watch); return watch; };
                    case 'with':
                        return bindings => kept(target.with(bindings));
                    default:
                        return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
                }
            },
        });
        const domql = { ...real, query: (source, bindings) => kept(real.query(source, bindings)) };

        document.body.innerHTML = fixture('document.html');
        layOut(document);

        const otherQuery = other.query('@panel.children.count', { panel: document.getElementById('panel') });
        const mark = (index, inspect) => {
            // What is inspected is read first, so a read it makes belongs to its own example.
            const inspected = inspect === null ? [] : inspect();

            results[index] = { reads: reads.splice(0), logged: logged.splice(0), printed: printed.splice(0), inspected };
        };

        const script = examples.map((example, index) => `${fixture(example.file)}\nmark(${index}, ${example.inspect === undefined ? 'null' : `() => ${example.inspect}`});`).join('\n');
        const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
        const log = vi.spyOn(console, 'error').mockImplementation((...parts) => logged.push(parts));
        const print = vi.spyOn(console, 'log').mockImplementation(value => printed.push(value));
        const { IntersectionObserver } = window;

        // The test document lays nothing out, so intersection is reported by an observer that answers at once that its target intersects.
        window.IntersectionObserver = class {
            #report;

            constructor(report) {
                this.#report = report;
            }

            observe(target) {
                queueMicrotask(() => this.#report([{ target, isIntersecting: true }]));
            }

            disconnect() {}
        };

        try {
            await new AsyncFunction('domql', 'document', 'mark', 'otherQuery', script)(domql, document, mark, otherQuery);
        } finally {
            watches.forEach(watch => watch.dispose());
            window.IntersectionObserver = IntersectionObserver;
            log.mockRestore();
            print.mockRestore();
        }
    });

    describe.each(examples.map(example => [example.file, example]))('%s', (file, example) => {
        const index = examples.indexOf(example);

        it('is written in the README as it is run here', () => {
            expect(packageReadme).toContain(fixture(file));
        });

        it('shows the answers that are the lines of its comments', () => {
            const comments = fixture(file).split('\n').map(line => line.trimEnd());

            for (const line of (example.answers ?? []).flat()) {
                expect(comments.some(comment => showsAnswer(comment, line)), line).toBe(true);
            }
        });

        it('gives the answers it shows', () => {
            const { reads, logged, printed, inspected } = results[index];

            if (example.observed === 'logged') {
                const [kind, message] = example.answers;

                expect(reads).toEqual([]);
                expect(logged).toHaveLength(1);
                expect(logged[0][0]).toBe(kind[0]);
                expect(logged[0][1]).toBe(message.join(' '));
            } else {
                // An example whose handler reports a failure on the console shows no answer it gives.
                expect(logged).toEqual([]);
                expect({ reads, printed, inspected }[example.observed]).toEqual(expectedOf(example));
            }
        });
    });

    it('runs the document it shows', () => {
        expect(blocks(packageReadme, 'html')).toEqual([fixture('document.html')]);
    });

    it('runs every example it shows, and only those', () => {
        const shown = blocks(packageReadme, 'js').filter(block => !block.startsWith('import '));

        expect(shown).toEqual(examples.map(example => fixture(example.file)));
    });
});

describe('the repository README', () => {
    const [firstExample, readAgainExample, watchExample, refreshExample, filterExample] = blocks(repositoryReadme, 'js');

    /** The values the comments after each `console.log` show, on its own line. */
    const loggedValuesOf = example => [...example.matchAll(/^console\.log\(.*\);\s*\/\/ (.*)$/gm)].map(([, value]) => valueOf([value]));

    /** Runs the examples in one scope, in the order they are shown, against the document the README shows, and answers what the code returns. */
    const run = async (code, frames = []) => {
        vi.resetModules();

        const { domql } = await import('#domql/domql.js');
        const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
        const printed = [];
        const failed = [];
        const settle = () => new Promise(resolve => setTimeout(resolve));

        document.body.innerHTML = blocks(repositoryReadme, 'html')[0];

        const console = { log: value => printed.push(value), error: message => failed.push(message) };
        const answer = await new AsyncFunction('domql', 'document', 'console', 'settle', 'frames', code)(domql, document, console, settle, frames);

        return { answer, printed, failed };
    };

    it('gives the result it shows, and reads the change again as its comments say', async () => {
        const { answer, printed } = await run([firstExample.replace(/^import .*\n/, ''), readAgainExample, 'return snapshot;'].join('\n'));

        expect(answer).toEqual(JSON.parse(blocks(repositoryReadme, 'json')[0]));
        expect(printed).toEqual(loggedValuesOf(readAgainExample));
    });

    it('delivers the first snapshot to its watch, leaves an unchanged one undelivered, and counts what is selected', async () => {
        const frames = [];

        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => frames.push(callback));

        let outcome;

        try {
            outcome = await run([
                firstExample.replace(/^import .*\n/, ''),
                readAgainExample,
                watchExample,
                'await settle();',
                'frames.splice(0).forEach(callback => callback());',
                refreshExample,
                filterExample,
                'return { next, watch, selectedCount };',
            ].join('\n'), frames);
        } finally {
            vi.restoreAllMocks();
        }

        const { answer: { next, watch, selectedCount }, printed, failed } = outcome;

        expect(failed).toEqual([]);
        expect(printed).toEqual([...loggedValuesOf(readAgainExample), next]);
        expect(watch.status).toBe('disposed');
        expect(selectedCount).toBe(2);
    });
});
