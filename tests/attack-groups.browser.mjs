import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = 'attack-groups-check';
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], {encoding:'utf8'}).trim();
const evaluate = code => JSON.parse(execFileSync('npx', ['--yes', 'agent-browser', '--session', session, 'eval', '--stdin'], {input:`(() => {${code}})()`,encoding:'utf8'}).trim());
const card = id => `.field.me [data-fid="${id}"]`;
const click = (...selectors) => run('batch', ...selectors.map(selector => `click '${selector}'`));
const messages = () => evaluate('return window.fixture.messages;');
const selected = () => evaluate('return [...document.querySelectorAll(".field.me .attack-selected")].map(el=>Number(el.closest("[data-fid]").dataset.fid)).sort((a,b)=>a-b);');
const assignments = () => evaluate('return window.fixture.state.combat.map(row=>[row.attacker,row.defender,row.defenderKind]).sort((a,b)=>a[0]-b[0]);');
const setup = () => evaluate(`
  const f=window.fixture,s=f.state;
  window.initialGroupState??=structuredClone(s);
  const gen=s.input.gen+1;
  Object.assign(s,structuredClone(window.initialGroupState));f.messages.length=0;f.acked=0;
  f.attack();s.input.gen=gen;s.input.cancel={label:'Atacar com tudo',enabled:true};
  const own=s.players.find(p=>p.id===s.you),original=own.battlefield.find(c=>c.id===102);
  own.battlefield.push(...[602,603,604].map((id,i)=>({...original,id,name:['Elvish Mystic','Wood Elves','Eternal Witness'][i]})));
  s.input.attacking.attackers=[102,602,603,604];
  s.input.attacking.legalAssignments=s.input.attacking.attackers.map(attacker=>({attacker,defenders:[{id:10,kind:'player'},{id:23,kind:'player'},{id:49,kind:'player'}]}));
  window.attackAck=()=>{
    const action=f.messages[f.acked++];if(!action)throw new Error('No pending action to acknowledge');
    if(action.type==='attack-group')for(const attacker of action.attackers){s.combat=s.combat.filter(row=>row.attacker!==attacker);if(action.defender!==null)s.combat.push({attacker,defender:action.defender,defenderKind:action.defenderKind,blockers:[]});}
    else throw new Error('Unexpected action '+JSON.stringify(action));
    s.input.gen++;s.input.cancel.label=s.combat.length?'Recolher todos':'Atacar com tudo';f.render();return s.input.gen;
  };
  f.view.attach(f.client,[]);f.render();return gen;
`);
const ack = () => evaluate('return window.attackAck();');

try {
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://127.0.0.1:5173'}/tests/fixtures/commander-table.html`);
  for (const [width,height] of [[1280,800],[844,390]]) {
    run('set','viewport',String(width),String(height));
    let gen=setup();
    click(card(102),card(602));
    assert.deepEqual(selected(),[102,602],'Both creature clicks must remain selected');
    assert.deepEqual(messages(),[],'Card-first selection stays local until a defender is chosen');
    assert.ok(evaluate('return document.querySelector("[data-act=ok]").disabled;'),'Pending cards cannot be silently ignored by confirmation');
    click('[data-pid="49"]');
    assert.deepEqual(messages(),[{type:'attack-group',attackers:[102,602],defender:49,defenderKind:'player',gen}]);
    gen=ack();
    click(card(603),card(604),'[data-pid="23"]');
    assert.deepEqual(messages().at(-1),{type:'attack-group',attackers:[603,604],defender:23,defenderKind:'player',gen});
    gen=ack();
    assert.deepEqual(assignments(),[[102,49,'player'],[602,49,'player'],[603,23,'player'],[604,23,'player']]);
    assert.ok(evaluate('return !document.querySelector("[data-act=ok]").disabled;'),'Assignment must leave final confirmation available');
    click(card(102),card(602),'[data-pid="10"]');
    gen=ack();
    assert.deepEqual(assignments(),[[102,10,'player'],[602,10,'player'],[603,23,'player'],[604,23,'player']],'Reassigning one group preserves another');
    click(card(102),card(602),'[data-ui="attack-remove"]');
    assert.deepEqual(messages().at(-1),{type:'attack-group',attackers:[102,602],defender:null,gen});
    ack();assert.deepEqual(assignments(),[[603,23,'player'],[604,23,'player']]);

    gen=setup();click('[data-pid="49"]');
    assert.deepEqual(messages(),[],'Defender-first selection must not assign creatures yet');
    evaluate(`document.querySelector('${card(102)}').click();document.querySelector('${card(602)}').click();return true;`);
    assert.deepEqual(messages(),[{type:'attack-group',attackers:[102],defender:49,defenderKind:'player',gen}],'Rapid second click must wait for an authoritative generation');
    gen=ack();
    assert.deepEqual(messages().at(-1),{type:'attack-group',attackers:[602],defender:49,defenderKind:'player',gen},'Queued click must dispatch after acknowledgement');
    gen=ack();
    click(card(603));gen=ack();
    click('[data-pid="23"]',card(604));
    assert.deepEqual(messages().at(-1),{type:'attack-group',attackers:[604],defender:23,defenderKind:'player',gen});
    ack();assert.deepEqual(assignments(),[[102,49,'player'],[602,49,'player'],[603,49,'player'],[604,23,'player']]);
    run('press','Escape');const sent=messages().length;click(card(102),card(602));
    assert.deepEqual(selected(),[102,602]);assert.equal(messages().length,sent,'Escape returns to group selection');
    run('press','Escape');assert.deepEqual(selected(),[]);

    gen=setup();click('[data-pid="49"]');
    evaluate(`document.querySelector('${card(102)}').click();document.querySelector('${card(602)}').click();const f=window.fixture;f.state.input.gen++;f.state.stateVersion=(f.state.stateVersion??0)+1;f.render();return true;`);
    assert.equal(messages().length,1,'Unrelated state progress cannot flush queued clicks');
    evaluate(`window.fixture.view.notice('A escolha de atacantes mudou. Escolha novamente.',true);return true;`);
    assert.ok(evaluate('return !document.querySelector("[data-act=ok]").disabled;'),'Explicit stale-action error unlocks confirmation');
    evaluate('window.fixture.state.input.gen++;window.fixture.render();return true;');
    assert.equal(messages().length,1,'Error discards queued clicks without retry');
    click(card(603));assert.deepEqual(selected(),[603]);assert.equal(messages().length,1,'Error also clears the pinned defender');

    setup();click(card(102),card(602));
    evaluate('window.fixture.state.input.gen++;window.fixture.render();return true;');
    assert.deepEqual(selected(),[],'Stale local groups must clear on an unrelated engine prompt');
    setup();click('[data-pid="49"]');
    evaluate(`const f=window.fixture;f.state.phase='MAIN2';delete f.state.input.attacking;f.state.input.gen++;f.render();f.attack();f.state.input.gen++;f.render();return true;`);
    click(card(102));assert.deepEqual(messages(),[],'Pinned defender must not survive leaving attack declaration');
    assert.deepEqual(selected(),[102]);
  }
  console.log('Attack-group browser regression passed: card-card-opponent groups, distinct defenders, reassignment/removal, defender-first, queued rapid clicks, cancellation, stale state and phase changes at desktop/landscape sizes.');
} finally {run('close');}
