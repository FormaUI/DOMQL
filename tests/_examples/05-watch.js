const selection = domql.query(`
    @panel.children
        .where(self attributeOf "aria-selected" is "true") {
            key: self attributeOf "data-key"
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

panel.children[0].setAttribute('aria-selected', 'true');
await selection.refreshAsync();
// ['a1', 'a2']

panel.children[0].removeAttribute('aria-selected');
await selection.refreshAsync();
// ['a2']

selection.dispose();
