const LEGACY_AUTO_FACING_RADIUS = 0.6;

/**
 * Pick the best visible point target for the Motel's legacy interaction list.
 *
 * Most of the old lot prompts intentionally keep the forgiving close-range
 * shortcut. Small authored cabin surfaces opt into `requiresAim`, which uses
 * the real three-dimensional view vector even when the target is centimetres
 * from Tony. That keeps the case, glovebox, Snow, and passenger door distinct
 * without assigning any one of them an unconditional priority.
 */
export function selectPointInteraction({ eye, facing, targets }) {
  let best = null;
  let bestScore = -Infinity;

  for (const target of targets) {
    const point = target.point ?? target;
    const dx = point.x - eye.x;
    const dy = (Number.isFinite(point.y) ? point.y : eye.y) - eye.y;
    const dz = point.z - eye.z;
    const distance = Math.hypot(dx, dy, dz);
    const reachDistance = Number.isFinite(target.distance) ? target.distance : distance;
    if (reachDistance > (target.r || 3.2)) continue;

    const horizontalDistance = Math.hypot(dx, dz);
    let dot;
    if (target.requiresAim) {
      dot = distance < 1e-6
        ? 1
        : (dx * facing.x + dy * facing.y + dz * facing.z) / distance;
    } else {
      dot = horizontalDistance < LEGACY_AUTO_FACING_RADIUS
        ? 1
        : (dx * facing.x + dz * facing.z) / horizontalDistance;
    }
    if (dot < (target.minDot ?? -0.2)) continue;

    const score = dot * 2 - reachDistance * 0.12 + (target.priority ?? 0);
    if (score > bestScore) {
      best = target;
      bestScore = score;
    }
  }

  return best;
}
