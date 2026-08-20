/** Pure driving-geometry query shared by runtime collision and unit tests. */
export function intersectsDrivingObstacle(x, z, obstacles, padding = 1.15) {
  return (obstacles ?? []).some((obstacle) => (
    Math.abs(x - obstacle.x) <= obstacle.w / 2 + padding
    && Math.abs(z - obstacle.z) <= obstacle.d / 2 + padding
  ));
}

/**
 * Where a customer running for the bank doors is heading this step.
 *
 * PURE, and shared by the runtime and the test for the same reason the driving
 * query above is: a route the browser walks and a route a test walks have to
 * be the same route or the test proves nothing.
 *
 * A straight line at the doors plus the combat space's own axis slide gets
 * most of the lobby out. The ones it does not are the four tellers, who start
 * BEHIND seventeen metres of solid oak — so anybody back there is given a
 * three-leg route round the east end of it instead. The legs are in the body
 * below, with the reason for each.
 *
 * @param {{x: number, z: number}} position
 * @returns {{x: number, z: number}} the point to steer at now
 */
export function bankBoltGoal(position) {
  const TELLER_LINE_Z = -1.6;
  const EAST_AISLE_X = 9.9;
  const DOOR_Z = 10.2;
  const COLUMN_LINE_Z = 6.5;
  /* Leg one: OUT ALONG the counter at his own z, never at an angle into it.
   * Steering at the doors from behind the teller line means steering into
   * seventeen metres of oak, and an axis slide along a wall that long never
   * finds the end of it — the slide pushes toward the door's x, which is the
   * middle of the counter, so a teller runs on the spot against the back of
   * it forever. Which is the bug this route exists to fix, moved four metres.
   */
  if (position.z < TELLER_LINE_Z) {
    if (position.x < EAST_AISLE_X - 0.5) return { x: EAST_AISLE_X, z: position.z };
    // Leg two: up the east aisle, past the end of the counter.
    return { x: EAST_AISLE_X, z: 0.4 };
  }
  /* Leg three: clear of the waiting seats (x 7.7–9.1, z 1.8–3.2) before he
   * turns for the doors. EAST rather than west throughout because the west
   * end of the counter has the deposit box wall beside it and the gap between
   * the two is 34 cm, and a person is 72 cm wide. */
  if (position.x > EAST_AISLE_X - 0.9 && position.z < 3.4) {
    return { x: EAST_AISLE_X, z: 4.2 };
  }
  /* Leg four: onto the doorway's own lane BEFORE crossing the column line.
   * The four columns stand at x ±4.4 and ±8, all at z 7, and a diagonal at
   * the doors from anywhere on the east floor runs straight into one — where
   * the runner pins flat against its south face and the axis slide has no
   * lateral component left to get him round it. The central gap between the
   * two inner columns is 8.8 m wide and the doors are in the middle of it, so
   * squaring up south of them and then running straight is both the safe
   * route and what a person sprinting at a door does.
   *
   * The condition is about being OFF the lane rather than about a z line: a
   * waypoint you switch away from the instant you touch it is a waypoint you
   * arrive at and stop on, which is how the first attempt parked a runner on
   * (-2.40, 5.80) for the rest of the robbery. */
  const doorX = position.x < 0 ? -2.4 : 2.4;
  if (position.z < COLUMN_LINE_Z && Math.abs(position.x - doorX) > 0.35) {
    return { x: doorX, z: Math.min(position.z + 1.5, COLUMN_LINE_Z - 0.7) };
  }
  return { x: doorX, z: DOOR_Z };
}
