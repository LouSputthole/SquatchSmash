import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { buildHeistLevel } from '../src/heist/level.js';

/**
 * THE WAY OUT OF THE BANK.
 *
 * Owner, playtest 2026-08-26: *"when you get the cash though, after you have
 * the cash pile, there's no way to get outside. You stand by the door, you
 * can't really leave."*
 *
 * It was not the state machine. The entrance wall is one solid slab with no
 * doorway cut in it, and the glass pane carrying the exit descriptor sat
 * entirely inside that slab, four centimetres behind its lobby face. The
 * interaction ray hit marble every time.
 *
 * The reason it shipped is the shape of the check that was supposed to catch
 * it: `use('bank-exit')` looked the descriptor up by name and called its
 * handler directly, so it proved the handler worked and said nothing about
 * whether a player could aim at it. This file measures the geometry instead,
 * in Node, with no browser required -- so it runs on every push rather than
 * only when somebody launches Playwright.
 */

/** The player clamp for the bank phase, from `constrainPlayerToPhase`. */
const BANK_CLAMP_MAX_Z = 10.4;
/** InteractionSystem's reach. */
const MAX_DISTANCE = 2.7;

function worldBox(object) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function bankPhase() {
  const level = buildHeistLevel(new THREE.Scene());
  const bank = level.phases.bank;
  /* Nothing renders here, and `Object3D.raycast` reads `matrixWorld` rather
   * than recomputing it -- so without this every ray is cast against stale
   * matrices and the answers are quietly meaningless. */
  bank.group.updateMatrixWorld(true);
  return bank;
}

test('the exit descriptor is carried by a volume, not by the walled-in glass', () => {
  const bank = bankPhase();
  const volume = bank.group.getObjectByName('bank-exit-volume');
  assert.ok(volume, 'bank-exit-volume is missing');
  assert.equal(bank.interactables.exit, volume,
    'the exit interactable must be the reachable volume');
  assert.equal(volume.visible, false, 'the proxy must not be drawn');
  assert.equal(volume.castShadow, false);
  assert.equal(volume.receiveShadow, false);

  const pane = bank.group.getObjectByName('bank-exit');
  assert.ok(pane, 'the glass pane should still exist for presentation');
  assert.equal(bank.interactables.exitPane, pane);
  assert.equal(pane.visible, true, 'the glass is still the thing you look at');
});

test('the proxy stands clear of the marble, and the player never stands inside it', () => {
  const bank = bankPhase();
  const volume = worldBox(bank.group.getObjectByName('bank-exit-volume'));

  /* The entrance slab is the widest mesh on the entrance wall: find it by
   * measurement rather than by name, since it is anonymous. */
  let slab = null;
  bank.group.getObjectByName('bank-entrance').traverse((object) => {
    if (!object.isMesh) return;
    const box = worldBox(object);
    const width = box.max.x - box.min.x;
    if (width > 20 && (!slab || width > slab.max.x - slab.min.x)) slab = box;
  });
  assert.ok(slab, 'the solid entrance slab was not found');

  assert.ok(volume.max.z < slab.min.z,
    `the proxy must sit in front of the marble: proxy ends ${volume.max.z.toFixed(3)}, `
    + `slab starts ${slab.min.z.toFixed(3)}`);
  assert.ok(volume.min.z > BANK_CLAMP_MAX_Z,
    `the player clamp reaches z ${BANK_CLAMP_MAX_Z} and the proxy starts at `
    + `${volume.min.z.toFixed(3)} -- a box a ray starts inside is a box the ray misses`);
  assert.ok(volume.max.z - BANK_CLAMP_MAX_Z < MAX_DISTANCE,
    'the proxy is out of interaction range from the closest legal position');
});

/**
 * The check the old one should have been. Cast the ray a player actually casts
 * -- from eye height at the closest position the clamp allows, at the door --
 * through every mesh in the phase, and require the exit proxy to be the first
 * thing hit that owns an interaction descriptor.
 */
test('the crosshair reaches the way out from the lobby floor', () => {
  const bank = bankPhase();
  const volume = bank.group.getObjectByName('bank-exit-volume');
  const target = worldBox(volume).getCenter(new THREE.Vector3());

  const raycaster = new THREE.Raycaster();
  raycaster.far = MAX_DISTANCE;

  let acquired = 0;
  let attempted = 0;
  for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) {
    for (const z of [10.4, 10.0, 9.4, 8.6]) {
      for (const eye of [1.55, 1.66, 1.75]) {
        const origin = new THREE.Vector3(x, eye, z);
        if (origin.distanceTo(target) > MAX_DISTANCE) continue;
        attempted += 1;
        raycaster.set(origin, target.clone().sub(origin).normalize());
        const hits = raycaster.intersectObject(bank.group, true)
          .filter((hit) => hit.object.isMesh);
        /* InteractionSystem breaks on the first hit owning no descriptor, so
         * the proxy has to be genuinely first -- not merely present. */
        if (hits.length && hits[0].object === volume) acquired += 1;
      }
    }
  }
  assert.ok(attempted > 0, 'no viewpoint was close enough to test');
  assert.equal(acquired, attempted,
    `the exit was the first mesh on the ray in ${acquired} of ${attempted} viewpoints; `
    + 'it was 0 of 1127 before the proxy existed');
});

test('the proxy cannot stop a bullet', () => {
  const bank = bankPhase();
  const volume = bank.group.getObjectByName('bank-exit-volume');
  /* `hiddenOrIgnored` in src/core/combat/aim-proxy.js walks parents looking
   * for exactly this, which is what keeps an invisible interaction box from
   * eating rounds fired at the street. */
  let hidden = false;
  for (let node = volume; node; node = node.parent) {
    if (node.visible === false) { hidden = true; break; }
  }
  assert.equal(hidden, true, 'combat aim would treat the exit proxy as solid');
});
