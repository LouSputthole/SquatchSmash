/** Pure spatial contract for the luxury apartment.
 *
 * The shared Player asks groundAt(x, z) with no vertical hint. Therefore the
 * broad public floors do not share an X/Z footprint. The one intentional
 * exception is the main-floor bathroom tucked into the former service void
 * beside/under the top of the stair. `luxuryGroundAt` accepts the live eye Y
 * for that stacked room while preserving the two-argument Player fallback.
 * The stair remains the sole transition and advances in real, safe increments.
 */

export const LUXURY_LAYOUT = Object.freeze({
  x0: -11,
  x1: 11,
  z0: -8,
  z1: 8,
  mainY: 0,
  loftY: 3.30,
  ceilingY: 6.80,
  wall: 0.22,
  main: Object.freeze({ x0: -10.78, x1: 10.78, z0: -0.72, z1: 7.78 }),
  loft: Object.freeze({ x0: -10.78, x1: 10.78, z0: -7.78, z1: -0.92 }),
  stair: Object.freeze({ x0: -9.72, x1: -7.72, z0: -0.92, z1: 4.72, steps: 18 }),
  bathroom: Object.freeze({
    x0: -10.68,
    // The finished room now claims the unused service bay east of the stair
    // instead of compressing a tub, toilet and vanity into the old footprint.
    x1: -6.98,
    z0: -4.08,
    z1: -0.98,
    // The south opening uses the service bay beside the west stair rail. The
    // previous opening sat inside the stair footprint, so the continuous rail
    // collider made a visually plausible bathroom impossible to enter.
    doorX0: -10.58,
    doorX1: -9.795,
  }),
  elevatorCab: Object.freeze({ x0: 6.78, x1: 8.92, z0: -2.24, z1: -0.72 }),
  bedroom: Object.freeze({ x0: 2.30, x1: 10.55, z0: -7.55, z1: -3.10 }),
  office: Object.freeze({ x0: -1.70, x1: 2.15, z0: -7.20, z1: -3.20 }),
  entry: Object.freeze({ x: -11, z0: 4.90, z1: 6.58, h: 2.46 }),
});

export const LUXURY_STAIR_RISE = LUXURY_LAYOUT.loftY / LUXURY_LAYOUT.stair.steps;
export const LUXURY_STAIR_RUN = (LUXURY_LAYOUT.stair.z1 - LUXURY_LAYOUT.stair.z0)
  / LUXURY_LAYOUT.stair.steps;

export function insideRect(x, z, rect, epsilon = 0) {
  return x >= rect.x0 - epsilon && x <= rect.x1 + epsilon
    && z >= rect.z0 - epsilon && z <= rect.z1 + epsilon;
}

/** Quantised walking height of one real stair tread. */
export function luxuryStairHeightAt(z) {
  const stair = LUXURY_LAYOUT.stair;
  const progress = Math.max(0, Math.min(1, (stair.z1 - z) / (stair.z1 - stair.z0)));
  const tread = Math.min(stair.steps, Math.floor(progress * stair.steps + 1e-7));
  return tread * LUXURY_STAIR_RISE;
}

/** Floor resolver compatible with the shared Player and stacked bathroom. */
export function luxuryGroundAt(x, z, currentY = null) {
  const { stair, loft, main, bathroom, elevatorCab, loftY, mainY } = LUXURY_LAYOUT;
  if (insideRect(x, z, stair)) return luxuryStairHeightAt(z);
  const insideBathroomThreshold = x >= bathroom.doorX0 && x <= bathroom.doorX1
    && z >= bathroom.z1 && z <= main.z0;
  if (insideRect(x, z, bathroom) || insideRect(x, z, elevatorCab) || insideBathroomThreshold) {
    // Player position is eye height: ~1.66m downstairs and ~4.96m upstairs.
    // A missing hint intentionally resolves to the bathroom for interactions
    // and direct verification; the live floor-aware adapter always supplies Y.
    // The threshold must participate in this stacked-floor rule as well: its
    // north 6 cm overlaps the loft's X/Z rectangle, which previously lifted a
    // downstairs player toward the upper floor before dropping them back.
    if (!Number.isFinite(currentY) || currentY < loftY + 0.55) return mainY;
    return loftY;
  }
  if (insideRect(x, z, loft)) return loftY;
  return mainY;
}

export function luxuryStairProfile() {
  const { stair } = LUXURY_LAYOUT;
  return Array.from({ length: stair.steps + 1 }, (_, index) => Object.freeze({
    index,
    z: stair.z1 - index * LUXURY_STAIR_RUN,
    y: index * LUXURY_STAIR_RISE,
  }));
}
