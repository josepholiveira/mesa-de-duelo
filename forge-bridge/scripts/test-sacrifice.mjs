// Real-engine regression: node forge-bridge/scripts/test-sacrifice.mjs [ws://127.0.0.1:7171/ws]
import assert from 'node:assert/strict';
const ws = new WebSocket(process.argv[2] || 'ws://127.0.0.1:7171/ws');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = message => ws.send(JSON.stringify(message));
const sent = new Map();
let state, failure;
const own = () => state.players.find(p => p.id === state.you);
const opponent = () => state.players.find(p => p.id !== state.you);
const priority = () => state?.input.priority && state.input.ok.enabled && !state.question;
function once(message) {
  const key = JSON.stringify(message);
  if (Date.now() - (sent.get(key) ?? 0) > 1750) { sent.set(key, Date.now()); send(message); }
}
ws.addEventListener('message', ({data}) => {
  const message = JSON.parse(data);
  if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
  if (message.type !== 'state') return;
  state = message;
  if (['play-draw', 'mulligan'].includes(state.input.opening) && state.input.ok.enabled) once({type: 'ok', gen: state.input.gen});
});
async function until(predicate, label, advance) {
  const start = Date.now();
  while (!predicate()) {
    if (failure) throw failure;
    if (Date.now() - start > 25000) throw new Error(`Timeout ${label}: ${JSON.stringify({input: state?.input, question: state?.question})}`);
    advance?.(); await wait(50);
  }
}
function finish() {
  if (!state) return;
  const input = state.input;
  if (state.question?.kind === 'confirm') once({type: 'answer', id: state.question.id, value: true});
  else if (input.selectablePlayers?.includes(opponent().id)) once({type: 'player', id: opponent().id, gen: input.gen});
  else if (input.paying && input.ok.enabled) once({type: 'ok', gen: input.gen});
  else if (priority()) once({type: 'ok', gen: input.gen});
}
async function chooseSacrifice() {
  await until(priority, 'cast priority');
  const fireblast = own().hand.find(card => card.name === 'Fireblast'); assert.ok(fireblast);
  send({type: 'card', id: fireblast.id, gen: state.input.gen});
  await until(() => state.question?.method === 'getAbilityToPlay', 'explicit alternative cost');
  const alternative = state.question.options.findIndex(option => /sacr/i.test(option.label));
  assert.ok(alternative >= 0, JSON.stringify(state.question.options));
  send({type: 'answer', id: state.question.id, indices: [alternative]});
  await until(() => state.input.selection?.min === 2 && state.input.selection.max === 2, 'two-Mountain selection', finish);
  assert.deepEqual(state.input.selection.cards, []);
  return fireblast.id;
}
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true});
});
try {
  send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Fireblast regression', cards: [{name: 'Mountain', count: 6}, {name: 'Fireblast', count: 6}]},
    opponent: {name: 'Land AI', cards: [{name: 'Forest', count: 60}]}});
  for (let count = 1; count <= 2; count++) {
    await until(() => priority() && state.activePlayer === state.you && state.phase === 'MAIN1'
      && own().hand.some(c => c.land && state.input.actionable.includes(c.id)), `land window ${count}`, finish);
    const land = own().hand.find(c => c.land && state.input.actionable.includes(c.id));
    send({type: 'card', id: land.id, gen: state.input.gen});
    await until(() => own().battlefield.filter(c => c.land).length === count, `land ${count}`);
    if (count === 1) {
      const turn = state.turn;
      await until(() => state.turn > turn, 'next turn', finish);
    }
  }
  const mountains = own().battlefield.filter(c => c.land).map(c => c.id);
  const card = await chooseSacrifice();
  send({type: 'card', id: mountains[0], gen: state.input.gen});
  await until(() => state.input.selection?.cards.includes(mountains[0]), 'first Mountain selected');
  assert.equal(state.input.selection.cards.length, 1);
  assert.ok(!state.input.ok.enabled, 'one Mountain is insufficient');
  send({type: 'card', id: mountains[0], gen: state.input.gen});
  await until(() => state.input.selection?.cards.length === 0, 'same Mountain deselected');
  send({type: 'card', id: mountains[1], gen: state.input.gen});
  await until(() => state.input.selection?.cards.includes(mountains[1]), 'other exact Mountain selected');
  send({type: 'cancel', gen: state.input.gen});
  await until(() => !state.input.selection && own().hand.some(c => c.id === card), 'cancel clears selection and returns spell');
  assert.ok(mountains.every(id => own().battlefield.some(c => c.id === id)));
  assert.equal(opponent().life, 20);
  await chooseSacrifice();
  send({type: 'card', id: mountains[0], gen: state.input.gen});
  await until(() => state.input.selection?.cards.includes(mountains[0]), 'first cost selection');
  const stale = state.input.gen - 1;
  send({type: 'card', id: mountains[1], gen: stale});
  await wait(200); assert.deepEqual(state.input.selection.cards, [mountains[0]]);
  send({type: 'card', id: mountains[1], gen: state.input.gen});
  await until(() => opponent().life === 16 && own().graveyard.filter(c => mountains.includes(c.id)).length === 2,
    'two Mountains sacrificed and four damage resolved', finish);
  assert.equal(state.input.selection, undefined);
  console.log('PASS: Fireblast exact selected Mountain, deselect, cancel rollback, stale selection rejection, two-Mountain sacrifice and four damage');
} finally {
  if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(300); }
  ws.close();
}
