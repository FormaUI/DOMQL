/**
 * BrowserModule — DOMQL's DOM vocabulary with its browser reads and observations
 */

import { BrowserObservationImplementations } from './BrowserObservationImplementations.mjs';
import { BrowserVocabularyDeclarations } from './BrowserVocabularyDeclarations.mjs';
import { BrowserVocabularyImplementations } from './BrowserVocabularyImplementations.mjs';

export class BrowserModule {
    /** The DOM module, whose members read the window and the document they are given and whose observation types start observations of them. */
    static create() {
        return BrowserVocabularyDeclarations.createModule({ ...BrowserVocabularyImplementations.implementations, ...BrowserObservationImplementations.implementations });
    }
}
