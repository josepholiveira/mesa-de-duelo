import type { Card, Effect, Keyword, TargetSpec } from './types';

export const has = (c: Card, k: Keyword) => c.def.keywords.includes(k);
export const pow = (c: Card) => c.def.power + c.pumpP;
export const tou = (c: Card) => c.def.toughness + c.pumpT;
export const isCreature = (c: Card) => c.def.type === 'creature';
export const isLand = (c: Card) => c.def.type === 'land';
export const strikesFirst = (c: Card) => has(c, 'first') || has(c, 'double');

export const canAttack = (c: Card) =>
  isCreature(c) && !c.tapped && !has(c, 'defender') && (!c.sick || has(c, 'haste'));

export const canBlock = (b: Card, a: Card) =>
  isCreature(b) && !b.tapped && !(has(a, 'flying') && !has(b, 'flying') && !has(b, 'reach'));

export const isManaSource = (c: Card) =>
  !c.tapped && c.def.produces.length > 0 && (isLand(c) || !c.sick);

/** s mata t com um único golpe de dano igual ao seu poder? */
export const kills = (s: Card, t: Card, mult = 1) =>
  pow(s) > 0 && (has(s, 'deathtouch') || pow(s) * mult >= tou(t) - t.damage);

/** Previsão de um combate 1 contra 1 entre x e y. */
export function duel(x: Card, y: Card): { xDies: boolean; yDies: boolean } {
  const xf = strikesFirst(x), yf = strikesFirst(y);
  if (xf && !yf && kills(x, y)) return { xDies: false, yDies: true };
  if (yf && !xf && kills(y, x)) return { xDies: true, yDies: false };
  return {
    xDies: kills(y, x, has(y, 'double') ? 2 : 1),
    yDies: kills(x, y, has(x, 'double') ? 2 : 1),
  };
}

export function targetSpec(e: Effect): TargetSpec | null {
  switch (e.kind) {
    case 'damage': return e.target === 'opponent' ? null : e.target;
    case 'pump':
    case 'destroy': return 'creature';
    case 'fight': return 'fight';
    default: return null;
  }
}
