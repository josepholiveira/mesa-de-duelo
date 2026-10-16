import type { ScryCard } from './scryfall';

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
const COLORS: Color[] = ['W', 'U', 'B', 'R', 'G'];

export type CardType = 'creature' | 'planeswalker' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'battle' | 'land' | 'other';
/** Ordem de prioridade: uma criatura artefato conta como criatura, um terreno-criatura como terreno. */
const TYPES: [RegExp, CardType][] = [
  [/\bLand\b/, 'land'], [/\bCreature\b/, 'creature'], [/\bPlaneswalker\b/, 'planeswalker'], [/\bInstant\b/, 'instant'],
  [/\bSorcery\b/, 'sorcery'], [/\bBattle\b/, 'battle'], [/\bArtifact\b/, 'artifact'], [/\bEnchantment\b/, 'enchantment'],
];

/** O que as telas mostram de uma carta. As regras ficam todas no Forge. */
export interface CardInfo {
  /** Nome Oracle em inglês: identifica a carta nos decks, no cache e no Forge. */
  name: string;
  /** Nome mostrado ao jogador: o impresso em português, ou o original se não houver tradução. */
  label: string;
  type: CardType;
  manaCost: string;
  cmc: number;
  colors: Color[];
  /** Texto impresso em português, ou o Oracle em inglês. */
  text: string;
  image?: string;
  imageSmall?: string;
  artCrop?: string;
}

/** Valor de mana: soma dos genéricos e um por símbolo colorido/híbrido; X vale 0. */
function cmcOf(cost: string) {
  return (cost.match(/\{[^}]+\}/g) ?? []).reduce((s, raw) => {
    const x = raw.slice(1, -1);
    return s + (/^\d+$/.test(x) ? +x : x === 'X' ? 0 : 1);
  }, 0);
}

export function cardInfo(sc: ScryCard): CardInfo {
  const type = TYPES.find(([re]) => re.test(sc.type_line))?.[1] ?? 'other';
  const colorSrc = type === 'land' ? sc.color_identity : sc.colors ?? sc.color_identity;
  return {
    name: sc.name,
    label: sc.pt?.name || sc.name,
    type,
    manaCost: sc.mana_cost ?? '',
    cmc: cmcOf(sc.mana_cost ?? ''),
    colors: COLORS.filter(c => colorSrc?.includes(c)),
    text: sc.pt?.text || sc.oracle_text || '',
    image: sc.pt?.image_uris?.normal ?? sc.image_uris?.normal,
    imageSmall: sc.pt?.image_uris?.small ?? sc.image_uris?.small,
    artCrop: sc.pt?.image_uris?.art_crop ?? sc.image_uris?.art_crop,
  };
}
