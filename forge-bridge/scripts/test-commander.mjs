// Real Forge protocol: Commander seats, command casting, hidden information, reconnect and elimination.
// node forge-bridge/scripts/test-commander.mjs [ws://127.0.0.1:7172/ws]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const peers = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deck = {name: 'Commander protocol', cards: [{name: 'Plains', count: 99}], commanders: [{name: 'Isamaru, Hound of Konda', count: 1}]};
const config = count => ({format: 'commander', matchLength: 'bo1', playerCount: count});
async function peer(keep = true) {
  const p = {ws: new WebSocket(endpoint), state: null, room: null, messages: [], seen: new Set(), keep}; peers.push(p);
  p.send = message => p.ws.send(JSON.stringify(message));
  p.ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data); p.messages.push(message);
    if (message.room) p.room = message.room;
    if (message.type !== 'state') return;
    p.state = message;
    if (p.keep && message.input.opening === 'starting-player' && !p.seen.has(message.input.gen)) {
      assert.ok(message.input.selectablePlayers.includes(message.you));
      p.seen.add(message.input.gen); p.send({type:'player',id:message.you,gen:message.input.gen});
    }
    if (p.keep && ['play-draw', 'mulligan'].includes(message.input.opening) && message.input.ok.enabled && !p.seen.has(message.input.gen)) {
      p.seen.add(message.input.gen); p.send({type: 'ok', gen: message.input.gen});
    }
  });
  await new Promise((resolve, reject) => { p.ws.addEventListener('open', resolve, {once: true}); p.ws.addEventListener('error', reject, {once: true}); });
  return p;
}
async function until(test, label, ms = 25000) {
  const start = Date.now();
  while (!test()) {
    if (Date.now() - start > ms) throw new Error(`Timeout: ${label}\n${JSON.stringify(peers.map(p => ({seat:p.room?.seat, capacity:p.room?.capacity, input:p.state?.input, question:p.state?.question, errors:p.messages.filter(m=>['error','validation-error','request-error'].includes(m.type))})))}`);
    await wait(40);
  }
}
const own = p => p.state.players.find(row => row.id === p.state.you);
const priority = p => p.state?.input.priority && p.state.input.ok.enabled && p.state.activePlayer === p.state.you;
const privacy = p => {
  assert.equal(p.state.players.length, p.state.config.playerCount);
  p.state.players.forEach((row, seat) => {
    assert.equal(row.seat, seat);
    if (row.id !== p.state.you || p.state.spectating) assert.deepEqual(row.hand, []);
  });
};
async function advanceAiRound(p) {
  const turn = p.state.turn, count = p.state.config.playerCount;
  p.send({type:'card',id:own(p).hand.find(card=>card.land).id,gen:p.state.input.gen});
  await until(()=>priority(p) && own(p).battlefield.some(card=>card.land),`${count}-player solo land`);
  p.send({type:'pass-turn',gen:p.state.input.gen});
  await until(()=>priority(p) && p.state.turn>=turn+count,`${count}-player AI round completes`);
  assert.ok(p.state.players.filter(row=>row.ai).every(row=>row.battlefield.some(card=>card.land)));
}
try {
  const roomPeers = [await peer(), await peer(), await peer(), await peer()];
  const host = roomPeers[0]; host.send({type:'host', name:'Host', config:config(4), deck});
  await until(()=>host.room, 'host room'); const code = host.room.code;
  assert.equal(host.room.capacity,4);
  for (let i=1;i<4;i++) {
    roomPeers[i].send({type:'join',code,name:`Player ${i}`,deck});
    await until(()=>roomPeers[i].room?.players.length===i+1, `join seat ${i}`);
    assert.equal(roomPeers[i].room.seat,i);
    if(i<3) assert.equal(roomPeers[i].room.started,false);
  }
  await until(()=>roomPeers.every(p=>p.state?.players.length===4) && roomPeers.some(priority), 'four humans opening');
  for(const p of roomPeers) {
    privacy(p); assert.equal(own(p).seat,p.room.seat);
    assert.equal(p.state.players.filter(row=>row.life===40).length,4);
    assert.ok(p.state.players.every(row=>row.commandZone.length===1 && row.commanders.length===1));
  }
  const active=roomPeers.find(priority), command=own(active).commandZone[0];
  active.send({type:'card',id:own(active).hand.find(card=>card.land).id,gen:active.state.input.gen});
  await until(()=>priority(active) && own(active).battlefield.some(card=>card.land) && active.state.castable.includes(command.id),'commander available from command zone');
  active.send({type:'card',id:command.id,gen:active.state.input.gen});
  await until(()=>active.state.input.paying && active.state.input.ok.enabled,'commander mana payment');
  // Payment can publish a refreshed generation before the first click reaches the dispatcher.
  // Acknowledge each visible payment prompt once, just as the interactive button does.
  const paid=new Set();
  // Other humans may receive priority; pass only until the commander resolves.
  const passed=new Set();
  await until(()=>{
    if(active.state.input.paying && active.state.input.ok.enabled && !paid.has(active.state.input.gen)) {
      paid.add(active.state.input.gen);active.send({type:'ok',gen:active.state.input.gen});
    }
    for(const p of roomPeers) if(p.state?.input.priority && p.state.input.ok.enabled && !passed.has(`${p.room.seat}:${p.state.input.gen}`)) {
      passed.add(`${p.room.seat}:${p.state.input.gen}`);p.send({type:'ok',gen:p.state.input.gen});
    }
    return own(active).battlefield.some(card=>card.id===command.id);
  },'commander resolves');
  assert.equal(own(active).commanders[0].casts,1); assert.equal(own(active).commanders[0].tax,2);
  assert.equal(own(active).commandZone.length,0);

  // A separate three-player AI match must progress while this human table waits.
  const solo=await peer(); solo.send({type:'start',config:config(3),you:deck,opponents:[deck,deck]});
  await until(()=>priority(solo),'independent three-player solo');
  privacy(solo); assert.equal(solo.state.players.filter(row=>row.ai).length,2);
  assert.ok(solo.state.players.every(row=>row.life===40));
  await advanceAiRound(solo);
  solo.send({type:'leave'});

  const victim=roomPeers.find(p=>p!==active), victimSeat=victim.room.seat, saved=victim.state.session;
  victim.send({type:'concede'});
  await until(()=>victim.state?.spectating && active.state.players[victimSeat].eliminated,'single-seat concession');
  assert.equal(active.state.gameOver,false); assert.equal(active.state.match.over,false); privacy(victim);
  victim.ws.close(); await wait(100);
  const returned=await peer(); returned.send({type:'rejoin',code:saved.code,token:saved.token});
  await until(()=>returned.state?.spectating,'eliminated reconnect');
  assert.equal(returned.room.seat,victimSeat); assert.equal(returned.state.you,victim.state.you); privacy(returned);
  returned.send({type:'ok',gen:returned.state.input.gen});
  returned.send({type:'card',id:own(active).battlefield.find(card=>card.id===command.id).id,gen:returned.state.input.gen});
  await wait(100); assert.equal(returned.state.spectating,true);
  const remaining=roomPeers.filter(p=>p!==victim && p!==active);
  remaining[0].send({type:'leave'});
  await until(()=>active.state.players[remaining[0].room.seat].eliminated,'departure removes only one player');
  assert.equal(active.state.gameOver,false); assert.equal(active.state.match.over,false);
  remaining[1].send({type:'concede'});
  await until(()=>active.state.gameOver && active.state.match.over,'last survivor wins');
  assert.equal(active.state.winner,own(active).name);

  for(const count of [2,4]) {
    const p=await peer(); p.send({type:'start',config:config(count),you:deck,opponents:Array.from({length:count-1},()=>deck)});
    await until(()=>priority(p),`${count}-player AI opening`); privacy(p);
    assert.equal(p.state.players.filter(row=>row.ai).length,count-1); assert.ok(p.state.players.every(row=>row.life===40));
    await advanceAiRound(p);
    p.send({type:'leave'});
  }
  for (const count of [2,3]) {
    const table = []; for (let i=0;i<count;i++) table.push(await peer());
    table[0].send({type:'host',config:config(count),deck});
    await until(()=>table[0].room,`${count}-human room created`);
    for (let i=1;i<count;i++) table[i].send({type:'join',code:table[0].room.code,deck});
    await until(()=>table.every(p=>p.state?.players.length===count) && table.some(priority),`${count}-human opening`);
    for (const p of table) privacy(p);
    for (let i=1;i<count;i++) {
      table[i].send({type:'concede'});
      await until(()=>table[0].state.players[i].eliminated,`${count}-human concession ${i}`);
    }
    await until(()=>table[0].state.gameOver && table[0].state.match.over,`${count}-human result`);
    for (const p of table) p.send({type:'leave'});
  }
  console.log('PASS: 2/3/4-player Commander AI; 2/3/4 humans; AI turns; 40 life; command-zone cast/tax; exact seats/private hands; independent game progress; single-seat concede/leave; eliminated reconnect/spectating; last-survivor victory');
} finally {
  for(const p of peers) if(p.ws.readyState===WebSocket.OPEN) p.send({type:'leave'});
  await wait(200); for(const p of peers)p.ws.close();
}
