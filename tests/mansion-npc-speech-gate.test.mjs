import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { createContractLab } from '../src/mansion/mission/contract-lab.js';
import { createSilentSquatchMission } from '../src/mansion/mission/SilentSquatchMission.js';
import { createNpcSpeechGate } from '../src/mansion/npc-speech-gate.js';
import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();
const { mountMansionCast, MANSION_CAST_CUE_NAMES } = await import('../src/mansion/cast.js');
const { mountSilentSquatch } = await import('../src/mansion/mission/mount.js');
const { buildMansionGrounds } = await import('../src/mansion/scenes/MansionGrounds.js');
const { buildSilentSquatch } = await import('../src/mansion/scenes/SilentSquatch.js');

function point(x, y, z) {
  return { x, y, z };
}

test('NPC speech requires the real speaker to be close, on this floor, and visible', () => {
  let listener = point(0, 0, 0);
  const speakers = {
    rippin: point(3, 0, 0),
    eric: point(2, 6, 0),
  };
  let blockers = [];
  const gate = createNpcSpeechGate({
    listener: () => listener,
    speaker: (id) => speakers[id],
    blockers: () => blockers,
    cooldown: 12,
  });

  assert.equal(gate.inspect('rippin', { range: 3.2 }).allowed, true);

  listener = point(-0.3, 0, 0);
  assert.deepEqual(gate.inspect('rippin', { range: 3.2 }).reason, 'distance');

  listener = point(2, 0, 0);
  assert.deepEqual(gate.inspect('eric', { range: 3.2 }).reason, 'floor');

  listener = point(0, 0, 0);
  speakers.rippin = point(2, 0, 0);
  blockers = [{
    min: point(0.9, 0, -1),
    max: point(1.1, 3, 1),
  }];
  assert.deepEqual(gate.inspect('rippin', { range: 3.2 }).reason, 'occluded');
});

test('the booth guard ignores only his own booth shell while other grounds walls still occlude him', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const ownShell = grounds.props.securityBooth.speechOccluders ?? [];
  assert.equal(ownShell.length, 4,
    'the four booth-wall colliders are not published as one owned fixture');
  assert.ok(ownShell.every((box) => grounds.colliders.includes(box)),
    'a published booth-wall exception is not one of the real world blockers');

  const player = { position: new THREE.Vector3(0, 1.66, 0), eyeHeight: 1.66 };
  let cast = null;
  const gate = createNpcSpeechGate({
    listener: () => point(
      player.position.x,
      player.position.y - player.eyeHeight,
      player.position.z,
    ),
    speaker: (id) => cast?.people?.[id]?.group?.position ?? null,
    blockers: () => grounds.colliders,
  });
  cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    player,
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    speechGate: gate,
    speechOcclusionExceptions: (id) => (id === 'booth' ? ownShell : null),
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, text: () => ({}) },
  });

  const booth = cast.people.booth.group.position;
  const gateLine = point(0, 0, 0);
  assert.equal(gate.inspect('booth', {
    listenerPosition: gateLine,
    speakerPosition: booth,
    range: 12.5,
    ignoreBlockers: ownShell,
  }).allowed, true, 'the guard still cannot call through his own booth window');

  const spawn = point(grounds.anchors.spawn.x, 0, grounds.anchors.spawn.z);
  assert.equal(gate.inspect('booth', {
    listenerPosition: spawn,
    speakerPosition: booth,
    range: 12.5,
    ignoreBlockers: ownShell,
  }).reason, 'occluded', 'ignoring the booth shell also disabled a separate gate-pier wall');

  cast.update(1 / 60);
  assert.ok(cast.dialogue.cueLog.includes('vo.silentsquatch.gate.booth.stopthere'),
    'the production cast still did not trigger the booth challenge at the real gate line');
  assert.deepEqual(
    (cast.dialogue.captionLog ?? []).find(({ cue }) => (
      cue === 'vo.silentsquatch.gate.booth.stopthere'
    )),
    {
      speaker: 'BOOTH',
      speakerName: 'The man on the gate',
      text: 'Stop there. Name.',
      cue: 'vo.silentsquatch.gate.booth.stopthere',
    },
    'the exact booth caption never reached the shared subtitle presentation seam',
  );
  assert.equal(gate.debug.heard('booth'), true,
    'the booth challenge bypassed the shared per-speaker cooldown');
});

test('the shared per-speaker cooldown starts only when a line is committed', () => {
  const gate = createNpcSpeechGate({
    listener: () => point(0, 0, 0),
    speaker: () => point(2, 0, 0),
    cooldown: 12,
  });

  assert.equal(gate.canSpeak('rippin', { range: 3.2 }), true);
  assert.equal(gate.canSpeak('rippin', { range: 3.2 }), true,
    'merely testing a trigger spent the cooldown');
  gate.commit('rippin');
  assert.equal(gate.inspect('rippin', { range: 3.2 }).reason, 'cooldown');
  gate.update(11.9);
  assert.equal(gate.canSpeak('rippin', { range: 3.2 }), false);
  gate.update(0.1);
  assert.equal(gate.canSpeak('rippin', { range: 3.2 }), true);
});

test('organic Mansion mission zones are not consumed until the actual speaker is audible', () => {
  let allowRippin = false;
  const committed = [];
  const mission = createSilentSquatchMission({
    lab: createContractLab(),
    zones: { rippin: { x: 0, y: 0, z: 0, r: 3.2 } },
    canEnterZone: (id) => id !== 'rippin' || allowRippin,
    canIdleBark: () => false,
    onNpcBark: (id, kind) => committed.push({ id, kind }),
  });
  mission.start();

  const insideOldRoomAnchor = point(0, 0, 0);
  mission.update(1 / 60, { position: insideOldRoomAnchor });
  assert.equal(mission.zonesEntered.has('rippin'), false,
    'the room anchor consumed Rippin before his body was audible');
  assert.equal(mission.barked.has('rippin'), false);

  allowRippin = true;
  mission.update(1 / 60, { position: insideOldRoomAnchor });
  assert.equal(mission.zonesEntered.has('rippin'), true);
  assert.equal(mission.barked.has('rippin'), true);
  assert.deepEqual(committed, [{ id: 'rippin', kind: 'arrival' }]);
});

test('arrival idle barks stay silent when no real NPC is audible', () => {
  const committed = [];
  const mission = createSilentSquatchMission({
    lab: createContractLab(),
    zones: {},
    canIdleBark: () => false,
    onNpcBark: (id, kind) => committed.push({ id, kind }),
  });
  mission.start();
  for (let i = 0; i < 60 * 60; i++) {
    mission.update(1 / 60, { position: point(999, 0, 999) });
  }

  const remoteAmbient = mission.report().cues.filter((cue) => (
    cue.includes('.arrival.rippin.')
    || cue.includes('.arrival.eric.')
    || cue.includes('.arrival.shubes.')
    || cue.includes('.arrival.snow.')
  ));
  assert.deepEqual(remoteAmbient, []);
  assert.deepEqual(committed, []);
});

test('Mansion cast barks commit the shared cooldown and play from the speaker body', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const player = { position: new THREE.Vector3(), eyeHeight: 1.66 };
  const played = [];
  let cast = null;
  const gate = createNpcSpeechGate({
    listener: () => ({
      x: player.position.x,
      y: player.position.y - player.eyeHeight,
      z: player.position.z,
    }),
    speaker: (id) => cast?.people?.[id]?.group?.position ?? null,
    blockers: () => grounds.colliders,
  });
  cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    player,
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    speechGate: gate,
    audio: {
      hasSample: () => true,
      play(name, options) { played.push({ name, options }); return null; },
    },
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, text: () => ({}) },
  });

  const speaker = cast.people.numbskull.group.position;
  player.position.set(speaker.x, speaker.y + player.eyeHeight, speaker.z + 1.5);
  cast.update(1 / 60);

  const bark = played.find(({ name }) => name === 'vo.silentsquatch.house.numbskull.nobodyswims');
  assert.ok(bark, 'Numbskull did not put his nearby authored bark on the floor');
  assert.equal(gate.debug.heard('numbskull'), true, 'the cast bypassed the shared cooldown');
  assert.ok(bark.options?.position, 'the recorded line is still room-wide/non-positional');
  assert.ok(Math.hypot(
    bark.options.position.x - speaker.x,
    bark.options.position.y - speaker.y,
    bark.options.position.z - speaker.z,
  ) < 0.01, 'the panner is not attached to Numbskull\'s body');
});

test('Sauce and Eric reuse delivered authored lines only at their real bodies while Kate stays explicitly uncast', () => {
  const scene = new THREE.Scene();
  const grounds = buildMansionGrounds(null);
  scene.add(grounds.root);
  const player = { position: new THREE.Vector3(999, 1.66, 999), eyeHeight: 1.66 };
  const played = [];
  let cast = null;
  const gate = createNpcSpeechGate({
    listener: () => ({
      x: player.position.x,
      y: player.position.y - player.eyeHeight,
      z: player.position.z,
    }),
    speaker: (id) => cast?.people?.[id]?.group?.position ?? null,
    blockers: () => grounds.colliders,
  });
  cast = mountMansionCast(scene, { colliders: grounds.colliders }, {
    player,
    anchors: grounds.anchors,
    pool: grounds.props.poolPatio,
    speechGate: gate,
    audio: {
      hasSample: () => true,
      play(name, options) { played.push({ name, options }); return null; },
    },
    hud: { showLine() {}, hideLine() {}, setInstruction() {}, text: () => ({}) },
  });

  assert.deepEqual(cast.debug.ambientSpeakers, [
    {
      id: 'sauce', present: true,
      cues: ['vo.bing.full.sauce.open.line.ggzxjv'], count: 1,
    },
    {
      id: 'eric', present: true,
      cues: [
        'vo.silentsquatch.arrival.eric.mood',
        'vo.silentsquatch.arrival.eric.dontsitdown',
      ],
      count: 2,
    },
    {
      id: 'kate', present: false, cues: [], count: 0,
      reason: 'identity-not-catalogued',
    },
  ]);
  assert.ok(MANSION_CAST_CUE_NAMES.includes('vo.bing.full.sauce.open.line.ggzxjv'),
    'the reused recorded Sauce take is not resident at Mansion boot');
  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/sfx/manifest.json', import.meta.url), 'utf8'));
  const index = JSON.parse(fs.readFileSync(new URL('../assets/sfx/index.json', import.meta.url), 'utf8'));
  const manifestNames = new Set(manifest.sfx.map(({ name }) => name));
  const indexedFiles = new Set(index.files);
  for (const cue of cast.debug.ambientSpeakers.flatMap(({ cues }) => cues)) {
    const filename = `${cue}.mp3`;
    assert.ok(manifestNames.has(cue), `${cue} is not manifest-backed`);
    assert.ok(indexedFiles.has(filename), `${cue} is not indexed`);
    assert.ok(fs.statSync(new URL(`../assets/sfx/${filename}`, import.meta.url)).size > 1024,
      `${cue} has no non-trivial delivered file`);
  }

  cast.update(1 / 60);
  const ambientCues = new Set(cast.debug.ambientSpeakers.flatMap(({ cues }) => cues));
  assert.deepEqual(played.filter(({ name }) => ambientCues.has(name)), [],
    'a remote Sauce/Eric body spoke across the Mansion');

  const sauce = cast.people.sauce.group.position;
  player.position.set(sauce.x, sauce.y + player.eyeHeight, sauce.z + 1.5);
  cast.update(1 / 60);
  const sauceLine = played.find(({ name }) => name === 'vo.bing.full.sauce.open.line.ggzxjv');
  assert.ok(sauceLine, 'nearby Sauce did not play his delivered authored line');
  assert.ok(sauceLine.options?.position?.distanceTo(sauce) < 0.01,
    'Sauce audio is not attached to Sauce');
  assert.equal(gate.debug.heard('sauce'), true);

  cast.dialogue.clear();
  const eric = cast.people.eric.group.position;
  player.position.set(eric.x, eric.y + player.eyeHeight, eric.z + 1.5);
  cast.update(1 / 60);
  const ericLine = played.find(({ name }) => name === 'vo.silentsquatch.arrival.eric.mood');
  assert.ok(ericLine, 'nearby Eric did not play his delivered authored arrival line');
  assert.ok(ericLine.options?.position?.distanceTo(eric) < 0.01,
    'Eric audio is not attached to Eric');
  assert.equal(gate.debug.heard('eric'), true);
});

test('the production mission mount gates room anchors on real bodies and spatializes their cues', () => {
  const built = buildSilentSquatch();
  const scene = new THREE.Scene();
  scene.add(built.root);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const player = { eyeHeight: 1.66, position: new THREE.Vector3(0, 1.66, 0) };
  const speakers = { rippin: point(6, 0, 0) };
  const played = [];
  const gate = createNpcSpeechGate({
    listener: () => point(player.position.x, player.position.y - player.eyeHeight, player.position.z),
    speaker: (id) => speakers[id] ?? null,
    blockers: () => [],
  });
  const mounted = mountSilentSquatch({
    THREE,
    scene,
    camera,
    player,
    lab: built.lab,
    anchors: { loungeCenter: point(0, 0, 0) },
    speechGate: gate,
    audio: {
      hasSample: () => true,
      play(name, options) { played.push({ name, options }); return null; },
      sampleDuration: () => 0.05,
    },
    missionHud: {
      setObjective() {}, setInstruction() {}, setCallout() {},
      showLine() {}, hideLine() {}, setKeypad() {}, setKeypadDigits() {},
      text: () => ({}),
    },
  });

  mounted.update(1 / 60);
  assert.equal(mounted.mission.zonesEntered.has('rippin'), false,
    'the production mount consumed the lounge anchor six metres from Rippin');

  speakers.rippin = point(2.4, 0, 0);
  mounted.update(1 / 60);
  assert.equal(mounted.mission.zonesEntered.has('rippin'), true);
  assert.equal(gate.debug.heard('rippin'), true);
  for (let i = 0; i < 300; i++) mounted.update(1 / 60);

  const cue = played.find(({ name }) => name === 'vo.silentsquatch.arrival.rippin.balls');
  assert.ok(cue, `the delivered Rippin arrival take never reached AudioEngine.play: ${played.map(({ name }) => name).join(', ')}`);
  assert.ok(cue.options?.position, 'the mission left Rippin room-wide/non-positional');
  assert.equal(cue.options.position.x, speakers.rippin.x);
  assert.equal(cue.options.position.y, speakers.rippin.y);
  assert.equal(cue.options.position.z, speakers.rippin.z);
});
