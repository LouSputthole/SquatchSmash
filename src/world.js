import * as THREE from 'three';

export const BOUNDS = 85;

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- Prop factories ----------
// Each returns { group, radius, hp, points, type }

function makeTree() {
  const g = new THREE.Group();
  const s = 0.8 + Math.random() * 0.8;
  const trunk = mesh(new THREE.CylinderGeometry(0.22 * s, 0.3 * s, 2.2 * s, 7), lambert(0x6b4a2a), 0, 1.1 * s, 0);
  g.add(trunk);
  const green = new THREE.Color().setHSL(0.32 + Math.random() * 0.06, 0.5, 0.28 + Math.random() * 0.1);
  const tiers = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < tiers; i++) {
    const r = (1.9 - i * 0.5) * s;
    const cone = mesh(new THREE.ConeGeometry(r, 2.4 * s, 8), lambert(green), 0, (2.2 + i * 1.4) * s, 0);
    g.add(cone);
  }
  return { group: g, radius: 0.8 * s, hp: 1, points: 100, type: 'tree' };
}

function makeRock() {
  const g = new THREE.Group();
  const s = 0.9 + Math.random() * 1.2;
  const rock = mesh(new THREE.DodecahedronGeometry(s, 0), lambert(0x8b8f94), 0, s * 0.5, 0);
  rock.scale.y = 0.65;
  rock.rotation.y = Math.random() * Math.PI;
  g.add(rock);
  return { group: g, radius: s * 1.05, hp: Infinity, points: 0, type: 'rock', smashable: false };
}

const TENT_COLORS = [0xd94f4f, 0x3a7bd9, 0xe8a23a, 0x4fae5c, 0x9a5bd9];

function makeTent() {
  const g = new THREE.Group();
  const color = TENT_COLORS[Math.floor(Math.random() * TENT_COLORS.length)];
  const body = mesh(new THREE.ConeGeometry(1.9, 2.1, 4), lambert(color), 0, 1.05, 0);
  body.rotation.y = Math.PI / 4;
  g.add(body);
  const door = mesh(new THREE.ConeGeometry(0.7, 1.0, 4), lambert(0x2a2a33), 0, 0.5, 1.15);
  door.rotation.y = Math.PI / 4;
  g.add(door);
  return { group: g, radius: 1.9, hp: 1, points: 250, type: 'tent' };
}

const CAR_COLORS = [0xd94f4f, 0x4f7dd9, 0xe6e6e6, 0x59b559, 0xe8c04a, 0xd97eb0];

function makeCar() {
  const g = new THREE.Group();
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  g.add(mesh(new THREE.BoxGeometry(4.4, 1.0, 1.9), lambert(color), 0, 0.85, 0));
  g.add(mesh(new THREE.BoxGeometry(2.3, 0.85, 1.7), lambert(0xbfe3f2), 0, 1.75, 0));
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 10);
  for (const sx of [-1.4, 1.4]) {
    for (const sz of [-1, 1]) {
      const w = mesh(wheelGeo, lambert(0x1c1c22), sx, 0.45, sz * 0.95);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
  return { group: g, radius: 2.5, hp: 2, points: 500, type: 'car' };
}

function makeCabin() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(5.4, 3.0, 4.4), lambert(0x8a5a30), 0, 1.5, 0));
  // Triangular prism roof: 3-sided cylinder with the apex vertex rotated to +X,
  // then laid along X so the apex points up and the flat side sits on the walls.
  const roofGeo = new THREE.CylinderGeometry(2.9, 2.9, 6.0, 3, 1, false, Math.PI / 2);
  roofGeo.rotateZ(Math.PI / 2);
  g.add(mesh(roofGeo, lambert(0x5c3a1c), 0, 4.4, 0));
  g.add(mesh(new THREE.BoxGeometry(1.2, 2.0, 0.2), lambert(0x3a2412), 0, 1.0, 2.25));
  g.add(mesh(new THREE.BoxGeometry(1.1, 1.0, 0.15), lambert(0xbfe3f2), 1.7, 1.9, 2.25));
  g.add(mesh(new THREE.BoxGeometry(1.1, 1.0, 0.15), lambert(0xbfe3f2), -1.7, 1.9, 2.25));
  return { group: g, radius: 3.6, hp: 3, points: 1000, type: 'cabin' };
}

function makeCooler() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), lambert(0x3a7bd9), 0, 0.28, 0));
  g.add(mesh(new THREE.BoxGeometry(0.95, 0.14, 0.6), lambert(0xe6e6e6), 0, 0.62, 0));
  return { group: g, radius: 0.7, hp: 1, points: 50, type: 'cooler' };
}

function makeOuthouse() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.5, 2.4, 1.5), lambert(0x7a6a4a), 0, 1.2, 0));
  const roof = mesh(new THREE.BoxGeometry(1.8, 0.15, 1.8), lambert(0x4a3a22), 0, 2.5, 0);
  g.add(roof);
  g.add(mesh(new THREE.CircleGeometry(0.16, 12), lambert(0x2a2015), 0, 1.8, 0.76));
  return { group: g, radius: 1.2, hp: 1, points: 300, type: 'outhouse' };
}

function makeCampfire() {
  const g = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.3, 6);
  for (let i = 0; i < 4; i++) {
    const log = mesh(logGeo, lambert(0x5c3a1c), 0, 0.18, 0);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    g.add(log);
  }
  const flame = mesh(
    new THREE.ConeGeometry(0.5, 1.2, 6),
    new THREE.MeshBasicMaterial({ color: 0xff8c2a }),
    0, 0.9, 0
  );
  flame.castShadow = false;
  const flameCore = mesh(
    new THREE.ConeGeometry(0.25, 0.8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd75e }),
    0, 0.8, 0
  );
  flameCore.castShadow = false;
  g.add(flame, flameCore);
  return { group: g, radius: 1.0, hp: 1, points: 150, type: 'campfire', flames: [flame, flameCore] };
}

// ---------- World assembly ----------

export function buildWorld(scene) {
  scene.background = new THREE.Color(0x9fc4e8);
  scene.fog = new THREE.Fog(0x9fc4e8, 70, 190);

  // Lights
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a5a2a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshLambertMaterial({ color: 0x4d7c3c })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grass patches for visual variety
  const patchMat = new THREE.MeshLambertMaterial({ color: 0x426d33 });
  for (let i = 0; i < 50; i++) {
    const r = 2 + Math.random() * 5;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 10), patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set((Math.random() - 0.5) * 2 * BOUNDS, 0.02, (Math.random() - 0.5) * 2 * BOUNDS);
    patch.receiveShadow = true;
    scene.add(patch);
  }

  // Distant mountains
  const mtnMat = new THREE.MeshLambertMaterial({ color: 0x6e7f96 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 130 + Math.random() * 40;
    const h = 30 + Math.random() * 35;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 5), mtnMat);
    mtn.position.set(Math.cos(a) * dist, h / 2 - 2, Math.sin(a) * dist);
    mtn.rotation.y = Math.random() * Math.PI;
    scene.add(mtn);
  }

  // Clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 3, 8, 6), cloudMat);
      puff.position.set(j * 4 - 4, Math.random() * 1.5, Math.random() * 2);
      puff.scale.y = 0.5;
      cloud.add(puff);
    }
    cloud.position.set((Math.random() - 0.5) * 240, 42 + Math.random() * 15, (Math.random() - 0.5) * 240);
    scene.add(cloud);
  }

  // ---------- Prop placement ----------
  const props = [];
  const flames = [];

  function place(factory, count) {
    for (let i = 0; i < count; i++) {
      const prop = factory();
      let placed = false;
      for (let tries = 0; tries < 50 && !placed; tries++) {
        const x = (Math.random() - 0.5) * 2 * (BOUNDS - 3);
        const z = (Math.random() - 0.5) * 2 * (BOUNDS - 3);
        if (Math.hypot(x, z) < 9) continue; // keep the spawn point clear
        let ok = true;
        for (const other of props) {
          if (Math.hypot(x - other.x, z - other.z) < prop.radius + other.radius + 1.2) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        prop.group.position.set(x, 0, z);
        prop.group.rotation.y = Math.random() * Math.PI * 2;
        prop.x = x;
        prop.z = z;
        prop.alive = true;
        prop.smashable = prop.smashable !== false;
        prop.maxHp = prop.hp;
        prop.wobble = 0;
        scene.add(prop.group);
        props.push(prop);
        if (prop.flames) flames.push(...prop.flames);
        placed = true;
      }
    }
  }

  place(makeTree, 90);
  place(makeRock, 12);
  place(makeTent, 12);
  place(makeCar, 9);
  place(makeCabin, 6);
  place(makeOuthouse, 4);
  place(makeCampfire, 5);
  place(makeCooler, 14);

  const smashableCount = props.filter((p) => p.smashable).length;

  return { props, flames, sun, smashableCount };
}
