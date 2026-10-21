/**
 * DispatchTable — what DOMQL keeps of each host call a module declares, which Lexica leaves to its host: the request it makes, an execution's mode, and the implementation that carries it out
 */

import { lexica, LexicaError } from '@formaui/lexica';

/** The requests a host call makes: a subscription to an event source, or an execution. */
const REQUEST_KINDS = ['subscription', 'execution'];

/** How an execution runs: once, answering its result, or continuously, until it is updated or disposed. */
const EXECUTION_MODES = ['once', 'continuous'];

/**
 * What DOMQL keeps of a host call: the request it makes, its mode where it is an execution, and the implementation that carries it out, which a declaration resolved against and never carried out leaves out.
 * @typedef {{ requestKind: 'subscription' | 'execution', executionMode: 'once' | 'continuous' | null, implementation: Function | undefined }} DispatchDescriptor
 */

export class DispatchTable {
    /** Each host call's dispatch descriptor, by its declaration as its module holds it. @type {WeakMap<object, DispatchDescriptor>} */
    static #dispatchDescriptors = new WeakMap();

    /**
     * Creates a module from its declarations, keeping each host call's request kind, execution mode and implementation in the table, and giving Lexica the declaration without them, so Lexica resolves and prepares the call and DOMQL alone
     * invokes it. A host call whose request kind is missing or unknown, an execution whose mode is missing or unknown, an event source given a mode or declaring no result, a function the evaluator invokes given either field, and a continuous
     * execution declaring a result are refused with a module error naming the declaration and the field.
     * @param {string} name The module's name.
     * @param {object} contents What the module declares.
     */
    static createModule(name, contents) {
        const members = Array.isArray(contents?.members) ? contents.members : null;

        // Contents Lexica refuses are left to it, which names what is wrong with them.
        if (members === null) {
            return lexica.createModule(name, contents);
        }

        const fail = (message, declaration, field) => {
            throw LexicaError.module(message, { module: String(name), declaration: String(declaration), field });
        };

        const dispatchDescriptors = members.map(member => DispatchTable.#createDescriptor(member, fail));
        const module = lexica.createModule(name, { ...contents, members: members.map((member, index) => DispatchTable.#createDeclaration(member, dispatchDescriptors[index])) });

        // A module keeps its members in the order they were declared.
        module.members.forEach((declaration, index) => {
            if (dispatchDescriptors[index] !== null) {
                DispatchTable.#dispatchDescriptors.set(declaration, dispatchDescriptors[index]);
            }
        });

        return module;
    }

    /** The dispatch descriptor the table keeps for the host call's declaration, undefined for any other declaration and for a host call no module of DOMQL's made. */
    static get(declaration) {
        return DispatchTable.#dispatchDescriptors.get(declaration);
    }

    /** The dispatch descriptor the table keeps of the member, null for a member the evaluator invokes, refusing the fields its kind of request does not take. */
    static #createDescriptor(member, fail) {
        if (member === null || typeof member !== 'object') {
            return null;
        }

        const { name, invokedBy, requestKind, executionMode, implementation, result } = member;

        if (invokedBy !== 'host') {
            for (const [field, value] of [['requestKind', requestKind], ['executionMode', executionMode]]) {
                if (value !== undefined) {
                    fail(`A function the evaluator invokes makes no request of its own, so it declares no ${field}; a host call says invokedBy: 'host'`, name, field);
                }
            }

            return null;
        }

        if (!REQUEST_KINDS.includes(requestKind)) {
            fail(`A host call declares the request it makes, requestKind ${REQUEST_KINDS.map(kind => `'${kind}'`).join(' or ')}`, name, 'requestKind');
        }

        if (requestKind === 'subscription') {
            if (executionMode !== undefined) {
                fail('An event source is listened to for as long as it is subscribed to, so it declares no executionMode', name, 'executionMode');
            }

            if (result === undefined) {
                fail('An event source declares the type of each event it delivers, which its subscription projects', name, 'result');
            }
        } else {
            if (!EXECUTION_MODES.includes(executionMode)) {
                fail(`An execution declares how it runs, executionMode ${EXECUTION_MODES.map(mode => `'${mode}'`).join(' or ')}`, name, 'executionMode');
            }

            if (executionMode === 'continuous' && result !== undefined) {
                fail('A continuous execution runs until it is updated or disposed and answers no result, so it declares none', name, 'result');
            }
        }

        if (implementation !== undefined && typeof implementation !== 'function') {
            fail('Its implementation is a function', name, 'implementation');
        }

        return { requestKind, executionMode: executionMode ?? null, implementation };
    }

    /** The declaration Lexica is given: a host call's without what the table keeps of it, and any other member's as it is. */
    static #createDeclaration(member, descriptor) {
        if (descriptor === null) {
            return member;
        }

        const { requestKind, executionMode, implementation, ...declaration } = member;

        return declaration;
    }
}
