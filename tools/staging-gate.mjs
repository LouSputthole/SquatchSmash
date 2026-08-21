/**
 * The staging gate: pure analysis of where a scene's cast is standing, and
 * which way they are pointed.
 *
 * The geometry gate answers "is this scenery built right".  This answers the
 * other half of the same question -- "are the PEOPLE in it standing in it
 * right" -- because that is the half the owner kept having to answer by
 * playing the scene.  Every check below is one of his notes, turned into an
 * assertion:
 *
 *   - "they are all looking forward at the same spot"   -> FACING_UNIFORM
 *   - "he is facing the wall"                           -> FACING_INTO_SOLID
 *   - "they are standing in the seats"                  -> SEAT_STANDING
 *   - "the manager walks into the vault before it opens"-> ACTOR_INSIDE_SOLID
 *   - "the cops spawned behind me"                      -> SPAWN_BEHIND_PLAYER
 *
 * Pure on purpose, exactly like tools/geometry-gate.mjs: it takes numbers and
 * returns findings, imports nothing, and touches no scene graph.  The building
 * lives in tools/verify-staging.mjs.  A gate that can build its own input is a
 * gate that can be wrong about the input and the analysis at the same time.
 */

/** Yaws closer than this are treated as the same direction. Radians (~2.3°). */
export const UNIFORM_YAW_TOLERANCE_RAD = 0.04;

/** How many actors sharing one yaw stops reading as coincidence. */
export const UNIFORM_YAW_MIN_GROUP = 3;

/** Nose-to-wall distance under which an actor is staring at masonry. Metres. */
export const FACING_WALL_DISTANCE_M = 0.8;

/** How far above a seat's cushion hips may sit before they are standing on it. */
export const SEAT_HIP_TOLERANCE_M = 0.35;

/**
 * How close a person-sized solid has to be centred on an actor to BE him.
 *
 * Several scenes register a body collider per guest so the player can walk
 * into people rather than through them -- the Bing does it for all 22 party
 * guests. Those boxes are centred on their own actor at a measured 0.000 m,
 * so every one of those actors was reported as standing inside a solid, and
 * the solid was himself. That was 82 of the Bing's 106 findings: one fact,
 * written out 82 times in an allowlist.
 *
 * A man is not scenery. The rule is deliberately two-part -- centred on him
 * AND person-sized -- because a wall that happens to have its centre near
 * somebody is still a wall, and being inside THAT is still a finding. A box
 * centred on a DIFFERENT actor also still reports, which is the fault where
 * two people are standing in the same place.
 */
export const OWN_BODY_CENTRE_M = 0.15;
export const OWN_BODY_MAX_SPAN_M = 1.5;

/** Half-angle of the arc in front of the player that a wave may arrive in. */
export const SPAWN_FORWARD_ARC_RAD = Math.PI / 2;

const TAU = Math.PI * 2;

/** Signed smallest angle between two headings, in radians. */
export function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

const inside = (box, [x, y, z]) => x >= box.min[0] && x <= box.max[0]
  && y >= box.min[1] && y <= box.max[1]
  && z >= box.min[2] && z <= box.max[2];

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

/** Is this solid the actor's own body collider? See OWN_BODY_CENTRE_M. */
export function isOwnBody(box, actor) {
  const spanX = box.max[0] - box.min[0];
  const spanZ = box.max[2] - box.min[2];
  if (spanX > OWN_BODY_MAX_SPAN_M || spanZ > OWN_BODY_MAX_SPAN_M) return false;
  const centreX = (box.min[0] + box.max[0]) / 2;
  const centreZ = (box.min[2] + box.max[2]) / 2;
  if (Math.hypot(centreX - actor.position[0], centreZ - actor.position[2]) > OWN_BODY_CENTRE_M) {
    return false;
  }
  /* AND IT HAS TO COME UP TO HIS EYE.
   *
   * Person-sized-and-centred-on-him was not enough, because a cinema
   * recliner is person-sized (measured 1.00 x 0.88 m) and centred on the man
   * sitting in it to within 0.02 m. The mansion's theatre chairs were
   * therefore read as the sitters' own bodies, and forty-two
   * ACTOR_INSIDE_SOLID findings stopped firing -- while the fault they
   * described was still there. Measured on mansion:tour, lag's hips sit at
   * -1.837 inside a box running -2.500 to -1.600, exactly as the allowlist
   * entry says they do. The gate had gone quiet, the entries read as stale,
   * and deleting them as stale would have thrown away the only record of it.
   *
   * A body collider runs from the feet to over the head -- cast.ape measures
   * 0 to 1.94 against an eye at 1.75 -- and furniture does not. The eye is
   * already on the marker, so this costs nothing and needs no new number. */
  return actor.eye[1] >= box.min[1] && actor.eye[1] <= box.max[1];
}

const finding = (kind, actor, detail) => ({
  kind,
  id: actor.id,
  role: actor.role,
  posture: actor.posture,
  position: actor.position.map((n) => Math.round(n * 1000) / 1000),
  ...detail,
});

/**
 * Actors of one role, standing near each other, pointed the same way.
 *
 * Grouped by role because a rank of guards facing one way is staging and a
 * rank of CUSTOMERS facing one way is the bug; and bucketed by proximity
 * because two people at opposite ends of a street sharing a heading is a
 * coincidence, not a formation.
 */
function uniformFacing(actors, { radius = 6 }) {
  const findings = [];
  const byRole = new Map();
  for (const actor of actors) {
    if (!byRole.has(actor.role)) byRole.set(actor.role, []);
    byRole.get(actor.role).push(actor);
  }
  for (const [role, group] of byRole) {
    const claimed = new Set();
    for (const anchor of group) {
      if (claimed.has(anchor.id)) continue;
      const cohort = group.filter((other) => !claimed.has(other.id)
        && Math.hypot(other.position[0] - anchor.position[0], other.position[2] - anchor.position[2]) <= radius
        && Math.abs(angleDelta(other.yaw, anchor.yaw)) <= UNIFORM_YAW_TOLERANCE_RAD);
      if (cohort.length < UNIFORM_YAW_MIN_GROUP) continue;
      for (const member of cohort) claimed.add(member.id);
      findings.push(finding('FACING_UNIFORM', anchor, {
        role,
        cohort: cohort.map((member) => member.id).sort(),
        yawDeg: Math.round((anchor.yaw * 180) / Math.PI * 10) / 10,
      }));
    }
  }
  return findings;
}

/** Everything the gate can say about one built scene state. */
export function stagingFindings({
  id, actors = [], boxes = [], seats = {}, player = null, uniformRadius = 6,
} = {}) {
  const findings = [];

  const ids = new Set();
  for (const actor of actors) {
    if (ids.has(actor.id)) findings.push(finding('ACTOR_ID_DUPLICATE', actor, {}));
    ids.add(actor.id);
  }

  findings.push(...uniformFacing(actors, { radius: uniformRadius }));

  /* Which solids are somebody's body, computed once rather than per ray.
   * Bing state: 51 actors against 147 boxes, and the facing loop below would
   * otherwise ask the question 51 times per box. */
  const bodyBoxes = new Set(boxes.filter((box) => actors.some((a) => isOwnBody(box, a))));

  for (const actor of actors) {
    /* In a vehicle, the two "he is in the masonry" checks are meaningless:
     * the masonry is the car and he is supposed to be in it. */
    const riding = actor.posture === 'ride';

    // Facing a wall. The ray starts at the eye and runs along the face axis.
    let nearest = Infinity;
    let hit = null;
    /* `actor.seat` is what collectActors resolved -- the pose's seat where a
     * pose set one, the marker's otherwise. The `actor.actor` fallback keeps
     * hand-built actors in the unit tests working. */
    const seatAssembly = actor.seat ?? actor.actor?.seat ?? null;
    for (const box of boxes) {
      /* ANYBODY'S body box, not just his own.
       *
       * His own is the obvious one: it is centred on his eye, so the ray
       * starts inside it and every actor would read as facing a wall at zero
       * metres. But the ray used to skip ONLY his own, and so the two men
       * squaring up in bing:attack each reported facing a wall at 0.68 m --
       * and the wall was the other man. A person is not masonry, and two
       * characters at arm's length is the staging working, not a defect.
       *
       * ACTOR_INSIDE_SOLID below deliberately keeps the his-own-body test:
       * a man standing INSIDE another man is still a bug, even though a man
       * LOOKING AT another man is not. */
      if (bodyBoxes.has(box)) continue;
      /* The seat he is sitting in.
       *
       * A booth is authored as one box from the floor to the top of its back
       * -- it has to be, because it is the thing the player walks into -- so
       * a seated head is inside it by construction. That is what sitting in
       * a booth IS. Twenty-four of the Bing's seated regulars reported
       * facing a wall at zero metres, and the wall was their own booth.
       *
       * Skipped by the assembly id the actor NAMES, never by proximity or by
       * a height threshold: a rule that guessed which solid was his seat
       * would go on to excuse the sofa he is genuinely buried in, and an
       * earlier "seat swallows sitter" distance was dropped for exactly that
       * reason. A seat that gets renamed out from under the marker raises
       * SEAT_MISSING rather than quietly excusing nothing. */
      if (seatAssembly && box.assembly === seatAssembly) continue;
      const distance = rayBoxDistance(actor.eye, actor.forward, box);
      if (distance < nearest) { nearest = distance; hit = box; }
    }
    if (nearest < FACING_WALL_DISTANCE_M && !riding) {
      findings.push(finding('FACING_INTO_SOLID', actor, {
        distanceM: Math.round(nearest * 1000) / 1000,
        solid: hit?.name ?? null,
      }));
    }

    // Standing inside something. Measured at the hip, which is the one height
    // that is inside a body for every posture the marker knows.
    //
    // EXCEPT WHEN HE IS IN A CAR. A rider is inside the vehicle's collider
    // because that is what riding in it means, and the Special Meeting's
    // sedan is one solid box from the road to 2.28 m with the cabin inside
    // it -- it has to be, because it is the wall the player walks round.
    // Six ACTOR_INSIDE_SOLID and four FACING_INTO_SOLID on four seated men
    // is the gate reporting the scene working. The alternative on offer was
    // dropping the car from the audited set, which would blind the geometry
    // gate to the only moving wall in the scene.
    //
    // `sit` is NOT exempt: a man inside a sofa is still a bug. Only `ride`.
    if (!riding) {
      const swallowed = boxes.find((box) => inside(box, actor.hip) && !isOwnBody(box, actor));
      if (swallowed) {
        findings.push(finding('ACTOR_INSIDE_SOLID', actor, { solid: swallowed.name ?? null }));
      }
    }

    // Sitting on a seat, or standing on one.
    if (actor.posture === 'sit' && seatAssembly) {
      const seat = seats[seatAssembly];
      if (!seat) {
        findings.push(finding('SEAT_MISSING', actor, { seat: seatAssembly }));
      } else {
        const above = actor.hip[1] - seat.max[1];
        if (above > SEAT_HIP_TOLERANCE_M) {
          findings.push(finding('SEAT_STANDING', actor, {
            seat: seatAssembly,
            aboveCushionM: Math.round(above * 1000) / 1000,
          }));
        }
      }
    }

    // A wave that arrives behind you is not a wave, it is an ambush the
    // designer did not write. Only enemies are held to the arc.
    if (player && actor.role === 'enemy') {
      const bearing = Math.atan2(
        actor.position[0] - player.position[0],
        actor.position[2] - player.position[2],
      );
      if (Math.abs(angleDelta(bearing, player.yaw)) > SPAWN_FORWARD_ARC_RAD) {
        findings.push(finding('SPAWN_BEHIND_PLAYER', actor, {
          bearingDeg: Math.round((angleDelta(bearing, player.yaw) * 180) / Math.PI),
        }));
      }
    }
  }

  return { id, findings };
}
