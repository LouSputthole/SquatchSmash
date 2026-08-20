/**
 * INITIATION NIGHT — what the woods and the cabin sound like.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * EVERY CUE NAMED HERE ALREADY EXISTS IN assets/sfx/manifest.json
 *
 * Nothing is minted, deliberately: this pass does not own the manifest, and a
 * scene that names a cue nobody has recorded is a scene that plays silence and
 * tells no one. The three beds this place actually wants — wind in branches, a
 * stove, and the music from inside — are NOT in the manifest, and they are
 * written out at the bottom of this file as a request rather than guessed at.
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

import {
  CABIN, CABIN_DOOR, CLEARING, MUD, PORCH, ROOM, SPEAKERS, TRACK, TRAIL,
  TRACK_HALF_WIDTH, TRAIL_HALF_WIDTH, distanceToPath,
} from './site.js';

/** Every cue this module can play. Read by the tests; not by the code. */
export const AMBIENCE_CUES = Object.freeze([
  'footstep.leaves',
  'footstep.gravel',
  'footstep.dirt',
  'footstep.wood',
  'door.creak',
  'car.engine.idle',
  'car.door.close.heavy',
]);

/** Loop keys, so a scene teardown can stop them without knowing the cues. */
export const AMBIENCE_LOOPS = Object.freeze(['initiation.car.west', 'initiation.car.east']);

/**
 * The mix for a spoken line in this scene.
 *
 * `ref` 2.2 keeps a man at conversational distance at full level; `maxDist` 30
 * covers the whole clearing plus the far end of the trail; `rolloff` 0.7 is
 * half the engine default, because the alternative is a ceremony nobody can
 * hear the far half of.
 */
export const DIALOGUE_MIX = Object.freeze({ ref: 2.2, maxDist: 30, rolloff: 0.7 });

/**
 * Play a spoken line from a MOVING speaker.
 *
 * `speaker` is whatever has a world position — a `Person`'s `group`, a rig, a
 * vector, or a function returning one. It is REQUIRED: a line with no speaker
 * is either a narrator or a bug, and this scene has no narrator.
 */
export function sayFrom(audio, cue, speaker, options = {}) {
  if (!audio || !speaker) return false;
  audio.play(cue, { ...DIALOGUE_MIX, ...options, follow: speaker });
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
 * he has arrived somewhere: leaves under the trees, dirt on the track, wet
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
  return 'leaves';
}

/**
 * One footstep, on the right surface, from where the foot is.
 *
 * Positional rather than flat: a step is the one sound in this scene whose
 * whole job is telling the player where his own body is, and a flat one makes
 * a first-person walk feel like a slideshow with a soundtrack.
 */
export function playFootstep(audio, x, z, { volume = 0.5 } = {}) {
  if (!audio) return null;
  const surface = footingAt(x, z);
  const position = { x, y: 0.1, z };
  const options = { volume, position, ref: 1.1, maxDist: 12, rolloff: 1.1 };
  if (surface === 'wood') audio.play('footstep.wood', options);
  else if (surface === 'gravel') audio.play('footstep.gravel', options);
  else if (surface === 'dirt') audio.play('footstep.dirt', options);
  else audio.play('footstep.leaves', options);
  return surface;
}

/* ------------------------------------------------------------------ */
/* The beds                                                            */
/* ------------------------------------------------------------------ */

/**
 * What is running while the player is out here.
 *
 * Two engines, idling, from the two cars with their lights on — which is the
 * only ambience this scene can honestly have today, and it is not nothing:
 * a clearing with two engines running in it is a clearing nobody is planning
 * to stay in.
 *
 * `audio` may be null (headless, or a scene with the sound off); every method
 * is then a no-op and the scene still runs.
 */
export function createCabinAmbience({ audio = null } = {}) {
  let running = false;
  let doorPlayed = false;

  return {
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
    },

    /** The engines are killed when the walk up the trail starts. */
    hushClearing() {
      for (const key of AMBIENCE_LOOPS) audio?.stopLoop?.(key, { fade: 3.5 });
    },

    /** The cabin door, once, as he is brought in. */
    openDoor() {
      if (doorPlayed) return;
      doorPlayed = true;
      audio?.play?.('door.creak', {
        volume: 0.6,
        position: { x: CABIN_DOOR.x, y: 1.4, z: CABIN_DOOR.z },
        ref: 2, maxDist: 20, rolloff: 0.9,
      });
    },

    stop() {
      running = false;
      for (const key of AMBIENCE_LOOPS) audio?.stopLoop?.(key, { fade: 1.2 });
    },
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * WHAT THIS SCENE NEEDS RECORDED, AND CANNOT ASK FOR ITSELF
 *
 * Three beds, none of which exist in the manifest today. Every one of them is
 * in the owner's own description of the night, so they are not decoration:
 *
 *   initiation.forest.wind    — wind in high branches, no leaves, no birds.
 *                               Loop, 30 s+. The whole approach is silent
 *                               without it, and silence reads as a bug.
 *   initiation.cabin.music    — slow, heavy, old, traditional, played on
 *                               something with strings. Heard THROUGH a wall
 *                               from the yard and properly from inside, so it
 *                               wants a muffled variant or the engine's
 *                               `muffle` option pointed at it.
 *   initiation.stove.fire     — a closed wood stove: no crackle-and-pop, a low
 *                               roar with the odd shift of a log.
 *
 * The scene plays them the moment they exist: anchors are already in
 * site.js's SPEAKERS (`cabinMusic`, `stove`) and the clearing's own
 * `burnBarrel`.
 * ═══════════════════════════════════════════════════════════════════════
 */
