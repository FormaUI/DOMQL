const visibleItems = await domql.query(
    'panel.all("[data-key]").where(context.intersects()).count',
    { panel }
).evaluateAsync();
// 3: every item of the example panel is in view
