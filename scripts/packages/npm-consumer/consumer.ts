// A TypeScript application that installed @formaui-net/domql from its feed: it type-checks against the declarations the package holds.
import { domql, NexoError } from '@formaui-net/domql';
import type { DomqlQuery, DomqlResolvedDefinition } from '@formaui-net/domql';

export const countChildren = (panel: Element): number => {
    const query: DomqlQuery<number> = domql.query<number>('panel.children.count', { panel });

    return query.evaluate();
};

export const typeOf = (text: string): string | null => {
    try {
        const resolved: DomqlResolvedDefinition = domql.query(text).resolve();

        return resolved.type;
    } catch (error) {
        if (error instanceof NexoError) {
            return `${error.code}: ${error.message}`;
        }

        throw error;
    }
};

export const runtime: string = domql.info.versions.runtime;
