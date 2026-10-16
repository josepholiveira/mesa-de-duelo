// Real-engine regression: node forge-bridge/scripts/test-suspend.mjs [ws://127.0.0.1:7171/ws] [--decline]
// Both choices remain explicit; checks suspension, upkeep targets, and normal cast.
import assert from 'node:assert/strict';
const ws = new WebSocket(process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'ws://127.0.0.1:7171/ws');
const seen = new Set(), actions = new Map();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = message => ws.send(JSON.stringify(message));
let state, failure, paid = false, targeted = false, sawSuspendChoice = false;
const decline = process.argv.includes('--decline');
ws.addEventListener('message', ({data}) => {
  const message = JSON.parse(data);
  if (message.type === 'error' || message.type === 'validation-error') failure = new Error(JSON.stringify(message));
  if (message.type !== 'state') return;
  state = message;
  if (['play-draw', 'mulligan'].includes(state.input.opening) && state.input.ok.enabled && !seen.has(state.input.gen)) {
    seen.add(state.input.gen); send({type: 'ok', gen: state.input.gen});
  }
});
const own = () => state.players.find(player => player.id === state.you);
const opponent = () => state.players.find(player => player.id !== state.you);
const priority = () => state?.input.priority && state.input.ok.enabled && !state.question;
async function until(test, label, advance = false) {
  const start = Date.now();
  while (!test()) {
    if (failure) throw failure;
    if (Date.now() - start > 25000) throw new Error(`Timeout: ${label}`);
    if (advance) advanceDecisions();
    await wait(60);
  }
}
function advanceDecisions() {
  const q = state.question, input = state.input;
  let action;
  if (input.suspendCast) {
    const id = input.suspendCast.card.id;
    assert.ok(state.suspendedExile.includes(id), 'zero-counter card disappeared during actual cast decision');
    assert.equal(own().exile.find(card => card.id === id)?.counters?.TIME ?? 0, 0);
    assert.ok(!state.playableExile.includes(id), 'Suspend invented a persistent play permission');
    sawSuspendChoice = true;
    action = {type: decline ? 'cancel' : 'ok', gen: input.gen};
  } else if (q?.kind === 'confirm') action = {type: 'answer', id: q.id, value: true};
  else if (q?.kind === 'choose' && q.method !== 'getAbilityToPlay') action = {type: 'answer', id: q.id, indices: [0]};
  else if (!q && ['Sim', 'Yes'].includes(input.ok.label) && input.ok.enabled) action = {type: 'ok', gen: input.gen};
  else if (!q && input.paying && input.ok.enabled) { action = {type: 'ok', gen: input.gen}; paid = true; }
  else if (!q && input.selectablePlayers?.includes(opponent().id)) {
    action = {type: 'player', id: opponent().id, gen: input.gen}; targeted = true;
  } else if (priority()) action = {type: 'ok', gen: input.gen};
  if (!action) return;
  const key = JSON.stringify(action);
  if (Date.now() - (actions.get(key) ?? 0) > 1700) { actions.set(key, Date.now()); send(action); }
}
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, {once: true}); ws.addEventListener('error', reject, {once: true});
});
try {
  // Six of each guarantees both kinds in the first seven and three lands by the third own turn.
  send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Suspend regression', cards: [{name: 'Mountain', count: 6}, {name: 'Rift Bolt', count: 6}]},
    opponent: {name: 'Land AI', cards: [{name: 'Forest', count: 60}]}});
  await until(() => priority() && state.activePlayer === state.you, 'first priority');
  const mountain = own().hand.find(card => card.name === 'Mountain');
  let rift = own().hand.find(card => card.name === 'Rift Bolt');
  assert.ok(mountain && rift);
  send({type: 'card', id: mountain.id, gen: state.input.gen});
  await until(() => own().battlefield.some(card => card.id === mountain.id), 'first land');
  await until(() => priority() && state.input.actionable.includes(rift.id), 'affordable suspend advertised');
  send({type: 'card', id: rift.id, gen: state.input.gen});
  await until(() => state.question || state.input.paying || state.input.targeting, 'alternative ability choice');
  assert.equal(state.question?.method, 'getAbilityToPlay', 'alternative ability was chosen silently');
  assert.equal(state.question.options.length, 2);
  const suspend = state.question.options.findIndex(option => option.label.includes('Susp'));
  assert.ok(suspend >= 0);
  send({type: 'answer', id: state.question.id, indices: [suspend]});
  await until(() => own().exile.some(card => card.id === rift.id && card.counters?.TIME === 1), 'suspend exile and time counter', true);
  assert.ok(paid); assert.equal(own().exile.find(card => card.id === rift.id).counters.TIME, 1);
  assert.ok(state.suspendedExile.includes(rift.id));
  assert.ok(!state.playableExile.includes(rift.id));
  const firstTurn = state.turn;
  if (decline) {
    await until(() => sawSuspendChoice && priority() && state.activePlayer === state.you && state.phase === 'MAIN1', 'declined Suspend reaches normal main phase', true);
    assert.ok(own().exile.some(card => card.id === rift.id));
    assert.ok(!state.suspendedExile.includes(rift.id));
    assert.ok(!state.playableExile.includes(rift.id));
    assert.ok(!state.castable.includes(rift.id));
    assert.equal(opponent().life, 20);
    console.log('PASS: typed zero-counter Suspend choice; decline leaves card in exile without any later free-cast permission');
  } else {
    await until(() => opponent().life === 17, 'next-upkeep cast and resolution', true);
    assert.ok(sawSuspendChoice, 'upkeep cast did not expose typed Suspend decision');
    assert.ok(targeted); assert.ok(state.turn > firstTurn);
    for (let count = 2; count <= 3; count++) {
      await until(() => priority() && state.activePlayer === state.you && state.phase === 'MAIN1'
        && state.input.actionable.some(id => own().hand.some(card => card.id === id && card.land)), `land window ${count}`, true);
      const land = own().hand.find(card => card.land);
      send({type: 'card', id: land.id, gen: state.input.gen});
      await until(() => own().battlefield.filter(card => card.land).length >= count, `land ${count}`);
      if (count === 2) {
        await until(priority, 'priority after second land'); send({type: 'pass-turn', gen: state.input.gen});
      }
    }
    await until(priority, 'priority with three lands');
    rift = own().hand.find(card => card.name === 'Rift Bolt'); assert.ok(rift);
    send({type: 'card', id: rift.id, gen: state.input.gen});
    await until(() => state.question?.method === 'getAbilityToPlay', 'normal-cast choice');
    assert.equal(state.question.options.length, 2);
    const normal = state.question.options.findIndex(option => !option.label.includes('Susp'));
    assert.ok(normal >= 0); send({type: 'answer', id: state.question.id, indices: [normal]});
    await until(() => opponent().life === 14, 'normal cast resolution', true);
    console.log('PASS: both Rift Bolt choices, one-Mountain suspend/payment/time counter, next-upkeep cast/target/damage, three-Mountain normal cast/payment/damage');
  }
} finally {
  if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(300); }
  ws.close();
}
