import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchCards, cacheGet, fetchByNames } from '../src/scryfall.ts';

const cached = new Map();
globalThis.localStorage = { getItem: key => cached.get(key) ?? null, setItem: (key, value) => cached.set(key, value) };
const originalFetch = globalThis.fetch;
function apiCard(name, more = {}) {
  return { name, oracle_id: `oracle:${name}`, layout: 'normal', type_line: 'Instant', cmc: 1, mana_cost: '{R}', oracle_text: 'Deal 3 damage.', legalities: { pauper: 'legal' }, rarity: 'uncommon', lang: 'pt', image_status: 'highres_scan', ...more };
}

test('format search uses format legality rather than current printing rarity', async () => {
  let request;
  globalThis.fetch = async url => { request = new URL(url); return Response.json({ data: [apiCard('Search Test')], total_cards: 1, has_more: false }); };
  try {
    const result = await searchCards('lightning', 1, 'pauper');
    assert.equal(request.searchParams.get('q'), '(lightning) f:pauper');
    assert.equal(request.searchParams.get('include_multilingual'), 'true');
    assert.equal(result.cards[0].rarity, 'uncommon');
    assert.equal(result.cards[0].legalities.pauper, 'legal');
    assert.ok(result.cards[0].fetchedAt);
    assert.equal(cacheGet('Search Test').oracle_id, 'oracle:Search Test');
  } finally { globalThis.fetch = originalFetch; }
});

test('two-face rules and images survive slim cache and remain readable by either face', async () => {
  const card = apiCard('Front Test // Back Test', { layout: 'transform', oracle_text: undefined, mana_cost: undefined, card_faces: [
    { name: 'Front Test', mana_cost: '{2}{U}', oracle_text: 'Draw a card.', image_uris: { normal: 'https://example.test/front.png' } },
    { name: 'Back Test', mana_cost: '', oracle_text: 'Flying', image_uris: { normal: 'https://example.test/back.png' } },
  ] });
  globalThis.fetch = async () => Response.json({ data: [card] });
  try {
    await fetchByNames(['Front Test']);
    const front = cacheGet('Front Test'), back = cacheGet('Back Test');
    assert.match(front.oracle_text, /Draw a card/);
    assert.match(front.oracle_text, /Flying/);
    assert.equal(front.mana_cost, '{2}{U}');
    assert.equal(front.image_uris.normal, 'https://example.test/front.png');
    assert.equal(back.image_uris.normal, 'https://example.test/back.png');
    assert.equal(front.oracle_id, back.oracle_id);
  } finally { globalThis.fetch = originalFetch; }
});

test('cards remain available in memory when browser storage rejects writes', async () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  globalThis.fetch = async () => Response.json({ data: [apiCard('Memory Test')] });
  try {
    await fetchByNames(['Memory Test']);
    assert.equal(cacheGet('Memory Test').name, 'Memory Test');
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('malformed card cache falls back to retrieval instead of crashing a deck', () => {
  cached.set('scry:v1:corrupt test', JSON.stringify({ v: 3, name: 42 }));
  assert.equal(cacheGet('Corrupt Test'), null);
});
