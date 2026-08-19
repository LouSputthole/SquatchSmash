import * as THREE from 'three';

import { BEEFRUN_PREVIEW_CHECKPOINTS } from '../core/preview-mode.js';
import { AC, EH, HOME_APPROACH, WP } from './config.js';
import { setPose } from './npc.js';

export const BEEF_RUN_PREVIEW_CHECKPOINTS = BEEFRUN_PREVIEW_CHECKPOINTS;

export const BEEF_RUN_PREVIEW_CHECKPOINT_LABELS = Object.freeze({
  preflight: 'PREFLIGHT CHECK',
  takeoff: 'RUNWAY TAKEOFF',
  approach: 'EL HUESO APPROACH',
  departure: 'LOADED DEPARTURE',
  return: 'HOME APPROACH',
  landing: 'FINAL LANDING',
});

const PHASES = Object.freeze({
  preflight: 'preflight',
  takeoff: 'lineup',
  approach: 'approach',
  departure: 'heavyTakeoff',
  return: 'home',
  landing: 'home',
});

const WEATHER = Object.freeze({
  preflight: Object.freeze({ dusk: 0, rain: 0, turbulence: 0.22, cloudDensity: 0.35, crosswind: 0.4 }),
  takeoff: Object.freeze({ dusk: 0, rain: 0, turbulence: 0.22, cloudDensity: 0.35, crosswind: 0.4 }),
  approach: Object.freeze({ dusk: 0, rain: 0, turbulence: 0.62, cloudDensity: 0.55, crosswind: 0.4 }),
  departure: Object.freeze({ dusk: 0.15, rain: 0.1, turbulence: 0.7, cloudDensity: 0.7, crosswind: 0.4 }),
  return: Object.freeze({ dusk: 1, rain: 0.15, turbulence: 0.5, cloudDensity: 0.6, crosswind: 2.6 }),
  landing: Object.freeze({ dusk: 1, rain: 0.15, turbulence: 0.5, cloudDensity: 0.6, crosswind: 2.6 }),
});

function requireObject(value, label) {
  if (!value || typeof value !== 'object') {
    throw new TypeError(`Beef Run geometry staging requires ${label}`);
  }
  return value;
}

function aircraftPose(checkpoint, { airfield, airstrip }) {
  if (checkpoint === 'preflight') {
    const parking = airfield.anchors.parking;
    return {
      position: new THREE.Vector3(parking.x, parking.y + AC.gearY, parking.z),
      heading: airfield.anchors.parkingHeading,
      speed: 0,
    };
  }
  if (checkpoint === 'takeoff') {
    const runway = airfield.anchors.lineUp;
    return {
      position: new THREE.Vector3(runway.x, WP.elev + AC.gearY, runway.z),
      heading: WP.heading,
      speed: 0,
    };
  }
  if (checkpoint === 'approach') {
    return {
      position: new THREE.Vector3(EH.x - 40, EH.elevLow + 420, EH.zLow + 2600),
      heading: 178,
      speed: 62,
    };
  }
  if (checkpoint === 'departure') {
    const runway = airstrip.anchors.departStart;
    return {
      position: new THREE.Vector3(runway.x, runway.y + AC.gearY, runway.z),
      heading: airstrip.anchors.departHeading,
      speed: 0,
    };
  }
  const approach = checkpoint === 'landing' ? HOME_APPROACH.demoLanding : HOME_APPROACH.entry;
  return {
    position: new THREE.Vector3(approach.x, approach.y, approach.z),
    heading: approach.heading,
    speed: approach.speed,
  };
}

function stagePeople(checkpoint, { scene, aircraft, airfield, lou, stove }) {
  scene.add(stove.group);
  const stovePosition = checkpoint === 'preflight'
    ? airfield.anchors.stoveHangar
    : airfield.anchors.stoveStand;
  stove.group.position.copy(stovePosition);
  stove.group.rotation.set(0, checkpoint === 'preflight' ? Math.PI : 0, 0);
  setPose(stove, 'idle');

  if (checkpoint === 'preflight') {
    scene.add(lou.group);
    lou.group.position.copy(airfield.anchors.louStand);
    lou.group.rotation.set(0, 0, 0);
    setPose(lou, 'lean');
    lou.faceToward?.(airfield.anchors.playerStart.x, airfield.anchors.playerStart.z);
    if (lou.cup) lou.cup.visible = true;
    if (lou.tag) lou.tag.visible = true;
    return false;
  }

  aircraft.group.add(lou.group);
  lou.group.position.copy(aircraft.copilotSeat);
  lou.group.rotation.set(0, 0, 0);
  setPose(lou, 'sit');
  if (lou.cup) lou.cup.visible = false;
  if (lou.tag) lou.tag.visible = false;
  return true;
}

/**
 * Stage only the deterministic world geometry for a public Beef Run checkpoint.
 *
 * The mission controller remains responsible for campaign, audio, scoring and
 * input state. Both the browser restore path and the headless geometry adapter
 * call this function, so aircraft, weather, terrain, cast and walkaround props
 * cannot drift into two different versions of the same checkpoint.
 */
export function stageBeefRunCheckpointGeometry(checkpoint, context = {}) {
  if (!BEEF_RUN_PREVIEW_CHECKPOINTS.includes(checkpoint)) {
    throw new RangeError(`Unknown Beef Run geometry checkpoint: ${checkpoint}`);
  }

  const scene = requireObject(context.scene, 'scene');
  const physics = requireObject(context.physics, 'physics');
  const aircraft = requireObject(context.aircraft, 'aircraft');
  const terrain = requireObject(context.terrain, 'terrain');
  const weather = requireObject(context.weather, 'weather');
  const airfield = requireObject(context.airfield, 'airfield');
  const airstrip = requireObject(context.airstrip, 'airstrip');
  const lou = requireObject(context.lou, 'Captain Lou Sasole');
  const stove = requireObject(context.stove, 'Old Stove');
  const preflight = requireObject(context.preflight, 'Preflight');

  if (typeof physics.setPose !== 'function' || typeof aircraft.syncTo !== 'function') {
    throw new TypeError('Beef Run geometry staging requires aircraft pose collaborators');
  }
  if (typeof terrain.prime !== 'function' || typeof weather.setConditions !== 'function') {
    throw new TypeError('Beef Run geometry staging requires terrain and weather producers');
  }

  /* Chocks begin beneath the parked aeroplane. A direct airborne checkpoint
   * must leave them on that apron, not teleport them from an uninitialised
   * origin or carry them into the sky with the airframe. */
  if (checkpoint !== 'preflight' && !preflight.groundKitStowed) {
    const parked = aircraftPose('preflight', { airfield, airstrip });
    physics.setPose(parked.position, parked.heading, parked.speed);
    aircraft.syncTo(physics);
    preflight.stowGroundKit();
  }

  const pose = aircraftPose(checkpoint, { airfield, airstrip });
  physics.setPose(pose.position, pose.heading, pose.speed);
  aircraft.syncTo(physics);
  aircraft.setCargoRamp?.(false);

  if (checkpoint === 'preflight') {
    if (preflight.groundKitStowed) {
      throw new Error('Beef Run preflight geometry requires a fresh, unstowed ground kit');
    }
    preflight.arm();
    preflight.update?.(0, physics, context.camera ?? null);
  } else {
    preflight.disarm();
  }

  const louAboard = stagePeople(checkpoint, { scene, aircraft, airfield, lou, stove });
  if (checkpoint === 'return' || checkpoint === 'landing') airfield.moveTruckToThreshold();

  const crosswindScale = Number.isFinite(context.crosswindScale) ? context.crosswindScale : 1;
  const conditions = {
    ...WEATHER[checkpoint],
    crosswind: WEATHER[checkpoint].crosswind * crosswindScale,
  };
  weather.setConditions(conditions);
  weather.update?.(0, physics.position);
  terrain.prime(physics.position.x, physics.position.z);
  scene.updateMatrixWorld?.(true);

  return Object.freeze({
    checkpoint,
    phase: PHASES[checkpoint],
    aircraftPosition: Object.freeze(physics.position.toArray()),
    aircraftHeading: pose.heading,
    aircraftSpeed: pose.speed,
    terrainCenter: Object.freeze([physics.position.x, physics.position.z]),
    weather: Object.freeze({ ...conditions }),
    louAboard,
    stovePosition: Object.freeze(stove.group.getWorldPosition(new THREE.Vector3()).toArray()),
    preflightArmed: preflight.armed,
    groundKitStowed: preflight.groundKitStowed,
  });
}
