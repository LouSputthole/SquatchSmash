/** Recorded one-shots and beds requested directly by the Graveyard runtime. */
export const GRAVEYARD_AUDIO_CUE_NAMES = Object.freeze([
  'ambience.rain',
  'car.engine.idle',
  'car.engine.start',
  'car.impact.metal',
  'cloth.suit.movement',
  'pee.miss',
  'pee.stream',
  'pee.zip',
]);

/** Dialogue and walking surfaces owned by the Graveyard page. */
export const GRAVEYARD_AUDIO_PREFIXES = Object.freeze([
  'vo.graveyard.',
  'footstep.',
]);

const GRAVEYARD_AUDIO_CUE_SET = new Set(GRAVEYARD_AUDIO_CUE_NAMES);

export function isGraveyardAudioPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    GRAVEYARD_AUDIO_CUE_SET.has(name)
    || GRAVEYARD_AUDIO_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/** Fresh arrays keep AudioEngine's load options private to one request. */
export function graveyardAudioLoadOptions() {
  return {
    names: [...GRAVEYARD_AUDIO_CUE_NAMES],
    prefixes: [...GRAVEYARD_AUDIO_PREFIXES],
  };
}
