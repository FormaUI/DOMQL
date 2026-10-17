const panel = document.getElementById('panel');

const query = domql.query(`
    @panel {
        count: self.children.count,
        items: self.all("[data-key]") {
            key: self:["data-key"],
            selected: self.aria:["selected"] == "true"
        }
    }
`, { panel });

const snapshot = query.evaluate();
