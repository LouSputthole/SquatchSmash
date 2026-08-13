function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function wrapAngle(value) {
  let angle = finite(value);
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  return angle;
}

/**
 * Presentation-neutral description of one incoming hit.
 *
 * Scenes may render this as a wedge, flash, controller pulse, or accessibility
 * cue, but the classification and bearing remain identical everywhere.
 */
export function resolveCombatFeedback({
  damage = 0,
  absorbed = 0,
  armorBroken = false,
  fatal = false,
  fromPosition = null,
  listenerPosition = null,
  listenerYaw = 0,
} = {}) {
  const healthDamage = Math.max(0, finite(damage));
  const armorDamage = Math.max(0, finite(absorbed));
  const dx = finite(fromPosition?.x) - finite(listenerPosition?.x);
  const dz = finite(fromPosition?.z) - finite(listenerPosition?.z);
  const bearing = wrapAngle(Math.atan2(dx, dz) - finite(listenerYaw));
  const absolute = Math.abs(bearing);
  const sector = absolute <= Math.PI / 4 ? 'front'
    : absolute >= Math.PI * 3 / 4 ? 'back'
      : bearing > 0 ? 'right' : 'left';
  const kind = fatal === true ? 'fatal'
    : armorBroken === true ? 'armor-break'
      : armorDamage > 0 ? 'armor-hit' : 'health-hit';
  return Object.freeze({
    kind,
    bearing,
    sector,
    damage: healthDamage,
    absorbed: armorDamage,
    armorBroken: armorBroken === true,
    fatal: fatal === true,
  });
}
