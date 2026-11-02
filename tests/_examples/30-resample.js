const sentinel = domql.query('{ nearEnd = panel.children.last?.intersects() }', { panel }).watch();

await sentinel.readyAsync();

// After a load appends items, take where the browser reports the last one now.
await sentinel.refreshAsync({ resample: true });
console.log(sentinel.snapshot);
// { nearEnd: true }

sentinel.dispose();
