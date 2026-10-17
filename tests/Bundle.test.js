import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, it, expect } from 'vitest';
import { bundle } from '../scripts/bundle.mjs';

/** The bundle's one export statement, which names domql and DomqlError, in either order. */
const EXPORT = /export\{([\w$]+) as (domql|DomqlError),([\w$]+) as (domql|DomqlError)\};?\s*$/;

describe('Bundle', () => {
    let text;
    let bundled;

    /** The version a bundle is made for, as the package project would give it. */
    const version = '1.0.0-alpha.7';

    beforeAll(async () => {
        text = await bundle({ version });
        bundled = new Function(text.replace(EXPORT, 'return { $2: $1, $4: $3 };'))();
    });

    it('is one file that imports nothing', () => {
        expect(text).not.toMatch(/\bimport\s*[({"'*\w]/);
    });

    it('exports domql and DomqlError alone', () => {
        expect(text).toMatch(EXPORT);
        expect(text.match(/\bexport\b/g)).toHaveLength(1);
        expect(Object.keys(bundled).sort()).toEqual(['DomqlError', 'domql']);
    });

    it('is less than half the size of the sources it bundles', async () => {
        const sources = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
        const files = (await readdir(sources, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
        const size = (await Promise.all(files.map(file => readFile(file, 'utf8')))).reduce((total, source) => total + source.length, 0);

        expect(text.length).toBeLessThan(size / 2);
    });

    it('makes query objects from text and from a definition as the sources do', () => {
        const query = bundled.domql.query('panel { size = self.size, hasFocus = self.matches(":focus-within") }', { panel: 1 });

        expect(query.definition.query.fields.map(field => field.name)).toEqual(['size', 'hasFocus']);
        expect(bundled.domql.query(query.definition, { panel: 2 }).definition).toEqual(query.definition);
        expect(query.with({ panel: 3 }).definition).toBe(query.definition);
        expect(bundled.domql.info.specificationVersion).toMatch(/^\d+\.\d+\.\d+(?:-alpha)?$/);
    });

    it('answers the version it was made for as its own, and the version of the sources where it was made for none', async () => {
        const unversioned = new Function((await bundle()).replace(EXPORT, 'return { $2: $1, $4: $3 };'))();

        expect(bundled.domql.info.version).toBe(version);
        expect(text).toContain(JSON.stringify(version));
        expect(unversioned.domql.info.version).toBe('1.0.0-alpha+source');
        expect(Object.isFrozen(bundled.domql.info)).toBe(true);
    });

    it('keeps the errors the sources raise, as DomqlError', () => {
        expect(() => bundled.domql.query('panel {')).toThrow(bundled.DomqlError);
        expect(() => bundled.domql.query('panel {')).toThrow(/A field is written with its name/);
    });
});
