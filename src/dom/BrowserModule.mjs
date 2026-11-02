/**
 * BrowserModule — DOMQL's DOM vocabulary with its browser reads, executions and observations
 */

import { Behaviors } from './Behaviors.mjs';
import { BrowserExecutionImplementations } from './BrowserExecutionImplementations.mjs';
import { BrowserObservationImplementations } from './BrowserObservationImplementations.mjs';
import { BrowserVocabularyDeclarations } from './BrowserVocabularyDeclarations.mjs';
import { BrowserVocabularyImplementations } from './BrowserVocabularyImplementations.mjs';

export class BrowserModule {
    /**
     * The DOM module, whose members read the window and the document they are given, whose executions change them, and whose observation types start observations of them, the state of the behaviors running among them.
     * @param {{ behaviors?: Behaviors }} [dependencies] The behaviors running in this instance of DOMQL, whose state the `behavior` observation follows; a module of its own has none running but its own.
     */
    static create({ behaviors = new Behaviors() } = {}) {
        return BrowserVocabularyDeclarations.createModule({
            ...BrowserVocabularyImplementations.implementations,
            ...BrowserExecutionImplementations.implementations,
            ...BrowserObservationImplementations.implementations,
            // The state the behaviors of a name offer on the target, which each instance's start, update, move and end tells, and its own notify.
            observeBehavior: ({ request: { target, arguments: { behavior } }, notify }) => behaviors.observe(behavior, target, notify),
        });
    }
}
