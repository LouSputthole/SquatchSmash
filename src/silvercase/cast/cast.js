import * as THREE from 'three';
import { ANCHORS } from '../scenes/ApartmentScene.js';
import { makeBigRevolver } from '../props/weapon.js';
import { buildSilverCaseApe } from './ape.js';
import { COLLAPSE, makeActor } from './Actor.js';

/**
 * The Silver Case's five humans — Ape (Family, structurally unkillable) plus
 * four mission-local NPCs.
 *
 * Everybody here is built by the campaign's shared figure builder
 * (`makePerson`, through `Npc`, in src/bing/cast.js): heights are real metres
 * on a 1.78 m reference frame, `build` thickens the body without stretching
 * it, and the seated pose is `Npc.sit()` measured against a real 0.53 m
 * cushion. Nothing in this file invents proportions. Ape in particular is not
 * described here at all — see ./ape.js, which hands the Bing's own
 * `APE_FAMILY_MEMBER.model` and supplied face straight to the same builder the
 * Silver Room uses for the same man.
 *
 * Every anchor below is pulled straight from ApartmentScene.js's `ANCHORS`
 * rather than re-typed, so the cast can never silently drift from the level
 * geometry. Reminder from that file: `yaw` on the seat/doorway anchors is
 * authored as a figure *heading* (facing = (sin(h), 0, cos(h)), 0 = +z) —
 * exactly what `makeActor()` expects — while `hallwaySpawn`/`frontDoorInside`
 * are *camera* yaw instead. Nothing here reads those two.
 *
 * Faction assignment (per the brief): Deke, Chester and Winston never
 * themselves attack, so all three are "neutral" — damageable only by a
 * scripted order, never by hostile AI. "hostile" is reserved for Pruitt, the
 * one actor who actually fires. Ape is "friendly", which — per Actor.js's
 * locked `hostile` setter — makes him structurally impossible to arm as a
 * combat threat, in either direction.
 */

// Ape's own two spots for this mission — starting near the front door, then
// stepping over to loom near the chair once the interrogation starts. Not
// pulled from ANCHORS because neither is a level/geometry anchor; they're
// blocking for one specific character, local to this file.
const APE_SPOTS = Object.freeze({
  start: Object.freeze({
    x: ANCHORS.frontDoorInside.x + 0.5, z: ANCHORS.frontDoorInside.z + 0.7, yaw: Math.PI / 2, // facing +x, into the room
  }),
  // A pace south of Chester's chair, facing back at him (-z) — looming over
  // the interrogation without standing in the chair anchor itself.
  chair: Object.freeze({
    x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z + 1.15, yaw: Math.PI,
  }),
});

// How long Ape's walk-over between spots takes — "a lerp-to-target over
// about 1s is plenty," per the brief. Not a real gait, just a smoothed move.
const APE_MOVE_SECONDS = 1.0;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest-path angle lerp, so a move from yaw ~3.0 to yaw ~-3.0 doesn't spin
// the long way around.
function lerpAngle(a, b, t) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * The bathroom man's pose, re-applied every frame after `Npc.update()`.
 *
 * Npc zeroes arm, forearm and head rotations at the top of each of its own
 * updates — that is what keeps a raised arm from sticking forever — so a
 * mission-authored pose has to run downstream of it, not once at build time.
 * Both hands are on the revolver, which is what a man does with a gun that
 * size when he has been standing in the dark waiting to use it.
 */
function twoHandedAim(parts) {
  parts.armR.rotation.set(-1.32, 0, 0.16);
  parts.foreR.rotation.set(-0.12, 0, 0);
  parts.armL.rotation.set(-1.24, 0, -0.3);
  parts.foreL.rotation.set(-0.24, 0.28, 0);
  parts.head.rotation.x = -0.05;
}

export function populateCast(root) {
  // ---------------- Ape ----------------
  // Canonical figure, canonical face, canonical id. Nothing local.
  const apeNpc = buildSilverCaseApe(root, {
    x: APE_SPOTS.start.x, z: APE_SPOTS.start.z, yaw: APE_SPOTS.start.yaw, job: 'stand',
  });
  const apeBuild = makeActor({
    npc: apeNpc,
    name: apeNpc.name,
    characterId: apeNpc.characterId,
    faction: 'friendly',
    hp: 999,
    folded: true, // arms crossed: he is here to watch somebody else work
  });
  const ape = apeBuild.actor;

  // Ape's walk-to-spot tween — simple enough not to need pathfinding: a
  // straight-line lerp of position + shortest-path yaw over APE_MOVE_SECONDS.
  let apeMove = null; // { from:{x,z,yaw}, to:{x,z,yaw}, t }
  ape.moveTo = function moveTo(spotName) {
    const to = APE_SPOTS[spotName];
    if (!to) return false;
    apeMove = {
      from: { x: ape.group.position.x, z: ape.group.position.z, yaw: ape.group.rotation.y },
      to,
      t: 0,
    };
    return true;
  };
  function updateApeMove(dt) {
    if (!apeMove) return;
    apeMove.t = Math.min(1, apeMove.t + dt / APE_MOVE_SECONDS);
    const k = apeMove.t;
    ape.group.position.x = lerp(apeMove.from.x, apeMove.to.x, k);
    ape.group.position.z = lerp(apeMove.from.z, apeMove.to.z, k);
    const yaw = lerpAngle(apeMove.from.yaw, apeMove.to.yaw, k);
    ape.npc.homeYaw = yaw;
    ape.group.rotation.y = yaw;
    if (apeMove.t >= 1) apeMove = null;
  }

  // ---------------- Deke (couch) ----------------
  const dekeBuild = makeActor({
    parent: root,
    name: 'Deke',
    faction: 'neutral',
    hp: 60,
    job: 'sit',
    model: {
      height: 1.76,
      build: 1.06,
      dress: 'tee',
      hair: 'short',
      shirt: 0x4a5a42,
      skin: 0xd9a877, // light/mid tone, per the brief
      hairColour: 0x2a1e14,
    },
    // `y` is the seat's own base, not the anchor's cushion height: Npc.sit()
    // folds the figure and drops it 0.42 from this base onto a 0.53 cushion.
    position: { x: ANCHORS.couchSeat.x, y: ANCHORS.couchSeat.y, z: ANCHORS.couchSeat.z },
    yaw: ANCHORS.couchSeat.yaw,
    // The owner's note, in one line: the man shot on the couch stays on it.
    // He goes over toward the middle of the couch rather than over its arm.
    collapse: { ...COLLAPSE.seated, bodyRoll: -0.5, bodyPitch: 0.26 },
  });
  const deke = dekeBuild.actor;

  // ---------------- Chester (chair) ----------------
  const chesterBuild = makeActor({
    parent: root,
    name: 'Chester',
    faction: 'neutral',
    hp: 60,
    job: 'sit',
    model: {
      height: 1.81,
      build: 1.14,
      gut: 0.4,
      dress: 'shirt',
      hair: 'receding',
      shirt: 0x6a3a3a,
      skin: 0xf0cba6, // distinct from Deke's, per the brief
      hairColour: 0x5a3a20, // distinct from Deke's
    },
    position: { x: ANCHORS.chairSeat.x, y: ANCHORS.chairSeat.y, z: ANCHORS.chairSeat.z },
    yaw: ANCHORS.chairSeat.yaw,
    // Shot in the chair, he stays in the chair, over its right armrest.
    collapse: { ...COLLAPSE.seated, bodyRoll: 0.46, bodyPitch: 0.34 },
  });
  const chester = chesterBuild.actor;

  // ---------------- Winston (kitchen, eventual survivor) ----------------
  const winstonBuild = makeActor({
    parent: root,
    name: 'Winston',
    faction: 'neutral',
    hp: 60,
    job: 'stand',
    model: {
      height: 1.71,
      build: 0.94,
      dress: 'shirt',
      hair: 'crop',
      shirt: 0xc9c2a8,
      skin: 0x8d5a3a, // dark tone, per the brief — same tone as Ape's
      hairColour: 0x141014,
    },
    position: { x: ANCHORS.kitchenSpot.x, y: ANCHORS.kitchenSpot.y, z: ANCHORS.kitchenSpot.z },
    yaw: ANCHORS.kitchenSpot.yaw,
    // Backed against the counter: he goes down along it, toward the room.
    collapse: { ...COLLAPSE.standing, roll: -0.12 },
  });
  const winston = winstonBuild.actor;

  // ---------------- Pruitt (bathroom gunman) ----------------
  // Starts hidden in the shallow, unlit alcove behind the bathroom door (see
  // ApartmentScene.js's ALC_DEPTH note) rather than at the doorway anchor
  // itself, and stays invisible until reveal() is called.
  const pruittHidden = {
    x: ANCHORS.bathroomDoorway.x, y: 0, z: ANCHORS.bathroomDoorway.z - 0.5,
  };
  const pruittBuild = makeActor({
    parent: root,
    name: 'Pruitt',
    faction: 'hostile',
    hp: 80,
    job: 'stand',
    model: {
      height: 1.84,
      build: 1.2,
      dress: 'tracksuit',
      hair: 'crop',
      beard: true,
      shirt: 0x3a3a42,
      skin: 0xc99268,
      hairColour: 0x141014,
    },
    position: pruittHidden,
    yaw: ANCHORS.bathroomDoorway.yaw,
    pose: twoHandedAim,
    // Shot as he clears the doorway, he drops where he stood — half in the
    // room, half still in the bathroom. He never reaches the alcove's back
    // wall because he falls FORWARD, the way he was already moving.
    collapse: { ...COLLAPSE.standing, pitch: Math.PI / 2 - 0.14, roll: -0.14 },
  });
  const pruitt = pruittBuild.actor;
  pruitt.group.visible = false;

  // The big revolver, in his hand. Built to the same convention every other
  // gun in this game uses (barrel down local -z, see world/props.js's
  // makeRevolver) and parented to the right FOREARM at the hand — where
  // makePerson puts the hand slab, y=-0.30 inside that group — so it tracks
  // the aim pose above and the collapse afterwards with no extra bookkeeping.
  const pruittGun = makeBigRevolver();
  // -90° about x lays the barrel (local -z) down the forearm's own -y, i.e.
  // pointing wherever the arm is pointing.
  pruittGun.rotation.set(-Math.PI / 2 + 0.12, 0, 0);
  pruittGun.position.set(0.005, -0.33, 0.03);
  pruitt.parts.foreR.add(pruittGun);
  pruitt.weapon = pruittGun;

  /** A pace clear of the door frame, so he reads as coming OUT of the room. */
  const pruittRevealed = {
    x: ANCHORS.bathroomDoorway.x, y: ANCHORS.bathroomDoorway.y, z: ANCHORS.bathroomDoorway.z + 0.28,
  };
  pruitt.reveal = function reveal() {
    if (pruitt.group.visible) return;
    pruitt.group.visible = true;
    pruitt.group.position.set(pruittRevealed.x, pruittRevealed.y, pruittRevealed.z);
    pruitt.group.rotation.y = ANCHORS.bathroomDoorway.yaw;
    pruitt.npc.homeYaw = ANCHORS.bathroomDoorway.yaw;
  };

  /** Tuck him back into the dark for a checkpoint retry. */
  pruitt.hide = function hide() {
    pruitt.revive();
    pruitt.group.visible = false;
    pruitt.group.position.set(pruittHidden.x, pruittHidden.y, pruittHidden.z);
    pruitt.group.rotation.y = ANCHORS.bathroomDoorway.yaw;
    pruitt.npc.homeYaw = ANCHORS.bathroomDoorway.yaw;
  };

  const all = [ape, deke, chester, winston, pruitt];

  const _playerPos = new THREE.Vector3();
  function update(dt, playerPosition = null) {
    if (playerPosition) _playerPos.copy(playerPosition);
    const look = playerPosition ? _playerPos : null;
    for (const actor of all) actor.update(dt, look);
    updateApeMove(dt);
  }

  return {
    ape, deke, winston, chester, pruitt, all, update,
  };
}
