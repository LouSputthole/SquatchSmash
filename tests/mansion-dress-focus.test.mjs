import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { InteractionSystem } from '../src/core/interaction.js';
import { Player } from '../src/core/player.js';
import { createDressHelpFocus } from '../src/world/dress-help-focus.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();
const { mountMansionCast } = await import('../src/mansion/cast.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');

test('the shared dress focus pauses the floor, clears movement, and aims at the fastening', () => {
  const paused = [];
  const player = {
    position: { x: 0, y: 1.66, z: 0 },
    enabled: true,
    yaw: 1,
    pitch: 0.5,
    clearKeysCalls: 0,
    clearKeys() { this.clearKeysCalls++; },
  };
  const interaction = {
    paused: false,
    setPaused(value) { this.paused = value; paused.push(value); },
  };
  const focus = createDressHelpFocus({
    player,
    interaction,
    target: () => ({ x: 0, y: 1.1, z: -2 }),
    marker: () => ({ x: 0, y: 1.66, z: 0.5 }),
  });

  assert.equal(focus.begin(), true);
  assert.equal(focus.begin(), false, 'a repeat start overwrote the restoration state');
  assert.equal(player.enabled, false);
  assert.equal(player.clearKeysCalls, 1);
  assert.deepEqual(player.position, { x: 0, y: 1.66, z: 0.5 });
  assert.equal(focus.debug.markerDistance, 0);
  assert.equal(interaction.paused, true);
  assert.ok(Math.abs(player.yaw) < 1e-9, `focus yaw ${player.yaw} is not toward -Z`);
  assert.ok(player.pitch < 0, 'the fastening below eye height did not lower the view');

  assert.equal(focus.end(), true);
  assert.equal(focus.end(), false);
  assert.equal(player.enabled, true);
  assert.equal(interaction.paused, false);
  assert.deepEqual(player.position, { x: 0, y: 1.66, z: 0 });
  assert.equal(player.yaw, 1);
  assert.equal(player.pitch, 0.5);
  assert.deepEqual(paused, [true, false]);
});

test('markerless Margo focus keeps its established no-snap view behavior', () => {
  const player = {
    position: { x: 2, y: 1.66, z: 3 },
    enabled: true,
    yaw: 1,
    pitch: 0.5,
    clearKeys() {},
  };
  const interaction = { paused: false, setPaused(value) { this.paused = value; } };
  const focus = createDressHelpFocus({
    player,
    interaction,
    target: () => ({ x: 2, y: 1.1, z: 1 }),
  });

  assert.equal(focus.begin(), true);
  const aimed = { yaw: player.yaw, pitch: player.pitch };
  assert.deepEqual(player.position, { x: 2, y: 1.66, z: 3 });
  assert.equal(focus.end(), true);
  assert.deepEqual({ yaw: player.yaw, pitch: player.pitch }, aimed,
    'markerless focus unexpectedly restored the pre-interaction view');
});

test('Mansion dress help accepts direct E presses while focus has paused ordinary interactions', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const player = {
    position: new THREE.Vector3(999, 999, 999),
    eyeHeight: 1.66,
    enabled: true,
    yaw: 0,
    pitch: 0,
    clearKeys() {},
  };
  const interaction = {
    paused: false,
    register(object, config) { object.userData.interact = config; },
    unregister(object) { delete object.userData.interact; },
    setPaused(value) { this.paused = value; },
  };
  const cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    interaction,
    player,
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    audio: {
      hasSample: () => false,
      play() {}, startLoop() {}, stopLoop() {},
    },
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, setTiming() {}, text: () => ({}) },
  });
  const use = cast.people.poolPerformer1.group.userData.interact.onUse;
  const performer = cast.people.poolPerformer1.group;
  const restPosition = performer.position.clone();
  const restYaw = performer.rotation.y;
  const restPlayer = {
    position: player.position.clone(),
    yaw: player.yaw,
    pitch: player.pitch,
  };
  const assertPlayerRestored = (label) => {
    assert.ok(player.position.distanceTo(restPlayer.position) < 1e-9,
      `${label} left the player at the fixture marker`);
    assert.ok(Math.abs(player.yaw - restPlayer.yaw) < 1e-9,
      `${label} left the player aimed at the staged fastening`);
    assert.ok(Math.abs(player.pitch - restPlayer.pitch) < 1e-9,
      `${label} left the player pitched at the staged fastening`);
  };
  const settle = (seconds) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) cast.update(1 / 60);
  };

  assert.equal(use(), true); // hello
  settle(8);
  assert.equal(use(), true); // flirt
  settle(8);
  assert.equal(use(), true); // begin timing
  assert.equal(cast.dressHelpActive, true);
  assert.equal(interaction.paused, true);
  assert.equal(player.enabled, false);
  const focus = cast.debug.evening.secondDress.focus;
  const actorStaging = cast.debug.evening.secondDress.actorStaging;
  assert.ok(focus.marker, 'the lounger has no authored interaction marker');
  assert.ok(focus.markerDistance < 1e-9,
    `dress focus stopped ${focus.markerDistance} m from its authored marker`);
  assert.ok(focus.targetDistance > 0.5 && focus.targetDistance < 2.5,
    `authored mark frames the fastening from ${focus.targetDistance} m`);
  const feetY = focus.marker.y - player.eyeHeight;
  const radius = 0.32;
  const blocking = grounds.colliders.filter((box) => (
    box.max.y > feetY + 0.08 && box.min.y < focus.marker.y + 0.08
    && box.max.x > focus.marker.x - radius && box.min.x < focus.marker.x + radius
    && box.max.z > focus.marker.z - radius && box.min.z < focus.marker.z + radius
  ));
  assert.deepEqual(blocking, [], 'the authored dress marker overlaps a real grounds collider');
  assert.ok(actorStaging.active, 'the dress sequence staged only the player, not the performer');
  assert.ok(actorStaging.marker, 'the performer has no authored dress marker');
  assert.ok(actorStaging.markerDistance < 1e-9,
    `performer stopped ${actorStaging.markerDistance} m from her authored marker`);
  assert.ok(actorStaging.yawError < 1e-9,
    `performer stopped ${actorStaging.yawError} rad from her authored orientation`);
  assert.ok(performer.position.distanceTo(restPosition) > 0.05,
    'dress begin never moved the performer into the interaction pose');

  cast.debug.setSecondPoolDressTarget(true);
  assert.equal(cast.pressDressHelp(), true,
    'direct E could not reach the TimingBar after ordinary interaction was paused');
  assert.equal(cast.debug.secondPoolDress.hits, 1);
  assert.equal(cast.abandonDressHelp(), true);
  assert.equal(interaction.paused, false);
  assert.equal(player.enabled, true);
  assertPlayerRestored('Q');
  assert.ok(performer.position.distanceTo(restPosition) < 1e-9,
    'Q did not restore the performer to her measured lounger position');
  assert.ok(Math.abs(performer.rotation.y - restYaw) < 1e-9,
    'Q did not restore the performer lounger orientation');

  assert.equal(use(), true, 'Q did not return the dress sequence to READY');
  assert.equal(cast.dressHelpActive, true);
  for (let i = 0; i < 7; i++) {
    cast.debug.setSecondPoolDressTarget(true);
    assert.equal(cast.pressDressHelp(), true, `completion pull ${i + 1} did not land`);
  }
  assert.equal(cast.dressHelpActive, false);
  assert.equal(interaction.paused, false, 'completion left ordinary interaction paused');
  assert.equal(player.enabled, true, 'completion left player movement disabled');
  assertPlayerRestored('completion');
  assert.ok(performer.position.distanceTo(restPosition) < 1e-9,
    'completion did not restore the performer to her measured lounger position');
  assert.ok(Math.abs(performer.rotation.y - restYaw) < 1e-9,
    'completion did not restore the performer lounger orientation');
});

test('Mansion marker focus restores the real pre-snap interaction view for a clean retry', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 220);
  scene.add(camera);
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const prompt = { label: null };
  const interaction = new InteractionSystem(camera, {
    showPrompt(label) { prompt.label = label; },
    hidePrompt() { prompt.label = null; },
    setHold() {},
  });
  interaction.setOccluders(grounds.occluders);
  const poolAt = grounds.anchors.poolPatio;
  const player = new Player(camera, {
    colliders: grounds.colliders,
    floorZones: [],
    groundAt: () => poolAt.y,
  });
  player.mode = 'walk';
  player.enabled = true;
  player.ground = poolAt.y;
  const cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    interaction,
    player,
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    audio: {
      hasSample: () => false,
      play() {}, startLoop() {}, stopLoop() {},
    },
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, setTiming() {}, text: () => ({}) },
  });
  const rig = cast.poolPerformerRig(1);
  const owner = rig.target;
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(owner);
  const chest = bounds.getCenter(new THREE.Vector3());
  chest.y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.62;
  const outward = new THREE.Vector3(chest.x - poolAt.x, 0, chest.z - poolAt.z).normalize();
  const stand = new THREE.Vector3(chest.x, poolAt.y + player.eyeHeight, chest.z)
    .addScaledVector(outward, 2.45);
  player.position.copy(stand);
  player.yaw = Math.atan2(-(chest.x - stand.x), -(chest.z - stand.z));
  player.pitch = Math.atan2(chest.y - stand.y, Math.hypot(chest.x - stand.x, chest.z - stand.z));
  player.update(1 / 60);
  scene.updateMatrixWorld(true);
  interaction.update(1 / 60);
  assert.equal(interaction.current, owner, 'the canonical pre-snap pose does not aim at the performer');

  const before = {
    position: player.position.clone(),
    yaw: player.yaw,
    pitch: player.pitch,
  };
  const use = owner.userData.interact.onUse;
  const settle = (seconds) => {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) cast.update(1 / 60);
  };
  assert.equal(use(), true);
  settle(8);
  assert.equal(use(), true);
  settle(8);
  assert.equal(use(), true);
  cast.debug.setSecondPoolDressTarget(true);
  assert.equal(cast.pressDressHelp(), true);
  assert.equal(cast.abandonDressHelp(), true);

  player.update(1 / 60);
  scene.updateMatrixWorld(true);
  interaction.update(1 / 60);
  const rayHits = interaction.raycaster.intersectObjects([
    ...interaction.targets, ...interaction.occluders,
  ], true);
  const firstHit = rayHits[0] ?? null;
  assert.ok(player.position.distanceTo(before.position) < 1e-9
      && Math.abs(player.yaw - before.yaw) < 1e-9
      && Math.abs(player.pitch - before.pitch) < 1e-9,
  `Q left the player at the fixture marker: ${JSON.stringify({
    before: before.position.toArray(),
    after: player.position.toArray(),
    yaw: [before.yaw, player.yaw],
    pitch: [before.pitch, player.pitch],
    current: interaction.current?.name ?? null,
    firstHit: firstHit ? {
      name: firstHit.object.name,
      distance: firstHit.distance,
      interactOwner: interaction._ownerOf(firstHit.object)?.name ?? null,
    } : null,
  })}`);
  assert.equal(interaction.current, owner,
    `restored view cannot reacquire performer; first hit ${firstHit?.object?.name || 'none'}`);
});
