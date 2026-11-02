/**
 * MutationObservers — the mutation observers one instance of DOMQL runs, by their window, so a transient measurement drains them of the records its own change of a class caused
 */

/** One of DOMQL's mutation observers, and what it calls with its records. @typedef {{ observer: MutationObserver, callback: (records: MutationRecord[]) => void }} OwnObserver */

export class MutationObservers {
    /** The observers observing in each window, each kept from its first `observe` until it is disconnected, so an element's window holds those of DOMQL's own that may record a change of it. @type {WeakMap<Window, Set<OwnObserver>>} */
    #observing = new WeakMap();

    /**
     * Creates a mutation observer of the window's, which calls the callback with its records, and which DOMQL counts among its own while it observes.
     * @param {Window} window The window whose observer it is.
     * @param {(records: MutationRecord[]) => void} callback
     * @returns {{ observe: (target: Node, options: MutationObserverInit) => void, disconnect: () => void }}
     */
    create(window, callback) {
        const own = { observer: new window.MutationObserver(records => callback(records)), callback };

        return {
            observe: (target, options) => {
                own.observer.observe(target, options);
                this.#observersOf(window, true).add(own);
            },
            disconnect: () => {
                own.observer.disconnect();
                this.#observersOf(window)?.delete(own);
            },
        };
    }

    /**
     * Reads an element under a class it lacks: adds the class, answers what the read answers, and restores the element's class attribute as it was, whatever the read does. The records the class's change caused are taken
     * from every observer of DOMQL's in the element's window, and the rest, those recorded before and those of anything else the read changed, are handed to each observer's callback in a microtask, as its own delivery
     * would hand them. An element holding the class already is read as it is.
     * @param {Element} element
     * @param {string} name The class.
     * @param {() => unknown} read
     */
    measureUnder(element, name, read) {
        if (element.classList.contains(name)) {
            return read();
        }

        const observers = [...(this.#observersOf(element.ownerDocument.defaultView) ?? [])];
        const before = observers.map(({ observer }) => observer.takeRecords());
        const written = element.getAttribute('class');

        element.classList.add(name);

        try {
            return read();
        } finally {
            if (written === null) {
                element.removeAttribute('class');
            } else {
                element.setAttribute('class', written);
            }

            observers.forEach(({ observer, callback }, index) => {
                const records = [...before[index], ...observer.takeRecords().filter(record => record.type !== 'attributes' || record.target !== element || record.attributeName !== 'class')];

                if (records.length > 0) {
                    queueMicrotask(() => callback(records));
                }
            });
        }
    }

    /** The observers of DOMQL's observing in the window, made where `creates` says so. */
    #observersOf(window, creates = false) {
        let observers = this.#observing.get(window);

        if (observers === undefined && creates) {
            observers = new Set();
            this.#observing.set(window, observers);
        }

        return observers;
    }
}
