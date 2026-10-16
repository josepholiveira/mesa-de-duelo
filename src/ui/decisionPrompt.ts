import type { FState } from '../forge/client';

/** Selection metadata describes the task without guessing the underlying card rule. */
export function cardDecision(s: FState) {
  const selection = s.input.selection;
  if (!selection || s.gameOver || s.question || s.input.opening || s.input.priority) return null;
  const { min, max, cards } = selection;
  const count = cards.length;
  const remaining = Math.max(0, min - count);
  const hand = new Set(s.players.find(p => p.id === s.you)?.hand.map(c => c.id) ?? []);
  const candidates = [...s.input.selectable, ...cards];
  const inHand = candidates.length > 0 && candidates.every(id => hand.has(id));
  const progress = min === max
    ? `${count} de ${max} ${max === 1 ? 'carta selecionada' : 'cartas selecionadas'}`
    : `${count} ${count === 1 ? 'carta selecionada' : 'cartas selecionadas'} · mínimo ${min}, máximo ${max}`;
  const instruction = remaining > 0
    ? `Escolha ${remaining === 1 ? 'mais uma carta' : `mais ${remaining} cartas`}.`
    : s.input.ok.enabled ? 'Você pode confirmar a seleção.' : 'Selecione as cartas indicadas.';
  return { inHand, progress, instruction };
}

/** Preserve the engine's instruction, replacing its numeric plural placeholders. */
export function selectionMessage(message: string) {
  return message.replace(/(\d+)\s+carta\(s\)/g, (_, n: string) => `${n} ${Number(n) === 1 ? 'carta' : 'cartas'}`);
}
