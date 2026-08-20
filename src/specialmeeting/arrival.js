/**
 * The wait, and the thing that ends it.
 *
 * The player comes downstairs and stands on the pavement. For ten seconds
 * nothing happens, which is the longest ten seconds in the campaign, and then
 * headlights come round the corner at the far end of the street and an old
 * dark sedan takes its time getting to him. It does not screech in. It does
 * not pull up hard. It arrives the way a car arrives when the men in it are
 * not in a hurry and have all night.
 *
 * That is the whole job of this file, and the reason it is a state machine
 * rather than a cutscene is that the player is not being held: he can walk
 * about, he can go and look in the alley, he can stand in the road if he
 * wants. The car does what it was going to do either way.
 *
 * No THREE beyond a scratch vector, no scene, no DOM. It drives a `sedan`
 * (./sedan.js) and, if it is handed one, an ambience (./ambience.js).
 */
import * as THREE from 'three';

import {
  ARRIVAL_ROUTE,
  ARRIVAL_TIMING,
  DEPARTURE_ROUTE,
  SEDAN_STAGING,
  WAIT_SECONDS,
} from './layout.js';
import { RouteDriver } from './drive.js';

/**
 * In order. `stopped` is where the scene lives for most of its running time —
 * everything that is said outside the car is said with the engine going.
 */
export const ARRIVAL_PHASES = Object.freeze([
  'waiting',
  'headlights',
  'approach',
  'pulling_up',
  'stopped',
  'departing',
  'gone',
]);

/** Range at which the approach becomes a pull-up, in metres. */
const PULL_UP_RANGE = 15;

export function createArrivalSequence({
  sedan,
  ambience = null,
  waitSeconds = WAIT_SECONDS,
  route = ARRIVAL_ROUTE,
  departure = DEPARTURE_ROUTE,
  staging = SEDAN_STAGING,
  onPhase = null,
} = {}) {
  if (!sedan) throw new Error('createArrivalSequence needs a sedan');

  const point = new THREE.Vector3();
  let phase = 'waiting';
  let elapsed = 0;
  let hold = 0;
  let driver = null;
  let settled = false;

  const positionOf = () => point.set(sedan.vehicle.x, 0.6, sedan.vehicle.z);

  const enter = (next) => {
    if (next === phase) return;
    const previous = phase;
    phase = next;
    onPhase?.(next, previous);
  };

  const sequence = {
    get phase() { return phase; },
    get elapsed() { return elapsed; },
    /** True once the car has stopped and had a moment to sit there. */
    get settled() { return settled; },
    get driver() { return driver; },

    /** Back to the top: car parked up the cross street, dark, engine off. */
    reset() {
      sedan.placeAt(staging.x, staging.z, staging.heading);
      sedan.setHeadlights(false);
      sedan.setBrake(0);
      sedan.setTrunk(0);
      sedan.setCabinLight(false);
      ambience?.engineOff();
      driver = null;
      settled = false;
      elapsed = 0;
      hold = 0;
      phase = 'waiting';
      return sequence;
    },

    /**
     * Skip the wait.
     *
     * For a preview launcher, a checkpoint restart, or a playtester who has
     * already seen the ten seconds forty times today. It does not skip the
     * DRIVE — the drive is the beat.
     */
    beginNow() {
      if (phase !== 'waiting') return sequence;
      elapsed = waitSeconds;
      return sequence;
    },

    /** Put the car at the kerb, stopped, as if it had already arrived. */
    snapToKerb() {
      const last = route[route.length - 1];
      sedan.placeAt(last.x, last.z, Math.PI / 2);
      sedan.setHeadlights(true);
      sedan.setBrake(0.35);
      driver = null;
      settled = true;
      hold = 0;
      enter('stopped');
      if (ambience && !ambience.engineIsRunning) ambience.engineStart(positionOf());
      return sequence;
    },

    /** Everybody is in. Go. */
    driveAway() {
      if (phase === 'departing' || phase === 'gone') return sequence;
      driver = new RouteDriver(sedan.vehicle, departure, { stopAtEnd: false });
      sedan.setBrake(0);
      ambience?.engineRev(positionOf());
      enter('departing');
      return sequence;
    },

    update(dt) {
      switch (phase) {
        case 'waiting': {
          elapsed += dt;
          if (elapsed >= waitSeconds) {
            /* The engine turns over a hundred metres away and the lights come
             * on. He hears it before he sees it, which is the right order. */
            ambience?.engineStart(positionOf());
            sedan.setHeadlights(true);
            hold = ARRIVAL_TIMING.headlightHold;
            enter('headlights');
          }
          break;
        }
        case 'headlights': {
          hold -= dt;
          if (hold <= 0) {
            driver = new RouteDriver(sedan.vehicle, route);
            enter('approach');
          }
          break;
        }
        case 'approach':
        case 'pulling_up': {
          sedan.update(dt, driver);
          sedan.setBrake(sedan.vehicle.brake);
          if (phase === 'approach' && driver.distanceToTarget() <= PULL_UP_RANGE
            && driver.onFinalNode) {
            enter('pulling_up');
          }
          if (driver.done) {
            sedan.setBrake(1);
            hold = ARRIVAL_TIMING.settle;
            enter('stopped');
          }
          break;
        }
        case 'stopped': {
          sedan.update(dt, driver?.holding ? null : driver);
          if (!settled) {
            hold -= dt;
            if (hold <= 0) {
              /* Foot off the brake. The tail lights drop back to sidelights
               * and the car just sits there with the engine running, which is
               * a great deal worse than if it had switched off. */
              settled = true;
              sedan.setBrake(0.35);
              onPhase?.('settled', 'stopped');
            }
          }
          break;
        }
        case 'departing': {
          sedan.update(dt, driver);
          sedan.setBrake(sedan.vehicle.brake);
          if (driver.done) {
            ambience?.engineOff();
            enter('gone');
          }
          break;
        }
        default:
          sedan.update(dt, null);
          break;
      }
      ambience?.update(dt, positionOf());
      return sequence;
    },
  };

  sequence.reset();
  return sequence;
}
