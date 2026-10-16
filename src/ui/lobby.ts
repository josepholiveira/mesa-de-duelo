import { allDecks, deckSize, type DeckData } from '../decks';
import { FORGE_URL } from '../forge/client';
import { cardInfo, type CardInfo, type Color } from '../cards';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, pip } from './cardtext';

const COLOR_ORDER: Color[] = ['W', 'U', 'B', 'R', 'G'];

function cachedDefs(deck: DeckData): CardInfo[] {
  return deck.cards.flatMap(e => { const sc = cacheGet(e.name); return sc ? [cardInfo(sc)] : []; });
}

export function deckColors(deck: DeckData): Color[] {
  const set = new Set<Color>();
  for (const d of cachedDefs(deck)) for (const c of d.colors) set.add(c);
  return COLOR_ORDER.filter(c => set.has(c));
}

/** Arte da criatura mais cara do deck, usada como retrato do jogador. */
export function deckArt(deck: DeckData): string | undefined {
  return cachedDefs(deck)
    .filter(d => d.type === 'creature' && d.artCrop)
    .sort((a, b) => b.cmc - a.cmc)[0]?.artCrop;
}

export interface Lobby {
  refresh(): void;
  setStatus(msg: string, error?: boolean): void;
  /** Mostra o código da sala criada enquanto o oponente não entra; null esconde. */
  showRoom(code: string | null): void;
}

type Mode = 'ai' | 'net';
const MODE_KEY = 'mesa:mode';
const NAME_KEY = 'mesa:name';
const URL_KEY = 'mesa:forgeUrl';

function load(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ }
}

export interface LobbyOptions {
  onPlay(you: DeckData, opp: DeckData): void;
  onHost(you: DeckData, name: string, url: string): void;
  onJoin(you: DeckData, name: string, code: string, url: string): void;
  onCancelRoom(): void;
  onDecks(): void;
}

export function mountLobby(root: HTMLElement, opts: LobbyOptions): Lobby {
  let youId = '';
  let oppId = 'random';
  let mode: Mode = load(MODE_KEY) === 'net' ? 'net' : 'ai';

  root.innerHTML = `
  <div class="lobby">
    <div class="mat" aria-hidden="true"></div>
    <header class="lobby-head">
      <h1>Mesa de Duelo</h1>
      <p>Duelo de Magic contra a IA, com cartas reais do Scryfall.</p>
    </header>
    <section class="lobby-body">
      <h2>Seu deck</h2>
      <div class="deck-tiles" id="tiles"></div>
      <div class="mode-pick" role="radiogroup" aria-label="Modo de jogo">
        <label><input type="radio" name="mode" value="ai"> Contra a IA</label>
        <label><input type="radio" name="mode" value="net"> Em rede</label>
      </div>
      <div id="aiPanel">
      <div class="lobby-row">
        <label for="oppSel">Oponente</label>
        <select id="oppSel"></select>
        <button class="arena-btn secondary" data-lobby="decks">Montar decks</button>
        <button class="arena-btn primary big" data-lobby="play">Jogar contra a IA</button>
      </div>
      </div>
      <div class="net-panel" id="netPanel" hidden>
        <p class="net-help">Partida contra outra pessoa. Quem cria a sala roda a ponte
          aceitando conexões de fora (<code>npm run forge:rede</code>) e passa o código para o oponente.</p>
        <div class="net-fields">
          <label>Seu nome <input id="netName" maxlength="24" autocomplete="nickname" placeholder="Jogador"></label>
          <label>Ponte <input id="netUrl" spellcheck="false" placeholder="${FORGE_URL}"></label>
        </div>
        <div class="net-actions">
          <button class="arena-btn primary" data-lobby="host">Criar sala</button>
          <span class="net-or">ou</span>
          <form class="net-join" data-join>
            <input id="netCode" maxlength="4" autocomplete="off" spellcheck="false" placeholder="CÓDIGO" aria-label="Código da sala">
            <button class="arena-btn secondary">Entrar</button>
          </form>
        </div>
        <div class="net-wait" id="netWait" hidden></div>
      </div>
      <p class="lobby-status" id="status" role="status"></p>
    </section>
  </div>`;

  const $ = (s: string) => root.querySelector(s) as HTMLElement;

  function refresh() {
    const decks = allDecks();
    if (!decks.some(d => d.id === youId)) youId = decks[0].id;
    $('#tiles').innerHTML = decks.map(d => {
      const art = deckArt(d);
      const cols = deckColors(d);
      return `<button class="deck-tile ${d.id === youId ? 'on' : ''}" data-deck="${d.id}" aria-pressed="${d.id === youId}">
        <span class="tile-art" ${art ? `style="background-image:url('${art}')"` : ''}></span>
        <span class="tile-info">
          <span class="tile-name">${esc(d.name)}</span>
          <span class="tile-meta">${cols.map(pip).join('')}<span>${deckSize(d)} cartas${d.builtin ? '' : ' · seu deck'}</span></span>
        </span>
      </button>`;
    }).join('');
    const sel = $('#oppSel') as HTMLSelectElement;
    sel.innerHTML = `<option value="random">Aleatório</option>` +
      decks.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    sel.value = decks.some(d => d.id === oppId) ? oppId : 'random';
    root.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach(r => { r.checked = r.value === mode; });
    $('#aiPanel').hidden = mode !== 'ai';
    $('#netPanel').hidden = mode !== 'net';
  }

  const you = () => allDecks().find(d => d.id === youId)!;
  const netName = () => (root.querySelector('#netName') as HTMLInputElement).value.trim() || 'Jogador';
  const netUrl = () => (root.querySelector('#netUrl') as HTMLInputElement).value.trim() || FORGE_URL;

  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const tile = t.closest<HTMLElement>('[data-deck]');
    if (tile) { youId = tile.dataset.deck!; refresh(); return; }
    const a = t.closest<HTMLElement>('[data-lobby]')?.dataset.lobby;
    if (a === 'decks') opts.onDecks();
    if (a === 'host') opts.onHost(you(), netName(), netUrl());
    if (a === 'cancel-room') opts.onCancelRoom();
    if (a === 'play') {
      const decks = allDecks();
      const you = decks.find(d => d.id === youId)!;
      const pool = decks.filter(d => d.builtin && d.id !== youId);
      const opp = oppId === 'random' ? pool[Math.floor(Math.random() * pool.length)] ?? you : decks.find(d => d.id === oppId)!;
      opts.onPlay(you, opp);
    }
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
    if (t.id === 'oppSel') oppId = t.value;
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
      el.innerHTML = code ? `<span>Sala</span><b class="net-code">${esc(code)}</b>
        <span>Passe este código para quem vai jogar com você. Aguardando a entrada na sala…</span>
        <button class="arena-btn secondary" data-lobby="cancel-room">Cancelar</button>` : '';
    },
  };
}
