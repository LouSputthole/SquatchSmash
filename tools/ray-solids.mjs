/**
 * RAY MATHS AGAINST THE SHAPES THIS PROJECT ACTUALLY AUTHORS.
 *
 * A box test and a circle test, and one function that picks between them on
 * what the builder wrote. It lives on its own because there are now THREE
 * callers and not two: the framing gate asking whether a speaker can be seen,
 * the staging gate asking whether a man is facing a wall, and the framing
 * gate's own camera-inside test. It was deliberately left inline while there
 * were two -- a second caller is a coincidence, a third is a module -- and the
 * third arrived the day the staging gate started reporting APE facing a
 * Lincoln that his eyeline passes cleanly beside.
 *
 * THE THING BOTH GATES GOT WRONG THE SAME WAY. Initiation authors its woods
 * and its car park as `{x, z, r}` circles, and the collider reader gives each
 * of them its circumscribing axis-aligned box. That is right for walking into
 * a trunk -- a walker stopped a hand's breadth early has been stopped -- and
 * wrong for seeing past one, because a square is wider than the circle it
 * contains at the diagonals, by up to 41 per cent of the radius. It cost the
 * framing gate five findings and the staging gate one, and every one of them
 * was cast against rendered geometry and hit nothing.
 *
 * Nothing here knows what a scene is. Give it numbers.
 */

/**
 * Distance from `origin` along unit `dir` to the first hit on an axis-aligned
 * box, or Infinity.  The standard slab test; `Infinity` for a parallel miss is
 * the whole reason the degenerate branch is written out rather than divided.
 */
export function rayBoxDistance(origin, dir, box) {
  let near = 0;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const d = dir[axis];
    const o = origin[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return Infinity;
  }
  return far < 0 ? Infinity : near;
}

/**
 * Distance from `origin` along unit `dir` to the first hit on an UPRIGHT
 * cylinder, or Infinity. Same contract as `rayBoxDistance` in every respect,
 * including the zero it returns for an origin already inside the solid.
 *
 * THE FINDINGS THIS EXISTS TO SETTLE. Initiation authors its woods and its car
 * park as `{x, z, r}` circles, and the collider reader gives each of them its
 * circumscribing axis-aligned box, which is right for walking into a trunk and
 * wrong for seeing past one: a square is wider than the circle it contains at
 * the diagonals, by up to 41 per cent of the radius. Five sightlines read as
 * blocked on that margin -- Kittenboss behind a parked Lincoln three times
 * over, the player at the cabin door behind another, and `speech-start`'s
 * camera declared to be standing inside a third -- and every one of them was
 * cast against the RENDERED geometry of both states and hit nothing.
 *
 * The y band is the box's, untouched: a trunk really is tall, and this changes
 * the SHAPE and nothing else. The slab half is written the same way the box
 * test writes it, degenerate branch and all, so the two agree on a ray that
 * runs parallel to the cap.
 */
export function rayCylinderDistance(origin, dir, cylinder) {
  let near = 0;
  let far = Infinity;
  if (Math.abs(dir[1]) < 1e-9) {
    if (origin[1] < cylinder.minY || origin[1] > cylinder.maxY) return Infinity;
  } else {
    let t0 = (cylinder.minY - origin[1]) / dir[1];
    let t1 = (cylinder.maxY - origin[1]) / dir[1];
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return Infinity;
  }
  const ox = origin[0] - cylinder.x;
  const oz = origin[2] - cylinder.z;
  const a = dir[0] * dir[0] + dir[2] * dir[2];
  const c = ox * ox + oz * oz - cylinder.r * cylinder.r;
  if (a < 1e-12) {
    /* Straight up or straight down the axis. There is no quadratic to solve:
     * the ray is either inside the circle for its whole length or never
     * enters it, and the caps are the only thing left to hit -- which the y
     * slab above has already worked out. */
    if (c > 0) return Infinity;
  } else {
    const b = 2 * (ox * dir[0] + oz * dir[2]);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return Infinity;
    const root = Math.sqrt(discriminant);
    const t0 = (-b - root) / (2 * a);
    const t1 = (-b + root) / (2 * a);
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return Infinity;
  }
  return far < 0 ? Infinity : near;
}

/**
 * The first hit on a solid, tested as the shape its author actually wrote.
 *
 * A solid that carries no `shape` was authored as a box and is one; only a
 * collider the scene wrote as a circle gets the circle.
 */
export function solidDistance(origin, dir, solid) {
  if (solid.shape?.kind !== 'cylinder') return rayBoxDistance(origin, dir, solid);
  return rayCylinderDistance(origin, dir, {
    x: solid.shape.x,
    z: solid.shape.z,
    r: solid.shape.r,
    minY: solid.min[1],
    maxY: solid.max[1],
  });
}

/** Is this point in the masonry? Same shape rule as `solidDistance`. */
export function insideSolid(solid, [x, y, z]) {
  if (y < solid.min[1] || y > solid.max[1]) return false;
  if (solid.shape?.kind === 'cylinder') {
    return Math.hypot(x - solid.shape.x, z - solid.shape.z) <= solid.shape.r;
  }
  return x >= solid.min[0] && x <= solid.max[0] && z >= solid.min[2] && z <= solid.max[2];
}

