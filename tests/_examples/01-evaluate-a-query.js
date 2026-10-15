const panel = document.getElementById('panel');

const query = domql.query(`
    @panel {
        count: self.children.count,
        items: self.all("[data-key]") {
            key: self attributeOf "data-key",
            selected: self matches "[aria-selected=true]"
        }
    }
`, { panel });

const snapshot = query.evaluate();
