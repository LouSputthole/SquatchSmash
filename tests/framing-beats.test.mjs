/**
 * THE SHOT LISTS, AND WHETHER THEY ARE STILL TRUE.
 *
 * `docs/FRAMING-GATE.md` shipped with the arithmetic finished, under test, and
 * pointed at nothing: no scene published a shot list, so `npm run verify:framing`
 * measured the empty set and said "clean". THE SPECIAL MEETING and THE TAKE are
 * the first two to opt in — `src/specialmeeting/shots.js` and
 * `src/heist/shots.js` — and this file is the cheap half of holding them to it.
 *
 * The gate itself is the expensive half: it rides the geometry adapters, builds
 * ninety-eight scene states and drives a kilometre of forest road to reach one
 * of them. That belongs in `verify:framing`. What belongs here is the part that
 * runs in a second and would have caught every fault this pass found:
 *
 *   - a body whose actor marker lies about where its own head is;
 *   - a shot list that has quietly stopped being published;
 *   - a camera turned so that the people talking to it are behind it.
 *
 * Every check that asserts something is CLEAN is paired with a deliberate
 * break, because a check that only ever sees a passing scene cannot tell you
 * whether it is looking.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

/* Both scenes bake canvas textures while they build -- the Special Meeting's
 * night sky is the first thing `applySpecialMeetingNight` reaches for -- so
 * the shims go in before anything below is asked to build. `tests/run.mjs`
 * installs them for the whole suite; these two calls are what makes
 * `node --test tests/framing-beats.test.mjs` work on its own. */
ensureThreeShim();
ensureDomShim();

const THREE = await import('three');

import { collectActors } from '../src/core/staging.js';
import { framingFindings } from '../tools/framing-gate.mjs';

import { buildHeistCrew } from '../src/heist/cast.js';
import { buildHeistLevel } from '../src/heist/level.js';
import { HeistFigure } from '../src/heist/people.js';
import { stageHeistCheckpointGeometry } from '../src/heist/preview.js';

import { buildSpecialMeetingCast } from '../src/specialmeeting/cast.js';
import { groundAt } from '../src/specialmeeting/layout.js';
import { buildSpecialMeetingRuntimeGeometry } from '../src/specialmeeting/runtime-geometry.js';
import { exitYaw } from '../src/specialmeeting/forest/passenger.js';

/** Every beat a built root is publishing, in traversal order. */
function publishedBeats(root) {
  const beats = [];
  root.traverse((object) => {
    const beat = object.userData?.framingBeat;
    if (beat) beats.push(beat);
  });
  return beats;
}

/**
 * The gate wants plain boxes; the scenes hold `Box3`s.
 *
 * Only the `Box3`s, deliberately: the full normalisation across all four
 * spellings the scenes author collision in lives in
 * `tools/verify-geometry-worker.mjs`, and importing the worker to run a unit
 * test would drag the whole geometry harness in behind it. The gate run is
 * authoritative about occlusion; this is here so the frustum answers below are
 * asked against a scene that still has walls in it.
 */
function boxesOf(colliders) {
  return (colliders ?? [])
    .filter((box) => box?.isBox3)
    .map((box, index) => ({
      name: `collider-${index}`,
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    }));
}

const kinds = (findings) => findings.map((f) => f.kind);

test('every marked body carries its own eye height, not the old rig\'s', () => {
  /* THE FAULT THIS IS HERE FOR. `markActor` defaults to an eye at 2.30 m,
   * which is `src/core/person.js` -- the Sasquatch Smash rig the owner's
   * "Everyone is giant" note got rid of. Both these scenes are built on
   * `makePerson` at 1.78 m, and until this pass every body in both of them
   * told the staging and framing gates its eyes were at 2.300 while the top of
   * its skull was between 1.60 and 1.96. Every ray both gates cast started in
   * the air above the head it was supposed to come out of. */
  for (const height of [1.6, 1.78, 1.95]) {
    const figure = new HeistFigure({ name: `probe-${height}`, model: { height } });
    const marked = figure.root.userData.actor;
    const bounds = new THREE.Box3().setFromObject(figure.root);
    assert.ok(
      marked.eyeHeight < bounds.max.y,
      `a ${height} m body claims an eye at ${marked.eyeHeight.toFixed(3)} `
      + `with the top of its head at ${bounds.max.y.toFixed(3)}`,
    );
    assert.ok(
      marked.eyeHeight > bounds.max.y - 0.35,
      `a ${height} m body claims an eye at ${marked.eyeHeight.toFixed(3)}, `
      + `which is more than 35 cm below the top of its head at ${bounds.max.y.toFixed(3)}`,
    );
    assert.ok(marked.hipHeight > 0.5 && marked.hipHeight < marked.eyeHeight);
  }

  const scene = new THREE.Scene();
  const cast = buildSpecialMeetingCast(scene, { groundAt });
  for (const npc of cast.all) {
    npc.group.visible = true;
    const marked = npc.group.userData.actor;
    const bounds = new THREE.Box3().setFromObject(npc.group);
    assert.ok(
      marked.eyeHeight < bounds.max.y - npc.group.position.y,
      `${marked.id} claims an eye at ${marked.eyeHeight.toFixed(3)} above its feet `
      + `with the top of its head ${(bounds.max.y - npc.group.position.y).toFixed(3)} up`,
    );
  }
});

test('THE TAKE publishes a shot list, and the guard is in the shot named after him', () => {
  const scene = new THREE.Scene();
  const level = buildHeistLevel(scene);
  const crew = buildHeistCrew(level.phases.safehouse.group);
  const staged = stageHeistCheckpointGeometry('bank_lobby', { level, crew });
  const phase = level.phases[staged.phase];
  phase.group.updateMatrixWorld(true);

  const beats = publishedBeats(phase.group);
  assert.ok(beats.length >= 5, `the bank published ${beats.length} beats`);
  assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'beat ids must be unique');
  for (const beat of beats) {
    assert.ok(Array.isArray(beat.camera?.position), `${beat.id} has no camera`);
    assert.ok(Array.isArray(beat.camera?.lookAt), `${beat.id} aims at nothing`);
  }
  const guardShot = beats.find((b) => b.id === 'mark:bank_guard');
  assert.ok(guardShot, 'the mark that exists to hold the guard on screen must be published');
  assert.equal(guardShot.speaker, 'bank-guard');

  const actors = collectActors(phase.group, THREE);
  const boxes = boxesOf(phase.colliders);
  const clean = framingFindings({ id: 'bank', beats, actors, boxes });
  assert.deepEqual(clean.findings, [], `the bank's own shot list should be clean:\n${
    clean.findings.map((f) => `${f.kind} ${f.beat} ${JSON.stringify(f)}`).join('\n')}`);

  /* AND THE TEETH, in two goes, because the two findings answer two questions.
   *
   * Six metres across the lobby is roughly what the 2026-08-20 playtest pass
   * did to this guard, and the mark's own comment claims its yaw was derived
   * to point at him. The aim has to notice; the FRAME does not, and should not
   * -- a 72-degree lens is nine and a half metres wide at his range and he is
   * still in the picture, which is exactly why `docs/FRAMING-GATE.md` keeps
   * `CAMERA_AIM_MISS` and `SPEAKER_OFF_CAMERA` as separate findings. */
  const guard = phase.group.getObjectByName('bank-guard');
  const home = guard.position.clone();
  guard.position.x += 6;
  phase.group.updateMatrixWorld(true);
  const moved = framingFindings({
    id: 'bank', beats, actors: collectActors(phase.group, THREE), boxes,
  });
  assert.ok(kinds(moved.findings).includes('CAMERA_AIM_MISS'), 'a guard who moved must fail the aim');

  /* And behind the doors, which is the Initiation's own bug in a bank: the
   * shot holds steady on the spot he used to stand on while he says his line
   * over the player's shoulder. */
  guard.position.copy(home).z += 7.6;
  phase.group.updateMatrixWorld(true);
  const behind = framingFindings({
    id: 'bank', beats, actors: collectActors(phase.group, THREE), boxes,
  });
  const off = behind.findings.filter((f) => f.kind === 'SPEAKER_OFF_CAMERA');
  assert.equal(off.length, 1);
  assert.equal(off[0].speaker, 'bank-guard');
  assert.equal(off[0].reason, 'behind');
});

test('the Special Meeting holds both men on the pavement in the shot it gives him', () => {
  const scene = new THREE.Scene();
  const runtime = buildSpecialMeetingRuntimeGeometry(scene, { state: 'arrived' });
  const cast = buildSpecialMeetingCast(scene, {
    sedan: runtime.sedan, colliders: [...runtime.colliders], groundAt,
  });
  cast.boardForArrival();
  cast.disembarkForPickup();
  cast.holdTheFrontDoor();
  scene.updateMatrixWorld(true);

  const beats = publishedBeats(scene);
  const named = beats.filter((b) => b.speaker).map((b) => b.speaker).sort();
  assert.deepEqual(named, ['Lag', 'Numbskull'],
    'the two men on their feet on the pavement are the two the shot is held to');

  const actors = collectActors(scene, THREE);
  const boxes = boxesOf([...runtime.colliders]);
  const clean = framingFindings({ id: 'kerb', beats, actors, boxes });
  assert.deepEqual(clean.findings, [], `the kerb's shot list should be clean:\n${
    clean.findings.map((f) => `${f.kind} ${f.beat} ${JSON.stringify(f)}`).join('\n')}`);

  /* AND THE TEETH. Lag stands `STEP_CLEAR_M` up the pavement so Numbskull can
   * get at the door, and he is already 92% of the way to the edge of the
   * frame. Another 1.5 m and the man saying "Nice out" is off the side of the
   * picture while he says it. */
  const lag = cast.byKey('lag');
  lag.group.position.x += 1.5;
  scene.updateMatrixWorld(true);
  const pushed = framingFindings({
    id: 'kerb', beats, actors: collectActors(scene, THREE), boxes,
  });
  const off = pushed.findings.filter((f) => f.kind === 'SPEAKER_OFF_CAMERA');
  assert.equal(off.length, 1, 'exactly the man who moved should leave the frame');
  assert.equal(off[0].speaker, 'Lag');
  assert.equal(off[0].reason, 'right');
});

test('getting out at the spur turns him AT the car, not along it', () => {
  /* The incident, in one assertion. `PassengerRig.leave()` used to hand him
   * `#forwardYaw()` -- the car's nose -- and the framing gate measured what
   * that costs: at SM-400 all four of the people about to talk to him were
   * behind the camera, Kittenboss by 3.85 m. `cast.js` had already learned the
   * same lesson for the bodies; the player was the one nobody turned round. */
  const group = new THREE.Group();
  group.rotation.y = 0.7;
  group.position.set(10, 0, -4);
  group.updateMatrixWorld(true);
  const car = { group, length: 5.6 };
  /* Where `exitWorld` leaves him: beside the car, on its passenger flank. */
  const standing = group.localToWorld(new THREE.Vector3(1.4, 1.66, -1.6));

  const turned = exitYaw(car, standing);
  const nose = group.rotation.y + Math.PI * 1.5;
  const between = Math.abs(Math.atan2(Math.sin(turned - nose), Math.cos(turned - nose)));
  assert.ok(between > 2, `the exit heading is ${between.toFixed(3)} rad off the nose; `
    + 'it has gone back to looking down the track');

  /* And it is genuinely on the back half of the car: the point it looks at has
   * to be behind the middle in the car's own frame. */
  const looked = new THREE.Vector3(
    standing.x - Math.sin(turned) * 4, standing.y, standing.z - Math.cos(turned) * 4,
  );
  const local = group.worldToLocal(looked.clone());
  assert.ok(local.x < 0, `the exit shot looks at car-local x ${local.x.toFixed(3)}, `
    + 'which is in front of the middle rather than behind it');
});
