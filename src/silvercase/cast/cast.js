import * as THREE from 'three';
import { ANCHORS } from '../scenes/ApartmentScene.js';
import { mountHandRevolver } from '../props/weapon.js';
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
 * one actor who actually fires at the player. Ape is "friendly", which — per
 * Actor.js's locked `hostile` setter — makes him structurally impossible to
 * arm as a combat threat, in either direction. He does carry a gun (see
 * `ape.drawWeapon` below): a weapon on a friendly actor is a prop and a
 * scripted beat, never a threat, because `hostile` can never be set on him
 * whatever any later code tries.
 */

// Ape's own spots for this mission — the corridor he walks in from, the door
// he knocks on, the room he reads, and the pace beside the chair he takes once
// the interrogation starts. Not pulled from ANCHORS because none of them is a
// level/geometry anchor; they're blocking for one specific character, local to
// this file.
//
// `hallway` is where he is standing when the mission hands the player the
// controls: the owner's note is that Ape has to be IN the corridor, with you,
// at spawn — he does the talking at that door, and a knock the player makes on
// their own with nobody beside them is a different scene. The player spawns at
// ANCHORS.hallwaySpawn (x 0.8, z 0) looking down +x, so this puts Ape a pace
// ahead and to the far side of the runner, in frame from the first instant.
const APE_SPOTS = Object.freeze({
  hallway: Object.freeze({ x: 1.95, z: -0.34, yaw: Math.PI / 2 }), // facing +x, down the corridor
  door: Object.freeze({ x: 5.25, z: 0.1, yaw: Math.PI / 2 }), // at 2E, facing the leaf
  start: Object.freeze({
    x: ANCHORS.frontDoorInside.x + 0.5, z: ANCHORS.frontDoorInside.z + 0.7, yaw: Math.PI / 2, // facing +x, into the room
  }),
  // A pace south of Chester's chair, facing back at him (-z) — looming over
  // the interrogation without standing in the chair anchor itself.
  chair: Object.freeze({
    x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z + 1.15, yaw: Math.PI,
  }),
  // The repeat is delivered a third of a metre closer. Both marks face the
  // chair, so Ape never turns the question toward the player while moving.
  chairClose: Object.freeze({
    x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z + 0.82, yaw: Math.PI,
  }),
  // Clear of Pruitt's doorway-to-player lane, facing the bathroom before the
  // first scripted miss cracks past him.
  bathroom: Object.freeze({
    x: 8.25,
    z: 0.28,
    yaw: Math.atan2(ANCHORS.bathroomDoorway.x - 8.25, ANCHORS.bathroomDoorway.z - 0.28),
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
function twoHandedAim(parts, npc) {
  const recoil = THREE.MathUtils.clamp(npc?.shotRecoil ?? 0, 0, 1);
  parts.armR.rotation.set(-1.32 + recoil * 0.16, 0, 0.16);
  parts.foreR.rotation.set(-0.12 + recoil * 0.1, 0, 0);
  parts.armL.rotation.set(-1.24 + recoil * 0.12, 0, -0.3);
  parts.foreL.rotation.set(-0.24 + recoil * 0.08, 0.28, 0);
  parts.body.rotation.x = -recoil * 0.06;
  parts.head.rotation.x = -0.05 - recoil * 0.04;
}

/**
 * Ape's two gun poses, applied the same way and for the same reason.
 *
 * `carry` is the gun down at his side, muzzle at the floor — the arm hangs, so
 * the weapon's own -z (down the forearm's -y; see `mountHandRevolver`) points
 * straight down, which is exactly how a man stands in somebody's living room
 * holding one of these while somebody else talks.
 *
 * `aim` swings the shoulder forward until the forearm's -y is the figure's own
 * +z — its facing — so the gun points at whatever he is turned toward. His
 * chair spot is one pace off the chair and squarely facing it, which is why
 * this needs no per-target maths.
 */
function apeCarryPose(parts) {
  parts.armR.rotation.set(0.06, 0, 0.12);
  parts.foreR.rotation.set(-0.16, 0, 0);
  parts.armL.rotation.set(-0.34, 0, -0.26);
  parts.foreL.rotation.set(-0.5, 0, 0);
}
function apeAimPose(parts) {
  parts.armR.rotation.set(-1.45, 0, 0.1);
  parts.foreR.rotation.set(-0.1, 0, 0);
  parts.armL.rotation.set(-0.4, 0, -0.3);
  parts.foreL.rotation.set(-0.62, 0, 0);
  parts.head.rotation.x = -0.04;
}

export function populateCast(root) {
  // ---------------- Ape ----------------
  // Canonical body, face and id under The Silver Case's scene-local suit.
  const apeNpc = buildSilverCaseApe(root, {
    x: APE_SPOTS.hallway.x, z: APE_SPOTS.hallway.z, yaw: APE_SPOTS.hallway.yaw, job: 'stand',
    actorId: 'ape',
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

  /**
   * Put him on a spot with no walk at all.
   *
   * `Actor.revive()` restores an actor to its BUILD position, which for Ape is
   * now the corridor — right for the top of the mission and wrong for the one
   * checkpoint, which resumes at the prayer with him already stood beside the
   * chair. main.js calls this straight after reviving him there.
   */
  ape.snapTo = function snapTo(spotName) {
    const to = APE_SPOTS[spotName];
    if (!to) return false;
    apeMove = null;
    ape.group.position.x = to.x;
    ape.group.position.z = to.z;
    ape.group.rotation.y = to.yaw;
    ape.npc.homeYaw = to.yaw;
    ape.npc.homeX = to.x;
    ape.npc.homeZ = to.z;
    return true;
  };

  /** Keep an authored interrogation/ambush eyeline off the player. */
  ape.focusPoint = function focusPoint(x, z, { snap = true } = {}) {
    ape.npc.look = false;
    ape.npc.gaze = 0;
    ape.parts.head.rotation.y = 0;
    ape.npc.faceToward(x, z, snap);
  };
  ape.focusOn = function focusOn(actor, options) {
    if (!actor?.group?.position) return false;
    ape.focusPoint(actor.group.position.x, actor.group.position.z, options);
    return true;
  };
  ape.releaseFocus = function releaseFocus() {
    ape.npc.look = true;
    ape.npc.gaze = 0;
    ape.parts.head.rotation.y = 0;
  };

  /**
   * Ape's own gun.
   *
   * The owner's note is short: *"Ape needs a gun."* He is the one running this
   * errand and he finishes the man in the chair alongside the prospect, so he
   * has to be visibly holding it before that happens rather than producing it
   * from nowhere at the moment it goes off. It rides in his hand from the
   * moment he gives the couch order and goes away again once the shooting is
   * done and there is a case to carry.
   *
   * Arming him changes nothing about what he IS: `faction: 'friendly'` locks
   * `hostile` to false in Actor's own setter, so a friendly actor with a
   * weapon is still structurally impossible to turn into a combat threat in
   * either direction.
   */
  const apeGun = mountHandRevolver(ape.parts.foreR);
  apeGun.visible = false;
  ape.weapon = apeGun;
  ape.weaponDrawn = false;
  ape.drawWeapon = function drawWeapon() {
    if (ape.weaponDrawn) return false;
    ape.weaponDrawn = true;
    apeGun.visible = true;
    // Arms crossed is the pose of a man watching somebody else work. He is not
    // doing that any more.
    ape.npc.folded = false;
    ape.pose = apeCarryPose;
    return true;
  };
  ape.holsterWeapon = function holsterWeapon() {
    ape.weaponDrawn = false;
    apeGun.visible = false;
    ape.pose = null;
    ape.npc.folded = true;
  };
  /** Level it at whatever he is facing (the chair), or bring it back down. */
  ape.aimWeapon = function aimWeapon(on) {
    if (!ape.weaponDrawn) ape.drawWeapon();
    ape.pose = on ? apeAimPose : apeCarryPose;
  };

  // ---------------- Deke (couch) ----------------
  const dekeBuild = makeActor({
    parent: root,
    name: 'Deke',
    actorId: 'deke',
    seat: 'couch',
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
    actorId: 'chester',
    seat: 'chair',
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
    collapse: { ...COLLAPSE.seated, bodyRoll: 0.46, bodyPitch: 0.34, sink: -0.01 },
  });
  const chester = chesterBuild.actor;

  // ---------------- Winston (kitchen, eventual survivor) ----------------
  const winstonBuild = makeActor({
    parent: root,
    name: 'Winston',
    actorId: 'winston',
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
    actorId: 'pruitt',
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
    // room, half still in the bathroom. The positive roll keeps his shoulder
    // on the open-room side of the kitchen run instead of driving it through
    // the cabinet beside the doorway as he falls forward.
    collapse: {
      ...COLLAPSE.standing,
      pitch: Math.PI / 2 - 0.14,
      roll: 0.15,
      lift: 0.39,
    },
  });
  const pruitt = pruittBuild.actor;
  pruitt.group.visible = false;

  // The big revolver, in his hand — the same mount, in the same place, that
  // Ape's rides in. See `mountHandRevolver` in ../props/weapon.js for why it
  // hangs off the forearm rather than off the figure.
  const pruittGun = mountHandRevolver(pruitt.parts.foreR);
  pruittGun.userData.geometryGate = { assemblyId: 'silvercase:pruitt' };
  pruitt.weapon = pruittGun;
  pruitt.npc.shotRecoil = 0;
  pruitt.recoilShot = function recoilShot() {
    pruitt.npc.shotRecoil = 1;
  };
  const pruittGunHandPose = {
    position: pruittGun.position.clone(),
    quaternion: pruittGun.quaternion.clone(),
    scale: pruittGun.scale.clone(),
  };

  function resetPruittGun() {
    if (pruittGun.parent !== pruitt.parts.foreR) pruitt.parts.foreR.add(pruittGun);
    pruittGun.position.copy(pruittGunHandPose.position);
    pruittGun.quaternion.copy(pruittGunHandPose.quaternion);
    pruittGun.scale.copy(pruittGunHandPose.scale);
  }

  function dropPruittGun() {
    if (pruittGun.parent === root) return;
    root.updateMatrixWorld(true);
    root.attach(pruittGun);
    pruittGun.position.set(11.05, 0, -1.45);
    pruittGun.rotation.set(0, 0.35, Math.PI / 2);
    pruittGun.scale.copy(pruittGunHandPose.scale);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(pruittGun);
    pruittGun.position.y += 0.006 - bounds.min.y;
    root.updateMatrixWorld(true);
  }

  const killPruitt = pruitt.kill.bind(pruitt);
  pruitt.kill = function killAndDropWeapon(options) {
    const wasAlive = pruitt.alive;
    killPruitt(options);
    if (wasAlive && !pruitt.alive) dropPruittGun();
  };

  /**
   * A pace through and west of the open leaf, aimed down the player's ambush
   * lane.  The door swings toward +z from its west hinge, so leaving Pruitt on
   * the opening's east half put the fully-open leaf directly between him and
   * the canonical checkpoint position.  A retry could therefore present the
   * target callout while every chest/head ray struck the door.  This is the
   * first clear floor position after stepping around that leaf, not a verifier
   * accommodation: the restarted ambush has to remain physically winnable.
   */
  const pruittRevealed = {
    x: ANCHORS.bathroomDoorway.x - 0.75,
    y: ANCHORS.bathroomDoorway.y,
    z: ANCHORS.bathroomDoorway.z + 0.48,
    yaw: -0.4,
  };
  pruitt.stageAmbush = function stageAmbush(progress = 1) {
    const k = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
    pruitt.group.visible = true;
    pruitt.group.position.set(
      lerp(pruittHidden.x, pruittRevealed.x, k),
      lerp(pruittHidden.y, pruittRevealed.y, k),
      lerp(pruittHidden.z, pruittRevealed.z, k),
    );
    pruitt.group.rotation.y = lerpAngle(ANCHORS.bathroomDoorway.yaw, pruittRevealed.yaw, k);
    pruitt.npc.homeYaw = pruitt.group.rotation.y;
    pruitt.npc.homeX = pruitt.group.position.x;
    pruitt.npc.homeZ = pruitt.group.position.z;
    return k;
  };
  pruitt.reveal = function reveal() {
    if (pruitt.group.visible) return;
    pruitt.stageAmbush(1);
  };

  /** Tuck him back into the dark for a checkpoint retry. */
  pruitt.hide = function hide() {
    pruitt.revive();
    resetPruittGun();
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
    pruitt.npc.shotRecoil = Math.max(0, pruitt.npc.shotRecoil - dt * 5.5);
    for (const actor of all) actor.update(dt, look);
    updateApeMove(dt);
  }

  return {
    ape, deke, winston, chester, pruitt, all, update,
  };
}
