import { describe, expect, it } from 'vitest';
import { parseManaCost } from '../src/engine/parse';
import { card } from './fixtures';

describe('custo de mana', () => {
  it('lê genérico e cores', () => {
    expect(parseManaCost('{4}{G}{G}')).toMatchObject({ generic: 4, G: 2, R: 0 });
  });
  it('recusa X e híbrido', () => {
    expect(parseManaCost('{X}{R}')).toBeNull();
    expect(parseManaCost('{R/G}')).toBeNull();
  });
});

describe('conversão de cartas do Scryfall', () => {
  it('terreno básico gera a cor do subtipo', () => {
    expect(card('Mountain')).toMatchObject({ type: 'land', produces: ['R'], supported: true });
  });
  it('terreno duplo entra virado e gera uma de duas cores', () => {
    expect(card('Azorius Guildgate')).toMatchObject({ entersTapped: true, produces: ['W', 'U'], supported: true });
  });
  it('palavras-chave com texto lembrete', () => {
    expect(card('Deadly Recluse').keywords).toEqual(['reach', 'deathtouch']);
    expect(card('Youthful Knight').keywords).toEqual(['first']);
  });
  it('criatura de mana', () => {
    expect(card('Llanowar Elves')).toMatchObject({ produces: ['G'], supported: true });
  });
  it('habilidades ao entrar', () => {
    expect(card('Inspiring Cleric').etb).toEqual([{ kind: 'gain', n: 4 }]);
    expect(card('Elvish Visionary').etb).toEqual([{ kind: 'draw', n: 1 }]);
  });
  it('mágicas', () => {
    expect(card('Shock').spell).toEqual([{ kind: 'damage', n: 2, target: 'any' }]);
    expect(card('Lava Axe').spell).toEqual([{ kind: 'damage', n: 5, target: 'player' }]);
    expect(card('Giant Growth').spell).toEqual([{ kind: 'pump', p: 3, t: 3 }]);
    expect(card('Prey Upon').spell).toEqual([{ kind: 'fight' }]);
    expect(card('Murder').spell).toEqual([{ kind: 'destroy' }]);
    expect(card('Divination').spell).toEqual([{ kind: 'draw', n: 2 }]);
  });
  it('marca o que o motor ainda não entende', () => {
    expect(card('Healing Salve').supported).toBe(false);
    expect(card('Raise the Alarm').supported).toBe(false);
    expect(card('Fireball').supported).toBe(false);
  });
});
