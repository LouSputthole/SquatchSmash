const PENETRABLE = new Set(['glass', 'drywall', 'wood_thin', 'car_door']);

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
        amount: remaining, attacker, playerShot, matrix,
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
    if (!hit.actor) continue;
    if (hit.actor === intendedTarget) return true;
    if (!matrix.canDamage(attacker, hit.actor)) return false;
  }
  return false;
}
