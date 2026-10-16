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
      { name: 'Splinter, Hamato Yoshi', count: 3 }, { name: 'Oroku Saki, Shredder Rising', count: 4 }, { name: 'Elektra, Daughter of the Hand', count: 2 },
      { name: 'Shredder, Unrelenting', count: 1 },
      // Ninjutsu e técnicas
      { name: 'Kaito, Bane of Nightmares', count: 3 }, { name: "Shredder's Technique", count: 3 }, { name: "Donatello's Technique", count: 3 },
      { name: "Splinter's Technique", count: 1 },
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
  {
    // Boros Dragons (Standard, out/2026, top 8 de torneio): Momo e Sarkhan aceleram dragões como Magmatic Hellkite, Nova Hellkite e Smaug; Cavern of Souls impede contramágicas.
    id: 'padrao-dragoes', name: 'Ninho de Dragões', builtin: true,
    cards: [
      // Terrenos (24)
      { name: 'Inspiring Vantage', count: 4 }, { name: 'Multiversal Passage', count: 4 }, { name: 'Sacred Foundry', count: 4 },
      { name: 'Sunbillow Verge', count: 4 }, { name: 'Cavern of Souls', count: 3 }, { name: 'Maelstrom of the Spirit Dragon', count: 3 },
      { name: 'Mountain', count: 1 }, { name: 'Plains', count: 1 },
      // Criaturas (30)
      { name: 'Clarion Conqueror', count: 4 }, { name: 'Magmatic Hellkite', count: 4 }, { name: 'Momo, Friendly Flier', count: 4 },
      { name: 'Nova Hellkite', count: 4 }, { name: 'Sarkhan, Dragon Ascendant', count: 4 }, { name: 'Smaug the Magnificent', count: 4 },
      { name: 'Voice of Victory', count: 4 }, { name: 'Twinmaw Stormbrood', count: 2 },
      // Mágicas e permanentes (6)
      { name: 'Burst Lightning', count: 4 }, { name: 'Erode', count: 2 },
    ],
  },
  {
    // Azorius Control (Standard, out/2026): contramágicas, remoção e varredura até The Theorist, Jace Beleren e Jace Reawakened fecharem o jogo.
    id: 'padrao-azorius-controle', name: 'Teorema de Jace', builtin: true,
    cards: [
      // Terrenos (26)
      { name: 'Deserted Beach', count: 4 }, { name: 'Floodfarm Verge', count: 4 }, { name: 'Hallowed Fountain', count: 4 },
      { name: 'Island', count: 3 }, { name: 'Petrified Hamlet', count: 3 }, { name: 'Meticulous Archive', count: 2 },
      { name: 'Plains', count: 2 }, { name: 'Restless Anchorage', count: 2 }, { name: "Theorist's Sanctum", count: 2 },
      // Planeswalkers (5)
      { name: 'The Theorist, Jace Beleren', count: 4 }, { name: 'Jace Reawakened', count: 1 },
      // Mágicas e permanentes (29)
      { name: 'Consult the Star Charts', count: 4 }, { name: 'Countersculpt', count: 4 }, { name: 'Get Lost', count: 4 },
      { name: "Jace's Machinations", count: 4 }, { name: 'No More Lies', count: 3 }, { name: 'Seam Rip', count: 3 },
      { name: 'Day of Judgment', count: 2 }, { name: 'Pinnacle Starcage', count: 2 }, { name: 'Erode', count: 1 },
      { name: 'Spell Snare', count: 1 }, { name: 'Three Steps Ahead', count: 1 },
    ],
  },
  {
    // Jund Sacrifice (Standard, out/2026): criaturas que viram comida e tesouro alimentam Gene Pollinator, Callous Inspector e Rottenmouth Viper.
    id: 'padrao-jund', name: 'Banquete Jund', builtin: true,
    cards: [
      // Terrenos (21)
      { name: 'Blazemire Verge', count: 4 }, { name: 'Overgrown Tomb', count: 4 }, { name: 'Starting Town', count: 4 },
      { name: 'Stomping Ground', count: 3 }, { name: 'Wastewood Verge', count: 2 }, { name: 'Blood Crypt', count: 1 },
      { name: 'Blooming Marsh', count: 1 }, { name: 'Forest', count: 1 }, { name: 'Swamp', count: 1 },
      // Criaturas (25)
      { name: 'Biotech Specialist', count: 4 }, { name: 'Gene Pollinator', count: 4 }, { name: 'Greedy Freebooter', count: 4 },
      { name: 'The Sackville-Bagginses', count: 4 }, { name: 'Callous Inspector', count: 3 }, { name: 'Rottenmouth Viper', count: 2 },
      { name: 'Umbral Collar Zealot', count: 2 }, { name: 'Smaug the Magnificent', count: 1 }, { name: 'Wolverine, Fierce Fighter', count: 1 },
      // Mágicas e permanentes (14)
      { name: 'Lively Dirge', count: 4 }, { name: 'Obsessive Pursuit', count: 4 }, { name: 'Requiting Hex', count: 2 },
      { name: 'Stir Up Trouble', count: 2 }, { name: 'The Misty Mountains Cold', count: 2 },
    ],
  },
  {
    // Izzet Prowess (Standard, out/2026): mágicas baratas disparam a destreza de Elusive Otter, Slickshot Show-Off e Pompous Battlemage.
    id: 'padrao-prowess', name: 'Destreza Izzet', builtin: true,
    cards: [
      // Terrenos (20)
      { name: 'Island', count: 4 }, { name: 'Riverpyre Verge', count: 4 }, { name: 'Spirebluff Canal', count: 4 },
      { name: 'Steam Vents', count: 4 }, { name: 'Multiversal Passage', count: 2 }, { name: 'Mountain', count: 1 },
      { name: 'Starting Town', count: 1 },
      // Criaturas (14)
      { name: 'Elusive Otter', count: 4 }, { name: 'Pompous Battlemage', count: 4 }, { name: 'Slickshot Show-Off', count: 4 },
      { name: 'Eddymurk Crab', count: 2 },
      // Mágicas e permanentes (26)
      { name: 'Burst Lightning', count: 4 }, { name: 'Flow State', count: 4 }, { name: 'Opt', count: 4 },
      { name: 'Sleight of Hand', count: 4 }, { name: 'Bounce Off', count: 2 }, { name: 'Impractical Joke', count: 2 },
      { name: 'Secret Identity', count: 2 }, { name: 'Spell Snare', count: 1 }, { name: 'Stock Up', count: 1 },
      { name: 'Vibrant Outburst', count: 1 }, { name: 'Wild Ride', count: 1 },
    ],
  },
  {
    // 4c Control (Standard, out/2026): Tablet of Discovery e Stock Up compram cartas, remoção segura o jogo e Jeskai Revelation vira a partida.
    id: 'padrao-4c', name: 'Revelação em Quatro Cores', builtin: true,
    cards: [
      // Terrenos (26)
      { name: 'Blood Crypt', count: 4 }, { name: 'Great Hall of the Biblioplex', count: 4 }, { name: 'Bleachbone Verge', count: 3 },
      { name: 'Riverpyre Verge', count: 3 }, { name: 'Sacred Foundry', count: 3 }, { name: 'Shattered Sanctum', count: 2 },
      { name: 'Steam Vents', count: 2 }, { name: 'Deserted Beach', count: 1 }, { name: 'Mistrise Village', count: 1 },
      { name: 'Plains', count: 1 }, { name: 'Shipwreck Marsh', count: 1 }, { name: 'Swamp', count: 1 },
      // Mágicas e permanentes (34)
      { name: 'Inevitable Defeat', count: 4 }, { name: 'Jeskai Revelation', count: 4 }, { name: 'Stock Up', count: 4 },
      { name: 'Tablet of Discovery', count: 4 }, { name: 'Consult the Star Charts', count: 2 }, { name: 'Deadly Cover-Up', count: 2 },
      { name: 'Duress', count: 2 }, { name: 'Fire Magic', count: 2 }, { name: 'Firebending Lesson', count: 2 },
      { name: 'Flashback', count: 2 }, { name: 'Lightning Helix', count: 2 }, { name: 'Strategic Betrayal', count: 2 },
      { name: 'Sear', count: 1 }, { name: 'Together as One', count: 1 },
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


export interface ParsedList { main: DeckEntry[]; sideboard: number; skipped: string[] }

/** Cabeçalhos de seção que aparecem nas exportações (Arena, MTGO, Moxfield, Archidekt). */
const SECTION = /^(deck|main ?deck|mainboard|commanders?|companions?|sideboard|maybeboard|considering|tokens?)$/i;
const OUT_OF_DECK = /^(sideboard|maybeboard|considering|tokens?)/i;

/**
 * Lê uma lista de deck em texto. Aceita "4 Nome", "4x Nome", "Nome" (1 cópia), coleção e número
 * ("4 Nome (FDN) 123 *F*"), marcações do Archidekt ("[Removal]", "^Tag^"), "SB: 2 Nome" e comentários.
 * Sideboard, maybeboard e fichas ficam de fora; no formato do MTGO, sem cabeçalhos, o que vem depois
 * da primeira linha em branco é o sideboard.
 */
export function parseDeckList(text: string): ParsedList {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());
  const sectionOf = (l: string) => {
    const h = l.replace(/^\/\/\s*/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/:\s*$/, '').trim();
    return SECTION.test(h) ? h : null;
  };
  const hasHeaders = lines.some(l => sectionOf(l));
  const counts = new Map<string, DeckEntry>();
  const skipped: string[] = [];
  let sideboard = 0;
  let out = false;
  let seenCard = false;
  for (const raw of lines) {
    if (!raw) { if (!hasHeaders && seenCard) out = true; continue; }
    const header = sectionOf(raw);
    if (header) { out = OUT_OF_DECK.test(header); continue; }
    if (/^(\/\/|#)/.test(raw) || /^(about|name)\s/i.test(raw)) continue;
    const sb = /^SB:\s*/i.test(raw);
    const m = raw.replace(/^SB:\s*/i, '').match(/^(?:(\d+)\s*x?\s+)?(.+)$/i);
    if (!m) { skipped.push(raw); continue; }
    const count = m[1] ? +m[1] : 1;
    const tagged = /\[[^\]]*\b(sideboard|maybeboard)\b[^\]]*\]/i.test(m[2]);
    const name = m[2]
      .replace(/\s*\^[^^]*\^/g, '')            // ^Tag^ (Archidekt)
      .replace(/\s*\[[^\]]*\]/g, '')           // [Categoria] (Archidekt)
      .replace(/\s*\*[A-Z]+\*/g, '')           // *F* foil, *E* etched
      .replace(/\s+\([A-Za-z0-9]{2,6}\)(\s+[\w★-]+)?\s*$/, '') // (SET) 123
      .replace(/\s*\/\/\s*/g, ' // ')
      .trim();
    if (!name || count <= 0) { skipped.push(raw); continue; }
    seenCard = true;
    if (out || sb || tagged) { sideboard += count; continue; }
    const key = name.toLowerCase();
    const e = counts.get(key);
    if (e) e.count += count; else counts.set(key, { name, count });
  }
  return { main: [...counts.values()], sideboard, skipped };
}
