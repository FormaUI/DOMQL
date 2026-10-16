/**
 * ModuleRegistry — the declarations of every module registered with a DOMQL instance, which requests resolve against
 */

import { ObjectUtils } from '../../common/ObjectUtils.mjs';
import { DomqlError } from '../DomqlError.mjs';
import { Type } from '../Type.mjs';
import { DomqlModule } from './DomqlModule.mjs';

export class ModuleRegistry {
    /** @type {Map<string, import('./DomqlModule.mjs').DomqlModule>} */
    #modules = new Map();

    /** @type {Map<string, object[]>} */
    #members = new Map();

    /** @type {Map<string, object>} */
    #types = new Map();

    /** @type {Map<string, object>} */
    #eventTypes = new Map();

    /** @type {Set<string>} */
    #features = new Set();

    /** @type {Map<string, object>} */
    #observationTypes = new Map();

    /** @type {Map<object, string>} */
    #owners = new Map();

    /** @param {import('./DomqlModule.mjs').DomqlModule[]} modules The modules registered at the start. */
    constructor(modules = []) {
        modules.forEach(module => this.registerModule(module));
    }

    /** The number of modules registered, which changes whenever the vocabulary does. */
    get revision() {
        return this.#modules.size;
    }

    /** The names of the modules registered. */
    get moduleNames() {
        return [...this.#modules.keys()];
    }

    /** Registers a module's declarations, refusing a module whose names are taken or which declares outside its namespace. */
    registerModule(module) {
        if (!DomqlModule.isModule(module)) {
            throw DomqlError.module('A module is registered as createModule makes it', { module: String(module?.name) });
        }

        const fail = (message, declaration) => { throw DomqlError.module(message, declaration === undefined ? { module: module.name } : { module: module.name, declaration }); };

        if (this.#modules.has(module.name)) {
            fail('A module is registered once, and this name is taken');
        }

        const ownTypes = new Set(module.types.map(type => type.name));

        for (const type of module.types) {
            if (this.#types.has(type.name)) {
                fail(`The type '${type.name}' is declared already`, type.name);
            }
        }

        for (const event of module.eventTypes) {
            if (this.#eventTypes.has(event.name)) {
                fail(`The event '${event.name}' is declared already`, event.name);
            }
        }

        for (const type of module.observationTypes) {
            if (this.#observationTypes.has(type.name)) {
                fail(`The observation type '${type.name}' is declared already`, type.name);
            }
        }

        const observationTypes = new Map([...this.#observationTypes, ...module.observationTypes.map(type => [type.name, type])]);

        // Every type a declaration names is one DOMQL defines, one the module declares, wherever it declares it, or one a module registered before it declares.
        const types = new Map([...this.#types, ...module.types.map(type => [type.name, type])]);

        ModuleRegistry.#checkTypeNames(module, types, fail);

        for (const declaration of module.members) {
            ModuleRegistry.#validateObservations(declaration, observationTypes, fail);
        }

        module.members.forEach((declaration, index) => {
            this.#checkNamespace(module, declaration, ownTypes, fail);
            this.#checkCollision(declaration, [...this.getMembers(declaration.name), ...module.members.slice(0, index).filter(other => other.name === declaration.name)], fail);
        });

        this.#modules.set(module.name, module);

        for (const type of module.types) {
            this.#types.set(type.name, type);
        }

        for (const event of module.eventTypes) {
            this.#eventTypes.set(event.name, event);
        }

        module.features.forEach(feature => this.#features.add(feature));

        for (const type of module.observationTypes) {
            this.#observationTypes.set(type.name, type);
            this.#owners.set(type, module.name);
        }

        for (const declaration of module.members) {
            this.#members.set(declaration.name, [...(this.#members.get(declaration.name) ?? []), declaration]);
            this.#owners.set(declaration, module.name);
        }

        return this;
    }

    /** The declarations named so, across every module. */
    getMembers(name) {
        return this.#members.get(name) ?? [];
    }

    /** The structured type declared so, or undefined. */
    getType(name) {
        return this.#types.get(name);
    }

    /** The type of each field named so, as its structured type declares it, across every structured type. */
    getFieldTypes(name) {
        return [...this.#types.values()].flatMap(type => (Object.hasOwn(type.fields, name) ? [type.fields[name]] : []));
    }

    /** The event type declared so, or undefined. */
    getEventType(name) {
        return this.#eventTypes.get(name);
    }

    /** Whether a module declared the feature. */
    hasFeature(name) {
        return this.#features.has(name);
    }

    /** The type of observation declared so, or undefined. */
    getObservationType(name) {
        return this.#observationTypes.get(name);
    }

    /** The name of the module that declared the member. */
    getOwner(declaration) {
        return this.#owners.get(declaration);
    }

    /** The function that carries out the member, or undefined where its module supplies none. */
    getFunction(declaration) {
        return this.#modules.get(this.#owners.get(declaration))?.functions?.[declaration.function];
    }

    /** A module outside the built-in module adds members to its own types, and a single member named for itself to any other. */
    #checkNamespace(module, declaration, ownTypes, fail) {
        if (module.isBuiltIn) {
            return;
        }

        const on = Array.isArray(declaration.on) ? declaration.on : [declaration.on];
        const isOwn = on.every(text => ownTypes.has(ModuleRegistry.#outerTypeNameOf(text)));

        if (!isOwn && declaration.name !== module.name) {
            fail(`A member outside its module's own types is named for the module, '${module.name}'`, declaration.name);
        }
    }

    /** Refuses a type notation in the module's declarations that names a type neither DOMQL nor a module declares. */
    static #checkTypeNames(module, types, fail) {
        const check = (notation, declarationName) => {
            for (const name of ModuleRegistry.#namedTypesOf(Type.parse(notation))) {
                if (!DomqlModule.builtInTypeNames.includes(name) && !types.has(name)) {
                    fail(`'${notation}' names the type '${name}', which neither DOMQL nor a module registered with it declares`, declarationName);
                }
            }
        };

        for (const type of module.types) {
            Object.values(type.fields).forEach(notation => check(notation, type.name));
        }

        module.eventTypes.forEach(eventType => check(eventType.payload, eventType.name));

        for (const declaration of module.members) {
            (Array.isArray(declaration.on) ? declaration.on : [declaration.on]).filter(notation => notation !== 'any').forEach(notation => check(notation, declaration.name));
            check(declaration.result, declaration.name);

            for (const parameter of declaration.parameters) {
                check(parameter.type, declaration.name);

                if (Object.hasOwn(parameter, 'default') && !ModuleRegistry.#admits(parameter.default, Type.parse(parameter.type), types)) {
                    fail(`The default of '${parameter.name}' is no ${parameter.type}`, declaration.name);
                }
            }
        }
    }

    /** The names of the named types a type holds, itself, its items and its fields included. */
    static #namedTypesOf(type) {
        switch (type.kind) {
            case 'named':
                return [type.name];
            case 'list':
            case 'event':
                return ModuleRegistry.#namedTypesOf(type.itemType);
            case 'object':
                return [...type.fieldTypes.values()].flatMap(fieldType => ModuleRegistry.#namedTypesOf(fieldType));
            default:
                return [];
        }
    }

    /** Whether the type admits a default: a value of data, its nullability, its items and a structure's fields as declared, and never a node or an event source. */
    static #admits(value, type, types) {
        if (value === null) {
            return type.isNullable;
        }

        switch (type.kind) {
            case 'typeParameter':
                return value !== undefined;
            case 'list':
                return Array.isArray(value) && value.every(item => ModuleRegistry.#admits(item, type.itemType, types));
            case 'named': {
                if (['number', 'string', 'boolean'].includes(type.name)) {
                    return typeof value === type.name;
                }

                const structure = types.get(type.name);

                return structure !== undefined && ObjectUtils.isNonArrayObject(value)
                    && Object.entries(structure.fields).every(([field, notation]) => ModuleRegistry.#admits(value[field], Type.parse(notation), types));
            }
            default:
                return false;
        }
    }

    /** Refuses an observation of a type no module declares, a maintained observation of a receiver's roots, and a member that reads maintained values without a maintained observation, or any other that has one. */
    static #validateObservations(declaration, observationTypes, fail) {
        let hasMaintained = false;

        for (const observationDeclaration of declaration.observations) {
            const type = observationTypes.get(observationDeclaration.type);

            if (type === undefined) {
                fail(`The observation type '${observationDeclaration.type}' is declared by no module`, declaration.name);
            }

            // A maintained observation gives the member one sample, and a receiver's roots are as many as its ancestry has.
            if (type.contract === 'maintained' && observationDeclaration.of === 'roots') {
                fail(`The maintained observation '${observationDeclaration.type}' gives one sample, so it observes one target, never a receiver's roots`, declaration.name);
            }

            hasMaintained ||= type.contract === 'maintained';
        }

        if ((declaration.reads === 'maintained') !== hasMaintained) {
            fail(declaration.reads === 'maintained' ? 'It reads maintained values, so it names a maintained observation' : 'It names a maintained observation, so it reads maintained values', declaration.name);
        }
    }

    /** Refuses a member a registered member of its name already answers on one of the same receivers. */
    #checkCollision(declaration, others, fail) {
        for (const other of others) {
            for (const mine of Array.isArray(declaration.on) ? declaration.on : [declaration.on]) {
                for (const theirs of Array.isArray(other.on) ? other.on : [other.on]) {
                    if (ModuleRegistry.#overlap(mine, theirs)) {
                        fail(`'${declaration.name}' is declared already for ${theirs}`, declaration.name);
                    }
                }
            }
        }
    }

    static #outerTypeNameOf(text) {
        return Type.parse(text)?.name ?? text;
    }

    static #overlap(first, second) {
        if (first === 'any' || second === 'any') {
            return true;
        }

        return Type.tryMatchType(Type.parse(first), Type.parse(second), new Map()) || Type.tryMatchType(Type.parse(second), Type.parse(first), new Map());
    }
}
