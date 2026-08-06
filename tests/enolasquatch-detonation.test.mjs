/**
 * The Fat Squatch going off, as the player meets it.
 *
 * `tests/enolasquatch-combat.test.mjs` covers the CURVES — the double flash,
 * the whiteout, how fast the front travels, how solid the shell is. This file
 * runs the actual `Detonation` and looks at what is on the screen, because
 * every fault it is written to catch is a fault in the relationship between a
 * curve and a mesh:
 *
 *   THE FRONT PASSING OVER YOU. Owner: "I want a shock wave to pass you ...
 *     it needs to be visible as it passes over you that way the player doesn't
 *     miss it." So the shell must actually reach the camera, `shockWash` must
 *     peak as it does, and the bubble must be big enough at that moment to
 *     have the camera INSIDE it. A shell that is drawn but never grows past
 *     the player is a shockwave the player watches happen to somebody else.
 *
 *   THE CLOUD STAYING. Owner: "I also want a giant classic mushroom cloud to
 *     linger over the crater." The previous version faded the cap out between
 *     twenty-three and thirty-one seconds and disposed the whole group at
 *     thirty, which meant a player who flew the escape properly and looked
 *     back found an empty sky. So this asserts the column is still on screen
 *     at a minute, at five minutes, and at ten.
 *
 * The event is driven the way the mission drives it -- `fire()` then `update()`
 * in real steps -- rather than by setting `t` and reading a mesh, so anything
 * that only works when the clock is scrubbed fails here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureThreeShim, ensureDomShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const THREE = await import('three');
const { Detonation, BLAST, shockRadiusAt } = await import('../src/enolasquatch/vfx/Detonation.js');

const GROUND_ZERO = new THREE.Vector3(9000, 0, 0);

/**
 * Fire one, with a camera standing `range` metres away, and step it in real
 * frames to `seconds`. `onFrame` sees every frame, which is how the sweep is
 * caught -- it is about a second wide and a sampled peak would be luck.
 */
function detonate(range, seconds, onFrame = null, step = 1 / 60) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(GROUND_ZERO.x - range, 400, 0);
  const det = new Detonation(scene, { camera });
  det.fire(GROUND_ZERO);
  for (let t = 0; t < seconds; t += step) {
    det.update(step);
    onFrame?.(det);
  }
  return det;
}

/* ------------------------------------------------------------------ */
/* The front reaching the player                                       */
/* ------------------------------------------------------------------ */

test('the shock front actually reaches the player, and sweeps him when it does', () => {
  const range = 2000;
  let peak = 0;
  let peakRadius = 0;
  let washFrames = 0;
  const det = detonate(range, 12, (d) => {
    if (d.shockWash > peak) { peak = d.shockWash; peakRadius = d.shockRadius; }
    if (d.shockWash > 0.05) washFrames += 1;
  });

  assert.ok(det.shockPassed, 'the front never overtook the player at two kilometres');
  assert.ok(peak > 0.9, `the sweep only reached ${peak.toFixed(2)} — the player will miss it`);
  assert.ok(Math.abs(peakRadius - range) < BLAST.passWidth * 0.35,
    `the sweep peaked at ${Math.round(peakRadius)}m for a player at ${range}m`);
  /* And it is an EVENT rather than a tint that is simply on: about a second of
   * frames, not four, and not two. */
  assert.ok(washFrames > 20 && washFrames < 180,
    `the sweep lasted ${(washFrames / 60).toFixed(2)}s`);
});

test('the bubble ends up with the player inside it — that is what "passes over you" is', () => {
  const range = 2000;
  const det = detonate(range, 12);
  /* The bubble is a `DoubleSide` sphere on the shock radius. Once the radius
   * is past the camera the camera is inside the geometry and sees the far wall
   * in every direction, which is the whole effect. Nothing fades it in. */
  assert.ok(det.vfx.bubble.scale.x > range,
    'the bubble never grew past the player, so it never went over him');
  assert.ok(det.vfx.bubble.material.side === THREE.DoubleSide,
    'a single-sided bubble is invisible from inside — the pass would be a blink');
});

test('the front ring is dropped once it is behind you, rather than left hanging', () => {
  const range = 1200;
  let visibleWellPast = 0;
  detonate(range, 14, (d) => {
    // Well past: more than a full pass-width beyond the player.
    if (d.shockRadius > range + BLAST.passWidth * 1.5 && d.vfx.shellRing.visible) {
      visibleWellPast += 1;
    }
  });
  assert.equal(visibleWellPast, 0,
    'the silhouette ring is still being drawn after the front went past — from '
    + 'inside the shell there is no silhouette, so that reads as a disc in the sky');
});

test('a player who runs is swept later than a player who does not', () => {
  /* The payoff of the break turn. Two identical detonations, two ranges: the
   * far one has to be crossed measurably later, or the seconds the player
   * spends flying away bought him nothing. */
  const near = [];
  const far = [];
  detonate(900, 14, (d) => { if (d.shockPassed && !near.length) near.push(d.t); });
  detonate(3200, 14, (d) => { if (d.shockPassed && !far.length) far.push(d.t); });
  assert.ok(near.length && far.length, 'one of the two was never reached at all');
  assert.ok(far[0] > near[0] + 2,
    `2.3km of running bought ${(far[0] - near[0]).toFixed(1)}s`);
});

/* ------------------------------------------------------------------ */
/* The cloud that stays                                                */
/* ------------------------------------------------------------------ */

test('the mushroom cloud is still standing over the crater a long time afterwards', () => {
  /* Stepped coarsely on purpose past the active event: the linger path is
   * meant to be cheap and frame-rate-independent, and if it needs sixty steps
   * a second to hold a stationary cloud in the sky it is doing too much. */
  const det = detonate(3000, BLAST.duration + 2);
  assert.ok(det.lingering, 'the event never settled');

  const stillThere = (label) => {
    assert.ok(det.vfx.cap.material.opacity > 0.2,
      `${label}: the cap has faded to ${det.vfx.cap.material.opacity.toFixed(2)}`);
    assert.ok(det.vfx.stem.material.opacity > 0.15,
      `${label}: the column has faded to ${det.vfx.stem.material.opacity.toFixed(2)}`);
    assert.ok(det.vfx.cap.scale.x > BLAST.capRadius * 0.9,
      `${label}: the cap shrank to ${Math.round(det.vfx.cap.scale.x)}m`);
    assert.ok(det.vfx.cap.position.y > BLAST.stemTop * 0.9,
      `${label}: the cap sank to ${Math.round(det.vfx.cap.position.y)}m`);
    assert.ok(!det.done, `${label}: the whole thing was disposed`);
  };

  for (let i = 0; i < 60; i++) det.update(0.5);      // one minute
  stillThere('a minute later');
  for (let i = 0; i < 240; i++) det.update(1);       // five minutes
  stillThere('five minutes later');
  for (let i = 0; i < 300; i++) det.update(1);       // ten
  stillThere('ten minutes later');

  // And the scar is still on the ground under it.
  assert.ok(det.vfx.scorch.material.opacity > 0.3, 'the crater stopped being black');
});

test('the cloud drifts and spreads instead of standing perfectly still', () => {
  const det = detonate(3000, BLAST.duration + 2);
  const x0 = det.vfx.cap.position.x;
  const r0 = det.vfx.cap.scale.x;
  const roll0 = det.vfx.capRoll.rotation.z;
  for (let i = 0; i < 200; i++) det.update(0.5);
  assert.ok(det.vfx.cap.position.x > x0 + 100, 'the cap is not drifting downwind at all');
  assert.ok(det.vfx.cap.scale.x > r0, 'the cap has stopped spreading');
  assert.ok(det.vfx.capRoll.rotation.z > roll0, 'the roll inside the cap has stopped turning');
  // The stem leans after its head, rather than staying a vertical pipe.
  assert.ok(Math.abs(det.vfx.stem.rotation.z) > 0.02, 'the column is not leaning with it');
});

test('settling switches the transient half of the event off rather than paying for it', () => {
  const det = detonate(3000, BLAST.duration + 2);
  for (const [name, o] of [
    ['flash', det.vfx.flash], ['wilson', det.vfx.wilson], ['bubble', det.vfx.bubble],
    ['shellRing', det.vfx.shellRing], ['front', det.vfx.front], ['dustRing', det.vfx.dustRing],
    ['surge', det.vfx.surge], ['skirt', det.vfx.skirt], ['gag', det.vfx.gag],
  ]) {
    assert.equal(o.visible, false, `${name} is still being drawn half a minute in`);
  }
  for (const ball of det.vfx.fire) assert.equal(ball.visible, false, 'a fireball shell survived');
  for (const bit of det.vfx.debris) assert.equal(bit.visible, false, 'debris is still in flight');
  assert.equal(det.vfx.light.intensity, 0, 'the flash light is still burning');
  assert.equal(det.vfx.afterglow.intensity, 0, 'the afterglow never went out');
  assert.equal(det.screenFlash, 0, 'the screen is still white half a minute later');
  assert.equal(det.shockWash, 0, 'the sweep never ended');
});

/* ------------------------------------------------------------------ */

test('the whole event survives being ticked at a terrible frame rate', () => {
  /* A browser tab that has been in the background delivers enormous steps.
   * The front must not skip the player -- `shockPassed` is a >= test against a
   * radius, not a window, exactly so that it cannot. */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(GROUND_ZERO.x - 1800, 400, 0);
  const det = new Detonation(scene, { camera });
  det.fire(GROUND_ZERO);
  let sawWash = 0;
  for (let i = 0; i < 20; i++) { det.update(0.75); sawWash = Math.max(sawWash, det.shockWash); }
  assert.ok(det.shockPassed, 'the front jumped straight over the player between frames');
  assert.ok(det.shockRadius >= shockRadiusAt(15) - 1, 'the front lost ground to the step size');
  /* And he SAW it. At three-quarters of a second a step the front covers 260 m
   * and a sweep measured only against the instantaneous radius would be
   * stepped clean over -- which is precisely the "the player doesn't miss it"
   * failure. `BLAST.washDecay` is what makes this hold. */
  assert.ok(sawWash > 0.2, `the sweep never showed at all (peaked at ${sawWash.toFixed(3)})`);
});

test('disposing frees only what the detonation made', () => {
  /* The debris are built from the project's SHARED geometry and material
   * caches, and freeing those takes them away from every other object still
   * drawing with them. Only tagged materials are ours. */
  const det = detonate(2000, 3);
  const shared = det.vfx.debris[0].material;
  const owned = det.vfx.bubble.material;
  det.dispose();
  assert.equal(owned.userData.detonationOwned, true);
  assert.ok(!shared.userData?.detonationOwned,
    'a shared material got tagged, which means dispose() will eventually free it');
  assert.equal(det.vfx, null);
  assert.equal(det.live, false);
  assert.equal(det.screenFlash, 0);
});
