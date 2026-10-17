// Real Forge shutdown: rapid exits during setup, starting-player concession, and fresh games afterwards.
// node forge-bridge/scripts/test-lifecycle.mjs [ws://127.0.0.1:7172/ws]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const peers = [], wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deck = {name:'Lifecycle Commander', cards:[{name:'Plains',count:99}],commanders:[{name:'Isamaru, Hound of Konda',count:1}]};
const config = {format:'commander',matchLength:'bo1',playerCount:4};
async function peer() {
  const p = {ws:new WebSocket(endpoint),state:null,room:null,automatic:false,seen:new Set()}; peers.push(p);
  p.send = value => p.ws.send(JSON.stringify(value));
  p.ws.addEventListener('message',({data})=>{
    const m=JSON.parse(data); if(m.room)p.room=m.room; if(m.type!=='state')return;p.state=m;
    if(p.exitOnFirstState){p.exitOnFirstState=false;p.send({type:'leave'});return;}
    if(!p.automatic||p.seen.has(m.input.gen))return;
    if(m.input.opening==='starting-player'){p.seen.add(m.input.gen);p.send({type:'player',id:m.you,gen:m.input.gen});}
    else if(['play-draw','mulligan'].includes(m.input.opening)&&m.input.ok.enabled){p.seen.add(m.input.gen);p.send({type:'ok',gen:m.input.gen});}
  });
  await new Promise((resolve,reject)=>{p.ws.addEventListener('open',resolve,{once:true});p.ws.addEventListener('error',reject,{once:true});});return p;
}
async function until(test,label){const start=Date.now();while(!test()){if(Date.now()-start>20000)throw new Error(`Timeout: ${label}`);await wait(30);}}
const priority=p=>p.state?.input.priority&&p.state.input.ok.enabled;
try {
  for(let i=0;i<8;i++){
    const p=await peer();p.exitOnFirstState=true;p.send({type:'start',config,you:deck,opponents:[deck,deck,deck]});
    await until(()=>p.state,'rapid game initial state');await until(()=>!p.exitOnFirstState,'rapid leave sent');
  }
  const room=[await peer(),await peer(),await peer(),await peer()];room[0].send({type:'host',name:'Lifecycle 0',config,deck});
  await until(()=>room[0].room,'host');
  for(let i=1;i<4;i++){room[i].send({type:'join',code:room[0].room.code,name:`Lifecycle ${i}`,deck});await until(()=>room[i].room,'join');}
  await until(()=>room.some(p=>p.state?.input.opening==='starting-player'&&p.state.input.selectablePlayers.length),'starting player question');
  const departed=room.find(p=>p.state?.input.opening==='starting-player'&&p.state.input.selectablePlayers.length);
  departed.send({type:'concede'});
  for(const p of room)if(p!==departed)p.automatic=true;
  // Publish current prompts again; enabling the local automaton does not alter server state.
  for(const p of room)p.send({type:'hello'});
  await until(()=>departed.state?.spectating&&room.some(p=>p!==departed&&priority(p)),'survivors play after chooser concedes');
  assert.equal(departed.state.players.filter(p=>p.eliminated).length,1);
  for(const p of room)p.send({type:'leave'});
  const targeting=await peer();targeting.automatic=true;
  targeting.send({type:'start',config:{format:'free',matchLength:'bo1'},you:{name:'Pending suspend target',cards:[{name:'Mountain',count:6},{name:'Rift Bolt',count:6}]},opponent:{name:'AI',cards:[{name:'Forest',count:60}]}});
  await until(()=>priority(targeting),'suspend game priority');
  const own=()=>targeting.state.players.find(p=>p.id===targeting.state.you);
  const land=own().hand.find(c=>c.land),rift=own().hand.find(c=>c.name==='Rift Bolt');
  targeting.send({type:'card',id:land.id,gen:targeting.state.input.gen});
  await until(()=>priority(targeting)&&targeting.state.input.actionable.includes(rift.id),'suspend mana');
  targeting.send({type:'card',id:rift.id,gen:targeting.state.input.gen});
  await until(()=>targeting.state.question?.method==='getAbilityToPlay','suspend choice');
  const q=targeting.state.question;
  targeting.send({type:'answer',id:q.id,indices:[q.options.findIndex(o=>o.label.includes('Susp'))]});
  await until(()=>targeting.state.input.paying&&targeting.state.input.ok.enabled,'suspend payment');
  targeting.send({type:'ok',gen:targeting.state.input.gen});
  const passed=new Set();
  await until(()=>{
    const input=targeting.state.input;
    if(input.targeting&&input.selectablePlayers.length>0)return true;
    if((input.priority||input.suspendCast)&&input.ok.enabled&&!passed.has(input.gen)){
      passed.add(input.gen);targeting.send({type:'ok',gen:input.gen});
    }
    return false;
  },'mandatory suspended spell target');
  targeting.send({type:'leave'});
  const fresh=await peer();fresh.automatic=true;
  fresh.send({type:'start',config:{format:'free',matchLength:'bo1'},you:{name:'Fresh',cards:[{name:'Plains',count:60}]},opponent:{name:'AI',cards:[{name:'Forest',count:60}]}});
  await until(()=>priority(fresh),'fresh duel after teardown stress');
  console.log('PASS: 8 rapid setup exits; starting-player owner concedes without null choice; survivors reach priority; simultaneous room close; leave during mandatory suspend targeting; fresh duel remains playable');
} finally {
  for(const p of peers)if(p.ws.readyState===WebSocket.OPEN)p.send({type:'leave'});
  await wait(300);for(const p of peers)p.ws.close();
}
