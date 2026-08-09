import * as THREE from 'three';

import { CombatActor } from '../core/combat/actors.js';
import { FACTIONS } from '../core/combat/factions.js';
import { SAUCE } from '../core/wardrobe.js';
import { WEAPON_IDS } from '../core/weapons/catalog.js';
import { buildWeaponModel } from '../core/weapons/models.js';
import { HeistFigure } from '../heist/people.js';
import { PALACE_ANCHORS } from './world.js';

export const PALACE_GUARD_POSTS = Object.freeze([
  Object.freeze({ id: 'gate-one', x: 9.2, z: 54, yaw: Math.PI, weapon: WEAPON_IDS.PISTOL9, patrol: [[9.2, 54], [7.2, 48]] }),
  Object.freeze({ id: 'guardhouse', x: 9.1, z: 44, yaw: -Math.PI / 2, weapon: WEAPON_IDS.CARBINE, patrol: [[9.1, 44], [6.5, 39]] }),
  Object.freeze({ id: 'fountain', x: 5.5, z: 34, yaw: Math.PI * 0.7, weapon: WEAPON_IDS.PISTOL9, patrol: [[5.5, 34], [-4, 34]] }),
  Object.freeze({ id: 'pool', x: -5.5, z: 22, yaw: Math.PI * 0.2, weapon: WEAPON_IDS.CARBINE, patrol: [[-5.5, 22], [-13, 14]] }),
  Object.freeze({ id: 'service-door', x: 13.5, z: 15.2, yaw: 0, weapon: WEAPON_IDS.PISTOL9, patrol: [[13.5, 15.2], [8, 18]] }),
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

function attachWeapon(figure, weaponId, name) {
  let model = null;
  try { model = buildWeaponModel(weaponId); } catch { return null; }
  model.name = name;
  model.position.set(0, -0.3, 0.05);
  model.rotation.x = -Math.PI / 2;
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

function tagHitZones(figure) {
  figure.parts.head.userData.hitZone = 'head';
  figure.parts.body.userData.hitZone = 'chest';
  for (const limb of [figure.parts.armL, figure.parts.armR, figure.parts.legL, figure.parts.legR]) {
    limb.userData.hitZone = 'limb';
  }
}

function makeCombatant({
  id, role, x, z, yaw = 0, model, weapon, health, armor = 0, patrol = null,
}) {
  const figure = new HeistFigure({
    name: `palace-${id}`, x, z, yaw, model, tier: role === 'boss' || role === 'traitor' ? 'hero' : 'ambient',
  });
  tagHitZones(figure);
  armedPose(figure);
  const weaponModel = attachWeapon(figure, weapon, `palace-${id}-${weapon}`);
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
    armed: Boolean(weaponModel),
    patrol: patrol?.map(([px, pz]) => new THREE.Vector3(px, 0, pz)) ?? [],
    patrolIndex: 0,
    awareness: 0,
    active: role === 'guard',
    down: false,
  };
  figure.root.userData.palaceCombatant = entry;
  figure.root.userData.faction = FACTIONS.CARTEL;
  return entry;
}

/** Cast for the final mission: patrols on the route, then Mark and Sauce. */
export function buildPalaceCast(parent) {
  const guards = PALACE_GUARD_POSTS.map((post, index) => makeCombatant({
    ...post,
    role: 'guard',
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

  const all = [...guards, mark, sauce];
  for (const entry of all) parent.add(entry.root);

  function activateFinalEncounter() {
    mark.active = !mark.down;
    sauce.active = !sauce.down;
    return true;
  }

  function markDown(entry) {
    if (!entry || entry.down) return false;
    entry.down = true;
    entry.active = false;
    entry.figure.setState?.('down', { blend: true });
    if (!entry.figure.setState) entry.figure.fallen({ roll: entry.id === 'mark' ? -0.42 : 0.38 });
    if (entry.weaponModel) entry.weaponModel.visible = false;
    return true;
  }

  return {
    root: parent,
    all,
    guards,
    mark,
    sauce,
    hitTargets: all.map((entry) => entry.root),
    activateFinalEncounter,
    markDown,
  };
}
