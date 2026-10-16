import { allDecks, deckSize, type DeckData } from '../decks';
import { FORGE_URL } from '../forge/client';
import { cardInfo, type CardInfo, type Color } from '../cards';
import { cacheGet, fetchByNames } from '../scryfall';
import { mountChangelog } from './changelog';
import { esc, pip } from './cardtext';
import { openDeckPreview } from './deckPreview';

const COLOR_ORDER: Color[] = ['W', 'U', 'B', 'R', 'G'];
const COLOR_NAME: Record<Color, string> = { W: 'Branco', U: 'Azul', B: 'Preto', R: 'Vermelho', G: 'Verde' };

function cachedDefs(deck: DeckData): CardInfo[] {
  return deck.cards.flatMap(e => { const sc = cacheGet(e.name); return sc ? [cardInfo(sc)] : []; });
}

export function deckColors(deck: DeckData): Color[] {
  const set = new Set<Color>();
  for (const d of cachedDefs(deck)) for (const c of d.colors) set.add(c);
  return COLOR_ORDER.filter(c => set.has(c));
}

/** Arte da criatura mais cara do deck, usada como retrato do jogador; sem criaturas, a da carta (não terreno) mais cara. */
export function deckArt(deck: DeckData): string | undefined {
  const defs = cachedDefs(deck).filter(d => d.artCrop).sort((a, b) => b.cmc - a.cmc);
  return (defs.find(d => d.type === 'creature') ?? defs.find(d => d.type !== 'land'))?.artCrop;
}

export interface Lobby {
  refresh(): void;
  setStatus(msg: string, error?: boolean): void;
  /** Mostra o código da sala criada enquanto o oponente não entra; null esconde. */
  showRoom(code: string | null): void;
}

type Mode = 'ai' | 'net';
type Source = 'all' | 'builtin' | 'mine';
const MODE_KEY = 'mesa:mode';
const NAME_KEY = 'mesa:name';
const URL_KEY = 'mesa:forgeUrl';
const DECK_KEY = 'mesa:deck';
const OPP_KEY = 'mesa:opp';

function load(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ }
}

const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
const ICON_AI = icon('M11 2h2v3h4a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4zM9 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-6 5v1.5h6V15zM1 10h2v5H1zm20 0h2v5h-2z');
const ICON_NET = icon('M8 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm8 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 13c3.6 0 6.5 1.8 6.5 4.5V20h-13v-2.5C1.5 14.8 4.4 13 8 13zm8 .5c3 0 5.5 1.5 5.5 3.8V20h-5v-2.5c0-1.5-.6-2.8-1.7-3.8.4-.1.8-.2 1.2-.2z');
const ICON_DECKS = icon('M7 2h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v13h11V4zM2 7h2v13a1 1 0 0 0 1 1h12v2H5a3 3 0 0 1-3-3z');
const ICON_SEARCH = icon('M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z');
const ICON_PLAY = icon('M7 4v16l13-8z');
const ICON_EYE = icon('M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z');
const ICON_CHECK = icon('m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6L21 7.5 19.6 6z');

export interface LobbyOptions {
  onPlay(you: DeckData, opp: DeckData): void;
  onHost(you: DeckData, name: string, url: string): void;
  onJoin(you: DeckData, name: string, code: string, url: string): void;
  onCancelRoom(): void;
  onDecks(): void;
}

export function mountLobby(root: HTMLElement, opts: LobbyOptions): Lobby {
  let youId = load(DECK_KEY) ?? '';
  let oppId = load(OPP_KEY) ?? 'random';
  let mode: Mode = load(MODE_KEY) === 'net' ? 'net' : 'ai';
  let query = '';
  let source: Source = 'all';
  const colorFilter = new Set<Color>();

  root.innerHTML = `
  <div class="lobby">
    <div class="mat" aria-hidden="true"></div>
    <header class="lobby-top">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div><h1>Mesa de Duelo</h1><p>MTG no navegador web e mobile, inspirado no Arena e cartas do Scryfall.</p></div>
      </div>
      <div class="top-actions">
        <button class="ghost-btn" data-lobby="decks">${ICON_DECKS}<span>Gerenciar decks</span></button>
      </div>
    </header>
    <main class="lobby-main">
      <section class="pick" aria-label="Escolhas">
        <div class="step"><span class="step-n">1</span><h2>Como você quer jogar?</h2></div>
        <div class="modes" role="radiogroup" aria-label="Modo de jogo">
          <label class="mode-card"><input type="radio" name="mode" value="ai">
            <span class="mode-icon">${ICON_AI}</span>
            <span class="mode-text"><b>Contra a IA</b><small>A IA do Forge joga do outro lado. Bom para treinar e testar decks.</small></span>
            <span class="mode-check">${ICON_CHECK}</span>
          </label>
          <label class="mode-card"><input type="radio" name="mode" value="net">
            <span class="mode-icon">${ICON_NET}</span>
            <span class="mode-text"><b>Em rede</b><small>Contra outra pessoa: crie uma sala e passe o código, ou entre com um código.</small></span>
            <span class="mode-check">${ICON_CHECK}</span>
          </label>
        </div>

        <div class="step"><span class="step-n">2</span><h2>Escolha seu deck</h2><span class="step-count" id="deckCount"></span></div>
        <div class="deck-tools">
          <label class="search">${ICON_SEARCH}<input id="deckSearch" type="search" placeholder="Buscar deck" autocomplete="off" aria-label="Buscar deck"></label>
          <div class="seg" role="radiogroup" aria-label="Origem dos decks">
            <label><input type="radio" name="source" value="all" checked>Todos</label>
            <label><input type="radio" name="source" value="builtin">Prontos</label>
            <label><input type="radio" name="source" value="mine">Meus</label>
          </div>
          <div class="color-filter" role="group" aria-label="Filtrar por cor">
            ${COLOR_ORDER.map(c => `<button class="cf" data-color="${c}" aria-pressed="false" title="${COLOR_NAME[c]}">${pip(c)}</button>`).join('')}
          </div>
        </div>
        <div class="deck-tiles" id="tiles"></div>
      </section>

      <aside class="match" aria-label="Partida">
        <div class="step"><span class="step-n">3</span><h2>Partida</h2></div>
        <div class="versus" id="versus"></div>
        <div id="aiPanel" class="match-panel">
          <label class="field-label" for="oppSel">Oponente da IA</label>
          <select id="oppSel" class="input-field"></select>
          <button class="arena-btn primary big play-btn" data-lobby="play">${ICON_PLAY}Jogar</button>
        </div>
        <div id="netPanel" class="match-panel" hidden>
          <label class="field-label" for="netName">Seu nome</label>
          <input id="netName" class="input-field" maxlength="24" autocomplete="nickname" placeholder="Jogador">
          <button class="arena-btn primary play-btn" data-lobby="host">Criar sala</button>
          <div class="net-or"><span>ou entre numa sala</span></div>
          <form class="net-join" data-join>
            <input id="netCode" class="input-field" maxlength="4" autocomplete="off" spellcheck="false" placeholder="CÓDIGO" aria-label="Código da sala">
            <button class="arena-btn secondary">Entrar</button>
          </form>
          <details class="net-adv">
            <summary>Endereço da ponte</summary>
            <input id="netUrl" class="input-field" spellcheck="false" placeholder="${FORGE_URL}" aria-label="Endereço da ponte">
            <p>Quem cria a sala roda a ponte aceitando conexões de fora (<code>npm run forge:rede</code>). Quem entra usa o endereço dessa ponte.</p>
          </details>
          <div class="net-wait" id="netWait" hidden></div>
        </div>
        <p class="lobby-status" id="status" role="status"></p>
      </aside>
    </main>
  </div>`;

  const $ = (s: string) => root.querySelector(s) as HTMLElement;

  function visible(decks: DeckData[]) {
    const q = query.toLowerCase();
    return decks.filter(d =>
      (source === 'all' || (source === 'builtin') === !!d.builtin)
      && (!q || d.name.toLowerCase().includes(q))
      && [...colorFilter].every(c => deckColors(d).includes(c)));
  }

  const artStyle = (d: DeckData | undefined) => {
    const art = d && deckArt(d);
    return art ? ` style="background-image:url('${art}')"` : '';
  };

  function side(cls: string, who: string, d: DeckData | undefined, fallback: string) {
    return `<div class="vs-side ${cls}">
      <span class="vs-art${d ? '' : ' unknown'}"${artStyle(d)}>${d ? '' : '?'}</span>
      <span class="vs-who">${who}</span>
      <span class="vs-name">${esc(d?.name ?? fallback)}</span>
      <span class="vs-pips">${d ? deckColors(d).map(pip).join('') : ''}</span>
    </div>`;
  }

  function refresh() {
    const decks = allDecks();
    if (!decks.some(d => d.id === youId)) youId = decks[0].id;
    if (oppId !== 'random' && !decks.some(d => d.id === oppId)) oppId = 'random';
    const shown = visible(decks);
    $('#deckCount').textContent = `${shown.length} de ${decks.length}`;
    $('#tiles').innerHTML = shown.length ? shown.map(d => {
      const cols = deckColors(d);
      const on = d.id === youId;
      return `<div class="tile-wrap"><button class="deck-tile${on ? ' on' : ''}" data-deck="${d.id}" aria-pressed="${on}">
        <span class="tile-art"${artStyle(d)}></span>
        ${on ? `<span class="tile-check">${ICON_CHECK}</span>` : ''}
        ${!d.builtin ? '<span class="tile-tag">Seu deck</span>' : ''}
        <span class="tile-info">
          <span class="tile-name">${esc(d.name)}</span>
          <span class="tile-meta">${cols.map(pip).join('')}<span>${deckSize(d)} cartas</span></span>
        </span>
      </button><button class="tile-peek" data-peek="${d.id}" title="Ver as cartas" aria-label="Ver as cartas de ${esc(d.name)}">${ICON_EYE}</button></div>`;
    }).join('') : `<div class="tiles-empty">
        <p>Nenhum deck com esses filtros.</p>
        <button class="arena-btn secondary" data-lobby="clear">Limpar filtros</button>
      </div>`;

    const you = decks.find(d => d.id === youId);
    const opp = oppId === 'random' ? undefined : decks.find(d => d.id === oppId);
    $('#versus').innerHTML = side('you', 'Você', you, '') + '<span class="vs">VS</span>' +
      (mode === 'ai' ? side('opp', 'IA', opp, 'Deck aleatório') : side('opp', 'Oponente', undefined, 'Outra pessoa'));

    const sel = $('#oppSel') as HTMLSelectElement;
    sel.innerHTML = `<option value="random">Aleatório</option>` +
      `<optgroup label="Prontos">${decks.filter(d => d.builtin).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</optgroup>` +
      (decks.some(d => !d.builtin) ? `<optgroup label="Meus decks">${decks.filter(d => !d.builtin).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</optgroup>` : '');
    sel.value = oppId;
    root.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(r => { r.checked = r.value === mode; });
    root.querySelectorAll<HTMLElement>('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(colorFilter.has(b.dataset.color as Color))));
    $('#aiPanel').hidden = mode !== 'ai';
    $('#netPanel').hidden = mode !== 'net';
  }

  const you = () => allDecks().find(d => d.id === youId)!;
  const netName = () => (root.querySelector('#netName') as HTMLInputElement).value.trim() || 'Jogador';
  const netUrl = () => (root.querySelector('#netUrl') as HTMLInputElement).value.trim() || FORGE_URL;
  const play = () => {
    const decks = allDecks();
    const pool = decks.filter(d => d.builtin && d.id !== youId);
    const opp = oppId === 'random' ? pool[Math.floor(Math.random() * pool.length)] ?? you() : decks.find(d => d.id === oppId)!;
    opts.onPlay(you(), opp);
  };

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const peek = t.closest<HTMLElement>('[data-peek]')?.dataset.peek;
    const peekDeck = peek && allDecks().find(d => d.id === peek);
    if (peekDeck) {
      openDeckPreview(peekDeck, { selected: peek === youId, onPick: () => { youId = peek; save(DECK_KEY, youId); refresh(); } });
      return;
    }
    const tile = t.closest<HTMLElement>('[data-deck]');
    if (tile) { youId = tile.dataset.deck!; save(DECK_KEY, youId); refresh(); return; }
    const color = t.closest<HTMLElement>('[data-color]')?.dataset.color as Color | undefined;
    if (color) { colorFilter.has(color) ? colorFilter.delete(color) : colorFilter.add(color); refresh(); return; }
    const a = t.closest<HTMLElement>('[data-lobby]')?.dataset.lobby;
    if (a === 'decks') opts.onDecks();
    if (a === 'host') opts.onHost(you(), netName(), netUrl());
    if (a === 'cancel-room') opts.onCancelRoom();
    if (a === 'play') play();
    if (a === 'clear') {
      query = ''; source = 'all'; colorFilter.clear();
      (root.querySelector('#deckSearch') as HTMLInputElement).value = '';
      (root.querySelector('input[name="source"][value="all"]') as HTMLInputElement).checked = true;
      refresh();
    }
  });
  // Clique duplo num deck já começa a partida contra a IA.
  root.addEventListener('dblclick', e => {
    if (mode === 'ai' && (e.target as HTMLElement).closest('[data-deck]')) play();
  });
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'deckSearch') { query = t.value.trim(); refresh(); }
  });
  root.addEventListener('submit', e => {
    if (!(e.target as HTMLElement).matches('[data-join]')) return;
    e.preventDefault();
    const code = (root.querySelector('#netCode') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length !== 4) {
      $('#status').textContent = 'O código da sala tem 4 letras.';
      $('#status').classList.add('error');
      return;
    }
    opts.onJoin(you(), netName(), code, netUrl());
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'oppSel') { oppId = t.value; save(OPP_KEY, oppId); refresh(); }
    if (t.name === 'source') { source = t.value as Source; refresh(); }
    if (t.name === 'mode') {
      mode = t.value === 'net' ? 'net' : 'ai';
      save(MODE_KEY, mode);
      refresh();
    }
    if (t.id === 'netName') save(NAME_KEY, t.value.trim());
    if (t.id === 'netUrl') save(URL_KEY, t.value.trim());
  });

  (root.querySelector('#netName') as HTMLInputElement).value = load(NAME_KEY) ?? '';
  (root.querySelector('#netUrl') as HTMLInputElement).value = load(URL_KEY) ?? '';

  mountChangelog(root.querySelector('.top-actions')!);
  refresh();
  // Pré-carrega as cartas dos decks para mostrar cores e artes.
  fetchByNames(allDecks().flatMap(d => d.cards.map(c => c.name))).then(refresh).catch(() => {});

  return {
    refresh,
    setStatus(msg, error = false) {
      const el = $('#status');
      el.textContent = msg;
      el.classList.toggle('error', error);
    },
    showRoom(code) {
      const el = $('#netWait');
      el.hidden = !code;
      el.innerHTML = code ? `<span class="net-wait-label">Código da sala</span><b class="net-code">${esc(code)}</b>
        <span class="net-wait-hint"><span class="pulse" aria-hidden="true"></span>Passe o código para quem vai jogar com você. Aguardando…</span>
        <button class="arena-btn secondary" data-lobby="cancel-room">Cancelar</button>` : '';
    },
  };
}
