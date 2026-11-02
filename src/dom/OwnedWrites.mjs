/**
 * OwnedWrites — the targets continuous executions hold: an element's attribute, a class of its class list, a property of its inline style or its text, each held by the executions that write it, the latest of which applies
 * its value
 */

/**
 * A target an execution holds: the element it is of, its key among the element's targets, what a mutation observer of the element observes of another writer's changes to it, and how its value is read and written, null
 * standing for none, as an attribute absent.
 * @typedef {{ element: Element, key: string, observe: MutationObserverInit, read: () => unknown, write: (value: unknown) => void }} Target
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
            observe: { attributes: true, attributeFilter: [key] },
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
            observe: { attributes: true, attributeFilter: ['class'] },
            read: () => element.classList.contains(name),
            write: present => element.classList.toggle(name, present),
        };
    }

    /** A property of an element's inline style, declared none where it is null; its value is what the style attribute declares, as `inlineStyle` reads it. */
    static style(element, property) {
        return {
            element,
            key: `style ${property}`,
            observe: { attributes: true, attributeFilter: ['style'] },
            read: () => element.style.getPropertyValue(property) || null,
            write: value => (value === null ? element.style.removeProperty(property) : element.style.setProperty(property, value)),
        };
    }

    /**
     * An element's text: the data of the one text node it holds, written in place, so a framework that rendered the node goes on holding it, and none where it holds no node, a text node added where it is written then.
     * An element holding any other node, an element or a second text among them, reads as undefined, and refuses a write, which would replace what it holds.
     */
    static text(element) {
        const nodeOf = () => {
            const { childNodes } = element;

            if (childNodes.length === 0) {
                return null;
            }

            return childNodes.length === 1 && childNodes[0].nodeType === 3 ? childNodes[0] : undefined;
        };

        return {
            element,
            key: 'text',
            observe: { childList: true, characterData: true, subtree: true },
            read: () => {
                const node = nodeOf();

                return node === undefined || node === null ? node : node.data;
            },
            write: value => {
                const node = nodeOf();

                if (node === undefined) {
                    throw new Error('The element holds nodes beside one text, which writing its text would replace; its text is written in an element holding one text node or none');
                }

                if (value === null) {
                    node?.remove();
                } else if (node === null) {
                    element.append(element.ownerDocument.createTextNode(value));
                } else {
                    node.data = value;
                }
            },
        };
    }

    /**
     * Holds the target at the value given, and answers what updates the holding and ends it. The latest holding of a target applies its value, and one that keeps it writes it again in the next frame's writes, before its
     * reads, where another writer changes it; where that writer writes again in answer, within the two frames after, it keeps a value of its own, and the holding yields to it until its next update.
     * @param {Target} target
     * @param {{ value: unknown, restore: boolean, keep: boolean }} options
     * @param {{ reportError: (error: unknown) => void, frame: (callback: () => void) => { cancel: () => void } }} scheduling Where a failure to write the value again is reported, and the frame schedule whose writes
     * write it again.
     */
    hold(target, options, { reportError, frame }) {
        let holding = this.#begin({ target, ...options });
        let observer = null;
        let scheduled = null;

        // The frames after DOMQL wrote the value again, in which another writer's change answers it, or null outside them; and whether the holding yielded to a writer that answered.
        let answering = null;
        let hasYielded = false;
        const stopAnswering = () => {
            answering?.cancel();
            answering = null;
        };

        // Whether the holding applies its value and keeps it, and another writer changed it since DOMQL wrote it.
        const isOverwritten = () => {
            const entry = this.#entryOf(holding.target);

            return holding.keep && entry?.holdings.at(-1) === holding && holding.target.read() !== entry.written;
        };

        // Another writer's change is undone in the next frame's writes, before the watches of that frame read it. A writer that writes again in answer keeps a value of its own, as a framework's patch does not, so the
        // holding yields to it rather than fight it.
        const keepValue = () => {
            if (hasYielded || scheduled !== null || !isOverwritten()) {
                return;
            }

            if (answering !== null) {
                stopAnswering();
                hasYielded = true;

                return;
            }

            scheduled = frame(() => {
                scheduled = null;

                if (isOverwritten()) {
                    try {
                        this.#apply(this.#entryOf(holding.target), holding);
                    } catch (error) {
                        reportError(error);

                        return;
                    }

                    // An answer comes in the microtasks after this frame, or among the writes of the next, as a holder that writes in frames of its own does.
                    answering = frame(() => {
                        answering = frame(() => {
                            answering = null;
                        });
                    });
                }
            });
        };

        const observe = () => {
            observer?.disconnect();
            observer = null;

            if (holding.keep) {
                observer = this.#mutationObservers.create(holding.target.element.ownerDocument.defaultView, keepValue);
                observer.observe(holding.target.element, holding.target.observe);
            }
        };

        observe();

        return {
            /** Holds the target given at the value given, ending the holding of the one it held where that is another; a target it can't be held at leaves the holding as it was. */
            update: (target, next) => {
                // An update writes the holder's value again, so the holding keeps it from then on, whoever it yielded to.
                stopAnswering();
                hasYielded = false;

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
                stopAnswering();
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
