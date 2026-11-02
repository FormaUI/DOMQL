/**
 * FrameSchedule — the animation frames of one window, in which DOMQL runs what waits for the next frame in two phases: the writes first, then the reads, the evaluations of the watches scheduled by frame among them
 */

/** What runs in a frame, and whether it was withdrawn before. @typedef {{ callback: (time: number) => void, isCanceled: boolean }} FrameRequest */

export class FrameSchedule {
    #window;
    #reportError;

    /** The writes waiting for the next frame, in the order they were asked for. @type {FrameRequest[]} */
    #writes = [];

    /** The reads waiting for the next frame, in the order they were asked for; while a frame's writes run, its own reads, which a write may still add to. @type {FrameRequest[]} */
    #reads = [];

    /** The animation frame asked for, or null while none is. */
    #frame = null;

    /** The phase of the frame running, or null between frames. @type {'write' | 'read' | null} */
    #phase = null;

    /**
     * @param {Window} window The window whose animation frames run what is asked for.
     * @param {(error: unknown) => void} reportError Where a callback's failure goes, which keeps no other callback from running.
     */
    constructor(window, reportError) {
        this.#window = window;
        this.#reportError = reportError;
    }

    /**
     * Runs the callback in an animation frame, given the frame's time, and answers what withdraws it. A write runs in the next frame, before every read of that frame; a read runs after them, in the frame running where
     * a write of it asks for one, and in the next one otherwise, so a frame never runs what it asks for again.
     * @param {(time: number) => void} callback
     * @param {'write' | 'read'} [phase]
     * @returns {{ cancel: () => void }}
     */
    request(callback, phase = 'write') {
        const request = { callback, isCanceled: false };

        if (phase === 'read') {
            this.#reads.push(request);
        } else {
            this.#writes.push(request);
        }

        // A read asked for by a write of the frame running joins that frame's reads.
        if (!(phase === 'read' && this.#phase === 'write')) {
            this.#frame ??= this.#window.requestAnimationFrame(time => this.#run(time));
        }

        return {
            cancel: () => {
                request.isCanceled = true;
            },
        };
    }

    /** Runs the frame: its writes, then its reads, those its writes asked for among them; what either asks for otherwise waits for the next frame. */
    #run(time) {
        this.#frame = null;

        const writes = this.#writes;

        this.#writes = [];
        this.#phase = 'write';

        try {
            for (const request of writes) {
                this.#call(request, time);
            }
        } finally {
            const reads = this.#reads;

            this.#reads = [];
            this.#phase = 'read';

            try {
                for (const request of reads) {
                    this.#call(request, time);
                }
            } finally {
                this.#phase = null;

                // What the frame asked for runs in the next one.
                if (this.#writes.length > 0 || this.#reads.length > 0) {
                    this.#frame ??= this.#window.requestAnimationFrame(next => this.#run(next));
                }
            }
        }
    }

    /** Runs a callback that is not withdrawn, reporting its failure, so every other callback of the frame runs. */
    #call(request, time) {
        if (request.isCanceled) {
            return;
        }

        try {
            request.callback(time);
        } catch (error) {
            this.#reportError(error);
        }
    }
}
