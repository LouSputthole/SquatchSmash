/**
 * Lou's mansion -- interior fit-out.
 *
 * PHASE 2 of this mission's environment build: everything inside the shell
 * that `MansionGrounds.js` (Phase 1) already poured -- the central hall and
 * its grand/basement staircases, the sunken... see the deviation note below
 * for why "sunken" isn't literal... living room, the boardroom, the kitchen +
 * service corridor, Lou's office, the trophy room, the upper hallway/balcony,
 * and the basement armory. No NPCs, no combat, no dialogue/mission state, no
 * weapon pickups, no working doors -- purely an explorable, fully-collided,
 * fully-lit environment, exactly like Phase 1.
 *
 * This file imports Phase 1's exported constants (read-only reuse) and takes
 * its `shell` object as an explicit parameter -- it does not redraw or edit
 * anything Phase 1 already built (no exterior walls, no floor/roof slabs, no
 * grounds dressing). See the big comment above `buildMansionInterior()` for
 * exactly how Phase 3 is expected to compose the two modules together.
 *
 * Built entirely from primitives via world/build.js (mat/box/cylinder/sphere/
 * collider/group), the same "no asset files" convention as Phase 1 and every
 * other scene in this repo. Two procedural texture generators are reused
 * as-is from world/textures.js (rugTex/fabricTex -- both bake their own
 * `repeat` at build time, so using their cached result directly is safe; no
 * cloning or runtime mutation needed).
 */
import * as THREE from 'three';
import {
  mat, box, cylinder, sphere, collider, group,
} from '../../world/build.js';
import { rugTex, fabricTex, tileTex } from '../../world/textures.js';
// Basement wall panels + the living room's wall art reuse the exact same
// idioms MansionGrounds.js's driveway pass already established: `tiled()`
// (bing/kit.js's own doc comment -- "textures are cached and shared, so
// clone before retiling") for a concrete/stone-look repeat, and
// `squatchArt()` (already used for the trophy room's own family-crest look
// via its shared silhouette) for a quick framed piece of wall art, instead
// of inventing either from scratch.
import { tiled, squatchArt } from '../../bing/kit.js';
import {
  GROUND_Y, UPPER_Y, UPPER_CEILING_Y, BASEMENT_Y, ATRIUM,
} from './MansionGrounds.js';

/* ================================================================== */
/* Room footprints -- fixed by the design brief. Exported so Phase 3 (or  */
/* anything else) can query room bounds without re-deriving them.        */
/* ================================================================== */
export const HALL = Object.freeze({ ...ATRIUM }); // x:-4..4, z:41..49 -- the atrium
export const LIVING = Object.freeze({ x0: -16, x1: -4, z0: 41, z1: 58 });
export const BOARDROOM = Object.freeze({ x0: 4, x1: 16, z0: 41, z1: 58 });
export const KITCHEN = Object.freeze({ x0: 4, x1: 16, z0: 58, z1: 70 });
export const OFFICE = Object.freeze({ x0: -16, x1: -4, z0: 41, z1: 55 });
export const TROPHY = Object.freeze({ x0: 4, x1: 16, z0: 41, z1: 55 });
/** The real Phase-1 upper-floor slab north of the atrium (already built). */
export const UPPER_HALL_MAIN = Object.freeze({ x0: -4, x1: 4, z0: 49, z1: 58 });
/** Grand staircase shaft: ground -> upper, flush against the hall/living wall. */
export const GRAND_STAIR = Object.freeze({ x0: -3.85, x1: -1.5, z0: 43, z1: 49 });
/** Basement staircase shaft: ground -> basement, flush against the hall/boardroom wall. */
export const BASEMENT_STAIR = Object.freeze({ x0: 1.5, x1: 3.85, z0: 43, z1: 49 });
/** Balcony extension Phase 2 cantilevers over the void, directly above BASEMENT_STAIR. */
export const BALCONY = Object.freeze({ x0: 1.5, x1: 3.85, z0: 43, z1: 49 });
/** The open oculus down the middle of the atrium -- no floor at either level, on
 * purpose, so the chandelier and the ground-floor hall stay visible from upstairs. */
export const OCULUS = Object.freeze({ x0: -1.5, x1: 1.5, z0: 41, z1: 49 });
export const CHANDELIER_POS = Object.freeze({ x: 0, y: 9.4, z: 45 });

const WALL_T = 0.3; // interior partition thickness (Phase 1's exterior walls use 0.4)

/* ================================================================== */
/* Material palette -- procedural only, echoing Phase 1's palette so the  */
/* two modules read as one building (the hex values are re-picked, not    */
/* imported -- Phase 1 doesn't export its material consts).               */
/* ================================================================== */
const M_MARBLE = mat({ color: 0xe6e0d2, roughness: 0.3 });
const M_MARBLE_DK = mat({ color: 0xb7ae98, roughness: 0.4 });
const M_GOLD = mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 });
const M_SILVER = mat({ color: 0xc8ccd6, roughness: 0.16, metalness: 0.9 });
const M_CHROME = mat({ color: 0xd7dce3, roughness: 0.14, metalness: 0.95 });
const M_BRONZE = mat({ color: 0x8a5a2e, roughness: 0.35, metalness: 0.65 });

const M_WALL = mat({ color: 0xe3dbc8, roughness: 0.85 });
const M_WALL_DARK = mat({ color: 0x2a2118, roughness: 0.7 });
const M_WOOD_DK = mat({ color: 0x3a2a1c, roughness: 0.5 });
const M_WOOD = mat({ color: 0x5c4020, roughness: 0.6 });
const M_LEATHER_RED = mat({ color: 0x5e161f, roughness: 0.55 });
const M_LEATHER_DK = mat({ color: 0x241a16, roughness: 0.6 });

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
const M_RUG_LIVING = mat({ map: rugTex(), roughness: 0.9 });
const M_FABRIC_COUCH = mat({ map: fabricTex('#5e161f'), roughness: 0.85 });
const M_FABRIC_CHAIR = mat({ map: fabricTex('#241a16'), roughness: 0.85 });
const M_CURTAIN = mat({ map: fabricTex('#33425a'), roughness: 0.82 });

/* ================================================================== */
/* Basement concrete/stone wall panels -- a damper, rougher surface than  */
/* upstairs' marble, drawn with the exact same `tileTex()` (one grouted   */
/* tile square) + `tiled()` (clone-then-retile) idiom MansionGrounds.js's */
/* driveway pass already uses for its paver material, just with a colder, */
/* darker, less regular grout/face pair standing in for poured concrete   */
/* blockwork instead of dressed pavers.                                   */
/* ================================================================== */
const concreteBase = tileTex(5, '#2e2b26', '#726c60');
function concreteMaterial(w, h) {
  return mat({
    map: tiled(concreteBase, Math.max(1, Math.round(w / 1.3)), Math.max(1, Math.round(h / 1.3))),
    color: 0xffffff,
    roughness: 0.96,
    unique: true,
  });
}

/* ================================================================== */
/* Canvas-texture label -- checked src/world/ and src/core/ first (see    */
/* the report): there is no shared generic "label" helper. Every scene    */
/* that needs text on a surface (motel/level.js's makeSignText/            */
/* makeNumberPlate/makeRulesSign, world/props.js's makeCrossingSign,       */
/* world/dressing.js's answer-machine label) writes its own small canvas   */
/* function following the same idiom: create a canvas, 2D-draw it, wrap    */
/* it in a THREE.CanvasTexture with colorSpace = SRGBColorSpace. This      */
/* follows that exact idiom rather than inventing a new one.               */
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

function inRect(r, x, z) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/* ================================================================== */
/* buildMansionInterior(shell)                                           */
/*                                                                        */
/* How Phase 3 is expected to compose this with Phase 1:                  */
/*   const grounds  = buildMansionGrounds(scene);                         */
/*   const interior = buildMansionInterior(grounds.shell);                */
/*   scene.add(grounds.root, interior.root);                              */
/*   const colliders = [...grounds.colliders, ...interior.colliders];     */
/*   const doors   = { ...grounds.doors,   ...interior.doors   };         */
/*   const anchors = { ...grounds.anchors, ...interior.anchors };         */
/*   // per frame:                                                        */
/*   grounds.update(dt); interior.update(dt);                             */
/*   const ground = interior.floorAt(x, z, feetY) ?? grounds-side default;*/
/* `interior.colliders` is a flat array of THREE.Box3, exactly like       */
/* Phase 1's -- concatenating (not replacing) is the whole trick, same    */
/* way Phase 1 concatenated its own wall/vehicle/palm/fountain colliders  */
/* into one array. Key names in `doors`/`anchors` were chosen to not      */
/* collide with Phase 1's (front/rearService; gate/spawn/... etc.).       */
/*                                                                        */
/* Note for Phase 3: Phase 1's `buildMansionGrounds()` does not export a  */
/* `floorAt` of its own (the exterior is flat ground plus a couple of     */
/* collider-only stepped surfaces) -- this module's `floorAt` is the only */
/* multi-level floor resolver in the mansion scene. Whatever movement     */
/* loop Phase 3 writes for mansion.html should follow the exact pattern   */
/* src/motel/main.js uses around its own `level.floorAt(x,z,feetY)` call  */
/* (track `feetY` + `vy`, apply gravity, snap to `ground` when landing)   */
/* rather than src/core/player.js's simpler single-argument `groundAt`    */
/* contract, which cannot disambiguate a multi-storey column like the     */
/* hall (ground floor / basement / upper balcony all share the same x,z). */
/* ================================================================== */
export function buildMansionInterior(shell = null) {
  const GY = shell?.GROUND_Y ?? GROUND_Y;
  const UY = shell?.UPPER_Y ?? UPPER_Y;
  const UCY = shell?.UPPER_CEILING_Y ?? UPPER_CEILING_Y;
  const BY = shell?.BASEMENT_Y ?? BASEMENT_Y;

  const root = new THREE.Group();
  root.name = 'MansionInterior';
  const colliders = [];

  function solid(x0, x1, y0, y1, z0, z1) {
    const c = collider([Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)]);
    colliders.push(c);
    return c;
  }

  /** A solid wall segment: mesh + matching collider (Phase 1's `ext()` twin). */
  function wallSeg(x0, x1, y0, y1, z0, z1, material = M_WALL, tag = 'wall') {
    root.add(box({
      size: [x1 - x0, y1 - y0, z1 - z0],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      mat: material,
      name: tag,
    }));
    return solid(x0, x1, y0, y1, z0, z1);
  }

  /** Thin decorative floor topping over an already-solid Phase-1 slab. No
   * collider -- floors are never colliders (see Phase 1's own note: a slab
   * collider would eject anyone standing on top of it sideways). */
  function topping(x0, x1, y, z0, z1, material, tag = 'floor') {
    root.add(box({
      size: [x1 - x0, 0.02, z1 - z0], pos: [(x0 + x1) / 2, y, (z0 + z1) / 2], mat: material, name: tag,
    }));
  }

  /** A guard railing: top rail + balusters + a real collider (this is a
   * genuine fall hazard over the atrium void, not decoration). */
  function railing(x0, x1, z0, z1, y0, tag = 'railing') {
    const isXRun = (x1 - x0) > (z1 - z0);
    const railH = 0.95;
    root.add(box({
      size: isXRun ? [x1 - x0, 0.06, 0.06] : [0.06, 0.06, z1 - z0],
      pos: [(x0 + x1) / 2, y0 + railH, (z0 + z1) / 2],
      mat: M_CHROME,
      name: `${tag}-rail`,
    }));
    const run = isXRun ? x1 - x0 : z1 - z0;
    const posts = Math.max(2, Math.round(run / 0.9));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const px = isXRun ? THREE.MathUtils.lerp(x0, x1, t) : (x0 + x1) / 2;
      const pz = isXRun ? (z0 + z1) / 2 : THREE.MathUtils.lerp(z0, z1, t);
      root.add(box({
        size: [0.045, railH, 0.045], pos: [px, y0 + railH / 2, pz], mat: M_CHROME, name: `${tag}-baluster`,
      }));
    }
    return solid(x0, x1, y0, y0 + railH + 0.1, z0, z1);
  }

  /** A dining/boardroom-style chair (flat blocks -- Motel/Grounds' idiom). */
  function makeChair(x, y, z, yaw, seatMat) {
    const g = new THREE.Group();
    g.add(box({ size: [0.5, 0.06, 0.5], pos: [0, 0.46, 0], mat: seatMat, name: 'chair-seat' }));
    g.add(box({ size: [0.46, 0.5, 0.06], pos: [0, 0.71, -0.22], mat: seatMat, name: 'chair-back' }));
    g.add(box({ size: [0.42, 0.42, 0.42], pos: [0, 0.21, 0], mat: M_WOOD_DK, name: 'chair-base' }));
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    solid(x - 0.28, x + 0.28, y, y + 0.95, z - 0.28, z + 0.28);
    return g;
  }

  /** A closed, wall-mounted glass display case with a vague dark silhouette. */
  function makeDisplayCase(x, y, z, rotY, w, h, d, contents) {
    const g = new THREE.Group();
    g.add(box({ size: [w, h, 0.05], pos: [0, h / 2, -d / 2 + 0.025], mat: M_WOOD_DK, name: 'case-back' }));
    g.add(box({ size: [0.06, h, d], pos: [-w / 2 + 0.03, h / 2, 0], mat: M_WOOD_DK }));
    g.add(box({ size: [0.06, h, d], pos: [w / 2 - 0.03, h / 2, 0], mat: M_WOOD_DK }));
    g.add(box({ size: [w, 0.06, d], pos: [0, h - 0.03, 0], mat: M_WOOD_DK }));
    g.add(box({ size: [w, 0.06, d], pos: [0, 0.03, 0], mat: M_WOOD_DK }));
    const glass = box({
      size: [w - 0.12, h - 0.12, 0.03], pos: [0, h / 2, d / 2 - 0.03], mat: M_GLASS_CASE, name: 'case-glass',
    });
    g.add(glass);
    contents?.(g, w, h, d);
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    root.add(g);
    // Collider in world space (case is shallow but still a real obstacle).
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const hx = (cos * w + sin * d) / 2;
    const hz = (sin * w + cos * d) / 2;
    solid(x - hx, x + hx, y, y + h, z - hz, z + hz);
    return g;
  }

  /** A small pedestal statue -- the fountain's tiered-basin idiom, scaled
   * down: a low base, a riser, and a stacked-box heroic figure on top. */
  function buildSmallStatue(x, z, floorY, hue = M_SILVER) {
    const g = new THREE.Group();
    g.add(cylinder({ r: 0.5, h: 0.15, pos: [0, 0.075, 0], mat: M_MARBLE_DK }));
    g.add(cylinder({ r: 0.32, h: 0.55, pos: [0, 0.15 + 0.275, 0], mat: M_MARBLE }));
    const figY = 0.15 + 0.55;
    g.add(box({ size: [0.42, 0.42, 0.3], pos: [0, figY + 0.21, 0], mat: hue })); // legs/base
    g.add(box({ size: [0.5, 0.42, 0.34], pos: [0, figY + 0.62, 0], mat: hue })); // torso
    g.add(box({
      size: [0.16, 0.36, 0.16], pos: [-0.22, figY + 0.85, 0], mat: hue, rotZ: -0.6,
    })); // raised arm
    g.add(box({
      size: [0.16, 0.32, 0.16], pos: [0.2, figY + 0.55, 0], mat: hue, rotZ: 0.2,
    })); // lowered arm
    g.add(box({ size: [0.22, 0.22, 0.22], pos: [0, figY + 1.02, 0], mat: hue })); // head
    g.position.set(x, floorY, z);
    root.add(g);
    solid(x - 0.5, x + 0.5, floorY, floorY + 1.65, z - 0.5, z + 0.5);
    return g;
  }

  /* ================================================================== */
  /* Interior partition walls                                            */
  /*                                                                      */
  /* One wall plane at x=-4 (hall|living downstairs, hall|office upstairs)*/
  /* and its mirror at x=4 (hall|boardroom, hall|trophy), each run z:41-58*/
  /* full height GY..UCY, with two archway gaps: a wide ground-floor one  */
  /* (z:44-48, a grand opening between the hall and the sunken^H^H^H^H^H  */
  /* living room / boardroom -- see the deviation note below) and a       */
  /* standard doorway-height one upstairs (z:50-54, into the office/       */
  /* trophy room). Plus the boardroom|kitchen wall at z=58 and the north  */
  /* "dead space" caps that seal off the building's unused interior       */
  /* volume behind the named rooms (Phase 1's shell still fully encloses  */
  /* that volume -- it's just not a room the brief asked for).            */
  /* ================================================================== */
  const ARCH_TOP = GY + 3.2; // 4.4 -- grand ground-floor archway height
  const DOOR_Y0 = UY; // upstairs doorway sill
  const DOOR_TOP = UY + 2.4; // 8.4 -- upstairs doorway height

  function partitionWall(xFixed, tag) {
    const x0 = xFixed - WALL_T / 2;
    const x1 = xFixed + WALL_T / 2;
    wallSeg(x0, x1, GY, UCY, 41, 44, M_WALL, `${tag}-pier-s`);
    wallSeg(x0, x1, ARCH_TOP, UCY, 44, 48, M_WALL, `${tag}-lintel-ground`);
    wallSeg(x0, x1, GY, UCY, 48, 50, M_WALL, `${tag}-pier-mid`);
    wallSeg(x0, x1, GY, DOOR_Y0, 50, 54, M_WALL, `${tag}-base-upper`);
    wallSeg(x0, x1, DOOR_TOP, UCY, 50, 54, M_WALL, `${tag}-header-upper`);
    wallSeg(x0, x1, GY, UCY, 54, 58, M_WALL, `${tag}-pier-n`);
  }
  partitionWall(-4, 'hall-living');
  partitionWall(4, 'hall-boardroom');

  // Dead-space caps: close off the building volume the brief didn't ask for
  // a room in, instead of leaving it as an unfurnished void reachable by foot.
  wallSeg(-4, 4, GY, UCY, 58 - WALL_T / 2, 58 + WALL_T / 2, M_WALL, 'hall-north-cap');
  wallSeg(-16, -4, GY, UCY, 58 - WALL_T / 2, 58 + WALL_T / 2, M_WALL, 'living-north-cap');
  wallSeg(-16, -4, UY, UCY, 55 - WALL_T / 2, 55 + WALL_T / 2, M_WALL, 'office-north-cap');
  wallSeg(4, 16, UY, UCY, 55 - WALL_T / 2, 55 + WALL_T / 2, M_WALL, 'trophy-north-cap');
  wallSeg(4, 16, GY, UCY, 70 - WALL_T / 2, 70 + WALL_T / 2, M_WALL, 'kitchen-north-cap');
  wallSeg(4 - WALL_T / 2, 4 + WALL_T / 2, GY, UCY, 58, 70, M_WALL, 'kitchen-west-wall');

  // Boardroom | kitchen divider, z=58, with a doorway gap at x:8-12.
  {
    const z0 = 58 - WALL_T / 2;
    const z1 = 58 + WALL_T / 2;
    wallSeg(4, 8, GY, UCY, z0, z1, M_WALL, 'boardroom-kitchen-pier-w');
    wallSeg(8, 12, GY + 2.6, UCY, z0, z1, M_WALL, 'boardroom-kitchen-lintel');
    wallSeg(12, 16, GY, UCY, z0, z1, M_WALL, 'boardroom-kitchen-pier-e');
  }

  const doors = {
    hallToLiving: {
      x: -4, y: GY, z: 46, x0: -4.15, x1: -3.85, y0: GY, y1: ARCH_TOP, z0: 44, z1: 48, open: true,
    },
    hallToBoardroom: {
      x: 4, y: GY, z: 46, x0: 3.85, x1: 4.15, y0: GY, y1: ARCH_TOP, z0: 44, z1: 48, open: true,
    },
    boardroomToKitchen: {
      x: 10, y: GY, z: 58, x0: 8, x1: 12, y0: GY, y1: GY + 2.6, z0: 57.85, z1: 58.15, open: true,
    },
    officeEntry: {
      x: -4, y: UY, z: 52, x0: -4.15, x1: -3.85, y0: DOOR_Y0, y1: DOOR_TOP, z0: 50, z1: 54, open: true,
    },
    trophyEntry: {
      x: 4, y: UY, z: 52, x0: 3.85, x1: 4.15, y0: DOOR_Y0, y1: DOOR_TOP, z0: 50, z1: 54, open: true,
    },
  };

  /* ================================================================== */
  /* Central hall: marble floor, grand + basement staircases, chandelier, */
  /* balcony, oculus railings, entry statues.                             */
  /* ================================================================== */
  function buildHall() {
    // Marble floor -- the front strip and the centre strip between the two
    // stair shafts. (The atrium footprint was left fully open by Phase 1;
    // this is genuinely new floor, not a topping over an existing slab.)
    root.add(box({
      size: [HALL.x1 - HALL.x0 - WALL_T * 2, 0.1, 43 - HALL.z0], pos: [0, GY - 0.05, (HALL.z0 + 43) / 2], mat: M_MARBLE, name: 'hall-floor-front',
    }));
    root.add(box({
      size: [3, 0.1, GRAND_STAIR.z1 - 43], pos: [0, GY - 0.05, (43 + GRAND_STAIR.z1) / 2], mat: M_MARBLE, name: 'hall-floor-center',
    }));
    // Marble continuation over Phase 1's already-solid corridor slab (49-58).
    topping(HALL.x0, HALL.x1, GY + 0.01, 49, 58, M_MARBLE, 'hall-floor-corridor-topping');

    // Grand staircase: ground -> upper, rising as z increases (Motel's
    // lerp-stepped technique). Open edge (x1, facing the oculus) gets a
    // stringer + chrome railing; the wall-side edge (x0) is already solid.
    const gsSteps = 20;
    for (let i = 0; i < gsSteps; i++) {
      const t = i / gsSteps;
      const z = THREE.MathUtils.lerp(GRAND_STAIR.z0, GRAND_STAIR.z1, t);
      const y = THREE.MathUtils.lerp(GY, UY, t);
      const depth = (GRAND_STAIR.z1 - GRAND_STAIR.z0) / gsSteps + 0.04;
      root.add(box({
        size: [GRAND_STAIR.x1 - GRAND_STAIR.x0, 0.16, depth], pos: [(GRAND_STAIR.x0 + GRAND_STAIR.x1) / 2, y + 0.08, z], mat: M_MARBLE_DK, name: 'grand-stair-tread',
      }));
    }
    solid(GRAND_STAIR.x1, GRAND_STAIR.x1 + 0.15, GY - 0.1, UY + 0.5, GRAND_STAIR.z0, GRAND_STAIR.z1);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      root.add(box({
        size: [0.05, 0.9, 0.05],
        pos: [GRAND_STAIR.x1, THREE.MathUtils.lerp(GY, UY, t) + 0.5, THREE.MathUtils.lerp(GRAND_STAIR.z0, GRAND_STAIR.z1, t)],
        mat: M_CHROME,
        name: 'grand-stair-rail-post',
      }));
    }

    // Basement staircase: ground -> basement, mirroring the grand stair.
    const bsSteps = 20;
    for (let i = 0; i < bsSteps; i++) {
      const t = i / bsSteps;
      const z = THREE.MathUtils.lerp(BASEMENT_STAIR.z0, BASEMENT_STAIR.z1, t);
      const y = THREE.MathUtils.lerp(GY, BY, t);
      const depth = (BASEMENT_STAIR.z1 - BASEMENT_STAIR.z0) / bsSteps + 0.04;
      root.add(box({
        size: [BASEMENT_STAIR.x1 - BASEMENT_STAIR.x0, 0.16, depth], pos: [(BASEMENT_STAIR.x0 + BASEMENT_STAIR.x1) / 2, y + 0.08, z], mat: M_MARBLE_DK, name: 'basement-stair-tread',
      }));
    }
    solid(BASEMENT_STAIR.x0 - 0.15, BASEMENT_STAIR.x0, BY - 0.1, GY + 0.5, BASEMENT_STAIR.z0, BASEMENT_STAIR.z1);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      root.add(box({
        size: [0.05, 0.9, 0.05],
        pos: [BASEMENT_STAIR.x0, THREE.MathUtils.lerp(GY, BY, t) + 0.6, THREE.MathUtils.lerp(BASEMENT_STAIR.z0, BASEMENT_STAIR.z1, t)],
        mat: M_CHROME,
        name: 'basement-stair-rail-post',
      }));
    }

    // Upper balcony: cantilevered over the void, directly above the
    // basement-stair shaft, connecting seamlessly to Phase 1's real
    // upper-floor slab at z=49. Railed on its south (brief: "around z=43")
    // and west (oculus) edges.
    root.add(box({
      size: [BALCONY.x1 - BALCONY.x0, 0.2, BALCONY.z1 - BALCONY.z0], pos: [(BALCONY.x0 + BALCONY.x1) / 2, UY - 0.1, (BALCONY.z0 + BALCONY.z1) / 2], mat: M_MARBLE, name: 'balcony-floor',
    }));
    railing(BALCONY.x0, BALCONY.x1, BALCONY.z0 - 0.03, BALCONY.z0 + 0.03, UY, 'balcony-south');
    railing(BALCONY.x0 - 0.03, BALCONY.x0 + 0.03, BALCONY.z0, BALCONY.z1, UY, 'balcony-west');
    // Oculus north edge: where Phase 1's real slab (z>=49) meets the void.
    railing(OCULUS.x0, OCULUS.x1, 49 - 0.03, 49 + 0.03, UY, 'oculus-north');

    // Chandelier: tiered rings of small emissive "bulbs" + dangling crystal
    // droplets, hanging in the open oculus so it reads from both floors.
    const cp = CHANDELIER_POS;
    const chandelier = new THREE.Group();
    chandelier.add(cylinder({ r: 0.04, h: 0.8, pos: [0, 0.4, 0], mat: M_BRONZE })); // rod from the roof
    const tiers = [
      { y: 0, r: 1.05, bulbs: 8, arm: 0.18 },
      { y: -0.32, r: 0.7, bulbs: 6, arm: 0.14 },
      { y: -0.58, r: 0.32, bulbs: 4, arm: 0.1 },
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
          size: [0.02, 0.22, 0.02], pos: [bx * 0.85, tier.y - 0.2, bz * 0.85], mat: M_CRYSTAL,
        }));
      }
    }
    chandelier.add(sphere({ r: 0.12, pos: [0, -0.75, 0], mat: M_GOLD }));
    chandelier.position.set(cp.x, cp.y, cp.z);
    root.add(chandelier);
    const chandelierLight = new THREE.PointLight(0xffd9a0, 7, 22, 2);
    chandelierLight.position.set(cp.x, cp.y - 0.3, cp.z);
    root.add(chandelierLight);

    // Roof-wash light -- the double-height atrium's roof underside (the
    // single most prominent ceiling in the house) still read solid black
    // even directly above the chandelier: a PointLight aimed downward at
    // the hall floor doesn't meaningfully light the surface behind/above
    // itself. This one sits close to the roof instead (measured: a real
    // PointLight within ~1m of a surface lights it properly; a global
    // ambient/hemisphere bump does not, at any intensity that doesn't also
    // blow out the rest of the scene -- see main.js's note on this).
    const roofWashLight = new THREE.PointLight(0xfff3d8, 9, 13, 2);
    roofWashLight.position.set(cp.x, UCY - 0.5, cp.z);
    root.add(roofWashLight);

    // Two small statues flanking the entry.
    buildSmallStatue(-2.8, 42, GY, M_SILVER);
    buildSmallStatue(2.8, 42, GY, M_SILVER);

    return { chandelier, chandelierLight };
  }
  const hallProps = buildHall();

  /* ================================================================== */
  /* Sunken living room                                                   */
  /*                                                                      */
  /* DEVIATION (flagged): the brief asks for a floor genuinely recessed   */
  /* ~0.4 m below GROUND_Y with steps down. Reading the real shell showed  */
  /* Phase 1 already poured a *solid* podium box (y:0..GROUND_Y, fully    */
  /* opaque, no notch) across this entire footprint as part of the        */
  /* building's foundation slab. A floor mesh at GROUND_Y-0.4 would sit    */
  /* *inside* that opaque volume: Phase 1's podium top face is closer to   */
  /* the camera than anything I could put below it, so a genuine recess    */
  /* would be completely invisible/occluded, and any furniture placed at   */
  /* the recessed height would render as if partly buried in solid stone.  */
  /* I'm not permitted to edit MansionGrounds.js, so rather than build      */
  /* something that renders broken, I kept the living room floor flush at  */
  /* GROUND_Y (same level as the hall/podium top) and built the "sunken     */
  /* lounge" feel purely through furniture staging (couches + rug + coffee */
  /* table, no false steps). Everything else in this room is as specified. */
  /* ================================================================== */
  function buildLivingRoom() {
    const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4.2), M_RUG_LIVING);
    rugMesh.rotation.x = -Math.PI / 2;
    rugMesh.position.set(-10, GY + 0.01, 47.5);
    root.add(rugMesh);

    function makeCouch(x, z, yaw, len = 2.3) {
      const g = new THREE.Group();
      g.add(box({ size: [len, 0.45, 0.9], pos: [0, 0.3, 0], mat: M_FABRIC_COUCH, name: 'couch-base' }));
      g.add(box({
        size: [len, 0.55, 0.18], pos: [0, 0.68, -0.36], mat: M_FABRIC_COUCH, name: 'couch-back',
      }));
      g.add(box({ size: [0.18, 0.35, 0.9], pos: [-len / 2 + 0.09, 0.55, 0], mat: M_LEATHER_RED }));
      g.add(box({ size: [0.18, 0.35, 0.9], pos: [len / 2 - 0.09, 0.55, 0], mat: M_LEATHER_RED }));
      g.position.set(x, GY, z);
      g.rotation.y = yaw;
      root.add(g);
      const hx = Math.abs(Math.cos(yaw)) * len / 2 + Math.abs(Math.sin(yaw)) * 0.5;
      const hz = Math.abs(Math.sin(yaw)) * len / 2 + Math.abs(Math.cos(yaw)) * 0.5;
      solid(x - hx, x + hx, GY, GY + 0.95, z - hz, z + hz);
      return g;
    }
    makeCouch(-10, 45.6, 0);
    makeCouch(-12.3, 47.9, Math.PI / 2, 2.0);
    makeCouch(-7.7, 47.9, -Math.PI / 2, 2.0);

    // A handful of throw pillows -- small, slightly cocked boxes in a
    // contrasting fabric, tossed against each couch's back cushion. Purely
    // decorative (no collider): this room read as the barest-dressed public
    // room in the house with nothing softening its flat couch boxes.
    const M_PILLOW_GOLD = mat({ map: fabricTex('#c9a13a'), roughness: 0.85 });
    const M_PILLOW_CREAM = mat({ map: fabricTex('#e8ddc4'), roughness: 0.85 });
    const pillows = [
      [-10.75, GY + 0.62, 45.78, 0.32, M_PILLOW_GOLD],
      [-9.25, GY + 0.62, 45.78, -0.22, M_PILLOW_CREAM],
      [-12.3, GY + 0.62, 47.55, Math.PI / 2 + 0.28, M_PILLOW_CREAM],
      [-7.7, GY + 0.62, 48.25, -Math.PI / 2 - 0.24, M_PILLOW_GOLD],
    ];
    for (const [px, py, pz, yaw, pmat] of pillows) {
      root.add(box({
        size: [0.32, 0.24, 0.32], pos: [px, py, pz], mat: pmat, rotY: yaw, rotX: 0.14, rotZ: 0.1, name: 'living-pillow',
      }));
    }

    // Wall-hung family art on the (bare, solid) west wall -- reuses
    // bing/kit.js's squatchArt(), the same drawn-silhouette-plus-lettering
    // idiom already used for the trophy room's championship banner, so the
    // family crest reads consistently everywhere it appears in the house.
    const artTex = squatchArt('mansion-living-art', {
      title: ['THE SILVER', 'SASQUATCHES'], footer: 'FAMILY, FIRST', ink: '#c8a24a', bg: '#20161a',
    });
    root.add(box({
      size: [0.05, 2.15, 1.7], pos: [-15.93, GY + 2.0, 53], mat: M_WOOD_DK, name: 'living-art-frame',
    }));
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 1.95),
      mat({ map: artTex, roughness: 0.85, unique: true }),
    );
    art.rotation.y = Math.PI / 2;
    art.position.set(-15.88, GY + 2.0, 53);
    root.add(art);

    // Drape panels flanking the south glass wall -- the window itself stays
    // clear (it's Phase 1's real glazing), but a curtain panel at each edge
    // gives the room a dressed, lived-in south wall instead of bare glass.
    for (const cx of [-15.6, -4.4]) {
      root.add(box({
        size: [0.3, 3.5, 0.08], pos: [cx, GY + 1.9, 41.35], mat: M_CURTAIN, name: 'living-curtain',
      }));
      root.add(box({
        size: [0.42, 0.1, 0.1], pos: [cx, GY + 3.68, 41.35], mat: M_WOOD_DK, name: 'living-curtain-rod',
      }));
    }

    const table = box({
      size: [1.6, 0.4, 0.9], pos: [-10, GY + 0.2, 47.5], mat: M_MARBLE, name: 'living-coffee-table',
    });
    root.add(table);
    solid(-10.8, -9.2, GY, GY + 0.4, 47.05, 47.95);

    buildSmallStatue(-14, 44, GY, M_BRONZE);

    // A floor lamp, warm and low-key -- the room's only real point light
    // besides window spill (which Phase 1 already provides from outside).
    const lampLight = new THREE.PointLight(0xffc98a, 3.2, 12, 2);
    lampLight.position.set(-14.5, 2.4, 55);
    root.add(lampLight);
    root.add(cylinder({
      r: 0.05, h: 2.1, pos: [-14.5, GY + 1.05, 55], mat: M_WOOD_DK,
    }));
    root.add(cylinder({
      rTop: 0.32, rBottom: 0.22, h: 0.4, pos: [-14.5, GY + 2.3, 55], mat: mat({ color: 0xe8d9a8, emissive: 0x6a5a20, roughness: 0.6 }),
    }));

    return { rug: rugMesh, table };
  }
  const livingProps = buildLivingRoom();

  /* ================================================================== */
  /* Boardroom: long table, 16 chairs + name cards, podium + gavel,       */
  /* projector screen.                                                   */
  /* ================================================================== */
  function buildBoardroom() {
    const tableX = 10;
    const tableZ0 = 44;
    const tableZ1 = 51;
    root.add(box({
      size: [1.8, 0.08, tableZ1 - tableZ0], pos: [tableX, GY + 0.78, (tableZ0 + tableZ1) / 2], mat: M_WOOD_DK, name: 'boardroom-table',
    }));
    for (const sx of [-0.8, 0.8]) {
      for (const sz of [tableZ0 + 0.3, tableZ1 - 0.3]) {
        root.add(box({
          size: [0.1, 0.78, 0.1], pos: [tableX + sx, GY + 0.39, sz], mat: M_WOOD_DK,
        }));
      }
    }
    solid(tableX - 0.9, tableX + 0.9, GY, GY + 0.82, tableZ0, tableZ1);

    const chairs = [];
    for (let i = 0; i < 7; i++) {
      const z = 44.5 + i;
      chairs.push(makeChair(tableX - 1.5, GY, z, Math.PI / 2, M_FABRIC_CHAIR));
      chairs.push(makeChair(tableX + 1.5, GY, z, -Math.PI / 2, M_FABRIC_CHAIR));
    }
    chairs.push(makeChair(tableX, GY, 43, 0, M_FABRIC_CHAIR));
    chairs.push(makeChair(tableX, GY, 52.2, Math.PI, M_FABRIC_CHAIR));

    // Small name-card details, in front of every seat.
    for (let i = 0; i < 7; i++) {
      const z = 44.5 + i;
      root.add(box({
        size: [0.16, 0.02, 0.09], pos: [tableX - 0.85, GY + 0.83, z], mat: M_CARD, rotX: -0.15,
      }));
      root.add(box({
        size: [0.16, 0.02, 0.09], pos: [tableX + 0.85, GY + 0.83, z], mat: M_CARD, rotX: -0.15,
      }));
    }

    // Podium + gavel, off to the side near the screen.
    const podium = group('podium',
      box({ size: [0.7, 1.1, 0.5], pos: [0, 0.55, 0], mat: M_WOOD_DK }),
      box({
        size: [0.75, 0.08, 0.55], pos: [0, 1.12, 0.02], mat: M_WOOD_DK, rotX: -0.12,
      }));
    podium.position.set(7, GY, 55.3);
    root.add(podium);
    solid(6.6, 7.4, GY, GY + 1.15, 55.05, 55.55);
    root.add(cylinder({
      r: 0.02, h: 0.28, pos: [7, GY + 1.2, 55.15], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    root.add(cylinder({ r: 0.05, h: 0.16, pos: [7.16, GY + 1.2, 55.15], mat: M_SILVER, rotX: Math.PI / 2 }));

    // Projector screen, north wall, four lines exactly as specified.
    const screenTex = makeProjectorScreenTexture();
    const screenMat = mat({
      map: screenTex, roughness: 0.7, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.55, unique: true,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), screenMat);
    screen.rotation.y = Math.PI;
    screen.position.set(tableX, GY + 3.0, 57.8);
    root.add(screen);
    root.add(box({
      size: [6.3, 3.5, 0.06], pos: [tableX, GY + 3.0, 57.9], mat: M_WOOD_DK, name: 'screen-bezel',
    }));

    // Ceiling fixture over the table -- previously this room had NO light
    // source of its own at all (only window spill + the projector screen's
    // own glow), which left every chair a black silhouette. A small
    // 4-bulb chandelier-lite, echoing the hall's real chandelier in miniature
    // (rod + gold arms + warm bulbs) rather than a plain pendant, hangs
    // above the table's centre.
    const centerZ = (tableZ0 + tableZ1) / 2;
    const rodTop = UY - 0.1;
    const rodBottom = rodTop - 0.55;
    root.add(cylinder({
      r: 0.03, h: rodTop - rodBottom, pos: [tableX, (rodTop + rodBottom) / 2, centerZ], mat: M_GOLD,
    }));
    for (const [ox, oz] of [[-0.55, 0], [0.55, 0], [0, -0.55], [0, 0.55]]) {
      root.add(box({
        size: ox === 0 ? [0.03, 0.03, Math.abs(oz)] : [Math.abs(ox), 0.03, 0.03],
        pos: [tableX + ox / 2, rodBottom, centerZ + oz / 2],
        mat: M_GOLD,
      }));
      root.add(sphere({ r: 0.08, pos: [tableX + ox, rodBottom - 0.06, centerZ + oz], mat: M_BULB_WARM }));
    }
    const boardroomLight = new THREE.PointLight(0xffdba0, 6.5, 17, 2);
    boardroomLight.position.set(tableX, rodBottom - 0.15, centerZ);
    root.add(boardroomLight);

    return {
      table: { x: tableX, z0: tableZ0, z1: tableZ1 }, chairs, podium, screen, ceilingLight: boardroomLight,
    };
  }
  const boardroomProps = buildBoardroom();

  /* ================================================================== */
  /* Kitchen + service corridor                                          */
  /* ================================================================== */
  function buildKitchen() {
    const island = box({
      size: [3.0, 0.9, 1.4], pos: [9, GY + 0.45, 62], mat: M_STEEL, name: 'kitchen-island',
    });
    root.add(island);
    solid(7.5, 10.5, GY, GY + 0.9, 61.3, 62.7);

    const stove = box({
      size: [1.4, 0.95, 0.8], pos: [5.2, GY + 0.475, 68.4], mat: M_STOVE_BLACK, name: 'stove',
    });
    root.add(stove);
    for (const [ox, oz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) {
      root.add(cylinder({
        r: 0.14, h: 0.02, pos: [5.2 + ox, GY + 0.96, 68.4 + oz], mat: M_STOVE_BLACK,
      }));
    }
    solid(4.5, 5.9, GY, GY + 0.95, 68.0, 68.8);

    // Pot rack, hung well above head height -- no collider needed.
    const rackY = GY + 3.4;
    root.add(box({ size: [2.6, 0.05, 0.05], pos: [9, rackY, 62], mat: M_RACK }));
    for (const sx of [-1.1, -0.4, 0.4, 1.1]) {
      root.add(cylinder({ r: 0.01, h: 0.32, pos: [9 + sx, rackY - 0.16, 62], mat: M_RACK }));
      root.add(cylinder({
        rTop: 0.14, rBottom: 0.16, h: 0.16, pos: [9 + sx, rackY - 0.36, 62], mat: M_POT,
      }));
    }

    // Ceiling lighting -- this room previously had NO light fixture at all
    // (genuinely pitch black, per the review). A row of 3 recessed can
    // lights along the room's centreline, rather than a single pendant,
    // keeps clear of the pot rack hanging just below the ceiling and lights
    // the island/stove/corridor spread evenly end to end.
    const canY = UY - 0.12;
    const kitchenLights = [];
    for (const [px, pz] of [[7, 61], [10, 64], [13, 67.5]]) {
      root.add(cylinder({
        r: 0.16, h: 0.05, pos: [px, canY, pz], mat: mat({ color: 0x1c1c1e, roughness: 0.5 }),
      }));
      root.add(cylinder({
        r: 0.12, h: 0.02, pos: [px, canY - 0.03, pz], mat: M_BULB_WARM,
      }));
      const l = new THREE.PointLight(0xffe9c4, 4.4, 12, 2);
      l.position.set(px, canY - 0.12, pz);
      root.add(l);
      kitchenLights.push(l);
    }

    return {
      island, stove, ceilingLights: kitchenLights,
    };
  }
  const kitchenProps = buildKitchen();

  /* ================================================================== */
  /* Lou's office (upper floor, west wing)                                */
  /* ================================================================== */
  function buildOffice() {
    const desk = group('lou-desk',
      box({ size: [2.0, 0.08, 0.9], pos: [0, 0.78, 0], mat: M_WOOD_DK }),
      box({ size: [1.9, 0.7, 0.06], pos: [0.5, 0.4, -0.4], mat: M_WOOD_DK }),
      box({ size: [0.08, 0.78, 0.86], pos: [-0.94, 0.39, 0], mat: M_WOOD_DK }));
    desk.position.set(-9, UY, 48);
    desk.rotation.y = Math.PI / 2; // front (visitor side, +x) faces the archway at x=-4
    root.add(desk);
    solid(-9.5, -8.5, UY, UY + 0.85, 47.1, 48.9);

    makeChair(-9, UY, 47.3, Math.PI, M_LEATHER_DK);

    makeDisplayCase(-15.6, UY, 48, Math.PI / 2, 1.8, 2.1, 0.5, (g, w, h) => {
      // A deliberately vague dark silhouette -- no specific weapon shape.
      g.add(box({
        size: [w * 0.35, h * 0.55, 0.18], pos: [0, h * 0.32, 0], mat: M_SILHOUETTE,
      }));
      g.add(box({
        size: [w * 0.16, h * 0.2, 0.14], pos: [0, h * 0.65, 0], mat: M_SILHOUETTE,
      }));
    });

    // Modest bookcase along the side wall, for a lived-in touch.
    root.add(box({
      size: [0.35, 2.2, 2.4], pos: [-15.6, UY + 1.1, 44], mat: M_WOOD_DK, name: 'office-bookcase',
    }));
    solid(-15.8, -15.4, UY, UY + 2.2, 42.8, 45.2);

    const deskLight = new THREE.PointLight(0xffd9a0, 2.2, 9, 2);
    deskLight.position.set(-9, UY + 1.1, 48);
    root.add(deskLight);

    // A real ceiling fixture, not just the desk lamp -- this office was
    // single-source-lit and read very dark away from the desk itself. A
    // simple flush ceiling mount + bulb, centred over the room.
    const ceilingY = UCY - 0.15;
    root.add(cylinder({
      rTop: 0.22, rBottom: 0.26, h: 0.1, pos: [-10, ceilingY, 49], mat: mat({ color: 0x2a2118, roughness: 0.6 }),
    }));
    root.add(sphere({ r: 0.09, pos: [-10, ceilingY - 0.1, 49], mat: M_BULB_WARM }));
    const officeCeilingLight = new THREE.PointLight(0xffdca0, 4.6, 13, 2);
    officeCeilingLight.position.set(-10, ceilingY - 0.18, 49);
    root.add(officeCeilingLight);

    return { desk, deskLight, ceilingLight: officeCeilingLight };
  }
  const officeProps = buildOffice();

  /* ================================================================== */
  /* Trophy room (upper floor, east wing)                                 */
  /* ================================================================== */
  function buildTrophyRoom() {
    const cases = [];
    function trophies(g, w, h) {
      for (const ox of [-w / 4, 0, w / 4]) {
        g.add(cylinder({
          r: 0.09, h: 0.25, pos: [ox, h * 0.28, 0], mat: M_TROPHY_CUP,
        }));
        g.add(sphere({ r: 0.1, pos: [ox, h * 0.28 + 0.16, 0], mat: M_TROPHY_CUP }));
      }
    }
    cases.push(makeDisplayCase(15.6, UY, 44, -Math.PI / 2, 1.6, 1.8, 0.45, trophies));
    cases.push(makeDisplayCase(15.6, UY, 47.5, -Math.PI / 2, 1.6, 1.8, 0.45, trophies));
    cases.push(makeDisplayCase(6, UY, 41.4, 0, 1.8, 2.0, 0.4, (g, w, h) => {
      // Framed jersey shape.
      g.add(box({ size: [w * 0.7, h * 0.6, 0.05], pos: [0, h * 0.5, 0], mat: M_JERSEY }));
      g.add(box({ size: [w * 0.7 + 0.06, 0.05, 0.08], pos: [0, h * 0.5 + h * 0.3, 0], mat: M_GOLD }));
    }));

    // Display-case interior lights -- this room was single-source-lit (only
    // whatever spilled in from elsewhere) and read very dark. A small warm
    // point light just inside each case's glass front (offset along the
    // case's own local +z, i.e. rotated the same way the case itself is)
    // makes the trophies/jersey actually pop instead of sitting in shadow.
    const caseLights = [];
    for (const c of [
      { x: 15.6, z: 44, rotY: -Math.PI / 2 }, { x: 15.6, z: 47.5, rotY: -Math.PI / 2 }, { x: 6, z: 41.4, rotY: 0 },
    ]) {
      const dx = Math.sin(c.rotY) * 0.3;
      const dz = Math.cos(c.rotY) * 0.3;
      const cl = new THREE.PointLight(0xfff2d8, 1.8, 3.6, 2);
      cl.position.set(c.x + dx, UY + 1.05, c.z + dz);
      root.add(cl);
      caseLights.push(cl);
    }

    // General ceiling fixture -- the cases give the trophies their own pop,
    // but the room itself (chairs' worth of open floor, the banner) still
    // wants one practical overhead light rather than depending purely on
    // spill.
    const ceilingY = UCY - 0.15;
    root.add(cylinder({
      rTop: 0.22, rBottom: 0.26, h: 0.1, pos: [10, ceilingY, 48], mat: mat({ color: 0x2a2118, roughness: 0.6 }),
    }));
    root.add(sphere({ r: 0.09, pos: [10, ceilingY - 0.1, 48], mat: M_BULB_WARM }));
    const trophyCeilingLight = new THREE.PointLight(0xffdca0, 5, 15, 2);
    trophyCeilingLight.position.set(10, ceilingY - 0.18, 48);
    root.add(trophyCeilingLight);

    // Championship-banner-look wall hanging.
    const bannerTex = makeBannerTexture();
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 3.2),
      mat({ map: bannerTex, roughness: 0.9, unique: true }),
    );
    banner.rotation.y = -Math.PI / 2;
    banner.position.set(15.6, UY + 3.7, 51);
    root.add(banner);
    root.add(cylinder({
      r: 0.03, h: 1.7, pos: [15.6, UY + 5.2, 51], mat: M_GOLD, rotZ: Math.PI / 2,
    }));

    return {
      cases, banner, caseLights, ceilingLight: trophyCeilingLight,
    };
  }
  const trophyProps = buildTrophyRoom();

  /* ================================================================== */
  /* Basement armory (below the central hall)                            */
  /* ================================================================== */
  function buildBasement() {
    const wallTopY = GY - 0.15; // Phase 1's BASEMENT_WALL_TOP, read back here for the panels below

    /* -------------------------------------------------------------- */
    /* 1. Wall racks -- rebuilt with a mounting backplate plus a few    */
    /* simple weapon-silhouette shapes hung/leaned against them, instead */
    /* of just a bar and two legs. Abstract/silhouette-level set        */
    /* dressing only (M_SILHOUETTE, the same material the office's own  */
    /* "vague dark silhouette" display case already uses) -- no working  */
    /* weapons/pickups, per the mission brief.                           */
    /* -------------------------------------------------------------- */
    function wallRack(x, z, rotY) {
      const g = group('wall-rack',
        box({
          size: [1.55, 1.45, 0.05], pos: [0, -0.12, -0.07], mat: M_RACK_BACK, name: 'rack-backplate',
        }),
        box({ size: [1.4, 0.06, 0.06], pos: [0, 0, 0], mat: M_RACK }),
        box({ size: [0.06, 0.5, 0.06], pos: [-0.6, -0.25, 0], mat: M_RACK }),
        box({ size: [0.06, 0.5, 0.06], pos: [0.6, -0.25, 0], mat: M_RACK }));

      // Two long rifle-shaped silhouettes, mounted vertically against the
      // backplate with a small strap/clip pinning each to the bar.
      for (const rx of [-0.38, 0.12]) {
        g.add(cylinder({
          rTop: 0.03, rBottom: 0.045, h: 1.05, pos: [rx, -0.22, 0.03], mat: M_SILHOUETTE,
        }));
        g.add(box({ size: [0.15, 0.05, 0.05], pos: [rx, 0.02, 0.05], mat: M_RACK }));
      }
      // Two smaller pistol-shaped silhouettes (grip + barrel, L-profile)
      // hung near the rack's outer edges.
      for (const px of [-0.62, 0.62]) {
        const barrelX = px + (px < 0 ? 0.09 : -0.09);
        g.add(box({ size: [0.05, 0.22, 0.05], pos: [px, -0.56, 0.03], mat: M_SILHOUETTE }));
        g.add(box({ size: [0.2, 0.05, 0.05], pos: [barrelX, -0.47, 0.03], mat: M_SILHOUETTE }));
      }

      g.position.set(x, BY + 1.4, z);
      g.rotation.y = rotY;
      root.add(g);
      solid(x - 0.8, x + 0.8, BY, BY + 1.55, z - 0.15, z + 0.15);
    }
    wallRack(-3.6, 43, 0);
    wallRack(-3.6, 45.5, 0);
    wallRack(0, 41.4, Math.PI / 2);

    /* -------------------------------------------------------------- */
    /* 2. Concrete/stone wall panels -- a rougher, damper surface than   */
    /* the marble upstairs. Phase 1's real basement walls (the actual     */
    /* collider-bearing geometry) live in MansionGrounds.js's buildShell() */
    /* and are out of scope to redraw here, so this follows the exact same */
    /* "thin decorative topping over an already-solid surface" idiom       */
    /* `topping()` already uses for floors, just applied to the four       */
    /* vertical wall faces instead -- and reuses the driveway paver pass's */
    /* own `tileTex()` + `tiled()` recipe (see concreteMaterial() above)    */
    /* rather than inventing a new canvas pattern.                          */
    /*                                                                       */
    /* The basement stairwell (BASEMENT_STAIR) runs almost flush against    */
    /* the east/north walls (its treads reach x=3.85, 0.15m shy of the real  */
    /* wall at x=4), so the north and east panels are trimmed to the        */
    /* stretches actually clear of that stair rather than running the full  */
    /* wall length and clipping through the treads.                         */
    /* -------------------------------------------------------------- */
    const panelInset = 0.19;
    const panelH = wallTopY - BY;
    const panelMidY = (BY + wallTopY) / 2;
    root.add(box({
      size: [ATRIUM.x1 - ATRIUM.x0 - 0.3, panelH, 0.04],
      pos: [(ATRIUM.x0 + ATRIUM.x1) / 2, panelMidY, ATRIUM.z0 + panelInset],
      mat: concreteMaterial(ATRIUM.x1 - ATRIUM.x0, panelH),
      name: 'basement-wall-panel-south',
    }));
    root.add(box({
      size: [0.04, panelH, ATRIUM.z1 - ATRIUM.z0 - 0.3],
      pos: [ATRIUM.x0 + panelInset, panelMidY, (ATRIUM.z0 + ATRIUM.z1) / 2],
      mat: concreteMaterial(ATRIUM.z1 - ATRIUM.z0, panelH),
      name: 'basement-wall-panel-west',
    }));
    {
      const nx1 = BASEMENT_STAIR.x0 - 0.1;
      root.add(box({
        size: [nx1 - ATRIUM.x0, panelH, 0.04],
        pos: [(ATRIUM.x0 + nx1) / 2, panelMidY, ATRIUM.z1 - panelInset],
        mat: concreteMaterial(nx1 - ATRIUM.x0, panelH),
        name: 'basement-wall-panel-north',
      }));
    }
    {
      const ez1 = BASEMENT_STAIR.z0 - 0.15;
      root.add(box({
        size: [0.04, panelH, ez1 - ATRIUM.z0],
        pos: [ATRIUM.x1 - panelInset, panelMidY, (ATRIUM.z0 + ez1) / 2],
        mat: concreteMaterial(ez1 - ATRIUM.z0, panelH),
        name: 'basement-wall-panel-east',
      }));
    }

    /* -------------------------------------------------------------- */
    /* 4. Floor dressing -- a tool bench, an ammo-crate stack, and a     */
    /* floor drain, plus the original 3 crates. Nothing here beyond what */
    /* was already here changes shape/scope; this only adds more of the  */
    /* same primitive-box idiom.                                          */
    /* -------------------------------------------------------------- */
    for (const [cx, cz] of [[-2.2, 47.5], [-0.6, 47.8], [-2.4, 46]]) {
      root.add(box({
        size: [0.8, 0.6, 0.8], pos: [cx, BY + 0.3, cz], mat: M_CRATE, name: 'basement-crate',
      }));
      solid(cx - 0.4, cx + 0.4, BY, BY + 0.6, cz - 0.4, cz + 0.4);
    }

    // Tool bench: a plain table with a couple of tool-shaped boxes on top.
    function buildToolBench(bx, bz) {
      const topY = BY + 0.75;
      root.add(box({
        size: [1.3, 0.08, 0.6], pos: [bx, topY, bz], mat: M_WOOD_DK, name: 'basement-bench-top',
      }));
      for (const [lx, lz] of [[-0.55, -0.24], [0.55, -0.24], [-0.55, 0.24], [0.55, 0.24]]) {
        root.add(box({
          size: [0.06, 0.7, 0.06], pos: [bx + lx, BY + 0.35, bz + lz], mat: M_WOOD_DK,
        }));
      }
      root.add(box({
        size: [0.34, 0.07, 0.14], pos: [bx - 0.28, topY + 0.055, bz], mat: M_STEEL, name: 'bench-tool',
      }));
      root.add(box({
        size: [0.15, 0.15, 0.15], pos: [bx + 0.32, topY + 0.1, bz - 0.05], mat: M_RACK, name: 'bench-tool',
      }));
      root.add(box({
        size: [0.4, 0.05, 0.05], pos: [bx + 0.1, topY + 0.06, bz + 0.15], mat: M_STEEL, name: 'bench-tool',
      }));
      solid(bx - 0.7, bx + 0.7, BY, topY + 0.05, bz - 0.35, bz + 0.35);
    }
    // Placed south of the basement staircase (z<43, well clear of
    // BASEMENT_STAIR's x:1.5-3.85/z:43-49 descending footprint) -- the
    // stair's own tread geometry occupies that shaft, so a floor prop
    // dropped inside it would sit at the flat basement height (BY) while
    // the walkable surface there actually ramps from GY down to BY, i.e.
    // it would appear to float free of/clip through the real treads.
    buildToolBench(3.0, 42.0);

    // A small stack of ammo-box-style crates -- smaller and lighter than
    // the main storage crates, stacked two-plus-one.
    function buildAmmoStack(ax, az) {
      const base = BY;
      for (const [ox, oz, oy] of [[-0.27, 0, 0.2], [0.27, 0, 0.2], [0, 0, 0.62]]) {
        root.add(box({
          size: [0.48, 0.38, 0.48], pos: [ax + ox, base + oy, az + oz], mat: M_CRATE, name: 'basement-ammo-crate',
        }));
      }
      solid(ax - 0.55, ax + 0.55, BY, BY + 0.85, az - 0.3, az + 0.3);
    }
    // Same reasoning as the tool bench above: kept out of the stair shaft
    // and clear of the existing crate cluster/west wall panel.
    buildAmmoStack(-3.2, 42.0);

    // Floor drain: a simple dark circle decal set flush with the basement
    // floor -- cheap, primitive-based, matching this room's whole
    // construction idiom.
    const drain = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 24),
      mat({ color: 0x0a0a0c, roughness: 0.55, unique: true }),
    );
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(-3.0, BY + 0.006, 44.2);
    root.add(drain);
    const drainRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.35, 24),
      mat({ color: 0x2a2a28, roughness: 0.5, unique: true }),
    );
    drainRing.rotation.x = -Math.PI / 2;
    drainRing.position.set(-3.0, BY + 0.007, 44.2);
    root.add(drainRing);

    /* -------------------------------------------------------------- */
    /* 3. Lighting -- the single bare bulb (range 10, centred at x=-1)   */
    /* left the room's east half, plus most of the crates/racks/bench    */
    /* dressing above, in near-total black. Two more fixtures -- a wall-  */
    /* mounted work light and a flush ceiling light, for some visual      */
    /* variety instead of three identical bare bulbs -- close that gap    */
    /* so the whole 8x8m room is actually visible instead of just the     */
    /* few metres around one central bulb.                                */
    /* -------------------------------------------------------------- */
    root.add(cylinder({
      r: 0.012, h: 1.0, pos: [-1, BY + 3.4, 45], mat: M_RACK,
    }));
    root.add(sphere({ r: 0.07, pos: [-1, BY + 2.85, 45], mat: M_BULB_BARE }));
    const bulbLight = new THREE.PointLight(0xfff0c8, 5.2, 13, 2);
    bulbLight.position.set(-1, BY + 2.8, 45);
    root.add(bulbLight);

    root.add(box({
      size: [0.22, 0.16, 0.1], pos: [2.6, BY + 2.3, 48.72], mat: M_RACK, name: 'basement-sconce',
    }));
    root.add(box({
      size: [0.14, 0.1, 0.03], pos: [2.6, BY + 2.3, 48.66], mat: M_BULB_WARM,
    }));
    const workLight = new THREE.PointLight(0xffe3b0, 5.8, 15, 2);
    workLight.position.set(2.6, BY + 2.3, 48.5);
    root.add(workLight);

    // Third fixture: a flush ceiling light over the south end of the room
    // (the tool bench / ammo stack corner), the stretch furthest from both
    // fixtures above.
    root.add(cylinder({
      r: 0.16, h: 0.05, pos: [0.5, wallTopY - 0.05, 42.4], mat: mat({ color: 0x1c1c1e, roughness: 0.5 }),
    }));
    root.add(cylinder({
      r: 0.12, h: 0.02, pos: [0.5, wallTopY - 0.08, 42.4], mat: M_BULB_WARM,
    }));
    const ceilingLight = new THREE.PointLight(0xffe9c4, 5, 13, 2);
    ceilingLight.position.set(0.5, wallTopY - 0.2, 42.4);
    root.add(ceilingLight);

    return {
      bulbLight, workLight, ceilingLight, drain,
    };
  }
  const basementProps = buildBasement();

  /* ================================================================== */
  /* Anchors                                                              */
  /* ================================================================== */
  const anchors = {
    hallCenter: new THREE.Vector3(0, GY, 45),
    chandelier: new THREE.Vector3(CHANDELIER_POS.x, CHANDELIER_POS.y, CHANDELIER_POS.z),
    grandStairBottom: new THREE.Vector3((GRAND_STAIR.x0 + GRAND_STAIR.x1) / 2, GY, GRAND_STAIR.z0),
    grandStairTop: new THREE.Vector3((GRAND_STAIR.x0 + GRAND_STAIR.x1) / 2, UY, GRAND_STAIR.z1),
    basementLanding: new THREE.Vector3((BASEMENT_STAIR.x0 + BASEMENT_STAIR.x1) / 2, BY, BASEMENT_STAIR.z1 - 0.5),
    livingRoomCenter: new THREE.Vector3(-10, GY, 47.5),
    boardroomHead: new THREE.Vector3(7, GY, 55.3),
    boardroomTable: new THREE.Vector3(10, GY, 47.5),
    kitchenIsland: new THREE.Vector3(9, GY, 62),
    officeDesk: new THREE.Vector3(-9, UY, 48),
    trophyRoomCenter: new THREE.Vector3(10, UY, 47),
    upperHallway: new THREE.Vector3(0, UY, 53),
    balconyRail: new THREE.Vector3((BALCONY.x0 + BALCONY.x1) / 2, UY, BALCONY.z0),
  };

  const props = {
    hall: hallProps,
    livingRoom: livingProps,
    boardroom: boardroomProps,
    kitchen: kitchenProps,
    office: officeProps,
    trophyRoom: trophyProps,
    basement: basementProps,
  };

  /* ================================================================== */
  /* floorAt(x, z, y): the highest surface not more than one step above   */
  /* `y` -- Motel level.js's exact resolution pattern, generalised to a    */
  /* three-level building. Returns null outside every known room rect,    */
  /* so the caller (Phase 3's movement loop) knows to fall back to        */
  /* whatever default the exterior grounds use out there.                 */
  /* ================================================================== */
  function floorAt(x, z, y) {
    const cands = [];
    if (inRect(HALL, x, z)) {
      cands.push(BY); // the armory floor, always reachable once you've descended
      // The flat hall floor is always a candidate here, even where a stair
      // rect ALSO applies below -- not an either/or. GRAND_STAIR's x0 (-3.85)
      // and BASEMENT_STAIR's x1 (3.85) sit flush against the hall/living and
      // hall/boardroom archways respectively (partition walls at x=-4/x=4,
      // half-thickness 0.15, so the archway opening's inner edge is exactly
      // the stair rect's own edge). Walking straight through either archway
      // therefore grazes the stair rect's boundary while still at plain
      // GROUND_Y (never having climbed anything). With only the lerp'd stair
      // height offered there (the previous if/else), that lerp'd height is
      // typically well above the one-step tolerance for someone who just
      // walked in flat, so it got rejected -- leaving BY (the basement, which
      // always passes the tolerance) as the only candidate left, i.e. a
      // bogus fall to the basement on an ordinary walk through the archway.
      // Offering GY unconditionally alongside the stair-specific value fixes
      // that without weakening real stair climbing (once actually partway up
      // a stair, its lerp'd height is numerically higher than GY and still
      // wins the "highest candidate within one step" comparison below).
      cands.push(GY);
      if (inRect(GRAND_STAIR, x, z)) {
        const t = THREE.MathUtils.clamp((z - GRAND_STAIR.z0) / (GRAND_STAIR.z1 - GRAND_STAIR.z0), 0, 1);
        cands.push(THREE.MathUtils.lerp(GY, UY, t));
      } else if (inRect(BASEMENT_STAIR, x, z)) {
        const t = THREE.MathUtils.clamp((z - BASEMENT_STAIR.z0) / (BASEMENT_STAIR.z1 - BASEMENT_STAIR.z0), 0, 1);
        cands.push(THREE.MathUtils.lerp(GY, BY, t));
      }
    }
    // UPPER_HALL_MAIN (z:49-58) is a genuine two-storey stack, not a void:
    // Phase 1 poured a real ground-floor slab AND a real upper-floor slab
    // there (see MansionGrounds.js's `notchedSegs`), and Phase 2 topped the
    // ground one with marble ("hall-floor-corridor-topping") specifically so
    // it reads as a walkable extension of the hall -- there is no wall at
    // z=49 separating it from the hall proper, so a straight walk north from
    // the front door reaches it directly. Offering only UY here (as before)
    // meant floorAt() reported the *upper* floor's height for anyone
    // standing on the *ground* floor of that same footprint -- a bogus
    // levitation up to UPPER_Y on an ordinary walk through the hall,
    // discovered while re-verifying the archway fix above (the old,
    // fountain-blocked front door meant this stretch had never actually
    // been walked before). BALCONY (z:43-49) has no such ground floor of its
    // own -- that footprint is squarely inside the HALL/ATRIUM branch above,
    // which already offers every relevant ground/basement candidate there --
    // so it keeps offering only UY.
    if (inRect(UPPER_HALL_MAIN, x, z)) { cands.push(UY); cands.push(GY); }
    if (inRect(BALCONY, x, z)) cands.push(UY);
    if (inRect(LIVING, x, z)) cands.push(GY);
    if (inRect(BOARDROOM, x, z)) cands.push(GY);
    if (inRect(KITCHEN, x, z)) cands.push(GY);
    if (inRect(OFFICE, x, z)) cands.push(UY);
    if (inRect(TROPHY, x, z)) cands.push(UY);

    if (!cands.length) return null;
    let best = -Infinity;
    for (const c of cands) if (c <= y + 0.85 && c > best) best = c;
    if (best === -Infinity) best = Math.min(...cands);
    return best;
  }

  /* ================================================================== */
  /* Per-frame update: the bare basement bulb flickers gently.            */
  /* ================================================================== */
  let time = 0;
  function update(dt) {
    time += dt;
    const flick = 0.85 + 0.15 * Math.sin(time * 11) * (Math.sin(time * 2.3) > -0.6 ? 1 : 0.2);
    basementProps.bulbLight.intensity = 3.4 * flick;
  }

  return {
    root, colliders, doors, props, anchors, floorAt, update,
  };
}
