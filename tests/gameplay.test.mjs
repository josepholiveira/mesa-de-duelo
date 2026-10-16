import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';

async function sourceModule(path) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace('import.meta.env.BASE_URL', "'/'");
  const result = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString('base64')}`);
}
const { PresentationTimeline, hasLiveDecision, stateWithFrame, presentationDuration } = await sourceModule('../src/ui/presentationTimeline.ts');
const { canDragHandCard, handDropAction } = await sourceModule('../src/ui/handDrag.ts');
const { createMotion } = await sourceModule('../src/ui/motion.ts');
const { AudioEventGate, normalizeAudioSettings, soundForEvent, soundVariation, SOUND_FILES, createGameAudio } = await sourceModule('../src/ui/audio.ts');
const event = (seq, type = 'spell-cast', extra = {}) => ({ seq, type, ...extra });
function state() {
  return { type: 'state', you: 1, turn: 3, phase: 'MAIN1', activePlayer: 2, gameOver: false,
    players: [{ id: 1, name: 'Você', life: 20, battlefield: [], hand: [{ id: 90, name: 'Private card' }] }, { id: 2, name: 'Oponente', life: 17, battlefield: [], hand: [] }],
    stack: [], combat: [], input: { gen: 42, message: '', ok: { enabled: false, label: '' }, cancel: { enabled: false, label: '' }, selectable: [], actionable: [] } };
}
const frame = { turn: 2, phase: 'COMBAT_DAMAGE', activePlayer: 2, stack: [{ id: 8 }], combat: [],
  players: [{ id: 1, life: 18, battlefield: [{ id: 7, name: 'Older public card' }], handCount: 6, library: 40 }, { id: 2, life: 20, battlefield: [], handCount: 4, library: 43 }] };

test('initial history is silent; new events are immutable, ordered and exactly once', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('match-1', [event(1), event(2)], { cursor: 2 });
  assert.equal(timeline.queued, 0);
  const live = event(4, 'land-played', { card: { id: 8, name: 'Forest' }, frame: structuredClone(frame) });
  timeline.ingest('match-1', [live, event(3), live]);
  live.card.name = 'Changed'; live.frame.players[0].life = 99;
  assert.equal(timeline.advance().event.seq, 3);
  const next = timeline.advance();
  assert.equal(next.event.card.name, 'Forest');
  assert.equal(next.event.frame.players[0].life, 18);
  assert.equal(next.audible, true);
  timeline.ingest('match-1', [event(2), event(4)], { cursor: 3 });
  assert.equal(timeline.cursor, 4); assert.equal(timeline.queued, 0);
  assert.equal(timeline.history.length, 4);
});

test('new match and silent reconnection seed history without replaying it', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('a', []);
  timeline.ingest('a', [event(1)]);
  assert.equal(timeline.queued, 1);
  timeline.ingest('a', [event(2)], { silent: true });
  assert.equal(timeline.current, null); assert.equal(timeline.queued, 0);
  timeline.ingest('a', [event(1), event(2)]);
  assert.equal(timeline.queued, 0);
  timeline.ingest('b', [event(1)]);
  assert.equal(timeline.cursor, 1); assert.equal(timeline.history.length, 1); assert.equal(timeline.queued, 0);
});

test('backlog catches up with bounded silent presentation, retaining meaningful history', () => {
  const timeline = new PresentationTimeline(); timeline.ingest('a', []);
  timeline.ingest('a', Array.from({ length: 25 }, (_, i) => event(i + 1)));
  assert.equal(timeline.queued, 4); assert.equal(timeline.history.length, 25);
  let entry; const ids = [];
  while ((entry = timeline.advance())) { ids.push(entry.event.seq); assert.equal(entry.audible, false); }
  assert.deepEqual(ids, [22, 23, 24, 25]);
  timeline.ingest('a', Array.from({ length: 100 }, (_, i) => event(i + 26)), { silent: true });
  assert.equal(timeline.history.length, 60); assert.equal(timeline.queued, 0);
});

test('draw and priority events advance cursor without filling stack/history presentation', () => {
  const timeline = new PresentationTimeline(); timeline.ingest('a', []);
  timeline.ingest('a', [event(1, 'draw'), event(2, 'priority'), event(3, 'damage')], { cursor: 8 });
  assert.equal(timeline.cursor, 8); assert.deepEqual(timeline.history.map(e => e.type), ['damage']);
  const draw = timeline.advance();
  assert.equal(draw.event.type, 'draw'); assert.equal(draw.audioOnly, true); assert.equal(draw.audible, true);
  assert.equal(timeline.advance().event.type, 'damage');
  timeline.ingest('a', [event(9, 'draw')], { silent: true });
  assert.equal(timeline.queued, 0);
  timeline.ingest('a', [event(9, 'draw')]);
  assert.equal(timeline.queued, 0, 'silent draw must not replay after catch-up');
});

test('a cast followed by fourteen draws and resolution preserves the full visual sequence', () => {
  const timeline = new PresentationTimeline(); timeline.ingest('a', []);
  timeline.ingest('a', [event(1), ...Array.from({ length: 14 }, (_, i) => event(i + 2, 'draw', { actor: i < 7 ? 1 : 2 })), event(16, 'resolved')]);
  const entries = []; let entry;
  while ((entry = timeline.advance())) entries.push(entry);
  assert.deepEqual(entries.map(e => e.event.seq), [1, 8, 15, 16]);
  assert.ok(entries.every(e => e.audible), 'draws must not force silent visual catch-up');
  assert.deepEqual(entries.filter(e => !e.audioOnly).map(e => e.event.type), ['spell-cast', 'resolved']);
  assert.deepEqual(timeline.history.map(e => e.type), ['spell-cast', 'resolved']);
  timeline.ingest('a', [event(15, 'draw', { actor: 2 })]);
  assert.equal(timeline.queued, 0, 'coalesced draws remain consumed');
});

test('draw audio has a separate bound and never evicts pending visual actions', () => {
  const timeline = new PresentationTimeline(); timeline.ingest('a', []);
  timeline.ingest('a', [event(1), ...Array.from({ length: 100 }, (_, i) => event(i + 2, 'draw', { actor: i % 2 + 1 })), event(102, 'resolved')]);
  assert.equal(timeline.queued, 6);
  const entries = []; let entry;
  while ((entry = timeline.advance())) entries.push(entry);
  assert.deepEqual(entries.map(e => e.event.seq), [1, 98, 99, 100, 101, 102]);
  assert.equal(entries.filter(e => e.audioOnly).length, 4);
  assert.ok(entries.every(e => e.audible));
  timeline.ingest('a', [...Array.from({ length: 13 }, (_, i) => event(i + 103)), event(116, 'draw')]);
  assert.equal(timeline.queued, 4);
  while ((entry = timeline.advance())) {
    assert.equal(entry.audioOnly, undefined, 'visual catch-up drops incidental audio');
    assert.equal(entry.audible, false);
  }
});

test('one played land presents once across coalesced and split packets; ramp entries remain', () => {
  const entered = event(1, 'entered', { sourceId: 7, from: 'Hand', to: 'Battlefield' });
  const played = event(2, 'land-played', { card: { id: 7 } });
  for (const split of [false, true]) {
    const timeline = new PresentationTimeline(); timeline.ingest('a', []);
    if (split) { timeline.ingest('a', [entered]); timeline.ingest('a', [played]); }
    else timeline.ingest('a', [entered, played]);
    assert.equal(timeline.queued, 1); assert.equal(timeline.advance().event.type, 'land-played');
    assert.deepEqual(timeline.history.map(e => e.type), ['land-played']);
  }
  const timeline = new PresentationTimeline(); timeline.ingest('a', []);
  timeline.ingest('a', [entered]); timeline.advance(); timeline.ingest('a', [played]);
  assert.equal(timeline.queued, 0);
  timeline.ingest('a', [event(3, 'entered', { sourceId: 7, from: 'Library', to: 'Battlefield' })]);
  assert.equal(timeline.queued, 1); assert.equal(timeline.advance().event.from, 'Library');
});

test('presentation frames preserve private hand and cannot mutate authoritative state', () => {
  const authoritative = state(), before = structuredClone(authoritative);
  const visual = stateWithFrame(authoritative, frame);
  assert.equal(hasLiveDecision(authoritative), false);
  assert.equal(visual.players[0].life, 18);
  assert.equal(visual.players[0].hand, authoritative.players[0].hand);
  assert.equal(visual.input.gen, -1);
  assert.deepEqual(visual.input.selectable, []);
  assert.deepEqual(authoritative, before);
});

test('every genuine choice bypasses old frames, preserving current generation and legal controls', () => {
  const variants = [
    s => { s.input.ok.enabled = true; }, s => { s.input.cancel.enabled = true; },
    s => { s.input.selectable = [7]; }, s => { s.input.actionable = [8]; },
    s => { s.input.selectableStacks = [11]; }, s => { s.input.selectablePlayers = [2]; },
    s => { s.input.targeting = { source: 7, players: [2] }; },
    s => { s.input.paying = true; }, s => { s.castable = [9]; },
    s => { s.question = { id: 4, kind: 'confirm' }; }, s => { s.sideboarding = { id: 5 }; },
    s => { s.gameOver = true; },
  ];
  for (const change of variants) {
    const authoritative = state(); change(authoritative);
    assert.equal(hasLiveDecision(authoritative), true);
    assert.equal(stateWithFrame(authoritative, frame), authoritative);
    assert.equal(authoritative.input.gen, 42);
  }
});

test('fast presentation remains visible and never introduces extra engine input', () => {
  for (const type of ['land-played', 'spell-cast', 'entered', 'resolved', 'damage', 'turn']) {
    assert.ok(presentationDuration(event(1, type), true) >= 200);
    assert.ok(presentationDuration(event(1, type), true) < presentationDuration(event(1, type), false));
  }
});

test('damage to player gets its own sound, while life payment and creature damage stay distinct', () => {
  assert.equal(soundForEvent(event(1, 'damage', { delta: -3, targets: { players: [1] } })), 'player-hit');
  assert.equal(soundForEvent(event(2, 'damage', { delta: -3, targets: { cards: [10] } })), 'impact');
  assert.equal(soundForEvent(event(3, 'life-changed', { actor: 1, delta: -3 })), null);
  assert.equal(soundForEvent(event(4, 'entered', { card: { keywords: ['FLYING'] } })), 'wing');
});

test('semantic actions and the two turn owners have distinct recognizable cues', () => {
  const mappings = {
    draw: 'draw', 'land-played': 'land', 'spell-cast': 'cast', 'ability-activated': 'ability',
    resolved: 'resolved', countered: 'countered', attackers: 'attack', blockers: 'block',
  };
  for (const [type, cue] of Object.entries(mappings)) assert.equal(soundForEvent(event(1, type), 1), cue);
  assert.equal(new Set(Object.values(mappings)).size, Object.keys(mappings).length);
  assert.equal(soundForEvent(event(1, 'turn', { actor: 1 }), 1), 'turn-self');
  assert.equal(soundForEvent(event(2, 'turn', { actor: 2 }), 1), 'turn-opponent');
  assert.equal(soundForEvent(event(3, 'turn', { frame: { activePlayer: 2 } }), 1), 'turn-opponent');
  assert.equal(soundForEvent(event(4, 'turn'), 1), null, 'unknown owner must not announce your turn');
  assert.notEqual(SOUND_FILES['turn-self'], SOUND_FILES['turn-opponent']);
});

test('per-action variation is gentle, deterministic and preserves cue identity', () => {
  const first = soundVariation(event(1, 'spell-cast', { actor: 1 }), 'a', 1);
  assert.deepEqual(soundVariation(event(1, 'spell-cast', { actor: 1 }), 'a', 1), first);
  assert.notDeepEqual(soundVariation(event(2, 'spell-cast', { actor: 1 }), 'a', 1), first);
  const rates = new Set();
  for (let seq = 1; seq <= 100; seq++) {
    const variation = soundVariation(event(seq, 'spell-cast', { actor: seq % 2 + 1 }), 'a', 1);
    assert.ok(variation.rate >= .95 && variation.rate <= 1.04);
    assert.ok(variation.gain >= .9 && variation.gain <= 1.05);
    assert.ok(Math.abs(variation.pan) <= .12);
    rates.add(variation.rate);
  }
  assert.ok(rates.size > 90);
});

test('sound gate consumes muted, hidden, locked and catch-up events without replay', () => {
  const base = { muted: false, volume: .3, unlocked: true, visible: true, audible: true };
  for (const patch of [{ muted: true }, { volume: 0 }, { unlocked: false }, { visible: false }, { audible: false }]) {
    const gate = new AudioEventGate();
    assert.equal(gate.allow('a:1', { ...base, ...patch }), false);
    assert.equal(gate.allow('a:1', base), false);
    assert.equal(gate.allow('a:2', base), true);
  }
  assert.deepEqual(normalizeAudioSettings(null), { muted: true, volume: .35 });
  assert.equal(normalizeAudioSettings({ muted: false, volume: 99 }).volume, 1);
  assert.equal(normalizeAudioSettings({ volume: NaN }).volume, .35);
});

test('audio is gesture gated, persisted, capped at four voices and stopped when hidden', async () => {
  const listeners = new Map(), stored = new Map(), sources = [];
  let contexts = 0, fetches = 0;
  globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  globalThis.document = { hidden: false, addEventListener: (name, cb) => listeners.set(name, cb) };
  globalThis.fetch = async () => { fetches++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
  globalThis.AudioContext = class {
    constructor() { contexts++; this.state = 'suspended'; this.currentTime = 0; }
    async resume() { this.state = 'running'; }
    createGain() { return { gain: { value: 0, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
    async decodeAudioData(data) { return data; }
    createBufferSource() {
      const source = { started: false, stopped: false, playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(source); return source;
    }
  };
  const audio = createGameAudio();
  assert.equal(contexts, 0); assert.equal(fetches, 0);
  listeners.get('pointerdown')({ isTrusted: false });
  assert.equal(contexts, 0);
  listeners.get('pointerdown')({ isTrusted: true });
  await Promise.resolve(); assert.equal(contexts, 1); assert.equal(fetches, 0);
  audio.setMuted(false);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(fetches, Object.keys(SOUND_FILES).length); assert.equal(sources.length, 0);
  for (let i = 1; i <= 6; i++) audio.play(event(i, 'damage', { targets: { players: [1] }, delta: -2 }), 'a', true);
  assert.equal(sources.filter(s => s.started && !s.stopped).length, 4);
  assert.equal(new Set(sources.map(source => source.playbackRate.value)).size, 6);
  audio.play(event(6, 'damage', { targets: { players: [1] } }), 'a', true);
  assert.equal(sources.length, 6);
  audio.setVolume(2); assert.equal(audio.settings.volume, 1);
  assert.equal(JSON.parse(stored.get('mesa:audio:v1')).muted, false);
  document.hidden = true; listeners.get('visibilitychange')();
  assert.equal(sources.filter(s => !s.stopped).length, 0);
  audio.play(event(7, 'spell-cast'), 'a', true);
  document.hidden = false; audio.play(event(7, 'spell-cast'), 'a', true);
  assert.equal(sources.length, 6);
  audio.setMuted(true);
  assert.equal(JSON.parse(stored.get('mesa:audio:v1')).muted, true);
});

test('all shipped sound assets are short stereo PCM without clipping', async () => {
  const hashes = new Set();
  for (const name of Object.values(SOUND_FILES)) {
    const wav = await readFile(new URL(`../public/audio/${name}`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt16LE(22), 2); assert.equal(wav.readUInt32LE(24), 44100); assert.equal(wav.readUInt16LE(34), 16);
    assert.ok((wav.length - 44) / (44100 * 4) <= 1.1);
    for (let i = 44; i < wav.length; i += 2) assert.ok(Math.abs(wav.readInt16LE(i)) < 32767);
    hashes.add(createHash('sha256').update(wav).digest('hex'));
  }
  assert.equal(hashes.size, Object.values(SOUND_FILES).length, 'semantic cues must not reuse the same waveform');
});

function motionFixture(reduce = false) {
  const animated = [], nodes = [];
  class Element {
    constructor(rect = { left: 0, top: 0, width: 80, height: 112 }) { this.rect = rect; this.style = {}; this.children = []; this.classes = new Set(); this.classList = { add: c => this.classes.add(c), remove: (...cs) => cs.forEach(c => this.classes.delete(c)) }; }
    getBoundingClientRect() { return this.rect; }
    setAttribute() {}
    append(child) { this.children.push(child); }
    remove() { this.removed = true; }
    animate(frames, options) { animated.push({ element: this, frames, options }); return { cancel() { this.oncancel?.(); } }; }
    closest() { return null; }
    querySelector(selector) { return selector === '.life' ? this.life : null; }
  }
  const arena = new Element({ left: 0, top: 0, width: 1280, height: 800 });
  const land = new Element({ left: 420, top: 200, width: 70, height: 98 });
  const avatar = new Element(); avatar.life = new Element({ left: 40, top: 700, width: 42, height: 42 });
  globalThis.window = { matchMedia: () => ({ matches: reduce }) };
  globalThis.document = { hidden: false, createElement: () => { const el = new Element(); nodes.push(el); return el; } };
  const root = { hidden: false, firstElementChild: arena, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 0 }),
    querySelector: selector => selector === '.field [data-fid="7"]' ? land : selector === '.avatar[data-pid="1"]' ? avatar : null,
    querySelectorAll: () => [] };
  return { motion: createMotion(root), arena, land, avatar, animated, nodes };
}

test('card travel uses fixed arena bounds and restores the actual card on cancellation', () => {
  const f = motionFixture();
  f.motion.present(event(1, 'land-played', { card: { id: 7 }, actor: 2 }), { you: 1, html: '<div class="face"></div>', label: 'Terreno', duration: 540, hideDestination: true });
  const piece = f.nodes.find(n => n.className === 'presentation-piece');
  assert.ok(piece.style.cssText.includes('width:112px'));
  assert.ok(piece.style.cssText.includes('height:156px'));
  assert.equal(f.land.style.opacity, '0');
  assert.equal(f.animated.length, 1);
  f.motion.cancelPresentation();
  assert.equal(f.land.style.opacity, ''); assert.equal(piece.removed, true);
});

test('reduced motion retains static player-damage marker; life loss creates no damage effect', () => {
  const f = motionFixture(true);
  f.motion.present(event(1, 'life-changed', { actor: 1, delta: -2 }), { you: 1, label: 'Vida', duration: 340 });
  assert.equal(f.nodes.length, 0);
  f.motion.present(event(2, 'damage', { targets: { players: [1] }, delta: -3 }), { you: 1, label: 'Dano', duration: 540 });
  assert.equal(f.nodes.find(n => n.className === 'player-damage').textContent, '−3');
  assert.equal(f.avatar.classes.has('damage-flash'), true);
  assert.equal(f.animated.length, 0);
  f.motion.reset();
});


test('hand dragging preserves click intent, only drops onto field, and rechecks current permission', () => {
  const live = state(); live.input.actionable = [90]; live.input.priority = true; live.input.ok.enabled = true;
  const intent = { id: 90, gen: 42, x: 100, y: 600 };
  const board = { left: 0, right: 1000, top: 100, bottom: 500 };
  assert.equal(canDragHandCard(live, 90, 42), true);
  assert.deepEqual(handDropAction(live, intent, 200, 300, board), { type: 'card', id: 90, gen: 42 });
  assert.equal(handDropAction(live, intent, 103, 601, { ...board, bottom: 700 }), null);
  assert.equal(handDropAction(live, intent, 200, 600, board), null);
  assert.equal(handDropAction(live, intent, 200, 300, null), null);
  live.input.gen = 43; assert.equal(handDropAction(live, intent, 200, 300, board), null);
  live.input.gen = 42; live.input.actionable = []; assert.equal(handDropAction(live, intent, 200, 300, board), null);
  live.input.actionable = [90]; live.question = { id: 4, kind: 'select' }; assert.equal(canDragHandCard(live, 90, 42), false);
  delete live.question; live.input.targeting = { source: 90 }; assert.equal(canDragHandCard(live, 90, 42), false);
  delete live.input.targeting; live.input.priority = false; assert.equal(canDragHandCard(live, 90, 42), false);
  live.input.priority = true; live.input.paying = true; assert.equal(canDragHandCard(live, 90, 42), false);
});
