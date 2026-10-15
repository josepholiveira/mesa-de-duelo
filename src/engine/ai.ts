import type { Game } from './game';
import { canAttack, canBlock, duel, has, isCreature, isLand, kills, pow, tou } from './rules';
import type { Card, Effect, Player, Target } from './types';

export const value = (c: Card) =>
  pow(c) + tou(c) / 2 + c.def.cmc + c.def.keywords.length + (c.def.produces.length ? 1 : 0);

const dies = (c: Card, n: number) => tou(c) - c.damage <= n;

/** Escolhe alvos para um efeito. `mandatory` = habilidade que precisa de alvo se houver algum. */
export function chooseTargets(g: Game, p: Player, e: Effect, mandatory: boolean): Target[] | null {
  const opp = g.other(p);
  const theirs = opp.bf.filter(isCreature).sort((a, b) => value(b) - value(a));
  const mine = p.bf.filter(isCreature).sort((a, b) => value(b) - value(a));
  const face: Target = { player: opp.idx };
  switch (e.kind) {
    case 'damage': {
      if (e.target === 'opponent') return [];
      if (e.target !== 'creature' && opp.life <= e.n) return [face];
      if (e.target !== 'player') {
        const k = theirs.find(c => dies(c, e.n));
        if (k && (mandatory || value(k) >= 3)) return [k];
      }
      if (e.target !== 'creature' && (mandatory || e.target === 'player' || opp.life <= 8)) return [face];
      if (mandatory && theirs[0]) return [theirs[0]];
      return null;
    }
    case 'destroy':
      return theirs[0] ? [theirs[0]] : null;
    case 'fight':
      for (const x of mine) {
        const y = theirs.find(y => kills(x, y) && !kills(y, x));
        if (y) return [x, y];
      }
      return null;
    case 'pump':
      return mandatory && mine[0] ? [mine[0]] : null;
    default:
      return [];
  }
}

export function mainPhase(g: Game, p: Player) {
  if (!p.landPlayed && g.isMain()) {
    const lands = p.hand.filter(isLand);
    const pick = lands.find(l => !l.def.entersTapped) ?? lands[0];
    if (pick) g.playLand(p, pick);
  }
  for (let n = 0; n < 15 && !g.over; n++) {
    const options = p.hand
      .filter(c => !isLand(c) && g.canCast(p, c))
      .sort((a, b) => b.def.cmc - a.def.cmc || Number(isCreature(b)) - Number(isCreature(a)));
    let acted = false;
    for (const c of options) {
      if (isCreature(c)) { g.castSpell(p, c, []); acted = true; break; }
      if (c.def.spell.some(e => e.kind === 'pump')) continue; // guardado para o combate
      const te = g.targetedEffect(c.def);
      const targets = te ? chooseTargets(g, p, te, false) : [];
      if (!targets) continue;
      g.castSpell(p, c, targets);
      acted = true;
      break;
    }
    if (!acted) break;
  }
}

export function chooseAttackers(g: Game, p: Player): Card[] {
  const opp = g.other(p);
  const cands = p.bf.filter(c => canAttack(c) && pow(c) > 0 && !(c.def.produces.length && pow(c) <= 1));
  const blockers = opp.bf.filter(c => isCreature(c) && !c.tapped);
  if (!blockers.length) return cands;

  const chosen = cands.filter(a => {
    const able = blockers.filter(b => canBlock(b, a));
    if (!able.length) return true;
    return !able.some(b => { const r = duel(a, b); return r.xDies && !r.yDies; });
  });

  // Se o oponente ameaça dano letal no próximo turno, deixa defensores em casa.
  const threat = opp.bf.filter(c => isCreature(c) && !has(c, 'defender')).reduce((s, c) => s + pow(c), 0);
  if (threat >= p.life) {
    const home = chosen.filter(c => !has(c, 'vigilance')).sort((a, b) => tou(b) - tou(a)).slice(0, 2);
    return chosen.filter(c => !home.includes(c));
  }
  return chosen;
}

export function declareBlocks(g: Game, p: Player) {
  const atk = g.attackers().sort((a, b) => pow(b) - pow(a));
  let avail = p.bf.filter(c => isCreature(c) && !c.tapped).sort((a, b) => value(a) - value(b));
  let incoming = atk.reduce((s, a) => s + pow(a), 0);
  const assign = (b: Card, a: Card) => {
    b.blocking = a.uid;
    avail = avail.filter(x => x !== b);
    incoming -= has(a, 'trample') ? Math.min(pow(a), tou(b)) : pow(a);
  };

  for (const a of atk) {
    if (has(a, 'menace')) continue;
    const able = avail.filter(b => canBlock(b, a));
    const pick =
      able.find(b => { const r = duel(b, a); return r.yDies && !r.xDies; }) ??
      (!has(a, 'trample') ? able.find(b => !duel(b, a).xDies) : undefined) ??
      able.find(b => { const r = duel(b, a); return r.xDies && r.yDies && value(a) >= value(b); });
    if (pick) assign(pick, a);
  }
  if (incoming >= p.life) {
    for (const a of atk) {
      if (incoming < p.life) break;
      if (has(a, 'menace') || p.bf.some(b => b.blocking === a.uid)) continue;
      const b = avail.find(b => canBlock(b, a));
      if (b) assign(b, a);
    }
  }
}

/** Pares (criatura de p, criatura inimiga) que vão trocar dano neste combate. */
function pairs(g: Game, p: Player) {
  const D = g.other(g.activePlayer);
  const res: { x: Card; y: Card }[] = [];
  for (const a of g.attackers()) {
    const bs = D.bf.filter(b => b.blocking === a.uid);
    if (a.owner === p.idx) { if (bs[0]) res.push({ x: a, y: bs[0] }); }
    else bs.filter(b => b.owner === p.idx).forEach(b => res.push({ x: b, y: a }));
  }
  return res;
}

export function combatTricks(g: Game, p: Player) {
  for (let n = 0; n < 4 && !g.over; n++) {
    let did = false;
    for (const { x, y } of pairs(g, p)) {
      if (!g.onBF(x) || !g.onBF(y)) continue;
      const r = duel(x, y);
      if (!r.xDies && r.yDies) continue;

      const pump = p.hand.find(c => c.def.spell.length === 1 && c.def.spell[0].kind === 'pump' && g.canCast(p, c));
      if (pump) {
        const e = pump.def.spell[0] as Extract<Effect, { kind: 'pump' }>;
        x.pumpP += e.p; x.pumpT += e.t;
        const r2 = duel(x, y);
        x.pumpP -= e.p; x.pumpT -= e.t;
        if ((r.xDies && !r2.xDies) || (!r.yDies && r2.yDies)) { g.castSpell(p, pump, [x]); did = true; break; }
      }
      if (r.xDies) {
        const removal = p.hand.find(c => c.def.type === 'instant' && g.canCast(p, c) && c.def.spell.some(e =>
          e.kind === 'destroy' || (e.kind === 'damage' && (e.target === 'any' || e.target === 'creature') && dies(y, e.n))));
        if (removal) { g.castSpell(p, removal, [y]); did = true; break; }
      }
    }
    if (!did) break;
  }
}

export function discardDown(g: Game, p: Player) {
  while (p.hand.length > 7) {
    const lands = p.hand.filter(isLand);
    const pick = lands.length > 3 ? lands[0] : [...p.hand].sort((a, b) => b.def.cmc - a.def.cmc)[0];
    g.discard(p, pick);
  }
}
