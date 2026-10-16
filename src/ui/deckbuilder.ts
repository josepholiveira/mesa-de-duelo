import { DEFAULT_DECKS, deckSize, isBasic, loadUserDecks, parseDeckList, saveUserDecks, type DeckData } from '../decks';
import { cardInfo, type CardInfo, type CardType, type Color } from '../cards';
import { cacheGet, fetchByNames, resolveCardNames, searchCards, type ScryCard } from '../scryfall';
import { esc, manaHTML, pip, richText } from './cardtext';
import { deckArt, deckColors } from './lobby';

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
const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAME: Record<Color, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };
/** Atalhos de tipo na busca de cartas: rótulo e o filtro do Scryfall. */
const TYPE_FILTERS: [string, string][] = [
  ['Criatura', 't:creature'], ['Instantânea', 't:instant'], ['Feitiço', 't:sorcery'], ['Artefato', 't:artifact'],
  ['Encantamento', 't:enchantment'], ['Planeswalker', 't:planeswalker'], ['Terreno', 't:land'],
];
/** Faixas da curva de mana: 0, 1, … 5 e "6+". */
const CURVE = ['0', '1', '2', '3', '4', '5', '6+'];

const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
const ICON_BACK = icon('M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z');
const ICON_PLUS = icon('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z');
const ICON_IMPORT = icon('M5 20h14v-2H5zm7-3 5-5-1.4-1.4-2.6 2.6V4h-2v9.2l-2.6-2.6L7 12z');
const ICON_COPY = icon('M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z');
const ICON_TRASH = icon('M9 3h6l1 1h4v2H4V4h4zM6 8h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zm4 2v9h1.5v-9zm2.5 0v9H14v-9z');
const ICON_SEARCH = icon('M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z');
const ICON_LOCK = icon('M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z');

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
  /** Filtro da lista de decks e atalhos da busca de cartas. */
  let listQuery = '';
  const searchColors = new Set<Color>();
  let searchType = '';
  let standardOnly = false;

  root.innerHTML = `
  <div class="builder">
    <header class="builder-head">
      <button class="ghost-btn" data-b="back">${ICON_BACK}<span>Início</span></button>
      <h1>Gerenciar decks</h1>
      <div class="builder-actions">
        <button class="ghost-btn" data-b="import">${ICON_IMPORT}<span>Importar lista</span></button>
        <button class="arena-btn primary" data-b="new">${ICON_PLUS}Novo deck</button>
      </div>
    </header>
    <div class="builder-grid">
      <aside class="panel-box deck-list" aria-label="Decks">
        <label class="list-search">${ICON_SEARCH}<input id="bListQuery" type="search" placeholder="Buscar deck" autocomplete="off" aria-label="Buscar deck"></label>
        <div id="bDecks"></div>
      </aside>
      <section class="panel-box deck-edit" id="bEdit" aria-label="Deck"></section>
      <section class="panel-box card-search" aria-label="Adicionar cartas">
        <h2>Adicionar cartas</h2>
        <form id="bForm" class="search-form">
          <label class="list-search">${ICON_SEARCH}<input id="bQuery" type="search" placeholder="Nome, texto ou busca do Scryfall" autocomplete="off" aria-label="Buscar cartas"></label>
          <button class="arena-btn primary">Buscar</button>
        </form>
        <div class="search-filters">
          <div class="color-filter" role="group" aria-label="Cores">
            ${COLORS.map(c => `<button type="button" class="cf" data-scolor="${c}" aria-pressed="false" title="${COLOR_NAME[c]}">${pip(c)}</button>`).join('')}
          </div>
          <div class="type-chips" role="group" aria-label="Tipo">
            ${TYPE_FILTERS.map(([label, f]) => `<button type="button" class="chip" data-stype="${f}" aria-pressed="false">${label}</button>`).join('')}
            <button type="button" class="chip" data-sstd aria-pressed="false" title="Só cartas legais no Standard">Standard</button>
          </div>
        </div>
        <details class="tips">
          <summary>Dicas de busca</summary>
          <p>Use a sintaxe do Scryfall: <code>c:r</code> cor, <code>t:instant</code> tipo, <code>cmc&lt;=2</code> custo,
          <code>s:fdn</code> coleção, <code>o:"draw a card"</code> texto. As cores marcadas mostram cartas só dessas cores (e incolores).</p>
        </details>
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
    const q = listQuery.toLowerCase();
    const match = (d: DeckData) => !q || d.name.toLowerCase().includes(q);
    const item = (d: DeckData) => {
      const art = deckArt(d);
      return `<li><button class="deck-item ${d.id === selected ? 'on' : ''}" data-select="${d.id}" aria-current="${d.id === selected}">
        <span class="di-cover"${art ? ` style="background-image:url('${art}')"` : ''}></span>
        <span class="di-info">
          <span class="di-name">${esc(d.name)}</span>
          <span class="di-meta">${deckColors(d).map(pip).join('')}<span>${deckSize(d)} cartas</span></span>
        </span>
      </button></li>`;
    };
    const mine = user.filter(match), ready = DEFAULT_DECKS.filter(match);
    $('#bDecks').innerHTML = `
      <h2>Meus decks <small>${user.length}</small></h2>
      ${mine.length ? `<ul>${mine.map(item).join('')}</ul>` : user.length ? '<p class="note">Nenhum deck seu com esse nome.</p>' : `
        <div class="list-empty">
          <p>Você ainda não tem decks.</p>
          <p class="note">Crie um do zero, importe uma lista ou duplique um deck pronto.</p>
        </div>`}
      <h2>Decks prontos <small>${DEFAULT_DECKS.length}</small></h2>
      ${ready.length ? `<ul>${ready.map(item).join('')}</ul>` : '<p class="note">Nenhum deck pronto com esse nome.</p>'}`;
  }

  function renderImport() {
    $('#bEdit').innerHTML = `
      <div class="edit-title"><h2>Importar lista</h2></div>
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
    const countOf = (k: string) => (groups.get(k) ?? []).reduce((s, r) => s + r.e.count, 0);
    const section = (k: string, label: string) => {
      const rows = groups.get(k);
      if (!rows?.length) return '';
      return `<section class="entry-group"><h3>${label} <small>${countOf(k)}</small></h3><ul class="entries">${rows
        .sort((a, b) => (a.def?.cmc ?? 0) - (b.def?.cmc ?? 0) || a.e.name.localeCompare(b.e.name))
        .map(({ e, def }) => {
          const full = e.count >= maxCopies(e.name);
          return `<li class="entry" data-hover="${esc(e.name)}">
          <span class="e-art"${def?.artCrop ? ` style="background-image:url('${def.artCrop}')"` : ''}></span>
          <span class="ename" title="${esc(e.name)}">${esc(def?.label ?? e.name)}</span>
          <span class="ecost">${def ? manaHTML(def.manaCost) : ''}</span>
          ${ro ? `<span class="count">${e.count}</span>` : `<span class="stepper">
            <button class="mini" data-dec="${esc(e.name)}" aria-label="Remover uma ${esc(def?.label ?? e.name)}">−</button>
            <span class="count">${e.count}</span>
            <button class="mini" data-inc="${esc(e.name)}" aria-label="Adicionar uma ${esc(def?.label ?? e.name)}" ${full ? 'disabled' : ''}>+</button>
          </span>`}
        </li>`;
        }).join('')}</ul></section>`;
    };
    const size = deckSize(d);
    const art = deckArt(d);
    // Curva de mana das cartas que não são terreno.
    const curve = CURVE.map(() => 0);
    for (const e of d.cards) {
      const def = defOf(e.name);
      if (def && def.type !== 'land') curve[Math.min(6, Math.round(def.cmc))] += e.count;
    }
    const peak = Math.max(1, ...curve);
    const lands = countOf('land');
    const creatures = countOf('creature');
    const spells = size - lands - creatures - countOf('unknown');
    $('#bEdit').innerHTML = `
      <header class="edit-hero"${art ? ` style="--cover:url('${art}')"` : ''}>
        <div class="edit-title">
          ${ro ? `<h2>${esc(d.name)}</h2>` : `<input id="bName" class="name-input" value="${esc(d.name)}" aria-label="Nome do deck" maxlength="40">`}
          <p class="edit-meta">${deckColors(d).map(pip).join('')}<span class="size ${size < 40 ? 'short' : ''}">${size} cartas</span>
            <span>${ro ? 'Deck pronto' : 'Seu deck'}</span></p>
        </div>
        <div class="edit-actions">
          <button class="ghost-btn" data-b="dup">${ICON_COPY}<span>Duplicar</span></button>
          ${ro ? '' : `<button class="ghost-btn danger" data-b="del">${ICON_TRASH}<span>Excluir</span></button>`}
        </div>
      </header>
      ${ro ? `<div class="ro-banner">${ICON_LOCK}<span>Decks prontos não podem ser alterados.</span>
        <button class="arena-btn primary" data-b="dup">Duplicar para editar</button></div>` : ''}
      ${importReport?.id === d.id && importReport.missing ? `<p class="note error">${esc(importReport.missing)}</p>` : ''}
      ${importReport?.id === d.id && importReport.info ? `<p class="note">${esc(importReport.info)}</p>` : ''}
      ${size && countOf('unknown') ? '<p class="note">Carregando as cartas…</p>' : size ? `<div class="deck-stats">
        <div class="stat-chips">
          <span class="stat"><b>${creatures}</b> criaturas</span>
          <span class="stat"><b>${spells}</b> outras mágicas</span>
          <span class="stat"><b>${lands}</b> terrenos</span>
        </div>
        <div class="curve" aria-label="Curva de mana">
          ${curve.map((n, i) => `<span class="bar" title="${n} carta(s) de custo ${CURVE[i]}"><b>${n || ''}</b><i style="height:${(n / peak) * 100}%"></i><small>${CURVE[i]}</small></span>`).join('')}
        </div>
      </div>` : `<div class="list-empty edit-empty">
        <p>Deck vazio.</p>
        <p class="note">Busque cartas ao lado e toque em <b>+</b> para adicionar. Um deck costuma ter 60 cartas, com uns 24 terrenos.</p>
      </div>`}
      ${size && size < 40 ? '<p class="note warn">Recomendado: pelo menos 40 cartas, cerca de 17 terrenos.</p>' : ''}
      <div class="entry-groups">
        ${TYPE_ORDER.map(k => section(k, TYPE_PT[k])).join('')}
        ${section('unknown', 'Carregando…')}
      </div>`;
  }

  function renderResults() {
    const el = $('#bResults');
    if (searching && !results.length) { el.innerHTML = '<p class="note">Buscando…</p>'; return; }
    if (error) { el.innerHTML = `<p class="note error">${esc(error)}</p>`; return; }
    if (!fullQuery()) {
      el.innerHTML = `<div class="list-empty"><p>Encontre cartas para o deck.</p>
        <p class="note">Digite um nome (em inglês ou português) ou escolha cores e um tipo acima.</p></div>`;
      return;
    }
    const d = current();
    const tiles = results.map(sc => ({ sc, def: cardInfo(sc) })).map(({ sc, def }) => {
      const have = d.cards.find(e => e.name === sc.name)?.count ?? 0;
      const max = maxCopies(sc.name, sc);
      return `<div class="result${have ? ' in-deck' : ''}" data-hover="${esc(sc.name)}">
        <button class="r-img" data-add="${esc(sc.name)}" ${d.builtin || have >= max ? 'disabled' : ''} aria-label="Adicionar ${esc(def.label)}">
          ${def.imageSmall ? `<img src="${def.imageSmall}" alt="" loading="lazy">` : `<span class="noimg">${esc(def.label)}</span>`}
          ${have ? `<span class="r-have">${have}${max < 99 ? `/${max}` : ''}</span>` : ''}
        </button>
        ${d.builtin ? '' : `<div class="r-foot">
          <button class="mini" data-dec="${esc(sc.name)}" ${have ? '' : 'disabled'} aria-label="Remover uma">−</button>
          <span class="r-label" title="${esc(def.label)}">${esc(def.label)}</span>
          <button class="mini" data-add="${esc(sc.name)}" ${have >= max ? 'disabled' : ''} aria-label="Adicionar uma">+</button>
        </div>`}
      </div>`;
    }).join('');
    el.innerHTML = `<p class="note">${total} carta(s)${d.builtin ? ' · duplique o deck para adicionar' : ' · toque na carta para adicionar'}</p>
      ${results.length ? `<div class="result-grid">${tiles}</div>` : ''}
      ${hasMore ? `<button class="arena-btn secondary more-btn" data-b="more" ${searching ? 'disabled' : ''}>${searching ? 'Carregando…' : 'Mais resultados'}</button>` : ''}`;
  }

  /** Texto digitado mais os atalhos de cor, tipo e formato. */
  function fullQuery() {
    return [query, searchColors.size ? `id<=${COLORS.filter(c => searchColors.has(c)).join('').toLowerCase()}` : '',
      searchType, standardOnly ? 'f:standard' : ''].filter(Boolean).join(' ');
  }

  function renderFilters() {
    root.querySelectorAll<HTMLElement>('[data-scolor]').forEach(b => b.setAttribute('aria-pressed', String(searchColors.has(b.dataset.scolor as Color))));
    root.querySelectorAll<HTMLElement>('[data-stype]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.stype === searchType)));
    root.querySelector('[data-sstd]')!.setAttribute('aria-pressed', String(standardOnly));
  }

  function render() { renderList(); renderEdit(); renderResults(); }

  async function ensureDefs() {
    const missing = current().cards.map(e => e.name).filter(n => !cacheGet(n));
    if (!missing.length) return;
    try { await fetchByNames(missing); renderEdit(); } catch { /* sem rede: lista continua com nomes */ }
  }

  /** Cada busca ganha um número; a resposta de uma busca já substituída por outra é descartada. */
  let searchSeq = 0;
  async function runSearch(more = false) {
    const q = fullQuery();
    const seq = ++searchSeq;
    if (!q) { results = []; searching = false; error = ''; renderResults(); return; }
    searching = true; error = '';
    if (!more) { results = []; page = 1; }
    renderResults();
    try {
      const r = await searchCards(q, page);
      if (seq !== searchSeq) return;
      results = more ? [...results, ...r.cards] : r.cards;
      hasMore = r.hasMore; total = r.total;
      page++;
    } catch (e) {
      if (seq !== searchSeq) return;
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
    const btn = t.closest<HTMLElement>('[data-b],[data-select],[data-inc],[data-dec],[data-add],[data-scolor],[data-stype],[data-sstd]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const ds = btn.dataset;
    if (ds.scolor) {
      const c = ds.scolor as Color;
      if (searchColors.has(c)) searchColors.delete(c); else searchColors.add(c);
      renderFilters(); void runSearch(); return;
    }
    if (ds.stype) { searchType = searchType === ds.stype ? '' : ds.stype; renderFilters(); void runSearch(); return; }
    if ('sstd' in ds) { standardOnly = !standardOnly; renderFilters(); void runSearch(); return; }
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
        importing = false; importReport = null;
        user.push(d); selected = d.id; save(); render();
        (root.querySelector('#bName') as HTMLInputElement | null)?.select();
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
    if (t.id === 'bListQuery') { listQuery = t.value.trim(); renderList(); }
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

  /** Cartas de todos os decks, para a lista mostrar capa e cores de cada um. */
  function loadCovers() {
    const names = [...DEFAULT_DECKS, ...user].flatMap(d => d.cards.map(c => c.name)).filter(n => !cacheGet(n));
    if (names.length) fetchByNames(names).then(renderList).catch(() => { /* sem rede: lista sem capas */ });
  }

  render();
  void ensureDefs();
  loadCovers();
  return { refresh() { user = loadUserDecks(); render(); loadCovers(); } };
}
