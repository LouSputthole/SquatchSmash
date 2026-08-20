import * as THREE from 'three';

import { CombatActor } from '../core/combat/actors.js';
import { FACTIONS } from '../core/combat/factions.js';
import { SAUCE } from '../core/wardrobe.js';
import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { buildWeaponModel } from '../core/weapons/models.js';
import { HeistFigure } from '../heist/people.js';
import { CombatArmorPresentation } from '../world/combat-armor.js';
import { palaceGuardVoice } from './voice.js';
import { PALACE_ANCHORS } from './world.js';

export const PALACE_GUARD_POSTS = Object.freeze([
  Object.freeze({ id: 'gate-one', x: 9.2, z: 54, yaw: Math.PI, weapon: WEAPON_IDS.PISTOL9, patrol: [[9.2, 54], [7.2, 48]] }),
  Object.freeze({ id: 'guardhouse', x: 9.1, z: 44, yaw: -Math.PI / 2, weapon: WEAPON_IDS.CARBINE, patrol: [[9.1, 44], [6.5, 39]] }),
  /* Patrols must clear the courtyard water colliders: the fountain basin is
   * solid across x +-3.2, z 31.8..38.2 and the reflecting pool across
   * x -17..-5, z 15..23. Legs route around the basins, and since patrolIndex
   * wraps modulo the list, the routes ping-pong so the closing leg is legal
   * too. */
  Object.freeze({ id: 'fountain', x: 5.5, z: 34, yaw: Math.PI * 0.7, weapon: WEAPON_IDS.PISTOL9, patrol: [[5.5, 34], [4.6, 30.4], [-4, 30.4], [4.6, 30.4]] }),
  Object.freeze({ id: 'pool', x: -4.2, z: 22, yaw: Math.PI * 0.2, weapon: WEAPON_IDS.CARBINE, patrol: [[-4.2, 22], [-4.2, 14], [-13, 14], [-4.2, 14]] }),
  Object.freeze({ id: 'service-door', x: 13.5, z: 15.2, yaw: 0, weapon: WEAPON_IDS.PISTOL9, patrol: [[13.5, 15.2], [8, 18]] }),
  /* The watch desk in the entry hall, added by the 2026-08-20 owner playtest
   * pass: *"a cartel guard seated at a computer facing roughly toward the
   * entrance"*. He has NO patrol -- he is sitting down (see `seated` and
   * `seatedPose` below) -- and yaw ~0 is +Z under the aim convention, which
   * is straight at the front door at z 12. His chair is at (15.6, 5.62) and
   * the desk is 2.6 x 1.0 at (15.6, 6.6), so he sits clear of its south
   * face with the keyboard in reach. */
  Object.freeze({
    id: 'entry-watch', x: 15.6, z: 5.35, yaw: 0.06, weapon: WEAPON_IDS.PISTOL9,
    patrol: null, seated: true,
  }),
  Object.freeze({ id: 'service-hall', x: 14.4, z: -1.5, yaw: Math.PI, weapon: WEAPON_IDS.PISTOL9, patrol: [[14.4, -1.5], [14.4, -12]] }),
  Object.freeze({ id: 'gallery-east', x: 6.4, z: -21.5, yaw: Math.PI, weapon: WEAPON_IDS.CARBINE, patrol: [[6.4, -21.5], [6.4, -30]] }),
  Object.freeze({ id: 'gallery-west', x: -6.4, z: -29, yaw: 0, weapon: WEAPON_IDS.PISTOL9, patrol: [[-6.4, -29], [-6.4, -19]] }),
]);

const GUARD_LOOKS = Object.freeze([
  Object.freeze({ height: 1.79, build: 1.14, dress: 'work', shirt: 0x2a2e26, hair: 'crop', skin: 0xb87a4e }),
  Object.freeze({ height: 1.72, build: 1.06, dress: 'work', shirt: 0x24281f, hair: 'short', skin: 0x8d5a3a }),
  Object.freeze({ height: 1.86, build: 1.24, dress: 'work', shirt: 0x1b1e22, hair: 'bald', skin: 0xc08a5e, beard: true }),
  Object.freeze({ height: 1.75, build: 1.32, dress: 'work', shirt: 0x32372e, hair: 'crop', skin: 0xd9a97f }),
]);

/*
 * The begging trio at Mark's table — owner's 2026-08-19 direction: "the wife
 * and the two short people should beg you not to kill Mark or kill anyone."
 * They are CIVILIANS, not Combatants: no weapons, no faction, never in the
 * cast's `all` list, so PalaceSecurity builds no firearm/perception runtime
 * for them, a combat checkpoint never records them, and no guard ever aims
 * at them. Their roots ARE hit targets — the player's fire can put them down,
 * with full blood, and the mission does not count them either way.
 */
const PALACE_CIVILIAN_POSTS = Object.freeze([
  /* Mark's wife, at his shoulder by the west sideboard. Cartel money: the
   * gown, the gold, the luxury ribbing — the roster's own glamour kit. */
  Object.freeze({
    id: 'wife', x: -6.6, z: -44.6, yaw: 0.32,
    look: Object.freeze({
      height: 1.72, build: 0.98, gender: 'female', bodyShape: 'curvy',
      dress: 'gown', gownStrapWidth: 0.034, shirt: 0x7c1228, shirtAccent: 0xd8b46a,
      hair: 'long', hairColour: 0x1a0f0a, skin: 0xd9a97f,
      luxury: true, trim: true, belt: 'gold', watch: 'gold', chain: 'gold',
    }),
  }),
  /* The double act: visibly short (~1.5 m against a 1.9 m boss), matching
   * midnight suits so they read as one unit finishing each other's
   * sentences. Big Paco has two centimetres on Little Paco, and it matters. */
  /* Owner, 2026-08-20 playtest: *"both should be white, no beard, plain
   * civilian clothes (not expensive suits). Keep them visually distinct
   * through hair, shirt colour and build rather than ethnicity or facial
   * hair."* They were matching midnight three-pieces with a beard on one.
   *
   * They now read as two men who work here rather than two men who own the
   * place: work shirts, no trim, no waistcoats. Big Paco is heavier with a
   * dark mop; Little Paco is slighter, fair and receding. Two centimetres
   * still separate them, and it still matters. */
  Object.freeze({
    id: 'short-one', x: 5.9, z: -44.8, yaw: -0.28,
    look: Object.freeze({
      height: 1.5, build: 1.24, dress: 'work', shirt: 0x4b5a6b,
      hair: 'crop', hairColour: 0x2b2119, skin: 0xe3bfa0,
    }),
  }),
  Object.freeze({
    id: 'short-two', x: 7.3, z: -44.4, yaw: -0.42,
    look: Object.freeze({
      height: 1.48, build: 0.96, dress: 'work', shirt: 0x7c6a4a,
      hair: 'short', hairColour: 0xa8813f, skin: 0xeed0b4,
    }),
  }),
]);

/*
 * THE WORKING CIVILIANS.
 *
 * Owner, 2026-08-20 playtest: *"an unarmed cleaning lady / civilian nearby
 * who panics and cowers rather than fighting when shooting starts, with
 * lines like 'Don't shoot! Don't shoot!'"*, and *"the first five seconds
 * inside should say people lived and worked here before the player kicked
 * the door in"*.
 *
 * Rosa is a civilian in exactly the sense the begging trio are: hit zones, a
 * small health pool, no weapon, no faction, no CombatActor, and no entry in
 * anything the mission counts. She stands at her cart by the entry hall's
 * west wall. `cowerAt` is where she ends up when the shooting starts -- the
 * corner behind the bench, out of the door-to-corridor lane.
 */
const PALACE_BYSTANDER_POSTS = Object.freeze([
  Object.freeze({
    id: 'cleaner', x: 12.15, z: 3.1, yaw: 1.5,
    /* Clear of the entry bench's collider (x 10.79..11.51, z -5.5..-3.3) and
     * out of the lane from the door to the corridor. */
    cowerAt: Object.freeze([11.7, -6.9]),
    look: Object.freeze({
      height: 1.6, build: 1.02, gender: 'female', dress: 'work', shirt: 0x3f6b74,
      hair: 'long', hairColour: 0x241811, skin: 0xa8703f,
    }),
  }),
]);

const MARK_LOOK = Object.freeze({
  height: 1.9,
  build: 1.34,
  dress: 'suit',
  shirt: 0x16191c,
  /* The shared cast accepts a bounded style vocabulary. `slick` used to fall
   * through every branch and render Mark bald; `short` preserves the authored
   * dark, close-styled look using real shared hair geometry. */
  hair: 'short',
  hairColour: 0x17110e,
  skin: 0xac744e,
  beard: true,
  belt: 'leather',
  watch: 'gold',
  threePiece: true,
});

/**
 * WHICH WAY UP A GUN SITS IN A HAND THAT IS NOT AIMING IT.
 *
 * Owner, 2026-08-20 playtest: *"Mark's gun orientation is wrong -- fix the
 * grip/socket so he holds it normally."*
 *
 * The socket MATH was never wrong, and that is what made this hard to see.
 * `rotation.x = -PI/2` puts the catalog's local -Z bore down the forearm's
 * -Y, which is the documented convention and exactly what
 * `CombatWeaponAim._steerAndSample` expects to start from. Measured on this
 * cast, every man's bore came out correct.
 *
 * What was wrong was the ROLL. A rotation of -90 degrees about X carries the
 * model's +Y -- its rib, its sights, its ejection port, the whole "up" of
 * the gun -- onto the forearm's -Z, which in the armed pose points at the
 * floor. Every weapon in the estate sat sights-down, grip-up: upside down,
 * with a world up-vector of (0, -0.99, 0).
 *
 * Nobody noticed on the guards because a guard is only ever seen aiming, and
 * the moment `CombatWeaponAim` has a target it OVERWRITES this quaternion
 * with its own roll-stable lookAt basis (see aim.js's "WHICH WAY UP THE GUN
 * IS" note) and the roll comes out right. Mark is the exception, and that is
 * the whole report: he is `active = false` with `phase = 'armored'` through
 * the entire dining-room confrontation, so he never aims, `_pose` never
 * runs, and the player stands three metres away staring at the rest pose for
 * thirty seconds of dialogue. Sauce beside him had it too.
 *
 * The fix is one extra term. Rz(180) rolls the model about its own bore
 * before the bore is laid down the arm, so:
 *
 *   model -Z (bore)   -> forearm -Y   (unchanged: aiming still starts right)
 *   model +Y (sights) -> forearm +Z   (which is world UP in the armed pose)
 *
 * Three.js's default Euler order is XYZ, i.e. R = Rx * Ry * Rz, so
 * `set(-PI/2, 0, PI)` is exactly Rx(-90) . Rz(180). `restGunQuaternion` is
 * cloned off this model in PalaceSecurity's constructor, so the rest pose it
 * restores after a reload or a flinch picks the correction up for free.
 */
function attachWeapon(figure, weaponId, name) {
  let model = null;
  try { model = buildWeaponModel(weaponId); } catch { return null; }
  model.name = name;
  model.position.set(0, -0.3, 0.05);
  model.rotation.set(-Math.PI / 2, 0, Math.PI);
  model.scale.setScalar(0.84);
  figure.parts.foreR.add(model);
  return model;
}

function armedPose(figure) {
  figure.parts.armR.rotation.set(-1.28, 0, 0.16);
  figure.parts.foreR.rotation.set(-0.16, 0, 0);
  figure.parts.armL.rotation.set(-1.2, 0, -0.34);
  figure.parts.foreL.rotation.set(-0.3, 0.3, 0);
  figure.pose = 'aiming';
}

/**
 * SITTING DOWN, WITHOUT A SIT POSE IN THE SHARED RIG.
 *
 * `HeistFigure` ships stand / startled / pleading / kneeling / prone /
 * restrained / bolting / alarm / aiming / fallen and nothing between them,
 * and the rig is shared with three other scenes -- so the Palace writes its
 * own joints here exactly the way `armedPose` above does, rather than
 * reaching into `src/heist/people.js` for one desk.
 *
 * `figure.update` only overwrites joints for the `bolting` cycle and the
 * down/fallen guard, so a hand-written pose survives every frame the man is
 * left alone. The moment he is not -- see `standUp` -- he goes back to the
 * shared `aiming()` pose and his sidearm comes off the blotter.
 */
function seatedPose(figure) {
  figure.parts.armR.rotation.set(-0.62, 0, 0.1);
  figure.parts.foreR.rotation.set(-1.15, -0.4, 0);
  figure.parts.armL.rotation.set(-0.56, 0, -0.12);
  figure.parts.foreL.rotation.set(-1.1, 0.4, 0);
  figure.parts.legL.rotation.set(-1.42, 0, 0.07);
  figure.parts.legR.rotation.set(-1.42, 0, -0.07);
  figure.parts.shinL.rotation.x = 1.38;
  figure.parts.shinR.rotation.x = 1.38;
  figure.parts.body.rotation.x = 0.06;
  /* The rig is authored standing, so a seated pose has to drop the hips onto
   * the chair. 0.46 m is the watch chair's seat height minus the cushion. */
  figure.tilt.position.y = -0.44 * (figure.scale ?? 1);
  figure.pose = 'seated';
  return figure;
}

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

function makeCombatant({
  id, role, x, z, yaw = 0, model, weapon, health, armor = 0, patrol = null, seated = false,
  voice = null,
}) {
  const figure = new HeistFigure({
    name: `palace-${id}`, x, z, yaw, model, tier: role === 'boss' || role === 'traitor' ? 'hero' : 'ambient',
  });
  tagHitZones(figure);
  armedPose(figure);
  const weaponModel = attachWeapon(figure, weapon, `palace-${id}-${weapon}`);
  if (seated) {
    seatedPose(figure);
    /* His sidearm is on the blotter in front of him (world.js builds it as
     * `entry-watch-desk.sidearm`), which is why a man at a keyboard is not
     * holding a pistol. `standUp` puts it back in his hand. */
    if (weaponModel) weaponModel.visible = false;
  }
  const actor = new CombatActor({
    id: `palace-${id}`, faction: FACTIONS.CARTEL, maxHealth: health, armor,
  });
  actor.role = role;
  const entry = {
    id,
    role,
    root: figure.root,
    figure,
    actor,
    weapon,
    weaponModel,
    /* WHICH OF THE THREE HE IS. The payroll was one voice until 2026-08-20;
     * a body that does not know its own profile cannot hold a conversation
     * with another body, because both halves come back the same man. See
     * ./voice.js's PALACE_GUARD_VOICE_CAST. */
    voice,
    armed: Boolean(weaponModel),
    seated,
    patrol: patrol?.map(([px, pz]) => new THREE.Vector3(px, 0, pz)) ?? [],
    patrolIndex: 0,
    awareness: 0,
    active: role === 'guard',
    down: false,
  };
  entry.armorPresentation = armor > 0
    ? new CombatArmorPresentation({
      body: figure.parts.body,
      actor,
      tier: role === 'boss' || armor >= 20 ? 'heavy' : 'light',
    })
    : null;
  figure.root.userData.palaceCombatant = entry;
  /* Shared Located-hit protocol. The legacy Palace tag remains while older
   * authored interactions finish migrating to the game-wide Combat Adapter. */
  figure.root.userData.combatant = entry;
  figure.root.userData.combatActor = actor;
  figure.root.userData.faction = FACTIONS.CARTEL;
  return entry;
}

/** One begging civilian: a body with hit zones, health, and no gun. */
function makeCivilian({ id, x, z, yaw, look, cowerAt = null }) {
  const figure = new HeistFigure({
    /* Ambient tier, like the guards: three more shadow-casting rigs is real
     * frame cost on the software-GL verifier for people who spend the whole
     * mission behind a sealed door. */
    name: `palace-${id}`, x, z, yaw, model: look, tier: 'ambient',
  });
  tagHitZones(figure);
  const entry = {
    id,
    role: 'civilian',
    root: figure.root,
    figure,
    /* A plain pool, not a CombatActor: civilians are outside faction combat
     * and outside Durable combat state. One centre-mass rifle round or any
     * head hit ends them — this is not a fight, it is a consequence. */
    health: 40,
    down: false,
    active: true,
    /* Where this person goes when the shooting starts, if anywhere. The
     * begging trio have none: they are already at the table the fight
     * happens over. */
    cowerAt: Array.isArray(cowerAt) ? new THREE.Vector3(cowerAt[0], 0, cowerAt[1]) : null,
    panicked: false,
  };
  figure.root.userData.palaceCivilian = entry;
  return entry;
}

/** Cast for the final mission: patrols on the route, then Mark and Sauce. */
export function buildPalaceCast(parent) {
  const guards = PALACE_GUARD_POSTS.map((post, index) => makeCombatant({
    ...post,
    role: 'guard',
    voice: palaceGuardVoice(post.id),
    model: { ...GUARD_LOOKS[index % GUARD_LOOKS.length], bandana: true },
    health: post.weapon === WEAPON_IDS.CARBINE ? 105 : 82,
    armor: post.weapon === WEAPON_IDS.CARBINE ? 24 : 8,
  }));

  const mark = makeCombatant({
    id: 'mark', role: 'boss',
    x: PALACE_ANCHORS.mark.x, z: PALACE_ANCHORS.mark.z, yaw: 0,
    model: MARK_LOOK,
    weapon: WEAPON_IDS.AK47,
    health: 460,
    armor: 170,
  });
  mark.active = false;
  mark.phase = 'armored';

  const sauce = makeCombatant({
    id: 'sauce', role: 'traitor',
    x: PALACE_ANCHORS.sauce.x, z: PALACE_ANCHORS.sauce.z, yaw: 0,
    model: SAUCE,
    weapon: WEAPON_IDS.PISTOL9,
    health: 115,
    armor: 0,
  });
  sauce.active = false;

  /* Present at the table from the first frame: the dining room is sealed
   * until the betrayal beat opens its doors, so the trio is simply already
   * at dinner when the player arrives — no staging hook to miss. */
  const civilians = PALACE_CIVILIAN_POSTS.map((post) => makeCivilian(post));
  /* The working civilians -- today, the cleaner in the entry hall. Same
   * shape as the begging trio and the same consequences, but kept out of
   * `civilians` so the finale director's roster stays the three people at
   * Mark's table. */
  const bystanders = PALACE_BYSTANDER_POSTS.map((post) => makeCivilian(post));

  const all = [...guards, mark, sauce];
  for (const entry of [...all, ...civilians]) parent.add(entry.root);

  function activateFinalEncounter() {
    mark.active = !mark.down;
    sauce.active = !sauce.down;
    return true;
  }

  /**
   * The watch-desk guard gets out of his chair.
   *
   * Called by PalaceSecurity the frame his awareness crosses the
   * investigate threshold or the alarm goes up -- so the first thing the
   * player sees when the front door comes in is a man at a keyboard, and the
   * second is that man standing up and reaching for the gun on the desk.
   * Idempotent: a second call on a man already standing does nothing.
   */
  function standUp(entry) {
    if (!entry?.seated || entry.down) return false;
    entry.seated = false;
    entry.figure.aiming();
    entry.figure.tilt.position.y = 0;
    if (entry.weaponModel) entry.weaponModel.visible = true;
    return true;
  }

  function markDown(entry, { reaction = null } = {}) {
    if (!entry || entry.down) return false;
    entry.down = true;
    entry.active = false;
    const roll = Number.isFinite(reaction?.roll)
      ? reaction.roll : entry.id === 'mark' ? -0.42 : 0.38;
    entry.figure.setState?.('down', { blend: true, roll });
    if (!entry.figure.setState) entry.figure.fallen({ roll });
    if (entry.weaponModel) entry.weaponModel.visible = false;
    return true;
  }

  /** Put a begging civilian on the floor. Presentation only: no mission call. */
  /** Put a civilian on the floor -- begging trio or working bystander. */
  function civilianDown(entry, { roll = 0.42 } = {}) {
    if (!entry || entry.role !== 'civilian' || entry.down) return false;
    entry.down = true;
    entry.active = false;
    entry.figure.setState?.('down', { blend: true, roll });
    return true;
  }

  return {
    root: parent,
    all,
    guards,
    mark,
    sauce,
    civilians,
    bystanders,
    /* Everything the player's rounds can find: combatants, the begging trio
     * and the working civilians. `civilians` deliberately stays the DINING
     * TRIO alone -- the finale director owns that list by name and a fourth
     * entry in it would be a fourth person in Mark's dining room. */
    hitTargets: [...all, ...civilians, ...bystanders].map((entry) => entry.root),
    activateFinalEncounter,
    standUp,
    markDown,
    civilianDown,
  };
}
