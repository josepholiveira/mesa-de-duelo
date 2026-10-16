/** Cliente da ponte do Forge (forge-bridge). Formato das mensagens descrito em forge-bridge/README.md. */

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
  name: string;
  ai: boolean;
  life: number;
  library: number;
  handCount: number;
  hand: FCard[];
  battlefield: FCard[];
  graveyard: FCard[];
  exile: FCard[];
  /** Emblemas na zona de comando (nome "Emblem — Planeswalker"). */
  emblems?: FCard[];
  pool: Record<string, number>;
}

export interface FOption { kind?: 'card' | 'player'; card?: FCard; id?: number; label: string }

export interface FQuestion {
  id: number;
  method: string;
  /** reveal: só mostra as cartas (Explore, revelar o topo...); responde com indices vazio. */
  kind: 'choose' | 'confirm' | 'order' | 'text' | 'reveal';
  title: string;
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
  players: { name: string; connected: boolean; rematch: boolean }[];
}

export interface FState {
  type: 'state';
  turn: number;
  phase: string | null;
  activePlayer: number | null;
  gameOver: boolean;
  winner?: string;
  players: FPlayer[];
  /** Cartas do cemitério ou do exílio (de qualquer jogador) que você pode usar agora: flashback, tramadas... */
  castable?: number[];
  stack: { id: number; text: string; source?: FCard; controller?: number }[];
  combat: { attacker: number; defender?: number; blockers: number[] }[];
  log: string[];
  you: number;
  /** gen: versão do prompt; acompanha os cliques em OK/Cancelar para a ponte descartar cliques atrasados. */
  /** actionable: cartas que podem ser usadas agora (jogáveis, atacantes ou bloqueadores possíveis). */
  /** card: carta citada pelo prompt (ex.: a do topo do grimório na vidência ou na vigilância de 1). */
  /** paying: pagando um custo de mana; a mana da reserva pode ser gasta com {type:"mana", color}. */
  input: { gen: number; message: string; ok: FButton; cancel: FButton; selectable: number[]; actionable?: number[]; card?: FCard; paying?: boolean };
  question?: FQuestion;
  room?: FRoom;
  /** Para voltar a esta partida se a conexão cair: {type:"rejoin", code, token}. */
  session?: { code: string; token: string; room: boolean };
  decks: string[];
}

export type ClientMessage =
  | { type: 'start'; you: unknown; opponent: unknown }
  | { type: 'host'; name: string; deck: unknown }
  | { type: 'join'; code: string; name: string; deck: unknown }
  | { type: 'rejoin'; code: string; token: string }
  | { type: 'rematch' } | { type: 'leave' }
  | { type: 'card'; id: number }
  | { type: 'player'; id: number }
  | { type: 'mana'; color: string }
  | { type: 'ok' | 'cancel'; gen?: number } | { type: 'concede' } | { type: 'hello' }
  | { type: 'answer'; id: number; indices?: number[]; value?: boolean; text?: string };

/**
 * Endereço padrão da ponte: a mesma máquina que serviu a página. Assim, quem abre a página pela rede
 * (http://IP-DO-ANFITRIÃO:5173) já encontra a ponte do anfitrião. "localhost" vira 127.0.0.1 porque a
 * ponte só escuta IPv4.
 */
function defaultUrl() {
  const host = typeof location === 'undefined' || !location.hostname || location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  return `ws://${host.includes(':') ? `[${host}]` : host}:7171/ws`;
}

export const FORGE_URL: string = import.meta.env.VITE_FORGE_URL ?? defaultUrl();

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

  connect(url = FORGE_URL, timeoutMs = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => { ws.close(); reject(new Error('tempo esgotado')); }, timeoutMs);
      ws.onopen = () => { clearTimeout(timer); this.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('conexão recusada')); };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.onClose(); } };
      ws.onmessage = ev => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'state') {
          this.state = msg;
          if (msg.room) this.room = msg.room;
          this.onState(msg);
        } else if (msg.type === 'room') { this.room = msg.room; this.onRoom(msg.room); }
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
    ws?.close();
  }
}
