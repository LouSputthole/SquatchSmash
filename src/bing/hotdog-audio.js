/** Recorded one-shots and beds requested directly by the HotDog runtime. */
export const HOTDOG_AUDIO_CUE_NAMES = Object.freeze([
  'ambience.crowd',
  'ambience.rain',
  'car.door.close.heavy',
  'cloth.snap',
  'cloth.suit.movement',
  'door.creak',
  'door.knob',
  'door.locked',
  'glass.set',
  'glass.wine.fall',
  'hotdog.knife.draw',
  'hotdog.fist.impact.1',
  'hotdog.fist.impact.2',
  'hotdog.fist.impact.3',
  'hotdog.body.floor',
  'switch.click',
]);

/** Dialogue and walking surfaces owned by the closed-party page. */
export const HOTDOG_AUDIO_PREFIXES = Object.freeze([
  'vo.bing2.',
  'footstep.',
]);

const HOTDOG_AUDIO_CUE_SET = new Set(HOTDOG_AUDIO_CUE_NAMES);

export function isHotDogAudioPreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return !!name && (
    HOTDOG_AUDIO_CUE_SET.has(name)
    || HOTDOG_AUDIO_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/** Fresh arrays keep AudioEngine's load options private to one request. */
export function hotDogAudioLoadOptions() {
  return {
    names: [...HOTDOG_AUDIO_CUE_NAMES],
    prefixes: [...HOTDOG_AUDIO_PREFIXES],
  };
}
