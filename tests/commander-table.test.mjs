import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function source(path) {
  const content = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const { tablePlayers, validAttackSelection, legalAttackTargets, attackPairAction, legalAttackAllTargets, attackAllAction, canPlayCommander, legalAttackGroupTargets, attackGroupAction, AttackQueue } = await source('../src/ui/commanderTable.ts');
const { hasLiveDecision, stateWithFrame } = await source('../src/ui/presentationTimeline.ts');
const { blockPairAction } = await source('../src/ui/playContext.ts');
function state(count = 4, ownSeat = 2) {
  const players = Array.from({ length: count }, (_, seat) => ({ id: 10 + seat * 13, seat, name: `Player ${seat}`, hand: [], commandZone: [{ id: 900 + seat, name: 'Commander' }], battlefield: [{ id: 100 + seat, controller: 10 + seat * 13 }], eliminated: false }));
  return { you: players[ownSeat % count].id, players, gameOver: false, stack: [], combat: [], input: { gen: 91, selectable: [], priority: false, ok: { enabled: true }, attacking: { attackers: [102], defenders: [{ id: 10, kind: 'player' }, { id: 49, kind: 'player' }, { id: 10, kind: 'card' }], legalAssignments: [{ attacker: 102, defenders: [{ id: 49, kind: 'player' }, { id: 10, kind: 'card' }] }] } } };
}
test('every seat sees itself once and every other seat clockwise for two to four players', () => {
  for (let count = 2; count <= 4; count++) for (let ownSeat = 0; ownSeat < count; ownSeat++) {
    const s = state(count, ownSeat); s.players.reverse();
    const { me, opponents } = tablePlayers(s);
    assert.equal(me.id, s.you);
    assert.deepEqual(opponents.map(p => p.seat), Array.from({ length: count - 1 }, (_, i) => (ownSeat + i + 1) % count));
    assert.equal(new Set([me.id, ...opponents.map(p => p.id)]).size, count);
  }
});
test('attack chooses the exact fourth-player ID and distinguishes colliding card/player IDs', () => {
  const s = state(); s.players[1].battlefield.push({ id: 10 });
  const selected = { attacker: 102, gen: 91 };
  assert.equal(validAttackSelection(s, selected), true);
  assert.deepEqual(attackPairAction(s, selected, { id: 49, kind: 'player' }, 91), { type: 'attack', attacker: 102, defender: 49, defenderKind: 'player', gen: 91 });
  assert.deepEqual(attackPairAction(s, selected, { id: 10, kind: 'card' }, 91), { type: 'attack', attacker: 102, defender: 10, defenderKind: 'card', gen: 91 });
  assert.equal(attackPairAction(s, selected, { id: 10, kind: 'player' }, 91), null);
  assert.equal(attackPairAction(s, selected, { id: 49, kind: 'card' }, 91), null);
});
test('attack refuses stale, eliminated, absent and nonlegal targets', () => {
  const s = state(), selected = { attacker: 102, gen: 91 }, defender = { id: 49, kind: 'player' };
  assert.equal(attackPairAction(s, selected, defender, 90), null);
  s.players[3].eliminated = true;
  assert.deepEqual(legalAttackTargets(s, selected), []);
  s.players[3].eliminated = false; s.input.gen++;
  assert.equal(attackPairAction(s, selected, defender, 92), null);
  s.input.gen = 91; s.players[2].battlefield = [];
  assert.equal(validAttackSelection(s, selected), false);
  s.players[2].battlefield = [{ id: 102 }]; s.spectating = true;
  assert.equal(validAttackSelection(s, selected), false);
});
test('command casting follows permission and own actual player ID, including partner instance IDs', () => {
  const s = state(); s.input.priority = true; delete s.input.attacking; s.castable = [902, 903, 999];
  s.players[2].commandZone.push({ id: 999, name: 'Partner' });
  assert.equal(canPlayCommander(s, 902, 91), true);
  assert.equal(canPlayCommander(s, 999, 91), true);
  assert.equal(canPlayCommander(s, 903, 91), false);
  assert.equal(canPlayCommander(s, 902, 90), false);
  s.input.paying = true; assert.equal(canPlayCommander(s, 902, 91), false);
  s.input.paying = false; s.players[2].commandZone.shift(); assert.equal(canPlayCommander(s, 902, 91), false);
  s.spectating = true; assert.equal(canPlayCommander(s, 999, 91), false);
});
test('block assignment uses selected attacker from any opponent and exact blocker ID', () => {
  const s = state(); delete s.input.attacking;
  s.input.blocking = { selectedAttacker: 100, attackers: [100, 103], blockers: [102], legalAssignments: [{ blocker: 102, attackers: [103] }] };
  assert.deepEqual(blockPairAction(s, { blocker: 102, gen: 91 }, 103, 91), { type: 'block', blocker: 102, attacker: 103, gen: 91 });
  assert.equal(blockPairAction(s, { blocker: 102, gen: 91 }, 100, 91), null);
});

test('attacker metadata bypasses stale presentation even before other buttons become actionable', () => {
  const s = state(); s.input.ok.enabled = false; s.input.cancel = { enabled: false };
  const frame = { players: [], stack: [], combat: [], turn: 1, phase: 'DRAW', activePlayer: 10 };
  assert.equal(hasLiveDecision(s), true);
  assert.equal(stateWithFrame(s, frame), s);
});


test('bulk attack unions exact legal defenders without choosing a default or redirecting creatures', () => {
  const s = state(); s.input.cancel = { enabled: true };
  s.players[2].battlefield.push({ id: 202 }); s.players[1].battlefield.push({ id: 10 });
  s.input.attacking.attackers.push(202);
  s.input.attacking.legalAssignments.push({attacker:202,defenders:[{id:23,kind:'player'},{id:49,kind:'player'}]});
  assert.deepEqual(legalAttackAllTargets(s,91),[{id:49,kind:'player'},{id:10,kind:'card'},{id:23,kind:'player'}]);
  assert.deepEqual(attackAllAction(s,{id:49,kind:'player'},91),{type:'attack-all',defender:49,defenderKind:'player',gen:91});
  assert.deepEqual(attackAllAction(s,{id:10,kind:'card'},91),{type:'attack-all',defender:10,defenderKind:'card',gen:91});
  assert.equal(attackAllAction(s,{id:10,kind:'player'},91),null);
  assert.equal(attackAllAction(s,{id:49,kind:'player'},90),null);
  s.combat=[{attacker:102,defender:49,defenderKind:'player',blockers:[]}];
  assert.deepEqual(legalAttackAllTargets(s,91),[]);
  s.combat=[];s.players[2].eliminated=true;assert.deepEqual(legalAttackAllTargets(s,91),[]);
  s.players[2].eliminated=false;s.input.attacking.legalAssignments=[];assert.deepEqual(legalAttackAllTargets(s,91),[]);
});


test('group assignment intersects exact legal targets, validates the whole batch, and explicitly withdraws', () => {
  const s=state(); s.players[2].battlefield.push({id:202}); s.players[1].battlefield.push({id:10});
  s.input.attacking.attackers.push(202);
  s.input.attacking.legalAssignments.push({attacker:202,defenders:[{id:49,kind:'player'},{id:10,kind:'player'}]});
  assert.deepEqual(legalAttackGroupTargets(s,[102,202],91),[{id:49,kind:'player'}]);
  assert.deepEqual(attackGroupAction(s,[102,202],{id:49,kind:'player'},91),{type:'attack-group',attackers:[102,202],defender:49,defenderKind:'player',gen:91});
  assert.equal(attackGroupAction(s,[102,202],{id:10,kind:'card'},91),null);
  assert.equal(attackGroupAction(s,[102,999],{id:49,kind:'player'},91),null);
  assert.equal(attackGroupAction(s,[102,202],null,90),null);
  assert.deepEqual(attackGroupAction(s,[102,202],null,91),{type:'attack-group',attackers:[102,202],defender:null,gen:91});
});
test('rapid pinned clicks queue until acknowledgement and preserve their original targets', () => {
  const s=state();s.stateVersion=1;
  s.players[2].battlefield.push({id:202},{id:203});s.input.attacking.attackers.push(202,203);
  s.input.attacking.legalAssignments.push(...[202,203].map(attacker=>({attacker,defenders:[{id:49,kind:'player'},{id:23,kind:'player'}]})));
  const q=new AttackQueue();q.observe(s);q.enqueue([102],{id:49,kind:'player'});
  assert.equal(q.next(s).gen,91);
  q.enqueue([202],{id:49,kind:'player'});q.enqueue([203],{id:23,kind:'player'});
  assert.equal(q.next(s),null);
  s.input.gen=92;s.stateVersion++;s.combat.push({attacker:102,defender:49,defenderKind:'player',blockers:[]});
  assert.deepEqual(q.next(s),{type:'attack-group',attackers:[202],defender:49,defenderKind:'player',gen:92});
  s.input.gen=93;s.combat.push({attacker:202,defender:49,defenderKind:'player',blockers:[]});
  assert.equal(q.next(s).defender,23);
  q.enqueue([202],null);s.stateVersion++;s.combat.push({attacker:203,defender:23,defenderKind:'player',blockers:[]});
  assert.deepEqual(q.next(s),{type:'attack-group',attackers:[202],defender:null,gen:93});
  q.enqueue([203],{id:23,kind:'player'});s.turn=2;
  assert.equal(q.next(s),null);assert.equal(q.busy,false);
});
test('queued selections can be cancelled and stale illegal batches never partially send', () => {
  const s=state(),q=new AttackQueue();q.observe(s);q.enqueue([102],{id:49,kind:'player'});q.markSent(s,{type:'attack-group',attackers:[102],defender:49,defenderKind:'player',gen:91});
  q.deselect(102);s.input.gen++;s.combat.push({attacker:102,defender:49,defenderKind:'player',blockers:[]});assert.equal(q.next(s),null);
  q.enqueue([102,999],{id:49,kind:'player'});assert.equal(q.next(s),null);
  q.enqueue([102],{id:49,kind:'player'});delete s.input.attacking;assert.equal(q.next(s),null);
});


test('unrelated state versions and incomplete combat cannot acknowledge an in-flight attack group', () => {
  const s=state();s.stateVersion=1;
  s.players[2].battlefield.push({id:202},{id:203});s.input.attacking.attackers.push(202,203);
  s.input.attacking.legalAssignments.push(...[202,203].map(attacker=>({attacker,defenders:[{id:49,kind:'player'}]})));
  const q=new AttackQueue();q.observe(s);q.enqueue([102,202],{id:49,kind:'player'});q.next(s);
  q.enqueue([203],{id:49,kind:'player'});
  s.stateVersion++;assert.equal(q.next(s),null);assert.deepEqual(q.queuedAttackers,[203]);
  s.input.gen++;assert.equal(q.next(s),null);
  s.combat=[{attacker:102,defender:49,defenderKind:'player',blockers:[]},{attacker:202,defender:49,defenderKind:'card',blockers:[]}];
  assert.equal(q.next(s),null,'Matching numeric ID with wrong kind is not acknowledgement');
  s.combat[1].defenderKind='player';
  assert.deepEqual(q.next(s),{type:'attack-group',attackers:[203],defender:49,defenderKind:'player',gen:92});
});
test('already-satisfied queued actions are skipped without blocking later mutations', () => {
  const s=state();s.stateVersion=1;s.combat=[{attacker:102,defender:49,defenderKind:'player',blockers:[]}];
  const q=new AttackQueue();q.observe(s);q.enqueue([102],{id:49,kind:'player'});
  assert.equal(q.next(s),null);assert.equal(q.busy,false);
  q.enqueue([102],{id:49,kind:'player'});q.enqueue([102],null);
  assert.deepEqual(q.next(s),{type:'attack-group',attackers:[102],defender:null,gen:91});
  q.enqueue([102],null);q.enqueue([102],{id:49,kind:'player'});
  s.stateVersion++;assert.equal(q.next(s),null,'Version changes alone cannot acknowledge withdrawal');
  s.combat=[];assert.deepEqual(q.next(s),{type:'attack-group',attackers:[102],defender:49,defenderKind:'player',gen:91});
  s.stateVersion++;s.combat=[{attacker:102,defender:49,defenderKind:'player',blockers:[]}];q.observe(s);assert.equal(q.busy,false);
});
test('bulk acknowledgement requires every eligible creature and ignores ineligible creatures', () => {
  const s=state();s.stateVersion=1;s.players[2].battlefield.push({id:202});s.input.attacking.attackers.push(202);
  s.input.attacking.legalAssignments.push({attacker:202,defenders:[{id:23,kind:'player'}]});
  const q=new AttackQueue();q.observe(s);q.markSent(s,{type:'attack-all',defender:49,defenderKind:'player',gen:91});
  s.stateVersion++;q.observe(s);assert.equal(q.busy,true);
  s.combat=[{attacker:102,defender:49,defenderKind:'player',blockers:[]}];q.observe(s);assert.equal(q.busy,false);
  q.enqueue([202],null);assert.equal(q.next(s),null,'Already absent withdrawal needs no round trip');assert.equal(q.busy,false);
});
