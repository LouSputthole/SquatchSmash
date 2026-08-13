import * as THREE from 'three';

import { AabbCombatSpace } from './spatial.js';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pointFrom(value) {
  if (value?.isVector3) return value.clone();
  if (!value || !Number.isFinite(value.x)
    || !Number.isFinite(value.y) || !Number.isFinite(value.z)) return null;
  return new THREE.Vector3(value.x, value.y, value.z);
}

function combatantPoint(combatant) {
  const direct = pointFrom(
    combatant?.point ?? combatant?.aimPoint ?? combatant?.position
      ?? combatant?.root?.position,
  );
  if (direct && !combatant?.point && !combatant?.aimPoint) {
    direct.y += Math.max(0, finite(combatant?.eye));
  }
  return direct;
}

function combatantId(combatant, order) {
  const id = combatant?.id ?? combatant?.combatId ?? combatant?.actor?.id;
  return id == null ? `~${String(order).padStart(10, '0')}` : String(id);
}

function suppressionOf(combatant) {
  const model = combatant?.suppression ?? combatant?.suppressionModel;
  return typeof model?.noteNearMiss === 'function' ? model : null;
}

/**
 * Apply one truthful player miss to nearby hostile suppression models.
 *
 * The shot endpoint bounds the finite segment, so a blocker naturally caps
 * the field. A second short collision query from the trajectory to each
 * candidate makes nearby side cover protective as well. This Module returns
 * data only; movement, barks, audio and HUD feedback remain Adapter-owned.
 */
export class CombatSuppressionField {
  constructor({
    radius = 1.25,
    energy = 1,
    space = null,
    colliders = null,
  } = {}) {
    this.radius = Math.max(0, finite(radius, 1.25));
    this.energy = Math.max(0, finite(energy, 1));
    this.space = space?.trace ? space : new AabbCombatSpace({ boxes: colliders ?? [] });
    this.colliders = colliders;
  }

  applyPlayerShot({ shot, combatants = [], space = null, colliders = null } = {}) {
    const origin = pointFrom(shot?.origin);
    const reportedEnd = pointFrom(shot?.end);
    const blockerEnd = shot?.blocked === true ? pointFrom(shot?.blocker?.point) : null;
    const end = blockerEnd ?? reportedEnd;
    const empty = {
      applied: false,
      suppressed: [],
      origin: origin?.clone() ?? null,
      end: end?.clone() ?? origin?.clone() ?? null,
      blocked: shot?.blocked === true,
    };
    if (shot?.fired !== true || shot?.hit === true || !origin || !end) return empty;

    const segment = end.clone().sub(origin);
    const lengthSq = segment.lengthSq();
    if (lengthSq <= 1e-10 || this.radius <= 0 || this.energy <= 0) return empty;
    const querySpace = space?.trace ? space : this.space;
    const queryBoxes = colliders ?? this.colliders;
    const candidates = [];
    let order = 0;
    for (const combatant of combatants ?? []) {
      const currentOrder = order++;
      if (!combatant || combatant.active === false || combatant.incapacitated === true
        || combatant.actor?.incapacitated === true) continue;
      const model = suppressionOf(combatant);
      const point = combatantPoint(combatant);
      if (!model || !point) continue;
      const along = point.clone().sub(origin).dot(segment) / lengthSq;
      /* A radius around the infinite ray (or a capsule beyond its endpoint)
       * would leak pressure to somebody just behind the terminal blocker. */
      if (along < 0 || along > 1) continue;
      const nearest = origin.clone().addScaledVector(segment, along);
      const distance = nearest.distanceTo(point);
      if (distance > this.radius) continue;
      const blocker = querySpace?.trace?.(
        nearest,
        point,
        queryBoxes == null ? undefined : { boxes: queryBoxes },
      ) ?? null;
      if (blocker) continue;
      candidates.push({
        combatant,
        model,
        id: combatantId(combatant, currentOrder),
        point,
        nearest,
        distance,
        along,
        order: currentOrder,
      });
    }

    candidates.sort((a, b) => {
      if (Math.abs(a.along - b.along) > 1e-9) return a.along - b.along;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return a.order - b.order;
    });
    const suppressed = candidates.map((candidate) => ({
      id: candidate.id,
      combatant: candidate.combatant,
      distance: candidate.distance,
      point: candidate.point.clone(),
      nearest: candidate.nearest.clone(),
      value: candidate.model.noteNearMiss(candidate.distance, this.energy),
    }));
    return {
      ...empty,
      applied: suppressed.length > 0,
      suppressed,
    };
  }

  /** The field is deliberately stateless; combatants own durable pressure. */
  reset() {
    return false;
  }
}
