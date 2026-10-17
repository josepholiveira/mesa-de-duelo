import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const session = 'commander-table-check';
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], {encoding:'utf8'}).trim();
const evaluate = code => JSON.parse(execFileSync('npx', ['--yes', 'agent-browser', '--session', session, 'eval', '--stdin'], {input:`(() => {${code}})()`,encoding:'utf8'}).trim());
try {
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://localhost:5174'}/tests/fixtures/commander-table.html`);
  for (const [width,height] of [[1440,900],[1280,800],[844,390]]) {
    run('set','viewport',String(width),String(height));
    const board = evaluate(`return {players:[...document.querySelectorAll('[data-pid]')].map(el=>Number(el.dataset.pid)),hand:document.querySelectorAll('#fHand [data-fid]').length,leak:document.body.innerHTML.includes('PRIVATE OPPONENT HAND'),creatures:[...document.querySelectorAll('.table-seat .creatures .bfc')].map(el=>{const r=el.getBoundingClientRect(),p=el.closest('.field').getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1}),seats:[...document.querySelectorAll('[data-seat-player]')].map(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})};`);
    assert.deepEqual(board.players,[49,10,23,36]);assert.equal(board.hand,7);assert.equal(board.leak,false);assert.ok(board.creatures.every(Boolean),`${width}: creatures clipped`);assert.ok(board.seats.every(Boolean));
    const geometry=evaluate(`const r=document.querySelector('#fPhases').getBoundingClientRect(),seats=document.querySelector('#fOpponents').getBoundingClientRect();return {center:(r.left+r.right)/2,width:innerWidth,right:seats.right,ring:parseFloat(getComputedStyle(document.querySelector('.seat-heading .life')).borderTopWidth)};`);
    assert.ok(Math.abs(geometry.center-width/2)<1,`${width}: phase rail not centered`);assert.ok(geometry.right>=width-1,`${width}: empty stack reserves space`);assert.ok(geometry.ring>0);
    const fixed=evaluate(`const f=window.fixture,s=f.state;const boxes=()=>[...document.querySelectorAll('[data-seat-player],.field .bfc,#fHand')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});const before=boxes(),stack=[{id:95,text:'Compre duas cartas.',source:s.players[0].graveyard[0],controller:10}];s.stack=stack;f.render();const live=boxes();s.stack=[];s.events=[{seq:(window.stackCheckSeq=(window.stackCheckSeq??0)+1),type:'spell-cast',actor:10,card:stack[0].source,frame:{players:[],stack,turn:s.turn,phase:s.phase,activePlayer:s.activePlayer}}];f.render();const replay=boxes(),replaying=!!document.querySelector('[data-stack-replay]');s.events=[];s.stack=stack;f.render();return {before,live,replay,replaying};`);
    assert.deepEqual(fixed.live,fixed.before,`${width}: live stack moved the board`);assert.deepEqual(fixed.replay,fixed.before,`${width}: replay stack moved the board`);assert.ok(fixed.replaying);
    run('click','[data-ui="stack-size"]');
    const revealed=evaluate(`const card=document.querySelector('[data-seat-player="23"] .creatures .bfc'),r=card.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {id:Number(card.dataset.fid),reachable:card.contains(hit),minimized:document.querySelector('#fStack').classList.contains('minimized')};`);
    assert.ok(revealed.reachable&&revealed.minimized,`${width}: compact stack still blocks battlefield`);
    run('click',`[data-seat-player="23"] .creatures [data-fid="${revealed.id}"]`);
    assert.deepEqual(evaluate(`return window.fixture.messages.at(-1);`),{type:'card',id:revealed.id,gen:91});
    run('click','[data-ui="stack-size"]');
    evaluate(`window.fixture.state.stack=[];window.fixture.render();return true;`);

  }
  for(const [width,height] of [[1280,800],[844,390]]) {
    run('set','viewport',String(width),String(height));
    evaluate(`window.fixture.stress();return true;`);
    const overflow=evaluate(`return [...document.querySelectorAll('.table-seat .creatures')].map(row=>{const cards=[...row.querySelectorAll('.bfc')],last=cards.at(-1);row.scrollLeft=row.scrollWidth;const r=row.getBoundingClientRect(),c=last.getBoundingClientRect();return {count:cards.length,overflow:row.scrollWidth>row.clientWidth,lastVisible:c.left>=r.left-1&&c.right<=r.right+1};});`);
    assert.ok(overflow.every(row=>row.count>=23&&row.overflow&&row.lastVisible),`${width}: dense board end inaccessible`);
    evaluate(`document.querySelectorAll('.table-seat .creatures').forEach(row=>{row.scrollLeft=0;row.dispatchEvent(new Event('scroll'));});return true;`);
    run('click','[data-scroll-row="fCreatures-49"].forward-scroll');
    assert.ok(evaluate(`return document.querySelector('#fCreatures-49').scrollLeft;`)>0,`${width}: native overflow control failed`);
    // Reach the last distinct permanent through native wheel input, then retain it through a state update.
    const lastCard='#fCreatures-49 [data-fid="14921"]';
    const panToLast=()=>{const delta=evaluate(`const row=document.querySelector('#fCreatures-49').getBoundingClientRect(),card=document.querySelector('${lastCard}').getBoundingClientRect();return card.left+card.width/2-row.left-row.width/2;`);if(Math.abs(delta)>1)run('scroll',delta>0?'right':'left',String(Math.ceil(Math.abs(delta))),'--selector','#fCreatures-49');};
    panToLast();
    const stable=evaluate(`const row=document.querySelector('#fCreatures-49'),before=row.scrollLeft;window.fixture.render();const next=document.querySelector('#fCreatures-49'),r=next.getBoundingClientRect(),c=next.querySelector('[data-fid="14921"]').getBoundingClientRect();return {before,after:next.scrollLeft,visible:c.left>=r.left-1&&c.right<=r.right+1};`);
    assert.ok(stable.visible&&Math.abs(stable.before-stable.after)<1,`${width}: last permanent lost on render`);
    evaluate(`const f=window.fixture;f.state.stack=[{id:95,text:'Compre duas cartas.',source:f.state.players[0].graveyard[0],controller:10,targets:{cards:[14921]}}];f.state.input.selectable=[14921];f.render();return true;`);
    panToLast();
    run('click',lastCard);
    assert.deepEqual(evaluate(`return window.fixture.messages.at(-1);`),{type:'card',id:14921,gen:91});
    run('hover',lastCard);
    assert.ok(evaluate(`const el=document.querySelector('.card-inspector-preview');return !!el&&!el.hidden&&el.getBoundingClientRect().width>200;`),`${width}: last permanent preview too small`);
    run('hover','[data-ui="menu"]');
    evaluate(`const f=window.fixture;f.state.input.selection={cards:[],min:1,max:1};f.render();return true;`);
    assert.equal(evaluate(`return document.querySelectorAll('#fCreatures-49 > .stack').length;`),34);
    panToLast();run('click',lastCard);
    assert.deepEqual(evaluate(`return window.fixture.messages.at(-1);`),{type:'card',id:14921,gen:91});
    evaluate(`const f=window.fixture;delete f.state.input.selection;f.render();document.querySelector('#fCreatures-49').scrollLeft=0;document.querySelector('#fCreatures-49').dispatchEvent(new Event('scroll'));return true;`);
    assert.equal(evaluate(`return document.querySelectorAll('#fTargets .arrow').length;`),0,`${width}: arrow reaches an offscreen target`);
    evaluate(`window.fixture.state.stack=[];window.fixture.state.input.selectable=[];window.fixture.render();return true;`);

  }
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://localhost:5174'}/tests/fixtures/commander-table.html`);
  for(const [width,height] of [[1280,800],[844,390]]) {
    run('set','viewport',String(width),String(height));
    evaluate(`window.fixture.opening();return true;`);
    const opening=evaluate(`const action=document.querySelector('#fAction').getBoundingClientRect();return {ids:[...document.querySelectorAll('#fAction [data-pid]')].map(el=>Number(el.dataset.pid)),center:(action.left+action.right)/2,hand:getComputedStyle(document.querySelector('#fHand')).visibility};`);
    assert.deepEqual(opening.ids,[10,23,36,49]);assert.ok(Math.abs(opening.center-width/2)<1);assert.equal(opening.hand,'hidden');
    run('click','#fAction [data-pid="49"]');
    assert.deepEqual(evaluate(`return window.fixture.messages.at(-1);`),{type:'player',id:49,gen:91});
  }
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://localhost:5174'}/tests/fixtures/commander-table.html`);
  const actions=evaluate(`const f=window.fixture,s=f.state,r={};document.querySelector('[data-command-card][data-fid="502"]').click();r.command=f.messages.at(-1);f.attack();document.querySelector('.field.me [data-fid="102"]').click();document.querySelector('[data-defender="49"]').click();r.attack=f.messages.at(-1);s.input.attacking.legalAssignments[0].defenders=[{id:23,kind:'player'}];f.render();document.querySelector('.field.me [data-fid="102"]').click();r.single=f.messages.at(-1);delete s.input.attacking;s.input.blocking={selectedAttacker:100,attackers:[100,103],blockers:[102],legalAssignments:[{blocker:102,attackers:[103]}]};f.render();document.querySelector('.field.me [data-fid="102"]').click();document.querySelector('.field [data-fid="103"]').click();r.block=f.messages.at(-1);delete s.input.blocking;s.input.selectablePlayers=[49];f.render();document.querySelector('[data-pid="49"]').click();r.target=f.messages.at(-1);document.querySelector('[data-gy="49"][data-zone="gy"]').click();r.zone=document.querySelector('#fZone h2').textContent;document.querySelector('[data-ui="zone-close"]').click();document.querySelector('[data-gy="49"][data-zone="damage"]').click();r.damageRows=document.querySelectorAll('.commander-ledger li').length;document.querySelector('[data-ui="zone-close"]').click();s.players[3].eliminated=true;f.render();r.eliminated=!!document.querySelector('[data-seat-player="49"].eliminated');return r;`);
  assert.deepEqual(actions.command,{type:'card',id:502,gen:91});
  assert.deepEqual(actions.attack,{type:'attack',attacker:102,defender:49,defenderKind:'player',gen:91});
  assert.deepEqual(actions.single,{type:'attack',attacker:102,defender:23,defenderKind:'player',gen:91});
  assert.deepEqual(actions.block,{type:'block',blocker:102,attacker:103,gen:91});
  assert.deepEqual(actions.target,{type:'player',id:49,gen:91});assert.match(actions.zone,/Diego/);assert.equal(actions.damageRows,4);assert.ok(actions.eliminated);
  const gallery=evaluate(`const f=window.fixture,s=f.state;s.input.selectablePlayers=[];s.input.actionable=[];s.input.priority=true;s.stack=[{id:95,text:'Compre duas cartas.',source:s.players[0].graveyard[0],controller:10}];f.render();document.querySelector('[data-ui="stack-open"]').click();const open=!document.querySelector('#fStackGallery').hidden;document.querySelector('[data-ui="stack-close"]').click();return open;`);assert.ok(gallery);
  const seats=evaluate(`const f=window.fixture,s=f.state,all=[...s.players],r=[];s.stack=[];for(let n=2;n<=4;n++){s.players=all.slice(0,n);for(const p of s.players){s.you=p.id;f.render();r.push({n,you:p.id,own:Number(document.querySelector('#fMeAvatar [data-pid]').dataset.pid),count:document.querySelectorAll('[data-pid]').length,multi:document.querySelector('.arena').classList.contains('multiplayer')});}}return r;`);
  for(const seat of seats){assert.equal(seat.own,seat.you);assert.equal(seat.count,seat.n);assert.equal(seat.multi,seat.n>2);}
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://localhost:5174'}/tests/fixtures/commander-table.html`);
  for(const [width,height] of [[1280,800],[844,390]]) {
    run('set','viewport',String(width),String(height));
    const fixed=evaluate(`const f=window.fixture,s=f.state;s.players=s.players.filter(p=>p.id===10||p.id===36);s.config.format='free';s.stack=[];f.render();const boxes=()=>[...document.querySelectorAll('.field .bfc,#fHand')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});const before=boxes(),stack=[{id:95,text:'Compre duas cartas.',source:s.players[0].graveyard[0],controller:10}];s.stack=stack;f.render();const live=boxes();s.stack=[];s.events=[{seq:(window.stackCheckSeq=(window.stackCheckSeq??0)+1),type:'spell-cast',actor:10,card:stack[0].source,frame:{players:[],stack,turn:s.turn,phase:s.phase,activePlayer:s.activePlayer}}];f.render();const replay=boxes(),replaying=!!document.querySelector('[data-stack-replay]');s.events=[];s.stack=stack;f.render();return {before,live,replay,replaying};`);
    assert.deepEqual(fixed.live,fixed.before,`${width}: duel live stack moved cards`);assert.deepEqual(fixed.replay,fixed.before,`${width}: duel replay stack moved cards`);assert.ok(fixed.replaying);
    run('click','[data-ui="stack-size"]');
    assert.ok(evaluate(`return document.querySelector('#fStack').classList.contains('minimized');`));
    run('click','[data-ui="stack-size"]');
  }
  console.log('Commander browser checks passed: 3 viewports, every 2–4 player seat, exact actions, zones, privacy, elimination, stack gallery, centered openings and dense-board scrolling.');
} finally {run('close');}
