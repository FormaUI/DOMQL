domql.query('@panel.children.count', { panel }).evaluate();
// 3

domql.query('@panel["children"].count', { panel }).evaluate();
// 3

domql.query('@panel is "attached"', { panel }).evaluate();
// true
