import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AutoPassPreference, AUTO_PASS_KEY } from '../src/ui/autoPassPreference.ts';

function fixture(value, fail = false) {
  const data = new Map(value === undefined ? [] : [[AUTO_PASS_KEY, value]]);
  const sent = [];
  const preference = new AutoPassPreference(message => sent.push(message), {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (fail) throw Error('Storage blocked'); data.set(key, value); },
  });
  return { preference, sent, data };
}
const state = value => ({ autoPassNoActions: value });

test('old servers and invalid preference shapes never receive unsupported commands', () => {
  const { preference: p, sent } = fixture('false');
  for (const bad of [undefined, {}, state(null), state('true'), state(1)]) p.observe(bad, true);
  p.change(true);
  assert.equal(p.supported, false); assert.equal(p.value, false); assert.deepEqual(sent, []);
});

test('saved preference applies once after support; state echoes do not resend', () => {
  const { preference: p, sent } = fixture('false');
  p.observe(state(true), true);
  assert.equal(p.pending, false); assert.equal(p.value, false);
  for (let i = 0; i < 10; i++) p.observe(state(true), true);
  assert.equal(p.value, false); assert.equal(sent.length, 1);
  p.observe(state(false), true);
  assert.equal(p.pending, null);
  for (let i = 0; i < 10; i++) p.observe(state(false), true);
  assert.deepEqual(sent, [{ type: 'preferences', autoPassNoActions: false }]);
});

test('new browser adopts seat preference; invalid local storage does not override it', () => {
  for (const stored of [undefined, 'null', '0', 'invalid']) {
    const { preference: p, sent } = fixture(stored);
    p.observe(state(false), true);
    assert.equal(p.value, false); p.observe(state(false), true); assert.equal(p.pending, null);
    assert.deepEqual(sent, [{ type: 'preferences', autoPassNoActions: false }]);
  }
});

test('rapid changes persist latest choice and ignore queued earlier echoes', () => {
  const { preference: p, sent, data } = fixture();
  p.observe(state(true), true); p.observe(state(true), true);
  p.change(false); p.change(true);
  assert.deepEqual(sent.map(m => m.autoPassNoActions), [true, false]);
  p.observe(state(false), true);
  assert.equal(p.value, true); assert.equal(p.pending, true); assert.equal(data.get(AUTO_PASS_KEY), 'true');
  p.observe(state(true), true); assert.equal(p.pending, null);
  assert.deepEqual(sent.map(m => m.autoPassNoActions), [true, false, true]);
  p.change(true); assert.equal(sent.length, 3);
});

test('disconnect resets handshake and reapplies latest choice only after supported rejoin state', () => {
  const { preference: p, sent } = fixture('true');
  p.observe(state(true), true); p.observe(state(true), true); p.change(false);
  p.observe(state(true), false); p.change(true);
  assert.equal(p.supported, false); assert.equal(p.value, false);
  p.observe(undefined, true); assert.equal(sent.length, 2);
  p.observe(state(true), true); p.observe(state(false), true);
  assert.equal(sent.length, 3); assert.equal(sent[2].autoPassNoActions, false);
  assert.equal(p.pending, null);
  p.reset(); p.observe(state(false), true); p.observe(state(false), true);
  assert.equal(sent.length, 4); // Explicit attachment for another game/rematch.
});

test('authoritative updates synchronize after acknowledgement; storage failures keep session choice', () => {
  const { preference: p, sent } = fixture(undefined, true);
  p.observe(state(true), true); p.observe(state(true), true); p.change(false); p.observe(state(false), true);
  assert.equal(p.value, false);
  p.reset(); p.observe(state(true), true);
  assert.equal(p.value, false); assert.equal(sent.at(-1).autoPassNoActions, false);
  p.observe(state(false), true); p.observe(state(true), true);
  assert.equal(p.value, true); assert.equal(sent.length, 3);
});
