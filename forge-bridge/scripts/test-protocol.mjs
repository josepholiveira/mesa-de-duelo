// Integration against a running bridge: node forge-bridge/scripts/test-protocol.mjs [ws://127.0.0.1:7171/ws]
// Uses isolated rooms, exits by leaving them, and never prints reconnection credentials.
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7171/ws';
const peers = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function peer(mulliganOnce = false) {
  const p = { ws: new WebSocket(endpoint), messages: [], state: null, automatic: true, mulliganOnce, bottomPicked: false, openings: new Set(), seen: new Set(), maxSeq: 0 };
  peers.push(p);
  p.send = value => p.ws.send(JSON.stringify(value));
  p.ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data); p.messages.push(message);
    if (message.type !== 'state') return;
    p.state = message;
    for (const e of message.events ?? []) {
      if (p.matchId === message.matchId) assert.ok(e.seq > p.maxSeq, 'event replay or reordered sequence');
      else { p.matchId = message.matchId; p.maxSeq = 0; }
      p.maxSeq = e.seq;
      if (e.type === 'draw') assert.ok(!e.card && !e.sourceId, 'draw leaks hidden identity');
      if (e.frame) for (const player of e.frame.players) assert.ok(!('hand' in player), 'frame leaks private hand');
    }
    const q = message.question;
    if (p.automatic && q && !p.seen.has(q.id)) {
      p.seen.add(q.id);
      const value = q.kind === 'confirm' ? { value: true } : q.kind === 'text' ? { text: q.initial || '0' }
        : { indices: Array.from({ length: q.kind === 'order' ? q.options.length : Math.max(0, q.min ?? 1) }, (_, i) => i) };
      p.send({ type: 'answer', id: q.id, ...value });
    }
    const opening = message.input?.opening;
    if (opening) p.openings.add(opening);
    if (opening === 'mulligan') assert.ok(message.players.some(player => player.id === message.input.openingStartingPlayer));
    if (opening === 'mulligan-bottom') {
      assert.equal(message.input.openingReturnCount, 1);
      assert.equal(message.input.openingReturnRemaining, 1 - message.input.openingSelected.length);
    }
    if (p.automatic && ['play-draw', 'mulligan'].includes(opening)) {
      const key = `keep:${message.input.gen}`;
      if (!p.seen.has(key) && message.input.ok.enabled) {
        p.seen.add(key);
        const redraw = opening === 'mulligan' && p.mulliganOnce;
        if (redraw) p.mulliganOnce = false;
        p.send({ type: redraw ? 'cancel' : 'ok', gen: message.input.gen });
      }
    } else if (p.automatic && opening === 'mulligan-bottom') {
      if (!p.bottomPicked) {
        p.bottomPicked = true;
        const card = message.players.find(player => player.id === message.you).hand[0];
        p.send({type: 'card', id: card.id, gen: message.input.gen});
      } else if (message.input.ok.enabled && !p.seen.has(`bottom:${message.input.gen}`)) {
        p.seen.add(`bottom:${message.input.gen}`); p.send({type: 'ok', gen: message.input.gen});
      }
    }
    // Explicit end-turn must still stop for mandatory cleanup choices.
    if (p.automatic && message.phase === 'CLEANUP' && !q) {
      const key = `cleanup:${message.input.gen}`;
      if (!p.seen.has(key) && (message.input.ok.enabled || message.input.selectable.length)) {
        p.seen.add(key);
        p.send(message.input.ok.enabled ? {type: 'ok', gen: message.input.gen}
          : {type: 'card', id: message.input.selectable[0], gen: message.input.gen});
      }
    }
  });
  await new Promise((resolve, reject) => { p.ws.addEventListener('open', resolve, { once: true }); p.ws.addEventListener('error', reject, { once: true }); });
  return p;
}
async function until(test, label, ms = 12000) {
  const start = Date.now();
  while (!test()) { if (Date.now() - start > ms) throw new Error(`Timeout: ${label}: ${JSON.stringify(peers.map(p=>({phase:p.state?.phase,input:p.state?.input,question:p.state?.question,match:p.state?.match})))}`); await wait(30); }
}
const config = { format: 'pauper', matchLength: 'bo3' };
const deck = (name, land) => ({ name, cards: [{ name: land, count: 60 }], sideboard: [{ name: 'Lightning Bolt', count: 4 }] });
try {
  const a = await peer(true), b = await peer(), spectator = await peer();
  a.send({ type: 'host', name: 'Protocol A', deck: deck('A', 'Mountain'), config });
  await until(() => a.messages.some(m => m.type === 'room'), 'room');
  const code = a.messages.find(m => m.type === 'room').room.code;
  spectator.send({ type: 'lookup-room', code, requestId: 'room-check' });
  await until(() => spectator.messages.some(m => m.requestId === 'room-check'), 'lookup');
  const lookup = spectator.messages.find(m => m.requestId === 'room-check');
  assert.equal(lookup.type, 'room-info'); assert.equal(lookup.room.config.matchLength, 'bo3');
  assert.ok(!JSON.stringify(lookup).includes('token'));
  b.send({ type: 'join', code, name: 'Protocol B', deck: deck('B', 'Forest') });
  await until(() => a.state?.phase === 'MAIN1' && b.state?.phase === 'MAIN1', 'first main phase');
  assert.ok(a.openings.has('mulligan') && a.openings.has('mulligan-bottom'));
  assert.ok(a.openings.has('play-draw') || b.openings.has('play-draw'));
  const matchId = a.state.matchId;
  b.send({ type: 'concede' });
  await until(() => a.state?.sideboarding && b.state?.sideboarding, 'sideboarding');
  assert.deepEqual(a.state.match.wins, [1, 0]); assert.equal(a.state.match.over, false);
  assert.ok(a.state.sideboarding.main.some(c => c.name === 'Mountain')); assert.ok(!a.state.sideboarding.main.some(c => c.name === 'Forest'));
  const token = a.state.session.token, sideId = a.state.sideboarding.id, firstCursor = a.state.eventCursor;
  a.ws.close(); await wait(100);
  const rejoined = await peer();
  rejoined.send({ type: 'rejoin', code, token });
  await until(() => rejoined.state?.sideboarding, 'rejoin sideboarding');
  assert.equal(rejoined.state.matchId, matchId); assert.deepEqual(rejoined.state.match.wins, [1, 0]);
  const illegal = deck('A', 'Island');
  rejoined.send({ type: 'sideboard', id: sideId, deck: illegal });
  await until(() => rejoined.messages.some(m => m.type === 'validation-error'), 'registered pool rejection');
  assert.ok(rejoined.messages.find(m => m.type === 'validation-error').validation.issues.some(i => i.code === 'registered-pool'));
  const swapped = { name: 'A', cards: [{ name: 'Mountain', count: 58 }, { name: 'Lightning Bolt', count: 2 }], sideboard: [{ name: 'Mountain', count: 2 }, { name: 'Lightning Bolt', count: 2 }] };
  rejoined.send({ type: 'sideboard', id: sideId, deck: swapped });
  await until(() => rejoined.state?.sideboarding?.ready, 'private sideboard accepted');
  assert.equal(b.state.sideboarding.ready, false);
  b.send({ type: 'next-game', id: sideId - 1 }); await wait(150);
  assert.equal(b.state.match.gameNumber, 1, 'stale sideboard command progressed game');
  b.send({ type: 'next-game', id: sideId });
  await until(() => rejoined.state?.match.gameNumber === 2 && rejoined.state.phase === 'MAIN1' && b.state?.phase === 'MAIN1', 'second main phase');
  assert.equal(rejoined.state.matchId, matchId); assert.deepEqual(rejoined.state.match.wins, [1, 0]); assert.ok(rejoined.state.eventCursor > firstCursor);
  b.send({ type: 'concede' });
  await until(() => rejoined.state?.match.over && b.state?.match.over, 'match winner');
  assert.deepEqual(rejoined.state.match.wins, [2, 0]); assert.equal(rejoined.state.match.phase, 'complete');
  assert.ok(!rejoined.state.sideboarding);
  const completedToken = b.state.session.token;
  b.send({type: 'leave'});
  await until(() => !rejoined.state.room.players[1].connected, 'leave completed match');
  assert.equal(rejoined.state.match.abandoned, false, 'leaving a completed match erased its result');
  assert.deepEqual(rejoined.state.match.wins, [2, 0]);
  b.send({type: 'rejoin', code, token: completedToken});
  await until(() => rejoined.state.room.players[1].connected, 'return to completed match');
  rejoined.send({ type: 'rematch' }); b.send({ type: 'rematch' });
  await until(() => rejoined.state?.matchId !== matchId && rejoined.state?.phase === 'MAIN1', 'rematch');
  assert.deepEqual(rejoined.state.match.wins, [0, 0]); assert.deepEqual(rejoined.state.config, config);
  b.send({ type: 'concede' });
  await until(() => rejoined.state?.sideboarding && b.state?.sideboarding, 'rematch sideboarding');
  rejoined.send({ type: 'leave' });
  await until(() => b.state?.match.abandoned, 'abandoned match');
  assert.equal(b.state.match.over, true); assert.equal(b.state.match.phase, 'complete');
  assert.deepEqual(b.state.match.wins, [1, 0], 'abandonment must not invent game wins');
  const remaining = await peer(), departing = await peer();
  remaining.send({type: 'host', name: 'Remaining', deck: deck('Remaining', 'Mountain'), config});
  await until(() => remaining.messages.some(message => message.type === 'room'), 'leave-test room');
  const leaveCode = remaining.messages.find(message => message.type === 'room').room.code;
  departing.send({type: 'join', code: leaveCode, name: 'Departing', deck: deck('Departing', 'Forest')});
  await until(() => remaining.state?.phase === 'MAIN1' && departing.state?.phase === 'MAIN1', 'leave-test first game');
  departing.send({type: 'leave'});
  await until(() => remaining.state?.match.abandoned && remaining.state.gameOver, 'leave during first game ends series');
  assert.equal(remaining.state.match.phase, 'complete'); assert.equal(remaining.state.match.over, true);
  assert.deepEqual(remaining.state.match.wins, [1, 0], 'only the conceded game should be scored');
  assert.ok(!remaining.state.sideboarding, 'departed opponent stranded survivor in sideboarding');
  remaining.send({type: 'next-game', id: 0}); await wait(150);
  assert.equal(remaining.state.match.gameNumber, 1); assert.equal(remaining.state.match.phase, 'complete');
  const automatic = await peer();
  automatic.send({ type: 'start', config: { format: 'free', matchLength: 'bo1' },
    you: { name: 'Automatic pass', cards: [{ name: 'Mountain', count: 60 }] },
    opponent: { name: 'No-action AI', cards: [{ name: 'Forest', count: 60 }] } });
  await until(() => automatic.state?.phase === 'MAIN1' && automatic.state.activePlayer === automatic.state.you && automatic.state.input.priority && automatic.state.input.ok.enabled && automatic.state.input.actionable.length > 0, 'automatic first main');
  const firstTurn = automatic.state.turn;
  const land = automatic.state.players.find(p => p.id === automatic.state.you).hand.find(c => c.land);
  automatic.send({ type: 'card', id: land.id, gen: automatic.state.input.gen });
  // Deliberately send no priority OK/cancel: the engine alone must advance every empty window.
  await until(() => automatic.state?.turn >= firstTurn + 2 && automatic.state.phase === 'MAIN1'
    && automatic.state.activePlayer === automatic.state.you, 'no-action automatic turn progression', 15000);
  await until(() => automatic.state.input.priority && automatic.state.input.ok.enabled, 'next actionable priority');
  const yieldTurn = automatic.state.turn, yieldGen = automatic.state.input.gen;
  automatic.send({type: 'pass-turn', gen: yieldGen - 1}); await wait(150);
  assert.equal(automatic.state.turn, yieldTurn, 'stale end-turn action progressed turn');
  automatic.send({type: 'pass-turn', gen: automatic.state.input.gen});
  await until(() => automatic.state?.turn >= yieldTurn + 2 && automatic.state.phase === 'MAIN1'
    && automatic.state.activePlayer === automatic.state.you, 'explicit end turn', 15000);
  console.log('PASS: typed opening/mulligan/bottom selection, explicit end turn/stale rejection, automatic empty priority, leave during play/sideboarding/completed match, private lookup, Bo3 score/sideboard/registered pool/reconnect/next game/rematch, monotonic events, anonymous draws and public frames');
} finally {
  for (const p of peers) if (p.ws.readyState === WebSocket.OPEN) p.send({ type: 'leave' });
  await wait(200);
  for (const p of peers) p.ws.close();
}
