import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const session = 'attack-all-check';
const run = (...args) => execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], { encoding: 'utf8' }).trim();
const evaluate = code => JSON.parse(execFileSync('npx', ['--yes', 'agent-browser', '--session', session, 'eval', '--stdin'], { input: `(() => {${code}})()`, encoding: 'utf8' }).trim());
const setup = (count = 4, planeswalker = false) => evaluate(`
  const f=window.fixture,s=f.state;
  window.initialAttackState ??= structuredClone(s);
  const gen=s.input.gen+1;
  Object.assign(s,structuredClone(window.initialAttackState));
  s.players=s.players.filter(p=>${count}===2?p.id===10||p.id===36:${count}===3?p.id!==49:true);
  s.config.playerCount=${count};f.messages.length=0;f.attack();s.input.gen=gen;
  s.input.cancel={label:'Atacar com tudo',enabled:true};
  const targets=s.players.filter(p=>p.id!==s.you).map(p=>({id:p.id,kind:'player'}));
  if(${planeswalker}) { s.players[0].battlefield.push({id:49,name:'Garruk Wildspeaker',controller:10,planeswalker:true,tapped:false,token:false});targets.push({id:49,kind:'card'}); }
  s.input.attacking.defenders=targets;
  s.input.attacking.legalAssignments=[{attacker:102,defenders:targets}];
  f.render();return gen;
`);

try {
  run('open', `${process.env.TABLE_TEST_URL ?? 'http://127.0.0.1:5173'}/tests/fixtures/commander-table.html`);
  for (const [width, height] of [[1280, 800], [844, 390]]) {
    run('set', 'viewport', String(width), String(height));
    for (const count of [3, 4]) {
      const gen = setup(count);
      run('click', '[data-act="cancel"]');
      const choice = evaluate(`return {messages:window.fixture.messages,targets:[...document.querySelectorAll('[data-defender]')].map(el=>Number(el.dataset.defender)),confirmDisabled:!document.querySelector('[data-act="ok"]')||document.querySelector('[data-act="ok"]').disabled};`);
      assert.deepEqual(choice.messages, [], `${count} players: attack-all sent before defender choice`);
      assert.deepEqual(choice.targets.sort((a,b)=>a-b), count === 3 ? [10,23] : [10,23,49]);
      assert.equal(choice.confirmDisabled, true, 'Cannot confirm attackers while defender choice is pending');
      const target = count === 3 ? 23 : 49;
      run('click', `[data-pid="${target}"]`);
      assert.deepEqual(evaluate('return window.fixture.messages;'), [{type:'attack-all',defender:target,defenderKind:'player',gen}], 'Native opponent click must send exactly one targeted bulk action');
    }

    const gen = setup(4, true);
    run('click', '[data-act="cancel"]');
    run('click', '[data-defender="49"][data-defender-kind="card"]');
    assert.deepEqual(evaluate('return window.fixture.messages;'), [{type:'attack-all',defender:49,defenderKind:'card',gen}], 'Planeswalker/player ID collisions must retain target kind');

    setup();run('click', '[data-act="cancel"]');run('press', 'Escape');
    assert.deepEqual(evaluate('return window.fixture.messages;'), [], 'Escape cancels only the local target choice');
    assert.equal(evaluate('return document.querySelectorAll("[data-defender]").length;'), 0);

    setup();run('click', '[data-act="cancel"]');
    evaluate('window.fixture.state.input.gen++;window.fixture.render();return true;');
    assert.equal(evaluate('return document.querySelectorAll("[data-defender]").length;'), 0, 'A fresh engine prompt invalidates pending bulk choice');

    const duelGen = setup(2);run('click', '[data-act="cancel"]');
    assert.deepEqual(evaluate('return window.fixture.messages;'), [{type:'attack-all',defender:10,defenderKind:'player',gen:duelGen}], 'One legal defender needs no extra selection');

    const recallGen = setup();
    evaluate(`const f=window.fixture;f.state.combat=[{attacker:102,defender:49,defenderKind:'player',blockers:[]}];f.state.input.cancel={label:'Recolher todos',enabled:true};f.render();return true;`);
    run('click', '[data-act="cancel"]');
    assert.deepEqual(evaluate('return window.fixture.messages;'), [{type:'cancel',gen:recallGen}], 'Recall all must still use native cancellation');
  }
  console.log('Attack-all browser regression passed: 2–4 players, opponent and planeswalker selection, pending confirmation, Escape, stale prompts, recall, desktop and landscape.');
} finally { run('close'); }
