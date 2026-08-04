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
  makeAshtray, makeBooks, makeWallClock,
} from '../../world/props.js';
import {
  GROUND_Y, UPPER_Y, UPPER_CEILING_Y, BASEMENT_Y, BUILDING,
  FOYER_VOID, BASEMENT_ROOM, BASEMENT_SHAFT,
} from './MansionGrounds.js';

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
    return solid(x0, x1, y0, y1, z0, z1);
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

  /** A level guard railing: top rail + balusters + a real collider. */
  function railing(x0, x1, z0, z1, y0, tag = 'railing') {
    const isXRun = (x1 - x0) > (z1 - z0);
    const railH = 0.98;
    root.add(box({
      size: isXRun ? [x1 - x0, 0.08, 0.09] : [0.09, 0.08, z1 - z0],
      pos: [(x0 + x1) / 2, y0 + railH, (z0 + z1) / 2],
      mat: M_GOLD,
      name: `${tag}-rail`,
    }));
    const run = isXRun ? x1 - x0 : z1 - z0;
    const posts = Math.max(2, Math.round(run / 0.62));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const px = isXRun ? THREE.MathUtils.lerp(x0, x1, t) : (x0 + x1) / 2;
      const pz = isXRun ? (z0 + z1) / 2 : THREE.MathUtils.lerp(z0, z1, t);
      root.add(cylinder({
        r: 0.028, h: railH, pos: [px, y0 + railH / 2, pz], mat: M_CHROME,
      }));
      root.add(sphere({ r: 0.045, pos: [px, y0 + railH - 0.14, pz], mat: M_GOLD, cast: false }));
    }
    return solid(x0, x1, y0, y0 + railH + 0.08, z0, z1);
  }

  /**
   * A raking balustrade following a stair's open side.
   *
   * Emitted as a run of short segments, each with its own collider sitting on
   * that part of the stair, so a player on the treads is guarded the whole way
   * up instead of only at one height.
   */
  function rakingRail(xAt, z0, z1, yAt, tag) {
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const za = THREE.MathUtils.lerp(z0, z1, i / steps);
      const zb = THREE.MathUtils.lerp(z0, z1, (i + 1) / steps);
      const ya = yAt((za + zb) / 2);
      root.add(box({
        size: [0.09, 0.08, zb - za + 0.04],
        pos: [xAt, ya + 0.98, (za + zb) / 2],
        mat: M_GOLD,
        name: `${tag}-rail`,
      }));
      root.add(cylinder({
        r: 0.028, h: 0.98, pos: [xAt, ya + 0.49, (za + zb) / 2], mat: M_CHROME,
      }));
      solid(xAt - 0.06, xAt + 0.06, ya, ya + 1.06, za, zb);
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

  /** Framed art hung flat on a wall (uses the shared apartment frame prop). */
  function wallArt(x, y, z, rotY, w, h, texture) {
    const f = makeFrame(M, {
      x, y, z, rotY, w, h, texture, tint: 0x2a1d12,
    });
    root.add(f.group);
    return f;
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
    // Dark marble border + a compass inlay under the chandelier.
    for (const [bx0, bx1, bz0, bz1] of [
      [FOYER.x0 + 0.6, FOYER.x1 - 0.6, 42.2, 42.5],
      [FOYER.x0 + 0.6, FOYER.x1 - 0.6, 47.2, 47.5],
      [FOYER.x0 + 0.6, FOYER.x0 + 0.9, 42.2, 47.5],
      [FOYER.x1 - 0.9, FOYER.x1 - 0.6, 42.2, 47.5],
    ]) topping(bx0, bx1, GY + 0.02, bz0, bz1, M_MARBLE_DK, 'foyer-border');
    const inlay = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), M_MARBLE_DK);
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.set(0, GY + 0.022, 44.4);
    root.add(inlay);
    const inlayGold = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.1, 32), M_GOLD);
    inlayGold.rotation.x = -Math.PI / 2;
    inlayGold.position.set(0, GY + 0.03, 44.4);
    root.add(inlayGold);

    // ---- The horseshoe: two flights, rising to the gallery slab at z=48.
    stairFlight(STAIR_WEST, GY, UY, 'horseshoe-west', 'east');
    stairFlight(STAIR_EAST, GY, UY, 'horseshoe-east', 'west');
    const stairY = (z) => THREE.MathUtils.lerp(
      GY, UY, THREE.MathUtils.clamp((z - STAIR_WEST.z0) / (STAIR_WEST.z1 - STAIR_WEST.z0), 0, 1),
    );
    // Each flight's inner edge is open over the foyer -- balustrade it.
    rakingRail(STAIR_WEST.x1, STAIR_WEST.z0, STAIR_WEST.z1, stairY, 'horseshoe-west');
    rakingRail(STAIR_EAST.x0, STAIR_EAST.z0, STAIR_EAST.z1, stairY, 'horseshoe-east');
    // Newel posts at the feet of both flights.
    for (const nx of [STAIR_WEST.x1, STAIR_EAST.x0]) {
      root.add(box({
        size: [0.26, 1.3, 0.26], pos: [nx, GY + 0.65, STAIR_WEST.z0 - 0.1], mat: M_WOOD_DK, name: 'newel',
      }));
      root.add(sphere({ r: 0.17, pos: [nx, GY + 1.42, STAIR_WEST.z0 - 0.1], mat: M_GOLD }));
      solid(nx - 0.16, nx + 0.16, GY, GY + 1.4, STAIR_WEST.z0 - 0.26, STAIR_WEST.z0 + 0.06);
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
    buildSmallStatue(-3.2, 42.6, GY, M_SILVER);
    buildSmallStatue(3.2, 42.6, GY, M_SILVER);
    rug(0, 50.6, 6.0, 4.2, GY, M_RUG_LIVING);
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
      sconce(side * (FOYER.x1 - 0.1), GY + 2.6, 44, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      sconce(side * (FOYER.x1 - 0.1), GY + 2.6, 56.6, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    // Potted palms in the two corners beside the front door, where nobody
    // walks and where they frame the doorway from inside.
    for (const px of [-4.6, 4.6]) {
      const potted = makePlant(M, { x: px, z: 41.7, scale: 1.9 });
      const wrap = new THREE.Group();
      wrap.position.y = GY;
      wrap.add(potted.group);
      root.add(wrap);
      solid(px - 0.35, px + 0.35, GY, GY + 1.6, 41.35, 42.05);
    }
    // The family crest over the front door, seen as you come down the stairs.
    const crest = squatchArt('mansion-foyer-crest', {
      title: ['THE SILVER', 'SASQUATCHES'], footer: 'FAMILY, FIRST', ink: '#d8b23a', bg: '#1a1218',
    });
    const crestMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), mat({
      map: crest, roughness: 0.85, unique: true,
    }));
    crestMesh.position.set(0, GY + 5.4, 41.28);
    root.add(crestMesh);
    root.add(box({
      size: [2.9, 3.5, 0.08], pos: [0, GY + 5.4, 41.22], mat: M_WOOD_DK, name: 'foyer-crest-frame',
    }));

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
      // A brass handrail on top of it, at hand height.
      root.add(box({
        size: [0.08, 0.07, depth + 0.04],
        pos: [BASEMENT_STAIR.x0 + 0.15, top + 0.95, (za + zb) / 2],
        mat: M_GOLD,
      }));
      root.add(cylinder({
        r: 0.022, h: 0.95, pos: [BASEMENT_STAIR.x0 + 0.15, top + 0.48, (za + zb) / 2], mat: M_CHROME,
      }));
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

    // The family portrait wall.
    wallArt(-13.4, GY + 2.5, r.z1 - 0.12, Math.PI, 1.5, 1.9,
      squatchArt('mansion-living-art', {
        title: ['THE SILVER', 'SASQUATCHES'], footer: 'FAMILY, FIRST', ink: '#c8a24a', bg: '#20161a',
      }));
    wallArt(-11.0, GY + 2.4, r.z1 - 0.12, Math.PI, 0.9, 1.2,
      makePortraitTexture('booski', 'BOOSKIBRO', '#1e1a26'));
    wallArt(-15.6, GY + 2.4, r.z1 - 0.12, Math.PI, 0.9, 1.2,
      makePortraitTexture('lou', 'BIG UNCLE LOU', '#241a14'));

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

    const lamp = makeFloorLamp(M, { x: -15.2, z: 44.4 });
    const lampWrap = new THREE.Group();
    lampWrap.position.y = GY;
    lampWrap.add(lamp.group);
    root.add(lampWrap);
    const lampLight = new THREE.PointLight(0xffc98a, 3.4, 12, 2);
    lampLight.position.set(-15.2, GY + 1.5, 44.4);
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

    // ---- Billiard table.
    const bx = 12.5;
    const bz = 51.5;
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
    // Cue rack on the wall.
    root.add(box({ size: [0.12, 1.5, 1.2], pos: [r.x1 - 0.14, GY + 1.4, 55.4], mat: M_WOOD_DK }));
    for (let i = 0; i < 5; i++) {
      root.add(cylinder({
        r: 0.018, h: 1.45, pos: [r.x1 - 0.26, GY + 1.4, 54.9 + i * 0.22], mat: M_WOOD,
      }));
    }
    solid(r.x1 - 0.34, r.x1, GY, GY + 2.2, 54.7, 56.1);
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
    cases.push(makeDisplayCase(13.2, GY, r.z0 + 0.35, 0, 1.9, 2.1, 0.4, (g, w, h) => {
      g.add(box({ size: [w * 0.7, h * 0.6, 0.05], pos: [0, h * 0.5, 0], mat: M_JERSEY }));
      g.add(box({ size: [w * 0.7 + 0.06, 0.05, 0.08], pos: [0, h * 0.8, 0], mat: M_GOLD }));
    }));
    for (const c of [
      { x: r.x0 + 0.35, z: 43.4, rotY: Math.PI / 2 },
      { x: r.x0 + 0.35, z: 46.4, rotY: Math.PI / 2 },
      { x: 13.2, z: r.z0 + 0.35, rotY: 0 },
    ]) {
      const cl = new THREE.PointLight(0xfff2d8, 2.0, 4.0, 2);
      cl.position.set(c.x + Math.sin(c.rotY) * 0.3, GY + 1.15, c.z + Math.cos(c.rotY) * 0.3);
      root.add(cl);
    }
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 3.2),
      mat({ map: makeBannerTexture(), roughness: 0.9, unique: true }),
    );
    banner.rotation.y = -Math.PI / 2;
    banner.position.set(r.x1 - 0.12, GY + 3.0, 48.6);
    root.add(banner);
    root.add(cylinder({
      r: 0.03, h: 1.7, pos: [r.x1 - 0.12, GY + 4.6, 48.6], mat: M_GOLD, rotZ: Math.PI / 2,
    }));

    /* ---- The bar, along the EAST wall rather than across the north end.
     *
     * It used to run x:9.8-13.4 at z=56.2, which is 1.8 m in front of the
     * kitchen doorway at z=58 -- a 3.6 m counter standing square across the
     * only route from this room to the back of the house. Turned through
     * ninety degrees against the outside wall it serves the room the same way
     * and leaves the doorway clear. */
    const barX = 15.0;
    root.add(box({ size: [0.7, 1.1, 3.6], pos: [barX, GY + 0.55, 51.5], mat: M_WOOD_DK, name: 'lounge-bar' }));
    root.add(box({ size: [0.9, 0.08, 3.9], pos: [barX, GY + 1.14, 51.5], mat: M_MARBLE, name: 'bar-top' }));
    solid(barX - 0.45, barX + 0.45, GY, GY + 1.18, 49.7, 53.3);
    root.add(box({ size: [0.28, 1.5, 3.4], pos: [r.x1 - 0.16, GY + 1.9, 51.5], mat: M_WOOD_DK }));
    solid(r.x1 - 0.3, r.x1, GY, GY + 2.7, 49.8, 53.2);
    for (let i = 0; i < 8; i++) {
      root.add(cylinder({
        r: 0.05, h: 0.3, pos: [r.x1 - 0.22, GY + 1.55, 50.2 + i * 0.36], mat: M_GLASS_CASE,
      }));
      root.add(cylinder({
        r: 0.045, h: 0.34, pos: [r.x1 - 0.22, GY + 2.28, 50.2 + i * 0.36], mat: mat({ color: 0x6a4a1e, roughness: 0.3 }),
      }));
    }
    for (const sz of [50.3, 51.5, 52.7]) {
      root.add(cylinder({ r: 0.05, h: 0.72, pos: [barX - 0.9, GY + 0.36, sz], mat: M_CHROME }));
      root.add(cylinder({ r: 0.24, h: 0.1, pos: [barX - 0.9, GY + 0.76, sz], mat: M_LEATHER_RED }));
      solid(barX - 1.16, barX - 0.64, GY, GY + 0.8, sz - 0.26, sz + 0.26);
    }

    curtains('z', r.z0 + 0.2, 12.5, GY + 0.1, 6.0, 3.6);
    ceilingLight(12.5, 45.0, UY - 0.4, 0xffdca0, 5.4, 16);
    ceilingLight(11.5, 56.0, UY - 0.4, 0xffdca0, 4.2, 13);
    return { cases, banner };
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

    // A low stage at the north end, with the band's gear left on it.
    root.add(box({
      size: [9, 0.5, 3.4], pos: [0, GY + 0.25, 73], mat: M_WOOD_DK, name: 'ballroom-stage',
    }));
    solid(-4.5, 4.5, GY, GY + 0.5, 71.3, 74.7);
    const stageStack = box({ size: [1.2, 0.9, 0.5], pos: [-2.6, GY + 0.95, 73.4], mat: M_STOVE_BLACK });
    root.add(stageStack);
    root.add(box({ size: [1.2, 0.9, 0.5], pos: [2.6, GY + 0.95, 73.4], mat: M_STOVE_BLACK }));
    root.add(cylinder({ r: 0.02, h: 1.5, pos: [0, GY + 1.25, 72.2], mat: M_CHROME }));
    root.add(cylinder({ r: 0.05, h: 0.16, pos: [0, GY + 2.02, 72.2], mat: M_STOVE_BLACK }));
    for (const cz of [72.6, 73.2]) {
      root.add(cylinder({ r: 0.3, h: 0.36, pos: [1.1, GY + 0.68, cz], mat: M_CARD, rotX: Math.PI / 2 }));
    }
    const stageLight = new THREE.PointLight(0xffc0d8, 3.4, 12, 2);
    stageLight.position.set(0, GY + 3.4, 72.8);
    root.add(stageLight);

    // Gilt chairs round the edge, as at every function ever held here.
    for (let i = 0; i < 5; i++) {
      makeSeat(r.x0 + 0.9, GY, 61.5 + i * 2.6, -Math.PI / 2, M_FABRIC_GOLD, 0.55);
      makeSeat(r.x1 - 0.9, GY, 61.5 + i * 2.6, Math.PI / 2, M_FABRIC_GOLD, 0.55);
    }
    // Two round cocktail tables with cloths.
    for (const [tx, tz] of [[-6.2, 61.5], [6.2, 61.5]]) {
      root.add(cylinder({ r: 0.6, h: 0.05, pos: [tx, GY + 1.05, tz], mat: M_MARBLE }));
      root.add(cylinder({ rTop: 0.62, rBottom: 0.52, h: 1.05, pos: [tx, GY + 0.52, tz], mat: M_CURTAIN_RED }));
      solid(tx - 0.6, tx + 0.6, GY, GY + 1.1, tz - 0.6, tz + 0.6);
      root.add(cylinder({ r: 0.045, h: 0.3, pos: [tx - 0.2, GY + 1.22, tz], mat: M_GLASS_CASE }));
      root.add(cylinder({ r: 0.045, h: 0.3, pos: [tx + 0.15, GY + 1.22, tz + 0.14], mat: M_GLASS_CASE }));
    }
    // Mirrored panels along the walls, the way a ballroom is always done.
    for (const side of [-1, 1]) {
      for (const mz of [61, 65, 69]) {
        root.add(box({
          size: [0.06, 2.6, 1.5],
          pos: [side * (r.x1 - 0.08), GY + 2.0, mz],
          mat: mat({
            color: 0xdce6ee, roughness: 0.08, metalness: 0.85,
          }),
          name: 'ballroom-mirror',
        }));
        root.add(box({
          size: [0.05, 2.8, 1.7], pos: [side * (r.x1 - 0.04), GY + 2.0, mz], mat: M_GOLD, cast: false,
        }));
      }
    }
    curtains('z', r.z1 - 0.2, 0, GY + 0.1, 8.0, 4.2, M_CURTAIN_RED);
    return { stageLight, stageStack };
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

    // Candelabra down the middle of the table.
    for (const cz of [64.2, 66, 67.8]) {
      root.add(cylinder({ r: 0.14, h: 0.05, pos: [tx, GY + 0.84, cz], mat: M_GOLD }));
      root.add(cylinder({ r: 0.03, h: 0.5, pos: [tx, GY + 1.1, cz], mat: M_GOLD }));
      for (const ox of [-0.22, 0, 0.22]) {
        root.add(cylinder({ r: 0.022, h: 0.28, pos: [tx + ox, GY + 1.45, cz], mat: M_CARD }));
        root.add(sphere({ r: 0.03, pos: [tx + ox, GY + 1.62, cz], mat: M_BULB_WARM, cast: false }));
      }
      const cl = new THREE.PointLight(0xffc888, 1.5, 5, 2);
      cl.position.set(tx, GY + 1.65, cz);
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

    wallArt(-12.5, GY + 2.6, r.z0 + 0.2, 0, 1.6, 1.2,
      makePortraitTexture('feast', 'THE ANNUAL DINNER', '#1c1a14'));
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

    // Sink under the east window.
    root.add(box({
      size: [0.5, 0.16, 1.0], pos: [r.x1 - 0.4, GY + 0.86, 61.5], mat: M_STEEL,
    }));
    root.add(cylinder({
      r: 0.02, h: 0.34, pos: [r.x1 - 0.6, GY + 1.1, 61.5], mat: M_CHROME,
    }));

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

    const kitchenLights = [];
    for (const [px, pz] of [[11, 60.5], [12.5, 65.5], [13.4, 71.5]]) {
      kitchenLights.push(ceilingLight(px, pz, UY - 0.35, 0xffe9c4, 4.6, 13));
    }
    return { island, stove, ceilingLights: kitchenLights };
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
      wallArt(px, UY + 1.9, Z_GALLERY_N - 0.18, Math.PI, 0.86, 1.15, makePortraitTexture(key, name, tint));
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
    const lights = [];
    for (const px of [-12, -4, 4, 12]) {
      lights.push(ceilingLight(px, 50.5, UCY - 0.3, 0xffdca0, 5.2, 15));
    }
    return { lights };
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
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), screenMat);
    screen.rotation.y = Math.PI / 2;
    screen.position.set(r.x0 + 0.14, UY + 2.3, 58);
    root.add(screen);
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
    wallArt(r.x1 - 0.14, UY + 2.5, 56.4, -Math.PI / 2, 1.3, 1.6,
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
      table: { x: 0, z0: tableZ0, z1: tableZ1 }, chairs, podium, screen, lights,
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
    wallArt(-4.6, UY + 2.4, r.z0 + 0.2, 0, 1.2, 1.5,
      makePortraitTexture('lou-office', 'BIG UNCLE LOU', '#2a1c14'));
    const plant = makePlant(M, { x: -5.6, z: 74.2, scale: 1.8 });
    const plantWrap = new THREE.Group();
    plantWrap.position.y = UY;
    plantWrap.add(plant.group);
    root.add(plantWrap);

    const ceil = ceilingLight(0, 69, UCY - 0.35, 0xffdca0, 6, 18);
    ceilingLight(0, 74, UCY - 0.35, 0xffdca0, 4.2, 13);
    return { desk, deskLight, ceilingLight: ceil };
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

    wallArt(bedX, UY + 2.6, hbZ + (headboardWall === 'north' ? -0.16 : 0.16),
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
      extra: ({ cx, cz }) => {
        // A writing desk under the window, with a lamp and a letter.
        root.add(box({ size: [1.5, 0.07, 0.7], pos: [cx - 1.6, UY + 0.75, cz + 3.4], mat: M_WOOD_DK }));
        for (const [ox, oz] of [[-0.65, -0.28], [0.65, -0.28], [-0.65, 0.28], [0.65, 0.28]]) {
          root.add(box({ size: [0.07, 0.75, 0.07], pos: [cx - 1.6 + ox, UY + 0.37, cz + 3.4 + oz], mat: M_WOOD_DK }));
        }
        solid(cx - 2.4, cx - 0.8, UY, UY + 0.8, cz + 3.05, cz + 3.75);
        root.add(box({
          size: [0.24, 0.01, 0.32], pos: [cx - 1.6, UY + 0.79, cz + 3.4], mat: M_CARD, cast: false,
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
      extra: ({ cx, cz }) => {
        // A television on a stand, the only one upstairs.
        root.add(box({ size: [1.4, 0.5, 0.5], pos: [cx + 1.6, UY + 0.25, cz + 3.4], mat: M_WOOD_DK }));
        root.add(box({ size: [1.1, 0.7, 0.42], pos: [cx + 1.6, UY + 0.85, cz + 3.4], mat: M_STOVE_BLACK }));
        root.add(box({
          size: [0.94, 0.56, 0.02], pos: [cx + 1.6, UY + 0.88, cz + 3.17], mat: mat({ color: 0x0a0b0d, roughness: 0.22 }),
        }));
        solid(cx + 0.9, cx + 2.3, UY, UY + 1.2, cz + 3.15, cz + 3.65);
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
    root.add(box({
      size: [r.x1 - r.x0 - 0.3, panelH, 0.04],
      pos: [(r.x0 + r.x1) / 2, panelMidY, r.z1 - 0.18],
      mat: concreteMaterial(r.x1 - r.x0, panelH),
      name: 'basement-wall-panel-north',
    }));
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

    return {
      bulbLight, workLight, ceilingLights: cans, drain,
    };
  }
  const basementProps = buildBasement();

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
    // Basement
    basementStairTop: new THREE.Vector3(7.2, GY, BASEMENT_STAIR.z0 - 1.2),
    basementLanding: new THREE.Vector3(7.2, BY, BASEMENT_STAIR.z1 - 0.6),
    armoryCenter: new THREE.Vector3(-2, BY, 55.5),
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
    if (inShaft) {
      const t = THREE.MathUtils.clamp(
        (z - BASEMENT_STAIR.z0) / (BASEMENT_STAIR.z1 - BASEMENT_STAIR.z0), 0, 1,
      );
      cands.push(THREE.MathUtils.lerp(GY, BY, t));
    } else if (inBuilding) {
      cands.push(GY); // the podium: solid everywhere except the shaft
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

  return {
    root, colliders, doors, props, anchors, rooms, lights, occluders, floorAt, update,
  };
}
