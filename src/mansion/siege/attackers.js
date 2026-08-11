/**
 * THE MEN COMING UP LOU'S DRIVE.
 *
 * Twenty-seven hostiles across the whole night: two in the cellar corridor,
 * three in the foyer, and twenty-two up the stairs in two waves. This module
 * is the pool that owns their bodies, their guns and their behaviour;
 * `./waves.js` decides who exists and when, and `src/core/combat/` decides
 * what happens when one of them is shot.
 *
 * ## WHAT THIS FILE IS NOT ALLOWED TO CONTAIN
 *
 * From the brief, PART VIII, verbatim: *"No siege-only health, damage or
 * weapon code."* So there is none. Every number that decides whether a man
 * lives goes through the shared core and nothing else:
 *
 *   CombatActor          health, armour, injury grade, incapacitation, the
 *                        `core` protection, snapshot/restore.
 *   resolveBallisticHits every round, in both directions. An attacker firing
 *                        at the player and the player firing at an attacker
 *                        are the SAME function with the attacker and target
 *                        swapped -- see `_fireAt` and `registerHit`.
 *   FactionMatrix        who may shoot whom. Attackers are CARTEL. Nothing
 *                        here compares faction strings.
 *   SuppressionModel     one per attacker, plus the near-misses they put on
 *                        the player.
 *   TracerPool           every round in the air, in one draw call.
 *   WeaponController     magazine, cooldown, recoil, reload. An attacker who
 *                        empties a magazine reloads and stops shooting while
 *                        he does it, because the shared controller says so.
 *   BurstController      trigger discipline. A rifleman fires in threes.
 *
 * The one thing this file DOES own is what a round is worth where it lands --
 * `HIT_ZONES` below -- and even that is a multiplier applied BEFORE the shared
 * resolver, not a second damage model beside it.
 *
 * ## NOBODY APPEARS FROM THIN AIR, AND THEY COME IN THE FRONT DOOR
 *
 * The brief: *"Every attacker activates in a staging zone out of the player's
 * view and walks in."* The owner, 2026-08-05: *"everyone should funnel in
 * through the main door."* So `spawn(order)` puts a man at `order.staging.x/z`
 * -- for eighteen of the twenty-two that is the drive or the bottom of the
 * front steps -- gives him his gun, and hands him to the nav graph, which
 * walks him up the treads, through `FRONT_DOOR`, across the foyer, up one of
 * the two flights of the horseshoe and onto the gallery. He is an active
 * `CombatActor` from the instant he is placed, so by the time the player can
 * see him he has already been fighting for several seconds.
 *
 * `spawnedInsideView()` on the returned pool is the check that says so: no
 * attacker's spawn position is ever inside the foyer or on the landing.
 *
 * ## THE ROUTES ARE A GRAPH, NOT A LIST OF POINTS
 *
 * `./nav.js` authors the anchors -- the forecourt, the steps, the portico,
 * the door mouth, the foyer floor, the two flights, the gallery, the balcony
 * step, and the two flank routes through the wings -- and hands them to the
 * `AuthoredNavigationGraph` the heist's crew already walk on. This module
 * decides WHICH zone a man is trying to reach and WHICH flight he takes; the
 * graph decides how he gets there and `occupy()` decides that no two men
 * stand in the same place when they arrive.
 *
 * ## TWENTY-TWO IDENTICAL RIFLEMEN IS NOT AN ENCOUNTER
 *
 * `ROLE_PLAN` gives each of the eight roles a different tactic, a different
 * gun, a different standoff, a different flight up the horseshoe, a different
 * trigger discipline and a different appetite for cover. The shotgun rusher
 * closes to nine metres and does not stop for cover on the way. The suppressor
 * plants himself at thirty and puts sustained fire on the rail without ever
 * trying to climb. The flanker takes the other flight. The armoured one walks
 * through what kills the others. A test asserts no two roles share the whole
 * tuple, because "they have different health values" is not the same sentence
 * as "they behave differently".
 *
 * ## THE RAIL IS COVER, NOT IMMUNITY
 *
 * When an attacker's line to the player is blocked by the balustrade, the
 * round is resolved against the geometry -- the shared resolver stops it, the
 * player takes nothing -- but the near miss still goes into the player's
 * suppression model. A player crouched behind the rail is safe and is being
 * shot at, which is the whole point of the position.
 */
import * as THREE from 'three';

import { CombatActor } from '../../core/combat/actors.js';
import { resolveBallisticHits } from '../../core/combat/ballistics.js';
import { DEFAULT_FACTION_MATRIX, FACTIONS } from '../../core/combat/factions.js';
import { SuppressionModel } from '../../core/combat/suppression.js';
import { TracerPool } from '../../core/combat/tracers.js';
import { BurstController, WeaponController } from '../../core/combat/weapon.js';
import { playWeaponCue } from '../../core/weapons/audio.js';
import { WEAPON_CATALOG } from '../../core/weapons/catalog.js';
import { buildWeaponModel } from '../../core/weapons/models.js';
import { HeistFigure } from '../../heist/people.js';
import { braceSiegeWeapon, mountSiegeWeapon } from './armed-pose.js';
import {
  BASEMENT_Y, GROUND_Y, SiegeNavigator, UPPER_Y, anchorById, laneWaypoints, roomAt,
} from './nav.js';
import { COMBAT_BOUNDARY, DEFENCE_POST, ROLES, STAGING } from './waves.js';

/* ================================================================== */
/* THE HOUSE, AS NUMBERS                                                */
/*                                                                       */
/* Written out rather than imported, for the reason `src/mansion/cast.js` */
/* gives at the top of its own copy: importing MansionGrounds.js builds   */
/* canvas textures at module scope, which drags a WebGL-shaped dependency */
/* into anything that merely wants to know where the foyer is -- headless */
/* tests included. Every figure below is the constant the two scene files */
/* already export, and the base mansion is not edited to produce any of   */
/* them.                                                                  */
/*                                                                        */
/* The three FLOOR HEIGHTS are imported from `./nav.js` rather than        */
/* written out a third time: that module has to know them to place its     */
/* anchors, it is already in this file's import list, and two copies of    */
/* GROUND_Y in one directory is one copy too many.                         */
/* ================================================================== */
/** `MansionInterior.FOYER_VOID` -- the double-height hole under the landing. */
const FOYER_VOID = Object.freeze({ x0: -8.85, x1: 8.85, z0: 36, z1: 48 });
/**
 * The front staircase, as `MansionGrounds.buildFrontEntry` really builds it:
 * six treads from z 34 to z 35.5 climbing 0 to GROUND_Y, and then a level
 * portico landing from 35.5 to the facade at 36.
 *
 * It used to be one 34..36 ramp, which is a metre and a half of stairs
 * stretched over two metres -- so a man standing on the portico stood 0.24 m
 * inside its own slab, and the anchor check in the verifier reported the
 * landing he was standing on as something he was standing IN.
 */
const STEP_Z = 34;
const STEP_TOP_Z = 35.5;

/**
 * The staging zones that are below the house rather than in front of it.
 *
 * A basement corridor and a forecourt can share an (x, z) and be nine metres
 * apart, so the level rides on the man rather than being inferred from where
 * he is standing. Named explicitly rather than derived from `indoor` and a z
 * threshold, because the foyer is indoors too.
 */
const BASEMENT_STAGING = Object.freeze(new Set(['cellar_hall', 'cellar_vault']));

/** Floor height at a point on the ground level. */
export function groundHeightAt(x, z) {
  if (z >= STEP_TOP_Z) return GROUND_Y;
  if (z <= STEP_Z) return 0;
  return GROUND_Y * ((z - STEP_Z) / (STEP_TOP_Z - STEP_Z));
}

/* ================================================================== */
/* WHERE A ROUND LANDS ON A MAN                                         */
/*                                                                       */
/* The multiplier is applied to the damage handed to resolveBallisticHits, */
/* which is still the only thing that decides whether the hit lands. A     */
/* headshot is 2.6 rounds' worth of one round; it is not a special case in  */
/* the damage model, because there is only one damage model.               */
/* ================================================================== */
export const HIT_ZONES = Object.freeze({
  head: 2.6,
  chest: 1.0,
  limb: 0.58,
});

/* ================================================================== */
/* THE CARTEL, DRESSED                                                  */
/*                                                                       */
/* `src/core/wardrobe.js` has no cartel entry and this pass does not add  */
/* one -- when the palace mission needs these men again the table below   */
/* moves there whole, the same way the Bada Bing's bartender moved when   */
/* Lou's bar needed him. Until then they are dressed here, and dressed as */
/* a UNIT the way Lou's security is: one kit, spread, never restated, and */
/* they differ only in the four things a kit cannot hide.                 */
/*                                                                        */
/* They are NOT in suits. Lou's men are the ones in suits, and on a dark   */
/* landing at forty metres the player has about a fifth of a second to     */
/* tell a friendly from a hostile. Dark work clothes, a bandana, no        */
/* jewellery: everything Lou's people are not.                             */
/* ================================================================== */
const CARTEL_KIT = Object.freeze({
  dress: 'work',
  shirt: 0x2a2e26,
  jacketColour: 0x24281f,
  belt: 'leather',
  trouserFit: 'plain',
  bandana: true,
  watch: false,
  chain: false,
});

const CARTEL_LOOKS = Object.freeze([
  Object.freeze({ ...CARTEL_KIT, height: 1.79, build: 1.14, hair: 'crop', hairColour: 0x1a1310, skin: 0xb87a4e }),
  Object.freeze({ ...CARTEL_KIT, height: 1.72, build: 1.06, hair: 'short', hairColour: 0x241913, skin: 0x8d5a3a }),
  Object.freeze({ ...CARTEL_KIT, height: 1.86, build: 1.24, hair: 'bald', skin: 0xc08a5e, beard: true }),
  Object.freeze({ ...CARTEL_KIT, height: 1.75, build: 1.32, hair: 'crop', hairColour: 0x2a1c14, skin: 0xd9a97f }),
  Object.freeze({ ...CARTEL_KIT, height: 1.83, build: 1.10, hair: 'short', hairColour: 0x14100e, skin: 0x7a4f34, beard: true }),
  Object.freeze({ ...CARTEL_KIT, height: 1.68, build: 1.02, hair: 'tied', hairColour: 0x1c1410, skin: 0xe0b58a }),
  Object.freeze({ ...CARTEL_KIT, height: 1.88, build: 1.18, hair: 'crop', hairColour: 0x3a2a1a, skin: 0x9c6c4d }),
  Object.freeze({ ...CARTEL_KIT, height: 1.77, build: 1.40, hair: 'bald', skin: 0xa9764f, beard: true }),
]);

/* Wardrobe topology is role information, not just a palette swap. The base
 * clothes provide four immediately different reads (work shirt, bare-armed
 * tee, tracksuit and outerwear/camp shirt); the local kit geometry below then
 * says what each man does while the red headband keeps the whole group on the
 * same side at a glance. */
const ROLE_DRESS = Object.freeze({
  rifle: Object.freeze({ dress: 'work', shirt: 0x30352a }),
  smg: Object.freeze({ dress: 'tracksuit', shirt: 0x252b25, jacketColour: 0x20251f }),
  shotgun: Object.freeze({ dress: 'tee', shirt: 0x3a3428, build: 1.22 }),
  flanker: Object.freeze({ dress: 'bomber', shirt: 0x313a2d, jacketColour: 0x293328, patches: true }),
  suppressor: Object.freeze({ dress: 'work', shirt: 0x252922, jacketColour: 0x20241e }),
  armored: Object.freeze({
    dress: 'bomber', shirt: 0x1b1e22, jacketColour: 0x15171a, build: 1.46, height: 1.9,
  }),
  leader: Object.freeze({
    dress: 'camp', shirt: 0x463a29, shirtAccent: 0xb09a73, pattern: true,
    jacketColour: 0x2c2419, watch: 'silver', trim: true,
  }),
  gunner: Object.freeze({ dress: 'tee', shirt: 0x232a20, build: 1.36 }),
});

const kitBox = (size, pos, material, rotation = null) => Object.freeze({
  shape: 'box', size: Object.freeze(size), pos: Object.freeze(pos), material,
  rotation: rotation ? Object.freeze(rotation) : null,
});
const kitRound = (radius, height, pos, material, rotation = null) => Object.freeze({
  shape: 'round', radius, height, pos: Object.freeze(pos), material,
  rotation: rotation ? Object.freeze(rotation) : null,
});

/**
 * Public authored seam for the cartel wardrobe. Tests still inspect the real
 * built meshes and their world bounds; this table is exposed so a later scene
 * can reuse the same role language instead of inventing another cartel.
 */
export const CARTEL_ROLE_KITS = Object.freeze({
  rifle: Object.freeze({
    label: 'magazine webbing',
    pieces: Object.freeze([
      kitBox([0.045, 0.38, 0.026], [-0.075, 1.31, 0.205], 'web', [0, 0, -0.25]),
      kitBox([0.045, 0.38, 0.026], [0.075, 1.31, 0.205], 'web', [0, 0, 0.25]),
      kitBox([0.072, 0.105, 0.06], [-0.082, 1.12, 0.205], 'pouch'),
      kitBox([0.072, 0.105, 0.06], [0, 1.12, 0.205], 'pouch'),
      kitBox([0.072, 0.105, 0.06], [0.082, 1.12, 0.205], 'pouch'),
    ]),
  }),
  smg: Object.freeze({
    label: 'compact chest rig',
    pieces: Object.freeze([
      kitBox([0.29, 0.17, 0.06], [0, 1.31, 0.21], 'black'),
      kitBox([0.075, 0.13, 0.09], [-0.19, 1.18, 0.10], 'pouch'),
      kitBox([0.075, 0.13, 0.09], [0.19, 1.18, 0.10], 'pouch'),
    ]),
  }),
  shotgun: Object.freeze({
    label: 'shell bandolier',
    pieces: Object.freeze([
      kitBox([0.06, 0.57, 0.032], [0, 1.31, 0.21], 'web', [0, 0, -0.55]),
      ...[-0.13, -0.078, -0.026, 0.026, 0.078, 0.13].map((x, index) => kitRound(
        0.014, 0.074, [x, 1.43 - index * 0.05, 0.238], 'shell', [0, 0, -0.55],
      )),
    ]),
  }),
  flanker: Object.freeze({
    label: 'assault pack',
    pieces: Object.freeze([
      kitBox([0.34, 0.40, 0.17], [0, 1.29, -0.18], 'olive'),
      kitBox([0.36, 0.10, 0.13], [0, 1.535, -0.18], 'roll'),
      kitBox([0.05, 0.45, 0.028], [-0.03, 1.31, 0.205], 'web', [0, 0, 0.35]),
    ]),
  }),
  suppressor: Object.freeze({
    label: 'heavy chest rig and knee pads',
    pieces: Object.freeze([
      kitBox([0.39, 0.25, 0.075], [0, 1.31, 0.21], 'olive'),
      ...[-0.12, -0.04, 0.04, 0.12].map((x) => kitBox(
        [0.066, 0.14, 0.065], [x, 1.255, 0.258], 'pouch', [0.08, 0, 0],
      )),
      kitBox([0.15, 0.15, 0.065], [-0.105, 0.64, 0.125], 'black', [-0.18, 0, 0]),
      kitBox([0.15, 0.15, 0.065], [0.105, 0.64, 0.125], 'black', [-0.18, 0, 0]),
    ]),
  }),
  armored: Object.freeze({
    label: 'plate carrier',
    pieces: Object.freeze([
      kitBox([0.43, 0.48, 0.11], [0, 1.31, 0.19], 'plate'),
      kitBox([0.43, 0.45, 0.09], [0, 1.31, -0.18], 'plate'),
      kitBox([0.18, 0.15, 0.25], [-0.29, 1.45, 0], 'plate'),
      kitBox([0.18, 0.15, 0.25], [0.29, 1.45, 0], 'plate'),
    ]),
  }),
  leader: Object.freeze({
    label: 'command radio and shoulder boards',
    pieces: Object.freeze([
      kitBox([0.04, 0.48, 0.026], [-0.03, 1.31, 0.215], 'web', [0, 0, 0.38]),
      kitBox([0.115, 0.18, 0.075], [0.18, 1.31, 0.205], 'radio'),
      kitBox([0.17, 0.035, 0.18], [-0.15, 1.49, 0], 'leader'),
      kitBox([0.17, 0.035, 0.18], [0.15, 1.49, 0], 'leader'),
      kitBox([0.15, 0.11, 0.075], [-0.19, 1.06, 0.09], 'pouch'),
    ]),
  }),
  gunner: Object.freeze({
    label: 'linked ammunition and box',
    pieces: Object.freeze([
      kitBox([0.08, 0.63, 0.035], [0, 1.28, 0.21], 'web', [0, 0, 0.58]),
      ...[-0.19, -0.15, -0.11, -0.07, -0.03, 0.01, 0.05, 0.09, 0.13, 0.17].map(
        (x, index) => kitRound(
          0.013, 0.07, [x, 1.44 - index * 0.04, 0.242], 'shell', [0, 0, 0.58],
        ),
      ),
      kitBox([0.21, 0.25, 0.15], [0.245, 1.04, 0.06], 'ammo'),
    ]),
  }),
});

const CARTEL_KIT_MATERIALS = Object.freeze({
  web: new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.96 }),
  pouch: new THREE.MeshStandardMaterial({ color: 0x32372a, roughness: 0.94 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.92 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x3b442d, roughness: 0.96 }),
  roll: new THREE.MeshStandardMaterial({ color: 0x5a5540, roughness: 0.98 }),
  plate: new THREE.MeshStandardMaterial({ color: 0x292e30, roughness: 0.88 }),
  radio: new THREE.MeshStandardMaterial({ color: 0x111617, roughness: 0.82 }),
  leader: new THREE.MeshStandardMaterial({ color: 0x8e7246, roughness: 0.74 }),
  shell: new THREE.MeshStandardMaterial({ color: 0xb87932, metalness: 0.54, roughness: 0.42 }),
  ammo: new THREE.MeshStandardMaterial({ color: 0x485039, roughness: 0.9 }),
});

/* ================================================================== */
/* WHAT EACH OF THE EIGHT ROLES ACTUALLY DOES                           */
/*                                                                       */
/* THE BRIEF'S SENTENCE, VERBATIM: "Twenty-two identical riflemen walking */
/* through one doorway is explicitly not acceptable."                     */
/*                                                                        */
/*   weapon      catalog id. Drives the model in his hands, the fire cue,  */
/*               the tracer colour and the WeaponController's numbers.     */
/*   tactic      the shape of his whole fight. No two roles share one.     */
/*   standoff    metres he WANTS between himself and what he is shooting.  */
/*   speed       m/s. A rusher moves; a suppressor barely does.            */
/*   burst       trigger discipline, straight into BurstController.        */
/*   cover       0..1 appetite for a cover point instead of open floor.    */
/*   route       which way into the house: the middle, the east flank or   */
/*               the west. This is the "second route" the flanker needs.   */
/*   climbs      whether he will push a stair flight at the landing.       */
/*   pinsLanding whether he deliberately puts rounds on the gallery rail   */
/*               regardless of whether he can see anybody behind it.       */
/*   reposition  seconds between cover moves. 0 means he does not move     */
/*               once he is set.                                          */
/*   accuracy    base chance a round is on the man rather than near him.   */
/* ================================================================== */
export const ROLE_PLAN = Object.freeze({
  /* The body of every group. Cover to cover, three-round bursts, pushes the
   * middle of the foyer and then whichever flight is nearer. */
  rifle: Object.freeze({
    weapon: 'ak47',
    tactic: 'advance',
    standoff: 20,
    speed: 2.1,
    burst: Object.freeze({ min: 3, max: 4, pause: 1.05 }),
    cover: 0.7,
    route: 'centre',
    climbs: true,
    pinsLanding: false,
    reposition: 5.5,
    accuracy: 0.3,
  }),
  /* Closes hard and shoots a lot while he does it. Short bursts, little
   * interest in cover, and he is the reason standing still on the landing
   * stops working. */
  smg: Object.freeze({
    weapon: 'carbine',
    tactic: 'close',
    standoff: 11,
    speed: 2.8,
    burst: Object.freeze({ min: 5, max: 8, pause: 0.55 }),
    cover: 0.3,
    route: 'centre',
    climbs: true,
    pinsLanding: false,
    reposition: 2.6,
    accuracy: 0.22,
  }),
  /* The rusher. He is useless past nine metres and he knows it, so he does
   * not stop and he does not take cover -- he arrives or he does not. */
  shotgun: Object.freeze({
    weapon: 'revolver',
    tactic: 'rush',
    standoff: 6,
    speed: 3.4,
    burst: Object.freeze({ min: 1, max: 2, pause: 1.5 }),
    cover: 0,
    route: 'west',
    climbs: true,
    pinsLanding: false,
    reposition: 0,
    accuracy: 0.42,
  }),
  /* The second route. He does not push the middle at all -- he goes round the
   * east side of the house and comes at the landing from the flank, which is
   * the whole reason the player cannot camp one arc. */
  flanker: Object.freeze({
    weapon: 'carbine',
    tactic: 'flank',
    standoff: 14,
    speed: 2.6,
    burst: Object.freeze({ min: 3, max: 5, pause: 0.8 }),
    cover: 0.45,
    route: 'east',
    climbs: true,
    pinsLanding: false,
    reposition: 3.4,
    accuracy: 0.26,
  }),
  /* Sits at thirty metres and pins the rail. He does not climb, he does not
   * close, and he keeps firing at the landing whether or not he can see
   * anybody on it. He is what makes the rail cover rather than a wall. */
  suppressor: Object.freeze({
    weapon: 'ak47',
    tactic: 'pin',
    standoff: 28,
    speed: 1.2,
    burst: Object.freeze({ min: 8, max: 12, pause: 1.6 }),
    cover: 0.9,
    route: 'centre',
    climbs: false,
    pinsLanding: true,
    reposition: 9,
    accuracy: 0.14,
  }),
  /* Walks in. Forty-five points of armour is four or five rounds nobody else
   * absorbs, and he does not use cover because he does not need to -- which
   * also makes him the easiest man in the room to identify. */
  armored: Object.freeze({
    weapon: 'ak47',
    tactic: 'soak',
    standoff: 16,
    speed: 1.5,
    burst: Object.freeze({ min: 4, max: 6, pause: 0.9 }),
    cover: 0.1,
    route: 'centre',
    climbs: true,
    pinsLanding: false,
    reposition: 0,
    accuracy: 0.28,
  }),
  /* Hangs back, holds the doorway, and is worth killing because the men with
   * him fight better while he is standing. See `leadershipBonus`. */
  leader: Object.freeze({
    weapon: 'pistol9',
    tactic: 'direct',
    standoff: 24,
    speed: 1.8,
    burst: Object.freeze({ min: 2, max: 3, pause: 1.4 }),
    cover: 0.8,
    route: 'centre',
    climbs: false,
    pinsLanding: false,
    reposition: 7,
    accuracy: 0.18,
  }),
  /* The belt-fed gun in 2C. Long bursts, slow, and he sets up in the doorway
   * rather than in the room -- a hundred rounds in a box is not something you
   * carry up a staircase. */
  gunner: Object.freeze({
    weapon: 'saw',
    tactic: 'support',
    standoff: 26,
    speed: 1.0,
    burst: Object.freeze({ min: 12, max: 20, pause: 2.1 }),
    cover: 0.6,
    route: 'east',
    climbs: false,
    pinsLanding: true,
    reposition: 12,
    accuracy: 0.12,
  }),
});

/**
 * Which way in, now that "in" is one door.
 *
 * `route` is no longer which side of the HOUSE a man walks round -- everybody
 * except wave 2B comes through `FRONT_DOOR` -- it is which flight of the
 * horseshoe he takes once he is inside, and it goes straight into the nav
 * graph's own role filter as the tag on the west and east anchors. A wave
 * with a flanker in it is still a wave arriving at the rail from two places;
 * the split happens in the foyer rather than on the lawn.
 *
 * `centre` men alternate flights by index, which is what stops eight men
 * defending one staircase in a house that was built with two.
 */
const FLIGHT_FOR_ROUTE = Object.freeze({ east: 'east', west: 'west' });

function flightSideFor(plan, index) {
  return FLIGHT_FOR_ROUTE[plan.route] ?? (index % 2 ? 'east' : 'west');
}

/**
 * Where each tactic is trying to end up, in order of preference.
 *
 * A preference LIST rather than one zone, because the nav graph reserves a
 * destination with `occupy()` and there are more climbers in a wave than
 * there are places to stand on the gallery. A man told "the landing, or the
 * flight, or the foyer floor" ends up somewhere; a man told only "the
 * landing" stands in the doorway for the rest of the wave when the landing is
 * full, which is the queue the brief refuses.
 */
const DESTINATION_ZONES = Object.freeze({
  /* The two who never advance. Both posts have a real line up through the
   * double-height void at the gallery rail, and both are somewhere the player
   * can shoot back at -- the difference between a suppressor and a weather
   * system. */
  pin: Object.freeze(['overwatch', 'foyer']),
  support: Object.freeze(['overwatch', 'foyer']),
  /* The leader holds the doorway he came through. */
  direct: Object.freeze(['foyer', 'overwatch']),
  /* Everybody else: the landing, and the landing is the point. */
  default: Object.freeze(['gallery', 'stair', 'stair_foot', 'foyer']),
  /* The two men in the cellar corridor never join the staircase defence. */
  basement: Object.freeze(['basement']),
});

function destinationZonesFor(plan, staging) {
  if (BASEMENT_STAGING.has(staging.id)) return DESTINATION_ZONES.basement;
  return DESTINATION_ZONES[plan.tactic] ?? DESTINATION_ZONES.default;
}

/**
 * How much of a cartel round the player actually takes.
 *
 * MISSION CONFIGURATION, NOT A SECOND DAMAGE MODEL. The number multiplies the
 * amount handed to `resolveBallisticHits` and nothing else; armour, the
 * `core` protection, the faction refusal and the injury grade are all still
 * the shared core's, applied to the scaled figure exactly as they would be to
 * the raw one.
 *
 * It exists because the catalog is honest: an AK-47 is 46 points a round and
 * a hundred-health Prospect standing on a landing with fourteen men shooting
 * at him is dead in under a second of contact. Measured on the probe -- three
 * rounds, four fifths of a second, the whole staircase defence over. At 0.45
 * the same landing takes about seven rounds, which is a fight.
 *
 * Friendlies are NOT scaled. The men shooting at Lou's people are shooting to
 * kill and the mission's survival flags are what keep the named cast standing
 * (see `./ensemble.js`), not a quiet reduction nobody can see.
 */
const PLAYER_DAMAGE_SCALE = 0.45;

/**
 * Cover, and the ROOM each piece is in.
 *
 * The room is what makes this a cover list rather than a list of places. A
 * man on the gallery used to be offered the fountain, twenty metres away and
 * six metres down, because the filter was "his role's side of the house" and
 * the fountain is on everybody's side of the house -- so a rifleman who had
 * just fought his way to the landing would turn round and walk back out of
 * the front door to get behind it. He is now only ever offered cover in the
 * room he is standing in.
 *
 * The cover pass in the future-edit list (docs/MANSION-SIEGE-NIGHT.md PART
 * XIV, "Cover placement pass in the foyer") is what eventually replaces these
 * with real objects; until then they are positions, and the men who use them
 * stand behind them.
 */
const COVER_POINTS = Object.freeze([
  /* The foyer, which is where the fight is. */
  Object.freeze({ x: -3.2, z: 41.4, room: 'foyer', label: 'the wrecked centrepiece' }),
  Object.freeze({ x: 3.2, z: 41.4, room: 'foyer', label: 'the wrecked centrepiece' }),
  Object.freeze({ x: 0, z: 37.4, room: 'foyer', label: 'the front doors' }),
  Object.freeze({ x: -7.6, z: 39.2, room: 'foyer', label: 'the west stair mass' }),
  Object.freeze({ x: 7.6, z: 39.2, room: 'foyer', label: 'the east stair mass' }),
  Object.freeze({ x: -7.9, z: 40.8, room: 'foyer', label: 'the west stair foot' }),
  Object.freeze({ x: 7.9, z: 40.8, room: 'foyer', label: 'the east stair foot' }),
  Object.freeze({ x: -8.2, z: 50.6, room: 'foyer', label: 'the living-room arch' }),
  Object.freeze({ x: 8.2, z: 50.6, room: 'foyer', label: 'the lounge arch' }),
  /* THE LANDING HAS COVER TOO, which is what stops a man who reaches it
   * standing in the open forever because the only cover in the file is
   * downstairs. */
  Object.freeze({ x: -4.6, z: 49.4, room: 'gallery', y: UPPER_Y, label: 'the gallery rail' }),
  Object.freeze({ x: 4.6, z: 49.4, room: 'gallery', y: UPPER_Y, label: 'the gallery rail' }),
  Object.freeze({ x: -9.6, z: 50.4, room: 'gallery', y: UPPER_Y, label: 'the gallery pier' }),
  Object.freeze({ x: 9.6, z: 50.4, room: 'gallery', y: UPPER_Y, label: 'the gallery pier' }),
  /* Outdoors, for the men still walking up. */
  Object.freeze({ x: -4.4, z: 34.8, room: 'steps', label: 'the step parapet' }),
  Object.freeze({ x: 4.4, z: 34.8, room: 'steps', label: 'the step parapet' }),
  Object.freeze({ x: -6.2, z: 26.5, room: 'forecourt', label: 'a burning car' }),
  Object.freeze({ x: 6.2, z: 26.5, room: 'forecourt', label: 'a burnt-out car' }),
  Object.freeze({ x: 0, z: 31.4, room: 'forecourt', label: 'the fountain' }),
  /* The two wings, for the four men of 2B. */
  Object.freeze({ x: 12.4, z: 45.2, room: 'lounge', label: 'the billiard table' }),
  Object.freeze({ x: 11.6, z: 52.4, room: 'lounge', label: 'the bar' }),
  Object.freeze({ x: -12.4, z: 45.2, room: 'living', label: 'a shoved couch' }),
  Object.freeze({ x: -12.0, z: 52.4, room: 'living', label: 'the fireplace' }),
  Object.freeze({ x: -19.6, z: 48.4, room: 'trophy', label: 'the trophy plinth' }),
  Object.freeze({ x: 18.4, z: 44.0, room: 'bay', label: 'a bay pier' }),
]);

/* ================================================================== */
/* WHAT THEY SHOUT                                                      */
/*                                                                       */
/* Twenty-two men and one sentence is worse than silence, so every pool   */
/* below walks with a cursor -- the same `sayPooled` shape THE TAKE uses. */
/* These are barks, not dialogue: no cue names are invented for them and  */
/* nothing here is queued behind anything. When the siege gets its own    */
/* script file the text moves there and this table becomes the keys.      */
/* ================================================================== */
const BARKS = Object.freeze({
  contact: Object.freeze([
    'Contact, the stairs!',
    'Up top, on the balcony!',
    'He is on the landing!',
    'Eyes up, eyes up!',
  ]),
  push: Object.freeze([
    'Move, move, take the room!',
    'Push the middle!',
    'Go, go, go!',
    'Get inside!',
  ]),
  flank: Object.freeze([
    'Going round the east side!',
    'Taking the far door!',
    'I am on the flank!',
  ]),
  suppress: Object.freeze([
    'Keep him behind that rail!',
    'Suppressing! Move up!',
    'Nobody puts a head up!',
  ]),
  reload: Object.freeze([
    'Reloading!',
    'Changing! Cover me!',
    'Out — cover!',
  ]),
  pinned: Object.freeze([
    'I am pinned!',
    'Too much fire!',
    'Get down, get down!',
  ]),
  down: Object.freeze([
    'Man down!',
    'They got him!',
    'He is hit!',
  ]),
});

/* ================================================================== */
/* GEOMETRY                                                             */
/* ================================================================== */

/**
 * Does the segment from `a` to `b` cross any of these boxes?
 *
 * A slab test rather than a `THREE.Raycaster` over the scene graph, for two
 * reasons: twenty-two men each casting into a mansion's worth of meshes every
 * frame is not a budget anybody has, and a raycaster needs a scene, which
 * means the whole line-of-sight rule would only ever be exercisable in a
 * browser. This reads the same collider array the player walks against.
 *
 * `ignore` skips boxes the shooter is standing inside -- a man crouched
 * against the wrecked centrepiece must not be blinded by it.
 */
export function segmentBlocked(a, b, boxes, { skipRadius = 0.45 } = {}) {
  if (!boxes?.length) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-4) return null;
  let nearest = null;
  for (const box of boxes) {
    if (!box?.min || !box?.max) continue;
    /* Standing in it, or shooting from inside it: not an obstruction. */
    if (a.x >= box.min.x - skipRadius && a.x <= box.max.x + skipRadius
      && a.z >= box.min.z - skipRadius && a.z <= box.max.z + skipRadius
      && a.y >= box.min.y - skipRadius && a.y <= box.max.y + skipRadius) continue;
    let t0 = 0;
    let t1 = 1;
    let clear = false;
    for (const axis of ['x', 'y', 'z']) {
      const origin = a[axis];
      const delta = axis === 'x' ? dx : axis === 'y' ? dy : dz;
      const lo = box.min[axis];
      const hi = box.max[axis];
      if (Math.abs(delta) < 1e-6) {
        if (origin < lo || origin > hi) { clear = true; break; }
        continue;
      }
      let near = (lo - origin) / delta;
      let far = (hi - origin) / delta;
      if (near > far) { const swap = near; near = far; far = swap; }
      if (near > t0) t0 = near;
      if (far < t1) t1 = far;
      if (t0 > t1) { clear = true; break; }
    }
    if (clear) continue;
    const distance = t0 * length;
    if (!nearest || distance < nearest.distance) {
      nearest = { distance: Math.max(0, distance), box };
    }
  }
  return nearest;
}

/** Keep a point inside a box-shaped volume. */
function clampToBoundary(position, bounds = COMBAT_BOUNDARY) {
  const x = Math.min(bounds.x1, Math.max(bounds.x0, position.x));
  const y = Math.min(bounds.y1, Math.max(bounds.y0, position.y));
  const z = Math.min(bounds.z1, Math.max(bounds.z0, position.z));
  const moved = x !== position.x || y !== position.y || z !== position.z;
  if (moved) position.set(x, y, z);
  return moved;
}

/** Is this point on the firing step the player is supposed to hold? */
function onLanding(position) {
  return position.x >= DEFENCE_POST.x0 && position.x <= DEFENCE_POST.x1
    && position.z >= DEFENCE_POST.z0 && position.z <= DEFENCE_POST.z1
    && position.y > GROUND_Y + 2;
}

/** The one place the player is never allowed to meet a spawning attacker. */
function insidePlayerView(x, z) {
  return x >= FOYER_VOID.x0 - 1 && x <= FOYER_VOID.x1 + 1
    && z >= FOYER_VOID.z0 && z <= FOYER_VOID.z1 + 6;
}

/* ================================================================== */
/* THE FACE GUARD                                                       */
/*                                                                       */
/* `makePerson`'s `face` goes into a THREE.TextureLoader, which builds an */
/* <img>, so a figure with a photo on it cannot be constructed without a  */
/* DOM. The cartel have no photographs, but the check lives here anyway   */
/* because the muzzle-flash light, the impact decals and the tracer pool  */
/* have the same shape of problem: a module that owns where people stand  */
/* must still run under `node --test`. Testing `createElementNS` rather   */
/* than `typeof document` is deliberate -- the suite installs a document  */
/* stub, and a bare typeof check sends everything into a loader that then */
/* dies on the first call. Same reasoning as src/mansion/cast.js.         */
/* ================================================================== */
const CAN_PAINT = typeof document !== 'undefined'
  && typeof document.createElementNS === 'function';

/* ================================================================== */
/* THE POOL                                                             */
/* ================================================================== */

/**
 * Build the pool the wave director spawns into.
 *
 * @param {object} o
 *   scene         where the pool's root is added, once.
 *   damage        the `MansionDamageState`. The whole pool is one `hostiles`
 *                 group, so a house that goes to `damaged` puts the attackers
 *                 away without this module being told twice.
 *   matrix        the shared `FactionMatrix`.
 *   onDown(id)    called exactly once per attacker, when he is killed or
 *                 incapacitated. This is how `WaveDirector.noteDown` learns.
 *   registerLight(light)  the scene's light budget. One muzzle-flash light is
 *                 offered for the whole pool; a scene that says no simply
 *                 gets no flash.
 *
 * Two more the scene may hand over here OR per frame in `update`'s context,
 * whichever it finds easier to wire. Both are optional and the pool is
 * complete without either -- silent, and leaving no marks:
 *
 *   audio         an `AudioEngine`. Every shot, every reload and every empty
 *                 magazine goes through `playWeaponCue`, so the cartel's guns
 *                 sound like the guns on the armory wall because they ARE the
 *                 guns on the armory wall.
 *   onImpact(hit) `{ point, normal, material, actor }` -- where a round
 *                 stopped. The scene owns the decal pools (`world/bullets.js`
 *                 needs a canvas and therefore a DOM); this module reports
 *                 the hit and never punches the hole itself.
 */
export function createAttackerPool({
  scene, damage, matrix, onDown = null, registerLight = null,
  audio = null, onImpact = null,
} = {}) {
  const factionMatrix = matrix ?? DEFAULT_FACTION_MATRIX;
  const root = new THREE.Group();
  root.name = 'siege.attackers';
  scene?.add?.(root);

  /* Hostiles are a damage-state layer, not a thing the mission remembers to
   * hide. `under_attack` lights `hostiles`; `damaged` and `post_battle` do
   * not, so the fight ending puts them away by itself. */
  damage?.group?.('siege.attackers', { object: root, layers: ['hostiles'] });

  /* One tracer pool for every round the cartel puts up. 6 m minimum streak is
   * the raid's number and far too long for a foyer; 2.2 m reads as a round
   * indoors and still carries across the forecourt. */
  const tracers = new TracerPool(root, 180, { minLength: 2.2 });

  /* One flash for the whole pool, moved to whoever fired. Twenty-two lights
   * in a house lit by two is not a look, it is a frame-rate bug. */
  const flash = new THREE.PointLight(0xffce8a, 0, 7.5, 2.0);
  flash.name = 'siege.attackers.muzzle';
  flash.visible = false;
  /* The scene owns the light budget. Offering it and taking `false` for an
   * answer is the only way a night-lighting pass can hold a ceiling without
   * this module having to know what the ceiling is. */
  const lightAllowed = registerLight ? registerLight(flash) !== false : true;
  if (lightAllowed) root.add(flash);
  let flashTimer = 0;

  /**
   * The house, as a graph he can be told to walk.
   *
   * One per pool, because the occupancy on it IS playthrough state: which
   * gallery anchor is taken decides where the next man to reach the landing
   * is sent, and it has to snapshot and restore with everything else.
   */
  const navigator = new SiegeNavigator();

  /** id -> entry. Ids are unique for a playthrough, so this is also the
   * checkpoint's index: restoring a wave re-spawns the same men. */
  const entries = new Map();
  /** root Object3D -> entry, so a hit does not scan twenty-seven people. */
  const byRoot = new Map();
  /** Ids `onDown` has already been called for. Nobody is reported twice. */
  const reported = new Set();
  const barkCursor = new Map();
  /** Everything the pool has done that the scene may want to react to. */
  const breaches = [];

  /* Scratch vectors. Allocating inside a per-frame loop over twenty-two men
   * is how a fight becomes a garbage-collection stutter. */
  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _step = new THREE.Vector3();

  let context = { audio: null, onBark: null, onBreach: null, onPlayerHit: null };

  function bark(entry, key) {
    const lines = BARKS[key];
    if (!lines?.length) return null;
    const index = (barkCursor.get(key) ?? 0) % lines.length;
    barkCursor.set(key, index + 1);
    const line = lines[index];
    entry.lastBark = line;
    context.onBark?.({ id: entry.id, key, line, role: entry.role.id });
    return line;
  }

  /* ---------------------------------------------------------------- */
  /* Bodies                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Tag every mesh on a figure with the zone it belongs to, so a round that
   * lands on the head is worth a head's damage.
   *
   * The tag goes on the PART groups rather than on each mesh: `registerHit`
   * walks up from whatever the raycast returned, so tagging four groups
   * covers sixty meshes and survives the figure being redressed.
   */
  function tagHitZones(figure) {
    figure.parts.head.userData.hitZone = 'head';
    figure.parts.body.userData.hitZone = 'chest';
    for (const limb of [
      figure.parts.armL, figure.parts.armR, figure.parts.legL, figure.parts.legR,
    ]) {
      limb.userData.hitZone = 'limb';
    }
  }

  function dressCartelRole(figure, roleId) {
    const kit = CARTEL_ROLE_KITS[roleId];
    if (!kit) throw new Error(`No cartel outfit kit for ${roleId}`);
    for (let index = 0; index < kit.pieces.length; index++) {
      const piece = kit.pieces[index];
      const geometry = piece.shape === 'round'
        ? new THREE.CylinderGeometry(piece.radius, piece.radius, piece.height, 8)
        : new THREE.BoxGeometry(...piece.size);
      const mesh = new THREE.Mesh(geometry, CARTEL_KIT_MATERIALS[piece.material]);
      mesh.name = `cartel.outfit.${roleId}.${index}`;
      mesh.position.set(...piece.pos);
      if (piece.rotation) mesh.rotation.set(...piece.rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.cartelOutfitPiece = true;
      mesh.userData.cartelRole = roleId;
      mesh.userData.cartelKit = kit.label;
      figure.parts.body.add(mesh);
    }
  }

  function buildFigure(order, index) {
    const look = CARTEL_LOOKS[index % CARTEL_LOOKS.length];
    const model = { ...look, ...(ROLE_DRESS[order.role.id] ?? {}) };
    const figure = new HeistFigure({
      name: `cartel-${order.id}`,
      x: 0, z: 0, yaw: 0,
      tier: index < 8 ? 'hero' : 'ambient',
      model,
    });
    tagHitZones(figure);
    dressCartelRole(figure, order.role.id);

    /* A real gun off the shared catalog, in his hand, pointing where he is
     * pointing. Same convention every other scene uses: the model runs down
     * local -Z, so rotating -PI/2 about x puts the muzzle where the forearm
     * is aiming. */
    const plan = ROLE_PLAN[order.role.id];
    let gun = null;
    try {
      gun = buildWeaponModel(plan.weapon);
    } catch { gun = null; }
    if (gun) {
      mountSiegeWeapon(figure, plan.weapon, gun, { name: `cartel-${order.id}-weapon` });
    }
    /* Braced two-handed, with the support hand solved onto this gun rather
     * than copied from a silhouette that did not know its dimensions. */
    if (gun) braceSiegeWeapon(figure, gun);
    return { figure, gun };
  }

  /* ---------------------------------------------------------------- */
  /* Targets                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Turn whatever the scene handed us into something shootable, or null.
   *
   * THE ONE HARD REFUSAL IN THIS FILE. `neverTargeted` is checked BEFORE the
   * faction matrix, not instead of it: Snow is crew and the matrix already
   * refuses crew-on-crew and crew-from-cartel damage to a `core` actor, but
   * the standing constraint is that he never enters hostile targeting at all.
   * A flag the ensemble sets on his own root, read here, means the answer is
   * "he is not in the list" rather than "the list rejected him", and the two
   * are not the same guarantee.
   */
  function asTarget(candidate, { isPlayer = false } = {}) {
    if (!candidate) return null;
    const node = candidate.root ?? candidate.group ?? candidate;
    if (candidate.neverTargeted === true || node?.userData?.neverTargeted === true) return null;
    const actor = candidate.actor
      ?? candidate.combatActor
      ?? node?.userData?.combatActor
      ?? null;
    if (actor?.incapacitated) return null;
    const position = candidate.position ?? node?.position ?? null;
    if (!position || !Number.isFinite(position.x)) return null;
    if (node?.visible === false) return null;
    /* No actor means the scene has not given us anything to damage -- a
     * player object with only a position, for instance. He is still a man to
     * shoot at; the round simply resolves against nothing. */
    const faction = actor?.faction ?? FACTIONS.CREW;
    if (!factionMatrix.canTarget(FACTIONS.CARTEL, faction)) return null;
    return {
      actor, position, isPlayer, node,
      suppression: candidate.suppression ?? null,
      eye: isPlayer ? 0 : 1.5,
    };
  }

  function gatherTargets(ctx) {
    const list = [];
    const player = asTarget(ctx.player, { isPlayer: true });
    if (player) list.push(player);
    const friendly = typeof ctx.alive === 'function' ? ctx.alive() : ctx.alive;
    if (Array.isArray(friendly)) {
      for (const candidate of friendly) {
        const target = asTarget(candidate);
        if (target) list.push(target);
      }
    }
    return list;
  }

  /* ---------------------------------------------------------------- */
  /* Firing                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * One round, from one attacker, at one target.
   *
   * Everything about whether it lands is decided by `resolveBallisticHits`.
   * What this function decides is what the round MEETS: the man, the wall in
   * front of him, or the air beside his ear. That is the only honest split --
   * accuracy is the shooter's problem, damage is the core's.
   */
  function fireRound(entry, target, ctx) {
    const shot = entry.weapon.fire();
    if (!shot.fired) {
      if (shot.reason === 'empty' && entry.weapon.beginReload()) {
        bark(entry, 'reload');
        playWeaponCue(ctx.audio, entry.plan.weapon, 'reload.out', { position: entry.root.position, volume: 0.4 });
      }
      return null;
    }

    _from.copy(entry.root.position);
    _from.y += entry.muzzleHeight;
    _to.copy(target.position);
    _to.y += target.eye;

    const distance = _from.distanceTo(_to);
    const blocker = segmentBlocked(_from, _to, ctx.colliders);

    /* Accuracy. Falls off with range past his role's standoff, falls off
     * again while he is moving, and falls off hard while he is suppressed --
     * which is what makes shooting back at a suppressor worth doing. */
    const overRange = Math.max(0, distance - entry.plan.standoff) / 30;
    const moving = entry.moving ? 0.55 : 1;
    const shaken = 1 - entry.suppression.value * 0.7;
    const leadership = entry.leadershipBonus;
    const chance = Math.max(0.02, entry.plan.accuracy * moving * shaken * leadership
      * (1 - Math.min(0.75, overRange)));
    const onTarget = !blocker && Math.random() < chance;

    /* The hit list, in the shape the shared resolver wants: nearest first,
     * one entry with an actor on it if the round is going to reach him. */
    const hits = [];
    if (blocker) {
      hits.push({ distance: blocker.distance, material: 'concrete', thickness: 0.4 });
    } else if (onTarget) {
      hits.push({ distance, actor: target.actor ?? null, material: 'flesh' });
    } else {
      hits.push({ distance, material: 'plaster', thickness: 0.5 });
    }

    const resolved = resolveBallisticHits(hits, {
      attacker: entry.actor,
      damage: shot.damage * (target.isPlayer ? ctx.playerDamageScale : 1),
      penetration: shot.penetration,
      matrix: factionMatrix,
      playerShot: false,
    });

    /* Tracer, flash and noise happen whatever the round did. */
    const catalogue = WEAPON_CATALOG[entry.plan.weapon];
    entry.roundsFired++;
    if ((entry.roundsFired % (catalogue?.tracer?.every ?? 3)) === 0) {
      tracers.fire({
        from: _from,
        to: _to,
        speed: catalogue?.tracer?.speed ?? 700,
        colour: catalogue?.tracer?.colour ?? 0xfff0a0,
        width: (catalogue?.tracer?.width ?? 0.012) * 2.4,
      });
    }
    if (lightAllowed) {
      flash.position.copy(_from);
      flash.intensity = entry.plan.weapon === 'saw' ? 5 : 3.4;
      flash.visible = true;
      flashTimer = 0.045;
    }
    playWeaponCue(ctx.audio, entry.plan.weapon, 'fire', {
      position: _from, volume: 0.6, ref: 3, maxDist: 60,
    });

    /* The near miss. A round that stopped on the rail still went past the
     * player's head, and that is the entire reason the landing is a fight
     * rather than a balcony. */
    const missDistance = blocker ? 0.9 : onTarget ? 0 : 0.45 + Math.random() * 1.6;
    if (target.isPlayer && missDistance > 0) {
      const model = target.suppression ?? ctx.player?.suppression ?? null;
      model?.noteNearMiss?.(missDistance, Math.max(0.25, 1 - distance / 50));
    }

    const result = resolved.find((hit) => hit.result)?.result ?? null;
    if (result?.applied && target.isPlayer) {
      ctx.onPlayerHit?.({ damage: result.damage, fatal: result.fatal === true, from: entry.id });
    }
    if (result?.fatal && !target.isPlayer && target.node?.userData?.onDown) {
      target.node.userData.onDown(result);
    }

    /* Where it stopped, for whoever owns the decals. The point is on the
     * line at the distance the resolver stopped at, and the normal is the
     * way the round came -- which is what a hole in a wall wants. */
    if (ctx.onImpact) {
      const stopped = resolved[resolved.length - 1];
      const reach = blocker ? blocker.distance : distance;
      const point = _to.clone().sub(_from).normalize();
      ctx.onImpact({
        point: _from.clone().addScaledVector(point, Math.max(0.1, reach)),
        normal: point.clone().negate(),
        material: stopped?.material ?? 'concrete',
        actor: stopped?.actor ?? null,
      });
    }

    entry.lastShot = { distance, blocked: !!blocker, onTarget, damage: result?.damage ?? 0 };
    return entry.lastShot;
  }

  /* ---------------------------------------------------------------- */
  /* Behaviour                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * What kind of leg this waypoint is, for the scene, the HUD and the tests.
   *
   * Derived from the anchor's own room rather than declared per route, so a
   * waypoint cannot claim to be a climb while standing on the marble.
   */
  function kindForAnchor(anchor) {
    if (anchor.room === 'stair_west' || anchor.room === 'stair_east') return 'climb';
    if (anchor.room === 'gallery' || anchor.room === 'balcony') return 'climb';
    if (anchor.zone === 'overwatch') return 'hold';
    if (anchor.room === 'forecourt' || anchor.room === 'steps') return 'approach';
    if (anchor.zone === 'flank_east' || anchor.zone === 'flank_west') return 'entry';
    return 'push';
  }

  /**
   * The waypoint list a freshly spawned man walks.
   *
   * ## THIS IS THE NAV GRAPH, NOT A HAND-WRITTEN ROUTE
   *
   * It was a hand-written route, and three of its legs went through walls.
   * `./nav.js` authors the anchor set, `AuthoredNavigationGraph` does the BFS
   * and holds the occupancy, and this function does the two things that are
   * genuinely this module's: pick the destination zone from the man's tactic,
   * and pick the flight from his route and his index.
   *
   * ## THE LANE, AND WHY IT IS NOT DECORATION
   *
   * The first version handed every man on a route the identical waypoint
   * list, and the probe showed exactly what the brief warned about: eight of
   * the fourteen attackers in wave two ended the fight standing inside each
   * other at (6.8, 6.0, 47.8), because that is where the east flight's last
   * waypoint is. A queue, and a queue on one tread.
   *
   * Two things fix it and they fix different halves. `occupy()` reserves the
   * DESTINATION, so no two men stop in the same place. The lane spreads the
   * TRANSIT, perpendicular to each leg, by an amount the anchor itself
   * declares -- 0.45 m at a 3.2 m front door, 1.2 m on a 32 m gallery.
   */
  function buildPath(order, plan, staging, index) {
    const side = flightSideFor(plan, index);
    const anchorId = staging.entry;
    if (!anchorById(anchorId)) {
      throw new Error(`Staging zone "${staging.id}" names unknown nav anchor "${anchorId}"`);
    }
    navigator.enter(order.id, anchorId, side);
    const zones = destinationZonesFor(plan, staging);
    const planned = navigator.plan(order.id, zones, { role: side });
    /* Five lanes, -1..1, off his own index. Deterministic, so a checkpoint
     * restore puts the same man back on the same line. */
    const laneT = ((index % 5) - 2) / 2;
    const from = { x: staging.x, z: staging.z, y: null };
    const anchors = planned ? [anchorId, ...planned.path] : [anchorId];
    const path = laneWaypoints(anchors, { from, laneT, kindFor: kindForAnchor });
    /* `laneWaypoints` keeps the anchor he is standing on so the lane maths
     * has something to be perpendicular to; he does not walk to his own
     * feet. */
    return {
      path: path.slice(1),
      destination: planned?.destination ?? anchorId,
      side,
      /* True when the graph had no free anchor left and he was sent to one
       * somebody else is already holding. Never true in the mission as it is
       * staged, and a test says so -- it is here as the diagnosis, so a
       * future group that overflows the landing reports itself. */
      shared: planned?.shared === true,
    };
  }

  /**
   * The cover point this man would rather be at than open floor.
   *
   * FILTERED BY THE ROOM HE IS IN, which is the fix rather than a detail: the
   * old filter was his role's side of the house, and "centre" cover was
   * offered to everybody, so a rifleman who had fought his way onto the
   * gallery would be offered the fountain and walk back out of the front door
   * to get behind it.
   */
  function pickCover(entry) {
    const here = roomAt(entry.root.position);
    if (!here) return null;
    const options = COVER_POINTS.filter((point) => point.room === here);
    if (!options.length) return null;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * One attacker, one think.
   *
   * Ticked at `THINK_HZ` rather than every frame -- twenty-two men each doing
   * a line-of-sight test sixty times a second is four figures of work for a
   * decision nobody can perceive changing that fast. Movement is smooth; the
   * decisions behind it are not, and that is the correct way round.
   */
  /**
   * Aim the goal at a place on the floor.
   *
   * THE Y IS NEVER TAKEN FROM THE TARGET. Copying the player's position into
   * a goal is how a rifleman on the foyer floor levitates to the gallery rail
   * because that is where the man he is shooting at happens to be standing.
   * Height is authored -- `entry.floorY`, set by the climb waypoints -- and
   * the goal only ever carries a place on the ground.
   */
  function aimGoalAt(entry, x, z) {
    entry.goal.set(x, entry.root.position.y, z);
  }

  function think(entry, ctx, targets) {
    if (entry.actor.incapacitated) return;

    /* Who. Nearest reachable target, with the player preferred at equal
     * distance because the mission is about him -- but only preferred, so a
     * Squatch standing in front of an SMG is still shot at. */
    let best = null;
    let bestScore = Infinity;
    for (const target of targets) {
      const dx = target.position.x - entry.root.position.x;
      const dz = target.position.z - entry.root.position.z;
      const dy = target.position.y - entry.root.position.y;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > entry.role.range + 14) continue;
      const score = distance * (target.isPlayer ? 0.82 : 1);
      if (score < bestScore) { bestScore = score; best = { target, distance }; }
    }
    entry.target = best?.target ?? null;
    entry.targetDistance = best?.distance ?? Infinity;

    /* Awareness. He does not open up the instant he is placed -- he is
     * already fighting, so it ramps fast, but a man walking round the back of
     * the house does not shoot through it on his way. */
    if (entry.target) {
      entry.awareness = Math.min(1, entry.awareness + 0.35);
    } else {
      entry.awareness = Math.max(0, entry.awareness - 0.12);
    }

    /* Where. Path first, then his role's fight. */
    if (entry.path.length) {
      const next = entry.path[0];
      aimGoalAt(entry, next.x, next.z);
      return;
    }

    entry.holding = true;
    if (!entry.target) {
      aimGoalAt(entry, entry.root.position.x, entry.root.position.z);
      return;
    }

    /* THE ONE CASE THAT MUST NOT BE A STRAIGHT LINE.
     *
     * Every tactic below walks at the man it is shooting at. That is right in
     * a room and wrong through a floor: the player is on the balcony six
     * metres up, and a rifleman on the marble who walks at him walks into the
     * spandrel under the flight and stands there grinding for the rest of the
     * wave. When the man he wants is more than two metres above or below him,
     * he asks the graph for a route instead of taking a bearing.
     *
     * `sinceReplan` is what stops it thrashing: one request every four
     * seconds is a man deciding to take the stairs, not a man reconsidering
     * sixty times a second. */
    const climbGap = entry.target.position.y - entry.root.position.y;
    if (entry.plan.climbs && Math.abs(climbGap) > 2 && entry.sinceReplan > 4) {
      entry.sinceReplan = 0;
      const here = navigator.nearestAnchor(entry.root.position, entry.anchor);
      navigator.enter(entry.id, here, entry.side);
      const again = navigator.plan(
        entry.id, climbGap > 0 ? DESTINATION_ZONES.default : DESTINATION_ZONES.direct,
        { role: entry.side },
      );
      /* A RE-PLAN THAT ARRIVES AT THE SAME PLACE IS NOT A RE-PLAN. With the
       * landing full -- twenty-four men alive at once, which the probe can
       * do and the mission cannot -- the graph honestly answers "the foyer
       * floor" every four seconds, and a man who accepts that answer walks
       * the same eight metres twenty-one times. He only takes a new route
       * if it goes somewhere new. */
      if (again?.path.length && again.destination !== entry.destination) {
        entry.path = laneWaypoints([here, ...again.path], {
          from: entry.root.position, laneT: entry.laneT, kindFor: kindForAnchor,
        }).slice(1);
        entry.destination = again.destination;
        entry.replans++;
        const next = entry.path[0];
        if (next) { aimGoalAt(entry, next.x, next.z); return; }
      }
    }

    /* AND IF THERE IS NO ROUTE, HE SHOOTS FROM HERE.
     *
     * The probe caught the two men in the cellar corridor walking SOUTH out
     * of the basement, through its wall, toward a Prospect nine metres over
     * their heads on the balcony -- because every tactic below ends in "walk
     * at the man you are shooting at", and a bearing is not a route. The
     * corridor is a disconnected component of the graph on purpose: they can
     * see him at forty metres and they cannot get to him, and a man who
     * cannot get to you stands and fires rather than grinding on a wall.
     *
     * It catches the general case too: anybody left on the foyer floor when
     * the landing is full now shoots up through the void instead of walking
     * into the masonry under the flight. */
    if (Math.abs(climbGap) > 2 && !entry.path.length) {
      aimGoalAt(entry, entry.root.position.x, entry.root.position.z);
      return;
    }

    const tactic = entry.plan.tactic;
    const wants = entry.plan.standoff;
    const distance = entry.targetDistance;
    const hold = () => aimGoalAt(entry, entry.root.position.x, entry.root.position.z);
    const at = (target) => aimGoalAt(entry, target.position.x, target.position.z);

    if (tactic === 'rush' || tactic === 'close') {
      /* Straight at him. No cover, no repositioning, no patience. */
      if (distance > wants) at(entry.target); else hold();
      return;
    }
    if (tactic === 'pin' || tactic === 'support') {
      /* Set, and staying set. He only moves when his own suppression has
       * been high for a while, which is a man being driven off a position
       * rather than a man patrolling one. */
      hold();
      if (entry.plan.reposition > 0 && entry.sinceMove > entry.plan.reposition
        && entry.suppression.value > 0.55) {
        const cover = pickCover(entry);
        if (cover) {
          aimGoalAt(entry, cover.x, cover.z);
          entry.sinceMove = 0;
          entry.coverLabel = cover.label;
        }
      }
      return;
    }
    if (tactic === 'soak' || tactic === 'direct') {
      /* Neither of these two chases. The armoured man walks to his standoff
       * and stops; the leader holds the doorway he came through. */
      if (distance > wants + 4) at(entry.target); else hold();
      return;
    }

    /* 'advance' and 'flank': cover to cover, on the clock. */
    if (entry.sinceMove > entry.plan.reposition && Math.random() < entry.plan.cover) {
      const cover = pickCover(entry);
      if (cover) {
        aimGoalAt(entry, cover.x, cover.z);
        entry.sinceMove = 0;
        entry.coverLabel = cover.label;
        if (tactic === 'flank') bark(entry, 'flank');
        else bark(entry, 'push');
        return;
      }
    }
    if (distance > wants) at(entry.target); else hold();
  }

  /** Move, turn, fire, and stay in the house. */
  function act(entry, dt, ctx) {
    if (entry.actor.incapacitated) return;
    const position = entry.root.position;

    /* --- move --- */
    _step.copy(entry.goal).sub(position);
    _step.y = 0;
    const planar = _step.length();
    const speed = entry.plan.speed * (1 - entry.suppression.value * 0.45);
    entry.moving = planar > 0.35;
    if (entry.moving) {
      _step.multiplyScalar(Math.min(1, (speed * dt) / planar));
      position.add(_step);
    }
    /* Height is authored, not simulated.
     *
     * `floorY` null means "follow the ground", which is what carries a man up
     * the front steps without a ramp being written for him. A climb waypoint
     * carries its own y and sets `floorY` when it is reached, which is what
     * keeps a man who has taken the east flight standing ON the gallery
     * instead of sinking back to the foyer floor the next frame. */
    const wantedY = entry.path[0]?.y
      ?? entry.floorY
      ?? groundHeightAt(position.x, position.z);
    position.y += (wantedY - position.y) * Math.min(1, dt * 3.5);

    /* --- the boundary --- *
     * An attacker who walks into the hedge maze strands the wave-cleared
     * check forever, so he is pulled back rather than trusted. */
    if (clampToBoundary(position)) entry.pulledBack++;

    /* --- waypoints --- */
    const next = entry.path[0];
    if (next) {
      /* TIGHTER ON THE LAST ONE, AND THE DOOR IS WHY.
       *
       * 1.1 m is a good arrival radius for a transit waypoint -- it keeps a
       * man walking instead of creeping the last handspan onto a mark. It is
       * a terrible one for the place he STOPS: the probe found the wave-two
       * suppressor holding at z 35.7, which is 1.1 m short of the anchor
       * inside the front door and therefore out on the portico, shooting at
       * the landing through two storeys of entrance glazing. Half a metre on
       * the final waypoint puts him in the hall he was sent to. */
      const slack = entry.path.length > 1 ? 1.1 : 0.5;
      const reached = Math.hypot(next.x - position.x, next.z - position.z) < slack;
      if (reached) {
        entry.path.shift();
        entry.sinceMove = 0;
        entry.anchor = next.anchor ?? entry.anchor;
        /* HEIGHT IS AUTHORED, AND IT IS AUTHORED BOTH WAYS.
         *
         * A climb waypoint carries its own y and pins him to that floor. A
         * ground-level waypoint carries null and has to UNPIN him again --
         * without that line a man who reached the gallery and was then sent
         * back down to the foyer floor kept `floorY` at 6.0 and walked the
         * length of the entrance hall in mid-air. */
        entry.floorY = next.y == null ? null : next.y;
        /* Coming through glass rather than through a door is an event the
         * scene's glass owner wants; it is reported, never performed here --
         * `glass.js` is somebody else's file and a pane belongs to it.
         *
         * WHICH pane comes off the nav graph's own opening table rather than
         * off a guess about the geometry: the guess once reported the rear
         * service DOOR as a broken window, and the glass owner would have
         * shattered a door. `breaks` is set on a waypoint only when the leg
         * that reached it crossed an opening declared `glass: true`. */
        if (next.breaks && !entry.breached) {
          entry.breached = true;
          const breach = {
            id: entry.id,
            staging: entry.staging.id,
            opening: next.breaks.id,
            x: next.breaks.x,
            y: position.y,
            z: next.breaks.z,
          };
          breaches.push(breach);
          ctx.onBreach?.(breach);
        }
      }
    }

    /* --- turn --- */
    const facing = entry.target?.position ?? entry.goal;
    const yaw = Math.atan2(facing.x - position.x, facing.z - position.z);
    let delta = yaw - entry.root.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    entry.root.rotation.y += delta * Math.min(1, dt * 6);

    /* --- reload, always --- */
    if (entry.weapon.update(dt)) {
      playWeaponCue(ctx.audio, entry.plan.weapon, 'reload.in', { position, volume: 0.35 });
    }
    entry.suppression.update(dt);
    entry.sinceMove += dt;
    entry.sinceReplan += dt;

    /* --- stuck --- *
     * A man on a route who is not moving is either shooting from where he is
     * or grinding against something. `SquadDirector.noteBlocked` is the
     * heist's own 2.5 s patience and its own offscreen-only rule, reused
     * rather than re-timed here; it hands back an anchor outside the house
     * for the one case a route cannot recover from itself. */
    if (entry.path.length && !entry.moving) {
      const recovery = navigator.blocked(entry.id, dt);
      if (recovery.recover && recovery.anchor) {
        const point = laneWaypoints([entry.anchor ?? recovery.anchor, recovery.anchor], {
          from: position, laneT: entry.laneT, kindFor: kindForAnchor,
        }).slice(1);
        if (point.length) { entry.path = point; entry.recovered++; }
      }
    }

    /* --- fire --- */
    if (!entry.target || entry.awareness < 0.7) return;
    if (entry.suppression.value > 0.82) {
      if (!entry.saidPinned) { bark(entry, 'pinned'); entry.saidPinned = true; }
      return;
    }
    entry.saidPinned = false;
    const inRange = entry.targetDistance <= entry.role.range + 6;
    const pinning = entry.plan.pinsLanding && onLanding(entry.target.position);
    if (!inRange && !pinning) return;
    /* Aggression buys trigger time: 1.0 fires as fast as the burst allows,
     * 0.3 waits between bursts. Straight off the role table in waves.js. */
    const canFire = entry.weapon.reloading <= 0 && entry.weapon.cooldown <= 0;
    if (entry.burst.update(dt, canFire && Math.random() < 0.25 + entry.role.aggression * 0.75)) {
      if (!entry.saidContact) { bark(entry, entry.plan.pinsLanding ? 'suppress' : 'contact'); entry.saidContact = true; }
      fireRound(entry, entry.target, ctx);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Down                                                              */
  /* ---------------------------------------------------------------- */

  /**
   * He is out of the fight.
   *
   * `reported` is a Set rather than a flag on the entry so that a checkpoint
   * restore cannot produce a second `onDown` for a man who was already down
   * when the checkpoint was taken -- the wave director counts these, and a
   * double count clears a wave that still has four men in it.
   */
  function markDown(entry, { silent = false } = {}) {
    /* HE FALLS ON THE FLOOR HE IS STANDING ON.
     *
     * `HeistFigure.fallen()` settles the posed body by measuring its lowest
     * WORLD point against `figure.baseY` -- which was the staging zone's
     * floor when he was built. A man who came in off the forecourt at y 0 and
     * died on the gallery at y 6 would settle six metres below the landing,
     * which is a body in the foyer ceiling. One line, and it has to be here
     * rather than at spawn because the whole point is that he moved. */
    entry.figure.baseY = entry.root.position.y;
    entry.figure.fallen({ roll: Math.random() > 0.5 ? 0.62 : -0.58 });
    /* The catalog model is parented to the forearm, so leaving it visible
     * turns a fallen pose into a rifle welded through the wrist. The corpse
     * owns no active weapon; pooled respawn explicitly returns it below. */
    if (entry.gun) entry.gun.visible = false;
    entry.root.userData.down = true;
    entry.target = null;
    entry.path.length = 0;
    /* HIS PLACE ON THE LANDING GOES BACK IN THE POOL. Without this the man
     * behind him is told the gallery is full and stops on the flight, and by
     * the end of wave two the whole landing is reserved by corpses. */
    navigator.release(entry.id);
    if (reported.has(entry.id)) return false;
    reported.add(entry.id);
    if (!silent) {
      bark(entry, 'down');
      onDown?.(entry.id);
    }
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* The public pool                                                   */
  /* ---------------------------------------------------------------- */

  /** The `CombatActor` that owns a hit mesh, wherever it sits. */
  function actorFor(object) {
    let node = object;
    while (node) {
      if (node.userData?.combatActor) return node;
      node = node.parent;
    }
    return null;
  }

  function zoneFor(object) {
    let node = object;
    while (node) {
      if (node.userData?.hitZone) return node.userData.hitZone;
      node = node.parent;
    }
    return 'chest';
  }

  function entryForRoot(node) {
    return byRoot.get(node) ?? null;
  }

  /**
   * Accept both shapes of order.
   *
   * `WaveDirector` hands over a resolved order with `role` and `staging` as
   * objects; `ENCOUNTERS` in the same file names them as STRINGS, because the
   * corridor and the foyer are authored by hand rather than released by a
   * director. Resolving here rather than making the scene do it means the two
   * men in the cellar and the twenty-two on the stairs arrive down one path.
   */
  function resolveOrder(order) {
    if (!order?.id) throw new Error('An attacker spawn order needs an id');
    const role = typeof order.role === 'string' ? ROLES[order.role] : order.role;
    if (!role?.id) throw new Error(`Spawn order ${order.id} names an unknown role`);
    const staging = typeof order.staging === 'string' ? STAGING[order.staging] : order.staging;
    if (!staging?.id) throw new Error(`Spawn order ${order.id} names an unknown staging zone`);
    return { ...order, role, staging };
  }

  function spawn(rawOrder, { silent = false } = {}) {
    const order = resolveOrder(rawOrder);
    const plan = ROLE_PLAN[order.role.id];
    if (!plan) throw new Error(`No behaviour plan for attacker role "${order.role.id}"`);

    let entry = entries.get(order.id);
    if (!entry) {
      const { figure, gun } = buildFigure(order, entries.size);
      entry = {
        id: order.id,
        order,
        role: order.role,
        plan,
        staging: order.staging,
        figure,
        gun,
        root: figure.root,
        actor: new CombatActor({
          id: order.id,
          faction: FACTIONS.CARTEL,
          maxHealth: order.role.health,
          armor: order.role.armor,
        }),
        suppression: new SuppressionModel({ decay: 0.5 }),
        weapon: null,
        burst: null,
        goal: new THREE.Vector3(),
        path: [],
        target: null,
        targetDistance: Infinity,
        awareness: 0,
        moving: false,
        holding: false,
        sinceMove: 0,
        sinceThink: Math.random() * 0.12,
        sinceReplan: 0,
        replans: 0,
        recovered: 0,
        /** The nav anchor he last reached, and the flight he was given. */
        anchor: null,
        side: 'east',
        laneT: 0,
        destination: null,
        sharedDestination: false,
        roundsFired: 0,
        pulledBack: 0,
        breached: false,
        saidContact: false,
        saidPinned: false,
        coverLabel: null,
        lastBark: null,
        lastShot: null,
        leadershipBonus: 1,
        muzzleHeight: 1.35,
        /** null means "follow the ground"; a number pins him to a floor. */
        floorY: null,
        index: entries.size,
        active: false,
      };
      entry.root.userData.combatActor = entry.actor;
      entry.root.userData.attackerId = order.id;
      entry.root.userData.faction = FACTIONS.CARTEL;
      /* Anybody who kills this man -- a Squatch on the rail, a guard on the
       * landing, a scripted event -- can say so here. Without it, an attacker
       * shot by somebody other than the player would go quiet with his actor
       * incapacitated and his BODY STILL STANDING, and the wave director
       * would never be told he was gone. `update` sweeps for the same case,
       * so this is the fast path rather than the only one. */
      entry.root.userData.onDown = () => markDown(entry);
      entries.set(order.id, entry);
      byRoot.set(entry.root, entry);
      root.add(entry.root);
    }

    /* A fresh life. Everything a previous one left behind is cleared, which
     * is what makes `restore` able to re-use the same body. */
    entry.order = order;
    entry.staging = order.staging;
    entry.role = order.role;
    entry.plan = plan;
    entry.actor.health = entry.actor.maxHealth;
    entry.actor.armor = Math.max(0, order.role.armor);
    entry.actor.injury = 'none';
    entry.actor.incapacitated = false;
    entry.actor.suppression = 0;
    entry.actor.role = order.role.id;
    entry.actor.anchor = order.staging.entry;
    entry.suppression.value = 0;
    /* The gun is the shared controller with the catalog's own numbers on it.
     * Nothing about it is a siege weapon. */
    const catalogue = WEAPON_CATALOG[plan.weapon];
    entry.weapon = new WeaponController({
      magazineSize: catalogue.capacity,
      reserveMagazines: Math.max(1, Math.round(catalogue.reserve / catalogue.capacity)),
      roundsPerSecond: catalogue.rps,
      reloadSeconds: catalogue.reloadOut + catalogue.reloadIn,
      recoilPerShot: catalogue.recoil,
      recoilRecovery: 1.6,
      hipSpread: catalogue.spread,
      aimedSpread: catalogue.spread * 0.4,
      damage: catalogue.damage,
      penetration: catalogue.penetration,
    });
    entry.burst = new BurstController({ ...plan.burst });
    const routed = buildPath(order, plan, order.staging, entry.index);
    entry.path = routed.path;
    entry.destination = routed.destination;
    entry.side = routed.side;
    entry.sharedDestination = routed.shared;
    entry.anchor = order.staging.entry;
    entry.laneT = ((entry.index % 5) - 2) / 2;
    entry.awareness = 0.55;
    entry.sinceMove = 0;
    entry.sinceReplan = 0;
    entry.replans = 0;
    entry.recovered = 0;
    entry.roundsFired = 0;
    entry.pulledBack = 0;
    entry.breached = false;
    entry.saidContact = false;
    entry.saidPinned = false;
    entry.holding = false;
    entry.target = null;
    entry.moving = false;
    entry.leadershipBonus = 1;
    entry.muzzleHeight = 1.35 * (entry.figure.scale ?? 1);
    entry.active = true;
    reported.delete(order.id);

    /* The two men in the cellar corridor are nine metres below everybody
     * else, and their whole encounter happens down there -- so they are
     * pinned to the basement floor rather than following the ground. */
    const inBasement = BASEMENT_STAGING.has(order.staging.id);
    entry.floorY = inBasement ? BASEMENT_Y : null;
    const y = inBasement ? BASEMENT_Y : groundHeightAt(order.staging.x, order.staging.z);
    entry.figure.baseY = y;
    entry.root.position.set(order.staging.x, y, order.staging.z);
    entry.goal.copy(entry.root.position);
    entry.root.visible = true;
    entry.root.userData.down = false;
    entry.figure.stand();
    /* `stand()` clears the arms; restore the same contact-tested ready pose
     * used at build time whenever this pooled actor is spawned again. */
    if (entry.gun) {
      entry.gun.visible = true;
      braceSiegeWeapon(entry.figure, entry.gun);
    }
    /* Facing the way he is about to walk. */
    const first = entry.path[0];
    if (first) {
      entry.root.rotation.y = Math.atan2(
        first.x - entry.root.position.x, first.z - entry.root.position.z,
      );
    }
    if (!silent) bark(entry, entry.plan.tactic === 'flank' ? 'flank' : 'push');
    return entry;
  }

  function despawnAll() {
    for (const entry of entries.values()) {
      entry.active = false;
      entry.target = null;
      entry.path.length = 0;
      entry.root.visible = false;
    }
    navigator.reset();
    tracers.clear();
    flash.visible = false;
    return entries.size;
  }

  /** How many attackers are up, on their feet and in the fight. */
  function living() {
    return [...entries.values()]
      .filter((entry) => entry.active && !entry.actor.incapacitated)
      .map((entry) => entry.root);
  }

  /**
   * The player's round, resolved.
   *
   * Same shared function the attackers fire through, with the attacker and
   * the target swapped and `playerShot` set -- which is what makes the
   * civilian rule and the `core` protection apply identically in both
   * directions without this file restating either of them.
   */
  function registerHit(mesh, damageAmount, penetration = 0.3) {
    const owner = actorFor(mesh);
    if (!owner) return [];
    const actor = owner.userData.combatActor;
    const zone = zoneFor(mesh);
    const scaled = Math.max(0, Number(damageAmount) || 0) * (HIT_ZONES[zone] ?? 1);
    const resolved = resolveBallisticHits([{ distance: 1, actor, material: 'flesh', zone }], {
      attacker: { faction: FACTIONS.CREW },
      damage: scaled,
      penetration,
      matrix: factionMatrix,
      playerShot: true,
    });
    const result = resolved[0]?.result ?? null;
    const entry = entryForRoot(owner);
    if (entry && result?.applied) {
      /* Hit reaction: a round that does not kill still moves a man. He is
       * knocked off his aim, driven toward cover and made to say so. */
      entry.suppression.noteNearMiss(0.2, 1);
      entry.sinceMove = entry.plan.reposition;
      entry.awareness = 1;
      if (result.fatal) markDown(entry);
    }
    return resolved;
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  const THINK_INTERVAL = 1 / 9;

  /**
   * The frame.
   *
   * @param {number} dt
   * @param {object} ctx
   *   player     anything with a `.position`. If it also carries `.actor` (or
   *              `.combatActor`) the rounds that reach him are applied to it
   *              through the shared resolver; if it carries `.suppression`,
   *              near misses go into it. With neither he is still a man to
   *              shoot at and the fight still reads.
   *   colliders  the scene's live collider array. This is the line-of-sight
   *              model: no colliders means every shot is a clean shot.
   *   alive      the crew the cartel may engage -- pass `ensemble.targets()`,
   *              which never contains Snow. An array or a function.
   *   audio, onImpact, onBark, onBreach, onPlayerHit, playerDamageScale
   *              all optional; see `createAttackerPool`.
   */
  function update(dt, ctx = {}) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    context = {
      audio: ctx.audio ?? audio,
      onBark: ctx.onBark ?? null,
      onBreach: ctx.onBreach ?? null,
      onPlayerHit: ctx.onPlayerHit ?? null,
    };
    const frame = {
      audio: context.audio,
      colliders: ctx.colliders ?? [],
      player: ctx.player ?? null,
      onBreach: context.onBreach,
      onPlayerHit: context.onPlayerHit,
      onImpact: ctx.onImpact ?? onImpact,
      /* The mission's difficulty knob, and the only one. A scene that wants
       * the raw catalog numbers passes 1. */
      playerDamageScale: Number.isFinite(ctx.playerDamageScale)
        ? Math.max(0, ctx.playerDamageScale)
        : PLAYER_DAMAGE_SCALE,
    };

    tracers.update(step);
    if (flashTimer > 0) {
      flashTimer -= step;
      if (flashTimer <= 0) { flash.visible = false; flash.intensity = 0; }
    }

    const active = [...entries.values()].filter((entry) => entry.active);
    if (!active.length) return;

    const targets = gatherTargets(ctx);

    /* A leader standing makes the men around him steadier. Computed once per
     * frame rather than per man: it is a property of the group. */
    const leaderUp = active.some((entry) => (
      entry.plan.tactic === 'direct' && !entry.actor.incapacitated
    ));
    for (const entry of active) {
      entry.leadershipBonus = leaderUp && entry.plan.tactic !== 'direct' ? 1.18 : 1;
    }

    for (const entry of active) {
      if (entry.actor.incapacitated) {
        /* THE SWEEP.
         *
         * A man can be incapacitated by something that is not this module:
         * a Squatch on the gallery rail, a guard on the landing, a scripted
         * event. `registerHit` reports the player's kills and
         * `userData.onDown` reports anybody who thinks to call it -- this
         * catches everything else, so an attacker cannot end up dead in the
         * combat core and standing on the staircase with the wave director
         * still counting him. `markDown` is idempotent via `reported`. */
        if (!reported.has(entry.id)) markDown(entry);
        /* Down and staying down. The body keeps breathing for a moment and
         * then stops; nothing else about him ticks. */
        entry.figure.update(step, { fear: 0 });
        continue;
      }
      entry.sinceThink += step;
      if (entry.sinceThink >= THINK_INTERVAL) {
        think(entry, frame, targets);
        entry.sinceThink = 0;
      }
      act(entry, step, frame);
      entry.figure.update(step, { fear: entry.suppression.value * 0.55 });
      entry.actor.suppression = entry.suppression.value;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Checkpoints                                                       */
  /* ---------------------------------------------------------------- */

  function snapshot() {
    return {
      attackers: [...entries.values()].map((entry) => ({
        id: entry.id,
        active: entry.active,
        /* The order is stored whole. It is frozen data out of waves.js, so
         * storing the reference is storing the value. */
        order: entry.order,
        actor: entry.actor.snapshot(),
        weapon: entry.weapon.snapshot(),
        position: entry.root.position.toArray(),
        yaw: entry.root.rotation.y,
        path: entry.path.map((p) => ({ ...p })),
        awareness: entry.awareness,
        suppression: entry.suppression.value,
        roundsFired: entry.roundsFired,
        breached: entry.breached,
        floorY: entry.floorY,
        anchor: entry.anchor,
        side: entry.side,
        destination: entry.destination,
        reported: reported.has(entry.id),
        down: entry.actor.incapacitated,
      })),
      breaches: breaches.map((b) => ({ ...b })),
      /* WHO HAS RESERVED WHAT. Restoring the men without the occupancy puts
       * every survivor back on his feet and every anchor back in the pool, so
       * the next man to reach the landing is sent to a spot somebody is
       * already standing on. */
      nav: navigator.capture(),
    };
  }

  /**
   * Put the fight back where the checkpoint left it.
   *
   * NOBODY IS RESURRECTED AND NOBODY IS REPORTED TWICE. A man who was down
   * when the checkpoint was taken comes back down, on the floor, with his id
   * already in `reported` -- so the wave director's count survives a restore
   * and a cleared section never repopulates.
   */
  function restore(snap) {
    if (!snap?.attackers) return false;
    despawnAll();
    reported.clear();
    breaches.length = 0;
    for (const record of snap.breaches ?? []) breaches.push({ ...record });
    for (const record of snap.attackers) {
      const entry = spawn(record.order, { silent: true });
      entry.active = record.active === true;
      entry.actor.restore(record.actor);
      entry.weapon.restore(record.weapon);
      entry.root.position.fromArray(record.position);
      entry.root.rotation.y = Number(record.yaw) || 0;
      entry.path = (record.path ?? []).map((p) => ({ ...p }));
      entry.awareness = Number(record.awareness) || 0;
      entry.suppression.value = Number(record.suppression) || 0;
      entry.roundsFired = Math.max(0, Math.round(record.roundsFired ?? 0));
      entry.breached = record.breached === true;
      entry.floorY = record.floorY == null ? null : Number(record.floorY);
      entry.anchor = record.anchor ?? entry.anchor;
      entry.side = record.side ?? entry.side;
      entry.destination = record.destination ?? entry.destination;
      entry.goal.copy(entry.root.position);
      entry.root.visible = entry.active;
      if (record.reported) reported.add(entry.id);
      if (record.down || entry.actor.incapacitated) {
        entry.actor.incapacitated = true;
        entry.actor.health = 0;
        markDown(entry, { silent: true });
      }
    }
    /* AFTER the spawns, not before. Every `spawn` above re-plans and re-takes
     * an anchor, so applying the stored occupancy first would be applying it
     * to a graph that is about to be rewritten twenty-two times. */
    if (snap.nav) navigator.restore(snap.nav);
    return true;
  }

  return {
    root,
    spawn,
    despawnAll,
    update,
    actorFor,
    registerHit,
    living,
    snapshot,
    restore,

    /**
     * The house as the cartel walk it. Exposed so the scene can draw the
     * anchors when somebody is tuning a route, and so a test can ask the
     * graph a question rather than re-deriving one.
     */
    navigator,

    /* ---- everything below is diagnostics, not the contract ---- */
    /** The entry behind an id, for the scene's own HUD and for tests. */
    entry: (id) => entries.get(id) ?? null,
    /** Every attacker ever spawned, down or standing. */
    all: () => [...entries.values()],
    /** Ids `onDown` has been called for. */
    reported: () => [...reported],
    /** Windows the cartel has come through, for the glass owner. */
    breaches: () => breaches.map((b) => ({ ...b })),
    /**
     * The check the brief asks for by name: nobody spawns where the player
     * can see him. Empty is the only shippable answer.
     *
     * SCOPED TO THE WAVES, deliberately. During the staircase defence the
     * player is on the landing looking straight down the foyer, so nothing
     * may activate in it. The FOYER ENCOUNTER is a different beat: its
     * `foyer_floor` men are placed while the player is still in the basement,
     * which is what waves.js means by "already past the door when the player
     * comes up". Both are "out of the player's view at spawn"; only one of
     * them is out of the foyer.
     */
    spawnedInsideView: () => [...entries.values()]
      .filter((entry) => entry.order.wave
        && insidePlayerView(entry.staging.x, entry.staging.z))
      .map((entry) => entry.id),
    /** Attackers currently outside the boundary. Also only ever empty. */
    outsideBoundary: () => [...entries.values()]
      .filter((entry) => entry.active && (
        entry.root.position.x < COMBAT_BOUNDARY.x0 || entry.root.position.x > COMBAT_BOUNDARY.x1
        || entry.root.position.y < COMBAT_BOUNDARY.y0 || entry.root.position.y > COMBAT_BOUNDARY.y1
        || entry.root.position.z < COMBAT_BOUNDARY.z0 || entry.root.position.z > COMBAT_BOUNDARY.z1
      ))
      .map((entry) => entry.id),
    tracers,
  };
}
