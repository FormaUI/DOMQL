const activations = domql.query(`
    (@panel eventsOf "click") {
        let item: self.target?.closest("[data-key]"),

        key: item attributeOf "data-key",
        wasSelected: item matches "[aria-selected=true]" ?? false,
        selectedCount: @panel.all("[aria-selected=true]").count
    }
`, { panel }).subscribe((sender, args) => {
    if (args.status === 'failed') {
        console.error('The event could not be projected.');
        return;
    }

    console.log(args.value);
});

panel.querySelector('[data-key="a2"]').click();
// { key: 'a2', wasSelected: true, selectedCount: 1 }

activations.dispose();
