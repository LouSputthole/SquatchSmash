/**
 * What the block sounds like when there is nobody on it.
 *
 * The brief is "distant traffic ambience", and the reason it matters is the
 * same reason the block is built at all: the player is standing still for a
 * long time on purpose, and silence would read as the game having stopped
 * rather than as a man waiting. So there is always something — a wet road two
 * streets over, an extractor fan in the alley, a car going somewhere else
 * every ten seconds or so, a horn far enough away to belong to another night.
 * None of it is ever close. The only thing that gets close is the car.
 *
 * EVERY CUE HERE ALREADY EXISTS in assets/sfx/manifest.json. Nothing new is
 * minted, deliberately: this pass does not own the manifest, and a scene that
 * names a cue nobody has recorded is a scene that plays silence and tells no
 * one. The names are spelled out at the call sites rather than looked up from
 * a table, because `tools/check.mjs` reads the call sites — a cue assembled
 * out of variables is a cue the build cannot see.
 *
 * The two I would ask for, if the manifest were mine to edit, are listed at
 * the bottom of this file.
 */
import * as THREE from 'three';

import { EASTBOUND_LANE_Z, WESTBOUND_LANE_Z } from './layout.js';

/** Every cue this module can play. Read by the tests; not by the code. */
export const AMBIENCE_CUES = Object.freeze([
  'street.wet.night',
  'ambience.alley',
  'traffic.pass',
  'street.car.pass.wet',
  'street.horn.distant',
  'car.engine.start',
  'car.engine.idle',
  'car.engine.rev',
  'car.door',
]);

/** Loop keys, so a scene teardown can stop them without knowing the cues. */
export const AMBIENCE_LOOPS = Object.freeze(['sm.street', 'sm.alley', 'sm.sedan.engine']);

const PASS_GAP = Object.freeze({ min: 6.5, max: 15 });
const HORN_GAP = Object.freeze({ min: 34, max: 78 });

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return state / 4294967296;
  };
}

/**
 * @param {object} options
 *   `audio` is an `AudioEngine` (or null, headless). `alleyMouth` is where the
 *   alley bed is panned from.
 */
export function createSpecialMeetingAmbience({
  audio = null,
  alleyMouth = new THREE.Vector3(-17.5, 1.5, -8),
  seed = 0x5ea31f,
} = {}) {
  const rnd = seeded(seed);
  const passPoint = new THREE.Vector3();
  const enginePoint = new THREE.Vector3();

  let running = false;
  let engineRunning = false;
  let nextPass = 3.5;
  let nextHorn = 22;
  let passes = 0;
  let horns = 0;

  const gap = (range) => range.min + rnd() * (range.max - range.min);

  const ambience = {
    /** Bring the beds up. Idempotent; `startLoop` is keyed. */
    start() {
      if (running) return;
      running = true;
      audio?.startLoop('sm.street', {
        name: 'street.wet.night', ambience: true, volume: 0.30, fade: 2.4,
      });
      audio?.startLoop('sm.alley', {
        name: 'ambience.alley', volume: 0.15, position: alleyMouth, ref: 4, maxDist: 26, fade: 2.4,
      });
    },

    stop() {
      running = false;
      engineRunning = false;
      audio?.stopLoop('sm.street', 1.2);
      audio?.stopLoop('sm.alley', 1.2);
      audio?.stopLoop('sm.sedan.engine', 0.6);
    },

    /**
     * Drop the beds under a line, and bring them back after it.
     *
     * Nothing in this engine does that automatically and a conversation over a
     * running V8 is a conversation nobody can hear — golf ducks its course bed
     * on every cue for exactly this reason.
     */
    duck(on) {
      audio?.setLoopVolume('sm.street', on ? 0.14 : 0.30, 0.35);
      audio?.setLoopVolume('sm.alley', on ? 0.07 : 0.15, 0.35);
      if (engineRunning) audio?.setLoopVolume('sm.sedan.engine', on ? 0.13 : 0.26, 0.35);
    },

    /** The starter, then the idle it settles into. */
    engineStart(position) {
      enginePoint.copy(position);
      audio?.play('car.engine.start', {
        volume: 0.62, position: enginePoint, ref: 3.5, maxDist: 90, rolloff: 0.9,
      });
      engineRunning = true;
      audio?.startLoop('sm.sedan.engine', {
        name: 'car.engine.idle', volume: 0.26, position: enginePoint,
        ref: 3.5, maxDist: 70, fade: 2.6,
      });
    },

    /** One shove of throttle, for pulling away from a kerb. */
    engineRev(position) {
      audio?.play('car.engine.rev', {
        volume: 0.5, position: position ?? enginePoint, ref: 3.5, maxDist: 90, rolloff: 0.9,
      });
    },

    engineOff() {
      engineRunning = false;
      audio?.stopLoop('sm.sedan.engine', 0.9);
    },

    get engineIsRunning() { return engineRunning; },

    /** A heavy door, shut from outside, on a wet street. */
    doorShut(position) {
      audio?.play('car.door', {
        volume: 0.75, position: position ?? enginePoint, ref: 2.4, maxDist: 40,
      });
    },

    /**
     * Move the engine bed with the car.
     *
     * `moveLoop` re-pans a running loop rather than stopping and restarting
     * it, which is the difference between a car driving past and a car being
     * switched off and on again sixty times a second.
     */
    followSedan(position) {
      if (!engineRunning || !position) return;
      enginePoint.copy(position);
      audio?.moveLoop('sm.sedan.engine', enginePoint);
    },

    /**
     * Somebody else's night, going past two streets away.
     *
     * Placed a long way off the end of the block on alternating sides, with a
     * shallow rolloff and a big maxDistance so it arrives as a swell rather
     * than as a click at the edge of the panner.
     */
    passingCar() {
      passes++;
      const eastbound = rnd() < 0.5;
      passPoint.set(
        eastbound ? -96 : 96,
        0.6,
        eastbound ? EASTBOUND_LANE_Z : WESTBOUND_LANE_Z,
      );
      if (rnd() < 0.5) {
        audio?.play('traffic.pass', {
          volume: 0.34, position: passPoint, ref: 26, maxDist: 240, rolloff: 0.85,
        });
      } else {
        audio?.play('street.car.pass.wet', {
          volume: 0.38, position: passPoint, ref: 26, maxDist: 240, rolloff: 0.85,
        });
      }
      return passPoint;
    },

    distantHorn() {
      horns++;
      passPoint.set(rnd() < 0.5 ? -140 : 150, 3, rnd() * 90 - 45);
      audio?.play('street.horn.distant', {
        volume: 0.3, position: passPoint, ref: 40, maxDist: 320, rolloff: 0.8,
      });
      return passPoint;
    },

    /** Counters, for the tests and for a soak run. */
    get counts() { return { passes, horns }; },

    /**
     * @param {number} dt
     * @param {THREE.Vector3|null} sedanPosition where the car is, if it exists
     */
    update(dt, sedanPosition = null) {
      if (!running) return;
      nextPass -= dt;
      if (nextPass <= 0) {
        nextPass = gap(PASS_GAP);
        ambience.passingCar();
      }
      nextHorn -= dt;
      if (nextHorn <= 0) {
        nextHorn = gap(HORN_GAP);
        ambience.distantHorn();
      }
      if (sedanPosition) ambience.followSedan(sedanPosition);
    },
  };

  return ambience;
}

/* ------------------------------------------------------------------ */
/* Asked for, not minted                                              */
/* ------------------------------------------------------------------ */
/**
 * Two cues this scene would use if assets/sfx/manifest.json were in scope for
 * this pass, reported rather than added:
 *
 *   `car.door.open`   — a heavy sedan door OPENED from outside, hinge and
 *                       latch, no slam. Every door in this scene is opened
 *                       before it is shut, and `car.door` is only the shut.
 *   `car.trunk.open`  — a boot lid released and lifted on tired torsion bars.
 *                       The reveal at the end of the arrival is this sound and
 *                       then a man's voice, and right now it is the second
 *                       half only.
 *
 * Both are exterior, wet street, night. Neither blocks the scene: the beat
 * plays without them.
 */
export const REQUESTED_CUES = Object.freeze([
  Object.freeze({
    name: 'car.door.open',
    duration: 1.1,
    prompt: 'a heavy sedan door opened from outside on a wet street at night, '
      + 'latch, hinge creak, no slam, close exterior, no music, no voice',
  }),
  Object.freeze({
    name: 'car.trunk.open',
    duration: 1.6,
    prompt: 'the boot lid of an old american sedan released and lifted, latch pop, '
      + 'tired torsion bars, faint rattle, close exterior night, no music, no voice',
  }),
]);
