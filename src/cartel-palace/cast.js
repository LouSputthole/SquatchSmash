import * as THREE from 'three';

import { CombatActor } from '../core/combat/actors.js';
import { FACTIONS } from '../core/combat/factions.js';
import { SAUCE } from '../core/wardrobe.js';
import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { mountCharacterWeapon } from '../core/weapons/character-mount.js';
import { buildWeaponModel } from '../core/weapons/models.js';
import { HeistFigure } from '../heist/people.js';
import { CombatArmorPresentation } from '../world/combat-armor.js';
import { dressInATeamColours } from '../world/ateam.js';
import { palaceGuardVoice } from './voice.js';
import { PALACE_ANCHORS } from './anchors.js';

/* `makePerson`'s `face` builds an <img>, so a photographed figure cannot be
 * constructed under `node --test`. Same `createElementNS` test as
 * src/heist/cast.js: the headless suite gets the authored head, the browser
 * gets the photograph. Sauce's landed on 2026-09-01 and this scene never
 * asked for it -- owner, the next day: "I'm not seeing the new faces on the
 * characters for ... Sauce." */
const CAN_PAINT_FACES = typeof document !== 'undefined'
  && typeof document.createElementNS === 'function';
const SAUCE_FACE = 'assets/faces/sauce.png';

/** Mark's first stage, in his plates. See the note at his build. */
export const MARK_ARMORED_HEALTH = 690;
export const MARK_ARMOR = 255;

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
  /* LOLA AND JOHNNY.
   *
   * Owner, 2026-08-25: *"chose to kill his two short people. Rename them Lola
   * and Johnny."* They were Big Paco and Little Paco, and the names are gone
   * from the ids, the slugs, the subtitles and every line that used them --
   * which retires seventeen recorded takes, unavoidably: the words themselves
   * had their names in them.
   *
   * They are still the double act. Visibly short -- about 1.5 m against a
   * 1.9 m boss -- so they read as a unit from across the room, and still
   * distinguished by hair, build and shirt rather than by anything else,
   * which was the owner's earlier direction about this pair. Two centimetres
   * separate them and it still matters to them.
   *
   * LOLA IS A WOMAN, which is an inference from the name rather than an
   * instruction: they were authored as two men, and the earlier direction on
   * this pair was about clothes and hair, not gender. One line here reverses
   * it if that reading is wrong.
   *
   * They work for Sauce -- the owner calls them "his two short people" -- and
   * that is the whole reason the new fight turns on them: Mark does not care
   * about the chef's staff until somebody shoots them in his dining room. */
  Object.freeze({
    id: 'lola', x: 5.9, z: -44.8, yaw: -0.28,
    look: Object.freeze({
      height: 1.5, build: 1.16, gender: 'female', bodyShape: 'curvy',
      dress: 'work', shirt: 0x4b5a6b,
      hair: 'tied', hairColour: 0x2b2119, skin: 0xe3bfa0,
    }),
  }),
  Object.freeze({
    id: 'johnny', x: 7.3, z: -44.4, yaw: -0.42,
    look: Object.freeze({
      height: 1.48, build: 0.96, dress: 'work', shirt: 0x7c6a4a,
      hair: 'short', hairColour: 0xa8813f, skin: 0xeed0b4,
    }),
  }),
]);

/*
 * THE WAVE MARK SENDS WHEN HIS ARMOUR GOES.
 *
 * Owner, 2026-08-25: *"you fight him and knock down his amour then he retreats
 * and then sends a wave of A team members who you blast and then he comes out
 * again enraged."*
 *
 * These are the same organisation that comes over the wall at Lou's mansion --
 * they wear the crew's own colours, out of `src/world/ateam.js`, which is why
 * that garment stopped living inside the Siege. Four of them, because the
 * dining room is one room with two ways into it and a wave the player cannot
 * see the end of is a war of attrition rather than a beat.
 *
 * They are built at BOOT and parked inactive and invisible, not spawned. The
 * whole of `PalaceSecurity` -- perception runtimes, the impact resolver's
 * registrations, the checkpoint snapshot, the separation pass -- walks
 * `cast.all` once at construction, so a man who exists from the first frame
 * needs none of that wired twice. Invisible is also unhittable: WeaponSystem
 * filters its raycast on world visibility, so nobody can shoot a man who has
 * not arrived through the wall he is standing behind.
 *
 * They come in through the two openings the room actually has: the double
 * doors the player used, and the extraction gate behind Mark's table.
 */
export const PALACE_WAVE_POSTS = Object.freeze([
  Object.freeze({
    id: 'wave-doors-west', x: -2.2, z: -35.4, yaw: Math.PI,
    enterFrom: Object.freeze([-2.2, -32.35]),
    weapon: WEAPON_IDS.CARBINE, health: 96, armor: 12,
  }),
  Object.freeze({
    id: 'wave-doors-east', x: 2.4, z: -35.4, yaw: Math.PI,
    enterFrom: Object.freeze([2.4, -32.35]),
    weapon: WEAPON_IDS.PISTOL9, health: 82, armor: 0,
  }),
  Object.freeze({
    id: 'wave-back-west', x: -2.6, z: -48.6, yaw: 0,
    enterFrom: Object.freeze([-2.6, -51.35]),
    weapon: WEAPON_IDS.CARBINE, health: 96, armor: 12,
  }),
  Object.freeze({
    id: 'wave-back-east', x: 2.6, z: -48.6, yaw: 0,
    enterFrom: Object.freeze([2.6, -51.35]),
    weapon: WEAPON_IDS.SHOTGUN, health: 110, armor: 8,
  }),
]);

/* Authored threshold paths, owned with the bodies that traverse them.
 *
 * The front pair begin north of the open dining doors at z -34.15. The rear
 * pair begin inside the extraction vestibule, north of the closed exterior
 * gate but south of the rear-wall opening. Mark uses those same readable
 * seams: the open dining doors for his first return and the rear opening for
 * the last stand. These are presentation paths, not navigation patrols; the
 * shared combat runtime takes over only after the actor crosses the target. */
const PALACE_FINALE_PATHS = Object.freeze({
  markExit: Object.freeze([-1.8, -32.35]),
  armoredFrom: Object.freeze([0, -32.35]),
  armoredAt: Object.freeze([0, -36.4]),
  armoredFace: Object.freeze([0, -42]),
  finalFrom: Object.freeze([0, -51.35]),
  finalAt: Object.freeze([0, -47.8]),
  finalFace: Object.freeze([0, -40]),
});

const PRESENTATION_SPEED = 3.35;

/** Four different men, not one man four times. */
const WAVE_LOOKS = Object.freeze([
  Object.freeze({ height: 1.84, build: 1.18, dress: 'work', shirt: 0x2f342a, hair: 'crop', hairColour: 0x1a1310, skin: 0xb87a4e, bandana: true }),
  Object.freeze({ height: 1.75, build: 1.04, dress: 'tee', shirt: 0x33302a, hair: 'bald', skin: 0x8d5a3a, beard: true, bandana: true }),
  Object.freeze({ height: 1.88, build: 1.3, dress: 'work', shirt: 0x2a3026, hair: 'short', hairColour: 0x241913, skin: 0xc08a5e, bandana: true }),
  Object.freeze({ height: 1.72, build: 1.1, dress: 'tracksuit', shirt: 0x262b26, hair: 'tied', hairColour: 0x14100e, skin: 0x9c6c4d, bandana: true }),
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
 * The rotation and per-model grip anchor now live in the shared character
 * mount. `restGunQuaternion` is cloned off this model in PalaceSecurity's
 * constructor, so the rest pose it restores after a reload or a flinch keeps
 * the correction for free.
 */
function attachWeapon(figure, weaponId, name) {
  let model = null;
  try { model = buildWeaponModel(weaponId); } catch { return null; }
  return mountCharacterWeapon(figure, weaponId, model, { name, scale: 0.84 });
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

/* Rosa needs to read as the housekeeper before her first line, without
 * widening the shared `work` outfit for every guard and extra in the game.
 * The Palace adapter adds a pale apron, straps, pocket and cleaning cloth to
 * the shared figure's torso. Every piece carries one semantic marker so the
 * scene contract can prove the role from the rendered hierarchy. */
const HOUSEKEEPER_APRON = new THREE.MeshStandardMaterial({ color: 0xd9ddd4, roughness: 0.97 });
const HOUSEKEEPER_TRIM = new THREE.MeshStandardMaterial({ color: 0x8ea5a0, roughness: 0.95 });

function housekeeperPiece(name, size, position, material = HOUSEKEEPER_APRON) {
  const piece = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  piece.name = name;
  piece.position.set(...position);
  piece.castShadow = true;
  piece.userData.housekeeperUniformPiece = true;
  piece.userData.palaceNoncombatant = true;
  return piece;
}

function dressAsHousekeeper(entry) {
  const torso = entry?.figure?.parts?.body;
  if (!torso?.add) return false;
  const apron = housekeeperPiece('housekeeper.apron.skirt', [0.34, 0.56, 0.035], [0, 1.02, 0.17]);
  const bib = housekeeperPiece('housekeeper.apron.bib', [0.27, 0.31, 0.035], [0, 1.39, 0.17]);
  const strapLeft = housekeeperPiece('housekeeper.apron.strap.left', [0.05, 0.38, 0.025], [-0.105, 1.53, 0.145]);
  const strapRight = housekeeperPiece('housekeeper.apron.strap.right', [0.05, 0.38, 0.025], [0.105, 1.53, 0.145]);
  strapLeft.rotation.z = -0.1;
  strapRight.rotation.z = 0.1;
  const pocket = housekeeperPiece('housekeeper.apron.pocket', [0.17, 0.14, 0.018], [0, 1.03, 0.195], HOUSEKEEPER_TRIM);
  const cloth = housekeeperPiece('housekeeper.cleaning-cloth', [0.13, 0.3, 0.025], [0.205, 0.92, 0.17], HOUSEKEEPER_TRIM);
  cloth.rotation.z = -0.16;
  torso.add(apron, bib, strapLeft, strapRight, pocket, cloth);
  entry.occupation = 'housekeeper';
  entry.root.userData.palaceOccupation = 'housekeeper';
  entry.root.userData.palaceNoncombatant = true;
  return true;
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
    /* Owner, 2026-09-02: "give Mark slightly more health -- like fifty
     * percent more on each stage." 460 / 170 became 690 / 255 here, and
     * the last stand went 260 -> 390 (320 -> 480 enraged) in main.js. */
    health: MARK_ARMORED_HEALTH,
    armor: MARK_ARMOR,
  });
  mark.active = false;
  mark.phase = 'armored';
  mark.armorMax = MARK_ARMOR;

  const sauce = makeCombatant({
    id: 'sauce', role: 'traitor',
    x: PALACE_ANCHORS.sauce.x, z: PALACE_ANCHORS.sauce.z, yaw: 0,
    model: CAN_PAINT_FACES ? { ...SAUCE, face: SAUCE_FACE } : SAUCE,
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
  for (const entry of bystanders) {
    if (entry.id === 'cleaner') dressAsHousekeeper(entry);
  }

  /* Mark's reprisal, standing behind two walls with the lights off. */
  const wave = PALACE_WAVE_POSTS.map((post, index) => {
    const entry = makeCombatant({
      ...post,
      role: 'wave',
      voice: palaceGuardVoice(post.id),
      model: WAVE_LOOKS[index % WAVE_LOOKS.length],
    });
    /* The crew's own colours, off the shared garment. */
    dressInATeamColours(entry.figure.parts.body, { extra: { palaceWave: true } });
    entry.active = false;
    /* Invisible AND unhittable: WeaponSystem filters its raycast on world
     * visibility, so a man who has not arrived cannot be shot through the
     * wall he is waiting behind. */
    entry.root.visible = false;
    entry.presentation = 'waiting';
    entry.stagingTarget = entry.root.position.clone();
    entry.entryFrom = new THREE.Vector3(post.enterFrom[0], 0, post.enterFrom[1]);
    return entry;
  });

  const all = [...guards, mark, sauce, ...wave];
  for (const entry of [...all, ...civilians, ...bystanders]) parent.add(entry.root);

  /* One cast-owned motion lane for every scripted entrance and exit. The
   * director decides WHEN; this module decides WHERE the body is on every
   * frame. Combatants stay visible and shootable while crossing, but inactive
   * so shared combat AI cannot fire from outside the room. */
  const presentationMotions = new Map();

  function faceFromTo(entry, from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (Math.hypot(dx, dz) > 1e-6) entry.root.rotation.y = Math.atan2(dx, dz);
  }

  function facePoint(entry, point) {
    faceFromTo(entry, entry.root.position, point);
  }

  function finishPresentation(motion) {
    const { entry } = motion;
    entry.root.position.copy(motion.to);
    if (motion.face) facePoint(entry, motion.face);
    presentationMotions.delete(entry.id);
    if (motion.hideAtEnd) {
      entry.root.visible = false;
      entry.active = false;
      entry.presentation = 'away';
      return;
    }
    entry.root.visible = true;
    entry.active = !entry.down && motion.activateAtEnd;
    if (entry.active) entry.awareness = 1;
    entry.presentation = entry.active ? 'combat' : 'staged';
    entry.figure.aiming?.();
  }

  function beginPresentation(entry, {
    from = entry.root.position,
    to,
    face = null,
    kind = 'entering',
    hideAtEnd = false,
    activateAtEnd = false,
    instant = false,
  }) {
    const start = from.clone();
    const destination = to.clone();
    entry.root.position.copy(start);
    entry.root.visible = true;
    entry.active = false;
    entry.presentation = kind;
    faceFromTo(entry, start, destination);
    entry.figure.setState?.('bolting', { blend: !instant });
    const distance = start.distanceTo(destination);
    const motion = {
      entry,
      from: start,
      to: destination,
      face: face?.clone?.() ?? null,
      elapsed: 0,
      duration: Math.max(0.35, distance / PRESENTATION_SPEED),
      hideAtEnd,
      activateAtEnd,
    };
    presentationMotions.set(entry.id, motion);
    if (instant || distance <= 1e-6) finishPresentation(motion);
    return true;
  }

  function updatePresentation(dt, onStep = null) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    for (const motion of [...presentationMotions.values()]) {
      if (motion.entry.down) {
        presentationMotions.delete(motion.entry.id);
        continue;
      }
      const before = motion.entry.root.position.clone();
      motion.elapsed = Math.min(motion.duration, motion.elapsed + step);
      const t = motion.duration > 0 ? motion.elapsed / motion.duration : 1;
      const eased = t * t * (3 - 2 * t);
      motion.entry.root.position.lerpVectors(motion.from, motion.to, eased);
      const distance = before.distanceTo(motion.entry.root.position);
      /* Presentation motion used to be visually correct but acoustically
       * inert. Publish the same mechanical facts PalaceSecurity publishes for
       * ordinary AI travel, so the scene can route both through the shared
       * CombatStepCadence instead of inventing cutscene-only footsteps. */
      if (typeof onStep === 'function') onStep({
        id: motion.entry.id,
        entry: motion.entry,
        dt: step,
        position: motion.entry.root.position,
        distance,
        moving: distance > 1e-6,
      });
      if (t >= 1) finishPresentation(motion);
    }
    return presentationMotions.size;
  }

  function clearPresentation() {
    const cleared = presentationMotions.size;
    presentationMotions.clear();
    return cleared;
  }

  /**
   * Sauce alone.
   *
   * Owner, 2026-08-25: *"You go into the back room and confront Sauce. Mark
   * scrambles away."* So the doors opening no longer activates the boss --
   * only the chef, who has nobody left to hide behind. Mark's own return is
   * `activateMark` below, and the finale director owns when.
   */
  function activateFinalEncounter() {
    sauce.active = !sauce.down;
    return true;
  }

  /** Mark crosses the open dining doors before leaving the rendered room. */
  function markScramblesAway({ instant = false, to = null } = {}) {
    if (mark.down) return false;
    mark.phase = 'away';
    const destination = to?.isVector3
      ? to : new THREE.Vector3(PALACE_FINALE_PATHS.markExit[0], 0, PALACE_FINALE_PATHS.markExit[1]);
    return beginPresentation(mark, {
      to: destination,
      kind: 'retreating',
      hideAtEnd: true,
      instant,
    });
  }

  /** And comes back through an authored opening, for a stage of the fight. */
  function activateMark({ armored = true, at = null, from = null, instant = false } = {}) {
    if (mark.down) return false;
    mark.phase = armored ? 'armored' : 'exposed';
    const authoredAt = armored ? PALACE_FINALE_PATHS.armoredAt : PALACE_FINALE_PATHS.finalAt;
    const authoredFrom = armored ? PALACE_FINALE_PATHS.armoredFrom : PALACE_FINALE_PATHS.finalFrom;
    const authoredFace = armored ? PALACE_FINALE_PATHS.armoredFace : PALACE_FINALE_PATHS.finalFace;
    const destination = at
      ? new THREE.Vector3(at.x, mark.root.position.y, at.z)
      : new THREE.Vector3(authoredAt[0], 0, authoredAt[1]);
    const origin = from?.isVector3
      ? from : new THREE.Vector3(authoredFrom[0], 0, authoredFrom[1]);
    const facing = at
      ? new THREE.Vector3(at.faceX ?? at.x, 0, at.faceZ ?? at.z + 1)
      : new THREE.Vector3(authoredFace[0], 0, authoredFace[1]);
    return beginPresentation(mark, {
      from: origin,
      to: destination,
      face: facing,
      kind: 'entering',
      activateAtEnd: true,
      instant,
    });
  }

  /** The wave becomes visible at both thresholds and crosses before firing. */
  function releaseWave({ instant = false } = {}) {
    let released = 0;
    for (const entry of wave) {
      if (entry.down || entry.active || presentationMotions.has(entry.id)) continue;
      beginPresentation(entry, {
        from: entry.entryFrom,
        to: entry.stagingTarget,
        kind: 'entering',
        activateAtEnd: true,
        instant,
      });
      released += 1;
    }
    return released;
  }

  /** How much of the reprisal is still standing. */
  function waveStanding() {
    return wave.filter((entry) => !entry.down).length;
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
    presentationMotions.delete(entry.id);
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
    /* Mark's reprisal. Not in `guards`: the estate's payroll is a patrol
     * roster the security layer reasons about, and these four are a scripted
     * wave that does not exist until the finale calls them. */
    wave,
    civilians,
    bystanders,
    /* Everything the player's rounds can find: combatants, the begging trio
     * and the working civilians. `civilians` deliberately stays the DINING
     * TRIO alone -- the finale director owns that list by name and a fourth
     * entry in it would be a fourth person in Mark's dining room. */
    hitTargets: [...all, ...civilians, ...bystanders].map((entry) => entry.root),
    activateFinalEncounter,
    markScramblesAway,
    activateMark,
    releaseWave,
    updatePresentation,
    clearPresentation,
    waveStanding,
    standUp,
    markDown,
    civilianDown,
  };
}
