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

    /** The names of the event sources reaching each continuous execution, by its declaration as its module holds it. @type {WeakMap<object, ReadonlySet<string>>} */
    static #sources = new WeakMap();

    /**
     * Creates a module from its declarations, keeping each host call's request kind, execution mode and implementation in the table, and giving Nexo the declaration without them, so Nexo resolves and prepares the call and DOMQL alone
     * invokes it. A host call stands among the module's members or within a type, and one declaration standing in several types is kept for each declaration the module makes of it. A host call whose request kind is missing or
     * unknown, an execution whose mode is missing or unknown, an event source given a mode or declaring no result, a member the evaluator invokes given either key, a continuous execution declaring a result, and an `impl`
     * that is no function are refused with a module error naming the declaration, an unnamed indexer as `[]`, as Nexo names it, the type it stands in where it stands in one, and the key; so is a `behavior` on a
     * declaration that reaches none, one naming no continuous execution of the module, and an event source of a behavior given an implementation or parameters, which DOMQL carries out.
     * A member the evaluator invokes declaring a `behavior` reads the state that behavior offers: its implementation receives the instance running for the environment's owner on its receiver, null where none runs.
     * @param {string} name The module's name.
     * @param {object} contents What the module declares.
     * @param {import('./Behaviors.mjs').Behaviors} [behaviors] The behaviors running, which a member reading a behavior's state finds its instance among.
     */
    static createModule(name, contents, behaviors) {
        // Contents Nexo refuses are left to it, which names what is wrong with them.
        if (contents === null || typeof contents !== 'object' || Array.isArray(contents)) {
            return nexo.createModule(name, contents);
        }

        const location = (type, declaration, declarationKey) => ({ module: String(name), ...(type === null ? {} : { type }), declaration: String(declaration), declarationKey });
        const fail = (code, message, type, declaration, key) => {
            throw NexoError.module(code, message, location(type, declaration, key));
        };

        // Each host call the module declares, and each member reading a behavior's state, with its name and the type it stands within, which the declarations reaching a behavior are checked against.
        const described = [];
        const describe = (members, type) => (Array.isArray(members) ? members.map(member => {
            const descriptor = DispatchTable.#createDescriptor(member, type, String(name), (code, message, declaration, key) => fail(code, message, type, declaration, key));

            if (descriptor !== null) {
                described.push({ descriptor, name: member.name, type });
            } else if (member?.behavior !== undefined) {
                described.push({ descriptor: { requestKind: null, executionMode: null, behavior: member.behavior }, name: member.name, type });
            }

            return descriptor;
        }) : null);

        const memberDescriptors = describe(contents.members, null);
        const typeDescriptors = Array.isArray(contents.types) ? contents.types.map(type => describe(type?.members, DispatchTable.#localNameOf(type?.name))) : null;
        const declarationsOf = (members, descriptors) => members.map((member, index) => DispatchTable.#createDeclaration(member, descriptors[index], String(name), behaviors));

        // A behavior is a continuous execution of the module, which each declaration reaching it names.
        const continuous = new Set(described.filter(({ descriptor }) => descriptor.executionMode === 'continuous').map(entry => entry.name));
        const unknown = described.find(({ descriptor }) => descriptor.behavior !== null && !continuous.has(descriptor.behavior));

        if (unknown !== undefined) {
            fail('DOMQL4012', `'${unknown.descriptor.behavior}' is no continuous execution the module '${name}' declares, whose running instance a declaration naming it reaches`, unknown.type, unknown.name, 'behavior');
        }

        const module = nexo.createModule(name, {
            ...contents,
            ...(memberDescriptors === null ? {} : { members: declarationsOf(contents.members, memberDescriptors) }),
            ...(typeDescriptors === null ? {} : { types: contents.types.map((type, index) => (typeDescriptors[index] === null ? type : { ...type, members: declarationsOf(type.members, typeDescriptors[index]) })) }),
        });

        // The event sources reaching each behavior, which its occurrences are delivered to by name.
        const sourcesOf = behavior => Object.freeze(new Set(described.filter(({ descriptor }) => descriptor.requestKind === 'subscription' && descriptor.behavior === behavior).map(entry => entry.name)));

        // A module keeps its types, and the members of each, in the order they were declared.
        const keep = (declarations, descriptors) => declarations?.forEach((declaration, index) => {
            const descriptor = descriptors?.[index];

            if (descriptor != null) {
                DispatchTable.#dispatchDescriptors.set(declaration, descriptor);

                if (descriptor.executionMode === 'continuous') {
                    DispatchTable.#sources.set(declaration, sourcesOf(declaration.name));
                }
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

    /** The names of the event sources of its module that reach a continuous execution, its occurrences' sources; none for any other declaration. */
    static sourcesOf(declaration) {
        return DispatchTable.#sources.get(declaration) ?? DispatchTable.#noSources;
    }

    /** The event sources of a declaration none reaches. */
    static #noSources = Object.freeze(new Set());

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

            if (behavior !== undefined && (typeof behavior !== 'string' || behavior === '')) {
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

        // A command and an event source of occurrences name the behavior they reach; a behavior itself reaches none.
        if (behavior !== undefined && (executionMode === 'continuous' || typeof behavior !== 'string' || behavior === '')) {
            fail('DOMQL4011', DispatchTable.#behaviorRefusal, name, 'behavior');
        }

        // DOMQL carries out a behavior's event source itself, delivering what the behavior hands it.
        if (behavior !== undefined && requestKind === 'subscription') {
            if (impl !== undefined) {
                fail('DOMQL4013', 'An event source of a behavior is carried out by DOMQL, which delivers each occurrence the behavior hands it, so it declares no impl', name, 'impl');
            }

            if (Array.isArray(member.parameters) && member.parameters.length > 0) {
                fail('DOMQL4013', 'An event source of a behavior delivers each occurrence the behavior hands it, which no argument selects, so it declares no parameters', name, 'parameters');
            }
        }

        return { requestKind, executionMode: executionMode ?? null, implementation: impl, type, module, behavior: behavior ?? null };
    }

    /** Why a declaration's `behavior` is refused. */
    static #behaviorRefusal = 'A command, a once execution, an event source of occurrences and a member reading the state a behavior offers name by their behavior the continuous execution of their module whose running instance they reach, and a behavior itself names none';

    /**
     * The declaration Nexo is given: a host call's without what the table keeps of it; a member reading a behavior's state without its `behavior`, its implementation given the instance running for the environment's owner
     * on its receiver, null where none runs; and any other member's as it is.
     */
    static #createDeclaration(member, descriptor, module, behaviors) {
        if (descriptor === null) {
            if (member?.behavior === undefined) {
                return member;
            }

            const { behavior, impl, ...declaration } = member;

            return impl === undefined ? declaration : { ...declaration, impl: input => impl({ ...input, instance: behaviors?.find(module, behavior, input.env?.owner ?? null, input.receiver) ?? null }) };
        }

        const { requestKind, executionMode, impl, behavior, ...declaration } = member;

        return declaration;
    }
}
