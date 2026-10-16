export const esc = (s: string) =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

const COLORS: Record<string, string> = { W: '#f7f0d2', U: '#67a5d7', B: '#6a5c6b', R: '#e87c61', G: '#79af80', C: '#b7b4ad' };
const NAMES: Record<string, string> = { W: 'branca', U: 'azul', B: 'preta', R: 'vermelha', G: 'verde', C: 'incolor', S: 'de neve', P: 'phyrexiana', T: 'Virar', Q: 'Desvirar', E: 'Energia', X: 'X', Y: 'Y', Z: 'Z' };
const glyphs: Record<string, string> = {
  W: '<circle cx="12" cy="12" r="4"/><path d="M11 0h2v5h-2zm0 19h2v5h-2zM0 11h5v2H0zm19 0h5v2h-5zM3 2l4 4-1 2-4-4zm14 15 5 4-2 2-4-5zM2 20l4-4 2 1-4 5zM17 7l-1-1 4-4 2 2z"/>',
  U: '<path d="M12 1C9 7 4 11 4 16a8 8 0 0 0 16 0c0-5-5-9-8-15zm4 17c-2 3-5 2-5 2 5-2 4-6 5-6 1 0 1 2 0 4z"/>',
  B: '<path d="M12 2a9 9 0 0 0-9 9c0 4 2 6 5 7v4h8v-4c3-1 5-3 5-7a9 9 0 0 0-9-9zM6 10h4v4H6zm8 0h4v4h-4zm-4 6 2-3 2 3z"/>',
  R: '<path d="M14 1c2 7-5 7-3 12 3-1 5-3 6-6 2 3 5 7 3 11a9 9 0 0 1-16-1c-2-5 3-8 5-10-1 5 1 4 2 2 1-2 2-5 3-8z"/>',
  G: '<path d="M12 1 5 8h3l-6 7h8v5H6v3h12v-3h-4v-5h8l-6-7h3z"/>',
  C: '<path d="m12 1 11 11-11 11L1 12zm0 5-6 6 6 6 6-6z"/>',
};
const glyph = (sym: string) => glyphs[sym] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${glyphs[sym]}</svg>` : esc(sym === 'T' ? '↷' : sym === 'Q' ? '↶' : sym === 'S' ? '❄' : sym === 'P' ? 'φ' : sym);

/** Distinct shapes preserve mana identity without relying on color. */
export const pip = (sym: string) => {
  const safe = /^[A-Z0-9/]+$/.test(sym) ? sym : '?';
  const [a, b] = safe.split('/');
  const label = b ? `Mana ${NAMES[a] ?? a} ou ${NAMES[b] ?? b}` : /^\d+$/.test(a) ? `${a} de mana genérica` : ['T','Q','E'].includes(a) ? NAMES[a] : `Mana ${NAMES[a] ?? a}`;
  const style = b ? ` style="background:linear-gradient(135deg, ${COLORS[a] ?? '#cbc5b8'} 50%, ${COLORS[b] ?? COLORS[a] ?? '#cbc5b8'} 50%)"` : '';
  return `<span class="pip pip-${a}" role="img" aria-label="${esc(label)}"${style}>${b ? `<span class="hybrid-glyph" aria-hidden="true">${esc(safe)}</span>` : glyph(a)}</span>`;
};
export function manaHTML(cost: string) {
  return (cost.match(/\{[^}]+\}/g) ?? []).map(s => pip(s.slice(1, -1))).join('');
}
export const richText = (t: string) => esc(t).replace(/\{([A-Z0-9/]+)\}/g, (_, s) => pip(s));
