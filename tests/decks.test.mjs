import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

// The application uses Vite's extensionless TypeScript imports. Keep tests dependency-free on Node 24.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const decks = await import('../src/decks.ts');
const { applyDeckImport, deckImportSnapshot } = await import('../src/ui/deckImport.ts');
const { cardCopyLimit, copiesInDeck, validateDeckLocal } = await import('../src/ui/deckRules.ts');
const { deckStats, statsHTML } = await import('../src/ui/deckStats.ts');
const { legalityFresh } = await import('../src/scryfall.ts');
function storage(initial = {}, failWrites = false) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem(key, value) { if (failWrites) throw new Error('QuotaExceededError'); data.set(key, value); } };
}
const local = storage();
globalThis.localStorage = local;
function cache(name, values = {}) {
  const card = { name, layout: 'normal', type_line: 'Instant', mana_cost: '{R}', cmc: 1, legalities: { pauper: 'legal' }, fetchedAt: Date.now(), oracle_id: name, v: 3, ...values };
  local.setItem(`scry:v1:${name.toLowerCase()}`, JSON.stringify(card));
  return card;
}
const example = { id: 'personal-123', name: 'Meu deck', cards: [{ name: 'Lightning Bolt', count: 4 }], sideboard: [{ name: 'Duress', count: 2 }], format: 'pauper' };

test('v1 migration preserves IDs, unknown properties, originals, and sideboard', () => {
  const original = JSON.stringify([{ ...example, customField: 'preserve', builtin: true }]);
  const store = storage({ [decks.LEGACY_DECK_KEY]: original });
  const result = decks.readDeckLibrary(store);
  assert.equal(result.error, undefined);
  assert.equal(result.decks[0].id, example.id);
  assert.deepEqual(result.decks[0].sideboard, example.sideboard);
  assert.equal(result.decks[0].customField, 'preserve');
  assert.equal(result.decks[0].builtin, false);
  assert.equal(store.getItem(decks.LEGACY_DECK_KEY), original);
  assert.equal(store.getItem('mesa:decks:v1:backup'), original);
  assert.deepEqual(decks.readDeckLibrary(store).decks, result.decks);
});

test('migration retains malformed records and duplicate IDs for recovery', () => {
  const bad = { id: 'broken', name: 'Old deck', cards: [{ name: 'Forest', count: -1 }] };
  const duplicate = { ...example, name: 'Duplicate record' };
  const store = storage({ [decks.LEGACY_DECK_KEY]: JSON.stringify([example, bad, duplicate]) });
  const result = decks.readDeckLibrary(store);
  assert.equal(result.decks.length, 1);
  assert.deepEqual(result.recovery, [bad, duplicate]);
  assert.ok(result.error);
  assert.deepEqual(decks.readDeckLibrary(store).recovery, [bad, duplicate]);
});

test('corrupt and unknown version storage is preserved byte for byte', () => {
  for (const raw of ['{incomplete', '{"version":99,"decks":[]}']) {
    const store = storage({ [decks.DECK_STORAGE_KEY]: raw });
    const result = decks.readDeckLibrary(store);
    assert.ok(result.error);
    assert.deepEqual(result.recovery, [raw]);
    assert.equal(store.getItem(decks.DECK_STORAGE_KEY), raw);
    assert.equal(decks.writeDeckLibrary(store, [example], result.recovery).ok, true);
    assert.ok([...store.data.entries()].some(([key, value]) => key.startsWith('mesa:decks:recovery:') && value === raw));
    assert.deepEqual(decks.readDeckLibrary(store).recovery, [raw]);
  }
});

test('quota failures never claim a successful migration or save', () => {
  const original = JSON.stringify([example]);
  const store = storage({ [decks.LEGACY_DECK_KEY]: original }, true);
  const result = decks.readDeckLibrary(store);
  assert.equal(result.decks.length, 1);
  assert.ok(result.error);
  assert.equal(store.getItem(decks.LEGACY_DECK_KEY), original);
  assert.equal(store.getItem(decks.DECK_STORAGE_KEY), null);
  assert.equal(decks.writeDeckLibrary(store, [example]).ok, false);
});

test('Arena, MTGO, SB tags and set suffixes preserve main/sideboard separation', () => {
  const fixtures = [
    'Deck\n4 Lightning Bolt (M10) 146\n20 Mountain\n\nSideboard\n2 Duress',
    '4 Lightning Bolt\n20 Mountain\n\n2 Duress',
    '4x Lightning Bolt\n20 Mountain\nSB: 2 Duress',
    '4 Lightning Bolt\n20 Mountain\n2 Duress [Sideboard]',
  ];
  for (const text of fixtures) {
    const parsed = decks.parseDeckList(text);
    assert.equal(decks.countEntries(parsed.main), 24);
    assert.deepEqual(parsed.sideboard, [{ name: 'Duress', count: 2 }]);
    assert.deepEqual(parsed.skipped, []);
  }
});

test('export/import roundtrip keeps main, sideboard, split names and counts', () => {
  const deck = { ...example, cards: [...example.cards, { name: 'Fire // Ice', count: 2 }] };
  const parsed = decks.parseDeckList(decks.exportDeckList(deck));
  assert.deepEqual(parsed.main, deck.cards);
  assert.deepEqual(parsed.sideboard, deck.sideboard);
});

test('parser reports malformed counts and excluded sections rather than dropping silently', () => {
  const parsed = decks.parseDeckList('Deck\n0 Lightning Bolt\n-1 Forest\n1.5 Island\n9007199254740992 Swamp\n4 Mountain\nMaybeboard\n2 Duress\nCommander\n1 Atraxa, Praetors\' Voice');
  assert.equal(parsed.skipped.length, 4);
  assert.equal(parsed.ignored.length, 1);
  assert.deepEqual(parsed.commanders, [{ name: "Atraxa, Praetors' Voice", count: 1 }]);
  assert.deepEqual(parsed.main, [{ name: 'Mountain', count: 4 }]);
  assert.deepEqual(parsed.sideboard, []);
});

test('parser consolidates duplicates within their section without combining main and sideboard', () => {
  const parsed = decks.parseDeckList('Deck\n2 Lightning Bolt\n2 lightning bolt\nSideboard\n1 Lightning Bolt');
  assert.equal(parsed.main[0].count, 4);
  assert.equal(parsed.sideboard[0].count, 1);
});

test('Pauper counts main and sideboard separately and combines copy limits', () => {
  cache('Test Bolt');
  cache('Forest', { type_line: 'Basic Land — Forest', cmc: 0 });
  const invalid = { id: 'a', name: 'a', cards: [{ name: 'Forest', count: 56 }, { name: 'Test Bolt', count: 4 }], sideboard: [{ name: 'Test Bolt', count: 1 }], format: 'pauper' };
  assert.equal(copiesInDeck(invalid, 'Test Bolt'), 5);
  assert.ok(validateDeckLocal(invalid).issues.some(i => i.code === 'copies'));
  assert.ok(validateDeckLocal({ ...invalid, cards: [{ name: 'Forest', count: 59 }], sideboard: [{ name: 'Forest', count: 16 }] }).issues.some(i => i.code === 'main_count'));
  assert.ok(validateDeckLocal({ ...invalid, sideboard: [{ name: 'Forest', count: 16 }] }).issues.some(i => i.code === 'sideboard_count'));
  assert.equal(validateDeckLocal({ ...invalid, sideboard: [] }).status, 'valid');
});

test('canonical Oracle identity catches aliases across main and sideboard', () => {
  cache('Alias Front', { oracle_id: 'same-card', name: 'Canonical // Back' });
  cache('Canonical // Back', { oracle_id: 'same-card' });
  const result = validateDeckLocal({ ...example, cards: [{ name: 'Forest', count: 56 }, { name: 'Alias Front', count: 4 }], sideboard: [{ name: 'Canonical // Back', count: 1 }] });
  assert.ok(result.issues.some(i => i.code === 'copies'));
});

test('basic lands and explicit Oracle copy exceptions are respected', () => {
  assert.equal(cardCopyLimit('Snow-Covered Island', null), Infinity);
  assert.equal(cardCopyLimit('Wastes', null), Infinity);
  assert.equal(cardCopyLimit('Test Rats', cache('Test Rats', { oracle_text: 'A deck can have any number of cards named Test Rats.' })), Infinity);
  assert.equal(cardCopyLimit('Test Dwarves', cache('Test Dwarves', { oracle_text: 'A deck can have up to seven cards named Test Dwarves.' })), 7);
  assert.equal(cardCopyLimit('Test Bolt'), 4);
});

test('legality never treats missing or stale metadata as legal', () => {
  cache('Stale Legal', { fetchedAt: Date.now() - 25 * 60 * 60 * 1000 });
  cache('Banned Test', { legalities: { pauper: 'banned' } });
  for (const name of ['Never Cached', 'Stale Legal']) {
    const result = validateDeckLocal({ ...example, cards: [{ name: 'Forest', count: 56 }, { name, count: 4 }], sideboard: [] });
    assert.equal(result.status, 'unknown');
  }
  assert.equal(validateDeckLocal({ ...example, cards: [{ name: 'Forest', count: 56 }, { name: 'Banned Test', count: 4 }], sideboard: [] }).status, 'invalid');
  assert.equal(legalityFresh({ legalities: { pauper: 'legal' } }), false);
});

test('free play accepts legacy deck sizes but unresolved imports remain invalid', () => {
  const free = { ...example, format: 'free', cards: [{ name: 'Forest', count: 40 }], sideboard: [] };
  assert.equal(validateDeckLocal(free).status, 'valid');
  assert.equal(validateDeckLocal({ ...free, unresolved: ['Typo Card'] }).status, 'invalid');
  assert.equal(validateDeckLocal({ ...free, cards: [] }).status, 'invalid');
});

test('shared stats use authoritative mana value, exclude lands/sideboard and disclose missing data', () => {
  cache('Hybrid Test', { mana_cost: '{2/R}', cmc: 2 });
  cache('Creature Test', { type_line: 'Creature — Human', cmc: 3 });
  const deck = { ...example, cards: [{ name: 'Forest', count: 20 }, { name: 'Hybrid Test', count: 4 }, { name: 'Creature Test', count: 2 }, { name: 'Unknown Stats', count: 1 }], sideboard: [{ name: 'Test Bolt', count: 4 }] };
  const stats = deckStats(deck);
  assert.equal(stats.total, 27);
  assert.equal(stats.sideboard, 4);
  assert.equal(stats.unknown, 1);
  assert.equal(stats.lands, 20);
  assert.equal(stats.creatures, 2);
  assert.equal(stats.average, 14 / 6);
  assert.deepEqual(stats.curve, [0, 0, 4, 2, 0, 0, 0]);
  assert.match(statsHTML(deck), /estatísticas estão incompletas/);
});

test('Pauper ready decks contain 60 main, 15 sideboard and stay separate from legacy templates', () => {
  const pauper = decks.DEFAULT_DECKS.filter(d => d.format === 'pauper');
  assert.equal(pauper.length, 2);
  for (const deck of pauper) { assert.equal(decks.deckSize(deck), 60); assert.equal(decks.countEntries(deck.sideboard), 15); assert.equal(deck.builtin, true); }
  assert.equal(decks.DEFAULT_DECKS.filter(d => d.format === 'free').length, 14);
});


test('import into an empty deck keeps ID, name, format and unknown metadata', () => {
  const target = { ...example, name: 'Meu rascunho', cards: [], sideboard: [], sourceTemplateId: 'old-template', custom: { favorite: true } };
  const incoming = { ...example, id: 'new-id', name: 'Other name', format: 'free', importSource: '4 Lightning Bolt' };
  const result = applyDeckImport(target, incoming, 'replace');
  assert.equal(result.id, target.id); assert.equal(result.name, target.name); assert.equal(result.format, target.format);
  assert.equal(result.sourceTemplateId, 'old-template'); assert.deepEqual(result.custom, { favorite: true });
  assert.deepEqual(result.cards, incoming.cards); assert.deepEqual(result.sideboard, incoming.sideboard);
  assert.deepEqual(target.cards, []); assert.notEqual(result.cards, incoming.cards);
});

test('merge sums canonical copies independently in main and sideboard without mutating inputs', () => {
  const target = { ...example, cards: [{ name: 'Lightning Bolt', count: 2, oracleId: 'bolt' }], unresolved: ['Unknown Card'] };
  const incoming = { ...example, cards: [{ name: 'Raio', count: 2, oracleId: 'bolt' }, { name: 'Unknown Card', count: 1 }], sideboard: [{ name: 'duress', count: 1 }, { name: 'Lightning Bolt', count: 1 }], unresolved: ['Unknown Card'] };
  const before = JSON.stringify([target, incoming]);
  const result = applyDeckImport(target, incoming, 'merge');
  assert.equal(result.cards[0].count, 4); assert.equal(result.cards.length, 2);
  assert.deepEqual(result.sideboard.map(e => e.count), [3, 1]);
  assert.deepEqual(result.unresolved, ['Unknown Card']);
  assert.equal(JSON.stringify([target, incoming]), before);
});

test('replace updates both sections and retains original import sources for recovery', () => {
  const target = { ...example, unresolved: ['Old Typo'], importSource: 'original list', importHistory: ['earlier list'] };
  const incoming = { ...example, cards: [{ name: 'Mountain', count: 20 }], sideboard: [], unresolved: [], importSource: 'replacement list' };
  const result = applyDeckImport(target, incoming, 'replace');
  assert.deepEqual(result.cards, incoming.cards); assert.deepEqual(result.sideboard, []); assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.importHistory, ['earlier list', 'original list']); assert.equal(result.importSource, 'replacement list');
  assert.equal(target.sideboard.length, 1);
});

test('empty/malformed imports and overflowing merges leave the target intact', () => {
  const target = structuredClone(example), before = JSON.stringify(target);
  const malformed = decks.parseDeckList('Deck\n0 Lightning Bolt\n-2 Mountain');
  assert.throws(() => applyDeckImport(target, { ...example, cards: malformed.main, sideboard: [] }, 'replace'));
  assert.throws(() => applyDeckImport(target, { ...example, cards: [{ name: 'Lightning Bolt', count: Number.MAX_SAFE_INTEGER }] }, 'merge'));
  assert.throws(() => applyDeckImport(target, { ...example, cards: [{ name: 'Mountain', count: -1 }] }, 'replace'));
  assert.throws(() => applyDeckImport(target, example, null));
  assert.equal(JSON.stringify(target), before);
});

test('same-deck imports survive quota failures as recoverable in-memory edits', () => {
  const initial = JSON.stringify({ version: 2, decks: [example], recovery: [] });
  const store = storage({ [decks.DECK_STORAGE_KEY]: initial }, true);
  const result = applyDeckImport(example, { ...example, cards: [{ name: 'Mountain', count: 20 }], sideboard: [] }, 'replace');
  assert.equal(decks.writeDeckLibrary(store, [result]).ok, false);
  assert.equal(store.getItem(decks.DECK_STORAGE_KEY), initial);
  assert.equal(result.id, example.id); assert.equal(result.cards[0].count, 20);
});


test('fresh Create snapshots equal normalized storage; actual external changes are detected', () => {
  const fresh = { id: 'new', name: 'Novo deck', cards: [], sideboard: [], format: 'free', updatedAt: 'now' };
  const store = storage();
  assert.equal(decks.writeDeckLibrary(store, [fresh]).ok, true);
  const loaded = decks.readDeckLibrary(store).decks[0];
  assert.equal(loaded.builtin, false); assert.equal(fresh.builtin, undefined);
  assert.equal(deckImportSnapshot(fresh), deckImportSnapshot(loaded));
  assert.notEqual(deckImportSnapshot(fresh), deckImportSnapshot({ ...loaded, name: 'Changed elsewhere' }));
  assert.notEqual(deckImportSnapshot(fresh), deckImportSnapshot({ ...loaded, cards: [{ name: 'Forest', count: 1 }] }));
});


test('Commander imports, exports, merges, and storage preserve a separate command zone', () => {
  const commander = { ...example, format: 'commander', cards: [{ name: 'Forest', count: 99 }], sideboard: [], commanders: [{ name: 'Elvish Archdruid', count: 1 }] };
  const parsed = decks.parseDeckList(decks.exportDeckList(commander));
  assert.deepEqual(parsed.commanders, commander.commanders);
  assert.equal(decks.deckSize(commander), 99); assert.equal(decks.totalDeckSize(commander), 100);
  const target = { ...commander, commanders: [{ name: 'Old Commander', count: 1 }] };
  assert.deepEqual(applyDeckImport(target, commander, 'replace').commanders, commander.commanders);
  assert.equal(applyDeckImport(target, commander, 'merge').commanders.length, 2);
  assert.equal(target.commanders[0].name, 'Old Commander');
  const store = storage(); assert.equal(decks.writeDeckLibrary(store, [commander]).ok, true);
  assert.deepEqual(decks.readDeckLibrary(store).decks[0].commanders, commander.commanders);
});

test('Commander local rules enforce 100 total, singleton exceptions, identity including lands, and sideboard', () => {
  cache('Commander Test', { type_line: 'Legendary Creature — Elf', color_identity: ['G'], legalities: { commander: 'legal' } });
  cache('Commander Forest', { type_line: 'Basic Land — Forest', color_identity: ['G'], legalities: { commander: 'legal' } });
  cache('Commander Island', { type_line: 'Basic Land — Island', color_identity: ['U'], legalities: { commander: 'legal' } });
  cache('Commander Bolt', { color_identity: ['G'], legalities: { commander: 'legal' } });
  const d = { id: 'c', name: 'c', format: 'commander', commanders: [{ name: 'Commander Test', count: 1 }], cards: [{ name: 'Commander Forest', count: 99 }], sideboard: [] };
  assert.equal(validateDeckLocal(d).status, 'unknown'); // Partnerships/eligibility require the server.
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Commander Forest', count: 98 }] }).issues.some(i => i.code === 'total_count'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Commander Island', count: 99 }] }).issues.some(i => i.code === 'color_identity'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Commander Forest', count: 97 }, { name: 'Commander Bolt', count: 2 }] }).issues.some(i => i.code === 'copies'));
  assert.ok(validateDeckLocal({ ...d, sideboard: [{ name: 'Commander Forest', count: 1 }] }).issues.some(i => i.code === 'sideboard_count'));
  assert.equal(cardCopyLimit('Commander Bolt', undefined, 'commander'), 1);
  assert.equal(cardCopyLimit('Test Dwarves', cache('Test Dwarves', { oracle_text: 'A deck can have up to seven cards named Test Dwarves.' }), 'commander'), 7);
  for (const deck of decks.DEFAULT_DECKS.filter(d => d.format === 'commander')) assert.equal(decks.totalDeckSize(deck), 100);
  assert.equal(decks.DEFAULT_DECKS.filter(d => d.format === 'commander').length, 4);
});


test('Commander tags preserve command designation and do not infer a sideboard from blank lines', () => {
  for (const marker of ['*CMDR*', '[Commander]']) {
    for (const separator of ['\n', '\n\n']) {
      const parsed = decks.parseDeckList(`1 Marwyn, the Nurturer (DOM) 172 ${marker}${separator}99 Forest`);
      assert.deepEqual(parsed.commanders, [{ name: 'Marwyn, the Nurturer', count: 1 }]);
      assert.deepEqual(parsed.main, [{ name: 'Forest', count: 99 }]);
      assert.deepEqual(parsed.sideboard, []);
      assert.deepEqual(parsed.skipped, []);
      assert.deepEqual(parsed.ignored, []);
    }
  }
  const explicit = decks.parseDeckList('1 Marwyn, the Nurturer [Commander]\n\n99 Forest\nSB: 1 Island');
  assert.deepEqual(explicit.sideboard, [{ name: 'Island', count: 1 }]);
});
