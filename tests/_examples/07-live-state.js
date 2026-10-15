const livePanel = document.createElement('div');
const live = domql.query('{ count: @panel.children.count }', { panel: livePanel }).watch({
    updateStrategy: 'liveState'
});

live.subscribe('change', (sender, args) => {
    if (args.status === 'failed') {
        console.error('The query could not be evaluated.');
        return;
    }

    console.log(args.liveState.count);
});

await live.refreshAsync();
// 0

livePanel.append(document.createElement('div'));
await live.refreshAsync();
// 1

live.dispose();
