/**
 * INITIATION NIGHT — what the woods and the cabin sound like.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * EVERY CUE NAMED HERE ALREADY EXISTS IN assets/sfx/manifest.json
 *
 * Manifest cues are never invented here: a scene that names a cue nobody has
 * recorded is a scene that plays silence and tells no one. The cabin stereo is
 * different — it is a delivered long-form music asset, streamed through the
 * shared AudioEngine instead of decoded into the SFX bank.
 *
 * Cue names are spelled out at the call sites rather than looked up from a
 * table, because `tools/check.mjs` reads the call sites: a cue assembled out of
 * variables is a cue the build cannot see.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THE TWO RULES THAT MATTER MORE THAN THE CONTENT
 *
 * 1. ANYTHING SPOKEN BY SOMEBODY WALKING IS PLAYED WITH `follow`.
 *    `audio.play()` takes an Object3D, a vector or a getter and keeps the
 *    panner glued to it for the life of the clip. Without it the sound is
 *    pinned where the speaker's mouth was on the FIRST SYLLABLE — which for
 *    this scene means Booskibro's entire walk up the trail plays from the mud
 *    thirty metres behind the player.
 *
 * 2. DIALOGUE GETS A GENTLER ROLLOFF THAN EVERYTHING ELSE.
 *    The engine's default is 1.4, which is right for a bottle breaking and
 *    wrong for a man talking across a clearing: at the far kneel mark a line
 *    at 1.4 is inaudible. `DIALOGUE_MIX` is 0.7, and `sayFrom()` is the only
 *    correct way to play a spoken line in this scene.
 */

import { SPEECH_MIX, speak } from '../../core/dialogue.js';
import {
  CABIN, CABIN_DOOR, CLEARING, MUD, PORCH, ROOM, SPEAKERS, TRACK, TRAIL,
  TRACK_HALF_WIDTH, TRAIL_HALF_WIDTH, distanceToPath,
} from './site.js';

/** Every cue this module can play. Read by the tests; not by the code. */
export const AMBIENCE_CUES = Object.freeze([
  'footstep.leaves',
  'footstep.grass',
  'footstep.gravel',
  'footstep.dirt',
  'footstep.wood.a',
  'footstep.wood.b',
  'door.creak',
  'car.engine.idle',
  'car.door.close.heavy',
]);

/** Clearing loop keys, so the walk can kill both engines together. */
export const AMBIENCE_LOOPS = Object.freeze(['initiation.car.west', 'initiation.car.east']);

/** The delivered old-cabin stereo master and its one keyed playback handle. */
export const INITIATION_CABIN_MUSIC_KEY = 'initiation.cabin.music';
export const INITIATION_CABIN_MUSIC_SRC = 'assets/music/initiation-cabin-stereo.mp3';

const CABIN_MUSIC_MUFFLED_CUTOFF_HZ = 780;
const CABIN_MUSIC_OPEN_CUTOFF_HZ = 14_000;
const CABIN_MUSIC_OUTSIDE_VOLUME = 0.19;
const CABIN_MUSIC_INSIDE_VOLUME = 0.24;
const CABIN_MUSIC_OATH_FADE_S = 5;

/**
 * The mix for a spoken line in this scene.
 *
 * KEPT AS A RE-EXPORT, not as numbers. These were authored here and were the
 * only researched positional mix for speech in the game, which is why they are
 * now `SPEECH_MIX` in src/core/dialogue.js and every scene uses them. This
 * name stays so the scene's own modules and its tests keep reading, and points
 * at the shared value so there is exactly one set of numbers to change.
 */
export const DIALOGUE_MIX = SPEECH_MIX;

/**
 * Play a spoken line from a MOVING speaker.
 *
 * `speaker` is whatever has a world position — a `Person`'s `group`, a rig, a
 * vector, or a function returning one. It is REQUIRED: a line with no speaker
 * is either a narrator or a bug, and this scene has no narrator.
 *
 * A thin wrapper over the shared `speak()` now, kept for the callers in
 * `./index.js`'s public surface. New code should call `speak()` directly.
 */
export function sayFrom(audio, cue, speaker, options = {}) {
  if (!audio || !speaker) return false;
  speak(audio, cue, { ...options, speaker, mix: SPEECH_MIX });
  return true;
}

/* ------------------------------------------------------------------ */
/* Footing                                                             */
/* ------------------------------------------------------------------ */

/**
 * What the ground sounds like at a point.
 *
 * The owner's line for the approach is "boots on leaves and gravel", and the
 * change between them is the only thing on the walk in that tells the player
 * he has arrived somewhere: mixed forest floor under the trees, dirt on the track, wet
 * gravel in the clearing, and then boards, once, on the porch.
 */
export function footingAt(x, z) {
  if (x >= PORCH.minX && x <= PORCH.maxX && z >= PORCH.minZ && z <= PORCH.maxZ) return 'wood';
  if (x >= ROOM.minX && x <= ROOM.maxX && z >= ROOM.minZ && z <= ROOM.maxZ) return 'wood';
  if (x >= MUD.minX && x <= MUD.maxX && z >= MUD.minZ && z <= MUD.maxZ) return 'gravel';
  if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.radius) return 'gravel';
  if (distanceToPath(TRACK, { x, z }) < TRACK_HALF_WIDTH + 0.6) return 'dirt';
  if (distanceToPath(TRAIL, { x, z }) < TRAIL_HALF_WIDTH + 0.5) return 'dirt';
  if (Math.hypot(x - CABIN.x, z - CABIN.z) < 14) return 'dirt';
  return 'forest';
}

/**
 * One footstep, on the right surface, from where the foot is.
 *
 * Positional rather than flat: a step is the one sound in this scene whose
 * whole job is telling the player where his own body is, and a flat one makes
 * a first-person walk feel like a slideshow with a soundtrack.
 */
export function playFootstep(audio, x, z, { volume = 0.5, cadenceKey = 'player' } = {}) {
  if (!audio) return null;
  if (typeof audio.footstep !== 'function') {
    throw new TypeError('Initiation footsteps require the shared AudioEngine.footstep() path');
  }
  const surface = footingAt(x, z);
  const position = { x, y: 0.1, z };
  audio.footstep(surface, 1, {
    volume, position, ref: 1.1, maxDist: 12, rolloff: 1.1,
    cadenceKey, requiredRecorded: true,
  });
  return surface;
}

/* ------------------------------------------------------------------ */
/* The beds                                                            */
/* ------------------------------------------------------------------ */

/**
 * What is running while the player is out here.
 *
 * Two engines idle in the clearing. The cabin's old stereo also runs from a
 * fixed speaker inside the building: quiet and heavily low-passed through the
 * wall outside, then open when the door does. It is retired well before the
 * oath and cannot be restarted after that boundary.
 *
 * `audio` may be null (headless, or a scene with the sound off); every method
 * is then a no-op and the scene still runs.
 */
export function createCabinAmbience({ audio = null } = {}) {
  let running = false;
  let doorPlayed = false;
  let doorOpen = false;
  let musicState = 'idle';
  let musicHandle = null;
  let musicSilenceCommitted = false;

  function startCabinMusic() {
    if (musicSilenceCommitted || musicHandle || !audio?.startMusicLoop) return;
    musicHandle = audio.startMusicLoop(
      INITIATION_CABIN_MUSIC_KEY,
      INITIATION_CABIN_MUSIC_SRC,
      {
        bus: 'music',
        volume: doorOpen ? CABIN_MUSIC_INSIDE_VOLUME : CABIN_MUSIC_OUTSIDE_VOLUME,
        fade: 3,
        loop: true,
        position: SPEAKERS.cabinMusic,
        ref: 5,
        maxDist: 90,
      },
    ) ?? null;
    musicState = doorOpen ? 'open' : 'muffled';
    audio.setLoopCutoff?.(
      INITIATION_CABIN_MUSIC_KEY,
      doorOpen ? CABIN_MUSIC_OPEN_CUTOFF_HZ : CABIN_MUSIC_MUFFLED_CUTOFF_HZ,
      0,
    );
  }

  function openCabinMusic() {
    if (musicSilenceCommitted || musicState === 'idle') return;
    musicState = 'open';
    audio?.setLoopCutoff?.(INITIATION_CABIN_MUSIC_KEY, CABIN_MUSIC_OPEN_CUTOFF_HZ, 1.4);
    audio?.setLoopVolume?.(INITIATION_CABIN_MUSIC_KEY, CABIN_MUSIC_INSIDE_VOLUME, 1.4);
  }

  return {
    get music() {
      return Object.freeze({
        key: INITIATION_CABIN_MUSIC_KEY,
        source: INITIATION_CABIN_MUSIC_SRC,
        state: musicState,
        silenceCommitted: musicSilenceCommitted,
        handleStarted: musicHandle !== null,
      });
    },

    /** Cars idling. Idempotent — `startLoop` is keyed. */
    start() {
      if (running) return;
      running = true;
      audio?.startLoop?.('initiation.car.west', {
        name: 'car.engine.idle', volume: 0.16, position: SPEAKERS.clearingWest,
        ref: 5, maxDist: 34, rolloff: 0.9, fade: 2.2,
      });
      audio?.startLoop?.('initiation.car.east', {
        name: 'car.engine.idle', volume: 0.14, position: SPEAKERS.clearingEast,
        ref: 5, maxDist: 34, rolloff: 0.9, fade: 2.2,
      });
      startCabinMusic();
    },

    /** The engines are killed when the walk up the trail starts. */
    hushClearing() {
      for (const key of AMBIENCE_LOOPS) audio?.stopLoop?.(key, 3.5);
    },

    /** The cabin door, once, as he is brought in. */
    openDoor() {
      doorOpen = true;
      openCabinMusic();
      if (!doorPlayed) {
        doorPlayed = true;
        audio?.play?.('door.creak', {
          volume: 0.6,
          position: { x: CABIN_DOOR.x, y: 1.4, z: CABIN_DOOR.z },
          ref: 2, maxDist: 20, rolloff: 0.9,
        });
      }
    },

    /** Begin the long fade while the final pre-oath lines are still playing. */
    fadeForOath() {
      if (musicSilenceCommitted) return;
      musicSilenceCommitted = true;
      musicState = running ? 'fading' : 'silent';
      musicHandle = null;
      audio?.stopLoop?.(INITIATION_CABIN_MUSIC_KEY, CABIN_MUSIC_OATH_FADE_S);
    },

    stop() {
      running = false;
      /* A NUMBER, not an options object. `stopLoop(key, fade = 0.5)` takes
       * seconds, so `{ fade: 1.2 }` made `t + fade` NaN and the fade-out threw
       * every time the cabin ambience stopped. Nothing caught it because
       * nothing had ever played this part of the scene. */
      for (const key of AMBIENCE_LOOPS) audio?.stopLoop?.(key, 1.2);
      if (!musicSilenceCommitted) {
        audio?.stopLoop?.(INITIATION_CABIN_MUSIC_KEY, 1.2);
      }
      musicHandle = null;
      musicSilenceCommitted = true;
      musicState = 'silent';
    },
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS SCENE NEEDS RECORDED, AND CANNOT ASK FOR ITSELF
 *
 * Two beds, neither of which exists in the manifest today. Both are in the
 * owner's own description of the night, so they are not decoration:
 *
 *   initiation.forest.wind    — wind in high branches, no leaves, no birds.
 *                               Loop, 30 s+. The whole approach is silent
 *                               without it, and silence reads as a bug.
 *   initiation.stove.fire     — a closed wood stove: no crackle-and-pop, a low
 *                               roar with the odd shift of a log.
 *
 * Their anchors already exist in site.js's SPEAKERS (`stove`) and the
 * clearing's own `burnBarrel`. The delivered cabin music above already uses
 * SPEAKERS.cabinMusic.
 * ═══════════════════════════════════════════════════════════════════════
 */
