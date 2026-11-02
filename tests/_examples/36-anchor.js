const badge = document.createElement('span');

document.body.append(badge);

const marked = domql.query('badge.ownClass({ name = "busy" })', { badge }).run();
const attached = domql.query('badge.attached', { badge }).watch({ acceptPartialObservation: true });

attached.subscribe('change', (sender, args) => {
    if (args.status === 'ready' && !args.value) {
        marked.dispose();
        attached.dispose();
    }
});

// For this example only: the page removes the element.
badge.remove();
await attached.refreshAsync();
console.log(marked.status);
// 'disposed'
