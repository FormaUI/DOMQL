import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

// A path from the repository root, read as text.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('Alignment', () => {
    const specification = read('spec/README.md');
    const design = read('docs/domql-design.md');
    const project = read('nuget/Forma.DOMQL.csproj');

    it('has a specification whose version is that of the implementation', () => {
        expect(specification.match(/^# DOMQL Specification v(\S+)$/m)[1]).toBe(domql.info.specificationVersion);
    });

    it('has a design titled with the version of the specification', () => {
        expect(design.match(/^# DOMQL Design v(\S+)$/m)[1]).toBe(domql.info.specificationVersion);
    });

    it('has a package that is the alpha of the specification, numbered by the commits it is built from', () => {
        const [, prefix] = project.match(/<VersionPrefix>(.+?)<\/VersionPrefix>/);

        expect(`${prefix}-alpha`).toBe(domql.info.specificationVersion);
        expect(project).toContain('<Version>$(VersionPrefix)-alpha.$(CommitCount)</Version>');
        // The library's own version, run from its sources, is the package's prefix as an alpha, marked as source by its build metadata.
        expect(domql.info.version).toBe(`${prefix}-alpha+source`);
        expect(project).toContain('git rev-list --count HEAD');
    });

    it('has a specification whose complete query writes the fields of the result it shows', () => {
        const [, text, result] = read('spec/examples.md').match(/## A complete query[\s\S]*?The query reads it:\s*```domql\n([\s\S]*?)```[\s\S]*?```json\n([\s\S]*?)```/);
        // The query is of version 32, which the specification targets, so its fields are read from its definition until the runtime resolves version 32.
        const { expression } = domql.query(text).definition;

        expect(expression.fields.map(field => field.name)).toEqual(Object.keys(JSON.parse(result)));
    });
});
