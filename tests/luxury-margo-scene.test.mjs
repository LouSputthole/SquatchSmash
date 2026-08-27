import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LUXURY_MARGO_ENTRY_PATH,
  LUXURY_MARGO_EXIT_PATH,
  createLuxuryMargoScene,
  luxuryMargoCueNames,
  sampleLuxuryMargoPath,
} from '../src/luxury-apartment/margo-scene.js';
import {
  BIG_NIGHT_MARGO_WAKE,
  SILVER_ROOM_COME_HOME,
  SILVER_ROOM_DRESS_ASK,
} from '../src/core/apartment-story.js';
import { CAMPAIGN_SPINE } from '../src/core/campaign-spine.js';

function vector() {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; },
  };
}

function rotation() {
  return {
    x: 0, y: 0, z: 0,
    set(x, y, z) { this.x = x; this.y = y; this.z = z; },
  };
}

function actorRig() {
  return {
    group: { position: vector(), rotation: rotation(), visible: false },
    upper: { rotation: rotation() },
    legs: { rotation: rotation() },
    thighs: [{ rotation: rotation() }, { rotation: rotation() }],
    knees: [{ rotation: rotation() }, { rotation: rotation() }],
    arms: [{ rotation: rotation() }, { rotation: rotation() }],
    helpTarget: { name: 'margo-dress-help' },
    pose: 'lying',
    setPose(pose) { this.pose = pose; },
    setDressHelpProgress(progress) { this.progress = progress; },
    setDressGlue(progress) { this.glue = progress; },
    say(seconds) { this.speakingFor = seconds; },
    hush() { this.speakingFor = 0; },
  };
}

function harness() {
  const actor = actorRig();
  const events = [];
  const interaction = {
    paused: false,
    exclusive: null,
    setPaused(value) { this.paused = value; },
    setExclusiveTarget(value) { this.exclusive = value; },
  };
  const hud = {
    say(text) { events.push(['say', text]); },
    toast(text) { events.push(['toast', text]); },
    hidePrompt() {},
    setPosture(value) { events.push(['posture', value]); },
    setTiming(value) { this.timing = value; },
  };
  const audio = {
    play(name) { events.push(['play', name]); },
    startLoop(key) { events.push(['loop', key]); },
    stopLoop(key) { events.push(['stop', key]); },
  };
  let comeHomeDone = 0;
  let wakeDone = 0;
  const runtime = createLuxuryMargoScene({
    actor, interaction, hud, audio,
    onComeHomeDone: () => { comeHomeDone += 1; },
    onWakeDone: () => { wakeDone += 1; },
    openElevator: () => events.push(['elevator', 'open']),
    closeElevator: () => events.push(['elevator', 'close']),
  });
  return { actor, interaction, hud, events, runtime, done: () => ({ comeHomeDone, wakeDone }) };
}

function advanceUntil(runtime, predicate, limit = 3000) {
  for (let i = 0; i < limit && !predicate(); i++) runtime.update(0.1);
  assert.equal(predicate(), true, 'physical Margo scene did not reach the expected state');
}

function finishSevenPulls(runtime) {
  assert.equal(runtime.interact(), true);
  for (let i = 0; i < 7; i++) {
    runtime.debug.dress.debug.bar.pos = 0.80;
    assert.equal(runtime.press(), true, `dress pull ${i + 1} did not land`);
  }
}

test('Margo has one continuous measured route from private lift to upstairs bedroom', () => {
  assert.ok(LUXURY_MARGO_ENTRY_PATH.length >= 12);
  assert.deepEqual(LUXURY_MARGO_EXIT_PATH[0], LUXURY_MARGO_ENTRY_PATH.at(-1));
  assert.deepEqual(LUXURY_MARGO_EXIT_PATH.at(-1), LUXURY_MARGO_ENTRY_PATH[0]);
  const first = sampleLuxuryMargoPath(LUXURY_MARGO_ENTRY_PATH, 0);
  const last = sampleLuxuryMargoPath(LUXURY_MARGO_ENTRY_PATH, Number.MAX_SAFE_INTEGER);
  assert.ok(first.y < 1, 'entry does not begin on the main floor');
  assert.ok(last.y > 4, 'entry never reaches the loft floor');
  assert.ok(last.total > 20, 'entry path is an implausible teleport-sized shortcut');
  const stairHeights = LUXURY_MARGO_ENTRY_PATH.slice(4, 9).map((point) => point[1]);
  assert.deepEqual([...stairHeights].sort((a, b) => a - b), stairHeights,
    'the authored stair route descends or warps while entering');
});

test('beat 16 walks, talks, asks for a real interaction, then leaves Margo visibly in bed', () => {
  const h = harness();
  assert.equal(h.runtime.startComeHome(SILVER_ROOM_COME_HOME, SILVER_ROOM_DRESS_ASK), true);
  assert.equal(h.actor.group.visible, true);
  assert.match(h.runtime.objective, /upstairs/i);
  advanceUntil(h.runtime, () => h.runtime.awaitingHelp);
  assert.equal(h.interaction.exclusive, h.actor.helpTarget);
  assert.equal(h.actor.pose, 'standing', 'Margo assumed the help pose before the player interacted');

  finishSevenPulls(h.runtime);
  assert.deepEqual(h.done(), { comeHomeDone: 1, wakeDone: 0 });
  assert.equal(h.runtime.active, false);
  assert.equal(h.actor.pose, 'lying');
  assert.equal(h.actor.group.visible, true);
  assert.equal(h.actor.glue, 1);
  assert.equal(h.interaction.exclusive, null);
});

test('beat 17 begins at the bed and reverses the route before Lou can ring', () => {
  const h = harness();
  assert.equal(h.runtime.startWake(BIG_NIGHT_MARGO_WAKE), true);
  assert.equal(h.actor.group.visible, true);
  assert.equal(h.actor.pose, 'sitting');
  advanceUntil(h.runtime, () => h.runtime.awaitingHelp);
  finishSevenPulls(h.runtime);
  assert.equal(h.runtime.active, true, 'wake marker committed before the visible exit walk');
  assert.deepEqual(h.done(), { comeHomeDone: 0, wakeDone: 0 });
  advanceUntil(h.runtime, () => !h.runtime.active);
  assert.deepEqual(h.done(), { comeHomeDone: 0, wakeDone: 1 });
  assert.equal(h.actor.group.visible, false);
  assert.ok(h.events.some((event) => event[0] === 'elevator' && event[1] === 'open'));
});

test('the luxury scene preloads the exact Margo banks and campaign spine marks both beats wired', () => {
  const cues = luxuryMargoCueNames(
    SILVER_ROOM_COME_HOME,
    SILVER_ROOM_DRESS_ASK,
    BIG_NIGHT_MARGO_WAKE,
  );
  assert.ok(cues.includes('vo.margo.comehome.1'));
  assert.ok(cues.includes('vo.margo.comehome.dress.1'));
  assert.ok(cues.includes('vo.margo.wake.tony.3'));
  for (const id of ['margo_stayover', 'luxury_apartment_morning']) {
    assert.equal(CAMPAIGN_SPINE.find((beat) => beat.id === id)?.status, 'wired');
  }
  assert.equal(CAMPAIGN_SPINE.find((beat) => beat.id === 'margo_stayover')?.spawn, 'main');
  assert.equal(CAMPAIGN_SPINE.find((beat) => beat.id === 'luxury_apartment_morning')?.spawn, 'bed');
});
