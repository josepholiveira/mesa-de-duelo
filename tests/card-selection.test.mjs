import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function source(path) {
  const code = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const { selectedForInput, canSelectExileCard, canPlayExileCard } = await source('../src/ui/playContext.ts');
const { stateWithFrame } = await source('../src/ui/presentationTimeline.ts');
function state() { return { gameOver: false, input: { gen: 8, priority: false, ok: {enabled:false}, cancel: {enabled:true}, selectable: [11, 12], actionable: [], selection: { cards: [], min: 2, max: 2 } }, players: [{id:0,exile:[{id:11,name:'Mountain',faceDown:false}]}] }; }

test('selected cost feedback follows exact engine IDs, not hover or eligibility', () => {
  const s = state();
  assert.equal(selectedForInput(s, 11), false);
  s.input.selection.cards = [12];
  assert.equal(selectedForInput(s, 11), false);
  assert.equal(selectedForInput(s, 12), true);
  s.input.gen++; s.input.selection.cards = [11, 12];
  assert.equal(selectedForInput(s, 11), true);
  assert.equal(selectedForInput(s, 12), true);
  s.input.gen++; s.input.selection.cards = [11];
  assert.equal(selectedForInput(s, 12), false);
  delete s.input.selection;
  assert.equal(selectedForInput(s, 11), false);
});
test('selected cost state cannot survive a priority/question transition', () => {
  const s = state(); s.input.selection.cards = [11];
  s.input.priority = true; assert.equal(selectedForInput(s, 11), false);
  s.input.priority = false; s.question = {id:1}; assert.equal(selectedForInput(s, 11), false);
});
test('actual exile selection does not grant play permission and rejects stale generations', () => {
  const s = state();
  assert.equal(canSelectExileCard(s, 11, 8), true);
  assert.equal(canPlayExileCard(s, 11, 8), false);
  assert.equal(canSelectExileCard(s, 11, 7), false);
  s.input.selectable = []; s.input.selection.cards = [11];
  assert.equal(canSelectExileCard(s, 11, 8), true, 'selected card remains available for deselection');
  delete s.input.selection;
  assert.equal(canSelectExileCard(s, 11, 8), false);
});
test('card choice bypasses visual history even before buttons are enabled', () => {
  const s = state(); s.input.cancel.enabled = false; s.input.selectable = [];
  assert.equal(stateWithFrame(s, {turn:0,players:[],stack:[]}), s);
});
