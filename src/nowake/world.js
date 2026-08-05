import * as THREE from 'three';
import { BIG_UNCLE_LOU } from '../core/wardrobe.js';
import { Npc } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import {
  DECK, DECK_COLLIDERS, deckColliderBoxes, resolveOnDeck,
} from './deck-collision.js';

const mat = (color, roughness = 0.72, metalness = 0) => new THREE.MeshStandardMaterial({
  color, roughness, metalness,
});
const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
  const out = new THREE.Mesh(geometry, material);
  out.position.set(x, y, z);
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
};
const box = (size, material, x = 0, y = 0, z = 0) => mesh(
  new THREE.BoxGeometry(size[0], size[1], size[2]), material, x, y, z,
);
const cylinder = (r, h, material, x = 0, y = 0, z = 0, sides = 12) => mesh(
  new THREE.CylinderGeometry(r, r, h, sides), material, x, y, z,
);

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _localPlayer = new THREE.Vector3();
const _worldPlayer = new THREE.Vector3();
const WATER_LEVEL = -0.18;
// Settle both the cruiser and its neighboring boats into the surface instead
// of balancing them on the chine. The main hull then draws about .94 m and
// keeps .81 m of side freeboard, appropriate for this 42-foot cruiser.
const BOAT_FLOAT_Y = -0.14;

function beamBetween(from, to, radius, material, sides = 10) {
  _from.copy(from);
  _to.copy(to);
  _direction.subVectors(_to, _from);
  const out = mesh(new THREE.CylinderGeometry(radius, radius, _direction.length(), sides), material);
  out.position.addVectors(_from, _to).multiplyScalar(.5);
  out.quaternion.setFromUnitVectors(Y_AXIS, _direction.normalize());
  return out;
}

function textPlate(text, width, height, {
  foreground = '#d7dddc', background = '#172126', border = '#6d7778', font = 36,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.fillStyle = foreground;
  ctx.font = `700 ${font}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map: texture, transparent: false, toneMapped: false,
  }));
  plate.castShadow = false;
  return plate;
}

function lineCurve(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points);
  return mesh(new THREE.TubeGeometry(curve, 30, radius, 8, false), material);
}

function buildWater(scene) {
  const material = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uFog: { value: new THREE.Color(0x9ba6aa) },
      uDeep: { value: new THREE.Color(0x082e3a) },
      uShallow: { value: new THREE.Color(0x267381) },
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
      void main() {
        float rippleA = sin(vSurface.x * .51 + vSurface.y * .19 + uTime * 2.15);
        float rippleB = sin(vSurface.y * .72 - vSurface.x * .13 - uTime * 2.75);
        float micro = rippleA * rippleB;
        float crest = smoothstep(.105, .19, vHeight + micro * .018);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        vec3 col = mix(uDeep, uShallow, .30 + vHeight * 1.65 + micro * .035);
        col = mix(col, vec3(.68, .80, .81), crest * .42);
        col = mix(col, uFog, .10 + fresnel * .22);
        float glint = pow(max(0.0, rippleA * .5 + rippleB * .5), 18.0) * .15;
        col += glint;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 220, 220), material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.receiveShadow = true;
  scene.add(water);
  return { mesh: water, material, level: WATER_LEVEL };
}

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
      // Winding faces away from the centreline on both sides. The original
      // branch was reversed, so Three culled every exterior hull panel and
      // left the rub strip and transom looking detached above the water.
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

function buildMarina(scene) {
  const wood = mat(0x493b2f, .92);
  const woodLight = mat(0x66523e, .9);
  const steel = mat(0x50585b, .55, .55);
  const concrete = mat(0x777a77, 1);
  const rubber = mat(0x151a1b, .95);
  const dock = new THREE.Group();
  dock.name = 'South Harbor · Gate C';

  // Individual boards, bumpers and pilings keep the berth from reading as one brown slab.
  dock.add(box([3.35, .28, 41], wood, -5.35, .02, 2.8));
  for (let z = -17.1, i = 0; z <= 22.6; z += .78, i++) {
    const board = box([3.2, .075, .70], i % 4 === 0 ? woodLight : wood, -5.35, .205, z);
    board.name = `dock plank ${i + 1}`;
    dock.add(board);
  }
  dock.add(box([13.5, .32, 3.35], wood, -10.35, .02, 21.5));
  for (let x = -16.5, i = 0; x <= -3.9; x += .82, i++) {
    dock.add(box([.74, .075, 3.2], i % 3 === 0 ? woodLight : wood, x, .205, 21.5));
  }
  for (let z = -16; z <= 22; z += 3.9) {
    dock.add(cylinder(.15, 2.5, steel, -3.7, -.62, z));
    dock.add(cylinder(.15, 2.5, steel, -7.0, -.62, z));
    dock.add(box([.11, .42, 1.7], rubber, -3.69, .09, z + 1.7));
  }

  // Shore power, water, a dock cart and safety equipment make Gate C operational.
  for (const z of [-10, 1.8, 12.6]) {
    const pedestal = new THREE.Group();
    pedestal.add(box([.46, .78, .38], mat(0xe1ddd0), 0, .52, 0));
    pedestal.add(box([.30, .16, .04], mat(0x1d3035), 0, .62, .215));
    pedestal.add(cylinder(.045, .055, mat(0x3b9d62), -.10, .62, .25, 12));
    pedestal.add(cylinder(.045, .055, mat(0xd3b343), .10, .62, .25, 12));
    pedestal.position.set(-6.35, .2, z);
    dock.add(pedestal);
  }
  const hose = mesh(new THREE.TorusGeometry(.34, .045, 8, 24), mat(0x2f7659), -6.15, .76, 5.7);
  hose.rotation.y = Math.PI / 2;
  dock.add(hose);
  const safety = box([.72, 1.05, .42], mat(0xd8d8cf), -6.32, .78, 16.3);
  dock.add(safety);
  const safetyLabel = textPlate('LIFE JACKETS', .62, .16, {
    foreground: '#202627', background: '#e3e0d2', font: 30,
  });
  safetyLabel.position.set(-6.10, .94, 16.3);
  safetyLabel.rotation.y = Math.PI / 2;
  dock.add(safetyLabel);
  for (const x of [-4.15, -4.75]) dock.add(cylinder(.045, 1.55, steel, x, -.35, 14.6, 8));
  for (let y = -.85; y <= .15; y += .25) {
    dock.add(beamBetween(new THREE.Vector3(-4.15, y, 14.6), new THREE.Vector3(-4.75, y, 14.6), .035, steel, 8));
  }
  const cart = new THREE.Group();
  cart.add(box([1.25, .13, .78], steel, 0, .48, 0));
  cart.add(box([.08, .72, .08], steel, -.53, .72, -.3));
  cart.add(box([.08, .72, .08], steel, -.53, .72, .3));
  for (const [x, z] of [[-.48, -.28], [-.48, .28], [.48, -.28], [.48, .28]]) {
    const wheel = cylinder(.12, .07, rubber, x, .30, z, 14);
    wheel.rotation.z = Math.PI / 2;
    cart.add(wheel);
  }
  cart.position.set(-5.4, 0, -14.4);
  dock.add(cart);

  // Fixed cleats are the dock ends of the two physical mooring ropes.
  const dockCleats = {};
  for (const [id, z] of [['bow', -5.9], ['stern', 5.7]]) {
    const cleat = new THREE.Group();
    cleat.add(box([.38, .07, .13], steel, 0, .13, 0));
    cleat.add(cylinder(.045, .20, steel, -.13, .08, 0, 8));
    cleat.add(cylinder(.045, .20, steel, .13, .08, 0, 8));
    cleat.position.set(-3.82, .20, z);
    cleat.rotation.y = -.24;
    dock.add(cleat);
    dockCleats[id] = new THREE.Vector3(-3.82, .38, z);
  }

  dock.add(box([16, 2.8, 5.3], concrete, -15, 1.2, 21.1));
  const officeSign = textPlate('SOUTH HARBOR  /  GATE C', 6.7, .78, {
    foreground: '#f3e6b2', background: '#10252d', border: '#c8ad4f', font: 38,
  });
  officeSign.position.set(-14.5, 2.68, 18.39);
  dock.add(officeSign);
  dock.add(mesh(new THREE.TorusGeometry(.34, .09, 10, 28), mat(0xe55d3d), -10.0, 1.55, 18.32));
  for (let i = 0; i < 8; i++) {
    const z = -13 + i * 5;
    const light = new THREE.PointLight(0xd6e5d7, 2.4, 14, 2);
    light.position.set(-5.3, 3.2, z);
    const post = cylinder(.055, 3.0, steel, -5.3, 1.52, z, 8);
    const shade = mesh(new THREE.ConeGeometry(.23, .22, 12), mat(0x263236), -5.3, 3.08, z);
    shade.rotation.x = Math.PI;
    dock.add(light, post, shade);
  }
  scene.add(dock);

  // Proper neighboring runabouts: tapered hulls at the waterline, open
  // cockpits, framed glass, deck hardware and engines. The former rectangular
  // blocks were the two unidentified floating shapes visible from Gate C.
  const neighborBoats = [];
  for (const [x, z, yaw, color, accent] of [
    [9, 5, .08, 0xc2b59a, 0x294755],
    [15, -9, -.12, 0x586b73, 0xc9b276],
    [-16, -8, .04, 0xe0ded4, 0x254455],
  ]) {
    const other = new THREE.Group();
    other.name = 'detailed neighboring marina boat';
    const length = 9.2;
    const beam = 3.45;
    const neighborHull = mesh(marinaHullGeometry(length, beam), mat(color), 0, 0, 0);
    neighborHull.name = 'tapered neighboring hull';
    other.add(neighborHull);
    other.add(box([3.12, .12, 7.65], mat(0x83664a), 0, .61, .20));
    other.add(box([3.32, .10, 8.25], mat(0xe4dfd2), 0, .55, .12));
    for (const sx of [-1, 1]) {
      other.add(box([.08, .18, 7.9], mat(accent), sx * 1.64, .22, .18));
    }

    // Compact wheelhouse and a recognisable open aft cockpit.
    other.add(box([2.35, .62, 2.45], mat(0xe7e2d4), 0, .94, -1.18));
    other.add(box([2.58, .12, 2.72], mat(accent), 0, 1.67, -1.10));
    const frontGlass = box([2.14, .52, .055], mat(0x284852), 0, 1.36, -2.43);
    frontGlass.rotation.x = -.12;
    other.add(frontGlass);
    for (const sx of [-1, 1]) {
      const sideGlass = box([.055, .50, 1.74], mat(0x284852), sx * 1.17, 1.36, -1.12);
      other.add(sideGlass);
      other.add(box([.10, .66, .10], mat(0xe7e2d4), sx * 1.18, 1.31, -2.38));
      other.add(box([.10, .66, .10], mat(0xe7e2d4), sx * 1.18, 1.31, .08));
    }

    // Rails trace the sheer instead of one long diagonal bar.
    for (const sx of [-1, 1]) {
      other.add(beamBetween(new THREE.Vector3(sx * .18, 1.04, -4.42), new THREE.Vector3(sx * 1.52, 1.22, -3.32), .025, steel, 7));
      other.add(beamBetween(new THREE.Vector3(sx * 1.52, 1.22, -3.32), new THREE.Vector3(sx * 1.58, 1.22, 3.70), .025, steel, 7));
      for (const railZ of [-3.25, -1.2, .9, 3.55]) {
        other.add(cylinder(.025, .62, steel, sx * 1.57, .92, railZ, 7));
      }
    }

    other.add(box([2.42, .18, .72], mat(0xd5d1c6), 0, .88, 3.17));
    other.add(box([2.24, .45, .14], mat(0xb8b4a9), 0, 1.10, 3.48));
    other.add(box([.78, .16, .68], mat(0xb8b4a9), -.62, .84, 1.38));
    other.add(box([.78, .16, .68], mat(0xb8b4a9), .62, .84, 1.38));
    for (const sx of [-1, 1]) {
      other.add(box([.34, .58, .42], mat(0x242a2c), sx * .48, .20, 4.72));
      other.add(box([.20, .18, .30], mat(accent), sx * .48, -.15, 4.91));
      for (const cleatZ of [-3.45, 3.52]) {
        other.add(box([.34, .055, .10], steel, sx * 1.42, .73, cleatZ));
      }
    }
    other.add(cylinder(.045, 1.08, steel, 0, 2.25, -1.12, 8));
    const radar = mesh(new THREE.SphereGeometry(.25, 16, 10), mat(0xe7e2d4), 0, 2.77, -1.12);
    radar.scale.y = .38;
    other.add(radar);
    other.add(beamBetween(new THREE.Vector3(.56, 1.68, -.85), new THREE.Vector3(.86, 3.05, -1.10), .014, steel, 6));
    other.add(cylinder(.035, .10, mat(0xc73b32), -.92, 1.76, -2.34, 10));
    other.add(cylinder(.035, .10, mat(0x3ebf72), .92, 1.76, -2.34, 10));
    const cabinLight = new THREE.PointLight(0xf2d49a, 1.6, 7, 2);
    cabinLight.position.set(0, 1.46, -.85);
    other.add(cabinLight);
    other.position.set(x, BOAT_FLOAT_Y, z);
    other.rotation.y = yaw;
    let details = 0;
    other.traverse((object) => { if (object.isMesh) details++; });
    other.userData.detailMeshes = details;
    scene.add(other);
    neighborBoats.push(other);
  }

  const shoreline = box([420, 7, 36], mat(0x334338), 0, 1.2, 78);
  shoreline.receiveShadow = true;
  scene.add(shoreline);
  for (let i = 0; i < 34; i++) {
    const trunk = cylinder(.18 + (i % 3) * .04, 3.8, mat(0x463a2b), -190 + i * 12, 5.5, 67 + (i % 4) * 4, 7);
    const crown = mesh(new THREE.ConeGeometry(1.6 + (i % 4) * .22, 5.5, 8), mat(0x26392e), trunk.position.x, 9, trunk.position.z);
    scene.add(trunk, crown);
  }

  const colliders = [
    new THREE.Box3(new THREE.Vector3(-23, -.5, 18.2), new THREE.Vector3(-7.1, 3.4, 24.0)),
    new THREE.Box3(new THREE.Vector3(-6.75, .15, 16.0), new THREE.Vector3(-5.9, 2.0, 16.65)),
    new THREE.Box3(new THREE.Vector3(-6.2, .1, -14.9), new THREE.Vector3(-4.55, 1.4, -13.9)),
  ];
  return { root: dock, dockCleats, colliders, neighborBoats };
}

function cruiserHullGeometry() {
  const sections = [
    { z: -6.85, w: .12 }, { z: -6.48, w: .68 }, { z: -6.02, w: 1.30 },
    { z: -5.45, w: 1.92 }, { z: -4.55, w: 2.18 }, { z: -3.15, w: 2.28 },
    { z: .8, w: 2.45 }, { z: 4.8, w: 2.48 }, { z: 5.72, w: 2.38 }, { z: 6.35, w: 2.18 },
  ];
  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]; const b = sections[i + 1];
    for (const side of [-1, 1]) {
      const at = [side * a.w, .72, a.z];
      const ac = [side * a.w * .82, -.28, a.z];
      const ak = [0, -1.03, a.z];
      const bt = [side * b.w, .72, b.z];
      const bc = [side * b.w * .82, -.28, b.z];
      const bk = [0, -1.03, b.z];
      if (side > 0) {
        tri(at, bt, bc); tri(at, bc, ac); tri(ac, bc, bk); tri(ac, bk, ak);
      } else {
        tri(at, bc, bt); tri(at, ac, bc); tri(ac, bk, bc); tri(ac, ak, bk);
      }
    }
  }
  const stern = sections.at(-1);
  tri([-stern.w, .72, stern.z], [stern.w, -.28, stern.z], [stern.w, .72, stern.z]);
  tri([-stern.w, .72, stern.z], [-stern.w * .82, -.28, stern.z], [stern.w, -.28, stern.z]);
  tri([-stern.w * .82, -.28, stern.z], [0, -1.03, stern.z], [stern.w, -.28, stern.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildBoat(scene, marina) {
  const root = new THREE.Group();
  root.name = '42-foot cabin cruiser';
  root.userData.dimensions = { length: 13.2, beam: 4.96, deckHeight: 1.02 };
  root.position.y = BOAT_FLOAT_Y;
  const white = mat(0xd7d4c9, 0.66);
  const ivory = mat(0xeee9dc, .7);
  const navy = mat(0x172b34, 0.55);
  const teak = mat(0x6a4b32, 0.82);
  const teakDark = mat(0x3f2c20, .9);
  const vinyl = mat(0xcac7bb, .82);
  const black = mat(0x161b1d, .74);
  const rubber = mat(0x111617, .95);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x29434c, roughness: .18, transmission: .7, transparent: true, opacity: .32,
    depthWrite: false,
  });
  const chrome = mat(0x90999b, .25, .82);
  const ropeMat = mat(0xb7a47b, .98);

  const hull = mesh(cruiserHullGeometry(), white, 0, .05, 0);
  hull.name = 'deep-v hull';
  root.add(hull);
  root.add(box([4.58, .18, 11.45], teak, 0, .93, .15));
  root.add(box([4.86, .30, 11.85], white, 0, .83, .10));
  root.add(box([4.44, .11, 11.30], teak, 0, 1.01, .18));
  const foredeckGeometry = new THREE.BufferGeometry();
  foredeckGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 1.045, -6.78,
    -2.20, 1.045, -5.42,
    2.20, 1.045, -5.42,
  ], 3));
  foredeckGeometry.computeVertexNormals();
  const foredeck = mesh(foredeckGeometry, teak);
  foredeck.name = 'tapered foredeck';
  root.add(foredeck);
  // Hull stripe, rubbing strake and raised gunwales.
  for (const sx of [-1, 1]) {
    root.add(box([.11, .24, 9.85], navy, sx * 2.30, .48, .35));
    root.add(box([.14, .17, 11.55], rubber, sx * 2.46, .78, .15));
    root.add(box([.24, .33, 10.9], white, sx * 2.27, 1.08, .25));
  }

  // Forward cabin trunk, opening hatch, windows and bow hardware.
  root.add(box([2.50, .52, 3.72], white, 0, 1.27, -4.18));
  root.add(box([2.10, .10, 1.05], glass, 0, 1.57, -4.70));
  root.add(box([1.26, .08, .76], black, 0, 1.62, -5.36));
  const hatch = box([1.10, .07, .62], glass, 0, 1.67, -5.34);
  hatch.rotation.x = -.08;
  root.add(hatch);
  for (const sx of [-1, 1]) {
    const port = mesh(new THREE.CircleGeometry(.22, 24), glass, sx * 1.25, 1.18, -4.1);
    port.rotation.y = sx * Math.PI / 2;
    root.add(port);
  }

  // Open wheelhouse: framed panes with gaps between every structural member.
  const wheelhouseRoof = box([2.90, .18, 4.25], white, 0, 3.20, -.68);
  wheelhouseRoof.name = 'wheelhouse roof';
  root.add(wheelhouseRoof);
  /* The roof's underside sits at y=3.11. These uprights used to run only from
   * 1.59-3.13 (front) and 1.61-3.11 (sides), meeting the roof but stopping
   * roughly half a metre above anything solid -- the canopy posts everyone
   * could see floating clear of the deck. The front run now reaches down to
   * 1.53, the cabin trunk's own roof line just behind the dash, and the side
   * run reaches all the way to the deck at 1.02, so every post that used to
   * hang in open air now actually bears on something. Named so their contact
   * with the deck/trunk can be checked directly instead of just by eye. */
  for (const x of [-1.32, -.44, .44, 1.32]) {
    const post = box([.11, 1.60, .12], white, x, 2.33, -2.71);
    post.name = 'canopy support post · front';
    root.add(post);
  }
  for (const [x, width] of [[-.88, .72], [0, .76], [.88, .72]]) {
    root.add(box([width, 1.22, .045], glass, x, 2.38, -2.70));
  }
  for (const sx of [-1, 1]) {
    for (const z of [-2.35, -.95, .45, 1.18]) {
      const post = box([.12, 2.09, .12], white, sx * 1.32, 2.065, z);
      post.name = 'canopy support post · side';
      root.add(post);
    }
    for (const z of [-1.65, -.25, .81]) root.add(box([.045, 1.20, 1.16], glass, sx * 1.315, 2.38, z));
  }
  // Wipers sit on the glass rather than passing through it.
  for (const x of [-.64, .64]) {
    const wiper = beamBetween(new THREE.Vector3(x - .30, 1.92, -2.655), new THREE.Vector3(x + .28, 2.58, -2.655), .018, black, 7);
    root.add(wiper);
  }

  // Stainless guard rails, with a deliberate boarding gap on the dock side aft.
  function railRun(x, z0, z1) {
    const lower = 1.38;
    const upper = 1.78;
    root.add(beamBetween(new THREE.Vector3(x, lower, z0), new THREE.Vector3(x, lower, z1), .027, chrome, 8));
    root.add(beamBetween(new THREE.Vector3(x, upper, z0), new THREE.Vector3(x, upper, z1), .032, chrome, 8));
    const count = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 1.65));
    for (let i = 0; i <= count; i++) {
      const z = THREE.MathUtils.lerp(z0, z1, i / count);
      root.add(cylinder(.029, .78, chrome, x, 1.39, z, 8));
    }
  }
  railRun(2.35, -5.55, 5.55);
  railRun(-2.35, -5.55, 2.75);
  railRun(-2.35, 4.65, 5.55);
  for (const sx of [-1, 1]) {
    root.add(beamBetween(new THREE.Vector3(sx * .14, 1.62, -6.68), new THREE.Vector3(sx * 2.34, 1.78, -5.48), .032, chrome, 8));
    root.add(beamBetween(new THREE.Vector3(sx * .12, 1.30, -6.65), new THREE.Vector3(sx * 2.34, 1.38, -5.48), .026, chrome, 8));
  }
  root.add(beamBetween(new THREE.Vector3(-2.25, 1.78, 5.75), new THREE.Vector3(2.25, 1.78, 5.75), .032, chrome, 8));
  for (const x of [-2.25, -.75, .75, 2.25]) root.add(cylinder(.029, .78, chrome, x, 1.39, 5.75, 8));
  // Pale non-slip side decks make the now-walkable bow routes legible.
  for (const sx of [-1, 1]) root.add(box([.42, .025, 8.15], ivory, sx * 1.72, 1.08, -1.10));

  /* Helm console and a compact, visibly modeled control station.
   *
   * The furniture stays off the port boarding route -- the former port-biased
   * console and chair left only centimetres of capsule clearance between the
   * boarding gap and the controls -- and the pedestal now runs far enough
   * outboard to actually carry the instrument face bolted to it. It used to
   * stop at x = .76 while the start panel, stereo, VHF and throttle hung on
   * past 1.2 in open air, and the wheel was sunk into the same plane as all of
   * them: measured on that build the rim alone intersected the dash, all three
   * gauges, the chartplotter, the start panel, the battery rocker, the stereo
   * and the throttle, the stereo grew through the fuel gauge, both gauges grew
   * through the chartplotter and the VHF through the starboard canopy post.
   *
   * Everything now sits in one of three rows on the one fascia -- gauges and
   * stereo along the dash face, chartplotter and VHF at seated eye level,
   * engine-start panel and twin throttle at hand height -- and the wheel
   * stands proud of all of it on its own column. */
  const consoleBody = box([1.96, 1.16, .82], navy, .26, 1.63, -1.43);
  consoleBody.name = 'helm console pedestal';
  root.add(consoleBody);
  const dash = box([2.55, .18, .70], black, 0, 2.18, -1.40);
  dash.name = 'helm dash panel';
  dash.rotation.x = -.20;
  root.add(dash);
  const wheel = new THREE.Group();
  wheel.name = 'stainless helm wheel';
  const rim = mesh(new THREE.TorusGeometry(.34, .034, 9, 28), chrome, 0, 0, 0);
  wheel.add(rim, cylinder(.065, .11, chrome, 0, 0, -.025, 16));
  wheel.children[1].rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    wheel.add(beamBetween(
      new THREE.Vector3(Math.cos(a) * .07, Math.sin(a) * .07, 0),
      new THREE.Vector3(Math.cos(a) * .30, Math.sin(a) * .30, 0), .014, chrome, 7,
    ));
  }
  /* The wheel stands 0.42 m proud of the fascia on a raked column instead of
   * turning inside it. Its rim is 0.68 m across and swept the whole panel from
   * the old flush position; out here nothing on the console reaches aft of
   * z = -.77 and the rim never touches any of it. */
  wheel.position.set(.14, 2.02, -.60);
  wheel.rotation.x = .18;
  root.add(wheel);
  const column = beamBetween(
    new THREE.Vector3(.14, 1.90, -1.02), new THREE.Vector3(.14, 2.01, -.66), .05, chrome, 10,
  );
  column.name = 'helm steering column';
  root.add(column);
  const helmTarget = box([1.62, 1.30, .76], new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, colorWrite: false,
  }), .14, 2.02, -.62);
  helmTarget.name = 'broad helm interaction proxy';
  helmTarget.castShadow = false;
  helmTarget.receiveShadow = false;
  root.add(helmTarget);

  function gauge(label, x, y) {
    const g = new THREE.Group();
    const bezel = cylinder(.16, .055, chrome, 0, 0, 0, 28);
    bezel.rotation.x = Math.PI / 2;
    const face = mesh(new THREE.CircleGeometry(.135, 28), mat(0x071012), 0, 0, .035);
    const needle = box([.018, .11, .012], mat(0xe2c95d), 0, .025, .050);
    needle.geometry.translate(0, .035, 0);
    const title = textPlate(label, .22, .055, { foreground: '#d7e3df', background: '#071012', border: '#071012', font: 26 });
    title.position.set(0, -.095, .057);
    g.add(bezel, face, needle, title);
    g.position.set(x, y, -1.015);
    root.add(g);
    return needle;
  }
  const gaugeNeedles = {
    rpm: gauge('RPM', -.19, 2.34), speed: gauge('KNOTS', .14, 2.35), fuel: gauge('FUEL', .47, 2.34),
  };
  // Chartplotter, on the fascia beside the wheel rather than behind the rpm
  // gauge -- the two used to occupy the same 0.05 m of panel depth.
  const plotter = box([.48, .31, .055], mat(0x101719), .50, 1.98, -1.02);
  plotter.name = 'helm chartplotter';
  root.add(plotter);
  const plotterScreen = textPlate('DEPTH 18.4', .41, .22, { foreground: '#83d9d4', background: '#0c242a', border: '#253a3c', font: 28 });
  plotterScreen.position.set(.50, 1.98, -.985);
  root.add(plotterScreen);

  // Startup panel: guarded battery rocker, blower push-button and a real
  // ignition key. It owns the port half of the hand-height row; the twin
  // throttle owns the starboard half, so neither is inside the other.
  const startPanel = box([1.16, .54, .11], black, -.10, 1.52, -1.00);
  startPanel.name = 'engine start panel';
  root.add(startPanel);
  const startTitle = textPlate('ENGINE START', .72, .11, { foreground: '#e7dec0', background: '#171d1f', border: '#555e5f', font: 29 });
  startTitle.position.set(-.24, 1.735, -.935);
  root.add(startTitle);

  const battery = new THREE.Group();
  battery.name = 'battery rocker switch';
  battery.add(box([.23, .24, .08], mat(0x5b1e19), 0, 0, 0));
  const batteryLever = box([.14, .17, .10], mat(0xd45742), 0, 0, .07);
  battery.add(batteryLever);
  const batteryLabel = textPlate('BATTERY', .29, .09, { foreground: '#e6e0ce', background: '#171d1f', border: '#171d1f', font: 25 });
  batteryLabel.position.set(0, -.17, .075);
  battery.add(batteryLabel);
  battery.position.set(-.42, 1.53, -.91);
  root.add(battery);

  const blower = new THREE.Group();
  blower.name = 'bilge blower push button';
  const blowerBezel = cylinder(.105, .07, chrome, 0, 0, 0, 24);
  blowerBezel.rotation.x = Math.PI / 2;
  const blowerButton = cylinder(.076, .085, mat(0xd3a529), 0, 0, .065, 24);
  blowerButton.rotation.x = Math.PI / 2;
  const blowerLabel = textPlate('BLOWER', .29, .09, { foreground: '#e6e0ce', background: '#171d1f', border: '#171d1f', font: 25 });
  blowerLabel.position.set(0, -.17, .075);
  blower.add(blowerBezel, blowerButton, blowerLabel);
  blower.position.set(-.10, 1.53, -.91);
  root.add(blower);

  const ignition = new THREE.Group();
  ignition.name = 'ignition key';
  const ignitionBarrel = cylinder(.095, .065, chrome, 0, 0, 0, 24);
  ignitionBarrel.rotation.x = Math.PI / 2;
  const keyTurn = new THREE.Group();
  const key = box([.050, .21, .035], mat(0xc6b67c, .34, .55), 0, -.07, .075);
  const fob = box([.11, .10, .045], rubber, 0, -.20, .075);
  keyTurn.add(key, fob);
  ignition.add(ignitionBarrel, keyTurn);
  const ignitionLabel = textPlate('IGNITION', .30, .09, { foreground: '#e6e0ce', background: '#171d1f', border: '#171d1f', font: 24 });
  ignitionLabel.position.set(0, -.31, .075);
  ignition.add(ignitionLabel);
  ignition.position.set(.22, 1.61, -.91);
  root.add(ignition);

  const indicatorMat = new THREE.MeshStandardMaterial({ color: 0x25312d, emissive: 0x000000, emissiveIntensity: 0 });
  // Seated in the panel rather than hovering a couple of centimetres off it.
  const indicator = cylinder(.035, .035, indicatorMat, .22, 1.75, -.93, 16);
  indicator.rotation.x = Math.PI / 2;
  root.add(indicator);

  /* Twin levers, side-mounted on the console at the helmsman's right hand.
   * The plate used to lie flat in mid-air directly in front of the seat, with
   * the wheel rim passing through it and nothing underneath holding it up. */
  const throttle = new THREE.Group();
  throttle.name = 'twin engine throttle';
  throttle.add(box([.34, .12, .46], chrome, 0, 0, 0));
  const throttlePivot = new THREE.Group();
  throttlePivot.add(box([.06, .44, .06], chrome, 0, .19, 0));
  throttlePivot.add(box([.17, .13, .13], black, 0, .43, 0));
  throttlePivot.position.set(0, .02, 0);
  throttle.add(throttlePivot);
  throttle.position.set(1.06, 1.55, -.92);
  throttle.rotation.x = 1.15;
  root.add(throttle);

  const vhf = box([.46, .26, .18], black, 1.00, 2.02, -.95);
  vhf.name = 'marine VHF radio';
  root.add(vhf);
  const radioFace = textPlate('VHF 16', .43, .15, { foreground: '#78c8b7', background: '#0b1719', border: '#273234', font: 30 });
  radioFace.position.set(1.00, 2.03, -.855);
  root.add(radioFace);

  // Entertainment stereo beside the VHF. It drives the same station and
  // music system as the apartment radio; the physical face and power lamp
  // make its state readable without relying on the HUD.
  const stereo = new THREE.Group();
  stereo.name = 'marine stereo radio';
  stereo.add(box([.50, .26, .18], black, 0, 0, 0));
  const stereoFace = textPlate('97.8 FM', .32, .14, {
    foreground: '#e6c86f', background: '#111719', border: '#364044', font: 31,
  });
  stereoFace.position.set(-.035, .012, .096);
  stereo.add(stereoFace);
  const tuneKnob = cylinder(.045, .045, chrome, .195, .010, .100, 18);
  tuneKnob.rotation.x = Math.PI / 2;
  stereo.add(tuneKnob);
  const stereoLedMat = new THREE.MeshStandardMaterial({
    color: 0x24312b, emissive: 0x000000, emissiveIntensity: 0,
  });
  const stereoLed = cylinder(.016, .018, stereoLedMat, .195, -.072, .104, 14);
  stereoLed.rotation.x = Math.PI / 2;
  stereo.add(stereoLed);
  // Down onto the dash face proper: at 2.40 it stood clear above the panel's
  // aft edge with nothing behind it.
  stereo.position.set(.90, 2.30, -1.00);
  root.add(stereo);
  // Seated on the dash at its own rake. It used to hover 0.17 m above it.
  const compass = mesh(new THREE.SphereGeometry(.16, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass, .20, 2.284, -1.34);
  compass.name = 'helm compass';
  compass.rotation.x = -.20;
  root.add(compass);

  // Two proper pedestal seats and aft-deck furniture.
  function helmSeat(x, z) {
    const seat = new THREE.Group();
    seat.add(cylinder(.085, .48, chrome, 0, .24, 0, 12));
    seat.add(box([.66, .16, .68], vinyl, 0, .55, 0));
    seat.add(box([.66, .72, .16], vinyl, 0, .88, .26));
    seat.add(box([.58, .05, .60], teakDark, 0, .45, 0));
    seat.position.set(x, 1.01, z);
    root.add(seat);
  }
  helmSeat(.14, .28);
  /* The starboard chair used to sit at x = 1.48, which put its 0.66 m cushion
   * across the starboard non-slip strip (1.51-1.93) and left only 0.32 m
   * between its collider and the rail -- half what the player's capsule needs,
   * open at both ends, so he walked into it and stopped dead. 1.26 clears the
   * strip, keeps the two chairs a natural 1.12 m apart on centres, and leaves a
   * real 0.66 m route forward along the starboard side. See DECK_COLLIDERS. */
  helmSeat(1.26, .28);
  root.add(box([3.72, .42, .66], ivory, 0, 1.21, 5.32));
  root.add(box([3.48, .16, .61], vinyl, 0, 1.49, 5.25));
  root.add(box([3.48, .58, .15], vinyl, 0, 1.70, 5.53));
  root.add(box([1.08, .58, .68], white, 1.58, 1.31, 3.68));
  root.add(box([.96, .11, .58], mat(0x6f8b91), 1.58, 1.65, 3.68));
  root.add(box([1.28, .08, 1.38], teakDark, -1.24, 1.07, 3.55));
  root.add(box([1.14, .04, 1.22], teak, -1.24, 1.115, 3.55));
  // Engine-hatch seams and stainless lift rings stay above the deck.
  for (const x of [-.76, .76]) {
    root.add(box([.035, .018, 2.5], black, x, 1.11, 3.25));
    const lift = mesh(new THREE.TorusGeometry(.075, .012, 6, 18), chrome, x, 1.135, 3.1);
    lift.rotation.x = -Math.PI / 2;
    root.add(lift);
  }
  // Cabin companionway, steps, extinguisher and life ring.
  root.add(box([1.35, 1.50, .12], teakDark, 0, 1.83, 1.34));
  root.add(box([.94, 1.12, .06], black, 0, 1.72, 1.405));
  for (let i = 0; i < 3; i++) root.add(box([.88, .10, .34], teak, 0, 1.12 - i * .12, 1.66 + i * .24));
  const extinguisher = cylinder(.11, .55, mat(0xc43d2e), 1.88, 1.53, 1.60, 18);
  root.add(extinguisher);
  const lifeRing = mesh(new THREE.TorusGeometry(.31, .075, 9, 26), mat(0xe55d3d), -2.15, 2.16, .62);
  lifeRing.rotation.y = Math.PI / 2;
  root.add(lifeRing);

  // Fenders, cleats, navigation lights, radar and antennas.
  for (const z of [-4.5, -.2, 4.25]) {
    const fender = cylinder(.17, .90, vinyl, -2.58, .78, z, 16);
    fender.name = 'dock fender';
    root.add(fender);
    root.add(beamBetween(new THREE.Vector3(-2.43, 1.42, z), new THREE.Vector3(-2.58, 1.22, z), .018, ropeMat, 7));
  }
  function boatCleat(x, z) {
    const cleat = new THREE.Group();
    cleat.add(box([.40, .08, .14], chrome, 0, .10, 0));
    cleat.add(cylinder(.045, .20, chrome, -.14, .06, 0, 8));
    cleat.add(cylinder(.045, .20, chrome, .14, .06, 0, 8));
    cleat.position.set(x, 1.15, z);
    root.add(cleat);
    return cleat;
  }
  boatCleat(-2.22, -5.35);
  boatCleat(-2.22, 5.25);
  boatCleat(2.22, -5.35);
  boatCleat(2.22, 5.25);
  const redNav = new THREE.PointLight(0xff3d2d, 2.0, 4);
  redNav.position.set(-.48, 1.80, -6.02);
  const greenNav = new THREE.PointLight(0x43df82, 2.0, 4);
  greenNav.position.set(.48, 1.80, -6.02);
  root.add(redNav, greenNav);
  root.add(cylinder(.055, 1.12, chrome, 0, 3.83, -.75, 8));
  const radar = mesh(new THREE.SphereGeometry(.38, 20, 12), ivory, 0, 4.18, -.75);
  radar.scale.y = .42;
  root.add(radar);
  root.add(beamBetween(new THREE.Vector3(.80, 3.20, -.2), new THREE.Vector3(1.28, 5.15, -.45), .018, chrome, 7));

  // A real boarding bridge makes the route onto the cruiser readable from the
  // dock.  It is hinged to the port quarter so it can be stowed as soon as the
  // player boards instead of trailing behind the moving boat.
  const boardingBridge = new THREE.Group();
  boardingBridge.name = 'visible physical boarding bridge';
  const gangwayDeck = box([1.82, .13, 1.04], teak, -3.10, .68, 3.75);
  gangwayDeck.rotation.z = .39;
  gangwayDeck.name = 'boarding bridge nonslip deck';
  const gangwayPortEdge = box([1.86, .10, .075], mat(0xd6b94c, .72), -3.10, .75, 3.24);
  gangwayPortEdge.rotation.z = .39;
  const gangwayStarboardEdge = gangwayPortEdge.clone();
  gangwayStarboardEdge.position.z = 4.26;
  const dockStep = box([.62, .20, 1.14], teakDark, -3.90, .32, 3.75);
  const hinge = cylinder(.09, 1.18, chrome, -2.25, 1.02, 3.75, 12);
  hinge.rotation.x = Math.PI / 2;
  boardingBridge.add(gangwayDeck, gangwayPortEdge, gangwayStarboardEdge, dockStep, hinge);
  root.add(boardingBridge);

  // The forgiving target spans the whole bridge rather than requiring the
  // crosshair to find one narrow plank edge from the dock.
  const board = box([2.35, 2.05, 2.15], new THREE.MeshBasicMaterial({ visible: false }), -3.05, 1.10, 3.75);
  board.name = 'forgiving boarding bridge interaction';
  root.add(board);

  const bodyMarker = new THREE.Group();
  bodyMarker.name = 'Willy body objective marker';
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2c75a, emissive: 0x8e641c, emissiveIntensity: 1.35,
    roughness: .42, metalness: .16,
  });
  bodyMarker.add(mesh(new THREE.TorusGeometry(.24, .032, 8, 28), markerMaterial));
  const markerArrow = mesh(new THREE.ConeGeometry(.075, .22, 10), markerMaterial, 0, -.38, 0);
  markerArrow.rotation.z = Math.PI;
  bodyMarker.add(markerArrow);
  bodyMarker.position.set(.88, 1.56, 4.38);
  bodyMarker.visible = false;
  root.add(bodyMarker);

  // Two true catenary ropes run between the boat and dock cleats until removed.
  function mooringLine(id, boatEnd, dockEnd) {
    const line = new THREE.Group();
    line.name = `${id} mooring rope`;
    const middle = new THREE.Vector3().lerpVectors(boatEnd, dockEnd, .5);
    middle.y -= .22;
    line.add(lineCurve([
      boatEnd.clone(), new THREE.Vector3().lerpVectors(boatEnd, middle, .55),
      middle, new THREE.Vector3().lerpVectors(middle, dockEnd, .55), dockEnd.clone(),
    ], .035, ropeMat));
    // The rope is only a few centimetres thick. Give its cleat end a forgiving
    // pickup volume so releasing a line feels like using the cleat, not
    // threading the crosshair through a single-pixel strand.
    const pickup = box([.68, .54, .72], new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }), boatEnd.x, boatEnd.y + .05, boatEnd.z);
    pickup.name = `${id} line cleat interaction`;
    pickup.castShadow = false;
    pickup.receiveShadow = false;
    line.add(pickup);
    line.userData.lineId = id;
    line.userData.attached = true;
    scene.add(line);
    return line;
  }
  const bowLine = mooringLine('bow', new THREE.Vector3(-2.22, 1.32 + BOAT_FLOAT_Y, -5.35), marina.dockCleats.bow);
  const sternLine = mooringLine('stern', new THREE.Vector3(-2.22, 1.32 + BOAT_FLOAT_Y, 5.25), marina.dockCleats.stern);

  const controls = {
    battery: {
      root: battery,
      setOn(on) { batteryLever.rotation.x = on ? -.34 : .20; batteryLever.position.y = on ? .025 : -.015; },
    },
    blower: {
      root: blower,
      setOn(on) { blowerButton.position.z = on ? .035 : .065; },
    },
    ignition: {
      root: ignition,
      setOn(on) {
        keyTurn.rotation.z = on ? -.72 : 0;
        indicatorMat.color.setHex(on ? 0x4fc477 : 0x25312d);
        indicatorMat.emissive.setHex(on ? 0x1c7e45 : 0x000000);
        indicatorMat.emissiveIntensity = on ? 1.8 : 0;
      },
    },
    throttle: {
      root: throttle,
      setValue(value) { throttlePivot.rotation.x = THREE.MathUtils.clamp(value, -1, 1) * -.62; },
    },
    radio: {
      root: stereo,
      setOn(on) {
        stereoLedMat.color.setHex(on ? 0x5bd889 : 0x24312b);
        stereoLedMat.emissive.setHex(on ? 0x1d9a52 : 0x000000);
        stereoLedMat.emissiveIntensity = on ? 1.8 : 0;
      },
    },
    gaugeNeedles,
  };
  controls.battery.setOn(false);
  controls.blower.setOn(false);
  controls.ignition.setOn(false);
  controls.radio.setOn(false);

  /* A broad proxy for the body on the stern deck, for the same reason the helm
   * has one: a hold that has to stay on a target for most of a second cannot
   * be aimed at a man lying down while the deck under both of you is moving.
   * The figure's own group is a thin, near-horizontal silhouette, and Tony
   * stands close enough to be looking almost straight down at it — the ray
   * grazed it, `current` flickered, and `holdTime` reset before it ever
   * reached the 0.85 s the disposal needs. Measured on the previous build the
   * hold peaked around 0.6 s no matter how long the key was held, so the body
   * could not reliably be put over the side at all. */
  const bodyTarget = box([1.90, 1.15, 2.10], new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, colorWrite: false,
  }), 0, 1.52, 4.48);
  bodyTarget.name = 'broad body interaction proxy';
  /* Invisible through the material, not through `visible` — Three skips
   * raycasting anything with `visible === false`, which would make this proxy
   * an elaborate way of changing nothing. */
  bodyTarget.castShadow = false;
  bodyTarget.receiveShadow = false;
  root.add(bodyTarget);

  const targets = {
    board,
    battery,
    blower,
    ignition,
    radio: stereo,
    helm: helmTarget,
    body: bodyTarget,
    bowLine,
    sternLine,
  };

  /* Local collision volumes are resolved in boat space, so a turned boat does
   * not inflate its railings into giant world-axis boxes.
   *
   * The table itself, the rules it has to obey and the reasoning behind every
   * number that has moved live in `deck-collision.js`, because Node can import
   * that and cannot import this file. `localColliders` stays a THREE.Box3 list
   * so the scene, the camera director and the verifier keep working on it the
   * way they always have; `deckBoxes` is the same geometry in the plain form
   * the shared resolver reads. They are built from one source, so the deck the
   * tests sweep is the deck the player walks on. */
  const localColliders = DECK_COLLIDERS.map((entry) => {
    const box = new THREE.Box3(
      new THREE.Vector3(entry.min[0], entry.min[1], entry.min[2]),
      new THREE.Vector3(entry.max[0], entry.max[1], entry.max[2]),
    );
    box.name = entry.name;
    return box;
  });

  const source = Object.fromEntries(FAMILY.map((member) => [member.id, member]));
  const cast = {
    lou: new Npc(root, {
      name: 'Big Uncle Lou', tier: 'hero', x: 1.18, y: 1.02, z: 2.18, yaw: Math.PI,
      job: 'stand', model: { ...BIG_UNCLE_LOU, face: 'assets/faces/lou.png' },
    }),
    booski: new Npc(root, {
      name: 'Booskibro', tier: 'hero', x: -1.16, y: 1.02, z: 2.75, yaw: Math.PI,
      job: 'stand', model: { ...source[CHARACTER_IDS.BOOSKI].model, face: 'assets/faces/booski.png' },
    }),
    /* z was 4.68 -- half a metre short of the aft bench (its cushion runs
     * 4.945-5.555, centred at 5.25), so Willy sat in open air in front of it
     * rather than on it. Centred on the cushion instead: `sit()` folds him
     * down onto whatever floor y he is given (1.02, the deck, same as the
     * standing crew), it does not need the bench's own height, only its x/z
     * footprint under him. */
    willy: new Npc(root, {
      name: 'Willy', tier: 'hero', x: .62, y: 1.02, z: 5.25, yaw: Math.PI,
      job: 'sit', model: { ...source[CHARACTER_IDS.WILLY].model },
    }),
    /* Irish came along because somebody always does, and because a thing like
     * this is not supposed to happen on one man's word. He is the Family's
     * procedure voice: he is not here to shoot Willy, he is here so that
     * afterwards nobody can say it was done wrong.
     *
     * He used to stand at (-1.72, 3.35): 0.37 m from the exact spot the
     * boarding animation lands the player (-1.68, 3.72), so Tony stepped
     * aboard almost on top of him every time -- "Irish kind of in the way".
     * The owner's first instinct was to cut him from the boat entirely and
     * have him see the boat off from the dock instead. That does not work
     * for this Irish: five of his six lines (the count and the confirmation
     * inside the confrontation, his hands below decks, the rail after the
     * shot, and the back half he won't tell on the way in) are all spoken
     * after the boat is already underway and moored nowhere near the dock,
     * and `NoWakeCameraDirector.frameSpeaker('irish')` looks him up as
     * `boat.cast.irish` and reads his position through the boat's own
     * transform -- a dockside Irish is a different object the confrontation
     * cannot find and the camera cannot frame. Cutting him back out of those
     * beats to make the dock staging work would undo the whole reason he was
     * added. He stays aboard for all of it; only his idle spot on the ride
     * out moves, off the boarding line and well clear of the aft bench,
     * shifted forward alongside Lou and Booski instead of behind them. */
    irish: new Npc(root, {
      name: 'Irish', tier: 'hero', x: -1.85, y: 1.02, z: 2.30, yaw: 1.06,
      job: 'stand', model: {
        ...source[CHARACTER_IDS.IRISH].model, face: 'assets/faces/irish.png',
      },
    }),
  };
  cast.willy.group.userData.characterId = CHARACTER_IDS.WILLY;
  cast.booski.group.userData.characterId = CHARACTER_IDS.BOOSKI;
  cast.lou.group.userData.characterId = CHARACTER_IDS.LOU;
  cast.irish.group.userData.characterId = CHARACTER_IDS.IRISH;

  scene.add(root);
  root.updateMatrixWorld(true);
  let detailMeshes = 0;
  root.traverse((object) => { if (object.isMesh) detailMeshes++; });
  root.userData.detailMeshes = detailMeshes;
  const keelY = BOAT_FLOAT_Y + .05 - 1.03;
  const sheerY = BOAT_FLOAT_Y + .05 + .72;
  root.userData.waterline = {
    surfaceY: WATER_LEVEL,
    restingY: BOAT_FLOAT_Y,
    keelY,
    sheerY,
    draft: WATER_LEVEL - keelY,
    sideFreeboard: sheerY - WATER_LEVEL,
    deckFreeboard: BOAT_FLOAT_Y + 1.02 - WATER_LEVEL,
  };
  return {
    root, targets, controls, cast, wheel, boardingBridge, bodyMarker, localColliders,
    deckBoxes: deckColliderBoxes(),
    floatY: BOAT_FLOAT_Y,
    deck: { ...DECK },
  };
}

function buildBuoys(scene) {
  const buoys = [];
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Group();
    b.add(cylinder(.24, .8, mat(i % 2 ? 0xd84937 : 0xe0c334), 0, .05, 0, 12));
    b.add(mesh(new THREE.ConeGeometry(.27, .42, 10), mat(0xf0eee3), 0, .65, 0));
    const side = i % 2 ? 1 : -1;
    b.position.set(side * (9 + (i % 3) * 3), 0, -30 - i * 31);
    scene.add(b);
    buoys.push(b);
  }
  return buoys;
}

class WakePool {
  constructor(scene) {
    this.pool = [];
    this.cursor = 0;
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xd7eeee, transparent: true, opacity: .34, depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 72; i++) {
      const p = mesh(new THREE.PlaneGeometry(.78, 3.2), wakeMat.clone());
      p.rotation.x = -Math.PI / 2;
      p.visible = false;
      p.userData.life = 0;
      scene.add(p);
      this.pool.push(p);
    }
    this.timer = 0;
  }
  emit(at, heading, speed, dt) {
    this.timer -= dt;
    if (speed < 1.2 || this.timer > 0) return;
    this.timer = .11;
    for (const side of [-1, 1]) {
      const p = this.pool[this.cursor++ % this.pool.length];
      /* Abeam of the hull's own heading. Forward is the boat mesh's -Z rotated
       * by `heading`, so the beam is (cos, -sin) and the quad's long axis lies
       * along (-sin, -cos); both terms used to be mirrored, so off the world
       * axes the two rows of wake crossed the hull instead of trailing it. */
      const lateral = new THREE.Vector3(Math.cos(heading) * side, 0, -Math.sin(heading) * side);
      p.position.copy(at).addScaledVector(lateral, 1.52);
      p.position.y = -.12;
      p.rotation.z = heading + side * .48;
      p.scale.set(1, 1, 1);
      p.material.opacity = .36;
      p.userData.life = 1;
      p.visible = true;
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.visible) continue;
      p.userData.life -= dt * .24;
      p.scale.x *= 1 + dt * .54;
      p.scale.y *= 1 + dt * .31;
      p.material.opacity = Math.max(0, p.userData.life * .34);
      if (p.userData.life <= 0) p.visible = false;
    }
  }
}

export function buildNoWakeWorld(scene) {
  scene.background = new THREE.Color(0x8f9a9d);
  scene.fog = new THREE.FogExp2(0x8f9a9d, .0038);
  const hemi = new THREE.HemisphereLight(0xc5d0d1, 0x293137, 1.75);
  const sun = new THREE.DirectionalLight(0xdde0da, 2.2);
  sun.position.set(-18, 30, 12);
  sun.castShadow = true;
  scene.add(hemi, sun);
  const water = buildWater(scene);
  const marina = buildMarina(scene);
  const boat = buildBoat(scene, marina);
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

  /**
   * Push the player capsule out of the boat's solids, in the boat's own frame.
   *
   * The arithmetic is `resolveOnDeck` in `deck-collision.js`; this wrapper does
   * the frame changes and the velocity response. Two things here are load
   * bearing and easy to undo by accident:
   *
   *  - Only the velocity driving **into** the surface is cancelled. The old
   *    code zeroed both components whenever anything pushed at all, so a player
   *    resting against a rail could not walk along it -- he could only step
   *    straight off it. On a side deck whose clear band is under half a metre,
   *    that reads as "I get stuck", and it is exactly what trapped the player
   *    at the bow after releasing the mooring line.
   *  - A `squeezed` result -- a channel narrower than the capsule -- returns a
   *    stable mid-channel position and is deliberately *not* treated as a
   *    collision for velocity purposes. The player keeps every bit of his
   *    motion and walks straight back out the way he came in.
   */
  function resolvePlayerOnBoat(player, radius) {
    boat.root.updateMatrixWorld(true);
    _localPlayer.copy(player.position);
    boat.root.worldToLocal(_localPlayer);
    if (_localPlayer.x < -3 || _localPlayer.x > 3
      || _localPlayer.z < -6.5 || _localPlayer.z > 6.5
      || _localPlayer.y < .75 || _localPlayer.y > 4.3) return;
    const solved = resolveOnDeck(
      boat.deckBoxes, _localPlayer.x, _localPlayer.z,
      radius, _localPlayer.y, player.eyeHeight, boat.deck,
    );
    if (!solved.changed) return;
    _localPlayer.x = solved.x;
    _localPlayer.z = solved.z;
    _worldPlayer.copy(_localPlayer);
    boat.root.localToWorld(_worldPlayer);
    player.position.x = _worldPlayer.x;
    player.position.z = _worldPlayer.z;
    // Boat space to world space is the inverse of the yaw used by boatLocalXZ.
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
    water, dock: marina.root, marina, boat, buoys, wake, colliders,
    floorZones: [{
      box: new THREE.Box3(new THREE.Vector3(-7.0, -.1, -17.5), new THREE.Vector3(-3.65, .4, 23)),
      surface: 'wood',
    }],
    groundAt(x, z) {
      if (x < -3.7 && x > -7.2 && z > -16 && z < 22) return .2;
      const p = boatLocalXZ(x, z);
      if (Math.abs(p.x) < boat.deck.halfBeam && p.z > boat.deck.bow && p.z < boat.deck.stern) {
        boat.root.updateMatrixWorld(true);
        _worldPlayer.set(p.x, boat.deck.height, p.z);
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
      if (boat.bodyMarker.visible) {
        boat.bodyMarker.position.y = 1.56 + Math.sin(t * 3.1) * .07;
        boat.bodyMarker.rotation.z += dt * .75;
      }
      for (let i = 0; i < buoys.length; i++) {
        buoys[i].position.y = Math.sin(t * 1.4 + i) * .09;
        buoys[i].rotation.z = Math.sin(t * .8 + i * 1.3) * .035;
      }
      wake.update(dt);
    },
  };
}
