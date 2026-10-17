import type { DeckData, DeckEntry, DeckFormat } from '../decks';

/** Cliente da ponte do Forge (forge-bridge). Formato das mensagens descrito em forge-bridge/README.md. */

export interface FPreferences { autoPassNoActions: boolean }
export interface MatchConfig { format: DeckFormat; matchLength: 'bo1' | 'bo3'; playerCount?: number }
export interface ValidationIssue { code: string; message: string; card?: string; section?: string }
export interface DeckValidation { valid: boolean; issues: ValidationIssue[]; mainCount?: number; sideboardCount?: number; commanderCount?: number; rulesVersion: string; engineVersion: string }
export interface RoomInfo { code: string; config: MatchConfig; available: boolean; capacity?: number; players: {name: string; connected: boolean; seat?: number; playerId?: number; eliminated?: boolean}[]; rulesVersion: string; engineVersion: string }
export interface FEvent {
  seq: number; stateVersion: number;
  type: 'land-played' | 'spell-cast' | 'ability-activated' | 'resolved' | 'countered' | 'entered' | 'left' | 'attackers' | 'blockers' | 'damage' | 'life-changed' | 'turn' | 'priority' | 'draw' | 'stack-removed';
  actor?: number; cards?: number[]; card?: FCard; sourceId?: number; stackId?: number; targets?: FTargets;
  text?: string; from?: string; to?: string; delta?: number;
  frame?: {players: Pick<FPlayer, 'id' | 'life' | 'battlefield' | 'handCount' | 'library'>[]; stack: FState['stack']; turn: number; phase: string | null; activePlayer: number | null; combat?: FState['combat']};
}
export interface FMatch {
  gameNumber: number; wins: number[]; draws: number; over: boolean; abandoned?: boolean;
  phase: 'playing' | 'sideboarding' | 'complete'; ready: boolean[];
}
export interface FSideboarding { id: number; main: DeckEntry[]; sideboard: DeckEntry[]; ready: boolean }

export interface FCard {
  id: number;
  controller?: number;
  tapped: boolean;
  token: boolean;
  /** Imagem da ficha no Scryfall, calculada pela ponte (fichas não são achadas pelo nome). */
  image?: string;
  faceDown?: boolean;
  name?: string;
  set?: string;
  manaCost?: string;
  typeLine?: string;
  text?: string;
  creature?: boolean;
  land?: boolean;
  power?: number;
  toughness?: number;
  /** Poder/resistência sem bônus, marcadores nem efeitos. */
  basePower?: number;
  baseToughness?: number;
  /** Palavras-chave atuais, com o nome do enum do Forge (FLYING, FIRST_STRIKE…), inclusive as ganhas por efeitos. */
  keywords?: string[];
  damage?: number;
  sick?: boolean;
  attacking?: boolean;
  blocking?: boolean;
  counters?: Record<string, number>;
  planeswalker?: boolean;
  emblem?: boolean;
  /** Tramada (plot) no exílio. */
  plotted?: boolean;
  /** Id da carta a que esta aura ou equipamento está preso. */
  attachedTo?: number;
  attachedToPlayer?: number;
  /** Nome original de uma carta que está copiando outra (Clone, por exemplo). */
  copyOf?: string;
}

export interface FPlayer {
  id: number;
  seat?: number;
  name: string;
  ai: boolean;
  eliminated?: boolean;
  life: number;
  library: number;
  handCount: number;
  hand: FCard[];
  battlefield: FCard[];
  graveyard: FCard[];
  exile: FCard[];
  commandZone?: FCard[];
  commanders?: { id: number; name: string; casts: number; tax: number }[];
  commanderDamage?: { commanderId: number; damage: number }[];
  /** Emblemas na zona de comando (nome "Emblem — Planeswalker"). */
  emblems?: FCard[];
  pool: Record<string, number>;
}

export interface FOption { kind?: 'card' | 'player'; card?: FCard; id?: number; label: string; min?: number; max?: number }

export interface FQuestion {
  id: number;
  method: string;
  /** reveal: só mostra as cartas (Explore, revelar o topo...); responde com indices vazio. */
  kind: 'choose' | 'confirm' | 'order' | 'text' | 'reveal' | 'amount';
  title: string;
  total?: number;
  min?: number;
  max?: number;
  options?: (FOption | string)[];
  card?: FCard;
  initial?: string;
  numeric?: boolean;
}

export interface FButton { label: string; enabled: boolean }

/** Sala de partida em rede. token permite voltar ao assento se a conexão cair. */
export interface FRoom {
  code: string;
  seat: number;
  token: string;
  started: boolean;
  capacity?: number;
  config: MatchConfig;
  rulesVersion?: string;
  engineVersion?: string;
  players: { name: string; connected: boolean; rematch: boolean; seat?: number; playerId?: number; eliminated?: boolean }[];
}

export interface FState {
  type: 'state';
  config?: MatchConfig;
  preferences?: FPreferences;
  match?: FMatch;
  sideboarding?: FSideboarding;
  matchId?: string;
  events?: FEvent[];
  eventCursor?: number;
  stateVersion?: number;
  rulesVersion?: string;
  engineVersion?: string;
  turn: number;
  phase: string | null;
  activePlayer: number | null;
  gameOver: boolean;
  spectating?: boolean;
  winner?: string;
  players: FPlayer[];
  /** Cartas do cemitério ou do exílio (de qualquer jogador) que você pode usar agora: flashback, tramadas... */
  castable?: number[];
  /** Permissões vigentes para jogar do exílio, mesmo sem prioridade ou mana neste momento. */
  playableExile?: number[];
  /** Cartas suspensas e cartas cujo gatilho de suspender ainda está na pilha. */
  suspendedExile?: number[];
  stack: { id: number; text: string; source?: FCard; controller?: number; targets?: FTargets }[];
  combat: { attacker: number; defender?: number; defenderKind?: 'player' | 'card'; blockers: number[] }[];
  log: string[];
  you: number;
  /** gen: versão do prompt; acompanha os cliques em OK/Cancelar para a ponte descartar cliques atrasados. */
  /** actionable: cartas que podem ser usadas agora (jogáveis, atacantes ou bloqueadores possíveis). */
  /** card: carta citada pelo prompt (ex.: a do topo do grimório na vidência ou na vigilância de 1). */
  /** paying: pagando um custo de mana; a mana da reserva pode ser gasta com {type:"mana", color}. */
  /** targeting: escolhendo alvos; source é a carta que alveja (card traz os dados dela) e o resto são os alvos já escolhidos. */
  input: { gen: number; priority?: boolean; opening?: 'starting-player' | 'play-draw' | 'mulligan' | 'mulligan-bottom'; openingStartingPlayer?: number; openingReturnCount?: number; openingReturnRemaining?: number; openingSelected?: number[]; message: string; ok: FButton; cancel: FButton; selectable: number[]; selectableStacks?: number[]; selectablePlayers?: number[]; actionable?: number[]; card?: FCard; paying?: boolean;
    /** Cartas selecionadas pelo motor no prompt atual, com os limites reais da escolha. */
    selection?: { cards: number[]; min: number; max: number };
    /** Escolha de conjurar durante a resolução do gatilho de suspender; usa OK/Cancelar. */
    suspendCast?: { card: FCard };
    /** Atacantes e bloqueadores da declaração atual, identificados pela instância da carta. */
    blocking?: { selectedAttacker: number | null; attackers: number[]; blockers: number[]; legalAssignments: { blocker: number; attackers: number[] }[] };
    attacking?: { attackers: number[]; defenders: { id: number; kind: 'player' | 'card' }[]; legalAssignments: { attacker: number; defenders: { id: number; kind: 'player' | 'card' }[] }[] };
    targeting?: FTargets & { source: number; card?: FCard } };
  question?: FQuestion;
  room?: FRoom;
  /** Para voltar a esta partida se a conexão cair: {type:"rejoin", code, token}. */
  session?: { code: string; token: string; room: boolean };
  decks: string[];
}

/** Alvos de uma mágica ou habilidade: ids de cartas e de jogadores. */
export interface FTargets { cards?: number[]; players?: number[] }

export type ClientMessage =
  | { type: 'start'; you: unknown; opponent: unknown; opponents?: unknown[]; config: MatchConfig }
  | { type: 'host'; name: string; deck: unknown; config: MatchConfig }
  | { type: 'join'; code: string; name: string; deck: unknown }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'validate-deck'; requestId: string; format: DeckFormat; deck: unknown }
  | { type: 'lookup-room'; requestId: string; code: string }
  | { type: 'sideboard'; id: number; deck: unknown } | { type: 'next-game'; id: number }
  | { type: 'rematch' } | { type: 'leave' }
  | { type: 'preferences'; autoPassNoActions: boolean }
  | { type: 'card'; id: number; gen?: number }
  | { type: 'block'; attacker: number; blocker: number; gen: number }
  | { type: 'attack'; attacker: number; defender: number; defenderKind: 'player' | 'card'; gen: number }
  | { type: 'attack-all'; defender: number; defenderKind: 'player' | 'card'; gen: number }
  | { type: 'stack'; id: number; gen?: number }
  | { type: 'player'; id: number; gen?: number }
  | { type: 'mana'; color: string; gen?: number }
  | { type: 'ok' | 'cancel' | 'pass-turn'; gen?: number } | { type: 'concede' } | { type: 'hello' }
  | { type: 'answer'; id: number; indices?: number[]; amounts?: number[]; value?: boolean; text?: string };

/**
 * Endereço padrão da ponte: a mesma máquina que serviu a página. Assim, quem abre a página pela rede
 * (http://IP-DO-ANFITRIÃO:5173) já encontra a ponte do anfitrião. "localhost" vira 127.0.0.1 porque a
 * ponte só escuta IPv4. Fora do Vite (dev na 5173, preview na 4173), a página está publicada atrás de um
 * proxy que repassa /ws para a ponte no mesmo endereço (veja deploy/nginx.conf).
 */
function defaultUrl() {
  if (typeof location !== 'undefined' && location.host && !['5173', '4173'].includes(location.port)) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  const host = typeof location === 'undefined' || !location.hostname || location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  return `ws://${host.includes(':') ? `[${host}]` : host}:7171/ws`;
}

export const FORGE_URL: string = import.meta.env?.VITE_FORGE_URL ?? defaultUrl();

export class ForgeClient {
  private ws: WebSocket | null = null;
  state: FState | null = null;
  room: FRoom | null = null;
  onState: (s: FState) => void = () => {};
  onRoom: (r: FRoom) => void = () => {};
  /** A partida foi aberta em outra janela, que assumiu o assento: não adianta reconectar sozinho. */
  replaced = false;
  /** A ponte não conhece mais a partida pedida no "rejoin". */
  onGone: (text: string) => void = () => {};
  onNotice: (text: string, error: boolean) => void = () => {};
  onClose: () => void = () => {};
  onValidation: (validation: DeckValidation, target: string) => void = () => {};
  onHello: (info: {supportedFormats: DeckFormat[]; rulesVersion: string; engineVersion: string}) => void = () => {};
  private requestSequence = 0;
  private pending = new Map<string, {resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout>}>();

  private rejectPending(reason: string) {
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error(reason)); }
    this.pending.clear();
  }

  private request<T>(message: { type: 'validate-deck'; format: DeckFormat; deck: unknown } | { type: 'lookup-room'; code: string }): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('Conecte-se ao servidor para verificar.'));
    const requestId = `request-${++this.requestSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('O servidor demorou para responder. Tente novamente.')); }, 12000);
      this.pending.set(requestId, {resolve, reject, timer});
      this.send({...message, requestId});
    });
  }

  validateDeck(deck: Pick<DeckData, 'name' | 'cards' | 'sideboard' | 'commanders'>, format: DeckFormat): Promise<DeckValidation> {
    return this.request({type: 'validate-deck', format, deck});
  }

  lookupRoom(code: string): Promise<RoomInfo> { return this.request({type: 'lookup-room', code}); }

  connect(url = FORGE_URL, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); reject(new Error('tempo esgotado')); }, timeoutMs);
      ws.onopen = () => { clearTimeout(timer); this.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('conexão recusada')); };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.rejectPending('A conexão foi interrompida.'); this.onClose(); } };
      ws.onmessage = ev => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.requestId && this.pending.has(msg.requestId)) {
          const request = this.pending.get(msg.requestId)!;
          if (['validation', 'room-info', 'request-error', 'error'].includes(msg.type)) {
            clearTimeout(request.timer); this.pending.delete(msg.requestId);
            if (msg.type === 'validation') request.resolve(msg.validation);
            else if (msg.type === 'room-info') request.resolve(msg.room);
            else request.reject(new Error(msg.text ?? 'Não foi possível concluir a solicitação.'));
            return;
          }
        }
        if (msg.type === 'state') {
          this.state = msg;
          if (msg.room) this.room = msg.room;
          this.onState(msg);
        } else if (msg.type === 'room') { this.room = msg.room; this.onRoom(msg.room); }
        else if (msg.type === 'validation-error') this.onValidation(msg.validation, msg.target);
        else if (msg.type === 'hello') this.onHello(msg);
        else if (msg.type === 'toast') this.onNotice(msg.text, false);
        else if (msg.type === 'error') this.onNotice(msg.text, true);
        else if (msg.type === 'gone') this.onGone(msg.text);
        else if (msg.type === 'replaced') { this.replaced = true; this.onNotice(msg.text, true); }
      };
    });
  }

  get connected() { return !!this.ws && this.ws.readyState === WebSocket.OPEN; }

  send(msg: ClientMessage) {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.rejectPending('A conexão foi encerrada.');
    ws?.close();
  }
}
