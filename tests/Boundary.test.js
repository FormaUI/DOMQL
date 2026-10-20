import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// DOMQL's sources, which build on Lexica through its package's entry point alone.
const sources = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Every module under the folder, by its path. */
const modulesOf = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? modulesOf(join(folder, entry.name)) : /\.m?js$/.test(entry.name) ? [join(folder, entry.name)] : []));

describe('DOMQL\'s boundary with Lexica', () => {
    it('imports Lexica, its types included, by its package\'s entry point alone, and nothing else outside its own sources', () => {
        const outside = modulesOf(sources).flatMap(path => [...readFileSync(path, 'utf8').matchAll(/^import [^;]* from '([^']+)';$|import\('([^']+)'\)/gm)]
            .map(([, imported, typed]) => ({ module: relative(sources, path), specifier: imported ?? typed }))
            .filter(({ specifier }) => !specifier.startsWith('.') && specifier !== '@formaui/lexica'));

        expect(outside).toEqual([]);
    });

    it('cannot reach a module of Lexica\'s sources through its package', async () => {
        await expect(import(/* @vite-ignore */ ['@formaui', 'lexica', 'language', 'Evaluator.mjs'].join('/'))).rejects.toThrow('Missing "./language/Evaluator.mjs" specifier');
    });
});
