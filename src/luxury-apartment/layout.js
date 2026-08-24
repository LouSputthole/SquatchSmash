/** Pure spatial contract for the luxury apartment.
 *
 * The shared Player asks groundAt(x, z) with no vertical hint. Therefore the
 * two walkable storeys never share an X/Z footprint: the inaccessible service
 * plinth fills the volume beneath the north loft, while the loft overlooks the
 * double-height south floor across its open rail. The stair is the sole
 * transition and advances in real, sub-step-height increments.
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
  bathroom: Object.freeze({ x0: -6.95, x1: -2.45, z0: -7.70, z1: -4.25 }),
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

/** Two-argument ground resolver compatible with the shared Player. */
export function luxuryGroundAt(x, z) {
  const { stair, loft, loftY, mainY } = LUXURY_LAYOUT;
  if (insideRect(x, z, stair)) return luxuryStairHeightAt(z);
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
