import * as THREE from 'three';
import { BIG_UNCLE_LOU } from '../core/wardrobe.js';
import { Npc } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { coarseActorRole, markActor } from '../core/staging.js';
import {
  beamBetween, box, cylinder, lineCurve, mat, mesh, proxy, textPlate,
} from './build.js';
import { buildCabin } from './cabin.js';
import {
  CABIN, CABIN_COLLIDERS, DECK, DECK_COLLIDERS,
  cabinColliderBoxes, deckColliderBoxes, resolveOnDeck,
} from './deck-collision.js';

const _from = new THREE.Vector3();
const _localPlayer = new THREE.Vector3();
const _worldPlayer = new THREE.Vector3();
const WATER_LEVEL = -0.18;
/**
 * The cruiser's resting waterline.
 *
 * With the hull mesh 0.02 above the root and its keel at -0.98, this floats her
 * on a measured 0.88 m draft with 0.84 m of side freeboard and 1.10 m from the
 * water to the cockpit sole — a 36-footer sitting on her lines rather than
 * balancing on the chine.
 */
const BOAT_FLOAT_Y = -0.10;
const CRUISER_HULL_MESH_Y = 0.02;

/**
 * The same stations that build the cruiser's skin also bound its water hole.
 * A rectangle around the boat would erase sea beside the fine bow and behind
 * the transom; these stations taper the exclusion with the real hull instead.
 */
export const CRUISER_HULL_SECTIONS = Object.freeze([
  Object.freeze({ z: -6.25, w: .12 }), Object.freeze({ z: -5.70, w: .86 }),
  Object.freeze({ z: -4.85, w: 1.98 }), Object.freeze({ z: -3.70, w: 2.24 }),
  Object.freeze({ z: -2.15, w: 2.46 }), Object.freeze({ z: 0.00, w: 2.54 }),
  Object.freeze({ z: 2.60, w: 2.56 }), Object.freeze({ z: 4.60, w: 2.46 }),
  Object.freeze({ z: 5.55, w: 2.26 }),
]);

export const CRUISER_WATER_EXCLUSION = Object.freeze({
  sections: CRUISER_HULL_SECTIONS,
  keelY: -.98,
  chineY: -.24,
  sheerY: .74,
  /* Leave a narrow shell overlap so the discard can never become a visible
   * dry moat beside the hull at a grazing camera angle. */
  inset: .035,
});

export function cruiserHullSectionHalfBeam(z) {
  const sections = CRUISER_WATER_EXCLUSION.sections;
  if (!Number.isFinite(z) || z < sections[0].z || z > sections.at(-1).z) return 0;
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]; const b = sections[i + 1];
    if (z < a.z || z > b.z) continue;
    const k = (z - a.z) / (b.z - a.z);
    return THREE.MathUtils.lerp(a.w, b.w, k);
  }
  return sections.at(-1).w;
}

export function cruiserHullVerticalScale(y) {
  const { keelY, chineY, sheerY } = CRUISER_WATER_EXCLUSION;
  if (!Number.isFinite(y) || y < keelY || y > sheerY) return 0;
  if (y <= chineY) return .84 * (y - keelY) / (chineY - keelY);
  return THREE.MathUtils.lerp(.84, 1, (y - chineY) / (sheerY - chineY));
}

export function cruiserHullHalfBeamAt(y, z) {
  return cruiserHullSectionHalfBeam(z) * cruiserHullVerticalScale(y);
}

function excludesBoatLocalWater(point) {
  const sections = CRUISER_WATER_EXCLUSION.sections;
  const inset = CRUISER_WATER_EXCLUSION.inset;
  if (point.z < sections[0].z + inset || point.z > sections.at(-1).z - inset) return false;
  const halfBeam = cruiserHullHalfBeamAt(point.y, point.z) - CRUISER_WATER_EXCLUSION.inset;
  return halfBeam > 0 && Math.abs(point.x) <= halfBeam;
}

/** Where the inlet is, in world metres from Gate C. */
export const INLET = Object.freeze({ x: 0, z: -430 });
export const INLET_HEADLAND = Object.freeze({
  centerZ: INLET.z - 64,
  depth: 46,
  nearZ: INLET.z - 64 + 46 / 2,
});

function buildWater(scene) {
  const boatWorldInverse = new THREE.Matrix4();
  const localPoint = new THREE.Vector3();
  let boatFrame = null;
  const material = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uFog: { value: new THREE.Color(0x87a9b8) },
      uDeep: { value: new THREE.Color(0x0b3445) },
      uShallow: { value: new THREE.Color(0x2f7684) },
      uSky: { value: new THREE.Color(0xe4f2f5) },
      uBoatWorldInverse: { value: boatWorldInverse },
      uHullSections: {
        value: CRUISER_HULL_SECTIONS.map(({ z, w }) => new THREE.Vector2(z, w)),
      },
      uHullVertical: {
        value: new THREE.Vector3(
          CRUISER_WATER_EXCLUSION.keelY,
          CRUISER_WATER_EXCLUSION.chineY,
          CRUISER_WATER_EXCLUSION.sheerY,
        ),
      },
      uHullInset: { value: CRUISER_WATER_EXCLUSION.inset },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying float vHeight;
      varying vec2 vSurface;
      uniform float uTime;
      void main() {
        vec3 p = position;
        float broad = sin(p.x * .043 + uTime * .72) * .105;
        float cross = sin(p.y * .061 - uTime * .94 + p.x * .018) * .068;
        float chop = sin((p.x + p.y) * .145 + uTime * 1.8) * .026;
        float fine = sin(p.x * .38 - p.y * .22 + uTime * 2.6) * .011;
        p.z += broad + cross + chop + fine;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vHeight = broad + cross + chop + fine;
        vSurface = p.xy;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      varying float vHeight;
      varying vec2 vSurface;
      uniform float uTime;
      uniform vec3 uFog;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform mat4 uBoatWorldInverse;
      uniform vec2 uHullSections[${CRUISER_HULL_SECTIONS.length}];
      uniform vec3 uHullVertical;
      uniform float uHullInset;

      float hullSectionHalfBeam(float z) {
        if (z < uHullSections[0].x + uHullInset
          || z > uHullSections[${CRUISER_HULL_SECTIONS.length - 1}].x - uHullInset) {
          return -1.0;
        }
        float width = -1.0;
        for (int i = 0; i < ${CRUISER_HULL_SECTIONS.length - 1}; i++) {
          vec2 a = uHullSections[i];
          vec2 b = uHullSections[i + 1];
          if (z >= a.x && z <= b.x) {
            float k = clamp((z - a.x) / (b.x - a.x), 0.0, 1.0);
            width = mix(a.y, b.y, k);
          }
        }
        return width;
      }

      float hullVerticalScale(float y) {
        if (y < uHullVertical.x || y > uHullVertical.z) return 0.0;
        if (y <= uHullVertical.y) {
          return .84 * (y - uHullVertical.x) / (uHullVertical.y - uHullVertical.x);
        }
        return mix(.84, 1.0,
          (y - uHullVertical.y) / (uHullVertical.z - uHullVertical.y));
      }

      void main() {
        /* The sea is still one global displaced plane. Only fragments inside
         * the actual moving hull volume are discarded, in the boat's full
         * translated/yawed/pitched/rolled frame. */
        vec3 boatLocal = (uBoatWorldInverse * vec4(vWorld, 1.0)).xyz;
        float hullWidth = hullSectionHalfBeam(boatLocal.z)
          * hullVerticalScale(boatLocal.y) - uHullInset;
        if (hullWidth > 0.0 && abs(boatLocal.x) <= hullWidth) discard;

        float rippleA = sin(vSurface.x * .51 + vSurface.y * .19 + uTime * 2.15);
        float rippleB = sin(vSurface.y * .72 - vSurface.x * .13 - uTime * 2.75);
        float micro = rippleA * rippleB;
        float crest = smoothstep(.105, .19, vHeight + micro * .018);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        vec3 col = mix(uDeep, uShallow, .26 + vHeight * 1.45 + micro * .035);
        col = mix(col, vec3(.42, .48, .50), crest * .30);
        col = mix(col, uFog, .10 + fresnel * .26);
        /* Daylight: a cool sky lays a readable strip down the water without
         * bleaching the wave shape into a flat blue plane. */
        float glare = pow(max(0.0, 1.0 - abs(vWorld.x) * .012), 6.0);
        col += uSky * glare * (.05 + fresnel * .10);
        float glint = pow(max(0.0, rippleA * .5 + rippleB * .5), 18.0) * .13;
        col += glint;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 220, 220), material);
  water.name = 'open water surface';
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.receiveShadow = true;
  scene.add(water);
  const syncExclusion = () => {
    if (!boatFrame) return false;
    /* The frame is the visible hull mesh, not its parent group. Updating
     * parents first carries the root's complete translation/yaw/pitch/roll;
     * the mesh matrix then adds the authored +.02 m hull placement. */
    boatFrame.updateWorldMatrix(true, false);
    boatWorldInverse.copy(boatFrame.matrixWorld).invert();
    return true;
  };
  return {
    mesh: water,
    material,
    level: WATER_LEVEL,
    exclusion: CRUISER_WATER_EXCLUSION,
    bindBoat(frame) {
      boatFrame = frame?.isObject3D ? frame : null;
      return syncExclusion();
    },
    syncExclusion,
    /** CPU/public twin of the shader predicate, using the exact uploaded inverse. */
    excludes(point) {
      if (!point || !boatFrame) return false;
      localPoint.copy(point).applyMatrix4(boatWorldInverse);
      return excludesBoatLocalWater(localPoint);
    },
  };
}

/** A small tapered runabout hull, for the two boats left on the finger. */
function marinaHullGeometry(length, beam) {
  const half = beam / 2;
  const sections = [
    { z: -length / 2, w: .08 },
    { z: -length * .39, w: half * .68 },
    { z: -length * .18, w: half * .96 },
    { z: length * .34, w: half },
    { z: length / 2, w: half * .82 },
  ];
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]; const b = sections[i + 1];
    for (const side of [-1, 1]) {
      const at = [side * a.w, .54, a.z];
      const ac = [side * a.w * .78, -.12, a.z];
      const ak = [0, -.68, a.z];
      const bt = [side * b.w, .54, b.z];
      const bc = [side * b.w * .78, -.12, b.z];
      const bk = [0, -.68, b.z];
      // Winding faces away from the centreline on both sides, or Three culls
      // every exterior panel and the hull looks like a detached rub strip.
      if (side > 0) {
        tri(at, bt, bc); tri(at, bc, ac); tri(ac, bc, bk); tri(ac, bk, ak);
      } else {
        tri(at, bc, bt); tri(at, ac, bc); tri(ac, bk, bc); tri(ac, ak, bk);
      }
    }
  }
  const stern = sections.at(-1);
  tri([-stern.w, .54, stern.z], [stern.w, -.12, stern.z], [stern.w, .54, stern.z]);
  tri([-stern.w, .54, stern.z], [-stern.w * .78, -.12, stern.z], [stern.w, -.12, stern.z]);
  tri([-stern.w * .78, -.12, stern.z], [0, -.68, stern.z], [stern.w, -.12, stern.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Gate C at dusk: one isolated finger, a long way from the office.
 *
 * "Marina, dusk. Isolated finger." The old berth sat in the middle of a busy
 * pier with three neighbours alongside. This one is the last finger on the
 * outside of the basin with two boats left on it, both dark, and the office
 * lights a hundred metres away across the water.
 */
function buildMarina(scene) {
  const wood = mat(0x3a2f26, .94);
  const woodLight = mat(0x4e3f30, .92);
  const steel = mat(0x40484b, .55, .55);
  const concrete = mat(0x5c605e, 1);
  const rubber = mat(0x111516, .95);
  const dock = new THREE.Group();
  dock.name = 'South Harbor · Gate C finger';

  dock.add(box('finger dock deck', [3.35, .28, 44], wood, -5.35, .02, 2.0));
  for (let z = -19.1, i = 0; z <= 23.4; z += .78, i++) {
    dock.add(box(`finger dock plank ${i + 1}`, [3.2, .075, .70], i % 4 === 0 ? woodLight : wood, -5.35, .205, z));
  }
  dock.add(box('shore walkway deck', [13.5, .32, 3.35], wood, -10.35, .02, 23.0));
  for (let x = -16.5, i = 0; x <= -3.9; x += .82, i++) {
    dock.add(box(`shore walkway plank ${i + 1}`, [.74, .075, 3.2], i % 3 === 0 ? woodLight : wood, x, .205, 23.0));
  }
  for (let z = -18, i = 0; z <= 22; z += 4.0, i++) {
    dock.add(cylinder(`dock piling outboard ${i + 1}`, .15, 2.5, steel, -3.7, -.62, z));
    dock.add(cylinder(`dock piling inboard ${i + 1}`, .15, 2.5, steel, -7.0, -.62, z));
    dock.add(box(`dock rubber bumper ${i + 1}`, [.11, .42, 1.7], rubber, -3.69, .09, z + 1.7));
  }

  for (const [i, z] of [-10, 1.8, 12.6].entries()) {
    const pedestal = new THREE.Group();
    pedestal.name = `dock shore-power pedestal ${i + 1}`;
    pedestal.add(box(`shore-power body ${i + 1}`, [.46, .78, .38], mat(0xbcb8ac), 0, .52, 0));
    pedestal.add(box(`shore-power panel ${i + 1}`, [.30, .16, .04], mat(0x1d3035), 0, .62, .175));
    pedestal.add(cylinder(`shore-power lamp green ${i + 1}`, .045, .055, mat(0x3b9d62), -.10, .62, .25, 12));
    pedestal.add(cylinder(`shore-power lamp amber ${i + 1}`, .045, .055, mat(0xd3b343), .10, .62, .25, 12));
    pedestal.position.set(-6.35, .1125, z);
    dock.add(pedestal);
  }
  const hose = mesh('dock water hose coil', new THREE.TorusGeometry(.34, .045, 8, 24), mat(0x24513f), -6.15, .76, 5.7);
  hose.rotation.y = Math.PI / 2;
  dock.add(hose);
  dock.add(box('dock life jacket locker', [.72, 1.05, .42], mat(0xb4b4ac), -6.32, .78, 16.3));
  const safetyLabel = textPlate('dock life jacket sign', 'LIFE JACKETS', .62, .16, {
    foreground: '#202627', background: '#c9c6b8', font: 30,
  });
  safetyLabel.position.set(-6.10, .94, 16.3);
  safetyLabel.rotation.y = Math.PI / 2;
  dock.add(safetyLabel);
  const cart = new THREE.Group();
  cart.name = 'dock cart';
  cart.add(box('dock cart bed', [1.25, .13, .78], steel, 0, .48, 0));
  cart.add(box('dock cart handle port', [.08, .72, .08], steel, -.53, .72, -.3));
  cart.add(box('dock cart handle starboard', [.08, .72, .08], steel, -.53, .72, .3));
  for (const [i, [x, z]] of [[-.48, -.28], [-.48, .28], [.48, -.28], [.48, .28]].entries()) {
    const wheel = cylinder(`dock cart wheel ${i + 1}`, .12, .07, rubber, x, .36, z, 14);
    wheel.rotation.z = Math.PI / 2;
    cart.add(wheel);
  }
  /* Park against the inboard edge instead of straddling the 3.35 m finger.
   * The visible cart remains fully on the planks, while its outboard face now
   * leaves 1.415 m of capsule-centre lane after both 0.30 m radii are paid. */
  cart.position.set(-6.35, 0, -14.4);
  dock.add(cart);
  const cartCollider = new THREE.Box3(
    new THREE.Vector3(-7.01, .16, -14.82),
    new THREE.Vector3(-5.69, 1.10, -13.98),
  );

  /* The single dock cleat the spring line lands on. The redesign's startup
   * checklist reads "battery, blower, fuel check, port engine, starboard
   * engine, nav lights, dock line, helm" -- one line, forward, so the walk to
   * it is the wide foredeck rather than a side deck the player gets wedged in. */
  const cleat = new THREE.Group();
  cleat.name = 'dock bow cleat';
  cleat.add(box('dock cleat bar', [.38, .07, .13], steel, 0, .13, 0));
  cleat.add(cylinder('dock cleat horn forward', .045, .20, steel, -.13, .08, 0, 8));
  cleat.add(cylinder('dock cleat horn aft', .045, .20, steel, .13, .08, 0, 8));
  cleat.position.set(-3.82, .20, -5.2);
  cleat.rotation.y = -.24;
  dock.add(cleat);
  const dockCleat = new THREE.Vector3(-3.82, .38, -5.2);

  // The office, far enough off that the finger reads as the end of the world.
  dock.add(box('harbor office building', [16, 2.8, 5.3], concrete, -15, 1.2, 22.6));
  const officeSign = textPlate('harbor office sign', 'SOUTH HARBOR  /  GATE C', 6.7, .78, {
    foreground: '#f3e6b2', background: '#10252d', border: '#c8ad4f', font: 38,
  });
  officeSign.position.set(-14.5, 2.68, 19.89);
  dock.add(officeSign);
  dock.add(mesh('hanging harbor office life ring', new THREE.TorusGeometry(.34, .09, 10, 28), mat(0xc4503a), -10.0, 1.55, 19.82));
  for (let i = 0; i < 8; i++) {
    const z = -15 + i * 5;
    const light = new THREE.PointLight(0xf0d3a0, 3.1, 15, 2);
    light.name = `dock lamp glow ${i + 1}`;
    light.position.set(-5.3, 3.2, z);
    const post = cylinder(`dock lamp post ${i + 1}`, .055, 3.0, steel, -5.3, 1.52, z, 8);
    const shade = mesh(`dock lamp shade ${i + 1}`, new THREE.ConeGeometry(.23, .22, 12), mat(0x263236), -5.3, 3.08, z);
    shade.rotation.x = Math.PI;
    dock.add(light, post, shade);
  }
  scene.add(dock);

  /* Two boats left on the finger, both dark. */
  const neighborBoats = [];
  for (const [i, [x, z, yaw, color, accent]] of [
    [10.5, 7.5, .08, 0x9d9583, 0x294755],
    [-16.5, -9, .04, 0xb6b3a9, 0x254455],
  ].entries()) {
    const other = new THREE.Group();
    other.name = `detailed neighboring marina boat ${i + 1}`;
    const length = 9.2;
    const beam = 3.45;
    const neighborHull = mesh('tapered neighboring hull', marinaHullGeometry(length, beam), mat(color), 0, 0, 0);
    other.add(neighborHull);
    other.add(box('neighbor deck sole', [3.12, .12, 7.65], mat(0x5f4a36), 0, .61, .20));
    other.add(box('neighbor gunwale cap', [3.32, .10, 8.25], mat(0xbdb9ad), 0, .57, .12));
    for (const sx of [-1, 1]) {
      other.add(box(`neighbor sheer stripe ${sx < 0 ? 'port' : 'starboard'}`, [.08, .18, 7.9], mat(accent), sx * 1.64, .22, .18));
    }
    other.add(box('neighbor wheelhouse', [2.35, .62, 2.45], mat(0xc0bbae), 0, .94, -1.18));
    other.add(box('neighbor wheelhouse roof', [2.58, .12, 2.72], mat(accent), 0, 1.67, -1.10));
    const frontGlass = box('neighbor windscreen', [2.14, .52, .055], mat(0x203a42), 0, 1.36, -2.43);
    frontGlass.rotation.x = -.12;
    other.add(frontGlass);
    for (const sx of [-1, 1]) {
      const side = sx < 0 ? 'port' : 'starboard';
      other.add(box(`neighbor side glass ${side}`, [.055, .50, 1.74], mat(0x203a42), sx * 1.17, 1.505, -1.12));
      other.add(box(`neighbor windscreen post forward ${side}`, [.10, .66, .10], mat(0xc0bbae), sx * 1.18, 1.31, -2.38));
      other.add(box(`neighbor windscreen post aft ${side}`, [.10, .66, .10], mat(0xc0bbae), sx * 1.18, 1.31, .08));
      other.add(beamBetween(`neighbor bow rail ${side}`, new THREE.Vector3(sx * .18, 1.04, -4.42), new THREE.Vector3(sx * 1.52, 1.22, -3.32), .025, steel, 7));
      other.add(beamBetween(`neighbor side rail ${side}`, new THREE.Vector3(sx * 1.52, 1.22, -3.32), new THREE.Vector3(sx * 1.58, 1.22, 3.70), .025, steel, 7));
      for (const [j, railZ] of [-3.25, -1.2, .9, 3.55].entries()) {
        other.add(cylinder(`neighbor rail stanchion ${side} ${j + 1}`, .025, .62, steel, sx * 1.57, .92, railZ, 7));
      }
      other.add(box(`neighbor outdrive ${side}`, [.34, .58, .42], mat(0x242a2c), sx * .48, .20, 4.72));
      for (const [j, cleatZ] of [-3.45, 3.52].entries()) {
        other.add(box(`neighbor cleat ${side} ${j + 1}`, [.34, .055, .10], steel, sx * 1.42, .6975, cleatZ));
      }
    }
    other.add(box('neighbor transom platform', [2.42, .18, .72], mat(0xb0aca1), 0, .88, 3.17));
    other.add(box('neighbor transom face', [2.24, .45, .14], mat(0x9a978d), 0, 1.175, 3.48));
    other.add(cylinder('neighbor radar mast', .045, 1.08, steel, 0, 2.25, -1.12, 8));
    const radar = mesh('neighbor radar dome', new THREE.SphereGeometry(.25, 16, 10), mat(0xc0bbae), 0, 2.885, -1.12);
    radar.scale.y = .38;
    other.add(radar);
    other.position.set(x, BOAT_FLOAT_Y, z);
    other.rotation.y = yaw;
    let details = 0;
    other.traverse((object) => { if (object.isMesh) details++; });
    other.userData.detailMeshes = details;
    scene.add(other);
    neighborBoats.push(other);
  }

  const shoreline = box('harbor shoreline bank', [360, 7, 36], mat(0x1e2a24), 0, 1.2, 80);
  shoreline.receiveShadow = true;
  scene.add(shoreline);
  /* Trees stand ON the bank, bedded 2 cm into it. Authored at the height that
   * looked right, they were buried in it -- their bases a metre below its top
   * -- which the geometry audit reports as floating because nothing is holding
   * them up where they begin. Then they were set to start EXACTLY at the
   * bank's top, which is the other fault: two faces at one depth fight for the
   * pixel. Two centimetres of overlap is the whole answer to both -- it is
   * inside the audit's 3 cm support window, so the bank still counts as
   * holding the tree up, and it is 30x the 0.6 mm at which the two surfaces
   * would flicker. Every stacked pair in this scene is built to that rule. */
  const BANK_TOP = 1.2 + 3.5;
  for (let i = 0; i < 30; i++) {
    const trunk = cylinder(`harbor tree trunk ${i + 1}`, .18 + (i % 3) * .04, 3.8, mat(0x2c241b), -170 + i * 11, BANK_TOP + 1.88, 69 + (i % 4) * 4, 7);
    const crown = mesh(`harbor tree crown ${i + 1}`, new THREE.ConeGeometry(1.6 + (i % 4) * .22, 5.5, 8), mat(0x18241d), trunk.position.x, BANK_TOP + 3.76 + 2.75, trunk.position.z);
    scene.add(trunk, crown);
  }

  const colliders = [
    new THREE.Box3(new THREE.Vector3(-23, -.5, 19.7), new THREE.Vector3(-7.1, 3.4, 25.5)),
    new THREE.Box3(new THREE.Vector3(-6.75, .15, 16.0), new THREE.Vector3(-5.9, 2.0, 16.65)),
    cartCollider,
  ];
  return { root: dock, dockCleat, colliders, neighborBoats };
}

/**
 * The channel out and the inlet at the end of it.
 *
 * The NO WAKE board passes to starboard on the way out, the houses thin, and
 * the last three kilometres of shoreline close into a pocket behind a wooded
 * point with a worked-out quarry face opposite. That pocket is where the rest
 * of the mission happens.
 */
function buildChannel(scene) {
  const rock = mat(0x4a4740, .98);
  const rockPale = mat(0x615c53, .96);
  const timber = mat(0x2a2219, .96);
  const foliage = mat(0x16221b, .95);
  const stucco = mat(0x565049, .92);

  const channel = new THREE.Group();
  channel.name = 'no-wake channel and inlet';
  scene.add(channel);

  /* The board itself, on its own piling, to starboard on the way out. */
  const signPost = new THREE.Group();
  signPost.name = 'NO WAKE channel marker';
  signPost.add(cylinder('NO WAKE sign piling', .21, 5.4, timber, 0, 1.2, 0, 10));
  const board = textPlate('NO WAKE sign board', 'NO WAKE', 2.2, .96, {
    foreground: '#14202a', background: '#e6e2d2', border: '#2b3a44', font: 54,
  });
  board.position.set(0, 3.5, .12);
  board.rotation.y = Math.PI;
  signPost.add(board);
  signPost.add(box('NO WAKE sign backing', [2.3, 1.05, .09], mat(0x8d8878), 0, 3.5, .02));
  const signLamp = new THREE.PointLight(0xffd9a0, 2.0, 9, 2);
  signLamp.name = 'NO WAKE sign lamp';
  signLamp.position.set(0, 4.4, .5);
  signPost.add(signLamp);
  signPost.position.set(13.5, 0, -62);
  channel.add(signPost);

  /* Continuous banks on both sides make these shore houses read as a coast,
   * not as sixteen floating houseboats. The inner edges stay 65 m off the
   * channel centreline, leaving the full navigable corridor open all the way
   * to the inlet; the top remains the 1.9 m datum the houses were authored on. */
  channel.add(box('west channel shoreline', [160, 3.4, 560], mat(0x26382c), -145, .2, -250));
  channel.add(box('east channel shoreline', [160, 3.4, 560], mat(0x26382c), 145, .2, -250));

  /* Houses along the shore, thinning out as the marina falls away. */
  for (let i = 0; i < 16; i++) {
    const z = -30 - i * 17 - (i * i) * .9;
    const side = i % 2 ? 1 : -1;
    const x = side * (86 + (i % 3) * 22 + i * 3.5);
    const house = new THREE.Group();
    house.name = `shoreline house ${i + 1}`;
    house.add(box(`shoreline house walls ${i + 1}`, [9, 5, 7], stucco, 0, 2.48, 0));
    // walls run -0.02 to 4.98 in the house's own frame: 2 cm into the bank.
    const roof = mesh(`shoreline house roof ${i + 1}`, new THREE.ConeGeometry(7.4, 3.1, 4), mat(0x33291f), 0, 6.5, 0);
    roof.rotation.y = Math.PI / 4;
    house.add(roof);
    /* One lit window each, dimmer the further out they get, and the last few
     * dark: this is the shore going away. */
    if (i < 9) {
      const glow = new THREE.PointLight(0xffc887, 3.4 - i * .3, 26, 2);
      glow.name = `shoreline house window light ${i + 1}`;
      glow.position.set(side * -4.6, 2.6, 1.2);
      house.add(glow);
      const pane = box(`shoreline house window ${i + 1}`, [.2, 1.2, 1.6], mat(0xffd8a2, .5), side * -4.55, 2.6, 1.2);
      pane.material.emissive = new THREE.Color(0xd79a4a);
      pane.material.emissiveIntensity = 1.5 - i * .12;
      house.add(pane);
    }
    /* Both continuous banks top out at 1.9 m, so the house sits on land rather
     * than a metre inside it. */
    house.position.set(x, 1.9, z);
    house.rotation.y = side > 0 ? -.3 : .3;
    channel.add(house);
  }

  /* The wooded point to port, and the quarry face to starboard. Together they
   * close the inlet: from inside it, there is no line of sight to anywhere. */
  const point = new THREE.Group();
  point.name = 'wooded point';
  point.add(box('wooded point headland', [96, 9, 54], mat(0x1c2620), 0, 2.2, 0));
  const POINT_TOP = 2.2 + 4.5;
  for (let i = 0; i < 26; i++) {
    const tx = -44 + (i % 13) * 7.2 + (i > 12 ? 3.4 : 0);
    const tz = (i > 12 ? 12 : -8) + ((i * 5) % 17);
    point.add(cylinder(`point tree trunk ${i + 1}`, .22, 5.2, timber, tx, POINT_TOP + 2.58, tz, 7));
    point.add(mesh(`point tree crown ${i + 1}`, new THREE.ConeGeometry(2.2 + (i % 3) * .4, 7.6, 8), foliage, tx, POINT_TOP + 5.16 + 3.8, tz));
  }
  point.position.set(-62, 0, INLET.z - 6);
  channel.add(point);

  const quarry = new THREE.Group();
  quarry.name = 'quarry wall';
  quarry.add(box('quarry wall face', [70, 26, 40], rock, 0, 10, 0));
  for (let i = 0; i < 9; i++) {
    /* 2.18 of rise for 2.2 of bench: each terrace beds into the one below it
     * rather than balancing exactly on its top face. */
    quarry.add(box(`quarry bench ${i + 1}`, [66 - i * 4, 2.2, 3.6], rockPale, -i * 1.2, 2.4 + i * 2.18, -17 + i * .9));
  }
  quarry.add(box('quarry spoil heap', [30, 4, 12], rockPale, 12, 1.4, -22));
  quarry.position.set(56, 0, INLET.z + 10);
  channel.add(quarry);

  /* A back wall so the inlet is a pocket and not a corridor. */
  channel.add(box('inlet head land', [180, 12, INLET_HEADLAND.depth], mat(0x1a231e),
    0, 2.6, INLET_HEADLAND.centerZ));
  const HEAD_TOP = 2.6 + 6;
  for (let i = 0; i < 18; i++) {
    const tx = -78 + i * 9;
    const tz = INLET.z - 52 + (i % 3) * 5;
    channel.add(cylinder(`inlet head tree trunk ${i + 1}`, .24, 5.6, timber, tx, HEAD_TOP + 2.78, tz, 7));
    channel.add(mesh(`inlet head tree crown ${i + 1}`, new THREE.ConeGeometry(2.4, 8.2, 8), foliage, tx, HEAD_TOP + 5.56 + 4.1, tz));
  }
  return { root: channel, sign: signPost, point, quarry };
}

/**
 * The 42 ft express cruiser's hull, in her own frame.
 *
 * She was a 36-footer until the 2026-08-06 playtest (punch list N1): 0.36 m
 * more half beam, 0.70 m more bow and 0.50 m more stern, and fuller forward
 * through the sections the cabin lives under, because that is where the salon
 * had to come from. `deck-collision.js` carries the matching walkable extents.
 */
function cruiserHullGeometry() {
  const sections = CRUISER_HULL_SECTIONS;
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]; const b = sections[i + 1];
    for (const side of [-1, 1]) {
      const at = [side * a.w, .74, a.z];
      const ac = [side * a.w * .84, -.24, a.z];
      const ak = [0, -.98, a.z];
      const bt = [side * b.w, .74, b.z];
      const bc = [side * b.w * .84, -.24, b.z];
      const bk = [0, -.98, b.z];
      if (side > 0) {
        tri(at, bt, bc); tri(at, bc, ac); tri(ac, bc, bk); tri(ac, bk, ak);
      } else {
        tri(at, bc, bt); tri(at, ac, bc); tri(ac, bk, bc); tri(ac, ak, bk);
      }
    }
  }
  const stern = sections.at(-1);
  tri([-stern.w, .74, stern.z], [stern.w, -.24, stern.z], [stern.w, .74, stern.z]);
  tri([-stern.w, .74, stern.z], [-stern.w * .84, -.24, stern.z], [stern.w, -.24, stern.z]);
  tri([-stern.w * .84, -.24, stern.z], [0, -.98, stern.z], [stern.w, -.24, stern.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * One applied trim band that follows the same longitudinal stations as the
 * visible hull instead of carrying a full-length box past the fine bow.
 *
 * `supportY` is in boat-root space. The hull mesh itself sits 20 mm above that
 * root, so every station samples the visible skin at `supportY - .02`. The
 * outer face uses the band's bounded `proud` projection; the remaining
 * thickness beds into the moulding. This keeps every band visibly attached
 * while preserving the authored vertical size/material and a real,
 * outward-wound exterior face. The rubber rail projects 10 mm beyond the
 * cream cap so their overlapping vertical profiles never z-fight.
 */
function cruiserHullTrimGeometry({
  side, y, height, thickness, supportY = y, proud = .045, startZ, endZ,
}) {
  const stationZ = [
    startZ,
    ...CRUISER_HULL_SECTIONS.map((section) => section.z)
      .filter((z) => z > startZ && z < endZ),
    endZ,
  ];
  const yMin = y - height / 2;
  const yMax = y + height / 2;
  const rings = stationZ.map((z) => {
    const skin = cruiserHullHalfBeamAt(supportY - CRUISER_HULL_MESH_Y, z);
    const outer = skin + proud;
    const inner = Math.max(.02, outer - thickness);
    const at = (radius, atY) => [side * radius, atY, z];
    return {
      ib: at(inner, yMin), ob: at(outer, yMin),
      it: at(inner, yMax), ot: at(outer, yMax),
    };
  });
  const positions = [];
  const tri = (a, b, c) => {
    const ordered = side > 0 ? [a, b, c] : [a, c, b];
    positions.push(...ordered[0], ...ordered[1], ...ordered[2]);
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i]; const b = rings[i + 1];
    /* Outboard, inboard, top and bottom faces. */
    tri(a.ob, a.ot, b.ot); tri(a.ob, b.ot, b.ob);
    tri(a.ib, b.it, a.it); tri(a.ib, b.ib, b.it);
    tri(a.it, b.it, b.ot); tri(a.it, b.ot, a.ot);
    tri(a.ib, b.ob, b.ib); tri(a.ib, a.ob, b.ob);
  }
  const first = rings[0]; const last = rings.at(-1);
  tri(first.ib, first.it, first.ot); tri(first.ib, first.ot, first.ob);
  tri(last.ib, last.ob, last.ot); tri(last.ib, last.ot, last.it);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.userData.hullTrim = {
    supportY: supportY - CRUISER_HULL_MESH_Y,
    proud,
    stations: stationZ,
  };
  return geometry;
}

/**
 * The boat.
 *
 * "A fictional 35-36 ft express cabin cruiser, laid out like a stretched 270
 * Sundancer... Cream fiberglass with a dark burgundy stripe, smoked wraparound
 * windshield, analog gauges, chrome throttle levers, cream vinyl with weathered
 * seams, teak, brass fixtures and amber cabin light, twin inboards."
 *
 * "It should look like something Lou bought with cash through a guy who
 * definitely did not file the correct paperwork."
 */
function buildBoat(scene, marina) {
  const root = new THREE.Group();
  root.name = '42-foot express cruiser';
  root.userData.dimensions = {
    length: 12.83, hullLength: 11.80, beam: 5.12, feet: 42.1, deckHeight: DECK.height,
  };
  root.position.y = BOAT_FLOAT_Y;

  const cream = mat(0xe4dcc6, .62);
  const creamDeep = mat(0xd2c8ad, .70);
  const burgundy = mat(0x4a1520, .55);
  const teak = mat(0x6a4b32, .82);
  const teakDark = mat(0x3f2c20, .90);
  const vinyl = mat(0xe0d8c2, .82);
  const vinylSeam = mat(0xb3a98f, .86);
  const black = mat(0x161b1d, .74);
  const rubber = mat(0x111617, .95);
  const chrome = mat(0x9aa3a5, .24, .84);
  const brass = mat(0xb08b3e, .30, .80);
  const ropeMat = mat(0xa79470, .98);
  const smoked = new THREE.MeshPhysicalMaterial({
    color: 0x1e2a30, roughness: .14, transmission: .58, transparent: true,
    opacity: .42, depthWrite: false,
  });
  const castIron = mat(0x2c2f31, .88, .18);

  const hull = mesh('cream fiberglass hull', cruiserHullGeometry(), cream, 0, CRUISER_HULL_MESH_Y, 0);
  root.add(hull);
  // The stripe. Burgundy, because Lou paid cash.
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'port' : 'starboard';
    const trim = (name, material, options) => {
      const object = mesh(name, cruiserHullTrimGeometry({ side: sx, ...options }), material);
      object.userData.hullTrim = object.geometry.userData.hullTrim;
      root.add(object);
    };
    trim(`burgundy sheer stripe ${side}`, burgundy,
      { y: .40, height: .17, thickness: .10, startZ: -5.45, endZ: 5.35 });
    trim(`burgundy accent stripe ${side}`, burgundy,
      { y: .60, height: .07, thickness: .09, startZ: -5.45, endZ: 5.35 });
    trim(`rub strip ${side}`, rubber,
      { y: .74, height: .16, thickness: .13, proud: .055, startZ: -5.80, endZ: 5.50 });
    trim(`gunwale cap ${side}`, creamDeep,
      { y: .80, height: .12, thickness: .30, supportY: .74, startZ: -5.80, endZ: 5.50 });
  }
  root.add(box('transom face', [4.52, .82, .12], cream, 0, .36, 5.56));
  const transomName = textPlate('transom name sign', 'NO WAKE  ·  SOUTH HARBOR', 2.5, .26, {
    foreground: '#e8dfbf', background: '#4a1520', border: '#2a0d13', font: 34,
  });
  transomName.position.set(0, .46, 5.63);
  root.add(transomName);

  /* ---- soles and decks ---- */
  root.add(box('cockpit sole', [4.84, .10, 7.46], teak, 0, .97, 1.67));
  root.add(box('cockpit sole nonslip', [4.62, .02, 7.30], creamDeep, 0, 1.025, 1.67));
  /* The step boxes bed 1 cm into the sole rather than sitting exactly on its
   * top plane; two surfaces at the same depth are the flicker class the
   * geometry audit exists to catch. */
  /* Each step's underside is 1 cm INSIDE the one below it, and no step is
   * taller than its own rise. Authored 0.30 tall on a 0.18 rise they overlapped
   * by 0.12, which means every step's supporting face was 0.12 m ABOVE its own
   * base -- and `tools/scene-audit.mjs` reads a supporter as something whose
   * top is AT the thing's bottom, so the middle step reported as hanging in the
   * air. It was, in the only sense the audit can measure. */
  for (let i = 0; i < 3; i++) {
    root.add(box(`bridge deck step ${i + 1}`, [1.24, .24, .34], teak,
      0, 1.13 + i * .22, -1.20 - i * .30));
  }
  root.add(box('cabin trunk roof · foredeck', [4.84, .14, 4.00], creamDeep, 0, 1.63, -3.95));
  root.add(box('cabin trunk roof nonslip', [4.42, .02, 3.80], cream, 0, 1.705, -3.95));
  /* The trunk stands on the sheer (0.76) and carries the foredeck (1.56), so
   * the thing the player walks on forward has something under it. Authored
   * taller and lower, it hung in the hull with its base in mid-air; authored
   * to exactly 0.76 and exactly 1.56, it stopped hanging and started
   * flickering against both. 0.83 tall about the same centre buries 15 mm in
   * the hull and pushes 15 mm into the foredeck, which is what a moulding
   * actually does. */
  for (const sx of [-1, 1]) {
    root.add(box(`cabin trunk side ${sx < 0 ? 'port' : 'starboard'}`, [.14, .83, 4.00], cream, sx * 2.36, 1.16, -3.95));
  }
  root.add(box('cabin trunk forward face', [3.66, .83, .14], cream, 0, 1.16, -5.92));
  root.add(box('forward bulkhead', [4.74, .70, .16], cream, 0, 1.36, -2.00));

  /* ---- stern: swim platform, ladder, transom gate ---- */
  const platform = new THREE.Group();
  platform.name = 'swim platform';
  platform.add(box('swim platform deck', [3.72, .11, 1.00], teak, 0, .07, 6.08));
  platform.add(box('swim platform nonslip', [3.52, .02, .90], creamDeep, 0, .13, 6.08));
  for (const sx of [-1, 1]) {
    platform.add(box(`swim platform bracket ${sx < 0 ? 'port' : 'starboard'}`, [.10, .52, .40], chrome, sx * 1.54, .30, 5.66));
  }
  platform.add(box('swim ladder rail port', [.05, .60, .05], chrome, .94, .38, 6.42));
  platform.add(box('swim ladder rail starboard', [.05, .60, .05], chrome, 1.26, .38, 6.42));
  for (const [i, y] of [.22, .02].entries()) {
    platform.add(box(`swim ladder step ${i + 1}`, [.36, .03, .10], chrome, 1.10, y, 6.44));
  }
  root.add(platform);
  /* PUNCH LIST N4: "after wrapping the body, E would not dump it off the back."
   *
   * This box is why. It was 1.00 m tall, topping out at 1.05 -- level with the
   * water, a metre and a half BELOW the eye of the man the mission has just
   * planted on the platform and told to press E. His authored aim looked 17°
   * down at the horizon and the ray went straight over it, so the crosshair
   * found nothing, no prompt appeared, and `InteractionSystem.press()` returned
   * on `!this.current` without so much as a click. The hold never even started.
   *
   * It reaches from the water to head height and 2.1 m aft now, so every aim
   * between 9° and 50° below the horizontal from the disposal mark lands in it,
   * and `reachPlatform()` points him at the bag rather than past it. Invisible
   * and live only during `phase === 'platform'`, so nothing else can catch it.
   * `tools/verify-no-wake.mjs` holds a real KeyE on it. */
  const disposalZone = proxy('disposal zone · platform aft edge', [3.4, 2.4, 2.1], .55, 1.05, 6.20);
  root.add(disposalZone);

  const transomGate = new THREE.Group();
  transomGate.name = 'starboard transom gate';
  transomGate.add(beamBetween('transom gate upper rail',
    new THREE.Vector3(2.42, 1.72, 4.78), new THREE.Vector3(2.42, 1.72, 5.48), .028, chrome, 8));
  transomGate.add(beamBetween('transom gate lower rail',
    new THREE.Vector3(2.42, 1.34, 4.78), new THREE.Vector3(2.42, 1.34, 5.48), .024, chrome, 8));
  transomGate.add(cylinder('transom gate latch post', .028, .68, chrome, 2.45, 2.09, 5.40, 8));
  root.add(transomGate);

  /* Storage hatch in the cockpit sole: the tarp and the bag live in here. */
  const sternLocker = new THREE.Group();
  sternLocker.name = 'stern storage hatch';
  sternLocker.add(box('stern hatch lid', [1.30, .06, .82], teak, 1.14, 1.06, 3.42));
  sternLocker.add(box('stern hatch seam', [1.36, .02, .88], teakDark, 1.14, 1.035, 3.42));
  sternLocker.add(mesh('stern hatch lift ring', new THREE.TorusGeometry(.072, .012, 6, 16), chrome, 1.14, 1.10, 3.16)
    .rotateX(-Math.PI / 2));
  root.add(sternLocker);
  const sternLockerTarget = proxy('stern storage hatch interaction', [1.5, 1.2, 1.2], 1.14, 1.62, 3.42);
  root.add(sternLockerTarget);

  /* ---- aft cockpit ---- */
  // U-shaped cream seating with weathered seams, opening to starboard so the
  // route from the companionway to the transom gate is never blocked.
  const seating = new THREE.Group();
  seating.name = 'aft cockpit seating';
  /* The port return stops 2 cm INTO the aft bench rather than running past it.
   * Overlapping the full corner made two seat tops share one plane over a
   * third of a square metre, which is a flicker you would see every time the
   * camera moved; butting them exactly would have traded it for the same fight
   * on their end faces. The cushion still runs the whole corner -- it is one
   * piece of vinyl over two mouldings, which is how the boat is built. */
  seating.add(box('cockpit seat base · port return', [.86, .46, 1.93], creamDeep, -1.91, 1.23, 3.535));
  seating.add(box('cockpit seat cushion · port return', [.80, .13, 2.20], vinyl, -1.91, 1.52, 3.71));
  seating.add(box('cockpit seat seam · port return', [.82, .03, .04], vinylSeam, -1.91, 1.59, 3.71));
  seating.add(box('cockpit seat back · port return', [.16, .48, 2.28], vinyl, -2.30, 1.80, 3.71));
  seating.add(box('cockpit seat base · aft bench', [2.96, .45, .64], creamDeep, -0.87, 1.235, 4.80));
  seating.add(box('cockpit seat cushion · aft bench', [2.88, .13, .58], vinyl, -0.87, 1.52, 4.80));
  seating.add(box('cockpit seat seam · aft bench', [2.88, .03, .04], vinylSeam, -0.87, 1.59, 4.80));
  seating.add(box('cockpit seat back · aft bench', [2.96, .48, .16], vinyl, -0.87, 1.80, 5.04));
  seating.add(box('cockpit seat base · forward leg', [1.78, .47, .52], creamDeep, -1.45, 1.225, 2.58));
  seating.add(box('cockpit seat cushion · forward leg', [1.72, .13, .46], vinyl, -1.45, 1.52, 2.58));
  seating.add(box('cockpit seat back · forward leg', [1.78, .48, .14], vinyl, -1.45, 1.80, 2.36));
  root.add(seating);
  // The removable cocktail table, mounted on the seating rather than loose in
  // the middle of the cockpit where it could become slapstick debris.
  root.add(box('cocktail table pedestal', [.08, .40, .08], chrome, -1.76, 1.79, 3.42));
  root.add(box('cocktail table top', [.52, .04, .70], teak, -1.76, 2.00, 3.42));
  for (const [i, z] of [3.16, 3.68].entries()) {
    root.add(mesh(`cockpit cupholder ${i + 1}`, new THREE.TorusGeometry(.055, .012, 6, 14), chrome, -2.28, 1.86, z)
      .rotateX(-Math.PI / 2));
  }
  root.add(cylinder('cockpit ashtray', .075, .04, mat(0x4f5457, .5), -1.76, 2.04, 3.14, 14));
  // Engine hatch, with its seams and rings, flush in the sole. It lives in the
  // clear centre lane: the old 2.30 m lid ran underneath both fixed benches,
  // so neither the hatch nor the seating could physically exist as authored.
  root.add(box('engine hatch lid', [.92, .04, 1.90], teak, 0, 1.045, 2.10));
  for (const [i, x] of [-.48, .48].entries()) {
    root.add(box(`engine hatch seam ${i + 1}`, [.035, .02, 1.94], black, x, 1.045, 2.10));
    root.add(mesh(`engine hatch lift ring ${i + 1}`, new THREE.TorusGeometry(.075, .012, 6, 18), chrome, x + (i ? -.20 : .20), 1.07, 1.34)
      .rotateX(-Math.PI / 2));
  }
  /* Wet footprints on the boards, from whoever came aboard before the player.
   * "decal" keeps the geometry audit from asking what holds them up. */
  for (const [i, [x, z]] of [[-.55, 4.05], [-.30, 3.55], [-.55, 3.05], [-.28, 2.55], [-.52, 2.05]].entries()) {
    const print = mesh(`wet footprint decal ${i + 1}`, new THREE.CircleGeometry(.12, 14), mat(0x6f6a5c, .96), x, 1.036, z);
    print.rotation.x = -Math.PI / 2;
    print.scale.set(.62, 1, 1);
    print.castShadow = false;
    root.add(print);
  }
  // Coiled dock lines and life jackets, stowed on the seating.
  root.add(mesh('cockpit rope coil', new THREE.TorusGeometry(.20, .045, 8, 20), ropeMat, -1.91, 1.62, 2.90)
    .rotateX(-Math.PI / 2));
  for (const [i, z] of [4.56, 4.86].entries()) {
    root.add(box(`stowed life jacket ${i + 1}`, [.34, .10, .26], mat(0xc4512f, .9), -2.22, 1.64, z));
  }
  // Clear the helm-bench corner: this is clipped to the coaming, not buried
  // in the seat base the player walks around.
  root.add(cylinder('cockpit fire extinguisher', .10, .50, mat(0xa8352a), 2.26, 1.30, 1.90, 16));

  /* ---- coamings, rails and pulpit ---- */
  function railRun(name, x, z0, z1, base) {
    const lower = base + .34;
    const upper = base + .72;
    root.add(beamBetween(`${name} lower rail`, new THREE.Vector3(x, lower, z0), new THREE.Vector3(x, lower, z1), .026, chrome, 8));
    root.add(beamBetween(`${name} upper rail`, new THREE.Vector3(x, upper, z0), new THREE.Vector3(x, upper, z1), .030, chrome, 8));
    const count = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 1.5));
    for (let i = 0; i <= count; i++) {
      const z = THREE.MathUtils.lerp(z0, z1, i / count);
      root.add(cylinder(`${name} stanchion ${i + 1}`, .027, .74, chrome, x, base + .37, z, 8));
    }
  }
  railRun('port bow rail', -2.50, -5.80, -1.62, DECK.foredeckHeight);
  railRun('starboard bow rail', 2.50, -5.80, -1.62, DECK.foredeckHeight);
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'port' : 'starboard';
    root.add(beamBetween(`${side} pulpit rail upper`,
      new THREE.Vector3(sx * .10, 1.92, -6.32), new THREE.Vector3(sx * 2.50, 2.42, -5.76), .030, chrome, 8));
    root.add(beamBetween(`${side} pulpit rail lower`,
      new THREE.Vector3(sx * .09, 1.72, -6.30), new THREE.Vector3(sx * 2.50, 2.04, -5.76), .024, chrome, 8));
    // Cockpit coaming: a solid moulding rather than open rail, aft.
    root.add(box(`${side} cockpit coaming`, [.20, .70, 5.50], creamDeep, sx * 2.47, 1.36, 2.75));
    root.add(box(`${side} coaming cap`, [.26, .06, 5.50], teak, sx * 2.47, 1.72, 2.75));
  }
  root.add(box('stern coaming', [4.74, .70, .20], creamDeep, 0, 1.36, 5.36));
  root.add(box('stern coaming cap', [4.74, .06, .26], teak, 0, 1.72, 5.36));

  /* ---- bow: sun pad, anchor hatch, forward locker, searchlight ---- */
  const bow = new THREE.Group();
  bow.name = 'foredeck fittings';
  // Keep the removable cushion aft of the ballast-locker lid so the lid can
  // actually lift instead of passing through 28 cm of upholstery.
  bow.add(box('bow sun pad cushion', [2.70, .13, 1.30], vinyl, 0, 1.77, -3.30));
  bow.add(box('bow sun pad seam', [2.70, .03, .04], vinylSeam, 0, 1.84, -3.30));
  bow.add(box('anchor hatch lid', [1.00, .05, .80], creamDeep, 0, 1.73, -5.32));
  bow.add(box('anchor hatch seam', [1.06, .02, .86], teakDark, 0, 1.70, -5.32));
  bow.add(mesh('anchor hatch lift ring', new THREE.TorusGeometry(.07, .012, 6, 16), chrome, 0, 1.76, -5.02)
    .rotateX(-Math.PI / 2));
  bow.add(mesh('bow rope coil', new THREE.TorusGeometry(.22, .05, 8, 20), ropeMat, -1.60, 1.77, -5.00)
    .rotateX(-Math.PI / 2));
  const searchlight = new THREE.Group();
  searchlight.name = 'bow searchlight';
  searchlight.add(cylinder('searchlight body', .12, .18, chrome, 0, 0, 0, 16).rotateX(Math.PI / 2));
  searchlight.add(mesh('searchlight lens', new THREE.CircleGeometry(.10, 16), mat(0xe8e2c8, .3), 0, 0, -.10));
  searchlight.add(cylinder('searchlight pedestal', .05, .16, chrome, 0, -.16, 0, 10));
  // The pedestal bottoms exactly on the foredeck rather than 8 cm through it.
  searchlight.position.set(1.10, 1.94, -4.80);
  bow.add(searchlight);
  const bowNav = new THREE.PointLight(0xf2f4e6, 1.4, 3.4, 2);
  bowNav.name = 'bow navigation light glow';
  bowNav.position.set(0, 1.98, -6.00);
  bow.add(bowNav);
  // The housing's 16 cm body now starts on the foredeck datum.
  bow.add(cylinder('bow navigation light housing', .05, .16, chrome, 0, 1.78, -6.00, 10));

  /* The forward locker, and the cast iron in it. "Two cast-iron pieces or one
   * bundled ballast prop, visibly heavy without being a physics puzzle." */
  const locker = new THREE.Group();
  locker.name = 'forward ballast locker';
  const lockerLid = box('forward locker lid', [1.20, .06, .90], creamDeep, -.02, 1.74, -4.42);
  locker.add(lockerLid);
  /* The seam sits at the lid's waist, not under its lip. Flush with the lid's
   * underside it shared a plane with the sun pad's base over 0.39 m²; the deck
   * stack here (roof 1.70, nonslip 1.695-1.715, lid 1.71-1.77, pad from 1.705)
   * has no 2 cm gap below the lid to put it in, and there is one above. */
  locker.add(box('forward locker seam', [1.26, .02, .96], teakDark, -.02, 1.7525, -4.42));
  locker.add(mesh('forward locker lift ring', new THREE.TorusGeometry(.07, .012, 6, 16), brass, -.02, 1.77, -4.12)
    .rotateX(-Math.PI / 2));
  const ballast = new THREE.Group();
  ballast.name = 'cast-iron ballast bundle';
  ballast.add(box('ballast pig forward', [.44, .16, .22], castIron, 0, .08, -.14));
  ballast.add(box('ballast pig aft', [.44, .16, .22], castIron, 0, .08, .14));
  ballast.add(beamBetween('ballast strap',
    new THREE.Vector3(-.10, .18, -.20), new THREE.Vector3(-.10, .18, .20), .022, mat(0x30281f, .95), 8));
  ballast.add(beamBetween('ballast shackle',
    new THREE.Vector3(.16, .20, 0), new THREE.Vector3(.16, .28, 0), .026, chrome, 8));
  ballast.position.set(-.02, 1.50, -4.42);
  ballast.visible = false;
  locker.add(ballast);
  bow.add(locker);
  const lockerTarget = proxy('forward locker interaction', [1.7, 1.3, 1.5], -.02, 2.1, -4.42);
  bow.add(lockerTarget);
  root.add(bow);

  /* ---- windshield: smoked, wraparound, with a centre walk-through ---- */
  const windshield = new THREE.Group();
  windshield.name = 'smoked wraparound windshield';
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'port' : 'starboard';
    const pane = box(`windshield pane ${side}`, [1.72, .78, .05], smoked, sx * 1.52, 2.10, -1.74);
    pane.rotation.x = -.16;
    windshield.add(pane);
    const wing = box(`windshield wing pane ${side}`, [.05, .70, .58], smoked, sx * 2.38, 2.06, -1.44);
    windshield.add(wing);
    windshield.add(box(`windshield frame outboard ${side}`, [.07, .86, .09], creamDeep, sx * 2.38, 2.08, -1.72));
    windshield.add(box(`windshield frame inboard ${side}`, [.07, .86, .09], creamDeep, sx * .66, 2.08, -1.72));
    windshield.add(box(`windshield frame cap ${side}`, [1.82, .07, .10], creamDeep, sx * 1.52, 2.50, -1.76));
    windshield.add(box(`windshield frame sill ${side}`, [1.82, .07, .10], creamDeep, sx * 1.52, 1.70, -1.70));
    windshield.add(beamBetween(`windshield wiper ${side}`,
      new THREE.Vector3(sx * 1.90, 1.86, -1.70), new THREE.Vector3(sx * 1.20, 2.36, -1.74), .016, black, 7));
  }
  // The walk-through's own low centre pane and grab rails.
  windshield.add(box('windshield walk-through door', [1.22, .42, .05], smoked, 0, 1.92, -1.74));
  for (const sx of [-1, 1]) {
    windshield.add(beamBetween(`walk-through grab rail ${sx < 0 ? 'port' : 'starboard'}`,
      new THREE.Vector3(sx * .58, 1.74, -1.62), new THREE.Vector3(sx * .58, 2.26, -1.62), .022, chrome, 8));
  }
  root.add(windshield);

  /* ---- helm, to starboard ---- */
  const helm = new THREE.Group();
  helm.name = 'starboard helm station';
  helm.add(box('helm console pedestal', [2.10, 1.10, .84], creamDeep, 1.40, 1.55, -.66));
  const dashPanel = box('helm dash panel', [2.18, .20, .74], black, 1.40, 2.10, -.68);
  dashPanel.rotation.x = -.22;
  helm.add(dashPanel);
  helm.add(box('helm console side pod', [.34, .70, .66], creamDeep, .48, 1.35, -.72));

  const wheel = new THREE.Group();
  wheel.name = 'stainless helm wheel';
  wheel.add(mesh('helm wheel rim', new THREE.TorusGeometry(.32, .032, 9, 26), chrome, 0, 0, 0));
  const hub = cylinder('helm wheel hub', .062, .10, chrome, 0, 0, -.025, 16);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    wheel.add(beamBetween(`helm wheel spoke ${i + 1}`,
      new THREE.Vector3(Math.cos(a) * .07, Math.sin(a) * .07, 0),
      new THREE.Vector3(Math.cos(a) * .28, Math.sin(a) * .28, 0), .013, chrome, 7));
  }
  /* The wheel stands 0.40 m proud of the fascia on its own raked column, so
   * the 0.64 m rim never sweeps through the instruments behind it. */
  wheel.position.set(1.30, 1.98, -.16);
  wheel.rotation.x = .18;
  helm.add(wheel);
  helm.add(beamBetween('helm steering column',
    new THREE.Vector3(1.30, 1.86, -.56), new THREE.Vector3(1.30, 1.97, -.22), .048, chrome, 10));

  function gauge(label, x, y, z) {
    const g = new THREE.Group();
    g.name = `helm gauge · ${label}`;
    const bezel = cylinder(`${label} gauge bezel`, .145, .05, chrome, 0, 0, 0, 26);
    bezel.rotation.x = Math.PI / 2;
    const face = mesh(`${label} gauge face`, new THREE.CircleGeometry(.12, 26), mat(0x07100f), 0, 0, .032);
    const needle = box(`${label} gauge needle`, [.016, .10, .010], mat(0xe2c95d), 0, .022, .046);
    needle.geometry.translate(0, .032, 0);
    /* A chrome rim standing proud of the glass, which is what a 1988 gauge
     * looks like -- and the only thing on this dash that is actually AROUND
     * the needle. The can behind the dial ends 7 mm short of the needle's
     * face, so before this ring every needle but DEPTH was a bright sliver
     * with nothing near it in any direction: the geometry audit read four of
     * them as hanging in the air, and it was reading the model correctly. */
    const rim = mesh(`${label} gauge rim`, new THREE.TorusGeometry(.132, .016, 8, 24), chrome, 0, 0, .048);
    const title = textPlate(`${label} gauge label`, label, .20, .05, {
      foreground: '#d7e3df', background: '#07100f', border: '#07100f', font: 26,
    });
    title.position.set(0, -.086, .052);
    g.add(bezel, face, needle, rim, title);
    g.position.set(x, y, z);
    helm.add(g);
    return needle;
  }
  const gaugeNeedles = {
    tachPort: gauge('TACH P', .84, 2.22, -.40),
    tachStarboard: gauge('TACH S', 1.16, 2.22, -.40),
    speed: gauge('KNOTS', 1.48, 2.22, -.40),
    fuel: gauge('FUEL', 1.80, 2.22, -.40),
    depth: gauge('DEPTH', 2.04, 1.96, -.44),
  };

  // Warning lights, in a row along the top of the fascia.
  const warningMats = [];
  for (const [i, label] of ['OIL', 'TEMP', 'VOLT'].entries()) {
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x2a2118, emissive: 0x000000, emissiveIntensity: 0 });
    warningMats.push(lampMat);
    const lamp = cylinder(`helm warning light ${label}`, .026, .022, lampMat, .78 + i * .16, 2.42, -.50, 12);
    lamp.rotation.x = Math.PI / 2;
    helm.add(lamp);
  }

  const compass = mesh('helm compass', new THREE.SphereGeometry(.14, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), smoked, 1.30, 2.28, -.92);
  compass.rotation.x = -.22;
  helm.add(compass);
  helm.add(mesh('helm compass brass ring', new THREE.TorusGeometry(.145, .014, 8, 20), brass, 1.30, 2.28, -.92)
    .rotateX(-Math.PI / 2));

  const vhf = box('marine VHF radio', [.42, .24, .17], black, 2.04, 2.20, -.56);
  helm.add(vhf);
  const vhfFace = textPlate('VHF channel face', 'VHF 16', .38, .13, {
    foreground: '#78c8b7', background: '#0b1719', border: '#273234', font: 30,
  });
  vhfFace.position.set(2.04, 2.21, -.47);
  helm.add(vhfFace);

  /* The startup panel. Battery selector, blower, fuel valve, two ignitions and
   * the navigation-light switch, in one row at hand height. The player performs
   * this in silence; nothing here reacts comically to being touched.
   *
   * PUNCH LIST N2: "the startup controls are too bunched to hit individually".
   * They were six fittings 0.07-0.17 m across on 0.22-0.26 m centres, aimed at
   * through their own bezels from a moving deck, and the broad `startPanel`
   * proxy behind them answered every near miss with "next: Blower" instead of
   * the blower. Two changes, and both are measured by `tools/verify-no-wake.mjs`:
   *
   *  1. `PANEL_CONTROL_X` puts them on 0.36 m centres across the full width of
   *     the console — 45% more separation, and no pair closer than the reach of
   *     a hand.
   *  2. Every one of them carries its own 0.30 m interaction proxy. A bezel is
   *     not a target; a 0.30 m box on 0.36 m centres is, and because the box is
   *     smaller than the spacing no two of them can ever overlap.
   *
   * The row also dropped to 1.46, below the wheel rim's 1.63 sweep. At 1.62 the
   * middle of a 0.36 m row would have been behind the wheel. */
  helm.add(box('engine start panel', [2.16, .44, .10], black, 1.40, 1.39, -.28));
  const panelTitle = textPlate('engine start panel label', 'BATT · BLOWER · FUEL · PORT · STBD · NAV', 1.30, .09, {
    foreground: '#e7dec0', background: '#171d1f', border: '#555e5f', font: 22,
  });
  panelTitle.position.set(1.40, 1.22, -.22);
  helm.add(panelTitle);

  /* One row, six centres, 0.36 m apart. Read by the panel, by every control
   * below and by the verifier's spacing assertion, so "spaced out" is one
   * number and not six. */
  const PANEL_Y = 1.46;
  const PANEL_Z = -.22;
  const PANEL_CONTROL_X = [.50, .86, 1.22, 1.58, 1.94, 2.30];
  /** A hand-sized hit volume on a control that is the size of a bezel. */
  const controlProxy = (group, name) => {
    group.add(proxy(`${name} hit volume`, [.30, .30, .26], 0, 0, .06));
    return group;
  };

  const battery = new THREE.Group();
  battery.name = 'battery selector switch';
  battery.add(cylinder('battery selector body', .085, .06, black, 0, 0, 0, 20).rotateX(Math.PI / 2));
  const batteryKnob = box('battery selector knob', [.11, .04, .07], mat(0xc9403a), 0, 0, .05);
  battery.add(batteryKnob);
  battery.position.set(PANEL_CONTROL_X[0], PANEL_Y, PANEL_Z);
  helm.add(controlProxy(battery, 'battery selector'));

  const blower = new THREE.Group();
  blower.name = 'bilge blower push button';
  blower.add(cylinder('blower bezel', .075, .05, chrome, 0, 0, 0, 20).rotateX(Math.PI / 2));
  const blowerButton = cylinder('blower button', .055, .07, mat(0xd3a529), 0, 0, .05, 20);
  blowerButton.rotation.x = Math.PI / 2;
  blower.add(blowerButton);
  blower.position.set(PANEL_CONTROL_X[1], PANEL_Y, PANEL_Z);
  helm.add(controlProxy(blower, 'bilge blower'));

  const fuelValve = new THREE.Group();
  fuelValve.name = 'fuel valve and sight check';
  fuelValve.add(cylinder('fuel valve body', .06, .05, brass, 0, 0, 0, 16).rotateX(Math.PI / 2));
  const fuelLever = box('fuel valve lever', [.13, .03, .05], brass, .04, 0, .05);
  fuelValve.add(fuelLever);
  fuelValve.position.set(PANEL_CONTROL_X[2], PANEL_Y, PANEL_Z);
  helm.add(controlProxy(fuelValve, 'fuel valve'));

  const ignitions = {};
  for (const [i, side] of ['port', 'starboard'].entries()) {
    const ignition = new THREE.Group();
    ignition.name = `${side} engine ignition key`;
    /* 12 cm of barrel, nine of them behind the fascia, so the shank is inside
     * something. At 5 cm the barrel stopped 17 mm short of where the key
     * began and the two never met in plan at all -- a key floating in front of
     * its own lock. */
    ignition.add(cylinder(`${side} ignition barrel`, .062, .12, chrome, 0, 0, .03, 20).rotateX(Math.PI / 2));
    const keyTurn = new THREE.Group();
    keyTurn.name = `${side} ignition key turn`;
    /* Barrel holds shank, shank holds fob. Authored as three things that each
     * began where the last one ended, the chain had a gap at every link: the
     * shank started below the barrel's mouth and the fob hung under the shank
     * with air between them, which is how a key looks when nobody has asked
     * what is carrying it. The shank now sits INSIDE the barrel and the fob is
     * threaded onto its lower half. */
    keyTurn.add(box(`${side} ignition key blade`, [.035, .12, .025], mat(0xc6b67c, .34, .55), 0, -.03, .055));
    keyTurn.add(box(`${side} ignition key fob`, [.08, .07, .03], rubber, 0, -.075, .055));
    ignition.add(keyTurn);
    ignition.position.set(PANEL_CONTROL_X[3 + i], PANEL_Y, PANEL_Z);
    helm.add(controlProxy(ignition, `${side} ignition`));
    ignitions[side] = { root: ignition, keyTurn };
  }

  const navSwitch = new THREE.Group();
  navSwitch.name = 'navigation light switch';
  navSwitch.add(box('nav switch body', [.10, .14, .06], black, 0, 0, 0));
  const navLever = box('nav switch lever', [.06, .09, .05], mat(0x86d0a0), 0, 0, .045);
  navSwitch.add(navLever);
  navSwitch.position.set(PANEL_CONTROL_X[5], PANEL_Y, PANEL_Z);
  helm.add(controlProxy(navSwitch, 'navigation light switch'));

  const indicatorMat = new THREE.MeshStandardMaterial({ color: 0x25312d, emissive: 0x000000, emissiveIntensity: 0 });
  const indicator = cylinder('helm running indicator', .03, .03, indicatorMat, .62, 1.70, -.24, 14);
  indicator.rotation.x = Math.PI / 2;
  helm.add(indicator);

  /* Chrome twin throttle levers on the side pod at the helmsman's right hand. */
  const throttle = new THREE.Group();
  throttle.name = 'chrome twin throttle levers';
  throttle.add(box('throttle base plate', [.30, .10, .42], chrome, 0, 0, 0));
  const throttlePivot = new THREE.Group();
  throttlePivot.name = 'throttle lever pivot';
  throttlePivot.add(box('throttle lever port', [.05, .40, .05], chrome, -.06, .17, 0));
  throttlePivot.add(box('throttle lever starboard', [.05, .40, .05], chrome, .06, .17, 0));
  throttlePivot.add(box('throttle lever knob port', [.08, .10, .10], black, -.06, .39, 0));
  throttlePivot.add(box('throttle lever knob starboard', [.08, .10, .10], black, .06, .39, 0));
  throttle.add(throttlePivot);
  throttle.position.set(2.16, 1.66, -.72);
  throttle.rotation.x = 1.05;
  helm.add(throttle);

  const helmTarget = proxy('broad helm interaction proxy', [1.90, 1.72, .90], 1.34, 1.88, -.52);
  helm.add(helmTarget);
  const startPanelTarget = proxy('startup panel interaction', [2.24, .58, .60], 1.40, PANEL_Y, -.26);
  helm.add(startPanelTarget);

  // The helm bench: a double, so the collision mass and the mesh agree.
  helm.add(box('helm bench base', [1.80, .47, .90], creamDeep, 1.43, 1.245, 1.19));
  helm.add(box('helm bench cushion', [1.76, .14, .84], vinyl, 1.43, 1.555, 1.19));
  helm.add(box('helm bench seam', [1.76, .03, .04], vinylSeam, 1.43, 1.62, 1.19));
  helm.add(box('helm bench back', [1.76, .52, .16], vinyl, 1.43, 1.86, 1.53));
  root.add(helm);

  /* ---- companionway on deck ---- */
  const companionwayDeck = new THREE.Group();
  companionwayDeck.name = 'companionway head';
  companionwayDeck.add(box('companionway coaming port', [.10, .34, 1.40], creamDeep, -2.24, 1.19, -.70));
  companionwayDeck.add(box('companionway coaming starboard', [.10, .34, 1.40], creamDeep, -.69, 1.19, -.70));
  companionwayDeck.add(box('companionway coaming forward', [1.65, .34, .10], creamDeep, -1.465, 1.19, -1.35));
  const slidingHatch = box('companionway sliding hatch', [1.67, .07, .74], smoked, -1.465, 1.40, -1.06);
  companionwayDeck.add(slidingHatch);
  companionwayDeck.add(beamBetween('companionway grab rail',
    new THREE.Vector3(-.66, 1.42, -1.30), new THREE.Vector3(-.66, 1.42, -.16), .022, chrome, 8));
  root.add(companionwayDeck);
  const companionwayTarget = proxy('companionway interaction · deck', [1.90, 1.60, 1.60], -1.465, 1.80, -.70);
  root.add(companionwayTarget);

  /* ---- mast, antennas, navigation lights, cleats, fenders ---- */
  /* Bolted to the gunwale caps at 1.75, which is where an arch is actually
   * through-bolted, rather than beginning 0.7 m above the cockpit sole. */
  root.add(cylinder('radar arch leg port', .06, 1.40, chrome, -2.42, 2.45, .60, 10));
  root.add(cylinder('radar arch leg starboard', .06, 1.40, chrome, 2.42, 2.45, .60, 10));
  root.add(box('radar arch beam', [4.96, .12, .18], chrome, 0, 3.15, .60));
  root.add(beamBetween('VHF whip antenna',
    new THREE.Vector3(-2.42, 3.15, .60), new THREE.Vector3(-2.54, 5.05, .48), .016, chrome, 7));
  const sternNavLight = new THREE.PointLight(0xfff0d0, 0, 6, 2);
  sternNavLight.name = 'stern navigation light glow';
  sternNavLight.position.set(0, 3.29, .60);
  root.add(sternNavLight);
  const redNav = new THREE.PointLight(0xff3d2d, 0, 5, 2);
  redNav.name = 'port navigation light glow';
  redNav.position.set(-2.38, 1.98, -5.68);
  const greenNav = new THREE.PointLight(0x43df82, 0, 5, 2);
  greenNav.name = 'starboard navigation light glow';
  greenNav.position.set(2.38, 1.98, -5.68);
  root.add(redNav, greenNav);
  const redLens = cylinder('port navigation light lens', .045, .10, mat(0x6b1a15, .5), -2.38, 1.92, -5.68, 10);
  const greenLens = cylinder('starboard navigation light lens', .045, .10, mat(0x14512c, .5), 2.38, 1.92, -5.68, 10);
  root.add(redLens, greenLens);

  function boatCleat(name, x, z, y) {
    const cleat = new THREE.Group();
    cleat.name = name;
    /* Horns from the deck up, bar on top of them. Authored the other way
     * round, the horns' feet were 4 cm under the boards and the audit was
     * right to say nothing held them there. */
    cleat.add(cylinder(`${name} horn forward`, .04, .18, chrome, -.12, .09, 0, 8));
    cleat.add(cylinder(`${name} horn aft`, .04, .18, chrome, .12, .09, 0, 8));
    cleat.add(box(`${name} bar`, [.36, .07, .12], chrome, 0, .215, 0));
    cleat.position.set(x, y, z);
    root.add(cleat);
    return cleat;
  }
  const bowCleat = boatCleat('bow mooring cleat', -2.30, -5.56, DECK.foredeckHeight);
  boatCleat('stern mooring cleat port', -2.30, 5.22, DECK.height);
  boatCleat('stern mooring cleat starboard', 2.30, 5.22, DECK.height);
  for (const [i, z] of [-4.3, -.4, 4.2].entries()) {
    const fender = cylinder(`hanging dock fender ${i + 1}`, .16, .84, vinyl, -2.74, .80, z, 16);
    root.add(fender);
    root.add(beamBetween(`hanging fender lanyard ${i + 1}`,
      new THREE.Vector3(-2.48, 1.30, z), new THREE.Vector3(-2.74, 1.18, z), .016, ropeMat, 7));
  }

  /* ---- boarding gangway ---- */
  const gangway = new THREE.Group();
  gangway.name = 'visible physical boarding bridge';
  const gangwayDeck = box('boarding bridge nonslip deck', [1.56, .13, 1.10], teak, -3.33, .72, 3.10);
  gangwayDeck.rotation.z = .32;
  gangway.add(gangwayDeck);
  const gangwayEdgePort = box('boarding bridge edge forward', [1.60, .10, .075], mat(0xc2a648, .72), -3.33, .79, 2.56);
  gangwayEdgePort.rotation.z = .32;
  const gangwayEdgeStarboard = gangwayEdgePort.clone();
  gangwayEdgeStarboard.name = 'boarding bridge edge aft';
  gangwayEdgeStarboard.position.z = 3.64;
  gangway.add(gangwayEdgePort, gangwayEdgeStarboard);
  gangway.add(box('boarding bridge dock step', [.62, .20, 1.20], teakDark, -3.98, .32, 3.10));
  const gangwayHinge = cylinder('boarding bridge hinge', .09, 1.24, chrome, -2.68, 1.02, 3.10, 12);
  gangwayHinge.rotation.x = Math.PI / 2;
  gangway.add(gangwayHinge);
  root.add(gangway);
  const boardTarget = proxy('forgiving boarding bridge interaction', [2.4, 2.1, 2.2], -3.33, 1.10, 3.10);
  root.add(boardTarget);

  /* ---- the single dock line ---- */
  function mooringLine(id, boatEnd, dockEnd) {
    const line = new THREE.Group();
    line.name = `${id} mooring rope`;
    const middle = new THREE.Vector3().lerpVectors(boatEnd, dockEnd, .5);
    middle.y -= .26;
    line.add(lineCurve(`${id} mooring rope strand`, [
      boatEnd.clone(), new THREE.Vector3().lerpVectors(boatEnd, middle, .55),
      middle, new THREE.Vector3().lerpVectors(middle, dockEnd, .55), dockEnd.clone(),
    ], .034, ropeMat));
    const pickup = proxy(`${id} line cleat interaction`, [.80, .70, .84], boatEnd.x, boatEnd.y + .06, boatEnd.z);
    line.add(pickup);
    line.userData.lineId = id;
    line.userData.attached = true;
    scene.add(line);
    return line;
  }
  const dockLine = mooringLine(
    'dock', new THREE.Vector3(-2.30, DECK.foredeckHeight + .28 + BOAT_FLOAT_Y, -5.56), marina.dockCleat,
  );

  /* ---- below deck ---- */
  const cabin = buildCabin(root);

  /* ---- the marker over the body, and its interaction proxy ---- */
  const bodyMarker = new THREE.Group();
  bodyMarker.name = 'body objective marker';
  /* Keep the mission's visibility/position anchor, but do not hang a golden
   * arcade ring over a body. The body itself and the broad interaction proxy
   * carry this beat; main.js can continue toggling this empty anchor without
   * maintaining a second code path for the old marker. */
  bodyMarker.visible = false;
  root.add(bodyMarker);
  const bodyTarget = proxy('broad body interaction proxy', [2.10, 1.30, 2.30], .10, CABIN.height + .50, -3.53);
  root.add(bodyTarget);

  /* ---- controls ---- */
  let navOn = false;
  const controls = {
    battery: {
      root: battery,
      setOn(on) { batteryKnob.rotation.z = on ? -.7 : 0; },
    },
    blower: {
      root: blower,
      setOn(on) { blowerButton.position.z = on ? .028 : .05; },
    },
    fuel: {
      root: fuelValve,
      setOn(on) { fuelLever.rotation.z = on ? -1.2 : 0; },
    },
    ignitionPort: {
      root: ignitions.port.root,
      setOn(on) { ignitions.port.keyTurn.rotation.z = on ? -.72 : 0; },
    },
    ignitionStarboard: {
      root: ignitions.starboard.root,
      setOn(on) { ignitions.starboard.keyTurn.rotation.z = on ? -.72 : 0; },
    },
    navLights: {
      root: navSwitch,
      get on() { return navOn; },
      setOn(on) {
        navOn = on;
        navLever.position.y = on ? .03 : -.03;
        redNav.intensity = on ? 2.2 : 0;
        greenNav.intensity = on ? 2.2 : 0;
        sternNavLight.intensity = on ? 1.6 : 0;
        redLens.material.emissive.setHex(on ? 0xc12a20 : 0x000000);
        greenLens.material.emissive.setHex(on ? 0x22a758 : 0x000000);
        redLens.material.emissiveIntensity = on ? 1.6 : 0;
        greenLens.material.emissiveIntensity = on ? 1.6 : 0;
      },
    },
    running: {
      root: indicator,
      setOn(on) {
        indicatorMat.color.setHex(on ? 0x4fc477 : 0x25312d);
        indicatorMat.emissive.setHex(on ? 0x1c7e45 : 0x000000);
        indicatorMat.emissiveIntensity = on ? 1.8 : 0;
      },
    },
    warnings: {
      setOn(on) {
        for (const lamp of warningMats) {
          lamp.color.setHex(on ? 0xd8892c : 0x2a2118);
          lamp.emissive.setHex(on ? 0xa85c14 : 0x000000);
          lamp.emissiveIntensity = on ? 1.4 : 0;
        }
      },
    },
    throttle: {
      root: throttle,
      setValue(value) { throttlePivot.rotation.x = THREE.MathUtils.clamp(value, -1, 1) * -.58; },
    },
    radio: cabin.controls.radio,
    gaugeNeedles,
  };
  for (const key of ['battery', 'blower', 'fuel', 'ignitionPort', 'ignitionStarboard', 'navLights', 'running', 'warnings']) {
    controls[key].setOn(false);
  }

  const localColliders = DECK_COLLIDERS.map((entry) => {
    const solid = new THREE.Box3(
      new THREE.Vector3(entry.min[0], entry.min[1], entry.min[2]),
      new THREE.Vector3(entry.max[0], entry.max[1], entry.max[2]),
    );
    solid.name = entry.name;
    return solid;
  });
  const cabinColliders = CABIN_COLLIDERS.map((entry) => {
    const solid = new THREE.Box3(
      new THREE.Vector3(entry.min[0], entry.min[1], entry.min[2]),
      new THREE.Vector3(entry.max[0], entry.max[1], entry.max[2]),
    );
    solid.name = entry.name;
    return solid;
  });

  const targets = {
    board: boardTarget,
    startPanel: startPanelTarget,
    battery,
    blower,
    fuel: fuelValve,
    ignitionPort: ignitions.port.root,
    ignitionStarboard: ignitions.starboard.root,
    navLights: navSwitch,
    helm: helmTarget,
    dockLine,
    companionway: companionwayTarget,
    companionwayBelow: cabin.targets.companionway,
    radio: cabin.targets.radio,
    locker: lockerTarget,
    sternLocker: sternLockerTarget,
    body: bodyTarget,
    disposal: disposalZone,
  };

  /* ---- the cast ---- */
  const source = Object.fromEntries(FAMILY.map((member) => [member.id, member]));
  const cast = {
    /* Lou by the helm, Booski near the stern, Irish already aboard with
     * binoculars up forward. Nobody moves to greet Willy. */
    lou: new Npc(root, {
      /* PUNCH LIST N3: "Lou stands in the way at the startup panel." He was on
       * (0.38, 0.30) -- inside the console's own port-aft corner, on the only
       * route forward, and squarely between the player and the left-hand end of
       * the row he has just been told to work through. He watches from the port
       * quarter of the bridge deck now: 2.5 m clear of the nearest switch,
       * nothing of him on any line from the panel mark to any control, and
       * turned to face the helm so "get her started" is still said to somebody.
       * `tools/verify-no-wake.mjs` measures both clearances. */
      // Lou is west of the now-clear centre hatch and stands on the sole.
      name: 'Big Uncle Lou', tier: 'hero', x: -1.30, y: DECK.height, z: 1.60, yaw: 1.767,
      job: 'stand', model: { ...BIG_UNCLE_LOU, face: 'assets/faces/lou.png' },
    }),
    booski: new Npc(root, {
      name: 'Booskibro', tier: 'hero', x: -1.10, y: DECK.height, z: 3.30, yaw: Math.PI,
      job: 'stand', model: { ...source[CHARACTER_IDS.BOOSKI].model, face: 'assets/faces/booski.png' },
    }),
    willy: new Npc(root, {
      name: 'Willy', tier: 'hero', x: -.20, y: DECK.height + .045, z: 2.20, yaw: Math.PI,
      job: 'stand', model: { ...source[CHARACTER_IDS.WILLY].model },
    }),
    /* Irish never abandons his lookout. He is on the bow from the dock to the
     * moment the boat gets under way for home, and the only times he speaks are
     * to report what is behind them. */
    irish: new Npc(root, {
      // Stand in the clear starboard strip, not across the anchor and ballast
      // locker lids in the centre of the foredeck.
      name: 'Irish', tier: 'hero', x: 1.75, y: DECK.foredeckHeight, z: -4.55, yaw: Math.PI,
      job: 'stand', model: {
        ...source[CHARACTER_IDS.IRISH].model, face: 'assets/faces/irish.png',
      },
    }),
  };
  cast.willy.group.userData.characterId = CHARACTER_IDS.WILLY;
  cast.booski.group.userData.characterId = CHARACTER_IDS.BOOSKI;
  cast.lou.group.userData.characterId = CHARACTER_IDS.LOU;
  cast.irish.group.userData.characterId = CHARACTER_IDS.IRISH;

  // Binoculars, in Irish's hands, because that is what he is doing out here.
  const binoculars = new THREE.Group();
  binoculars.name = 'Irish binoculars';
  binoculars.add(cylinder('binocular barrel port', .035, .16, black, -.04, 0, 0, 12).rotateX(Math.PI / 2));
  binoculars.add(cylinder('binocular barrel starboard', .035, .16, black, .04, 0, 0, 12).rotateX(Math.PI / 2));
  binoculars.add(box('binocular bridge', [.09, .04, .06], black, 0, .01, 0));
  binoculars.position.set(0, -.30, -.10);
  cast.irish.parts.foreR.add(binoculars);

  scene.add(root);
  root.updateMatrixWorld(true);
  let detailMeshes = 0;
  root.traverse((object) => { if (object.isMesh) detailMeshes++; });
  root.userData.detailMeshes = detailMeshes;
  const keelY = BOAT_FLOAT_Y + CRUISER_HULL_MESH_Y - .98;
  const sheerY = BOAT_FLOAT_Y + CRUISER_HULL_MESH_Y + .74;
  root.userData.waterline = {
    surfaceY: WATER_LEVEL,
    restingY: BOAT_FLOAT_Y,
    keelY,
    sheerY,
    draft: WATER_LEVEL - keelY,
    sideFreeboard: sheerY - WATER_LEVEL,
    deckFreeboard: BOAT_FLOAT_Y + DECK.height - WATER_LEVEL,
    platformY: BOAT_FLOAT_Y + .13,
  };

  return {
    root,
    hull,
    targets,
    controls,
    cast,
    wheel,
    cabin,
    gangway,
    ballast,
    lockerLid,
    slidingHatch,
    transomGate,
    bodyMarker,
    localColliders,
    cabinColliders,
    deckBoxes: deckColliderBoxes(),
    cabinBoxes: cabinColliderBoxes(),
    floatY: BOAT_FLOAT_Y,
    deck: { ...DECK },
    cabinDeck: { ...CABIN },
  };
}

function buildBuoys(scene) {
  const buoys = [];
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Group();
    b.name = `channel buoy ${i + 1}`;
    b.add(cylinder(`channel buoy body ${i + 1}`, .24, .8, mat(i % 2 ? 0xa8362a : 0xb59a28), 0, .05, 0, 12));
    b.add(mesh(`channel buoy top ${i + 1}`, new THREE.ConeGeometry(.27, .42, 10), mat(0xbdb9ae), 0, .65, 0));
    const side = i % 2 ? 1 : -1;
    b.position.set(side * (9 + (i % 3) * 3), 0, -30 - i * 29);
    scene.add(b);
    buoys.push(b);
  }
  return buoys;
}

const WAKE_LIMITS = Object.freeze({
  poolSize: 72,
  emitInterval: .11,
  minSpeed: 1.2,
  lifetime: 2.8,
  startWidth: .72,
  startLength: 2.4,
  maxWidth: 1.45,
  maxLength: 4.4,
  startOpacity: .38,
});

function wakeSmoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * CPU port of the water vertex shader's four sines, exactly as written there.
 * The water plane is rotated -PI/2 about x, so the shader's p.x is world x and
 * its p.y is -world z; `time` must be the same scene clock the shader gets as
 * uTime. Any drift in a frequency, phase or amplitude puts the foam back under
 * the crests — the broad swell alone peaks 10.5 cm above rest.
 */
function waterSurfaceY(x, z, time) {
  const sx = x;
  const sy = -z;
  return WATER_LEVEL
    + Math.sin(sx * .043 + time * .72) * .105
    + Math.sin(sy * .061 - time * .94 + sx * .018) * .068
    + Math.sin((sx + sy) * .145 + time * 1.8) * .026
    + Math.sin(sx * .38 - sy * .22 + time * 2.6) * .011;
}

/* The quads are flat while the surface tilts under them: the combined sine
 * slopes reach ~1.7 cm/m, which across a grown quad's 2.3 m half-diagonal is
 * ~4 cm of surface rise at the far corner. This clearance covers that from a
 * sample taken only at the quad's centre. */
const WAKE_FOAM_CLEARANCE = .04;

/** One small shared alpha field: opaque foam core, fully transparent perimeter. */
function wakeFoamTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = ((y + .5) / size) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const u = ((x + .5) / size) * 2 - 1;
      const elliptical = Math.hypot(u / .88, v);
      const feather = 1 - wakeSmoothstep(.66, .98, elliptical);
      const ridge = .78 + .22 * (1 - Math.min(1, Math.abs(u)));
      const ripple = .90 + .10 * Math.sin(v * 19 + u * 7.5);
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const alpha = border ? 0 : Math.round(255 * THREE.MathUtils.clamp(
        feather * ridge * ripple, 0, 1,
      ));
      const index = (y * size + x) * 4;
      data[index] = 224;
      data[index + 1] = 242;
      data[index + 2] = 240;
      data[index + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'procedural feathered wake foam';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

class WakePool {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.cursor = 0;
    this.limits = WAKE_LIMITS;
    this.texture = wakeFoamTexture();
    this.geometry = new THREE.PlaneGeometry(WAKE_LIMITS.startWidth, WAKE_LIMITS.startLength);
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xd9ecea,
      map: this.texture,
      transparent: true,
      opacity: WAKE_LIMITS.startOpacity,
      alphaTest: .01,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < WAKE_LIMITS.poolSize; i++) {
      const p = mesh(`wake quad ${i + 1}`, this.geometry, wakeMat.clone());
      p.rotation.x = -Math.PI / 2;
      p.visible = false;
      p.userData.life = 0;
      p.userData.age = 0;
      p.castShadow = false;
      scene.add(p);
      this.pool.push(p);
    }
    wakeMat.dispose();
    this.timer = 0;
    this.time = 0;
    this.disposed = false;
  }

  emit(at, heading, speed, dt) {
    if (this.disposed) return;
    this.timer -= dt;
    if (speed < this.limits.minSpeed || this.timer > 0) return;
    this.timer = this.limits.emitInterval;
    for (const side of [-1, 1]) {
      const p = this.pool[this.cursor++ % this.pool.length];
      /* Abeam of the hull's own heading. Forward is the boat mesh's -Z rotated
       * by `heading`, so the beam is (cos, -sin) and the quad's long axis lies
       * along (-sin, -cos). */
      const lateral = _from.set(Math.cos(heading) * side, 0, -Math.sin(heading) * side);
      p.position.copy(at).addScaledVector(lateral, 1.48);
      p.position.y = waterSurfaceY(p.position.x, p.position.z, this.time) + WAKE_FOAM_CLEARANCE;
      p.rotation.z = heading + side * .48;
      p.scale.set(1, 1, 1);
      p.material.opacity = this.limits.startOpacity;
      p.userData.age = 0;
      p.userData.life = 1;
      p.visible = true;
    }
  }

  update(dt, time) {
    if (this.disposed) return;
    /* The world hands in its shader clock so foam and crests read one `t`;
     * a caller without one (the unit tests drive the pool directly) gets the
     * same deterministic accumulation instead. */
    this.time = time ?? this.time + dt;
    for (const p of this.pool) {
      if (!p.visible) continue;
      p.userData.age += dt;
      const progress = THREE.MathUtils.clamp(p.userData.age / this.limits.lifetime, 0, 1);
      const spread = wakeSmoothstep(0, 1, progress);
      const width = THREE.MathUtils.lerp(this.limits.startWidth, this.limits.maxWidth, spread);
      const length = THREE.MathUtils.lerp(this.limits.startLength, this.limits.maxLength, spread);
      p.scale.set(width / this.limits.startWidth, length / this.limits.startLength, 1);
      p.position.y = waterSurfaceY(p.position.x, p.position.z, this.time) + WAKE_FOAM_CLEARANCE;
      p.userData.life = 1 - progress;
      p.material.opacity = this.limits.startOpacity * (1 - spread);
      if (progress >= 1) {
        p.material.opacity = 0;
        p.visible = false;
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.pool) {
      p.visible = false;
      this.scene.remove(p);
      p.material.dispose();
    }
    this.geometry.dispose();
    this.texture.dispose();
  }
}

export function buildNoWakeWorld(scene) {
  /* Clear daytime. The mission clock already reads 12:45 PM; the world now
   * agrees with it, keeping the rails, shoreline and water readable while the
   * cabin retains its own practical lighting below deck. */
  scene.background = new THREE.Color(0x91b3c2);
  scene.fog = new THREE.FogExp2(0x91b3c2, .0026);
  const hemi = new THREE.HemisphereLight(0xdcecf3, 0x405044, 1.65);
  hemi.name = 'daylight hemisphere light';
  const sun = new THREE.DirectionalLight(0xfff0ce, 2.15);
  sun.name = 'high daytime sun';
  sun.position.set(-55, 85, -35);
  sun.castShadow = true;
  scene.add(hemi, sun);
  const water = buildWater(scene);
  const marina = buildMarina(scene);
  const channel = buildChannel(scene);
  const boat = buildBoat(scene, marina);
  water.bindBoat(boat.hull);
  const buoys = buildBuoys(scene);
  const wake = new WakePool(scene);
  const colliders = [...marina.colliders];

  function boatLocalXZ(x, z) {
    const dx = x - boat.root.position.x;
    const dz = z - boat.root.position.z;
    const c = Math.cos(boat.root.rotation.y);
    const s = Math.sin(boat.root.rotation.y);
    return { x: c * dx - s * dz, z: s * dx + c * dz };
  }

  /** Which space the player is standing in. The cabin is only ever active while
   * he is actually below; the deck sweeps and the deck's own ground query are
   * untouched by its existence. */
  let below = false;

  /**
   * Push the player capsule out of the boat's solids, in the boat's own frame.
   *
   * Only the velocity driving *into* a surface is cancelled, so contact never
   * costs the player his motion along a rail; and a `squeezed` result -- a
   * channel narrower than the capsule -- returns a stable mid-channel point and
   * is deliberately not treated as a collision, so a squeeze can never become
   * a trap.
   */
  function resolvePlayerOnBoat(player, radius) {
    boat.root.updateMatrixWorld(true);
    _localPlayer.copy(player.position);
    boat.root.worldToLocal(_localPlayer);
    const space = below ? boat.cabinDeck : boat.deck;
    const boxes = below ? boat.cabinBoxes : boat.deckBoxes;
    if (_localPlayer.x < -3.4 || _localPlayer.x > 3.4
      || _localPlayer.z < -7.6 || _localPlayer.z > 7.6
      || _localPlayer.y < space.height - .4 || _localPlayer.y > space.height + 3.6) return;
    const solved = resolveOnDeck(
      boxes, _localPlayer.x, _localPlayer.z,
      radius, _localPlayer.y, player.eyeHeight, space,
    );
    if (!solved.changed) return;
    _localPlayer.x = solved.x;
    _localPlayer.z = solved.z;
    _worldPlayer.copy(_localPlayer);
    boat.root.localToWorld(_worldPlayer);
    player.position.x = _worldPlayer.x;
    player.position.z = _worldPlayer.z;
    const length = Math.hypot(solved.dx, solved.dz);
    const c = Math.cos(boat.root.rotation.y);
    const s = Math.sin(boat.root.rotation.y);
    const nx = (c * solved.dx + s * solved.dz) / length;
    const nz = (-s * solved.dx + c * solved.dz) / length;
    const into = player.velocity.x * nx + player.velocity.z * nz;
    if (into < 0) {
      player.velocity.x -= nx * into;
      player.velocity.z -= nz * into;
    }
  }

  return {
    water,
    dock: marina.root,
    marina,
    channel,
    boat,
    buoys,
    wake,
    colliders,
    inlet: INLET,
    floorZones: [{
      box: new THREE.Box3(new THREE.Vector3(-7.0, -.1, -19.5), new THREE.Vector3(-3.65, .4, 25)),
      surface: 'wood',
    }],
    /** True while the player is below decks. Read by the ground query. */
    get below() { return below; },
    setBelow(value) { below = Boolean(value); },
    groundAt(x, z) {
      if (x < -3.7 && x > -7.2 && z > -18 && z < 24) return .2;
      const p = boatLocalXZ(x, z);
      const space = below ? boat.cabinDeck : boat.deck;
      if (Math.abs(p.x) < space.halfBeam + .4 && p.z > space.bow - .5 && p.z < space.stern + .5) {
        boat.root.updateMatrixWorld(true);
        _worldPlayer.set(p.x, space.heightAt(p.z), p.z);
        boat.root.localToWorld(_worldPlayer);
        return _worldPlayer.y;
      }
      return 0;
    },
    resolvePlayer(player, _axis, radius) { resolvePlayerOnBoat(player, radius); },
    toBoatLocal(point, target = new THREE.Vector3()) {
      boat.root.updateMatrixWorld(true);
      target.copy(point);
      return boat.root.worldToLocal(target);
    },
    fromBoatLocal(point, target = new THREE.Vector3()) {
      boat.root.updateMatrixWorld(true);
      target.copy(point);
      return boat.root.localToWorld(target);
    },
    update(t, dt) {
      water.material.uniforms.uTime.value = t;
      /* `main.js` applies BoatPhysics immediately before this call. Sync here,
       * after heave/yaw/pitch/roll, so the shader never uses last frame's hull. */
      water.syncExclusion();
      if (boat.bodyMarker.visible) {
        boat.bodyMarker.rotation.y += dt * .6;
      }
      for (let i = 0; i < buoys.length; i++) {
        buoys[i].position.y = Math.sin(t * 1.4 + i) * .09;
        buoys[i].rotation.z = Math.sin(t * .8 + i * 1.3) * .035;
      }
      wake.update(dt, t);
    },
  };
}
