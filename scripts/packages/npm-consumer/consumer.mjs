// An application that installed @formaui-net/domql from its feed, and Nexo's package from npm with it: it imports DOMQL by its name and resolves a query that reads the DOM, as the package's version; resolving needs no DOM. A failure is Nexo's own NexoError, since DOMQL imports Nexo's package rather than carrying a copy.
import { domql, NexoError } from '@formaui-net/domql';
import { NexoError as NexoPackageError } from '@formaui-net/nexo';

const [version] = process.argv.slice(2);
const { type } = domql.query('let inputs = Domql.document.all("input")\n\nreturn { total = inputs.count, checked = inputs.where(it.checked).count }').resolve();

if (domql.info.versions.runtime !== version || type !== '{ total: Number, checked: Number }') {
    console.error(`The installed package answered ${domql.info.versions.runtime} and the type ${type}, where ${version} and { total: Number, checked: Number } were expected.`);
    process.exit(1);
}

if (NexoError !== NexoPackageError) {
    console.error('The installed package exports a NexoError other than the one Nexo\'s package exports.');
    process.exit(1);
}

console.log(`@formaui-net/domql ${version} resolved a query, installed from its feed with Nexo's package.`);
