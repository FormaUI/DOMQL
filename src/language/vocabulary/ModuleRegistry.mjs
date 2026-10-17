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

    /** @type {Map<string, object>} */
    #observationTypes = new Map();

    /** Each condition, by its name, a name naming one for each of the receivers it applies to. @type {Map<string, object[]>} */
    #conditions = new Map();

    /** Each conversion, by its source type and then its target. @type {Map<string, Map<string, object>>} */
    #conversions = new Map();

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

        for (const declaration of [...module.members, ...module.conditions]) {
            ModuleRegistry.#validateObservations(declaration, observationTypes, fail);
        }

        module.conditions.forEach((condition, index) => {
            // A module adds conditions to its own types, and a single condition named for itself to any other, as it does members.
            if (!module.isBuiltIn && ![condition.on].flat().every(text => ownTypes.has(ModuleRegistry.#outerTypeNameOf(text))) && condition.name !== module.name) {
                fail(`A condition outside its module's own types is named for the module, '${module.name}'`, condition.name);
            }

            this.#checkCollision(condition, [...this.getConditions(condition.name), ...module.conditions.slice(0, index).filter(other => other.name === condition.name)], fail, 'condition');
        });

        module.members.forEach((declaration, index) => {
            this.#checkNamespace(module, declaration, ownTypes, fail);
            this.#checkCollision(declaration, [...this.getMembers(declaration.name), ...module.members.slice(0, index).filter(other => other.name === declaration.name)], fail);

            // A receiver has one default indexer at most, so `:[…]` names one indexer for it.
            if (declaration.default === true) {
                for (const other of [...this.getDefaultIndexers(), ...module.members.slice(0, index).filter(earlier => earlier.default === true)]) {
                    const overlapping = [declaration.on].flat().find(mine => [other.on].flat().some(theirs => ModuleRegistry.#overlap(mine, theirs)));

                    if (overlapping !== undefined) {
                        fail(`'${other.name}' is the default indexer of ${overlapping} already`, declaration.name);
                    }
                }
            }
        });

        module.conversions.forEach((conversion, index) => {
            const name = DomqlModule.conversionNameOf(conversion);

            for (const typeName of [conversion.from, conversion.to]) {
                if (!ModuleRegistry.#isData(Type.createNamedType(typeName), types, new Set())) {
                    fail(`'${typeName}' is no type of data DOMQL or a module registered with it declares, which a conversion converts between`, name);
                }
            }

            // A module outside the built-in one converts to or from a type of its own.
            if (!module.isBuiltIn && !ownTypes.has(conversion.from) && !ownTypes.has(conversion.to)) {
                fail("A conversion outside the built-in module converts to or from one of its module's own types", name);
            }

            // A conversion is declared once across the registry, whatever its module owns; types of data have no subtypes, so two sources overlap where they are one type.
            if (this.getConversion(conversion.from, conversion.to) !== undefined || module.conversions.slice(0, index).some(other => other.from === conversion.from && other.to === conversion.to)) {
                fail(`The conversion from ${conversion.from} to ${conversion.to} is declared already`, name);
            }
        });

        this.#modules.set(module.name, module);

        for (const type of module.types) {
            this.#types.set(type.name, type);
        }

        for (const event of module.eventTypes) {
            this.#eventTypes.set(event.name, event);
        }

        for (const type of module.observationTypes) {
            this.#observationTypes.set(type.name, type);
            this.#owners.set(type, module.name);
        }

        for (const declaration of module.members) {
            this.#members.set(declaration.name, [...(this.#members.get(declaration.name) ?? []), declaration]);
            this.#owners.set(declaration, module.name);
        }

        for (const condition of module.conditions) {
            this.#conditions.set(condition.name, [...this.getConditions(condition.name), condition]);
            this.#owners.set(condition, module.name);
        }

        for (const conversion of module.conversions) {
            if (!this.#conversions.has(conversion.from)) {
                this.#conversions.set(conversion.from, new Map());
            }

            this.#conversions.get(conversion.from).set(conversion.to, conversion);
            this.#owners.set(conversion, module.name);
        }

        return this;
    }

    /** The declarations named so, across every module. */
    getMembers(name) {
        return this.#members.get(name) ?? [];
    }

    /** The conditions named so, across every module, each for the receivers it applies to. */
    getConditions(name) {
        return this.#conditions.get(name) ?? [];
    }

    /** The names of every member declared, across every module. */
    get memberNames() {
        return [...this.#members.keys()];
    }

    /** The names of every condition declared, across every module. */
    get conditionNames() {
        return [...this.#conditions.keys()];
    }

    /** The indexers declared the default of their receivers, across every module. */
    getDefaultIndexers() {
        return [...this.#members.values()].flat().filter(declaration => declaration.default === true);
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

    /** The type of observation declared so, or undefined. */
    getObservationType(name) {
        return this.#observationTypes.get(name);
    }

    /** The conversion declared from the one type to the other, or undefined. */
    getConversion(from, to) {
        return this.#conversions.get(from)?.get(to);
    }

    /** The types a value of the type converts to through a declared conversion. */
    getConversionTargets(from) {
        return [...(this.#conversions.get(from)?.keys() ?? [])];
    }

    /** Whether the type is one a conversion converts between: a type of data DOMQL defines, or a structured type that holds data alone. */
    isConvertible(typeName) {
        return ModuleRegistry.#isData(Type.createNamedType(typeName), this.#types, new Set());
    }

    /** The name of the module that declared the member. */
    getOwner(declaration) {
        return this.#owners.get(declaration);
    }

    /** The function that carries out the member or the conversion, or undefined where its module supplies none. */
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

        for (const condition of module.conditions) {
            [condition.on].flat().filter(notation => notation !== 'any').forEach(notation => check(notation, condition.name));
        }

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

    /** Whether values of the type are data, a structured type's fields included; a structure already being checked counts as data where it holds itself, since its other fields are checked where it is first met. */
    static #isData(type, types, checking) {
        switch (type.kind) {
            case 'list':
                return ModuleRegistry.#isData(type.itemType, types, checking);
            case 'named': {
                if (DomqlModule.dataTypeNames.includes(type.name) || checking.has(type.name)) {
                    return true;
                }

                const structure = types.get(type.name);

                if (structure === undefined) {
                    return false;
                }

                checking.add(type.name);

                return Object.values(structure.fields).every(notation => ModuleRegistry.#isData(Type.parse(notation), types, checking));
            }
            default:
                return false;
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

    /** Refuses a member, or a condition, that a registered one of its name already answers on one of the same receivers. */
    #checkCollision(declaration, others, fail, what = 'member') {
        for (const other of others) {
            for (const mine of Array.isArray(declaration.on) ? declaration.on : [declaration.on]) {
                for (const theirs of Array.isArray(other.on) ? other.on : [other.on]) {
                    if (ModuleRegistry.#overlap(mine, theirs)) {
                        fail(`${what === 'condition' ? 'The condition ' : ''}'${declaration.name}' is declared already for ${theirs}`, declaration.name);
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
