const PENETRABLE = new Set(['glass', 'drywall', 'wood_thin', 'car_door']);
const MAX_PENETRABLE_THICKNESS = 0.35;
const ENERGY_RETENTION = 0.58;

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function clonePoint(value) {
  return typeof value?.clone === 'function' ? value.clone() : value ?? null;
}

function materialContact(contact) {
  const distance = finiteNonNegative(contact?.distance);
  const exitDistance = Math.max(
    distance,
    finiteNonNegative(contact?.exitDistance, distance + finiteNonNegative(contact?.thickness)),
  );
  return {
    ...contact,
    distance,
    exitDistance,
    thickness: Math.max(0, finiteNonNegative(contact?.thickness, exitDistance - distance)),
    point: clonePoint(contact?.point),
    exitPoint: clonePoint(contact?.exitPoint),
    material: typeof contact?.material === 'string' && contact.material.trim()
      ? contact.material.trim()
      : null,
  };
}

/**
 * Resolve a distance-sorted world-material path without applying actor damage.
 *
 * Only explicit known material tags may pass. Each passed surface spends both
 * penetration budget and presentation-neutral energy; an untagged, thick or
 * nonpenetrable contact is the truthful final blocker. Input contacts and
 * vectors are never mutated.
 */
export function resolveMaterialPath(contacts, {
  penetration = 0,
  energy = 1,
} = {}) {
  let remainingPenetration = Math.min(1, finiteNonNegative(penetration));
  let remainingEnergy = finiteNonNegative(energy);
  const resolved = [];
  let blocker = null;

  const ordered = [...(contacts ?? [])]
    .map((entry, order) => ({ entry: materialContact(entry), order }))
    .sort((a, b) => {
      const distance = a.entry.distance - b.entry.distance;
      if (Math.abs(distance) > 1e-9) return distance;
      const aId = String(a.entry.id ?? '');
      const bId = String(b.entry.id ?? '');
      if (aId !== bId) return aId < bId ? -1 : 1;
      return a.order - b.order;
    });

  for (const { entry } of ordered) {
    const energyBefore = remainingEnergy;
    const penetrationBefore = remainingPenetration;
    const declared = entry.material !== null;
    const thin = entry.thickness <= MAX_PENETRABLE_THICKNESS;
    const canPenetrate = declared
      && PENETRABLE.has(entry.material)
      && thin
      && remainingPenetration > 0
      && entry.thickness <= remainingPenetration
      && remainingEnergy > 0;
    if (canPenetrate) {
      remainingPenetration = Math.max(0, remainingPenetration - entry.thickness);
      remainingEnergy *= ENERGY_RETENTION;
    }
    const record = {
      ...entry,
      declared,
      penetrated: canPenetrate,
      stopped: !canPenetrate,
      energyBefore,
      energyAfter: remainingEnergy,
      penetrationBefore,
      penetrationAfter: remainingPenetration,
    };
    resolved.push(record);
    if (!canPenetrate) {
      blocker = record;
      break;
    }
  }

  return {
    blocked: blocker !== null,
    blocker,
    end: clonePoint(blocker?.point),
    contacts: resolved,
    remainingEnergy,
    remainingPenetration,
  };
}

/**
 * Resolve an already raycast and distance-sorted hit list. Keeping world
 * queries outside this pure function lets each Three.js scene use its own
 * collision acceleration without duplicating penetration and protection.
 */
export function resolveBallisticHits(hits, {
  attacker,
  damage,
  penetration = 0,
  playerShot = false,
  matrix,
  maxHits = 3,
} = {}) {
  let remaining = Math.max(0, Number(damage) || 0);
  let penetrationLeft = Math.max(0, Math.min(1, Number(penetration) || 0));
  const resolved = [];
  for (const hit of [...hits].sort((a, b) => a.distance - b.distance).slice(0, maxHits)) {
    if (remaining <= 0) break;
    const entry = { ...hit, damage: 0, stopped: false };
    if (hit.actor) {
      const result = hit.actor.applyHit({
        amount: remaining, attacker, playerShot, matrix, lethal: hit.lethal === true,
      });
      entry.damage = result.applied ? result.damage : 0;
      entry.result = result;
      entry.stopped = true;
      resolved.push(entry);
      break;
    }
    const material = hit.material ?? 'concrete';
    const thin = PENETRABLE.has(material) && (hit.thickness ?? 1) <= 0.35;
    if (!thin || penetrationLeft <= 0) {
      entry.stopped = true;
      resolved.push(entry);
      break;
    }
    penetrationLeft = Math.max(0, penetrationLeft - (hit.thickness ?? 0.2));
    remaining *= 0.58;
    resolved.push(entry);
  }
  return resolved;
}

export function lineOfFireClear(hits, intendedTarget, matrix, attacker) {
  for (const hit of [...hits].sort((a, b) => a.distance - b.distance)) {
    /* This helper has no penetration budget. Any piece of world geometry in
     * front of the intended actor therefore makes the line unsafe/blocked. */
    if (!hit.actor) return false;
    if (hit.actor === intendedTarget) return true;
    if (!matrix.canDamage(attacker, hit.actor)) return false;
  }
  return false;
}
