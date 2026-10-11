Domql.read('@panel.children.count', { panel });
// 3

Domql.read('@panel.get("children.count")', { panel });
// 3

Domql.read('@panel is "attached"', { panel });
// true
