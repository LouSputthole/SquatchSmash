/**
 * EVERYONE STILL ALIVE IN LOU'S HOUSE, ARMED.
 *
 * From the brief, PART V: *"Everyone still alive is armed. This is the shot
 * that says the whole family is in it."* Sixteen people in the fight --
 * twelve of the Family, three of Lou's security, and the wounded man Gratin
 * is working on -- plus Captain Lou Sasole, who is not in the building until
 * the shooting stops, because his whole job in this mission is what happens
 * next. Seventeen bodies, six rooms.
 *
 * ## THIS IS THE SAME CAST, NOT A SECOND ONE
 *
 * Every body below is `src/core/wardrobe.js`'s canonical model for that
 * person, spread, with the same `assets/faces/` photograph
 * `src/mansion/cast.js` already paints on him. Nothing here restates a
 * height, a build or a garment, and nobody in this file is a new-looking
 * person: the man on the gallery rail with a rifle is visibly the man who was
 * leaning on the billiard table an hour ago.
 *
 * The rig is `HeistFigure` -- root / tilt / person -- because it is the one
 * pose rig in the project that already knows how to put a body on the floor
 * without burying a third of it in the marble, and a defensive line needs
 * kneeling, aiming and fallen.
 *
 * ## THE TWO LOUS ARE TWO MEN
 *
 * `lou` is Big Uncle Lou Sputthole -- `lou1`, `BIG_UNCLE_LOU_MANSION`,
 * `lou.png`, still in the same clothes behind the desk in his own office.
 * `captain_lou_sasole` is Captain Lou
 * Sasole -- `lou2`, `CAPTAIN_LOU_SASOLE`, `sasole.png`, a flight jacket, and
 * he is not in the building until the aftermath. Different wardrobe entry,
 * different photograph, different voice profile, different beat. They must
 * never merge, and the ensemble is the room the warning was written for.
 *
 * ## SNOW
 *
 * Standing constraint, and the reason there are two locks rather than one:
 *
 *   1. His `CombatActor` carries `core: true`, so the shared core refuses to
 *      let any round be the one that kills him -- the same protection every
 *      other scene gives him, in the same place.
 *   2. `targets()` -- the list this module hands the hostiles -- NEVER
 *      contains him, and his root carries `userData.neverTargeted`, which
 *      `attackers.js` checks BEFORE it consults the faction matrix.
 *
 * The difference between those two matters. (1) is "a round that reached him
 * cannot kill him". (2) is "no round is ever aimed at him", which is the
 * constraint as the owner actually wrote it. Neither is a path around the
 * faction matrix; both sit on top of it.
 *
 * ## WHAT THE FRIENDLIES DO AND DO NOT DO
 *
 * From the brief, verbatim, and every line of it is enforced here:
 *
 *   They DO       fire, suppress, call threats, occasionally kill someone,
 *                 hold side routes, react to wounds, move between assigned
 *                 cover.
 *   They DO NOT   outkill the player          -- `killBudget`, per beat
 *                 stand in the player's line  -- `_yieldToPlayer`
 *                 block the staircase         -- `KEEP_CLEAR`, asserted
 *                 fire without reloading      -- canonical Firearm
 *                 ignore incoming rounds      -- SuppressionModel + flinch
 *                 become invulnerable         -- `SURVIVES_THE_SIEGE`, which
 *                                                is a mission flag on this
 *                                                side of the line and not a
 *                                                rule inside the combat core
 *                 chase an enemy outside      -- `HOUSE_BOUNDS`
 *
 * ## NOT A MOTIONLESS SEMICIRCLE
 *
 * The other explicit instruction. Sixteen people are layered across the
 * office, the gallery, the balcony approach, the office doorway, the
 * conference room and the west corridor -- six different rooms -- and every
 * one of them is DOING something on his own clock while Lou talks:
 * reloading, checking a window, calling a position, handing over a magazine,
 * working on the wounded guard, flinching when the house is hit. The
 * business list is per person and the phase is staggered off his index, so
 * nobody in the room is ever synchronised with anybody else.
 */
import * as THREE from 'three';

import { CombatWeaponAim } from '../../core/combat/aim.js';
import { CombatActor } from '../../core/combat/actors.js';
import { DEFAULT_FACTION_MATRIX, FACTIONS } from '../../core/combat/factions.js';
import { CombatFireControl } from '../../core/combat/fire-control.js';
import { CombatImpactResolver } from '../../core/combat/impact.js';
import { CombatPerception } from '../../core/combat/perception.js';
import { AabbCombatSpace } from '../../core/combat/spatial.js';
import { SuppressionModel } from '../../core/combat/suppression.js';
import { BurstController } from '../../core/combat/weapon.js';
import { Firearm } from '../../core/weapons/Firearm.js';
import { playWeaponCue } from '../../core/weapons/audio.js';
import { buildWeaponModel } from '../../core/weapons/models.js';
import { DeathBloodPool } from '../../world/blood.js';
import {
  BIG_UNCLE_LOU_MANSION, BOOSKI, CAPTAIN_LOU_SASOLE, DEATHMEGATRON, ERIC,
  GRATIN, HOG_MAMA, IRISH, MANSION_GUARDS, NUMBSKULL, RIPPINFLOW, SHUBENATOR, SNOW,
} from '../../core/wardrobe.js';
/* WILLY is deliberately not imported. He held the office door in an earlier
 * version of this file and he cannot: NO WAKE is Day 3, the mansion arc is
 * after it, and NO WAKE is the mission where Lou has him executed in the
 * cabin of a boat. The wardrobe entry stays -- he is still a character, in
 * the scenes that come before the one he dies in.
 *
 * AUBBIE is not imported for the same reason, found by the owner on the
 * 2026-08-13 playtest: *"Voice lines from Aubbie in the siege? he should be
 * dead."* He is -- PROJECT SILENT SQUATCH ends with Booski's "Eliminate
 * Aubbie" objective on Day 5 at 8:10 PM, and this siege starts eight hours
 * later. GRATIN inherits his post: an established Family member with a landed
 * face photograph (`src/mansion/cast.js` already runs him in the
 * interrogation area) who has no death anywhere in the campaign. A test in
 * tests/mansion-siege-people.test.mjs holds the door for all three dead men
 * by name. */
import { HeistFigure } from '../../heist/people.js';
import {
  SIEGE_WEAPON_MOUNT_ROLL,
  mountSiegeWeapon, syncSiegeWeaponPose, trackSiegeWeaponSupport,
} from './armed-pose.js';
import { blendSiegeFall, siegeFallenPose, updateSiegeDownedWrithe } from './fallen.js';

const ENSEMBLE_COMBAT_SPACE = new AabbCombatSpace();
const ENSEMBLE_AIM_TOLERANCE = 0.14;
const ENSEMBLE_THINK_INTERVAL = 1 / 9;

/** Scene-local diagnostic bridge; Firearm remains the only state owner. */
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
  return firearm.restore({
    id: firearm.id,
    rounds: Math.max(0, Math.trunc(Number(snapshot?.magazine) || 0)),
    reserve: Math.max(0, Math.trunc(Number(snapshot?.reserveMagazines) || 0))
      * firearm.capacity,
    shots: Math.max(0, Math.trunc(Number(snapshot?.shotsFired) || 0)),
  });
}

function ensembleSurface(position) {
  return position.y >= 5.5 ? 'wood' : 'marble';
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
/* THE HOUSE, AS NUMBERS                                                */
/*                                                                       */
/* Same copy, same reason, as `./attackers.js` and `src/mansion/cast.js`: */
/* importing the two scene builders drags canvas textures into anything   */
/* that merely wants to know where the gallery is, headless tests         */
/* included. Every figure is the constant those files already export.     */
/* ================================================================== */
const GROUND_Y = 1.2;
const UPPER_Y = 6.0;
/* MansionInterior's walkable floor datums are the base of a 20 mm visible
 * finish. Cast roots use those datums, while a transparent floor stain has to
 * sit above the finish's top face or the slab wins the depth test. */
const FINISHED_FLOOR_TOP = 0.02;

/** `MansionInterior.BALCONY` -- the firing step the player is given. */
const BALCONY = Object.freeze({ x0: -3, x1: 3, z0: 45.2, z1: 48 });
/** `MansionInterior.STAIR_WEST` / `STAIR_EAST` -- the horseshoe. */
const STAIR_WEST = Object.freeze({ x0: -8.85, x1: -5.5, z0: 42, z1: 48 });
const STAIR_EAST = Object.freeze({ x0: 5.5, x1: 8.85, z0: 42, z1: 48 });

/**
 * Where a friendly may never be standing.
 *
 * The two flights and the balcony bay, plus a metre of approach north of the
 * bay so nobody parks in the doorway the player uses to get onto his own
 * firing step. A test walks every posting in this file against this list; it
 * is the only way "do not block the staircase" survives somebody nudging a
 * position six months from now.
 */
export const KEEP_CLEAR = Object.freeze([
  Object.freeze({ ...STAIR_WEST, label: 'the west flight' }),
  Object.freeze({ ...STAIR_EAST, label: 'the east flight' }),
  /* DERIVED from BALCONY rather than typed, so the day the future-edit list's
   * "widen the gallery landing at the stair heads" lands, the zone the
   * friendlies stay out of moves with the bay instead of being a stale pair
   * of numbers somebody has to remember. */
  Object.freeze({
    x0: BALCONY.x0 - 0.6,
    x1: BALCONY.x1 + 0.6,
    z0: BALCONY.z0 - 0.6,
    z1: BALCONY.z1 + 1.4,
    label: 'the balcony bay and its approach',
  }),
]);

/**
 * The volume a friendly is allowed to be in.
 *
 * They hold the house. They do not follow a wounded man out onto the
 * forecourt and strand a dialogue trigger behind them, which is the failure
 * the brief names by hand.
 */
export const HOUSE_BOUNDS = Object.freeze({
  x0: -16, x1: 16, y0: -3.5, y1: 7.5, z0: 36, z1: 75,
});

/* ================================================================== */
/* FACES                                                                */
/*                                                                       */
/* Only photographs that have landed -- assets/faces/index.json is the    */
/* ledger and every path below is in it. A path to a photo that has not   */
/* landed is a 404 in the console and `npm run verify:mansion` fails on   */
/* exactly that. Snow and Numbskull and the security keep the           */
/* authored heads they already have in `src/mansion/cast.js`; they are    */
/* not being redressed by this pass.                                     */
/* ================================================================== */
const FACES = Object.freeze({
  /* `lou.png` is BIG UNCLE LOU. `sasole.png` is CAPTAIN LOU SASOLE. Adjacent
   * here for the same reason the wardrobe puts their bodies adjacent. */
  lou: 'assets/faces/lou.png',
  sasole: 'assets/faces/sasole.png',
  booski: 'assets/faces/booski.png',
  deathmegatron: 'assets/faces/deathmegatron.png',
  irish: 'assets/faces/irish.png',
  rippinflow: 'assets/faces/rippinflow.png',
  erican: 'assets/faces/erican.png',
  shubes: 'assets/faces/shubes.png',
  hogmama: 'assets/faces/hogmama.png',
  gratin: 'assets/faces/gratin.png',
});

/* `makePerson`'s `face` builds an <img>, so a figure with a photograph on it
 * cannot be constructed without a DOM. Testing `createElementNS` rather than
 * `typeof document` is deliberate: the suite installs a document stub, and a
 * bare typeof check sends every figure into an image loader that then dies on
 * the first one. Verbatim the reasoning in `src/mansion/cast.js`. */
const CAN_PAINT_FACES = typeof document !== 'undefined'
  && typeof document.createElementNS === 'function';
const withFace = (model, face) => (CAN_PAINT_FACES && face ? { ...model, face } : model);

/* ================================================================== */
/* WHO SURVIVES, AND WHERE THAT DECISION LIVES                          */
/*                                                                       */
/* The brief: "Named-character survival is a mission configuration flag,  */
/* not a hidden rule inside the combat core."                             */
/*                                                                        */
/* So it is a list, here, in the mission's own module, and the mechanism   */
/* is `CombatActor`'s existing `core` flag -- the same protection Snow has */
/* carried since the club. A protected man still takes damage, still goes  */
/* to `severe`, still bleeds and still reacts; he simply cannot be the     */
/* casualty. Nothing was added to `src/core/combat/` to make this work.    */
/*                                                                        */
/* THE GUARDS ARE NOT ON THE LIST, deliberately. Somebody has to be able   */
/* to die tonight or the fight has no stakes, and Gratin is already        */
/* written as working on a wounded one.                                    */
/* ================================================================== */
export const SURVIVES_THE_SIEGE = Object.freeze([
  'lou', 'booski', 'rippinflow', 'snow', 'shubenator', 'eric', 'gratin',
  'irish', 'deathmegatron', 'numbskull', 'hogmama',
  'captain_lou_sasole',
]);

/* ================================================================== */
/* WHAT THEY ARE CARRYING                                               */
/*                                                                       */
/* Off the shared catalog, and matched to the man rather than rolled: Lou */
/* has never carried a long gun in his life and Numbskull is not going to */
/* be handed a pistol.                                                    */
/* ================================================================== */
const ARMS = Object.freeze({
  lou: 'pistol9',
  booski: 'pistol9',
  rippinflow: 'carbine',
  snow: 'pistol9',
  shubenator: 'carbine',
  eric: 'ak47',
  gratin: 'pistol9',
  irish: 'ak47',
  deathmegatron: 'saw',
  numbskull: 'ak47',
  hogmama: 'revolver',
  captain_lou_sasole: 'pistol9',
  guard_0: 'carbine',
  guard_1: 'carbine',
  guard_2: 'carbine',
  guard_wounded: null,
});

/* ================================================================== */
/* THE BUSINESS                                                         */
/*                                                                       */
/* What somebody is DOING while the boss talks. Each entry is a pose and  */
/* a length; the member's own routine decides which of them he does and   */
/* his index decides when, so sixteen people are never in step.           */
/* ================================================================== */
const BUSINESS = Object.freeze({
  /* Working the magazine. This one is not decorative -- it is driven by
   * the canonical Firearm actually being empty, so a man who has
   * fired thirty rounds reloads and a man who has not, does not. */
  reload: Object.freeze({ seconds: 2.0, pose: 'reload' }),
  /* Turning to a window and looking out at the grounds. */
  window: Object.freeze({ seconds: 2.6, pose: 'peer' }),
  /* Calling a position. Arm up, pointing at whatever he last saw. */
  callout: Object.freeze({ seconds: 1.7, pose: 'point' }),
  /* Down beside the wounded guard with both hands on him. */
  tend: Object.freeze({ seconds: 3.4, pose: 'kneel' }),
  /* Handing a magazine to whoever is nearest. */
  passMag: Object.freeze({ seconds: 1.5, pose: 'offer' }),
  /* Head turning toward the gunfire, weapon still up. */
  scan: Object.freeze({ seconds: 2.1, pose: 'scan' }),
  /* The house being hit. Not scheduled -- fired by `noteImpact`. */
  flinch: Object.freeze({ seconds: 0.7, pose: 'flinch' }),
  /* On the phone, which is Lou's entire contribution to the shooting. */
  phone: Object.freeze({ seconds: 4.2, pose: 'phone' }),
  /* Working the radio. */
  radio: Object.freeze({ seconds: 3.0, pose: 'radio' }),
});

const BARKS = Object.freeze({
  threat: Object.freeze([
    'Two more coming up the drive!',
    'Front door, front door!',
    'They are in the lounge!',
    'East side, through the glass!',
    'One on the west flight!',
  ]),
  reload: Object.freeze([
    'Changing!',
    'Reloading — cover the stairs!',
    'Out. Two seconds.',
  ]),
  hit: Object.freeze([
    'I am hit!',
    'Took one!',
    'That is blood, that is fine.',
  ]),
  kill: Object.freeze([
    'Got him!',
    'That one is down.',
    'One less.',
  ]),
  wounded: Object.freeze([
    'Hold still. Hold still.',
    'Keep pressure on that.',
    'You are not dying in this house.',
  ]),
  /* Owner, 2026-08-05: "let's have the system where they get down and bloody
   * with 1 hp ... the bleeding out mechanic. No deaths."
   *
   * A man on the floor with a hand on the hole in him. He is not dying --
   * nothing in this mission kills a name -- but he is out of the fight until
   * somebody comes and gets him, and he is not quiet about it. */
  downed: Object.freeze([
    'I\u2019m hit \u2014 I\u2019m hit, I\u2019m down!',
    'Somebody get over here!',
    'I can\u2019t \u2014 I can\u2019t get up.',
    'Ah \u2014 ah, that\u2019s bad. That\u2019s bad.',
    'Don\u2019t leave me on this floor.',
  ]),
  revived: Object.freeze([
    'I\u2019m up. I\u2019m up.',
    'Owe you one, kid.',
    'Give me the wall. I got the wall.',
    'Still here. Still shooting.',
  ]),
  ammo: Object.freeze([
    'Magazines here!',
    'Take one, take two.',
    'Ammunition, whoever needs it.',
  ]),
});

/* ================================================================== */
/* THE ROSTER                                                           */
/*                                                                       */
/* Sixteen people, six rooms, and a posting per beat.                    */
/*                                                                       */
/* EVERY UPPER-FLOOR POSTING IS NORTH OF z 48.4 OR OUTSIDE x ±3.6, which */
/* is what keeps the horseshoe and the balcony bay -- the player's own    */
/* firing step -- empty. `KEEP_CLEAR` is the assertion; this is the       */
/* discipline that satisfies it.                                         */
/*                                                                       */
/* A post is `[x, z, yawAtX, yawAtZ]` on the upper floor unless it names  */
/* its own `y`. `job` is the business this man does at that post when he  */
/* is not shooting.                                                      */
/* ================================================================== */
const P = (x, z, lookX, lookZ, extra = {}) => Object.freeze({
  x, y: UPPER_Y, z, lookX, lookZ, ...extra,
});

const ROSTER = Object.freeze([
  /* ---- Big Uncle Lou, at the desk end of his own office ---------------
   * On the phone and at the window, which is what he is doing for the whole
   * conversation. He comes to the landing in the aftermath, and that move is
   * the beat the brief writes: "Lou comes to the landing." */
  Object.freeze({
    id: 'lou',
    name: 'Big Uncle Lou',
    model: () => withFace(BIG_UNCLE_LOU_MANSION, FACES.lou),
    routine: Object.freeze(['phone', 'window', 'callout']),
    posts: Object.freeze({
      TO_OFFICE: P(1.05, 72.6, 0, 63),
      BRIEFING: P(1.05, 72.6, 0, 63),
      LITTLE_FRIEND: P(-1.8, 68.4, -1.8, 63),
      WAVE_ONE: P(-1.8, 68.4, -1.8, 63),
      LULL: P(-1.8, 66.2, -1.8, 63),
      WAVE_TWO: P(-1.8, 66.2, -1.8, 63),
      AFTERMATH: P(-1.4, 50.2, -1.4, 45),
      TO_SASOLE: P(-1.4, 50.2, 3.4, 52),
      COMPLETE: P(-1.4, 50.2, 3.4, 52),
    }),
  }),

  /* ---- Booski, covering the office door -------------------------------
   * Beside it rather than in it: the player comes through that doorway and a
   * man standing in a doorway is a wall. Out onto the gallery once the fight
   * starts, because his line in the brief is the one about more coming up
   * the front grounds and he has to be able to see them. */
  Object.freeze({
    id: 'booski',
    name: 'Booski',
    model: () => withFace(BOOSKI, FACES.booski),
    routine: Object.freeze(['scan', 'reload', 'callout']),
    posts: Object.freeze({
      TO_OFFICE: P(-2.2, 64.2, 0, 60),
      BRIEFING: P(-2.2, 64.2, 0, 60),
      LITTLE_FRIEND: P(6.2, 50.4, 6.2, 45),
      WAVE_ONE: P(6.2, 50.4, 6.2, 45),
      LULL: P(5.4, 51.6, 5.4, 45),
      WAVE_TWO: P(6.2, 50.4, 6.2, 45),
      AFTERMATH: P(5.0, 49.6, 5.0, 44),
      TO_SASOLE: P(5.0, 49.6, 0, 45),
      COMPLETE: P(5.0, 49.6, 0, 45),
    }),
  }),

  /* ---- Rippinflow, at the gallery rail --------------------------------
   * The brief's own posting. West of the balcony bay, on the gallery floor,
   * shooting down into the foyer. He is in the lounge on the way up, which
   * is PART IV's "a Squatch shooting from the lounge" -- the same man, one
   * room earlier. */
  Object.freeze({
    id: 'rippinflow',
    name: 'Rippinflow',
    model: () => withFace(RIPPINFLOW, FACES.rippinflow),
    routine: Object.freeze(['reload', 'callout', 'scan']),
    posts: Object.freeze({
      TO_OFFICE: Object.freeze({ x: 12.5, y: GROUND_Y, z: 45.5, lookX: 6, lookZ: 40 }),
      BRIEFING: P(-5.6, 48.8, -5.6, 44),
      LITTLE_FRIEND: P(-6.2, 48.7, -6.2, 42),
      WAVE_ONE: P(-6.2, 48.7, -6.2, 42),
      LULL: P(-5.0, 50.0, -5.0, 45),
      WAVE_TWO: P(-6.2, 48.7, -6.2, 42),
      AFTERMATH: P(-5.2, 49.4, -5.2, 44),
      TO_SASOLE: P(-5.2, 49.4, 0, 51),
      COMPLETE: P(-5.2, 49.4, 0, 51),
    }),
  }),

  /* ---- Snow, watching the west corridor -------------------------------
   * The brief's posting, and the safest one in the house: a side route
   * nobody's wave staging opens onto. He is armed, he is crew, and he is
   * never on anybody's target list -- see `targets()` and the note at the
   * top of this file. */
  Object.freeze({
    id: 'snow',
    name: 'Snow',
    model: () => SNOW,
    routine: Object.freeze(['scan', 'window', 'reload']),
    posts: Object.freeze({
      TO_OFFICE: P(-12.8, 50.2, -15, 50),
      BRIEFING: P(-12.8, 50.2, -15, 50),
      LITTLE_FRIEND: P(-12.8, 50.2, -15, 50),
      WAVE_ONE: P(-13.2, 50.4, -15.5, 50),
      LULL: P(-12.4, 50.0, -15, 50),
      WAVE_TWO: P(-13.2, 50.4, -15.5, 50),
      AFTERMATH: P(-11.0, 50.6, -6, 50),
      TO_SASOLE: P(-11.0, 50.6, 0, 51),
      COMPLETE: P(-11.0, 50.6, 0, 51),
    }),
  }),

  /* ---- The Shubenator, at the radio ------------------------------------
   * The conference room, which is the only room upstairs with a table to put
   * a radio on. (The house has no security room; that is item nine on the
   * future-edit list and it stays there.) */
  Object.freeze({
    id: 'shubenator',
    name: 'The Shubenator',
    model: () => withFace(SHUBENATOR, FACES.shubes),
    routine: Object.freeze(['radio', 'callout', 'window']),
    posts: Object.freeze({
      TO_OFFICE: P(-2.6, 59.0, -2.6, 55),
      BRIEFING: P(-2.6, 59.0, -2.6, 55),
      LITTLE_FRIEND: P(-3.0, 55.4, -3.0, 51),
      WAVE_ONE: P(-3.0, 55.4, -3.0, 51),
      LULL: P(-3.0, 56.6, -3.0, 52),
      WAVE_TWO: P(-3.0, 55.4, -3.0, 51),
      AFTERMATH: P(-3.4, 54.0, -3.4, 50),
      TO_SASOLE: P(-3.4, 54.0, 0, 51),
      COMPLETE: P(-3.4, 54.0, 0, 51),
    }),
  }),

  /* ---- Eric, covering the staircase approach ---------------------------
   * At the head of the east flight, standing on the GALLERY beside it rather
   * than on the treads. The brief gives him "holding the head of the
   * stairs"; the constraint gives him the two metres next to it. */
  Object.freeze({
    id: 'eric',
    name: 'Eric',
    model: () => withFace(ERIC, FACES.erican),
    routine: Object.freeze(['reload', 'scan', 'callout']),
    posts: Object.freeze({
      TO_OFFICE: P(7.6, 49.2, 7.6, 45),
      BRIEFING: P(7.6, 49.2, 7.6, 45),
      /* Turn three-quarters across the landing: when Eric falls this exposes
       * his head and all four limbs around the torso, but keeps the stain's
       * long edge out of the player's near plane. */
      LITTLE_FRIEND: P(7.65, 50.4, 2.9, 48.8),
      WAVE_ONE: P(7.9, 49.0, 7.9, 44),
      LULL: P(7.2, 50.4, 7.2, 45),
      WAVE_TWO: P(7.9, 49.0, 7.9, 44),
      AFTERMATH: P(7.4, 49.6, 7.4, 43),
      TO_SASOLE: P(7.4, 49.6, 3.4, 52),
      COMPLETE: P(7.4, 49.6, 3.4, 52),
    }),
  }),

  /* ---- Gratin, magazines and the wounded guard -------------------------
   * Aubbie's old post; see the import note on why Aubbie cannot be in this
   * house. The brief gives the job both tasks at once and they are two
   * different poses, so the routine alternates them: down on one knee with
   * both hands on the guard, then up, handing a magazine to whoever is
   * nearest the rail. */
  Object.freeze({
    id: 'gratin',
    name: 'Gratin',
    model: () => withFace(GRATIN, FACES.gratin),
    routine: Object.freeze(['tend', 'passMag', 'tend', 'reload']),
    posts: Object.freeze({
      TO_OFFICE: P(3.4, 65.2, 4.2, 65),
      BRIEFING: P(3.4, 65.2, 4.2, 65),
      LITTLE_FRIEND: P(2.8, 51.6, 3.6, 51.4),
      WAVE_ONE: P(2.8, 51.6, 3.6, 51.4),
      LULL: P(2.2, 51.2, 3.0, 50),
      WAVE_TWO: P(2.8, 51.6, 3.6, 51.4),
      AFTERMATH: P(3.0, 51.8, 3.8, 51.6),
      TO_SASOLE: P(3.0, 51.8, 3.8, 51.6),
      COMPLETE: P(3.0, 51.8, 3.8, 51.6),
    }),
  }),

  /* ---- Irish, the west rail --------------------------------------------
   * Downstairs in the cellar corridor on the way in, where his own lines
   * already fire, and on the west end of the gallery once the family takes
   * the upper floor. */
  Object.freeze({
    id: 'irish',
    name: 'Irish',
    model: () => withFace(IRISH, FACES.irish),
    routine: Object.freeze(['reload', 'callout', 'scan']),
    posts: Object.freeze({
      TO_OFFICE: Object.freeze({ x: -3.5, y: -2.8, z: 65.8, lookX: 6, lookZ: 65.8 }),
      BRIEFING: P(-8.4, 49.4, -8.4, 45),
      LITTLE_FRIEND: P(-8.4, 49.4, -8.4, 44),
      WAVE_ONE: P(-8.4, 49.4, -8.4, 44),
      LULL: P(-9.4, 50.4, -9.4, 46),
      WAVE_TWO: P(-8.4, 49.4, -8.4, 44),
      AFTERMATH: P(-8.0, 50.0, -8.0, 45),
      TO_SASOLE: P(-8.0, 50.0, 0, 51),
      COMPLETE: P(-8.0, 50.0, 0, 51),
    }),
  }),

  /* ---- DeathMegatron, the belt-fed gun on the east rail ----------------
   * The only friendly with a SAW, and he is set up rather than mobile: a
   * hundred-round box does not reposition every eight seconds. */
  Object.freeze({
    id: 'deathmegatron',
    name: 'DeathMegatron',
    model: () => withFace(DEATHMEGATRON, FACES.deathmegatron),
    routine: Object.freeze(['reload', 'scan']),
    posts: Object.freeze({
      TO_OFFICE: P(6.4, 67.5, 6.4, 63),
      BRIEFING: P(6.4, 67.5, 6.4, 63),
      LITTLE_FRIEND: P(6.8, 48.7, 6.8, 42),
      WAVE_ONE: P(6.8, 48.7, 6.8, 42),
      LULL: P(6.0, 50.2, 6.0, 45),
      WAVE_TWO: P(6.8, 48.7, 6.8, 42),
      AFTERMATH: P(6.4, 49.8, 6.4, 43),
      TO_SASOLE: P(6.4, 49.8, 0, 51),
      COMPLETE: P(6.4, 49.8, 0, 51),
    }),
  }),

  /* ---- Numbskull, the head of the west flight --------------------------- */
  Object.freeze({
    id: 'numbskull',
    name: 'Numbskull',
    model: () => NUMBSKULL,
    routine: Object.freeze(['scan', 'reload']),
    posts: Object.freeze({
      TO_OFFICE: P(-7.9, 49.4, -7.9, 45),
      BRIEFING: P(-7.9, 49.4, -7.9, 45),
      LITTLE_FRIEND: P(-7.9, 49.0, -7.9, 44),
      WAVE_ONE: P(-7.9, 49.0, -7.9, 44),
      LULL: P(-7.0, 50.6, -7.0, 46),
      WAVE_TWO: P(-7.9, 49.0, -7.9, 44),
      AFTERMATH: P(-7.4, 49.8, -7.4, 44),
      TO_SASOLE: P(-7.4, 49.8, 0, 51),
      COMPLETE: P(-7.4, 49.8, 0, 51),
    }),
  }),

  /* ---- Hog Mama, the conference doorway ---------------------------------
   * The fallback line. If the landing goes she is what is behind it. */
  Object.freeze({
    id: 'hogmama',
    name: 'Hog Mama',
    model: () => withFace(HOG_MAMA, FACES.hogmama),
    routine: Object.freeze(['reload', 'window', 'scan']),
    posts: Object.freeze({
      TO_OFFICE: P(-4.0, 71.0, -4.0, 66),
      BRIEFING: P(-4.0, 71.0, -4.0, 66),
      LITTLE_FRIEND: P(2.4, 54.2, 2.4, 50),
      WAVE_ONE: P(2.4, 54.2, 2.4, 50),
      LULL: P(1.6, 55.0, 1.6, 51),
      WAVE_TWO: P(2.4, 54.2, 2.4, 50),
      AFTERMATH: P(2.0, 53.4, 2.0, 50),
      TO_SASOLE: P(2.0, 53.4, 0, 51),
      COMPLETE: P(2.0, 53.4, 0, 51),
    }),
  }),

  /* ---- Captain Lou Sasole ----------------------------------------------
   * THE OTHER LOU. He is not in the fight -- he arrives with the aftermath,
   * which is what makes "Meet Captain Sasole" an objective rather than a
   * conversation with somebody who has been standing there for six minutes.
   * A beat with no post here is a man who is not in the building. */
  Object.freeze({
    id: 'captain_lou_sasole',
    name: 'Captain Lou Sasole',
    model: () => withFace(CAPTAIN_LOU_SASOLE, FACES.sasole),
    routine: Object.freeze(['scan', 'window']),
    posts: Object.freeze({
      AFTERMATH: P(3.4, 52.0, 0, 50),
      TO_SASOLE: P(3.4, 52.0, -1.4, 50.2),
      COMPLETE: P(3.4, 52.0, -1.4, 50.2),
    }),
  }),

  /* ---- Lou's security, spread down the landing ------------------------- */
  Object.freeze({
    id: 'guard_0',
    name: 'a guard',
    model: () => MANSION_GUARDS[0],
    routine: Object.freeze(['reload', 'callout']),
    posts: Object.freeze({
      TO_OFFICE: P(-4.6, 49.0, -4.6, 45),
      BRIEFING: P(-4.6, 49.0, -4.6, 45),
      LITTLE_FRIEND: P(-4.6, 48.5, -4.6, 43),
      WAVE_ONE: P(-4.6, 48.5, -4.6, 43),
      LULL: P(-4.2, 50.2, -4.2, 46),
      WAVE_TWO: P(-4.6, 48.5, -4.6, 43),
      AFTERMATH: P(-4.4, 49.4, -4.4, 44),
      TO_SASOLE: P(-4.4, 49.4, 0, 51),
      COMPLETE: P(-4.4, 49.4, 0, 51),
    }),
  }),
  Object.freeze({
    id: 'guard_1',
    name: 'a guard',
    model: () => MANSION_GUARDS[3],
    routine: Object.freeze(['reload', 'scan']),
    posts: Object.freeze({
      TO_OFFICE: P(4.6, 49.0, 4.6, 45),
      BRIEFING: P(4.6, 49.0, 4.6, 45),
      /* East of the dark stair mass, turned toward the live firing lane. This
       * keeps the supported carbine broadside to Eric's revive approach while
       * leaving real negative space between the two defenders. */
      LITTLE_FRIEND: P(4.8, 50.45, 6.0612, 54.246),
      WAVE_ONE: P(4.6, 48.5, 4.6, 43),
      LULL: P(4.2, 50.2, 4.2, 46),
      WAVE_TWO: P(4.6, 48.5, 4.6, 43),
      AFTERMATH: P(4.4, 49.4, 4.4, 44),
      TO_SASOLE: P(4.4, 49.4, 0, 51),
      COMPLETE: P(4.4, 49.4, 0, 51),
    }),
  }),
  Object.freeze({
    id: 'guard_2',
    name: 'a guard',
    model: () => MANSION_GUARDS[5],
    routine: Object.freeze(['scan', 'callout', 'reload']),
    posts: Object.freeze({
      TO_OFFICE: P(-0.4, 53.6, -0.4, 50),
      BRIEFING: P(-0.4, 53.6, -0.4, 50),
      LITTLE_FRIEND: P(-9.6, 51.4, -13, 51),
      WAVE_ONE: P(-9.6, 51.4, -13, 51),
      LULL: P(-9.0, 52.0, -12, 52),
      WAVE_TWO: P(-9.6, 51.4, -13, 51),
      AFTERMATH: P(-9.2, 51.8, -12, 52),
      TO_SASOLE: P(-9.2, 51.8, 0, 51),
      COMPLETE: P(-9.2, 51.8, 0, 51),
    }),
  }),

  /* ---- the wounded man --------------------------------------------------
   * Not a prop. He is a `CombatActor` at `severe`, on the floor, and he is
   * the reason Gratin has something to do with his hands. He does not fire,
   * he is not on the survival list, and if the fight reaches him he dies. */
  Object.freeze({
    id: 'guard_wounded',
    name: 'a wounded guard',
    model: () => MANSION_GUARDS[4],
    routine: Object.freeze([]),
    wounded: true,
    posts: Object.freeze({
      TO_OFFICE: P(4.2, 65.0, 3.4, 65.2),
      BRIEFING: P(4.2, 65.0, 3.4, 65.2),
      LITTLE_FRIEND: P(3.6, 51.4, 2.8, 51.6),
      WAVE_ONE: P(3.6, 51.4, 2.8, 51.6),
      LULL: P(3.6, 51.4, 2.8, 51.6),
      WAVE_TWO: P(3.6, 51.4, 2.8, 51.6),
      AFTERMATH: P(3.8, 51.6, 3.0, 51.8),
      TO_SASOLE: P(3.8, 51.6, 3.0, 51.8),
      COMPLETE: P(3.8, 51.6, 3.0, 51.8),
    }),
  }),
]);

/**
 * How many attackers the friendlies are allowed to put down, per beat.
 *
 * THE BRIEF: *"They do not outkill the player."* This is the number that
 * makes that true and keeps it true. Their rounds land, wound, suppress and
 * push men off cover for the whole fight; what the budget gates is the LAST
 * round on a man. Spend it and a friendly's fatal shot resolves against the
 * wall behind him instead, which reads on screen as exactly what it is --
 * seven people shooting and not quite finishing anybody.
 */
export const KILL_BUDGET = Object.freeze({
  WAVE_ONE: 2,
  WAVE_TWO: 3,
  LITTLE_FRIEND: 1,
  LULL: 0,
});

/* ================================================================== */
/* POSES                                                                */
/*                                                                       */
/* Presentation on top of `HeistFigure`, which owns the rig, the floor    */
/* settling and the fallen pose. Nothing below decides anything.          */
/* ================================================================== */
const STOWED_WEAPON_POSES = new Set([
  'down', 'wounded', 'kneel', 'offer', 'phone', 'radio',
]);
/* A flinch is a live defender ducking behind his weapon, not a surrender.
 * Keep the shared two-hand mount while the head and torso take the hit; the
 * down/wounded paths above remain the only injury poses that disarm him. */
const SUPPORTED_WEAPON_POSES = new Set(['stand', 'scan', 'peer', 'flinch']);

function poseFor(figure, pose, gun = null) {
  /* A prop parented to the right forearm follows that hand literally. Hide
   * it while the authored action needs the hand somewhere else, instead of
   * turning a telephone, a wounded body or a first-aid pose into gun mime. */
  if (gun) gun.visible = !STOWED_WEAPON_POSES.has(pose);
  const p = figure.parts;
  if (pose === 'kneel') { figure.kneeling(); return pose; }
  if (pose === 'down') {
    /* A Siege weapon is parented under foreR. Box3.setFromObject includes
     * invisible descendants, so merely hiding it makes fallen() ground the
     * pistol/carbine/AK/SAW instead of the rendered body -- up to 389 mm in
     * the air. Detach only for the one pose measurement, then restore the
     * exact hand parent/local transform while it remains hidden. */
    const gunParent = gun?.parent ?? null;
    const gunIndex = gunParent?.children.indexOf(gun) ?? -1;
    if (gunParent) gunParent.remove(gun);
    try {
      /* Posts store navigation datums, while the rendered support may be a
       * finish, runner, rug, or discrete tread above that datum. The body and
       * its blood both rest on the same topmost authored surface. */
      const resolvedFloor = figure.root.userData?.siegeSupportY?.();
      figure.baseY = Number.isFinite(resolvedFloor)
        ? resolvedFloor : figure.root.position.y + FINISHED_FLOOR_TOP;
      /* Flat on the boards, not fallen()'s propped incline -- see ./fallen.js
       * on "float like a foot above the ground". The member id picks the limb
       * variation so two downed names differ. */
      const memberId = String(figure.root.userData?.memberId ?? '');
      const variant = [...memberId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
      siegeFallenPose(figure, { roll: -0.5, variant });
      /* Eric is the worklamp evidence tableau and his whole silhouette is
       * authored by hand against that camera -- every limb, the head and the
       * torso must catch a first-hit ray from the balcony side, his screen
       * box must clear the live guard's, and the blood/body ratio is pinned.
       * He keeps the legacy propped attitude that composition was built on (a
       * living casualty half-turned toward the light); the anonymous dead lie
       * flat. */
      if (memberId === 'eric') {
        figure.tilt.rotation.set(Math.PI / 2 - 0.12, 0, -0.5);
        p.head.rotation.set(0.3, 0.4, 0);
        p.armL.rotation.set(-2.5, 0, -1.18);
        p.foreL.rotation.set(-0.85, 0, 0);
        p.armR.rotation.set(-1.9, 0, 0.7);
        p.foreR.rotation.set(0, 0, 0);
        p.legL.rotation.set(-0.45, 0, -0.42);
        p.shinL.rotation.set(0.72, 0, 0);
        p.legR.rotation.set(0.2, 0, 0);
        p.shinR.rotation.set(0, 0, 0);
      }
      figure._settle();
    } finally {
      if (gunParent) {
        gunParent.add(gun);
        if (gunIndex >= 0 && gunIndex < gunParent.children.length - 1) {
          gunParent.children.splice(gunParent.children.indexOf(gun), 1);
          gunParent.children.splice(gunIndex, 0, gun);
        }
        gun.visible = false;
      }
    }
    return pose;
  }
  if (pose === 'wounded') {
    figure.stand();
    p.legL.rotation.x = -1.35;
    p.legR.rotation.x = -1.2;
    p.shinL.rotation.x = 1.5;
    p.shinR.rotation.x = 1.35;
    p.body.rotation.x = 0.22;
    p.head.rotation.x = 0.2;
    p.armL.rotation.set(-0.4, 0, -0.5);
    p.armR.rotation.set(-0.9, 0, 0.35);
    p.foreR.rotation.x = -1.5;
    figure.tilt.position.y = -0.5 * figure.scale;
    figure.pose = pose;
    return pose;
  }
  /* Everything else starts from braced two-handed, which is the resting
   * shape of everybody in this house tonight. */
  figure.stand();
  p.armR.rotation.set(-1.26, 0, 0.15);
  p.foreR.rotation.set(-0.18, 0, 0);
  p.armL.rotation.set(-1.18, 0, -0.32);
  p.foreL.rotation.set(-0.3, 0.3, 0);
  switch (pose) {
    case 'reload':
      /* The gun comes down and across, the other hand goes to the well. */
      p.armR.rotation.set(-0.72, 0, 0.3);
      p.foreR.rotation.set(-1.02, 0, 0);
      p.armL.rotation.set(-0.5, 0.4, -0.2);
      p.foreL.rotation.set(-1.5, 0.2, 0);
      p.head.rotation.x = 0.18;
      break;
    case 'peer':
      p.armR.rotation.set(-0.5, 0, 0.2);
      p.foreR.rotation.set(-0.9, 0, 0);
      p.armL.rotation.set(-0.35, 0, -0.2);
      p.body.rotation.x = 0.12;
      p.head.rotation.x = -0.12;
      break;
    case 'point':
      p.armL.rotation.set(-1.62, 0, -0.22);
      p.foreL.rotation.set(-0.12, 0, 0);
      p.head.rotation.y = -0.16;
      break;
    case 'offer':
      p.armL.rotation.set(-1.05, 0.45, -0.28);
      p.foreL.rotation.set(-0.55, 0, 0);
      p.body.rotation.x = 0.06;
      break;
    case 'scan':
      p.head.rotation.y = 0.34;
      break;
    case 'flinch':
      /* The east-gallery guard ducks behind the supported carbine instead of
       * raising his upper silhouette into the camera's ceiling padding. */
      p.body.rotation.x = figure.root.userData?.memberId === 'guard_1' ? 0.64 : 0.24;
      p.head.rotation.x = 0.3;
      /* Keep the authored ducking arm pose; the supported mount below snaps
       * both hands onto the carbine after the reaction pose is applied. */
      p.armL.rotation.set(-1.9, 0, -0.5);
      p.armR.rotation.set(-1.85, 0, 0.5);
      p.foreL.rotation.x = -1.1;
      p.foreR.rotation.x = -1.1;
      break;
    case 'phone':
      p.armR.rotation.set(-2.35, 0, 0.28);
      p.foreR.rotation.set(-1.0, 0, 0);
      p.armL.rotation.set(-0.22, 0, -0.16);
      p.head.rotation.z = 0.14;
      break;
    case 'radio':
      p.armL.rotation.set(-2.1, 0, -0.3);
      p.foreL.rotation.set(-0.85, 0, 0);
      p.armR.rotation.set(-0.9, 0, 0.2);
      p.foreR.rotation.set(-1.1, 0, 0);
      break;
    default:
      break;
  }
  figure.pose = pose;
  if (gun?.visible) {
    syncSiegeWeaponPose(figure, gun, { support: SUPPORTED_WEAPON_POSES.has(pose) });
  }
  return pose;
}

/* ================================================================== */
/* THE MOUNT                                                            */
/* ================================================================== */

/**
 * Put the whole family in the fight.
 *
 * @param {object} o
 *   scene   where the ensemble's root is added, once.
 *   damage  the `MansionDamageState`. The ensemble is one group on the
 *           `battle` and `aftermath` layers, so it is standing for
 *           `under_attack`, `damaged` and `post_battle` and gone for the
 *           walking tour -- without the mission having to remember.
 *   matrix  the shared `FactionMatrix`.
 *   audio   an `AudioEngine`, optional here or per frame in `update`'s
 *           context. Every friendly shot and reload goes through
 *           `playWeaponCue`, so the family's guns are the catalog's guns.
 */
export function buildSiegeEnsemble({ scene, damage, matrix, audio = null, groundAt = null } = {}) {
  const factionMatrix = matrix ?? DEFAULT_FACTION_MATRIX;
  const root = new THREE.Group();
  root.name = 'siege.ensemble';
  scene?.add?.(root);
  damage?.group?.('siege.ensemble', { object: root, layers: ['battle', 'aftermath'] });
  /* One bounded slot OWNED by each authored body. A revive leaves that stain
   * visible but releases it; only the same member's next fall can recycle it.
   * A shared ring let repeated Booski revives wrap onto Lou's still-active
   * slot, leaving a man on the floor with somebody else's blood under him. */
  const bloodByMember = new Map(ROSTER.map((definition) => {
    const pool = new DeathBloodPool(root, { capacity: 1, growthSeconds: 0.8 });
    const mesh = pool.meshes[0];
    mesh.name = `${mesh.name}.${definition.id}`;
    /* Mansion walnut plus the navy cast wardrobe swallowed the shared dark
     * stain even at 86% opacity. Keep this treatment local to Siege: a pale
     * diffuse tint preserves the irregular texture, the low roughness catches
     * the room lights like wet blood, and restrained deep-red self-light keeps
     * the pool readable without turning every blood user in the game neon. */
    mesh.material.color.setHex(0xffb0b0);
    mesh.material.emissive.setHex(0xb50917);
    mesh.material.emissiveIntensity = 1.35;
    mesh.material.roughness = 0.28;
    mesh.material.metalness = 0.02;
    /* Preserve the readable 1.8 m body-length while trimming only the
     * cross-body spread; a wound pool is an oval, not a room-sized square. */
    if (definition.id === 'eric') {
      mesh.userData.siegePlanAspect = 0.80;
      /* The gallery runner is crimson, so a bright red pool alone loses its
       * outer contour. A slightly larger, non-emissive copy of the same alpha
       * painting provides a dark absorbent edge beneath Eric only. */
      const edgeMaterial = mesh.material.clone();
      edgeMaterial.color.setHex(0x190306);
      edgeMaterial.emissive.setHex(0x000000);
      edgeMaterial.emissiveIntensity = 0;
      edgeMaterial.roughness = 1;
      edgeMaterial.metalness = 0;
      edgeMaterial.opacity = 0;
      edgeMaterial.polygonOffsetFactor = -2;
      edgeMaterial.polygonOffsetUnits = -2;
      const edge = new THREE.Mesh(mesh.geometry, edgeMaterial);
      edge.name = 'siege-eric-blood-edge';
      edge.position.z = -0.001;
      /* The same-alpha underlay changes the translucent edge composite without
       * expanding the authored 1.8 m injury toward the camera padding. */
      edge.scale.set(1, 1, 1);
      edge.renderOrder = 2;
      edge.userData.reusableSystem = 'blood';
      edge.userData.bloodEffect = 'siege-readable-edge';
      edge.userData.memberId = 'eric';
      edge.userData.collider = false;
      mesh.add(edge);
      mesh.userData.siegeBloodEdge = edge;
    }
    mesh.material.needsUpdate = true;
    return [definition.id, pool];
  }));

  const members = new Map();
  const barkCursor = new Map();
  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _step = new THREE.Vector3();
  const _viewForward = new THREE.Vector3();
  const impactResolver = new CombatImpactResolver();
  const impactRegistrations = [];
  const fireControl = new CombatFireControl({
    random: () => Math.random(),
    space: ENSEMBLE_COMBAT_SPACE,
    alignmentTolerance: ENSEMBLE_AIM_TOLERANCE,
  });

  let beat = null;
  let killBudget = 0;
  let friendlyKills = 0;
  let context = { audio: null, onBark: null, onWeaponEvent: null };

  function spillFor(member) {
    if (member.bloodPool?.visible
        && member.bloodPool.userData.memberId === member.id
        && member.bloodPool.userData.activeDown === true) return member.bloodPool;
    member.root.updateMatrixWorld(true);
    /* Centre the floor stain under the torso, not the whole spread-eagle
     * hierarchy. A flung hand or long accessory otherwise drags the pool away
     * from the body mass (and, at the gallery camera, into the near plane). */
    const bloodAnchor = member.figure?.parts?.torso ?? member.root;
    const centre = new THREE.Box3().setFromObject(bloodAnchor)
      .getCenter(new THREE.Vector3());
    const resolvedFloor = member.root.userData?.siegeSupportY?.();
    const pool = bloodByMember.get(member.id).spill(centre, {
      floorY: Number.isFinite(resolvedFloor)
        ? resolvedFloor : member.root.position.y + FINISHED_FLOOR_TOP,
      /* A 1.08 m square lived entirely inside a fallen 1.62 x 2.13 m body
       * bound, so even a brighter material could not appear in the frame.
       * 1.8 m leaves a wet perimeter outside the silhouette without turning
       * the readable injury into a room-sized red field. */
      size: 1.8,
      opacity: 0.86,
      seed: member.index + 1 + member.revivedCount * ROSTER.length,
    });
    const edge = pool.userData.siegeBloodEdge;
    if (edge) {
      edge.material.map = pool.material.map;
      edge.material.opacity = 0;
      edge.material.needsUpdate = true;
    }
    pool.userData.memberId = member.id;
    pool.userData.revivable = member.actor.core === true;
    pool.userData.activeDown = true;
    member.bloodPool = pool;
    return pool;
  }

  function bark(member, key) {
    const lines = BARKS[key];
    if (!lines?.length) return null;
    const index = (barkCursor.get(key) ?? 0) % lines.length;
    barkCursor.set(key, index + 1);
    const line = lines[index];
    member.lastBark = line;
    context.onBark?.({ id: member.id, name: member.name, key, line });
    return line;
  }

  function weaponEvent(member, type, details = {}) {
    const event = {
      type,
      id: member.id,
      weapon: member.weaponId,
      position: member.root.getWorldPosition(new THREE.Vector3()),
      ...details,
    };
    context.onWeaponEvent?.(event);
    return event;
  }

  /* ---------------------------------------------------------------- */
  /* The people                                                        */
  /* ---------------------------------------------------------------- */

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

  ROSTER.forEach((definition, index) => {
    const first = definition.posts.BRIEFING ?? definition.posts.AFTERMATH ?? P(0, 60, 0, 56);
    const figure = new HeistFigure({
      name: `siege-${definition.id}`,
      x: first.x, y: first.y, z: first.z,
      yaw: Math.atan2(first.lookX - first.x, first.lookZ - first.z),
      tier: index < 8 ? 'hero' : 'ambient',
      model: definition.model(),
    });
    tagHitZones(figure);

    /* Everyone still alive is armed -- so the gun is a real model off the
     * shared catalog, in his hand, not a silhouette. The wounded man is the
     * only exception and that is the point of him. */
    const weaponId = ARMS[definition.id] ?? null;
    let gun = null;
    if (weaponId) {
      try { gun = buildWeaponModel(weaponId); } catch { gun = null; }
      if (gun) {
        mountSiegeWeapon(figure, weaponId, gun, { name: `siege-${definition.id}-weapon` });
      }
    }

    const protectedByMission = SURVIVES_THE_SIEGE.includes(definition.id);
    const actor = new CombatActor({
      id: definition.id,
      faction: FACTIONS.CREW,
      maxHealth: definition.wounded ? 60 : 110,
      armor: definition.id.startsWith('guard') ? 14 : 6,
      /* THE MISSION FLAG, and the only mechanism behind it: the shared
       * core's own `core` protection. Nothing was added to combat/ for the
       * siege, and turning the flag off here is the whole of "the mission
       * says they can die". */
      core: protectedByMission,
    });
    actor.role = definition.id;
    if (definition.wounded) actor.setInjury('severe');

    const member = {
      id: definition.id,
      name: definition.name,
      definition,
      figure,
      root: figure.root,
      gun,
      restGunQuaternion: gun?.quaternion.clone() ?? null,
      actor,
      posts: definition.posts,
      weaponId,
      weapon: weaponId ? npcFirearm(weaponId) : null,
      burst: new BurstController({ min: 2, max: 4, pause: 1.4 + (index % 5) * 0.22 }),
      suppression: new SuppressionModel({ decay: 0.62 }),
      perception: new CombatPerception({
        range: 34,
        fov: Math.PI * 2,
        memorySeconds: 1.8,
        awareness: 1,
        space: ENSEMBLE_COMBAT_SPACE,
      }),
      weaponAim: new CombatWeaponAim({ tolerance: ENSEMBLE_AIM_TOLERANCE }),
      aimFrame: null,
      aimPoint: new THREE.Vector3(),
      lastSeen: new THREE.Vector3(),
      target: null,
      targetVisible: false,
      targetDistance: Infinity,
      aimAligned: false,
      aimError: Infinity,
      boreError: Infinity,
      aimPitch: 0,
      sinceThink: (index % 9) * (ENSEMBLE_THINK_INTERVAL / 9),
      lastShot: null,
      post: null,
      goal: new THREE.Vector3(first.x, first.y, first.z),
      lookAt: new THREE.Vector2(first.lookX, first.lookZ),
      /* Staggered off the index so sixteen people never do the same thing on
       * the same frame. The whole "not a motionless semicircle" instruction
       * comes down to this line and the routine list. */
      businessClock: (index * 0.83) % 3.4,
      businessKey: null,
      businessLeft: 0,
      /* BLEEDING OUT, WITHOUT DYING.
       *
       * `core: true` floors a protected man's health at 1 and never sets
       * `incapacitated`, so before this he took a magazine, stayed on 1 HP,
       * and kept shooting -- which reads as nothing happening. Now 1 HP puts
       * him on the floor: out of the fight, bleeding, calling for help, and
       * still alive at the end of the night whatever the player does.
       *
       * `downSeconds` is how long he has been there. It is a number the scene
       * can show and the aftermath can use; it is NOT a timer to a death,
       * because there is no death at the end of it. The owner was explicit:
       * the one man who dies in this campaign will be scripted, chosen, and
       * written -- not lost to an AI's arithmetic on a staircase. */
      downed: false,
      downSeconds: 0,
      revivedCount: 0,
      routineAt: index % Math.max(1, definition.routine.length),
      index,
      wounded: definition.wounded === true,
      lastBark: null,
      kills: 0,
      shotsFired: 0,
      staged: false,
      /** Set the first time he goes down, so nobody is counted twice. */
      reportedDown: false,
      bloodPool: null,
    };

    member.impactActor = {
      get id() { return member.actor.id; },
      get faction() { return member.actor.faction; },
      get incapacitated() { return member.actor.incapacitated; },
      applyHit: (options = {}) => member.actor.applyHit({
        ...options,
        matrix: factionMatrix,
      }),
    };
    figure.root.userData.combatActor = actor;
    figure.root.userData.combatant = member;
    figure.root.userData.memberId = definition.id;
    figure.root.userData.faction = FACTIONS.CREW;
    figure.root.userData.siegeSupportY = () => {
      const resolved = groundAt?.(
        figure.root.position.x, figure.root.position.z, figure.root.position.y,
      );
      return Number.isFinite(resolved)
        ? resolved : figure.root.position.y + FINISHED_FLOOR_TOP;
    };
    /* THE HARD LOCK. Read by `attackers.js` BEFORE the faction matrix, so
     * Snow is not in the hostile target list at all rather than being
     * rejected from it. */
    if (definition.id === 'snow') figure.root.userData.neverTargeted = true;
    figure.root.visible = false;
    impactRegistrations.push(impactResolver.register(figure.root, {
      actor: () => member.impactActor,
      combatant: () => member,
      materialOf: 'flesh',
    }));
    root.add(figure.root);
    poseFor(figure, member.wounded ? 'wounded' : 'stand', member.gun);
    members.set(definition.id, member);
  });

  /* ---------------------------------------------------------------- */
  /* Staging                                                           */
  /* ---------------------------------------------------------------- */

  /** Push a point out of the two flights and the player's own firing step. */
  function keepClear(point) {
    for (const zone of KEEP_CLEAR) {
      if (point.x < zone.x0 || point.x > zone.x1) continue;
      if (point.z < zone.z0 || point.z > zone.z1) continue;
      /* Out of the nearest side, whichever is shorter. */
      const outs = [
        { axis: 'x', to: zone.x0 - 0.35, d: Math.abs(point.x - zone.x0) },
        { axis: 'x', to: zone.x1 + 0.35, d: Math.abs(point.x - zone.x1) },
        { axis: 'z', to: zone.z0 - 0.35, d: Math.abs(point.z - zone.z0) },
        { axis: 'z', to: zone.z1 + 0.35, d: Math.abs(point.z - zone.z1) },
      ].sort((a, b) => a.d - b.d)[0];
      point[outs.axis] = outs.to;
    }
    return point;
  }

  function inHouse(point) {
    point.x = Math.min(HOUSE_BOUNDS.x1, Math.max(HOUSE_BOUNDS.x0, point.x));
    point.y = Math.min(HOUSE_BOUNDS.y1, Math.max(HOUSE_BOUNDS.y0, point.y));
    point.z = Math.min(HOUSE_BOUNDS.z1, Math.max(HOUSE_BOUNDS.z0, point.z));
    return point;
  }

  /**
   * Move everyone to their posting for a beat.
   *
   * A beat with no post for somebody is a beat he is not in the building
   * for -- which is how Captain Lou Sasole arrives with the aftermath
   * instead of standing in the office for six minutes while Lou briefs
   * somebody about a man who is in the room.
   *
   * SAME FLOOR WALKS, DIFFERENT FLOOR SNAPS. The only postings that change
   * level are the two men who are downstairs on the way in -- Rippin in the
   * lounge and Irish in the cellar corridor -- and both of those moves
   * happen while the player is in the office with the door shut behind him.
   * A body sliding up through a ceiling in view is worse than a body that
   * was already there.
   */
  function stage(name) {
    beat = name;
    killBudget = KILL_BUDGET[name] ?? 0;
    for (const member of members.values()) {
      const post = member.posts[name] ?? null;
      member.post = post;
      /* A beat changes the job of somebody who is still on his feet. It does
       * not move a body to the next mark or stand a protected man up while
       * `downed()` still offers him to the player's revive prompt. Keep the
       * body where it fell, but retarget its goal now so an explicit revive
       * sends him to the CURRENT beat's posting rather than the old one. */
      if (member.staged && (member.downed || member.actor.incapacitated)) {
        if (post) {
          const target = inHouse(keepClear({ x: post.x, y: post.y, z: post.z }));
          member.goal.set(target.x, target.y, target.z);
          member.lookAt.set(post.lookX ?? post.x, post.lookZ ?? post.z - 4);
        } else {
          member.goal.copy(member.root.position);
        }
        member.root.visible = true;
        member.businessKey = null;
        member.businessLeft = 0;
        /* Re-posing a body that is already on the floor is a snap, so any
         * in-flight crumple is cancelled and the writhe base recaptures. */
        member.figure._poseFrom = null;
        if (member.writhe) member.writhe.base = null;
        poseFor(member.figure, 'down', member.gun);
        continue;
      }
      if (!post) {
        member.root.visible = false;
        member.staged = false;
        continue;
      }
      const target = inHouse(keepClear({ x: post.x, y: post.y, z: post.z }));
      const changedFloor = !member.staged || Math.abs(member.root.position.y - target.y) > 1.2;
      member.goal.set(target.x, target.y, target.z);
      member.lookAt.set(post.lookX ?? post.x, post.lookZ ?? post.z - 4);
      if (changedFloor) {
        member.root.position.set(target.x, target.y, target.z);
        member.root.rotation.y = Math.atan2(
          member.lookAt.x - target.x, member.lookAt.y - target.z,
        );
      }
      member.root.visible = true;
      member.staged = true;
      /* A beat change is a new job. Nobody carries the last one's timer. */
      member.businessKey = null;
      member.businessLeft = 0;
      member.businessClock = (member.index * 0.83) % 3.4;
      member.perception.restore({ awareness: 1, memory: 0, lastSeen: null });
      mirrorPerception(member);
      member.weaponAim.reset();
      member.aimFrame = null;
      member.aimAligned = false;
      member.lastShot = null;
      if (member.gun && member.restGunQuaternion) {
        member.gun.quaternion.copy(member.restGunQuaternion);
      }
      if (!member.actor.incapacitated) {
        poseFor(member.figure, member.wounded ? 'wounded' : 'stand', member.gun);
      }
    }
    return name;
  }

  /* ---------------------------------------------------------------- */
  /* Targets and fire                                                  */
  /* ---------------------------------------------------------------- */

  function hostilesFrom(ctx) {
    const raw = typeof ctx.hostiles === 'function' ? ctx.hostiles()
      : ctx.hostiles ?? (typeof ctx.attackers?.living === 'function' ? ctx.attackers.living()
        : ctx.attackers);
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const candidate of raw) {
      const node = candidate?.root ?? candidate?.group ?? candidate;
      const actor = candidate?.actor ?? node?.userData?.combatActor ?? null;
      if (!actor || actor.incapacitated) continue;
      if (!factionMatrix.canTarget(FACTIONS.CREW, actor.faction)) continue;
      const position = candidate?.position ?? node?.position ?? null;
      if (!position || !Number.isFinite(position.x)) continue;
      out.push({
        id: actor.id ?? node?.userData?.attackerId ?? node?.name,
        actor,
        position,
        node,
        eye: 1.4,
        visible: node?.visible !== false,
      });
    }
    return out;
  }

  function mirrorPerception(member) {
    member.target = member.perception.target;
    member.targetVisible = member.perception.targetVisible;
    member.targetDistance = member.perception.distance;
    if (member.perception.lastSeen) member.lastSeen.copy(member.perception.lastSeen);
    else member.lastSeen.set(0, 0, 0);
  }

  function scanForTarget(member, candidates, colliders, player) {
    _from.copy(member.root.position);
    _from.y += 1.4;
    _viewForward.set(
      Math.sin(member.root.rotation.y), 0, Math.cos(member.root.rotation.y),
    );
    const best = member.perception.scan({
      origin: _from,
      forward: _viewForward,
      candidates: candidates.filter((target) => !playerInTheWay(member, target, player)),
      boxes: colliders,
    });
    mirrorPerception(member);
    if (best) member.aimPoint.copy(best.point);
    else if (member.perception.lastSeen) member.aimPoint.copy(member.perception.lastSeen);
    return best;
  }

  /**
   * One friendly round.
   *
   * The kill budget is applied by deciding what the round MEETS, never by
   * editing what a hit is worth: a fatal round with no budget left resolves
   * against the plaster behind the man, which is a miss, and a miss is a
   * thing that happens to people. Nothing here reaches inside `applyHit`.
   */
  function fireAt(member, target, ctx) {
    if (!member.weapon) return null;
    const shot = fireNpcWeapon(member.weapon, {
      aimed: member.aimAligned,
      aimStability: 1 - member.suppression.value * 0.6,
    });
    if (!shot.fired) {
      if (shot.reason === 'empty' && member.weapon.reload()) {
        weaponEvent(member, 'reload-start');
        bark(member, 'reload');
        member.businessKey = 'reload';
        member.businessLeft = BUSINESS.reload.seconds;
        poseFor(member.figure, 'reload', member.gun);
        playWeaponCue(ctx.audio, member.weaponId, 'reload.out', {
          position: member.root.position, volume: 0.4,
        });
      }
      return null;
    }
    member.shotsFired++;

    const aimFrame = member.aimFrame;
    if (aimFrame?.origin?.isVector3) _from.copy(aimFrame.origin);
    else {
      _from.copy(member.root.position);
      _from.y += 1.4;
    }
    _to.copy(member.aimPoint);
    const distance = _from.distanceTo(_to);
    const livePoint = target.position.clone();
    livePoint.y += target.eye ?? 1.4;

    /* Deliberately poor. Seven people with a 10% base chance at a moving man
     * behind a wrecked console is a room full of gunfire in which the player
     * is still the one who has to do the work. */
    const chance = 0.1 * (1 - member.suppression.value * 0.6)
      * (1 - Math.min(0.7, Math.max(0, distance - 14) / 30));
    /* Would this be the last round on him? Then it needs a budget. Shared
     * fire control still owns the random outcome; zero accuracy means this
     * trigger resolves truthfully into wall or air instead of applying it. */
    const expected = shot.damage - Math.min(target.actor.armor, shot.damage * 0.55);
    const needsKillBudget = target.actor.health - expected <= 0 && killBudget <= 0;
    const resolved = fireControl.resolveShot({
      origin: _from,
      boreDirection: aimFrame?.direction ?? _to.clone().sub(_from).normalize(),
      aimPoint: _to,
      targetPoint: livePoint,
      target: {
        id: target.id,
        actor: target.actor,
        point: livePoint,
        visible: member.targetVisible && member.target === target,
      },
      targetVisible: member.targetVisible && member.target === target,
      attacker: member.actor,
      damage: shot.damage,
      penetration: shot.penetration,
      accuracy: needsKillBudget ? 0 : chance,
      colliders: ctx.colliders,
      matrix: factionMatrix,
      playerShot: false,
    });
    if (!resolved.fired) return null;
    const pellets = Object.freeze([Object.freeze({
      index: 0,
      fired: true,
      origin: frozenShotVector(resolved.origin),
      direction: frozenShotVector(resolved.direction),
      boreDirection: frozenShotVector(resolved.boreDirection),
      end: frozenShotVector(resolved.end),
      blocked: resolved.blocked,
      blocker: frozenShotBlocker(resolved.blocker),
      hit: resolved.hit,
      nearMiss: resolved.nearMiss,
      whiz: resolved.whiz,
      missDistance: resolved.missDistance,
      damage: resolved.damage,
      fatal: resolved.fatal,
      result: resolved.result,
      target: target.id,
      material: resolved.hit ? 'flesh' : (resolved.blocker?.material ?? 'plaster'),
    })]);
    weaponEvent(member, 'shot', {
      rounds: member.weapon.rounds,
      projectiles: 1,
      pellets,
    });
    playWeaponCue(ctx.audio, member.weaponId, 'fire', {
      position: resolved.origin, volume: 0.55, ref: 3, maxDist: 55,
    });
    if (ctx.onImpact && (resolved.blocked || resolved.hit)) {
      ctx.onImpact({
        point: resolved.end.clone(),
        normal: resolved.direction.clone().negate(),
        material: resolved.hit ? 'flesh' : (resolved.blocker?.material ?? 'plaster'),
        actor: resolved.hit ? target.actor : null,
        object: resolved.hit ? target.node : (resolved.blocker?.box ?? null),
        from: resolved.origin.clone(),
      });
    }

    const result = resolved.result ?? null;
    member.lastShot = {
      origin: resolved.origin.clone(),
      end: resolved.end.clone(),
      blocked: resolved.blocked,
      onTarget: resolved.hit,
      damage: resolved.damage,
      aimError: member.aimError,
      boreError: resolved.boreError,
      pellets,
    };
    if (result?.fatal) {
      killBudget = Math.max(0, killBudget - 1);
      friendlyKills++;
      member.kills++;
      bark(member, 'kill');
      target.node?.userData?.onDown?.(result);
      ctx.onHostileDown?.(target.node?.userData?.attackerId ?? target.actor.id, member.id);
    }
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                             */
  /* ---------------------------------------------------------------- */

  /** Step out of the player's way rather than shooting past his ear. */
  function yieldToPlayer(member, player) {
    if (!player?.position) return;
    const dx = member.root.position.x - player.position.x;
    const dz = member.root.position.z - player.position.z;
    const dy = Math.abs(member.root.position.y - player.position.y);
    if (dy > 2.2) return;
    const distance = Math.hypot(dx, dz);
    if (distance > 1.35 || distance < 1e-3) return;
    const push = (1.35 - distance) / distance;
    member.root.position.x += dx * push;
    member.root.position.z += dz * push;
    keepClear(member.root.position);
  }

  /** Does the line to this man go through the player? Then do not take it. */
  function playerInTheWay(member, target, player) {
    if (!player?.position) return false;
    const ax = member.root.position.x;
    const az = member.root.position.z;
    const bx = target.position.x;
    const bz = target.position.z;
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    if (len2 < 1e-6) return false;
    let t = ((player.position.x - ax) * vx + (player.position.z - az) * vz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + vx * t - player.position.x;
    const cz = az + vz * t - player.position.z;
    return Math.hypot(cx, cz) < 0.85;
  }

  function nextBusiness(member) {
    const routine = member.definition.routine;
    if (!routine.length) return null;
    const key = routine[member.routineAt % routine.length];
    member.routineAt++;
    /* Reload is honest: he only does it if the shared controller says the
     * magazine is short. Otherwise he does the next thing on his list. */
    if (key === 'reload' && member.weapon
      && member.weapon.rounds > member.weapon.capacity * 0.4) {
      return routine[(member.routineAt++) % routine.length];
    }
    return key;
  }

  /**
   * The frame.
   *
   * @param {number} dt
   * @param {object} ctx
   *   player      anything with a `.position`. Read only so that nobody
   *               stands in his line or inside him.
   *   colliders   the scene's live collider array, for line of sight.
   *   hostiles    the cartel. An array of roots or entries, a function, or
   *               pass the attacker pool itself as `attackers` and its
   *               `living()` is used.
   *   onHostileDown(attackerId, memberId)  one of ours finished one of
   *               theirs. The pool is told separately through the attacker
   *               root's own `userData.onDown`, so the wave director learns
   *               either way; this is for the scene's kill feed.
   *   onFriendlyDown(memberId)  one of ours is down. Fired once per man.
   *   audio, onBark  optional.
   */
  function update(dt, ctx = {}) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    context = {
      audio: ctx.audio ?? audio,
      onBark: ctx.onBark ?? null,
      onWeaponEvent: ctx.onWeaponEvent ?? null,
    };
    const frame = {
      audio: context.audio,
      colliders: ctx.colliders ?? [],
      onHostileDown: ctx.onHostileDown ?? null,
      onImpact: ctx.onImpact ?? null,
    };
    const player = ctx.player ?? null;
    const hostiles = hostilesFrom(ctx);
    fireControl.update(step);

    for (const member of members.values()) {
      if (!member.staged || !member.post) continue;

      /* --- 1 HP is the floor, and the floor is where he goes --- */
      if (!member.downed && !member.actor.incapacitated
          && member.actor.core && member.actor.health <= 1) {
        member.downed = true;
        member.downSeconds = 0;
        member.actor.setInjury('severe');
        /* A real crumple, not a hard cut -- see ./fallen.js. The blood is
         * spilled INSIDE the apply so its centre is measured on the posed
         * body, then the rig rewinds and falls onto its own stain. */
        blendSiegeFall(member.figure, () => {
          poseFor(member.figure, 'down', member.gun);
          spillFor(member);
        }, { duration: 0.55 });
        member.writhe = { headLift: 1 };
        bark(member, 'downed');
        ctx.onFriendlyDown?.(member.id);
      }

      if (member.downed) {
        member.downSeconds += step;
        /* He keeps talking. A man face down and silent for four minutes is
         * scenery; a man asking for help is the reason to cross the landing.
         * Every eleven seconds, staggered off his own clock so sixteen people
         * never call out together. */
        member.businessClock -= step;
        if (member.businessClock <= 0) {
          member.businessClock = 11 + (member.downSeconds % 3);
          bark(member, 'downed');
          /* He lifts his head off the boards to shout it. */
          if (member.writhe) member.writhe.headLift = 1;
        }
        member.figure.update(step, { fear: 0.8 });
        /* And he never lies still: wound pressed, knee dragging, a slow rock
         * on the slump side. See ./fallen.js. Eric's silhouette is pinned by
         * the worklamp evidence contract, so his writhe stays above the
         * waist -- the composition holds while the man still reads alive. */
        member.writhe ??= {};
        /* Eric's silhouette is pinned by the worklamp evidence contract, and
         * his propped legacy pose GROUNDS ON the reaching right hand -- the
         * press would float him. He keeps the head lift only. */
        const pinnedSilhouette = member.id === 'eric';
        updateSiegeDownedWrithe(member.figure, member.writhe, member.downSeconds, step, {
          legs: !pinnedSilhouette,
          rock: !pinnedSilhouette,
          press: !pinnedSilhouette,
        });
        continue;
      }

      if (member.actor.incapacitated) {
        /* One report per man, whoever killed him -- the mission counts
         * `guardsDown` for its checkpoint and a double count is a
         * checkpoint that restores the wrong number of bodies. */
        if (member.figure.pose !== 'fallen') {
          blendSiegeFall(member.figure, () => {
            poseFor(member.figure, 'down', member.gun);
            spillFor(member);
          }, { duration: 0.45 });
          if (!member.reportedDown) {
            member.reportedDown = true;
            bark(member, 'hit');
            ctx.onFriendlyDown?.(member.id);
          }
        }
        member.figure.update(step, { fear: 0 });
        continue;
      }

      /* --- move to the posting --- */
      const from = member.root.position.clone();
      _step.copy(member.goal).sub(member.root.position);
      _step.y = 0;
      const planar = _step.length();
      if (planar > 0.22) {
        _step.multiplyScalar(Math.min(1, (1.8 * step) / planar));
        member.root.position.add(_step);
      }
      member.root.position.y += (member.goal.y - member.root.position.y)
        * Math.min(1, step * 4);
      yieldToPlayer(member, player);
      inHouse(member.root.position);
      const movedDistance = from.distanceTo(member.root.position);
      if (movedDistance > 1e-4 && !member.actor.incapacitated) {
        const to = member.root.position.clone();
        ctx.onStep?.(member, {
          id: member.id,
          position: to.clone(),
          from,
          to,
          moving: true,
          gait: 'walk',
          surface: ensembleSurface(to),
          intensity: 0.72,
        });
      }

      /* --- reload, suppression, weapon clock --- */
      for (const event of member.weapon?.update(step) ?? []) {
        if (event.type === 'loaded') {
          weaponEvent(member, 'loaded', { rounds: event.rounds, loaded: event.loaded });
          playWeaponCue(frame.audio, member.weaponId, 'reload.in', {
            position: member.root.position, volume: 0.35,
          });
        } else if (event.type === 'cycle') {
          weaponEvent(member, 'cycle', event);
          playWeaponCue(frame.audio, member.weaponId, 'cycle', {
            position: member.root.position, volume: 0.35,
          });
        }
      }
      member.suppression.update(step);
      member.actor.suppression = member.suppression.value;

      /* --- who --- */
      member.sinceThink += step;
      if (!member.wounded && member.sinceThink >= ENSEMBLE_THINK_INTERVAL) {
        scanForTarget(member, hostiles, frame.colliders, player);
        member.sinceThink = 0;
      } else if (member.wounded) {
        member.perception.restore({ awareness: 0, memory: 0, lastSeen: null });
        mirrorPerception(member);
      }
      member.perception.tick(step);
      mirrorPerception(member);
      if (!member.targetVisible && member.perception.lastSeen) {
        member.aimPoint.copy(member.perception.lastSeen);
      }
      const best = member.targetVisible ? member.target : null;
      const bestDistance = best ? member.targetDistance : Infinity;

      /* Incoming. A hostile inside twenty metres with a line on him is a man
       * being shot at, and being shot at is the whole reason a friendly ever
       * ducks, flinches or stops firing. */
      if (best && bestDistance < 20) {
        member.suppression.noteNearMiss(Math.max(0.4, bestDistance / 8), 0.16 * step * 10);
      }

      /* --- what he is doing with his hands --- */
      member.businessLeft -= step;
      if (member.businessLeft <= 0) {
        member.businessClock -= step;
        if (member.businessKey) {
          member.businessKey = null;
          poseFor(member.figure, 'stand', member.gun);
        }
        if (member.businessClock <= 0 && !best) {
          const key = nextBusiness(member);
          const plan = key ? BUSINESS[key] : null;
          if (plan) {
            member.businessKey = key;
            member.businessLeft = plan.seconds;
            poseFor(member.figure, plan.pose, member.gun);
            if (key === 'callout') bark(member, 'threat');
            if (key === 'tend') bark(member, 'wounded');
            if (key === 'passMag') bark(member, 'ammo');
            if (key === 'reload' && member.weapon?.reload()) {
              weaponEvent(member, 'reload-start');
              playWeaponCue(frame.audio, member.weaponId, 'reload.out', {
                position: member.root.position, volume: 0.35,
              });
            }
          }
          member.businessClock = 3.6 + (member.index % 7) * 0.6 + Math.random() * 2.4;
        }
      }

      /* --- turn and actual rendered bore --- */
      const hasAim = member.targetVisible || member.perception.hasMemory;
      const interrupted = member.businessKey === 'reload'
        || member.businessKey === 'tend'
        || member.businessKey === 'flinch';
      if (!hasAim) {
        const yaw = Math.atan2(
          member.lookAt.x - member.root.position.x,
          member.lookAt.y - member.root.position.z,
        );
        let delta = yaw - member.root.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        member.root.rotation.y += delta * Math.min(1, step * 5);
      } else if (!interrupted && member.figure.pose !== 'stand') {
        poseFor(member.figure, 'stand', member.gun);
      }
      member.aimFrame = member.weaponAim.update(step, {
        root: member.root,
        weaponModel: member.gun,
        weaponController: member.weapon,
        targetPoint: hasAim ? member.aimPoint : null,
        muzzleHeight: 1.4,
        settleScale: 1 - member.suppression.value * 0.55,
        interrupted,
        pose: (aim) => {
          member.figure.parts.head.rotation.x = -aim.pitch * 0.4;
          if (!interrupted && aim.hasTarget) {
            if (member.gun?.userData?.siegeAimArmR) {
              member.figure.parts.armR.quaternion.copy(member.gun.userData.siegeAimArmR);
            }
          }
          if (member.gun && (!aim.hasTarget || aim.interrupted)) {
            /* The mount roll, not zero -- see armed-pose.js. */
            member.gun.rotation.set(
              -Math.PI / 2 - aim.pitch * 0.2, 0, SIEGE_WEAPON_MOUNT_ROLL,
            );
          }
        },
      });
      if (!interrupted && member.gun?.visible
          && SUPPORTED_WEAPON_POSES.has(member.figure.pose)) {
        trackSiegeWeaponSupport(member.figure, member.gun, { aimFrame: member.aimFrame });
      }
      member.aimAligned = member.aimFrame.aligned;
      member.aimError = member.aimFrame.aimError;
      member.boreError = member.aimFrame.boreError;
      member.aimPitch = member.aimFrame.pitch;

      /* --- fire --- */
      member.figure.update(step, { fear: member.suppression.value * 0.6 });
      if (!best || member.wounded || !member.weapon) continue;
      if (member.businessKey === 'reload' || member.businessKey === 'tend') continue;
      if (member.suppression.value > 0.8) continue;
      if (!member.aimAligned) continue;
      const canFire = !member.weapon.reloading && member.weapon.cooldown <= 0;
      if (member.burst.update(step, canFire)) fireAt(member, best, frame);
    }
    for (const pool of bloodByMember.values()) {
      pool.update(step);
      for (const mesh of pool.meshes) {
        const aspect = mesh.userData.siegePlanAspect;
        if (Number.isFinite(aspect)) mesh.scale.y = mesh.scale.x * aspect;
        const edge = mesh.userData.siegeBloodEdge;
        if (edge) edge.material.opacity = mesh.material.opacity * 0.92;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* The public ensemble                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Everyone a hostile is allowed to shoot at.
   *
   * SNOW IS NEVER IN THIS LIST. Not filtered out of it downstream, not
   * refused by the matrix when somebody asks -- absent. That is the standing
   * constraint as written, and it is one line so that it can be read.
   */
  function targets() {
    return [...members.values()]
      .filter((member) => !member.downed)
      .filter((member) => member.id !== 'snow'
        && member.staged
        && member.root.visible
        && !member.actor.incapacitated)
      .map((member) => member.root);
  }

  function living() {
    return [...members.values()]
      .filter((member) => member.staged && !member.actor.incapacitated)
      .map((member) => member.root);
  }

  /** Complete incoming-hit seam for shared Combat Adapters. */
  function registerHit(impact, { attacker = { faction: FACTIONS.CARTEL } } = {}) {
    const located = impactResolver.resolve(impact, {
      attacker,
      playerShot: false,
      damage: impact?.damage,
      lethalHeadshots: true,
    });
    if (located.applied && located.combatant) {
      located.combatant.suppression.noteNearMiss(0.2, 1);
    }
    return located;
  }

  function snapshot() {
    return {
      beat,
      killBudget,
      friendlyKills,
      fireControl: fireControl.snapshot(),
      members: [...members.values()].map((member) => ({
        id: member.id,
        actor: member.actor.snapshot(),
        weapon: member.weapon?.snapshot() ?? null,
        position: member.root.position.toArray(),
        yaw: member.root.rotation.y,
        visible: member.root.visible,
        staged: member.staged,
        suppression: member.suppression.value,
        perception: member.perception.snapshot(),
        weaponAim: member.weaponAim.snapshot(),
        aimPoint: member.aimPoint.toArray(),
        aimPitch: member.aimPitch,
        aimError: Number.isFinite(member.aimError) ? member.aimError : null,
        boreError: Number.isFinite(member.boreError) ? member.boreError : null,
        sinceThink: member.sinceThink,
        lastShot: member.lastShot ? {
          ...member.lastShot,
          origin: member.lastShot.origin?.toArray?.() ?? null,
          end: member.lastShot.end?.toArray?.() ?? null,
          pellets: member.lastShot.pellets?.map((pellet) => ({
            ...pellet,
            origin: pellet.origin?.toArray?.() ?? null,
            direction: pellet.direction?.toArray?.() ?? null,
            boreDirection: pellet.boreDirection?.toArray?.() ?? null,
            end: pellet.end?.toArray?.() ?? null,
          })) ?? [],
        } : null,
        kills: member.kills,
        shotsFired: member.shotsFired,
        reportedDown: member.reportedDown,
        /* A checkpoint that stands a bleeding man up is the same class of
         * fault as one that stands a dead one up. */
        downed: member.downed,
        downSeconds: member.downSeconds,
        revivedCount: member.revivedCount,
      })),
    };
  }

  /**
   * Put the ensemble back.
   *
   * `stage()` first, so everybody has the right posting and the right beat's
   * kill budget, and THEN the recorded state on top -- otherwise staging
   * would stand a dead guard back up, which is the one thing a checkpoint
   * restore must never do.
   */
  function restore(snap) {
    if (!snap) return false;
    if (snap.beat) stage(snap.beat);
    for (const pool of bloodByMember.values()) pool.reset();
    for (const member of members.values()) member.bloodPool = null;
    killBudget = Number.isFinite(snap.killBudget) ? snap.killBudget : killBudget;
    friendlyKills = Math.max(0, Math.round(snap.friendlyKills ?? 0));
    fireControl.restore(snap.fireControl);
    for (const record of snap.members ?? []) {
      const member = members.get(record.id);
      if (!member) continue;
      member.actor.restore(record.actor);
      if (record.weapon && member.weapon) restoreNpcWeapon(member.weapon, record.weapon);
      member.root.position.fromArray(record.position);
      member.root.rotation.y = Number(record.yaw) || 0;
      member.root.visible = record.visible === true;
      member.staged = record.staged === true;
      member.suppression.value = Number(record.suppression) || 0;
      member.perception.restore(record.perception ?? {
        awareness: 1, memory: 0, lastSeen: null,
      });
      mirrorPerception(member);
      if (Array.isArray(record.aimPoint)) member.aimPoint.fromArray(record.aimPoint);
      else if (member.perception.lastSeen) member.aimPoint.copy(member.perception.lastSeen);
      member.weaponAim.restore(record.weaponAim ?? {
        yaw: record.yaw,
        pitch: record.aimPitch,
        aimError: record.aimError,
        boreError: record.boreError,
      }, { weaponController: member.weapon });
      member.aimFrame = null;
      member.aimAligned = false;
      member.aimError = member.weaponAim.aimError;
      member.boreError = member.weaponAim.boreError;
      member.aimPitch = member.weaponAim.pitch;
      member.sinceThink = Math.max(0, Number(record.sinceThink) || 0);
      member.lastShot = record.lastShot ? {
        ...record.lastShot,
        origin: Array.isArray(record.lastShot.origin)
          ? new THREE.Vector3().fromArray(record.lastShot.origin) : null,
        end: Array.isArray(record.lastShot.end)
          ? new THREE.Vector3().fromArray(record.lastShot.end) : null,
        pellets: Object.freeze((record.lastShot.pellets ?? []).map((pellet) => Object.freeze({
          ...pellet,
          origin: Array.isArray(pellet.origin) ? new THREE.Vector3().fromArray(pellet.origin) : null,
          direction: Array.isArray(pellet.direction)
            ? new THREE.Vector3().fromArray(pellet.direction) : null,
          boreDirection: Array.isArray(pellet.boreDirection)
            ? new THREE.Vector3().fromArray(pellet.boreDirection) : null,
          end: Array.isArray(pellet.end) ? new THREE.Vector3().fromArray(pellet.end) : null,
        }))),
      } : null;
      if (member.gun && member.restGunQuaternion) {
        member.gun.quaternion.copy(member.restGunQuaternion);
      }
      member.kills = Math.max(0, Math.round(record.kills ?? 0));
      member.shotsFired = Math.max(0, Math.round(record.shotsFired ?? 0));
      member.goal.copy(member.root.position);
      member.businessKey = null;
      member.businessLeft = 0;
      /* A man who was already down when the checkpoint was taken must not be
       * announced again on the way back in -- and must not stand up, which
       * is why the pose is applied AFTER the actor is restored rather than
       * by `stage()` before it. */
      member.reportedDown = record.reportedDown === true || member.actor.incapacitated;
      member.downed = record.downed === true;
      member.downSeconds = Number(record.downSeconds) || 0;
      member.revivedCount = Math.max(0, Math.round(record.revivedCount ?? 0));
      /* A restore snaps -- the fall happened before the checkpoint -- so any
       * in-flight crumple is cancelled and the writhe base recaptures. */
      member.figure._poseFrom = null;
      member.writhe = member.downed ? {} : null;
      if (member.actor.incapacitated || member.downed) {
        poseFor(member.figure, 'down', member.gun);
        spillFor(member);
      } else poseFor(member.figure, member.wounded ? 'wounded' : 'stand', member.gun);
    }
    return true;
  }

  function dispose() {
    for (const unregister of impactRegistrations.splice(0)) unregister();
    root.parent?.remove(root);
  }

  return {
    root,
    members,
    stage,
    update,
    snapshot,
    restore,
    registerHit,
    dispose,
    fireControl,
    impactResolver,

    /* ---- everything below is diagnostics, not the contract ---- */
    /** Crew a hostile may engage. Snow is never on it. */
    targets,
    living,
    /**
     * How the family came out of it. For the mission-complete card.
     *
     * ## THIS IS NOT `targets()` AND THE CARD USED TO GET IT WRONG
     *
     * The card counted survivors with `targets().length`, which reported
     * ZERO at the end of a full run. `targets()` is a PERMISSION LIST -- who
     * a hostile is allowed to shoot at right now -- so it excludes Snow by
     * standing constraint, excludes anybody the current beat has no posting
     * for, and excludes everyone on the floor. Three exclusions, none of
     * which mean "dead", and asking it a census question got a census answer
     * of nobody.
     *
     * The distinction that matters at the end of this mission is ALIVE vs
     * DEAD, not standing vs prone: the twelve names in `SURVIVES_THE_SIEGE`
     * go DOWN and stay revivable, and a man Gratin is working on is a man who
     * made it. So `alive` counts everyone not incapacitated, `up` counts the
     * ones on their feet, and the card can say both without either being a
     * lie about the other.
     */
    census() {
      let alive = 0;
      let up = 0;
      let down = 0;
      for (const member of members.values()) {
        if (member.actor.incapacitated) continue;
        alive++;
        if (member.downed) down++; else up++;
      }
      return { total: members.size, alive, up, down };
    },
    /** The current beat, or null before `stage()` has been called. */
    get beat() { return beat; },
    /** How many attackers the friendlies still have permission to finish. */
    get killBudget() { return killBudget; },
    /** How many they have finished. Read this against the player's count. */
    get friendlyKills() { return friendlyKills; },
    /**
     * The house was hit near somebody. Everyone within `radius` ducks.
     *
     * Called by the scene when glass goes or a round comes through a wall --
     * "flinching when rounds strike near", which is on the brief's list and
     * is not something this module can observe on its own.
     *
     * THE DUCK AND THE SUPPRESSION ARE TWO DIFFERENT RADII, and the second
     * one is not this module's to choose. Everybody inside `radius` flinches,
     * because a round through a window six metres away is something you
     * react to. Whether it also PINS you is `SuppressionModel.noteNearMiss`'s
     * decision, and its own band is four metres -- so a hit at the edge of
     * the flinch radius moves a man without pinning him, which is correct and
     * is the shared model saying so rather than a number invented here.
     */
    /**
     * Everyone on the floor right now, nearest last is nobody's business --
     * the scene sorts. Each entry carries how long he has been down, which is
     * what a HUD wants to show and what the aftermath wants to read.
     */
    downed() {
      return [...members.values()]
        .filter((member) => member.downed)
        .map((member) => ({
          id: member.id,
          name: member.name,
          seconds: member.downSeconds,
          position: member.root.position,
          revivedCount: member.revivedCount,
        }));
    },

    /**
     * Pick a man up.
     *
     * He comes back at a THIRD of his health, not full: the point of crossing
     * the landing under fire is that it costs something and that he is fragile
     * afterwards, not that the last two minutes are undone. He can go down
     * again -- `revivedCount` counts it, so a scene that wants to make the
     * third time harder has the number.
     */
    revive(id) {
      const member = members.get(id);
      if (!member?.downed) return false;
      member.downed = false;
      member.downSeconds = 0;
      member.revivedCount += 1;
      member.actor.health = Math.max(2, Math.round(member.actor.maxHealth / 3));
      member.actor.armor = 0;
      member.actor.setInjury('moderate');
      member.reportedDown = false;
      /* Cancel any in-flight crumple and the writhe base: he is being stood
       * up by hand, and a live blend would drag him back to the floor. */
      member.figure._poseFrom = null;
      member.writhe = null;
      poseFor(member.figure, 'stand', member.gun);
      /* The stain is evidence, not a status light. Leave it on the floor but
       * mark this member's lease inactive so his own later fall may recycle
       * it without ever taking the live pool from somebody still down. */
      if (member.bloodPool?.userData.memberId === member.id) {
        member.bloodPool.userData.activeDown = false;
      }
      member.bloodPool = null;
      bark(member, 'revived');
      return true;
    },

    /** The nearest downed man within `radius` of a point, or null. */
    nearestDowned(position, radius = 2.4) {
      let best = null;
      let bestDistance = radius;
      for (const member of members.values()) {
        if (!member.downed) continue;
        const d = member.root.position.distanceTo(position);
        if (d < bestDistance) { bestDistance = d; best = member; }
      }
      return best ? { id: best.id, name: best.name, distance: bestDistance } : null;
    },

    noteImpact(point, radius = 6) {
      let touched = 0;
      for (const member of members.values()) {
        if (!member.staged || member.actor.incapacitated) continue;
        const d = member.root.position.distanceTo(point);
        if (d > radius) continue;
        member.suppression.noteNearMiss(d, 1);
        if (!member.wounded) {
          member.businessKey = 'flinch';
          member.businessLeft = BUSINESS.flinch.seconds;
          poseFor(member.figure, 'flinch', member.gun);
        }
        touched++;
      }
      return touched;
    },
    /** The mission's survival flag, readable so a test can prove it exists. */
    survives: (id) => SURVIVES_THE_SIEGE.includes(id),
    /** Every posting this ensemble will ever stand on. For the keep-clear check. */
    allPosts: () => ROSTER.flatMap((definition) => Object.entries(definition.posts)
      .map(([name, post]) => ({ id: definition.id, beat: name, ...post }))),
  };
}
