import type { CardDef, Effect, Keyword } from '../engine/types';

export const KW_PT: Record<Keyword, string> = {
  flying: 'Voar', reach: 'Alcance', haste: 'Ímpeto', vigilance: 'Vigilância', trample: 'Atropelar',
  deathtouch: 'Toque Mortífero', lifelink: 'Vínculo com a Vida', first: 'Iniciativa', double: 'Golpe Duplo',
  defender: 'Defensor', menace: 'Ameaçar',
};

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export const pip = (sym: string) => `<span class="pip pip-${sym}">${/^\d+$/.test(sym) ? sym : ''}</span>`;

export function manaHTML(cost: string) {
  return (cost.match(/\{[^}]+\}/g) ?? []).map(s => pip(s.slice(1, -1))).join('');
}

const TARGET_PT = { any: 'qualquer alvo', creature: 'criatura alvo', player: 'jogador alvo', opponent: 'cada oponente' };

export function describeEffect(e: Effect): string {
  switch (e.kind) {
    case 'damage': return `Causa ${e.n} de dano a ${TARGET_PT[e.target]}.`;
    case 'pump': return `Criatura alvo recebe +${e.p}/+${e.t} até o fim do turno.`;
    case 'fight': return 'Uma criatura sua luta com uma criatura alvo do oponente.';
    case 'destroy': return 'Destrói a criatura alvo.';
    case 'draw': return e.n === 1 ? 'Compre uma carta.' : `Compre ${e.n} cartas.`;
    case 'gain': return `Você ganha ${e.n} de vida.`;
  }
}

/** Texto em português do que o motor entende da carta. */
export function describeCard(d: CardDef): string[] {
  const lines: string[] = [];
  if (d.keywords.length) lines.push(d.keywords.map(k => KW_PT[k]).join(', '));
  if (d.entersTapped) lines.push('Entra no campo virado.');
  if (d.produces.length) lines.push(`↷: adicione ${d.produces.map(c => `{${c}}`).join(' ou ')}.`);
  for (const e of d.etb) lines.push(`Ao entrar: ${describeEffect(e).toLowerCase()}`);
  for (const e of d.spell) lines.push(describeEffect(e));
  return lines;
}

export const richText = (t: string) => esc(t).replace(/\{([WUBRGC]|\d+)\}/g, (_, s) => pip(s));
