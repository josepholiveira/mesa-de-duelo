import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const load = async path => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const { stackPresentation } = await load('../src/ui/stackPresentation.ts');
const { PresentationTimeline } = await load('../src/ui/presentationTimeline.ts');
const card = { id: 21, name: 'Raging Goblin', creature: true, controller: 2 };
const spell = { id: 701, source: card, controller: 2, text: 'Raging Goblin', targets: {} };
const input = { gen: 44, priority: true, ok: { enabled: true }, cancel: { enabled: false }, actionable: [19], selectable: [] };
const state = { you: 1, stack: [], input, castable: [19], gameOver: false };
const frame = stack => ({ stack, players: [], turn: 2, phase: 'MAIN1', activePlayer: 2 });
const cast = { seq: 2, type: 'spell-cast', actor: 2, card, stackId: spell.id, frame: frame([spell]) };

test('a coalesced opponent cast remains visible until its recorded resolution, despite later own priority', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('game', []);
  const resolved = { ...cast, seq: 3, type: 'resolved', frame: frame([]) };
  timeline.ingest('game', [cast, resolved]);
  const before = structuredClone(state);
  assert.deepEqual(stackPresentation(state, timeline.advance().event), { stack: [spell], replaying: true });
  assert.deepEqual(stackPresentation(state, timeline.advance().event), { stack: [], replaying: false });
  assert.deepEqual(stackPresentation(state, timeline.advance()?.event), { stack: [], replaying: false });
  assert.deepEqual(state, before);
});

test('the exact authoritative stack supersedes playback immediately, preserving target IDs and generation', () => {
  const ability = { ...spell, id: 902, text: 'Ability from the same source' };
  const live = { ...state, stack: [ability], input: { ...input, gen: 45, selectableStacks: [902] } };
  const view = stackPresentation(live, cast);
  assert.equal(view.stack, live.stack);
  assert.equal(view.replaying, false);
  assert.equal(view.stack[0].id, 902);
  assert.deepEqual(live.input.selectableStacks, [902]);
  assert.equal(live.input.gen, 45);
});

test('targeting, costs, questions and other genuine decisions never show an obsolete stack', () => {
  const decisions = [
    { input: { targeting: { source: 19 } } }, { input: { paying: true } },
    { input: { selectable: [21] } }, { input: { selectableStacks: [701] } },
    { input: { selectablePlayers: [2] } }, { input: { selection: { cards: [], min: 1, max: 2 } } },
    { input: { blocking: {} } }, { input: { suspendCast: { card } } },
    { input: { opening: 'mulligan' } }, { input: { priority: false, ok: { enabled: true } } },
    { input: { priority: false, ok: { enabled: false }, actionable: [21] } },
    { question: { id: 1 } }, { sideboarding: { id: 1 } }, { gameOver: true },
  ];
  for (const patch of decisions) {
    const current = { ...state, ...patch, input: { ...input, ...patch.input } };
    assert.deepEqual(stackPresentation(current, cast), { stack: [], replaying: false });
  }
});

test('land and draw events never manufacture stack items; abilities retain their real instance identity', () => {
  for (const type of ['land-played', 'draw', 'entered']) {
    assert.deepEqual(stackPresentation(state, { seq: 2, type, card, frame: frame([]) }), { stack: [], replaying: false });
    assert.deepEqual(stackPresentation(state, { seq: 2, type, card }), { stack: [], replaying: false });
  }
  const abilities = [{ ...spell, id: 801 }, { ...spell, id: 802 }];
  assert.deepEqual(stackPresentation(state, { ...cast, type: 'ability-activated', frame: frame(abilities) }).stack.map(x => x.id), [801, 802]);
  assert.deepEqual(stackPresentation(state, { ...cast, type: 'countered', frame: frame([]) }).stack, []);
});

test('initial/reconnect catch-up cannot replay an already processed stack', () => {
  const timeline = new PresentationTimeline();
  timeline.ingest('game', [cast]);
  assert.equal(timeline.advance(), null);
  assert.deepEqual(stackPresentation(state, timeline.current?.event), { stack: [], replaying: false });
  timeline.ingest('game', [{ ...cast, seq: 3 }]);
  timeline.advance();
  timeline.ingest('game', [{ ...cast, seq: 4 }], { silent: true });
  assert.equal(timeline.current, null);
  assert.deepEqual(stackPresentation(state, timeline.current?.event), { stack: [], replaying: false });
});
