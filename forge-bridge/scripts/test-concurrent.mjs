// A pending ability menu must not block another game's mulligan, reconnect, or turns.
// node forge-bridge/scripts/test-concurrent.mjs [ws://127.0.0.1:7171/ws]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const peers = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function peer(autoKeep = true) {
  const p = {ws: new WebSocket(endpoint), state: null, seen: new Set()}; peers.push(p);
  p.send = message => p.ws.send(JSON.stringify(message));
  p.ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (message.type !== 'state') return;
    p.state = message;
    const opening = message.input.opening;
    if ((opening === 'play-draw' || (opening === 'mulligan' && autoKeep)) && message.input.ok.enabled && !p.seen.has(message.input.gen)) {
      p.seen.add(message.input.gen); p.send({type: 'ok', gen: message.input.gen});
    }
  });
  await new Promise((resolve, reject) => { p.ws.addEventListener('open', resolve, {once: true}); p.ws.addEventListener('error', reject, {once: true}); });
  return p;
}
async function until(test, label) {
  const start = Date.now();
  while (!test()) { if (Date.now() - start > 15000) throw new Error(`Timeout: ${label}`); await wait(40); }
}
const own = p => p.state.players.find(player => player.id === p.state.you);
const priority = p => p.state?.input.priority && p.state.input.ok.enabled && p.state.activePlayer === p.state.you;
try {
  const a = await peer();
  a.send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Concurrent modal', cards: [{name: 'Mountain', count: 6}, {name: 'Rift Bolt', count: 6}]},
    opponent: {name: 'Land AI', cards: [{name: 'Forest', count: 60}]}});
  await until(() => priority(a), 'first session priority');
  const mountain = own(a).hand.find(card => card.land), rift = own(a).hand.find(card => card.name === 'Rift Bolt');
  a.send({type: 'card', id: mountain.id, gen: a.state.input.gen});
  await until(() => priority(a) && a.state.input.actionable.includes(rift.id), 'first session mana');
  a.send({type: 'card', id: rift.id, gen: a.state.input.gen});
  await until(() => a.state.question?.method === 'getAbilityToPlay', 'pending ability menu');
  const questionId = a.state.question.id, staleGen = a.state.input.gen;
  // A second card click cannot enter the suspended input or replace its unanswered question.
  a.send({type: 'card', id: rift.id, gen: staleGen});
  const b = await peer(false);
  b.send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
    you: {name: 'Concurrent opening', cards: [{name: 'Forest', count: 60}]},
    opponent: {name: 'Land AI', cards: [{name: 'Mountain', count: 60}]}});
  await until(() => b.state?.input.opening === 'mulligan' && b.state.input.ok.enabled, 'other session mulligan while menu waits');
  const session = b.state.session;
  b.ws.close(); await wait(100);
  const rejoined = await peer(false);
  rejoined.send({type: 'rejoin', code: session.code, token: session.token});
  await until(() => rejoined.state?.input.opening === 'mulligan' && rejoined.state.input.ok.enabled, 'opening reconnect');
  rejoined.send({type: 'cancel', gen: rejoined.state.input.gen});
  await until(() => rejoined.state.input.opening === 'mulligan-bottom', 'London bottom selection');
  rejoined.send({type: 'card', id: own(rejoined).hand[0].id, gen: rejoined.state.input.gen});
  await until(() => rejoined.state.input.openingSelected?.length === 1 && rejoined.state.input.ok.enabled, 'bottom choice accepted');
  rejoined.send({type: 'ok', gen: rejoined.state.input.gen});
  await until(() => rejoined.state.input.opening === 'mulligan' && rejoined.state.input.ok.enabled, 'keep smaller hand');
  rejoined.send({type: 'ok', gen: rejoined.state.input.gen});
  await until(() => priority(rejoined), 'other session priority');
  const turn = rejoined.state.turn;
  rejoined.send({type: 'card', id: own(rejoined).hand[0].id, gen: rejoined.state.input.gen});
  await until(() => priority(rejoined) && rejoined.state.turn >= turn + 2, 'other session AI and automatic turn');
  assert.equal(a.state.question.id, questionId);
  const suspend = a.state.question.options.findIndex(option => option.label.includes('Susp'));
  assert.ok(suspend >= 0);
  a.send({type: 'answer', id: questionId, indices: [suspend]});
  await until(() => a.state.input.paying && a.state.input.ok.enabled, 'original question resumes independently');
  assert.notEqual(a.state.input.gen, staleGen);
  a.send({type: 'ok', gen: a.state.input.gen});
  await until(() => own(a).exile.some(card => card.id === rift.id), 'original session completes payment');
  console.log('PASS: unanswered ability menu does not block independent opening/reconnect/mulligan/bottom/priority/AI turns; duplicate click rejected; original question resumes and pays');
} finally {
  for (const p of peers) if (p.ws.readyState === WebSocket.OPEN) p.send({type: 'leave'});
  await wait(200); for (const p of peers) p.ws.close();
}
