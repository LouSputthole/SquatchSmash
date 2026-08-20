/**
 * INITIATION NIGHT — the site, as numbers.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE NIGHT THIS DESCRIBES
 *
 * A track through black woods ends in a churned mud clearing with two cars
 * idling their headlights across it. The prospects are lined up in that mud.
 * One answers wrong and is shot where he stands. Then the rest of them —
 * every one, including the woman who was alive in the boot ten minutes ago —
 * are walked out one at a time, put on their knees in the light, and shot in
 * the back of the head, in front of the man who is going to be made.
 *
 * Then he is walked up the trail, alone, to the cabin.
 *
 * The contrast is the whole point and it is built into these numbers: the
 * clearing is wide, wet, cold and lit by car bulbs; the cabin thirty-six
 * metres up the trail is small, warm, timbered and full of quiet men. One is
 * where the family kills people. The other is where it makes them.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS FILE HAS NO THREE IMPORT
 *
 * Six separate things have to agree about where a man kneels: the mud that is
 * drawn under him, the light that has to reach him, the executioner who walks
 * up behind him, the body that falls in front of him, the player standing in
 * the line who has to SEE it, and the tests that hold all five still. The
 * moment any of those carries its own copy of a number, one of them is wrong
 * and nothing says so. So every measurement lives here, in plain data, and
 * everything else reads it.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE FRAME (inherited from src/initiation/main.js — do not renumber)
 *
 *   +X is east. +Z is DOWNRANGE: the direction the player walks in, the
 *   direction the prospect line faces, the direction the old fire is in.
 *   The player arrives at (0, -78) and walks north to the clearing.
 *   The prospect line stands on z = -8. The player's slot in it is x = -2.2.
 *   Ground is y = 0 everywhere on this site; nothing here is on a slope.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TWO YAW CONVENTIONS, AND WHICH ONE EVERY NUMBER HERE USES
 *
 *   `core/person.js`'s Person: facing = (sin h, cos h), so h = 0 faces +z.
 *   `core/Player.js`'s camera: forward = (-sin y, -cos y), so y = 0 faces -z.
 *
 * EVERY heading in this file is a PERSON heading, because every figure this
 * file positions is a Person. The one exception is marked `cameraYaw`.
 * `headingToward()` below is the only correct way to derive one; hand-typed
 * headings are how a man ends up shooting the trees.
 */

/* ------------------------------------------------------------------ */
/* Small shared maths. No THREE, no allocation.                        */
/* ------------------------------------------------------------------ */

/** Person heading that looks from `from` at `to`. */
export function headingToward(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Unit facing vector for a Person heading. */
export function facingOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

/**
 * The figure's own right-hand side.
 *
 * three.js is right-handed with +y up, so a man facing +z has his right hand
 * toward -x — the opposite of the guess everybody makes first, and the reason
 * the executioner used to step round the wrong shoulder.
 */
export function rightOf(heading) {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

export const distance2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * How far `point` sits off the line `from`→`to`, in metres.
 *
 * This is the sightline test the whole execution staging is verified with: a
 * standing man is about 0.48 m across the shoulders, so anything closer than
 * that to the player's line of sight is standing in front of the thing he is
 * supposed to be watching.
 */
export function lateralOffsetFromLine(from, to, point) {
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const length = Math.hypot(vx, vz);
  if (length < 1e-9) return distance2D(from, point);
  const wx = point.x - from.x;
  const wz = point.z - from.z;
  return Math.abs(vx * wz - vz * wx) / length;
}

/** Half the shoulder width of a standing Person, used by every clearance check. */
export const SHOULDER_HALF_WIDTH = 0.48;

/* ------------------------------------------------------------------ */
/* The line-up, exactly as main.js already stands it                    */
/* ------------------------------------------------------------------ */

/**
 * These four numbers are COPIES of src/initiation/main.js's, and they are
 * copied on purpose: this module has to be buildable headless, and main.js is
 * a top-level WebGL boot script that cannot be imported without a canvas. The
 * staging test asserts they still match the source.
 */
export const LINE_Z = -8;
export const PLAYER_SLOT = Object.freeze({ x: -2.2, z: LINE_Z });
export const PROSPECT_XS = Object.freeze([-4.4, 0, 2.2, 4.4]);
export const LINE_CENTER = Object.freeze({ x: 0, z: LINE_Z });

/** Eye height of a man standing in the line. Everything visible is visible from here. */
export const PLAYER_EYE_Y = 1.62;
/** The point the sightline tests are run from. */
export const PLAYER_EYE = Object.freeze({ x: PLAYER_SLOT.x, y: PLAYER_EYE_Y, z: PLAYER_SLOT.z });

/* ------------------------------------------------------------------ */
/* THE EXECUTION GROUND                                                 */
/* ------------------------------------------------------------------ */

/**
 * The mud.
 *
 * Nineteen metres by eight of churned, rutted, standing-water ground, with
 * the prospect line standing IN it rather than at the edge of it — the mud is
 * on their shoes before anything happens, which is what makes Gratin's
 * apology about it land as manners rather than as a joke.
 *
 * It stops at z = -1.8 because the old fire ring's stones start at -2.6, and
 * a mud sheet drawn through a boulder is the kind of thing nobody notices
 * until the screenshot.
 */
export const MUD = Object.freeze({
  minX: -9.6, maxX: 9.6, minZ: -9.8, maxZ: -1.8,
  /** Decal height above the ground plane. Under the gate's 4 cm float gap. */
  y: 0.02,
});

export const CLEARING = Object.freeze({
  x: 0,
  z: -4.6,
  /** Trees stop here. Wide enough that the headlights die before the trunks. */
  radius: 15.5,
});

/**
 * Where Prospect One is shot.
 *
 * He is NOT put on his knees — he steps forward out of the line to answer,
 * gets it wrong, and is shot standing, which is what main.js already does
 * (`stepTo = { x: home.x, z: LINE_Z + 1.7 }`). Keeping him standing is what
 * makes the four that follow read as a decision rather than a procedure: the
 * first one is an execution, the rest are a clean-up.
 *
 * His body topples BACKWARD (main.js rotates the group about its feet), so it
 * lands between this mark and the line, and every kneel mark below is east of
 * it with metres to spare.
 */
export const STAND_MARK = Object.freeze({
  id: 'prospect-one',
  x: PROSPECT_XS[0],
  z: LINE_Z + 1.7,
});

/**
 * How far behind a kneeling man his executioner stands.
 *
 * A man putting a pistol to the back of somebody's head does not press it
 * there; he stands at the length of his own forearm and reaches. One metre is
 * that distance, and it is also — not coincidentally — far enough that the
 * shooter's own boots stay out of the fall.
 */
export const SHOOTER_REACH = 1.02;

/**
 * How far off the spine he stands.
 *
 * Nobody stands directly behind the head. He steps a hand's width to one side,
 * which is where a man puts himself when he does not want what comes out of
 * the front of the job on his own trousers. It also puts the muzzle clear of
 * the skull from where the player is standing, which is the only reason the
 * flash is visible at all.
 */
export const SHOOTER_OFFSET = 0.26;

/** How far off the player's line of sight the escort waits. */
export const ESCORT_CLEARANCE = 1.75;

/**
 * WHICH WAY A KNEELING MAN IS TURNED, and why it is not "at the player".
 *
 * They are put down facing the LINE — square-ish to it, turned a little in
 * toward its centre, each one at a slightly different angle because they are
 * being pushed down by hand and not parked. Three things fall out of that and
 * all three are the reason it is this and not something more cinematic:
 *
 *   1. The player is IN the line, so facing the line is facing him. He gets
 *      their faces, which is the entire point of doing it in front of him.
 *   2. The executioner ends up NORTH of the mark — further from the player
 *      than the man he is shooting — so he can never stand in front of what
 *      the player is supposed to be watching.
 *   3. They fall SOUTH, all four of them, in parallel, toward the line. The
 *      first pass turned each one to face the player's own slot instead, and
 *      the far mark's body then fell WEST, straight along the row and onto the
 *      next mark: the second man would have been put on his knees on top of
 *      the first one. Bodies fall across the working ground or they fall onto
 *      it, and there is no third option — so the row runs east-west and the
 *      fall runs north-south, at right angles, on purpose.
 */
export const KNEEL_AIM_INSET = 0.9;

/**
 * The four kneel marks, IN THE ORDER THEY ARE USED.
 *
 * They walk WESTWARD, toward the player, so each one is closer than the last:
 * seven metres away, then five and a half, then four, then under three. The
 * escalation is the staging doing the work that no line of dialogue is
 * allowed to do — by the time the last one is walked out, she is being put
 * down close enough for him to reach.
 *
 * The last one is KITTENBOSS, and she is last on purpose. She was alive in
 * the boot of the car parked forty feet behind the player, which is the only
 * evidence he has had all night that he is not the one being driven out here.
 *
 * `victim` is the default casting, and it is data rather than doctrine: the
 * ceremony code owns who is walked out. What this file owns is that wherever
 * they are put, the man behind them is behind them and the player can see it.
 */
const KNEEL_MARK_SOURCE = Object.freeze([
  Object.freeze({ id: 'kneel-1', victim: 'PROSPECT THREE', x: 4.30, z: -4.60, splay: 0.17 }),
  Object.freeze({ id: 'kneel-2', victim: 'PROSPECT FOUR', x: 2.55, z: -4.95, splay: -0.13 }),
  Object.freeze({ id: 'kneel-3', victim: 'PROSPECT FIVE', x: 0.80, z: -5.25, splay: 0.21 }),
  Object.freeze({ id: 'kneel-4', victim: 'KITTENBOSS', x: -0.95, z: -5.55, splay: -0.15 }),
]);

/** Where the head of a kneeling figure is. See KNEEL_POSE in staging.js. */
export const KNEEL_HEAD_Y = 1.28;

/**
 * How far a fallen body reaches from the knees it went down over.
 *
 * DERIVED FROM THE RIG, not estimated. `core/person.js` puts the head at local
 * y = 2.3 and the kneeling pose pins the knees 1.02 below the root, so the
 * crown is 1.28 m above the pivot; folding forward through 1.35 rad swings
 * that 1.28 x sin(1.35) = 1.25 m out along the facing. The head box and the
 * shoulders add about another quarter of a metre beyond the crown, and 1.5 is
 * the whole thing.
 *
 * The first pass wrote 2.3 here — the head's height mistaken for its reach —
 * which claimed a metre of body that does not exist. Every fall clearance on
 * this site is measured against this number, so getting it wrong in the OTHER
 * direction is a man put on his knees on top of the last one.
 */
export const FALL_REACH = 1.5;
/** Where the muzzle is when it is at the back of that head. */
export const MUZZLE_Y = 1.24;

/**
 * Which side of the spine the executioner steps to.
 *
 * MEASURED, not chosen: both sides are tried and the one that puts the muzzle
 * further off the player's line of sight to the head wins. On a mark east of
 * the player that is the man's left; on one west of him it flips. Hard-coding
 * a side is how you end up with the last execution of the night happening
 * behind the victim's own skull.
 */
function chooseShooterSide(mark, heading) {
  const facing = facingOf(heading);
  const right = rightOf(heading);
  const head = { x: mark.x, z: mark.z };
  let best = null;
  for (const side of [1, -1]) {
    const stance = {
      x: mark.x - facing.x * SHOOTER_REACH + right.x * SHOOTER_OFFSET * side,
      z: mark.z - facing.z * SHOOTER_REACH + right.z * SHOOTER_OFFSET * side,
    };
    const muzzle = {
      x: mark.x - facing.x * 0.16 + right.x * SHOOTER_OFFSET * side,
      z: mark.z - facing.z * 0.16 + right.z * SHOOTER_OFFSET * side,
    };
    const clearance = lateralOffsetFromLine(PLAYER_EYE, head, muzzle);
    if (best === null || clearance > best.clearance) best = { side, stance, muzzle, clearance };
  }
  return best;
}

function buildMark(source) {
  /* Turned to the line, angled in toward its centre, then nudged off square. */
  const heading = headingToward(source, { x: source.x - KNEEL_AIM_INSET, z: LINE_Z })
    + source.splay;
  const facing = facingOf(heading);
  const chosen = chooseShooterSide(source, heading);
  return Object.freeze({
    id: source.id,
    victim: source.victim,
    x: source.x,
    z: source.z,
    /** Person heading for the KNEELING figure. */
    heading,
    /** Where the executioner stands, and which way he faces (at the head). */
    shooter: Object.freeze({
      x: chosen.stance.x,
      z: chosen.stance.z,
      heading: headingToward(chosen.stance, source),
      side: chosen.side,
    }),
    /** Where the second man waits while it happens — out of the sightline. */
    escort: Object.freeze(escortStanceFor(source)),
    /** The point the muzzle occupies at the moment of the shot. */
    muzzle: Object.freeze({ x: chosen.muzzle.x, y: MUZZLE_Y, z: chosen.muzzle.z }),
    /** The head that muzzle is behind. */
    head: Object.freeze({ x: source.x, y: KNEEL_HEAD_Y, z: source.z }),
    /**
     * Where the body ends up. Shot from behind, a man goes down FORWARD, so
     * the fall runs from the mark toward the line — toward the player, which
     * is why the last of them finishes at his feet.
     */
    fall: Object.freeze({
      x: source.x + facing.x * FALL_REACH,
      z: source.z + facing.z * FALL_REACH,
      heading,
      halfWidth: 0.32,
    }),
  });
}

/**
 * Where the second man stands while the first one does it.
 *
 * ACROSS the player's line of sight, not along it, and on the NORTH side of
 * the mark. Both halves of that are the result of getting it wrong twice.
 *
 *   - Measured along the world axes first (east and a bit back). East of a
 *     mark that is already east of the player is straight DOWN his sightline,
 *     so the escort ended up standing directly behind the man being shot, in
 *     line with him, on every mark but the last.
 *   - Then measured across the sightline but on the near side, which put him
 *     0.09 m from Prospect Five's body. Everything that has been shot so far
 *     is lying SOUTH of its mark, because that is the way they fall.
 *
 * So: perpendicular to the sightline (which is what "out of the way" actually
 * means), and on whichever side of it points away from the line — 1.75 m,
 * which leaves a metre between him and the executioner's elbow and puts him
 * beside the kneeling figure in frame rather than behind it.
 */
function escortStanceFor(mark) {
  const vx = mark.x - PLAYER_EYE.x;
  const vz = mark.z - PLAYER_EYE.z;
  const length = Math.hypot(vx, vz) || 1;
  const perp = { x: -vz / length, z: vx / length };
  /* Away from the line, i.e. away from the fall lanes. */
  const side = perp.z >= 0 ? 1 : -1;
  const stance = {
    x: mark.x + perp.x * ESCORT_CLEARANCE * side,
    z: mark.z + perp.z * ESCORT_CLEARANCE * side,
  };
  return { ...stance, heading: headingToward(stance, mark) };
}

export const KNEEL_MARKS = Object.freeze(KNEEL_MARK_SOURCE.map(buildMark));

/** Look a mark up by id, for ceremony code that names them. */
export function kneelMark(id) {
  return KNEEL_MARKS.find((mark) => mark.id === id) ?? null;
}

/**
 * Where the two of them collect a man from.
 *
 * One pace in front of his slot in the line, so the walk out starts as a step
 * forward rather than as a man being dragged sideways out of a row.
 */
export function collectionPointFor(lineX) {
  return Object.freeze({ x: lineX, z: LINE_Z + 0.95 });
}

/* ------------------------------------------------------------------ */
/* The cars, and the light they make                                    */
/* ------------------------------------------------------------------ */

/**
 * Two cars nose-in at the south edge with their lights left on, and a third
 * parked arse-on with the boot open.
 *
 * The lighting is doing three jobs at once and the angles are chosen for all
 * three: the beams come from BEHIND the prospect line, so the men standing in
 * it are black shapes and the mud in front of them is white; they cross at
 * the kneel marks, so a kneeling man is lit from both sides and the shooter
 * behind him is not; and they are low, because a headlight is at knee height
 * and everything it throws a shadow of is enormous.
 *
 * `aim` is the point on the ground the car is pointed at. `yaw` is derived
 * from it, because makeCar builds a car that drives along its own +x.
 */
export const CLEARING_CARS = Object.freeze([
  Object.freeze({
    id: 'clearing-west', kind: 'sedan', colour: 0x14171b,
    x: -9.8, z: -12.8, aim: { x: 1.0, z: -4.6 }, lights: true, engine: true,
  }),
  Object.freeze({
    id: 'clearing-east', kind: 'suv', colour: 0x1b1d22,
    x: 10.4, z: -13.6, aim: { x: -0.2, z: -5.4 }, lights: true, engine: true,
  }),
  /**
   * THE BOOT CAR. She came out of this one, and it is parked with its back to
   * the mud so the open lid is the first thing the player's eye finds when he
   * is marched in — and so it is still standing open, empty, behind everything
   * that happens next.
   */
  Object.freeze({
    id: 'boot-car', kind: 'lincoln', colour: 0x101216,
    x: 4.6, z: -11.4, aim: { x: 5.2, z: -17.6 }, lights: false, engine: false,
    bootOpen: true,
  }),
]);

/**
 * The two that were already at the cabin when everybody arrived.
 *
 * NOTE ON SPACING, for anyone moving one of these: the gate measures a car by
 * its WORLD-ALIGNED bounding box, and a car parked at an angle has a box far
 * bigger than the car. The first pass had a Lincoln and an SUV eleven
 * centimetres of paint apart on the diagonal, which the gate called
 * interpenetration and which it was right about — that is two cars parked into
 * each other. Give any two of them three metres between centres, or check.
 */
export const YARD_CARS = Object.freeze([
  Object.freeze({
    id: 'yard-west', kind: 'sedan', colour: 0x1d1a1e,
    /* Well off the trail: parked at 18.2, 16.4 it put its own back wheel 1.4 m
     * from the path, and the walk up to the cabin — the one walk in the level
     * that must not be interrupted — was blocked by it. */
    x: 19.6, z: 13.2, aim: { x: 21.0, z: 17.0 }, lights: false, engine: false,
  }),
  Object.freeze({
    id: 'yard-east', kind: 'van', colour: 0x2b2a26,
    x: 29.6, z: 15.3, aim: { x: 28.4, z: 19.1 }, lights: false, engine: false, dented: true,
  }),
]);

/** Rotation.y for a `makeCar` group pointed at `aim`. Cars drive along +x. */
export function carYaw(car) {
  return Math.atan2(-(car.aim.z - car.z), car.aim.x - car.x);
}

/**
 * The burn barrel.
 *
 * There is no ceremonial bonfire on this site and there is no stage. A rusted
 * drum with a fire in it is what is actually burning in a clearing where men
 * have been waiting in the cold for an hour, and it reads backwoods rather
 * than pagan — which is the difference the owner asked for between this and a
 * conference room with cigarettes.
 */
export const BURN_BARREL = Object.freeze({ x: -8.4, z: -3.2, radius: 0.34, height: 0.88 });

/* ------------------------------------------------------------------ */
/* THE APPROACH                                                         */
/* ------------------------------------------------------------------ */

/**
 * The track in from the road.
 *
 * It wanders, because a forest track that runs straight for sixty metres is a
 * runway. The wander stays inside |x| < 6 for the whole run, which is the
 * corridor main.js's own tree scatter keeps clear.
 */
export const TRACK = Object.freeze([
  Object.freeze({ x: 0.0, z: -78.0 }),
  Object.freeze({ x: 1.8, z: -64.0 }),
  Object.freeze({ x: -1.9, z: -50.0 }),
  Object.freeze({ x: -0.4, z: -36.0 }),
  Object.freeze({ x: 1.1, z: -24.0 }),
  Object.freeze({ x: 0.2, z: -14.0 }),
]);
export const TRACK_HALF_WIDTH = 1.85;

/**
 * The trail up to the cabin.
 *
 * Thirty-six metres, unlit, one man wide, and it bends twice — so the porch
 * light does not appear until the second bend, and once it does the clearing
 * behind is out of sight. Nothing on this trail is signed and nothing on it
 * is explained; the player works out where he is going when the light shows
 * up through the trunks.
 */
export const TRAIL = Object.freeze([
  Object.freeze({ x: 6.2, z: -2.2 }),
  Object.freeze({ x: 10.4, z: 4.6 }),
  Object.freeze({ x: 13.6, z: 11.8 }),
  Object.freeze({ x: 18.4, z: 17.2 }),
  Object.freeze({ x: 22.9, z: 17.9 }),
  /**
   * It STOPS IN THE YARD, 1.5 m short of the porch step.
   *
   * A worn path does not run up to a building and stop against the wall; it
   * frays out where people start walking in different directions, which is
   * what a yard is. The first pass ran the ribbon to the door, and its last
   * row — 1.15 m of half-width, laid across the last bearing — went through
   * the front wall of the cabin and reported as embedded in it.
   */
  Object.freeze({ x: 23.7, z: 18.6 }),
]);
export const TRAIL_HALF_WIDTH = 1.15;

/** Total walked length of the trail, in metres. */
export const TRAIL_LENGTH = TRAIL.reduce(
  (total, point, index) => (index === 0 ? 0 : total + distance2D(TRAIL[index - 1], point)),
  0,
);

/* ------------------------------------------------------------------ */
/* THE CABIN                                                            */
/* ------------------------------------------------------------------ */

/**
 * Old, private, important — and NOT rundown.
 *
 * Twelve metres by eight and a half of squared timber with a stone chimney,
 * which is a big building for the woods and a small one for a family that owns
 * this much of them. It is deliberately not picturesque: no porch swing, no
 * lanterns strung up, no sign. One light over the door, smoke, and cars.
 */
export const CABIN = Object.freeze({
  x: 24,
  z: 26,
  width: 12.0,      // along x
  depth: 8.4,       // along z
  wallThickness: 0.24,
  wallHeight: 2.85, // to the eaves
  ridgeHeight: 4.5,
  /** The front — the side the trail arrives on. */
  frontZ: 26 - 8.4 / 2,   // 21.8
  backZ: 26 + 8.4 / 2,    // 30.2
  minX: 24 - 12.0 / 2,    // 18.0
  maxX: 24 + 12.0 / 2,    // 30.0
});

export const PORCH = Object.freeze({
  minX: CABIN.minX + 0.6,
  maxX: CABIN.maxX - 0.6,
  /** Two metres deep, which is a working porch: boots come off on it. */
  minZ: CABIN.frontZ - 2.2,
  maxZ: CABIN.frontZ,
  /**
   * DECK HEIGHT — 12 cm, and the number is a movement decision rather than an
   * architectural one. This scene's player is a flat-ground walker with circle
   * colliders and no step-up; a real 45 cm porch would be an invisible wall
   * across the only door in the level. Twelve centimetres reads as a step from
   * outside and is walked over without the controller noticing.
   */
  deckY: 0.12,
  roofY: 2.62,
});

export const CABIN_DOOR = Object.freeze({
  x: CABIN.x,
  z: CABIN.frontZ,
  width: 1.15,
  height: 2.1,
  /** Where a figure stands to be let in, and the heading that faces the door. */
  outside: Object.freeze({ x: CABIN.x, z: CABIN.frontZ - 1.4, heading: 0 }),
  inside: Object.freeze({ x: CABIN.x, z: CABIN.frontZ + 1.3, heading: Math.PI }),
});

/** Where the trail gives up and the yard begins. */
export const CABIN_YARD = Object.freeze({
  x: CABIN.x,
  z: CABIN.frontZ - 6.5,
  radius: 11.0,
});

/**
 * The stone stack, on the back wall at the west end, over the stove inside.
 *
 * `z` is chosen so the stack's inner face lands EXACTLY on the outer face of
 * the back wall: 0.9 m deep centred on backZ + 0.45 puts minZ at 30.20, which
 * is the wall. Not a nicety — the geometry gate treats anything sunk more than
 * 2 cm into a wall as embedded, and a chimney pushed "into" the cabin to look
 * attached is exactly that finding.
 */
export const CHIMNEY = Object.freeze({
  x: 19.2,
  z: CABIN.backZ + 0.45,
  width: 1.5,
  depth: 0.9,
  height: 5.6,
  /** The breast inside the room, which the stove's flue goes into. */
  breastDepth: 0.41,
});

/* ------------------------------------------------------------------ */
/* INSIDE                                                               */
/* ------------------------------------------------------------------ */

/** The room, wall face to wall face. */
export const ROOM = Object.freeze({
  minX: CABIN.minX + CABIN.wallThickness,
  maxX: CABIN.maxX - CABIN.wallThickness,
  minZ: CABIN.frontZ + CABIN.wallThickness,
  maxZ: CABIN.backZ - CABIN.wallThickness,
  floorY: 0,
  ceilingY: 2.85,
});

/**
 * Seat heights, and the one subtraction that keeps a man on top of one.
 *
 * The shared `Npc.sit()` pose folds a figure and drops it 0.42 from its base,
 * and that 0.42 was tuned against a cushion 0.53 above the floor (see
 * STOOL_SIT's note in src/bing/cast.js, which exists because Booskibro spent a
 * month buried in a bar stool to the waist).
 *
 * So this cabin's chairs and benches are BUILT AT 0.53 — not corrected to it.
 * Authoring the furniture to the rig instead of the rig to the furniture is
 * free here, because nobody has ever measured a chair in this game with a tape
 * measure, and it means the base correction on every seat in this room is
 * exactly zero and cannot be got wrong.
 */
export const POSE_CUSHION = 0.53;
export const CUSHION = Object.freeze({ chair: 0.53, bench: 0.53 });
export const seatBaseY = (cushion, floorY = ROOM.floorY) => floorY + cushion - POSE_CUSHION;

/**
 * THE TABLE. Long, wooden, and the only thing in the room that matters.
 *
 * It is at the BACK, so the player is brought the length of the room to reach
 * it with everybody he has ever met standing on both sides of him.
 */
export const TABLE = Object.freeze({
  x: 24.0,
  z: 27.9,
  width: 3.8,    // along x
  depth: 1.15,   // along z
  topY: 0.78,
  thickness: 0.09,
});

/**
 * The five things on it, each of which is used.
 *
 * Sockets are the point on the table top the object RESTS on: the gate wants
 * the bottom of the object exactly on `TABLE.topY`, and the ceremony wants a
 * place to pick it up from that is not inside somebody's whiskey.
 *
 * `hand` is which hand it is put into when it leaves the table. It is here
 * rather than in the ceremony code because it is a property of the object —
 * the card burns in the palm it is placed in, and the knife is not handed to
 * a man left-handed.
 */
export const TABLE_SOCKETS = Object.freeze({
  candle: Object.freeze({ x: 22.75, z: 27.72, hand: null }),
  knife: Object.freeze({ x: 23.55, z: 27.60, hand: 'R' }),
  card: Object.freeze({ x: 24.28, z: 27.66, hand: 'L' }),
  whiskey: Object.freeze({ x: 25.02, z: 27.74, hand: 'R' }),
  cloth: Object.freeze({ x: 25.66, z: 27.58, hand: null }),
});

/** The drinks that were poured for everybody and that nobody is touching. */
export const POURED_DRINKS = Object.freeze([
  Object.freeze({ x: 22.42, z: 28.22 }),
  Object.freeze({ x: 23.34, z: 28.26 }),
  Object.freeze({ x: 24.72, z: 28.26 }),
  Object.freeze({ x: 25.54, z: 28.20 }),
]);

/**
 * Everything on the floor with a footprint, so the blocking can be checked
 * against it instead of eyeballed. `minX/maxX/minZ/maxZ` are world-space.
 */
export const FURNITURE = Object.freeze([
  Object.freeze({
    id: 'table',
    minX: TABLE.x - TABLE.width / 2, maxX: TABLE.x + TABLE.width / 2,
    minZ: TABLE.z - TABLE.depth / 2, maxZ: TABLE.z + TABLE.depth / 2,
  }),
  Object.freeze({ id: 'chimney-breast', minX: 18.45, maxX: 19.95, minZ: 29.55, maxZ: ROOM.maxZ }),
  Object.freeze({ id: 'stove', minX: 18.45, maxX: 19.95, minZ: 28.25, maxZ: 29.55 }),
  Object.freeze({ id: 'sideboard', minX: ROOM.minX + 0.06, maxX: ROOM.minX + 0.62, minZ: 24.40, maxZ: 26.40 }),
  Object.freeze({ id: 'firewood', minX: 29.16, maxX: 29.74, minZ: 27.60, maxZ: 29.60 }),
  Object.freeze({ id: 'bench-east', minX: 29.06, maxX: 29.66, minZ: 23.20, maxZ: 25.60 }),
  Object.freeze({ id: 'chair-west-a', minX: 18.34, maxX: 18.94, minZ: 22.60, maxZ: 23.20 }),
  Object.freeze({ id: 'chair-west-b', minX: 18.34, maxX: 18.94, minZ: 23.50, maxZ: 24.10 }),
]);

/** The stove, whose flue runs into the chimney breast behind it. */
export const STOVE = Object.freeze({
  x: 19.2, z: 28.90,
  width: 0.72, depth: 0.62, height: 1.02,
  /** Where the flue meets the masonry. */
  breastFaceZ: 29.55,
});

/**
 * THE BLOCKING.
 *
 * A loose semicircle, and loose is doing work: a tidy arc reads as a wedding.
 * Lou is at the centre of the table because he is the one doing it, Booskibro
 * is at his shoulder, Rippinflow is near enough to hand him things, and the
 * rest of them are AROUND THE PLAYER rather than around the table — including
 * two behind him, either side of the door he came in through, which is the
 * detail that makes a room full of friends feel like a room he is not leaving.
 *
 * Every heading is derived, never typed: `facing` names the point the figure
 * looks at and `headingFor()` turns it into a Person heading.
 */
const BLOCKING_SOURCE = Object.freeze([
  Object.freeze({ id: 'lou', x: 24.00, z: 29.20, facing: 'player' }),
  Object.freeze({ id: 'booski', x: 22.20, z: 29.05, facing: 'player' }),
  Object.freeze({ id: 'rippin', x: 25.90, z: 29.10, facing: 'player' }),
  /* Two of them are BEHIND the player, either side of the door he came in
   * through. Nobody says anything about it and nobody has to. */
  Object.freeze({ id: 'ring-1', x: 22.30, z: 22.56, facing: 'player' }),
  Object.freeze({ id: 'ring-2', x: 20.72, z: 24.62, facing: 'player' }),
  Object.freeze({ id: 'ring-3', x: 21.22, z: 27.45, facing: 'player' }),
  Object.freeze({ id: 'ring-4', x: 26.78, z: 27.45, facing: 'player' }),
  Object.freeze({ id: 'ring-5', x: 27.28, z: 24.62, facing: 'player' }),
  Object.freeze({ id: 'ring-6', x: 25.70, z: 22.56, facing: 'player' }),
]);

/** Where the player is stood for the making. Facing the table, and Lou. */
export const CEREMONY_CENTRE = Object.freeze({
  x: 24.0,
  z: 25.5,
  heading: 0,
  /** Player-yaw, for the camera. The other convention; see the header. */
  cameraYaw: Math.PI,
});

export const BLOCKING = Object.freeze(BLOCKING_SOURCE.map((slot) => Object.freeze({
  id: slot.id,
  x: slot.x,
  z: slot.z,
  heading: headingToward(slot, CEREMONY_CENTRE),
})));

export function blockingSlot(id) {
  return BLOCKING.find((slot) => slot.id === id) ?? null;
}

/** Standing figures need this much room; used by the clearance tests. */
export const BODY_RADIUS = 0.42;

/* ------------------------------------------------------------------ */
/* Where trees are not                                                  */
/* ------------------------------------------------------------------ */

/**
 * Every keep-out on the site, in one list, so the scatter and the tests read
 * the same one. `kind` is 'disc' or 'corridor'.
 *
 * The two `legacy` entries are main.js's old bonfire and stage. They are kept
 * out of the forest whether or not the rewrite deletes them, because a scene
 * with a tree growing through the banner is worse than one with a redundant
 * clearing in it.
 */
export const KEEP_OUT = Object.freeze([
  Object.freeze({ kind: 'disc', id: 'clearing', x: CLEARING.x, z: CLEARING.z, radius: CLEARING.radius }),
  Object.freeze({ kind: 'disc', id: 'cabin-yard', x: CABIN_YARD.x, z: CABIN_YARD.z, radius: CABIN_YARD.radius }),
  Object.freeze({
    kind: 'disc', id: 'cabin', x: CABIN.x, z: CABIN.z,
    radius: Math.hypot(CABIN.width, CABIN.depth) / 2 + 2.4,
  }),
  Object.freeze({ kind: 'disc', id: 'legacy-fire', x: 0, z: 0, radius: 5.0 }),
  Object.freeze({ kind: 'disc', id: 'legacy-stage', x: 0, z: 9, radius: 6.4 }),
  Object.freeze({ kind: 'corridor', id: 'track', path: TRACK, halfWidth: TRACK_HALF_WIDTH + 1.6 }),
  Object.freeze({ kind: 'corridor', id: 'trail', path: TRAIL, halfWidth: TRAIL_HALF_WIDTH + 1.4 }),
]);

/** Distance from a point to a polyline, in the ground plane. */
export function distanceToPath(path, point) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const lengthSquared = vx * vx + vz * vz;
    let t = lengthSquared > 0 ? ((point.x - a.x) * vx + (point.z - a.z) * vz) / lengthSquared : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(point.x - (a.x + vx * t), point.z - (a.z + vz * t)));
  }
  return best;
}

/** Sample a polyline at `t` in [0,1] of its length. Used to walk the trail. */
export function pointAlongPath(path, t) {
  const total = path.reduce(
    (sum, point, index) => (index === 0 ? 0 : sum + distance2D(path[index - 1], point)),
    0,
  );
  let remaining = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = distance2D(path[i], path[i + 1]);
    if (remaining <= segment || i === path.length - 2) {
      const k = segment > 0 ? remaining / segment : 0;
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * k,
        z: path[i].z + (path[i + 1].z - path[i].z) * k,
        heading: headingToward(path[i], path[i + 1]),
      };
    }
    remaining -= segment;
  }
  const last = path[path.length - 1];
  return { x: last.x, z: last.z, heading: 0 };
}

/** True when a thing of `radius` may stand at (x, z) without being in the way. */
export function siteFits(x, z, radius = 1.0) {
  for (const zone of KEEP_OUT) {
    if (zone.kind === 'disc') {
      if (Math.hypot(x - zone.x, z - zone.z) < zone.radius + radius) return false;
    } else if (distanceToPath(zone.path, { x, z }) < zone.halfWidth + radius) {
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Speakers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where the site makes noise from.
 *
 * Anything that MOVES is not in this table on purpose — a line spoken by a man
 * walking up the trail has to be played with audio.play's `follow` option
 * pointed at his rig, not at a fixed point, or the sound stays where he opened
 * his mouth. See ambience.js.
 */
export const SPEAKERS = Object.freeze({
  cabinMusic: Object.freeze({ x: CABIN.x - 1.4, y: 1.5, z: CABIN.z + 0.6 }),
  stove: Object.freeze({ x: STOVE.x, y: 0.7, z: STOVE.z }),
  porch: Object.freeze({ x: CABIN_DOOR.x, y: 2.3, z: PORCH.minZ + 0.4 }),
  burnBarrel: Object.freeze({ x: BURN_BARREL.x, y: 1.0, z: BURN_BARREL.z }),
  clearingWest: Object.freeze({ x: CLEARING_CARS[0].x, y: 0.7, z: CLEARING_CARS[0].z }),
  clearingEast: Object.freeze({ x: CLEARING_CARS[1].x, y: 0.7, z: CLEARING_CARS[1].z }),
});
