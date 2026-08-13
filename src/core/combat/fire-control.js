import * as THREE from 'three';

import { resolveMaterialPath } from './ballistics.js';
import { AabbCombatSpace } from './spatial.js';

export const DEFAULT_COMBAT_FIRE_CONTROL = Object.freeze({
  alignmentTolerance: 0.14,
  targetTolerance: 0.55,
  nearMissRadius: 1.25,
  whizCooldown: 0.22,
  missMin: 0.45,
  missMax: 2.05,
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

function unit(value) {
  return Math.max(0, Math.min(1, finite(value, 0)));
}

function pointFrom(value) {
  if (value?.isVector3) return value.clone();
  if (!value || !Number.isFinite(value.x)
    || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null;
  return new THREE.Vector3(value.x, value.y, value.z);
}

function liveTargetPoint(target, explicit) {
  const direct = pointFrom(explicit ?? target?.point ?? target?.aimPoint);
  if (direct) return direct;
  const position = pointFrom(target?.position ?? target?.root?.position);
  if (position) position.y += finite(target?.eye, 0);
  return position;
}

function targetId(target, actor) {
  const id = target?.id ?? target?.combatId ?? actor?.id;
  return id == null ? null : String(id);
}

/** Data-only truth for one hostile round; presentation remains scene-owned. */
export class CombatFireControl {
  constructor({
    random = Math.random,
    space = null,
    colliders = null,
    alignmentTolerance = DEFAULT_COMBAT_FIRE_CONTROL.alignmentTolerance,
    targetTolerance = DEFAULT_COMBAT_FIRE_CONTROL.targetTolerance,
    nearMissRadius = DEFAULT_COMBAT_FIRE_CONTROL.nearMissRadius,
    whizCooldown = DEFAULT_COMBAT_FIRE_CONTROL.whizCooldown,
    missMin = DEFAULT_COMBAT_FIRE_CONTROL.missMin,
    missMax = DEFAULT_COMBAT_FIRE_CONTROL.missMax,
  } = {}) {
    this.random = typeof random === 'function' ? random : Math.random;
    this.space = space?.trace ? space : new AabbCombatSpace({ boxes: colliders ?? [] });
    this.colliders = colliders;
    this.alignmentTolerance = nonNegative(
      alignmentTolerance, DEFAULT_COMBAT_FIRE_CONTROL.alignmentTolerance,
    );
    this.targetTolerance = nonNegative(
      targetTolerance, DEFAULT_COMBAT_FIRE_CONTROL.targetTolerance,
    );
    this.nearMissRadius = nonNegative(
      nearMissRadius, DEFAULT_COMBAT_FIRE_CONTROL.nearMissRadius,
    );
    this.whizCooldownSeconds = nonNegative(
      whizCooldown, DEFAULT_COMBAT_FIRE_CONTROL.whizCooldown,
    );
    this.missMin = nonNegative(missMin, DEFAULT_COMBAT_FIRE_CONTROL.missMin);
    this.missMax = Math.max(this.missMin,
      nonNegative(missMax, DEFAULT_COMBAT_FIRE_CONTROL.missMax));
    this.whizCooldown = 0;
  }

  update(dt) {
    this.whizCooldown = Math.max(0, this.whizCooldown - nonNegative(dt));
    return this.whizCooldown;
  }

  snapshot() {
    return { version: 1, whizCooldown: this.whizCooldown };
  }

  restore(snapshot = {}) {
    this.whizCooldown = nonNegative(snapshot?.whizCooldown);
    return this;
  }

  _random() {
    return unit(this.random());
  }

  _trace(from, to, options) {
    const boxes = options.colliders ?? this.colliders;
    if (typeof options.trace === 'function') {
      return options.trace(from.clone(), to.clone(), { boxes }) ?? null;
    }
    const space = options.space?.trace ? options.space : this.space;
    return space?.trace?.(from, to, boxes == null ? undefined : { boxes }) ?? null;
  }

  _traceContacts(from, to, options) {
    const boxes = options.colliders ?? this.colliders;
    if (typeof options.traceAll === 'function') {
      return options.traceAll(from.clone(), to.clone(), { boxes }) ?? [];
    }
    /* A legacy one-hit trace cannot honestly promise what lies behind its
     * first contact. Preserve it as an undeclared stopping contact instead of
     * granting penetration on incomplete world truth. */
    if (typeof options.trace === 'function') {
      const first = options.trace(from.clone(), to.clone(), { boxes }) ?? null;
      return first ? [{ ...first, material: null }] : [];
    }
    const space = options.space?.trace ? options.space : this.space;
    if (typeof space?.traceAll === 'function') {
      return space.traceAll(from, to, boxes == null ? undefined : { boxes });
    }
    const first = space?.trace?.(from, to, boxes == null ? undefined : { boxes }) ?? null;
    return first ? [{ ...first, material: null }] : [];
  }

  _missEndpoint(origin, aimPoint, avoidPoint = null) {
    const forward = aimPoint.clone().sub(origin).normalize();
    const missDistance = this.missMin + this._random() * (this.missMax - this.missMin);
    const perpendicular = new THREE.Vector3(forward.z, 0, -forward.x);
    if (perpendicular.lengthSq() <= 1e-10) perpendicular.set(1, 0, 0);
    perpendicular.normalize().multiplyScalar(missDistance * (this._random() < 0.5 ? -1 : 1));
    const end = aimPoint.clone().add(perpendicular);
    end.y += (this._random() - 0.5) * Math.min(1.1, missDistance);
    /* A stale sampled point can sit beside the actor's new position. Flip the
     * same bounded dispersion to the other side if the first choice would
     * visually put a declared miss back on that live body. */
    if (avoidPoint && end.distanceTo(avoidPoint) < this.missMin) {
      end.copy(aimPoint).sub(perpendicular);
    }
    return end;
  }

  /**
   * Resolve one hostile trigger attempt.
   *
   * Required world-space inputs are `origin`, `boreDirection` (aliases:
   * `bore`/`direction`) and the perception system's copied `aimPoint` (alias:
   * `sampledAimPoint`). `target` may carry `{ id, actor, point }` or
   * `{ id, actor, position, eye }`; damage additionally requires either
   * `target.visible === true` or `targetVisible: true`. `colliders`, `space`
   * and `trace` may be supplied per shot for a scene-owned collision set.
   *
   * The return value owns cloned vectors and presentation-neutral truth:
   * fired/reason, origin/direction/end, blocker, actor hit/damage, near-miss
   * and rate-limited whiz eligibility. It never emits audio, tracers or scene
   * callbacks.
   */
  resolveShot(options = {}) {
    const origin = pointFrom(options.origin);
    const aimPoint = pointFrom(options.aimPoint ?? options.sampledAimPoint);
    const boreDirection = pointFrom(
      options.boreDirection ?? options.bore ?? options.direction,
    );
    const areaFire = options.areaFire === true;
    const intendedActor = areaFire ? null : options.target?.actor ?? options.actor ?? null;
    const intendedTargetId = targetId(options.target, intendedActor);
    const invalid = !origin || !aimPoint || !boreDirection
      || boreDirection.lengthSq() <= 1e-10
      || aimPoint.distanceToSquared(origin) <= 1e-10;
    if (invalid) {
      return {
        fired: false,
        reason: 'invalid-shot',
        origin: origin?.clone() ?? null,
        direction: null,
        boreDirection: boreDirection?.clone() ?? null,
        end: origin?.clone() ?? null,
        blocked: false,
        blocker: null,
        hit: false,
        nearMiss: false,
        whiz: false,
        distance: 0,
        missDistance: Infinity,
        damage: 0,
        applied: false,
        fatal: false,
        result: null,
        targetId: intendedTargetId,
        actor: intendedActor,
        areaFire,
        boreError: Infinity,
        contacts: [],
        remainingEnergy: 1,
        remainingPenetration: nonNegative(options.penetration),
      };
    }

    boreDirection.normalize();
    const towardAim = aimPoint.clone().sub(origin).normalize();
    const boreError = boreDirection.angleTo(towardAim);
    const alignmentTolerance = nonNegative(
      options.alignmentTolerance, this.alignmentTolerance,
    );
    if (boreError > alignmentTolerance) {
      return {
        fired: false,
        reason: 'unaligned',
        origin: origin.clone(),
        direction: boreDirection.clone(),
        boreDirection: boreDirection.clone(),
        end: origin.clone(),
        blocked: false,
        blocker: null,
        hit: false,
        nearMiss: false,
        whiz: false,
        distance: 0,
        missDistance: Infinity,
        damage: 0,
        applied: false,
        fatal: false,
        result: null,
        targetId: intendedTargetId,
        actor: intendedActor,
        areaFire,
        boreError,
        contacts: [],
        remainingEnergy: 1,
        remainingPenetration: nonNegative(options.penetration),
      };
    }

    const livePoint = liveTargetPoint(options.target, options.targetPoint);
    const visible = options.targetVisible == null
      ? options.target?.visible === true
      : options.targetVisible === true;
    const targetTolerance = nonNegative(options.targetTolerance, this.targetTolerance);
    const atSample = Boolean(livePoint)
      && livePoint.distanceTo(aimPoint) <= targetTolerance;
    const accuracy = unit(options.accuracy ?? 1);
    const canHitActor = !areaFire
      && Boolean(intendedActor?.applyHit)
      && visible
      && atSample;
    const candidateHit = canHitActor && this._random() < accuracy;
    const intendedEnd = candidateHit && livePoint
      ? livePoint.clone()
      : this._missEndpoint(origin, aimPoint, livePoint);
    const trajectoryDirection = intendedEnd.clone().sub(origin).normalize();
    const penetration = nonNegative(options.penetration);
    const materialPath = resolveMaterialPath(
      this._traceContacts(origin, intendedEnd, options),
      { penetration, energy: 1 },
    );
    const aimPath = resolveMaterialPath(
      this._traceContacts(origin, aimPoint, options),
      { penetration, energy: 1 },
    );
    const blocker = materialPath.blocker;
    const blocked = materialPath.blocked;
    const end = blocked
      ? pointFrom(blocker.point) ?? origin.clone().addScaledVector(
        trajectoryDirection, nonNegative(blocker.distance),
      )
      : intendedEnd.clone();
    const hit = candidateHit && !blocked;
    let result = null;
    if (hit) {
      const amount = nonNegative(options.damage)
        * nonNegative(options.damageScale ?? 1, 1)
        * materialPath.remainingEnergy;
      const raw = intendedActor.applyHit({
        amount,
        attacker: options.attacker,
        playerShot: options.playerShot === true,
        matrix: options.matrix,
      });
      result = Object.freeze({ ...raw });
    }
    const comparisonPoint = livePoint ?? aimPoint;
    const missDistance = hit ? 0 : end.distanceTo(comparisonPoint);
    const nearMiss = !hit && !blocked && !aimPath.blocked
      && missDistance <= this.nearMissRadius;
    const whiz = nearMiss && this.whizCooldown <= 0;
    if (whiz) this.whizCooldown = this.whizCooldownSeconds;
    const blockerRecord = blocker ? {
      box: blocker.box ?? null,
      id: blocker.id ?? null,
      distance: nonNegative(blocker.distance),
      point: end.clone(),
      material: blocker.material ?? null,
      thickness: nonNegative(blocker.thickness),
    } : null;
    return {
      fired: true,
      reason: null,
      origin: origin.clone(),
      direction: trajectoryDirection.clone(),
      boreDirection: boreDirection.clone(),
      end: end.clone(),
      blocked,
      blocker: blockerRecord,
      hit,
      nearMiss,
      whiz,
      distance: origin.distanceTo(end),
      missDistance,
      damage: result?.applied ? result.damage : 0,
      applied: result?.applied === true,
      fatal: result?.fatal === true,
      result,
      targetId: intendedTargetId,
      actor: intendedActor,
      areaFire,
      boreError,
      contacts: materialPath.contacts,
      remainingEnergy: materialPath.remainingEnergy,
      remainingPenetration: materialPath.remainingPenetration,
    };
  }
}
