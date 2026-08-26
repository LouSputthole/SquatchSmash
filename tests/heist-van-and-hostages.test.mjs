import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ensureDomShim, ensureThreeShim } from '../tools/three-shim.mjs';

ensureThreeShim();
ensureDomShim();

const { BANK_ENTRY_POINT, buildHeistLevel } = await import('../src/heist/level.js');
const { POSE_FLOOR_CONTACT_M } = await import('../src/heist/people.js');

/**
 * OWNER PLAYTEST #57 — THE BANK APPROACH AND THE LOBBY.
 *
 * Three staging faults, all of them arithmetic somebody wrote down instead of
 * measuring, and all three measured here against the built scene rather than
 * against the numbers in the source that caused them.
 *
 *   1. The van's rear doors were two meshes with the hinge hardware 0.12 m
 *      inboard of the edge it was pivoting, no pivot at all, and a rear wall
 *      inside the van 0.92 m narrower than the hole it was hung in.
 *   2. The lobby guard stood on the door with his back to it, 114.86 degrees
 *      off the point the crew walk in on.
 *   3. Every hostage the alarm pose touched was driven a foot under the
 *      marble by a root drop of `-0.3 * scale` that nothing had measured.
 */

const DEG = 180 / Math.PI;
const level = () => buildHeistLevel(new THREE.Scene());
const worldBox = (object) => {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
};

/** Overlap depth of two AABBs along their shallowest shared axis, or 0. */
function overlapDepth(a, b) {
  const x = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const y = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
  const z = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  return (x > 0 && y > 0 && z > 0) ? Math.min(x, y, z) : 0;
}

/* ------------------------------------------------------------------ *
 * 1. THE VAN
 * ------------------------------------------------------------------ */

/**
 * A leaf is hinged at its OUTER edge or it is not hinged.
 *
 * Measured on the shipped van, in van-local metres: leaf |x| 0.020-1.250,
 * hinge barrels |x| 1.090-1.170. The barrels were 0.12 m inboard of the leaf
 * edge — a hinge through the middle of a door panel — so the leaf could not
 * turn about them without the outboard 0.12 m entering the body.
 */
test('the van rear doors are hinged on their outer edges', () => {
  const built = level();
  const safehouse = built.phases.safehouse;
  safehouse.group.updateMatrixWorld(true);
  const van = safehouse.group.getObjectByName('primary-van');
  assert.ok(van, 'the primary van is missing');
  // Shut, because the hinge line is a claim about where the leaf is hung and
  // the bay leaves them standing open.
  van.userData.setRearDoorsOpen(false);
  safehouse.group.updateMatrixWorld(true);

  for (const label of ['left', 'right']) {
    const hinge = van.getObjectByName(`primary-van-rear-door-hinge-${label}`);
    assert.ok(hinge, `${label} leaf has no hinge group to turn about`);
    const leaf = van.getObjectByName(`primary-van-rear-door-${label}`);
    assert.ok(leaf, `${label} leaf is missing`);
    assert.equal(leaf.parent, hinge,
      `${label} leaf is parented to the van body, so nothing can swing it`);

    // The pivot has to be ON the leaf's outer edge, not inside the panel.
    const leafBox = worldBox(leaf);
    const pivotX = hinge.getWorldPosition(new THREE.Vector3()).x - van.position.x;
    const outerEdge = label === 'left'
      ? leafBox.min.x - van.position.x
      : leafBox.max.x - van.position.x;
    assert.ok(Math.abs(pivotX - outerEdge) <= 0.005,
      `${label} hinge is at x ${pivotX.toFixed(3)}, `
      + `${Math.abs(pivotX - outerEdge).toFixed(3)} m off the leaf edge at `
      + `${outerEdge.toFixed(3)} — a hinge in the middle of a door panel`);

    // And the barrels are on that line, not 0.12 m inboard of it.
    for (const height of ['low', 'high']) {
      const barrel = van.getObjectByName(`primary-van-rear-hinge-${label}-${height}`);
      assert.ok(barrel, `${label} ${height} hinge barrel is missing`);
      const barrelBox = worldBox(barrel);
      const barrelOuter = label === 'left'
        ? barrelBox.min.x - van.position.x
        : barrelBox.max.x - van.position.x;
      assert.ok(Math.abs(barrelOuter - outerEdge) <= 0.005,
        `${label} ${height} barrel stands ${Math.abs(barrelOuter - outerEdge).toFixed(3)} m `
        + 'inboard of the hinge line it is supposed to be');
    }
  }
});

/**
 * They open, and opening them does not put a door through the van.
 *
 * Measured after: each leaf's free edge reaches (±1.565, −3.779) van-local at
 * the authored swing, and the AABB overlap against `primary-van-cargo-box`
 * goes from 0.010 shut to 0.000 open. About the old barrels it was 0.12 m of
 * leaf inside the body at 90 degrees.
 */
test('the van rear doors swing open clear of the body', () => {
  const built = level();
  const safehouse = built.phases.safehouse;
  const van = safehouse.group.getObjectByName('primary-van');
  assert.equal(typeof van.userData.setRearDoorsOpen, 'function',
    'the van rear doors cannot be opened at all');

  // The loading bay is a boarding beat: the doors stand open in it.
  assert.equal(van.userData.rearDoorsOpen, true,
    'the crew boards through shut doors');

  const cargoBox = () => worldBox(van.getObjectByName('primary-van-cargo-box'));
  const leafBox = (label) => worldBox(van.getObjectByName(`primary-van-rear-door-${label}`));

  van.userData.setRearDoorsOpen(false);
  safehouse.group.updateMatrixWorld(true);
  const shut = ['left', 'right'].map((label) => leafBox(label).clone());
  assert.ok(shut[0].max.x <= van.position.x && shut[1].min.x >= van.position.x,
    'the shut leaves do not meet on the centre line');

  van.userData.setRearDoorsOpen(true);
  safehouse.group.updateMatrixWorld(true);
  const body = cargoBox();
  for (const [index, label] of ['left', 'right'].entries()) {
    const open = leafBox(label);
    assert.ok(open.min.z < shut[index].min.z - 0.5,
      `${label} leaf did not swing: shut z ${shut[index].min.z.toFixed(3)}, `
      + `open z ${open.min.z.toFixed(3)}`);
    const depth = overlapDepth(open, body);
    assert.ok(depth <= 0.001,
      `${label} leaf sweeps ${depth.toFixed(3)} m into the cargo box`);
  }
});

/**
 * The back of the van is a hole, and the doors have to fill it.
 *
 * Measured on the shipped interior: side walls' inner faces at x ±1.660 and a
 * ceiling underside at 2.700, against a rear panel of 2.40 x 2.50 — 0.46 m of
 * daylight down each rear corner and 0.20 m across the top.
 */
test('the van interior rear doors fill the opening they are hung in', () => {
  const built = level();
  const van = built.phases.van;
  van.group.updateMatrixWorld(true);

  const left = worldBox(van.group.getObjectByName('van-wall-left'));
  const right = worldBox(van.group.getObjectByName('van-wall-right'));
  const ceiling = worldBox(van.group.getObjectByName('van-ceiling'));
  const floor = worldBox(van.group.getObjectByName('van-floor'));
  const door = worldBox(van.group.getObjectByName('van-interior-door'));

  const sideGap = Math.max(left.max.x - door.min.x, door.max.x - right.min.x) * -1;
  assert.ok(sideGap <= 0.005,
    `${(sideGap * 100).toFixed(1)} cm of open corner beside the rear doors: `
    + `opening x ${left.max.x.toFixed(3)}..${right.min.x.toFixed(3)}, `
    + `doors x ${door.min.x.toFixed(3)}..${door.max.x.toFixed(3)}`);
  const topGap = ceiling.min.y - door.max.y;
  assert.ok(topGap <= 0.005,
    `${(topGap * 100).toFixed(1)} cm of open slot over the rear doors: `
    + `ceiling underside ${ceiling.min.y.toFixed(3)}, door top ${door.max.y.toFixed(3)}`);
  assert.ok(door.min.y - floor.max.y <= 0.005,
    'the rear doors do not reach the van floor');

  // A pair of doors, not a wall: a seam on the centre line and the latch rods
  // on it. They used to be stranded 0.45 m out in the middle of each leaf.
  assert.ok(van.group.getObjectByName('van-rear-door-seam'), 'the doors have no seam');
  for (const label of ['left', 'right']) {
    const latch = worldBox(van.group.getObjectByName(`van-rear-door-latch-${label}`));
    const fromSeam = Math.min(Math.abs(latch.min.x), Math.abs(latch.max.x));
    assert.ok(fromSeam <= 0.2,
      `${label} latch is ${fromSeam.toFixed(3)} m from the seam it shuts on`);
  }
});

/* ------------------------------------------------------------------ *
 * 2. THE GUARD
 * ------------------------------------------------------------------ */

/**
 * Measured before: yaw −2.7900 against an entry point at (0, 8.6), which is
 * 114.86 degrees off it — the guard on the door had his back to the door for
 * the 2.75 seconds the beat exists for. −2.79 is `atan2` to the middle of the
 * teller counter, so it was aimed at something; it was aimed at the wrong
 * thing.
 */
test('the lobby guard watches the way in', () => {
  const built = level();
  const bank = built.phases.bank;
  bank.group.updateMatrixWorld(true);
  const guard = bank.interactables.guard;
  const at = guard.getWorldPosition(new THREE.Vector3());

  assert.deepEqual([bank.spawn.x, bank.spawn.z], [BANK_ENTRY_POINT.x, BANK_ENTRY_POINT.z],
    'the bank spawn and the entry point the guard is aimed at have drifted apart');

  const want = Math.atan2(BANK_ENTRY_POINT.x - at.x, BANK_ENTRY_POINT.z - at.z);
  let off = guard.rotation.y - want;
  while (off > Math.PI) off -= Math.PI * 2;
  while (off < -Math.PI) off += Math.PI * 2;
  assert.ok(Math.abs(off * DEG) <= 20,
    `the guard is looking ${Math.abs(off * DEG).toFixed(2)} degrees away from the `
    + `doors the crew comes through: yaw ${guard.rotation.y.toFixed(4)}, `
    + `wanted ${want.toFixed(4)} from his post `
    + `(${at.x.toFixed(2)}, ${at.z.toFixed(2)})`);

  /* And the camera that films him says the same thing from the other side:
   * `HEIST_CAMERA_MARKS.bank_guard` stands on the entry point, so a guard
   * facing it is a guard facing the lens rather than a SECURITY legend. */
  const forward = new THREE.Vector3(Math.sin(guard.rotation.y), 0, Math.cos(guard.rotation.y));
  const toCamera = new THREE.Vector3(BANK_ENTRY_POINT.x - at.x, 0, BANK_ENTRY_POINT.z - at.z)
    .normalize();
  assert.ok(forward.dot(toCamera) > 0.9,
    `the guard is turned ${(Math.acos(forward.dot(toCamera)) * DEG).toFixed(2)} degrees `
    + 'off the crew coming in');
});

/* ------------------------------------------------------------------ *
 * 3. THE HOSTAGES
 * ------------------------------------------------------------------ */

/** Every state `main.js` can put a lobby civilian into. */
const HOSTAGE_POSES = Object.freeze([
  'stand', 'startled', 'pleading', 'kneeling', 'prone',
  'restrained', 'bolting', 'alarm', 'down',
]);

function lowestPart(figure) {
  figure.root.updateMatrixWorld(true);
  let lowest = Infinity;
  let name = null;
  figure.parts.group.traverse((object) => {
    if (!object.isMesh) return;
    const min = new THREE.Box3().setFromObject(object).min.y;
    if (min < lowest) { lowest = min; name = object.name || '(anon)'; }
  });
  return { lowest, name };
}

/** The bottom of the two shoes, which is what a body stands on. */
function soleHeight(figure) {
  let lowest = Infinity;
  for (const shin of [figure.parts.shinL, figure.parts.shinR]) {
    shin.traverse((object) => {
      if (!object.isMesh || !/shoe|foot/.test(object.name)) return;
      lowest = Math.min(lowest, new THREE.Box3().setFromObject(object).min.y);
    });
  }
  return lowest;
}

/**
 * THE POSE THAT WAS BUILT ON THE WRONG FLOOR.
 *
 * `alarm()` ended `this.tilt.position.y = -0.3 * this.scale` and returned,
 * where every other floor pose ends on `_settle()`. Measured on the built
 * lobby, snapped (which is what a checkpoint restore and both headless gates
 * see): 0.265 m of body under the marble on the 1.60 m customer, 0.286 on the
 * 1.73 m, 0.308 on the 1.86 m — a man reaching for the alarm with one boot a
 * foot under the floor and his chest 0.63 m above it. `bolting()` had the
 * same shape of fault at 0.017 m.
 */
test('no hostage pose puts a body through the floor it is standing on', () => {
  const built = level();
  const civilians = built.phases.bank.civilians;
  assert.equal(civilians.length, 22, 'the lobby is not the lobby');

  for (const civilian of civilians) {
    const figure = civilian.userData.figure;
    for (const pose of HOSTAGE_POSES) {
      civilian.userData.setState(pose, { blend: false });
      const { lowest, name } = lowestPart(figure);
      assert.ok(lowest >= -POSE_FLOOR_CONTACT_M,
        `${civilian.name} (${figure.height.toFixed(2)} m) is ${(-lowest * 100).toFixed(1)} cm `
        + `into the marble in the ${pose} pose, lowest part ${name}`);
      assert.ok(lowest <= 0.02,
        `${civilian.name} is floating ${(lowest * 100).toFixed(1)} cm above the marble `
        + `in the ${pose} pose`);
    }
  }
});

/**
 * The symptom the owner reported, which is not the same measurement: a body
 * whose torso is up in the air over feet that are somewhere else. Feet on the
 * floor is the fix; this is the thing it was noticed by.
 */
test('a hostage reaching for the alarm still has both feet on the floor', () => {
  const built = level();
  for (const civilian of built.phases.bank.civilians) {
    const figure = civilian.userData.figure;
    civilian.userData.setState('alarm', { blend: false });
    figure.root.updateMatrixWorld(true);
    const sole = soleHeight(figure);
    assert.ok(Number.isFinite(sole), `${civilian.name} has no shoes to stand on`);
    assert.ok(sole >= -POSE_FLOOR_CONTACT_M,
      `${civilian.name} has a boot ${(-sole * 100).toFixed(1)} cm under the marble `
      + 'while reaching for the alarm');
    assert.ok(sole <= 0.05,
      `${civilian.name} is reaching for the alarm with both feet `
      + `${(sole * 100).toFixed(1)} cm off the floor`);
  }
});

/**
 * The trap that hid it. A pose applied through `setState` with a blend is
 * re-grounded on every frame of that blend, so the fault was invisible in
 * play and permanent on a snap. Both paths have to land in the same place, or
 * this comes back the next time somebody authors a lift instead of measuring.
 */
test('a blended pose lands where the snapped one does', () => {
  const built = level();
  const civilian = built.phases.bank.civilians[7];
  const figure = civilian.userData.figure;

  civilian.userData.setState('alarm', { blend: false });
  const snapped = lowestPart(figure).lowest;

  civilian.userData.setState('stand', { blend: false });
  civilian.userData.setState('alarm');
  for (let i = 0; i < 60; i++) figure.update(1 / 60);
  const blended = lowestPart(figure).lowest;

  assert.ok(Math.abs(blended - snapped) <= POSE_FLOOR_CONTACT_M,
    `the blend settles at ${blended.toFixed(4)} and the snap at ${snapped.toFixed(4)}`);
});
