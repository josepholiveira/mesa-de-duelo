import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('../src/ui/phaseHud.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext));
const { phaseHudHTML } = await import(uri(source));
const state = { turn: 4, phase: 'MAIN1', activePlayer: 1, you: 1, players: [{ id: 1, name: 'Você' }, { id: 2, name: 'Oponente' }], gameOver: false };
const current = html => html.match(/<li[^>]+aria-current="step"[^>]*>.*?<span>([^<]+)<\/span>/)?.[1];

test('the full informational turn track survives phase changes without adding game controls', () => {
  for (const phase of ['UNTAP', 'UPKEEP', 'DRAW', 'MAIN1', 'COMBAT_DAMAGE', 'MAIN2', 'END_OF_TURN']) {
    const input = structuredClone({ ...state, phase });
    const before = structuredClone(input);
    const html = phaseHudHTML(input);
    assert.equal((html.match(/<li /g) ?? []).length, 7);
    assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
    for (const label of ['Desvirar', 'Manutenção', 'Compra', 'Principal 1', 'Combate', 'Principal 2', 'Final']) assert.ok(html.includes(label));
    assert.doesNotMatch(html, /<button|data-act|role="button"|tabindex=/);
    assert.deepEqual(input, before);
  }
});
test('cleanup and combat decisions expose the precise step while retaining their phase', () => {
  const cleanup = phaseHudHTML({ ...state, phase: 'CLEANUP' });
  assert.equal(current(cleanup), 'Final'); assert.match(cleanup, />Limpeza</);
  for (const [phase, detail] of [['COMBAT_DECLARE_ATTACKERS', 'Declaração de atacantes'], ['COMBAT_DECLARE_BLOCKERS', 'Declaração de bloqueadores'], ['COMBAT_FIRST_STRIKE_DAMAGE', 'Dano de iniciativa'], ['COMBAT_DAMAGE', 'Dano de combate']]) {
    const html = phaseHudHTML({ ...state, phase });
    assert.equal(current(html), 'Combate'); assert.ok(html.includes(detail));
  }
});
test('unknown or completed phases never imply an active decision', () => {
  const unknown = phaseHudHTML({ ...state, phase: 'FUTURE_PHASE' });
  assert.equal(current(unknown), undefined);
  assert.match(unknown, /Aguardando o início do turno/);
  const finished = phaseHudHTML({ ...state, gameOver: true });
  assert.equal(current(finished), undefined);
  assert.match(finished, /Jogo concluído/);
});
test('turn owner is explicit and player names remain escaped', () => {
  assert.match(phaseHudHTML(state), /Seu turno/);
  assert.match(phaseHudHTML({ ...state, activePlayer: 2 }), /Turno do oponente/);
  const html = phaseHudHTML({ ...state, activePlayer: 2, players: [{ id: 2, name: '<img src=x>' }] });
  assert.match(html, /Turno de &lt;img src=x&gt;/);
  assert.doesNotMatch(html, /<img/);
});
