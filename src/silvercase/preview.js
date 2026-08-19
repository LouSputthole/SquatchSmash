import { isPreviewMode } from '../core/preview-mode.js';
import { yawToward } from '../world/build.js';
import { ANCHORS } from './scenes/ApartmentScene.js';

export const SILVERCASE_CHECKPOINTS = Object.freeze({
  car: 'car',
  hallway: 'hallway',
  room: 'room',
  prayer: 'prayer',
  bathroom: 'bathroom',
  aftermath: 'aftermath',
});

export const SILVERCASE_CHECKPOINT_LABELS = Object.freeze({
  car: 'THE CAR RIDE',
  hallway: 'THE HALLWAY',
  room: 'CONTROL ESTABLISHED',
  prayer: 'THE SQUATCH PRAYER',
  bathroom: 'THE BATHROOM AMBUSH',
  aftermath: 'THE AFTERMATH',
});

const RETRY_SPOT = Object.freeze({ x: 9.4, z: 0.55 });

const PLANS = Object.freeze({
  car: Object.freeze({
    checkpoint: 'car', world: 'car', player: 'car-seat', apeSpot: null,
    dead: Object.freeze([]), pruittVisible: false, caseClosed: false,
    caseOccluded: true, frontDoorOpen: false, bathroomDoorOpen: false,
    apeWeapon: 'holstered',
  }),
  hallway: Object.freeze({
    checkpoint: 'hallway', world: 'apartment', player: 'hallway', apeSpot: 'hallway',
    dead: Object.freeze([]), pruittVisible: false, caseClosed: false,
    caseOccluded: true, frontDoorOpen: false, bathroomDoorOpen: false,
    apeWeapon: 'holstered',
  }),
  room: Object.freeze({
    checkpoint: 'room', world: 'apartment', player: 'front-door', apeSpot: 'door',
    dead: Object.freeze([]), pruittVisible: false, caseClosed: false,
    caseOccluded: true, frontDoorOpen: true, bathroomDoorOpen: false,
    apeWeapon: 'holstered',
  }),
  prayer: Object.freeze({
    checkpoint: 'prayer', world: 'apartment', player: 'retry', apeSpot: 'chair',
    dead: Object.freeze(['deke']), pruittVisible: false, caseClosed: true,
    caseOccluded: false, frontDoorOpen: true, bathroomDoorOpen: false,
    apeWeapon: 'carry',
  }),
  bathroom: Object.freeze({
    checkpoint: 'bathroom', world: 'apartment', player: 'retry', apeSpot: 'chair',
    dead: Object.freeze(['deke', 'chester']), pruittVisible: true, caseClosed: true,
    caseOccluded: false, frontDoorOpen: true, bathroomDoorOpen: false,
    apeWeapon: 'carry',
  }),
  aftermath: Object.freeze({
    checkpoint: 'aftermath', world: 'apartment', player: 'retry', apeSpot: 'chair',
    dead: Object.freeze(['deke', 'chester', 'pruitt']), pruittVisible: true, caseClosed: true,
    caseOccluded: false, frontDoorOpen: true, bathroomDoorOpen: true,
    apeWeapon: 'carry',
  }),
});

export function previewCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return value && Object.hasOwn(SILVERCASE_CHECKPOINTS, value)
    ? SILVERCASE_CHECKPOINTS[value]
    : null;
}

/** Pure, immutable description of one public checkpoint's visible pose. */
export function silverCasePreviewPose(checkpoint) {
  const pose = PLANS[checkpoint];
  if (!pose) throw new Error(`Unknown Silver Case preview checkpoint: ${checkpoint}`);
  return pose;
}

function stageWalkingPlayer(player) {
  if (!player) return;
  player.mode = 'walk';
  player.eyeHeight = 1.66;
  player.targetEye = 1.66;
  player.pitchMin = -Math.PI / 2 + 0.05;
  player.pitchMax = Math.PI / 2 - 0.05;
  player.yawCenter = null;
  player.velocity.set(0, 0, 0);
}

function stagePlayer(pose, player, car) {
  if (!player) return;
  if (pose.player === 'car-seat') {
    player.mode = 'seated';
    player.position.set(car.anchors.playerSeat.x, car.anchors.playerSeat.y, car.anchors.playerSeat.z);
    player.yaw = car.anchors.playerYaw;
    player.yawCenter = car.anchors.playerYaw;
    player.yawRange = car.anchors.yawRange;
    player.pitchMin = car.anchors.pitchMin;
    player.pitchMax = car.anchors.pitchMax;
    player.pitch = 0;
    player.velocity.set(0, 0, 0);
    return;
  }

  stageWalkingPlayer(player);
  if (pose.player === 'hallway') {
    player.position.set(ANCHORS.hallwaySpawn.x, 1.66, ANCHORS.hallwaySpawn.z);
    player.yaw = ANCHORS.hallwaySpawn.yaw;
  } else if (pose.player === 'front-door') {
    player.position.set(ANCHORS.frontDoorInside.x, 1.66, ANCHORS.frontDoorInside.z);
    player.yaw = ANCHORS.frontDoorInside.yaw;
  } else if (pose.player === 'retry') {
    player.position.set(RETRY_SPOT.x, 1.66, RETRY_SPOT.z);
    player.yaw = yawToward(RETRY_SPOT, ANCHORS.chairSeat);
  }
  player.pitch = 0;
}

/**
 * Apply a pure preview pose to already-built runtime objects.
 * `settleSeconds` is zero in the browser (where the frame loop animates each
 * collapse) and non-zero in the geometry gate so corpse geometry is scanned
 * at its stable, checkpoint-visible resting pose.
 */
export function applySilverCasePreviewPose(checkpoint, {
  apartment,
  car,
  cast,
  player = null,
  setFrontDoorColliderOpen = null,
  setBathroomDoorColliderOpen = null,
  drawPlayerWeapon = null,
  settleSeconds = 0,
} = {}) {
  if (!apartment?.root || !car?.root || !cast?.ape || !Array.isArray(cast?.all)) {
    throw new Error('Silver Case preview pose requires apartment, car, and complete cast');
  }
  const pose = silverCasePreviewPose(checkpoint);

  car.root.visible = pose.world === 'car';
  apartment.root.visible = pose.world === 'apartment';
  stagePlayer(pose, player, car);

  if (pose.frontDoorOpen) {
    apartment.doors.frontDoor.group.rotation.y = apartment.doors.frontDoor.openRotationY;
    setFrontDoorColliderOpen?.(apartment.doors.frontDoor.collider, true);
  }
  if (pose.bathroomDoorOpen) {
    apartment.doors.bathroomDoor.group.rotation.y = apartment.doors.bathroomDoor.openRotationY;
    setBathroomDoorColliderOpen?.(apartment.doors.bathroomDoor.collider, true);
  }

  if (pose.apeSpot) cast.ape.snapTo(pose.apeSpot);
  apartment.props.caseOcclusion.visible = pose.caseOccluded;
  if (pose.caseClosed) apartment.props.case.close({ instant: true });

  if (pose.apeWeapon === 'carry') {
    cast.ape.drawWeapon();
    cast.ape.aimWeapon(false);
    drawPlayerWeapon?.();
  }

  if (pose.pruittVisible) cast.pruitt.reveal();
  for (const id of pose.dead) {
    const actor = cast[id];
    if (!actor) throw new Error(`Silver Case preview pose has no actor ${id}`);
    actor.kill();
    if (settleSeconds > 0) actor.update(settleSeconds);
  }

  return pose;
}
