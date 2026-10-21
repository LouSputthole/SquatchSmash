/**
 * What a man does with his hands at this table: drink, smoke, spit, point,
 * lean back, shake his head, raise his glass, nod, and the finger.
 *
 * Two halves, one vocabulary:
 *   - perform(kind) is YOU, in first person. The props are the flat's own
 *     camera-mounted ones (`src/world/props.js` makeHeldDrinks/poseHeldDrink,
 *     makeHeldCigarette) and the exhale is `src/world/smoke.js`
 *     emitCigaretteExhale, the same plume Tony blows everywhere else. Then the
 *     kind goes to the server so the table sees it.
 *   - remote(playerId, kind, { target }) is everybody else, in third person:
 *     the seat's figure reaches with a real two-bone arm (aimArm below) for
 *     the whiskey glass the world set at his place, brings it to his mouth and
 *     sets it back down; a cigar comes up to his lips with its ember out; a
 *     spit flies at whoever he was looking at and sticks to that man's face;
 *     the sound plays from his chair.
 *
 * Pacing is the server's 2/s plus one rule here: a kind still playing for a
 * player is not started again for him.
 */
import { makeHeldDrinks, poseHeldDrink, makeHeldCigarette } from '../world/props.js';
import { emitCigaretteExhale } from '../world/smoke.js';

export const ACTIONS = Object.freeze(['drink', 'smoke', 'spit', 'point', 'lean', 'shake', 'raise', 'nod', 'finger']);

const DEFAULT_KEYS = Object.freeze({
  drink: 'Digit1', smoke: 'Digit2', spit: 'Digit3', point: 'Digit4',
  lean: 'Digit5', shake: 'Digit6', raise: 'Digit7', nod: 'Digit8', finger: 'Digit9',
});

/* Seconds each one takes. Owner, 2026-10-19 playtest: "Lets further animatie
 * the drinking and the smoking as well." A drink is now reach, lift, sip with
 * the head back, set it down; a smoke is to the lips, the draw, down, the
 * exhale, a tap of the ash. */
export const ACTION_DURATION = Object.freeze({
  drink: 2.4, smoke: 3.3, spit: 1.0, point: 1.6, lean: 2.2, shake: 1.2, raise: 1.6, nod: 1.0, finger: 1.8,
});

/* Cue names. Every one is in assets/sfx/manifest.json -- `npm run check`
 * fails on a literal that is not. */
const CUE = Object.freeze({
  sip: 'whiskey.swig',
  setDown: 'glass.set',
  drag: 'cig.drag',
  exhale: 'cig.exhale',
  spit: 'deadgiveaway.spit',
  /* "soft wet click of something small ... very quiet, close mic": the spit
   * landing on a face, which nothing in the manifest does better. */
  splat: 'zyn.pack',
});
/** Every cue this module plays, for the scene's loadManifest. */
export const ACTION_CUES = Object.freeze(Object.values(CUE));

/* How long a spit stays on the man it hit, and how long it takes to go.
 * Owner: "it should kind of stick to another person for a second (slightly
 * bluring their view) for about a second." */
export const SPIT_STICK = 1.0;
export const SPIT_FADE = 0.4;

/** 0 -> 1 -> 0 over a normalised action, eased at both ends. */
function bell(k) {
  const x = Math.max(0, Math.min(1, k));
  return Math.sin(x * Math.PI) ** 2;
}
/** Up fast, hold, down: the shape of a lifted glass. */
function lift(k, up = 0.3, down = 0.75) {
  if (k <= 0 || k >= 1) return 0;
  if (k < up) { const e = k / up; return e * e * (3 - 2 * e); }
  if (k > down) { const e = (1 - k) / (1 - down); return e * e * (3 - 2 * e); }
  return 1;
}
/** Smoothstep of t across [a, b]. */
function seg(t, a, b) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* cast.js makePerson(): the photo skull is a 0.162 x 0.212 x 0.19 box centred
 * 0.168 above the head pivot, face on +z (front plane z = 0.095). The mouth of
 * the photograph sits in its lower quarter. Head-local points. */
const MOUTH = Object.freeze([0, 0.11, 0.1]);
const FACE_Z = 0.098;

export function createActions({ scene, camera, audio = null, world, seats, smoke = null, THREE, send = () => {}, selfId = () => null, keys = DEFAULT_KEYS }) {
  const anchors = world.anchors;
  const remotes = new Map();   // playerId -> Map(kind -> { t, dur, ... })
  const local = new Map();     // kind -> { t, dur, ... }
  const spits = [];            // flying globs, then splats stuck to a face
  let time = 0;

  const UP = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  /* ---------------- two-bone arm ----------------
   * cast.js arm(): the shoulder pivot carries 0.30 of upper arm to the elbow
   * pivot, which carries the forearm 0.30 to the hand socket, and the elbow
   * only hinges on its own x (negative bends the hand forward). Solved in the
   * body's own space, so the figure's height scale is already in the numbers.
   * The old gestures set three Euler angles by hand, which only ever pointed
   * an arm at the middle of the table; owner: "The point animation could be a
   * bit better from others perspectives". */
  const UPPER = 0.30;
  const FORE = 0.30;
  const ik = {
    v: new THREE.Vector3(), p: new THREE.Vector3(),
    a1: new THREE.Vector3(), a2: new THREE.Vector3(), a3: new THREE.Vector3(),
    b3: new THREE.Vector3(), mA: new THREE.Matrix4(), mB: new THREE.Matrix4(), q: new THREE.Quaternion(),
  };

  /**
   * Swing `arm` (shoulder pivot) and bend `fore` so the hand socket reaches
   * `target` (world), elbow down and a little out on `side` (+1 = the arm on
   * the figure's +x). `weight` blends from the pose the figure already has.
   * Out of reach, the arm points straight at the target.
   */
  function aimArm(arm, fore, target, side, weight, foreRest) {
    if (!(weight > 0)) return;
    const parent = arm.parent;
    parent.updateWorldMatrix(true, false);
    const v = parent.worldToLocal(ik.v.copy(target)).sub(arm.position);
    const len = v.length() || 1e-6;
    const d = clamp(len, Math.abs(UPPER - FORE) + 0.04, (UPPER + FORE) * 0.995);
    const bend = Math.PI - Math.acos(clamp((UPPER * UPPER + FORE * FORE - d * d) / (2 * UPPER * FORE), -1, 1));
    v.multiplyScalar(1 / len);
    // Where the elbow goes: down, a little out and a little back.
    const pref = ik.p.set(side * 0.45, -1, -0.2);
    pref.addScaledVector(v, -pref.dot(v));
    if (pref.lengthSq() < 1e-8) pref.set(side, 0, 0).addScaledVector(v, -v.x * side);
    pref.normalize();
    // The chain as built (pivot space): hand direction and its elbow side.
    const a1 = ik.a1.set(0, -UPPER - FORE * Math.cos(bend), FORE * Math.sin(bend)).normalize();
    const a2 = ik.a2.set(0, -1, 0).addScaledVector(a1, a1.y).normalize();
    const a3 = ik.a3.crossVectors(a1, a2);
    const b3 = ik.b3.crossVectors(v, pref);
    ik.mA.makeBasis(a1, a2, a3).transpose();
    ik.mB.makeBasis(v, pref, b3).multiply(ik.mA);
    ik.q.setFromRotationMatrix(ik.mB);
    arm.quaternion.slerp(ik.q, Math.min(1, weight));
    fore.rotation.x = foreRest + (-bend - foreRest) * Math.min(1, weight);
  }

  function armOf(parts, side) {
    return side > 0
      ? { arm: parts.armR, fore: parts.foreR, hand: parts.handR }
      : { arm: parts.armL, fore: parts.foreL, hand: parts.handL };
  }

  /** +1 when a world point (or direction, with dir=true) is on the figure's +x side. */
  function sideOf(parts, world, dir = false) {
    const body = parts.body;
    body.updateWorldMatrix(true, false);
    const p = dir
      ? _v.copy(world).applyQuaternion(body.getWorldQuaternion(_q).invert())
      : body.worldToLocal(_v.copy(world));
    return p.x >= 0 ? 1 : -1;
  }

  /** Where this seated man is looking, as a world direction (seats' smoothed pose). */
  function lookDir(playerId, npc, out) {
    const entry = seats.entryOf?.(playerId);
    if (entry && Number.isFinite(entry.yaw)) {
      const pitch = entry.pitch ?? 0;
      out.set(Math.sin(entry.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(entry.yaw) * Math.cos(pitch));
      return out.applyQuaternion(npc.group.getWorldQuaternion(_q)).normalize();
    }
    return out.copy(Z).applyQuaternion(npc.parts.head.getWorldQuaternion(_q)).normalize();
  }

  function mouthOf(parts, out) {
    return parts.head.localToWorld(out.set(MOUTH[0], MOUTH[1], MOUTH[2]));
  }
  function forwardOf(obj, out) {
    return out.copy(Z).applyQuaternion(obj.getWorldQuaternion(_q)).normalize();
  }
  /** The figure's own +x, as a world direction. */
  function sideAxis(parts, out) {
    return out.set(1, 0, 0).applyQuaternion(parts.body.getWorldQuaternion(_q)).normalize();
  }

  /** A finger standing out of a hand socket: the figure's hand is a mitten. */
  function addFinger(fore, hand, { x = 0, length = 0.075, thick = 0.02 } = {}) {
    const skinMesh = fore.children.find((c) => c.name === 'hand');
    const mat = skinMesh?.material ?? new THREE.MeshStandardMaterial({ color: 0xc9936d, roughness: 0.85 });
    const finger = new THREE.Mesh(new THREE.BoxGeometry(thick, length, thick), mat);
    finger.name = 'deadgiveaway.actions.finger';
    // The mitten is 0.115 long down the forearm; the finger leaves its end.
    finger.position.set(x, -0.0575 - length / 2 + 0.006, 0.012);
    hand.add(finger);
    return finger;
  }

  /* ---------------- first-person rig ---------------- */

  const fp = new THREE.Group();
  fp.name = 'deadgiveaway.actions.first-person';
  camera.add(fp);

  /* The flat's held-drink mount, so the lift and tilt are exactly the
   * apartment's (poseHeldDrink). What sits in it here is a whiskey tumbler:
   * the glass on the felt in front of you, picked up. */
  const drinks = makeHeldDrinks();
  drinks.group.position.set(0.26, -0.30, -0.42);
  fp.add(drinks.group);
  const drinkRest = drinks.group.position.clone();
  const tumbler = new THREE.Group();
  tumbler.name = 'deadgiveaway.actions.held-tumbler';
  tumbler.visible = false;
  drinks.group.add(tumbler);
  const heldRig = { can: tumbler, bottle: drinks.bottle, jug: drinks.jug };
  let tumblerSource = null;

  function fillTumbler() {
    const seat = seats.seatOf(selfId());
    const source = seat === null ? null : world.glasses?.at?.(seat) ?? null;
    if (source === tumblerSource && tumbler.children.length) return source;
    tumbler.clear();
    tumblerSource = source;
    if (source) {
      const copy = source.clone(true);
      copy.position.set(0, -0.045, 0);
      copy.rotation.set(0, 0, 0);
      copy.scale.copy(source.getWorldScale(new THREE.Vector3()));
      copy.visible = true;
      tumbler.add(copy);
    } else {
      tumbler.add(tumblerMesh());
    }
    return source;
  }

  function tumblerMesh() {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.037, 0.033, 0.085, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8e2e6, transparent: true, opacity: 0.35, roughness: 0.08, side: THREE.DoubleSide }),
    );
    const whisky = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.031, 0.03, 16),
      new THREE.MeshStandardMaterial({ color: 0x9a5418, transparent: true, opacity: 0.85, roughness: 0.2 }),
    );
    whisky.position.y = -0.026;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.033, 0.033, 0.012, 16),
      new THREE.MeshStandardMaterial({ color: 0xd8e2e6, transparent: true, opacity: 0.6, roughness: 0.08 }),
    );
    base.position.y = -0.044;
    g.add(glass, whisky, base);
    return g;
  }

  const cig = makeHeldCigarette();
  cig.group.position.set(0.09, -0.19, -0.34);
  cig.group.visible = false;
  fp.add(cig.group);
  const cigRest = cig.group.position.clone();

  /* Hands, which nothing in the shared props has: a sleeve and a fist at the
   * bottom right of the view, one with the index finger out, one with the
   * middle finger up. */
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9936d, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.9 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0xe4d8c2, roughness: 0.85 });
  const fpBox = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };

  const hand = new THREE.Group();
  hand.name = 'deadgiveaway.actions.point-hand';
  hand.add(
    fpBox(0.075, 0.075, 0.34, sleeve, 0, 0, 0.17),
    fpBox(0.078, 0.078, 0.02, cuff, 0, 0, 0),
    fpBox(0.07, 0.05, 0.08, skin, 0, -0.005, -0.045),
    fpBox(0.018, 0.018, 0.075, skin, -0.018, 0.008, -0.12),
    fpBox(0.016, 0.016, 0.04, skin, -0.038, 0.012, -0.06),
  );
  hand.position.set(0.24, -0.34, -0.42);
  hand.visible = false;
  fp.add(hand);
  const handRest = hand.position.clone();

  /* The finger, seen from behind your own hand: forearm up out of the bottom
   * of the view, knuckles toward the table, one finger standing. */
  const bird = new THREE.Group();
  bird.name = 'deadgiveaway.actions.finger-hand';
  bird.add(
    fpBox(0.078, 0.36, 0.078, sleeve, 0, -0.24, 0.02),
    fpBox(0.082, 0.022, 0.082, cuff, 0, -0.06, 0.02),
    fpBox(0.076, 0.07, 0.056, skin, 0, 0, 0),
    fpBox(0.022, 0.092, 0.022, skin, 0, 0.078, -0.004),        // the middle finger
    fpBox(0.019, 0.026, 0.03, skin, -0.024, 0.044, -0.014),   // curled fingers
    fpBox(0.019, 0.026, 0.03, skin, 0.024, 0.044, -0.014),
    fpBox(0.017, 0.022, 0.03, skin, 0.046, 0.034, -0.012),
    fpBox(0.05, 0.018, 0.02, skin, -0.012, 0.012, -0.036),     // thumb across
  );
  bird.position.set(0.14, -0.5, -0.5);
  bird.visible = false;
  fp.add(bird);

  /* ---------------- third-person props ---------------- */

  /* A cigar, mouth end on +z and the ember on -z. Before the 2026-10-19
   * playtest the ember was on +z, and with the forearm raised the hand
   * socket's +z points back at the face -- owner: "the smoking animation from
   * another persons perspective they are smoking it backwards". Now it is
   * turned every frame so the mouth end meets the lips. */
  function makeCigar() {
    const g = new THREE.Group();
    g.name = 'deadgiveaway.actions.cigar';
    const leaf = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0095, 0.0095, 0.13, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.9 }),
    );
    leaf.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0099, 0.0099, 0.012, 10),
      new THREE.MeshStandardMaterial({ color: 0xb08a2a, roughness: 0.5, metalness: 0.4 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.035;
    const ash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0094, 0.0094, 0.012, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1 }),
    );
    ash.rotation.x = Math.PI / 2;
    ash.position.z = -0.071;
    const ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0098, 0.0098, 0.005, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff5a1e, emissiveIntensity: 2.0, roughness: 1 }),
    );
    ember.rotation.x = Math.PI / 2;
    ember.position.z = -0.0655;
    g.add(leaf, band, ash, ember);
    g.userData.ember = ember;
    g.userData.ash = ash;
    return g;
  }

  /* A spit: one glob stretched along its flight, flecks of foam on it, and a
   * few droplets strung out behind. Owner: "the spit needs an animation of
   * spit". */
  const spitMat = new THREE.MeshStandardMaterial({
    color: 0xe6e4d6, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.82,
    emissive: new THREE.Color(0x2a2a26),
  });
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.6, transparent: true, opacity: 0.9 });
  const spitGeo = new THREE.SphereGeometry(1, 10, 8);

  function makeGlob() {
    const g = new THREE.Group();
    g.name = 'deadgiveaway.actions.spit';
    const body = new THREE.Mesh(spitGeo, spitMat);
    body.scale.set(0.014, 0.012, 0.026);
    g.add(body);
    for (const [x, y, z, r] of [[0.006, 0.006, 0.008, 0.0045], [-0.007, 0.004, -0.004, 0.004], [0.002, -0.007, 0.012, 0.0035]]) {
      const fleck = new THREE.Mesh(spitGeo, foamMat);
      fleck.position.set(x, y, z);
      fleck.scale.setScalar(r);
      g.add(fleck);
    }
    return g;
  }

  function spittoonPoint(out) {
    const s = anchors.spittoon ?? anchors.table;
    return out.set(s.x, (s.y ?? 0.32), s.z);
  }

  /**
   * Launch a spit from `from` (world). `targetId` is the player it was aimed
   * at: it lands on his face and stays there a second, or -- when it is you
   * -- on your screen. No target: the spittoon, as before.
   */
  function launchSpit(from, targetId = null) {
    const me = Boolean(targetId) && targetId === selfId();
    const head = !me && targetId ? seats.headOf(targetId)?.head ?? null : null;
    const anchor = head ? new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.15 + (Math.random() - 0.5) * 0.05, FACE_Z) : null;
    const s = { from: from.clone(), to: new THREE.Vector3(), head, anchor, me, t: 0, landed: false };
    s.end = () => {
      if (s.me) {
        camera.getWorldPosition(s.to);
        camera.getWorldDirection(_dir);
        return s.to.addScaledVector(_dir, 0.22);
      }
      if (s.head) return s.head.localToWorld(s.to.copy(s.anchor));
      return spittoonPoint(s.to);
    };
    const d = s.from.distanceTo(s.end());
    s.dur = clamp(d * 0.26, 0.32, 0.9);
    s.arc = targetId ? Math.max(0.05, d * 0.07) : Math.max(0.25, d * 0.22);
    s.glob = makeGlob();
    scene.add(s.glob);
    s.drops = [0.006, 0.0045, 0.0035].map((r) => {
      const drop = new THREE.Mesh(spitGeo, spitMat);
      drop.name = 'deadgiveaway.actions.spit.drop';
      drop.scale.setScalar(r);
      drop.visible = false;
      scene.add(drop);
      return drop;
    });
    s.glob.position.copy(s.from);
    spits.push(s);
    return s;
  }

  function pathAt(s, k, out) {
    out.lerpVectors(s.from, s.to, k);
    out.y += Math.sin(k * Math.PI) * s.arc;
    return out;
  }

  /** The glob arrived: a splat on his face, the splat on your screen, or nothing (spittoon). */
  function landSpit(s) {
    s.glob.removeFromParent();
    for (const drop of s.drops) drop.removeFromParent();
    s.landed = true;
    s.landedAt = s.t;
    if (s.head?.parent) {
      const m = spitMat.clone();
      const splat = new THREE.Group();
      splat.name = 'deadgiveaway.actions.spit.splat';
      splat.position.copy(s.anchor);
      const blob = new THREE.Mesh(spitGeo, m);
      blob.scale.set(0.026, 0.02, 0.006);
      const fleckA = new THREE.Mesh(spitGeo, m);
      fleckA.position.set(0.024, 0.012, 0);
      fleckA.scale.set(0.007, 0.006, 0.004);
      const fleckB = new THREE.Mesh(spitGeo, m);
      fleckB.position.set(-0.02, -0.006, 0);
      fleckB.scale.set(0.006, 0.005, 0.004);
      const drip = new THREE.Mesh(spitGeo, m);
      drip.scale.set(0.007, 0.012, 0.005);
      splat.add(blob, fleckA, fleckB, drip);
      s.head.add(splat);
      s.splat = { group: splat, drip, mat: m };
      play(CUE.splat, s.head.getWorldPosition(new THREE.Vector3()), { volume: 0.9 });
    } else if (s.me) {
      splatYourView();
      play(CUE.splat, null, { volume: 1.0 });
    }
  }

  function updateSpits(dt) {
    for (let i = spits.length - 1; i >= 0; i--) {
      const s = spits[i];
      s.t += dt;
      if (!s.landed) {
        const k = Math.min(1, s.t / s.dur);
        s.end();
        pathAt(s, k, s.glob.position);
        pathAt(s, Math.min(1, k + 0.04), _v2);
        if (_v2.distanceToSquared(s.glob.position) > 1e-8) s.glob.lookAt(_v2);
        s.drops.forEach((drop, j) => {
          const kj = k - 0.05 * (j + 1);
          drop.visible = kj > 0;
          if (kj > 0) pathAt(s, kj, drop.position);
        });
        if (k >= 1) landSpit(s);
        continue;
      }
      const age = s.t - s.landedAt;
      if (s.splat) {
        // It runs: the drip slides down the face and stretches as it goes.
        const run = Math.min(1, age / (SPIT_STICK + SPIT_FADE));
        s.splat.drip.position.set(0.004, -0.012 - run * 0.06, 0.001);
        s.splat.drip.scale.set(0.006, 0.012 + run * 0.018, 0.005);
        s.splat.mat.opacity = 0.82 * (1 - seg(age, SPIT_STICK, SPIT_STICK + SPIT_FADE));
      }
      if (age >= SPIT_STICK + SPIT_FADE || (!s.splat && !s.me)) {
        s.splat?.group.removeFromParent();
        s.splat?.mat.dispose();
        spits.splice(i, 1);
      }
    }
  }

  /* ---------------- your view, spat on ----------------
   * A splat across the screen and the whole view a little soft for about a
   * second, then it runs and goes. Self-contained: the element styles itself,
   * so the scene's CSS does not need to know about it. A backdrop blur over
   * the whole canvas is what the stylesheet forbids for panels (a third of a
   * software-composited frame); for one second, on a spit, it is the point. */
  let splatEl = null;
  let splatGlob = null;
  let splatTimer = null;
  const SPLAT_INK = 'rgba(236,234,220,';
  const SPLAT_BG = [
    `radial-gradient(ellipse 10% 13% at 47% 45%, ${SPLAT_INK}0.6) 0 50%, ${SPLAT_INK}0.18) 78%, ${SPLAT_INK}0) 100%)`,
    `radial-gradient(circle at 56% 39%, ${SPLAT_INK}0.5) 0 2.2%, ${SPLAT_INK}0) 3.2%)`,
    `radial-gradient(circle at 39% 52%, ${SPLAT_INK}0.45) 0 1.7%, ${SPLAT_INK}0) 2.6%)`,
    `radial-gradient(circle at 53% 57%, ${SPLAT_INK}0.42) 0 1.2%, ${SPLAT_INK}0) 2%)`,
    `radial-gradient(circle at 42% 36%, ${SPLAT_INK}0.38) 0 0.9%, ${SPLAT_INK}0) 1.6%)`,
    `radial-gradient(ellipse 1.6% 8% at 48.5% 58%, ${SPLAT_INK}0.42) 0 55%, ${SPLAT_INK}0) 100%)`,
    `radial-gradient(ellipse 70% 70% at 47% 46%, ${SPLAT_INK}0.12), ${SPLAT_INK}0) 72%)`,
  ].join(', ');

  function splatYourView() {
    if (typeof document === 'undefined' || !document.body) return;
    if (!splatEl) {
      splatEl = document.createElement('div');
      splatEl.className = 'dg-spit-splat';
      splatEl.setAttribute('aria-hidden', 'true');
      Object.assign(splatEl.style, {
        position: 'fixed', inset: '0', zIndex: '26', pointerEvents: 'none', opacity: '0',
        backdropFilter: 'blur(2.5px)', webkitBackdropFilter: 'blur(2.5px)',
      });
      splatGlob = document.createElement('div');
      Object.assign(splatGlob.style, { position: 'absolute', inset: '-10%', background: SPLAT_BG });
      splatEl.append(splatGlob);
      document.body.append(splatEl);
    }
    clearTimeout(splatTimer);
    const dx = ((Math.random() - 0.5) * 14).toFixed(1);
    const dy = ((Math.random() - 0.5) * 10).toFixed(1);
    splatEl.style.transition = 'none';
    splatEl.style.opacity = '1';
    splatGlob.style.transition = 'none';
    splatGlob.style.transform = `translate(${dx}%, ${dy}%)`;
    void splatEl.offsetWidth;
    splatGlob.style.transition = `transform ${SPIT_STICK + SPIT_FADE}s ease-in`;
    splatGlob.style.transform = `translate(${dx}%, ${Number(dy) + 3}%) scaleY(1.06)`;
    splatTimer = setTimeout(() => {
      splatEl.style.transition = `opacity ${SPIT_FADE}s ease-out`;
      splatEl.style.opacity = '0';
    }, SPIT_STICK * 1000);
  }

  /* ---------------- sound ---------------- */

  function play(name, position = null, opts = {}) {
    if (!audio?.ready) return;
    try {
      audio.play(name, { volume: 0.7, ...opts, ...(position ? { position, ref: 1.0, maxDist: 12 } : {}) });
    } catch { /* a missing cue falls back to the synth; nothing to do here */ }
  }

  function seatPosition(playerId, height = 1.15) {
    const seat = seats.seatOf(playerId);
    const info = anchors.seats.find((s) => s.seat === seat);
    if (!info) return null;
    return { x: info.x, y: (info.sitY ?? 0.5) + height - 0.5, z: info.z };
  }

  /* ---------------- local ---------------- */

  const raycaster = new THREE.Raycaster();
  const CENTRE = new THREE.Vector2(0, 0);
  /** The man under the crosshair (seats' pick proxies), or null. */
  function aimedPlayer() {
    if (typeof seats.pick !== 'function') return null;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(CENTRE, camera);
    return seats.pick(raycaster);
  }

  function perform(kind) {
    if (!ACTIONS.includes(kind) || local.has(kind)) return false;
    const state = { t: 0, dur: ACTION_DURATION[kind], fired: new Set() };
    if (kind === 'drink' || kind === 'raise') {
      state.source = fillTumbler();
      if (state.source) state.source.visible = false;
    }
    if (kind === 'spit') state.target = aimedPlayer();
    local.set(kind, state);
    send(kind, state.target ? { target: state.target } : undefined);
    return true;
  }

  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _e = new THREE.Euler(0, 0, 0, 'YXZ');

  function wispFrom(obj) {
    if (!smoke?.wisp) return;
    obj.getWorldPosition(_v3);
    smoke.wisp(_v3);
  }

  function updateLocal(dt) {
    /* The look offsets a gesture adds to the camera. Applied after the
     * Player has written the camera this frame, and never fed back into the
     * Player, so the pose the table receives is where you are looking. */
    let nodX = 0;
    let shakeY = 0;
    let leanZ = 0;
    for (const [kind, s] of local) {
      s.t += dt;
      const t = s.t;
      const k = t / s.dur;
      const once = (tag, fn) => { if (!s.fired.has(tag)) { s.fired.add(tag); fn(); } };
      switch (kind) {
        case 'drink': {
          /* Up off the felt (it comes in from below the view), to the lips,
           * the sip with the head going back, and down again. */
          tumbler.visible = true;
          const up = seg(t, 0, 0.6) * (1 - seg(t, 1.55, 2.25));
          const sip = seg(t, 0.62, 0.95) * (1 - seg(t, 1.3, 1.6));
          drinks.group.position.set(drinkRest.x + 0.03 * (1 - up), drinkRest.y - 0.16 * (1 - up), drinkRest.z - 0.04 * (1 - up));
          poseHeldDrink(heldRig, 'can', up * 0.5 + sip * 0.28);
          nodX -= sip * 0.13;
          if (t > 0.7) once('sip', () => play(CUE.sip));
          break;
        }
        case 'raise': {
          tumbler.visible = true;
          const e = lift(k, 0.25, 0.7);
          tumbler.position.set(-0.06 * e, 0.24 * e, -0.05 * e);
          tumbler.rotation.set(0.12 * e, 0, 0);
          break;
        }
        case 'smoke': {
          /* Up into the mouth, the draw (ember bright, head down a touch),
           * out and down, the exhale with the chin up, a tap of the ash, gone. */
          cig.group.visible = true;
          const inMouth = seg(t, 0, 0.45) * (1 - seg(t, 1.3, 1.65));
          const shown = seg(t, 0, 0.3) * (1 - seg(t, 2.8, 3.25));
          const draw = bell((t - 0.5) / 0.8);
          const tap = t > 2.25 && t < 2.6 ? Math.sin((t - 2.25) * 45) * 0.006 : 0;
          cig.ember.material.emissiveIntensity = 1.8 + draw * 3.4;
          cig.glow.intensity = 0.3 + draw * 1.5;
          cig.group.position.set(
            cigRest.x + 0.07 * (1 - inMouth),
            cigRest.y - 0.09 * (1 - inMouth) - 0.12 * (1 - shown) + tap,
            cigRest.z - 0.03 * (1 - inMouth),
          );
          nodX += draw * 0.03;
          nodX -= bell((t - 1.7) / 0.9) * 0.07;
          once('drag', () => play(CUE.drag));
          if (t > 1.75) {
            once('exhale', () => {
              play(CUE.exhale, null, { volume: 0.55 });
              if (smoke) {
                camera.getWorldPosition(_v);
                camera.getWorldDirection(_dir);
                _dir.y += 0.25;
                emitCigaretteExhale(smoke, _v, _dir.normalize());
              }
            });
          }
          s.wisp = (s.wisp ?? 0) - dt;
          if (s.wisp <= 0 && draw < 0.2 && shown > 0.5) { s.wisp = 0.16; wispFrom(cig.ember); }
          break;
        }
        case 'spit': {
          nodX += bell(Math.min(1, k / 0.4)) * 0.12;
          if (k > 0.22) {
            once('spit', () => {
              camera.getWorldPosition(_v);
              camera.getWorldDirection(_dir);
              _v.addScaledVector(_dir, 0.18);
              _v.y -= 0.12;
              launchSpit(_v, s.target);
              play(CUE.spit, null, { volume: 0.6 });
            });
          }
          break;
        }
        case 'point': {
          hand.visible = true;
          const e = lift(k, 0.25, 0.75);
          const jab = bell((k - 0.34) / 0.14) + bell((k - 0.52) / 0.14);
          hand.position.set(handRest.x - 0.08 * e, handRest.y + 0.18 * e, handRest.z - 0.06 * e - 0.05 * jab);
          hand.rotation.set(0.15 * e, 0.22 * e, 0);
          break;
        }
        case 'finger': {
          bird.visible = true;
          const e = lift(k, 0.2, 0.8);
          bird.position.set(0.14 - 0.03 * e, -0.5 + 0.36 * e, -0.5 + 0.04 * e);
          bird.rotation.set(-0.12 * e, 0.1, Math.sin(t * 15) * 0.05 * bell((k - 0.15) / 0.7));
          break;
        }
        case 'lean':
          leanZ += lift(k, 0.3, 0.75) * 0.14;
          nodX -= lift(k, 0.3, 0.75) * 0.06;
          break;
        case 'shake':
          shakeY += Math.sin(s.t * 15) * 0.09 * bell(k);
          break;
        case 'nod':
          nodX += Math.max(0, Math.sin(s.t * 11)) * 0.13 * bell(k);
          break;
        default:
          break;
      }
      if (s.t >= s.dur) {
        local.delete(kind);
        if (kind === 'drink' || kind === 'raise') {
          tumbler.visible = false;
          tumbler.position.set(0, 0, 0);
          tumbler.rotation.set(0, 0, 0);
          drinks.group.position.copy(drinkRest);
          if (s.source) s.source.visible = true;
          if (kind === 'drink') play(CUE.setDown, null, { volume: 0.45 });
        }
        if (kind === 'smoke') { cig.group.visible = false; cig.group.position.copy(cigRest); }
        if (kind === 'point') hand.visible = false;
        if (kind === 'finger') bird.visible = false;
      }
    }
    if (nodX || shakeY || leanZ) {
      _e.set(-nodX, shakeY, 0, 'YXZ');
      _q.setFromEuler(_e);
      camera.quaternion.multiply(_q);
      if (leanZ) {
        _v.set(0, 0, leanZ).applyQuaternion(camera.quaternion);
        _v.y = 0;
        camera.position.add(_v);
      }
    }
  }

  /* ---------------- remote ---------------- */

  function remote(playerId, kind, { target = null } = {}) {
    if (!ACTIONS.includes(kind) || !playerId || playerId === selfId()) return false;
    const npc = seats.npcOf(playerId);
    if (!npc) return false;
    let mine = remotes.get(playerId);
    if (!mine) { mine = new Map(); remotes.set(playerId, mine); }
    if (mine.has(kind)) return false;
    const p = npc.parts;
    const s = { t: 0, dur: ACTION_DURATION[kind], fired: new Set(), npc, target: typeof target === 'string' ? target : null };
    if (kind === 'drink') takeGlass(playerId, s);
    if (kind === 'raise') borrowGlass(playerId, s);
    if (kind === 'smoke') {
      /* The cigar is in the hand the glass is not by. */
      const glass = world.glasses?.at?.(seats.seatOf(playerId));
      s.side = glass ? -sideOf(p, glass.getWorldPosition(_v)) : 1;
      Object.assign(s, armOf(p, s.side));
      s.foreRest = s.fore.rotation.x;
      s.cigar = makeCigar();
      s.cigar.position.set(0, -0.05, 0.02);
      s.hand.add(s.cigar);
    }
    if (kind === 'point' || kind === 'finger') {
      lookDir(playerId, npc, _dir);
      s.side = sideOf(p, _dir, true);
      Object.assign(s, armOf(p, s.side));
      s.foreRest = s.fore.rotation.x;
      s.finger = kind === 'finger'
        ? addFinger(s.fore, s.hand, { length: 0.088, thick: 0.022 })
        : addFinger(s.fore, s.hand, { x: -0.024 * s.side, length: 0.075 });
    }
    mine.set(kind, s);
    return true;
  }

  /**
   * The drink: his own glass on the felt, by the arm on its side. The glass
   * is not re-parented; it is placed in the world at his hand every frame, so
   * it stays upright until he tips it, whatever the arm is doing.
   */
  function takeGlass(playerId, s) {
    const p = s.npc.parts;
    const glass = world.glasses?.at?.(seats.seatOf(playerId));
    s.side = glass ? sideOf(p, glass.getWorldPosition(_v)) : 1;
    Object.assign(s, armOf(p, s.side));
    s.foreRest = s.fore.rotation.x;
    if (!glass || glass.userData.dgBorrowed) return;
    glass.userData.dgBorrowed = true;
    s.cup = glass;
    s.cupPos = glass.position.clone();
    s.cupQuat = glass.quaternion.clone();
    s.cupHome = glass.getWorldPosition(new THREE.Vector3());
    s.cupHomeQ = glass.getWorldQuaternion(new THREE.Quaternion());
  }

  function putGlassBack(s) {
    const g = s.cup;
    if (!g) return;
    g.position.copy(s.cupPos);
    g.quaternion.copy(s.cupQuat);
    g.userData.dgBorrowed = false;
    s.cup = null;
  }

  /** Lift the world's glass at his place into his hand for the toast. */
  function borrowGlass(playerId, s) {
    const seat = seats.seatOf(playerId);
    const glass = seat === null ? null : world.glasses?.at?.(seat);
    if (!glass || glass.userData.dgBorrowed) return;
    glass.userData.dgBorrowed = true;
    s.glass = glass;
    s.glassParent = glass.parent;
    s.glassPos = glass.position.clone();
    s.glassQuat = glass.quaternion.clone();
    s.glassScale = glass.scale.clone();
    const ws = glass.getWorldScale(new THREE.Vector3());
    const hand = s.npc.parts.handR;
    hand.updateWorldMatrix(true, false);
    const hs = hand.getWorldScale(new THREE.Vector3());
    hand.add(glass);
    glass.position.set(0, -0.02, 0.03);
    glass.quaternion.identity();
    glass.scale.set(ws.x / (hs.x || 1), ws.y / (hs.y || 1), ws.z / (hs.z || 1));
  }

  function returnGlass(s) {
    const g = s.glass;
    if (!g) return;
    (s.glassParent ?? scene).add(g);
    g.position.copy(s.glassPos);
    g.quaternion.copy(s.glassQuat);
    g.scale.copy(s.glassScale);
    g.userData.dgBorrowed = false;
    s.glass = null;
  }

  /** Point the cigar's mouth end (+z) along a world direction. */
  function aimCigar(cigar, dirWorld) {
    cigar.parent.getWorldQuaternion(_q2).invert();
    _q.setFromUnitVectors(Z, dirWorld);
    cigar.quaternion.copy(_q2.multiply(_q));
  }

  function updateRemote(dt) {
    for (const [playerId, mine] of remotes) {
      for (const [kind, s] of mine) {
        s.t += dt;
        const t = s.t;
        const k = Math.min(1, t / s.dur);
        const p = s.npc.parts;
        const once = (tag, fn) => { if (!s.fired.has(tag)) { s.fired.add(tag); fn(); } };
        const at = () => seatPosition(playerId);
        switch (kind) {
          case 'drink': {
            /* Reach for it (0-0.5), up to the mouth (0.5-1.0), the sip with
             * his head going back (1.0-1.5), down (1.5-2.0), let go. */
            const reach = seg(t, 0, 0.5) * (1 - seg(t, 1.95, 2.4));
            const toMouth = seg(t, 0.5, 1.0) * (1 - seg(t, 1.5, 1.95));
            const sip = seg(t, 0.95, 1.2) * (1 - seg(t, 1.4, 1.6));
            /* The glass goes to his mouth, rim at the lips; the hand holds it
             * from the side, so neither the fist nor the glass hides the face
             * it is lifted to (the first pass put the fist on the mouth). */
            const home = s.cupHome ?? p.body.localToWorld(_v.set(0.2 * s.side, 1.2, 0.45));
            const glassAt = _v2.copy(home);
            mouthOf(p, _v3);
            forwardOf(p.head, _dir);
            _v3.addScaledVector(_dir, 0.06);
            _v3.y -= 0.05;
            glassAt.lerp(_v3, toMouth);
            const grip = sideAxis(p, _v3).multiplyScalar(0.06 * s.side);
            const target = _v.copy(glassAt).add(grip);
            target.y += 0.015;
            // He leans in for it: the glass is at the far edge of a seated reach.
            p.body.rotation.x = reach * (1 - toMouth) * 0.12;
            aimArm(s.arm, s.fore, target, s.side, reach, s.foreRest);
            p.head.rotation.x -= sip * 0.24 - seg(t, 0.2, 0.5) * (1 - seg(t, 0.6, 0.9)) * 0.08;
            if (s.cup) {
              const held = t > 0.5 && t < 2.0;
              if (held) {
                s.hand.getWorldPosition(_v);
                _v.sub(grip);
                _v.y -= 0.015;
                const grab = seg(t, 0.5, 0.6) * (1 - seg(t, 1.9, 2.0));
                _v.lerpVectors(s.cupHome, _v, grab);
                s.cup.parent.worldToLocal(_v);
                s.cup.position.copy(_v);
                // Tip the top toward his face: the up axis turns toward it.
                p.head.getWorldPosition(_v2);
                _dir.copy(_v2).sub(s.cupHome).setY(0).normalize();
                _v2.crossVectors(UP, _dir).normalize();
                _q.setFromAxisAngle(_v2, (toMouth * 0.25 + sip * 0.85) * 1);
                _q.multiply(s.cupHomeQ);
                s.cup.parent.getWorldQuaternion(_q2).invert();
                s.cup.quaternion.copy(_q2.multiply(_q));
              } else if (t >= 2.0 && s.cup) {
                putGlassBack(s);
                once('set', () => play(CUE.setDown, at(), { volume: 0.35 }));
              }
            }
            if (t > 1.0) once('sip', () => play(CUE.sip, at(), { volume: 0.55 }));
            break;
          }
          case 'raise': {
            const e = lift(k, 0.25, 0.7);
            p.armR.rotation.x = -0.5 - e * 1.6;
            p.armR.rotation.z = 0.1 * e;
            p.foreR.rotation.x = -0.8 + e * 0.35;
            break;
          }
          case 'smoke': {
            /* To the lips (0-0.6), the draw (0.6-1.4), down to the chest
             * (1.4-1.85), the exhale with his chin up (1.85-2.7), a tap of
             * the ash (2.3-2.65), the hand back to the felt. */
            const raise = seg(t, 0, 0.5) * (1 - seg(t, 2.7, 3.3));
            const lips = seg(t, 0.15, 0.6) * (1 - seg(t, 1.4, 1.85));
            const draw = bell((t - 0.6) / 0.8);
            const exhale = bell((t - 1.8) / 0.95);
            const tap = t > 2.3 && t < 2.65 ? Math.sin((t - 2.3) * 40) * 0.018 : 0;
            mouthOf(p, _v3);
            forwardOf(p.head, _dir);
            /* The hand beside the mouth and a little below, so the cigar runs
             * from the fingers into the lips and the fist never covers the
             * face. The rest is chest height: body-local 1.32 is just under
             * the 1.44 shoulder pivot; 1.1 put the hand under the felt. */
            const mouthFront = _v2.copy(_v3).addScaledVector(_dir, 0.09);
            mouthFront.addScaledVector(sideAxis(p, _v), 0.075 * s.side);
            mouthFront.y -= 0.035;
            const chest = p.body.localToWorld(_v.set(0.15 * s.side, 1.32, 0.36));
            chest.y += tap;
            const target = chest.lerp(mouthFront, lips);
            aimArm(s.arm, s.fore, target, s.side, raise, s.foreRest);
            p.head.rotation.x += draw * 0.05 - exhale * 0.3;
            if (s.cigar) {
              /* Mouth end at the lips while it is in the mouth; held low, the
               * ember turns out and up, away from him. */
              s.cigar.getWorldPosition(_v);
              const toLips = _v3.sub(_v).normalize();
              forwardOf(p.body, _dir);
              _dir.negate();
              _dir.y = -0.35;
              _dir.normalize();
              toLips.lerp(_dir, 1 - lips).normalize();
              aimCigar(s.cigar, toLips);
              const ember = s.cigar.userData.ember;
              ember.material.emissiveIntensity = 1.6 + draw * 3.6;
              s.wisp = (s.wisp ?? 0) - dt;
              if (s.wisp <= 0 && draw < 0.25) { s.wisp = 0.16; wispFrom(ember); }
            }
            once('drag', () => play(CUE.drag, at(), { volume: 0.45 }));
            if (t > 1.95) {
              once('exhale', () => {
                play(CUE.exhale, at(), { volume: 0.4 });
                if (smoke) {
                  mouthOf(p, _v);
                  forwardOf(p.head, _dir);
                  _dir.y += 0.35;
                  _dir.normalize();
                  /* emitCigaretteExhale pushes the plume 0.55 m out to clear
                   * a first-person lens; from across a table it should leave
                   * the lips, so start it that far back. */
                  _v.addScaledVector(_dir, -0.5);
                  emitCigaretteExhale(smoke, _v, _dir);
                }
              });
            }
            break;
          }
          case 'spit': {
            const e = bell(Math.min(1, k / 0.45));
            p.head.rotation.x += e * 0.22;
            p.body.rotation.x = e * 0.1;
            if (k > 0.25) {
              once('spit', () => {
                mouthOf(p, _v);
                forwardOf(p.head, _dir);
                _v.addScaledVector(_dir, 0.06);
                launchSpit(_v, s.target);
                play(CUE.spit, at(), { volume: 0.5 });
              });
            }
            break;
          }
          case 'point': {
            /* Along where he is looking, with two little jabs. */
            const e = lift(k, 0.22, 0.8);
            const jab = bell((k - 0.32) / 0.13) + bell((k - 0.5) / 0.13);
            lookDir(playerId, s.npc, _dir);
            s.arm.getWorldPosition(_v);
            _v.addScaledVector(_dir, 0.66 - jab * 0.12);
            aimArm(s.arm, s.fore, _v, s.side, e, s.foreRest);
            p.body.rotation.x = e * 0.06;
            p.head.rotation.x += jab * 0.05;
            break;
          }
          case 'finger': {
            /* Upper arm out toward whoever he is looking at, forearm up, the
             * finger standing, a small shake on it. */
            const e = lift(k, 0.2, 0.82);
            lookDir(playerId, s.npc, _dir);
            s.arm.getWorldPosition(_v);
            _v.addScaledVector(_dir, 0.27);
            _v.y += 0.31;
            _v2.crossVectors(_dir, UP).normalize();
            _v.addScaledVector(_v2, Math.sin(t * 15) * 0.012 * bell((k - 0.15) / 0.7));
            aimArm(s.arm, s.fore, _v, s.side, e, s.foreRest);
            p.head.rotation.x -= e * 0.08;
            break;
          }
          case 'lean': {
            const e = lift(k, 0.3, 0.75);
            p.body.rotation.x = -0.2 * e;
            p.head.rotation.x += 0.08 * e;
            p.armL.rotation.x = -0.5 + e * 0.25;
            p.armR.rotation.x = -0.5 + e * 0.25;
            break;
          }
          case 'shake':
            p.head.rotation.y += Math.sin(s.t * 15) * 0.32 * bell(k);
            break;
          case 'nod':
            p.head.rotation.x += Math.max(0, Math.sin(s.t * 11)) * 0.28 * bell(k);
            break;
          default:
            break;
        }
        if (s.t >= s.dur) {
          if (s.glass) returnGlass(s);
          if (s.cup) putGlassBack(s);
          if (s.fore && Number.isFinite(s.foreRest)) s.fore.rotation.x = s.foreRest;
          s.cigar?.removeFromParent();
          s.finger?.removeFromParent();
          mine.delete(kind);
        }
      }
      if (!mine.size) remotes.delete(playerId);
    }
  }

  /** Called every frame AFTER seats.update (which rewrites the rest pose) and after the Player writes the camera. */
  function update(dt) {
    time += dt;
    updateLocal(dt);
    updateRemote(dt);
    updateSpits(dt);
  }

  /** A player left: drop whatever he was holding. */
  function forget(playerId) {
    const mine = remotes.get(playerId);
    if (!mine) return;
    for (const s of mine.values()) {
      returnGlass(s);
      putGlassBack(s);
      s.cigar?.removeFromParent();
      s.finger?.removeFromParent();
    }
    remotes.delete(playerId);
  }

  return {
    perform,
    remote,
    update,
    forget,
    keyFor: (kind) => keys[kind] ?? null,
    kindForKey: (code) => ACTIONS.find((kind) => keys[kind] === code) ?? null,
    playing: (kind, playerId = null) => (playerId ? remotes.get(playerId)?.has(kind) ?? false : local.has(kind)),
    /** Spits in the air or stuck to somebody (verifier). */
    spits: () => spits.map((s) => ({ landed: s.landed, me: s.me, onHead: Boolean(s.splat) })),
    get time() { return time; },
  };
}
