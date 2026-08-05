/**
 * SEMI-REAL NAV FOR THE SIEGE.
 *
 * OWNER DIRECTION, 2026-08-05, verbatim:
 *
 *   "Let's have proper nav mesh or whatever even if we have to manually tweak
 *    their routes."   "I want semi real nav paths."
 *
 * A nav MESH is the wrong tool here and would be the second one: the repo
 * already has `src/heist/navigation.js` -- an authored anchor graph with
 * zones, roles, neighbours, occupancy, BFS pathing and blocked-recovery -- and
 * it is the thing the heist's crew walks on. This file does not write another
 * one. It authors the ANCHOR SET for Lou's house and hands it to
 * `AuthoredNavigationGraph`, which is what makes the routes hand-tweakable:
 * every waypoint below is a number somebody chose, next to the wall it was
 * chosen for, and moving a man's route is moving one line of data.
 *
 * ## WHAT "SEMI REAL" BUYS, CONCRETELY
 *
 * Before this file, an attacker walked a straight line from his staging zone
 * to a push waypoint. Three of those lines went through walls, and two of them
 * went through the SAME wall:
 *
 *   - the east partition at x = 9 is SOLID from z 36 to 48 (it is the masonry
 *     the horseshoe's east flight runs up), so the lounge's only way into the
 *     foyer is the arch at z 48.5..52.5. The old `lounge_bay` route crossed it
 *     at z 43.9.
 *   - the west partition at x = -9 is its mirror, and the old `living_west`
 *     route crossed it at z 41.8.
 *   - the trophy hall's west glazing is two panes, z 43.0..46.4 and
 *     z 50.2..53.6. The old `living_west` staging walked in at z 47, which is
 *     the pier between them.
 *
 * Every leg of every route in this file crosses either nothing or exactly one
 * declared opening in `OPENINGS`, and `tests/mansion-siege-people.test.mjs`
 * asserts it leg by leg rather than by measuring leg lengths and hoping.
 *
 * ## THE HOUSE IS WRITTEN OUT, NOT IMPORTED
 *
 * Same reason `src/mansion/cast.js` and `./attackers.js` give at the top of
 * their own copies: importing `MansionGrounds.js` builds canvas textures at
 * module scope, which drags a WebGL-shaped dependency into anything that
 * merely wants to know where the foyer is -- headless tests included. Every
 * figure below is the constant the two scene files already export, named in
 * the comment beside it, and the base mansion is not edited to produce any of
 * them. `tools/verify-mansion-siege.mjs` reads the REAL builders in a browser
 * and compares them to `ROOMS` and `OPENINGS`, so the copy cannot drift.
 */
import { AuthoredNavigationGraph, SquadDirector } from '../../heist/navigation.js';

/** `MansionGrounds.GROUND_Y`. */
export const GROUND_Y = 1.2;
/** `MansionGrounds.UPPER_Y` -- the gallery, the office, the landing. */
export const UPPER_Y = 6.0;
/** `MansionGrounds.BASEMENT_Y`. */
export const BASEMENT_Y = -2.8;
/** `MansionInterior.STAIR_WEST/STAIR_EAST` both run z 42..48. */
export const FLIGHT_Z0 = 42;
export const FLIGHT_Z1 = 48;

/**
 * How high the horseshoe is at a point on a flight.
 *
 * `MansionInterior` builds both flights with
 * `lerp(GY, UY, clamp((z - STAIR_WEST.z0) / (z1 - z0)))`, so this is that
 * lerp and not an approximation of it. A climb waypoint that guesses puts a
 * man's feet through the treads.
 */
export function flightHeightAt(z) {
  const t = Math.min(1, Math.max(0, (z - FLIGHT_Z0) / (FLIGHT_Z1 - FLIGHT_Z0)));
  return GROUND_Y + (UPPER_Y - GROUND_Y) * t;
}

/* ================================================================== */
/* THE ROOMS                                                            */
/*                                                                       */
/* Plan rectangles with a height band, because the gallery stands over    */
/* the foyer and "is this leg inside one room" cannot be answered in two  */
/* dimensions in a house with a double-height entrance hall.              */
/*                                                                        */
/* `rise: true` marks the two stair flights, whose floor is a ramp rather  */
/* than a slab -- a point is in a flight when it is on the flight, not     */
/* merely over its footprint.                                             */
/* ================================================================== */
export const ROOMS = Object.freeze({
  /* Outdoors. The drive and the turnaround, stopping at the bottom tread. */
  forecourt: Object.freeze({
    x0: -30, x1: 30, z0: 12, z1: 34, y0: -1, y1: 4, outdoor: true,
  }),
  /* `MansionGrounds.buildFrontEntry` -- six treads z 34..35.5 between
   * parapets at x +/-6, then a 0.5 m portico landing to the facade. */
  steps: Object.freeze({ x0: -6, x1: 6, z0: 34, z1: 36, y0: -1, y1: 4, outdoor: true }),
  /* `MansionInterior.FOYER`. Double height: its ceiling is the roof over the
   * void, so the band runs to the gallery slab. */
  foyer: Object.freeze({ x0: -8.85, x1: 8.85, z0: 36, z1: 57.85, y0: 0.6, y1: 5.9 }),
  /* `MansionInterior.LIVING` / `LOUNGE` / `BALLROOM` / `DINING` / `KITCHEN`. */
  living: Object.freeze({ x0: -16, x1: -9.15, z0: 36, z1: 57.85, y0: 0.6, y1: 5.9 }),
  lounge: Object.freeze({ x0: 9.15, x1: 16, z0: 36, z1: 57.85, y0: 0.6, y1: 5.9 }),
  ballroom: Object.freeze({ x0: -8.85, x1: 8.85, z0: 58.15, z1: 75, y0: 0.6, y1: 5.9 }),
  dining: Object.freeze({ x0: -16, x1: -9.15, z0: 58.15, z1: 75, y0: 0.6, y1: 5.9 }),
  kitchen: Object.freeze({ x0: 9.15, x1: 16, z0: 58.15, z1: 75, y0: 0.6, y1: 5.9 }),
  /* `MansionGrounds.TROPHY_HALL` / `WINTER_GARDEN` / `LOUNGE_BAY`. */
  trophy: Object.freeze({ x0: -24.2, x1: -16, z0: 41, z1: 55.7, y0: 0.6, y1: 6.6 }),
  winter: Object.freeze({ x0: -24.2, x1: -16, z0: 56, z1: 74, y0: 0.6, y1: 6.6 }),
  bay: Object.freeze({ x0: 16, x1: 20.6, z0: 41, z1: 54, y0: 0.6, y1: 5.2 }),
  /* The lawns either side of the house, out to the boundary. */
  lawn_west: Object.freeze({
    x0: -32, x1: -24.6, z0: 30, z1: 78, y0: -1, y1: 4, outdoor: true,
  }),
  lawn_east: Object.freeze({
    x0: 21, x1: 32, z0: 30, z1: 78, y0: -1, y1: 4, outdoor: true,
  }),
  /* `MansionInterior.STAIR_WEST` / `STAIR_EAST`, and they are ramps. */
  stair_west: Object.freeze({
    x0: -8.85, x1: -5.5, z0: FLIGHT_Z0, z1: FLIGHT_Z1, rise: true,
  }),
  stair_east: Object.freeze({
    x0: 5.5, x1: 8.85, z0: FLIGHT_Z0, z1: FLIGHT_Z1, rise: true,
  }),
  /* `MansionInterior.GALLERY` -- the landing, over the foyer. */
  gallery: Object.freeze({ x0: -16, x1: 16, z0: 48.15, z1: 52.85, y0: 5.4, y1: 10.2 }),
  /* `MansionInterior.BALCONY` -- the firing step, cantilevered south. */
  balcony: Object.freeze({ x0: -3, x1: 3, z0: 45.2, z1: 48.15, y0: 5.4, y1: 10.2 }),
  /* `MansionGrounds.CELLAR_HALL` -- the basement spine, nine metres down. */
  cellar: Object.freeze({ x0: -15.6, x1: 15.6, z0: 64.3, z1: 67.4, y0: -3.6, y1: -0.4 }),
});

/**
 * Every way from one room to the next that a route in this file may use.
 *
 * `at` is the plane the opening sits in and `u0..u1` its extent along the
 * other horizontal axis -- exactly the shape `MansionInterior.partition` and
 * `MansionGrounds.panelWall` describe their own openings in, so each row can
 * be read straight off the builder that cut it.
 *
 * `y0..y1` IS NOT DECORATION. The gallery stands directly over the foyer and
 * the balcony bay directly over the middle of it, so without a height band the
 * leg from the middle of the foyer floor to the back of it "crosses" the
 * balcony's own edge six metres overhead, and a leg along the gallery
 * "crosses" the ground-floor arch into the living room. Both were reported by
 * the checker the first time this table was written without one.
 *
 * `glass: true` is a pane, not a doorway. Only two of them are on any route,
 * and both are the ones the brief names as the flanks' way in.
 */
/** Every ground-floor doorway, arch and pane shares one band. */
const GROUND_BAND = Object.freeze({ y0: -1.2, y1: 5.0 });

export const OPENINGS = Object.freeze([
  /* The bottom tread. The forecourt meets the front staircase across its
   * whole 12 m width, between the parapets at x +/-6. */
  Object.freeze({
    id: 'frontStepsFoot', axis: 'z', at: 34, u0: -6, u1: 6, rooms: ['forecourt', 'steps'], ...GROUND_BAND,
  }),
  /* `MansionGrounds.FRONT_DOOR` -- x -1.6..1.6 in the south facade. THE way
   * in, and after this pass very nearly the only one. */
  Object.freeze({
    id: 'frontDoor', axis: 'z', at: 36, u0: -1.6, u1: 1.6, rooms: ['steps', 'foyer'], ...GROUND_BAND,
  }),
  /* `MansionInterior` west/east partitions, `${tag}-mid`: the grand arch into
   * each wing, BEHIND the horseshoe. z 41..48 of the same partition is solid
   * -- it is the masonry the flights run up -- which is why nothing may cross
   * x = +/-9 south of 48.5. */
  Object.freeze({
    id: 'foyerToLiving', axis: 'x', at: -9, u0: 48.5, u1: 52.5, rooms: ['foyer', 'living'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'foyerToLounge', axis: 'x', at: 9, u0: 48.5, u1: 52.5, rooms: ['foyer', 'lounge'], ...GROUND_BAND,
  }),
  /* `MansionInterior` ground-cross partition at z = 58. */
  Object.freeze({
    id: 'foyerToBallroom', axis: 'z', at: 58, u0: -3, u1: 3, rooms: ['foyer', 'ballroom'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'livingToDining', axis: 'z', at: 58, u0: -14, u1: -11, rooms: ['living', 'dining'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'loungeToKitchen', axis: 'z', at: 58, u0: 11, u1: 14, rooms: ['lounge', 'kitchen'], ...GROUND_BAND,
  }),
  /* `MansionGrounds` east wall: three arches into the billiard bay. */
  Object.freeze({
    id: 'loungeBayArchSouth', axis: 'x', at: 16, u0: 41.4, u1: 44.6, rooms: ['lounge', 'bay'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'loungeBayArchMid', axis: 'x', at: 16, u0: 45.6, u1: 49.4, rooms: ['lounge', 'bay'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'loungeBayArchNorth', axis: 'x', at: 16, u0: 50.4, u1: 53.6, rooms: ['lounge', 'bay'], ...GROUND_BAND,
  }),
  /* `MansionGrounds` west wall: three arches into the trophy hall. */
  Object.freeze({
    id: 'livingToTrophySouth', axis: 'x', at: -16, u0: 41.4, u1: 42.8, rooms: ['living', 'trophy'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'livingToTrophyMid', axis: 'x', at: -16, u0: 43.2, u1: 44.6, rooms: ['living', 'trophy'], ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'livingToTrophyNorth', axis: 'x', at: -16, u0: 45.0, u1: 46.4, rooms: ['living', 'trophy'], ...GROUND_BAND,
  }),
  /* THE TWO PANES. `bayEastMid` is the billiard bay's east glazing and
   * `trophyWestSouth` the west wing's -- the only two openings on any route in
   * this file that have to be broken before anybody comes through. */
  Object.freeze({
    id: 'bayEastMid', axis: 'x', at: 20.8, u0: 45.8, u1: 49.2, rooms: ['bay', 'lawn_east'], glass: true, ...GROUND_BAND,
  }),
  Object.freeze({
    id: 'trophyWestSouth', axis: 'x', at: -24.4, u0: 43.0, u1: 46.4, rooms: ['trophy', 'lawn_west'], glass: true, ...GROUND_BAND,
  }),
  /* The horseshoe. Its feet are the z = 42 edge of each flight and its heads
   * the z = 48 edge; the gallery slab picks up there. */
  Object.freeze({
    id: 'stairWestFoot', axis: 'z', at: FLIGHT_Z0, u0: -8.85, u1: -5.5, rooms: ['foyer', 'stair_west'],
    y0: 0.4, y1: 3.0,
  }),
  Object.freeze({
    id: 'stairEastFoot', axis: 'z', at: FLIGHT_Z0, u0: 5.5, u1: 8.85, rooms: ['foyer', 'stair_east'],
    y0: 0.4, y1: 3.0,
  }),
  Object.freeze({
    id: 'stairWestHead', axis: 'z', at: FLIGHT_Z1, u0: -8.85, u1: -5.5, rooms: ['stair_west', 'gallery'],
    y0: 4.2, y1: 7.4,
  }),
  Object.freeze({
    id: 'stairEastHead', axis: 'z', at: FLIGHT_Z1, u0: 5.5, u1: 8.85, rooms: ['stair_east', 'gallery'],
    y0: 4.2, y1: 7.4,
  }),
  /* The balcony bay hangs south off the gallery's own edge -- no wall, but it
   * is a different room and a leg across it is still a leg between two. */
  Object.freeze({
    id: 'galleryToBalcony', axis: 'z', at: 48.15, u0: -3, u1: 3, rooms: ['gallery', 'balcony'],
    y0: 5.0, y1: 10.2,
  }),
]);

/** Is this point inside that room? Stair flights answer about the ramp. */
export function inRoom(room, point) {
  if (!room) return false;
  if (point.x < room.x0 || point.x > room.x1) return false;
  if (point.z < room.z0 || point.z > room.z1) return false;
  if (point.y == null) return true;
  if (room.rise) return Math.abs(point.y - flightHeightAt(point.z)) < 1.1;
  return point.y >= room.y0 && point.y <= room.y1;
}

/**
 * Which room a point is in, or null.
 *
 * The two flights are tested FIRST because their footprints sit inside the
 * foyer's: a man half way up the east flight is over the foyer's floor plan
 * and four metres above its floor, and calling that "the foyer" is how a leg
 * up a staircase reads as a leg through a room.
 */
export function roomAt(point) {
  for (const id of ['stair_west', 'stair_east']) {
    if (inRoom(ROOMS[id], point)) return id;
  }
  for (const [id, room] of Object.entries(ROOMS)) {
    if (id === 'stair_west' || id === 'stair_east') continue;
    if (inRoom(room, point)) return id;
  }
  return null;
}

/**
 * A waypoint's height, with "follow the ground" resolved.
 *
 * Every anchor in this file that carries a null y is on a ground floor or on
 * the front steps, and every ground-level opening's band is wide enough to
 * hold both, so one substitution is honest. Anything on a flight, on the
 * gallery or in the cellar carries its own number and never reaches here.
 */
function heightOf(point) {
  return point.y == null ? GROUND_Y : point.y;
}

/**
 * The opening a leg passes through, if it passes through exactly one.
 *
 * Returns `{ opening, x, z }` -- the crossing point as well as the opening,
 * because the glass owner wants to know WHERE a pane went, not which room the
 * man ended up in.
 *
 * The height test is what stops a walk across the foyer floor "crossing" the
 * balcony's edge six metres over its head.
 */
export function crossingFor(a, b) {
  const ya = heightOf(a);
  const yb = heightOf(b);
  for (const opening of OPENINGS) {
    const axis = opening.axis;
    const other = axis === 'x' ? 'z' : 'x';
    const from = a[axis];
    const to = b[axis];
    if ((from - opening.at) * (to - opening.at) > 0) continue;
    if (Math.abs(to - from) < 1e-6) continue;
    const t = (opening.at - from) / (to - from);
    if (t < 0 || t > 1) continue;
    const u = a[other] + (b[other] - a[other]) * t;
    if (u < opening.u0 || u > opening.u1) continue;
    const y = ya + (yb - ya) * t;
    if (y < opening.y0 || y > opening.y1) continue;
    return {
      opening,
      x: axis === 'x' ? opening.at : u,
      z: axis === 'x' ? u : opening.at,
      y,
    };
  }
  return null;
}

/* ================================================================== */
/* THE ANCHORS                                                          */
/*                                                                       */
/* `zone`      what a destination is asked for by. `AuthoredNavigationGraph`
/*             .destination() matches on this.                             */
/* `roles`     which side of the house an anchor belongs to. The graph's    */
/*             own role filter is what sends a west-route man up the west   */
/*             flight without this file re-implementing the choice.         */
/* `lane`      how far off the anchor a man may stand, in metres, measured  */
/*             PERPENDICULAR to the leg he arrived on. 0.45 at the front    */
/*             door because the door is 3.2 m wide; 1.2 on the gallery      */
/*             because the gallery is thirty-two.                          */
/* `recovery`  somewhere outside to send a man who cannot get where he was  */
/*             sent. `SquadDirector.noteBlocked` picks these.               */
/* ================================================================== */
const A = (id, zone, x, z, y, room, lane, extra = {}) => Object.freeze({
  id, zone, x, z, y, room, lane, roles: Object.freeze(extra.roles ?? []),
  neighbors: Object.freeze(extra.neighbors ?? []),
  recovery: extra.recovery === true,
});

/* y === null means "stand on whatever the ground is here", which is what
 * carries a man up the six front treads without a ramp being written for him.
 * Everything on a flight or on the gallery carries its own height, because
 * there is nothing underneath those to follow. */
const G = null;

export const ANCHORS = Object.freeze([
  /* ---- the drive and the turnaround ------------------------------- */
  /* The drive is 8.9 m of usable lane between kerbs at x +/-6.85, with the
   * abandoned Lincoln across it at (0, 18.4). This is north of it. */
  A('drive_head', 'approach', 0, 22.4, G, 'forecourt', 2.4, {
    neighbors: ['court_side_west', 'court_side_east'], recovery: true,
  }),
  /* EITHER SIDE OF THE FOUNTAIN, AND THAT IS THE POINT. The basin's collider
   * is r 3.6 about (0, 27) and the drive comes up at x = 0, so a single
   * centre anchor would walk every man in the mission through it. Splitting
   * here is also the reading the brief wants: they come up the drive, spread
   * round the fountain and the burning cars, and re-form at the steps. */
  A('court_side_west', 'approach', -6.2, 26.5, G, 'forecourt', 1.9, {
    neighbors: ['drive_head', 'court_centre', 'steps_west'], recovery: true,
  }),
  A('court_side_east', 'approach', 6.2, 26.5, G, 'forecourt', 1.9, {
    neighbors: ['drive_head', 'court_centre', 'steps_east'], recovery: true,
  }),
  /* The turnaround's north arc. `dressing.js` leaves z 27..34 completely
   * empty on purpose -- "that is the attackers' walk-in" -- so this is the
   * one place in the forecourt with nothing standing in it. */
  A('court_centre', 'approach', 0, 32.2, G, 'forecourt', 2.2, {
    neighbors: ['court_side_west', 'court_side_east', 'steps_centre'],
  }),

  /* ---- the six treads and the portico ------------------------------ */
  A('steps_west', 'porch', -3.4, 34.7, G, 'steps', 1.0, {
    neighbors: ['court_side_west', 'steps_centre', 'porch_west'],
  }),
  A('steps_centre', 'porch', 0, 34.7, G, 'steps', 1.0, {
    neighbors: ['court_centre', 'steps_west', 'steps_east', 'porch_centre'],
  }),
  A('steps_east', 'porch', 3.4, 34.7, G, 'steps', 1.0, {
    neighbors: ['court_side_east', 'steps_centre', 'porch_east'],
  }),
  A('porch_west', 'porch', -3.2, 35.6, G, 'steps', 0.9, {
    neighbors: ['steps_west', 'porch_centre'],
  }),
  /* THE NECK OF THE FUNNEL. Everything that comes in the front comes through
   * this anchor and then through a 3.2 m door, which is why its lane is the
   * tightest in the file. */
  A('porch_centre', 'porch', 0, 35.6, G, 'steps', 0.55, {
    neighbors: ['steps_centre', 'porch_west', 'porch_east', 'foyer_door', 'overwatch_door_mouth'],
  }),
  A('porch_east', 'porch', 3.2, 35.6, G, 'steps', 0.9, {
    neighbors: ['steps_east', 'porch_centre'],
  }),

  /* ---- the foyer floor --------------------------------------------- */
  A('foyer_door', 'foyer', 0, 37.3, G, 'foyer', 0.45, {
    neighbors: [
      'porch_centre', 'foyer_west', 'foyer_east', 'foyer_centre',
      'overwatch_centre', 'overwatch_west', 'overwatch_east', 'overwatch_door_mouth',
    ],
  }),
  A('foyer_west', 'foyer', -4.2, 39.6, G, 'foyer', 1.3, {
    neighbors: ['foyer_door', 'foyer_centre', 'foyer_stair_west'],
  }),
  A('foyer_east', 'foyer', 4.2, 39.6, G, 'foyer', 1.3, {
    neighbors: ['foyer_door', 'foyer_centre', 'foyer_stair_east'],
  }),
  A('foyer_centre', 'foyer', 0, 41.6, G, 'foyer', 1.5, {
    neighbors: ['foyer_door', 'foyer_west', 'foyer_east', 'foyer_stair_west', 'foyer_stair_east', 'foyer_under'],
  }),
  /* SOUTH OF THE BOTTOM TREAD, not on it. The flights start at z 42 and the
   * masonry under them is solid, so the anchor a man walks to before he
   * climbs has to be on the marble in front of the flight. */
  A('foyer_stair_west', 'stair_foot', -7.0, 41.0, G, 'foyer', 0.7, {
    roles: ['west'],
    neighbors: ['foyer_west', 'foyer_centre', 'stair_west_low'],
  }),
  A('foyer_stair_east', 'stair_foot', 7.0, 41.0, G, 'foyer', 0.7, {
    roles: ['east'],
    neighbors: ['foyer_east', 'foyer_centre', 'stair_east_low'],
  }),
  /* Behind the horseshoe, under the gallery slab: the half of the foyer the
   * two wing arches open onto. */
  A('foyer_under', 'foyer_rear', 0, 50.4, G, 'foyer', 1.6, {
    neighbors: ['foyer_centre', 'foyer_arch_west', 'foyer_arch_east'],
  }),
  A('foyer_arch_west', 'foyer_rear', -8.3, 50.5, G, 'foyer', 0.9, {
    neighbors: ['foyer_under', 'living_arch_foyer'],
  }),
  A('foyer_arch_east', 'foyer_rear', 8.3, 50.5, G, 'foyer', 0.9, {
    neighbors: ['foyer_under', 'lounge_arch'],
  }),

  /* ---- where the two men who never advance set up ------------------- */
  /* All six have a real line up through the double-height void at the
   * gallery rail, and all six are somewhere the player can shoot back at --
   * which is the difference between a suppressor and a weather system. */
  A('overwatch_centre', 'overwatch', 0, 37.4, G, 'foyer', 0.5, {
    neighbors: ['foyer_door', 'overwatch_west', 'overwatch_east', 'overwatch_door_mouth'],
  }),
  A('overwatch_west', 'overwatch', -4.2, 37.9, G, 'foyer', 0.8, {
    neighbors: ['foyer_door', 'overwatch_centre', 'overwatch_west_far'],
  }),
  A('overwatch_east', 'overwatch', 4.2, 37.9, G, 'foyer', 0.8, {
    neighbors: ['foyer_door', 'overwatch_centre', 'overwatch_east_far'],
  }),
  A('overwatch_west_far', 'overwatch', -6.8, 37.9, G, 'foyer', 0.6, {
    neighbors: ['overwatch_west'],
  }),
  A('overwatch_east_far', 'overwatch', 6.8, 37.9, G, 'foyer', 0.6, {
    neighbors: ['overwatch_east'],
  }),
  /* IN THE DOOR MOUTH, and inside it rather than on the portico. A hundred
   * rounds in a box is not something you carry up a staircase, so the gunner
   * sets up on the threshold and stays there -- but on the threshold, not
   * behind it: a hold post outside the house is a man the player fights
   * through two storeys of entrance glazing instead of a man in his hall. */
  A('overwatch_door_mouth', 'overwatch', 0, 36.8, G, 'foyer', 0.5, {
    neighbors: ['porch_centre', 'foyer_door', 'overwatch_centre'],
  }),

  /* ---- the two flights --------------------------------------------- */
  A('stair_west_low', 'stair', -7.15, 43.6, flightHeightAt(43.6), 'stair_west', 0.5, {
    roles: ['west'], neighbors: ['foyer_stair_west', 'stair_west_high'],
  }),
  A('stair_west_high', 'stair', -7.15, 46.6, flightHeightAt(46.6), 'stair_west', 0.5, {
    roles: ['west'], neighbors: ['stair_west_low', 'gallery_head_west'],
  }),
  A('stair_east_low', 'stair', 7.15, 43.6, flightHeightAt(43.6), 'stair_east', 0.5, {
    roles: ['east'], neighbors: ['foyer_stair_east', 'stair_east_high'],
  }),
  A('stair_east_high', 'stair', 7.15, 46.6, flightHeightAt(46.6), 'stair_east', 0.5, {
    roles: ['east'], neighbors: ['stair_east_low', 'gallery_head_east'],
  }),

  /* ---- the landing: where the fight is supposed to end up ----------- */
  A('gallery_head_west', 'gallery', -7.15, 49.2, UPPER_Y, 'gallery', 0.7, {
    roles: ['west'],
    neighbors: ['stair_west_high', 'gallery_west', 'gallery_far_west'],
  }),
  A('gallery_head_east', 'gallery', 7.15, 49.2, UPPER_Y, 'gallery', 0.7, {
    roles: ['east'],
    neighbors: ['stair_east_high', 'gallery_east', 'gallery_far_east'],
  }),
  A('gallery_west', 'gallery', -4.4, 50.2, UPPER_Y, 'gallery', 1.0, {
    roles: ['west'], neighbors: ['gallery_head_west', 'gallery_centre', 'gallery_rail_west'],
  }),
  A('gallery_east', 'gallery', 4.4, 50.2, UPPER_Y, 'gallery', 1.0, {
    roles: ['east'], neighbors: ['gallery_head_east', 'gallery_centre', 'gallery_rail_east'],
  }),
  A('gallery_far_west', 'gallery', -11.5, 50.4, UPPER_Y, 'gallery', 1.2, {
    roles: ['west'], neighbors: ['gallery_head_west'],
  }),
  A('gallery_far_east', 'gallery', 11.5, 50.4, UPPER_Y, 'gallery', 1.2, {
    roles: ['east'], neighbors: ['gallery_head_east'],
  }),
  A('gallery_centre', 'gallery', 0, 49.6, UPPER_Y, 'gallery', 1.0, {
    neighbors: ['gallery_west', 'gallery_east', 'balcony_step', 'gallery_rail_west', 'gallery_rail_east'],
  }),
  /* Hard against the rail either side of the balcony's mouth -- the two
   * places a man can stand and shoot at somebody ON the balcony without
   * being on it. */
  A('gallery_rail_west', 'gallery', -2.0, 48.8, UPPER_Y, 'gallery', 0.7, {
    roles: ['west'], neighbors: ['gallery_west', 'gallery_centre'],
  }),
  A('gallery_rail_east', 'gallery', 2.0, 48.8, UPPER_Y, 'gallery', 0.7, {
    roles: ['east'], neighbors: ['gallery_east', 'gallery_centre'],
  }),
  /* ON THE PLAYER'S OWN STEP. `MansionInterior.BALCONY` is x -3..3,
   * z 45.2..48 and the mission's DEFENCE_POST is the bay behind it, so a man
   * who reaches this anchor is standing where the Prospect is standing. That
   * is the whole point of the direction: the fight has to come to the rail. */
  A('balcony_step', 'gallery', 0, 47.4, UPPER_Y, 'balcony', 0.8, {
    neighbors: ['gallery_centre'],
  }),

  /* ---- the east flank: the lawn, the billiard bay, the lounge ------- */
  A('lawn_bay', 'flank_east', 23.6, 47.4, G, 'lawn_east', 1.6, {
    neighbors: ['bay_glass'], recovery: true,
  }),
  A('bay_glass', 'flank_east', 19.0, 47.4, G, 'bay', 0.9, {
    neighbors: ['lawn_bay', 'bay_arch'],
  }),
  A('bay_arch', 'flank_east', 15.2, 47.4, G, 'lounge', 0.9, {
    neighbors: ['bay_glass', 'lounge_mid'],
  }),
  A('lounge_mid', 'flank_east', 12.4, 49.2, G, 'lounge', 1.1, {
    neighbors: ['bay_arch', 'lounge_arch'],
  }),
  A('lounge_arch', 'flank_east', 9.9, 50.5, G, 'lounge', 0.8, {
    neighbors: ['lounge_mid', 'foyer_arch_east'],
  }),

  /* ---- the west flank: the lawn, the trophy hall, the living room --- */
  A('lawn_trophy', 'flank_west', -27.4, 44.7, G, 'lawn_west', 1.6, {
    neighbors: ['trophy_glass'], recovery: true,
  }),
  A('trophy_glass', 'flank_west', -22.6, 44.7, G, 'trophy', 1.2, {
    neighbors: ['lawn_trophy', 'trophy_arch'],
  }),
  A('trophy_arch', 'flank_west', -17.0, 43.9, G, 'trophy', 0.6, {
    neighbors: ['trophy_glass', 'living_arch_wing'],
  }),
  A('living_arch_wing', 'flank_west', -15.0, 43.9, G, 'living', 0.6, {
    neighbors: ['trophy_arch', 'living_mid'],
  }),
  A('living_mid', 'flank_west', -12.4, 48.0, G, 'living', 1.1, {
    neighbors: ['living_arch_wing', 'living_arch_foyer'],
  }),
  A('living_arch_foyer', 'flank_west', -9.9, 50.5, G, 'living', 0.8, {
    neighbors: ['living_mid', 'foyer_arch_west'],
  }),

  /* ---- the cellar corridor ----------------------------------------- */
  /* A disconnected component on purpose: the two men down here fight the
   * opening encounter and never join the staircase defence, and giving them
   * a route up would let a BFS from the corridor find the gallery. */
  A('cellar_west', 'basement', -4, 65.8, BASEMENT_Y, 'cellar', 1.0, {
    neighbors: ['cellar_mid'],
  }),
  A('cellar_mid', 'basement', 0, 65.8, BASEMENT_Y, 'cellar', 1.0, {
    neighbors: ['cellar_west', 'cellar_east'],
  }),
  A('cellar_east', 'basement', 4.6, 65.8, BASEMENT_Y, 'cellar', 1.0, {
    neighbors: ['cellar_mid', 'cellar_vault_door'],
  }),
  A('cellar_vault_door', 'basement', 9.4, 65.8, BASEMENT_Y, 'cellar', 1.0, {
    neighbors: ['cellar_east'],
  }),
]);

const BY_ID = new Map(ANCHORS.map((anchor) => [anchor.id, anchor]));

export function anchorById(id) { return BY_ID.get(id) ?? null; }

/** Build the graph. One per pool -- occupancy is per playthrough state. */
export function buildSiegeNavGraph() {
  return new AuthoredNavigationGraph(ANCHORS.map((anchor) => ({
    id: anchor.id,
    zone: anchor.zone,
    roles: anchor.roles,
    neighbors: anchor.neighbors,
    recovery: anchor.recovery,
    lane: anchor.lane,
  })));
}

/**
 * Keep a laned waypoint inside the room its anchor belongs to.
 *
 * The lane offset is what stops eight men standing inside each other, and it
 * is also the one thing that can push a waypoint out of the room it was
 * authored in -- 0.55 m of lateral spread on the portico anchor is 0.55 m
 * toward a wall that is 0.4 m away. Clamping is cheaper and more honest than
 * hand-tuning every lane until nothing quite escapes.
 */
export function clampIntoRoom(point, roomId, margin = 0.4) {
  const room = ROOMS[roomId];
  if (!room) return point;
  const x = Math.min(room.x1 - margin, Math.max(room.x0 + margin, point.x));
  const z = Math.min(room.z1 - margin, Math.max(room.z0 + margin, point.z));
  return { ...point, x, z };
}

/**
 * The graph, the occupancy and the recovery behaviour, as one object an
 * attacker pool can hold.
 *
 * `SquadDirector` owns the blocked/recovery half because it already does --
 * the heist's crew use the same 2.5 s patience and the same offscreen-only
 * rule, and a second copy of that timer in this file is exactly the second
 * navigation system the direction says not to write.
 */
export class SiegeNavigator {
  constructor() {
    this.graph = buildSiegeNavGraph();
    /** id -> { id, anchor, role }. `SquadDirector` reads and writes `anchor`. */
    this.actors = new Map();
    this.director = new SquadDirector({ graph: this.graph, actors: this.actors });
  }

  /** Put an actor on the graph at a named anchor. Idempotent. */
  enter(actorId, anchorId, role = null) {
    if (!BY_ID.has(anchorId)) throw new Error(`Unknown siege anchor "${anchorId}"`);
    const actor = this.actors.get(actorId) ?? { id: actorId };
    actor.anchor = anchorId;
    actor.role = role;
    this.actors.set(actorId, actor);
    this.graph.releaseActor(actorId);
    return actor;
  }

  /** Give up whatever he was holding. Called when a man goes down. */
  release(actorId) {
    this.graph.releaseActor(actorId);
    this.actors.delete(actorId);
  }

  /**
   * The anchor chain from where he is to somewhere in `zone`, reserved.
   *
   * `zones` is a preference list rather than one zone: eleven climbers and
   * eight gallery anchors means somebody has to be told to hold the stairs,
   * and a man with nowhere to go is a man who stands in the doorway for the
   * rest of the wave.
   */
  plan(actorId, zones, { role = null } = {}) {
    const actor = this.actors.get(actorId);
    if (!actor) return null;
    const wanted = Array.isArray(zones) ? zones : [zones];
    const matches = (zone) => (anchor) => anchor.zone === zone
      && (!role || anchor.roles.size === 0 || anchor.roles.has(role));

    for (const zone of wanted) {
      const path = this.graph.findPath(actor.anchor, matches(zone), actorId);
      if (!path?.length) continue;
      const destination = path[path.length - 1];
      if (!this.graph.occupy(destination, actorId)) continue;
      actor.anchor = destination;
      /* The FIRST id is where he already is. A waypoint on top of his own
       * feet is a waypoint he reaches instantly and a lane offset applied to
       * nothing, so it is dropped. */
      return { zone, destination, path: path.slice(1), anchors: path, shared: false };
    }

    /* THE HOUSE IS FULLER THAN IT HAS ANCHORS.
     *
     * Occupancy is what stops men standing inside each other, and it is a
     * preference, not a law. Twenty-two attackers plus the foyer three, all
     * alive at once -- which the mission never does, because wave one is
     * cleared before wave two opens, but a checkpoint tool or a test can --
     * wants more places to stand than the landing, the flights and the foyer
     * floor have between them. A man with nowhere to go would stop dead at
     * his staging zone OUTSIDE THE HOUSE and the wave would never clear.
     *
     * So the last resort asks the graph the same question with the house
     * empty and sends him there without reserving it. Two men close together
     * on the gallery is a worse frame than one; a man standing on the drive
     * for four minutes is a broken mission.
     */
    const held = this.graph.capture();
    this.graph.reset();
    let shared = null;
    for (const zone of wanted) {
      const path = this.graph.findPath(actor.anchor, matches(zone), actorId);
      if (path?.length) {
        shared = { zone, destination: path[path.length - 1], path: path.slice(1), anchors: path, shared: true };
        break;
      }
    }
    this.graph.restore(held);
    if (shared) actor.anchor = shared.destination;
    return shared;
  }

  /** He has not moved for a while. Somewhere else to be, or nothing. */
  blocked(actorId, dt) {
    return this.director.noteBlocked(actorId, dt);
  }

  /**
   * The anchor a man standing HERE should be treated as being on.
   *
   * Needed because a fight moves people: an attacker chases, takes cover,
   * gets driven off a position, and by the time he asks the graph for a new
   * route he is nowhere near the anchor he last reserved. Re-planning from a
   * stale anchor is how a man on the gallery gets handed a route that starts
   * at the front door.
   *
   * Anchors in the room he is actually in win outright, whatever the
   * distance -- a man three metres from a gallery anchor and two metres from
   * a foyer one, six metres below him, belongs to the gallery.
   */
  nearestAnchor(position, fallback = null) {
    const here = roomAt(position);
    let best = fallback;
    let bestScore = Infinity;
    for (const anchor of ANCHORS) {
      const dy = (anchor.y == null ? GROUND_Y : anchor.y) - position.y;
      const score = Math.hypot(anchor.x - position.x, anchor.z - position.z, dy)
        + (here && anchor.room !== here ? 1000 : 0);
      if (score < bestScore) { bestScore = score; best = anchor.id; }
    }
    return best;
  }

  capture() {
    return {
      occupants: this.graph.capture(),
      actors: [...this.actors.values()].map((a) => ({ id: a.id, anchor: a.anchor, role: a.role })),
    };
  }

  restore(snapshot = {}) {
    this.actors.clear();
    for (const record of snapshot.actors ?? []) {
      this.actors.set(record.id, { id: record.id, anchor: record.anchor, role: record.role ?? null });
    }
    this.graph.restore(snapshot.occupants ?? {});
    return this;
  }

  reset() {
    this.graph.reset();
    this.actors.clear();
  }
}

/**
 * Turn an anchor chain into waypoints, laned so nobody shares a spot.
 *
 * `laneT` is -1..1 and comes off the man's own index, so it is deterministic:
 * the same man walks the same line every time the checkpoint is restored.
 * The offset is PERPENDICULAR to the leg he is arriving on, which is the
 * difference between five men abreast coming up the drive and five men strung
 * out along it -- the old version offset x always, so a group walking east
 * down the lounge spread along its own direction of travel and arrived as a
 * single file of one.
 */
export function laneWaypoints(anchorIds, { from, laneT = 0, kindFor = null } = {}) {
  const out = [];
  let previous = from ?? null;
  for (const id of anchorIds) {
    const anchor = BY_ID.get(id);
    if (!anchor) continue;
    let x = anchor.x;
    let z = anchor.z;
    if (previous && anchor.lane > 0 && laneT !== 0) {
      const dx = anchor.x - previous.x;
      const dz = anchor.z - previous.z;
      const length = Math.hypot(dx, dz);
      if (length > 1e-3) {
        x += (-dz / length) * anchor.lane * laneT;
        z += (dx / length) * anchor.lane * laneT;
      }
    }
    const clamped = clampIntoRoom({ x, z }, anchor.room);
    const point = {
      x: clamped.x,
      z: clamped.z,
      y: anchor.y,
      anchor: anchor.id,
      zone: anchor.zone,
      room: anchor.room,
      kind: kindFor ? kindFor(anchor) : anchor.zone,
    };
    /* Did this leg go through a pane? The glass owner is told WHERE, not
     * which room he ended up in, so it reports the crossing rather than the
     * waypoint. Derived from the authored openings rather than guessed from
     * the geometry -- the guess once reported the rear service DOOR as a
     * broken window. */
    if (previous) {
      const crossing = crossingFor(previous, point);
      if (crossing?.opening.glass) {
        point.breaks = Object.freeze({
          id: crossing.opening.id, x: crossing.x, z: crossing.z,
        });
      }
    }
    out.push(point);
    previous = point;
  }
  return out;
}
