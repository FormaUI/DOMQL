/**
 * MutationObservers — the mutation observers one instance of DOMQL runs, by the nodes they observe for a change of a class, so a transient measurement drains those that could record its own change of a class of the
 * records it caused
 */

/**
 * One of DOMQL's mutation observers: the native observer, what it calls with its records, its window, and the nodes it observes in a way that records a change of an element's class, each with whether it observes their
 * subtree too, or null while it observes none so.
 * @typedef {{ observer: MutationObserver, callback: (records: MutationRecord[]) => void, window: Window, classTargets: Map<Node, boolean> | null }} OwnObserver
 */

export class MutationObservers {
    /**
     * The observers that record a change of a class on each node or within it, by the node: an observer is added for a node as it observes the node so, and taken out as it observes the node otherwise or is
     * disconnected; a node's entry goes with the node.
     * @type {WeakMap<Node, Set<OwnObserver>>}
     */
    #observingClass = new WeakMap();

    /**
     * Creates a mutation observer of the window's, which calls the callback with its records, and which DOMQL counts among its own for each node it observes in a way that records a change of a class.
     * @param {Window} window The window whose observer it is.
     * @param {(records: MutationRecord[]) => void} callback
     * @returns {{ observe: (target: Node, options: MutationObserverInit) => void, disconnect: () => void }}
     */
    create(window, callback) {
        const own = { observer: new window.MutationObserver(records => callback(records)), callback, window, classTargets: null };

        return {
            observe: (target, options) => {
                own.observer.observe(target, options);

                // Observing a node again replaces what it observes of it, so the node is counted as these options say.
                if (MutationObservers.#recordsClass(options)) {
                    own.classTargets ??= new Map();
                    own.classTargets.set(target, options.subtree === true);
                    this.#observersOf(target, true).add(own);
                } else if (own.classTargets?.delete(target)) {
                    this.#release(target, own);
                }
            },
            disconnect: () => {
                own.observer.disconnect();
                own.classTargets?.forEach((subtree, target) => this.#release(target, own));
                own.classTargets = null;
            },
        };
    }

    /**
     * Reads an element under a class it lacks: adds the class, answers what the read answers, and restores the element's class attribute as it was, whatever the read does. The records the class's change caused are taken
     * from every observer of DOMQL's in the element's window that could record it, one observing the element, or an ancestor in its tree with its subtree, for its attributes and the class among them; the rest of their
     * records, those recorded before and those of anything else the read changed, are handed to each one's callback in a microtask, as its own delivery would hand them. Every other observer records nothing of the
     * class, so its records keep their own delivery. An element holding the class already is read as it is.
     * @param {Element} element
     * @param {string} name The class.
     * @param {() => unknown} read
     */
    measureUnder(element, name, read) {
        if (element.classList.contains(name)) {
            return read();
        }

        const observers = this.#recordingClassOf(element);
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

    /** The observers of DOMQL's in the element's window that record a change of its class: those observing it, and those observing an ancestor of it in its tree with the ancestor's subtree. */
    #recordingClassOf(element) {
        const window = element.ownerDocument.defaultView;
        const recording = [];

        for (let node = element; node !== null; node = node.parentNode) {
            const observers = this.#observingClass.get(node);

            if (observers === undefined) {
                continue;
            }

            for (const own of observers) {
                // An observer observing two of the ancestors is drained once.
                if (own.window === window && (node === element || own.classTargets.get(node)) && !recording.includes(own)) {
                    recording.push(own);
                }
            }
        }

        return recording;
    }

    /** The observers recording a change of a class on the node or within it, made where `creates` says so. */
    #observersOf(target, creates = false) {
        let observers = this.#observingClass.get(target);

        if (observers === undefined && creates) {
            observers = new Set();
            this.#observingClass.set(target, observers);
        }

        return observers;
    }

    /** Takes the observer out of those recording a change of a class on the node, releasing the node's entry where it leaves it empty. */
    #release(target, own) {
        const observers = this.#observingClass.get(target);

        observers?.delete(own);

        if (observers?.size === 0) {
            this.#observingClass.delete(target);
        }
    }

    /**
     * Whether observing with these options records a change of an element's class attribute: they observe attributes, as `attributes` says, or as a filter or an old value given without it implies, and a filter, where
     * they give one, names `class`.
     */
    static #recordsClass({ attributes, attributeFilter, attributeOldValue }) {
        const observesAttributes = attributes === true || (attributes === undefined && (attributeFilter !== undefined || attributeOldValue !== undefined));

        return observesAttributes && (attributeFilter === undefined || attributeFilter.includes('class'));
    }
}
