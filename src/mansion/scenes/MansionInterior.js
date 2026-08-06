/**
 * Lou's mansion -- interior fit-out.
 *
 * REWORKED 2026-08-04 to the owner's playtest brief, verbatim:
 *
 *   "I want the Conference room to be at the top of the stairs and the stairs
 *    to be a big horse shoe with two sets of stairs going up with the balcony
 *    in the middle and when you walk in the foyer is a big open area leading
 *    to that horseshoe stair case. I want the conference room then behind it
 *    Lous office up there at the top of the stairs in the middle. Then bed
 *    rooms on the side."
 *
 * So, in plan:
 *
 *        UPPER                                  GROUND
 *   +----+------------+----+              +----+------------+----+
 *   |bath|  LOU'S     |bath|              |    |            |    |
 *   +----+  OFFICE    +----+              | DIN|  BALLROOM  |KIT |
 *   |bed |            |bed |              |    |            |    |
 *   | W  | CONFERENCE | E  |              +----+------------+----+
 *   |rear|   ROOM     |rear|              |    | ///  \\\   |    |
 *   +----+------------+----+              |LIV | //FOYER\\  |LNGE|
 *   |      G A L L E R Y   |   <- top     |    |// horse \\ |    |
 *   +----+------------+----+      of      |    |/  shoe   \||    |
 *   |bed |\\   ..   //|bed |     the      |    |   [door]   |    |
 *   | W  | \\ [bay] //| E  |    stairs    +----+-----++-----+----+
 *   |front|  <void>   |front|                        ||
 *   +----+------------+----+                     front door
 *
 * Two flights climb the foyer's flanks (STAIR_WEST / STAIR_EAST), meet on the
 * gallery slab at z=48, and the balcony bay (BALCONY) hangs out over the void
 * between them. Straight ahead off the balcony is the conference room; behind
 * the conference room is Lou's office; the bedrooms are down both sides.
 *
 * WHY THE BASEMENT NOW WORKS. The previous stair descended inside the hall's
 * own footprint, and `floorAt()` offered the flat hall floor as a candidate
 * everywhere in that footprint. Its resolution rule is "the highest surface
 * within one step of your feet", so on the way down the flat floor was always
 * higher than the tread you were trying to reach, and always within a step --
 * it won every frame. You walked out over the stairwell at ground level and
 * could not descend at all, from any direction. The fix is structural rather
 * than a tolerance tweak: the ground floor now has a real HOLE in it
 * (BASEMENT_SHAFT, cut out of the podium by MansionGrounds.js), and inside
 * that rect the descending stair is the only candidate offered.
 *
 * Built from primitives via world/build.js, plus the shared apartment prop
 * library (world/props.js + world/materials.js) for beds, baths, plants and
 * frames -- the same way src/silver/room.js dresses the Silver Room rather
 * than re-carving a bed out of boxes.
 */
import * as THREE from 'three';
import {
  mat, box, cylinder, sphere, collider, group,
} from '../../world/build.js';
import {
  rugTex, fabricTex, tileTex, woodFloor, laminate,
} from '../../world/textures.js';
import { tiled, squatchArt, printed } from '../../bing/kit.js';
import { makeMaterials } from '../../world/materials.js';
import {
  makeBed, makeNightstand, makePlant, makeFloorLamp, makeFrame,
  makeToilet, makeTub, makeWhiskeyBottle, makeShotGlass,
  makeAshtray, makeBooks, makeWallClock, makeDesk, makeChair, makeBeerCan,
  makePizzaBox,
} from '../../world/props.js';
import { resolveGear } from '../../world/gear.js';
/* NO PEOPLE ARE BUILT IN THIS FILE. It used to import the club's figure
 * builder and the wardrobe to sit a Big Uncle Lou in the office carver, on the
 * grounds that the house had "Lou's name on four things in it and Lou in none
 * of them" -- which was true when it was written and stopped being true one
 * pass later, when `../cast.js` posted him behind the same desk. Both mounted,
 * 1.7 m apart, and the player met the same man twice. This file is the
 * BUILDING; `../cast.js` is the PEOPLE. See `buildOffice()`. */
/* The Squatch Smash player rig, cast in gold as the trophy's finial -- the
 * same import MansionGrounds.js makes for the fountain monument and the
 * garden bronze. One model, three statues; this file adds no new sculpt. */
import { Sasquatch } from '../../../game/src/player.js';
import {
  GROUND_Y, UPPER_Y, UPPER_CEILING_Y, BASEMENT_Y, BUILDING,
  FOYER_VOID, BASEMENT_ROOM, BASEMENT_SHAFT, LOUNGE_BAY,
  TROPHY_HALL, WINTER_GARDEN, WEST_WING, WING_ROOF_Y0,
  BASEMENT_WING, CELLAR_HALL, GUEST_ROOM, THEATRE, THEATRE_TIER,
  LAN_ROOM, VAULT, CELLAR_DOOR,
  SUITE_Y, SUITE_CEILING_Y, MASTER_SUITE, SUITE_STAIR_WELL,
  makeWaterMaterial,
} from './MansionGrounds.js';

/* ================================================================== */
/* THE SQUATCH LOGOS (owner playtest 2026-08-04, verbatim):            */
/*                                                                      */
/*   "Lets also take artwork from the apartment. All the Squatch logos. */
/*    and use them at least once."                                      */
/*                                                                      */
/* These are the apartment's own gear slots -- the same resolveGear()   */
/* pipeline src/world/apartment.js, src/bing/club.js and the            */
/* Squatchfather all use. Each slot is pointed at one of the seven      */
/* Silver Sasquatches logo files already in assets/art/ by              */
/* assets/art/manifest.json, so nothing new is fetched and the preview   */
/* bundle grows by a few hundred bytes of JSON rather than an image.     */
/* A slot whose file fails to load keeps the procedurally drawn crest    */
/* it was built with, exactly as every other scene does.                 */
/* ================================================================== */
export const MANSION_ART_SLOTS = [
  'mansion.foyer.crest',
  'mansion.lounge.banner',
  'mansion.bay.shield',
  'mansion.conference.crest',
  'mansion.gallery.pride',
  'mansion.ballroom.backdrop',
  'mansion.office.shield',
  /* Owner, on walking his own house: "we had another commit or a pass which
   * should have added a bunch of art to the mansion I did not see." The pass
   * had run -- all sixteen slots were filled -- but every one of them pointed
   * at one of seven LOGO files, so he passed the same club crest seven times
   * and correctly read the walls as empty. The slots now carry photographs
   * (see assets/art/manifest.json); a crest is kept only where a crest is the
   * right object -- over the front doors, behind Lou's own desk, and printed
   * on the LAN chairs. This is the one picture in assets/art/ that was named
   * for a room in this house and had never been hung in it. */
  'mansion.office.hogmama',
  'mansion.basement.shield',
  // Third pass: the west wing and the lower level.
  'mansion.trophy.crest',
  'mansion.winter.shield',
  'mansion.cellar.crest',
  'mansion.theatre.banner',
  'mansion.lan.banner',
  /* Owner brief, verbatim: "for the gamer chairs add the squatch logo to the
   * chairs in this gamer room". One slot, six chairs -- `dressArtSlots` below
   * takes a list of meshes per slot for exactly this. */
  'mansion.lan.chairs',
  'mansion.guest.art',
  'mansion.vault.mark',
  /* The third floor. ONE slot, over the wet bar — the suite's other badge is
   * a gilt inlay in the marble at the head of the stair, which is drawn
   * rather than hung, because "another crest on another wall" is the exact
   * complaint the last art pass earned. */
  'mansion.suite.crest',
];

/* ================================================================== */
/* Room footprints. Exported so anything else (the composition root,   */
/* the verifier) can query a room's bounds without re-deriving them.   */
/*                                                                      */
/* Partition centre lines: x = -9 and x = +9 divide the centre of the   */
/* house from its two wings; z = 58 divides front rooms from rear ones  */
/* downstairs; upstairs z = 48 / 53 / 63 / 66 divide gallery from       */
/* bedrooms, conference room, office and ensuites.                      */
/* ================================================================== */
const WALL_T = 0.3; // interior partition thickness (exterior walls use 0.4)
const HT = WALL_T / 2;
const W_WEST = -9;
const W_EAST = 9;
const Z_MID = 58;
const Z_GALLERY_S = 48;
const Z_GALLERY_N = 53;
const Z_OFFICE = 63;
const Z_BATH = 66;

/** Ground floor. */
export const FOYER = Object.freeze({
  x0: W_WEST + HT, x1: W_EAST - HT, z0: BUILDING.z0, z1: Z_MID - HT,
});
export const LIVING = Object.freeze({
  x0: BUILDING.x0, x1: W_WEST - HT, z0: BUILDING.z0, z1: Z_MID - HT,
});
export const LOUNGE = Object.freeze({
  x0: W_EAST + HT, x1: BUILDING.x1, z0: BUILDING.z0, z1: Z_MID - HT,
});
export const BALLROOM = Object.freeze({
  x0: W_WEST + HT, x1: W_EAST - HT, z0: Z_MID + HT, z1: BUILDING.z1,
});
export const DINING = Object.freeze({
  x0: BUILDING.x0, x1: W_WEST - HT, z0: Z_MID + HT, z1: BUILDING.z1,
});
export const KITCHEN = Object.freeze({
  x0: W_EAST + HT, x1: BUILDING.x1, z0: Z_MID + HT, z1: BUILDING.z1,
});

/** Upper floor. */
export const GALLERY = Object.freeze({
  x0: BUILDING.x0, x1: BUILDING.x1, z0: Z_GALLERY_S + HT, z1: Z_GALLERY_N - HT,
});
export const CONFERENCE = Object.freeze({
  x0: W_WEST + HT, x1: W_EAST - HT, z0: Z_GALLERY_N + HT, z1: Z_OFFICE - HT,
});
export const OFFICE = Object.freeze({
  x0: W_WEST + HT, x1: W_EAST - HT, z0: Z_OFFICE + HT, z1: BUILDING.z1,
});
export const BED_WEST_FRONT = Object.freeze({
  x0: BUILDING.x0, x1: W_WEST - HT, z0: BUILDING.z0, z1: Z_GALLERY_S - HT,
});
export const BED_EAST_FRONT = Object.freeze({
  x0: W_EAST + HT, x1: BUILDING.x1, z0: BUILDING.z0, z1: Z_GALLERY_S - HT,
});
export const BED_WEST_REAR = Object.freeze({
  x0: BUILDING.x0, x1: W_WEST - HT, z0: Z_GALLERY_N + HT, z1: Z_BATH - HT,
});
export const BED_EAST_REAR = Object.freeze({
  x0: W_EAST + HT, x1: BUILDING.x1, z0: Z_GALLERY_N + HT, z1: Z_BATH - HT,
});
export const BATH_WEST = Object.freeze({
  x0: BUILDING.x0, x1: W_WEST - HT, z0: Z_BATH + HT, z1: BUILDING.z1,
});
export const BATH_EAST = Object.freeze({
  x0: W_EAST + HT, x1: BUILDING.x1, z0: Z_BATH + HT, z1: BUILDING.z1,
});

/** The horseshoe: two flights up the foyer's flanks, balcony bay between. */
export const STAIR_WEST = Object.freeze({
  x0: FOYER_VOID.x0, x1: -5.5, z0: 42, z1: Z_GALLERY_S,
});
export const STAIR_EAST = Object.freeze({
  x0: 5.5, x1: FOYER_VOID.x1, z0: 42, z1: Z_GALLERY_S,
});
/** The balcony in the middle, cantilevered south off the gallery's edge. */
export const BALCONY = Object.freeze({
  x0: -3, x1: 3, z0: 45.2, z1: Z_GALLERY_S,
});
/** The basement stair, descending inside the hole cut through the podium. */
export const BASEMENT_STAIR = Object.freeze({
  x0: BASEMENT_SHAFT.x0, x1: BASEMENT_SHAFT.x1, z0: BASEMENT_SHAFT.z0, z1: BASEMENT_SHAFT.z1,
});
export const CHANDELIER_POS = Object.freeze({ x: 0, y: 8.6, z: 44.4 });

/* ================================================================== */
/* THE THIRD FLOOR — LOU'S MASTER SUITE, AND THE WAY UP TO IT           */
/*                                                                       */
/* Owner, verbatim: "It was supposed to be on the third floor -- ultra    */
/* over-the-top luxury bedroom, hot tub with girls, the dog, and          */
/* everything. Canopy bed. Big TV. Cool lighting."                        */
/*                                                                         */
/* The reveal is bookcase -> hidden stair -> the suite, in that order, and  */
/* the geometry below is the whole of it. The shell (walls, glazing, roof)  */
/* is MansionGrounds.js's; `MASTER_SUITE` and `SUITE_STAIR_WELL` are        */
/* imported from there rather than restated, so the floor this file dresses */
/* and the slab that file pours can never be at two different heights.      */
/*                                                                          */
/* WHERE THE STAIR GOES, AND WHY IT IS THE SHAPE IT IS.                     */
/*                                                                           */
/* The only concealed volume a stair could take out of Lou's office without   */
/* moving anything he asked for is the blank stretch of east wall between the  */
/* safe (which ends at z = 64.20) and the chimneypiece (which starts at        */
/* z = 68.90) — 4.5 m of panelling with nothing on it. The hall takes 2.30 m   */
/* of the room's depth off that wall, and the wall it puts back is a run of    */
/* bookcases matching the pair already on the west wall, one leaf of which is   */
/* the door.                                                                    */
/*                                                                               */
/* The rise is fixed at 4.60 m (UPPER_Y 6.0 -> SUITE_Y 10.6), which is 24        */
/* risers of 0.1917 — and 24 risers at any comfortable going is 5.8 m of run,    */
/* which does not fit in 4.3 m of hall in a straight line. So it is a half-turn: */
/* two 12-riser flights side by side with a landing at the north end. 2R + G =   */
/* 0.623 against an ideal 0.63, which is a private stair rather than a           */
/* processional one — correct for the thing it is.                              */
/* ================================================================== */
/** Inner faces of the concealed stair hall, carved out of the office. */
export const SUITE_STAIR_HALL = Object.freeze({
  x0: 6.55, x1: 8.85, z0: 64.55, z1: 68.85,
});
/** The half-landing's height: exactly half the rise. */
export const SUITE_STAIR_LANDING_Y = (UPPER_Y + SUITE_Y) / 2;
/** Up, heading north, out of the lobby just inside the bookcase. */
export const SUITE_FLIGHT_A = Object.freeze({
  x0: 6.66, x1: 7.68, z0: 65.25, z1: 67.89,
});
/** The half-landing you turn on, spanning both flights. */
export const SUITE_HALF_LANDING = Object.freeze({
  x0: 6.66, x1: 8.77, z0: 67.89, z1: SUITE_STAIR_HALL.z1,
});
/** Up again, heading back south, arriving on the suite floor. */
export const SUITE_FLIGHT_B = Object.freeze({
  x0: 7.75, x1: 8.77, z0: SUITE_FLIGHT_A.z0, z1: SUITE_FLIGHT_A.z1,
});
/** The bookcase leaf that opens: its hinge is the hall's own south jamb. */
export const SUITE_SECRET_DOOR = Object.freeze({
  x: 6.55, z0: 64.55, z1: 65.45, y0: UPPER_Y, y1: UPPER_Y + 2.66,
});
/** Re-exported so callers get the suite's plan from the room table like any other room. */
export { MASTER_SUITE, SUITE_Y, SUITE_CEILING_Y, SUITE_STAIR_WELL };

/* ================================================================== */
/* Material palette                                                     */
/* ================================================================== */
const M_MARBLE = mat({ color: 0xe6e0d2, roughness: 0.3 });
const M_MARBLE_DK = mat({ color: 0xb7ae98, roughness: 0.4 });
const M_GOLD = mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 });
const M_SILVER = mat({ color: 0xc8ccd6, roughness: 0.16, metalness: 0.9 });
const M_CHROME = mat({ color: 0xd7dce3, roughness: 0.14, metalness: 0.95 });
const M_BRONZE = mat({ color: 0x8a5a2e, roughness: 0.35, metalness: 0.65 });

const M_WALL = mat({ color: 0xe3dbc8, roughness: 0.85 });
const M_WALL_WARM = mat({ color: 0xd8c8a8, roughness: 0.88 });
const M_WALL_DEEP = mat({ color: 0x35271f, roughness: 0.82 });
const M_WOOD_DK = mat({ color: 0x3a2a1c, roughness: 0.5 });
const M_WOOD = mat({ color: 0x5c4020, roughness: 0.6 });
const M_TRIM = mat({ color: 0xf0e9d8, roughness: 0.6 });
const M_LEATHER_RED = mat({ color: 0x5e161f, roughness: 0.55 });
const M_LEATHER_DK = mat({ color: 0x241a16, roughness: 0.6 });
const M_LEATHER_TAN = mat({ color: 0x6b4a2a, roughness: 0.6 });

const M_GLASS_CASE = mat({
  color: 0xbcd6e0, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.32,
});
const M_SILHOUETTE = mat({ color: 0x0e0e12, roughness: 0.9 });
const M_STEEL = mat({ color: 0xb9bcc0, roughness: 0.35, metalness: 0.75 });
const M_STOVE_BLACK = mat({ color: 0x18181c, roughness: 0.45, metalness: 0.4 });
const M_POT = mat({ color: 0x8a8f96, roughness: 0.3, metalness: 0.7 });
const M_CARD = mat({ color: 0xf2ead8, roughness: 0.5 });
const M_CRATE = mat({ color: 0x4a3a26, roughness: 0.85 });
const M_RACK = mat({ color: 0x2a2e33, roughness: 0.5, metalness: 0.55 });
const M_RACK_BACK = mat({ color: 0x1c1e22, roughness: 0.8 });
const M_BULB_WARM = mat({
  color: 0x000000, emissive: 0xffe3b0, emissiveIntensity: 1.6, roughness: 1, unique: true,
});
const M_BULB_BARE = mat({
  color: 0x000000, emissive: 0xfff0c8, emissiveIntensity: 2.2, roughness: 1, unique: true,
});
const M_CRYSTAL = mat({
  color: 0xdfe8f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6,
});
const M_TROPHY_CUP = mat({ color: 0xd8b23a, roughness: 0.25, metalness: 0.8 });
const M_JERSEY = mat({ color: 0x1c3d7a, roughness: 0.7 });
const M_FELT_GREEN = mat({ color: 0x145a34, roughness: 0.95 });
const M_RUG_LIVING = mat({ map: rugTex(), roughness: 0.9 });
const M_FABRIC_COUCH = mat({ map: fabricTex('#5e161f'), roughness: 0.85 });
const M_FABRIC_CHAIR = mat({ map: fabricTex('#241a16'), roughness: 0.85 });
const M_FABRIC_GOLD = mat({ map: fabricTex('#8a6a24'), roughness: 0.85 });
const M_CURTAIN = mat({ map: fabricTex('#33425a'), roughness: 0.82 });
const M_CURTAIN_RED = mat({ map: fabricTex('#4a1620'), roughness: 0.82 });
const M_PARQUET = mat({ map: tiled(woodFloor(), 14, 14), roughness: 0.55, unique: true });
const M_CARPET_HALL = mat({ map: tiled(fabricTex('#5a1a24'), 6, 3), roughness: 1, unique: true });
const M_DESKTOP = mat({ map: laminate('#2b2118'), roughness: 0.42, unique: true });

/* ---- The third floor's own palette. Gold, marble, velvet, and two
 * emissives — the LED cove and the water in the tub.
 *
 * THE TWO EMISSIVES ARE TUNED FOR THE BLOOM THIS SCENE ACTUALLY MOUNTS
 * (threshold 1.15, strength 0.30). Anything whose colour times its emissive
 * intensity clears 1.15 blooms; anything under it does not. The cove is
 * deliberately just UNDER — 0.55 — because a perimeter band 36 m long that
 * blooms turns the whole room into haze, which is the failure mode a suite
 * lit like this has. The tub's underwater light and the candle bulbs are
 * over, because those are meant to flare: small, bright, and far apart. */
const M_SUITE_VELVET = mat({ map: fabricTex('#5c1226'), roughness: 0.93 });
const M_SUITE_VELVET_DK = mat({ map: fabricTex('#38101c'), roughness: 0.95 });
const M_SUITE_SILK = mat({ map: fabricTex('#c8ae6a'), roughness: 0.42 });
const M_SUITE_CARPET = mat({ map: tiled(fabricTex('#2c1a20'), 8, 6), roughness: 1, unique: true });
const M_SUITE_MARBLE = mat({ color: 0xf2ede0, roughness: 0.22 });
const M_SUITE_ONYX = mat({ color: 0x1b1620, roughness: 0.24, metalness: 0.2 });
const M_SUITE_COVE = mat({
  color: 0x2a2118, emissive: 0xffbe6e, emissiveIntensity: 0.55, roughness: 0.9,
});
const M_SUITE_TUB_LIGHT = mat({
  color: 0x0a2630, emissive: 0x63dfff, emissiveIntensity: 2.1, roughness: 0.4,
});
const M_SUITE_MIRROR = mat({ color: 0xdce6ee, roughness: 0.07, metalness: 0.9 });
const M_SUITE_GLASS = mat({
  color: 0xbfe0e8, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.3,
});

/*
 * Retiled surfaces, MEMOISED by their repeat counts.
 *
 * `tiled()` clones the texture before setting `.repeat` -- that is the point
 * of it -- but a clone is a separate GPU upload, and these two helpers are
 * called from inside per-tread loops. Un-memoised, the basement stair alone
 * minted forty-odd distinct 256x256 textures for four distinct looks, which
 * is texture memory spent on nothing. Keyed on the rounded repeat pair, the
 * whole house costs a handful.
 */
const _tileCache = new Map();
function retiled(base, rx, ry, key, opts) {
  const id = `${key}:${rx}x${ry}`;
  let m = _tileCache.get(id);
  if (!m) {
    m = mat({ map: tiled(base, rx, ry), color: 0xffffff, unique: true, ...opts });
    _tileCache.set(id, m);
  }
  return m;
}
/** Basement concrete: the driveway paver recipe, colder and rougher. */
const concreteBase = tileTex(5, '#2e2b26', '#726c60');
function concreteMaterial(w, h) {
  return retiled(
    concreteBase,
    Math.max(1, Math.round(w / 1.3)),
    Math.max(1, Math.round(h / 1.3)),
    'concrete',
    { roughness: 0.96 },
  );
}
/** Bathroom tiling. */
const bathTileBase = tileTex(4, '#8d8577', '#e7e3d8');
/** ...and the finer mosaic laid into the middle of each ensuite floor. */
const bathMosaicBase = tileTex(3, '#5d6f74', '#cfe0e2');
function bathTileMaterial(w, h) {
  return retiled(
    bathTileBase,
    Math.max(1, Math.round(w / 0.9)),
    Math.max(1, Math.round(h / 0.9)),
    'bathtile',
    { roughness: 0.35 },
  );
}

/* ================================================================== */
/* Canvas-texture labels. There is no shared "label" helper in          */
/* src/world or src/core -- every scene that needs words on a surface   */
/* writes its own small canvas function (motel/level.js's makeSignText, */
/* world/props.js's makeCrossingSign). These follow that idiom.         */
/* ================================================================== */
function makeProjectorScreenTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1a2c';
  g.fillRect(0, 0, 1024, 576);
  g.strokeStyle = '#3a5a78';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 1004, 556);
  g.textAlign = 'center';
  g.fillStyle = '#eaf2ff';
  g.font = '900 74px "Trebuchet MS", sans-serif';
  g.fillText('SILVER SASQUATCHES', 512, 190);
  g.font = '700 46px "Trebuchet MS", sans-serif';
  g.fillStyle = '#bcd6ee';
  g.fillText('ANNUAL SHAREHOLDER MEETING', 512, 270);
  g.font = '700 34px "Trebuchet MS", sans-serif';
  g.fillStyle = '#f0c94a';
  g.fillText('CONFIDENTIAL', 512, 410);
  g.font = '600 26px "Trebuchet MS", sans-serif';
  g.fillStyle = '#8fa4bc';
  g.fillText('DO NOT POST SCREENSHOTS', 512, 470);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A small tournament-flavoured wall banner (abstract, no real logos). */
function makeBannerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#141a2e';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#d8b23a';
  g.fillRect(0, 0, 256, 64);
  g.fillRect(0, 448, 256, 64);
  g.fillStyle = '#e8ecf4';
  g.beginPath();
  g.moveTo(48, 160); g.lineTo(208, 160); g.lineTo(208, 220); g.lineTo(128, 350); g.lineTo(48, 220);
  g.closePath();
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = '#d8b23a';
  g.font = '900 40px "Trebuchet MS", sans-serif';
  g.fillText('CHAMPIONS', 128, 410);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A framed oil portrait of somebody who is definitely not a sasquatch. */
function makePortraitTexture(key, name, tint) {
  return printed(`mansion.portrait.${key}`, [name], {
    w: 320,
    h: 420,
    bg: tint,
    fg: '#e8dcc0',
    font: '700 30px Georgia, serif',
    border: '#3a2a18',
    lineHeight: 34,
  });
}

function inRect(r, x, z) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/* ================================================================== */
/* buildMansionInterior(shell)                                          */
/* ================================================================== */
export function buildMansionInterior(shell = null) {
  const GY = shell?.GROUND_Y ?? GROUND_Y;
  const UY = shell?.UPPER_Y ?? UPPER_Y;
  const UCY = shell?.UPPER_CEILING_Y ?? UPPER_CEILING_Y;
  const BY = shell?.BASEMENT_Y ?? BASEMENT_Y;

  const root = new THREE.Group();
  root.name = 'MansionInterior';
  const colliders = [];
  const doors = {};
  /* Sight blockers for core/interaction.js's look-prompt raycast. That ray is
   * cast only against registered targets plus whatever is handed to
   * setOccluders(), so without this a flavour label is readable straight
   * through the building -- standing in the foyer and being told about Lou's
   * desk two floors up and thirty metres away, which is what happened. Only
   * the walls go in the list, not the whole scene: a couple of hundred meshes
   * is a cheap ray, three and a half thousand is not. */
  const occluders = [];
  const M = makeMaterials();

  /**
   * Tag a mesh a builder did not tag itself.
   *
   * `box()` in world/build.js copies `name` off its options; `cylinder()` and
   * `sphere()` do not, so a name handed to either is quietly dropped and the
   * mesh reaches the scene anonymous. The helpers are shared by every scene in
   * the repo and are not this file's to change, so the pieces here that a
   * verifier needs to find by name -- the sconce shades most of all, since
   * "the shade is the right way up" is a claim about one specific mesh -- are
   * named through this instead.
   */
  function named(mesh, name) {
    mesh.name = name;
    return mesh;
  }

  /** Push a blocker. Walls and furniture only -- never a floor slab. */
  function solid(x0, x1, y0, y1, z0, z1) {
    const c = collider(
      [Math.min(x0, x1), y0, Math.min(z0, z1)],
      [Math.max(x0, x1), y1, Math.max(z0, z1)],
    );
    colliders.push(c);
    return c;
  }

  /* ================================================================== */
  /* THE FLOOR-LEVEL COLLIDER TRAP                                       */
  /*                                                                      */
  /* Owner playtest, third pass, verbatim: "Theres like an invisible wall  */
  /* upstairs in the mansion preventing me from going into the side rooms".*/
  /*                                                                        */
  /* core/player.js skips a collider only when your feet are STRICTLY above  */
  /* its top: `p.y - this.eyeHeight > box.max.y`. A wall whose top is        */
  /* exactly the height of the floor above it is therefore never skipped by  */
  /* anyone standing on that floor. It is an invisible wall on the storey    */
  /* above, made out of a wall you cannot see because it is under your feet. */
  /*                                                                         */
  /* Thirteen of them were built, in two runs, and between them they made     */
  /* the entire upper floor impassable:                                       */
  /*   - x = +/-9, z 48..53 (the ground floor's foyer flank walls) cut the     */
  /*     gallery into three, so from the head of the horseshoe you could      */
  /*     reach neither wing -- no bedroom, no bathroom, either side;          */
  /*   - z = 58 (the ground floor's cross wall) cut the conference room in    */
  /*     half and cut both rear bedrooms in half.                             */
  /* Every one of them is a GROUND-floor wall doing its job correctly on the   */
  /* ground floor. Upstairs there is deliberately no wall in either place --   */
  /* "the gallery upstairs runs clean across the full width of the house".     */
  /*                                                                            */
  /* MansionGrounds.js already knew this hazard and says so where it pours the  */
  /* basement ("The walls stop at y=0 rather than reaching GROUND_Y ... a        */
  /* collider whose top is level with the ground floor's own walking surface     */
  /* is not skipped ... so one that tall would silently block the rooms          */
  /* directly above it"). The interior's partitions never got the same           */
  /* treatment. They do now, in ONE place, so no future wall can reintroduce     */
  /* it: any wall collider landing on a floor datum has its top pulled a clear   */
  /* 0.3 m below it. The MESH is untouched and still meets the slab above, and   */
  /* the collider is still 2.5 m over the head of anyone on the storey the wall  */
  /* belongs to. tools/verify-mansion.mjs asserts the invariant directly as      */
  /* well, because a rule that only lives in a helper is a rule until somebody   */
  /* writes their own helper.                                                    */
  /* ================================================================== */
  const FLOOR_DATUMS = [BY, GY, UY];
  const FLOOR_CLEARANCE = 0.3;
  function wallColliderTop(y1) {
    for (const datum of FLOOR_DATUMS) {
      if (Math.abs(y1 - datum) < 0.05) return y1 - FLOOR_CLEARANCE;
    }
    return y1;
  }

  /** A solid wall segment: mesh + matching collider. */
  function wallSeg(x0, x1, y0, y1, z0, z1, material = M_WALL, tag = 'wall') {
    const m = box({
      size: [x1 - x0, y1 - y0, z1 - z0],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      mat: material,
      name: tag,
    });
    root.add(m);
    occluders.push(m);
    /* Mesh full height, collider clear of the floor above. See the note above
     * `wallColliderTop` -- this one line is the whole fix for the invisible
     * wall across the upper floor. */
    return solid(x0, x1, y0, wallColliderTop(y1), z0, z1);
  }

  /**
   * An interior partition, built as the COMPLEMENT of its own openings.
   *
   * Hand-authoring pier/lintel boxes is how the old layout ended up with an
   * archway whose opening did not match the wall around it. Here the wall is
   * described once, the openings are described once, and the solid pieces are
   * derived: cut the plane at every opening edge, then fill the vertical gaps
   * no opening claims in each resulting column.
   *
   * `axis: 'x'` means a plane at constant x (u runs along z); `'z'` means a
   * plane at constant z (u runs along x). Openings are `{ id, u0, u1, y0, y1 }`
   * and are true holes -- they get an architrave, not a collider.
   */
  function partition({
    axis, at, u0, u1, y0, y1, tag, material = M_WALL, openings = [], thickness = WALL_T,
  }) {
    const a0 = at - thickness / 2;
    const a1 = at + thickness / 2;
    const seg = (ua, ub, ya, yb, name, mtl = material) => {
      if (ub - ua < 1e-4 || yb - ya < 1e-4) return;
      if (axis === 'x') wallSeg(a0, a1, ya, yb, ua, ub, mtl, name);
      else wallSeg(ua, ub, ya, yb, a0, a1, mtl, name);
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
    // Architraves: a moulded case round each opening, so a doorway reads as a
    // doorway rather than a rectangular absence of wall.
    for (const o of openings) {
      const jamb = 0.12;
      const t = thickness + 0.06;
      const put = (ua, ub, ya, yb) => {
        if (axis === 'x') {
          root.add(box({
            size: [t, yb - ya, ub - ua],
            pos: [at, (ya + yb) / 2, (ua + ub) / 2],
            mat: M_TRIM,
            name: `${tag}-case`,
          }));
        } else {
          root.add(box({
            size: [ub - ua, yb - ya, t],
            pos: [(ua + ub) / 2, (ya + yb) / 2, at],
            mat: M_TRIM,
            name: `${tag}-case`,
          }));
        }
      };
      /* THE LINING LAPS THE REVEAL, IT DOES NOT BUTT ONTO IT.
       *
       * Owner playtest 2026-08-04, verbatim: "there is something in the wall
       * like a black bar that is intersecting and causing just a non stop
       * flicker on the wall where that texture is overlapping another texture
       * and they are fighting for screen position i guess."
       *
       * That is z-fighting, and this is where the house manufactures it. The
       * case used to stop dead on the opening's own edge -- `put(o.u0 - jamb,
       * o.u0, ...)` -- so the architrave's inner face and the wall's reveal
       * face were on EXACTLY the same plane, pointing the same way, over the
       * full height of every doorway in the building. Measured on the west
       * bathroom door before the fix: wall reveal face x = -13.1000, case face
       * x = -13.1000, 0.76 m^2 of them; and the head soffit likewise, wall and
       * case both at y = 8.4000 across 0.54 m^2. Twenty-two openings, three
       * fighting faces each.
       *
       * A real architrave laps the reveal rather than butting onto it, so this
       * one does -- 15 mm in on both jambs and the head. The faces are 15 mm
       * apart now, the opening gives up 3 cm of (at least) 1.6 m, and nothing
       * in the house is measured off the case: `doors[o.id]` below is built
       * from the OPENING, so every walk-in test, the art/doorway sweep and the
       * shell's own glazing still see the hole that was asked for. */
      const lap = 0.015;
      put(o.u0 - jamb, o.u0 + lap, o.y0, o.y1 + jamb);
      put(o.u1 - lap, o.u1 + jamb, o.y0, o.y1 + jamb);
      put(o.u0 - jamb, o.u1 + jamb, o.y1 - lap, o.y1 + jamb);
      doors[o.id] = axis === 'x'
        ? {
          id: o.id, x: at, y: o.y0, z: (o.u0 + o.u1) / 2, x0: a0, x1: a1, y0: o.y0, y1: o.y1, z0: o.u0, z1: o.u1, open: true,
        }
        : {
          id: o.id, x: (o.u0 + o.u1) / 2, y: o.y0, z: at, x0: o.u0, x1: o.u1, y0: o.y0, y1: o.y1, z0: a0, z1: a1, open: true,
        };
    }
  }

  /** Thin decorative floor topping over an already-solid slab. No collider. */
  function topping(x0, x1, y, z0, z1, material, tag = 'floor') {
    root.add(box({
      size: [x1 - x0, 0.02, z1 - z0],
      pos: [(x0 + x1) / 2, y, (z0 + z1) / 2],
      mat: material,
      name: tag,
      cast: false,
    }));
  }

  /** A rug: a flat quad, laid a centimetre over the floor. */
  function rug(x, z, w, d, y, material, rotY = 0) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rotY;
    m.position.set(x, y + 0.012, z);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }

  /* ================================================================== */
  /* BALUSTRADES                                                          */
  /*                                                                       */
  /* Owner playtest 2026-08-04, verbatim: "the railing doesn't connect      */
  /* its a bunch of T bars".                                                */
  /*                                                                        */
  /* Exactly what it was. `rakingRail` emitted eight independent segments,   */
  /* each a HORIZONTAL bar at its own segment's height with a single         */
  /* vertical post under the middle of it -- eight capital Ts marching up    */
  /* the flight with a 0.6 m vertical break between every pair, because a    */
  /* level bar cannot follow a rake. The level runs had the same problem in  */
  /* miniature: a thin bar, thin posts, a bead on top of each post, and      */
  /* nothing at the corners where two runs met.                             */
  /*                                                                        */
  /* Both are rebuilt as a real balustrade with the pieces a balustrade      */
  /* actually has: a continuous moulded handrail (ONE box, rotated onto the  */
  /* rake for a stair, so it is genuinely continuous), a shoe rail down at   */
  /* the base tying every baluster together, turned balusters between the    */
  /* two, and a square newel with a ball finial at every end and corner.     */
  /* ================================================================== */
  const RAIL_H = 0.98;

  /** One turned baluster: a shaft with a collar top and bottom. */
  function baluster(x, yBase, z, height) {
    root.add(cylinder({
      r: 0.026, h: height, pos: [x, yBase + height / 2, z], mat: M_CHROME,
    }));
    root.add(cylinder({
      rTop: 0.05, rBottom: 0.038, h: 0.09, pos: [x, yBase + 0.06, z], mat: M_GOLD, cast: false,
    }));
    root.add(cylinder({
      rTop: 0.038, rBottom: 0.05, h: 0.09, pos: [x, yBase + height - 0.06, z], mat: M_GOLD, cast: false,
    }));
  }

  /** A newel post with a ball finial -- what makes a run read as ending. */
  function newel(x, yBase, z, height = RAIL_H + 0.22) {
    root.add(box({
      size: [0.16, height, 0.16], pos: [x, yBase + height / 2, z], mat: M_WOOD_DK, name: 'newel',
    }));
    root.add(box({
      size: [0.2, 0.06, 0.2], pos: [x, yBase + height - 0.03, z], mat: M_GOLD, cast: false,
    }));
    root.add(sphere({ r: 0.1, pos: [x, yBase + height + 0.09, z], mat: M_GOLD }));
    solid(x - 0.1, x + 0.1, yBase, yBase + height, z - 0.1, z + 0.1);
  }

  /**
   * A level guard railing: continuous handrail + shoe rail + balusters, with
   * a newel at each end so consecutive runs visibly join at their corners.
   */
  function railing(x0, x1, z0, z1, y0, tag = 'railing', { newels = true } = {}) {
    const isXRun = (x1 - x0) > (z1 - z0);
    const run = isXRun ? x1 - x0 : z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // Moulded handrail: a wide cap over a slimmer core, one continuous piece.
    root.add(box({
      size: isXRun ? [run, 0.07, 0.14] : [0.14, 0.07, run],
      pos: [cx, y0 + RAIL_H, cz],
      mat: M_GOLD,
      name: `${tag}-rail`,
    }));
    /* The core LAPS the cap by 5 mm rather than meeting it exactly. A
     * moulded handrail is two pieces of the same stick; two boxes whose faces
     * are flush over three metres are the flicker, and every balustrade in
     * this house was built from this one function. */
    root.add(box({
      size: isXRun ? [run, 0.05, 0.09] : [0.09, 0.05, run],
      pos: [cx, y0 + RAIL_H - 0.055, cz],
      mat: M_WOOD_DK,
      cast: false,
    }));
    // Shoe rail: the piece that stops the balusters looking like loose sticks.
    root.add(box({
      size: isXRun ? [run, 0.06, 0.12] : [0.12, 0.06, run],
      pos: [cx, y0 + 0.05, cz],
      mat: M_GOLD,
      cast: false,
    }));
    const bays = Math.max(2, Math.round(run / 0.34));
    for (let i = 1; i < bays; i++) {
      const t = i / bays;
      baluster(
        isXRun ? THREE.MathUtils.lerp(x0, x1, t) : cx,
        y0 + 0.08,
        isXRun ? cz : THREE.MathUtils.lerp(z0, z1, t),
        RAIL_H - 0.16,
      );
    }
    if (newels) {
      newel(isXRun ? x0 : cx, y0, isXRun ? cz : z0);
      newel(isXRun ? x1 : cx, y0, isXRun ? cz : z1);
    }
    return solid(x0, x1, y0, y0 + RAIL_H + 0.08, z0, z1);
  }

  /**
   * A raking balustrade following a stair's open side.
   *
   * The handrail is ONE box, rotated about X onto the stair's own pitch, so
   * it is continuous from newel to newel instead of a flight of level bars.
   * Balusters stand on the treads underneath it, each cut to the height the
   * rail is at over its own foot. Collision is still emitted as a run of
   * short boxes -- a rotated collider is not something core/player.js's
   * axis-aligned resolver can take -- but that is invisible and the geometry
   * is what the player sees.
   */
  function rakingRail(xAt, z0, z1, yAt, tag) {
    const yBottom = yAt(z0);
    const yTop = yAt(z1);
    const runZ = z1 - z0;
    const rise = yTop - yBottom;
    const length = Math.hypot(runZ, rise);
    const pitch = Math.atan2(rise, runZ);
    const midZ = (z0 + z1) / 2;
    const midY = (yBottom + yTop) / 2 + RAIL_H;
    // Continuous moulded handrail on the rake.
    root.add(box({
      size: [0.14, 0.07, length], pos: [xAt, midY, midZ], mat: M_GOLD, rotX: -pitch, name: `${tag}-rail`,
    }));
    // Same 5 mm lap as the level rail above, for the same reason.
    root.add(box({
      size: [0.09, 0.05, length], pos: [xAt, midY - 0.055, midZ], mat: M_WOOD_DK, rotX: -pitch, cast: false,
    }));
    // Raking shoe rail, on the nosing line.
    root.add(box({
      size: [0.12, 0.06, length],
      pos: [xAt, (yBottom + yTop) / 2 + 0.09, midZ],
      mat: M_GOLD,
      rotX: -pitch,
      cast: false,
    }));
    const bays = Math.max(4, Math.round(runZ / 0.34));
    for (let i = 1; i < bays; i++) {
      const z = THREE.MathUtils.lerp(z0, z1, i / bays);
      baluster(xAt, yAt(z) + 0.12, z, RAIL_H - 0.2);
    }
    newel(xAt, yBottom, z0, RAIL_H + 0.34);
    newel(xAt, yTop, z1, RAIL_H + 0.22);
    // Collision, stepped: a rotated box is not something the axis-aligned
    // resolver can use, so the guard itself is emitted as short level boxes
    // sitting on the treads they protect.
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const za = THREE.MathUtils.lerp(z0, z1, i / steps);
      const zb = THREE.MathUtils.lerp(z0, z1, (i + 1) / steps);
      const ya = yAt(za);
      solid(xAt - 0.08, xAt + 0.08, ya, ya + RAIL_H + 0.1, za, zb);
    }
  }

  /**
   * One flight of the horseshoe: lerp-stepped treads with risers, a solid
   * outer stringer against the wall, and a carpet runner.
   */
  function stairFlight(rect, yBottom, yTop, tag, openSide = 'east') {
    const steps = 24;
    const depth = (rect.z1 - rect.z0) / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const z = rect.z0 + depth * (i + 0.5);
      const y = THREE.MathUtils.lerp(yBottom, yTop, t);
      root.add(box({
        size: [rect.x1 - rect.x0, 0.14, depth + 0.05],
        pos: [(rect.x0 + rect.x1) / 2, y + 0.07, z],
        mat: M_MARBLE,
        name: `${tag}-tread`,
      }));
      // Riser: the face you actually see from below, in the darker stone.
      root.add(box({
        size: [rect.x1 - rect.x0, Math.abs(yTop - yBottom) / steps, 0.05],
        pos: [
          (rect.x0 + rect.x1) / 2,
          y - Math.abs(yTop - yBottom) / (steps * 2),
          z - depth / 2,
        ],
        mat: M_MARBLE_DK,
        name: `${tag}-riser`,
      }));
      // Runner, held by a brass stair rod at every third tread.
      root.add(box({
        size: [(rect.x1 - rect.x0) * 0.62, 0.02, depth + 0.05],
        pos: [(rect.x0 + rect.x1) / 2, y + 0.15, z],
        mat: M_CARPET_HALL,
        cast: false,
        name: `${tag}-runner`,
      }));
      if (i % 4 === 0) {
        root.add(cylinder({
          r: 0.016,
          h: (rect.x1 - rect.x0) * 0.62,
          pos: [(rect.x0 + rect.x1) / 2, y + 0.17, z - depth / 2 + 0.04],
          mat: M_GOLD,
          rotZ: Math.PI / 2,
          cast: false,
        }));
      }
    }
    /* Closed-string spandrel: the masonry mass the flight is carried on.
     *
     * The alternative -- an open flight with a thin soffit -- leaves a wedge
     * of "walkable" floor underneath whose headroom starts at zero and only
     * reaches standing height two thirds of the way up. A soffit is not a
     * collider, so a player would walk into the underside of the stairs and
     * the camera would come out through the treads. Filling it solid is both
     * what a stone staircase actually is and the honest collision.
     *
     * Only the OPEN FLANK is collided, not the whole mass. core/player.js has
     * no step-up: it skips a collider only when your feet are strictly above
     * its top (`p.y - eyeHeight > box.max.y`). A collider under the full
     * footprint would therefore put the next step's own mass 0.2 m above the
     * feet of anyone climbing -- the stair would block itself. The flank slab
     * stops at the height of the tread at its own near edge, so it blocks
     * someone walking into the side of the staircase from the foyer floor and
     * is skipped by someone standing on the treads above it. */
    const flankX0 = openSide === 'east' ? rect.x1 - 0.22 : rect.x0;
    const flankX1 = openSide === 'east' ? rect.x1 : rect.x0 + 0.22;
    for (let i = 0; i < steps; i++) {
      const za = rect.z0 + depth * i;
      const zb = za + depth;
      const massTop = THREE.MathUtils.lerp(yBottom, yTop, (i + 0.5) / steps) - 0.06;
      root.add(box({
        size: [rect.x1 - rect.x0, massTop - yBottom, depth + 0.04],
        pos: [(rect.x0 + rect.x1) / 2, (yBottom + massTop) / 2, (za + zb) / 2],
        mat: M_MARBLE_DK,
        cast: false,
        name: `${tag}-spandrel`,
      }));
      const flankTop = THREE.MathUtils.lerp(yBottom, yTop, i / steps) - 0.05;
      if (flankTop > yBottom) solid(flankX0, flankX1, yBottom, flankTop, za, zb);
    }
  }

  /** A dining/boardroom chair. */
  function makeSeat(x, y, z, yaw, seatMat, backH = 0.5) {
    const g = new THREE.Group();
    g.add(box({ size: [0.5, 0.07, 0.5], pos: [0, 0.46, 0], mat: seatMat, name: 'chair-seat' }));
    g.add(box({
      size: [0.46, backH, 0.07], pos: [0, 0.5 + backH / 2, -0.22], mat: seatMat, name: 'chair-back',
    }));
    for (const [lx, lz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) {
      g.add(box({ size: [0.05, 0.44, 0.05], pos: [lx, 0.22, lz], mat: M_WOOD_DK }));
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    solid(x - 0.28, x + 0.28, y, y + 0.5, z - 0.28, z + 0.28);
    return g;
  }

  /**
   * A FANCY CHAIR (owner playtest 2026-08-04, verbatim: "Make all the chairs
   * fancy and nice. lets spiff up the conference room.")
   *
   * `makeSeat` above is a slab, a back and four sticks. That is right for the
   * folding rows round a dance floor and wrong for the room the family signs
   * things in, so this is the other kind: a shaped seat over a gilded apron,
   * tapered legs on brass sabots tied by stretchers, a buttoned back panel
   * between two uprights under a carved crest rail, and scrolled arms.
   *
   * Same call signature and the SAME collider as `makeSeat` -- 0.56 m square,
   * 0.5 m tall -- so it drops in anywhere the plain one stands without moving
   * a single walkable line through the house.
   */
  function makeFancyChair(x, y, z, yaw, seatMat, {
    backH = 0.78, arms = true, frame = M_WOOD_DK, trim = M_GOLD, tag = 'fancy-chair',
  } = {}) {
    const g = new THREE.Group();
    const seatY = 0.47;
    // Seat: cushion, piping, apron.
    g.add(box({ size: [0.52, 0.1, 0.52], pos: [0, seatY, 0], mat: seatMat, name: `${tag}-seat` }));
    g.add(box({ size: [0.56, 0.04, 0.56], pos: [0, seatY - 0.06, 0], mat: trim, cast: false }));
    /* The apron LAPS the leg tops rather than starting 20 mm above them:
     * measured, the legs reach 0.35 and the apron began at 0.29 with a 0.06
     * gap, so every one of these chairs -- four in the office, two upstairs --
     * was a seat frame hanging over four posts. */
    g.add(box({ size: [0.5, 0.1, 0.5], pos: [0, seatY - 0.15, 0], mat: frame }));
    // Legs, sabots and stretchers.
    for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
      g.add(cylinder({
        rTop: 0.045, rBottom: 0.028, h: 0.33, pos: [lx, 0.185, lz], mat: frame,
      }));
      g.add(cylinder({ r: 0.034, h: 0.04, pos: [lx, 0.02, lz], mat: trim, cast: false }));
    }
    for (const sz of [-0.22, 0.22]) {
      g.add(box({ size: [0.44, 0.028, 0.028], pos: [0, 0.14, sz], mat: frame, cast: false }));
    }
    for (const sx of [-0.22, 0.22]) {
      g.add(box({ size: [0.028, 0.028, 0.44], pos: [sx, 0.14, 0], mat: frame, cast: false }));
    }
    // Back: uprights, padded panel, buttons, crest rail.
    const backTop = seatY + 0.05 + backH;
    for (const ux of [-0.21, 0.21]) {
      g.add(cylinder({
        r: 0.028, h: backH + 0.1, pos: [ux, seatY + backH / 2, -0.24], mat: frame,
      }));
    }
    g.add(box({
      size: [0.42, backH - 0.08, 0.09], pos: [0, seatY + backH / 2 + 0.02, -0.24], mat: seatMat, name: `${tag}-back`,
    }));
    for (let i = 0; i < 3; i++) {
      g.add(sphere({
        r: 0.019,
        pos: [(i - 1) * 0.13, seatY + backH * 0.45 + (i % 2) * 0.16, -0.19],
        mat: trim,
        cast: false,
      }));
    }
    g.add(box({
      size: [0.52, 0.1, 0.12], pos: [0, backTop - 0.03, -0.24], mat: trim, cast: false, name: `${tag}-crest`,
    }));
    g.add(sphere({ r: 0.038, pos: [0, backTop + 0.04, -0.24], mat: trim, cast: false }));
    if (arms) {
      for (const ax of [-0.26, 0.26]) {
        g.add(box({ size: [0.07, 0.06, 0.46], pos: [ax, seatY + 0.24, 0.02], mat: frame }));
        g.add(box({ size: [0.09, 0.05, 0.2], pos: [ax, seatY + 0.28, -0.06], mat: seatMat, cast: false }));
        g.add(cylinder({
          r: 0.026, h: 0.22, pos: [ax, seatY + 0.13, 0.2], mat: frame, rotX: 0.24,
        }));
      }
    }
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    solid(x - 0.28, x + 0.28, y, y + 0.5, z - 0.28, z + 0.28);
    return g;
  }

  /** A closed, wall-mounted glass display case. */
  function makeDisplayCase(x, y, z, rotY, w, h, d, contents) {
    const g = new THREE.Group();
    g.add(box({ size: [w, h, 0.05], pos: [0, h / 2, -d / 2 + 0.025], mat: M_WOOD_DK, name: 'case-back' }));
    g.add(box({ size: [0.06, h, d], pos: [-w / 2 + 0.03, h / 2, 0], mat: M_WOOD_DK }));
    g.add(box({ size: [0.06, h, d], pos: [w / 2 - 0.03, h / 2, 0], mat: M_WOOD_DK }));
    g.add(box({ size: [w, 0.06, d], pos: [0, h - 0.03, 0], mat: M_WOOD_DK }));
    g.add(box({ size: [w, 0.06, d], pos: [0, 0.03, 0], mat: M_WOOD_DK }));
    g.add(box({
      size: [w - 0.12, h - 0.12, 0.03], pos: [0, h / 2, d / 2 - 0.03], mat: M_GLASS_CASE, name: 'case-glass',
    }));
    contents?.(g, w, h, d);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const hx = (cos * w + sin * d) / 2;
    const hz = (sin * w + cos * d) / 2;
    solid(x - hx, x + hx, y, y + h, z - hz, z + hz);
    return g;
  }

  /** A small pedestal statue. */
  function buildSmallStatue(x, z, floorY, hue = M_SILVER) {
    const g = new THREE.Group();
    g.add(cylinder({ r: 0.5, h: 0.15, pos: [0, 0.075, 0], mat: M_MARBLE_DK }));
    g.add(cylinder({ r: 0.32, h: 0.55, pos: [0, 0.15 + 0.275, 0], mat: M_MARBLE }));
    const figY = 0.15 + 0.55;
    g.add(box({ size: [0.42, 0.42, 0.3], pos: [0, figY + 0.21, 0], mat: hue }));
    g.add(box({ size: [0.5, 0.42, 0.34], pos: [0, figY + 0.62, 0], mat: hue }));
    g.add(box({
      size: [0.16, 0.36, 0.16], pos: [-0.22, figY + 0.85, 0], mat: hue, rotZ: -0.6,
    }));
    g.add(box({
      size: [0.16, 0.32, 0.16], pos: [0.2, figY + 0.55, 0], mat: hue, rotZ: 0.2,
    }));
    g.add(box({ size: [0.22, 0.22, 0.22], pos: [0, figY + 1.02, 0], mat: hue }));
    g.position.set(x, floorY, z);
    root.add(g);
    solid(x - 0.5, x + 0.5, floorY, floorY + 1.65, z - 0.5, z + 0.5);
    return g;
  }

  /** A flush ceiling fixture plus its light. */
  function ceilingLight(x, z, y, colour = 0xffdca0, intensity = 5, distance = 15) {
    /* Named, both of them. `cylinder()` and `sphere()` in world/build.js drop
     * the `name` option on the floor, which is why every flush fitting in this
     * house has been an anonymous pair of meshes the audit reports as floating
     * -- a ceiling light IS floating, and the only way to say so is a name. */
    root.add(named(cylinder({
      rTop: 0.22, rBottom: 0.28, h: 0.1, pos: [x, y, z], mat: mat({ color: 0x2a2118, roughness: 0.6 }),
    }), 'ceiling-light-pan'));
    root.add(named(sphere({ r: 0.1, pos: [x, y - 0.1, z], mat: M_BULB_WARM, cast: false }), 'ceiling-light-bulb'));
    const l = new THREE.PointLight(colour, intensity, distance, 2);
    l.position.set(x, y - 0.2, z);
    root.add(l);
    return l;
  }

  /* ================================================================== */
  /* WALL SCONCES, WITH THE SHADE THE RIGHT WAY UP                       */
  /*                                                                      */
  /* Owner playtest 2026-08-04, verbatim: "I thiknk the lights on the wall */
  /* throughout the house have the lampshade upside down. Only the tijny   */
  /* lights on the wall. The main lamps have it right."                     */
  /*                                                                        */
  /* Exactly right, and measurable against the very lamps he compared them  */
  /* with. The apartment's `makeFloorLamp` (src/world/props.js) builds its   */
  /* shade as CylinderGeometry(0.15, 0.19, ...): radius 0.15 at the TOP and  */
  /* 0.19 at the BOTTOM, so it widens downward over the bulb, which is what  */
  /* a shade does. Every sconce in this house was built rTop 0.16 /          */
  /* rBottom 0.10 -- the exact inverse, a funnel wide at the top and pinched */
  /* onto the bulb. One function, thirty-odd fittings, one fix; the taper is */
  /* the floor lamp's own 0.15:0.19 ratio scaled down, so the house agrees   */
  /* with itself.                                                            */
  /*                                                                          */
  /* The rest of the fitting is new for the same reason the shade is: a       */
  /* single gold slab with a cone on it is not what is on the wall of a house */
  /* like this. It now has a backplate, a scrolled arm, a candle tube and a   */
  /* drip pan under the shade. Local +z is OUT of the wall (the light's own    */
  /* offset already assumed that), and the whole fitting lives between local    */
  /* z -0.03 and +0.28 -- so every call site was re-seated at 0.05..0.13 m off  */
  /* its own wall face at the same time. They used to be mounted as much as     */
  /* 0.22 m proud (the office shield's sconce), which with a real backplate on  */
  /* it would have been a bracket hanging in mid-air beside the wall.           */
  /* ================================================================== */
  const M_SHADE_CREAM = mat({ color: 0xe8d9a8, roughness: 0.7 });
  function sconce(x, y, z, rotY, intensity = 2.4) {
    const g = group('sconce',
      /* Backplate, with a moulded bead top and bottom. It straddles the
       * group's own origin (local z -0.03..0.02) because every call site
       * below mounts the fitting 0.05..0.09 m off the face it hangs on: the
       * plate then lands ON the plaster instead of hovering in front of it,
       * which is what the old bare bracket did anywhere it was mounted more
       * than 0.04 m proud. */
      box({ size: [0.14, 0.4, 0.05], pos: [0, 0, -0.005], mat: M_GOLD, name: 'sconce-backplate' }),
      box({ size: [0.18, 0.05, 0.06], pos: [0, 0.2, 0], mat: M_GOLD, cast: false }),
      box({ size: [0.18, 0.05, 0.06], pos: [0, -0.2, 0], mat: M_GOLD, cast: false }),
      // Scrolled arm: out of the plate, then up to the candle.
      named(cylinder({
        r: 0.019, h: 0.14, pos: [0, -0.02, 0.09], mat: M_GOLD, rotX: Math.PI / 2,
      }), 'sconce-arm'),
      cylinder({ r: 0.019, h: 0.14, pos: [0, 0.05, 0.13], mat: M_GOLD }),
      sphere({ r: 0.032, pos: [0, -0.02, 0.13], mat: M_GOLD, cast: false }),
      // Candle tube on a drip pan.
      cylinder({
        rTop: 0.07, rBottom: 0.045, h: 0.025, pos: [0, 0.125, 0.13], mat: M_GOLD, cast: false,
      }),
      cylinder({ r: 0.026, h: 0.11, pos: [0, 0.19, 0.13], mat: M_CARD }),
      /* The shade. rTop < rBottom -- see the note above. */
      named(cylinder({
        rTop: 0.115, rBottom: 0.15, h: 0.19, pos: [0, 0.28, 0.13], mat: M_SHADE_CREAM,
      }), 'sconce-shade'),
      sphere({ r: 0.045, pos: [0, 0.26, 0.13], mat: M_BULB_WARM, cast: false }));
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    const l = new THREE.PointLight(0xffd9a0, intensity, 8, 2);
    l.position.set(x + Math.sin(rotY) * 0.16, y + 0.26, z + Math.cos(rotY) * 0.16);
    root.add(l);
    return l;
  }

  /* ================================================================== */
  /* ART, AND WHERE IT IS NOT ALLOWED TO HANG                            */
  /*                                                                      */
  /* Owner playtest 2026-08-04, verbatim: "A lot of the art is over        */
  /* doorways and stuff ... but I like the big art layouts".               */
  /*                                                                      */
  /* This has been a recurring fault rather than a one-off, so it is       */
  /* handled structurally: EVERY picture in the house goes through         */
  /* `wallArt()` or `flatArt()`, both of which record the piece's own       */
  /* world-space box in `artPieces`. That list is handed out on the        */
  /* interior's return value, and tools/verify-mansion.mjs intersects      */
  /* every piece against every opening the house declares -- interior       */
  /* doorways from `doors`, plus the shell's exterior doors and glazing.    */
  /* A picture hung across a door or a window is therefore a failing        */
  /* check from now on, not something to be spotted in a playtest.         */
  /* ================================================================== */
  const artPieces = [];

  /** Record a hung piece's world box so the doorway sweep can see it. */
  function recordArt(id, x, y, z, rotY, w, h, depth = 0.14) {
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const hx = (cos * w + sin * depth) / 2;
    const hz = (sin * w + cos * depth) / 2;
    const piece = {
      id,
      x0: x - hx,
      x1: x + hx,
      y0: y - h / 2,
      y1: y + h / 2,
      z0: z - hz,
      z1: z + hz,
    };
    artPieces.push(piece);
    return piece;
  }

  /** Framed art hung flat on a wall (uses the shared apartment frame prop). */
  function wallArt(id, x, y, z, rotY, w, h, texture) {
    const f = makeFrame(M, {
      x, y, z, rotY, w, h, texture, tint: 0x2a1d12,
    });
    root.add(f.group);
    recordArt(id, x, y, z, rotY, w + 0.14, h + 0.14);
    f.slotId = id;
    return f;
  }

  /**
   * An unframed flat: a banner, a projector screen, a hanging crest. Same
   * registration as `wallArt`, because a 3 m banner across a doorway is the
   * same fault as a picture across one.
   */
  function flatArt(id, {
    x, y, z, rotY = 0, w, h, material, depth = 0.06,
  }) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    root.add(m);
    recordArt(id, x, y, z, rotY, w, h, depth);
    return m;
  }

  /** Skirting + picture rail around a rectangular room. */
  function trimRoom(r, floorY, ceilY) {
    for (const [x0, x1, z0, z1] of [
      [r.x0, r.x1, r.z0, r.z0 + 0.05],
      [r.x0, r.x1, r.z1 - 0.05, r.z1],
      [r.x0, r.x0 + 0.05, r.z0, r.z1],
      [r.x1 - 0.05, r.x1, r.z0, r.z1],
    ]) {
      root.add(box({
        size: [x1 - x0, 0.16, z1 - z0],
        pos: [(x0 + x1) / 2, floorY + 0.08, (z0 + z1) / 2],
        mat: M_TRIM,
        cast: false,
      }));
      root.add(box({
        size: [x1 - x0, 0.09, z1 - z0],
        pos: [(x0 + x1) / 2, ceilY - 0.14, (z0 + z1) / 2],
        mat: M_TRIM,
        cast: false,
      }));
    }
  }

  /* ================================================================== */
  /* Sets: a valve radio and a console television.                        */
  /*                                                                       */
  /* Both are cabinets only -- the working parts are `core/radio.js` and    */
  /* `core/tv.js`, mounted by the composition root against the meshes        */
  /* returned here. See the note at the top of src/mansion/main.js.         */
  /* ================================================================== */

  /** A wooden valve radio: dial, grille cloth, two knobs, a pilot lamp. */
  function makeRadioSet(x, y, z, rotY = 0, { scale = 1 } = {}) {
    const g = new THREE.Group();
    const w = 0.62 * scale;
    const h = 0.36 * scale;
    const d = 0.26 * scale;
    g.add(box({ size: [w, h, d], pos: [0, h / 2, 0], mat: M_WOOD_DK, name: 'radio-case' }));
    g.add(box({ size: [w + 0.04, 0.04, d + 0.04], pos: [0, h, 0], mat: M_GOLD, cast: false }));
    // Grille cloth on the left, dial on the right.
    g.add(box({
      size: [w * 0.42, h * 0.6, 0.02], pos: [-w * 0.24, h * 0.55, d / 2 + 0.005], mat: M_FABRIC_GOLD, cast: false,
    }));
    for (let i = 0; i < 5; i++) {
      g.add(box({
        size: [0.02, h * 0.62, 0.012], pos: [-w * 0.24 + (i - 2) * 0.05, h * 0.55, d / 2 + 0.016], mat: M_GOLD, cast: false,
      }));
    }
    const dial = box({
      size: [w * 0.36, h * 0.34, 0.015],
      pos: [w * 0.24, h * 0.6, d / 2 + 0.006],
      mat: mat({
        color: 0x2a2418, emissive: 0xffb347, emissiveIntensity: 0.0, roughness: 0.5, unique: true,
      }),
      cast: false,
    });
    g.add(dial);
    g.add(box({
      size: [0.012, h * 0.3, 0.012], pos: [w * 0.28, h * 0.6, d / 2 + 0.016], mat: M_CHROME, cast: false,
    }));
    for (const kx of [-w * 0.36, w * 0.36]) {
      g.add(cylinder({
        r: 0.035 * scale, h: 0.03, pos: [kx, h * 0.2, d / 2 + 0.015], mat: M_BRONZE, rotX: Math.PI / 2,
      }));
    }
    const pilot = sphere({
      r: 0.018,
      pos: [0, h * 0.2, d / 2 + 0.012],
      mat: mat({
        color: 0x3a2410, emissive: 0xff7a2a, emissiveIntensity: 0.0, roughness: 0.5, unique: true,
      }),
      cast: false,
    });
    g.add(pilot);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    const speakerPos = new THREE.Vector3(x, y + h * 0.55, z);
    return {
      group: g,
      speakerPos,
      /** Light the dial and the pilot lamp when this set is the live one. */
      setLit(on) {
        dial.material.emissiveIntensity = on ? 1.4 : 0.0;
        pilot.material.emissiveIntensity = on ? 2.0 : 0.0;
      },
    };
  }

  /** A console television in a wooden cabinet, on splayed legs. */
  function makeTvSet(x, y, z, rotY = 0, { w = 1.5, h = 1.0 } = {}) {
    const g = new THREE.Group();
    const d = 0.62;
    g.add(box({ size: [w, h, d], pos: [0, h / 2 + 0.22, 0], mat: M_WOOD_DK, name: 'tv-cabinet' }));
    g.add(box({ size: [w + 0.06, 0.05, d + 0.06], pos: [0, h + 0.24, 0], mat: M_GOLD, cast: false }));
    for (const [lx, lz] of [[-w / 2 + 0.12, -d / 2 + 0.12], [w / 2 - 0.12, -d / 2 + 0.12],
      [-w / 2 + 0.12, d / 2 - 0.12], [w / 2 - 0.12, d / 2 - 0.12]]) {
      g.add(cylinder({
        rTop: 0.03, rBottom: 0.045, h: 0.24, pos: [lx, 0.12, lz], mat: M_WOOD_DK,
      }));
    }
    // Bezel and the picture itself.
    g.add(box({
      size: [w * 0.78 + 0.07, h * 0.62 + 0.07, 0.03], pos: [0, h * 0.62, d / 2 + 0.005], mat: M_STOVE_BLACK, cast: false,
    }));
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.78, h * 0.62),
      mat({ color: 0x05070a, roughness: 0.22, unique: true }),
    );
    screen.position.set(0, h * 0.62, d / 2 + 0.026);
    g.add(screen);
    // Speaker grille and the channel knobs down the right-hand side.
    g.add(box({
      size: [w * 0.14, h * 0.5, 0.02], pos: [w * 0.42, h * 0.62, d / 2 + 0.01], mat: M_FABRIC_GOLD, cast: false,
    }));
    for (const ky of [h * 0.24, h * 0.14]) {
      g.add(cylinder({
        r: 0.035, h: 0.03, pos: [w * 0.42, ky + 0.22, d / 2 + 0.02], mat: M_BRONZE, rotX: Math.PI / 2,
      }));
    }
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    solid(
      x - (cos * w + sin * d) / 2, x + (cos * w + sin * d) / 2, y, y + h + 0.26,
      z - (sin * w + cos * d) / 2, z + (sin * w + cos * d) / 2,
    );
    return { group: g, screen };
  }

  /** A generic piece of case furniture: a chest, sideboard or dresser. */
  function caseFurniture(x, z, y, w, d, h, rotY, drawers = 3, top = M_WOOD_DK) {
    const g = new THREE.Group();
    g.add(box({ size: [w, 0.06, d], pos: [0, h - 0.03, 0], mat: top }));
    g.add(box({ size: [w - 0.06, h - 0.2, d - 0.05], pos: [0, (h - 0.14) / 2 + 0.1, 0], mat: M_WOOD }));
    for (let i = 0; i < drawers; i++) {
      const dy = 0.16 + ((h - 0.28) * (i + 0.5)) / drawers;
      g.add(box({
        size: [w - 0.16, (h - 0.34) / drawers - 0.03, 0.02], pos: [0, dy, d / 2 - 0.01], mat: M_WOOD_DK,
      }));
      for (const hx of [-w * 0.22, w * 0.22]) {
        g.add(cylinder({
          r: 0.02, h: 0.09, pos: [hx, dy, d / 2 + 0.02], mat: M_GOLD, rotZ: Math.PI / 2,
        }));
      }
    }
    for (const [lx, lz] of [[-w / 2 + 0.07, -d / 2 + 0.07], [w / 2 - 0.07, -d / 2 + 0.07],
      [-w / 2 + 0.07, d / 2 - 0.07], [w / 2 - 0.07, d / 2 - 0.07]]) {
      g.add(box({ size: [0.07, 0.16, 0.07], pos: [lx, 0.08, lz], mat: M_WOOD_DK }));
    }
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    solid(
      x - (cos * w + sin * d) / 2, x + (cos * w + sin * d) / 2, y, y + h,
      z - (sin * w + cos * d) / 2, z + (sin * w + cos * d) / 2,
    );
    return g;
  }

  /** A curtained window dressing, hung on an interior wall face. */
  function curtains(axis, at, u, y, width, height, material = M_CURTAIN) {
    const panelW = width * 0.24;
    for (const side of [-1, 1]) {
      const uu = u + side * (width / 2 - panelW / 2);
      if (axis === 'z') {
        root.add(box({
          size: [panelW, height, 0.1], pos: [uu, y + height / 2, at], mat: material,
        }));
      } else {
        root.add(box({
          size: [0.1, height, panelW], pos: [at, y + height / 2, uu], mat: material,
        }));
      }
    }
    /* The rod and the pelmet carry names for the same reason the ceiling
     * fittings above do: a curtain hangs, and the audit's hanging-things
     * filter reads names. Anonymous, every pelmet in the house was a floating
     * box. */
    if (axis === 'z') {
      root.add(named(cylinder({
        r: 0.035, h: width + 0.4, pos: [u, y + height + 0.1, at], mat: M_GOLD, rotZ: Math.PI / 2,
      }), 'curtain-rod'));
      root.add(box({
        size: [width + 0.4, 0.28, 0.14], pos: [u, y + height + 0.02, at], mat: material, cast: false, name: 'curtain-pelmet',
      }));
    } else {
      root.add(named(cylinder({
        r: 0.035, h: width + 0.4, pos: [at, y + height + 0.1, u], mat: M_GOLD, rotX: Math.PI / 2,
      }), 'curtain-rod'));
      root.add(box({
        size: [0.14, 0.28, width + 0.4], pos: [at, y + height + 0.02, u], mat: material, cast: false, name: 'curtain-pelmet',
      }));
    }
  }

  /* ================================================================== */
  /* Partition walls                                                     */
  /* ================================================================== */
  const ARCH_TOP = GY + 3.2; // 4.4 -- the foyer's grand ground-floor arches
  const DOOR_TOP = GY + 2.6; // 3.8 -- an ordinary ground-floor doorway
  const UP_DOOR_TOP = UY + 2.4; // 8.4 -- an ordinary upstairs doorway
  const CONF_DOOR_TOP = UY + 2.8; // 8.8 -- the conference room's double doors

  function buildWalls() {
    for (const side of [-1, 1]) {
      const at = side < 0 ? W_WEST : W_EAST;
      const tag = side < 0 ? 'west-partition' : 'east-partition';
      const wing = side < 0 ? 'living' : 'lounge';
      const rear = side < 0 ? 'dining' : 'kitchen';

      // z 41..48 -- foyer void on one side, ground room + front bedroom on the
      // other. Full height, because the foyer is double height here, and
      // solid: this is the stretch the horseshoe's own masonry runs up.
      partition({
        axis: 'x',
        at,
        u0: BUILDING.z0,
        u1: Z_GALLERY_S,
        y0: GY,
        y1: UCY,
        tag: `${tag}-front`,
      });
      /* z 48..53 -- ground floor only (the gallery upstairs runs clean across
       * the full width of the house, so there is deliberately no wall above),
       * and this is where the grand archway into the wing goes.
       *
       * It is NOT at z:44-48 alongside the flights, where an earlier pass put
       * it: that stretch is under the rising staircase, so the opening would
       * have led into a wedge with 1.2 m of headroom at its mouth. Behind the
       * horseshoe there is the full 4.8 m ground-floor height and a clean
       * sightline from the front door straight through to the wing. */
      partition({
        axis: 'x',
        at,
        u0: Z_GALLERY_S,
        u1: Z_GALLERY_N,
        y0: GY,
        y1: UY,
        tag: `${tag}-mid`,
        openings: [{
          id: `foyerTo${wing[0].toUpperCase()}${wing.slice(1)}`, u0: 48.5, u1: 52.5, y0: GY, y1: ARCH_TOP,
        }],
      });
      // z 53..58 -- ground floor + conference room's flank.
      partition({
        axis: 'x', at, u0: Z_GALLERY_N, u1: Z_MID, y0: GY, y1: UCY, tag: `${tag}-rear`,
      });
      // z 58..75 -- ballroom / rear wing, full height.
      partition({
        axis: 'x',
        at,
        u0: Z_MID,
        u1: BUILDING.z1,
        y0: GY,
        y1: UCY,
        tag: `${tag}-back`,
        openings: [{
          id: `ballroomTo${rear[0].toUpperCase()}${rear.slice(1)}`, u0: 64, u1: 67.5, y0: GY, y1: DOOR_TOP,
        }],
      });
    }

    // Ground floor, z=58: front half of the house from the rear half.
    partition({
      axis: 'z',
      at: Z_MID,
      u0: BUILDING.x0,
      u1: BUILDING.x1,
      y0: GY,
      y1: UY,
      tag: 'ground-cross',
      openings: [
        { id: 'livingToDining', u0: -14, u1: -11, y0: GY, y1: DOOR_TOP },
        { id: 'foyerToBallroom', u0: -3, u1: 3, y0: GY, y1: GY + 3.4 },
        { id: 'loungeToKitchen', u0: 11, u1: 14, y0: GY, y1: DOOR_TOP },
      ],
    });

    // Upper floor, z=48: the gallery's south wall, in the wings only. The
    // middle is the foyer void -- railings, not wall.
    /* Bedroom doors sit in the OUTER corner of each wing, not on its centre
     * line. Centred, every door opened straight onto the foot of the bed
     * standing on the room's own axis, which stopped you 0.2 m inside the
     * threshold -- caught by the verifier's walk-in test, and exactly the
     * shape of "cant enter a few of the rooms". */
    for (const [ux0, ux1, doorU0, doorU1, id] of [
      [BUILDING.x0, FOYER_VOID.x0, -14.9, -13.1, 'galleryToBedWestFront'],
      [FOYER_VOID.x1, BUILDING.x1, 13.1, 14.9, 'galleryToBedEastFront'],
    ]) {
      partition({
        axis: 'z',
        at: Z_GALLERY_S,
        u0: ux0,
        u1: ux1,
        y0: UY,
        y1: UCY,
        tag: 'gallery-south',
        openings: [{
          id, u0: doorU0, u1: doorU1, y0: UY, y1: UP_DOOR_TOP,
        }],
      });
    }

    // Upper floor, z=53: the gallery's north wall. Conference room dead
    // centre, a bedroom door either side of it.
    partition({
      axis: 'z',
      at: Z_GALLERY_N,
      u0: BUILDING.x0,
      u1: BUILDING.x1,
      y0: UY,
      y1: UCY,
      tag: 'gallery-north',
      material: M_WALL_WARM,
      openings: [
        { id: 'galleryToBedWestRear', u0: -14.9, u1: -13.1, y0: UY, y1: UP_DOOR_TOP },
        { id: 'galleryToConference', u0: -2.2, u1: 2.2, y0: UY, y1: CONF_DOOR_TOP },
        { id: 'galleryToBedEastRear', u0: 13.1, u1: 14.9, y0: UY, y1: UP_DOOR_TOP },
      ],
    });

    // Upper floor, z=63: conference room to Lou's office.
    partition({
      axis: 'z',
      at: Z_OFFICE,
      u0: FOYER_VOID.x0,
      u1: FOYER_VOID.x1,
      y0: UY,
      y1: UCY,
      tag: 'conference-north',
      material: M_WALL_DEEP,
      openings: [{
        id: 'conferenceToOffice', u0: -1.6, u1: 1.6, y0: UY, y1: UY + 2.6,
      }],
    });

    // Upper floor, z=66: rear bedrooms to their ensuites.
    for (const [ux0, ux1, doorU0, doorU1, id] of [
      [BUILDING.x0, FOYER_VOID.x0, -14.9, -13.1, 'bedWestRearToBath'],
      [FOYER_VOID.x1, BUILDING.x1, 13.1, 14.9, 'bedEastRearToBath'],
    ]) {
      partition({
        axis: 'z',
        at: Z_BATH,
        u0: ux0,
        u1: ux1,
        y0: UY,
        y1: UCY,
        tag: 'bath-wall',
        openings: [{
          id, u0: doorU0, u1: doorU1, y0: UY, y1: UP_DOOR_TOP,
        }],
      });
    }
  }
  buildWalls();

  /* ================================================================== */
  /* THE FOYER + THE HORSESHOE STAIRCASE                                 */
  /*                                                                      */
  /* "when you walk in the foyer is a big open area leading to that       */
  /*  horseshoe stair case" -- so: 17.7 m wide, 17 m deep, open to the    */
  /* roof over its front half, with nothing standing in the middle of it. */
  /* ================================================================== */
  function buildFoyer() {
    // Marble floor, laid in a border-and-field pattern, notched around the
    // basement stairwell (which is a genuine hole in the slab now).
    topping(FOYER.x0, FOYER.x1, GY + 0.01, FOYER.z0, BASEMENT_STAIR.z0, M_MARBLE, 'foyer-floor');
    topping(FOYER.x0, BASEMENT_STAIR.x0, GY + 0.01, BASEMENT_STAIR.z0, FOYER.z1, M_MARBLE, 'foyer-floor');
    /* Dark marble border + a compass inlay. The border used to stop at
     * z=42.2, which was the foot of the stairs on the old facade line; the
     * front wall is now 6 m further south, so it runs the length of the
     * entrance hall instead of ending in the middle of the floor. */
    const borderZ0 = FOYER.z0 + 1.2;
    const borderZ1 = 47.5;
    for (const [bx0, bx1, bz0, bz1] of [
      [FOYER.x0 + 0.6, FOYER.x1 - 0.6, borderZ0, borderZ0 + 0.3],
      [FOYER.x0 + 0.6, FOYER.x1 - 0.6, borderZ1 - 0.3, borderZ1],
      [FOYER.x0 + 0.6, FOYER.x0 + 0.9, borderZ0, borderZ1],
      [FOYER.x1 - 0.9, FOYER.x1 - 0.6, borderZ0, borderZ1],
    ]) topping(bx0, bx1, GY + 0.02, bz0, bz1, M_MARBLE_DK, 'foyer-border');
    /* The inlay -- and the centre table standing on it -- sits directly under
     * the chandelier, not halfway between the door and the stairs. Measured
     * on the first attempt at 40.4: a 3.2 m table on the centreline four
     * metres inside the front door stops a straight walk from the threshold
     * dead, and the verifier's own front-door leg caught it. Under the
     * chandelier it is the piece the whole hall is built around, and the
     * processional route from the door to the foot of either flight stays
     * completely clear -- which is the rule the rest of this room's dressing
     * already follows. */
    const inlayZ = CHANDELIER_POS.z;
    const inlay = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), M_MARBLE_DK);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(0, GY + 0.022, inlayZ);
    root.add(inlay);
    for (const [rIn, rOut] of [[2.3, 2.55], [1.1, 1.2]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 40), M_GOLD);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, GY + 0.03, inlayZ);
      root.add(ring);
    }
    // Compass points, in gold, radiating out of the inlay.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      root.add(box({
        size: [i % 2 ? 0.9 : 1.7, 0.006, 0.12],
        pos: [Math.cos(a) * (i % 2 ? 1.7 : 1.9), GY + 0.032, inlayZ + Math.sin(a) * (i % 2 ? 1.7 : 1.9)],
        mat: M_GOLD,
        rotY: -a,
        cast: false,
      }));
    }
    // A runner from the threshold to the foot of the horseshoe.
    rug(0, (FOYER.z0 + 42) / 2 + 0.4, 3.6, 42 - FOYER.z0 - 1.6, GY, M_CARPET_HALL);

    // ---- The horseshoe: two flights, rising to the gallery slab at z=48.
    stairFlight(STAIR_WEST, GY, UY, 'horseshoe-west', 'east');
    stairFlight(STAIR_EAST, GY, UY, 'horseshoe-east', 'west');
    const stairY = (z) => THREE.MathUtils.lerp(
      GY, UY, THREE.MathUtils.clamp((z - STAIR_WEST.z0) / (STAIR_WEST.z1 - STAIR_WEST.z0), 0, 1),
    );
    // Each flight's inner edge is open over the foyer -- balustrade it.
    rakingRail(STAIR_WEST.x1, STAIR_WEST.z0, STAIR_WEST.z1, stairY, 'horseshoe-west');
    rakingRail(STAIR_EAST.x0, STAIR_EAST.z0, STAIR_EAST.z1, stairY, 'horseshoe-east');
    /* Flared bottom steps. `rakingRail` now plants its own newel at the foot
     * of each flight, so the separate pair that used to stand here has gone
     * (two newels in the same place is what made the old foot of the stair
     * read as a lump). What the room got instead is the thing a horseshoe in
     * a hall this deep should have: two curtail steps spreading out of the
     * bottom of each flight, into the six metres of floor the front wall
     * freed up. */
    /* THE FLARE IS ON THE OPEN SIDE ONLY.
     *
     * It used to grow both ways -- `size: [fx1 - fx0 + grow * 2, ...]` about
     * the flight's own centre -- and each flight has a WALL down its outer
     * flank (the foyer's x = +/-9 partitions, inner face at +/-8.85, which is
     * exactly where the treads stop). Measured on the bottom step: it ran from
     * x = -9.53, so 0.68 m of marble was inside the masonry, and the step read
     * as sinking into the wall. A curtail step flares onto the side the
     * balustrade is on and stays flush with the wall on the other, which is
     * both what a stone stair does and what fits here. */
    for (const [fx0, fx1, openDir] of [
      [STAIR_WEST.x0, STAIR_WEST.x1, 1], [STAIR_EAST.x0, STAIR_EAST.x1, -1],
    ]) {
      for (let i = 0; i < 2; i++) {
        const grow = 0.34 * (2 - i);
        const y = GY + 0.16 * i;
        const zc = STAIR_WEST.z0 - 0.5 + i * 0.28;
        const cx0 = openDir > 0 ? fx0 : fx0 - grow;
        const cx1 = openDir > 0 ? fx1 + grow : fx1;
        root.add(box({
          size: [cx1 - cx0, 0.16, 0.32],
          pos: [(cx0 + cx1) / 2, y + 0.08, zc],
          mat: M_MARBLE,
          name: 'horseshoe-curtail',
        }));
        root.add(box({
          size: [(cx1 - cx0) * 0.62, 0.02, 0.32],
          pos: [(fx0 + fx1) / 2, y + 0.17, zc],
          mat: M_CARPET_HALL,
          cast: false,
        }));
      }
    }

    // ---- The balcony in the middle, cantilevered out over the void.
    root.add(box({
      size: [BALCONY.x1 - BALCONY.x0, 0.24, BALCONY.z1 - BALCONY.z0],
      pos: [(BALCONY.x0 + BALCONY.x1) / 2, UY - 0.12, (BALCONY.z0 + BALCONY.z1) / 2],
      mat: M_MARBLE,
      name: 'balcony-floor',
    }));
    // Corbels under it, so it is held up by something.
    for (const cx of [-2.3, 0, 2.3]) {
      root.add(box({
        size: [0.4, 0.5, 0.9], pos: [cx, UY - 0.48, BALCONY.z0 + 0.5], mat: M_MARBLE_DK, cast: false,
      }));
    }
    railing(BALCONY.x0, BALCONY.x1, BALCONY.z0 - 0.04, BALCONY.z0 + 0.04, UY, 'balcony-south');
    railing(BALCONY.x0 - 0.04, BALCONY.x0 + 0.04, BALCONY.z0, BALCONY.z1, UY, 'balcony-west');
    railing(BALCONY.x1 - 0.04, BALCONY.x1 + 0.04, BALCONY.z0, BALCONY.z1, UY, 'balcony-east');
    // The gallery's own edge, between the balcony bay and each flight.
    railing(STAIR_WEST.x1, BALCONY.x0, Z_GALLERY_S - 0.04, Z_GALLERY_S + 0.04, UY, 'gallery-edge-west');
    railing(BALCONY.x1, STAIR_EAST.x0, Z_GALLERY_S - 0.04, Z_GALLERY_S + 0.04, UY, 'gallery-edge-east');

    // ---- Chandelier, hanging in the void where both floors can see it.
    const cp = CHANDELIER_POS;
    const chandelier = new THREE.Group();
    chandelier.add(cylinder({ r: 0.05, h: 1.4, pos: [0, 0.7, 0], mat: M_BRONZE }));
    const tiers = [
      { y: 0, r: 1.45, bulbs: 12, arm: 0.2 },
      { y: -0.42, r: 1.0, bulbs: 8, arm: 0.16 },
      { y: -0.76, r: 0.5, bulbs: 5, arm: 0.12 },
    ];
    for (const tier of tiers) {
      for (let i = 0; i < tier.bulbs; i++) {
        const a = (i / tier.bulbs) * Math.PI * 2;
        const bx = Math.cos(a) * tier.r;
        const bz = Math.sin(a) * tier.r;
        chandelier.add(box({
          size: [tier.r * 0.9, 0.03, 0.03], pos: [bx / 2, tier.y, bz / 2], mat: M_GOLD, rotY: a,
        }));
        chandelier.add(sphere({ r: tier.arm * 0.5, pos: [bx, tier.y - 0.06, bz], mat: M_BULB_WARM }));
        chandelier.add(box({
          size: [0.02, 0.3, 0.02], pos: [bx * 0.85, tier.y - 0.24, bz * 0.85], mat: M_CRYSTAL,
        }));
      }
    }
    chandelier.add(sphere({ r: 0.16, pos: [0, -1.0, 0], mat: M_GOLD }));
    chandelier.position.set(cp.x, cp.y, cp.z);
    root.add(chandelier);
    const chandelierLight = new THREE.PointLight(0xffd9a0, 9, 26, 2);
    chandelierLight.position.set(cp.x, cp.y - 0.4, cp.z);
    root.add(chandelierLight);
    // A wash close to the roof: measured on the old scene, a point light aimed
    // down the room leaves the ceiling above it black, and neither a hemisphere
    // ground-colour bump nor a scene ambient can fix that without blowing the
    // night exterior out (see the composition root's note). A second light
    // within a metre of the surface does.
    const roofWash = new THREE.PointLight(0xfff3d8, 10, 15, 2);
    roofWash.position.set(cp.x, UCY - 0.6, cp.z);
    root.add(roofWash);

    // ---- Foyer dressing.
    //
    // Everything here is kept off two routes on purpose: the walk from the
    // front door to the foot of either flight, and the walk from the middle
    // of the rear hall to the cellar stair on the east side. A console table
    // parked in either of those is indistinguishable, from the player's side
    // of the screen, from an invisible wall.
    buildSmallStatue(-5.6, 39.0, GY, M_SILVER);
    buildSmallStatue(5.6, 39.0, GY, M_SILVER);
    rug(0, 50.6, 6.0, 4.2, GY, M_RUG_LIVING);

    /* SOMETHING IN THE MAIN ROOM (owner playtest 2026-08-04: "Need something
     * in that main room when you walk in").
     *
     * The hall had a chandelier over an empty floor and two small statues
     * pushed against the stairs; there was nothing at eye level between the
     * door and the horseshoe at all. It now has the one piece a hall like
     * this is built around: a round gilded centre table on the compass inlay,
     * carrying an arrangement tall enough to read from the threshold, with
     * the light picking it out of the double-height space above it.
     *
     * It stands ON the inlay at z=40.4, which is 4.4 m clear of the door and
     * 1.6 m clear of the foot of either flight -- the two routes the rest of
     * this room's dressing is deliberately kept off. */
    const tableY = GY;
    root.add(cylinder({
      r: 1.35, h: 0.09, pos: [0, tableY + 0.78, inlayZ], mat: M_MARBLE, name: 'foyer-centre-table',
    }));
    root.add(cylinder({
      r: 1.4, h: 0.05, pos: [0, tableY + 0.75, inlayZ], mat: M_GOLD, cast: false,
    }));
    root.add(cylinder({
      rTop: 0.28, rBottom: 0.42, h: 0.72, pos: [0, tableY + 0.36, inlayZ], mat: M_WOOD_DK,
    }));
    root.add(cylinder({
      rTop: 0.62, rBottom: 0.78, h: 0.12, pos: [0, tableY + 0.06, inlayZ], mat: M_MARBLE_DK,
    }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      root.add(box({
        size: [0.5, 0.1, 0.12],
        pos: [Math.cos(a) * 0.5, tableY + 0.1, inlayZ + Math.sin(a) * 0.5],
        mat: M_GOLD,
        rotY: -a,
        cast: false,
      }));
    }
    solid(-1.4, 1.4, tableY, tableY + 0.86, inlayZ - 1.4, inlayZ + 1.4);
    /* The arrangement: an urn and a dome of blooms.
     *
     * Sized against a person, after a first pass that was not: 26-cm flower
     * heads on a metre-wide dome standing at eye level filled the entire
     * screen from anywhere in the front half of the hall. Real heads are 6-9
     * cm, the dome is 1.1 m across, and the whole thing tops out at 2.4 m --
     * under a 2.86 m eye line, so it is something you look AT rather than
     * something you look THROUGH. */
    root.add(cylinder({
      rTop: 0.34, rBottom: 0.2, h: 0.44, pos: [0, tableY + 1.05, inlayZ], mat: M_GOLD,
    }));
    root.add(cylinder({
      rTop: 0.36, rBottom: 0.3, h: 0.05, pos: [0, tableY + 1.27, inlayZ], mat: M_GOLD, cast: false,
    }));
    const M_FOYER_LEAF = mat({ color: 0x2c5f37, roughness: 0.95 });
    const M_FOYER_BLOOM = mat({ color: 0xf4efe2, roughness: 0.8 });
    const M_FOYER_BLOOM_GOLD = mat({ color: 0xe0b448, roughness: 0.7 });
    for (let i = 0; i < 40; i++) {
      const t = (i + 0.5) / 40;
      const a = i * 2.399963; // golden angle, so nothing lands in a ring
      const r = 0.55 * Math.sqrt(1 - t * t);
      const hgt = 1.3 + t * 0.62;
      root.add(sphere({
        r: 0.055 + Math.random() * 0.028,
        pos: [Math.cos(a) * r, tableY + hgt, inlayZ + Math.sin(a) * r],
        mat: i % 6 === 0 ? M_FOYER_BLOOM_GOLD : M_FOYER_BLOOM,
        cast: false,
      }));
      if (i % 2 === 0) {
        root.add(box({
          size: [0.035, 0.2, 0.11],
          pos: [Math.cos(a) * r * 1.05, tableY + hgt - 0.13, inlayZ + Math.sin(a) * r * 1.05],
          mat: M_FOYER_LEAF,
          rotY: -a,
          rotZ: Math.cos(a) * 0.6,
          cast: false,
        }));
      }
    }
    const centreGlow = new THREE.PointLight(0xffe9c0, 3.4, 7, 2);
    centreGlow.position.set(0, tableY + 2.35, inlayZ);
    root.add(centreGlow);
    // Console tables down the rear hall's west wall, clear of the cellar
    // stairwell opposite them, with a lamp between and a bowl for keys.
    // North of the archway mouth (z:48.5-52.5), not across it.
    for (const cz of [54.4, 56.6]) {
      caseFurniture(-8.3, cz, GY, 1.8, 0.55, 0.86, Math.PI / 2, 2);
      root.add(cylinder({ r: 0.14, h: 0.05, pos: [-8.3, GY + 0.9, cz], mat: M_GOLD }));
    }
    {
      const lamp = makeFloorLamp(M, { x: -8.0, z: 53.2 });
      const wrap = new THREE.Group();
      wrap.position.y = GY;
      wrap.add(lamp.group);
      root.add(wrap);
      const ll = new THREE.PointLight(0xffd0a0, 2.8, 10, 2);
      ll.position.set(-8.0, GY + 1.55, 53.2);
      root.add(ll);
    }
    for (const side of [-1, 1]) {
      sconce(side * (FOYER.x1 - 0.05), GY + 2.6, 39.4, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      sconce(side * (FOYER.x1 - 0.05), GY + 2.6, 44, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      sconce(side * (FOYER.x1 - 0.05), GY + 2.6, 56.6, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    // Potted palms in the two corners beside the front door, where nobody
    // walks and where they frame the doorway from inside.
    for (const px of [-4.6, 4.6]) {
      const potted = makePlant(M, { x: px, z: FOYER.z0 + 0.7, scale: 1.9 });
      const wrap = new THREE.Group();
      wrap.position.y = GY;
      wrap.add(potted.group);
      root.add(wrap);
      solid(px - 0.35, px + 0.35, GY, GY + 1.6, FOYER.z0 + 0.35, FOYER.z0 + 1.05);
    }
    /* THE CREST, MOVED OFF THE GLASS.
     *
     * It used to hang at (0, 6.6, 41.28) -- flat across the front door's own
     * two-storey transom, which is a glazed opening in the south wall. That
     * is the same fault as art over a doorway (and the art/opening sweep in
     * tools/verify-mansion.mjs now fails it), and it also meant the one thing
     * you were meant to see coming down the stairs was hung behind you.
     *
     * It hangs on the balcony's own front instead: six metres wide, facing
     * the front door across the void, lit from the chandelier. It is the
     * first thing in the house you look at, which is what a crest is for. */
    const crest = squatchArt('mansion-foyer-crest', {
      title: ['THE SILVER', 'SASQUATCHES'], footer: 'FAMILY, FIRST', ink: '#d8b23a', bg: '#1a1218',
    });
    root.add(box({
      size: [BALCONY.x1 - BALCONY.x0 + 0.5, 1.5, 0.16],
      pos: [0, UY - 0.62, BALCONY.z0 - 0.06],
      mat: M_MARBLE_DK,
      name: 'balcony-apron',
    }));
    root.add(box({
      size: [BALCONY.x1 - BALCONY.x0 + 0.7, 0.12, 0.24],
      pos: [0, UY - 1.4, BALCONY.z0 - 0.08],
      mat: M_GOLD,
      cast: false,
    }));
    /* FACING THE FRONT DOOR, AND CLEAR OF ITS OWN BACKING PLATE.
     *
     * Two faults on the one piece, both measured off the built scene:
     *
     *  - it was hung at rotY 0, so the plane's normal pointed NORTH, into the
     *    balcony. Every material in this file is a MeshStandardMaterial, which
     *    is FrontSide -- so the crest the whole hall is arranged around was
     *    back-facing from the only place in the house you can look at it, and
     *    what you actually saw from the front door was the gilt plate behind
     *    it. Every other flat in the building faces its own room (checked, all
     *    sixteen of them); this was the one that did not.
     *
     *  - the plate behind it is 0.06 m thick where every sibling plate in the
     *    house is 0.05, and it sat at z = 45.07: south face at z = 45.0400,
     *    with the crest itself at z = 45.0400. Two coplanar surfaces facing
     *    the same way across 1.9 m^2 of the balcony front, in the double-
     *    height space you look straight at on the way in -- the exact recipe
     *    for the flicker the owner reported.
     *
     * Now: rotY PI, and the plate 1 cm north of the art (crest 45.0400, plate
     * face 45.0500). */
    const crestMesh = flatArt('mansion.foyer.crest', {
      x: 0,
      y: UY - 0.68,
      z: BALCONY.z0 - 0.16,
      rotY: Math.PI,
      w: 1.05,
      h: 1.29,
      material: mat({ map: crest, roughness: 0.85, unique: true }),
    });
    root.add(box({
      size: [1.25, 1.49, 0.06], pos: [0, UY - 0.68, BALCONY.z0 - 0.12], mat: M_GOLD, cast: false, name: 'foyer-crest-plate',
    }));
    // Gilded scrollwork either side of it, along the balcony's apron.
    for (const sx of [-2.1, 2.1]) {
      root.add(box({
        size: [1.3, 0.06, 0.06], pos: [sx, UY - 0.5, BALCONY.z0 - 0.13], mat: M_GOLD, cast: false,
      }));
      root.add(box({
        size: [1.3, 0.06, 0.06], pos: [sx, UY - 0.94, BALCONY.z0 - 0.13], mat: M_GOLD, cast: false,
      }));
      root.add(sphere({ r: 0.09, pos: [sx, UY - 0.72, BALCONY.z0 - 0.13], mat: M_GOLD, cast: false }));
    }

    // ---- The rear hall's ceiling is low (the gallery is above it); light it.
    ceilingLight(-4.5, 51, UY - 0.35, 0xffdca0, 4.6, 14);
    ceilingLight(4.5, 51, UY - 0.35, 0xffdca0, 4.6, 14);
    ceilingLight(0, 56, UY - 0.35, 0xffdca0, 4.6, 14);

    return {
      chandelier,
      chandelierLight,
      stairY,
      roofWash,
      /* The three rects the owner's layout brief is actually about, handed
       * out so tools/verify-mansion.mjs can assert the SHAPE of the house and
       * not just that rooms with the right names can be walked into. */
      crest: crestMesh,
      stairWest: { ...STAIR_WEST },
      stairEast: { ...STAIR_EAST },
      balcony: { ...BALCONY },
    };
  }
  const foyerProps = buildFoyer();

  /* ================================================================== */
  /* THE BASEMENT STAIR                                                  */
  /*                                                                      */
  /* Descends inside BASEMENT_SHAFT -- a genuine hole through the podium. */
  /* Guarded on its open side by a masonry stringer wall (a VISIBLE mesh   */
  /* with a collider, never a bare blocker) and railed at floor level.     */
  /* ================================================================== */
  function buildBasementStair() {
    const z0 = BASEMENT_STAIR.z0;
    const z1 = BASEMENT_STAIR.z1;
    const treadX0 = BASEMENT_STAIR.x0 + 0.15;
    const treadX1 = BASEMENT_STAIR.x1 - 0.15;
    const stairY = (z) => THREE.MathUtils.lerp(
      GY, BY, THREE.MathUtils.clamp((z - z0) / (z1 - z0), 0, 1),
    );
    const steps = 22;
    const depth = (z1 - z0) / steps;
    for (let i = 0; i < steps; i++) {
      const z = z0 + depth * (i + 0.5);
      const y = stairY(z0 + depth * i);
      root.add(box({
        size: [treadX1 - treadX0, 0.13, depth + 0.05],
        pos: [(treadX0 + treadX1) / 2, y + 0.065, z],
        mat: M_MARBLE_DK,
        name: 'basement-stair-tread',
      }));
      root.add(box({
        size: [treadX1 - treadX0, (GY - BY) / steps, 0.05],
        pos: [(treadX0 + treadX1) / 2, y - (GY - BY) / (steps * 2), z - depth / 2],
        mat: concreteMaterial(3, 0.3),
        name: 'basement-stair-riser',
      }));
    }
    /* THE GAP BEHIND THE STAIRS (owner playtest 2026-08-04, verbatim):
     *
     *   "The basement also needs work. There is a gap behind the stairs so
     *    you can get behind the stairs."
     *
     * Measured: the cellar flight had treads and a stringer but no spandrel,
     * so the whole wedge underneath it was open air -- and the armory floor
     * runs south past the stair's head (BASEMENT_ROOM starts at z=50, the
     * shaft at z=51), which left a mouth a metre wide at x:5.7..9 that walked
     * you straight in under the flight. From in there you were standing in a
     * void looking up at the underside of the treads and out through the hole
     * in the podium.
     *
     * Filled the way the horseshoe upstairs already is: a solid masonry
     * spandrel under the run, and a wall closing the mouth at the stair's
     * head. That turns the leftover strip at z:50..51 into an honest alcove
     * of the armory (it is dressed as one -- see buildBasement) instead of a
     * hole in the room's logic.
     */
    for (let i = 0; i < steps; i++) {
      const za = z0 + depth * i;
      const zb = za + depth;
      const massTop = stairY(za + depth * 0.5) - 0.07;
      if (massTop > BY) {
        root.add(box({
          size: [treadX1 - treadX0, massTop - BY, depth + 0.03],
          pos: [(treadX0 + treadX1) / 2, (BY + massTop) / 2, (za + zb) / 2],
          mat: concreteMaterial(3.3, Math.max(0.3, massTop - BY)),
          cast: false,
          name: 'basement-stair-spandrel',
        }));
      }
    }
    /* The wall across the stair's head, closing the way in underneath it.
     *
     * It stops at y=0 -- the underside of the ground-floor podium -- and NOT
     * at GY. core/player.js skips a collider only when your feet are strictly
     * above its top, so a wall reaching the ground floor's own walking
     * surface would be an invisible blocker standing across the mouth of the
     * cellar stair for anyone walking into it from the rear hall, which is
     * the exact failure the previous pass spent its time removing. At y=0 it
     * is skipped by anyone upstairs and blocks everyone in the armory. */
    root.add(box({
      size: [BASEMENT_STAIR.x1 - BASEMENT_STAIR.x0, -BY, 0.3],
      pos: [(BASEMENT_STAIR.x0 + BASEMENT_STAIR.x1) / 2, BY / 2, z0 - 0.15],
      mat: concreteMaterial(3.6, -BY),
      name: 'basement-stair-headwall',
    }));
    solid(BASEMENT_STAIR.x0, BASEMENT_STAIR.x1, BY, 0, z0 - 0.3, z0);

    // Masonry stringer down the open (west) side, from the armory floor up to
    // the treads: the wall this stair is carried on. Segmented so it follows
    // the rake instead of being one tall slab.
    for (let i = 0; i < steps; i++) {
      const za = z0 + depth * i;
      const zb = za + depth;
      const top = stairY(za) + 0.06;
      root.add(box({
        size: [0.3, top - BY, depth + 0.02],
        pos: [BASEMENT_STAIR.x0 + 0.15, (BY + top) / 2, (za + zb) / 2],
        mat: concreteMaterial(1, top - BY),
        name: 'basement-stair-stringer',
      }));
      solid(BASEMENT_STAIR.x0, BASEMENT_STAIR.x0 + 0.3, BY, top, za, zb);
    }
    /* One continuous brass handrail on top of the stringer, on the rake.
     *
     * This used to be a short level bar per step at `top + 0.95`, which is
     * the same "bunch of T bars" the owner reported on the horseshoe -- a
     * flight of 22 disconnected handrails climbing down the wall. Built the
     * way `rakingRail` builds the ones upstairs: one box, rotated onto the
     * stair's own pitch, on standards that follow the treads. */
    {
      const railTopBottom = stairY(z0) + 0.06 + 0.95;
      const railTopTop = stairY(z1) + 0.06 + 0.95;
      const runZ = z1 - z0;
      const pitch = Math.atan2(railTopTop - railTopBottom, runZ);
      const railX = BASEMENT_STAIR.x0 + 0.15;
      root.add(box({
        size: [0.09, 0.07, Math.hypot(runZ, railTopTop - railTopBottom)],
        pos: [railX, (railTopBottom + railTopTop) / 2, (z0 + z1) / 2],
        mat: M_GOLD,
        rotX: -pitch,
        name: 'basement-stair-handrail',
      }));
      for (let i = 0; i <= 9; i++) {
        const z = THREE.MathUtils.lerp(z0, z1, i / 9);
        const top = stairY(z) + 0.06;
        root.add(cylinder({
          r: 0.022, h: 0.95, pos: [railX, top + 0.48, z], mat: M_CHROME,
        }));
      }
    }
    /* Floor-level guard right round the opening, except the mouth at its
     * south end where you walk in.
     *
     * The raking masonry above is NOT enough on its own: its top follows the
     * stair down, so a metre past the mouth it is already below the ground
     * floor and core/player.js skips it for anyone standing up there. Without
     * this, walking east across the rear hall dropped you into the stairwell
     * -- caught by the verifier's own "unfenced hole in the floor" check. */
    /* Newels off, and one planted by hand at the mouth. `railing` caps both
     * ends of a run, and this run's north end IS the z=58 cross wall -- the
     * post it put there measured at x 5.32..5.48, z 57.92..58.08, entirely
     * inside the masonry. */
    railing(BASEMENT_STAIR.x0 - 0.04, BASEMENT_STAIR.x0 + 0.04, z0, z1, GY, 'basement-hole-west', { newels: false });
    newel(BASEMENT_STAIR.x0, GY, z0);
    /* There is deliberately NO north run any more. The shaft's north edge is
     * z = 58, which is the ground floor's own cross wall (band 57.85..58.15,
     * solid at these x -- the nearest opening in it is `loungeToKitchen` at
     * x:11..14), and that wall already stops anyone walking south out of the
     * ballroom. The run that used to be here stood at z 57.93..58.07: a
     * handrail, a shoe rail, nine balusters and three newels, every one of
     * them measured INSIDE the masonry. A balustrade buried in a wall is not a
     * guard, it is two objects in the same place. The west run -- the one the
     * verifier walks at -- is untouched. */
    // A lit sign, because "basement doesn't work" started with not finding it.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.3),
      mat({
        map: printed('mansion.cellar', ['CELLAR'], {
          w: 384, h: 128, bg: '#151016', fg: '#e8c268', font: '900 62px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.7,
        emissive: 0x6a5220,
        unique: true,
      }),
    );
    sign.position.set(FOYER.x1 - 0.09, GY + 2.2, 50.2);
    sign.rotation.y = -Math.PI / 2;
    root.add(sign);
    const stairLamp = new THREE.PointLight(0xffe0a8, 3.6, 10, 2);
    stairLamp.position.set(7.2, GY + 2.1, 51.6);
    root.add(stairLamp);

    /* "Need to move the plants in front of the stairs" -- the head of the
     * cellar stair was a bare hole in a marble floor with a lit sign over it.
     * A pair of tall planters now stands along its guarded west side, which
     * is where they can go and nowhere else:
     *
     *   - EAST of the mouth is the archway into the lounge, whose opening
     *     runs z:48.5..52.5 in the x=9 partition. A planter anywhere in that
     *     band is furniture standing in a doorway, and the walk-in test
     *     catches it (it did: the first placement blocked the lounge).
     *   - NORTH of the mouth is the stairwell itself -- a genuine hole.
     *   - SOUTH of the mouth is the run everyone uses to reach the cellar.
     *
     * So they stand at x=4.75, west of the well's own guard rail and north
     * of the archway band, screening the drop from the rear hall exactly the
     * way a pair of planters at the head of a stair is meant to. */
    for (const [px, pz] of [
      [4.75, 53.0],
      [4.75, 55.8],
    ]) {
      root.add(box({
        size: [0.72, 0.62, 0.72], pos: [px, GY + 0.31, pz], mat: M_MARBLE_DK, name: 'cellar-planter',
      }));
      root.add(box({
        size: [0.82, 0.08, 0.82], pos: [px, GY + 0.62, pz], mat: M_GOLD, cast: false,
      }));
      const potted = makePlant(M, { x: px, z: pz, scale: 1.5 });
      const wrap = new THREE.Group();
      wrap.position.y = GY + 0.62;
      wrap.add(potted.group);
      root.add(wrap);
      solid(px - 0.38, px + 0.38, GY, GY + 1.5, pz - 0.38, pz + 0.38);
    }
    return { stairY };
  }
  const basementStairProps = buildBasementStair();

  /* ================================================================== */
  /* GROUND FLOOR -- LIVING ROOM (west front)                            */
  /* ================================================================== */
  function buildLivingRoom() {
    const r = LIVING;
    trimRoom(r, GY, UY - 0.3);
    topping(r.x0, r.x1, GY + 0.01, r.z0, r.z1, M_PARQUET, 'living-floor');
    rug(-12.5, 47.5, 6.4, 5.4, GY, M_RUG_LIVING);

    function makeCouch(x, z, yaw, len = 2.4) {
      const g = new THREE.Group();
      g.add(box({ size: [len, 0.45, 0.95], pos: [0, 0.3, 0], mat: M_FABRIC_COUCH, name: 'couch-base' }));
      g.add(box({ size: [len, 0.62, 0.2], pos: [0, 0.72, -0.37], mat: M_FABRIC_COUCH, name: 'couch-back' }));
      g.add(box({ size: [0.2, 0.38, 0.95], pos: [-len / 2 + 0.1, 0.58, 0], mat: M_LEATHER_RED }));
      g.add(box({ size: [0.2, 0.38, 0.95], pos: [len / 2 - 0.1, 0.58, 0], mat: M_LEATHER_RED }));
      for (const cx of [-len * 0.25, len * 0.25]) {
        g.add(box({ size: [len * 0.44, 0.14, 0.86], pos: [cx, 0.55, 0.02], mat: M_FABRIC_COUCH, cast: false }));
      }
      g.position.set(x, GY, z);
      g.rotation.y = yaw;
      root.add(g);
      const hx = Math.abs(Math.cos(yaw)) * len / 2 + Math.abs(Math.sin(yaw)) * 0.52;
      const hz = Math.abs(Math.sin(yaw)) * len / 2 + Math.abs(Math.cos(yaw)) * 0.52;
      solid(x - hx, x + hx, GY, GY + 0.95, z - hz, z + hz);
      return g;
    }
    makeCouch(-12.5, 45.3, 0);
    makeCouch(-15.1, 47.8, Math.PI / 2, 2.1);
    makeCouch(-9.9, 47.8, -Math.PI / 2, 2.1);

    const M_PILLOW_GOLD = mat({ map: fabricTex('#c9a13a'), roughness: 0.85 });
    const M_PILLOW_CREAM = mat({ map: fabricTex('#e8ddc4'), roughness: 0.85 });
    for (const [px, pz, yaw, pmat] of [
      [-13.3, 45.5, 0.32, M_PILLOW_GOLD], [-11.7, 45.5, -0.22, M_PILLOW_CREAM],
      [-15.1, 47.4, Math.PI / 2 + 0.28, M_PILLOW_CREAM], [-9.9, 48.2, -Math.PI / 2 - 0.24, M_PILLOW_GOLD],
      [-15.1, 48.4, Math.PI / 2 - 0.2, M_PILLOW_GOLD],
    ]) {
      root.add(box({
        size: [0.36, 0.26, 0.36], pos: [px, GY + 0.64, pz], mat: pmat, rotY: yaw, rotX: 0.14, rotZ: 0.1, name: 'living-pillow',
      }));
    }

    // Coffee table with things actually on it.
    root.add(box({
      size: [1.8, 0.08, 1.0], pos: [-12.5, GY + 0.42, 47.5], mat: M_MARBLE, name: 'living-coffee-table',
    }));
    for (const [lx, lz] of [[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]]) {
      root.add(box({ size: [0.09, 0.42, 0.09], pos: [-12.5 + lx, GY + 0.21, 47.5 + lz], mat: M_BRONZE }));
    }
    solid(-13.45, -11.55, GY, GY + 0.46, 47.0, 48.0);
    const ash = makeAshtray(M, { x: -12.1, y: GY + 0.47, z: 47.5 });
    root.add(ash.group);
    root.add(box({
      size: [0.3, 0.04, 0.22], pos: [-12.95, GY + 0.48, 47.6], mat: M_CARD, rotY: 0.2, cast: false,
    }));
    root.add(box({
      size: [0.3, 0.04, 0.22], pos: [-13.0, GY + 0.52, 47.4], mat: M_LEATHER_RED, rotY: -0.1, cast: false,
    }));

    /* A proper fireplace on the west wall, between the two windows.
     *
     * Owner playtest, verbatim: "Fireplace downstairs is messewd up its black
     * box with the logs just slightly poking thro". Measured exactly as he
     * describes it, and the numbers name both halves of the fault: the
     * surround was ONE solid slab from x -15.95 to -15.45 with no opening in
     * it at all; the dark firebox was a box hung on the FRONT of that slab at
     * -15.70..-15.36, standing 90 mm proud of the marble; and the logs at
     * -15.56..-15.44 crossed the marble face by 10 mm, which is the "slightly
     * poking thro". Nothing was recessed because there was nothing to recess
     * into.
     *
     * Rebuilt the same way as Lou's upstairs: pilasters and a frieze with a
     * real 1.5 x 1.30 m opening between them, a five-sided recess behind it,
     * and the fire standing INSIDE that recess at x -15.71..-15.59 -- 140 mm
     * behind the surround's face instead of 10 mm through it. */
    const fx = r.x0 + 0.05;
    const fireOpZ0 = 51.85;
    const fireOpZ1 = 53.35;
    const fireOpTop = GY + 1.30;
    for (const [pz0, pz1] of [[51.3, fireOpZ0], [fireOpZ1, 53.9]]) {
      root.add(box({
        size: [0.5, 1.30, pz1 - pz0], pos: [fx + 0.25, GY + 0.65, (pz0 + pz1) / 2], mat: M_MARBLE_DK, name: 'fireplace',
      }));
      root.add(box({
        size: [0.56, 0.09, pz1 - pz0 + 0.05], pos: [fx + 0.28, fireOpTop - 0.045, (pz0 + pz1) / 2], mat: M_MARBLE, cast: false, name: 'fireplace-capital',
      }));
    }
    root.add(box({
      size: [0.5, 0.13, 2.6], pos: [fx + 0.25, fireOpTop + 0.065, 52.6], mat: M_MARBLE_DK, name: 'fireplace-frieze',
    }));
    root.add(box({
      size: [0.54, 0.1, 0.7], pos: [fx + 0.27, fireOpTop + 0.065, 52.6], mat: M_MARBLE, cast: false, name: 'fireplace-tablet',
    }));
    root.add(box({
      size: [0.5, 0.73, 2.6], pos: [fx + 0.25, GY + 1.935, 52.6], mat: M_MARBLE_DK, name: 'fireplace-breast',
    }));
    root.add(box({ size: [0.72, 0.14, 3.0], pos: [fx + 0.36, GY + 1.5, 52.6], mat: M_MARBLE, name: 'mantel' }));
    // The recess: five faces of firebrick, open to the room.
    root.add(box({
      size: [0.06, 1.30, 1.5], pos: [fx + 0.03, GY + 0.65, 52.6], mat: M_SILHOUETTE, cast: false, name: 'fireplace-firebox-back',
    }));
    for (const cz of [fireOpZ0 + 0.03, fireOpZ1 - 0.03]) {
      root.add(box({
        size: [0.44, 1.30, 0.06], pos: [fx + 0.28, GY + 0.65, cz], mat: M_SILHOUETTE, cast: false, name: 'fireplace-firebox-cheek',
      }));
    }
    root.add(box({
      size: [0.44, 0.06, 1.5], pos: [fx + 0.28, GY + 1.27, 52.6], mat: M_SILHOUETTE, cast: false, name: 'fireplace-firebox-top',
    }));
    root.add(box({
      size: [0.44, 0.05, 1.44], pos: [fx + 0.28, GY + 0.025, 52.6], mat: M_MARBLE_DK, cast: false, name: 'fireplace-firebox-floor',
    }));
    root.add(box({
      size: [0.45, 0.08, 2.0], pos: [fx + 0.725, GY + 0.04, 52.6], mat: M_MARBLE_DK, cast: false, name: 'fireplace-hearth',
    }));
    solid(fx, fx + 0.6, GY, GY + 2.3, 51.2, 54.0);
    const fireGlow = new THREE.PointLight(0xff7a2a, 4.2, 9, 2);
    fireGlow.position.set(fx + 0.9, GY + 0.6, 52.6);
    root.add(fireGlow);
    // A cast grate with front bars, and the logs burning on it.
    for (const gz of [52.6 - 0.44, 52.6 + 0.44]) {
      root.add(box({
        size: [0.34, 0.3, 0.05], pos: [fx + 0.3, GY + 0.17, gz], mat: M_RACK, cast: false, name: 'fireplace-grate-cheek',
      }));
    }
    for (let i = 0; i < 7; i++) {
      root.add(named(cylinder({
        r: 0.014, h: 0.88, pos: [fx + 0.45, GY + 0.09 + i * 0.045, 52.6], mat: M_RACK, rotZ: Math.PI / 2, rotY: Math.PI / 2, cast: false,
      }), 'fireplace-grate-bar'));
    }
    root.add(box({
      size: [0.32, 0.04, 0.86], pos: [fx + 0.3, GY + 0.08, 52.6], mat: M_RACK, cast: false, name: 'fireplace-grate-floor',
    }));
    /* Tilt and depth chosen together -- see the note on Lou's grate upstairs.
     * At 0.24 rad a 0.9 m log measures 0.33 m across; centred at -15.70 that
     * is -15.87..-15.54, clear of the recess back at -15.89 and 90 mm behind
     * the surround's face at -15.45. */
    for (let i = 0; i < 5; i++) {
      root.add(named(cylinder({
        r: 0.06,
        h: 0.9,
        pos: [fx + 0.25, GY + 0.2 + i * 0.06, 52.6 + (i - 2) * 0.16],
        mat: M_WOOD,
        rotX: Math.PI / 2,
        rotZ: 0.12 * (i - 2),
      }), 'fireplace-fire-log'));
    }
    root.add(box({
      size: [0.28, 0.05, 0.95], pos: [fx + 0.3, GY + 0.14, 52.6], mat: mat({ color: 0x140a06, emissive: 0xff5a1e, emissiveIntensity: 1.7, roughness: 0.9 }), cast: false, name: 'fireplace-embers',
    }));
    // Mantelpiece: a clock and two candlesticks.
    const clock = makeWallClock(M, {
      x: fx + 0.4, y: GY + 2.05, z: 52.6, rotY: Math.PI / 2, r: 0.24,
    });
    root.add(clock.group);
    for (const cz of [51.6, 53.6]) {
      root.add(cylinder({ r: 0.06, h: 0.1, pos: [fx + 0.36, GY + 1.62, cz], mat: M_GOLD }));
      root.add(cylinder({ r: 0.028, h: 0.34, pos: [fx + 0.36, GY + 1.84, cz], mat: M_CARD }));
      root.add(sphere({ r: 0.035, pos: [fx + 0.36, GY + 2.02, cz], mat: M_BULB_WARM, cast: false }));
    }

    /* THE FAMILY PORTRAIT WALL, MOVED OFF THE DOOR.
     *
     * Owner playtest 2026-08-04: "A lot of the art is over doorways and stuff
     * ... but I like the big art layouts". This was the worst of them and
     * measures as such: the three pieces hung on z=57.73 at x = -13.4, -11.0
     * and -15.6, and the doorway into the dining room is the opening
     * `livingToDining` at x:-14..-11 in that same wall, running up to y=3.8.
     * The big canvas covered a third of the doorway's head, the Booskibro
     * portrait clipped its east jamb, and the Lou portrait ran out through
     * the west EXTERIOR wall at x=-16 entirely.
     *
     * The layout is kept -- one big canvas with a portrait either side, which
     * is what he said he liked -- and moved bodily onto the room's inner
     * (foyer) wall, which the facade move turned into twelve unbroken metres
     * from the front wall up to the archway, with no opening anywhere in it
     * and the drinks cabinet already standing under it. Hung as a proper
     * group on one picture line, with a rail and a picture light. */
    const artWallX = r.x1 - 0.12;
    wallArt('living-crest', artWallX, GY + 2.55, 43.2, -Math.PI / 2, 1.6, 2.0,
      squatchArt('mansion-living-art', {
        title: ['THE SILVER', 'SASQUATCHES'], footer: 'FAMILY, FIRST', ink: '#c8a24a', bg: '#20161a',
      }));
    wallArt('living-booski', artWallX, GY + 2.45, 41.2, -Math.PI / 2, 0.9, 1.2,
      makePortraitTexture('booski', 'BOOSKIBRO', '#1e1a26'));
    wallArt('living-lou', artWallX, GY + 2.45, 45.2, -Math.PI / 2, 0.9, 1.2,
      makePortraitTexture('lou', 'BIG UNCLE LOU', '#241a14'));
    // Picture rail tying the three together, and a light over the canvas.
    root.add(box({
      size: [0.06, 0.05, 5.6], pos: [r.x1 - 0.06, GY + 3.72, 43.2], mat: M_GOLD, cast: false,
    }));
    sconce(r.x1 - 0.09, GY + 3.72, 43.2, -Math.PI / 2, 2.0);

    // Drinks cabinet by the archway.
    caseFurniture(-9.8, 43.2, GY, 1.6, 0.5, 1.0, -Math.PI / 2, 2);
    const bottle = makeWhiskeyBottle(M, { x: -9.8, y: GY + 1.02, z: 43.0, rotY: 0.4 });
    root.add(bottle.group);
    for (const gz of [43.4, 43.6]) {
      const glassProp = makeShotGlass(M, { x: -9.9, y: GY + 1.02, z: gz });
      root.add(glassProp.group);
    }

    // Curtains on the south glazing and the west windows.
    curtains('z', r.z0 + 0.2, -12.5, GY + 0.1, 6.4, 3.6);
    curtains('x', r.x0 + 0.22, 49.5, GY + 0.1, 6.2, 3.6);

    /* The floor lamp used to stand at (-15.2, 44.4). That is now the middle of
     * the arcade into the trophy hall, and a standard lamp in an archway is
     * the same fault as a picture over a door. Moved to the corner beyond the
     * fireplace, which is the darkest part of this room and wants it more. */
    const lamp = makeFloorLamp(M, { x: -15.3, z: 56.4 });
    const lampWrap = new THREE.Group();
    lampWrap.position.y = GY;
    lampWrap.add(lamp.group);
    root.add(lampWrap);
    const lampLight = new THREE.PointLight(0xffc98a, 3.4, 12, 2);
    lampLight.position.set(-15.3, GY + 1.5, 56.4);
    root.add(lampLight);
    const plant = makePlant(M, { x: -10.2, z: 55.6, scale: 1.7 });
    const plantWrap = new THREE.Group();
    plantWrap.position.y = GY;
    plantWrap.add(plant.group);
    root.add(plantWrap);

    const ceil = ceilingLight(-12.5, 47.5, UY - 0.4, 0xffdca0, 6, 17);
    ceilingLight(-12.5, 54, UY - 0.4, 0xffdca0, 4.4, 13);
    return { ceilingLight: ceil, fireGlow };
  }
  const livingProps = buildLivingRoom();

  /* ================================================================== */
  /* GROUND FLOOR -- THE LOUNGE (east front): billiards + the silverware */
  /*                                                                      */
  /* The trophy room used to be upstairs, where the bedrooms now are. Its */
  /* cases, banner and jersey all moved down here rather than being       */
  /* thrown away, and got a billiard table and a bar for company.         */
  /* ================================================================== */
  function buildLounge() {
    const r = LOUNGE;
    trimRoom(r, GY, UY - 0.3);
    topping(r.x0, r.x1, GY + 0.01, r.z0, r.z1, M_PARQUET, 'lounge-floor');
    rug(12.5, 45.5, 5.4, 4.4, GY, M_RUG_LIVING);

    // ---- Billiard table. Moved 3 m south now the room has a front half:
    // it sits centred between the three bay arches rather than crowded up
    // against the kitchen end of the room.
    const bx = 12.4;
    const bz = 48.6;
    root.add(box({ size: [2.4, 0.08, 4.4], pos: [bx, GY + 0.78, bz], mat: M_FELT_GREEN, name: 'billiard-bed' }));
    for (const [ox, oz, sx, sz] of [
      [-1.28, 0, 0.16, 4.7], [1.28, 0, 0.16, 4.7], [0, -2.27, 2.72, 0.16], [0, 2.27, 2.72, 0.16],
    ]) {
      root.add(box({
        size: [sx, 0.2, sz], pos: [bx + ox, GY + 0.83, bz + oz], mat: M_WOOD_DK, name: 'billiard-rail',
      }));
    }
    for (const [lx, lz] of [[-1.0, -1.9], [1.0, -1.9], [-1.0, 1.9], [1.0, 1.9]]) {
      root.add(box({ size: [0.28, 0.74, 0.28], pos: [bx + lx, GY + 0.37, bz + lz], mat: M_WOOD_DK }));
    }
    solid(bx - 1.4, bx + 1.4, GY, GY + 0.9, bz - 2.4, bz + 2.4);
    const ballMats = [
      mat({ color: 0xf4f0e6, roughness: 0.2 }), mat({ color: 0xd8b23a, roughness: 0.2 }),
      mat({ color: 0x1c3d7a, roughness: 0.2 }), mat({ color: 0x8a1a1a, roughness: 0.2 }),
      mat({ color: 0x14141a, roughness: 0.2 }),
    ];
    for (let i = 0; i < 9; i++) {
      const a = i * 1.9;
      root.add(sphere({
        r: 0.055,
        pos: [bx + Math.sin(a) * 0.8, GY + 0.875, bz + Math.cos(a * 1.3) * 1.6],
        mat: ballMats[i % ballMats.length],
      }));
    }
    root.add(cylinder({
      r: 0.02, h: 1.5, pos: [bx + 0.5, GY + 0.9, bz - 0.6], mat: M_WOOD, rotX: Math.PI / 2, rotZ: 0.1,
    }));
    // Cue rack on the pier between the middle and north arches, plus a
    // scoreboard and a chalk shelf -- all clear of the three openings.
    root.add(box({ size: [0.12, 1.5, 0.9], pos: [r.x1 - 0.14, GY + 1.4, 49.9], mat: M_WOOD_DK }));
    for (let i = 0; i < 5; i++) {
      root.add(cylinder({
        r: 0.018, h: 1.45, pos: [r.x1 - 0.26, GY + 1.4, 49.55 + i * 0.18], mat: M_WOOD,
      }));
    }
    solid(r.x1 - 0.34, r.x1, GY, GY + 2.2, 49.45, 50.35);
    root.add(box({ size: [0.1, 0.62, 0.86], pos: [r.x1 - 0.13, GY + 2.6, 45.1], mat: M_WOOD_DK }));
    for (let i = 0; i < 4; i++) {
      root.add(box({
        size: [0.03, 0.34, 0.05], pos: [r.x1 - 0.2, GY + 2.6, 44.78 + i * 0.2], mat: M_GOLD, cast: false,
      }));
    }
    // Low pendant over the table -- the whole point of a billiard room.
    for (const pz of [bz - 1.2, bz + 1.2]) {
      root.add(cylinder({ r: 0.02, h: 1.7, pos: [bx, GY + 2.9, pz], mat: M_BRONZE }));
      root.add(cylinder({
        rTop: 0.1, rBottom: 0.34, h: 0.3, pos: [bx, GY + 1.95, pz], mat: mat({ color: 0x2a2118, roughness: 0.6 }),
      }));
      root.add(sphere({ r: 0.09, pos: [bx, GY + 1.86, pz], mat: M_BULB_WARM, cast: false }));
      const l = new THREE.PointLight(0xffe0b0, 4.2, 9, 2);
      l.position.set(bx, GY + 1.8, pz);
      root.add(l);
    }

    // ---- Trophy cases (moved down from the old upstairs trophy room).
    const cases = [];
    function trophies(g, w, h) {
      for (const ox of [-w / 4, 0, w / 4]) {
        g.add(cylinder({ r: 0.09, h: 0.25, pos: [ox, h * 0.28, 0], mat: M_TROPHY_CUP }));
        g.add(sphere({ r: 0.1, pos: [ox, h * 0.28 + 0.16, 0], mat: M_TROPHY_CUP }));
        g.add(box({ size: [0.24, 0.06, 0.16], pos: [ox, h * 0.28 - 0.15, 0], mat: M_WOOD_DK }));
      }
    }
    cases.push(makeDisplayCase(r.x0 + 0.35, GY, 43.4, Math.PI / 2, 1.7, 1.9, 0.45, trophies));
    cases.push(makeDisplayCase(r.x0 + 0.35, GY, 46.4, Math.PI / 2, 1.7, 1.9, 0.45, trophies));
    cases.push(makeDisplayCase(r.x0 + 0.35, GY, 55.6, Math.PI / 2, 1.7, 1.9, 0.45, trophies));
    cases.push(makeDisplayCase(13.2, GY, r.z0 + 0.35, 0, 1.9, 2.1, 0.4, (g, w, h) => {
      g.add(box({ size: [w * 0.7, h * 0.6, 0.05], pos: [0, h * 0.5, 0], mat: M_JERSEY }));
      g.add(box({ size: [w * 0.7 + 0.06, 0.05, 0.08], pos: [0, h * 0.8, 0], mat: M_GOLD }));
    }));
    for (const c of [
      { x: r.x0 + 0.35, z: 43.4, rotY: Math.PI / 2 },
      { x: r.x0 + 0.35, z: 46.4, rotY: Math.PI / 2 },
      { x: r.x0 + 0.35, z: 55.6, rotY: Math.PI / 2 },
      { x: 13.2, z: r.z0 + 0.35, rotY: 0 },
    ]) {
      const cl = new THREE.PointLight(0xfff2d8, 2.0, 4.0, 2);
      cl.position.set(c.x + Math.sin(c.rotY) * 0.3, GY + 1.15, c.z + Math.cos(c.rotY) * 0.3);
      root.add(cl);
    }
    // The championship banner, on the pier between the south and middle
    // arches -- it used to hang at z=48.6 on the outside wall, which is now
    // the middle arch itself.
    const banner = flatArt('lounge-banner', {
      x: r.x1 - 0.12,
      y: GY + 2.9,
      z: 45.1,
      rotY: -Math.PI / 2,
      w: 0.8,
      h: 1.6,
      material: mat({ map: makeBannerTexture(), roughness: 0.9, unique: true }),
    });
    root.add(cylinder({
      r: 0.03, h: 0.95, pos: [r.x1 - 0.12, GY + 3.72, 45.1], mat: M_GOLD, rotZ: Math.PI / 2,
    }));

    /* ================================================================ */
    /* THE BILLIARD BAY (owner playtest 2026-08-04, verbatim):           */
    /*                                                                    */
    /*   "Pooltable room very nice - lets expand it a bit out to the      */
    /*    exterior so there is enough room for the bar stools and the bar */
    /*    and then make the bar have jack and daniels"                     */
    /*                                                                     */
    /* The bar used to run down the lounge's own east wall at x=15, with   */
    /* its stools' colliders at x:13.84-14.36 and the billiard table's at  */
    /* x:11.1-13.9 -- overlapping by six centimetres, so a stool and a cue */
    /* were fighting for the same floor. Nothing short of more room fixes  */
    /* that, which is what he asked for.                                   */
    /*                                                                     */
    /* The bar therefore moves out into the new glazed bay (LOUNGE_BAY,    */
    /* built by MansionGrounds.buildShell) and stands along its outer      */
    /* wall. The table keeps the lounge. Measured clearances now: 2.2 m    */
    /* from the table to the archway piers, and 2.75 m from a pier to the  */
    /* nearest bar stool.                                                  */
    /* ================================================================ */
    const bay = LOUNGE_BAY;
    topping(bay.x0, bay.x1, GY + 0.01, bay.z0, bay.z1, M_PARQUET, 'bay-floor');
    // A darker inlaid border, so the bay reads as its own room.
    for (const [ix0, ix1, iz0, iz1] of [
      [bay.x0 + 0.5, bay.x1 - 0.5, bay.z0 + 0.5, bay.z0 + 0.8],
      [bay.x0 + 0.5, bay.x1 - 0.5, bay.z1 - 0.8, bay.z1 - 0.5],
      [bay.x0 + 0.5, bay.x0 + 0.8, bay.z0 + 0.5, bay.z1 - 0.5],
      [bay.x1 - 0.8, bay.x1 - 0.5, bay.z0 + 0.5, bay.z1 - 0.5],
    ]) topping(ix0, ix1, GY + 0.02, iz0, iz1, M_MARBLE_DK, 'bay-border');
    trimRoom(bay, GY, GY + 3.9);
    // Coffered ceiling over the bay, in gold.
    topping(bay.x0, bay.x1, GY + 3.98, bay.z0, bay.z1, M_WALL_WARM, 'bay-ceiling');
    for (let i = 0; i < 5; i++) {
      root.add(box({
        size: [bay.x1 - bay.x0, 0.12, 0.14],
        pos: [(bay.x0 + bay.x1) / 2, GY + 3.9, bay.z0 + 1.3 + i * 2.6],
        mat: M_GOLD,
        cast: false,
      }));
    }
    root.add(box({
      size: [0.14, 0.12, bay.z1 - bay.z0], pos: [(bay.x0 + bay.x1) / 2, GY + 3.9, (bay.z0 + bay.z1) / 2], mat: M_GOLD, cast: false,
    }));

    // ---- The bar itself, along the bay's outer wall.
    const barX = bay.x1 - 0.45;
    const barZ0 = 45.0;
    const barZ1 = 51.0;
    root.add(box({
      size: [0.7, 1.06, barZ1 - barZ0], pos: [barX, GY + 0.53, (barZ0 + barZ1) / 2], mat: M_WOOD_DK, name: 'lounge-bar',
    }));
    // Panelled front with a brass foot rail, which is what a bar has.
    for (let i = 0; i < 8; i++) {
      root.add(box({
        size: [0.05, 0.66, 0.6],
        pos: [barX - 0.36, GY + 0.56, barZ0 + 0.38 + i * 0.75],
        mat: M_WOOD,
        cast: false,
      }));
    }
    root.add(cylinder({
      r: 0.035, h: barZ1 - barZ0 - 0.2, pos: [barX - 0.42, GY + 0.16, (barZ0 + barZ1) / 2], mat: M_GOLD, rotX: Math.PI / 2,
    }));
    root.add(box({
      size: [0.92, 0.09, barZ1 - barZ0 + 0.3], pos: [barX - 0.06, GY + 1.1, (barZ0 + barZ1) / 2], mat: M_MARBLE, name: 'bar-top',
    }));
    root.add(box({
      size: [0.98, 0.04, barZ1 - barZ0 + 0.36], pos: [barX - 0.06, GY + 1.03, (barZ0 + barZ1) / 2], mat: M_GOLD, cast: false,
    }));
    solid(barX - 0.52, barX + 0.4, GY, GY + 1.14, barZ0 - 0.15, barZ1 + 0.15);

    /* ---- The back bar. "make the bar have jack and daniels" -- so it does:
     * square-shouldered black-label bottles, the same in-world spelling the
     * apartment's own `label.whiskey` art slot uses. */
    const backX = bay.x1 - 0.06;
    root.add(box({
      size: [0.16, 2.5, barZ1 - barZ0 + 0.8], pos: [backX, GY + 1.25, (barZ0 + barZ1) / 2], mat: M_WOOD_DK, name: 'back-bar',
    }));
    /* Shelves with a lit edge. A back bar in a night scene is otherwise a
     * black slab with black bottles on it -- measured on the first render,
     * the Jack And Daniels were invisible from two metres. The emissive strip
     * under each shelf is the standard fix and costs no light in the rig. */
    const M_SHELF_STRIP = mat({
      color: 0x2a2118, emissive: 0xffcf8a, emissiveIntensity: 1.9, roughness: 0.5,
    });
    for (const shelfY of [GY + 1.28, GY + 1.72, GY + 2.16]) {
      root.add(box({
        size: [0.3, 0.05, barZ1 - barZ0 + 0.6], pos: [backX - 0.16, shelfY, (barZ0 + barZ1) / 2], mat: M_WOOD_DK,
      }));
      root.add(box({
        size: [0.32, 0.02, barZ1 - barZ0 + 0.6], pos: [backX - 0.16, shelfY + 0.035, (barZ0 + barZ1) / 2], mat: M_GOLD, cast: false,
      }));
      root.add(box({
        size: [0.05, 0.03, barZ1 - barZ0 + 0.5], pos: [backX - 0.3, shelfY + 0.42, (barZ0 + barZ1) / 2], mat: M_SHELF_STRIP, cast: false,
      }));
    }
    // Three small lights washing down the bottles themselves.
    for (const lz of [barZ0 + 1.0, (barZ0 + barZ1) / 2, barZ1 - 1.0]) {
      const bl = new THREE.PointLight(0xffd9a0, 2.4, 3.4, 2);
      bl.position.set(backX - 0.34, GY + 2.0, lz);
      root.add(bl);
    }
    const M_JD_GLASS = mat({ color: 0x140f0a, roughness: 0.22, metalness: 0.1 });
    const M_JD_LABEL = mat({
      map: printed('mansion.jackdaniels', ['JACK AND', 'DANIELS', 'OLD NO. 7'], {
        w: 256, h: 320, bg: '#0d0b09', fg: '#e8dcc0', font: '900 40px "Trebuchet MS", sans-serif',
      }),
      roughness: 0.6,
      unique: true,
    });
    const M_JD_CAP = mat({ color: 0x1a1512, roughness: 0.5 });
    /** One square black-label bottle. */
    function jackBottle(x, y, z, rotY = 0) {
      const g = new THREE.Group();
      g.add(box({ size: [0.09, 0.2, 0.09], pos: [0, 0.1, 0], mat: M_JD_GLASS }));
      g.add(box({ size: [0.086, 0.09, 0.086], pos: [0, 0.24, 0], mat: M_JD_GLASS }));
      g.add(cylinder({ r: 0.021, h: 0.09, pos: [0, 0.33, 0], mat: M_JD_GLASS }));
      g.add(cylinder({ r: 0.024, h: 0.032, pos: [0, 0.39, 0], mat: M_JD_CAP }));
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.1), M_JD_LABEL);
      label.position.set(0, 0.115, 0.046);
      g.add(label);
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      root.add(g);
      return g;
    }
    const jackDaniels = [];
    for (let i = 0; i < 9; i++) {
      jackDaniels.push(jackBottle(backX - 0.18, GY + 1.31, barZ0 + 0.5 + i * 0.62, -Math.PI / 2 + (i % 3) * 0.12));
    }
    // A second rank on the middle shelf, plus the rest of the stock.
    for (let i = 0; i < 6; i++) {
      jackDaniels.push(jackBottle(backX - 0.2, GY + 1.75, barZ0 + 0.9 + i * 0.9, -Math.PI / 2 - 0.1));
    }
    for (let i = 0; i < 7; i++) {
      root.add(cylinder({
        rTop: 0.035, rBottom: 0.05, h: 0.3, pos: [backX - 0.16, GY + 2.32, barZ0 + 0.6 + i * 0.8], mat: mat({ color: 0x6a4a1e, roughness: 0.3 }),
      }));
    }
    // Upturned glasses and an ice bucket on the counter.
    for (let i = 0; i < 6; i++) {
      root.add(cylinder({
        rTop: 0.038, rBottom: 0.05, h: 0.11, pos: [barX - 0.2, GY + 1.2, barZ0 + 0.45 + i * 1.02], mat: M_GLASS_CASE,
      }));
    }
    root.add(cylinder({
      rTop: 0.16, rBottom: 0.12, h: 0.24, pos: [barX - 0.16, GY + 1.27, barZ1 - 0.5], mat: M_SILVER,
    }));

    /* ---- Stools. Measured clearance: the nearest archway pier is at
     * x=16.4, the stool colliders start at x=18.74. */
    const stoolX = bay.x1 - 1.6;
    for (const sz of [45.9, 47.4, 48.9, 50.4]) {
      root.add(cylinder({ r: 0.19, h: 0.05, pos: [stoolX, GY + 0.025, sz], mat: M_CHROME }));
      root.add(cylinder({ r: 0.045, h: 0.74, pos: [stoolX, GY + 0.4, sz], mat: M_CHROME }));
      root.add(cylinder({
        r: 0.17, h: 0.035, pos: [stoolX, GY + 0.24, sz], mat: M_CHROME,
      }));
      root.add(cylinder({ r: 0.26, h: 0.11, pos: [stoolX, GY + 0.81, sz], mat: M_LEATHER_RED }));
      root.add(cylinder({ r: 0.24, h: 0.03, pos: [stoolX, GY + 0.87, sz], mat: M_GOLD, cast: false }));
      // Low buttoned back, so they read as bar stools and not mushrooms.
      root.add(box({
        size: [0.06, 0.42, 0.42], pos: [stoolX - 0.22, GY + 1.05, sz], mat: M_LEATHER_RED,
      }));
      solid(stoolX - 0.28, stoolX + 0.28, GY, GY + 0.9, sz - 0.28, sz + 0.28);
    }
    // Two high tables in the south end of the bay, out of the bar's way.
    for (const tz of [42.4, 52.8]) {
      root.add(cylinder({ r: 0.05, h: 1.02, pos: [bay.x0 + 1.5, GY + 0.51, tz], mat: M_CHROME }));
      root.add(cylinder({ r: 0.42, h: 0.05, pos: [bay.x0 + 1.5, GY + 1.04, tz], mat: M_MARBLE }));
      root.add(cylinder({ r: 0.36, h: 0.04, pos: [bay.x0 + 1.5, GY + 0.03, tz], mat: M_CHROME }));
      solid(bay.x0 + 1.06, bay.x0 + 1.94, GY, GY + 1.06, tz - 0.44, tz + 0.44);
      root.add(cylinder({
        rTop: 0.05, rBottom: 0.036, h: 0.14, pos: [bay.x0 + 1.4, GY + 1.13, tz], mat: M_GLASS_CASE,
      }));
    }
    // The bay's own light: a run of pendants over the counter and two
    // ceiling fittings over the standing end.
    const bayLights = [];
    for (const pz of [46.4, 48.6, 50.8]) {
      root.add(cylinder({ r: 0.018, h: 1.3, pos: [barX - 0.06, GY + 3.2, pz], mat: M_GOLD }));
      root.add(cylinder({
        rTop: 0.06, rBottom: 0.2, h: 0.24, pos: [barX - 0.06, GY + 2.44, pz], mat: M_GOLD,
      }));
      root.add(sphere({ r: 0.075, pos: [barX - 0.06, GY + 2.36, pz], mat: M_BULB_WARM, cast: false }));
      const bl = new THREE.PointLight(0xffdba8, 5.4, 9, 2);
      bl.position.set(barX - 0.06, GY + 2.3, pz);
      root.add(bl);
      bayLights.push(bl);
    }
    bayLights.push(ceilingLight(bay.x0 + 1.6, 42.6, GY + 3.7, 0xffdca0, 4.4, 12));
    bayLights.push(ceilingLight(bay.x0 + 1.6, 52.6, GY + 3.7, 0xffdca0, 4.4, 12));

    /* ---- The Silver Sasquatches shield over the back bar (owner playtest:
     * "take artwork from the apartment. All the Squatch logos"). Dressed
     * with the real file by `dressMansionArt`.
     *
     * ON THE PIER, at z=49.9, not on the bar's centre line. The bay's east
     * wall is three tall windows on two 1.4 m piers, and the middle of the bar
     * is the middle of the middle WINDOW -- so the shield used to hang 20 cm
     * in front of three and a half metres of glazing, which is the owner's own
     * complaint with a logo on it. It reads as over the back bar either way;
     * this way it is on masonry. Sized to the pier rather than to taste. */
    const bayShield = flatArt('mansion.bay.shield', {
      x: backX - 0.1,
      y: GY + 2.86,
      z: 49.9,
      rotY: -Math.PI / 2,
      w: 1.05,
      h: 0.77,
      material: mat({
        map: squatchArt('mansion-bay-shield', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'THE HOUSE BAR', ink: '#e8c268', bg: '#171018',
        }),
        roughness: 0.8,
        unique: true,
      }),
    });
    root.add(box({
      size: [0.05, 0.92, 1.2], pos: [backX - 0.06, GY + 2.86, 49.9], mat: M_GOLD, cast: false,
    }));

    /* ---- The set on the bar, and the television at the room's front end.
     * Both are cabinets here; core/radio.js and core/tv.js drive them from
     * the composition root. */
    /* THE SET, MOVED CLEAR (owner playtest 2026-08-04, verbatim: "Radio works
     * just intersecting and object slightly").
     *
     * Three objects, in fact, all measured off the built scene. The case stood
     * at x 19.887..20.293, y 2.350..2.710, z 49.767..50.433 and ran into:
     *   - the ice bucket (x 19.83..20.15, z 50.34..50.66) -- 9 cm of overlap,
     *     which is the "slightly" he could see from the stools;
     *   - the lowest back-bar shelf (x 20.13..20.43, y 2.48..2.53) -- 16 cm;
     *   - the ninth Jack And Daniels on that shelf (z 50.415..50.505) -- 2 cm.
     * It was also floating 5 mm over the counter, because y was GY+1.15 and
     * the counter's own top face is at GY+1.145.
     *
     * It now stands ON the counter at x 19.93 (2.8 cm clear of the shelf in
     * front of the bottles, 12.8 cm back from the counter's front edge) and at
     * z 49.05, which is the gap between the upturned glasses at 48.51 and
     * 49.53. Squarer to the bar as well -- the old 0.25 rad splay is what made
     * its corner reach the shelf in the first place. */
    const loungeRadio = makeRadioSet(barX - 0.22, GY + 1.145, 49.05, -Math.PI / 2 + 0.14);
    const loungeTvSet = makeTvSet(11.2, GY, 37.4, 0.55, { w: 1.6, h: 1.05 });
    // Two armchairs and a low table facing it, in the room's new front half.
    for (const [cx2, cz2, cyaw] of [[10.2, 40.4, 2.5], [12.8, 40.6, -2.5]]) {
      root.add(box({
        size: [0.95, 0.44, 0.95], pos: [cx2, GY + 0.28, cz2], mat: M_FABRIC_COUCH, rotY: cyaw,
      }));
      root.add(box({
        size: [0.95, 0.62, 0.2], pos: [cx2 - Math.sin(cyaw) * 0.38, GY + 0.72, cz2 - Math.cos(cyaw) * 0.38], mat: M_FABRIC_COUCH, rotY: cyaw,
      }));
      solid(cx2 - 0.55, cx2 + 0.55, GY, GY + 0.9, cz2 - 0.55, cz2 + 0.55);
    }
    root.add(cylinder({ r: 0.46, h: 0.06, pos: [11.5, GY + 0.44, 39.7], mat: M_MARBLE }));
    root.add(cylinder({ r: 0.14, h: 0.42, pos: [11.5, GY + 0.21, 39.7], mat: M_BRONZE }));
    solid(11.04, 11.96, GY, GY + 0.47, 39.24, 40.16);
    rug(11.6, 39.6, 4.2, 3.6, GY, M_RUG_LIVING);

    curtains('z', r.z0 + 0.2, 12.5, GY + 0.1, 6.0, 3.6);
    ceilingLight(12.4, 40.0, UY - 0.4, 0xffdca0, 5.0, 15);
    ceilingLight(12.5, 45.0, UY - 0.4, 0xffdca0, 5.4, 16);
    ceilingLight(11.5, 56.0, UY - 0.4, 0xffdca0, 4.2, 13);
    return {
      cases,
      banner,
      bayShield,
      jackDaniels,
      radio: loungeRadio,
      tv: loungeTvSet,
      bay: { ...bay },
      barTop: { x: barX - 0.06, z: (barZ0 + barZ1) / 2 },
    };
  }
  const loungeProps = buildLounge();

  /* ================================================================== */
  /* GROUND FLOOR -- THE BALLROOM (rear centre)                          */
  /* ================================================================== */
  function buildBallroom() {
    const r = BALLROOM;
    trimRoom(r, GY, UY - 0.3);
    topping(r.x0, r.x1, GY + 0.01, r.z0, r.z1, M_PARQUET, 'ballroom-floor');
    // Inlaid star at the centre of the dance floor.
    const star = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), M_MARBLE_DK);
    star.rotation.x = -Math.PI / 2;
    star.position.set(0, GY + 0.022, 66);
    root.add(star);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      root.add(box({
        size: [2.8, 0.006, 0.16],
        pos: [Math.cos(a) * 1.7, GY + 0.03, 66 + Math.sin(a) * 1.7],
        mat: M_GOLD,
        rotY: -a,
        cast: false,
      }));
    }

    // Two chandeliers, smaller siblings of the foyer's.
    for (const cz of [62, 70]) {
      root.add(cylinder({ r: 0.04, h: 0.9, pos: [0, UY - 0.75, cz], mat: M_BRONZE }));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        root.add(box({
          size: [1.0, 0.03, 0.03], pos: [Math.cos(a) * 0.5, UY - 1.2, cz + Math.sin(a) * 0.5], mat: M_GOLD, rotY: a,
        }));
        root.add(sphere({
          r: 0.09, pos: [Math.cos(a) * 1.0, UY - 1.26, cz + Math.sin(a) * 1.0], mat: M_BULB_WARM, cast: false,
        }));
        root.add(box({
          size: [0.02, 0.26, 0.02], pos: [Math.cos(a) * 0.85, UY - 1.42, cz + Math.sin(a) * 0.85], mat: M_CRYSTAL,
        }));
      }
      const l = new THREE.PointLight(0xffdca0, 7, 20, 2);
      l.position.set(0, UY - 1.4, cz);
      root.add(l);
    }

    /* ================================================================ */
    /* THE STAGE (owner playtest 2026-08-04: "Stage needs some work. Add */
    /* detail.")                                                          */
    /*                                                                     */
    /* It was one 9x3.4 box, two amp cubes, a mic stand and two drum         */
    /* shells lying on their sides -- a riser rather than a stage. It is    */
    /* now built like one: a deeper deck with a moulded nosing and skirt so */
    /* it does not float, steps up at both ends, a swagged backdrop with a  */
    /* pelmet, a lighting bar on two legs with real par cans on it, a drum  */
    /* riser with a kit standing UP on it, a bass rig, two monitor wedges,  */
    /* a keyboard on an X-stand and three mic stands with cable snaking     */
    /* back to the stage box.                                               */
    /* ================================================================ */
    const stageZ0 = 71.0;
    const stageZ1 = 74.8;
    const stageH = 0.62;
    const stageTop = GY + stageH;
    root.add(box({
      size: [11.4, stageH, stageZ1 - stageZ0],
      pos: [0, GY + stageH / 2, (stageZ0 + stageZ1) / 2],
      mat: M_WOOD_DK,
      name: 'ballroom-stage',
    }));
    // Nosing, skirt and a gilded band along the front edge.
    root.add(box({
      size: [11.7, 0.09, 0.26], pos: [0, stageTop - 0.02, stageZ0 - 0.08], mat: M_GOLD, cast: false,
    }));
    root.add(box({
      size: [11.4, 0.14, 0.06], pos: [0, GY + 0.16, stageZ0 - 0.03], mat: M_GOLD, cast: false,
    }));
    solid(-5.7, 5.7, GY, stageTop, stageZ0, stageZ1);
    // Steps up at both ends, off the side aisles.
    for (const sx of [-4.9, 4.9]) {
      for (let i = 0; i < 2; i++) {
        root.add(box({
          size: [1.6, stageH / 2, 0.44],
          pos: [sx, GY + (stageH / 4) * (2 * i + 1) - (stageH / 2) * i, stageZ0 - 0.66 + i * 0.44],
          mat: M_WOOD_DK,
          name: 'stage-step',
        }));
      }
      root.add(box({
        size: [1.7, 0.06, 0.9], pos: [sx, GY + 0.34, stageZ0 - 0.44], mat: M_GOLD, cast: false,
      }));
    }
    // Swagged backdrop and pelmet across the back wall of the stage, with
    // the house shield hung on it -- the band plays under the crest.
    curtains('z', stageZ1 - 0.16, 0, stageTop, 11.0, 3.6, M_CURTAIN_RED);
    const stageBackdrop = flatArt('mansion.ballroom.backdrop', {
      x: 0,
      y: stageTop + 2.4,
      z: stageZ1 - 0.4,
      rotY: Math.PI,
      w: 2.4,
      h: 1.75,
      material: mat({
        map: squatchArt('mansion-stage-backdrop', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'LIVE, AND ONLY HERE', ink: '#e8c268', bg: '#140f18',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });
    root.add(box({
      size: [2.6, 1.95, 0.05], pos: [0, stageTop + 2.4, stageZ1 - 0.36], mat: M_GOLD, cast: false,
    }));
    for (const sx of [-4.2, 4.2]) {
      root.add(box({
        size: [1.1, 3.6, 0.16], pos: [sx, stageTop + 1.8, stageZ1 - 0.36], mat: M_CURTAIN_RED,
      }));
    }
    // Lighting bar on two legs, with par cans and their glow.
    for (const sx of [-5.0, 5.0]) {
      root.add(cylinder({ r: 0.05, h: 3.6, pos: [sx, stageTop + 1.8, stageZ0 + 0.5], mat: M_RACK }));
      root.add(box({
        size: [0.6, 0.05, 0.6], pos: [sx, stageTop + 0.03, stageZ0 + 0.5], mat: M_RACK, cast: false,
      }));
    }
    root.add(cylinder({
      r: 0.045, h: 10.0, pos: [0, stageTop + 3.5, stageZ0 + 0.5], mat: M_RACK, rotZ: Math.PI / 2,
    }));
    const parColours = [0xff5a7a, 0x6ab0ff, 0xffd166, 0x8affc0, 0xff8a3c];
    for (let i = 0; i < 7; i++) {
      const px = -4.2 + i * 1.4;
      root.add(cylinder({
        rTop: 0.13, rBottom: 0.11, h: 0.34, pos: [px, stageTop + 3.24, stageZ0 + 0.5], mat: M_STOVE_BLACK, rotX: 0.5,
      }));
      root.add(cylinder({
        r: 0.1,
        h: 0.03,
        pos: [px, stageTop + 3.08, stageZ0 + 0.58],
        mat: mat({
          color: 0x101014, emissive: parColours[i % parColours.length], emissiveIntensity: 1.5, roughness: 0.5,
        }),
        rotX: 0.5,
      }));
    }
    // Drum riser, with the kit standing on it.
    root.add(box({
      size: [2.6, 0.3, 1.9], pos: [0, stageTop + 0.15, 73.4], mat: M_STOVE_BLACK, name: 'drum-riser',
    }));
    const riserTop = stageTop + 0.3;
    root.add(cylinder({ r: 0.42, h: 0.5, pos: [0, riserTop + 0.42, 73.1], mat: M_CARD, rotX: Math.PI / 2 }));
    root.add(cylinder({
      r: 0.44, h: 0.03, pos: [0, riserTop + 0.42, 72.84], mat: M_MARBLE, rotX: Math.PI / 2,
    }));
    for (const [tx, tz, tr] of [[-0.42, 73.5, 0.19], [0.42, 73.5, 0.21]]) {
      root.add(cylinder({ r: tr, h: 0.3, pos: [tx, riserTop + 0.88, tz], mat: M_CARD }));
    }
    root.add(cylinder({ r: 0.3, h: 0.36, pos: [0.95, riserTop + 0.5, 73.8], mat: M_CARD }));
    for (const [cx2, cz2, cr] of [[-0.95, 73.2, 0.28], [0.95, 73.2, 0.24], [1.15, 73.9, 0.3]]) {
      root.add(cylinder({ r: 0.02, h: 1.1, pos: [cx2, riserTop + 0.55, cz2], mat: M_CHROME }));
      root.add(cylinder({
        r: cr, h: 0.012, pos: [cx2, riserTop + 1.12, cz2], mat: M_GOLD, rotX: 0.12,
      }));
    }
    // Bass rig and a guitar amp, standing up rather than lying about.
    const stageStack = box({
      size: [1.0, 1.15, 0.55], pos: [-2.9, stageTop + 0.575, 73.9], mat: M_STOVE_BLACK, name: 'ballroom-amp',
    });
    root.add(stageStack);
    root.add(box({
      size: [1.05, 0.36, 0.6], pos: [-2.9, stageTop + 1.33, 73.9], mat: M_RACK,
    }));
    root.add(box({ size: [0.9, 0.6, 0.5], pos: [2.9, stageTop + 0.3, 73.9], mat: M_STOVE_BLACK }));
    root.add(box({ size: [0.94, 0.42, 0.54], pos: [2.9, stageTop + 0.81, 73.9], mat: M_RACK }));
    // Monitor wedges at the lip.
    for (const wx of [-2.2, 2.2]) {
      root.add(box({
        size: [0.7, 0.34, 0.42], pos: [wx, stageTop + 0.17, stageZ0 + 0.45], mat: M_STOVE_BLACK, rotX: -0.35,
      }));
    }
    // Mic stands, a keyboard on its X-stand, and the cable run.
    for (const [mx, mz] of [[0, 71.9], [-1.9, 72.3], [1.9, 72.3]]) {
      root.add(cylinder({ r: 0.16, h: 0.04, pos: [mx, stageTop + 0.02, mz], mat: M_STOVE_BLACK }));
      root.add(cylinder({ r: 0.022, h: 1.42, pos: [mx, stageTop + 0.73, mz], mat: M_CHROME }));
      root.add(cylinder({
        r: 0.018, h: 0.28, pos: [mx, stageTop + 1.46, mz + 0.12], mat: M_CHROME, rotX: Math.PI / 2.6,
      }));
      root.add(cylinder({
        r: 0.045, h: 0.16, pos: [mx, stageTop + 1.5, mz + 0.24], mat: M_STOVE_BLACK, rotX: Math.PI / 2.6,
      }));
    }
    root.add(box({ size: [1.4, 0.09, 0.34], pos: [-4.0, stageTop + 0.86, 72.9], mat: M_STOVE_BLACK }));
    root.add(box({
      size: [1.3, 0.03, 0.24], pos: [-4.0, stageTop + 0.92, 72.82], mat: M_TRIM, cast: false,
    }));
    for (const kx of [-0.4, 0.4]) {
      root.add(cylinder({
        r: 0.025, h: 0.98, pos: [-4.0 + kx, stageTop + 0.44, 72.9], mat: M_CHROME, rotZ: kx > 0 ? 0.26 : -0.26,
      }));
    }
    root.add(box({ size: [0.42, 0.12, 0.3], pos: [3.9, stageTop + 0.06, 72.6], mat: M_RACK }));
    for (let i = 0; i < 5; i++) {
      root.add(cylinder({
        r: 0.018,
        h: 1.1 + i * 0.35,
        pos: [3.7 - i * 0.42, stageTop + 0.02, 72.9 + Math.sin(i) * 0.2],
        mat: M_SILHOUETTE,
        rotZ: Math.PI / 2,
        rotY: 0.2 * i,
        cast: false,
      }));
    }
    /* Stage lighting, raised after the first render came back with a lit
     * truss over an unlit stage: par cans are emissive discs, not lights, so
     * the deck needs its own wash or the kit and the amps read as one dark
     * mass under a row of coloured dots. */
    const stageLight = new THREE.PointLight(0xffc0d8, 8, 14, 2);
    stageLight.position.set(0, stageTop + 2.8, 72.0);
    root.add(stageLight);
    const stageWash = new THREE.PointLight(0xffd9a0, 7, 13, 2);
    stageWash.position.set(0, stageTop + 2.2, 73.7);
    root.add(stageWash);
    for (const sx of [-3.4, 3.4]) {
      const sl = new THREE.PointLight(0xffe0c0, 4.2, 9, 2);
      sl.position.set(sx, stageTop + 2.0, 73.4);
      root.add(sl);
    }

    /* THE CHAIRS (owner playtest 2026-08-04, verbatim):
     *
     *   "Stage room, chairs are facing the wall and in the opening where you
     *    go into the kitchen"
     *
     * Both true, and the second is the serious one. `makeSeat` puts the back
     * on its local -z, so a chair at yaw -PI/2 faces -x: the whole west row
     * was turned to face the wall it was standing against, and the east row
     * likewise. And the two doorways out of this room -- into the dining room
     * at x=-9 and into the kitchen at x=+9 -- both occupy z:64..67.5, which
     * is exactly where two chairs of the old five-chair row stood.
     *
     * The rows now face the stage (which is what chairs round a ballroom are
     * for), and DOOR_KEEP_OUT below is the doorway band: a chair is simply
     * not emitted inside it, so the openings stay clear by construction
     * rather than by somebody remembering. */
    const DOOR_KEEP_OUT = { z0: 63.4, z1: 68.1 };
    for (let i = 0; i < 6; i++) {
      const cz = 60.6 + i * 2.2;
      if (cz > DOOR_KEEP_OUT.z0 && cz < DOOR_KEEP_OUT.z1) continue;
      /* `makeSeat` puts the back on local -z, so a chair faces local +z and
       * rotation.y = t aims it at (sin t, cos t). t = 0 is the stage; the
       * small +/-0.42 turns each row a touch off its own wall and toward the
       * middle of the room, the way seating round a dance floor is set. */
      makeSeat(r.x0 + 0.9, GY, cz, 0.42, M_FABRIC_GOLD, 0.55);
      makeSeat(r.x1 - 0.9, GY, cz, -0.42, M_FABRIC_GOLD, 0.55);
    }
    // A short front row either side of the dance floor, square to the stage.
    for (const sx of [-6.6, -5.2, 5.2, 6.6]) {
      makeSeat(sx, GY, 69.4, 0, M_FABRIC_GOLD, 0.55);
    }
    // Two round cocktail tables with cloths.
    for (const [tx, tz] of [[-6.2, 61.5], [6.2, 61.5]]) {
      root.add(cylinder({ r: 0.6, h: 0.05, pos: [tx, GY + 1.05, tz], mat: M_MARBLE }));
      root.add(cylinder({ rTop: 0.62, rBottom: 0.52, h: 1.05, pos: [tx, GY + 0.52, tz], mat: M_CURTAIN_RED }));
      solid(tx - 0.6, tx + 0.6, GY, GY + 1.1, tz - 0.6, tz + 0.6);
      root.add(cylinder({ r: 0.045, h: 0.3, pos: [tx - 0.2, GY + 1.22, tz], mat: M_GLASS_CASE }));
      root.add(cylinder({ r: 0.045, h: 0.3, pos: [tx + 0.15, GY + 1.22, tz + 0.14], mat: M_GLASS_CASE }));
    }
    /* Mirrored panels along the walls, the way a ballroom is always done.
     * They used to sit at z = 61 / 65 / 69, and the middle one of those three
     * was hung squarely across the doorway into the dining room on one side
     * and the kitchen on the other (both openings run z:64..67.5). Now on
     * z:61 and z:70 only, either side of both doorways -- and registered with
     * the art sweep, because a 1.7 m mirror across a door is the same fault
     * as a painting across one. */
    /* Both pieces sit ON the wall now. The frame was drawn 0.015 m off the
     * plaster and the glass 0.05 m off it, so a pier glass this size hung in
     * mid-air with a shadow gap all round it; the frame is now flush to the
     * face (x 8.80..8.85 against a wall face at 8.85) with the glass set into
     * it, 0.04 m proud, which is the way round a mirror in a frame goes. */
    for (const side of [-1, 1]) {
      for (const mz of [61, 70]) {
        const mx = side * (r.x1 - 0.07);
        root.add(box({
          size: [0.06, 2.6, 1.5],
          pos: [mx, GY + 2.0, mz],
          mat: mat({
            color: 0xdce6ee, roughness: 0.08, metalness: 0.85,
          }),
          name: 'ballroom-mirror',
        }));
        root.add(box({
          size: [0.05, 2.8, 1.7], pos: [side * (r.x1 - 0.025), GY + 2.0, mz], mat: M_GOLD, cast: false, name: 'ballroom-mirror-frame',
        }));
        recordArt(`ballroom-mirror-${side}-${mz}`, mx, GY + 2.0, mz, Math.PI / 2, 1.7, 2.8);
      }
    }
    // Gilded pilasters between the mirrors, running the room's full height.
    // Flush to the wall face (x 8.75..8.85), not the 0.01 m short of it they
    // used to stand at.
    for (const side of [-1, 1]) {
      for (const pz of [59.6, 63.0, 68.4, 71.8]) {
        root.add(box({
          size: [0.1, UY - GY - 0.4, 0.5], pos: [side * (r.x1 - 0.05), GY + (UY - GY - 0.4) / 2, pz], mat: M_GOLD, cast: false, name: 'ballroom-pilaster',
        }));
      }
    }
    return { stageLight, stageStack, backdrop: stageBackdrop };
  }
  const ballroomProps = buildBallroom();

  /* ================================================================== */
  /* GROUND FLOOR -- DINING ROOM (west rear)                             */
  /* ================================================================== */
  function buildDining() {
    const r = DINING;
    trimRoom(r, GY, UY - 0.3);
    topping(r.x0, r.x1, GY + 0.01, r.z0, r.z1, M_PARQUET, 'dining-floor');
    rug(-12.5, 66, 6.4, 8.4, GY, M_RUG_LIVING);

    const tx = -12.5;
    root.add(box({
      size: [1.9, 0.1, 6.6], pos: [tx, GY + 0.76, 66], mat: M_WOOD_DK, name: 'dining-table',
    }));
    for (const [ox, oz] of [[-0.7, -3.0], [0.7, -3.0], [-0.7, 3.0], [0.7, 3.0]]) {
      root.add(box({ size: [0.14, 0.76, 0.14], pos: [tx + ox, GY + 0.38, 66 + oz], mat: M_WOOD_DK }));
    }
    solid(tx - 0.98, tx + 0.98, GY, GY + 0.8, 62.6, 69.4);
    for (let i = 0; i < 5; i++) {
      const cz = 63.4 + i * 1.3;
      makeSeat(tx - 1.5, GY, cz, Math.PI / 2, M_FABRIC_CHAIR, 0.72);
      makeSeat(tx + 1.5, GY, cz, -Math.PI / 2, M_FABRIC_CHAIR, 0.72);
      for (const sx of [-0.72, 0.72]) {
        root.add(cylinder({ r: 0.13, h: 0.02, pos: [tx + sx, GY + 0.82, cz], mat: M_CARD, cast: false }));
        root.add(box({ size: [0.03, 0.01, 0.16], pos: [tx + sx + 0.19, GY + 0.82, cz], mat: M_SILVER, cast: false }));
      }
    }
    makeSeat(tx, GY, 62.2, 0, M_LEATHER_RED, 0.85);
    makeSeat(tx, GY, 69.8, Math.PI, M_LEATHER_RED, 0.85);

    /* THE CANDLES (owner playtest 2026-08-04, verbatim):
     *
     *   "The candles on the table need a cross bar the middle candle is
     *    supported but the two on the side are floating"
     *
     * Precisely right: the candelabrum was a base, one vertical stem, and
     * three candles -- the middle one standing on top of the stem and the
     * outer two hanging in mid-air 22 cm either side of it, attached to
     * nothing at all. A candelabrum is a stem with ARMS, so it now has them:
     * a scrolled cross-bar out to each side, a drip-pan and a socket on the
     * end of each arm, and the middle candle rising out of a socket on the
     * stem's own capital. Every flame is now standing on something. */
    const armY = GY + 1.31;
    for (const cz of [64.2, 66, 67.8]) {
      root.add(cylinder({ r: 0.15, h: 0.05, pos: [tx, GY + 0.84, cz], mat: M_GOLD }));
      root.add(cylinder({
        rTop: 0.07, rBottom: 0.11, h: 0.07, pos: [tx, GY + 0.9, cz], mat: M_GOLD, cast: false,
      }));
      root.add(cylinder({ r: 0.03, h: 0.44, pos: [tx, GY + 1.14, cz], mat: M_GOLD }));
      // Knop halfway up the stem, and the capital the arms spring from.
      root.add(sphere({ r: 0.052, pos: [tx, GY + 1.1, cz], mat: M_GOLD, cast: false }));
      root.add(cylinder({
        rTop: 0.055, rBottom: 0.04, h: 0.06, pos: [tx, armY + 0.03, cz], mat: M_GOLD, cast: false,
      }));
      // The cross-bar: one arm each side, dropped then out then up, so the
      // outer candles sit on the end of a real piece of metal.
      for (const side of [-1, 1]) {
        root.add(box({
          size: [0.2, 0.028, 0.028], pos: [tx + side * 0.11, armY - 0.03, cz], mat: M_GOLD, rotZ: side * 0.26,
        }));
        root.add(box({
          size: [0.06, 0.028, 0.028], pos: [tx + side * 0.215, armY - 0.075, cz], mat: M_GOLD,
        }));
        root.add(cylinder({
          r: 0.024, h: 0.1, pos: [tx + side * 0.24, armY - 0.04, cz], mat: M_GOLD,
        }));
        // Drip pan and socket on the end of the arm.
        root.add(cylinder({
          rTop: 0.062, rBottom: 0.03, h: 0.03, pos: [tx + side * 0.24, armY + 0.02, cz], mat: M_GOLD, cast: false,
        }));
        root.add(cylinder({
          r: 0.03, h: 0.05, pos: [tx + side * 0.24, armY + 0.055, cz], mat: M_GOLD, cast: false,
        }));
      }
      for (const ox of [-0.24, 0, 0.24]) {
        root.add(cylinder({ r: 0.022, h: 0.28, pos: [tx + ox, armY + 0.22, cz], mat: M_CARD }));
        root.add(sphere({ r: 0.03, pos: [tx + ox, armY + 0.39, cz], mat: M_BULB_WARM, cast: false }));
      }
      const cl = new THREE.PointLight(0xffc888, 1.5, 5, 2);
      cl.position.set(tx, armY + 0.42, cz);
      root.add(cl);
    }

    caseFurniture(r.x0 + 0.45, 66, GY, 3.2, 0.6, 1.0, Math.PI / 2, 4);
    root.add(box({
      size: [0.08, 1.6, 2.4], pos: [r.x0 + 0.14, GY + 2.1, 66], mat: mat({ color: 0xdce6ee, roughness: 0.08, metalness: 0.85 }),
    }));
    root.add(box({ size: [0.05, 1.8, 2.6], pos: [r.x0 + 0.1, GY + 2.1, 66], mat: M_GOLD, cast: false }));
    for (const sz of [65.3, 66.7]) {
      root.add(cylinder({ r: 0.09, h: 0.34, pos: [r.x0 + 0.5, GY + 1.17, sz], mat: M_SILVER }));
    }

    /* Hung on the inner wall, not the south one: the south wall's only clear
     * width is either side of the doorway into the living room (x:-14..-11),
     * and this canvas used to straddle its head. On the inner wall it faces
     * the west windows down the length of the table, which is where a dinner
     * scene wants to be anyway. */
    wallArt('dining-feast', r.x1 - 0.12, GY + 2.6, 70.6, -Math.PI / 2, 1.8, 1.35,
      makePortraitTexture('feast', 'THE ANNUAL DINNER', '#1c1a14'));
    sconce(r.x1 - 0.06, GY + 3.5, 70.6, -Math.PI / 2, 1.9);
    curtains('x', r.x0 + 0.22, 65.5, GY + 0.1, 5.6, 3.6, M_CURTAIN_RED);
    ceilingLight(-12.5, 62, UY - 0.4, 0xffdca0, 4.6, 14);
    ceilingLight(-12.5, 70, UY - 0.4, 0xffdca0, 4.6, 14);
    return { table: { x: tx, z: 66 } };
  }
  const diningProps = buildDining();

  /* ================================================================== */
  /* GROUND FLOOR -- KITCHEN (east rear)                                 */
  /* ================================================================== */
  function buildKitchen() {
    const r = KITCHEN;
    const tileMat = mat({
      map: tiled(tileTex(6, '#7f7a6d', '#e6e2d6'), 12, 16), roughness: 0.5, unique: true,
    });
    topping(r.x0, r.x1, GY + 0.01, r.z0, r.z1, tileMat, 'kitchen-floor');

    // Run of counters along the north and east walls.
    function counterRun(x0, x1, z0, z1) {
      root.add(box({
        size: [x1 - x0, 0.88, z1 - z0], pos: [(x0 + x1) / 2, GY + 0.44, (z0 + z1) / 2], mat: M.cabinet,
      }));
      root.add(box({
        size: [x1 - x0 + 0.05, 0.06, z1 - z0 + 0.05], pos: [(x0 + x1) / 2, GY + 0.91, (z0 + z1) / 2], mat: M.counter,
      }));
      solid(x0, x1, GY, GY + 0.94, z0, z1);
    }
    counterRun(r.x1 - 0.7, r.x1, 59, 64.6);
    counterRun(r.x1 - 0.7, r.x1, 67.6, 71);
    /* The north run stops short of x=12.4: the pool door (x:9.6-12.0) goes
     * through this wall, and a counter across it is a doorway you can see
     * through and cannot use. */
    counterRun(12.4, 15.2, r.z1 - 0.7, r.z1);
    // Upper cabinets.
    for (const [cx0, cx1, cz0, cz1] of [
      [r.x1 - 0.38, r.x1, 59, 63.4], [12.4, 15.2, r.z1 - 0.38, r.z1],
    ]) {
      root.add(box({
        size: [cx1 - cx0, 0.9, cz1 - cz0], pos: [(cx0 + cx1) / 2, GY + 2.1, (cz0 + cz1) / 2], mat: M.cabinet,
      }));
      solid(cx0, cx1, GY + 1.6, GY + 2.6, cz0, cz1);
    }

    // Island.
    const island = box({
      size: [3.2, 0.9, 1.6], pos: [12.0, GY + 0.45, 65.5], mat: M_STEEL, name: 'kitchen-island',
    });
    root.add(island);
    root.add(box({ size: [3.4, 0.07, 1.8], pos: [12.0, GY + 0.93, 65.5], mat: M_MARBLE_DK }));
    solid(10.4, 13.6, GY, GY + 0.96, 64.6, 66.4);

    // Range + extractor, set into the north run east of the pool door.
    const stoveX = 13.8;
    const stove = box({
      size: [1.5, 0.95, 0.75], pos: [stoveX, GY + 0.475, r.z1 - 0.4], mat: M_STOVE_BLACK, name: 'stove',
    });
    root.add(stove);
    for (const [ox, oz] of [[-0.34, -0.2], [0.34, -0.2], [-0.34, 0.16], [0.34, 0.16]]) {
      root.add(cylinder({
        r: 0.14, h: 0.02, pos: [stoveX + ox, GY + 0.96, r.z1 - 0.4 + oz], mat: M_STOVE_BLACK,
      }));
    }
    solid(stoveX - 0.75, stoveX + 0.75, GY, GY + 0.98, r.z1 - 0.8, r.z1);
    root.add(box({
      size: [1.7, 0.7, 0.7], pos: [stoveX, GY + 2.2, r.z1 - 0.5], mat: M_STEEL, name: 'extractor',
    }));

    /* ================================================================ */
    /* THE SINK, WHICH WORKS (owner playtest 2026-08-04: "kitchen is nice.  */
    /* We need more detail. Everything should be fancy and beautiful." +    */
    /* "Working sink.")                                                     */
    /*                                                                       */
    /* It was a steel box with a 34 cm rod stuck in the counter beside it.   */
    /* Now: a double bowl set into the counter, a swan-neck mixer with a     */
    /* lever you can actually see move, a pull-out spray on its own hose, a  */
    /* soap dispenser and a drainer -- and it runs. `runSink(on)` below      */
    /* shows the stream, the splash ring and the ripple, and the composition */
    /* root registers the tap as a hold-to-use interaction wired to the      */
    /* existing `tap.run` cue (no new audio cue: this scene adds none).      */
    /* ================================================================ */
    const sinkX = r.x1 - 0.4;
    const sinkZ = 61.5;
    // Two bowls, sunk into the counter with a drainer beside them.
    for (const bz of [sinkZ - 0.3, sinkZ + 0.3]) {
      root.add(box({
        size: [0.46, 0.26, 0.5], pos: [sinkX, GY + 0.79, bz], mat: M_STEEL, name: 'sink-bowl',
      }));
      root.add(box({
        size: [0.4, 0.02, 0.44], pos: [sinkX, GY + 0.68, bz], mat: M_RACK, cast: false,
      }));
    }
    root.add(box({
      size: [0.56, 0.03, 1.16], pos: [sinkX, GY + 0.925, sinkZ], mat: M_CHROME, cast: false,
    }));
    for (let i = 0; i < 7; i++) {
      root.add(box({
        size: [0.42, 0.012, 0.02], pos: [sinkX, GY + 0.935, sinkZ + 0.76 + i * 0.055], mat: M_CHROME, cast: false,
      }));
    }
    // Swan-neck mixer with a lever, plus a pull-out spray and a soap pump.
    const tapBaseY = GY + 0.94;
    root.add(cylinder({ r: 0.045, h: 0.03, pos: [sinkX - 0.19, tapBaseY, sinkZ], mat: M_CHROME }));
    root.add(cylinder({ r: 0.028, h: 0.36, pos: [sinkX - 0.19, tapBaseY + 0.18, sinkZ], mat: M_CHROME }));
    const spoutY = tapBaseY + 0.4;
    root.add(cylinder({
      r: 0.026, h: 0.24, pos: [sinkX - 0.13, spoutY, sinkZ], mat: M_CHROME, rotZ: Math.PI / 2 - 0.5,
    }));
    const tapSpout = cylinder({
      r: 0.022, h: 0.1, pos: [sinkX - 0.02, spoutY - 0.06, sinkZ], mat: M_CHROME,
    });
    root.add(tapSpout);
    const tapLever = box({
      size: [0.13, 0.024, 0.024], pos: [sinkX - 0.24, tapBaseY + 0.22, sinkZ], mat: M_CHROME, rotZ: 0.35,
    });
    root.add(tapLever);
    root.add(cylinder({ r: 0.028, h: 0.2, pos: [sinkX - 0.19, tapBaseY + 0.1, sinkZ - 0.34], mat: M_CHROME }));
    root.add(cylinder({
      rTop: 0.032, rBottom: 0.045, h: 0.14, pos: [sinkX - 0.19, tapBaseY + 0.07, sinkZ + 0.42], mat: M_SILVER,
    }));
    // The stream, the splash ring and the surface ripple -- hidden until the
    // tap is opened.
    const streamMat = mat({
      color: 0xcfe8f2, roughness: 0.15, transparent: true, opacity: 0.55, unique: true,
    });
    const sinkStream = cylinder({
      r: 0.014, h: 0.28, pos: [sinkX - 0.02, spoutY - 0.24, sinkZ], mat: streamMat, cast: false,
    });
    sinkStream.visible = false;
    root.add(sinkStream);
    const splashMat = mat({
      color: 0xe8f6ff, roughness: 0.3, transparent: true, opacity: 0.5, unique: true,
    });
    const sinkSplash = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.09, 20), splashMat);
    sinkSplash.rotation.x = -Math.PI / 2;
    sinkSplash.position.set(sinkX - 0.02, GY + 0.685, sinkZ);
    sinkSplash.visible = false;
    root.add(sinkSplash);
    /* An invisible aiming proxy over the bowls. The spout itself is a 2 cm
     * cylinder, which is a target you have to hunt for; every other scene in
     * this repo aims small fixtures through a proxy for the same reason (see
     * core/interaction.js's note on `soft` targets). */
    const sinkTarget = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.7, 1.3),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    sinkTarget.position.set(sinkX - 0.15, GY + 1.1, sinkZ);
    sinkTarget.name = 'kitchen-sink-target';
    root.add(sinkTarget);

    let sinkOn = false;
    let sinkT = 0;
    /** Open or close the tap. Returns the new state. */
    function runSink(on) {
      sinkOn = !!on;
      sinkStream.visible = sinkOn;
      sinkSplash.visible = sinkOn;
      tapLever.rotation.z = sinkOn ? -0.5 : 0.35;
      return sinkOn;
    }
    /** Per-frame water motion, ticked from the interior's own update(). */
    function updateSink(dt) {
      if (!sinkOn) return;
      sinkT += dt;
      const wobble = 1 + Math.sin(sinkT * 24) * 0.12;
      sinkStream.scale.set(wobble, 1, wobble);
      const pulse = 0.7 + Math.sin(sinkT * 9) * 0.35;
      sinkSplash.scale.setScalar(pulse);
      splashMat.opacity = 0.32 + Math.sin(sinkT * 13) * 0.16;
    }

    // Fridge.
    root.add(box({ size: [0.9, 2.0, 0.78], pos: [9.9, GY + 1.0, 59.6], mat: M_STEEL, name: 'fridge' }));
    root.add(box({ size: [0.04, 1.0, 0.05], pos: [10.37, GY + 1.4, 59.3], mat: M_CHROME }));
    solid(9.45, 10.35, GY, GY + 2.0, 59.21, 59.99);

    // Pot rack over the island.
    const rackY = GY + 3.0;
    root.add(box({ size: [2.8, 0.05, 0.05], pos: [12.0, rackY, 65.5], mat: M_RACK }));
    for (const sx of [-1.2, -0.4, 0.4, 1.2]) {
      root.add(cylinder({ r: 0.01, h: 0.32, pos: [12.0 + sx, rackY - 0.16, 65.5], mat: M_RACK }));
      root.add(cylinder({
        rTop: 0.14, rBottom: 0.16, h: 0.16, pos: [12.0 + sx, rackY - 0.36, 65.5], mat: M_POT,
      }));
    }
    // Things left out on the counters.
    for (const [px, pz] of [[11.0, 65.4], [12.6, 65.7], [13.2, 65.3]]) {
      root.add(cylinder({
        rTop: 0.13, rBottom: 0.11, h: 0.2, pos: [px, GY + 1.06, pz], mat: M_POT,
      }));
    }
    root.add(box({ size: [0.4, 0.24, 0.3], pos: [12.7, GY + 1.06, r.z1 - 0.4], mat: M_CARD }));

    /* ---- More detail, and all of it fancy: a tiled splashback with a gilt
     * band, glass-fronted wall cabinets, a plate rack, herbs on the sill, a
     * knife block, a fruit bowl, a coffee machine and a wine fridge. */
    const splashMatTile = bathTileMaterial(6, 0.9);
    root.add(box({
      size: [0.04, 0.9, 5.4], pos: [r.x1 - 0.03, GY + 1.4, 61.9], mat: splashMatTile, cast: false,
    }));
    root.add(box({
      size: [0.05, 0.06, 5.4], pos: [r.x1 - 0.04, GY + 1.86, 61.9], mat: M_GOLD, cast: false,
    }));
    root.add(box({
      size: [2.8, 0.9, 0.04], pos: [13.8, GY + 1.4, r.z1 - 0.03], mat: splashMatTile, cast: false,
    }));
    root.add(box({
      size: [2.8, 0.06, 0.05], pos: [13.8, GY + 1.86, r.z1 - 0.04], mat: M_GOLD, cast: false,
    }));
    /* Glazed wall cabinets over the east run, with plates showing through.
     *
     * MOVED NORTH OF THE SERVICE DOOR. They were at z 63.25..64.55 and
     * 64.75..66.05, and the rear service door through this wall is
     * REAR_DOOR z 64.8..67.2 -- so the second one was a wall cabinet hung
     * across a doorway, with a collider in it at GY+1.6..GY+2.6 that a player
     * walking in from the service road is stopped by. (The counter runs below
     * were already cut round that door: 59..64.6 and 67.6..71. These were
     * not.) The first one also lapped the upper cabinet run at z 59..63.4 by
     * 15 cm. Both now hang over the northern counter run, clear of the door
     * and clear of the kitchen television standing at z 69.04..69.76. */
    for (const cz of [68.3, 70.6]) {
      root.add(box({
        size: [0.36, 0.86, 1.3], pos: [r.x1 - 0.2, GY + 2.12, cz], mat: M_WOOD_DK, name: 'kitchen-glazed-cabinet',
      }));
      root.add(box({
        size: [0.03, 0.72, 1.16], pos: [r.x1 - 0.39, GY + 2.12, cz], mat: M_GLASS_CASE, cast: false,
      }));
      root.add(box({
        size: [0.38, 0.08, 1.36], pos: [r.x1 - 0.2, GY + 2.59, cz], mat: M_WOOD_DK, cast: false,
      }));
      for (let i = 0; i < 4; i++) {
        root.add(cylinder({
          r: 0.13, h: 0.02, pos: [r.x1 - 0.24, GY + 1.86 + Math.floor(i / 2) * 0.44, cz - 0.3 + (i % 2) * 0.6], mat: M_CARD, rotX: Math.PI / 2, cast: false,
        }));
      }
      solid(r.x1 - 0.4, r.x1, GY + 1.6, GY + 2.6, cz - 0.65, cz + 0.65);
    }
    // Plate rack over the sink.
    root.add(box({ size: [0.34, 0.05, 1.2], pos: [r.x1 - 0.24, GY + 2.5, sinkZ], mat: M_RACK }));
    for (let i = 0; i < 9; i++) {
      root.add(cylinder({
        r: 0.008, h: 0.34, pos: [r.x1 - 0.24, GY + 2.34, sinkZ - 0.54 + i * 0.135], mat: M_RACK, rotZ: Math.PI / 2, cast: false,
      }));
    }
    /* Herb pots on the window sill, SOUTH of the sink: at 0.55 m centres from
     * z=59.9 the fourth one landed at 61.55, standing in the sink's own right
     * bowl. */
    for (let i = 0; i < 3; i++) {
      const hz = 59.5 + i * 0.6;
      root.add(cylinder({
        rTop: 0.08, rBottom: 0.06, h: 0.14, pos: [r.x1 - 0.22, GY + 1.02, hz], mat: M_BRONZE,
      }));
      root.add(sphere({
        r: 0.11, ry: 0.13, pos: [r.x1 - 0.22, GY + 1.16, hz], mat: mat({ color: 0x2f7038, roughness: 0.95 }), cast: false,
      }));
    }
    // Knife block, coffee machine, fruit bowl and a chopping board.
    root.add(box({ size: [0.22, 0.3, 0.18], pos: [12.6, GY + 1.11, 66.1], mat: M_WOOD_DK, rotX: -0.16 }));
    for (let i = 0; i < 5; i++) {
      root.add(box({
        size: [0.02, 0.16, 0.05], pos: [12.5 + i * 0.05, GY + 1.33, 66.06], mat: M_CHROME, rotX: -0.16, cast: false,
      }));
    }
    root.add(box({ size: [0.42, 0.42, 0.38], pos: [10.9, GY + 1.17, 64.9], mat: M_STOVE_BLACK }));
    root.add(box({ size: [0.34, 0.06, 0.3], pos: [10.9, GY + 1.02, 65.05], mat: M_CHROME, cast: false }));
    root.add(cylinder({ r: 0.02, h: 0.14, pos: [10.9, GY + 1.31, 65.06], mat: M_CHROME }));
    root.add(cylinder({ rTop: 0.2, rBottom: 0.12, h: 0.11, pos: [12.0, GY + 1.02, 64.9], mat: M_SILVER }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      root.add(sphere({
        r: 0.055,
        pos: [12.0 + Math.cos(a) * 0.08, GY + 1.09, 64.9 + Math.sin(a) * 0.08],
        mat: mat({ color: i % 2 ? 0xd8b23a : 0xa8341f, roughness: 0.7 }),
        cast: false,
      }));
    }
    root.add(box({
      size: [0.5, 0.03, 0.34], pos: [13.1, GY + 1.0, 65.9], mat: M_WOOD, rotY: 0.2, cast: false,
    }));
    // Wine fridge beside the tall fridge, glass-fronted and lit.
    root.add(box({ size: [0.8, 1.6, 0.68], pos: [9.85, GY + 0.8, 60.7], mat: M_STOVE_BLACK, name: 'wine-fridge' }));
    root.add(box({
      size: [0.6, 1.32, 0.03], pos: [9.85, GY + 0.82, 61.03], mat: M_GLASS_CASE, cast: false,
    }));
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < 4; i++) {
        root.add(cylinder({
          r: 0.045, h: 0.26, pos: [9.62 + i * 0.15, GY + 0.34 + s * 0.32, 60.7], mat: mat({ color: 0x1a3a20, roughness: 0.4 }), rotX: Math.PI / 2, cast: false,
        }));
      }
    }
    solid(9.45, 10.25, GY, GY + 1.6, 60.36, 61.04);
    const wineGlow = new THREE.PointLight(0x8ad0ff, 1.4, 3.2, 2);
    wineGlow.position.set(10.1, GY + 0.9, 60.9);
    root.add(wineGlow);

    // A small set on the counter by the pool door -- what the kitchen has on
    // while it works.
    // Kept on the east counter run, NOT the north one: the north run has the
    // pool door through it (x:9.6..12.0) and a television standing in a
    // doorway is the same fault as a picture hung over one.
    const kitchenTvSet = makeTvSet(15.6, GY + 0.94, 69.4, -Math.PI / 2, { w: 0.72, h: 0.5 });

    /* Under-cabinet strips over the two working runs. Measured: the nearest
     * ceiling fitting is 6.4 m from the sink, and at `decay: 2` that is about
     * a tenth of its intensity -- the whole east run, splashback and all,
     * rendered as a dark band. This is how a kitchen is actually lit. */
    const M_UNDER_CAB = mat({
      color: 0x2a2620, emissive: 0xfff0cc, emissiveIntensity: 2.0, roughness: 0.5,
    });
    root.add(box({
      size: [0.06, 0.03, 5.2], pos: [r.x1 - 0.42, GY + 1.56, 61.9], mat: M_UNDER_CAB, cast: false,
    }));
    root.add(box({
      size: [2.6, 0.03, 0.06], pos: [13.8, GY + 1.56, r.z1 - 0.42], mat: M_UNDER_CAB, cast: false,
    }));
    for (const [ux, uz] of [[r.x1 - 0.7, 60.6], [r.x1 - 0.7, 63.4], [r.x1 - 0.7, 69.0], [13.6, r.z1 - 0.8]]) {
      const ul = new THREE.PointLight(0xfff0cc, 3.2, 5.0, 2);
      ul.position.set(ux, GY + 1.5, uz);
      root.add(ul);
    }

    /* ================================================================ */
    /* THE LUXURY PASS (owner playtest 2026-08-04, verbatim: "kitchen     */
    /* needs more work and more detail and nicer stuff")                  */
    /*                                                                     */
    /* The room already had the bones -- runs, island, range, a working     */
    /* sink, a splashback, glazed cabinets. What it did not have was any    */
    /* of the things that make a kitchen this size read as expensive: a     */
    /* marble waterfall on the island, stools at it, pendants over it, a    */
    /* proper chimney hood over the range with a pot filler and a utensil   */
    /* rail, a plinth and a cornice on the joinery, a butcher's block, a    */
    /* coffee station, and a clock you can see from the door.               */
    /*                                                                       */
    /* Everything is kept off three lines: the pool door (x 9.6..12.0 in the  */
    /* north wall), the rear service door (z 64.8..67.2 in the east wall) and */
    /* the run down the island's west side that the ground-floor tour walks   */
    /* (x ~9.9..10.0, z 63..68.5).                                            */
    /* ================================================================ */
    // Island: marble waterfall ends, a brass toe rail, and a shadow plinth.
    for (const ix of [10.3, 13.7] ) {
      root.add(box({
        size: [0.14, 0.94, 1.8], pos: [ix, GY + 0.47, 65.5], mat: M_MARBLE_DK, cast: false, name: 'island-waterfall',
      }));
    }
    root.add(box({
      size: [3.1, 0.12, 1.5], pos: [12.0, GY + 0.06, 65.5], mat: M_STOVE_BLACK, cast: false, name: 'island-plinth',
    }));
    root.add(cylinder({
      r: 0.03, h: 3.0, pos: [12.0, GY + 0.2, 64.58], mat: M_GOLD, rotZ: Math.PI / 2, name: 'island-foot-rail',
    }));
    for (const sx of [11.0, 13.0]) {
      root.add(cylinder({ r: 0.05, h: 0.2, pos: [sx, GY + 0.1, 64.58], mat: M_GOLD, cast: false }));
    }
    /* Three stools on the island's SOUTH face -- not the west one, which is
     * where the ballroom door (z 64..67.5 in the x=9 wall) opens onto and
     * where the tour walks past. */
    for (const sx of [11.1, 12.0, 12.9]) {
      root.add(cylinder({ r: 0.18, h: 0.05, pos: [sx, GY + 0.025, 64.0], mat: M_GOLD }));
      root.add(cylinder({ r: 0.04, h: 0.6, pos: [sx, GY + 0.33, 64.0], mat: M_GOLD }));
      root.add(cylinder({ r: 0.16, h: 0.03, pos: [sx, GY + 0.22, 64.0], mat: M_GOLD, cast: false }));
      root.add(named(cylinder({ r: 0.21, h: 0.09, pos: [sx, GY + 0.67, 64.0], mat: M_LEATHER_TAN }), 'kitchen-stool'));
      root.add(box({
        size: [0.36, 0.34, 0.06], pos: [sx, GY + 0.88, 63.83], mat: M_LEATHER_TAN, rotX: -0.12,
      }));
      solid(sx - 0.24, sx + 0.24, GY, GY + 0.75, 63.76, 64.24);
    }
    // Two pendants over the island.
    for (const pz of [64.9, 66.1]) {
      root.add(cylinder({ r: 0.016, h: 1.1, pos: [12.0, GY + 3.35, pz], mat: M_GOLD }));
      root.add(named(cylinder({
        rTop: 0.07, rBottom: 0.24, h: 0.3, pos: [12.0, GY + 2.65, pz], mat: M_GOLD,
      }), 'kitchen-pendant'));
      root.add(sphere({ r: 0.09, pos: [12.0, GY + 2.54, pz], mat: M_BULB_WARM, cast: false }));
      const pl = new THREE.PointLight(0xffe0b0, 3.6, 8, 2);
      pl.position.set(12.0, GY + 2.45, pz);
      root.add(pl);
    }

    /* The range: a chimney hood on a mantel shelf in place of the bare steel
     * box, a marble slab behind it, a pot filler over the hob and a utensil
     * rail. The extractor mesh above stays where it is -- this is built round
     * it, not instead of it. */
    root.add(box({
      size: [2.0, 0.14, 0.14], pos: [stoveX, GY + 1.86, r.z1 - 0.08], mat: M_GOLD, cast: false, name: 'range-mantel',
    }));
    root.add(box({
      size: [2.0, 0.5, 0.8], pos: [stoveX, GY + 2.62, r.z1 - 0.5], mat: M_MARBLE, cast: false, name: 'range-hood',
    }));
    root.add(box({
      size: [1.2, 1.1, 0.7], pos: [stoveX, GY + 3.42, r.z1 - 0.45], mat: M_MARBLE, cast: false, name: 'range-chimney',
    }));
    root.add(box({
      size: [2.1, 0.09, 0.86], pos: [stoveX, GY + 2.34, r.z1 - 0.5], mat: M_GOLD, cast: false,
    }));
    root.add(cylinder({
      r: 0.026, h: 0.5, pos: [stoveX + 0.5, GY + 1.5, r.z1 - 0.06], mat: M_GOLD, rotZ: Math.PI / 2, name: 'pot-filler',
    }));
    root.add(cylinder({
      r: 0.022, h: 0.16, pos: [stoveX + 0.26, GY + 1.44, r.z1 - 0.06], mat: M_GOLD,
    }));
    root.add(cylinder({
      r: 0.018, h: 1.7, pos: [stoveX, GY + 1.72, r.z1 - 0.1], mat: M_GOLD, rotZ: Math.PI / 2, name: 'utensil-rail',
    }));
    for (let i = 0; i < 5; i++) {
      root.add(cylinder({
        r: 0.012, h: 0.22, pos: [stoveX - 0.6 + i * 0.3, GY + 1.6, r.z1 - 0.12], mat: M_STEEL, cast: false,
      }));
      root.add(box({
        size: [0.09, 0.14, 0.03], pos: [stoveX - 0.6 + i * 0.3, GY + 1.44, r.z1 - 0.12], mat: M_POT, cast: false,
      }));
    }
    // Brass plinth and cornice on the two counter runs, so the joinery reads
    // as fitted rather than as boxes standing on a floor.
    for (const [px0, px1, pz0, pz1] of [
      [r.x1 - 0.72, r.x1, 59, 64.6], [r.x1 - 0.72, r.x1, 67.6, 71], [12.4, 15.2, r.z1 - 0.72, r.z1],
    ]) {
      root.add(box({
        size: [px1 - px0 - 0.06, 0.1, pz1 - pz0 - 0.06], pos: [(px0 + px1) / 2, GY + 0.05, (pz0 + pz1) / 2], mat: M_STOVE_BLACK, cast: false, name: 'counter-plinth',
      }));
      root.add(box({
        size: [px1 - px0 - 0.04, 0.03, pz1 - pz0 - 0.04], pos: [(px0 + px1) / 2, GY + 0.11, (pz0 + pz1) / 2], mat: M_GOLD, cast: false,
      }));
    }
    // A butcher's block on legs in the west aisle -- against the ballroom-door
    // wall's own pier, north of the doorway band (z 64..67.5).
    {
      const bx = 10.0;
      const bz = 69.8;
      root.add(box({ size: [1.0, 0.24, 0.7], pos: [bx, GY + 0.86, bz], mat: M_WOOD, name: 'butchers-block' }));
      root.add(box({ size: [1.04, 0.05, 0.74], pos: [bx, GY + 0.99, bz], mat: M_WOOD_DK, cast: false }));
      for (const [lx, lz] of [[-0.4, -0.26], [0.4, -0.26], [-0.4, 0.26], [0.4, 0.26]]) {
        root.add(box({ size: [0.1, 0.74, 0.1], pos: [bx + lx, GY + 0.37, bz + lz], mat: M_WOOD_DK }));
      }
      root.add(box({ size: [0.9, 0.04, 0.3], pos: [bx, GY + 0.3, bz], mat: M_WOOD_DK, cast: false }));
      solid(bx - 0.55, bx + 0.55, GY, GY + 1.0, bz - 0.4, bz + 0.4);
      root.add(cylinder({
        rTop: 0.1, rBottom: 0.13, h: 0.16, pos: [bx - 0.28, GY + 1.09, bz], mat: M_POT, cast: false,
      }));
      root.add(box({
        size: [0.26, 0.05, 0.2], pos: [bx + 0.28, GY + 1.04, bz], mat: M_CARD, rotY: 0.3, cast: false,
      }));
    }
    // A clock on the south wall, west of the lounge doorway (x 11..14).
    {
      const clock = makeWallClock(M, {
        x: 10.0, y: GY + 2.5, z: r.z0 + 0.1, rotY: 0, r: 0.3,
      });
      root.add(clock.group);
      root.add(cylinder({
        r: 0.36, h: 0.05, pos: [10.0, GY + 2.5, r.z0 + 0.06], mat: M_GOLD, rotX: Math.PI / 2, cast: false, name: 'kitchen-clock-surround',
      }));
      recordArt('kitchen-clock', 10.0, GY + 2.5, r.z0 + 0.08, 0, 0.72, 0.72);
    }

    const kitchenLights = [];
    for (const [px, pz] of [[11, 60.5], [12.5, 65.5], [13.4, 71.5]]) {
      kitchenLights.push(ceilingLight(px, pz, UY - 0.35, 0xffe9c4, 5.6, 15));
    }
    return {
      island, stove, ceilingLights: kitchenLights, tap: tapSpout, sinkTarget, runSink, updateSink, tv: kitchenTvSet,
    };
  }
  const kitchenProps = buildKitchen();

  /* ================================================================== */
  /* UPPER FLOOR -- THE GALLERY (top of the stairs)                      */
  /* ================================================================== */
  function buildGallery() {
    const r = GALLERY;
    topping(r.x0, r.x1, UY + 0.01, r.z0, r.z1, M_PARQUET, 'gallery-floor');
    rug(0, 50.5, 26, 3.0, UY, M_CARPET_HALL);
    trimRoom(r, UY, UCY - 0.3);

    // Portraits of the founders down the gallery's north wall, between doors.
    const founders = [
      ['booski2', 'BOOSKIBRO', '#1e1a26', -9.6],
      ['rippinflow', 'RIPPINFLOW', '#1a2218', -6.4],
      ['shubes', 'THE SHUBENATOR', '#221a1a', 6.4],
      ['deathmegatron', 'DEATHMEGATRON', '#16161e', 9.6],
    ];
    for (const [key, name, tint, px] of founders) {
      wallArt(`gallery-${key}`, px, UY + 1.9, Z_GALLERY_N - 0.18, Math.PI, 0.86, 1.15,
        makePortraitTexture(key, name, tint));
      sconce(px, UY + 2.85, Z_GALLERY_N - 0.22, Math.PI, 1.9);
    }
    /* Console tables and urns against the north wall -- NOT down the middle
     * of the run, where an earlier pass had them: the gallery is the only
     * route between the two wings and the conference room, and a 1.6 m
     * console on its centre line is furniture standing in a corridor. They
     * are also kept clear of all three doorways in that wall. */
    for (const px of [-5.2, 5.2]) {
      caseFurniture(px, Z_GALLERY_N - 0.45, UY, 1.6, 0.5, 0.84, 0, 2);
      root.add(cylinder({
        rTop: 0.24, rBottom: 0.16, h: 0.46, pos: [px, UY + 1.1, Z_GALLERY_N - 0.45], mat: M_BRONZE,
      }));
    }
    for (const px of [-3.4, 3.4]) {
      const potted = makePlant(M, { x: px, z: 52.2, scale: 1.6 });
      const wrap = new THREE.Group();
      wrap.position.y = UY;
      wrap.add(potted.group);
      root.add(wrap);
    }
    /* The apartment's "pride" logo, at the west end of the gallery run --
     * one of the Squatch logos the owner asked to see used in here. Hung on
     * the gallery's SOUTH wall in the west wing, whose only opening
     * (galleryToBedWestFront) is out at x:-14.9..-13.1. */
    const galleryPride = flatArt('mansion.gallery.pride', {
      x: -11.4,
      y: UY + 2.0,
      z: Z_GALLERY_S + 0.18,
      rotY: 0,
      w: 1.5,
      h: 1.1,
      material: mat({
        map: squatchArt('mansion-gallery-pride', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'ALL OF THEM', ink: '#e8c268', bg: '#151019',
        }),
        roughness: 0.85,
        unique: true,
      }),
    });
    root.add(box({
      size: [1.68, 1.28, 0.05], pos: [-11.4, UY + 2.0, Z_GALLERY_S + 0.14], mat: M_GOLD, cast: false,
    }));
    sconce(-11.4, UY + 3.0, Z_GALLERY_S + 0.2, 0, 1.9);

    const lights = [];
    for (const px of [-12, -4, 4, 12]) {
      lights.push(ceilingLight(px, 50.5, UCY - 0.3, 0xffdca0, 5.2, 15));
    }
    return { lights, pride: galleryPride };
  }
  const galleryProps = buildGallery();

  /* ================================================================== */
  /* UPPER FLOOR -- THE CONFERENCE ROOM                                  */
  /*                                                                      */
  /* "the Conference room to be at the top of the stairs ... in the       */
  /*  middle" -- dead ahead off the balcony, and the only way through to  */
  /* Lou's office behind it.                                              */
  /* ================================================================== */
  function buildConference() {
    const r = CONFERENCE;
    trimRoom(r, UY, UCY - 0.3);
    topping(r.x0, r.x1, UY + 0.01, r.z0, r.z1, M_PARQUET, 'conference-floor');
    // An inlaid border in the dark stone, so the parquet reads as laid rather
    // than rolled out, and the turned table has something to sit inside.
    for (const [bx0, bx1, bz0, bz1] of [
      [r.x0 + 0.7, r.x1 - 0.7, r.z0 + 0.7, r.z0 + 0.95],
      [r.x0 + 0.7, r.x1 - 0.7, r.z1 - 0.95, r.z1 - 0.7],
      [r.x0 + 0.7, r.x0 + 0.95, r.z0 + 0.7, r.z1 - 0.7],
      [r.x1 - 0.95, r.x1 - 0.7, r.z0 + 0.7, r.z1 - 0.7],
    ]) topping(bx0, bx1, UY + 0.02, bz0, bz1, M_MARBLE_DK, 'conference-border');
    rug(0, 58, 11.4, 6.6, UY, M_CARPET_HALL);

    /* Panelled walls: this is the room the family is photographed in.
     *
     * Flush to the plaster now (x 8.79..8.85 against a wall face at 8.85).
     * They used to stand 0.02 m off it, which is a shadow gap round every
     * panel in the room. Each one also gets a gilt bead frame and the run gets
     * a dado rail, because "panelling" without a moulding on it is a plank. */
    for (const side of [-1, 1]) {
      const px = side * (r.x1 - 0.03);
      for (let i = 0; i < 5; i++) {
        const pz = 54.4 + i * 1.8;
        root.add(box({
          size: [0.06, 2.4, 1.5],
          pos: [px, UY + 1.5, pz],
          mat: M_WOOD_DK,
          cast: false,
          name: 'conference-panel',
        }));
        for (const [oy, oz, sy, sz] of [
          [1.15, 0, 0.05, 1.3], [-1.15, 0, 0.05, 1.3], [0, 0.65, 2.3, 0.05], [0, -0.65, 2.3, 0.05],
        ]) {
          root.add(box({
            size: [0.05, sy, sz], pos: [side * (r.x1 - 0.07), UY + 1.5 + oy, pz + oz], mat: M_GOLD, cast: false,
          }));
        }
      }
      root.add(box({
        size: [0.09, 0.12, r.z1 - r.z0], pos: [side * (r.x1 - 0.05), UY + 2.78, (r.z0 + r.z1) / 2], mat: M_GOLD, cast: false, name: 'conference-dado',
      }));
      /* THE SCONCES WERE BEHIND THE PROJECTOR SCREEN, AND CAME OUT THROUGH IT.
       *
       * Owner playtest, verbatim: "lamps going thro screen". Measured: these
       * two sat at z 55.3 and 60.7 -- both inside the screen's own 55..61 --
       * and a sconce projects 0.30 m off the wall it is on, so on the WEST
       * wall the arm and shade ran from x -8.83 out to -8.52, straight
       * through the bezel at -8.805..-8.735 and out the front of the picture
       * at -8.71. Two lamps growing out of the middle of the screen.
       *
       * They sit in the joints between the wall's panels, so they cannot go
       * just anywhere: the joints are at z 53.4, 55.3, 57.1, 58.9, 60.7 and
       * 62.6, and only the outer two clear the bezel's 54.85..61.15. Moved
       * there -- 1.30 m clear of the screen at each end, still in a panel
       * joint, still a matched pair, and on the east wall as well so the two
       * long walls stay symmetrical. */
      sconce(side * (r.x1 - 0.05), UY + 2.2, 53.4, side < 0 ? Math.PI / 2 : -Math.PI / 2, 2.0);
      sconce(side * (r.x1 - 0.05), UY + 2.2, 62.6, side < 0 ? Math.PI / 2 : -Math.PI / 2, 2.0);
    }

    /* ================================================================ */
    /* THE TABLE, TURNED (owner playtest 2026-08-04, verbatim):          */
    /*                                                                    */
    /*   "lets turn the conference room table by 90 degrees that will      */
    /*    open up that room a little bit."                                 */
    /*                                                                      */
    /* It was 2.2 m across and 6.8 m long down the room's SHORT axis, in a   */
    /* room that is 17.7 m wide and 9.7 m deep -- so it ran from 1.45 m off   */
    /* the entrance wall to 1.45 m off Lou's door and left two dead strips    */
    /* of floor five metres wide down either side. Turned, it is 6.0 x 2.2    */
    /* on the long axis with 3.75 m of clear floor between it and the double  */
    /* doors, 3.75 m again behind it, and the whole west end of the room open */
    /* in front of the projector screen.                                      */
    /*                                                                         */
    /* SEATING, AND THE TWO LANES THROUGH THE ROOM. There is no chair at       */
    /* either END of the table on purpose, and it is measured rather than      */
    /* tasteful: a carver pulled up to a 6 m table stands its collider from    */
    /* 0.57 m off the table's edge, and both of the walking lines through this */
    /* room -- the ones tools/verify-mansion.mjs holds W along, at x = -3.2    */
    /* and x = +3.2 -- run down exactly there. A chair at either head would    */
    /* leave 0.57 m of gap for a 0.6 m player: an invisible wall in the room   */
    /* you cross to reach Lou. Lou's carver goes in the MIDDLE of the north    */
    /* side instead, which still backs him onto his own office door and still  */
    /* faces him at everybody who comes through the double doors.              */
    /* ================================================================ */
    const tableX0 = -3.0;
    const tableX1 = 3.0;
    const tableZ0 = 56.9;
    const tableZ1 = 59.1;
    const topY = UY + 0.76;
    root.add(box({
      size: [tableX1 - tableX0, 0.1, tableZ1 - tableZ0], pos: [0, topY, 58], mat: M_DESKTOP, name: 'conference-table',
    }));
    // Moulded edge under the top, and a gilt inlay line down the middle of it.
    root.add(box({
      size: [tableX1 - tableX0 + 0.16, 0.05, tableZ1 - tableZ0 + 0.16], pos: [0, topY - 0.04, 58], mat: M_WOOD_DK,
    }));
    root.add(box({
      size: [tableX1 - tableX0 - 0.5, 0.012, 0.9], pos: [0, topY + 0.052, 58], mat: M_LEATHER_DK, cast: false, name: 'conference-table-leather',
    }));
    for (const iz of [-0.5, 0.5]) {
      root.add(box({
        size: [tableX1 - tableX0 - 0.36, 0.014, 0.04], pos: [0, topY + 0.052, 58 + iz], mat: M_GOLD, cast: false,
      }));
    }
    /* Two pedestals with a spreader between them, not four posts: a turned
     * table is carried on its own long axis or the middle of it sags. */
    for (const px of [-1.9, 1.9]) {
      root.add(box({ size: [0.5, 0.66, 1.5], pos: [px, UY + 0.35, 58], mat: M_WOOD_DK, name: 'conference-pedestal' }));
      root.add(box({ size: [0.66, 0.09, 1.7], pos: [px, UY + 0.05, 58], mat: M_WOOD_DK, cast: false }));
      root.add(box({ size: [0.56, 0.05, 1.56], pos: [px, UY + 0.68, 58], mat: M_GOLD, cast: false }));
    }
    root.add(box({ size: [2.9, 0.14, 0.3], pos: [0, UY + 0.3, 58], mat: M_WOOD_DK, cast: false }));
    solid(tableX0, tableX1, UY, UY + 0.8, tableZ0, tableZ1);

    const chairs = [];
    /* Four a side plus Lou. `makeSeat` puts the back on local -z, so yaw 0
     * faces +z (north, from the south side) and PI faces -z. */
    const chairSeats = [];
    for (const cx of [-2.2, -1.1, 1.1, 2.2]) {
      chairSeats.push([cx, tableZ0 - 0.6, 0]);
      chairSeats.push([cx, tableZ1 + 0.6, Math.PI]);
    }
    for (const [cx, cz, cyaw] of chairSeats) {
      chairs.push(makeFancyChair(cx, UY, cz, cyaw, M_LEATHER_DK, { tag: 'conference-chair' }));
    }
    // Lou's carver: taller, red, and the only one with the house's own crest
    // cut into its crest rail.
    chairs.push(makeFancyChair(0, UY, tableZ1 + 0.62, Math.PI, M_LEATHER_RED, {
      backH: 1.02, tag: 'lou-carver',
    }));
    root.add(box({
      size: [0.2, 0.2, 0.05], pos: [0, UY + 1.62, tableZ1 + 0.86], mat: M_GOLD, cast: false, name: 'lou-carver-crest',
    }));
    /* Places laid: a leather blotter, a pad, a pen and a glass at each seat,
     * and a carafe between every pair. */
    for (const [cx, cz, cyaw] of chairSeats) {
      const inward = cyaw === 0 ? 1 : -1;
      const bz = cz + inward * 0.72;
      root.add(box({
        size: [0.42, 0.014, 0.3], pos: [cx, topY + 0.058, bz], mat: M_LEATHER_DK, cast: false, name: 'conference-blotter',
      }));
      root.add(box({
        size: [0.2, 0.014, 0.14], pos: [cx, topY + 0.07, bz], mat: M_CARD, rotY: 0.08, cast: false,
      }));
      root.add(cylinder({
        r: 0.007, h: 0.15, pos: [cx + 0.13, topY + 0.072, bz], mat: M_GOLD, rotZ: Math.PI / 2, rotY: 0.3, cast: false,
      }));
      root.add(cylinder({ r: 0.035, h: 0.11, pos: [cx - 0.26, topY + 0.11, bz], mat: M_GLASS_CASE }));
    }
    for (const cx of [-1.65, 1.65]) {
      root.add(cylinder({
        rTop: 0.05, rBottom: 0.08, h: 0.24, pos: [cx, topY + 0.17, 58], mat: M_GLASS_CASE,
      }));
      root.add(cylinder({ r: 0.024, h: 0.05, pos: [cx, topY + 0.31, 58], mat: M_SILVER, cast: false }));
    }
    // Lou's own place, and the conference phone nobody else may touch.
    root.add(box({
      size: [0.5, 0.016, 0.34], pos: [0, topY + 0.058, tableZ1 - 0.66], mat: M_LEATHER_RED, cast: false, name: 'lou-blotter',
    }));
    root.add(box({
      size: [0.26, 0.02, 0.06], pos: [0, topY + 0.066, tableZ1 - 0.42], mat: M_GOLD, cast: false, name: 'lou-nameplate',
    }));
    root.add(box({
      size: [0.3, 0.05, 0.24], pos: [0, topY + 0.08, 58.1], mat: M_STOVE_BLACK, cast: false, name: 'conference-phone',
    }));
    root.add(cylinder({
      r: 0.09, h: 0.03, pos: [0, topY + 0.11, 58.1], mat: M_CHROME, cast: false,
    }));
    // A low gilt centrepiece -- low on purpose, so it does not sit between two
    // people who are talking to each other across a 2.2 m table.
    root.add(named(cylinder({
      rTop: 0.26, rBottom: 0.16, h: 0.12, pos: [0, topY + 0.11, 57.6], mat: M_GOLD,
    }), 'conference-centrepiece'));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399963;
      const rr = 0.18 * Math.sqrt((i + 0.5) / 9);
      root.add(sphere({
        r: 0.045,
        pos: [Math.cos(a) * rr, topY + 0.2, 57.6 + Math.sin(a) * rr],
        mat: i % 3 === 0 ? mat({ color: 0xe0b448, roughness: 0.7 }) : mat({ color: 0xf4efe2, roughness: 0.8 }),
        cast: false,
      }));
    }

    // Projector screen + podium on the west wall.
    const screenTex = makeProjectorScreenTexture();
    const screenMat = mat({
      map: screenTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.55, unique: true,
    });
    /* Screen and bezel stand OFF the panelling rather than in it. The bezel
     * used to run x -8.805..-8.735, and the wall's own panel beads front at
     * exactly -8.805 -- a shared plane over four panels, which is the flicker
     * class. Both moved forward 55 mm: bezel -8.75..-8.68, beads -8.755, a
     * 5 mm gap; screen 5 mm in front of the bezel's face. */
    const screen = flatArt('conference-screen', {
      x: r.x0 + 0.175, y: UY + 2.3, z: 58, rotY: Math.PI / 2, w: 6, h: 3.2, material: screenMat,
    });
    root.add(box({
      size: [0.07, 3.5, 6.3], pos: [r.x0 + 0.135, UY + 2.3, 58], mat: M_WOOD_DK, name: 'screen-bezel',
    }));
    const podium = group('podium',
      box({ size: [0.5, 1.1, 0.7], pos: [0, 0.55, 0], mat: M_WOOD_DK }),
      box({
        size: [0.55, 0.08, 0.75], pos: [0.02, 1.12, 0], mat: M_WOOD_DK, rotZ: 0.12,
      }));
    podium.position.set(r.x0 + 1.5, UY, 61.4);
    root.add(podium);
    solid(r.x0 + 1.2, r.x0 + 1.8, UY, UY + 1.15, 61.05, 61.75);
    /* THE LECTERN MICROPHONE. Owner playtest, verbatim: "microphone fucked
     * up" -- and it was not a microphone at all. What stood here was a
     * horizontal chrome rod at z 60.75..61.05 with a fat silver puck on the
     * end of it, starting at the podium's front edge (61.025) and sticking
     * straight out into the air: no base, no stem, no neck, nothing holding
     * it up and nothing to speak into.
     *
     * Built properly now, as the thing it is: a weighted base standing ON the
     * sloped reading top, a short rise out of it, a five-segment gooseneck
     * that curves up and back over the front edge, and a capsule in a foam
     * windscreen angled at where a speaker's mouth would be. The neck is
     * generated rather than posed so each joint continues the last one's
     * angle -- a gooseneck bent by hand is where the kinks come from. */
    const micX = r.x0 + 1.5;
    const micZ = 61.4;
    root.add(named(cylinder({
      r: 0.075, h: 0.03, pos: [micX, UY + 1.16, micZ], mat: M_STOVE_BLACK,
    }), 'conference-mic-base'));
    root.add(named(cylinder({
      rTop: 0.03, rBottom: 0.055, h: 0.05, pos: [micX, UY + 1.2, micZ], mat: M_CHROME, cast: false,
    }), 'conference-mic-collar'));
    root.add(named(cylinder({
      r: 0.014, h: 0.22, pos: [micX, UY + 1.33, micZ], mat: M_CHROME,
    }), 'conference-mic-stem'));
    let gx = micX;
    let gy = UY + 1.44;
    let gA = 0;
    for (let i = 0; i < 5; i++) {
      const a = 0.28 + i * 0.28;
      const seg = 0.075;
      const nx = gx - Math.sin(a) * seg;
      const ny = gy + Math.cos(a) * seg;
      root.add(named(cylinder({
        r: 0.011, h: seg + 0.014, pos: [(gx + nx) / 2, (gy + ny) / 2, micZ], mat: M_CHROME, rotZ: a, cast: false,
      }), 'conference-mic-neck'));
      gx = nx; gy = ny; gA = a;
    }
    root.add(named(cylinder({
      r: 0.022, h: 0.08, pos: [gx - Math.sin(gA) * 0.04, gy + Math.cos(gA) * 0.04, micZ], mat: M_STOVE_BLACK, rotZ: gA,
    }), 'conference-mic-capsule'));
    root.add(named(sphere({
      r: 0.032, pos: [gx - Math.sin(gA) * 0.09, gy + Math.cos(gA) * 0.09, micZ], mat: mat({ color: 0x20232a, roughness: 1 }), cast: false,
    }), 'conference-mic-windscreen'));
    // The live light on the base, so the lectern reads as wired to something.
    root.add(named(sphere({
      r: 0.011, pos: [micX + 0.05, UY + 1.18, micZ - 0.04], mat: mat({ color: 0x300808, emissive: 0xe02020, emissiveIntensity: 2.2, roughness: 0.6 }), cast: false,
    }), 'conference-mic-live'));

    // Ceiling projector, aimed at the screen.
    root.add(box({ size: [0.34, 0.16, 0.42], pos: [1.4, UCY - 0.5, 58], mat: M_STOVE_BLACK }));
    root.add(cylinder({
      r: 0.02, h: 0.36, pos: [1.4, UCY - 0.3, 58], mat: M_CHROME,
    }));

    // A sideboard with the coffee service, and the family crest above it.
    caseFurniture(r.x1 - 0.5, 56.4, UY, 2.2, 0.55, 0.92, -Math.PI / 2, 3);
    for (const oz of [55.7, 56.4, 57.1]) {
      root.add(cylinder({ r: 0.07, h: 0.1, pos: [r.x1 - 0.5, UY + 0.98, oz], mat: M_CARD }));
    }
    const conferenceCrest = wallArt('mansion.conference.crest', r.x1 - 0.14, UY + 2.5, 56.4, -Math.PI / 2, 1.3, 1.6,
      squatchArt('mansion-conference-crest', {
        title: ['SILVER', 'SASQUATCHES'], footer: 'EST. THE OLD DAYS', ink: '#d8b23a', bg: '#141018',
      }));

    /* Coffered ceiling, in gold on the warm plaster: a beam grid over the
     * middle of the room with the two fittings hung inside it. A boardroom
     * with a flat ceiling and two lamps on a stick is a meeting room. */
    topping(r.x0 + 0.6, r.x1 - 0.6, UCY - 0.16, r.z0 + 0.6, r.z1 - 0.6, M_WALL_WARM, 'conference-ceiling');
    for (const bx of [-5.4, -1.8, 1.8, 5.4]) {
      root.add(box({
        size: [0.16, 0.2, r.z1 - r.z0 - 1.2], pos: [bx, UCY - 0.26, 58], mat: M_GOLD, cast: false, name: 'conference-coffer',
      }));
    }
    for (const bz of [55.0, 58.0, 61.0]) {
      root.add(box({
        size: [r.x1 - r.x0 - 1.2, 0.2, 0.16], pos: [0, UCY - 0.26, bz], mat: M_GOLD, cast: false, name: 'conference-coffer',
      }));
    }

    /* Lighting: two fittings over the table, hung on ITS long axis now rather
     * than on the axis it used to run down. */
    const lights = [];
    for (const lx of [-1.7, 1.7]) {
      root.add(cylinder({ r: 0.03, h: 0.7, pos: [lx, UCY - 0.6, 58], mat: M_GOLD }));
      root.add(cylinder({
        rTop: 0.26, rBottom: 0.16, h: 0.1, pos: [lx, UCY - 0.95, 58], mat: M_GOLD, cast: false,
      }));
      for (const [ox, oz] of [[-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]]) {
        root.add(box({
          size: ox === 0 ? [0.03, 0.03, Math.abs(oz)] : [Math.abs(ox), 0.03, 0.03],
          pos: [lx + ox / 2, UCY - 0.95, 58 + oz / 2],
          mat: M_GOLD,
        }));
        // Each arm carries a candle cup with the shade the right way up.
        root.add(cylinder({
          rTop: 0.11, rBottom: 0.14, h: 0.15, pos: [lx + ox, UCY - 1.02, 58 + oz], mat: M_SHADE_CREAM,
        }));
        root.add(sphere({ r: 0.075, pos: [lx + ox, UCY - 1.04, 58 + oz], mat: M_BULB_WARM, cast: false }));
      }
      const l = new THREE.PointLight(0xffdba0, 7, 18, 2);
      l.position.set(lx, UCY - 1.15, 58);
      root.add(l);
      lights.push(l);
    }
    return {
      table: {
        x: 0, x0: tableX0, x1: tableX1, z0: tableZ0, z1: tableZ1,
      },
      chairs,
      podium,
      screen,
      lights,
      crest: conferenceCrest,
    };
  }
  const conferenceProps = buildConference();

  /* ================================================================== */
  /* UPPER FLOOR -- LOU'S OFFICE (behind the conference room)            */
  /*                                                                      */
  /* Owner playtest 2026-08-04, verbatim: "Lou's office needs way more     */
  /* detail and cool shit. Ultra luxury ultra fancy."                      */
  /*                                                                        */
  /* This is the boss's room and the campaign's return point -- it is where  */
  /* PROJECT SILENT SQUATCH starts and where the player is sent back to, so  */
  /* it is looked at longer than any other room in the house. What was here  */
  /* was a good desk in a plain box: shoulder-high panelling, two bookcases, */
  /* a case, a safe and two flush ceiling fittings.                          */
  /*                                                                          */
  /* What it has now, and nothing that was here has been thrown away: full-    */
  /* height panelling with gilt bead frames and a dado, a coffered ceiling on  */
  /* a beam grid, a chandelier over the desk, a marble chimneypiece with a     */
  /* fire and an overmantel mirror, a chesterfield seating group on a second   */
  /* rug, a library ladder on a brass rail across the bookcases, a globe, a    */
  /* grandfather clock, the drinks table laid with decanters, and the desk     */
  /* itself rebuilt with a leather inlay, carved pedestals, brass hardware     */
  /* and the things a man actually keeps on one.                              */
  /*                                                                           */
  /* Two lines through the room are kept clear on purpose, because a room this */
  /* full is one careless armchair away from being unenterable: the walk in    */
  /* from Lou's door (x -1.6..1.6 at z = 63.15, held W from the conference     */
  /* room) and the run from there to the desk. Nothing stands between x = -1.6 */
  /* and x = +1.6 south of the desk.                                           */
  /* ================================================================== */
  function buildOffice() {
    const r = OFFICE;
    trimRoom(r, UY, UCY - 0.3);
    topping(r.x0, r.x1, UY + 0.01, r.z0, r.z1, M_PARQUET, 'office-floor');
    // A dark marble border round the parquet, and two rugs: the big one under
    // the desk, a smaller one under the seating group.
    for (const [bx0, bx1, bz0, bz1] of [
      [r.x0 + 0.6, r.x1 - 0.6, r.z0 + 0.6, r.z0 + 0.85],
      [r.x0 + 0.6, r.x1 - 0.6, r.z1 - 0.85, r.z1 - 0.6],
      [r.x0 + 0.6, r.x0 + 0.85, r.z0 + 0.6, r.z1 - 0.6],
      [r.x1 - 0.85, r.x1 - 0.6, r.z0 + 0.6, r.z1 - 0.6],
    ]) topping(bx0, bx1, UY + 0.02, bz0, bz1, M_MARBLE_DK, 'office-border');
    rug(0, 70.4, 10.5, 7.6, UY, M_RUG_LIVING);
    rug(-4.9, 72.6, 4.4, 3.4, UY + 0.004, M_CARPET_HALL);

    /* Panelling, floor to cornice, on both long walls: a fielded panel in dark
     * wood inside a gilt bead, with a dado rail over the run. It used to be
     * one 1.5 m slab per side standing 0.02 m off the plaster. */
    for (const side of [-1, 1]) {
      const px = side * (r.x1 - 0.035);
      /* Starts at UY + 0.17, ABOVE the skirting `trimRoom` has already run
       * round this room: a 0.07 m panel from the floor swallows the 0.05 m
       * skirting whole, which is a moulding you have paid for and cannot
       * see. */
      root.add(box({
        size: [0.07, 2.43, r.z1 - r.z0 - 0.4],
        pos: [px, UY + 1.385, (r.z0 + r.z1) / 2],
        mat: M_WOOD_DK,
        cast: false,
        name: 'office-panelling',
      }));
      for (let i = 0; i < 6; i++) {
        const pz = r.z0 + 1.4 + i * 1.72;
        for (const [oy, oz, sy, sz] of [
          [1.0, 0, 0.05, 1.34], [-1.0, 0, 0.05, 1.34], [0, 0.67, 2.05, 0.05], [0, -0.67, 2.05, 0.05],
        ]) {
          root.add(box({
            size: [0.05, sy, sz], pos: [side * (r.x1 - 0.08), UY + 1.3 + oy, pz + oz], mat: M_GOLD, cast: false, name: 'office-panel-bead',
          }));
        }
      }
      root.add(box({
        size: [0.11, 0.14, r.z1 - r.z0 - 0.3], pos: [side * (r.x1 - 0.05), UY + 2.68, (r.z0 + r.z1) / 2], mat: M_GOLD, cast: false, name: 'office-dado',
      }));
      root.add(box({
        size: [0.13, 0.22, r.z1 - r.z0], pos: [side * (r.x1 - 0.06), UCY - 0.42, (r.z0 + r.z1) / 2], mat: M_TRIM, cast: false, name: 'office-cornice',
      }));
    }

    // The desk, facing the door, with the chair behind it and the window
    // over Lou's shoulder. Nobody sits down here without being looked at.
    const deskZ = 71.6;
    const desk = group('lou-desk',
      box({ size: [2.6, 0.1, 1.2], pos: [0, 0.78, 0], mat: M_DESKTOP }),
      box({ size: [2.4, 0.66, 0.08], pos: [0, 0.4, -0.5], mat: M_WOOD_DK }),
      box({ size: [0.1, 0.78, 1.1], pos: [-1.2, 0.39, 0], mat: M_WOOD_DK }),
      box({ size: [0.1, 0.78, 1.1], pos: [1.2, 0.39, 0], mat: M_WOOD_DK }),
      box({ size: [0.9, 0.62, 0.9], pos: [0.75, 0.4, 0.06], mat: M_WOOD }),
      /* A partners' desk, dressed: a tooled leather writing panel let into the
       * top, a gilt edge round it, carved pedestal fronts with brass pulls,
       * and a moulded plinth so the whole thing meets the floor. */
      box({ size: [1.9, 0.012, 0.86], pos: [0, 0.834, 0], mat: M_LEATHER_DK, name: 'lou-desk-leather' }),
      box({ size: [2.68, 0.05, 1.28], pos: [0, 0.75, 0], mat: M_GOLD }),
      box({ size: [2.5, 0.09, 1.1], pos: [0, 0.06, 0], mat: M_WOOD_DK }),
      box({ size: [0.86, 0.5, 0.05], pos: [-0.82, 0.5, 0.58], mat: M_WOOD_DK }),
      box({ size: [0.86, 0.5, 0.05], pos: [0.82, 0.5, 0.58], mat: M_WOOD_DK }));
    for (const px of [-0.82, 0.82]) {
      for (const py of [0.36, 0.62]) {
        desk.add(cylinder({
          r: 0.022, h: 0.16, pos: [px, py, 0.61], mat: M_GOLD, rotZ: Math.PI / 2, cast: false,
        }));
      }
    }
    desk.position.set(0, UY, deskZ);
    root.add(desk);
    solid(-1.35, 1.35, UY, UY + 0.85, deskZ - 0.65, deskZ + 0.65);
    // Desk furniture.
    const deskLampPos = [-0.85, UY + 0.83, deskZ - 0.1];
    root.add(cylinder({ r: 0.11, h: 0.04, pos: deskLampPos, mat: M_BRONZE }));
    root.add(cylinder({
      r: 0.02, h: 0.34, pos: [deskLampPos[0], deskLampPos[1] + 0.19, deskLampPos[2]], mat: M_BRONZE,
    }));
    root.add(box({
      size: [0.34, 0.1, 0.2],
      pos: [deskLampPos[0], deskLampPos[1] + 0.38, deskLampPos[2]],
      mat: mat({ color: 0x1c5a34, roughness: 0.5 }),
    }));
    const deskLight = new THREE.PointLight(0xffd9a0, 2.6, 8, 2);
    deskLight.position.set(deskLampPos[0], deskLampPos[1] + 0.3, deskLampPos[2]);
    root.add(deskLight);
    root.add(box({
      size: [0.42, 0.03, 0.3], pos: [0.35, UY + 0.85, deskZ - 0.05], mat: M_CARD, rotY: 0.12, cast: false,
    }));
    const cigars = makeAshtray(M, { x: 0.85, y: UY + 0.84, z: deskZ + 0.25 });
    root.add(cigars.group);
    const scotch = makeWhiskeyBottle(M, { x: -1.05, y: UY + 0.84, z: deskZ + 0.3, rotY: -0.3 });
    root.add(scotch.group);
    /* ...and the rest of what is on it: a desk telephone with a real handset,
     * a humidor, a pen stand, a ledger stack and a brass letter tray. The
     * mission puts a silver case down on this desk, so the middle of the
     * writing panel (x -0.35..0.35) is left empty for it. */
    root.add(box({
      size: [0.3, 0.11, 0.24], pos: [-0.35, UY + 0.89, deskZ + 0.34], mat: M_STOVE_BLACK, name: 'office-telephone',
    }));
    root.add(box({
      size: [0.24, 0.07, 0.09], pos: [-0.35, UY + 0.98, deskZ + 0.36], mat: M_STOVE_BLACK, cast: false,
    }));
    root.add(cylinder({
      r: 0.055, h: 0.03, pos: [-0.35, UY + 0.955, deskZ + 0.28], mat: M_GOLD, cast: false,
    }));
    root.add(box({
      size: [0.34, 0.14, 0.24], pos: [1.02, UY + 0.9, deskZ - 0.3], mat: M_WOOD_DK, name: 'office-humidor',
    }));
    root.add(box({
      size: [0.36, 0.04, 0.26], pos: [1.02, UY + 0.99, deskZ - 0.3], mat: M_GOLD, cast: false,
    }));
    root.add(box({
      size: [0.32, 0.03, 0.24], pos: [-1.02, UY + 0.85, deskZ - 0.34], mat: M_GOLD, cast: false, name: 'office-letter-tray',
    }));
    for (let i = 0; i < 3; i++) {
      root.add(box({
        size: [0.28, 0.02, 0.2], pos: [-1.02, UY + 0.87 + i * 0.022, deskZ - 0.34], mat: M_CARD, rotY: 0.05 * i, cast: false,
      }));
    }
    for (let i = 0; i < 3; i++) {
      root.add(box({
        size: [0.24, 0.045, 0.32],
        pos: [0.62, UY + 0.858 + i * 0.05, deskZ + 0.02],
        mat: i % 2 ? M_LEATHER_RED : M_LEATHER_DK,
        rotY: 0.04 * (i - 1),
        cast: false,
        name: 'office-ledger',
      }));
    }
    root.add(cylinder({
      rTop: 0.05, rBottom: 0.06, h: 0.09, pos: [0.35, UY + 0.88, deskZ - 0.38], mat: M_BRONZE, cast: false,
    }));
    for (const [px, pr] of [[0.33, 0.35], [0.38, -0.3]]) {
      root.add(cylinder({
        r: 0.006, h: 0.2, pos: [px, UY + 0.98, deskZ - 0.38], mat: M_GOLD, rotZ: pr, cast: false,
      }));
    }
    // The chair. Not a seat you take without being asked -- and, since the
    // owner wants every chair in the house fancy, a proper carver.
    makeFancyChair(0, UY, deskZ + 1.15, Math.PI, M_LEATHER_RED, { backH: 1.15, tag: 'lou-chair' });
    makeFancyChair(-0.95, UY, deskZ - 1.5, 0, M_LEATHER_TAN, { backH: 0.72, tag: 'office-chair' });
    makeFancyChair(0.95, UY, deskZ - 1.5, 0, M_LEATHER_TAN, { backH: 0.72, tag: 'office-chair' });

    /* ---- and the red chair, which is now EMPTY ----
     *
     * There used to be a Big Uncle Lou sitting in it. There is a second one
     * standing 1.7 m away, at (1.05, 72.75), posted by `../cast.js` — same
     * name, same `lou.png`, different outfit — and both files mount
     * unconditionally, so the player walked into the office and met the same
     * man twice.
     *
     * Nobody did anything wrong. This file's own note says the house "has had
     * Lou's name on four things in it and Lou in none of them", which was true
     * when it was written; `cast.js` posted him a pass later, answering the
     * owner's "none of the characters are here". Neither pass could see the
     * other, and a duplicate is invisible in a diff and obvious in a doorway.
     *
     * The seated one goes, because the line this project draws is that
     * `MansionInterior.js` is the BUILDING and `cast.js` is the PEOPLE — and
     * the one in `cast.js` is the one the mission talks to and the one with a
     * `look` description. Found by the wardrobe workshop, which puts the same
     * character's scenes side by side; it is the first thing that could see it.
     *
     * If he reads better seated — and he probably does — seat him in
     * `cast.js`, which supports `job: 'sit'`. Do not put him back here.
     */

    // The locked case behind the desk with something in it nobody has seen.
    makeDisplayCase(r.x0 + 0.45, UY, 70.4, Math.PI / 2, 1.9, 2.2, 0.5, (g, w, h) => {
      g.add(box({ size: [w * 0.35, h * 0.55, 0.18], pos: [0, h * 0.32, 0], mat: M_SILHOUETTE }));
      g.add(box({ size: [w * 0.16, h * 0.2, 0.14], pos: [0, h * 0.65, 0], mat: M_SILHOUETTE }));
    });
    const caseGlow = new THREE.PointLight(0xfff0d0, 1.8, 4, 2);
    caseGlow.position.set(r.x0 + 0.8, UY + 1.3, 70.4);
    root.add(caseGlow);

    /* Bookcases along the west wall, with a cornice, glazed upper doors and a
     * library ladder parked on its own brass rail -- which is the detail that
     * makes a pair of bookcases read as a library. */
    for (const bz of [65.2, 67.6]) {
      root.add(box({
        size: [0.4, 2.4, 2.2], pos: [r.x0 + 0.25, UY + 1.2, bz], mat: M_WOOD_DK, name: 'office-bookcase',
      }));
      solid(r.x0, r.x0 + 0.5, UY, UY + 2.4, bz - 1.1, bz + 1.1);
      for (let s = 0; s < 3; s++) {
        const shelfY = UY + 0.55 + s * 0.7;
        const books = makeBooks(M, {
          x: r.x0 + 0.32, y: shelfY, z: bz - 0.9, count: 8, along: 'z',
        });
        root.add(books.group);
      }
      // Moulded cornice and plinth, and a gilt bead down each stile.
      root.add(box({
        size: [0.52, 0.16, 2.36], pos: [r.x0 + 0.28, UY + 2.48, bz], mat: M_WOOD_DK, cast: false, name: 'office-bookcase-cornice',
      }));
      root.add(box({
        size: [0.5, 0.14, 2.3], pos: [r.x0 + 0.27, UY + 0.07, bz], mat: M_WOOD_DK, cast: false,
      }));
      for (const oz of [-1.08, 1.08]) {
        root.add(box({
          size: [0.06, 2.3, 0.06], pos: [r.x0 + 0.46, UY + 1.25, bz + oz], mat: M_GOLD, cast: false,
        }));
      }
      // Glazed doors over the top shelf.
      root.add(box({
        size: [0.03, 0.62, 2.0], pos: [r.x0 + 0.46, UY + 1.98, bz], mat: M_GLASS_CASE, cast: false,
      }));
    }
    root.add(named(cylinder({
      r: 0.028, h: 5.2, pos: [r.x0 + 0.52, UY + 2.3, 66.4], mat: M_GOLD, rotX: Math.PI / 2,
    }), 'library-rail'));
    {
      // The ladder itself, leaning on the rail between the two cases.
      const lz = 66.4;
      const lean = 0.16;
      for (const oz of [-0.24, 0.24]) {
        root.add(box({
          size: [0.06, 2.5, 0.06], pos: [r.x0 + 0.72, UY + 1.25, lz + oz], mat: M_WOOD_DK, rotZ: lean, name: 'library-ladder',
        }));
      }
      for (let i = 0; i < 6; i++) {
        const ry = UY + 0.32 + i * 0.4;
        root.add(box({
          size: [0.1, 0.05, 0.5], pos: [r.x0 + 0.72 - (ry - UY - 1.25) * lean, ry, lz], mat: M_WOOD_DK, cast: false,
        }));
      }
      solid(r.x0 + 0.5, r.x0 + 0.95, UY, UY + 2.4, lz - 0.3, lz + 0.3);
    }

    /* ================================================================ */
    /* THE SAFE, IN THE CORNER (owner playtest 2026-08-04, verbatim:     */
    /* "Safe should be in the corner more")                              */
    /*                                                                    */
    /* It stood at x 7.60..8.50, z 64.95..65.85 -- against the east wall,   */
    /* but 1.8 m up it from the south wall and with 9.15 m of empty room    */
    /* behind it, so it read as a black box parked in the middle of a wall. */
    /* It is now in the room's south-east corner (x 7.98..8.83, z 63.28..    */
    /* 64.13), 0.02 m off both faces, which is where a floor safe goes -- on */
    /* two walls, in the corner you can watch from the desk. Dressed while    */
    /* it was being moved: a granite plinth, a gilt pinstripe, a spoked        */
    /* handle, a real dial with a fiducial mark, three hinges, and a brass     */
    /* maker's plate. Lou's own portrait hangs over it.                        */
    /* ================================================================ */
    const safeX = r.x1 - 0.5;
    const safeZ = r.z0 + 0.55;
    root.add(box({
      size: [0.9, 0.14, 1.0], pos: [safeX - 0.03, UY + 0.07, safeZ], mat: M_MARBLE_DK, cast: false, name: 'office-safe-plinth',
    }));
    root.add(box({
      size: [0.85, 1.16, 0.9], pos: [safeX, UY + 0.72, safeZ], mat: M_STOVE_BLACK, name: 'office-safe',
    }));
    // Gilt pinstripe round the door face, and the door's own reveal.
    root.add(box({
      size: [0.04, 1.0, 0.78], pos: [safeX - 0.43, UY + 0.72, safeZ], mat: M_RACK, name: 'office-safe-door',
    }));
    for (const [oy, oz, sy, sz] of [
      [0.46, 0, 0.03, 0.72], [-0.46, 0, 0.03, 0.72], [0, 0.35, 0.95, 0.03], [0, -0.35, 0.95, 0.03],
    ]) {
      root.add(box({
        size: [0.03, sy, sz], pos: [safeX - 0.46, UY + 0.72 + oy, safeZ + oz], mat: M_GOLD, cast: false,
      }));
    }
    // Dial, fiducial mark and the spoked handle.
    root.add(named(cylinder({
      r: 0.15, h: 0.05, pos: [safeX - 0.47, UY + 0.92, safeZ + 0.12], mat: M_CHROME, rotZ: Math.PI / 2,
    }), 'office-safe-dial'));
    root.add(cylinder({
      r: 0.055, h: 0.06, pos: [safeX - 0.5, UY + 0.92, safeZ + 0.12], mat: M_GOLD, rotZ: Math.PI / 2, cast: false,
    }));
    root.add(box({
      size: [0.03, 0.07, 0.02], pos: [safeX - 0.5, UY + 1.09, safeZ + 0.12], mat: M_GOLD, cast: false,
    }));
    root.add(cylinder({
      r: 0.045, h: 0.09, pos: [safeX - 0.5, UY + 0.52, safeZ + 0.12], mat: M_CHROME, rotZ: Math.PI / 2,
    }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      root.add(box({
        size: [0.04, 0.3, 0.05],
        pos: [safeX - 0.52, UY + 0.52 + Math.sin(a) * 0.0, safeZ + 0.12],
        mat: M_CHROME,
        rotX: a,
        cast: false,
      }));
    }
    for (const hz of [-0.3, 0, 0.3]) {
      root.add(cylinder({
        r: 0.045, h: 0.14, pos: [safeX - 0.42, UY + 0.72 + hz * 1.1, safeZ - 0.44], mat: M_CHROME, cast: false,
      }));
    }
    root.add(box({
      size: [0.02, 0.09, 0.2], pos: [safeX - 0.48, UY + 1.2, safeZ - 0.12], mat: M_GOLD, cast: false, name: 'office-safe-plate',
    }));
    solid(safeX - 0.5, safeX + 0.45, UY, UY + 1.3, safeZ - 0.5, safeZ + 0.5);

    /* ---- The chimneypiece on the east wall. A room this size with no fire
     * in it is a conference room with a desk. Marble surround, a lit grate,
     * an overmantel mirror in a gilt frame, garniture on the shelf and a set
     * of irons on the hearth. */
    const fireZ = 70.4;
    const fireX = r.x1 - 0.02;
    /* A FIREPLACE IS A VOID WITH A SURROUND ROUND IT, NOT A DARK BOX ON A SLAB.
     *
     * Owner playtest, verbatim: "fireplace needs work" -- and of the one
     * downstairs, "its black box with the logs just slightly poking thro".
     * Both fireplaces in this house were built the same wrong way and both
     * measure it. Here the chimneypiece was ONE solid marble box spanning
     * x 8.23..8.83, and the firebox behind it at 8.33..8.79 with all five
     * logs at 8.31..8.71 -- so every part of the fire was buried inside the
     * surround's own front face at 8.23 and NONE of it had ever been visible.
     * The room had a marble slab where its fire was meant to be.
     *
     * So the surround is now what a surround is: two pilasters and a frieze
     * with a real 1.5 x 1.35 m HOLE between them, and the firebox is a
     * five-sided recess behind that hole -- back, two cheeks, a top and a
     * firebrick floor -- with the grate, the logs and the embers standing
     * inside it where the opening lets you see them.
     */
    const opZ0 = fireZ - 0.75;
    const opZ1 = fireZ + 0.75;
    const opTopY = UY + 1.35;
    /* Pilasters either side of the opening, breast over it, both stopping on
     * the same front plane the old slab had so the mantel still fits. */
    for (const [pz0, pz1] of [[fireZ - 1.5, opZ0], [opZ1, fireZ + 1.5]]) {
      root.add(box({
        size: [0.6, 1.35, pz1 - pz0], pos: [fireX - 0.3, UY + 0.675, (pz0 + pz1) / 2], mat: M_MARBLE, name: 'office-chimneypiece',
      }));
      // A moulded capital where each pilaster meets the frieze.
      root.add(box({
        size: [0.66, 0.1, pz1 - pz0 + 0.06], pos: [fireX - 0.33, opTopY - 0.05, (pz0 + pz1) / 2], mat: M_MARBLE, cast: false, name: 'office-chimney-capital',
      }));
    }
    root.add(box({
      size: [0.6, 0.17, 3.0], pos: [fireX - 0.3, opTopY + 0.085, fireZ], mat: M_MARBLE, name: 'office-chimney-frieze',
    }));
    // A carved tablet in the middle of the frieze, and the breast above.
    root.add(box({
      size: [0.64, 0.13, 0.8], pos: [fireX - 0.32, opTopY + 0.085, fireZ], mat: M_MARBLE_DK, cast: false, name: 'office-chimney-tablet',
    }));
    root.add(box({
      size: [0.6, 0.82, 2.7], pos: [fireX - 0.3, UY + 2.09, fireZ], mat: M_MARBLE, name: 'office-chimney-breast',
    }));
    root.add(box({
      size: [0.78, 0.16, 3.0], pos: [fireX - 0.39, UY + 1.6, fireZ], mat: M_MARBLE, name: 'office-mantel',
    }));
    /* The recess itself: five faces of firebrick, open to the room. */
    root.add(box({
      size: [0.08, 1.35, 1.5], pos: [fireX - 0.04, UY + 0.675, fireZ], mat: M_WALL_DEEP, cast: false, name: 'office-firebox-back',
    }));
    for (const cz of [opZ0 + 0.03, opZ1 - 0.03]) {
      root.add(box({
        size: [0.54, 1.35, 0.06], pos: [fireX - 0.33, UY + 0.675, cz], mat: M_WALL_DEEP, cast: false, name: 'office-firebox-cheek',
      }));
    }
    root.add(box({
      size: [0.54, 0.06, 1.5], pos: [fireX - 0.33, UY + 1.32, fireZ], mat: M_WALL_DEEP, cast: false, name: 'office-firebox-top',
    }));
    root.add(box({
      size: [0.54, 0.05, 1.44], pos: [fireX - 0.33, UY + 0.025, fireZ], mat: M_MARBLE_DK, cast: false, name: 'office-firebox-floor',
    }));
    // The hearth slab, projecting into the room from the opening's face.
    root.add(box({
      size: [0.45, 0.1, 2.0], pos: [fireX - 0.825, UY + 0.05, fireZ], mat: M_MARBLE_DK, cast: false, name: 'office-hearth',
    }));
    solid(fireX - 0.7, fireX, UY, UY + 2.5, fireZ - 1.5, fireZ + 1.5);
    /* The fire, standing IN the opening: a cast basket with front bars, logs
     * across it and embers under them.
     *
     * THE TILT IS WHAT DECIDES HOW DEEP THESE GO. A log is a cylinder laid on
     * its side and then rolled by `rotZ`, and rolling it swings its ends out
     * along x: at the 0.36 rad the first pass used, a 0.8 m log measures
     * 0.39 m across instead of its 0.12 m diameter, which put the outer two
     * logs at x 8.19 -- back through the surround's face at 8.23 and into the
     * room, which is the very fault being fixed. Tilt and depth are therefore
     * chosen together: 0.22 rad measures 0.29 m across, and centred at 8.47 it
     * lands at 8.32..8.62 -- 94 mm behind the face, 130 mm clear of the back. */
    for (const gz of [fireZ - 0.42, fireZ + 0.42]) {
      root.add(box({
        size: [0.36, 0.28, 0.05], pos: [fireX - 0.40, UY + 0.16, gz], mat: M_RACK, cast: false, name: 'office-grate-cheek',
      }));
    }
    for (let i = 0; i < 7; i++) {
      root.add(named(cylinder({
        r: 0.014, h: 0.86, pos: [fireX - 0.56, UY + 0.09 + i * 0.042, fireZ], mat: M_RACK, rotZ: Math.PI / 2, rotY: Math.PI / 2, cast: false,
      }), 'office-grate-bar'));
    }
    root.add(box({
      size: [0.34, 0.04, 0.84], pos: [fireX - 0.40, UY + 0.08, fireZ], mat: M_RACK, cast: false, name: 'office-grate-floor',
    }));
    for (let i = 0; i < 5; i++) {
      root.add(named(cylinder({
        r: 0.06,
        h: 0.8,
        pos: [fireX - 0.36, UY + 0.16 + i * 0.06, fireZ + (i - 2) * 0.15],
        mat: M_WOOD,
        rotX: Math.PI / 2,
        rotZ: 0.11 * (i - 2),
      }), 'office-fire-log'));
    }
    root.add(box({
      size: [0.3, 0.05, 0.9], pos: [fireX - 0.38, UY + 0.12, fireZ], mat: mat({ color: 0x140a06, emissive: 0xff5a1e, emissiveIntensity: 1.8, roughness: 0.9 }), cast: false, name: 'office-embers',
    }));
    const fireGlow = new THREE.PointLight(0xff8a3c, 4.0, 9, 2);
    fireGlow.position.set(fireX - 0.9, UY + 0.55, fireZ);
    root.add(fireGlow);
    // Overmantel mirror, garniture and the fire irons.
    root.add(box({
      size: [0.05, 1.5, 1.7], pos: [fireX - 0.62, UY + 2.5, fireZ], mat: mat({ color: 0xdce6ee, roughness: 0.08, metalness: 0.85 }), name: 'office-overmantel',
    }));
    root.add(box({
      size: [0.05, 1.72, 1.92], pos: [fireX - 0.58, UY + 2.5, fireZ], mat: M_GOLD, cast: false,
    }));
    recordArt('office-overmantel', fireX - 0.62, UY + 2.5, fireZ, Math.PI / 2, 1.92, 1.72);
    for (const oz of [-1.2, 1.2]) {
      root.add(cylinder({ r: 0.07, h: 0.12, pos: [fireX - 0.4, UY + 1.74, fireZ + oz], mat: M_GOLD }));
      root.add(cylinder({ r: 0.03, h: 0.36, pos: [fireX - 0.4, UY + 1.98, fireZ + oz], mat: M_CARD }));
      root.add(sphere({ r: 0.035, pos: [fireX - 0.4, UY + 2.18, fireZ + oz], mat: M_BULB_WARM, cast: false }));
    }
    root.add(cylinder({
      r: 0.1, h: 0.06, pos: [fireX - 0.42, UY + 1.71, fireZ], mat: M_BRONZE, cast: false,
    }));
    root.add(cylinder({
      r: 0.16, h: 0.22, pos: [fireX - 0.42, UY + 1.82, fireZ], mat: M_TROPHY_CUP,
    }));
    for (let i = 0; i < 3; i++) {
      root.add(cylinder({
        r: 0.012, h: 0.7, pos: [fireX - 0.75, UY + 0.36, fireZ + 1.28 + i * 0.06], mat: M_RACK, rotZ: 0.08,
      }));
    }
    root.add(cylinder({
      r: 0.1, h: 0.04, pos: [fireX - 0.75, UY + 0.02, fireZ + 1.34], mat: M_RACK, cast: false,
    }));

    // A drinks table and two chairs by the fire: the part of the office
    // where the conversation gets friendly again -- laid, now, with the
    // decanter set it never had.
    root.add(cylinder({ r: 0.6, h: 0.06, pos: [4.6, UY + 0.72, 68.6], mat: M_MARBLE, name: 'office-drinks-table' }));
    root.add(cylinder({ r: 0.16, h: 0.7, pos: [4.6, UY + 0.36, 68.6], mat: M_BRONZE }));
    root.add(cylinder({ r: 0.34, h: 0.05, pos: [4.6, UY + 0.03, 68.6], mat: M_BRONZE, cast: false }));
    solid(4.0, 5.2, UY, UY + 0.76, 68.0, 69.2);
    root.add(cylinder({ r: 0.26, h: 0.03, pos: [4.6, UY + 0.77, 68.6], mat: M_SILVER, cast: false, name: 'office-drinks-tray' }));
    root.add(box({
      size: [0.16, 0.24, 0.16], pos: [4.6, UY + 0.9, 68.68], mat: M_GLASS_CASE, name: 'office-decanter',
    }));
    root.add(cylinder({
      rTop: 0.045, rBottom: 0.06, h: 0.09, pos: [4.6, UY + 1.06, 68.68], mat: M_GLASS_CASE, cast: false,
    }));
    for (const [gx, gz] of [[4.4, 68.44], [4.78, 68.46]]) {
      root.add(cylinder({ r: 0.04, h: 0.1, pos: [gx, UY + 0.83, gz], mat: M_GLASS_CASE }));
    }
    /* THE YAWS ARE THE WAY ROUND THEY LOOK, AND THAT IS WHY THEY WERE WRONG.
     *
     * Owner playtest, verbatim: "Chairs by the couch backwards". Measured off
     * the built scene rather than the literals -- `makeFancyChair` puts the
     * chair's BACK on its local -z, so a chair faces (sin yaw, cos yaw), and
     * all four loose chairs in this room were pointing outward:
     *
     *   fireside, x 3.4  faced (-0.78, +0.62) -- away from the drinks table
     *   fireside, x 5.8  faced (+0.78, +0.62) -- away from the drinks table
     *   wing,     x -7.0 faced (-0.96, +0.07) -- away from the chesterfield
     *   wing,     x -2.8 faced (+0.96, +0.07) -- away from the chesterfield
     *
     * Each pair had simply been given the other one's angle: a chair on the
     * WEST of a table has to turn east to face it. Swapping the two values in
     * each pair turns all four in, which is the whole fix. */
    makeFancyChair(3.4, UY, 67.8, 0.9, M_LEATHER_TAN, { backH: 0.82, tag: 'office-fireside-chair' });
    makeFancyChair(5.8, UY, 67.8, -0.9, M_LEATHER_TAN, { backH: 0.82, tag: 'office-fireside-chair' });

    /* ---- The seating group in the north-west quarter: a buttoned
     * chesterfield, two wing chairs and a marble table on their own rug. Clear
     * of the desk (x -1.35..1.35) and of the walk in from Lou's door. */
    {
      const sx = -4.9;
      const sz = 74.0;
      root.add(box({ size: [2.5, 0.42, 0.95], pos: [sx, UY + 0.3, sz], mat: M_LEATHER_DK, name: 'office-chesterfield' }));
      root.add(box({ size: [2.5, 0.66, 0.22], pos: [sx, UY + 0.74, sz + 0.36], mat: M_LEATHER_DK }));
      for (const ax of [-1.14, 1.14]) {
        root.add(cylinder({
          r: 0.22, h: 0.95, pos: [sx + ax, UY + 0.62, sz], mat: M_LEATHER_DK, rotX: Math.PI / 2,
        }));
      }
      for (const cx of [-0.62, 0.62]) {
        root.add(box({
          size: [1.16, 0.16, 0.85], pos: [sx + cx, UY + 0.58, sz - 0.02], mat: M_LEATHER_DK, cast: false,
        }));
        root.add(box({
          size: [0.34, 0.26, 0.16], pos: [sx + cx, UY + 0.82, sz + 0.2], mat: M_FABRIC_GOLD, rotX: 0.2, cast: false, name: 'office-cushion',
        }));
      }
      for (const [lx, lz] of [[-1.1, -0.4], [1.1, -0.4], [-1.1, 0.4], [1.1, 0.4]]) {
        root.add(cylinder({
          rTop: 0.05, rBottom: 0.035, h: 0.16, pos: [sx + lx, UY + 0.08, sz + lz], mat: M_GOLD,
        }));
      }
      solid(sx - 1.4, sx + 1.4, UY, UY + 0.9, sz - 0.55, sz + 0.55);
      // Marble table in front of it, with the cigar box and the day's papers.
      root.add(box({ size: [1.5, 0.08, 0.8], pos: [sx, UY + 0.44, sz - 1.5], mat: M_MARBLE, name: 'office-low-table' }));
      for (const [lx, lz] of [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]]) {
        root.add(box({ size: [0.08, 0.42, 0.08], pos: [sx + lx, UY + 0.21, sz - 1.5 + lz], mat: M_BRONZE }));
      }
      solid(sx - 0.78, sx + 0.78, UY, UY + 0.48, sz - 1.92, sz - 1.08);
      root.add(box({
        size: [0.32, 0.1, 0.22], pos: [sx + 0.4, UY + 0.53, sz - 1.5], mat: M_WOOD_DK, cast: false, name: 'office-cigar-box',
      }));
      root.add(box({
        size: [0.34, 0.03, 0.26], pos: [sx - 0.36, UY + 0.5, sz - 1.46], mat: M_CARD, rotY: 0.16, cast: false,
      }));
      // ...and the two wing chairs, turned in on the chesterfield -- see the
      // note on the fireside pair above; this is the same swap.
      makeFancyChair(sx - 2.1, UY, sz - 1.5, Math.PI / 2 - 0.3, M_LEATHER_RED, { backH: 0.9, tag: 'office-wing-chair' });
      makeFancyChair(sx + 2.1, UY, sz - 1.5, -Math.PI / 2 + 0.3, M_LEATHER_RED, { backH: 0.9, tag: 'office-wing-chair' });
    }

    /* ---- A globe on its own stand, and a grandfather clock in the corner
     * by the door: the two things every office like this has and this one
     * did not. */
    {
      const gx = -3.2;
      const gz = 68.0;
      root.add(cylinder({ r: 0.34, h: 0.06, pos: [gx, UY + 0.03, gz], mat: M_WOOD_DK, cast: false }));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        root.add(cylinder({
          r: 0.03, h: 0.78, pos: [gx + Math.cos(a) * 0.16, UY + 0.4, gz + Math.sin(a) * 0.16], mat: M_WOOD_DK, rotZ: Math.cos(a) * 0.16, rotX: -Math.sin(a) * 0.16,
        }));
      }
      root.add(cylinder({ r: 0.34, h: 0.05, pos: [gx, UY + 0.8, gz], mat: M_GOLD, cast: false }));
      root.add(named(sphere({ r: 0.3, pos: [gx, UY + 1.12, gz], mat: mat({ color: 0x2c5f7a, roughness: 0.7 }) }), 'office-globe'));
      root.add(cylinder({
        r: 0.32, h: 0.03, pos: [gx, UY + 1.12, gz], mat: M_GOLD, rotZ: 0.4, cast: false,
      }));
      solid(gx - 0.36, gx + 0.36, UY, UY + 1.4, gz - 0.36, gz + 0.36);
    }
    {
      /* THE CLOCK WAS IN THE WALL. Owner playtest, verbatim: "Grandfather
       * clock in the wall". Measured on the built scene: the case stood at
       * x -8.74..-8.12 against panelling whose front face is at -8.78, which
       * looks clear -- but a longcase clock's PLINTH and CORNICE are wider
       * than its trunk, and those measured -8.79..-8.07 and -8.78..-8.08. So
       * the plinth was 10 mm inside the panelling and the cornice was exactly
       * ON its face: an interpenetration and a coplanar pair, which is the
       * flicker. The trunk was never the thing sticking through.
       *
       * Set off the wall by the PLINTH's half-width plus clearance rather than
       * the trunk's, and pulled south off the bookcase (whose front is at
       * z 64.1) so the dial is not buried in it either. Measured after:
       * plinth x -8.72, 60 mm clear of the panelling; dial reaches z 64.00,
       * 100 mm clear of the bookcase. */
      const kx = r.x0 + 0.49;
      const kz = r.z0 + 0.52;
      root.add(box({ size: [0.62, 2.3, 0.5], pos: [kx, UY + 1.15, kz], mat: M_WOOD_DK, name: 'office-longcase-clock' }));
      root.add(box({ size: [0.7, 0.2, 0.58], pos: [kx, UY + 2.36, kz], mat: M_WOOD_DK, cast: false, name: 'office-longcase-cornice' }));
      root.add(box({ size: [0.72, 0.14, 0.6], pos: [kx, UY + 0.07, kz], mat: M_WOOD_DK, cast: false, name: 'office-longcase-plinth' }));
      root.add(box({
        size: [0.44, 0.9, 0.03], pos: [kx, UY + 1.15, kz + 0.26], mat: M_GLASS_CASE, cast: false,
      }));
      root.add(cylinder({
        r: 0.09, h: 0.03, pos: [kx, UY + 0.95, kz + 0.24], mat: M_GOLD, rotX: Math.PI / 2, cast: false, name: 'office-clock-pendulum',
      }));
      const clock = makeWallClock(M, {
        x: kx, y: UY + 1.92, z: kz + 0.27, rotY: 0, r: 0.22,
      });
      root.add(clock.group);
      solid(kx - 0.36, kx + 0.36, UY, UY + 2.4, kz - 0.3, kz + 0.3);
    }

    curtains('z', r.z1 - 0.22, -4.0, UY + 0.6, 5.4, 3.4, M_CURTAIN_RED);
    curtains('z', r.z1 - 0.22, 4.0, UY + 0.6, 5.4, 3.4, M_CURTAIN_RED);
    wallArt('office-lou', -4.6, UY + 2.4, r.z0 + 0.2, 0, 1.2, 1.5,
      makePortraitTexture('lou-office', 'BIG UNCLE LOU', '#2a1c14'));
    /* The shield behind the desk. Lou's own wall in his own office is the
     * one place in the house the family badge has to be. Kept east of the
     * office door (x:-1.6..1.6) so it is not another picture over a doorway. */
    const officeShield = flatArt('mansion.office.shield', {
      x: 4.4,
      y: UY + 2.45,
      z: r.z0 + 0.2,
      rotY: 0,
      w: 1.45,
      h: 1.06,
      material: mat({
        map: squatchArt('mansion-office-shield', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'THE HOUSE', ink: '#e8c268', bg: '#1a1410',
        }),
        roughness: 0.85,
        unique: true,
      }),
    });
    root.add(box({
      size: [1.63, 1.24, 0.05], pos: [4.4, UY + 2.45, r.z0 + 0.16], mat: M_GOLD, cast: false,
    }));
    sconce(4.4, UY + 3.3, r.z0 + 0.06, 0, 1.8);
    /* Hog Mama, on the north pier. `assets/art/lou-office-hog-mama.png` was
     * named for this room and made for it and had never been hung anywhere in
     * the project -- one of only three files in assets/art/ placed nowhere at
     * all. It goes on the 3.2 m of solid wall between the office's two north
     * windows (the shell glazes x -6.4..-1.6 and 1.6..6.4, so x 0 is the one
     * unbroken pier on that wall), facing back down the room at the desk.
     * 0.9 x 1.35 because the file is 2000 x 3000 and `dressArtSlots` rebuilds
     * the plate to the image's own aspect -- declaring it square here would
     * make the swap visibly resize the picture. */
    const officeHogMama = wallArt('mansion.office.hogmama', 0, UY + 2.25, r.z1 - 0.12, Math.PI, 0.9, 1.35,
      makePortraitTexture('lou-hogmama', 'HOG MAMA', '#2a1a1e'));
    sconce(0, UY + 3.25, r.z1 - 0.06, Math.PI, 1.7);
    // Lou, again, over his own safe -- the east wall has no opening in it
    // anywhere, so this one is as far from a doorway as art gets in here.
    wallArt('office-safe-portrait', r.x1 - 0.11, UY + 2.15, safeZ + 0.15, -Math.PI / 2, 0.9, 1.1,
      makePortraitTexture('lou-safe', 'L. SPUTTHOLE', '#1e1712'));
    sconce(r.x1 - 0.06, UY + 3.0, safeZ + 0.15, -Math.PI / 2, 1.7);
    // The palm moved into the north-west corner: it used to stand at
    // (-5.6, 74.2), which is now the middle of the chesterfield.
    const plant = makePlant(M, { x: -7.9, z: 74.2, scale: 1.8 });
    const plantWrap = new THREE.Group();
    plantWrap.position.y = UY;
    plantWrap.add(plant.group);
    root.add(plantWrap);
    solid(-8.25, -7.55, UY, UY + 1.6, 73.85, 74.55);

    /* ---- Ceiling: a coffered tray in gold on warm plaster, and a chandelier
     * over the desk instead of the flush fitting that was there. The room is
     * 4.2 m to the ceiling; a house like this does not waste that. */
    /* NOTCHED ROUND THE CONCEALED STAIR HALL. The hall (x 6.25..8.85,
     * z 64.25..69.15 including its walls) is a full-height volume from this
     * floor to the suite's ceiling 7.8 m up — the flight has to come through
     * here, and 2.0 m of headroom over the top flight puts its ceiling well
     * above this one. So the office's coffered tray stops at the hall's west
     * wall, which is what a coffered tray does when it meets a wall. */
    const hallX = SUITE_STAIR_HALL.x0 - 0.3;    // outer face of the hall's west wall
    const hallZ0 = SUITE_STAIR_HALL.z0 - 0.3;
    const hallZ1 = SUITE_STAIR_HALL.z1 + 0.3;
    for (const [cx0, cx1, cz0, cz1] of [
      [r.x0 + 0.5, hallX, r.z0 + 0.5, r.z1 - 0.5],
      [hallX, r.x1 - 0.5, r.z0 + 0.5, hallZ0],
      [hallX, r.x1 - 0.5, hallZ1, r.z1 - 0.5],
    ]) topping(cx0, cx1, UCY - 0.18, cz0, cz1, M_WALL_WARM, 'office-ceiling');
    for (const bx of [-5.6, -1.9, 1.9, 5.6]) {
      root.add(box({
        size: [0.18, 0.22, r.z1 - r.z0 - 1.0], pos: [bx, UCY - 0.29, (r.z0 + r.z1) / 2], mat: M_GOLD, cast: false, name: 'office-coffer',
      }));
    }
    for (const bz of [65.0, 68.4, 71.8, 74.2]) {
      // The two that cross the hall die into its wall instead of through it.
      const bx1 = (bz > hallZ0 && bz < hallZ1) ? hallX : r.x1 - 0.5;
      root.add(box({
        size: [bx1 - (r.x0 + 0.5), 0.22, 0.18], pos: [(r.x0 + 0.5 + bx1) / 2, UCY - 0.29, bz], mat: M_GOLD, cast: false, name: 'office-coffer',
      }));
    }
    {
      // The chandelier: the foyer's, at two thirds scale, hung over the desk.
      const cy = UCY - 1.0;
      root.add(cylinder({ r: 0.04, h: 0.8, pos: [0, cy + 0.4, 70.2], mat: M_BRONZE }));
      for (const [ty, tr, tn] of [[0, 1.0, 8], [-0.32, 0.62, 6]]) {
        for (let i = 0; i < tn; i++) {
          const a = (i / tn) * Math.PI * 2;
          const bx = Math.cos(a) * tr;
          const bz = Math.sin(a) * tr;
          root.add(box({
            size: [tr * 0.9, 0.03, 0.03], pos: [bx / 2, cy + ty, 70.2 + bz / 2], mat: M_GOLD, rotY: a,
          }));
          root.add(cylinder({
            rTop: 0.085, rBottom: 0.11, h: 0.13, pos: [bx, cy + ty + 0.06, 70.2 + bz], mat: M_SHADE_CREAM,
          }));
          root.add(sphere({ r: 0.06, pos: [bx, cy + ty + 0.04, 70.2 + bz], mat: M_BULB_WARM, cast: false }));
          root.add(box({
            size: [0.02, 0.24, 0.02], pos: [bx * 0.86, cy + ty - 0.2, 70.2 + bz * 0.86], mat: M_CRYSTAL,
          }));
        }
      }
      root.add(sphere({ r: 0.13, pos: [0, cy - 0.56, 70.2], mat: M_GOLD }));
    }
    const ceil = new THREE.PointLight(0xffdca0, 6, 18, 2);
    ceil.position.set(0, UCY - 1.3, 70.2);
    root.add(ceil);
    ceilingLight(0, 74.2, UCY - 0.4, 0xffdca0, 4.2, 13);
    return {
      desk, deskLight, ceilingLight: ceil, fireGlow, shield: officeShield,
      hogMama: officeHogMama,
    };
  }
  const officeProps = buildOffice();

  /* ================================================================== */
  /* THE PRIVATE STAIR — bookcase, hall, half-turn flight                 */
  /*                                                                       */
  /* The reveal order the owner asked for is bookcase -> hidden stair ->    */
  /* the suite, so all three are built here in that order and nothing about */
  /* the suite is visible from the office.                                  */
  /*                                                                         */
  /* THE HALL. 2.30 x 4.30 m taken out of the office's east side, between    */
  /* the safe (which ends at z 64.20) and the chimneypiece (which starts at  */
  /* z 68.90) -- the one stretch of that wall with nothing on it. Its walls   */
  /* stop at UPPER_CEILING_Y so the roof slab lands on their heads; the       */
  /* volume above the opening is open to the suite's own ceiling 3.2 m        */
  /* higher, because a 12-riser flight climbing to 10.6 needs 2 m of          */
  /* headroom over its top tread and the office ceiling is at 10.2.           */
  /*                                                                           */
  /* THE DOOR IS IN THE CORNER ON PURPOSE. A bookcase in the middle of the run  */
  /* would open onto the third tread of the flight -- a 0.74 m step through a   */
  /* doorway. The hinge is the hall's own south jamb, so the leaf opens onto     */
  /* the 0.70 m of level lobby at the foot of the stair, which is what a door    */
  /* at the bottom of a staircase is.                                            */
  /* ================================================================== */
  function buildSecretStair() {
    const H = SUITE_STAIR_HALL;
    const D = SUITE_SECRET_DOOR;
    const WALL = 0.3;
    const LANDING_Y = SUITE_STAIR_LANDING_Y;      // 8.30
    const RISER = (SUITE_Y - UY) / 24;            // 0.191666..
    /** Underside of the roof slab: where the hall's walls stop. */
    const WALL_TOP = UCY;

    /* ---- The hall's three new walls. The fourth is the house's own east
     * wall, which the shell already built and already collides.
     *
     * Every one of them tops out at UCY = 10.2 rather than at the suite floor
     * 10.6, and that is not a rounding choice. `core/player.js` skips a
     * collider only when your feet are STRICTLY above its top, so a wall whose
     * top is exactly a floor's walking surface is an invisible wall on the
     * storey above it -- the fault that once made this house's entire upper
     * floor impassable, written up at the top of this file. Stopping on the
     * slab's underside is both the honest build and the safe one. */
    const wallSegs = [
      // South wall, off the safe's north face with 50 mm to spare.
      [H.x0 - WALL, H.x1, H.z0 - WALL, H.z0],
      // North wall, short of the chimneypiece's south pilaster at z = 68.90.
      [H.x0 - WALL, H.x1, H.z1, H.z1 + WALL],
    ];
    /* Every piece of this hall LAPS its neighbour by 20 mm instead of butting
     * flush against it. Two boxes sharing a square metre of face is the
     * flicker `tools/scene-audit.mjs` is looking for, and a stair hall is
     * nothing but boxes meeting each other. */
    const LAP = 0.02;
    for (const [wx0, wx1, wz0, wz1] of wallSegs) {
      const m = box({
        size: [wx1 - wx0, WALL_TOP - UY, wz1 - wz0],
        pos: [(wx0 + wx1) / 2, (UY + WALL_TOP) / 2, (wz0 + wz1) / 2],
        mat: M_WALL_DEEP,
        name: 'suite-stair-wall',
      });
      root.add(m);
      occluders.push(m);
      solid(wx0, wx1, UY, WALL_TOP, wz0, wz1);
    }
    /* The west wall — the bookcase wall — in two pieces, with the door's
     * opening between them. The leaf itself is built below and splices its own
     * collider in and out. */
    for (const [wz0, wz1] of [[H.z0 - LAP, D.z1 + LAP], [D.z1, H.z1 + LAP]]) {
      const isDoor = wz1 === D.z1 + LAP;
      if (isDoor) {
        // Over the door: the lintel band only, from the door head to the slab.
        root.add(box({
          size: [WALL, WALL_TOP - D.y1, wz1 - wz0],
          pos: [H.x0 - WALL / 2, (D.y1 + WALL_TOP) / 2, (wz0 + wz1) / 2],
          mat: M_WALL_DEEP,
          cast: false,
          name: 'suite-stair-lintel',
        }));
        solid(H.x0 - WALL, H.x0, D.y1, WALL_TOP, wz0, wz1);
        continue;
      }
      const m = box({
        size: [WALL, WALL_TOP - UY, wz1 - wz0],
        pos: [H.x0 - WALL / 2, (UY + WALL_TOP) / 2, (wz0 + wz1) / 2],
        mat: M_WALL_DEEP,
        name: 'suite-stair-wall',
      });
      root.add(m);
      occluders.push(m);
      solid(H.x0 - WALL, H.x0, UY, WALL_TOP, wz0, wz1);
    }

    /* ---- The bookcase run on the office side of that wall. Three bays,
     * built to the same recipe as the pair on the west wall (cornice, plinth,
     * gilt stiles, books on three shelves) so the alcove reads as more of the
     * same library rather than as a wall with a secret in it. The southernmost
     * bay is the door; nothing about it looks different, which is the point. */
    const bays = [
      { z: (D.z0 + D.z1) / 2, door: true, w: D.z1 - D.z0 - 0.04 },
      { z: 66.31, door: false, w: 1.6 },
      { z: 67.89, door: false, w: 1.6 },
    ];
    /** Build one bay's furniture into `parent`, centred on local origin. */
    function bookcaseBay(parent, width, tag) {
      /* Recessed 20 mm INTO the wall rather than planted on its face: a
       * fitted bookcase is a hole in the panelling with a carcass in it, and
       * a carcass whose back is flush with the plaster is the flicker. */
      parent.add(box({
        size: [0.38, 2.4, width], pos: [-0.21, 1.2, 0], mat: M_WOOD_DK, name: tag,
      }));
      for (let s = 0; s < 3; s++) {
        const books = makeBooks(M, {
          x: -0.13, y: 0.55 + s * 0.7, z: -width / 2 + 0.2, count: Math.round(width * 7), along: 'z',
        });
        parent.add(books.group);
      }
      // Cornice and plinth lap the carcass by 20 mm rather than sitting on it.
      parent.add(box({
        size: [0.52, 0.16, width + 0.16], pos: [-0.23, 2.46, 0], mat: M_WOOD_DK, cast: false, name: `${tag}-cornice`,
      }));
      parent.add(box({
        size: [0.5, 0.14, width + 0.1], pos: [-0.22, 0.09, 0], mat: M_WOOD_DK, cast: false,
      }));
      for (const oz of [-width / 2 + 0.04, width / 2 - 0.04]) {
        parent.add(box({
          size: [0.06, 2.3, 0.06], pos: [-0.01, 1.25, oz], mat: M_GOLD, cast: false,
        }));
      }
      parent.add(box({
        size: [0.03, 0.62, width - 0.16], pos: [-0.01, 1.98, 0], mat: M_GLASS_CASE, cast: false,
      }));
    }
    let secretDoorGroup = null;
    let secretDoorTarget = null;
    for (const bay of bays) {
      const width = bay.w;
      if (!bay.door) {
        const g = group('office-bookcase-alcove');
        g.position.set(H.x0, UY, bay.z);
        bookcaseBay(g, width, 'office-bookcase');
        root.add(g);
        solid(H.x0 - 0.5, H.x0, UY, UY + 2.4, bay.z - width / 2, bay.z + width / 2);
        continue;
      }
      /* THE LEAF. Its group origin is the HINGE — the hall's south jamb — so
       * `rotation.y` swings the case out into the office about the right edge
       * and nothing has to be re-measured when it moves. Local -z runs along
       * the wall toward the hinge, so the case is built centred half a leaf
       * north of the origin. */
      const g = group('office-secret-bookcase');
      g.position.set(H.x0, UY, D.z0 + 0.02);
      const leaf = group('secret-bookcase-leaf');
      leaf.position.set(0, 0, width / 2);
      bookcaseBay(leaf, width, 'office-bookcase-secret');
      g.add(leaf);
      root.add(g);
      secretDoorGroup = g;
      /* The thing you point at. An invisible slab standing just proud of the
       * books, so pointing at the bookcase means pointing at the bookcase and
       * not at whichever spine the ray happened to find. Registered ONCE by
       * the composition root -- `interaction.register` writes
       * `userData.interact`, and a second registration silently replaces the
       * first and leaves a stale row in its target list. */
      secretDoorTarget = box({
        size: [0.16, 2.3, width - 0.06], pos: [-0.06, 1.2, width / 2], mat: M_WOOD_DK, name: 'office-secret-bookcase-target',
      });
      secretDoorTarget.visible = false;
      g.add(secretDoorTarget);
    }

    /* TWO COLLIDERS, ONE AT A TIME, AND THEY LIVE IN MORE THAN ONE LIST.
     *
     * Shut, the leaf fills the opening. Open, it is a quarter of a tonne of
     * oak standing out in the office, which is also solid -- a door you can
     * walk through when it is open is only half a door.
     *
     * THE LIST IS THE TRAP. This module owns `colliders`, and the composition
     * root MERGES it into a new array (`[...grounds.colliders,
     * ...interior.colliders]`); it is that COPY the Player reads every frame.
     * Splicing only this module's array is therefore a bookcase that opens on
     * screen and stays shut under your feet -- which is exactly what the first
     * build of this did, and what the verifier's on-foot climb caught two
     * minutes later. `bindColliders` is how the root joins the splice. */
    const shutCollider = collider(
      [H.x0 - 0.5, UY, D.z0], [H.x0, D.y1, D.z1],
    );
    /* The leaf where it comes to rest, measured off OPEN_ANGLE rather than
     * guessed: at -1.45 rad the carcass lies from x 5.65 to the wall face and
     * from z 64.15 to 64.67, which leaves 0.78 m of clear opening -- a player
     * is 0.60 m across. */
    const openCollider = collider(
      [H.x0 - 0.90, UY, 64.15], [H.x0, D.y1, 64.67],
    );
    let doorOpen = false;
    let doorT = 0;                      // 0 shut, 1 open — smoothed
    const colliderLists = [colliders];
    colliders.push(shutCollider);
    doors.officeSecretBookcase = {
      id: 'officeSecretBookcase',
      x: H.x0, y: UY, z: (D.z0 + D.z1) / 2,
      x0: H.x0 - 0.5, x1: H.x0, y0: UY, y1: D.y1, z0: D.z0, z1: D.z1,
      get open() { return doorOpen; },
    };

    /* ---- The flights. Twelve risers each; the twelfth of the first lands on
     * the half-landing and the twelfth of the second lands on the suite floor,
     * which is why each flight draws eleven treads and not twelve. */
    const GOING = (SUITE_FLIGHT_A.z1 - SUITE_FLIGHT_A.z0) / 11;
    /** One flight. `dir` is +1 for rising northward, -1 for rising south. */
    function flight(rect, yBase, dir, tag) {
      const w = rect.x1 - rect.x0;
      const cx = (rect.x0 + rect.x1) / 2;
      for (let k = 1; k <= 11; k++) {
        const top = yBase + k * RISER;
        const near = dir > 0 ? rect.z0 + (k - 1) * GOING : rect.z1 - (k - 1) * GOING;
        const zc = near + dir * GOING / 2;
        root.add(box({
          size: [w, 0.12, GOING + 0.04],
          pos: [cx, top - 0.06, zc],
          mat: M_MARBLE,
          name: `${tag}-tread`,
        }));
        /* Bottom of the riser on the tread below it (and, for the first
         * one, on the floor), rather than 60 mm under it in mid-air. */
        root.add(box({
          size: [w, RISER, 0.05],
          pos: [cx, top - RISER / 2, near - dir * 0.02],
          mat: M_MARBLE_DK,
          cast: false,
          name: `${tag}-riser`,
        }));
        // Gilt nosing and a velvet runner: this is Lou's own stair.
        root.add(box({
          size: [w, 0.02, 0.05],
          pos: [cx, top + 0.005, near + dir * (GOING - 0.03)],
          mat: M_GOLD,
          cast: false,
          name: `${tag}-nosing`,
        }));
        root.add(box({
          size: [w * 0.66, 0.015, GOING + 0.04],
          pos: [cx, top + 0.012, zc],
          mat: M_SUITE_VELVET,
          cast: false,
          name: `${tag}-runner`,
        }));
      }
      /* The closed string under the flight, and its collider on the OPEN
       * flank only. A collider under the whole footprint would put the next
       * tread's own mass above the climber's feet and the stair would block
       * itself -- the note on `stairFlight` above has the arithmetic. */
      root.add(box({
        size: [w + 0.06, 0.5, rect.z1 - rect.z0],
        pos: [cx, yBase + RISER * 5.5 - 0.42, (rect.z0 + rect.z1) / 2],
        mat: M_WOOD_DK,
        cast: false,
        name: `${tag}-string`,
      }));
    }
    flight(SUITE_FLIGHT_A, UY, 1, 'suite-stair-a');
    flight(SUITE_FLIGHT_B, LANDING_Y, -1, 'suite-stair-b');

    // The half-landing, and the marble lobby at the foot.
    const L = SUITE_HALF_LANDING;
    root.add(box({
      size: [L.x1 - L.x0, 0.16, L.z1 - L.z0 + LAP],
      pos: [(L.x0 + L.x1) / 2, LANDING_Y - 0.08, (L.z0 + L.z1) / 2 + LAP / 2],
      mat: M_MARBLE,
      name: 'suite-stair-landing',
    }));
    root.add(box({
      size: [L.x1 - L.x0 - 0.04, 0.62, L.z1 - L.z0 + LAP],
      pos: [(L.x0 + L.x1) / 2, LANDING_Y - 0.45, (L.z0 + L.z1) / 2 + LAP / 2],
      mat: M_WOOD_DK,
      cast: false,
      name: 'suite-stair-landing-soffit',
    }));
    topping(H.x0, H.x1, UY + 0.032, H.z0, SUITE_FLIGHT_A.z0, M_MARBLE, 'suite-stair-lobby');

    /* ---- Balustrades. The raking pair follow the two flights on their open
     * flanks; the level pair guard the well from the suite floor above.
     * `rakingRail` takes a z -> y function, which is exactly the same lerp
     * `floorAt` below resolves the flight with, so the handrail and the floor
     * can never be at two different heights. */
    const flightAY = (z) => THREE.MathUtils.lerp(
      UY, LANDING_Y,
      THREE.MathUtils.clamp((z - SUITE_FLIGHT_A.z0) / (SUITE_FLIGHT_A.z1 - SUITE_FLIGHT_A.z0), 0, 1),
    );
    const flightBY = (z) => THREE.MathUtils.lerp(
      LANDING_Y, SUITE_Y,
      THREE.MathUtils.clamp((SUITE_FLIGHT_B.z1 - z) / (SUITE_FLIGHT_B.z1 - SUITE_FLIGHT_B.z0), 0, 1),
    );
    rakingRail(SUITE_FLIGHT_A.x1 + 0.02, SUITE_FLIGHT_A.z0, SUITE_FLIGHT_A.z1, flightAY, 'suite-stair-a');
    rakingRail(SUITE_FLIGHT_B.x0 - 0.05, SUITE_FLIGHT_B.z0, SUITE_FLIGHT_B.z1, flightBY, 'suite-stair-b');

    /* ---- Light in the shaft. One lantern hung in the well, seen from the
     * office the instant the bookcase swings, which is what makes the reveal
     * a reveal rather than a dark hole in a wall. */
    const lanternY = SUITE_CEILING_Y - 1.1;
    const lanternZ = (SUITE_FLIGHT_A.z0 + SUITE_FLIGHT_A.z1) / 2;
    root.add(named(cylinder({
      r: 0.02, h: 1.5, pos: [7.7, lanternY + 0.9, lanternZ], mat: M_GOLD,
    }), 'suite-stair-lantern-chain'));
    root.add(box({
      size: [0.42, 0.6, 0.42], pos: [7.7, lanternY, lanternZ], mat: M_GLASS_CASE, name: 'suite-stair-lantern',
    }));
    for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      root.add(box({
        size: [0.05, 0.66, 0.05], pos: [7.7 + ox, lanternY, lanternZ + oz], mat: M_GOLD, cast: false,
      }));
    }
    root.add(sphere({ r: 0.09, pos: [7.7, lanternY - 0.02, lanternZ], mat: M_BULB_WARM, cast: false }));
    const lantern = new THREE.PointLight(0xffd2a0, 4.2, 12, 2);
    lantern.position.set(7.7, lanternY - 0.1, lanternZ);
    root.add(lantern);
    sconce(H.x1 - 0.06, LANDING_Y + 1.5, L.z1 - 0.5, -Math.PI / 2, 1.6);

    /* ================================================================ */
    /* The leaf's behaviour                                             */
    /* ================================================================ */
    const OPEN_ANGLE = -1.45;   // ~83 degrees, swinging out into the office
    /** Take `box` out of every bound list; put it into every one it is not in. */
    function setBox(box, present) {
      for (const list of colliderLists) {
        const at = list.indexOf(box);
        if (present && at < 0) list.push(box);
        if (!present && at >= 0) list.splice(at, 1);
      }
    }
    function setSecretDoor(open) {
      if (open === doorOpen) return doorOpen;
      doorOpen = open;
      setBox(shutCollider, !open);
      setBox(openCollider, open);
      return doorOpen;
    }
    /**
     * Join a second collider array to the splice.
     *
     * Syncs on the way in, so a list handed over while the leaf is already
     * open does not inherit the shut box -- a copy taken at build time always
     * has it.
     */
    function bindColliders(list) {
      if (!Array.isArray(list) || colliderLists.includes(list)) return;
      colliderLists.push(list);
      const shutAt = list.indexOf(shutCollider);
      if (doorOpen && shutAt >= 0) list.splice(shutAt, 1);
      if (!doorOpen && shutAt < 0) list.push(shutCollider);
      const openAt = list.indexOf(openCollider);
      if (doorOpen && openAt < 0) list.push(openCollider);
      if (!doorOpen && openAt >= 0) list.splice(openAt, 1);
    }
    function updateSecretDoor(dt) {
      const want = doorOpen ? 1 : 0;
      if (doorT === want) return;
      const step = dt / 1.1;
      doorT = want > doorT ? Math.min(want, doorT + step) : Math.max(want, doorT - step);
      if (secretDoorGroup) {
        // Eased, so a two-hundred-kilo bookcase does not snap.
        const e = doorT * doorT * (3 - 2 * doorT);
        secretDoorGroup.rotation.y = OPEN_ANGLE * e;
      }
    }

    return {
      hall: H,
      target: secretDoorTarget,
      group: secretDoorGroup,
      lantern,
      isOpen: () => doorOpen,
      setOpen: setSecretDoor,
      toggle: () => setSecretDoor(!doorOpen),
      update: updateSecretDoor,
      bindColliders,
      /** Where the flights actually land, for a verifier that walks them. */
      geometry: {
        lobby: { x: (H.x0 + H.x1) / 2, y: UY, z: (H.z0 + SUITE_FLIGHT_A.z0) / 2 },
        landingY: LANDING_Y,
        riser: RISER,
        going: GOING,
        arrival: {
          x: (SUITE_FLIGHT_B.x0 + SUITE_FLIGHT_B.x1) / 2, y: SUITE_Y, z: SUITE_FLIGHT_B.z0 - 0.35,
        },
      },
    };
  }
  const secretStair = buildSecretStair();

  /* ================================================================== */
  /* THE MASTER SUITE — THE WHOLE THIRD FLOOR                             */
  /*                                                                       */
  /* Owner, verbatim: "ultra over-the-top luxury bedroom, hot tub with      */
  /* girls, the dog, and everything. Canopy bed. Big TV. Cool lighting."    */
  /*                                                                         */
  /* Played straight, per docs/TONE-AND-PARODY.md: this is a rich man's       */
  /* bedroom built the way a rich man's bedroom is built, and the joke is     */
  /* that it is at the top of a hidden stair in a Sasquatch mob boss's        */
  /* house. Nothing in here winks at that.                                    */
  /*                                                                           */
  /* THE PLAN, west to east. The stair arrives in the south-east corner, so     */
  /* the sequence walking in is: arrival, the dressing run, the bed, and then   */
  /* the room opens north into the glazing.                                     */
  /*                                                                             */
  /*   x -8.85..-6  the wet bar on the west wall, the crest over it              */
  /*   x -6..-2     a seating group facing the television                        */
  /*   x -1.1..1.1  the canopy bed, head on the blind south wall, facing north   */
  /*   x  1.9..5.9  the fitted dressing run, the first thing off the stair       */
  /*   x  3.3..7.5  the hot tub, north-east, in front of the garden glazing      */
  /*   x  6.55..8.85 the stair well and its balustrade                           */
  /*                                                                              */
  /* WHY THE TELEVISION IS ON THE GLAZED WALL. "Big TV wall-mounted opposite      */
  /* the bed" and "windows over the rear garden" both point at the north          */
  /* elevation, and only one of them can have the middle of it. The shell         */
  /* therefore glazes x -8.0..-2.8 and 2.8..8.0 and leaves a 5.6 m pier at        */
  /* dead centre; the bed's head is on the south wall on the same centre line,    */
  /* so the set is opposite the bed at 9 m and the garden is either side of it.   */
  /*                                                                               */
  /* THE CANOPY IS MEASURED, NOT EYEBALLED. The gothic bedroom downstairs has      */
  /* the history: a tester has to ENCLOSE the posts, which have to enclose the     */
  /* mattress, or the bed is standing beside its own canopy. Here the mattress     */
  /* is 2.20 x 2.40, the posts stand on 2.50 x 2.60 and the tester measures        */
  /* 2.90 x 3.00, so every one of the three plans contains the one inside it with  */
  /* 0.15-0.20 m to spare, and `verify:mansion` asserts exactly that off the       */
  /* built world boxes rather than off these numbers.                              */
  /* ================================================================== */
  function buildMasterSuite() {
    const r = MASTER_SUITE;
    const SY = SUITE_Y;                 // 10.6 — the floor
    const SCY = SUITE_CEILING_Y;        // 13.8 — the ceiling
    const W = SUITE_STAIR_WELL;
    const props = {};

    trimRoom(r, SY, SCY);

    /* ---- Floor. Marble field, notched round the stair well, with a dark
     * border and the carpet laid over the middle of it. */
    /* Held 30 mm off the room's own edges: the skirting `trimRoom` lays runs
     * from the wall face inwards, and a floor finish that meets it exactly is
     * a flush pair the length of the room. The reveal is under the skirting. */
    const fr = {
      x0: r.x0 + 0.03, x1: r.x1 - 0.03, z0: r.z0 + 0.03, z1: r.z1 - 0.03,
    };
    for (const [fx0, fx1, fz0, fz1] of [
      [fr.x0, W.x0, fr.z0, fr.z1],
      [W.x0, fr.x1, fr.z0, W.z0],
      [W.x0, fr.x1, W.z1, fr.z1],
    ]) topping(fx0, fx1, SY + 0.021, fz0, fz1, M_SUITE_MARBLE, 'suite-floor');
    for (const [bx0, bx1, bz0, bz1] of [
      [fr.x0 + 0.5, fr.x1 - 0.5, fr.z0 + 0.5, fr.z0 + 0.78],
      [fr.x0 + 0.5, fr.x1 - 0.5, fr.z1 - 0.78, fr.z1 - 0.5],
      [fr.x0 + 0.5, fr.x0 + 0.78, fr.z0 + 0.5, fr.z1 - 0.5],
    ]) topping(bx0, bx1, SY + 0.036, bz0, bz1, M_SUITE_ONYX, 'suite-floor-border');
    rug(-1.2, 69.6, 11.0, 10.4, SY + 0.05, M_SUITE_CARPET);

    /* THE CREST, IN THE FLOOR AT THE HEAD OF THE STAIR. The one place in this
     * room a badge belongs: it is what you are standing on when you come up
     * out of the bookcase, and it is not another logo hung on another wall
     * (the fault the owner named after the last art pass). */
    const crestC = [7.7, 64.28];
    const inlay = new THREE.Mesh(new THREE.CircleGeometry(0.86, 36), M_SUITE_ONYX);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(crestC[0], SY + 0.056, crestC[1]);
    inlay.name = 'suite-crest-inlay';
    root.add(inlay);
    for (const [rIn, rOut, ry, rn] of [[0.74, 0.81, 0.060, 'outer'], [0.26, 0.30, 0.064, 'inner']]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 36), M_GOLD);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(crestC[0], SY + ry, crestC[1]);
      ring.name = `suite-crest-ring-${rn}`;
      root.add(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      root.add(box({
        size: [i % 2 ? 0.28 : 0.5, 0.005, 0.06],
        pos: [crestC[0] + Math.cos(a) * 0.53, SY + 0.068, crestC[1] + Math.sin(a) * 0.53],
        mat: M_GOLD,
        rotY: -a,
        cast: false,
        name: 'suite-crest-ray',
      }));
    }

    /* ---- Walls: full-height fielded panelling in velvet-dark timber with
     * gilt bead, on the two blind stretches (the south wall, and the piers
     * between the glazing). The glazed walls get a pilaster order instead so
     * the room does not read as a padded cell. */
    root.add(box({
      size: [r.x1 - r.x0 - 0.3, 3.0, 0.07],
      pos: [(r.x0 + r.x1) / 2, SY + 1.55, r.z0 + 0.05],
      mat: M_WOOD_DK,
      cast: false,
      name: 'suite-panelling',
    }));
    for (let i = 0; i < 10; i++) {
      const px = r.x0 + 1.1 + i * 1.72;
      for (const [oy, ox, sy, sx] of [
        [1.05, 0, 0.05, 1.24], [-1.05, 0, 0.05, 1.24], [0, 0.62, 2.15, 0.05], [0, -0.62, 2.15, 0.05],
      ]) {
        root.add(box({
          size: [sx, sy, 0.05], pos: [px + ox, SY + 1.55 + oy, r.z0 + 0.1], mat: M_GOLD, cast: false, name: 'suite-panel-bead',
        }));
      }
    }
    /* The pilaster order goes ONLY where each flank wall is genuinely
     * blind — the west is glazed z 63.6..67.4 and carries the bar's mirror
     * z 68.9..73.1; the east is glazed z 70.2..74.0 and open to the stair
     * well z 65.25..69.15. A pilaster drawn across either would be a
     * mahogany strip standing in a window. */
    for (const [side, zs] of [[-1, [68.05, 74.2]], [1, [63.9, 69.7]]]) {
      for (const pz of zs) {
        root.add(box({
          size: [0.1, 2.9, 0.34], pos: [side * (r.x1 - 0.05), SY + 1.5, pz], mat: M_WOOD_DK, cast: false, name: 'suite-pilaster',
        }));
        root.add(box({
          size: [0.14, 0.1, 0.42], pos: [side * (r.x1 - 0.07), SY + 2.98, pz], mat: M_GOLD, cast: false, name: 'suite-pilaster-cap',
        }));
      }
      root.add(box({
        size: [0.13, 0.2, r.z1 - r.z0], pos: [side * (r.x1 - 0.06), SCY - 0.4, (r.z0 + r.z1) / 2], mat: M_TRIM, cast: false, name: 'suite-cornice',
      }));
    }

    /* ================================================================ */
    /* COOL LIGHTING                                                    */
    /*                                                                   */
    /* Four layers, and each one is doing a different job:               */
    /*                                                                    */
    /*  1. A COVE round the whole perimeter — an emissive band tucked      */
    /*     behind a plaster upstand so you see the light and not the       */
    /*     fitting, plus four soft point lights inside it. It is at        */
    /*     emissiveIntensity 0.55, UNDER the scene's bloom threshold of    */
    /*     1.15, because 36 m of blooming perimeter is fog, not glamour.   */
    /*  2. WARM SCONCES, dimmed to 1.2-1.5 against the 1.7-2.4 the rest of */
    /*     the house runs at. A bedroom is not a gallery.                  */
    /*  3. The TUB's own underwater light, which IS over the threshold and  */
    /*     is meant to flare — it is small, it is 2 m from anything else,   */
    /*     and an unlit hot tub at night reads as a hole.                   */
    /*  4. The TELEVISION, lit by `src/mansion/main.js` off the picture      */
    /*     rather than by anything here.                                    */
    /* ================================================================ */
    const COVE_Y = SCY - 0.42;
    const coveInset = 0.55;
    const coveLights = [];
    for (const [cx0, cx1, cz0, cz1] of [
      [r.x0 + coveInset, r.x1 - coveInset, r.z0 + coveInset, r.z0 + coveInset + 0.12],
      [r.x0 + coveInset, r.x1 - coveInset, r.z1 - coveInset - 0.12, r.z1 - coveInset],
      [r.x0 + coveInset, r.x0 + coveInset + 0.12, r.z0 + coveInset, r.z1 - coveInset],
      [r.x1 - coveInset - 0.12, r.x1 - coveInset, r.z0 + coveInset, r.z1 - coveInset],
    ]) {
      // The upstand you actually see, and the strip hidden behind it.
      root.add(box({
        size: [cx1 - cx0, 0.26, cz1 - cz0],
        pos: [(cx0 + cx1) / 2, COVE_Y, (cz0 + cz1) / 2],
        mat: M_TRIM,
        cast: false,
        name: 'suite-cove-upstand',
      }));
      root.add(box({
        size: [cx1 - cx0 - 0.02, 0.05, cz1 - cz0 - 0.02],
        pos: [(cx0 + cx1) / 2, COVE_Y + 0.16, (cz0 + cz1) / 2],
        mat: M_SUITE_COVE,
        cast: false,
        name: 'suite-cove-led',
      }));
    }
    for (const [lx, lz] of [[-5.4, 66.0], [5.4, 66.0], [-5.4, 72.4], [5.4, 72.4]]) {
      const l = new THREE.PointLight(0xffc178, 2.6, 13, 2);
      l.position.set(lx, COVE_Y + 0.3, lz);
      root.add(l);
      coveLights.push(l);
    }

    /* ---- Ceiling: a shallow tray inside the cove, in warm plaster. */
    topping(r.x0 + coveInset + 0.12, r.x1 - coveInset - 0.12, SCY - 0.18,
      r.z0 + coveInset + 0.12, r.z1 - coveInset - 0.12, M_WALL_WARM, 'suite-ceiling');
    for (const bx of [-4.4, 0, 4.4]) {
      root.add(box({
        size: [0.16, 0.2, r.z1 - r.z0 - 2.0], pos: [bx, SCY - 0.28, (r.z0 + r.z1) / 2], mat: M_GOLD, cast: false, name: 'suite-ceiling-beam',
      }));
    }

    /* ================================================================ */
    /* THE CANOPY BED                                                    */
    /*                                                                    */
    /* WRITTEN AS THREE EXPLICIT PLANS, NOT AS OFFSETS OFF ONE CENTRE.     */
    /* The gothic bedroom downstairs bought this the hard way: a tester    */
    /* sized off the bed rather than off the POSTS leaves the bed standing */
    /* beside its own canopy. Each plan below has to contain the one       */
    /* inside it, the numbers say so on their face, and `verify:mansion`   */
    /* re-derives all three from the built world boxes and asserts it.     */
    /*                                                                      */
    /*   mattress  x -1.10..1.10    z 63.54..65.94   (2.20 x 2.40)           */
    /*   posts     x -1.405..1.405  z 63.375..66.105 (2.81 x 2.73)           */
    /*   tester    x -1.56..1.56    z 63.34..66.20   (3.12 x 2.86)           */
    /*                                                                       */
    /* The tester's south edge stops at 63.34 rather than symmetrically      */
    /* about the bed because the south wall's gilt panel beads stand proud    */
    /* to z = 63.275, and a symmetric tester would have run through them.     */
    /* ================================================================ */
    const BED = { x0: -1.10, x1: 1.10, z0: 63.54, z1: 65.94 };
    const POSTS = { x: [-1.34, 1.34], z: [63.44, 66.04], t: 0.13 };
    const TESTER = {
      x0: -1.56, x1: 1.56, z0: 63.34, z1: 66.20, y: SY + 2.35,
    };
    const bedX = (BED.x0 + BED.x1) / 2;
    const bedZ = (BED.z0 + BED.z1) / 2;
    const TESTER_Y = TESTER.y;
    props.bedCentre = { x: bedX, y: SY, z: bedZ };
    props.bed = { mattress: { ...BED }, posts: { ...POSTS }, tester: { ...TESTER } };

    // Base, mattress, bedding.
    root.add(box({
      size: [BED.x1 - BED.x0 + 0.16, 0.32, BED.z1 - BED.z0 + 0.10],
      pos: [bedX, SY + 0.16, bedZ + 0.02], mat: M_WOOD_DK, name: 'suite-bed-base',
    }));
    root.add(box({
      size: [BED.x1 - BED.x0, 0.42, BED.z1 - BED.z0], pos: [bedX, SY + 0.51, bedZ], mat: M_TRIM, name: 'suite-bed-mattress',
    }));
    root.add(box({
      size: [BED.x1 - BED.x0 - 0.08, 0.1, BED.z1 - BED.z0 - 0.6], pos: [bedX, SY + 0.78, bedZ + 0.24], mat: M_SUITE_SILK, cast: false, name: 'suite-bed-duvet',
    }));
    root.add(box({
      size: [BED.x1 - BED.x0, 0.09, 0.86], pos: [bedX, SY + 0.8, BED.z1 - 0.5], mat: M_SUITE_VELVET, cast: false, name: 'suite-bed-throw',
    }));
    for (const px of [-0.5, 0.5]) {
      root.add(box({
        size: [0.78, 0.16, 0.42], pos: [bedX + px, SY + 0.82, BED.z0 + 0.34], mat: M_TRIM, cast: false, name: 'suite-bed-pillow',
      }));
      root.add(box({
        size: [0.6, 0.14, 0.32], pos: [bedX + px, SY + 0.95, BED.z0 + 0.44], mat: M_SUITE_SILK, cast: false, name: 'suite-bed-cushion',
      }));
    }

    /* The headboard stands BETWEEN the head posts, which is where a
     * four-poster's headboard goes: 2.20 wide inside a 2.68 post spacing, and
     * 0.045 clear of the panel beads behind it. */
    const hbZ = 63.46;              // centre; 0.28 deep, so z 63.32..63.60
    root.add(box({
      size: [2.20, 1.86, 0.28], pos: [bedX, SY + 1.25, hbZ], mat: M_SUITE_VELVET, name: 'suite-bed-headboard',
    }));
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        root.add(sphere({
          r: 0.032, pos: [bedX + (i - 2) * 0.44, SY + 0.85 + j * 0.44, hbZ + 0.16], mat: M_GOLD, cast: false, name: 'suite-headboard-button',
        }));
      }
    }
    root.add(box({
      size: [2.30, 0.1, 0.34], pos: [bedX, SY + 2.22, hbZ], mat: M_GOLD, cast: false, name: 'suite-headboard-cap',
    }));

    // The four posts, and the velvet hung at each corner.
    for (const px of POSTS.x) {
      for (const pz of POSTS.z) {
        root.add(box({
          size: [POSTS.t, TESTER_Y - SY, POSTS.t], pos: [px, SY + (TESTER_Y - SY) / 2, pz], mat: M_WOOD_DK, name: 'suite-bedpost',
        }));
        root.add(named(cylinder({
          rTop: 0.05, rBottom: 0.085, h: 0.22, pos: [px, SY + 0.11, pz], mat: M_GOLD,
        }), 'suite-bedpost-base'));
        root.add(named(cylinder({
          r: 0.055, h: 0.16, pos: [px, TESTER_Y - 0.5, pz], mat: M_GOLD, cast: false,
        }), 'suite-bedpost-collar'));
        root.add(box({
          size: [0.20, TESTER_Y - SY - 0.26, 0.20],
          pos: [px + Math.sign(px) * 0.06, SY + (TESTER_Y - SY) / 2 + 0.13, pz],
          mat: M_SUITE_VELVET_DK,
          cast: false,
          name: 'suite-bed-drape',
        }));
      }
    }

    // The tester, its valance and its cornice, all built from TESTER's plan.
    const tsX = (TESTER.x0 + TESTER.x1) / 2;
    const tsZ = (TESTER.z0 + TESTER.z1) / 2;
    root.add(box({
      size: [TESTER.x1 - TESTER.x0, 0.14, TESTER.z1 - TESTER.z0],
      pos: [tsX, TESTER_Y, tsZ], mat: M_WOOD_DK, name: 'suite-tester',
    }));
    root.add(box({
      size: [TESTER.x1 - TESTER.x0 + 0.12, 0.2, TESTER.z1 - TESTER.z0 + 0.06],
      pos: [tsX, TESTER_Y + 0.15, tsZ + 0.03], mat: M_SUITE_VELVET, cast: false, name: 'suite-tester-valance',
    }));
    root.add(box({
      size: [TESTER.x1 - TESTER.x0 - 0.14, 0.05, TESTER.z1 - TESTER.z0 - 0.14],
      pos: [tsX, TESTER_Y + 0.28, tsZ], mat: M_GOLD, cast: false, name: 'suite-tester-cornice',
    }));
    // The canopy's own soffit, which is what you see from the pillow.
    root.add(box({
      size: [TESTER.x1 - TESTER.x0 - 0.2, 0.03, TESTER.z1 - TESTER.z0 - 0.2],
      pos: [tsX, TESTER_Y - 0.09, tsZ], mat: M_SUITE_SILK, cast: false, name: 'suite-tester-soffit',
    }));
    /* The collider goes up with the frame: a four-poster is not something you
     * walk through, and a collider that stopped at mattress height would let
     * the camera come out through the tester. */
    solid(TESTER.x0, TESTER.x1, SY, TESTER_Y + 0.3, TESTER.z0, TESTER.z1);

    // Two nightstands with reading lamps, outside the posts and clear of them.
    for (const side of [-1, 1]) {
      const nx = side * 2.02;
      const nz = 63.82;
      caseFurniture(nx, nz, SY, 0.72, 0.5, 0.58, 0, 2, M_SUITE_ONYX);
      root.add(named(cylinder({
        r: 0.05, h: 0.42, pos: [nx, SY + 0.79, nz], mat: M_GOLD,
      }), 'suite-lamp-stem'));
      root.add(named(cylinder({
        rTop: 0.13, rBottom: 0.17, h: 0.2, pos: [nx, SY + 1.08, nz], mat: M_SHADE_CREAM,
      }), 'suite-lamp-shade'));
      root.add(sphere({
        r: 0.05, pos: [nx, SY + 1.06, nz], mat: M_BULB_WARM, cast: false,
      }));
      const l = new THREE.PointLight(0xffca8a, 1.5, 6, 2);
      l.position.set(nx, SY + 1.12, nz);
      root.add(l);
    }

    /* ================================================================ */
    /* LIL TOM CRUZE'S CUSHION                                          */
    /*                                                                   */
    /* The dog is `src/mansion/dog.js` — an existing module, built to the */
    /* owner's own brief and never mounted by anything. This is the       */
    /* cushion it now sleeps on; the composition root mounts him on it    */
    /* and his route's last waypoint is this exact spot, so the two       */
    /* cannot drift.                                                      */
    /* ================================================================ */
    const cushion = { x: 2.85, y: SY, z: 65.9 };
    props.dogCushion = cushion;
    root.add(box({
      size: [1.3, 0.14, 1.05], pos: [cushion.x, SY + 0.07, cushion.z], mat: M_SUITE_VELVET, name: 'suite-dog-cushion',
    }));
    root.add(box({
      size: [1.38, 0.06, 1.13], pos: [cushion.x, SY + 0.03, cushion.z], mat: M_GOLD, cast: false, name: 'suite-dog-cushion-piping',
    }));
    for (const [bx, bz] of [[cushion.x - 0.92, cushion.z + 0.16], [cushion.x + 0.92, cushion.z + 0.16]]) {
      root.add(named(cylinder({
        r: 0.15, h: 0.1, pos: [bx, SY + 0.05, bz], mat: M_SUITE_ONYX,
      }), 'suite-dog-bowl'));
      root.add(named(cylinder({
        r: 0.13, h: 0.03, pos: [bx, SY + 0.1, bz], mat: M_GOLD, cast: false,
      }), 'suite-dog-bowl-rim'));
    }

    /* ================================================================ */
    /* THE TELEVISION — wall-mounted on the north pier, facing the bed    */
    /* ================================================================ */
    const tvW = 2.6;
    const tvH = 1.46;
    const tvY = SY + 1.72;
    const tvZ = r.z1 - 0.1;
    root.add(box({
      size: [tvW + 0.12, tvH + 0.12, 0.09], pos: [bedX, tvY, tvZ], mat: M_STOVE_BLACK, name: 'suite-tv-bezel',
    }));
    root.add(box({
      size: [tvW + 0.22, tvH + 0.22, 0.04], pos: [bedX, tvY, tvZ + 0.03], mat: M_GOLD, cast: false, name: 'suite-tv-frame',
    }));
    const tvScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(tvW, tvH),
      mat({ color: 0x05070a, roughness: 0.22, unique: true }),
    );
    tvScreen.position.set(bedX, tvY, tvZ - 0.05);
    tvScreen.rotation.y = Math.PI;
    tvScreen.name = 'suite-tv-screen';
    root.add(tvScreen);
    props.tv = { screen: tvScreen };
    // A low onyx media console under it, and a soundbar on the wall.
    caseFurniture(bedX, tvZ - 0.34, SY, 3.4, 0.56, 0.5, 0, 3, M_SUITE_ONYX);
    root.add(box({
      size: [2.2, 0.11, 0.11], pos: [bedX, SY + 0.86, tvZ - 0.06], mat: M_STOVE_BLACK, cast: false, name: 'suite-tv-soundbar',
    }));

    /* ================================================================ */
    /* THE HOT TUB                                                       */
    /*                                                                    */
    /* Same animated-water material the pool and the fountain outside use  */
    /* (`makeWaterMaterial`, exported from MansionGrounds.js for this), so */
    /* there is one water shader in this scene and not two. `update()`     */
    /* below advances its clock; a verifier reads the same uniform.        */
    /*                                                                      */
    /* Sections, bottom up: a marble drum on the floor, a tiled tank inside  */
    /* it, a bench ring at 0.42 above the tank floor (which is a seat        */
    /* height, and the height `Npc.sit()` folds to), water at 0.72, and the  */
    /* coping at 0.88. Sitting on the bench that puts the water across the   */
    /* chest, which is where hot-tub water goes.                            */
    /* ================================================================ */
    const tubX = 5.4;
    const tubZ = 71.7;
    const TUB_R = 2.05;                 // outer radius of the marble drum
    const TUB_IN = 1.62;                // inner radius of the tank
    const TUB_FLOOR = SY + 0.16;
    const TUB_BENCH = TUB_FLOOR + 0.42;
    const TUB_WATER = TUB_FLOOR + 0.72;
    const TUB_RIM = TUB_FLOOR + 0.88;
    props.tub = {
      x: tubX, z: tubZ, r: TUB_R, waterY: TUB_WATER, benchY: TUB_BENCH, floorY: TUB_FLOOR,
    };
    root.add(named(cylinder({
      r: TUB_R, h: TUB_RIM - SY, pos: [tubX, (SY + TUB_RIM) / 2, tubZ], mat: M_SUITE_MARBLE,
    }), 'suite-tub-drum'));
    root.add(named(cylinder({
      r: TUB_R + 0.09, h: 0.09, pos: [tubX, TUB_RIM + 0.04, tubZ], mat: M_GOLD, cast: false,
    }), 'suite-tub-coping'));
    root.add(named(cylinder({
      r: TUB_IN, h: TUB_RIM - TUB_FLOOR + 0.1, pos: [tubX, (TUB_FLOOR + TUB_RIM) / 2, tubZ], mat: M_SUITE_ONYX, cast: false,
    }), 'suite-tub-tank'));
    root.add(named(cylinder({
      r: TUB_IN - 0.01, h: 0.06, pos: [tubX, TUB_FLOOR, tubZ], mat: M_SUITE_ONYX, cast: false,
    }), 'suite-tub-tank-floor'));
    // The bench ring the two of them are sitting on.
    root.add(named(cylinder({
      r: TUB_IN - 0.03, h: 0.1, pos: [tubX, TUB_BENCH, tubZ], mat: M_SUITE_ONYX, cast: false,
    }), 'suite-tub-bench'));
    root.add(named(cylinder({
      r: TUB_IN - 0.52, h: 0.14, pos: [tubX, TUB_BENCH, tubZ], mat: M_SUITE_GLASS, cast: false,
    }), 'suite-tub-footwell'));
    // Two marble steps up to the coping, on the south side you walk in from.
    for (let i = 0; i < 2; i++) {
      root.add(box({
        size: [1.7 - i * 0.3, 0.22, 0.42],
        pos: [tubX, SY + 0.11 + i * 0.22, tubZ - TUB_R - 0.5 + i * 0.42],
        mat: M_SUITE_MARBLE,
        name: 'suite-tub-step',
      }));
    }
    /* The water. `makeWaterMaterial`'s vertex shader displaces along local z
     * and reads local xy, so the disc is built flat in XY and laid down —
     * exactly how the pool outside builds its own surface. */
    const tubWaterMat = makeWaterMaterial({ deep: 0x0a3a4c, shallow: 0x49c6dd, opacity: 0.82 });
    const tubWater = new THREE.Mesh(new THREE.CircleGeometry(TUB_IN - 0.03, 40), tubWaterMat);
    tubWater.rotation.x = -Math.PI / 2;
    tubWater.position.set(tubX, TUB_WATER, tubZ);
    tubWater.name = 'suite-tub-water';
    root.add(tubWater);
    props.tubWater = tubWater;
    props.tubWaterMaterial = tubWaterMat;

    /* THE JETS. Eight nozzles round the tank at bench height, and a bubble
     * column over each one — a Points cloud recycled in place, the same
     * technique `MansionGrounds.js`'s fountain spray uses, at a tenth of the
     * count because a hot tub is not a fountain. */
    const JETS = 8;
    for (let i = 0; i < JETS; i++) {
      const a = (i / JETS) * Math.PI * 2;
      root.add(named(cylinder({
        r: 0.05,
        h: 0.08,
        pos: [tubX + Math.cos(a) * (TUB_IN - 0.04), TUB_BENCH - 0.16, tubZ + Math.sin(a) * (TUB_IN - 0.04)],
        mat: M_CHROME,
        rotZ: Math.PI / 2,
        rotY: -a,
        cast: false,
      }), 'suite-tub-jet'));
    }
    const BUBBLES = 96;
    const bubbleGeo = new THREE.BufferGeometry();
    const bubblePos = new Float32Array(BUBBLES * 3);
    const bubbleSeed = new Float32Array(BUBBLES * 3);   // angle, radius, speed
    for (let i = 0; i < BUBBLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = (0.3 + Math.random() * 0.68) * TUB_IN;
      bubbleSeed[i * 3] = a;
      bubbleSeed[i * 3 + 1] = rad;
      bubbleSeed[i * 3 + 2] = 0.28 + Math.random() * 0.5;
      bubblePos[i * 3] = tubX + Math.cos(a) * rad;
      bubblePos[i * 3 + 1] = TUB_FLOOR + Math.random() * (TUB_WATER - TUB_FLOOR);
      bubblePos[i * 3 + 2] = tubZ + Math.sin(a) * rad;
    }
    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
    const bubbles = new THREE.Points(bubbleGeo, new THREE.PointsMaterial({
      color: 0xdff6ff, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    bubbles.name = 'suite-tub-bubbles';
    root.add(bubbles);

    /* STEAM. Four soft slabs drifting up and fading — cheap, and the thing
     * that actually says "this water is hot" from across the room. */
    const steam = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        mat({
          color: 0xdfeef5, transparent: true, opacity: 0.0, depthWrite: false, unique: true,
        }),
      );
      m.position.set(tubX, TUB_WATER + 0.2, tubZ);
      m.name = 'suite-tub-steam-cloud';
      root.add(m);
      steam.push({ mesh: m, t: i / 5, seed: Math.random() * 6.28 });
    }

    // Underwater light — over the bloom threshold on purpose. See COOL LIGHTING.
    root.add(named(cylinder({
      r: 0.16, h: 0.05, pos: [tubX, TUB_FLOOR + 0.06, tubZ], mat: M_SUITE_TUB_LIGHT, cast: false,
    }), 'suite-tub-underlight'));
    const tubLight = new THREE.PointLight(0x63dfff, 4.6, 9, 2);
    tubLight.position.set(tubX, TUB_WATER - 0.25, tubZ);
    root.add(tubLight);
    props.tubLight = tubLight;
    // Collide the drum as a square: the resolver is axis-aligned, and a box
    // inscribed on the coping is what you actually bump into walking past.
    solid(tubX - TUB_R, tubX + TUB_R, SY, TUB_RIM, tubZ - TUB_R, tubZ + TUB_R);

    /* WHERE THE TWO PERFORMERS SIT, AND WHAT `y` MEANS HERE.
     *
     * `Npc.sit()` drops the figure by 0.42 x its own height scale and folds
     * the legs, so the number it wants is the floor the SEATED FEET rest on --
     * not the seat. Publishing the bench height instead would have put both of
     * them 0.82 m up, sitting on the water with their feet in the air, and it
     * is the kind of thing that reads as "the tub is wrong" rather than as
     * "the seat number is wrong". So this is TUB_FLOOR, and the bench is
     * exactly the 0.42 above it that `sit()` assumes.
     *
     * Placed on the bench ring at 1.22 m out, in the two arcs facing the room,
     * and turned to face the middle of the water. Yaw is `atan2(-dx, -dz)`
     * because every figure in this project points down its own local -Z. */
    props.tubSeats = [-2.5, -0.55].map((a) => {
      const sxx = tubX + Math.cos(a) * 1.22;
      const szz = tubZ + Math.sin(a) * 1.22;
      return {
        x: sxx,
        z: szz,
        y: TUB_FLOOR,
        yaw: Math.atan2(-(tubX - sxx), -(tubZ - szz)),
      };
    });
    /* Champagne, on its own pedestal beside the tub rather than balanced on
     * the coping — a bucket standing on a curved marble rim is a bucket
     * standing on nothing, which is what the audit says about it too. */
    {
      /* North-west of the tub, off the lane between the bar and the water. */
      const px = tubX - 2.8;
      const pz = tubZ + 1.9;
      const tableTop = SY + 0.62;
      root.add(named(cylinder({
        r: 0.42, h: 0.06, pos: [px, tableTop - 0.03, pz], mat: M_SUITE_MARBLE,
      }), 'suite-champagne-table'));
      root.add(named(cylinder({
        r: 0.09, h: 0.6, pos: [px, SY + 0.3, pz], mat: M_GOLD,
      }), 'suite-champagne-table-stem'));
      root.add(named(cylinder({
        r: 0.24, h: 0.05, pos: [px, SY + 0.025, pz], mat: M_GOLD, cast: false,
      }), 'suite-champagne-table-foot'));
      solid(px - 0.44, px + 0.44, SY, tableTop, pz - 0.44, pz + 0.44);
      root.add(named(cylinder({
        rTop: 0.2, rBottom: 0.15, h: 0.3, pos: [px, tableTop + 0.14, pz], mat: M_SILVER,
      }), 'suite-champagne-bucket'));
      root.add(box({
        size: [0.1, 0.34, 0.1], pos: [px, tableTop + 0.20, pz], mat: M_SUITE_ONYX, cast: false, name: 'suite-champagne-bottle',
      }));
      for (const ox of [-0.3, 0.3]) {
        root.add(named(cylinder({
          r: 0.035, h: 0.2, pos: [px + ox, tableTop + 0.11, pz + 0.14], mat: M_GLASS_CASE, cast: false,
        }), 'suite-champagne-flute'));
      }
    }

    /* ================================================================ */
    /* THE WET BAR — west wall                                           */
    /* ================================================================ */
    const barZ0 = 68.9;
    const barZ1 = 73.1;
    const barCz = (barZ0 + barZ1) / 2;
    // Back bar: mirror, gilt shelves, bottles, and a lit plinth under them.
    root.add(box({
      size: [0.06, 2.2, barZ1 - barZ0], pos: [r.x0 + 0.06, SY + 1.7, barCz], mat: M_SUITE_MIRROR, cast: false, name: 'suite-bar-mirror',
    }));
    for (const sy of [1.15, 1.62, 2.09]) {
      root.add(box({
        size: [0.3, 0.05, barZ1 - barZ0 - 0.3], pos: [r.x0 + 0.19, SY + sy, barCz], mat: M_GOLD, cast: false, name: 'suite-bar-shelf',
      }));
      for (let i = 0; i < 9; i++) {
        const bz = barZ0 + 0.4 + i * ((barZ1 - barZ0 - 0.8) / 8);
        const bottle = makeWhiskeyBottle(M, { x: r.x0 + 0.2, y: SY + sy + 0.025, z: bz });
        root.add(bottle.group);
      }
      // The strip that lights them from under the shelf above.
      root.add(box({
        size: [0.24, 0.03, barZ1 - barZ0 - 0.4], pos: [r.x0 + 0.2, SY + sy - 0.032, barCz], mat: M_SUITE_COVE, cast: false, name: 'suite-bar-led',
      }));
    }
    const barGlow = new THREE.PointLight(0xffb85a, 2.2, 8, 2);
    barGlow.position.set(r.x0 + 0.7, SY + 1.7, barCz);
    root.add(barGlow);
    // The counter itself, in onyx with a gold nosing and a marble top.
    root.add(box({
      size: [0.72, 1.06, barZ1 - barZ0], pos: [r.x0 + 1.1, SY + 0.53, barCz], mat: M_SUITE_ONYX, name: 'suite-bar-counter',
    }));
    root.add(box({
      size: [0.92, 0.08, barZ1 - barZ0 + 0.2], pos: [r.x0 + 1.16, SY + 1.08, barCz], mat: M_SUITE_MARBLE, cast: false, name: 'suite-bar-top',
    }));
    root.add(box({
      size: [0.06, 0.9, barZ1 - barZ0], pos: [r.x0 + 1.47, SY + 0.6, barCz], mat: M_GOLD, cast: false, name: 'suite-bar-nosing',
    }));
    solid(r.x0, r.x0 + 1.5, SY, SY + 1.14, barZ0, barZ1);
    for (const sz of [barZ0 + 1.0, barCz, barZ1 - 1.0]) {
      root.add(named(cylinder({
        r: 0.06, h: 0.78, pos: [r.x0 + 2.0, SY + 0.39, sz], mat: M_GOLD,
      }), 'suite-bar-stool-stem'));
      root.add(named(cylinder({
        r: 0.24, h: 0.1, pos: [r.x0 + 2.0, SY + 0.83, sz], mat: M_SUITE_VELVET,
      }), 'suite-bar-stool-seat'));
      root.add(named(cylinder({
        r: 0.2, h: 0.04, pos: [r.x0 + 2.0, SY + 0.03, sz], mat: M_GOLD, cast: false,
      }), 'suite-bar-stool-foot'));
      solid(r.x0 + 1.74, r.x0 + 2.26, SY, SY + 0.88, sz - 0.26, sz + 0.26);
    }
    for (let i = 0; i < 4; i++) {
      const glass = makeShotGlass(M, { x: r.x0 + 1.1, y: SY + 1.14, z: barZ0 + 0.9 + i * 0.3 });
      root.add(glass.group);
    }
    /* The crest, over the bar. `MANSION_ART_SLOTS` carries the slot so the
     * real artwork swaps in if the file resolves; the drawn crest under it is
     * what ships when it does not. */
    const suiteCrest = flatArt('mansion.suite.crest', {
      x: r.x0 + 0.2,
      y: SY + 2.62,
      z: barCz,
      rotY: Math.PI / 2,
      w: 1.3,
      h: 0.95,
      material: mat({
        map: squatchArt('mansion-suite-crest', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'THE THIRD FLOOR', ink: '#e8c268', bg: '#1a1410',
        }),
        roughness: 0.85,
        unique: true,
      }),
    });
    root.add(box({
      size: [0.05, 1.13, 1.48], pos: [r.x0 + 0.16, SY + 2.62, barCz], mat: M_GOLD, cast: false, name: 'suite-crest-frame',
    }));
    sconce(r.x0 + 0.05, SY + 2.55, barZ0 - 0.6, Math.PI / 2, 1.3);
    sconce(r.x0 + 0.05, SY + 2.55, barZ1 + 0.6, Math.PI / 2, 1.3);

    /* ================================================================ */
    /* THE DRESSING RUN — the first thing off the stair                  */
    /*                                                                    */
    /* The brief called for "the stair's landing wardrobe", and this is    */
    /* where one goes: an open fitted run on the blind south wall between  */
    /* the bed and the arrival, so you walk past it coming up and it is    */
    /* between the bed and the way out.                                    */
    /* ================================================================ */
    const drX0 = 1.95;
    const drX1 = 5.95;
    root.add(box({
      size: [drX1 - drX0, 2.5, 0.62], pos: [(drX0 + drX1) / 2, SY + 1.25, r.z0 + 0.35], mat: M_WOOD_DK, name: 'suite-dressing-carcass',
    }));
    root.add(box({
      size: [drX1 - drX0 - 0.16, 2.2, 0.08], pos: [(drX0 + drX1) / 2, SY + 1.28, r.z0 + 0.1], mat: M_SUITE_MIRROR, cast: false, name: 'suite-dressing-back',
    }));
    for (let i = 0; i < 3; i++) {
      const cx0 = drX0 + 0.1 + i * ((drX1 - drX0 - 0.2) / 3);
      const cx1 = cx0 + (drX1 - drX0 - 0.2) / 3 - 0.1;
      // Hanging rail and the suits on it.
      root.add(named(cylinder({
        r: 0.022, h: cx1 - cx0, pos: [(cx0 + cx1) / 2, SY + 1.9, r.z0 + 0.35], mat: M_GOLD, rotZ: Math.PI / 2,
      }), 'suite-dressing-rail'));
      const n = Math.max(4, Math.round((cx1 - cx0) / 0.13));
      for (let j = 0; j < n; j++) {
        const hx = cx0 + 0.06 + j * ((cx1 - cx0 - 0.12) / (n - 1));
        root.add(box({
          size: [0.05, 0.95, 0.42],
          pos: [hx, SY + 1.38, r.z0 + 0.35],
          mat: j % 3 === 0 ? M_SUITE_VELVET_DK : (j % 3 === 1 ? M_WALL_DEEP : M_SUITE_ONYX),
          cast: false,
          name: 'suite-dressing-suit',
        }));
      }
      // Shelf of shoe boxes under it, and a gilt pelmet over.
      root.add(box({
        size: [cx1 - cx0, 0.05, 0.5], pos: [(cx0 + cx1) / 2, SY + 0.6, r.z0 + 0.35], mat: M_WOOD_DK, cast: false, name: 'suite-dressing-shelf',
      }));
      for (let j = 0; j < 4; j++) {
        root.add(box({
          size: [0.26, 0.14, 0.4],
          pos: [cx0 + 0.18 + j * 0.3, SY + 0.7, r.z0 + 0.35],
          mat: j % 2 ? M_SUITE_ONYX : M_CARD,
          cast: false,
          name: 'suite-dressing-box',
        }));
      }
      root.add(box({
        size: [cx1 - cx0 + 0.06, 0.12, 0.06], pos: [(cx0 + cx1) / 2, SY + 2.46, r.z0 + 0.63], mat: M_GOLD, cast: false, name: 'suite-dressing-pelmet',
      }));
      root.add(box({
        size: [cx1 - cx0, 0.03, 0.16], pos: [(cx0 + cx1) / 2, SY + 2.4, r.z0 + 0.5], mat: M_SUITE_COVE, cast: false, name: 'suite-dressing-led',
      }));
    }
    solid(drX0, drX1, SY, SY + 2.5, r.z0, r.z0 + 0.68);
    // A cheval mirror and a velvet bench in front of it.
    /* In the corner at the end of the run, NOT in the middle of the floor:
     * the walk off the stair head runs down this side of the room, and a
     * cheval glass standing in it is a thing the player bumps into on the way
     * out of his own bedroom. It is solid, too -- 1.9 m of mirror you can walk
     * through is not a mirror. */
    root.add(box({
      size: [0.9, 1.9, 0.06], pos: [6.35, SY + 1.15, r.z0 + 0.62], mat: M_SUITE_MIRROR, rotY: -0.9, name: 'suite-cheval-mirror',
    }));
    root.add(box({
      size: [1.02, 0.08, 0.16], pos: [6.35, SY + 0.17, r.z0 + 0.62], mat: M_GOLD, rotY: -0.9, cast: false,
    }));
    solid(5.95, 6.75, SY, SY + 2.1, r.z0 + 0.28, r.z0 + 0.96);
    root.add(box({
      size: [1.5, 0.16, 0.5], pos: [(drX0 + drX1) / 2, SY + 0.44, r.z0 + 1.3], mat: M_SUITE_VELVET, name: 'suite-dressing-bench',
    }));
    for (const [lx, lz] of [[-0.62, -0.18], [0.62, -0.18], [-0.62, 0.18], [0.62, 0.18]]) {
      root.add(named(cylinder({
        rTop: 0.035, rBottom: 0.05, h: 0.36, pos: [(drX0 + drX1) / 2 + lx, SY + 0.18, r.z0 + 1.3 + lz], mat: M_GOLD,
      }), 'suite-bench-leg'));
    }
    solid((drX0 + drX1) / 2 - 0.8, (drX0 + drX1) / 2 + 0.8, SY, SY + 0.54, r.z0 + 1.0, r.z0 + 1.6);

    /* ================================================================ */
    /* THE SEATING GROUP — west of the bed, facing the television         */
    /* ================================================================ */
    {
      const sx = -4.9;
      const sz = 67.6;
      root.add(box({
        size: [3.0, 0.44, 1.05], pos: [sx, SY + 0.32, sz], mat: M_SUITE_VELVET, name: 'suite-sofa',
      }));
      root.add(box({
        size: [3.0, 0.72, 0.24], pos: [sx, SY + 0.88, sz - 0.4], mat: M_SUITE_VELVET, cast: false, name: 'suite-sofa-back',
      }));
      for (const ax of [-1.38, 1.38]) {
        root.add(named(cylinder({
          r: 0.24, h: 1.05, pos: [sx + ax, SY + 0.76, sz], mat: M_SUITE_VELVET, rotX: Math.PI / 2,
        }), 'suite-sofa-arm'));
      }
      for (const cx of [-0.74, 0.74]) {
        root.add(box({
          size: [1.4, 0.18, 0.92], pos: [sx + cx, SY + 0.6, sz + 0.02], mat: M_SUITE_VELVET, cast: false, name: 'suite-sofa-seat',
        }));
        root.add(box({
          size: [0.4, 0.32, 0.16], pos: [sx + cx, SY + 0.86, sz - 0.28], mat: M_SUITE_SILK, rotX: 0.24, cast: false, name: 'suite-sofa-cushion',
        }));
      }
      for (const [lx, lz] of [[-1.3, -0.42], [1.3, -0.42], [-1.3, 0.42], [1.3, 0.42]]) {
        root.add(named(cylinder({
          rTop: 0.055, rBottom: 0.04, h: 0.18, pos: [sx + lx, SY + 0.09, sz + lz], mat: M_GOLD,
        }), 'suite-sofa-leg'));
      }
      solid(sx - 1.62, sx + 1.62, SY, SY + 0.95, sz - 0.6, sz + 0.6);
      // Low onyx table, an ashtray and a decanter on it.
      root.add(box({
        size: [1.7, 0.08, 0.9], pos: [sx, SY + 0.44, sz + 1.6], mat: M_SUITE_ONYX, name: 'suite-low-table',
      }));
      for (const [lx, lz] of [[-0.72, -0.34], [0.72, -0.34], [-0.72, 0.34], [0.72, 0.34]]) {
        root.add(box({
          size: [0.07, 0.42, 0.07], pos: [sx + lx, SY + 0.21, sz + 1.6 + lz], mat: M_GOLD,
        }));
      }
      solid(sx - 0.9, sx + 0.9, SY, SY + 0.48, sz + 1.1, sz + 2.1);
      const ash = makeAshtray(M, { x: sx + 0.5, y: SY + 0.48, z: sz + 1.6 });
      root.add(ash.group);
      root.add(box({
        size: [0.18, 0.26, 0.18], pos: [sx - 0.45, SY + 0.61, sz + 1.6], mat: M_GLASS_CASE, cast: false, name: 'suite-decanter',
      }));
      makeFancyChair(sx - 2.5, SY, sz + 1.6, Math.PI / 2 - 0.25, M_SUITE_VELVET_DK, { backH: 0.86, tag: 'suite-chair' });
      makeFancyChair(sx + 2.5, SY, sz + 1.6, -Math.PI / 2 + 0.25, M_SUITE_VELVET_DK, { backH: 0.86, tag: 'suite-chair' });
      /* An urn in the north-west corner rather than a palm. `makePlant`'s
       * fronds are five anonymous spheres splayed off a trunk, and the audit
       * reports every one of them as floating in every scene that plants one;
       * fixing that belongs in `world/props.js`, not here, so the suite gets
       * something the room would have anyway and the count stays honest. */
      root.add(named(cylinder({
        rTop: 0.52, rBottom: 0.34, h: 0.9, pos: [r.x0 + 1.1, SY + 0.45, r.z1 - 1.2], mat: M_SUITE_MARBLE,
      }), 'suite-urn'));
      root.add(named(cylinder({
        r: 0.58, h: 0.1, pos: [r.x0 + 1.1, SY + 0.94, r.z1 - 1.2], mat: M_GOLD, cast: false,
      }), 'suite-urn-rim'));
      root.add(named(cylinder({
        r: 0.44, h: 0.14, pos: [r.x0 + 1.1, SY + 0.05, r.z1 - 1.2], mat: M_SUITE_ONYX,
      }), 'suite-urn-plinth'));
      solid(r.x0 + 0.5, r.x0 + 1.7, SY, SY + 1.0, r.z1 - 1.8, r.z1 - 0.6);
    }

    /* ================================================================ */
    /* THE STAIR WELL, FROM ABOVE                                         */
    /*                                                                     */
    /* A gilt balustrade on the two open edges, standing on the heads of    */
    /* the hall's own walls — which is why those walls stop at UCY and the  */
    /* roof slab reaches over them. Without this the first thing the suite   */
    /* offers a player arriving in it is a 4.6 m drop onto a staircase.      */
    /* ================================================================ */
    railing(W.x0 - 0.3, W.x0, W.z0, W.z1, SY, 'suite-well-west', { newels: true });
    railing(W.x0, W.x1, W.z1, W.z1 + 0.3, SY, 'suite-well-north', { newels: true });

    /* ================================================================ */
    /* GLAZING DRESSING, ART AND THE REMAINING FITTINGS                   */
    /* ================================================================ */
    curtains('z', r.z1 - 0.24, -5.4, SY + 0.15, 5.6, 2.65, M_SUITE_VELVET);
    curtains('z', r.z1 - 0.24, 5.4, SY + 0.15, 5.6, 2.65, M_SUITE_VELVET);
    for (const px of [-7.3, -4.0, 6.9]) {
      sconce(px, SY + 2.5, r.z0 + 0.19, 0, 1.2);
    }
    sconce(r.x1 - 0.05, SY + 2.5, 69.7, -Math.PI / 2, 1.2);
    sconce(r.x0 + 0.05, SY + 2.5, 74.2, Math.PI / 2, 1.2);
    ceilingLight(-1.2, 70.6, SCY - 0.42, 0xffd0a0, 3.2, 14);

    /* One chandelier, hung clear of the tester — the bed's canopy tops out at
     * 12.95 and this hangs at 12.5 over the middle of the floor, which is the
     * only part of the ceiling with nothing under it. */
    {
      const cy = SCY - 1.25;
      const cz = 70.4;
      root.add(named(cylinder({ r: 0.035, h: 0.7, pos: [-1.2, cy + 0.5, cz], mat: M_BRONZE }), 'suite-chandelier-stem'));
      for (const [ty, tr, tn] of [[0, 0.86, 8], [-0.28, 0.5, 5]]) {
        for (let i = 0; i < tn; i++) {
          const a = (i / tn) * Math.PI * 2;
          const bx = Math.cos(a) * tr;
          const bz = Math.sin(a) * tr;
          root.add(box({
            size: [tr * 0.9, 0.025, 0.025], pos: [-1.2 + bx / 2, cy + ty, cz + bz / 2], mat: M_GOLD, rotY: a, name: 'suite-chandelier-arm',
          }));
          root.add(named(cylinder({
            rTop: 0.07, rBottom: 0.09, h: 0.11, pos: [-1.2 + bx, cy + ty + 0.05, cz + bz], mat: M_SHADE_CREAM,
          }), 'suite-chandelier-shade'));
          root.add(named(sphere({
            r: 0.05, pos: [-1.2 + bx, cy + ty + 0.03, cz + bz], mat: M_BULB_WARM, cast: false,
          }), 'suite-chandelier-bulb'));
          root.add(box({
            size: [0.018, 0.2, 0.018], pos: [-1.2 + bx * 0.86, cy + ty - 0.17, cz + bz * 0.86], mat: M_CRYSTAL, cast: false, name: 'suite-chandelier-drop',
          }));
        }
      }
      root.add(named(sphere({ r: 0.1, pos: [-1.2, cy - 0.48, cz], mat: M_GOLD }), 'suite-chandelier-finial'));
    }

    /* ================================================================ */
    /* Per-frame: the water's clock, the jets, and the steam              */
    /* ================================================================ */
    let t = 0;
    function update(dt) {
      if (!(dt > 0)) return;
      if (dt > 0.1) dt = 0.1;
      t += dt;
      tubWaterMat.uniforms.uTime.value += dt;
      // Bubbles rise and recycle at the surface.
      const p = bubbleGeo.attributes.position;
      for (let i = 0; i < BUBBLES; i++) {
        let y = p.array[i * 3 + 1] + bubbleSeed[i * 3 + 2] * dt;
        if (y > TUB_WATER) {
          y = TUB_FLOOR + 0.02;
          const a = Math.random() * Math.PI * 2;
          const rad = (0.3 + Math.random() * 0.68) * TUB_IN;
          p.array[i * 3] = tubX + Math.cos(a) * rad;
          p.array[i * 3 + 2] = tubZ + Math.sin(a) * rad;
        }
        p.array[i * 3 + 1] = y;
      }
      p.needsUpdate = true;
      // Steam: each slab rises 1.4 m over its cycle, fading in and out again.
      for (const s of steam) {
        s.t += dt * 0.16;
        if (s.t > 1) s.t -= 1;
        const h = s.t * 1.5;
        s.mesh.position.set(
          tubX + Math.sin(t * 0.3 + s.seed) * 0.45,
          TUB_WATER + 0.15 + h,
          tubZ + Math.cos(t * 0.24 + s.seed) * 0.45,
        );
        s.mesh.rotation.y = s.seed + t * 0.1;
        s.mesh.scale.setScalar(0.8 + s.t * 1.5);
        s.mesh.material.opacity = 0.16 * Math.sin(s.t * Math.PI);
      }
      // The underwater light breathes with the jets.
      tubLight.intensity = 4.6 + Math.sin(t * 1.7) * 0.8;
    }

    return {
      ...props,
      crest: suiteCrest,
      bubbles,
      steam: steam.map((s) => s.mesh),
      coveLights,
      barGlow,
      update,
    };
  }
  const suiteProps = buildMasterSuite();

  /* ================================================================== */
  /* UPPER FLOOR -- BEDROOMS (down both sides)                           */
  /*                                                                      */
  /* One factory, four rooms. Each gets the bed, a pair of nightstands     */
  /* with lamps, a dresser and mirror, a wardrobe, an armchair, a rug,     */
  /* art, curtains and a light -- plus one thing that is only in that      */
  /* room, so they do not read as four copies.                            */
  /*                                                                        */
  /* AND NOW A THEME EACH (owner playtest 2026-08-04, verbatim):            */
  /*                                                                         */
  /*   "Bed rooms all need work and additional detail." / "Need to look at   */
  /*    layout in the bed rooms. Add TVs, add more decorations, add more     */
  /*    flair." / "I like the lakehouse room themed lake house style, do     */
  /*    another one like old timey, maybe one gothic, and one super modern." */
  /*                                                                          */
  /* So the shared skeleton stays -- it is the thing that makes four rooms a   */
  /* house rather than four demos -- and each room now carries a `theme` that  */
  /* dresses it: its own floor, its own wall treatment, its own bedding over   */
  /* the shared bed, its own light fitting, its own decoration, and a          */
  /* television built the way that room would own one. Which room is which:    */
  /*                                                                            */
  /*   west front  GOTHIC        black panelling, lancet arcading, a four-poster */
  /*                             under a canopy, iron candle chandelier, stained */
  /*                             glass, and the set behind a pointed arch.       */
  /*   east front  OLD TIMEY     wainscot and picture rail, brass bedstead,      */
  /*                             steamer trunk, washstand, gramophone, and the   */
  /*                             console television this file already builds.    */
  /*   west rear   LAKE HOUSE    (his favourite, kept and pushed) white shiplap, */
  /*                             crossed paddles, life ring, lantern light,      */
  /*                             decoys, and the set in a plank cabinet.         */
  /*   east rear   SUPER MODERN  slatted feature wall, LED cove, platform bed,   */
  /*                             linear ceiling light, and a flat panel hung on  */
  /*                             the wall over a low media unit.                 */
  /*                                                                             */
  /* THE SETS ARE CABINETS. `src/mansion/main.js` mounts core/tv.js against the  */
  /* lounge, kitchen and theatre screens by name; these four are handed back on  */
  /* each room's props as `screen` so the composition root can mount them too    */
  /* whenever it wants to, and until then they carry a lit ident so a bedroom    */
  /* television reads as a television and not as a black rectangle.              */
  /*                                                                              */
  /* WHAT NONE OF THEM MAY TOUCH: the strip at x = -14 (west) / x = +14 (east),   */
  /* which is the line every bedroom door stands on AND the run the verifier      */
  /* walks from the gallery through the rear bedrooms into the ensuites. Every    */
  /* piece below is placed off it on purpose.                                     */
  /* ================================================================== */
  /**
   * A bedroom television screen: dark glass with a lit ident on it.
   *
   * `emissiveMap` is the same texture as `map`, which is the difference
   * between a picture that glows and a rectangle that glows: emissive white
   * with no map lights every texel equally and washes the ident off the
   * screen. Same recipe as the conference room's projector screen.
   */
  function bedroomScreenMaterial(key, lines, ink, bg) {
    const tex = printed(`mansion.bedtv.${key}`, lines, {
      w: 512, h: 288, bg, fg: ink, font: '900 44px "Trebuchet MS", sans-serif', lineHeight: 62,
    });
    return mat({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      unique: true,
    });
  }

  function buildBedroom({
    rect, name, headboardWall, palette, extra,
  }) {
    const r = rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    trimRoom(r, UY, UCY - 0.3);
    topping(r.x0, r.x1, UY + 0.01, r.z0, r.z1, palette.floor ?? M_PARQUET, `${name}-floor`);
    rug(cx, cz, Math.min(5.4, r.x1 - r.x0 - 1.2), Math.min(6.0, r.z1 - r.z0 - 1.8), UY,
      palette.rug ?? M_RUG_LIVING);

    /* `inward` points from the wing's outer (exterior) wall toward the middle
     * of the house. The bedroom door is in the OUTER corner, so the bed and
     * its nightstands are pushed a metre inward off the room's centre line --
     * otherwise the nightstand nearest the door stands squarely in the
     * doorway, which is what the walk-in test caught. */
    const inward = r.x0 < 0 ? 1 : -1;
    const bedX = cx + inward * 1.05;

    // The bed, its head against the named wall.
    const bedZ = headboardWall === 'north' ? r.z1 - 1.6 : r.z0 + 1.6;
    const wrap = new THREE.Group();
    wrap.position.y = UY;
    const bed = makeBed(M, {
      x: bedX, z: bedZ, w: 1.9, len: 2.3,
    });
    if (headboardWall === 'north') {
      // makeBed puts the headboard at its -z end; spin the room's bed round.
      bed.group.position.set(bedX * 2, 0, bedZ * 2);
      bed.group.rotation.y = Math.PI;
    }
    wrap.add(bed.group);
    root.add(wrap);
    solid(bedX - 1.0, bedX + 1.0, UY, UY + 0.75, bedZ - 1.25, bedZ + 1.25);
    // Headboard + a bolster, since makeBed's own headboard is apartment-sized.
    const hbZ = headboardWall === 'north' ? r.z1 - 0.3 : r.z0 + 0.3;
    root.add(box({
      size: [2.3, 1.5, 0.18], pos: [bedX, UY + 0.9, hbZ], mat: palette.headboard, name: `${name}-headboard`,
    }));
    root.add(box({
      size: [2.4, 0.12, 0.24], pos: [bedX, UY + 1.68, hbZ], mat: M_WOOD_DK, cast: false,
    }));

    // Nightstands + lamps.
    const nsZ = headboardWall === 'north' ? bedZ + 1.15 : bedZ - 1.15;
    for (const side of [-1, 1]) {
      const nx = bedX + side * 1.5;
      const ns = makeNightstand(M, { x: nx, z: nsZ });
      const nw = new THREE.Group();
      nw.position.y = UY;
      nw.add(ns.group);
      root.add(nw);
      solid(nx - 0.28, nx + 0.28, UY, UY + 0.58, nsZ - 0.24, nsZ + 0.24);
      root.add(cylinder({ r: 0.11, h: 0.04, pos: [nx, UY + 0.6, nsZ], mat: M_BRONZE }));
      root.add(cylinder({ r: 0.02, h: 0.3, pos: [nx, UY + 0.76, nsZ], mat: M_BRONZE }));
      root.add(cylinder({
        rTop: 0.16, rBottom: 0.2, h: 0.24, pos: [nx, UY + 1.0, nsZ], mat: mat({ color: 0xe8dcc0, roughness: 0.85 }),
      }));
      const l = new THREE.PointLight(0xffd0a0, 1.8, 6, 2);
      l.position.set(nx, UY + 0.98, nsZ);
      root.add(l);
    }

    /* Dresser + mirror against the outer wall, wardrobe against the inner one.
     *
     * `dresserZ` is a palette knob because the outer wall is the GLAZED one
     * and the two rear bedrooms are glazed right across the middle of it
     * (z 55.6..62.4, sill 6.9). The mirror hangs at y 7.10..8.60, so at the
     * default z = cz - 2.4 = 57.1 it measured as a pier glass screwed over
     * the window -- in both rear rooms, and invisible to the art/doorway
     * sweep because a dresser mirror was never registered with it. It is
     * registered now, and the two rear rooms put their dresser in the clear
     * stretch of wall south of their glazing. */
    const dresserSide = inward;
    const dx = dresserSide > 0 ? r.x0 + 0.45 : r.x1 - 0.45;
    const dresserZ = palette.dresserZ ?? cz - 2.4;
    const mirrorX = dresserSide > 0 ? r.x0 + 0.12 : r.x1 - 0.12;
    caseFurniture(dx, dresserZ, UY, 2.0, 0.6, 0.95, dresserSide > 0 ? Math.PI / 2 : -Math.PI / 2, 3);
    root.add(box({
      size: [0.07, 1.5, 1.2],
      pos: [mirrorX, UY + 1.85, dresserZ],
      mat: mat({ color: 0xdce6ee, roughness: 0.08, metalness: 0.85 }),
      name: `${name}-mirror`,
    }));
    recordArt(`${name}-mirror`, mirrorX, UY + 1.85, dresserZ,
      dresserSide > 0 ? Math.PI / 2 : -Math.PI / 2, 1.2, 1.5);
    /* 0.52 off the partition, not 0.4. Owner playtest, verbatim: "dresser in
     * wall". The tall press is the piece that was in it, in ALL FOUR rooms --
     * it is 0.7 m deep with an 0.8 m cornice, and every theme lines its inner
     * wall with bands that stand proud of the plaster: 0.07 m of boarding and
     * 0.10 m of chair rail in the lake and old-timey rooms, 0.07 m of slab
     * lining and 0.09 m of lit cove in the modern one. At 0.4 the carcass ran
     * 50 mm inside the chair rail and the cornice 10 mm inside the cove.
     *
     * The offset is sized off the WORST case rather than the nearest: cornice
     * half-width 0.40 + the modern room's 0.09 cove + 0.02 clearance = 0.51,
     * rounded to 0.52. Measured after, the carcass clears the chair rail by
     * 30 mm and the cornice clears the cove by 30 mm. */
    const wx = dresserSide > 0 ? r.x1 - 0.52 : r.x0 + 0.52;
    root.add(box({
      size: [0.7, 2.3, 2.2], pos: [wx, UY + 1.15, cz + 1.4], mat: palette.wardrobe ?? M_WOOD_DK, name: `${name}-wardrobe`,
    }));
    root.add(box({
      size: [0.05, 2.0, 1.0],
      pos: [dresserSide > 0 ? wx - 0.37 : wx + 0.37, UY + 1.2, cz + 1.4],
      mat: palette.wardrobeDoor ?? M_WOOD,
      cast: false,
    }));
    // Handles, and a cornice on top -- a wardrobe is not a slab.
    for (const oz of [1.16, 1.64]) {
      root.add(cylinder({
        r: 0.02, h: 0.3, pos: [dresserSide > 0 ? wx - 0.38 : wx + 0.38, UY + 1.2, cz + oz], mat: palette.metal ?? M_GOLD, cast: false,
      }));
    }
    root.add(box({
      size: [0.8, 0.12, 2.3], pos: [wx, UY + 2.36, cz + 1.4], mat: palette.wardrobe ?? M_WOOD_DK, cast: false,
    }));
    solid(wx - 0.38, wx + 0.38, UY, UY + 2.3, cz + 0.3, cz + 2.5);

    /* An armchair and a small table -- on the INNER side of the room, away
     * from the doorway in the outer corner. Fancy by default now, since the
     * owner asked for every chair in the house to be; `chairKind: 'none'` is
     * for the room whose own theme brings a better one with it. */
    const chairX = dresserSide > 0 ? r.x1 - 1.4 : r.x0 + 1.4;
    if (palette.chairKind !== 'none') {
      makeFancyChair(chairX, UY, cz + 2.6, dresserSide > 0 ? -1.2 : 1.2, palette.chair, {
        backH: 0.82, tag: `${name}-chair`,
      });
    }
    const sideTableX = dresserSide > 0 ? r.x1 - 2.6 : r.x0 + 2.6;
    root.add(cylinder({ r: 0.3, h: 0.06, pos: [sideTableX, UY + 0.56, cz + 2.9], mat: palette.sideTable ?? M_WOOD_DK }));
    root.add(cylinder({ r: 0.08, h: 0.56, pos: [sideTableX, UY + 0.28, cz + 2.9], mat: palette.sideTable ?? M_WOOD_DK }));
    root.add(cylinder({ r: 0.24, h: 0.02, pos: [sideTableX, UY + 0.59, cz + 2.9], mat: palette.metal ?? M_GOLD, cast: false }));

    wallArt(`${name}-art`, bedX, UY + 2.6, hbZ + (headboardWall === 'north' ? -0.16 : 0.16),
      headboardWall === 'north' ? Math.PI : 0, 1.0, 0.8,
      makePortraitTexture(`${name}-art`, palette.artLabel, palette.artTint));
    /* Curtains on the room's OWN window, not on the middle of the wall it is
     * in. Measured against the shell: the two front bedrooms are glazed at
     * z 42.6..46.4 in their outer walls and these hung at z 39.9..43.9 -- four
     * metres of curtain over three metres of blank plaster and a bare window
     * beside it. The rear pair were already right, so `windowZ` defaults to
     * the room's own centre line. */
    curtains('x', dresserSide > 0 ? r.x0 + 0.22 : r.x1 - 0.22,
      palette.windowZ ?? cz, UY + 0.75, 4.0, 2.3, palette.curtain);
    // ...and on the south window as well, in the two front bedrooms.
    if (palette.southWindowX !== undefined) {
      curtains('z', r.z0 + 0.22, palette.southWindowX, UY + 0.75, 3.8, 2.3, palette.curtain);
    }

    /* Everything the theme owns gets this: `hbDir` is the direction from the
     * head of the bed toward its foot, `outerX`/`innerX` the two long walls,
     * so a dressing written once works in a room on either side of the house
     * and with the bed against either end. */
    const ctx = {
      cx,
      cz,
      r,
      wrapY: UY,
      name,
      inward,
      bedX,
      bedZ,
      hbZ,
      hbDir: headboardWall === 'north' ? -1 : 1,
      nsZ,
      dx,
      wx,
      chairX,
      sideTableX,
      dresserZ,
      outerX: dresserSide > 0 ? r.x0 : r.x1,
      innerX: dresserSide > 0 ? r.x1 : r.x0,
      screen: null,
    };
    const light = palette.light ? palette.light(ctx) : ceilingLight(cx, cz, UCY - 0.35, 0xffdca0, 5, 15);
    palette.dress?.(ctx);
    extra?.(ctx);
    return { light, screen: ctx.screen };
  }

  /**
   * A band right round a bedroom's four walls, notched for its doorways.
   *
   * `t` is 0.07 and the band starts above the skirting on purpose: `trimRoom`
   * has already put a 0.05 m skirting on these same four planes, and a band of
   * the same thickness over the same stretch of wall is the coplanar pair that
   * flickers (see `lineRoom`'s note -- the guest room downstairs had exactly
   * that). `southGaps`/`northGaps` are [x0, x1] pairs and `westGaps`/`eastGaps`
   * [z0, z1] pairs -- the doorways in each wall and, on whichever wall is the
   * room's OUTER one, its window. A band that runs past a window boards it up:
   * the shell glazes the two front bedrooms at z 42.6..46.4 in their outer
   * walls and the two rear ones at z 55.6..62.4, sill at y 6.9, so anything
   * taller than the sill has to be cut round the glass or stop under it.
   */
  function bedroomBand({
    r, y0, y1, material, t = 0.07, southGaps = [], northGaps = [], westGaps = [], eastGaps = [],
  }) {
    linedBand({
      axis: 'x', x0: r.x0, x1: r.x1, y0, y1, z0: r.z0, z1: r.z0 + t, material, gaps: southGaps,
    });
    linedBand({
      axis: 'x', x0: r.x0, x1: r.x1, y0, y1, z0: r.z1 - t, z1: r.z1, material, gaps: northGaps,
    });
    linedBand({
      axis: 'z', x0: r.x0, x1: r.x0 + t, y0, y1, z0: r.z0, z1: r.z1, material, gaps: westGaps,
    });
    linedBand({
      axis: 'z', x0: r.x1 - t, x1: r.x1, y0, y1, z0: r.z0, z1: r.z1, material, gaps: eastGaps,
    });
  }

  /* ---- The four themes' own materials. ------------------------------- */
  const M_GOTHIC_PANEL = mat({ color: 0x171319, roughness: 0.88 });
  const M_GOTHIC_STONE = mat({ color: 0x4a4650, roughness: 0.92 });
  const M_GOTHIC_IRON = mat({ color: 0x14161a, roughness: 0.6, metalness: 0.5 });
  const M_GOTHIC_VELVET = mat({ map: fabricTex('#40101c'), roughness: 0.95 });
  const M_GLASS_RUBY = mat({
    color: 0x30060c, emissive: 0xc8324a, emissiveIntensity: 1.5, roughness: 0.4,
  });
  const M_GLASS_SAPPHIRE = mat({
    color: 0x0a1430, emissive: 0x3a6ac8, emissiveIntensity: 1.4, roughness: 0.4,
  });
  const M_OLD_WAINSCOT = mat({ color: 0x7a5632, roughness: 0.8 });
  const M_OLD_PAPER = mat({ color: 0xc9b083, roughness: 0.94 });
  const M_OLD_QUILT = mat({ map: fabricTex('#9a6a44'), roughness: 0.95 });
  const M_BRASS = mat({ color: 0xd8a838, roughness: 0.28, metalness: 0.85 });
  const M_LAKE_BOARD = mat({ color: 0xeef1ee, roughness: 0.85 });
  const M_LAKE_BLUE = mat({ color: 0x37648c, roughness: 0.8 });
  const M_LAKE_STRIPE = mat({ map: fabricTex('#4b7ea6'), roughness: 0.92 });
  const M_LAKE_ROPE = mat({ color: 0xc2a877, roughness: 0.96 });
  const M_MOD_WALL = mat({ color: 0xd9dde1, roughness: 0.6 });
  const M_MOD_SLAT = mat({ color: 0x9a6f42, roughness: 0.55 });
  const M_MOD_FABRIC = mat({ map: fabricTex('#7b828a'), roughness: 0.88 });
  const M_MOD_LED = mat({
    color: 0x0d1014, emissive: 0xdfe8ff, emissiveIntensity: 2.2, roughness: 0.5,
  });

  const bedrooms = {
    westFront: buildBedroom({
      rect: BED_WEST_FRONT,
      name: 'bed-west-front',
      headboardWall: 'north',
      palette: {
        headboard: M_GOTHIC_VELVET,
        chair: M_GOTHIC_VELVET,
        curtain: M_CURTAIN_RED,
        wardrobe: M_GOTHIC_PANEL,
        wardrobeDoor: M_GOTHIC_STONE,
        metal: M_GOTHIC_IRON,
        sideTable: M_GOTHIC_PANEL,
        rug: M_CARPET_HALL,
        artLabel: 'THE OLD CHAPEL',
        artTint: '#141018',
        windowZ: 44.5,
        southWindowX: -12.0,
        /* THE GOTHIC ROOM. Black panelling, a stone arcade of lancets down the
         * inner wall, a four-poster under a tester with velvet at its corners,
         * an iron candle chandelier, stained glass, and the television built
         * into the arcade like an altarpiece. */
        light: ({ cx, cz }) => {
          const hub = UCY - 1.25;
          root.add(cylinder({ r: 0.03, h: 1.1, pos: [cx, hub + 0.55, cz], mat: M_GOTHIC_IRON }));
          root.add(named(cylinder({
            r: 0.62, h: 0.06, pos: [cx, hub, cz], mat: M_GOTHIC_IRON,
          }), 'gothic-corona'));
          root.add(cylinder({
            r: 0.36, h: 0.05, pos: [cx, hub + 0.18, cz], mat: M_GOTHIC_IRON, cast: false,
          }));
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const bx = cx + Math.cos(a) * 0.62;
            const bz = cz + Math.sin(a) * 0.62;
            root.add(box({ size: [0.04, 0.3, 0.04], pos: [bx, hub + 0.18, bz], mat: M_GOTHIC_IRON }));
            root.add(cylinder({ r: 0.028, h: 0.2, pos: [bx, hub + 0.13, bz], mat: M_CARD }));
            root.add(sphere({ r: 0.04, pos: [bx, hub + 0.25, bz], mat: M_BULB_WARM, cast: false }));
          }
          const l = new THREE.PointLight(0xffc98a, 5, 15, 2);
          l.position.set(cx, hub - 0.2, cz);
          root.add(l);
          return l;
        },
        dress: (c) => {
          const {
            r, cx, cz, bedX, bedZ, hbZ, innerX, outerX,
          } = c;
          // Panelling: a black dado right round, and the arcade on the inner
          // wall (the one with no glazing in it anywhere).
          /* Stops at UY + 0.82 -- under the 0.9 m window sill. This band runs
           * the outer wall as well, and that wall is glazed at z 42.6..46.4. */
          bedroomBand({
            r,
            y0: UY + 0.17,
            y1: UY + 0.82,
            material: M_GOTHIC_PANEL,
            northGaps: [[-14.9, -13.1]],
          });
          root.add(box({
            size: [0.05, 0.08, r.z1 - r.z0], pos: [outerX + 0.09, UY + 0.86, cz], mat: M_GOTHIC_STONE, cast: false, name: 'gothic-rail',
          }));
          /** One lancet: two colonnettes and a pointed head, on the inner wall. */
          function lancet(lz) {
            const px = innerX - 0.05;
            for (const oz of [-0.42, 0.42]) {
              root.add(named(cylinder({
                r: 0.055, h: 1.9, pos: [px, UY + 1.15, lz + oz], mat: M_GOTHIC_STONE,
              }), 'gothic-colonnette'));
              root.add(cylinder({
                rTop: 0.1, rBottom: 0.07, h: 0.1, pos: [px, UY + 2.14, lz + oz], mat: M_GOTHIC_STONE, cast: false,
              }));
            }
            for (const s of [-1, 1]) {
              root.add(box({
                size: [0.09, 0.95, 0.12],
                pos: [px, UY + 2.62, lz + s * 0.21],
                mat: M_GOTHIC_STONE,
                rotX: s * 0.45,
                name: 'gothic-lancet',
              }));
            }
            root.add(box({
              size: [0.09, 1.86, 0.72], pos: [px + 0.03, UY + 1.15, lz], mat: M_GOTHIC_PANEL, cast: false,
            }));
          }
          for (const lz of [37.4, 39.2, 41.0, 45.6, 47.0]) lancet(lz);

          /* The four-poster. The bed itself is the shared one; this is the
           * frame round it -- posts, tester and velvet at the corners -- so
           * the room reads as gothic from the doorway rather than from the
           * pillow. The collider goes up with it, because a four-poster is
           * not something you walk through. */
          for (const px of [bedX - 1.05, bedX + 1.05]) {
            for (const pz of [bedZ - 1.2, bedZ + 1.2]) {
              root.add(box({
                size: [0.12, 2.4, 0.12], pos: [px, UY + 1.2, pz], mat: M_GOTHIC_IRON, name: 'gothic-bedpost',
              }));
              root.add(sphere({ r: 0.09, pos: [px, UY + 2.46, pz], mat: M_GOTHIC_IRON }));
              root.add(box({
                size: [0.2, 1.9, 0.2], pos: [px, UY + 1.35, pz], mat: M_GOTHIC_VELVET, cast: false, name: 'gothic-bed-drape',
              }));
            }
          }
          root.add(box({
            size: [2.34, 0.12, 2.64], pos: [bedX, UY + 2.46, bedZ], mat: M_GOTHIC_IRON, name: 'gothic-tester',
          }));
          root.add(box({
            size: [2.5, 0.26, 2.8], pos: [bedX, UY + 2.62, bedZ], mat: M_GOTHIC_VELVET, cast: false,
          }));
          solid(bedX - 1.12, bedX + 1.12, UY, UY + 2.5, bedZ - 1.28, bedZ + 1.28);
          // Bedding over the shared duvet: a blood-velvet coverlet and two
          // bolsters against the headboard.
          root.add(box({
            size: [2.0, 0.1, 1.5], pos: [bedX, UY + 0.75, bedZ - 0.5], mat: M_GOTHIC_VELVET, cast: false, name: 'gothic-coverlet',
          }));
          for (const ox of [-0.5, 0.5]) {
            root.add(cylinder({
              r: 0.13, h: 0.85, pos: [bedX + ox, UY + 0.78, hbZ - 0.36], mat: M_GOTHIC_VELVET, rotZ: Math.PI / 2, cast: false,
            }));
          }

          /* Stained glass in the arcade, lit from behind.
           *
           * IN THE BAY AT 38.3, NOT 43.3. Owner playtest: "bed and furniture
           * clipping" / "wall decorations clipping". This was the biggest
           * interpenetration in the room and it was both notes at once -- the
           * window sat at z 42.7..43.9 on the inner wall and the WARDROBE
           * stands at z 42.2..44.4 against that same wall, so measured, the
           * wardrobe carcass ran through the window's iron frame over
           * 55 x 1250 x 1200 mm. The room's own comment already knew the
           * wardrobe's extent -- it is quoted three lines further down, as the
           * reason the television was put where it is -- and the glass was
           * dropped in the middle of it anyway.
           *
           * The arcade's lancets stand at z 37.4, 39.2, 41.0, 45.6 and 47.0.
           * Of the bays between them, 41.0..45.6 holds the wardrobe and
           * 39.2..41.0 holds the television, 45.6..47.0 is only 0.56 m of
           * clear stone -- too narrow for a 1.0 m window. 37.4..39.2 is empty
           * and 0.96 m clear, so the glass goes there. */
          const roseZ = 38.3;
          const rose = flatArt('gothic-rose-window', {
            x: innerX - 0.12,
            y: UY + 2.0,
            z: roseZ,
            rotY: -Math.PI / 2,
            /* 0.72 wide inside an 0.82 frame, because the bay's CLEAR stone is
             * 37.875..38.725 -- between the colonnettes, not between the
             * lancet centres. At the old 1.0/1.2 the frame would have sat
             * 50 mm inside both shafts. */
            w: 0.72,
            h: 1.7,
            material: M_GLASS_RUBY,
          });
          rose.name = 'gothic-stained-glass';
          for (const oy of [-0.5, 0.1, 0.7]) {
            root.add(box({
              size: [0.03, 0.36, 0.62], pos: [innerX - 0.13, UY + 2.0 + oy, roseZ], mat: M_GLASS_SAPPHIRE, cast: false, name: 'gothic-glass-band',
            }));
          }
          root.add(box({
            size: [0.05, 1.9, 0.82], pos: [innerX - 0.08, UY + 2.0, roseZ], mat: M_GOTHIC_IRON, cast: false, name: 'gothic-glass-frame',
          }));
          const glow = new THREE.PointLight(0xc85a78, 2.2, 6, 2);
          glow.position.set(innerX - 0.6, UY + 2.0, roseZ);
          root.add(glow);

          /* The set, standing inside the arcade under its own pointed arch --
           * an iron cabinet on the inner wall at z 40.2, which is the bay
           * between the third and fourth lancets and clear of the wardrobe
           * (z 42.2..44.4). Handed back as `screen` for the composition root. */
          /* 0.45 off the wall, not 0.36. The cabinet is 1.7 m long and the bay
           * it stands in is 0.96 m of clear stone, so it necessarily overlaps
           * the colonnettes either side of it -- and at 0.36 it did so in the
           * SOLID, measured 55 mm of cabinet inside the two stone shafts at
           * z 39.62 and 40.58. Set forward far enough to stand against the
           * arcade rather than inside it: cabinet front now -9.29 against
           * colonnettes reaching -9.255, a 35 mm clearance. */
          const tvX = innerX - 0.45;
          const tvZ = 40.2;
          root.add(box({
            size: [0.62, 0.8, 1.7], pos: [tvX, UY + 0.4, tvZ], mat: M_GOTHIC_PANEL, name: 'gothic-tv-cabinet',
          }));
          root.add(box({
            size: [0.68, 0.09, 1.8], pos: [tvX, UY + 0.84, tvZ], mat: M_GOTHIC_IRON, cast: false,
          }));
          for (const oz of [-0.55, 0.55]) {
            root.add(cylinder({
              r: 0.05, h: 1.5, pos: [tvX - 0.24, UY + 1.6, tvZ + oz], mat: M_GOTHIC_IRON,
            }));
          }
          for (const s of [-1, 1]) {
            root.add(box({
              size: [0.07, 0.8, 0.1], pos: [tvX - 0.24, UY + 2.48, tvZ + s * 0.28], mat: M_GOTHIC_IRON, rotX: s * 0.45,
            }));
          }
          root.add(box({
            size: [0.1, 1.16, 1.34], pos: [tvX - 0.18, UY + 1.62, tvZ], mat: M_GOTHIC_IRON, cast: false,
          }));
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(1.16, 0.98),
            bedroomScreenMaterial('gothic', ['THE HOUSE', 'CHANNEL'], '#c8324a', '#120a10'),
          );
          screen.position.set(tvX - 0.24, UY + 1.62, tvZ);
          screen.rotation.y = -Math.PI / 2;
          screen.name = 'bed-west-front-screen';
          root.add(screen);
          c.screen = screen;
          solid(tvX - 0.32, tvX + 0.32, UY, UY + 0.9, tvZ - 0.9, tvZ + 0.9);

          // Iron candle stands either side of the bed, and a reliquary chest
          // at its foot.
          for (const sx of [bedX - 1.5, bedX + 1.5]) {
            root.add(cylinder({ r: 0.24, h: 0.05, pos: [sx, UY + 0.03, bedZ - 1.9], mat: M_GOTHIC_IRON, cast: false }));
            root.add(cylinder({ r: 0.035, h: 1.3, pos: [sx, UY + 0.68, bedZ - 1.9], mat: M_GOTHIC_IRON }));
            root.add(cylinder({
              rTop: 0.16, rBottom: 0.1, h: 0.06, pos: [sx, UY + 1.36, bedZ - 1.9], mat: M_GOTHIC_IRON, cast: false,
            }));
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2;
              root.add(cylinder({
                r: 0.026, h: 0.24, pos: [sx + Math.cos(a) * 0.11, UY + 1.5, bedZ - 1.9 + Math.sin(a) * 0.11], mat: M_CARD,
              }));
              root.add(sphere({
                r: 0.032, pos: [sx + Math.cos(a) * 0.11, UY + 1.64, bedZ - 1.9 + Math.sin(a) * 0.11], mat: M_BULB_WARM, cast: false,
              }));
            }
            solid(sx - 0.26, sx + 0.26, UY, UY + 1.4, bedZ - 2.16, bedZ - 1.64);
          }
          /* The iron-bound coffer. In the room's south-west corner rather than
           * at the foot of the bed, which is where it obviously belongs and
           * where it cannot go: the armchair (x -10.83..-10.27) and its side
           * table (x -12.05..-11.45) already stand across that end, and a
           * 1.3 m chest laid between them measured as overlapping both. */
          const chestX = cx - 2.6;
          const chestZ = r.z0 + 0.95;
          root.add(box({
            size: [1.3, 0.55, 0.6], pos: [chestX, UY + 0.27, chestZ], mat: M_GOTHIC_PANEL, name: 'gothic-chest',
          }));
          for (const bz of [-0.24, 0.24]) {
            root.add(box({
              size: [1.34, 0.1, 0.08], pos: [chestX, UY + 0.34, chestZ + bz], mat: M_GOTHIC_IRON, cast: false,
            }));
          }
          root.add(box({
            size: [1.34, 0.14, 0.64], pos: [chestX, UY + 0.58, chestZ], mat: M_GOTHIC_PANEL, cast: false,
          }));
          root.add(box({
            size: [0.16, 0.2, 0.06], pos: [chestX, UY + 0.42, chestZ + 0.32], mat: M_GOTHIC_IRON, cast: false,
          }));
          solid(chestX - 0.68, chestX + 0.68, UY, UY + 0.66, chestZ - 0.32, chestZ + 0.32);
          // A gargoyle on a plinth in the other corner, watching the door.
          const gx = innerX - 0.75;
          const gz = r.z0 + 0.85;
          root.add(box({ size: [0.5, 1.1, 0.5], pos: [gx, UY + 0.55, gz], mat: M_GOTHIC_STONE, name: 'gothic-plinth' }));
          root.add(box({ size: [0.6, 0.08, 0.6], pos: [gx, UY + 1.14, gz], mat: M_GOTHIC_STONE, cast: false }));
          root.add(box({ size: [0.34, 0.34, 0.42], pos: [gx, UY + 1.36, gz], mat: M_GOTHIC_STONE, name: 'gothic-gargoyle' }));
          root.add(box({ size: [0.24, 0.24, 0.26], pos: [gx, UY + 1.62, gz + 0.06], mat: M_GOTHIC_STONE }));
          for (const s of [-1, 1]) {
            root.add(box({
              size: [0.08, 0.4, 0.3], pos: [gx + s * 0.2, UY + 1.5, gz - 0.14], mat: M_GOTHIC_STONE, rotZ: s * 0.5, cast: false,
            }));
          }
          solid(gx - 0.3, gx + 0.3, UY, UY + 1.8, gz - 0.3, gz + 0.3);
        },
      },
      extra: ({ cx }) => {
        // Somebody is staying: a suitcase, open, half unpacked.
        root.add(box({ size: [0.9, 0.24, 0.6], pos: [cx + 2.0, UY + 0.12, 43.4], mat: M_LEATHER_TAN }));
        root.add(box({
          size: [0.9, 0.06, 0.6], pos: [cx + 2.0, UY + 0.4, 43.1], mat: M_LEATHER_TAN, rotX: -0.9,
        }));
        root.add(box({ size: [0.7, 0.1, 0.44], pos: [cx + 2.0, UY + 0.28, 43.4], mat: M_CARD, cast: false }));
        solid(cx + 1.5, cx + 2.5, UY, UY + 0.3, 43.05, 43.75);
      },
    }),
    eastFront: buildBedroom({
      rect: BED_EAST_FRONT,
      name: 'bed-east-front',
      headboardWall: 'north',
      palette: {
        headboard: M_OLD_QUILT,
        chair: M_OLD_QUILT,
        curtain: M_CURTAIN_RED,
        wardrobe: M_WOOD,
        wardrobeDoor: M_OLD_WAINSCOT,
        metal: M_BRASS,
        sideTable: M_WOOD,
        rug: M_RUG_LIVING,
        artLabel: 'THE OLD COUNTRY',
        artTint: '#221a1a',
        windowZ: 44.5,
        southWindowX: 12.0,
        /* THE OLD-TIMEY ROOM. Wainscot and a picture rail, papered above, a
         * brass bedstead under a patchwork quilt, a steamer trunk, a
         * washstand with its pitcher and basin, a wind-up gramophone, a
         * pendulum clock, sepia photographs -- and, for a television, the
         * console set in a wood cabinet on splayed legs that this file
         * already knows how to build. */
        light: ({ cx, cz }) => {
          const hub = UCY - 1.15;
          root.add(cylinder({ r: 0.025, h: 0.9, pos: [cx, hub + 0.45, cz], mat: M_BRASS }));
          root.add(sphere({ r: 0.16, pos: [cx, hub, cz], mat: M_BRASS }));
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const bx = cx + Math.cos(a) * 0.5;
            const bz = cz + Math.sin(a) * 0.5;
            root.add(box({ size: [0.5, 0.035, 0.035], pos: [(cx + bx) / 2, hub, (cz + bz) / 2], mat: M_BRASS, rotY: -a }));
            root.add(named(cylinder({
              rTop: 0.115, rBottom: 0.15, h: 0.17, pos: [bx, hub + 0.13, bz], mat: M_SHADE_CREAM,
            }), 'oldtime-shade'));
            root.add(sphere({ r: 0.06, pos: [bx, hub + 0.11, bz], mat: M_BULB_WARM, cast: false }));
          }
          const l = new THREE.PointLight(0xffd6a0, 5.2, 15, 2);
          l.position.set(cx, hub - 0.1, cz);
          root.add(l);
          return l;
        },
        dress: (c) => {
          const {
            r, cz, bedX, bedZ, hbZ, innerX, outerX,
          } = c;
          // Wainscot with a capping rail, papered above it, and a picture rail
          // over that. The doorway in the north wall is notched out.
          /* Wainscot and its capping rail stop at the window sill (0.9 above
           * the floor); the picture rail is above both windows' heads, so it
           * is cut round the south glazing (x 10.4..13.6) and the east
           * glazing (z 42.6..46.4) instead. */
          bedroomBand({
            r,
            y0: UY + 0.17,
            y1: UY + 0.81,
            material: M_OLD_WAINSCOT,
            northGaps: [[13.1, 14.9]],
          });
          bedroomBand({
            r,
            y0: UY + 0.81,
            y1: UY + 0.89,
            material: M_WOOD_DK,
            t: 0.1,
            northGaps: [[13.1, 14.9]],
          });
          bedroomBand({
            r,
            y0: UY + 2.5,
            y1: UY + 2.58,
            material: M_WOOD_DK,
            t: 0.1,
            southGaps: [[10.4, 13.6]],
            northGaps: [[13.1, 14.9]],
            eastGaps: [[42.6, 46.4]],
          });
          root.add(box({
            size: [0.04, 1.35, r.z1 - r.z0 - 0.2], pos: [innerX - 0.09, UY + 1.8, cz], mat: M_OLD_PAPER, cast: false, name: 'oldtime-paper',
          }));

          /* The bedstead: turned brass posts with knobs at head and foot, and
           * a patchwork quilt folded across the shared bed.
           *
           * THE BRASS HEAD STANDS IN FRONT OF THE PADDED ONE, NOT INSIDE IT.
           * Owner playtest, verbatim: "Workout bench and everything by bed is
           * overlapping". This room gets two headboards -- `buildBedroom`'s
           * upholstered panel, which every room gets, and the brass bedstead
           * this theme brings -- and they were built in the same 20 cm of
           * floor. Measured, the posts sat at z 47.425..47.515 against a
           * padded headboard whose front face is 47.46, so 55 mm of every
           * post, rail and spindle was buried in the upholstery.
           *
           * Moved 60 mm south to hbZ - 0.14: the brass now stops at 47.455,
           * 5 mm clear of the padding, and its posts at x 10.48..10.57 and
           * 12.48..12.57 still miss the mattress at 10.575..12.475. */
          const brassZ = hbZ - 0.14;
          for (const px of [bedX - 1.0, bedX + 1.0]) {
            root.add(named(cylinder({ r: 0.045, h: 1.5, pos: [px, UY + 0.75, brassZ], mat: M_BRASS }), 'oldtime-bedpost'));
            root.add(named(sphere({ r: 0.09, pos: [px, UY + 1.54, brassZ], mat: M_BRASS }), 'oldtime-bedpost-knob'));
            root.add(named(cylinder({ r: 0.04, h: 0.85, pos: [px, UY + 0.42, bedZ - 1.2], mat: M_BRASS }), 'oldtime-footpost'));
            root.add(named(sphere({ r: 0.075, pos: [px, UY + 0.88, bedZ - 1.2], mat: M_BRASS }), 'oldtime-footpost-knob'));
          }
          for (const ry of [UY + 1.02, UY + 1.42]) {
            root.add(named(cylinder({
              r: 0.03, h: 2.0, pos: [bedX, ry, brassZ], mat: M_BRASS, rotZ: Math.PI / 2, cast: false,
            }), 'oldtime-head-rail'));
          }
          for (let i = 0; i < 7; i++) {
            root.add(named(cylinder({
              r: 0.018, h: 0.4, pos: [bedX - 0.75 + i * 0.25, UY + 1.22, brassZ], mat: M_BRASS, cast: false,
            }), 'oldtime-head-spindle'));
          }
          root.add(cylinder({
            r: 0.028, h: 2.0, pos: [bedX, UY + 0.86, bedZ - 1.2], mat: M_BRASS, rotZ: Math.PI / 2, cast: false,
          }));
          root.add(box({
            size: [2.0, 0.1, 1.1], pos: [bedX, UY + 0.76, bedZ - 0.55], mat: M_OLD_QUILT, cast: false, name: 'oldtime-quilt',
          }));
          root.add(box({
            size: [2.06, 0.16, 0.5], pos: [bedX, UY + 0.8, bedZ - 1.02], mat: M_OLD_QUILT, rotX: 0.1, cast: false,
          }));

          /* A steamer trunk under the east window (0.55 m tall, so it is well
           * under the 0.9 m sill), the washstand on the inner wall north of
           * the wardrobe, and the gramophone on the dresser. */
          const trunkX = outerX - 0.75;
          root.add(box({
            size: [0.7, 0.5, 1.2], pos: [trunkX, UY + 0.25, 44.6], mat: M_LEATHER_TAN, name: 'oldtime-trunk',
          }));
          root.add(box({
            size: [0.74, 0.16, 1.24], pos: [trunkX, UY + 0.56, 44.6], mat: M_WOOD_DK, cast: false,
          }));
          for (const oz of [-0.4, 0.4]) {
            root.add(box({
              size: [0.76, 0.5, 0.09], pos: [trunkX, UY + 0.3, 44.6 + oz], mat: M_WOOD_DK, cast: false,
            }));
          }
          root.add(box({
            size: [0.04, 0.12, 0.16], pos: [trunkX - 0.37, UY + 0.4, 44.6], mat: M_BRASS, cast: false,
          }));
          solid(trunkX - 0.4, trunkX + 0.4, UY, UY + 0.66, 44.0, 45.2);

          const washX = innerX + 0.5;
          root.add(box({ size: [0.55, 0.06, 1.0], pos: [washX, UY + 0.86, 46.1], mat: M_WOOD_DK, name: 'oldtime-washstand' }));
          for (const [ox, oz] of [[-0.2, -0.42], [0.2, -0.42], [-0.2, 0.42], [0.2, 0.42]]) {
            root.add(box({ size: [0.06, 0.86, 0.06], pos: [washX + ox, UY + 0.43, 46.1 + oz], mat: M_WOOD_DK }));
          }
          root.add(box({ size: [0.5, 0.04, 0.9], pos: [washX, UY + 0.3, 46.1], mat: M_WOOD_DK, cast: false }));
          root.add(cylinder({
            rTop: 0.19, rBottom: 0.12, h: 0.12, pos: [washX, UY + 0.94, 45.86], mat: M_CARD, name: 'oldtime-basin',
          }));
          root.add(cylinder({
            rTop: 0.09, rBottom: 0.13, h: 0.28, pos: [washX, UY + 1.03, 46.4], mat: M_CARD, name: 'oldtime-pitcher',
          }));
          root.add(cylinder({
            r: 0.025, h: 0.16, pos: [washX + 0.12, UY + 1.1, 46.4], mat: M_CARD, rotZ: 0.9, cast: false,
          }));
          root.add(box({
            size: [0.06, 0.5, 0.24], pos: [washX - 0.2, UY + 1.1, 46.1], mat: M_TRIM, rotZ: 0.1, cast: false, name: 'oldtime-towel',
          }));
          solid(washX - 0.3, washX + 0.3, UY, UY + 0.9, 45.6, 46.6);

          // The gramophone, on the dresser, horn and all.
          const gx = outerX - 0.45;
          const gz = c.dresserZ;
          root.add(box({ size: [0.44, 0.22, 0.44], pos: [gx, UY + 1.06, gz], mat: M_WOOD_DK, name: 'oldtime-gramophone' }));
          root.add(cylinder({ r: 0.16, h: 0.02, pos: [gx, UY + 1.18, gz], mat: M_STOVE_BLACK, cast: false }));
          root.add(named(cylinder({
            rTop: 0.3, rBottom: 0.05, h: 0.46, pos: [gx - 0.12, UY + 1.45, gz], mat: M_BRASS, rotZ: 0.5,
          }), 'oldtime-horn'));
          root.add(cylinder({
            r: 0.02, h: 0.2, pos: [gx + 0.1, UY + 1.22, gz], mat: M_BRASS, rotZ: -0.7, cast: false,
          }));
          root.add(box({
            size: [0.06, 0.14, 0.03], pos: [gx + 0.24, UY + 1.1, gz], mat: M_BRASS, rotZ: 0.4, cast: false,
          }));

          /* A pendulum clock and a cluster of sepia photographs on the inner
           * wall, which has no opening in it anywhere along this room. */
          const clock = makeWallClock(M, {
            x: innerX + 0.11, y: UY + 2.0, z: 41.2, rotY: Math.PI / 2, r: 0.26,
          });
          root.add(clock.group);
          root.add(box({
            size: [0.09, 0.7, 0.24], pos: [innerX + 0.09, UY + 1.5, 41.2], mat: M_WOOD_DK, cast: false, name: 'oldtime-clock-case',
          }));
          root.add(cylinder({
            r: 0.07, h: 0.02, pos: [innerX + 0.05, UY + 1.28, 41.2], mat: M_BRASS, rotY: Math.PI / 2, cast: false,
          }));
          const shots = [
            ['oldtime-photo-a', 'THE FIRST HOUSE', UY + 2.2, 38.6],
            ['oldtime-photo-b', 'THE OLD COUNTRY', UY + 1.7, 39.3],
            ['oldtime-photo-c', 'GRANDFATHER', UY + 2.15, 40.0],
          ];
          for (const [id, label, py, pz] of shots) {
            wallArt(id, innerX + 0.11, py, pz, Math.PI / 2, 0.44, 0.56,
              makePortraitTexture(id, label, '#2a2118'));
          }

          /* The television: the console set in its wooden cabinet on splayed
           * legs -- the one piece of furniture in this house that was already
           * period-correct for this room. It stands against the south wall
           * EAST of that wall's window (x 10.4..13.6) and faces the bed. */
          const set = makeTvSet(14.6, UY, r.z0 + 0.55, 0, { w: 1.4, h: 0.95 });
          set.screen.material = bedroomScreenMaterial('oldtime', ['THE SILVER', 'HOUR'], '#e8dcc0', '#141014');
          set.screen.name = 'bed-east-front-screen';
          c.screen = set.screen;
          // A doily and a bowl on top of it, because of course.
          root.add(box({
            size: [0.5, 0.01, 0.34], pos: [14.6, UY + 1.24, r.z0 + 0.55], mat: M_TRIM, cast: false, name: 'oldtime-doily',
          }));
          root.add(cylinder({
            rTop: 0.14, rBottom: 0.09, h: 0.1, pos: [14.6, UY + 1.29, r.z0 + 0.55], mat: M_CARD,
          }));
        },
      },
      extra: ({ cx }) => {
        /* A weights bench nobody has used since it arrived -- WITH THE RACK
         * THAT HOLDS ITS BAR UP. The other half of "Workout bench and
         * everything by bed is overlapping": the loaded barbell hung at
         * y 6.92..6.98 with nothing beneath it but the bench top at 6.50, so
         * 0.42 m of clear air and a bar floating over it. A bench press is a
         * bench AND two uprights; only the bench had been built. */
        /* cx - 1.8, not cx - 2.0: the press moved 120 mm into the room (see
         * `wx` in buildBedroom) and at 2.0 the rack's foot would have stood
         * 20 mm off its door handles. At 1.8 there is 220 mm between them. */
        const bx = cx - 1.8;
        root.add(box({ size: [0.4, 0.12, 1.3], pos: [bx, UY + 0.44, 43.6], mat: M_LEATHER_DK, name: 'oldtime-bench-pad' }));
        for (const bz of [43.1, 44.1]) {
          root.add(box({ size: [0.3, 0.38, 0.1], pos: [bx, UY + 0.19, bz], mat: M_RACK, name: 'oldtime-bench-leg' }));
        }
        for (const ox of [-0.32, 0.32]) {
          root.add(box({
            size: [0.08, 1.0, 0.08], pos: [bx + ox, UY + 0.5, 43.2], mat: M_RACK, name: 'oldtime-rack-upright',
          }));
          root.add(box({
            size: [0.34, 0.05, 0.34], pos: [bx + ox, UY + 0.025, 43.2], mat: M_RACK, cast: false, name: 'oldtime-rack-foot',
          }));
          // The J-hook the bar actually rests in, at bar height.
          root.add(box({
            size: [0.1, 0.07, 0.17], pos: [bx + ox, UY + 0.955, 43.26], mat: M_RACK, cast: false, name: 'oldtime-rack-hook',
          }));
        }
        root.add(named(cylinder({
          r: 0.03, h: 1.5, pos: [bx, UY + 0.95, 43.2], mat: M_CHROME, rotZ: Math.PI / 2,
        }), 'oldtime-barbell'));
        for (const ox of [-0.6, 0.6]) {
          root.add(named(cylinder({
            r: 0.2, h: 0.1, pos: [bx + ox, UY + 0.95, 43.2], mat: M_STOVE_BLACK, rotZ: Math.PI / 2,
          }), 'oldtime-barbell-plate'));
        }
        // Collider takes the rack's full height -- it is 1 m of steel, not a
        // 0.6 m bench you can walk over the top of.
        solid(cx - 2.4, cx - 1.6, UY, UY + 1.0, 43.0, 44.3);
      },
    }),
    westRear: buildBedroom({
      rect: BED_WEST_REAR,
      name: 'bed-west-rear',
      headboardWall: 'south',
      palette: {
        headboard: M_LAKE_BOARD,
        chair: M_LAKE_STRIPE,
        curtain: M_CURTAIN,
        wardrobe: M_LAKE_BOARD,
        wardrobeDoor: M_LAKE_BLUE,
        metal: M_CHROME,
        sideTable: M_LAKE_BOARD,
        rug: M_RUG_LIVING,
        artLabel: 'THE LAKE HOUSE',
        artTint: '#141c22',
        // Clear of this room's west glazing at z 55.6..62.4 -- see `dresserZ`.
        dresserZ: 54.3,
        /* THE LAKE HOUSE ROOM -- the one the owner already liked, pushed
         * harder rather than replaced. White shiplap to the rail, a
         * blue-and-white bed, crossed paddles and a life ring over it, a
         * lantern for a ceiling light, a rod and creel in the corner, decoys
         * on the side table, and the set in a whitewashed plank cabinet at
         * the foot of the bed. */
        light: ({ cx, cz }) => {
          const hub = UCY - 1.0;
          root.add(cylinder({ r: 0.02, h: 0.75, pos: [cx, hub + 0.4, cz], mat: M_CHROME }));
          root.add(box({ size: [0.34, 0.06, 0.34], pos: [cx, hub + 0.02, cz], mat: M_LAKE_BLUE, cast: false }));
          for (const [ox, oz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
            root.add(box({ size: [0.03, 0.42, 0.03], pos: [cx + ox, hub - 0.22, cz + oz], mat: M_LAKE_BLUE }));
          }
          root.add(box({
            size: [0.3, 0.4, 0.3], pos: [cx, hub - 0.22, cz], mat: mat({ color: 0xf6f2e4, roughness: 0.5, transparent: true, opacity: 0.5 }), cast: false, name: 'lake-lantern',
          }));
          root.add(sphere({ r: 0.07, pos: [cx, hub - 0.24, cz], mat: M_BULB_WARM, cast: false }));
          root.add(cylinder({
            rTop: 0.06, rBottom: 0.2, h: 0.14, pos: [cx, hub - 0.5, cz], mat: M_LAKE_BLUE, cast: false,
          }));
          const l = new THREE.PointLight(0xfff0d4, 5.4, 15, 2);
          l.position.set(cx, hub - 0.35, cz);
          root.add(l);
          return l;
        },
        dress: (c) => {
          const {
            r, cz, bedX, bedZ, hbZ, outerX, inward,
          } = c;
          /* Shiplap: horizontal boards to the chair rail, right round the
           * room, notched for BOTH doorways -- the gallery door in the south
           * wall and the ensuite door in the north one, each at x -14.9..
           * -13.1. */
          const doors = [[-14.9, -13.1]];
          /* Four boards and the chair rail, topping out at UY + 0.87 -- under
           * the 0.9 m sill of this room's west window (z 55.6..62.4), which
           * this band also runs past. */
          for (let i = 0; i < 4; i++) {
            bedroomBand({
              r,
              y0: UY + 0.18 + i * 0.155,
              y1: UY + 0.18 + i * 0.155 + 0.13,
              material: M_LAKE_BOARD,
              southGaps: doors,
              northGaps: doors,
            });
          }
          bedroomBand({
            r,
            y0: UY + 0.79,
            y1: UY + 0.88,
            material: M_LAKE_BLUE,
            t: 0.1,
            southGaps: doors,
            northGaps: doors,
          });

          // Bedding: a striped blanket over the shared duvet and a folded
          // quilt across the foot.
          root.add(box({
            size: [2.0, 0.09, 1.3], pos: [bedX, UY + 0.75, bedZ + 0.2], mat: M_LAKE_STRIPE, cast: false, name: 'lake-blanket',
          }));
          root.add(box({
            size: [2.06, 0.18, 0.55], pos: [bedX, UY + 0.82, bedZ + 0.95], mat: M_LAKE_BLUE, rotX: -0.08, cast: false, name: 'lake-quilt',
          }));
          for (const ox of [-0.55, 0.55]) {
            root.add(box({
              size: [0.42, 0.14, 0.34], pos: [bedX + ox, UY + 0.78, hbZ + 0.5], mat: M_LAKE_STRIPE, rotZ: 0.06, cast: false, name: 'lake-cushion',
            }));
          }

          /* Crossed paddles and a life ring -- the two objects that say lake
           * house from the doorway. Both on the headboard wall, FLANKING the
           * room's own picture rather than over it (the picture hangs at
           * y 8.13..9.07 on the bed's centre line, and a 1.9 m paddle crossed
           * over that lands squarely through it), and both east of the
           * doorway this wall carries at x -14.9..-13.1. */
          /* 1.22 off the bed's centre line, not 1.4. Owner: "wall decorations
           * clipping". A paddle crossed at 0.62 rad measures 0.2225 m each
           * side of its own blade centre, so the east blade reached
           * x = paddleX + 1.0025 -- at 1.4 that was -9.122, which is 98 mm
           * through the shiplap band faced at -9.22 and 28 mm inside the
           * structural partition at -9.15. Pulled back so the blade stops at
           * -9.3025: 82 mm clear of the boarding, 152 mm clear of the wall. */
          const paddleX = bedX + 1.22;
          for (const s of [-1, 1]) {
            root.add(box({
              size: [0.1, 1.9, 0.05], pos: [paddleX + s * 0.02, UY + 2.4, hbZ + 0.2 + s * 0.03], mat: M_LAKE_BOARD, rotZ: s * 0.62, name: 'lake-paddle',
            }));
            root.add(box({
              size: [0.19, 0.5, 0.04], pos: [paddleX + s * 0.78, UY + 1.9, hbZ + 0.2 + s * 0.03], mat: M_LAKE_BLUE, rotZ: s * 0.62, cast: false,
            }));
          }
          /* Recorded at the pair's REAL width -- 1.9 m of paddle crossed at
           * 0.62 rad is 1.2 m across, not 1.9 -- because the art/doorway sweep
           * intersects what is registered, and a box wider than the object is
           * a false finding waiting to happen. */
          recordArt('lake-paddles', paddleX, UY + 2.4, hbZ + 0.2, 0, 1.3, 1.9);
          {
            const lx = bedX - 1.1;
            root.add(named(cylinder({
              r: 0.34, h: 0.1, pos: [lx, UY + 2.4, hbZ + 0.18], mat: M_LAKE_BOARD, rotX: Math.PI / 2,
            }), 'lake-life-ring'));
            root.add(cylinder({
              r: 0.2, h: 0.12, pos: [lx, UY + 2.4, hbZ + 0.18], mat: M_WALL, rotX: Math.PI / 2, cast: false,
            }));
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
              root.add(box({
                size: [0.16, 0.1, 0.12], pos: [lx + Math.cos(a) * 0.3, UY + 2.4 + Math.sin(a) * 0.3, hbZ + 0.2], mat: M_LAKE_BLUE, rotZ: -a, cast: false,
              }));
            }
            recordArt('lake-life-ring', lx, UY + 2.4, hbZ + 0.18, 0, 0.7, 0.7);
          }

          /* The set: a whitewashed plank cabinet on the north wall, dead
           * ahead of the foot of the bed and well clear of the ensuite door
           * (x -14.9..-13.1) it shares that wall with. */
          const tvZ = r.z1 - 0.42;
          root.add(box({
            size: [1.8, 0.72, 0.5], pos: [bedX, UY + 0.36, tvZ], mat: M_LAKE_BOARD, name: 'lake-tv-cabinet',
          }));
          root.add(box({
            size: [1.9, 0.07, 0.58], pos: [bedX, UY + 0.75, tvZ], mat: M_LAKE_BLUE, cast: false,
          }));
          for (const ox of [-0.44, 0.44]) {
            root.add(box({
              size: [0.8, 0.52, 0.04], pos: [bedX + ox, UY + 0.4, tvZ - 0.27], mat: M_LAKE_BLUE, cast: false,
            }));
            root.add(cylinder({
              r: 0.016, h: 0.26, pos: [bedX + ox, UY + 0.4, tvZ - 0.3], mat: M_CHROME, rotZ: Math.PI / 2, cast: false,
            }));
          }
          solid(bedX - 0.9, bedX + 0.9, UY, UY + 0.8, tvZ - 0.3, tvZ + 0.3);
          root.add(box({
            size: [1.42, 0.9, 0.09], pos: [bedX, UY + 1.35, tvZ - 0.12], mat: M_STOVE_BLACK, name: 'lake-tv-frame',
          }));
          root.add(box({
            size: [1.5, 0.98, 0.05], pos: [bedX, UY + 1.35, tvZ - 0.06], mat: M_LAKE_BOARD, cast: false,
          }));
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(1.3, 0.78),
            bedroomScreenMaterial('lake', ['LAKE', 'CHANNEL'], '#bfe4f2', '#0c1a24'),
          );
          screen.position.set(bedX, UY + 1.35, tvZ - 0.17);
          screen.rotation.y = Math.PI;
          screen.name = 'bed-west-rear-screen';
          root.add(screen);
          c.screen = screen;

          /* ---- THE ROD, LEANT ON THE WALL AND ACTUALLY BUILT.
           *
           * Owner playtest, verbatim: "fishing rod needs to be a bit more
           * detailed and leaning against the wall instead of in the air".
           * Both halves measured. It was ONE bare cylinder -- no grip, no
           * reel, no guides, no taper, nothing that makes a rod a rod -- and
           * it leant the WRONG WAY: `rotZ: -0.12` tips the top toward +x, so
           * the tip finished at x -15.474, half a metre out into the room,
           * while the butt sat nearer the wall at -15.726. A rod stood on its
           * tip leaning away from the wall. The only other piece, a chrome
           * disc meant to be the reel, hung 100 mm off the blank's own axis.
           *
           * Rebuilt along a single measured axis so every part is ON the rod:
           * `rodAt(t)` returns the point t metres up from the butt, and the
           * grip, reel seat, reel, guides and tip section are all placed
           * through it. Leant at 0.216 rad the other way, which puts the butt
           * on the floor at x -15.500 and the tip at -15.950 -- 50 mm off the
           * plaster, i.e. against the wall. */
          const rodZ = r.z1 - 1.4;
          const rodX = outerX + inward * 0.275;
          const rodA = inward * 0.216;
          const rodDX = -Math.sin(rodA);
          const rodDY = Math.cos(rodA);
          const rodAt = (t) => [rodX - 1.05 * rodDX + t * rodDX, UY + t * rodDY, rodZ];
          root.add(named(cylinder({
            r: 0.018, h: 2.1, pos: [rodX, UY + 1.05 * rodDY, rodZ], mat: M_WOOD, rotZ: rodA,
          }), 'lake-rod'));
          // Cork grip, winding check, reel seat and the reel itself.
          root.add(named(cylinder({
            r: 0.033, h: 0.30, pos: rodAt(0.20), mat: mat({ color: 0xc9a877, roughness: 0.95 }), rotZ: rodA,
          }), 'lake-rod-grip'));
          root.add(named(cylinder({
            r: 0.026, h: 0.03, pos: rodAt(0.36), mat: M_CHROME, rotZ: rodA, cast: false,
          }), 'lake-rod-check'));
          root.add(named(cylinder({
            r: 0.028, h: 0.13, pos: rodAt(0.45), mat: M_CHROME, rotZ: rodA,
          }), 'lake-rod-reel-seat'));
          {
            const [rx, ry] = rodAt(0.45);
            root.add(named(cylinder({
              r: 0.055, h: 0.045, pos: [rx, ry - 0.075, rodZ + 0.055], mat: M_CHROME, rotX: Math.PI / 2,
            }), 'lake-rod-reel'));
            root.add(named(cylinder({
              r: 0.028, h: 0.05, pos: [rx, ry - 0.075, rodZ + 0.085], mat: M_LAKE_BLUE, rotX: Math.PI / 2, cast: false,
            }), 'lake-rod-spool'));
            root.add(named(cylinder({
              r: 0.006, h: 0.05, pos: [rx + 0.035, ry - 0.075, rodZ + 0.10], mat: M_CHROME, rotX: Math.PI / 2, cast: false,
            }), 'lake-rod-reel-handle'));
            root.add(box({
              size: [0.02, 0.05, 0.02], pos: [rx, ry - 0.04, rodZ + 0.03], mat: M_CHROME, cast: false, name: 'lake-rod-reel-foot',
            }));
          }
          // Line guides up the blank, and a whipped-on tip section.
          for (const t of [0.72, 1.02, 1.32, 1.58, 1.80]) {
            root.add(named(cylinder({
              r: 0.014, h: 0.012, pos: rodAt(t), mat: M_CHROME, rotZ: rodA, cast: false,
            }), 'lake-rod-guide'));
          }
          root.add(named(cylinder({
            rTop: 0.006, rBottom: 0.014, h: 0.30, pos: rodAt(1.95), mat: M_WOOD, rotZ: rodA, cast: false,
          }), 'lake-rod-tip'));
          root.add(box({
            size: [0.36, 0.3, 0.26], pos: [rodX + 0.16, UY + 0.15, rodZ + 0.3], mat: M_LAKE_ROPE, name: 'lake-creel',
          }));
          root.add(box({
            size: [0.4, 0.06, 0.3], pos: [rodX + 0.16, UY + 0.32, rodZ + 0.3], mat: M_LAKE_ROPE, cast: false,
          }));
          solid(rodX - 0.1, rodX + 0.36, UY, UY + 0.5, rodZ - 0.1, rodZ + 0.46);
          for (const [dx2, dz2, dr] of [[-0.12, -0.06, 0.09], [0.11, 0.07, 0.08]]) {
            const sx = c.sideTableX + dx2;
            const sz = cz + 2.9 + dz2;
            root.add(sphere({
              r: dr, ry: dr * 0.72, pos: [sx, UY + 0.66, sz], mat: mat({ color: 0x4a3a22, roughness: 0.85 }), name: 'lake-decoy',
            }));
            root.add(sphere({
              r: dr * 0.5, pos: [sx + dr * 0.9, UY + 0.75, sz], mat: mat({ color: 0x2c5f37, roughness: 0.8 }), cast: false,
            }));
          }
        },
      },
      extra: ({ cz, r }) => {
        /* A writing desk under the window, with a lamp and a letter.
         *
         * On the INNER half of the room. It used to stand at cx-1.6, which is
         * the outer half -- and the door through to the ensuite is in the
         * OUTER corner, so the desk stood across it and left 27 cm of gap.
         * The ensuite was unreachable on foot from the bedroom it belongs to,
         * and every check passed because they all teleported to the far side
         * of the desk before holding W. */
        const dx = r.x1 - 3.05;
        root.add(box({ size: [1.5, 0.07, 0.7], pos: [dx, UY + 0.75, cz + 3.4], mat: M_WOOD_DK }));
        for (const [ox, oz] of [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]]) {
          root.add(box({ size: [0.07, 0.75, 0.07], pos: [dx + ox, UY + 0.37, cz + 3.4 + oz], mat: M_WOOD_DK }));
        }
        solid(dx - 0.8, dx + 0.8, UY, UY + 0.8, cz + 3.05, cz + 3.75);
        root.add(box({
          size: [0.24, 0.01, 0.32], pos: [dx, UY + 0.79, cz + 3.4], mat: M_CARD, cast: false,
        }));
      },
    }),
    eastRear: buildBedroom({
      rect: BED_EAST_REAR,
      name: 'bed-east-rear',
      headboardWall: 'south',
      palette: {
        headboard: M_MOD_FABRIC,
        chair: M_MOD_FABRIC,
        chairKind: 'none',
        curtain: M_CURTAIN,
        wardrobe: M_MOD_WALL,
        wardrobeDoor: M_GLASS_CASE,
        metal: M_CHROME,
        sideTable: M_CHROME,
        floor: mat({ map: tiled(laminate('#c9c3b8'), 4, 6), roughness: 0.42, unique: true }),
        rug: mat({ map: fabricTex('#5c6067'), roughness: 0.95 }),
        artLabel: 'SILVER PINES',
        artTint: '#1a2218',
        // Clear of this room's east glazing at z 55.6..62.4 -- see `dresserZ`.
        dresserZ: 54.3,
        /* THE SUPER MODERN ROOM. Slab walls with an LED cove, a slatted
         * timber feature wall behind a low platform bed, a linear ceiling
         * light, a moulded lounge chair and ottoman, and a flat panel hung on
         * the wall over a floating media unit -- the only television in the
         * house that is not in a cabinet, because this is the only room in
         * the house that would not put it in one. */
        light: ({ cx, cz }) => {
          root.add(box({
            size: [0.34, 0.1, 3.2], pos: [cx, UCY - 0.4, cz], mat: M_MOD_WALL, cast: false, name: 'modern-light-blade',
          }));
          root.add(box({
            size: [0.26, 0.04, 3.06], pos: [cx, UCY - 0.46, cz], mat: M_MOD_LED, cast: false,
          }));
          const l = new THREE.PointLight(0xeaf2ff, 5.4, 15, 2);
          l.position.set(cx, UCY - 0.6, cz);
          root.add(l);
          return l;
        },
        dress: (c) => {
          const {
            r, cx, cz, bedX, bedZ, hbZ, innerX,
          } = c;
          const doors = [[13.1, 14.9]];
          /* Slab wall lining with a lit cove over it, notched for both doors
           * AND for this room's own window. The lining is the only one of the
           * four themes tall enough to reach past a sill -- 2.12 m of it --
           * so the east wall's glazing at z 55.6..62.4 is cut out of both
           * bands and the lining reads as two panels either side of the
           * glass, which is what a room like this does anyway. */
          const eastWindow = [[55.6, 62.4]];
          bedroomBand({
            r,
            y0: UY + 0.18,
            y1: UY + 2.3,
            material: M_MOD_WALL,
            southGaps: doors,
            northGaps: doors,
            eastGaps: eastWindow,
          });
          bedroomBand({
            r,
            y0: UY + 2.32,
            y1: UY + 2.4,
            material: M_MOD_LED,
            t: 0.09,
            southGaps: doors,
            northGaps: doors,
            eastGaps: eastWindow,
          });
          for (const gz of [cz - 3.0, cz + 3.0]) {
            const g = new THREE.PointLight(0x9fc4ff, 1.6, 6, 2);
            g.position.set(innerX + (innerX < cx ? 0.6 : -0.6), UY + 2.5, gz);
            root.add(g);
          }
          /* Slatted timber behind the bed: vertical battens on the headboard
           * wall, stopping well clear of the doorway at x 13.1..14.9. */
          for (let i = 0; i < 16; i++) {
            const sx = bedX - 1.5 + i * 0.2;
            root.add(box({
              size: [0.07, 2.5, 0.09], pos: [sx, UY + 1.4, hbZ - 0.22], mat: M_MOD_SLAT, cast: false, name: 'modern-slat',
            }));
          }
          root.add(box({
            size: [3.3, 2.5, 0.05], pos: [bedX, UY + 1.4, hbZ - 0.16], mat: M_STOVE_BLACK, cast: false,
          }));

          /* The bed as a platform: a plinth under the shared frame with a
           * shadow gap of LED at its base, and a wide low headboard. */
          /* Three pieces, in this order, or the detail does not exist: an
           * inset dark base on the floor, an LED band 3 cm wider than it, and
           * the platform 12 cm wider again on top. Drawn as a 2.3 m LED slab
           * under a 2.5 m platform (which is what this was first), the light
           * is entirely INSIDE the platform and the "shadow gap" is a box
           * nobody can see. */
          root.add(box({
            size: [2.2, 0.06, 2.6], pos: [bedX, UY + 0.03, bedZ], mat: M_STOVE_BLACK, cast: false, name: 'modern-bed-base',
          }));
          root.add(box({
            size: [2.26, 0.03, 2.66], pos: [bedX, UY + 0.075, bedZ], mat: M_MOD_LED, cast: false, name: 'modern-bed-cove',
          }));
          root.add(box({
            size: [2.5, 0.07, 2.9], pos: [bedX, UY + 0.125, bedZ], mat: M_MOD_WALL, cast: false, name: 'modern-bed-platform',
          }));
          root.add(box({
            size: [2.6, 0.12, 0.24], pos: [bedX, UY + 0.9, hbZ + 0.14], mat: M_CHROME, cast: false,
          }));
          root.add(box({
            size: [2.1, 0.1, 1.6], pos: [bedX, UY + 0.76, bedZ + 0.3], mat: M_MOD_FABRIC, cast: false, name: 'modern-throw',
          }));
          for (const ox of [-0.5, 0.5]) {
            root.add(box({
              size: [0.4, 0.14, 0.4], pos: [bedX + ox, UY + 0.78, hbZ + 0.62], mat: M_LEATHER_DK, rotY: 0.1, cast: false, name: 'modern-cushion',
            }));
          }

          /* The media wall: a floating unit with a shadow gap under it and a
           * flat panel hung over it, on the north wall dead ahead of the foot
           * of the bed. The old set stood on a stand at (12.2, 62.9) -- in the
           * middle of the floor, against nothing. */
          const tvZ = r.z1 - 0.34;
          root.add(box({
            size: [2.4, 0.42, 0.44], pos: [bedX, UY + 0.42, tvZ], mat: M_MOD_WALL, name: 'modern-media-unit',
          }));
          root.add(box({
            size: [2.44, 0.03, 0.48], pos: [bedX, UY + 0.2, tvZ], mat: M_MOD_LED, cast: false,
          }));
          root.add(box({
            size: [2.3, 0.02, 0.4], pos: [bedX, UY + 0.63, tvZ], mat: M_CHROME, cast: false,
          }));
          solid(bedX - 1.2, bedX + 1.2, UY + 0.2, UY + 0.65, tvZ - 0.25, tvZ + 0.25);
          root.add(box({
            size: [1.9, 1.1, 0.07], pos: [bedX, UY + 1.55, tvZ - 0.06], mat: M_STOVE_BLACK, name: 'modern-tv-panel',
          }));
          const screen = new THREE.Mesh(
            new THREE.PlaneGeometry(1.82, 1.02),
            bedroomScreenMaterial('modern', ['SILVER', 'SASQUATCHES'], '#9fd0ff', '#080b12'),
          );
          screen.position.set(bedX, UY + 1.55, tvZ - 0.1);
          screen.rotation.y = Math.PI;
          screen.name = 'bed-east-rear-screen';
          root.add(screen);
          c.screen = screen;
          root.add(box({
            size: [1.4, 0.09, 0.12], pos: [bedX, UY + 0.9, tvZ - 0.1], mat: M_STOVE_BLACK, cast: false, name: 'modern-soundbar',
          }));

          /* A moulded lounge chair and its ottoman, in place of the shared
           * armchair (`chairKind: 'none'` above), on a chrome base. */
          /* OUT OF THE WARDROBE'S FACE, AND OFF THE SIDE TABLE.
           *
           * Owner playtest, verbatim: "Chair clipping closet". Measured, the
           * lounge chair's near arm stood at x 10.055 with the wardrobe's door
           * handles at 9.95 -- 105 mm, which is not a gap you could open that
           * door into, and reads as contact from anywhere in the room. Worse
           * and unreported: its ottoman at x 11.15..11.75, z 62.15..62.65 ran
           * straight through the shared side table's pedestal at 11.67..11.83,
           * z 62.32..62.48. Chair, ottoman and table were all crammed into the
           * same 1.2 m of the room's south-west corner.
           *
           * The corner is unpacked rather than nudged: the lounge chair and
           * its ottoman move to the empty pocket between the bed's foot and
           * the side table, which no other piece in this room uses. That also
           * leaves the wardrobe corner clear for somebody to stand in.
           *
           * NOT to the east window, which was the first place they went and
           * which the walking test refused: this room's gallery door and its
           * ensuite door are BOTH at x 13.1..14.9, so that strip is a lane
           * running the full depth of the room and nothing may stand in it.
           * The chair at x 13.575..14.575 blocked it and the tour stuck at
           * (13.985, 59.78). The pocket below is west of the lane, east of
           * the wardrobe, north of the bed and south of the side table. */
          const lx = innerX + (innerX < cx ? 2.25 : -2.25);
          const lz = cz - 0.9;
          root.add(box({
            size: [0.86, 0.2, 0.8], pos: [lx, UY + 0.42, lz], mat: M_LEATHER_DK, rotX: -0.06, name: 'modern-lounge-seat',
          }));
          /* Set 0.44 back, not 0.34: at 0.34 the tilted back drove 297 mm into
           * an 800 mm seat, so more than a third of the seat was inside it. */
          root.add(box({
            size: [0.86, 0.86, 0.22], pos: [lx, UY + 0.84, lz - 0.44], mat: M_LEATHER_DK, rotX: -0.3, name: 'modern-lounge-back',
          }));
          for (const s of [-1, 1]) {
            root.add(box({
              size: [0.09, 0.24, 0.62], pos: [lx + s * 0.45, UY + 0.56, lz], mat: M_MOD_SLAT, cast: false,
            }));
          }
          root.add(cylinder({ r: 0.05, h: 0.32, pos: [lx, UY + 0.16, lz], mat: M_CHROME }));
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            root.add(box({
              size: [0.5, 0.04, 0.06], pos: [lx + Math.cos(a) * 0.25, UY + 0.03, lz + Math.sin(a) * 0.25], mat: M_CHROME, rotY: -a, cast: false,
            }));
          }
          solid(lx - 0.5, lx + 0.5, UY, UY + 0.5, lz - 0.5, lz + 0.5);
          root.add(box({
            size: [0.6, 0.18, 0.5], pos: [lx + (innerX < cx ? 0.9 : -0.9), UY + 0.42, lz + 0.5], mat: M_LEATHER_DK, name: 'modern-ottoman',
          }));
          root.add(cylinder({
            r: 0.04, h: 0.34, pos: [lx + (innerX < cx ? 0.9 : -0.9), UY + 0.17, lz + 0.5], mat: M_CHROME,
          }));
          solid(
            lx + (innerX < cx ? 0.9 : -0.9) - 0.32, lx + (innerX < cx ? 0.9 : -0.9) + 0.32,
            UY, UY + 0.52, lz + 0.24, lz + 0.76,
          );
          // An abstract panel on the inner wall, and a chrome arc lamp by the
          // lounge chair.
          const panel = flatArt('modern-art-panel', {
            x: innerX + 0.1,
            y: UY + 1.7,
            z: cz - 1.4,
            rotY: Math.PI / 2,
            w: 1.6,
            h: 1.1,
            material: mat({
              map: printed('mansion.modern.panel', ['', ''], {
                w: 512, h: 352, bg: '#20242c', fg: '#9fd0ff', border: '#9fd0ff',
              }),
              roughness: 0.6,
              unique: true,
            }),
          });
          panel.name = 'modern-art-panel';
          root.add(box({
            size: [0.05, 1.24, 1.74], pos: [innerX + 0.06, UY + 1.7, cz - 1.4], mat: M_CHROME, cast: false,
          }));
        },
      },
      extra: ({ cz, r }) => {
        /* The room's own one-off: a low bench at the foot of the platform,
         * where the television stand used to stand in the middle of the
         * floor. It is 0.42 m tall, so it neither blocks the media wall nor
         * the run through to the ensuite. */
        const tx = r.x0 + 3.05;
        root.add(box({ size: [1.4, 0.12, 0.5], pos: [tx, UY + 0.4, cz + 3.4], mat: M_MOD_FABRIC, name: 'modern-bench' }));
        for (const ox of [-0.6, 0.6]) {
          root.add(box({ size: [0.06, 0.34, 0.44], pos: [tx + ox, UY + 0.17, cz + 3.4], mat: M_CHROME }));
        }
        root.add(box({
          size: [0.44, 0.08, 0.36], pos: [tx + 0.3, UY + 0.5, cz + 3.4], mat: M_LEATHER_DK, rotY: 0.2, cast: false,
        }));
        solid(tx - 0.7, tx + 0.7, UY, UY + 0.46, cz + 3.15, cz + 3.65);
      },
    }),
  };

  /* ================================================================== */
  /* UPPER FLOOR -- THE TWO ENSUITE BATHROOMS                            */
  /*                                                                      */
  /* Three notes off the same walk, all of them here (owner playtest       */
  /* 2026-08-04, verbatim):                                                 */
  /*                                                                        */
  /*   "the bathroom tiles overlap the door to the bathrooms"                */
  /*   "Bathrooms are kind of a mess too."                                    */
  /*                                                                          */
  /* THE TILES. The four tiled wall bands were emitted as four solid boxes     */
  /* spanning the room's whole width, 2 m tall, and the south one ran straight */
  /* across the ensuite doorway: measured at x -14.9..-13.1, z 66.15..66.20,   */
  /* y 6.0..8.0 -- a tiled slab standing in an opening that is 1.8 m wide and  */
  /* 2.4 m tall, clipping through the architrave's own case (z 65.82..66.18)   */
  /* on its way. The bands are now cut round the doorway with `linedBand`,     */
  /* which is the same treatment the lower level's linings already get, and    */
  /* the reveal of the opening is tiled properly instead.                      */
  /*                                                                            */
  /* THE MESS. What was in here was a tub, a loo, a basin, a rail and two       */
  /* towels in a tiled box. What is in here now is a bathroom in an ultra       */
  /* luxury house: a marble border and a mosaic panel in the floor, a marble    */
  /* dado cap and a gilt band over the tiling, a glazed walk-in shower with a   */
  /* rain head and a bench, a marble vanity with a vessel bowl and a lit        */
  /* mirror, the tub kept but given a filler, a tray and a mat, folded towels,  */
  /* a robe, a stool and a plant.                                               */
  /*                                                                             */
  /* Both rooms are built by this one function and mirror on `inward`, and       */
  /* everything below is kept out of the strip the doorway stands on.            */
  /* ================================================================== */
  function buildBathroom(rect, name) {
    const r = rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const tile = bathTileMaterial(r.x1 - r.x0, r.z1 - r.z0);
    topping(r.x0, r.x1, UY + 0.012, r.z0, r.z1, tile, `${name}-floor`);
    /* Tiled walls to shoulder height, CUT ROUND THE DOORWAY in the south
     * wall. `doorGap` is the opening the `bath-wall` partition declares for
     * this room -- x -14.9..-13.1 in the west ensuite, 13.1..14.9 in the
     * east one. */
    const inward = r.x0 < 0 ? 1 : -1;
    const doorGap = inward > 0 ? [-14.9, -13.1] : [13.1, 14.9];
    /* ...and the OUTER wall's bands are cut round this room's own window as
     * well. It is frosted and it is only 3.8 m of a 8.85 m wall, but the
     * tiling runs y 6.0..8.0 and the glass y 7.4..8.8, so an uncut band tiles
     * over the bottom 0.6 m of it and the marble cap over the middle. */
    const winGap = [[67.6, 71.4]];
    const outerIsWest = inward > 0;
    const tileWall = bathTileMaterial(Math.max(r.x1 - r.x0, r.z1 - r.z0), 2.0);
    linedBand({
      axis: 'x', x0: r.x0, x1: r.x1, y0: UY, y1: UY + 2.0, z0: r.z0, z1: r.z0 + 0.05, material: tileWall, gaps: [doorGap],
    });
    linedBand({
      axis: 'x', x0: r.x0, x1: r.x1, y0: UY, y1: UY + 2.0, z0: r.z1 - 0.05, z1: r.z1, material: tileWall,
    });
    linedBand({
      axis: 'z', x0: r.x0, x1: r.x0 + 0.05, y0: UY, y1: UY + 2.0, z0: r.z0, z1: r.z1, material: tileWall, gaps: outerIsWest ? winGap : [],
    });
    linedBand({
      axis: 'z', x0: r.x1 - 0.05, x1: r.x1, y0: UY, y1: UY + 2.0, z0: r.z0, z1: r.z1, material: tileWall, gaps: outerIsWest ? [] : winGap,
    });
    // A marble cap on the tiling, with a gilt band under it, cut round the
    // doorway on the south wall and round the window on the outer one.
    for (const [bx0, bx1, bz0, bz1, gaps] of [
      [r.x0, r.x1, r.z0, r.z0 + 0.07, [doorGap]],
      [r.x0, r.x1, r.z1 - 0.07, r.z1, []],
    ]) {
      linedBand({
        axis: 'x', x0: bx0, x1: bx1, y0: UY + 2.0, y1: UY + 2.09, z0: bz0, z1: bz1, material: M_MARBLE, gaps,
      });
      linedBand({
        axis: 'x', x0: bx0, x1: bx1, y0: UY + 1.94, y1: UY + 1.99, z0: bz0 - 0.01, z1: bz1 + 0.01, material: M_GOLD, gaps,
      });
    }
    for (const [bx0, bx1, gaps] of [
      [r.x0, r.x0 + 0.07, outerIsWest ? winGap : []],
      [r.x1 - 0.07, r.x1, outerIsWest ? [] : winGap],
    ]) {
      linedBand({
        axis: 'z', x0: bx0, x1: bx1, y0: UY + 2.0, y1: UY + 2.09, z0: r.z0, z1: r.z1, material: M_MARBLE, gaps,
      });
      linedBand({
        axis: 'z', x0: bx0 - 0.01, x1: bx1 + 0.01, y0: UY + 1.94, y1: UY + 1.99, z0: r.z0, z1: r.z1, material: M_GOLD, gaps,
      });
    }
    /* Nothing is added inside the reveal itself: `partition` already lines
     * every opening in the house with a moulded case, and a tiled return
     * inside that case measured as standing 3.5 cm proud of it. The doorway
     * is simply left alone now, which is the whole of the owner's note. */
    const wrap = new THREE.Group();
    wrap.position.y = UY;
    const tubX0 = inward > 0 ? r.x0 + 0.35 : r.x1 - 2.15;
    const tub = makeTub(M, {
      x0: tubX0, z0: cz + 0.6, x1: tubX0 + 1.8, z1: cz + 3.0,
    });
    wrap.add(tub.group);
    solid(tubX0, tubX0 + 1.8, UY, UY + 0.56, cz + 0.6, cz + 3.0);
    /* THE LOO GOES BACK AGAINST ITS DUCT. Owner playtest, verbatim: "toilet
     * away from wall". Measured: the pan stood at 0.8 m off the partition and
     * `makeToilet` puts the cistern's back 0.385 m behind its centre, so the
     * cistern's back face was at x 9.555 against a tiled wall faced at 9.20 --
     * a 355 mm gap with the pipework of a close-coupled suite hanging in it.
     * Seated on the duct below instead: 0.66 m off the partition, which puts
     * the cistern 5 mm INTO the duct's 0.28 m face rather than short of it.
     * (5 mm into, not exactly on: two faces at the same depth is the flicker,
     * and a cistern that touches its wall has never shown a seam.) */
    const looX = inward > 0 ? r.x1 - 0.66 : r.x0 + 0.66;
    const loo = makeToilet(M, {
      x: looX, z: cz + 2.4, rotY: inward > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
    wrap.add(loo.group);
    solid(looX - 0.4, looX + 0.4, UY, UY + 0.84, cz + 2.1, cz + 2.7);
    root.add(wrap);
    /* THE OLD SINK IS GONE. Owner, twice -- of this room, "two sinks, get rid
     * of the old sink, fix new sink", and of the modern one, "same thing with
     * the old sink". Both ensuites carried the shared apartment pedestal basin
     * AND the marble vanity the luxury pass added, standing 1.7 m apart down
     * the same wall with a mirror over each. The pedestal basin and its mirror
     * are deleted here; the vanity below is the one sink these rooms have, and
     * it is reworked rather than merely left. */
    /* ---- Everything from here is the luxury pass. `outerX` is the exterior
     * wall (the one with the frosted window in it), `innerX` the partition
     * side, and `into` moves a piece off a wall toward the middle of the
     * room whichever ensuite this is. */
    const outerX = inward > 0 ? r.x0 : r.x1;
    const innerX = inward > 0 ? r.x1 : r.x0;
    const into = (fromWall, d) => fromWall + (fromWall === outerX ? inward : -inward) * d;
    const M_TOWEL = mat({ color: 0xe6ddc8, roughness: 1 });
    const M_MOSAIC = retiled(bathMosaicBase, 8, 8, 'bathmosaic', { roughness: 0.28 });

    // Floor: a marble border and a mosaic panel in the middle of it.
    for (const [bx0, bx1, bz0, bz1] of [
      [r.x0 + 0.5, r.x1 - 0.5, r.z0 + 0.5, r.z0 + 0.75],
      [r.x0 + 0.5, r.x1 - 0.5, r.z1 - 0.75, r.z1 - 0.5],
      [r.x0 + 0.5, r.x0 + 0.75, r.z0 + 0.5, r.z1 - 0.5],
      [r.x1 - 0.75, r.x1 - 0.5, r.z0 + 0.5, r.z1 - 0.5],
    ]) topping(bx0, bx1, UY + 0.02, bz0, bz1, M_MARBLE_DK, `${name}-floor-border`);
    topping(cx - 1.1, cx + 1.1, UY + 0.018, cz - 1.3, cz + 0.1, M_MOSAIC, `${name}-floor-mosaic`);

    /* ---- THE WC DUCT, WHICH IS WHAT BOTH LOO NOTES WERE ASKING FOR.
     *
     * Owner: "toilet away from wall" and "toilet paper floating". They are one
     * missing object. `makeToilet` is drawn for a wall it never had in here:
     * its cistern wants a face to stand on, and its paper holder is a 0.14 m
     * rod cantilevered 0.34 m out to the side, which needs a return to be
     * screwed to. Measured, the roll hung at x 9.85 with the nearest wall at
     * 9.20 -- 650 mm of nothing under it.
     *
     * So the room gets the thing a WC in a house like this actually has: a
     * tiled duct boxed along the partition with a marble cap, and a short
     * return pier at each end. The cistern sits on the duct and the roll hangs
     * off a pier. Both returns are built in both ensuites on purpose -- the
     * two rooms are mirrored, so the holder falls on the SOUTH pier in the
     * west room and the NORTH pier in the east one, and a pair is symmetrical
     * anyway. The piers are 0.86 m deep to reach the rod's fixing at 0.70,
     * and they sit at z cz+1.95 and cz+2.85, which is 200 mm clear of the pan
     * at cz+2.21..cz+2.59 on both sides. */
    /* Every one of these boxes starts 30 mm INSIDE the partition rather than
     * on its face. A duct whose back plane is exactly the wall's own front
     * plane is a 1 m^2 coplanar pair -- the flicker -- and burying the hidden
     * face costs nothing because nobody can see behind a duct. */
    const ductBack = into(innerX, -0.03);
    const boxFace = (depth) => [Math.min(ductBack, into(innerX, depth)), Math.max(ductBack, into(innerX, depth))];
    const [ductX0, ductX1] = boxFace(0.28);
    root.add(box({
      size: [ductX1 - ductX0, 1.02, 1.02], pos: [(ductX0 + ductX1) / 2, UY + 0.51, cz + 2.4], mat: tileWall, name: `${name}-wc-duct`,
    }));
    root.add(box({
      size: [ductX1 - ductX0 + 0.02, 0.05, 1.06], pos: [(ductX0 + ductX1) / 2 - inward * 0.01, UY + 1.045, cz + 2.4], mat: M_MARBLE, cast: false, name: `${name}-wc-duct-cap`,
    }));
    const [pierX0, pierX1] = boxFace(0.86);
    for (const pz of [cz + 1.95, cz + 2.85]) {
      root.add(box({
        size: [pierX1 - pierX0, 1.02, 0.12], pos: [(pierX0 + pierX1) / 2, UY + 0.51, pz], mat: tileWall, name: `${name}-wc-pier`,
      }));
      root.add(box({
        size: [pierX1 - pierX0 + 0.02, 0.05, 0.16], pos: [(pierX0 + pierX1) / 2 - inward * 0.01, UY + 1.045, pz], mat: M_MARBLE, cast: false, name: `${name}-wc-pier-cap`,
      }));
    }
    solid(pierX0, pierX1, UY, UY + 1.07, cz + 1.89, cz + 2.91);
    /* A brush in the corner between the duct and the south pier. Placed off
     * the pan (which runs cz+2.21..cz+2.59) and off the pier (which ends at
     * cz+2.01) rather than under the roll: the roll falls on the south pier
     * in the west room and the north one in the east, so the only spot clear
     * in BOTH is the gap between pier and pan. */
    const brushX = into(innerX, 0.42);
    const brushZ = cz + 2.10;
    root.add(named(cylinder({
      rTop: 0.055, rBottom: 0.07, h: 0.26, pos: [brushX, UY + 0.13, brushZ], mat: M_CHROME,
    }), `${name}-wc-brush-pot`));
    root.add(named(cylinder({
      r: 0.011, h: 0.34, pos: [brushX, UY + 0.34, brushZ], mat: M_CHROME, cast: false,
    }), `${name}-wc-brush-stem`));
    root.add(named(sphere({
      r: 0.055, ry: 0.04, pos: [brushX, UY + 0.5, brushZ], mat: mat({ color: 0xe8e4d8, roughness: 1 }), cast: false,
    }), `${name}-wc-brush-head`));

    /* ---- The walk-in shower, along the north wall between the tub (which
     * ends at 1.8 m off the outer wall) and the loo (0.4..1.2 m off the inner
     * one). Marble kerb and slab, a glass screen and a return, a rain head on
     * its arm, a bench and a niche. */
    /* 2.3 m off the outer wall, not 2.1: the tub is 1.8 m of it from 0.35, so
     * its far edge is at 2.15 and a tray starting at 2.1 measured as lapping
     * the tub by 5 cm. */
    /* EVERY PIECE IS PLACED BY ITS ROLE, NOT BY min/max. Owner playtest:
     * "shower and bathtub lot of floating and misaligned geometry". A good
     * part of it came from this block mixing two frames of reference. The
     * glass return went at `shMinX`, which is the TUB end of the shower in
     * the west ensuite and the LOO end in the east one -- so the two mirrored
     * rooms had their shower entrance on opposite sides -- while the bench and
     * mixer went at `into(outerX, ...)`, which is always the tub end. In the
     * east room that put the bench squarely in the shower's own doorway, and
     * in the west one it drove the bench 20 mm through the return glass.
     *
     * `shOuter` is the tub end and `shInner` the loo end in BOTH rooms, and
     * `toIn` steps from one toward the other, so a single set of numbers
     * builds the room and its mirror image identically. */
    const shOuter = into(outerX, 2.3);
    const shInner = into(innerX, 1.5);
    const shW = Math.abs(shInner - shOuter);
    const toIn = Math.sign(shInner - shOuter);
    const shZ0 = r.z1 - 1.7;
    const shZ1 = r.z1 - 0.06;
    const shMinX = Math.min(shOuter, shInner);
    const shMaxX = Math.max(shOuter, shInner);
    root.add(box({
      size: [shW, 0.12, shZ1 - shZ0], pos: [(shMinX + shMaxX) / 2, UY + 0.06, (shZ0 + shZ1) / 2], mat: M_MARBLE, cast: false, name: `${name}-shower-tray`,
    }));
    root.add(box({
      size: [shW, 0.14, 0.12], pos: [(shMinX + shMaxX) / 2, UY + 0.07, shZ0], mat: M_MARBLE_DK, cast: false, name: `${name}-shower-kerb`,
    }));
    root.add(named(cylinder({
      r: 0.09, h: 0.02, pos: [(shMinX + shMaxX) / 2, UY + 0.13, (shZ0 + shZ1) / 2], mat: M_CHROME, cast: false,
    }), `${name}-shower-waste`));
    /* Glass: a fixed screen across two thirds of the front from the TUB end,
     * and a return down that same end -- an L, with the way in at the loo end
     * where the door is, in both rooms. */
    root.add(box({
      size: [shW * 0.62, 2.1, 0.04], pos: [shOuter + toIn * shW * 0.31, UY + 1.19, shZ0], mat: M_GLASS_CASE, name: `${name}-shower-glass`,
    }));
    root.add(box({
      size: [shW * 0.62 + 0.06, 0.06, 0.07], pos: [shOuter + toIn * shW * 0.31, UY + 2.26, shZ0], mat: M_CHROME, cast: false, name: `${name}-shower-glass-rail`,
    }));
    root.add(box({
      size: [0.04, 2.1, shZ1 - shZ0], pos: [shOuter, UY + 1.19, (shZ0 + shZ1) / 2], mat: M_GLASS_CASE, name: `${name}-shower-return`,
    }));
    solid(shOuter - 0.03, shOuter + 0.03, UY, UY + 2.1, shZ0, shZ1);
    solid(
      Math.min(shOuter, shOuter + toIn * shW * 0.62), Math.max(shOuter, shOuter + toIn * shW * 0.62),
      UY, UY + 2.1, shZ0 - 0.03, shZ0 + 0.03,
    );
    /* Rain head on its arm. THE ARM HAS TO REACH THE WALL: it was 0.55 m long
     * centred at shZ1-0.30, so it stopped at z 74.915 with the tiled face at
     * 74.95 -- a 35 mm gap, and a shower arm hanging off nothing. Lengthened
     * to 0.60 and pushed back so it ends 30 mm INSIDE the tiling, with a
     * flange where it enters. */
    const headX = (shMinX + shMaxX) / 2;
    root.add(named(cylinder({
      r: 0.024, h: 0.60, pos: [headX, UY + 2.3, shZ1 - 0.26], mat: M_CHROME, rotZ: Math.PI / 2, rotY: Math.PI / 2,
    }), `${name}-rain-arm`));
    root.add(named(cylinder({
      r: 0.055, h: 0.02, pos: [headX, UY + 2.3, shZ1 - 0.02], mat: M_CHROME, rotX: Math.PI / 2, cast: false,
    }), `${name}-rain-flange`));
    root.add(named(cylinder({
      r: 0.16, h: 0.04, pos: [headX, UY + 2.28, shZ1 - 0.58], mat: M_CHROME,
    }), `${name}-rain-head`));
    root.add(named(cylinder({
      r: 0.018, h: 0.9, pos: [shInner - toIn * 0.25, UY + 1.5, shZ1 - 0.08], mat: M_CHROME,
    }), `${name}-shower-riser`));
    root.add(named(cylinder({
      r: 0.05, h: 0.12, pos: [shInner - toIn * 0.25, UY + 1.5, shZ1 - 0.14], mat: M_CHROME, rotX: 0.6, cast: false,
    }), `${name}-hand-shower`));
    root.add(box({
      size: [0.16, 0.24, 0.06], pos: [shInner - toIn * 0.55, UY + 1.15, shZ1 - 0.08], mat: M_CHROME, cast: false, name: `${name}-shower-mixer`,
    }));
    // Niche in the tiled wall, with the bottles in it, and a marble bench.
    root.add(box({
      size: [0.7, 0.5, 0.1], pos: [headX, UY + 1.35, shZ1 - 0.03], mat: M_MARBLE_DK, cast: false, name: `${name}-shower-niche`,
    }));
    for (let i = 0; i < 3; i++) {
      root.add(named(cylinder({
        rTop: 0.035, rBottom: 0.045, h: 0.18, pos: [headX - 0.2 + i * 0.2, UY + 1.24, shZ1 - 0.12], mat: i % 2 ? M_GLASS_CASE : M_SILVER, cast: false,
      }), `${name}-shower-bottle`));
    }
    /* The bench, in the L's corner at the tub end -- 50 mm clear of the return
     * glass rather than 20 mm through it. ITS LEGS STAND ON THE TRAY: they ran
     * y 6.06..6.48 against a tray topping out at 6.12 and a bench slab
     * starting at 6.455, so they were 60 mm sunk into the floor of the shower
     * and 25 mm out through the seat. They now run 6.10..6.48: 20 mm into the
     * tray, which is a fixing, and up under the slab, which is a joint. */
    const benchX = shOuter + toIn * 0.40;
    root.add(box({
      size: [0.7, 0.09, 0.4], pos: [benchX, UY + 0.5, shZ1 - 0.28], mat: M_MARBLE, name: `${name}-shower-bench`,
    }));
    for (const bx of [-0.28, 0.28]) {
      root.add(box({
        size: [0.08, 0.38, 0.34], pos: [benchX + bx, UY + 0.29, shZ1 - 0.28], mat: M_MARBLE, cast: false, name: `${name}-shower-bench-leg`,
      }));
    }

    /* ---- The vanity: a marble counter on the inner wall carrying a vessel
     * bowl, with drawers under it, a mirror over it and a sconce each side.
     * South of the basin the shell already puts there, so the room reads as a
     * double vanity. */
    /* EVERY DEPTH ON THIS WALL IS MEASURED OFF THE TILING, NOT THE PLASTER.
     * The tiled band stands 0.05 m proud of the partition's own face, so a
     * mirror hung at 0.06 has its backing board inside the tile and its frame
     * exactly ON the tile's front plane -- which is a 1.39 m^2 coplanar pair
     * and the same flicker the doorway architraves were making. Everything
     * here therefore starts at 0.075 and steps forward from there. */
    const vanX = into(innerX, 0.4);
    const vanZ = cz - 2.3;
    root.add(box({
      size: [0.62, 0.78, 1.7], pos: [vanX, UY + 0.39, vanZ], mat: M_WOOD_DK, name: `${name}-vanity`,
    }));
    root.add(box({
      size: [0.66, 0.08, 1.8], pos: [vanX, UY + 0.82, vanZ], mat: M_MARBLE, name: `${name}-vanity-top`,
    }));
    for (const oz of [-0.42, 0.42]) {
      root.add(box({
        size: [0.03, 0.5, 0.72], pos: [into(innerX, 0.7), UY + 0.42, vanZ + oz], mat: M_WOOD, cast: false,
      }));
      root.add(cylinder({
        r: 0.016, h: 0.3, pos: [into(innerX, 0.72), UY + 0.42, vanZ + oz], mat: M_GOLD, rotX: Math.PI / 2, cast: false,
      }));
    }
    solid(
      Math.min(vanX, into(innerX, 0.72)) - 0.04, Math.max(vanX, into(innerX, 0.72)) + 0.04,
      UY, UY + 0.9, vanZ - 0.9, vanZ + 0.9,
    );
    /* ---- THE ONE SINK THIS ROOM HAS, MADE WORTH KEEPING.
     *
     * Owner: "fix new sink", and of the modern room's, refine it "just a tad".
     * The vessel bowl was a SOLID tapered cylinder -- a lump of marble with no
     * hollow in it, the same fault `makeToilet` was fixed for upstream ("no
     * actual bowl"). It is now built the way every basin in this project that
     * reads right is built: an open-ended outer shell, a rolled rim closing
     * the top edge, an inner cone falling to a waste, and standing water in
     * it. Plus the fittings a basin like this has and had none of -- a proper
     * arched spout, two lever handles, a splashback and a soap dish. */
    const bowlX = into(innerX, 0.48);
    const bowlY = UY + 0.86;
    const bowlShell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.15, 0.16, 28, 1, true),
      M_MARBLE,
    );
    bowlShell.position.set(bowlX, bowlY + 0.08, vanZ);
    bowlShell.castShadow = true;
    bowlShell.receiveShadow = true;
    bowlShell.name = `${name}-vessel-bowl`;
    root.add(bowlShell);
    const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.014, 10, 28), M_MARBLE);
    bowlRim.rotation.x = -Math.PI / 2;
    bowlRim.position.set(bowlX, bowlY + 0.158, vanZ);
    bowlRim.castShadow = true;
    bowlRim.name = `${name}-vessel-rim`;
    root.add(bowlRim);
    const bowlInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.192, 0.045, 0.145, 28, 1, true),
      mat({ color: 0xf0ece0, roughness: 0.16, side: THREE.DoubleSide }),
    );
    bowlInner.position.set(bowlX, bowlY + 0.083, vanZ);
    bowlInner.name = `${name}-vessel-inner`;
    root.add(bowlInner);
    root.add(named(cylinder({
      r: 0.032, h: 0.012, pos: [bowlX, bowlY + 0.016, vanZ], mat: M_CHROME, cast: false,
    }), `${name}-vessel-waste`));
    const bowlWater = new THREE.Mesh(
      new THREE.CircleGeometry(0.085, 24),
      mat({
        color: 0x9fc4cf, roughness: 0.06, transparent: true, opacity: 0.6, unique: true,
      }),
    );
    bowlWater.rotation.x = -Math.PI / 2;
    bowlWater.position.set(bowlX, bowlY + 0.028, vanZ);
    bowlWater.name = `${name}-vessel-water`;
    root.add(bowlWater);
    // A tall mixer with an arched spout that actually overhangs the bowl.
    root.add(named(cylinder({
      r: 0.024, h: 0.34, pos: [into(innerX, 0.20), UY + 1.07, vanZ], mat: M_GOLD,
    }), `${name}-basin-tap`));
    root.add(named(cylinder({
      r: 0.019, h: 0.30, pos: [into(innerX, 0.32), UY + 1.235, vanZ], mat: M_GOLD, rotZ: Math.PI / 2,
    }), `${name}-basin-spout`));
    root.add(named(cylinder({
      r: 0.017, h: 0.09, pos: [into(innerX, 0.455), UY + 1.19, vanZ], mat: M_GOLD, cast: false,
    }), `${name}-basin-spout-drop`));
    for (const oz of [-0.16, 0.16]) {
      root.add(named(cylinder({
        r: 0.016, h: 0.05, pos: [into(innerX, 0.20), UY + 0.9, vanZ + oz], mat: M_GOLD, cast: false,
      }), `${name}-basin-lever-boss`));
      root.add(named(cylinder({
        r: 0.011, h: 0.11, pos: [into(innerX, 0.26), UY + 0.94, vanZ + oz], mat: M_GOLD, rotZ: Math.PI / 2 - 0.5, cast: false,
      }), `${name}-basin-lever`));
    }
    // Splashback, and a soap dish on the counter.
    root.add(box({
      size: [0.06, 0.14, 1.8], pos: [into(innerX, 0.07), UY + 0.93, vanZ], mat: M_MARBLE, cast: false, name: `${name}-vanity-splashback`,
    }));
    root.add(named(cylinder({
      rTop: 0.075, rBottom: 0.055, h: 0.03, pos: [into(innerX, 0.42), UY + 0.875, vanZ - 0.6], mat: M_MARBLE_DK, cast: false,
    }), `${name}-soap-dish`));
    root.add(box({
      size: [0.07, 0.04, 0.1], pos: [into(innerX, 0.42), UY + 0.905, vanZ - 0.6], mat: mat({ color: 0xe8dcc8, roughness: 0.6 }), cast: false, name: `${name}-soap`,
    }));
    root.add(box({
      size: [0.05, 1.3, 1.5], pos: [into(innerX, 0.105), UY + 1.85, vanZ], mat: mat({ color: 0xdce6ee, roughness: 0.06, metalness: 0.9 }), name: `${name}-vanity-mirror`,
    }));
    root.add(box({
      size: [0.04, 1.42, 1.62], pos: [into(innerX, 0.075), UY + 1.85, vanZ], mat: M_GOLD, cast: false,
    }));
    recordArt(`${name}-vanity-mirror`, into(innerX, 0.105), UY + 1.85, vanZ, Math.PI / 2, 1.62, 1.42);
    sconce(into(innerX, 0.085), UY + 2.15, vanZ - 1.0, inward > 0 ? -Math.PI / 2 : Math.PI / 2, 1.6);
    sconce(into(innerX, 0.085), UY + 2.15, vanZ + 1.0, inward > 0 ? -Math.PI / 2 : Math.PI / 2, 1.6);
    /* Where the deleted pedestal basin and its mirror stood: a linen tower.
     * The wall would otherwise be 1.5 m of bare tile between the vanity and
     * the towel rail, and a bathroom this size keeps its linen somewhere. Only
     * 0.34 m deep, so it takes no walking room. */
    const towerX = into(innerX, 0.20);
    root.add(box({
      size: [0.34, 1.9, 0.75], pos: [towerX, UY + 0.95, cz - 0.6], mat: M_WOOD_DK, name: `${name}-linen-tower`,
    }));
    root.add(box({
      size: [0.38, 0.06, 0.79], pos: [towerX, UY + 1.92, cz - 0.6], mat: M_MARBLE, cast: false, name: `${name}-linen-tower-cap`,
    }));
    for (const dy of [0.35, 0.78, 1.21, 1.64]) {
      root.add(box({
        size: [0.03, 0.36, 0.66], pos: [into(innerX, 0.35), UY + dy, cz - 0.6], mat: M_WOOD, cast: false, name: `${name}-linen-door`,
      }));
      root.add(named(cylinder({
        r: 0.012, h: 0.16, pos: [into(innerX, 0.37), UY + dy, cz - 0.78], mat: M_GOLD, rotZ: Math.PI / 2, cast: false,
      }), `${name}-linen-handle`));
    }
    solid(Math.min(towerX, into(innerX, 0.37)) - 0.03, Math.max(towerX, into(innerX, 0.37)) + 0.03,
      UY, UY + 1.95, cz - 0.98, cz - 0.22);

    /* ---- THE TUB'S ALCOVE, WHICH IT HAD BEEN BUILT WITHOUT.
     *
     * The other half of "shower and bathtub lot of floating and misaligned
     * geometry". `makeTub` is the shared apartment bath and it is drawn for a
     * RECESS: it hangs a shower riser up to y 2.06 off its own short end, and
     * a curtain rail at y 2.05 down its open side. In the apartment those
     * meet tiled walls. In here the tub stands in open floor, so measured,
     * the riser ran from 0.62 to 2.06 m with nothing behind it above 0.56,
     * and the rail spanned 2.4 m at head height held up at neither end.
     *
     * The fix is the missing walls, not the removal of a working prop: a
     * tiled return across the tub's foot that the riser mounts on and the
     * rail's south end dies into, and a boxed pier from the tub's head to the
     * north wall that takes the other end -- which also fills the dead pocket
     * between the tub and the shower's return glass. */
    const tubZ0 = cz + 0.6;
    const tubZ1 = cz + 3.0;
    /* Measured from the OUTER WALL, not from the tub's own x1. `makeTub`
     * always hangs its curtain rail on x1, which is the room side in the west
     * ensuite and the wall side in the east one -- the two rooms are mirrored
     * but the prop is not. Sizing the alcove off `tubRailX` therefore built a
     * 2.18 m return in the west room and a 0.32 m stub in the east one, which
     * did not reach the riser at all. 2.21 m from the outer wall clears the
     * tub's far edge and the rail in BOTH rooms, and still leaves 90 mm
     * between the pier and the shower tray. */
    const alcFar = outerX + inward * 2.21;
    const alcX0 = Math.min(outerX, alcFar);
    const alcX1 = Math.max(outerX, alcFar);
    root.add(box({
      size: [alcX1 - alcX0, 2.2, 0.18], pos: [(alcX0 + alcX1) / 2, UY + 1.1, tubZ0 - 0.005], mat: tileWall, name: `${name}-tub-return`,
    }));
    solid(alcX0, alcX1, UY, UY + 2.2, tubZ0 - 0.095, tubZ0 + 0.085);
    root.add(box({
      size: [alcX1 - alcX0, 2.2, (r.z1 - 0.05) - (tubZ1 - 0.09)],
      pos: [(alcX0 + alcX1) / 2, UY + 1.1, ((r.z1 - 0.05) + (tubZ1 - 0.09)) / 2],
      mat: tileWall,
      name: `${name}-tub-pier`,
    }));
    solid(alcX0, alcX1, UY, UY + 2.2, tubZ1 - 0.09, r.z1 - 0.05);
    /* ---- The tub, dressed: a floor-standing filler with a hand shower, a
     * tray across it, and the mat beside it.
     *
     * The filler stood at z cz+0.42 and the tub starts at cz+0.6, so its
     * spout was pouring 180 mm short of the bath, onto the floor. Moved to
     * cz+0.95, which is inside the tub's own 2.4 m run. */
    const tubMidX = tubX0 + 0.9;
    const fillerZ = cz + 0.95;
    root.add(named(cylinder({
      r: 0.05, h: 1.1, pos: [into(outerX, 0.34), UY + 0.55, fillerZ], mat: M_GOLD,
    }), `${name}-tub-filler`));
    root.add(named(cylinder({
      r: 0.032, h: 0.34, pos: [into(outerX, 0.5), UY + 1.08, fillerZ], mat: M_GOLD, rotZ: Math.PI / 2,
    }), `${name}-tub-filler-arm`));
    root.add(named(cylinder({
      r: 0.028, h: 0.12, pos: [into(outerX, 0.66), UY + 1.0, fillerZ], mat: M_GOLD,
    }), `${name}-tub-filler-spout`));
    root.add(box({
      size: [1.9, 0.05, 0.28], pos: [tubMidX, UY + 0.58, cz + 1.5], mat: M_WOOD_DK, cast: false, name: `${name}-bath-tray`,
    }));
    root.add(cylinder({
      rTop: 0.05, rBottom: 0.04, h: 0.12, pos: [tubMidX - 0.4, UY + 0.66, cz + 1.5], mat: M_GLASS_CASE, cast: false,
    }));
    root.add(box({
      size: [0.16, 0.03, 0.22], pos: [tubMidX + 0.35, UY + 0.62, cz + 1.5], mat: M_CARD, rotY: 0.2, cast: false,
    }));
    /* Candles ON the tub's rim, not beside it. They stood at 0.28 m off the
     * outer wall and the tub's near rim runs 0.35..0.42 m off it, so both
     * candles were floating in the 0.35 m gap between the wall and the bath
     * with nothing under them. 0.385 is the middle of that rim. */
    for (const oz of [cz + 2.6, cz + 2.8]) {
      root.add(named(cylinder({
        r: 0.045, h: 0.12, pos: [into(outerX, 0.385), UY + 0.62, oz], mat: M_CARD, cast: false,
      }), `${name}-tub-candle`));
      root.add(named(sphere({
        r: 0.028, pos: [into(outerX, 0.385), UY + 0.7, oz], mat: M_BULB_WARM, cast: false,
      }), `${name}-tub-candle-flame`));
    }

    // Towel rail and a heap of towels, plus a bathmat.
    root.add(cylinder({
      r: 0.022, h: 1.0, pos: [into(outerX, 0.12), UY + 1.3, cz - 1.6], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    for (const oz of [-1.85, -1.4]) {
      root.add(box({
        size: [0.1, 0.62, 0.28],
        pos: [into(outerX, 0.2), UY + 1.0, cz + oz],
        mat: M_TOWEL,
        cast: false,
      }));
    }
    // A second, heated rail with folded towels on the inner wall, a robe on
    // its hook, a stool and a plant -- the things a bathroom this size has.
    root.add(cylinder({
      r: 0.02, h: 0.9, pos: [into(innerX, 0.1), UY + 1.35, cz + 1.1], mat: M_GOLD, rotX: Math.PI / 2,
    }));
    for (let i = 0; i < 4; i++) {
      root.add(cylinder({
        r: 0.018, h: 0.62, pos: [into(innerX, 0.16), UY + 0.95 + i * 0.24, cz + 1.1], mat: M_GOLD, rotX: Math.PI / 2, cast: false, name: `${name}-heated-rail`,
      }));
    }
    for (const oy of [0.0, 0.24]) {
      root.add(box({
        size: [0.22, 0.2, 0.5], pos: [into(innerX, 0.26), UY + 1.06 + oy, cz + 1.1], mat: M_TOWEL, cast: false,
      }));
    }
    root.add(box({
      size: [0.06, 0.1, 0.06], pos: [into(innerX, 0.095), UY + 1.75, cz - 3.5], mat: M_GOLD, cast: false, name: `${name}-robe-hook`,
    }));
    root.add(box({
      size: [0.16, 0.95, 0.44], pos: [into(innerX, 0.22), UY + 1.24, cz - 3.5], mat: M_TOWEL, cast: false, name: `${name}-robe`,
    }));
    root.add(cylinder({
      r: 0.2, h: 0.06, pos: [into(outerX, 1.0), UY + 0.42, cz - 2.2], mat: M_WOOD_DK, name: `${name}-stool`,
    }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      root.add(cylinder({
        r: 0.022, h: 0.4, pos: [into(outerX, 1.0) + Math.cos(a) * 0.12, UY + 0.2, cz - 2.2 + Math.sin(a) * 0.12], mat: M_WOOD_DK, rotZ: Math.cos(a) * 0.12, rotX: -Math.sin(a) * 0.12,
      }));
    }
    root.add(box({
      size: [0.24, 0.06, 0.3], pos: [into(outerX, 1.0), UY + 0.47, cz - 2.2], mat: M_TOWEL, cast: false,
    }));
    {
      /* The palm goes 1.2 m up the outer wall, not 0.7: at 0.7 its leaves
       * reached x -14.91 and the ensuite doorway starts at -14.90. A plant
       * one centimetre out of a doorway is a plant in a doorway. */
      const px = into(outerX, 0.75);
      const pz = r.z0 + 1.2;
      const potted = makePlant(M, { x: px, z: pz, scale: 1.5 });
      const pw = new THREE.Group();
      pw.position.y = UY;
      pw.add(potted.group);
      root.add(pw);
      solid(px - 0.32, px + 0.32, UY, UY + 1.4, pz - 0.32, pz + 0.32);
    }
    rug(cx, cz + 0.2, 1.2, 0.8, UY, mat({ color: 0xcdd8d2, roughness: 1 }));
    /* Lighting: the flush fitting stays as the room's key, with two small
     * downlights over the shower and the tub so neither is a dark corner. */
    const key = ceilingLight(cx, cz, UCY - 0.35, 0xf2f6ff, 4.2, 12);
    for (const [lx2, lz2] of [[headX, (shZ0 + shZ1) / 2], [tubMidX, cz + 1.8]]) {
      root.add(cylinder({
        r: 0.11, h: 0.05, pos: [lx2, UCY - 0.32, lz2], mat: M_CHROME, cast: false,
      }));
      root.add(cylinder({ r: 0.08, h: 0.02, pos: [lx2, UCY - 0.36, lz2], mat: M_BULB_WARM, cast: false }));
      const dl = new THREE.PointLight(0xeaf4ff, 2.6, 8, 2);
      dl.position.set(lx2, UCY - 0.5, lz2);
      root.add(dl);
    }
    return key;
  }
  const bathProps = {
    west: buildBathroom(BATH_WEST, 'bath-west'),
    east: buildBathroom(BATH_EAST, 'bath-east'),
  };

  /* ================================================================== */
  /* THE BASEMENT ARMORY                                                 */
  /* ================================================================== */
  function buildBasement() {
    const r = BASEMENT_ROOM;
    // Concrete wall panels over the shell's structural walls.
    const panelH = -0.35 - BY;
    const panelMidY = (BY + (-0.35)) / 2;
    root.add(box({
      size: [r.x1 - r.x0 - 0.3, panelH, 0.04],
      pos: [(r.x0 + r.x1) / 2, panelMidY, r.z0 + 0.18],
      mat: concreteMaterial(r.x1 - r.x0, panelH),
      name: 'basement-wall-panel-south',
    }));
    /* The north lining, in two, because the wall behind it now has a doorway
     * through to the lower level's corridor (CELLAR_DOOR). Nothing else in
     * this room moves for it -- see the note on the shell's own north wall in
     * MansionGrounds.js for why that stretch and no other. */
    for (const [px0, px1] of [
      [r.x0 + 0.15, CELLAR_DOOR.x0 - 0.12], [CELLAR_DOOR.x1 + 0.12, r.x1 - 0.15],
    ]) {
      root.add(box({
        size: [px1 - px0, panelH, 0.04],
        pos: [(px0 + px1) / 2, panelMidY, r.z1 - 0.18],
        mat: concreteMaterial(px1 - px0, panelH),
        name: 'basement-wall-panel-north',
      }));
    }
    // Architrave round the new doorway, and a stencilled direction over it.
    for (const jx of [CELLAR_DOOR.x0 - 0.06, CELLAR_DOOR.x1 + 0.06]) {
      root.add(box({
        size: [0.12, 2.2, 0.14], pos: [jx, BY + 1.1, r.z1 - 0.12], mat: M_RACK, cast: false,
      }));
    }
    root.add(box({
      size: [CELLAR_DOOR.x1 - CELLAR_DOOR.x0 + 0.24, 0.12, 0.14],
      pos: [(CELLAR_DOOR.x0 + CELLAR_DOOR.x1) / 2, BY + 2.26, r.z1 - 0.12],
      mat: M_RACK,
      cast: false,
    }));
    const lowerLevelSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 0.3),
      mat({
        map: printed('mansion.cellar.thisway', ['LOWER LEVEL'], {
          w: 448, h: 100, bg: '#14161a', fg: '#c8a24a', font: '900 46px "Trebuchet MS", sans-serif',
        }),
        roughness: 0.8,
        emissive: 0x3a2e12,
        unique: true,
      }),
    );
    lowerLevelSign.position.set((CELLAR_DOOR.x0 + CELLAR_DOOR.x1) / 2, BY + 2.46, r.z1 - 0.21);
    lowerLevelSign.rotation.y = Math.PI; // faces back into the armory
    root.add(lowerLevelSign);
    root.add(box({
      size: [0.04, panelH, r.z1 - r.z0 - 0.3],
      pos: [r.x0 + 0.18, panelMidY, (r.z0 + r.z1) / 2],
      mat: concreteMaterial(r.z1 - r.z0, panelH),
      name: 'basement-wall-panel-west',
    }));
    root.add(box({
      size: [0.04, panelH, (BASEMENT_STAIR.z0 - 0.2) - r.z0],
      pos: [r.x1 - 0.18, panelMidY, (r.z0 + BASEMENT_STAIR.z0 - 0.2) / 2],
      mat: concreteMaterial(BASEMENT_STAIR.z0 - r.z0, panelH),
      name: 'basement-wall-panel-east-a',
    }));
    root.add(box({
      size: [0.04, panelH, r.z1 - (BASEMENT_STAIR.z1 + 0.2)],
      pos: [r.x1 - 0.18, panelMidY, (BASEMENT_STAIR.z1 + 0.2 + r.z1) / 2],
      mat: concreteMaterial(r.z1 - BASEMENT_STAIR.z1, panelH),
      name: 'basement-wall-panel-east-b',
    }));
    topping(r.x0 + 0.2, r.x1 - 0.2, BY + 0.012, r.z0 + 0.2, r.z1 - 0.2,
      concreteMaterial(r.x1 - r.x0, r.z1 - r.z0), 'basement-floor');

    /* ---- THE ARMORY WALL.
     *
     * This used to build four boards of "abstract weapon silhouettes" — two
     * tapered cylinders and a couple of slabs per board, standing in for guns
     * nobody could name and nobody could pick up. They are gone. What hangs
     * here now is the shared weapon system's real racks, built by
     * `src/core/weapons/Armory.js` out of the same models THE TAKE, NO WAKE
     * and The Silver Case use, and every one of them can be taken down, fired,
     * reloaded and put back.
     *
     * The geometry is NOT built here, deliberately. `MansionInterior.js` owns
     * the room; the armory owns the weapons, because the next scene to want
     * them will not be a mansion. What this file contributes is the six
     * MOUNT POINTS — where on which wall each rack hangs — which is a fact
     * about this basement and about nowhere else.
     *
     * Geography, measured against the room (x -9..9, z 50..64) and everything
     * already standing in it:
     *   - the south wall (z = 50.45, facing +Z into the room) carries the four
     *     small arms and the two carbines. It is the wall you see as you come
     *     off the bottom of the stair.
     *   - the west wall (x = -8.55, facing +X) carries the two crew-served
     *     guns, north of the ammunition stacks already at z 51.4 and 53.0 and
     *     south of the caged store at z 60.5.
     */
    const armoryRacks = [
      { id: 'revolver', x: -6.7, y: BY, z: r.z0 + 0.45, rotY: 0 },
      { id: 'pistol9', x: -4.9, y: BY, z: r.z0 + 0.45, rotY: 0 },
      { id: 'carbine', x: -2.9, y: BY, z: r.z0 + 0.45, rotY: 0 },
      { id: 'ak47', x: -1.2, y: BY, z: r.z0 + 0.45, rotY: 0 },
      { id: 'saw', x: r.x0 + 0.45, y: BY, z: 54.6, rotY: Math.PI / 2 },
      { id: 'barrett', x: r.x0 + 0.45, y: BY, z: 56.8, rotY: Math.PI / 2 },
    ];

    // ---- A caged store at the north end, padlocked.
    const cageZ0 = 60.5;
    for (let i = 0; i <= 14; i++) {
      const cx = THREE.MathUtils.lerp(r.x0 + 0.3, 2.4, i / 14);
      root.add(cylinder({ r: 0.02, h: 2.4, pos: [cx, BY + 1.2, cageZ0], mat: M_RACK }));
    }
    for (const ry of [BY + 0.2, BY + 1.2, BY + 2.3]) {
      root.add(box({ size: [2.4 - r.x0 - 0.3, 0.05, 0.05], pos: [(r.x0 + 0.3 + 2.4) / 2, ry, cageZ0], mat: M_RACK }));
    }
    solid(r.x0 + 0.3, 2.4, BY, BY + 2.4, cageZ0 - 0.08, cageZ0 + 0.08);
    root.add(box({ size: [0.14, 0.2, 0.06], pos: [2.3, BY + 1.3, cageZ0 - 0.1], mat: M_GOLD }));
    // Behind the cage: crates and a wine rack.
    for (const [cx, cz] of [[-6.5, 62.2], [-5.4, 62.6], [-6.0, 61.4], [0.5, 62.4]]) {
      root.add(box({
        size: [0.9, 0.7, 0.9], pos: [cx, BY + 0.35, cz], mat: M_CRATE, name: 'basement-crate',
      }));
      solid(cx - 0.45, cx + 0.45, BY, BY + 0.7, cz - 0.45, cz + 0.45);
    }
    root.add(box({ size: [2.2, 2.0, 0.5], pos: [-2.6, BY + 1.0, r.z1 - 0.4], mat: M_WOOD_DK }));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 6; j++) {
        root.add(cylinder({
          r: 0.06,
          h: 0.34,
          pos: [-3.5 + j * 0.28, BY + 0.5 + i * 0.44, r.z1 - 0.45],
          mat: mat({ color: 0x1a3a20, roughness: 0.4 }),
          rotX: Math.PI / 2,
        }));
      }
    }
    solid(-3.7, -1.5, BY, BY + 2.0, r.z1 - 0.65, r.z1 - 0.15);

    // ---- Tool bench, ammo stack, boiler, drain.
    function buildToolBench(bx, bz) {
      const topY = BY + 0.75;
      root.add(box({
        size: [2.0, 0.08, 0.7], pos: [bx, topY, bz], mat: M_WOOD_DK, name: 'basement-bench-top',
      }));
      for (const [lx, lz] of [[-0.9, -0.28], [0.9, -0.28], [-0.9, 0.28], [0.9, 0.28]]) {
        root.add(box({ size: [0.07, 0.7, 0.07], pos: [bx + lx, BY + 0.35, bz + lz], mat: M_WOOD_DK }));
      }
      root.add(box({
        size: [0.34, 0.07, 0.14], pos: [bx - 0.5, topY + 0.055, bz], mat: M_STEEL, name: 'bench-tool',
      }));
      root.add(box({
        size: [0.15, 0.15, 0.15], pos: [bx + 0.42, topY + 0.1, bz - 0.05], mat: M_RACK, name: 'bench-tool',
      }));
      root.add(box({
        size: [0.4, 0.05, 0.05], pos: [bx + 0.1, topY + 0.06, bz + 0.15], mat: M_STEEL, name: 'bench-tool',
      }));
      // Pegboard behind it.
      root.add(box({ size: [2.0, 1.1, 0.04], pos: [bx, topY + 0.75, bz - 0.36], mat: M_RACK_BACK }));
      for (let i = 0; i < 6; i++) {
        root.add(box({
          size: [0.06, 0.34, 0.05], pos: [bx - 0.8 + i * 0.32, topY + 0.72, bz - 0.32], mat: M_STEEL, cast: false,
        }));
      }
      solid(bx - 1.05, bx + 1.05, BY, topY + 0.05, bz - 0.4, bz + 0.4);
    }
    buildToolBench(4.2, r.z1 - 1.2);

    function buildAmmoStack(ax, az) {
      for (const [ox, oz, oy] of [[-0.27, 0, 0.2], [0.27, 0, 0.2], [0, 0, 0.62]]) {
        root.add(box({
          size: [0.48, 0.38, 0.48], pos: [ax + ox, BY + oy, az + oz], mat: M_CRATE, name: 'basement-ammo-crate',
        }));
      }
      solid(ax - 0.55, ax + 0.55, BY, BY + 0.85, az - 0.3, az + 0.3);
    }
    buildAmmoStack(-7.8, 51.4);
    buildAmmoStack(-7.8, 53.0);

    root.add(cylinder({
      r: 0.5, h: 1.9, pos: [7.6, BY + 0.95, r.z1 - 1.4], mat: M_RACK, name: 'basement-boiler',
    }));
    root.add(cylinder({
      r: 0.09, h: 1.4, pos: [7.6, BY + 2.4, r.z1 - 1.4], mat: M_RACK,
    }));
    solid(7.1, 8.1, BY, BY + 1.9, r.z1 - 1.9, r.z1 - 0.9);

    const drain = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 24),
      mat({ color: 0x0a0a0c, roughness: 0.55, unique: true }),
    );
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(-1.0, BY + 0.03, 55.5);
    root.add(drain);
    const drainRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.36, 24),
      mat({ color: 0x2a2a28, roughness: 0.5, unique: true }),
    );
    drainRing.rotation.x = -Math.PI / 2;
    drainRing.position.set(-1.0, BY + 0.032, 55.5);
    root.add(drainRing);

    // ---- Lighting: a bare flickering bulb, a work light and two ceiling cans.
    root.add(cylinder({ r: 0.012, h: 1.0, pos: [-1, BY + 2.3, 54], mat: M_RACK }));
    root.add(sphere({ r: 0.07, pos: [-1, BY + 1.8, 54], mat: M_BULB_BARE, cast: false }));
    const bulbLight = new THREE.PointLight(0xfff0c8, 5.2, 13, 2);
    bulbLight.position.set(-1, BY + 1.75, 54);
    root.add(bulbLight);

    root.add(box({
      size: [0.22, 0.16, 0.1], pos: [r.x1 - 0.3, BY + 1.9, 59.4], mat: M_RACK, name: 'basement-sconce',
    }));
    root.add(box({
      size: [0.14, 0.1, 0.03], pos: [r.x1 - 0.42, BY + 1.9, 59.4], mat: M_BULB_WARM, cast: false,
    }));
    const workLight = new THREE.PointLight(0xffe3b0, 5.8, 15, 2);
    workLight.position.set(r.x1 - 0.6, BY + 1.9, 59.4);
    root.add(workLight);

    const cans = [];
    for (const [px, pz] of [[-5.5, 52.5], [-5.5, 61], [4.5, 62]]) {
      root.add(cylinder({
        r: 0.16, h: 0.05, pos: [px, -0.32, pz], mat: mat({ color: 0x1c1c1e, roughness: 0.5 }),
      }));
      root.add(cylinder({ r: 0.12, h: 0.02, pos: [px, -0.36, pz], mat: M_BULB_WARM, cast: false }));
      const l = new THREE.PointLight(0xffe9c4, 5, 14, 2);
      l.position.set(px, -0.45, pz);
      root.add(l);
      cans.push(l);
    }

    /* ---- The alcove behind the stair head, which used to be the way in
     * under the flight (see buildBasementStair's spandrel note). Now that it
     * is closed off it is dressed as what it should always have been: the
     * armory's own noticeboard wall, under the house shield. */
    const basementShield = flatArt('mansion.basement.shield', {
      x: 7.2,
      y: BY + 1.75,
      z: BASEMENT_STAIR.z0 - 0.32,
      rotY: Math.PI,
      w: 1.15,
      h: 0.84,
      material: mat({
        map: squatchArt('mansion-basement-shield', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'NOTHING LEAVES THIS ROOM', ink: '#c8a24a', bg: '#111013',
        }),
        roughness: 0.95,
        unique: true,
      }),
    });
    root.add(box({
      size: [1.3, 0.99, 0.04], pos: [7.2, BY + 1.75, BASEMENT_STAIR.z0 - 0.29], mat: M_RACK, cast: false,
    }));
    root.add(box({
      size: [1.9, 0.06, 0.16], pos: [7.2, BY + 0.9, BASEMENT_STAIR.z0 - 0.34], mat: M_RACK, cast: false,
    }));
    const alcoveLight = new THREE.PointLight(0xffe3b0, 3.4, 7, 2);
    alcoveLight.position.set(7.2, BY + 2.1, BASEMENT_STAIR.z0 - 0.9);
    root.add(alcoveLight);
    // A locker and a couple of jerrycans in the alcove, so it reads as used.
    root.add(box({
      size: [0.9, 1.8, 0.5], pos: [8.3, BY + 0.9, BASEMENT_STAIR.z0 - 0.85], mat: M_RACK, name: 'armory-locker',
    }));
    solid(7.85, 8.75, BY, BY + 1.8, BASEMENT_STAIR.z0 - 1.1, BASEMENT_STAIR.z0 - 0.6);
    for (const cz of [BASEMENT_STAIR.z0 - 0.75, BASEMENT_STAIR.z0 - 1.15]) {
      root.add(box({
        size: [0.3, 0.44, 0.2], pos: [5.95, BY + 0.22, cz], mat: mat({ color: 0x2f3a2a, roughness: 0.85 }),
      }));
    }

    return {
      bulbLight,
      workLight,
      ceilingLights: cans,
      drain,
      shield: basementShield,
      /** Where the shared armory's racks hang. Consumed by src/mansion/main.js. */
      armoryRacks,
      /** So the armory can make its own racks solid in this room's collider list. */
      addSolid: solid,
    };
  }
  const basementProps = buildBasement();

  /* ================================================================== */
  /* THE WEST WING -- THE GREAT INCLUDER HALL                            */
  /*                                                                      */
  /* Owner brief, verbatim: "in Lou's mansion is a massive trophy engraved:*/
  /* THE GREAT INCLUDER" -- and, separately, "Expand the mansion ground    */
  /* level. Beauty."                                                       */
  /*                                                                        */
  /* One answer to both. The trophy does not go on a shelf in the lounge     */
  /* with the bracket silverware; it gets a hall, and the hall is the        */
  /* ground floor's expansion. You come through the arcade from the living   */
  /* room at the south end and the thing is nine metres away down a lit       */
  /* gallery, in an apse, on a dais, with its own name cut into the plinth    */
  /* at eye height in letters you can read from the door.                     */
  /* ================================================================== */
  const M_BRICK_CELLAR = mat({ color: 0x6a4230, roughness: 0.95 });
  const M_PLATE_STEEL = mat({ color: 0x8d939b, roughness: 0.4, metalness: 0.72 });
  const M_VAULT_STEEL = mat({ color: 0x6f757d, roughness: 0.34, metalness: 0.85 });
  /* Bullion, and why it is not a pure metal.
 *
 * Cast at metalness 0.92 the stacks rendered as brown boxes: with no
 * environment map in this scene a near-pure metal can only show what a light
 * reflects specularly straight back at the camera, and one ceiling can does
 * not. This is the same measurement MansionGrounds.js made for the fountain
 * monument, and the same answer -- pull the metalness down, lift the base
 * colour, and give it a low emissive so the pile still reads with the light
 * rig switched elsewhere. */
const M_GOLD_BAR = mat({
  color: 0xf0c94a, roughness: 0.3, metalness: 0.34, emissive: 0x3a2a06, emissiveIntensity: 0.9,
});
  const M_CASH = mat({ color: 0x9fae86, roughness: 0.9 });
  const M_SCREEN_DARK = mat({ color: 0x0a0c10, roughness: 0.55 });
  const M_ACOUSTIC = mat({ map: fabricTex('#2a1c22'), roughness: 0.98 });
  const M_CHEQUER = mat({
    map: tiled(tileTex(2, '#1c1a18', '#e2ded0'), 9, 20), roughness: 0.36, unique: true,
  });

  /* The engraving. 1400 x 300 at 86px, not 1024 x 220 at 104px: `printed`
   * draws one centred line with no measuring and no wrapping, so the first
   * version rendered "HE GREAT INCLUDE" -- the ends of the word ran off both
   * edges of the canvas. Checked by looking at it. */
  /**
   * A decorative wall lining, CUT AROUND the openings in the wall behind it.
   *
   * Lining a room's four walls with four solid boxes is how a doorway ends up
   * plugged: the collider is still a hole so you walk straight through it, and
   * every walk-in test passes, but the room renders as sealed and the corridor
   * outside it renders as blank wall. Caught by looking at the LAN room, which
   * had a Silver Sasquatches banner hanging over its own front door.
   *
   * `gaps` are [u0, u1] pairs along the band's own long axis, ascending and
   * non-overlapping -- the doorways in that wall.
   */
  function linedBand({
    axis, x0, x1, y0, y1, z0, z1, material, gaps = [],
  }) {
    const u0 = axis === 'x' ? x0 : z0;
    const u1 = axis === 'x' ? x1 : z1;
    const cuts = [u0];
    for (const [g0, g1] of gaps) {
      if (g1 <= u0 || g0 >= u1) continue;
      cuts.push(Math.max(u0, g0), Math.min(u1, g1));
    }
    cuts.push(u1);
    for (let i = 0; i < cuts.length - 1; i += 2) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 1e-3) continue;
      root.add(box({
        size: axis === 'x' ? [b - a, y1 - y0, z1 - z0] : [x1 - x0, y1 - y0, b - a],
        pos: axis === 'x'
          ? [(a + b) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
          : [(x0 + x1) / 2, (y0 + y1) / 2, (a + b) / 2],
        mat: material,
        cast: false,
      }));
    }
  }

  /**
   * The four walls of a lower-level room, lined and notched for its door.
   *
   * `t` is the lining's thickness, and it matters more than it looks: any room
   * that ALSO gets `trimRoom` has a 0.05 m skirting standing on the same four
   * planes, so a 0.05 m lining puts the skirting's face and the lining's face
   * on exactly the same plane -- coplanar, same-facing, the length of every
   * wall in the room. Measured in the guest room and the LAN room before the
   * fix: cream trim at x = -15.5500 fighting a near-black lining at
   * x = -15.5500, 1.1 m^2 of it, at knee height right round both rooms. Those
   * two now line at 0.04 so the skirting stands proud of the wall, which is
   * what a skirting does; the theatre (0.09) and the vault (0.06) have no
   * skirting and are unchanged.
   */
  function lineRoom(r, height, material, door, t = 0.05) {
    linedBand({
      axis: 'x', x0: r.x0, x1: r.x1, y0: BY, y1: BY + height, z0: r.z0, z1: r.z0 + t, material, gaps: [door],
    });
    linedBand({
      axis: 'x', x0: r.x0, x1: r.x1, y0: BY, y1: BY + height, z0: r.z1 - t, z1: r.z1, material,
    });
    linedBand({
      axis: 'z', x0: r.x0, x1: r.x0 + t, y0: BY, y1: BY + height, z0: r.z0, z1: r.z1, material,
    });
    linedBand({
      axis: 'z', x0: r.x1 - t, x1: r.x1, y0: BY, y1: BY + height, z0: r.z0, z1: r.z1, material,
    });
  }

  function greatIncluderTexture() {
    return printed('mansion.great-includer', ['THE GREAT INCLUDER'], {
      w: 1400,
      h: 300,
      bg: '#100d10',
      fg: '#e9c76b',
      font: '900 86px Georgia, serif',
      border: '#8a6a24',
    });
  }

  function buildTrophyHall() {
    const r = TROPHY_HALL;
    const cx = (r.x0 + r.x1) / 2;
    const CEIL = WING_ROOF_Y0;

    topping(r.x0, r.x1, GY + 0.01, r.z0, r.z1, M_MARBLE, 'trophy-floor');
    topping(r.x0 + 0.5, r.x1 - 0.5, GY + 0.015, r.z0 + 0.5, r.z1 - 0.5, M_MARBLE_DK, 'trophy-floor-field');
    topping(r.x0 + 1.1, r.x1 - 1.1, GY + 0.02, r.z0 + 1.1, r.z1 - 1.1, M_MARBLE, 'trophy-floor-inner');
    trimRoom(r, GY, CEIL);
    // Long crimson runner from the arcade to the foot of the dais.
    rug(cx, 49.6, 3.0, 11.6, GY, M_CARPET_HALL);

    /* The order: engaged columns down both long walls, a full entablature
     * over them, and a coffered ceiling between. A hall this size with flat
     * plaster on all four sides reads as a corridor with a cup in it. */
    /* The order runs down the OUTER wall only. On the inner wall the arcade
     * from the living room takes up the southern third and the display cases
     * the rest, and a free-standing column landed squarely inside the arcade's
     * middle arch -- a column in a doorway. That wall gets flat pilasters,
     * which do the same job to the eye and stand on nothing anybody walks. */
    for (const pz of [42.4, 48.4, 54.4]) {
      const px = r.x0 + 0.35;
      root.add(cylinder({ r: 0.34, h: CEIL - GY - 0.7, pos: [px, GY + (CEIL - GY - 0.7) / 2 + 0.2, pz], mat: M_MARBLE }));
      root.add(cylinder({ rTop: 0.46, rBottom: 0.36, h: 0.28, pos: [px, CEIL - 0.62, pz], mat: M_GOLD, cast: false }));
      root.add(cylinder({ rTop: 0.36, rBottom: 0.46, h: 0.2, pos: [px, GY + 0.1, pz], mat: M_MARBLE_DK, cast: false }));
      solid(px - 0.34, px + 0.34, GY, CEIL, pz - 0.34, pz + 0.34);
    }
    for (const pz of [48.4, 54.4]) {
      root.add(box({
        size: [0.22, CEIL - GY - 0.5, 0.86], pos: [r.x1 - 0.12, GY + (CEIL - GY - 0.5) / 2 + 0.2, pz], mat: M_MARBLE, cast: false,
      }));
      root.add(box({
        size: [0.3, 0.24, 1.0], pos: [r.x1 - 0.12, CEIL - 0.62, pz], mat: M_GOLD, cast: false,
      }));
    }
    for (const [ex0, ex1, ez0, ez1] of [
      [r.x0, r.x0 + 0.6, r.z0, r.z1], [r.x1 - 0.6, r.x1, r.z0, r.z1],
      [r.x0, r.x1, r.z0, r.z0 + 0.6], [r.x0, r.x1, r.z1 - 0.6, r.z1],
    ]) {
      root.add(box({
        size: [ex1 - ex0, 0.34, ez1 - ez0],
        pos: [(ex0 + ex1) / 2, CEIL - 0.34, (ez0 + ez1) / 2],
        mat: M_TRIM,
        cast: false,
      }));
    }
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 6; j++) {
        const px = THREE.MathUtils.lerp(r.x0 + 1.4, r.x1 - 1.4, (i + 0.5) / 4);
        const pz = THREE.MathUtils.lerp(r.z0 + 1.4, r.z1 - 1.4, (j + 0.5) / 6);
        root.add(box({
          size: [1.5, 0.14, 2.0], pos: [px, CEIL - 0.09, pz], mat: M_WALL_WARM, cast: false,
        }));
        root.add(box({
          size: [1.16, 0.1, 1.66], pos: [px, CEIL - 0.2, pz], mat: M_GOLD, cast: false,
        }));
      }
    }

    /* ---- THE APSE, and the thing standing in it. ---- */
    const apseZ = r.z1 - 0.2;
    const tx = cx;
    root.add(box({
      size: [4.6, CEIL - GY, 0.5], pos: [tx, (GY + CEIL) / 2, apseZ + 0.05], mat: M_WALL_DEEP, name: 'trophy-apse',
    }));
    /* A gilded frame round the apse rather than a semi-dome.
     *
     * A half-dome was tried first and rendered as a white sail hanging across
     * the front of the trophy from every viewpoint in the hall -- a 2.8 m
     * hemisphere centred behind a 4.8 m monument reaches three metres out in
     * front of it. Pilasters and a frieze do the same job (they turn a flat
     * dark panel into a niche) and they stand clear of the object the whole
     * room is pointed at, which is the only thing that actually matters here. */
    for (const px of [tx - 2.05, tx + 2.05]) {
      root.add(box({
        size: [0.34, 5.0, 0.22], pos: [px, GY + 2.5, apseZ - 0.22], mat: M_GOLD, cast: false,
      }));
      root.add(box({
        size: [0.5, 0.24, 0.3], pos: [px, GY + 5.02, apseZ - 0.22], mat: M_GOLD, cast: false,
      }));
      root.add(box({
        size: [0.5, 0.2, 0.3], pos: [px, GY + 0.1, apseZ - 0.22], mat: M_MARBLE_DK, cast: false,
      }));
    }
    root.add(box({
      size: [4.8, 0.3, 0.28], pos: [tx, GY + 5.28, apseZ - 0.22], mat: M_GOLD, cast: false,
    }));
    root.add(box({
      size: [4.4, 0.22, 0.2], pos: [tx, GY + 5.02, apseZ - 0.2], mat: M_MARBLE_DK, cast: false,
    }));
    // Dais: three marble steps, and a velvet rope round the front of it.
    for (let i = 0; i < 3; i++) {
      const inset = i * 0.32;
      root.add(box({
        size: [4.6 - inset * 2, 0.2, 3.4 - inset * 1.4],
        pos: [tx, GY + 0.1 + i * 0.2, apseZ - 1.7 + inset * 0.7],
        mat: i === 2 ? M_MARBLE_DK : M_MARBLE,
        name: 'trophy-dais',
      }));
    }
    solid(tx - 2.3, tx + 2.3, GY, GY + 0.6, apseZ - 3.4, apseZ);
    const daisTop = GY + 0.6;
    for (const [rx, rz] of [[tx - 2.0, apseZ - 3.9], [tx, apseZ - 3.9], [tx + 2.0, apseZ - 3.9]]) {
      root.add(cylinder({ rTop: 0.07, rBottom: 0.1, h: 0.9, pos: [rx, GY + 0.45, rz], mat: M_GOLD }));
      root.add(sphere({ r: 0.09, pos: [rx, GY + 0.94, rz], mat: M_GOLD }));
      root.add(cylinder({ r: 0.2, h: 0.05, pos: [rx, GY + 0.02, rz], mat: M_BRONZE, cast: false }));
      solid(rx - 0.12, rx + 0.12, GY, GY + 0.95, rz - 0.12, rz + 0.12);
    }
    for (const rx of [tx - 1.0, tx + 1.0]) {
      root.add(box({
        size: [2.2, 0.07, 0.07], pos: [rx, GY + 0.72, apseZ - 3.9], mat: M_CURTAIN_RED, cast: false,
      }));
    }

    // The plinth. Black marble, and the name cut into the face of it.
    const plinthH = 0.95;
    root.add(box({
      size: [2.9, plinthH, 1.9], pos: [tx, daisTop + plinthH / 2, apseZ - 1.9], mat: M_WALL_DEEP, name: 'includer-plinth',
    }));
    root.add(box({
      size: [3.2, 0.12, 2.2], pos: [tx, daisTop + plinthH + 0.06, apseZ - 1.9], mat: M_MARBLE_DK, cast: false,
    }));
    root.add(box({
      size: [3.2, 0.14, 2.2], pos: [tx, daisTop + 0.07, apseZ - 1.9], mat: M_MARBLE_DK, cast: false,
    }));
    solid(tx - 1.6, tx + 1.6, daisTop, daisTop + plinthH, apseZ - 2.95, apseZ - 0.85);
    /* The engraving, on the south face -- the face you see coming through the
     * arcade. Registered with the art sweep like everything else with words on
     * it, so a doorway can never be cut across it later without failing. */
    const includerPlate = flatArt('mansion.trophy.engraving', {
      x: tx,
      y: daisTop + 0.66,
      z: apseZ - 2.86,
      rotY: Math.PI,
      w: 2.5,
      h: 0.54,
      material: mat({ map: greatIncluderTexture(), roughness: 0.42, metalness: 0.35, unique: true }),
      depth: 0.1,
    });
    root.add(box({
      size: [2.72, 0.72, 0.05], pos: [tx, daisTop + 0.66, apseZ - 2.83], mat: M_GOLD, cast: false,
    }));
    // ...and the dedication under it, small, the way a real one is.
    const dedication = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.3),
      mat({
        map: printed('mansion.includer.dedication', [
          'PRESENTED TO LOUIS SPUTTHOLE', 'FOR BRINGING EVERYBODY IN',
        ], {
          w: 640, h: 110, bg: '#1a1410', fg: '#d8bf86', font: '700 30px Georgia, serif', lineHeight: 40,
        }),
        roughness: 0.5,
        unique: true,
      }),
    );
    dedication.position.set(tx, daisTop + 0.22, apseZ - 2.86);
    dedication.rotation.y = Math.PI;
    root.add(dedication);

    /* The cup. Three and a third metres of it, on a metre of plinth, on a
     * dais -- nearly five metres of monument off the hall floor, with its lip
     * above head height and the finial half a metre under the coffers.
     * "Massive" is the whole brief; anything you could pick up would have been
     * the wrong answer. The height is not a guess: verify:mansion reads the
     * trophy's own world box and fails it against the ceiling. */
    const cupY = daisTop + plinthH;
    const trophy = new THREE.Group();
    trophy.add(box({ size: [2.0, 0.22, 1.5], pos: [0, 0.11, 0], mat: M_WOOD_DK }));
    trophy.add(box({ size: [1.7, 0.16, 1.25], pos: [0, 0.3, 0], mat: M_GOLD, cast: false }));
    trophy.add(cylinder({ rTop: 0.42, rBottom: 0.62, h: 0.34, pos: [0, 0.55, 0], mat: M_TROPHY_CUP }));
    trophy.add(cylinder({ r: 0.16, h: 0.5, pos: [0, 0.97, 0], mat: M_TROPHY_CUP }));
    trophy.add(sphere({ r: 0.24, ry: 0.16, pos: [0, 1.24, 0], mat: M_GOLD }));
    trophy.add(cylinder({ rTop: 1.05, rBottom: 0.3, h: 1.05, pos: [0, 1.88, 0], mat: M_TROPHY_CUP }));
    trophy.add(cylinder({ r: 1.12, h: 0.12, pos: [0, 2.44, 0], mat: M_GOLD, cast: false }));
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.075, 8, 20, Math.PI * 1.15),
        M_TROPHY_CUP,
      );
      handle.position.set(s * 1.05, 1.95, 0);
      handle.rotation.set(Math.PI / 2, 0, s * 1.5);
      trophy.add(handle);
    }
    trophy.add(cylinder({ rTop: 0.5, rBottom: 1.06, h: 0.5, pos: [0, 2.72, 0], mat: M_TROPHY_CUP }));
    trophy.add(cylinder({ r: 0.2, h: 0.22, pos: [0, 3.06, 0], mat: M_GOLD }));
    /* The finial: the same rig the fountain monument and the garden bronze
     * use, cast small in gold. One model, three statues. */
    const finial = new Sasquatch();
    finial.group.traverse((o) => { if (o.isMesh) o.material = M_TROPHY_CUP; });
    finial.armL.rotation.z = -2.5;
    finial.armR.rotation.z = 2.5;
    finial.group.scale.setScalar(0.145);
    finial.group.position.set(0, 3.16, 0);
    finial.group.rotation.y = Math.PI;
    trophy.add(finial.group);
    trophy.scale.setScalar(0.86);
    trophy.position.set(tx, cupY, apseZ - 1.9);
    root.add(trophy);
    solid(tx - 1.0, tx + 1.0, cupY, cupY + 3.4, apseZ - 2.55, apseZ - 1.25);

    // Three lights on it and nothing else in the apse: a picture light over
    // the plate, and two floods raking the cup from the dais corners.
    const trophyKey = new THREE.PointLight(0xfff0cc, 16, 11, 2);
    trophyKey.position.set(tx, cupY + 3.4, apseZ - 3.0);
    root.add(trophyKey);
    for (const s of [-1, 1]) {
      root.add(cylinder({
        rTop: 0.12, rBottom: 0.16, h: 0.2, pos: [tx + s * 1.9, daisTop + 0.12, apseZ - 1.2], mat: M_BRONZE, cast: false,
      }));
      const l = new THREE.PointLight(0xffe0a8, 7, 8, 2);
      l.position.set(tx + s * 1.9, daisTop + 0.3, apseZ - 1.2);
      root.add(l);
    }

    // The house crest over the apse, and a founder either side of the hall.
    const trophyCrest = flatArt('mansion.trophy.crest', {
      x: tx,
      y: GY + 4.5,
      z: apseZ - 0.22,
      rotY: Math.PI,
      w: 1.5,
      h: 1.9,
      material: mat({
        map: squatchArt('mansion-trophy-crest', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'EVERYBODY IN', ink: '#d8b23a', bg: '#161018',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });
    wallArt('trophy-founder-west', r.x0 + 0.14, GY + 2.7, 48.4, Math.PI / 2, 1.1, 1.5,
      makePortraitTexture('includer-booski', 'BOOSKIBRO', '#171c22'));
    /* z=52.0, not 48.4: the hall's east wall IS the house's west wall, and the
     * living room's own glazing runs z:47.6..50.8 through it. A portrait at
     * 48.4 would be hung across a window from the far side -- caught by the
     * art sweep, which does not care which room a piece thinks it is in. */
    wallArt('trophy-founder-east', r.x1 - 0.14, GY + 2.7, 52.0, -Math.PI / 2, 1.1, 1.5,
      makePortraitTexture('includer-shubes', 'THE SHUBENATOR', '#221a18'));

    /* Display cases down the long walls: the silverware that is not the point
     * of the room, kept where it can watch the thing that is. */
    for (const [dz, label] of [[44.6, 'A'], [51.8, 'B']]) {
      makeDisplayCase(r.x0 + 0.55, GY, dz, Math.PI / 2, 2.2, 2.1, 0.6, (g, w, h, d) => {
        for (let i = 0; i < 4; i++) {
          const sx = -w / 2 + 0.42 + i * 0.46;
          g.add(cylinder({ rTop: 0.13, rBottom: 0.09, h: 0.2, pos: [sx, h * 0.62, 0], mat: M_TROPHY_CUP }));
          g.add(cylinder({ r: 0.045, h: 0.16, pos: [sx, h * 0.46, 0], mat: M_TROPHY_CUP }));
          g.add(cylinder({ r: 0.11, h: 0.05, pos: [sx, h * 0.37, 0], mat: M_WOOD_DK }));
        }
        g.add(box({ size: [w - 0.3, 0.05, d - 0.2], pos: [0, h * 0.34, 0], mat: M_WOOD_DK, cast: false }));
        void label;
      });
      const caseLight = new THREE.PointLight(0xffe6c0, 3.2, 6, 2);
      caseLight.position.set(r.x0 + 1.2, GY + 1.9, dz);
      root.add(caseLight);
    }
    // Two busts on plinths flanking the runner, because a gallery has them.
    /* North of the arcade so neither stands in an arch, and 2.8 m off the
     * inner wall so neither stands in the run past the dais to the winter
     * garden door. */
    buildSmallStatue(r.x1 - 2.8, 48.6, GY, M_BRONZE);
    buildSmallStatue(r.x1 - 2.8, 52.6, GY, M_BRONZE);

    // A visitors' book on a lectern, at the mouth of the hall.
    root.add(box({
      size: [0.7, 0.09, 0.5], pos: [r.x0 + 1.9, GY + 1.06, 42.6], mat: M_WOOD_DK, rotX: -0.28, name: 'trophy-lectern',
    }));
    root.add(cylinder({ r: 0.09, h: 1.05, pos: [r.x0 + 1.9, GY + 0.52, 42.6], mat: M_WOOD_DK }));
    root.add(cylinder({ r: 0.32, h: 0.06, pos: [r.x0 + 1.9, GY + 0.03, 42.6], mat: M_BRONZE, cast: false }));
    root.add(box({
      size: [0.5, 0.05, 0.34], pos: [r.x0 + 1.9, GY + 1.13, 42.58], mat: M_CARD, rotX: -0.28, cast: false,
    }));
    solid(r.x0 + 1.5, r.x0 + 2.3, GY, GY + 1.1, 42.2, 43.0);

    curtains('x', r.x0 + 0.24, 44.7, GY + 2.0, 4.0, 2.9, M_CURTAIN_RED);
    curtains('x', r.x0 + 0.24, 51.9, GY + 2.0, 4.0, 2.9, M_CURTAIN_RED);
    const chandelierA = ceilingLight(cx, 45.0, CEIL - 0.5, 0xffdca0, 6.5, 15);
    const chandelierB = ceilingLight(cx, 51.0, CEIL - 0.5, 0xffdca0, 6.5, 15);
    sconce(r.x1 - 0.06, GY + 2.9, 42.2, -Math.PI / 2, 2.2);
    sconce(r.x1 - 0.06, GY + 2.9, 54.6, -Math.PI / 2, 2.2);

    return {
      crest: trophyCrest,
      plate: includerPlate,
      trophy,
      dais: { x: tx, z: apseZ - 1.9, top: daisTop },
      lights: [chandelierA, chandelierB, trophyKey],
      /** The engraved words, so a verifier can assert the text is real. */
      engraving: 'THE GREAT INCLUDER',
    };
  }

  /* ================================================================== */
  /* THE WEST WING -- THE WINTER GARDEN                                  */
  /* ================================================================== */
  function buildWinterGarden() {
    const r = WINTER_GARDEN;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const CEIL = WING_ROOF_Y0;

    topping(r.x0, r.x1, GY + 0.012, r.z0, r.z1, M_CHEQUER, 'winter-floor');
    trimRoom(r, GY, CEIL);

    /* A glazed barrel over the middle. The wing's roof slab is solid above it,
     * so this is a lantern light rather than a real sky -- but at night, with
     * the moon on the outside of the house, a leaded ceiling with a lamp above
     * each bay is what you would actually see anyway. */
    for (let i = 0; i < 9; i++) {
      const pz = THREE.MathUtils.lerp(r.z0 + 1.0, r.z1 - 1.0, i / 8);
      root.add(box({
        size: [r.x1 - r.x0 - 1.0, 0.14, 0.16], pos: [cx, CEIL - 0.24, pz], mat: M_TRIM, cast: false,
      }));
    }
    for (const gx of [cx - 1.9, cx, cx + 1.9]) {
      root.add(box({
        size: [0.14, 0.12, r.z1 - r.z0 - 2.0], pos: [gx, CEIL - 0.24, cz], mat: M_TRIM, cast: false,
      }));
    }
    root.add(box({
      size: [r.x1 - r.x0 - 1.0, 0.04, r.z1 - r.z0 - 2.0],
      pos: [cx, CEIL - 0.32, cz],
      mat: mat({
        color: 0xbfd8dd, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.28,
      }),
      cast: false,
    }));

    // The lily pool: an octagonal basin in the middle, kerbed in stone.
    const poolR = 2.1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = cx + Math.cos(a) * poolR;
      const pz = cz + Math.sin(a) * poolR;
      /* Tangent to the basin, which is -(a + PI/2) and not -a: a yaw of theta
       * sends local +x to (cos theta, -sin theta), and the tangent at angle a
       * is (-sin a, cos a). At -a the kerbs splay out like a star. */
      root.add(box({
        size: [1.75, 0.44, 0.4], pos: [px, GY + 0.22, pz], mat: M_MARBLE, rotY: -(a + Math.PI / 2), cast: false,
      }));
      solid(px - 0.7, px + 0.7, GY, GY + 0.46, pz - 0.7, pz + 0.7);
    }
    const lily = new THREE.Mesh(
      new THREE.CircleGeometry(poolR - 0.2, 32),
      mat({
        color: 0x123a34, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, unique: true,
      }),
    );
    lily.rotation.x = -Math.PI / 2;
    lily.position.set(cx, GY + 0.33, cz);
    root.add(lily);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const rr = 0.5 + (i % 3) * 0.45;
      root.add(cylinder({
        r: 0.22, h: 0.02, pos: [cx + Math.cos(a) * rr, GY + 0.35, cz + Math.sin(a) * rr], mat: M_FELT_GREEN, cast: false,
      }));
    }
    root.add(cylinder({ rTop: 0.16, rBottom: 0.3, h: 0.9, pos: [cx, GY + 0.78, cz], mat: M_MARBLE }));
    root.add(cylinder({ r: 0.62, h: 0.1, pos: [cx, GY + 1.26, cz], mat: M_MARBLE, cast: false }));
    solid(cx - 0.35, cx + 0.35, GY, GY + 1.3, cz - 0.35, cz + 0.35);
    const poolGlow = new THREE.PointLight(0x7fd8c4, 4.2, 9, 2);
    poolGlow.position.set(cx, GY + 0.6, cz);
    root.add(poolGlow);

    /* Planting: big palms in terracotta, citrus in tubs, ferns on stands.
     * `makePlant` is the apartment's own pot plant -- scaled up it is a very
     * good conservatory palm, and it costs nothing new. */
    /* The east row stands 2.6 m off the inner wall, not 1.5: the run from the
     * trophy hall's door up to the dining room's is along that wall, and a
     * 1.3 m palm tub on it leaves less than a metre to squeeze through. */
    for (const [px, pz, s] of [
      [r.x0 + 1.5, r.z0 + 2.2, 3.1], [r.x1 - 2.6, r.z0 + 2.2, 2.7],
      [r.x0 + 1.5, r.z1 - 2.2, 3.1], [r.x1 - 2.6, r.z1 - 2.2, 2.7],
      [r.x0 + 1.4, cz, 2.4], [r.x1 - 2.6, cz, 2.4],
    ]) {
      root.add(cylinder({
        rTop: 0.62, rBottom: 0.46, h: 0.66, pos: [px, GY + 0.33, pz], mat: mat({ color: 0x8c4a2c, roughness: 0.9 }),
      }));
      root.add(cylinder({
        r: 0.68, h: 0.1, pos: [px, GY + 0.63, pz], mat: mat({ color: 0x9c5636, roughness: 0.9 }), cast: false,
      }));
      const palm = makePlant(M, { x: px, z: pz, scale: s });
      const wrap = new THREE.Group();
      wrap.position.y = GY + 0.62;
      wrap.add(palm.group);
      root.add(wrap);
      solid(px - 0.66, px + 0.66, GY, GY + 0.7, pz - 0.66, pz + 0.66);
    }

    // Cane furniture round the pool, and a drinks trolley.
    /* Seating pulled in to +/-2.7 and the drinks trolley moved to the WEST
     * side. The run from the trophy hall's door to the dining room's goes up
     * this room's east wall, and at +/-3.3 the cane chair left 52 cm to get
     * past -- under the player's own 60 cm. The trolley closed the rest of it. */
    for (const [sx, sz, yaw] of [
      [cx - 2.7, cz - 1.2, Math.PI / 2], [cx + 2.7, cz + 1.2, -Math.PI / 2],
      [cx - 1.2, cz + 3.4, Math.PI], [cx + 1.2, cz - 3.4, 0],
    ]) {
      makeSeat(sx, GY, sz, yaw, M_FABRIC_GOLD, 0.72);
    }
    root.add(cylinder({ r: 0.52, h: 0.06, pos: [cx + 2.7, GY + 0.58, cz - 1.4], mat: M_GLASS_CASE }));
    root.add(cylinder({ r: 0.07, h: 0.58, pos: [cx + 2.7, GY + 0.29, cz - 1.4], mat: M_BRONZE }));
    const trolleyX = r.x0 + 1.2;
    root.add(box({ size: [0.8, 0.05, 0.5], pos: [trolleyX, GY + 0.78, r.z0 + 5.4], mat: M_GLASS_CASE }));
    root.add(box({ size: [0.8, 0.05, 0.5], pos: [trolleyX, GY + 0.4, r.z0 + 5.4], mat: M_GLASS_CASE, cast: false }));
    for (const [wx, wz] of [[trolleyX - 0.25, r.z0 + 5.2], [trolleyX + 0.25, r.z0 + 5.6]]) {
      root.add(cylinder({ r: 0.06, h: 0.78, pos: [wx, GY + 0.39, wz], mat: M_CHROME }));
    }
    const bottle = makeWhiskeyBottle(M, { x: trolleyX, y: GY + 0.81, z: r.z0 + 5.3, rotY: 0.3 });
    root.add(bottle.group);
    solid(trolleyX - 0.4, trolleyX + 0.4, GY, GY + 0.8, r.z0 + 5.1, r.z0 + 5.7);

    // A birdcage on a stand, empty, hood up. Nobody asks about it.
    root.add(cylinder({ r: 0.34, h: 0.05, pos: [r.x0 + 1.8, GY + 0.03, r.z1 - 5.0], mat: M_BRONZE, cast: false }));
    root.add(cylinder({ r: 0.05, h: 1.5, pos: [r.x0 + 1.8, GY + 0.75, r.z1 - 5.0], mat: M_BRONZE }));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      root.add(cylinder({
        r: 0.012, h: 0.9, pos: [r.x0 + 1.8 + Math.cos(a) * 0.32, GY + 1.95, r.z1 - 5.0 + Math.sin(a) * 0.32], mat: M_GOLD,
      }));
    }
    root.add(cylinder({ rTop: 0.06, rBottom: 0.36, h: 0.34, pos: [r.x0 + 1.8, GY + 2.55, r.z1 - 5.0], mat: M_GOLD, cast: false }));
    solid(r.x0 + 1.5, r.x0 + 2.1, GY, GY + 2.4, r.z1 - 5.3, r.z1 - 4.7);

    const winterShield = flatArt('mansion.winter.shield', {
      x: r.x1 - 0.12,
      y: GY + 3.2,
      z: r.z1 - 2.4,
      rotY: -Math.PI / 2,
      w: 1.2,
      h: 1.5,
      material: mat({
        map: squatchArt('mansion-winter-shield', {
          title: ['THE WINTER', 'GARDEN'], footer: 'PLANTED 1991', ink: '#9fd8b4', bg: '#12201a',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });

    const lights = [
      ceilingLight(cx, r.z0 + 4.0, CEIL - 0.45, 0xdff0e4, 5.2, 14),
      ceilingLight(cx, cz, CEIL - 0.45, 0xdff0e4, 5.6, 15),
      ceilingLight(cx, r.z1 - 4.0, CEIL - 0.45, 0xdff0e4, 5.2, 14),
    ];
    return { shield: winterShield, pool: { x: cx, z: cz, r: poolR }, lights };
  }

  /* ================================================================== */
  /* THE WEST WING'S OWN PARTITION                                       */
  /* ================================================================== */
  function buildWestWingWalls() {
    partition({
      axis: 'z',
      at: (TROPHY_HALL.z1 + WINTER_GARDEN.z0) / 2,
      u0: WEST_WING.x0,
      u1: WEST_WING.x1,
      y0: GY,
      y1: WING_ROOF_Y0,
      tag: 'wing-cross',
      material: M_WALL_WARM,
      /* x:-17.4..-16.2, hard against the house wall, and NOT on the hall's
       * centre line where it obviously wants to be: the centre line is where
       * the trophy's apse and dais are, and the apse is a 4.6 m panel with no
       * collider -- so a door behind it is a door you walk through a wall to
       * use. Caught by walking the ground floor end to end rather than by
       * entering each room from outside its own threshold. */
      openings: [{
        id: 'trophyToWinter', u0: -17.4, u1: -16.2, y0: GY, y1: GY + 2.8,
      }],
    });
  }
  buildWestWingWalls();
  const trophyProps = buildTrophyHall();
  const winterProps = buildWinterGarden();

  /* ================================================================== */
  /* THE LOWER LEVEL                                                     */
  /*                                                                      */
  /* Owner brief, verbatim: "A guest bed room downstairs", "A PC lan party */
  /* room downstairs decked out with sasquatch gear and PCs", "A Home      */
  /* theatre room (will add a watchable movie)", and a vault "with a bunch */
  /* of treasure and shit."                                                */
  /*                                                                        */
  /* Four rooms off one spine corridor, north of the armory and under the    */
  /* ballroom. WHICH WALLS THIS CLAIMS, because a sibling pass is mounting   */
  /* a weapons armory down here: the armory's own south, west and east walls */
  /* are untouched, as is its caged store, its alcove and every rack in it.  */
  /* The only masonry this pass opens is 1.7 m of the armory's NORTH wall    */
  /* (CELLAR_DOOR, x:5.35..7.05), which is the one stretch with nothing      */
  /* standing against it. Everything from z=64 north is new ground.          */
  /*                                                                         */
  /* AND WHAT IS LEFT FREE, because a later pass adds a secret door down here */
  /* to a lab: the corridor's WEST END WALL (x=-15.6, z:64.3..67.4) is blank  */
  /* by design -- no rack, no picture, no fitting, nothing hung on it and     */
  /* nothing standing in front of it. It is the obvious place for a door that */
  /* is not supposed to look like one, and it has been kept clear for that.   */
  /* ================================================================== */
  function buildCellarWalls() {
    // Corridor to rooms. One partition, four openings.
    partition({
      axis: 'z',
      at: (CELLAR_HALL.z1 + GUEST_ROOM.z0) / 2,
      u0: BASEMENT_WING.x0,
      u1: BASEMENT_WING.x1,
      y0: BY,
      y1: -0.24,
      tag: 'cellar-rooms',
      material: M_WALL_WARM,
      openings: [
        { id: 'cellarToGuest', u0: -13.0, u1: -11.2, y0: BY, y1: BY + 2.1 },
        { id: 'cellarToTheatre', u0: -3.85, u1: -1.85, y0: BY, y1: BY + 2.1 },
        { id: 'cellarToLan', u0: 5.4, u1: 7.4, y0: BY, y1: BY + 2.1 },
        { id: 'cellarToVault', u0: 12.4, u1: 14.3, y0: BY, y1: BY + 2.1 },
      ],
    });
    // The three dividers between the four rooms.
    for (const [at, tag] of [
      [(GUEST_ROOM.x1 + THEATRE.x0) / 2, 'guest-theatre'],
      [(THEATRE.x1 + LAN_ROOM.x0) / 2, 'theatre-lan'],
      [(LAN_ROOM.x1 + VAULT.x0) / 2, 'lan-vault'],
    ]) {
      partition({
        axis: 'x',
        at,
        u0: GUEST_ROOM.z0 - 0.15,
        u1: BASEMENT_WING.z1,
        y0: BY,
        y1: -0.24,
        tag: `cellar-${tag}`,
        material: M_WALL_WARM,
      });
    }
  }
  buildCellarWalls();
  /* The armory-to-corridor doorway is cut in the SHELL's masonry rather than
   * by `partition`, so it does not register itself. Declared here by hand, so
   * the art/doorway sweep in tools/verify-mansion.mjs covers it like every
   * other opening in the house. */
  doors.cellarFromArmory = {
    id: 'cellarFromArmory',
    x: (CELLAR_DOOR.x0 + CELLAR_DOOR.x1) / 2,
    y: BY,
    z: BASEMENT_ROOM.z1 + 0.15,
    x0: CELLAR_DOOR.x0,
    x1: CELLAR_DOOR.x1,
    y0: BY,
    y1: BY + 2.2,
    z0: BASEMENT_ROOM.z1,
    z1: BASEMENT_ROOM.z1 + 0.3,
    open: true,
  };

  function buildCellarHall() {
    const r = CELLAR_HALL;
    const cz = (r.z0 + r.z1) / 2;
    topping(r.x0, r.x1, BY + 0.012, r.z0, r.z1, concreteMaterial(r.x1 - r.x0, r.z1 - r.z0), 'cellar-hall-floor');
    // A runner down the middle, so it is a hallway and not a plant room.
    rug(0, cz, r.x1 - r.x0 - 2.4, 1.9, BY, M_CARPET_HALL);
    // Brick dado to waist height on both long walls, plaster above.
    /* Notched round every one of the five doorways this corridor serves --
     * four rooms on its north side and the armory on its south. */
    const NORTH_DOORS = [[-13.0, -11.2], [-3.85, -1.85], [5.4, 7.4], [12.4, 14.3]];
    const SOUTH_DOORS = [[CELLAR_DOOR.x0, CELLAR_DOOR.x1]];
    for (const [dz0, dz1, gaps] of [
      [r.z0, r.z0 + 0.06, SOUTH_DOORS], [r.z1 - 0.06, r.z1, NORTH_DOORS],
    ]) {
      linedBand({
        axis: 'x', x0: r.x0, x1: r.x1, y0: BY, y1: BY + 1.05, z0: dz0, z1: dz1, material: M_BRICK_CELLAR, gaps,
      });
      linedBand({
        axis: 'x', x0: r.x0, x1: r.x1, y0: BY + 1.035, y1: BY + 1.125, z0: dz0 - 0.025, z1: dz1 + 0.025, material: M_TRIM, gaps,
      });
    }
    /* Brick piers breaking the run. Their x positions are chosen against the
     * five doorways this corridor serves -- the four rooms on its north side
     * and the armory on its south -- so no pier ever stands in an opening.
     * A pier in a doorway is furniture in a doorway with a different name. */
    for (const px of [-14.8, -8.5, -6.2, 0.6, 3.2, 9.4, 15.0]) {
      for (const pz of [r.z0 + 0.22, r.z1 - 0.22]) {
        root.add(box({
          size: [0.7, -0.24 - BY, 0.44], pos: [px, (BY - 0.24) / 2, pz], mat: M_BRICK_CELLAR, cast: false,
        }));
      }
    }
    const lights = [];
    for (const px of [-11.4, -6.0, 0.0, 6.0, 11.4]) {
      lights.push(ceilingLight(px, cz, -0.4, 0xffdca0, 6.4, 15));
    }
    /* Signage over each door, so the corridor tells you what is behind it --
     * the cellar stair's own CELLAR sign is what made the basement findable
     * in the first place, and four unmarked doors underground is worse. */
    for (const [sx, text] of [
      [-12.1, 'GUEST'], [-2.85, 'THEATRE'], [6.4, 'LAN'], [13.35, 'VAULT'],
    ]) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(1.25, 0.28),
        mat({
          map: printed(`mansion.cellar.sign.${text.toLowerCase()}`, [text], {
            w: 448, h: 100, bg: '#12100e', fg: '#e8c268', font: '900 52px "Trebuchet MS", sans-serif',
          }),
          roughness: 0.7,
          emissive: 0x4a3a16,
          unique: true,
        }),
      );
      sign.position.set(sx, BY + 2.3, r.z1 - 0.08);
      /* Facing back down the corridor, like the armory's own LOWER LEVEL sign
       * two rooms south of here. These four were left at rotation 0, whose
       * normal is +z -- into the wall they are screwed to -- so from the only
       * place you can read them you were looking at the back of an unlit
       * plane. Four signs whose whole job is telling you where you are. */
      sign.rotation.y = Math.PI;
      root.add(sign);
    }
    // Framed photographs of the house being built, between the doors.
    const shots = [
      [-10.4, 'cellar-dig', 'THE DIG, 1986'],
      [-0.6, 'cellar-pour', 'THE POUR'],
      [11.0, 'cellar-topping', 'TOPPING OUT'],
    ];
    /* rotY PI, for the same reason as the signs above: `makeFrame` builds its
     * picture on the group's own +z face, so a frame hung on the corridor's
     * NORTH wall at rotY 0 shows the corridor its dark backing board and shows
     * the photograph to the masonry. */
    for (const [sx, id, label] of shots) {
      wallArt(id, sx, BY + 1.75, r.z1 - 0.1, Math.PI, 0.8, 0.6,
        makePortraitTexture(id, label, '#1b1712'));
    }
    /* The house crest goes on the SOUTH wall, beside the armory door.
     *
     * Not on the corridor's west end wall, which is where it would naturally
     * have gone: that end is being kept deliberately blank. A later pass adds
     * a secret door down here to a lab, and a blank brick end wall at the far
     * end of a lit corridor is the one place in this house a door could be
     * that nobody would read as a door. Nothing is hung on it, nothing stands
     * in front of it, and the runner stops short of it. */
    const cellarCrest = flatArt('mansion.cellar.crest', {
      x: 10.5,
      y: BY + 1.6,
      z: r.z0 + 0.08,
      rotY: 0,
      w: 0.95,
      h: 1.2,
      material: mat({
        map: squatchArt('mansion-cellar-crest', {
          title: ['LOWER', 'LEVEL'], footer: 'MEMBERS AND GUESTS', ink: '#c8a24a', bg: '#141014',
        }),
        roughness: 0.95,
        unique: true,
      }),
    });
    // A bench, a fire point and a service panel -- the things a corridor has.
    root.add(box({ size: [1.9, 0.09, 0.44], pos: [-4.4, BY + 0.46, r.z0 + 0.34], mat: M_WOOD_DK }));
    for (const lx of [-5.2, -3.6]) {
      root.add(box({ size: [0.1, 0.46, 0.4], pos: [lx, BY + 0.23, r.z0 + 0.34], mat: M_RACK }));
    }
    solid(-5.4, -3.4, BY, BY + 0.5, r.z0 + 0.1, r.z0 + 0.58);
    root.add(box({
      size: [0.24, 0.5, 0.24], pos: [10.6, BY + 0.5, r.z0 + 0.2], mat: mat({ color: 0x8e1c18, roughness: 0.55 }), name: 'cellar-extinguisher',
    }));
    root.add(box({
      size: [0.7, 0.9, 0.14], pos: [1.6, BY + 1.5, r.z0 + 0.12], mat: M_RACK, name: 'cellar-panel',
    }));
    for (let i = 0; i < 6; i++) {
      root.add(box({
        size: [0.08, 0.14, 0.04], pos: [1.36 + (i % 3) * 0.24, BY + 1.72 - Math.floor(i / 3) * 0.28, r.z0 + 0.2], mat: M_CHROME, cast: false,
      }));
    }
    return { crest: cellarCrest, lights };
  }
  const cellarHallProps = buildCellarHall();

  /* ---- The guest bedroom. ------------------------------------------- */
  function buildGuestRoom() {
    const r = GUEST_ROOM;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    topping(r.x0, r.x1, BY + 0.012, r.z0, r.z1, M_PARQUET, 'guest-floor');
    trimRoom(r, BY, -0.3);
    rug(cx, cz + 0.4, 5.4, 4.6, BY, M_RUG_LIVING);
    lineRoom(r, 1.0, M_WALL_DEEP, [-13.0, -11.2], 0.04);

    const bedX = cx - 0.6;
    const bedZ = r.z1 - 1.7;
    const wrap = new THREE.Group();
    wrap.position.y = BY;
    const bed = makeBed(M, {
      x: bedX, z: bedZ, w: 1.8, len: 2.2,
    });
    bed.group.position.set(bedX * 2, 0, bedZ * 2);
    bed.group.rotation.y = Math.PI;
    wrap.add(bed.group);
    root.add(wrap);
    solid(bedX - 0.95, bedX + 0.95, BY, BY + 0.75, bedZ - 1.2, bedZ + 1.2);
    root.add(box({
      size: [2.2, 1.35, 0.16], pos: [bedX, BY + 0.85, r.z1 - 0.28], mat: M_LEATHER_TAN, name: 'guest-headboard',
    }));
    for (const side of [-1, 1]) {
      const nx = bedX + side * 1.45;
      const ns = makeNightstand(M, { x: nx, z: bedZ + 1.05 });
      const nw = new THREE.Group();
      nw.position.y = BY;
      nw.add(ns.group);
      root.add(nw);
      solid(nx - 0.28, nx + 0.28, BY, BY + 0.58, bedZ + 0.81, bedZ + 1.29);
      root.add(cylinder({ r: 0.1, h: 0.04, pos: [nx, BY + 0.6, bedZ + 1.05], mat: M_BRONZE }));
      root.add(cylinder({ r: 0.02, h: 0.28, pos: [nx, BY + 0.75, bedZ + 1.05], mat: M_BRONZE }));
      root.add(cylinder({
        rTop: 0.15, rBottom: 0.19, h: 0.22, pos: [nx, BY + 0.98, bedZ + 1.05], mat: mat({ color: 0xe8dcc0, roughness: 0.85 }),
      }));
      const l = new THREE.PointLight(0xffd0a0, 2.0, 6, 2);
      l.position.set(nx, BY + 0.96, bedZ + 1.05);
      root.add(l);
    }

    caseFurniture(r.x0 + 0.5, cz - 0.6, BY, 1.8, 0.55, 0.9, Math.PI / 2, 3);
    root.add(box({
      size: [0.06, 1.3, 1.0],
      pos: [r.x0 + 0.14, BY + 1.75, cz - 0.6],
      mat: mat({ color: 0xdce6ee, roughness: 0.08, metalness: 0.85 }),
      name: 'guest-mirror',
    }));
    root.add(box({
      size: [0.66, 2.1, 1.9], pos: [r.x1 - 0.4, BY + 1.05, r.z0 + 1.8], mat: M_WOOD_DK, name: 'guest-wardrobe',
    }));
    root.add(box({
      size: [0.05, 1.8, 0.9], pos: [r.x1 - 0.75, BY + 1.1, r.z0 + 1.8], mat: M_WOOD, cast: false,
    }));
    solid(r.x1 - 0.75, r.x1 - 0.05, BY, BY + 2.1, r.z0 + 0.85, r.z0 + 2.75);
    makeSeat(r.x0 + 1.5, BY, r.z0 + 1.5, 0.9, M_FABRIC_CHAIR, 0.8);
    // A luggage rack with a case on it, and a tray with two glasses.
    root.add(box({ size: [0.9, 0.06, 0.5], pos: [cx + 2.0, BY + 0.5, r.z0 + 1.1], mat: M_WOOD_DK }));
    for (const [lx, lz] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]]) {
      root.add(box({ size: [0.05, 0.5, 0.05], pos: [cx + 2.0 + lx, BY + 0.25, r.z0 + 1.1 + lz], mat: M_WOOD_DK }));
    }
    root.add(box({ size: [0.8, 0.24, 0.46], pos: [cx + 2.0, BY + 0.65, r.z0 + 1.1], mat: M_LEATHER_TAN }));
    solid(cx + 1.5, cx + 2.5, BY, BY + 0.8, r.z0 + 0.8, r.z0 + 1.4);
    const shotA = makeShotGlass(M, { x: cx - 1.35, y: BY + 0.6, z: bedZ + 1.05 });
    root.add(shotA.group);

    /* A lightwell. There is no daylight four metres under a ballroom, so the
     * room is given the thing a good basement guest room actually has: a
     * glazed reveal with a lamp behind it, reading as a window onto a garden
     * that is not there. Nobody staying here is going to check. */
    root.add(box({
      size: [0.12, 1.3, 2.2], pos: [r.x0 + 0.06, BY + 1.5, cz + 2.0], mat: M_TRIM, cast: false,
    }));
    root.add(box({
      size: [0.05, 1.15, 2.05],
      pos: [r.x0 + 0.14, BY + 1.5, cz + 2.0],
      mat: mat({
        color: 0xd6e4ea, roughness: 0.85, transparent: true, opacity: 0.7, emissive: 0x2a3a44, emissiveIntensity: 1.2,
      }),
      cast: false,
    }));
    const wellLight = new THREE.PointLight(0xbcd8e4, 3.4, 8, 2);
    wellLight.position.set(r.x0 + 0.5, BY + 1.6, cz + 2.0);
    root.add(wellLight);
    curtains('x', r.x0 + 0.3, cz + 2.0, BY + 0.8, 2.8, 1.9, M_CURTAIN);

    const guestArt = flatArt('mansion.guest.art', {
      x: cx - 0.6,
      y: BY + 1.95,
      z: r.z1 - 0.13,
      rotY: Math.PI,
      w: 1.1,
      h: 1.4,
      material: mat({
        map: squatchArt('mansion-guest-art', {
          title: ['STAY', 'AS LONG'], footer: 'AS YOU LIKE', ink: '#c8a24a', bg: '#1d1620',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });
    const light = ceilingLight(cx, cz, -0.4, 0xffdca0, 6.6, 15);
    return { art: guestArt, light };
  }
  const guestProps = buildGuestRoom();

  /* ---- The home theatre. -------------------------------------------- */
  function buildTheatre() {
    const r = THEATRE;
    const cx = (r.x0 + r.x1) / 2;
    topping(r.x0, r.x1, BY + 0.012, r.z0, r.z1, M_CARPET_HALL, 'theatre-floor');
    // The rear riser, at the end you come in at.
    const T = THEATRE_TIER;
    root.add(box({
      size: [T.x1 - T.x0, T.y, T.z1 - T.z0],
      pos: [(T.x0 + T.x1) / 2, BY + T.y / 2, (T.z0 + T.z1) / 2],
      mat: M_WOOD_DK,
      name: 'theatre-riser',
    }));
    topping(T.x0, T.x1, BY + T.y + 0.012, T.z0, T.z1, M_CARPET_HALL, 'theatre-riser-floor');
    // A nosing strip with a step light, so the drop is visible in the dark.
    root.add(box({
      size: [T.x1 - T.x0, 0.05, 0.12],
      pos: [(T.x0 + T.x1) / 2, BY + T.y + 0.02, T.z1],
      mat: mat({ color: 0x2a2418, emissive: 0x6a5a20, emissiveIntensity: 1.4, roughness: 0.7 }),
      cast: false,
    }));

    /* Acoustic panelling on all four walls -- the one room in the house where
     * the wall covering is doing a job rather than a look. */
    lineRoom(r, 2.2, M_ACOUSTIC, [-3.85, -1.85], 0.09);

    /* The screen, on the north wall, in a masked frame with drapes either
     * side. The picture itself is a real `core/tv.js` set, mounted by
     * src/mansion/main.js against this mesh -- see the seam note there. */
    const screenZ = r.z1 - 0.14;
    root.add(box({
      size: [6.4, 3.0, 0.16], pos: [cx, BY + 1.62, screenZ], mat: M_SILHOUETTE, name: 'theatre-screen-frame',
    }));
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(5.9, 2.55),
      mat({ color: 0x0a0c10, roughness: 0.5, unique: true }),
    );
    screen.position.set(cx, BY + 1.62, screenZ - 0.1);
    screen.rotation.y = Math.PI;
    screen.name = 'theatre-screen';
    root.add(screen);
    for (const s of [-1, 1]) {
      root.add(box({
        size: [0.55, 3.2, 0.28], pos: [cx + s * 3.5, BY + 1.6, screenZ - 0.16], mat: M_CURTAIN_RED,
      }));
    }
    root.add(box({
      size: [7.6, 0.5, 0.3], pos: [cx, BY + 3.32, screenZ - 0.16], mat: M_CURTAIN_RED, cast: false,
    }));

    /* Recliners: two rows, the back one on the riser. Built here rather than
     * from makeSeat because a cinema chair is a different animal -- a raked
     * back, arms with a cup holder, and a fold-down seat pad. */
    const seats = [];
    function recliner(sx, sz, sy) {
      const g = new THREE.Group();
      g.add(box({ size: [0.72, 0.34, 0.72], pos: [0, 0.28, 0], mat: M_LEATHER_DK }));
      g.add(box({ size: [0.68, 0.12, 0.66], pos: [0, 0.5, 0.02], mat: M_LEATHER_RED, name: 'recliner-pad' }));
      g.add(box({
        size: [0.7, 0.85, 0.16], pos: [0, 0.86, -0.3], mat: M_LEATHER_RED, rotX: -0.18,
      }));
      for (const s of [-1, 1]) {
        g.add(box({ size: [0.14, 0.24, 0.7], pos: [s * 0.42, 0.66, 0.02], mat: M_LEATHER_DK }));
        g.add(cylinder({ r: 0.05, h: 0.05, pos: [s * 0.42, 0.78, 0.22], mat: M_SILHOUETTE, cast: false }));
      }
      g.position.set(sx, sy, sz);
      root.add(g);
      solid(sx - 0.48, sx + 0.48, sy, sy + 0.9, sz - 0.42, sz + 0.42);
      seats.push(g);
    }
    /* Six a side, two rows, with a CENTRE AISLE exactly as wide as the door
     * it leads out of. Twelve seats in a straight grid would have put one
     * recliner squarely in the doorway, which is the same fault as art over a
     * doorway with upholstery on it -- and the way in to a room is the one
     * line through it that nothing may stand on. */
    for (const sx of [-6.5, -5.4, -4.3, -1.4, -0.3, 0.8]) {
      recliner(sx, 71.9, BY);
      recliner(sx, 69.2, BY + THEATRE_TIER.y);
    }

    // Projector on the ceiling over the back row, with a faint beam.
    root.add(box({
      size: [0.62, 0.28, 0.9], pos: [cx, -0.62, 69.4], mat: M_STOVE_BLACK, name: 'theatre-projector',
    }));
    root.add(cylinder({
      r: 0.09, h: 0.14, pos: [cx, -0.66, 69.9], mat: M_CHROME, rotX: Math.PI / 2, cast: false,
    }));
    for (const hz of [69.2, 69.6]) {
      root.add(cylinder({ r: 0.02, h: 0.36, pos: [cx - 0.24, -0.42, hz], mat: M_CHROME }));
      root.add(cylinder({ r: 0.02, h: 0.36, pos: [cx + 0.24, -0.42, hz], mat: M_CHROME }));
    }

    /* A popcorn cart at the back, behind the rear row and clear of both the
     * aisle and the door, because Lou saw one in a lobby once. */
    const cartX = 1.25;
    const cartZ = 68.25;
    root.add(box({ size: [0.9, 1.0, 0.62], pos: [cartX, BY + T.y + 0.5, cartZ], mat: mat({ color: 0x8e1c18, roughness: 0.6 }) }));
    root.add(box({
      size: [0.8, 0.7, 0.54],
      pos: [cartX, BY + T.y + 1.35, cartZ],
      mat: mat({ color: 0xf2e8d0, roughness: 0.3, transparent: true, opacity: 0.45 }),
      cast: false,
    }));
    root.add(box({
      size: [0.94, 0.14, 0.68], pos: [cartX, BY + T.y + 1.76, cartZ], mat: M_GOLD, cast: false,
    }));
    solid(cartX - 0.5, cartX + 0.5, BY, BY + T.y + 1.8, cartZ - 0.34, cartZ + 0.34);

    const theatreBanner = flatArt('mansion.theatre.banner', {
      x: r.x0 + 0.14,
      y: BY + 1.7,
      z: 70.8,
      rotY: Math.PI / 2,
      w: 1.0,
      h: 1.35,
      material: mat({
        map: squatchArt('mansion-theatre-banner', {
          title: ['THE SILVER', 'SCREENING ROOM'], footer: 'ONE SHOWING NIGHTLY', ink: '#e0b84a', bg: '#150f14',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });
    /* House lights. Sconces down both walls and two dimmed downlights over the
     * aisle, because "a cinema is dark" and "you cannot see the room you just
     * walked into" are different things -- the first render of this room was
     * the second one. Aisle strip lights down the seat ends as well, which is
     * what a room with a step in the dark actually has. */
    const lights = [];
    for (const sz of [69.4, 72.4]) {
      lights.push(sconce(r.x0 + 0.13, BY + 1.95, sz, Math.PI / 2, 3.2));
      lights.push(sconce(r.x1 - 0.13, BY + 1.95, sz, -Math.PI / 2, 3.2));
    }
    lights.push(ceilingLight(cx, 71.4, -0.42, 0xffd0a0, 3.4, 11));
    lights.push(ceilingLight(cx, 73.9, -0.42, 0xffd0a0, 2.6, 9));
    for (const [ax, az] of [[-3.6, 70.6], [-2.1, 70.6], [-3.6, 73.2], [-2.1, 73.2]]) {
      root.add(box({
        size: [0.16, 0.05, 0.16],
        pos: [ax, BY + 0.06, az],
        mat: mat({ color: 0x2a2418, emissive: 0xffb85a, emissiveIntensity: 1.8, roughness: 0.6 }),
        cast: false,
      }));
      const l = new THREE.PointLight(0xffb85a, 1.6, 4, 2);
      l.position.set(ax, BY + 0.2, az);
      root.add(l);
      lights.push(l);
    }
    return {
      screen, banner: theatreBanner, seats, lights,
    };
  }
  const theatreProps = buildTheatre();

  /* ---- The LAN room. ------------------------------------------------- */
  function buildLanRoom() {
    const r = LAN_ROOM;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    topping(r.x0, r.x1, BY + 0.012, r.z0, r.z1,
      mat({ map: tiled(laminate('#1b1d24'), 6, 5), roughness: 0.5, unique: true }), 'lan-floor');
    trimRoom(r, BY, -0.3);
    /* Slate-blue lining with an RGB cove above it, right round the room.
     *
     * The first version lined these walls in the house's own near-black brown
     * and the room rendered as five lit monitors floating in a void -- true to
     * a gaming room and useless to look at. The cove is what a room "decked
     * out" actually has, and it is emissive rather than lit, so it costs one
     * material and no light budget. */
    const M_LAN_WALL = mat({ color: 0x1e2632, roughness: 0.9 });
    const M_LAN_COVE = mat({
      color: 0x0a0e18, emissive: 0x3a6cff, emissiveIntensity: 2.6, roughness: 0.6,
    });
    const LAN_DOOR = [5.4, 7.4];
    lineRoom(r, 2.3, M_LAN_WALL, LAN_DOOR, 0.04);
    for (const [cy, gaps] of [[BY + 2.14, []], [BY + 0.32, [LAN_DOOR]]]) {
      linedBand({
        axis: 'x', x0: r.x0, x1: r.x1, y0: cy - 0.035, y1: cy + 0.035, z0: r.z0, z1: r.z0 + 0.08, material: M_LAN_COVE, gaps,
      });
      linedBand({
        axis: 'x', x0: r.x0, x1: r.x1, y0: cy - 0.035, y1: cy + 0.035, z0: r.z1 - 0.08, z1: r.z1, material: M_LAN_COVE,
      });
      linedBand({
        axis: 'z', x0: r.x0, x1: r.x0 + 0.08, y0: cy - 0.035, y1: cy + 0.035, z0: r.z0, z1: r.z1, material: M_LAN_COVE,
      });
      linedBand({
        axis: 'z', x0: r.x1 - 0.08, x1: r.x1, y0: cy - 0.035, y1: cy + 0.035, z0: r.z0, z1: r.z1, material: M_LAN_COVE,
      });
    }
    for (const [gx, gz] of [[r.x0 + 0.4, cz], [r.x1 - 0.4, cz]]) {
      const g = new THREE.PointLight(0x4a7aff, 3.0, 9, 2);
      g.position.set(gx, BY + 2.1, gz);
      root.add(g);
    }

    /* THE PCs ARE THE APARTMENT'S PC.
     *
     * `makeDesk` in src/world/props.js is the desk Tony's own machine stands
     * on -- monitor, second monitor, RGB keyboard, mouse, headset stand, boom
     * mic and a glass-sided tower with three lit fans. It builds around the
     * (x,z) it is handed, so building it at the origin and then moving the
     * GROUP is what lets a row of them face a wall. Six of them, not six boxes
     * with screens painted on. */
    const stations = [];
    const chairBacks = [];
    function station(px, pz, yaw, seat) {
      const desk = makeDesk(M, { x: 0, z: 0, w: 2.3 });
      desk.group.position.set(px, BY, pz);
      desk.group.rotation.y = yaw;
      root.add(desk.group);
      const cos = Math.abs(Math.cos(yaw));
      const sin = Math.abs(Math.sin(yaw));
      solid(
        px - (cos * 2.3 + sin * 0.7) / 2, px + (cos * 2.3 + sin * 0.7) / 2,
        BY, BY + desk.top,
        pz - (sin * 2.3 + cos * 0.7) / 2, pz + (sin * 2.3 + cos * 0.7) / 2,
      );
      // Screens on, because a LAN room with six dead monitors is a store room.
      const lit = new THREE.MeshBasicMaterial({
        map: printed(`mansion.lan.screen.${seat}`, ['SQUATCH SMASH', 'READY'], {
          w: 512, h: 288, bg: '#0b1018', fg: '#7fd0ff', font: '900 46px "Trebuchet MS", sans-serif', lineHeight: 70,
        }),
        toneMapped: false,
      });
      desk.screen.material = lit;
      desk.sideScreen.material = desk.sideOn;
      for (const m of desk.rgb) m.material.emissiveIntensity = 2.4;
      for (const m of desk.keyLeds) m.emissiveIntensity = 1.6;
      desk.powerLed.material = mat({ color: 0x0a2a10, emissive: 0x2aff6a, emissiveIntensity: 2, roughness: 0.4 });

      /* The chair sits on the desk's own +z side, which after a yaw of `yaw`
       * is world (sin yaw, cos yaw) -- and faces back at it, hence yaw + PI.
       * Derived rather than typed per row, so a row cannot end up with its
       * chairs behind the monitors. */
      const chair = makeChair(M, { x: 0, z: 0, rotY: yaw + Math.PI });
      const chairX = px + Math.sin(yaw) * 1.05;
      const chairZ = pz + Math.cos(yaw) * 1.05;
      chair.group.position.set(chairX, BY, chairZ);
      root.add(chair.group);
      solid(chairX - 0.34, chairX + 0.34, BY, BY + 0.55, chairZ - 0.34, chairZ + 0.34);
      /* Owner brief: "for the gamer chairs add the squatch logo to the chairs
       * in this gamer room". On the back of the shell, where a team chair
       * carries one, drawn now and swapped for the real logo file by
       * `dressArtSlots` below. */
      const backLogo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        mat({
          map: squatchArt(`mansion-chair-${seat}`, {
            title: [], footer: null, ink: '#c8a24a', bg: '#16121a', rule: false, w: 256, h: 256,
          }),
          roughness: 0.75,
          unique: true,
        }),
      );
      backLogo.position.set(0, 0.86, -0.27);
      backLogo.rotation.set(0.10, Math.PI, 0);
      chair.group.add(backLogo);
      chairBacks.push(backLogo);
      stations.push({ desk, chair, seat });
    }
    /* Five stations, not six: three against the north wall and two against
     * the south, with the gap between the south pair lined up on the door.
     * Three and three fits the room exactly and leaves 1.8 m of wall for a
     * 2 m doorway, which is how you get a desk in a doorway. Five is also
     * the roster, which is the number this room is for. */
    const seatNames = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
    for (let i = 0; i < 3; i++) station(3.5 + i * 3.05, r.z1 - 1.1, Math.PI, seatNames[i]);
    station(3.5, r.z0 + 1.1, 0, seatNames[3]);
    station(9.6, r.z0 + 1.1, 0, seatNames[4]);

    // A server rack in the corner, blinking.
    root.add(box({
      size: [0.75, 2.0, 0.85], pos: [r.x1 - 0.6, BY + 1.0, cz], mat: M_RACK, name: 'lan-rack',
    }));
    for (let i = 0; i < 9; i++) {
      root.add(box({
        size: [0.62, 0.14, 0.03], pos: [r.x1 - 0.6, BY + 0.35 + i * 0.18, cz - 0.44], mat: M_RACK_BACK, cast: false,
      }));
      root.add(box({
        size: [0.05, 0.04, 0.02],
        pos: [r.x1 - 0.85, BY + 0.35 + i * 0.18, cz - 0.44],
        mat: mat({
          color: 0x0a2a10, emissive: i % 3 === 0 ? 0x2aff6a : 0x2a8aff, emissiveIntensity: 2.2, roughness: 0.4,
        }),
        cast: false,
      }));
    }
    solid(r.x1 - 1.0, r.x1 - 0.2, BY, BY + 2.0, cz - 0.5, cz + 0.5);

    // Jerseys on a rail, a mini fridge, and a snack table between the rows.
    for (let i = 0; i < 5; i++) {
      const jz = cz - 1.4 + i * 0.7;
      root.add(box({
        size: [0.06, 0.7, 0.5], pos: [r.x0 + 0.34, BY + 1.45, jz], mat: M_JERSEY,
      }));
      root.add(box({
        size: [0.05, 0.1, 0.34], pos: [r.x0 + 0.34, BY + 1.84, jz], mat: M_CHROME, cast: false,
      }));
    }
    root.add(cylinder({
      r: 0.018, h: 3.6, pos: [r.x0 + 0.34, BY + 1.9, cz], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    root.add(box({
      size: [0.6, 0.85, 0.6], pos: [5.0, BY + 0.43, r.z0 + 0.4], mat: M_STEEL, name: 'lan-fridge',
    }));
    root.add(box({
      size: [0.04, 0.7, 0.5], pos: [5.29, BY + 0.45, r.z0 + 0.4], mat: M_CHROME, cast: false,
    }));
    solid(4.7, 5.3, BY, BY + 0.85, r.z0 + 0.1, r.z0 + 0.7);
    /* The snack table stands at the WEST end of the aisle, not the middle of
     * it: the middle of the aisle is the line from the door to the far wall,
     * and that line stays clear in every room down here. */
    const tableX = 4.0;
    root.add(box({ size: [2.2, 0.07, 0.7], pos: [tableX, BY + 0.76, cz], mat: M_DESKTOP, name: 'lan-snack-table' }));
    for (const [lx, lz] of [[-1.0, -0.28], [1.0, -0.28], [-1.0, 0.28], [1.0, 0.28]]) {
      root.add(box({ size: [0.06, 0.76, 0.06], pos: [tableX + lx, BY + 0.38, cz + lz], mat: M_RACK }));
    }
    solid(tableX - 1.2, tableX + 1.2, BY, BY + 0.8, cz - 0.4, cz + 0.4);
    for (const [bx, bz, crushed] of [[-0.8, -0.15, false], [-0.3, 0.16, true], [0.35, -0.1, false], [0.85, 0.18, true]]) {
      const can = makeBeerCan(M, {
        x: tableX + bx, y: BY + 0.8, z: cz + bz, crushed, rotY: bx,
      });
      root.add(can.group);
    }
    const pizza = makePizzaBox(M, {
      x: tableX + 0.1, y: BY + 0.8, z: cz - 0.02, rotY: 0.3,
    });
    root.add(pizza.group);

    // The bracket board and the house banner, on the wall behind the rack.
    /* x=9.4 and x=3.6, not cx+/-1.2: this wall has the room's door in it at
     * x:5.4..7.4, and a banner hung 11 cm in FRONT of a doorway still hangs
     * over the doorway even though it never intersects the reveal. The sweep
     * in tools/verify-mansion.mjs now grows every opening out of its own wall
     * before intersecting, which is what caught this. */
    const lanBanner = flatArt('mansion.lan.banner', {
      x: 9.4,
      y: BY + 1.85,
      z: r.z0 + 0.14,
      rotY: 0,
      w: 1.6,
      h: 1.1,
      material: mat({
        map: squatchArt('mansion-lan-banner', {
          title: ['SILVER', 'SASQUATCHES'], footer: 'SIX MAN ROSTER', ink: '#c8a24a', bg: '#101625',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });
    wallArt('lan-bracket', 3.6, BY + 1.85, r.z0 + 0.16, 0, 1.3, 0.9,
      printed('mansion.lan.bracket', [
        'HOUSE LADDER', 'BOOSKI  bye', 'SHUBES  d. LAG', 'LOU  d. EVERYONE',
      ], {
        w: 520, h: 380, bg: '#0e131c', fg: '#9fd0ff', font: '700 34px ui-monospace, monospace', lineHeight: 78, align: 'left',
      }));

    // Cable tray overhead and a strip of cold light down the middle.
    root.add(box({
      size: [r.x1 - r.x0 - 1.0, 0.1, 0.3], pos: [cx, -0.44, cz], mat: M_RACK, cast: false,
    }));
    const lights = [
      ceilingLight(cx - 2.4, cz, -0.4, 0xbfd8ff, 6.8, 15),
      ceilingLight(cx + 2.4, cz, -0.4, 0xbfd8ff, 6.8, 15),
    ];
    const rgbGlow = new THREE.PointLight(0x4a7aff, 5.0, 10, 2);
    rgbGlow.position.set(cx, BY + 1.1, cz);
    root.add(rgbGlow);
    lights.push(rgbGlow);
    return {
      stations, chairBacks, banner: lanBanner, lights,
    };
  }
  const lanProps = buildLanRoom();

  /* ---- The vault. ---------------------------------------------------- */
  function buildVault() {
    const r = VAULT;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    topping(r.x0, r.x1, BY + 0.012, r.z0, r.z1, M_PLATE_STEEL, 'vault-floor');
    // Riveted steel lining on every face, including the ceiling.
    lineRoom(r, 2.5, M_PLATE_STEEL, [12.4, 14.3], 0.06);
    root.add(box({
      size: [r.x1 - r.x0, 0.06, r.z1 - r.z0], pos: [cx, -0.28, cz], mat: M_PLATE_STEEL, cast: false,
    }));
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 7; j++) {
        root.add(sphere({
          r: 0.035,
          pos: [r.x0 + 0.09, BY + 0.35 + i * 0.5, r.z0 + 0.6 + j * 0.9],
          mat: M_CHROME,
          cast: false,
        }));
        root.add(sphere({
          r: 0.035,
          pos: [r.x1 - 0.09, BY + 0.35 + i * 0.5, r.z0 + 0.6 + j * 0.9],
          mat: M_CHROME,
          cast: false,
        }));
      }
    }

    /* THE DOOR. Standing open, hinged on the east jamb and swung ninety
     * degrees into the corridor, which is where a vault door this size can go
     * without fouling the room it guards. It is modelled open and stays open:
     * this pass adds no mechanism, and a door that could shut is a door that
     * can trap somebody in a steel box under a ballroom. */
    const doorZ = (CELLAR_HALL.z1 + VAULT.z0) / 2;
    const hingeX = 14.3;
    const leaf = new THREE.Group();
    leaf.add(cylinder({
      r: 1.12, h: 0.42, pos: [0, 0, 0], mat: M_VAULT_STEEL, rotX: Math.PI / 2, name: 'vault-door',
    }));
    leaf.add(cylinder({
      r: 0.95, h: 0.46, pos: [0, 0, 0], mat: M_STEEL, rotX: Math.PI / 2, cast: false,
    }));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      leaf.add(cylinder({
        r: 0.09, h: 0.5, pos: [Math.cos(a) * 1.02, Math.sin(a) * 1.02, -0.28], mat: M_CHROME, rotZ: Math.PI / 2, rotX: Math.PI / 2,
      }));
    }
    // Spoked wheel and a combination dial on the outside face.
    leaf.add(cylinder({ r: 0.16, h: 0.16, pos: [0, 0, 0.28], mat: M_CHROME, rotX: Math.PI / 2 }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      leaf.add(box({
        size: [0.09, 0.62, 0.09], pos: [Math.cos(a) * 0.31, Math.sin(a) * 0.31, 0.28], mat: M_CHROME, rotZ: -a,
      }));
    }
    leaf.add(cylinder({ r: 0.62, h: 0.06, pos: [0, 0, 0.3], mat: M_GOLD, cast: false }));
    leaf.add(cylinder({ r: 0.22, h: 0.1, pos: [0, -0.62, 0.3], mat: M_BRONZE, cast: false }));
    /* Swung about the hinge line (x = hingeX, z = doorZ), so the leaf's centre
     * ends up one radius SOUTH of the jamb rather than one radius west of it.
     * Getting that rotation the wrong way round leaves a two-metre steel disc
     * standing across the middle of its own doorway. */
    leaf.position.set(hingeX, BY + 1.28, doorZ - 1.12);
    leaf.rotation.y = Math.PI / 2;
    root.add(leaf);
    solid(hingeX - 0.26, hingeX + 0.26, BY, BY + 2.4, doorZ - 2.28, doorZ);
    // Hinge stack on the jamb, and the frame's own bolt sockets.
    for (const hy of [BY + 0.5, BY + 1.28, BY + 2.06]) {
      root.add(cylinder({ r: 0.13, h: 0.34, pos: [hingeX, hy, doorZ], mat: M_CHROME }));
    }
    root.add(box({
      size: [1.9, 0.08, 0.5], pos: [13.35, BY + 0.03, doorZ], mat: M_CHROME, name: 'vault-threshold', cast: false,
    }));

    /* ---- "a bunch of treasure and shit." ---- */
    // Gold, on pallets, stacked in courses like it is stock rather than loot.
    function goldStack(gx, gz, rows) {
      root.add(box({ size: [1.1, 0.12, 0.9], pos: [gx, BY + 0.06, gz], mat: M_WOOD_DK, cast: false }));
      for (let ry = 0; ry < rows; ry++) {
        const perRow = 4 - (ry % 2);
        for (let i = 0; i < perRow; i++) {
          for (let j = 0; j < 3; j++) {
            root.add(box({
              size: [0.24, 0.1, 0.12],
              pos: [
                gx - 0.42 + i * 0.26 + (ry % 2) * 0.13,
                BY + 0.17 + ry * 0.1,
                gz - 0.28 + j * 0.28,
              ],
              mat: M_GOLD_BAR,
              cast: false,
            }));
          }
        }
      }
      solid(gx - 0.6, gx + 0.6, BY, BY + 0.2 + rows * 0.1, gz - 0.5, gz + 0.5);
    }
    goldStack(r.x0 + 1.0, r.z1 - 1.1, 7);
    goldStack(r.x1 - 1.0, r.z1 - 1.1, 5);
    goldStack(cx, r.z1 - 0.7, 4);

    // Cash, banded, on open shelving down the west wall.
    for (let s = 0; s < 3; s++) {
      const sy = BY + 0.55 + s * 0.62;
      root.add(box({
        size: [0.6, 0.05, 3.0], pos: [r.x0 + 0.45, sy, cz + 0.2], mat: M_RACK,
      }));
      for (let i = 0; i < 7; i++) {
        root.add(box({
          size: [0.42, 0.24, 0.3],
          pos: [r.x0 + 0.45, sy + 0.15, cz - 1.1 + i * 0.42],
          mat: M_CASH,
          cast: false,
        }));
        root.add(box({
          size: [0.44, 0.06, 0.09],
          pos: [r.x0 + 0.45, sy + 0.15, cz - 1.1 + i * 0.42],
          mat: mat({ color: 0xc8b03a, roughness: 0.7 }),
          cast: false,
        }));
      }
    }
    root.add(box({
      size: [0.06, 2.0, 3.2], pos: [r.x0 + 0.13, BY + 1.1, cz + 0.2], mat: M_RACK_BACK, cast: false,
    }));
    solid(r.x0 + 0.06, r.x0 + 0.78, BY, BY + 2.0, cz - 1.4, cz + 1.8);

    // The watch and jewellery case, lit from inside.
    makeDisplayCase(r.x1 - 0.5, BY, cz - 0.4, -Math.PI / 2, 2.0, 1.5, 0.5, (g, w, h, d) => {
      g.add(box({ size: [w - 0.2, 0.05, d - 0.15], pos: [0, h * 0.55, 0], mat: M_LEATHER_DK, cast: false }));
      for (let i = 0; i < 7; i++) {
        g.add(cylinder({
          r: 0.055, h: 0.02, pos: [-w / 2 + 0.25 + i * 0.25, h * 0.6, 0], mat: M_GOLD, cast: false,
        }));
        g.add(box({
          size: [0.05, 0.02, 0.16], pos: [-w / 2 + 0.25 + i * 0.25, h * 0.6, 0], mat: M_LEATHER_DK, cast: false,
        }));
      }
      for (let i = 0; i < 5; i++) {
        g.add(sphere({
          r: 0.045,
          pos: [-w / 2 + 0.35 + i * 0.32, h * 0.28, 0],
          mat: mat({ color: 0xdff0ff, roughness: 0.05, metalness: 0.2 }),
          cast: false,
        }));
      }
      g.add(box({ size: [w - 0.2, 0.05, d - 0.15], pos: [0, h * 0.22, 0], mat: M_LEATHER_DK, cast: false }));
    });
    const caseGlow = new THREE.PointLight(0xfff2d0, 3.6, 5, 2);
    caseGlow.position.set(r.x1 - 0.9, BY + 1.1, cz - 0.4);
    root.add(caseGlow);

    /* Stencilled crates and a strongbox of coin, both hard against the side
     * walls: the run from the vault door to the gold is kept clear, the same
     * rule the rest of the lower level is laid out to. */
    for (const [bx, bz] of [[r.x0 + 0.7, r.z0 + 0.8], [r.x1 - 0.7, r.z0 + 0.8]]) {
      root.add(box({ size: [0.85, 0.65, 0.7], pos: [bx, BY + 0.33, bz], mat: M_CRATE }));
      root.add(box({
        size: [0.5, 0.16, 0.02], pos: [bx, BY + 0.4, bz + 0.36], mat: M_CARD, cast: false,
      }));
      solid(bx - 0.45, bx + 0.45, BY, BY + 0.66, bz - 0.36, bz + 0.36);
    }
    root.add(box({ size: [0.7, 0.42, 0.55], pos: [r.x0 + 0.7, BY + 0.86, r.z0 + 0.8], mat: M_STEEL }));
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 * 3;
      const rr = 0.05 + (i % 5) * 0.05;
      root.add(cylinder({
        r: 0.05,
        h: 0.012,
        pos: [r.x0 + 0.7 + Math.cos(a) * rr, BY + 1.08 + (i % 4) * 0.012, r.z0 + 0.8 + Math.sin(a) * rr],
        mat: M_GOLD,
        cast: false,
      }));
    }
    const vaultMark = flatArt('mansion.vault.mark', {
      x: r.x0 + 0.6,
      y: BY + 1.9,
      z: r.z0 + 0.18,
      rotY: 0,
      w: 0.8,
      h: 1.0,
      material: mat({
        map: squatchArt('mansion-vault-mark', {
          title: ['THE HOUSE'], footer: 'COUNT IT TWICE', ink: '#d8b23a', bg: '#0e0e12',
        }),
        roughness: 0.9,
        unique: true,
      }),
    });

    const vaultLight = ceilingLight(cx, cz, -0.42, 0xfff0d0, 5.6, 12);
    const goldGlow = new THREE.PointLight(0xffc850, 8.0, 10, 2);
    goldGlow.position.set(cx, BY + 0.8, r.z1 - 1.4);
    root.add(goldGlow);
    return {
      mark: vaultMark, door: leaf, lights: [vaultLight, goldGlow, caseGlow],
    };
  }
  const vaultProps = buildVault();

  /* ================================================================== */
  /* Anchors                                                              */
  /* ================================================================== */
  const anchors = {
    // Ground floor
    foyerCenter: new THREE.Vector3(0, GY, 44.4),
    foyerRear: new THREE.Vector3(0, GY, 52),
    horseshoeWestFoot: new THREE.Vector3((STAIR_WEST.x0 + STAIR_WEST.x1) / 2, GY, STAIR_WEST.z0 + 0.4),
    horseshoeEastFoot: new THREE.Vector3((STAIR_EAST.x0 + STAIR_EAST.x1) / 2, GY, STAIR_EAST.z0 + 0.4),
    horseshoeWestTop: new THREE.Vector3((STAIR_WEST.x0 + STAIR_WEST.x1) / 2, UY, Z_GALLERY_S + 0.6),
    horseshoeEastTop: new THREE.Vector3((STAIR_EAST.x0 + STAIR_EAST.x1) / 2, UY, Z_GALLERY_S + 0.6),
    balconyRail: new THREE.Vector3(0, UY, BALCONY.z0 + 0.6),
    livingRoomCenter: new THREE.Vector3(-12.5, GY, 45.5),
    loungeCenter: new THREE.Vector3(12.5, GY, 45.5),
    ballroomCenter: new THREE.Vector3(0, GY, 66),
    diningTable: new THREE.Vector3(-12.5, GY, 66),
    kitchenIsland: new THREE.Vector3(12.0, GY, 63.5),
    // The west wing
    trophyHallCenter: new THREE.Vector3(
      (TROPHY_HALL.x0 + TROPHY_HALL.x1) / 2, GY, 48.6,
    ),
    greatIncluder: new THREE.Vector3((TROPHY_HALL.x0 + TROPHY_HALL.x1) / 2, GY, 51.0),
    winterGardenCenter: new THREE.Vector3(
      (WINTER_GARDEN.x0 + WINTER_GARDEN.x1) / 2, GY, (WINTER_GARDEN.z0 + WINTER_GARDEN.z1) / 2,
    ),
    // Basement
    basementStairTop: new THREE.Vector3(7.2, GY, BASEMENT_STAIR.z0 - 1.2),
    basementLanding: new THREE.Vector3(7.2, BY, BASEMENT_STAIR.z1 - 0.6),
    armoryCenter: new THREE.Vector3(-2, BY, 55.5),
    // The lower level
    cellarDoor: new THREE.Vector3((CELLAR_DOOR.x0 + CELLAR_DOOR.x1) / 2, BY, 63.0),
    cellarHallCenter: new THREE.Vector3(0, BY, (CELLAR_HALL.z0 + CELLAR_HALL.z1) / 2),
    cellarHallWestEnd: new THREE.Vector3(-14.4, BY, (CELLAR_HALL.z0 + CELLAR_HALL.z1) / 2),
    guestRoomCenter: new THREE.Vector3(
      (GUEST_ROOM.x0 + GUEST_ROOM.x1) / 2, BY, GUEST_ROOM.z0 + 2.2,
    ),
    theatreCenter: new THREE.Vector3((THEATRE.x0 + THEATRE.x1) / 2, BY, 72.6),
    lanRoomCenter: new THREE.Vector3((LAN_ROOM.x0 + LAN_ROOM.x1) / 2, BY, 71.15),
    vaultCenter: new THREE.Vector3((VAULT.x0 + VAULT.x1) / 2, BY, 70.4),
    // Upper floor
    galleryCenter: new THREE.Vector3(0, UY, 50.5),
    galleryWest: new THREE.Vector3(-13, UY, 50.5),
    galleryEast: new THREE.Vector3(13, UY, 50.5),
    conferenceTable: new THREE.Vector3(0, UY, 58),
    conferenceHead: new THREE.Vector3(0, UY, 61.4),
    officeDesk: new THREE.Vector3(0, UY, 70.2),
    bedWestFront: new THREE.Vector3(-12.5, UY, 44.5),
    bedEastFront: new THREE.Vector3(12.5, UY, 44.5),
    bedWestRear: new THREE.Vector3(-12.5, UY, 59.5),
    bedEastRear: new THREE.Vector3(12.5, UY, 59.5),
    bathWest: new THREE.Vector3(-12.5, UY, 70.5),
    bathEast: new THREE.Vector3(12.5, UY, 70.5),
    chandelier: new THREE.Vector3(CHANDELIER_POS.x, CHANDELIER_POS.y, CHANDELIER_POS.z),
    /* The third floor. `secretBookcase` is the spot in the office you stand
     * on to press it, `suiteStairFoot` the lobby behind it, `suiteStairHead`
     * where the top flight puts you down, and the rest are the room. */
    secretBookcase: new THREE.Vector3(SUITE_STAIR_HALL.x0 - 1.5, UY, 65.0),
    suiteStairFoot: new THREE.Vector3(
      secretStair.geometry.lobby.x, UY, secretStair.geometry.lobby.z,
    ),
    suiteStairHead: new THREE.Vector3(
      secretStair.geometry.arrival.x, SUITE_Y, secretStair.geometry.arrival.z,
    ),
    masterSuiteCenter: new THREE.Vector3(-1.2, SUITE_Y, 69.6),
    masterSuiteBed: new THREE.Vector3(
      suiteProps.bedCentre.x, SUITE_Y, suiteProps.bedCentre.z,
    ),
    masterSuiteTub: new THREE.Vector3(suiteProps.tub.x, SUITE_Y, suiteProps.tub.z),
    masterSuiteBar: new THREE.Vector3(MASTER_SUITE.x0 + 2.6, SUITE_Y, 71.0),
  };

  /** Every enterable room, with the anchor a verifier should stand on. */
  const rooms = {
    foyer: { rect: FOYER, floor: GY, anchor: anchors.foyerCenter },
    livingRoom: { rect: LIVING, floor: GY, anchor: anchors.livingRoomCenter },
    lounge: { rect: LOUNGE, floor: GY, anchor: anchors.loungeCenter },
    ballroom: { rect: BALLROOM, floor: GY, anchor: anchors.ballroomCenter },
    dining: { rect: DINING, floor: GY, anchor: anchors.diningTable },
    kitchen: { rect: KITCHEN, floor: GY, anchor: anchors.kitchenIsland },
    basement: { rect: BASEMENT_ROOM, floor: BY, anchor: anchors.armoryCenter },
    gallery: { rect: GALLERY, floor: UY, anchor: anchors.galleryCenter },
    conference: { rect: CONFERENCE, floor: UY, anchor: anchors.conferenceTable },
    office: { rect: OFFICE, floor: UY, anchor: anchors.officeDesk },
    bedWestFront: { rect: BED_WEST_FRONT, floor: UY, anchor: anchors.bedWestFront },
    bedEastFront: { rect: BED_EAST_FRONT, floor: UY, anchor: anchors.bedEastFront },
    bedWestRear: { rect: BED_WEST_REAR, floor: UY, anchor: anchors.bedWestRear },
    bedEastRear: { rect: BED_EAST_REAR, floor: UY, anchor: anchors.bedEastRear },
    bathWest: { rect: BATH_WEST, floor: UY, anchor: anchors.bathWest },
    bathEast: { rect: BATH_EAST, floor: UY, anchor: anchors.bathEast },
    // The west wing.
    trophyHall: { rect: TROPHY_HALL, floor: GY, anchor: anchors.trophyHallCenter },
    winterGarden: { rect: WINTER_GARDEN, floor: GY, anchor: anchors.winterGardenCenter },
    // The lower level.
    cellarHall: { rect: CELLAR_HALL, floor: BY, anchor: anchors.cellarHallCenter },
    guestRoom: { rect: GUEST_ROOM, floor: BY, anchor: anchors.guestRoomCenter },
    theatre: { rect: THEATRE, floor: BY, anchor: anchors.theatreCenter },
    lanRoom: { rect: LAN_ROOM, floor: BY, anchor: anchors.lanRoomCenter },
    vault: { rect: VAULT, floor: BY, anchor: anchors.vaultCenter },
    // The third floor.
    masterSuite: { rect: MASTER_SUITE, floor: SUITE_Y, anchor: anchors.masterSuiteCenter },
  };

  const props = {
    masterSuite: { ...suiteProps, secretStair },
    foyer: foyerProps,
    basementStair: basementStairProps,
    livingRoom: livingProps,
    lounge: loungeProps,
    ballroom: ballroomProps,
    dining: diningProps,
    kitchen: kitchenProps,
    gallery: galleryProps,
    conference: conferenceProps,
    office: officeProps,
    bedrooms,
    bathrooms: bathProps,
    basement: basementProps,
    trophyHall: trophyProps,
    winterGarden: winterProps,
    cellarHall: cellarHallProps,
    guestRoom: guestProps,
    theatre: theatreProps,
    lanRoom: lanProps,
    vault: vaultProps,
  };

  /* ================================================================== */
  /* floorAt(x, z, y)                                                    */
  /*                                                                      */
  /* Reads the three slabs MansionGrounds.js actually poured, rather than */
  /* a hand-maintained list of rooms that can drift out of step with the  */
  /* walls:                                                               */
  /*   - the podium is the whole footprint MINUS the basement stairwell;  */
  /*   - the upper slab is the whole footprint MINUS the foyer void;      */
  /*   - the basement floor is BASEMENT_ROOM.                             */
  /* plus the three stairs, each of which is the ONLY candidate inside a  */
  /* rect where its own slab has a hole (the basement one) or is simply   */
  /* higher ground (the horseshoe, which sits over the foyer floor and is */
  /* offered alongside it, so you can walk under the flights).            */
  /*                                                                      */
  /* Resolution is "the highest candidate no more than one step above     */
  /* your feet", which is what lets you climb; the whole basement bug was  */
  /* that the flat floor was offered inside the descending stairwell too,  */
  /* where it beat every tread on the way down.                           */
  /* ================================================================== */
  const STEP_TOLERANCE = 0.85;
  function floorAt(x, z, y) {
    const cands = [];
    const inShaft = inRect(BASEMENT_STAIR, x, z);
    const inBuilding = inRect(BUILDING, x, z);

    if (inRect(BASEMENT_ROOM, x, z)) cands.push(BY);
    /* The lower level, offered over its whole FOOTPRINT rather than room by
     * room. A rect per room leaves every wall band and every threshold with
     * no candidate at all, and floorAt's "nothing here" answer is the podium
     * four metres overhead -- so a doorway would fire you up into the
     * ballroom. The rooms' own rects are for the verifier; this is for feet. */
    if (inRect(BASEMENT_WING, x, z)) cands.push(BY);
    // ...and the theatre's rear riser, which is stepped up off that floor.
    if (inRect(THEATRE_TIER, x, z)) cands.push(BY + THEATRE_TIER.y);
    if (inShaft) {
      const t = THREE.MathUtils.clamp(
        (z - BASEMENT_STAIR.z0) / (BASEMENT_STAIR.z1 - BASEMENT_STAIR.z0), 0, 1,
      );
      cands.push(THREE.MathUtils.lerp(GY, BY, t));
    } else if (inBuilding || inRect(LOUNGE_BAY, x, z) || inRect(WEST_WING, x, z)) {
      /* The podium: solid everywhere except the shaft. The billiard bay and
       * the west wing are both outside BUILDING (they are bump-outs off the
       * lounge's and the living room's own walls) and each stands on a podium
       * of its own, so both have to be offered here as well -- without this
       * their floors resolve to street grade and you drop 1.2 m walking
       * through the archway. */
      cands.push(GY);
    }

    if (inBuilding && !inRect(FOYER_VOID, x, z)) cands.push(UY); // the upper slab
    if (inRect(BALCONY, x, z)) cands.push(UY);
    for (const flight of [STAIR_WEST, STAIR_EAST]) {
      if (inRect(flight, x, z)) {
        const t = THREE.MathUtils.clamp((z - flight.z0) / (flight.z1 - flight.z0), 0, 1);
        cands.push(THREE.MathUtils.lerp(GY, UY, t));
      }
    }

    /* ---- The third floor.
     *
     * The suite's own slab is offered over its whole plan MINUS the stair
     * well, for the same reason the podium is offered minus the basement
     * shaft: a floor offered inside a stairwell beats every tread in it and
     * stands the player on nothing over a 4.6 m drop. That is the exact bug
     * this file already carries a comment about, one storey down.
     *
     * The two flights are offered alongside the upper slab rather than
     * instead of it, the way the horseshoe is, so you can walk UNDER the top
     * flight in the hall below without being lifted onto it.
     *
     * Each flight is a straight lerp between the heights its own treads
     * actually reach, and `buildSecretStair` hands `rakingRail` the same two
     * functions for the handrails — one arithmetic, two consumers. */
    if (inRect(MASTER_SUITE, x, z) && !inRect(SUITE_STAIR_WELL, x, z)) cands.push(SUITE_Y);
    if (inRect(SUITE_FLIGHT_A, x, z)) {
      const t = THREE.MathUtils.clamp(
        (z - SUITE_FLIGHT_A.z0) / (SUITE_FLIGHT_A.z1 - SUITE_FLIGHT_A.z0), 0, 1,
      );
      cands.push(THREE.MathUtils.lerp(UY, SUITE_STAIR_LANDING_Y, t));
    }
    if (inRect(SUITE_HALF_LANDING, x, z)) cands.push(SUITE_STAIR_LANDING_Y);
    if (inRect(SUITE_FLIGHT_B, x, z)) {
      const t = THREE.MathUtils.clamp(
        (SUITE_FLIGHT_B.z1 - z) / (SUITE_FLIGHT_B.z1 - SUITE_FLIGHT_B.z0), 0, 1,
      );
      cands.push(THREE.MathUtils.lerp(SUITE_STAIR_LANDING_Y, SUITE_Y, t));
    }

    if (!cands.length) return null;
    let best = -Infinity;
    for (const c of cands) if (c <= y + STEP_TOLERANCE && c > best) best = c;
    if (best === -Infinity) best = Math.min(...cands);
    return best;
  }

  /* ================================================================== */
  /* Per-frame update: the bare basement bulb flickers gently.           */
  /* ================================================================== */
  let time = 0;
  function update(dt, playerPos = null) {
    time += dt;
    const flick = 0.85 + 0.15 * Math.sin(time * 11) * (Math.sin(time * 2.3) > -0.6 ? 1 : 0.2);
    basementProps.bulbLight.intensity = 3.4 * flick;
    kitchenProps.updateSink(dt);
    /* The third floor: the tub's water clock, its jets and its steam, and the
     * bookcase's swing. Both are cheap and both are unconditional -- a hot tub
     * that only bubbles when somebody is looking at it is a hot tub that is
     * still when you walk in on it. */
    suiteProps.update(dt);
    secretStair.update(dt);
    /* The office's own Lou used to be ticked here so he breathed and looked
     * up when somebody came in. He is gone — he was the second of two — and
     * the one in `../cast.js` gets his own update from there. See the note in
     * `buildOffice()`. */
  }

  /* ================================================================== */
  /* Local lights, collected for the composition root's light rig.        */
  /*                                                                      */
  /* A fully-furnished three-storey house wants a practical fixture in    */
  /* every room, and three.js puts EVERY visible light into EVERY         */
  /* material's shader -- so ~90 point lights is not "a bit slow", it is  */
  /* a shader the software rasteriser never finishes compiling (measured: */
  /* the scene booted fine and then never rendered a second frame). The   */
  /* fixtures all stay; main.js keeps a fixed-size set of the nearest ones */
  /* switched on, which is invisible in play because every one of these   */
  /* carries a `distance` of 4-26 m and contributes nothing past it.      */
  /* ================================================================== */
  const lights = [];
  root.traverse((o) => { if (o.isPointLight) lights.push(o); });

  /* ================================================================== */
  /* Dress the Squatch-logo slots with the apartment's real artwork.      */
  /*                                                                       */
  /* Same contract as src/bing/club.js's `dressArtSlots`: only a slot       */
  /* whose file actually resolved is swapped, so a missing image leaves     */
  /* the procedurally drawn crest in place and nothing is ever blank. The   */
  /* geometry is rebuilt to the file's own aspect ratio, because a square   */
  /* logo stretched across a plate drawn for two lines of lettering is a    */
  /* stretched logo. Kept off the critical path: the scene is finished and  */
  /* walkable before this promise resolves.                                 */
  /* ================================================================== */
  const artTargets = [
    { slot: 'mansion.foyer.crest', mesh: foyerProps.crest, w: 1.05 },
    { slot: 'mansion.lounge.banner', mesh: loungeProps.banner, w: 0.8 },
    { slot: 'mansion.bay.shield', mesh: loungeProps.bayShield, w: 1.05 },
    { slot: 'mansion.conference.crest', mesh: conferenceProps.crest?.art, w: 1.3 },
    { slot: 'mansion.gallery.pride', mesh: galleryProps.pride, w: 1.5 },
    { slot: 'mansion.ballroom.backdrop', mesh: ballroomProps.backdrop, w: 2.4 },
    { slot: 'mansion.office.shield', mesh: officeProps.shield, w: 1.45 },
    { slot: 'mansion.office.hogmama', mesh: officeProps.hogMama?.art, w: 0.9 },
    { slot: 'mansion.basement.shield', mesh: basementProps.shield, w: 1.15 },
    { slot: 'mansion.trophy.crest', mesh: trophyProps.crest, w: 1.5 },
    { slot: 'mansion.winter.shield', mesh: winterProps.shield, w: 1.2 },
    { slot: 'mansion.cellar.crest', mesh: cellarHallProps.crest, w: 0.95 },
    { slot: 'mansion.theatre.banner', mesh: theatreProps.banner, w: 1.0 },
    { slot: 'mansion.lan.banner', mesh: lanProps.banner, w: 1.6 },
    { slot: 'mansion.guest.art', mesh: guestProps.art, w: 1.1 },
    { slot: 'mansion.vault.mark', mesh: vaultProps.mark, w: 0.8 },
    { slot: 'mansion.suite.crest', mesh: suiteProps.crest, w: 1.3 },
    /* One slot, every gamer chair in the LAN room. The owner asked for the
     * logo on the chairs, plural, and five chairs pointed at five slots would
     * be five manifest entries for one image. */
    { slot: 'mansion.lan.chairs', meshes: lanProps.chairBacks, w: 0.34 },
  ];
  const artReady = resolveGear(MANSION_ART_SLOTS).then((gear) => {
    const dressed = [];
    for (const target of artTargets) {
      const supplied = gear.get(target.slot);
      const meshes = target.meshes ?? (target.mesh ? [target.mesh] : []);
      if (!supplied?.real || !meshes.length) continue;
      const h = target.w / (supplied.aspect || 1);
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.PlaneGeometry(target.w, h);
        mesh.material = new THREE.MeshStandardMaterial({ map: supplied.texture, roughness: 0.65 });
        mesh.userData.art = { slot: target.slot, real: true, file: supplied.file };
      }
      dressed.push(target.slot);
    }
    return dressed;
  }).catch(() => []);

  return {
    root,
    colliders,
    doors,
    props,
    anchors,
    rooms,
    lights,
    occluders,
    floorAt,
    update,
    /** Every hung picture's world box -- see the art/doorway sweep above. */
    art: artPieces,
    artSlots: MANSION_ART_SLOTS,
    artReady,
  };
}
