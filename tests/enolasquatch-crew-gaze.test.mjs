/**
 * THE HEADS ROLL IN CIRCLES IN THE ENOLA SQUATCH.
 *
 * Owner playtest, 2026-08-24: *"Enola squatch — Capt Sasoles and Irish heads
 * are rolling around in circles when I look at them."*
 *
 * Four separate defects made that one complaint, and each gets its own test
 * here, phrased against the thing that was actually wrong rather than against a
 * number that happened to change:
 *
 *   1. RUNAWAY ACCUMULATION. `crew.update` layered the seated gaze pitch onto
 *      `neck.rotation.x` with `-=`, on the assumption that `updateFigure` had
 *      written that field absolutely. It only does so while a man is TALKING;
 *      silent, it damps toward zero relative to whatever it finds, leaving
 *      most of last frame's subtraction in place for the next one to add to.
 *      The recurrence converges on a gain of 1/(1 - e^(-6*dt)) — 5.5x at 30
 *      fps, 10.5x at 60, 20.5x at 144 — so the neck ended up several radians
 *      over, by an amount that DEPENDED ON FRAME RATE. That dependence is the
 *      signature, so this file asserts convergence at two different dt values
 *      and asserts that the two agree.
 *
 *   2. WORLD PITCH INSIDE A ROLLING PARENT. The gaze pitch was measured as a
 *      world-Y difference and applied as a local `neck.rotation.x` inside
 *      `aircraft.group`. The player's eye and a crewman's neck are both bolted
 *      to the airframe, so in aeroplane space their separation never changes;
 *      only the world-Y projection does, and it inverts with bank. That is the
 *      head nodding hard through every turn.
 *
 *   3. THE ANGLE WRAP WAS NOT A WRAP. `((want + PI) % (2*PI)) - PI` relies on
 *      `%` being a modulo. JavaScript's is a remainder that keeps the sign of
 *      the dividend, so every input at or below -PI came back unchanged and the
 *      clamp pinned it at the stop. The Shubenator sits at `rotation.y = PI`
 *      and wore it: head hard over, torso wrung after it, for half the circle
 *      around him — including for a target directly in front of his face.
 *
 *   4. NO CLAMP AT ALL, which is why one sign error was worth 250 degrees of
 *      neck rather than a stiff-looking pose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.min.js';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const [
  { EnolaSquatch },
  { createCrew },
  { wrapAngle, NECK_PITCH_MAX_DOWN, NECK_PITCH_MAX_UP },
] = await Promise.all([
  import('../src/enolasquatch/scenes/EnolaSquatch.js'),
  import('../src/enolasquatch/crew.js'),
  import('../src/beefrun/npc.js'),
]);

/**
 * A crew strapped into a fresh aeroplane, with the gaze state pinned so the
 * test is measuring the geometry and not the random look-away timer.
 *
 * `hold` is the countdown that flips a man between the player and his own
 * station; parking it a million seconds out keeps everybody on the player for
 * the whole run, which is the constant-target condition defect 1 needs.
 */
function seatedCrew() {
  const aircraft = new EnolaSquatch();
  const crew = createCrew();
  crew.takeSeats(aircraft);
  aircraft.group.updateMatrixWorld(true);
  for (const f of crew.all) {
    if (!f.gaze) continue;
    f.gaze.onPlayer = true;
    f.gaze.hold = 1e6;
    f.talk = 0;
  }
  return { aircraft, crew };
}

/** The player's eye, in world space, from the aeroplane's own authored anchor. */
function playerEye(aircraft) {
  aircraft.group.updateMatrixWorld(true);
  return aircraft.pilotEye.clone().applyMatrix4(aircraft.group.matrixWorld);
}

/**
 * Run the crew for `frames` at a fixed `dt` and report what the Captain's neck
 * pitch did — where it ended up, the worst excursion on the way, and how much
 * it still moved over the last second.
 */
function runSeatedGaze(frames, dt) {
  const { aircraft, crew } = seatedCrew();
  const eye = playerEye(aircraft);
  const tail = [];
  let peak = 0;
  for (let i = 0; i < frames; i += 1) {
    crew.update(dt, eye);
    peak = Math.max(peak, Math.abs(crew.sasole.neck.rotation.x));
    if (i >= frames - Math.round(1 / dt)) tail.push(crew.sasole.neck.rotation.x);
  }
  return {
    crew,
    aircraft,
    settled: crew.sasole.neck.rotation.x,
    wanted: crew.sasole.gaze.pitch,
    peak,
    drift: Math.max(...tail) - Math.min(...tail),
  };
}

/* ------------------------------------------------------------------ */
/* DEFECT 1 — the rolling                                              */
/* ------------------------------------------------------------------ */

test('a seated man\'s neck pitch converges instead of winding up, at any frame rate', () => {
  /* Two frame rates, because the whole tell of the accumulation bug is that the
   * answer depends on how often you ask. At 30 fps the old code settled at
   * 5.5x the requested pitch and at 144 fps at 20.5x — roughly 2.9 rad and
   * 10.8 rad against a request of about 0.53. A correct absolute write lands on
   * exactly the requested pitch at both. */
  const slow = runSeatedGaze(1800, 1 / 30);
  const fast = runSeatedGaze(1800, 1 / 144);

  for (const [label, run] of [['30 fps', slow], ['144 fps', fast]]) {
    // The neck ends up at exactly minus the gaze pitch: negative rotation.x
    // looks UP, and the player's eye is above a seated man's.
    assert.ok(
      Math.abs(run.settled + run.wanted) < 0.01,
      `at ${label} the neck settled at ${run.settled.toFixed(3)} rad for a gaze pitch of `
      + `${run.wanted.toFixed(3)} — that is a gain of `
      + `${(run.settled / -run.wanted).toFixed(1)}x, not a look`,
    );
    // It converged rather than crept: no movement left over the last second.
    assert.ok(
      run.drift < 1e-4,
      `at ${label} the neck is still moving ${run.drift.toFixed(5)} rad per second after `
      + '30 seconds of a completely stationary target — it has not converged',
    );
    // And it never overshot on the way there, so this is not a settled
    // oscillation that happens to be caught at the right phase.
    assert.ok(
      run.peak < 0.75,
      `at ${label} the neck reached ${run.peak.toFixed(3)} rad at its worst against a `
      + `request of ${run.wanted.toFixed(3)}`,
    );
  }

  /* The frame-rate independence itself, stated outright. The old code differed
   * by about 8 radians between these two rates. */
  assert.ok(
    Math.abs(slow.settled - fast.settled) < 0.01,
    `the same held gaze produces ${slow.settled.toFixed(3)} rad at 30 fps and `
    + `${fast.settled.toFixed(3)} rad at 144 — a neck angle must not depend on frame rate`,
  );
});

test('the seated gaze pitch is an absolute write, so nothing survives a frame', () => {
  /* Direct statement of the mechanism rather than of the symptom: drop a large
   * bogus angle into `neck.rotation.x` behind the rig's back and it must be
   * gone entirely on the very next frame, not damped away over several. A `-=`
   * layered on a relative damp cannot pass this. */
  const { aircraft, crew } = seatedCrew();
  const eye = playerEye(aircraft);
  for (let i = 0; i < 240; i += 1) crew.update(1 / 60, eye);
  const settled = crew.sasole.neck.rotation.x;

  crew.sasole.neck.rotation.x = 3.0;
  crew.update(1 / 60, eye);
  assert.ok(
    Math.abs(crew.sasole.neck.rotation.x - settled) < 1e-6,
    'a value written into neck.rotation.x between frames survived into the next one — '
    + 'the gaze pitch is still being accumulated rather than composed',
  );
});

/* ------------------------------------------------------------------ */
/* DEFECT 2 — world pitch inside a rolling parent                      */
/* ------------------------------------------------------------------ */

test('a seated look does not nod through a turn', () => {
  /* The player and the crewman are bolted to the same airframe. Bank it hard
   * and pitch it, put the player's eye where the aeroplane's own anchor says it
   * is, and the neck angle must not move: nothing in the cockpit has moved
   * relative to anything else in it.
   *
   * The old world-Y measurement gave a full up-look wings level, nothing at 90
   * degrees of bank, and a down-look past that. */
  const attitudes = [
    [0, 0, 0],
    [0, 0, 1.0],
    [0, 0, -1.0],
    [0.4, 0, 0.7],
    [-0.35, 1.2, -0.9],
  ];
  const settled = [];
  for (const [x, y, z] of attitudes) {
    const { aircraft, crew } = seatedCrew();
    aircraft.group.rotation.set(x, y, z);
    aircraft.group.position.set(120, 800, -340);
    aircraft.group.updateMatrixWorld(true);
    const eye = playerEye(aircraft);
    for (let i = 0; i < 600; i += 1) crew.update(1 / 60, eye);
    settled.push(crew.sasole.neck.rotation.x);
  }
  const spread = Math.max(...settled) - Math.min(...settled);
  assert.ok(
    spread < 0.01,
    `Captain Sasole's neck pitch swings ${spread.toFixed(3)} rad across the flight envelope `
    + `(${settled.map((v) => v.toFixed(3)).join(', ')}) for a player who has not moved `
    + 'a millimetre relative to him',
  );
});

test('the seated gaze reaches the man in the other seat', () => {
  /* The end-to-end statement: not "the pitch is right" but "the face points at
   * the man", which is the only thing the owner can see.
   *
   * The measured geometry: Sasole's neck joint is at aeroplane y 0.78 and the
   * pilot's eye at 1.42, 1.10 m away horizontally — atan2(0.64, 1.10) = 0.526
   * rad, 30.1 degrees. The ceiling used to be 0.42 rad, six degrees short, so
   * he looked at the player's collar.
   *
   * Getting the pitch right on its own still left him 18.1 degrees under the
   * eye, because the two Euler angles composed in the default 'XYZ' order —
   * turn the head, THEN tip the turned head about the torso's fixed axis —
   * which delivers only cos(yaw) of every degree of pitch. `sit()` puts the
   * seated necks on 'YXZ' so the nod happens about the head's own axis and the
   * turn about the spine. Under a degree is the whole point; anything else
   * means one of the three has come back. */
  const { aircraft, crew } = seatedCrew();
  const eye = playerEye(aircraft);
  for (let i = 0; i < 600; i += 1) crew.update(1 / 60, eye);

  crew.sasole.neck.updateWorldMatrix(true, false);
  const neckAt = crew.sasole.neck.getWorldPosition(new THREE.Vector3());
  const facing = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(crew.sasole.neck.getWorldQuaternion(new THREE.Quaternion()));
  const toPlayer = eye.clone().sub(neckAt).normalize();
  const offDegrees = (Math.acos(Math.max(-1, Math.min(1, facing.dot(toPlayer)))) * 180) / Math.PI;
  assert.ok(offDegrees < 1,
    `Sasole is looking ${offDegrees.toFixed(1)} degrees away from the man beside him`);
});

/* ------------------------------------------------------------------ */
/* DEFECT 3 — the wrap                                                 */
/* ------------------------------------------------------------------ */

test('wrapAngle folds any angle into (-PI, PI]', () => {
  const TWO_PI = Math.PI * 2;
  /* Right across three turns each way, which is well past anything
   * `atan2(dx, dz) - rotation.y` can produce, plus the exact multiples of PI
   * where a remainder-based expression changes its mind. */
  const inputs = [];
  for (let a = -3 * Math.PI; a <= 3 * Math.PI; a += Math.PI / 360) inputs.push(a);
  for (const k of [-3, -2, -1, 0, 1, 2, 3]) {
    inputs.push(k * Math.PI, k * Math.PI + 1e-12, k * Math.PI - 1e-12);
    inputs.push(k * TWO_PI);
  }

  for (const a of inputs) {
    const w = wrapAngle(a);
    assert.ok(
      w > -Math.PI - 1e-12 && w <= Math.PI + 1e-12,
      `wrapAngle(${a.toFixed(6)}) returned ${w.toFixed(6)}, which is outside (-PI, PI]`,
    );
    // And it is the SAME angle, not merely an in-range one.
    const turns = (a - w) / TWO_PI;
    assert.ok(
      Math.abs(turns - Math.round(turns)) < 1e-9,
      `wrapAngle(${a.toFixed(6)}) returned ${w.toFixed(6)}, which is not the same direction`,
    );
  }

  /* The specific inputs the old expression got wrong: anything at or below -PI
   * came straight back out unchanged, because JavaScript's `%` keeps the sign
   * of the dividend. */
  for (const a of [-Math.PI - 0.1, -4, -5, -TWO_PI, -TWO_PI - 0.5]) {
    const broken = ((a + Math.PI) % TWO_PI) - Math.PI;
    assert.equal(broken <= -Math.PI, true, 'the old expression is no longer the broken one');
    assert.ok(wrapAngle(a) > -Math.PI, `wrapAngle(${a}) still returns an unwrapped angle`);
  }
  // A man facing exactly backwards, asked to look straight ahead of himself.
  assert.ok(Math.abs(wrapAngle(-TWO_PI)) < 1e-12,
    'a full turn either way has to reduce to no turn at all');
});

test('the Shubenator, seated facing aft, looks at what is in front of him', () => {
  /* He sits at `rotation.y = PI`, so `want = atan2(dx, dz) - PI` runs down
   * toward -2PI for everything on one side of him. Under the old expression
   * that came back below -PI and the clamp pinned his neck at -1.35 rad and his
   * torso at -0.5 — head welded hard over, torso wrung after it — for targets
   * that were only a few degrees off his nose. */
  const { aircraft, crew } = seatedCrew();
  const mount = crew.shubes.group.parent;
  aircraft.group.updateMatrixWorld(true);

  /* Just off his nose, on the side that used to go the wrong way round: aft is
   * -Z in the turret's own frame, and the small +/-X offset is what pushed
   * `atan2` over the boundary. */
  for (const side of [-0.5, 0.5]) {
    const eye = mount.localToWorld(new THREE.Vector3(side, 0.9, -5));
    crew.shubes.gaze.onPlayer = true;
    crew.shubes.gaze.hold = 1e6;
    for (let i = 0; i < 600; i += 1) {
      crew.shubes.gaze.hold = 1e6;
      crew.update(1 / 60, eye);
    }
    assert.ok(
      Math.abs(crew.shubes.neck.rotation.y) < 0.2,
      `a target ${Math.abs(side)} m off the Shubenator's nose turned his neck `
      + `${crew.shubes.neck.rotation.y.toFixed(3)} rad — he is looking over his shoulder at `
      + 'something directly in front of him',
    );
    assert.ok(
      Math.abs(crew.shubes.hips.rotation.y) < 0.1,
      `and his torso is wrung ${crew.shubes.hips.rotation.y.toFixed(3)} rad after it`,
    );
  }
});

/* ------------------------------------------------------------------ */
/* DEFECT 4 — the clamp                                                */
/* ------------------------------------------------------------------ */

test('a seated neck cannot leave its own anatomy however bad the arithmetic gets', () => {
  const { crew } = seatedCrew();
  /* No camera position, so `aimGaze` does not run and the pitch stays exactly
   * as planted here. This is the shape of the original defect — a pitch far
   * larger than any real look — with the accumulation taken out of it. */
  crew.sasole.gaze.pitch = 12;
  crew.update(1 / 60);
  assert.equal(crew.sasole.neck.rotation.x, NECK_PITCH_MAX_UP,
    'a 12 rad up-look was not clamped to the neck\'s extension limit');

  crew.sasole.gaze.pitch = -12;
  crew.update(1 / 60);
  assert.equal(crew.sasole.neck.rotation.x, NECK_PITCH_MAX_DOWN,
    'a 12 rad down-look was not clamped to the neck\'s flexion limit');

  /* And the limits are the human ones, not whatever happened to be convenient:
   * about 60 degrees of extension and 50 of flexion. */
  assert.ok(NECK_PITCH_MAX_UP > -1.2 && NECK_PITCH_MAX_UP < -0.9,
    'the neck extension limit has drifted away from clinical cervical range of motion');
  assert.ok(NECK_PITCH_MAX_DOWN > 0.7 && NECK_PITCH_MAX_DOWN < 1.0,
    'the neck flexion limit has drifted away from clinical cervical range of motion');
});
