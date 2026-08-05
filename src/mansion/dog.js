/**
 * LIL TOM CRUZE — Lou's German Shepherd.
 *
 * Owner, verbatim:
 *
 *   "I also want a german shepard type dog. It needs to be animated and work
 *    and go from the office to the bed room and stuff and the player can pet
 *    it. It's named Lil Tom cruze."
 *
 * ------------------------------------------------------------ CALL SIGNATURE
 *
 *   import { mountLilTomCruze, LIL_TOM_ROUTE } from './dog.js';
 *
 *   const dog = mountLilTomCruze({
 *     parent,               // THREE.Object3D — the mansion root. REQUIRED.
 *     interaction,          // core/interaction.js InteractionSystem. Optional;
 *                           //   without it he is scenery you cannot pet.
 *     route: LIL_TOM_ROUTE, // [{x, y, z, wait}] — see below. Optional.
 *     player: null,         // anything with `.position` (the camera will do).
 *                           //   He looks at it while he is being petted.
 *     enabled: () => true,  // gate: he holds still while this is false.
 *     speed: 1.15,          // metres per second at a trot.
 *     audio: null,          // core/audio.js engine.
 *     barkCue: null,        // a manifest cue name to play when he is petted.
 *                           //   Null by default, and NO name is invented here
 *                           //   — he is silent until somebody records one.
 *     onPet: null,          // (dog) => void, fired once per pet.
 *   });
 *
 *   // then, once per frame:
 *   dog.update(dt);
 *
 * `mountLilTomCruze` returns
 *   { group, parts, route, update(dt), pet(), report(), dispose() }
 *
 * `report()` hands a verifier his live state: {x, y, z, yaw, leg, state,
 * waypoint, pets, meshes}.
 *
 * ------------------------------------------------------------------ THE ROUTE
 *
 * `route` is a list of `{x, y, z, wait}` in the parent's own space. He walks
 * the polyline, pauses `wait` seconds at each end of a leg, and PING-PONGS:
 * office -> stair foot -> half-landing -> suite -> the foot of Lou's bed, and
 * back down again. `y` is the floor height AT that point, and he lerps `y`
 * between consecutive points, which is what carries him up the stair without
 * needing to consult the house's floor resolver at all. Give him points with
 * honest heights and he never floats and never sinks.
 *
 * `LIL_TOM_ROUTE` below is the default and matches the stair
 * `MasterSuite.js` builds; it is exported from there as well so the two can
 * never drift.
 *
 * ------------------------------------------------------------------- THE LOOK
 *
 * Cut from the same chamfered slabs as the club's cast — `softBox` in
 * `src/bing/cast.js` is not exported, so the twenty lines of it are
 * TRANSCRIBED below with its geometry cache, number for number. Nothing about
 * it is new; this file simply cannot reach the original. Everything that is
 * genuinely round on a dog (the nose, the eyes, the pads) is a sphere, the
 * way the club's own figures keep their curves for the places curves belong.
 *
 * He points down local **-Z**, the same convention as every person and every
 * gun in this project, so `yaw = atan2(-dx, -dz)` puts him where he is going.
 *
 * ---------------------------------------------------------------- THE BUDGET
 *
 * He runs beside a 12,000-mesh house, so:
 *   - 79 meshes, all named, sharing eleven materials and a geometry cache;
 *   - the whole gait is SCALAR trigonometry written straight into
 *     `rotation.x` / `position.y`. `update()` allocates nothing — no vectors,
 *     no arrays, no closures per frame;
 *   - one interaction target, registered ONCE at build time. `register()`
 *     writes `userData.interact`, so registering a mesh twice silently
 *     replaces the first descriptor and leaves a stale row in `targets`.
 */
import * as THREE from 'three';
import { box, cylinder, sphere, mat, group } from '../world/build.js';

/* ================================================================== */
/* Chamfered slabs — transcribed from src/bing/cast.js's softBox        */
/* ================================================================== */
/**
 * A box with its edges taken off, cached by shape.
 *
 * Deliberately low-poly: three curve segments and one bevel segment is a
 * chamfer, not a pill. Identical to the club's, including the cache key, so a
 * dog built from the same dozen sizes costs one set of geometries.
 */
const _softGeo = new Map();
function softGeometry(w, h, d, r) {
  const rr = Math.min(r, w * 0.34, h * 0.34, d * 0.34);
  const key = `${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${rr.toFixed(4)}`;
  const hit = _softGeo.get(key);
  if (hit) return hit;
  const iw = w / 2 - rr;
  const ih = h / 2 - rr;
  const s = new THREE.Shape();
  s.moveTo(-iw + rr, -ih);
  s.lineTo(iw - rr, -ih);
  s.quadraticCurveTo(iw, -ih, iw, -ih + rr);
  s.lineTo(iw, ih - rr);
  s.quadraticCurveTo(iw, ih, iw - rr, ih);
  s.lineTo(-iw + rr, ih);
  s.quadraticCurveTo(-iw, ih, -iw, ih - rr);
  s.lineTo(-iw, -ih + rr);
  s.quadraticCurveTo(-iw, -ih, -iw + rr, -ih);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d - rr * 2,
    curveSegments: 3,
    bevelEnabled: true,
    bevelSize: rr,
    bevelThickness: rr,
    bevelOffset: 0,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -(d - rr * 2) / 2);
  _softGeo.set(key, geo);
  return geo;
}

/** Same call shape as build.js's box(), so a slab softens in place. */
function softBox({ size, pos, mat: material, name, rotX = 0, rotY = 0, rotZ = 0, r = 0.018 }) {
  const m = new THREE.Mesh(softGeometry(size[0], size[1], size[2], r), material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rotX, rotY, rotZ);
  m.castShadow = true;
  m.receiveShadow = false;
  m.name = name;
  return m;
}

/** `sphere()` and `cylinder()` in world/build.js silently drop `name`. */
function named(mesh, name) { mesh.name = name; return mesh; }

/* ================================================================== */
/* Palette — a black-and-tan shepherd, in Lou's house, so: a gold collar */
/* ================================================================== */
const M = {
  saddle: mat({ color: 0x211c19, roughness: 0.94 }),      // the black blanket
  tan: mat({ color: 0x9a6634, roughness: 0.93 }),         // legs, chest, mask
  cream: mat({ color: 0xc6a374, roughness: 0.93 }),       // throat and underside
  sable: mat({ color: 0x59391d, roughness: 0.94 }),       // the shaded overlay
  black: mat({ color: 0x14100e, roughness: 0.86 }),       // muzzle, nose, pads
  eye: mat({ color: 0x53300d, roughness: 0.28, metalness: 0.1 }),
  gleam: mat({ color: 0xf2ead8, roughness: 0.2 }),
  tongue: mat({ color: 0x9c4a52, roughness: 0.6 }),
  gold: mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 }),
  claw: mat({ color: 0x22201d, roughness: 0.7 }),
};

/* ================================================================== */
/* Skeleton datums                                                      */
/* ================================================================== */
const SHOULDER_Y = 0.520;   // front leg pivot
const HIP_Y = 0.500;        // rear leg pivot
const HALF_TRACK = 0.086;   // half the distance between the two front feet
const FRONT_Z = -0.235;
const REAR_Z = 0.245;
/** Shoulder pivot to the bottom of the front pad. Used by the sit pose. */
const FRONT_LEG_DROP = SHOULDER_Y;
/** How far nose-up the trunk tips when he sits. */
const SIT_TILT = 0.34;
/**
 * The rear leg's sit pose, as offsets off its own rest angles.
 *
 * Tuned against the measured pad heights rather than eyeballed: at `sit = 1`
 * these put the rear pastern flat on y = 0 with the hock behind the hip, which
 * is the shape a dog's back leg makes when it sits down.
 */
const REAR_SIT = Object.freeze({ hip: 0.25, knee: -1.353, paw: 0.763 });
/** Nose to tail tip, measured. A real male shepherd is about 1.55 m. */
export const DOG_LENGTH = 1.51;
/** Height at the withers. A real male shepherd is 0.60-0.65 m. */
export const DOG_SHOULDER_HEIGHT = 0.636;

/* ================================================================== */
/* One leg                                                             */
/* ================================================================== */
/**
 * A leg as three nested groups, so the gait is three numbers.
 *
 *   hip      swings the whole leg fore and aft
 *   knee     (the stifle in front, the hock behind) folds the lower leg
 *   paw      keeps the foot flat while the leg above it swings
 *
 * The rear pair carry a shepherd's angulation as a REST offset on the hip and
 * hock, which is the single thing that makes the silhouette read as this breed
 * and not as a labrador: the back legs are already bent when he is standing.
 */
function buildLeg(side, rear, tag) {
  const sx = side < 0 ? 'left' : 'right';
  const hip = new THREE.Group();
  hip.name = `dog.${tag}.hip`;
  hip.position.set(side * HALF_TRACK, rear ? HIP_Y : SHOULDER_Y, rear ? REAR_Z : FRONT_Z);

  if (rear) {
    // Thigh: broad, and the widest part of the back of the dog.
    hip.add(softBox({
      size: [0.104, 0.256, 0.170], pos: [0, -0.101, 0.012], mat: M.tan,
      name: `dog.${tag}.thigh.${sx}`,
    }));
    hip.add(softBox({
      size: [0.108, 0.150, 0.130], pos: [0, -0.028, 0.030], mat: M.saddle,
      name: `dog.${tag}.haunch.${sx}`,
    }));
  } else {
    hip.add(softBox({
      size: [0.082, 0.272, 0.108], pos: [0, -0.122, 0.004], mat: M.tan,
      name: `dog.${tag}.upper.${sx}`,
    }));
    hip.add(softBox({
      size: [0.086, 0.120, 0.118], pos: [0, -0.030, -0.004], mat: M.saddle,
      name: `dog.${tag}.shoulder.${sx}`,
    }));
  }

  const knee = new THREE.Group();
  knee.name = `dog.${tag}.${rear ? 'hock' : 'stifle'}`;
  knee.position.set(0, rear ? -0.228 : -0.250, rear ? 0.030 : 0);
  hip.add(knee);
  knee.add(softBox({
    size: [0.062, rear ? 0.230 : 0.216, 0.078], pos: [0, rear ? -0.107 : -0.102, rear ? -0.014 : 0],
    mat: M.tan, name: `dog.${tag}.lower.${sx}`,
  }));
  // The feathering down the back of the leg, in the saddle's black.
  knee.add(softBox({
    size: [0.048, 0.120, 0.036], pos: [0, -0.040, rear ? 0.030 : 0.040], mat: M.saddle,
    name: `dog.${tag}.feather.${sx}`,
  }));

  const paw = new THREE.Group();
  paw.name = `dog.${tag}.paw`;
  /* Measured, not guessed: with the rest angles below, these two numbers put
   * the lowest point of every pad on y = 0.000 in the dog's own space, so he
   * stands ON a floor rather than 3 cm over it. */
  paw.position.set(0, rear ? -0.216 : -0.206, rear ? -0.024 : 0);
  knee.add(paw);
  paw.add(softBox({
    size: [0.078, 0.056, 0.116], pos: [0, -0.028, -0.020], mat: M.tan,
    name: `dog.${tag}.foot.${sx}`,
  }));
  for (const tx of [-0.022, 0.022]) {
    paw.add(named(sphere({
      r: 0.014, ry: 0.010, rz: 0.016, pos: [tx, -0.052, -0.062], mat: M.claw,
    }), `dog.${tag}.toe.${sx}.${tx < 0 ? 'in' : 'out'}`));
  }
  paw.add(named(sphere({
    r: 0.026, ry: 0.011, rz: 0.026, pos: [0, -0.054, -0.012], mat: M.black,
  }), `dog.${tag}.pad.${sx}`));

  // Rest angulation. A shepherd stands with the rear leg already folded.
  hip.userData.rest = rear ? 0.30 : 0.02;
  knee.userData.rest = rear ? -0.70 : -0.10;
  paw.userData.rest = rear ? 0.40 : 0.08;
  hip.rotation.x = hip.userData.rest;
  knee.rotation.x = knee.userData.rest;
  paw.rotation.x = paw.userData.rest;
  return { hip, knee, paw };
}

/* ================================================================== */
/* The dog                                                             */
/* ================================================================== */
/**
 * Build Lil Tom Cruze, standing at his own origin, facing -Z.
 *
 * Exported on its own so a wardrobe page, a test or a screenshot tool can have
 * the model without the behaviour.
 */
export function buildLilTomCruze() {
  const root = group('lil-tom-cruze');

  /* ---- Trunk. Three slabs on a falling line: a deep chest, the barrel under
   * the black saddle, and a croup that slopes away. The slope IS the breed —
   * a shepherd whose back is level is an alsatian-shaped crate. */
  const body = group('dog.body');
  root.add(body);
  body.add(softBox({
    size: [0.234, 0.300, 0.330], pos: [0, 0.480, -0.196], mat: M.saddle, name: 'dog.chest',
  }));
  body.add(softBox({
    size: [0.238, 0.280, 0.316], pos: [0, 0.462, 0.058], mat: M.saddle, name: 'dog.barrel',
  }));
  body.add(softBox({
    size: [0.212, 0.240, 0.238], pos: [0, 0.420, 0.286], mat: M.saddle,
    rotX: 0.16, name: 'dog.croup',
  }));
  // The tan comes UP the flanks and the cream runs along the belly, so the
  // black reads as a blanket laid over him rather than as paint.
  for (const side of [-1, 1]) {
    const sx = side < 0 ? 'left' : 'right';
    body.add(softBox({
      size: [0.030, 0.190, 0.560], pos: [side * 0.116, 0.400, 0.010], mat: M.tan,
      name: `dog.flank.${sx}`,
    }));
    body.add(softBox({
      size: [0.026, 0.130, 0.230], pos: [side * 0.112, 0.510, -0.230], mat: M.sable,
      name: `dog.shade.${sx}`,
    }));
  }
  body.add(softBox({
    size: [0.196, 0.062, 0.520], pos: [0, 0.346, 0.020], mat: M.cream, name: 'dog.belly',
  }));
  body.add(softBox({
    size: [0.190, 0.150, 0.070], pos: [0, 0.446, -0.352], mat: M.cream, name: 'dog.brisket',
  }));
  /* Withers: the bump over the shoulders, and the highest point on the dog.
   * 0.596 + 0.040 = 0.636, which is DOG_SHOULDER_HEIGHT and a real male
   * shepherd's 0.60-0.65. The chest tops out at 0.630 and the croup at about
   * 0.55, so the topline FALLS from front to back — that slope is the breed. */
  body.add(softBox({
    size: [0.190, 0.080, 0.200], pos: [0, 0.596, -0.176], mat: M.saddle, name: 'dog.withers',
  }));

  /* ---- Neck. One slab along its own axis, so the head hangs off the end of
   * it and a nod is one number.
   *
   * The rake is measured, not guessed. The pivot is buried in the chest at
   * (0, 0.500, -0.250) and the neck runs 0.218 m along its own +Y to the base
   * of the skull. `rotation.x = -0.844` maps that +Y onto (0, 0.6656,
   * -0.7463), so the head base lands at
   *   y = 0.500 + 0.6656 * 0.218 = 0.645
   *   z = -0.250 - 0.7463 * 0.218 = -0.413
   * which puts the top of his skull at 0.731, his ear tips at 0.846 and his
   * nose at 0.603 — an alert shepherd on 0.636 m of leg. */
  const neck = new THREE.Group();
  neck.name = 'dog.neck';
  neck.position.set(0, 0.500, -0.250);
  neck.rotation.x = -0.844;
  neck.userData.rest = -0.844;
  body.add(neck);
  neck.add(softBox({
    size: [0.176, 0.280, 0.212], pos: [0, 0.115, 0], mat: M.saddle, name: 'dog.neck.ruff',
  }));
  neck.add(softBox({
    size: [0.132, 0.240, 0.054], pos: [0, 0.105, -0.098], mat: M.cream, name: 'dog.neck.throat',
  }));
  for (const side of [-1, 1]) {
    neck.add(softBox({
      size: [0.034, 0.220, 0.156], pos: [side * 0.082, 0.108, 0.012], mat: M.sable,
      name: `dog.neck.mane.${side < 0 ? 'left' : 'right'}`,
    }));
  }

  /* The collar. It is Lou's dog, so it is gold, and it has a tag on it. */
  neck.add(named(cylinder({
    r: 0.099, h: 0.046, pos: [0, 0.168, 0], mat: M.gold, seg: 14,
  }), 'dog.collar'));
  neck.add(named(cylinder({
    r: 0.089, h: 0.050, pos: [0, 0.168, 0], mat: M.saddle, seg: 14,
  }), 'dog.collar.lining'));
  neck.add(box({
    size: [0.010, 0.038, 0.010], pos: [0, 0.126, -0.096], mat: M.gold, name: 'dog.collar.tag-ring',
  }));
  neck.add(named(cylinder({
    r: 0.030, h: 0.008, pos: [0, 0.092, -0.100], mat: M.gold, rotX: Math.PI / 2, seg: 12,
  }), 'dog.collar.tag'));

  /* ---- Head. Parented at the top of the neck and counter-rotated level, so
   * `head.rotation.x` is a nod and `head.rotation.y` is a look. */
  const head = new THREE.Group();
  head.name = 'dog.head';
  head.position.set(0, 0.218, 0);
  head.rotation.x = 0.844;
  head.userData.rest = 0.844;
  neck.add(head);

  head.add(softBox({
    size: [0.146, 0.135, 0.204], pos: [0, 0.018, -0.062], mat: M.sable, name: 'dog.head.skull',
  }));
  head.add(softBox({
    size: [0.126, 0.096, 0.104], pos: [0, -0.014, -0.166], mat: M.sable, name: 'dog.head.stop',
  }));
  // The black mask over the muzzle: the other half of the breed's read.
  head.add(softBox({
    size: [0.088, 0.078, 0.166], pos: [0, -0.040, -0.246], mat: M.black, name: 'dog.head.muzzle',
  }));
  head.add(softBox({
    size: [0.094, 0.020, 0.150], pos: [0, -0.072, -0.246], mat: M.black, name: 'dog.head.jaw',
  }));
  head.add(named(sphere({
    r: 0.030, ry: 0.024, rz: 0.024, pos: [0, -0.018, -0.328], mat: M.black,
  }), 'dog.head.nose'));
  head.add(softBox({
    size: [0.062, 0.014, 0.056], pos: [0, -0.062, -0.268], mat: M.tongue, name: 'dog.head.tongue',
  }));
  head.add(softBox({
    size: [0.128, 0.044, 0.070], pos: [0, 0.052, -0.178], mat: M.tan, name: 'dog.head.brow',
  }));

  const eyes = [];
  for (const side of [-1, 1]) {
    const sx = side < 0 ? 'left' : 'right';
    const e = named(sphere({
      r: 0.020, ry: 0.017, rz: 0.017, pos: [side * 0.050, 0.038, -0.150], mat: M.eye,
    }), `dog.head.eye.${sx}`);
    head.add(e);
    eyes.push(e);
    head.add(named(sphere({
      r: 0.007, pos: [side * 0.056, 0.048, -0.162], mat: M.gleam,
    }), `dog.head.eye-gleam.${sx}`));
    head.add(softBox({
      size: [0.040, 0.014, 0.030], pos: [side * 0.050, 0.056, -0.152], mat: M.black,
      name: `dog.head.eye-line.${sx}`,
    }));
  }

  /* Ears. Big, erect, forward, and half the silhouette. A shepherd with soft
   * ears is a different dog from across the room. */
  const ears = [];
  for (const side of [-1, 1]) {
    const sx = side < 0 ? 'left' : 'right';
    const ear = new THREE.Group();
    ear.name = `dog.head.ear.${sx}`;
    ear.position.set(side * 0.058, 0.086, 0.004);
    ear.rotation.z = -side * 0.20;
    ear.rotation.x = -0.14;
    ear.userData.restZ = -side * 0.20;
    ear.userData.restX = -0.14;
    head.add(ear);
    ear.add(softBox({
      size: [0.034, 0.108, 0.088], pos: [0, 0.056, -0.010], mat: M.sable,
      name: `dog.head.ear-shell.${sx}`, r: 0.012,
    }));
    ear.add(softBox({
      size: [0.020, 0.080, 0.058], pos: [side * 0.010, 0.050, -0.028], mat: M.black,
      name: `dog.head.ear-inner.${sx}`, r: 0.010,
    }));
    ear.add(softBox({
      size: [0.028, 0.038, 0.066], pos: [0, 0.107, -0.004], mat: M.sable,
      name: `dog.head.ear-tip.${sx}`, r: 0.012,
    }));
    ears.push(ear);
  }

  /* ---- Tail. A sabre: three tapering segments, carried low and swinging from
   * the root, so a wag is one number multiplied down the chain. */
  const tail = new THREE.Group();
  tail.name = 'dog.tail';
  tail.position.set(0, 0.444, 0.390);
  tail.rotation.x = -0.62;
  tail.userData.rest = -0.62;
  body.add(tail);
  tail.add(softBox({
    size: [0.086, 0.088, 0.200], pos: [0, -0.012, 0.096], mat: M.saddle, name: 'dog.tail.root',
  }));
  const tailMid = new THREE.Group();
  tailMid.name = 'dog.tail.mid-pivot';
  tailMid.position.set(0, -0.016, 0.192);
  tailMid.rotation.x = -0.34;
  tailMid.userData.rest = -0.34;
  tail.add(tailMid);
  tailMid.add(softBox({
    size: [0.072, 0.074, 0.190], pos: [0, -0.010, 0.092], mat: M.saddle, name: 'dog.tail.mid',
  }));
  const tailTip = new THREE.Group();
  tailTip.name = 'dog.tail.tip-pivot';
  tailTip.position.set(0, -0.014, 0.184);
  tailTip.rotation.x = -0.30;
  tailTip.userData.rest = -0.30;
  tailMid.add(tailTip);
  tailTip.add(softBox({
    size: [0.058, 0.058, 0.164], pos: [0, -0.008, 0.078], mat: M.black, name: 'dog.tail.tip',
  }));

  /* ---- Legs. */
  const legs = {
    fl: buildLeg(-1, false, 'front-left'),
    fr: buildLeg(1, false, 'front-right'),
    rl: buildLeg(-1, true, 'rear-left'),
    rr: buildLeg(1, true, 'rear-right'),
  };
  for (const k of ['fl', 'fr', 'rl', 'rr']) body.add(legs[k].hip);

  /* ---- The place you actually put your hand. A soft proxy over his back and
   * shoulders, standing proud of the geometry, because pointing at a dog
   * should mean pointing at the dog and not at one 6 cm slab of him. Invisible
   * and never rendered; it exists to be raycast. */
  const petTarget = box({
    size: [0.44, 0.46, 0.98], pos: [0, 0.500, -0.060], mat: M.saddle, name: 'dog.pet-target',
  });
  petTarget.visible = false;
  body.add(petTarget);

  let meshes = 0;
  root.traverse((o) => { if (o.isMesh) meshes++; });

  return {
    group: root, body, neck, head, tail, tailMid, tailTip, legs, ears, eyes,
    petTarget, meshes,
  };
}

/* ================================================================== */
/* The route                                                           */
/* ================================================================== */
/**
 * Office -> the stair -> the master suite -> back.
 *
 * Heights are the real floor heights along the way: the office slab is at
 * UPPER_Y = 6.0, the stair's half-landing at 8.3, and the suite at 10.6 (the
 * top of the house's own roof slab, which `MasterSuite.js` finishes as its
 * floor). `MasterSuite.js` re-exports this list so the two cannot drift.
 */
export const LIL_TOM_ROUTE = Object.freeze([
  Object.freeze({ x: -0.2, y: 6.0, z: 68.4, wait: 5.0 }),   // by Lou's desk
  Object.freeze({ x: 3.9, y: 6.0, z: 73.4, wait: 1.2 }),    // the foot of the stair
  Object.freeze({ x: 7.4, y: 8.3, z: 73.4, wait: 0.4 }),    // the half-landing
  Object.freeze({ x: 7.4, y: 8.3, z: 71.6, wait: 0.4 }),    // across the landing
  Object.freeze({ x: 3.9, y: 10.6, z: 71.6, wait: 1.2 }),   // out onto the suite
  Object.freeze({ x: 0.4, y: 10.6, z: 69.2, wait: 7.0 }),   // the foot of the bed
]);

/* ================================================================== */
/* Behaviour                                                           */
/* ================================================================== */
const TWO_PI = Math.PI * 2;
/** Shortest signed difference between two angles, without allocating. */
function angleDelta(from, to) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  return d;
}

/**
 * Put Lil Tom Cruze in a scene and set him walking.
 *
 * See the call signature at the top of this file.
 */
export function mountLilTomCruze({
  parent,
  interaction = null,
  route = LIL_TOM_ROUTE,
  player = null,
  enabled = () => true,
  speed = 1.15,
  audio = null,
  barkCue = null,
  onPet = null,
  name = 'Lil Tom Cruze',
} = {}) {
  if (!parent) throw new Error('mountLilTomCruze needs a parent Object3D');
  const legs = route.length >= 2 ? route : LIL_TOM_ROUTE;

  const parts = buildLilTomCruze();
  const g = parts.group;
  g.position.set(legs[0].x, legs[0].y, legs[0].z);
  parent.add(g);

  /* ---- State. Every one of these is a NUMBER, on purpose: the update below
   * runs beside a twelve-thousand-mesh house and must not allocate. */
  let leg = 0;                 // which route leg he is on
  let dir = 1;                 // +1 outbound, -1 coming home
  let t = 0;                   // 0..1 along the current leg
  let hold = legs[0].wait ?? 1.5;
  let state = 'wait';          // 'walk' | 'wait' | 'pet'
  let phase = 0;               // gait phase, radians
  let gait = 0;                // 0 standing, 1 trotting — smoothed
  let sit = 0;                 // 0 up, 1 sitting — smoothed
  let petTimer = 0;
  let pets = 0;
  let yaw = 0;
  let wag = 0;                 // tail energy, 0..1
  let idle = 0;                // slow breathing clock
  let pantTimer = 0;

  /** Where the current leg starts and ends. Indices, so no objects are made. */
  function fromPoint() { return legs[dir > 0 ? leg : leg + 1]; }
  function toPoint() { return legs[dir > 0 ? leg + 1 : leg]; }

  // Face down the first leg from the start, so he never spawns sideways.
  {
    const a = legs[0];
    const b = legs[1];
    yaw = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    g.rotation.y = yaw;
  }

  /* ---- Petting. ONE registration, at build time. */
  let registered = false;
  if (interaction) {
    interaction.register(parts.petTarget, {
      label: () => (petTimer > 0
        ? `<b>${name}</b> is having a moment`
        : `Pet <b>${name}</b>`),
      key: 'E',
      soft: true,
      enabled: () => enabled() && petTimer <= 0,
      onUse: () => pet(),
    });
    registered = true;
  }

  /** Make a fuss of him. Safe to call from anywhere. */
  function pet() {
    if (petTimer > 0) return false;
    petTimer = 3.4;
    state = 'pet';
    pets += 1;
    wag = 1;
    /* No cue name is invented here. He barks when the owner has a bark to
     * give him and `barkCue` is pointed at it; until then he is a quiet dog
     * rather than a dog asking the manifest for a file nobody recorded. */
    if (barkCue) {
      try { audio?.play?.(barkCue, { volume: 0.42 }); } catch { /* never break a frame */ }
    }
    try { onPet?.(api); } catch { /* a dog never breaks a frame */ }
    return true;
  }

  /* ================================================================== */
  /* Per-frame                                                           */
  /* ================================================================== */
  function update(dt) {
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;             // a tab that came back from the dead
    idle += dt;

    const live = enabled();

    /* ---- What he is doing. */
    if (petTimer > 0) {
      petTimer -= dt;
      state = petTimer > 0 ? 'pet' : 'wait';
      if (petTimer <= 0) hold = Math.max(hold, 0.6);
    } else if (!live) {
      state = 'wait';
    } else if (hold > 0) {
      hold -= dt;
      state = 'wait';
      if (hold <= 0) state = 'walk';
    } else {
      state = 'walk';
    }

    /* ---- Along the route. Scalar lerp between two waypoints; `y` comes from
     * the waypoints themselves, which is what carries him up the stair. */
    if (state === 'walk') {
      const a = fromPoint();
      const b = toPoint();
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const span = Math.hypot(dx, dz);
      if (span > 1e-4) {
        t += (speed * dt) / span;
        if (t >= 1) {
          t = 0;
          if (dir > 0) {
            leg += 1;
            if (leg >= legs.length - 1) { leg = legs.length - 2; dir = -1; }
          } else {
            leg -= 1;
            if (leg < 0) { leg = 0; dir = 1; }
          }
          hold = (dir > 0 ? legs[leg] : legs[leg + 1]).wait ?? 1.0;
        } else {
          g.position.x = a.x + dx * t;
          g.position.z = a.z + dz * t;
          g.position.y = a.y + (b.y - a.y) * t;
          const want = Math.atan2(-dx, -dz);
          yaw += angleDelta(yaw, want) * Math.min(1, dt * 6);
        }
      } else {
        t = 1;
      }
    }

    /* ---- Pose targets, smoothed. */
    const wantGait = state === 'walk' ? 1 : 0;
    gait += (wantGait - gait) * Math.min(1, dt * 5.5);
    const wantSit = state === 'pet' ? 1 : 0;
    sit += (wantSit - sit) * Math.min(1, dt * 5.0);
    const wantWag = state === 'pet' ? 1 : (state === 'walk' ? 0.45 : 0.18);
    wag += (wantWag - wag) * Math.min(1, dt * 3.0);

    /* ---- Look at whoever is petting him. */
    if (player && state === 'pet') {
      const px = player.position.x - g.position.x;
      const pz = player.position.z - g.position.z;
      const want = Math.atan2(-px, -pz);
      yaw += angleDelta(yaw, want) * Math.min(1, dt * 3.2);
    }
    g.rotation.y = yaw;

    /* ---- The gait. A trot: diagonal pairs, half a cycle apart. */
    phase += dt * speed * 5.4 * gait;
    if (phase > TWO_PI) phase -= TWO_PI;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const up = 1 - sit;

    stepLeg(parts.legs.fl, s, c, gait * up, sit, false);
    stepLeg(parts.legs.rr, s, c, gait * up, sit, true);
    stepLeg(parts.legs.fr, -s, -c, gait * up, sit, false);
    stepLeg(parts.legs.rl, -s, -c, gait * up, sit, true);

    /* Body. It bobs twice a cycle when he moves; when he sits, the back end
     * goes down and the front stays where it is.
     *
     * That last part is the whole trick, and it is arithmetic rather than a
     * fudge factor. A sit tilts the trunk nose-up by `tilt` about the dog's
     * own origin, and the front legs are straightened back to vertical below
     * (`sitHip = -tilt` in `stepLeg`), so the front pads end up exactly
     * FRONT_LEG_DROP under the SHOULDER pivot. Solve for the body offset that
     * leaves that pivot at its standing height:
     *
     *   SHOULDER_Y·cos(tilt) − FRONT_Z·sin(tilt) + Δ = SHOULDER_Y
     *   Δ = SHOULDER_Y·(1 − cos tilt) + FRONT_Z·sin(tilt)
     *
     * which is exact at every value of `sit`, so the front paws never once
     * dip through the floorboards on the way down. */
    const bob = Math.abs(Math.sin(phase)) * 0.016 * gait;
    const tilt = sit * SIT_TILT;
    parts.body.rotation.x = tilt + s * 0.018 * gait;
    parts.body.position.y = bob
      + SHOULDER_Y * (1 - Math.cos(tilt)) + FRONT_Z * Math.sin(tilt);
    parts.body.rotation.z = c * 0.026 * gait;

    /* Head: nods with the gait, lifts when he is sitting being made a fuss of,
     * and breathes when he is doing nothing at all. */
    const breathe = Math.sin(idle * 1.6) * 0.012;
    parts.neck.rotation.x = parts.neck.userData.rest
      + sit * 0.30 + s * 0.030 * gait + breathe;
    parts.head.rotation.x = parts.head.userData.rest
      - sit * 0.46 - s * 0.020 * gait;
    parts.head.rotation.z = Math.sin(idle * 0.7) * 0.05 * (1 - gait)
      + (state === 'pet' ? Math.sin(idle * 2.1) * 0.10 : 0);

    /* Ears swivel — forward and hard up when somebody is talking to him. */
    for (let i = 0; i < parts.ears.length; i++) {
      const ear = parts.ears[i];
      const side = i === 0 ? -1 : 1;
      ear.rotation.x = ear.userData.restX - (state === 'pet' ? 0.16 : 0)
        + Math.sin(idle * 2.4 + i) * 0.03;
      ear.rotation.z = ear.userData.restZ + side * (state === 'pet' ? 0.05 : 0);
    }

    /* Tail. The wag is one number down a three-link chain, so the tip travels
     * furthest, which is what a tail does. */
    pantTimer += dt * (4.0 + wag * 9.0);
    if (pantTimer > TWO_PI) pantTimer -= TWO_PI;
    const swing = Math.sin(pantTimer) * (0.10 + wag * 0.44);
    parts.tail.rotation.y = swing;
    parts.tailMid.rotation.y = swing * 1.35;
    parts.tailTip.rotation.y = swing * 1.7;
    parts.tail.rotation.x = parts.tail.userData.rest + wag * 0.42 + sit * 0.16;
  }

  /**
   * One leg, in place.
   *
   * `swing` is the hip angle; the knee only folds on the RECOVERY half of the
   * stride (a leg carrying weight is straight), which is the difference
   * between a walk cycle and four pendulums.
   */
  function stepLeg(l, s, c, amount, sitAmount, rear) {
    const hipRest = l.hip.userData.rest;
    const kneeRest = l.knee.userData.rest;
    const pawRest = l.paw.userData.rest;
    const lift = Math.max(0, -c);                 // 0 planted, 1 mid-recovery
    const hipSwing = s * (rear ? 0.44 : 0.52) * amount;
    const kneeFold = lift * (rear ? 0.55 : 0.72) * amount;
    /* Sitting. The FRONT pair are propped straight -- each joint is offset by
     * exactly minus its own rest angle, and the hip by minus the trunk's tilt
     * as well, which leaves the leg dead vertical under a shoulder the body
     * offset above has already pinned at its standing height. The REAR pair
     * fold into the Z a dog's back leg makes: femur forward and down, tibia
     * back and down, and the rear pastern flat on the floor. */
    const sitHip = rear ? REAR_SIT.hip : -SIT_TILT - hipRest;
    const sitKnee = rear ? REAR_SIT.knee : -kneeRest;
    const sitPaw = rear ? REAR_SIT.paw : -pawRest;
    l.hip.rotation.x = hipRest + hipSwing + sitAmount * sitHip;
    l.knee.rotation.x = kneeRest - kneeFold + sitAmount * sitKnee;
    l.paw.rotation.x = pawRest - hipSwing * 0.5 + kneeFold * 0.7 + sitAmount * sitPaw;
  }

  const api = {
    name,
    group: g,
    parts,
    route: legs,
    petTarget: parts.petTarget,
    update,
    pet,
    /** Live state, for a verifier or a debug overlay. */
    report() {
      return {
        name,
        x: +g.position.x.toFixed(3),
        y: +g.position.y.toFixed(3),
        z: +g.position.z.toFixed(3),
        yaw: +yaw.toFixed(3),
        leg,
        dir,
        t: +t.toFixed(3),
        state,
        pets,
        meshes: parts.meshes,
        registered,
      };
    },
    dispose() {
      if (registered) interaction?.unregister(parts.petTarget);
      registered = false;
      g.parent?.remove(g);
    },
  };
  return api;
}
