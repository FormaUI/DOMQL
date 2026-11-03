import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { nexo } from '@formaui-net/nexo';
import { domql } from '#domql/domql.js';
import { Versions } from '#domql/Versions.mjs';

// A path from the repository root, read as text.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('Alignment', () => {
    const specification = read('spec/README.md');
    const design = read('docs/domql-design.md');
    const status = read('docs/features-status.md');
    const project = read('nuget/Forma.DOMQL.csproj');

    it('has a specification and a design titled with the one version the specification describes, which its version line names', () => {
        const [, described] = specification.match(/^# DOMQL Specification v(\S+)$/m);

        expect(design.match(/^# DOMQL Design v(\S+)$/m)[1]).toBe(described);
        expect(specification).toContain(`describes DOMQL's version \`${described}\``);
    });

    it('follows the specification version its status table names, on the language version of the Nexo runtime it runs on, which the table names too', () => {
        const [, specification] = status.match(/^\| DOMQL specification \| `([^`]+)` \|/m);
        const [, language] = status.match(/^\| Nexo language \| `([^`]+)` \|/m);

        expect(specification).toBe(domql.info.versions.specification);
        expect(language).toBe(domql.info.versions.language);
        expect(domql.info.versions.language).toBe(nexo.info.versions.language);
    });

    it('has a version history whose newest entry is the version the specification describes, on the language and definition format it names', () => {
        const history = read('VERSION-HISTORY.md');
        const [, newest, language, format] = history.match(/^## `([^`]+)`\r?\n\r?\n\*[^·*]+· Nexo language `([^`]+)` · definition format (\d+)/m);
        const [, described] = specification.match(/^# DOMQL Specification v(\S+)$/m);
        const [, describedLanguage, describedFormat] = specification.match(/on Nexo's language version `([^`]+)`, of \[definition version (\d+)\]/);

        expect(newest).toBe(described);
        expect(language).toBe(describedLanguage);
        expect(format).toBe(describedFormat);
    });

    it('has a package that carries the runtime version the sources declare, which they report', () => {
        expect(project).toContain('src\\Versions.mjs');
        expect(domql.info.versions.runtime).toBe(Versions.runtime);
        expect(domql.info.versions.specification).toBe(Versions.specification);
    });

    it('has a changelog whose newest entry is the runtime version the sources declare, with the specification, language and definition versions it implements', () => {
        const changelog = read('CHANGELOG.md');
        const [, newest, specification, language, format] = changelog.match(/^## `([^`]+)`\r?\n\r?\n\*[^·*]+· specification `([^`]+)` · Nexo language `([^`]+)` · definition format (\d+)\*/m);

        expect([newest, specification, language, Number(format)]).toEqual([
            domql.info.versions.runtime,
            domql.info.versions.specification,
            domql.info.versions.language,
            nexo.info.versions.definition,
        ]);
    });

    it('dates the newest entries of the version history and the changelog, or marks them unreleased, a specification version staying unreleased only while the release that implements it does', () => {
        const dateOf = path => read(path).match(/^## `[^`]+`\r?\n\r?\n\*([^·*]+?) ·/m)[1];
        const specification = dateOf('VERSION-HISTORY.md');
        const release = dateOf('CHANGELOG.md');
        const dated = /^(January|February|March|April|May|June|July|August|September|October|November|December) [1-9]\d?, \d{4}$/;

        [specification, release].forEach(date => expect(date === 'Unreleased' || dated.test(date), date).toBe(true));
        // A release fixes the specification version it implements, so a dated release implements a dated version.
        expect(release === 'Unreleased' || specification !== 'Unreleased', `a release of ${release} implements an unreleased specification version`).toBe(true);
    });

    it('has READMEs that name the runtime version, the specification version it implements and the language version of the Nexo runtime it runs on', () => {
        const { runtime, specification, language } = domql.info.versions;
        const named = `The runtime, \`${runtime}\`, implements DOMQL's specification \`${specification}\` on Nexo's language \`${language}\`, definition version ${nexo.info.versions.definition}.`;

        expect(read('README.md')).toContain(named);
        expect(read('nuget/README.md')).toContain(named);
    });

    it('has a specification whose complete query writes the fields of the result it shows', () => {
        const [, text, result] = read('spec/examples.md').match(/## A complete query[\s\S]*?The query reads it:\s*```domql\n([\s\S]*?)```[\s\S]*?```json\n([\s\S]*?)```/);
        const { expression } = domql.query(text).definition;

        expect(expression.objectFields.map(field => field.name)).toEqual(Object.keys(JSON.parse(result)));
    });
});
