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
  'hotdog.fist.impact.4',
  /* The stabbing layer (2026-08-19 owner note: "I want flesh stabbing sound
   * effect and all the proper sound effects"). Played per strike ON TOP of
   * the recorded fist thuds above, so the beat keeps its landed body weight
   * while these are still being recorded — hotdog-main.js gates each one on
   * `hasSample`, the same contract License to Grill's PENDING cues keep. */
  'hotdog.stab.flesh.1',
  'hotdog.stab.flesh.2',
  'hotdog.stab.flesh.3',
  'hotdog.stab.flesh.4',
  'hotdog.stab.cloth.tear',
  /* HotDog going quiet, one grunt per strike in HIS voice — loud on the
   * first, barely a wheeze by the fourth. Named `hotdog.*` rather than
   * `vo.bing2.*` deliberately: tools/hotdog-vo.mjs owns that whole prefix
   * and rewrites it from the dialogue catalog, and a grunt is a performance
   * note, not a line anybody can put in a tree. */
  'hotdog.stab.grunt.1',
  'hotdog.stab.grunt.2',
  'hotdog.stab.grunt.3',
  'hotdog.stab.grunt.4',
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
