import * as THREE from 'three';
import {
  contactNormal,
  hiddenOrIgnored,
} from '../core/combat/aim-proxy.js';

const CENTER = new THREE.Vector2(0, 0);

function belongsTo(object, root) {
  for (let node = object; node; node = node.parent) {
    if (node === root) return true;
  }
  return false;
}

function materialHidden(object) {
  const materials = Array.isArray(object?.material) ? object.material : [object?.material];
  return materials.some((material) => material?.visible === false);
}

function belongsToEvidence(object, evidence) {
  for (let node = object; node; node = node.parent) {
    if (evidence.has(node) || node.userData?.reusableSystem === 'blood') return true;
  }
  return false;
}

/**
 * Pick the nearest uniformly-scaled figure joint that owns the mesh hit.
 *
 * Blood decals cannot live on the non-uniformly-scaled garment or seated-knee
 * groups, but falling all the way back to the torso makes an arm wound slide
 * off as the shoulder or elbow moves. Walking upward to the first safe pivot
 * preserves the exact world contact through the authored gestures and fall.
 */
export function squatchfatherBodyAnchor(controller, object) {
  const figure = controller?.fig;
  if (!figure) return null;
  const safe = new Set([
    figure.head,
    figure.neck,
    figure.armL?.elbow,
    figure.armR?.elbow,
    figure.armL?.shoulder,
    figure.armR?.shoulder,
    /* Seated knees carry a non-uniform Y stretch. Their hip is the nearest
     * safe plain pivot for thigh, shin and shoe contacts. */
    figure.legL?.hip,
    figure.legR?.hip,
    figure.torso,
    figure.pelvis,
    figure.root,
  ]);
  for (let node = object; node; node = node.parent) {
    if (safe.has(node)) return node;
    if (node === controller.group) break;
  }
  return figure.torso ?? figure.pelvis ?? figure.root ?? controller.group ?? null;
}

export class SquatchfatherCombatAdapter {
  constructor({
    camera,
    hitTargets,
    surfaceImpacts = null,
    bloodImpacts = null,
    deathBloodPools = null,
    floorY = () => 0,
  }) {
    this.camera = camera;
    this.hitTargets = hitTargets;
    this.surfaceImpacts = surfaceImpacts;
    this.bloodImpacts = bloodImpacts;
    this.deathBloodPools = deathBloodPools;
    this.floorY = floorY;
    this.targets = new Map();
    this.raycaster = new THREE.Raycaster();
  }

  registerTarget(id, target) {
    this.targets.set(id, target);
    return this;
  }

  resolve(intendedId) {
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(CENTER, this.camera);
    const origin = this.raycaster.ray.origin.clone();
    const direction = this.raycaster.ray.direction.clone();
    const roots = typeof this.hitTargets === 'function' ? this.hitTargets() : this.hitTargets;
    const hits = this.raycaster.intersectObjects(roots ?? [], true);
    const evidence = new Set([
      ...(this.surfaceImpacts?.pool ?? []),
      ...(this.bloodImpacts?.wounds?.pool ?? []),
      ...(this.bloodImpacts?.spatter?.pool ?? []),
      ...(this.deathBloodPools?.meshes ?? []),
    ]);
    const hit = hits.find(({ object }) => (
      !hiddenOrIgnored(object, this.camera) && !materialHidden(object)
      && !belongsToEvidence(object, evidence)
    ));
    const targetEntry = [...this.targets.entries()]
      .find(([, target]) => belongsTo(hit?.object, target.root));
    const [targetId, target] = targetEntry ?? [];
    let outcome = 'miss';
    if (hit && !target) outcome = 'blocked';
    if (targetId && targetId !== intendedId) outcome = 'wrong-target';
    if (targetId === intendedId) outcome = 'intended';

    return {
      outcome,
      intendedId,
      targetId: targetId ?? null,
      actor: target?.actor ?? null,
      root: target?.root ?? null,
      anchor: target?.anchorOf?.(hit.object) ?? null,
      spatterAnchor: target?.spatterAnchorOf?.(hit.object) ?? null,
      object: hit?.object ?? null,
      point: hit?.point?.clone() ?? null,
      normal: contactNormal(hit, origin),
      origin,
      direction,
      distance: hit?.distance ?? Infinity,
    };
  }

  present(shot, { fatal = false } = {}) {
    if (shot?.outcome === 'blocked' && shot.point && shot.normal) {
      return { surface: this.surfaceImpacts?.punch(shot.point, shot.normal) ?? null };
    }
    if (!shot?.actor || !shot.anchor || !shot.point) return null;
    const marks = this.bloodImpacts?.hit({
      actor: shot.actor,
      anchor: shot.anchor,
      point: shot.point,
      normal: shot.normal,
      from: shot.origin,
      spatter: true,
      spatterAnchor: shot.spatterAnchor ?? shot.anchor,
    }) ?? null;
    const floorY = typeof this.floorY === 'function' ? this.floorY(shot) : this.floorY;
    const pool = fatal && shot.outcome === 'intended'
      ? this.deathBloodPools?.spill(shot.point, { floorY }) ?? null
      : null;
    return { ...(marks ?? {}), pool };
  }

  update(dt) {
    this.bloodImpacts?.update(dt);
    this.deathBloodPools?.update(dt);
  }

  reset() {
    this.bloodImpacts?.reset();
    this.deathBloodPools?.reset();
  }

  get prewarmObjects() {
    return [
      ...(this.bloodImpacts?.wounds?.pool ?? []),
      ...(this.bloodImpacts?.spatter?.pool ?? []),
      ...(this.deathBloodPools?.meshes ?? []),
    ];
  }
}
