/** Assistance is presentation only: it never completes or rewinds a mission. */
export const OBJECTIVE_NUDGE_SECONDS = 45;
export const OBJECTIVE_REVEAL_SECONDS = 14;

export function createObjectiveGuideClock() {
  let key = null;
  let idle = 0;
  let manual = 0;
  let nearest = Infinity;
  return {
    reveal() { manual = OBJECTIVE_REVEAL_SECONDS; },
    update({ step, distance, active, dt }) {
      if (!active || !step || !Number.isFinite(distance)) return false;
      const elapsed = Math.max(0, Math.min(0.25, Number(dt) || 0));
      if (step !== key) {
        key = step;
        idle = 0;
        nearest = distance;
      }
      // Walking toward the target is progress, even before a quest flag changes.
      if (distance < nearest - 1.5) {
        nearest = distance;
        idle = 0;
      }
      idle += elapsed;
      manual = Math.max(0, manual - elapsed);
      return manual > 0 || idle >= OBJECTIVE_NUDGE_SECONDS;
    },
    clear() { key = null; idle = 0; manual = 0; nearest = Infinity; },
  };
}

/** Camera-space direction, with a stable edge arrow for points behind us. */
export function objectiveMarkerPosition({ x, y, z }, { width, height, fov, aspect }) {
  if (![x, y, z, width, height, fov, aspect].every(Number.isFinite)
    || width <= 0 || height <= 0 || aspect <= 0 || fov <= 0 || fov >= 180) return null;
  const tangent = Math.tan(fov * Math.PI / 360);
  const depth = Math.max(0.01, Math.abs(z));
  let dx = x / (depth * tangent * aspect);
  let dy = -y / (depth * tangent);
  const onScreen = z < 0 && Math.abs(dx) <= 0.82 && Math.abs(dy) <= 0.68;
  if (!onScreen) {
    // A point straight behind cannot project to the crosshair as if ahead.
    if (z >= 0 && Math.abs(dx) < 0.01) dx = 1;
    const scale = Math.max(Math.abs(dx) / 0.82, Math.abs(dy) / 0.68, 0.001);
    dx /= scale;
    dy /= scale;
  }
  return {
    x: (dx + 1) * width / 2,
    y: (dy + 1) * height / 2,
    onScreen,
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
  };
}
