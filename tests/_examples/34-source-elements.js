const unreadItems = domql.query('panel.children.where(it["data-unread"] != null) { count = it["data-unread"] }', { panel }).watch();

unreadItems.subscribe('change', (sender, args) => {
    args.value.forEach((item, index) => {
        sender.sourceOf(index).title = `${item.count} unread`;
    });
});

await unreadItems.refreshAsync();
console.log(panel.children[1].title);
// '5 unread'

unreadItems.dispose();
