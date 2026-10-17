const selection = domql.query(`
    @panel.children
        .where(self.aria:["selected"] == "true") {
            key: self:["data-key"]
        }
`, { panel }).watch();

selection.subscribe('change', (sender, args) => {
    if (args.status === 'failed') {
        console.error('The query could not be evaluated.');
        return;
    }

    console.log(args.value.map(item => item.key));
});

await selection.refreshAsync();
// ['a2']

// For this example only: your app, a UI library or the user changes the page; DOMQL only observes it.
panel.children[0].setAttribute('aria-selected', 'true');
await selection.refreshAsync();
// ['a1', 'a2']

panel.children[0].removeAttribute('aria-selected');
await selection.refreshAsync();
// ['a2']

selection.dispose();
