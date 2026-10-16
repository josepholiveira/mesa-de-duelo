export const esc = (s: string) =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

const PIP_COLOR: Record<string, string> = { W: '#f7f0d2', U: '#2f80d6', B: '#6a5c6b', R: '#e3593a', G: '#3d9b54', C: '#b7b4ad' };

/** Símbolo de mana: número/X escritos; híbridos ({W/U}, {2/W}, {U/P}) com as duas metades coloridas. */
export const pip = (sym: string) => {
  const [a, b] = sym.split('/');
  if (b !== undefined) {
    const c1 = PIP_COLOR[a] ?? '#cbc5b8', c2 = b === 'P' ? c1 : PIP_COLOR[b] ?? '#cbc5b8';
    const txt = /^\d+$/.test(a) ? a : b === 'P' ? 'φ' : '';
    return `<span class="pip" style="background:linear-gradient(135deg, ${c1} 50%, ${c2} 50%)">${txt}</span>`;
  }
  return `<span class="pip pip-${sym}">${/^(\d+|X|Y|Z)$/.test(sym) ? sym : ''}</span>`;
};

export function manaHTML(cost: string) {
  return (cost.match(/\{[^}]+\}/g) ?? []).map(s => pip(s.slice(1, -1))).join('');
}

export const richText = (t: string) => esc(t).replace(/\{([WUBRGC]|\d+)\}/g, (_, s) => pip(s));
