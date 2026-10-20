/**
 * BrowserModule — DOMQL's DOM vocabulary with its browser reads and observations
 */

import { BrowserObservers } from './BrowserObservers.mjs';
import { BrowserVocabulary } from './BrowserVocabulary.mjs';
import { VocabularyImplementations } from './VocabularyImplementations.mjs';

export class BrowserModule {
    /** The DOM module, whose members read the window and the document they are given and whose observation types start observations of them. */
    static create() {
        return BrowserVocabulary.createModule({ ...VocabularyImplementations.implementations, ...BrowserObservers.implementations });
    }
}
