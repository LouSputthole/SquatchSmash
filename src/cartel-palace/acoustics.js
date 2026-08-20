/**
 * Room-aware acoustics for Mark's estate.
 *
 * The Palace used to run its whole soundscape on one global rain loop at one
 * volume: full outdoor rain in the dining room, and nothing under any
 * interior at all. This module gives the estate the Mansion/Bing shape — a
 * SMALL NUMBER OF ALWAYS-RUNNING LOOPS WITH VOLUME AUTOMATION, never
 * started or stopped on a room change (that clicks; see AudioEngine's own
 * `_rampParam` note about the closed party) — and a cheap room-at test the
 * automation and anything else can share.
 *
 * Three loops, started once at boot and left running for the night:
 *
 *   palace-night     `ambience.rain` — the storm. Outdoors it is the whole
 *                    mix; inside it ducks by room depth and its lowpass
 *                    closes, so the foyer hears rain against the facade
 *                    windows and the gallery barely knows the weather.
 *   palace-interior  `ambience.palace.interior` — the interior bed: plant
 *                    hum and pressurised quiet, the sound of the house
 *                    itself. Zero outdoors, fullest in the service halls.
 *   palace-dining    `ambience.palace.dining` — the dining tone: candle-lit
 *                    stillness with the long table's own presence, a
 *                    different sound from the halls so the last room reads
 *                    as an arrival. Bleeds faintly into the gallery,
 *                    which is the corridor outside its doors.
 *
 * Every transition is a crossfade through `setLoopVolume`/`setLoopCutoff`,
 * whose `_rampParam` anchors each ramp at the param's current value and
 * discards queued automation — so gains move monotonically toward the new
 * room and can never overshoot off a stale ramp. The in-memory death retry
 * calls `refresh()` (see main.js `retryFromCheckpoint`): `ensure()` is
 * idempotent per key, and the gains are re-asserted from the restored room
 * with a short ramp rather than replayed as a transition.
 */

/**
 * The estate's acoustic rooms, coarse on purpose: the interior runs from
 * the facade at z = 12 to the rear wall at z = -50 (see ./world.js), about
 * eighteen metres either side of the axis, and depth increases down the
 * long dining axis. Position-only — a cheap test the render loop can call
 * every frame — and each room is a frozen singleton so `roomAt` allocates
 * nothing and callers can compare by identity.
 */
export const PALACE_ROOMS = Object.freeze({
  /** The approach, the courtyard, the pool terrace, the rear terrace. */
  exterior: Object.freeze({
    id: 'exterior', depth: 0, rain: 1, rainCutoff: 20000, interior: 0, dining: 0,
  }),
  /** The service wing's first rooms, against the facade windows. */
  foyer: Object.freeze({
    id: 'foyer', depth: 1, rain: 0.6, rainCutoff: 3200, interior: 0.45, dining: 0,
  }),
  /** The evidence rooms and service halls, one wall further in. */
  halls: Object.freeze({
    id: 'halls', depth: 2, rain: 0.24, rainCutoff: 1400, interior: 1, dining: 0,
  }),
  /** The portrait gallery — deep interior, the dining doors at its end. */
  gallery: Object.freeze({
    id: 'gallery', depth: 3, rain: 0.11, rainCutoff: 800, interior: 0.8, dining: 0.3,
  }),
  /** Mark's table. The storm is a rumour; the room has its own tone. */
  dining: Object.freeze({
    id: 'dining', depth: 3, rain: 0.06, rainCutoff: 560, interior: 0.3, dining: 1,
  }),
});

/** Which acoustic room a world position is in. Never allocates. */
export function palaceRoomAt(position) {
  const x = position?.x ?? 0;
  const z = position?.z ?? 0;
  if (z > 12 || z < -50 || Math.abs(x) > 18) return PALACE_ROOMS.exterior;
  if (z > -2) return PALACE_ROOMS.foyer;
  if (z > -16) return PALACE_ROOMS.halls;
  if (z > -35) return PALACE_ROOMS.gallery;
  return PALACE_ROOMS.dining;
}

/** The three loops' mix keys and base (room-multiplied) levels. */
const LOOPS = Object.freeze([
  Object.freeze({
    key: 'palace-night', name: 'ambience.rain', base: 0.052, gainOf: (room) => room.rain,
  }),
  Object.freeze({
    key: 'palace-interior', name: 'ambience.palace.interior', base: 0.05, gainOf: (room) => room.interior,
  }),
  Object.freeze({
    key: 'palace-dining', name: 'ambience.palace.dining', base: 0.046, gainOf: (room) => room.dining,
  }),
]);

/** Room-transition crossfade, seconds. Long enough to read as walking
 * through a doorway, short enough that a sprint through the foyer still
 * tracks. */
const CROSSFADE = 1.1;

export function createPalaceAcoustics(audio) {
  let room = null;

  /* One ramp per loop per TRANSITION, not per frame: `update` compares the
   * room singleton by identity and returns without touching WebAudio on the
   * many frames where nobody crossed a doorway. */
  function apply(nextRoom, ramp) {
    room = nextRoom;
    for (const loop of LOOPS) {
      audio.setLoopVolume(loop.key, loop.base * loop.gainOf(nextRoom), ramp);
    }
    /* Distance takes the top off the storm as well as the level — the same
     * wall the mansion's suite puts between the player and the party. */
    audio.setLoopCutoff('palace-night', nextRoom.rainCutoff, ramp);
  }

  return {
    /**
     * Start the night's loops — idempotent per key, so a retry (or a second
     * click) never stacks a loop on itself — and assert the boot room's
     * gains. Each loop starts at its room level rather than at full and
     * ducking after; a player booting a mid-estate checkpoint hears the
     * room, not a correction.
     */
    start(position) {
      const bootRoom = palaceRoomAt(position);
      for (const loop of LOOPS) {
        audio.startLoop(loop.key, {
          name: loop.name,
          volume: loop.base * loop.gainOf(bootRoom),
          ambience: true,
          fade: 1.4,
        });
      }
      apply(bootRoom, 1.4);
    },

    /** Per-frame: crossfade the mix when — and only when — the room changed. */
    update(position) {
      const nextRoom = palaceRoomAt(position);
      if (nextRoom === room) return;
      apply(nextRoom, CROSSFADE);
    },

    /**
     * The retry path: re-assert every gain from the restored position with
     * a short ramp. The loops themselves keep running across the death and
     * the restore — only the automation is brought back in line, so a man
     * who died in the gallery and respawns on the approach gets outdoor
     * rain, not the gallery's hush.
     */
    refresh(position) {
      apply(palaceRoomAt(position), 0.08);
    },

    get room() { return room; },

    /** Plain numbers for the verifier and the console. */
    report() {
      return {
        room: room?.id ?? null,
        loops: LOOPS.map((loop) => ({
          key: loop.key,
          name: loop.name,
          gain: room ? +(loop.base * loop.gainOf(room)).toFixed(4) : null,
        })),
      };
    },
  };
}
