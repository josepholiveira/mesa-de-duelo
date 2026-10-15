export type Color = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G', 'C'];

export type ManaCost = Record<Color, number> & { generic: number };

export type Keyword =
  | 'flying' | 'reach' | 'haste' | 'vigilance' | 'trample'
  | 'deathtouch' | 'lifelink' | 'first' | 'double' | 'defender' | 'menace';

/** "opponent" não pede alvo: atinge o oponente automaticamente. */
export type DamageTarget = 'any' | 'creature' | 'player' | 'opponent';

export type Effect =
  | { kind: 'damage'; n: number; target: DamageTarget }
  | { kind: 'pump'; p: number; t: number }
  | { kind: 'fight' }
  | { kind: 'destroy' }
  | { kind: 'draw'; n: number }
  | { kind: 'gain'; n: number };

export type TargetSpec = 'any' | 'creature' | 'player' | 'fight';

export type CardType = 'land' | 'creature' | 'instant' | 'sorcery';

export interface CardDef {
  /** Nome Oracle em inglês: identifica a carta nos decks, no cache e no Forge. */
  name: string;
  /** Nome mostrado ao jogador: o impresso em português, ou o original se não houver tradução. */
  label: string;
  labelType: string;
  printedText?: string;
  type: CardType;
  typeLine: string;
  manaCost: string;
  cost: ManaCost;
  cmc: number;
  colors: Color[];
  power: number;
  toughness: number;
  keywords: Keyword[];
  text: string;
  /** Cores que a carta pode gerar com {T} (escolhe uma). */
  produces: Color[];
  entersTapped: boolean;
  spell: Effect[];
  etb: Effect[];
  image?: string;
  imageSmall?: string;
  artCrop?: string;
  supported: boolean;
  problem?: string;
}

export interface Card {
  uid: number;
  def: CardDef;
  owner: number;
  tapped: boolean;
  sick: boolean;
  damage: number;
  /** Recebeu dano de uma fonte com toque mortífero. */
  dt: boolean;
  pumpP: number;
  pumpT: number;
  attacking: boolean;
  blocking: number | null;
  wasBlocked: boolean;
}

export interface Player {
  idx: number;
  name: string;
  ai: boolean;
  deckName: string;
  life: number;
  library: Card[];
  hand: Card[];
  bf: Card[];
  gy: Card[];
  pool: Record<Color, number>;
  landPlayed: boolean;
  decked: boolean;
}

export type PlayerTarget = { player: number };
export type Target = PlayerTarget | Card;
export const isPlayerTarget = (t: Target): t is PlayerTarget => 'player' in t;

export type Phase = 'untap' | 'upkeep' | 'draw' | 'main1' | 'combat' | 'main2' | 'end';
export type Step = null | 'attackers' | 'blockers' | 'tricks';
export type Mode = null | 'attack' | 'block' | 'discard';

export interface Pending {
  card: Card;
  effect: Effect;
  spec: TargetSpec;
  targets: Target[];
  /** "spell": mágica ainda na mão, pode cancelar. "etb": habilidade de criatura que entrou, obrigatória. */
  from: 'spell' | 'etb';
  controller: number;
}

export interface LogEntry {
  msg: string;
  mine?: boolean;
  sep?: boolean;
}
