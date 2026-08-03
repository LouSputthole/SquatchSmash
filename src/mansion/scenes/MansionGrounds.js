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
const M_PAVER = mat({ color: 0x8f897c, roughness: 0.7 });
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
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      map: sprayDropTexture(),
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    parent.add(this.points);
    for (let i = 0; i < SPRAY_DROPS; i++) this._seed(i, Math.random());
  }

  _seed(i, at) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    this.spread[i * 2] = Math.cos(a) * r;
    this.spread[i * 2 + 1] = Math.sin(a) * r;
    this.vel[i] = SPRAY_SPEED_MIN + Math.random() * (SPRAY_SPEED_MAX - SPRAY_SPEED_MIN);
    this.life[i] = at;
  }

  start() { this.on = true; this.points.visible = true; }

  stop() { this.on = false; this.points.visible = false; }

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
    root.add(cylinder({
      r: 0.55, h: 0.08, pos: [x, 2.5, -0.55], mat: M_CHROME, rotX: Math.PI / 2,
    }));
    const squatch = group('emblem-squatch',
      box({ size: [0.22, 0.3, 0.05], pos: [0, 0.05, 0], mat: M_CHROME }),
      box({ size: [0.16, 0.16, 0.05], pos: [0, 0.28, 0], mat: M_CHROME }),
      box({ size: [0.34, 0.08, 0.05], pos: [0, 0.12, 0], mat: M_CHROME }));
    squatch.position.set(x, 2.5, -0.6);
    root.add(squatch);
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
    g.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.position.set(hingeX, 0, 0);
    root.add(g);
  }
  gateLeaf(-4, -1);
  gateLeaf(4, 1);

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
  function fenceRun(axis, fixed, from, to) {
    for (let p = from; p <= to + 0.01; p += 3) {
      const x = axis === 'x' ? p : fixed;
      const z = axis === 'x' ? fixed : p;
      root.add(box({ size: [0.12, FENCE_H, 0.12], pos: [x, FENCE_H / 2, z], mat: M_FENCE }));
      root.add(cylinder({
        rTop: 0, rBottom: 0.09, h: 0.18, pos: [x, FENCE_H + 0.09, z], mat: M_FENCE,
      }));
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
  root.add(box({ size: [8, 0.06, 23], pos: [0, 0.02, 11.5], mat: M_PAVER }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [-4.15, 0.05, 11.5], mat: M_CURB }));
  root.add(box({ size: [0.3, 0.1, 23], pos: [4.15, 0.05, 11.5], mat: M_CURB }));

  const turnaround = new THREE.Mesh(new THREE.CircleGeometry(12, 48), M_PAVER);
  turnaround.rotation.x = -Math.PI / 2;
  turnaround.position.set(0, 0.02, 35);
  turnaround.receiveShadow = true;
  root.add(turnaround);

  // Side spur (x:[-22,-14], z:[20,32]) plus a short connector to the turnaround
  root.add(box({ size: [3, 0.06, 4], pos: [-12.5, 0.02, 26], mat: M_PAVER }));
  root.add(box({ size: [8, 0.06, 12], pos: [-18, 0.02, 26], mat: M_PAVER }));

  /* ---------------------------------------------------------------- */
  /* Driveway lamp posts -- only a handful carry a real PointLight.     */
  /* ---------------------------------------------------------------- */
  const LAMP_POSITIONS = [
    [-4.6, 4], [4.6, 4], [-4.6, 10], [4.6, 10], [-4.6, 16], [4.6, 16], [-4.6, 21], [4.6, 21],
  ];
  LAMP_POSITIONS.forEach(([x, z], i) => {
    const postH = 3.2;
    root.add(cylinder({ r: 0.09, h: postH, pos: [x, postH / 2, z], mat: M_LAMP_POST }));
    const lit = i % 3 === 1;
    root.add(sphere({
      r: 0.18,
      pos: [x, postH + 0.05, z],
      mat: mat({
        color: 0xffdca0, roughness: 0.4, emissive: lit ? 0xffdca0 : 0x332210, emissiveIntensity: lit ? 1.4 : 0.3,
      }),
    }));
    if (lit) {
      const l = new THREE.PointLight(0xffc98a, 5.5, 16, 2);
      l.position.set(x, postH + 0.1, z);
      root.add(l);
    }
    solid(x - 0.12, x + 0.12, 0, postH, z - 0.12, z + 0.12);
  });

  /* ---------------------------------------------------------------- */
  /* Fountain -- tiered basin, silver Bigfoot statue, water, spray       */
  /* ---------------------------------------------------------------- */
  function buildFountain() {
    const { x: fx, z: fz } = FOUNTAIN_POS;
    root.add(cylinder({ r: 6, h: 0.4, pos: [fx, 0.2, fz], mat: M_MARBLE_DK }));
    root.add(cylinder({ r: 3.5, h: 1.2, pos: [fx, 0.4 + 0.6, fz], mat: M_MARBLE }));
    root.add(cylinder({ r: 4, h: 0.5, pos: [fx, 1.6 + 0.25, fz], mat: M_MARBLE_DK }));
    root.add(cylinder({ r: 1.2, h: 1.5, pos: [fx, 2.1 + 0.75, fz], mat: M_BRONZE }));

    // Heroic silver Bigfoot, ~3 m tall, standing on the pedestal, fist raised.
    const statueY0 = 3.6;
    const statue = group('bigfoot-statue',
      box({ size: [1.0, 1.0, 0.7], pos: [0, 0.5, 0], mat: M_SILVER }),        // legs/base
      box({ size: [1.3, 1.1, 0.85], pos: [0, 1.55, 0], mat: M_SILVER }),     // torso
      box({
        size: [0.42, 0.9, 0.42], pos: [-0.55, 1.95, 0], mat: M_SILVER, rotZ: -0.7,
      }), // raised arm
      box({ size: [0.34, 0.34, 0.34], pos: [-1.0, 2.65, 0.1], mat: M_SILVER }), // fist
      box({
        size: [0.42, 0.85, 0.42], pos: [0.5, 1.3, 0], mat: M_SILVER, rotZ: 0.25,
      }), // lowered arm
      box({ size: [0.55, 0.6, 0.55], pos: [0, 2.55, 0], mat: M_SILVER }));    // head
    statue.position.set(fx, statueY0, fz);
    root.add(statue);

    const lowerWaterMat = makeWaterMaterial({ deep: 0x0b3440, shallow: 0x1f7d8c });
    const lowerWater = new THREE.Mesh(new THREE.CircleGeometry(5.7, 40), lowerWaterMat);
    lowerWater.rotation.x = -Math.PI / 2;
    lowerWater.position.set(fx, 0.44, fz);
    root.add(lowerWater);
    waterMaterials.push(lowerWaterMat);

    const upperWaterMat = makeWaterMaterial({ deep: 0x0e4552, shallow: 0x2a90a6 });
    const upperWater = new THREE.Mesh(new THREE.CircleGeometry(3.85, 32), upperWaterMat);
    upperWater.rotation.x = -Math.PI / 2;
    upperWater.position.set(fx, 2.08, fz);
    root.add(upperWater);
    waterMaterials.push(upperWaterMat);

    const spotA = new THREE.SpotLight(0xfff3da, 24, 18, 0.55, 0.5, 1.6);
    spotA.position.set(fx + 4, 0.4, fz - 4);
    spotA.target.position.set(fx, 4.5, fz);
    root.add(spotA, spotA.target);
    const spotB = new THREE.SpotLight(0xdfe8ff, 20, 18, 0.55, 0.5, 1.6);
    spotB.position.set(fx - 4, 0.4, fz + 4);
    spotB.target.position.set(fx, 4.5, fz);
    root.add(spotB, spotB.target);

    const spray = new FountainSpray(root, new THREE.Vector3(fx, statueY0 + 0.3, fz));
    spray.start();

    const fountainCollider = solid(fx - 6.3, fx + 6.3, 0, 3.6, fz - 6.3, fz + 6.3);

    return {
      statue, lowerWater, upperWater, spray, collider: fountainCollider, position: new THREE.Vector3(fx, 0, fz),
    };
  }
  const fountain = buildFountain();

  /* ---------------------------------------------------------------- */
  /* Parked family vehicles                                             */
  /* ---------------------------------------------------------------- */
  const CAR_SPOTS = [
    { x: 9, z: 30, kind: 'lincoln', color: 0x101014, yaw: -0.4 },
    { x: 9, z: 40, kind: 'suv', color: 0x2a2a30, yaw: 0.3 },
    { x: -9, z: 41, kind: 'sedan', color: 0x1c1c22, yaw: 2.6 },
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

    // Barrier arm, raised/open -- no gate mechanic this pass.
    const postX = cx - 1.6;
    const postZ = cz;
    root.add(cylinder({ r: 0.08, h: 1.0, pos: [postX, 0.5, postZ], mat: M_BOOTH }));
    const armPivot = new THREE.Group();
    armPivot.add(box({ size: [3.4, 0.09, 0.09], pos: [1.7, 0, 0], mat: M_BARRIER_ARM }));
    armPivot.position.set(postX, 1.0, postZ);
    armPivot.rotation.z = 1.15; // raised open, angled up and away from the drive
    root.add(armPivot);

    const boothLight = new THREE.PointLight(0xbcd8ff, 3.2, 9, 2);
    boothLight.position.set(cx, 1.7, cz);
    root.add(boothLight);

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
    const zBot = 35;
    const zTop = 38;
    const steps = 8;
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

    // Portico landing -- extended 1 m past the spec's z:[38,40] to physically
    // reach the front door at z=41 (small adjustment, footprint unchanged).
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
    // walls (collider) rising from BASEMENT_Y to GROUND_Y. No stairwell
    // opening is cut here -- the hall floor above this footprint is Phase
    // 2's to build, and it owns exactly where the descending stair goes.
    root.add(box({
      size: [ATRIUM.x1 - ATRIUM.x0, 0.3, ATRIUM.z1 - ATRIUM.z0],
      pos: [0, BASEMENT_Y - 0.15, (ATRIUM.z0 + ATRIUM.z1) / 2],
      mat: M_MARBLE_DK,
    }));
    ext(ATRIUM.x0, ATRIUM.x1, BASEMENT_Y, GROUND_Y, ATRIUM.z0 - 0.3, ATRIUM.z0, 'basement-wall-south', M_PODIUM);
    ext(ATRIUM.x0, ATRIUM.x1, BASEMENT_Y, GROUND_Y, ATRIUM.z1, ATRIUM.z1 + 0.3, 'basement-wall-north', M_PODIUM);
    ext(ATRIUM.x0 - 0.3, ATRIUM.x0, BASEMENT_Y, GROUND_Y, ATRIUM.z0, ATRIUM.z1, 'basement-wall-west', M_PODIUM);
    ext(ATRIUM.x1, ATRIUM.x1 + 0.3, BASEMENT_Y, GROUND_Y, ATRIUM.z0, ATRIUM.z1, 'basement-wall-east', M_PODIUM);

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

    return {
      pool: POOL, waterY: poolWaterY, water, light: poolLight, chairs,
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
    lamps: LAMP_POSITIONS,
    palmSpots: PALM_SPOTS,
    sky,
  };

  /* ---------------------------------------------------------------- */
  /* Per-frame update: water shader time + the fountain's upward spray  */
  /* ---------------------------------------------------------------- */
  function update(dt) {
    for (const m of waterMaterials) m.uniforms.uTime.value += dt;
    fountain.spray.update(dt);
  }

  return {
    root, colliders, doors, props, anchors, shell, update,
  };
}
