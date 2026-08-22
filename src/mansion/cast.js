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
import { Npc, BADA_BING_PERFORMERS } from '../bing/cast.js';
import { FAMILY, buildFamilyScripts } from '../bing/family.js';
import {
  SWING_LANDS_AT, SWING_SECONDS, makeCord, poseCord,
} from '../bing/license-to-grill-runtime.js';
import {
  BADA_BING_BARTENDER, BIG_UNCLE_LOU_MANSION, BOOSKI, CAPTAIN_LOU_SASOLE, DEATHMEGATRON,
  ERIC, GRATIN, HOG_MAMA, IRISH, MANSION_BOOTH_MAN, MANSION_DOOR_MAN,
  MANSION_GUARDS, NUMBSKULL, RIPPINFLOW, SHUBENATOR, SNOW,
} from '../core/wardrobe.js';
import { CHARACTER_IDS } from '../core/campaign.js';
import { coarseActorRole, markActor } from '../core/staging.js';
import { TimingBar } from '../core/timingbar.js';
import { box, cylinder, group, mat } from '../world/build.js';
import { createDressHelpSequence } from '../world/dress-help.js';
import { createDressHelpFocus } from '../world/dress-help-focus.js';
import { createDressHelpActorStaging } from '../world/dress-help-staging.js';
import { mountLilTomCruze } from './dog.js';
import {
  createLanGamerMotion, createPoolTreadingMotion, createSeatedPerformerMotion,
} from './performer-motion.js';
import { DialogueController } from './mission/DialogueController.js';
import { createMissionHud } from './mission/hud.js';

/** The cast owns who is sitting in a theatre chair; the Mansion composition
 * owns whether the player may use it. Publish that ownership on the chair so
 * both halves read the same fact instead of keeping parallel seat lists. */
export function theatreSeatOccupant(seat) {
  const id = seat?.userData?.theatreSeat?.occupiedBy;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export function markTheatreSeatOccupied(seat, occupantId) {
  const data = seat?.userData?.theatreSeat;
  if (!data || typeof occupantId !== 'string' || occupantId.length === 0) return false;
  data.occupiedBy = occupantId;
  return true;
}

export function theatreSeatAvailable(seat, {
  activeSeat = null,
  playerMode = 'walk',
} = {}) {
  return Boolean(seat?.userData?.theatreSeat)
    && theatreSeatOccupant(seat) === null
    && activeSeat === null
    && playerMode === 'walk';
}
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
const sauceOpen = buildFamilyScripts()[CHARACTER_IDS.SAUCE]?.open ?? null;
const authoredValue = (value) => (typeof value === 'function' ? value() : value);
const SAUCE_MANSION_BARK = Object.freeze([Object.freeze({
  speaker: 'SAUCE',
  text: authoredValue(sauceOpen?.line),
  cue: authoredValue(sauceOpen?.cue),
  hold: sauceOpen?.hold ?? 5.8,
})]);

const ERIC_MANSION_AMBIENT_CUES = Object.freeze([
  ...SEQUENCES.ericTable,
  ...SEQUENCES.ericIdle,
].map((line) => line?.cue).filter(Boolean));

/**
 * Recorded cast-owned cues outside the Mansion's `vo.silentsquatch.` boot
 * prefix. The cord trio are local effects; Sauce's one safe Mansion bark is
 * the existing authored Bing opener, not a newly invented line. Keeping that
 * exact generated cue here makes it resident before the proximity gate asks
 * `AudioEngine.play()` for it.
 */
export const MANSION_CAST_CUE_NAMES = Object.freeze([
  'bing.grill.cord.handoff',
  'bing.grill.cord.swing',
  'bing.grill.cord.whip',
  SAUCE_MANSION_BARK[0].cue,
]);

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

/**
 * WHO IS IN THE HOUSE, IN THE STAGING GATE'S WORDS. docs/STAGING-GATE.md.
 *
 * `Npc` already stamps a marker and takes its id from the display NAME, which
 * is right in the Bing -- a floor full of anonymous drinkers -- and wrong
 * here. Six of the men in this house are called 'a guard' and two of the
 * women 'a dancer', so the ids came out as 'a guard-4' and 'a dancer-2': a
 * numbering that renumbers itself the first time somebody adds a guard in the
 * middle of the list, which is precisely what an authored id exists to
 * prevent. The `post()` id -- 'vault', 'oldStove', 'poolPerformer2' -- is
 * already the stable handle every other part of this module uses, so it is
 * the one the gate gets too.
 *
 * ROLES ARE THE HOUSE'S OWN WORDS, TRANSLATED. They go through
 * `coarseActorRole` rather than into `markActor` raw, because that call
 * validates strictly and throws on a word it has not been taught -- which is
 * how a role of 'performer' took the whole Bing build down, 46 tests, in the
 * very change that added the marker (see ACTOR_ROLE_FOR_SCENE_ROLE). Without
 * them the gate saw one undifferentiated crowd: it called the man in the
 * booth a bystander, and it called Shubes a GUARD because he happens to walk
 * a loop, so a rank of real guards agreeing on a heading could never be told
 * from a family party agreeing on one.
 *
 * The heights are declared for the same reason `faceAxis` is. The marker's
 * defaults -- 2.30 m eye, 1.16 m hip -- are `core/person.js`'s Sasquatch, and
 * everybody in this house is a `makePerson` human. Measured on the built rig
 * across model heights 1.66..2.00 m, the head centre sits at 1.637 x
 * heightScale and the hips at 1.000 x heightScale, linear in both; the
 * default puts an eye ray half a metre above the head it is meant to come out
 * of, which is how a man staring at a wall reads as a man staring over it.
 */
const ACTOR_EYE_PER_SCALE = 1.637;
const ACTOR_HIP_PER_SCALE = 1.000;

function markMansionActor(npc, { id, role, seat }) {
  markActor(npc.group, {
    id,
    role: coarseActorRole(role),
    /* What the rig actually DID with the job, not what the post asked for:
     * `Npc` decides between sitting and standing itself, and `sit()`/`stand()`
     * keep the live posture moving from there. */
    posture: npc.seated ? 'sit' : 'stand',
    eyeHeight: ACTOR_EYE_PER_SCALE * npc.parts.heightScale,
    hipHeight: ACTOR_HIP_PER_SCALE * npc.parts.heightScale,
    ...(seat ? { seat } : {}),
  });
  return npc;
}

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
  ape: 'assets/faces/ape.png',
  stove: 'assets/faces/stove.png',
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
const FAMILY_BY_ID = new Map(FAMILY.map((member) => [member.id, member]));
const familyModel = (id) => FAMILY_BY_ID.get(id)?.model ?? null;

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

/* ================================================================== */
/* ...AND THEN MEASURING IT IN THE HOUSE THAT WAS ACTUALLY BUILT        */
/*                                                                       */
/* Owner playtest, 2026-08-06: *"Chair sitters (Hog Mama, Capt Sasole)    */
/* clip through their chairs."* Measured, in the running game:            */
/*                                                                        */
/*   Hog Mama   hips 80 mm inside the kitchen stool's cushion, thighs      */
/*              90 mm into it, and her back 40 mm inside its backrest      */
/*   Sasole     hips 110 mm inside the bay bar stool's cushion, and        */
/*              through the gold ring on top of it as well                 */
/*   Eric       correct, on a dining chair, with the same arithmetic       */
/*                                                                          */
/* WHY THE ARITHMETIC CANNOT FIX IT. `seatBase` needs two numbers: how high  */
/* the seat is, and how far above its base the folded pose puts a backside.  */
/* The second one is a single constant and it is not a constant: the         */
/* correction Hog Mama needs is 80 mm and the one Sasole needs is 130 mm,    */
/* on the same formula, because they are different heights on differently    */
/* built bodies. And the first one was read off the seats' COLLIDERS, which  */
/* stand 15 mm and 35 mm proud of the cushions they cover.                   */
/*                                                                            */
/* So the arithmetic stays as the placement — it is right to within a few      */
/* centimetres and it is what puts him at the right seat at all — and then     */
/* this measures the result and corrects it. One ray, straight down out of      */
/* the underside of his own hips, at mount, against the house as built. What    */
/* it finds is the seat's real surface, whatever the seat is and whoever is     */
/* sitting on it, and it cannot drift when somebody re-covers a stool.          */
/*                                                                              */
/* The feet are still allowed to fall where they fall (see `seatBase`).         */
/* ================================================================== */
const _seatRay = new THREE.Raycaster();
const _seatDown = new THREE.Vector3(0, -1, 0);
const _seatBox = new THREE.Box3();
const _seatAt = new THREE.Vector3();
const _seatMeshes = [];
/** How far a correction is allowed to move somebody. Anything larger is a
 * figure over a hole in the floor rather than a pose that needs 8 cm. */
const SEAT_MAX_LIFT = 0.35;

/** True if this object is any part of any NPC's body. */
function partOfSomebody(object) {
  for (let o = object; o; o = o.parent) if (o.userData?.npc) return true;
  return false;
}

/**
 * Where the surface under a seated man's hips is, and where his hips are.
 *
 * The ray starts ABOVE his hips rather than below them, and that is the whole
 * trick: a man who is sunk into a cushion has his hips INSIDE it, and a ray
 * that starts inside a box and points down leaves through a back face, which
 * `MeshStandardMaterial`'s front-side culling throws away. The first version
 * of this started 20 mm under his backside, sailed straight through the stool
 * it was measuring, hit the kitchen floor, decided that was a 730 mm
 * correction, refused it as absurd, and moved nobody at all.
 *
 * Returns `{ hips, seat }` in world Y, or null when there is nothing under
 * him. The hit must be at or below the TOP of his hips — a bar counter
 * overhanging him is not a seat.
 */
function seatUnder(scene, npc) {
  const hips = npc?.parts?.hips;
  if (!scene || !hips) return null;
  npc.group.updateMatrixWorld(true);
  _seatBox.setFromObject(hips);
  if (_seatBox.isEmpty()) return null;
  const underside = _seatBox.min.y;
  const top = _seatBox.max.y;
  _seatBox.getCenter(_seatAt);
  _seatRay.set(new THREE.Vector3(_seatAt.x, top + 0.35, _seatAt.z), _seatDown);
  _seatRay.far = 1.6;
  /* Raycast only tangible mesh geometry. The scene also owns HUD labels and
   * smoke sprites; Three's Sprite.raycast requires a camera on the raycaster,
   * while this strictly vertical construction probe intentionally has none.
   * Seats, cushions, floors and instanced fixtures are all meshes. */
  _seatMeshes.length = 0;
  scene.traverse((object) => {
    if (object.isMesh) _seatMeshes.push(object);
  });
  const hit = _seatRay.intersectObjects(_seatMeshes, false)
    .find((candidate) => !partOfSomebody(candidate.object) && candidate.point.y <= top);
  return { hips: underside, seat: hit ? hit.point.y : null };
}

/**
 * Put a seated figure ON its seat rather than IN it. Returns the metres he
 * moved, or null when there was nothing under him to sit on.
 */
function sitOnTheSeat(scene, npc) {
  if (!npc?.seated) return null;
  let moved = 0;
  /* Three passes, because lifting a man can change WHICH surface is under
   * him: the pair in the hot tub come up off its floor and onto its moulded
   * seat, and one correction leaves them 50 mm into the ledge they have just
   * arrived over. It settles in two; the third is there so "it settled" is a
   * fact rather than a hope. */
  for (let pass = 0; pass < 3; pass++) {
    const found = seatUnder(scene, npc);
    if (!found || found.seat === null) return pass === 0 ? null : +moved.toFixed(3);
    const lift = found.seat - found.hips;
    if (!Number.isFinite(lift) || Math.abs(lift) > SEAT_MAX_LIFT) break;
    if (Math.abs(lift) < 0.005) break;
    npc.group.position.y += lift;
    /* `baseY` too, or the next `stand()`/`sit()` puts him straight back. */
    npc.baseY += lift;
    npc.group.updateMatrixWorld(true);
    moved += lift;
  }
  return +moved.toFixed(3);
}

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
/**
 * ...AND HOW FAR THE MAN IN THE BOOTH SHOUTS, WHICH IS ACROSS THE DRIVE.
 *
 * Owner playtest, 2026-08-06, on the booth guard's lines: verify the trigger
 * fires. IT DID NOT, and it was arithmetic rather than wiring.
 *
 * His counter is at x 8.32, z 3.82. The drive he is watching is x −4 to +4
 * (MansionGrounds' own note on the barrier arm: "the drive is x −4..4; the
 * booth is 3 m east of its kerb"), and the player spawns at x 0 and walks
 * straight up it. The closest that walk ever comes to him is 8.32 m — and he
 * was on `GATE_RANGE`, 8.0. So the first person in the game to speak to the
 * Prospect never spoke, and he never spoke by 32 centimetres, on the exact
 * path the game starts you on. Hugging the east kerb triggered him and walking
 * up the middle did not, which is the worst kind of working.
 *
 * 12.5 m is the width of the thing he is watching, not a number that felt
 * safer: counter to the far kerb is 8.32 + 4 = 12.32, so anybody who passes
 * his barrier gets challenged whichever side of the road he uses. He is a man
 * at a gate shouting at a car; the distance IS the part.
 */
const BOOTH_RANGE = 12.5;

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
/* THE OLD-SCHOOL SET IS GONE (owner playtest, verbatim: *"the old school
 * tv in the cellar is misaligned — get rid of it and make the flat screen a
 * working tv"*).
 *
 * `makeCellarTvSet()` used to live here: a wood-cased television on splayed
 * legs, standing in the armory at `armoryCenter + (0, 0, 4.4)`, with the
 * guard's yaw derived to land on it. Two things were wrong with it and only
 * one was the alignment.
 *
 *  - The alignment. `tools/scene-audit.mjs` reported
 *    `mansion.cellarTv.screen × mansion.cellarTv.screen ... share the z
 *    plane over 0.47 m²` — the picture and the bezel it stands "a couple of
 *    millimetres proud of" were not proud of it at all once the group was
 *    turned through π, so the whole face of the set flickered.
 *  - THE ROOM ALREADY HAD A TELEVISION. `SilentSquatch.js` builds a
 *    flatscreen on a unit in the entertainment area, four metres away, in
 *    the room that exists for watching it — and it was a dead black
 *    rectangle. So the cellar had two sets, one broken and one switched off.
 *
 * One set now: the flatscreen, painted by `core/tv.js` from `main.js`, with
 * the guard standing in the room it is in. See `lab.tv`.
 */

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
/* GEOMETRY_GATE_MANSION_CAST_FIXTURE_JOIN: exact seated or reclining cast contacts are limited to the chair, stool, riser or lounger that owns the authored pose. */
export function mountMansionCast(scene, world = {}, {
  interaction = null,
  camera = null,
  player = null,
  audio = null,
  campaign = null,
  anchors = null,
  lab = null,
  /** `interior.props.masterSuite` — the third floor's own published spots. */
  suite = null,
  /** `grounds.props.poolPatio` — its actual loungers, waterline and basin. */
  pool = null,
  /** `interior.props.theatre` — its real recliners and screen. */
  theatre = null,
  /** `interior.props.lanRoom` — its stations, and the one with RuneScape on
   * it (`runescapeStation`), where Shubes sits for the quiet evening. */
  lan = null,
  hud = null,
  /** Shared real-body distance/floor/wall/cooldown policy from main.js. */
  speechGate = null,
  /** `(speakerId) => Box3[] | Set<Box3> | null`. Exact fixture blockers a
   * speaker owns and may project through; all unrelated LOS stays intact. */
  speechOcclusionExceptions = null,
  hasCase = null,
  /**
   * Told when Gratin hands the cord over, and when it goes back.
   *
   * Owner playtest: *"I should be able to put the whip away"*. He could not
   * — the cord was parented to the camera the moment Gratin let go of it and
   * stayed in shot for the rest of the night, including through the delivery,
   * the execution and the walk back upstairs. Everything else the player
   * carries in this house is an inventory slot (`../loadout.js`); this was
   * the one thing that was not.
   *
   * Same split as the case, for the same reason: OWNING it is this module's
   * business and HOLDING it is the player's, and collapsing the two is how
   * you get a cord that jumps back into shot every time a beat fires. See
   * `setCordInHand` on the returned object.
   */
  onCordOwned = () => {},
  /**
   * Booski taking the case off him — `() => boolean`, true if the mission
   * accepted it.
   *
   * The delivery is the mission's beat and Booski's body is this module's, and
   * neither half is allowed to import the other: the mission is mounted first
   * and has never heard of a man called Booski, and this module has never
   * heard of a mission. So the composition root passes the verb down, exactly
   * as it does with `hasCase` and `onCordOwned`. Omit it and Booski is a man
   * you can look at, which is what he was before the owner's note.
  */
  onDeliverCase = null,
  /** Optional return-visit action mounted on Big Uncle Lou's own body. */
  louInteraction = null,
  /** Quiet-evening gate and the reel currently in the theatre projector. */
  eveningEnabled = () => true,
  theatreChannel = () => '',
  /**
   * A settling-in beat of the quiet evening happened here (owner note,
   * 2026-08-19: the guest bed wants any two before sleep). Called with the
   * beat id -- 'bar', 'pool', 'dog', 'lan' -- from the activity that IS the
   * beat, unconditionally: the campaign story is the only writer of the
   * ledger and refuses everything outside the quiet evening, so this module
   * stays as ignorant of the save as it has always been.
   */
  onEveningBeat = () => {},
  /**
   * Which visit this mount dresses: 'mission' (the night of PROJECT SILENT
   * SQUATCH) or 'return' (the morning after the Enola, when the wire has
   * just said the Cartel took Sauce). The cast module never reads the URL or
   * the campaign — the composition root says which morning it is, the same
   * way it passes every other verb down.
   */
  visit = 'mission',
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
    playCue: (cue, _voice, line) => {
      /* Cue names are data, never a literal at a call site: none of this
       * scene's voice cues have recordings yet, so this is silence plus a
       * subtitle until they land and needs no code change when they do. */
      if (!cue || !audio?.hasSample?.(cue)) return;
      const mouth = speakerFor(line?.speaker);
      const source = mouth?.group ?? mouth?.root ?? null;
      const position = source?.getWorldPosition?.(new THREE.Vector3())
        ?? source?.position
        ?? null;
      /* THE FALLOFF IS SCALED TO THE DISTANCE HE SPEAKS FROM. This used to be
       * a flat `ref: 1.2` — a conversation panner — on every cast line, while
       * the two gate posts deliberately COMMIT from much further away: the
       * booth man challenges across his own drive (BOOTH_RANGE, 12.5 m) and
       * the door man stops you before you are on his step (GATE_RANGE, 8 m).
       * Measured on the live page, "Stop there. Name." dispatched at 10.05 m
       * and played at 9% of its level; the door man's greeting at 7.99 m
       * played at 11%. The trigger fired, the subtitle showed, and the walk-in
       * heard nothing (owner playtest, twice).
       *
       * So the panner's ref scales with the post's own bark range: at exactly
       * the distance a man is authored to open his mouth, his line lands at
       * ~47% level (inverse model, rolloff 1.4 — src/core/audio.js) instead
       * of a whisper, for every post uniformly. Conversation-range posts
       * (BARK_RANGE, 5 m) keep a close-in ref of 2.75 m, so nothing shouts
       * across the house — the shared speech gate still decides WHO can be
       * heard; this only makes the line audible at the range that gate and
       * the post agreed on. */
      const range = posts.find((entry) => entry.npc === mouth)?.range ?? BARK_RANGE;
      audio.play(cue, position ? {
        position,
        ref: Math.max(1.2, range * 0.55),
        maxDist: Math.max(14, range * 2),
      } : undefined);
    },
  });
  const stages = [];

  /* ---------------------------------------------------------------- */
  /* The people                                                        */
  /* ---------------------------------------------------------------- */
  const people = {};
  const posts = [];
  /** Everybody who is sitting on something, for the seat pass at the end. */
  const seated = [];

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
   *
   * `role` is the house's own word for who somebody is — 'guard', 'boss',
   * 'family_member', 'performer', 'clerk' — and this is the one place it is
   * translated for the staging gate. It defaults to `family_member` because
   * that is what most of a house full of the Family is; a post that means
   * something else says so. `seat` names the object a sitter should be on,
   * and is left off where a room's furniture shares one name (the theatre
   * recliners are all called `theatre-recliner`, so naming one would resolve
   * to whichever the traversal reached first). See `markMansionActor`.
   */
  function post(id, {
    model, name, x, y = 0, z, yaw = 0, job = 'stand', folded = false,
    route = null, speed = 1.0, tier = 'hero', role = 'family_member', seat = null,
    bark = null, idle = null, range = BARK_RANGE, look = null, onUse = null,
    interactEnabled = null, onArrive = null, onLeave = null,
  }) {
    const npc = new Npc(scene, {
      name, tier, job, x, y, z, yaw, route, speed, model, colliders,
    });
    markMansionActor(npc, { id, role, seat });
    npc.folded = folded;
    people[id] = npc;
    posts.push({
      id, npc, bark, idle, range, onArrive, onLeave, near: 0, said: false, saidIdle: false,
    });
    /* On the seat, not in it. Every seated body gets measured against the
     * house as built -- see `sitOnTheSeat`. Deferred until the whole cast is
     * standing, because a chair somebody else is about to be put on is still
     * furniture and the ray must not find a body that has not been corrected
     * yet. */
    if (npc.seated) seated.push({ id, npc });
    if (interaction && (look || onUse)) {
      /* ONE registration per body, on the body. `interaction.register` writes
       * `userData.interact`, so a second registration on the same object would
       * REPLACE this handler rather than add one — nothing in this module ever
       * registers a mesh twice, and nothing here touches a mesh the house or
       * the mission already owns. */
      interaction.register(npc.group, {
        label: look,
        key: onUse ? 'E' : 'LOOK',
        enabled: () => enabled()
          && (typeof interactEnabled === 'function' ? interactEnabled() : true),
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
   * the facade if it moves again.
   *
   * QA correction: the old +1.15 offset buried 30 cm of his back in the
   * glazing. +0.75 retains the top-tread position with clear air behind him. */
  const gateAt = { x: doorPost.x + 2.4, y: doorPost.y ?? GROUND_Y, z: doorPost.z + 0.75 };
  /**
   * Has he already given the case speech to this Prospect?
   *
   * `SEQUENCES.gateWarning` — "Do that again and you leave the property a
   * different way than you came onto it" — is a SECOND-time line. It was
   * written, cast, recorded and shipped with no state to fire from: the door
   * man had a bark, an idle and a one-branch `onUse`, so the only two things
   * he could ever say were the case speech and the wave-through, and the man
   * who ignored the case speech and came straight back got the case speech
   * again as if nothing had happened. The "that" the take refers to is walking
   * the case back up to the one man on this driveway who has been told not to
   * take it off you, and this is the flag that remembers you did.
   *
   * Per mount rather than per module: the flag belongs to this night, and a
   * scene rebuild is a new night.
   */
  let gateCaseSaid = false;
  post('gateMan', {
    role: 'guard',
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
      if (!carryingCase()) {
        dialogue.interject(SEQUENCES.gateInside);
        return true;
      }
      dialogue.interject(gateCaseSaid ? SEQUENCES.gateWarning : SEQUENCES.gateCase);
      gateCaseSaid = true;
      return true;
    },
  });

  /* ---- the man working the booth at the street gate --------------------
   *
   * Owner playtest, verbatim: *"ADD a guard working that booth"*. The booth
   * has been at (8, 0, 4) since the first pass with a chair in it and nobody
   * on the chair — an empty security post at the mouth of a property whose
   * basement has an interrogation room in it.
   *
   * HIS SPOT IS THE BOOTH'S OWN, not a number typed in here:
   * `MansionGrounds` publishes `anchors.boothPost` (inside, at the counter)
   * and `anchors.boothLook` (out over the drive), so if the booth moves he
   * moves with it. The shell was rebuilt in the same pass as four walls and a
   * glazed band precisely so that he can be seen doing the job — before that
   * it was a solid block and a man inside it was a man nobody would ever
   * know was there.
   *
   * `job: 'work'` rather than `'stand'`: he is at a counter with a book on
   * it, and the Npc work loop is the shifting-weight-and-writing idle. */
  const boothStand = at('boothPost', { x: 8.32, y: 0, z: 3.82 });
  const boothLook = at('boothLook', { x: 2, y: 0, z: 2.8 });
  post('booth', {
    role: 'guard',
    name: 'the man on the gate',
    model: MANSION_BOOTH_MAN,
    job: 'work',
    x: boothStand.x,
    y: boothStand.y ?? 0,
    z: boothStand.z,
    yaw: yawToward(boothStand.x, boothStand.z, boothLook.x, boothLook.z),
    /* Across the drive, not eight metres of it -- see BOOTH_RANGE. He was on
     * GATE_RANGE and the centre line of his own road is 8.32 m from his
     * window, so "Stop there. Name." never played for anybody who walked up
     * the middle, which is where the game starts you. */
    range: BOOTH_RANGE,
    bark: SEQUENCES.boothChallenge,
    idle: SEQUENCES.boothLoiter,
    look: 'He has your name written down already.',
    onUse: () => {
      dialogue.interject(carryingCase() ? SEQUENCES.boothCase : SEQUENCES.boothTalk);
      return true;
    },
  });

  /* ---- the perimeter ---------------------------------------------------
   * Three men, one voice, on three loops. The grounds publish each loop's
   * walking height: lawns are y 0, while the centre drive follows its 5 cm
   * paver top instead of burying the guards' shoes in it. */
  const PERIMETER_BARKS = [
    SEQUENCES.guardPathBark, SEQUENCES.guardCameraBark, SEQUENCES.guardLapBark,
  ];
  /* The grounds publish the live routes beside the geometry they avoid. The
   * legacy constant remains only as a fallback for isolated cast fixtures
   * that intentionally mount without MansionGrounds. */
  const perimeterRoutes = Array.isArray(anchors?.frontGuardRoutes)
    && anchors.frontGuardRoutes.length === PATROL_ROUTES.length
    ? anchors.frontGuardRoutes
    : PATROL_ROUTES;
  perimeterRoutes.forEach((route, i) => {
    post(`patrol${i}`, {
      role: 'guard',
      name: 'a guard',
      model: MANSION_GUARDS[i],
      tier: 'ambient',
      job: 'patrol',
      x: route[0].x,
      y: route[0].y ?? 0,
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
    role: 'guard',
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
   * watching tv."* Owner, 2026-08-06: *"the old school tv in the cellar is
   * misaligned — get rid of it and make the flat screen a working tv."*
   *
   * Both notes are one post. He used to stand in the ARMORY looking at a
   * cabinet set built by this file four metres up the room, while the
   * entertainment area next door — the room in this cellar that exists for
   * watching television, with a leather couch, a coffee table and a bar cart
   * pointed at it — had a flatscreen that was a dead black rectangle.
   *
   * So he is in the room with the working television now, and the set he is
   * watching is `lab.tv`, which `main.js` paints with `core/tv.js`. His spot
   * is DERIVED FROM THE SET rather than typed: 1.75 m east and 1.55 m back
   * from it, which is the corner of the room the couch, the coffee table and
   * the bar cart all leave empty — he is watching it standing up, off to one
   * side, rather than sitting on the family's couch or blocking its view of
   * the screen. If the entertainment area moves, he moves with it. Measured
   * on the built cellar: no collider contains him and the nearest is 0.6 m
   * away.
   *
   * Still on duty, not off it: same folded arms, same two lines about nothing
   * down here belonging to you. A guard watching a television is bored. A
   * guard sitting on the couch is a different character.
   *
   * `armoryCenter` remains the fallback for a house with no laboratory in it,
   * because without `lab` there is no entertainment area to stand in. */
  const armory = at('armoryCenter', { x: -2, y: BASEMENT_Y, z: 55.5 });
  const cellarSet = lab?.tv?.at ?? null;
  const basementAt = cellarSet
    ? { x: cellarSet.x + 1.75, y: BASEMENT_Y, z: cellarSet.z - 1.55 }
    : { x: armory.x + 2.2, y: armory.y, z: armory.z - 1.6 };
  const cellarTvAt = cellarSet ?? { x: armory.x, y: armory.y, z: armory.z + 4.4 };
  post('basement', {
    role: 'guard',
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
    look: 'Down here watching a television with the sound off.',
  });

  /* ---- the vault -------------------------------------------------------
   * In the cellar hall, in front of eleven inches of steel that is standing
   * open. Facing it, not the corridor: whatever he is worried about is inside
   * the room. */
  const vault = at('vaultCenter', { x: 13.4, y: BASEMENT_Y, z: 70.4 });
  /* Four metres south of the vault's own centre puts him out through the door
   * and into the cellar hall, which is where a man guarding a room stands. */
  const vaultPost = vault.z - 4.0;
  post('vault', {
    role: 'guard',
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
    role: 'clerk',
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
    /* The pour is a settling-in beat on the quiet evening; the story ignores
     * it every other hour of the night. */
    onUse: () => {
      dialogue.interject(SEQUENCES.bartenderJack);
      onEveningBeat('bar');
      return true;
    },
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
  /* -3.6, not -2.4. Owner playtest 2026-08-06: "Snow's cleaning equipment
   * intersects a table." The table is `foyer-centre-table`, standing on the
   * compass inlay at the foyer's own centre (MansionInterior.js's `inlayZ`
   * is this same `foyer.z`) with a collider x -1.4..1.4 -- and at -2.4 the
   * cart built 1.45 m east of `snowAt` (below) put the mop-bucket at
   * x -1.351..-0.549, 0.85 m of it inside the table's own western half.
   * Snow's own body was never the problem; only the cart, standing forward
   * of him, reached that far in. Moved the whole post 1.2 m further from
   * the centreline -- the cart's offset from Snow is untouched, so it still
   * clears him the same way the note below describes -- and the bucket now
   * sits at x -2.551..-1.749, 349 mm clear of the table's western edge. */
  const snowAt = { x: foyer.x - 3.6, y: foyer.y, z: foyer.z - 1.2 };
  post('snow', {
    role: 'family_member',
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
  /* SNOW COMES DOWN                                                   */
  /*                                                                    */
  /* Owner playtest, 2026-08-06: *"Snow must come down to the lab for   */
  /* his clean-up lines."* He never did. Booski gets on the intercom at */
  /* the end of beat 10 — "Snow. Basement." / "Bring the cart." — and    */
  /* Snow answers "How bad?" and then "Jesus Christ.", which is a man    */
  /* looking at a room full of bodies. He was in the foyer, three floors */
  /* up, for every word of it, and "Jesus Christ." was a disembodied     */
  /* subtitle about a room nobody in it had seen.                        */
  /*                                                                      */
  /* HE ARRIVES OUT OF THE STAIRWELL AND WALKS IN, which is the whole of  */
  /* the note ("movement + presence when his cues fire"). He is NOT       */
  /* walked down from the foyer: the house is four storeys stacked in one */
  /* column, the Npc walk is a flat-plane nav with collider avoidance and */
  /* no stairs in it, and a man sliding down through three floors is a    */
  /* worse thing to watch than a man who was not there. So he is put at   */
  /* the foot of the stairwell — off the observation area, out of the     */
  /* player's sightline, exactly where somebody coming down would be —    */
  /* and walks the last stretch himself, pushing the cart, arriving while */
  /* Booski is still saying "Bring the cart."                             */
  /* ================================================================ */
  /** null, or the walk he is on. */
  let snowErrand = null;

  function snowToTheBasement() {
    const npc = people.snow;
    const room = lab?.rooms?.observation ?? null;
    const door = lab?.anchors?.crossOpening ?? null;
    if (!npc || snowErrand || !room || !door || !Number.isFinite(door.x)) return false;
    const floorY = room.floor ?? npc.baseY;

    /* IN THROUGH THE PIER OPENING, which is the doorway between the
     * interrogation corridor and the observation area — the same one the
     * player came in through, and the only way in on this floor.
     *
     * NOT from the foot of the stairwell, which is sixteen metres away: the
     * exchange that calls him is eleven seconds long and a man pushing a cart
     * walks at a metre and a half a second, so starting him at the stairs put
     * him in the doorway around the time Booski said "And a mop." He comes
     * down the stairs and along the corridor while Booski is still on the
     * intercom; the walk you SEE is the last few metres of it. */
    const inside = { x: room.anchor.x, z: room.anchor.z };
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    /* Beside the console bank rather than on the transfer table, and clamped
     * into the room's own rect so the stop cannot land in a wall if the room
     * moves. */
    const stop = {
      x: clamp(inside.x + 2.0, room.rect.x0 + 1.0, room.rect.x1 - 1.0),
      z: clamp(inside.z - 0.6, room.rect.z0 + 1.0, room.rect.z1 - 1.0),
    };
    const step = {
      x: clamp((door.x + stop.x) / 2, room.rect.x0 + 1.0, room.rect.x1 - 1.0),
      z: clamp(door.z, room.rect.z0 + 1.0, room.rect.z1 - 1.0),
    };
    npc.group.position.set(door.x, floorY, door.z);
    npc.baseY = floorY;
    npc.homeX = door.x;
    npc.homeZ = door.z;
    npc.speed = 1.5;
    npc.route = [step, stop];
    npc.routeAt = 0;
    npc.job = 'patrol';
    npc.faceToward(step.x, step.z, true);
    snowErrand = { stop, floorY, arrived: false, foley: 0 };
    /* ---- CLEANUP FOLEY (owner playtest: "the scene needs a proper SFX pass",
     * and the last thing he named was cleanup foley).
     *
     * He pulls the gloves on at the bottom of the stairs and pushes the cart
     * in, and the cart is a LOOP that travels with him — four hard castors,
     * one with a flat spot, and a bucket of water in a frame. Authored in
     * scenes/SilentSquatch.js's cue table with the rest of the scene's sound;
     * played here because this module owns the man and the cart. */
    audio?.play?.('silent.gloves.snap', {
      volume: 0.6, position: npc.group.position.clone(), ref: 2, maxDist: 14,
    });
    audio?.startLoop?.('silent.cart.wheels', {
      name: 'silent.cart.wheels',
      volume: 0.42,
      position: cart.position.clone(),
      ref: 2.4,
      maxDist: 18,
      fade: 0.6,
    });
    return true;
  }

  /**
   * The cart goes where he goes, and its collider with it.
   *
   * ONLY WHILE HE IS WALKING. A parked cart does not move, and re-deriving a
   * collider from twenty meshes every frame for the rest of the night is a
   * cost with nothing on the other side of it.
   */
  function updateSnowErrand() {
    if (!snowErrand || snowErrand.arrived) return;
    const npc = people.snow;
    const at = npc.group.position;
    /* Ahead of him, the way a man pushes a cart, and turned with him. */
    const ahead = 0.95;
    cart.position.set(
      at.x + Math.sin(npc.group.rotation.y) * ahead,
      snowErrand.floorY,
      at.z + Math.cos(npc.group.rotation.y) * ahead,
    );
    cart.rotation.y = npc.group.rotation.y;
    cart.updateMatrixWorld(true);
    _seatBox.setFromObject(cart);
    cartCollider.copy(_seatBox);
    cartCollider.min.y = snowErrand.floorY;
    cartCollider.max.y = Math.min(_seatBox.max.y, snowErrand.floorY + 1.05);

    /* The cart's own loop follows him rather than staying where it started;
     * a wheel bed pinned to a spot is a wheel bed nobody believes.
     * `moveLoop` is `AudioEngine`'s, added for exactly this. */
    audio?.moveLoop('silent.cart.wheels', cart.position);
    if (Math.hypot(at.x - snowErrand.stop.x, at.z - snowErrand.stop.z) > 0.75) return;
    /* He is there. Stop him and turn him at the glass, which is the thing he
     * has been sent down to look at. */
    snowErrand.arrived = true;
    npc.route = null;
    npc.job = 'work';
    const glass = lab?.anchors?.glassDoor ?? snowErrand.stop;
    npc.faceToward(glass.x, glass.z);
    /* Parked, and then he gets on with it: the liner into the hoop, the mop
     * out of the wringer, and the mop on the floor for the rest of the
     * night. Staggered, because a man does these one at a time. */
    audio?.stopLoop?.('silent.cart.wheels', 0.4);
    const at2 = cart.position.clone();
    audio?.play?.('silent.cart.park', { volume: 0.6, position: at2, ref: 2, maxDist: 16 });
    audio?.play?.('silent.bag.liner', { volume: 0.5, delay: 1.4, position: at2, ref: 2, maxDist: 14 });
    audio?.play?.('silent.mop.wring', { volume: 0.55, delay: 3.0, position: at2, ref: 2, maxDist: 16 });
    audio?.startLoop?.('silent.mop.floor', {
      name: 'silent.mop.floor',
      volume: 0.3,
      position: at2,
      ref: 2.4,
      maxDist: 16,
      fade: 1.6,
    });
  }

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
   * downstairs on a bar stool wearing a flight jacket and lou2.
   *
   * AND HE IS IN THE OTHER OUTFIT (owner playtest: *"Lou should wear the other
   * outfit"*). `src/core/wardrobe.js` has carried three dressings of this man
   * since the wardrobe pass — the base suit, `BIG_UNCLE_LOU_BING` (the
   * chalk-stripe three-piece and the fedora he owns the club in) and
   * `BIG_UNCLE_LOU_MANSION`, whose own docstring says "the mansion, where he
   * is at home and not working" — and the mansion was posting him in the BASE
   * suit, so the one entry written for this room had never been worn in it.
   * Same man, same face photo, same jewellery; the camp shirt instead of the
   * armour, which is the entire reason a second dressing exists. */
  const desk = at('officeDesk', { x: 0, y: UPPER_Y, z: 70.2 });
  const louAt = { x: desk.x + 1.05, y: desk.y, z: desk.z + 2.55 };
  post('lou', {
    role: 'boss',
    name: 'Big Uncle Lou',
    model: withFace(BIG_UNCLE_LOU_MANSION, FACES.lou),
    x: louAt.x,
    y: louAt.y,
    z: louAt.z,
    /* Across his own desk, at the door somebody is about to come through. */
    yaw: yawToward(louAt.x, louAt.z, desk.x, desk.z - 3),
    look: louInteraction?.label
      ?? 'Big Uncle Lou. He has been waiting for you and he is not going to say so.',
    onUse: louInteraction?.onUse ?? null,
    interactEnabled: louInteraction?.enabled ?? null,
  });

  /* ---- Rippin, in the pool room ----------------------------------------
   * The spec's `rippin` zone is `loungeCenter`, and the lounge is the room
   * the owner means by "the pool room and bar": billiards at one end, and the
   * glazed bay with the bar and the stools off the other. He stands at the
   * FOOT of the billiard table -- "Whatever's in that thing, I don't want it
   * near my balls." lands on a man who is at the table, rather than on nobody.
   *
   * WHERE EXACTLY HE STANDS IS LOAD-BEARING (owner playtest: "Rippin's line
   * didn't trigger at first"). His arrival bark fires when the player is
   * inside BOTH circles at once: 3.2 m of the `loungeCenter` anchor (the
   * mission's zone) and 3.2 m of his real body (the shared speech gate). He
   * used to lean on the west rail, 2.93 m off the anchor -- the two circles
   * barely overlapped, so the natural walk down the room's west aisle became
   * audible to the gate well OUTSIDE the zone, the mission's 18-second idle
   * rotation spent his voice on "I'm serious. Take it over there." first, and
   * the authored greeting sat on the gate's 12-second cooldown until the
   * player had usually left the lens. He now stands ~0.3 m off the anchor, on
   * its far side from both of the room's entries (the rear-foyer archway and
   * the kitchen door are both north of him), so on any natural approach the
   * ZONE is entered a step before the gate can hear him and the arrival line
   * always wins the frame. Clear of the table's collider (z0 46.2). */
  const lounge = at('loungeCenter', { x: 12.5, y: GROUND_Y, z: 45.5 });
  const rippinAt = { x: lounge.x - 0.1, y: lounge.y, z: lounge.z - 0.3 };
  post('rippin', {
    role: 'family_member',
    name: 'Rippinflow',
    model: withFace(RIPPINFLOW, FACES.rippinflow),
    job: 'stand',
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
    role: 'family_member',
    name: 'Eric',
    model: withFace(ERIC, FACES.erican),
    job: 'sit',
    x: ericAt.x,
    y: ericAt.y,
    z: ericAt.z,
    yaw: yawToward(ericAt.x, ericAt.z, dining.x, dining.z),
    bark: SEQUENCES.ericTable,
    idle: SEQUENCES.ericIdle,
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
    role: 'family_member',
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
    role: 'family_member',
    /* One of the four lounge stools, by its own name: measured on the built
     * bay, the man is inside `mansion-lounge-bar-stool-0` and not inside any
     * of the other three, so a stool renamed out from under him reports
     * SEAT_MISSING rather than passing quietly. */
    seat: 'mansion-lounge-bar-stool-0',
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
    role: 'family_member',
    /* Measured the same way: she is on the middle stool of the island's three. */
    seat: 'mansion-kitchen-island-stool-1',
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
    role: 'family_member',
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

  /* ---- The rest of the living roster ---------------------------------
   * Willy and Billy HotDog are dead by this chapter. Aubbie is physically
   * present in the laboratory below. These five were the living names still
   * absent from the house: they now use five rooms rather than collecting in
   * another bar-shaped knot. All models come from the canonical Family row. */
  let theatreEveningStaged = false;
  const conference = at('conferenceTable', { x: 0, y: UPPER_Y, z: 58 });
  post('seff', {
    role: 'family_member',
    name: 'Seff',
    model: familyModel(CHARACTER_IDS.SEFF),
    job: 'work',
    x: conference.x - 7.15,
    y: conference.y,
    z: conference.z + 0.4,
    yaw: yawToward(conference.x - 7.15, conference.z + 0.4, conference.x, conference.z),
    look: () => (theatreEveningStaged
      ? 'Seff, sunk into a back-row recliner with the conference phone beside him.'
      : 'Seff, monitoring the conference-room phone nobody is meant to call.'),
  });

  /* `lanCenter`, not `lan`: `lan` is the mount option carrying the room's
   * published stations (Shubes' seat below). */
  const lanCenter = at('lanRoomCenter', { x: 6.4, y: BASEMENT_Y, z: 71.15 });
  /* LAG HAS HIS OWN LINES NOW.
   *
   * Owner, 2026-08-20: *"Lag needs his own recognizable presence rather than
   * just another generic mansion NPC."* One line as you come near him, and two
   * more on the E prompt, in order -- the second of which points at the house
   * without reading the objective out, which is what an NPC nudging you toward
   * EXPLORE THE MANSION should sound like.
   *
   * `bark` and `onUse` are the cast's own existing hooks. No new NPC dialogue
   * system: `post()` has had both since the house was built and Lag simply
   * had neither. */
  let lagSaid = 0;
  const LAG_REPLIES = Object.freeze([SEQUENCES.lagBigHouse, SEQUENCES.lagLookAround]);
  post('lag', {
    role: 'family_member',
    name: 'Lag',
    model: familyModel(CHARACTER_IDS.LAG),
    bark: SEQUENCES.lagHello,
    onUse: () => {
      /* Holds on the last line rather than looping back to the first: a man
       * who repeats himself forever is a vending machine. */
      dialogue.interject(LAG_REPLIES[Math.min(lagSaid, LAG_REPLIES.length - 1)]);
      lagSaid += 1;
      return true;
    },
    x: lanCenter.x,
    y: lanCenter.y,
    // The north desk row is centred at z 73.5; +2.4 put both thighs inside
    // its centre desk. The 3 m offset stands him behind it with 10 cm clear.
    z: lanCenter.z + 3.0,
    yaw: yawToward(lanCenter.x, lanCenter.z + 3.0, lanCenter.x, lanCenter.z),
    look: () => (theatreEveningStaged
      ? 'Lag, watching the movie half a beat behind everybody else.'
      : 'Lag, standing behind five live machines and blaming the one with the best connection.'),
  });

  const ballroom = at('ballroomCenter', { x: 0, y: GROUND_Y, z: 66 });
  post('ape', {
    role: 'family_member',
    name: 'Ape',
    model: withFace(familyModel(CHARACTER_IDS.APE), FACES.ape),
    folded: true,
    x: ballroom.x - 6.4,
    y: ballroom.y,
    z: ballroom.z + 1.2,
    yaw: yawToward(ballroom.x - 6.4, ballroom.z + 1.2, ballroom.x, ballroom.z),
    look: 'Ape, keeping to the edge of the ballroom and keeping his hands where everybody can see them.',
  });
  /* Sauce is at his buffet on the mission night ONLY. The return visit is
   * the morning Lou's briefing announces the Cartel took him — a Sauce
   * checking canapés in the ballroom while the player is told he was
   * kidnapped is a continuity hole, not a cameo. */
  if (visit !== 'return') {
    post('sauce', {
      role: 'family_member',
      name: 'Sauce',
      model: familyModel(CHARACTER_IDS.SAUCE),
      job: 'work',
      x: ballroom.x + 6.4,
      y: ballroom.y,
      z: ballroom.z + 1.2,
      yaw: yawToward(ballroom.x + 6.4, ballroom.z + 1.2, ballroom.x, ballroom.z),
      bark: SAUCE_MANSION_BARK,
      look: 'Sauce, checking a buffet that nobody asked him to check.',
    });
  }

  const theatreAt = at('theatreCenter', { x: -2.85, y: BASEMENT_Y, z: 72.6 });
  /* What the three of them say, in order, and then what is on. Thunks rather
   * than sequences so the last one can read the projector at the moment it is
   * asked instead of at mount time. */
  let theatreSaid = 0;
  const THEATRE_REPLIES = Object.freeze([
    () => SEQUENCES.theatreStanding,
    () => SEQUENCES.theatreProjector,
    () => theatreLines(),
  ]);
  const theatreLines = () => {
    const channel = String(theatreChannel?.() ?? '').toUpperCase();
    if (channel.includes('GOODFELLAS')) return SEQUENCES.oldStoveGoodfellas;
    if (channel.includes('HEAT')) return SEQUENCES.oldStoveHeat;
    if (channel.includes('BLOW')) return SEQUENCES.oldStoveBlow;
    if (channel.includes('GODFATHER')) return SEQUENCES.oldStoveGodfather;
    return SEQUENCES.oldStoveTheatre;
  };
  /* Old Stove is already watching the theatre during the mission; only Seff
   * and Lag join him for the quiet post-mission evening. Seat him from mount,
   * on the actual published recliner, so a normal in-progress campaign visit
   * cannot leave him standing beside it while preview mode happens to pass. */
  const oldStoveSeatIndex = 1;
  const oldStoveSeat = theatre?.seats?.[oldStoveSeatIndex] ?? null;
  oldStoveSeat?.updateWorldMatrix?.(true, false);
  const oldStoveSeatAt = oldStoveSeat?.getWorldPosition?.(new THREE.Vector3())
    ?? new THREE.Vector3(theatreAt.x - 3.6, theatreAt.y, theatreAt.z - 4.4);
  const oldStoveScreenAt = theatre?.screen?.getWorldPosition?.(new THREE.Vector3())
    ?? new THREE.Vector3(theatreAt.x, theatreAt.y + 1.5, theatreAt.z + 4);
  const oldStoveNpc = post('oldStove', {
    role: 'family_member',
    name: 'Old Stove',
    model: withFace(familyModel(CHARACTER_IDS.OLD_STOVE), FACES.stove),
    job: 'sit',
    x: oldStoveSeatAt.x,
    y: seatBase(oldStoveSeatAt.y, 0.56),
    z: oldStoveSeatAt.z + 0.02,
    yaw: yawToward(oldStoveSeatAt.x, oldStoveSeatAt.z, oldStoveScreenAt.x, oldStoveScreenAt.z),
    look: () => (theatreEveningStaged
      ? `Old Stove, holding court through ${theatreChannel?.() || 'the picture'} with Seff and Lag.`
      : `Old Stove, waiting on ${theatreChannel?.() || 'a picture'}.`),
    /* Old Stove is already seated here during the job. Preview and the quiet
     * evening only add Seff and Lag, so neither may be a hidden permission
     * switch for the visible man's own E prompt. */
    interactEnabled: () => true,
    /* THE BACK ROW TALKS.
     *
     * Owner: *"It shouldn't just be several Sasquatches silently staring at a
     * screen like they were recently unplugged."*
     *
     * Once the evening has staged Seff and Lag into the row beside him, the E
     * prompt is a conversation rather than one man's opinion of the reel:
     * they get the standing-in-the-doorway exchange, then the one about the
     * projector, and only then fall back to what Old Stove thinks of what is
     * on. Before the evening he is alone in there and there is nobody to have
     * a conversation with, so it is the reel line and nothing else. */
    onUse: () => {
      dialogue.interject(theatreEveningStaged
        ? THEATRE_REPLIES[Math.min(theatreSaid++, THEATRE_REPLIES.length - 1)]()
        : theatreLines());
      return true;
    },
  });
  oldStoveNpc.inFixture = 'theatre recliner';
  oldStoveNpc.theatreSeat = oldStoveSeatIndex;
  markTheatreSeatOccupied(oldStoveSeat, 'oldStove');

  /* Once the mission gives way to the quiet evening, the theatre stops being
   * a room with one man waiting beside twelve empty chairs. No new cast is
   * invented: Seff leaves the conference phone and Lag leaves the LAN room,
   * and both join Old Stove in the back row. Earlier mission staging remains
   * unchanged because this transition only runs after `eveningEnabled()`. */
  const THEATRE_COMPANIONS = Object.freeze([
    Object.freeze({ id: 'oldStove', seat: 1 }),
    Object.freeze({ id: 'seff', seat: 3 }),
    Object.freeze({ id: 'lag', seat: 5 }),
  ]);
  function stageTheatreEvening() {
    if (theatreEveningStaged || !eveningEnabled()) return theatreEveningStaged;
    const seats = theatre?.seats ?? [];
    if (seats.length < 6) return false;
    const screenAt = theatre?.screen?.getWorldPosition?.(new THREE.Vector3())
      ?? new THREE.Vector3(theatreAt.x, theatreAt.y + 1.5, theatreAt.z + 4);
    for (const assignment of THEATRE_COMPANIONS) {
      const npc = people[assignment.id];
      const seat = seats[assignment.seat];
      if (!npc || !seat) continue;
      seat.updateWorldMatrix(true, false);
      const atSeat = seat.getWorldPosition(new THREE.Vector3());
      npc.baseY = seatBase(atSeat.y, 0.56);
      npc.homeX = atSeat.x;
      npc.homeZ = atSeat.z + 0.02;
      npc.homeYaw = yawToward(atSeat.x, atSeat.z, screenAt.x, screenAt.z);
      npc.group.position.set(npc.homeX, npc.baseY, npc.homeZ);
      npc.group.rotation.y = npc.homeYaw;
      npc.job = 'sit';
      /* These three become seated AFTER the mount-time seat pass. Merely
       * changing `job` folds the legs on the next update, but it never adds
       * the body to the measured-seat registry and never corrects different
       * body heights against this recliner's actual pad. Apply the pose now,
       * register the dynamic sitter once, then run the same geometry-derived
       * correction every original sitter receives. */
      npc.sit();
      if (!seated.some((entry) => entry.id === assignment.id)) {
        seated.push({ id: assignment.id, npc });
      }
      scene.updateMatrixWorld(true);
      const lift = sitOnTheSeat(scene, npc);
      if (lift !== null) seatLifts[assignment.id] = lift;
      npc.inFixture = 'theatre recliner';
      npc.theatreSeat = assignment.seat;
      markTheatreSeatOccupied(seat, assignment.id);
    }
    /* AND THE ROOM NOTICES HIM WHEN HE OPENS THE DOOR.
     *
     * Owner's first theatre line is "Shut the door, you're letting all the
     * movie out", which only works as an ARRIVAL -- it is the room reacting,
     * not a thing you press E for. `post()` already has that hook: `bark` is
     * the once-only line a man says when the player comes inside his range,
     * and the loop that fires it reads the mutable post entry every frame. So
     * the arrival exchange is armed HERE, at the moment there are three of
     * them in the row to have it, rather than at mount time when Old Stove is
     * alone in there and the first two lines have nobody to say them.
     *
     * Armed on Old Stove because he speaks first; `dialogue.interject` plays
     * the whole five-line exchange from the one trigger, which is how every
     * other multi-speaker beat in this house works. */
    const stovePost = posts.find((entry) => entry.id === 'oldStove');
    if (stovePost && !stovePost.said) stovePost.bark = SEQUENCES.theatreArrival;
    theatreEveningStaged = true;
    return true;
  }

  /* ================================================================ */
  /* SHUBES, IN THE LAN ROOM (owner note, 2026-08-19)                  */
  /*                                                                    */
  /* Same transition as the theatre above, same gate: during the        */
  /* mission he wanders the gallery, where his own arrival lines fire   */
  /* -- moving that man mid-job would play "Hey guys, what's going       */
  /* on?" at an empty landing, which is the exact class of bug this     */
  /* module keeps writing down. Once the evening starts he takes the    */
  /* chair at the published RuneScape station and stays in it, with a   */
  /* mouse-hand controller running after Npc.update the way every other */
  /* fixture pose in this house does.                                   */
  /*                                                                    */
  /* His evening lines are the ordinary post bark machinery: the post   */
  /* was built without a bark (the MISSION owned his mouth), so handing */
  /* the entry `shubesLanBark`/`shubesLanIdle` now makes the walk-up    */
  /* fire once off the shared speech gate like everybody else's. The E  */
  /* press re-registers his body -- `interaction.register` REPLACES a   */
  /* descriptor, documented at `post()` -- and is a settling-in beat.   */
  /* ================================================================ */
  let lanEveningStaged = false;
  let lanGamerMotion = null;
  function stageLanEvening() {
    if (lanEveningStaged || !eveningEnabled()) return lanEveningStaged;
    const npc = people.shubes;
    const chair = lan?.runescapeStation?.chair?.group ?? null;
    const desk = lan?.runescapeStation?.desk?.group ?? null;
    if (!npc || !chair || !desk) return false;
    chair.updateWorldMatrix(true, false);
    const atSeat = chair.getWorldPosition(new THREE.Vector3());
    const atDesk = desk.getWorldPosition(new THREE.Vector3());
    npc.route = null;
    /* 0.53: the gamer chair's own seat top (makeChair pads 0.48 + 0.05),
     * measured off the built prop the way the theatre uses its recliner's
     * 0.56. The raycast pass below still owns the final centimetre. */
    npc.baseY = seatBase(atSeat.y, 0.53);
    npc.homeX = atSeat.x;
    npc.homeZ = atSeat.z;
    npc.homeYaw = yawToward(atSeat.x, atSeat.z, atDesk.x, atDesk.z);
    npc.group.position.set(npc.homeX, npc.baseY, npc.homeZ);
    npc.group.rotation.y = npc.homeYaw;
    npc.job = 'sit';
    /* Seated after the mount-time seat pass, so: pose now, register the
     * dynamic sitter once, then the same measured correction every original
     * sitter received. Exactly the theatre companions' path. */
    npc.sit();
    if (!seated.some((entry) => entry.id === 'shubes')) {
      seated.push({ id: 'shubes', npc });
    }
    scene.updateMatrixWorld(true);
    const lift = sitOnTheSeat(scene, npc);
    if (lift !== null) seatLifts.shubes = lift;
    /* The chair has a real collider and he is meant to be on it; the flag is
     * the same allowance the hot tub and the loungers carry. */
    npc.inFixture = 'LAN station chair';
    lanGamerMotion = createLanGamerMotion(npc, { phase: 0.4 });
    /* The gamer hunch is not the upright pose the correction above measured:
     * pitching the body forward swings the hips box ~4 cm lower, which read
     * as him sitting inside the pad. Pose the hunch, correct against it, and
     * re-pin the motion's held Y to the corrected height; the lean's own
     * sway is ±1 cm, inside the seat gate's 2 cm of upholstery. */
    lanGamerMotion?.update(0);
    scene.updateMatrixWorld(true);
    const hunchedLift = sitOnTheSeat(scene, npc);
    if (hunchedLift !== null) seatLifts.shubes = +(((lift ?? 0) + hunchedLift)).toFixed(3);
    lanGamerMotion?.rebaseSeatY?.();

    const entry = posts.find((p) => p.id === 'shubes');
    if (entry) {
      entry.bark = SEQUENCES.shubesLanBark;
      entry.idle = SEQUENCES.shubesLanIdle;
      entry.said = false;
      entry.saidIdle = false;
    }
    interaction?.register?.(npc.group, {
      label: 'Ask <b>Shubes</b> what he is playing',
      key: 'E',
      enabled: () => enabled(),
      onUse: () => {
        /* Interjected, not queued -- an E press on the man always answers,
         * the same contract the bartender and Old Stove keep. */
        dialogue.interject(SEQUENCES.shubesLanChat);
        /* Sitting with him counts toward the bed. */
        onEveningBeat('lan');
        return true;
      },
    });
    lanEveningStaged = true;
    return true;
  }

  /* ================================================================ */
  /* THE THIRD FLOOR                                                   */
  /*                                                                    */
  /* Owner, on the master suite: "hot tub with girls, the dog, and      */
  /* everything."                                                       */
  /*                                                                     */
  /* THE TWO IN THE TUB ARE BADA BING CAST, NOT NEW PEOPLE. Their looks   */
  /* are spread straight off `BADA_BING_PERFORMERS` in `src/bing/cast.js` */
  /* -- the same four figures who work the club's poles -- so the woman   */
  /* in Lou's tub is a woman the player has already met, which is the      */
  /* whole point of the family owning the club. The GARMENT is the only    */
  /* thing decided here, and it is the same `dress: 'bikini'` the stage     */
  /* uses, because on this rig a stage costume and a swimsuit are the same  */
  /* cut and the room is what makes it one or the other.                    */
  /*                                                                         */
  /* `job: 'sit'` folds the figure at the hips and drops it 0.42 x its own    */
  /* height scale, feet on the floor it was given. So each one is handed the  */
  /* tub's BENCH height plus that drop, read back off the built figure rather */
  /* than guessed: `heightScale` is not known until `makePerson` has run.      */
  /* ================================================================ */
  const tubSeats = suite?.tubSeats ?? [];
  const suitePerformers = [];
  tubSeats.slice(0, 2).forEach((seat, i) => {
    const look = BADA_BING_PERFORMERS[i === 0 ? 3 : 1];
    const npc = post(`suitePerformer${i}`, {
      role: 'performer',
      name: 'a dancer',
      tier: 'ambient',
      job: 'sit',
      x: seat.x,
      /* `seat.y` is the tub's inner FLOOR, which is what `Npc.sit()` wants --
       * see the note where MansionInterior publishes these. */
      y: seat.y,
      z: seat.z,
      yaw: seat.yaw,
      model: {
        role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
        height: i === 0 ? 1.74 : 1.71, build: 1.08, dress: 'bikini', ...look,
      },
      look: 'One of the girls from the club, up here where the water is warmer.',
    });
    /* SHE IS SUPPOSED TO BE INSIDE THE FURNITURE. `verify:mansion` asserts
     * that nobody in this house is standing inside a collider, which is a good
     * check and would fail here for the right reason and the wrong result: a
     * hot tub is a solid marble drum and two people are sitting in it. The
     * flag says so on the body, so the check can skip exactly the bodies that
     * mean it rather than being loosened for everybody. */
    npc.inFixture = 'the hot tub';
    npc.performerMotion = 'seated-social';
    suitePerformers.push(npc);
  });

  /* ---- The pool-deck evening -----------------------------------------
   * Three women, composed against the actual pool build: two reclining on
   * the empty east-side loungers and one standing shoulder-deep in the
   * water. The first keeps the existing three-press flirt -> strap-help path;
   * moving her onto furniture must not replace that interaction. */
  const poolAt = at('poolPatio', { x: 0, y: GROUND_Y, z: 85 });
  function poolChair(index, fallback) {
    const chair = pool?.chairs?.[index];
    if (!chair) return fallback;
    chair.updateMatrixWorld(true);
    const position = chair.getWorldPosition(new THREE.Vector3());
    const rotation = new THREE.Euler().setFromQuaternion(
      chair.getWorldQuaternion(new THREE.Quaternion()), 'YXZ',
    );
    return { x: position.x, y: position.y, z: position.z, yaw: rotation.y };
  }
  /* Towel-free chairs. The towel alternates across the row; 4 and 6 are the
   * two unoccupied surfaces built for bodies rather than folded linen. */
  const firstLounger = poolChair(4, {
    x: poolAt.x + 10.6, y: poolAt.y, z: poolAt.z - 5.6, yaw: -Math.PI / 2,
  });
  const secondLounger = poolChair(6, {
    x: poolAt.x + 10.6, y: poolAt.y, z: poolAt.z + 0.8, yaw: -Math.PI / 2,
  });
  const poolRecliners = [];
  const POOL_PERFORMER_IDENTITIES = Object.freeze({
    poolPerformer0: Object.freeze({ source: 'BADA_BING_PERFORMERS', index: 0, look: 'platinum tied hair' }),
    poolPerformer1: Object.freeze({ source: 'BADA_BING_PERFORMERS', index: 2, look: 'black long hair' }),
    poolPerformer2: Object.freeze({ source: 'BADA_BING_PERFORMERS', index: 1, look: 'brunette long hair' }),
  });
  function posePoolRecliner(npc) {
    if (!npc?.parts) return;
    /* A dining-chair sit folds the shin vertical at the knee. On a sun
     * lounger that vertical shin went through the deck slats by their full
     * 45 mm thickness. Extend both legs down the cushion instead: the thigh
     * lifts gently from the hip and the positive knee bend returns the lower
     * leg almost parallel to the deck, without hyperextending it. */
    npc.parts.legL.rotation.x = -1.75;
    npc.parts.legR.rotation.x = -1.75;
    npc.parts.shinL.rotation.x = 0.25;
    npc.parts.shinR.rotation.x = 0.25;
    npc.parts.body.rotation.x = -0.46;
    /* Npc.update resets the shared pose first, but this assignment is still
     * deliberate: a fixture pose must never accumulate if that reset changes. */
    npc.parts.head.rotation.x = 0.2;
    npc.parts.armL.rotation.set(-0.28, 0, -0.28);
    npc.parts.armR.rotation.set(-0.28, 0, 0.28);
  }
  const poolEvening = {
    phase: 'hello', greetedSecond: false, dressHelped: false,
    secondPhase: 'hello', secondDressHelped: false,
  };
  let dressStrap = null;
  const primaryPoolGirl = post('poolPerformer0', {
    role: 'performer',
    name: 'the Bada Bing platinum performer',
    tier: 'ambient',
    job: 'sit',
    x: firstLounger.x,
    y: seatBase(firstLounger.y, 0.47),
    z: firstLounger.z,
    yaw: firstLounger.yaw,
    model: {
      role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
      height: 1.73, build: 1.08, dress: 'bikini', ...BADA_BING_PERFORMERS[0],
    },
    look: () => {
      if (poolEvening.phase === 'hello') return 'Say hello to the dancer by the pool';
      if (poolEvening.phase === 'flirt') return 'Try flirting with her';
      if (poolEvening.phase === 'strap') return 'Help fix her dress strap';
      return 'Her dress strap is fixed. Useful beats smooth.';
    },
    /* They are already staged on the pool deck during the job. Preview and
     * post-mission evening state may add theatre company, but it must not be
     * the hidden permission switch for a visible performer's E prompt. */
    interactEnabled: () => true,
    onUse: () => {
      if (dialogue.busy) return false;
      if (poolEvening.phase === 'hello') {
        poolEvening.phase = 'flirt';
        dialogue.play(SEQUENCES.poolGirlHello);
      } else if (poolEvening.phase === 'flirt') {
        poolEvening.phase = 'strap';
        dialogue.play(SEQUENCES.poolGirlFlirt);
      } else if (poolEvening.phase === 'strap') {
        poolEvening.phase = 'done';
        poolEvening.dressHelped = true;
        if (dressStrap) {
          dressStrap.rotation.z = 0.18;
          dressStrap.position.y += 0.08;
        }
        dialogue.play(SEQUENCES.poolGirlDressHelp);
        /* The exchange lands as a settling-in beat only once it is done. */
        onEveningBeat('pool');
      } else return false;
      return true;
    },
  });
  primaryPoolGirl.inFixture = 'pool lounger';
  primaryPoolGirl.poolPose = 'reclined';
  primaryPoolGirl.performerMotion = 'reclined-rest';
  primaryPoolGirl.performerIdentity = POOL_PERFORMER_IDENTITIES.poolPerformer0;
  poolRecliners.push(primaryPoolGirl);
  posePoolRecliner(primaryPoolGirl);
  dressStrap = box({
    size: [0.045, 0.42, 0.025],
    pos: [0.2, 1.34, 0.13],
    mat: mat({ color: 0x6e1834, roughness: 0.7 }),
    rotZ: -0.68,
    cast: false,
    name: 'pool-performer-dress-strap',
  });
  primaryPoolGirl.parts.body.add(dressStrap);

  const secondPoolGirl = post('poolPerformer1', {
    role: 'performer',
    name: 'the Bada Bing black-haired performer',
    tier: 'ambient',
    job: 'sit',
    x: secondLounger.x,
    y: seatBase(secondLounger.y, 0.47),
    z: secondLounger.z,
    yaw: secondLounger.yaw,
    model: {
      role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
      height: 1.71, build: 1.06, dress: 'bikini', ...BADA_BING_PERFORMERS[2],
    },
    look: () => {
      if (poolEvening.secondPhase === 'hello') return 'Say hello to the other dancer';
      if (poolEvening.secondPhase === 'flirt') return 'Try flirting with her';
      if (poolEvening.secondPhase === 'ready') return 'Help fix her dress strap';
      if (poolEvening.secondPhase === 'helping') return 'Time the pull';
      return 'Her dress strap is fixed.';
    },
    interactEnabled: () => poolEvening.secondPhase !== 'done',
    onUse: () => {
      if (secondDressSequence?.active) return secondDressSequence.press();
      if (dialogue.busy) return false;
      if (poolEvening.secondPhase === 'hello') {
        poolEvening.greetedSecond = true;
        poolEvening.secondPhase = 'flirt';
        dialogue.play(SEQUENCES.poolGirlHello);
      } else if (poolEvening.secondPhase === 'flirt') {
        poolEvening.secondPhase = 'ready';
        dialogue.play(SEQUENCES.poolGirlFlirt);
      } else if (poolEvening.secondPhase === 'ready') {
        poolEvening.secondPhase = 'helping';
        secondDressSequence.start();
      } else return false;
      return true;
    },
  });
  secondPoolGirl.inFixture = 'pool lounger';
  secondPoolGirl.poolPose = 'reclined';
  secondPoolGirl.performerMotion = 'reclined-rest';
  secondPoolGirl.performerIdentity = POOL_PERFORMER_IDENTITIES.poolPerformer1;
  poolRecliners.push(secondPoolGirl);
  posePoolRecliner(secondPoolGirl);

  const secondDressStrap = box({
    size: [0.045, 0.42, 0.025], pos: [0.2, 1.34, 0.13],
    mat: mat({ color: 0x351125, roughness: 0.7 }), rotZ: -0.68,
    cast: false, name: 'pool-performer-2-dress-strap',
  });
  secondPoolGirl.parts.body.add(secondDressStrap);
  const secondDressStart = {
    y: secondDressStrap.position.y,
    rotation: secondDressStrap.rotation.z,
  };
  /* The chair is long on its local Z and narrow on local X. Stand on its
   * clear north-side aisle, 1.14 m off centre: chair half-width 0.39 m + the
   * player's 0.32 m radius still leaves 0.43 m of honest air. Deriving the
   * direction from the published chair yaw keeps the mark attached if the
   * grounds composition rotates this row later. */
  const secondDressMarker = Object.freeze({
    x: secondLounger.x - Math.cos(secondLounger.yaw) * 1.14,
    y: secondLounger.y + (player?.eyeHeight ?? 1.66),
    z: secondLounger.z + Math.sin(secondLounger.yaw) * 1.14,
  });
  /* Margo's dress beat first snaps HER to a measured actor marker/orientation,
   * then articulates the interaction pose. Reuse that actor-first staging here
   * rather than locking the player's camera on a performer left wherever her
   * ambient loop happened to be. Twelve centimetres down the real lounger and
   * a small three-quarter turn are still fully supported by its cushion, but
   * visibly compose her fastening toward the authored player-side aisle. */
  const secondDressActorMarker = Object.freeze({
    x: secondPoolGirl.group.position.x + Math.sin(secondLounger.yaw) * 0.12,
    y: secondPoolGirl.group.position.y,
    z: secondPoolGirl.group.position.z + Math.cos(secondLounger.yaw) * 0.12,
    yaw: secondLounger.yaw + 0.18,
  });
  const secondDressActorStaging = createDressHelpActorStaging({
    actor: secondPoolGirl,
    marker: secondDressActorMarker,
  });
  const secondDressFocusAt = new THREE.Vector3();
  const secondDressFocus = createDressHelpFocus({
    player,
    interaction,
    target: () => secondDressStrap.getWorldPosition(secondDressFocusAt),
    marker: secondDressMarker,
  });
  const secondDressCueLog = [];
  const secondDressAudio = {
    position: () => secondPoolGirl.group.getWorldPosition(new THREE.Vector3()),
    play: (name, options) => {
      secondDressCueLog.push({ kind: 'play', name });
      return audio?.play?.(name, options) ?? null;
    },
    startLoop: (key, options) => {
      secondDressCueLog.push({ kind: 'loop', name: options.name });
      return audio?.startLoop?.(key, options) ?? null;
    },
    stopLoop: (key, fade) => {
      secondDressCueLog.push({ kind: 'stop', name: key });
      return audio?.stopLoop?.(key, fade) ?? null;
    },
  };
  const secondDressSequence = createDressHelpSequence({
    timingBar: TimingBar,
    audio: secondDressAudio,
    rig: {
      begin() {
        secondDressActorStaging.begin();
        secondDressStrap.position.y = secondDressStart.y;
        secondDressStrap.rotation.z = secondDressStart.rotation;
        secondDressFocus.begin();
        screen?.setInstruction?.('TIME THE PULL WITH E');
      },
      onHit({ index, total }) {
        const progress = index / total;
        secondDressStrap.rotation.z = THREE.MathUtils.lerp(secondDressStart.rotation, 0.18, progress);
        secondDressStrap.position.y = secondDressStart.y + progress * 0.08;
      },
      onMiss() {
        secondDressStrap.rotation.z = Math.min(0.28, secondDressStrap.rotation.z + 0.04);
      },
      finish() {
        secondDressActorStaging.end();
        posePoolRecliner(secondPoolGirl);
        secondDressFocus.end();
        screen?.setTiming?.(null);
        screen?.setInstruction?.(null);
      },
      reset() {
        secondDressActorStaging.end();
        secondDressFocus.end();
        secondDressStrap.position.y = secondDressStart.y;
        secondDressStrap.rotation.z = secondDressStart.rotation;
        /* Abandon hands the fixture pose back in a known frame; the bounded
         * recliner rest motion resumes on the next cast tick. */
        posePoolRecliner(secondPoolGirl);
      },
    },
    onComplete() {
      poolEvening.secondPhase = 'done';
      poolEvening.secondDressHelped = true;
      dialogue.play(SEQUENCES.poolGirlDressHelp);
      /* Either performer's finished strap is the same pool beat. */
      onEveningBeat('pool');
    },
    onAbandon() {
      poolEvening.secondPhase = 'ready';
    },
  });

  /* A Mansion abandon is a retry, not a chapter transition. Let the shared
   * sequence perform its authored abandon payoff first, then reset the shared
   * TimingBar and this room's strap rig before returning the prompt to READY.
   * Keeping this lifecycle in one production adapter prevents preview/tests
   * from quietly doing extra cleanup the player's Q path never receives. */
  function abandonSecondPoolDress() {
    if (!secondDressSequence.abandon()) return false;
    secondDressSequence.reset();
    poolEvening.secondPhase = 'ready';
    poolEvening.secondDressHelped = false;
    return true;
  }

  const water = pool?.pool ?? { x0: -7, x1: 7, z0: 81, z1: 89 };
  const waterY = pool?.waterY ?? poolAt.y - 0.2;
  const poolGirlInWater = post('poolPerformer2', {
    role: 'performer',
    name: 'the Bada Bing brunette performer',
    tier: 'ambient',
    x: (water.x0 + water.x1) / 2 + 2.2,
    /* The basin's finished floor is waterY-1.1. At -1.15 the standing rig's
     * soles sat 37 mm through it, and the 44 mm treading bob could drive them
     * farther. Nine centimetres of lift leaves 9 mm at the lowest authored
     * bob while her shoulders remain below the waterline. */
    y: waterY - 1.06,
    z: (water.z0 + water.z1) / 2 + 0.4,
    yaw: yawToward((water.x0 + water.x1) / 2 + 2.2, (water.z0 + water.z1) / 2 + 0.4,
      firstLounger.x, firstLounger.z),
    model: {
      role: 'performer', adult: true, gender: 'female', bodyShape: 'curvy',
      height: 1.7, build: 1.04, dress: 'bikini', ...BADA_BING_PERFORMERS[1],
    },
    look: 'One of the girls from the club is cooling off in the pool.',
  });
  poolGirlInWater.inFixture = 'the pool';
  poolGirlInWater.poolPose = 'in-water';
  poolGirlInWater.performerMotion = 'treading';
  poolGirlInWater.performerIdentity = POOL_PERFORMER_IDENTITIES.poolPerformer2;
  const seatedPerformerMotions = [
    ...suitePerformers.map((npc, index) => createSeatedPerformerMotion(npc, {
      kind: 'tub', phase: index * 1.9,
    })),
    ...poolRecliners.map((npc, index) => createSeatedPerformerMotion(npc, {
      kind: 'recliner', phase: index * 1.25,
    })),
  ].filter(Boolean);
  const poolTreadingMotion = createPoolTreadingMotion(poolGirlInWater, {
    water,
    waterY,
    phase: 0.7,
  });

  /* ---- LIL TOM CRUZE ---------------------------------------------------
   *
   * `./dog.js` — a full German Shepherd with a gait, a sit, a wag and a pet
   * interaction, written to the owner's own brief ("It needs to be animated
   * and work and go from the office to the bed room and stuff and the player
   * can pet it") and then never mounted by anything at all. It is mounted
   * here, which is where the people are.
   *
   * HIS GATE IS THE BOOKCASE. `enabled` is the secret door being open, so he
   * holds on his cushion while the way down is shut and trots the route the
   * moment it is not — which is a dog with a closed door in front of it, and
   * is also the only honest way to stop him walking through 200 kg of oak.
   * He is a hero-tier body in a room with two people in it; his update
   * allocates nothing.
   */
  const secretDoor = suite?.secretStair ?? null;
  const dog = suite ? mountLilTomCruze({
    parent: scene,
    interaction,
    player: camera ?? player,
    enabled: () => enabled() && (secretDoor ? secretDoor.isOpen() : true),
    audio,
    /* No cue name is invented. He is a quiet dog until somebody records one;
     * see ENGINE-TRAPS #3 on cues that exist only at a call site. */
    barkCue: null,
    /* Making a fuss of him is a settling-in beat on the quiet evening. */
    onPet: () => onEveningBeat('dog'),
  }) : null;

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
        role: 'family_member',
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
        role: 'family_member',
        name: 'Booski',
        model: withFace(BOOSKI, FACES.booski),
        x: booskiAt.x,
        y: booskiAt.y,
        z: booskiAt.z,
        yaw: yawToward(booskiAt.x, booskiAt.z, labAt.crossOpening?.x ?? booskiAt.x + 7, booskiAt.z + 1.3),
        /* THE HAND-OFF IS A MAN, NOT A SPOT ON THE FLOOR.
         *
         * Owner playtest, 2026-08-06: *"Case hand-off: prompt floats at a
         * random spot near Booski. Walk up to Booski, hit E, case auto-places
         * on the table."*
         *
         * It did float: the only thing registered for the delivery was the
         * wall DRAWER's aim box, which is a steel hatch a metre and a half
         * behind him, so the prompt for the biggest beat in the mission
         * appeared over a piece of scenery while the man who asked for the
         * case stood beside it saying "On the transfer table. Both hands."
         *
         * So the press is on HIM now. The drawer keeps its own registration —
         * it is a real object and pressing it still works — but the beat is
         * the one the line describes: you walk up to Booski and give him the
         * case, and the case goes on the table (`mission/mount.js` animates
         * it onto `tableSpot`).
         *
         * `onDeliverCase` is injected because this module has never heard of
         * the mission and must not learn: same split as `hasCase`. */
        look: () => (carryingCase()
          ? 'Give Booski the <b>case</b>'
          : 'Booski. Everything in this basement is happening because he said so.'),
        onUse: () => handTheCaseOver(),
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
        role: 'family_member',
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
      role: 'family_member',
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
      /** Scene-local only. The campaign state machine never reads this. */
      deathCause: null,
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
          if (lab?.xxx?.alive === false) return 'xXx is dead';
          if (!torture.handed) return 'xXx, who is still talking';
          return 'Swing the <b>cord</b>';
        },
        enabled: () => enabled() && lab?.xxx?.alive !== false,
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
  /*   press xXx    -> you swing it. Ten landed blows are fatal.           */
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
    applyCordVisibility();
    onCordOwned(true);
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
    onCordOwned(false);
  }

  /**
   * Is the cord actually in shot.
   *
   * TWO FACTS, and the model is visible only when both hold — the same rule
   * `mission/mount.js` keeps for the case:
   *
   *   torture.handed  -- Gratin gave it to him (this module's business)
   *   cordInHand      -- its slot is selected  (the player's business)
   */
  let cordInHand = true;
  function applyCordVisibility() {
    if (torture?.cord?.root) torture.cord.root.visible = Boolean(torture.handed && cordInHand);
  }

  /** What he says on the first swing, and on every one after it. */
  const SWING_LINES = [
    SEQUENCES.tortureSwing,
    SEQUENCES.tortureSwingTwo,
    SEQUENCES.tortureSwingThree,
    SEQUENCES.tortureSwingFour,
  ];
  const XXX_FATAL_WHIP_HITS = 10;

  function killXxx(cause, hit = null) {
    if (!torture || lab?.xxx?.alive === false) return false;
    if (lab?.xxx?.kill?.(cause, hit) !== true) return false;
    torture.deathCause = cause;
    dialogue.clear();
    screen?.hideLine?.();
    return true;
  }

  /**
   * Accept a round that struck him -- the aim volume OR the man in it.
   *
   * It used to accept only the volume, because the volume was the only thing
   * in the weapon system's hit targets. The body is in them now (see
   * `lab.targets.xxxBody`), which is what lets a wound land on the limb the
   * round actually hit instead of on the edge of a box a metre wide, so a hit
   * anywhere under the rig has to count too -- otherwise adding the body would
   * have made him harder to kill the more accurately you shot him.
   */
  function hitXxxWithFirearm(hit) {
    if (!torture?.target || lab?.xxx?.alive === false) return false;
    const body = lab?.targets?.xxxBody ?? null;
    let part = hit?.object;
    let struck = false;
    while (part) {
      if (part === torture.target || (body && part === body)) { struck = true; break; }
      part = part.parent;
    }
    if (!struck) return false;
    /* The weapon owns the shot and tracer. This owns only its consequence. */
    burstAtHim();
    burstAtHim();
    return killXxx('firearm', hit);
  }

  /**
   * Swing it at him. The player's decision, at the moment he makes it, and he
   * can keep making it until the tenth landed hit kills him.
   *
   * IT CANNOT MISS AND IT CANNOT REACH ANYBODY ELSE, and not because it is
   * filtered: this function is only ever reached from the interaction handler
   * registered on `lab.xxx.aim`, and there is no ray, no target list and no
   * damage model in this module for it to reach anything else through. A
   * dead xXx cannot start another swing.
   */
  function swingAtHim() {
    if (!torture) return false;
    if (lab?.xxx?.alive === false) return false;
    /* Not holding it yet: he has to ask Gratin first, and the prompt on
     * Gratin already says so. Consume nothing. */
    if (!torture.handed) return false;
    /* PUT AWAY. He owns it, it is in his inventory, and it is not in his
     * hand — so there is nothing to swing. Refused rather than silently
     * conjured back into shot, because the slot is the player's and a swing
     * that un-stows the cord is the mission taking his selection off him. */
    if (!cordInHand) return false;
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
    if (torture.swings >= XXX_FATAL_WHIP_HITS) {
      const from = playerPosition().clone?.() ?? new THREE.Vector3(
        playerPosition().x, playerPosition().y, playerPosition().z,
      );
      killXxx('whip', {
        point: strikePoint().clone(),
        object: torture.target,
        from,
      });
      return;
    }
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
  /* BUILT IN TWO LAYERS, ON PURPOSE. `scenes/SilentSquatch.js` owns     */
  /* every persistent wound and pool through the shared blood adapter.   */
  /* This module owns only the transient contact welt/spray and calls the */
  /* one `lab.xxx.kill()` seam, so there is never a second floor decal.   */
  /*                                                                     */
  /* WHERE the cord lands is MEASURED rather than authored: the world     */
  /* box of `lab.xxx.aim` is the body as it is actually built and hung,   */
  /* so the spray comes off his back at whatever height he is at, and it  */
  /* cannot drift if the rig is re-hung.                                   */
  /* ---------------------------------------------------------------- */
  const M_BLOOD = mat({ color: 0x5e0d0d, roughness: 0.32, metalness: 0.02 });
  /* `unique`, because this one's opacity is animated and a shared material
   * would fade whatever else happened to be built from the same parameters. */
  /* NOT A WHITE FLASH (owner playtest: *"the white flash when I hit him — it
   * should be blood and impact, not a light"*).
   *
   * It was `color: 0xffd9b0, emissive: 0xff9a5a, emissiveIntensity: 2.4` — a
   * warm, self-lit, near-white disc that grew to three times its size. That
   * is a muzzle flash or a spark, and it is what you build when the note says
   * "impact effect" and you reach for the effect you have already got. A
   * leather cord across a man's back does not emit light. It bruises,
   * splits, and throws what is already on him.
   *
   * So: no emissive at all, the same dark arterial red as the droplets, and
   * it OPENS AND FADES rather than flaring — a welt appearing, not a lamp
   * coming on. Kept `unique` because its opacity is animated per hit. */
  const M_IMPACT = mat({
    color: 0x6b0f0f,
    roughness: 0.5,
    metalness: 0.02,
    transparent: true,
    opacity: 1,
    unique: true,
  });
  /** Droplets in flight and the transient contact welt. */
  const spray = [];
  let flash = null;
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

  /**
   * One hit: a flash of contact, and blood off it.
   *
   * The droplets are thrown with real velocity and fall under gravity, so
   * they fall where physics puts them rather than where somebody decided a
   * spatter looks good. They are transient; the shared adapter alone owns the
   * persistent wound and fatal pool.
   */
  function burstAtHim() {
    const at = strikePoint();

    /* The contact itself: a wet dark mark that opens where the cord landed
     * and is gone in a quarter of a second. Longer than the old 0.14 s
     * because it is no longer a flash — a flash has to be brief or it reads
     * as a lamp, and this has to be legible or it reads as nothing. */
    if (!flash) {
      flash = cylinder({ r: 0.09, h: 0.02, pos: [0, 0, 0], mat: M_IMPACT, cast: false });
      flash.name = 'mansion.whipImpact';
      scene.add(flash);
    }
    flash.position.copy(at);
    flash.visible = true;
    flash.userData.life = 0.26;

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
      const k = Math.max(0, flash.userData.life / 0.26);
      /* Opens out and thins away, which is how a struck surface reads. Half
       * the old growth: 2.6x on a 90 mm disc was a 700 mm halo round a man's
       * back, which is part of why it read as a light rather than a hit. */
      flash.scale.setScalar(0.7 + (1 - k) * 1.3);
      M_IMPACT.opacity = k * 0.92;
      if (flash.userData.life <= 0) flash.visible = false;
    }
    if (!spray.length) return;
    const floorY = (lab?.xxx?.at?.y ?? BASEMENT_Y) + 0.012;
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
    }
  }

  /* ---------------------------------------------------------------- */
  /* Barks                                                             */
  /* ---------------------------------------------------------------- */
  const here = new THREE.Vector3();
  const hearingPoint = { x: 0, y: 0, z: 0 };
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
   * You give Booski the case, and Booski puts it on the table.
   *
   * Owner playtest: the delivery prompt used to live on the wall drawer, a
   * metre and a half behind the man asking for it. It lives on him now, and
   * this is the press.
   *
   * THE REFUSED PRESS SPEAKS (docs/RIGHT-FIRST-TIME.md, "the refused-input
   * rule"). If the mission is not at the delivery yet -- he walked down here
   * before Lou had handed him anything, or he has already delivered -- Booski
   * says so rather than the button doing nothing three times in a row.
   */
  function handTheCaseOver() {
    if (!carryingCase()) return false;
    if (typeof onDeliverCase !== 'function') return false;
    if (onDeliverCase() === true) return true;
    dialogue.interject(SEQUENCES.deliveryStall);
    return true;
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
      /* Same throat as GATE, different body, forty metres apart. */
      case 'BOOTH': return people.booth;
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
      case 'SAUCE': return people.sauce;
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

  /* ================================================================ */
  /* THE SEAT PASS                                                     */
  /*                                                                    */
  /* Run once, here, after every body in the house is standing where it */
  /* belongs: each seated figure is measured against the furniture      */
  /* under him and lifted onto it. See `sitOnTheSeat` for why the       */
  /* arithmetic on its own could not do this.                           */
  /* ================================================================ */
  const seatLifts = {};
  /* THE MATRICES FIRST. Nothing has been rendered yet at mount, so most of
   * the house has never had `updateMatrixWorld` run on it and every mesh is
   * still sitting at its local transform as far as a raycast is concerned.
   * Without this the rays sail through the furniture and report a floor two
   * rooms away — which is exactly what the first version of this pass did:
   * it corrected the two people in the hot tub, whose subtree had been
   * touched, and left the three the owner actually complained about. */
  scene.updateMatrixWorld(true);
  for (const entry of seated) {
    const lift = sitOnTheSeat(scene, entry.npc);
    if (lift !== null) seatLifts[entry.id] = lift;
  }

  /**
   * How every seated body is sitting, right now.
   *
   * `gap` is the distance from the underside of his hips to the surface
   * directly beneath them: 0 is sitting on it, negative is inside it, and a
   * large positive number is hovering. Published so a verifier can assert the
   * owner's note rather than take a screenshot of it.
   */
  function seatReport() {
    const out = [];
    for (const entry of seated) {
      const found = seatUnder(scene, entry.npc);
      if (!found) continue;
      out.push({
        id: entry.id,
        name: entry.npc.name,
        lifted: seatLifts[entry.id] ?? null,
        hips: +found.hips.toFixed(3),
        seat: found.seat === null ? null : +found.seat.toFixed(3),
        gap: found.seat === null ? null : +(found.hips - found.seat).toFixed(3),
      });
    }
    return out;
  }

  /** Actual visible leg meshes and occupied fixture for runtime geometry QA. */
  function poolPerformerRig(index = 0) {
    const npc = people[`poolPerformer${index}`];
    if (!npc?.group) return null;
    const classify = (leg, shin) => {
      const parts = { thigh: [], shin: [], foot: [] };
      const below = (node, ancestor) => {
        for (let at = node; at; at = at.parent) if (at === ancestor) return true;
        return false;
      };
      leg?.traverse?.((mesh) => {
        if (!mesh?.isMesh || !mesh.visible) return;
        if (mesh.name.startsWith('shoe.') || mesh.name === 'foot.bare') parts.foot.push(mesh);
        else if (below(mesh, shin)) parts.shin.push(mesh);
        else parts.thigh.push(mesh);
      });
      return parts;
    };
    const chairIndex = index === 0 ? 4 : index === 1 ? 6 : null;
    return {
      target: npc.group,
      strap: npc.parts?.body?.getObjectByName?.(
        index === 1 ? 'pool-performer-2-dress-strap' : 'pool-performer-dress-strap',
      ) ?? null,
      head: npc.parts?.head ?? null,
      chair: chairIndex === null ? null : pool?.chairs?.[chairIndex] ?? null,
      legs: {
        left: classify(npc.parts?.legL, npc.parts?.shinL),
        right: classify(npc.parts?.legR, npc.parts?.shinR),
      },
    };
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
    hearingPoint.x = p.x;
    hearingPoint.y = feetY;
    hearingPoint.z = p.z;
    for (const entry of posts) {
      const d = Math.hypot(
        entry.npc.group.position.x - p.x,
        entry.npc.group.position.z - p.z,
      );
      const ignoreBlockers = typeof speechOcclusionExceptions === 'function'
        ? speechOcclusionExceptions(entry.id)
        : null;
      const inside = speechGate
        ? speechGate.inspect(entry.id, {
          listenerPosition: hearingPoint,
          speakerPosition: entry.npc.group.position,
          range: entry.range,
          verticalTolerance: 2.4,
          ignoreBlockers,
          /* Physical presence is independent from a line's cooldown. Gratin
           * must not receive onLeave while the player is still beside him just
           * because his greeting has put his voice on cooldown. */
          cooldown: false,
        }).allowed
        : d <= entry.range && Math.abs(entry.npc.group.position.y - feetY) < 2.4;
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
      const voiceReady = () => !speechGate || speechGate.canSpeak(entry.id, {
        listenerPosition: hearingPoint,
        speakerPosition: entry.npc.group.position,
        range: entry.range,
        verticalTolerance: 2.4,
        ignoreBlockers,
      });
      const commitVoice = () => speechGate?.commit(entry.id);
      /* `inside` was accepted above with cooldown disabled. If the shared gate
       * now refuses a cast-owned bark before this post has spoken, another
       * controller already committed this same real speaker. The mounted
       * mission owns both Eric sequences in that case; synchronize the post
       * instead of replaying its arrival when the cooldown expires, followed
       * by its identical idle line. A missionless cast has no prior commit and
       * still takes this bark normally. */
      if (!entry.said && entry.bark && speechGate && !voiceReady()) {
        entry.said = true;
        entry.saidIdle = true;
        continue;
      }
      if (!entry.said && (entry.bark || entry.onArrive) && voiceReady()) {
        entry.said = true;
        commitVoice();
        turn();
        if (entry.onArrive) entry.onArrive();
        else dialogue.interject(entry.bark);
        continue;
      }
      /* An idle line is what somebody says into a silence, so it waits for
       * one. Interjected while a run is going it lands in the MIDDLE of it —
       * Gratin's offer came out as greeting, gag, "take your turn or don't",
       * and then the question, in that order. */
      if (!entry.saidIdle && entry.idle && entry.near >= IDLE_SECONDS
        && !dialogue.busy && voiceReady()) {
        entry.saidIdle = true;
        commitVoice();
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
     * Boxes the composition root should push into `world.colliders` and count,
     * exactly the way it counts the armory's racks. One entry: Snow's cart.
     * (The cellar television used to be the second; it is the laboratory's
     * flatscreen now and the laboratory owns its collider.) Nobody's BODY is
     * in here — the house has never made a person solid and this module is
     * not the place to start.
     */
    colliders: [cartCollider],
    /** Snow's body, published so a caller can prove he is here. He carries no
     * threat state, no health and no team, and nothing in this module gives
     * him any. */
    get snow() { return people.snow; },
    /**
     * Booski has called him down. Owner playtest: he has clean-up lines about
     * the laboratory and was never in it. Returns false in a house with no
     * laboratory, and is a no-op once he is already on his way.
     */
    snowToTheBasement: () => snowToTheBasement(),
    /** Where he is on that errand, for a check that wants to prove it. */
    get snowErrand() {
      if (!snowErrand) return null;
      const at = people.snow.group.position;
      return {
        arrived: snowErrand.arrived,
        x: +at.x.toFixed(2),
        y: +at.y.toFixed(2),
        z: +at.z.toFixed(2),
      };
    },
    /** Every seated body, and how it is sitting. See `seatReport`. */
    seats: () => seatReport(),
    /** Real limb meshes + actual occupied chair; no re-derived proxy geometry. */
    poolPerformerRig: (index = 0) => poolPerformerRig(index),
    /** Lil Tom Cruze, or null in a house with no third floor in it. */
    dog,
    /** The two verbs, for a caller that wants to drive them without a mouse.
     * `takeCord` is Gratin; `swing` is xXx, and it works every time. */
    takeCord: () => handTheCordOver(),
    swing: () => swingAtHim(),
    hitXxxWithFirearm: (hit) => hitXxxWithFirearm(hit),
    get dressHelpActive() { return secondDressSequence.active; },
    pressDressHelp: () => secondDressSequence.press(),
    abandonDressHelp: () => abandonSecondPoolDress(),

    update(dt) {
      if (!enabled()) return;
      stageTheatreEvening();
      stageLanEvening();
      const p = playerPosition();
      for (const key of Object.keys(people)) people[key].update(dt, p);
      /* Npc.update deliberately restores the neutral torso pose every frame;
       * the loungers are a fixture-specific rest pose, so apply it after the
       * shared animation has done its work. */
      for (const npc of poolRecliners) posePoolRecliner(npc);
      for (const motion of seatedPerformerMotions) motion.update(dt);
      poolTreadingMotion?.update(dt);
      /* Shubes' mouse hand, applied after Npc.update's shared pose reset,
       * the same ordering every fixture motion above relies on. */
      lanGamerMotion?.update(dt);
      const dressTiming = secondDressSequence.update(dt);
      if (secondDressSequence.active) secondDressActorStaging.apply();
      /* TimingBar deliberately retains its last view after stop so a caller
       * can inspect the seven landed hits. That snapshot is not an active HUD:
       * republishing it every cast frame resurrected PULL 7 / 7 after
       * rig.finish() had cleared the overlay for the payoff subtitle. */
      screen?.setTiming?.(secondDressSequence.active ? dressTiming : null);
      /* The dog walks his own route rather than a `post`'s: he is not a
       * person, he has no lines, and his gate is a door rather than a bark
       * range. Ticked unconditionally so his own `enabled` decides, not this
       * loop -- a dog that only animates when you are looking at him is a
       * statue that moves when you turn round. */
      dog?.update(dt);
      updateSnowErrand();
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

    /**
     * The player's half of "is the cord in his hand".
     *
     * Called by the inventory when its slot is selected or left, exactly the
     * way `mission/mount.js`'s `setCaseInHand` is. It cannot make him HAVE a
     * cord Gratin has not handed over — that is `torture.handed`, and it
     * stays this module's.
     */
    setCordInHand(on) {
      cordInHand = Boolean(on);
      applyCordVisibility();
    },
    /** True while Gratin has given it to him, stowed or not. */
    get hasCord() { return Boolean(torture?.handed); },

    /** The headless surface, the same shape the mission's `debug` has. */
    debug: {
      /**
       * Deterministic browser-verifier ledger for the real ambient cast.
       * Only catalogued Mansion characters with bodies and delivered cues
       * belong here; an absent name is not a character-content requirement.
       */
      get ambientSpeakers() {
        const sauceCues = SAUCE_MANSION_BARK.map((line) => line.cue).filter(Boolean);
        return [
          {
            id: 'sauce', present: Boolean(people.sauce),
            cues: [...sauceCues], count: sauceCues.length,
          },
          {
            id: 'eric', present: Boolean(people.eric),
            cues: [...ERIC_MANSION_AMBIENT_CUES], count: ERIC_MANSION_AMBIENT_CUES.length,
          },
        ];
      },
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
      get evening() {
        return {
          poolPhase: poolEvening.phase,
          poolSecondGreeted: poolEvening.greetedSecond,
          dressHelped: poolEvening.dressHelped,
          secondDressPhase: poolEvening.secondPhase,
          secondDressHelped: poolEvening.secondDressHelped,
          secondDress: {
            active: secondDressSequence.active,
            hits: secondDressSequence.hits,
            misses: secondDressSequence.misses,
            clapStage: secondDressSequence.clapStage,
            view: secondDressSequence.debug.view,
            cues: [...secondDressCueLog],
            focus: secondDressFocus.debug,
            actorStaging: secondDressActorStaging.debug,
          },
          poolComposition: ['poolPerformer0', 'poolPerformer1', 'poolPerformer2']
            .map((id) => ({
              id,
              name: people[id]?.name ?? '',
              identity: people[id]?.performerIdentity ?? null,
              pose: people[id]?.poolPose ?? '',
              motion: people[id]?.performerMotion ?? '',
              headX: Number(people[id]?.parts?.head?.rotation?.x?.toFixed?.(4) ?? 0),
              x: Number(people[id]?.group?.position?.x?.toFixed?.(2) ?? 0),
              y: Number(people[id]?.group?.position?.y?.toFixed?.(2) ?? 0),
              z: Number(people[id]?.group?.position?.z?.toFixed?.(2) ?? 0),
            })),
          suiteComposition: ['suitePerformer0', 'suitePerformer1']
            .filter((id) => people[id])
            .map((id) => ({
              id,
              motion: people[id]?.performerMotion ?? '',
              y: Number(people[id]?.group?.position?.y?.toFixed?.(3) ?? 0),
              bodyZ: Number(people[id]?.parts?.body?.rotation?.z?.toFixed?.(4) ?? 0),
            })),
          oldStovePresent: Boolean(people.oldStove),
          theatreChannel: theatreChannel?.() ?? '',
          theatreStaged: theatreEveningStaged,
          lanStaged: lanEveningStaged,
          lanShubes: {
            job: people.shubes?.job ?? '',
            fixture: people.shubes?.inFixture ?? null,
            motion: lanGamerMotion?.snapshot ?? null,
            x: Number(people.shubes?.group?.position?.x?.toFixed?.(2) ?? 0),
            y: Number(people.shubes?.group?.position?.y?.toFixed?.(2) ?? 0),
            z: Number(people.shubes?.group?.position?.z?.toFixed?.(2) ?? 0),
          },
          theatreComposition: THEATRE_COMPANIONS.map(({ id, seat }) => ({
            id,
            name: people[id]?.name ?? '',
            seat: people[id]?.theatreSeat ?? seat,
            job: people[id]?.job ?? '',
          })),
        };
      },
      stageTheatreEvening: () => stageTheatreEvening(),
      stageLanEvening: () => stageLanEvening(),
      useShubes: () => people.shubes?.group?.userData?.interact?.onUse?.() === true,
      usePoolGirl: () => people.poolPerformer0?.group?.userData?.interact?.onUse?.() === true,
      useSecondPoolGirl: () => people.poolPerformer1?.group?.userData?.interact?.onUse?.() === true,
      abandonSecondPoolDress: () => abandonSecondPoolDress(),
      get secondPoolDress() { return secondDressSequence; },
      setSecondPoolDressTarget(on = true) {
        secondDressSequence.debug.bar.pos = on ? 0.8 : 0.1;
        return secondDressSequence.debug.bar.onTarget;
      },
      useOldStove: () => people.oldStove?.group?.userData?.interact?.onUse?.() === true,
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
          /** In shot, as opposed to owned. The stow the owner asked for. */
          cordInHand,
          cordVisible: Boolean(torture.cord?.root?.visible),
          alive: lab?.xxx?.alive !== false,
          deathCause: torture.deathCause,
          fatalWhipHits: XXX_FATAL_WHIP_HITS,
          fatalPoolVisible: Boolean(lab?.xxx?.fatalPool?.visible),
          fatalWoundsVisible: Boolean(lab?.xxx?.fatalMarks?.some?.((mark) => mark.visible)),
          /** Persistent blood belongs to the lab's shared reusable adapter. */
          bloodMarks: lab?.inventory?.bloodMarks ?? 0,
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
      hitXxxWithFirearm: (hit = null) => hitXxxWithFirearm(hit),
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
      /* The blood in the air, and the flash. Persistent marks belong to the
       * lab's shared adapter, not this module — there is no local collection
       * of them to tear down (a phantom `marks` here once threw and abandoned
       * the rest of this teardown). */
      for (const drop of spray.splice(0)) drop.parent?.remove(drop);
      flash?.parent?.remove(flash);
      flash = null;
      M_IMPACT.dispose?.();
    },
  };
}
