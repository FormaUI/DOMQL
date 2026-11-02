const announce = domql.query('panel.dispatch({ type = "chosen", detail = event.key })', { panel });
let reacted;

const choices = domql.query('panel.on("click") { key = it.target?["data-key"] }', { panel }).subscribe((sender, args) => {
    console.log(args.value);
    reacted = args.reactions[0];
}, { reactions: [announce] });

panel.addEventListener('chosen', event => console.log(event.detail), { once: true });

// For this example only: the user clicks the third item.
panel.querySelector('[data-key="a3"]').click();
// 'a3': the reaction, inside the click
// { key: 'a3' }: then the handler

console.log(await reacted);
// false: no listener cancelled the event the reaction dispatched

choices.dispose();
