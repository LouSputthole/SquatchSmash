/**
 * Lou's mansion -- the Silver Sasquatch family compound.
 *
 * PHASE 1 of this mission's environment build: the exterior grounds (street
 * gate, driveway, fountain, parked cars, security booth, palms, front steps,
 * service road, pool patio) AND the building's structural shell (exterior
 * walls, roofline, floor/roof slabs, door and window openings). No interior
 * dressing lives here -- that is Phase 2's job, fitted inside the shell this
 * file builds. There is no NPC roster, combat, dialogue or mission state
 * machine in this file: it is an explorable environment, nothing else.
 *
 * Built entirely from primitives via world/build.js (mat/box/cylinder/sphere/
 * collider/group) plus one imported prop factory (bing/vehicles.js's cars),
 * the same "no asset files" convention as every other scene in this repo.
 *
 * Coordinate convention (fixed by the design brief, do not renumber):
 *   x: east(+) / west(-).  z: 0 at the street, increasing toward the mansion
 *   and then the backyard/pool beyond it.  Street grade is y = 0.
 *
 * ---------------------------------------------------------------------------
 * Shell datum numbers (Phase 2 depends on these EXACTLY):
 *   GROUND_Y = 1.2   (raised ground floor / entry portico height)
 *   UPPER_Y  = 6.0   (upper floor surface; 4.8 m ground-floor ceiling)
 *   UPPER_CEILING_Y = 10.2  (upper-floor ceiling / top of the wall volume)
 *   ROOF_Y0..ROOF_Y1 = 10.2..10.6  (roof slab, sits on top of the walls)
 *   BASEMENT_Y = -2.8  (basement floor surface, under the central hall only)
 * These were kept exactly at the suggested values -- no deviation needed.
 * ---------------------------------------------------------------------------
 */
import * as THREE from 'three';
import {
  mat, box, cylinder, sphere, collider, group,
} from '../../world/build.js';
// `populateLot` is imported per spec for signature parity with the other two,
// but its spot table is hard-authored for the Bada Bing's own parking lot
// geometry (fixed x/z pairs that mean nothing here, plus a required
// `anchors.louCar` / `anchors.suspiciousCar`). It does not fit this driveway's
// circular turnaround, so cars below are placed directly with makeCar() +
// makeVehicleCollider() at mansion-specific coordinates instead of calling it.
import { makeCar, makeVehicleCollider, populateLot } from '../../bing/vehicles.js';
// Paver texture for the driveway/turnaround (item 8 of this pass): reuse the
// existing tile-texture + clone-and-retile helpers rather than inventing a
// new canvas pattern -- `tileTex()` draws one grouted paver square,
// `tiled()` (bing/kit.js's own doc comment: "textures are cached and
// shared, so clone before retiling") clones it before setting `.repeat` so
// this doesn't retroactively retile whatever else in the game happens to
// share that exact cached texture instance.
import { tileTex } from '../../world/textures.js';
import { tiled, brick, printed } from '../../bing/kit.js';
import { resolveGear } from '../../world/gear.js';
/* The Squatch Smash player rig, reused as the monument in the fountain --
 * see buildFountain(). game/ is the in-world PC game and has no dependency
 * on this scene; this import goes one way only, and the module is three
 * hundred lines of THREE primitives with no game state in it. */
import { Sasquatch } from '../../../game/src/player.js';

void populateLot; // imported for parity/documentation only -- see note above.

/* ================================================================== */
/* Shell datum -- exported so Phase 2 (and anything else) can build to  */
/* these numbers without re-deriving them.                              */
/* ================================================================== */
export const GROUND_Y = 1.2;
export const UPPER_Y = 6.0;
export const UPPER_CEILING_Y = 10.2;
export const BASEMENT_Y = -2.8;
export const ROOF_Y0 = UPPER_CEILING_Y;
export const ROOF_Y1 = 10.6;
export const WALL_T = 0.4;
/* Keep ground-owned art in the same discoverable `*SLOTS` shape as the
 * interior art list. tools/check.mjs reads these arrays from every scene that
 * owns manifest-backed art, so a typo cannot ship as an unresolved slot. */
export const MANSION_GROUND_ART_SLOTS = [
  'mansion.gate.crests',
];
export const MANSION_GATE_ART_SLOT = MANSION_GROUND_ART_SLOTS[0];

/* THE FRONT WALL, PULLED OUT (owner playtest 2026-08-04, verbatim):
 *
 *   "both the front stairs go right into the front wall so we either need to
 *    pull the front wall out a bit and widen the room so you can get on the
 *    stairs"
 *
 * Exactly right, and measured: the horseshoe's bottom tread sat at z=42 and
 * the south wall's inside face at z=41, so the entire approach to both
 * flights was a 1 m slot between the front door and the first riser. You
 * could not stand square to a flight, let alone walk onto it.
 *
 * The whole facade moves 5 m south (z0 41 -> 36), which is a change of datum
 * rather than a nudge: the foyer, the living room, the lounge and the two
 * front bedrooms all read their own z0 from here, the shell's south wall and
 * every opening in it are built from it, and the ground plane is notched to
 * it. The stair feet stay at z=42, so the run in front of them goes from 1 m
 * to 6 m. The forecourt (turnaround, fountain, front steps, planting) moves
 * the same 5 m so the approach keeps its proportions -- see FORECOURT_SHIFT.
 */
export const BUILDING = Object.freeze({ x0: -16, x1: 16, z0: 36, z1: 75 });

/* How far the whole forecourt moved with the facade. Everything on the
 * approach is written as `<old number> - FORECOURT_SHIFT` so the two can
 * never drift apart again. */
export const FORECOURT_SHIFT = 5;

/* THE BILLIARD BAY (owner playtest 2026-08-04, verbatim):
 *
 *   "Pooltable room very nice - lets expand it a bit out to the exterior so
 *    there is enough room for the bar stools and the bar"
 *
 * Measured before moving anything: the lounge is 6.85 m wide, the billiard
 * table's collider is 2.8 m of that, the bar counter another 0.9, and the
 * stools' colliders (0.52 wide) overlapped the table's by 6 cm. There was
 * literally no floor left between a cue and a bar stool.
 *
 * So the room grows east, into a single-storey glazed bay hung off the
 * lounge's outer wall. The main block above it is untouched -- the bay's flat
 * roof lands at BAY_ROOF_Y0, well under the upper floor -- and the service
 * road moves east to make room for it (see buildServiceRoad).
 */
export const LOUNGE_BAY = Object.freeze({ x0: 16, x1: 20.6, z0: 41, z1: 54 });
export const BAY_ROOF_Y0 = 5.2;
export const BAY_ROOF_Y1 = 5.6;

/* THE WEST WING (owner brief, third pass, verbatim):
 *
 *   "Expand the mansion ground level. Beauty."
 *   "in Lou's mansion is a massive trophy engraved: THE GREAT INCLUDER"
 *
 * The east elevation already grew once (the billiard bay). This is the same
 * move on the west, at wing scale rather than bay scale: a single-storey range
 * hung off the living room and the dining room, holding two rooms the house
 * did not have -- the hall the trophy stands in, and a winter garden.
 *
 * Why here and not inside the existing footprint: every ground-floor room is
 * already furnished and every wall in the middle of the house is already a
 * partition with a doorway in it. Adding a room by subdividing one would make
 * two small rooms out of one good one. Hanging it off the west elevation makes
 * the house bigger, which is what was asked for, and it is the one elevation
 * with nothing in front of it -- the side lot stops at z=32, the rose bed at
 * z=40, and the perimeter fence is at x=-30, so the range has 5.4 m of lawn
 * outside it and fouls nothing.
 *
 * The two rooms are separated by their own partition and connected to each
 * other, so the wing reads as one range rather than two lean-tos. Its roof
 * lands at WING_ROOF_Y0/Y1, which is under the upper floor's window sills
 * (UPPER_SILL = 6.9) -- the main block above it is untouched.
 */
export const TROPHY_HALL = Object.freeze({
  x0: -24.2, x1: -16, z0: 41.0, z1: 55.7,
});
export const WINTER_GARDEN = Object.freeze({
  x0: -24.2, x1: -16, z0: 56.0, z1: 74.0,
});
/** The whole range, walls included -- what the podium and roof are poured to. */
export const WEST_WING = Object.freeze({
  x0: -24.6, x1: -16, z0: 40.6, z1: 74.4,
});
/* 6.6, not 6.0. The Great Includer is 3.3 m of cup on a metre of plinth on a
 * dais, and at a 4.8 m ceiling its finial went through the coffers -- measured,
 * by the verifier, which reads the trophy's real world box. 6.6 gives the hall
 * 5.4 m and still lands the roof slab under the upper storey's window sills at
 * 6.9, which is the constraint that fixes the upper bound. The roof's east edge
 * stops dead on the building line for the same reason (no overhang across the
 * bedroom windows above it). */
export const WING_ROOF_Y0 = 6.6;
/* 6.86, not 7.05 -- THE FLICKER IN THE UPPER-FLOOR WEST WALL.
 *
 * Owner playtest, verbatim: "Exterior wall flickers on the inside". Measured
 * on the built scene rather than guessed at: the west range's roof slab was
 * 6.60..7.05 and it runs east to the building line, while the two west
 * bedrooms' glazing starts at UPPER_SILL = 6.90 and is only 0.18 m thick. So
 * the top 150 mm of the slab passed through the bottom 150 mm of the glass --
 * 6.8 m of it in the rear bedroom and 3.8 m in the front one, plus the same
 * intersection through four window mullions.
 *
 * The comment three lines up already SAID the roof "lands under the upper
 * storey's window sills (UPPER_SILL = 6.9)", which was true of Y0 and false of
 * Y1, and Y1 is the face that does the intersecting. That is the whole defect:
 * a constraint stated against the wrong end of the slab.
 *
 * 6.86 leaves 40 mm of daylight under the sill. Y0 is untouched, so every
 * ceiling in the range (trophy hall, winter garden -- all three read
 * WING_ROOF_Y0) is exactly where it was; only the slab's thickness changes,
 * 0.45 -> 0.26. */
export const WING_ROOF_Y1 = 6.86;

/* ==================================================================== */
/* THE THIRD FLOOR — LOU'S MASTER SUITE                                  */
/*                                                                        */
/* Owner, verbatim: "It was supposed to be on the third floor -- ultra     */
/* over-the-top luxury bedroom, hot tub with girls, the dog, and           */
/* everything. Canopy bed. Big TV. Cool lighting."                         */
/*                                                                          */
/* WHY IT IS OVER THE OFFICE AND NOT OVER THE WEST WING. The brief that     */
/* reached this pass said "above the office/west wing", and the west wing    */
/* is the wrong half of that sentence, measurably: its roof is at            */
/* WING_ROOF_Y0/Y1 = 6.6/7.05, deliberately UNDER the upper storey's window  */
/* sills at 6.9. A storey standing on it would have 3.15 m to the main       */
/* block's own roof and would black out every rear bedroom window on the     */
/* west elevation. It would also not be a THIRD floor — it would be a        */
/* second one, level with the bedrooms.                                      */
/*                                                                            */
/* The house has exactly one honest third floor: on top of the main roof       */
/* slab, whose finished top is ROOF_Y1 = 10.6. So the suite floor IS that      */
/* slab, and the suite's walls stand on the walls below it — x = ±9 (the       */
/* office's own flank partitions), z = 63 (the conference/office partition)    */
/* and z = 75 (the rear elevation). Nothing cantilevers, and the mass reads    */
/* from the grounds as a set-back pavilion over the rear of the centre block   */
/* with 7.25 m of flat roof either side of it, which is what a top storey on   */
/* a house this shape looks like.                                              */
/*                                                                              */
/* `SUITE_STAIR_WELL` is the hole this floor needs cut through the roof slab    */
/* for the concealed stair that climbs out of Lou's office. MansionInterior.js  */
/* builds the stair inside that rect and imports it from here so the slab and   */
/* the flight can never disagree about where the opening is.                    */
/* ==================================================================== */
/** Suite floor = the top of the existing roof slab. Nothing is re-poured. */
export const SUITE_Y = ROOF_Y1;
/** 3.2 m ceilings. The floor below has 4.2; a top storey sits a little lower. */
export const SUITE_CEILING_Y = 13.8;
export const SUITE_ROOF_Y0 = SUITE_CEILING_Y;
export const SUITE_ROOF_Y1 = 14.2;
/** Inner faces of the suite. Stacked exactly on the office below. */
export const MASTER_SUITE = Object.freeze({
  x0: -8.85, x1: 8.85, z0: 63.15, z1: 75.0,
});
/**
 * The hole in the main roof slab that the concealed stair rises through.
 *
 * These are the OPEN edges — the faces a balustrade stands on, not the
 * outside of the walls below. The stair hall's west wall is x 6.25..6.55 and
 * its north wall z 68.85..69.15; both stop at ROOF_Y0 and carry the slab, so
 * the slab reaches over their heads and the parapet stands on top of it.
 */
export const SUITE_STAIR_WELL = Object.freeze({
  x0: 6.55, x1: 8.85, z0: 65.25, z1: 68.85,
});

/* THE LOWER LEVEL (owner brief, third pass): a guest bedroom, a LAN room, a
 * home theatre and a vault, none of which fit in the armory.
 *
 * The armory (BASEMENT_ROOM) is deliberately NOT enlarged. It is furnished
 * wall to wall, a sibling pass is mounting a weapons armory on its south and
 * west walls, and moving its shell would move theirs. Instead the basement
 * gains a wing to the NORTH of it, under the ballroom/dining/kitchen block,
 * joined by one doorway punched through the armory's north wall between the
 * tool bench and the boiler (CELLAR_DOOR) -- the only 1.85 m of that wall with
 * nothing standing against it.
 *
 * BASEMENT_WING is the FOOTPRINT, wall bands included, and is what floorAt
 * reads: a rect per room would leave the wall bands and every threshold
 * between them with no floor candidate at all, and floorAt's "nothing here"
 * fallback is the podium 4 m overhead.
 */
export const BASEMENT_WING = Object.freeze({
  x0: -15.6, x1: 15.6, z0: 64.0, z1: 74.6,
});
/** The spine corridor: every room downstairs opens off it. */
export const CELLAR_HALL = Object.freeze({
  x0: -15.6, x1: 15.6, z0: 64.3, z1: 67.4,
});
export const GUEST_ROOM = Object.freeze({
  x0: -15.6, x1: -7.9, z0: 67.7, z1: 74.6,
});
export const THEATRE = Object.freeze({
  x0: -7.6, x1: 1.9, z0: 67.7, z1: 74.6,
});
/* The theatre's back row stands on a riser -- offered by floorAt.
 *
 * At the SOUTH end, which is the end you come in at: the screen is on the
 * north wall, so a raked floor rises away from it, and you enter a cinema at
 * the top of the rake. Getting this the wrong way round puts the back row in
 * a pit and the front row's heads in the picture. */
export const THEATRE_TIER = Object.freeze({
  x0: -7.6, x1: 1.9, z0: 67.7, z1: 70.3, y: 0.3,
});
export const LAN_ROOM = Object.freeze({
  x0: 2.2, x1: 10.9, z0: 67.7, z1: 74.6,
});
export const VAULT = Object.freeze({
  x0: 11.2, x1: 15.6, z0: 67.7, z1: 74.6,
});
/** The one hole in the armory's north wall. Everything else there is untouched. */
export const CELLAR_DOOR = Object.freeze({ x0: 5.35, x1: 7.05 });

/* ---------------------------------------------------------------------------
 * THE SEAM (docs/MISSION-SILENT-SQUATCH.md, beat 3).
 *
 * The expansion pass left the corridor's WEST END WALL blank on purpose and
 * said so in three places: nothing hung on it, nothing standing in front of
 * it, and a verifier assertion holding the gap open. This is the door that gap
 * was kept for -- a hole punched clean through the wing's west shell wall at
 * the corridor's own floor, filled by a decorative wall panel that slides
 * backward and then sideways when the switch under the marble bust is thrown.
 *
 * The shell contributes the OPENING and its lintel and nothing else. The
 * panel, the mechanism, the plinth, the bust and everything west of here
 * belong to `SilentSquatch.js`, which is also what closes the hole up again:
 * with that module absent this is a 2 m doorway into bare earth, so the two
 * ship together or not at all.
 *
 * 2.0 m wide, centred on the corridor (z 64.3..67.4, mid 65.85). A door has to
 * be walked through, and the maze lesson -- no channel narrower than 0.6 m --
 * applies here with a great deal of margin.
 */
export const SECRET_DOOR = Object.freeze({
  x0: BASEMENT_WING.x0 - 0.3,
  x1: BASEMENT_WING.x0,
  z0: 64.85,
  z1: 66.85,
  y0: BASEMENT_Y,
  y1: BASEMENT_Y + 2.25,
});

/* ---------------------------------------------------------------------------
 * LAYOUT DATUM (2026-08-04 rework, owner's brief).
 *
 * "I want the Conference room to be at the top of the stairs and the stairs to
 *  be a big horse shoe with two sets of stairs going up with the balcony in the
 *  middle and when you walk in the foyer is a big open area leading to that
 *  horseshoe stair case. I want the conference room then behind it Lous office
 *  up there at the top of the stairs in the middle. Then bed rooms on the side."
 *
 * The three rectangles below are the *structural* consequences of that brief --
 * they are the only places the shell differs from a plain three-slab box, so
 * both this file and MansionInterior.js read them from here rather than each
 * keeping its own copy:
 *
 *   FOYER_VOID     the upper floor slab is missing over this footprint, which
 *                  is what makes the entrance hall double-height. The two
 *                  horseshoe flights and the central balcony bay are built
 *                  inside it by MansionInterior.js.
 *   BASEMENT_ROOM  the armory, a genuine room below the rear of the house.
 *   BASEMENT_SHAFT the stairwell down to it: a hole cut clean through the
 *                  ground-floor podium, so the descending stair is the ONLY
 *                  walkable surface inside this rect (see MansionInterior's
 *                  floorAt -- the previous layout offered the flat ground floor
 *                  as a candidate everywhere in the hall, which is exactly why
 *                  the basement stair could never be walked down).
 * ------------------------------------------------------------------------- */
export const FOYER_VOID = Object.freeze({ x0: -8.85, x1: 8.85, z0: BUILDING.z0, z1: 48 });
export const BASEMENT_ROOM = Object.freeze({ x0: -9, x1: 9, z0: 50, z1: 64 });
export const BASEMENT_SHAFT = Object.freeze({ x0: 5.4, x1: 9, z0: 51, z1: 58 });
/** Kept for readers of the old name: the double-height entrance footprint. */
export const ATRIUM = FOYER_VOID;

export const GLASS_SILL = GROUND_Y + 0.15; // 1.35 -- floor-to-near-ceiling glass
export const GLASS_TOP = GROUND_Y + 3.35; // 4.55

export const FRONT_DOOR = Object.freeze({
  x: 0, y: GROUND_Y, z: BUILDING.z0, x0: -1.6, x1: 1.6, y0: GROUND_Y, y1: GROUND_Y + 3.0,
});
export const REAR_DOOR = Object.freeze({
  x: 16, y: GROUND_Y, z: 66, z0: 64.8, z1: 67.2, y0: GROUND_Y, y1: GROUND_Y + 2.4,
});

/* Three metres south of the turnaround's centre. The basin's widest tier is
 * r=6, so it must sit at least that far clear of the bottom tread of the
 * front steps or the rim eats them (which is what happened at z=35 on the old
 * facade line). Both numbers now move with the facade -- see FORECOURT_SHIFT
 * -- so the rim still stops a clear metre short of the steps. */
export const COURT_CENTRE = Object.freeze({ x: 0, z: 35 - FORECOURT_SHIFT });
/* 15.2, not 12 (owner playtest, verbatim: "Widen the driveway around the front
 * fountain -- it needs more room").
 *
 * MEASURED BEFORE MOVING ANYTHING, because "it feels tight" is a symptom and
 * the tightness was not evenly distributed. The basin's widest tier is r = 6
 * and it sits THREE METRES SOUTH of the court's own centre, so at r = 12 the
 * drivable ring was:
 *
 *   south arc   12 - 3 - 6 = 3.0 m   <- the pinch, and the arc every car
 *                                       arriving from the gate has to turn on
 *   east/west   sqrt(144-9) - 6 = 5.6 m
 *   north arc   12 + 3 - 6 = 9.0 m
 *
 * Three metres is one car's width with nothing either side of it. The first
 * widening to 14.2 still felt pinched in the walkthrough. At 15.2 the same
 * three numbers are 6.2 / 8.9 / 12.2, leaving a visibly generous arrival
 * apron without moving the fountain or redesigning the court.
 *
 * WHY THE RADIUS AND NOT THE CENTRE. Re-centring the basin on the court would
 * have levelled all three arcs at 8.2 m, and it is the more obvious fix -- but
 * the fountain's collision body is what stops a straight walk up the drive
 * short of the steps, `verify:mansion` walks exactly that, and moving the
 * basin north moves where the walk stops. The basin stays where the facade
 * pass put it; the paving grows around it.
 *
 * The north edge lands at z = 45.2, which is 9.2 m INSIDE the building line
 * (BUILDING.z0 = 36) -- the circle has always run under the podium and the
 * front steps, and that overlap is hidden under the same masonry. */
export const COURT_RADIUS = 15.2;
export const FOUNTAIN_POS = Object.freeze({ x: 0, z: 32 - FORECOURT_SHIFT });
export const POOL = Object.freeze({
  x0: -7, x1: 7, z0: 81, z1: 89, y: GROUND_Y - 1.3,
});
export const SECURITY_BOOTH_POS = Object.freeze({ x: 8, z: 4 });

/* THE REAR GARDEN (owner brief, third pass, verbatim):
 *
 *   "More fancy shit in the backyard."  "A hedge maze garden"  "fancy brick
 *    walls"
 *
 * Behind the pool, on ground the property did not previously own: a formal
 * garden on a single north-south axis, walled in brick rather than fenced in
 * iron. Wrought iron is what you show the street; brick is what you put round
 * the part nobody drives past.
 *
 * GARDEN is the walled enclosure, measured to the INSIDE faces of the brick.
 * MAZE and ROSE_GARDEN are the two halves either side of the axis. The maze's
 * corridor width is derived from its own cell size and hedge thickness and is
 * asserted by tools/verify-mansion.mjs -- a hedge maze whose corridors narrow
 * anywhere is the NO WAKE deck fault with topiary on it.
 */
export const GARDEN = Object.freeze({
  x0: -29.7, x1: 29.7, z0: 96, z1: 125.7,
});
export const GARDEN_WALL = Object.freeze({
  x0: -30, x1: 30, z0: 90, z1: 126, h: 2.6, t: 0.6,
});
export const MAZE = Object.freeze({
  x0: -25.0, x1: -9.4, z0: 100.0, z1: 122.0, cols: 5, rows: 7, hedge: 0.7, height: 2.15,
});
export const ROSE_GARDEN = Object.freeze({
  x0: 9.4, x1: 25.0, z0: 100.0, z1: 122.0, wall: 2.3, t: 0.5,
});
// The gravel walks are a real 60 mm finish laid over the site datum. Anything
// founded in the garden starts here rather than being buried through it.
export const GARDEN_WALK_TOP = 0.06;
/** The reflecting canal on the garden's axis, and the pavilion that closes it. */
/* A rill rather than a lake: 3.2 m wide, so the axis walk can run down BOTH
 * sides of it at a proper width instead of the walk having to be notched into
 * two 55 cm ribbons. `kerb` is how far the coping stands proud of the water on
 * each side, and the walk is cut around exactly that. */
export const CANAL = Object.freeze({
  x0: -1.6, x1: 1.6, z0: 103.0, z1: 115.0, y: -0.55, kerb: 0.45,
});
export const PAVILION = Object.freeze({ x: 0, z: 120.4, r: 4.2 });

/* ================================================================== */
/* Material palette -- procedural only, matching the rest of the game. */
/* ================================================================== */
const M_GRASS = mat({ color: 0x223f28, roughness: 1 });
const M_CURB = mat({ color: 0xdedac9, roughness: 0.55 });
const M_ASPHALT = mat({ color: 0x2b2c32, roughness: 0.85 });

const M_STUCCO = mat({ color: 0xe9e1cc, roughness: 0.82 });
const M_ROOF = mat({ color: 0x352f28, roughness: 0.75 });
const M_PODIUM = mat({ color: 0xcdc6b2, roughness: 0.7 });
const M_GOLD = mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 });
const M_GLASS_TINT = mat({
  color: 0x8fc7dc, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.4,
});
/** Bathroom glazing -- you can tell there is a light on, and nothing else. */
const M_GLASS_FROST = mat({
  color: 0xd6e4ea, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.72,
});
/** Window frames/mullions: dark bronze, so the glazing reads as glazing. */
const M_MULLION = mat({ color: 0x2a2620, roughness: 0.5, metalness: 0.35 });
/** The basement's ceiling soffit -- poured concrete, not the podium's stone. */
const M_BASEMENT_CEIL = mat({ color: 0x2b2925, roughness: 0.97 });

/** Explicit combat-surface language; visual names never grant penetration. */
function combatMaterialFor(material) {
  if (material === M_GLASS_TINT || material === M_GLASS_FROST) return 'glass';
  if (material === M_MULLION || material === M_IRON
    || material === M_BRONZE || material === M_GOLD) return 'metal';
  if (material === M_STUCCO || material === M_BASEMENT_CEIL
    || material === M_MARBLE || material === M_MARBLE_DK) return 'concrete';
  return null;
}

const M_MARBLE = mat({ color: 0xe6e0d2, roughness: 0.32 });
const M_MARBLE_DK = mat({ color: 0xb7ae98, roughness: 0.4 });
const M_BRONZE = mat({ color: 0x8a5a2e, roughness: 0.35, metalness: 0.65 });
const M_SILVER = mat({ color: 0xc8ccd6, roughness: 0.16, metalness: 0.9 });
/* The monument's own metal, and why it is not M_SILVER.
 *
 * Measured, not guessed: cast in M_SILVER (metalness 0.9, roughness 0.16) the
 * statue rendered as a black cut-out against the sky in every night shot. A
 * near-pure metal has almost no diffuse response, so with no environment map
 * in this scene it can only show what a light source specularly reflects
 * straight back at the camera -- and four small rim uplights do not. Pulling
 * the metalness down to a quarter and lifting the base colour gives the
 * uplights something to work with, which is what makes it read as silver
 * rather than as a hole in the picture, and a low emissive keeps the
 * silhouette alive when the light rig has switched the rim lamps off. */
const M_STATUE = mat({
  color: 0xdfe4ee, roughness: 0.34, metalness: 0.26, emissive: 0x1b2130, emissiveIntensity: 0.55,
});
/** Family red for the statue's headband, so the mascot shape reads at night. */
const M_STATUE_PATINA = mat({
  color: 0xa51f2d, roughness: 0.42, metalness: 0.2, emissive: 0x31070b, emissiveIntensity: 0.72,
});
const M_CHROME = mat({ color: 0xd7dce3, roughness: 0.14, metalness: 0.95 });

const M_FENCE = mat({ color: 0x15161c, roughness: 0.5, metalness: 0.55 });
const M_PILLAR = mat({ color: 0xcac2ac, roughness: 0.5 });

const M_BOOTH = mat({ color: 0x1c2530, roughness: 0.7 });
const M_BOOTH_ROOF = mat({ color: 0x11161d, roughness: 0.8 });
const M_BOOTH_GLASS = mat({
  color: 0x8fb6c8, roughness: 0.1, transparent: true, opacity: 0.35,
});
const M_BARRIER_ARM = mat({ color: 0xd8d420, roughness: 0.5 });
/* The dark bands that turn a yellow stick into a boom gate. */
const M_BARRIER_STRIPE = mat({ color: 0x1b1b1e, roughness: 0.62 });

const M_PALM_TRUNK = mat({ color: 0x5c4a32, roughness: 0.9 });
const M_PALM_LEAF = mat({ color: 0x2f6b3c, roughness: 0.85, side: THREE.DoubleSide });

const M_DECK = mat({ color: 0xcfc9b8, roughness: 0.62 });
const M_POOL_WALL = mat({ color: 0xbfc7c2, roughness: 0.5 });
const M_POOL_LINER = mat({ color: 0x2a3a3d, roughness: 0.6 });
const M_LOUNGE = mat({ color: 0x2f7f78, roughness: 0.85 });
const M_TOWEL = mat({ color: 0xe8e0cc, roughness: 1 });
const M_POOL_GLASS = mat({
  color: 0xdfe8ea, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.45,
});
/** The deck's skirt and coping -- see buildPoolPatio's fascia note. */
const M_DECK_SKIRT = mat({ color: 0xb4ad9c, roughness: 0.72 });
const M_LAMP_POST = mat({ color: 0x14151a, roughness: 0.5, metalness: 0.6 });

/* The rear garden's masonry. Brick is retiled per surface (memoised on the
 * rounded repeat pair, the same way the driveway pavers are) so a 36 m estate
 * wall reads as courses of brick rather than one brick stretched to 36 m. */
const brickBase = brick('#7a4630');
const _brickCache = new Map();
function brickMaterial(w, h) {
  const rx = Math.max(1, Math.round(w / 1.9));
  const ry = Math.max(1, Math.round(h / 1.9));
  const key = `${rx}x${ry}`;
  let m = _brickCache.get(key);
  if (!m) {
    m = mat({
      map: tiled(brickBase, rx, ry), color: 0xffffff, roughness: 0.92, unique: true,
    });
    _brickCache.set(key, m);
  }
  return m;
}
/* world/build.js's `box()` takes a `name`; its `cylinder()` and `sphere()` do
 * not, and a helper five scenes share is not something this file gets to
 * change. So anything round that has to be findable by name -- a jet, a pin, a
 * bottle -- is tagged on the way past instead. */
function named(mesh, name) {
  mesh.name = name;
  return mesh;
}

/** Explicit structural support for the Siege actor ground ray. This tag is
 * intentionally opt-in: a broad "visible horizontal mesh" test also accepts
 * blood decals, car roofs, props and bodies as floors. */
function siegeWalkable(mesh, name = null) {
  if (name) mesh.name = name;
  mesh.userData.siegeWalkableSupport = true;
  return mesh;
}

const M_COPING = mat({ color: 0xd6cfb8, roughness: 0.55 });
const M_GRAVEL = mat({ map: tiled(tileTex(6, '#4b463c', '#8d8676'), 26, 26), roughness: 0.98, unique: true });
const M_YEW = mat({ color: 0x1c3f24, roughness: 1 });
const M_YEW_TOP = mat({ color: 0x21492a, roughness: 1 });
const M_IRON = mat({ color: 0x14161a, roughness: 0.45, metalness: 0.6 });
const M_TEAK = mat({ color: 0x6a4a2c, roughness: 0.75 });
const M_BRONZE_STATUE = mat({
  color: 0x6e5a34, roughness: 0.42, metalness: 0.45, emissive: 0x16120a, emissiveIntensity: 0.9,
});

/* ================================================================== */
/* Water: adapted from src/nowake/world.js's buildWater() -- the same    */
/* sine-displaced-vertex + fresnel-ish tinted-fragment ShaderMaterial     */
/* technique, rescaled for small basins (higher spatial frequency, much   */
/* smaller amplitude, no 3000 m ocean plane) instead of the Motel lambert-*/
/* plane fallback. Chosen because it is cheap for two small disc/rect     */
/* meshes and gives the hero fountain a genuinely animated surface; the   */
/* pool reuses the exact same factory with a different tint.             */
/*                                                                        */
/* EXPORTED because the third floor's hot tub is the same problem at a     */
/* smaller radius, and a second copy of this shader inside                */
/* MansionInterior.js would be a second thing to fix the next time the     */
/* water is wrong. The caller owns ticking `uniforms.uTime`.               */
/* ================================================================== */
export function makeWaterMaterial({ deep = 0x0b3440, shallow = 0x1f7d8c, opacity = 0.85 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: Math.random() * 10 },
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv2;
      varying float vHeight;
      uniform float uTime;
      void main() {
        vec3 p = position;
        float a = sin(p.x * 1.8 + uTime * 1.6) * 0.028;
        float b = sin(p.y * 2.3 - uTime * 2.1 + p.x * 0.6) * 0.020;
        p.z += a + b;
        vHeight = a + b;
        vUv2 = p.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv2;
      varying float vHeight;
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uOpacity;
      void main() {
        float ripple = sin(vUv2.x * 2.4 + vUv2.y * 1.6 + uTime * 2.4);
        vec3 col = mix(uDeep, uShallow, clamp(0.35 + vHeight * 3.2 + ripple * 0.06, 0.0, 1.0));
        float glint = pow(max(0.0, ripple), 10.0) * 0.22;
        col += glint;
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
}

/* ================================================================== */
/* Upward fountain jet -- adapted from world/shower.js's ShowerSystem:   */
/* the same Points-cloud-of-streaks technique (per-drop life/velocity/   */
/* spread arrays recycled once they finish), with the fall inverted     */
/* into a rise-then-fall arc, and no cone sheet (a jet has no shower     */
/* rose to widen from).                                                  */
/* ================================================================== */
const SPRAY_DROPS = 140;
const SPRAY_RISE = 2.6;
const SPRAY_SPEED_MIN = 2.0;
const SPRAY_SPEED_MAX = 3.2;
const SPRAY_SPREAD = 0.22;

let _sprayDropTex = null;
function sprayDropTexture() {
  if (_sprayDropTex) return _sprayDropTex;
  const w = 16;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(228,244,255,0.55)');
  grad.addColorStop(1, 'rgba(210,236,255,0)');
  g.fillStyle = grad;
  g.fillRect(w * 0.32, 0, w * 0.36, h);
  _sprayDropTex = new THREE.CanvasTexture(c);
  _sprayDropTex.colorSpace = THREE.SRGBColorSpace;
  return _sprayDropTex;
}

/* ================================================================== */
/* Gate medallion -- drawn, not modelled. Same trick MansionInterior.js's   */
/* boardroom uses for its projector screen (see makeProjectorScreenTexture()*/
/* there): a flat chrome disc reads as a dark blob at driveway distance, so */
/* the artwork is a canvas texture instead -- a heavy, unmistakable         */
/* Sasquatch footprint -- applied to a CircleGeometry face in front of the  */
/* disc.                                                                     */
/* ================================================================== */
let _medallionTex = null;
function gateMedallionTexture() {
  if (_medallionTex) return _medallionTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S / 2);
  grad.addColorStop(0, '#eef1f6');
  grad.addColorStop(0.68, '#b6bcc7');
  grad.addColorStop(1, '#767c88');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2c2f36';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  g.stroke();

  // Heavy dark-relief footprint: a heel pad plus five toes, unmistakable
  // even blurred at range -- much more legible than the old flat boxes.
  g.fillStyle = '#20232b';
  g.beginPath();
  g.ellipse(S / 2, S * 0.63, S * 0.20, S * 0.27, 0, 0, Math.PI * 2);
  g.fill();
  const toeXs = [-0.155, -0.085, 0, 0.085, 0.155];
  const toeRs = [0.050, 0.061, 0.066, 0.061, 0.050];
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.ellipse(
      S / 2 + toeXs[i] * S,
      S * 0.29 - Math.abs(toeXs[i]) * S * 0.32,
      toeRs[i] * S,
      toeRs[i] * S * 1.15,
      0, 0, Math.PI * 2,
    );
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  _medallionTex = tex;
  return tex;
}

/* ================================================================== */
/* Fountain jet column -- a thin tapered translucent shell with a scrolling */
/* streak texture, always giving the fountain a genuinely visible "water is */
/* moving" read even in a single static frame (see FountainSpray, below,    */
/* for why the Points cloud alone was not enough).                          */
/* ================================================================== */
let _jetTex = null;
function jetColumnTexture() {
  if (_jetTex) return _jetTex;
  const w = 32;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y += 3) {
    const t = y / h;
    const band = 0.3 + 0.5 * Math.pow(Math.sin(t * 19 + 1.3), 2);
    g.fillStyle = `rgba(232,248,255,${band.toFixed(3)})`;
    g.fillRect(0, y, w, 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 7; i++) {
    let x = 3 + Math.random() * (w - 6);
    g.lineWidth = 1 + Math.random() * 1.6;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 6; y <= h; y += 7) {
      x += (Math.random() - 0.5) * 3.2;
      x = Math.min(w - 2, Math.max(2, x));
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _jetTex = tex;
  return tex;
}

/* ================================================================== */
/* Foam ring -- a static drawn texture at the spray's landing radius so the */
/* impact reads as "working water", not just a lit bowl.                     */
/* ================================================================== */
let _foamTex = null;
function foamRingTexture() {
  if (_foamTex) return _foamTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  for (let i = 0; i < 460; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = S * 0.24 + Math.random() * S * 0.24;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r;
    const rad = 2.5 + Math.random() * 7;
    g.fillStyle = `rgba(255,255,255,${(0.2 + Math.random() * 0.55).toFixed(3)})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _foamTex = tex;
  return tex;
}

class FountainSpray {
  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.Vector3} origin
   * @param {{rise?:number, speedMin?:number, speedMax?:number, spread?:number,
   *          drops?:number, size?:number}} [opts]
   *
   * The options exist because there are two fountains on this property now --
   * the monument in the turnaround and the little one standing in the pool --
   * and a jet sized for a 3.7 m statue looks like a burst main in four feet
   * of water. Defaults are the driveway fountain's original constants, so
   * that call site is unchanged.
   */
  constructor(parent, origin, opts = {}) {
    const {
      rise = SPRAY_RISE,
      speedMin = SPRAY_SPEED_MIN,
      speedMax = SPRAY_SPEED_MAX,
      spread = SPRAY_SPREAD,
      drops = SPRAY_DROPS,
      size = 0.34,
    } = opts;
    this.origin = origin.clone();
    this.rise = rise;
    this.speedMin = speedMin;
    this.speedMax = speedMax;
    this.spreadScale = spread;
    this.drops = drops;
    this.t = 0;
    this.on = false;
    this.pos = new Float32Array(drops * 3);
    this.vel = new Float32Array(drops);
    this.life = new Float32Array(drops);
    this.spread = new Float32Array(drops * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // Point size was 0.09 -- about 9cm streaks, which additive blending plus
    // ACES tone mapping crush to nothing by the time a screenshot is taken
    // from the 6-10m the fountain is actually viewed from. Quadrupled, and
    // `toneMapped = false` so the streaks stay bright regardless of the
    // renderer's exposure curve instead of getting compressed toward grey.
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: sprayDropTexture(),
      size,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    parent.add(this.points);
    for (let i = 0; i < drops; i++) this._seed(i, Math.random());

    // Secondary jet column: a thin tapered translucent shell with a
    // scrolling streak texture running up the centre of the spray. Even if
    // every particle above happened to be off-screen or too subtle, this
    // guarantees a genuinely visible, animated "water is moving" column in
    // any static screenshot -- see jetColumnTexture()'s doc comment.
    const jetH = rise * 0.86;
    const jetR = 0.16 * (rise / SPRAY_RISE);
    this.jetGeo = new THREE.CylinderGeometry(jetR, jetR * 0.34, jetH, 14, 6, true);
    this.jetMat = new THREE.MeshBasicMaterial({
      map: jetColumnTexture(),
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.jet = new THREE.Mesh(this.jetGeo, this.jetMat);
    this.jet.name = 'fountain-spray-jet';
    this.jet.userData.geometryGate = {
      overlap: false,
      checkSupport: false,
    };
    this.jet.position.set(this.origin.x, this.origin.y + jetH / 2, this.origin.z);
    this.jet.frustumCulled = false;
    this.jet.visible = false;
    parent.add(this.jet);
  }

  _seed(i, at) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    this.spread[i * 2] = Math.cos(a) * r;
    this.spread[i * 2 + 1] = Math.sin(a) * r;
    this.vel[i] = this.speedMin + Math.random() * (this.speedMax - this.speedMin);
    this.life[i] = at;
  }

  start() { this.on = true; this.points.visible = true; this.jet.visible = true; }

  stop() { this.on = false; this.points.visible = false; this.jet.visible = false; }

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    const o = this.origin;
    for (let i = 0; i < this.drops; i++) {
      this.life[i] += (this.vel[i] / this.rise) * dt;
      if (this.life[i] >= 1) this._seed(i, this.life[i] - 1);
      const f = this.life[i];
      const arc = Math.sin(f * Math.PI); // rises then falls back, not a straight drop
      const j = i * 3;
      this.pos[j] = o.x + this.spread[i * 2] * this.spreadScale * f;
      this.pos[j + 1] = o.y + this.rise * arc;
      this.pos[j + 2] = o.z + this.spread[i * 2 + 1] * this.spreadScale * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    // Scroll the jet's texture upward (rushing-water motion) and let it
    // breathe a little in opacity/width -- cheap, but reads as "alive" even
    // in a single frame since the streak texture itself is already bright.
    this.jetMat.map.offset.y = (this.jetMat.map.offset.y - dt * 1.35) % 1;
    this.jetMat.opacity = 0.52 + Math.sin(this.t * 5.2) * 0.1;
    const wobble = 1 + Math.sin(this.t * 6.3) * 0.05;
    this.jet.scale.x = wobble;
    this.jet.scale.z = wobble;
  }
}

/* ================================================================== */
/* buildMansionGrounds()                                                 */
/* ================================================================== */
/**
 * Builds the exterior grounds and the building shell.
 *
 * Takes no arguments by design -- the caller adds `root` to its own scene
 * and applies `props.sky` to it (background/fog are Scene properties, not
 * Object3D ones, so they cannot be set from inside a parentless group). If
 * a THREE.Scene is passed in, this applies them directly as a convenience.
 *
 * @param {THREE.Scene | null} [scene]
 */
/* GEOMETRY_GATE_MANSION_SHELL_JOIN: exact wall, roof, floor, podium and matching collider pairs intentionally key into adjoining structural runs to leave one sealed mansion shell. */
/* GEOMETRY_GATE_MANSION_GROUNDS_FIXTURE_JOIN: exact gate, paving, stair, railing, pool and garden-fixture parts intentionally lap only their authored mating faces. */
export function buildMansionGrounds(scene = null) {
  const root = new THREE.Group();
  root.name = 'MansionGrounds';
  const colliders = [];
  const waterMaterials = [];

  /** Push an axis-aligned Box3 blocker. Walls/furniture/vehicles only --
   * never floor or roof slabs, which the player stands ON, not into (a
   * slab registered here would be read as a wall by Player._resolve and
   * eject anyone standing on top of it sideways off its own footprint). */
  function solid(x0, x1, y0, y1, z0, z1) {
    const c = collider([Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)]);
    colliders.push(c);
    return c;
  }

  /* ================================================================== */
  /* THE HOUSE HAD NO FLOORS AS FAR AS COMBAT WAS CONCERNED              */
  /*                                                                      */
  /* Owner playtest, verbatim: "In the siege I'm getting killed in the     */
  /* cellar before I even go up, no one is down there, so I don't know if  */
  /* the combat system through walls and floors is working as intended."   */
  /*                                                                       */
  /* It was not. Simulated against this very builder's output: an attacker */
  /* standing in the foyer on the GROUND floor acquired a player in the    */
  /* BASEMENT armory with targetVisible=true, put his first round into him */
  /* at t=6.97 s and killed him at t=10.93 s, never once coming down the    */
  /* stairs, and the player never had a frame in which he could see the     */
  /* man who was killing him. A second man in the rear hall shot the player */
  /* at his own spawn point four metres below him at t=0.78 s. A ray fired  */
  /* from the player's head straight up sixteen metres crossed ZERO         */
  /* colliders: floor, ceiling, upper slab, roof, all of it, nothing.       */
  /*                                                                        */
  /* The cause is directly above this comment. `solid()` is the MOVEMENT     */
  /* list, and a floor slab must never go in it -- `core/player.js` reads    */
  /* every box in that array as something to be pushed out of horizontally,  */
  /* so a slab in there ejects anyone standing on it sideways off his own    */
  /* footprint. So every slab in this house was poured as a bare mesh with   */
  /* no collider at all, and said so ("Neither carries a collider -- these   */
  /* are floors, walked ON, not into"). Correct for movement. But the siege  */
  /* hands that same movement array to the shared combat Modules as its      */
  /* line-of-sight and Ballistic-path model, and a storey that is not in it  */
  /* is a storey a bullet and a pair of eyes travel through as if it were    */
  /* open air.                                                               */
  /*                                                                          */
  /* docs/CONTEXT.md already had the word for the way out. "Combat material:  */
  /* an explicit geometry tag that defines ballistic resistance INDEPENDENTLY */
  /* FROM whether the same surface blocks vision" -- and, by the same         */
  /* reasoning, independently from whether it blocks movement. So there are   */
  /* two arrays out of this builder now and they answer two different         */
  /* questions:                                                               */
  /*                                                                           */
  /*   colliders       what a body may not walk into.   (unchanged, byte for   */
  /*                   byte -- `verify:mansion` counts it and asserts that no  */
  /*                   member of it tops out on a floor datum)                 */
  /*   combatBlockers  what stops a round and a line of sight and is NOT in    */
  /*                   the movement list: every floor slab, ceiling soffit and */
  /*                   roof slab in the building, each tagged with its real    */
  /*                   Combat material.                                        */
  /*                                                                            */
  /* The second is ADDITIVE. It is not a complete combat model on its own and   */
  /* is not meant to be: the walls are already in `colliders` and are already   */
  /* tagged, so a composition root builds its sight/ballistics list by          */
  /* concatenating the two and keeps handing `colliders` alone to the player    */
  /* controller. MansionInterior.js returns an array of the same name, built to */
  /* the same contract, for the same reason.                                    */
  /*                                                                             */
  /* Everything poured here is reinforced concrete -- podium, upper slab, roof   */
  /* slab, basement raft, cellar soffits -- and `concrete` is not in             */
  /* `PENETRABLE` in core/combat/ballistics.js, so one contact with any of them  */
  /* is the truthful terminal point of the shot. That is the whole intent: you   */
  /* cannot shoot a man through the floor of a poured-concrete mansion.          */
  /* ================================================================== */
  const combatBlockers = [];

  /**
   * Register one horizontal structural surface with the combat model only.
   *
   * Deliberately NOT a mesh builder. Every slab this is called for already
   * exists as geometry a few lines away; duplicating the mesh here would put
   * two of everything in the house. This registers the BOX, beside the mesh,
   * at the same numbers, so the two can never drift apart in a diff.
   */
  function structural(x0, x1, y0, y1, z0, z1, name, combatMaterial = 'concrete') {
    const c = collider(
      [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
    );
    c.name = name;
    c.combatMaterial = combatMaterial;
    c.userData = { ...(c.userData ?? {}), combatMaterial };
    combatBlockers.push(c);
    return c;
  }

  function geometryIntent(object, policy) {
    object.userData ??= {};
    object.userData.geometryGate = { ...(object.userData.geometryGate ?? {}), ...policy };
    return object;
  }

  /** A solid box: mesh + matching collider. Used for every exterior wall,
   * pier, lintel, glass pane and basement wall segment. */
  const wallRects = [];
  /* Sight blockers for the look-prompt raycast -- see the matching note in
   * MansionInterior.js. Exterior walls, glazing and the floor slabs. */
  const occluders = [];
  function ext(
    x0, x1, y0, y1, z0, z1, tag,
    material = M_STUCCO,
    addCollider = true,
    assemblyId = `mansion-exterior-segment:${tag}`,
    segmentIndex = wallRects.length,
  ) {
    const m = box({
      size: [x1 - x0, y1 - y0, z1 - z0],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      mat: material,
      name: tag,
    });
    root.add(m);
    m.userData.geometryGate = { wall: true, assemblyId };
    occluders.push(m);
    const combatMaterial = combatMaterialFor(material);
    if (combatMaterial) m.userData.combatMaterial = combatMaterial;
    if (addCollider) {
      const contact = solid(x0, x1, y0, y1, z0, z1);
      contact.name = `${tag}-collider-${segmentIndex}`;
      contact.userData = {
        ...(contact.userData ?? {}),
        geometryGate: { ...(contact.userData?.geometryGate ?? {}), assemblyId },
      };
      if (combatMaterial) {
        contact.combatMaterial = combatMaterial;
        contact.userData.combatMaterial = combatMaterial;
      }
    }
    wallRects.push({
      tag, x0, x1, y0, y1, z0, z1, assemblyId,
    });
    return m;
  }

  /* ---------------------------------------------------------------- */
  /* Night sky, fog, lighting rig                                       */
  /* ---------------------------------------------------------------- */
  const sky = { background: 0x05060c, fogColor: 0x0a0e18, fogDensity: 0.009 };
  if (scene) {
    scene.background = new THREE.Color(sky.background);
    scene.fog = new THREE.FogExp2(sky.fogColor, sky.fogDensity);
  }

  const hemi = new THREE.HemisphereLight(0x4a5a8c, 0x18140e, 0.9);
  root.add(hemi);
  const moon = new THREE.DirectionalLight(0x9fb2e0, 1.1);
  moon.position.set(-40, 70, 20);
  moon.target.position.set(0, 0, 45);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1536, 1536);
  moon.shadow.camera.left = -45;
  moon.shadow.camera.right = 45;
  moon.shadow.camera.top = 55;
  moon.shadow.camera.bottom = -55;
  moon.shadow.camera.near = 10;
  moon.shadow.camera.far = 220;
  moon.shadow.bias = -0.0009;
  root.add(moon, moon.target);

  /* ---------------------------------------------------------------- */
  /* Ground plane                                                       */
  /*                                                                     */
  /* Notched around the building footprint rather than run straight      */
  /* through it. The basement stair now cuts a real hole through the     */
  /* podium, and a lawn slab spanning the whole property would be        */
  /* visible through that hole from below -- you would stand in the      */
  /* armory looking up at the underside of the front garden. The four    */
  /* segments meet the podium's own sides flush, so nothing gaps.        */
  /* ---------------------------------------------------------------- */
  const bayOuterX = LOUNGE_BAY.x1 + WALL_T;
  for (const [groundIndex, [gx0, gx1, gz0, gz1]] of [
    /* The annex podiums are real raised volumes. The old two broad lawn
     * strips continued underneath both, invisible but raycastable, so an
     * attacker inside the billiard/trophy rooms could still claim lawn y=0
     * as support. Split the lawn around their exact footprints. */
    [-35, WEST_WING.x0, -5, 95],
    [WEST_WING.x0, BUILDING.x0, -5, WEST_WING.z0],
    [WEST_WING.x0, BUILDING.x0, WEST_WING.z1, 95],
    [bayOuterX, 35, -5, 95],
    [BUILDING.x1, bayOuterX, -5, LOUNGE_BAY.z0 - WALL_T],
    [BUILDING.x1, bayOuterX, LOUNGE_BAY.z1 + WALL_T, 95],
    [BUILDING.x0, BUILDING.x1, -5, BUILDING.z0],
    [BUILDING.x0, BUILDING.x1, BUILDING.z1, 95],
    /* The rear garden's own ground. The property used to stop at the pool's
     * north coping; the formal garden behind it (see buildRearGarden) runs to
     * z=126 inside a brick estate wall, so the lawn has to reach it. */
    [-35, 35, 95, GARDEN.z1 + 4],
  ].entries()) {
    root.add(siegeWalkable(box({
      size: [gx1 - gx0, 0.06, gz1 - gz0],
      pos: [(gx0 + gx1) / 2, -0.03, (gz0 + gz1) / 2],
      mat: M_GRASS,
    }), `estate-ground-${groundIndex}`));
  }

  /* ---------------------------------------------------------------- */
  /* Street gate: pillars + emblems + open wrought-iron leaves           */
  /* ---------------------------------------------------------------- */
  const PILLAR_H = 3.6;
  const gateMedallions = [];
  function gatePillar(x, side) {
    const assemblyId = `mansion-front-gate-pillar-${side}`;
    root.add(geometryIntent(box({
      size: [1.0, PILLAR_H, 1.0], pos: [x, PILLAR_H / 2, 0], mat: M_PILLAR,
      name: `mansion-front-gate-pillar-${side}-body`,
    }), { assemblyId }));
    root.add(geometryIntent(box({
      size: [1.2, 0.15, 1.2], pos: [x, PILLAR_H + 0.08, 0], mat: M_GOLD,
      name: `mansion-front-gate-pillar-${side}-cap`,
    }), { assemblyId }));
    // Medallion backing disc (bezel) -- this used to be the entire emblem
    // (a flat chrome disc plus 3 tiny chrome boxes), which blended into one
    // dark blob at any real viewing distance. It is now just the bezel:
    // see gateMedallionTexture() for the actual drawn artwork in front of it.
    root.add(geometryIntent(cylinder({
      r: 0.55, h: 0.08, pos: [x, 2.5, -0.55], mat: M_CHROME, rotX: Math.PI / 2,
      name: `mansion-front-gate-pillar-${side}-crest-bezel`,
    }), { assemblyId }));
    const medallion = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 40),
      mat({
        map: gateMedallionTexture(), roughness: 0.45, metalness: 0.2, unique: true,
      }),
    );
    medallion.position.set(x, 2.5, -0.62);
    medallion.rotation.y = Math.PI; // face -Z, toward the street/spawn side
    medallion.name = 'mansion-gate-squatch-crest';
    medallion.userData.art = {
      slot: MANSION_GATE_ART_SLOT,
      real: false,
      file: null,
    };
    geometryIntent(medallion, { assemblyId });
    root.add(medallion);
    gateMedallions.push(medallion);
    // A tight little spotlight square on the medallion -- without it the
    // artwork itself still vanishes into the pillar's own shadow at night.
    const medallionLight = new THREE.SpotLight(0xfff6e0, 7, 5, 0.42, 0.5, 1.4);
    medallionLight.position.set(x, 3.15, -1.55);
    medallionLight.target.position.set(x, 2.5, -0.62);
    root.add(medallionLight, medallionLight.target);
    const pillarCollider = solid(x - 0.5, x + 0.5, 0, PILLAR_H, -0.5, 0.5);
    pillarCollider.name = `mansion-front-gate-pillar-${side}-collider`;
    geometryIntent(pillarCollider, { assemblyId });
  }
  gatePillar(-4, 'west');
  gatePillar(4, 'east');

  /* The canvas footprint remains a fail-safe only. Both faces resolve one
   * approved art slot to the exact crest already used throughout the house,
   * and keep the circular medallion geometry rather than stretching the
   * square source into a new sign. The promise is published so the browser
   * verifier can prove the real file landed on both pillars. */
  const gateArtReady = resolveGear([MANSION_GATE_ART_SLOT]).then((gear) => {
    const supplied = gear.get(MANSION_GATE_ART_SLOT);
    if (!supplied?.real) return [];
    for (const medallion of gateMedallions) {
      medallion.material.map = supplied.texture;
      medallion.material.needsUpdate = true;
      medallion.userData.art = {
        slot: MANSION_GATE_ART_SLOT,
        real: true,
        file: supplied.file,
      };
    }
    return gateMedallions.map(() => MANSION_GATE_ART_SLOT);
  }).catch(() => []);

  // Wrought-iron leaves, swung open and folded back against the fence line --
  // no open/close mechanic this pass, so they are simply modelled open.
  function gateLeaf(hingeX, side) {
    const leafW = 2.0;
    const leafH = 2.2;
    const leafSide = side < 0 ? 'west' : 'east';
    const assemblyId = `mansion-front-gate-leaf-${leafSide}`;
    const g = group('gate-leaf',
      box({ size: [0.08, leafH, 0.08], pos: [0, leafH / 2, 0], mat: M_FENCE }),
      box({ size: [leafW, 0.07, 0.07], pos: [side * leafW / 2, leafH - 0.12, 0], mat: M_FENCE }),
      box({ size: [leafW, 0.07, 0.07], pos: [side * leafW / 2, leafH * 0.5, 0], mat: M_FENCE }),
      box({ size: [leafW, 0.07, 0.07], pos: [side * leafW / 2, 0.12, 0], mat: M_FENCE }));
    for (let i = 1; i <= 3; i++) {
      g.add(box({
        size: [0.04, leafH - 0.24, 0.04], pos: [side * leafW * (i / 4), leafH / 2, 0], mat: M_FENCE,
      }));
    }
    // Wrought-iron scrollwork: a half-torus arch crest above the top rail
    // (its own two "legs" land close to the hinge post and a picket further
    // out, matching a real gate's arched top rail) plus two curled finials
    // where the arch meets the leaf.
    const archR = 0.5;
    const archCX = side * leafW * 0.5;
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(archR, 0.03, 8, 24, Math.PI),
      M_FENCE,
    );
    arch.position.set(archCX, leafH - 0.12, 0);
    g.add(arch);
    for (const vx of [archCX - archR, archCX + archR]) {
      const finial = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 14), M_FENCE);
      finial.position.set(vx, leafH - 0.1, 0);
      finial.rotation.z = 0.6;
      g.add(finial);
    }
    // Central latch/lock detail at the leaf's free (non-hinge) tip -- the
    // edge that would meet the other leaf if the gate were closed, so it
    // still reads as lockable hardware even though it's modelled open.
    const latchX = side * (leafW - 0.08);
    g.add(box({ size: [0.1, 0.24, 0.08], pos: [latchX, leafH * 0.42, 0], mat: M_FENCE }));
    g.add(cylinder({
      r: 0.035, h: 0.05, pos: [latchX, leafH * 0.42, 0.055], rotX: Math.PI / 2, mat: M_CHROME,
    }));
    g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.position.set(hingeX, 0, 0);
    g.name = `mansion-front-gate-leaf-${leafSide}`;
    geometryIntent(g, { assemblyId });
    root.add(g);
  }
  gateLeaf(-4, -1);
  gateLeaf(4, 1);

  // Hinge barrels where each leaf actually meets its pillar -- the leaf's
  // own vertical post sits dead centre inside the 1m pillar volume (hidden
  // in solid stone), so without these the visible bars just start floating
  // in mid-air 0.5m out with no visible mount. Both leaves' bars run along
  // world -Z at their hinge's fixed X (see gateLeaf's rotation math), so the
  // pillar face they actually emerge from is each pillar's street-side
  // (z=-0.5) face.
  for (const hingeX of [-4, 4]) {
    const leafSide = hingeX < 0 ? 'west' : 'east';
    const assemblyId = `mansion-front-gate-leaf-${leafSide}`;
    for (const hy of [0.45, 1.85]) {
      root.add(geometryIntent(cylinder({
        r: 0.07, h: 0.22, pos: [hingeX, hy, -0.5], mat: M_CHROME,
        name: `mansion-front-gate-leaf-${leafSide}-hinge-barrel`,
      }), { assemblyId }));
    }
  }

  const gateLightL = new THREE.PointLight(0xffcf9e, 6, 14, 2);
  gateLightL.position.set(-4, PILLAR_H + 0.3, 0);
  root.add(gateLightL);
  const gateLightR = new THREE.PointLight(0xffcf9e, 6, 14, 2);
  gateLightR.position.set(4, PILLAR_H + 0.3, 0);
  root.add(gateLightR);

  /* ---------------------------------------------------------------- */
  /* Perimeter fence -- Motel fence-line technique: post row + one long  */
  /* collider per straight run. Street run breaks for the gate opening.  */
  /*                                                                      */
  /* INSTANCED, 2026-08-06. Measured before touching it: four runs round a  */
  /* 30x90 m property, a post every 3 m, produced 80 posts, 80 cone caps     */
  /* and about 180 rails -- 340 draw calls for a fence, which is the kind    */
  /* of "genuinely repeated" the doctrine in docs/WEB-PERFORMANCE-AND-       */
  /* PWA.md means. Posts and caps are the same size everywhere (only x/z     */
  /* move), so they collect placements and get a fixed-size InstancedMesh    */
  /* each. Rails are not the same size -- each span is however far its two   */
  /* posts are apart, and a run along x lies flat the other way round from   */
  /* a run along z -- so they collect a per-instance SCALE too and go on a    */
  /* single unit-box InstancedMesh, the same "build once at 1x1x1, carry      */
  /* real size on the transform" trick `box()` itself already uses (see       */
  /* src/world/build.js). Collision is untouched: `solid()` below still       */
  /* emits exactly one box per straight run, same as before this pass.        */
  /* ---------------------------------------------------------------- */
  const FENCE_H = 1.4;
  const FENCE_RAIL_YS = [0.35, 0.75, 1.15];
  const fencePostPlacements = [];
  const fenceRailPlacements = [];
  function fenceRun(axis, fixed, from, to) {
    let prevP = null;
    for (let p = from; p <= to + 0.01; p += 3) {
      const x = axis === 'x' ? p : fixed;
      const z = axis === 'x' ? fixed : p;
      fencePostPlacements.push({ x, z });
      // Horizontal pickets/rails back to the previous post -- bare posts and
      // cone caps alone read as a property-line/construction fence; a real
      // estate perimeter fence has rails strung between the posts.
      if (prevP !== null) {
        const span = p - prevP;
        const mid = prevP + span / 2;
        for (const ry of FENCE_RAIL_YS) {
          if (axis === 'x') {
            fenceRailPlacements.push({
              x: mid, y: ry, z: fixed, sx: span - 0.12, sy: 0.05, sz: 0.05,
            });
          } else {
            fenceRailPlacements.push({
              x: fixed, y: ry, z: mid, sx: 0.05, sy: 0.05, sz: span - 0.12,
            });
          }
        }
      }
      prevP = p;
    }
    if (axis === 'x') solid(from, to, 0, FENCE_H, fixed - 0.1, fixed + 0.1);
    else solid(fixed - 0.1, fixed + 0.1, 0, FENCE_H, from, to);
  }
  fenceRun('x', 0, -30, -4);   // street, west of the gate
  fenceRun('x', 0, 4, 30);     // street, east of the gate
  fenceRun('z', -30, 0, 90);   // west boundary
  fenceRun('z', 30, 0, 90);    // east boundary

  if (fencePostPlacements.length) {
    const n = fencePostPlacements.length;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, FENCE_H, 0.12), M_FENCE, n);
    posts.name = 'fence-post';
    posts.castShadow = true;
    posts.receiveShadow = true;
    posts.userData.geometryGate = { instanceAssemblyPrefix: 'mansion-perimeter-fence-post' };
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0, 0.09, 0.18, 20), M_FENCE, n);
    caps.name = 'fence-post-cap';
    caps.castShadow = true;
    caps.receiveShadow = true;
    caps.userData.geometryGate = { instanceAssemblyPrefix: 'mansion-perimeter-fence-post' };
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = fencePostPlacements[i];
      m4.makeTranslation(p.x, FENCE_H / 2, p.z);
      posts.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, FENCE_H + 0.09, p.z);
      caps.setMatrixAt(i, m4);
    }
    posts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    root.add(posts, caps);
  }
  if (fenceRailPlacements.length) {
    const n = fenceRailPlacements.length;
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M_FENCE, n);
    rails.name = 'fence-rail';
    rails.castShadow = true;
    rails.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const identityQuat = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const r = fenceRailPlacements[i];
      m4.compose(
        new THREE.Vector3(r.x, r.y, r.z), identityQuat, new THREE.Vector3(r.sx, r.sy, r.sz),
      );
      rails.setMatrixAt(i, m4);
    }
    rails.instanceMatrix.needsUpdate = true;
    root.add(rails);
  }

  /* ---------------------------------------------------------------- */
  /* Driveway, turnaround, side spur, curbs                             */
  /* ---------------------------------------------------------------- */
  // A tiled paver texture instead of one flat solid colour with only the
  // curb strips painted on. `tileTex(1, ...)` draws a single grouted paver
  // square; `tiled()` clones it before setting `.repeat` (see this file's
  // import comment) so each surface below gets its own repeat count scaled
  // to roughly 0.5m pavers rather than inheriting one another's tiling.
  const paverBase = tileTex(1, '#5c5648', '#9a9484');
  // Memoised on the rounded repeat pair: `tiled()` clones, and a clone is a
  // separate GPU upload, so calling this once per paved surface without a
  // cache buys nothing but texture memory.
  const paverCache = new Map();
  function paverMaterial(w, l) {
    const rx = Math.max(1, Math.round(w / 0.5));
    const ry = Math.max(1, Math.round(l / 0.5));
    const key = `${rx}x${ry}`;
    let m = paverCache.get(key);
    if (!m) {
      m = mat({
        map: tiled(paverBase, rx, ry), color: 0xffffff, roughness: 0.74, unique: true,
      });
      paverCache.set(key, m);
    }
    return m;
  }

  root.add(siegeWalkable(box({
    size: [8, 0.06, 23], pos: [0, 0.02, 11.5], mat: paverMaterial(8, 23),
  }), 'driveway-pavers'));
  root.add(box({ size: [0.3, 0.1, 23], pos: [-4.15, 0.05, 11.5], mat: M_CURB }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [4.15, 0.05, 11.5], mat: M_CURB }));

  const turnaround = new THREE.Mesh(
    new THREE.CircleGeometry(COURT_RADIUS, 48), paverMaterial(COURT_RADIUS * 2, COURT_RADIUS * 2),
  );
  turnaround.rotation.x = -Math.PI / 2;
  turnaround.position.set(COURT_CENTRE.x, 0.02, COURT_CENTRE.z);
  turnaround.receiveShadow = true;
  root.add(siegeWalkable(turnaround, 'turnaround-pavers'));

  // Side spur (x:[-22,-14], z:[20,32]) plus a short connector to the turnaround
  root.add(siegeWalkable(box({
    size: [3, 0.06, 4], pos: [-12.5, 0.02, 26], mat: paverMaterial(3, 4),
  }), 'side-spur-connector'));
  root.add(siegeWalkable(box({
    size: [8, 0.06, 12], pos: [-18, 0.02, 26], mat: paverMaterial(8, 12),
  }), 'side-spur-pavers'));

  /* ---------------------------------------------------------------- */
  /* Lamp posts. Every fixture on the driveway is a working fixture. The  */
  /* old alternating pattern built eight globes but powered only three of */
  /* them, which is why the approach looked broken rather than deliberately */
  /* subdued. The motor-court pair uses the same output and throw so the   */
  /* whole arrival reads as one maintained lighting scheme.               */
  /* ---------------------------------------------------------------- */
  function lampPost(x, z, lit, intensity = 5.5) {
    const postH = 3.2;
    const assemblyId = `mansion-driveway-lamp:${x}:${z}`;
    root.add(geometryIntent(cylinder({
      r: 0.09, h: postH, pos: [x, postH / 2, z], mat: M_LAMP_POST, name: 'driveway-lamp-post',
    }), { assemblyId }));
    root.add(geometryIntent(sphere({
      r: 0.18,
      pos: [x, postH + 0.05, z],
      mat: mat({
        color: 0xffdca0, roughness: 0.4, emissive: lit ? 0xffdca0 : 0x332210, emissiveIntensity: lit ? 1.4 : 0.3,
      }),
      name: 'driveway-lamp-globe',
    }), { assemblyId }));
    if (lit) {
      const l = new THREE.PointLight(0xffc98a, intensity, 18, 2);
      l.position.set(x, postH + 0.1, z);
      root.add(l);
    }
    const lampCollider = solid(x - 0.12, x + 0.12, 0, postH, z - 0.12, z + 0.12);
    lampCollider.name = 'driveway-lamp-collider';
    geometryIntent(lampCollider, { assemblyId });
  }
  const LAMP_POSITIONS = [
    [-4.6, 4], [4.6, 4], [-4.6, 10], [4.6, 10], [-4.6, 16], [4.6, 16], [-4.6, 21], [4.6, 21],
  ];
  LAMP_POSITIONS.forEach(([x, z]) => lampPost(x, z, true, 9));

  // Dedicated lamps for the two parked-vehicle clusters: (10.3,34) lights
  // the east pair at x=9/9.5 (z=30/37.6); (-14.25,28.5) sits roughly
  // equidistant (~5m) from both the west row at x=-19 (z=24/28/32) and the
  // outlying sedan at x=-9.5,z=30. These cars' near-black paint (the family's
  // whole fleet is dark sedans/SUVs/a Lincoln) swallows light at the standard
  // 5.5-intensity recipe used for path lighting elsewhere in this file, so
  // these two run brighter -- their whole job is making the cars read, not
  // evenly lighting a walking path.
  // (10.3,34) moved out to (12.5,33): the motor court's new tangent parking
  // puts a Lincoln through the old position. (-12.5,33) is its mirror, added
  // so both halves of the court's car line are lit the same. Both then moved
  // south with the forecourt, and the third (side-lot) post was dropped
  // because the west one now stands within five metres of the side lot too.
  const CAR_LAMP_POSITIONS = [[14.0, 33 - FORECOURT_SHIFT], [-14.0, 33 - FORECOURT_SHIFT]];
  CAR_LAMP_POSITIONS.forEach(([x, z]) => lampPost(x, z, true, 9));

  /* ---------------------------------------------------------------- */
  /* Fountain -- tiered basin, silver Bigfoot statue, water, spray       */
  /* ---------------------------------------------------------------- */
  function buildFountain() {
    const { x: fx, z: fz } = FOUNTAIN_POS;
    root.add(cylinder({ r: 6, h: 0.4, pos: [fx, 0.2, fz], mat: M_MARBLE_DK }));
    root.add(cylinder({ r: 3.5, h: 1.2, pos: [fx, 0.4 + 0.6, fz], mat: M_MARBLE }));
    root.add(cylinder({ r: 4, h: 0.5, pos: [fx, 1.6 + 0.25, fz], mat: M_MARBLE_DK }));
    root.add(cylinder({ r: 1.2, h: 1.5, pos: [fx, 2.1 + 0.75, fz], mat: M_BRONZE }));

    /* THE STATUE (owner playtest 2026-08-04, verbatim):
     *
     *   "The big statue out front lets make it a silver sasquatch. Can
     *    probably use the model we have from the other game."
     *
     * So it is literally that model. `Sasquatch` in game/src/player.js is the
     * player character of Squatch Smash -- the in-world PC game on the desk in
     * the apartment -- and the first entry in its own SKINS table is called
     * "Silver Sasquatch". Nothing is re-sculpted here: the rig is built, cast
     * in metal, scaled to monument size and posed.
     *
     * Three things have to be done to it and no more:
     *
     *  1. CAST IT. The game rig is MeshLambertMaterial in six flat team
     *     colours, which under this scene's ACES tone mapping reads as grey
     *     plastic. Every mesh is repainted with the same M_SILVER /
     *     M_MARBLE_DK pair the rest of this file uses for metalwork, so it
     *     reads as a polished casting under the uplights. The bandana keeps a
     *     red enamel so the silhouette still has the mascot's shape in it.
     *  2. SCALE IT. The game model stands about 3.9 units tall with its feet
     *     at y~0.07, so 0.95 puts a 3.7 m monument on the pedestal.
     *  3. POSE IT. `buildArm` hangs each arm from a shoulder pivot, exactly so
     *     rotation.x/z swings the whole limb -- so the left arm goes up into
     *     the raised fist this fountain has always had, and the right relaxes.
     *
     * Nothing calls the rig's animation: `update()` is never invoked, so it
     * stands still, which is what a statue does.
     */
    const statueY0 = 3.6;
    const rig = new Sasquatch();
    const statue = rig.group;
    statue.name = 'silver-sasquatch-statue';
    statue.userData.geometryGate = {
      assemblyId: 'mansion-fountain-pedestal',
      checkSupport: false,
      fixedSupportAnchor: true,
    };
    statue.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.userData?.palKey === 'bandana' ? M_STATUE_PATINA : M_STATUE;
      o.castShadow = true;
    });
    // Raised fist: the shoulder pivot swings the whole arm, so the fist stays
    // rigidly on the end of it however this pose is tuned later.
    rig.armL.rotation.z = -2.55;
    rig.armL.rotation.x = 0.12;
    rig.armR.rotation.z = 0.22;
    rig.armR.rotation.x = -0.18;
    rig.legL.rotation.x = 0.06;
    rig.legR.rotation.x = -0.06;
    rig.head.rotation.x = -0.1;
    statue.scale.setScalar(0.95);
    statue.position.set(fx, statueY0, fz);
    statue.rotation.y = Math.PI; // face the gate, not the house
    root.add(statue);
    // Exact world position of the raised fist -- computed off the rig's own
    // hand mesh, not hand-derived, so the spray's anchor point (below) is
    // always correct even if the pose above is tweaked later.
    statue.updateMatrixWorld(true);
    const raisedFistWorld = rig.armL.children[rig.armL.children.length - 1]
      .getWorldPosition(new THREE.Vector3());

    const lowerWaterMat = makeWaterMaterial({ deep: 0x0b3440, shallow: 0x1f7d8c });
    const lowerWater = new THREE.Mesh(new THREE.CircleGeometry(5.7, 40), lowerWaterMat);
    lowerWater.rotation.x = -Math.PI / 2;
    lowerWater.position.set(fx, 0.44, fz);
    root.add(lowerWater);
    waterMaterials.push(lowerWaterMat);

    const upperWaterY = 2.08;
    const upperWaterMat = makeWaterMaterial({ deep: 0x0e4552, shallow: 0x2a90a6 });
    const upperWater = new THREE.Mesh(new THREE.CircleGeometry(3.85, 32), upperWaterMat);
    upperWater.rotation.x = -Math.PI / 2;
    upperWater.position.set(fx, upperWaterY, fz);
    root.add(upperWater);
    waterMaterials.push(upperWaterMat);

    // Foam/splash ring at the spray's landing radius -- a static drawn
    // texture so the spray-into-basin impact reads as "working water", not
    // just a lit bowl with a statue in it.
    const foamRing = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1.6, 48),
      mat({
        map: foamRingTexture(), transparent: true, opacity: 0.8, roughness: 0.55, side: THREE.DoubleSide, unique: true,
      }),
    );
    foamRing.rotation.x = -Math.PI / 2;
    foamRing.position.set(fx, upperWaterY + 0.015, fz);
    root.add(foamRing);

    // Spotlights, rebalanced: at intensity 20-24 from a low, close position
    // aimed at the OLD statue's mid-height (y=4.5), these blew the basin rim
    // right below them into a flat white highlight instead of ever lighting
    // the statue itself. Lower intensity, higher and further-back placement,
    // and a tighter cone let the light graze up across the new silhouette
    // (shoulders/head) instead of just flaring the tier underneath it.
    /* Re-aimed and opened up for the taller monument: the rig used to point
     * at y=5.5 and y=6.0, which was the old statue's chest. This one stands
     * 3.7 m on a 3.6 m pedestal, so the cones are aimed at its own middle and
     * widened enough to take in the raised arm. */
    const spotA = new THREE.SpotLight(0xfff3da, 17, 24, 0.6, 0.5, 1.5);
    spotA.position.set(fx + 5.5, 1.6, fz - 3.4);
    spotA.target.position.set(fx, statueY0 + 2.0, fz);
    root.add(spotA, spotA.target);
    const spotB = new THREE.SpotLight(0xdfe8ff, 14, 24, 0.6, 0.5, 1.5);
    spotB.position.set(fx - 5.5, 1.6, fz + 3.4);
    spotB.target.position.set(fx, statueY0 + 2.6, fz);
    root.add(spotB, spotB.target);
    // A third from the front, so the face is not always in its own shadow.
    const spotC = new THREE.SpotLight(0xfff0dc, 13, 24, 0.55, 0.5, 1.5);
    spotC.position.set(fx, 1.6, fz - 6.2);
    spotC.target.position.set(fx, statueY0 + 2.4, fz);
    root.add(spotC, spotC.target);

    // Anchored at the raised fist (computed above), not the statue's own
    // central axis at its base. The spray used to originate from (fx,
    // statueY0+0.3, fz) -- dead centre of the statue's own torso/legs, at a
    // height (and arc peak) that never rose above the statue's own head. From
    // any front-ish angle the whole spray rendered entirely behind or inside
    // the statue's opaque silhouette, which is the real reason it read as
    // "completely invisible" despite being correctly instantiated and ticked.
    // Spouting from the raised fist instead puts its base already clear of
    // the torso and above the head, so the column reads against open sky.
    /* Sized down for where the fist now is. The default 2.6 m rise was tuned
     * to a fist 4.4 m off the ground; this rig's is at nearly 8, and a 2.6 m
     * column from up there reads as a searchlight rather than as water. A
     * short plume off the knuckles falls back into the upper basin, which is
     * what the foam ring below is drawn for. */
    const spray = new FountainSpray(root, raisedFistWorld, {
      rise: 1.15, speedMin: 1.3, speedMax: 1.9, spread: 0.3, size: 0.2,
    });
    spray.start();

    // Collision is tiered to the actual stone. Exterior feet are at y=0,
    // not the house's GROUND_Y=1.2; omitting the r=6, y0..0.4 apron therefore
    // let both player and attackers walk through visible masonry. The earlier
    // two-box cross still projected as much as 1.38 m of invisible collision
    // into diagonal paving. These narrow, INSCRIBED x/z slices approximate the
    // round footprint from both axes: no box extends outside the real radius,
    // while the player's own 300 mm capsule closes the sub-centimetre chords.
    /* Uplights at the basin rim. The statue is a polished-silver metal, which
     * at night with no light on it is simply a black silhouette against the
     * sky -- the centrepiece of the whole approach, unreadable. Four small
     * warm lights round the pedestal pick it out the way a real one would. */
    const statueLights = [];
    for (const [ax, az] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) {
      root.add(cylinder({
        r: 0.13, h: 0.12, pos: [fx + ax, 1.72, fz + az], mat: M_MARBLE_DK,
      }));
      const l = new THREE.PointLight(0xffe2b4, 6, 12, 2);
      l.position.set(fx + ax, 2.2, fz + az);
      root.add(l);
      statueLights.push(l);
    }
    void statueLights;

    const colliderTiers = [];
    const roundTier = (name, radius, y0, y1) => {
      const slices = 48;
      const step = (radius * 2) / slices;
      const boxes = [];
      const addExact = (x0, x1, z0, z1) => {
        const box = new THREE.Box3(
          new THREE.Vector3(fx + x0, y0, fz + z0),
          new THREE.Vector3(fx + x1, y1, fz + z1),
        );
        box.name = `mansion-fountain-${name}-collider-${boxes.length}`;
        box.userData = {
          geometryGate: { assemblyId: `mansion-fountain-tier:${name}` },
        };
        colliders.push(box);
        boxes.push(box);
      };
      for (let i = 0; i < slices; i += 1) {
        const a = -radius + i * step;
        const b = a + step;
        const edge = Math.max(Math.abs(a), Math.abs(b));
        const halfChord = Math.sqrt(Math.max(0, radius * radius - edge * edge));
        if (halfChord <= 1e-6) continue;
        addExact(a, b, -halfChord, halfChord);
        addExact(-halfChord, halfChord, a, b);
      }
      const tier = Object.freeze({
        name, radius, y0, y1, slices, colliders: Object.freeze(boxes),
      });
      colliderTiers.push(tier);
      return boxes;
    };
    const fountainColliders = [
      ...roundTier('lower-apron', 6, 0, 0.4),
      ...roundTier('lower-basin', 3.5, 0.4, 1.6),
      ...roundTier('upper-basin', 4, 1.6, 2.1),
    ];
    const fountainColliderPedestal = solid(
      fx - 1.3, fx + 1.3, 2.1, 7.4, fz - 1.3, fz + 1.3,
    );
    fountainColliderPedestal.name = 'mansion-fountain-pedestal-collider';
    fountainColliderPedestal.userData = {
      geometryGate: { assemblyId: 'mansion-fountain-pedestal' },
    };
    fountainColliders.push(fountainColliderPedestal);

    return {
      statue,
      lowerWater,
      upperWater,
      spray,
      colliders: fountainColliders,
      colliderTiers,
      position: new THREE.Vector3(fx, 0, fz),
    };
  }
  const fountain = buildFountain();

  /* ---------------------------------------------------------------- */
  /* Parked family vehicles                                             */
  /*                                                                     */
  /* Owner playtest, 2026-08-03: "Car orientation and density" -- the     */
  /* cars out front are wrong. They were: three on the side lot at 4 m    */
  /* centres though a Lincoln is 5.4 m long, so all three physically      */
  /* interpenetrated; and three more scattered across the turnaround at   */
  /* hand-picked yaws of -0.4/0.3/0.35 rad, which line up with nothing --  */
  /* not the kerb, not the drive, not each other -- so they read as cars   */
  /* dropped on the lawn rather than cars somebody parked.                 */
  /*                                                                       */
  /* Both are now generated from the geometry they are parked on:          */
  /*                                                                       */
  /*   MOTOR COURT -- four cars standing on the turnaround circle, each    */
  /*   TANGENT to the kerb at its own bearing, so the whole line follows    */
  /*   the curve and everyone is pointing the same way round it (one-way,   */
  /*   anticlockwise, nose toward the way out). A car is authored long on    */
  /*   local +X (see bing/vehicles.js), so the yaw that puts its long axis   */
  /*   on the tangent at bearing t is -(pi/2 + t).                          */
  /*                                                                        */
  /*   SIDE LOT -- three cars nose-in to the west edge of the spur on real  */
  /*   3.4 m bay centres (a 2.05 m SUV therefore keeps 1.35 m of door        */
  /*   clearance), with the bay lines painted under them.                    */
  /*                                                                        */
  /* Every spot is checked for overlap by tools/verify-mansion.mjs, against */
  /* the other cars and against the fountain, the steps and the building --  */
  /* which is the check that would have caught the old arrangement.         */
  /* ---------------------------------------------------------------- */
  /**
   * A car standing tangent to the turnaround kerb at bearing `deg`, `r` out
   * from the fountain.
   *
   * The bearings and radii below are not decorative. They keep the cars OUT
   * of the two things a walker needs: the corridor either side of the
   * fountain basin (which is the only way from the drive to the front door,
   * since the basin blocks the centreline), and the run of turnaround in
   * front of the steps. The pair nearest the drive sit further out at 11.5 m
   * so that corridor stays about 1.6 m wide rather than a squeeze.
   *
   * The cars moved out with the first COURT_RADIUS widening (12 -> 14.2).
   * The current 15.2 m court adds a metre of paved outer shoulder without
   * pushing the parked pair back into either walking corridor.
   */
  function courtSpot(id, deg, r, kind, color) {
    const t = THREE.MathUtils.degToRad(deg);
    return {
      id,
      x: COURT_CENTRE.x + Math.cos(t) * r,
      z: COURT_CENTRE.z + Math.sin(t) * r,
      yaw: -(Math.PI / 2 + t),
      kind,
      color,
      note: `motor court, bearing ${deg}`,
    };
  }
  const SPUR_X = -18.7; // nose 0.6 m off the spur's west edge for a 5.4 m car
  /* TWO cars in the motor court, not four, and both due west and due east of
   * the basin rather than scattered round it.
   *
   * This is the "density" half of the owner's note. The turnaround is 24 m
   * across with a 7 m fountain in the middle of it, so the only route from
   * the drive to the front door is one of the two corridors either side of
   * the basin -- and a car parked on the south-west or south-east arc narrows
   * that corridor to under two metres. Parked level with the fountain the
   * cars sit where a car actually would (nearest the door, out of the
   * turning circle) and both corridors stay about five metres wide. */
  const CAR_SPOTS = [
    /* The same grey sedan that watched the first Bada Bing visit, pulled off
     * the drive just inside Lou's gate. Its 0x2e3038 paint is the exact
     * watchers-car colour from bing/vehicles.js; no plate text is invented.
     * The composition root reads the saved ending and marks this instance as
     * recognized only when the player actually inspected that plate. */
    {
      id: 'bada-bing-grey-sedan',
      storyThread: 'bada_bing_one',
      x: -6.7,
      z: 7.0,
      kind: 'sedan',
      color: 0x2e3038,
      yaw: -Math.PI / 2,
      note: 'Bada Bing grey sedan, inside gate',
    },
    courtSpot('mansion.motor-court.west', 180, 12.4, 'lincoln', 0x101014),
    courtSpot('mansion.motor-court.east', 0, 12.4, 'suv', 0x2a2a30),
    {
      id: 'mansion.side-lot.01', x: SPUR_X, z: 22.5, kind: 'suv', color: 0x151519, yaw: Math.PI, note: 'side lot bay 1',
    },
    {
      id: 'mansion.side-lot.02', x: SPUR_X, z: 25.9, kind: 'sedan', color: 0x1a1a20, yaw: Math.PI, note: 'side lot bay 2',
    },
    {
      id: 'mansion.side-lot.03', x: SPUR_X, z: 29.3, kind: 'lincoln', color: 0x2e2e36, yaw: Math.PI, note: 'side lot bay 3',
    },
  ];
  // Painted bay lines under the side lot, so the row reads as a car park.
  const M_BAY_LINE = mat({ color: 0xb9b3a2, roughness: 0.8 });
  for (const bz of [20.8, 24.2, 27.6, 31.0]) {
    root.add(box({
      size: [5.6, 0.02, 0.12], pos: [SPUR_X, 0.06, bz], mat: M_BAY_LINE, cast: false,
    }));
  }
  const vehicles = CAR_SPOTS.map((spot) => {
    const car = makeCar(spot.kind, spot.color, { spatialId: spot.id });
    if (spot.id) car.group.name = spot.id;
    if (spot.storyThread) car.group.userData.storyThread = spot.storyThread;
    car.group.position.set(spot.x, 0, spot.z);
    car.group.rotation.y = spot.yaw;
    root.add(car.group);
    const worldCollider = makeVehicleCollider(car);
    colliders.push(worldCollider);
    return {
      ...car,
      id: spot.id ?? null,
      storyThread: spot.storyThread ?? null,
      kind: spot.kind,
      x: spot.x,
      z: spot.z,
      yaw: spot.yaw,
      note: spot.note,
      worldCollider,
    };
  });
  const greySedan = vehicles.find((vehicle) => vehicle.id === 'bada-bing-grey-sedan');
  Object.assign(greySedan, {
    recognized: false,
    sourceEnding: null,
    setCampaignEnding(ending = null) {
      this.sourceEnding = typeof ending === 'string' ? ending : null;
      this.recognized = ending === 'plate';
      this.group.userData.recognized = this.recognized;
      this.group.userData.recognitionSource = this.sourceEnding;
      return this.recognized;
    },
  });

  /* ---------------------------------------------------------------- */
  /* Security booth (~(8,0,4)): shell, chair, raised barrier arm         */
  /* ---------------------------------------------------------------- */
  function buildSecurityBooth() {
    const { x: cx, z: cz } = SECURITY_BOOTH_POS;
    const w = 2;
    const d = 2;
    const h = 2.2;
    const boothShellAssemblyId = 'mansion-security-booth-shell';
    const mountBoothShell = (object) => root.add(geometryIntent(object, {
      assemblyId: boothShellAssemblyId,
    }));
    /* Exact world blockers owned by the booth shell. The guard speaks from
     * inside this fixture, so the shared speech gate may ignore these four
     * references for him without weakening line-of-sight through any other
     * wall, pier, vehicle or floor in the grounds. */
    const speechOccluders = [];

    /* THE WEIRD YELLOW THING (owner playtest, verbatim: "the weird yellow
     * thing near the guard booth at the entrance").
     *
     * MEASURED, because two passes had already moved this arm and neither had
     * measured where it ENDED UP. The pivot stood at x = cx - 1.6 = 6.4 and
     * the arm was authored on local +X, 3.4 m long, pitched 0.28 rad. So it
     * ran from (6.40, 1.00) to (9.67, 1.94) -- EASTWARD, straight through the
     * booth, whose shell occupies x 7..9 from the ground to 2.2. A bright
     * yellow bar buried to half its length in the guard hut and sticking out
     * the far side is exactly "a weird yellow thing", and no amount of
     * re-pitching it was ever going to help: it was pointing at the booth.
     *
     * A barrier arm points ACROSS THE ROAD IT CLOSES. The drive is x -4..4;
     * the booth is 3 m east of its kerb. So the arm now swings on local -X,
     * out over the drive, and it is RAISED -- near vertical, which is what an
     * open barrier looks like and is also the one attitude that occupies no
     * part of the approach sightline at eye height. It gets its stripes and
     * its counterweight, so it reads as traffic furniture rather than as a
     * yellow stick, and its meshes are named so a check can find them.
     */

    /* The shell is four walls and a glazed upper band rather than one solid
     * block: there is a man working this booth now (see cast.js's `booth`
     * post) and a man inside a solid box is a man nobody will ever see. Same
     * footprint, same roof, same collider. */
    const sill = 1.02;
    const head = 1.98;
    const shell = group('booth-shell',
      box({ size: [0.12, sill, d], pos: [cx - w / 2 + 0.06, sill / 2, cz], mat: M_BOOTH }),
      box({ size: [0.12, sill, d], pos: [cx + w / 2 - 0.06, sill / 2, cz], mat: M_BOOTH }),
      box({ size: [w - 0.24, sill, 0.12], pos: [cx, sill / 2, cz - d / 2 + 0.06], mat: M_BOOTH }),
      box({ size: [w - 0.24, sill, 0.12], pos: [cx, sill / 2, cz + d / 2 - 0.06], mat: M_BOOTH }));
    mountBoothShell(shell);
    // Corner mullions, and a head rail the roof sits on.
    for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      mountBoothShell(box({
        size: [0.12, head - sill, 0.12],
        pos: [cx + mx * (w / 2 - 0.06), (sill + head) / 2, cz + mz * (d / 2 - 0.06)],
        mat: M_BOOTH,
        name: 'booth-mullion',
      }));
    }
    mountBoothShell(box({
      size: [w, 0.14, d], pos: [cx, head + 0.07, cz], mat: M_BOOTH, name: 'booth-head-rail',
    }));
    /* Glazing on three sides. The fourth (east, away from the drive) is the
     * doorway he came in through, and is left as an opening in the upper band
     * -- a booth with no door is a box. */
    for (const [gx, gz, sx, sz] of [
      [-(w / 2 - 0.03), 0, 0.05, d - 0.16],
      [0, -(d / 2 - 0.03), w - 0.16, 0.05],
      [0, (d / 2 - 0.03), w - 0.16, 0.05],
    ]) {
      mountBoothShell(box({
        size: [sx, head - sill - 0.06, sz],
        pos: [cx + gx, (sill + head) / 2, cz + gz],
        mat: M_BOOTH_GLASS,
        cast: false,
        name: 'booth-glass',
      }));
    }
    mountBoothShell(box({ size: [w + 0.3, 0.12, d + 0.3], pos: [cx, h + 0.06, cz], mat: M_BOOTH_ROOF }));

    // The chair he is not sitting in, and the counter he works off.
    const chair = group('booth-chair',
      box({ size: [0.55, 0.08, 0.55], pos: [0, 0.45, 0], mat: M_BOOTH }),
      box({ size: [0.55, 0.6, 0.08], pos: [0, 0.75, -0.24], mat: M_BOOTH }));
    // Back far enough to clear the guard at the counter, but still 5.5 cm
    // inside the north wall's inner face.
    chair.position.set(cx + 0.52, 0, cz + 0.55);
    root.add(chair);
    for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
      chair.add(box({
        size: [0.06, 0.41, 0.06], pos: [lx, 0.205, lz], mat: M_BOOTH,
        name: 'booth-chair-leg',
      }));
    }
    root.add(box({
      size: [0.42, 0.05, d - 0.3], pos: [cx - w / 2 + 0.23, 0.98, cz], mat: M_BOOTH_ROOF, cast: false, name: 'booth-counter',
    }));

    /* The barrier: post, counterweight, striped arm, and a rest cradle on the
     * far kerb for the arm to come down onto. Raised = open. */
    const postX = cx - 1.62;
    const postZ = cz;
    const barrierAssembly = 'mansion-security-barrier';
    const barrierPost = cylinder({
      r: 0.09, h: 1.15, pos: [postX, 0.575, postZ], mat: M_BOOTH, name: 'barrier-post',
    });
    barrierPost.userData.geometryGate = { assemblyId: barrierAssembly };
    root.add(barrierPost);
    const barrierHead = box({
      size: [0.34, 0.3, 0.3], pos: [postX, 1.2, postZ], mat: M_BOOTH_ROOF, cast: false, name: 'barrier-head',
    });
    barrierHead.userData.geometryGate = { assemblyId: barrierAssembly };
    root.add(barrierHead);
    const armPivot = new THREE.Group();
    armPivot.name = 'barrier-arm';
    armPivot.userData.geometryGate = { assemblyId: barrierAssembly };
    /* Authored on local -X so it reaches over the DRIVE. Down it would lie at
     * (6.40,1.15) -> (3.00,1.15); up it stands clear of everything. */
    const ARM = 3.4;
    armPivot.add(box({
      size: [ARM, 0.09, 0.09], pos: [-ARM / 2, 0, 0], mat: M_BARRIER_ARM, name: 'barrier-arm-boom',
    }));
    for (let i = 0; i < 4; i++) {
      armPivot.add(box({
        size: [0.42, 0.095, 0.095],
        pos: [-0.42 - i * 0.85, 0, 0],
        mat: M_BARRIER_STRIPE,
        cast: false,
        name: 'barrier-arm-stripe',
      }));
    }
    // Counterweight on the short end, which is why a real one balances.
    armPivot.add(box({
      size: [0.36, 0.26, 0.26], pos: [0.3, 0, 0], mat: M_BOOTH_ROOF, cast: false, name: 'barrier-counterweight',
    }));
    armPivot.position.set(postX, 1.2, postZ);
    /* MINUS 1.44 rad, and the sign is the whole thing. The boom is authored on
     * local -X, and a rotation about +Z takes -X DOWNWARD -- measured on the
     * built scene, the first attempt at +1.44 put the tip at y = -2.18, i.e.
     * three metres underground. Negative swings it up: the boom stands at 82
     * degrees beside the post with its tip at (5.94, 4.58), nothing crosses
     * the drive at eye height, and the nearest it comes to the booth shell is
     * a metre. */
    armPivot.rotation.z = -1.44;
    root.add(armPivot);
    /* No rest cradle is modelled, and that is a decision rather than an
     * omission: a cradle belongs at the far kerb of the lane the boom closes,
     * the drive's east kerb is at x = 4.15 and the boom's tip lowers to
     * x = 2.98 -- 1.2 m INTO the carriageway. A post standing there is a post
     * every car on this property drives through. The gate stands open all
     * night, the boom is never down, and the cradle would only ever have been
     * furniture in the road. */

    /* THE AWKWARD LIGHT (owner playtest 2026-08-04, verbatim):
     *
     *   "Theres an awkward light near the guard station that needs rotating
     *    or fixing"
     *
     * Both fixtures on this booth were wrong, and in the same way: neither
     * was mounted on anything.
     *
     *  - The interior lamp was a bare PointLight at (8, 1.7, 4) -- dead
     *    centre of a 2x2x2.2 solid box. three.js point lights do not respect
     *    occlusion, so it lit the driveway *through* the booth's own walls
     *    while lighting the booth's outward faces from behind. That is the
     *    light that reads wrong from ten metres away. It now hangs under the
     *    roof, dimmer, and is what you see through the glass.
     *  - The exterior one was a cylinder rotated onto its side (rotZ = PI/2),
     *    so a 12 cm disc stuck horizontally out of the wall with its emissive
     *    face aimed sideways down the fence line, and its PointLight floated
     *    20 cm clear of the wall in open air.
     *
     * Replaced with an actual wall lantern: a bracket off the wall, a hood
     * over it, a lamp inside the hood and the light under the hood aimed at
     * the ground it is supposed to be lighting. */
    const boothLight = new THREE.PointLight(0xbcd8ff, 1.9, 6, 2);
    boothLight.position.set(cx, h - 0.42, cz);
    root.add(boothLight);
    root.add(box({
      size: [0.5, 0.06, 0.5],
      pos: [cx, h - 0.16, cz],
      mat: mat({ color: 0x1a2029, emissive: 0x7fb8e8, emissiveIntensity: 1.1, roughness: 0.6 }),
      cast: false,
    }));

    const lanternX = cx - w / 2 - 0.02;
    root.add(box({
      size: [0.04, 0.16, 0.16], pos: [lanternX, h - 0.3, cz], mat: M_LAMP_POST,
    }));
    root.add(box({
      size: [0.34, 0.05, 0.06], pos: [lanternX - 0.17, h - 0.24, cz], mat: M_LAMP_POST, cast: false,
    }));
    root.add(box({
      size: [0.38, 0.06, 0.38], pos: [lanternX - 0.3, h - 0.27, cz], mat: M_BOOTH_ROOF, cast: false,
    }));
    root.add(box({
      size: [0.24, 0.26, 0.24],
      pos: [lanternX - 0.3, h - 0.43, cz],
      mat: mat({ color: 0x2a3038, emissive: 0xbcdcff, emissiveIntensity: 1.5, roughness: 0.45 }),
      cast: false,
    }));
    const sconceLight = new THREE.PointLight(0xbcdcff, 4.5, 13, 2);
    sconceLight.position.set(lanternX - 0.3, h - 0.62, cz);
    root.add(sconceLight);

    /* FOUR WALLS, NOT ONE BLOCK. The booth used to be a single solid box, and
     * with a man now working inside it that box is a man buried in furniture
     * -- which `verify:mansion` tests for by name. It is a hut: the walls are
     * solid and the 1.4 m of floor between them is not. Nobody can walk in
     * (every side is closed at waist height), and nobody standing at the
     * counter is inside anything. */
    const t = 0.14;
    const boothWallColliders = [
      solid(cx - w / 2, cx - w / 2 + t, 0, h, cz - d / 2, cz + d / 2),
      solid(cx + w / 2 - t, cx + w / 2, 0, h, cz - d / 2, cz + d / 2),
      solid(cx - w / 2, cx + w / 2, 0, h, cz - d / 2, cz - d / 2 + t),
      solid(cx - w / 2, cx + w / 2, 0, h, cz + d / 2 - t, cz + d / 2),
    ];
    for (const [wallIndex, wallCollider] of boothWallColliders.entries()) {
      wallCollider.name = boothShellAssemblyId + '-collider-' + wallIndex;
      geometryIntent(wallCollider, { assemblyId: boothShellAssemblyId });
    }
    speechOccluders.push(...boothWallColliders);
    solid(postX - 0.11, postX + 0.11, 0, 1.35, postZ - 0.11, postZ + 0.11);

    return {
      shell,
      chair,
      arm: armPivot,
      light: boothLight,
      position: new THREE.Vector3(cx, 0, cz),
      /* Where the man working this booth stands: inside it, at the counter,
       * facing the drive. Published rather than typed into cast.js so the
       * booth can be moved without leaving him standing in the lawn. */
      post: new THREE.Vector3(cx + 0.32, 0, cz - 0.18),
      lookAt: new THREE.Vector3(cx - 6, 0, cz - 1.2),
      speechOccluders: Object.freeze(speechOccluders),
    };
  }
  const securityBooth = buildSecurityBooth();

  /* ---------------------------------------------------------------- */
  /* Palm trees / ornamental plants                                     */
  /* ---------------------------------------------------------------- */
  function buildPalm(x, z, h, index) {
    const palm = new THREE.Group();
    palm.name = `mansion-palm-${index}`;
    palm.userData.geometryGate = { assemblyId: `mansion-palm-${index}` };
    palm.add(cylinder({
      rTop: 0.16, rBottom: 0.28, h, pos: [x, h / 2, z], mat: M_PALM_TRUNK,
      name: 'mansion-palm-trunk',
    }));
    const crown = new THREE.Group();
    crown.name = 'mansion-palm-crown';
    for (let i = 0; i < 7; i++) {
      const leaf = box({ size: [2.6, 0.08, 0.55], pos: [1.3, 0, 0], mat: M_PALM_LEAF });
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 7) * Math.PI * 2;
      pivot.rotation.z = -0.3 - (i % 3) * 0.08;
      pivot.add(leaf);
      crown.add(pivot);
    }
    crown.position.set(x, h, z);
    palm.add(crown);
    root.add(palm);
    solid(x - 0.4, x + 0.4, 0, h, z - 0.4, z + 0.4);
  }
  /* The pair at (-9,45) and (9,45) were INSIDE the house -- BUILDING is
   * x:-16..16, z:41..75, so both stood in the middle of the ground-floor
   * west and east wings with their crowns in the upper storey. Removed. The
   * pair at (+/-11,35) fouled the motor court's new tangent parking, so they
   * move out to the corners of the facade planting. */
  /* (24,12) is gone: the service road moved 6 m east to clear the billiard
   * bay and now runs straight through where it stood. Replaced by one on the
   * west lawn, which had none between the side lot and the rose bed. */
  /* TWO OF THESE WERE PLANTED THROUGH SOMETHING (2026-08-04 pass). Measured,
   * both of them, off the built boxes:
   *   (14,6)  -- trunk x[13.72,14.28] z[5.72,6.28] against the east parterre's
   *              own south hedge at x[8.60,15.00] z[6.00,6.45]: 28 cm of trunk
   *              growing up through a clipped box hedge. Moved east to 16.6,
   *              which keeps the row's z=6 line and clears the parterre (x1=15)
   *              by 1.3 m.
   *   (-21,33) -- trunk x[-21.28,-20.72] z[32.72,33.28] against the rose bed's
   *              east bench at x[-21.35,-19.65] z[32.39,32.81]: the trunk stood
   *              in the end of the bench. Moved west to -26.5, the far side of
   *              the bed, clear of both benches and 3.2 m inside the fence.
   */
  const PALM_SPOTS = [
    /* The first west palm moved out of the grey sedan's gate lay-by. */
    [-9.4, 3.2], [6, 7], [-6, 14], [6, 16], [16.6, 6],
    [-19, 38.6 - FORECOURT_SHIFT], [19, 38.6 - FORECOURT_SHIFT],
    [-24, 12], [-27, 17], [-26.5, 38 - FORECOURT_SHIFT],
  ];
  for (const [index, [x, z]] of PALM_SPOTS.entries()) {
    buildPalm(x, z, 5.5 + Math.random() * 1.4, index);
  }

  /* ---------------------------------------------------------------- */
  /* Flowers and landscaping to the front (owner playtest item 1)       */
  /*                                                                     */
  /* The approach was mown grass, pavers and palms and nothing else. This */
  /* adds the planting a house like this would actually have: clipped box */
  /* hedging outlining the beds, mass-planted colour inside them, stone    */
  /* edging, urns flanking the front steps, and foundation planting along  */
  /* the facade.                                                          */
  /*                                                                       */
  /* Everything here is grown from two small factories so the whole scheme */
  /* costs a handful of shared materials: `hedge()` (a clipped block with   */
  /* a real collider, because a 1 m box hedge is a real obstacle) and       */
  /* `bloomClump()` (a foliage mound plus a few bloom heads, no collider,   */
  /* because you can walk through a bed of pansies). Beds themselves are    */
  /* flat and un-collided, which keeps them out of the player's way and     */
  /* means none of this can become another invisible wall.                  */
  /* ---------------------------------------------------------------- */
  const M_SOIL = mat({ color: 0x2a1d14, roughness: 1 });
  const M_BED_EDGE = mat({ color: 0xbdb6a2, roughness: 0.7 });
  const M_HEDGE = mat({ color: 0x244f2c, roughness: 1 });
  const M_HEDGE_TOP = mat({ color: 0x27562f, roughness: 1 });
  const M_FOLIAGE = mat({ color: 0x37793f, roughness: 1 });
  const M_URN = mat({ color: 0xcac2ac, roughness: 0.62 });
  const BLOOM_MATS = [
    mat({ color: 0xd8324a, roughness: 0.75 }), // scarlet
    mat({ color: 0xf2e8d8, roughness: 0.75 }), // white
    mat({ color: 0xe8a91c, roughness: 0.72 }), // gold -- the family colour
    mat({ color: 0xd06bb8, roughness: 0.75 }), // pink
    mat({ color: 0x8a5fd0, roughness: 0.75 }), // lavender
  ];
  const M_BLOOM_CENTRE = mat({ color: 0xe4bd43, roughness: 0.7 });
  /* One shared five-petal silhouette. The old flower heads were plain spheres
   * dropped into foliage, which read as swollen bulbs (and, at the old upper
   * scale, as fruit). A shallow petalled head plus a visible centre remains
   * cheap while reading unmistakably as a flower from the driveway. */
  const bloomShape = new THREE.Shape();
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    const r = 0.052 + Math.cos(a * 5) * 0.018;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) bloomShape.moveTo(x, y);
    else bloomShape.lineTo(x, y);
  }
  const BLOOM_HEAD_GEOMETRY = new THREE.ShapeGeometry(bloomShape);
  const landscape = {
    beds: [], hedges: [], urns: [], clumps: 0,
    /** Physical QA data for the arrival planting only (not the rear garden). */
    flowers: [],
  };

  /** A rectangular planting bed: recessed soil inside a low stone edge. */
  function bed(x0, x1, z0, z1, y = 0, edgeMaterial = M_BED_EDGE, edgeHeight = 0.16, ownerId = null) {
    const assemblyId = ownerId ?? `mansion-planting-bed:${x0}:${x1}:${z0}:${z1}:${y}`;
    const soil = geometryIntent(box({
      size: [x1 - x0, 0.1, z1 - z0],
      pos: [(x0 + x1) / 2, y + 0.05, (z0 + z1) / 2],
      mat: M_SOIL,
      cast: false,
      name: 'mansion-planting-soil',
    }), { assemblyId });
    geometryIntent(soil, { structural: true });
    root.add(soil);
    for (const [ex0, ex1, ez0, ez1] of [
      [x0 - 0.16, x1 + 0.16, z0 - 0.16, z0],
      [x0 - 0.16, x1 + 0.16, z1, z1 + 0.16],
      [x0 - 0.16, x0, z0, z1],
      [x1, x1 + 0.16, z0, z1],
    ]) {
      root.add(geometryIntent(box({
        size: [ex1 - ex0, edgeHeight, ez1 - ez0],
        pos: [(ex0 + ex1) / 2, y + edgeHeight / 2, (ez0 + ez1) / 2],
        mat: edgeMaterial,
        cast: false,
      }), { assemblyId }));
    }
    landscape.beds.push({
      x0, x1, z0, z1,
    });
  }

  /** A clipped box hedge. Real obstacle, so it carries a real collider. */
  function hedge(x0, x1, z0, z1, h = 0.85, y = 0, assemblyId = null) {
    const owner = assemblyId ?? `mansion-hedge:${x0}:${x1}:${z0}:${z1}:${h}:${y}`;
    root.add(geometryIntent(box({
      size: [x1 - x0, h, z1 - z0], pos: [(x0 + x1) / 2, y + h / 2, (z0 + z1) / 2], mat: M_HEDGE,
    }), { assemblyId: owner }));
    // A lighter cap face: new growth catches the light, the flanks do not.
    root.add(geometryIntent(box({
      size: [(x1 - x0) - 0.06, 0.05, (z1 - z0) - 0.06],
      pos: [(x0 + x1) / 2, y + h, (z0 + z1) / 2],
      mat: M_HEDGE_TOP,
      cast: false,
    }), { assemblyId: owner }));
    geometryIntent(solid(x0, x1, y, y + h, z0, z1), { assemblyId: owner });
    landscape.hedges.push({
      x0, x1, z0, z1, h,
    });
  }

  /** One flowering plant: a compact foliage mound with complete petalled heads. */
  function bloomClump(x, z, y = 0, scale = 1, tint = null, trackFront = false) {
    const paint = tint ?? BLOOM_MATS[(Math.random() * BLOOM_MATS.length) | 0];
    const plant = group(trackFront ? 'mansion-front-flower-clump' : 'mansion-garden-flower-clump');
    plant.userData.geometryGate = { overlap: false };
    plant.position.set(x, y, z);
    plant.add(sphere({
      r: 0.26 * scale, ry: 0.13 * scale,
      pos: [0, 0.14 * scale, 0], mat: M_FOLIAGE, cast: false,
    }));
    const heads = 3;
    for (let i = 0; i < heads; i++) {
      const a = (i / heads) * Math.PI * 2 + Math.random();
      const radius = 0.05 + Math.random() * 0.11;
      const px = Math.cos(a) * radius * scale;
      const pz = Math.sin(a) * radius * scale;
      const py = (0.23 + Math.random() * 0.05) * scale;
      plant.add(cylinder({
        r: 0.01 * scale,
        h: py - 0.04 * scale,
        pos: [px, (py - 0.04 * scale) / 2, pz],
        mat: M_FOLIAGE,
        cast: false,
      }));
      const head = new THREE.Mesh(BLOOM_HEAD_GEOMETRY, paint);
      head.name = 'flower-petals';
      head.rotation.x = -Math.PI / 2;
      head.scale.setScalar(scale);
      head.position.set(px, py, pz);
      head.castShadow = false;
      plant.add(head);
      plant.add(sphere({
        r: 0.018 * scale, ry: 0.012 * scale,
        pos: [px, py + 0.008, pz], mat: M_BLOOM_CENTRE, cast: false,
        name: 'flower-centre',
      }));
    }
    root.add(plant);
    if (trackFront) {
      landscape.flowers.push({
        x, z, baseY: y, scale,
        radius: 0.26 * scale,
        height: 0.325 * scale,
      });
    }
    landscape.clumps++;
  }

  /** Fill a bed with clumps on a jittered grid, one flower colour per bed. */
  function plantBed(x0, x1, z0, z1, spacing = 1.5, y = 0) {
    const tint = BLOOM_MATS[(Math.random() * BLOOM_MATS.length) | 0];
    const nx = Math.max(1, Math.floor((x1 - x0) / spacing));
    const nz = Math.max(1, Math.floor((z1 - z0) / spacing));
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const px = x0 + ((i + 0.5) * (x1 - x0)) / nx + (Math.random() - 0.5) * 0.22;
        const pz = z0 + ((j + 0.5) * (z1 - z0)) / nz + (Math.random() - 0.5) * 0.22;
        /* Posts stand inside the planted verge, but flowers do not grow
         * through their bases. Keep a visible maintenance ring around every
         * driveway fixture. */
        if (LAMP_POSITIONS.some(([lx, lz]) => Math.hypot(px - lx, pz - lz) < 0.7)) continue;
        bloomClump(
          px, pz, y + 0.1,
          0.78 + Math.random() * 0.2,
          Math.random() < 0.78 ? tint : null,
          true,
        );
      }
    }
  }

  /** A stone urn of trailing colour, for flanking a doorway or a step. */
  function urn(x, z, y = 0) {
    const assemblyId = `mansion-garden-urn:${x}:${z}:${y}`;
    const mount = (object) => root.add(geometryIntent(object, { assemblyId }));
    mount(cylinder({
      rTop: 0.42, rBottom: 0.3, h: 0.16, pos: [x, y + 0.08, z], mat: M_URN,
    }));
    mount(cylinder({
      rTop: 0.26, rBottom: 0.34, h: 0.5, pos: [x, y + 0.41, z], mat: M_URN,
    }));
    mount(cylinder({
      rTop: 0.5, rBottom: 0.34, h: 0.44, pos: [x, y + 0.86, z], mat: M_URN,
    }));
    mount(sphere({
      r: 0.44, ry: 0.26, pos: [x, y + 1.12, z], mat: M_FOLIAGE, cast: false,
    }));
    const tint = BLOOM_MATS[(Math.random() * BLOOM_MATS.length) | 0];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 0.16 + Math.random() * 0.24;
      mount(sphere({
        r: 0.08,
        pos: [x + Math.cos(a) * r, y + 1.2 + Math.random() * 0.16, z + Math.sin(a) * r],
        mat: tint,
        cast: false,
      }));
    }
    geometryIntent(solid(x - 0.5, x + 0.5, y, y + 1.1, z - 0.5, z + 0.5), { assemblyId });
    landscape.urns.push({ x, z });
  }

  function buildLandscaping() {
    // 1. Driveway borders: a planted strip outside each kerb, running from
    // the gate to the turnaround, with the existing lamp row standing in it.
    for (const side of [-1, 1]) {
      if (side < 0) {
        /* A paved lay-by for the Bada Bing grey sedan. It is deliberately cut
         * out of the west border bed instead of letting the car sit through a
         * hedge, a palm and twenty metres of flowers. The two planted runs
         * resume on either end, so the approach still reads as one scheme. */
        root.add(box({
          size: [3.9, 0.055, 6.6],
          pos: [-6.25, 0.028, 7.0],
          mat: paverMaterial(3.9, 6.6),
          name: 'grey-sedan-gate-layby',
        }));
        bed(-6.7, -4.35, 1.5, 3.55);
        plantBed(-6.55, -4.5, 1.8, 3.3, 1.2);
        /* Flare the drive before the r=6 fountain apron.  The former hedge
         * end at z21.1 overlapped the stone's z21 edge and made a literal
         * wall across the only route from the drive into the court. */
        bed(-6.7, -4.35, 10.45, 18.9, 0, M_BED_EDGE, 0.16, 'mansion-driveway-border-west-north');
        plantBed(-6.55, -4.5, 10.7, 18.65, 1.5);
        hedge(-7.0, -6.7, 10.45, 18.9, 0.8, 0, 'mansion-driveway-border-west-north');
        continue;
      }
      bed(4.35, 6.7, 1.5, 18.9, 0, M_BED_EDGE, 0.16, 'mansion-driveway-border-east');
      plantBed(side > 0 ? 4.5 : -6.55, side > 0 ? 6.55 : -4.5, 1.8, 18.65, 1.5);
      // The hedge starts at z=6, north of the security booth and its barrier
      // arm, rather than running straight through them.
      hedge(6.7, 7.0, 6, 18.9, 0.8, 0, 'mansion-driveway-border-east');
    }

    // 2. The two front-lawn parterres either side of the drive: a box-hedge
    // outline with mass-planted colour inside it and a specimen at the centre.
    const parterres = [
      { x0: -18, x1: -8.6, z0: 6, z1: 17 },
      { x0: 8.6, x1: 15, z0: 6, z1: 17 },
    ];
    for (const [parterreIndex, p] of parterres.entries()) {
      const parterreAssemblyId = `mansion-front-parterre-${parterreIndex}`;
      hedge(p.x0, p.x1, p.z0, p.z0 + 0.45, 0.7, 0, parterreAssemblyId);
      hedge(p.x0, p.x1, p.z1 - 0.45, p.z1, 0.7, 0, parterreAssemblyId);
      hedge(p.x0, p.x0 + 0.45, p.z0, p.z1, 0.7, 0, parterreAssemblyId);
      hedge(p.x1 - 0.45, p.x1, p.z0, p.z1, 0.7, 0, parterreAssemblyId);
      bed(p.x0 + 0.45, p.x1 - 0.45, p.z0 + 0.45, p.z1 - 0.45, 0, M_BED_EDGE, 0.16, parterreAssemblyId);
      plantBed(p.x0 + 0.7, p.x1 - 0.7, p.z0 + 0.7, p.z1 - 0.7, 2.0);
      // A clipped cone standing in the middle of the parterre.
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      root.add(geometryIntent(cylinder({
        rTop: 0.04, rBottom: 0.66, h: 2.1, pos: [cx, 1.15, cz], mat: M_HEDGE,
      }), { assemblyId: parterreAssemblyId }));
      geometryIntent(solid(cx - 0.6, cx + 0.6, 0, 2.1, cz - 0.6, cz + 0.6), { assemblyId: parterreAssemblyId });
    }

    // 3. Foundation planting along the facade, either side of the front
    // steps -- the house met the lawn on a bare stucco line before this.
    const facadeZ0 = 39.2 - FORECOURT_SHIFT;
    const facadeZ1 = 40.5 - FORECOURT_SHIFT;
    for (const [fx0, fx1] of [[BUILDING.x0, -6.6], [6.6, BUILDING.x1]]) {
      bed(fx0, fx1, facadeZ0, facadeZ1);
      plantBed(fx0 + 0.3, fx1 - 0.3, facadeZ0 + 0.2, facadeZ1 - 0.2, 1.7);
      for (let sx = fx0 + 1.2; sx < fx1 - 0.8; sx += 2.4) {
        // Leave the urns flanking the step clear; the former last specimen at
        // x +/-7.6 occupied the same volume as the urn at x +/-7.1.
        if (Math.abs(Math.abs(sx) - 7.1) < 1.05) continue;
        root.add(sphere({
          r: 0.55, ry: 0.62, pos: [sx, 0.6, (facadeZ0 + facadeZ1) / 2], mat: M_HEDGE,
        }));
        solid(sx - 0.5, sx + 0.5, 0, 1.15, facadeZ0 + 0.15, facadeZ1 - 0.15);
      }
    }

    // 4. Urns flanking the bottom and the top of the front steps.
    urn(-7.1, 39.4 - FORECOURT_SHIFT);
    urn(7.1, 39.4 - FORECOURT_SHIFT);
    urn(-7.1, 36.4 - FORECOURT_SHIFT);
    urn(7.1, 36.4 - FORECOURT_SHIFT);

    // 5. Colour at the gate pillars, where every guest arrives.
    for (const gx of [-6.4, 6.4]) {
      bed(gx - 1.5, gx + 1.5, -1.4, 1.4);
      plantBed(gx - 1.3, gx + 1.3, -1.2, 1.2, 1.25);
    }

    // 6. A rose bed on the west lawn, with a bench in front of it -- the one
    // piece of the grounds that is somewhere to sit rather than somewhere to
    // park. Clear of the side lot (x:-22..-14, z:20..32).
    bed(-25, -19, 34, 40);
    plantBed(-24.7, -19.3, 34.3, 39.7, 1.7);
    for (const bx of [-23.5, -20.5]) {
      root.add(box({ size: [1.7, 0.09, 0.42], pos: [bx, 0.46, 32.6], mat: M_BED_EDGE }));
      root.add(box({
        size: [1.7, 0.5, 0.09], pos: [bx, 0.72, 32.38], mat: M_BED_EDGE, rotX: 0.12,
      }));
      for (const lx of [-0.7, 0.7]) {
        root.add(box({ size: [0.1, 0.44, 0.4], pos: [bx + lx, 0.22, 32.6], mat: M_LAMP_POST }));
      }
      solid(bx - 0.9, bx + 0.9, 0, 0.95, 32.2, 32.85);
    }

    /* 7. Planted cheeks either side of the front steps, in the ground the
     * facade left behind when it came 5 m south. Deliberately kept inside
     * x:6.4..8.4 -- the motor court's two cars stand at x=+/-11 and are 5.4 m
     * long, so anything wider than this would be planting in a parking bay,
     * which is the class of fault the car-overlap check exists to catch. */
    for (const side of [-1, 1]) {
      const px0 = side < 0 ? -8.4 : 6.4;
      const px1 = side < 0 ? -6.4 : 8.4;
      hedge(px0, px1, 32.2, 32.6, 0.55);
      bed(px0, px1, 32.8, 34.0);
      plantBed(px0 + 0.2, px1 - 0.2, 32.95, 33.85, 1.1);
    }

    return landscape;
  }
  const landscaping = buildLandscaping();

  /* ---------------------------------------------------------------- */
  /* Front staircase + entry portico (turnaround y=0 up to GROUND_Y)    */
  /* ---------------------------------------------------------------- */
  function buildFrontEntry() {
    const x0 = -6;
    const x1 = 6;
    // zBot nudged +1 m past the spec's z=38 (still inside the brief's own
    // "+/-1m" tolerance for small adjustments) so the run clears the
    // fountain's collision body (see buildFountain(): tiered, widest
    // remaining tier r=3.6 around z=35, i.e. blocked up to z=38.6) with a
    // small margin instead of starting from inside it -- an earlier pass had
    // this starting at z=35 (the fountain's own centre), which put the
    // entire staircase inside the fountain's old collider and made the front
    // door unreachable on foot from any angle.
    const zBot = 39 - FORECOURT_SHIFT;
    const zTop = 40.5 - FORECOURT_SHIFT;
    const steps = 6;
    const stepDepth = (zTop - zBot) / steps + 0.06;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const z = THREE.MathUtils.lerp(zBot, zTop, t);
      const y = THREE.MathUtils.lerp(0, GROUND_Y, t);
      root.add(siegeWalkable(box({
        size: [x1 - x0, 0.16, stepDepth], pos: [0, y + 0.08, z], mat: M_MARBLE,
        name: `front-entry-tread-${i}`,
      })));
    }
    solid(x0 - 0.3, x0, 0, GROUND_Y + 0.2, zBot, zTop);
    solid(x1, x1 + 0.3, 0, GROUND_Y + 0.2, zBot, zTop);

    // Portico landing -- runs from the top of the stairs to the front door
    // (a short 0.5 m landing), matching the spec's implied door approach.
    /* The last tread's 310 mm box ends at z=35.405. Starting the landing at
     * plain zTop=35.500 left a 95 mm strip where the route dropped through to
     * turnaround paving. Lap the two pieces by 5 mm; the 40 mm rise from the
     * final tread to the landing remains a readable final step. */
    const porticoZ0 = zTop - 0.1;
    const porticoZ1 = BUILDING.z0;
    root.add(siegeWalkable(box({
      size: [x1 - x0, 0.2, porticoZ1 - porticoZ0],
      pos: [0, GROUND_Y - 0.1, (porticoZ0 + porticoZ1) / 2],
      mat: M_MARBLE,
      name: 'front-entry-portico',
    })));

    // Side parapets: railing + base skirt, hiding the crawlspace under the
    // landing and stopping anyone from stepping off its elevated sides.
    for (const sx of [x0, x1]) {
      const rimX = sx + (sx < 0 ? -0.12 : 0.12);
      root.add(box({
        size: [0.25, GROUND_Y + 0.9, porticoZ1 - porticoZ0],
        pos: [rimX, (GROUND_Y + 0.9) / 2, (porticoZ0 + porticoZ1) / 2],
        mat: M_MARBLE_DK,
      }));
      solid(sx - 0.25, sx + 0.25, 0, GROUND_Y + 0.9, porticoZ0, porticoZ1);
    }

    // Stair railings, Motel lerp-stepped technique.
    for (const sx of [x0, x1]) {
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        root.add(box({
          size: [0.06, 0.9, 0.06],
          pos: [sx, THREE.MathUtils.lerp(0, GROUND_Y, t) + 0.5, THREE.MathUtils.lerp(zBot, zTop, t)],
          mat: M_CHROME,
        }));
      }
    }
    const stepRect = { x0, x1, z0: zBot, z1: zTop };
    const portico = { x0, x1, z0: porticoZ0, z1: porticoZ1 };
    /** Exact top of the rendered boxes.  The entry is six overlapping level
     * treads, not a smooth ramp; both Mansion runtimes consume this same
     * resolver so the camera and the marble cannot disagree. */
    const groundAt = (x, z) => {
      if (x < x0 || x > x1) return null;
      if (z >= portico.z0 && z <= portico.z1) return GROUND_Y;
      for (let i = steps - 1; i >= 0; i -= 1) {
        const centre = THREE.MathUtils.lerp(zBot, zTop, i / steps);
        if (z < centre - stepDepth / 2 || z > centre + stepDepth / 2) continue;
        return THREE.MathUtils.lerp(0, GROUND_Y, i / steps) + 0.16;
      }
      return null;
    };
    return { steps: stepRect, portico, groundAt };
  }
  const frontEntry = buildFrontEntry();

  /* ---------------------------------------------------------------- */
  /* Service road + rear-door ramp                                      */
  /* ---------------------------------------------------------------- */
  /* The service road used to run x:16..22 -- straight through where the
   * billiard bay now stands (x:16..19.4, z:40..55). It moves 4 m east, and
   * the rear-door ramp lengthens west to meet it, so the route from the road
   * to the kitchen door is still one continuous climb. */
  /* THE KITCHEN STEPS (owner playtest 2026-08-04, verbatim):
   *
   *   "Stairs going in and out of the kitchen are a bit fucked and intersect
   *    with the golf green."
   *
   * Three separate faults, all measured off the built geometry before
   * anything moved:
   *
   *  1. THE RUN DID NOT REACH THE DOOR. It started at x=17, and the kitchen's
   *     service door is in the east wall at x=16..16.4 -- so there were 60 cm
   *     of nothing between the doorway and the first tread. `exteriorGroundAt`
   *     resolves the walking height from this ramp's own rect, so that strip
   *     was not merely a visual gap: it read as grade, 1.2 m under the
   *     threshold you had just stepped over.
   *  2. THE FLIGHT STOPPED SHORT AND STOOD PROUD. The last tread's top was
   *     y=1.14 and it finished at z=65.78, leaving 22 cm of open air before
   *     the threshold at 1.2; and every tread was built 7 cm ABOVE the ramp
   *     line it approximates, so you waded up the flight through your own
   *     steps. The treads now sit ON that line and the run finishes with a
   *     nosing flush with the kitchen floor.
   *  3. THE KERB FLOATED. It was one 16 cm bar held at a CONSTANT y=0.6 for
   *     the whole 3 m run -- measured y[0.52,0.68] over a ramp climbing 0 to
   *     1.2 -- so it was buried under the bottom of the flight and hanging in
   *     mid-air over the top of it. It is now laid per tread and rakes with
   *     the steps, which is what a kerb on a flight does.
   *
   * The green is dealt with where the green is built -- see the putting green
   * in buildRearGarden, which was laid straight across the service road AND
   * across the ground outside this very door.
   */
  function buildServiceRoad() {
    root.add(siegeWalkable(box({
      size: [28 - 22, 0.06, 70], pos: [25, 0.02, 35], mat: M_ASPHALT,
    }), 'east-service-road'));
    const wallFace = BUILDING.x1 + WALL_T; // 16.4, outside face of the east wall
    const threshold = Object.freeze({
      x0: BUILDING.x1,
      x1: wallFace,
      z0: REAR_DOOR.z0,
      z1: REAR_DOOR.z1,
      y: GROUND_Y,
    });
    /* The wall opening is 40 cm deep. The kitchen podium owns coordinates
     * only through its inside face (x=16), while the exterior landing starts
     * at the outside face (x=16.4). Give that wall band its own real slab and
     * public walking contract so the service door cannot briefly resolve as
     * street grade while the player crosses it. */
    root.add(box({
      size: [threshold.x1 - threshold.x0, 0.18, threshold.z1 - threshold.z0],
      pos: [
        (threshold.x0 + threshold.x1) / 2,
        threshold.y - 0.09,
        (threshold.z0 + threshold.z1) / 2,
      ],
      mat: M_ASPHALT,
      name: 'service-door-threshold',
    }));
    const landing = Object.freeze({
      x0: wallFace,
      x1: 18.0,
      z0: REAR_DOOR.z0,
      z1: REAR_DOOR.z1,
      y: GROUND_Y,
    });
    /* A real top landing, flush to the whole service opening. The old flight
     * climbed north along z even though this doorway faces east, so its broad
     * side touched the wall and the player had to turn off the top tread to
     * find the door. */
    root.add(box({
      size: [landing.x1 - landing.x0, 0.18, landing.z1 - landing.z0],
      pos: [
        (landing.x0 + landing.x1) / 2,
        landing.y - 0.09,
        (landing.z0 + landing.z1) / 2,
      ],
      mat: M_ASPHALT,
      name: 'service-landing-platform',
    }));

    /* Two masonry posts and an under-beam make the raised platform visibly
     * load-bearing instead of a slab suspended 1.02 m above the ground. */
    const supportTop = landing.y - 0.18;
    const landingSupportAssemblyId = 'mansion-service-landing-support-frame';
    const supports = [];
    for (const z of [landing.z0 + 0.3, landing.z1 - 0.3]) {
      const post = box({
        size: [0.24, supportTop, 0.24],
        pos: [landing.x1 - 0.28, supportTop / 2, z],
        mat: M_MARBLE_DK,
        name: 'service-landing-support',
      });
      root.add(geometryIntent(post, { assemblyId: landingSupportAssemblyId }));
      supports.push(post);
      const supportCollider = solid(
        landing.x1 - 0.4, landing.x1 - 0.16,
        0, supportTop,
        z - 0.12, z + 0.12,
      );
      supportCollider.name = landingSupportAssemblyId + '-post-collider-' + supports.length;
      geometryIntent(supportCollider, { assemblyId: landingSupportAssemblyId });
    }
    const underBeam = box({
      size: [0.24, 0.22, landing.z1 - landing.z0 - 0.24],
      pos: [landing.x1 - 0.28, supportTop - 0.11, (landing.z0 + landing.z1) / 2],
      mat: M_MARBLE_DK,
      name: 'service-landing-underbeam',
    });
    root.add(geometryIntent(underBeam, { assemblyId: landingSupportAssemblyId }));

    /* The flight now runs perpendicular to the east-wall doorway: road at
     * x=22, stair head at x=18, then the landing and kitchen threshold. Each
     * tread is a grounded block, so neither it nor its riser can float. */
    const ramp = {
      x0: landing.x1,
      x1: 22,
      z0: REAR_DOOR.z0 + 0.18,
      z1: REAR_DOOR.z1 - 0.18,
      axis: 'x',
      highAt: 'min',
      surfaces: [],
    };
    const steps = 6;
    const run = (ramp.x1 - ramp.x0) / steps;
    for (let i = 0; i < steps; i++) {
      const x1 = ramp.x1 - i * run;
      const x0 = x1 - run;
      const top = ((i + 1) / steps) * GROUND_Y;
      const name = `service-ramp-tread-${i}`;
      root.add(box({
        size: [x1 - x0, top, ramp.z1 - ramp.z0],
        pos: [(x0 + x1) / 2, top / 2, (ramp.z0 + ramp.z1) / 2],
        mat: M_ASPHALT,
        name,
      }));
      ramp.surfaces.push(Object.freeze({
        name, x0, x1, z0: ramp.z0, z1: ramp.z1, y: top,
      }));
    }
    ramp.surfaces = Object.freeze(ramp.surfaces);
    Object.freeze(ramp);
    const groundAt = (x, z) => {
      if (x >= threshold.x0 && x <= threshold.x1 && z >= threshold.z0 && z <= threshold.z1) {
        return threshold.y;
      }
      if (x >= landing.x0 && x <= landing.x1 && z >= landing.z0 && z <= landing.z1) {
        return landing.y;
      }
      let y = null;
      for (const surface of ramp.surfaces) {
        if (x < surface.x0 || x > surface.x1 || z < surface.z0 || z > surface.z1) continue;
        y = Math.max(y ?? -Infinity, surface.y);
      }
      return y;
    };
    return {
      road: { x0: 22, x1: 28, z0: 0, z1: 70 },
      ramp,
      threshold,
      landing,
      supports,
      underBeam,
      groundAt,
    };
  }
  const serviceRoad = buildServiceRoad();

  /* ---------------------------------------------------------------- */
  /* Building shell: exterior walls, roofline, floor/roof slabs,        */
  /* door + window openings.                                            */
  /* ---------------------------------------------------------------- */
  /** Upper-floor window band -- bedrooms, bathrooms, Lou's office. */
  const UPPER_SILL = UPPER_Y + 0.9; // 6.9
  const UPPER_HEAD = UPPER_Y + 3.0; // 9.0
  /** The foyer's entrance glazing is two storeys tall, because the foyer is. */
  const FOYER_GLASS_TOP = 8.6;
  /** Kitchen door onto the pool deck (the deck's south edge IS the north wall). */
  const POOL_DOOR = Object.freeze({
    x0: 9.6, x1: 12.0, y0: GROUND_Y, y1: GROUND_Y + 2.4,
  });
  /** Head height of the three arches from the lounge into the billiard bay. */
  const BAY_ARCH_TOP = GROUND_Y + 3.4;
  /** ...and of the arcade from the living room into the west wing. */
  const WING_ARCH_TOP = GROUND_Y + 3.6;
  const TROPHY_ENTRANCE = Object.freeze({
    x0: BUILDING.x0 - WALL_T,
    x1: BUILDING.x0,
    arches: Object.freeze([
      Object.freeze({ id: 'livingToTrophySouth', z0: 41.40, z1: 42.90 }),
      Object.freeze({ id: 'livingToTrophyMid', z0: 43.09, z1: 44.71 }),
      Object.freeze({ id: 'livingToTrophyNorth', z0: 44.90, z1: 46.40 }),
    ]),
  });

  function buildShell() {
    const zS0 = BUILDING.z0 - WALL_T;
    const zS1 = BUILDING.z0; // south wall band
    const zN0 = BUILDING.z1;
    const zN1 = BUILDING.z1 + WALL_T; // north wall band
    const xW0 = BUILDING.x0 - WALL_T;
    const xW1 = BUILDING.x0; // west wall band
    const xE0 = BUILDING.x1;
    const xE1 = BUILDING.x1 + WALL_T; // east wall band

    const windows = [];
    const siegeBreachEntries = [];

    /**
     * A pane that attackers are scripted to breach must have a real approach,
     * not a route which borrows the lawn hidden under a raised podium.  These
     * are discrete masonry treads: each rise is below the support resolver's
     * 205 mm step budget, the top tread meets the structural podium, and a
     * 20 mm threshold carries the route through the wall band onto the real
     * interior finish.  Low cheek curbs are colliders; the walking surfaces
     * deliberately are not, for the same reason as the front entry (floors
     * are resolved vertically and must not eject a player sideways).
     */
    function buildSiegeBreachEntry({
      id, direction, outerEdge, thresholdInner, z0, z1, exteriorY,
    }) {
      const count = 7;
      const assemblyId = `mansion-siege-breach-entry-${id}`;
      /* Reach full podium height before a standing rig's leading shoulder
       * enters the podium face.  A longer 400 mm tread left the feet on the
       * penultimate rise while the visible body already occupied the plinth. */
      const run = 0.32;
      const topY = GROUND_Y;
      const curb = 0.1;
      const surfaces = [];
      for (let i = 0; i < count; i++) {
        const a = outerEdge + direction * run * i;
        const b = outerEdge + direction * run * (i + 1);
        const x0 = Math.min(a, b);
        const x1 = Math.max(a, b);
        const y = THREE.MathUtils.lerp(exteriorY, topY, (i + 1) / count);
        const name = `siege-breach-${id}-tread-${i}`;
        root.add(siegeWalkable(geometryIntent(box({
          size: [x1 - x0, y - exteriorY, z1 - z0],
          pos: [(x0 + x1) / 2, exteriorY + (y - exteriorY) / 2, (z0 + z1) / 2],
          mat: M_MARBLE,
          name,
        }), { assemblyId })));
        surfaces.push(Object.freeze({ name, x0, x1, z0, z1, y }));
        for (const [cz0, cz1] of [[z0 - curb, z0], [z1, z1 + curb]]) {
          const curbTop = y + 0.14;
          root.add(geometryIntent(box({
            size: [x1 - x0, curbTop - exteriorY, cz1 - cz0],
            pos: [(x0 + x1) / 2, exteriorY + (curbTop - exteriorY) / 2, (cz0 + cz1) / 2],
            mat: M_MARBLE_DK,
            name: `siege-breach-${id}-curb-${i}`,
          }), { assemblyId }));
          const curbCollider = solid(x0, x1, exteriorY, curbTop, cz0, cz1);
          curbCollider.name = `siege-breach-${id}-curb-${i}-${cz0 === z0 - curb ? 'south' : 'north'}-collider`;
          geometryIntent(curbCollider, { assemblyId });
        }
      }

      const thresholdOuter = outerEdge + direction * run * count;
      const tx0 = Math.min(thresholdOuter - direction * 0.05, thresholdInner);
      const tx1 = Math.max(thresholdOuter - direction * 0.05, thresholdInner);
      const thresholdY = GROUND_Y + 0.02;
      const thresholdName = `siege-breach-${id}-threshold`;
      root.add(siegeWalkable(geometryIntent(box({
        size: [tx1 - tx0, 0.02, z1 - z0],
        pos: [(tx0 + tx1) / 2, GROUND_Y + 0.01, (z0 + z1) / 2],
        mat: M_MARBLE,
        name: thresholdName,
      }), { assemblyId })));
      surfaces.push(Object.freeze({
        name: thresholdName, x0: tx0, x1: tx1, z0, z1, y: thresholdY,
      }));
      const entry = Object.freeze({
        id,
        opening: id === 'east' ? 'bayEastSouth' : 'trophyWestSouth',
        surfaces: Object.freeze(surfaces),
        groundAt(x, z) {
          let y = null;
          for (const surface of surfaces) {
            if (x < surface.x0 || x > surface.x1 || z < surface.z0 || z > surface.z1) continue;
            y = Math.max(y ?? -Infinity, surface.y);
          }
          return y;
        },
      });
      siegeBreachEntries.push(entry);
      return entry;
    }

    /**
     * One exterior wall plane, built as the COMPLEMENT of its openings.
     *
     * The previous shell hand-authored every pier and lintel box, which is
     * why the south wall's piers still described a four-room ground floor
     * after the rooms behind them moved. This takes the wall's full extent
     * plus a list of openings and emits the solid segments between them, so
     * the wall can never disagree with its own windows and doors: cut the
     * plane at every opening edge, then within each resulting column fill the
     * vertical gaps that no opening claims.
     *
     * `axis` is the plane's normal: 'z' for the south/north walls (so the
     * along-wall coordinate `u` is x), 'x' for the east/west walls (u is z).
     * Openings with `glass` get a pane inset into the reveal (and a collider,
     * because a window is not a doorway); openings without it are true
     * openings you walk through.
     */
    function panelWall({
      axis, lo, hi, u0, u1, y0, y1, tag, openings = [],
    }) {
      const assemblyId = [
        'mansion-exterior-wall', tag, axis, lo, hi, u0, u1, y0, y1,
      ].join(':');
      let segmentIndex = 0;
      const seg = (ua, ub, ya, yb, name, material, inset = 0) => {
        if (ub - ua < 1e-4 || yb - ya < 1e-4) return;
        const index = segmentIndex;
        segmentIndex += 1;
        if (axis === 'z') {
          ext(ua, ub, ya, yb, lo + inset, hi - inset, name, material, true, assemblyId, index);
        } else {
          ext(lo + inset, hi - inset, ya, yb, ua, ub, name, material, true, assemblyId, index);
        }
      };
      const cuts = new Set([u0, u1]);
      for (const o of openings) {
        cuts.add(THREE.MathUtils.clamp(o.u0, u0, u1));
        cuts.add(THREE.MathUtils.clamp(o.u1, u0, u1));
      }
      const us = [...cuts].sort((a, b) => a - b);
      for (let i = 0; i < us.length - 1; i++) {
        const ua = us[i];
        const ub = us[i + 1];
        if (ub - ua < 1e-4) continue;
        const mid = (ua + ub) / 2;
        const bands = openings
          .filter((o) => mid > o.u0 && mid < o.u1)
          .map((o) => [Math.max(y0, o.y0), Math.min(y1, o.y1)])
          .filter(([a, b]) => b - a > 1e-4)
          .sort((a, b) => a[0] - b[0]);
        let cursor = y0;
        for (const [ba, bb] of bands) {
          seg(ua, ub, cursor, ba, `${tag}-solid`);
          cursor = Math.max(cursor, bb);
        }
        seg(ua, ub, cursor, y1, `${tag}-solid`);
      }
      for (const o of openings) {
        if (!o.glass) continue;
        seg(o.u0, o.u1, o.y0, o.y1, `${tag}-${o.id}`, o.frosted ? M_GLASS_FROST : M_GLASS_TINT, 0.11);
        // Mullions: a bare 7 m sheet of tinted glass reads as a hole in the
        // wall. Vertical bars every ~2.4 m (plus a transom on anything over
        // three metres tall) give the glazing a frame without a texture.
        const span = o.u1 - o.u0;
        const bays = Math.max(1, Math.round(span / 2.4));
        for (let i = 1; i < bays; i++) {
          const u = o.u0 + (span * i) / bays;
          seg(u - 0.05, u + 0.05, o.y0, o.y1, `${tag}-mullion`, M_MULLION, 0.06);
        }
        if (o.y1 - o.y0 > 3.0) {
          const ty = o.y0 + (o.y1 - o.y0) * 0.62;
          seg(o.u0, o.u1, ty - 0.05, ty + 0.05, `${tag}-transom`, M_MULLION, 0.06);
        }
        windows.push(axis === 'z'
          ? {
            id: o.id, x0: o.u0, x1: o.u1, y0: o.y0, y1: o.y1, z0: lo, z1: hi,
          }
          : {
            id: o.id, x0: lo, x1: hi, y0: o.y0, y1: o.y1, z0: o.u0, z1: o.u1,
          });
      }
    }

    /* -- South wall (the front): living-room glazing | two-storey foyer
     * entrance glazing either side of the front door | lounge glazing, with
     * a bedroom window over each wing. ------------------------------------ */
    panelWall({
      axis: 'z',
      lo: zS0,
      hi: zS1,
      u0: BUILDING.x0,
      u1: BUILDING.x1,
      y0: GROUND_Y,
      y1: UPPER_CEILING_Y,
      tag: 'south',
      openings: [
        {
          id: 'livingSouth', u0: BUILDING.x0, u1: -9.2, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'bedWestFrontSouth', u0: -13.6, u1: -10.4, y0: UPPER_SILL, y1: UPPER_HEAD, glass: true,
        },
        {
          id: 'foyerSouthWest', u0: -8.8, u1: FRONT_DOOR.x0, y0: GLASS_SILL, y1: FOYER_GLASS_TOP, glass: true,
        },
        { id: 'frontDoor', u0: FRONT_DOOR.x0, u1: FRONT_DOOR.x1, y0: GROUND_Y, y1: FRONT_DOOR.y1 },
        {
          id: 'frontTransom', u0: FRONT_DOOR.x0, u1: FRONT_DOOR.x1, y0: FRONT_DOOR.y1, y1: FOYER_GLASS_TOP, glass: true,
        },
        {
          id: 'foyerSouthEast', u0: FRONT_DOOR.x1, u1: 8.8, y0: GLASS_SILL, y1: FOYER_GLASS_TOP, glass: true,
        },
        {
          id: 'bedEastFrontSouth', u0: 10.4, u1: 13.6, y0: UPPER_SILL, y1: UPPER_HEAD, glass: true,
        },
        {
          id: 'loungeSouth', u0: 9.2, u1: BUILDING.x1, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
      ],
    });

    /* -- East wall: the lounge's long glazing, the kitchen window and its
     * service door, and the east wing's upper windows. -------------------- */
    panelWall({
      axis: 'x',
      lo: xE0,
      hi: xE1,
      u0: BUILDING.z0,
      u1: BUILDING.z1,
      y0: GROUND_Y,
      y1: UPPER_CEILING_Y,
      tag: 'east',
      openings: [
        /* The lounge's own glazing now stops either side of the billiard
         * bay; between those two panes the wall is opened right up into it,
         * in three arches on two piers rather than one 15 m hole (a bay that
         * wide with no structure between it and the house reads as a missing
         * wall, and gives the roof above nothing to sit on). */
        {
          id: 'loungeEastSouth', u0: BUILDING.z0, u1: LOUNGE_BAY.z0 - 0.4, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        { id: 'loungeBayArchSouth', u0: 41.4, u1: 44.6, y0: GROUND_Y, y1: BAY_ARCH_TOP },
        { id: 'loungeBayArchMid', u0: 45.6, u1: 49.4, y0: GROUND_Y, y1: BAY_ARCH_TOP },
        { id: 'loungeBayArchNorth', u0: 50.4, u1: 53.6, y0: GROUND_Y, y1: BAY_ARCH_TOP },
        {
          id: 'loungeEastNorth', u0: LOUNGE_BAY.z1 + 0.4, u1: 57.6, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'kitchenEast', u0: 59.5, u1: 63.5, y0: GROUND_Y + 0.95, y1: GLASS_TOP, glass: true,
        },
        { id: 'rearService', u0: REAR_DOOR.z0, u1: REAR_DOOR.z1, y0: GROUND_Y, y1: REAR_DOOR.y1 },
        {
          id: 'bedEastFrontEast', u0: 42.6, u1: 46.4, y0: UPPER_SILL, y1: UPPER_HEAD, glass: true,
        },
        {
          id: 'bedEastRearEast', u0: 55.6, u1: 62.4, y0: UPPER_SILL, y1: UPPER_HEAD, glass: true,
        },
        {
          id: 'bathEastEast', u0: 67.6, u1: 71.4, y0: UPPER_SILL + 0.5, y1: UPPER_HEAD - 0.2, glass: true, frosted: true,
        },
      ],
    });

    /* -- West wall: living-room and dining-room glazing, west wing upper
     * windows. (This wall used to be "fully solid, no openings specified",
     * which left the living room lit only from the front.) ---------------- */
    panelWall({
      axis: 'x',
      lo: xW0,
      hi: xW1,
      u0: BUILDING.z0,
      u1: BUILDING.z1,
      y0: GROUND_Y,
      y1: UPPER_CEILING_Y,
      tag: 'west',
      openings: [
        /* The living room's west glazing used to be one 13 m pane, z:43..56.
         * The west wing is hung off this wall, so the southern half of that
         * run becomes the arcade into the trophy hall and the rest stays
         * glazed. The band picked is z:41.4..46.4 and nothing else: the
         * couch against this wall occupies z:46.75..48.85, the fireplace
         * z:51.2..54, and an opening across either of those is furniture
         * standing in a doorway -- the exact fault the walk-in tests exist
         * to catch. */
        /* Three arches on two piers, not one 5 m hole. The billiard bay
         * already set the precedent on the other side of the house and the
         * reasoning is the same: a five-metre opening with no structure in it
         * reads as a missing wall and gives the storey above nothing to stand
         * on. The middle arch is centred on z=43.9, which is the line the
         * walk-in test drives -- put the piers on that line instead and the
         * hall is entered by squeezing past a column. */
        ...TROPHY_ENTRANCE.arches.map((arch) => ({
          id: arch.id, u0: arch.z0, u1: arch.z1, y0: GROUND_Y, y1: WING_ARCH_TOP,
        })),
        {
          id: 'livingWest', u0: 47.6, u1: 50.8, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        /* The wing's cross-wall occupies z 55.7..56.0. Keep this second pane
         * in the remaining living-room bay north of that wall rather than
         * letting the partition and its door casing pass through the glass. */
        {
          id: 'livingWestNorth', u0: 56.15, u1: 57.65, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'diningWest', u0: 60.4, u1: 63.8, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        /* French doors into the winter garden, north of the dining sideboard
         * (z:64.4..67.6) and its curtain (z:67.06..68.4). */
        { id: 'diningToWinter', u0: 68.8, u1: 71.8, y0: GROUND_Y, y1: GROUND_Y + 2.8 },
        {
          id: 'bedWestFrontWest', u0: 42.6, u1: 46.4, y0: UPPER_SILL, y1: UPPER_HEAD, glass: true,
        },
        {
          id: 'bedWestRearWest', u0: 55.6, u1: 62.4, y0: UPPER_SILL, y1: UPPER_HEAD, glass: true,
        },
        {
          id: 'bathWestWest', u0: 67.6, u1: 71.4, y0: UPPER_SILL + 0.5, y1: UPPER_HEAD - 0.2, glass: true, frosted: true,
        },
      ],
    });

    /* -- North wall: Lou's office looks out over the pool, the dining room
     * gets a garden window, and the kitchen gets the pool door. ----------- */
    panelWall({
      axis: 'z',
      lo: zN0,
      hi: zN1,
      u0: BUILDING.x0,
      u1: BUILDING.x1,
      y0: GROUND_Y,
      y1: UPPER_CEILING_Y,
      tag: 'north',
      openings: [
        {
          id: 'diningNorth', u0: -14.2, u1: -10.2, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'officeNorthWest', u0: -6.4, u1: -1.6, y0: UPPER_SILL, y1: UPPER_HEAD + 0.4, glass: true,
        },
        {
          id: 'officeNorthEast', u0: 1.6, u1: 6.4, y0: UPPER_SILL, y1: UPPER_HEAD + 0.4, glass: true,
        },
        { id: 'poolDoor', u0: POOL_DOOR.x0, u1: POOL_DOOR.x1, y0: POOL_DOOR.y0, y1: POOL_DOOR.y1 },
      ],
    });

    /* -- The billiard bay: a single-storey glazed wing hung off the lounge's
     * outer wall, three arches wide. Its walls stop at BAY_ROOF_Y0, so the
     * main block's east wall carries on above it untouched. -------------- */
    const bayXOuter = LOUNGE_BAY.x1 + WALL_T;
    const bayZ0 = LOUNGE_BAY.z0 - WALL_T;
    const bayZ1 = LOUNGE_BAY.z1 + WALL_T;
    panelWall({
      axis: 'z',
      lo: bayZ0,
      hi: LOUNGE_BAY.z0,
      u0: xE1,
      u1: bayXOuter,
      y0: GROUND_Y,
      y1: BAY_ROOF_Y0,
      tag: 'bay-south',
      openings: [{
        id: 'baySouth', u0: xE1 + 0.4, u1: bayXOuter - 0.4, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
      }],
    });
    panelWall({
      axis: 'z',
      lo: LOUNGE_BAY.z1,
      hi: bayZ1,
      u0: xE1,
      u1: bayXOuter,
      y0: GROUND_Y,
      y1: BAY_ROOF_Y0,
      tag: 'bay-north',
      openings: [{
        id: 'bayNorth', u0: xE1 + 0.4, u1: bayXOuter - 0.4, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
      }],
    });
    panelWall({
      axis: 'x',
      lo: LOUNGE_BAY.x1,
      hi: bayXOuter,
      u0: bayZ0,
      u1: bayZ1,
      y0: GROUND_Y,
      y1: BAY_ROOF_Y0,
      tag: 'bay-east',
      openings: [
        {
          /* Wave 2B comes through this pane.  Its glass still blocks the
           * intact house, but the masonry opening reaches the finished floor
           * so shattering it creates a doorway rather than exposing a sill. */
          id: 'bayEastSouth', u0: 41.6, u1: 44.4, y0: GROUND_Y, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'bayEastMid', u0: 45.8, u1: 49.2, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'bayEastNorth', u0: 50.6, u1: 53.4, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
      ],
    });
    // The bay's own podium, so its floor is the lounge's floor and nobody can
    // see in under it from the service road.
    root.add(geometryIntent(box({
      size: [bayXOuter - LOUNGE_BAY.x0, GROUND_Y, bayZ1 - bayZ0],
      pos: [(LOUNGE_BAY.x0 + bayXOuter) / 2, GROUND_Y / 2, (bayZ0 + bayZ1) / 2],
      mat: M_PODIUM,
      name: 'bay-podium',
    }), { assemblyId: 'mansion-billiard-bay-podium', checkWallEmbed: false }));
    structural(
      LOUNGE_BAY.x0, bayXOuter, 0, GROUND_Y, bayZ0, bayZ1, 'bay-podium-combat',
    );
    buildSiegeBreachEntry({
      id: 'east', direction: -1, outerEdge: 23.8, thresholdInner: 19.0,
      z0: 42.7, z1: 44.3, exteriorY: 0.05,
    });
    // Flat roof with a deep gilded cornice -- the bay is the one part of the
    // house you see head-on from the service gate.
    const bayRoofAssemblyId = 'mansion-billiard-bay-roof';
    root.add(geometryIntent(box({
      size: [bayXOuter - LOUNGE_BAY.x0 + 0.7, BAY_ROOF_Y1 - BAY_ROOF_Y0, bayZ1 - bayZ0 + 0.7],
      pos: [(LOUNGE_BAY.x0 + bayXOuter) / 2, (BAY_ROOF_Y0 + BAY_ROOF_Y1) / 2, (bayZ0 + bayZ1) / 2],
      mat: M_ROOF,
      name: 'bay-roof',
    }), { assemblyId: bayRoofAssemblyId, checkWallEmbed: false }));
    structural(
      LOUNGE_BAY.x0 - 0.35, bayXOuter + 0.35, BAY_ROOF_Y0, BAY_ROOF_Y1,
      bayZ0 - 0.35, bayZ1 + 0.35, 'bay-roof-combat',
    );
    for (const [tx0, tx1, tz0, tz1] of [
      [LOUNGE_BAY.x0, bayXOuter + 0.35, bayZ0 - 0.35, bayZ0 - 0.18],
      [LOUNGE_BAY.x0, bayXOuter + 0.35, bayZ1 + 0.18, bayZ1 + 0.35],
      [bayXOuter + 0.18, bayXOuter + 0.35, bayZ0 - 0.35, bayZ1 + 0.35],
    ]) {
      root.add(geometryIntent(box({
        size: [tx1 - tx0, 0.16, tz1 - tz0],
        pos: [(tx0 + tx1) / 2, BAY_ROOF_Y1 - 0.02, (tz0 + tz1) / 2],
        mat: M_GOLD,
        cast: false,
      }), { assemblyId: bayRoofAssemblyId, checkWallEmbed: false }));
    }
    // Gilded pilasters on the two piers between the arches, inside and out.
    for (const pz of [45.1, 49.9]) {
      for (const px of [xE1 + 0.02, LOUNGE_BAY.x1 - 0.02]) {
        root.add(box({
          size: [0.1, BAY_ARCH_TOP - GROUND_Y, 0.9], pos: [px, (GROUND_Y + BAY_ARCH_TOP) / 2, pz], mat: M_GOLD, cast: false,
        }));
      }
    }

    /* -- THE WEST WING. -------------------------------------------------
     * Same construction as the billiard bay, at range scale: a podium so its
     * floor is the ground floor's, three outer walls with their own glazing,
     * a flat roof under the upper storey's window sills, and a gilded cornice.
     * The east side is the main block's own west wall (already built above,
     * with the arcade and the French doors in it), so it gets none here. */
    const wingOuterX = WEST_WING.x0;
    const wingInnerX = WEST_WING.x1;   // == BUILDING.x0
    const wingT = 0.4;
    panelWall({
      axis: 'x',
      lo: wingOuterX,
      hi: wingOuterX + wingT,
      u0: WEST_WING.z0,
      u1: WEST_WING.z1,
      y0: GROUND_Y,
      y1: WING_ROOF_Y0,
      tag: 'wing-west',
      openings: [
        {
          /* The west flank's designated break-in pane: floor-to-head glass,
           * not a decorative window over a 1.05 m solid sill. */
          id: 'trophyWestSouth', u0: 43.0, u1: 46.4, y0: GROUND_Y, y1: GLASS_TOP + 0.5, glass: true,
        },
        {
          id: 'trophyWestNorth', u0: 50.2, u1: 53.6, y0: GLASS_SILL + 0.9, y1: GLASS_TOP + 0.5, glass: true,
        },
        {
          id: 'winterWestSouth', u0: 58.0, u1: 63.4, y0: GLASS_SILL - 0.6, y1: GLASS_TOP + 0.4, glass: true,
        },
        {
          id: 'winterWestNorth', u0: 65.6, u1: 71.6, y0: GLASS_SILL - 0.6, y1: GLASS_TOP + 0.4, glass: true,
        },
      ],
    });
    panelWall({
      axis: 'z',
      lo: WEST_WING.z0,
      hi: WEST_WING.z0 + wingT,
      u0: wingOuterX,
      u1: wingInnerX,
      y0: GROUND_Y,
      y1: WING_ROOF_Y0,
      tag: 'wing-south',
      openings: [{
        id: 'trophySouth', u0: -22.4, u1: -17.8, y0: GLASS_SILL + 0.9, y1: GLASS_TOP + 0.5, glass: true,
      }],
    });
    panelWall({
      axis: 'z',
      lo: WEST_WING.z1 - wingT,
      hi: WEST_WING.z1,
      u0: wingOuterX,
      u1: wingInnerX,
      y0: GROUND_Y,
      y1: WING_ROOF_Y0,
      tag: 'wing-north',
      openings: [{
        id: 'winterNorth', u0: -22.4, u1: -17.8, y0: GLASS_SILL - 0.6, y1: GLASS_TOP + 0.4, glass: true,
      }],
    });
    root.add(geometryIntent(box({
      size: [wingInnerX - wingOuterX, GROUND_Y, WEST_WING.z1 - WEST_WING.z0],
      pos: [(wingOuterX + wingInnerX) / 2, GROUND_Y / 2, (WEST_WING.z0 + WEST_WING.z1) / 2],
      mat: M_PODIUM,
      name: 'wing-podium',
    }), { assemblyId: 'mansion-west-wing-podium', checkWallEmbed: false }));
    structural(
      wingOuterX, wingInnerX, 0, GROUND_Y, WEST_WING.z0, WEST_WING.z1, 'wing-podium-combat',
    );
    buildSiegeBreachEntry({
      id: 'west', direction: 1, outerEdge: -27.4, thresholdInner: -22.3,
      z0: 43.2, z1: 45.6, exteriorY: 0,
    });
    /* Overhang on three sides only: the east edge stops on the building line.
     * An eave reaching past it at this height would cross the bottom of the
     * upper storey's west windows. */
    const wingRoofAssemblyId = 'mansion-west-wing-roof';
    root.add(geometryIntent(box({
      size: [(wingInnerX - wingOuterX) + 0.45, WING_ROOF_Y1 - WING_ROOF_Y0, WEST_WING.z1 - WEST_WING.z0 + 0.9],
      pos: [
        (wingOuterX - 0.45 + wingInnerX) / 2,
        (WING_ROOF_Y0 + WING_ROOF_Y1) / 2,
        (WEST_WING.z0 + WEST_WING.z1) / 2,
      ],
      mat: M_ROOF,
      name: 'wing-roof',
    }), { assemblyId: wingRoofAssemblyId, checkWallEmbed: false }));
    /* The west wing is one storey, so this slab is the trophy hall's and the
     * winter garden's ceiling and nothing stands on it. It still belongs in
     * the combat model: it is what a round fired up through either room
     * stops in, and what stops a man on the upper floor seeing down into
     * them past the main block's west wall. */
    structural(
      wingOuterX - 0.45, wingInnerX, WING_ROOF_Y0, WING_ROOF_Y1,
      WEST_WING.z0 - 0.45, WEST_WING.z1 + 0.45, 'wing-roof-combat',
    );
    for (const [tx0, tx1, tz0, tz1] of [
      [wingOuterX - 0.45, wingInnerX, WEST_WING.z0 - 0.45, WEST_WING.z0 - 0.25],
      [wingOuterX - 0.45, wingInnerX, WEST_WING.z1 + 0.25, WEST_WING.z1 + 0.45],
      [wingOuterX - 0.45, wingOuterX - 0.25, WEST_WING.z0 - 0.45, WEST_WING.z1 + 0.45],
    ]) {
      root.add(geometryIntent(box({
        size: [tx1 - tx0, 0.18, tz1 - tz0],
        pos: [(tx0 + tx1) / 2, WING_ROOF_Y1 - 0.02, (tz0 + tz1) / 2],
        mat: M_GOLD,
        cast: false,
      }), { assemblyId: wingRoofAssemblyId, checkWallEmbed: false }));
    }
    // Pilasters up the outer face, between the windows -- the elevation you
    // see from the whole west lawn, so it gets an order rather than a slab.
    for (const pz of [42.0, 48.4, 55.0, 64.6, 73.0]) {
      const assemblyId = `mansion-west-wing-pilaster:${pz}`;
      root.add(geometryIntent(box({
        size: [0.34, WING_ROOF_Y0 - GROUND_Y, 0.9],
        pos: [wingOuterX - 0.12, (GROUND_Y + WING_ROOF_Y0) / 2, pz],
        mat: M_MARBLE_DK,
        cast: false,
        name: 'west-wing-pilaster-body',
      }), { assemblyId, checkWallEmbed: false }));
      root.add(geometryIntent(box({
        size: [0.44, 0.22, 1.02], pos: [wingOuterX - 0.12, WING_ROOF_Y0 - 0.1, pz], mat: M_GOLD, cast: false,
        name: 'west-wing-pilaster-cap',
      }), { assemblyId, checkWallEmbed: false }));
    }
    const wingSpill = new THREE.PointLight(0xffd0a0, 8, 16, 2);
    wingSpill.position.set(wingOuterX - 1.4, 2.8, 48.0);
    root.add(wingSpill);

    /* -- THE THIRD FLOOR: the master suite's own shell. ------------------
     *
     * Four walls, four windows and a roof, standing on the main roof slab
     * over the rear of the centre block. See the note on SUITE_Y at the top
     * of this file for why it is here and not over the west wing.
     *
     * The walls land ON the walls below — x = ±9 are the office's flank
     * partitions, z = 63 is the conference/office partition and z = 75 is the
     * rear elevation — so the load path is honest and the mass reads from the
     * grounds as a set-back top storey with 7.25 m of flat roof either side.
     *
     * Corners: the two flank walls carry the FULL outer z extent and the two
     * end walls only the inner x extent, so they butt rather than overlap.
     * (The main block's own shell leaves a 0.3 m gap at each corner instead;
     * that is a separate, older thing and not this pass's to move.)
     *
     * BUILT BY HAND RATHER THAN THROUGH `panelWall`, AND THAT IS THE ONE
     * DELIBERATE DEPARTURE IN THIS FILE. `panelWall` cuts a wall into columns
     * at every opening edge and butts the columns together, and two boxes that
     * butt on a square metre of face are precisely what `tools/scene-audit.mjs`
     * calls COPLANAR -- it is why the existing shell's own list carries
     * `north-solid x north-solid`, `gallery-south-solid x gallery-south-solid`
     * and a dozen more. Fixing that inside `panelWall` would move every wall
     * rect in the house by 20 mm, and the siege cross-checks those rects, so
     * this pass does not touch it.
     *
     * Instead the suite's walls are laid up the way masonry actually goes
     * together: a continuous band under the sills, a continuous band over the
     * heads, and piers between the openings that LAP both bands by 20 mm. No
     * two faces are ever flush, the audit reports nothing, and the wall is one
     * mesh fewer than the column version. The glazing laps its reveals by the
     * same 20 mm for the same reason. */
    {
      /* 0.36 rather than the shell's own 0.40, and 20 mm of lap into the room
       * at every inner face. Both are deliberate: at 0.40 the suite's rear
       * wall lands its outer face on 75.4, which is exactly where the main
       * roof slab's eave is, and a flush pair over fifteen square metres is
       * the flicker. The inner lap does the same job against the room's own
       * skirting and floor finish. */
      const SW = 0.36;
      const LAP_IN = 0.02;
      const sx0 = MASTER_SUITE.x0 - SW;      // -9.21
      const sx1 = MASTER_SUITE.x1 + SW;      //  9.21
      const sz0 = MASTER_SUITE.z0 - SW;      //  62.79
      const sz1 = MASTER_SUITE.z1 + SW;      //  75.36
      /** Head and sill of the suite's glazing. */
      const SUITE_SILL = SUITE_Y + 0.9;      // 11.5
      const SUITE_HEAD = SUITE_Y + 2.7;      // 13.3
      /* The walls are set 60 mm INTO the slab they stand on and 60 mm into the
       * roof they carry, for the same reason: a wall whose base is exactly a
       * slab's top face is a flush pair, and a wall bedded into its bearing is
       * what a wall is. */
      const WY0 = SUITE_Y - 0.02;
      const WY1 = SUITE_ROOF_Y0 + 0.06;
      const LAP = 0.02;

      /**
       * One glazed elevation, laid up as bands + piers + panes.
       *
       * `axis` is the wall's normal ('x' for the flanks, 'z' for the ends);
       * `lo`/`hi` its thickness band; `u0`/`u1` its extent along itself;
       * `openings` a list of {id, u0, u1, y0, y1}.
       */
      function suiteWall({
        axis, lo, hi, u0, u1, tag, openings = [],
      }) {
        const assemblyId = [
          'mansion-suite-wall', tag, axis, lo, hi, u0, u1, WY0, WY1,
        ].join(':');
        let segmentIndex = 0;
        const seg = (ua, ub, ya, yb, name, material = M_STUCCO, inset = 0) => {
          if (ub - ua < 1e-4 || yb - ya < 1e-4) return;
          const index = segmentIndex;
          segmentIndex += 1;
          if (axis === 'z') {
            ext(ua, ub, ya, yb, lo + inset, hi - inset, name, material, true, assemblyId, index);
          } else {
            ext(lo + inset, hi - inset, ya, yb, ua, ub, name, material, true, assemblyId, index);
          }
        };
        if (!openings.length) {
          seg(u0, u1, WY0, WY1, `${tag}-solid`);
          return;
        }
        const sill = Math.min(...openings.map((o) => o.y0));
        const head = Math.max(...openings.map((o) => o.y1));
        // Continuous bands under every sill and over every head.
        seg(u0, u1, WY0, sill, `${tag}-solid`);
        seg(u0, u1, head, WY1, `${tag}-solid`);
        /* Piers between and either side of the openings, lapping both bands
         * AND lapping 20 mm over each pane's reveal -- the pane is inset
         * 0.11, so the lap is behind glass and invisible, and it is what
         * keeps the pier's edge off the pane's edge. */
        const edges = [u0];
        for (const o of openings) edges.push(o.u0, o.u1);
        edges.push(u1);
        for (let i = 0; i < edges.length; i += 2) {
          const pa = i === 0 ? edges[i] : edges[i] - LAP;
          const pb = i + 1 === edges.length - 1 ? edges[i + 1] : edges[i + 1] + LAP;
          seg(pa, pb, sill - LAP, head + LAP, `${tag}-pier`);
        }
        // The panes, lapping their own reveals.
        for (const o of openings) {
          seg(o.u0, o.u1, o.y0 - LAP, o.y1 + LAP, `${tag}-${o.id}`, M_GLASS_TINT, 0.11);
          const span = o.u1 - o.u0;
          const bays = Math.max(1, Math.round(span / 2.4));
          for (let i = 1; i < bays; i++) {
            const u = o.u0 + (span * i) / bays;
            seg(u - 0.05, u + 0.05, o.y0 - LAP, o.y1 + LAP, `${tag}-mullion`, M_MULLION, 0.06);
          }
          windows.push(axis === 'z'
            ? {
              id: o.id, x0: o.u0, x1: o.u1, y0: o.y0, y1: o.y1, z0: lo, z1: hi,
            }
            : {
              id: o.id, x0: lo, x1: hi, y0: o.y0, y1: o.y1, z0: o.u0, z1: o.u1,
            });
        }
      }

      // West and east flanks, with one window each.
      suiteWall({
        axis: 'x',
        lo: sx0,
        hi: MASTER_SUITE.x0 + LAP_IN,
        u0: sz0,
        u1: sz1,
        tag: 'suite-west',
        openings: [{
          id: 'suiteWest', u0: 63.6, u1: 67.4, y0: SUITE_SILL, y1: SUITE_HEAD - 0.3,
        }],
      });
      suiteWall({
        axis: 'x',
        lo: MASTER_SUITE.x1 - LAP_IN,
        hi: sx1,
        u0: sz0,
        u1: sz1,
        tag: 'suite-east',
        openings: [{
          id: 'suiteEast', u0: 70.2, u1: 74.0, y0: SUITE_SILL, y1: SUITE_HEAD - 0.3,
        }],
      });
      /* The rear elevation — the wall the bed looks at, over the pool and the
       * formal garden. Two tall panes with a 5.6 m pier between them, because
       * the pier is what the suite's television hangs on: a 2.6 m screen needs
       * a wall, and this is the only one in the room that is neither glazed
       * nor behind the bed. */
      suiteWall({
        axis: 'z',
        lo: MASTER_SUITE.z1 - LAP_IN,
        hi: sz1,
        u0: MASTER_SUITE.x0,
        u1: MASTER_SUITE.x1,
        tag: 'suite-north',
        openings: [
          { id: 'suiteNorthWest', u0: -8.0, u1: -2.8, y0: SUITE_SILL, y1: SUITE_HEAD },
          { id: 'suiteNorthEast', u0: 2.8, u1: 8.0, y0: SUITE_SILL, y1: SUITE_HEAD },
        ],
      });
      // The blind south wall, over the conference room. The bed's head is on it.
      suiteWall({
        axis: 'z',
        lo: sz0,
        hi: MASTER_SUITE.z0 + LAP_IN,
        u0: MASTER_SUITE.x0,
        u1: MASTER_SUITE.x1,
        tag: 'suite-south',
      });

      // Roof slab over it, with the same eave and the same gold roofline.
      const suiteRoofAssemblyId = 'mansion-master-suite-roof';
      root.add(geometryIntent(box({
        size: [sx1 - sx0 + 0.7, SUITE_ROOF_Y1 - SUITE_ROOF_Y0, sz1 - sz0 + 0.7],
        pos: [(sx0 + sx1) / 2, (SUITE_ROOF_Y0 + SUITE_ROOF_Y1) / 2, (sz0 + sz1) / 2],
        mat: M_ROOF,
        name: 'suite-roof-slab',
      }), { assemblyId: suiteRoofAssemblyId, checkWallEmbed: false }));
      structural(
        sx0 - 0.35, sx1 + 0.35, SUITE_ROOF_Y0, SUITE_ROOF_Y1,
        sz0 - 0.35, sz1 + 0.35, 'suite-roof-slab-combat',
      );
      for (const [x0, x1, z0, z1] of [
        [sx0 - 0.32, sx1 + 0.32, sz0 - 0.32, sz0 - 0.2],
        [sx0 - 0.32, sx1 + 0.32, sz1 + 0.2, sz1 + 0.32],
        [sx0 - 0.32, sx0 - 0.2, sz0 - 0.32, sz1 + 0.32],
        [sx1 + 0.2, sx1 + 0.32, sz0 - 0.32, sz1 + 0.32],
      ]) {
        root.add(geometryIntent(box({
          size: [x1 - x0, 0.1, z1 - z0],
          pos: [(x0 + x1) / 2, SUITE_ROOF_Y0 + 0.02, (z0 + z1) / 2],
          mat: M_GOLD,
          cast: false,
          name: 'suite-roof-trim',
        }), { assemblyId: suiteRoofAssemblyId, checkWallEmbed: false }));
      }
      /* A gilded parapet round the flat roof the new storey stands in the
       * middle of. Without it the third floor reads as a shed dropped on a
       * roof; with it the roof reads as a terrace and the suite as the
       * pavilion in the middle of one. Set 1.2 m in off the eaves so it is
       * clear of the roofline trim already there.
       *
       * THE NORTH RUN DIES INTO THE PAVILION, IN TWO PIECES. The suite
       * stands on this same roof at x -9.21..9.21, z 62.79..75.36, and its
       * floor IS the slab the parapet stands on — so a single north run at
       * z 73.58..73.80 was 17.7 m of parapet crossing the bedroom 1.2 m in
       * front of the television wall. Owner playtest 2026-08-18, verbatim:
       * "There is a railway (looks like a rooftop half wall) going thro the
       * middle of Lous room by the TV." The run keeps its line on the two
       * flanking terraces and stops at the pavilion's own outer wall faces
       * (sx0/sx1); the cope's 70 mm overhang laps into the masonry there,
       * which is how a parapet meets a wall. */
      for (const [parapetIndex, [x0, x1, z0, z1]] of [
        [BUILDING.x0 + 1.2, BUILDING.x1 - 1.2, BUILDING.z0 + 1.2, BUILDING.z0 + 1.42],
        [BUILDING.x0 + 1.2, sx0, BUILDING.z1 - 1.42, BUILDING.z1 - 1.2],
        [sx1, BUILDING.x1 - 1.2, BUILDING.z1 - 1.42, BUILDING.z1 - 1.2],
        [BUILDING.x0 + 1.2, BUILDING.x0 + 1.42, BUILDING.z0 + 1.2, BUILDING.z1 - 1.2],
        [BUILDING.x1 - 1.42, BUILDING.x1 - 1.2, BUILDING.z0 + 1.2, BUILDING.z1 - 1.2],
      ].entries()) {
        const parapetAssemblyId = `mansion-main-roof-parapet-${parapetIndex}`;
        root.add(geometryIntent(box({
          size: [x1 - x0, 0.62, z1 - z0],
          pos: [(x0 + x1) / 2, ROOF_Y1 + 0.31, (z0 + z1) / 2],
          mat: M_MARBLE_DK,
          cast: false,
          name: 'roof-parapet',
        }), { assemblyId: parapetAssemblyId, checkWallEmbed: false }));
        root.add(geometryIntent(box({
          size: [x1 - x0 + 0.14, 0.09, z1 - z0 + 0.14],
          pos: [(x0 + x1) / 2, ROOF_Y1 + 0.66, (z0 + z1) / 2],
          mat: M_GOLD,
          cast: false,
          name: 'roof-parapet-cope',
        }), { assemblyId: parapetAssemblyId, checkWallEmbed: false }));
      }
      /* Uplighters on the roof terrace, washing the suite's own walls. This
       * is what makes the new mass READ at night from the driveway and the
       * rear garden — it is the only storey with nothing behind it. */
      for (const [lx, lz] of [[-12.4, 66.0], [12.4, 66.0], [-12.4, 72.0], [12.4, 72.0]]) {
        const up = new THREE.PointLight(0xffd6a0, 5.2, 14, 2);
        up.position.set(lx, ROOF_Y1 + 0.5, lz);
        root.add(up);
        root.add(cylinder({
          r: 0.16, h: 0.3, pos: [lx, ROOF_Y1 + 0.15, lz], mat: M_GOLD, cast: false,
        }));
      }
    }

    /* Roof slab (small eave overhang) + gold roofline trim.
     *
     * NOTCHED, the way the podium below it is notched round the basement
     * stairwell: the third floor's concealed stair climbs out of Lou's office
     * and has to come THROUGH this slab, so the slab is poured in four
     * segments round `SUITE_STAIR_WELL` instead of one. A slab with no hole in
     * it would have the player walk up a flight into its underside — and,
     * worse, `MansionInterior.floorAt` would have offered the suite's floor
     * inside the well and stood him on thin air over a 4.6 m drop, which is
     * exactly the shape of the basement-stair bug this file already carries a
     * comment about. */
    /* Two full-depth flanks and two infill strips. The strips are 20 mm
     * SHALLOWER than the flanks and lap into them by 20 mm, so no two pieces
     * of one slab ever present each other a flush face -- which is what
     * `tools/scene-audit.mjs` reports as the flicker, and what a slab cut on
     * exact lines would have produced four times over. */
    const LAP = 0.03;
    const roofSegs = [
      {
        x0: BUILDING.x0 - 0.4, x1: SUITE_STAIR_WELL.x0 + LAP, z0: BUILDING.z0 - 0.4, z1: BUILDING.z1 + 0.4, full: true,
      },
      {
        x0: SUITE_STAIR_WELL.x1 - LAP, x1: BUILDING.x1 + 0.4, z0: BUILDING.z0 - 0.4, z1: BUILDING.z1 + 0.4, full: true,
      },
      {
        x0: SUITE_STAIR_WELL.x0, x1: SUITE_STAIR_WELL.x1, z0: BUILDING.z0 - 0.4, z1: SUITE_STAIR_WELL.z0 + LAP, full: false,
      },
      {
        x0: SUITE_STAIR_WELL.x0, x1: SUITE_STAIR_WELL.x1, z0: SUITE_STAIR_WELL.z1 - LAP, z1: BUILDING.z1 + 0.4, full: false,
      },
    ];
    for (const [roofSegmentIndex, s] of roofSegs.entries()) {
      const y0 = s.full ? ROOF_Y0 : ROOF_Y0 + 0.01;
      const y1 = s.full ? ROOF_Y1 : ROOF_Y1 - 0.01;
      root.add(geometryIntent(box({
        size: [s.x1 - s.x0, y1 - y0, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, (y0 + y1) / 2, (s.z0 + s.z1) / 2],
        mat: M_ROOF,
        name: 'roof-slab',
      }), { assemblyId: `mansion-main-roof-segment-${roofSegmentIndex}`, checkWallEmbed: false }));
      /* This slab is two things at once and the combat model needs both: the
       * upper storey's ceiling and the master suite's floor. One box does
       * both jobs, notched round the concealed stair exactly as the mesh is. */
      structural(s.x0, s.x1, y0, y1, s.z0, s.z1, `main-roof-segment-${roofSegmentIndex}-combat`);
    }
    for (const [trimIndex, [x0, x1, z0, z1]] of [
      [BUILDING.x0 - 0.4, BUILDING.x1 + 0.4, zS0 - 0.05, zS0 + 0.1],
      [BUILDING.x0 - 0.4, BUILDING.x1 + 0.4, zN1 - 0.1, zN1 + 0.05],
      [xW0 - 0.05, xW0 + 0.1, BUILDING.z0 - 0.4, BUILDING.z1 + 0.4],
      [xE1 - 0.1, xE1 + 0.05, BUILDING.z0 - 0.4, BUILDING.z1 + 0.4],
    ].entries()) {
      root.add(geometryIntent(box({
        size: [x1 - x0, 0.1, z1 - z0], pos: [(x0 + x1) / 2, ROOF_Y0 + 0.02, (z0 + z1) / 2], mat: M_GOLD,
        name: `main-roofline-trim-${trimIndex}`,
      }), { assemblyId: `mansion-main-roofline-trim-${trimIndex}`, checkWallEmbed: false, checkSupport: false, fixedSupportAnchor: true }));
    }

    /* -- Floor slabs. --------------------------------------------------
     * Two DIFFERENT notches now, where the old shell had one:
     *   the podium (ground-floor foundation, y:0..GROUND_Y) is holed only
     *   where the basement stair cuts through it, and
     *   the upper-floor slab is holed over the whole double-height foyer.
     * Neither carries a collider -- these are floors, walked ON, not into. */
    const podiumSegs = [
      { x0: BUILDING.x0, x1: BASEMENT_SHAFT.x0, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: BASEMENT_SHAFT.x1, x1: BUILDING.x1, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: BASEMENT_SHAFT.x0, x1: BASEMENT_SHAFT.x1, z0: BUILDING.z0, z1: BASEMENT_SHAFT.z0 },
      { x0: BASEMENT_SHAFT.x0, x1: BASEMENT_SHAFT.x1, z0: BASEMENT_SHAFT.z1, z1: BUILDING.z1 },
    ];
    for (const [podiumSegmentIndex, s] of podiumSegs.entries()) {
      const m = box({
        size: [s.x1 - s.x0, GROUND_Y, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, GROUND_Y / 2, (s.z0 + s.z1) / 2],
        mat: M_PODIUM,
        name: `main-podium-segment-${podiumSegmentIndex}`,
      });
      geometryIntent(m, { assemblyId: `mansion-main-podium-segment-${podiumSegmentIndex}`, checkWallEmbed: false });
      root.add(m);
      occluders.push(m);
      /* The ground floor, for the combat model only. Notched round the
       * basement stairwell exactly as the mesh is: the shaft is the one
       * place in this footprint where a man upstairs is genuinely allowed
       * to see and shoot a man downstairs, and sealing it would be as
       * wrong in the other direction as leaving the whole storey open. */
      structural(
        s.x0, s.x1, 0, GROUND_Y, s.z0, s.z1,
        `main-podium-segment-${podiumSegmentIndex}-combat`,
      );
    }
    const upperSegs = [
      { x0: BUILDING.x0, x1: FOYER_VOID.x0, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: FOYER_VOID.x1, x1: BUILDING.x1, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: FOYER_VOID.x0, x1: FOYER_VOID.x1, z0: FOYER_VOID.z1, z1: BUILDING.z1 },
    ];
    for (const [upperSegmentIndex, s] of upperSegs.entries()) {
      const m = box({
        size: [s.x1 - s.x0, 0.28, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, UPPER_Y - 0.14, (s.z0 + s.z1) / 2],
        mat: M_PODIUM,
        name: `upper-floor-segment-${upperSegmentIndex}`,
      });
      geometryIntent(m, { assemblyId: `mansion-upper-floor-segment-${upperSegmentIndex}`, checkWallEmbed: false });
      root.add(m);
      occluders.push(m);
      /* The upper floor, holed over the double-height foyer -- which is the
       * one storey-to-storey sight line the siege is actually fought on
       * (the gallery rail over the foyer). The notch is the mesh's own. */
      structural(
        s.x0, s.x1, UPPER_Y - 0.28, UPPER_Y, s.z0, s.z1,
        `upper-floor-segment-${upperSegmentIndex}-combat`,
      );
    }

    /* -- Basement shell, under the rear half of the house. ---------------
     * Floor slab, four perimeter walls from BASEMENT_Y up to y=0 (the
     * underside of the podium), and a soffit ceiling with the stair shaft
     * left open. The walls stop at y=0 rather than reaching GROUND_Y: the
     * podium above them is a solid block, and a collider whose top is level
     * with the ground floor's own walking surface is not skipped by
     * core/player.js's `p.y - eyeHeight > box.max.y` test, so one that tall
     * would silently block the rooms directly above it. */
    root.add(box({
      size: [BASEMENT_ROOM.x1 - BASEMENT_ROOM.x0, 0.3, BASEMENT_ROOM.z1 - BASEMENT_ROOM.z0],
      pos: [
        (BASEMENT_ROOM.x0 + BASEMENT_ROOM.x1) / 2,
        BASEMENT_Y - 0.15,
        (BASEMENT_ROOM.z0 + BASEMENT_ROOM.z1) / 2,
      ],
      mat: M_MARBLE_DK,
    }));
    structural(
      BASEMENT_ROOM.x0, BASEMENT_ROOM.x1, BASEMENT_Y - 0.3, BASEMENT_Y,
      BASEMENT_ROOM.z0, BASEMENT_ROOM.z1, 'armory-raft-combat',
    );
    ext(BASEMENT_ROOM.x0, BASEMENT_ROOM.x1, BASEMENT_Y, 0, BASEMENT_ROOM.z0 - 0.3, BASEMENT_ROOM.z0, 'basement-wall-south', M_PODIUM);
    /* The armory's north wall, with ONE doorway punched through it into the
     * lower level's spine corridor.
     *
     * x:5.35..7.05 and nowhere else. The armory is furnished wall to wall and
     * two of its three other walls carry the weapon racks, so this is the only
     * stretch of masonry down there with nothing standing against it: the tool
     * bench's collider stops at x=5.25 and the boiler's starts at x=7.1. The
     * armory's own fit-out is not moved by a centimetre to make room for it.
     *
     * The head stops 0.6 m short of the podium so there is a real lintel over
     * it rather than a full-height slot. */
    const cellarDoorHead = BASEMENT_Y + 2.2;
    ext(BASEMENT_ROOM.x0, CELLAR_DOOR.x0, BASEMENT_Y, 0, BASEMENT_ROOM.z1, BASEMENT_ROOM.z1 + 0.3, 'basement-wall-north-west', M_PODIUM);
    ext(CELLAR_DOOR.x1, BASEMENT_ROOM.x1, BASEMENT_Y, 0, BASEMENT_ROOM.z1, BASEMENT_ROOM.z1 + 0.3, 'basement-wall-north-east', M_PODIUM);
    ext(CELLAR_DOOR.x0, CELLAR_DOOR.x1, cellarDoorHead, 0, BASEMENT_ROOM.z1, BASEMENT_ROOM.z1 + 0.3, 'basement-wall-north-lintel', M_PODIUM);
    ext(BASEMENT_ROOM.x0 - 0.3, BASEMENT_ROOM.x0, BASEMENT_Y, 0, BASEMENT_ROOM.z0, BASEMENT_ROOM.z1, 'basement-wall-west', M_PODIUM);
    ext(BASEMENT_ROOM.x1, BASEMENT_ROOM.x1 + 0.3, BASEMENT_Y, 0, BASEMENT_ROOM.z0, BASEMENT_ROOM.z1, 'basement-wall-east', M_PODIUM);
    // Soffit ceiling, notched around the stair shaft so the shaft reads as an
    // open hole in the floor above rather than a lit ceiling with a gap in it.
    for (const [armorySoffitIndex, s] of [
      { x0: BASEMENT_ROOM.x0, x1: BASEMENT_SHAFT.x0, z0: BASEMENT_ROOM.z0, z1: BASEMENT_ROOM.z1 },
      { x0: BASEMENT_SHAFT.x0, x1: BASEMENT_ROOM.x1, z0: BASEMENT_ROOM.z0, z1: BASEMENT_SHAFT.z0 },
      { x0: BASEMENT_SHAFT.x0, x1: BASEMENT_ROOM.x1, z0: BASEMENT_SHAFT.z1, z1: BASEMENT_ROOM.z1 },
    ].entries()) {
      root.add(box({
        size: [s.x1 - s.x0, 0.12, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, -0.16, (s.z0 + s.z1) / 2],
        mat: M_BASEMENT_CEIL,
      }));
      /* THE ARMORY'S CEILING, and the single surface the owner's report is
       * about: the man in the foyer was shooting the player in this room
       * straight down through this soffit and the podium above it, both of
       * which existed only as pictures of concrete. */
      structural(
        s.x0, s.x1, -0.22, -0.10, s.z0, s.z1, `armory-soffit-${armorySoffitIndex}-combat`,
      );
    }

    /* -- THE LOWER LEVEL, north of the armory. ---------------------------
     * Floor slab, perimeter walls and a soffit ceiling, exactly the same
     * construction as the armory's, over BASEMENT_WING. Its south wall runs
     * only where the armory's does not: between x=-9 and x=9 the armory's own
     * north wall (with the doorway in it, above) IS the corridor's south wall,
     * and doubling it would put two colliders in the same 30 cm.
     *
     * The fit-out -- the corridor, the guest room, the theatre, the LAN room
     * and the vault -- is MansionInterior's, the same split as everywhere
     * else in this house. */
    const BW = BASEMENT_WING;
    root.add(box({
      size: [BW.x1 - BW.x0 + 0.6, 0.3, BW.z1 - BW.z0 + 0.6],
      pos: [(BW.x0 + BW.x1) / 2, BASEMENT_Y - 0.15, (BW.z0 + BW.z1) / 2],
      mat: M_MARBLE_DK,
      name: 'cellar-wing-slab',
    }));
    structural(
      BW.x0 - 0.3, BW.x1 + 0.3, BASEMENT_Y - 0.3, BASEMENT_Y,
      BW.z0 - 0.3, BW.z1 + 0.3, 'cellar-wing-slab-combat',
    );
    /* The west shell wall, in three pieces round SECRET_DOOR -- see the note
     * on that constant. The lintel over the opening stops at y=0, the
     * underside of the podium, exactly like the cellar stair's head wall and
     * for the same reason: nothing in this house may top out on a floor
     * somebody stands on. */
    ext(BW.x0 - 0.3, BW.x0, BASEMENT_Y, 0, BW.z0 - 0.3, SECRET_DOOR.z0, 'cellar-wing-west-south', M_PODIUM);
    ext(BW.x0 - 0.3, BW.x0, BASEMENT_Y, 0, SECRET_DOOR.z1, BW.z1 + 0.3, 'cellar-wing-west-north', M_PODIUM);
    ext(BW.x0 - 0.3, BW.x0, SECRET_DOOR.y1, 0, SECRET_DOOR.z0, SECRET_DOOR.z1, 'cellar-wing-west-lintel', M_PODIUM);
    ext(BW.x1, BW.x1 + 0.3, BASEMENT_Y, 0, BW.z0 - 0.3, BW.z1 + 0.3, 'cellar-wing-east', M_PODIUM);
    ext(BW.x0 - 0.3, BW.x1 + 0.3, BASEMENT_Y, 0, BW.z1, BW.z1 + 0.3, 'cellar-wing-north', M_PODIUM);
    for (const [sx0, sx1] of [[BW.x0 - 0.3, BASEMENT_ROOM.x0], [BASEMENT_ROOM.x1, BW.x1 + 0.3]]) {
      ext(sx0, sx1, BASEMENT_Y, 0, BW.z0, BW.z0 + 0.3, 'cellar-wing-south', M_PODIUM);
    }
    root.add(box({
      size: [BW.x1 - BW.x0, 0.12, BW.z1 - BW.z0],
      pos: [(BW.x0 + BW.x1) / 2, -0.16, (BW.z0 + BW.z1) / 2],
      mat: M_BASEMENT_CEIL,
      name: 'cellar-wing-soffit',
    }));
    /* The lower level's ceiling. The guest room the player spawns in is under
     * this, and the rear hall four metres above it is where the man who shot
     * him at t=0.78 s was standing. */
    structural(
      BW.x0, BW.x1, -0.22, -0.10, BW.z0, BW.z1, 'cellar-wing-soffit-combat',
    );

    // Warm light spilling from the glazed rooms, seen from outside.
    const livingSpill = new THREE.PointLight(0xffc98a, 7, 14, 2);
    livingSpill.position.set(-12, 2.6, 41.6);
    root.add(livingSpill);
    const loungeSpill = new THREE.PointLight(0xffc98a, 7, 14, 2);
    loungeSpill.position.set(12, 2.6, 41.6);
    root.add(loungeSpill);
    const foyerSpill = new THREE.PointLight(0xffdcae, 9, 18, 2);
    foyerSpill.position.set(0, 4.2, 41.8);
    root.add(foyerSpill);

    // Facade floodlights, uplighting the entrance stucco.
    const uplightA = new THREE.PointLight(0xffe6c2, 8, 20, 2);
    uplightA.position.set(-8, 0.6, 39);
    root.add(uplightA);
    const uplightB = new THREE.PointLight(0xffe6c2, 8, 20, 2);
    uplightB.position.set(8, 0.6, 39);
    root.add(uplightB);

    return {
      wallRects,
      windows,
      siegeBreachEntries,
      slabs: {
        podium: podiumSegs.map((s) => ({ ...s, y0: 0, y1: GROUND_Y })),
        upperFloor: upperSegs.map((s) => ({ ...s, y0: UPPER_Y - 0.28, y1: UPPER_Y })),
        basementFloor: {
          x0: BASEMENT_ROOM.x0,
          x1: BASEMENT_ROOM.x1,
          z0: BASEMENT_ROOM.z0,
          z1: BASEMENT_ROOM.z1,
          y0: BASEMENT_Y - 0.3,
          y1: BASEMENT_Y,
        },
        roof: {
          x0: BUILDING.x0 - 0.4, x1: BUILDING.x1 + 0.4, z0: BUILDING.z0 - 0.4, z1: BUILDING.z1 + 0.4, y0: ROOF_Y0, y1: ROOF_Y1,
        },
      },
      bands: {
        south: { z0: zS0, z1: zS1 }, north: { z0: zN0, z1: zN1 }, west: { x0: xW0, x1: xW1 }, east: { x0: xE0, x1: xE1 },
      },
    };
  }
  const shellMeta = buildShell();
  /** One nullable resolver shared by every player-facing Mansion runtime.
   * Attackers already consume the individual entry surfaces through the
   * walkable-support ray cache; the player needs the same authored tops rather
   * than falling back to estate grade underneath the two raised podiums. */
  const siegeBreachGroundAt = (x, z) => {
    let y = null;
    for (const entry of shellMeta.siegeBreachEntries) {
      const entryY = entry.groundAt(x, z);
      if (entryY !== null) y = Math.max(y ?? -Infinity, entryY);
    }
    return y;
  };

  /* ---------------------------------------------------------------- */
  /* Pool patio (behind the mansion, z > 75)                            */
  /* ---------------------------------------------------------------- */
  /* THE POOL CHAIRS (owner playtest 2026-08-04: "Pool chairs need some
   * work"). They were two boxes: a slab and a tilted slab, floating with no
   * legs, no frame and no arms, and carrying a collider 0.8 x 2.0 m -- wider
   * and longer than the chair itself, so you were stopped by air.
   *
   * Rebuilt as an actual sun lounger: a welded chrome frame on feet, a
   * slatted deck, a raked back on its own hinge, arms, and a folded towel on
   * the ones nobody is using. The collider now matches the frame. */
  function buildLoungeChair(x, y, z, yaw, { towel = false, assemblyId = null } = {}) {
    const g = new THREE.Group();
    g.name = 'pool-lounger';
    if (assemblyId) {
      g.userData.geometryGate = { assemblyId };
    }
    const deckY = 0.42;
    // Frame rails and feet.
    for (const sx of [-0.32, 0.32]) {
      g.add(box({ size: [0.05, 0.05, 1.9], pos: [sx, deckY, 0], mat: M_CHROME }));
      for (const sz of [-0.78, 0.78]) {
        g.add(cylinder({ r: 0.022, h: deckY, pos: [sx, deckY / 2, sz], mat: M_CHROME }));
        g.add(cylinder({
          r: 0.05, h: 0.03, pos: [sx, 0.015, sz], mat: M_LAMP_POST,
        }));
      }
    }
    g.add(box({ size: [0.72, 0.04, 0.05], pos: [0, deckY, -0.95], mat: M_CHROME, cast: false }));
    g.add(box({ size: [0.72, 0.04, 0.05], pos: [0, deckY, 0.95], mat: M_CHROME, cast: false }));
    // Slatted deck.
    for (let i = 0; i < 10; i++) {
      g.add(box({
        size: [0.62, 0.045, 0.13],
        pos: [0, deckY + 0.045, -0.82 + i * 0.185],
        mat: M_LOUNGE,
        cast: false,
      }));
    }
    /* Raked back, hinged at the head end, with its own slats and a stay.
     *
     * THE RECLINE (owner playtest, verbatim): "pool chairs the back for your
     * head goes straight down. They should be slightly inclined up."
     *
     * Measured, and he is exactly right: the sign was inverted. Every slat
     * hangs off this hinge at local -z, and a rotation of THETA about +X sends
     * a point (0, 0, -d) to (0, d*sin(THETA), -d*cos(THETA)) -- so the -0.62
     * this was built with drove the head end 58 cm DOWN per metre of back
     * instead of up. The verifier's own box for the north-west lounger read
     * y[1.26,1.70] against a deck at 1.20: the top of the backrest finished
     * six centimetres off the boards, which is a lounger you lie on with your
     * head in the gutter.
     *
     * +0.62 rad is 35.5 degrees off the deck, which is the notch a real
     * lounger's ratchet sits in for reading -- reclined, not upright. Nothing
     * else about the frame moves; the hinge, the slats and the stay are the
     * ones that were already here.
     */
    const back = new THREE.Group();
    back.name = 'pool-lounger-back';
    back.position.set(0, deckY + 0.05, -0.9);
    back.rotation.x = 0.62;
    for (let i = 0; i < 5; i++) {
      back.add(box({
        size: [0.62, 0.045, 0.13], pos: [0, 0, -0.1 - i * 0.17], mat: M_LOUNGE, cast: false,
      }));
    }
    for (const sx of [-0.32, 0.32]) {
      back.add(box({ size: [0.05, 0.05, 0.9], pos: [sx, -0.01, -0.42], mat: M_CHROME }));
    }
    g.add(back);
    // Arms.
    for (const sx of [-0.37, 0.37]) {
      g.add(box({ size: [0.05, 0.05, 0.72], pos: [sx, deckY + 0.28, -0.32], mat: M_CHROME }));
      g.add(cylinder({ r: 0.02, h: 0.28, pos: [sx, deckY + 0.14, 0.02], mat: M_CHROME }));
    }
    if (towel) {
      g.add(box({
        size: [0.5, 0.07, 0.44], pos: [0, deckY + 0.11, 0.42], mat: M_TOWEL, cast: false,
      }));
      g.add(box({
        size: [0.5, 0.05, 0.34], pos: [0, deckY + 0.16, 0.36], mat: M_TOWEL, cast: false,
      }));
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const hx = (cos * 0.78 + sin * 1.96) / 2;
    const hz = (sin * 0.78 + cos * 1.96) / 2;
    const contact = solid(x - hx, x + hx, y, y + 0.55, z - hz, z + hz);
    if (assemblyId) {
      contact.name = `${assemblyId}-collider`;
      contact.userData = {
        ...(contact.userData ?? {}),
        geometryGate: { ...(contact.userData?.geometryGate ?? {}), assemblyId },
      };
    }
    return g;
  }

  /** A round poolside side table with a drink standing on it. */
  function buildPoolTable(x, y, z) {
    root.add(cylinder({ r: 0.03, h: 0.5, pos: [x, y + 0.25, z], mat: M_CHROME }));
    root.add(cylinder({ r: 0.2, h: 0.02, pos: [x, y + 0.04, z], mat: M_CHROME, cast: false }));
    root.add(cylinder({ r: 0.28, h: 0.04, pos: [x, y + 0.52, z], mat: M_DECK }));
    root.add(cylinder({
      rTop: 0.055, rBottom: 0.04, h: 0.16, pos: [x, y + 0.62, z], mat: M_POOL_GLASS,
    }));
    solid(x - 0.3, x + 0.3, y, y + 0.55, z - 0.3, z + 0.3);
  }

  // Deck-level tiki torches -- the patio used to be lit only at the water
  // itself (`poolLight`, below), so the surrounding deck/lounge chairs/pool
  // walls vanished into black a few metres out and it read as "a lit
  // rectangle of water in a void" rather than a patio. A handful of cheap
  // pole+flame+PointLight fixtures at deck level, in the same family-compound
  // material idiom as `lampPost()` (M_LAMP_POST pole, warm point light), fixes
  // that without touching the pool/water build above.
  const M_TORCH_CAP = mat({ color: 0x3a2a18, roughness: 0.75 });
  const torchFlames = [];
  function buildTikiTorch(x, z) {
    const poleH = 1.5;
    root.add(cylinder({
      r: 0.05, h: poleH, pos: [x, GROUND_Y + poleH / 2, z], mat: M_LAMP_POST,
    }));
    root.add(cylinder({
      rTop: 0.1, rBottom: 0.15, h: 0.16, pos: [x, GROUND_Y + poleH + 0.06, z], mat: M_TORCH_CAP,
    }));
    const flame = sphere({
      r: 0.1,
      pos: [x, GROUND_Y + poleH + 0.22, z],
      mat: mat({
        color: 0x000000, emissive: 0xff9a3c, emissiveIntensity: 2.0, roughness: 1, unique: true,
      }),
    });
    root.add(flame);
    const light = new THREE.PointLight(0xff9a44, 11, 15, 2);
    light.position.set(x, GROUND_Y + poleH + 0.24, z);
    root.add(light);
    solid(x - 0.1, x + 0.1, GROUND_Y, GROUND_Y + poleH, z - 0.1, z + 0.1);
    torchFlames.push({ flame, light, baseIntensity: 11, seed: Math.random() * 10 });
    return { flame, light };
  }

  function buildPoolPatio() {
    const pad = 6;
    const deckSegs = [
      [POOL.x0 - pad, POOL.x0, POOL.z0 - pad, POOL.z1 + pad],
      [POOL.x1, POOL.x1 + pad, POOL.z0 - pad, POOL.z1 + pad],
      [POOL.x0, POOL.x1, POOL.z0 - pad, POOL.z0],
      [POOL.x0, POOL.x1, POOL.z1, POOL.z1 + pad],
    ];
    for (const [deckSegmentIndex, [x0, x1, z0, z1]] of deckSegs.entries()) {
      root.add(geometryIntent(box({
        size: [x1 - x0, 0.1, z1 - z0],
        pos: [(x0 + x1) / 2, GROUND_Y - 0.05, (z0 + z1) / 2],
        mat: M_DECK,
        name: `pool-deck-segment-${deckSegmentIndex}`,
      }), { assemblyId: `mansion-pool-deck-segment-${deckSegmentIndex}`, checkWallEmbed: false }));
    }
    root.add(box({
      size: [POOL.x1 - POOL.x0, 0.1, POOL.z1 - POOL.z0],
      pos: [0, POOL.y - 0.05, 85],
      mat: M_POOL_LINER,
    }));
    const pw = 0.5;
    /* The pool is part of the evening hangout, not a painted blue obstacle.
     * Its south coping now opens onto six broad submerged treads. Their
     * rectangles and exact top heights are published below so the player
     * resolves the same surfaces that are rendered -- no invisible ramp and
     * no flat deck height floating over the water. */
    const entrySteps = {
      x0: -4.2,
      x1: -1.8,
      z0: POOL.z0 - pw,
      z1: POOL.z0 + 2.5,
      levels: [],
    };
    const entryLevelCount = 6;
    const entryDepth = (entrySteps.z1 - entrySteps.z0) / entryLevelCount;
    const poolEntryStepsAssemblyId = 'mansion-pool-entry-steps';
    for (let i = 0; i < entryLevelCount; i++) {
      const top = THREE.MathUtils.lerp(GROUND_Y, POOL.y, i / (entryLevelCount - 1));
      const z0 = entrySteps.z0 + i * entryDepth;
      const z1 = z0 + entryDepth;
      const base = POOL.y - 0.06;
      const level = {
        x0: entrySteps.x0, x1: entrySteps.x1, z0, z1, y: top,
      };
      entrySteps.levels.push(level);
      root.add(geometryIntent(box({
        size: [entrySteps.x1 - entrySteps.x0, top - base, entryDepth + 0.025],
        pos: [(entrySteps.x0 + entrySteps.x1) / 2, (base + top) / 2, (z0 + z1) / 2],
        mat: M_POOL_LINER,
        name: 'pool-entry-step',
      }), { assemblyId: poolEntryStepsAssemblyId, checkWallEmbed: false }));
    }
    const poolBasinAssemblyId = 'mansion-pool-basin-shell';
    const wallSegs = [
      [POOL.x0 - pw, POOL.x0, POOL.z0 - pw, POOL.z1 + pw],
      [POOL.x1, POOL.x1 + pw, POOL.z0 - pw, POOL.z1 + pw],
      [POOL.x0 - pw, entrySteps.x0, POOL.z0 - pw, POOL.z0],
      [entrySteps.x1, POOL.x1 + pw, POOL.z0 - pw, POOL.z0],
      [POOL.x0 - pw, POOL.x1 + pw, POOL.z1, POOL.z1 + pw],
    ];
    for (const [wallIndex, [x0, x1, z0, z1]] of wallSegs.entries()) {
      root.add(geometryIntent(box({
        size: [x1 - x0, GROUND_Y - POOL.y, z1 - z0],
        pos: [(x0 + x1) / 2, (GROUND_Y + POOL.y) / 2, (z0 + z1) / 2],
        mat: M_POOL_WALL,
        name: `mansion-pool-basin-wall-${wallIndex}`,
      }), { assemblyId: poolBasinAssemblyId, checkWallEmbed: false }));
      geometryIntent(solid(x0, x1, POOL.y, GROUND_Y, z0, z1), { assemblyId: poolBasinAssemblyId, checkWallEmbed: false });
    }
    /* THE GAP (owner playtest 2026-08-04: "Pool needs to be fitted to the
     * area its in (small gap)"). The water plane was built a metre smaller
     * than the pool in BOTH axes -- 13x7 in a 14x8 basin -- so half a metre
     * of bare liner showed all the way round the water line, which is exactly
     * a pool that does not fit its hole. It is now the basin's own size, held
     * 3 cm off each wall so the two surfaces do not z-fight. */
    const poolWaterY = POOL.y + 1.1;
    const poolWaterMat = makeWaterMaterial({ deep: 0x0a3a52, shallow: 0x2fa6c9 });
    const poolCx = (POOL.x0 + POOL.x1) / 2;
    const poolCz = (POOL.z0 + POOL.z1) / 2;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(POOL.x1 - POOL.x0 - 0.06, POOL.z1 - POOL.z0 - 0.06),
      poolWaterMat,
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(poolCx, poolWaterY, poolCz);
    root.add(water);
    waterMaterials.push(poolWaterMat);
    // Gilded coping course round the water line, the width of the wall head.
    for (const [cx0, cx1, cz0, cz1] of [
      [POOL.x0 - pw, entrySteps.x0, POOL.z0 - pw, POOL.z0],
      [entrySteps.x1, POOL.x1 + pw, POOL.z0 - pw, POOL.z0],
      [POOL.x0 - pw, POOL.x1 + pw, POOL.z1, POOL.z1 + pw],
      [POOL.x0 - pw, POOL.x0, POOL.z0, POOL.z1],
      [POOL.x1, POOL.x1 + pw, POOL.z0, POOL.z1],
    ]) {
      root.add(geometryIntent(box({
        size: [cx1 - cx0, 0.05, cz1 - cz0],
        pos: [(cx0 + cx1) / 2, GROUND_Y + 0.045, (cz0 + cz1) / 2],
        mat: M_GOLD,
        cast: false,
        name: 'pool-gold-coping',
      }), { assemblyId: poolBasinAssemblyId, checkWallEmbed: false }));
    }

    const poolLight = new THREE.PointLight(0x4ad9ff, 2.6, 30, 2);
    poolLight.position.set(poolCx, poolWaterY + 0.4, poolCz);
    root.add(poolLight);

    /* A little water fountain in the pool (owner playtest 2026-08-04). A
     * stone plinth standing on the basin floor at the north end, a bowl just
     * clear of the water, and the same FountainSpray the driveway fountain
     * uses -- one class, two fountains, rather than a second particle rig. */
    const featureZ = POOL.z1 - 1.9;
    const poolFeatureAssemblyId = 'mansion-pool-water-feature';
    root.add(geometryIntent(cylinder({
      r: 0.85, h: poolWaterY - POOL.y - 0.1, pos: [poolCx, (POOL.y + poolWaterY - 0.1) / 2, featureZ], mat: M_POOL_WALL,
    }), { assemblyId: poolFeatureAssemblyId }));
    root.add(geometryIntent(cylinder({
      r: 1.05, h: 0.12, pos: [poolCx, poolWaterY + 0.02, featureZ], mat: M_MARBLE_DK,
    }), { assemblyId: poolFeatureAssemblyId }));
    root.add(geometryIntent(cylinder({
      rTop: 0.42, rBottom: 0.3, h: 0.5, pos: [poolCx, poolWaterY + 0.33, featureZ], mat: M_MARBLE,
    }), { assemblyId: poolFeatureAssemblyId }));
    root.add(geometryIntent(cylinder({
      r: 0.82, h: 0.1, pos: [poolCx, poolWaterY + 0.62, featureZ], mat: M_GOLD,
    }), { assemblyId: poolFeatureAssemblyId }));
    const featureBowlMat = makeWaterMaterial({ deep: 0x0e4552, shallow: 0x36b6d2 });
    const featureBowl = new THREE.Mesh(new THREE.CircleGeometry(0.74, 28), featureBowlMat);
    geometryIntent(featureBowl, { assemblyId: poolFeatureAssemblyId });
    featureBowl.rotation.x = -Math.PI / 2;
    featureBowl.position.set(poolCx, poolWaterY + 0.68, featureZ);
    root.add(featureBowl);
    waterMaterials.push(featureBowlMat);
    const poolFoam = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.35, 40),
      mat({
        map: foamRingTexture(), transparent: true, opacity: 0.6, roughness: 0.55, side: THREE.DoubleSide, unique: true,
      }),
    );
    poolFoam.rotation.x = -Math.PI / 2;
    poolFoam.position.set(poolCx, poolWaterY + 0.02, featureZ);
    root.add(poolFoam);
    const poolSpray = new FountainSpray(
      root,
      new THREE.Vector3(poolCx, poolWaterY + 0.74, featureZ),
      { rise: 1.5, speedMin: 1.5, speedMax: 2.2, spread: 0.3 },
    );
    poolSpray.start();
    const featureLight = new THREE.PointLight(0x7fe4ff, 3.2, 9, 2);
    featureLight.position.set(poolCx, poolWaterY + 0.5, featureZ);
    root.add(featureLight);
    geometryIntent(solid(poolCx - 1.1, poolCx + 1.1, POOL.y, GROUND_Y, featureZ - 1.1, featureZ + 1.1), { assemblyId: poolFeatureAssemblyId });

    const chairs = [
      [-10.6, 79.4, Math.PI / 2, true], [-10.6, 82.6, Math.PI / 2, false],
      [-10.6, 85.8, Math.PI / 2, true], [-10.6, 89.0, Math.PI / 2, false],
      [10.6, 79.4, -Math.PI / 2, false], [10.6, 82.6, -Math.PI / 2, true],
      [10.6, 85.8, -Math.PI / 2, false], [10.6, 89.0, -Math.PI / 2, true],
    ].map(([x, z, yaw, towel], index) => buildLoungeChair(
      x, GROUND_Y, z, yaw, { towel, assemblyId: `mansion-pool-lounger-${index}` },
    ));
    for (const [tx, tz] of [[-10.6, 81.0], [-10.6, 87.4], [10.6, 81.0], [10.6, 87.4]]) {
      buildPoolTable(tx, GROUND_Y, tz);
    }
    // Parasols between the pairs, closed and standing in their bases.
    for (const [ux, uz] of [[-12.3, 84.2], [12.3, 84.2]]) {
      root.add(cylinder({ r: 0.28, h: 0.14, pos: [ux, GROUND_Y + 0.07, uz], mat: M_MARBLE_DK }));
      root.add(cylinder({ r: 0.045, h: 2.5, pos: [ux, GROUND_Y + 1.35, uz], mat: M_CHROME }));
      root.add(cylinder({
        rTop: 0.08, rBottom: 0.24, h: 1.3, pos: [ux, GROUND_Y + 2.15, uz], mat: M_LOUNGE,
      }));
      root.add(sphere({ r: 0.09, pos: [ux, GROUND_Y + 2.86, uz], mat: M_GOLD, cast: false }));
      solid(ux - 0.3, ux + 0.3, GROUND_Y, GROUND_Y + 2.6, uz - 0.3, uz + 0.3);
    }

    // Four deck-level tiki torches at the patio's corners -- clear of the
    // lounge-chair rows (z:80-89) and the pool itself, spread across the
    // full deck (x:-13..13, z:75..95) so the chairs/walls/deck boards
    // actually read at night instead of vanishing a few metres past the
    // water's own glow.
    /* Eight torches, not four, and closer in.
     *
     * Measured on the first render of this pass: with four at the corners of
     * a 26 x 20 m deck, each a range-13 point light, the middle twelve metres
     * of the terrace -- the loungers, the skirt, the coping, everything this
     * pass added -- rendered as black. A torch is a 13 m lamp, so the spacing
     * has to be under 13 m, and it was 17. They now run down both long sides
     * at 6 m centres, which lights the chairs they stand between. */
    const torches = [];
    for (const tz of [77.0, 83.0, 89.0, 94.0]) {
      torches.push(buildTikiTorch(-12.4, tz), buildTikiTorch(12.4, tz));
    }
    /* Four proper lamp standards down the pool's long sides.
     *
     * The intensities here are much higher than the driveway's, and that is
     * arithmetic rather than taste: these are `decay: 2` lights, so what a
     * surface receives falls off as 1/d^2, and the deck is 26 m by 20 m. A
     * torch at intensity 5.5 delivers about 0.03 at ten metres -- which is
     * why the first render of this terrace came back black everywhere the
     * water's own glow did not reach. At 24 over a 4 m throw these actually
     * light the chairs, the coping and the skirt. */
    /* z 80.6 / 89.4 rather than 79.4 / 90.6: at 79.4 the south-east standard
     * stood 60 cm off the poolside radio console and read, from the kitchen
     * door, as a black bar planted in front of it. */
    for (const [lampId, lx, lz] of [
      ['south-west', -8.9, 80.6],
      ['south-east', 8.9, 80.6],
      ['north-west', -8.9, 89.4],
      ['north-east', 8.9, 89.4],
    ]) {
      const lampAssemblyId = `mansion-pool-lamp-${lampId}`;
      const l = new THREE.PointLight(0xffd9a8, 24, 20, 2);
      l.position.set(lx, GROUND_Y + 3.0, lz);
      root.add(l);
      root.add(geometryIntent(cylinder({
        r: 0.06, h: 3.0, pos: [lx, GROUND_Y + 1.5, lz], mat: M_LAMP_POST,
      }), { assemblyId: lampAssemblyId }));
      root.add(geometryIntent(cylinder({
        rTop: 0.22, rBottom: 0.1, h: 0.2, pos: [lx, GROUND_Y + 3.16, lz], mat: M_LAMP_POST,
      }), { assemblyId: lampAssemblyId }));
      root.add(geometryIntent(sphere({
        r: 0.15,
        pos: [lx, GROUND_Y + 3.02, lz],
        mat: mat({ color: 0xffe6bc, roughness: 0.4, emissive: 0xffdca0, emissiveIntensity: 1.6 }),
      }), { assemblyId: lampAssemblyId }));
      const lampCollider = solid(
        lx - 0.12, lx + 0.12, GROUND_Y, GROUND_Y + 3.0, lz - 0.12, lz + 0.12,
      );
      lampCollider.name = `${lampAssemblyId}-collider`;
      geometryIntent(lampCollider, { assemblyId: lampAssemblyId });
    }

    /* Garden steps up onto the deck.
     *
     * This deck is a flat 1.2 m platform poured at GROUND_Y, and until now it
     * had no ramp, no steps and no door: on foot the patio was unreachable
     * from anywhere, which the composition root flagged as a known gap and
     * left alone. It now has both ends of a real route -- the kitchen's pool
     * door through the north wall (see POOL_DOOR in buildShell) and this run
     * of steps up from the west lawn, for anyone who walks round the outside
     * of the house instead. Six lerp-stepped treads, the same technique the
     * front entrance and the service ramp already use. */
    const stepsX0 = POOL.x0 - pad - 2.6;
    const stepsX1 = POOL.x0 - pad;
    const stepsZ0 = 83;
    const stepsZ1 = 87;
    const poolSteps = {
      id: 'west', x0: stepsX0, x1: stepsX1, z0: stepsZ0, z1: stepsZ1, surfaces: [],
    };
    const poolStepCount = 6;
    const poolStepRun = (stepsX1 - stepsX0) / poolStepCount;
    const poolWestStairAssemblyId = 'mansion-pool-west-entry-stair';
    for (let i = 0; i < poolStepCount; i++) {
      const x0 = stepsX0 + i * poolStepRun;
      const x1 = x0 + poolStepRun;
      const top = GROUND_Y * ((i + 1) / poolStepCount);
      const name = `pool-west-tread-${i}`;
      root.add(geometryIntent(box({
        size: [poolStepRun + 0.05, top, stepsZ1 - stepsZ0],
        pos: [(x0 + x1) / 2, top / 2, (stepsZ0 + stepsZ1) / 2],
        mat: M_DECK,
        name,
      }), { assemblyId: poolWestStairAssemblyId, checkWallEmbed: false, checkSupport: false, fixedSupportAnchor: true }));
      poolSteps.surfaces.push(Object.freeze({
        name,
        x0: x0 - 0.025,
        x1: x1 + 0.025,
        z0: stepsZ0,
        z1: stepsZ1,
        y: top,
      }));
    }
    poolSteps.surfaces = Object.freeze(poolSteps.surfaces);
    Object.freeze(poolSteps);
    for (const sz of [stepsZ0, stepsZ1]) {
      root.add(geometryIntent(box({
        size: [stepsX1 - stepsX0, GROUND_Y + 0.5, 0.22],
        pos: [(stepsX0 + stepsX1) / 2, (GROUND_Y + 0.5) / 2 - 0.4, sz],
        mat: M_POOL_WALL,
        name: `pool-west-entry-stair-cheek-${sz}`,
      }), { assemblyId: poolWestStairAssemblyId, checkWallEmbed: false, checkSupport: false, fixedSupportAnchor: true }));
      const cheekCollider = solid(stepsX0, stepsX1, 0, GROUND_Y + 0.1, sz - 0.13, sz + 0.13);
      cheekCollider.name = `pool-west-entry-stair-cheek-${sz}-collider`;
      geometryIntent(cheekCollider, { assemblyId: poolWestStairAssemblyId, checkWallEmbed: false, checkSupport: false, fixedSupportAnchor: true });
    }

    /* THE SKIRT (owner playtest 2026-08-04, verbatim):
     *
     *   "the pool deck is also raised which is nice but there needs to be a
     *    side wall around it so that you cant see under it"
     *
     * Correct: the deck was four 10 cm slabs floating at y=1.15 on nothing at
     * all, so from anywhere on the lawn you looked straight in under it and
     * out the other side. This closes the three open edges with a real
     * fascia, poured from grade to the deck surface, with a projecting
     * coping course over it so the deck reads as a raised terrace rather than
     * a plinth. The fourth edge (south) needs none: it is the house.
     *
     * The fascia collider stops 2 cm BELOW the deck surface on purpose.
     * core/player.js skips a collider only when your feet are strictly above
     * its top, so a skirt reaching the full 1.2 m would be an invisible wall
     * standing 35 cm in from the deck edge for anyone walking on the deck --
     * the exact class of fault this pass is fixing elsewhere. At 1.18 it is
     * skipped from above and still blocks anyone at grade.
     */
    const deckRect = {
      x0: POOL.x0 - pad, x1: POOL.x1 + pad, z0: POOL.z0 - pad, z1: POOL.z1 + pad,
    };
    /* THE GARDEN STAIRS off the deck's north edge.
     *
     * The formal garden behind the pool is at grade and the terrace is 1.2 m
     * over it, so the two have to be joined by something. A single flight on
     * the centre line was the obvious move and is the wrong one: the deck's
     * own verifier walks the centre line from BOTH sides -- north-to-south to
     * prove the fascia stops you getting in underneath the slab, and
     * south-to-north to prove the same fascia is not an invisible wall for
     * anyone on the deck. A stair at x=0 would make the first of those climb
     * the terrace instead of being stopped by it.
     *
     * So it is a PAIR of flights, off the centre, with the fascia continuous
     * between them -- which is also what a terrace this wide would actually
     * have. The centre line stays exactly as it was.
     */
    const gardenStairs = [
      { id: 'west', x0: -8.8, x1: -5.2, z0: deckRect.z1, z1: deckRect.z1 + 4.0, surfaces: [] },
      { id: 'east', x0: 5.2, x1: 8.8, z0: deckRect.z1, z1: deckRect.z1 + 4.0, surfaces: [] },
    ];
    for (const st of gardenStairs) {
      const treads = 8;
      const stairAssemblyId = `mansion-pool-garden-stair-${st.id}`;
      const treadRun = (st.z1 - st.z0) / treads;
      for (let i = 0; i < treads; i++) {
        const z0 = st.z0 + i * treadRun;
        const z1 = z0 + treadRun;
        const top = GROUND_Y * ((treads - i) / treads);
        const name = `garden-${st.id}-tread-${i}`;
        const treadHeight = top - GARDEN_WALK_TOP;
        root.add(geometryIntent(box({
          size: [st.x1 - st.x0, treadHeight, treadRun + 0.06],
          pos: [(st.x0 + st.x1) / 2, GARDEN_WALK_TOP + treadHeight / 2, (z0 + z1) / 2],
          mat: M_DECK,
          name,
        }), { assemblyId: stairAssemblyId }));
        st.surfaces.push(Object.freeze({
          name,
          x0: st.x0,
          x1: st.x1,
          z0: z0 - 0.03,
          z1: z1 + 0.03,
          y: top,
        }));
      }
      st.surfaces = Object.freeze(st.surfaces);
      // Raking cheek walls with a ball finial on each newel, both sides.
      for (const cx of [st.x0 - 0.22, st.x1 + 0.22]) {
        for (let i = 0; i < 8; i++) {
          const za = THREE.MathUtils.lerp(st.z0, st.z1, i / 8);
          const zb = THREE.MathUtils.lerp(st.z0, st.z1, (i + 1) / 8);
          const top = THREE.MathUtils.lerp(GROUND_Y, 0, i / 8) + 0.95;
          const cheekHeight = top - GARDEN_WALK_TOP;
          root.add(geometryIntent(box({
            size: [0.44, cheekHeight, zb - za],
            pos: [cx, GARDEN_WALK_TOP + cheekHeight / 2, (za + zb) / 2],
            mat: brickMaterial(0.5, cheekHeight),
          }), { assemblyId: stairAssemblyId }));
          root.add(geometryIntent(box({
            size: [0.56, 0.12, zb - za], pos: [cx, top + 0.06, (za + zb) / 2], mat: M_COPING, cast: false,
          }), { assemblyId: stairAssemblyId }));
          const cheekCollider = solid(
            cx - 0.24, cx + 0.24, GARDEN_WALK_TOP, top, za, zb,
          );
          cheekCollider.name = `garden-${st.id}-cheek-collider`;
          geometryIntent(cheekCollider, { assemblyId: stairAssemblyId });
        }
        root.add(geometryIntent(sphere({
          r: 0.24, pos: [cx, GROUND_Y + 1.2, st.z0 + 0.2], mat: M_COPING,
        }), { assemblyId: stairAssemblyId }));
        root.add(geometryIntent(sphere({
          r: 0.24, pos: [cx, 1.2, st.z1 - 0.2], mat: M_COPING,
        }), { assemblyId: stairAssemblyId }));
      }
    }

    const skirtT = 0.36;
    const skirtSegs = [
      // West, split either side of the garden-steps opening.
      [deckRect.x0, deckRect.x0 + skirtT, deckRect.z0, stepsZ0],
      [deckRect.x0, deckRect.x0 + skirtT, stepsZ1, deckRect.z1],
      // East, full run.
      [deckRect.x1 - skirtT, deckRect.x1, deckRect.z0, deckRect.z1],
      // North, in three: corner to the west flight, between the two flights
      // (the centre line, unchanged), and the east flight to the corner.
      [deckRect.x0, gardenStairs[0].x0 - 0.44, deckRect.z1 - skirtT, deckRect.z1],
      [gardenStairs[0].x1 + 0.44, gardenStairs[1].x0 - 0.44, deckRect.z1 - skirtT, deckRect.z1],
      [gardenStairs[1].x1 + 0.44, deckRect.x1, deckRect.z1 - skirtT, deckRect.z1],
    ];
    for (const [skirtIndex, [sx0, sx1, sz0, sz1]] of skirtSegs.entries()) {
      const skirtAssemblyId = `mansion-pool-deck-skirt-${skirtIndex}`;
      root.add(geometryIntent(box({
        size: [sx1 - sx0, GROUND_Y, sz1 - sz0],
        pos: [(sx0 + sx1) / 2, GROUND_Y / 2, (sz0 + sz1) / 2],
        mat: M_DECK_SKIRT,
        name: 'pool-deck-skirt',
      }), { assemblyId: skirtAssemblyId, checkWallEmbed: false }));
      const skirtCollider = solid(sx0, sx1, 0, GROUND_Y - 0.02, sz0, sz1);
      skirtCollider.name = `pool-deck-skirt-${skirtIndex}-collider`;
      geometryIntent(skirtCollider, { assemblyId: skirtAssemblyId, checkWallEmbed: false });
      // Projecting coping over the fascia head.
      const outX0 = sx0 === deckRect.x0 ? sx0 - 0.14 : sx0;
      const outX1 = sx1 === deckRect.x1 ? sx1 + 0.14 : sx1;
      const outZ1 = sz1 === deckRect.z1 ? sz1 + 0.14 : sz1;
      root.add(geometryIntent(box({
        size: [outX1 - outX0, 0.1, outZ1 - sz0],
        pos: [(outX0 + outX1) / 2, GROUND_Y - 0.05, (sz0 + outZ1) / 2],
        mat: M_MARBLE_DK,
        cast: false,
      }), { assemblyId: skirtAssemblyId, checkWallEmbed: false }));
    }
    // Cheek walls returning the skirt into the garden steps' own opening.
    for (const [cheekIndex, sz] of [stepsZ0, stepsZ1].entries()) {
      const assemblyId = `mansion-pool-deck-skirt-west-cheek-${cheekIndex}`;
      root.add(geometryIntent(box({
        size: [skirtT, GROUND_Y, 0.22],
        pos: [deckRect.x0 + skirtT / 2, GROUND_Y / 2, sz + (sz === stepsZ0 ? -0.11 : 0.11)],
        mat: M_DECK_SKIRT,
        cast: false,
        name: `pool-deck-skirt-west-cheek-${cheekIndex}`,
      }), { assemblyId, checkWallEmbed: false }));
    }

    /* The poolside radio (owner playtest 2026-08-04: "...and one out by the
     * pool"). A weatherproof set on its own console beside the kitchen door,
     * where the deck is walked past rather than sat on. It is a cabinet only:
     * the tuner is the house's one `core/radio.js` receiver, mounted by the
     * composition root -- see the note at the top of src/mansion/main.js. */
    const radioX = 8.6;
    const radioZ = 78.4;
    root.add(box({
      size: [0.9, 0.62, 0.5], pos: [radioX, GROUND_Y + 0.31, radioZ], mat: M_DECK, name: 'pool-radio-console',
    }));
    root.add(box({
      size: [0.98, 0.06, 0.58], pos: [radioX, GROUND_Y + 0.64, radioZ], mat: M_GOLD, cast: false,
    }));
    solid(radioX - 0.45, radioX + 0.45, GROUND_Y, GROUND_Y + 0.66, radioZ - 0.25, radioZ + 0.25);
    const poolRadioGroup = new THREE.Group();
    const setW = 0.56;
    const setH = 0.3;
    const setD = 0.22;
    poolRadioGroup.add(box({
      size: [setW, setH, setD], pos: [0, setH / 2, 0], mat: M_LAMP_POST, name: 'pool-radio-case',
    }));
    poolRadioGroup.add(box({
      size: [setW + 0.04, 0.035, setD + 0.04], pos: [0, setH, 0], mat: M_GOLD, cast: false,
    }));
    for (let i = 0; i < 6; i++) {
      poolRadioGroup.add(box({
        size: [0.018, setH * 0.5, 0.012], pos: [-setW * 0.26 + (i - 2.5) * 0.038, setH * 0.5, setD / 2 + 0.008], mat: M_CHROME, cast: false,
      }));
    }
    const poolDial = box({
      size: [setW * 0.3, setH * 0.3, 0.012],
      pos: [setW * 0.26, setH * 0.56, setD / 2 + 0.007],
      mat: mat({
        color: 0x24201a, emissive: 0xffb347, emissiveIntensity: 0, roughness: 0.5, unique: true,
      }),
      cast: false,
    });
    poolRadioGroup.add(poolDial);
    const poolPilot = sphere({
      r: 0.016,
      pos: [setW * 0.26, setH * 0.24, setD / 2 + 0.01],
      mat: mat({
        color: 0x3a2410, emissive: 0xff7a2a, emissiveIntensity: 0, roughness: 0.5, unique: true,
      }),
      cast: false,
    });
    poolRadioGroup.add(poolPilot);
    poolRadioGroup.add(cylinder({
      r: 0.008, h: 0.52, pos: [-setW / 2 + 0.05, setH + 0.26, -setD / 2 + 0.04], mat: M_CHROME, rotZ: 0.22,
    }));
    poolRadioGroup.position.set(radioX, GROUND_Y + 0.67, radioZ);
    poolRadioGroup.rotation.y = Math.PI + 0.35;
    root.add(poolRadioGroup);
    const poolRadio = {
      group: poolRadioGroup,
      speakerPos: new THREE.Vector3(radioX, GROUND_Y + 0.85, radioZ),
      setLit(on) {
        poolDial.material.emissiveIntensity = on ? 1.4 : 0;
        poolPilot.material.emissiveIntensity = on ? 2.0 : 0;
      },
    };

    /** A nullable floor resolver for the basin and its authored entry steps.
     * The composition root asks this before the surrounding deck, whose
     * rectangular footprint necessarily includes the pool's hole. */
    const groundAt = (x, z) => {
      for (const level of entrySteps.levels) {
        if (x >= level.x0 && x <= level.x1 && z >= level.z0 && z <= level.z1) return level.y;
      }
      if (x >= POOL.x0 && x <= POOL.x1 && z >= POOL.z0 && z <= POOL.z1) return POOL.y;
      let y = null;
      for (const surface of poolSteps.surfaces) {
        if (x < surface.x0 || x > surface.x1 || z < surface.z0 || z > surface.z1) continue;
        y = Math.max(y ?? -Infinity, surface.y);
      }
      for (const flight of gardenStairs) {
        for (const surface of flight.surfaces) {
          if (x < surface.x0 || x > surface.x1 || z < surface.z0 || z > surface.z1) continue;
          y = Math.max(y ?? -Infinity, surface.y);
        }
      }
      if (y !== null) return y;
      if (x >= deckRect.x0 && x <= deckRect.x1 && z >= deckRect.z0 && z <= deckRect.z1) return GROUND_Y;
      return null;
    };

    return {
      pool: POOL,
      waterY: poolWaterY,
      water,
      light: poolLight,
      chairs,
      torches,
      spray: poolSpray,
      radio: poolRadio,
      deck: deckRect,
      entrySteps,
      groundAt,
      steps: poolSteps,
      /** The two exact, grounded flights down off the north edge. */
      gardenStairs,
      skirt: skirtSegs.map(([sx0, sx1, sz0, sz1]) => ({
        x0: sx0, x1: sx1, z0: sz0, z1: sz1, y0: 0, y1: GROUND_Y,
      })),
    };
  }
  const poolPatio = buildPoolPatio();

  /* ================================================================== */
  /* THE REAR GARDEN                                                     */
  /*                                                                      */
  /* Owner brief, third pass, verbatim: "More fancy shit in the backyard",*/
  /* "A hedge maze garden", "fancy brick walls".                          */
  /*                                                                       */
  /* One axis, walled in brick, laid out the way a formal garden is: a     */
  /* cross walk along the terrace, a reflecting canal on the centre line   */
  /* with parterres either side, a hedge maze filling the west compartment */
  /* and a walled rose garden filling the east one, and a domed pavilion   */
  /* closing the axis at the far end.                                      */
  /*                                                                        */
  /* THE MAZE IS GENERATED, NOT DRAWN. A hand-drawn maze is a maze whose     */
  /* corridors are whatever the person drawing it typed, and the NO WAKE     */
  /* deck is what that costs. This one is carved on a grid by a seeded       */
  /* backtracker, so every corridor is exactly (cell - hedge) wide by         */
  /* construction -- 2.4 m, four times the player's own 0.6 m diameter --     */
  /* the walls are emitted as merged runs along grid lines and can therefore  */
  /* not pinch, and the solved route is exported so tools/verify-mansion.mjs  */
  /* can WALK it rather than take the geometry's word for it. The seed is     */
  /* fixed: the same maze every load, which is what makes walking it a test.  */
  /* ================================================================== */
  function buildRearGarden() {
    const lanterns = [];
    /** The canal's four jets, ticked from `update()` -- see part 3 below. */
    const canalJets = [];

    /* ---- 1. The brick estate wall. -------------------------------------
     * Runs from the ends of the iron street fence (which stops at z=90) round
     * the back of the property: west, north, east. Piers every 6 m, a moulded
     * brick plinth, a stone coping course and a ball finial on every pier --
     * the difference between a garden wall and a retaining wall. */
    const W = GARDEN_WALL;
    const estateWallAssemblyId = 'mansion-garden-estate-wall';
    function estatePier(px, pz, assemblyId) {
      root.add(geometryIntent(box({
        size: [0.95, W.h + 0.5, 0.95], pos: [px, (W.h + 0.5) / 2, pz], mat: brickMaterial(1, W.h),
      }), { assemblyId }));
      root.add(geometryIntent(box({
        size: [1.15, 0.16, 1.15], pos: [px, W.h + 0.58, pz], mat: M_COPING, cast: false,
      }), { assemblyId }));
      root.add(geometryIntent(sphere({ r: 0.3, pos: [px, W.h + 0.86, pz], mat: M_COPING }), { assemblyId }));
      const contact = solid(px - 0.5, px + 0.5, 0, W.h + 0.5, pz - 0.5, pz + 0.5);
      contact.name = `${assemblyId}-pier-collider`;
      geometryIntent(contact, { assemblyId });
    }
    function estateRun(axis, at, from, to, tag) {
      const len = to - from;
      const mid = (from + to) / 2;
      const assemblyId = estateWallAssemblyId;
      const put = (t, y0, y1, material, cast = true) => {
        root.add(geometryIntent(box({
          size: axis === 'z' ? [len, y1 - y0, t] : [t, y1 - y0, len],
          pos: axis === 'z' ? [mid, (y0 + y1) / 2, at] : [at, (y0 + y1) / 2, mid],
          mat: material,
          cast,
        }), { assemblyId }));
      };
      put(W.t, 0, W.h, brickMaterial(len, W.h));
      put(W.t + 0.16, 0, 0.42, brickMaterial(len, 0.6), false);   // plinth
      put(W.t + 0.2, W.h, W.h + 0.14, M_COPING, false);           // coping
      const runContact = axis === 'z'
        ? solid(from, to, 0, W.h, at - W.t / 2, at + W.t / 2)
        : solid(at - W.t / 2, at + W.t / 2, 0, W.h, from, to);
      runContact.name = `${assemblyId}-collider`;
      geometryIntent(runContact, { assemblyId });
      /* Shared north corners are authored once below at the intersection of
       * the two wall centre-lines. The former endpoint loops emitted two
       * almost-coincident piers at each corner, offset by 30 cm. */
      const pierStart = tag === 'north' ? from + 6 : from;
      const pierEnd = to - 6;
      for (let p = pierStart; p <= pierEnd + 0.01; p += 6) {
        const px = axis === 'z' ? p : at;
        const pz = axis === 'z' ? at : p;
        estatePier(px, pz, assemblyId);
      }
    }
    estateRun('x', W.x0 + W.t / 2, W.z0, W.z1, 'west');
    estateRun('x', W.x1 - W.t / 2, W.z0, W.z1, 'east');
    estateRun('z', W.z1 - W.t / 2, W.x0, W.x1, 'north');
    estatePier(W.x0 + W.t / 2, W.z1 - W.t / 2, estateWallAssemblyId);
    estatePier(W.x1 - W.t / 2, W.z1 - W.t / 2, estateWallAssemblyId);

    /* ---- 2. Gravel walks. The cross walk runs the width of the garden
     * under the terrace; the axis walk runs from it to the pavilion. Flat
     * and un-collided, so none of this is ever an invisible wall. */
    /* The axis walk is cut around the canal rather than laid across it -- the
     * first version paved straight over the water, and from the terrace the
     * whole rill simply was not there. */
    const K = CANAL.x1 + CANAL.kerb;
    for (const [gx0, gx1, gz0, gz1] of [
      [GARDEN.x0, GARDEN.x1, 96.4, 99.6],
      [-3.6, 3.6, 99.6, CANAL.z0 - CANAL.kerb - 0.15],
      [-3.6, 3.6, CANAL.z1 + CANAL.kerb + 0.15, 117.4],
      [-3.6, -K, CANAL.z0 - CANAL.kerb - 0.15, CANAL.z1 + CANAL.kerb + 0.15],
      [K, 3.6, CANAL.z0 - CANAL.kerb - 0.15, CANAL.z1 + CANAL.kerb + 0.15],
      [MAZE.x1 + 0.6, ROSE_GARDEN.x0 - 0.6, 122.0, 124.6],
    ]) {
      root.add(box({
        size: [gx1 - gx0, GARDEN_WALK_TOP, gz1 - gz0],
        pos: [(gx0 + gx1) / 2, GARDEN_WALK_TOP / 2, (gz0 + gz1) / 2],
        mat: M_GRAVEL,
        cast: false,
      }));
    }

    /* ---- 3. The reflecting canal, on the axis. Same water shader the
     * fountain and the pool use -- one factory, three pieces of water. */
    const canalMat = makeWaterMaterial({ deep: 0x08202e, shallow: 0x1d5f74, opacity: 0.9 });
    const canalWater = new THREE.Mesh(
      new THREE.PlaneGeometry(CANAL.x1 - CANAL.x0 - 0.06, CANAL.z1 - CANAL.z0 - 0.06),
      canalMat,
    );
    canalWater.rotation.x = -Math.PI / 2;
    canalWater.position.set((CANAL.x0 + CANAL.x1) / 2, CANAL.y + 0.42, (CANAL.z0 + CANAL.z1) / 2);
    root.add(canalWater);
    waterMaterials.push(canalMat);
    root.add(box({
      size: [CANAL.x1 - CANAL.x0, 0.1, CANAL.z1 - CANAL.z0],
      pos: [(CANAL.x0 + CANAL.x1) / 2, CANAL.y - 0.05, (CANAL.z0 + CANAL.z1) / 2],
      mat: M_POOL_LINER,
      cast: false,
    }));
    /* Coping kerb all the way round, standing 35 cm proud of the lawn so the
     * rill reads as a cut in the ground rather than a puddle, with a collider
     * so nobody paddles. */
    for (const [kx0, kx1, kz0, kz1] of [
      [CANAL.x0 - CANAL.kerb, CANAL.x1 + CANAL.kerb, CANAL.z0 - CANAL.kerb, CANAL.z0],
      [CANAL.x0 - CANAL.kerb, CANAL.x1 + CANAL.kerb, CANAL.z1, CANAL.z1 + CANAL.kerb],
      [CANAL.x0 - CANAL.kerb, CANAL.x0, CANAL.z0, CANAL.z1],
      [CANAL.x1, CANAL.x1 + CANAL.kerb, CANAL.z0, CANAL.z1],
    ]) {
      root.add(box({
        size: [kx1 - kx0, 0.9, kz1 - kz0],
        pos: [(kx0 + kx1) / 2, CANAL.y + 0.45, (kz0 + kz1) / 2],
        mat: M_COPING,
      }));
      solid(kx0, kx1, 0, 0.36, kz0, kz1);
    }
    /* Four jets standing in it, and the light that makes the water read.
     *
     * THE JETS NOW RUN (owner playtest 2026-08-04, verbatim): "Lets make the
     * jets in that still pool work in the back by the giant squatch."
     *
     * They were four nozzles and nothing else: a plinth, a stem and a glass
     * bead on top, with no water coming out of any of them. The two fountains
     * on the other side of the house already have the machinery for this --
     * `FountainSpray`, the Points-cloud-plus-scrolling-jet-column rig at the
     * top of this file, ticked once a frame from `update(dt)` the same way the
     * driveway monument's and the pool feature's are. So this is that class a
     * third time rather than a second particle system: one per nozzle, sized
     * DOWN for a 3.2 m rill (rise 1.05 m, not the driveway's 2.6 -- a jet
     * tuned for a 3.7 m statue in this thing would throw water over the kerb
     * and onto the walk), plus a foam ring on the water at each nozzle so the
     * fall reads as an impact and not as drops vanishing into glass.
     *
     * The sprays are returned to the caller and ticked in `update()`; a spray
     * that is never updated is exactly what these four were.
     */
    const canalWaterY = CANAL.y + 0.42;
    for (const jz of [CANAL.z0 + 2.0, CANAL.z0 + 5.6, CANAL.z1 - 5.6, CANAL.z1 - 2.0]) {
      root.add(named(cylinder({
        r: 0.26, h: 0.5, pos: [0, CANAL.y + 0.25, jz], mat: M_MARBLE_DK,
      }), 'canal-jet-plinth'));
      root.add(named(cylinder({
        r: 0.06, h: 0.9, pos: [0, CANAL.y + 0.85, jz], mat: M_CHROME,
      }), 'canal-jet-stem'));
      root.add(named(sphere({
        r: 0.1,
        pos: [0, CANAL.y + 1.3, jz],
        mat: mat({ color: 0x9fdcea, roughness: 0.2, transparent: true, opacity: 0.7 }),
        cast: false,
      }), 'canal-jet-nozzle'));
      const foam = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 0.72, 28),
        mat({
          map: foamRingTexture(), transparent: true, opacity: 0.5, roughness: 0.55, side: THREE.DoubleSide, unique: true,
        }),
      );
      foam.name = 'canal-jet-foam';
      foam.rotation.x = -Math.PI / 2;
      foam.position.set(0, canalWaterY + 0.015, jz);
      root.add(foam);
      const jet = new FountainSpray(
        root,
        new THREE.Vector3(0, CANAL.y + 1.38, jz),
        {
          rise: 1.05, speedMin: 1.2, speedMax: 1.8, spread: 0.24, drops: 80, size: 0.16,
        },
      );
      jet.start();
      canalJets.push(jet);
    }
    const canalLight = new THREE.PointLight(0x63cde8, 9, 18, 2);
    canalLight.position.set(0, CANAL.y + 1.4, (CANAL.z0 + CANAL.z1) / 2);
    root.add(canalLight);
    lanterns.push(canalLight);

    /* ---- 4. Parterre beds either side of the canal, brick-edged. */
    for (const side of [-1, 1]) {
      const px0 = side < 0 ? -8.2 : 4.6;
      const px1 = side < 0 ? -4.6 : 8.2;
      for (const [bz0, bz1] of [[103.4, 108.4], [109.6, 114.6]]) {
        // The bed owns soil and edging as one installation. The former extra
        // brick loop duplicated the complete perimeter by 16 cm.
        const edgeMaterial = brickMaterial(Math.max(px1 - px0, bz1 - bz0), 0.4);
        bed(px0, px1, bz0, bz1, 0, edgeMaterial, 0.34);
        plantBed(px0 + 0.4, px1 - 0.4, bz0 + 0.4, bz1 - 0.4, 1.3);
        // A clipped cone at each bed's centre, the way a parterre is punctuated.
        const ccx = (px0 + px1) / 2;
        const ccz = (bz0 + bz1) / 2;
        root.add(cylinder({
          rTop: 0.04, rBottom: 0.5, h: 1.8, pos: [ccx, 0.95, ccz], mat: M_YEW,
        }));
        solid(ccx - 0.45, ccx + 0.45, 0, 1.8, ccz - 0.45, ccz + 0.45);
      }
    }

    /* ---- 5. THE HEDGE MAZE. --------------------------------------------- */
    const maze = buildHedgeMaze();

    /* ---- 6. The walled rose garden, east compartment. */
    const R = ROSE_GARDEN;
    /* Six-inch walkthrough correction: 2.60 + 0.16 = 2.76 m. */
    const GATE_W = 2.76;
    const gateZ = (R.z0 + R.z1) / 2;
    // West wall (facing the axis), broken by a moon-gate arch.
    for (const [runIndex, [wz0, wz1]] of [[R.z0, gateZ - GATE_W / 2], [gateZ + GATE_W / 2, R.z1]].entries()) {
      const assemblyId = `mansion-rose-wall-west-${runIndex}`;
      root.add(geometryIntent(box({
        size: [R.t, R.wall, wz1 - wz0],
        pos: [R.x0, R.wall / 2, (wz0 + wz1) / 2],
        mat: brickMaterial(R.t, R.wall),
        name: `rose-wall-west-${runIndex}-body`,
      }), { assemblyId }));
      root.add(geometryIntent(box({
        size: [R.t + 0.18, 0.12, wz1 - wz0], pos: [R.x0, R.wall + 0.06, (wz0 + wz1) / 2], mat: M_COPING, cast: false,
        name: `rose-wall-west-${runIndex}-coping`,
      }), { assemblyId }));
      const runCollider = solid(R.x0 - R.t / 2, R.x0 + R.t / 2, 0, R.wall, wz0, wz1);
      runCollider.name = `rose-wall-west-${runIndex}-collider`;
      geometryIntent(runCollider, { assemblyId });
    }
    /* The opening is a freestanding half-torus moon gate. A previous repair
     * added a rectangular brick head and a second coping course above it;
     * that made the entrance read as wall-on-wall and narrowed its silhouette.
     * Keep the flanking wall supported, but let the arch itself be the entry. */
    {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(GATE_W / 2, R.t / 2, 8, 22, Math.PI),
        brickMaterial(4, 1),
      );
      arch.name = 'rose-garden-entry-arch';
      arch.position.set(R.x0, R.wall - 0.5, gateZ);
      arch.rotation.y = Math.PI / 2;
      geometryIntent(arch, { assemblyId: 'mansion-rose-garden-entry-arch', checkWallEmbed: false, checkSupport: false, fixedSupportAnchor: true });
      root.add(arch);
      /* The torus is the entrance. The former rectangular head and coping
       * boxed it into another wall above the wall and defeated the moon-gate
       * silhouette the arch was meant to provide. */
      const gateLamp = new THREE.PointLight(0xffca7a, 6, 12, 2);
      gateLamp.position.set(R.x0 - 0.9, 2.5, gateZ);
      root.add(gateLamp);
      lanterns.push(gateLamp);
    }
    // South, north and east walls, unbroken except a service gap at the south
    // east corner so the compartment is never a single-exit trap.
    for (const [runId, wx0, wx1, wz0, wz1] of [
      ['south', R.x0, R.x1 - 3.2, R.z0 - R.t / 2, R.z0 + R.t / 2],
      ['north', R.x0, R.x1, R.z1 - R.t / 2, R.z1 + R.t / 2],
    ]) {
      const assemblyId = `mansion-rose-wall-${runId}`;
      root.add(geometryIntent(box({
        size: [wx1 - wx0, R.wall, wz1 - wz0], pos: [(wx0 + wx1) / 2, R.wall / 2, (wz0 + wz1) / 2], mat: brickMaterial(wx1 - wx0, R.wall),
        name: `rose-wall-${runId}-body`,
      }), { assemblyId }));
      root.add(geometryIntent(box({
        size: [wx1 - wx0, 0.12, wz1 - wz0 + 0.18], pos: [(wx0 + wx1) / 2, R.wall + 0.06, (wz0 + wz1) / 2], mat: M_COPING, cast: false,
        name: `rose-wall-${runId}-coping`,
      }), { assemblyId }));
      const runCollider = solid(wx0, wx1, 0, R.wall, wz0, wz1);
      runCollider.name = `rose-wall-${runId}-collider`;
      geometryIntent(runCollider, { assemblyId });
    }
    const eastAssemblyId = 'mansion-rose-wall-east';
    root.add(geometryIntent(box({
      size: [R.t, R.wall, R.z1 - R.z0], pos: [R.x1, R.wall / 2, (R.z0 + R.z1) / 2], mat: brickMaterial(R.t, R.wall),
      name: 'rose-wall-east-body',
    }), { assemblyId: eastAssemblyId }));
    const eastCollider = solid(R.x1 - R.t / 2, R.x1 + R.t / 2, 0, R.wall, R.z0, R.z1);
    eastCollider.name = 'rose-wall-east-collider';
    geometryIntent(eastCollider, { assemblyId: eastAssemblyId });
    // Inside: a circular rose parterre round a sundial, box edging, an iron
    // arbour over the cross path, and benches on the two long sides.
    const rcx = (R.x0 + R.x1) / 2;
    const rcz = (R.z0 + R.z1) / 2;
    /* THE FLOWER IN THE WALKWAY (owner playtest 2026-08-04, verbatim):
     *
     *   "Outside in the brick garden area theres one flower in the walkway of
     *    the arches"
     *
     * One, and this ring is where it came from. Sixteen stations at an even
     * 22.5 degrees put one of them dead on the ring's west point -- measured
     * at (12.80, 111.00), which is the centre line of the walk in from the
     * moon gate, between the fourth and fifth hoops of the iron arbour. Nor
     * was it a low clump: that station's index was even, so it carried a
     * STANDARD rose on a clear stem, measured y[1.36,2.04] and 84 cm across,
     * planted in the middle of the only way into this garden.
     *
     * Still sixteen stations, still on the same 4.4 m circle, but dealt round
     * it with a GAP where the walk crosses. The gap is 2*asin(2/4.4) of arc,
     * which is exactly the width that holds every station at least 2 m off the
     * centre line -- clear of the arbour's own 1.35 m hoops with 65 cm to
     * spare. The two nearest stations land at z = 111 +/- 2.63 and frame the
     * walk instead of blocking it, which is what a parterre with a path
     * through it is supposed to look like.
     */
    const WALK_GAP = 2 * Math.asin(2.0 / 4.4);
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + WALK_GAP / 2 + ((i + 0.5) * (Math.PI * 2 - WALK_GAP)) / 16;
      const bx = rcx + Math.cos(a) * 4.4;
      const bz = rcz + Math.sin(a) * 4.4;
      const rosePlanter = cylinder({
        rTop: 0.34, rBottom: 0.28, h: 0.34, pos: [bx, 0.17, bz], mat: brickMaterial(0.8, 0.4), cast: false,
        name: 'mansion-rose-parterre-planter',
      });
      rosePlanter.userData.geometryGate = { fixedSupportAnchor: true };
      root.add(rosePlanter);
      bloomClump(bx, bz, 0.34, 1.35);
      /* Standard roses on clear stems, alternating with the low clumps --
       * counted OUTWARD FROM THE WALK on each side rather than off the raw
       * index, so the two halves of the ring mirror each other across the
       * garden's axis instead of running one station out of step. */
      const fromWalk = i < 8 ? i : 15 - i;
      if (fromWalk % 2 === 0) {
        const standardRose = group('mansion-standard-rose');
        standardRose.userData.geometryGate = { overlap: false };
        standardRose.position.set(bx, 0, bz);
        standardRose.add(cylinder({ r: 0.045, h: 1.2, pos: [0, 0.94, 0], mat: M_TEAK }));
        standardRose.add(sphere({ r: 0.42, ry: 0.34, pos: [0, 1.7, 0], mat: M_FOLIAGE, cast: false }));
        for (let k = 0; k < 5; k++) {
          const ka = (k / 5) * Math.PI * 2;
          standardRose.add(sphere({
            r: 0.085,
            pos: [Math.cos(ka) * 0.28, 1.78, Math.sin(ka) * 0.28],
            mat: BLOOM_MATS[(fromWalk + k) % BLOOM_MATS.length],
            cast: false,
          }));
        }
        root.add(standardRose);
      }
    }
    root.add(cylinder({ r: 1.5, h: 0.28, pos: [rcx, 0.14, rcz], mat: M_COPING, cast: false }));
    root.add(cylinder({ rTop: 0.28, rBottom: 0.42, h: 1.0, pos: [rcx, 0.78, rcz], mat: M_MARBLE_DK }));
    root.add(cylinder({ r: 0.46, h: 0.07, pos: [rcx, 1.31, rcz], mat: M_BRONZE }));
    root.add(box({
      size: [0.05, 0.4, 0.42], pos: [rcx, 1.5, rcz], mat: M_BRONZE, rotX: -0.7, name: 'sundial-gnomon',
    }));
    solid(rcx - 0.5, rcx + 0.5, 0, 1.35, rcz - 0.5, rcz + 0.5);
    for (const bz of [R.z0 + 3.0, R.z1 - 3.0]) {
      root.add(box({ size: [1.9, 0.1, 0.5], pos: [rcx, 0.48, bz], mat: M_TEAK }));
      root.add(box({
        size: [1.9, 0.56, 0.1], pos: [rcx, 0.76, bz - 0.22], mat: M_TEAK, rotX: 0.14,
      }));
      for (const lx of [-0.8, 0.8]) {
        root.add(box({ size: [0.1, 0.46, 0.44], pos: [rcx + lx, 0.23, bz], mat: M_IRON }));
      }
      solid(rcx - 1.0, rcx + 1.0, 0, 0.95, bz - 0.32, bz + 0.32);
    }
    // Iron arbour over the walk in from the moon gate.
    for (let i = 0; i <= 4; i++) {
      const ax = R.x0 + 0.9 + i * 0.9;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.035, 6, 18, Math.PI), M_IRON);
      hoop.position.set(ax, 1.2, gateZ);
      hoop.rotation.y = Math.PI / 2;
      root.add(hoop);
      for (const s of [-1, 1]) {
        root.add(cylinder({ r: 0.035, h: 1.2, pos: [ax, 0.6, gateZ + s * 1.35], mat: M_IRON }));
      }
    }
    const roseLight = new THREE.PointLight(0xffdca0, 14, 16, 2);
    roseLight.position.set(rcx, 3.1, rcz);
    root.add(roseLight);
    lanterns.push(roseLight);

    /* ---- 7. The pavilion that closes the axis.
     *
     * The apron is r+0.65 rather than the r+0.9 it was built at, and that is
     * measured rather than taste: at 5.1 m the disc reached z=125.50 and the
     * garden's own north wall stands at z:125.40..126.00 with its brick plinth
     * projecting to 125.32 -- so the pavilion's bottom step ran 18 cm into the
     * back wall of the garden. At r+0.65 = 4.85 it stops at 125.25, a clear
     * 7 cm short of the plinth, and the columns (r=4.2, base flare 4.48) still
     * stand well inside the step above it. */
    const P = PAVILION;
    root.add(cylinder({ r: P.r + 0.65, h: 0.42, pos: [P.x, 0.21, P.z], mat: M_COPING, cast: false }));
    root.add(cylinder({ r: P.r + 0.4, h: 0.2, pos: [P.x, 0.52, P.z], mat: M_MARBLE, cast: false }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const cx = P.x + Math.cos(a) * P.r;
      const cz = P.z + Math.sin(a) * P.r;
      const assemblyId = `mansion-garden-pavilion-column-${i}`;
      root.add(geometryIntent(cylinder({
        r: 0.16, h: 3.4, pos: [cx, 2.32, cz], mat: M_MARBLE, name: 'garden-pavilion-column-shaft',
      }), { assemblyId }));
      root.add(geometryIntent(cylinder({ rTop: 0.28, rBottom: 0.2, h: 0.24, pos: [cx, 4.14, cz], mat: M_MARBLE, cast: false }), { assemblyId }));
      root.add(geometryIntent(cylinder({ rTop: 0.2, rBottom: 0.28, h: 0.2, pos: [cx, 0.72, cz], mat: M_MARBLE, cast: false }), { assemblyId }));
      const columnCollider = solid(cx - 0.2, cx + 0.2, 0, 3.4, cz - 0.2, cz + 0.2);
      columnCollider.name = `garden-pavilion-column-${i}-collider`;
      geometryIntent(columnCollider, { assemblyId });
    }
    root.add(cylinder({ r: P.r + 0.6, h: 0.34, pos: [P.x, 4.43, P.z], mat: M_MARBLE_DK, cast: false }));
    const pavilionRoofAssemblyId = 'mansion-garden-pavilion-roof';
    root.add(geometryIntent(cylinder({ r: P.r + 0.75, h: 0.14, pos: [P.x, 4.66, P.z], mat: M_GOLD, cast: false }), {
      assemblyId: pavilionRoofAssemblyId,
    }));
    {
      const dome = geometryIntent(new THREE.Mesh(
        new THREE.SphereGeometry(P.r + 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        M_ROOF,
      ), { assemblyId: pavilionRoofAssemblyId });
      dome.name = 'garden-pavilion-dome';
      dome.position.set(P.x, 4.7, P.z);
      dome.castShadow = true;
      root.add(dome);
      root.add(geometryIntent(cylinder({ r: 0.26, h: 0.7, pos: [P.x, 9.2, P.z], mat: M_GOLD }), {
        assemblyId: pavilionRoofAssemblyId,
      }));
      root.add(geometryIntent(sphere({ r: 0.38, pos: [P.x, 9.75, P.z], mat: M_GOLD }), {
        assemblyId: pavilionRoofAssemblyId,
      }));
    }
    // The bronze under the dome: the family's own mark, at the end of the walk.
    const pavilionBronzeAssemblyId = 'mansion-garden-pavilion-bronze';
    const bronze = geometryIntent(new THREE.Group(), { assemblyId: pavilionBronzeAssemblyId });
    bronze.add(cylinder({ r: 0.95, h: 0.7, pos: [0, 0.35, 0], mat: M_MARBLE_DK }));
    bronze.add(box({ size: [1.7, 0.14, 1.7], pos: [0, 0.77, 0], mat: M_GOLD, cast: false }));
    /* The same rig the fountain's monument uses, cast in bronze instead of
     * silver -- one model, two statues, rather than a second sculpt. Arms
     * folded rather than raised: the one out front is the victory pose, and
     * this one is the one that waits at the end of the walk. */
    const bronzeRig = new Sasquatch();
    bronzeRig.group.traverse((o) => {
      if (!o.isMesh) return;
      o.material = M_BRONZE_STATUE;
      o.castShadow = true;
    });
    bronzeRig.armL.rotation.z = -0.55;
    bronzeRig.armL.rotation.x = -0.95;
    bronzeRig.armR.rotation.z = 0.55;
    bronzeRig.armR.rotation.x = -0.95;
    bronzeRig.head.rotation.x = 0.08;
    bronzeRig.group.scale.setScalar(0.62);
    bronzeRig.group.position.set(0, 0.84, 0);
    bronzeRig.group.rotation.y = Math.PI;
    bronze.add(bronzeRig.group);
    bronze.position.set(P.x, 0.62, P.z);
    root.add(bronze);
    const bronzeCollider = solid(P.x - 1.0, P.x + 1.0, 0, 3.2, P.z - 1.0, P.z + 1.0);
    bronzeCollider.name = 'garden-pavilion-bronze-collider';
    geometryIntent(bronzeCollider, { assemblyId: pavilionBronzeAssemblyId });
    const pavLight = new THREE.PointLight(0xffd9a8, 22, 20, 2);
    pavLight.position.set(P.x, 4.0, P.z);
    root.add(pavLight);
    lanterns.push(pavLight);
    for (const s of [-1, 1]) {
      const l = new THREE.PointLight(0xffe6c2, 7, 11, 2);
      l.position.set(P.x + s * 2.4, 0.5, P.z - 3.2);
      root.add(l);
      lanterns.push(l);
    }

    /* ---- 8. Lamp standards down the axis and the cross walk, so the
     * garden is a place at night rather than a black rectangle. */
    /* A standard on the garden walks.
     *
     * THE LANTERN IS GLAZED, NOT SOLID. It was one opaque 0.44 m box centred
     * at y=3.12, i.e. spanning 2.87..3.37 -- and the emissive globe it is
     * supposed to show is r=0.17 at y=3.10, so the globe was entirely INSIDE
     * the box. Measured, not guessed. Every one of these twelve standards read
     * at night as a black block with light arriving from nowhere. Same
     * outline, same height, built as a lantern: a base plate on the post head,
     * four corner bars and a cap, with the lit globe visible between them. */
    const M_LANTERN_CASE = mat({ color: 0x2a2a2e, roughness: 0.6 });
    function gardenLamp(x, z) {
      const assemblyId = `mansion-garden-lamp:${x}:${z}`;
      const mount = (object) => root.add(geometryIntent(object, { assemblyId }));
      mount(named(cylinder({ r: 0.09, h: 2.9, pos: [x, 1.45, z], mat: M_IRON }), 'garden-lamp-post'));
      for (const py of [2.895, 3.345]) {
        mount(box({
          size: [0.44, 0.05, 0.44], pos: [x, py, z], mat: M_LANTERN_CASE, name: 'garden-lamp-case',
        }));
      }
      for (const [bx, bz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        mount(box({
          size: [0.04, 0.4, 0.04], pos: [x + bx, 3.12, z + bz], mat: M_LANTERN_CASE, cast: false, name: 'garden-lamp-case',
        }));
      }
      mount(named(sphere({
        r: 0.17,
        pos: [x, 3.1, z],
        mat: mat({ color: 0xffe6bc, roughness: 0.4, emissive: 0xffdca0, emissiveIntensity: 1.7 }),
        cast: false,
      }), 'garden-lamp-globe'));
      mount(named(cylinder({
        rTop: 0.02, rBottom: 0.26, h: 0.3, pos: [x, 3.5, z], mat: M_IRON, cast: false,
      }), 'garden-lamp-finial'));
      const l = new THREE.PointLight(0xffd2a0, 16, 15, 2);
      l.position.set(x, 3.1, z);
      root.add(l);
      lanterns.push(l);
      geometryIntent(solid(x - 0.14, x + 0.14, 0, 2.9, z - 0.14, z + 0.14), { assemblyId });
    }
    // Clear of the maze's mouth (which sits on this walk) and of the rose
    // garden's gate, both of which are approached across it.
    for (const lx of [-27.0, -21.0, -12.4, 12.4, 21.0, 27.0]) gardenLamp(lx, 97.4);
    /* THE LAMP POSTS BY THE BIG SQUATCH (owner playtest 2026-08-04, verbatim):
     *
     *   "Look at the lamp posts by the big squatch in the back and make sure
     *    each is palced correctly and unimpeded."
     *
     * Six standards flank the axis walk that ends at the bronze under the
     * pavilion. Walked and then measured, two of the three pairs were standing
     * in something:
     *
     *   z=110.0 -> 109.0. The post's own box is x[4.51,4.69] and the east
     *     parterre's brick edging runs x[4.36,4.60] from z=109.6 to 114.6 --
     *     so the pair at 110 was planted 9 cm inside the bed's kerb, with the
     *     bed's stone edge inside that again. 109.0 is the middle of the 72 cm
     *     cross gap BETWEEN the two beds (they end at 108.64 and start at
     *     109.36), which clears both by 22 cm and lines the lamps up with the
     *     path across the parterres rather than with the planting.
     *   z=118.0 -> 116.6. The pavilion's stone apron was a disc of radius 5.1
     *     about (0,120.4) -- it is 4.85 now, see part 7 -- and the post at
     *     (4.6,118) stands 5.188 m out, so its shaft grazed that apron and its
     *     collider bit 5 cm into it: you could feel it walking round the
     *     pavilion. At 116.6 the post is 5.97 m out, better than a metre clear
     *     of the stone at either radius.
     *
     * The pair at 101.6 measured clean (the canal's kerb stops at x=+/-2.05
     * and the first bed at z=103.16) and has not moved. All six are upright,
     * founded at y=0 and 2.9 m to the lantern, which is the fixture's own
     * `gardenLamp` recipe -- nothing here is a bespoke post.
     */
    for (const lz of [101.6, 109.0, 116.6]) {
      gardenLamp(-4.6, lz);
      gardenLamp(4.6, lz);
    }

    /* ---- 9. The two side lawns, either side of the pool terrace. Both were
     * bare grass; both are now somewhere you would actually stand. */
    // West: a sunken fire pit in a brick ring, with built-in seating.
    const firePit = { x: -21, z: 84 };
    const firePitAssemblyId = 'mansion-garden-fire-pit';
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const bx = firePit.x + Math.cos(a) * 3.4;
      const bz = firePit.z + Math.sin(a) * 3.4;
      /* Tangent to the ring: -(a + PI/2). At -a the benches splay outward like
       * a starburst -- the same arithmetic slip the winter garden's lily basin
       * had, and just as obvious once you look at it. */
      const tangent = -(a + Math.PI / 2);
      root.add(geometryIntent(box({
        size: [1.2, 0.5, 0.7], pos: [bx, 0.25, bz], mat: brickMaterial(1.3, 0.6), rotY: tangent, cast: false,
      }), { assemblyId: firePitAssemblyId }));
      root.add(geometryIntent(box({
        size: [1.25, 0.08, 0.78], pos: [bx, 0.53, bz], mat: M_COPING, rotY: tangent, cast: false,
      }), { assemblyId: firePitAssemblyId }));
      geometryIntent(solid(bx - 0.5, bx + 0.5, 0, 0.55, bz - 0.5, bz + 0.5), { assemblyId: firePitAssemblyId });
    }
    root.add(geometryIntent(cylinder({ r: 1.35, h: 0.62, pos: [firePit.x, 0.31, firePit.z], mat: brickMaterial(4, 0.7) }), { assemblyId: firePitAssemblyId }));
    root.add(geometryIntent(cylinder({ r: 1.5, h: 0.1, pos: [firePit.x, 0.65, firePit.z], mat: M_COPING, cast: false }), { assemblyId: firePitAssemblyId }));
    root.add(geometryIntent(cylinder({
      r: 1.15,
      h: 0.14,
      pos: [firePit.x, 0.7, firePit.z],
      mat: mat({ color: 0x14100c, roughness: 1 }),
      cast: false,
    }), { assemblyId: firePitAssemblyId }));
    const fireFlame = geometryIntent(sphere({
      r: 0.5,
      ry: 0.72,
      pos: [firePit.x, 1.05, firePit.z],
      mat: mat({
        color: 0x000000, emissive: 0xff8a2c, emissiveIntensity: 2.2, roughness: 1, unique: true,
      }),
      cast: false,
    }), { assemblyId: firePitAssemblyId });
    root.add(fireFlame);
    const fireLight = new THREE.PointLight(0xff8a3c, 20, 18, 2);
    fireLight.position.set(firePit.x, 1.2, firePit.z);
    root.add(fireLight);
    lanterns.push(fireLight);
    torchFlames.push({
      flame: fireFlame, light: fireLight, baseIntensity: 20, seed: 3.7,
    });
    geometryIntent(solid(firePit.x - 1.5, firePit.x + 1.5, 0, 0.75, firePit.z - 1.5, firePit.z + 1.5), { assemblyId: firePitAssemblyId });

    /* East: the outdoor kitchen -- a brick counter, a grill, stools, a canopy.
     *
     * THE BAR TOP (owner playtest 2026-08-04, verbatim): "Outside bar is a
     * little whackey with whats on it."
     *
     * It was, and every piece of it measured wrong in a different direction.
     * The counter's coping tops out at y=1.10 and that is the datum everything
     * standing on this bar is now set from:
     *
     *   - THE GRILL sat at y[1.08,1.42], i.e. two centimetres sunk into its
     *     own counter top. It now stands on it.
     *   - THE LID was a HALF-METRE-THICK slab rotated about its own middle:
     *     measured y[1.02,2.22], so it ran clean through the grill body it was
     *     supposed to cover AND eight centimetres down through the counter
     *     under that. It is now a 6 cm lid on a real hinge at the grill's back
     *     edge, propped open the way a grill lid is, with a handle on it.
     *   - THE THIRD BOX was 0.9 x 0.22 x 1.1 of bare chrome floating one
     *     centimetre off the coping at y[1.11,1.33], explaining nothing about
     *     what it was. Same footprint, same place, built as what a bar this
     *     size actually has there: a sunk ice well with the bottles in it.
     *   - THE STOOL FEET floated 3 cm off the terrace (y[0.03,0.08]).
     */
    const cookX = 20.5;
    /** Top of the counter's coping -- the bar top itself. */
    const BAR_TOP = 1.1;
    const M_BOTTLE = mat({ color: 0x1e3a26, roughness: 0.22, metalness: 0.1 });
    root.add(box({
      size: [1.1, 1.0, 7.0], pos: [cookX, 0.5, 84], mat: brickMaterial(1.2, 1.1), name: 'outdoor-kitchen',
    }));
    root.add(box({ size: [1.35, 0.1, 7.3], pos: [cookX, 1.05, 84], mat: M_COPING, cast: false }));
    solid(cookX - 0.6, cookX + 0.6, 0, 1.05, 80.5, 87.5);
    // The grill: body on the bar top, a grate over it, and the lid.
    root.add(box({
      size: [1.0, 0.36, 1.6], pos: [cookX, BAR_TOP + 0.18, 82.2], mat: M_CHROME, name: 'grill',
    }));
    for (let i = 0; i < 7; i++) {
      root.add(box({
        size: [0.86, 0.025, 0.06],
        pos: [cookX, BAR_TOP + 0.37, 82.2 + (i - 3) * 0.2],
        mat: M_LAMP_POST,
        cast: false,
        name: 'grill-grate',
      }));
    }
    /* Hinged along the grill's west edge (x = cookX - 0.5, the side away from
     * whoever is cooking) and swung open 1.05 rad. A point (L, t) on the leaf
     * lands at (L*cos - t*sin, L*sin + t*cos) from that hinge, so the slab's
     * own centre -- (0.5, 0.03) -- sits 22 cm out and 45 cm up from it.
     * Nothing of the lid is below the hinge, which is the whole point: it
     * cannot re-enter the grill or the counter however it is posed. */
    root.add(box({
      size: [1.0, 0.06, 1.6],
      pos: [cookX - 0.28, BAR_TOP + 0.36 + 0.45, 82.2],
      mat: M_CHROME,
      rotZ: 1.05,
      cast: false,
      name: 'grill-lid',
    }));
    root.add(named(cylinder({
      r: 0.025, h: 1.2, pos: [cookX - 0.09, BAR_TOP + 0.36 + 0.92, 82.2], mat: M_LAMP_POST, rotX: Math.PI / 2,
    }), 'grill-lid-handle'));
    /* The ice well, in the third box's own footprint: four chrome rim walls
     * standing 16 cm proud of the bar and a bed of ice inside them, which is
     * what you see from a standing player's eye height looking down into it. */
    for (const [wx, wz, ww, wd] of [
      [cookX, 85.075, 0.9, 0.05], [cookX, 86.125, 0.9, 0.05],
      [cookX - 0.425, 85.6, 0.05, 1.1], [cookX + 0.425, 85.6, 0.05, 1.1],
    ]) {
      root.add(box({
        size: [ww, 0.16, wd], pos: [wx, BAR_TOP + 0.08, wz], mat: M_CHROME, cast: false, name: 'bar-ice-well',
      }));
    }
    root.add(box({
      size: [0.8, 0.08, 1.0], pos: [cookX, BAR_TOP + 0.04, 85.6], mat: M_MARBLE, cast: false, name: 'bar-ice',
    }));
    for (const bz of [85.28, 85.92]) {
      root.add(named(cylinder({
        r: 0.05, h: 0.3, pos: [cookX - 0.12, BAR_TOP + 0.15, bz], mat: M_BOTTLE,
      }), 'bar-bottle'));
      root.add(cylinder({
        rTop: 0.022, rBottom: 0.045, h: 0.16, pos: [cookX - 0.12, BAR_TOP + 0.37, bz], mat: M_BOTTLE, cast: false,
      }));
      root.add(cylinder({
        r: 0.023, h: 0.04, pos: [cookX - 0.12, BAR_TOP + 0.47, bz], mat: M_GOLD, cast: false,
      }));
    }
    for (const sz of [81.0, 82.6, 84.2, 85.8, 87.4]) {
      root.add(named(cylinder({ r: 0.24, h: 0.09, pos: [cookX - 1.6, 0.78, sz], mat: M_TEAK }), 'bar-stool'));
      root.add(cylinder({ r: 0.06, h: 0.74, pos: [cookX - 1.6, 0.37, sz], mat: M_CHROME }));
      root.add(cylinder({ r: 0.28, h: 0.05, pos: [cookX - 1.6, 0.025, sz], mat: M_CHROME, cast: false }));
      solid(cookX - 1.85, cookX - 1.35, 0, 0.82, sz - 0.25, sz + 0.25);
    }
    /* A tumbler poured at three of the five places -- 81.0, 84.2 and 87.4 and
     * NOT the other two, because the bar top is not free at those: the grill
     * occupies z:81.4..83.0 and the ice well z:85.05..86.15, and a glass set
     * on the line of either would be standing inside it. */
    for (const sz of [81.0, 84.2, 87.4]) {
      root.add(named(cylinder({
        rTop: 0.042, rBottom: 0.036, h: 0.11, pos: [cookX - 0.45, BAR_TOP + 0.055, sz], mat: M_POOL_GLASS, cast: false,
      }), 'bar-tumbler'));
    }
    for (const [px, pz] of [[cookX - 2.4, 80.2], [cookX - 2.4, 87.8], [cookX + 1.0, 80.2], [cookX + 1.0, 87.8]]) {
      root.add(cylinder({ r: 0.1, h: 3.0, pos: [px, 1.5, pz], mat: M_TEAK }));
      solid(px - 0.14, px + 0.14, 0, 3.0, pz - 0.14, pz + 0.14);
    }
    root.add(box({
      size: [4.0, 0.18, 8.4], pos: [cookX - 0.7, 3.05, 84], mat: M_TEAK, cast: false,
    }));
    for (let i = 0; i < 9; i++) {
      root.add(box({
        size: [4.0, 0.09, 0.12], pos: [cookX - 0.7, 3.2, 80.4 + i * 0.9], mat: M_TEAK, cast: false,
      }));
    }
    const cookLight = new THREE.PointLight(0xffd2a0, 18, 16, 2);
    cookLight.position.set(cookX - 0.7, 2.85, 84);
    root.add(cookLight);
    lanterns.push(cookLight);

    /* ...and a three-hole putting green, because of course there is one.
     *
     * THE GREEN MOVED (owner playtest 2026-08-04): "Stairs going in and out of
     * the kitchen are a bit fucked and intersect with the golf green."
     *
     * The green was an 11 x 9 m slab at x:16..27, z:66.5..75.5, and both ends
     * of that rect were laid over something:
     *
     *   - its SOUTH edge covered z:66.5..67.2 of the kitchen's own service
     *     doorway (x:16..16.4, z:64.8..67.2). You came out of the kitchen and
     *     down the service steps onto turf that ran back under the house, with
     *     the green's west edge tucked inside the east wall band;
     *   - its EAST end overlapped the service road (x:22..28, z:0..70) by 5 x
     *     3.5 m of coincident slab -- turf and asphalt at the same height,
     *     z-fighting over the same ground.
     *
     * It is now a rect of its own, laid clear of both: north of the road's end
     * (z=70), east of the house by 1.6 m, and stopped 0.3 m short of the
     * outdoor kitchen's canopy. The holes are written as offsets from its
     * centre so the pins can never again drift off the turf they are cut into.
     */
    const GREEN = {
      x0: 18, x1: 29, z0: 70.5, z1: 79.5,
    };
    const greenCx = (GREEN.x0 + GREEN.x1) / 2;
    const greenCz = (GREEN.z0 + GREEN.z1) / 2;
    const greenMat = mat({ color: 0x2f7a3a, roughness: 1 });
    root.add(box({
      size: [GREEN.x1 - GREEN.x0, 0.07, GREEN.z1 - GREEN.z0],
      pos: [greenCx, 0.035, greenCz],
      mat: greenMat,
      cast: false,
      name: 'putting-green',
    }));
    for (const [dx, dz] of [[-3.3, -2.6], [2.5, -0.4], [-0.9, 3.0]]) {
      const hx = greenCx + dx;
      const hz = greenCz + dz;
      root.add(named(cylinder({
        r: 0.16, h: 0.02, pos: [hx, 0.08, hz], mat: mat({ color: 0x0c1410, roughness: 1 }), cast: false,
      }), 'putting-green-hole'));
      root.add(named(cylinder({ r: 0.012, h: 1.5, pos: [hx, 0.83, hz], mat: M_CHROME }), 'putting-green-pin'));
      root.add(box({
        size: [0.02, 0.2, 0.3], pos: [hx, 1.45, hz + 0.15], mat: mat({ color: 0xd8b23a, roughness: 0.8 }), cast: false, name: 'putting-green-flag',
      }));
    }

    /* ---- 10. A brass plate at the head of the maze walk. Nothing in this
     * garden explains itself, and one line of lettering at the mouth of a
     * hedge maze is what a house like this would put there. */
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.42),
      mat({
        map: printed('mansion.maze.plate', ['THE MAZE — 1988'], {
          w: 512, h: 144, bg: '#241a10', fg: '#e0be74', font: '900 52px Georgia, serif', border: '#8a6a24',
        }),
        roughness: 0.5,
        unique: true,
      }),
    );
    /* Beside the mouth of the maze, not in front of it -- the approach to an
     * opening is the one line nothing may stand on.
     *
     * THE FLOATING BRICK WALL (owner playtest 2026-08-04, verbatim): "Floating
     * brick wall by the hedge maze."
     *
     * This pier, and measured it is not subtle: the brick was built as a 62 cm
     * block CENTRED on y=1.2, so it read y[0.89,1.51] -- 89 cm of daylight
     * under a brick wall, standing beside the mouth of the maze where you walk
     * past it at arm's length. (Its collider, meanwhile, ran the full 0..1.5,
     * so you were stopped by the air under it as well.) The plate's own top
     * 5 cm was inside the coping course, too.
     *
     * It is now a pier founded ON THE GROUND: 1.62 m of brick from grade with
     * the coping over it, and the brass plate hung at the same reading height
     * it always had, 6 cm clear under the coping instead of buried in it.
     */
    const plateX = maze.entry.x + 2.4;
    const pierTop = 1.62;
    plate.position.set(plateX, 1.35, MAZE.z0 - 1.15);
    plate.rotation.y = Math.PI;
    root.add(plate);
    root.add(box({
      size: [1.7, pierTop, 0.34],
      pos: [plateX, pierTop / 2, MAZE.z0 - 1.0],
      mat: brickMaterial(1.8, pierTop),
      name: 'maze-plate-pier',
    }));
    root.add(box({
      size: [1.9, 0.12, 0.5],
      pos: [plateX, pierTop + 0.06, MAZE.z0 - 1.0],
      mat: M_COPING,
      cast: false,
      name: 'maze-plate-coping',
    }));
    solid(plateX - 0.9, plateX + 0.9, 0, pierTop + 0.12, MAZE.z0 - 1.2, MAZE.z0 - 0.8);

    return {
      wall: { ...GARDEN_WALL },
      rect: { ...GARDEN },
      canal: { ...CANAL, water: canalWater },
      /** The rill's working jets. `update()` ticks every one of these. */
      jets: canalJets,
      roseGarden: { ...ROSE_GARDEN, gate: { x: R.x0, z: gateZ, w: GATE_W } },
      pavilion: { ...PAVILION },
      firePit,
      lanternCount: lanterns.length,
      /** Look-targets for the composition root's flavour HUD. */
      plate,
      bronze,
      maze,
    };
  }

  /**
   * The maze itself: carve, merge, build, solve.
   *
   * `vWall[c][r]` is the hedge standing on vertical grid line `c` beside row
   * `r`; `hWall[c][r]` the one on horizontal grid line `r` above column `c`.
   * Carving clears them; the perimeter is left standing except at the two
   * gaps. Runs are merged along each grid line before anything is built, so
   * one hedge is one box and one collider rather than one per cell -- a 5x7
   * maze is about thirty pieces instead of a hundred and twenty.
   */
  function buildHedgeMaze() {
    const {
      x0, z0, cols, rows, hedge: T, height: H,
    } = MAZE;
    const cw = (MAZE.x1 - MAZE.x0) / cols;
    const cd = (MAZE.z1 - MAZE.z0) / rows;
    const cellX = (c) => x0 + (c + 0.5) * cw;
    const cellZ = (r) => z0 + (r + 0.5) * cd;

    /* Fixed seed. A maze that is different every load is a maze no verifier
     * can walk and no player can learn, and both of those matter. */
    let seed = 0x5eed1234;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const vWall = Array.from({ length: cols + 1 }, () => new Array(rows).fill(true));
    const hWall = Array.from({ length: cols }, () => new Array(rows + 1).fill(true));
    const seen = Array.from({ length: cols }, () => new Array(rows).fill(false));

    const ENTRY_COL = 2;
    const EXIT_COL = 2;
    const stack = [[ENTRY_COL, 0]];
    seen[ENTRY_COL][0] = true;
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const options = [];
      if (c > 0 && !seen[c - 1][r]) options.push([c - 1, r, 'v', c, r]);
      if (c < cols - 1 && !seen[c + 1][r]) options.push([c + 1, r, 'v', c + 1, r]);
      if (r > 0 && !seen[c][r - 1]) options.push([c, r - 1, 'h', c, r]);
      if (r < rows - 1 && !seen[c][r + 1]) options.push([c, r + 1, 'h', c, r + 1]);
      if (!options.length) { stack.pop(); continue; }
      const [nc, nr, kind, wc, wr] = options[(rnd() * options.length) | 0];
      if (kind === 'v') vWall[wc][wr] = false;
      else hWall[wc][wr] = false;
      seen[nc][nr] = true;
      stack.push([nc, nr]);
    }
    // Three deliberate loops. A perfect maze is all dead ends, and a garden
    // maze that punishes every wrong turn with a full backtrack is a chore.
    for (const [c, r] of [[1, 2], [3, 4], [2, 5]]) vWall[c][r] = false;
    // The way in and the way out.
    hWall[ENTRY_COL][0] = false;
    hWall[EXIT_COL][rows] = false;

    /* ---- merge and build ---- */
    const walls = [];
    const assemblyId = 'mansion-hedge-maze-walls';
    function hedgeRun(ax0, ax1, az0, az1) {
      root.add(geometryIntent(box({
        size: [ax1 - ax0, H, az1 - az0],
        pos: [(ax0 + ax1) / 2, H / 2, (az0 + az1) / 2],
        mat: M_YEW,
        name: 'maze-hedge',
      }), { assemblyId }));
      root.add(geometryIntent(box({
        size: [ax1 - ax0 - 0.08, 0.06, az1 - az0 - 0.08],
        pos: [(ax0 + ax1) / 2, H, (az0 + az1) / 2],
        mat: M_YEW_TOP,
        cast: false,
      }), { assemblyId }));
      const contact = solid(ax0, ax1, 0, H, az0, az1);
      contact.name = 'mansion-hedge-maze-wall-collider';
      geometryIntent(contact, { assemblyId });
      walls.push({
        x0: ax0, x1: ax1, z0: az0, z1: az1,
      });
    }
    for (let c = 0; c <= cols; c++) {
      const lineX = x0 + c * cw;
      let run = null;
      for (let r = 0; r <= rows; r++) {
        const on = r < rows && vWall[c][r];
        if (on && run === null) run = r;
        if (!on && run !== null) {
          hedgeRun(lineX - T / 2, lineX + T / 2, z0 + run * cd - T / 2, z0 + r * cd + T / 2);
          run = null;
        }
      }
    }
    for (let r = 0; r <= rows; r++) {
      const lineZ = z0 + r * cd;
      let run = null;
      for (let c = 0; c <= cols; c++) {
        const on = c < cols && hWall[c][r];
        if (on && run === null) run = c;
        if (!on && run !== null) {
          hedgeRun(x0 + run * cw - T / 2, x0 + c * cw + T / 2, lineZ - T / 2, lineZ + T / 2);
          run = null;
        }
      }
    }

    /* ---- solve, for the verifier and for the lantern at the heart ---- */
    const key = (c, r) => r * cols + c;
    const prev = new Map();
    const queue = [[ENTRY_COL, 0]];
    prev.set(key(ENTRY_COL, 0), null);
    while (queue.length) {
      const [c, r] = queue.shift();
      const nbrs = [];
      if (c > 0 && !vWall[c][r]) nbrs.push([c - 1, r]);
      if (c < cols - 1 && !vWall[c + 1][r]) nbrs.push([c + 1, r]);
      if (r > 0 && !hWall[c][r]) nbrs.push([c, r - 1]);
      if (r < rows - 1 && !hWall[c][r + 1]) nbrs.push([c, r + 1]);
      for (const [nc, nr] of nbrs) {
        if (prev.has(key(nc, nr))) continue;
        prev.set(key(nc, nr), [c, r]);
        queue.push([nc, nr]);
      }
    }
    const path = [];
    let cursor = [EXIT_COL, rows - 1];
    while (cursor) {
      path.unshift({ x: cellX(cursor[0]), z: cellZ(cursor[1]) });
      cursor = prev.get(key(cursor[0], cursor[1])) ?? null;
    }
    const entry = { x: cellX(ENTRY_COL), z: MAZE.z0 - 2.4 };
    const exit = { x: cellX(EXIT_COL), z: MAZE.z1 + 2.4 };
    const route = [entry, ...path, exit];

    /* A lantern and a bench at the deepest cell on the route, so the middle of
     * the maze is somewhere you arrive at rather than somewhere you notice you
     * are.
     *
     * BOTH GO IN OPPOSITE CORNERS OF THE CELL, and that is not decoration.
     *
     * First attempt put the lamp on the centre line with a bench either side.
     * The cell is 2.42 m of clear corridor, so that left two channels of half
     * a metre -- under the player's own 0.6 m diameter -- and the maze walk
     * jammed in the middle of the maze, eight waypoints short. Second attempt
     * pushed both against the flanks, which keeps the north-south channel open
     * and closes the east-west one, and this cell is a crossroads.
     *
     * A CORNER is the only placement that leaves BOTH channels open: with the
     * lamp in one diagonal corner and the bench in the other, a straight line
     * through the cell in either axis is clear by 1.4 m or better. Walked, not
     * assumed -- verify:mansion drives the exported route on held keys and
     * this is exactly the failure it caught.
     */
    const heart = path[Math.floor(path.length / 2)];
    const lampX = heart.x + 0.85;
    const lampZ = heart.z + 0.85;
    root.add(cylinder({ r: 0.1, h: 2.5, pos: [lampX, 1.25, lampZ], mat: M_IRON }));
    root.add(sphere({
      r: 0.2,
      pos: [lampX, 2.66, lampZ],
      mat: mat({ color: 0xffe6bc, roughness: 0.4, emissive: 0xffca7a, emissiveIntensity: 1.9 }),
      cast: false,
    }));
    root.add(cylinder({ rTop: 0.03, rBottom: 0.3, h: 0.34, pos: [lampX, 3.0, lampZ], mat: M_IRON, cast: false }));
    const heartLight = new THREE.PointLight(0xffca7a, 15, 13, 2);
    heartLight.position.set(lampX, 2.66, lampZ);
    root.add(heartLight);
    solid(lampX - 0.14, lampX + 0.14, 0, 2.5, lampZ - 0.14, lampZ + 0.14);
    const benchX = heart.x - 0.9;
    const benchZ = heart.z - 0.9;
    root.add(box({ size: [0.4, 0.09, 0.95], pos: [benchX, 0.44, benchZ], mat: M_TEAK }));
    root.add(box({
      size: [0.1, 0.5, 0.95], pos: [benchX - 0.2, 0.7, benchZ], mat: M_TEAK, cast: false,
    }));
    for (const lz of [benchZ - 0.36, benchZ + 0.36]) {
      root.add(box({ size: [0.38, 0.42, 0.08], pos: [benchX, 0.22, lz], mat: M_IRON }));
    }
    solid(benchX - 0.24, benchX + 0.24, 0, 0.5, benchZ - 0.5, benchZ + 0.5);

    return {
      rect: { ...MAZE },
      cell: { w: cw, d: cd },
      /** Clear corridor width in each axis -- asserted by verify:mansion. */
      corridor: { x: cw - T, z: cd - T },
      walls,
      entry,
      exit,
      heart,
      /** Entry-to-exit, in world coordinates. The verifier walks this. */
      route,
    };
  }
  const rearGarden = buildRearGarden();

  /* Front security routes belong to the grounds that own their obstacles.
   * The old cast-local rectangles had three deterministic faults: patrol 0
   * walked straight through both driveway hedges at z=19, patrol 1 crossed
   * the palm at (-26.5, 33), and patrol 2 spawned against the matching facade
   * palm. These compact loops stay in open maintained ground and are published
   * through `anchors`, so moving a bed or tree cannot leave a second, stale
   * map hidden in cast.js. */
  // The centre loop is on the raised driveway pavers; the lawn loops below
  // stay at the cast's y=0 fallback.
  const frontGuardRoutes = Object.freeze([
    Object.freeze([
      Object.freeze({ x: -2.4, y: 0.05, z: 18.0 }),
      Object.freeze({ x: 2.4, y: 0.05, z: 18.0 }),
      Object.freeze({ x: 2.4, y: 0.05, z: 7.0 }),
      Object.freeze({ x: -2.4, y: 0.05, z: 7.0 }),
    ]),
    Object.freeze([
      Object.freeze({ x: -23.0, z: 20.0 }),
      Object.freeze({ x: -28.5, z: 20.0 }),
      Object.freeze({ x: -28.5, z: 30.0 }),
      Object.freeze({ x: -23.0, z: 30.0 }),
    ]),
    Object.freeze([
      Object.freeze({ x: 17.5, z: 20.0 }),
      Object.freeze({ x: 20.5, z: 20.0 }),
      Object.freeze({ x: 20.5, z: 32.0 }),
      Object.freeze({ x: 17.5, z: 32.0 }),
    ]),
  ]);

  /* ---------------------------------------------------------------- */
  /* Anchors                                                            */
  /* ---------------------------------------------------------------- */
  const anchors = {
    gate: new THREE.Vector3(0, 0, 0),
    spawn: new THREE.Vector3(0, 0, -3),
    spawnYaw: Math.PI, // faces +Z, into the property (three.js default forward is -Z at yaw 0)
    fountainFront: new THREE.Vector3(0, 0, 26 - FORECOURT_SHIFT),
    frontDoorOutside: new THREE.Vector3(0, GROUND_Y, BUILDING.z0 - 1.5),
    securityBooth: new THREE.Vector3(SECURITY_BOOTH_POS.x, 0, SECURITY_BOOTH_POS.z),
    /** Inside the booth, at the counter. `cast.js` posts the gate man here. */
    boothPost: securityBooth.post.clone(),
    boothLook: securityBooth.lookAt.clone(),
    poolPatio: new THREE.Vector3(0, GROUND_Y, 85),
    poolDoorOutside: new THREE.Vector3((POOL_DOOR.x0 + POOL_DOOR.x1) / 2, GROUND_Y, 76.5),
    poolSteps: new THREE.Vector3(
      (poolPatio.steps.x0 + poolPatio.steps.x1) / 2,
      0,
      (poolPatio.steps.z0 + poolPatio.steps.z1) / 2,
    ),
    serviceRoadEntrance: new THREE.Vector3(25, 0, 0),
    billiardBay: new THREE.Vector3(
      (LOUNGE_BAY.x0 + LOUNGE_BAY.x1) / 2, GROUND_Y, (LOUNGE_BAY.z0 + LOUNGE_BAY.z1) / 2,
    ),
    rosePavilion: new THREE.Vector3(-16, 0, 26),
    // The rear garden.
    gardenCrossWalk: new THREE.Vector3(0, 0, 98),
    gardenStairsTop: new THREE.Vector3(-7, GROUND_Y, 94.4),
    mazeEntrance: new THREE.Vector3(rearGarden.maze.entry.x, 0, rearGarden.maze.entry.z),
    mazeHeart: new THREE.Vector3(rearGarden.maze.heart.x, 0, rearGarden.maze.heart.z),
    mazeExit: new THREE.Vector3(rearGarden.maze.exit.x, 0, rearGarden.maze.exit.z),
    roseGardenGate: new THREE.Vector3(ROSE_GARDEN.x0 - 1.6, 0, (ROSE_GARDEN.z0 + ROSE_GARDEN.z1) / 2),
    gardenPavilion: new THREE.Vector3(PAVILION.x, 0, PAVILION.z - 5.4),
    firePit: new THREE.Vector3(rearGarden.firePit.x, 0, rearGarden.firePit.z - 5),
    outdoorKitchen: new THREE.Vector3(18.0, 0, 84),
    /** Three obstacle-checked loops consumed directly by mansion/cast.js. */
    frontGuardRoutes,
  };

  /* ---------------------------------------------------------------- */
  /* Doors (openings only -- no leaf, no mechanic; Phase 2 may dress    */
  /* them, this pass just leaves them walkable per the "gone-through"   */
  /* gate precedent).                                                   */
  /* ---------------------------------------------------------------- */
  const doors = {
    front: {
      x: FRONT_DOOR.x, y: GROUND_Y, z: FRONT_DOOR.z, x0: FRONT_DOOR.x0, x1: FRONT_DOOR.x1, y0: FRONT_DOOR.y0, y1: FRONT_DOOR.y1, z0: shellMeta.bands.south.z0, z1: shellMeta.bands.south.z1, open: true,
    },
    rearService: {
      x: REAR_DOOR.x, y: GROUND_Y, z: REAR_DOOR.z, z0: REAR_DOOR.z0, z1: REAR_DOOR.z1, y0: REAR_DOOR.y0, y1: REAR_DOOR.y1, x0: shellMeta.bands.east.x0, x1: shellMeta.bands.east.x1, open: true,
    },
    poolDoor: {
      x: (POOL_DOOR.x0 + POOL_DOOR.x1) / 2,
      y: GROUND_Y,
      z: BUILDING.z1,
      x0: POOL_DOOR.x0,
      x1: POOL_DOOR.x1,
      y0: POOL_DOOR.y0,
      y1: POOL_DOOR.y1,
      z0: shellMeta.bands.north.z0,
      z1: shellMeta.bands.north.z1,
      open: true,
    },
  };

  /* ---------------------------------------------------------------- */
  /* Shell metadata for Phase 2                                         */
  /* ---------------------------------------------------------------- */
  const shell = {
    GROUND_Y,
    UPPER_Y,
    UPPER_CEILING_Y,
    BASEMENT_Y,
    ROOF_Y0,
    ROOF_Y1,
    /* The third floor. `MansionInterior.js` reads these rather than restating
     * them, so the suite's floor can never end up at a different height from
     * the slab it is laid on. */
    SUITE_Y,
    SUITE_CEILING_Y,
    SUITE_ROOF_Y0,
    SUITE_ROOF_Y1,
    masterSuite: { ...MASTER_SUITE },
    suiteStairWell: { ...SUITE_STAIR_WELL },
    WALL_T,
    footprint: { ...BUILDING },
    loungeBay: { ...LOUNGE_BAY },
    bayRoofY0: BAY_ROOF_Y0,
    westWing: { ...WEST_WING },
    wingRoofY0: WING_ROOF_Y0,
    siegeBreachEntries: shellMeta.siegeBreachEntries,
    siegeBreachGroundAt,
    basementWing: { ...BASEMENT_WING },
    atrium: { ...ATRIUM },
    walls: shellMeta.wallRects,
    windows: shellMeta.windows,
    doors,
    slabs: shellMeta.slabs,
  };

  /* ---------------------------------------------------------------- */
  /* Props (named references for debugging/composition)                 */
  /* ---------------------------------------------------------------- */
  const props = {
    gate: {
      medallions: gateMedallions,
      artSlot: MANSION_GATE_ART_SLOT,
      artReady: gateArtReady,
    },
    fountain,
    vehicles,
    greySedan,
    carSpots: CAR_SPOTS,
    securityBooth,
    frontEntry,
    serviceRoad,
    poolPatio,
    rearGarden,
    frontGuardRoutes,
    trophyEntrance: TROPHY_ENTRANCE,
    siegeBreachEntries: shellMeta.siegeBreachEntries,
    siegeBreachGroundAt,
    landscaping,
    lamps: [...LAMP_POSITIONS, ...CAR_LAMP_POSITIONS],
    palmSpots: PALM_SPOTS,
    sky,
  };

  /* ---------------------------------------------------------------- */
  /* Per-frame update: water shader time + every spray on the property  */
  /* ---------------------------------------------------------------- */
  let torchTime = 0;
  function update(dt) {
    for (const m of waterMaterials) m.uniforms.uTime.value += dt;
    fountain.spray.update(dt);
    poolPatio.spray.update(dt);
    // The rear garden's rill. These were built and never ticked, which is the
    // whole of "the jets in that still pool" not working.
    for (const jet of rearGarden.jets) jet.update(dt);
    torchTime += dt;
    for (const t of torchFlames) {
      const flick = 0.82 + 0.18 * Math.sin(torchTime * 9 + t.seed) * Math.sin(torchTime * 3.1 + t.seed * 2);
      t.light.intensity = t.baseIntensity * flick;
    }
  }

  /* Local point lights, for the composition root's light rig -- see the
   * matching note at the end of MansionInterior.js. The moon (a shadow-
   * casting DirectionalLight) and the hemisphere fill are deliberately NOT
   * in this list: they are the scene's global lighting and always on. */
  const lights = [];
  root.traverse((o) => { if (o.isPointLight) lights.push(o); });

  return {
    root,
    colliders,
    /** Every storey-separating surface on the property, for the combat model
     * only -- see the long note beside `structural()` above. Additive to
     * `colliders`, never a replacement for it, and never handed to
     * `core/player.js`. */
    combatBlockers,
    doors,
    props,
    anchors,
    shell,
    lights,
    occluders,
    update,
  };
}
