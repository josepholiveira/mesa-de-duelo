import { COLORS, type Color, type ManaCost } from './types';

export interface ManaSource {
  uid: number;
  colors: Color[];
  land: boolean;
}

export interface Payment {
  /** Quanto de cada cor sai da reserva de mana. */
  pool: Record<Color, number>;
  /** Fontes a virar. */
  tap: number[];
}

const zero = (): Record<Color, number> => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 });

/**
 * Encontra um jeito de pagar o custo usando primeiro a reserva e depois as fontes.
 * Prefere terrenos e fontes de uma cor só, para não gastar criaturas e terrenos duplos à toa.
 */
export function solvePayment(pool: Record<Color, number>, sources: ManaSource[], cost: ManaCost): Payment | null {
  const left = { ...pool };
  const usePool = zero();
  const needs: Color[] = [];
  for (const c of COLORS) {
    const u = Math.min(left[c], cost[c]);
    left[c] -= u; usePool[c] += u;
    for (let i = u; i < cost[c]; i++) needs.push(c);
  }

  const srcs = [...sources].sort((a, b) => Number(!a.land) - Number(!b.land) || a.colors.length - b.colors.length);
  const supply = (c: Color) => srcs.filter(s => s.colors.includes(c)).length;
  needs.sort((a, b) => supply(a) - supply(b));

  const used = new Set<number>();
  const assign = (i: number): boolean => {
    if (i === needs.length) return true;
    for (const s of srcs) {
      if (used.has(s.uid) || !s.colors.includes(needs[i])) continue;
      used.add(s.uid);
      if (assign(i + 1)) return true;
      used.delete(s.uid);
    }
    return false;
  };
  if (!assign(0)) return null;

  let generic = cost.generic;
  for (const c of COLORS) {
    const u = Math.min(left[c], generic);
    left[c] -= u; usePool[c] += u; generic -= u;
  }
  const rest = srcs.filter(s => !used.has(s.uid));
  if (rest.length < generic) return null;
  rest.slice(0, generic).forEach(s => used.add(s.uid));
  return { pool: usePool, tap: [...used] };
}
