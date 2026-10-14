const watch = rebound.watch();

watch.subscribe('change', (sender, args) => console.log(args.value));

await watch.refreshAsync();
// 0

emptyPanel.append(document.createElement('div'));
await watch.refreshAsync();
// 1

watch.dispose();
