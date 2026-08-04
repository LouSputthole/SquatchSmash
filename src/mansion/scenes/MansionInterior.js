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
  makeToilet, makeBathSink, makeTub, makeWhiskeyBottle, makeShotGlass,
  makeAshtray, makeBooks, makeWallClock, makeDesk, makeChair, makeBeerCan,
  makePizzaBox,
} from '../../world/props.js';
import { resolveGear } from '../../world/gear.js';
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
      put(o.u0 - jamb, o.u0, o.y0, o.y1 + jamb);
      put(o.u1, o.u1 + jamb, o.y0, o.y1 + jamb);
      put(o.u0 - jamb, o.u1 + jamb, o.y1, o.y1 + jamb);
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
    root.add(box({
      size: isXRun ? [run, 0.05, 0.09] : [0.09, 0.05, run],
      pos: [cx, y0 + RAIL_H - 0.06, cz],
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
    root.add(box({
      size: [0.09, 0.05, length], pos: [xAt, midY - 0.06, midZ], mat: M_WOOD_DK, rotX: -pitch, cast: false,
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
    root.add(cylinder({
      rTop: 0.22, rBottom: 0.28, h: 0.1, pos: [x, y, z], mat: mat({ color: 0x2a2118, roughness: 0.6 }),
    }));
    root.add(sphere({ r: 0.1, pos: [x, y - 0.1, z], mat: M_BULB_WARM, cast: false }));
    const l = new THREE.PointLight(colour, intensity, distance, 2);
    l.position.set(x, y - 0.2, z);
    root.add(l);
    return l;
  }

  /** A wall sconce -- a bracket, a shade and a small warm light. */
  function sconce(x, y, z, rotY, intensity = 2.4) {
    const g = group('sconce',
      box({ size: [0.1, 0.34, 0.08], pos: [0, 0, 0], mat: M_GOLD }),
      cylinder({
        rTop: 0.16, rBottom: 0.1, h: 0.22, pos: [0, 0.2, 0.12], mat: mat({ color: 0xe8d9a8, roughness: 0.7 }),
      }),
      sphere({ r: 0.05, pos: [0, 0.16, 0.12], mat: M_BULB_WARM, cast: false }));
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    const l = new THREE.PointLight(0xffd9a0, intensity, 8, 2);
    l.position.set(x + Math.sin(rotY) * 0.2, y + 0.2, z + Math.cos(rotY) * 0.2);
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
    if (axis === 'z') {
      root.add(cylinder({
        r: 0.035, h: width + 0.4, pos: [u, y + height + 0.1, at], mat: M_GOLD, rotZ: Math.PI / 2,
      }));
      root.add(box({
        size: [width + 0.4, 0.28, 0.14], pos: [u, y + height + 0.02, at], mat: material, cast: false,
      }));
    } else {
      root.add(cylinder({
        r: 0.035, h: width + 0.4, pos: [at, y + height + 0.1, u], mat: M_GOLD, rotX: Math.PI / 2,
      }));
      root.add(box({
        size: [0.14, 0.28, width + 0.4], pos: [at, y + height + 0.02, u], mat: material, cast: false,
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
    for (const [fx0, fx1] of [[STAIR_WEST.x0, STAIR_WEST.x1], [STAIR_EAST.x0, STAIR_EAST.x1]]) {
      for (let i = 0; i < 2; i++) {
        const grow = 0.34 * (2 - i);
        const y = GY + 0.16 * i;
        const zc = STAIR_WEST.z0 - 0.5 + i * 0.28;
        root.add(box({
          size: [fx1 - fx0 + grow * 2, 0.16, 0.32],
          pos: [(fx0 + fx1) / 2, y + 0.08, zc],
          mat: M_MARBLE,
          name: 'horseshoe-curtail',
        }));
        root.add(box({
          size: [(fx1 - fx0 + grow * 2) * 0.62, 0.02, 0.32],
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
      sconce(side * (FOYER.x1 - 0.1), GY + 2.6, 39.4, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      sconce(side * (FOYER.x1 - 0.1), GY + 2.6, 44, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      sconce(side * (FOYER.x1 - 0.1), GY + 2.6, 56.6, side < 0 ? Math.PI / 2 : -Math.PI / 2);
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
    const crestMesh = flatArt('mansion.foyer.crest', {
      x: 0,
      y: UY - 0.68,
      z: BALCONY.z0 - 0.16,
      w: 1.05,
      h: 1.29,
      material: mat({ map: crest, roughness: 0.85, unique: true }),
    });
    root.add(box({
      size: [1.25, 1.49, 0.06], pos: [0, UY - 0.68, BALCONY.z0 - 0.13], mat: M_GOLD, cast: false,
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
    railing(BASEMENT_STAIR.x0 - 0.04, BASEMENT_STAIR.x0 + 0.04, z0, z1, GY, 'basement-hole-west');
    railing(BASEMENT_STAIR.x0, BASEMENT_STAIR.x1, z1 - 0.04, z1 + 0.04, GY, 'basement-hole-north');
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

    // A proper fireplace on the west wall, between the two windows.
    const fx = r.x0 + 0.05;
    root.add(box({ size: [0.5, 2.3, 2.6], pos: [fx + 0.25, GY + 1.15, 52.6], mat: M_MARBLE_DK, name: 'fireplace' }));
    root.add(box({ size: [0.72, 0.14, 3.0], pos: [fx + 0.36, GY + 1.5, 52.6], mat: M_MARBLE, name: 'mantel' }));
    root.add(box({ size: [0.34, 1.1, 1.5], pos: [fx + 0.42, GY + 0.55, 52.6], mat: M_SILHOUETTE }));
    solid(fx, fx + 0.6, GY, GY + 2.3, 51.2, 54.0);
    const fireGlow = new THREE.PointLight(0xff7a2a, 4.2, 9, 2);
    fireGlow.position.set(fx + 0.9, GY + 0.6, 52.6);
    root.add(fireGlow);
    for (let i = 0; i < 5; i++) {
      root.add(cylinder({
        r: 0.06,
        h: 0.9,
        pos: [fx + 0.45, GY + 0.2 + i * 0.06, 52.6 + (i - 2) * 0.16],
        mat: M_WOOD,
        rotX: Math.PI / 2,
        rotZ: 0.2 * (i - 2),
      }));
    }
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
    sconce(r.x1 - 0.16, GY + 3.72, 43.2, -Math.PI / 2, 2.0);

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
    const loungeRadio = makeRadioSet(barX - 0.06, GY + 1.15, barZ1 - 0.9, -Math.PI / 2 + 0.25);
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
    for (const side of [-1, 1]) {
      for (const mz of [61, 70]) {
        const mx = side * (r.x1 - 0.08);
        root.add(box({
          size: [0.06, 2.6, 1.5],
          pos: [mx, GY + 2.0, mz],
          mat: mat({
            color: 0xdce6ee, roughness: 0.08, metalness: 0.85,
          }),
          name: 'ballroom-mirror',
        }));
        root.add(box({
          size: [0.05, 2.8, 1.7], pos: [side * (r.x1 - 0.04), GY + 2.0, mz], mat: M_GOLD, cast: false,
        }));
        recordArt(`ballroom-mirror-${side}-${mz}`, mx, GY + 2.0, mz, Math.PI / 2, 1.7, 2.8);
      }
    }
    // Gilded pilasters between the mirrors, running the room's full height.
    for (const side of [-1, 1]) {
      for (const pz of [59.6, 63.0, 68.4, 71.8]) {
        root.add(box({
          size: [0.1, UY - GY - 0.4, 0.5], pos: [side * (r.x1 - 0.06), GY + (UY - GY - 0.4) / 2, pz], mat: M_GOLD, cast: false,
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
    sconce(r.x1 - 0.16, GY + 3.5, 70.6, -Math.PI / 2, 1.9);
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
    // Glazed wall cabinets over the east run, with plates showing through.
    for (const cz of [63.9, 65.4] ) {
      root.add(box({
        size: [0.36, 0.86, 1.3], pos: [r.x1 - 0.2, GY + 2.12, cz], mat: M_WOOD_DK,
      }));
      root.add(box({
        size: [0.03, 0.72, 1.16], pos: [r.x1 - 0.39, GY + 2.12, cz], mat: M_GLASS_CASE, cast: false,
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
    rug(0, 58, 12, 8, UY, M_CARPET_HALL);
    // Panelled walls: this is the room the family is photographed in.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        root.add(box({
          size: [0.06, 2.4, 1.5],
          pos: [side * (r.x1 - 0.05), UY + 1.5, 54.4 + i * 1.8],
          mat: M_WOOD_DK,
          cast: false,
        }));
      }
    }

    const tableZ0 = 54.6;
    const tableZ1 = 61.4;
    root.add(box({
      size: [2.2, 0.1, tableZ1 - tableZ0], pos: [0, UY + 0.76, (tableZ0 + tableZ1) / 2], mat: M_DESKTOP, name: 'conference-table',
    }));
    root.add(box({
      size: [2.36, 0.05, tableZ1 - tableZ0 + 0.16], pos: [0, UY + 0.72, (tableZ0 + tableZ1) / 2], mat: M_WOOD_DK,
    }));
    for (const [sx, sz] of [[-0.85, tableZ0 + 0.5], [0.85, tableZ0 + 0.5], [-0.85, tableZ1 - 0.5], [0.85, tableZ1 - 0.5]]) {
      root.add(box({ size: [0.16, 0.72, 0.16], pos: [sx, UY + 0.36, sz], mat: M_WOOD_DK }));
    }
    solid(-1.15, 1.15, UY, UY + 0.8, tableZ0, tableZ1);

    const chairs = [];
    for (let i = 0; i < 6; i++) {
      const z = tableZ0 + 0.55 + i * 1.15;
      chairs.push(makeSeat(-1.75, UY, z, Math.PI / 2, M_LEATHER_DK, 0.78));
      chairs.push(makeSeat(1.75, UY, z, -Math.PI / 2, M_LEATHER_DK, 0.78));
      for (const sx of [-0.82, 0.82]) {
        root.add(box({
          size: [0.18, 0.02, 0.1], pos: [sx, UY + 0.82, z], mat: M_CARD, rotX: -0.18, cast: false,
        }));
        root.add(cylinder({ r: 0.035, h: 0.1, pos: [sx + 0.22, UY + 0.86, z], mat: M_GLASS_CASE }));
      }
    }
    // Lou's chair at the head, backing onto his own office door. There is
    // deliberately NO chair at the foot: that end of the table is directly in
    // front of the double doors from the gallery, and a chair there is a
    // 0.6 m blocker standing in the middle of the room's only entrance.
    chairs.push(makeSeat(0, UY, tableZ1 + 0.85, Math.PI, M_LEATHER_RED, 1.05));

    // Projector screen + podium on the west wall.
    const screenTex = makeProjectorScreenTexture();
    const screenMat = mat({
      map: screenTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.55, unique: true,
    });
    const screen = flatArt('conference-screen', {
      x: r.x0 + 0.14, y: UY + 2.3, z: 58, rotY: Math.PI / 2, w: 6, h: 3.2, material: screenMat,
    });
    root.add(box({
      size: [0.07, 3.5, 6.3], pos: [r.x0 + 0.08, UY + 2.3, 58], mat: M_WOOD_DK, name: 'screen-bezel',
    }));
    const podium = group('podium',
      box({ size: [0.5, 1.1, 0.7], pos: [0, 0.55, 0], mat: M_WOOD_DK }),
      box({
        size: [0.55, 0.08, 0.75], pos: [0.02, 1.12, 0], mat: M_WOOD_DK, rotZ: 0.12,
      }));
    podium.position.set(r.x0 + 1.5, UY, 61.4);
    root.add(podium);
    solid(r.x0 + 1.2, r.x0 + 1.8, UY, UY + 1.15, 61.05, 61.75);
    root.add(cylinder({
      r: 0.022, h: 0.3, pos: [r.x0 + 1.5, UY + 1.2, 60.9], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    root.add(cylinder({
      r: 0.05, h: 0.16, pos: [r.x0 + 1.5, UY + 1.2, 60.72], mat: M_SILVER, rotX: Math.PI / 2,
    }));

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

    // Lighting: a long fixture over the table plus corner uplight.
    const lights = [];
    for (const lz of [56.4, 59.6]) {
      root.add(cylinder({ r: 0.03, h: 0.7, pos: [0, UCY - 0.45, lz], mat: M_GOLD }));
      for (const [ox, oz] of [[-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]]) {
        root.add(box({
          size: ox === 0 ? [0.03, 0.03, Math.abs(oz)] : [Math.abs(ox), 0.03, 0.03],
          pos: [ox / 2, UCY - 0.8, lz + oz / 2],
          mat: M_GOLD,
        }));
        root.add(sphere({ r: 0.09, pos: [ox, UCY - 0.86, lz + oz], mat: M_BULB_WARM, cast: false }));
      }
      const l = new THREE.PointLight(0xffdba0, 7, 18, 2);
      l.position.set(0, UCY - 1.0, lz);
      root.add(l);
      lights.push(l);
    }
    return {
      table: { x: 0, z0: tableZ0, z1: tableZ1 }, chairs, podium, screen, lights, crest: conferenceCrest,
    };
  }
  const conferenceProps = buildConference();

  /* ================================================================== */
  /* UPPER FLOOR -- LOU'S OFFICE (behind the conference room)            */
  /* ================================================================== */
  function buildOffice() {
    const r = OFFICE;
    trimRoom(r, UY, UCY - 0.3);
    topping(r.x0, r.x1, UY + 0.01, r.z0, r.z1, M_PARQUET, 'office-floor');
    rug(0, 70, 9, 7, UY, M_RUG_LIVING);
    // Panelled to shoulder height in dark wood, papered above.
    for (const side of [-1, 1]) {
      root.add(box({
        size: [0.07, 1.5, r.z1 - r.z0 - 0.4],
        pos: [side * (r.x1 - 0.05), UY + 0.75, (r.z0 + r.z1) / 2],
        mat: M_WOOD_DK,
        cast: false,
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
      box({ size: [0.9, 0.62, 0.9], pos: [0.75, 0.4, 0.06], mat: M_WOOD }));
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
    // The chair. Not a seat you take without being asked.
    makeSeat(0, UY, deskZ + 1.15, Math.PI, M_LEATHER_RED, 1.15);
    makeSeat(-0.95, UY, deskZ - 1.5, 0, M_LEATHER_TAN, 0.7);
    makeSeat(0.95, UY, deskZ - 1.5, 0, M_LEATHER_TAN, 0.7);

    // The locked case behind the desk with something in it nobody has seen.
    makeDisplayCase(r.x0 + 0.45, UY, 70.4, Math.PI / 2, 1.9, 2.2, 0.5, (g, w, h) => {
      g.add(box({ size: [w * 0.35, h * 0.55, 0.18], pos: [0, h * 0.32, 0], mat: M_SILHOUETTE }));
      g.add(box({ size: [w * 0.16, h * 0.2, 0.14], pos: [0, h * 0.65, 0], mat: M_SILHOUETTE }));
    });
    const caseGlow = new THREE.PointLight(0xfff0d0, 1.8, 4, 2);
    caseGlow.position.set(r.x0 + 0.8, UY + 1.3, 70.4);
    root.add(caseGlow);

    // Bookcases along the west wall, and a floor safe standing open-ish.
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
    }
    root.add(box({
      size: [0.9, 1.1, 0.9], pos: [r.x1 - 0.8, UY + 0.55, 65.4], mat: M_STOVE_BLACK, name: 'office-safe',
    }));
    root.add(cylinder({
      r: 0.14, h: 0.06, pos: [r.x1 - 0.8, UY + 0.62, 65.85], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    solid(r.x1 - 1.25, r.x1 - 0.35, UY, UY + 1.1, 64.95, 65.85);

    // A drinks table and two chairs by the window: the part of the office
    // where the conversation gets friendly again.
    root.add(cylinder({ r: 0.6, h: 0.06, pos: [4.6, UY + 0.72, 68.6], mat: M_MARBLE }));
    root.add(cylinder({ r: 0.16, h: 0.7, pos: [4.6, UY + 0.36, 68.6], mat: M_BRONZE }));
    solid(4.0, 5.2, UY, UY + 0.76, 68.0, 69.2);
    makeSeat(3.4, UY, 67.8, -0.9, M_LEATHER_TAN, 0.8);
    makeSeat(5.8, UY, 67.8, 0.9, M_LEATHER_TAN, 0.8);

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
    sconce(4.4, UY + 3.3, r.z0 + 0.22, 0, 1.8);
    const plant = makePlant(M, { x: -5.6, z: 74.2, scale: 1.8 });
    const plantWrap = new THREE.Group();
    plantWrap.position.y = UY;
    plantWrap.add(plant.group);
    root.add(plantWrap);

    const ceil = ceilingLight(0, 69, UCY - 0.35, 0xffdca0, 6, 18);
    ceilingLight(0, 74, UCY - 0.35, 0xffdca0, 4.2, 13);
    return {
      desk, deskLight, ceilingLight: ceil, shield: officeShield,
    };
  }
  const officeProps = buildOffice();

  /* ================================================================== */
  /* UPPER FLOOR -- BEDROOMS (down both sides)                           */
  /*                                                                      */
  /* One factory, four rooms. Each gets the bed, a pair of nightstands     */
  /* with lamps, a dresser and mirror, a wardrobe, an armchair, a rug,     */
  /* art, curtains and a light -- plus one thing that is only in that      */
  /* room, so they do not read as four copies.                            */
  /* ================================================================== */
  function buildBedroom({
    rect, name, headboardWall, palette, extra,
  }) {
    const r = rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    trimRoom(r, UY, UCY - 0.3);
    topping(r.x0, r.x1, UY + 0.01, r.z0, r.z1, M_PARQUET, `${name}-floor`);
    rug(cx, cz, Math.min(5.4, r.x1 - r.x0 - 1.2), Math.min(6.0, r.z1 - r.z0 - 1.8), UY, M_RUG_LIVING);

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

    // Dresser + mirror against the outer wall, wardrobe against the inner one.
    const dresserSide = inward;
    const dx = dresserSide > 0 ? r.x0 + 0.45 : r.x1 - 0.45;
    caseFurniture(dx, cz - 2.4, UY, 2.0, 0.6, 0.95, dresserSide > 0 ? Math.PI / 2 : -Math.PI / 2, 3);
    root.add(box({
      size: [0.07, 1.5, 1.2],
      pos: [dresserSide > 0 ? r.x0 + 0.12 : r.x1 - 0.12, UY + 1.85, cz - 2.4],
      mat: mat({ color: 0xdce6ee, roughness: 0.08, metalness: 0.85 }),
      name: `${name}-mirror`,
    }));
    const wx = dresserSide > 0 ? r.x1 - 0.4 : r.x0 + 0.4;
    root.add(box({
      size: [0.7, 2.3, 2.2], pos: [wx, UY + 1.15, cz + 1.4], mat: M_WOOD_DK, name: `${name}-wardrobe`,
    }));
    root.add(box({
      size: [0.05, 2.0, 1.0],
      pos: [dresserSide > 0 ? wx - 0.37 : wx + 0.37, UY + 1.2, cz + 1.4],
      mat: M_WOOD,
      cast: false,
    }));
    solid(wx - 0.38, wx + 0.38, UY, UY + 2.3, cz + 0.3, cz + 2.5);

    /* An armchair and a small table -- on the INNER side of the room, away
     * from the doorway in the outer corner. */
    const chairX = dresserSide > 0 ? r.x1 - 1.4 : r.x0 + 1.4;
    makeSeat(chairX, UY, cz + 2.6, dresserSide > 0 ? -1.2 : 1.2, palette.chair, 0.8);
    const sideTableX = dresserSide > 0 ? r.x1 - 2.6 : r.x0 + 2.6;
    root.add(cylinder({ r: 0.3, h: 0.06, pos: [sideTableX, UY + 0.56, cz + 2.9], mat: M_WOOD_DK }));
    root.add(cylinder({ r: 0.08, h: 0.56, pos: [sideTableX, UY + 0.28, cz + 2.9], mat: M_WOOD_DK }));

    wallArt(`${name}-art`, bedX, UY + 2.6, hbZ + (headboardWall === 'north' ? -0.16 : 0.16),
      headboardWall === 'north' ? Math.PI : 0, 1.0, 0.8,
      makePortraitTexture(`${name}-art`, palette.artLabel, palette.artTint));
    curtains('x', dresserSide > 0 ? r.x0 + 0.22 : r.x1 - 0.22, cz, UY + 0.75, 4.0, 2.3, palette.curtain);
    const light = ceilingLight(cx, cz, UCY - 0.35, 0xffdca0, 5, 15);
    extra?.({
      cx, cz, r, wrapY: UY,
    });
    return { light };
  }

  const bedrooms = {
    westFront: buildBedroom({
      rect: BED_WEST_FRONT,
      name: 'bed-west-front',
      headboardWall: 'north',
      palette: {
        headboard: M_FABRIC_GOLD, chair: M_FABRIC_GOLD, curtain: M_CURTAIN, artLabel: 'WHISPERING PINES', artTint: '#1a2218',
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
        headboard: M_FABRIC_COUCH, chair: M_FABRIC_CHAIR, curtain: M_CURTAIN_RED, artLabel: 'THE OLD COUNTRY', artTint: '#221a1a',
      },
      extra: ({ cx }) => {
        // A weights bench nobody has used since it arrived.
        root.add(box({ size: [0.4, 0.12, 1.3], pos: [cx - 2.0, UY + 0.44, 43.6], mat: M_LEATHER_DK }));
        for (const bz of [43.1, 44.1]) {
          root.add(box({ size: [0.3, 0.38, 0.1], pos: [cx - 2.0, UY + 0.19, bz], mat: M_RACK }));
        }
        root.add(cylinder({
          r: 0.03, h: 1.5, pos: [cx - 2.0, UY + 0.95, 43.2], mat: M_CHROME, rotZ: Math.PI / 2,
        }));
        for (const ox of [-0.6, 0.6]) {
          root.add(cylinder({
            r: 0.2, h: 0.1, pos: [cx - 2.0 + ox, UY + 0.95, 43.2], mat: M_STOVE_BLACK, rotZ: Math.PI / 2,
          }));
        }
        solid(cx - 2.4, cx - 1.6, UY, UY + 0.6, 43.0, 44.3);
      },
    }),
    westRear: buildBedroom({
      rect: BED_WEST_REAR,
      name: 'bed-west-rear',
      headboardWall: 'south',
      palette: {
        headboard: M_LEATHER_TAN, chair: M_FABRIC_CHAIR, curtain: M_CURTAIN, artLabel: 'THE LAKE HOUSE', artTint: '#141c22',
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
        headboard: M_FABRIC_GOLD, chair: M_LEATHER_TAN, curtain: M_CURTAIN_RED, artLabel: 'SILVER PINES', artTint: '#1a2218',
      },
      extra: ({ cz, r }) => {
        /* A television on a stand, the only one upstairs. On the inner half,
         * for the same reason as the west room's desk -- it used to stand in
         * front of this room's ensuite door. */
        const tx = r.x0 + 3.05;
        root.add(box({ size: [1.4, 0.5, 0.5], pos: [tx, UY + 0.25, cz + 3.4], mat: M_WOOD_DK }));
        root.add(box({ size: [1.1, 0.7, 0.42], pos: [tx, UY + 0.85, cz + 3.4], mat: M_STOVE_BLACK }));
        root.add(box({
          size: [0.94, 0.56, 0.02], pos: [tx, UY + 0.88, cz + 3.17], mat: mat({ color: 0x0a0b0d, roughness: 0.22 }),
        }));
        solid(tx - 0.7, tx + 0.7, UY, UY + 1.2, cz + 3.15, cz + 3.65);
      },
    }),
  };

  /* ================================================================== */
  /* UPPER FLOOR -- THE TWO ENSUITE BATHROOMS                            */
  /* ================================================================== */
  function buildBathroom(rect, name) {
    const r = rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const tile = bathTileMaterial(r.x1 - r.x0, r.z1 - r.z0);
    topping(r.x0, r.x1, UY + 0.012, r.z0, r.z1, tile, `${name}-floor`);
    // Tiled walls to shoulder height.
    for (const [wx0, wx1, wz0, wz1] of [
      [r.x0, r.x1, r.z0, r.z0 + 0.05],
      [r.x0, r.x1, r.z1 - 0.05, r.z1],
      [r.x0, r.x0 + 0.05, r.z0, r.z1],
      [r.x1 - 0.05, r.x1, r.z0, r.z1],
    ]) {
      root.add(box({
        size: [wx1 - wx0, 2.0, wz1 - wz0],
        pos: [(wx0 + wx1) / 2, UY + 1.0, (wz0 + wz1) / 2],
        mat: bathTileMaterial(Math.max(wx1 - wx0, wz1 - wz0), 2.0),
        cast: false,
      }));
    }
    const wrap = new THREE.Group();
    wrap.position.y = UY;
    const inward = r.x0 < 0 ? 1 : -1;
    const tubX0 = inward > 0 ? r.x0 + 0.35 : r.x1 - 2.15;
    const tub = makeTub(M, {
      x0: tubX0, z0: cz + 0.6, x1: tubX0 + 1.8, z1: cz + 3.0,
    });
    wrap.add(tub.group);
    solid(tubX0, tubX0 + 1.8, UY, UY + 0.56, cz + 0.6, cz + 3.0);
    const loo = makeToilet(M, {
      x: inward > 0 ? r.x1 - 0.8 : r.x0 + 0.8, z: cz + 2.4, rotY: inward > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
    wrap.add(loo.group);
    solid(
      (inward > 0 ? r.x1 - 0.8 : r.x0 + 0.8) - 0.4,
      (inward > 0 ? r.x1 - 0.8 : r.x0 + 0.8) + 0.4,
      UY, UY + 0.84, cz + 2.1, cz + 2.7,
    );
    const basin = makeBathSink(M, {
      x: inward > 0 ? r.x1 - 0.7 : r.x0 + 0.7, z: cz - 0.6, rotY: inward > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
    wrap.add(basin.group);
    solid(
      (inward > 0 ? r.x1 - 0.7 : r.x0 + 0.7) - 0.32,
      (inward > 0 ? r.x1 - 0.7 : r.x0 + 0.7) + 0.32,
      UY, UY + 0.86, cz - 0.9, cz - 0.3,
    );
    root.add(wrap);
    // Towel rail and a heap of towels, plus a bathmat.
    root.add(cylinder({
      r: 0.022, h: 1.0, pos: [inward > 0 ? r.x0 + 0.12 : r.x1 - 0.12, UY + 1.3, cz - 1.6], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    for (const oz of [-1.85, -1.4]) {
      root.add(box({
        size: [0.1, 0.62, 0.28],
        pos: [inward > 0 ? r.x0 + 0.2 : r.x1 - 0.2, UY + 1.0, cz + oz],
        mat: mat({ color: 0xe6ddc8, roughness: 1 }),
        cast: false,
      }));
    }
    rug(cx, cz + 0.2, 1.2, 0.8, UY, mat({ color: 0xcdd8d2, roughness: 1 }));
    return ceilingLight(cx, cz, UCY - 0.35, 0xf2f6ff, 4.2, 12);
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

    // ---- Wall racks with abstract weapon silhouettes.
    function wallRack(x, z, rotY) {
      const g = group('wall-rack',
        box({
          size: [1.55, 1.45, 0.05], pos: [0, -0.12, -0.07], mat: M_RACK_BACK, name: 'rack-backplate',
        }),
        box({ size: [1.4, 0.06, 0.06], pos: [0, 0, 0], mat: M_RACK }),
        box({ size: [0.06, 0.5, 0.06], pos: [-0.6, -0.25, 0], mat: M_RACK }),
        box({ size: [0.06, 0.5, 0.06], pos: [0.6, -0.25, 0], mat: M_RACK }));
      for (const rx of [-0.38, 0.12]) {
        g.add(cylinder({
          rTop: 0.03, rBottom: 0.045, h: 1.05, pos: [rx, -0.22, 0.03], mat: M_SILHOUETTE,
        }));
        g.add(box({ size: [0.15, 0.05, 0.05], pos: [rx, 0.02, 0.05], mat: M_RACK }));
      }
      for (const px of [-0.62, 0.62]) {
        const barrelX = px + (px < 0 ? 0.09 : -0.09);
        g.add(box({ size: [0.05, 0.22, 0.05], pos: [px, -0.56, 0.03], mat: M_SILHOUETTE }));
        g.add(box({ size: [0.2, 0.05, 0.05], pos: [barrelX, -0.47, 0.03], mat: M_SILHOUETTE }));
      }
      g.position.set(x, BY + 1.4, z);
      g.rotation.y = rotY;
      root.add(g);
      const cos = Math.abs(Math.cos(rotY));
      const sin = Math.abs(Math.sin(rotY));
      solid(x - (cos * 0.8 + sin * 0.15), x + (cos * 0.8 + sin * 0.15), BY, BY + 1.55,
        z - (sin * 0.8 + cos * 0.15), z + (sin * 0.8 + cos * 0.15));
    }
    wallRack(-6.4, r.z0 + 0.35, 0);
    wallRack(-3.6, r.z0 + 0.35, 0);
    wallRack(r.x0 + 0.35, 53.5, Math.PI / 2);
    wallRack(r.x0 + 0.35, 56.5, Math.PI / 2);

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
      bulbLight, workLight, ceilingLights: cans, drain, shield: basementShield,
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

  /** The four walls of a lower-level room, lined and notched for its door. */
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
    sconce(r.x1 - 0.2, GY + 2.9, 42.2, -Math.PI / 2, 2.2);
    sconce(r.x1 - 0.2, GY + 2.9, 54.6, -Math.PI / 2, 2.2);

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
      root.add(sign);
    }
    // Framed photographs of the house being built, between the doors.
    const shots = [
      [-10.4, 'cellar-dig', 'THE DIG, 1986'],
      [-0.6, 'cellar-pour', 'THE POUR'],
      [11.0, 'cellar-topping', 'TOPPING OUT'],
    ];
    for (const [sx, id, label] of shots) {
      wallArt(id, sx, BY + 1.75, r.z1 - 0.1, 0, 0.8, 0.6,
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
    lineRoom(r, 1.0, M_WALL_DEEP, [-13.0, -11.2]);

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
      lights.push(sconce(r.x0 + 0.2, BY + 1.95, sz, Math.PI / 2, 3.2));
      lights.push(sconce(r.x1 - 0.2, BY + 1.95, sz, -Math.PI / 2, 3.2));
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
    lineRoom(r, 2.3, M_LAN_WALL, LAN_DOOR);
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
  };

  const props = {
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
  function update(dt) {
    time += dt;
    const flick = 0.85 + 0.15 * Math.sin(time * 11) * (Math.sin(time * 2.3) > -0.6 ? 1 : 0.2);
    basementProps.bulbLight.intensity = 3.4 * flick;
    kitchenProps.updateSink(dt);
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
    { slot: 'mansion.basement.shield', mesh: basementProps.shield, w: 1.15 },
    { slot: 'mansion.trophy.crest', mesh: trophyProps.crest, w: 1.5 },
    { slot: 'mansion.winter.shield', mesh: winterProps.shield, w: 1.2 },
    { slot: 'mansion.cellar.crest', mesh: cellarHallProps.crest, w: 0.95 },
    { slot: 'mansion.theatre.banner', mesh: theatreProps.banner, w: 1.0 },
    { slot: 'mansion.lan.banner', mesh: lanProps.banner, w: 1.6 },
    { slot: 'mansion.guest.art', mesh: guestProps.art, w: 1.1 },
    { slot: 'mansion.vault.mark', mesh: vaultProps.mark, w: 0.8 },
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
