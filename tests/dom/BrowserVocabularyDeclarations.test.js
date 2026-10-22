import { describe, it, expect } from 'vitest';
import { LexicaModule } from '#lexica/language/vocabulary/LexicaModule.mjs';
import { LexicaRegistry } from '#lexica/language/vocabulary/LexicaRegistry.mjs';
import { Vocabulary } from '#lexica/language/vocabulary/Vocabulary.mjs';
import { BrowserVocabularyDeclarations } from '#domql/dom/BrowserVocabularyDeclarations.mjs';
import { DispatchTable } from '#domql/dom/DispatchTable.mjs';

/** The message an error a call throws carries. */
const messageOf = call => {
    try {
        call();
    } catch (error) {
        return error.message;
    }

    throw new Error('The call threw nothing');
};

/** A property of an element a test module declares. */
const declaration = overrides => ({ name: 'charts', kind: 'property', target: 'Element', result: 'Number', updates: { changes: 'constant', reads: 'fresh' }, ...overrides });

describe('BrowserVocabularyDeclarations', () => {
    const registry = new LexicaRegistry([Vocabulary.module, BrowserVocabularyDeclarations.module]);
    const { module } = BrowserVocabularyDeclarations;
    const names = [
        'size', 'devicePixelRatio', 'rect', 'clientSize', 'grid', 'selection', 'children', 'parent', 'count', 'first', 'last',
        'media', 'is', 'has', 'supports', 'attribute', 'style', 'intersects', 'overlaps', 'matches', 'closest',
        'all', 'item', 'max', 'min', 'sum', 'where', 'on',
    ];

    it('is a module of its own name, made by createModule as any module is, beside Lexica\'s own', () => {
        expect(module.name).toBe('domql');
        expect('isBuiltIn' in module).toBe(false);
        expect(registry.moduleNames).toEqual(['lexica', 'domql']);
    });

    it('declares, with Lexica\'s built-in vocabulary, each member the specification lists', () => {
        expect(names.filter(name => registry.getMembers(name).length === 0)).toEqual([]);
    });

    it('gives every member the evaluator invokes observation coverage and, where partial, what it misses', () => {
        for (const member of module.members.filter(candidate => candidate.invokedBy !== 'host')) {
            expect(member.updates.changes).toBeTypeOf('string');
            expect(member.updates.changes === 'partly-observable' ? member.updates.misses : 'n/a').toBeTruthy();
        }
    });

    it('declares each member once on its target', () => {
        const keys = module.members.map(member => `${member.target}:${member.name}`);

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('declares each test as a Boolean member, a presence test named with has', () => {
        const tests = module.members.filter(member => member.result === 'Boolean' && member.kind === 'property').map(member => `${member.target}.${member.name}`);

        expect(tests).toEqual(['Element.attached', 'Element.hasChildren', 'Element.hasSelection']);
    });

    it('declares the tests of elements, the document, the window and ARIA views as Boolean functions, the state the browser sets rather than one that follows from structure', () => {
        const tests = module.members.filter(member => member.kind === 'function' && member.result === 'Boolean' && member.parameters.length === 0).map(member => `${member.target}.${member.name}()`);

        expect(tests).toEqual([
            'Element.disabled()', 'Element.readonly()', 'Element.textEditable()', 'Element.focus()', 'Element.focusWithin()', 'Element.hover()', 'Element.popoverOpen()', 'Element.checked()',
            'Document.visible()', 'Document.focus()', 'Window.share()', 'Window.clipboard()', 'Aria.checked()', 'Aria.disabled()',
        ]);
    });

    it('declares the document a query runs against and its window as module members of domql, read through its namespace', () => {
        expect(module.members.filter(member => member.target === undefined).map(member => `${member.name}: ${member.result}`)).toEqual(['document: Document', 'window: Window']);
    });

    it('lets one name answer on different receivers', () => {
        expect(registry.getMembers('size').map(member => member.target)).toEqual(['Window', 'Element']);
    });

    it('refuses a module\'s member the DOM vocabulary already answers on the same receiver, a kind of node included', () => {
        expect(messageOf(() => new LexicaRegistry([Vocabulary.module, BrowserVocabularyDeclarations.module, new LexicaModule('size', { members: [declaration({ name: 'size', target: 'Element' })] })]))).toContain('declared already');
        expect(messageOf(() => new LexicaRegistry([Vocabulary.module, BrowserVocabularyDeclarations.module, new LexicaModule('parent', { members: [declaration({ name: 'parent', target: 'ShadowRoot' })] })]))).toContain('declared already');
    });

    it('lets a module beside it declare a member and a Boolean function of any name on an element', () => {
        const charts = new LexicaModule('charts', {
            members: [declaration({ name: 'palette' }), declaration({ name: 'plotted', kind: 'function', result: 'Boolean', parameters: [], updates: { changes: 'unobserved', reads: 'fresh' } })],
        });
        const extended = new LexicaRegistry([Vocabulary.module, BrowserVocabularyDeclarations.module, charts]);

        expect(['palette', 'plotted'].flatMap(name => extended.getMembers(name)).map(member => extended.getOwner(member))).toEqual(['charts', 'charts']);
    });

    it('declares on as the event source of elements, the document and the window, a host call making a subscription, whose fixed type selects through the type selector event', () => {
        const [on] = registry.getMembers('on');

        expect(on).toMatchObject({ kind: 'function', invokedBy: 'host', target: ['Element', 'Document', 'Window'], result: '@selected', parameters: [{ name: 'type', fixed: true, selects: 'type', selector: 'event' }] });
        expect(DispatchTable.get(on)).toMatchObject({ requestKind: 'subscription', executionMode: null });
        expect(module.typeSelectors).toEqual([{ name: 'event' }]);
        expect(module.selectableTypes.map(key => `${key.name}: ${key.type}`)).toEqual([
            'click: PointerEvent', 'pointerdown: PointerEvent', 'pointerup: PointerEvent', 'keydown: KeyboardEvent', 'keyup: KeyboardEvent', 'drop: DragEvent',
            'focus: DomEvent', 'blur: DomEvent', 'input: DomEvent', 'scroll: DomEvent', 'resize: DomEvent',
        ]);
    });

    it('refuses a key a module declares for the type selector event that the DOM vocabulary maps already', () => {
        expect(messageOf(() => new LexicaRegistry([Vocabulary.module, BrowserVocabularyDeclarations.module, new LexicaModule('twice', { selectableTypes: [{ name: 'click', selector: 'event', type: 'DomEvent' }] })]))).toContain("The type selector 'event' maps the key 'click' already, as the module 'domql' declared it");
    });

    describe('observations', () => {
        const members = module.members.filter(member => member.invokedBy !== 'host');
        const covered = declaration => ['observable', 'partly-observable'].includes(declaration.updates.changes);

        it('are named by every member whose changes they cover, and by no other', () => {
            for (const declaration of members) {
                expect(declaration.updates.observations.length > 0, declaration.name).toBe(covered(declaration));
            }
        });

        it('are of types the module declares', () => {
            const types = new Set(module.observationTypes.map(type => type.name));
            const named = members.flatMap(declaration => declaration.updates.observations.map(observation => observation.type));

            expect(named.every(type => types.has(type))).toBe(true);
            expect([...new Set(named)].sort()).toEqual([...types].sort());
        });

        it('observe the window, the document, and the receiver\'s root and roots, the targets the module declares', () => {
            const named = members.flatMap(declaration => declaration.updates.observations.map(observation => observation.of)).filter(of => typeof of === 'string' && of !== 'receiver');

            expect(module.observationTargets).toEqual([{ name: 'window' }, { name: 'document' }, { name: 'root', from: 'receiver' }, { name: 'roots', from: 'receiver', count: 'many' }]);
            expect([...new Set(named)].sort()).toEqual(module.observationTargets.map(target => target.name).sort());
        });

        it('are maintained only for the member that reads maintained values', () => {
            const maintained = members.filter(declaration => declaration.updates.observations.some(observation => registry.getObservationType(observation.type).contract === 'maintained'));

            expect(maintained.map(declaration => declaration.name)).toEqual(['intersects']);
            expect(maintained.every(declaration => declaration.updates.reads === 'maintained')).toBe(true);
        });
    });
});
