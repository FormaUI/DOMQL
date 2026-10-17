const activations = domql.query(`
    panel.on("click") {
        let item = self.target?.closest("[data-key]"),

        key = item?:["data-key"],
        wasSelected = item?.aria:["selected"] == "true",
        selectedCount = panel.all("[aria-selected=true]").count
    }
`, { panel }).subscribe((sender, args) => {
    if (args.status === 'failed') {
        console.error('The event could not be projected.');
        return;
    }

    console.log(args.value);
});

// For this example only: the user clicks the second item; DOMQL only listens.
panel.querySelector('[data-key="a2"]').click();
// { key: 'a2', wasSelected: true, selectedCount: 1 }

activations.dispose();
