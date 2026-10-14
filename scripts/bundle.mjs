/**
 * bundle — DOMQL as the single, minified file the package ships
 */

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the package serves the bundle from. */
export const bundlePath = resolve(root, 'nuget', 'wwwroot', 'domql.js');

/** Where the package serves the declarations of the bundle's API from, beside the bundle. */
export const declarationsPath = resolve(root, 'nuget', 'wwwroot', 'domql.d.ts');

/**
 * Bundles the entry and every module it imports into one minified ES module, answering its text.
 * @param {{ version?: string }} [options] The package's version, which the bundle answers as its own; without it, the bundle answers the version the sources do.
 */
export async function bundle({ version } = {}) {
    const result = await build({
        entryPoints: [resolve(root, 'src', 'domql.js')],
        bundle: true,
        minify: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        legalComments: 'none',
        write: false,
        define: version === undefined ? {} : { DOMQL_VERSION: JSON.stringify(version) },
    });

    return result.outputFiles[0].text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // The package's version is computed once, by the package project, and given here, so the bundle and the package never disagree.
    const versionIndex = process.argv.indexOf('--version');
    const version = versionIndex === -1 ? undefined : process.argv[versionIndex + 1];

    if (version === undefined) {
        throw new Error('The bundle the package ships answers the version of the package: run it as node scripts/bundle.mjs --version <version>');
    }

    const text = await bundle({ version });

    await mkdir(dirname(bundlePath), { recursive: true });
    await writeFile(bundlePath, text);
    await copyFile(resolve(root, 'src', 'domql.d.ts'), declarationsPath);

    console.log(`Bundled ${Buffer.byteLength(text)} bytes of DOMQL ${version} to ${bundlePath}, with its declarations beside it`);
}
