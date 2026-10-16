// Real-engine regression: node forge-bridge/scripts/test-searing-blaze.mjs ws://127.0.0.1:7172/ws
// Isolated Free-play fixtures; all sessions explicitly leave, and credentials are never printed.
import assert from 'node:assert/strict';

const endpoint = process.argv[2] || 'ws://127.0.0.1:7172/ws';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scenario(kind) {
  const ws = new WebSocket(endpoint);
  const actions = new Map();
  let state, failure, lastLandTurn = -1;
  const send = value => ws.send(JSON.stringify(value));
  const once = value => {
    const key = JSON.stringify(value);
    if (Date.now() - (actions.get(key) || 0) > 1700) {
      actions.set(key, Date.now());
      send(value);
    }
  };
  ws.addEventListener('message', ({data}) => {
    const message = JSON.parse(data);
    if (['error', 'validation-error'].includes(message.type)) failure = new Error(JSON.stringify(message));
    if (message.type === 'state') state = message;
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
  });
  const own = () => state?.players.find(player => player.id === state.you);
  const opponent = () => state?.players.find(player => player.id !== state.you);
  const priority = () => state?.input.priority && state.input.ok.enabled && !state.question;
  const blaze = () => own()?.hand.find(card => card.name === 'Searing Blaze');
  const lands = () => own()?.battlefield.filter(card => card.land && !card.tapped) || [];
  const diagnostic = () => ({kind, turn: state?.turn, phase: state?.phase,
    hand: own()?.hand.map(card => card.name), battlefield: own()?.battlefield.map(card => ({name: card.name, tapped: card.tapped})),
    opponentField: opponent()?.battlefield.map(card => card.name), input: state?.input, question: state?.question});

  async function until(test, label, advance = false, timeout = 40000) {
    const deadline = Date.now() + timeout;
    while (!test()) {
      if (failure) throw failure;
      if (Date.now() > deadline || state?.gameOver) throw new Error(`${label}: ${JSON.stringify(diagnostic())}`);
      if (advance && state) advanceSetup();
      await wait(60);
    }
  }

  function advanceSetup() {
    const input = state.input, question = state.question;
    if (question) {
      once(question.kind === 'confirm' ? {type: 'answer', id: question.id, value: true}
        : question.kind === 'text' ? {type: 'answer', id: question.id, text: question.initial || '0'}
          : {type: 'answer', id: question.id, indices: Array.from({length: question.kind === 'order' ? question.options.length : Math.max(0, question.min ?? 1)}, (_, i) => i)});
    } else if (['play-draw', 'mulligan'].includes(input.opening) && input.ok.enabled) {
      once({type: 'ok', gen: input.gen});
    } else if (input.paying && input.ok.enabled) {
      once({type: 'ok', gen: input.gen});
    } else if (priority()) {
      const land = own().hand.find(card => card.land && input.actionable.includes(card.id));
      const fiend = kind === 'self' && !own().battlefield.some(card => card.name === 'Kiln Fiend')
        ? own().hand.find(card => card.name === 'Kiln Fiend' && input.actionable.includes(card.id)) : null;
      if (state.activePlayer === state.you && state.phase === 'MAIN1' && land) {
        lastLandTurn = state.turn;
        once({type: 'card', id: land.id, gen: input.gen});
      }
      else if (fiend) once({type: 'card', id: fiend.id, gen: input.gen});
      else once({type: 'ok', gen: input.gen});
    } else if (input.ok.enabled) {
      once({type: 'ok', gen: input.gen});
    } else if (state.phase === 'CLEANUP' && input.selectable.length) {
      once({type: 'card', id: input.selectable[0], gen: input.gen});
    }
  }

  try {
    // Six Mountains + six Blazes guarantee both in the first seven and three lands by draw nine.
    const cards = [{name: 'Mountain', count: 6}, {name: 'Searing Blaze', count: 6}];
    if (kind === 'self') cards.push({name: 'Kiln Fiend', count: 6});
    // Bolt keeps a harmless explicit priority window open in the no-target fixture.
    if (kind === 'none') cards.push({name: 'Lightning Bolt', count: 6});
    send({type: 'start', config: {format: 'free', matchLength: 'bo1'},
      you: {name: `Searing Blaze ${kind}`, cards},
      opponent: {name: 'Target fixture', cards: kind === 'opponent'
        ? [{name: 'Forest', count: 6}, {name: 'Grizzly Bears', count: 6}]
        : [{name: 'Forest', count: 60}]}});

    await until(() => priority() && state.activePlayer === state.you && state.phase === 'MAIN1'
      && lands().length >= 3 && lastLandTurn === state.turn && blaze()
      && (kind !== 'self' || own().battlefield.some(card => card.name === 'Kiln Fiend'))
      && (kind !== 'opponent' || opponent().battlefield.some(card => card.creature)), 'three untapped Mountains and target fixture', true);
    const card = blaze();
    assert.equal(state.input.actionable.includes(card.id), kind !== 'none', `${kind}: incorrect availability`);

    if (kind === 'opponent') {
      assert.ok(state.input.actionable.length > 0);
      assert.ok(state.input.actionable.every(id => own().hand.some(item => item.id === id && item.name === 'Searing Blaze')),
        'Searing Blaze must be the only non-mana action');
      const turn = state.turn, gen = state.input.gen;
      // Send nothing: the engine must preserve this legal response instead of auto-passing.
      await wait(1800);
      assert.equal(state.turn, turn); assert.equal(state.input.gen, gen); assert.ok(priority());
      assert.ok(state.input.actionable.includes(card.id));
    }

    const originalMana = lands().length;
    send({type: 'card', id: card.id, gen: state.input.gen});
    await until(() => state.input.targeting?.source === card.id && state.input.selectablePlayers.length > 0, 'player target');
    const target = () => kind === 'self' ? own() : opponent();
    send({type: 'player', id: target().id, gen: state.input.gen});

    if (kind === 'none') {
      // Forge rolls back the tentative cast immediately when no second target exists.
      await until(() => own().hand.some(item => item.id === card.id) && !state.input.targeting, 'missing creature target restores uncastable spell');
      assert.equal(lands().length, originalMana, 'failed cast spent mana');
      assert.equal(target().life, 20);
      assert.ok(!state.input.actionable.includes(card.id));
      console.log('PASS no creatures: no highlight; incomplete cast rolls back with card and mana intact');
      return;
    }

    const creature = target().battlefield.find(item => item.creature);
    await until(() => state.input.selectable.includes(creature.id), 'dependent creature target');
    send({type: 'card', id: creature.id, gen: state.input.gen});
    const initialLife = target().life;
    await until(() => target().life < initialLife, 'damage resolution', true);
    await until(() => own().graveyard.some(item => item.id === card.id)
      && target().graveyard.some(item => item.id === creature.id), 'completed resolution and state-based creature death');
    assert.ok(own().graveyard.some(item => item.id === card.id));
    assert.ok(target().graveyard.some(item => item.id === creature.id));
    assert.equal(target().life, initialLife - 3, 'landfall damage');
    console.log(`PASS ${kind}: highlighted with three Mountains, legal targets, RR payment and three damage${kind === 'opponent' ? '; sole-action priority retained' : ''}`);
  } finally {
    if (ws.readyState === WebSocket.OPEN) { send({type: 'leave'}); await wait(200); }
    ws.close();
  }
}

await scenario('opponent');
await scenario('self');
await scenario('none');
