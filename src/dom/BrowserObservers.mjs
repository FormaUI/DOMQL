/**
 * BrowserObservers — the functions that start the DOM vocabulary's types of observation in a browser
 */

/**
 * A request to observe: the observation type, the target, and the arguments the observation gave, with each argument it names resolved to its value.
 * @typedef {{ type: string, target: any, arguments: Record<string, any> }} ObservationRequest
 */

/**
 * What a started observation offers: how to stop it and, for a maintained observation, its latest sample.
 * @typedef {{ stop: () => void, sample?: () => { pending: boolean, value: unknown } }} Observation
 */

export class BrowserObservers {
    /**
     * Each function starts an observation: it takes the request, the function to call when something may have changed, and the environment.
     * @type {Record<string, (request: ObservationRequest, notify: () => void, environment: { window: Window }) => Observation>}
     */
    static get functions() {
        return {
            observeResize: BrowserObservers.#observeResize,
            observeMutation: BrowserObservers.#observeMutation,
            observeAttachment: BrowserObservers.#observeAttachment,
            observeIntersection: BrowserObservers.#observeIntersection,
            observeMedia: BrowserObservers.#observeMedia,
            observePixelRatio: BrowserObservers.#observePixelRatio,
            observeEvents: BrowserObservers.#observeEvents,
            observeVisibility: BrowserObservers.#observeVisibility,
        };
    }

    /**
     * The size of an element, as its border box or its content box, or of the window, its layout viewport, which a scrollbar appearing or going resizes with no `resize` of the window, so its visual viewport's is heard too.
     * Its `client` box is DOMQL's combined mode: the client box changes where either the border box or the content box does, so it observes both, one native observer each, since an observer watches an element for one box;
     * one that fails to start lets go of the one started before it.
     */
    static #observeResize({ target, arguments: { box = 'border-box' } }, notify, { window }) {
        if (target === window) {
            const listeners = [BrowserObservers.#listen(target, ['resize'], false, notify)];

            if (window.visualViewport) {
                listeners.push(BrowserObservers.#listen(window.visualViewport, ['resize'], false, notify));
            }

            return { stop: () => listeners.forEach(listener => listener.stop()) };
        }

        const observers = [];

        try {
            for (const observedBox of box === 'client' ? ['border-box', 'content-box'] : [box]) {
                observers.push(BrowserObservers.#observeBox(target, observedBox, notify, window));
            }
        } catch (error) {
            observers.forEach(observer => observer.disconnect());

            throw error;
        }

        return { stop: () => observers.forEach(observer => observer.disconnect()) };
    }

    /** A native observer of one box of an element, which reports the element once it starts to observe it, no change. */
    static #observeBox(target, box, notify, window) {
        let isStarted = false;
        const observer = new window.ResizeObserver(() => {
            if (isStarted) {
                notify();
            }

            isStarted = true;
        });

        try {
            observer.observe(target, { box });
        } catch (error) {
            observer.disconnect();

            throw error;
        }

        return observer;
    }

    /** The attributes, the children and the text of a node, and of its descendants where it says so. */
    static #observeMutation({ target, arguments: { attributes = false, childList = false, subtree = false, characterData = false } }, notify, { window }) {
        const options = { attributes: attributes !== false, childList, subtree, characterData };

        if (Array.isArray(attributes)) {
            options.attributeFilter = attributes;
        }

        if (!options.attributes && !childList && !characterData) {
            throw new TypeError('A mutation observation observes attributes, children or text');
        }

        const observer = new window.MutationObserver(() => notify());

        observer.observe(target, options);

        return { stop: () => observer.disconnect() };
    }

    /**
     * Whether a node is attached to its document, through every shadow root between them; a document is its own.
     * The window's document is observed too, since a node of another document, as a template's content is, is adopted by the one it is inserted into.
     */
    static #observeAttachment({ target }, notify, { window }) {
        const rootsOf = () => {
            const roots = new Set([window.document, target.ownerDocument ?? target]);

            for (let node = target; ;) {
                const root = node.getRootNode();

                roots.add(root);

                // A shadow root is a document fragment with a host; an element at the top of a detached tree can have a host property of its own, as a link does.
                if (root.nodeType !== window.Node.DOCUMENT_FRAGMENT_NODE || root.host === undefined) {
                    return [...roots];
                }

                node = root.host;
            }
        };

        let isAttached = target.isConnected;
        let observedRoots = rootsOf();
        const observer = new window.MutationObserver(() => {
            const roots = rootsOf();

            if (target.isConnected !== isAttached || roots.length !== observedRoots.length || roots.some((root, index) => root !== observedRoots[index])) {
                isAttached = target.isConnected;
                observeRoots(roots);
                notify();
            }
        });
        const observeRoots = roots => {
            observer.disconnect();
            observedRoots = roots;
            roots.forEach(root => observer.observe(root, { childList: true, subtree: true }));
        };

        observeRoots(observedRoots);

        return { stop: () => observer.disconnect() };
    }

    /** Whether the browser reports an element intersecting a root, or the window, grown by a margin; pending until the first report. */
    static #observeIntersection({ target, arguments: { root = null, margin = 0 } }, notify, { window }) {
        let latest = { pending: true, value: null };
        const observer = new window.IntersectionObserver(entries => {
            latest = { pending: false, value: entries.at(-1).isIntersecting };
            notify();
        }, { root, rootMargin: `${margin}px` });

        observer.observe(target);

        return { stop: () => observer.disconnect(), sample: () => latest };
    }

    /** Whether a media query matches. */
    static #observeMedia({ arguments: { query } }, notify, { window }) {
        const list = window.matchMedia(query);

        return BrowserObservers.#listen(list, ['change'], false, notify);
    }

    /** The device pixel ratio, which a media query on one ratio reports leaving. */
    static #observePixelRatio(_request, notify, { window }) {
        let stop;
        const listenAtCurrentRatio = () => {
            const list = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
            const changed = () => {
                listenAtCurrentRatio();
                notify();
            };

            list.addEventListener('change', changed, { once: true });
            stop = () => list.removeEventListener('change', changed);
        };

        listenAtCurrentRatio();

        return { stop: () => stop() };
    }

    /** Events of the given types reaching the target, or the target in the capture phase. */
    static #observeEvents({ target, arguments: { types, capture = false } }, notify) {
        return BrowserObservers.#listen(target, types, capture, notify);
    }

    /** Whether the document is visible. */
    static #observeVisibility({ target }, notify) {
        return BrowserObservers.#listen(target, ['visibilitychange'], false, notify);
    }

    static #listen(target, types, capture, notify) {
        const listener = () => notify();

        types.forEach(type => target.addEventListener(type, listener, capture));

        return { stop: () => types.forEach(type => target.removeEventListener(type, listener, capture)) };
    }
}
