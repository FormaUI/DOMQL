import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Domql } from '#domql/domql.js';

// A path from the repository root, read as text.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('Alignment', () => {
    const specification = read('docs/domql-specification.md');
    const design = read('docs/domql-design.md');
    const project = read('nuget/Forma.DOMQL.csproj');

    it('has a specification whose version is that of the implementation', () => {
        const [, version] = specification.match(/^# DOMQL Specification v(\S+)$/m);

        expect(version).toBe(Domql.specificationVersion);
    });

    it('has a design titled with the version of the specification', () => {
        const [, version] = design.match(/^# DOMQL Design v(\S+)$/m);

        expect(version).toBe(Domql.specificationVersion);
    });

    it('has a package that is the alpha of the specification, numbered by the commits it is built from', () => {
        const [, prefix] = project.match(/<VersionPrefix>(.+?)<\/VersionPrefix>/);

        expect(`${prefix}-alpha`).toBe(Domql.specificationVersion);
        expect(project).toContain('<Version>$(VersionPrefix)-alpha.$(CommitCount)</Version>');
        expect(project).toContain('git rev-list --count HEAD');
    });

    it('has a specification whose example definition is of the version the implementation writes', () => {
        const [, version] = specification.match(/"version": (\d+),\s+"query"/);

        expect(Number(version)).toBe(Domql.parse('@panel { size: size }').definition.version);
    });
});
