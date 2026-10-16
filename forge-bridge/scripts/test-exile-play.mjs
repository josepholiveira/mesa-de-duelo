// Real-engine regression: node forge-bridge/scripts/test-exile-play.mjs [ws://127.0.0.1:7171/ws]
// Two human seats hold the opponent's turn so temporary exile permission is observable.
import assert from 'node:assert/strict';

const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clients = [];
let failure;
function connect(name) {
  const ws = new WebSocket(url);
  const client = { ws, name, state: null, room: null, opening: new Set(), actions: new Map() };
  client.send = message => ws.send(JSON.stringify(message));
  client.sendOnce = message => {
    const key = JSON.stringify(message);
    if (Date.now() - (client.actions.get(key) ?? 0) < 1800) return;
    client.actions.set(key, Date.now()); client.send(message);
  };
  client.ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
    if (message.type === 'room') client.room = message.room;
    if (message.type !== 'state') return;
    client.state = message;
    const input = message.input;
    if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled && !client.opening.has(input.gen)) {
      client.opening.add(input.gen);
      client.send({type: input.opening === 'play-draw' && name === 'Peer' ? 'cancel' : 'ok', gen: input.gen});
    }
  });
  clients.push(client);
  return client;
}
const player = client => client.state?.players.find(p => p.id === client.state.you);
const priority = client => client.state?.input.priority && client.state.input.ok.enabled && !client.state.question;
const ownMain = client => priority(client) && client.state.activePlayer === client.state.you && client.state.phase === 'MAIN1';
async function until(test, label, advance) {
  const started = Date.now();
  while (!test()) {
    if (failure) throw failure;
    if (Date.now() - started > 25000) throw new Error(`Timeout: ${label}; ${JSON.stringify(clients.map(c => ({
      seat: c.name, turn: c.state?.turn, phase: c.state?.phase, active: c.state?.activePlayer, you: c.state?.you,
      input: c.state?.input, question: c.state?.question?.method, lands: player(c)?.battlefield.filter(card => card.land).length,
    })))}`);
    advance?.();
    await sleep(50);
  }
}
function pass(client) {
  const state = client.state;
  if (!state) return;
  if (state.phase === 'CLEANUP' && state.input.selectable.length) {
    client.sendOnce({type: 'card', id: state.input.selectable[0], gen: state.input.gen});
  } else if (state.phase === 'CLEANUP' && state.input.ok.enabled) {
    client.sendOnce({type: 'ok', gen: state.input.gen});
  } else if (priority(client)) {
    client.sendOnce({type: state.activePlayer === state.you && !state.stack.length ? 'pass-turn' : 'ok', gen: state.input.gen});
  }
}
function finishCast(client) {
  const state = client.state;
  if (!state) return;
  assert.equal(state.question, undefined, 'Reckless Impulse must not ask to play exiled cards as a queued choice');
  if (state.input.paying && state.input.ok.enabled) client.sendOnce({type: 'ok', gen: state.input.gen});
  else if (priority(client)) client.sendOnce({type: 'ok', gen: state.input.gen});
}

const host = connect('Host'), peer = connect('Peer');
try {
  await Promise.all(clients.map(c => c.ready));
  host.send({type: 'host', name: 'Exile regression', config: {format: 'free', matchLength: 'bo1'},
    deck: {name: 'Impulse regression', cards: [{name: 'Mountain', count: 6}, {name: 'Reckless Impulse', count: 6}]}});
  await until(() => host.room?.code, 'room');
  peer.send({type: 'join', name: 'Peer', code: host.room.code,
    deck: {name: 'Forest regression', cards: [{name: 'Forest', count: 60}]}});

  for (let count = 1; count <= 2; count++) {
    await until(() => ownMain(host) && host.state.input.actionable.some(id => player(host).hand.some(c => c.id === id && c.land)),
      `land window ${count}`, () => { pass(peer); if (priority(host) && !ownMain(host)) host.sendOnce({type: 'ok', gen: host.state.input.gen}); });
    const land = player(host).hand.find(c => c.land && host.state.input.actionable.includes(c.id));
    host.send({type: 'card', id: land.id, gen: host.state.input.gen});
    await until(() => player(host).battlefield.filter(c => c.land).length === count, `land ${count}`);
    if (count === 1) {
      await until(() => ownMain(peer), 'first opponent turn', () => { pass(host); });
      pass(peer);
    }
  }

  await until(() => ownMain(host), 'Impulse cast window');
  const impulse = player(host).hand.find(c => c.name === 'Reckless Impulse');
  assert.ok(impulse);
  host.send({type: 'card', id: impulse.id, gen: host.state.input.gen});
  await until(() => player(host).exile.length === 2 && !host.state.stack.length && player(host).graveyard.some(c => c.id === impulse.id),
    'Impulse resolution grants permission', () => { finishCast(host); if (priority(peer) && !ownMain(peer)) pass(peer); });
  const original = player(host).exile.map(c => c.id);
  assert.ok(original.every(id => host.state.playableExile?.includes(id)), 'unexpired exile permission is missing while mana is spent');
  assert.ok(player(host).battlefield.filter(c => c.land).every(c => c.tapped), 'Impulse must spend both Mountains');

  await until(() => ownMain(peer), 'held opponent turn', () => { pass(host); });
  await until(() => host.state.activePlayer === peer.state.you, 'viewer receives opponent turn');
  assert.ok(original.every(id => host.state.playableExile.includes(id)), 'permission disappears during the opponent turn');
  assert.ok(original.every(id => !host.state.castable.includes(id)), 'sorceries and lands must not become playable during the opponent turn');
  assert.equal(host.state.question, undefined);
  pass(peer);

  await until(() => ownMain(host), 'next own turn', () => { pass(peer); });
  const chosen = player(host).exile.find(c => original.includes(c.id) && c.land)
    ?? player(host).exile.find(c => original.includes(c.id));
  const unplayed = original.find(id => id !== chosen.id);
  assert.ok(host.state.castable.includes(chosen.id), 'permitted exile card is not directly playable');
  host.send({type: 'card', id: chosen.id, gen: host.state.input.gen});
  await until(() => !player(host).exile.some(c => c.id === chosen.id), 'direct play from exile', () => {
    finishCast(host); if (priority(peer) && !ownMain(peer)) pass(peer);
  });
  if (!chosen.land) await until(() => !host.state.stack.length && player(host).graveyard.some(c => c.id === chosen.id),
    'exiled spell resolves', () => { finishCast(host); if (priority(peer) && !ownMain(peer)) pass(peer); });

  await until(() => ownMain(peer), 'opponent turn after expiry', () => { pass(host); });
  await until(() => !host.state.playableExile.includes(unplayed), 'permission expires');
  assert.ok(player(host).exile.some(c => c.id === unplayed), 'expiry must not delete the card from exile');
  assert.ok(!host.state.castable.includes(unplayed), 'expired card remains playable');
  console.log('PASS: Impulse permissions persist without mana and through opponent turn; direct exile play works; unused permission expires without removing the exiled card');
} finally {
  for (const client of clients) if (client.ws.readyState === WebSocket.OPEN) client.send({type: 'leave'});
  await sleep(300);
  for (const client of clients) client.ws.close();
}
