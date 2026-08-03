import { box, mat, group } from '../../world/build.js';
import { APE_FAMILY_MEMBER, APE_FACE_URL } from '../../bing/family-ape.js';
import { ANCHORS } from '../scenes/ApartmentScene.js';
import { makeActor } from './Actor.js';

/**
 * The Silver Case's six humans — Ape (Family, structurally unkillable) plus
 * five mission-local NPCs. Every anchor below is pulled straight from
 * ApartmentScene.js's `ANCHORS` rather than re-typed, so the cast can never
 * silently drift from the level geometry. Reminder from that file: `yaw` on
 * the seat/doorway anchors is authored as a Person *heading*
 * (facing = (sin(h), 0, cos(h)), 0 = +z) — exactly what `makeActor()` below
 * expects — while `hallwaySpawn`/`frontDoorInside` are *camera* yaw instead.
 * Nothing here reads those two, so no conversion is needed.
 *
 * Faction assignment (per the brief): Deke, Chester and Winston never
 * themselves attack, so all three are "neutral" — damageable only by a
 * scripted order, never by hostile AI. "hostile" is reserved for Pruitt, the
 * one actor who actually fires. Ape is "friendly", which — per Actor.js's
 * locked `hostile` setter — makes him structurally impossible to arm as a
 * combat threat, in either direction.
 */

// Person has no height/build/hairstyle sliders of its own — same fudge
// CarInterior.js uses for Ape: a uniform scale against a "generic adult"
// reference height, matching APE_FAMILY_MEMBER.model's canonical height/build
// rather than inventing new proportions for him a second time.
const APE_BASE_HEIGHT = 1.9;

// Ape's own two spots for this mission — starting near the front door, then
// stepping over to loom near the chair once the interrogation starts. Not
// pulled from ANCHORS because neither is a level/geometry anchor; they're
// blocking for one specific character, local to this file.
const APE_SPOTS = Object.freeze({
  start: Object.freeze({
    x: ANCHORS.frontDoorInside.x, z: ANCHORS.frontDoorInside.z + 0.6, yaw: Math.PI / 2, // facing +x, into the room
  }),
  // A pace south of Chester's chair, facing back at him (-z) — looming over
  // the interrogation without standing in the chair anchor itself.
  chair: Object.freeze({
    x: ANCHORS.chairSeat.x, z: ANCHORS.chairSeat.z + 1.1, yaw: Math.PI,
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
 * Person has no seated pose of its own (see CarInterior.js's `seatApe` for
 * the canonical note on why) — the same modest hip-forward leg/arm lean is
 * reused here for Deke (couch) and Chester (chair) rather than reinventing
 * it a second time.
 */
function seatLegs(person) {
  person.legL.rotation.x = 0.35;
  person.legR.rotation.x = 0.35;
  person.armL.rotation.x = 0.2;
  person.armR.rotation.x = 0.2;
}

/**
 * A small hand-held prop for Pruitt — a few boxes built with the same
 * box()/mat() helpers every other file in this mission already uses, not the
 * full detailed makeRevolver() from world/props.js. The brief calls a "simple
 * prop or just an arm-raised pose" fine for this beat, and a two-box
 * silhouette reads as a drawn gun in profile without pulling in machinery
 * this mission doesn't otherwise need.
 */
function makeHeldGun() {
  const steel = mat({ color: 0x2c2f33, roughness: 0.4, metalness: 0.6 });
  const gripMat = mat({ color: 0x1a1410, roughness: 0.7 });
  const g = group('pruittGun');
  g.add(box({ size: [0.05, 0.05, 0.22], pos: [0, 0, -0.1], mat: steel }));
  g.add(box({ size: [0.05, 0.14, 0.05], pos: [0, -0.09, 0.03], mat: gripMat }));
  return g;
}

export function populateCast(root) {
  // ---------------- Ape ----------------
  const apeBuild = makeActor({
    name: 'Ape',
    faction: 'friendly',
    hp: 999,
    palette: {
      shirt: APE_FAMILY_MEMBER.model.shirt,
      shirtDark: 0x0a0a0e,
      pants: 0x1a1a20,
      skin: APE_FAMILY_MEMBER.model.skin,
      hair: APE_FAMILY_MEMBER.model.hairColour,
      bandana: null, // Ape doesn't wear the Circle bandana on this job
      face: APE_FACE_URL,
    },
    position: { x: APE_SPOTS.start.x, y: 0, z: APE_SPOTS.start.z },
    yaw: APE_SPOTS.start.yaw,
  });
  const ape = apeBuild.actor;
  ape.person.group.scale.set(
    APE_FAMILY_MEMBER.model.build,
    APE_FAMILY_MEMBER.model.height / APE_BASE_HEIGHT,
    APE_FAMILY_MEMBER.model.build,
  );
  root.add(ape.group);

  // Ape's walk-to-spot tween — simple enough not to need pathfinding: a
  // straight-line lerp of position + shortest-path yaw over APE_MOVE_SECONDS.
  let apeMove = null; // { from:{x,z,yaw}, to:{x,z,yaw}, t }
  ape.moveTo = function moveTo(spotName) {
    const to = APE_SPOTS[spotName];
    if (!to) return false;
    apeMove = {
      from: { x: ape.group.position.x, z: ape.group.position.z, yaw: ape.person.heading },
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
    ape.person.heading = yaw;
    ape.group.rotation.y = yaw;
    if (apeMove.t >= 1) apeMove = null;
  }

  // ---------------- Deke (couch) ----------------
  const dekeBuild = makeActor({
    name: 'Deke',
    faction: 'neutral',
    hp: 60,
    palette: {
      shirt: 0x4a5a42,
      shirtDark: 0x33402e,
      pants: 0x2a2a30,
      skin: 0xd9a877, // light/mid tone, per the brief
      hair: 0x2a1e14,
      bandana: null, // not a Circle member
      face: null, // procedural flat head — a one-off minor character
    },
    position: ANCHORS.couchSeat,
    yaw: ANCHORS.couchSeat.yaw,
  });
  const deke = dekeBuild.actor;
  seatLegs(deke.person);
  root.add(deke.group);

  // ---------------- Chester (chair) ----------------
  const chesterBuild = makeActor({
    name: 'Chester',
    faction: 'neutral',
    hp: 60,
    palette: {
      shirt: 0x6a3a3a,
      shirtDark: 0x4a2828,
      pants: 0x2f2f36,
      skin: 0xf0d0b0, // distinct from Deke's, per the brief
      hair: 0x6a4a22, // distinct from Deke's
      bandana: null,
      face: null,
    },
    position: ANCHORS.chairSeat,
    yaw: ANCHORS.chairSeat.yaw,
  });
  const chester = chesterBuild.actor;
  seatLegs(chester.person);
  root.add(chester.group);

  // ---------------- Winston (kitchen, eventual survivor) ----------------
  const winstonBuild = makeActor({
    name: 'Winston',
    faction: 'neutral',
    hp: 60,
    palette: {
      shirt: 0xc9c2a8,
      shirtDark: 0x9a9478,
      pants: 0x2a2a30,
      skin: 0x8d5a3a, // dark tone, per the brief — same tone as Ape's
      hair: 0x1a1410,
      bandana: null,
      face: null,
    },
    position: ANCHORS.kitchenSpot,
    yaw: ANCHORS.kitchenSpot.yaw,
  });
  const winston = winstonBuild.actor;
  root.add(winston.group);

  // ---------------- Pruitt (bathroom gunman) ----------------
  // Starts hidden in the shallow, unlit alcove behind the bathroom door (see
  // ApartmentScene.js's ALC_DEPTH note) rather than at the doorway anchor
  // itself, and stays invisible until reveal() is called.
  const pruittHidden = {
    x: ANCHORS.bathroomDoorway.x, y: 0, z: ANCHORS.bathroomDoorway.z - 0.5,
  };
  const pruittBuild = makeActor({
    name: 'Pruitt',
    faction: 'hostile',
    hp: 80,
    palette: {
      shirt: 0x3a3a42,
      shirtDark: 0x27272e,
      pants: 0x1a1a20,
      skin: 0xc99268,
      hair: 0x141014,
      bandana: null,
      face: null,
    },
    position: pruittHidden,
    yaw: ANCHORS.bathroomDoorway.yaw,
  });
  const pruitt = pruittBuild.actor;
  pruitt.group.visible = false;
  // Gun-drawn pose, applied now so it's already correct the instant
  // reveal() flips visibility — nothing has to snap into place on frame one.
  pruitt.person.armR.rotation.x = -1.2;
  pruitt.person.armL.rotation.x = -0.7;
  const gun = makeHeldGun();
  gun.position.set(0, -0.95, 0.05);
  pruitt.person.armR.add(gun);
  root.add(pruitt.group);

  pruitt.reveal = function reveal() {
    if (pruitt.group.visible) return;
    pruitt.group.visible = true;
    pruitt.group.position.set(
      ANCHORS.bathroomDoorway.x, ANCHORS.bathroomDoorway.y, ANCHORS.bathroomDoorway.z,
    );
    pruitt.person.heading = ANCHORS.bathroomDoorway.yaw;
    pruitt.group.rotation.y = ANCHORS.bathroomDoorway.yaw;
  };

  const all = [ape, deke, chester, winston, pruitt];

  function update(dt) {
    for (const actor of all) actor.update(dt);
    updateApeMove(dt);
  }

  return {
    ape, deke, winston, chester, pruitt, all, update,
  };
}
