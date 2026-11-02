/**
 * BrowserModule — DOMQL's DOM vocabulary with its browser reads, executions and observations
 */

import { BrowserExecutionImplementations } from './BrowserExecutionImplementations.mjs';
import { BrowserObservationImplementations } from './BrowserObservationImplementations.mjs';
import { BrowserVocabularyDeclarations } from './BrowserVocabularyDeclarations.mjs';
import { BrowserVocabularyImplementations } from './BrowserVocabularyImplementations.mjs';

export class BrowserModule {
    /** The DOM module, whose members read the window and the document they are given, whose executions change them, and whose observation types start observations of them. */
    static create() {
        return BrowserVocabularyDeclarations.createModule({ ...BrowserVocabularyImplementations.implementations, ...BrowserExecutionImplementations.implementations, ...BrowserObservationImplementations.implementations });
    }
}
