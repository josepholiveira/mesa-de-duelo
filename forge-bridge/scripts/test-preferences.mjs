// Real-engine preference isolation/lifecycle/priority regression. No credentials are printed.
// node forge-bridge/scripts/test-preferences.mjs [ws://127.0.0.1:7172/ws]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const peers = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function peer() {
  const p = {ws: new WebSocket(endpoint), messages: [], state: null, seen: new Set()}; peers.push(p);
  p.send = message => p.ws.send(JSON.stringify(message));
  p.once = message => { const key = JSON.stringify(message); if (!p.seen.has(key)) {p.seen.add(key); p.send(message);} };
  p.ws.addEventListener('message', ({data}) => {
    const m = JSON.parse(data); p.messages.push(m);
    if (m.type !== 'state') return;
    p.state = m;
    if (['play-draw', 'mulligan'].includes(m.input.opening) && m.input.ok.enabled)
      p.once({type: 'ok', gen: m.input.gen});
    if (m.phase === 'CLEANUP' && m.input.selection && m.input.selectable.length)
      p.once({type: 'card', id: m.input.selectable[0], gen: m.input.gen});
  });
  await new Promise((resolve, reject) => {p.ws.addEventListener('open', resolve, {once:true}); p.ws.addEventListener('error', reject, {once:true});});
  return p;
}
async function until(test, label, advance, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!test()) {
    if (Date.now() > end) throw new Error(`Timeout ${label}: ${JSON.stringify(peers.filter(p=>p.ws.readyState === WebSocket.OPEN).map(p=>({phase:p.state?.phase,turn:p.state?.turn,input:p.state?.input,question:p.state?.question,prefs:p.state?.preferences})))}`);
    advance?.(); await wait(40);
  }
}
const own = p => p.state?.players.find(player => player.id === p.state.you);
const priority = p => p.state?.input.priority && p.state.input.ok.enabled && !p.state.question;
const main = p => priority(p) && p.state.activePlayer === p.state.you && p.state.phase === 'MAIN1';
const landDeck = (name, land) => ({name,cards:[{name:land,count:60}]});
async function room(a,b,deckA,deckB,length='bo1') {
  a.send({type:'host',name:'Preferences A',deck:deckA,config:{format:'free',matchLength:length}});
  await until(()=>a.messages.some(m=>m.type==='room'),'host');
  const code = a.messages.find(m=>m.type==='room').room.code;
  b.send({type:'join',code,name:'Preferences B',deck:deckB});
  await until(()=>main(a)||main(b),'opening');
  return code;
}
async function preference(p, enabled) {
  p.send({type:'preferences',autoPassNoActions:enabled});
  await until(()=>p.state?.preferences.autoPassNoActions===enabled,'preference echo');
}
function playLand(p) {
  const card = own(p)?.hand.find(card=>card.land && p.state.input.actionable.includes(card.id));
  assert.ok(card,'playable land'); p.send({type:'card',id:card.id,gen:p.state.input.gen}); return card.id;
}
try {
  let a = await peer(); const b = await peer(), outsider = await peer();
  const code = await room(a,b,landDeck('Manual','Mountain'),landDeck('Automatic','Forest'),'bo3');
  assert.equal(a.state.preferences.autoPassNoActions,true); assert.equal(b.state.preferences.autoPassNoActions,true);
  // Reach A's first own main regardless of the random starting player.
  if (main(b)) {playLand(b); await until(()=>main(a),'A first main');}
  await preference(a,false);
  const turn = a.state.turn, land = playLand(a);
  await until(()=>priority(a)&&own(a).battlefield.some(card=>card.id===land)&&a.state.input.actionable.length===0,'manual empty priority');
  const gen = a.state.input.gen;
  await wait(1200); assert.equal(a.state.turn,turn); assert.equal(a.state.input.gen,gen);
  assert.equal(b.state.preferences.autoPassNoActions,true,'preference leaked to other seat');
  for (const value of ['true',0,null,{},[]]) {
    const errors = a.messages.filter(m=>m.type==='error').length;
    a.send({type:'preferences',autoPassNoActions:value});
    await until(()=>a.messages.filter(m=>m.type==='error').length>errors,'strict boolean rejection');
    assert.equal(a.state.preferences.autoPassNoActions,false);
  }
  // A connection outside the room cannot select another seat with client-supplied identifiers.
  outsider.send({type:'preferences',autoPassNoActions:true,code,seat:0}); await wait(150);
  assert.equal(a.state.preferences.autoPassNoActions,false);
  const old = a, session = a.state.session;
  a = await peer(); a.send({type:'rejoin',code,token:session.token});
  await until(()=>a.state?.preferences.autoPassNoActions===false,'rejoin retained preference');
  await until(()=>old.ws.readyState===WebSocket.CLOSED,'replaced socket closed');
  assert.equal(a.state.input.gen,gen); assert.ok(priority(a));
  await preference(a,true);
  await until(()=>main(b),'enable immediately releases empty priority');
  playLand(b); await until(()=>main(a)&&a.state.turn>turn,'automatic other seat and own next turn');
  await preference(a,false);
  b.send({type:'concede'}); await until(()=>a.state?.sideboarding&&b.state?.sideboarding,'game one end');
  const side = a.state.sideboarding.id;
  a.send({type:'next-game',id:side}); b.send({type:'next-game',id:side});
  await until(()=>a.state?.match.gameNumber===2&&(main(a)||main(b)),'Bo3 next game');
  assert.equal(a.state.preferences.autoPassNoActions,false); assert.equal(b.state.preferences.autoPassNoActions,true);
  if (main(b)) {playLand(b); await until(()=>main(a),'A main in game two');}
  playLand(a); await until(()=>priority(a)&&a.state.input.actionable.length===0,'new controller retained manual preference');
  const game2gen = a.state.input.gen; await wait(500); assert.equal(a.state.input.gen,game2gen);
  b.send({type:'concede'}); await until(()=>a.state?.match.over&&b.state?.match.over,'match end');
  const matchId = a.state.matchId;
  a.send({type:'rematch'}); b.send({type:'rematch'});
  await until(()=>a.state?.matchId!==matchId&&(main(a)||main(b)),'rematch');
  assert.equal(a.state.preferences.autoPassNoActions,false); assert.equal(b.state.preferences.autoPassNoActions,true);
  if (main(b)) {playLand(b); await until(()=>main(a),'A main in rematch');}
  playLand(a); await until(()=>priority(a)&&a.state.input.actionable.length===0,'rematch controller retained manual preference');
  console.log('PASS per-seat default/isolation, strict booleans, manual empty priority, enabling advances, rejoin replacement, Bo3 and rematch controller seeding');
  a.send({type:'leave'}); b.send({type:'leave'});

  const blue = await peer(), red = await peer();
  await room(blue,red,{name:'Counter response',cards:[{name:'Island',count:6},{name:'Counterspell',count:6}]},
    {name:'Creature spell',cards:[{name:'Mountain',count:6},{name:'Raging Goblin',count:6}]});
  const setup = () => {
    for (const p of [blue,red]) {
      const s=p.state;if (!s)continue;
      if (s.input.paying&&s.input.ok.enabled) p.once({type:'ok',gen:s.input.gen});
      else if(priority(p)) {
        const land=own(p).hand.find(card=>card.land&&s.input.actionable.includes(card.id));
        if(main(p)&&land)p.once({type:'card',id:land.id,gen:s.input.gen});
        else p.once({type:'ok',gen:s.input.gen});
      } else if (s.input.ok.enabled&&!s.input.opening) p.once({type:'ok',gen:s.input.gen});
    }
  };
  await until(()=>main(red)&&own(blue)?.battlefield.filter(c=>c.land&&!c.tapped).length>=2
    &&own(red).hand.some(c=>c.name==='Raging Goblin'&&red.state.input.actionable.includes(c.id)), 'two Islands and creature available',setup,25000);
  const goblin=own(red).hand.find(c=>c.name==='Raging Goblin');
  red.send({type:'card',id:goblin.id,gen:red.state.input.gen});
  await until(()=>priority(blue)&&blue.state.stack.some(item=>item.source?.id===goblin.id),'legal counter window',()=>{
    if(red.state.input.paying&&red.state.input.ok.enabled)red.once({type:'ok',gen:red.state.input.gen});
    else if(priority(red))red.once({type:'ok',gen:red.state.input.gen});
  });
  const counter=own(blue).hand.find(c=>c.name==='Counterspell');
  assert.ok(blue.state.input.actionable.includes(counter.id));
  const counterGen=blue.state.input.gen;
  blue.send({type:'preferences',autoPassNoActions:true}); await wait(1200);
  assert.equal(blue.state.input.gen,counterGen,'automatic setting skipped a legal Counterspell response');
  assert.ok(blue.state.stack.some(item=>item.source?.id===goblin.id));
  blue.send({type:'card',id:counter.id,gen:blue.state.input.gen});
  await until(()=>blue.state.input.selectableStacks.length>0,'exact stack target');
  const target=blue.state.stack.find(item=>item.source?.id===goblin.id);
  blue.send({type:'stack',id:target.id,gen:blue.state.input.gen});
  await until(()=>own(red).graveyard.some(c=>c.id===goblin.id)&&own(blue).graveyard.some(c=>c.id===counter.id),'counter resolution',()=>{
    for(const p of [blue,red])if((p.state.input.paying||priority(p))&&p.state.input.ok.enabled)p.once({type:'ok',gen:p.state.input.gen});
  });
  assert.ok(!own(red).battlefield.some(c=>c.id===goblin.id));
  const cast=blue.messages.flatMap(m=>m.events??[]).find(e=>e.type==='spell-cast'&&e.sourceId===goblin.id);
  assert.ok(cast?.frame.stack.some(item=>item.id===cast.stackId&&item.source?.id===goblin.id),'creature cast frame lost actual stack item');
  console.log('PASS automatic mode retains real Counterspell priority; exact stack target counters creature; public cast frame carries real source/stack IDs');
} finally {
  for(const p of peers)if(p.ws.readyState===WebSocket.OPEN)p.send({type:'leave'});
  await wait(200);for(const p of peers)p.ws.close();
}
