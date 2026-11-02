const settled = domql.query('panel.children.where(it["data-unread"] != null).count', { panel }).watch({ schedule: 'delayed', delay: 300 });

settled.subscribe('change', (sender, args) => console.log(args.value));
await settled.readyAsync();
// 2

// For this example only: the page changes; the watch evaluates 300 ms after the last change, or at once when refreshed.
panel.children[2].setAttribute('data-unread', '1');
await settled.refreshAsync();
// 3

settled.dispose();
panel.children[2].removeAttribute('data-unread');
