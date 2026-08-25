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
import { CAPTAIN_LOU_SASOLE } from '../core/wardrobe.js';
import { Mouth } from '../core/mouth.js';
import {
  coarseActorRole, markActor, readActor, setActorHeights, setActorPosture,
} from '../core/staging.js';

const SKIN = [0xd9a878, 0xb07a4e, 0x8a5a38, 0xe8c49a];

/**
 * Read a canonical `src/core/wardrobe.js` record with this scene's block rig.
 *
 * The wardrobe is the campaign's one description of what a person wears, in
 * the vocabulary the Family's own figure builder uses: `dress`, `jacketColour`,
 * `hairColour`, `belt`, `watch`, `trouserFit`, `trim`. Beef Run's rig is older
 * and speaks in plain part colours. Rather than copying the numbers across by
 * hand — which is exactly how the Family ended up with two different Big Uncle
 * Lous, and how Captain Sasole ended up on this airfield in a brown leather
 * jacket and khakis he does not own — this translates the record once, and the
 * scene spreads the result and adds only what is local to it.
 *
 * Nothing is invented here: every colour comes from the record. What the record
 * does not carry (boots, and the trousers under a bomber jacket) is derived
 * from what it does, so a wardrobe edit still moves this airfield.
 */
export function fromWardrobe(spec) {
  if (!spec) return {};
  const jacket = spec.dress === 'bomber' || spec.dress === 'suit' ? spec.jacketColour ?? null : null;
  return {
    skin: spec.skin,
    shirt: spec.shirt,
    jacket,
    // Flight trousers: the record's own jacket sage taken down to a service
    // grey-green, so the two garments belong to one man rather than two.
    trousers: spec.trousers ?? shadeOf(jacket ?? spec.shirt, 0.62),
    boots: spec.boots ?? shadeOf(jacket ?? spec.shirt, 0.34),
    hair: spec.hairColour,
    /* The rig's build is 0 (narrow) to 1 (wide); the wardrobe's runs on the
     * Family's own scale, where Captain Sasole is 1.10 and Big Uncle Lou is
     * 1.38. Map the one onto the other rather than leaving a 1.10 to be read
     * as "wider than the widest man in the game". */
    build: clamp(0.55 + (spec.build - 1.10) * 1.5, 0, 1),
    dress: spec.dress,
    patches: spec.patches === true,
    trim: spec.trim === true,
    belt: spec.belt ?? null,
    watch: spec.watch ?? null,
    trouserFit: spec.trouserFit ?? null,
  };
}

/** A darker or lighter relation of a packed colour, kept in the same hue. */
function shadeOf(colour, k) {
  const c = new THREE.Color(colour ?? 0x8a8f7a);
  c.multiplyScalar(k);
  return c.getHex();
}

/** Name a garment mesh on this file's convention: `<figure>-<part>`. */
function named2(m, o, n) {
  m.name = `${o.name || 'figure'}-${n}`;
  return m;
}

/* Name tags. Readable while you are close enough to be talking to somebody,
 * and gone a few strides later — an airfield with two men on it should not
 * read like a server with two hundred. */
const TAG_FULL = 5;               // metres: solid up to here
const TAG_FADE = 10;              // metres: nothing left by here
const TAG_CAP = 0.13;             // metres: how tall the letters stand
const TAG_Y = 2.16;               // metres: clear of the tallest hat

const _tagPos = new THREE.Vector3();
const _lookLocal = new THREE.Vector3();
const _lookMat = new THREE.Matrix4();
const _seatedHipsInverse = new THREE.Quaternion();
const _seatedLegRoot = new THREE.Vector3();
const _seatedLegPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.45, 0, 0));

/* How far a head turns. A standing figure gets the old 1.1 rad; a man strapped
 * into a seat gets more, because turning to face the left seat from the right
 * one is most of a right angle and stopping short of it reads as ignoring you.
 * Anything past the neck's own travel is taken up by the torso. */
const SEATED_NECK_SWEEP = 1.35;
const SEATED_TORSO_TWIST = 0.5;

/**
 * How far this rig's neck pitches, in radians of `neck.rotation.x`.
 *
 * SIGN FIRST, because it is the whole reason these are here. `rotation.x` is a
 * right-handed rotation about +X and an authored figure faces +Z, so a
 * POSITIVE `neck.rotation.x` tips the face DOWN and a negative one tips it UP.
 * The names below are the anatomy, not the sign: `NECK_PITCH_MAX_DOWN` is the
 * positive stop and `NECK_PITCH_MAX_UP` is the negative one.
 *
 * The numbers are clinical cervical range of motion, the same source the
 * seated sweep above comes from: about 50 degrees of flexion (chin toward
 * chest, 0.87 rad) and about 60 degrees of extension (looking up, 1.05 rad).
 * They are deliberately the FULL range rather than a comfortable one, because
 * this is a backstop and not a style control — anything short of the real
 * anatomy would start silently shaving honest looks.
 *
 * `updateFigure()`'s own two writes — a 0.045 rad talk bob and a damp toward
 * zero — never come near these. They exist for callers that LAYER a pitch on
 * top of the rig, which is what `src/enolasquatch/crew.js` does for its seated
 * gaze, and which on 2026-08-24 produced a neck pitched 253 degrees at 60 fps
 * and past a full revolution at 144 with nothing in the rig to stop it. A head
 * that has left its own anatomy is not a pose that needs tuning, it is a bug
 * that has already happened; the clamp makes it look like a stiff neck instead
 * of a spinning one, which is the difference between a report the owner can
 * describe and a report he cannot.
 */
export const NECK_PITCH_MAX_DOWN = 0.87;
export const NECK_PITCH_MAX_UP = -1.05;

/**
 * Fold any angle, however many turns from zero, into (-PI, PI].
 *
 * THIS EXISTS BECAUSE THE OLD ONE-LINER WAS NOT A WRAP.
 *
 * Owner playtest, 2026-08-24: *"Capt Sasole and Irish heads are rolling around
 * in circles when I look at them"* — and, in the same aeroplane, the
 * Shubenator sat in the tail with his head welded hard over one shoulder and
 * his torso wrung round after it.
 *
 * The look-at block below used to reduce its bearing with
 * `((want + Math.PI) % (Math.PI * 2)) - Math.PI`. That is the textbook wrap
 * from a language whose `%` is a modulo. JavaScript's `%` is a REMAINDER: it
 * keeps the sign of the DIVIDEND. So for any `want` at or below -PI the
 * remainder is just `want + PI` unchanged, the `- Math.PI` puts it back where
 * it started, and the expression returns a number still below -PI, which the
 * clamp immediately pins at `-sweep`.
 *
 * That matters because `want = atan2(dx, dz) - f.group.rotation.y`, and
 * `atan2` already spans (-PI, PI]. Any figure seated or stood at a positive
 * yaw therefore drives `want` down toward -2PI for a whole half of the circle
 * around him. The Shubenator sits at `rotation.y = PI`
 * (src/enolasquatch/crew.js), so his `want` lives in (-2PI, 0] and everything
 * below -PI — which includes the case where the player is directly in front of
 * him, `want` = -2PI, true answer ZERO — came out hard against the stop.
 * Cecilio, stood at yaw 1.3 on the El Hueso strip, had the same fault over a
 * narrower rear sector: he turned to the wrong shoulder rather than the near
 * one. Nothing anywhere wanted the old behaviour; it was pinned-at-a-limit in
 * every case it fired, so a true wrap can only ever move a head toward its
 * target and never away from one.
 *
 * The positive side of the old expression happened to be correct — remainders
 * of positive dividends already come out positive — which is why this hid for
 * so long behind figures posed at or near yaw zero.
 *
 * Half-open at +PI rather than -PI is arbitrary but must be stated: exactly
 * behind resolves to the LEFT shoulder, consistently, instead of chattering
 * between the two stops on floating-point noise.
 */
export function wrapAngle(a) {
  const t = a % (Math.PI * 2);
  if (t > Math.PI) return t - Math.PI * 2;
  if (t <= -Math.PI) return t + Math.PI * 2;
  return t;
}

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
  spr.name = 'name-tag';
  spr.renderOrder = 3;
  spr.userData.text = text;
  return spr;
}

/**
 * @param {object} o
 *   colours: { shirt, trousers, boots, skin, hat, jacket }
 *   build:   0..1 (0 = narrow, 1 = wide)
 */
/**
 * Where this rig's hips and eyes are when it is standing up, in metres.
 *
 * Measured off the build below rather than chosen: the hips group sits at
 * 0.86, the neck hangs +0.66 above that, and the head box is centred a
 * further +0.14 up, which puts the face -- and the photograph printed on it --
 * at 1.66. `setPose` folds the body by moving the hips, so everything above
 * the waist moves with them and both numbers go live; see `setActorHeights`.
 */
export const FIGURE_HIP_Y = 0.86;
export const FIGURE_EYE_Y = 1.66;

export function makeFigure(o = {}) {
  const skin = solid(o.skin ?? SKIN[0], { roughness: 1 });
  const shirt = solid(o.shirt ?? 0x8a8f7a, { roughness: 1 });
  const trousers = solid(o.trousers ?? 0x4a4a52, { roughness: 1 });
  const boots = solid(o.boots ?? 0x33291f, { roughness: 0.9 });
  const w = 0.42 + (o.build ?? 0.4) * 0.16;

  const figureName = o.name || 'figure';
  const semantic = (object, suffix) => {
    object.name = `${figureName}-${suffix}`;
    return object;
  };
  const g = group(figureName);
  g.userData.geometryGate = { assemblyId: `beefrun.figure.${figureName}` };
  /* The staging marker, here rather than at each call site, because this one
   * rig is the whole cast of two missions -- Beef Run's guards and associates
   * and the Enola's flight crew -- and twelve built states were handing the
   * staging gate an empty cast list and reading as a clean pass.
   *
   * The heights are measured off the rig below, not guessed: hips sit at
   * 0.86, the neck at +0.66 on top of that, and the head box is centred a
   * further +0.14 up, which puts the face -- and the photograph on it -- at
   * 1.66. Getting these from the marker's 2.30 m Sasquatch defaults is what
   * had thirty bank-lobby bodies casting sightlines from above their own
   * heads. The rig applies no height scale, so both numbers are constant.
   *
   * `actorRole` is the caller's word for what this man is; unknown words fall
   * back to `bystander` rather than throwing, so a new mission cannot take
   * the build down by inventing a job title. */
  markActor(g, {
    id: figureName,
    role: coarseActorRole(o.actorRole),
    posture: 'stand',
    eyeHeight: FIGURE_EYE_Y,
    hipHeight: FIGURE_HIP_Y,
  });
  const hips = new THREE.Group();
  hips.name = `${figureName}-hips`;
  hips.position.y = FIGURE_HIP_Y;
  g.add(hips);

  const torso = mesh(boxGeo(w, 0.62, 0.28), o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt, 0, 0.31, 0);
  torso.name = `${figureName}-torso`;
  hips.add(torso);
  if (o.jacket) {
    // Collar and open front, so the stained shirt shows.
    hips.add(semantic(mesh(boxGeo(w * 0.42, 0.5, 0.06), shirt, 0, 0.32, 0.15), 'jacket-front'));
  }

  /* Tailoring, for the people the player stands in front of.
   *
   * These are the canonical wardrobe's own words made physical — `dress`,
   * `trim`, `patches`, `belt`, `watch`, `trouserFit`. A figure that passes none
   * of them is built exactly as it was, so the guards, the associates, Stove
   * and Cecilio are untouched. */
  const jacketMat = o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt;
  const named = (m, n) => { m.name = `${o.name || 'figure'}-${n}`; return m; };
  if (o.dress === 'bomber' && o.jacket) {
    /* A flight jacket is knitted at the three places it closes: collar, cuffs,
     * waistband. Without them the torso box is a box. */
    const knit = solid(shadeOf(o.jacket, 0.74), { roughness: 1 });
    hips.add(named(mesh(boxGeo(w * 0.98, 0.1, 0.32), knit, 0, 0.02, 0), 'jacket-waistband'));
    hips.add(named(mesh(boxGeo(w * 0.62, 0.09, 0.31), knit, 0, 0.605, 0.01), 'jacket-collar'));
    // Zip placket, off centre because he never does it up straight.
    hips.add(named(mesh(boxGeo(0.035, 0.5, 0.03), solid(0xb8bcc2, { roughness: 0.4, metalness: 0.7 }), 0.02, 0.32, 0.15), 'jacket-zip'));
  }
  if (o.patches && o.jacket) {
    // Squadron patch on one shoulder, a name tape over the heart. Neither is
    // legible at the distance anybody stands at, and both read as a pilot.
    hips.add(named(mesh(boxGeo(0.1, 0.1, 0.02), solid(0xc0392b, { roughness: 0.9 }), -w * 0.34, 0.5, 0.145), 'jacket-patch-shoulder'));
    hips.add(named(mesh(boxGeo(0.16, 0.055, 0.02), solid(0x6b5432, { roughness: 0.95 }), w * 0.2, 0.44, 0.145), 'jacket-name-tape'));
  }
  if (o.trim && !o.jacket) {
    // A collar and a placket on a plain shirt.
    hips.add(named(mesh(boxGeo(w * 0.5, 0.07, 0.3), shirt, 0, 0.6, 0.01), 'shirt-collar'));
  }
  if (o.belt) {
    const buckle = o.belt === 'gold'
      ? solid(0xe8c04a, { roughness: 0.25, metalness: 0.9 })
      : solid(0x8a8578, { roughness: 0.45, metalness: 0.5 });
    hips.add(named(mesh(boxGeo(w * 0.96, 0.065, 0.3), solid(o.belt === 'gold' ? 0x3a2f22 : 0x2e241a, { roughness: 0.85 }), 0, -0.005, 0), 'belt'));
    hips.add(named(mesh(boxGeo(0.075, 0.06, 0.05), buckle, 0, -0.005, 0.15), 'belt-buckle'));
  }
  void jacketMat;

  const neck = new THREE.Group();
  neck.name = `${figureName}-neck`;
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
  head.name = `${figureName}-head`;
  neck.add(head);
  if (o.hair !== false && !o.face) neck.add(semantic(mesh(boxGeo(0.25, 0.08, 0.25), solid(o.hair ?? 0x3a2c20, { roughness: 1 }), 0, 0.27, 0), 'hair'));
  if (o.shades && !o.face) {
    neck.add(semantic(mesh(boxGeo(0.22, 0.06, 0.03), solid(0x14161a, { roughness: 0.3, metalness: 0.4 }), 0, 0.16, 0.13), 'shades'));
  }
  if (o.hat === 'cowboy') {
    neck.add(semantic(mesh(cylGeo(0.13, 0.15, 0.16, 10), solid(0x6b5432, { roughness: 1 }), 0, 0.34, 0), 'cowboy-hat-crown'));
    neck.add(semantic(mesh(cylGeo(0.34, 0.34, 0.03, 12), solid(0x6b5432, { roughness: 1 }), 0, 0.27, 0), 'cowboy-hat-brim'));
  } else if (o.hat === 'cap') {
    neck.add(semantic(mesh(boxGeo(0.26, 0.1, 0.26), solid(o.hatColor ?? 0x4a2f8f, { roughness: 1 }), 0, 0.31, 0), 'cap-crown'));
    neck.add(semantic(mesh(boxGeo(0.24, 0.03, 0.14), solid(o.hatColor ?? 0x4a2f8f, { roughness: 1 }), 0, 0.27, 0.18), 'cap-brim'));
  } else if (o.hat === 'headset') {
    // Hanging round the neck, which is where Lou's lives.
    neck.add(semantic(mesh(cylGeo(0.07, 0.07, 0.05, 8), solid(0x24262a, { roughness: 0.8 }), -0.13, 0.0, 0), 'headset-cup-right'));
    neck.add(semantic(mesh(cylGeo(0.07, 0.07, 0.05, 8), solid(0x24262a, { roughness: 0.8 }), 0.13, 0.0, 0), 'headset-cup-left'));
    neck.add(semantic(mesh(boxGeo(0.28, 0.04, 0.04), solid(0x24262a, { roughness: 0.8 }), 0, -0.02, -0.08), 'headset-band'));
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'right' : 'left';
    const shoulder = new THREE.Group();
    shoulder.name = `${figureName}-arm-${sideName}-shoulder`;
    shoulder.position.set(side * (w / 2 + 0.06), 0.56, 0);
    const upper = mesh(boxGeo(0.12, 0.3, 0.14), o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt, 0, -0.15, 0);
    upper.name = `${figureName}-arm-${sideName}-upper`;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.name = `${figureName}-arm-${sideName}-elbow`;
    elbow.position.y = -0.3;
    const fore = mesh(boxGeo(0.11, 0.28, 0.12), o.sleeves === false ? skin : (o.jacket ? solid(o.jacket, { roughness: 0.85 }) : shirt), 0, -0.14, 0);
    fore.name = `${figureName}-arm-${sideName}-forearm`;
    elbow.add(fore);
    const hand = mesh(boxGeo(0.11, 0.12, 0.11), skin, 0, -0.32, 0);
    hand.name = `${figureName}-arm-${sideName}-hand`;
    elbow.add(hand);
    if (o.dress === 'bomber' && o.jacket) {
      // Knitted cuff where the sleeve stops.
      elbow.add(named2(mesh(boxGeo(0.12, 0.07, 0.13), solid(shadeOf(o.jacket, 0.74), { roughness: 1 }), 0, -0.26, 0), o, `cuff-${side < 0 ? 'right' : 'left'}`));
    }
    /* The watch goes on his left wrist. The figure faces +Z, so with +Y up his
     * left is +X — the `side === 1` arm. */
    if (o.watch && side === 1) {
      const band = o.watch === 'gold'
        ? solid(0xe8c04a, { roughness: 0.25, metalness: 0.9 })
        : solid(0xc8ccd2, { roughness: 0.3, metalness: 0.85 });
      /* Above the knit cuff and proud of the sleeve's +Z face. At the old
       * wrist centre (-0.245, 0) the smaller watch box lived wholly inside
       * the 120x70x130 mm bomber cuff, so Captain Sasole technically wore a
       * watch that could never be seen. Keep its back seated in the forearm,
       * but leave the face outside the cuff like the shared cast rig does. */
      elbow.add(named2(mesh(boxGeo(0.085, 0.038, 0.085), band, 0, -0.2, 0.07), o, 'watch'));
    }
    shoulder.add(elbow);
    hips.add(shoulder);
    arms.push({ shoulder, elbow, hand });
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'right' : 'left';
    const hip = new THREE.Group();
    hip.name = `${figureName}-leg-${sideName}-hip`;
    hip.position.set(side * 0.12, 0, 0);
    const thigh = mesh(boxGeo(0.16, 0.44, 0.18), trousers, 0, -0.22, 0);
    thigh.name = `${figureName}-leg-${sideName}-thigh`;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.name = `${figureName}-leg-${sideName}-knee`;
    knee.position.y = -0.44;
    knee.add(semantic(mesh(boxGeo(0.14, 0.4, 0.16), trousers, 0, -0.2, 0), `leg-${sideName}-shin`));
    knee.add(semantic(mesh(boxGeo(0.16, 0.12, 0.26), boots, 0, -0.44, 0.04), `leg-${sideName}-boot`));
    if (o.trouserFit === 'creased') {
      // A pressed crease down the front and a turn-up at the boot. Two thin
      // slabs, and the difference between trousers and a pair of tubes.
      const pressed = solid(shadeOf(o.trousers ?? 0x4a4a52, 0.84), { roughness: 1 });
      hip.add(named2(mesh(boxGeo(0.022, 0.44, 0.02), pressed, 0, -0.22, 0.092), o, `trouser-crease-${side < 0 ? 'right' : 'left'}`));
      knee.add(named2(mesh(boxGeo(0.022, 0.4, 0.02), pressed, 0, -0.2, 0.082), o, `trouser-crease-lower-${side < 0 ? 'right' : 'left'}`));
      knee.add(named2(mesh(boxGeo(0.152, 0.05, 0.172), pressed, 0, -0.375, 0), o, `trouser-turnup-${side < 0 ? 'right' : 'left'}`));
    }
    hip.add(knee);
    hips.add(hip);
    legs.push({ hip, knee });
  }

  // Figures are planted by the scene's terrain/elevation function and may
  // later ride in the aircraft. One exact boot is the support witness for the
  // already bounded per-character assembly; the cast root is not suppressed.
  const supportBoot = g.getObjectByName(`${figureName}-leg-right-boot`);
  supportBoot.userData.geometryGate = {
    ...(supportBoot.userData.geometryGate ?? {}),
    checkSupport: false,
  };

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
    /* The mouth ENVELOPE, driven by the take rather than by a clock
     * (src/core/mouth.js). Built with no parts on purpose: this rig applies
     * the opening itself, through its own damping and with the brows moving
     * with it, so what it wants from the shared module is the number and not
     * the geometry. Figures without an authored face carry it anyway and it
     * costs one comparison a frame while nobody is talking. */
    voiceMouth: new Mouth(),
    lookAt: null,
    walk: null,     // set by walkTo(); updateFigure carries him there
    sick: 0,        // Lou only: how bad it is right now
    idle: true,     // weight shifts and the odd gesture, on top of the pose
    gesture: 0,
    gestureAt: 3 + Math.random() * 7,
    base: null,     // what the pose set, so idle life can add rather than fight
    _breath: 0,
    faceRig: null,  // authored named faces can add blinking and speech movement
  };
}

/**
 * Give Don Cecilio a face authored for conversation distance.
 *
 * Cecilio is not a Circle member and has no supplied authoritative face photo,
 * so borrowing somebody else's photograph would create a second identity. His
 * face instead follows the project's current procedural-character language:
 * separate brows and eyes, a two-part nose, a jaw and a real opening mouth.
 * The named pieces are handed to updateFigure() as a tiny face rig so blinks,
 * eye movement and speech all belong to the same man as his voice turn.
 */
export function buildCecilioFace(f) {
  const skin = solid(0xb07a4e, { roughness: 1 });
  const hair = solid(0x211814, { roughness: 1 });
  const white = solid(0xe8dfd1, { roughness: 0.65 });
  const iris = solid(0x51331f, { roughness: 0.45 });
  const pupil = solid(0x100c0a, { roughness: 0.45 });
  const mouthDark = solid(0x351719, { roughness: 0.8 });
  const lip = solid(0x75453a, { roughness: 0.8 });

  const root = group('cecilio-face');
  f.neck.add(root);

  const put = (name, size, material, pos, rotZ = 0, parent = root) => {
    const part = mesh(boxGeo(...size), material, ...pos);
    part.name = name;
    part.rotation.z = rotZ;
    part.userData.dim = { w: size[0], h: size[1], d: size[2] };
    parent.add(part);
    return part;
  };

  // A broad lower face and cheek planes keep the stock box from reading as a
  // blank mask when he turns under the shelter light.
  put('cecilio-face-cheek-right', [0.072, 0.062, 0.026], skin, [-0.067, 0.132, 0.127]);
  put('cecilio-face-cheek-left', [0.072, 0.062, 0.026], skin, [0.067, 0.132, 0.127]);

  const eyes = [];
  const pupils = [];
  const lids = [];
  const brows = [];
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'right' : 'left';
    const brow = put(
      `cecilio-face-brow-${side}`,
      [0.064, sx < 0 ? 0.019 : 0.016, 0.018],
      hair,
      [sx * 0.057, sx < 0 ? 0.232 : 0.226, 0.132],
      -sx * 0.08,
    );
    brows.push(brow);
    put(`cecilio-face-eye-${side}`, [0.052, 0.028, 0.014], white, [sx * 0.057, 0.198, 0.132]);
    const eye = put(`cecilio-face-iris-${side}`, [0.021, 0.021, 0.009], iris, [sx * 0.057, 0.197, 0.141]);
    const dot = put(`cecilio-face-pupil-${side}`, [0.009, 0.011, 0.007], pupil, [sx * 0.057, 0.197, 0.147]);
    const lid = put(`cecilio-face-lid-${side}`, [0.055, 0.028, 0.012], skin, [sx * 0.057, 0.198, 0.153]);
    lid.scale.y = 0.08;
    eye.userData.baseX = eye.position.x;
    dot.userData.baseX = dot.position.x;
    eyes.push(eye);
    pupils.push(dot);
    lids.push(lid);
  }

  put('cecilio-nose-bridge', [0.03, 0.062, 0.028], skin, [0, 0.174, 0.135]);
  put('cecilio-nose', [0.052, 0.03, 0.044], skin, [0, 0.145, 0.15]);

  // Two lobes and weighted ends make his moustache a silhouette, not a bar
  // painted over the middle of his head.
  const moustache = group('cecilio-moustache');
  root.add(moustache);
  put('cecilio-moustache-right', [0.092, 0.027, 0.022], hair, [-0.044, 0.119, 0.156], 0.12, moustache);
  put('cecilio-moustache-left', [0.092, 0.027, 0.022], hair, [0.044, 0.119, 0.156], -0.12, moustache);
  put('cecilio-moustache-drop-right', [0.024, 0.048, 0.021], hair, [-0.083, 0.101, 0.154], 0.08, moustache);
  put('cecilio-moustache-drop-left', [0.024, 0.048, 0.021], hair, [0.083, 0.101, 0.154], -0.08, moustache);

  put('cecilio-face-lip-upper', [0.052, 0.009, 0.015], lip, [0, 0.098, 0.143]);
  const mouth = put('cecilio-face-mouth', [0.058, 0.027, 0.012], mouthDark, [0, 0.087, 0.141]);
  mouth.scale.y = 0.18;

  const jaw = group('cecilio-face-jaw');
  jaw.userData.baseY = 0;
  root.add(jaw);
  put('cecilio-face-lip-lower', [0.057, 0.014, 0.015], lip, [0, 0.076, 0.147], 0, jaw);
  put('cecilio-face-chin', [0.09, 0.043, 0.034], skin, [0, 0.052, 0.133], 0, jaw);

  f.faceRig = {
    root, eyes, pupils, lids, brows, jaw, mouth,
    lidRest: 0.08,
    mouthRest: 0.18,
    blink: 0,
    blinkDuration: 0.18,
    nextBlink: f.t + 1.8,
  };
  return f;
}

/**
 * Animate an authored face without changing anybody else's block figure.
 *
 * `syllable` is the mouth's opening, 0..1, from the shared driver — it used to
 * be `|sin(t*15.7)|*0.68 + |sin(t*8.9)|*0.32`, a fixed flap on a clock, held
 * for whatever number of seconds somebody guessed the line would run.
 */
function updateAuthoredFace(f, dt, syllable) {
  const face = f.faceRig;
  if (!face) return;

  if (face.blink <= 0 && f.t >= face.nextBlink) {
    face.blink = face.blinkDuration;
    // Deterministic uneven spacing: no rapid double blink and no clockwork
    // five-second loop visible during the long handoff conversation.
    face.nextBlink = f.t + 3.7 + (Math.sin(f.t * 0.73) + 1) * 1.15;
  }
  let closed = 0;
  if (face.blink > 0) {
    face.blink = Math.max(0, face.blink - dt);
    closed = Math.sin((1 - face.blink / face.blinkDuration) * Math.PI);
  }
  for (const lid of face.lids) {
    lid.scale.y = damp(lid.scale.y, face.lidRest + closed, 28, dt);
  }

  const eyeShift = Math.sin(f.t * 0.39 + 0.8) * 0.0025
    + clamp(f.neck.rotation.y / 1.1, -1, 1) * 0.004;
  for (const eye of [...face.eyes, ...face.pupils]) {
    eye.position.x = damp(eye.position.x, eye.userData.baseX + eyeShift, 7, dt);
  }

  face.mouth.scale.y = damp(face.mouth.scale.y, face.mouthRest + syllable * 1.05, 18, dt);
  face.jaw.position.y = damp(face.jaw.position.y, face.jaw.userData.baseY - syllable * 0.022, 16, dt);
  for (const [i, brow] of face.brows.entries()) {
    const emphasis = syllable * (i ? 0.014 : -0.01);
    brow.rotation.z = damp(brow.rotation.z, (i ? -0.08 : 0.08) + emphasis, 10, dt);
  }
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
      /* arms[0] is his physical right and arms[1] his physical left (the man
       * faces +Z).  The old Z signs folded the hanging arm through his jacket
       * and pulled the raised elbow across his chest. Keep both elbows on
       * their own side of the torso while retaining the casual wing lean. */
      R.shoulder.rotation.x = -1.3;
      R.shoulder.rotation.z = 0.22;
      R.elbow.rotation.x = -0.35;
      L.shoulder.rotation.z = -0.12;
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

  /* Tell the staging marker what the pose just did to him.
   *
   * A pose folds the body by moving the hips, and everything above the waist
   * rides along, so both the hip and the eye move by the same amount. Nothing
   * told the marker that, and the whole Enola crew flew the mission declaring
   * an eye 0.340 m above where their heads were -- 0.86 minus the 0.52 that
   * `sit` drops them to. The gate was asking whether a point above each man's
   * head was inside the fuselage.
   *
   * `sit` is the only pose here that is a posture in the gate's vocabulary;
   * lean, gut, carry, inspect and guard are all things a man does standing
   * up. A rider says so for itself after this runs -- see the Enola's
   * `sit()`, which straps them into an aeroplane. */
  if (readActor(f.group)) {
    const drop = f.hips.position.y - FIGURE_HIP_Y;
    setActorHeights(f.group, {
      eyeHeight: FIGURE_EYE_Y + drop,
      hipHeight: f.hips.position.y,
    });
    setActorPosture(f.group, pose === 'sit' ? 'sit' : 'stand');
  }
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
      /* This one was always written the long way round — `(x % 2PI + 2PI) % 2PI`
       * — and was therefore always correct. It now goes through `wrapAngle()`
       * so the file has exactly one answer to "fold this angle", and the next
       * person copying a wrap out of here copies the working one. */
      const turn = wrapAngle(want - f.group.rotation.y);
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

  /* The mouth, on the take. Advanced every frame whether or not he is
   * talking, because that is what closes it again when the line stops. */
  const syllable = f.voiceMouth.update(dt);
  if (f.talk > 0) {
    f.talk -= dt;
    f.neck.rotation.x = Math.sin(f.t * 13) * 0.045 - 0.02;
  } else {
    f.neck.rotation.x = damp(f.neck.rotation.x, 0, 6, dt);
  }
  updateAuthoredFace(f, dt, syllable);

  if (f.sick > 0) {
    // Weight shifting, a hand toward the stomach, and a slow forward lean.
    f.hips.rotation.x = damp(f.hips.rotation.x, 0.06 + f.sick * 0.2, 2, dt);
    f.hips.rotation.z = Math.sin(f.t * 0.7) * 0.05 * f.sick;
  }

  /* Look at whoever is being talked to — including from a seat.
   *
   * This used to be gated `f.pose !== 'sit'`, which meant the one man the
   * player spends the whole flight sitting next to never turned his head. The
   * Brushrunner's nose is +Z and an authored figure faces +Z, so a co-pilot
   * dropped into the right seat at rotation zero is aimed at the windshield
   * and the left seat only ever sees the back-right of his skull: measured at
   * 146.2 degrees off the pilot's eye. Nothing was wrong with his face texture.
   *
   * A seated man turns his neck rather than his hips, so `sit` gets a wider
   * sweep than a standing figure's and no body rotation at all.
   *
   * The frame conversion matters too: once he is parented to the aeroplane his
   * `group.position` is in aircraft space while `camPos` is in world space, so
   * the target has to be brought into the parent's frame before the bearing
   * means anything. */
  const target = f.lookAt || camPos;
  if (target) {
    const parent = f.group.parent;
    let tx = target.x, tz = target.z;
    if (parent && parent.matrixWorld) {
      parent.updateWorldMatrix(true, false);
      _lookLocal.set(target.x, target.y ?? 0, target.z);
      _lookMat.copy(parent.matrixWorld).invert();
      _lookLocal.applyMatrix4(_lookMat);
      tx = _lookLocal.x;
      tz = _lookLocal.z;
    }
    const dx = tx - f.group.position.x;
    const dz = tz - f.group.position.z;
    const want = Math.atan2(dx, dz) - f.group.rotation.y;
    const sweep = f.pose === 'sit' ? SEATED_NECK_SWEEP : 1.1;
    const wanted = wrapAngle(want);
    const clamped = clamp(wanted, -sweep, sweep);
    f.neck.rotation.y = damp(f.neck.rotation.y, clamped, 4, dt);
    /* Over the shoulder, a seated man leans his upper body round too — a neck
     * alone cannot get a face to somebody sitting behind and beside him. */
    if (f.pose === 'sit') {
      const spill = clamp(wanted - clamped, -SEATED_TORSO_TWIST, SEATED_TORSO_TWIST);
      f.hips.rotation.y = damp(f.hips.rotation.y, spill, 3, dt);
    }
  }

  /* Captain Sasole's torso can lean and twist without lifting both feet off
   * the pedal deck. Marked seated rigs counter-rotate only their leg roots in
   * hips space (and counter-position the two hip sockets), preserving all
   * upper-body life while keeping the planted legs in the aircraft frame.
   * Other seated characters retain their authored poses unless they opt in. */
  if (f.pose === 'sit' && f.plantSeatedFeet) {
    _seatedHipsInverse.copy(f.hips.quaternion).invert();
    for (const [index, leg] of f.legs.entries()) {
      leg.hip.quaternion.copy(_seatedHipsInverse).multiply(_seatedLegPose);
      leg.hip.position.copy(_seatedLegRoot
        .set(index === 0 ? -0.12 : 0.12, 0, 0)
        .applyQuaternion(_seatedHipsInverse));
    }
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

/**
 * Make a figure say something: the head bobs for `seconds` and the mouth runs
 * on the take.
 *
 * @param {object} f       the figure
 * @param {number} seconds how long the head bob holds — and, with no
 *   recording, how long the mouth keeps working
 * @param {object} [take]  `{ audio, source }` from `AudioEngine.play()`/`say()`
 */
export function speak(f, seconds = 1.6, take = null) {
  if (!f) return;
  f.talk = seconds;
  f.voiceMouth.speak({ seconds, ...(take || {}) });
}

/** Cut the line: the mouth shuts whatever the subtitle is still doing. */
export function hush(f) {
  if (!f) return;
  f.talk = 0;
  f.voiceMouth.stop();
}

/* ------------------------------------------------------------------ */
/* The cast                                                            */
/* ------------------------------------------------------------------ */

/**
 * Captain Lou Sasole, dressed out of the campaign's one wardrobe.
 *
 * ## He is not Big Uncle Lou Sputthole, and the two must never merge
 *
 * `captain_lou_sasole` / `lou2` is the pilot: a working man whose one good
 * possession is a sage flight jacket. `lou` / `lou1` is Big Uncle Lou
 * Sputthole, who wears a pressed suit and every gold thing he owns at the same
 * time. They share a first name and nothing else — not a height, not a build,
 * not a garment, not a voice id, not a name tag. This function reads
 * `CAPTAIN_LOU_SASOLE` and only `CAPTAIN_LOU_SASOLE`; importing or spreading
 * `BIG_UNCLE_LOU` here would be a character error, not a styling choice.
 *
 * Everything below the spread is LOCAL to this airfield: his headset round his
 * neck, the coffee he carries until he gets in, his photographed face and its
 * crop, and the gold his subtitles come up in. His clothes are not local, and
 * used to be — an inline literal put him in a brown leather jacket over
 * wrinkled khaki, which is a different man's outfit and drifted the moment the
 * wardrobe was written.
 */
export function makeLou() {
  const f = makeFigure({
    ...fromWardrobe(CAPTAIN_LOU_SASOLE),
    name: 'captain_lou_sasole',
    // He flies the aeroplane in both missions that use this rig.
    actorRole: 'crew',
    // Local to the airfield: the headset lives round his neck, never on his ears.
    hat: 'headset',
    /* His actual face. The crop keeps the backwards cap, headset mic and
     * moustache while leaving the shirt and the transparent edge out of the
     * square face plate. */
    face: 'assets/faces/sasole.png',
    faceCrop: [0.08, 0.28, 0.84, 0.63],
  });
  f.plantSeatedFeet = true;
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
 *
 * Owner's note: *"Old Stove's face is still not there."* MEASURED CAUSE:
 * `assets/faces/stove.png` has been on disk (and in `assets/faces/index.json`)
 * the whole time, but nothing here ever passed `face:` to `makeFigure()` — his
 * head has always been a plain skin-coloured box with a procedural shades bar
 * and beard slab stuck to it, exactly like a cast member with no photograph.
 * Wired the same way Sasole's is: `face` plus the shared square-photo default
 * crop, which is what every OTHER 256x256 face in this folder already uses —
 * `sasole.png` is the one portrait-shaped exception with its own crop, and
 * `stove.png` is 256x256 like the rest. `makeFigure()` turns off the
 * procedural hair box and shades bar itself once `o.face` is set (`!o.face` on
 * both), which is also why the standalone beard slab below is gone: the photo
 * already has one and a floating box on top of a real jaw is worse than either
 * alone.
 */
export function makeOldStove() {
  const f = makeFigure({
    name: 'stove',
    // A pilot first and an Agency employee second, per the note above.
    actorRole: 'crew',
    skin: 0xd8b48c,
    shirt: 0x4a5260,          // dark grey-blue tee
    trousers: 0xbfa878,       // khakis
    boots: 0x8a7a52,          // tan boots
    hair: 0x6b5340,           // cropped, and going -- still used on the head
    // cube's other five faces once a photo is on the sixth.
    build: 0.36,              // narrow
    face: 'assets/faces/stove.png',
  });
  setPose(f, 'idle');
  const semantic = (object, suffix) => {
    object.name = `stove-${suffix}`;
    return object;
  };

  // Headset round the neck: green cups, exactly where Lou's black ones sit.
  const cupMat = solid(0x5f6b3a, { roughness: 0.8 });
  for (const sx of [-0.14, 0.14]) {
    f.neck.add(semantic(
      mesh(cylGeo(0.075, 0.075, 0.055, 8), cupMat, sx, -0.02, 0),
      `headset-cup-${sx < 0 ? 'right' : 'left'}`,
    ));
  }
  f.neck.add(semantic(
    mesh(boxGeo(0.3, 0.04, 0.04), solid(0x2a2a2e, { roughness: 0.8 }), 0, -0.04, -0.09),
    'headset-band',
  ));
  // The boom mic, folded up and forgotten.
  const boom = semantic(
    mesh(boxGeo(0.035, 0.035, 0.17), solid(0x1e1e22, { roughness: 0.8 }), 0.13, 0.02, 0.09),
    'headset-boom',
  );
  boom.rotation.x = -0.5;
  f.neck.add(boom);

  /* The parachute rig. Two red webbing straps over the shoulders into a chest
   * strap, leg loops, and steel hardware — the detail that makes him read as a
   * man who flies rather than a man in a windbreaker. */
  const webbing = solid(0xa8232a, { roughness: 0.95 });
  const steel = solid(0xc8ccd2, { roughness: 0.35, metalness: 0.8 });
  for (const sx of [-1, 1]) {
    const sideName = sx < 0 ? 'right' : 'left';
    const strap = semantic(
      mesh(boxGeo(0.085, 0.62, 0.055), webbing, sx * 0.13, 0.31, 0.15),
      `parachute-front-strap-${sideName}`,
    );
    strap.rotation.z = sx * 0.12;
    f.hips.add(strap);
    // Back half of the same strap.
    const back = semantic(
      mesh(boxGeo(0.085, 0.6, 0.055), webbing, sx * 0.15, 0.31, -0.15),
      `parachute-back-strap-${sideName}`,
    );
    back.rotation.z = sx * 0.14;
    f.hips.add(back);
    // Leg loop.
    const loop = semantic(
      mesh(boxGeo(0.075, 0.24, 0.05), webbing, sx * 0.14, 0.02, 0.1),
      `parachute-leg-loop-${sideName}`,
    );
    loop.rotation.x = 0.5;
    f.hips.add(loop);
    // Buckle.
    f.hips.add(semantic(
      mesh(boxGeo(0.075, 0.075, 0.03), steel, sx * 0.13, 0.16, 0.18),
      `parachute-buckle-${sideName}`,
    ));
  }
  // Chest strap across the two risers.
  f.hips.add(semantic(mesh(boxGeo(0.34, 0.07, 0.05), webbing, 0, 0.44, 0.16), 'parachute-chest-strap'));
  // The pack itself, on his back.
  f.hips.add(semantic(
    mesh(boxGeo(0.34, 0.44, 0.14), solid(0x8a1f26, { roughness: 0.95 }), 0, 0.3, -0.2),
    'parachute-pack',
  ));

  // A folder he never opens, held against his leg.
  const folder = semantic(
    mesh(boxGeo(0.24, 0.32, 0.03), solid(0xc9b78d, { roughness: 0.9 }), 0, -0.34, 0.07),
    'folder',
  );
  f.arms[1].elbow.add(folder);
  f.folder = folder;
  // Not the name on any of his documents, which is the joke.
  f.tag = nameTag('OLD STOVE', '#8fc4a8');
  f.group.add(f.tag);
  return f;
}

export function makeCecilio() {
  const f = buildCecilioFace(makeFigure({
    name: 'cecilio',
    skin: 0xb07a4e,
    shirt: 0xf1e3c3,
    jacket: 0x6f3029,
    trousers: 0x27282d,
    boots: 0x241812,
    hair: 0x211814,
    hat: 'cowboy',
    build: 0.82,
  }));
  setPose(f, 'inspect');
  // Cecilio is the only man at the shelter with a tailored jacket, a face the
  // player can read at conversation distance, and a name. The rear henchmen
  // deliberately keep their existing anonymous field clothes.
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
  const f = makeFigure({
    name: `guard${i}`, actorRole: 'guard',
    skin: SKIN[(i + 1) % SKIN.length], build: 0.45 + (i % 3) * 0.1, ...kit,
  });
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
    actorRole: 'crew',
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
  /* NAMED, ALL OF IT, and not for readability.
   *
   * The geometry allowlists address an unnamed mesh by its ordinal among the
   * unnamed -- `name=chicken#2/type=Mesh#4` -- so grouping the head above
   * renumbered the legs from Mesh#4/#5 to Mesh#1/#2 and quietly invalidated a
   * checked-in suppression source for every chicken in every one of the six
   * Beef Run states. Nothing about the birds had changed; only the counting
   * had. Names do not renumber. */
  body.name = 'chicken-body';
  body.scale.set(1, 0.85, 1.25);
  g.add(body);
  /* THE HEAD IS A GROUP, NOT A BALL WITH THINGS PARKED NEAR IT.
   *
   * Owner, 2026-08-25: *"the red gobbler stays put and it just the head
   * floats."* Exactly right. `updateChicken` pecks by lowering the head 18 cm,
   * and the beak and the comb were SIBLINGS of it on the body -- so the skull
   * dipped and left its own beak and wattle hanging in the air where the head
   * used to be. Three pieces of one head, one of them moving.
   *
   * They ride in a pivot at the neck now, positioned relative to it, so the
   * peck takes the whole head with it. `head` still names the thing the update
   * moves and still sits at y 0.42, so the bob arithmetic there is untouched. */
  const head = group('chicken-head');
  head.position.set(0, 0.42, 0.14);
  const skull = mesh(sphereGeo(0.08, 8, 6), solid(0xe8e2d4, { roughness: 1 }), 0, 0, 0);
  skull.name = 'chicken-skull';
  // The beak, on the front of the skull.
  const beak = mesh(coneGeo(0.03, 0.07, 5), solid(0xe8a23a, { roughness: 0.9 }), 0, 0, 0.10);
  beak.name = 'chicken-beak';
  // The comb, on top of it.
  const comb = mesh(boxGeo(0.04, 0.07, 0.03), solid(0xd92e2e, { roughness: 0.9 }), 0, 0.07, 0);
  comb.name = 'chicken-comb';
  head.add(skull, beak, comb);
  g.add(head);
  for (const sx of [-0.05, 0.05]) {
    const leg = mesh(cylGeo(0.012, 0.012, 0.16, 5), solid(0xe8a23a, { roughness: 0.9 }), sx, 0.08, 0);
    /* `airstrip.js` needs this one by name: it is the bird's support witness,
     * and it used to be fished out as `children[4]`. */
    leg.name = 'chicken-leg';
    g.add(leg);
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
