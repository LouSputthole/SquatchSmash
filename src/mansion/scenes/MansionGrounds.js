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
/* 14.2, not 12 (owner playtest, verbatim: "Widen the driveway around the front
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
 * Three metres is one car's width with nothing either side of it. At 14.2 the
 * same three numbers are 5.2 / 7.9 / 11.2, and the parked pair moves out with
 * it (see CAR_SPOTS) so the two walking corridors past the basin widen too.
 *
 * WHY THE RADIUS AND NOT THE CENTRE. Re-centring the basin on the court would
 * have levelled all three arcs at 8.2 m, and it is the more obvious fix -- but
 * the fountain's collision body is what stops a straight walk up the drive
 * short of the steps, `verify:mansion` walks exactly that, and moving the
 * basin north moves where the walk stops. The basin stays where the facade
 * pass put it; the paving grows around it.
 *
 * The north edge lands at z = 44.2, which is 8 m INSIDE the building line
 * (BUILDING.z0 = 36) -- the circle has always run under the podium and the
 * front steps, and the extra 2.2 m is hidden under the same masonry. */
export const COURT_RADIUS = 14.2;
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
/** Darkened silver for the statue's bandana, so the mascot shape still reads. */
const M_STATUE_PATINA = mat({
  color: 0x8f95a2, roughness: 0.42, metalness: 0.2, emissive: 0x14181f, emissiveIntensity: 1.0,
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

  /** A solid box: mesh + matching collider. Used for every exterior wall,
   * pier, lintel, glass pane and basement wall segment. */
  const wallRects = [];
  /* Sight blockers for the look-prompt raycast -- see the matching note in
   * MansionInterior.js. Exterior walls, glazing and the floor slabs. */
  const occluders = [];
  function ext(x0, x1, y0, y1, z0, z1, tag, material = M_STUCCO, addCollider = true) {
    const m = box({
      size: [x1 - x0, y1 - y0, z1 - z0],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      mat: material,
      name: tag,
    });
    root.add(m);
    occluders.push(m);
    if (addCollider) solid(x0, x1, y0, y1, z0, z1);
    wallRects.push({ tag, x0, x1, y0, y1, z0, z1 });
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
  for (const [gx0, gx1, gz0, gz1] of [
    [-35, BUILDING.x0, -5, 95],
    [BUILDING.x1, 35, -5, 95],
    [BUILDING.x0, BUILDING.x1, -5, BUILDING.z0],
    [BUILDING.x0, BUILDING.x1, BUILDING.z1, 95],
    /* The rear garden's own ground. The property used to stop at the pool's
     * north coping; the formal garden behind it (see buildRearGarden) runs to
     * z=126 inside a brick estate wall, so the lawn has to reach it. */
    [-35, 35, 95, GARDEN.z1 + 4],
  ]) {
    root.add(box({
      size: [gx1 - gx0, 0.06, gz1 - gz0],
      pos: [(gx0 + gx1) / 2, -0.03, (gz0 + gz1) / 2],
      mat: M_GRASS,
    }));
  }

  /* ---------------------------------------------------------------- */
  /* Street gate: pillars + emblems + open wrought-iron leaves           */
  /* ---------------------------------------------------------------- */
  const PILLAR_H = 3.6;
  function gatePillar(x) {
    root.add(box({ size: [1.0, PILLAR_H, 1.0], pos: [x, PILLAR_H / 2, 0], mat: M_PILLAR }));
    root.add(box({ size: [1.2, 0.15, 1.2], pos: [x, PILLAR_H + 0.08, 0], mat: M_GOLD }));
    // Medallion backing disc (bezel) -- this used to be the entire emblem
    // (a flat chrome disc plus 3 tiny chrome boxes), which blended into one
    // dark blob at any real viewing distance. It is now just the bezel:
    // see gateMedallionTexture() for the actual drawn artwork in front of it.
    root.add(cylinder({
      r: 0.55, h: 0.08, pos: [x, 2.5, -0.55], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    const medallion = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 40),
      mat({
        map: gateMedallionTexture(), roughness: 0.45, metalness: 0.2, unique: true,
      }),
    );
    medallion.position.set(x, 2.5, -0.62);
    medallion.rotation.y = Math.PI; // face -Z, toward the street/spawn side
    root.add(medallion);
    // A tight little spotlight square on the medallion -- without it the
    // artwork itself still vanishes into the pillar's own shadow at night.
    const medallionLight = new THREE.SpotLight(0xfff6e0, 7, 5, 0.42, 0.5, 1.4);
    medallionLight.position.set(x, 3.15, -1.55);
    medallionLight.target.position.set(x, 2.5, -0.62);
    root.add(medallionLight, medallionLight.target);
    solid(x - 0.5, x + 0.5, 0, PILLAR_H, -0.5, 0.5);
  }
  gatePillar(-4);
  gatePillar(4);

  // Wrought-iron leaves, swung open and folded back against the fence line --
  // no open/close mechanic this pass, so they are simply modelled open.
  function gateLeaf(hingeX, side) {
    const leafW = 2.0;
    const leafH = 2.2;
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
    for (const hy of [0.45, 1.85]) {
      root.add(cylinder({ r: 0.07, h: 0.22, pos: [hingeX, hy, -0.5], mat: M_CHROME }));
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
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0, 0.09, 0.18, 20), M_FENCE, n);
    caps.name = 'fence-post-cap';
    caps.castShadow = true;
    caps.receiveShadow = true;
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

  root.add(box({ size: [8, 0.06, 23], pos: [0, 0.02, 11.5], mat: paverMaterial(8, 23) }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [-4.15, 0.05, 11.5], mat: M_CURB }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [4.15, 0.05, 11.5], mat: M_CURB }));

  const turnaround = new THREE.Mesh(
    new THREE.CircleGeometry(COURT_RADIUS, 48), paverMaterial(COURT_RADIUS * 2, COURT_RADIUS * 2),
  );
  turnaround.rotation.x = -Math.PI / 2;
  turnaround.position.set(COURT_CENTRE.x, 0.02, COURT_CENTRE.z);
  turnaround.receiveShadow = true;
  root.add(turnaround);

  // Side spur (x:[-22,-14], z:[20,32]) plus a short connector to the turnaround
  root.add(box({ size: [3, 0.06, 4], pos: [-12.5, 0.02, 26], mat: paverMaterial(3, 4) }));
  root.add(box({ size: [8, 0.06, 12], pos: [-18, 0.02, 26], mat: paverMaterial(8, 12) }));

  /* ---------------------------------------------------------------- */
  /* Lamp posts -- only a handful of the standard driveway row carry a  */
  /* real PointLight. A couple of dedicated extra posts near the parked  */
  /* vehicle clusters are always lit (see CAR_SPOTS, below): those cars   */
  /* have real modelled glass/chrome/lights but sat far enough from every */
  /* light in this scene to render as near-pure-black silhouettes.       */
  /* ---------------------------------------------------------------- */
  function lampPost(x, z, lit, intensity = 5.5) {
    const postH = 3.2;
    root.add(cylinder({ r: 0.09, h: postH, pos: [x, postH / 2, z], mat: M_LAMP_POST }));
    root.add(sphere({
      r: 0.18,
      pos: [x, postH + 0.05, z],
      mat: mat({
        color: 0xffdca0, roughness: 0.4, emissive: lit ? 0xffdca0 : 0x332210, emissiveIntensity: lit ? 1.4 : 0.3,
      }),
    }));
    if (lit) {
      const l = new THREE.PointLight(0xffc98a, intensity, 16, 2);
      l.position.set(x, postH + 0.1, z);
      root.add(l);
    }
    solid(x - 0.12, x + 0.12, 0, postH, z - 0.12, z + 0.12);
  }
  const LAMP_POSITIONS = [
    [-4.6, 4], [4.6, 4], [-4.6, 10], [4.6, 10], [-4.6, 16], [4.6, 16], [-4.6, 21], [4.6, 21],
  ];
  LAMP_POSITIONS.forEach(([x, z], i) => lampPost(x, z, i % 3 === 1));

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
  CAR_LAMP_POSITIONS.forEach(([x, z]) => lampPost(x, z, true, 11));

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
     *     darker patina so the silhouette still has the mascot's shape in it.
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

    // Collision: height-tiered to the basin's *actual* per-tier radius rather
    // than one box sized to the widest tier (the r=6 base apron) across the
    // whole 0..3.6 height. That single oversized box (fixed in an earlier
    // pass) fully engulfed the front-entry steps/portico, 6m away, making the
    // entrance unreachable on foot from any angle. Two things make the tiered
    // version correct instead of just smaller:
    //   1. The base apron (r=6, h=0.4) needs no collider at all: it is
    //      entirely below a standing player's feet (GROUND_Y=1.2), and
    //      core/player.js's own _resolve() already treats a collider whose
    //      top is below the walker's feet as walkable-over -- that 0.4 m
    //      curb was never actually the thing blocking anyone.
    //   2. What a walking tour can actually bump into is the riser + upper
    //      basin body (true radius 3.5-4, y 0.4-2.1) and the narrower
    //      pedestal + statue above it (radius ~1.2-1.3) -- both much smaller
    //      than the apron's r=6. Merging the riser/upper-basin into one r=3.6
    //      tier (rounding up slightly to cover the wider upper-basin flare
    //      without a third box) keeps the fountain at its spec'd (0,0,35)
    //      position -- no redesign of the "decided" coordinate -- while
    //      shrinking the blocked footprint enough that the front steps (see
    //      buildFrontEntry(), moved back to spec-adjacent z:39-40.5) clear it
    //      with room to spare.
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

    const fountainColliderBody = solid(fx - 3.6, fx + 3.6, 0.3, 2.2, fz - 3.6, fz + 3.6);
    const fountainColliderPedestal = solid(fx - 1.3, fx + 1.3, 2.2, 7.4, fz - 1.3, fz + 1.3);

    return {
      statue,
      lowerWater,
      upperWater,
      spray,
      colliders: [fountainColliderBody, fountainColliderPedestal],
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
   * The radius moved out with COURT_RADIUS (12 -> 14.2). A car left where it
   * was would have taken the whole of the widening back: the point of a wider
   * court is a wider corridor between the basin and the parked cars, and that
   * corridor is measured from the CAR, not from the kerb.
   */
  function courtSpot(deg, r, kind, color) {
    const t = THREE.MathUtils.degToRad(deg);
    return {
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
    courtSpot(180, 12.4, 'lincoln', 0x101014),
    courtSpot(0, 12.4, 'suv', 0x2a2a30),
    {
      x: SPUR_X, z: 22.5, kind: 'suv', color: 0x151519, yaw: Math.PI, note: 'side lot bay 1',
    },
    {
      x: SPUR_X, z: 25.9, kind: 'sedan', color: 0x1a1a20, yaw: Math.PI, note: 'side lot bay 2',
    },
    {
      x: SPUR_X, z: 29.3, kind: 'lincoln', color: 0x2e2e36, yaw: Math.PI, note: 'side lot bay 3',
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
    const car = makeCar(spot.kind, spot.color);
    car.group.position.set(spot.x, 0, spot.z);
    car.group.rotation.y = spot.yaw;
    root.add(car.group);
    const worldCollider = makeVehicleCollider(car);
    colliders.push(worldCollider);
    return {
      ...car, x: spot.x, z: spot.z, yaw: spot.yaw, note: spot.note, worldCollider,
    };
  });

  /* ---------------------------------------------------------------- */
  /* Security booth (~(8,0,4)): shell, chair, raised barrier arm         */
  /* ---------------------------------------------------------------- */
  function buildSecurityBooth() {
    const { x: cx, z: cz } = SECURITY_BOOTH_POS;
    const w = 2;
    const d = 2;
    const h = 2.2;

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
    const shell = box({
      size: [w, sill, d], pos: [cx, sill / 2, cz], mat: M_BOOTH, name: 'booth-shell',
    });
    root.add(shell);
    // Corner mullions, and a head rail the roof sits on.
    for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      root.add(box({
        size: [0.12, head - sill, 0.12],
        pos: [cx + mx * (w / 2 - 0.06), (sill + head) / 2, cz + mz * (d / 2 - 0.06)],
        mat: M_BOOTH,
        name: 'booth-mullion',
      }));
    }
    root.add(box({
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
      root.add(box({
        size: [sx, head - sill - 0.06, sz],
        pos: [cx + gx, (sill + head) / 2, cz + gz],
        mat: M_BOOTH_GLASS,
        cast: false,
        name: 'booth-glass',
      }));
    }
    root.add(box({ size: [w + 0.3, 0.12, d + 0.3], pos: [cx, h + 0.06, cz], mat: M_BOOTH_ROOF }));

    // The chair he is not sitting in, and the counter he works off.
    const chair = group('booth-chair',
      box({ size: [0.55, 0.08, 0.55], pos: [0, 0.45, 0], mat: M_BOOTH }),
      box({ size: [0.55, 0.6, 0.08], pos: [0, 0.75, -0.24], mat: M_BOOTH }));
    chair.position.set(cx + 0.52, 0, cz + 0.4);
    root.add(chair);
    root.add(box({
      size: [0.42, 0.05, d - 0.3], pos: [cx - w / 2 + 0.23, 0.98, cz], mat: M_BOOTH_ROOF, cast: false, name: 'booth-counter',
    }));

    /* The barrier: post, counterweight, striped arm, and a rest cradle on the
     * far kerb for the arm to come down onto. Raised = open. */
    const postX = cx - 1.62;
    const postZ = cz;
    root.add(cylinder({
      r: 0.09, h: 1.15, pos: [postX, 0.575, postZ], mat: M_BOOTH, name: 'barrier-post',
    }));
    root.add(box({
      size: [0.34, 0.3, 0.3], pos: [postX, 1.2, postZ], mat: M_BOOTH_ROOF, cast: false, name: 'barrier-head',
    }));
    const armPivot = new THREE.Group();
    armPivot.name = 'barrier-arm';
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
    solid(cx - w / 2, cx - w / 2 + t, 0, h, cz - d / 2, cz + d / 2);
    solid(cx + w / 2 - t, cx + w / 2, 0, h, cz - d / 2, cz + d / 2);
    solid(cx - w / 2, cx + w / 2, 0, h, cz - d / 2, cz - d / 2 + t);
    solid(cx - w / 2, cx + w / 2, 0, h, cz + d / 2 - t, cz + d / 2);
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
    };
  }
  const securityBooth = buildSecurityBooth();

  /* ---------------------------------------------------------------- */
  /* Palm trees / ornamental plants                                     */
  /* ---------------------------------------------------------------- */
  function buildPalm(x, z, h) {
    root.add(cylinder({
      rTop: 0.16, rBottom: 0.28, h, pos: [x, h / 2, z], mat: M_PALM_TRUNK,
    }));
    const crown = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const leaf = box({ size: [2.6, 0.08, 0.55], pos: [1.3, 0, 0], mat: M_PALM_LEAF });
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 7) * Math.PI * 2;
      pivot.rotation.z = -0.3 - (i % 3) * 0.08;
      pivot.add(leaf);
      crown.add(pivot);
    }
    crown.position.set(x, h, z);
    root.add(crown);
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
    [-6, 6], [6, 6], [-6, 14], [6, 16], [16.6, 6],
    [-13.5, 38.6 - FORECOURT_SHIFT], [13.5, 38.6 - FORECOURT_SHIFT],
    [-24, 12], [-27, 17], [-26.5, 38 - FORECOURT_SHIFT],
  ];
  for (const [x, z] of PALM_SPOTS) buildPalm(x, z, 5.5 + Math.random() * 1.4);

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
  const landscape = { beds: [], hedges: [], urns: [], clumps: 0 };

  /** A rectangular planting bed: recessed soil inside a low stone edge. */
  function bed(x0, x1, z0, z1, y = 0) {
    root.add(box({
      size: [x1 - x0, 0.1, z1 - z0],
      pos: [(x0 + x1) / 2, y + 0.05, (z0 + z1) / 2],
      mat: M_SOIL,
      cast: false,
    }));
    for (const [ex0, ex1, ez0, ez1] of [
      [x0 - 0.16, x1 + 0.16, z0 - 0.16, z0],
      [x0 - 0.16, x1 + 0.16, z1, z1 + 0.16],
      [x0 - 0.16, x0, z0, z1],
      [x1, x1 + 0.16, z0, z1],
    ]) {
      root.add(box({
        size: [ex1 - ex0, 0.16, ez1 - ez0],
        pos: [(ex0 + ex1) / 2, y + 0.08, (ez0 + ez1) / 2],
        mat: M_BED_EDGE,
        cast: false,
      }));
    }
    landscape.beds.push({
      x0, x1, z0, z1,
    });
  }

  /** A clipped box hedge. Real obstacle, so it carries a real collider. */
  function hedge(x0, x1, z0, z1, h = 0.85, y = 0) {
    root.add(box({
      size: [x1 - x0, h, z1 - z0], pos: [(x0 + x1) / 2, y + h / 2, (z0 + z1) / 2], mat: M_HEDGE,
    }));
    // A lighter cap face: new growth catches the light, the flanks do not.
    root.add(box({
      size: [(x1 - x0) - 0.06, 0.05, (z1 - z0) - 0.06],
      pos: [(x0 + x1) / 2, y + h, (z0 + z1) / 2],
      mat: M_HEDGE_TOP,
      cast: false,
    }));
    solid(x0, x1, y, y + h, z0, z1);
    landscape.hedges.push({
      x0, x1, z0, z1, h,
    });
  }

  /** One flowering plant: a foliage mound with a few bloom heads over it. */
  function bloomClump(x, z, y = 0, scale = 1, tint = null) {
    const paint = tint ?? BLOOM_MATS[(Math.random() * BLOOM_MATS.length) | 0];
    root.add(sphere({
      r: 0.26 * scale, ry: 0.17 * scale, pos: [x, y + 0.12 * scale, z], mat: M_FOLIAGE, cast: false,
    }));
    const heads = 3;
    for (let i = 0; i < heads; i++) {
      const a = (i / heads) * Math.PI * 2 + Math.random();
      const r = 0.05 + Math.random() * 0.15;
      root.add(sphere({
        r: 0.065 * scale,
        pos: [x + Math.cos(a) * r * scale, y + (0.24 + Math.random() * 0.08) * scale, z + Math.sin(a) * r * scale],
        mat: paint,
        cast: false,
      }));
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
        bloomClump(px, pz, y + 0.1, 0.85 + Math.random() * 0.35, Math.random() < 0.78 ? tint : null);
      }
    }
  }

  /** A stone urn of trailing colour, for flanking a doorway or a step. */
  function urn(x, z, y = 0) {
    root.add(cylinder({
      rTop: 0.42, rBottom: 0.3, h: 0.16, pos: [x, y + 0.08, z], mat: M_URN,
    }));
    root.add(cylinder({
      rTop: 0.26, rBottom: 0.34, h: 0.5, pos: [x, y + 0.41, z], mat: M_URN,
    }));
    root.add(cylinder({
      rTop: 0.5, rBottom: 0.34, h: 0.44, pos: [x, y + 0.86, z], mat: M_URN,
    }));
    root.add(sphere({
      r: 0.44, ry: 0.26, pos: [x, y + 1.12, z], mat: M_FOLIAGE, cast: false,
    }));
    const tint = BLOOM_MATS[(Math.random() * BLOOM_MATS.length) | 0];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 0.16 + Math.random() * 0.24;
      root.add(sphere({
        r: 0.08,
        pos: [x + Math.cos(a) * r, y + 1.2 + Math.random() * 0.16, z + Math.sin(a) * r],
        mat: tint,
        cast: false,
      }));
    }
    solid(x - 0.5, x + 0.5, y, y + 1.1, z - 0.5, z + 0.5);
    landscape.urns.push({ x, z });
  }

  function buildLandscaping() {
    // 1. Driveway borders: a planted strip outside each kerb, running from
    // the gate to the turnaround, with the existing lamp row standing in it.
    for (const side of [-1, 1]) {
      bed(side > 0 ? 4.35 : -6.7, side > 0 ? 6.7 : -4.35, 1.5, 22);
      plantBed(side > 0 ? 4.5 : -6.55, side > 0 ? 6.55 : -4.5, 1.8, 21.7, 1.5);
      // The hedge starts at z=6, north of the security booth and its barrier
      // arm, rather than running straight through them.
      hedge(side > 0 ? 6.7 : -7.0, side > 0 ? 7.0 : -6.7, 6, 22, 0.8);
    }

    // 2. The two front-lawn parterres either side of the drive: a box-hedge
    // outline with mass-planted colour inside it and a specimen at the centre.
    const parterres = [
      { x0: -18, x1: -8.6, z0: 6, z1: 17 },
      { x0: 8.6, x1: 15, z0: 6, z1: 17 },
    ];
    for (const p of parterres) {
      hedge(p.x0, p.x1, p.z0, p.z0 + 0.45, 0.7);
      hedge(p.x0, p.x1, p.z1 - 0.45, p.z1, 0.7);
      hedge(p.x0, p.x0 + 0.45, p.z0, p.z1, 0.7);
      hedge(p.x1 - 0.45, p.x1, p.z0, p.z1, 0.7);
      bed(p.x0 + 0.45, p.x1 - 0.45, p.z0 + 0.45, p.z1 - 0.45);
      plantBed(p.x0 + 0.7, p.x1 - 0.7, p.z0 + 0.7, p.z1 - 0.7, 2.0);
      // A clipped cone standing in the middle of the parterre.
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      root.add(cylinder({
        rTop: 0.04, rBottom: 0.66, h: 2.1, pos: [cx, 1.15, cz], mat: M_HEDGE,
      }));
      solid(cx - 0.6, cx + 0.6, 0, 2.1, cz - 0.6, cz + 0.6);
    }

    // 3. Foundation planting along the facade, either side of the front
    // steps -- the house met the lawn on a bare stucco line before this.
    const facadeZ0 = 39.2 - FORECOURT_SHIFT;
    const facadeZ1 = 40.5 - FORECOURT_SHIFT;
    for (const [fx0, fx1] of [[BUILDING.x0, -6.6], [6.6, BUILDING.x1]]) {
      bed(fx0, fx1, facadeZ0, facadeZ1);
      plantBed(fx0 + 0.3, fx1 - 0.3, facadeZ0 + 0.2, facadeZ1 - 0.2, 1.7);
      for (let sx = fx0 + 1.2; sx < fx1 - 0.8; sx += 2.4) {
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
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const z = THREE.MathUtils.lerp(zBot, zTop, t);
      const y = THREE.MathUtils.lerp(0, GROUND_Y, t);
      const depth = (zTop - zBot) / steps + 0.06;
      root.add(box({
        size: [x1 - x0, 0.16, depth], pos: [0, y + 0.08, z], mat: M_MARBLE,
      }));
    }
    solid(x0 - 0.3, x0, 0, GROUND_Y + 0.2, zBot, zTop);
    solid(x1, x1 + 0.3, 0, GROUND_Y + 0.2, zBot, zTop);

    // Portico landing -- runs from the top of the stairs to the front door
    // (a short 0.5 m landing), matching the spec's implied door approach.
    const porticoZ0 = zTop;
    const porticoZ1 = BUILDING.z0;
    root.add(box({
      size: [x1 - x0, 0.2, porticoZ1 - porticoZ0],
      pos: [0, GROUND_Y - 0.1, (porticoZ0 + porticoZ1) / 2],
      mat: M_MARBLE,
    }));

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
    return { steps: { x0, x1, z0: zBot, z1: zTop }, portico: { x0, x1, z0: porticoZ0, z1: porticoZ1 } };
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
    root.add(box({ size: [28 - 22, 0.06, 70], pos: [25, 0.02, 35], mat: M_ASPHALT }));
    const x0 = BUILDING.x1 + WALL_T; // 16.4 -- the flight starts AT the house
    const x1 = 22;
    const zBot = 63;
    const zTop = REAR_DOOR.z; // 66
    const steps = 6;
    const depth = (zTop - zBot) / steps + 0.05;
    /** Tread tops, so the kerb below can rake with the flight rather than
     * guess at it. */
    const treads = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      treads.push({
        z: THREE.MathUtils.lerp(zBot, zTop, t),
        top: THREE.MathUtils.lerp(0, GROUND_Y, t),
        depth,
      });
    }
    // The nosing at the head of the run: flush with the kitchen threshold, so
    // the last thing you step onto going out is the floor you just left.
    treads.push({ z: zTop - 0.14, top: GROUND_Y, depth: 0.28 });
    for (const tr of treads) {
      root.add(box({
        size: [x1 - x0, 0.14, tr.depth],
        pos: [(x0 + x1) / 2, tr.top - 0.07, tr.z],
        mat: M_ASPHALT,
        name: 'service-ramp-tread',
      }));
    }
    /* Kerb on the ramp's OUTER edge only. The inner one used to run the full
     * length at x0-0.25, which was harmless when the ramp started at x=15
     * (inside the podium) but is a wall across the rear service door now that
     * it starts at the building line -- the door is at x:16..16.4, z:64.8..
     * 67.2, and the verifier's walk from the road duly stopped dead 1.3 m
     * short of it. The inner edge needs no kerb: it IS the house. */
    solid(x1, x1 + 0.25, 0, GROUND_Y + 0.2, zBot, zTop);
    for (const tr of treads) {
      root.add(box({
        size: [0.25, 0.16, tr.depth],
        pos: [x1 + 0.125, tr.top + 0.08, tr.z],
        mat: M_CURB,
        cast: false,
        name: 'service-ramp-kerb',
      }));
    }
    return { road: { x0: 22, x1: 28, z0: 0, z1: 70 }, ramp: { x0, x1, z0: zBot, z1: zTop } };
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
      const seg = (ua, ub, ya, yb, name, material, inset = 0) => {
        if (ub - ua < 1e-4 || yb - ya < 1e-4) return;
        if (axis === 'z') ext(ua, ub, ya, yb, lo + inset, hi - inset, name, material);
        else ext(lo + inset, hi - inset, ya, yb, ua, ub, name, material);
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
        { id: 'livingToTrophySouth', u0: 41.4, u1: 42.8, y0: GROUND_Y, y1: WING_ARCH_TOP },
        { id: 'livingToTrophyMid', u0: 43.2, u1: 44.6, y0: GROUND_Y, y1: WING_ARCH_TOP },
        { id: 'livingToTrophyNorth', u0: 45.0, u1: 46.4, y0: GROUND_Y, y1: WING_ARCH_TOP },
        {
          id: 'livingWest', u0: 47.6, u1: 50.8, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'livingWestNorth', u0: 54.4, u1: 57.2, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
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
          id: 'bayEastSouth', u0: 41.6, u1: 44.4, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
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
    root.add(box({
      size: [bayXOuter - LOUNGE_BAY.x0, GROUND_Y, bayZ1 - bayZ0],
      pos: [(LOUNGE_BAY.x0 + bayXOuter) / 2, GROUND_Y / 2, (bayZ0 + bayZ1) / 2],
      mat: M_PODIUM,
      name: 'bay-podium',
    }));
    // Flat roof with a deep gilded cornice -- the bay is the one part of the
    // house you see head-on from the service gate.
    root.add(box({
      size: [bayXOuter - LOUNGE_BAY.x0 + 0.7, BAY_ROOF_Y1 - BAY_ROOF_Y0, bayZ1 - bayZ0 + 0.7],
      pos: [(LOUNGE_BAY.x0 + bayXOuter) / 2, (BAY_ROOF_Y0 + BAY_ROOF_Y1) / 2, (bayZ0 + bayZ1) / 2],
      mat: M_ROOF,
      name: 'bay-roof',
    }));
    for (const [tx0, tx1, tz0, tz1] of [
      [LOUNGE_BAY.x0, bayXOuter + 0.35, bayZ0 - 0.35, bayZ0 - 0.18],
      [LOUNGE_BAY.x0, bayXOuter + 0.35, bayZ1 + 0.18, bayZ1 + 0.35],
      [bayXOuter + 0.18, bayXOuter + 0.35, bayZ0 - 0.35, bayZ1 + 0.35],
    ]) {
      root.add(box({
        size: [tx1 - tx0, 0.16, tz1 - tz0],
        pos: [(tx0 + tx1) / 2, BAY_ROOF_Y1 - 0.02, (tz0 + tz1) / 2],
        mat: M_GOLD,
        cast: false,
      }));
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
          id: 'trophyWestSouth', u0: 43.0, u1: 46.4, y0: GLASS_SILL + 0.9, y1: GLASS_TOP + 0.5, glass: true,
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
    root.add(box({
      size: [wingInnerX - wingOuterX, GROUND_Y, WEST_WING.z1 - WEST_WING.z0],
      pos: [(wingOuterX + wingInnerX) / 2, GROUND_Y / 2, (WEST_WING.z0 + WEST_WING.z1) / 2],
      mat: M_PODIUM,
      name: 'wing-podium',
    }));
    /* Overhang on three sides only: the east edge stops on the building line.
     * An eave reaching past it at this height would cross the bottom of the
     * upper storey's west windows. */
    root.add(box({
      size: [(wingInnerX - wingOuterX) + 0.45, WING_ROOF_Y1 - WING_ROOF_Y0, WEST_WING.z1 - WEST_WING.z0 + 0.9],
      pos: [
        (wingOuterX - 0.45 + wingInnerX) / 2,
        (WING_ROOF_Y0 + WING_ROOF_Y1) / 2,
        (WEST_WING.z0 + WEST_WING.z1) / 2,
      ],
      mat: M_ROOF,
      name: 'wing-roof',
    }));
    for (const [tx0, tx1, tz0, tz1] of [
      [wingOuterX - 0.45, wingInnerX, WEST_WING.z0 - 0.45, WEST_WING.z0 - 0.25],
      [wingOuterX - 0.45, wingInnerX, WEST_WING.z1 + 0.25, WEST_WING.z1 + 0.45],
      [wingOuterX - 0.45, wingOuterX - 0.25, WEST_WING.z0 - 0.45, WEST_WING.z1 + 0.45],
    ]) {
      root.add(box({
        size: [tx1 - tx0, 0.18, tz1 - tz0],
        pos: [(tx0 + tx1) / 2, WING_ROOF_Y1 - 0.02, (tz0 + tz1) / 2],
        mat: M_GOLD,
        cast: false,
      }));
    }
    // Pilasters up the outer face, between the windows -- the elevation you
    // see from the whole west lawn, so it gets an order rather than a slab.
    for (const pz of [42.0, 48.4, 55.0, 64.6, 73.0]) {
      root.add(box({
        size: [0.34, WING_ROOF_Y0 - GROUND_Y, 0.9],
        pos: [wingOuterX - 0.12, (GROUND_Y + WING_ROOF_Y0) / 2, pz],
        mat: M_MARBLE_DK,
        cast: false,
      }));
      root.add(box({
        size: [0.44, 0.22, 1.02], pos: [wingOuterX - 0.12, WING_ROOF_Y0 - 0.1, pz], mat: M_GOLD, cast: false,
      }));
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
        const seg = (ua, ub, ya, yb, name, material = M_STUCCO, inset = 0) => {
          if (ub - ua < 1e-4 || yb - ya < 1e-4) return;
          if (axis === 'z') ext(ua, ub, ya, yb, lo + inset, hi - inset, name, material);
          else ext(lo + inset, hi - inset, ya, yb, ua, ub, name, material);
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
      root.add(box({
        size: [sx1 - sx0 + 0.7, SUITE_ROOF_Y1 - SUITE_ROOF_Y0, sz1 - sz0 + 0.7],
        pos: [(sx0 + sx1) / 2, (SUITE_ROOF_Y0 + SUITE_ROOF_Y1) / 2, (sz0 + sz1) / 2],
        mat: M_ROOF,
        name: 'suite-roof-slab',
      }));
      for (const [x0, x1, z0, z1] of [
        [sx0 - 0.32, sx1 + 0.32, sz0 - 0.32, sz0 - 0.2],
        [sx0 - 0.32, sx1 + 0.32, sz1 + 0.2, sz1 + 0.32],
        [sx0 - 0.32, sx0 - 0.2, sz0 - 0.32, sz1 + 0.32],
        [sx1 + 0.2, sx1 + 0.32, sz0 - 0.32, sz1 + 0.32],
      ]) {
        root.add(box({
          size: [x1 - x0, 0.1, z1 - z0],
          pos: [(x0 + x1) / 2, SUITE_ROOF_Y0 + 0.02, (z0 + z1) / 2],
          mat: M_GOLD,
          cast: false,
          name: 'suite-roof-trim',
        }));
      }
      /* A gilded parapet round the flat roof the new storey stands in the
       * middle of. Without it the third floor reads as a shed dropped on a
       * roof; with it the roof reads as a terrace and the suite as the
       * pavilion in the middle of one. Set 1.2 m in off the eaves so it is
       * clear of the roofline trim already there. */
      for (const [x0, x1, z0, z1] of [
        [BUILDING.x0 + 1.2, BUILDING.x1 - 1.2, BUILDING.z0 + 1.2, BUILDING.z0 + 1.42],
        [BUILDING.x0 + 1.2, BUILDING.x1 - 1.2, BUILDING.z1 - 1.42, BUILDING.z1 - 1.2],
        [BUILDING.x0 + 1.2, BUILDING.x0 + 1.42, BUILDING.z0 + 1.2, BUILDING.z1 - 1.2],
        [BUILDING.x1 - 1.42, BUILDING.x1 - 1.2, BUILDING.z0 + 1.2, BUILDING.z1 - 1.2],
      ]) {
        root.add(box({
          size: [x1 - x0, 0.62, z1 - z0],
          pos: [(x0 + x1) / 2, ROOF_Y1 + 0.31, (z0 + z1) / 2],
          mat: M_MARBLE_DK,
          cast: false,
          name: 'roof-parapet',
        }));
        root.add(box({
          size: [x1 - x0 + 0.14, 0.09, z1 - z0 + 0.14],
          pos: [(x0 + x1) / 2, ROOF_Y1 + 0.66, (z0 + z1) / 2],
          mat: M_GOLD,
          cast: false,
          name: 'roof-parapet-cope',
        }));
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
    for (const s of roofSegs) {
      const y0 = s.full ? ROOF_Y0 : ROOF_Y0 + 0.01;
      const y1 = s.full ? ROOF_Y1 : ROOF_Y1 - 0.01;
      root.add(box({
        size: [s.x1 - s.x0, y1 - y0, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, (y0 + y1) / 2, (s.z0 + s.z1) / 2],
        mat: M_ROOF,
        name: 'roof-slab',
      }));
    }
    for (const [x0, x1, z0, z1] of [
      [BUILDING.x0 - 0.4, BUILDING.x1 + 0.4, zS0 - 0.05, zS0 + 0.1],
      [BUILDING.x0 - 0.4, BUILDING.x1 + 0.4, zN1 - 0.1, zN1 + 0.05],
      [xW0 - 0.05, xW0 + 0.1, BUILDING.z0 - 0.4, BUILDING.z1 + 0.4],
      [xE1 - 0.1, xE1 + 0.05, BUILDING.z0 - 0.4, BUILDING.z1 + 0.4],
    ]) {
      root.add(box({
        size: [x1 - x0, 0.1, z1 - z0], pos: [(x0 + x1) / 2, ROOF_Y0 + 0.02, (z0 + z1) / 2], mat: M_GOLD,
      }));
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
    for (const s of podiumSegs) {
      const m = box({
        size: [s.x1 - s.x0, GROUND_Y, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, GROUND_Y / 2, (s.z0 + s.z1) / 2],
        mat: M_PODIUM,
      });
      root.add(m);
      occluders.push(m);
    }
    const upperSegs = [
      { x0: BUILDING.x0, x1: FOYER_VOID.x0, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: FOYER_VOID.x1, x1: BUILDING.x1, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: FOYER_VOID.x0, x1: FOYER_VOID.x1, z0: FOYER_VOID.z1, z1: BUILDING.z1 },
    ];
    for (const s of upperSegs) {
      const m = box({
        size: [s.x1 - s.x0, 0.28, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, UPPER_Y - 0.14, (s.z0 + s.z1) / 2],
        mat: M_PODIUM,
      });
      root.add(m);
      occluders.push(m);
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
    for (const s of [
      { x0: BASEMENT_ROOM.x0, x1: BASEMENT_SHAFT.x0, z0: BASEMENT_ROOM.z0, z1: BASEMENT_ROOM.z1 },
      { x0: BASEMENT_SHAFT.x0, x1: BASEMENT_ROOM.x1, z0: BASEMENT_ROOM.z0, z1: BASEMENT_SHAFT.z0 },
      { x0: BASEMENT_SHAFT.x0, x1: BASEMENT_ROOM.x1, z0: BASEMENT_SHAFT.z1, z1: BASEMENT_ROOM.z1 },
    ]) {
      root.add(box({
        size: [s.x1 - s.x0, 0.12, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, -0.16, (s.z0 + s.z1) / 2],
        mat: M_BASEMENT_CEIL,
      }));
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
  function buildLoungeChair(x, y, z, yaw, { towel = false } = {}) {
    const g = new THREE.Group();
    g.name = 'pool-lounger';
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
    solid(x - hx, x + hx, y, y + 0.55, z - hz, z + hz);
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
    for (const [x0, x1, z0, z1] of deckSegs) {
      root.add(box({
        size: [x1 - x0, 0.1, z1 - z0], pos: [(x0 + x1) / 2, GROUND_Y - 0.05, (z0 + z1) / 2], mat: M_DECK,
      }));
    }
    root.add(box({
      size: [POOL.x1 - POOL.x0, 0.1, POOL.z1 - POOL.z0],
      pos: [0, POOL.y - 0.05, 85],
      mat: M_POOL_LINER,
    }));
    const pw = 0.5;
    const wallSegs = [
      [POOL.x0 - pw, POOL.x0, POOL.z0 - pw, POOL.z1 + pw],
      [POOL.x1, POOL.x1 + pw, POOL.z0 - pw, POOL.z1 + pw],
      [POOL.x0 - pw, POOL.x1 + pw, POOL.z0 - pw, POOL.z0],
      [POOL.x0 - pw, POOL.x1 + pw, POOL.z1, POOL.z1 + pw],
    ];
    for (const [x0, x1, z0, z1] of wallSegs) {
      root.add(box({
        size: [x1 - x0, GROUND_Y - POOL.y, z1 - z0],
        pos: [(x0 + x1) / 2, (GROUND_Y + POOL.y) / 2, (z0 + z1) / 2],
        mat: M_POOL_WALL,
      }));
      solid(x0, x1, POOL.y, GROUND_Y, z0, z1);
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
      [POOL.x0 - pw, POOL.x1 + pw, POOL.z0 - pw, POOL.z0],
      [POOL.x0 - pw, POOL.x1 + pw, POOL.z1, POOL.z1 + pw],
      [POOL.x0 - pw, POOL.x0, POOL.z0, POOL.z1],
      [POOL.x1, POOL.x1 + pw, POOL.z0, POOL.z1],
    ]) {
      root.add(box({
        size: [cx1 - cx0, 0.05, cz1 - cz0],
        pos: [(cx0 + cx1) / 2, GROUND_Y + 0.015, (cz0 + cz1) / 2],
        mat: M_GOLD,
        cast: false,
      }));
    }

    const poolLight = new THREE.PointLight(0x4ad9ff, 2.6, 30, 2);
    poolLight.position.set(poolCx, poolWaterY + 0.4, poolCz);
    root.add(poolLight);

    /* A little water fountain in the pool (owner playtest 2026-08-04). A
     * stone plinth standing on the basin floor at the north end, a bowl just
     * clear of the water, and the same FountainSpray the driveway fountain
     * uses -- one class, two fountains, rather than a second particle rig. */
    const featureZ = POOL.z1 - 1.9;
    root.add(cylinder({
      r: 0.85, h: poolWaterY - POOL.y - 0.1, pos: [poolCx, (POOL.y + poolWaterY - 0.1) / 2, featureZ], mat: M_POOL_WALL,
    }));
    root.add(cylinder({
      r: 1.05, h: 0.12, pos: [poolCx, poolWaterY + 0.02, featureZ], mat: M_MARBLE_DK,
    }));
    root.add(cylinder({
      rTop: 0.42, rBottom: 0.3, h: 0.5, pos: [poolCx, poolWaterY + 0.33, featureZ], mat: M_MARBLE,
    }));
    root.add(cylinder({
      r: 0.82, h: 0.1, pos: [poolCx, poolWaterY + 0.62, featureZ], mat: M_GOLD,
    }));
    const featureBowlMat = makeWaterMaterial({ deep: 0x0e4552, shallow: 0x36b6d2 });
    const featureBowl = new THREE.Mesh(new THREE.CircleGeometry(0.74, 28), featureBowlMat);
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
    solid(poolCx - 1.1, poolCx + 1.1, POOL.y, GROUND_Y, featureZ - 1.1, featureZ + 1.1);

    const chairs = [
      [-10.6, 79.4, Math.PI / 2, true], [-10.6, 82.6, Math.PI / 2, false],
      [-10.6, 85.8, Math.PI / 2, true], [-10.6, 89.0, Math.PI / 2, false],
      [10.6, 79.4, -Math.PI / 2, false], [10.6, 82.6, -Math.PI / 2, true],
      [10.6, 85.8, -Math.PI / 2, false], [10.6, 89.0, -Math.PI / 2, true],
    ].map(([x, z, yaw, towel]) => buildLoungeChair(x, GROUND_Y, z, yaw, { towel }));
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
    for (const [lx, lz] of [[-8.9, 80.6], [8.9, 80.6], [-8.9, 89.4], [8.9, 89.4]]) {
      const l = new THREE.PointLight(0xffd9a8, 24, 20, 2);
      l.position.set(lx, GROUND_Y + 3.0, lz);
      root.add(l);
      root.add(cylinder({ r: 0.06, h: 3.0, pos: [lx, GROUND_Y + 1.5, lz], mat: M_LAMP_POST }));
      root.add(cylinder({
        rTop: 0.22, rBottom: 0.1, h: 0.2, pos: [lx, GROUND_Y + 3.16, lz], mat: M_LAMP_POST,
      }));
      root.add(sphere({
        r: 0.15,
        pos: [lx, GROUND_Y + 3.02, lz],
        mat: mat({ color: 0xffe6bc, roughness: 0.4, emissive: 0xffdca0, emissiveIntensity: 1.6 }),
      }));
      solid(lx - 0.12, lx + 0.12, GROUND_Y, GROUND_Y + 3.0, lz - 0.12, lz + 0.12);
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
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      root.add(box({
        size: [(stepsX1 - stepsX0) / 6 + 0.06, 0.16, stepsZ1 - stepsZ0],
        pos: [
          THREE.MathUtils.lerp(stepsX0, stepsX1, t),
          THREE.MathUtils.lerp(0, GROUND_Y, t) + 0.08,
          (stepsZ0 + stepsZ1) / 2,
        ],
        mat: M_DECK,
      }));
    }
    for (const sz of [stepsZ0, stepsZ1]) {
      root.add(box({
        size: [stepsX1 - stepsX0, GROUND_Y + 0.5, 0.22],
        pos: [(stepsX0 + stepsX1) / 2, (GROUND_Y + 0.5) / 2 - 0.4, sz],
        mat: M_POOL_WALL,
      }));
      solid(stepsX0, stepsX1, 0, GROUND_Y + 0.1, sz - 0.13, sz + 0.13);
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
      { x0: -8.8, x1: -5.2, z0: deckRect.z1, z1: deckRect.z1 + 4.0 },
      { x0: 5.2, x1: 8.8, z0: deckRect.z1, z1: deckRect.z1 + 4.0 },
    ];
    for (const st of gardenStairs) {
      const treads = 8;
      for (let i = 0; i < treads; i++) {
        const t = i / treads;
        const z = THREE.MathUtils.lerp(st.z0, st.z1, t);
        root.add(box({
          size: [st.x1 - st.x0, 0.16, (st.z1 - st.z0) / treads + 0.06],
          pos: [(st.x0 + st.x1) / 2, THREE.MathUtils.lerp(GROUND_Y, 0, t) + 0.08, z],
          mat: M_DECK,
          name: 'garden-step',
        }));
      }
      // Raking cheek walls with a ball finial on each newel, both sides.
      for (const cx of [st.x0 - 0.22, st.x1 + 0.22]) {
        for (let i = 0; i < 8; i++) {
          const za = THREE.MathUtils.lerp(st.z0, st.z1, i / 8);
          const zb = THREE.MathUtils.lerp(st.z0, st.z1, (i + 1) / 8);
          const top = THREE.MathUtils.lerp(GROUND_Y, 0, i / 8) + 0.95;
          root.add(box({
            size: [0.44, top, zb - za], pos: [cx, top / 2, (za + zb) / 2], mat: brickMaterial(0.5, top),
          }));
          root.add(box({
            size: [0.56, 0.12, zb - za], pos: [cx, top + 0.06, (za + zb) / 2], mat: M_COPING, cast: false,
          }));
          solid(cx - 0.24, cx + 0.24, 0, top, za, zb);
        }
        root.add(sphere({ r: 0.24, pos: [cx, GROUND_Y + 1.2, st.z0 + 0.2], mat: M_COPING }));
        root.add(sphere({ r: 0.24, pos: [cx, 1.2, st.z1 - 0.2], mat: M_COPING }));
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
    for (const [sx0, sx1, sz0, sz1] of skirtSegs) {
      root.add(box({
        size: [sx1 - sx0, GROUND_Y, sz1 - sz0],
        pos: [(sx0 + sx1) / 2, GROUND_Y / 2, (sz0 + sz1) / 2],
        mat: M_DECK_SKIRT,
        name: 'pool-deck-skirt',
      }));
      solid(sx0, sx1, 0, GROUND_Y - 0.02, sz0, sz1);
      // Projecting coping over the fascia head.
      const outX0 = sx0 === deckRect.x0 ? sx0 - 0.14 : sx0;
      const outX1 = sx1 === deckRect.x1 ? sx1 + 0.14 : sx1;
      const outZ1 = sz1 === deckRect.z1 ? sz1 + 0.14 : sz1;
      root.add(box({
        size: [outX1 - outX0, 0.1, outZ1 - sz0],
        pos: [(outX0 + outX1) / 2, GROUND_Y - 0.05, (sz0 + outZ1) / 2],
        mat: M_MARBLE_DK,
        cast: false,
      }));
    }
    // Cheek walls returning the skirt into the garden steps' own opening.
    for (const sz of [stepsZ0, stepsZ1]) {
      root.add(box({
        size: [skirtT, GROUND_Y, 0.22],
        pos: [deckRect.x0 + skirtT / 2, GROUND_Y / 2, sz + (sz === stepsZ0 ? -0.11 : 0.11)],
        mat: M_DECK_SKIRT,
        cast: false,
      }));
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
      steps: {
        x0: stepsX0, x1: stepsX1, z0: stepsZ0, z1: stepsZ1,
      },
      /** The two flights down off the north edge into the formal garden.
       * Resolved by src/mansion/main.js's exteriorGroundAt, like every other
       * lerp-stepped run on this property. */
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
    function estateRun(axis, at, from, to) {
      const len = to - from;
      const mid = (from + to) / 2;
      const put = (t, y0, y1, material, cast = true) => {
        root.add(box({
          size: axis === 'z' ? [len, y1 - y0, t] : [t, y1 - y0, len],
          pos: axis === 'z' ? [mid, (y0 + y1) / 2, at] : [at, (y0 + y1) / 2, mid],
          mat: material,
          cast,
        }));
      };
      put(W.t, 0, W.h, brickMaterial(len, W.h));
      put(W.t + 0.16, 0, 0.42, brickMaterial(len, 0.6), false);   // plinth
      put(W.t + 0.2, W.h, W.h + 0.14, M_COPING, false);           // coping
      if (axis === 'z') solid(from, to, 0, W.h, at - W.t / 2, at + W.t / 2);
      else solid(at - W.t / 2, at + W.t / 2, 0, W.h, from, to);
      for (let p = from; p <= to + 0.01; p += 6) {
        const px = axis === 'z' ? p : at;
        const pz = axis === 'z' ? at : p;
        root.add(box({
          size: [0.95, W.h + 0.5, 0.95], pos: [px, (W.h + 0.5) / 2, pz], mat: brickMaterial(1, W.h),
        }));
        root.add(box({
          size: [1.15, 0.16, 1.15], pos: [px, W.h + 0.58, pz], mat: M_COPING, cast: false,
        }));
        root.add(sphere({ r: 0.3, pos: [px, W.h + 0.86, pz], mat: M_COPING }));
        solid(px - 0.5, px + 0.5, 0, W.h + 0.5, pz - 0.5, pz + 0.5);
      }
    }
    estateRun('x', W.x0 + W.t / 2, W.z0, W.z1);
    estateRun('x', W.x1 - W.t / 2, W.z0, W.z1);
    estateRun('z', W.z1 - W.t / 2, W.x0, W.x1);

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
        size: [gx1 - gx0, 0.06, gz1 - gz0],
        pos: [(gx0 + gx1) / 2, 0.03, (gz0 + gz1) / 2],
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
        for (const [ex0, ex1, ez0, ez1] of [
          [px0 - 0.24, px1 + 0.24, bz0 - 0.24, bz0],
          [px0 - 0.24, px1 + 0.24, bz1, bz1 + 0.24],
          [px0 - 0.24, px0, bz0, bz1],
          [px1, px1 + 0.24, bz0, bz1],
        ]) {
          root.add(box({
            size: [ex1 - ex0, 0.34, ez1 - ez0],
            pos: [(ex0 + ex1) / 2, 0.17, (ez0 + ez1) / 2],
            mat: brickMaterial(Math.max(ex1 - ex0, ez1 - ez0), 0.4),
            cast: false,
          }));
        }
        bed(px0, px1, bz0, bz1);
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
    const GATE_W = 2.6;
    const gateZ = (R.z0 + R.z1) / 2;
    // West wall (facing the axis), broken by a moon-gate arch.
    for (const [wz0, wz1] of [[R.z0, gateZ - GATE_W / 2], [gateZ + GATE_W / 2, R.z1]]) {
      root.add(box({
        size: [R.t, R.wall, wz1 - wz0],
        pos: [R.x0, R.wall / 2, (wz0 + wz1) / 2],
        mat: brickMaterial(R.t, R.wall),
      }));
      root.add(box({
        size: [R.t + 0.18, 0.12, wz1 - wz0], pos: [R.x0, R.wall + 0.06, (wz0 + wz1) / 2], mat: M_COPING, cast: false,
      }));
      solid(R.x0 - R.t / 2, R.x0 + R.t / 2, 0, R.wall, wz0, wz1);
    }
    /* The arch head over the gate: a half-torus of brick, which is what makes
     * an opening in a garden wall read as a gate rather than a hole.
     *
     * AND THE HEAD THAT CARRIES IT. The arch springs at y = wall - 0.5 = 1.8
     * and is a full half-round of radius 1.3, so its crown reaches 3.35 --
     * measured -- against a wall that stops at 2.30 and a coping at 2.42. The
     * top metre of the arch stood out of the top of the wall in open air, and
     * the box that was supposed to close the spandrel above it was authored
     * with a NEGATIVE height: `wall - (wall - 0.5) - GATE_W/2 + 0.6` evaluates
     * to -0.2, and `box()` scales a shared unit cube, so a negative size is a
     * mirrored cube -- wound inside out and therefore invisible from the
     * garden. It was the one inverted mesh in the whole scene.
     *
     * A gateway in a garden wall carries its arch in a RAISED HEAD, so that is
     * what this is now: a block of the same brick from the wall head up over
     * the crown, wider than the opening, with the wall's own coping course
     * carried across it. Positive dimensions throughout. */
    {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(GATE_W / 2, R.t / 2, 8, 22, Math.PI),
        brickMaterial(4, 1),
      );
      arch.position.set(R.x0, R.wall - 0.5, gateZ);
      arch.rotation.y = Math.PI / 2;
      root.add(arch);
      /* Top of the arch's own TUBE, not of its centre line: the half-torus has
       * radius GATE_W/2 and tube R.t/2, so its outer profile reaches 3.35 at
       * the crown and is still 2.64 -- above the wall -- out at the springing.
       * The head is therefore 0.6 m wider than the opening (the tube spreads
       * to +/-1.55 of the centre line) and stands 25 cm proud of the crown. */
      const archTop = (R.wall - 0.5) + GATE_W / 2 + R.t / 2; // 3.35
      const headTop = archTop + 0.25;
      const headW = GATE_W + 0.6;
      root.add(box({
        size: [R.t, headTop - R.wall, headW],
        pos: [R.x0, (R.wall + headTop) / 2, gateZ],
        mat: brickMaterial(headW, headTop - R.wall),
        name: 'rose-gate-head',
      }));
      root.add(box({
        size: [R.t + 0.18, 0.12, headW + 0.2],
        pos: [R.x0, headTop + 0.06, gateZ],
        mat: M_COPING,
        cast: false,
        name: 'rose-gate-coping',
      }));
      const gateLamp = new THREE.PointLight(0xffca7a, 6, 12, 2);
      gateLamp.position.set(R.x0 - 0.9, 2.5, gateZ);
      root.add(gateLamp);
      lanterns.push(gateLamp);
    }
    // South, north and east walls, unbroken except a service gap at the south
    // east corner so the compartment is never a single-exit trap.
    for (const [wx0, wx1, wz0, wz1] of [
      [R.x0, R.x1 - 3.2, R.z0 - R.t / 2, R.z0 + R.t / 2],
      [R.x0, R.x1, R.z1 - R.t / 2, R.z1 + R.t / 2],
    ]) {
      root.add(box({
        size: [wx1 - wx0, R.wall, wz1 - wz0], pos: [(wx0 + wx1) / 2, R.wall / 2, (wz0 + wz1) / 2], mat: brickMaterial(wx1 - wx0, R.wall),
      }));
      root.add(box({
        size: [wx1 - wx0, 0.12, wz1 - wz0 + 0.18], pos: [(wx0 + wx1) / 2, R.wall + 0.06, (wz0 + wz1) / 2], mat: M_COPING, cast: false,
      }));
      solid(wx0, wx1, 0, R.wall, wz0, wz1);
    }
    root.add(box({
      size: [R.t, R.wall, R.z1 - R.z0], pos: [R.x1, R.wall / 2, (R.z0 + R.z1) / 2], mat: brickMaterial(R.t, R.wall),
    }));
    solid(R.x1 - R.t / 2, R.x1 + R.t / 2, 0, R.wall, R.z0, R.z1);
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
      root.add(cylinder({
        rTop: 0.34, rBottom: 0.28, h: 0.34, pos: [bx, 0.17, bz], mat: brickMaterial(0.8, 0.4), cast: false,
      }));
      bloomClump(bx, bz, 0.3, 1.35);
      /* Standard roses on clear stems, alternating with the low clumps --
       * counted OUTWARD FROM THE WALK on each side rather than off the raw
       * index, so the two halves of the ring mirror each other across the
       * garden's axis instead of running one station out of step. */
      const fromWalk = i < 8 ? i : 15 - i;
      if (fromWalk % 2 === 0) {
        root.add(cylinder({ r: 0.045, h: 1.2, pos: [bx, 0.94, bz], mat: M_TEAK }));
        root.add(sphere({ r: 0.42, ry: 0.34, pos: [bx, 1.7, bz], mat: M_FOLIAGE, cast: false }));
        for (let k = 0; k < 5; k++) {
          const ka = (k / 5) * Math.PI * 2;
          root.add(sphere({
            r: 0.085,
            pos: [bx + Math.cos(ka) * 0.28, 1.78, bz + Math.sin(ka) * 0.28],
            mat: BLOOM_MATS[(fromWalk + k) % BLOOM_MATS.length],
            cast: false,
          }));
        }
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
      root.add(cylinder({ r: 0.16, h: 3.4, pos: [cx, 2.32, cz], mat: M_MARBLE }));
      root.add(cylinder({ rTop: 0.28, rBottom: 0.2, h: 0.24, pos: [cx, 4.14, cz], mat: M_MARBLE, cast: false }));
      root.add(cylinder({ rTop: 0.2, rBottom: 0.28, h: 0.2, pos: [cx, 0.72, cz], mat: M_MARBLE, cast: false }));
      solid(cx - 0.2, cx + 0.2, 0, 3.4, cz - 0.2, cz + 0.2);
    }
    root.add(cylinder({ r: P.r + 0.6, h: 0.34, pos: [P.x, 4.43, P.z], mat: M_MARBLE_DK, cast: false }));
    root.add(cylinder({ r: P.r + 0.75, h: 0.14, pos: [P.x, 4.66, P.z], mat: M_GOLD, cast: false }));
    {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(P.r + 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        M_ROOF,
      );
      dome.position.set(P.x, 4.7, P.z);
      dome.castShadow = true;
      root.add(dome);
      root.add(cylinder({ r: 0.26, h: 0.7, pos: [P.x, 9.2, P.z], mat: M_GOLD }));
      root.add(sphere({ r: 0.38, pos: [P.x, 9.75, P.z], mat: M_GOLD }));
    }
    // The bronze under the dome: the family's own mark, at the end of the walk.
    const bronze = new THREE.Group();
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
    solid(P.x - 1.0, P.x + 1.0, 0, 3.2, P.z - 1.0, P.z + 1.0);
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
      root.add(named(cylinder({ r: 0.09, h: 2.9, pos: [x, 1.45, z], mat: M_IRON }), 'garden-lamp-post'));
      for (const py of [2.895, 3.345]) {
        root.add(box({
          size: [0.44, 0.05, 0.44], pos: [x, py, z], mat: M_LANTERN_CASE, name: 'garden-lamp-case',
        }));
      }
      for (const [bx, bz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        root.add(box({
          size: [0.04, 0.4, 0.04], pos: [x + bx, 3.12, z + bz], mat: M_LANTERN_CASE, cast: false, name: 'garden-lamp-case',
        }));
      }
      root.add(named(sphere({
        r: 0.17,
        pos: [x, 3.1, z],
        mat: mat({ color: 0xffe6bc, roughness: 0.4, emissive: 0xffdca0, emissiveIntensity: 1.7 }),
        cast: false,
      }), 'garden-lamp-globe'));
      root.add(named(cylinder({
        rTop: 0.02, rBottom: 0.26, h: 0.3, pos: [x, 3.5, z], mat: M_IRON, cast: false,
      }), 'garden-lamp-finial'));
      const l = new THREE.PointLight(0xffd2a0, 16, 15, 2);
      l.position.set(x, 3.1, z);
      root.add(l);
      lanterns.push(l);
      solid(x - 0.14, x + 0.14, 0, 2.9, z - 0.14, z + 0.14);
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
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const bx = firePit.x + Math.cos(a) * 3.4;
      const bz = firePit.z + Math.sin(a) * 3.4;
      /* Tangent to the ring: -(a + PI/2). At -a the benches splay outward like
       * a starburst -- the same arithmetic slip the winter garden's lily basin
       * had, and just as obvious once you look at it. */
      const tangent = -(a + Math.PI / 2);
      root.add(box({
        size: [1.2, 0.5, 0.7], pos: [bx, 0.25, bz], mat: brickMaterial(1.3, 0.6), rotY: tangent, cast: false,
      }));
      root.add(box({
        size: [1.25, 0.08, 0.78], pos: [bx, 0.53, bz], mat: M_COPING, rotY: tangent, cast: false,
      }));
      solid(bx - 0.5, bx + 0.5, 0, 0.55, bz - 0.5, bz + 0.5);
    }
    root.add(cylinder({ r: 1.35, h: 0.62, pos: [firePit.x, 0.31, firePit.z], mat: brickMaterial(4, 0.7) }));
    root.add(cylinder({ r: 1.5, h: 0.1, pos: [firePit.x, 0.65, firePit.z], mat: M_COPING, cast: false }));
    root.add(cylinder({
      r: 1.15,
      h: 0.14,
      pos: [firePit.x, 0.7, firePit.z],
      mat: mat({ color: 0x14100c, roughness: 1 }),
      cast: false,
    }));
    const fireFlame = sphere({
      r: 0.5,
      ry: 0.72,
      pos: [firePit.x, 1.05, firePit.z],
      mat: mat({
        color: 0x000000, emissive: 0xff8a2c, emissiveIntensity: 2.2, roughness: 1, unique: true,
      }),
      cast: false,
    });
    root.add(fireFlame);
    const fireLight = new THREE.PointLight(0xff8a3c, 20, 18, 2);
    fireLight.position.set(firePit.x, 1.2, firePit.z);
    root.add(fireLight);
    lanterns.push(fireLight);
    torchFlames.push({
      flame: fireFlame, light: fireLight, baseIntensity: 20, seed: 3.7,
    });
    solid(firePit.x - 1.5, firePit.x + 1.5, 0, 0.75, firePit.z - 1.5, firePit.z + 1.5);

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
    function hedgeRun(ax0, ax1, az0, az1) {
      root.add(box({
        size: [ax1 - ax0, H, az1 - az0],
        pos: [(ax0 + ax1) / 2, H / 2, (az0 + az1) / 2],
        mat: M_YEW,
        name: 'maze-hedge',
      }));
      root.add(box({
        size: [ax1 - ax0 - 0.08, 0.06, az1 - az0 - 0.08],
        pos: [(ax0 + ax1) / 2, H, (az0 + az1) / 2],
        mat: M_YEW_TOP,
        cast: false,
      }));
      solid(ax0, ax1, 0, H, az0, az1);
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
    fountain,
    vehicles,
    carSpots: CAR_SPOTS,
    securityBooth,
    frontEntry,
    serviceRoad,
    poolPatio,
    rearGarden,
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
    root, colliders, doors, props, anchors, shell, lights, occluders, update,
  };
}
