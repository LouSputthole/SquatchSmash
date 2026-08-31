import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  BODY_BURN_DURATION_S,
  BODY_CARRY_POSITION,
  CABIN_CLEANUP_BODIES,
  GAS_POUR_SECONDS,
  GAS_POUR_STAGES,
  buildCabinBodyCleanup,
  cabinCleanupRestoreState,
  createCabinBonfireCastStaging,
} from '../src/cabin/body-cleanup.js';
import { TIME_EVENT_IDS, createCampaign } from '../src/core/campaign.js';
import {
  CABIN_HOSTAGE_IDS,
  createCountrysideCabinStory,
} from '../src/core/countryside-cabin-story.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function fixture(options = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 1, 0.08, 160);
  scene.add(camera);
  const cleanup = buildCabinBodyCleanup({ parent: scene, camera, ...options });
  return { scene, camera, cleanup };
}

test('cleanup owns exactly two canonical wrapped bodies and no substitute body geometry', () => {
  const { cleanup } = fixture();
  const canonical = [];
  const sheets = [];
  const capsuleMeshes = [];
  cleanup.root.traverse((object) => {
    if (object.userData?.cleanupCanonicalPrefab) canonical.push(object);
    if (/\.sheet$/.test(object.name)) sheets.push(object);
    if (object.geometry?.type === 'CapsuleGeometry') capsuleMeshes.push(object);
  });

  assert.equal(cleanup.bodies.size, 2);
  assert.equal(cleanup.geometry.bodyCount, 2);
  assert.equal(cleanup.geometry.canonicalPrefabCount, 2);
  assert.equal(canonical.length, 2);
  assert.equal(sheets.length, 2, 'one canonical sheet mesh per body, with no alternate wrapped copy');
  assert.equal(new Set(sheets.map(({ geometry }) => geometry.uuid)).size, 2);
  assert.deepEqual(capsuleMeshes, []);
  assert.deepEqual(Object.keys(cleanup.snapshot().bodies), CABIN_CLEANUP_BODIES.map(({ id }) => id));
});

test('interaction targets only call outward and never advance cleanup state themselves', () => {
  const calls = [];
  const { cleanup } = fixture({
    callbacks: {
      onWrap: (id, snapshot) => calls.push(['wrap', id, snapshot.bodies[id].phase]),
      onPourGas: (snapshot) => calls.push(['gas', snapshot.gasPoured]),
    },
  });
  const id = CABIN_CLEANUP_BODIES[0].id;
  cleanup.interactionDescriptors.wrap[id].onUse();
  assert.deepEqual(calls, [['wrap', id, 'awaiting-wrap']]);
  assert.equal(cleanup.snapshot().bodies[id].phase, 'awaiting-wrap');
  assert.equal(cleanup.interactionTargets.wrap[id].userData.interactionProxy, true);
  cleanup.interactionDescriptors.gasCan.onUse();
  assert.deepEqual(calls.at(-1), ['gas', false]);
  assert.equal(cleanup.snapshot().gasPoured, false);
});

test('outside cleanup task props remain readable before the pyre supplies any light', () => {
  const { cleanup } = fixture();
  const gasBody = cleanup.gasCan.getObjectByName('cabin-cleanup.gas-can.body');
  const skidMeshes = [];
  for (const skid of Object.values(cleanup.staging)) {
    skid.root.traverse((object) => {
      if (object.isMesh && /\.(?:runner|slat)$/.test(object.name)) skidMeshes.push(object);
    });
  }

  assert.equal(cleanup.burnFx.glow.intensity, 0, 'the readability check must not rely on the lit pyre');
  assert.ok(gasBody.material.emissive.getHex() !== 0);
  assert.ok(gasBody.material.emissiveIntensity >= 0.45);
  assert.equal(skidMeshes.length, 10);
  assert.ok(skidMeshes.every(({ material }) => (
    material.emissive.getHex() !== 0 && material.emissiveIntensity >= 0.30
  )));
});

test('two bodies wrap, carry with the shared bob, stage, stack on the pyre, gas, and burn', () => {
  const { camera, cleanup } = fixture();
  const [first, second] = CABIN_CLEANUP_BODIES.map(({ id }) => id);

  assert.equal(cleanup.wrap(first), true);
  assert.equal(cleanup.beginCarry(first), true);
  const firstRecord = cleanup.bodies.get(first);
  assert.equal(firstRecord.group.parent, camera);
  assert.deepEqual(firstRecord.group.position.toArray(), BODY_CARRY_POSITION);
  cleanup.update(0.1);
  assert.notEqual(firstRecord.group.position.y, BODY_CARRY_POSITION[1]);
  assert.equal(cleanup.stage(first), true);
  assert.equal(firstRecord.group.parent, cleanup.root);
  assert.equal(cleanup.snapshot().bodies[first].phase, 'staged');

  assert.equal(cleanup.wrap(second), true);
  assert.equal(cleanup.stage(second), true);
  for (const id of [first, second]) {
    assert.equal(cleanup.beginCarry(id), true);
    assert.equal(cleanup.placeAtFire(id), true);
  }
  assert.equal(cleanup.pourGas(), true);
  assert.equal(cleanup.gasSheen.visible, true);
  assert.equal(cleanup.ignite(), true);
  assert.equal(cleanup.burnFx.root.visible, true);
  assert.equal(cleanup.gasSheen.visible, false);
  assert.deepEqual(
    Object.values(cleanup.snapshot().bodies).map(({ phase }) => phase),
    ['burning', 'burning'],
  );

  const steps = Math.ceil(BODY_BURN_DURATION_S / 0.25) + 1;
  for (let i = 0; i < steps; i++) cleanup.update(0.25);
  const done = cleanup.snapshot();
  assert.equal(done.complete, true);
  assert.equal(done.burnProgress, 1);
  assert.deepEqual(Object.values(done.bodies).map(({ phase }) => phase), ['burned', 'burned']);
  assert.ok(firstRecord.group.scale.y < 0.60, 'the burned presentation collapses instead of swapping geometry');
  const y0 = cleanup.bodies.get(first).group.position.y;
  const y1 = cleanup.bodies.get(second).group.position.y;
  assert.ok(y1 - y0 > 0.20, 'both canonical bodies have distinct stacked pyre rests');
});

test('sync reconstructs carrying and completed burn presentations from JSON state', () => {
  const [first, second] = CABIN_CLEANUP_BODIES.map(({ id }) => id);
  const carryingFixture = fixture();
  carryingFixture.cleanup.sync({
    elapsed: 3.25,
    bodies: {
      [first]: { phase: 'carrying' },
      [second]: { phase: 'staged' },
    },
  });
  assert.equal(carryingFixture.cleanup.snapshot().carryingId, first);
  assert.equal(carryingFixture.cleanup.bodies.get(first).group.parent, carryingFixture.camera);
  assert.equal(carryingFixture.cleanup.bodies.get(second).group.parent, carryingFixture.cleanup.root);

  const source = fixture();
  source.cleanup.sync({
    elapsed: 20,
    gasPoured: true,
    ignited: true,
    burnProgress: 1,
    bodies: {
      [first]: { phase: 'burned' },
      [second]: { phase: 'burned' },
    },
  });
  const saved = JSON.parse(JSON.stringify(source.cleanup.snapshot()));
  const restored = fixture();
  const after = restored.cleanup.sync(saved);
  assert.deepEqual(after, source.cleanup.snapshot());
  assert.equal(restored.cleanup.burnFx.root.visible, true);
  assert.ok(restored.cleanup.bodies.get(first).group.scale.y < 0.60);
  assert.equal(restored.cleanup.geometry.dressing.beerCans, 6);
  assert.equal(restored.cleanup.geometry.dressing.whiskeyBottles, 1);
  assert.equal(restored.cleanup.geometry.dressing.cigarettePacks, 2);
  assert.equal(restored.cleanup.geometry.dressing.ashtrays, 1);
  assert.equal(restored.cleanup.geometry.dressing.seats, 2);
});

test('aggregate-only legacy staging reconstructs both physical bodies at the fire', () => {
  const campaign = createCampaign({ storage: new MemoryStorage() });
  campaign.advanceTime(TIME_EVENT_IDS.CABIN_BODIES_STAGED);
  const story = createCountrysideCabinStory({ campaign });
  const storyToCleanupBody = Object.freeze({
    [CABIN_HOSTAGE_IDS.COUNTER_STRIKE_PLAYER]: 'counterstrike-player',
    [CABIN_HOSTAGE_IDS.ATEAM_MEMBER]: 'a-team-member',
  });

  for (const storyId of Object.values(CABIN_HOSTAGE_IDS)) {
    assert.equal(story.hostageState(storyId).atFire, false,
      'the legacy fixture intentionally omits both newer per-body markers');
    assert.equal(story.bodyAtFire(storyId), true,
      'the aggregate marker remains authoritative campaign truth');
  }

  const { cleanup } = fixture();
  cleanup.sync(cabinCleanupRestoreState({ story, storyToCleanupBody }));
  assert.deepEqual(
    Object.values(cleanup.snapshot().bodies).map(({ phase }) => phase),
    ['at-fire', 'at-fire'],
  );
  assert.equal(cleanup.pourGas(), true,
    'legacy staged saves must resume at gasoline instead of softlocking the physical pyre');
});

function fakeBonfireNpc(parent, { x, y, z, yaw = 0 } = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  parent.add(group);
  return {
    group,
    parts: { heightScale: 1 },
    baseY: y,
    homeX: x,
    homeZ: z,
    homeYaw: yaw,
    targetYaw: undefined,
    job: 'stand',
    seated: false,
    sit() {
      this.seated = true;
      this.group.position.y = this.baseY - 0.42;
    },
    stand() {
      this.seated = false;
      this.group.position.y = this.baseY;
    },
    faceToward(targetX, targetZ) {
      this.group.rotation.y = Math.atan2(targetX - this.group.position.x, targetZ - this.group.position.z);
      this.targetYaw = undefined;
      return this.group.rotation.y;
    },
  };
}

test('bonfire cast staging uses both authored stump seats and restores daytime posts', () => {
  const { scene, cleanup } = fixture();
  const lagNpc = fakeBonfireNpc(scene, { x: 12, y: 0.4, z: -8, yaw: 0.8 });
  const gratin = fakeBonfireNpc(scene, { x: 1, y: -3.1, z: 13, yaw: -0.4 });
  const lagModes = [];
  const lag = {
    npc: lagNpc,
    setBonfireMode(active) { lagModes.push(active); },
  };
  const originals = {
    lag: lagNpc.group.position.clone(),
    lagYaw: lagNpc.group.rotation.y,
    gratin: gratin.group.position.clone(),
    gratinYaw: gratin.group.rotation.y,
  };
  const staging = createCabinBonfireCastStaging({
    lag,
    gratin,
    seats: cleanup.dressing.seats,
    fireTarget: cleanup.interactionTargets.fire,
  });

  assert.equal(staging.stage(), true);
  assert.equal(staging.stage(), true, 'repeat restore callbacks keep the same captured daytime homes');
  assert.deepEqual(lagModes, [true]);
  assert.equal(staging.snapshot().staged, true);
  for (const [actor, seat] of [[lagNpc, cleanup.dressing.seats[0]], [gratin, cleanup.dressing.seats[1]]]) {
    const seatAt = seat.getWorldPosition(new THREE.Vector3());
    const actorAt = actor.group.getWorldPosition(new THREE.Vector3());
    assert.ok(actorAt.distanceTo(new THREE.Vector3(seatAt.x, actorAt.y, seatAt.z)) < 1e-9);
    assert.equal(actor.job, 'drink');
    assert.equal(actor.seated, true);
  }

  assert.equal(staging.restore(), true);
  assert.deepEqual(lagModes, [true, false]);
  assert.equal(staging.snapshot().staged, false);
  assert.deepEqual(lagNpc.group.position.toArray(), originals.lag.toArray());
  assert.equal(lagNpc.group.rotation.y, originals.lagYaw);
  assert.equal(lagNpc.job, 'stand');
  assert.equal(lagNpc.seated, false);
  assert.deepEqual(gratin.group.position.toArray(), originals.gratin.toArray());
  assert.ok(Math.abs(gratin.group.rotation.y - originals.gratinYaw) < 1e-12);
  assert.equal(gratin.job, 'stand');
  assert.equal(gratin.seated, false);
});

/**
 * THE FUEL PASS IS PLAYED, NOT SWITCHED ON.
 *
 * Owner, cabin playtest: *"We put a little more work into the pouring the
 * gasoline on the bodies, at the burning them scene."*
 *
 * The can has to leave its stand, cross the pyre mouth-down, coat the two
 * bundles in the order the stream reaches them, and come back -- and a save
 * restored after the pour must land on the finished frame without replaying
 * any of it or re-firing a single cue.
 */
test('the gasoline pass crosses the pyre, coats both bundles in order, and returns the can', () => {
  const { cleanup } = fixture();
  const [first, second] = CABIN_CLEANUP_BODIES.map(({ id }) => id);
  const home = cleanup.gasCan.position.clone();
  for (const id of [first, second]) {
    assert.equal(cleanup.wrap(id), true);
    assert.equal(cleanup.beginCarry(id), true);
    assert.equal(cleanup.placeAtFire(id), true);
  }

  const stream = cleanup.root.getObjectByName('cabin-cleanup.gas-stream');
  assert.ok(stream, 'the pour needs a stream to show');
  assert.equal(stream.visible, false, 'and it stays hidden until the can is tipped');

  assert.equal(cleanup.pourGas(), true);
  assert.equal(cleanup.snapshot().pouring, true);
  assert.equal(cleanup.snapshot().pourProgress, 0);

  const samples = [];
  for (let t = 0; t < GAS_POUR_SECONDS + 0.3; t += 1 / 60) {
    cleanup.update(1 / 60);
    samples.push({
      p: cleanup.snapshot().pourProgress,
      streaming: stream.visible,
      x: cleanup.gasCan.position.x,
      tilt: cleanup.gasCan.rotation.z,
      wet: [...cleanup.bodies.values()].map((record) => record.wet),
    });
  }

  // Mouth-down over the pyre, and the mouth walks from the first bundle to
  // the second rather than sitting in one place.
  const streaming = samples.filter((s) => s.streaming);
  assert.ok(streaming.length > 60, `the stream should run for over a second, got ${streaming.length} frames`);
  assert.ok(Math.min(...streaming.map((s) => s.tilt)) < -1.5, 'the can never tipped mouth-down');
  const walked = Math.max(...streaming.map((s) => s.x)) - Math.min(...streaming.map((s) => s.x));
  assert.ok(walked > 0.9, `the mouth only crossed ${walked.toFixed(2)} m of the pyre`);

  // The first bundle is wet before the second is touched.
  const firstWetAt = samples.findIndex((s) => s.wet[0] >= 0.99);
  const secondWetAt = samples.findIndex((s) => s.wet[1] >= 0.99);
  assert.ok(firstWetAt > 0 && secondWetAt > firstWetAt,
    `coats landed out of order: ${firstWetAt} then ${secondWetAt}`);

  const done = cleanup.snapshot();
  assert.equal(done.pouring, false);
  assert.equal(done.pourProgress, 1);
  assert.equal(stream.visible, false, 'nothing is still pouring when the pass is over');
  assert.ok(cleanup.gasCan.position.distanceTo(home) < 0.01, 'the can goes back where it came from');
  assert.ok(Math.abs(cleanup.gasCan.rotation.z) < 0.01, 'and it is set down upright');
});

test('every authored pour stage fires once, in order, and never again after a reload', () => {
  const events = [];
  const { cleanup } = fixture({ onEvent: (event) => events.push(event) });
  for (const { id } of CABIN_CLEANUP_BODIES) {
    cleanup.wrap(id);
    cleanup.beginCarry(id);
    cleanup.placeAtFire(id);
  }
  cleanup.pourGas();
  for (let t = 0; t < GAS_POUR_SECONDS + 0.5; t += 1 / 60) cleanup.update(1 / 60);

  const staged = events.filter((event) => event.type === 'pour-stage').map((event) => event.stage);
  assert.deepEqual(staged, GAS_POUR_STAGES.map(({ id }) => id));
  assert.equal(events.filter((event) => event.type === 'pour-complete').length, 1);

  // Another two seconds of frames must not announce anything else.
  const before = events.length;
  for (let t = 0; t < 2; t += 1 / 60) cleanup.update(1 / 60);
  assert.equal(events.length, before, 'the finished pass kept talking');

  // Reload: the fuel is on them, and not one cue plays again.
  const restored = fixture({ onEvent: (event) => events.push(event) });
  const replayed = events.length;
  restored.cleanup.sync(cleanup.snapshot());
  assert.equal(events.length, replayed, 'a restored pour re-announced its stages');
  const snapshot = restored.cleanup.snapshot();
  assert.equal(snapshot.gasPoured, true);
  assert.equal(snapshot.pourProgress, 1);
  assert.equal(snapshot.pouring, false);
  assert.ok([...restored.cleanup.bodies.values()].every((record) => record.wet === 1));
});
