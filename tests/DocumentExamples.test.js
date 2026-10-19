import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/** The `domql` blocks of a document, in order, each with the line its fence opens on. */
const blocksOf = file => {
    const lines = readFileSync(resolve(here, '..', file), 'utf8').split('\n');
    const blocks = [];
    let block = null;

    lines.forEach((line, index) => {
        if (block === null && line === '```domql') {
            block = { line: index + 1, lines: [] };
        } else if (block !== null && line === '```') {
            blocks.push(block);
            block = null;
        } else if (block !== null) {
            block.lines.push(line);
        }
    });

    return blocks;
};

/** The queries a block holds: the whole block, or, for an entry that says `each`, each line, a comment after it and a line of comment alone aside. */
const queriesOf = (block, entry) => {
    if (entry.each !== true) {
        return [block.lines.join('\n')];
    }

    return block.lines.map(line => line.replace(/\s+\/\/.*$/, '').trim()).filter(line => line !== '' && !line.startsWith('//'));
};

/** The page the examples read: a panel of rows holding a cell and an input, the elements around it, and a host whose shadow tree holds a paragraph and a slot. */
const PAGE = `
<div id="panel" class="open" data-count="12" data-group>
    <div class="row" data-key="a1" data-column="name" data-unread="2"><span id="cell"></span></div>
    <div class="row" data-key="a2" data-column="size"></div>
    <input id="input">
</div>
<div id="sidebar"></div>
<div id="sentinel"></div>
<button id="button"></button>
<div id="zone"></div>
<div id="host"></div>`;

/** The bindings every example can read, each named as the documents name it. */
const bindingsOf = () => {
    const byId = id => document.getElementById(id);
    const shadow = byId('host').attachShadow({ mode: 'open' });

    shadow.innerHTML = '<p></p><slot></slot>';

    const panel = byId('panel');
    const [first, second] = panel.querySelectorAll('.row');

    return {
        panel, input: byId('input'), cell: byId('cell'), sidebar: byId('sidebar'), sentinel: byId('sentinel'), button: byId('button'), zone: byId('zone'), host: byId('host'),
        element: shadow.querySelector('p'), slot: shadow.querySelector('slot'),
        viewport: panel, target: panel, control: byId('input'), item: first, table: panel, list: panel, cards: panel, header: panel, field: byId('input'), left: first, right: second,
        wide: true, enabled: true, busy: false, action: 'save', count: 3, state: 'disabled', preferred: null, fallback: panel, property: null,
    };
};

/** A module of a scroller an element offers, with an action that steps it and a behavior that pages it with the wheel, as the requests the specification shows. */
const scrollModule = domql => domql.createModule('scroll', {
    types: [{ name: 'scroller', fields: { axis: 'string' } }],
    members: [
        { name: 'scroll', function: 'scroll', kind: 'operation', form: 'call', input: 'options', on: 'element', parameters: [{ name: 'axis', kind: 'value', type: 'string', required: true, nulls: 'accept' }], result: 'scroller', changes: 'unobserved', reads: 'fresh' },
        { name: 'step', function: 'step', kind: 'action', form: 'call', input: 'options', on: 'scroller', parameters: [{ name: 'direction', kind: 'value', type: 'string', required: true, nulls: 'accept' }], result: 'boolean', changes: 'unobserved', reads: 'fresh' },
        { name: 'wheelPaging', function: 'wheelPaging', kind: 'behavior', form: 'call', input: 'options', on: 'scroller', parameters: [{ name: 'modifier', kind: 'value', type: 'string', required: true, nulls: 'accept' }], result: 'boolean', changes: 'unobserved', reads: 'fresh' },
    ],
}, null);

/** A value a fragment gives, compared with null so that a node it gives is no part of the result. */
const COMPARED = '(%) != null';

/**
 * Each document's `domql` blocks, an entry for each, in the order the document shows them. A block's queries are formatted, to text that formats to itself and means the same,
 * and resolved against the page and the bindings, with the ones its entry adds, within the context its entry states, `%` standing for the query, and with the modules it registers;
 * an entry that gives `results` also evaluates the queries it gives one for, by their index, and one that says `refuses` expects each query refused with that kind of error.
 * Every example must be one of these, so a block with no entry fails.
 */
const DOCUMENTS = {
    'docs/domql-specification.md': [
        { about: 'a query at a glance' },
        { about: 'shadow trees', each: true, context: COMPARED },
        { about: 'an object expression' },
        { about: 'fields named by reserved words', results: { 0: { true: true, context: true } } },
        { about: 'a reserved reference', results: { 0: { value: 3 } } },
        { about: 'the forms of a member', each: true, context: 'cell { value = % }' },
        { about: 'bracket property access' },
        { about: 'a simple expression' },
        { about: 'tests', each: true },
        { about: 'equalities', each: true },
        { about: 'arithmetic' },
        { about: 'comparisons' },
        { about: 'logical expressions', each: true, results: { 3: { width: 0 }, 4: 'untitled' } },
        { about: 'conditionals', each: true, context: COMPARED, results: { 2: true } },
        { about: 'coalescing operators', each: true, results: { 2: false } },
        { about: 'casts', each: true, context: COMPARED },
        { about: 'conversions', each: true, results: { 0: 12, 1: 12, 3: '3' } },
        { about: 'attempts', each: true, results: { 0: { count: 12 } } },
        { about: 'a result that tells missing from malformed', results: { 0: { count: { status: 'valid', value: 12 } } } },
        { about: 'interpolated strings', results: { 0: { label: '12 unread in 3 rows', title: '{panel} panel' } } },
        { about: 'a body' },
        { about: 'locals' },
        { about: 'the object root', results: { 0: { bar: 4, inner: { bar: 2, nearest: 2, outermost: 4 } } } },
        { about: 'a field of the object root still being built', refuses: 'validation' },
        { about: 'a function' },
        { about: 'an action and a behavior request', each: true, modules: [scrollModule] },
        { about: 'a subscription' },
        { about: 'a complete query' },
    ],
    'nuget/README.md': [
        { about: 'a count' },
        { about: 'a count of a selection' },
        { about: 'a selector test' },
        { about: 'named indexers', each: true },
        { about: 'a call with options' },
        { about: 'a fragment testing an ancestor', context: 'cell { value = % }' },
        { about: 'a body of locals' },
        { about: 'a function and its calls' },
        { about: 'an optional enclosed access' },
        { about: 'a native condition and an ARIA one', results: { 0: { checked: false, ariaChecked: false } } },
        { about: 'an equality with null' },
        { about: 'logical expressions' },
        { about: 'values that and and or choose', each: true, results: { 0: 'untitled', 1: { width: 0 } } },
        { about: 'a conditional' },
        { about: 'a conditional binding', context: COMPARED },
        { about: 'a strict and an attempted cast', each: true },
        { about: 'an attempt with a fallback', results: { 0: { count: 12 } } },
        { about: 'a result that tells missing from malformed', results: { 0: { count: { status: 'valid', value: 12 } } } },
        { about: 'arithmetic' },
        { about: 'interpolated text', results: { 0: { summary: '3 items, 12 unread' } } },
        { about: 'a shadow tree', results: { 0: 1 } },
    ],
    'docs/domql-design.md': [
        { about: 'a subscription reading a maintained member' },
    ],
    'docs/domql-implementation-plan.md': [],
    'README.md': [],
};

describe('the examples of the documents', () => {
    let domql;
    let bindings;

    beforeEach(async () => {
        vi.resetModules();
        ({ domql } = await import('#domql/domql.js'));
        document.body.innerHTML = PAGE;
        bindings = bindingsOf();
    });

    describe.each(Object.entries(DOCUMENTS))('in %s', (file, entries) => {
        const blocks = blocksOf(file);

        it('have an entry for each domql block', () => {
            expect(blocks.length).toBe(entries.length);
        });

        it.each(entries.map((entry, index) => [`${entry.about}, the block at line ${blocks[index]?.line}`, entry, blocks[index]]))('%s', (_, entry, block) => {
            (entry.modules ?? []).forEach(module => domql.registerModule(module(domql)));

            queriesOf(block, entry).forEach((text, index) => {
                const written = (entry.context ?? '%').replace('%', () => text);
                const queryOf = () => domql.query(written, { ...bindings, ...entry.bindings });

                // An example refused by its syntax is refused as it is read, and one refused by the vocabulary as it is resolved, so both happen where the refusal is expected.
                if (entry.refuses !== undefined) {
                    expect(() => queryOf().resolve(), text).toThrow(expect.objectContaining({ kind: entry.refuses }));

                    return;
                }

                const formatted = domql.format(written);

                expect(domql.format(formatted), text).toBe(formatted);
                expect(domql.query(formatted).definition, text).toEqual(domql.query(written).definition);
                expect(() => queryOf().resolve(), text).not.toThrow();

                if (entry.results !== undefined && index in entry.results) {
                    expect(queryOf().evaluate(), text).toEqual(entry.results[index]);
                }
            });
        });
    });
});
