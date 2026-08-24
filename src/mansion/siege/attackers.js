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
 *   CombatImpactResolver locates the player's complete WeaponSystem impact
 *                        on a registered body before applying actor damage.
 *   CombatFireControl    gates every hostile round against the rendered bore,
 *                        copied perception sample, live visibility and walls.
 *   FactionMatrix        who may shoot whom. Attackers are CARTEL. Nothing
 *                        here compares faction strings.
 *   SuppressionModel     one per attacker, plus the near-misses they put on
 *                        the player.
 *   TracerPool           every round in the air, in one draw call.
 *   Firearm              rounds, reserve, cooldown, recoil and reload. An attacker who
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

import { CombatWeaponAim } from '../../core/combat/aim.js';
import { CombatActor } from '../../core/combat/actors.js';
import { DEFAULT_FACTION_MATRIX, FACTIONS } from '../../core/combat/factions.js';
import { CombatFireControl } from '../../core/combat/fire-control.js';
import { CombatImpactResolver } from '../../core/combat/impact.js';
import { CombatImpairments } from '../../core/combat/impairments.js';
import { CombatPerception } from '../../core/combat/perception.js';
import { CombatProjectilePattern } from '../../core/combat/projectile-pattern.js';
import { AabbCombatSpace } from '../../core/combat/spatial.js';
import { SuppressionModel } from '../../core/combat/suppression.js';
import { TracerPool } from '../../core/combat/tracers.js';
import { BurstController } from '../../core/combat/weapon.js';
import { Firearm } from '../../core/weapons/Firearm.js';
import { playWeaponCue } from '../../core/weapons/audio.js';
import { WEAPON_CATALOG } from '../../core/weapons/catalog.js';
import { buildWeaponModel } from '../../core/weapons/models.js';
import { HeistFigure } from '../../heist/people.js';
import { dressInATeamColours } from '../../world/ateam.js';
import { CombatArmorPresentation } from '../../world/combat-armor.js';
import {
  SIEGE_WEAPON_MOUNT_ROLL,
  braceSiegeWeapon, mountSiegeWeapon, trackSiegeWeaponSupport,
} from './armed-pose.js';
import { blendSiegeFall, siegeFallenPose } from './fallen.js';
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
const STEP_COUNT = 6;
const STEP_RUN = (STEP_TOP_Z - STEP_Z) / STEP_COUNT;
const STEP_DEPTH = STEP_RUN + 0.06;
const STEP_HALF_DEPTH = STEP_DEPTH / 2;
const PORTICO_Z = STEP_TOP_Z - 0.1;
/** Break a flank pane while the actor is still outside it.  The old event
 * waited for the inside waypoint's 1.1 m arrival slack, so the body crossed
 * half a metre of intact glass before the callback withdrew its collider. */
export const BREACH_TRIGGER_DISTANCE = 1.05;

/**
 * The floor on a HUNTED man's pace, metres per second. Above the 2.25 m/s
 * line the step event calls a run, so the remnant closing on the player is
 * audible as running feet -- the tell behind "four attacks left cant find
 * them". See `act()`.
 */
export const HUNT_SPEED = 2.4;
const GROUND_INTERIOR_ROOMS = new Set([
  'foyer', 'living', 'lounge', 'ballroom', 'dining', 'kitchen',
  'trophy', 'winter', 'bay',
]);

/**
 * The staging zones that are below the house rather than in front of it.
 *
 * A basement corridor and a forecourt can share an (x, z) and be nine metres
 * apart, so the level rides on the man rather than being inferred from where
 * he is standing. Named explicitly rather than derived from `indoor` and a z
 * threshold, because the foyer is indoors too.
 */
const BASEMENT_STAGING = Object.freeze(new Set(['cellar_hall', 'cellar_vault']));

/** Visible standing surface at a point on the ground level. The six entry
 * blocks are treads, not a ramp; overlapping tread boxes take the higher top.
 * Outside them, distinguish the raised house from the two lawns instead of
 * treating every z north of the portico as y=1.2. */
export function groundHeightAt(x, z) {
  if (Math.abs(x) <= 6) {
    if (z >= PORTICO_Z && z <= 36) return GROUND_Y;
    const tread = Math.min(STEP_COUNT - 1, Math.floor(
      (z - STEP_Z + STEP_HALF_DEPTH) / STEP_RUN,
    ));
    if (tread >= 0) {
      const centre = STEP_Z + tread * STEP_RUN;
      if (z >= centre - STEP_HALF_DEPTH - 1e-9
          && z <= centre + STEP_HALF_DEPTH + 1e-9) {
        return 0.16 + tread * (GROUND_Y / STEP_COUNT);
      }
    }
  }

  const room = roomAt({ x, y: GROUND_Y, z });
  if (GROUND_INTERIOR_ROOMS.has(room)) return GROUND_Y;

  /* Drive box, turnaround plane and east service road, in that visible-top
   * order where their footprints overlap. Side lawns remain y=0. */
  if (Math.abs(x) <= 4 && z >= 0 && z <= 23) return 0.05;
  if (x >= 22 && x <= 28 && z >= 0 && z <= 70) return 0.05;
  if (Math.hypot(x, z - 30) <= 15.2) return 0.02;
  return 0;
}

/* ================================================================== */
/* WHERE A ROUND LANDS ON A MAN                                         */
/*                                                                       */
/* The multiplier is applied to the damage handed to CombatImpactResolver, */
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


/* ================================================================== */
/* THE A-TEAM'S COLOURS                                                 */
/*                                                                      */
/* Owner, 2026-08-24: *"I also want to give them more identifiable A     */
/* team outfits."*                                                      */
/*                                                                      */
/* The role kits above answer WHAT EACH MAN DOES -- webbing, a plate, a  */
/* radio -- and they do that job. What none of them says is WHO THEY     */
/* ARE. Eight different silhouettes in eight shades of olive is eight    */
/* men, not one crew, and the crew is the entire point of the barks:     */
/* these people are a TEAM and they will tell you so while they shoot    */
/* at you.                                                              */
/*                                                                      */
/* The garment itself lives in `src/world/ateam.js` and not here, because */
/* since 2026-08-25 it is worn in two scenes: this one, and the wave Mark */
/* sends into his own dining room in the Cartel Palace. Same organisation, */
/* same vest, one definition of the red.                                 */
/*                                                                      */
/* THE HEADBAND STAYS RED AND STAYS AS IT WAS. It is the friend-or-foe   */
/* read at forty metres on a dark landing and there is a test on it.     */
/* The vest is the same red, so the two agree instead of competing.      */
/* ================================================================== */

/* The crew's own red and bone are NOT in here. They live with the garment, in
 * src/world/ateam.js, because the Palace wears them too and one cloth cannot
 * have two definitions of its own colour. */
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
/*               the tracer colour and the canonical Firearm's numbers.    */
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
    weapon: 'shotgun',
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
 * amount handed to the shared actor resolver and nothing else; armour, the
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
const HOLD_UNTIL_PLAYER_GROUND_FLOOR = 'player_ground_floor';
/* `ctx.player.position` is the first-person eye, not the feet. Basement eye
 * height is below zero and a standing ground-floor eye is about 2.86 m. This
 * midpoint releases the foyer encounter on the last stair, when it can first
 * be seen, without letting its authored actors climb away while the player is
 * still choosing a weapon two rooms below. */
const GROUND_FLOOR_REVEAL_EYE_Y = GROUND_Y + 1;

/* Combat perception and locomotion stay here until another scene needs the
 * exact same authored-navigation adapter. They are deliberately physical
 * quantities rather than role tuning: every cartel role has the same body,
 * the same eyes and the same obligation to point a gun before firing it. */
const LOS_MEMORY_SECONDS = 2.4;
const AIM_FIRE_TOLERANCE = 0.14;
const AGENT_RADIUS = 0.29;
const AGENT_SEPARATION = 0.52;
const AGENT_HEIGHT = 1.72;
const ORIGIN_CONTAINMENT_EPSILON = 1e-4;
const WHIZ_COOLDOWN_SECONDS = 0.22;
const VISION_FOV_RADIANS = Math.PI;
const DEFENCE_AIM = Object.freeze({
  x: (DEFENCE_POST.x0 + DEFENCE_POST.x1) * 0.5,
  y: DEFENCE_POST.y + 1.45,
  z: (DEFENCE_POST.z0 + DEFENCE_POST.z1) * 0.5,
});

const SIEGE_COMBAT_SPACE = new AabbCombatSpace({
  radius: AGENT_RADIUS,
  height: AGENT_HEIGHT,
  separation: AGENT_SEPARATION,
  verticalSeparation: 1.2,
  floorClearance: 0.08,
  headClearance: 0.04,
  originContainmentEpsilon: ORIGIN_CONTAINMENT_EPSILON,
});

function perceptionScore(target, distance) {
  return distance * (target?.isPlayer ? 0.82 : 1);
}

function attackerPosition(entry) {
  return entry.root.position;
}

function attackerId(entry) {
  return entry.id;
}

function livingAttacker(entry) {
  return entry.active && !entry.actor.incapacitated;
}

function finiteOrInfinity(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : Infinity;
}

/** Keep the siege's long-standing diagnostic surface backed by shared state. */
function exposeSharedCombatState(entry) {
  const impairment = (key, clamp = false) => ({
    enumerable: true,
    get: () => entry.impairments[key],
    set: (value) => {
      const number = Number(value);
      const safe = Number.isFinite(number) ? Math.max(0, number) : 0;
      entry.impairments[key] = clamp ? Math.min(1, safe) : safe;
    },
  });
  const pitch = (key) => ({
    enumerable: true,
    get: () => entry.weaponAim[key],
    set: (value) => {
      const number = Number(value);
      entry.weaponAim[key] = Math.max(-entry.weaponAim.pitchLimit,
        Math.min(entry.weaponAim.pitchLimit, Number.isFinite(number) ? number : 0));
    },
  });
  Object.defineProperties(entry, {
    stagger: impairment('stagger'),
    armWound: impairment('armWound', true),
    legWound: impairment('legWound', true),
    aimPitch: pitch('pitch'),
    desiredAimPitch: pitch('desiredPitch'),
    aimError: {
      enumerable: true,
      get: () => entry.weaponAim.aimError,
      set: (value) => { entry.weaponAim.aimError = finiteOrInfinity(value); },
    },
    boreError: {
      enumerable: true,
      get: () => entry.weaponAim.boreError,
      set: (value) => { entry.weaponAim.boreError = finiteOrInfinity(value); },
    },
    aimAligned: {
      enumerable: true,
      get: () => entry.weaponAim.aligned,
      set: (value) => { entry.weaponAim.aligned = value === true; },
    },
  });
  return entry;
}

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
/* WHAT THEY SHOUT                                                        */
/*                                                                        */
/* Twenty-two men and one sentence is worse than silence, so every pool   */
/* below walks with a cursor -- the same `sayPooled` shape THE TAKE uses. */
/* These are barks, not dialogue: nothing here is queued behind anything, */
/* and no cue names are invented for the tactical pools -- they stay      */
/* subtitle-only. BARKS.identity is the one exception (see its own        */
/* comment): it carries a `vo.ateam.*` cue AND one of the crew's five     */
/* voices per line, because the crew's identity is spoken, not just       */
/* captioned, and since 2026-08-20 it is spoken by five different men.    */
/* ================================================================== */

/* ================================================================== */
/* THE FIVE MEN OF THE A-TEAM                                             */
/*                                                                        */
/* The crew shipped on ONE voice profile, `ateam`, on the same reasoning  */
/* as `mansion-guard`: same job, not the same man. The owner overruled it */
/* on 2026-08-20 and cast five throats, so a firefight sounds like a crew */
/* arguing rather than one man played twenty-two times.                   */
/* `ATEAM_IDENTITY_BARKS` below names the man for every line, and nothing */
/* else in the siege picks a voice for an attacker -- that table and that */
/* one column are the whole mapping.                                      */
/*                                                                        */
/* THE CASTING, owner-supplied 2026-08-20 (real ElevenLabs ids, written   */
/* into `assets/sfx/manifest.json` by the casting pass -- this module     */
/* never reads an id, it only names the profile):                         */
/*                                                                        */
/*   ateam1  Cf2KUROHGvqqd4q0ebDI   <-- SEE THE COLLISION NOTE            */
/*   ateam2  B5C11BLhewmdJdOuDLmf                                         */
/*   ateam3  hIsL8rTRQdJK5cF3UM5G                                         */
/*   ateam4  pgoedMoL7SCrpaX44PjD                                         */
/*   ateam5  uKrIE6rRnTbWQegQc2T4                                         */
/*                                                                        */
/* COLLISION, FLAGGED TO THE OWNER AND WIRED AS GIVEN: ateam1's id,       */
/* Cf2KUROHGvqqd4q0ebDI, is ALSO the third voice on the Cartel Palace's   */
/* `cartel-guard` list. It arrived on both lists and it is wired on both, */
/* rather than silently substituted for something that sounded close. The */
/* two casts never share a scene, so nothing is audibly wrong tonight --  */
/* and if the owner does want them split, changing ateam1's id in the     */
/* manifest is the whole fix and nothing in this file moves. That         */
/* note is on both manifest profiles too.                                 */
/* ================================================================== */
export const ATEAM_VOICES = Object.freeze([
  'ateam1', 'ateam2', 'ateam3', 'ateam4', 'ateam5',
]);

/**
 * One A-Team line: which man, the cue that records him, what he shouts.
 *
 * The `vo.ateam.` prefix lives here rather than in forty-two strings so the
 * table stays one line per line and a cue can never drift off the prefix the
 * manifest and `tools/scene-casts.json` are holding it to.
 */
const ateam = (voice, cue, line) => Object.freeze({
  voice, cue: `vo.ateam.${cue}`, line,
});

/**
 * THE A-TEAM, NAMING THEMSELVES.
 *
 * The rest of `BARKS` is tactical chatter that could be anyone's crew; this
 * is the crew saying who they are while they do it, per the owner's
 * playtest note: the attacking cartel outfit is the A-Team and the fight
 * needs to say so out loud. docs/TONE-AND-PARODY.md governs the words --
 * played straight and hard, crude because the crew is crude, never a wink
 * at the player. Each entry also carries the `vo.ateam.*` cue that will
 * eventually record it and the ONE MAN who says it; `bark()` hands both up
 * through `onBark`, same shape as every other spoken line in this project.
 *
 * ## WHAT THE CREW IS ACTUALLY SHOUTING ABOUT
 *
 * Owner, 2026-08-20, now canon: the A-Team are named like a sports team,
 * THE A-TEAM NEVER MADE THE PLAYOFFS, and they are proud of themselves
 * anyway. That is the whole joke and it is load-bearing that NOBODY IN
 * HERE KNOWS IT IS ONE. Every line below is meant sincerely by a man
 * shooting at somebody. The funniest shape of it -- and there are a dozen
 * of them below -- is a man defending the record to a house that never
 * brought it up, mid-assault, because it is the thing he is carrying.
 *
 * THE RULE FOR ANYONE ADDING A LINE HERE, from the tone doctrine: no line
 * may know it is funny. Nothing arch, nothing self-aware, no character
 * noticing that shouting about seeding during a breach is strange. The
 * moment one of these men hears himself, the joke belongs to the scene
 * instead of the player, and the tone doctrine says that is the failure.
 * If a line reads as a punchline rather than as a grievance, cut it.
 */
export const ATEAM_IDENTITY_BARKS = Object.freeze([
  /* The eight that shipped first, re-voiced onto the five men. */
  ateam('ateam1', 'greetings', 'Greetings from the A-Team, bitch!'),
  ateam('ateam3', 'regards', 'A-Team sends their regards!'),
  ateam('ateam2', 'house', 'This house belongs to the A-Team now!'),
  ateam('ateam5', 'finished', 'You Squatches are finished!'),
  ateam('ateam4', 'collect', 'Tell Lou the A-Team came to collect!'),
  ateam('ateam2', 'knock', 'The A-Team does not knock twice!'),
  ateam('ateam1', 'street', 'A-Team owns this street tonight!'),
  ateam('ateam3', 'nobody-walks', 'Nobody walks out of an A-Team job!'),

  /* The owner's own five, kept as close to verbatim as a recording sheet
   * allows: his capitals are delivery, not spelling, and they are notes to
   * the booth in `direction` rather than shouting in the string. The two
   * apostrophes below are the only contractions in this module and they
   * are his -- everything written here since keeps the house style. */
  ateam('ateam5', 'for-the-a-team', 'For the A-Team!'),
  ateam('ateam2', 'never-made-playoffs', 'It doesn’t matter! The A-Team never made playoffs!'),
  ateam('ateam4', 'rules', 'A-Team rules!'),
  ateam('ateam1', 'never-be-on-it', 'You’ll never be on the A-Team!'),
  ateam('ateam3', 'for-the-a-team-two', 'For the A-Team!'),

  /* THE RECORD, DEFENDED TO PEOPLE WHO DID NOT ASK. Nobody in this house
   * has said one word about the playoffs. These men are answering anyway. */
  ateam('ateam5', 'nobody-asked', 'Nobody asked about the playoffs!'),
  ateam('ateam4', 'still-standing', 'We never made playoffs and we are standing in your house!'),
  ateam('ateam2', 'say-it', 'Say one word about the playoffs! Say it!'),
  ateam('ateam1', 'seeding', 'It was the seeding! It was always the seeding!'),
  ateam('ateam3', 'the-record', 'That record does not say what you think it says!'),
  ateam('ateam5', 'not-the-measure', 'Playoffs are not the measure of a team!'),
  ateam('ateam4', 'ask-anybody', 'Ask anybody who watched us play! Ask them!'),
  ateam('ateam1', 'not-qualified', 'Nobody in this house is qualified to bring up the playoffs!'),
  ateam('ateam2', 'nine-seasons', 'Nine seasons together! You know what that takes?'),
  ateam('ateam3', 'do-not-say-it', 'Do not stand there and say playoffs to me!'),
  ateam('ateam5', 'schedule', 'Hardest schedule in the league! We showed up every week!'),
  ateam('ateam4', 'standings-lie', 'Standings lie! Everybody knows standings lie!'),

  /* The pride itself, in the register of a crew that thinks of itself as a
   * franchise. Same rule: sincere, shouted, aimed at a man they are trying
   * to kill. */
  ateam('ateam2', 'reload-not-rebuild', 'We do not rebuild! We reload!'),
  ateam('ateam1', 'best-crew', 'A-Team! Best crew that ever worked this coast!'),
  ateam('ateam3', 'on-three', 'A-Team on three! One! Two!'),
  ateam('ateam5', 'look-at-us', 'You are looking at the A-Team! Look at us!'),
  ateam('ateam4', 'this-is-what', 'This is what the A-Team does!'),
  ateam('ateam1', 'nobody-plays', 'Nobody plays like the A-Team!'),
  ateam('ateam2', 'undefeated-here', 'Undefeated in this house!'),
  ateam('ateam3', 'earned-his-spot', 'Every man on this team earned his spot!'),
  ateam('ateam5', 'cannot-buy', 'You cannot buy a roster like this!'),
  ateam('ateam4', 'say-it-back', 'A-Team! Say it back!'),
  ateam('ateam2', 'deepest-bench', 'Deepest bench in the business!'),
  ateam('ateam1', 'franchise', 'You are getting hit by a franchise crew!'),
  ateam('ateam3', 'check-the-tape', 'Check the tape! Go and check the tape!'),
  ateam('ateam4', 'team-record', 'That is a team record and it stands!'),
  ateam('ateam5', 'every-yard', 'Nobody carried us! We earned every yard of this!'),

  /* `identityBarkForCasualty` routes a man's death to whoever is still
   * standing, so the pool wants lines a crew can say over one of its own
   * without ever dropping the register. These are the two. */
  ateam('ateam2', 'played-hurt', 'He played hurt! You hear me? He played hurt!'),
  ateam('ateam3', 'next-man-up', 'Next man up!'),
]);

/**
 * The A-Team's recorded takes, for whoever is decoding the scene's audio.
 *
 * Owner, 2026-08-24: *"I also didnt hear the A team voice lines during the
 * siege."* He would not have. Every other part of this was wired -- the table
 * carries the cue, `bark()` hands it up through `onBark`, and the scene's
 * `renderCombatBark` calls `speak()` with it -- but nothing ever LOADED the
 * bank. `AudioEngine.play` on a cue with no decoded buffer does not fail; it
 * falls through to the synth stand-in, so forty-two recorded lines were being
 * answered by a blip while the subtitle said the words.
 *
 * The list belongs here, beside the table, for the same reason the `vo.ateam.`
 * prefix does: a bark pool that names its own cues and then leaves somebody
 * else to remember them is a pool that goes quiet the next time a line is
 * added. One and a half megabytes for the crew, decoded with the rest of the
 * mission's voices.
 */
export function ateamBarkCueNames() {
  return [...new Set(ATEAM_IDENTITY_BARKS.map((entry) => entry.cue))];
}

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
  /* The wave's remnant calling the search as it closes -- the audible half
   * of the hunt ("four attacks left cant find them"). One man at a time, on
   * the pool's own cadence, so four survivors do not talk over each other. */
  hunt: Object.freeze([
    'Find him! He is still in the house!',
    'No more waiting — everyone inside!',
    'He is on that landing. Go and get him!',
    'Last push. Finish it!',
  ]),
  /* THE A-TEAM, NAMING THEMSELVES -- the pool itself lives above, and is the
   * one bark table this module exports. It is also the only one carrying
   * manifest cues, so the casting pass and its regression test read the real
   * array instead of re-typing forty-two lines that would then drift. */
  identity: ATEAM_IDENTITY_BARKS,
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
export function segmentBlocked(a, b, boxes, {
  skipRadius = ORIGIN_CONTAINMENT_EPSILON,
} = {}) {
  return SIEGE_COMBAT_SPACE.trace(a, b, { boxes, skipRadius });
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

const HEAVY_ARMOR_ROLES = new Set(['armored', 'gunner', 'leader']);

/** Scene-local compatibility only: Firearm remains the one state owner. */
function npcFirearm(id) {
  const firearm = new Firearm(id);
  const legacyDefinition = Object.freeze({
    magazineSize: firearm.capacity,
    reserveMagazines: Math.max(0, Math.ceil(firearm.def.reserve / firearm.capacity)),
    roundsPerSecond: firearm.def.rps,
    reloadSeconds: firearm.def.reloadOut + firearm.def.reloadIn,
    recoilPerShot: firearm.def.recoil,
    hipSpread: firearm.def.spread,
    aimedSpread: firearm.def.spread * 0.4,
    damage: firearm.def.damage,
    penetration: firearm.def.penetration,
  });
  Object.defineProperties(firearm, {
    magazine: {
      configurable: true,
      get() { return this.rounds; },
      set(value) {
        this.rounds = Math.max(0, Math.min(this.capacity, Math.trunc(Number(value) || 0)));
      },
    },
    reserveMagazines: {
      configurable: true,
      get() { return Math.ceil(this.reserve / Math.max(1, this.capacity)); },
      set(value) {
        this.reserve = Math.max(0, Math.trunc(Number(value) || 0)) * this.capacity;
      },
    },
    definition: { configurable: true, value: legacyDefinition },
  });
  return firearm;
}

function fireNpcWeapon(firearm, options = {}) {
  firearm.setTrigger(false);
  firearm.setTrigger(true);
  const event = firearm.fire(options);
  firearm.setTrigger(false);
  return event.fired ? {
    ...event,
    shot: firearm.shots,
    damage: firearm.def.damage,
    penetration: firearm.def.penetration,
    remaining: firearm.rounds,
  } : event;
}

function restoreNpcWeapon(firearm, snapshot = {}) {
  if (Number.isFinite(Number(snapshot?.rounds))) return firearm.restore(snapshot);
  const magazines = Math.max(0, Math.trunc(Number(snapshot?.reserveMagazines) || 0));
  return firearm.restore({
    id: firearm.id,
    rounds: Math.max(0, Math.trunc(Number(snapshot?.magazine) || 0)),
    reserve: magazines * firearm.capacity,
    shots: Math.max(0, Math.trunc(Number(snapshot?.shotsFired) || 0)),
  });
}

function stepSurface(position) {
  if (position.z < 36) return 'gravel';
  if (position.y >= UPPER_Y - 0.5) return 'wood';
  return 'marble';
}

function frozenShotVector(value) {
  return value?.isVector3 ? Object.freeze(value.clone()) : null;
}

function frozenShotBlocker(value) {
  return value ? Object.freeze({
    ...value,
    point: frozenShotVector(value.point),
  }) : null;
}

/* ================================================================== */
/* THE POOL                                                             */
/* ================================================================== */

/**
 * Build the pool the wave director spawns into.
 *
 * @param {object} o
 *   scene         where the pool's root is added, once.
 *   damage        the `MansionDamageState`. The whole pool is one `battle`
 *                 group, so fallen bodies remain through the aftermath and
 *                 disappear only when the house returns to `repaired`.
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

  /* The battle layer persists through damaged/post-battle because those
   * authored beats explicitly contain bodies. Hiding this root at wave clear
   * left its scene-level blood pools floating on an suddenly empty floor. */
  damage?.group?.('siege.attackers', { object: root, layers: ['battle'] });

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

  /* Deep combat truth is pool-wide. Bodies register once for their pooled
   * lifetime; hostile whiz timing is shared across every shooter, exactly as
   * the old pool-local cooldown was. Scene presentation remains below. */
  const impactResolver = new CombatImpactResolver();
  const impactRegistrations = new Map();
  const fireControl = new CombatFireControl({
    random: () => Math.random(),
    space: SIEGE_COMBAT_SPACE,
    alignmentTolerance: AIM_FIRE_TOLERANCE,
    whizCooldown: WHIZ_COOLDOWN_SECONDS,
  });
  const projectilePattern = new CombatProjectilePattern({ random: () => Math.random() });

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
  /** Seconds until the next hunt call. 0 fires on the first hunted frame. */
  let huntBarkClock = 0;
  /**
   * Seconds until the crew may name themselves again.
   *
   * BARKS.identity fires from five separate call sites (contact, advance,
   * reload, a casualty, a fresh breach), any one of which could otherwise
   * hit on the same frame across twenty-two men. This single pool-wide clock
   * is what keeps "A-Team sends their regards" a line the crew says now and
   * again rather than a chant -- see the owner's playtest note on the beat.
   */
  let identityBarkClock = 0;

  /* Scratch vectors. Allocating inside a per-frame loop over twenty-two men
   * is how a fight becomes a garbage-collection stutter. */
  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _step = new THREE.Vector3();
  const _viewForward = new THREE.Vector3();
  const _candidate = new THREE.Vector3();

  let context = {
    audio: null,
    onBark: null,
    onBreach: null,
    onPlayerHit: null,
    onWeaponEvent: null,
  };

  /* THE CURSOR MOVES ONLY ON A LINE THAT WAS ACTUALLY TAKEN -- see the twin of
   * this function in ensemble.js for the full argument. Short version:
   * `renderCombatBark` in siege/main.js refuses a bark while a scripted
   * dialogue line still holds the subtitle and returns false, and the siege
   * refuses in bursts because the briefing and guidance sequences run through
   * the fighting. Advancing before asking spent those entries unheard, which
   * on a three-line tactical pool hands the player the same sentence twice,
   * and on `identity` throws away one of the forty-two A-Team lines -- each
   * cast and carried in the manifest under its own `vo.ateam.*` cue, so the
   * day those takes land the burn costs a recording rather than a caption.
   * Same rule as `refuseWeapon` in src/motel/main.js. */
  function bark(entry, key) {
    const lines = BARKS[key];
    if (!lines?.length) return null;
    const index = (barkCursor.get(key) ?? 0) % lines.length;
    const raw = lines[index];
    /* Every other bark pool is bare strings. BARKS.identity is the one pool
     * that also carries a manifest cue and a named speaker (see its own
     * comment), so a line here is either a string or `{ line, cue, voice }`
     * and only the second shape has anything to play.
     *
     * THE CUE IS HANDED UP, NOT PLAYED HERE. `context.audio` is also where
     * every weapon sound in this file goes -- fire, reload, cycle -- and the
     * regression test `the guns are audible and the rounds leave marks`
     * asserts every cue that pool sees matches the weapon catalog. Playing a
     * `vo.ateam.*` line through the same channel breaks that promise for a
     * caller that only wanted gunfire acoustics. The scene that owns the
     * real voice engine hears about it through `onBark`'s `cue` field
     * instead, exactly the way it already learns the spoken TEXT. */
    const spoken = typeof raw === 'string';
    const line = spoken ? raw : raw.line;
    const cue = spoken ? null : (raw.cue ?? null);
    /* WHICH OF THE FIVE. Carried up beside the cue rather than resolved here:
     * the cue name already picks the right take out of the manifest, so the
     * scene needs this only to know it heard a different man -- a subtitle
     * tag, a mixer slot, a future one-voice-at-a-time gate. Null for every
     * tactical pool, which stays captions. */
    const voice = spoken ? null : (raw.voice ?? null);
    const taken = context.onBark?.({
      id: entry.id, key, line, cue, voice, role: entry.role.id,
    });
    /* A consumer that returns nothing -- a headless pool, a test listener --
     * has not refused anything, so only an explicit false holds the cursor. */
    if (taken === false) return null;
    barkCursor.set(key, index + 1);
    entry.lastBark = line;
    return line;
  }

  /**
   * THE CADENCE, RE-TUNED FOR A POOL FIVE TIMES THE SIZE.
   *
   * Was 10-18 s against eight lines. What the clock protects has not
   * changed -- twenty-two men on five call sites will otherwise name the
   * crew three times in one breach, and a crew that says its own name on a
   * loop is a chant, which is the one note the owner gave on this beat.
   * What HAS changed is the other failure: at ~14 s of spacing a long
   * assault fires roughly thirty lines, so forty-two lines would mean a
   * third of the crew never got said at all and every run heard the same
   * opening eight in the same order.
   *
   * 7-13 s (~10 s average, and the chance roll below still adds a beat or
   * two on top) walks the whole pool inside one hard fight without ever
   * putting two identity lines close enough to overlap -- the shortest gap
   * possible is still longer than the longest line in the table. Five
   * voices buy the rest of the room: consecutive entries are always
   * different men, so even back-to-back-ish lines read as a crew shouting
   * over each other rather than one man repeating himself.
   */
  const IDENTITY_BARK_COOLDOWN_MIN = 7;
  const IDENTITY_BARK_COOLDOWN_MAX = 13;
  /** Not every qualifying event earns one -- most contact is still tactical.
   * Held at the original 0.35 deliberately: the cooldown was loosened to fit
   * the bigger pool, and raising this too would stop the line landing ON a
   * combat beat and start it landing the instant the clock frees up. */
  const IDENTITY_BARK_CHANCE = 0.35;

  /**
   * The A-Team naming themselves on a real combat beat, gated by
   * `identityBarkClock` so it stays occasional. Called from the same events
   * the tactical barks come from (contact, advance, reload, a fresh breach)
   * so the identity line surfaces because of what is happening in the fight,
   * not on a timer of its own.
   */
  function identityBark(entry) {
    if (!entry || identityBarkClock > 0) return;
    if (Math.random() > IDENTITY_BARK_CHANCE) return;
    bark(entry, 'identity');
    identityBarkClock = IDENTITY_BARK_COOLDOWN_MIN
      + Math.random() * (IDENTITY_BARK_COOLDOWN_MAX - IDENTITY_BARK_COOLDOWN_MIN);
  }

  /**
   * The casualty case: the man who just went down does not get the line,
   * but the crew still has something to say about it. Falls back to the
   * downed man's own position only when nobody else is left standing --
   * finished() is not called yet at this point, so "last man" is real.
   */
  function identityBarkForCasualty(downed) {
    const ally = [...entries.values()].find(
      (candidate) => candidate.id !== downed.id && candidate.active
        && !candidate.actor.incapacitated,
    );
    identityBark(ally ?? downed);
  }

  function weaponEvent(entry, type, details = {}) {
    const event = {
      type,
      id: entry.id,
      weapon: entry.plan.weapon,
      position: entry.root.getWorldPosition(new THREE.Vector3()),
      ...details,
    };
    context.onWeaponEvent?.(event);
    return event;
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
    figure.parts.head.userData.hitPart = 'head';
    figure.parts.body.userData.hitZone = 'chest';
    figure.parts.body.userData.hitPart = 'chest';
    for (const limb of [figure.parts.armL, figure.parts.armR]) {
      limb.userData.hitZone = 'limb';
      limb.userData.hitPart = 'arm';
    }
    for (const limb of [figure.parts.legL, figure.parts.legR]) {
      limb.userData.hitZone = 'limb';
      limb.userData.hitPart = 'leg';
    }
  }

  /* One geometry per authored piece rather than per man. Twenty-two attackers
   * wearing the same seven-panel vest was twenty-two uploads of seven shapes
   * before this cache; the transform is on the mesh, which is where it was
   * already. */
  const kitGeometries = new Map();
  function kitGeometry(piece) {
    const key = piece.shape === 'round'
      ? `r:${piece.radius}:${piece.height}`
      : `b:${piece.size.join(':')}`;
    let geometry = kitGeometries.get(key);
    if (!geometry) {
      geometry = piece.shape === 'round'
        ? new THREE.CylinderGeometry(piece.radius, piece.radius, piece.height, 8)
        : new THREE.BoxGeometry(...piece.size);
      kitGeometries.set(key, geometry);
    }
    return geometry;
  }

  function wearKit(figure, kit, { name, tag, roleId = null }) {
    for (let index = 0; index < kit.pieces.length; index++) {
      const piece = kit.pieces[index];
      const mesh = new THREE.Mesh(kitGeometry(piece), CARTEL_KIT_MATERIALS[piece.material]);
      mesh.name = `${name}.${index}`;
      mesh.position.set(...piece.pos);
      if (piece.rotation) mesh.rotation.set(...piece.rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData[tag] = true;
      if (roleId) mesh.userData.cartelRole = roleId;
      mesh.userData.cartelKit = kit.label;
      figure.parts.body.add(mesh);
    }
  }

  function dressCartelRole(figure, roleId) {
    const kit = CARTEL_ROLE_KITS[roleId];
    if (!kit) throw new Error(`No cartel outfit kit for ${roleId}`);
    wearKit(figure, kit, {
      name: `cartel.outfit.${roleId}`, tag: 'cartelOutfitPiece', roleId,
    });
    /* And over the top of it, whoever he is, the crew's own colours -- the
     * shared garment, so the Palace's wave is dressed off the same red. */
    dressInATeamColours(figure.parts.body, { extra: { cartelRole: roleId } });
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
   * Everything about whether it lands is decided by `CombatFireControl`.
   * This Adapter retains cadence, sound, tracer and scene reactions; shared
   * fire control decides whether the actual bore meets a man, wall or air.
   */
  function fireRound(entry, target, ctx) {
    const round = fireNpcWeapon(entry.weapon, {
      aimed: entry.aimAligned,
      aimStability: entry.impairments.aimSettleScale,
    });
    if (!round.fired) {
      if (round.reason === 'empty' && entry.weapon.reload()) {
        weaponEvent(entry, 'reload-start');
        bark(entry, 'reload');
        identityBark(entry);
        playWeaponCue(ctx.audio, entry.plan.weapon, 'reload.out', { position: entry.root.position, volume: 0.4 });
      }
      return null;
    }

    /* `aimPoint` is sampled by the perception tick. It is intentionally not
     * read back from a live target here: once a wall closes the line of sight,
     * the shooter may remember where somebody was, but may not track him as
     * he moves behind it. */
    if (entry.aimPoint?.isVector3) {
      _to.copy(entry.aimPoint);
    } else {
      /* Compatibility for a restored pre-perception checkpoint or a direct
       * legacy test target. New entries always own an aimPoint. */
      _to.copy(target.position);
      _to.y += target.eye ?? 0;
    }

    /* The shared aim frame sampled the rendered catalog muzzle and local -Z
     * bore after the Mansion pose Adapter ran. Keep a legacy fallback for a
     * restored pre-frame checkpoint, but ordinary fire always uses the frame
     * that admitted this trigger pull. */
    const aimFrame = entry.aimFrame;
    if (aimFrame?.origin?.isVector3 && aimFrame?.direction?.isVector3) {
      _from.copy(aimFrame.origin);
    } else {
      _from.copy(entry.root.position);
      _from.y += entry.muzzleHeight;
    }

    const distance = _from.distanceTo(_to);
    const areaFire = target.areaFire === true;
    let liveTargetPoint = null;
    if (!areaFire && target.position) {
      _candidate.copy(target.position);
      _candidate.y += target.eye ?? 0;
      liveTargetPoint = _candidate;
    }

    /* Accuracy. Falls off with range past his role's standoff, falls off
     * again while he is moving, and falls off hard while he is suppressed --
     * which is what makes shooting back at a suppressor worth doing. */
    const overRange = Math.max(0, distance - entry.plan.standoff) / 30;
    const moving = entry.moving ? 0.55 : 1;
    const shaken = 1 - entry.suppression.value * 0.7;
    const wounded = entry.impairments.accuracyScale;
    const leadership = entry.leadershipBonus;
    const chance = Math.max(0.02, entry.plan.accuracy * moving * shaken * wounded * leadership
      * (1 - Math.min(0.75, overRange)));
    /* Shared fire control owns the physical truth of this round. The target
     * point is read live, but the aim point remains the copied perception
     * sample; only the same still-visible target can receive actor damage.
     * Area fire deliberately carries no actor. */
    const targetVisible = !areaFire && entry.targetVisible && entry.target === target;
    const catalogue = WEAPON_CATALOG[entry.plan.weapon];
    const projectileCount = Math.max(1, Math.trunc(Number(round.projectiles) || 1));
    const bore = (aimFrame?.direction ?? _to.clone().sub(_from)).clone().normalize();
    const rays = projectileCount > 1
      ? projectilePattern.sample({
        origin: _from,
        direction: bore,
        count: projectileCount,
        spread: round.spread,
        range: Math.max(0.001, distance),
      })
      : [{
        index: 0,
        origin: _from.clone(),
        direction: bore,
        end: _to.clone(),
      }];
    let remainingCap = Number.isFinite(Number(catalogue?.triggerDamageCap))
      ? Math.max(0, Number(catalogue.triggerDamageCap))
      : Infinity;
    const resolvedPellets = [];
    const pelletRecords = [];
    for (const ray of rays) {
      const pelletDamage = Math.min(
        round.damage * (target.isPlayer ? ctx.playerDamageScale : 1),
        remainingCap,
      );
      const resolved = fireControl.resolveShot({
        origin: ray.origin,
        boreDirection: ray.direction,
        aimPoint: ray.end,
        targetPoint: liveTargetPoint,
        target: {
          id: target.actor?.id ?? (target.isPlayer ? 'player' : target.node?.name),
          actor: target.actor ?? null,
          point: liveTargetPoint,
          visible: targetVisible,
        },
        targetVisible,
        attacker: entry.actor,
        damage: pelletDamage,
        accuracy: chance,
        areaFire,
        colliders: ctx.colliders,
        matrix: factionMatrix,
        playerShot: false,
      });
      resolvedPellets.push(resolved);
      if (resolved.result?.applied) {
        remainingCap = Math.max(0, remainingCap - Math.max(0, resolved.result.raw ?? 0));
      }
      pelletRecords.push(Object.freeze({
        index: ray.index,
        fired: resolved.fired,
        reason: resolved.reason,
        origin: frozenShotVector(resolved.origin ?? ray.origin),
        direction: frozenShotVector(resolved.direction ?? ray.direction),
        boreDirection: frozenShotVector(resolved.boreDirection ?? ray.direction),
        end: frozenShotVector(resolved.end ?? ray.end),
        blocked: resolved.blocked,
        blocker: frozenShotBlocker(resolved.blocker),
        hit: resolved.hit,
        nearMiss: resolved.nearMiss,
        whiz: resolved.whiz,
        missDistance: resolved.missDistance,
        damage: resolved.damage,
        fatal: resolved.fatal,
        result: resolved.result,
        target: target.actor?.id ?? (target.isPlayer ? 'player' : target.node?.name ?? null),
        targetIsPlayer: target.isPlayer === true,
        material: resolved.hit ? 'flesh' : (resolved.blocker?.material ?? 'air'),
      }));
    }
    const pellets = Object.freeze(pelletRecords);
    weaponEvent(entry, 'shot', {
      projectiles: projectileCount,
      rounds: entry.weapon.rounds,
      pellets,
    });
    /* The local aim gate admitted the trigger. This second gate samples every
     * actual pellet bore and therefore remains authoritative. */
    const firedPellets = resolvedPellets.filter((resolved) => resolved.fired);
    if (!firedPellets.length) return null;
    const resolved = firedPellets[0];

    /* Tracer, flash and noise happen whatever the round did. */
    entry.roundsFired++;
    if ((entry.roundsFired % (catalogue?.tracer?.every ?? 3)) === 0) {
      tracers.fire({
        from: resolved.origin,
        to: resolved.end,
        speed: catalogue?.tracer?.speed ?? 700,
        colour: catalogue?.tracer?.colour ?? 0xfff0a0,
        width: (catalogue?.tracer?.width ?? 0.012) * 2.4,
      });
    }
    if (lightAllowed) {
      flash.position.copy(resolved.origin);
      flash.intensity = entry.plan.weapon === 'saw' ? 5 : 3.4;
      flash.visible = true;
      flashTimer = 0.045;
    }
    playWeaponCue(ctx.audio, entry.plan.weapon, 'fire', {
      position: resolved.origin, volume: 0.6, ref: 3, maxDist: 60,
    });

    /* The near miss. Rail suppression is an explicit area-fire behaviour;
     * ordinary shooters only get here after having really seen the player. */
    const misses = firedPellets.filter((pellet) => !pellet.hit);
    if (target.isPlayer && misses.length) {
      const model = target.suppression ?? ctx.player?.suppression ?? null;
      const nearestMiss = misses.reduce(
        (nearest, pellet) => Math.min(nearest, pellet.missDistance), Infinity,
      );
      model?.noteNearMiss?.(nearestMiss, Math.max(0.25, 1 - distance / 50));
      /* Existing cue, one voice for the whole pool. Eligibility and the
       * checkpoint-safe shared cooldown come from CombatFireControl. */
      const whiz = misses.find((pellet) => pellet.whiz);
      if (whiz && Number.isFinite(model?.value)) {
        ctx.audio?.play?.('heist.bullet.whiz', {
          position: whiz.end, volume: 0.3, ref: 2, maxDist: 24,
        });
      }
    }

    const appliedResults = firedPellets
      .map((pellet) => pellet.result)
      .filter((result) => result?.applied);
    const firstResult = appliedResults[0] ?? null;
    const lastResult = appliedResults.at(-1) ?? null;
    const result = firstResult ? Object.freeze({
      applied: true,
      raw: appliedResults.reduce((sum, item) => sum + (item.raw ?? 0), 0),
      damage: appliedResults.reduce((sum, item) => sum + (item.damage ?? 0), 0),
      absorbed: appliedResults.reduce((sum, item) => sum + (item.absorbed ?? 0), 0),
      armorBefore: firstResult.armorBefore,
      armorAfter: lastResult.armorAfter,
      armorBroken: appliedResults.some((item) => item.armorBroken === true),
      healthBefore: firstResult.healthBefore,
      healthAfter: lastResult.healthAfter,
      fatal: appliedResults.some((item) => item.fatal === true),
    }) : null;
    if (result?.applied && target.isPlayer) {
      ctx.onPlayerHit?.({
        damage: result.damage,
        absorbed: result.absorbed ?? 0,
        armorBefore: result.armorBefore,
        armorAfter: result.armorAfter,
        armorBroken: result.armorBroken === true,
        fatal: result.fatal === true,
        weapon: entry.plan.weapon,
        zone: 'chest',
        from: entry.id,
        fromPosition: entry.root.getWorldPosition(new THREE.Vector3()),
      });
    }
    if (result?.fatal && !target.isPlayer && target.node?.userData?.onDown) {
      target.node.userData.onDown(result);
    }

    /* Where it stopped, for whoever owns the decals. The point is on the
     * line at the distance the resolver stopped at, and the normal is the
     * way the round came -- which is what a hole in a wall wants. */
    if (ctx.onImpact) {
      for (const [pelletIndex, pellet] of firedPellets.entries()) {
        if (!pellet.blocked && !pellet.hit) continue;
        ctx.onImpact({
          point: pellet.end.clone(),
          normal: pellet.direction.clone().negate(),
          material: pellet.hit ? 'flesh' : (pellet.blocker?.material ?? 'concrete'),
          actor: pellet.hit ? (target.actor ?? null) : null,
          object: pellet.hit ? (target.node ?? null) : (pellet.blocker?.box ?? null),
          from: pellet.origin.clone(),
          pelletIndex,
        });
      }
    }

    entry.lastShot = {
      distance,
      blocked: firedPellets.some((pellet) => pellet.blocked),
      onTarget: firedPellets.some((pellet) => pellet.hit),
      damage: result?.damage ?? 0,
      aimError: entry.aimError,
      boreError: resolved.boreError,
      origin: resolved.origin.clone(),
      end: resolved.end.clone(),
      areaFire,
      projectiles: projectileCount,
      pellets,
    };
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

  /** Preserve the entry diagnostics while shared perception owns the state. */
  function mirrorPerception(entry) {
    const perception = entry.perception;
    entry.target = perception.target;
    entry.targetVisible = perception.targetVisible;
    entry.memory = perception.memory;
    entry.awareness = perception.awareness;
    if (perception.lastSeen) entry.lastSeen.copy(perception.lastSeen);
    else entry.lastSeen.set(0, 0, 0);
    if (perception.targetVisible) entry.targetDistance = perception.distance;
  }

  function resetPerception(entry, awareness = 0) {
    entry.perception.restore({ awareness, memory: 0, lastSeen: null });
    mirrorPerception(entry);
    entry.targetDistance = Infinity;
  }

  function reportBreach(entry, opening, ctx) {
    if (!opening || entry.breached) return false;
    entry.breached = true;
    const breach = {
      id: entry.id,
      staging: entry.staging.id,
      opening: opening.id,
      x: opening.x,
      y: entry.root.position.y,
      z: opening.z,
    };
    breaches.push(breach);
    ctx.onBreach?.(breach);
    return true;
  }

  function think(entry, ctx, targets) {
    if (entry.actor.incapacitated) return;

    /* Who. Acquisition requires a clean eye line. Range alone used to assign
     * the live player object, so an attacker behind a wall rotated with every
     * hidden player movement even though `fireRound` later stopped the bullet.
     * The wall prevented damage but not x-ray knowledge. */
    _from.copy(entry.root.position);
    _from.y += entry.muzzleHeight;
    _viewForward.set(
      Math.sin(entry.root.rotation.y),
      0,
      Math.cos(entry.root.rotation.y),
    );
    /* Tests and diagnostics have long been allowed to seed awareness through
     * the public entry field, so accept that value before the shared scan. */
    const awarenessBefore = Math.max(0, Math.min(1, Number(entry.awareness) || 0));
    entry.perception.awareness = awarenessBefore;
    const best = entry.perception.scan({
      origin: _from,
      forward: _viewForward,
      candidates: targets,
      boxes: ctx.colliders,
      range: entry.role.range + 14,
    });
    mirrorPerception(entry);

    if (best) {
      entry.targetDistance = best.distance;
      entry.aimPoint.copy(best.point);
      entry.areaTarget = null;
    } else {
      entry.areaTarget = null;

      /* The occupied firing step is the authored exception: attackers put
       * rounds into its fixed centre even when the rail hides the player.
       * Pin/support roles keep doing so beyond ordinary rifle range. The
       * target contains no actor by construction, so area fire cannot become
       * wall-penetrating damage if cover changes between think and fire. */
      const hiddenPlayer = targets.find((target) => target.isPlayer);
      if (hiddenPlayer && onLanding(hiddenPlayer.position)) {
        entry.areaTarget = {
          actor: null,
          position: entry.areaAimPoint,
          isPlayer: true,
          node: null,
          suppression: hiddenPlayer.suppression,
          eye: 0,
          areaFire: true,
        };
        entry.aimPoint.copy(entry.areaAimPoint);
        entry.targetDistance = _from.distanceTo(entry.aimPoint);
        /* Area suppression is the authored exception to ordinary sight. It
         * keeps the old memory-floor behaviour without creating a live actor
         * inside CombatPerception. */
        entry.perception.awareness = Math.max(0.7, awarenessBefore - 0.04);
        entry.awareness = entry.perception.awareness;
      } else if (entry.memory > 0 && entry.lastSeen.lengthSq() > 0) {
        entry.aimPoint.copy(entry.lastSeen);
        entry.targetDistance = _from.distanceTo(entry.lastSeen);
      } else {
        entry.targetDistance = Infinity;
      }
    }

    /* Where. Path first, then his role's fight. */
    if (entry.path.length) {
      const next = entry.path[0];
      aimGoalAt(entry, next.x, next.z);
      return;
    }

    entry.holding = true;
    /* THE LAST MEN COME TO YOU.
     *
     * Owner, playtest 2026-08-13: *"four attacks left cant find them"*. The
     * roles that hold a standoff -- the suppressor set up on the door line at
     * 28 m, the gunner at 26, a leader holding his doorway -- are correct
     * tactics for a full wave and a hide-and-seek ending for its remnant: the
     * gallery has no window onto the forecourt, so a man holding position out
     * on the drive is invisible, inaudible and unfindable from the firing
     * step. When the scene says the wave is nearly done (`ctx.hunt`), every
     * wave attacker still standing drops his standoff and pushes at the
     * player -- which also makes him AUDIBLE: walking men emit real footsteps
     * through CombatStepCadence and closing men open fire. */
    const hunted = ctx.hunt === true && !!entry.order.wave;
    const huntTarget = hunted
      ? targets.find((target) => target.isPlayer) ?? null
      : null;
    /* A remembered point is a place to investigate, never a live actor. */
    const tacticalTarget = huntTarget ?? entry.target ?? (
      entry.memory > 0 && entry.lastSeen.lengthSq() > 0
        ? { position: entry.lastSeen }
        : null
    );
    if (!tacticalTarget) {
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
    const climbGap = tacticalTarget.position.y - entry.root.position.y;
    /* A hunted man climbs whatever his role says: `climbs: false` is how the
     * pin/support roles hold their standoff, and the standoff is the thing
     * the hunt exists to cancel. He also re-plans more eagerly. */
    if ((entry.plan.climbs || hunted) && Math.abs(climbGap) > 2
        && entry.sinceReplan > (hunted ? 2.5 : 4)) {
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

    if (hunted) {
      /* No standoff, no cover clock, no patience: walk at the man. The
       * geometric distance is used rather than `targetDistance` because a
       * hunted player may be out of sight -- that is the whole problem. */
      const planarGap = Math.hypot(
        tacticalTarget.position.x - entry.root.position.x,
        tacticalTarget.position.z - entry.root.position.z,
      );
      if (planarGap > 3.2) at(tacticalTarget); else hold();
      return;
    }

    if (tactic === 'rush' || tactic === 'close') {
      /* Straight at him. No cover, no repositioning, no patience. */
      if (distance > wants) at(tacticalTarget); else hold();
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
      if (distance > wants + 4) at(tacticalTarget); else hold();
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
        identityBark(entry);
        return;
      }
    }
    if (distance > wants) at(tacticalTarget); else hold();
  }

  /**
   * Some authored encounters exist before the player can see them, but must
   * still be standing at their authored reveal positions when he arrives.
   * This is a one-way gate: after genuine contact, a trip back downstairs can
   * never reset the fight or make an attacker freeze in place.
   */
  function releaseAuthoredHold(entry, ctx) {
    if (entry.holdReleased) return true;
    if (entry.order.holdUntil !== HOLD_UNTIL_PLAYER_GROUND_FLOOR) {
      entry.holdReleased = true;
      return true;
    }
    const eyeY = Number(ctx.player?.position?.y);
    if (!Number.isFinite(eyeY) || eyeY < GROUND_FLOOR_REVEAL_EYE_Y) return false;
    entry.holdReleased = true;
    return true;
  }

  function angleDelta(wanted, current) {
    let delta = wanted - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  /** Move, turn, fire, and stay in the house. */
  function act(entry, dt, ctx) {
    if (entry.actor.incapacitated) return;
    const position = entry.root.position;

    /* The glass must be gone before the leading capsule reaches its plane.
     * `breaks` lives on the first inside waypoint, so it is already the exact
     * opening/point computed by the nav graph.  Report it on approach instead
     * of when that waypoint is accepted after the crossing. */
    const approaching = entry.path[0];
    if (approaching?.breaks && !entry.breached
        && Math.hypot(
          position.x - approaching.breaks.x,
          position.z - approaching.breaks.z,
        ) <= BREACH_TRIGGER_DISTANCE) {
      reportBreach(entry, approaching.breaks, ctx);
    }

    /* --- move --- */
    _step.copy(entry.goal).sub(position);
    _step.y = 0;
    const planar = _step.length();
    /* THE REMNANT JOGS. A hunted man (see `think`) has dropped his standoff
     * and is walking at the player -- but the roles that hold standoffs are
     * the slow ones (the suppressor at 1.2 m/s, the gunner at 1.4), and a
     * suppressor ambling in from 28 m at walking pace is a hunt the player
     * spends twenty-five seconds waiting for, at a footstep volume he cannot
     * hear over the alarm. So the hunt floors the pace at a jog: fast enough
     * to be a push, and -- because the step event below grades gait and
     * intensity off `speed` -- loud enough to be the audible tell the hunt
     * exists to give ("four attacks left cant find them"). Suppression and
     * a wounded leg still slow him; they just slow him from a jog. */
    const hunted = ctx.hunt === true && !!entry.order?.wave;
    entry.hunting = hunted;
    const speed = (hunted ? Math.max(entry.plan.speed, HUNT_SPEED) : entry.plan.speed)
      * (1 - entry.suppression.value * 0.45)
      * entry.impairments.speedScale;
    /* Some authored choke-point anchors require a 25 cm arrival. The old
     * 35 cm movement cutoff stopped a man ten centimetres short forever;
     * movement owns a numerical epsilon while the waypoint owns arrival. */
    const wantsMove = planar > 0.02;
    const beforeX = position.x;
    const beforeY = position.y;
    const beforeZ = position.z;
    if (wantsMove) {
      _step.multiplyScalar(Math.min(1, (speed * dt) / planar));
      SIEGE_COMBAT_SPACE.move(position, _step, {
        boxes: ctx.colliders,
        /* The authored clamp below owns pulledBack diagnostics. */
        bounds: null,
      });
    }
    const separation = SIEGE_COMBAT_SPACE.separate(entry, entries.values(), {
      boxes: ctx.colliders,
      bounds: null,
      positionOf: attackerPosition,
      idOf: attackerId,
      eligible: livingAttacker,
    });
    const movedDistance = Math.hypot(position.x - beforeX, position.z - beforeZ);
    entry.moving = movedDistance > 1e-4;
    const congested = separation.overlaps > 0;
    entry.blocked = wantsMove && !congested
      && movedDistance < Math.min(0.02, speed * dt * 0.2);
    if (congested) navigator.congested(entry.id);
    else if (entry.moving) navigator.moving(entry.id);
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
    const supportY = walkableSupportY(entry);
    if (supportY == null) {
      position.y += (wantedY - position.y) * Math.min(1, dt * 3.5);
    } else {
      /* A staircase is six/24 discrete boxes, not a ramp. Easing Y makes the
       * rendered shoes spend every rise inside the next tread. The figure's
       * spawn-time foot offset is stable while standing, so snap that visible
       * foot to the real authored surface and keep route Y only as fallback
       * for headless/no-geometry callers. */
      position.y = supportY - (entry.supportOffset ?? 0);
    }

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
      const authoredSlack = next.arrival ?? (entry.path.length > 1 ? 1.1 : 0.5);
      /* A transit mark is not a parking space. At a tight turn, live bodies
       * settle one configured separation apart; requiring all of them to put
       * their roots within a smaller authored radius creates a stable queue
       * around the mark. Let only a peer-congested, non-final traveller hand
       * off inside one body spacing. Final destinations and wall blockage keep
       * their authored arrival contract. */
      const slack = congested && entry.path.length > 1
        ? Math.max(authoredSlack, AGENT_SEPARATION)
        : authoredSlack;
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
        reportBreach(entry, next.breaks, ctx);
      }
    }

    if (entry.moving && !entry.actor.incapacitated) {
      const from = new THREE.Vector3(beforeX, beforeY, beforeZ);
      const to = position.clone();
      ctx.onStep?.(entry, {
        id: entry.id,
        position: to.clone(),
        from,
        to,
        moving: true,
        gait: speed > 2.25 ? 'run' : 'walk',
        surface: stepSurface(position),
        intensity: Math.max(0.45, Math.min(1.25, speed / 2.4)),
      });
    }

    /* --- turn --- */
    const hasAim = entry.targetVisible || entry.areaTarget || entry.memory > 0;
    const facing = hasAim ? entry.aimPoint : entry.goal;
    /* Walking direction is authored navigation, not combat aim. Once a real
     * aim point exists, the shared Module owns both root turn and pitch. */
    if (!hasAim) {
      const dx = facing.x - position.x;
      const dz = facing.z - position.z;
      if (Math.hypot(dx, dz) > 1e-5) {
        const walkingYaw = Math.atan2(dx, dz);
        entry.root.rotation.y += angleDelta(walkingYaw, entry.root.rotation.y)
          * Math.min(1, dt * 6);
      }
    }
    entry.aimFrame = entry.weaponAim.update(dt, {
      root: entry.root,
      weaponModel: entry.gun,
      weaponController: entry.weapon,
      targetPoint: hasAim ? facing : null,
      muzzleHeight: entry.muzzleHeight,
      settleScale: entry.impairments.aimSettleScale,
      interrupted: entry.impairments.interrupted,
      /* Mansion rig Adapter: body pose is applied after shared yaw/pitch and
       * before the shared Module samples and steers the visible catalog bore. */
      pose: (frame) => {
        entry.figure.parts.head.rotation.x = -frame.pitch * 0.45;
        entry.figure.parts.head.rotation.y = frame.hasTarget
          ? Math.max(-0.65, Math.min(0.65, angleDelta(frame.desiredYaw, frame.yaw)))
          : 0;
        if (entry.gun?.userData?.siegeAimArmR) {
          entry.figure.parts.armR.quaternion.copy(entry.gun.userData.siegeAimArmR);
        }
        if (entry.gun && (!frame.hasTarget || frame.interrupted)) {
          /* The mount's roll, not zero. `Euler.set(x, 0, PI)` is XYZ order, so
           * the roll happens about the model's own bore first and only the
           * gun's UP changes -- see armed-pose.js on holding it upside down. */
          entry.gun.rotation.set(
            -Math.PI / 2 - frame.pitch * 0.2, 0, SIEGE_WEAPON_MOUNT_ROLL,
          );
        }
        if (frame.interrupted) {
          const reaction = entry.impairments.reaction;
          /* The contact-tested long-gun shoulder already carries yaw and
           * roll; the old generic-pose offsets doubled into a corkscrew when
           * applied on top of it. Keep the readable knock while staying near
           * the authored brace the weapon returns to. */
          entry.figure.parts.armR.rotation.x += reaction * 0.24;
          entry.figure.parts.armR.rotation.z += reaction * 0.1;
          entry.figure.parts.armL.rotation.x += reaction * 0.34;
          if (entry.gun) entry.gun.rotation.x += reaction * 0.22;
        }
      },
    });
    /* CombatWeaponAim has now steered the catalog model to its final rendered
     * bore for this frame. Correct only the independent support arm afterward;
     * re-running the authored mount would reset the gun and falsify the shot. */
    if (!entry.impairments.interrupted) {
      trackSiegeWeaponSupport(entry.figure, entry.gun, { aimFrame: entry.aimFrame });
    }

    /* --- reload, always --- */
    for (const event of entry.weapon.update(dt)) {
      if (event.type === 'loaded') {
        weaponEvent(entry, 'loaded', { rounds: event.rounds, loaded: event.loaded });
        playWeaponCue(ctx.audio, entry.plan.weapon, 'reload.in', { position, volume: 0.35 });
      } else if (event.type === 'cycle') {
        weaponEvent(entry, 'cycle', event);
        playWeaponCue(ctx.audio, entry.plan.weapon, 'cycle', { position, volume: 0.38 });
      }
    }
    entry.suppression.update(dt);
    entry.perception.tick(dt);
    mirrorPerception(entry);
    if (!entry.targetVisible && entry.memory <= 0 && !entry.areaTarget) {
      entry.targetDistance = Infinity;
    }
    entry.impairments.update(dt);
    entry.sinceMove += dt;
    entry.sinceReplan += dt;

    /* --- stuck --- *
     * A man on a route who is not moving is either shooting from where he is
     * or grinding against something. `SquadDirector.noteBlocked` is the
     * heist's own 2.5 s patience and its own offscreen-only rule, reused
     * rather than re-timed here; it hands back an anchor outside the house
     * for the one case a route cannot recover from itself. */
    if (entry.path.length && entry.blocked) {
      const recovery = navigator.blocked(entry.id, dt);
      if (recovery.recover && recovery.anchor) {
        const point = laneWaypoints([entry.anchor ?? recovery.anchor, recovery.anchor], {
          from: position, laneT: entry.laneT, kindFor: kindForAnchor,
        }).slice(1);
        if (point.length) { entry.path = point; entry.recovered++; }
      }
    }

    /* --- fire --- */
    const fireTarget = entry.targetVisible ? entry.target : entry.areaTarget;
    if (!fireTarget || entry.awareness < 0.7 || entry.impairments.interrupted) return;
    if (entry.suppression.value > 0.82) {
      if (!entry.saidPinned) { bark(entry, 'pinned'); entry.saidPinned = true; }
      return;
    }
    entry.saidPinned = false;
    const inRange = entry.targetDistance <= entry.role.range + 6;
    const pinning = entry.plan.pinsLanding
      && (fireTarget.areaFire === true || onLanding(fireTarget.position));
    if (!inRange && !pinning) return;
    if (!entry.aimAligned) return;
    /* Aggression buys trigger time: 1.0 fires as fast as the burst allows,
     * 0.3 waits between bursts. Straight off the role table in waves.js. */
    const canFire = entry.weapon.reloading <= 0 && entry.weapon.cooldown <= 0;
    if (entry.burst.update(dt, canFire && Math.random() < 0.25 + entry.role.aggression * 0.75)) {
      if (!entry.saidContact) {
        bark(entry, entry.plan.pinsLanding ? 'suppress' : 'contact');
        identityBark(entry);
        entry.saidContact = true;
      }
      fireRound(entry, fireTarget, ctx);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Down                                                              */
  /* ---------------------------------------------------------------- */

  const supportRay = new THREE.Raycaster();
  const supportOrigin = new THREE.Vector3();
  const supportDirection = new THREE.Vector3(0, -1, 0);
  const supportNormal = new THREE.Vector3();
  const supportMeshes = [];
  const supportBuckets = new Map();
  const supportBounds = new THREE.Box3();
  const SUPPORT_CELL = 2;

  let supportMeshesReady = false;

  const supportBucketKey = (x, z) => `${Math.floor(x / SUPPORT_CELL)},${Math.floor(z / SUPPORT_CELL)}`;

  function collectWalkableSupportMeshes() {
    if (supportMeshesReady || !scene?.traverse || !scene?.updateMatrixWorld) return;
    /* Mansion architecture is static. Resolve its world matrices and spatial
     * index once; doing a forced full-scene matrix walk for every attacker
     * was 22 whole mansion traversals per rendered frame. */
    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!object.isMesh || object.visible === false
          || object.userData?.siegeWalkableSupport !== true) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some((material) => material?.visible !== false
          && (material?.transparent !== true || material.opacity > 0.001))) return;
      supportMeshes.push(object);
      supportBounds.setFromObject(object);
      const x0 = Math.floor((supportBounds.min.x - 1e-6) / SUPPORT_CELL);
      const x1 = Math.floor((supportBounds.max.x + 1e-6) / SUPPORT_CELL);
      const z0 = Math.floor((supportBounds.min.z - 1e-6) / SUPPORT_CELL);
      const z1 = Math.floor((supportBounds.max.z + 1e-6) / SUPPORT_CELL);
      for (let ix = x0; ix <= x1; ix += 1) {
        for (let iz = z0; iz <= z1; iz += 1) {
          const key = `${ix},${iz}`;
          const bucket = supportBuckets.get(key) ?? [];
          if (!supportBuckets.has(key)) supportBuckets.set(key, bucket);
          bucket.push(object);
        }
      }
    });
    supportMeshesReady = true;
  }

  /** Resolve the authored walkable surface under the actor's current feet.
   * The mansion's route datum is deliberately not a floor mesh: drive pavers
   * are +50 mm, front/horse-shoe treads are discrete, indoor finishes are
   * +20/22 mm and lawns/portico use the datum. Only builders may apply the
   * support tag: accepting every visible horizontal mesh also accepts blood,
   * bodies, furniture and VFX. */
  function walkableSupportY(entry) {
    const position = entry.root.position;
    collectWalkableSupportMeshes();
    if (!supportMeshes.length) return null;
    const candidates = supportBuckets.get(supportBucketKey(position.x, position.z)) ?? [];
    if (!candidates.length) return null;
    supportOrigin.set(position.x, position.y + 0.3, position.z);
    supportRay.set(supportOrigin, supportDirection);
    supportRay.near = 0;
    supportRay.far = 1;
    for (const hit of supportRay.intersectObjects(candidates, false)) {
      if (hit.point.y > position.y + 0.205 || hit.point.y < position.y - 0.5) continue;
      if (!hit.face) continue;
      const material = Array.isArray(hit.object.material)
        ? hit.object.material[hit.face.materialIndex]
        : hit.object.material;
      if (material?.visible === false
          || (material?.transparent === true && !(material.opacity > 0.001))) continue;
      supportNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (supportNormal.y >= 0.75) return hit.point.y;
    }
    return null;
  }

  /** Run one pose measurement without letting the hand-mounted weapon enter
   * Box3, then restore the exact pooled parent/index/local transform. */
  function withoutMountedWeapon(entry, work, visibleAfter = entry.gun?.visible === true) {
    const gun = entry.gun;
    const gunParent = gun?.parent ?? null;
    const gunIndex = gunParent?.children.indexOf(gun) ?? -1;
    const gunPosition = gun?.position.clone() ?? null;
    const gunQuaternion = gun?.quaternion.clone() ?? null;
    const gunScale = gun?.scale.clone() ?? null;
    if (gun) gun.visible = false;
    if (gunParent) gunParent.remove(gun);
    try {
      return work();
    } finally {
      if (gunParent) {
        gunParent.add(gun);
        if (gunIndex >= 0 && gunIndex < gunParent.children.length - 1) {
          gunParent.children.splice(gunParent.children.indexOf(gun), 1);
          gunParent.children.splice(gunIndex, 0, gun);
        }
      }
      if (gun) {
        gun.position.copy(gunPosition);
        gun.quaternion.copy(gunQuaternion);
        gun.scale.copy(gunScale);
        gun.visible = visibleAfter;
      }
    }
  }

  /**
   * He is out of the fight.
   *
   * `reported` is a Set rather than a flag on the entry so that a checkpoint
   * restore cannot produce a second `onDown` for a man who was already down
   * when the checkpoint was taken -- the wave director counts these, and a
   * double count clears a wave that still has four men in it.
   */
  function markDown(entry, { silent = false, direction = null } = {}) {
    /* HE FALLS ON THE FLOOR HE IS STANDING ON.
     *
     * `HeistFigure.fallen()` settles the posed body by measuring its lowest
     * WORLD point against `figure.baseY` -- which was the staging zone's
     * floor when he was built. A man who came in off the forecourt at y 0 and
     * died on the gallery at y 6 would settle six metres below the landing,
     * which is a body in the foyer ceiling. One line, and it has to be here
     * rather than at spawn because the whole point is that he moved. */
    const floorY = walkableSupportY(entry) ?? entry.root.position.y;
    let roll = Math.random() > 0.5 ? 0.62 : -0.58;
    if (direction?.isVector3 && direction.lengthSq() > 1e-12) {
      const localDirection = direction.clone().normalize().applyQuaternion(
        entry.root.getWorldQuaternion(new THREE.Quaternion()).invert(),
      );
      /* A positive local x impulse topples the upright rig toward +x, which
       * is a negative z roll in THREE's right-handed convention. */
      if (Math.abs(localDirection.x) > 0.08) {
        roll = localDirection.x > 0 ? -0.62 : 0.62;
      }
    }
    /* Box3.setFromObject includes invisible descendants. Hiding the catalog
     * model after the pose therefore grounds the weapon and leaves the
     * rendered body 39..382 mm in the air. Detach only for the pose measure,
     * then restore the exact pooled hand mount while keeping it hidden. */
    withoutMountedWeapon(entry, () => {
      entry.figure.baseY = floorY;
      /* Flat, not fallen()'s propped incline -- see ./fallen.js on "float
       * like a foot above the ground". The entry index varies the limbs so a
       * cleared wave is not eight copies of one corpse. A live kill falls
       * through the short shared blend; a checkpoint restore (`silent`)
       * snaps, because that fall happened before the checkpoint. */
      const pose = () => siegeFallenPose(entry.figure, { roll, variant: entry.index ?? 0 });
      if (silent) {
        entry.figure._poseFrom = null;
        pose();
      } else {
        blendSiegeFall(entry.figure, pose, { duration: 0.4 });
      }
    }, false);
    entry.root.userData.down = true;
    resetPerception(entry, entry.awareness);
    entry.areaTarget = null;
    entry.aimAligned = false;
    entry.aimFrame = null;
    entry.weapon?.setAimed?.(false);
    entry.path.length = 0;
    /* HIS PLACE ON THE LANDING GOES BACK IN THE POOL. Without this the man
     * behind him is told the gallery is full and stops on the flight, and by
     * the end of wave two the whole landing is reserved by corpses. */
    navigator.release(entry.id);
    if (reported.has(entry.id)) return false;
    reported.add(entry.id);
    if (!silent) {
      bark(entry, 'down');
      identityBarkForCasualty(entry);
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

  function hitPartFor(object) {
    let node = object;
    while (node) {
      if (node.userData?.hitPart) return node.userData.hitPart;
      node = node.parent;
    }
    return zoneFor(object) === 'limb' ? 'limb' : zoneFor(object);
  }

  /** The tagged, uniformly-scaled body group above the raycast mesh. */
  function hitAnchorFor(object) {
    let node = object;
    while (node) {
      if (node.userData?.hitZone) return node;
      if (node.userData?.combatActor) break;
      node = node.parent;
    }
    return null;
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
        perception: new CombatPerception({
          range: order.role.range + 14,
          fov: VISION_FOV_RADIANS,
          memorySeconds: LOS_MEMORY_SECONDS,
          awareness: 0.55,
          score: perceptionScore,
          space: SIEGE_COMBAT_SPACE,
        }),
        impairments: new CombatImpairments(),
        weaponAim: new CombatWeaponAim({ tolerance: AIM_FIRE_TOLERANCE }),
        aimFrame: null,
        weapon: null,
        armorPresentation: null,
        burst: null,
        goal: new THREE.Vector3(),
        path: [],
        target: null,
        targetVisible: false,
        targetDistance: Infinity,
        aimPoint: new THREE.Vector3(),
        areaAimPoint: new THREE.Vector3(DEFENCE_AIM.x, DEFENCE_AIM.y, DEFENCE_AIM.z),
        lastSeen: new THREE.Vector3(),
        memory: 0,
        areaTarget: null,
        awareness: 0,
        moving: false,
        blocked: false,
        /** True while the wave's remnant hunt has this man pushing at the player. */
        hunting: false,
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
        holdReleased: true,
        /** null means "follow the ground"; a number pins him to a floor. */
        floorY: null,
        /** Visible standing-foot height relative to the navigation root. */
        supportOffset: 0,
        index: entries.size,
        active: false,
      };
      /* CombatImpactResolver deliberately stays presentation-neutral and uses
       * CombatActor's default faction matrix. This tiny actor facade preserves
       * the matrix supplied to this pool without changing the Located result
       * exposed by the Siege compatibility Adapter below. */
      entry.impactActor = {
        get id() { return entry.actor.id; },
        get faction() { return entry.actor.faction; },
        get incapacitated() { return entry.actor.incapacitated; },
        applyHit: (options = {}) => entry.actor.applyHit({
          ...options,
          matrix: factionMatrix,
        }),
      };
      if (entry.actor.maxArmor > 0) {
        entry.armorPresentation = new CombatArmorPresentation({
          body: entry.figure.parts.body,
          actor: entry.actor,
          tier: HEAVY_ARMOR_ROLES.has(order.role.id) ? 'heavy' : 'light',
        });
      }
      exposeSharedCombatState(entry);
      entry.root.userData.combatActor = entry.actor;
      entry.root.userData.combatant = entry;
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
      impactRegistrations.set(entry.root, impactResolver.register(entry.root, {
        actor: () => entry.impactActor,
        combatant: () => entry,
        materialOf: 'flesh',
      }));
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
    /* Canonical Firearm owns rounds, reserve, cooldown, recoil, trigger and
     * reload phase. `magazine` remains a diagnostic mirror only. */
    entry.weapon = npcFirearm(plan.weapon);
    const wantedArmorTier = HEAVY_ARMOR_ROLES.has(order.role.id) ? 'heavy' : 'light';
    if (entry.actor.maxArmor > 0 && entry.armorPresentation?.tier !== wantedArmorTier) {
      entry.armorPresentation?.dispose();
      entry.armorPresentation = new CombatArmorPresentation({
        body: entry.figure.parts.body,
        actor: entry.actor,
        tier: wantedArmorTier,
      });
    } else if (entry.actor.maxArmor <= 0 && entry.armorPresentation) {
      entry.armorPresentation.dispose();
      entry.armorPresentation = null;
    }
    entry.armorPresentation?.restore();
    entry.burst = new BurstController({ ...plan.burst });
    const routed = buildPath(order, plan, order.staging, entry.index);
    entry.path = routed.path;
    entry.destination = routed.destination;
    entry.side = routed.side;
    entry.sharedDestination = routed.shared;
    entry.anchor = order.staging.entry;
    entry.laneT = ((entry.index % 5) - 2) / 2;
    resetPerception(entry, 0.55);
    entry.sinceMove = 0;
    entry.sinceThink = 0;
    entry.sinceReplan = 0;
    entry.replans = 0;
    entry.recovered = 0;
    entry.roundsFired = 0;
    entry.pulledBack = 0;
    entry.breached = false;
    entry.saidContact = false;
    entry.saidPinned = false;
    entry.holding = false;
    entry.areaTarget = null;
    entry.weaponAim.reset();
    entry.aimFrame = null;
    entry.moving = false;
    entry.blocked = false;
    entry.hunting = false;
    entry.lastShot = null;
    entry.holdReleased = !order.holdUntil;
    entry.impairments.reset();
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
    entry.aimPoint.copy(entry.root.position);
    entry.aimPoint.y += entry.muzzleHeight;
    entry.root.visible = true;
    entry.root.userData.down = false;
    /* A pooled body may still be mid-fall from its previous life. */
    entry.figure._poseFrom = null;
    entry.figure.stand();
    /* `stand()` clears the arms; restore the same contact-tested ready pose
     * used at build time whenever this pooled actor is spawned again. */
    if (entry.gun) {
      entry.gun.visible = true;
      braceSiegeWeapon(entry.figure, entry.gun);
    }
    /* Facing the way he is about to walk. */
    entry.root.rotation.y = 0;
    const first = entry.path[0];
    if (first) {
      entry.root.rotation.y = Math.atan2(
        first.x - entry.root.position.x, first.z - entry.root.position.z,
      );
    }
    /* The root follows the route surface, but the generated shoes extend a
     * few millimetres below that origin. Settle the rendered rig, excluding
     * its hand-mounted gun, so a correct root cannot hide feet in a tread. */
    const supportY = walkableSupportY(entry) ?? y;
    withoutMountedWeapon(entry, () => {
      entry.figure.baseY = supportY;
      entry.figure._ground();
    }, true);
    entry.supportOffset = supportY - entry.root.position.y;
    if (!silent) {
      bark(entry, entry.plan.tactic === 'flank' ? 'flank' : 'push');
      identityBark(entry);
    }
    return entry;
  }

  function despawnAll() {
    for (const entry of entries.values()) {
      entry.active = false;
      resetPerception(entry, entry.awareness);
      entry.areaTarget = null;
      entry.aimAligned = false;
      entry.aimFrame = null;
      entry.weapon?.setAimed?.(false);
      entry.path.length = 0;
      entry.root.visible = false;
    }
    navigator.reset();
    navigator.director.blockedFor.clear();
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
  function registerHit(meshOrImpact, damageAmount, penetration = 0.3) {
    const impact = meshOrImpact?.object && !meshOrImpact?.isObject3D
      ? meshOrImpact
      : null;
    const mesh = impact?.object ?? meshOrImpact;
    const owner = actorFor(mesh);
    if (!owner) return [];
    const actor = owner.userData.combatActor;
    const zone = zoneFor(mesh);
    const part = hitPartFor(mesh);
    const anchor = hitAnchorFor(mesh) ?? owner;
    const entry = entryForRoot(owner);
    const baseDamage = impact ? impact.damage : damageAmount;
    const shotPenetration = impact ? (impact.penetration ?? penetration) : penetration;
    const point = impact?.point?.isVector3
      ? impact.point.clone()
      : mesh?.getWorldPosition?.(new THREE.Vector3()) ?? null;
    const normal = impact?.normal?.isVector3 ? impact.normal.clone() : (impact?.normal ?? null);
    const fromSource = impact?.origin ?? impact?.from ?? null;
    const from = fromSource?.isVector3 ? fromSource.clone() : fromSource;
    const direction = impact?.direction?.isVector3
      ? impact.direction.clone()
      : point?.isVector3 && from?.isVector3
        ? point.clone().sub(from).normalize()
        : null;
    const distance = Math.max(0.001, Number(impact?.distance)
      || (point?.isVector3 && from?.isVector3 ? from.distanceTo(point) : 1));
    const located = impactResolver.resolve({
      ...(impact ?? {}),
      point,
      normal,
      origin: from,
      direction,
      distance,
      object: mesh,
      damage: Math.max(0, Number(baseDamage) || 0),
      penetration: shotPenetration,
    }, {
      attacker: { faction: FACTIONS.CREW },
      playerShot: true,
      damage: Math.max(0, Number(baseDamage) || 0),
      damageScale: HIT_ZONES[zone] ?? 1,
      lethalHeadshots: true,
    });
    /* Compatibility Adapter for the Siege's established one-element
     * ballistics return. The Located hit remains authoritative; these aliases
     * keep blood, hit-confirmation and older direct-mesh callers intact. */
    const hit = {
      ...located,
      distance: Math.max(0.001, Number(impact?.distance) || 1),
      actor,
      entry: located.combatant ?? entry,
      root: located.root ?? owner,
      object: located.object ?? mesh,
      material: located.material ?? 'flesh',
      zone: located.zone ?? zone,
      part: located.part ?? part,
      anchor: located.anchor ?? anchor,
      hitAnchor: located.anchor ?? anchor,
      spatterAnchor: located.anchor ?? anchor,
      point: located.point ?? point,
      normal: located.normal ?? normal,
      from: located.origin ?? from,
      weapon: impact?.weapon ?? null,
      floorY: entry?.root.position.y,
      damage: located.applied ? (located.result?.damage ?? 0) : 0,
      stopped: true,
    };
    const resolved = [hit];
    const result = located.result ?? null;
    if (entry && result?.applied) {
      hit.armorBreakPresented = entry.armorPresentation?.applyResult(result) === true;
      /* Hit reaction: a round that does not kill still moves a man. He is
       * knocked off his aim, driven toward cover and made to say so. */
      entry.suppression.noteNearMiss(0.2, 1);
      entry.sinceMove = entry.plan.reposition;
      entry.awareness = 1;
      entry.impairments.applyResolvedHit(located);
      if (result.fatal) markDown(entry, { direction: located.direction });
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
      onWeaponEvent: ctx.onWeaponEvent ?? null,
    };
    const frame = {
      audio: context.audio,
      colliders: ctx.colliders ?? [],
      player: ctx.player ?? null,
      /* The scene raises this when the active wave is nearly done: every
       * wave attacker still standing drops his standoff and pushes at the
       * player. See the note in `think()`. */
      hunt: ctx.hunt === true,
      onBreach: context.onBreach,
      onPlayerHit: context.onPlayerHit,
      onStep: ctx.onStep ?? null,
      onImpact: ctx.onImpact ?? onImpact,
      /* The mission's difficulty knob, and the only one. A scene that wants
       * the raw catalog numbers passes 1. */
      playerDamageScale: Number.isFinite(ctx.playerDamageScale)
        ? Math.max(0, ctx.playerDamageScale)
        : PLAYER_DAMAGE_SCALE,
    };

    tracers.update(step);
    fireControl.update(step);
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
      if (!releaseAuthoredHold(entry, frame)) {
        entry.goal.copy(entry.root.position);
        entry.moving = false;
        entry.blocked = false;
        entry.holding = true;
        entry.weapon?.setAimed?.(false);
        entry.weaponAim.reset();
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

    if (identityBarkClock > 0) identityBarkClock -= step;

    /* THE HUNT IS AUDIBLE. Pushing at the player already buys real footsteps
     * (CombatStepCadence) and gunfire; this adds the voice -- one hunted man
     * every few seconds calling the search, immediately on the first hunted
     * frame so the change of shape is announced, never two at once. */
    if (frame.hunt) {
      huntBarkClock -= step;
      if (huntBarkClock <= 0) {
        const hunter = active.find(
          (entry) => !entry.actor.incapacitated && entry.order.wave,
        );
        if (hunter) {
          bark(hunter, 'hunt');
          huntBarkClock = 6.5;
        }
      }
    } else {
      huntBarkClock = 0;
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
        goal: entry.goal.toArray(),
        path: entry.path.map((p) => ({ ...p })),
        perception: {
          ...entry.perception.snapshot(),
          /* Public diagnostics may deliberately seed these values in tests;
           * keep that long-standing surface authoritative at capture time. */
          awareness: entry.awareness,
          memory: entry.memory,
          lastSeen: entry.lastSeen.lengthSq() > 0 ? entry.lastSeen.toArray() : null,
        },
        awareness: entry.awareness,
        suppression: entry.suppression.value,
        targetVisible: entry.targetVisible,
        targetDistance: Number.isFinite(entry.targetDistance) ? entry.targetDistance : null,
        aimPoint: entry.aimPoint.toArray(),
        lastSeen: entry.lastSeen.lengthSq() > 0 ? entry.lastSeen.toArray() : null,
        memory: entry.memory,
        weaponAim: entry.weaponAim.snapshot(),
        aimPitch: entry.aimPitch,
        desiredAimPitch: entry.desiredAimPitch,
        aimError: Number.isFinite(entry.aimError) ? entry.aimError : null,
        boreError: Number.isFinite(entry.boreError) ? entry.boreError : null,
        impairments: entry.impairments.snapshot(),
        stagger: entry.stagger,
        legWound: entry.legWound,
        armWound: entry.armWound,
        moving: entry.moving,
        blocked: entry.blocked,
        holding: entry.holding,
        sinceMove: entry.sinceMove,
        sinceThink: entry.sinceThink,
        sinceReplan: entry.sinceReplan,
        replans: entry.replans,
        recovered: entry.recovered,
        pulledBack: entry.pulledBack,
        roundsFired: entry.roundsFired,
        burst: {
          remaining: entry.burst.remaining,
          wait: entry.burst.wait,
          sequence: entry.burst.sequence,
        },
        lastShot: entry.lastShot ? {
          ...entry.lastShot,
          origin: entry.lastShot.origin?.toArray?.() ?? entry.lastShot.origin ?? null,
          end: entry.lastShot.end?.toArray?.() ?? entry.lastShot.end ?? null,
        } : null,
        breached: entry.breached,
        floorY: entry.floorY,
        anchor: entry.anchor,
        side: entry.side,
        laneT: entry.laneT,
        destination: entry.destination,
        sharedDestination: entry.sharedDestination,
        saidContact: entry.saidContact,
        saidPinned: entry.saidPinned,
        coverLabel: entry.coverLabel,
        lastBark: entry.lastBark,
        holdReleased: entry.holdReleased,
        blockedFor: navigator.director.blockedFor.get(entry.id) ?? 0,
        reported: reported.has(entry.id),
        down: entry.actor.incapacitated,
      })),
      breaches: breaches.map((b) => ({ ...b })),
      /* WHO HAS RESERVED WHAT. Restoring the men without the occupancy puts
       * every survivor back on his feet and every anchor back in the pool, so
       * the next man to reach the landing is sent to a spot somebody is
       * already standing on. */
      nav: navigator.capture(),
      fireControl: fireControl.snapshot(),
      /* Flat compatibility for checkpoints captured before the shared Module
       * owned this pool-wide timer. */
      whizCooldown: fireControl.whizCooldown,
      flashTimer,
      barkCursor: Object.fromEntries(barkCursor),
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
    barkCursor.clear();
    for (const [key, value] of Object.entries(snap.barkCursor ?? {})) {
      barkCursor.set(key, Math.max(0, Math.round(Number(value) || 0)));
    }
    fireControl.restore(snap.fireControl ?? { whizCooldown: snap.whizCooldown });
    flashTimer = 0;
    identityBarkClock = 0;
    for (const record of snap.breaches ?? []) breaches.push({ ...record });
    for (const record of snap.attackers) {
      const entry = spawn(record.order, { silent: true });
      entry.active = record.active === true;
      entry.actor.restore(record.actor);
      restoreNpcWeapon(entry.weapon, record.weapon);
      entry.armorPresentation?.restore();
      entry.root.position.fromArray(record.position);
      entry.root.rotation.y = Number(record.yaw) || 0;
      if (Array.isArray(record.goal)) entry.goal.fromArray(record.goal);
      else entry.goal.copy(entry.root.position);
      entry.path = (record.path ?? []).map((p) => ({ ...p }));
      entry.perception.restore(record.perception ?? {
        version: 1,
        awareness: record.awareness,
        memory: record.memory,
        lastSeen: record.lastSeen,
      });
      mirrorPerception(entry);
      entry.suppression.value = Number(record.suppression) || 0;
      /* A live object reference is never restored. The remembered world
       * point survives and the next think must prove line of sight again. */
      entry.areaTarget = null;
      entry.targetDistance = record.targetDistance != null
        && Number.isFinite(Number(record.targetDistance))
        ? Math.max(0, Number(record.targetDistance))
        : Infinity;
      if (Array.isArray(record.aimPoint)) entry.aimPoint.fromArray(record.aimPoint);
      entry.weaponAim.restore(record.weaponAim ?? {
        yaw: record.yaw,
        desiredYaw: record.yaw,
        pitch: record.aimPitch,
        desiredPitch: record.desiredAimPitch,
        aimError: record.aimError,
        boreError: record.boreError,
      }, { root: entry.root, weaponController: entry.weapon });
      entry.aimFrame = null;
      entry.impairments.restore(record.impairments ?? {
        stagger: record.stagger,
        legWound: record.legWound,
        armWound: record.armWound,
      });
      entry.moving = record.moving === true;
      entry.blocked = record.blocked === true;
      entry.holding = record.holding === true;
      entry.sinceMove = Math.max(0, Number(record.sinceMove) || 0);
      entry.sinceThink = Math.max(0, Number(record.sinceThink) || 0);
      entry.sinceReplan = Math.max(0, Number(record.sinceReplan) || 0);
      entry.replans = Math.max(0, Math.round(Number(record.replans) || 0));
      entry.recovered = Math.max(0, Math.round(Number(record.recovered) || 0));
      entry.pulledBack = Math.max(0, Math.round(Number(record.pulledBack) || 0));
      entry.roundsFired = Math.max(0, Math.round(record.roundsFired ?? 0));
      entry.burst.remaining = Math.max(0, Math.round(Number(record.burst?.remaining) || 0));
      entry.burst.wait = Math.max(0, Number(record.burst?.wait) || 0);
      entry.burst.sequence = Math.max(0, Math.round(Number(record.burst?.sequence) || 0));
      entry.lastShot = record.lastShot ? {
        ...record.lastShot,
        origin: Array.isArray(record.lastShot.origin)
          ? new THREE.Vector3().fromArray(record.lastShot.origin)
          : null,
        end: Array.isArray(record.lastShot.end)
          ? new THREE.Vector3().fromArray(record.lastShot.end)
          : null,
      } : null;
      entry.breached = record.breached === true;
      entry.floorY = record.floorY == null ? null : Number(record.floorY);
      entry.anchor = record.anchor ?? entry.anchor;
      entry.side = record.side ?? entry.side;
      entry.laneT = Number.isFinite(Number(record.laneT)) ? Number(record.laneT) : entry.laneT;
      entry.destination = record.destination ?? entry.destination;
      entry.sharedDestination = record.sharedDestination === true;
      entry.saidContact = record.saidContact === true;
      entry.saidPinned = record.saidPinned === true;
      entry.coverLabel = record.coverLabel ?? null;
      entry.lastBark = record.lastBark ?? null;
      /* Snapshots made before authored holds existed have no flag. Keep an
       * actor who is still at his staging point held; an already-moving legacy
       * actor remains released. In either case the real player crossing the
       * ground-floor threshold releases him on the next update. */
      if (typeof record.holdReleased === 'boolean') {
        entry.holdReleased = record.holdReleased;
      } else if (!entry.order.holdUntil) {
        entry.holdReleased = true;
      } else {
        const [x, , z] = Array.isArray(record.position) ? record.position : [];
        entry.holdReleased = Number.isFinite(x) && Number.isFinite(z)
          && Math.hypot(x - entry.staging.x, z - entry.staging.z) > 0.35;
      }
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
    navigator.director.blockedFor.clear();
    for (const record of snap.attackers) {
      const elapsed = Math.max(0, Number(record.blockedFor) || 0);
      if (elapsed > 0) navigator.director.blockedFor.set(record.id, elapsed);
    }
    return true;
  }

  function dispose() {
    despawnAll();
    for (const entry of entries.values()) entry.armorPresentation?.dispose();
    for (const unregister of impactRegistrations.values()) unregister();
    impactRegistrations.clear();
    tracers.dispose();
    flash.parent?.remove(flash);
    root.parent?.remove(root);
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
    dispose,

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
    impactResolver,
    fireControl,
    /**
     * The pool's one muzzle-flash light, `visible = false` until a shot.
     * Exposed so the scene's boot prewarm (src/core/prewarm.js) can draw the
     * one-more-visible-point-light state the first cartel shot creates while
     * the menu is still up, instead of compiling every material's new program
     * mid-firefight. Revealing it warms programs only; play state is owned
     * here and stays untouched.
     */
    muzzleFlash: flash,
  };
}
