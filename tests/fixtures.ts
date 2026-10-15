import { toCardDef, type ScryCard } from '../src/engine/parse';
import type { CardDef } from '../src/engine/types';

/** Recortes de respostas reais do Scryfall, para testar sem rede. */
const raw: ScryCard[] = [
  { name: 'Mountain', layout: 'normal', mana_cost: '', type_line: 'Basic Land — Mountain', oracle_text: '({T}: Add {R}.)', color_identity: ['R'] },
  { name: 'Forest', layout: 'normal', mana_cost: '', type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)', color_identity: ['G'] },
  { name: 'Azorius Guildgate', layout: 'normal', mana_cost: '', type_line: 'Land — Gate', oracle_text: 'This land enters tapped.\n{T}: Add {W} or {U}.', color_identity: ['W', 'U'] },
  { name: 'Raging Goblin', layout: 'normal', mana_cost: '{R}', type_line: 'Creature — Goblin Berserker', oracle_text: 'Haste (This creature can attack and {T} as soon as it comes under your control.)', power: '1', toughness: '1', colors: ['R'] },
  { name: 'Hill Giant', layout: 'normal', mana_cost: '{3}{R}', type_line: 'Creature — Giant', oracle_text: '', power: '3', toughness: '3', colors: ['R'] },
  { name: 'Youthful Knight', layout: 'normal', mana_cost: '{1}{W}', type_line: 'Creature — Human Knight', oracle_text: 'First strike', power: '2', toughness: '1', colors: ['W'] },
  { name: 'Grizzly Bears', layout: 'normal', mana_cost: '{1}{G}', type_line: 'Creature — Bear', oracle_text: '', power: '2', toughness: '2', colors: ['G'] },
  { name: 'Colossal Dreadmaw', layout: 'normal', mana_cost: '{4}{G}{G}', type_line: 'Creature — Dinosaur', oracle_text: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)", power: '6', toughness: '6', colors: ['G'] },
  { name: 'Deadly Recluse', layout: 'normal', mana_cost: '{1}{G}', type_line: 'Creature — Spider', oracle_text: 'Reach (This creature can block creatures with flying.)\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)', power: '1', toughness: '2', colors: ['G'] },
  { name: 'Llanowar Elves', layout: 'normal', mana_cost: '{G}', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.', power: '1', toughness: '1', colors: ['G'] },
  { name: 'Inspiring Cleric', layout: 'normal', mana_cost: '{2}{W}', type_line: 'Creature — Vampire Cleric', oracle_text: 'When this creature enters, you gain 4 life.', power: '3', toughness: '2', colors: ['W'] },
  { name: 'Elvish Visionary', layout: 'normal', mana_cost: '{1}{G}', type_line: 'Creature — Elf Shaman', oracle_text: 'When this creature enters, draw a card.', power: '1', toughness: '1', colors: ['G'] },
  { name: 'Shock', layout: 'normal', mana_cost: '{R}', type_line: 'Instant', oracle_text: 'Shock deals 2 damage to any target.', colors: ['R'] },
  { name: 'Lava Axe', layout: 'normal', mana_cost: '{4}{R}', type_line: 'Sorcery', oracle_text: 'Lava Axe deals 5 damage to target player or planeswalker.', colors: ['R'] },
  { name: 'Giant Growth', layout: 'normal', mana_cost: '{G}', type_line: 'Instant', oracle_text: 'Target creature gets +3/+3 until end of turn.', colors: ['G'] },
  { name: 'Prey Upon', layout: 'normal', mana_cost: '{G}', type_line: 'Sorcery', oracle_text: "Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)", colors: ['G'] },
  { name: 'Murder', layout: 'normal', mana_cost: '{1}{B}{B}', type_line: 'Instant', oracle_text: 'Destroy target creature.', colors: ['B'] },
  { name: 'Divination', layout: 'normal', mana_cost: '{2}{U}', type_line: 'Sorcery', oracle_text: 'Draw two cards.', colors: ['U'] },
  { name: 'Healing Salve', layout: 'normal', mana_cost: '{W}', type_line: 'Instant', oracle_text: 'Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn.', colors: ['W'] },
  { name: 'Raise the Alarm', layout: 'normal', mana_cost: '{1}{W}', type_line: 'Instant', oracle_text: 'Create two 1/1 white Soldier creature tokens.', colors: ['W'] },
  { name: 'Fireball', layout: 'normal', mana_cost: '{X}{R}', type_line: 'Sorcery', oracle_text: 'This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided as you choose among any number of targets.', colors: ['R'] },
];

export const SC: Record<string, ScryCard> = Object.fromEntries(raw.map(c => [c.name, c]));
export const card = (name: string): CardDef => toCardDef(SC[name]);
export const many = (name: string, n: number): CardDef[] => Array.from({ length: n }, () => card(name));
