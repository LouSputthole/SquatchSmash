/**
 * Pure runway-lineup decision shared by the mission and its Node test.
 * Keeping this free of Three.js lets release CI exercise the soft-lock guard
 * without installing a second copy of the browser-vendored renderer.
 */
export function evaluateLineupGate({
  distance,
  headingError,
  groundSpeed,
  onGround,
  agl,
  airspeedKnots,
}) {
  const airborne = !onGround && (agl > 2 || airspeedKnots > 40);
  const aligned = distance < 13 && headingError < 24 && groundSpeed < 8;
  return Object.freeze({ airborne, ready: aligned || airborne });
}
