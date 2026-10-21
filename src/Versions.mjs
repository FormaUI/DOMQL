/**
 * Versions — the versions DOMQL reports: its runtime's release, the DOMQL specification it follows, and the language specification its Lexica runtime follows
 */

import { lexica } from '@formaui/lexica';

export class Versions {
    /** The runtime release version, which the package and the bundle carry. */
    static runtime = '1.0.0-alpha.275';

    /** The DOMQL specification version the implementation follows. */
    static specification = '1.0.0-alpha.276';

    /** The language specification version the Lexica runtime DOMQL runs on follows, as that runtime reports it. */
    static language = lexica.info.versions.language;
}
