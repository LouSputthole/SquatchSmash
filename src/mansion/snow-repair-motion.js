/**
 * Snow's return-visit repair work.
 *
 * This stays local to the repaired Mansion. The shared `Npc` work animation
 * has to serve bartenders, cashiers and cleaners, so changing it to swing a
 * hammer would put an imaginary tool in every working actor's hand.
 */
import { box, cylinder, group, mat } from '../world/build.js';

const HANDLE = mat({ color: 0x704a29, roughness: 0.92 });
const HEAD = mat({ color: 0x555b62, roughness: 0.38, metalness: 0.78 });

/** A unit-scale prop for the hand socket published by the shared person rig. */
export function createSnowRepairHammer() {
  const hammer = group('snow-repair-hammer');
  hammer.add(cylinder({
    r: 0.018,
    h: 0.42,
    pos: [0, -0.13, 0],
    mat: HANDLE,
    name: 'snow-repair-hammer-handle',
  }));
  hammer.add(box({
    size: [0.24, 0.085, 0.095],
    pos: [0, -0.34, 0],
    mat: HEAD,
    name: 'snow-repair-hammer-head',
  }));
  /* The hand socket's +Y points up the arm. The handle therefore runs down
   * out of the fist, with the head at its far end; no scaled hand mesh sits
   * between the prop and its authored dimensions. */
  hammer.position.set(0, -0.015, 0.005);
  hammer.rotation.z = 0.08;
  return hammer;
}

/**
 * Deterministic hammering pose. Exported so tests can prove the return visit
 * is visibly doing repair work rather than merely standing beside it.
 */
export function snowRepairPoseAt(seconds = 0) {
  const t = Math.max(0, Number(seconds) || 0);
  const phase = (t * 1.45) % 1;
  /* A quick downward strike and a slower, readable reset. The smooth cosine
   * keeps the prop from snapping at the loop boundary. */
  const strike = (1 - Math.cos(phase * Math.PI * 2)) * 0.5;
  return Object.freeze({
    strike,
    bodyX: 0.24 + strike * 0.08,
    bodyZ: -0.045 + strike * 0.035,
    headX: -0.30 + strike * 0.12,
    headZ: -0.035,
    armRX: -1.08 + strike * 0.68,
    armRZ: 0.12,
    foreRX: -1.22 + strike * 0.74,
    foreRZ: 0.05,
    armLX: -0.58 - strike * 0.10,
    armLZ: -0.16,
    foreLX: -1.04,
    foreLZ: -0.05,
  });
}

/**
 * Apply the fixture-specific pose after `Npc.update()` resets the rig.
 *
 * Owner QA, 2026-08-28: "Snow should look like he is actively helping put
 * the place back together rather than merely existing nearby." This writes
 * limb joints only. It never translates the actor root, changes his skeleton,
 * or makes the shared work loop somebody else's repair animation.
 */
export function applySnowRepairPose(npc, seconds = 0) {
  const p = npc?.parts;
  if (!p?.body || !p?.head || !p?.armR || !p?.armL || !p?.foreR || !p?.foreL) return null;
  const pose = snowRepairPoseAt(seconds);
  p.body.rotation.x = pose.bodyX;
  p.body.rotation.z = pose.bodyZ;
  p.head.rotation.x = pose.headX;
  p.head.rotation.z = pose.headZ;
  p.armR.rotation.set(pose.armRX, 0, pose.armRZ);
  p.foreR.rotation.set(pose.foreRX, 0, pose.foreRZ);
  p.armL.rotation.set(pose.armLX, 0, pose.armLZ);
  p.foreL.rotation.set(pose.foreLX, 0, pose.foreLZ);
  return pose;
}
