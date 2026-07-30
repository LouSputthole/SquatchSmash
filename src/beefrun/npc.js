/**
 * The people on the ground, and the animals that will not get off the runway.
 *
 * One blocky figure rig serves everybody: Lou, Cecilio, the four men at El
 * Hueso, and the Squatch associates who come out of the dark at the end. They
 * differ by palette, hat, and what they are doing with their hands. Nobody
 * here needs a skeleton — they need to lean on a wing, hold a strip of jerky
 * up to the light, and look at the player when he says something stupid.
 */
import * as THREE from 'three';
import {
  solid, boxGeo, cylGeo, coneGeo, sphereGeo, mesh, group, clamp, lerp, damp,
} from './util.js';

const SKIN = [0xd9a878, 0xb07a4e, 0x8a5a38, 0xe8c49a];

/**
 * @param {object} o
 *   colours: { shirt, trousers, boots, skin, hat, jacket }
 *   build:   0..1 (0 = narrow, 1 = wide)
 */
export function makeFigure(o = {}) {
  const skin = solid(o.skin ?? SKIN[0], { roughness: 1 });
  const shirt = solid(o.shirt ?? 0x8a8f7a, { roughness: 1 });
  const trousers = solid(o.trousers ?? 0x4a4a52, { roughness: 1 });
  const boots = solid(o.boots ?? 0x33291f, { roughness: 0.9 });
  const w = 0.42 + (o.build ?? 0.4) * 0.16;

  const g = group(o.name || 'figure');
  const hips = new THREE.Group();
  hips.position.y = 0.86;
  g.add(hips);

  const torso = mesh(boxGeo(w, 0.62, 0.28), o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt, 0, 0.31, 0);
  hips.add(torso);
  if (o.jacket) {
    // Collar and open front, so the stained shirt shows.
    hips.add(mesh(boxGeo(w * 0.42, 0.5, 0.06), shirt, 0, 0.32, 0.15));
  }

  const neck = new THREE.Group();
  neck.position.set(0, 0.66, 0);
  hips.add(neck);
  const head = mesh(boxGeo(0.24, 0.28, 0.24), skin, 0, 0.14, 0);
  neck.add(head);
  if (o.hair !== false) neck.add(mesh(boxGeo(0.25, 0.08, 0.25), solid(o.hair ?? 0x3a2c20, { roughness: 1 }), 0, 0.27, 0));
  if (o.shades) {
    neck.add(mesh(boxGeo(0.22, 0.06, 0.03), solid(0x14161a, { roughness: 0.3, metalness: 0.4 }), 0, 0.16, 0.13));
  }
  if (o.hat === 'cowboy') {
    neck.add(mesh(cylGeo(0.13, 0.15, 0.16, 10), solid(0x6b5432, { roughness: 1 }), 0, 0.34, 0));
    neck.add(mesh(cylGeo(0.34, 0.34, 0.03, 12), solid(0x6b5432, { roughness: 1 }), 0, 0.27, 0));
  } else if (o.hat === 'cap') {
    neck.add(mesh(boxGeo(0.26, 0.1, 0.26), solid(o.hatColor ?? 0x4a2f8f, { roughness: 1 }), 0, 0.31, 0));
    neck.add(mesh(boxGeo(0.24, 0.03, 0.14), solid(o.hatColor ?? 0x4a2f8f, { roughness: 1 }), 0, 0.27, 0.18));
  } else if (o.hat === 'headset') {
    // Hanging round the neck, which is where Lou's lives.
    neck.add(mesh(cylGeo(0.07, 0.07, 0.05, 8), solid(0x24262a, { roughness: 0.8 }), -0.13, 0.0, 0));
    neck.add(mesh(cylGeo(0.07, 0.07, 0.05, 8), solid(0x24262a, { roughness: 0.8 }), 0.13, 0.0, 0));
    neck.add(mesh(boxGeo(0.28, 0.04, 0.04), solid(0x24262a, { roughness: 0.8 }), 0, -0.02, -0.08));
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * (w / 2 + 0.06), 0.56, 0);
    const upper = mesh(boxGeo(0.12, 0.3, 0.14), o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt, 0, -0.15, 0);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = mesh(boxGeo(0.11, 0.28, 0.12), o.sleeves === false ? skin : (o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt), 0, -0.14, 0);
    elbow.add(fore);
    const hand = mesh(boxGeo(0.11, 0.12, 0.11), skin, 0, -0.32, 0);
    elbow.add(hand);
    shoulder.add(elbow);
    hips.add(shoulder);
    arms.push({ shoulder, elbow, hand });
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0, 0);
    const thigh = mesh(boxGeo(0.16, 0.44, 0.18), trousers, 0, -0.22, 0);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    knee.add(mesh(boxGeo(0.14, 0.4, 0.16), trousers, 0, -0.2, 0));
    knee.add(mesh(boxGeo(0.16, 0.12, 0.26), boots, 0, -0.44, 0.04));
    hip.add(knee);
    hips.add(hip);
    legs.push({ hip, knee });
  }

  return {
    group: g, hips, neck, head, arms, legs,
    pose: 'idle',
    t: Math.random() * 10,
    talk: 0,
    lookAt: null,
    sick: 0,        // Lou only: how bad it is right now
    _breath: 0,
  };
}

/** Put a figure into one of a handful of hand-authored poses. */
export function setPose(f, pose) {
  f.pose = pose;
  const [L, R] = f.arms;
  const reset = () => {
    for (const a of f.arms) { a.shoulder.rotation.set(0, 0, 0); a.elbow.rotation.set(0, 0, 0); }
    for (const l of f.legs) { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }
    f.hips.position.y = 0.86;
    f.hips.rotation.set(0, 0, 0);
  };
  reset();
  switch (pose) {
    case 'lean':                      // against the wing, one elbow up
      f.hips.rotation.z = 0.1;
      R.shoulder.rotation.x = -1.5;
      R.shoulder.rotation.z = -0.35;
      R.elbow.rotation.x = -0.5;
      L.shoulder.rotation.z = 0.18;
      f.legs[1].hip.rotation.x = 0.12;
      break;
    case 'gut':                       // hand pressed to the stomach
      f.hips.rotation.x = 0.16;
      L.shoulder.rotation.x = -1.2;
      L.elbow.rotation.x = -1.5;
      R.shoulder.rotation.x = -0.2;
      break;
    case 'sit':
      f.hips.position.y = 0.52;
      for (const l of f.legs) { l.hip.rotation.x = -1.45; l.knee.rotation.x = 1.4; }
      for (const a of f.arms) { a.shoulder.rotation.x = -0.35; a.elbow.rotation.x = -0.7; }
      break;
    case 'carry':                     // both arms out, holding a crate
      for (const a of f.arms) { a.shoulder.rotation.x = -1.3; a.elbow.rotation.x = -0.35; }
      break;
    case 'inspect':                   // holding something up to the light
      R.shoulder.rotation.x = -2.1;
      R.shoulder.rotation.z = -0.3;
      R.elbow.rotation.x = -0.4;
      L.shoulder.rotation.x = -0.3;
      break;
    case 'point':
      R.shoulder.rotation.x = -1.6;
      R.elbow.rotation.x = -0.1;
      break;
    case 'guard':                     // rifle held across, muzzle down
      L.shoulder.rotation.x = -1.05;
      L.elbow.rotation.x = -0.8;
      R.shoulder.rotation.x = -0.6;
      R.elbow.rotation.x = -1.2;
      break;
    case 'idle':
    default:
      L.shoulder.rotation.x = 0.06;
      R.shoulder.rotation.x = -0.06;
      break;
  }
}

/** Idle life: breathing, talking, the odd cough, and looking where told. */
export function updateFigure(f, dt, camPos = null) {
  f.t += dt;
  f._breath = Math.sin(f.t * 1.6) * 0.012;
  f.hips.position.y = (f.pose === 'sit' ? 0.52 : 0.86) + f._breath;

  if (f.talk > 0) {
    f.talk -= dt;
    f.neck.rotation.x = Math.sin(f.t * 13) * 0.045 - 0.02;
  } else {
    f.neck.rotation.x = damp(f.neck.rotation.x, 0, 6, dt);
  }

  if (f.sick > 0) {
    // Weight shifting, a hand toward the stomach, and a slow forward lean.
    f.hips.rotation.x = damp(f.hips.rotation.x, 0.06 + f.sick * 0.2, 2, dt);
    f.hips.rotation.z = Math.sin(f.t * 0.7) * 0.05 * f.sick;
  }

  const target = f.lookAt || camPos;
  if (target && f.pose !== 'sit') {
    const dx = target.x - f.group.position.x;
    const dz = target.z - f.group.position.z;
    const want = Math.atan2(dx, dz) - f.group.rotation.y;
    const clamped = clamp(((want + Math.PI) % (Math.PI * 2)) - Math.PI, -1.1, 1.1);
    f.neck.rotation.y = damp(f.neck.rotation.y, clamped, 4, dt);
  }
}

/** Make a figure say something: the head bobs for `seconds`. */
export function speak(f, seconds = 1.6) {
  if (f) f.talk = seconds;
}

/* ------------------------------------------------------------------ */
/* The cast                                                            */
/* ------------------------------------------------------------------ */

export function makeLou() {
  const f = makeFigure({
    name: 'captain_lou_sasole',
    skin: 0xd8b48c,          // pale, and getting paler
    shirt: 0xd8d2c0,
    jacket: 0x5a3a22,        // old leather flight jacket
    trousers: 0xa89878,      // wrinkled khaki
    boots: 0x4a3320,
    hair: 0x4a4038,
    shades: true,
    hat: 'headset',
    build: 0.55,
  });
  setPose(f, 'lean');
  // The cup. It goes where he goes until he gets in the aeroplane.
  const cup = mesh(cylGeo(0.045, 0.04, 0.11, 10), solid(0xe8e2d4, { roughness: 0.8 }), 0, -0.4, 0.06);
  f.arms[0].elbow.add(cup);
  f.cup = cup;
  return f;
}

/**
 * CIA Stove. "Old Stove" to the family, and nothing at all to his employer.
 *
 * Built from the reference photographs: slim, cropped hair, a close beard, dark
 * wayfarers, a plain dark tee, khakis and tan boots — and, because he never
 * turns up anywhere without them, a red parachute rig over his shoulders and a
 * green headset round his neck. He is a pilot first and an Agency employee
 * second, and he dresses like the first one.
 */
export function makeOldStove() {
  const f = makeFigure({
    name: 'stove',
    skin: 0xd8b48c,
    shirt: 0x4a5260,          // dark grey-blue tee
    trousers: 0xbfa878,       // khakis
    boots: 0x8a7a52,          // tan boots
    hair: 0x6b5340,           // cropped, and going
    shades: true,
    build: 0.36,              // narrow
  });
  setPose(f, 'idle');

  // Close beard, on the jaw rather than off it.
  const beard = mesh(boxGeo(0.2, 0.11, 0.2), solid(0x6b5340, { roughness: 1 }), 0, 0.05, 0.02);
  f.neck.add(beard);

  // Headset round the neck: green cups, exactly where Lou's black ones sit.
  const cupMat = solid(0x5f6b3a, { roughness: 0.8 });
  for (const sx of [-0.14, 0.14]) {
    f.neck.add(mesh(cylGeo(0.075, 0.075, 0.055, 8), cupMat, sx, -0.02, 0));
  }
  f.neck.add(mesh(boxGeo(0.3, 0.04, 0.04), solid(0x2a2a2e, { roughness: 0.8 }), 0, -0.04, -0.09));
  // The boom mic, folded up and forgotten.
  const boom = mesh(boxGeo(0.035, 0.035, 0.17), solid(0x1e1e22, { roughness: 0.8 }), 0.13, 0.02, 0.09);
  boom.rotation.x = -0.5;
  f.neck.add(boom);

  /* The parachute rig. Two red webbing straps over the shoulders into a chest
   * strap, leg loops, and steel hardware — the detail that makes him read as a
   * man who flies rather than a man in a windbreaker. */
  const webbing = solid(0xa8232a, { roughness: 0.95 });
  const steel = solid(0xc8ccd2, { roughness: 0.35, metalness: 0.8 });
  for (const sx of [-1, 1]) {
    const strap = mesh(boxGeo(0.085, 0.62, 0.055), webbing, sx * 0.13, 0.31, 0.15);
    strap.rotation.z = sx * 0.12;
    f.hips.add(strap);
    // Back half of the same strap.
    const back = mesh(boxGeo(0.085, 0.6, 0.055), webbing, sx * 0.15, 0.31, -0.15);
    back.rotation.z = sx * 0.14;
    f.hips.add(back);
    // Leg loop.
    const loop = mesh(boxGeo(0.075, 0.24, 0.05), webbing, sx * 0.14, 0.02, 0.1);
    loop.rotation.x = 0.5;
    f.hips.add(loop);
    // Buckle.
    f.hips.add(mesh(boxGeo(0.075, 0.075, 0.03), steel, sx * 0.13, 0.16, 0.18));
  }
  // Chest strap across the two risers.
  f.hips.add(mesh(boxGeo(0.34, 0.07, 0.05), webbing, 0, 0.44, 0.16));
  // The pack itself, on his back.
  f.hips.add(mesh(boxGeo(0.34, 0.44, 0.14), solid(0x8a1f26, { roughness: 0.95 }), 0, 0.3, -0.2));

  // A folder he never opens, held against his leg.
  const folder = mesh(boxGeo(0.24, 0.32, 0.03), solid(0xc9b78d, { roughness: 0.9 }), 0, -0.34, 0.07);
  f.arms[1].elbow.add(folder);
  f.folder = folder;
  return f;
}

export function makeCecilio() {
  const f = makeFigure({
    name: 'cecilio',
    skin: 0xb07a4e,
    shirt: 0xe8e2d0,
    trousers: 0x2e2e34,
    boots: 0x3a2a1a,
    hat: 'cowboy',
    build: 0.7,
  });
  setPose(f, 'inspect');
  // The watch. It cost more than the aeroplane.
  f.arms[1].elbow.add(mesh(boxGeo(0.09, 0.04, 0.09), solid(0xe8c04a, { roughness: 0.25, metalness: 0.9 }), 0, -0.24, 0.04));
  return f;
}

export function makeGuard(i) {
  const kit = [
    { shirt: 0x6b7a4a, trousers: 0x4a4a3a, hat: 'cap', hatColor: 0x3a4a2a },
    { shirt: 0xc9b78d, trousers: 0x5a4a34, hat: 'cowboy' },
    { shirt: 0x4a5a6a, trousers: 0x2e3a2e, hat: 'cap', hatColor: 0x2a2a2a },
    { shirt: 0x8a4a3a, trousers: 0x3a3a42, hat: null },
  ][i % 4];
  const f = makeFigure({ name: `guard${i}`, skin: SKIN[(i + 1) % SKIN.length], build: 0.45 + (i % 3) * 0.1, ...kit });
  setPose(f, i % 2 ? 'guard' : 'idle');
  if (i % 2) {
    // Something long held across the chest. Never raised, never used.
    const rifle = mesh(boxGeo(0.06, 0.06, 0.9), solid(0x2a2620, { roughness: 0.8 }), 0.1, -0.3, 0.12);
    rifle.rotation.x = 0.5;
    f.arms[0].elbow.add(rifle);
  }
  return f;
}

export function makeAssociate(i) {
  const f = makeFigure({
    name: `associate${i}`,
    skin: SKIN[i % SKIN.length],
    shirt: 0x2a2a30,
    jacket: i % 2 ? 0x3a2f5f : null,
    trousers: 0x22222a,
    boots: 0x1a1a1a,
    hat: i % 2 ? 'cap' : null,
    hatColor: 0x4a2f8f,
    build: 0.6,
  });
  setPose(f, 'idle');
  return f;
}

/* ------------------------------------------------------------------ */
/* Livestock                                                           */
/* ------------------------------------------------------------------ */

/** A chicken. Wanders, panics in prop wash, and is never quite off the strip. */
export function makeChicken(x, z) {
  const g = group('chicken');
  const body = mesh(sphereGeo(0.16, 8, 6), solid(0xe8e2d4, { roughness: 1 }), 0, 0.24, 0);
  body.scale.set(1, 0.85, 1.25);
  g.add(body);
  const head = mesh(sphereGeo(0.08, 8, 6), solid(0xe8e2d4, { roughness: 1 }), 0, 0.42, 0.14);
  g.add(head);
  g.add(mesh(coneGeo(0.03, 0.07, 5), solid(0xe8a23a, { roughness: 0.9 }), 0, 0.42, 0.24));
  g.add(mesh(boxGeo(0.04, 0.07, 0.03), solid(0xd92e2e, { roughness: 0.9 }), 0, 0.49, 0.14));
  for (const sx of [-0.05, 0.05]) {
    g.add(mesh(cylGeo(0.012, 0.012, 0.16, 5), solid(0xe8a23a, { roughness: 0.9 }), sx, 0.08, 0));
  }
  g.position.set(x, 0, z);
  return {
    group: g, head,
    home: new THREE.Vector2(x, z),
    vel: new THREE.Vector2(),
    panic: 0,
    t: Math.random() * 10,
  };
}

export function updateChicken(c, dt, groundY, threat = null) {
  c.t += dt;
  if (threat) {
    const dx = c.group.position.x - threat.x;
    const dz = c.group.position.z - threat.z;
    const d = Math.hypot(dx, dz);
    if (d < 22) {
      c.panic = 1;
      const k = (22 - d) / 22;
      c.vel.x += (dx / (d || 1)) * k * 28 * dt;
      c.vel.y += (dz / (d || 1)) * k * 28 * dt;
    }
  }
  c.panic = Math.max(0, c.panic - dt * 0.5);
  if (c.panic < 0.05) {
    // Back toward home, pecking.
    const toHomeX = c.home.x - c.group.position.x;
    const toHomeZ = c.home.y - c.group.position.z;
    c.vel.x = damp(c.vel.x, toHomeX * 0.4 + Math.sin(c.t * 0.8) * 0.3, 2, dt);
    c.vel.y = damp(c.vel.y, toHomeZ * 0.4 + Math.cos(c.t * 0.7) * 0.3, 2, dt);
  }
  c.vel.multiplyScalar(Math.exp(-2.2 * dt));
  c.group.position.x += c.vel.x * dt;
  c.group.position.z += c.vel.y * dt;
  c.group.position.y = groundY;
  const speed = c.vel.length();
  if (speed > 0.2) c.group.rotation.y = Math.atan2(c.vel.x, c.vel.y);
  c.group.position.y += Math.abs(Math.sin(c.t * (6 + speed * 4))) * 0.03 * Math.min(1, speed);
  c.head.position.y = 0.42 - (speed < 0.3 ? Math.max(0, Math.sin(c.t * 2)) * 0.18 : 0);
}

/** The dog. Sleeps by the fuel pump; later, takes an interest in the cargo. */
export function makeDog(x, z) {
  const g = group('dog');
  const fur = solid(0x8a6a42, { roughness: 1 });
  const body = mesh(boxGeo(0.3, 0.3, 0.8), fur, 0, 0.3, 0);
  g.add(body);
  const head = mesh(boxGeo(0.24, 0.24, 0.28), fur, 0, 0.38, 0.5);
  g.add(head);
  g.add(mesh(boxGeo(0.1, 0.14, 0.06), fur, -0.08, 0.52, 0.46));
  g.add(mesh(boxGeo(0.1, 0.14, 0.06), fur, 0.08, 0.52, 0.46));
  g.add(mesh(boxGeo(0.12, 0.1, 0.16), solid(0x3a2c20, { roughness: 1 }), 0, 0.34, 0.64));
  const tail = mesh(boxGeo(0.07, 0.07, 0.34), fur, 0, 0.34, -0.5);
  g.add(tail);
  for (const sx of [-0.11, 0.11]) {
    for (const sz of [-0.26, 0.28]) {
      g.add(mesh(boxGeo(0.09, 0.3, 0.09), fur, sx, 0.15, sz));
    }
  }
  g.position.set(x, 0, z);
  return { group: g, head, tail, t: 0, state: 'asleep', target: null };
}

export function updateDog(d, dt, groundY) {
  d.t += dt;
  d.group.position.y = groundY;
  if (d.state === 'asleep') {
    d.group.rotation.z = 1.45;                       // lying on its side
    d.group.position.y = groundY + 0.12;
    d.tail.rotation.y = Math.sin(d.t * 0.6) * 0.1;
    d.head.position.y = 0.38 + Math.sin(d.t * 1.3) * 0.01;
  } else {
    d.group.rotation.z = damp(d.group.rotation.z, 0, 5, dt);
    d.tail.rotation.y = Math.sin(d.t * 9) * 0.7;     // interested
    if (d.target) {
      const dx = d.target.x - d.group.position.x;
      const dz = d.target.z - d.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.4) {
        d.group.position.x += (dx / dist) * dt * 2.2;
        d.group.position.z += (dz / dist) * dt * 2.2;
        d.group.rotation.y = Math.atan2(dx, dz);
        d.group.position.y = groundY + Math.abs(Math.sin(d.t * 9)) * 0.05;
      }
    }
  }
  void lerp;
}

/** Crows on the hangar roof, which leave when the right engine backfires. */
export function makeCrow(x, y, z) {
  const g = group('crow');
  const black = solid(0x1c1a18, { roughness: 0.95 });
  g.add(mesh(boxGeo(0.14, 0.14, 0.3), black, 0, 0, 0));
  g.add(mesh(boxGeo(0.11, 0.11, 0.12), black, 0, 0.1, 0.17));
  g.add(mesh(coneGeo(0.03, 0.09, 4), solid(0x5a4a2a, { roughness: 0.9 }), 0, 0.1, 0.26));
  const wings = [];
  for (const sx of [-1, 1]) {
    const wing = mesh(boxGeo(0.24, 0.03, 0.18), black, sx * 0.1, 0.03, 0);
    g.add(wing);
    wings.push(wing);
  }
  g.position.set(x, y, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  return { group: g, wings, vel: new THREE.Vector3(), flying: false, t: Math.random() * 6 };
}

export function updateCrow(c, dt) {
  c.t += dt;
  if (!c.flying) {
    c.group.rotation.y += Math.sin(c.t * 0.6) * dt * 0.4;
    for (const w of c.wings) w.rotation.z = 0;
    return;
  }
  c.vel.y = Math.max(1.6, c.vel.y - dt * 2.4);
  c.group.position.addScaledVector(c.vel, dt);
  c.group.rotation.y = Math.atan2(c.vel.x, c.vel.z);
  const flap = Math.sin(c.t * 19) * 0.9;
  c.wings[0].rotation.z = flap;
  c.wings[1].rotation.z = -flap;
}

export function scatterCrows(crows) {
  for (const c of crows) {
    if (c.flying) continue;
    c.flying = true;
    const a = Math.random() * Math.PI * 2;
    c.vel.set(Math.cos(a) * (4 + Math.random() * 4), 5 + Math.random() * 3, Math.sin(a) * (4 + Math.random() * 4));
  }
}
