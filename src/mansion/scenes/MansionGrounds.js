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
import { tiled } from '../../bing/kit.js';
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
export const COURT_RADIUS = 12;
export const FOUNTAIN_POS = Object.freeze({ x: 0, z: 32 - FORECOURT_SHIFT });
export const POOL = Object.freeze({
  x0: -7, x1: 7, z0: 81, z1: 89, y: GROUND_Y - 1.3,
});
export const SECURITY_BOOTH_POS = Object.freeze({ x: 8, z: 4 });

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
/** Darkened silver for the statue's bandana, so the mascot shape still reads. */
const M_STATUE_PATINA = mat({ color: 0x7d838f, roughness: 0.34, metalness: 0.85 });
const M_CHROME = mat({ color: 0xd7dce3, roughness: 0.14, metalness: 0.95 });

const M_FENCE = mat({ color: 0x15161c, roughness: 0.5, metalness: 0.55 });
const M_PILLAR = mat({ color: 0xcac2ac, roughness: 0.5 });

const M_BOOTH = mat({ color: 0x1c2530, roughness: 0.7 });
const M_BOOTH_ROOF = mat({ color: 0x11161d, roughness: 0.8 });
const M_BOOTH_GLASS = mat({
  color: 0x8fb6c8, roughness: 0.1, transparent: true, opacity: 0.35,
});
const M_BARRIER_ARM = mat({ color: 0xd8d420, roughness: 0.5 });

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

/* ================================================================== */
/* Water: adapted from src/nowake/world.js's buildWater() -- the same    */
/* sine-displaced-vertex + fresnel-ish tinted-fragment ShaderMaterial     */
/* technique, rescaled for small basins (higher spatial frequency, much   */
/* smaller amplitude, no 3000 m ocean plane) instead of the Motel lambert-*/
/* plane fallback. Chosen because it is cheap for two small disc/rect     */
/* meshes and gives the hero fountain a genuinely animated surface; the   */
/* pool reuses the exact same factory with a different tint.             */
/* ================================================================== */
function makeWaterMaterial({ deep = 0x0b3440, shallow = 0x1f7d8c, opacity = 0.85 } = {}) {
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
  /* ---------------------------------------------------------------- */
  const FENCE_H = 1.4;
  const FENCE_RAIL_YS = [0.35, 0.75, 1.15];
  function fenceRun(axis, fixed, from, to) {
    let prevP = null;
    for (let p = from; p <= to + 0.01; p += 3) {
      const x = axis === 'x' ? p : fixed;
      const z = axis === 'x' ? fixed : p;
      root.add(box({ size: [0.12, FENCE_H, 0.12], pos: [x, FENCE_H / 2, z], mat: M_FENCE }));
      root.add(cylinder({
        rTop: 0, rBottom: 0.09, h: 0.18, pos: [x, FENCE_H + 0.09, z], mat: M_FENCE,
      }));
      // Horizontal pickets/rails back to the previous post -- bare posts and
      // cone caps alone read as a property-line/construction fence; a real
      // estate perimeter fence has rails strung between the posts.
      if (prevP !== null) {
        const span = p - prevP;
        const mid = prevP + span / 2;
        for (const ry of FENCE_RAIL_YS) {
          if (axis === 'x') {
            root.add(box({ size: [span - 0.12, 0.05, 0.05], pos: [mid, ry, fixed], mat: M_FENCE }));
          } else {
            root.add(box({ size: [0.05, 0.05, span - 0.12], pos: [fixed, ry, mid], mat: M_FENCE }));
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
      o.material = o.userData?.palKey === 'bandana' ? M_STATUE_PATINA : M_SILVER;
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
    const spotA = new THREE.SpotLight(0xfff3da, 10, 20, 0.4, 0.45, 1.8);
    spotA.position.set(fx + 5, 2.2, fz - 3);
    spotA.target.position.set(fx, statueY0 + 1.9, fz);
    root.add(spotA, spotA.target);
    const spotB = new THREE.SpotLight(0xdfe8ff, 8, 20, 0.4, 0.45, 1.8);
    spotB.position.set(fx - 5, 2.0, fz + 3);
    spotB.target.position.set(fx, statueY0 + 2.4, fz);
    root.add(spotB, spotB.target);

    // Anchored at the raised fist (computed above), not the statue's own
    // central axis at its base. The spray used to originate from (fx,
    // statueY0+0.3, fz) -- dead centre of the statue's own torso/legs, at a
    // height (and arc peak) that never rose above the statue's own head. From
    // any front-ish angle the whole spray rendered entirely behind or inside
    // the statue's opaque silhouette, which is the real reason it read as
    // "completely invisible" despite being correctly instantiated and ticked.
    // Spouting from the raised fist instead puts its base already clear of
    // the torso and above the head, so the column reads against open sky.
    const spray = new FountainSpray(root, raisedFistWorld);
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
      const l = new THREE.PointLight(0xffe2b4, 3.4, 9, 2);
      l.position.set(fx + ax, 1.9, fz + az);
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
    courtSpot(180, 11.0, 'lincoln', 0x101014),
    courtSpot(0, 11.0, 'suv', 0x2a2a30),
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
    const shell = box({ size: [w, h, d], pos: [cx, h / 2, cz], mat: M_BOOTH });
    root.add(shell);
    root.add(box({ size: [w + 0.3, 0.12, d + 0.3], pos: [cx, h + 0.06, cz], mat: M_BOOTH_ROOF }));
    root.add(box({ size: [0.05, 0.9, 1.3], pos: [cx - w / 2 - 0.01, 1.35, cz], mat: M_BOOTH_GLASS }));

    // Empty chair inside, visible through the window.
    const chair = group('booth-chair',
      box({ size: [0.55, 0.08, 0.55], pos: [0, 0.45, 0], mat: M_BOOTH }),
      box({ size: [0.55, 0.6, 0.08], pos: [0, 0.75, -0.24], mat: M_BOOTH }));
    chair.position.set(cx + 0.2, 0, cz);
    root.add(chair);

    // Barrier arm, raised/open -- no gate mechanic this pass. Was resting at
    // 1.15 rad (~66 deg): a 3.4m arm at that steep-but-not-vertical angle
    // reaches from near the ground all the way up to ~4m, a long bright
    // yellow diagonal that cut across the primary gate-approach sightline.
    // Rested much closer to horizontal instead -- clearly still raised/open,
    // but short enough in reach and height that it no longer sticks up into
    // that view.
    const postX = cx - 1.6;
    const postZ = cz;
    root.add(cylinder({ r: 0.08, h: 1.0, pos: [postX, 0.5, postZ], mat: M_BOOTH }));
    const armPivot = new THREE.Group();
    armPivot.add(box({ size: [3.4, 0.09, 0.09], pos: [1.7, 0, 0], mat: M_BARRIER_ARM }));
    armPivot.position.set(postX, 1.0, postZ);
    armPivot.rotation.z = 0.28;
    root.add(armPivot);

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

    solid(cx - w / 2, cx + w / 2, 0, h, cz - d / 2, cz + d / 2);
    solid(postX - 0.1, postX + 0.1, 0, 1.0, postZ - 0.1, postZ + 0.1);

    return {
      shell, chair, arm: armPivot, light: boothLight, position: new THREE.Vector3(cx, 0, cz),
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
  const PALM_SPOTS = [
    [-6, 6], [6, 6], [-6, 14], [6, 16], [14, 6],
    [-13.5, 38.6 - FORECOURT_SHIFT], [13.5, 38.6 - FORECOURT_SHIFT],
    [-24, 12], [-27, 17], [-21, 38 - FORECOURT_SHIFT],
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
  function buildServiceRoad() {
    root.add(box({ size: [28 - 22, 0.06, 70], pos: [25, 0.02, 35], mat: M_ASPHALT }));
    const x0 = 17;
    const x1 = 22;
    const zBot = 63;
    const zTop = REAR_DOOR.z; // 66
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const z = THREE.MathUtils.lerp(zBot, zTop, t);
      const y = THREE.MathUtils.lerp(0, GROUND_Y, t);
      const depth = (zTop - zBot) / steps + 0.05;
      root.add(box({
        size: [x1 - x0, 0.14, depth], pos: [(x0 + x1) / 2, y + 0.07, z], mat: M_ASPHALT,
      }));
    }
    /* Kerb on the ramp's OUTER edge only. The inner one used to run the full
     * length at x0-0.25, which was harmless when the ramp started at x=15
     * (inside the podium) but is a wall across the rear service door now that
     * it starts at the building line -- the door is at x:16..16.4, z:64.8..
     * 67.2, and the verifier's walk from the road duly stopped dead 1.3 m
     * short of it. The inner edge needs no kerb: it IS the house. */
    solid(x1, x1 + 0.25, 0, GROUND_Y + 0.2, zBot, zTop);
    root.add(box({
      size: [0.25, 0.16, zTop - zBot], pos: [x1 + 0.125, GROUND_Y * 0.5, (zBot + zTop) / 2], mat: M_CURB, cast: false,
    }));
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
        {
          id: 'livingWest', u0: 43, u1: 56, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
        {
          id: 'diningWest', u0: 60, u1: 71, y0: GLASS_SILL, y1: GLASS_TOP, glass: true,
        },
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

    // Roof slab (small eave overhang) + gold roofline trim.
    root.add(box({
      size: [BUILDING.x1 - BUILDING.x0 + 0.8, ROOF_Y1 - ROOF_Y0, BUILDING.z1 - BUILDING.z0 + 0.8],
      pos: [0, (ROOF_Y0 + ROOF_Y1) / 2, (BUILDING.z0 + BUILDING.z1) / 2],
      mat: M_ROOF,
    }));
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
    ext(BASEMENT_ROOM.x0, BASEMENT_ROOM.x1, BASEMENT_Y, 0, BASEMENT_ROOM.z1, BASEMENT_ROOM.z1 + 0.3, 'basement-wall-north', M_PODIUM);
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
    // Raked back, hinged at the head end, with its own slats and a stay.
    const back = new THREE.Group();
    back.position.set(0, deckY + 0.05, -0.9);
    back.rotation.x = -0.62;
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
    const light = new THREE.PointLight(0xff9a44, 5.5, 13, 2);
    light.position.set(x, GROUND_Y + poleH + 0.24, z);
    root.add(light);
    solid(x - 0.1, x + 0.1, GROUND_Y, GROUND_Y + poleH, z - 0.1, z + 0.1);
    torchFlames.push({ flame, light, baseIntensity: 5.5, seed: Math.random() * 10 });
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
    const torches = [
      buildTikiTorch(-12, 76.5), buildTikiTorch(12, 76.5),
      buildTikiTorch(-12, 93.5), buildTikiTorch(12, 93.5),
    ];

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
    const skirtT = 0.36;
    const skirtSegs = [
      // West, split either side of the garden-steps opening.
      [deckRect.x0, deckRect.x0 + skirtT, deckRect.z0, stepsZ0],
      [deckRect.x0, deckRect.x0 + skirtT, stepsZ1, deckRect.z1],
      // East, full run.
      [deckRect.x1 - skirtT, deckRect.x1, deckRect.z0, deckRect.z1],
      // North, full run, corner to corner.
      [deckRect.x0, deckRect.x1, deckRect.z1 - skirtT, deckRect.z1],
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
      skirt: skirtSegs.map(([sx0, sx1, sz0, sz1]) => ({
        x0: sx0, x1: sx1, z0: sz0, z1: sz1, y0: 0, y1: GROUND_Y,
      })),
    };
  }
  const poolPatio = buildPoolPatio();

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
    WALL_T,
    footprint: { ...BUILDING },
    loungeBay: { ...LOUNGE_BAY },
    bayRoofY0: BAY_ROOF_Y0,
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
    landscaping,
    lamps: [...LAMP_POSITIONS, ...CAR_LAMP_POSITIONS],
    palmSpots: PALM_SPOTS,
    sky,
  };

  /* ---------------------------------------------------------------- */
  /* Per-frame update: water shader time + the fountain's upward spray  */
  /* ---------------------------------------------------------------- */
  let torchTime = 0;
  function update(dt) {
    for (const m of waterMaterials) m.uniforms.uTime.value += dt;
    fountain.spray.update(dt);
    poolPatio.spray.update(dt);
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
