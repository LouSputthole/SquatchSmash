/** Pure preview vocabulary and static checkpoint geometry for Enola Squatch. */
import * as THREE from 'three';

import { WP } from '../beefrun/config.js';
import { isPreviewMode } from '../core/preview-mode.js';
import {
  AC_ENOLA, ENOLA_PARKING, LANDMARKS_EAST, TARGET_X, TURN_POINT,
} from './config.js';
import { approxGroundHeight } from './mission/MissionController.js';

const COMPOUND = LANDMARKS_EAST.find((landmark) => landmark.id === 'compound');
const RETURN_HEADING = (TURN_POINT.newHeading + 180) % 360;

export const ENOLA_PREVIEW_CHECKPOINTS = Object.freeze([
  'preflight', 'takeoff', 'flak', 'bombrun', 'detonation', 'return',
]);

export const ENOLA_CHECKPOINT_ALIASES = Object.freeze({
  preflight: 'preflight',
  takeoff: 'takeoff',
  flak: 'defense',
  bombrun: 'bombApproach',
  detonation: 'explosion',
  return: 'return',
});

const ENOLA_CHECKPOINT_BY_PHASE = Object.freeze(Object.fromEntries(
  Object.entries(ENOLA_CHECKPOINT_ALIASES).map(([checkpoint, phase]) => [phase, checkpoint]),
));

/**
 * Final weather visible at each public preview checkpoint. The flak and
 * detonation values describe the organically reached night-raid phases, not
 * the apron defaults a fresh debug jump happened to inherit.
 */
export const ENOLA_CHECKPOINT_WEATHER = Object.freeze({
  preflight: Object.freeze({ turbulence: 0.2, crosswind: 0.3, rain: 0, cloudDensity: 0.35, dusk: 1, night: 1, lightning: 0 }),
  takeoff: Object.freeze({ turbulence: 0.2, crosswind: 0.3, rain: 0, cloudDensity: 0.3, dusk: 0.5, night: 0.1, lightning: 0 }),
  flak: Object.freeze({ turbulence: 0.4, crosswind: 0.3, rain: 0, cloudDensity: 0.6, dusk: 1, night: 1, lightning: 0 }),
  bombrun: Object.freeze({ turbulence: 0.5, crosswind: 0.3, rain: 0, cloudDensity: 0.5, dusk: 1, night: 1, lightning: 0 }),
  detonation: Object.freeze({ turbulence: 0.5, crosswind: 0.3, rain: 0, cloudDensity: 0.5, dusk: 1, night: 1, lightning: 0 }),
  return: Object.freeze({ turbulence: 0.5, crosswind: 0.3, rain: 0, cloudDensity: 0.5, dusk: 0.8, night: 0.4, lightning: 0.1 }),
});

export function applyEnolaCheckpointWeather(checkpoint, weather) {
  const conditions = ENOLA_CHECKPOINT_WEATHER[checkpoint];
  if (!conditions) throw new Error(`Unknown Enola geometry checkpoint: ${checkpoint}`);
  if (!weather?.setConditions) throw new Error('Enola checkpoint weather requires WeatherSystem');
  weather.setConditions(conditions);
  return conditions;
}

export function applyEnolaPhaseCheckpointWeather(phase, weather) {
  const checkpoint = ENOLA_CHECKPOINT_BY_PHASE[phase];
  return checkpoint ? applyEnolaCheckpointWeather(checkpoint, weather) : null;
}

export const ENOLA_PREVIEW_CHECKPOINT_LABELS = Object.freeze({
  preflight: 'PREFLIGHT — ENGINE START',
  takeoff: 'TAKEOFF ROLL',
  defense: 'FLAK & FIGHTERS',
  bombApproach: 'BOMB RUN',
  explosion: 'DETONATION',
  return: 'RETURN LEG',
});

export function previewEnolaCheckpointForLocation(locationLike = globalThis.location) {
  if (!isPreviewMode(locationLike)) return null;
  const path = String(locationLike?.pathname || '').toLowerCase();
  if (!(path.endsWith('/enolasquatch.html') || path.endsWith('enolasquatch.html'))) return null;
  let params;
  try { params = new URLSearchParams(locationLike?.search || ''); } catch { return null; }
  const value = params.get('checkpoint');
  return Object.prototype.hasOwnProperty.call(ENOLA_CHECKPOINT_ALIASES, value)
    ? ENOLA_CHECKPOINT_ALIASES[value]
    : null;
}

function setAircraftPose(aircraft, position, headingDegrees) {
  aircraft.group.position.copy(position);
  aircraft.group.quaternion.setFromEuler(new THREE.Euler(
    0,
    THREE.MathUtils.degToRad(headingDegrees),
    0,
    'YXZ',
  ));
}

/**
 * Stage geometry only: transforms, visibility, crew parenting, weather props,
 * target destruction and payload parenting. It intentionally has no UI,
 * audio, campaign writes or timers.
 */
export function stageEnolaCheckpointGeometry(checkpoint, {
  scene,
  aircraft,
  payload,
  crew,
  airfield,
  city,
  weather,
  groundHeight,
  worldGeometry,
} = {}) {
  if (!ENOLA_PREVIEW_CHECKPOINTS.includes(checkpoint)) {
    throw new Error(`Unknown Enola geometry checkpoint: ${checkpoint}`);
  }
  if (!scene?.add || !aircraft?.group || !payload?.group || !crew?.takeSeats || !airfield?.anchors) {
    throw new Error('Enola geometry checkpoint is missing a required runtime producer');
  }
  if (typeof groundHeight !== 'function' || !city || !weather || !worldGeometry?.setCrater) {
    throw new Error('Enola geometry checkpoint is missing terrain, city or weather composition');
  }

  crew.takeSeats(aircraft);
  aircraft.setCrewDoorOpen?.(false);
  if (aircraft.parts?.ladder) aircraft.parts.ladder.visible = false;

  applyEnolaCheckpointWeather(checkpoint, weather);

  let position;
  let heading;
  let destroyed = false;
  let payloadReleased = false;

  switch (checkpoint) {
    case 'preflight': {
      const lineUp = airfield.anchors.lineUp;
      position = new THREE.Vector3(
        lineUp.x,
        groundHeight(lineUp.x, lineUp.z) + AC_ENOLA.gearY,
        lineUp.z,
      );
      heading = airfield.anchors.departHeading;
      airfield.setDusk?.(1);
      airfield.moveTruckToThreshold?.();
      airfield.setTruckLights?.(true);
      break;
    }
    case 'takeoff': {
      const lineUp = airfield.anchors.lineUp;
      position = new THREE.Vector3(lineUp.x, WP.elev + AC_ENOLA.gearY, lineUp.z);
      heading = airfield.anchors.departHeading;
      break;
    }
    case 'flak': {
      const x = TARGET_X - 1600;
      position = new THREE.Vector3(x, groundHeight(x, COMPOUND.z) + 380, COMPOUND.z);
      heading = TURN_POINT.newHeading;
      break;
    }
    case 'bombrun':
      position = new THREE.Vector3(
        TARGET_X - 2100,
        approxGroundHeight(TARGET_X) + 400,
        COMPOUND.z,
      );
      heading = TURN_POINT.newHeading;
      break;
    case 'detonation': {
      const elevation = groundHeight(ENOLA_PARKING.x, ENOLA_PARKING.z);
      position = new THREE.Vector3(
        ENOLA_PARKING.x,
        elevation + AC_ENOLA.gearY,
        ENOLA_PARKING.z,
      );
      heading = ENOLA_PARKING.heading;
      setAircraftPose(aircraft, position, heading);
      aircraft.group.updateMatrixWorld(true);
      payload.release(scene, new THREE.Vector3());
      /* The detonation checkpoint represents the beat after impact, not a
       * second bomb still hanging in the bay. Match the organically reached
       * mission state before the destroyed-city geometry is staged. */
      payload.impacted = true;
      payload.group.visible = false;
      payloadReleased = true;
      const impact = new THREE.Vector3(TARGET_X, groundHeight(TARGET_X, COMPOUND.z), COMPOUND.z);
      const crater = city.destroy(impact);
      worldGeometry.setCrater(crater);
      destroyed = true;
      break;
    }
    case 'return':
      position = new THREE.Vector3(
        TARGET_X - 900,
        approxGroundHeight(TARGET_X) + 500,
        COMPOUND.z,
      );
      heading = RETURN_HEADING;
      payload.released = true;
      payload.impacted = true;
      payload.group.visible = false;
      payloadReleased = true;
      break;
    default:
      throw new Error(`Unhandled Enola geometry checkpoint: ${checkpoint}`);
  }

  setAircraftPose(aircraft, position, heading);
  weather.update(0, position);
  scene.updateMatrixWorld(true);
  return {
    checkpoint,
    phase: ENOLA_CHECKPOINT_ALIASES[checkpoint],
    destroyed,
    payloadReleased,
    crewAboard: crew.aboard === true,
    aircraftPosition: position.toArray(),
    heading,
  };
}
