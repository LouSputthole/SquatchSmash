/**
 * Mansion furniture foley.
 *
 * The composition root supplies its scene-local AudioEngine. Keeping these
 * tiny event adapters outside main.js makes the six late-scene placements
 * observable without constructing a renderer or borrowing a global engine.
 */
export const MANSION_INTERACTION_CUE_NAMES = Object.freeze([
  'chair.sit',
  'chair.scrape.wood',
  'bed.rustle',
  'bed.creak',
]);

/** Keep the page alive long enough for both scheduled bed beats to speak. */
export const GUEST_SLEEP_AUDIO_SECONDS = 0.46;

function at(position) {
  return position ? { position } : {};
}

export function playTheatreSit(audio, position = null) {
  return audio?.play?.('chair.sit', {
    volume: 0.58,
    delay: 0.12,
    ...at(position),
  }) ?? null;
}

export function playTheatreStand(audio, position = null) {
  return audio?.play?.('chair.scrape.wood', {
    volume: 0.54,
    rate: 0.96,
    ...at(position),
  }) ?? null;
}

export function playGuestBedSleep(audio, position = null) {
  audio?.play?.('bed.rustle', {
    volume: 0.62,
    ...at(position),
  });
  audio?.play?.('bed.creak', {
    volume: 0.68,
    delay: 0.18,
    ...at(position),
  });
  return GUEST_SLEEP_AUDIO_SECONDS;
}
