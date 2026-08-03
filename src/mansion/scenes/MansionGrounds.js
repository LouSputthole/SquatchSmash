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

export const BUILDING = Object.freeze({ x0: -16, x1: 16, z0: 41, z1: 75 });
/** The central hall's footprint: double-height atrium above, armory below. */
export const ATRIUM = Object.freeze({ x0: -4, x1: 4, z0: 41, z1: 49 });

export const GLASS_SILL = GROUND_Y + 0.15; // 1.35 -- floor-to-near-ceiling glass
export const GLASS_TOP = GROUND_Y + 3.35; // 4.55

export const FRONT_DOOR = Object.freeze({
  x: 0, y: GROUND_Y, z: 41, x0: -1.3, x1: 1.3, y0: GROUND_Y, y1: GROUND_Y + 2.8,
});
export const REAR_DOOR = Object.freeze({
  x: 16, y: GROUND_Y, z: 66, z0: 64.8, z1: 67.2, y0: GROUND_Y, y1: GROUND_Y + 2.4,
});

export const FOUNTAIN_POS = Object.freeze({ x: 0, z: 35 });
export const POOL = Object.freeze({
  x0: -7, x1: 7, z0: 81, z1: 89, y: GROUND_Y - 1.3,
});
export const SECURITY_BOOTH_POS = Object.freeze({ x: 8, z: 4 });

/* ================================================================== */
/* Material palette -- procedural only, matching the rest of the game. */
/* ================================================================== */
const M_GRASS = mat({ color: 0x1d3a24, roughness: 1 });
const M_CURB = mat({ color: 0xdedac9, roughness: 0.55 });
const M_ASPHALT = mat({ color: 0x2b2c32, roughness: 0.85 });

const M_STUCCO = mat({ color: 0xe9e1cc, roughness: 0.82 });
const M_ROOF = mat({ color: 0x352f28, roughness: 0.75 });
const M_PODIUM = mat({ color: 0xcdc6b2, roughness: 0.7 });
const M_GOLD = mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 });
const M_GLASS_TINT = mat({
  color: 0x8fc7dc, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.4,
});

const M_MARBLE = mat({ color: 0xe6e0d2, roughness: 0.32 });
const M_MARBLE_DK = mat({ color: 0xb7ae98, roughness: 0.4 });
const M_BRONZE = mat({ color: 0x8a5a2e, roughness: 0.35, metalness: 0.65 });
const M_SILVER = mat({ color: 0xc8ccd6, roughness: 0.16, metalness: 0.9 });
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
  constructor(parent, origin) {
    this.origin = origin.clone();
    this.t = 0;
    this.on = false;
    this.pos = new Float32Array(SPRAY_DROPS * 3);
    this.vel = new Float32Array(SPRAY_DROPS);
    this.life = new Float32Array(SPRAY_DROPS);
    this.spread = new Float32Array(SPRAY_DROPS * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // Point size was 0.09 -- about 9cm streaks, which additive blending plus
    // ACES tone mapping crush to nothing by the time a screenshot is taken
    // from the 6-10m the fountain is actually viewed from. Quadrupled, and
    // `toneMapped = false` so the streaks stay bright regardless of the
    // renderer's exposure curve instead of getting compressed toward grey.
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: sprayDropTexture(),
      size: 0.34,
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
    for (let i = 0; i < SPRAY_DROPS; i++) this._seed(i, Math.random());

    // Secondary jet column: a thin tapered translucent shell with a
    // scrolling streak texture running up the centre of the spray. Even if
    // every particle above happened to be off-screen or too subtle, this
    // guarantees a genuinely visible, animated "water is moving" column in
    // any static screenshot -- see jetColumnTexture()'s doc comment.
    const jetH = SPRAY_RISE * 0.86;
    this.jetGeo = new THREE.CylinderGeometry(0.16, 0.055, jetH, 14, 6, true);
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
    this.vel[i] = SPRAY_SPEED_MIN + Math.random() * (SPRAY_SPEED_MAX - SPRAY_SPEED_MIN);
    this.life[i] = at;
  }

  start() { this.on = true; this.points.visible = true; this.jet.visible = true; }

  stop() { this.on = false; this.points.visible = false; this.jet.visible = false; }

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    const o = this.origin;
    for (let i = 0; i < SPRAY_DROPS; i++) {
      this.life[i] += (this.vel[i] / SPRAY_RISE) * dt;
      if (this.life[i] >= 1) this._seed(i, this.life[i] - 1);
      const f = this.life[i];
      const arc = Math.sin(f * Math.PI); // rises then falls back, not a straight drop
      const j = i * 3;
      this.pos[j] = o.x + this.spread[i * 2] * SPRAY_SPREAD * f;
      this.pos[j + 1] = o.y + SPRAY_RISE * arc;
      this.pos[j + 2] = o.z + this.spread[i * 2 + 1] * SPRAY_SPREAD * f;
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
  function ext(x0, x1, y0, y1, z0, z1, tag, material = M_STUCCO, addCollider = true) {
    const m = box({
      size: [x1 - x0, y1 - y0, z1 - z0],
      pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      mat: material,
      name: tag,
    });
    root.add(m);
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
  /* ---------------------------------------------------------------- */
  root.add(box({ size: [70, 0.06, 100], pos: [0, -0.03, 45], mat: M_GRASS }));

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
  function paverMaterial(w, l) {
    return mat({
      map: tiled(paverBase, Math.max(1, Math.round(w / 0.5)), Math.max(1, Math.round(l / 0.5))),
      color: 0xffffff,
      roughness: 0.74,
      unique: true,
    });
  }

  root.add(box({ size: [8, 0.06, 23], pos: [0, 0.02, 11.5], mat: paverMaterial(8, 23) }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [-4.15, 0.05, 11.5], mat: M_CURB }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [4.15, 0.05, 11.5], mat: M_CURB }));

  const turnaround = new THREE.Mesh(new THREE.CircleGeometry(12, 48), paverMaterial(24, 24));
  turnaround.rotation.x = -Math.PI / 2;
  turnaround.position.set(0, 0.02, 35);
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
  const CAR_LAMP_POSITIONS = [[10.3, 34], [-14.25, 28.5]];
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

    // Heroic silver Bigfoot, ~3.3 m tall, standing on the pedestal, fist
    // raised. Rebuilt from 6 flat, evenly-sized boxes (no ape-like
    // proportions at all) into the same low-poly box idiom `core/person.js`
    // uses for its humanoid rig -- shoulders pushed wider than the hips,
    // a forward lean on the torso, a distinct head with a browridge slab,
    // and each arm built on its own rotation pivot (like Person.buildArm())
    // so the fist stays rigidly attached to its arm instead of floating as
    // an independently-placed box.
    const statueY0 = 3.6;
    const shoulderY = 2.35;
    const statue = group('bigfoot-statue',
      // Legs -- planted stance, narrower than the shoulders.
      box({ size: [0.42, 1.0, 0.58], pos: [-0.27, 0.5, 0], mat: M_SILVER }),
      box({ size: [0.42, 1.0, 0.58], pos: [0.27, 0.5, 0], mat: M_SILVER }),
      // Hips -- the narrow end of the classic ape-silhouette taper.
      box({ size: [0.92, 0.42, 0.7], pos: [0, 1.12, 0], mat: M_SILVER }),
      // Torso -- forward-leaning, deep chest.
      box({
        size: [1.35, 1.2, 0.85], pos: [0, 1.85, 0.08], mat: M_SILVER, rotX: -0.14,
      }),
      // Shoulder caps -- pushed wide of the torso: the single biggest cue
      // that reads "ape" instead of "person in a box suit".
      box({ size: [0.55, 0.42, 0.85], pos: [-0.92, shoulderY, 0.05], mat: M_SILVER }),
      box({ size: [0.55, 0.42, 0.85], pos: [0.92, shoulderY, 0.05], mat: M_SILVER }),
      // Neck, head, and a heavy brow-ridge slab -- the sasquatch's single
      // heaviest silhouette tell.
      box({ size: [0.38, 0.28, 0.4], pos: [0, 2.62, 0.14], mat: M_SILVER }),
      box({ size: [0.66, 0.6, 0.62], pos: [0, 3.0, 0.18], mat: M_SILVER }),
      box({ size: [0.56, 0.16, 0.28], pos: [0, 3.2, 0.42], mat: M_SILVER }));
    // Raised arm -- upper arm, forearm and fist all live on one rotation
    // pivot at the shoulder, so the whole limb swings and reads as a single
    // arm-with-a-fist rather than a disconnected floating box. The pivot's
    // children hang straight down at rotation.z=0 (like core/person.js's
    // buildArm()); rotating a touch past PI swings that hanging arm up and
    // out into a raised-fist pose, ending well above the head rather than
    // (a first attempt's math error) down and further out to the side.
    const armRaised = new THREE.Group();
    armRaised.position.set(-0.95, shoulderY, 0.05);
    armRaised.rotation.z = Math.PI + 0.35;
    armRaised.add(box({ size: [0.4, 0.8, 0.4], pos: [0, -0.4, 0], mat: M_SILVER }));
    armRaised.add(box({ size: [0.34, 0.7, 0.36], pos: [0, -1.05, 0.04], mat: M_SILVER }));
    const raisedFist = box({ size: [0.46, 0.46, 0.46], pos: [0, -1.5, 0.06], mat: M_SILVER });
    armRaised.add(raisedFist);
    statue.add(armRaised);
    // Lowered arm -- same one-pivot construction, slight outward angle.
    const armLower = new THREE.Group();
    armLower.position.set(0.95, shoulderY, 0.05);
    armLower.rotation.z = 0.28;
    armLower.add(box({ size: [0.4, 0.78, 0.4], pos: [0, -0.4, 0], mat: M_SILVER }));
    armLower.add(box({ size: [0.34, 0.72, 0.36], pos: [0, -1.05, 0.02], mat: M_SILVER }));
    armLower.add(box({ size: [0.4, 0.4, 0.4], pos: [0, -1.45, 0], mat: M_SILVER }));
    statue.add(armLower);
    statue.position.set(fx, statueY0, fz);
    root.add(statue);
    // Exact world position of the raised fist -- computed, not hand-derived,
    // so the spray's anchor point (below) is always correct even if the arm
    // pose above is tweaked later.
    statue.updateMatrixWorld(true);
    const raisedFistWorld = raisedFist.getWorldPosition(new THREE.Vector3());

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
    const fountainColliderBody = solid(fx - 3.6, fx + 3.6, 0.3, 2.2, fz - 3.6, fz + 3.6);
    const fountainColliderPedestal = solid(fx - 1.3, fx + 1.3, 2.2, 6.6, fz - 1.3, fz + 1.3);

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
  /* ---------------------------------------------------------------- */
  // Two of these spots (index 1 and 2, below) originally sat at z=40/41 --
  // right at the building's south wall (BUILDING.z0=41). At their authored
  // yaw, the rotated AABB (see makeVehicleCollider()) reached ~0.9m and
  // ~2.3m respectively past that wall plane into the boardroom/living-room
  // interior airspace. Both are pulled back to z=30-37.6 here, checked by
  // hand against every neighbour (the fountain's tiered collider, the front
  // steps/parapets, the palm at (11,35)/(-11,35), and each other) so nothing
  // in this new arrangement overlaps anything else either.
  const CAR_SPOTS = [
    { x: 9, z: 30, kind: 'lincoln', color: 0x101014, yaw: -0.4 },
    { x: 9.5, z: 37.6, kind: 'suv', color: 0x2a2a30, yaw: 0.3 },
    { x: -9.5, z: 30, kind: 'sedan', color: 0x1c1c22, yaw: 0.35 },
    { x: -19, z: 24, kind: 'lincoln', color: 0x2e2e36, yaw: Math.PI / 2 },
    { x: -19, z: 28, kind: 'suv', color: 0x151519, yaw: Math.PI / 2 },
    { x: -19, z: 32, kind: 'sedan', color: 0x1a1a20, yaw: Math.PI / 2 },
  ];
  const vehicles = CAR_SPOTS.map((spot) => {
    const car = makeCar(spot.kind, spot.color);
    car.group.position.set(spot.x, 0, spot.z);
    car.group.rotation.y = spot.yaw;
    root.add(car.group);
    const worldCollider = makeVehicleCollider(car);
    colliders.push(worldCollider);
    return {
      ...car, x: spot.x, z: spot.z, worldCollider,
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

    const boothLight = new THREE.PointLight(0xbcd8ff, 3.2, 9, 2);
    boothLight.position.set(cx, 1.7, cz);
    root.add(boothLight);

    // Exterior sconce on the driveway-facing (west) wall -- the one interior
    // PointLight above (range 9) never reaches the outward faces, so beyond
    // ~5m the booth was a near-pure-black box. This is enough to keep its
    // silhouette readable at driveway distance.
    root.add(cylinder({
      r: 0.06, h: 0.1, pos: [cx - w / 2 - 0.08, h - 0.35, cz], rotZ: Math.PI / 2,
      mat: mat({ color: 0x232a33, emissive: 0x9fd0ff, emissiveIntensity: 1.6, roughness: 0.5 }),
    }));
    const sconceLight = new THREE.PointLight(0xbcdcff, 4.5, 13, 2);
    sconceLight.position.set(cx - w / 2 - 0.2, h - 0.35, cz);
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
  const PALM_SPOTS = [
    [-6, 6], [6, 6], [-6, 14], [6, 16],
    [-11, 35], [11, 35], [-9, 45], [9, 45],
    [14, 6],
  ];
  for (const [x, z] of PALM_SPOTS) buildPalm(x, z, 5.5 + Math.random() * 1.4);

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
    const zBot = 39;
    const zTop = 40.5;
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
    // at z=41 (a short 0.5 m landing), matching the spec's implied door
    // approach.
    const porticoZ0 = zTop;
    const porticoZ1 = 41;
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
  function buildServiceRoad() {
    root.add(box({ size: [22 - 16, 0.06, 70], pos: [19, 0.02, 35], mat: M_ASPHALT }));
    const x0 = 15;
    const x1 = 19;
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
    solid(x0 - 0.25, x0, 0, GROUND_Y + 0.2, zBot, zTop);
    solid(x1, x1 + 0.25, 0, GROUND_Y + 0.2, zBot, zTop);
    return { road: { x0: 16, x1: 22, z0: 0, z1: 70 }, ramp: { x0, x1, z0: zBot, z1: zTop } };
  }
  const serviceRoad = buildServiceRoad();

  /* ---------------------------------------------------------------- */
  /* Building shell: exterior walls, roofline, floor/roof slabs,        */
  /* door + window openings.                                            */
  /* ---------------------------------------------------------------- */
  function buildShell() {
    const zS0 = BUILDING.z0 - WALL_T;
    const zS1 = BUILDING.z0; // south wall band
    const zN0 = BUILDING.z1;
    const zN1 = BUILDING.z1 + WALL_T; // north wall band
    const xW0 = BUILDING.x0 - WALL_T;
    const xW1 = BUILDING.x0; // west wall band
    const xE0 = BUILDING.x1;
    const xE1 = BUILDING.x1 + WALL_T; // east wall band

    // South wall: living-room glass | pier | front door | pier | boardroom glass
    ext(BUILDING.x0, -4, GLASS_TOP, UPPER_CEILING_Y, zS0, zS1, 'south-lintel-living');
    ext(-4, FRONT_DOOR.x0, GROUND_Y, UPPER_CEILING_Y, zS0, zS1, 'south-pier-west');
    ext(FRONT_DOOR.x0, FRONT_DOOR.x1, FRONT_DOOR.y1, UPPER_CEILING_Y, zS0, zS1, 'south-lintel-frontdoor');
    ext(FRONT_DOOR.x1, 4, GROUND_Y, UPPER_CEILING_Y, zS0, zS1, 'south-pier-east');
    ext(4, BUILDING.x1, GLASS_TOP, UPPER_CEILING_Y, zS0, zS1, 'south-lintel-boardroom');
    ext(BUILDING.x0, -4, GLASS_SILL, GLASS_TOP, zS0 + 0.1, zS1 - 0.1, 'glass-living-south', M_GLASS_TINT);
    ext(4, BUILDING.x1, GLASS_SILL, GLASS_TOP, zS0 + 0.1, zS1 - 0.1, 'glass-boardroom-south', M_GLASS_TINT);

    // East wall: boardroom glass (full depth) | kitchen wall | rear door | kitchen wall
    ext(xE0, xE1, GLASS_TOP, UPPER_CEILING_Y, BUILDING.z0, 58, 'east-lintel-boardroom');
    ext(xE0, xE1, GROUND_Y, UPPER_CEILING_Y, 58, REAR_DOOR.z0, 'east-wall-kitchen-a');
    ext(xE0, xE1, REAR_DOOR.y1, UPPER_CEILING_Y, REAR_DOOR.z0, REAR_DOOR.z1, 'east-lintel-reardoor');
    ext(xE0, xE1, GROUND_Y, UPPER_CEILING_Y, REAR_DOOR.z1, BUILDING.z1, 'east-wall-kitchen-b');
    ext(xE0 + 0.1, xE1 - 0.1, GLASS_SILL, GLASS_TOP, BUILDING.z0, 58, 'glass-boardroom-east', M_GLASS_TINT);

    // West + north walls: fully solid, no openings specified.
    ext(xW0, xW1, GROUND_Y, UPPER_CEILING_Y, BUILDING.z0, BUILDING.z1, 'west-wall-full');
    ext(BUILDING.x0, BUILDING.x1, GROUND_Y, UPPER_CEILING_Y, zN0, zN1, 'north-wall-full');

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

    // Podium/foundation (y:0..GROUND_Y) and upper floor slab (top at UPPER_Y),
    // both omitting the atrium/basement footprint -- no collider on either,
    // these are floors, not walls (see `solid()`'s note above).
    const notchedSegs = [
      { x0: BUILDING.x0, x1: ATRIUM.x0, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: ATRIUM.x1, x1: BUILDING.x1, z0: BUILDING.z0, z1: BUILDING.z1 },
      { x0: ATRIUM.x0, x1: ATRIUM.x1, z0: ATRIUM.z1, z1: BUILDING.z1 },
    ];
    for (const s of notchedSegs) {
      root.add(box({
        size: [s.x1 - s.x0, GROUND_Y, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, GROUND_Y / 2, (s.z0 + s.z1) / 2],
        mat: M_PODIUM,
      }));
    }
    for (const s of notchedSegs) {
      root.add(box({
        size: [s.x1 - s.x0, 0.2, s.z1 - s.z0],
        pos: [(s.x0 + s.x1) / 2, UPPER_Y - 0.1, (s.z0 + s.z1) / 2],
        mat: M_PODIUM,
      }));
    }

    // Basement shell, under the central hall only: floor slab + 4 perimeter
    // walls (collider) rising from BASEMENT_Y up to just shy of GROUND_Y --
    // NOT exactly to it. Reaching exactly to GROUND_Y put these colliders'
    // top face flush with the ground floor's own walking surface, and
    // core/player.js's own boundary skip (`p.y - eyeHeight > box.max.y`, a
    // strict `>`) does not skip a collider whose top exactly equals the
    // walker's feet height -- so a wall this tall silently blocked the
    // ground-floor archways MansionInterior.js cuts into this exact same
    // wall plane (x=-4 hall/living, x=4 hall/boardroom), since those
    // archways' x-span overlaps this wall's x-span. Capping the top at
    // BASEMENT_WALL_TOP (flush with the underside of Phase 2's hall floor
    // slab, which sits at GROUND_Y-0.1..GROUND_Y) clears that false block
    // while still fully enclosing the basement below it. No stairwell
    // opening is cut here -- the hall floor above this footprint is Phase
    // 2's to build, and it owns exactly where the descending stair goes.
    const BASEMENT_WALL_TOP = GROUND_Y - 0.15;
    root.add(box({
      size: [ATRIUM.x1 - ATRIUM.x0, 0.3, ATRIUM.z1 - ATRIUM.z0],
      pos: [0, BASEMENT_Y - 0.15, (ATRIUM.z0 + ATRIUM.z1) / 2],
      mat: M_MARBLE_DK,
    }));
    ext(ATRIUM.x0, ATRIUM.x1, BASEMENT_Y, BASEMENT_WALL_TOP, ATRIUM.z0 - 0.3, ATRIUM.z0, 'basement-wall-south', M_PODIUM);
    ext(ATRIUM.x0, ATRIUM.x1, BASEMENT_Y, BASEMENT_WALL_TOP, ATRIUM.z1, ATRIUM.z1 + 0.3, 'basement-wall-north', M_PODIUM);
    ext(ATRIUM.x0 - 0.3, ATRIUM.x0, BASEMENT_Y, BASEMENT_WALL_TOP, ATRIUM.z0, ATRIUM.z1, 'basement-wall-west', M_PODIUM);
    ext(ATRIUM.x1, ATRIUM.x1 + 0.3, BASEMENT_Y, BASEMENT_WALL_TOP, ATRIUM.z0, ATRIUM.z1, 'basement-wall-east', M_PODIUM);

    // Warm light spilling from the two glass rooms, seen from outside.
    const livingSpill = new THREE.PointLight(0xffc98a, 7, 14, 2);
    livingSpill.position.set(-10, 2.6, 41.6);
    root.add(livingSpill);
    const boardroomSpill = new THREE.PointLight(0xffc98a, 7, 14, 2);
    boardroomSpill.position.set(10, 2.6, 41.6);
    root.add(boardroomSpill);

    // Facade floodlights, uplighting the entrance stucco.
    const uplightA = new THREE.PointLight(0xffe6c2, 8, 20, 2);
    uplightA.position.set(-8, 0.6, 39);
    root.add(uplightA);
    const uplightB = new THREE.PointLight(0xffe6c2, 8, 20, 2);
    uplightB.position.set(8, 0.6, 39);
    root.add(uplightB);

    return {
      wallRects,
      windows: [
        {
          id: 'livingRoomSouth', x0: BUILDING.x0, x1: -4, y0: GLASS_SILL, y1: GLASS_TOP, z0: zS0, z1: zS1,
        },
        {
          id: 'boardroomSouth', x0: 4, x1: BUILDING.x1, y0: GLASS_SILL, y1: GLASS_TOP, z0: zS0, z1: zS1,
        },
        {
          id: 'boardroomEast', x0: xE0, x1: xE1, y0: GLASS_SILL, y1: GLASS_TOP, z0: BUILDING.z0, z1: 58,
        },
      ],
      slabs: {
        podium: notchedSegs.map((s) => ({ ...s, y0: 0, y1: GROUND_Y })),
        upperFloor: notchedSegs.map((s) => ({ ...s, y0: UPPER_Y - 0.2, y1: UPPER_Y })),
        basementFloor: {
          x0: ATRIUM.x0, x1: ATRIUM.x1, z0: ATRIUM.z0, z1: ATRIUM.z1, y0: BASEMENT_Y - 0.3, y1: BASEMENT_Y,
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
  function buildLoungeChair(x, y, z, yaw) {
    const g = new THREE.Group();
    g.add(box({ size: [0.7, 0.1, 1.8], pos: [0, 0.25, 0], mat: M_LOUNGE }));
    g.add(box({
      size: [0.7, 0.1, 0.8], pos: [0, 0.5, -0.9], mat: M_LOUNGE, rotX: -0.35,
    }));
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    solid(x - 0.4, x + 0.4, y, y + 0.6, z - 1.0, z + 1.0);
    return g;
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
    const poolWaterY = POOL.y + 1.1;
    const poolWaterMat = makeWaterMaterial({ deep: 0x0a3a52, shallow: 0x2fa6c9 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0 - 1, POOL.z1 - POOL.z0 - 1), poolWaterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, poolWaterY, 85);
    root.add(water);
    waterMaterials.push(poolWaterMat);

    const poolLight = new THREE.PointLight(0x4ad9ff, 2.6, 30, 2);
    poolLight.position.set(0, poolWaterY + 0.4, 85);
    root.add(poolLight);

    const chairs = [
      [-11, 80, 0], [-11, 84.5, 0], [-11, 89, 0],
      [11, 80, Math.PI], [11, 84.5, Math.PI], [11, 89, Math.PI],
    ].map(([x, z, yaw]) => buildLoungeChair(x, GROUND_Y, z, yaw));

    // Four deck-level tiki torches at the patio's corners -- clear of the
    // lounge-chair rows (z:80-89) and the pool itself, spread across the
    // full deck (x:-13..13, z:75..95) so the chairs/walls/deck boards
    // actually read at night instead of vanishing a few metres past the
    // water's own glow.
    const torches = [
      buildTikiTorch(-12, 76.5), buildTikiTorch(12, 76.5),
      buildTikiTorch(-12, 93.5), buildTikiTorch(12, 93.5),
    ];

    return {
      pool: POOL, waterY: poolWaterY, water, light: poolLight, chairs, torches,
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
    fountainFront: new THREE.Vector3(0, 0, 26),
    frontDoorOutside: new THREE.Vector3(0, GROUND_Y, 39.5),
    securityBooth: new THREE.Vector3(SECURITY_BOOTH_POS.x, 0, SECURITY_BOOTH_POS.z),
    poolPatio: new THREE.Vector3(0, GROUND_Y, 85),
    serviceRoadEntrance: new THREE.Vector3(19, 0, 0),
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
    securityBooth,
    frontEntry,
    serviceRoad,
    poolPatio,
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
    torchTime += dt;
    for (const t of torchFlames) {
      const flick = 0.82 + 0.18 * Math.sin(torchTime * 9 + t.seed) * Math.sin(torchTime * 3.1 + t.seed * 2);
      t.light.intensity = t.baseIntensity * flick;
    }
  }

  return {
    root, colliders, doors, props, anchors, shell, update,
  };
}
