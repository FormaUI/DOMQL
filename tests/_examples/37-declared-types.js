const shortcutsModule = domql.createModule('Shortcuts', {
    types: [{
        name: 'Shortcut',
        kind: 'structured',
        members: [
            { name: 'key', kind: 'property', result: 'String' },
            { name: 'action', kind: 'property', result: 'String' }
        ]
    }],
    members: [{
        name: 'actionFor',
        kind: 'function',
        result: 'String?',
        arguments: 'positional',
        updates: { changes: 'constant', reads: 'fresh' },
        parameters: [
            { name: 'shortcuts', kind: 'value', type: 'List<Shortcut>' },
            { name: 'key', kind: 'value', type: 'String' }
        ],
        impl: ({ args }) => args.shortcuts.find(shortcut => shortcut.key === args.key)?.action ?? null
    }]
});

domql.registerModule(shortcutsModule);

domql.query(
    'import Shortcuts\nShortcuts.actionFor(shortcuts, "Enter")',
    { shortcuts: [{ key: 'Enter', action: 'submit' }] },
    { types: { shortcuts: 'List<Shortcuts.Shortcut>' } }
).evaluate();
// 'submit'
