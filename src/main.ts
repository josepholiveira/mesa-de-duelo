import './style.css';
import { DEFAULT_DECKS, resolveDeck, type DeckData } from './decks';
import { Game } from './engine/game';
import { mountDeckBuilder } from './ui/deckbuilder';
import { ForgeClient, FORGE_URL, type FState } from './forge/client';
import { createForgeTableView } from './ui/forgeTable';
import { deckArt, mountLobby, type Engine } from './ui/lobby';
import { createTableView } from './ui/table';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="screen" id="scrLobby"></div>
  <div class="screen" id="scrGame" hidden></div>
  <div class="screen" id="scrForge" hidden></div>
  <div class="screen" id="scrDecks" hidden></div>
  <footer class="credits">Cartas e imagens: <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.
  Magic: The Gathering é marca da Wizards of the Coast; projeto de fã, sem afiliação.</footer>`;

const screens = { lobby: '#scrLobby', game: '#scrGame', forge: '#scrForge', decks: '#scrDecks' } as const;
function show(name: keyof typeof screens) {
  screen = name;
  for (const [k, sel] of Object.entries(screens)) (document.querySelector(sel) as HTMLElement).hidden = k !== name;
  document.body.dataset.screen = name === 'forge' ? 'game' : name;
}

let game: Game | null = null;
let forge: ForgeClient | null = null;
let forgeUrl = '';
let lastMatch: [DeckData, DeckData, Engine] | null = null;
let screen: keyof typeof screens = 'lobby';

/**
 * Partida no Forge em andamento (ou sala esperando o oponente): o que é preciso para redesenhar a mesa
 * e voltar ao mesmo assento se a conexão cair. code/token chegam da ponte em state.session.
 */
interface ForgeMatch { url: string; deck: DeckData; opp?: DeckData; net: boolean; code?: string; token?: string }
let current: ForgeMatch | null = null;

/** Guardada no localStorage para voltar à partida mesmo depois de recarregar a página ou fechar a aba. */
const RESUME_KEY = 'mesa:resume';
function saveResume() {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(current)); } catch { /* sem armazenamento */ }
}
function clearResume() {
  try { localStorage.removeItem(RESUME_KEY); } catch { /* sem armazenamento */ }
}
function loadResume(): ForgeMatch | null {
  try {
    const m = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null') as ForgeMatch | null;
    return m?.url && m.code && m.token && m.deck ? m : null;
  } catch { return null; }
}

const table = createTableView(document.querySelector('#scrGame')!, {
  onExit() { game?.destroy(); game = null; show('lobby'); lobby.refresh(); },
  onRematch() { if (lastMatch) void startMatch(...lastMatch); },
});

const forgeTable = createForgeTableView(document.querySelector('#scrForge')!, {
  onExit() {
    forge?.send({ type: 'leave' });
    current = null;
    clearResume();
    forge?.close(); forge = null;
    show('lobby'); lobby.showRoom(null); lobby.refresh();
  },
  onRematch() {
    // Contra a IA ou em rede, a ponte recomeça a partida com os mesmos decks.
    if (forge?.connected && current) forge.send({ type: 'rematch' });
    else if (current?.token) void reconnect();
    else if (lastMatch) void startMatch(...lastMatch);
  },
});

const lobby = mountLobby(document.querySelector('#scrLobby')!, {
  onPlay: (you, opp, engine) => { leaveForge(); void startMatch(you, opp, engine); },
  onHost: (you, name, url) => void startNetMatch(you, url, { type: 'host', name, deck: forgeDeck(you) }),
  onJoin: (you, name, code, url) => void startNetMatch(you, url, { type: 'join', code, name, deck: forgeDeck(you) }),
  onCancelRoom: () => { leaveForge(); lobby.setStatus(''); },
  onDecks: () => show('decks'),
});

mountDeckBuilder(document.querySelector('#scrDecks')!, {
  onBack: () => { lobby.refresh(); show('lobby'); },
  onChange: () => lobby.refresh(),
});

async function startMatch(you: DeckData, opp: DeckData, engine: Engine = 'local') {
  lastMatch = [you, opp, engine];
  if (engine === 'forge') return startForgeMatch(you, opp);
  lobby.setStatus('Buscando cartas no Scryfall…');
  try {
    const [a, b] = await Promise.all([resolveDeck(you), resolveDeck(opp)]);
    if (a.list.cards.length < 20) {
      lobby.setStatus(`"${you.name}" tem só ${a.list.cards.length} cartas jogáveis. Complete o deck antes de jogar.`, true);
      show('lobby');
      return;
    }
    game?.destroy();
    game = new Game(
      [{ name: 'Você', deck: a.list, ai: false }, { name: 'O oponente', deck: b.list, ai: true }],
      { change: () => table.render(), pause: ms => new Promise(r => setTimeout(r, ms)) },
    );
    table.attach(game, [deckArt(you), deckArt(opp)]);
    const skipped = [...a.skipped, ...b.skipped];
    if (skipped.length) game.log.unshift({ msg: `Cartas ignoradas (ainda não suportadas): ${skipped.join(', ')}.` });
    lobby.setStatus('');
    show('game');
    game.start();
  } catch (e) {
    lobby.setStatus(`Não foi possível carregar as cartas: ${(e as Error).message}. Verifique a conexão.`, true);
    show('lobby');
  }
}

const forgeDeck = (d: DeckData) => ({ name: d.name, cards: d.cards });

/**
 * Conecta à ponte (reaproveitando a conexão aberta com o mesmo endereço) e liga os eventos à mesa.
 * hint null: falha em silêncio, sem mexer na tela (usado nas tentativas de reconexão).
 */
async function connectForge(url: string, hint: string | null): Promise<ForgeClient | null> {
  if (forge?.connected && forgeUrl === url) return forge;
  forge?.close();
  forge = null;
  if (hint !== null) lobby.setStatus('Conectando à ponte do Forge…');
  const client = new ForgeClient();
  try {
    await client.connect(url);
  } catch {
    if (hint !== null) {
      lobby.setStatus(`Não encontrei a ponte do Forge em ${url}. ${hint}`, true);
      show('lobby');
    }
    return null;
  }
  forge = client;
  forgeUrl = url;
  let prev: FState | null = null;
  client.onState = s => {
    const m = current;
    if (m && s.session) {
      m.code = s.session.code;
      m.token = s.session.token;
      // Só partidas em andamento ficam guardadas: no fim não há para onde voltar.
      if (s.gameOver) clearResume(); else saveResume();
    }
    // A mesa abre no primeiro estado (sala em rede, volta depois de recarregar) e é zerada quando
    // começa outra partida (revanche ou "Recomeçar").
    const fresh = prev && ((prev.gameOver && !s.gameOver) || s.turn < prev.turn);
    if (m && (screen !== 'forge' || fresh)) enterForgeTable(client, m);
    prev = s;
    forgeTable.render();
  };
  client.onRoom = r => { if (current?.net && !r.started) { lobby.showRoom(r.code); lobby.setStatus(''); } };
  client.onNotice = (text, error) => {
    if (screen === 'forge') forgeTable.notice(text, error);
    else lobby.setStatus(text, error);
    // Sala fechada ou código errado antes de a partida começar: volta ao formulário.
    if (error && current?.net && screen !== 'forge') { current = null; lobby.showRoom(null); }
  };
  client.onGone = text => {
    // A ponte não conhece mais a partida (encerrada ou ponte reiniciada): esquece e volta ao início.
    current = null;
    clearResume();
    client.close();
    if (forge === client) forge = null;
    show('lobby');
    lobby.showRoom(null);
    lobby.setStatus(text, true);
  };
  client.onClose = () => {
    if (forge !== client) return;
    if (current?.token && client.replaced) forgeTable.disconnected('A partida foi aberta em outra janela. Reconecte para trazê-la de volta para cá.');
    else if (current?.token) void autoReconnect();
    else if (screen === 'forge') forgeTable.disconnected();
    else if (current?.net) { current = null; lobby.showRoom(null); lobby.setStatus('A conexão com a ponte caiu.', true); }
  };
  return client;
}

function enterForgeTable(client: ForgeClient, m: ForgeMatch) {
  forgeTable.attach(client, [deckArt(m.deck), m.opp && deckArt(m.opp)]);
  lobby.setStatus('');
  lobby.showRoom(null);
  show('forge');
}

/** Partida no motor do Forge: o navegador só desenha e manda cliques; as regras rodam na ponte em Java. */
async function startForgeMatch(you: DeckData, opp: DeckData) {
  game?.destroy(); game = null;
  leaveForge();
  const client = await connectForge(FORGE_URL, 'Rode "npm run forge" em outro terminal e tente de novo.');
  if (!client) return;
  current = { url: FORGE_URL, deck: you, opp, net: false };
  enterForgeTable(client, current);
  client.send({ type: 'start', you: forgeDeck(you), opponent: forgeDeck(opp) });
}

/** Cria ou entra numa sala em rede. A mesa só abre quando a ponte começar a partida. */
async function startNetMatch(you: DeckData, url: string, msg: Parameters<ForgeClient['send']>[0]) {
  game?.destroy(); game = null;
  leaveForge();
  const client = await connectForge(url, 'Confira o endereço e se a ponte foi aberta com "npm run forge:rede".');
  if (!client) return;
  current = { url, deck: you, net: true };
  lobby.setStatus(msg.type === 'host' ? 'Criando a sala…' : 'Entrando na sala…');
  client.send(msg);
}

/** Abandona a partida do Forge em andamento (ou a sala esperando oponente), se houver. */
function leaveForge() {
  if (!current) return;
  forge?.send({ type: 'leave' });
  current = null;
  clearResume();
  lobby.showRoom(null);
}

/** Volta ao assento da partida atual. false se a ponte não respondeu. */
async function reconnect(): Promise<boolean> {
  const m = current;
  if (!m?.code || !m.token) return false;
  const client = await connectForge(m.url, null);
  if (!client || current !== m) return false;
  client.send({ type: 'rejoin', code: m.code, token: m.token });
  if (screen === 'forge') enterForgeTable(client, m);
  return true;
}

let reconnecting = false;
/** Tenta voltar sozinho, com intervalos crescentes (~40 s no total), antes de oferecer o botão. */
async function autoReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  const m = current;
  const delays = [300, 1000, 2000, 3000, 5000, 8000, 8000, 10000];
  try {
    for (let i = 0; i < delays.length; i++) {
      if (current !== m) return;
      if (screen === 'forge') forgeTable.reconnecting(i + 1);
      await new Promise(r => setTimeout(r, delays[i]));
      if (current !== m) return;
      if (await reconnect()) return;
    }
    if (current === m && screen === 'forge') forgeTable.disconnected();
  } finally {
    reconnecting = false;
  }
}

/** Ao abrir a página: se havia uma partida em andamento, volta para ela. */
async function resumeSaved(saved: ForgeMatch) {
  current = saved;
  lobby.setStatus('Voltando à partida em andamento…');
  if (await reconnect()) return;
  if (current === saved) {
    lobby.setStatus(`Não consegui voltar à partida em andamento: a ponte em ${saved.url} não respondeu. Recarregue a página para tentar de novo.`, true);
    current = null;
  }
}

show('lobby');

// Atalho: abrir com #jogar começa direto uma partida com os dois primeiros decks padrão.
// O atalho sai da URL na hora: senão cada recarga (ou o link passado ao oponente) abriria outra partida contra a IA.
const shortcut = location.hash;
if (shortcut === '#jogar' || shortcut === '#forge') history.replaceState(null, '', location.pathname + location.search);
if (shortcut === '#jogar') void startMatch(DEFAULT_DECKS[0], DEFAULT_DECKS[1]);
if (shortcut === '#forge') void startMatch(DEFAULT_DECKS[1], DEFAULT_DECKS[0], 'forge');
const saved = shortcut === '#jogar' || shortcut === '#forge' ? null : loadResume();
if (saved) void resumeSaved(saved);
