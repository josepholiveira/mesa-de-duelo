export interface DeckEntry { name: string; count: number }
export interface DeckData { id: string; name: string; cards: DeckEntry[]; builtin?: boolean }

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
export const isBasic = (name: string) => BASICS.has(name);

export const DEFAULT_DECKS: DeckData[] = [
  {
    id: 'padrao-vermelho', name: 'Fúria da Montanha', builtin: true,
    cards: [
      { name: 'Mountain', count: 17 }, { name: 'Raging Goblin', count: 4 }, { name: 'Goblin Piker', count: 3 },
      { name: 'Boggart Brute', count: 3 }, { name: 'Hill Giant', count: 3 }, { name: 'Fire Elemental', count: 2 },
      { name: 'Shock', count: 4 }, { name: 'Lightning Strike', count: 2 }, { name: 'Volcanic Hammer', count: 1 },
      { name: 'Lava Axe', count: 1 },
    ],
  },
  {
    id: 'padrao-verde', name: 'Coração da Mata', builtin: true,
    cards: [
      { name: 'Forest', count: 17 }, { name: 'Llanowar Elves', count: 3 }, { name: 'Grizzly Bears', count: 3 },
      { name: 'Deadly Recluse', count: 2 }, { name: 'Elvish Visionary', count: 2 }, { name: 'Centaur Courser', count: 3 },
      { name: 'Trained Armodon', count: 2 }, { name: 'Giant Spider', count: 2 }, { name: 'Colossal Dreadmaw', count: 2 },
      { name: 'Craw Wurm', count: 1 }, { name: 'Giant Growth', count: 2 }, { name: 'Prey Upon', count: 1 },
    ],
  },
  {
    id: 'padrao-azorius', name: 'Céu Aberto', builtin: true,
    cards: [
      { name: 'Plains', count: 8 }, { name: 'Island', count: 7 }, { name: 'Azorius Guildgate', count: 2 },
      { name: 'Suntail Hawk', count: 3 }, { name: "Healer's Hawk", count: 2 }, { name: 'Savannah Lions', count: 3 },
      { name: 'Youthful Knight', count: 3 }, { name: 'Glory Seeker', count: 2 }, { name: 'Wind Drake', count: 3 },
      { name: 'Tolarian Scholar', count: 2 }, { name: 'Inspiring Cleric', count: 2 }, { name: 'Air Elemental', count: 1 },
      { name: 'Serra Angel', count: 1 }, { name: 'Divination', count: 1 },
    ],
  },
  {
    // Mono-white auras (Standard): criaturas baratas e protegidas + auras que crescem com o número de encantamentos.
    id: 'padrao-auras', name: 'Auras Brancas', builtin: true,
    cards: [
      { name: 'Plains', count: 18 },
      // Criaturas (19)
      { name: 'Optimistic Scavenger', count: 4 }, { name: 'Spellbook Vendor', count: 4 }, { name: 'Knight of Grace', count: 3 },
      { name: 'Unflinching Hortimancer', count: 3 }, { name: 'Cult Healer', count: 3 }, { name: 'Archon of the Wild Rose', count: 2 },
      // Auras (21)
      { name: 'Ethereal Armor', count: 4 }, { name: 'Sheltered by Ghosts', count: 4 }, { name: 'Feather of Flight', count: 4 },
      { name: "Shardmage's Rescue", count: 3 }, { name: 'Twinblade Blessing', count: 2 }, { name: 'Super-Soldier Serum', count: 2 },
      { name: 'Angelic Destiny', count: 2 },
      // Remoção (2)
      { name: 'Dimensional Exile', count: 2 },
    ],
  },
  {
    // Izzet Spellementals (Standard, out/2026): mágicas baratas abastecem Sunderflock, Hearth Elemental e Eddymurk Crab.
    id: 'padrao-izzet', name: 'Elementais Izzet', builtin: true,
    cards: [
      { name: 'Island', count: 6 }, { name: 'Steam Vents', count: 4 }, { name: 'Spirebluff Canal', count: 4 },
      { name: 'Riverpyre Verge', count: 4 }, { name: 'Multiversal Passage', count: 1 }, { name: 'Stormcarved Coast', count: 1 },
      // Criaturas (12)
      { name: 'Sunderflock', count: 4 }, { name: 'Hearth Elemental', count: 4 }, { name: 'Eddymurk Crab', count: 4 },
      // Mágicas (28)
      { name: 'Opt', count: 4 }, { name: 'Sleight of Hand', count: 4 }, { name: 'Prismari Charm', count: 4 },
      { name: 'Burst Lightning', count: 3 }, { name: 'Traumatic Critique', count: 3 }, { name: 'Flow State', count: 2 },
      { name: 'Get Out', count: 2 }, { name: 'Impractical Joke', count: 2 }, { name: 'Spell Pierce', count: 2 },
      { name: 'Winternight Stories', count: 2 },
    ],
  },
  {
    // Mono-Green Landfall (Standard, out/2026): terrenos extras e gatilhos de landfall com Surrak e Mightform Harmonizer.
    id: 'padrao-landfall', name: 'Landfall Verde', builtin: true,
    cards: [
      { name: 'Forest', count: 14 }, { name: 'Fabled Passage', count: 4 }, { name: 'Ba Sing Se', count: 3 },
      { name: 'Escape Tunnel', count: 4 }, { name: 'Sapling Nursery', count: 4 }, { name: 'Demolition Field', count: 1 },
      // Criaturas
      { name: 'Llanowar Elves', count: 4 }, { name: 'Icetill Explorer', count: 4 }, { name: "Sazh's Chocobo", count: 4 },
      { name: 'Mightform Harmonizer', count: 3 }, { name: 'Keen-Eyed Curator', count: 2 }, { name: 'Surrak, Elusive Hunter', count: 1 },
      // Mágicas e permanentes
      { name: 'Earthbender Ascension', count: 4 }, { name: 'Esper Origins', count: 4 }, { name: 'Shared Roots', count: 2 },
      { name: 'Lumbering Worldwagon', count: 1 }, { name: "Meltstrider's Resolve", count: 1 },
    ],
  },
  {
    // Dimir Midrange (Standard, out/2026): criaturas com flash e interação, fechando com Kaito, Bane of Nightmares.
    id: 'padrao-dimir', name: 'Pesadelos Dimir', builtin: true,
    cards: [
      { name: 'Island', count: 4 }, { name: 'Swamp', count: 4 }, { name: 'Watery Grave', count: 4 },
      { name: 'Gloomlake Verge', count: 4 }, { name: 'Hidden Lair', count: 3 }, { name: 'Restless Reef', count: 2 },
      { name: 'Soulstone Sanctuary', count: 2 },
      // Criaturas
      { name: 'Floodpits Drowner', count: 4 }, { name: 'Spyglass Siren', count: 4 }, { name: 'Dream Beavers', count: 4 },
      { name: 'Enduring Curiosity', count: 3 }, { name: "Tishana's Tidebinder", count: 2 }, { name: 'The Wondrous Wasp', count: 2 },
      { name: 'Wan Shi Tong, Librarian', count: 2 },
      // Planeswalker e mágicas
      { name: 'Kaito, Bane of Nightmares', count: 4 }, { name: 'Requiting Hex', count: 4 }, { name: 'Bitter Triumph', count: 2 },
      { name: 'Shoot the Sheriff', count: 2 }, { name: 'We Say Thee Nay!', count: 2 }, { name: 'Spell Pierce', count: 1 },
      { name: 'Spell Snare', count: 1 },
    ],
  },
  {
    // Dimir Ninjas (Standard, out/2026): evasivos baratos abrem caminho para Sneak (TMNT) e o ninjutsu do Kaito.
    id: 'padrao-ninjas', name: 'Ninjas das Sombras', builtin: true,
    cards: [
      { name: 'Island', count: 5 }, { name: 'Swamp', count: 5 }, { name: 'Watery Grave', count: 4 },
      { name: 'Gloomlake Verge', count: 4 }, { name: 'Hidden Lair', count: 2 }, { name: 'Restless Reef', count: 2 },
      // Evasivos (atacantes não bloqueados)
      { name: 'Spyglass Siren', count: 4 }, { name: 'Spectral Sailor', count: 3 }, { name: 'Faerie Dreamthief', count: 2 },
      { name: 'Silent Hallcreeper', count: 4 }, { name: 'Shoreline Looter', count: 3 }, { name: 'Malcolm, Alluring Scoundrel', count: 2 },
      // Ninjas com Sneak
      { name: 'Splinter, Hamato Yoshi', count: 3 }, { name: 'Oroku Saki, Shredder Rising', count: 4 },
      { name: 'Elektra, Daughter of the Hand', count: 2 }, { name: 'Shredder, Unrelenting', count: 1 },
      // Ninjutsu e técnicas
      { name: 'Kaito, Bane of Nightmares', count: 3 }, { name: "Shredder's Technique", count: 3 },
      { name: "Donatello's Technique", count: 3 }, { name: "Splinter's Technique", count: 1 },
    ],
  },
  {
    // Coelhos (Standard, out/2026): várias cópias de Hare Apparent, cada uma criando mais fichas; Elspeth, Storm Slayer dobra tudo.
    id: 'padrao-coelhos', name: 'Toca dos Coelhos', builtin: true,
    cards: [
      { name: 'Plains', count: 20 },
      // Ramp (5): Patchwork Banner nomeando Rabbit dá +1/+1 ao exército; Gideon's Memorial reforça as fichas e adianta a Elspeth.
      { name: 'Patchwork Banner', count: 3 }, { name: "Gideon's Memorial", count: 2 },
      // Criaturas (23)
      { name: 'Hare Apparent', count: 14 }, { name: 'Valley Questcaller', count: 4 }, { name: 'Harvestrite Host', count: 3 },
      { name: 'Warren Warleader', count: 2 },
      // Planeswalker e mágicas (12)
      { name: 'Elspeth, Storm Slayer', count: 4 }, { name: "Caretaker's Talent", count: 3 }, { name: 'Hop to It', count: 2 },
      { name: 'Get Lost', count: 3 },
    ],
  },
];

const KEY = 'mesa:decks:v1';

export function loadUserDecks(): DeckData[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function saveUserDecks(decks: DeckData[]) {
  try { localStorage.setItem(KEY, JSON.stringify(decks)); } catch { /* armazenamento indisponível */ }
}
export const allDecks = (): DeckData[] => [...DEFAULT_DECKS, ...loadUserDecks()];
export const deckSize = (d: DeckData) => d.cards.reduce((s, e) => s + e.count, 0);

