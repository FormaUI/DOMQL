// Loads the domql.js a published application serves, as a page's module would, and resolves a query that reads the DOM with it, as the package's version; resolving needs no DOM.
import { pathToFileURL } from 'node:url';

const [path, version] = process.argv.slice(2);
const { domql } = await import(pathToFileURL(path).href);
const { type } = domql.query('let inputs = Domql.document.all("input")\n\nreturn { total = inputs.count, checked = inputs.where(it.checked).count }').resolve();

if (domql.info.versions.runtime !== version || type !== '{ total: Number, checked: Number }') {
    console.error(`The published domql.js answered ${domql.info.versions.runtime} and the type ${type}, where ${version} and { total: Number, checked: Number } were expected.`);
    process.exit(1);
}

console.log(`formaui-net.DOMQL ${version} served domql.js from a published application, which resolved a query.`);
