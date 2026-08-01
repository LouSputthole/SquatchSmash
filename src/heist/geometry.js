/** Pure driving-geometry query shared by runtime collision and unit tests. */
export function intersectsDrivingObstacle(x, z, obstacles, padding = 1.15) {
  return (obstacles ?? []).some((obstacle) => (
    Math.abs(x - obstacle.x) <= obstacle.w / 2 + padding
    && Math.abs(z - obstacle.z) <= obstacle.d / 2 + padding
  ));
}
