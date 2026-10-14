import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { domql } from '#domql/domql.js';

const here = dirname(fileURLToPath(import.meta.url));
const declarations = readFileSync(resolve(here, '..', 'src', 'domql.d.ts'), 'utf8');

describe('the declarations', () => {
    it('declare every member of domql, and only those', () => {
        const runtime = Object.keys(domql).sort();
        const [, body] = declarations.match(/export interface Domql \{([\s\S]*?)\n\}/);
        // A member declared with overloads is one member.
        const declared = [...new Set([...body.matchAll(/^\s{4}(?:readonly )?(\w+)/gm)].map(match => match[1]))].sort();

        expect(declared).toEqual(runtime);
    });

    it('declare the package\'s exports, domql and DomqlError, and only those', () => {
        const exported = [...declarations.matchAll(/^export declare (?:const|class) (\w+)/gm)].map(match => match[1]).sort();

        expect(exported).toEqual(['DomqlError', 'domql']);
    });

    it('accept how a TypeScript caller uses the library, and refuse its misuse', () => {
        const program = ts.createProgram([resolve(here, '_types', 'usage.ts')], {
            strict: true,
            noEmit: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
            types: [],
        });
        const messages = ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

        expect(messages).toEqual([]);
    });
});
