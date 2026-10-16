import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function source(path) {
  const content = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const { exileShelfCards, canPlayExileCard, validBlockSelection, legalBlockTargets, blockPairAction } = await source('../src/ui/playContext.ts');
const { canDragHandCard, handDropAction } = await source('../src/ui/handDrag.ts');
const { hasLiveDecision, stateWithFrame } = await source('../src/ui/presentationTimeline.ts');
const card = (id, name = 'Raging Goblin') => ({ id, name, controller: 0, tapped: false, token: false });
function state() {
  return { you: 0, gameOver: false, phase: 'MAIN1', turn: 3, activePlayer: 0, stack: [], combat: [], castable: [30], playableExile: [30], suspendedExile: [31],
    input: { gen: 42, priority: true, ok: { enabled: true }, cancel: { enabled: false }, selectable: [], actionable: [30] },
    players: [{ id: 0, hand: [card(1)], battlefield: [card(11), card(12)], exile: [card(30, 'Lightning Bolt'), { ...card(31, 'Rift Bolt'), counters: { TIME: 1 } }, card(32)], graveyard: [] },
      { id: 1, hand: [], battlefield: [card(21), card(22)], exile: [], graveyard: [] }] };
}
function blocking() {
  const s = state(); s.input.priority = false; s.castable = []; s.input.actionable = [11, 12];
  s.input.blocking = { selectedAttacker: 21, attackers: [21, 22], blockers: [11, 12], legalAssignments: [{ blocker: 11, attackers: [21, 22] }, { blocker: 12, attackers: [22] }] };
  return s;
}

test('exile permissions remain visible off turn and without affordable actions; expiry only removes the shelf entry', () => {
  const s = state(); s.input.priority = false; s.castable = []; s.input.actionable = [];
  assert.deepEqual(exileShelfCards(s).map(x => x.card.id), [30, 31]);
  assert.equal(canPlayExileCard(s, 30, 42), false);
  s.playableExile = [];
  assert.deepEqual(exileShelfCards(s).map(x => x.card.id), [31]);
  assert.deepEqual(s.players[0].exile.map(c => c.id), [30, 31, 32]);
});
test('suspend retains TIME zero while engine trigger exists, then leaves shelf when trigger/permission ends', () => {
  const s = state(); s.players[0].exile[1].counters.TIME = 0;
  assert.equal(exileShelfCards(s).find(x => x.card.id === 31).suspended, true);
  s.suspendedExile = [];
  assert.equal(exileShelfCards(s).some(x => x.card.id === 31), false);
  s.input.suspendCast = { card: s.players[0].exile[1] };
  assert.equal(exileShelfCards(s).find(x => x.card.id === 31).choosing, true);
  assert.equal(canPlayExileCard(s, 31, 42), false);
  assert.equal(canDragHandCard(s, 31, 42), false);
});
test('exile click and drag require both a surviving permission and current legal input', () => {
  const s = state(); const intent = { id: 30, gen: 42, x: 10, y: 10 }; const bounds = { left: 0, right: 200, top: 0, bottom: 200 };
  assert.equal(canPlayExileCard(s, 30, 42), true);
  assert.deepEqual(handDropAction(s, intent, 100, 100, bounds), { type: 'card', id: 30, gen: 42 });
  s.input.gen++;
  assert.equal(canPlayExileCard(s, 30, 42), false);
  assert.equal(handDropAction(s, intent, 100, 100, bounds), null);
  s.input.gen = 42; s.playableExile = [];
  assert.equal(canPlayExileCard(s, 30, 42), false);
  assert.equal(handDropAction(s, intent, 100, 100, bounds), null);
});
test('exile visibility never leaks private faces or trusts an ID no longer in exile', () => {
  const s = state(); s.players[0].exile[0].faceDown = true;
  assert.equal(exileShelfCards(s).some(x => x.card.id === 30), false);
  assert.equal(canPlayExileCard(s, 30, 42), false);
  s.players[0].exile.shift();
  assert.equal(canDragHandCard(s, 30, 42), false);
});
test('identical creatures preserve the chosen exact pair instead of the engine preselected attacker', () => {
  const s = blocking(); const selection = { blocker: 11, gen: 42 };
  assert.equal(validBlockSelection(s, selection), true);
  assert.deepEqual(legalBlockTargets(s, selection), [21, 22]);
  assert.deepEqual(blockPairAction(s, selection, 22, 42), { type: 'block', blocker: 11, attacker: 22, gen: 42 });
  assert.equal(s.input.blocking.selectedAttacker, 21);
  assert.deepEqual(blockPairAction(s, { blocker: 12, gen: 42 }, 22, 42), { type: 'block', blocker: 12, attacker: 22, gen: 42 });
  assert.equal(blockPairAction(s, { blocker: 12, gen: 42 }, 21, 42), null);
});
test('existing legal assignment can be toggled off, while stale or missing targets cannot dispatch', () => {
  const s = blocking(); const selected = { blocker: 11, gen: 42 };
  s.combat = [{ attacker: 22, blockers: [11] }];
  assert.equal(blockPairAction(s, selected, 22, 42).attacker, 22);
  s.input.gen++;
  assert.equal(blockPairAction(s, selected, 22, 43), null);
  s.input.gen = 42; s.players[1].battlefield.pop();
  assert.equal(blockPairAction(s, selected, 22, 42), null);
  s.input.blocking.legalAssignments = [];
  assert.equal(blockPairAction(s, selected, 21, 42), null);
});
test('blocking and suspend choices always bypass an older public presentation frame', () => {
  for (const field of ['blocking', 'suspendCast']) {
    const s = state(); s.input.ok.enabled = false; s.input.actionable = []; s.castable = []; s.input.priority = false;
    s.input[field] = field === 'blocking' ? blocking().input.blocking : { card: s.players[0].exile[1] };
    const frame = { turn: 1, phase: 'DRAW', activePlayer: 1, players: [], stack: [], combat: [] };
    assert.equal(hasLiveDecision(s), true);
    assert.equal(stateWithFrame(s, frame), s);
  }
});
