/**
 * SnapshotPatcher — the change set that takes one result to the next, and applying it in place to the result it was computed against
 */

import { ObjectUtils } from '../common/ObjectUtils.mjs';

/**
 * The elements a result's lists were projected from, following the result's structure: a list projected from elements holds the element of each item, and a part that holds no such list is null.
 * The result never holds them, and neither does a change set; they tell two items apart that project to the same data. A part a selection was made for also holds its `branches`: selections by expression node, the selected expression for a conditional or coalescing expression, or the selected member name for bracket property access, which tell the comparer which expression a value came from, so that it is compared as that expression is, its tolerance included.
 * @typedef {({ elements: (Element | null)[] | null, items: Identities[] } | { fields: Record<string, Identities> } | {}) & { branches?: Map<object, object | string> } | null} Identities
 */

/**
 * One operation of a change set: a JSON Patch operation limited to replace, add, remove and move, whose paths are JSON Pointers into the result.
 * @typedef {{ op: 'replace' | 'add', path: string, value: unknown } | { op: 'remove', path: string } | { op: 'move', from: string, path: string }} ChangeOperation
 */

export class SnapshotPatcher {
    /**
     * The operations that take the previous result to the next. A list projected from elements changes by element: an element entering is added, one leaving is removed, one changing position is moved, and one whose projection changed is changed inside its item. Any other list changes by position.
     * A branch the next result shares with the previous one is unchanged, so a change the comparer kept within a tolerance sends nothing.
     * @param {unknown} previous The result the change set is computed against.
     * @param {import('./SnapshotPatcher.mjs').Identities} previousIdentities The elements the previous result's lists were projected from.
     * @param {unknown} next The result the change set gives.
     * @param {import('./SnapshotPatcher.mjs').Identities} nextIdentities The elements the next result's lists were projected from.
     * @returns {ChangeOperation[]}
     */
    static changeSetBetween(previous, previousIdentities, next, nextIdentities) {
        const operations = [];

        SnapshotPatcher.#compare(previous, previousIdentities, next, nextIdentities, '', operations);

        return operations;
    }

    /**
     * Applies the operations in order to the target itself, which keeps its identity, as does every object and list an operation reaches into or moves; a value an operation brings is copied as mutable data.
     * An operation that replaces the whole result changes the target's contents in place, since the target is the one object that stays.
     * @param {object} target The mutable result the change set was computed against, which becomes the result it gives.
     * @param {ChangeOperation[]} operations The change set.
     */
    static applyInPlace(target, operations) {
        for (const operation of operations) {
            const path = SnapshotPatcher.#parsePointer(operation.path);

            switch (operation.op) {
                case 'replace':
                case 'add':
                    SnapshotPatcher.#put(target, path, operation.op, SnapshotPatcher.#thaw(operation.value));
                    break;
                case 'remove':
                    SnapshotPatcher.#take(target, path);
                    break;
                case 'move':
                    // The item itself moves, so it keeps its identity.
                    SnapshotPatcher.#put(target, path, 'add', SnapshotPatcher.#take(target, SnapshotPatcher.#parsePointer(operation.from)));
                    break;
                default:
                    throw new TypeError(`'${operation.op}' is no change set operation: replace, add, remove or move`);
            }
        }
    }

    /** Puts the value at the end of the path, inside the containers the path reaches, which stay as they are. */
    static #put(target, path, op, value) {
        if (path.length === 0) {
            SnapshotPatcher.#replaceContents(target, value);

            return;
        }

        const parent = SnapshotPatcher.#valueAt(target, path.slice(0, -1));
        const token = path.at(-1);

        if (Array.isArray(parent)) {
            const index = token === '-' && op === 'add' ? parent.length : SnapshotPatcher.#parseIndex(token);

            if (index > (op === 'add' ? parent.length : parent.length - 1)) {
                throw new TypeError(`The path reaches past the end of a list, at '${token}'`);
            }

            if (op === 'add') {
                parent.splice(index, 0, value);
            } else {
                parent[index] = value;
            }

            return;
        }

        if (!ObjectUtils.isNonArrayObject(parent) || (op === 'replace' && !Object.hasOwn(parent, token))) {
            throw new TypeError(`The path names '${token}', which the result does not hold`);
        }

        ObjectUtils.defineDataProperty(parent, token, value);
    }

    /** Takes the value at the end of the path out of the container that holds it, and returns it. */
    static #take(target, path) {
        if (path.length === 0) {
            throw new TypeError('A change set cannot remove the whole result');
        }

        const parent = SnapshotPatcher.#valueAt(target, path.slice(0, -1));
        const token = path.at(-1);

        if (Array.isArray(parent)) {
            const index = SnapshotPatcher.#parseIndex(token);

            if (index >= parent.length) {
                throw new TypeError(`The path reaches past the end of a list, at '${token}'`);
            }

            return parent.splice(index, 1)[0];
        }

        if (!ObjectUtils.isNonArrayObject(parent) || !Object.hasOwn(parent, token)) {
            throw new TypeError(`The path names '${token}', which the result does not hold`);
        }

        const value = parent[token];

        delete parent[token];

        return value;
    }

    /** Makes the target hold the value's contents, keeping the target itself; a list stays a list and an object an object. */
    static #replaceContents(target, value) {
        if (Array.isArray(target) && Array.isArray(value)) {
            target.splice(0, target.length, ...value);

            return;
        }

        if (ObjectUtils.isNonArrayObject(target) && ObjectUtils.isNonArrayObject(value)) {
            for (const name of Object.keys(target)) {
                delete target[name];
            }

            for (const [name, field] of Object.entries(value)) {
                ObjectUtils.defineDataProperty(target, name, field);
            }

            return;
        }

        throw new TypeError('The whole result keeps its kind, a list or an object, in place');
    }

    /** The value as mutable data: a copy throughout, which nothing else holds. */
    static #thaw(value) {
        if (Array.isArray(value)) {
            return value.map(item => SnapshotPatcher.#thaw(item));
        }

        if (ObjectUtils.isNonArrayObject(value)) {
            return Object.fromEntries(Object.entries(value).map(([name, field]) => [name, SnapshotPatcher.#thaw(field)]));
        }

        return value;
    }

    static #compare(previous, previousIdentities, next, nextIdentities, path, operations) {
        if (Object.is(previous, next)) {
            return;
        }

        if (Array.isArray(previous) && Array.isArray(next)) {
            SnapshotPatcher.#compareLists(previous, previousIdentities, next, nextIdentities, path, operations);

            return;
        }

        if (ObjectUtils.isNonArrayObject(previous) && ObjectUtils.isNonArrayObject(next) && SnapshotPatcher.#sameNames(previous, next)) {
            for (const name of Object.keys(next)) {
                SnapshotPatcher.#compare(previous[name], previousIdentities?.fields?.[name] ?? null, next[name], nextIdentities?.fields?.[name] ?? null, `${path}/${SnapshotPatcher.#escape(name)}`, operations);
            }

            return;
        }

        operations.push({ op: 'replace', path, value: next });
    }

    static #compareLists(previous, previousIdentities, next, nextIdentities, path, operations) {
        const previousElements = SnapshotPatcher.#elementsOf(previousIdentities, previous.length);
        const nextElements = SnapshotPatcher.#elementsOf(nextIdentities, next.length);
        const itemIdentitiesOf = (identities, index) => identities?.items?.[index] ?? null;

        if (previousElements === null || nextElements === null) {
            const commonLength = Math.min(previous.length, next.length);

            for (let index = 0; index < commonLength; index++) {
                SnapshotPatcher.#compare(previous[index], itemIdentitiesOf(previousIdentities, index), next[index], itemIdentitiesOf(nextIdentities, index), `${path}/${index}`, operations);
            }

            for (let index = commonLength; index < next.length; index++) {
                operations.push({ op: 'add', path: `${path}/${index}`, value: next[index] });
            }

            for (let index = previous.length - 1; index >= commonLength; index--) {
                operations.push({ op: 'remove', path: `${path}/${index}` });
            }

            return;
        }

        const previousIndexByElement = new Map(previousElements.map((element, index) => [element, index]));
        const nextIndexByElement = new Map(nextElements.map((element, index) => [element, index]));

        // The list as the operations so far leave it, by element.
        const currentElements = [...previousElements];

        for (let index = previous.length - 1; index >= 0; index--) {
            if (!nextIndexByElement.has(previousElements[index])) {
                operations.push({ op: 'remove', path: `${path}/${index}` });
                currentElements.splice(index, 1);
            }
        }

        nextElements.forEach((element, index) => {
            if (currentElements[index] === element) {
                return;
            }

            const from = currentElements.indexOf(element, index);

            if (from === -1) {
                operations.push({ op: 'add', path: `${path}/${index}`, value: next[index] });
            } else {
                operations.push({ op: 'move', from: `${path}/${from}`, path: `${path}/${index}` });
                currentElements.splice(from, 1);
            }

            currentElements.splice(index, 0, element);
        });

        // An item that stayed, wherever it now stands, changes inside it.
        nextElements.forEach((element, index) => {
            const previousIndex = previousIndexByElement.get(element);

            if (previousIndex !== undefined) {
                SnapshotPatcher.#compare(previous[previousIndex], itemIdentitiesOf(previousIdentities, previousIndex), next[index], itemIdentitiesOf(nextIdentities, index), `${path}/${index}`, operations);
            }
        });
    }

    /** The element of each item of a list projected from elements, or null where the list is matched by position: it was not projected from elements, an item is null, or one element stands in it twice. */
    static #elementsOf(identities, length) {
        const elements = identities?.elements ?? null;

        if (elements === null || elements.length !== length || elements.some(element => element === null) || new Set(elements).size !== elements.length) {
            return null;
        }

        return elements;
    }

    static #valueAt(node, path) {
        return path.reduce((current, token) => {
            if (Array.isArray(current)) {
                const index = SnapshotPatcher.#parseIndex(token);

                if (index >= current.length) {
                    throw new TypeError(`The path reaches past the end of a list, at '${token}'`);
                }

                return current[index];
            }

            if (ObjectUtils.isNonArrayObject(current) && Object.hasOwn(current, token)) {
                return current[token];
            }

            throw new TypeError(`The path names '${token}', which the result does not hold`);
        }, node);
    }

    /** The tokens of a JSON Pointer, unescaped. */
    static #parsePointer(pointer) {
        if (typeof pointer !== 'string' || (pointer !== '' && !pointer.startsWith('/'))) {
            throw new TypeError(`'${pointer}' is no JSON Pointer`);
        }

        return pointer === '' ? [] : pointer.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'));
    }

    static #parseIndex(token) {
        if (!/^(?:0|[1-9][0-9]*)$/.test(token)) {
            throw new TypeError(`'${token}' is no index of a list`);
        }

        return Number(token);
    }

    static #escape(name) {
        return name.replaceAll('~', '~0').replaceAll('/', '~1');
    }

    static #sameNames(previous, next) {
        const names = Object.keys(next);

        return names.length === Object.keys(previous).length && names.every(name => Object.hasOwn(previous, name));
    }
}
