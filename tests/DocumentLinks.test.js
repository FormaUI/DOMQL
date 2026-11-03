import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The folders that hold no document of DOMQL's: Git's, dependencies, Nexo's copy, build outputs, the browser CI installs, and the notes Git ignores. */
const SKIPPED = new Set(['.git', '.local', '.nexo', '.playwright', '.vs', '.idea', 'artifacts', 'bin', 'node_modules', 'obj', 'wwwroot']);

/** The kinds of file a link into Nexo may stand in; a document's own links are read in Markdown alone. */
const LINKING = new Set(['.md', '.js', '.mjs', '.ts', '.ps1', '.yml', '.json']);

/** The release of Nexo DOMQL builds against, as `nexo.release` pins it, and the tag that names it. */
const release = readFileSync(resolve(root, 'nexo.release'), 'utf8').trim();
const tag = `v${release}`;

/** A link into Nexo's repository at a ref: the ref, the file's path in it, and the anchor in that file, if one is given. */
const NEXO_LINK = /https:\/\/github\.com\/FormaUI\/Nexo\/blob\/([^/\s)]+)\/([^#\s)'"`>]+)(?:#([^\s)'"`>]+))?/g;

/** Every file under the repository's root that may hold a link, by its path from the root. */
const filesOf = folder =>
    readdirSync(resolve(root, folder), { withFileTypes: true }).flatMap(entry => {
        const path = join(folder, entry.name);

        if (entry.isDirectory()) {
            return SKIPPED.has(entry.name) ? [] : filesOf(path);
        }

        return LINKING.has(extname(entry.name)) ? [path] : [];
    });

/** The lines of a text outside its fenced code blocks, each with its number. */
const proseOf = text => {
    let fenced = false;

    return text.split(/\r?\n/).flatMap((line, index) => {
        if (/^\s*(```|~~~)/.test(line)) {
            fenced = !fenced;

            return [];
        }

        return fenced ? [] : [{ line, number: index + 1 }];
    });
};

/** The anchor GitHub gives a heading: its text in lower case, a link's text alone, every character but a letter, a mark, a digit, a connector, a space or a hyphen removed, and each space a hyphen. */
const slugOf = heading =>
    heading
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');

/** The anchors of a Markdown text: each `<a id>` it gives, and each heading's, a repeated heading's numbered as GitHub numbers it. */
const anchorsOf = text => {
    const anchors = new Set();
    const seen = new Map();

    proseOf(text).forEach(({ line }) => {
        [...line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)].forEach(([, id]) => anchors.add(id));

        const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);

        if (heading) {
            const slug = slugOf(heading[1]);
            const count = seen.get(slug) ?? 0;

            anchors.add(count === 0 ? slug : `${slug}-${count}`);
            seen.set(slug, count + 1);
        }
    });

    return anchors;
};

/** The Nexo checkout whose history holds the commits a record of the past names: the one `NEXO_SOURCE` names, or the one beside this repository. */
const nexoCheckout = process.env.NEXO_SOURCE ? resolve(process.env.NEXO_SOURCE) : resolve(root, '..', 'formaui-net.Nexo');

/** A file of Nexo's as a ref holds it, or undefined where the ref holds no such file: the pinned release's from `.nexo`, which holds its tree, and a commit's from the checkout's history. */
const nexoFileAt = (ref, path) => {
    if (ref === tag) {
        const file = resolve(root, '.nexo', path);

        return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    }

    try {
        return execFileSync('git', ['-C', nexoCheckout, 'show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return undefined;
    }
};

/** The commits of Nexo's that a record of DOMQL's past links to, each with what it holds; every other link names the pinned release, so it moves when the pin does. */
const RECORDED = new Map([
    ['0e98b3e118d1dc448a8040c4a6f236088b108a7b', 'Lexica, which DOMQL moved its language into on October 19, 2026'],
    ['c9db3adc838ab8d16a6aa1626ce6df5a61b50f79', "Nexo's checklist of DOMQL's migration, before it was removed once done"],
]);

/** What is wrong with a link into Nexo, or undefined where nothing is: a ref other than the pinned release or a recorded commit, a file the ref doesn't hold, or an anchor its file doesn't give. */
const nexoProblemOf = (ref, path, anchor) => {
    if (ref !== tag && !RECORDED.has(ref)) {
        return `names ${ref}, where a link names the release DOMQL builds against, ${tag}, or a commit a record of the past names`;
    }

    const text = nexoFileAt(ref, path);

    if (text === undefined) {
        return `names ${path}, which Nexo's ${ref} does not hold`;
    }

    return anchor !== undefined && extname(path) === '.md' && !anchorsOf(text).has(decodeURIComponent(anchor)) ? `names #${anchor}, which ${path} at ${ref} does not give` : undefined;
};

/** The anchors of each of DOMQL's documents a link names, read once for the run, since no document changes while the tests read them. */
const ownAnchors = new Map();
const ownAnchorsOf = file => {
    if (!ownAnchors.has(file)) {
        ownAnchors.set(file, anchorsOf(readFileSync(file, 'utf8')));
    }

    return ownAnchors.get(file);
};

/** What is wrong with a link from a document to another of DOMQL's, or undefined where nothing is: a file that is not there, or an anchor its Markdown doesn't give. */
const ownProblemOf = (file, target) => {
    const [path, anchor] = decodeURIComponent(target).split('#');
    const linked = path === '' ? resolve(root, file) : resolve(root, dirname(file), path);

    if (!existsSync(linked)) {
        return `names ${path}, which is not there`;
    }

    return anchor !== undefined && extname(linked) === '.md' && !ownAnchorsOf(linked).has(anchor) ? `names #${anchor}, which ${relative(root, linked).replaceAll('\\', '/')} does not give` : undefined;
};

/** Each problem found in a file's links, as where the link stands and what is wrong with it, from the links found by line and the check of each. */
const reportOf = (file, found, problemOf) =>
    found.flatMap(({ number, link }) => {
        const problem = problemOf(link);

        return problem === undefined ? [] : [`${file.replaceAll('\\', '/')}:${number}: ${problem}`];
    });

/** What is wrong with each link into Nexo a file gives, in prose or in code. */
const nexoProblemsOf = file => {
    const lines = readFileSync(resolve(root, file), 'utf8').split(/\r?\n/);
    const found = lines.flatMap((line, index) => [...line.matchAll(NEXO_LINK)].map(link => ({ number: index + 1, link })));

    return reportOf(file, found, ([, ref, path, anchor]) => nexoProblemOf(ref, path, anchor));
};

/** What is wrong with each link a Markdown document gives to another of DOMQL's, inline or as a reference's definition, outside its code. */
const ownProblemsOf = file => {
    const found = proseOf(readFileSync(resolve(root, file), 'utf8')).flatMap(({ line, number }) =>
        [...line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)|^\[[^\]]+\]:\s*(\S+)/g)]
            .map(([, inline, reference]) => inline ?? reference)
            .filter(target => !/^[a-z]+:/i.test(target))
            .map(link => ({ number, link })),
    );

    return reportOf(file, found, target => ownProblemOf(file, target));
};

describe('the links of DOMQL\'s documents', () => {
    const files = filesOf('.');

    it('reach Nexo at the release DOMQL builds against, or at the commit a record of the past names, each file and anchor there', () => {
        const linking = files.filter(file => readFileSync(resolve(root, file), 'utf8').includes('https://github.com/FormaUI/Nexo/blob/'));

        expect(linking.length).toBeGreaterThan(10);
        expect(linking.flatMap(nexoProblemsOf)).toEqual([]);
    });

    it('reach each document and anchor of DOMQL\'s they name', () => {
        expect(files.filter(file => extname(file) === '.md').flatMap(ownProblemsOf)).toEqual([]);
    });

    it('read a heading\'s anchor as GitHub writes it, a repeated heading\'s numbered', () => {
        expect([...anchorsOf('# Nexo `1.0` and DOMQL\n\n## Queries\n\n## Queries\n\n<a id="d76"></a>\n\n```md\n## Not a heading\n```')]).toEqual(['nexo-10-and-domql', 'queries', 'queries-1', 'd76']);
        expect(slugOf('[Selecting](queries.md) a result')).toBe('selecting-a-result');
    });
});
