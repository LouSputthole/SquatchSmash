/** Recorded one-shots and beds requested directly by the NO WAKE runtime. */
export const NO_WAKE_AUDIO_CUE_NAMES = Object.freeze([
  'ambience.harbor',
  'seagull.distant',
  'boat.hull.creak',
  'bird',
  'cloth.suit.movement',
  'drunk.collapse',
  'gun.shot',
  'pc.fan',
  'switch.click',
  'water.splash',
]);

/** Dialogue, boat systems, and walking surfaces owned by the NO WAKE page. */
export const NO_WAKE_AUDIO_PREFIXES = Object.freeze([
  'vo.nowake.',
  'boat.',
  'footstep.',
]);

const NO_WAKE_AUDIO_CUE_SET = new Set(NO_WAKE_AUDIO_CUE_NAMES);

export function isNoWakeAudioPreloadCue(cue, radioCueNames = []) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  if (!name) return false;
  return new Set(radioCueNames).has(name)
    || NO_WAKE_AUDIO_CUE_SET.has(name)
    || NO_WAKE_AUDIO_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Keep the radio's bounded, read-only preload plan intact while adding only
 * sounds owned by this scene. Fresh arrays make the request safe to mutate.
 */
export function noWakeAudioLoadOptions(radioCueNames = []) {
  return {
    names: [...new Set([...radioCueNames, ...NO_WAKE_AUDIO_CUE_NAMES])],
    prefixes: [...NO_WAKE_AUDIO_PREFIXES],
  };
}
