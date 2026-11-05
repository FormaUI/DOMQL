/**
 * Versions — the versions DOMQL reports: its runtime's release, the DOMQL specification it follows, and the language specification its Nexo runtime follows
 */

import { nexo } from '@formaui-net/nexo';

export class Versions {
    /** The runtime release version, which the package and the bundle carry. */
    static runtime = '1.0.0-preview.1';

    /** The DOMQL specification version the implementation follows. */
    static specification = '1.0.0-preview.1';

    /** The language specification version the Nexo runtime DOMQL runs on follows, as that runtime reports it. */
    static language = nexo.info.versions.language;
}
