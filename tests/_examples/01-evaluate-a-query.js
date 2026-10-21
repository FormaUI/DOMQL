const panel = document.getElementById('panel');

const query = domql.query(`
    panel {
        count = it.children.count,
        items = it.all("[data-key]") {
            key = it:["data-key"],
            selected = it.aria:["selected"] == "true"
        }
    }
`, { panel });

const snapshot = query.evaluate();
