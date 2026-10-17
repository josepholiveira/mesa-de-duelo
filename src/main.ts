import './style.css';
import { type DeckData } from './decks';
import { mountDeckBuilder } from './ui/deckbuilder';
import { ForgeClient, FORGE_URL, type FState, type MatchConfig, type ClientMessage } from './forge/client';
import { createForgeTableView } from './ui/forgeTable';
import { deckArt, mountLobby } from './ui/lobby';
import { enterLandscape, mountRotateGate } from './ui/landscape';
import { hideCardPreview } from './ui/cardInspector';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div class="screen" id="scrLobby"></div>
  <div class="screen" id="scrGame" hidden></div>
  <div class="screen" id="scrDecks" hidden></div>
  <footer class="credits">Cartas e imagens: <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>.
  Magic: The Gathering é marca da Wizards of the Coast; projeto de fã, sem afiliação.</footer>`;

const screens = { lobby: '#scrLobby', game: '#scrGame', decks: '#scrDecks' } as const;
function show(name: keyof typeof screens) {
  hideCardPreview(true);
  screen = name;
  for (const [k, sel] of Object.entries(screens)) (document.querySelector(sel) as HTMLElement).hidden = k !== name;
  document.body.dataset.screen = name;
}

let forge: ForgeClient | null = null;
let forgeUrl = '';
let lastMatch: [DeckData, DeckData | null, MatchConfig, (DeckData | null)[]?] | null = null;
let connecting: Promise<ForgeClient | null> | null = null;
let connectingUrl = '';
let connectionAttempt = 0;
let pendingStart: { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | null = null;
function finishStart(error?: string) {
  if (!pendingStart) return;
  clearTimeout(pendingStart.timer);
  if (error) pendingStart.reject(new Error(error)); else pendingStart.resolve();
  pendingStart = null;
}
let screen: keyof typeof screens = 'lobby';

/**
 * Partida no Forge em andamento (ou sala esperando o oponente): o que é preciso para redesenhar a mesa
 * e voltar ao mesmo assento se a conexão cair. code/token chegam da ponte em state.session.
 */
interface ForgeMatch { url: string; deck: DeckData; opp?: DeckData; opponents?: (DeckData | null)[]; net: boolean; config?: MatchConfig; code?: string; token?: string }
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

const forgeTable = createForgeTableView(document.querySelector('#scrGame')!, {
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

mountRotateGate();

const lobby = mountLobby(document.querySelector('#scrLobby')!, {
  onPlay: async (you, opp, config, opponents) => { void enterLandscape(); await startMatch(you, opp, config, opponents); },
  onHost: async (you, name, url, config) => { void enterLandscape(); await startNetMatch(you, url, { type: 'host', name, deck: forgeDeck(you), config }, config); },
  onJoin: async (you, name, code, url) => { void enterLandscape(); await startNetMatch(you, url, { type: 'join', code, name, deck: forgeDeck(you) }); },
  onValidate: async (deck, format, url) => (await requireForge(url)).validateDeck(forgeDeck(deck), format),
  onLookup: async (code, url) => (await requireForge(url)).lookupRoom(code),
  onCancelRoom: () => { leaveForge(); lobby.setStatus(''); },
  onDecks: (action = 'library', format) => { builder.open({action, format}); show('decks'); },
  onEditDeck: deckId => { builder.open({action: 'edit', deckId}); show('decks'); },
});

const builder = mountDeckBuilder(document.querySelector('#scrDecks')!, {
  onBack: () => { lobby.refresh(); show('lobby'); },
  onChange: () => lobby.refresh(),
  validateDeck: async (deck, format) => {
    const result = await (await requireForge(FORGE_URL)).validateDeck(forgeDeck(deck), format);
    return {...result, issues: result.issues.map(issue => ({...issue, section: issue.section === 'main' || issue.section === 'sideboard' || issue.section === 'commander' ? issue.section : undefined}))};
  },
});

const forgeDeck = (d: DeckData) => ({ name: d.name, cards: d.cards, sideboard: d.sideboard ?? [], commanders: d.commanders ?? [] });
async function requireForge(url: string): Promise<ForgeClient> {
  const client = await connectForge(url, null);
  if (!client) throw new Error('Não foi possível conectar ao servidor de jogo. Confira a conexão e tente novamente.');
  return client;
}

/**
 * Conecta à ponte (reaproveitando a conexão aberta com o mesmo endereço) e liga os eventos à mesa.
 * hint null: falha em silêncio, sem mexer na tela (usado nas tentativas de reconexão).
 */
async function connectForge(url: string, hint: string | null): Promise<ForgeClient | null> {
  if (forge?.connected && forgeUrl === url) return forge;
  if (connecting && connectingUrl === url) return connecting;
  connectingUrl = url;
  connecting = openForge(url, hint, ++connectionAttempt);
  const attempt = connecting;
  try { return await attempt; } finally { if (connecting === attempt) connecting = null; }
}

async function openForge(url: string, hint: string | null, attempt: number): Promise<ForgeClient | null> {
  forge?.close();
  forge = null;
  if (hint !== null) lobby.setStatus('Conectando à ponte do Forge…');
  const client = new ForgeClient();
  try {
    await client.connect(url);
  } catch {
    if (hint !== null && attempt === connectionAttempt) {
      lobby.setStatus(`Não encontrei a ponte do Forge em ${url}. ${hint}`, true);
      show('lobby');
    }
    return null;
  }
  if (attempt !== connectionAttempt) { client.close(); return null; }
  forge = client;
  forgeUrl = url;
  let prev: FState | null = null;
  client.onState = s => {
    if (forge !== client) return;
    const m = current;
    if (m && s.session) {
      m.code = s.session.code;
      m.token = s.session.token;
      // Só partidas em andamento ficam guardadas: no fim não há para onde voltar.
      m.config = s.config ?? m.config;
      if (s.match?.over ?? s.gameOver) clearResume(); else saveResume();
    }
    // A mesa abre no primeiro estado (sala em rede, volta depois de recarregar) e é zerada quando
    // começa outra partida (revanche ou "Recomeçar").
    const fresh = prev && (prev.matchId !== s.matchId || prev.match?.gameNumber !== s.match?.gameNumber || (!s.match && ((prev.gameOver && !s.gameOver) || s.turn < prev.turn)));
    if (m && (screen !== 'game' || fresh)) enterForgeTable(client, m);
    prev = s;
    finishStart();
    forgeTable.render();
  };
  client.onRoom = r => {
    if (current?.net && !r.started) {
      current.code = r.code; current.token = r.token; current.config = r.config;
      saveResume(); lobby.showRoom(r); lobby.setStatus(''); finishStart();
    }
  };
  client.onValidation = (validation, target) => {
    const message = `${target === 'opponent' ? 'Deck do computador: ' : ''}${validation.issues.map(issue => `${issue.card ? `${issue.card}: ` : ''}${issue.message}`).join(' ')}`;
    if (screen === 'game') forgeTable.notice(message, true);
    else { lobby.setStatus(message, true); finishStart(message); current = null; }
  };
  client.onNotice = (text, error) => {
    if (error) finishStart(text);
    if (screen === 'game') forgeTable.notice(text, error);
    else lobby.setStatus(text, error);
    // Sala fechada ou código errado antes de a partida começar: volta ao formulário.
    if (error && current?.net && screen !== 'game') { current = null; lobby.showRoom(null); }
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
    finishStart('A conexão com o servidor foi interrompida.');
    if (current?.token && client.replaced) forgeTable.disconnected('A partida foi aberta em outra janela. Reconecte para trazê-la de volta para cá.');
    else if (current?.token) void autoReconnect();
    else if (screen === 'game') forgeTable.disconnected();
    else if (current?.net) { current = null; lobby.showRoom(null); lobby.setStatus('A conexão com a ponte caiu.', true); }
  };
  return client;
}

function enterForgeTable(client: ForgeClient, m: ForgeMatch) {
  forgeTable.attach(client, [deckArt(m.deck), ...(m.opponents ?? [m.opp ?? null]).map(d => d ? deckArt(d) : undefined)]);
  lobby.setStatus('');
  lobby.showRoom(null);
  show('game');
}

/** The server validates before replacing a session. Keep setup visible until acceptance. */
async function requestMatch(client: ForgeClient, match: ForgeMatch, message: ClientMessage) {
  finishStart('Uma nova solicitação substituiu a anterior.');
  current = match;
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (current === match) { client.send({type: 'leave'}); current = null; clearResume(); lobby.showRoom(null); }
      finishStart('O servidor demorou para iniciar a partida. Tente novamente.');
    }, 20000);
    pendingStart = {resolve, reject, timer};
    client.send(message);
  });
}
async function startMatch(you: DeckData, opp: DeckData | null, config: MatchConfig, opponents?: (DeckData | null)[]) {
  const client = await requireForge(FORGE_URL);
  lastMatch = [you, opp, config, opponents];
  lobby.setStatus('Preparando a mesa…');
  await requestMatch(client, {url: FORGE_URL, deck: you, opp: opp ?? undefined, opponents, config, net: false}, {type: 'start', you: forgeDeck(you), opponent: opp ? forgeDeck(opp) : null, ...(opponents ? { opponents: opponents.map(d => d ? forgeDeck(d) : null) } : {}), config});
}
async function startNetMatch(you: DeckData, url: string, message: ClientMessage, config?: MatchConfig) {
  const client = await requireForge(url);
  lobby.setStatus(message.type === 'host' ? 'Criando a sala…' : 'Entrando na sala…');
  await requestMatch(client, {url, deck: you, config, net: true}, message);
}

/** Abandona a partida do Forge em andamento (ou a sala esperando oponente), se houver. */
function leaveForge() {
  if (!current) return;
  finishStart('A solicitação foi cancelada.');
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
  if (screen === 'game') enterForgeTable(client, m);
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
      if (screen === 'game') forgeTable.reconnecting(i + 1);
      await new Promise(r => setTimeout(r, delays[i]));
      if (current !== m) return;
      if (await reconnect()) return;
    }
    if (current === m && screen === 'game') forgeTable.disconnected();
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

// Old shared links now open setup; no match starts without a format and deck choice.
if (location.hash === '#jogar') history.replaceState(null, '', location.pathname + location.search);
const saved = loadResume();
if (saved) void resumeSaved(saved);
