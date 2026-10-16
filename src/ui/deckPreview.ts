import './decks.css';
import { countEntries, deckEntries, deckSize, type DeckData } from '../decks';
import { cardInfo } from '../cards';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, manaHTML, pip, richText } from './cardtext';
import { deckArt, deckColors, groupedRows, statsHTML } from './deckStats';
import { inspectCard } from './cardInspector';

interface DeckPreviewOptions {
  selected: boolean;
  onPick(): void;
  pickLabel?: string;
  onCopy?(): void;
  onEdit?(): void;
}

/** A readable deck overview; inspecting a card never selects or adds it. */
export function openDeckPreview(deck: DeckData, opts: DeckPreviewOptions) {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dlg = document.createElement('dialog');
  dlg.className = 'deck-preview dw-preview'; dlg.setAttribute('aria-label', `Deck ${deck.name}`);
  const art = deckArt(deck);
  let inspected: string | undefined;
  dlg.innerHTML = `<header class="dp-head"><div class="dw-preview-heading">${art ? `<img src="${esc(art)}" alt="">` : ''}<div><h2>${esc(deck.name)}</h2><p>${deckColors(deck).map(pip).join('')}<span>${deckSize(deck)} cartas · ${countEntries(deck.sideboard ?? [])} no sideboard · ${deck.builtin ? 'Deck pronto' : 'Seu deck'}</span></p></div></div><button type="button" class="dp-close" data-close aria-label="Fechar visualização do deck">×</button></header><div class="dp-main"><div class="dp-body"></div><aside class="dw-preview-card" aria-label="Carta em destaque"><div id="dpCard"></div></aside></div><footer class="dp-foot">${opts.onCopy ? '<button type="button" class="dw-button" data-copy>Criar uma cópia</button>' : ''}${opts.onEdit ? '<button type="button" class="dw-button" data-edit>Editar deck</button>' : ''}<button type="button" class="dw-button" data-close>Fechar</button><button type="button" class="dw-button primary" data-pick ${opts.selected ? 'disabled' : ''}>${opts.selected ? 'Deck escolhido' : esc(opts.pickLabel ?? 'Escolher este deck')}</button></footer>`;
  document.body.append(dlg);

  function show(name?: string) {
    inspected = name;
    const sc = name ? cacheGet(name) : null, info = sc ? cardInfo(sc) : null;
    const el = dlg.querySelector('#dpCard')!;
    el.innerHTML = info ? `<button type="button" class="dw-preview-image" data-inspect="${esc(name!)}" aria-label="Ampliar e ler ${esc(info.label)}">${info.image ? `<img src="${esc(info.image)}" alt="">` : esc(info.label)}</button><h3>${esc(info.label)}</h3><p>${manaHTML(info.manaCost)}</p><div class="dw-oracle">${info.text.split('\n').filter(Boolean).map(p => `<p>${richText(p)}</p>`).join('')}</div>` : '<p class="dw-note">Escolha uma carta para ler seus detalhes.</p>';
  }
  function group(entries: DeckData['cards'], sideboard = false) {
    return groupedRows(entries).map(g => `<section class="dp-group"><h3>${sideboard ? 'Sideboard · ' : ''}${g.label} <small>${countEntries(g.rows)}</small></h3><ul>${g.rows.map(row => `<li><button type="button" class="dp-card" data-card="${esc(row.name)}" aria-label="Ler ${esc(row.info?.label ?? row.name)}, ${row.count} ${row.count === 1 ? 'cópia' : 'cópias'}"><span class="dp-n">${row.count}</span><span class="dp-name">${esc(row.info?.label ?? row.name)}</span><span class="dp-cost">${row.info ? manaHTML(row.info.manaCost) : ''}</span></button></li>`).join('')}</ul></section>`).join('');
  }
  function render() {
    dlg.querySelector('.dp-body')!.innerHTML = `${statsHTML(deck)}<div class="dp-list">${group(deck.cards)}</div>${deck.sideboard?.length ? `<details class="dw-preview-side"><summary>Sideboard <b>${countEntries(deck.sideboard)}</b></summary><div class="dp-list">${group(deck.sideboard, true)}</div></details>` : ''}`;
    show(inspected ?? deck.cards.find(e => cacheGet(e.name))?.name);
  }
  render();
  fetchByNames(deckEntries(deck).map(e => e.name)).then(() => { if (dlg.open) render(); }).catch(() => {
    if (dlg.open) { const p = document.createElement('p'); p.className = 'dw-error'; p.textContent = 'Algumas cartas não puderam ser carregadas. A lista continua disponível.'; dlg.querySelector('.dp-body')?.prepend(p); }
  });
  const hover = (e: Event) => { const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]'); if (card) show(card.dataset.card); };
  dlg.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') hover(e); });
  dlg.addEventListener('focusin', hover);
  dlg.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target === dlg || target.closest('[data-close]')) { dlg.close(); return; }
    const card = target.closest<HTMLElement>('[data-card],[data-inspect]');
    if (card) { inspectCard({ name: card.dataset.card ?? card.dataset.inspect! }, card); return; }
    if (target.closest('[data-pick]')) { dlg.close(); opts.onPick(); }
    if (target.closest('[data-copy]')) { dlg.close(); opts.onCopy?.(); }
    if (target.closest('[data-edit]')) { dlg.close(); opts.onEdit?.(); }
  });
  dlg.addEventListener('close', () => { dlg.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  dlg.showModal();
}
