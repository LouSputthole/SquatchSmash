import * as THREE from 'three';
import { lambert } from '../../game/src/world.js';
import { Mouth } from '../core/mouth.js';

// ---------------------------------------------------------------------------
// Everybody in the motel who is not Prospect.
//
// Tony and Snow are adult humans. "Squatchtana" is the family name, not a
// species flag; keeping them on the human rig preserves their identity across
// scenes. Costume, role, and faction distinguish the motel cast.
// ---------------------------------------------------------------------------

function box(w, h, d, color, extra = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color, extra));
  m.castShadow = true;
  return m;
}

const SKIN_TONES = [0xe8c39a, 0xc99268, 0x8d5f3c, 0xf0d0b0, 0x6f472c];

/* Pull the frame in to the head itself — [u, v, width, height] in texture
 * space, v from the bottom. These are all phone portraits at arm's length. */
const FACE_CROP = [0.20, 0.06, 0.60, 0.86];
const faceTexCache = new Map();
function faceTexture(url, crop) {
  const key = `${url}|${crop.join(',')}`;
  if (!faceTexCache.has(key)) {
    const tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.offset.set(crop[0], crop[1]);
    tex.repeat.set(crop[2], crop[3]);
    faceTexCache.set(key, tex);
  }
  return faceTexCache.get(key);
}

// Dispatch: humans by default, sasquatches for the family.
export function buildActor(cfg = {}) {
  return cfg.species === 'squatch' ? buildSquatchRig(cfg) : buildHumanRig(cfg);
}

// ---------------- Human rig ----------------
// Roughly 1.85 m to Prospect's 3.3 m. Real proportions, blocky construction,
// so a human reads as a person and never as a small sasquatch.
function buildHumanRig(cfg = {}) {
  const skin = cfg.skin ?? SKIN_TONES[0];
  const shirt = cfg.shirt ?? 0x8a8a92;
  const pants = cfg.pants ?? 0x2f3340;
  const hair = cfg.hair ?? 0x241a12;
  const shoes = cfg.shoes ?? 0x1c1c22;
  const sleeveless = !!cfg.sleeveless;

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const hips = box(0.44, 0.2, 0.24, pants);
  hips.position.y = 0.98;
  body.add(hips);

  const torso = box(0.5, 0.64, 0.26, shirt);
  torso.position.y = 1.3;
  body.add(torso);

  const shoulders = box(0.58, 0.14, 0.28, shirt);
  shoulders.position.y = 1.58;
  body.add(shoulders);

  const neck = box(0.13, 0.1, 0.13, skin);
  neck.position.y = 1.68;
  body.add(neck);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.84, 0);
  const eyes = [];
  let face = null;
  let mouth = null;
  if (cfg.face) {
    /* A photographed Family face: the picture on the +z side of the skull and
     * hair colour on the other five, the same technique the Initiation and the
     * Bing use. The photo already has eyes and a mouth in it, so none of the
     * procedural features get built on top. Slightly narrower than it is tall,
     * so the crop lands at close to its own aspect instead of stretching. */
    const wrap = lambert(hair);
    const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(cfg.face, cfg.faceCrop ?? FACE_CROP) });
    const skull = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.3, 0.25),
      [wrap, wrap, wrap, wrap, faceMat, wrap],
    );
    skull.castShadow = true;
    skull.name = `actor.face.${cfg.identity || cfg.name?.toLowerCase() || 'photo'}`;
    face = skull;
    head.add(skull);
  } else {
    const skull = box(0.25, 0.3, 0.25, skin);
    skull.name = `actor.face.${cfg.identity || cfg.name?.toLowerCase() || 'procedural'}`;
    face = skull;
    head.add(skull);
    const hairCap = box(0.27, 0.09, 0.27, hair);
    hairCap.position.y = 0.15;
    head.add(hairCap);
    const back = box(0.27, 0.16, 0.1, hair);
    back.position.set(0, 0.03, -0.1);
    head.add(back);
    for (const s of [-1, 1]) {
      const e = box(0.045, 0.035, 0.03, cfg.eyeColor ?? 0x20242e);
      e.position.set(0.06 * s, 0.03, 0.13);
      head.add(e);
      eyes.push(e);
    }
    mouth = box(0.105, 0.018, 0.022, cfg.mouthColor ?? 0x4b1d1d);
    mouth.name = 'actor.mouth';
    mouth.position.set(0, -0.085, 0.137);
    head.add(mouth);
  }
  body.add(head);

  const armL = buildHumanArm(-1, shirt, skin, sleeveless);
  const armR = buildHumanArm(1, shirt, skin, sleeveless);
  body.add(armL, armR);

  const legL = buildHumanLeg(-1, pants, shoes);
  const legR = buildHumanLeg(1, pants, shoes);
  group.add(legL, legR);

  // ---- costume ----
  if (cfg.tropical) {
    // Open shirt: bare chest with two loud panels either side
    torso.material = lambert(skin);
    for (const s of [-1, 1]) {
      const panel = box(0.17, 0.66, 0.06, cfg.tropical);
      panel.position.set(0.17 * s, 1.3, 0.14);
      body.add(panel);
    }
    const collar = box(0.5, 0.08, 0.28, cfg.tropical);
    collar.position.y = 1.6;
    body.add(collar);
  }
  if (cfg.shades) {
    const g = box(0.24, 0.06, 0.04, 0x101014, { emissive: 0x2a2a3a });
    g.position.set(0, 0.04, 0.14);
    head.add(g);
  }
  if (cfg.mustache) {
    const m = box(0.12, 0.025, 0.03, hair);
    m.position.set(0, -0.05, 0.14);
    head.add(m);
  }
  if (cfg.chain) {
    const c = box(0.24, 0.03, 0.05, 0xe8c04a, { emissive: 0x6a5210 });
    c.position.set(0, 1.52, 0.14);
    body.add(c);
    const medal = box(0.08, 0.1, 0.03, 0xe8c04a, { emissive: 0x6a5210 });
    medal.position.set(0, 1.42, 0.15);
    body.add(medal);
  }
  if (cfg.apron) {
    const a = box(0.42, 0.78, 0.05, 0xd8d2c0);
    a.position.set(0, 1.18, 0.15);
    body.add(a);
    const stain = box(0.14, 0.12, 0.03, 0x7a1414);
    stain.position.set(0.09, 1.06, 0.18);
    body.add(stain);
  }
  if (cfg.gloves) {
    for (const arm of [armL, armR]) {
      const gl = box(0.14, 0.16, 0.14, 0xf0f4f0);
      gl.position.y = -0.62;
      arm.add(gl);
    }
  }
  if (cfg.cap) {
    const cap = box(0.28, 0.1, 0.28, cfg.cap);
    cap.position.set(0, 0.17, 0);
    head.add(cap);
    const brim = box(0.28, 0.04, 0.14, cfg.cap);
    brim.position.set(0, 0.13, 0.19);
    head.add(brim);
  }

  group.scale.setScalar(cfg.scale ?? 1);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    group, body, head, faceMesh: face, mouth, torso, armL, armR, legL, legR, eyes,
    height: 1.9, handY: -0.72, radius: 0.42, species: 'human',
    face: cfg.face ?? null,
  };
}

function buildHumanArm(side, shirt, skin, sleeveless) {
  const pivot = new THREE.Group();
  pivot.position.set(0.32 * side, 1.52, 0);
  const upper = box(0.13, 0.38, 0.15, sleeveless ? skin : shirt);
  upper.position.y = -0.19;
  pivot.add(upper);
  const fore = box(0.11, 0.34, 0.13, skin);
  fore.position.y = -0.53;
  pivot.add(fore);
  const hand = box(0.12, 0.14, 0.12, skin);
  hand.position.y = -0.76;
  pivot.add(hand);
  pivot.userData.hand = hand;
  return pivot;
}

function buildHumanLeg(side, pants, shoes) {
  const pivot = new THREE.Group();
  pivot.position.set(0.13 * side, 0.94, 0);
  const leg = box(0.17, 0.9, 0.19, pants);
  leg.position.y = -0.45;
  pivot.add(leg);
  const shoe = box(0.18, 0.11, 0.3, shoes);
  shoe.position.set(0, -0.9, 0.06);
  pivot.add(shoe);
  return pivot;
}

// ---------------- Sasquatch rig (the family) ----------------
function buildSquatchRig(cfg = {}) {
  const fur = cfg.fur ?? 0x6b5a44;
  const furDark = cfg.furDark ?? shade(fur, -0.25);
  const skin = cfg.skin ?? 0xd8c0a0;
  const scale = cfg.scale ?? 1;

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = box(1.25, 1.2, 0.8, cfg.shirt ?? fur);
  torso.position.y = 1.6;
  body.add(torso);
  const shoulders = box(1.6, 0.4, 0.85, cfg.shirt ?? furDark);
  shoulders.position.y = 2.1;
  body.add(shoulders);

  const head = new THREE.Group();
  head.position.set(0, 2.55, 0.05);
  const skull = box(0.72, 0.72, 0.7, fur);
  head.add(skull);
  const face = box(0.48, 0.42, 0.1, skin);
  face.position.set(0, -0.05, 0.38);
  head.add(face);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = box(0.1, 0.09, 0.05, cfg.eyeColor ?? 0x1b2130);
    e.position.set(0.14 * s, 0.06, 0.42);
    head.add(e);
    eyes.push(e);
  }
  body.add(head);

  const armL = buildLimb(-1, 0.82, 2.05, fur, furDark, skin);
  const armR = buildLimb(1, 0.82, 2.05, fur, furDark, skin);
  body.add(armL, armR);

  const legL = buildLeg(-1, fur, furDark, skin, cfg.pants);
  const legR = buildLeg(1, fur, furDark, skin, cfg.pants);
  group.add(legL, legR);

  // ---- costume ----
  if (cfg.shades) {
    const g = box(0.56, 0.14, 0.08, 0x101014, { emissive: 0x2a2a3a });
    g.position.set(0, 0.07, 0.44);
    head.add(g);
  }
  if (cfg.mustache) {
    const m = box(0.3, 0.06, 0.06, 0x241a12);
    m.position.set(0, -0.1, 0.44);
    head.add(m);
  }
  if (cfg.chain) {
    const c = box(0.5, 0.08, 0.1, 0xe8c04a, { emissive: 0x6a5210 });
    c.position.set(0, 2.0, 0.42);
    body.add(c);
    const medal = box(0.18, 0.22, 0.06, 0xe8c04a, { emissive: 0x6a5210 });
    medal.position.set(0, 1.85, 0.44);
    body.add(medal);
  }
  if (cfg.apron) {
    const a = box(1.0, 1.3, 0.1, 0xd8d2c0);
    a.position.set(0, 1.45, 0.44);
    body.add(a);
    const stain = box(0.3, 0.25, 0.04, 0x7a1414);
    stain.position.set(0.2, 1.3, 0.5);
    body.add(stain);
  }
  if (cfg.gloves) {
    for (const arm of [armL, armR]) {
      const gl = box(0.3, 0.28, 0.32, 0xf0f4f0);
      gl.position.y = -1.55;
      arm.add(gl);
    }
  }
  if (cfg.cap) {
    const cap = box(0.78, 0.2, 0.76, cfg.cap);
    cap.position.set(0, 0.42, 0);
    head.add(cap);
    const brim = box(0.78, 0.08, 0.32, cfg.cap);
    brim.position.set(0, 0.34, 0.45);
    head.add(brim);
  }
  if (cfg.tropical) {
    // Loud open shirt: two panels over a bare chest
    for (const s of [-1, 1]) {
      const panel = box(0.42, 1.25, 0.12, cfg.tropical);
      panel.position.set(0.36 * s, 1.6, 0.42);
      body.add(panel);
    }
  }

  group.scale.setScalar(scale);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return { group, body, head, torso, armL, armR, legL, legR, eyes, height: 3.1, handY: -1.75, radius: 0.7, species: 'squatch' };
}

function buildLimb(side, x, y, fur, furDark, skin) {
  const pivot = new THREE.Group();
  pivot.position.set(x * side, y, 0);
  const upper = box(0.4, 0.85, 0.42, fur);
  upper.position.y = -0.45;
  pivot.add(upper);
  const fore = box(0.36, 0.72, 0.38, furDark);
  fore.position.y = -1.15;
  pivot.add(fore);
  const hand = box(0.4, 0.32, 0.42, skin);
  hand.position.y = -1.6;
  pivot.add(hand);
  pivot.userData.hand = hand;
  return pivot;
}

function buildLeg(side, fur, furDark, skin, pants) {
  const pivot = new THREE.Group();
  pivot.position.set(0.32 * side, 1.05, 0);
  const leg = box(0.42, 1.0, 0.44, pants ?? furDark);
  leg.position.y = -0.5;
  pivot.add(leg);
  const foot = box(0.44, 0.18, 0.68, skin);
  foot.position.set(0, -0.98, 0.14);
  pivot.add(foot);
  return pivot;
}

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return c.getHex();
}

// ---------------- Weapons held in a hand ----------------

const WEAPON_BUILDERS = {
  cleaver: () => {
    const g = new THREE.Group();
    g.add(box(0.06, 0.3, 0.06, 0x3a2a1a));
    const blade = box(0.05, 0.34, 0.5, 0xd0d6dc, { emissive: 0x3a4046 });
    blade.position.set(0, -0.28, 0.16);
    g.add(blade);
    return g;
  },
  thermometer: () => {
    const g = new THREE.Group();
    g.add(box(0.07, 0.36, 0.07, 0xc9ced6));
    const dial = box(0.2, 0.2, 0.05, 0xe8e8e8, { emissive: 0x555555 });
    dial.position.y = 0.22;
    g.add(dial);
    return g;
  },
  slicer: () => {
    const g = new THREE.Group();
    g.add(box(0.5, 0.35, 0.4, 0xb8bcc4));
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14), lambert(0xe8ecf0, { emissive: 0x555a60 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0.24, 0.05, 0);
    g.add(wheel);
    return g;
  },
  hook: () => {
    const g = new THREE.Group();
    g.add(box(0.05, 0.5, 0.05, 0x8a8a92));
    const tip = box(0.05, 0.2, 0.24, 0x8a8a92);
    tip.position.set(0, -0.3, 0.1);
    g.add(tip);
    return g;
  },
  prod: () => {
    const g = new THREE.Group();
    g.add(box(0.09, 0.55, 0.09, 0x2a2a30));
    const spark = box(0.1, 0.12, 0.1, 0x8fd8ff, { emissive: 0x2a9ad8 });
    spark.position.y = -0.34;
    g.add(spark);
    return g;
  },
  pistol: () => {
    const g = new THREE.Group();
    g.add(box(0.09, 0.2, 0.12, 0x1e1e24));
    const barrel = box(0.08, 0.09, 0.34, 0x2a2a30);
    barrel.position.set(0, 0.06, 0.2);
    g.add(barrel);
    return g;
  },
  hotsauce: () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.32, 8), lambert(0xb42a2a, { emissive: 0x3a0808 }));
    g.add(b);
    return g;
  },
  knife: () => {
    const g = new THREE.Group();
    g.add(box(0.05, 0.18, 0.05, 0x2a1a12));
    const blade = box(0.04, 0.34, 0.1, 0xd0d6dc, { emissive: 0x3a4046 });
    blade.position.y = -0.24;
    g.add(blade);
    return g;
  },
  lamp: () => {
    const g = new THREE.Group();
    g.add(box(0.14, 0.42, 0.14, 0x8a7a5a));
    const shadeM = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.34, 10), lambert(0xe8d9a8, { emissive: 0x4a3a10 }));
    shadeM.position.y = -0.3;
    g.add(shadeM);
    return g;
  },
  crowbar: () => {
    const g = new THREE.Group();
    g.add(box(0.07, 0.9, 0.07, 0xb03a2a));
    const claw = box(0.07, 0.16, 0.2, 0xb03a2a);
    claw.position.set(0, -0.5, 0.08);
    g.add(claw);
    return g;
  },
  /* The Silverback Commander.
   *
   * The Family's own sidearm, and it is not subtle: a long slab-sided .45 with
   * a silver slide, chequered walnut grips and the sasquatch crest inlaid on
   * the frame. Everything about it says the man carrying it is somebody's, and
   * that is exactly why Snow keeps one in the glovebox and exactly why firing
   * it in a motel room is a decision rather than a reflex. */
  silverback: () => {
    const g = new THREE.Group();
    g.name = 'silverback-commander';
    const frame = box(0.12, 0.19, 0.24, 0x2b2b33);
    frame.name = 'silverback.frame';
    g.add(frame);
    const slide = box(0.125, 0.13, 0.52, 0xc8ccd4, { emissive: 0x40454c });
    slide.name = 'silverback.slide';
    slide.position.set(0, 0.13, 0.14);
    g.add(slide);
    // The long Commander barrel standing proud of the slide.
    const barrel = box(0.06, 0.06, 0.12, 0x9aa0a8);
    barrel.name = 'silverback.barrel';
    barrel.position.set(0, 0.12, 0.44);
    g.add(barrel);
    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.011, 6, 14),
      lambert(0x1c1c22, { emissive: 0x0a0a0c }),
    );
    muzzle.name = 'silverback.muzzle';
    muzzle.position.set(0, 0.12, 0.50);
    g.add(muzzle);
    const grip = box(0.115, 0.34, 0.17, 0x5a3620);
    grip.name = 'silverback.grip';
    grip.position.set(0, -0.22, -0.03);
    grip.rotation.x = -0.24;
    g.add(grip);
    // The crest. Small, silver, and the whole reason anybody recognises it.
    const crest = box(0.02, 0.1, 0.1, 0xdfe4ea, { emissive: 0x6a7078 });
    crest.name = 'silverback.crest';
    crest.position.set(0.06, -0.16, 0.01);
    crest.rotation.x = -0.24;
    g.add(crest);
    const hammer = box(0.06, 0.09, 0.07, 0x33333b);
    hammer.name = 'silverback.hammer';
    hammer.position.set(0, 0.16, -0.09);
    hammer.rotation.x = -0.3;
    g.add(hammer);
    return g;
  },
  revolver: () => {
    const g = new THREE.Group();
    g.name = 'revolver';
    const frame = box(0.13, 0.2, 0.22, 0x3a3a42);
    frame.name = 'revolver.frame';
    g.add(frame);
    const barrel = box(0.09, 0.1, 0.42, 0x55555f);
    barrel.name = 'revolver.barrel';
    barrel.position.set(0, 0.08, 0.3);
    g.add(barrel);
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.105, 0.18, 12),
      lambert(0x6a6a72, { emissive: 0x18181c }),
    );
    drum.name = 'revolver.cylinder';
    drum.rotation.z = Math.PI / 2;
    drum.position.set(0, 0.04, 0.09);
    g.add(drum);
    const grip = box(0.12, 0.32, 0.16, 0x4b2b1c);
    grip.name = 'revolver.grip';
    grip.position.set(0, -0.23, -0.01);
    grip.rotation.x = -0.22;
    g.add(grip);
    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.045, 0.012, 6, 14),
      lambert(0x24242a, { emissive: 0x0b0b0d }),
    );
    muzzle.name = 'revolver.muzzle';
    muzzle.position.set(0, 0.08, 0.515);
    g.add(muzzle);
    const hammer = box(0.07, 0.09, 0.08, 0x303038);
    hammer.name = 'revolver.hammer';
    hammer.position.set(0, 0.15, -0.05);
    hammer.rotation.x = -0.35;
    g.add(hammer);
    return g;
  },
};

export const WEAPON_STATS = {
  fists:        { name: 'Sasquatch fists', dmg: 26, reach: 3.0, lethal: false, rate: 0.45, improvised: true },
  cleaver:      { name: 'Meat cleaver', dmg: 34, reach: 3.0, lethal: true, rate: 0.55, improvised: false },
  knife:        { name: 'Steak knife', dmg: 24, reach: 2.7, lethal: true, rate: 0.4, improvised: false },
  slicer:       { name: 'Commercial meat slicer', dmg: 44, reach: 2.8, lethal: true, rate: 0.9, improvised: false },
  hook:         { name: 'Sharpened jerky hook', dmg: 30, reach: 3.1, lethal: true, rate: 0.5, improvised: false },
  prod:         { name: 'Stun prod', dmg: 16, reach: 2.8, lethal: false, rate: 0.7, improvised: false, stun: 1.4 },
  hotsauce:     { name: 'Hot sauce bottle', dmg: 12, reach: 2.6, lethal: false, rate: 0.5, improvised: true, blind: 2.2 },
  lamp:         { name: 'Bedside lamp', dmg: 28, reach: 3.0, lethal: false, rate: 0.55, improvised: true },
  crowbar:      { name: 'Trunk crowbar', dmg: 38, reach: 3.3, lethal: false, rate: 0.5, improvised: true },
  thermometer:  { name: 'Meat thermometer', dmg: 14, reach: 2.6, lethal: false, rate: 0.4, improvised: true },
  pistol:       { name: 'Pistol', dmg: 30, reach: 26, lethal: true, rate: 1.5, ranged: true },
  revolver:     { name: 'Compact revolver', dmg: 45, reach: 30, lethal: true, rate: 0.9, ranged: true, ammo: 6 },
  handcannon:   { name: 'Sasquatch hand cannon', dmg: 90, reach: 34, lethal: true, rate: 1.3, ranged: true, ammo: 4 },
  /* Seven rounds, one man each, and every one of them audible from the road.
   * It out-damages the compact revolver and comes up faster than anything else
   * in this room, which is the whole appeal and the whole problem: the fast way
   * out of room twelve is also the loudest, and `loud` is what makes the police
   * heat land harder than any blade in this table. */
  silverback:   {
    name: 'Silverback Commander', dmg: 62, reach: 30, lethal: true, rate: 1.8,
    ranged: true, ammo: 7, loud: true, family: true,
  },
};

export function buildWeaponMesh(kind) {
  const b = WEAPON_BUILDERS[kind] || WEAPON_BUILDERS.knife;
  return b();
}

// ---------------- Actor ----------------

let nextId = 1;

export class Actor {
  constructor(scene, cfg) {
    this.id = nextId++;
    this.scene = scene;
    this.name = cfg.name || 'Seller';
    this.role = cfg.role || 'thug';
    this.identity = cfg.identity || this.name.toLowerCase().replace(/\s+/g, '_');
    this.faction = cfg.faction
      || (this.role === 'ally' ? 'friendly' : this.role === 'civilian' ? 'civilian' : 'seller');
    this.rig = buildActor(cfg);
    this.group = this.rig.group;
    this.group.position.set(cfg.x || 0, 0, cfg.z || 0);
    this.heading = cfg.heading ?? 0;
    /* The pose the scene authored, kept apart from `heading` so that idling —
     * which sways — always sways around the direction the scene meant, and
     * never drifts off to a compass point of its own. */
    this.idleHeading = this.heading;
    this.group.rotation.y = this.heading;
    scene.add(this.group);

    this.hp = cfg.hp ?? 100;
    this.maxHp = this.hp;
    this.speed = cfg.speed ?? 5.2;
    this.state = cfg.state || 'idle';
    this.weapon = cfg.weapon || null;
    this.weaponMesh = null;
    if (this.weapon) this.equip(this.weapon);
    this.attackCd = 0.6 + Math.random() * 0.6;
    this.walkT = Math.random() * 10;
    this.downT = -1;
    this.stunT = 0;
    this.blindT = 0;
    this.hitFlash = 0;
    this.target = null;         // {x,z} to walk to
    this.anchor = { x: this.group.position.x, z: this.group.position.z };
    this.carryingCase = false;
    this.grappleT = 0;
    this.talkT = 0;
    /* The mouth, driven by the voice rather than by a clock -- one shared
     * implementation for the whole game (src/core/mouth.js). `openScale`
     * reproduces the old `1.35 + |sin| * 1.1` opening from a rest of 1, so
     * nobody's face changes shape; only what decides WHEN it opens has moved.
     * Photographed faces (the Family) get no mouth mesh at all in this
     * builder -- `mouth` stays null -- and `Mouth` is built for that: it still
     * produces an envelope, and there is simply nothing to move, because a
     * photograph cannot open its mouth. */
    this.voiceMouth = new Mouth({ mouth: this.rig.mouth }, { openScale: 1.45 });
    this.barkCd = 2 + Math.random() * 4;
    this._hostile = false;
    Object.defineProperty(this, 'hostile', {
      enumerable: true,
      configurable: false,
      get: () => this._hostile,
      set: (value) => {
        this._hostile = this.faction === 'friendly' ? false : Boolean(value);
      },
    });
    this.hostile = false;
    this.gestureT = 0;
    this.y = 0;
    this.escaped = false;
    this.lethalKill = false;
    this.stuckT = 0;
    this.lastX = this.group.position.x;
    this.lastZ = this.group.position.z;
  }

  get position() { return this.group.position; }
  get alive() { return this.downT < 0; }

  equip(kind) {
    if (this.weaponMesh) {
      this.weaponMesh.parent?.remove(this.weaponMesh);
      this.weaponMesh = null;
    }
    this.weapon = kind;
    if (!kind) return;
    const m = buildWeaponMesh(kind);
    const hand = this.rig.armR.userData.hand;
    if (hand) {
      // In the fist, not hovering a hand-width under it.
      m.position.set(0, -0.06, 0.1);
      if (this.rig.species === 'human') m.scale.setScalar(0.85);
      hand.add(m);
    } else {
      const handY = this.rig.handY ?? -1.75;
      m.position.set(0, handY - 0.12, 0.1);
      if (this.rig.species === 'human') m.scale.setScalar(0.85);
      this.rig.armR.add(m);
    }
    this.weaponMesh = m;
  }

  stats() {
    return WEAPON_STATS[this.weapon] || WEAPON_STATS.fists;
  }

  /** Turn toward an absolute yaw. 0 is +z, which is the way every rig faces. */
  turnTo(target, dt, rate = 9) {
    const diff = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
    this.heading += diff * Math.min(1, rate * dt);
    this.group.rotation.y = this.heading;
  }

  faceTo(x, z, dt, rate = 9) {
    this.turnTo(Math.atan2(x - this.group.position.x, z - this.group.position.z), dt, rate);
  }

  /** Pose him now, and remember it as the direction idling returns to. */
  setFacing(heading) {
    this.heading = heading;
    this.idleHeading = heading;
    this.group.rotation.y = heading;
    return this;
  }

  /** Same, expressed as somewhere to look. */
  faceAt(x, z) {
    return this.setFacing(
      Math.atan2(x - this.group.position.x, z - this.group.position.z),
    );
  }

  // Returns true if the actor goes down from this hit.
  damage(amount, lethal, fromX = 0, fromZ = 0) {
    if (this.downT >= 0) return false;
    this.hp -= amount;
    this.hitFlash = 0.18;
    // knocked back a little
    const dx = this.group.position.x - fromX;
    const dz = this.group.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.group.position.x += (dx / d) * 0.35;
    this.group.position.z += (dz / d) * 0.35;
    if (this.hp <= 0) {
      this.hp = 0;
      this.downT = 0;
      this.lethalKill = !!lethal;
      return true;
    }
    return false;
  }

  /**
   * Say something: the gesture holds for `seconds` and the mouth runs on the
   * take.
   *
   * @param {number} seconds how long the subtitle is up — and, with no
   *   recording, how long the mouth keeps working.
   * @param {object} [take] `{ source, analyser }` from `voiceTap()` in
   *   src/motel/audio.js, so the mouth is driven by the sound.
   */
  say(seconds = 1.6, take = null) {
    this.talkT = seconds;
    this.voiceMouth.speak({ seconds, ...(take || {}) });
    return this;
  }

  /** Cut the line: the mouth shuts whatever the subtitle is still doing. */
  hush() {
    this.talkT = 0;
    this.voiceMouth.stop();
    return this;
  }

  update(dt, ctx) {
    const p = this.group.position;

    if (this.downT >= 0) {
      this.downT += dt;
      // fall over, then lie still
      const k = Math.min(1, this.downT / 0.5);
      this.group.rotation.x = k * (Math.PI / 2 - 0.1);
      p.y = ctx.floorAt(p.x, p.z, p.y) + k * 0.25;
      return;
    }

    this.stunT = Math.max(0, this.stunT - dt);
    this.blindT = Math.max(0, this.blindT - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.gestureT = Math.max(0, this.gestureT - dt);
    this.talkT = Math.max(0, this.talkT - dt);

    let moving = false;
    let speed = this.speed;
    const px = ctx.player.x;
    const pz = ctx.player.z;
    const distToPlayer = Math.hypot(p.x - px, p.z - pz);

    if (this.stunT > 0) {
      // shaking it off
      this.group.rotation.z = Math.sin(this.stunT * 40) * 0.12;
    } else {
      this.group.rotation.z = 0;

      switch (this.state) {
        case 'idle':
          /* Sway around the authored facing.
           *
           * This used to aim at `anchor.x + sin(t)`, `anchor.z` — a point one
           * metre due east of the actor's own anchor. Every idle actor in the
           * lot therefore turned to face +x within a second or two, whatever
           * pose the scene had given them, and the lookout ended up watching
           * the ice machine instead of the road. */
          this.turnTo(this.idleHeading + Math.sin(this.walkT * 0.2) * 0.12, dt, 2);
          break;

        case 'deal': // standing in the room, working the conversation
          this.faceTo(px, pz, dt, 4);
          break;

        case 'guard': { // hold a spot, drift back to it
          const d = Math.hypot(p.x - this.anchor.x, p.z - this.anchor.z);
          if (d > 0.6) {
            moving = this.moveToward(this.anchor.x, this.anchor.z, dt, speed * 0.6, ctx);
          } else {
            this.faceTo(px, pz, dt, 4);
          }
          break;
        }

        case 'chase': {
          // Attack-capable chase is structurally hostile-only. This protects
          // every friendly actor even if a scripted waypoint regresses.
          if (this.faction === 'friendly' || !this.hostile) {
            this.state = 'idle';
            break;
          }
          const reach = this.stats().reach;
          if (this.stats().ranged) {
            // Keep a firing lane
            if (distToPlayer > 12) moving = this.moveToward(px, pz, dt, speed, ctx);
            else if (distToPlayer < 5) moving = this.moveAway(px, pz, dt, speed * 0.8, ctx);
            else this.faceTo(px, pz, dt);
            if (this.attackCd <= 0 && distToPlayer < reach && this.blindT <= 0) {
              this.attackCd = this.stats().rate + Math.random() * 0.6;
              ctx.onRangedAttack?.(this);
            }
          } else if (distToPlayer > reach - 0.4) {
            moving = this.moveToward(px, pz, dt, speed, ctx);
          } else {
            this.faceTo(px, pz, dt);
            if (this.attackCd <= 0 && this.blindT <= 0) {
              this.attackCd = this.stats().rate + 0.35 + Math.random() * 0.4;
              this.gestureT = 0.3;
              ctx.onMeleeAttack?.(this);
            }
          }
          break;
        }

        case 'grab': // trying to restrain Prospect
          if (this.faction === 'friendly' || !this.hostile) {
            this.state = 'idle';
            break;
          }
          if (distToPlayer > 2.0) {
            moving = this.moveToward(px, pz, dt, speed * 1.15, ctx);
          } else {
            this.faceTo(px, pz, dt);
            if (this.attackCd <= 0) {
              this.attackCd = 3.0;
              ctx.onGrabAttempt?.(this);
            }
          }
          break;

        case 'goto':
          if (this.target) {
            moving = this.moveToward(this.target.x, this.target.z, dt, speed, ctx);
            if (Math.hypot(p.x - this.target.x, p.z - this.target.z) < 1.0) {
              this.state = this.afterGoto || 'idle';
              ctx.onReachedTarget?.(this);
            }
          }
          break;

        case 'flee':
          if (this.target) {
            moving = this.moveToward(this.target.x, this.target.z, dt, speed * 1.25, ctx);
            if (Math.hypot(p.x - this.target.x, p.z - this.target.z) < 1.4) {
              ctx.onReachedTarget?.(this);
            }
          } else {
            moving = this.moveAway(px, pz, dt, speed * 1.2, ctx);
          }
          break;

        case 'follow': { // Snow, once he is out of the car
          if (this.faction !== 'friendly') {
            this.state = 'idle';
            break;
          }
          const d = Math.hypot(p.x - px, p.z - pz);
          if (d > 4.5) moving = this.moveToward(px, pz, dt, speed, ctx);
          else this.faceTo(px, pz, dt, 5);
          if (this.attackCd <= 0) {
            const foe = ctx.nearestHostile?.(p.x, p.z, 5.5);
            if (foe) {
              this.attackCd = 1.0;
              this.gestureT = 0.3;
              ctx.onAllyAttack?.(this, foe);
            }
          }
          break;
        }

        case 'panic':
          moving = this.moveAway(px, pz, dt, speed * 1.3, ctx);
          break;

        default:
          break;
      }
    }

    // Somebody running for a door they cannot reach should not run at it
    // forever — give up after a few seconds and let the scene move on. A
    // chaser wedged on geometry counts too, but standing at arm's length from
    // the player is fighting, not stuck.
    const chaseStuck = (this.state === 'chase' || this.state === 'grab') && distToPlayer > 2.6;
    if (this.state === 'flee' || this.state === 'goto' || chaseStuck) {
      const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
      this.stuckT = moved < 0.02 ? this.stuckT + dt : 0;
      if (this.stuckT > 3.5) {
        this.stuckT = 0;
        ctx.onStuck?.(this);
      }
    } else {
      this.stuckT = 0;
    }
    this.lastX = p.x;
    this.lastZ = p.z;

    // Gravity / floor snapping
    const floor = ctx.floorAt(p.x, p.z, p.y);
    if (p.y > floor + 0.02) {
      this.y = Math.max(floor, p.y - 14 * dt);
      p.y = this.y;
    } else {
      p.y = floor;
    }

    // Animation
    if (moving) this.walkT += dt * 9;
    const gait = Math.sin(this.walkT) * (moving ? 0.8 : 0.12);
    this.rig.legL.rotation.x = gait;
    this.rig.legR.rotation.x = -gait;
    if (this.gestureT > 0) {
      const k = 1 - this.gestureT / 0.3;
      this.rig.armR.rotation.x = -2.2 + k * 3.0;
      this.rig.armL.rotation.x = -0.4;
    } else if (this.state === 'deal' && this.talkT > 0) {
      this.rig.armR.rotation.x = -0.5 + Math.sin(this.walkT * 6) * 0.35;
      this.rig.armL.rotation.x = -0.2 + Math.sin(this.walkT * 5 + 1) * 0.2;
      this.walkT += dt * 3;
    } else {
      this.rig.armL.rotation.x = gait * 0.7;
      this.rig.armR.rotation.x = -gait * 0.7;
    }
    this.rig.body.position.y = moving ? Math.abs(Math.sin(this.walkT)) * 0.06 : 0;
    /* The mouth. It used to be `1.35 + |sin((walk + talk) * 11)| * 1.1` for
     * however many seconds the subtitle was up -- a fixed flap, on a clock,
     * with no syllables in it. It runs on the take now. */
    this.voiceMouth.update(dt);

    // Hit flash
    if (this.hitFlash > 0) {
      this.group.scale.setScalar(1 + this.hitFlash * 0.35);
    } else if (this.group.scale.x !== 1) {
      this.group.scale.setScalar(1);
    }
  }

  moveToward(tx, tz, dt, speed, ctx) {
    const p = this.group.position;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return false;
    this.faceTo(tx, tz, dt);
    const step = Math.min(speed * dt, d);
    const nx = p.x + (dx / d) * step;
    const nz = p.z + (dz / d) * step;
    this.applyMove(nx, nz, ctx);
    return true;
  }

  moveAway(tx, tz, dt, speed, ctx) {
    const p = this.group.position;
    const dx = p.x - tx;
    const dz = p.z - tz;
    const d = Math.hypot(dx, dz) || 1;
    const nx = p.x + (dx / d) * speed * dt;
    const nz = p.z + (dz / d) * speed * dt;
    this.faceTo(nx, nz, dt);
    this.applyMove(nx, nz, ctx);
    return true;
  }

  // Slide along blockers rather than sticking to them.
  applyMove(nx, nz, ctx) {
    const p = this.group.position;
    const r = this.rig.radius ?? 0.55;
    if (!ctx.blocked(nx, p.z, p.y, r)) p.x = nx;
    if (!ctx.blocked(p.x, nz, p.y, r)) p.z = nz;
  }

  remove() {
    this.scene.remove(this.group);
  }
}

// ---------------- Cast presets ----------------

// Snow is Tony's human ally. Everyone selling meat is human too; costume,
// silhouette, faction, and role distinguish them without changing species.
export const CAST = {
  /* Snow of the Family drives tonight. The photo carries the likeness, so no
   * procedural moustache or cap goes on top of his own face. */
  snow: () => ({
    identity: 'snow', name: 'Snow', role: 'ally', faction: 'friendly', species: 'human',
    face: 'assets/faces/snow.png',
    skin: SKIN_TONES[2], hair: 0x24170f,
    shirt: 0x315f78, pants: 0x27313d, shoes: 0x17191e,
    hp: 160, speed: 5.4, scale: 1.08,
  }),
  rico: () => ({
    identity: 'rico', name: 'Rico', role: 'seller', skin: SKIN_TONES[1], hair: 0x1d140e,
    shirt: 0xe8dcc0, pants: 0xe8e4d8, shoes: 0xf0ece0,   // suspiciously clean shoes
    tropical: 0xd94f8a, shades: true, mustache: true, chain: true,
    hp: 95, speed: 5.4, weapon: 'thermometer', scale: 1.02,
  }),
  chino: () => ({
    name: 'Chino', role: 'seller', skin: SKIN_TONES[2], hair: 0x141014,
    shirt: 0xe8e4d8, pants: 0x3a3a42, sleeveless: true,
    apron: true, gloves: true, hp: 115, speed: 5.0, weapon: 'cleaver', scale: 1.06,
  }),
  slicer: () => ({
    name: 'Bathroom Seller', role: 'seller', skin: SKIN_TONES[0], hair: 0x2a1e14,
    shirt: 0x4a4a52, pants: 0x2a2a30,
    gloves: true, hp: 130, speed: 4.8, weapon: 'slicer', scale: 1.12,
  }),
  lookout: () => ({
    name: 'Lookout', role: 'seller', skin: SKIN_TONES[3], hair: 0x6a4a22,
    shirt: 0x6a3a3a, pants: 0x2f2f36,
    hp: 70, speed: 5.6, weapon: 'knife', scale: 0.96,
  }),
  watcher: () => ({
    name: 'Watcher', role: 'seller', skin: SKIN_TONES[4], hair: 0x120e0a,
    shirt: 0x3a4a3a, pants: 0x2a2a30,
    hp: 75, speed: 5.4, weapon: 'hook', scale: 1.0,
  }),
  clerk: () => ({
    name: 'Clerk', role: 'civilian', skin: SKIN_TONES[0], hair: 0x8a7a55,
    shirt: 0x8a8ad0, pants: 0x3a3a48, cap: 0x4a4a66,
    hp: 45, speed: 5.0, scale: 0.95,
  }),
  thug: (weapon) => ({
    name: 'Seller', role: 'seller',
    skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
    hair: [0x1d140e, 0x3a2a18, 0x6a4a22, 0x121212][Math.floor(Math.random() * 4)],
    shirt: [0x5a4a5a, 0x3a5a6a, 0x6a5a3a, 0x4a3a3a][Math.floor(Math.random() * 4)],
    pants: 0x2a2a30, hp: 85, speed: 5.4, weapon, scale: 0.96 + Math.random() * 0.12,
  }),
};
