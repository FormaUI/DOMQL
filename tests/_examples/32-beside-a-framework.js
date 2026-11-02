const dragging = domql.query('panel.ownClass({ name = "dragging", keep = true })', { panel }).run();
const status = domql.query('item.ownText({ value = text })', { item: panel.children[0], text: '2 unread' }).run();

// For this example only: a framework renders the panel's class attribute again, dropping a class it doesn't know.
panel.className = 'rendered';
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
console.log(panel.className);
// 'rendered dragging'
console.log(panel.children[0].textContent);
// '2 unread'

dragging.dispose();
status.dispose();
