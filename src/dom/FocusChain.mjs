/**
 * FocusChain — where the focus is in a document, followed through every open shadow root it moves within: the focus moving, inside one root or between roots, and the
 * focused element removed, which moves the focus away and fires no event
 */

/** The events that tell the focus moved, heard where each reaches. */
const FOCUS_EVENTS = ['focusin', 'focusout'];

export class FocusChain {
    #document;
    #notify;
    #observer;

    /**
     * The open shadow roots listened to, the focus within each when it was last followed. A focus event inside one root, whose target and related target both retarget
     * to its host, reaches no further, so the document alone never hears it.
     * @type {ShadowRoot[]}
     */
    #roots = [];

    /** The element holding the focus as it was last followed, whose removal moves the focus away with no event, or null where none does. @type {Element | null} */
    #focused = null;

    #listener = () => this.#moved();

    /**
     * Follows the focus in a document, calling the function given each time it moves, until stopped.
     * @param {Document} document
     * @param {() => void} notify
     * @param {{ create: (window: Window, callback: () => void) => { observe: (target: Node, options: MutationObserverInit) => void, disconnect: () => void } }} mutationObservers
     * @param {Window} window
     */
    constructor(document, notify, mutationObservers, window) {
        this.#document = document;
        this.#notify = notify;
        this.#observer = mutationObservers.create(window, () => this.#removed());
        FocusChain.#listen(document, this.#listener);
        this.#follow();
    }

    /** Stops following the focus, letting go of every root it listened to. */
    stop() {
        FocusChain.#unlisten(this.#document, this.#listener);
        this.#roots.forEach(root => FocusChain.#unlisten(root, this.#listener));
        this.#roots = [];
        this.#focused = null;
        this.#observer.disconnect();
    }

    // The focus moved, heard at the document or inside a root it was within.
    #moved() {
        this.#follow();
        this.#notify();
    }

    // A removal may have taken the focused element out of its tree, which moves the focus away and fires no event.
    #removed() {
        if (this.#focused !== null && !this.#focused.isConnected) {
            this.#follow();
            this.#notify();
        }
    }

    /**
     * Listens to the roots the focus is within now, and observes the trees the focused element stands in for its removal. Between a `focusout` and the `focusin` after it
     * the focus rests on the body, where no root holds it; a root keeps its listener until the focus settles on an element, so the `focusin` inside it is heard.
     */
    #follow() {
        const roots = [];
        let active = this.#document.activeElement;

        // A closed root answers no `shadowRoot`, so the focus is followed into open roots alone, as `activeElement` reads it.
        while (active?.shadowRoot?.activeElement) {
            roots.push(active.shadowRoot);
            active = active.shadowRoot.activeElement;
        }

        const isSettled = active !== null && active !== this.#document.body && active !== this.#document.documentElement;
        const kept = isSettled ? roots : [...new Set([...this.#roots.filter(root => root.host.isConnected), ...roots])];

        this.#roots.filter(root => !kept.includes(root)).forEach(root => FocusChain.#unlisten(root, this.#listener));
        kept.filter(root => !this.#roots.includes(root)).forEach(root => FocusChain.#listen(root, this.#listener));
        this.#roots = kept;
        this.#focused = isSettled ? active : null;
        this.#observer.disconnect();

        if (this.#focused !== null) {
            // The document's subtree holds no shadow tree, so each root the focused element is inside is observed too.
            [this.#document, ...roots].forEach(root => this.#observer.observe(root, { childList: true, subtree: true }));
        }
    }

    static #listen(target, listener) {
        FOCUS_EVENTS.forEach(type => target.addEventListener(type, listener));
    }

    static #unlisten(target, listener) {
        FOCUS_EVENTS.forEach(type => target.removeEventListener(type, listener));
    }
}
