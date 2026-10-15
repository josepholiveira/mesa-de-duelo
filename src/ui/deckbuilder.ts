import { DEFAULT_DECKS, deckSize, isBasic, loadUserDecks, saveUserDecks, type DeckData } from '../decks';
import { toCardDef, type ScryCard } from '../engine/parse';
import type { CardDef } from '../engine/types';
import { cacheGet, fetchByNames, searchCards } from '../scryfall';
import { describeCard, esc, manaHTML } from './cardtext';

const MAX_COPIES = 4;
const TYPE_ORDER = ['creature', 'instant', 'sorcery', 'land'] as const;
const TYPE_PT = { creature: 'Criaturas', instant: 'Mágicas instantâneas', sorcery: 'Feitiços', land: 'Terrenos' };

export function mountDeckBuilder(root: HTMLElement, opts: { onBack(): void; onChange(): void }) {
  let user = loadUserDecks();
  let selected = user[0]?.id ?? DEFAULT_DECKS[0].id;
  let results: ScryCard[] = [];
  let page = 1;
  let hasMore = false;
  let total = 0;
  let query = '';
  let searching = false;
  let error = '';
  let hideUnsupported = true;
  let hover: CardDef | null = null;

  root.innerHTML = `
  <div class="builder">
    <header class="builder-head">
      <button class="arena-btn secondary" data-b="back">← Início</button>
      <h1>Decks</h1>
    </header>
    <div class="builder-grid">
      <aside class="panel-box deck-list"><h2>Seus decks</h2><ul id="bDecks"></ul><button class="arena-btn secondary" data-b="new">Novo deck</button></aside>
      <section class="panel-box deck-edit" id="bEdit"></section>
      <section class="panel-box search">
        <h2>Buscar cartas no Scryfall</h2>
        <form id="bForm" class="search-form">
          <input id="bQuery" type="search" placeholder="ex.: t:creature c:g cmc<=3" autocomplete="off" aria-label="Busca">
          <button class="arena-btn primary">Buscar</button>
        </form>
        <p class="tips">Sintaxe do Scryfall: <code>c:r</code> cor, <code>t:instant</code> tipo, <code>cmc&lt;=2</code> custo,
          <code>s:fdn</code> coleção, <code>o:"draw a card"</code> texto.
          <label><input type="checkbox" id="bHide" checked> Mostrar só cartas que o motor do navegador entende (no Forge todas funcionam)</label></p>
        <div id="bResults" class="results"></div>
      </section>
    </div>
    <div class="builder-preview" id="bPreview" hidden></div>
  </div>`;

  const $ = (s: string) => root.querySelector(s) as HTMLElement;
  const current = (): DeckData => [...DEFAULT_DECKS, ...user].find(d => d.id === selected) ?? DEFAULT_DECKS[0];
  const defOf = (name: string): CardDef | null => { const sc = cacheGet(name); return sc ? toCardDef(sc) : null; };

  function save() { saveUserDecks(user); opts.onChange(); }

  function renderList() {
    const item = (d: DeckData) => `<li><button class="deck-item ${d.id === selected ? 'on' : ''}" data-select="${d.id}">
      <span>${esc(d.name)}</span><small>${deckSize(d)}${d.builtin ? ' · padrão' : ''}</small></button></li>`;
    $('#bDecks').innerHTML = [...DEFAULT_DECKS, ...user].map(item).join('');
  }

  function renderEdit() {
    const d = current();
    const ro = !!d.builtin;
    const groups = new Map<string, { e: DeckData['cards'][number]; def: CardDef | null }[]>();
    for (const e of d.cards) {
      const def = defOf(e.name);
      const k = def?.type ?? 'unknown';
      groups.set(k, [...(groups.get(k) ?? []), { e, def }]);
    }
    const section = (k: string, label: string) => {
      const rows = groups.get(k);
      if (!rows?.length) return '';
      const n = rows.reduce((s, r) => s + r.e.count, 0);
      return `<h3>${label} <small>${n}</small></h3><ul class="entries">${rows
        .sort((a, b) => (a.def?.cmc ?? 0) - (b.def?.cmc ?? 0) || a.e.name.localeCompare(b.e.name))
        .map(({ e, def }) => `<li class="entry ${def && !def.supported ? 'bad' : ''}" data-hover="${esc(e.name)}">
          <span class="count">${e.count}</span>
          <span class="ename" title="${esc(e.name)}">${esc(def?.label ?? e.name)}</span>
          <span class="ecost">${def ? manaHTML(def.manaCost) : ''}</span>
          ${ro ? '' : `<button class="mini" data-dec="${esc(e.name)}" aria-label="Remover uma">−</button><button class="mini" data-inc="${esc(e.name)}" aria-label="Adicionar uma">+</button>`}
          ${def && !def.supported ? `<span class="why">Só no Forge (no navegador é ignorada): ${esc(def.problem ?? '')}</span>` : ''}
        </li>`).join('')}</ul>`;
    };
    const size = deckSize(d);
    $('#bEdit').innerHTML = `
      <div class="edit-head">
        ${ro ? `<h2>${esc(d.name)}</h2>` : `<input id="bName" class="name-input" value="${esc(d.name)}" aria-label="Nome do deck">`}
        <span class="size ${size < 40 ? 'short' : ''}">${size} cartas</span>
      </div>
      <div class="edit-actions">
        <button class="arena-btn secondary" data-b="dup">Duplicar</button>
        ${ro ? '<span class="note">Deck padrão: duplique para editar.</span>' : '<button class="arena-btn secondary danger" data-b="del">Excluir</button>'}
      </div>
      ${size < 40 ? '<p class="note">Recomendado: pelo menos 40 cartas, cerca de 17 terrenos.</p>' : ''}
      ${TYPE_ORDER.map(k => section(k, TYPE_PT[k])).join('')}
      ${section('unknown', 'Carregando…')}`;
  }

  function renderResults() {
    const el = $('#bResults');
    if (searching && !results.length) { el.innerHTML = '<p class="note">Buscando…</p>'; return; }
    if (error) { el.innerHTML = `<p class="note error">${esc(error)}</p>`; return; }
    if (!query) { el.innerHTML = '<p class="note">Digite uma busca para encontrar cartas.</p>'; return; }
    const d = current();
    const items = results.map(sc => ({ sc, def: toCardDef(sc) })).filter(x => !hideUnsupported || x.def.supported);
    const tiles = items.map(({ sc, def }) => {
      const have = d.cards.find(e => e.name === sc.name)?.count ?? 0;
      const full = !isBasic(sc.name) && have >= MAX_COPIES;
      const disabled = d.builtin || full;
      return `<div class="result ${def.supported ? '' : 'bad'}" data-hover="${esc(sc.name)}">
        ${def.imageSmall ? `<img src="${def.imageSmall}" alt="${esc(def.label)}" loading="lazy">` : `<div class="noimg">${esc(def.label)}</div>`}
        <div class="r-foot">
          ${def.supported ? `<span class="ok">Funciona nos dois motores</span>` : `<span class="no" title="${esc(def.problem ?? '')}">Só no Forge: ${esc(def.problem ?? '')}</span>`}
          <button class="mini add" data-add="${esc(sc.name)}" ${disabled ? 'disabled' : ''}>${have ? `+ (${have})` : '+ Adicionar'}</button>
        </div>
      </div>`;
    }).join('');
    el.innerHTML = `<p class="note">${total} resultado(s)${hideUnsupported ? `, ${items.length} suportado(s) nesta página` : ''}.</p>
      <div class="result-grid">${tiles}</div>
      ${hasMore ? `<button class="arena-btn secondary" data-b="more" ${searching ? 'disabled' : ''}>${searching ? 'Carregando…' : 'Mais resultados'}</button>` : ''}`;
  }

  function render() { renderList(); renderEdit(); renderResults(); }

  async function ensureDefs() {
    const missing = current().cards.map(e => e.name).filter(n => !cacheGet(n));
    if (!missing.length) return;
    try { await fetchByNames(missing); renderEdit(); } catch { /* sem rede: lista continua com nomes */ }
  }

  async function runSearch(more = false) {
    if (!query) return;
    searching = true; error = '';
    if (!more) { results = []; page = 1; }
    renderResults();
    try {
      const r = await searchCards(query, page);
      results = more ? [...results, ...r.cards] : r.cards;
      hasMore = r.hasMore; total = r.total;
      page++;
    } catch (e) {
      error = `Não foi possível buscar: ${(e as Error).message}`;
    }
    searching = false;
    renderResults();
  }

  function change(name: string, delta: number) {
    const d = current();
    if (d.builtin) return;
    const e = d.cards.find(x => x.name === name);
    if (e) {
      e.count = Math.max(0, Math.min(isBasic(name) ? 99 : MAX_COPIES, e.count + delta));
      if (!e.count) d.cards.splice(d.cards.indexOf(e), 1);
    } else if (delta > 0) d.cards.push({ name, count: 1 });
    save(); render();
  }

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-b],[data-select],[data-inc],[data-dec],[data-add]');
    if (!btn) return;
    const ds = btn.dataset;
    if (ds.select) { selected = ds.select; render(); void ensureDefs(); return; }
    if (ds.inc) return change(ds.inc, 1);
    if (ds.dec) return change(ds.dec, -1);
    if (ds.add) return change(ds.add, 1);
    switch (ds.b) {
      case 'back': opts.onBack(); break;
      case 'new': {
        const d: DeckData = { id: crypto.randomUUID(), name: 'Novo deck', cards: [] };
        user.push(d); selected = d.id; save(); render();
        break;
      }
      case 'dup': {
        const src = current();
        const d: DeckData = { id: crypto.randomUUID(), name: `${src.name} (cópia)`, cards: src.cards.map(c => ({ ...c })) };
        user.push(d); selected = d.id; save(); render();
        break;
      }
      case 'del': {
        const d = current();
        if (!confirm(`Excluir o deck "${d.name}"?`)) break;
        user = user.filter(x => x.id !== d.id);
        selected = user[0]?.id ?? DEFAULT_DECKS[0].id;
        save(); render();
        break;
      }
      case 'more': void runSearch(true); break;
    }
  });
  root.addEventListener('submit', e => {
    e.preventDefault();
    query = ($('#bQuery') as HTMLInputElement).value.trim();
    void runSearch();
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'bHide') { hideUnsupported = t.checked; renderResults(); }
    if (t.id === 'bName') { const d = current(); if (!d.builtin) { d.name = t.value.trim() || 'Sem nome'; save(); renderList(); } }
  });
  root.addEventListener('pointerover', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hover]');
    const prev = $('#bPreview');
    if (!el) { prev.hidden = true; return; }
    const def = defOf(el.dataset.hover!);
    if (!def || def === hover) return;
    hover = def;
    const lines = def.supported ? describeCard(def) : [`Não suportada: ${def.problem}`];
    prev.innerHTML = `${def.image ? `<img src="${def.image}" alt="${esc(def.label)}">` : ''}
      ${lines.length ? `<div class="preview-text">${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}`;
    prev.hidden = false;
  });
  root.addEventListener('pointerleave', () => { $('#bPreview').hidden = true; hover = null; });

  render();
  void ensureDefs();
  return { refresh() { user = loadUserDecks(); render(); } };
}
