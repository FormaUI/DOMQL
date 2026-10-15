domql.query('@panel.children.count', { panel }).evaluate();
// 3

domql.query('@panel["children"].count', { panel }).evaluate();
// 3

domql.query('@panel.attached', { panel }).evaluate();
// true
