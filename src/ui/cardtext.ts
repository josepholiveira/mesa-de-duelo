export const esc = (s: string) =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

export const pip = (sym: string) => `<span class="pip pip-${sym}">${/^\d+$/.test(sym) ? sym : ''}</span>`;

export function manaHTML(cost: string) {
  return (cost.match(/\{[^}]+\}/g) ?? []).map(s => pip(s.slice(1, -1))).join('');
}

export const richText = (t: string) => esc(t).replace(/\{([WUBRGC]|\d+)\}/g, (_, s) => pip(s));
