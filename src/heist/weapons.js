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

const KNIT = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.97 });
const KNIT_RIB = new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 1 });
/** The inside of an opening is not the same colour as the wool over it. */
const PORT_SHADOW = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1 });

/**
 * A balaclava — the worn one and the rolled one.
 *
 * The owner's note was *"balaclava model is bad"*, and the worn version was
 * one sphere: `SphereGeometry(0.135)` scaled 1×1.16×1.06 over the skull, with
 * no opening in it. A featureless dark egg where a face should be does not
 * read as a mask; it reads as a missing head.
 *
 * What makes a balaclava legible is the OPENING and the KNIT, in that order.
 * So: a two-hole eye port with a wool bridge down the middle of it, the
 * shadow inside the port darker than the wool around it, a nose the knit is
 * stretched over, a mouth vent, a brow seam, and a ribbed neck skirt that
 * disappears into the collar. Fourteen small meshes, only five people ever
 * wear one, and it is the difference between a mask and a smudge.
 *
 * Local origin is the SKULL CENTRE — `cast.js` parents it to `parts.head` at
 * y 0.17, which is where that centre sits, with the face out along +Z.
 */
export function makeBalaclava({ rolled = true } = {}) {
  const g = new THREE.Group();
  g.name = 'heist-balaclava';

  if (rolled) {
    /* Pushed up and sitting on the crown like a watch cap: this is the shape
     * on the loadout bench and in Tony's hand before the van. */
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.036, 8, 18), KNIT);
    roll.rotation.x = Math.PI / 2;
    g.add(roll);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.076, 0.012, 6, 18), KNIT_RIB);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    g.add(rim);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.073, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), KNIT,
    );
    crown.position.y = 0.014;
    crown.scale.set(1, 0.92, 1);
    g.add(crown);
    // The eye port, folded flat across the front of the roll — the one detail
    // that says this pile of wool is a mask and not a hat.
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.02, 0.012), PORT_SHADOW);
    port.position.set(0, 0.006, 0.088);
    g.add(port);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ---- worn ----
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 12), KNIT);
  shell.scale.set(1.0, 1.13, 1.05);
  shell.name = 'balaclava-shell';
  g.add(shell);

  /* The nose, and the ridge of knit pulled over it. A balaclava reads as worn
   * BY somebody because the wool is not spherical where the face is not. */
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), KNIT);
  nose.scale.set(0.85, 1.15, 1.5);
  nose.position.set(0, -0.012, 0.108);
  nose.name = 'balaclava-nose';
  g.add(nose);
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), KNIT);
  chin.scale.set(1, 0.78, 0.92);
  chin.position.set(0, -0.076, 0.062);
  g.add(chin);

  /* THE EYE PORT. Two holes with a bridge of wool between them, which is the
   * silhouette everyone recognises. The port itself is the dark inside of the
   * opening; the lids above and below are the wool edges rolled around it. */
  for (const side of [-1, 1]) {
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.036, 0.02), PORT_SHADOW);
    port.position.set(side * 0.041, 0.014, 0.1);
    port.rotation.z = -side * 0.06;
    port.name = `balaclava-eye-port-${side < 0 ? 'left' : 'right'}`;
    g.add(port);
    // The eye inside it, just visible and just catching light.
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 0.5 }));
    eye.position.set(side * 0.041, 0.014, 0.104);
    eye.castShadow = false;
    g.add(eye);
  }
  // The bridge of knit down the middle, and the rolled edges above and below.
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.042, 0.026), KNIT);
  bridge.position.set(0, 0.014, 0.101);
  bridge.name = 'balaclava-bridge';
  g.add(bridge);
  for (const [y, h] of [[0.04, 0.016], [-0.012, 0.014]]) {
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.126, h, 0.022), KNIT_RIB);
    lid.position.set(0, y, 0.099);
    g.add(lid);
  }

  // The mouth vent, and the brow seam above the port.
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.018, 0.016), PORT_SHADOW);
  mouth.position.set(0, -0.056, 0.098);
  mouth.name = 'balaclava-mouth-vent';
  g.add(mouth);
  const brow = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.008, 6, 20), KNIT_RIB);
  brow.rotation.x = Math.PI / 2;
  brow.position.y = 0.056;
  brow.scale.set(1, 1, 1.04);
  g.add(brow);

  /* The neck skirt, ribbed, going down inside the collar. Without it the mask
   * stops at the jaw and the head looks decapitated from the side. */
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.104, 0.088, 0.13, 16, 1, true), KNIT,
  );
  skirt.position.y = -0.128;
  skirt.name = 'balaclava-skirt';
  g.add(skirt);
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.099 - i * 0.005, 0.005, 5, 16), KNIT_RIB);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = -0.1 - i * 0.032;
    rib.castShadow = false;
    g.add(rib);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return g;
}

const PLATE_SHELL = new THREE.MeshStandardMaterial({ color: 0x1d2224, roughness: 0.92 });
const PLATE_WEBBING = new THREE.MeshStandardMaterial({ color: 0x3f463a, roughness: 1 });
const PLATE_BUCKLE = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.55, metalness: 0.35 });

/**
 * A plate carrier: the vest on the stand, and the vest on the crew.
 *
 * The owner's note was *"vest model still looks bad"* — twice, across two
 * passes. It was one `BoxGeometry(0.44, 0.44, 0.3)` with three small boxes
 * stuck on the front of it. That is a crate worn on the chest, and it looked
 * like one from every angle.
 *
 * What makes a carrier read: it is a FRONT PLATE and a BACK PLATE joined over
 * the shoulders and round the waist, not a solid block; the front is covered
 * in horizontal MOLLE webbing; there are three rifle magazine pouches with
 * flaps and pull-tabs; the cummerbund has buckles you can see; there is a drag
 * handle on the back of the neck. All of that is boxes — it is just boxes in
 * the shape of the thing instead of boxes in the shape of a box.
 *
 * @param {object}  [options]
 * @param {number}  [options.colour]  shell colour, so each crew member's
 *   carrier can sit against their own shirt.
 * @param {boolean} [options.loaded]  magazines standing in the pouches. False
 *   for the empty one hanging on the safehouse stand.
 * @returns {THREE.Group} origin at the CENTRE OF THE CHEST, front out along +Z
 */
export function makePlateCarrier({ colour = 0x1d2224, loaded = true } = {}) {
  const g = new THREE.Group();
  g.name = 'heist-plate-carrier';
  const shell = colour === 0x1d2224
    ? PLATE_SHELL
    : new THREE.MeshStandardMaterial({ color: colour, roughness: 0.92 });

  const plate = (w, h, d, pos, name) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shell);
    m.position.set(...pos);
    if (name) m.name = name;
    g.add(m);
    return m;
  };
  const strap = (w, h, d, pos, rot = 0, material = PLATE_WEBBING) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(...pos);
    if (rot) m.rotation.x = rot;
    g.add(m);
    return m;
  };

  /* Two plates, front and back, with a gap between them — not one solid box.
   * The gap is why a carrier reads as WORN rather than as a barrel. */
  const front = plate(0.34, 0.42, 0.055, [0, 0, 0.115], 'carrier-front-plate');
  front.rotation.x = 0.03;
  plate(0.33, 0.44, 0.05, [0, 0.005, -0.115], 'carrier-back-plate');
  // The soft sides that join them, tucked in under the arms.
  for (const side of [-1, 1]) {
    plate(0.045, 0.3, 0.19, [side * 0.16, -0.03, 0], `carrier-side-${side < 0 ? 'left' : 'right'}`);
  }

  /* Shoulder straps: over the trapezius, front pad and back pad, with the
   * quick-release tab on the right one. */
  for (const side of [-1, 1]) {
    strap(0.075, 0.05, 0.28, [side * 0.115, 0.215, 0], 0);
    strap(0.082, 0.035, 0.06, [side * 0.115, 0.2, 0.1], -0.22);
  }
  const release = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.02), PLATE_BUCKLE);
  release.position.set(0.115, 0.185, 0.135);
  g.add(release);

  /* MOLLE: five rows of horizontal webbing across the front plate. This is the
   * single detail that most says "plate carrier" at a glance. */
  for (let row = 0; row < 5; row++) {
    const y = 0.15 - row * 0.072;
    strap(0.3, 0.014, 0.012, [0, y, 0.146]);
    // Back plate gets three rows; nobody looks at it as hard.
    if (row < 3) strap(0.29, 0.014, 0.012, [0, 0.12 - row * 0.09, -0.146]);
  }

  /* Three rifle magazine pouches across the belly, flaps and pull-tabs, with
   * the magazines standing in them when the carrier is loaded. */
  for (const i of [-1, 0, 1]) {
    const x = i * 0.098;
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.135, 0.055), PLATE_WEBBING);
    pouch.position.set(x, -0.098, 0.166);
    pouch.name = `carrier-mag-pouch-${i + 2}`;
    g.add(pouch);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.062), PLATE_WEBBING);
    flap.position.set(x, -0.032, 0.168);
    flap.rotation.x = 0.16;
    g.add(flap);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.008), PLATE_BUCKLE);
    tab.position.set(x, -0.055, 0.198);
    g.add(tab);
    if (loaded) {
      const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.06, 0.03), MATS.parkerized);
      magazine.position.set(x, -0.006, 0.166);
      magazine.rotation.x = 0.06;
      magazine.name = `carrier-magazine-${i + 2}`;
      g.add(magazine);
    }
  }

  /* An admin pouch high on the left, a radio on the right with a stub aerial,
   * a blowout kit low on the left side. Asymmetry is what stops a carrier
   * looking printed on. */
  const admin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.035), PLATE_WEBBING);
  admin.position.set(-0.075, 0.08, 0.158);
  admin.name = 'carrier-admin-pouch';
  g.add(admin);
  const radio = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.045), PLATE_WEBBING);
  radio.position.set(0.108, 0.055, 0.152);
  radio.name = 'carrier-radio-pouch';
  g.add(radio);
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 6), MATS.polymer);
  aerial.position.set(0.108, 0.155, 0.152);
  aerial.rotation.x = -0.18;
  g.add(aerial);
  const trauma = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.05), PLATE_WEBBING);
  trauma.position.set(-0.185, -0.06, 0.02);
  trauma.name = 'carrier-trauma-kit';
  g.add(trauma);

  /* The cummerbund, round the ribs, with its buckles on the front edges — and
   * the drag handle across the back of the shoulders. */
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.115, 0.19), PLATE_WEBBING);
    band.position.set(side * 0.163, -0.06, 0.02);
    g.add(band);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 0.024), PLATE_BUCKLE);
    buckle.position.set(side * 0.155, -0.06, 0.115);
    g.add(buckle);
  }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 12, Math.PI), PLATE_WEBBING);
  handle.position.set(0, 0.19, -0.132);
  handle.rotation.set(Math.PI / 2, 0, 0);
  handle.name = 'carrier-drag-handle';
  g.add(handle);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
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
