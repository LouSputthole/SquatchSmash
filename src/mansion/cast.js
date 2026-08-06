/**
 * WHO IS ACTUALLY IN LOU'S HOUSE.
 *
 * Owner playtest, 2026-08-04, verbatim: *"None of the characters are here."*
 * He was right — the mansion built its grounds, its rooms, its guns and a
 * whole secret laboratory, and then put nobody in any of it. This module is
 * the people.
 *
 *   - a man on the front door who stops you before the top step;
 *   - six of Lou's security: three walking the ground outside, one at the top
 *     of the horseshoe stair looking out over the front doors, one downstairs
 *     past the armory with a television on, one standing on the open vault;
 *   - the Bada Bing's bartender, working the bar in the billiard bay;
 *   - Snow and his cart, cleaning near the entrance;
 *   - Gratin, in the interrogation area, running what is going on down there,
 *     who hands you the cord;
 *   - AND THE FAMILY, which is what this file was missing.
 *
 * ## The Family (owner playtest, 2026-08-05)
 *
 * Verbatim: *"lOUS not in his office in the mansion"* and *"Need to see whats
 * going on with all the voice lines and where the rest of the cast is.
 * Everyone should be there for the most part utilizing the house hanging
 * out."*
 *
 * He was right twice. This module placed the SECURITY and not one member of
 * the Family — so `./script.js` gave Lou, Booski, DeathMegatron, Irish,
 * Rippin, Eric and Shubes a full mission's worth of lines and PROJECT SILENT
 * SQUATCH played every one of them at an empty room.
 *
 * EVERY ONE OF THEM IS NOW STOOD WHERE HIS OWN LINES ALREADY FIRE, and that
 * is the whole placement rule — the mission's zones were not moved to suit
 * the bodies, the bodies were put where the mission has always been shouting:
 *
 *   Lou            `office`      behind his own desk, and the case is
 *                                carried to that desk in front of him
 *   Booski         `observation` at the transfer table, running the basement
 *   DeathMegatron  `observation` at the laboratory glass, watching the six
 *   Irish          `corridor`    the cellar corridor, where the floor is wet
 *   Rippin         `rippin`      the lounge — the pool room, off the bar
 *   Eric           `eric`        the dining table, in a chair
 *   Shubes         `shubes`      the gallery, wandering through it
 *
 * Four more of the roster use rooms the house built and nobody was ever in:
 * Captain Lou Sasole on a stool at the bar, Numbskull on the pool terrace,
 * Hog Mama in the kitchen.
 *
 * ## What this file does NOT own
 *
 * The **writing** is `./script.js`, in PROJECT SILENT SQUATCH's own `SEQUENCES`
 * block, played through the mission's own `DialogueController`. Not one line is
 * typed at a call site here.
 *
 * The **bodies** are `src/core/wardrobe.js` — including the two new ones this
 * scene needed (`MANSION_DOOR_MAN`, `MANSION_GUARDS`) and the bartender, whose
 * model moved there out of `src/bing/cast.js` so that the man behind Lou's bar
 * is the same man who is behind the Bing's. Nothing here restates a height, a
 * build or a garment: every figure below SPREADS its canonical model and adds
 * only what is local to this scene — a face, a pose, a spot.
 *
 * The **faces** are `assets/faces/`, and only the photos that exist. Same
 * technique the club, the golf course and the Initiation use: one image on the
 * front of a box skull. `FACES` below names only files listed in
 * assets/faces/index.json, because a face that has not landed is a 404 in the
 * console and this scene has a check that fails on those.
 *
 * The **whip** is `src/bing/license-to-grill-runtime.js` — the actual cord
 * Gratin hands over in LICENSE TO GRILL, its actual pose function, its actual
 * swing timing and its actual four cues. What the mansion does with it is its
 * own: Gratin HANDS IT OVER once, and after that it is yours and it works
 * every time you use it. See `THE WHIP` below.
 *
 * The **house** is `./scenes/`. This module reads anchors and stands people on
 * them; it builds no architecture, moves no wall and touches no collider.
 *
 * ## Two rules that are not negotiable
 *
 * 1. **SNOW IS NEVER A TARGET.** He is not in a hostile list, a damage path or
 *    an aim resolver, because this module has none of those things: it owns
 *    bodies, barks and one authored swing that is registered ON THE ONE MAN it
 *    can land on. The swing is `interaction.register(lab.xxx.aim, …)` — there
 *    is no ray, no target list, no damage model and no "whatever is under the
 *    crosshair" anywhere in this file, so there is no code path by which the
 *    cord can be pointed at Snow or at anybody else. Standing owner rule; the
 *    way it is kept is by not building the machinery.
 * 2. **THE TWO LOUS ARE TWO MEN.** Big Uncle Lou is `lou`/`lou1` and wears
 *    `BIG_UNCLE_LOU`; he is behind the desk in the office. Captain Lou Sasole
 *    is `captain_lou_sasole`/`lou2` and wears `CAPTAIN_LOU_SASOLE`; he is on a
 *    stool at the bar. THEY ARE BOTH IN THIS HOUSE TONIGHT AND THEY MUST NEVER
 *    MERGE — different wardrobe entry, different face photo, different voice
 *    profile, different floor. `src/core/wardrobe.js` dresses them apart on
 *    purpose ("so that when both Lous are in the same room nobody has to read
 *    a subtitle to tell them apart"), and this is the room it meant.
 *
 * ## Doctrine
 *
 * docs/TONE-AND-PARODY.md. A mob boss's house with a man on the door, men on
 * the grounds, a man on the vault and a man in the basement doing what is being
 * done in the basement is not a joke the scene is telling. It is the house,
 * played completely straight, and it is what makes the rest of the night land.
 * Every bark below is one flat sentence from somebody who is at work.
 */
import * as THREE from 'three';
import { Npc } from '../bing/cast.js';
import {
  SWING_LANDS_AT, SWING_SECONDS, makeCord, poseCord,
} from '../bing/license-to-grill-runtime.js';
import {
  BADA_BING_BARTENDER, BIG_UNCLE_LOU, BOOSKI, CAPTAIN_LOU_SASOLE, DEATHMEGATRON,
  ERIC, GRATIN, HOG_MAMA, IRISH, MANSION_DOOR_MAN, MANSION_GUARDS, NUMBSKULL,
  RIPPINFLOW, SHUBENATOR, SNOW,
} from '../core/wardrobe.js';
import { box, cylinder, group, mat } from '../world/build.js';
import { DialogueController } from './mission/DialogueController.js';
import { createMissionHud } from './mission/hud.js';
import { INSTRUCTIONS, SEQUENCES } from './script.js';

/* ================================================================== */
/* THE THREE FLOOR HEIGHTS, AS A FALLBACK ONLY                          */
/*                                                                       */
/* `opts.anchors` is authoritative and every post below reads it first.   */
/* These are what `MansionGrounds.js` resolves those anchors to today,    */
/* written out rather than imported for one reason: importing that module */
/* builds canvas textures at module scope, which drags a WebGL-shaped     */
/* dependency into anything that merely wants to know where people stand  */
/* -- including `npm test`. A number that has drifted puts a man a few     */
/* centimetres off a floor he is standing on; an import that cannot run    */
/* headless takes the whole module with it.                               */
/* ================================================================== */
/** The podium the house stands on. */
const GROUND_Y = 1.2;
/** The gallery, the bedrooms and Lou's office. */
const UPPER_Y = 6.0;
/** The armory and the lower level. */
const BASEMENT_Y = -2.8;

/* ================================================================== */
/* WHERE PEOPLE STAND                                                   */
/*                                                                       */
/* Every post below prefers the house's own published anchor and falls   */
/* back to the literal it resolves to today, so this module keeps        */
/* working while the two scene files are being edited beside it and      */
/* stops guessing the moment they hand it a better number.               */
/* ================================================================== */

/** yaw that points a figure at (x, z). makePerson faces +Z at yaw 0. */
function yawToward(fromX, fromZ, atX, atZ) {
  return Math.atan2(atX - fromX, atZ - fromZ);
}

/* ================================================================== */
/* FACES                                                                */
/*                                                                       */
/* One image on the front of a box skull -- makePerson's `face`, the      */
/* Initiation's technique, and the reason Big Uncle Lou looks like        */
/* himself rather than like a generic heavy.                             */
/*                                                                        */
/* ONLY PHOTOS THAT EXIST ARE NAMED HERE. assets/faces/index.json is the   */
/* ledger of which have landed, and every file below is in it. A path to   */
/* a photo that has not landed is a 404 in the console, and                */
/* tools/verify-mansion.mjs fails on exactly that ("the only resource the  */
/* house cannot find is the film nobody has delivered yet"). Snow, Gratin  */
/* and the security keep the authored heads they already had -- they are   */
/* not being redressed by this pass.                                       */
/* ================================================================== */
const FACES = Object.freeze({
  /* `lou.png` is BIG UNCLE LOU. `sasole.png` is CAPTAIN LOU SASOLE. Two
   * photographs of two men, adjacent here for the same reason the wardrobe
   * puts their bodies adjacent: so nobody merges them by accident. */
  lou: 'assets/faces/lou.png',
  sasole: 'assets/faces/sasole.png',
  booski: 'assets/faces/booski.png',
  deathmegatron: 'assets/faces/deathmegatron.png',
  irish: 'assets/faces/irish.png',
  rippinflow: 'assets/faces/rippinflow.png',
  erican: 'assets/faces/erican.png',
  shubes: 'assets/faces/shubes.png',
  hogmama: 'assets/faces/hogmama.png',
  /* Owner playtest, 2026-08-06: "snow doesnt have his face."
   *
   * He did not, and neither did Gratin. Both photographs have been sitting in
   * `assets/faces/` and listed in its index the whole time — this table simply
   * never named them, so `post()` built both men with the authored head that
   * `makePerson` falls back to. Nothing 404'd and nothing warned: a face is
   * the one part of a figure that is allowed to be absent (see `withFace`
   * below), so a missing entry here looks exactly like a photo that has not
   * been delivered yet.
   *
   * Everyone with a photo on disk is now in this table. Numbskull and the
   * uniformed guards are still faceless because there is no photo of them. */
  snow: 'assets/faces/snow.png',
  gratin: 'assets/faces/gratin.png',
});

/**
 * Wear a photo, if there is anything to paint it with.
 *
 * `makePerson`'s `face` goes straight into a `THREE.TextureLoader`, which
 * builds an `<img>` — so a figure with a face on it CANNOT BE CONSTRUCTED
 * WITHOUT A DOM, and mounting this module in `node --test` threw on the first
 * man placed. That is the same trap the height-fallbacks at the top of this
 * file are written against: a module that only owns where people stand should
 * not be the thing that cannot run headless.
 *
 * So the photo is the one part of a figure that is conditional. Everything
 * else about him — his wardrobe entry, his post, his job, his lines — is
 * identical in both worlds, and the headless harness gets the authored head
 * that `makePerson` builds for anybody whose photo has not landed.
 *
 * THE TEST IS `createElementNS`, NOT `typeof document`, and that is not
 * pedantry: `tests/bing-dialogue-lock.test.mjs` installs a small `document`
 * stub on globalThis, and `npm test` runs every file in one process — so in
 * the suite `document` exists, is not a DOM, and a bare `typeof` check sends
 * nine figures into an image loader that then dies on the first one. Ask for
 * the one call `THREE.ImageLoader` actually makes.
 */
const CAN_PAINT_FACES = typeof document !== 'undefined'
  && typeof document.createElementNS === 'function';
const withFace = (model, face) => (CAN_PAINT_FACES && face ? { ...model, face } : model);

/* ================================================================== */
/* SITTING DOWN ON THIS HOUSE'S FURNITURE                               */
/*                                                                       */
/* `Npc.sit()` folds the figure and drops it 0.42 of its own height       */
/* scale from its base, and that 0.42 is measured against a cushion       */
/* 0.53 above the floor -- src/bing/cast.js's STOOL_SIT note, which       */
/* exists because Booskibro spent a month buried in a bar stool to the    */
/* waist. So a seat at any other height needs its base moved by the       */
/* difference, and this is that one subtraction written once.             */
/*                                                                        */
/* The three numbers below are MEASURED off the built house's own          */
/* colliders in a running browser, not authored: the dining and            */
/* conference chairs' seats top out 0.50 above their floor, the kitchen    */
/* island's stools 0.75, and the bay bar's stools 0.90.                    */
/* ================================================================== */
/** The cushion height `Npc.sit()`'s pose was tuned against. */
const POSE_CUSHION = 0.53;
/**
 * Base height for a figure sitting on a seat `cushion` above `floorY`.
 *
 * THE PELVIS IS PUT ON THE CUSHION AND THE FEET ARE ALLOWED TO FALL WHERE
 * THEY FALL, which is a real choice and it is this way round on purpose.
 * Measured in the running browser: the folded pose's shin is 0.59 long, so
 * the seat this figure fits perfectly is about 0.59 high. This house's dining
 * and conference chairs are 0.50, nine centimetres shy of that, so a man
 * sitting properly on one has his shoes nine centimetres into the carpet --
 * under a table, behind a chair, where nobody will ever see them. Correcting
 * it at the base instead would lift the pelvis nine centimetres clear of the
 * cushion and he would visibly hover, which is the exact fault STOOL_SIT was
 * written to fix, upside down. The Bada Bing has the same mismatch at 6 cm
 * and has shipped with it since the club opened.
 *
 * The stools are not affected: feet on a bar stool belong on its ring, and
 * both stool figures measure 16 cm and 31 cm clear of the floor.
 */
const seatBase = (floorY, cushion) => floorY + cushion - POSE_CUSHION;
/** How high this house's seats are, measured off its own colliders. */
const CUSHION = Object.freeze({ chair: 0.50, islandStool: 0.75, barStool: 0.90 });

/**
 * The perimeter beats.
 *
 * Owner: *"some patrol the permiter (walking around outside...)"*. All three
 * loops are in the open ground between the gate and the front steps, which is
 * the only outside ground the player actually crosses — a patrol nobody ever
 * meets is a patrol that is not in the game. They are clear of the fountain
 * basin (r 6 at z 27), of the front steps (x ±6, z 34–35.5), of the building
 * (z 36), of the west wing (x −24.6, z 40.6) and of the billiard bay (x 20.6,
 * z 41). A waypoint that ends up behind a parked car is skipped by the Npc's
 * own nav probe rather than walked through.
 */
const PATROL_ROUTES = Object.freeze([
  /* The turnaround itself, round the fountain. The man you meet first. */
  Object.freeze([
    { x: -10, z: 33.5 }, { x: -10, z: 19 }, { x: 10, z: 19 }, { x: 10, z: 33.5 },
  ]),
  /* The west lawn, out to the tree line. */
  Object.freeze([
    { x: -14, z: 33.5 }, { x: -27, z: 33.5 }, { x: -27, z: 19 }, { x: -14, z: 19 },
  ]),
  /* The east lawn, out toward the service road. */
  Object.freeze([
    { x: 14, z: 33.5 }, { x: 27, z: 33.5 }, { x: 27, z: 19 }, { x: 14, z: 19 },
  ]),
]);

/** How near somebody has to be before he says his line. */
const BARK_RANGE = 5.0;
/** And how long you have to stand there before he says the other one. */
const IDLE_SECONDS = 7.0;
/** How near the gate man has to be before he stops you. Wider: he is meant to
 * get the line out before you are on his step, not after. */
const GATE_RANGE = 8.0;

/* ================================================================== */
/* SNOW'S CART                                                          */
/*                                                                       */
/* Owner: "Snow, with his janitor cart, cleaning near the entrance, so   */
/* he can get that funny line he has in." The line is already written    */
/* (SEQUENCES.snowFoyer, "Try not to make more work for me tonight."),   */
/* and the mission already fires it on the foyer zone — it just had      */
/* nobody to come out of. This is the man and his cart.                  */
/*                                                                       */
/* An industrial cleanup cart, the one Booski tells him to bring later:  */
/* a yellow mop bucket with a wringer on it, a shelf of bottles, a bin   */
/* liner on a hoop, and the mop itself standing in the bucket.           */
/* ================================================================== */
const M_CART_YELLOW = mat({ color: 0xc9a11e, roughness: 0.7 });
const M_CART_GREY = mat({ color: 0x4a4e55, roughness: 0.6, metalness: 0.35 });
const M_CART_WATER = mat({
  color: 0x6f7d6a, roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.75,
});
const M_CART_HANDLE = mat({ color: 0x8a7a5a, roughness: 0.9 });
const M_CART_HEAD = mat({ color: 0xd8d2c4, roughness: 0.98 });
const M_CART_BAG = mat({ color: 0x22242a, roughness: 0.95 });

/* ================================================================== */
/* THE SET IN THE CELLAR                                                */
/*                                                                       */
/* Owner: "I want the gaurd downstairs in the cellar to be watching tv."  */
/*                                                                        */
/* A cabinet television of the same era as the two upstairs, deliberately  */
/* plainer: this one is in a room with gun racks in it, so it gets the     */
/* veneer and the speaker cloth and none of the gold.                      */
/* ================================================================== */
const M_TV_CASE = mat({ color: 0x3b2a1c, roughness: 0.68 });
const M_TV_BEZEL = mat({ color: 0x14161a, roughness: 0.5 });
const M_TV_CLOTH = mat({ color: 0x6b6152, roughness: 0.95 });
const M_TV_KNOB = mat({ color: 0x8a7a5a, roughness: 0.45, metalness: 0.5 });
const M_TV_DARK = mat({ color: 0x05070a, roughness: 0.22 });

/**
 * A television on legs, with a `screen` mesh for `src/core/tv.js` to paint.
 *
 * Built here rather than in the interior because the interior is another
 * pass's file this week, and because the set exists FOR the man standing in
 * front of it — moving one without the other is how he ends up watching a
 * wall. Same shape as MansionInterior's own `makeTvSet`, minus its gilding.
 */
function makeCellarTvSet(w = 1.2, h = 0.86) {
  const g = group('mansion.cellarTv');
  const d = 0.54;
  g.add(box({ size: [w, h, d], pos: [0, h / 2 + 0.2, 0], mat: M_TV_CASE, name: 'tv-cabinet' }));
  for (const [lx, lz] of [
    [-w / 2 + 0.1, -d / 2 + 0.1], [w / 2 - 0.1, -d / 2 + 0.1],
    [-w / 2 + 0.1, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1],
  ]) {
    g.add(cylinder({ rTop: 0.026, rBottom: 0.04, h: 0.22, pos: [lx, 0.11, lz], mat: M_TV_CASE }));
  }
  /* Bezel, then the picture standing a couple of millimetres proud of it. */
  g.add(box({
    size: [w * 0.76 + 0.07, h * 0.6 + 0.07, 0.03],
    pos: [0, h * 0.6, d / 2 + 0.005],
    mat: M_TV_BEZEL,
    cast: false,
  }));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.76, h * 0.6),
    mat({ color: 0x05070a, roughness: 0.22, unique: true }),
  );
  screen.name = 'mansion.cellarTv.screen';
  screen.position.set(0, h * 0.6, d / 2 + 0.026);
  g.add(screen);
  /* Speaker cloth and two knobs down the side, which is what makes it a set
   * rather than a picture leaning on a box. */
  g.add(box({
    size: [w * 0.13, h * 0.48, 0.02],
    pos: [w * 0.41, h * 0.6, d / 2 + 0.01],
    mat: M_TV_CLOTH,
    cast: false,
  }));
  for (const ky of [h * 0.22, h * 0.12]) {
    g.add(cylinder({
      r: 0.032, h: 0.028, pos: [w * 0.41, ky + 0.2, d / 2 + 0.02], mat: M_TV_KNOB, rotX: Math.PI / 2,
    }));
  }
  /* A dark strip under the picture, so the front is not one flat plank. */
  g.add(box({
    size: [w * 0.6, 0.04, 0.02], pos: [-w * 0.06, 0.3, d / 2 + 0.01], mat: M_TV_DARK, cast: false,
  }));
  return { group: g, screen, size: { w, h, d } };
}

/** The cart, at the origin of its own group so the caller only picks a spot. */
function makeJanitorCart() {
  const g = group('mansion.janitorCart');

  /* The bucket: a yellow tub on four castors with a press wringer bolted to
   * the top of it, which is the shape everybody recognises. */
  g.add(box({ size: [0.52, 0.34, 0.72], pos: [0, 0.25, 0], mat: M_CART_YELLOW, name: 'mop-bucket' }));
  g.add(box({ size: [0.44, 0.02, 0.62], pos: [0, 0.38, 0], mat: M_CART_WATER, cast: false }));
  g.add(box({ size: [0.46, 0.26, 0.2], pos: [0, 0.55, 0.28], mat: M_CART_YELLOW, name: 'wringer' }));
  g.add(cylinder({ r: 0.018, h: 0.46, pos: [0, 0.76, 0.36], mat: M_CART_GREY, rotX: 0.42 }));
  for (const [cx, cz] of [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]]) {
    g.add(cylinder({ r: 0.05, h: 0.04, pos: [cx, 0.05, cz], mat: M_CART_GREY, rotZ: Math.PI / 2 }));
  }

  /* The mop, standing in it. */
  g.add(cylinder({ r: 0.017, h: 1.42, pos: [0.14, 1.02, -0.16], mat: M_CART_HANDLE, rotZ: -0.12 }));
  g.add(cylinder({
    rTop: 0.055, rBottom: 0.1, h: 0.3, pos: [0.22, 0.42, -0.16], mat: M_CART_HEAD, rotZ: -0.12,
  }));

  /* The trolley half: a frame, a shelf of bottles, and a sack on a hoop. */
  const frame = group('cart-frame');
  frame.position.set(-0.72, 0, 0);
  g.add(frame);
  for (const fx of [-0.22, 0.22]) {
    frame.add(cylinder({ r: 0.016, h: 1.0, pos: [fx, 0.5, -0.24], mat: M_CART_GREY }));
    frame.add(cylinder({ r: 0.016, h: 1.0, pos: [fx, 0.5, 0.24], mat: M_CART_GREY }));
  }
  frame.add(box({ size: [0.5, 0.03, 0.52], pos: [0, 0.62, 0], mat: M_CART_GREY, name: 'cart-shelf' }));
  frame.add(cylinder({ r: 0.018, h: 0.5, pos: [0, 1.0, -0.24], mat: M_CART_GREY, rotZ: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) {
    frame.add(cylinder({
      rTop: 0.032, rBottom: 0.038, h: 0.24,
      pos: [-0.16 + i * 0.11, 0.75, -0.06], mat: M_CART_GREY,
    }));
  }
  /* The liner hoop, and the sack in it. Nothing in the sack. Yet. */
  frame.add(cylinder({ r: 0.2, h: 0.02, pos: [0, 0.86, 0.2], mat: M_CART_GREY }));
  frame.add(cylinder({ rTop: 0.19, rBottom: 0.13, h: 0.5, pos: [0, 0.6, 0.2], mat: M_CART_BAG }));
  for (const [cx, cz] of [[-0.2, -0.24], [0.2, -0.24], [-0.2, 0.24], [0.2, 0.24]]) {
    frame.add(cylinder({ r: 0.045, h: 0.035, pos: [cx, 0.045, cz], mat: M_CART_GREY, rotZ: Math.PI / 2 }));
  }
  return g;
}

/* ================================================================== */
/* THE MOUNT                                                            */
/* ================================================================== */

/**
 * Put everybody in the house.
 *
 * @param {THREE.Scene} scene  the merged mansion scene
 * @param {object} world       `{ colliders, groundAt }` — only `colliders` is
 *   read, and only so that a patrolling man walks round the furniture instead
 *   of through it.
 * @param {object} [opts]
 *   - `interaction`  the scene's `InteractionSystem`. Each person is registered
 *     ONCE, on his own group. (`register` writes `userData.interact`, so a
 *     second registration REPLACES the first — nothing here registers twice,
 *     and nothing here touches a mesh the environment or the mission owns.)
 *   - `camera`       needed for the cord view-model; without it the swing still
 *     resolves and still plays its lines, it just has nothing to hang the whip
 *     off, which is the same allowance the club's own headless harness makes.
 *   - `player`       read for its `.position`; falls back to the camera.
 *   - `audio`        `AudioEngine`. Optional: with no engine everything is
 *     silent-with-a-subtitle, which is this game's own convention.
 *   - `campaign`     accepted for signature compatibility with the rest of the
 *     scene's mounts and deliberately NOT written to. The cast is the house
 *     being populated, not an event in the story; PROJECT SILENT SQUATCH owns
 *     the save (see `createSilentSquatchStory`) and two writers on one save is
 *     how a night gets recorded twice.
 *   - `anchors`      the house's merged anchor table (`grounds` + `interior`).
 *   - `lab`          the laboratory handle, for the interrogation area. With no
 *     laboratory in the house there is no interrogation area, so there is no
 *     Gratin and no swing, and everybody upstairs is unaffected.
 *   - `hasCase`      `() => boolean`: are the Prospect's hands full right now.
 *     The mission is the only thing that knows — pass
 *     `() => silentSquatch.mission.caseState === 'carried'`. Without it the man
 *     on the door simply sends you in, which is what he does in a house with no
 *     job running in it.
 *   - `hud`          something with `showLine`/`hideLine`/`setInstruction`.
 *     Pass the mission's own HUD to share one subtitle bar with it; omit and a
 *     private one is built.
 *   - `enabled`      `() => boolean`, the scene's own running gate.
 */
export function mountMansionCast(scene, world = {}, {
  interaction = null,
  camera = null,
  player = null,
  audio = null,
  campaign = null,
  anchors = null,
  lab = null,
  hud = null,
  hasCase = null,
  enabled = () => true,
} = {}) {
  if (!scene) return null;

  const colliders = world?.colliders ?? null;
  /* Share the mission's subtitle bar when there is one, build a private one
   * when there is not, and have neither in a headless harness -- everything
   * below already treats the screen as optional, because an AudioEngine with
   * no recordings is the same shape of problem. */
  const ownHud = (!hud && typeof document !== 'undefined') ? createMissionHud() : null;
  const screen = hud ?? ownHud;

  /* One controller for the whole cast. A bark that lands while somebody else
   * is mid-sentence is INTERJECTED rather than queued behind him, so walking
   * past two men does not produce a conversation neither of them is having. */
  const dialogue = new DialogueController({
    /* No `say` here. The subtitle bar is wrapped once at mount (see THE
     * MOUTHS THE MISSION MOVES) so that the mission's lines animate their
     * speaker too, and doing it in both places would drive one jaw twice. */
    onLine: (line) => { screen?.showLine?.(line); },
    onLineEnd: () => screen?.hideLine?.(),
    onStage: (stageName) => { stages.push(stageName); },
    playCue: (cue) => {
      /* Cue names are data, never a literal at a call site: none of this
       * scene's voice cues have recordings yet, so this is silence plus a
       * subtitle until they land and needs no code change when they do. */
      if (cue && audio?.hasSample?.(cue)) audio.play(cue);
    },
  });
  const stages = [];

  /* ---------------------------------------------------------------- */
  /* The people                                                        */
  /* ---------------------------------------------------------------- */
  const people = {};
  const posts = [];

  const at = (name, fallback) => {
    const a = anchors?.[name];
    return a && Number.isFinite(a.x) ? { x: a.x, y: a.y ?? fallback.y, z: a.z } : fallback;
  };

  /**
   * Stand somebody somewhere and give him his lines.
   *
   * `bark` fires once, when the player first comes within `range`. `idle` fires
   * once more if he is still standing there `IDLE_SECONDS` later and nobody
   * else is mid-sentence. That is the whole behavioural budget for a man whose
   * job is to be in a doorway.
   *
   * `onArrive`/`onLeave` are for the one man whose approach is an exchange
   * rather than a bark — Gratin. They are hooks rather than an `if (id ===
   * 'gratin')` in the loop, because the loop should not know who anybody is.
   */
  function post(id, {
    model, name, x, y = 0, z, yaw = 0, job = 'stand', folded = false,
    route = null, speed = 1.0, tier = 'hero',
    bark = null, idle = null, range = BARK_RANGE, look = null, onUse = null,
    onArrive = null, onLeave = null,
  }) {
    const npc = new Npc(scene, {
      name, tier, job, x, y, z, yaw, route, speed, model, colliders,
    });
    npc.folded = folded;
    people[id] = npc;
    posts.push({
      id, npc, bark, idle, range, onArrive, onLeave, near: 0, said: false, saidIdle: false,
    });
    if (interaction && (look || onUse)) {
      /* ONE registration per body, on the body. `interaction.register` writes
       * `userData.interact`, so a second registration on the same object would
       * REPLACE this handler rather than add one — nothing in this module ever
       * registers a mesh twice, and nothing here touches a mesh the house or
       * the mission already owns. */
      interaction.register(npc.group, {
        label: look,
        enabled: () => enabled(),
        ...(onUse ? { onUse } : {}),
      });
    }
    return npc;
  }

  /* ---- the man on the front door -------------------------------------
   * On the portico, beside the doors, facing down the steps at whoever is
   * coming up them. He never leaves this half metre of marble. */
  const doorPost = at('frontDoorOutside', { x: 0, y: GROUND_Y, z: 34.5 });
  /* Off the centre line so he is beside the doorway rather than in it, and a
   * metre north of the anchor, which is the top tread — that puts him on the
   * portico slab. Derived from the anchor rather than typed, so he moves with
   * the facade if it moves again. */
  const gateAt = { x: doorPost.x + 2.4, y: doorPost.y ?? GROUND_Y, z: doorPost.z + 1.15 };
  post('gateMan', {
    name: 'the man on the door',
    model: MANSION_DOOR_MAN,
    x: gateAt.x,
    y: gateAt.y,
    z: gateAt.z,
    yaw: yawToward(gateAt.x, gateAt.z, doorPost.x, doorPost.z - 8),
    folded: true,
    range: GATE_RANGE,
    bark: SEQUENCES.gateGreeting,
    idle: SEQUENCES.gateLoiter,
    look: 'He has not moved since you came through the gate.',
    onUse: () => {
      /* What he says when you actually speak to him depends on whether your
       * hands are full. The case is the mission's; if there is no mission in
       * this house he simply sends you in. */
      dialogue.interject(carryingCase() ? SEQUENCES.gateCase : SEQUENCES.gateInside);
      return true;
    },
  });

  /* ---- the perimeter ---------------------------------------------------
   * Three men, one voice, on three loops. Ground level outside the podium is
   * flat street grade, so they walk at y 0. */
  const PERIMETER_BARKS = [
    SEQUENCES.guardPathBark, SEQUENCES.guardCameraBark, SEQUENCES.guardLapBark,
  ];
  PATROL_ROUTES.forEach((route, i) => {
    post(`patrol${i}`, {
      name: 'a guard',
      model: MANSION_GUARDS[i],
      tier: 'ambient',
      job: 'patrol',
      x: route[0].x,
      y: 0,
      z: route[0].z,
      yaw: yawToward(route[0].x, route[0].z, route[1].x, route[1].z),
      route: route.map((p) => ({ ...p })),
      speed: 1.15,
      bark: PERIMETER_BARKS[i],
      look: 'One of Lou\'s. He has walked past you twice already.',
    });
  });

  /* ---- the top of the stairs -------------------------------------------
   * Owner: "one at the top of the stairs looking out". At the balcony rail at
   * the head of the horseshoe, facing south over the front doors — which is
   * both the top of the stairs and the only place in the house you can see the
   * gate from. */
  const balcony = at('balconyRail', { x: 0, y: UPPER_Y, z: 45.8 });
  post('stairs', {
    name: 'a guard',
    model: MANSION_GUARDS[3],
    x: balcony.x + 1.2,
    y: balcony.y,
    z: balcony.z,
    yaw: yawToward(balcony.x + 1.2, balcony.z, balcony.x, balcony.z - 10),
    folded: true,
    bark: SEQUENCES.guardStairsBark,
    idle: SEQUENCES.guardStairsIdle,
    look: 'He is watching the front doors, not you.',
  });

  /* ---- the basement, and the television --------------------------------
   *
   * Owner, 2026-08-05: *"I want the gaurd downstairs in the cellar to be
   * watching tv."*
   *
   * HIS POST DOES NOT MOVE ONE CENTIMETRE. He was already standing at
   * `armoryCenter + (2.2, -1.6)` looking north up the room at roughly
   * `(armory.x, armory.z + 4)`, so the set is put ON THE LINE HE WAS ALREADY
   * LOOKING DOWN and his yaw is re-derived to land exactly on it. He is bored,
   * not off duty: same spot, same arms folded, same two lines about nothing
   * down here belonging to you, and now something to look at while he says
   * them. A man taken off his post to watch telly is a different character.
   *
   * 4.4 m north of him, against the low partition at the top of the room,
   * measured clear of it (the partition's collider starts at z 60.40 and the
   * cabinet's own depth reaches 60.21). */
  const armory = at('armoryCenter', { x: -2, y: BASEMENT_Y, z: 55.5 });
  const basementAt = { x: armory.x + 2.2, y: armory.y, z: armory.z - 1.6 };
  const cellarTvAt = { x: armory.x, y: armory.y, z: armory.z + 4.4 };
  post('basement', {
    name: 'a guard',
    model: MANSION_GUARDS[4],
    x: basementAt.x,
    y: basementAt.y,
    z: basementAt.z,
    /* At the set, not past it. */
    yaw: yawToward(basementAt.x, basementAt.z, cellarTvAt.x, cellarTvAt.z),
    folded: true,
    bark: SEQUENCES.guardBasementBark,
    idle: SEQUENCES.guardBasementIdle,
    look: 'Down here with the racks, watching a television with the sound off.',
  });

  /* ---- and the set he is watching --------------------------------------
   *
   * THE CABINET IS BUILT HERE; THE PICTURE IS MAIN.JS'S TO MOUNT, and the
   * split is not arbitrary — it is this file's oldest rule.
   *
   * The first version of this imported `src/core/tv.js` and drove a live `Tv`
   * from `update()`, which needed no composition-root change at all and was
   * wrong: `core/tv.js` imports `world/textures.js`, which BUILDS CANVAS
   * TEXTURES AT MODULE SCOPE. That is precisely the WebGL-shaped dependency
   * the note at the top of this file refuses to take on — "an import that
   * cannot run headless takes the whole module with it -- including
   * `npm test`" — and it did exactly that: the suite went from 677 passing to
   * SIGKILL. A module whose job is knowing where people stand does not get to
   * drag a texture painter in behind it.
   *
   * So the television is FURNITURE here, with a `screen` mesh published on
   * `cast.tv` for the composition root to paint. Unpainted it is a set that is
   * switched off, which is a thing televisions are, and the guard is still
   * standing in front of a television either way. */
  const cellarTv = makeCellarTvSet();
  cellarTv.group.position.set(cellarTvAt.x, cellarTvAt.y, cellarTvAt.z);
  /* Turned to face back down the room at the man on the post. */
  cellarTv.group.rotation.y = Math.PI;
  scene.add(cellarTv.group);

  /* Solid, and MEASURED off the built cabinet rather than authored around it —
   * the same lesson Snow's cart taught this file. Offered on `colliders` for
   * the composition root to push and count, never pushed from here. */
  cellarTv.group.updateMatrixWorld(true);
  const cellarTvCollider = new THREE.Box3().setFromObject(cellarTv.group);

  /* ---- the vault -------------------------------------------------------
   * In the cellar hall, in front of eleven inches of steel that is standing
   * open. Facing it, not the corridor: whatever he is worried about is inside
   * the room. */
  const vault = at('vaultCenter', { x: 13.4, y: BASEMENT_Y, z: 70.4 });
  /* Four metres south of the vault's own centre puts him out through the door
   * and into the cellar hall, which is where a man guarding a room stands. */
  const vaultPost = vault.z - 4.0;
  post('vault', {
    name: 'a guard',
    model: MANSION_GUARDS[5],
    x: vault.x,
    y: vault.y,
    z: vaultPost,
    yaw: yawToward(vault.x, vaultPost, vault.x, vault.z),
    folded: true,
    bark: SEQUENCES.guardVaultBark,
    idle: SEQUENCES.guardVaultIdle,
    look: 'He is standing between you and a door nobody closed.',
  });

  /* ---- the bar in the billiard bay -------------------------------------
   * The Bada Bing's bartender, working a private room for the night, at the
   * service end of the counter — the bay's bar is built hard against its own
   * back bar, so the end of the run is the only place in it a man fits. */
  const bay = at('billiardBay', { x: 18.3, y: GROUND_Y, z: 47.5 });
  const barTop = { x: bay.x + 0.85, y: bay.y, z: bay.z - 3.1 };
  post('bartender', {
    name: 'the bartender',
    model: BADA_BING_BARTENDER,
    job: 'work',
    x: barTop.x,
    y: barTop.y,
    z: barTop.z,
    /* Three-quarters on: down the length of his own bar, and open to whoever
     * comes through the archway from the billiard room. */
    yaw: yawToward(barTop.x, barTop.z, bay.x - 0.5, bay.z),
    bark: SEQUENCES.bartenderBark,
    idle: SEQUENCES.bartenderIdle,
    look: 'The same man who works the Bing. Somebody made him wear the waistcoat here too.',
    onUse: () => { dialogue.interject(SEQUENCES.bartenderJack); return true; },
  });

  /* ---- Snow, and the cart ---------------------------------------------
   * Near the entrance, inside the foyer bark zone the mission already carries
   * for him — so "Try not to make more work for me tonight." finally has a man
   * standing behind it, with a mop in the bucket, hours before Booski gets on
   * the intercom and asks him to bring the cart downstairs.
   *
   * HIS BARK IS NOT FIRED FROM HERE. The mission owns Snow's foyer line
   * (`SEQUENCES.snowFoyer`, on the `snow` zone) and firing it from two places
   * would say it twice. This module supplies the body and the cart. */
  const foyer = at('foyerCenter', { x: 0, y: GROUND_Y, z: 44.4 });
  const snowAt = { x: foyer.x - 2.4, y: foyer.y, z: foyer.z - 1.2 };
  post('snow', {
    name: 'Snow',
    model: withFace(SNOW, FACES.snow),
    job: 'work',
    x: snowAt.x,
    y: snowAt.y,
    z: snowAt.z,
    yaw: yawToward(snowAt.x, snowAt.z, foyer.x, foyer.z - 6),
    look: 'Gloves, a cart and a bucket, in a house where nothing has happened yet.',
  });
  const cart = makeJanitorCart();
  /* Far enough forward that the cart's own rear — the push bar and the mop
   * leaning out of the bucket — clears the man behind it. At +0.85 the built
   * geometry reached back to `snowAt.x - 0.15`, so Snow stood 15 cm inside
   * his own cart and the foyer had an invisible wall in front of him. */
  cart.position.set(snowAt.x + 1.45, snowAt.y, snowAt.z + 0.35);
  cart.rotation.y = -0.5;
  scene.add(cart);
  /* The cart is the one thing this module puts in the world that a player can
   * walk into. Its box is OFFERED rather than pushed into `world.colliders`:
   * tools/verify-mansion.mjs asserts the merged collider total adds up from
   * its named contributors, so a module that quietly adds one makes that sum
   * wrong from the outside. The composition root pushes it and counts it, the
   * same way it already does for the armory's racks. */
  /* MEASURED off the built cart, not authored around it.
   *
   * The hand-written box ran from `cart.x - 1.15` to `cart.x + 0.4`, and the
   * cart stands at `snowAt.x + 0.85` — so the solid reached 30 cm PAST Snow
   * and he was standing inside it. Nobody would have seen it: he does not
   * collide with the world, so the only symptom was an invisible wall in
   * front of the one man in the foyer, until a check asked whether anybody in
   * the house was standing in the furniture.
   *
   * `setFromObject` walks the real meshes, so the box is whatever the cart
   * actually is, and it cannot drift when the cart is redressed. */
  cart.updateMatrixWorld(true);
  const cartCollider = new THREE.Box3().setFromObject(cart);
  /* Floor to waist: the mop handle sticking up out of the bucket is not a
   * thing you walk into, and a collider as tall as it makes the cart a
   * pillar. */
  cartCollider.min.y = snowAt.y;
  cartCollider.max.y = Math.min(cartCollider.max.y, snowAt.y + 1.05);

  /* ================================================================ */
  /* THE FAMILY, UPSTAIRS                                              */
  /*                                                                    */
  /* NOBODY BELOW GETS A BARK FROM THIS MODULE, and that is deliberate. */
  /* The mission already owns every word these four say and fires them  */
  /* off its own trigger volumes (`rippin`, `eric`, `shubes`, `office`  */
  /* in mission/mount.js, and their idle twins in `#idleBarks`). A bark */
  /* here would be a SECOND controller on the same man and he would say */
  /* his line twice, a beat apart, which is worse than saying it to an  */
  /* empty room. What this module supplies is the man, in the volume,   */
  /* with a face on him -- and the mouth, through `speakerFor`.          */
  /* ================================================================ */

  /* ---- Big Uncle Lou, behind his own desk ------------------------------
   * Owner, verbatim: *"lOUS not in his office in the mansion"*.
   *
   * `officeDesk` is the anchor the player is sent to with the case in his
   * hands, and the desk's own collider runs 1.34 m north of it. Lou stands
   * clear of the far side of that, at the east end, out of the chair rather
   * than in it -- a man who stood up when somebody knocked.
   *
   * HE DOES NOT TOUCH THE DESK. The desk mesh is the mission's case-drop
   * target and is registered by mission/mount.js; this registers Lou's own
   * body and nothing else, and he stands BEHIND the desk so he never comes
   * between the player and the thing he is being told to press.
   *
   * `lou1`, and `assets/faces/lou.png`. NOT Captain Lou Sasole, who is
   * downstairs on a bar stool wearing a flight jacket and lou2. */
  const desk = at('officeDesk', { x: 0, y: UPPER_Y, z: 70.2 });
  const louAt = { x: desk.x + 1.05, y: desk.y, z: desk.z + 2.55 };
  post('lou', {
    name: 'Big Uncle Lou',
    model: withFace(BIG_UNCLE_LOU, FACES.lou),
    x: louAt.x,
    y: louAt.y,
    z: louAt.z,
    /* Across his own desk, at the door somebody is about to come through. */
    yaw: yawToward(louAt.x, louAt.z, desk.x, desk.z - 3),
    look: 'Big Uncle Lou. He has been waiting for you and he is not going to say so.',
  });

  /* ---- Rippin, in the pool room ----------------------------------------
   * The spec's `rippin` zone is `loungeCenter`, and the lounge is the room
   * the owner means by "the pool room and bar": billiards at one end, and the
   * glazed bay with the bar and the stools off the other. He leans on the
   * billiard table's west rail, which is inside the volume his own line fires
   * from -- "Whatever's in that thing, I don't want it near my balls." lands
   * on a man who is standing at the table, rather than on nobody. */
  const lounge = at('loungeCenter', { x: 12.5, y: GROUND_Y, z: 45.5 });
  const rippinAt = { x: lounge.x - 2.05, y: lounge.y, z: lounge.z + 2.1 };
  post('rippin', {
    name: 'Rippinflow',
    model: withFace(RIPPINFLOW, FACES.rippinflow),
    job: 'lean',
    x: rippinAt.x,
    y: rippinAt.y,
    z: rippinAt.z,
    yaw: yawToward(rippinAt.x, rippinAt.z, lounge.x + 1.9, lounge.z + 3.1),
    look: 'Rippinflow, who has not taken a shot in twenty minutes.',
  });

  /* ---- Eric, at the table ----------------------------------------------
   * The spec calls it "the table" and the mission's `eric` zone is the dining
   * table, so: in a chair at it, on the east side, facing across. The chair
   * run is 1.5 m off the table's centre line and its cushion is 0.50 above
   * the floor -- hence `seatBase`, and hence Eric sitting ON it. */
  const dining = at('diningTable', { x: -12.5, y: GROUND_Y, z: 66 });
  const ericAt = { x: dining.x + 1.5, y: seatBase(dining.y, CUSHION.chair), z: dining.z };
  post('eric', {
    name: 'Eric',
    model: withFace(ERIC, FACES.erican),
    job: 'sit',
    x: ericAt.x,
    y: ericAt.y,
    z: ericAt.z,
    yaw: yawToward(ericAt.x, ericAt.z, dining.x, dining.z),
    look: 'Eric, at a table nobody has eaten at.',
  });

  /* ---- Shubes, wandering through ---------------------------------------
   * "arrival, wandering through" -- so he is the one man upstairs who is not
   * on a spot. A short there-and-back along the gallery, clear of the
   * horseshoe's balustrade (which ends 2.4 m south of his line) and of the
   * conference wall (5 m north of it), so the walk never takes him into the
   * furniture at any point in its loop rather than only where he started. */
  const gallery = at('galleryCenter', { x: 0, y: UPPER_Y, z: 50.5 });
  const shubesRoute = [
    { x: gallery.x - 5.0, z: gallery.z - 0.1 },
    { x: gallery.x + 5.0, z: gallery.z - 0.1 },
  ];
  post('shubes', {
    name: 'The Shubenator',
    model: withFace(SHUBENATOR, FACES.shubes),
    job: 'patrol',
    x: shubesRoute[0].x,
    y: gallery.y,
    z: shubesRoute[0].z,
    yaw: yawToward(shubesRoute[0].x, shubesRoute[0].z, shubesRoute[1].x, shubesRoute[1].z),
    route: shubesRoute.map((p) => ({ ...p })),
    speed: 0.95,
    look: 'Shubes, on his fourth lap of a landing with nothing on it.',
  });

  /* ================================================================ */
  /* THE REST OF THE FAMILY, USING THE HOUSE                           */
  /*                                                                    */
  /* Owner: "Everyone should be there for the most part utilizing the   */
  /* house hanging out." Four rooms the house built and never put       */
  /* anybody in. These four ARE off every mission zone, so they are the */
  /* only people this module barks for -- see SEQUENCES' `house` scope. */
  /* ================================================================ */

  /* ---- Captain Lou Sasole, on a stool at the bar -----------------------
   * The bay's stools stand 0.7 m out from the anchor and 0.9 m off the floor;
   * the one nearest the service end puts him opposite the bartender, which is
   * where a man drinks alone in somebody else's house.
   *
   * THE OTHER LOU. `lou2`, `sasole.png`, `CAPTAIN_LOU_SASOLE` -- a flight
   * jacket and a silver watch, four floors and one entire wardrobe entry away
   * from the man in the pressed suit upstairs. */
  const bayBar = at('billiardBay', { x: 18.3, y: GROUND_Y, z: 47.5 });
  const sasoleAt = {
    x: bayBar.x + 0.7, y: seatBase(bayBar.y, CUSHION.barStool), z: bayBar.z - 1.6,
  };
  post('sasole', {
    name: 'Captain Lou Sasole',
    model: withFace(CAPTAIN_LOU_SASOLE, FACES.sasole),
    job: 'drink',
    x: sasoleAt.x,
    y: sasoleAt.y,
    z: sasoleAt.z,
    /* Square to his own drink, which is on the bar behind him at +x. */
    yaw: yawToward(sasoleAt.x, sasoleAt.z, bayBar.x + 3.0, sasoleAt.z),
    bark: SEQUENCES.sasoleBar,
    idle: SEQUENCES.sasoleIdle,
    look: 'Captain Lou Sasole. The pilot, not the boss — and he has been told the difference all night.',
  });

  /* ---- Hog Mama, in the kitchen ----------------------------------------
   * On a stool at the island, facing the working side of it. The island's
   * stools are 0.5 m off its south face and their cushions are 0.75 up. */
  const kitchen = at('kitchenIsland', { x: 12.0, y: GROUND_Y, z: 63.5 });
  const hogAt = {
    x: kitchen.x, y: seatBase(kitchen.y, CUSHION.islandStool), z: kitchen.z + 0.5,
  };
  post('hogmama', {
    name: 'Hog Mama',
    model: withFace(HOG_MAMA, FACES.hogmama),
    job: 'drink',
    x: hogAt.x,
    y: hogAt.y,
    z: hogAt.z,
    yaw: yawToward(hogAt.x, hogAt.z, kitchen.x, kitchen.z + 4),
    bark: SEQUENCES.hogmamaKitchen,
    idle: SEQUENCES.hogmamaIdle,
    look: 'Hog Mama, in the one room in this house anybody actually sits in.',
  });

  /* ---- The conference room is empty, and that is the continuity ---------
   *
   * Willy sat here: in a chair down the north side of the boardroom table,
   * three hours early for a meeting, not at the head of it, saying he came at
   * nine to get the good chair.
   *
   * He cannot. NO WAKE is Day 3 and the mansion arc is after it, and NO WAKE
   * is the mission where Lou has him executed in the cabin of a boat. A dead
   * man sitting in the boardroom is not a small wardrobe error -- it is the
   * player meeting somebody he watched die.
   *
   * Owner, 2026-08-05: "Willy should not be in any mansion scene because he
   * died on the boat same with billy hotdog both died before hand."
   *
   * Nobody has been moved into the chair. An empty boardroom three hours
   * before a meeting is a room, and putting a replacement in it to fill a
   * hole would be inventing a character to cover a corpse. */

  /* ---- Numbskull, on the terrace ---------------------------------------
   * Outside the pool doors, on the deck, looking at water nobody is in. The
   * biggest man on the roster standing in the dark being quiet. */
  const poolDoor = at('poolDoorOutside', { x: 10.8, y: GROUND_Y, z: 76.5 });
  const numbAt = { x: poolDoor.x - 0.2, y: poolDoor.y, z: poolDoor.z + 0.9 };
  post('numbskull', {
    name: 'Numbskull',
    model: NUMBSKULL,
    x: numbAt.x,
    y: numbAt.y,
    z: numbAt.z,
    yaw: yawToward(numbAt.x, numbAt.z, numbAt.x - 2, numbAt.z + 8),
    bark: SEQUENCES.numbskullTerrace,
    idle: SEQUENCES.numbskullIdle,
    look: 'Numbskull, outside, watching a heated pool nobody swims in.',
  });

  /* ---- Gratin, and the offer -------------------------------------------
   * The interrogation area is the laboratory's, so this exists only when the
   * laboratory does. He stands over xXx — who is built, hung and animated by
   * the environment (`lab.xxx`) and is NOT rebuilt here; there is one of him.
   *
   * The running gag is the Prospect's line, not Gratin's: it is ALWAYS Gratin.
   * Gratin's answer is a man explaining that he is good at his job.
   */
  /* ================================================================ */
  /* THE FAMILY, DOWNSTAIRS                                            */
  /*                                                                    */
  /* Behind the wall, so they exist only when the laboratory does --    */
  /* the same gate Gratin is already on. Every spot is DERIVED from the */
  /* lab's own published anchors rather than typed, so all three of     */
  /* them move with the room if the room moves.                         */
  /*                                                                    */
  /* No barks here either: the mission plays Irish on the `corridor`    */
  /* beat, DeathMegatron on `observation`, and Booski across seven      */
  /* beats from the delivery to "And a mop." This module stands them    */
  /* where all of that already happens.                                 */
  /* ================================================================ */
  const labAt = lab?.anchors ?? null;
  if (labAt) {
    /* ---- Irish, in the cellar corridor --------------------------------
     * The interrogation hall IS the corridor his lines are about -- "Mind
     * the floor there. It's not dry.", "There's a drain every three metres
     * in this hallway." He stands a metre and a half in from the foot of the
     * stairwell, which is the first thing the player sees on the way down
     * and the exact moment the mission plays him. */
    const foot = labAt.stairFoot;
    if (foot && Number.isFinite(foot.x)) {
      const irishAt = { x: foot.x - 0.55, y: foot.y, z: foot.z - 1.5 };
      post('irish', {
        name: 'Irish',
        model: withFace(IRISH, FACES.irish),
        job: 'work',
        x: irishAt.x,
        y: irishAt.y,
        z: irishAt.z,
        yaw: yawToward(irishAt.x, irishAt.z, foot.x, foot.z),
        look: 'Irish, with a bucket, in a hallway with a drain every three metres.',
      });
    }

    /* ---- Booski, running the basement ---------------------------------
     * Owner: *"BOOSKI — the basement, running it."* He has 31 lines, more
     * than anybody in the mission, and every one of them is spoken in the
     * observation area: the delivery, the asides over the build, "Lock the
     * lab", "Handle it", "Finish it", "Efficient", and Snow on the intercom.
     *
     * Beside the transfer table, NOT ON IT. `anchors.transferTable` is the
     * spot the PLAYER is sent to stand on to set the case down, so a man
     * standing there is a man standing in the middle of the one interaction
     * this beat has. He is 1.6 m east of it, turned to watch the opening the
     * player comes in through -- which is what "There he is." needs. */
    const table = labAt.transferTable;
    if (table && Number.isFinite(table.x)) {
      const booskiAt = { x: table.x + 1.6, y: table.y, z: table.z - 0.9 };
      post('booski', {
        name: 'Booski',
        model: withFace(BOOSKI, FACES.booski),
        x: booskiAt.x,
        y: booskiAt.y,
        z: booskiAt.z,
        yaw: yawToward(booskiAt.x, booskiAt.z, labAt.crossOpening?.x ?? booskiAt.x + 7, booskiAt.z + 1.3),
        look: 'Booski. Everything in this basement is happening because he said so.',
      });
    }

    /* ---- DeathMegatron, at the laboratory glass ------------------------
     * Owner: *"DEATHMEGATRON — at the laboratory glass."* Which is also what
     * she is about: "Don't lean on the glass. It's twelve centimetres. You
     * could drive a car at it." and "Six of them. Been in there since March."
     *
     * West of the glass door and clear of both console banks, facing through
     * the glass into the sealed lab -- so she is looking at the six people
     * she is counting rather than at the room she is standing in. Completely
     * heartless in this scene, per the owner's note, and standing perfectly
     * still watching them work is the coldest way to play it. */
    const glassDoor = labAt.glassDoor;
    if (glassDoor && Number.isFinite(glassDoor.x)) {
      const dmtAt = { x: glassDoor.x - 1.8, y: glassDoor.y, z: glassDoor.z - 0.35 };
      post('deathmegatron', {
        name: 'DeathMegatron',
        model: withFace(DEATHMEGATRON, FACES.deathmegatron),
        x: dmtAt.x,
        y: dmtAt.y,
        z: dmtAt.z,
        yaw: yawToward(dmtAt.x, dmtAt.z, dmtAt.x, dmtAt.z - 8),
        look: 'DeathMegatron, watching six people through twelve centimetres of glass.',
      });
    }
  }

  const hangingAt = lab?.xxx?.at ?? lab?.anchors?.xxx ?? null;
  let torture = null;
  if (hangingAt && Number.isFinite(hangingAt.x)) {
    const gx = hangingAt.x + 1.5;
    const gz = hangingAt.z - 1.15;
    const gratin = post('gratin', {
      name: 'Gratin',
      model: withFace(GRATIN, FACES.gratin),
      x: gx,
      y: hangingAt.y ?? BASEMENT_Y,
      z: gz,
      yaw: yawToward(gx, gz, hangingAt.x, hangingAt.z),
      /* Not a bark: his approach is a four-line exchange with the Prospect in
       * the middle of it, so it is played as one run. See `offerTheSwing`. */
      onArrive: () => offerTheSwing(),
      onLeave: () => declineTheSwing(),
      idle: SEQUENCES.tortureIdle,
      /* CLICKING GRATIN IS A HANDOVER, NOT A SWING. */
      look: () => (torture.handed
        ? 'He has gone back to what he was doing.'
        : 'Take the <b>cord</b>'),
      onUse: () => handTheCordOver(),
    });
    torture = {
      npc: gratin,
      /** Has he made the offer yet, and did the player walk past it. */
      offered: false,
      declined: false,
      /** Has the cord been put in the player's hand. The house rule is on
       * THIS, not on the number of times it has been used. */
      handed: false,
      /** How many times it has landed. Picks which thing xXx says. */
      swings: 0,
      /** −1 when the cord is not moving; 0→1 across one swing. */
      swing: -1,
      landed: false,
      cord: null,
    };

    /* ---- the man on the rope is the only thing the cord can reach ------
     *
     * THIS REGISTRATION IS THE WHOLE SAFETY ARGUMENT. The swing is not a ray,
     * a hitscan or a "whatever is under the crosshair" resolver — it is one
     * interaction handler on ONE mesh, `lab.xxx.aim`, which is the body
     * already hanging from the ceiling. There is no list of targets to add
     * anybody to and no damage model to point anywhere, so SNOW CANNOT BE
     * TARGETED BY CONSTRUCTION rather than by a filter somebody could later
     * relax. Standing owner rule.
     *
     * Registered ONCE, and on a mesh nothing else owns: `interaction.register`
     * writes `userData.interact`, so a second registration REPLACES the first.
     * `lab.targets.xxx` is published for aiming and the crosshair readout and
     * is not registered by mission/mount.js or by main.js — checked before
     * this was written, and it is the only reason this is allowed to be here.
     */
    const hangingMesh = lab?.xxx?.aim ?? null;
    if (interaction && hangingMesh?.isObject3D) {
      interaction.register(hangingMesh, {
        label: () => {
          if (!torture.handed) return 'xXx, who is still talking';
          return 'Swing the <b>cord</b>';
        },
        enabled: () => enabled(),
        onUse: () => swingAtHim(),
      });
      torture.target = hangingMesh;
    }
  }

  /* ---------------------------------------------------------------- */
  /* The swing                                                         */
  /*                                                                    */
  /* Owner playtest, 2026-08-05, verbatim: "I could only whip Xxx once  */
  /* and it was when I clicked on gratin, gratin should give me the     */
  /* whip then I can just click on XXX to do it. Need an ouch or a      */
  /* scream reaction then the voice line and a blood and impact effect  */
  /* as well."                                                          */
  /*                                                                     */
  /* It used to be ONE press on ONE man that did everything: the         */
  /* handover, the swing and the house rule were all `takeSwing()` on    */
  /* Gratin, so the second press got "One each. House rule." and the     */
  /* cord you were holding stopped working. Two verbs now, on the two    */
  /* men they belong to:                                                 */
  /*                                                                      */
  /*   press GRATIN -> he hands it to you. Once. The house rule is the    */
  /*                   answer to asking for a SECOND handover.            */
  /*   press xXx    -> you swing it. As often as you like, forever.        */
  /*                                                                       */
  /* The mechanic underneath is still the club's, imported whole: the same  */
  /* cord geometry, the same `poseCord` lag-and-pay-out, the same 0.72 s    */
  /* and the same four cues.                                                */
  /* ---------------------------------------------------------------- */

  /** Gratin puts it in your hand, and it stays there. */
  function handTheCordOver() {
    if (!torture) return false;
    /* THE HOUSE RULE. One cord each — he is not fetching you another. Note
     * what this does NOT gate: how many times you use the one you have. */
    if (torture.handed) { dialogue.interject(SEQUENCES.tortureOneEach); return true; }
    torture.handed = true;
    torture.declined = false;
    if (camera && !torture.cord) {
      torture.cord = makeCord();
      camera.add(torture.cord.root);
      poseCord(torture.cord, -1);
    }
    audio?.play('bing.grill.cord.handoff', { volume: 0.7 });
    dialogue.interject(SEQUENCES.tortureHandover);
    screen?.setInstruction?.(INSTRUCTIONS.SWING_THE_CORD);
    return true;
  }

  /** And takes it back, because it is his — on the way out, not mid-evening. */
  function takeCordBack() {
    if (!torture?.cord) return;
    camera?.remove?.(torture.cord.root);
    torture.cord = null;
  }

  /** What he says on the first swing, and on every one after it. */
  const SWING_LINES = [
    SEQUENCES.tortureSwing,
    SEQUENCES.tortureSwingTwo,
    SEQUENCES.tortureSwingThree,
    SEQUENCES.tortureSwingFour,
  ];

  /**
   * Swing it at him. The player's decision, at the moment he makes it, and he
   * can make it as many times as he likes.
   *
   * IT CANNOT MISS AND IT CANNOT REACH ANYBODY ELSE, and not because it is
   * filtered: this function is only ever reached from the interaction handler
   * registered on `lab.xxx.aim`, and there is no ray, no target list and no
   * damage model in this module for it to reach anything else through. xXx
   * survives the night regardless — `lab.xxx.alive` is a hard true — so the
   * cord costs him something to say and nothing else.
   */
  function swingAtHim() {
    if (!torture) return false;
    /* Not holding it yet: he has to ask Gratin first, and the prompt on
     * Gratin already says so. Consume nothing. */
    if (!torture.handed) return false;
    /* Mid-swing. Pressing again does not queue a second one. */
    if (torture.swing >= 0) return true;
    torture.swing = 0;
    torture.landed = false;
    screen?.setInstruction?.('');
    audio?.play('bing.grill.cord.swing', { volume: 0.62 });
    return true;
  }

  /**
   * The frame the cord arrives. Once per swing, from `update`.
   *
   * THE ORDER IS THE POINT. The crack, the blood and the noise he makes are
   * one event on one frame — they are what happens TO him, and he has no say
   * in any of it. The sentence comes after, because the sentence is him
   * deciding to speak, and the sequences in script.js are authored with the
   * involuntary noise as their first line so that order cannot be lost at a
   * call site.
   */
  function resolveSwing() {
    torture.landed = true;
    torture.swings += 1;
    /* 1. the impact. */
    audio?.play('bing.grill.cord.whip', { volume: 0.8 });
    /* 2. the blood and the impact effect, at the body's measured middle. */
    burstAtHim();
    /* 3. the noise, then the line — both inside the sequence, in that order.
     *
     * `play`, NOT `interject`. Interjecting only jumps the QUEUE; it waits for
     * whatever is mid-sentence to finish, so swinging while Gratin was still
     * explaining the cord put the crack and the blood on screen now and the
     * noise xXx made four seconds later, attached to nothing. A man being hit
     * cuts the room off, so this cuts the room off. Only ever this module's
     * own lines are interrupted — the mission runs its own controller. */
    dialogue.play(SWING_LINES[Math.min(torture.swings, SWING_LINES.length) - 1]);
  }

  /* ---------------------------------------------------------------- */
  /* THE IMPACT                                                        */
  /*                                                                    */
  /* Owner: "a blood and impact effect as well."                       */
  /*                                                                    */
  /* BUILT HERE, ON PURPOSE. `scenes/SilentSquatch.js` owns xXx, his    */
  /* chain, his figure and the pool of blood already under him, and it  */
  /* is not edited by this pass — so this reads what it needs off the   */
  /* published `lab.xxx` handle and adds its own meshes to the scene    */
  /* beside them. It never writes to anything the environment owns.     */
  /*                                                                     */
  /* WHERE the cord lands is MEASURED rather than authored: the world     */
  /* box of `lab.xxx.aim` is the body as it is actually built and hung,   */
  /* so the spray comes off his back at whatever height he is at, and it  */
  /* cannot drift if the rig is re-hung.                                   */
  /* ---------------------------------------------------------------- */
  const M_BLOOD = mat({ color: 0x5e0d0d, roughness: 0.32, metalness: 0.02 });
  const M_BLOOD_WET = mat({ color: 0x3a0707, roughness: 0.18, metalness: 0.04 });
  /* `unique`, because this one's opacity is animated and a shared material
   * would fade whatever else happened to be built from the same parameters. */
  const M_IMPACT = mat({
    color: 0xffd9b0,
    emissive: 0xff9a5a,
    emissiveIntensity: 2.4,
    roughness: 1,
    transparent: true,
    opacity: 1,
    unique: true,
  });
  /** Droplets in flight, floor marks that have landed, and the flash. */
  const spray = [];
  const marks = [];
  let flash = null;
  /** Floor marks are permanent, so they are capped and recycled. */
  const MAX_MARKS = 28;
  const strike = new THREE.Vector3();
  const bodyBox = new THREE.Box3();

  /** The middle of the man, in world space, this frame. */
  function strikePoint() {
    const aim = torture?.target ?? lab?.xxx?.aim ?? null;
    if (aim?.isObject3D) {
      aim.updateMatrixWorld(true);
      bodyBox.setFromObject(aim);
      if (!bodyBox.isEmpty()) return bodyBox.getCenter(strike);
    }
    /* No aim mesh in this build: fall back to the hanging anchor, a metre
     * under the ankles, which is where a man on a hook has a back. */
    const a = lab?.xxx?.at ?? { x: 0, y: BASEMENT_Y, z: 0 };
    return strike.set(a.x, (lab?.xxx?.rig?.ankleY ?? (a.y + 1.6)) - 0.95, a.z);
  }

  /** The floor he is hanging over, for the marks to land on. */
  function floorUnderHim() {
    return (lab?.xxx?.at?.y ?? BASEMENT_Y) + 0.012;
  }

  /**
   * One hit: a flash of contact, and blood off it.
   *
   * The droplets are thrown with real velocity and fall under gravity, so
   * they land where the physics puts them rather than where somebody decided
   * a spatter looks good — and each one that reaches the floor leaves a mark
   * that stays for the rest of the night. Six swings and the floor tells you
   * how many, which is the same job Snow's cart is foreshadowing.
   */
  function burstAtHim() {
    const at = strikePoint();

    /* The contact itself: one bright, brief, tiny sphere. It is gone in an
     * eighth of a second — long enough to see the cord ARRIVE somewhere. */
    if (!flash) {
      flash = cylinder({ r: 0.09, h: 0.02, pos: [0, 0, 0], mat: M_IMPACT, cast: false });
      flash.name = 'mansion.whipImpact';
      scene.add(flash);
    }
    flash.position.copy(at);
    flash.visible = true;
    flash.userData.life = 0.14;

    /* And the blood. Away from the body, mostly along the swing, and down. */
    for (let i = 0; i < 9; i++) {
      const drop = box({
        size: [0.035, 0.035, 0.035], pos: [at.x, at.y, at.z], mat: M_BLOOD, cast: false,
      });
      drop.name = 'mansion.whipBlood';
      const a = Math.random() * Math.PI * 2;
      const speed = 1.1 + Math.random() * 2.2;
      drop.userData.vel = new THREE.Vector3(
        Math.cos(a) * speed * 0.55,
        0.7 + Math.random() * 1.5,
        Math.sin(a) * speed * 0.55,
      );
      drop.userData.life = 1.6;
      scene.add(drop);
      spray.push(drop);
    }
  }

  /** Blood in the air, and the flash. Called every frame the scene runs. */
  function updateImpact(dt) {
    if (flash?.visible) {
      flash.userData.life -= dt;
      const k = Math.max(0, flash.userData.life / 0.14);
      /* Opens out and thins away, which is how a struck surface reads. */
      flash.scale.setScalar(0.6 + (1 - k) * 2.6);
      M_IMPACT.opacity = k;
      if (flash.userData.life <= 0) flash.visible = false;
    }
    if (!spray.length) return;
    const floorY = floorUnderHim();
    for (let i = spray.length - 1; i >= 0; i--) {
      const drop = spray[i];
      const v = drop.userData.vel;
      v.y -= 9.81 * dt;
      drop.position.addScaledVector(v, dt);
      drop.userData.life -= dt;
      const landed = drop.position.y <= floorY;
      if (!landed && drop.userData.life > 0) continue;
      spray.splice(i, 1);
      drop.parent?.remove(drop);
      if (!landed) continue;
      /* It hit the floor. Leave something behind. */
      const mark = cylinder({
        r: 0.05 + Math.random() * 0.11,
        h: 0.006,
        pos: [drop.position.x, floorY, drop.position.z],
        mat: M_BLOOD_WET,
        cast: false,
      });
      mark.name = 'mansion.whipBloodMark';
      scene.add(mark);
      marks.push(mark);
      while (marks.length > MAX_MARKS) {
        const oldest = marks.shift();
        oldest?.parent?.remove(oldest);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Barks                                                             */
  /* ---------------------------------------------------------------- */
  const here = new THREE.Vector3();
  function playerPosition() {
    if (player?.position) return player.position;
    if (camera?.position) return camera.position;
    return here;
  }

  /** Whether the mission has the case in the player's hands right now. Only
   * the mission knows; this module never guesses at its state. */
  function carryingCase() {
    return typeof hasCase === 'function' ? hasCase() === true : false;
  }

  /**
   * Which BODY a line comes out of.
   *
   * One entry per casting key in `SPEAKERS`, so a line played anywhere moves
   * the mouth of the man who is saying it. The four guards who now have their
   * own voice profile resolve to their own body — `GUARD_STAIRS` is the man
   * on the stairs and nobody else — and only the shared perimeter throat has
   * to guess, because two men genuinely share it.
   *
   * Everybody not standing in this house resolves to null and is simply a
   * subtitle: the six scientists are the laboratory's own figures and it
   * speaks them itself (`lab.scientists[i].say`), and the Prospect is the
   * player, who has no body to animate.
   */
  /**
   * xXx's mouth, behind an adapter.
   *
   * `lab.xxx.say(cue, opts)` takes a cue name, not a duration — it is the
   * laboratory's own positional-audio path. Everything else here is an `Npc`
   * whose `say(seconds)` just runs the talk animation, so his is wrapped to
   * that shape rather than special-cased in the wrapper. Passing a null cue
   * moves the head without playing a second copy of a line the dialogue
   * controller is already playing.
   */
  const xxxMouth = lab?.xxx
    ? { say: (seconds) => lab.xxx.say?.(null, { seconds }) }
    : null;

  function speakerFor(speakerKey) {
    switch (speakerKey) {
      /* the house's own staff */
      case 'GATE': return people.gateMan;
      case 'GRATIN': return torture?.npc ?? null;
      case 'BARTENDER': return people.bartender;
      case 'SNOW': return people.snow;
      case 'GUARD_STAIRS': return people.stairs;
      case 'GUARD_BASEMENT': return people.basement;
      case 'GUARD_VAULT': return people.vault;
      /* Two men still share `mansion-guard` on the perimeter, so "which body"
       * is whichever of them the player is standing in front of. */
      case 'GUARD':
      case 'GUARD_PERIMETER': return nearestGuard();
      /* the Family */
      case 'LOU': return people.lou;
      case 'BOOSKI': return people.booski;
      case 'DEATHMEGATRON': return people.deathmegatron;
      case 'IRISH': return people.irish;
      case 'RIPPIN': return people.rippin;
      case 'ERIC': return people.eric;
      case 'SHUBES': return people.shubes;
      case 'SASOLE': return people.sasole;
      case 'NUMBSKULL': return people.numbskull;
      case 'HOGMAMA': return people.hogmama;
      /* The man on the rope, so every noise and every sentence he has moves
       * his head — the swing's, and the mission's two barks as well. */
      case 'XXX': return xxxMouth;
      default: return null;
    }
  }

  /** Who the shared perimeter profile is coming out of: whoever is nearest. */
  const GUARD_POSTS = ['patrol0', 'patrol1', 'patrol2', 'stairs', 'basement', 'vault'];
  function nearestGuard() {
    const p = playerPosition();
    let best = null;
    let bestD = Infinity;
    for (const id of GUARD_POSTS) {
      const npc = people[id];
      if (!npc) continue;
      const d = npc.group.position.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = npc; }
    }
    return best;
  }

  /* ================================================================ */
  /* THE MOUTHS THE MISSION MOVES                                      */
  /*                                                                    */
  /* The cast and PROJECT SILENT SQUATCH are two DialogueControllers    */
  /* sharing one subtitle bar (main.js passes the mission's HUD in).    */
  /* The cast's own controller already animates its speaker; the        */
  /* mission's did not, because the mission has never known that any of */
  /* these people have bodies -- it plays a line and calls showLine.    */
  /*                                                                     */
  /* So: whatever puts a line on the shared bar moves the right man's    */
  /* mouth, whichever controller wrote it. That is done by wrapping the  */
  /* ONE method both of them call, once, at mount -- not by reaching     */
  /* into the mission, which owns its own writing and timing and should  */
  /* not learn about meshes to get a jaw moving. The cast's own onLine   */
  /* no longer calls `say` itself, so there is exactly one path.         */
  /* ================================================================ */
  let unwrapScreen = null;
  if (screen && typeof screen.showLine === 'function' && !screen.__castSpeaks) {
    const inner = screen.showLine.bind(screen);
    const own = Object.prototype.hasOwnProperty.call(screen, 'showLine')
      ? screen.showLine : null;
    unwrapScreen = () => {
      if (own) screen.showLine = own; else delete screen.showLine;
      delete screen.__castSpeaks;
    };
    screen.showLine = (line) => {
      /* `hold` is the authored reading time and is now only the FALLBACK: a
       * mouth runs on the take when there is one (src/core/mouth.js), so a
       * recording that is longer or shorter than the guess no longer leaves a
       * man chewing after he has stopped talking.
       *
       * The take is fetched from the engine rather than handed in, because the
       * two controllers that reach this bar play their cues in two different
       * modules and neither of them knows a body exists — which is the whole
       * point of wrapping the one method they share. `lastVoicePlayback`'s
       * window is what makes that safe: the `play()` happened in this same JS
       * turn, and an unrecorded line finds nothing rather than borrowing the
       * previous speaker's voice. */
      const take = audio?.lastVoicePlayback?.() ?? null;
      speakerFor(line?.speaker)?.say?.(
        Math.max(1.2, line?.hold ?? 2),
        take ? { source: take.source, analyser: take.analyser } : null,
      );
      return inner(line);
    };
    screen.__castSpeaks = true;
  }

  /**
   * Gratin's whole approach, in one run: he tells you to give him a minute,
   * the Prospect points out that it is always him, he explains that he is good
   * at it, and then he offers you a turn.
   *
   * Played as ONE sequence rather than three interjections, because it is one
   * exchange and the controller's `interject` would let a guard's bark land in
   * the middle of it. The HUD says which button only in `onDone` — the man
   * finishes asking, and then the screen clarifies. docs/TONE-AND-PARODY.md's
   * rule, and `sayThenInstruct`'s shape.
   */
  function offerTheSwing() {
    if (!torture || torture.offered) return;
    torture.offered = true;
    dialogue.play([
      ...SEQUENCES.tortureGreeting,
      ...SEQUENCES.tortureAlwaysYou,
      ...SEQUENCES.tortureOffer,
    ], {
      onDone: () => {
        /* Which button, and it names the man it is about — the old single
         * instruction said "take your swing" while the only thing you could
         * press was Gratin, which taught the player that Gratin IS the swing.
         * That is the misunderstanding the whole rework is fixing. */
        if (!torture.handed) screen?.setInstruction?.(INSTRUCTIONS.TAKE_THE_CORD);
      },
    });
  }

  /** You looked at it and kept walking. He is not offended. */
  function declineTheSwing() {
    if (!torture || !torture.offered || torture.handed || torture.declined) return;
    torture.declined = true;
    screen?.setInstruction?.('');
    dialogue.interject(SEQUENCES.tortureDeclined);
  }

  function updateBarks(dt) {
    const p = playerPosition();
    /* Feet, not eyes. The house is four storeys deep in places and every one
     * of them is stacked in the same XZ column, so a man in the basement must
     * not greet somebody standing on the landing above him. */
    const feetY = p.y - (player?.eyeHeight ?? 1.66);
    for (const entry of posts) {
      const d = Math.hypot(
        entry.npc.group.position.x - p.x,
        entry.npc.group.position.z - p.z,
      );
      const inside = d <= entry.range
        && Math.abs(entry.npc.group.position.y - feetY) < 2.4;
      if (!inside) {
        if (entry.near > 0) entry.onLeave?.();
        entry.near = 0;
        continue;
      }
      entry.near += dt;
      /* A man turns to say his line and then stays where he turned. The heads
       * track on their own (`Npc.look`); this is the body, and only on the
       * frame he speaks — a guard who pivots every time somebody walks past
       * stops reading as a man standing a post. Patrols never turn: they are
       * walking a route and the route is the character. */
      const turn = () => { if (entry.npc.job !== 'patrol') entry.npc.faceToward(p.x, p.z); };
      if (!entry.said && (entry.bark || entry.onArrive)) {
        entry.said = true;
        turn();
        if (entry.onArrive) entry.onArrive();
        else dialogue.interject(entry.bark);
        continue;
      }
      /* An idle line is what somebody says into a silence, so it waits for
       * one. Interjected while a run is going it lands in the MIDDLE of it —
       * Gratin's offer came out as greeting, gag, "take your turn or don't",
       * and then the question, in that order. */
      if (!entry.saidIdle && entry.idle && entry.near >= IDLE_SECONDS && !dialogue.busy) {
        entry.saidIdle = true;
        turn();
        dialogue.interject(entry.idle);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* The handle                                                        */
  /* ---------------------------------------------------------------- */
  return {
    people,
    cart,
    dialogue,
    /**
     * The cellar guard's television, for the composition root to switch on.
     *
     * `screen` is the mesh `src/mansion/main.js`'s own `mountTv` paints — the
     * same shape `interior.props.lounge.tv.screen` and `…kitchen.tv.screen`
     * hand it. ONE LINE turns this set on, and it must go where the house's
     * other sets are mounted rather than after the cast, because the glow-light
     * loop that fills in `tv._glowLight` runs between them and the render loop
     * dereferences it every frame:
     *
     *   const cellarTv = mountTv(cast.tv.screen, { channel: 1 });
     *
     * Unmounted, this is a switched-off television, and the guard is watching
     * it either way. See the note where it is built for why the live `Tv` is
     * not driven from in here.
     */
    tv: {
      group: cellarTv.group,
      screen: cellarTv.screen,
    },
    /**
     * Boxes the composition root should push into `world.colliders` and count,
     * exactly the way it counts the armory's racks. Two entries: Snow's cart
     * and the cellar television. Nobody's BODY is in here — the house has
     * never made a person solid and this module is not the place to start.
     */
    colliders: [cartCollider, cellarTvCollider],
    /** Snow's body, published so a caller can prove he is here. He carries no
     * threat state, no health and no team, and nothing in this module gives
     * him any. */
    get snow() { return people.snow; },
    /** The two verbs, for a caller that wants to drive them without a mouse.
     * `takeCord` is Gratin; `swing` is xXx, and it works every time. */
    takeCord: () => handTheCordOver(),
    swing: () => swingAtHim(),

    update(dt) {
      if (!enabled()) return;
      const p = playerPosition();
      for (const key of Object.keys(people)) people[key].update(dt, p);
      updateBarks(dt);
      dialogue.update(dt);

      if (torture && torture.swing >= 0) {
        torture.swing += dt / SWING_SECONDS;
        if (!torture.landed && torture.swing >= SWING_LANDS_AT) resolveSwing();
        if (torture.swing >= 1) {
          torture.swing = -1;
          /* The cord is NOT taken back at the end of the swing any more. It
           * was, which is the other half of why the whip felt like it worked
           * once: the arm went down and the thing left your hand. It is yours
           * now, and it rests until you use it again. */
          if (torture.cord) poseCord(torture.cord, -1);
        } else if (torture.cord) {
          poseCord(torture.cord, torture.swing);
        }
      }
      updateImpact(dt);
    },

    /** The headless surface, the same shape the mission's `debug` has. */
    debug: {
      get roster() {
        return Object.entries(people).map(([id, npc]) => ({
          id,
          name: npc.name,
          job: npc.job,
          x: Number(npc.group.position.x.toFixed(2)),
          y: Number(npc.group.position.y.toFixed(2)),
          z: Number(npc.group.position.z.toFixed(2)),
        }));
      },
      get spoken() { return [...dialogue.cueLog]; },
      get stages() { return [...stages]; },
      get gratin() {
        if (!torture) return null;
        return {
          offered: torture.offered,
          /** The cord has been handed over. The house rule is on this. */
          handed: torture.handed,
          /** How many times it has actually landed. Not capped at one. */
          swings: torture.swings,
          swinging: torture.swing >= 0,
          landed: torture.landed,
          hasCord: Boolean(torture.cord),
          /** Blood on the floor under him, one mark per droplet that got
           * there — the effect proved by its result rather than by a flag. */
          bloodMarks: marks.length,
        };
      },
      /**
       * Proof, in code, of the standing rule.
       *
       * `whipTargets` is the whole list of things the cord can be pointed at
       * and it has exactly one entry, which is the mesh of the man already
       * hanging from the ceiling. Snow is not in it, cannot be added to it by
       * any code path in this module, and there is no resolver that would
       * consult it if he were.
       */
      snowIsATarget: false,
      get whipTargets() { return torture?.target ? ['lab.xxx.aim'] : []; },
      takeCord: () => handTheCordOver(),
      swing: () => swingAtHim(),
      hud: () => screen?.text?.() ?? null,
    },

    dispose() {
      /* Put the shared subtitle bar back the way it was found. The mission
       * outlives this module in a scene that unmounts the cast, and leaving a
       * closure over dead NPCs on its HUD is a leak with a body count. */
      unwrapScreen?.();
      ownHud?.dispose?.();
      takeCordBack();
      for (const npc of Object.values(people)) {
        interaction?.unregister?.(npc.group);
        npc.group.parent?.remove(npc.group);
      }
      /* The one mesh this module registered that is not one of its own
       * bodies. It belongs to the laboratory and is only borrowed. */
      if (torture?.target) interaction?.unregister?.(torture.target);
      cart.parent?.remove(cart);
      /* The cellar set. */
      cellarTv.group.parent?.remove(cellarTv.group);
      /* The blood, in the air and on the floor, and the flash. */
      for (const drop of spray.splice(0)) drop.parent?.remove(drop);
      for (const mark of marks.splice(0)) mark.parent?.remove(mark);
      flash?.parent?.remove(flash);
      flash = null;
      M_IMPACT.dispose?.();
    },
  };
}
