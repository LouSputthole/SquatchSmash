/** Pure preview/checkpoint vocabulary and static geometry staging for NO WAKE. */
import * as THREE from 'three';

import { isPreviewMode } from '../core/preview-mode.js';
import { CABIN_CAST_STAGING } from './deck-collision.js';
import {
  mountNoWakeExecutionGuns,
  stowNoWakeExecutionGunsGeometry,
} from './execution-geometry.js';

export const NO_WAKE_PREVIEW_CHECKPOINTS = Object.freeze([
  'dock', 'underway', 'inlet', 'confrontation', 'body', 'return',
]);

export const NO_WAKE_GEOMETRY_CHECKPOINTS = Object.freeze([
  ...NO_WAKE_PREVIEW_CHECKPOINTS.slice(0, 5),
  // A saveable authored state that keeps the complete wrap/ballast rig visible.
  'weighted',
  'return',
]);

export const NO_WAKE_CHECKPOINT_LABELS = Object.freeze({
  dock: 'GATE C — ABOARD',
  underway: 'UNDERWAY — CLEAR OF THE MARINA',
  inlet: 'THE INLET — OPEN WATER, IDLE',
  confrontation: 'THE CONFRONTATION',
  body: 'THE BODY',
  weighted: 'THE WEIGHTS — WRAPPED AND BALLASTED',
  return: 'THE RIDE HOME',
});

export function previewNoWakeCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  const path = String(locationLike?.pathname || '').toLowerCase();
  if (!(path.endsWith('/nowake.html') || path.endsWith('nowake.html'))) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return NO_WAKE_GEOMETRY_CHECKPOINTS.includes(value) ? value : null;
}

function putNpc(npc, mark) {
  npc.group.position.set(mark.x, mark.baseY, mark.z);
  npc.group.rotation.set(0, mark.yaw, 0);
  npc.baseY = mark.baseY;
  npc.job = mark.job;
  npc._syncJob?.(true);
}

export function placeNoWakeCabinCastGeometry(boat) {
  putNpc(boat.cast.lou, CABIN_CAST_STAGING.lou);
  putNpc(boat.cast.booski, CABIN_CAST_STAGING.booski);
  putNpc(boat.cast.willy, CABIN_CAST_STAGING.willyStanding);
  boat.cast.irish.group.position.set(1.75, boat.deck.foredeckHeight, -4.55);
  boat.cast.irish.group.rotation.y = Math.PI;
  boat.cast.irish.baseY = boat.deck.foredeckHeight;
}

export function completeNoWakeStartupGeometry(boat) {
  boat.gangway.visible = false;
  boat.targets.board.visible = false;
  for (const key of ['battery', 'blower', 'fuel', 'ignitionPort', 'ignitionStarboard', 'navLights']) {
    boat.controls[key].setOn(true);
  }
  boat.controls.running.setOn(true);
  boat.targets.dockLine.userData.attached = false;
  boat.targets.dockLine.visible = false;
}

export function poseNoWakeExecutedBodyGeometry(boat) {
  const willy = boat?.cast?.willy;
  if (!willy) throw new Error('NO WAKE executed-body geometry requires the boat cast');
  willy.baseY = boat.cabinDeck.height;
  willy.job = 'stand';
  willy._syncJob?.(true);
  // Lay the standing rig fore-and-aft in the clear aisle. Rotating it sideways
  // put Willy's head through the galley and his torso through a fixed stool.
  // The calibrated pivot leaves the visible body bedded 2 cm into the sole.
  willy.group.position.set(0.10, boat.cabinDeck.height + 0.0882612983, -3.35);
  willy.group.rotation.set(-1.42, 0, 0);
  putNpc(boat.cast.booski, {
    x: -0.65, baseY: boat.cabinDeck.height, z: -2.70, yaw: Math.PI, job: 'stand',
  });
}

export function prepareNoWakeWeightedBodyGeometry(boat, bodyRig) {
  if (!boat?.cast?.willy || !bodyRig?.swapToWrapped) {
    throw new Error('NO WAKE weighted-body geometry requires the boat cast and body rig');
  }
  bodyRig.swapToWrapped(boat.cast.willy);
  bodyRig.foldSide('port');
  bodyRig.foldSide('starboard');
  bodyRig.fastenStraps();
  bodyRig.closeBag();
  bodyRig.attachBallast(boat.ballast);
  // Open the berth curtain before two people try to lift a two-metre bag in
  // the salon aisle. Folded against the port liner, it remains visible.
  boat.cabin.props.curtain.scale.x = 0.12;
  boat.cabin.props.curtain.position.x = -1.72;
}

/**
 * Stage only visible transforms/visibility. No timers, audio, saves or UI.
 * The browser remains responsible for mission sequencing around these poses.
 */
export function stageNoWakeCheckpointGeometry(checkpoint, {
  world,
  bodyRig,
  camera = new THREE.Group(),
} = {}) {
  if (!NO_WAKE_GEOMETRY_CHECKPOINTS.includes(checkpoint)) {
    throw new Error(`Unknown NO WAKE geometry checkpoint: ${checkpoint}`);
  }
  const boat = world?.boat;
  if (!boat || !bodyRig) throw new Error('NO WAKE geometry checkpoint requires world.boat and bodyRig');
  if (checkpoint === 'dock') return { checkpoint, guns: null, bodyStage: bodyRig.state.stage };

  completeNoWakeStartupGeometry(boat);
  if (checkpoint === 'underway') return { checkpoint, guns: null, bodyStage: bodyRig.state.stage };

  boat.root.position.set(world.inlet.x, boat.floatY, world.inlet.z);
  boat.root.rotation.set(0, 0, 0);
  if (checkpoint === 'inlet') return { checkpoint, guns: null, bodyStage: bodyRig.state.stage };

  placeNoWakeCabinCastGeometry(boat);
  boat.cabin.setDoorsClosed(true);
  if (checkpoint === 'confrontation') return { checkpoint, guns: null, bodyStage: bodyRig.state.stage };

  const guns = mountNoWakeExecutionGuns({ boat, camera });
  guns.playerGun.visible = false;
  if (checkpoint === 'body') {
    poseNoWakeExecutedBodyGeometry(boat);
    return { checkpoint, guns, bodyStage: bodyRig.state.stage };
  }

  prepareNoWakeWeightedBodyGeometry(boat, bodyRig);
  stowNoWakeExecutionGunsGeometry(guns);
  if (checkpoint === 'weighted') {
    bodyRig.carryTo(0, { booski: boat.cast.booski });
    // Lou follows from the companionway landing; he does not stand inside the
    // bag while the two carriers lift it.
    boat.cast.lou.group.position.set(0.40, boat.deck.height, 0.20);
    boat.cast.lou.group.rotation.y = 0;
    boat.cast.lou.baseY = boat.deck.height;
    return { checkpoint, guns, bodyStage: bodyRig.state.stage };
  }

  bodyRig.disposeTo(1);
  boat.cabin.setDoorsClosed(false);
  boat.cast.irish.group.position.set(1.75, boat.deck.foredeckHeight, -4.55);
  boat.cast.irish.group.rotation.y = Math.PI;
  /* x -1.10 here and in `beginExit()`, which this mirrors: -1.30 stood him
   * 40 mm inside the port cockpit bench (its starboard face is x -1.26 in
   * DECK_COLLIDERS), which is what the staging gate reported on this state as
   * ACTOR_INSIDE_SOLID. -1.10 is the spot he keeps all night. */
  boat.cast.booski.group.position.set(-1.10, boat.deck.height, 3.90);
  boat.cast.booski.group.rotation.y = 0;
  boat.cast.lou.group.position.set(0, boat.deck.height, 3.45);
  boat.cast.lou.group.rotation.y = Math.PI;
  boat.cast.lou.baseY = boat.deck.height;
  boat.controls.ignitionPort.setOn(true);
  boat.controls.ignitionStarboard.setOn(true);
  boat.controls.running.setOn(true);
  return { checkpoint, guns, bodyStage: bodyRig.state.stage };
}
