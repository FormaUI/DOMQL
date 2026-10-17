const countQuery = domql.query('panel.children.count', { panel });

countQuery.evaluate();
// 3

const emptyPanel = document.createElement('div');
const rebound = countQuery.with({ panel: emptyPanel });

rebound.evaluate();
// 0
