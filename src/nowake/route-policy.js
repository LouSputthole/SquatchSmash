/** Pure progression rules for NO WAKE's authored run down Gate C. */

export const NO_WAKE_DRIVE_SECONDS = 90;

/**
 * The authored channel into the inlet is 35 m wide off the wooded point
 * (the quarry that used to close the other side is gone; the number stays).
 * Keeping the cruiser centre within 10.5 m of the authored centreline leaves
 * visible water around the 2.56 m half-beam on both sides. The longitudinal
 * window accepts the measured 90-second approach without accepting an
 * odometer's worth of circles, reversals, or a run through the back wall.
 */
export const NO_WAKE_INLET_WINDOW = Object.freeze({
  nearTolerance: 7,
  farTolerance: 15,
  lateralHalfWidth: 10.5,
});

export function isNoWakeInletPosition({ x, z, inlet }) {
  if (![x, z, inlet?.x, inlet?.z].every(Number.isFinite)) return false;
  const { nearTolerance, farTolerance, lateralHalfWidth } = NO_WAKE_INLET_WINDOW;
  return Math.abs(x - inlet.x) <= lateralHalfWidth
    && z <= inlet.z + nearTolerance
    && z >= inlet.z - farTolerance;
}

export function shouldReachNoWakeInlet({ driveSeconds, x, z, inlet }) {
  return Number.isFinite(driveSeconds)
    && driveSeconds >= NO_WAKE_DRIVE_SECONDS
    && isNoWakeInletPosition({ x, z, inlet });
}

/** Return every line whose authored timestamp has elapsed, in source order. */
export function takeDueCruiseLines(lines, index, driveSeconds) {
  const due = [];
  let nextIndex = Math.max(0, Number.isInteger(index) ? index : 0);
  while (nextIndex < lines.length && driveSeconds >= lines[nextIndex].at) {
    due.push(lines[nextIndex]);
    nextIndex++;
  }
  return { due, nextIndex };
}
