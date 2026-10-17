/**
 * DomqlModule — a vocabulary's members as data, and the functions that carry them out
 */

import { ObjectUtils } from '../../common/ObjectUtils.mjs';
import { DomqlError } from '../DomqlError.mjs';
import { Names } from '../Names.mjs';
import { Type } from '../Type.mjs';

const MEMBER_KINDS = ['property', 'operation', 'source', 'action', 'behavior'];

/** How a member that is no property is written: called, `self.closest(".row")`, named, `self matches ".row"`, or a named indexer, `self:attribute["data-key"]`. */
const FORMS = ['call', 'infix', 'indexer'];

/** What a member's argument supplies: its one parameter, directly, or every parameter, as the fields of an options object. */
const INPUTS = ['direct', 'options'];

/** How a member changes, as the specification's categories name it, `derived` for a contract that comes from the items and expression a member selects or evaluates. */
const CHANGE_CATEGORIES = ['constant', 'observable', 'partly-observable', 'unobserved', 'derived'];

/** How a member reads, as the specification's modes name it, `derived` for a contract that comes from the items and expression a member selects or evaluates. */
const READING_MODES = ['fresh', 'maintained', 'captured', 'derived'];
const NULL_POLICIES = ['propagate', 'accept'];
const SELECTION_KINDS = ['eventType', 'condition'];
const PARAMETER_KINDS = ['value', 'expression', 'predicate'];

/** What an observation type provides: a signal that an answer may have changed, or a sampled value a member reads. */
const OBSERVATION_CONTRACTS = ['invalidation', 'maintained'];

/** The categories whose changes observations cover. */
const OBSERVED_CHANGE_CATEGORIES = ['observable', 'partly-observable'];

/** What an observation observes, besides a target an argument names. */
const OBSERVATION_TARGETS = ['receiver', 'root', 'roots', 'window', 'document'];

/** The names of the types DOMQL defines, which a declaration names without any module declaring them. */
const BUILT_IN_TYPE_NAMES = ['number', 'string', 'boolean', 'node', 'element', 'document', 'documentFragment', 'shadowRoot', 'shadow', 'aria', 'window'];

/** The names no module declares a type by: those DOMQL defines, and the words of the type notation. */
const RESERVED_TYPE_NAMES = new Set([...BUILT_IN_TYPE_NAMES, 'list', 'event', 'null', 'never']);

/** The types of data DOMQL defines, which a conversion converts between, as it does between them and the structured types modules declare. */
const DATA_TYPE_NAMES = ['number', 'string', 'boolean'];

/** What a module can declare. */
const CONTENTS = ['members', 'types', 'eventTypes', 'observationTypes', 'conversions', 'conditions'];

/** The keys each kind of declaration takes, so one misspelled is refused rather than ignored. */
const MEMBER_KEYS = ['name', 'function', 'kind', 'form', 'input', 'default', 'on', 'parameters', 'result', 'changes', 'reads', 'misses', 'tolerance', 'observations'];
const PARAMETER_KEYS = ['name', 'kind', 'type', 'required', 'default', 'fixed', 'selects', 'nulls', 'context', 'omitted'];
const TYPE_KEYS = ['name', 'fields'];
const EVENT_TYPE_KEYS = ['name', 'payload'];
const OBSERVATION_TYPE_KEYS = ['name', 'contract', 'identity', 'shared', 'function'];
const CONDITION_KEYS = ['name', 'verb', 'function', 'on', 'changes', 'reads', 'misses', 'observations'];

/** The verbs that ask a condition, each its own kind of Boolean question: `is` a state, `has` a possession or a presence, and `supports` a capability. */
export const CONDITION_VERBS = Object.freeze(['is', 'has', 'supports']);

/** How a condition is named: words of letters and digits joined by hyphens, as `focus-within` is, or the name of the module that declares it. */
const CONDITION_NAME = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const CONVERSION_KEYS = ['from', 'to', 'function'];

/** The name that identifies the built-in module, whose members stand without a namespace. */
const BUILTIN_MODULE_NAME = 'builtIn';

export class DomqlModule {
    #name;
    #members;
    #types;
    #eventTypes;
    #observationTypes;
    #conversions;
    #conditions;
    #functions;

    /** Proves a module is the built-in one, which only its own factory can. */
    static #builtInToken = Symbol('built-in');

    /**
     * @param {string} name The module's name, which names its namespace.
     * @param {object} contents What the module declares.
     * @param {object[]} [contents.members] The properties, operations, sources, actions and behaviors it adds.
     * @param {object[]} [contents.types] The structured types it declares, each with its fields.
     * @param {object[]} [contents.eventTypes] The event types it declares, each with the type of its event data.
     * @param {object[]} [contents.observationTypes] The types of observation it declares, each with the function that starts one.
     * @param {object[]} [contents.conversions] The conversions it declares, each from a type of data to another, with the function that converts.
     * @param {object[]} [contents.conditions] The conditions it declares, each a Boolean of its receivers that its verb asks by its name, with the function that tests it and the observations that cover its changes.
     * @param {Record<string, Function> | null} [functions] The functions that carry the members out, by the key each member names.
     * @param {symbol} [builtInToken] Held by the built-in module alone.
     */
    constructor(name, contents = {}, functions = null, builtInToken = undefined) {
        if (!Names.isName(name)) {
            throw DomqlError.module('A module is named as a name is', { module: String(name) });
        }

        if (name === BUILTIN_MODULE_NAME && builtInToken !== DomqlModule.#builtInToken) {
            throw DomqlError.module(`'${BUILTIN_MODULE_NAME}' is the built-in module's identity, which no other module takes`, { module: name });
        }

        const fail = (message, declaration) => { throw DomqlError.module(message, declaration === undefined ? { module: name } : { module: name, declaration }); };

        if (!ObjectUtils.isNonArrayObject(contents)) {
            fail(`A module's contents are an object declaring ${CONTENTS.join(', ')}`);
        }

        if (functions !== null && !ObjectUtils.isNonArrayObject(functions)) {
            fail("A module's functions are an object holding each function by its key");
        }

        const { members = [], types = [], eventTypes = [], observationTypes = [], conversions = [], conditions = [] } = contents;

        for (const [key, list] of Object.entries({ members, types, eventTypes, observationTypes, conversions, conditions })) {
            if (!Array.isArray(list)) {
                fail(`A module's ${key} are a list`);
            }
        }

        // A module declares what it lists alone, and one that names predicates is told that a test is a Boolean member.
        for (const key of Object.keys(contents)) {
            if (!CONTENTS.includes(key)) {
                fail(`A module declares ${CONTENTS.join(', ')}, and '${key}' is none of them${key === 'predicates' ? '; a test is a member that answers a Boolean' : ''}`);
            }
        }

        this.#name = name;
        this.#types = DomqlModule.#freezeItems(types.map(type => DomqlModule.#validateTypeDeclaration(type, fail)));
        this.#members = DomqlModule.#freezeItems(members.map(member => DomqlModule.#validateMember(member, fail)));
        this.#eventTypes = DomqlModule.#freezeItems(eventTypes.map(eventType => DomqlModule.#validateEventType(eventType, fail)));
        this.#observationTypes = DomqlModule.#freezeItems(observationTypes.map(type => DomqlModule.#validateObservationType(type, fail)));
        this.#conversions = DomqlModule.#freezeItems(conversions.map(conversion => DomqlModule.#validateConversion(conversion, fail)));
        this.#conditions = DomqlModule.#freezeItems(conditions.map(condition => DomqlModule.#validateCondition(condition, fail)));

        if (functions !== null) {
            for (const declaration of [...this.#members, ...this.#observationTypes, ...this.#conversions, ...this.#conditions]) {
                if (declaration.function !== undefined && typeof functions[declaration.function] !== 'function') {
                    fail(`The function '${declaration.function}' it names is not among the module's functions`, declaration.name ?? DomqlModule.conversionNameOf(declaration));
                }
            }
        }

        this.#functions = functions;
    }

    /** The built-in module, which declares the built-in vocabulary. */
    static createBuiltIn(contents, functions = null) {
        return new DomqlModule(BUILTIN_MODULE_NAME, contents, functions, DomqlModule.#builtInToken);
    }

    /** Whether the module is the built-in one. */
    get isBuiltIn() {
        return this.#name === BUILTIN_MODULE_NAME;
    }

    /** The module's name. */
    get name() {
        return this.#name;
    }

    /** The members the module adds. */
    get members() {
        return this.#members;
    }

    /** The structured types the module declares. */
    get types() {
        return this.#types;
    }

    /** The event types the module declares. */
    get eventTypes() {
        return this.#eventTypes;
    }

    /** The types of observation the module declares. */
    get observationTypes() {
        return this.#observationTypes;
    }

    /** The conversions the module declares. */
    get conversions() {
        return this.#conversions;
    }

    /** The conditions the module declares. */
    get conditions() {
        return this.#conditions;
    }

    /** The functions that carry the members out, or null for a module that declares and does not yet implement. */
    get functions() {
        return this.#functions;
    }

    /** The names of the types DOMQL defines, which a declaration names without any module declaring them. */
    static get builtInTypeNames() {
        return BUILT_IN_TYPE_NAMES;
    }

    /** The names of the types of data DOMQL defines, which a conversion converts between. */
    static get dataTypeNames() {
        return DATA_TYPE_NAMES;
    }

    /** How a conversion is named where a message names it: its source type and its target, as `string to number`. */
    static conversionNameOf(conversion) {
        return `${conversion.from} to ${conversion.to}`;
    }

    /** Whether the value is a module `createModule` made. */
    static isModule(value) {
        return value instanceof DomqlModule;
    }

    /** Refuses a declaration that is no object, or that names a key its kind does not take. */
    static #validateKeys(declaration, keys, what, fail, name) {
        if (!ObjectUtils.isNonArrayObject(declaration)) {
            fail(`${what} is an object declaring ${keys.join(', ')}`, name === undefined ? undefined : String(name));
        }

        for (const key of Object.keys(declaration)) {
            if (!keys.includes(key)) {
                fail(`${what} declares ${keys.join(', ')}, and '${key}' is none of them`, String(name ?? declaration.name));
            }
        }
    }

    static #freezeItems(items) {
        return Object.freeze(items.map(item => DomqlModule.#deepFreeze(item)));
    }

    static #deepFreeze(value) {
        if (value !== null && typeof value === 'object') {
            Object.values(value).forEach(item => DomqlModule.#deepFreeze(item));
            Object.freeze(value);
        }

        return value;
    }

    static #isIdentifier(text) {
        return typeof text === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(text);
    }

    static #isTypeNotation(notation) {
        return Type.parse(notation) !== null;
    }

    static #validateTypeDeclaration(type, fail) {
        DomqlModule.#validateKeys(type, TYPE_KEYS, 'A type', fail);

        if (!Names.isName(type?.name) || RESERVED_TYPE_NAMES.has(type.name)) {
            fail('A type is named as a name is and takes none of the built-in names', type?.name);
        }

        const fields = Object.entries(type.fields ?? {});

        if (fields.length === 0) {
            fail('A structured type declares at least one field', type.name);
        }

        for (const [name, notation] of fields) {
            if (!Names.isName(name) || !DomqlModule.#isTypeNotation(notation)) {
                fail(`The field '${name}' is not a name with a type`, type.name);
            }
        }

        return structuredClone(type);
    }

    static #validateEventType(eventType, fail) {
        DomqlModule.#validateKeys(eventType, EVENT_TYPE_KEYS, 'An event type', fail);

        if (typeof eventType?.name !== 'string' || !/^[A-Za-z][A-Za-z0-9:-]*$/.test(eventType.name) || !DomqlModule.#isTypeNotation(eventType.payload)) {
            fail('An event type declares the name of the browser event and the type of its event data', eventType?.name);
        }

        return structuredClone(eventType);
    }

    static #validateReceiverTypes(declaration, name, fail) {
        const receiverTypes = Array.isArray(declaration.on) ? declaration.on : [declaration.on];

        if (receiverTypes.length === 0 || receiverTypes.some(notation => notation !== 'any' && !DomqlModule.#isTypeNotation(notation))) {
            fail('It declares the types it applies to', name);
        }
    }

    /** Validates both how a declaration changes and how it reads. */
    static #validateChangeContract(declaration, name, fail) {
        if (!CHANGE_CATEGORIES.includes(declaration.changes) || !READING_MODES.includes(declaration.reads)) {
            fail(`It declares how it changes, one of ${CHANGE_CATEGORIES.join(', ')}, and how it reads, one of ${READING_MODES.join(', ')}`, name);
        }

        if (declaration.changes === 'partly-observable' && (typeof declaration.misses !== 'string' || declaration.misses === '')) {
            fail('A partly observable member states the changes it misses', name);
        }

        if (declaration.tolerance !== undefined && !(Number.isFinite(declaration.tolerance) && declaration.tolerance >= 0)) {
            fail('Its tolerance is a number that is not negative', name);
        }
    }

    /** Validates the observations that cover a declaration's changes: each names its type, what it observes and the arguments its type takes. */
    static #validateObservations(declaration, parameterNames, name, fail) {
        const observations = declaration.observations ?? [];

        if (!Array.isArray(observations)) {
            fail('Its observations are a list', name);
        }

        if (OBSERVED_CHANGE_CATEGORIES.includes(declaration.changes) && observations.length === 0) {
            fail(`It changes as ${declaration.changes}, so it names the observations that cover its changes`, name);
        }

        if (!OBSERVED_CHANGE_CATEGORIES.includes(declaration.changes) && observations.length > 0) {
            fail(`It changes as ${declaration.changes}, so it names no observations`, name);
        }

        for (const observationDeclaration of observations) {
            if (observationDeclaration === null || typeof observationDeclaration !== 'object' || !Names.isName(observationDeclaration.type)) {
                fail('An observation names its type as a name is', name);
            }

            const isTarget = OBSERVATION_TARGETS.includes(observationDeclaration.of) || DomqlModule.#isArgumentReference(observationDeclaration.of, parameterNames);

            if (!isTarget) {
                fail(`The observation '${observationDeclaration.type}' observes the receiver, its root, its roots, the window, the document or an argument of the member, and not '${JSON.stringify(observationDeclaration.of)}'`, name);
            }

            for (const [key, value] of Object.entries(observationDeclaration)) {
                if (key !== 'type' && key !== 'of' && !DomqlModule.#isObservationValue(value, parameterNames)) {
                    fail(`The observation '${observationDeclaration.type}' gives '${key}' a value that is no literal, list of literals or argument of the member`, name);
                }
            }
        }
    }

    static #isArgumentReference(value, parameterNames) {
        return value !== null && typeof value === 'object' && Object.keys(value).length === 1 && typeof value.argument === 'string' && parameterNames.has(value.argument);
    }

    static #isObservationValue(value, parameterNames) {
        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
            return true;
        }

        return Array.isArray(value) ? value.every(item => DomqlModule.#isObservationValue(item, parameterNames)) : DomqlModule.#isArgumentReference(value, parameterNames);
    }

    static #validateObservationType(type, fail) {
        DomqlModule.#validateKeys(type, OBSERVATION_TYPE_KEYS, 'An observation type', fail);

        const identity = type?.identity ?? [];

        if (!Names.isName(type?.name) || !OBSERVATION_CONTRACTS.includes(type.contract)) {
            fail(`An observation type is named as a name is and is one of ${OBSERVATION_CONTRACTS.join(', ')}`, String(type?.name));
        }

        if (!Array.isArray(identity) || !identity.every(argument => DomqlModule.#isIdentifier(argument)) || (type.shared !== undefined && typeof type.shared !== 'boolean')) {
            fail('It names the arguments that belong to the identity of an observation, as identifiers, and whether observations are shared, as a Boolean', type.name);
        }

        if (!DomqlModule.#isIdentifier(type.function)) {
            fail('It names the function that starts it, as an identifier', type.name);
        }

        return structuredClone({ identity: [], shared: true, ...type });
    }

    /**
     * Validates a conversion: the type of data it converts from, the one it converts to, each a name, and the function that converts.
     * A value already of a type converts to itself, as the language says, so no conversion is declared from a type to itself.
     */
    static #validateConversion(conversion, fail) {
        DomqlModule.#validateKeys(conversion, CONVERSION_KEYS, 'A conversion', fail, ObjectUtils.isNonArrayObject(conversion) ? DomqlModule.conversionNameOf(conversion) : undefined);

        const name = DomqlModule.conversionNameOf(conversion);

        for (const key of ['from', 'to']) {
            const typeName = conversion[key];

            if (!Names.isName(typeName) || (RESERVED_TYPE_NAMES.has(typeName) && !DATA_TYPE_NAMES.includes(typeName))) {
                fail(`A conversion is from a type of data to another, each named as it is declared: ${DATA_TYPE_NAMES.join(', ')} or a structured type, and its '${key}' is none of them`, name);
            }
        }

        if (conversion.from === conversion.to) {
            fail('A value already of a type converts to itself, so no conversion is declared from a type to itself', name);
        }

        if (!DomqlModule.#isIdentifier(conversion.function)) {
            fail('It names its function as an identifier', name);
        }

        return structuredClone(conversion);
    }

    /**
     * Validates a condition: its name, the receivers it applies to, the function that tests it, which answers a Boolean, and its own contract, how it changes and reads and the observations that cover its changes, as a member declares them.
     * A condition takes no argument, so an observation names no argument of it.
     */
    static #validateCondition(condition, fail) {
        DomqlModule.#validateKeys(condition, CONDITION_KEYS, 'A condition', fail);

        const name = condition.name;

        if (typeof name !== 'string' || !CONDITION_NAME.test(name)) {
            fail('A condition is named by words of letters and digits joined by hyphens, as focus-within is', String(name));
        }

        if (condition.verb !== undefined && !CONDITION_VERBS.includes(condition.verb)) {
            fail(`A condition is asked by one verb, ${CONDITION_VERBS.join(', ')}, is where it declares none`, name);
        }

        if (!DomqlModule.#isIdentifier(condition.function)) {
            fail('It names its function as an identifier', name);
        }

        DomqlModule.#validateReceiverTypes(condition, name, fail);
        DomqlModule.#validateChangeContract(condition, name, fail);

        // A condition is a Boolean of its receiver, read as it is or kept by an observation; it selects no items and captures no event.
        if (condition.changes === 'derived' || (condition.reads !== 'fresh' && condition.reads !== 'maintained')) {
            fail('A condition changes as constant, observable, partly-observable or unobserved, and reads fresh or maintained', name);
        }
        DomqlModule.#validateObservations(condition, new Set(), name, fail);

        return structuredClone({ verb: 'is', observations: [], ...condition });
    }

    static #validateMember(member, fail) {
        DomqlModule.#validateKeys(member, MEMBER_KEYS, 'A member', fail);

        const name = member.name;

        if (!Names.isName(name) || !MEMBER_KINDS.includes(member.kind)) {
            fail(`A member is named as a name is and is one of ${MEMBER_KINDS.join(', ')}`, String(name));
        }

        // A member whose argument selects a condition is one of the verbs that ask one, carried out by the condition it selects, as that condition declares, so it names no function and changes as what it selects.
        const selectsCondition = Array.isArray(member.parameters) && member.parameters.some(parameter => parameter?.selects === 'condition');

        if (selectsCondition) {
            if (!CONDITION_VERBS.includes(name)) {
                fail(`It selects a condition, so it is one of the verbs that ask one, ${CONDITION_VERBS.join(', ')}`, name);
            }

            if (member.function !== undefined || member.changes !== 'derived' || member.reads !== 'derived') {
                fail('It selects a condition, which carries it out, so it names no function and changes and reads as derived', name);
            }
        } else if (!DomqlModule.#isIdentifier(member.function)) {
            fail('It names its function as an identifier', name);
        }

        DomqlModule.#validateReceiverTypes(member, name, fail);
        DomqlModule.#validateChangeContract(member, name, fail);

        if (!DomqlModule.#isTypeNotation(member.result)) {
            fail('It declares the type of its result', name);
        }

        const parameters = member.parameters ?? [];
        const parameterNames = new Set();

        if (!Array.isArray(parameters)) {
            fail('Its parameters are a list', name);
        }

        DomqlModule.#validateObservations(member, new Set(parameters.map(parameter => parameter?.name)), name, fail);

        for (const parameter of parameters) {
            DomqlModule.#validateParameter(parameter, name, fail);

            if (parameterNames.has(parameter.name)) {
                fail(`The parameter '${parameter.name}' is declared twice`, name);
            }

            parameterNames.add(parameter.name);
        }

        DomqlModule.#validateForm(member, parameters, name, fail);

        // An indexer's one key is its one parameter, so its input is direct.
        return structuredClone({ parameters: [], observations: [], ...(member.kind === 'property' ? {} : { form: 'call' }), ...(member.form === 'indexer' ? { input: 'direct' } : {}), ...member });
    }

    /**
     * Checks how the member is written and what its argument supplies: a property is accessed and takes none, and any other member is a call by default or an infix call, whose input is direct for exactly one parameter or an options object,
     * or an indexer, an operation whose one key is its one parameter, a required value parameter, so its input is direct.
     */
    static #validateForm(member, parameters, name, fail) {
        if (member.default !== undefined && member.form !== 'indexer') {
            fail('Only an indexer is the default of its receivers, which `:[…]` invokes', name);
        }

        if (member.kind === 'property') {
            if (member.form !== undefined || member.input !== undefined || parameters.length > 0) {
                fail('A property is accessed, and declares no form, no input and no parameters', name);
            }

            return;
        }

        if (member.form !== undefined && !FORMS.includes(member.form)) {
            fail(`It is written as ${FORMS.slice(0, -1).join(', ')} or ${FORMS.at(-1)}`, name);
        }

        // Where an infix call's name stands, `to` converts the value before it.
        if (member.form === 'infix' && name === 'to') {
            fail("'to' converts the value before it where an infix call's name stands, so no infix call is named 'to'", name);
        }

        if (member.form === 'indexer') {
            const [parameter] = parameters;

            if (member.kind !== 'operation' || parameters.length !== 1 || parameter.kind !== 'value' || !parameter.required) {
                fail('An indexer is an operation whose key is its one parameter, a required value parameter', name);
            }

            if (member.input !== undefined && member.input !== 'direct') {
                fail("An indexer's key supplies its one parameter, so its input is direct", name);
            }

            if (member.default !== undefined && typeof member.default !== 'boolean') {
                fail('It declares whether it is the default indexer of its receivers as a Boolean', name);
            }

            return;
        }

        if (parameters.length === 0) {
            if (member.input !== undefined) {
                fail('It takes no argument, so it declares no input', name);
            }

            return;
        }

        if (!INPUTS.includes(member.input)) {
            fail(`It declares its input, ${INPUTS.join(' or ')}`, name);
        }

        if (member.input === 'direct' && parameters.length !== 1) {
            fail('A direct input supplies exactly one parameter', name);
        }
    }

    static #validateParameter(parameter, memberName, fail) {
        DomqlModule.#validateKeys(parameter, PARAMETER_KEYS, 'A parameter', fail, memberName);

        if (!Names.isName(parameter.name) || !PARAMETER_KINDS.includes(parameter.kind) || !NULL_POLICIES.includes(parameter.nulls) || typeof parameter.required !== 'boolean') {
            fail('A parameter declares its name, its kind, whether it is required and how it handles null', memberName);
        }

        if (!DomqlModule.#isTypeNotation(parameter.type)) {
            fail(`The parameter '${parameter.name}' declares a type`, memberName);
        }

        if (parameter.required && 'default' in parameter) {
            fail(`The required parameter '${parameter.name}' declares no default`, memberName);
        }

        if ((parameter.kind === 'expression' || parameter.kind === 'predicate') && parameter.context !== 'item') {
            fail(`The ${parameter.kind} parameter '${parameter.name}' declares its evaluation context, item`, memberName);
        }

        // A predicate's expression gives any value, and its function receives that value's truthiness.
        if (parameter.kind === 'predicate' && parameter.type !== 'boolean') {
            fail(`The predicate parameter '${parameter.name}' is of type boolean, the truthiness its function receives`, memberName);
        }

        if (parameter.fixed !== undefined && typeof parameter.fixed !== 'boolean') {
            fail(`The parameter '${parameter.name}' declares whether it is fixed as a Boolean`, memberName);
        }

        if (parameter.fixed !== true) {
            if (parameter.selects !== undefined) {
                fail(`The parameter '${parameter.name}' selects nothing, since it is not fixed`, memberName);
            }

            return;
        }

        if (!SELECTION_KINDS.includes(parameter.selects)) {
            fail(`The fixed parameter '${parameter.name}' declares what it selects, one of ${SELECTION_KINDS.join(', ')}`, memberName);
        }

        // A fixed argument names a declaration, which only a string can.
        if (parameter.kind !== 'value' || parameter.type !== 'string') {
            fail(`The fixed parameter '${parameter.name}' is a value parameter of type string, since it names what it selects`, memberName);
        }
    }
}
