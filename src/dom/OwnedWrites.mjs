/**
 * OwnedWrites — the targets continuous executions hold: an element's attribute, a class of its class list or a property of its inline style, each held by the executions that write it, the latest of which applies its value
 */

/**
 * A target an execution holds: the element it is of, its key among the element's targets, the attribute whose changes are another writer's, and how its value is read and written, null standing for none, as an
 * attribute absent.
 * @typedef {{ element: Element, key: string, observes: string, read: () => unknown, write: (value: unknown) => void }} Target
 */

/**
 * One holding of a target: the target, the value it is held at, whether the last holder letting go writes back the value the target held before, and whether its value is written again where another writer changes it.
 * @typedef {{ target: Target, value: unknown, restore: boolean, keep: boolean }} Holding
 */

export class OwnedWrites {
    #mutationObservers;

    /** @param {{ mutationObservers: import('./MutationObservers.mjs').MutationObservers }} dependencies The mutation observers of DOMQL's own, which a holder that keeps its value observes its element through. */
    constructor({ mutationObservers }) {
        this.#mutationObservers = mutationObservers;
    }

    /**
     * The holdings of each target, by its element and its key, in the order they began, with the value the target held before the first and the one DOMQL last wrote. An entry is made as a target's first holding begins
     * and released as its last ends, and an element's entries go with the element.
     * @type {WeakMap<Element, Map<string, { found: unknown, written: unknown, holdings: Holding[] }>>}
     */
    #targets = new WeakMap();

    /** An element's attribute of the name, absent where it is null; an HTML element's attribute names are its lowercase ones, as its own attribute methods read them. */
    static attribute(element, name) {
        const key = element.namespaceURI === 'http://www.w3.org/1999/xhtml' ? name.toLowerCase() : name;

        return {
            element,
            key: `attribute ${key}`,
            observes: key,
            read: () => element.getAttribute(name),
            write: value => (value === null ? element.removeAttribute(name) : element.setAttribute(name, value)),
        };
    }

    /** A class of an element's class list, there where it is true; a class is one token, never empty and holding no ASCII whitespace, as a class list takes one. */
    static class(element, name) {
        if (name === '' || /[\t\n\f\r ]/.test(name)) {
            throw new Error(`${JSON.stringify(name)} is no class, which is one token: never empty, and holding no tab, line feed, form feed, carriage return or space`);
        }

        return {
            element,
            key: `class ${name}`,
            observes: 'class',
            read: () => element.classList.contains(name),
            write: present => element.classList.toggle(name, present),
        };
    }

    /** A property of an element's inline style, declared none where it is null; its value is what the style attribute declares, as `inlineStyle` reads it. */
    static style(element, property) {
        return {
            element,
            key: `style ${property}`,
            observes: 'style',
            read: () => element.style.getPropertyValue(property) || null,
            write: value => (value === null ? element.style.removeProperty(property) : element.style.setProperty(property, value)),
        };
    }

    /**
     * Holds the target at the value given, and answers what updates the holding and ends it. The latest holding of a target applies its value, and one that keeps it writes it again in the next frame's writes, before its
     * reads, where another writer changes it.
     * @param {Target} target
     * @param {{ value: unknown, restore: boolean, keep: boolean }} options
     * @param {{ reportError: (error: unknown) => void, frame: (callback: () => void) => { cancel: () => void } }} scheduling Where a failure to write the value again is reported, and the frame schedule whose writes
     * write it again.
     */
    hold(target, options, { reportError, frame }) {
        let holding = this.#begin({ target, ...options });
        let observer = null;
        let scheduled = null;

        // Whether the holding applies its value and keeps it, and another writer changed it since DOMQL wrote it.
        const isOverwritten = () => {
            const entry = this.#entryOf(holding.target);

            return holding.keep && entry?.holdings.at(-1) === holding && holding.target.read() !== entry.written;
        };

        // Another writer's change is undone in the next frame's writes, once a frame, before the watches of that frame read it, so two writers that keep a value never alternate faster than the page paints.
        const keepValue = () => {
            if (scheduled !== null || !isOverwritten()) {
                return;
            }

            scheduled = frame(() => {
                scheduled = null;

                if (isOverwritten()) {
                    try {
                        this.#apply(this.#entryOf(holding.target), holding);
                    } catch (error) {
                        reportError(error);
                    }
                }
            });
        };

        const observe = () => {
            observer?.disconnect();
            observer = null;

            if (holding.keep) {
                observer = this.#mutationObservers.create(holding.target.element.ownerDocument.defaultView, keepValue);
                observer.observe(holding.target.element, { attributes: true, attributeFilter: [holding.target.observes] });
            }
        };

        observe();

        return {
            /** Holds the target given at the value given, ending the holding of the one it held where that is another; a target it can't be held at leaves the holding as it was. */
            update: (target, next) => {
                if (target.element === holding.target.element && target.key === holding.target.key) {
                    Object.assign(holding, next);

                    const entry = this.#entryOf(holding.target);

                    if (entry.holdings.at(-1) === holding) {
                        this.#apply(entry, holding);
                    }
                } else {
                    const replacement = this.#begin({ target, ...next });

                    this.#end(holding);
                    holding = replacement;
                }

                observe();
            },
            /** Ends the holding, its target's last writing back the value the target held before where it restores it, and withdraws a write it asked a frame for. */
            dispose: () => {
                observer?.disconnect();
                observer = null;
                scheduled?.cancel();
                scheduled = null;
                this.#end(holding);
            },
        };
    }

    /** The entry of the target's holdings, or undefined where none holds it. */
    #entryOf(target) {
        return this.#targets.get(target.element)?.get(target.key);
    }

    /** Makes the holding its target's latest and writes its value, the first finding the value the target held before; a write that fails holds nothing. */
    #begin(holding) {
        const { target } = holding;
        let entries = this.#targets.get(target.element);
        let entry = entries?.get(target.key);
        const found = entry === undefined ? target.read() : entry.found;

        target.write(holding.value);

        if (entries === undefined) {
            entries = new Map();
            this.#targets.set(target.element, entries);
        }

        if (entry === undefined) {
            entry = { found, written: undefined, holdings: [] };
            entries.set(target.key, entry);
        }

        entry.written = target.read();
        entry.holdings.push(holding);

        return holding;
    }

    /** Writes the holding's value to its target, recording what the target then reads as what DOMQL wrote. */
    #apply(entry, holding) {
        holding.target.write(holding.value);
        entry.written = holding.target.read();
    }

    /**
     * Ends the holding. The latest ending gives the target to the one before it, which writes its value, and the last writes back the value the target held before the first, where it restores; either writes only where
     * the target still holds what DOMQL last wrote, so another writer's value stands.
     */
    #end(holding) {
        const { target } = holding;
        const entries = this.#targets.get(target.element);
        const entry = entries?.get(target.key);
        const index = entry?.holdings.indexOf(holding) ?? -1;

        if (index === -1) {
            return;
        }

        const isLatest = index === entry.holdings.length - 1;
        const isUnchanged = target.read() === entry.written;

        entry.holdings.splice(index, 1);

        if (entry.holdings.length > 0) {
            if (isLatest && isUnchanged) {
                this.#apply(entry, entry.holdings.at(-1));
            }

            return;
        }

        entries.delete(target.key);

        if (holding.restore && isUnchanged) {
            target.write(entry.found);
        }
    }
}
