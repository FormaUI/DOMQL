const clicks = domql.query(`
    (@panel eventsOf "click") {
        key: self.target?.closest("[data-key]") attributeOf "data-key"
    }
`, { panel }).subscribe((sender, args) => console.log(args.value.key));

panel.querySelector('[data-key="a2"]').click();
// 'a2'

clicks.dispose();
