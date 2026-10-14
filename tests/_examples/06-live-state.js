const live = domql.query('{ count: @panel.children.count }', { panel: emptyPanel }).watch({
    updateStrategy: 'liveState'
});

live.subscribe('change', (sender, args) => console.log(args.liveState.count));

await live.refreshAsync();
// 1

emptyPanel.append(document.createElement('div'));
await live.refreshAsync();
// 2

live.dispose();
