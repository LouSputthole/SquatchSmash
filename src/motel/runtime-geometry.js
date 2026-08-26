import * as THREE from 'three';

import { Actor, CAST } from './actors.js';

export const MOTEL_ROAD_Z = 34;
export const MOTEL_SNOW_SEATED_SCALE_FACTOR = 0.74;
export const MOTEL_SNOW_HEAD_GLANCE = Math.PI / 2;
export const MOTEL_SNOW_ARM_PITCH = -1.05;

/**
 * The doorway the fight is around: Rico's own room door, at the middle of the
 * row. Written down once because two stages point at it.
 */
export const MOTEL_ROOM_DOORWAY = Object.freeze({ x: 0, z: -4.9 });

export const MOTEL_REINFORCEMENT_STAGES = Object.freeze([
  Object.freeze({ id: 'reinforcement-hook', weapon: 'hook', x: 26, z: 4 }),
  Object.freeze({ id: 'reinforcement-prod', weapon: 'prod', x: -26, z: 6 }),
  Object.freeze({ id: 'reinforcement-pistol', weapon: 'pistol', x: 16, z: 16 }),
]);

const FACTORIES = Object.freeze({
  'snow-arrival': () => CAST.snow(),
  'snow-exterior': () => CAST.snow(),
  lookout: () => CAST.lookout(),
  watcher: () => CAST.watcher(),
  clerk: () => CAST.clerk(),
  'rico-doorway': () => CAST.rico(),
  'rico-room': () => CAST.rico(),
  'chino-room': () => CAST.chino(),
  'slicer-room': () => CAST.slicer(),
  ...Object.fromEntries(MOTEL_REINFORCEMENT_STAGES.map(({ id, weapon }) => (
    [id, () => CAST.thug(weapon)]
  ))),
});

function requireArrivalCar(arrivalCar, stageId) {
  if (!arrivalCar?.group
    || typeof arrivalCar.driverActorPosition !== 'function'
    || !arrivalCar.occupants?.has?.('driverActor')) {
    throw new TypeError(`${stageId} requires the Motel arrival-car adapter`);
  }
  return arrivalCar;
}

function ownActor(actor, ownerId, stageId) {
  actor.group.name = `motel.cast.${stageId}`;
  actor.group.userData.geometryGate = {
    ...(actor.group.userData.geometryGate ?? {}),
    assemblyId: ownerId,
  };
  actor.group.userData.motelGeometryStage = stageId;
  return actor;
}

function ownArrivalCar(arrivalCar, occupied) {
  arrivalCar.group.userData.geometryGate = {
    ...(arrivalCar.group.userData.geometryGate ?? {}),
    assemblyId: occupied ? 'motel.arrival-car.occupied' : 'vehicle.motel.convertible',
  };
}

/** Apply the exact authored driver-seat pose used by the browser runtime. */
export function poseMotelSnowInDriverSeat(actor, arrivalCar) {
  const car = requireArrivalCar(arrivalCar, 'snow-arrival');
  const forward = car.forwardYaw();
  const towardTony = car.driverFacingPassengerYaw();
  const glance = THREE.MathUtils.clamp(
    Math.atan2(Math.sin(towardTony - forward), Math.cos(towardTony - forward)),
    -MOTEL_SNOW_HEAD_GLANCE,
    MOTEL_SNOW_HEAD_GLANCE,
  );
  ownArrivalCar(car, true);
  ownActor(actor, 'motel.arrival-car.occupied', 'snow-arrival');
  /* Pose in seat-local space, then parent the whole connected actor rig to
   * the car-owned anchor. Nothing copies Snow toward a moving world point. */
  actor.sitAt(new THREE.Vector3(), 0, {
    scaleFactor: MOTEL_SNOW_SEATED_SCALE_FACTOR,
    headYaw: glance,
    armPitch: MOTEL_SNOW_ARM_PITCH,
  });
  car.occupants.attach('driverActor', actor.group, { localYaw: Math.PI / 2 });
  actor.heading = forward;
  actor.idleHeading = forward;
  return actor;
}

/**
 * Stage one existing actor at a named, browser-authored runtime pose.
 *
 * The helper only mutates the actor/car passed by its caller. Importing this
 * module never starts the browser scene, schedules work, or touches the DOM.
 */
export function stageMotelActor(actor, stageId, {
  arrivalCar = null,
  deckY = 4,
  floorAt = () => 0,
} = {}) {
  if (!actor?.group) throw new TypeError(`${stageId} requires a Motel Actor`);

  if (stageId === 'snow-arrival') return poseMotelSnowInDriverSeat(actor, arrivalCar);
  if (stageId === 'snow-exterior') {
    const car = requireArrivalCar(arrivalCar, stageId);
    car.occupants.release('driverActor');
    const outside = car.driverExitPosition();
    outside.y = floorAt(outside.x, outside.z, 0);
    ownArrivalCar(car, false);
    ownActor(actor, 'motel.cast:snow', stageId);
    return actor.standAt(outside, Math.PI);
  }

  const reinforcement = MOTEL_REINFORCEMENT_STAGES.find(({ id }) => id === stageId);
  if (reinforcement) {
    actor.group.position.set(reinforcement.x, 0, reinforcement.z);
    /* FACING THE FIGHT THEY ARE RUNNING INTO, not due north.
     *
     * All three arrived on `heading` 0 — the Actor default — from three
     * different corners of the lot, so the toast said "they are coming across
     * the concrete" and three men stood facing the same compass point with
     * their backs to the cars they got out of. Nobody sees it for long,
     * because `state: 'chase'` turns them at the player on the first frame,
     * but the staging gate reads the pose as authored and this is the exact
     * shape of a FACING_UNIFORM: three actors of one role agreeing on a
     * heading to nine decimal places. It only escaped the finding because the
     * gate wants them within 6 m of each other and these are 20 m apart.
     *
     * Each one is turned at the row of doors instead, which is where the
     * fight is; that is three different authored headings — measured on the
     * built state at -108.9deg, 112.7deg and -142.6deg — rather than three
     * copies of one, and it is derived from the doorway rather than typed. */
    actor.faceAt(MOTEL_ROOM_DOORWAY.x, MOTEL_ROOM_DOORWAY.z);
    actor.state = 'chase';
    actor.hostile = true;
    return ownActor(actor, `motel.cast:${stageId}`, stageId);
  }

  switch (stageId) {
    case 'lookout':
      actor.group.position.set(21.4, 0, -0.6);
      actor.state = 'idle';
      actor.faceAt(21.4, MOTEL_ROAD_Z);
      break;
    case 'watcher':
      actor.group.position.set(6, deckY, -1.6);
      actor.state = 'idle';
      actor.anchor = { x: 6, z: -1.6 };
      actor.faceAt(6, 16);
      break;
    case 'clerk':
      actor.group.position.set(-44, 0, -8.2);
      actor.state = 'idle';
      actor.faceAt(-44, -4);
      break;
    case 'rico-doorway':
      actor.group.position.set(MOTEL_ROOM_DOORWAY.x, 0, MOTEL_ROOM_DOORWAY.z);
      actor.state = 'deal';
      actor.anchor = { x: MOTEL_ROOM_DOORWAY.x, z: MOTEL_ROOM_DOORWAY.z };
      actor.faceAt(0, 16);
      break;
    case 'rico-room':
      actor.group.position.set(1.2, 0, -8.3);
      actor.state = 'deal';
      actor.anchor = { x: 1.2, z: -8.3 };
      actor.target = null;
      actor.afterGoto = null;
      break;
    case 'chino-room':
      actor.group.position.set(-1.2, 0, -7.8);
      actor.state = 'guard';
      actor.anchor = { x: -1.2, z: -7.8 };
      actor.faceAt(0.5, -6.5);
      break;
    case 'slicer-room':
      actor.group.position.set(2.2, 0, -13.5);
      actor.state = 'idle';
      actor.faceAt(0, -8);
      actor.group.visible = true;
      break;
    default:
      throw new RangeError(`Unknown Motel actor geometry stage: ${stageId}`);
  }

  const identity = stageId.split('-')[0];
  return ownActor(actor, `motel.cast:${identity}`, stageId);
}

/** Construct one authored actor without importing the browser boot module. */
export function createMotelActor(scene, stageId, options = {}) {
  const factory = FACTORIES[stageId];
  if (!factory) throw new RangeError(`Unknown Motel actor geometry stage: ${stageId}`);
  /* The stage id IS the actor's id for the staging gate: it is authored,
   * stable, and already the handle `ownActor` names his assembly with. */
  const actor = new Actor(scene, { ...factory(), actorId: stageId });
  return stageMotelActor(actor, stageId, options);
}

/** Build every figure visible in a stable Motel audit state. */
export function buildMotelCastGeometry(scene, stage, options = {}) {
  if (stage === 'startup') {
    return ['snow-arrival', 'lookout', 'watcher', 'clerk']
      .map((stageId) => createMotelActor(scene, stageId, options));
  }
  if (stage !== 'late') throw new RangeError(`Unknown Motel cast geometry state: ${stage}`);

  const car = requireArrivalCar(options.arrivalCar, 'late');
  car.placeArrival(1);
  const actors = [
    createMotelActor(scene, 'snow-exterior', options),
    createMotelActor(scene, 'lookout', options),
    createMotelActor(scene, 'watcher', options),
    createMotelActor(scene, 'clerk', options),
    createMotelActor(scene, 'rico-room', options),
    createMotelActor(scene, 'chino-room', options),
    createMotelActor(scene, 'slicer-room', options),
    ...MOTEL_REINFORCEMENT_STAGES.map(({ id }) => createMotelActor(scene, id, options)),
  ];
  return actors;
}
