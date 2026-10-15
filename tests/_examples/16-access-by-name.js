domql.query('@panel[@name].count', {
    panel,
    name: 'children'
}).evaluate();
// 3
