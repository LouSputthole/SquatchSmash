import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { TimingBar } from '../src/core/timingbar.js';
import {
  BING_PERFORMER_BATHROOM_ACTOR_MARKER,
  BING_PERFORMER_BATHROOM_CUES,
  BING_PERFORMER_BATHROOM_TIPS_REQUIRED,
  bingPerformerBathroomStageAction,
  createBingPerformerBathroom,
  stageBingBathroomPerformer,
} from '../src/bing/performer-bathroom.js';

function actorFixture() {
  const group = new THREE.Group();
  group.position.set(-12, 0.62, -2.9);
  const part = () => ({ rotation: new THREE.Euler() });
  return {
    group,
    parts: {
      legL: part(), legR: part(), armL: part(), armR: part(),
      foreL: part(), foreR: part(),
    },
    job: 'dance',
    baseY: 0.62,
    homeX: -12,
    homeZ: -2.9,
    route: null,
    routeAt: 0,
    look: false,
    stand() { this.group.position.y = this.baseY; },
    _syncJob() {},
  };
}

function runtimeFixture() {
  const actor = actorFixture();
  const player = {
    position: new THREE.Vector3(2, 1.66, 3),
    yaw: 0.3,
    pitch: -0.1,
    pitchMin: -1.2,
    pitchMax: 1.2,
    enabled: true,
    velocity: new THREE.Vector3(),
    clearKeys() {},
  };
  const interaction = {
    paused: false,
    setPaused(value) { this.paused = value; },
  };
  const played = [];
  const loops = [];
  const audio = {
    play(name) { played.push(name); },
    startLoop(key, options) { loops.push(['start', key, options.name]); },
    stopLoop(key) { loops.push(['stop', key]); },
  };
  const timing = [];
  const posture = [];
  const hud = {
    setTiming(value) { timing.push(value); },
    setPosture(value) { posture.push(value); },
    hidePrompt() {},
    toast() {},
    say() {},
  };
  const door = {
    open: false,
    toggles: 0,
    toggle() { this.open = !this.open; this.toggles++; return true; },
  };
  return { actor, player, interaction, audio, played, loops, timing, posture, door };
}

test('the third tip unlocks the first-visit invitation only', () => {
  assert.equal(BING_PERFORMER_BATHROOM_TIPS_REQUIRED, 3);
  assert.equal(bingPerformerBathroomStageAction({ tips: 2 }), 'tip');
  assert.equal(bingPerformerBathroomStageAction({ tips: 3 }), 'invite');
  assert.equal(bingPerformerBathroomStageAction({ tips: 9, secondVisit: true }), 'tip');
  assert.equal(bingPerformerBathroomStageAction({ tips: 3, state: 'following' }), 'tip');
});

test('the performer walks the authored route, opens the men’s room, and reaches the exact marker', () => {
  const fixture = runtimeFixture();
  let ready = 0;
  const beat = createBingPerformerBathroom({
    ...fixture,
    timingBar: TimingBar,
    onReady: () => ready++,
  });

  assert.equal(beat.invite(2), false);
  assert.equal(beat.invite(3), true);
  assert.equal(beat.state, 'following');
  assert.equal(fixture.played.includes('ui.select'), true);
  beat.update(30);
  assert.equal(beat.state, 'ready');
  assert.equal(ready, 1);
  assert.equal(fixture.door.open, true);
  assert.equal(fixture.door.toggles, 1);
  assert.ok(fixture.actor.group.position.distanceTo(
    new THREE.Vector3(
      BING_PERFORMER_BATHROOM_ACTOR_MARKER.x,
      BING_PERFORMER_BATHROOM_ACTOR_MARKER.y,
      BING_PERFORMER_BATHROOM_ACTOR_MARKER.z,
    ),
  ) < 1e-9);
});

test('the bathroom Adapter reuses the seven-hit dress-help sequence and restores player control', () => {
  const fixture = runtimeFixture();
  const original = {
    position: fixture.player.position.clone(),
    yaw: fixture.player.yaw,
    pitch: fixture.player.pitch,
  };
  let completed = null;
  const beat = createBingPerformerBathroom({
    ...fixture,
    timingBar: TimingBar,
    onComplete: (event) => { completed = event; },
  });
  beat.invite(3);
  beat.update(30);
  assert.equal(beat.start(), true);
  assert.equal(fixture.door.open, false);
  assert.equal(fixture.door.toggles, 2);
  assert.equal(fixture.played.includes('door.bathroom.close'), true);
  assert.equal(fixture.player.enabled, false);
  assert.equal(fixture.interaction.paused, true);

  const bar = beat.debug.sequence.bar;
  for (let hit = 0; hit < 7; hit++) {
    bar.pos = 0.8;
    assert.equal(beat.press(), true);
  }

  assert.equal(beat.complete, true);
  assert.deepEqual(completed, { hits: 7, misses: 0, earned: true });
  assert.equal(fixture.player.enabled, true);
  assert.equal(fixture.interaction.paused, false);
  assert.ok(fixture.player.position.distanceTo(original.position) < 1e-9);
  assert.equal(fixture.player.yaw, original.yaw);
  assert.equal(fixture.player.pitch, original.pitch);
  assert.ok(BING_PERFORMER_BATHROOM_CUES.every((cue) => (
    fixture.played.includes(cue) || fixture.loops.some(([, , name]) => name === cue)
  )));
  /* The glue application actually sounded: pickup at the start, a squeeze
   * under every pass, and the tube giving at the end (owner, 2026-09-01:
   * "I want the glue to go on the back like we had"). */
  assert.ok(fixture.played.includes('glue.pickup'));
  assert.ok(fixture.played.filter((cue) => cue === 'glue.squeeze').length >= 7);
  assert.ok(fixture.played.includes('glue.burst'));
});

test('she gets on all fours facing away, and walks back to the stage after', () => {
  const fixture = runtimeFixture();
  const beat = createBingPerformerBathroom({ ...fixture, timingBar: TimingBar });
  beat.invite(3);
  beat.update(30);
  beat.start();

  /* All fours, facing away from the player at the door (owner, 2026-09-01:
   * "She should get on in all fours and face away from you"): pitched
   * forward, dropped toward the floor, and yawed east — the player marker
   * is due west of hers. */
  beat.update(0.05);
  assert.equal(fixture.actor.group.rotation.y, Math.PI / 2);
  assert.ok(fixture.actor.group.rotation.x > 0.5, 'the figure pitches forward');
  assert.ok(fixture.actor.group.position.y < 0.5, 'she is down at the floor');

  const bar = beat.debug.sequence.bar;
  for (let hit = 0; hit < 7; hit++) {
    bar.pos = 0.8;
    beat.press();
  }
  /* Earned, and immediately on her way out — the objective must not wait on
   * the commute. */
  assert.equal(beat.state, 'returning');
  assert.equal(beat.complete, true);
  assert.equal(fixture.actor.group.rotation.x, 0, 'the pose clears before she stands');
  assert.equal(fixture.door.open, true, 'the door opens for the walk out');

  beat.update(30);
  assert.equal(beat.state, 'complete');
  /* Back on her captured stage life: same mark, same job. */
  assert.deepEqual(fixture.actor.group.position.toArray(), [-12, 0.62, -2.9]);
  assert.equal(fixture.actor.job, 'dance');
  assert.equal(fixture.actor.baseY, 0.62);
});

test('the pure geometry stage is stable and does not depend on browser systems', () => {
  const actor = actorFixture();
  stageBingBathroomPerformer(actor);
  assert.deepEqual(actor.group.position.toArray(), [10.65, 0, 1.72]);
  assert.equal(actor.group.rotation.y, -Math.PI / 2);
  assert.equal(actor.job, 'stand');
  assert.equal(actor.baseY, 0);
});
