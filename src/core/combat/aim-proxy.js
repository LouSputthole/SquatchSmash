/**
 * AIM PROXIES, AND HOW A ROUND GETS PAST ONE.
 *
 * Aiming at a man built out of thirty separate limb meshes is threading a
 * crosshair between a forearm and a rope, so every scene in this game that has
 * a person you can shoot puts an invisible box around him and lets the ray hit
 * that. The box is generous on purpose. That is the whole point of it.
 *
 * It is also the whole problem with it, and it produces one specific bug that
 * looks like several different bugs:
 *
 *   THE DECAL LANDS SOMEWHERE HE ISN'T.
 *
 * The ray struck the BOX, so `hit.point` is a point on a box that is a quarter
 * of a metre wider than the man in every direction, and `hit.face.normal` is
 * the box's face — usually not even pointing the way the body's surface does.
 * Feed that to a decal system and you get blood hanging in the air beside him,
 * or lying flat against a plane he is standing behind, or — where the proxy is
 * parented to the scene rather than to the rig — pinned to where he was
 * standing when the level was built while the man himself swings on a chain a
 * metre away.
 *
 * The heist solved this in `src/heist/combat.js` and solved it correctly: keep
 * the ray, but resolve the CONTACT onto the body. It stayed there, so every
 * other scene kept the bug. Triple X hanging in the Silent Squatch lab is the
 * one the owner found. This is that solution, moved to where the other scenes
 * can reach it.
 *
 * THE RULE FOR A NEW SCENE: if you build an aim proxy, mark it with
 * `markAimProxy()` and put every trace through `resolveProxyContact()`. Do not
 * write a third copy of this.
 */

import * as THREE from 'three';

const _bounds = new THREE.Box3();
const _point = new THREE.Vector3();
const _normal = new THREE.Vector3();

/**
 * Declare a mesh to be a hit volume rather than a thing.
 *
 * The flag rides on `userData` so it survives cloning and so a traversal that
 * knows nothing about this module can still ask.
 */
export function markAimProxy(mesh) {
  if (mesh) mesh.userData.aimProxy = true;
  return mesh;
}

/** Is this object an aim volume rather than a piece of somebody? */
export function isAimProxy(object) {
  return object?.userData?.aimProxy === true;
}

/**
 * Hidden things do not stop rounds, and a shooter cannot shoot himself.
 *
 * Walked up the parents because visibility is inherited: a limb inside a
 * hidden rig is hidden, and `object.visible` alone says otherwise.
 */
export function hiddenOrIgnored(object, ignore) {
  let node = object;
  while (node) {
    if (node.visible === false || node === ignore) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Turn a hit on an aim proxy into a hit on the body behind it.
 *
 * @param {object} proxyHit  the intersection that struck the proxy
 * @param {Array} hits       the full sorted intersection list from that ray
 * @param {object} [ignore]  the shooter's own rig
 * @param {object} [options]
 * @param {object} [options.body] the rig to resolve onto. Defaults to the
 *        proxy's PARENT, which is the figure root everywhere a proxy is built
 *        as a child of the man. Pass it explicitly where the proxy is parented
 *        to the scene instead — a proxy beside the rig rather than inside it
 *        cannot find the body by walking up.
 * @returns {object} an intersection whose `point` is on the man
 */
export function resolveProxyContact(proxyHit, hits, ignore = null, { body = null } = {}) {
  const rig = body ?? proxyHit?.object?.parent ?? null;
  if (!rig) return proxyHit;
  /* First choice, and much the best one: the ray carried on through the box
   * and struck an actual limb. That intersection has a real surface point and
   * a real face normal, which is everything a decal needs. */
  for (const hit of hits ?? []) {
    if (hit === proxyHit || hiddenOrIgnored(hit.object, ignore)) continue;
    if (isAimProxy(hit.object)) continue;
    for (let node = hit.object; node; node = node.parent) {
      if (node === rig) return hit;
    }
  }
  /* Nothing of him under this ray: the round clipped the corner of the volume.
   * Keep the hit — a graze is a hit, and refusing it would make the generous
   * box a lie — but put the contact on the nearest point of the MAN rather
   * than on the empty air around him, and drop the box's face normal, which
   * describes the box and not him. */
  const bounds = bodyBounds(rig);
  if (!bounds) return proxyHit;
  const point = bounds.clampPoint(proxyHit.point, _point).clone();
  return { ...proxyHit, point, face: null, normal: null };
}

/**
 * The bounds of the BODY, with the box around it left out.
 *
 * `Box3.setFromObject(rig)` is the obvious thing and it is wrong here, because
 * in every scene but one the aim proxy is a CHILD of the rig — so the bounds
 * it returns are the generous box's bounds and clamping to them puts the
 * contact back exactly where it already was. The version of this that was
 * hoisted out of `src/heist/combat.js` had that bug and it was invisible,
 * because the clamp only runs on a graze and a graze that lands 20 cm out
 * reads as "close enough" until somebody looks at a still.
 *
 * Hidden meshes are out too: a pooled corpse, a stowed weapon and a swapped
 * costume are all hidden rather than removed in this codebase, and any of them
 * would stretch the body to somewhere the player cannot see it.
 */
function bodyBounds(rig) {
  rig.updateMatrixWorld?.(true);
  _bounds.makeEmpty();
  let counted = 0;
  rig.traverse((node) => {
    if (!node.isMesh || isAimProxy(node) || hiddenOrIgnored(node)) return;
    _bounds.expandByObject(node);
    counted += 1;
  });
  if (counted === 0 || !Number.isFinite(_bounds.min.y)) return null;
  return _bounds;
}

/**
 * The world-space surface normal of an intersection, or a sane substitute.
 *
 * `hit.face.normal` is in the struck geometry's LOCAL space; a decal placed
 * with it unrotated sits sideways on any limb that is not axis-aligned, which
 * upside down is all of them. Where there is no face at all — the graze case
 * above — the honest answer is the direction the round came from, because that
 * is the only thing known about the contact.
 *
 * @param {object} hit
 * @param {THREE.Vector3} [from] the muzzle or eye, for the fallback
 * @returns {THREE.Vector3|null}
 */
export function contactNormal(hit, from = null) {
  const face = hit?.face?.normal;
  if (face && hit.object) {
    return _normal.copy(face).transformDirection(hit.object.matrixWorld).clone();
  }
  if (from && hit?.point) {
    const away = _normal.copy(from).sub(hit.point);
    if (away.lengthSq() > 1e-8) return away.normalize().clone();
  }
  return null;
}
