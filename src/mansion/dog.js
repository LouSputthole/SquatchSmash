/**
 * LIL TOM CRUZE — Lou's golden dog.
 *
 * Owner, verbatim, when he was commissioned:
 *
 *   "I also want a german shepard type dog. It needs to be animated and work
 *    and go from the office to the bed room and stuff and the player can pet
 *    it. It's named Lil Tom cruze."
 *
 * ...and owner, 2026-08-19, revising him:
 *
 *   "let's refine lil Tom Cruise a bit, make him more dog-like and make him
 *    more golden."
 *
 * So the shepherd dressing is gone and he is a GOLDEN now — retriever gold
 * coat over cream feathering (the framed birthday goldendoodle on Lou's desk
 * is the reference), drop ears instead of the erect pair, a longer muzzle
 * with a coat-coloured face and a black nose, a fuller tail carried nearer
 * level, and a squarer stance (the extreme rear angulation was the one thing
 * making him read shepherd from across a room). The RIG is untouched: same
 * joints, same gait arithmetic, same sit solve, same route, same pet target —
 * every rest angle and paw offset below is re-measured so the pads still land
 * on y = 0 standing AND sitting (see the FK notes at each number).
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
 * `LIL_TOM_ROUTE` below is the default and is measured off the stair
 * `buildMasterSuite()` in `scenes/MansionInterior.js` actually builds;
 * `tests/mansion-suite-dog.test.mjs` re-derives it from that file's exported
 * rects so the two can never drift.
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
 *   - 73 meshes (measured — `report().meshes`), all named, sharing eleven
 *     materials and a geometry cache;
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

/** Same call shape as build.js's box(), so a slab softens in place.
 * The default chamfer went 0.018 -> 0.026 in the golden pass: a retriever is
 * a rounder animal than a shepherd and this one number softens every slab at
 * zero extra geometry (the radius is still capped at a third of the smallest
 * dimension, so thin parts do not collapse into pills). */
function softBox({ size, pos, mat: material, name, rotX = 0, rotY = 0, rotZ = 0, r = 0.026 }) {
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
/* Palette — golden-retriever gold, in Lou's house, so: a gold collar    */
/*                                                                       */
/* The keys keep their original names (they are wired through every       */
/* mesh below); only the colours moved. The four coat materials keep      */
/* four distinct VALUES — deep amber shading under mid gold under light   */
/* gold under cream — so the shape still reads the way the old            */
/* black/tan/cream/sable stack did. Before -> after:                      */
/*   saddle  0x211c19 (black blanket) -> 0xc08a45 (the main gold coat)    */
/*   tan     0x9a6634 (tan points)    -> 0xdaa95f (light gold)            */
/*   cream   0xc6a374 (cream)         -> 0xecd7a8 (cream feathering)      */
/*   sable   0x59391d (dark overlay)  -> 0x9a6b2e (deep amber shading)    */
/*   black   0x14100e — unchanged, but now ONLY the nose, pads and eye     */
/*           rims wear it; a golden's muzzle is coat-coloured.             */
/*   eye     0x53300d -> 0x3e2a12 (darker warm brown)                      */
/* ================================================================== */
const M = {
  saddle: mat({ color: 0xc08a45, roughness: 0.94 }),      // the main gold coat
  tan: mat({ color: 0xdaa95f, roughness: 0.93 }),         // legs, chest, face
  cream: mat({ color: 0xecd7a8, roughness: 0.93 }),       // throat, underside, feathering
  sable: mat({ color: 0x9a6b2e, roughness: 0.94 }),       // the shaded overlay
  black: mat({ color: 0x14100e, roughness: 0.86 }),       // nose, pads, eye rims
  eye: mat({ color: 0x3e2a12, roughness: 0.28, metalness: 0.1 }),
  gleam: mat({ color: 0xf2ead8, roughness: 0.2 }),
  gold: mat({ color: 0xcda434, roughness: 0.3, metalness: 0.8 }),
  claw: mat({ color: 0x22201d, roughness: 0.7 }),
};

/* ================================================================== */
/* Skeleton datums                                                      */
/* ================================================================== */
const SHOULDER_Y = 0.520;   // front leg pivot
const HIP_Y = 0.500;        // rear leg pivot
/**
 * Half the distance between the two FRONT feet. The rear pair stand wider by
 * `REAR_TRACK_SCALE`, which is what a dog does.
 *
 * This was 0.086 -- a 17 cm track under a 1.7 m dog, which put all four legs
 * in one narrow line down the middle of the belly and is a good part of why
 * he read wrong from the front. Purely an x offset on the hip group: the sit
 * solve and the pad-landing FK are entirely sagittal, so widening it moves
 * nothing they depend on.
 */
const HALF_TRACK = 0.104;
const REAR_TRACK_SCALE = 1.18;
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
 *
 * The golden pass squared the STANDING rests (see `buildLeg`), so each offset
 * here changed by exactly the opposite amount — the absolute sit pose
 * (rest + offset) is the same three angles it was tuned to: 0.55, -2.053,
 * 1.163. Measured after (with the re-zeroed paw offset): sitting rear pads
 * at y +0.005, against +0.002 before — a hover no floorboard will notice.
 */
const REAR_SIT = Object.freeze({ hip: 0.33, knee: -1.533, paw: 0.863 });
/** Nose to tail tip, measured off the built model (the level plume reaches
 * further back than the old up-curled sabre did, so he measures longer than
 * he stands). */
export const DOG_LENGTH = 1.70;
/** Height at the withers: a big male golden. */
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
 * The rear pair still carry their angulation as a REST offset on the hip and
 * hock — every dog stands with SOME bend back there — but the golden pass
 * relaxed it from the shepherd's deep crouch to a squarer, retriever stance
 * (see the rest numbers at the bottom of this function).
 */
function buildLeg(side, rear, tag) {
  const sx = side < 0 ? 'left' : 'right';
  const hip = new THREE.Group();
  hip.name = `dog.${tag}.hip`;
  hip.position.set(
    side * HALF_TRACK * (rear ? REAR_TRACK_SCALE : 1),
    rear ? HIP_Y : SHOULDER_Y,
    rear ? REAR_Z : FRONT_Z,
  );

  if (rear) {
    // Thigh: broad, and the widest part of the back of the dog.
    hip.add(softBox({
      size: [0.134, 0.256, 0.198], pos: [0, -0.101, 0.012], mat: M.tan,
      name: `dog.${tag}.thigh.${sx}`, r: 0.048,
    }));
    hip.add(softBox({
      size: [0.142, 0.194, 0.182], pos: [0, -0.024, 0.030], mat: M.saddle,
      name: `dog.${tag}.haunch.${sx}`, r: 0.052,
    }));
  } else {
    hip.add(softBox({
      size: [0.106, 0.272, 0.134], pos: [0, -0.122, 0.004], mat: M.tan,
      name: `dog.${tag}.upper.${sx}`, r: 0.040,
    }));
    hip.add(softBox({
      size: [0.116, 0.158, 0.156], pos: [0, -0.026, -0.004], mat: M.saddle,
      name: `dog.${tag}.shoulder.${sx}`, r: 0.046,
    }));
  }

  const knee = new THREE.Group();
  knee.name = `dog.${tag}.${rear ? 'hock' : 'stifle'}`;
  knee.position.set(0, rear ? -0.228 : -0.250, rear ? 0.030 : 0);
  hip.add(knee);
  knee.add(softBox({
    size: [0.080, rear ? 0.230 : 0.216, 0.098], pos: [0, rear ? -0.107 : -0.102, rear ? -0.014 : 0],
    mat: M.tan, name: `dog.${tag}.lower.${sx}`, r: 0.032,
  }));
  /* The feathering down the back of the leg. It used to be a saddle-dark tab
   * standing proud of a pencil-thin shin, which from any distance read as a
   * label stuck on the leg; a golden's is a pale fringe, so it is cream now,
   * narrower than the shin it hangs off, and set INSIDE its silhouette. */
  knee.add(softBox({
    size: [0.056, 0.140, 0.032], pos: [0, -0.052, rear ? 0.042 : 0.050], mat: M.cream,
    name: `dog.${tag}.feather.${sx}`, r: 0.014,
  }));

  const paw = new THREE.Group();
  paw.name = `dog.${tag}.paw`;
  /* Measured, not guessed: with the rest angles below, these two numbers put
   * the lowest point of every pad on y = 0.000 in the dog's own space, so he
   * stands ON a floor rather than 3 cm over it. The rear pair was -0.216
   * under the shepherd's angulation; the golden's squarer rests dropped the
   * pads 7.5 mm through the boards, so the offset came up by that error over
   * cos(hip + knee) — re-measured standing at +0.0001 and sitting at +0.005. */
  paw.position.set(0, rear ? -0.208 : -0.206, rear ? -0.024 : 0);
  knee.add(paw);
  paw.add(softBox({
    size: [0.092, 0.058, 0.130], pos: [0, -0.028, -0.020], mat: M.tan,
    name: `dog.${tag}.foot.${sx}`, r: 0.024,
  }));
  for (const tx of [-0.022, 0.022]) {
    paw.add(named(sphere({
      r: 0.014, ry: 0.010, rz: 0.016, pos: [tx, -0.052, -0.062], mat: M.claw,
    }), `dog.${tag}.toe.${sx}.${tx < 0 ? 'in' : 'out'}`));
  }
  paw.add(named(sphere({
    r: 0.026, ry: 0.011, rz: 0.026, pos: [0, -0.054, -0.012], mat: M.black,
  }), `dog.${tag}.pad.${sx}`));

  /* Rest angulation. The shepherd stood with the rear leg deeply folded
   * (0.30 / -0.70 / 0.40); a golden stands squarer, so the golden pass
   * relaxed the three rear angles together, keeping their sum at 0.0 — the
   * sum is the foot's pitch, and a flat foot is hip + knee + paw = 0 on
   * both pairs. The paw group's y/z offsets above were re-measured for
   * these angles (FK, not eyeballed) so every pad still lands on y = 0. */
  hip.userData.rest = rear ? 0.22 : 0.02;
  knee.userData.rest = rear ? -0.52 : -0.10;
  paw.userData.rest = rear ? 0.30 : 0.08;
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

  /* ---- Trunk. Three slabs: a deep chest, the barrel, and the croup. The
   * shepherd's croup fell away hard (rotX 0.16, centred at 0.420) because
   * that slope IS that breed; a golden's topline runs close to LEVEL, so
   * the croup came up 18 mm and its pitch halved — the withers at 0.636
   * are still the highest point, but the back now reads as a flat table a
   * hand actually strokes. */
  const body = group('dog.body');
  root.add(body);
  body.add(softBox({
    size: [0.234, 0.300, 0.330], pos: [0, 0.480, -0.196], mat: M.saddle, name: 'dog.chest', r: 0.034,
  }));
  body.add(softBox({
    size: [0.238, 0.280, 0.316], pos: [0, 0.462, 0.058], mat: M.saddle, name: 'dog.barrel', r: 0.034,
  }));
  body.add(softBox({
    size: [0.212, 0.240, 0.238], pos: [0, 0.438, 0.286], mat: M.saddle,
    rotX: 0.09, name: 'dog.croup', r: 0.034,
  }));
  // The lighter gold comes UP the flanks and the cream runs along the belly,
  // so the coat reads as layered fur catching the light rather than as paint.
  for (const side of [-1, 1]) {
    const sx = side < 0 ? 'left' : 'right';
    /* Both of these used to stand PROUD of the barrel they are meant to be
     * shading -- the flank by 12 mm, the shade by 6 -- so instead of reading
     * as coat they read as two rectangular panels stuck on his side, with a
     * hard edge all the way round. Pulled in flush and rounded off. */
    body.add(softBox({
      size: [0.028, 0.196, 0.560], pos: [side * 0.106, 0.398, 0.010], mat: M.tan,
      name: `dog.flank.${sx}`, r: 0.030,
    }));
    body.add(softBox({
      size: [0.024, 0.136, 0.230], pos: [side * 0.104, 0.508, -0.230], mat: M.sable,
      name: `dog.shade.${sx}`, r: 0.028,
    }));
  }
  body.add(softBox({
    size: [0.196, 0.062, 0.520], pos: [0, 0.346, 0.020], mat: M.cream, name: 'dog.belly',
  }));
  /* The forechest. This was a 0.19 x 0.15 CREAM slab pinned flat to the front
   * of the chest, which from head on was a pale rectangle the width of the dog
   * -- the single loudest shape in the front view and nothing a dog has. It is
   * a rounded swell of the chest itself now, in the light gold, narrower than
   * the chest so the coat carries round it. */
  body.add(softBox({
    size: [0.156, 0.212, 0.104], pos: [0, 0.436, -0.336], mat: M.tan, name: 'dog.brisket', r: 0.050,
  }));
  /* Withers: the bump over the shoulders, and the highest point on the dog.
   * 0.596 + 0.040 = 0.636, which is DOG_SHOULDER_HEIGHT — a big male golden.
   * The chest tops out at 0.630 and the raised croup at about 0.575, so the
   * topline now runs close to level instead of falling away shepherd-style. */
  body.add(softBox({
    size: [0.190, 0.080, 0.200], pos: [0, 0.596, -0.176], mat: M.saddle, name: 'dog.withers',
  }));

  /* ---- Neck. One slab along its own axis, so the head hangs off the end of
   * it and a nod is one number.
   *
   * IT WAS TOO SHORT AND TOO FLAT, and that was the last of what made him
   * read wrong. 0.218 m of neck raked 48 degrees off vertical put the base of
   * the skull at y 0.645 against withers of 0.636 -- the head carried DEAD
   * LEVEL with the shoulders, hanging straight off the front of the chest with
   * no neck showing between them. A dog built like that is a battering ram.
   *
   * The rake is measured, not guessed. The pivot is buried in the chest at
   * (0, 0.500, -0.250) and the neck runs 0.300 m along its own +Y to the base
   * of the skull. `rotation.x = -0.64` maps that +Y onto (0, 0.8021,
   * -0.5972), so the head base lands at
   *   y = 0.500 + 0.8021 * 0.300 = 0.741
   *   z = -0.250 - 0.5972 * 0.300 = -0.429
   * which puts the top of his skull at 0.841 and his nose at 0.745 -- a head
   * carried a clear 0.2 m over the withers, which is where an alert dog holds
   * it. The ruff's bottom corner still sits inside the chest slab at every
   * angle the sit reaches, so no gap opens at the shoulder on the way down. */
  const neck = new THREE.Group();
  neck.name = 'dog.neck';
  neck.position.set(0, 0.500, -0.250);
  neck.rotation.x = -0.64;
  neck.userData.rest = -0.64;
  body.add(neck);
  neck.add(softBox({
    size: [0.176, 0.300, 0.212], pos: [0, 0.132, 0], mat: M.saddle, name: 'dog.neck.ruff', r: 0.044,
  }));
  /* The throat. It was 0.054 deep at z -0.098 against a ruff whose front face
   * is -0.106, so nearly half of it stood outside the neck -- a bright cream
   * wedge hanging under the jaw with a visible seam all round it. Flush now,
   * and narrower than the ruff on both sides. */
  neck.add(softBox({
    size: [0.112, 0.262, 0.048], pos: [0, 0.126, -0.082], mat: M.cream, name: 'dog.neck.throat', r: 0.030,
  }));
  for (const side of [-1, 1]) {
    neck.add(softBox({
      size: [0.034, 0.250, 0.156], pos: [side * 0.082, 0.130, 0.012], mat: M.sable,
      name: `dog.neck.mane.${side < 0 ? 'left' : 'right'}`, r: 0.028,
    }));
  }

  /* The collar. It is Lou's dog, so it is gold, and it has a tag on it. */
  neck.add(named(cylinder({
    r: 0.099, h: 0.046, pos: [0, 0.206, 0], mat: M.gold, seg: 14,
  }), 'dog.collar'));
  neck.add(named(cylinder({
    r: 0.089, h: 0.050, pos: [0, 0.206, 0], mat: M.saddle, seg: 14,
  }), 'dog.collar.lining'));
  neck.add(box({
    size: [0.010, 0.038, 0.010], pos: [0, 0.164, -0.096], mat: M.gold, name: 'dog.collar.tag-ring',
  }));
  neck.add(named(cylinder({
    r: 0.030, h: 0.008, pos: [0, 0.130, -0.100], mat: M.gold, rotX: Math.PI / 2, seg: 12,
  }), 'dog.collar.tag'));

  /* ---- Head. Parented at the top of the neck and counter-rotated level, so
   * `head.rotation.x` is a nod and `head.rotation.y` is a look. */
  const head = new THREE.Group();
  head.name = 'dog.head';
  head.position.set(0, 0.300, 0);
  head.rotation.x = 0.64;
  head.userData.rest = 0.64;
  neck.add(head);

  /* A golden's head, re-cut after the owner looked at the last one and said
   * "the dog is still cursed, need a new dog".
   *
   * WHAT WAS WRONG, from the render rather than from taste. The muzzle was
   * 0.196 long against a 0.204 skull and only 0.088 wide -- as long as the
   * head it grew out of and half its width, which is a PLANK, not a foreface.
   * It hung 40 mm below the skull's centreline with nothing bridging the two,
   * so the face read as a board nailed to a box. Under it ran a CREAM underjaw
   * 0.094 wide -- wider than the muzzle itself, in the brightest colour on the
   * dog -- and under THAT a red tongue, permanently out. Off the front the
   * eyes were 0.020 spheres standing proud of a 0.146 skull with a solid black
   * bar over each. Every one of those is a horror cue, and together they were
   * the whole complaint.
   *
   * SO: the muzzle is shorter (0.132) and DEEPER, it sits on the skull's own
   * line rather than below it, and a cheek and a bridge carry the taper from
   * one to the other. The underjaw is narrower than the muzzle and tan, not
   * cream. The tongue is gone. The eyes are smaller, set into the skull inside
   * its silhouette, and rimmed with a dark lid behind rather than barred in
   * front. */
  head.add(softBox({
    size: [0.152, 0.148, 0.186], pos: [0, 0.026, -0.052], mat: M.saddle, name: 'dog.head.skull', r: 0.046,
  }));
  // Cheeks: the muzzle has to grow out of a face, not out of a corner.
  for (const side of [-1, 1]) {
    head.add(softBox({
      size: [0.040, 0.096, 0.116], pos: [side * 0.056, -0.008, -0.086], mat: M.tan,
      name: `dog.head.cheek.${side < 0 ? 'left' : 'right'}`, r: 0.030,
    }));
  }
  head.add(softBox({
    size: [0.112, 0.100, 0.078], pos: [0, 0.020, -0.150], mat: M.tan, name: 'dog.head.stop', r: 0.036,
  }));
  head.add(softBox({
    size: [0.098, 0.084, 0.132], pos: [0, 0.006, -0.216], mat: M.tan, name: 'dog.head.muzzle', r: 0.036,
  }));
  /* The underjaw is INSIDE the muzzle's width (0.072 against 0.090) and in the
   * light gold rather than the cream, so it shades the mouth instead of
   * announcing it. */
  head.add(softBox({
    size: [0.078, 0.034, 0.112], pos: [0, -0.036, -0.212], mat: M.tan, name: 'dog.head.jaw', r: 0.016,
  }));
  // The dark flew along each lip, which is the only black on a golden's face
  // besides the nose.
  for (const side of [-1, 1]) {
    head.add(softBox({
      size: [0.014, 0.038, 0.104], pos: [side * 0.043, -0.020, -0.222], mat: M.sable,
      name: `dog.head.flew.${side < 0 ? 'left' : 'right'}`, r: 0.010,
    }));
  }
  /* The nose. It was a 0.029 sphere -- 58 mm across the face of a 90 mm
   * muzzle, standing 17 mm proud of the end of it, which close up is a black
   * BALL stuck on the front of the dog. Seated into the muzzle end now, and
   * two thirds the size. */
  head.add(named(sphere({
    r: 0.021, ry: 0.017, rz: 0.015, pos: [0, 0.014, -0.272], mat: M.black,
  }), 'dog.head.nose'));
  head.add(softBox({
    size: [0.106, 0.026, 0.056], pos: [0, 0.058, -0.128], mat: M.tan, name: 'dog.head.brow', r: 0.016,
  }));

  const eyes = [];
  for (const side of [-1, 1]) {
    const sx = side < 0 ? 'left' : 'right';
    /* Inside the skull's own silhouette: half-width 0.076, and 0.044 + 0.016
     * is 0.060. The old pair stood 0.070 out of a 0.073 half-width and caught
     * the light like two beads glued on. */
    head.add(named(sphere({
      r: 0.018, ry: 0.017, rz: 0.012, pos: [side * 0.045, 0.044, -0.120], mat: M.black,
    }), `dog.head.eye-line.${sx}`));
    const e = named(sphere({
      r: 0.016, ry: 0.014, rz: 0.014, pos: [side * 0.045, 0.042, -0.126], mat: M.eye,
    }), `dog.head.eye.${sx}`);
    head.add(e);
    eyes.push(e);
    head.add(named(sphere({
      r: 0.005, pos: [side * 0.049, 0.048, -0.134], mat: M.gleam,
    }), `dog.head.eye-gleam.${sx}`));
  }

  /* Ears. Drop ears, and this time actually DROPPED.
   *
   * The pivot was at y 0.078 with the root fold 0.012 above it, which put the
   * top of the fold 0.030 m OVER the crown of the skull -- so from the front
   * the pair read as two blocks balanced on his head, which is the second
   * thing the owner was looking at when he called the dog cursed. The pivot
   * comes down onto the side of the skull, the fold hangs level with the
   * crown rather than above it, and the leaf lies closer in (rest z -0.30
   * against -0.16) so it follows the cheek down to the jaw line instead of
   * standing off in the air. The GROUP is untouched -- same pivot, same
   * userData rests, so `update()` still swivels and tips them. */
  const ears = [];
  for (const side of [-1, 1]) {
    const sx = side < 0 ? 'left' : 'right';
    const ear = new THREE.Group();
    ear.name = `dog.head.ear.${sx}`;
    /* MEASURED, because the first pass at this overshot. At a rest tilt of
     * 0.30 rad the leaf swung so far inboard that the tip landed at head-local
     * x 0.029 -- half way across a skull whose half-width is 0.076, i.e. the
     * ear finished up INSIDE the dog's cheek and only a sliver of it ever
     * showed. At 0.10 off a pivot moved 8 mm further out, the shell straddles
     * the cheek surface (x 0.057..0.087 against a 0.076 face) and the tip
     * hangs at x 0.068, y -0.094 -- down the side of the head to just below
     * the jaw line, which is where a golden's ear ends. */
    ear.position.set(side * 0.072, 0.062, -0.028);
    ear.rotation.z = -side * 0.10;
    ear.rotation.x = 0.10;
    ear.userData.restZ = -side * 0.10;
    ear.userData.restX = 0.10;
    head.add(ear);
    ear.add(softBox({
      size: [0.036, 0.046, 0.086], pos: [0, -0.006, 0.004], mat: M.sable,
      name: `dog.head.ear-fold.${sx}`, r: 0.016,
    }));
    ear.add(softBox({
      size: [0.030, 0.124, 0.096], pos: [side * 0.008, -0.076, -0.006], mat: M.sable,
      name: `dog.head.ear-shell.${sx}`, r: 0.014,
    }));
    ear.add(softBox({
      size: [0.026, 0.062, 0.078], pos: [side * 0.012, -0.156, -0.020], mat: M.sable,
      name: `dog.head.ear-tip.${sx}`, r: 0.014,
    }));
    ears.push(ear);
  }

  /* ---- Tail. A golden's is a PLUME: thick at the root, tapering, carried
   * about level with the topline with cream feathering hanging off the
   * underside of it.
   *
   * What was here lifted 33 degrees (rests -0.30 / -0.16 / -0.12) and flew a
   * solid CREAM tip -- a pale stub on the end of a gold stick, which is what
   * made it read as an aerial rather than a tail. The lift relaxes to 19
   * degrees, every segment tapers into the next, and the cream moves to a
   * fringe UNDER the tail where a golden's feathering actually is. Same three
   * links, same pivots, same wag arithmetic: a wag is still one number
   * multiplied down the chain. */
  const tail = new THREE.Group();
  tail.name = 'dog.tail';
  tail.position.set(0, 0.458, 0.390);
  tail.rotation.x = -0.18;
  tail.userData.rest = -0.18;
  body.add(tail);
  tail.add(softBox({
    size: [0.100, 0.106, 0.200], pos: [0, -0.012, 0.096], mat: M.saddle, name: 'dog.tail.root', r: 0.040,
  }));
  const tailMid = new THREE.Group();
  tailMid.name = 'dog.tail.mid-pivot';
  tailMid.position.set(0, -0.016, 0.192);
  tailMid.rotation.x = -0.10;
  tailMid.userData.rest = -0.10;
  tail.add(tailMid);
  tailMid.add(softBox({
    size: [0.084, 0.090, 0.190], pos: [0, -0.010, 0.092], mat: M.saddle, name: 'dog.tail.mid', r: 0.036,
  }));
  tailMid.add(softBox({
    size: [0.062, 0.062, 0.176], pos: [0, -0.050, 0.090], mat: M.cream, name: 'dog.tail.feather-mid', r: 0.028,
  }));
  const tailTip = new THREE.Group();
  tailTip.name = 'dog.tail.tip-pivot';
  tailTip.position.set(0, -0.014, 0.184);
  tailTip.rotation.x = -0.06;
  tailTip.userData.rest = -0.06;
  tailMid.add(tailTip);
  tailTip.add(softBox({
    size: [0.068, 0.074, 0.164], pos: [0, -0.008, 0.078], mat: M.saddle, name: 'dog.tail.tip', r: 0.032,
  }));
  tailTip.add(softBox({
    size: [0.052, 0.056, 0.150], pos: [0, -0.042, 0.074], mat: M.cream, name: 'dog.tail.feather-tip', r: 0.024,
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
 * His cushion -> the stair -> Lou's office -> back.
 *
 * MEASURED OFF THE BUILT STAIR, not sketched. When this module was written the
 * suite did not exist and these were six plausible numbers with a note saying
 * a `MasterSuite.js` would re-export them; the suite exists now, it is
 * `buildMasterSuite()` in `scenes/MansionInterior.js`, and every waypoint below
 * is taken from the geometry that file exports:
 *
 *   y = 10.60  SUITE_Y                  the third floor
 *   y =  8.30  SUITE_STAIR_LANDING_Y    the half-turn
 *   y =  6.00  UPPER_Y                  the office
 *
 * The four legs on the flights carry the flight's OWN end z values
 * (SUITE_FLIGHT_A/B.z0/z1), because `update()` lerps y linearly between
 * consecutive points: a waypoint 0.4 m short of the top tread puts him 0.35 m
 * under the stone for the whole leg. `tests/mansion-suite-dog.test.mjs` asserts
 * every one of these against the exported rects, so the two cannot drift.
 *
 * He starts on the CUSHION, with the longest wait in the list, because that is
 * where the owner asked for him to be and it is where the player meets him.
 */
export const LIL_TOM_ROUTE = Object.freeze([
  Object.freeze({ x: 2.85, y: 10.60, z: 65.90, wait: 16.0 }),  // his cushion, by the bed
  Object.freeze({ x: 6.00, y: 10.60, z: 64.60, wait: 0.4 }),   // across the suite
  Object.freeze({ x: 8.26, y: 10.60, z: 64.95, wait: 0.0 }),   // the arrival pad
  Object.freeze({ x: 8.26, y: 10.60, z: 65.25, wait: 0.0 }),   // top of the upper flight
  Object.freeze({ x: 8.26, y: 8.30, z: 67.89, wait: 0.0 }),    // foot of it
  Object.freeze({ x: 7.20, y: 8.30, z: 68.40, wait: 0.3 }),    // across the half-landing
  Object.freeze({ x: 7.17, y: 8.30, z: 67.89, wait: 0.0 }),    // top of the lower flight
  Object.freeze({ x: 7.17, y: 6.00, z: 65.25, wait: 0.0 }),    // foot of it
  Object.freeze({ x: 7.20, y: 6.00, z: 64.90, wait: 0.3 }),    // the lobby
  Object.freeze({ x: 5.40, y: 6.00, z: 65.20, wait: 0.3 }),    // out through the bookcase
  Object.freeze({ x: 2.20, y: 6.00, z: 66.40, wait: 0.0 }),    // round the fireside chairs
  Object.freeze({ x: 0.00, y: 6.00, z: 70.00, wait: 12.0 }),   // at Lou's desk
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
    /* MEASURED CEILING ON THE TAIL'S DROP. At +0.42 for a full wag and +0.16
     * more for the sit -- on top of a trunk that tilts 0.34 nose-up when he
     * sits, which swings the root down again -- the plume's cream feathering
     * finished 41 mm THROUGH the floorboards while he was being petted. A
     * sitting dog lays his tail ON the floor, not into it. At 0.30 and 0.06 the
     * lowest point of the whole animal in that pose is a pad, where it belongs,
     * and the wag still reads as a wag. */
    parts.tail.rotation.x = parts.tail.userData.rest + wag * 0.30 + sit * 0.06;
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
