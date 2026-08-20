/**
 * THE SPECIAL MEETING — what it sounds like, and what the stage hands back.
 *
 * The failure this file exists to stop is the quiet one: a scene that names a
 * cue nobody has recorded. `audio.play()` falls through to the synth, the
 * manifest never learns the name, `npm run sfx` can never render it, and the
 * beat ships as a noise nobody chose. `tools/check.mjs` catches it at the call
 * site; this catches it in the catalog, and pins the two together so neither
 * can drift.
 *
 * The block was built without minting a single new cue, deliberately — the
 * manifest is not this pass's to edit. `REQUESTED_CUES` is the ask, in the
 * source, where it cannot be lost.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = await import('three');
const {
  AMBIENCE_CUES,
  AMBIENCE_LOOPS,
  REQUESTED_CUES,
  createSpecialMeetingAmbience,
} = await import('../src/specialmeeting/ambience.js');
const { stageSpecialMeeting } = await import('../src/specialmeeting/stage.js');
const { SPAWN, ROAD, SIDEWALK, groundAt } = await import('../src/specialmeeting/layout.js');

const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sfx/manifest.json'), 'utf8'));
const MANIFEST_CUES = new Set(MANIFEST.sfx.map((cue) => cue.name));
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/specialmeeting/ambience.js'), 'utf8');

function fakeAudio() {
  const calls = { played: [], loops: new Map(), volumes: [], moved: [], stopped: [] };
  return {
    calls,
    play: (name, options) => calls.played.push({ name, options }),
    startLoop: (key, options) => { calls.loops.set(key, options?.name ?? key); },
    stopLoop: (key) => { calls.loops.delete(key); calls.stopped.push(key); },
    setLoopVolume: (key, value) => calls.volumes.push({ key, value }),
    moveLoop: (key, position) => { calls.moved.push({ key, x: position.x }); return true; },
  };
}

test('every cue the block can play is a cue somebody can record', () => {
  for (const cue of AMBIENCE_CUES) {
    assert.ok(MANIFEST_CUES.has(cue), `${cue} is not in assets/sfx/manifest.json`);
  }
});

test('the catalog is the call sites, and the call sites are the catalog', () => {
  /* Both directions. A cue played but not listed is a cue this test would not
   * be checking; a cue listed but not played is a cue somebody removed and
   * left a name behind for. */
  const played = [...SOURCE.matchAll(/\.play\(\s*'([^']+)'/g)].map((match) => match[1]);
  const looped = [...SOURCE.matchAll(/startLoop\([\s\S]{0,80}?name:\s*'([^']+)'/g)]
    .map((match) => match[1]);
  const referenced = new Set([...played, ...looped]);
  assert.ok(referenced.size >= 8, `only found ${referenced.size} cue call sites`);
  assert.deepEqual([...referenced].sort(), [...AMBIENCE_CUES].sort());
});

test('the cues it asks for are named, described, and honestly not in the manifest yet', () => {
  assert.ok(REQUESTED_CUES.length >= 1);
  for (const cue of REQUESTED_CUES) {
    assert.match(cue.name, /^[a-z][a-z0-9.]+$/);
    assert.ok(cue.prompt.length > 40, `${cue.name} needs a prompt somebody can render`);
    assert.ok(cue.duration > 0);
    assert.equal(
      AMBIENCE_CUES.includes(cue.name), false,
      `${cue.name} is being asked for AND played — play it or ask for it, not both`,
    );
  }
});

test('the beds come up as a wet street and an alley, and go down again', () => {
  const audio = fakeAudio();
  const ambience = createSpecialMeetingAmbience({ audio });
  ambience.start();
  assert.equal(audio.calls.loops.get('sm.street'), 'street.wet.night');
  assert.equal(audio.calls.loops.get('sm.alley'), 'ambience.alley');

  ambience.start();
  assert.equal(audio.calls.loops.size, 2, 'starting twice does not start twice');

  ambience.stop();
  assert.equal(audio.calls.loops.size, 0);
  for (const key of AMBIENCE_LOOPS) assert.ok(audio.calls.stopped.includes(key));
});

test('the engine is a loop that follows the car, not a clip restarted per frame', () => {
  const audio = fakeAudio();
  const ambience = createSpecialMeetingAmbience({ audio });
  ambience.start();
  assert.equal(ambience.engineIsRunning, false);

  ambience.engineStart(new THREE.Vector3(-44, 0.6, -34));
  assert.equal(ambience.engineIsRunning, true);
  assert.equal(audio.calls.played.at(-1).name, 'car.engine.start');
  assert.equal(audio.calls.loops.get('sm.sedan.engine'), 'car.engine.idle');

  const before = audio.calls.loops.size;
  for (let i = 0; i < 30; i++) ambience.followSedan(new THREE.Vector3(-40 + i, 0.6, -2));
  assert.equal(audio.calls.loops.size, before, 'nothing was restarted');
  assert.equal(audio.calls.moved.length, 30);
  assert.equal(audio.calls.moved.at(-1).x, -11);

  ambience.engineRev(new THREE.Vector3(-3, 0.6, -5));
  assert.equal(audio.calls.played.at(-1).name, 'car.engine.rev');
  ambience.doorShut();
  assert.equal(audio.calls.played.at(-1).name, 'car.door');

  ambience.engineOff();
  assert.equal(ambience.engineIsRunning, false);
  assert.equal(audio.calls.loops.has('sm.sedan.engine'), false);
});

test('somebody else drives past every few seconds, and it is never close', () => {
  const audio = fakeAudio();
  const ambience = createSpecialMeetingAmbience({ audio });
  ambience.start();
  for (let i = 0; i < 60 * 60; i++) ambience.update(1 / 60);

  const { passes, horns } = ambience.counts;
  assert.ok(passes >= 4 && passes <= 10, `a minute should be a handful of cars, saw ${passes}`);
  assert.ok(horns >= 1 && horns <= 3, `and about one horn, saw ${horns}`);

  const positioned = audio.calls.played.filter(({ name }) => (
    name === 'traffic.pass' || name === 'street.car.pass.wet' || name === 'street.horn.distant'
  ));
  assert.equal(positioned.length, passes + horns);
  for (const { name, options } of positioned) {
    const distance = Math.hypot(options.position.x - SPAWN.x, options.position.z - SPAWN.z);
    assert.ok(distance > 80, `${name} played ${distance.toFixed(0)}m away — that is on the block`);
    assert.ok(options.maxDist > 200, `${name} has to carry from out there`);
  }
});

test('the same seed is the same night', () => {
  const first = createSpecialMeetingAmbience({ audio: fakeAudio() });
  const second = createSpecialMeetingAmbience({ audio: fakeAudio() });
  first.start();
  second.start();
  for (let i = 0; i < 60 * 90; i++) {
    first.update(1 / 60);
    second.update(1 / 60);
  }
  assert.deepEqual(first.counts, second.counts);
});

test('ducking drops the beds and puts them back', () => {
  const audio = fakeAudio();
  const ambience = createSpecialMeetingAmbience({ audio });
  ambience.start();
  ambience.engineStart(new THREE.Vector3(0, 0, 0));
  ambience.duck(true);
  const ducked = Object.fromEntries(audio.calls.volumes.map(({ key, value }) => [key, value]));
  audio.calls.volumes.length = 0;
  ambience.duck(false);
  const restored = Object.fromEntries(audio.calls.volumes.map(({ key, value }) => [key, value]));
  for (const key of ['sm.street', 'sm.alley', 'sm.sedan.engine']) {
    assert.ok(ducked[key] < restored[key], `${key} was not ducked under the line`);
  }
});

test('the stage hands a scene a world, a spawn and one update', () => {
  const scene = new THREE.Scene();
  const audio = fakeAudio();
  const phases = [];
  const stage = stageSpecialMeeting(scene, { audio, onPhase: (phase) => phases.push(phase) });

  assert.equal(stage.spawn.position.x, SPAWN.x);
  assert.equal(stage.spawn.position.z, SPAWN.z);
  assert.ok(stage.spawn.position.y > SPAWN.groundY + 1.4, 'a standing eye, on the kerb');
  assert.equal(stage.spawn.yaw, SPAWN.yaw);
  assert.equal(stage.world.groundAt, groundAt);
  assert.ok(stage.world.colliders.length > 20);
  assert.ok(Array.isArray(stage.world.floorZones));
  assert.equal(stage.footstepSurface, 'street.wet');
  assert.ok(MANIFEST_CUES.has(`footstep.${stage.footstepSurface}`), 'the footstep cue exists');

  stage.begin();
  assert.equal(audio.calls.loops.get('sm.street'), 'street.wet.night');

  /* The car is a moving wall and its collider is refreshed in place, never
   * pushed and spliced — the broadphase buckets the list once. */
  const carBox = stage.world.colliders.at(-1);
  const wasAt = carBox.min.x;
  for (let i = 0; i < 60 * 30; i++) stage.update(1 / 60, stage.spawn.position);
  assert.equal(stage.world.colliders.at(-1), carBox, 'the collider list did not change identity');
  assert.notEqual(carBox.min.x, wasAt, 'and the box moved with the car');
  assert.ok(Math.abs(carBox.min.z - SIDEWALK.north.z0) < 2, 'the car ends up at the kerb');
  assert.ok(phases.includes('stopped'));

  stage.dispose();
  assert.equal(scene.children.includes(stage.block.group), false);
  assert.equal(scene.children.includes(stage.sedan.group), false);
});

test('the pavement is 15cm above the road and the layout agrees with itself', () => {
  assert.equal(groundAt(SPAWN.x, SPAWN.z), ROAD.kerbHeight);
  assert.equal(groundAt(0, 0), 0);
  assert.equal(groundAt(0, SIDEWALK.south.z1 - 0.5), ROAD.kerbHeight);
  assert.ok(ROAD.kerbHeight < 0.4, 'a kerb has to be steppable; STEP_HEIGHT is 0.40');
});
