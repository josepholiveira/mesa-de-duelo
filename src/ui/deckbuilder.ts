import { DEFAULT_DECKS, deckSize, isBasic, loadUserDecks, parseDeckList, saveUserDecks, type DeckData } from '../decks';
import { cardInfo, type CardInfo, type CardType } from '../cards';
import { cacheGet, fetchByNames, resolveCardNames, searchCards, type ScryCard } from '../scryfall';
import { esc, manaHTML, richText } from './cardtext';

const MAX_COPIES = 4;
const NUMBERS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Limite de cópias: 4, exceto terrenos básicos e cartas como Hare Apparent ("A deck can have any number of cards named…"). */
function maxCopies(name: string, sc: ScryCard | null = cacheGet(name)) {
  if (isBasic(name)) return 99;
  const m = sc?.oracle_text?.match(/A deck can have (any number|up to (\w+)) cards named/i);
  if (!m) return MAX_COPIES;
  return m[2] ? NUMBERS[m[2].toLowerCase()] ?? MAX_COPIES : 99;
}
const TYPE_PT: Record<CardType, string> = {
  creature: 'Criaturas', planeswalker: 'Planeswalkers', instant: 'Mágicas instantâneas', sorcery: 'Feitiços',
  artifact: 'Artefatos', enchantment: 'Encantamentos', battle: 'Batalhas', other: 'Outras', land: 'Terrenos',
};
const TYPE_ORDER = Object.keys(TYPE_PT) as CardType[];

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
  let hover: CardInfo | null = null;
  /** Painel "Importar lista" aberto no lugar do editor; draft guarda o que foi digitado. */
  let importing = false;
  let importBusy = false;
  let importError = '';
  let importDraft = { name: '', text: '' };
  /** Aviso mostrado no deck recém-importado (cartas não encontradas, sideboard ignorado). */
  let importReport: { id: string; missing: string; info: string } | null = null;

  root.innerHTML = `
  <div class="builder">
    <header class="builder-head">
      <button class="arena-btn secondary" data-b="back">← Início</button>
      <h1>Decks</h1>
    </header>
    <div class="builder-grid">
      <aside class="panel-box deck-list"><h2>Seus decks</h2><ul id="bDecks"></ul><button class="arena-btn secondary" data-b="new">Novo deck</button>
        <button class="arena-btn secondary" data-b="import">Importar lista</button></aside>
      <section class="panel-box deck-edit" id="bEdit"></section>
      <section class="panel-box search">
        <h2>Buscar cartas no Scryfall</h2>
        <form id="bForm" class="search-form">
          <input id="bQuery" type="search" placeholder="ex.: t:creature c:g cmc<=3" autocomplete="off" aria-label="Busca">
          <button class="arena-btn primary">Buscar</button>
        </form>
        <p class="tips">Sintaxe do Scryfall: <code>c:r</code> cor, <code>t:instant</code> tipo, <code>cmc&lt;=2</code> custo,
          <code>s:fdn</code> coleção, <code>o:"draw a card"</code> texto.</p>
        <div id="bResults" class="results"></div>
      </section>
    </div>
    <div class="builder-preview" id="bPreview" hidden></div>
  </div>`;

  const $ = (s: string) => root.querySelector(s) as HTMLElement;
  const current = (): DeckData => [...DEFAULT_DECKS, ...user].find(d => d.id === selected) ?? DEFAULT_DECKS[0];
  const defOf = (name: string): CardInfo | null => { const sc = cacheGet(name); return sc ? cardInfo(sc) : null; };

  function save() { saveUserDecks(user); opts.onChange(); }

  function renderList() {
    const item = (d: DeckData) => `<li><button class="deck-item ${d.id === selected ? 'on' : ''}" data-select="${d.id}">
      <span>${esc(d.name)}</span><small>${deckSize(d)}${d.builtin ? ' · padrão' : ''}</small></button></li>`;
    $('#bDecks').innerHTML = [...DEFAULT_DECKS, ...user].map(item).join('');
  }

  function renderImport() {
    $('#bEdit').innerHTML = `
      <div class="edit-head"><h2>Importar lista</h2></div>
      <form id="bImport" class="import-form">
        <input id="bImpName" class="name-input" placeholder="Nome do deck" value="${esc(importDraft.name)}" aria-label="Nome do deck">
        <textarea id="bImpText" rows="16" spellcheck="false" aria-label="Lista do deck"
          placeholder="4 Lightning Bolt&#10;4x Goblin Guide (ZEN) 126&#10;20 Mountain&#10;&#10;Sideboard&#10;2 Duress">${esc(importDraft.text)}</textarea>
        <p class="note">Cole a lista exportada do Arena, MTGO, Moxfield ou Archidekt: uma carta por linha, com a quantidade na frente.
          Nomes em inglês ou português. Sideboard e maybeboard ficam de fora.</p>
        ${importError ? `<p class="note error">${esc(importError)}</p>` : ''}
        <div class="edit-actions">
          <button class="arena-btn primary" ${importBusy ? 'disabled' : ''}>${importBusy ? 'Conferindo cartas…' : 'Importar'}</button>
          <button type="button" class="arena-btn secondary" data-b="import-cancel" ${importBusy ? 'disabled' : ''}>Cancelar</button>
        </div>
      </form>`;
  }

  async function runImport() {
    const parsed = parseDeckList(importDraft.text);
    if (!parsed.main.length) { importError = 'Nenhuma carta encontrada na lista.'; renderImport(); return; }
    importBusy = true; importError = ''; renderImport();
    let res: Awaited<ReturnType<typeof resolveCardNames>>;
    try {
      res = await resolveCardNames(parsed.main.map(e => e.name));
    } catch (e) {
      importBusy = false;
      importError = `Não foi possível conferir as cartas no Scryfall: ${(e as Error).message}`;
      renderImport();
      return;
    }
    importBusy = false;
    // Nomes diferentes na lista (ex.: em português e em inglês) podem virar a mesma carta.
    const cards = new Map<string, DeckData['cards'][number]>();
    for (const e of parsed.main) {
      const name = res.found.get(e.name.toLowerCase());
      if (!name) continue;
      const c = cards.get(name);
      if (c) c.count += e.count; else cards.set(name, { name, count: e.count });
    }
    if (!cards.size) { importError = `Nenhuma carta reconhecida: ${res.missing.join(', ')}.`; renderImport(); return; }
    const d: DeckData = { id: crypto.randomUUID(), name: importDraft.name.trim() || 'Deck importado', cards: [...cards.values()] };
    user.push(d); selected = d.id;
    importReport = {
      id: d.id,
      missing: res.missing.length ? `Não encontradas (ficaram de fora): ${res.missing.join(', ')}.` : '',
      info: [parsed.sideboard ? `${parsed.sideboard} carta(s) de sideboard/maybeboard ignorada(s).` : '',
      parsed.skipped.length ? `Linhas ignoradas: ${parsed.skipped.join(' · ')}.` : ''].filter(Boolean).join(' '),
    };
    importing = false; importDraft = { name: '', text: '' };
    save(); render(); void ensureDefs();
  }

  function renderEdit() {
    if (importing) return renderImport();
    const d = current();
    const ro = !!d.builtin;
    const groups = new Map<string, { e: DeckData['cards'][number]; def: CardInfo | null }[]>();
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
        .map(({ e, def }) => `<li class="entry" data-hover="${esc(e.name)}">
          <span class="count">${e.count}</span>
          <span class="ename" title="${esc(e.name)}">${esc(def?.label ?? e.name)}</span>
          <span class="ecost">${def ? manaHTML(def.manaCost) : ''}</span>
          ${ro ? '' : `<button class="mini" data-dec="${esc(e.name)}" aria-label="Remover uma">−</button><button class="mini" data-inc="${esc(e.name)}" aria-label="Adicionar uma">+</button>`}
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
      ${importReport?.id === d.id && importReport.missing ? `<p class="note error">${esc(importReport.missing)}</p>` : ''}
      ${importReport?.id === d.id && importReport.info ? `<p class="note">${esc(importReport.info)}</p>` : ''}
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
    const tiles = results.map(sc => ({ sc, def: cardInfo(sc) })).map(({ sc, def }) => {
      const have = d.cards.find(e => e.name === sc.name)?.count ?? 0;
      const full = have >= maxCopies(sc.name, sc);
      const disabled = d.builtin || full;
      return `<div class="result" data-hover="${esc(sc.name)}">
        ${def.imageSmall ? `<img src="${def.imageSmall}" alt="${esc(def.label)}" loading="lazy">` : `<div class="noimg">${esc(def.label)}</div>`}
        <div class="r-foot">
          <button class="mini add" data-add="${esc(sc.name)}" ${disabled ? 'disabled' : ''}>${have ? `+ (${have})` : '+ Adicionar'}</button>
        </div>
      </div>`;
    }).join('');
    el.innerHTML = `<p class="note">${total} resultado(s).</p>
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
      e.count = Math.max(0, Math.min(maxCopies(name), e.count + delta));
      if (!e.count) d.cards.splice(d.cards.indexOf(e), 1);
    } else if (delta > 0) d.cards.push({ name, count: 1 });
    save(); render();
  }

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-b],[data-select],[data-inc],[data-dec],[data-add]');
    if (!btn) return;
    const ds = btn.dataset;
    if (ds.select) { selected = ds.select; importing = false; importReport = null; render(); void ensureDefs(); return; }
    if (ds.inc) return change(ds.inc, 1);
    if (ds.dec) return change(ds.dec, -1);
    if (ds.add) return change(ds.add, 1);
    switch (ds.b) {
      case 'back': opts.onBack(); break;
      case 'import': importing = true; importError = ''; importReport = null; renderEdit(); break;
      case 'import-cancel': importing = false; importError = ''; renderEdit(); break;
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
    if ((e.target as HTMLElement).id === 'bImport') { if (!importBusy) void runImport(); return; }
    query = ($('#bQuery') as HTMLInputElement).value.trim();
    void runSearch();
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'bImpName') importDraft.name = t.value;
    if (t.id === 'bName') { const d = current(); if (!d.builtin) { d.name = t.value.trim() || 'Sem nome'; save(); renderList(); } }
  });
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'bImpText') importDraft.text = t.value;
    if (t.id === 'bImpName') importDraft.name = t.value;
  });
  root.addEventListener('pointerover', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-hover]');
    const prev = $('#bPreview');
    if (!el) { prev.hidden = true; return; }
    const def = defOf(el.dataset.hover!);
    if (!def || def === hover) return;
    hover = def;
    const lines = def.image ? [] : def.text.split('\n').filter(Boolean);
    prev.innerHTML = `${def.image ? `<img src="${def.image}" alt="${esc(def.label)}">` : ''}
      ${lines.length ? `<div class="preview-text">${lines.map(l => `<p>${richText(l)}</p>`).join('')}</div>` : ''}`;
    prev.hidden = false;
  });
  root.addEventListener('pointerleave', () => { $('#bPreview').hidden = true; hover = null; });

  render();
  void ensureDefs();
  return { refresh() { user = loadUserDecks(); render(); } };
}
