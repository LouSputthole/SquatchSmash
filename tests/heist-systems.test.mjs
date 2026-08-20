import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { CheckpointDirector } from '../src/heist/checkpoints.js';
import { CivilianController } from '../src/heist/civilians.js';
import { DIALOGUE_PRIORITY, DialogueArbiter } from '../src/heist/dialogue.js';
import { LootLedger, createHeistBags } from '../src/heist/loot.js';
import { HeistMissionMachine } from '../src/heist/mission.js';
import { AuthoredNavigationGraph, SquadDirector } from '../src/heist/navigation.js';
import { PoliceDirector } from '../src/heist/police.js';
import { intersectsDrivingObstacle } from '../src/heist/geometry.js';
import { HEIST_CHECKPOINT_STATE, HEIST_STATES, PREVIEW_START_STATE } from '../src/heist/config.js';
import { HEIST_ORDERS, objectiveForState } from '../src/heist/orders.js';
import { SNOW_CASUALTY_LADDER, dialogueLine } from '../src/heist/script.js';
import { CHARACTER_IDS } from '../src/core/campaign.js';

const HEIST_MAIN_SOURCE = await readFile(new URL('../src/heist/main.js', import.meta.url), 'utf8');

test('heist mission sequence rejects skips, records failure, and restores authored state', () => {
  const machine = new HeistMissionMachine();
  assert.equal(machine.state, 'SAFEHOUSE_ARRIVAL');
  assert.equal(machine.advance('BRIEFING'), false);
  assert.equal(machine.advance('CREW_INTRO'), true);
  assert.equal(machine.advance('BRIEFING', false), false);
  assert.equal(machine.fail('player_dead'), true);
  assert.equal(machine.state, 'FAILED');
  assert.equal(machine.failure.from, 'CREW_INTRO');
  machine.restore('BOARD_VAN');
  assert.equal(machine.state, 'BOARD_VAN');
  assert.equal(machine.failure, null);
});

test('checkpoint restore tears down every live subsystem before rebuilding snapshots', () => {
  const events = [];
  const values = { actors: ['snow'], effects: ['decal'] };
  const director = new CheckpointDirector();
  for (const id of ['actors', 'effects']) {
    director.register(id, {
      capture: () => values[id],
      reset: () => { events.push(`reset:${id}`); values[id] = []; },
      restore: (snapshot) => { events.push(`restore:${id}`); values[id] = snapshot; },
    });
  }
  director.capture('bank_secured');
  values.actors.push('stale_officer');
  values.effects.push('stale_casing');
  assert.equal(director.restore('bank_secured'), true);
  assert.deepEqual(events, [
    'reset:effects', 'reset:actors', 'restore:actors', 'restore:effects',
  ]);
  assert.deepEqual(values.actors, ['snow']);
  assert.deepEqual(values.effects, ['decal']);
});

test('cash bags remain physical, preserve carriers and derive the real recovered total', () => {
  const ledger = new LootLedger(createHeistBags());
  assert.equal(ledger.load('cash_1', 'escape_sedan'), false);
  assert.equal(ledger.carry('cash_1', 'prospect'), true);
  assert.equal(ledger.load('cash_1', 'escape_sedan'), true);
  assert.equal(ledger.carry('cash_2', 'numbskull'), true);
  assert.equal(ledger.drop('cash_2', { anchor: 'market_scaffold', position: { x: 2, z: 4 } }), true);
  assert.equal(ledger.abandon('cash_2'), true);
  assert.equal(ledger.carry('cash_3', 'deathmegatron'), true);
  assert.equal(ledger.load('cash_3', 'escape_sedan'), true);
  assert.equal(ledger.compromise('cash_3'), true);

  assert.deepEqual(ledger.summary(), {
    totalBags: 8,
    recoveredBags: 2,
    abandonedBags: 1,
    grossRecovered: 360_000,
    compromisedCash: 180_000,
  });
  const snapshot = ledger.capture();
  ledger.reset();
  ledger.restore(snapshot);
  assert.equal(ledger.get('cash_1').vehicle, 'escape_sedan');
  assert.throws(() => ledger.restore([
    { id: 'cash_1', carrier: 'snow', vehicle: 'van' },
  ]), /Invalid cash-bag checkpoint/);
});

test('authored squad graph selects alternate anchors and offscreen recovery positions', () => {
  const graph = new AuthoredNavigationGraph([
    { id: 'bank_a', zone: 'bank', roles: ['leader'], neighbors: ['street_a', 'street_b'] },
    { id: 'street_a', zone: 'street', roles: ['leader'], neighbors: ['bank_a', 'recover'] },
    { id: 'street_b', zone: 'street', roles: ['leader'], neighbors: ['bank_a', 'recover'] },
    { id: 'recover', zone: 'street', recovery: true, neighbors: ['street_a', 'street_b'] },
  ]);
  const snow = { id: 'snow', role: 'leader', anchor: 'bank_a' };
  const actors = new Map([['snow', snow]]);
  const squad = new SquadDirector({ graph, actors });
  graph.occupy('street_a', 'deathmegatron');
  assert.equal(squad.assign('snow', 'street'), true);
  assert.equal(snow.anchor, 'street_b');
  assert.deepEqual(squad.noteBlocked('snow', 3), {
    recover: true, anchor: 'recover', offscreenOnly: true,
  });
});

test('real movement clears intermittent blocked time before recovery can accumulate', () => {
  const graph = new AuthoredNavigationGraph([
    { id: 'start', zone: 'inside', neighbors: ['recover'] },
    { id: 'recover', zone: 'outside', recovery: true, neighbors: ['start'] },
  ]);
  const actors = new Map([['snow', { id: 'snow', role: 'leader', anchor: 'start' }]]);
  const squad = new SquadDirector({ graph, actors });

  /* Six ordinary waypoint pauses separated by real travel used to add up to
   * 3 s and send a moving actor backwards to the offscreen recovery anchor. */
  for (let waypoint = 0; waypoint < 6; waypoint += 1) {
    assert.deepEqual(squad.noteBlocked('snow', 0.5), { recover: false });
    squad.noteMoving('snow');
  }
  assert.deepEqual(squad.noteBlocked('snow', 0.5), { recover: false });
});

test('peer congestion clears obstruction time without disabling real blocked recovery', () => {
  const graph = new AuthoredNavigationGraph([
    { id: 'start', zone: 'inside', neighbors: ['recover'] },
    { id: 'recover', zone: 'outside', recovery: true, neighbors: ['start'] },
  ]);
  const actors = new Map([['snow', { id: 'snow', role: 'leader', anchor: 'start' }]]);
  const squad = new SquadDirector({ graph, actors });

  assert.deepEqual(squad.noteBlocked('snow', 2.4), { recover: false });
  squad.noteCongested('snow');
  assert.deepEqual(squad.noteBlocked('snow', 0.2), { recover: false },
    'traffic inherited a stale obstruction timer');
  assert.deepEqual(squad.noteBlocked('snow', 2.4), {
    recover: true, anchor: 'recover', offscreenOnly: true,
  }, 'a genuine obstruction stopped recovering after traffic cleared');
});

test('police wave budgets are finite and never choose a visible spawn gate', () => {
  const police = new PoliceDirector({
    bank_avenue: { budget: 3, gates: ['north', 'east'] },
  });
  assert.deepEqual(police.request('bank_avenue', {
    visibleGates: ['north'], count: 2,
  }), ['east', 'east']);
  assert.deepEqual(police.request('bank_avenue', {
    visibleGates: ['north'], count: 5,
  }), ['east']);
  assert.deepEqual(police.request('bank_avenue', { count: 1 }), []);
});

test('civilian compliance converges to grounded poses instead of random flight', () => {
  const civilian = new CivilianController({ id: 'teller_1', nerve: 0.3, anchor: 'teller' });
  const first = civilian.command({ aim: 1, distance: 3, groupControl: 0.8 });
  const second = civilian.command({ aim: 1, distance: 3, groupControl: 0.8 });
  assert.ok(['kneeling', 'prone'].includes(first));
  assert.equal(second, 'prone');
  assert.equal(civilian.anchor, 'teller');
});

test('tactical dialogue interrupts banter and stale queued commands are discarded', () => {
  const started = [];
  const dialogue = new DialogueArbiter({ onStart: (line) => started.push(line.id) });
  dialogue.setState('STREET_BLOCK_ONE');
  dialogue.push({ id: 'banter', priority: DIALOGUE_PRIORITY.BANTER });
  dialogue.push({
    id: 'old_warning', priority: DIALOGUE_PRIORITY.WARNING,
    states: ['STREET_BLOCK_ONE'], expiresAt: 10,
  });
  dialogue.push({
    id: 'move', priority: DIALOGUE_PRIORITY.TACTICAL,
    states: ['STREET_BLOCK_ONE'], expiresAt: 10,
  });
  assert.deepEqual(started, ['banter', 'old_warning', 'move']);
  dialogue.setState('STREET_BLOCK_TWO');
  assert.equal(dialogue.current, null);
  assert.deepEqual(dialogue.queue, []);
});

test('mission radio commands interrupt chatter and survive the next state transition', () => {
  const started = [];
  const dialogue = new DialogueArbiter({ onStart: (line) => started.push(line.id) });
  dialogue.setState('LOBBY_CONTROL');
  dialogue.push({
    id: 'hostage_bark', priority: DIALOGUE_PRIORITY.BARK,
    states: ['LOBBY_CONTROL'],
  });
  dialogue.pushCommand({
    id: 'lou_radio_lobby', priority: DIALOGUE_PRIORITY.OBJECTIVE,
    states: ['LOBBY_CONTROL'],
  });
  assert.deepEqual(started, ['hostage_bark', 'lou_radio_lobby']);
  assert.equal(dialogue.current?.id, 'lou_radio_lobby');
  assert.equal(dialogue.current?.interruptible, false);
  dialogue.setState('GUARDS_SECURED');
  assert.equal(dialogue.current?.id, 'lou_radio_lobby');
  dialogue.pushCommand({ id: 'lou_radio_vault', states: ['CASH_LOADING'] });
  dialogue.pushCommand({ id: 'lou_radio_street', states: ['EXIT_ORDER'] });
  assert.deepEqual(dialogue.queue.map((line) => line.id), [
    'lou_radio_vault', 'lou_radio_street',
  ]);
  dialogue.finish();
  dialogue.finish();
  assert.deepEqual(started, [
    'hostage_bark', 'lou_radio_lobby', 'lou_radio_vault', 'lou_radio_street',
  ]);
});

test('authored driving solids block buildings without closing the road corridor', () => {
  const obstacles = [{ x: 20, z: -30, w: 10, d: 18 }];
  assert.equal(intersectsDrivingObstacle(20, -30, obstacles), true);
  assert.equal(intersectsDrivingObstacle(0, -30, obstacles), false);
  assert.equal(intersectsDrivingObstacle(13.7, -30, obstacles), false);
});

/* ------------------------------------------------------------------ */
/* The standing order                                                  */
/* ------------------------------------------------------------------ */

test('every mission state the player can stand in has an authored objective', () => {
  const missing = HEIST_STATES.filter((state) => !(state in HEIST_ORDERS));
  assert.deepEqual(missing, [], `states with no order: ${missing.join(', ')}`);
});

test('the objective is a function of the state, not of what was pressed to get there', () => {
  /* The owner's bug: entering at a preview checkpoint ran the whole mission
   * under heist.html's static "Meet the crew." Every checkpoint the preview
   * and the save can start at must resolve to its own phase's instruction
   * without anything having been pressed. */
  const entryStates = [
    ...Object.values(PREVIEW_START_STATE),
    ...Object.values(HEIST_CHECKPOINT_STATE),
  ];
  const opening = objectiveForState('SAFEHOUSE_ARRIVAL');
  for (const state of entryStates) {
    const text = objectiveForState(state);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 12, `${state} order is too short to be an instruction: ${text}`);
    if (state !== 'SAFEHOUSE_ARRIVAL') {
      assert.notEqual(text, opening, `${state} still shows the opening objective`);
    }
  }
});

test('objectives that carry a sub-step read it from the context, not from a state', () => {
  // The debrief's four numbered actions all happen inside DEBRIEF.
  assert.match(objectiveForState('DEBRIEF', { weaponsDown: false }), /^3\/4/);
  assert.match(objectiveForState('DEBRIEF', { weaponsDown: true }), /^4\/4/);
  // Fetching a bag and carrying one are different instructions in CASH_LOADING.
  assert.match(objectiveForState('CASH_LOADING', { bankBagsStaged: 1 }), /1\/2 staged/);
  assert.match(objectiveForState('CASH_LOADING', { carryingBag: 'cash_3' }), /Carry the bag/);
  // A contact counts down the officers still up.
  assert.match(objectiveForState('STREET_BLOCK_ONE', { officersDown: 0 }), /0\/2 officers down/);
  assert.match(objectiveForState('STREET_BLOCK_ONE', { officersDown: 2 }), /Reach Rippin/);
  assert.match(objectiveForState('GARAGE_HOLD', { officersDown: 2 }), /Load the cash/);
});

test('an unknown state falls back to an instruction rather than leaving a stale one', () => {
  assert.equal(objectiveForState('NOT_A_STATE'), objectiveForState('SAFEHOUSE_ARRIVAL'));
  assert.equal(objectiveForState(undefined), objectiveForState('SAFEHOUSE_ARRIVAL'));
});

test('Snow escalates over the bodies instead of repeating one line', () => {
  /* Owner: *"SNow repeats the line that is a customer that is the one thing
   * we dont do. Lets get some more variations of this for the first few you
   * kill and if you kill 4+ he says okay we are commited now. Do them all."*
   *
   * `main.js` called `say('snow_casualty')` on every civilian death: one
   * line, no cooldown, no count, for the first body and the eleventh. */
  const rungs = Object.entries(SNOW_CASUALTY_LADDER);
  assert.ok(rungs.length >= 5, 'the casualty ladder has no rungs');
  const seen = new Set();
  for (const [rung, ids] of rungs) {
    assert.ok(ids.length >= 1, `${rung} is empty`);
    for (const id of ids) {
      const entry = dialogueLine(id);
      assert.ok(entry, `${id} is on the ladder with nothing written for it`);
      assert.equal(entry.speakerId, CHARACTER_IDS.SNOW, `${id} is not Snow`);
      assert.ok(entry.text.length > 20, `${id} is too short to be a line`);
      assert.ok(!seen.has(entry.text), `two rungs say the same thing: ${entry.text}`);
      seen.add(entry.text);
      // It has to be sayable in the room it fires in.
      assert.ok(entry.states.includes('LOBBY_CONTROL'), `${id} cannot be said in the lobby`);
    }
  }
  // The first three rungs are a bank each, the commitment beat is one line.
  for (const rung of ['first', 'second', 'third']) {
    assert.ok(SNOW_CASUALTY_LADDER[rung].length >= 3,
      `${rung} has only ${SNOW_CASUALTY_LADDER[rung].length} variant(s)`);
  }
  assert.equal(SNOW_CASUALTY_LADDER.committed.length, 1,
    'the commitment beat is not a beat if it is one of several');
  assert.match(dialogueLine(SNOW_CASUALTY_LADDER.committed[0]).text, /committed/i);

  // And the runtime drives it off the count rather than saying one thing.
  assert.doesNotMatch(HEIST_MAIN_SOURCE, /^\s*say\('snow_casualty'\);$/m,
    'main.js still fires the single unrationed casualty line');
  assert.match(HEIST_MAIN_SOURCE, /const COMMITTED_CASUALTIES = 4;/,
    'the fourth body is no longer the hinge');
});

test('four dead customers turns the job into clearing the room', () => {
  /* Owner: *"one of the objectives turns to make sure there are no witnesses
   * and you have to whack all the customers."* */
  const BANK_STATES = ['LOBBY_CONTROL', 'GUARDS_SECURED', 'MANAGER_ESCORT',
    'VAULT_BYPASS', 'CASH_LOADING', 'ALARM_DISCOVERED', 'EXIT_ORDER'];

  // Off, the orders are unchanged.
  for (const state of BANK_STATES) {
    const normal = objectiveForState(state, { noWitnesses: false, witnessesLeft: 9 });
    assert.doesNotMatch(normal, /No witnesses/,
      `${state} announced a sweep nobody started`);
  }

  // On, it replaces the standing order and it counts down.
  for (const state of BANK_STATES) {
    const order = objectiveForState(state, { noWitnesses: true, witnessesLeft: 9 });
    assert.match(order, /^No witnesses\. 9 customers still standing/, `${state}: ${order}`);
  }
  assert.match(objectiveForState('CASH_LOADING', { noWitnesses: true, witnessesLeft: 1 }),
    /1 customer still standing/, 'the last one is not "1 customers"');
  assert.match(objectiveForState('CASH_LOADING', { noWitnesses: true, witnessesLeft: 0 }),
    /Lobby is clear/);

  // It is only ever about the room: the street and the getaway are unchanged.
  for (const state of ['STREET_BLOCK_ONE', 'GARAGE_HOLD', 'CITY_PURSUIT', 'DEBRIEF']) {
    assert.doesNotMatch(objectiveForState(state, { noWitnesses: true, witnessesLeft: 4 }),
      /No witnesses/, `${state} is not the lobby`);
  }

  // And the doors are a consequence, not a caption.
  assert.match(HEIST_MAIN_SOURCE, /if \(noWitnesses && witnessesRemaining\(\) > 0\)/,
    'the crew can still walk out of a lobby that can describe them');
  assert.match(HEIST_MAIN_SOURCE, /noWitnesses = false;/, 'the sweep latch never resets');
  assert.match(HEIST_MAIN_SOURCE, /noWitnesses = snapshot\.noWitnesses === true;/,
    'a checkpoint restore forgets the sweep');
});
