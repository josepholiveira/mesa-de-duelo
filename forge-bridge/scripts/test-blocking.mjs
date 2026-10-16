// Real-engine regression: node forge-bridge/scripts/test-blocking.mjs [ws://127.0.0.1:7171/ws]
// Identical copies keep exact identities; a blocker-first UI sends one atomic pair.
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const peers = [];
let attacker, defender;
async function connect(name) {
  const peer = { name, ws: new WebSocket(url), state: null, room: null, seen: new Map(), errors: [] };
  peers.push(peer);
  peer.send = message => peer.ws.send(JSON.stringify(message));
  peer.once = message => {
    const key = JSON.stringify(message);
    if (Date.now() - (peer.seen.get(key) ?? 0) > 1750) { peer.seen.set(key, Date.now()); peer.send(message); }
  };
  peer.ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.type === 'state') peer.state = message;
    if (message.type === 'room') peer.room = message.room;
    if (['error', 'validation-error'].includes(message.type)) peer.errors.push(message);
  });
  await new Promise((resolve, reject) => {
    peer.ws.addEventListener('open', resolve, {once: true}); peer.ws.addEventListener('error', reject, {once: true});
  });
  return peer;
}
async function until(predicate, label, advance) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 45000) throw new Error(`Timeout: ${label}`);
    advance?.(); await wait(60);
  }
}
function advance() {
  for (const peer of peers) {
    const state = peer.state;
    if (!state) continue;
    const input = state.input, me = state.players.find(p => p.id === state.you);
    let message;
    if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) message = {type: 'ok', gen: input.gen};
    else if (state.question) message = state.question.kind === 'confirm'
      ? {type: 'answer', id: state.question.id, value: true} : {type: 'answer', id: state.question.id, indices: [0]};
    else if (input.paying && input.ok.enabled) message = {type: 'ok', gen: input.gen};
    else if (input.priority && input.ok.enabled) {
      if (state.activePlayer === state.you && state.phase === 'MAIN1') {
        if (!attacker && state.players.every(p => p.battlefield.filter(c => c.creature).length >= 2)) {
          attacker = peer; defender = peers.find(p => p !== peer);
        }
        if (attacker === peer) message = {type: 'ok', gen: input.gen};
        else {
          const legal = me.hand.filter(card => input.actionable.includes(card.id));
          const card = legal.find(c => c.land) ?? (me.battlefield.filter(c => c.creature).length < 2 ? legal.find(c => c.creature) : null);
          message = card ? {type: 'card', id: card.id, gen: input.gen} : {type: 'pass-turn', gen: input.gen};
        }
      } else message = {type: 'ok', gen: input.gen};
    } else if (state.phase === 'COMBAT_DECLARE_ATTACKERS' && state.activePlayer === state.you) {
      const card = peer === attacker ? me.battlefield.find(c => c.creature && !state.combat.some(pair => pair.attacker === c.id)) : null;
      message = card ? {type: 'card', id: card.id, gen: input.gen} : input.ok.enabled ? {type: 'ok', gen: input.gen} : null;
    } else if (state.phase === 'CLEANUP') {
      message = input.ok.enabled ? {type: 'ok', gen: input.gen}
        : input.selectable.length ? {type: 'card', id: input.selectable[0], gen: input.gen} : null;
    }
    if (message) peer.once(message);
  }
}
const assigned = (attackerId, blockerId) => defender.state.combat.find(pair => pair.attacker === attackerId)?.blockers.includes(blockerId);
try {
  const a = await connect('Blocking A'), b = await connect('Blocking B');
  const deck = {name: 'Blocking regression', cards: [{name: 'Mountain', count: 6}, {name: 'Raging Goblin', count: 6}]};
  a.send({type: 'host', name: a.name, deck, config: {format: 'free', matchLength: 'bo1'}});
  await until(() => a.room?.code, 'room');
  b.send({type: 'join', code: a.room.code, name: b.name, deck});
  await until(() => defender?.state?.input.blocking, 'two attackers and two blockers', advance);
  const initial = defender.state.input.blocking;
  assert.equal(initial.attackers.length, 2); assert.equal(initial.blockers.length, 2);
  const target = initial.attackers.find(id => id !== initial.selectedAttacker);
  const blocker = initial.blockers[1];
  assert.ok(initial.legalAssignments.find(pair => pair.blocker === blocker).attackers.includes(target));
  const gen = defender.state.input.gen;
  defender.send({type: 'block', attacker: target, blocker});
  defender.send({type: 'block', attacker: target, blocker, gen: gen - 1});
  await wait(250);
  assert.ok(defender.state.combat.every(pair => pair.blockers.length === 0), 'missing/stale generation mutated combat');
  const action = {type: 'block', attacker: target, blocker, gen};
  defender.send(action);
  await until(() => assigned(target, blocker), 'exact second attacker receives block');
  assert.ok(!assigned(initial.selectedAttacker, blocker), 'engine default attacker stole the block');
  defender.send(action); // An old rendered click must not toggle the successful block back off.
  await wait(250); assert.ok(assigned(target, blocker), 'replayed generation removed the block');
  assert.ok(defender.state.input.blocking.legalAssignments.find(pair => pair.blocker === blocker).attackers.includes(target));
  defender.send({type: 'block', attacker: target, blocker, gen: defender.state.input.gen});
  await until(() => !assigned(target, blocker), 'explicit removal');
  defender.send({type: 'block', attacker: initial.selectedAttacker, blocker, gen: defender.state.input.gen});
  await until(() => assigned(initial.selectedAttacker, blocker), 'exact reassignment after removal');
  assert.ok(peers.every(peer => peer.errors.length === 0), JSON.stringify(peers.flatMap(peer => peer.errors)));
  console.log('PASS: identical instances, explicit second-attacker pair, immediate combat assignments, missing/stale generation rejection, replay safety, removal and reassignment');
} finally {
  for (const peer of peers) if (peer.ws.readyState === WebSocket.OPEN) peer.send({type: 'leave'});
  await wait(300); for (const peer of peers) peer.ws.close();
}
