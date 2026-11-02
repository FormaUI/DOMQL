/**
 * DispatchTable — what DOMQL keeps of each host call a module declares, which Nexo leaves to its host: the request it makes, an execution's mode, the behavior it reaches, and the implementation that carries it out
 */

import { nexo, NexoError } from '@formaui-net/nexo';

/** The requests a host call makes: a subscription to an event source, or an execution. */
const REQUEST_KINDS = ['subscription', 'execution'];

/** How an execution runs: once, answering its result, or continuously, until it is updated or disposed. */
const EXECUTION_MODES = ['once', 'continuous'];

/**
 * What DOMQL keeps of a host call: the request it makes, its mode where it is an execution, the implementation that carries it out, which a declaration resolved against and never carried out leaves out, and the type it
 * stands within, null for a module member, the module that declares it, and the continuous execution of that module whose running instance it reaches, null where it reaches none.
 * @typedef {{ requestKind: 'subscription' | 'execution', executionMode: 'once' | 'continuous' | null, implementation: Function | undefined, type: string | null, module: string, behavior: string | null }} DispatchDescriptor
 */

export class DispatchTable {
    /** Each host call's dispatch descriptor, by its declaration as its module holds it. @type {WeakMap<object, DispatchDescriptor>} */
    static #dispatchDescriptors = new WeakMap();

    /**
     * Creates a module from its declarations, keeping each host call's request kind, execution mode and implementation in the table, and giving Nexo the declaration without them, so Nexo resolves and prepares the call and DOMQL alone
     * invokes it. A host call stands among the module's members or within a type, and one declaration standing in several types is kept for each declaration the module makes of it. A host call whose request kind is missing or
     * unknown, an execution whose mode is missing or unknown, an event source given a mode or declaring no result, a member the evaluator invokes given either key, a continuous execution declaring a result, and an `impl`
     * that is no function are refused with a module error naming the declaration, an unnamed indexer as `[]`, as Nexo names it, the type it stands in where it stands in one, and the key; so is a `behavior` on a
     * declaration that reaches none, and one naming no continuous execution of the module.
     * @param {string} name The module's name.
     * @param {object} contents What the module declares.
     */
    static createModule(name, contents) {
        // Contents Nexo refuses are left to it, which names what is wrong with them.
        if (contents === null || typeof contents !== 'object' || Array.isArray(contents)) {
            return nexo.createModule(name, contents);
        }

        const location = (type, declaration, declarationKey) => ({ module: String(name), ...(type === null ? {} : { type }), declaration: String(declaration), declarationKey });
        const fail = (code, message, type, declaration, key) => {
            throw NexoError.module(code, message, location(type, declaration, key));
        };

        // Each host call the module declares, with its name and the type it stands within, which the declarations reaching a behavior are checked against.
        const described = [];
        const describe = (members, type) => (Array.isArray(members) ? members.map(member => {
            const descriptor = DispatchTable.#createDescriptor(member, type, String(name), (code, message, declaration, key) => fail(code, message, type, declaration, key));

            if (descriptor !== null) {
                described.push({ descriptor, name: member.name, type });
            }

            return descriptor;
        }) : null);

        const memberDescriptors = describe(contents.members, null);
        const typeDescriptors = Array.isArray(contents.types) ? contents.types.map(type => describe(type?.members, DispatchTable.#localNameOf(type?.name))) : null;
        const declarationsOf = (members, descriptors) => members.map((member, index) => DispatchTable.#createDeclaration(member, descriptors[index]));

        // A behavior is a continuous execution of the module, which each declaration reaching it names.
        const behaviors = new Set(described.filter(({ descriptor }) => descriptor.executionMode === 'continuous').map(entry => entry.name));
        const unknown = described.find(({ descriptor }) => descriptor.behavior !== null && !behaviors.has(descriptor.behavior));

        if (unknown !== undefined) {
            fail('DOMQL4012', `'${unknown.descriptor.behavior}' is no continuous execution the module '${name}' declares, whose running instance a declaration naming it reaches`, unknown.type, unknown.name, 'behavior');
        }

        const module = nexo.createModule(name, {
            ...contents,
            ...(memberDescriptors === null ? {} : { members: declarationsOf(contents.members, memberDescriptors) }),
            ...(typeDescriptors === null ? {} : { types: contents.types.map((type, index) => (typeDescriptors[index] === null ? type : { ...type, members: declarationsOf(type.members, typeDescriptors[index]) })) }),
        });

        // A module keeps its types, and the members of each, in the order they were declared.
        const keep = (declarations, descriptors) => declarations?.forEach((declaration, index) => {
            if (descriptors?.[index] != null) {
                DispatchTable.#dispatchDescriptors.set(declaration, descriptors[index]);
            }
        });

        keep(module.members, memberDescriptors);
        module.types.forEach((type, index) => keep(type.members, typeDescriptors?.[index]));

        return module;
    }

    /** A type's local name, as Nexo names it in a location, without the type parameters a declared name writes after it, as `ListExtensions<T>` writes `T`; null for a name that is no string. */
    static #localNameOf(name) {
        return typeof name === 'string' ? name.replace(/<.*$/s, '') : null;
    }

    /** The dispatch descriptor the table keeps for the host call's declaration, undefined for any other declaration and for a host call no module of DOMQL's made. */
    static get(declaration) {
        return DispatchTable.#dispatchDescriptors.get(declaration);
    }

    /** The dispatch descriptor the table keeps of the member, null for a member the evaluator invokes, refusing the keys its kind of request does not take. */
    static #createDescriptor(member, type, module, fail) {
        if (member === null || typeof member !== 'object') {
            return null;
        }

        const { invokedBy, requestKind, executionMode, impl, result, behavior } = member;
        const name = member.kind === 'indexer' && member.name == null ? '[]' : member.name;

        if (invokedBy !== 'host') {
            for (const [key, value] of [['requestKind', requestKind], ['executionMode', executionMode]]) {
                if (value !== undefined) {
                    fail('DOMQL4001', `A member the evaluator invokes makes no request of its own, so it declares no ${key}; a host call says invokedBy: 'host'`, name, key);
                }
            }

            if (behavior !== undefined) {
                fail('DOMQL4011', DispatchTable.#behaviorRefusal, name, 'behavior');
            }

            return null;
        }

        if (!REQUEST_KINDS.includes(requestKind)) {
            fail('DOMQL4002', `A host call declares the request it makes, requestKind ${REQUEST_KINDS.map(kind => `'${kind}'`).join(' or ')}`, name, 'requestKind');
        }

        if (requestKind === 'subscription') {
            if (executionMode !== undefined) {
                fail('DOMQL4003', 'An event source is listened to for as long as it is subscribed to, so it declares no executionMode', name, 'executionMode');
            }

            if (result === undefined) {
                fail('DOMQL4004', 'An event source declares the type of each event it delivers, which its subscription projects', name, 'result');
            }
        } else {
            if (!EXECUTION_MODES.includes(executionMode)) {
                fail('DOMQL4005', `An execution declares how it runs, executionMode ${EXECUTION_MODES.map(mode => `'${mode}'`).join(' or ')}`, name, 'executionMode');
            }

            if (executionMode === 'continuous' && result !== undefined) {
                fail('DOMQL4006', 'A continuous execution runs until it is updated or disposed and answers no result, so it declares none', name, 'result');
            }
        }

        if (impl !== undefined && typeof impl !== 'function') {
            fail('DOMQL4007', 'Its impl is a function', name, 'impl');
        }

        // A command names the behavior whose running instance it reaches; a behavior itself reaches none.
        if (behavior !== undefined && (requestKind !== 'execution' || executionMode !== 'once' || typeof behavior !== 'string' || behavior === '')) {
            fail('DOMQL4011', DispatchTable.#behaviorRefusal, name, 'behavior');
        }

        return { requestKind, executionMode: executionMode ?? null, implementation: impl, type, module, behavior: behavior ?? null };
    }

    /** Why a declaration's `behavior` is refused. */
    static #behaviorRefusal = 'A command, a once execution, names by its behavior the continuous execution of its module whose running instance it reaches, and no other declaration names one';

    /** The declaration Nexo is given: a host call's without what the table keeps of it, and any other member's as it is. */
    static #createDeclaration(member, descriptor) {
        if (descriptor === null) {
            return member;
        }

        const { requestKind, executionMode, impl, behavior, ...declaration } = member;

        return declaration;
    }
}
