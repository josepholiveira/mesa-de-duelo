import { deckSize, type DeckData } from '../decks';
import { cardInfo, type CardInfo, type CardType } from '../cards';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, manaHTML, pip } from './cardtext';
import { deckArt, deckColors } from './lobby';

const GROUPS: [CardType, string][] = [
  ['creature', 'Criaturas'], ['planeswalker', 'Planeswalkers'], ['instant', 'Instantâneas'], ['sorcery', 'Feitiços'],
  ['artifact', 'Artefatos'], ['enchantment', 'Encantamentos'], ['battle', 'Batalhas'], ['other', 'Outras'], ['land', 'Terrenos'],
];
/** Faixas da curva de mana: 0, 1, … 5 e "6+". */
const CURVE = ['0', '1', '2', '3', '4', '5', '6+'];

interface Row { count: number; name: string; info?: CardInfo }

function rows(deck: DeckData): Row[] {
  return deck.cards.map(e => { const sc = cacheGet(e.name); return { ...e, info: sc ? cardInfo(sc) : undefined }; });
}

function body(deck: DeckData) {
  const all = rows(deck);
  const known = all.filter(r => r.info);
  const spells = known.filter(r => r.info!.type !== 'land');
  const curve = CURVE.map(() => 0);
  for (const r of spells) curve[Math.min(6, Math.round(r.info!.cmc))] += r.count;
  const peak = Math.max(1, ...curve);
  const spellCount = spells.reduce((s, r) => s + r.count, 0);
  const avg = spellCount ? spells.reduce((s, r) => s + r.info!.cmc * r.count, 0) / spellCount : 0;

  const row = (r: Row) => `<li><button class="dp-card" data-card="${esc(r.name)}">
      <span class="dp-n">${r.count}</span><span class="dp-name">${esc(r.info?.label ?? r.name)}</span>
      <span class="dp-cost">${r.info ? manaHTML(r.info.manaCost) : ''}</span>
    </button></li>`;
  const group = (label: string, list: Row[]) => list.length ? `<section class="dp-group">
      <h3>${label} <small>${list.reduce((s, r) => s + r.count, 0)}</small></h3>
      <ul>${list.map(row).join('')}</ul>
    </section>` : '';
  const byCost = (a: Row, b: Row) => a.info!.cmc - b.info!.cmc || a.name.localeCompare(b.name);

  return `
    <div class="dp-stats">
      <div class="dp-curve" aria-label="Curva de mana">
        ${curve.map((n, i) => `<span class="dp-bar" title="${n} carta(s) de custo ${CURVE[i]}">
          <b>${n || ''}</b><i style="height:${(n / peak) * 100}%"></i><small>${CURVE[i]}</small></span>`).join('')}
      </div>
      <p class="dp-avg">Custo médio <b>${avg.toFixed(1).replace('.', ',')}</b></p>
    </div>
    <div class="dp-list">
      ${GROUPS.map(([t, label]) => group(label, known.filter(r => r.info!.type === t).sort(byCost))).join('')}
      ${group('Carregando…', all.filter(r => !r.info))}
    </div>`;
}

/** Janela com a lista do deck por tipo, a curva de mana e a carta ampliada ao passar o mouse. */
export function openDeckPreview(deck: DeckData, opts: { selected: boolean; onPick(): void }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'deck-preview';
  dlg.setAttribute('aria-label', `Deck ${deck.name}`);
  const art = deckArt(deck);
  dlg.innerHTML = `
    <header class="dp-head"${art ? ` style="background-image:linear-gradient(90deg, #0d1426 30%, rgba(13, 20, 38, 0.55)), url('${art}')"` : ''}>
      <div>
        <h2>${esc(deck.name)}</h2>
        <p>${deckColors(deck).map(pip).join('')}<span>${deckSize(deck)} cartas · ${deck.builtin ? 'Deck pronto' : 'Seu deck'}</span></p>
      </div>
      <button class="dp-close" data-close aria-label="Fechar">✕</button>
    </header>
    <div class="dp-main">
      <div class="dp-body"></div>
      <figure class="dp-zoom" aria-hidden="true"><img alt=""></figure>
    </div>
    <footer class="dp-foot">
      <button class="arena-btn secondary" data-close>Fechar</button>
      <button class="arena-btn primary" data-pick ${opts.selected ? 'disabled' : ''}>${opts.selected ? 'Deck escolhido' : 'Escolher este deck'}</button>
    </footer>`;
  document.body.append(dlg);

  const zoom = dlg.querySelector<HTMLElement>('.dp-zoom')!;
  const img = zoom.querySelector('img')!;
  const show = (name: string | undefined, pinned = false) => {
    const sc = name ? cacheGet(name) : null;
    const src = sc && cardInfo(sc).image;
    if (src) img.src = src;
    zoom.classList.toggle('empty', !src);
    zoom.classList.toggle('pinned', pinned && !!src);
  };
  const render = () => {
    dlg.querySelector('.dp-body')!.innerHTML = body(deck);
    // Começa mostrando a carta que dá a arte do deck.
    show(rows(deck).find(r => r.info?.artCrop === art)?.name);
  };
  render();
  if (deck.cards.some(e => !cacheGet(e.name))) fetchByNames(deck.cards.map(e => e.name)).then(() => dlg.open && render()).catch(() => {});

  dlg.addEventListener('mouseover', e => { const c = (e.target as HTMLElement).closest<HTMLElement>('[data-card]'); if (c) show(c.dataset.card); });
  dlg.addEventListener('focusin', e => { const c = (e.target as HTMLElement).closest<HTMLElement>('[data-card]'); if (c) show(c.dataset.card); });
  dlg.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t === dlg || t.closest('[data-close]')) return dlg.close();
    // Em telas estreitas a carta ampliada abre por cima da lista; um toque nela fecha.
    if (t.closest('.dp-zoom')) return zoom.classList.remove('pinned');
    const c = t.closest<HTMLElement>('[data-card]');
    if (c) return show(c.dataset.card, true);
    if (t.closest('[data-pick]')) { opts.onPick(); dlg.close(); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
