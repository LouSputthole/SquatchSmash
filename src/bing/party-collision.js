import * as THREE from 'three';
import { markSpatialPrimitive } from '../core/spatial-contract.js';

const HIDDEN_PARTY_COLLIDER = 100_000;

function effectivelyVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (current.visible === false) return false;
  }
  return true;
}

/**
 * A small Box3-compatible collision volume that follows an Object3D.
 *
 * Party staging moves people and props without a physics body. Reading the
 * box therefore resolves the target's current world position instead of
 * freezing its opening-night coordinates. Hidden targets are parked far from
 * the club so cleanup transitions cannot leave an invisible wall behind.
 */
export function createPartyCollider({
  id,
  target,
  center = null,
  halfX = 0.2,
  halfZ = 0.2,
  minY = 0,
  maxY = 1,
  kind = 'prop',
  ownerActorId = null,
  bounds = null,
}) {
  if (!target?.isObject3D) throw new TypeError('Party collider requires an Object3D target');
  const world = new THREE.Vector3();
  const min = new THREE.Vector3();
  const max = new THREE.Vector3();

  const active = () => effectivelyVisible(target);
  const resolve = () => {
    if (!active()) {
      min.set(HIDDEN_PARTY_COLLIDER, HIDDEN_PARTY_COLLIDER, HIDDEN_PARTY_COLLIDER);
      max.set(HIDDEN_PARTY_COLLIDER + 0.01, HIDDEN_PARTY_COLLIDER + 0.01,
        HIDDEN_PARTY_COLLIDER + 0.01);
      return;
    }

    if (typeof center === 'function') {
      const resolved = center(target, world);
      if (resolved && resolved !== world) world.copy(resolved);
    } else if (Array.isArray(center)) {
      world.set(center[0], center[1], center[2]);
    } else {
      target.getWorldPosition(world);
    }
    const live = typeof bounds === 'function' ? (bounds(target) ?? {}) : {};
    const hx = live.halfX ?? halfX;
    const hz = live.halfZ ?? halfZ;
    min.set(world.x - hx, world.y + (live.minY ?? minY), world.z - hz);
    max.set(world.x + hx, world.y + (live.maxY ?? maxY), world.z + hz);
  };

  const box3Like = {
    // A semantic name keeps the gate identity stable when a staged actor moves.
    name: id,
    userData: { partyCollision: true, partyCollisionKind: kind, partyCollisionId: id },
    /* Publish lifecycle through the normal collider seam as well as through
     * this Adapter's richer wrapper. Runtime collision still gets the parked
     * bounds below, while geometry/staging normalization can omit a hidden
     * body before its actor ownership is interpreted as active scene truth. */
    get enabled() { return kind !== 'cast' || active(); },
    get min() { resolve(); return min; },
    get max() { resolve(); return max; },
  };
  markSpatialPrimitive(box3Like, {
    id,
    kind: kind === 'cast' ? 'actor-body' : kind,
    ...(kind === 'cast' ? { ownerActorId } : {}),
  });
  const rounded = (value) => Number(value.toFixed(6));
  return {
    id,
    kind,
    target,
    box: box3Like,
    get active() { return active(); },
    snapshot() {
      resolve();
      return {
        active: active(),
        min: [min.x, min.y, min.z].map(rounded),
        max: [max.x, max.y, max.z].map(rounded),
      };
    },
  };
}
