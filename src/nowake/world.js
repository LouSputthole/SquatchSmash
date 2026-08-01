import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import { FAMILY } from '../bing/family.js';
import { CHARACTER_IDS } from '../core/campaign.js';

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

function buildWater(scene) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 },
      uFog: { value: new THREE.Color(0x9ba6aa) },
    },
    vertexShader: `
      varying vec3 vWorld;
      uniform float uTime;
      void main() {
        vec3 p = position;
        p.z += sin((p.x + uTime * 7.0) * 0.045) * 0.13;
        p.z += sin((p.y - uTime * 5.0) * 0.072) * 0.07;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uTime;
      uniform vec3 uFog;
      void main() {
        float bands = sin(vWorld.x * .08 + uTime) * sin(vWorld.z * .06 - uTime * .7);
        vec3 deep = vec3(.055, .16, .19);
        vec3 crest = vec3(.19, .34, .36);
        vec3 col = mix(deep, crest, bands * .18 + .28);
        gl_FragColor = vec4(mix(col, uFog, .10), .96);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 140, 140), material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.18;
  water.receiveShadow = true;
  scene.add(water);
  return { mesh: water, material };
}

function buildMarina(scene) {
  const wood = mat(0x493b2f, 0.92);
  const steel = mat(0x50585b, 0.55, 0.55);
  const concrete = mat(0x777a77, 1);
  const dock = new THREE.Group();
  dock.name = 'South Harbor · Gate C';
  dock.add(box([3.2, 0.3, 38], wood, -5.3, 0.05, 3));
  dock.add(box([12, 0.35, 3.2], wood, -9.6, 0.05, 18.5));
  for (let z = -14; z <= 20; z += 4.2) {
    dock.add(cylinder(0.14, 2.1, steel, -3.8, -0.45, z));
    dock.add(cylinder(0.14, 2.1, steel, -6.8, -0.45, z));
  }
  dock.add(box([16, 2.6, 5], concrete, -15, 1.1, 21));
  const officeSign = box([5.8, 0.9, 0.12], mat(0x10252d), -14.5, 2.55, 18.44);
  dock.add(officeSign);
  for (let i = 0; i < 8; i++) {
    const light = new THREE.PointLight(0xd6e5d7, 2.4, 14, 2);
    light.position.set(-5.3, 3.2, -13 + i * 5);
    dock.add(light);
  }
  scene.add(dock);

  // Neighboring boats and pilings make the berth legible without asset dependencies.
  for (const [x, z, yaw, color] of [
    [9, 5, .08, 0xc2b59a], [15, -9, -.12, 0x586b73], [-16, -8, .04, 0xe0ded4],
  ]) {
    const other = new THREE.Group();
    const hull = box([4.2, 1.25, 9.5], mat(color), 0, .2, 0);
    hull.geometry.translate(0, 0, -.3);
    other.add(hull, box([3.4, 1.5, 3.8], mat(0xe7e2d4), 0, 1.1, -.6));
    other.position.set(x, 0, z);
    other.rotation.y = yaw;
    scene.add(other);
  }

  const shoreline = box([420, 7, 36], mat(0x334338), 0, 1.2, 78);
  shoreline.receiveShadow = true;
  scene.add(shoreline);
  for (let i = 0; i < 34; i++) {
    const trunk = cylinder(.18 + (i % 3) * .04, 3.8, mat(0x463a2b), -190 + i * 12, 5.5, 67 + (i % 4) * 4, 7);
    const crown = mesh(new THREE.ConeGeometry(1.6 + (i % 4) * .22, 5.5, 8), mat(0x26392e), trunk.position.x, 9, trunk.position.z);
    scene.add(trunk, crown);
  }
  return dock;
}

function cruiserHullGeometry() {
  const sections = [
    { z: -5.9, w: .18 }, { z: -4.35, w: 1.72 },
    { z: 3.9, w: 2.08 }, { z: 5.65, w: 1.72 },
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
      if (side < 0) {
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

function buildBoat(scene) {
  const root = new THREE.Group();
  root.name = '38-foot cabin cruiser';
  const white = mat(0xd7d4c9, 0.66);
  const navy = mat(0x172b34, 0.55);
  const teak = mat(0x6a4b32, 0.82);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x29434c, roughness: .18, transmission: .7, transparent: true, opacity: .32,
    depthWrite: false,
  });
  const chrome = mat(0x90999b, .25, .82);

  const hull = mesh(cruiserHullGeometry(), white, 0, .05, 0);
  hull.name = 'deep-v hull';
  root.add(hull);
  root.add(box([4.25, .22, 9.3], teak, 0, .92, .6));
  root.add(box([3.85, .5, 3.2], white, 0, 1.16, -2.6));
  // Open wheelhouse: roof and pillars, never a solid box between the helm and water.
  root.add(box([3.45, .18, 2.85], white, 0, 2.75, -2.65));
  for (const x of [-1.63, 1.63]) {
    root.add(box([.16, 1.15, 2.7], white, x, 1.84, -2.65));
    root.add(box([.08, .62, 2.25], glass, x * .96, 1.98, -2.6));
  }
  root.add(box([3.16, .66, .07], glass, 0, 1.99, -4.01));
  for (const x of [-1.68, 1.68]) {
    root.add(box([.08, .45, 7.9], chrome, x, 1.45, .35));
    for (const z of [-3.4, -.6, 2.3, 4.1]) root.add(cylinder(.035, .78, chrome, x, 1.15, z, 8));
  }
  // Helm and startup panel.
  root.add(box([1.25, .95, .72], navy, -.82, 1.48, -1.55));
  const wheel = mesh(new THREE.TorusGeometry(.28, .035, 8, 18), chrome, -.82, 1.92, -1.13);
  wheel.rotation.x = .25;
  root.add(wheel);
  root.add(box([.72, .08, .42], mat(0x1f2526), .42, 1.48, -1.48));
  root.add(box([3.25, .35, 1.4], white, 0, 1.08, 4.35));

  const targets = {
    board: box([1.2, 1.6, 1.8], new THREE.MeshBasicMaterial({ visible: false }), -2.35, 1.0, 4.6),
    battery: box([.48, .4, .35], mat(0xb23127), .22, 1.57, -1.23),
    blower: box([.34, .3, .3], mat(0x33383a), .53, 1.62, -1.25),
    ignition: cylinder(.075, .12, chrome, .80, 1.63, -1.24, 12),
    helm: box([1.25, 1.2, .55], new THREE.MeshBasicMaterial({ visible: false }), -.82, 1.65, -.94),
    bowLine: cylinder(.075, .55, mat(0xcab78f), -1.86, 1.25, -3.95, 10),
    sternLine: cylinder(.075, .55, mat(0xcab78f), -1.86, 1.25, 4.55, 10),
  };
  for (const target of Object.values(targets)) root.add(target);

  const source = Object.fromEntries(FAMILY.map((member) => [member.id, member]));
  const cast = {
    lou: new Npc(root, {
      name: 'Big Uncle Lou', tier: 'hero', x: .95, y: .92, z: .75, yaw: Math.PI,
      job: 'stand', model: {
        height: 1.8, build: 1.4, dress: 'shirt', shirt: 0x25282a,
        skin: 0xd9a97f, hair: 'receding', hairColour: 0x241b17,
        chain: true, face: 'assets/faces/lou.png',
      },
    }),
    booski: new Npc(root, {
      name: 'Booskibro', tier: 'hero', x: -1.1, y: .92, z: 1.35, yaw: Math.PI,
      job: 'stand', model: { ...source[CHARACTER_IDS.BOOSKI].model, face: 'assets/faces/booski.png' },
    }),
    willy: new Npc(root, {
      name: 'Willy', tier: 'hero', x: .82, y: .92, z: 3.15, yaw: Math.PI,
      job: 'sit', model: { ...source[CHARACTER_IDS.WILLY].model },
    }),
  };
  cast.willy.group.userData.characterId = CHARACTER_IDS.WILLY;
  cast.booski.group.userData.characterId = CHARACTER_IDS.BOOSKI;
  cast.lou.group.userData.characterId = CHARACTER_IDS.LOU;

  scene.add(root);
  return { root, targets, cast, wheel };
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
    for (let i = 0; i < 42; i++) {
      const p = mesh(new THREE.PlaneGeometry(.55, 2.5), wakeMat.clone());
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
      const lateral = new THREE.Vector3(Math.cos(heading) * side, 0, Math.sin(heading) * side);
      p.position.copy(at).addScaledVector(lateral, 1.15);
      p.position.y = -.12;
      p.rotation.z = -heading + side * .48;
      p.scale.set(1, 1, 1);
      p.material.opacity = .3;
      p.userData.life = 1;
      p.visible = true;
    }
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.visible) continue;
      p.userData.life -= dt * .24;
      p.scale.multiplyScalar(1 + dt * .42);
      p.material.opacity = Math.max(0, p.userData.life * .28);
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
  const dock = buildMarina(scene);
  const boat = buildBoat(scene);
  const buoys = buildBuoys(scene);
  const wake = new WakePool(scene);
  const colliders = [];
  return {
    water, dock, boat, buoys, wake, colliders,
    floorZones: [],
    groundAt(x, z) {
      if (x < -3.7 && x > -7.2 && z > -16 && z < 22) return .2;
      if (x > -2.25 && x < 2.25 && z > -5.4 && z < 5.4) return .92;
      return 0;
    },
    update(t, dt) {
      water.material.uniforms.uTime.value = t;
      for (let i = 0; i < buoys.length; i++) {
        buoys[i].position.y = Math.sin(t * 1.4 + i) * .09;
        buoys[i].rotation.z = Math.sin(t * .8 + i * 1.3) * .035;
      }
      wake.update(dt);
    },
  };
}
