import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/ui/decisionPrompt.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { cardDecision, selectionMessage } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
function state() {
  return { you: 0, players: [{ id: 0, hand: [{ id: 11 }, { id: 12 }, { id: 13 }] }], input: {
    priority: false, selectable: [11, 12, 13], selection: { cards: [], min: 2, max: 2 }, ok: { enabled: false },
  } };
}
test('mandatory hand selection remains a player task even with both action buttons disabled', () => {
  const s = state();
  assert.equal(cardDecision(s).inHand, true);
  assert.equal(cardDecision(s).instruction, 'Escolha mais 2 cartas.');
  s.input.selection.cards = [12];
  assert.equal(cardDecision(s).progress, '1 de 2 cartas selecionadas');
  assert.equal(cardDecision(s).instruction, 'Escolha mais uma carta.');
  s.input.selection.cards = [12, 13]; s.input.ok.enabled = true;
  assert.equal(cardDecision(s).instruction, 'Você pode confirmar a seleção.');
});
test('optional maximum is not described as a required selection count', () => {
  const s = state(); s.input.selection = { cards: [11], min: 1, max: 3 }; s.input.ok.enabled = true;
  assert.equal(cardDecision(s).progress, '1 carta selecionada · mínimo 1, máximo 3');
  assert.equal(cardDecision(s).instruction, 'Você pode confirmar a seleção.');
  s.input.selection = { cards: [], min: 0, max: 3 };
  assert.equal(cardDecision(s).instruction, 'Você pode confirmar a seleção.');
});
test('battlefield or mixed selections keep their contextual location and never infer discard rules', () => {
  const s = state(); s.input.selectable.push(20);
  assert.equal(cardDecision(s).inHand, false);
  s.input.selectable = []; s.input.selection.cards = [12];
  assert.equal(cardDecision(s).inHand, true);
  s.input.selection.cards = [];
  assert.equal(cardDecision(s).inHand, false);
});
test('opening, questions, finished games and priority do not inherit a card-choice prompt', () => {
  for (const apply of [s => s.input.opening = 'mulligan-bottom', s => s.question = { id: 1 }, s => s.gameOver = true, s => s.input.priority = true, s => delete s.input.selection]) {
    const s = state(); apply(s); assert.equal(cardDecision(s), null);
  }
});
test('cleanup instructions retain the engine hand limit and correct singular/plural', () => {
  assert.equal(selectionMessage('Escolha 1 carta(s) para descartar para levar sua mão ao máximo de 7 cartas.'), 'Escolha 1 carta para descartar para levar sua mão ao máximo de 7 cartas.');
  assert.equal(selectionMessage('Escolha 2 carta(s). Limite: 5.'), 'Escolha 2 cartas. Limite: 5.');
});
