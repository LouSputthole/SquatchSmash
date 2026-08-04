import * as THREE from 'three';
import { buildCarbine } from '../core/weapons/models.js';

/**
 * THE TAKE's guns, and Tony's hands.
 *
 * The scene had one gun: four boxes in `cast.js`'s `weaponMesh()`, worn by the
 * crew, and nothing at all in the player's hands. So the owner could not see
 * what he was holding and the thing the crew held looked like a crate with a
 * stick in it.
 *
 * Two weapons now, both modelled: a short carbine built here, and the
 * campaign's canonical `makeNineMillimeterPistol` from `world/props.js` for the
 * sidearm — the same pistol the rest of the game already uses, at the same
 * scale, pointing down local -Z like every other hand prop in this project.
 */

const MATS = {
  steel: new THREE.MeshStandardMaterial({ color: 0x3c4247, metalness: 0.78, roughness: 0.34 }),
  parkerized: new THREE.MeshStandardMaterial({ color: 0x24282c, metalness: 0.6, roughness: 0.52 }),
  polymer: new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.82 }),
  furniture: new THREE.MeshStandardMaterial({ color: 0x2b2f26, roughness: 0.88 }),
  bore: new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 1 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xa9873f, metalness: 0.7, roughness: 0.4 }),
  webbing: new THREE.MeshStandardMaterial({ color: 0x3d4238, roughness: 1 }),
};

function slab(parent, size, position, material, name = '') {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.position.set(...position);
  if (name) m.name = name;
  m.castShadow = true;
  parent.add(m);
  return m;
}

function tube(parent, r, h, position, material, rotX = Math.PI / 2, name = '') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), material);
  m.position.set(...position);
  m.rotation.x = rotX;
  if (name) m.name = name;
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * The carbine, pointing down local -Z.
 *
 * THE MODEL MOVED to `src/core/weapons/models.js` as `buildCarbine`, part for
 * part and name for name, when the shared weapon system was built — Lou's
 * basement armory racks four of this exact gun, and a second carbine modelled
 * beside this one would have been two guns the player is told are one. THE
 * TAKE's carbine is unchanged: same 74 cm, same fourteen named parts, same
 * `userData.muzzle`, same optional sling.
 *
 * The original note still applies and is worth keeping in front of anyone
 * editing the model: about 74 cm from muzzle to buttplate with the stock
 * collapsed, which is a short-barrelled carbine and not the metre-long fence
 * post the old four-box version implied. Every part is a part somebody could
 * name: flash hider, gas block, front sight, free-float handguard with a rail,
 * ejection port and forward assist, charging handle, dust cover, magazine with
 * a floorplate, pistol grip, buffer tube and a collapsed stock.
 */
export function makeHeistCarbine({ sling = false } = {}) {
  return buildCarbine({ sling });
}

/**
 * The sidearm: a compact double-stack 9mm, pointing down local -Z.
 *
 * Deliberately built here rather than imported from `world/props.js`, whose
 * `makeNineMillimeterPistol` is the shape this follows to the millimetre.
 * That module builds a canvas-backed brushed-metal texture at import time, so
 * importing it drags a `document` into every Node test that touches the level —
 * which is exactly what broke the suite the first time this file reached for
 * it. Same gun, same convention, no DOM.
 */
export function makeHeistSidearm() {
  const g = new THREE.Group();
  g.name = 'heist-sidearm';
  const slideSteel = new THREE.MeshStandardMaterial({ color: 0x343a40, metalness: 0.86, roughness: 0.3 });
  const slideDark = new THREE.MeshStandardMaterial({ color: 0x171b1f, metalness: 0.7, roughness: 0.4 });
  const polymer = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.76 });

  slab(g, [0.032, 0.038, 0.164], [0, 0.038, -0.05], slideSteel, 'sidearm-slide');
  slab(g, [0.026, 0.008, 0.074], [0, 0.06, -0.018], slideDark);
  slab(g, [0.018, 0.01, 0.029], [0, 0.058, -0.005], MATS.bore, 'sidearm-ejection-port');
  tube(g, 0.0062, 0.013, [0, 0.038, -0.137], MATS.bore, Math.PI / 2, 'sidearm-muzzle');
  slab(g, [0.005, 0.01, 0.01], [0, 0.067, -0.122], MATS.bore, 'sidearm-front-sight');
  for (const sx of [-1, 1]) slab(g, [0.006, 0.01, 0.01], [sx * 0.01, 0.067, 0.02], MATS.bore);
  // Slide serrations, the frame, the rail, the trigger and its guard.
  for (let i = 0; i < 5; i++) slab(g, [0.034, 0.026, 0.004], [0, 0.038, 0.006 + i * 0.009], slideDark);
  slab(g, [0.03, 0.03, 0.13], [0, 0.006, -0.028], polymer, 'sidearm-frame');
  slab(g, [0.022, 0.008, 0.05], [0, -0.012, -0.062], slideDark, 'sidearm-rail');
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0035, 6, 12, Math.PI), polymer);
  guard.position.set(0, -0.012, -0.002);
  guard.rotation.set(Math.PI / 2, 0, Math.PI);
  guard.rotateX(Math.PI / 2);
  g.add(guard);
  slab(g, [0.006, 0.018, 0.006], [0, -0.004, 0], slideDark, 'sidearm-trigger');
  // Grip, raked back, with the magazine floorplate under it.
  const grip = new THREE.Group();
  grip.position.set(0, -0.008, 0.026);
  grip.rotation.x = 0.3;
  slab(grip, [0.03, 0.105, 0.036], [0, -0.055, 0], polymer, 'sidearm-grip');
  for (let i = 0; i < 4; i++) slab(grip, [0.034, 0.006, 0.006], [0, -0.028 - i * 0.02, 0.017], slideDark);
  slab(grip, [0.034, 0.008, 0.042], [0, -0.112, 0], slideDark, 'sidearm-floorplate');
  g.add(grip);

  g.userData.muzzle = new THREE.Vector3(0, 0.038, -0.145);
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  return g;
}

/** A rolled balaclava, for the hands and for the crew's heads. */
export function makeBalaclava({ rolled = true } = {}) {
  const g = new THREE.Group();
  g.name = 'heist-balaclava';
  const knit = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.97 });
  if (rolled) {
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.034, 8, 16), knit);
    roll.rotation.x = Math.PI / 2;
    g.add(roll);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), knit);
    crown.position.y = 0.012;
    g.add(crown);
  } else {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), knit);
    hood.scale.set(1, 1.16, 1.06);
    g.add(hood);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A canvas cash bag, for the hands and for the vault floor. */
export function makeCashBag({ full = true } = {}) {
  const g = new THREE.Group();
  g.name = full ? 'heist-cash-bag' : 'heist-duffel';
  const canvas = new THREE.MeshStandardMaterial({ color: full ? 0x2b3128 : 0x24272b, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, full ? 0.27 : 0.16, 0.24), canvas);
  body.name = 'bag-body';
  g.add(body);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.011, 5, 12, Math.PI), MATS.webbing);
  strap.position.y = full ? 0.13 : 0.08;
  strap.rotation.x = Math.PI / 2;
  g.add(strap);
  if (full) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x7e8a63, roughness: 0.85 }),
    );
    band.position.set(0.06, 0.13, 0.03);
    band.rotation.z = 0.2;
    band.name = 'bag-spill';
    g.add(band);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** A fistful of zip ties. */
export function makeZipTies() {
  const g = new THREE.Group();
  g.name = 'heist-zip-ties';
  const nylon = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.75 });
  for (let i = 0; i < 4; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 4, 14), nylon);
    loop.position.set(0, i * 0.006, 0);
    loop.rotation.set(Math.PI / 2, i * 0.22, 0);
    g.add(loop);
  }
  return g;
}

/** The escape car keys. */
export function makeCarKeys() {
  const g = new THREE.Group();
  g.name = 'heist-keys';
  const brass = MATS.brass;
  for (const [i, angle] of [-0.25, 0.2].entries()) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.002, 0.07), brass);
    blade.position.set(0, -0.03 - i * 0.004, -0.04);
    blade.rotation.y = angle;
    g.add(blade);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0025, 5, 14), MATS.steel);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const fob = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.05, 0.008),
    new THREE.MeshStandardMaterial({ color: 0x191b1e, roughness: 0.6 }),
  );
  fob.position.set(0.024, 0.018, 0);
  g.add(fob);
  return g;
}

/**
 * Tony's first-person hands.
 *
 * One rig, six things it can be holding, and only one of them visible at a
 * time — so the inventory bar and the screen agree about what is in his hands,
 * which was the owner's whole complaint. Built on the same shape the Silver
 * Case's view-model uses: props parented to the camera, a hidden rest below
 * frame, a swap dip when the selection changes, and a kick on each shot.
 */
export function makeHeistViewModel(camera, { skin = 0xd2a074, sleeve = 0x22252a } = {}) {
  const root = new THREE.Group();
  root.name = 'heist.viewmodel';
  camera.add(root);

  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.86 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: sleeve, roughness: 0.94 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x191c20, roughness: 0.88 });

  function hands({ two = false, gloved = true } = {}) {
    const g = new THREE.Group();
    const material = gloved ? gloveMat : skinMat;
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.085, 0.075), material);
    right.position.set(0.012, -0.052, 0.058);
    right.rotation.x = -0.4;
    g.add(right);
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.072, 0.13), sleeveMat);
    cuff.position.set(0.014, -0.088, 0.15);
    cuff.rotation.x = -0.28;
    g.add(cuff);
    if (two) {
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.07), material);
      left.position.set(-0.028, -0.02, -0.145);
      left.rotation.set(-0.35, 0.3, 0);
      g.add(left);
      const leftCuff = new THREE.Mesh(new THREE.BoxGeometry(0.066, 0.066, 0.12), sleeveMat);
      leftCuff.position.set(-0.062, -0.06, -0.09);
      leftCuff.rotation.set(-0.2, 0.5, 0);
      g.add(leftCuff);
    }
    return g;
  }

  /* One holder per item. Each is positioned so the thing reads at the bottom
   * right of the frame without covering the subtitle line. */
  const holders = new Map();

  function holder(key, build, { position, rotation = [0, 0, 0], twoHanded = false }) {
    const g = new THREE.Group();
    g.name = `heist.viewmodel.${key}`;
    g.add(build());
    g.add(hands({ two: twoHanded }));
    g.position.fromArray(position);
    g.rotation.fromArray(rotation);
    g.visible = false;
    root.add(g);
    holders.set(key, g);
    return g;
  }

  /* Distances are chosen against the scene's 72-degree field: at 0.5 m the
   * frame is about 0.73 m tall, so a 0.16 m pistol reads as a fifth of the
   * screen and an 0.86 m carbine as a diagonal across the bottom right —
   * held, not pressed against the lens. */
  holder('carbine', () => makeHeistCarbine({ sling: true }), {
    position: [0.19, -0.19, -0.6], rotation: [0.05, 0.12, 0], twoHanded: true,
  });
  holder('sidearm', () => makeHeistSidearm(), {
    position: [0.16, -0.17, -0.46], rotation: [0.04, 0.08, 0],
  });
  holder('mask', () => makeBalaclava({ rolled: true }), {
    position: [0.2, -0.2, -0.5], rotation: [0.3, 0, -0.2],
  });
  holder('zip_ties', () => makeZipTies(), {
    position: [0.21, -0.22, -0.52], rotation: [0.2, 0, -0.3],
  });
  holder('duffel', () => makeCashBag({ full: false }), {
    position: [0.26, -0.34, -0.68], rotation: [0.18, -0.25, 0.12],
  });
  holder('cash_bag', () => makeCashBag({ full: true }), {
    position: [0.25, -0.36, -0.66], rotation: [0.16, -0.28, 0.1],
  });
  holder('keys', () => makeCarKeys(), {
    position: [0.18, -0.18, -0.42], rotation: [0.4, 0.2, -0.15],
  });

  let current = null;
  let swap = 0;
  let recoil = 0;
  let sway = 0;

  return {
    root,
    holders,
    get current() { return current; },
    /** @param {string|null} key catalog key, or null for empty hands. */
    show(key) {
      if (key === current) return false;
      for (const [name, group] of holders) group.visible = name === key;
      current = holders.has(key) ? key : null;
      swap = current ? 1 : 0;
      return true;
    },
    fire() { recoil = 1; },
    update(dt, { speed = 0 } = {}) {
      swap = Math.max(0, swap - dt * 4.2);
      recoil = Math.max(0, recoil - dt * 6.4);
      sway += dt * (1.6 + Math.min(4, speed));
      const group = current ? holders.get(current) : null;
      if (!group) return;
      const base = group.userData.base ??= {
        position: group.position.clone(), rotation: group.rotation.clone(),
      };
      const bob = Math.min(1, speed / 4);
      group.position.set(
        base.position.x + Math.sin(sway) * 0.006 * bob,
        base.position.y + Math.abs(Math.cos(sway)) * 0.007 * bob - swap * 0.16 + recoil * 0.012,
        base.position.z + recoil * 0.035,
      );
      group.rotation.set(
        base.rotation.x - recoil * 0.16 + swap * 0.35,
        base.rotation.y + Math.sin(sway * 0.6) * 0.008 * bob,
        base.rotation.z - swap * 0.4,
      );
    },
  };
}
