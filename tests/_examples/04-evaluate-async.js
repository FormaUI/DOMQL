const visibleItems = await domql.query(
    '@panel.all("[data-key]").where(self.intersects()).count',
    { panel }
).evaluateAsync();
// 3: every item of the example panel is in view
