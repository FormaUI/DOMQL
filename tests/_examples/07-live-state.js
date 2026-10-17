const list = document.createElement('ul');

list.innerHTML = '<li data-key="b1">Apples</li><li data-key="b2">Pears</li>';

const live = domql.query(`
    list.children {
        key = self:["data-key"],
        selected = self.aria:["selected"] == "true"
    }
`, { list }).watch({ updateStrategy: 'liveState' });

live.subscribe('change', (sender, args) => {
    if (args.status === 'failed') {
        console.error('The query could not be evaluated.');
        return;
    }

    console.log(args.changes);
});

await live.refreshAsync();
// []

const pears = live.liveState[1];

// For this example only: your app, a UI library or the user changes the page; DOMQL only observes it.
list.children[1].setAttribute('aria-selected', 'true');
await live.refreshAsync();
// [{ op: 'replace', path: '/1/selected', value: true }]

console.log(live.liveState[1] === pears);
// true

live.dispose();
