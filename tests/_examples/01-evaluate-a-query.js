const panel = document.getElementById('panel');

const query = domql.query(`
    panel {
        count = context.children.count,
        items = context.all("[data-key]") {
            key = context:["data-key"],
            selected = context.aria:["selected"] == "true"
        }
    }
`, { panel });

const snapshot = query.evaluate();
