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

/* Name tags. Readable while you are close enough to be talking to somebody,
 * and gone a few strides later — an airfield with two men on it should not
 * read like a server with two hundred. */
const TAG_FULL = 5;               // metres: solid up to here
const TAG_FADE = 10;              // metres: nothing left by here
const TAG_CAP = 0.13;             // metres: how tall the letters stand
const TAG_Y = 2.16;               // metres: clear of the tallest hat

const _tagPos = new THREE.Vector3();

/* Photo faces, the way the Bing's cast and the Initiation do them: the picture
 * on the front of a box skull and plain colour on the other five sides.
 *
 * A snapshot is not a face texture -- it arrives with a patio behind it, and
 * mapped whole onto a head the fence comes too, so the man reads as a
 * photograph on a stick. The crop pulls the frame in to the head itself:
 * [u, v, width, height] in texture space, v measured from the bottom. */
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

/* Poses whose hands are already busy. A man holding a rifle across his chest
 * does not need to be caught gesturing with it. */
const NO_GESTURE = new Set(['guard', 'carry', 'sit']);

/**
 * A floating name, painted once into a canvas and hung over a figure's head.
 *
 * A Sprite rather than a plane because a sprite is already a billboard —
 * three.js faces it at the camera every frame for free, which is the entire
 * behaviour wanted here. The canvas is measured to the words so a long name
 * gets a long tag instead of a squashed one, and the letters end up the same
 * height in the world either way.
 */
export function nameTag(text, colour) {
  const c = document.createElement('canvas');
  const font = '900 64px Trebuchet MS, sans-serif';
  let ctx = c.getContext('2d');
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 56;   // resizing wipes it
  c.height = 112;
  ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Outlined, because half of this airfield is pale sky and the other half is
  // pale concrete and the tag has to sit on both.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 11;
  ctx.strokeStyle = 'rgba(14,13,11,0.9)';
  ctx.strokeText(text, c.width / 2, c.height / 2);
  ctx.fillStyle = colour;
  ctx.fillText(text, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false,
  }));
  const h = TAG_CAP * (c.height / 64);
  spr.scale.set(h * (c.width / c.height), h, 1);
  spr.position.y = TAG_Y;
  spr.renderOrder = 3;
  spr.userData.text = text;
  return spr;
}

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
  /* The head. With a photograph it is one image on the front of the skull and
   * hair colour on the other five sides, and nothing procedural gets built on
   * top of it: the picture already has his hair, his sunglasses and his
   * moustache in it, and a painted-on pair over the top of real ones is how a
   * likeness stops being one. The figure faces +z, which is material index 4. */
  let head;
  if (o.face) {
    const wrap = solid(o.hair ?? 0x3a2c20, { roughness: 1 });
    const faceMat = new THREE.MeshStandardMaterial({
      map: faceTexture(o.face, o.faceCrop || FACE_CROP), roughness: 0.9, metalness: 0,
    });
    head = new THREE.Mesh(boxGeo(0.24, 0.28, 0.24), [wrap, wrap, wrap, wrap, faceMat, wrap]);
    head.position.set(0, 0.14, 0);
    head.castShadow = head.receiveShadow = true;
  } else {
    head = mesh(boxGeo(0.24, 0.28, 0.24), skin, 0, 0.14, 0);
  }
  neck.add(head);
  if (o.hair !== false && !o.face) neck.add(mesh(boxGeo(0.25, 0.08, 0.25), solid(o.hair ?? 0x3a2c20, { roughness: 1 }), 0, 0.27, 0));
  if (o.shades && !o.face) {
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
    // Figures face +Z when authored. Mission setup needs an immediate body
    // turn before the first animation frame, rather than waiting for the
    // neck-only look-at behaviour in updateFigure().
    faceToward(x, z) {
      g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z);
    },
    pose: 'idle',
    t: Math.random() * 10,
    talk: 0,
    lookAt: null,
    walk: null,     // set by walkTo(); updateFigure carries him there
    sick: 0,        // Lou only: how bad it is right now
    idle: true,     // weight shifts and the odd gesture, on top of the pose
    gesture: 0,
    gestureAt: 3 + Math.random() * 7,
    base: null,     // what the pose set, so idle life can add rather than fight
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
  /* Remember where the pose left everything the idle layer is going to move,
   * so a weight shift adds to a lean instead of straightening it out. */
  f.base = {
    hipRollZ: f.hips.rotation.z,
    hipX: f.hips.position.x,
    arms: f.arms.map((a) => ({ sx: a.shoulder.rotation.x, ex: a.elbow.rotation.x })),
    legs: f.legs.map((l) => l.hip.rotation.z),
  };
}

/**
 * Send a figure walking somewhere on the flat ground he is standing on.
 * updateFigure carries him there — legs scissoring, arms counter-swinging —
 * and sets `pose` on arrival. The walk owns the legs while it runs.
 */
export function walkTo(f, x, z, { speed = 1.2, pose = 'idle' } = {}) {
  setPose(f, 'idle');
  f.walk = { x, z, speed, pose, phase: 0 };
}

/** Idle life: breathing, talking, the odd cough, and looking where told. */
export function updateFigure(f, dt, camPos = null) {
  f.t += dt;
  f._breath = Math.sin(f.t * 1.6) * 0.012;
  f.hips.position.y = (f.pose === 'sit' ? 0.52 : 0.86) + f._breath;

  if (f.walk) {
    const w = f.walk;
    const dx = w.x - f.group.position.x;
    const dz = w.z - f.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) {
      f.group.position.x = w.x;
      f.group.position.z = w.z;
      f.walk = null;
      setPose(f, w.pose);
    } else {
      const step = Math.min(d, w.speed * dt);
      f.group.position.x += (dx / d) * step;
      f.group.position.z += (dz / d) * step;
      // Face the direction of travel, turning rather than snapping.
      const want = Math.atan2(dx, dz);
      const turn = ((want - f.group.rotation.y + Math.PI) % (Math.PI * 2) + Math.PI * 2)
        % (Math.PI * 2) - Math.PI;
      f.group.rotation.y += clamp(turn, -3.4 * dt, 3.4 * dt);
      // Legs scissor, knees lift on the trailing beat, arms swing opposite,
      // and the whole man bobs on every stride.
      w.phase += dt * (4.2 + w.speed * 2.4);
      const s = Math.sin(w.phase);
      f.legs[0].hip.rotation.x = s * 0.52;
      f.legs[1].hip.rotation.x = -s * 0.52;
      f.legs[0].knee.rotation.x = Math.max(0, s) * 0.8;
      f.legs[1].knee.rotation.x = Math.max(0, -s) * 0.8;
      f.arms[0].shoulder.rotation.x = -s * 0.3;
      f.arms[1].shoulder.rotation.x = s * 0.3;
      f.hips.position.y += Math.abs(Math.cos(w.phase)) * 0.028;
    }
  }

  /* Idle life. A man waiting on his aeroplane does not stand still: he puts
   * his weight on one leg, then on the other, and every so often he does
   * something with his hands. Two sine waves at prime-ish rates so the sway
   * never settles into a loop you can count, and everything is added to what
   * the pose set rather than written over it — Lou keeps his lean, Stove keeps
   * his folder against his leg. */
  if (f.idle && f.base && !f.walk && f.pose !== 'sit') {
    const shift = Math.sin(f.t * 0.31) * 0.5 + Math.sin(f.t * 0.17 + 1.1) * 0.5;
    f.hips.position.x = f.base.hipX + shift * 0.035;
    f.hips.rotation.z = f.base.hipRollZ + shift * 0.05;
    for (const [i, leg] of f.legs.entries()) leg.hip.rotation.z = f.base.legs[i] - shift * 0.03;

    if (!NO_GESTURE.has(f.pose)) {
      if (f.gesture <= 0 && f.t > f.gestureAt) {
        f.gesture = 1;
        f.gestureAt = f.t + 7 + Math.random() * 9;
      }
      if (f.gesture > 0) {
        f.gesture = Math.max(0, f.gesture - dt * 0.5);
        // Up and back down again, so it reads as one movement and not a twitch.
        const k = Math.sin((1 - f.gesture) * Math.PI);
        const arm = f.arms[0];
        arm.shoulder.rotation.x = f.base.arms[0].sx - k * 0.85;
        arm.elbow.rotation.x = f.base.arms[0].ex - k * 1.05;
      }
    }
  }

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

  /* The name tag rides in the group, so walking carries it. All that is left
   * to decide is how much of it there is: full strength at talking distance,
   * thinning out from there, and switched off entirely for the figures nobody
   * passes a camera position for. */
  if (f.tag) {
    const d = camPos ? f.tag.getWorldPosition(_tagPos).distanceTo(camPos) : Infinity;
    const a = clamp((TAG_FADE - d) / (TAG_FADE - TAG_FULL), 0, 1);
    f.tag.material.opacity = a * 0.95;
    f.tag.visible = a > 0.02;
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
    shades: true,            // in the photograph, where they belong
    hat: 'headset',
    build: 0.55,
    /* His actual face. The crop keeps the backwards cap, headset mic and
     * moustache while leaving the shirt and the transparent edge out of the
     * square face plate. */
    face: 'assets/faces/sasole.png',
    faceCrop: [0.08, 0.28, 0.84, 0.63],
  });
  setPose(f, 'lean');
  // The cup. It goes where he goes until he gets in the aeroplane.
  const cup = mesh(cylGeo(0.045, 0.04, 0.11, 10), solid(0xe8e2d4, { roughness: 0.8 }), 0, -0.4, 0.06);
  f.arms[0].elbow.add(cup);
  f.cup = cup;
  // Gold, the same gold his subtitles come up in.
  f.tag = nameTag('CAPT. LOU SASOLE', '#e8c86a');
  f.group.add(f.tag);
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
  // Not the name on any of his documents, which is the joke.
  f.tag = nameTag('OLD STOVE', '#8fc4a8');
  f.group.add(f.tag);
  return f;
}

export function makeCecilio() {
  const f = makeFigure({
    name: 'cecilio',
    skin: 0xb07a4e,
    shirt: 0xf1e3c3,
    jacket: 0x6f3029,
    trousers: 0x27282d,
    boots: 0x241812,
    hair: 0x211814,
    hat: 'cowboy',
    build: 0.82,
  });
  setPose(f, 'inspect');
  // Cecilio is the only man at the shelter with a tailored jacket, a face the
  // player can read at conversation distance, and a name. The rear henchmen
  // deliberately keep their existing anonymous field clothes.
  const moustache = mesh(boxGeo(0.18, 0.035, 0.025), solid(0x211814, { roughness: 1 }), 0, 0.105, 0.135);
  moustache.name = 'cecilio-moustache';
  f.neck.add(moustache);
  const nose = mesh(boxGeo(0.045, 0.06, 0.045), solid(0xb07a4e, { roughness: 1 }), 0, 0.16, 0.145);
  nose.name = 'cecilio-nose';
  f.neck.add(nose);
  const gold = solid(0xe8c04a, { roughness: 0.25, metalness: 0.9 });
  const medallion = mesh(sphereGeo(0.045, 10, 6), gold, 0, 0.43, 0.185);
  medallion.name = 'cecilio-medallion';
  f.hips.add(medallion);
  // The watch. It cost more than the aeroplane.
  f.arms[1].elbow.add(mesh(boxGeo(0.09, 0.04, 0.09), gold, 0, -0.24, 0.04));
  f.tag = nameTag('DON CECILIO', '#d98a5a');
  f.group.add(f.tag);
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
