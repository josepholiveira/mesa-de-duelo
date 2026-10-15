import { describe, expect, it } from 'vitest';
import { Game, makeCard, type DeckList } from '../src/engine/game';
import { solvePayment } from '../src/engine/mana';
import { parseManaCost } from '../src/engine/parse';
import type { Card, CardDef } from '../src/engine/types';
import { card, many } from './fixtures';

const quiet = { change() {}, pause: () => Promise.resolve() };
const deck = (cards: CardDef[]): DeckList => ({ name: 'teste', cards });

function setup(ai = false) {
  const g = new Game(
    [{ name: 'Você', deck: deck(many('Forest', 20)), ai }, { name: 'O oponente', deck: deck(many('Mountain', 20)), ai: true }],
    quiet,
  );
  return g;
}
function put(g: Game, owner: number, name: string): Card {
  const c = makeCard(card(name), owner);
  g.players[owner].bf.push(c);
  return c;
}
/** Monta um combate com o jogador 0 atacando. */
function fight(g: Game, attacker: Card, blockers: Card[]) {
  g.active = 0;
  attacker.attacking = true;
  blockers.forEach(b => { b.blocking = attacker.uid; });
  attacker.wasBlocked = blockers.length > 0;
  g.resolveCombat();
}

describe('pagamento de mana', () => {
  it('usa a fonte certa para cada cor', () => {
    const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const sources = [
      { uid: 1, colors: ['W', 'U'] as const, land: true },
      { uid: 2, colors: ['W'] as const, land: true },
    ].map(s => ({ ...s, colors: [...s.colors] }));
    expect(solvePayment(pool, sources, parseManaCost('{U}{W}')!)?.tap.sort()).toEqual([1, 2]);
    expect(solvePayment(pool, sources, parseManaCost('{U}{U}')!)).toBeNull();
  });
});

describe('combate', () => {
  it('iniciativa mata antes de receber dano', () => {
    const g = setup();
    const knight = put(g, 0, 'Youthful Knight');
    const bears = put(g, 1, 'Grizzly Bears');
    fight(g, knight, [bears]);
    expect(g.players[1].gy).toContain(bears);
    expect(g.players[0].bf).toContain(knight);
  });
  it('atropelar passa o excesso ao jogador', () => {
    const g = setup();
    const maw = put(g, 0, 'Colossal Dreadmaw');
    const bears = put(g, 1, 'Grizzly Bears');
    fight(g, maw, [bears]);
    expect(g.players[1].life).toBe(16);
  });
  it('toque mortífero mata com 1 de dano', () => {
    const g = setup();
    const maw = put(g, 0, 'Colossal Dreadmaw');
    const recluse = put(g, 1, 'Deadly Recluse');
    fight(g, maw, [recluse]);
    expect(g.players[0].gy).toContain(maw);
  });
  it('atacante sem bloqueio causa dano ao jogador', () => {
    const g = setup();
    const giant = put(g, 0, 'Hill Giant');
    fight(g, giant, []);
    expect(g.players[1].life).toBe(17);
  });
});

describe('fluxo de turno', () => {
  it('depois do turno da IA o humano pode agir', async () => {
    const g = setup();
    g.start(1);
    for (let i = 0; i < 2000 && g.active !== 0; i++) await new Promise(r => setTimeout(r, 0));
    expect(g.active).toBe(0);
    expect(g.humanCanAct()).toBe(true);
    const land = g.players[0].hand[0];
    g.clickCard(land.uid);
    expect(g.players[0].bf).toContain(land);
  });
});

describe('partida completa', () => {
  it('IA contra IA termina sem erros', async () => {
    const red = deck([...many('Mountain', 17), ...many('Raging Goblin', 8), ...many('Hill Giant', 8), ...many('Shock', 4), ...many('Lava Axe', 3)]);
    const green = deck([...many('Forest', 17), ...many('Llanowar Elves', 4), ...many('Grizzly Bears', 6), ...many('Deadly Recluse', 4),
      ...many('Colossal Dreadmaw', 3), ...many('Elvish Visionary', 2), ...many('Giant Growth', 2), ...many('Prey Upon', 2)]);
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (e: unknown) => errors.push(e);
    const g = new Game([{ name: 'A', deck: red, ai: true }, { name: 'B', deck: green, ai: true }], quiet);
    g.start(0);
    for (let i = 0; i < 20000 && !g.over; i++) await new Promise(r => setTimeout(r, 0));
    console.error = orig;
    expect(errors).toEqual([]);
    expect(g.over).not.toBeNull();
  }, 30000);
});
