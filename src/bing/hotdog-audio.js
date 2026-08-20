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
  /* SYNCED TO THE ANIMATION, not played beside it (owner, 2026-08-19: "sync
   * the effects to the animation"). `hotdog-attack.js` publishes its own beat
   * table -- HOTDOG_ATTACK_BEATS -- and each of these hangs off one frame of
   * it: `cock` when the knife arm starts up over the shoulder, `withdraw`
   * when the blade starts coming back out of him. Four takes each, one per
   * strike, because the fourth is not the first done again. */
  'hotdog.stab.swing.1',
  'hotdog.stab.swing.2',
  'hotdog.stab.swing.3',
  'hotdog.stab.swing.4',
  'hotdog.stab.withdraw.1',
  'hotdog.stab.withdraw.2',
  'hotdog.stab.withdraw.3',
  'hotdog.stab.withdraw.4',
  /* Ape doing the work. A man driving a blade into somebody four times makes
   * noise, and none of it is dialogue -- it is breath and effort, so it is an
   * effect and not a `vo.bing2.*` line anybody can put in a tree. */
  'hotdog.ape.effort.1',
  'hotdog.ape.effort.2',
  'hotdog.ape.effort.3',
  'hotdog.ape.effort.4',
  /* The two of them fighting each other, under everything else: the lapel
   * grabbed on the first beat, and shoes going out from under a man on bar
   * boards for as long as he can still stand up. */
  'hotdog.grapple.lapel',
  'hotdog.struggle.scuffle',
  'hotdog.stool.knock',
  /* Going down: knees first, then the whole of him, then what is left of his
   * breathing. `hotdog.body.floor` is the existing floor hit and stays. */
  'hotdog.body.knees',
  'hotdog.body.wet.breath',
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
  /* Booski's shot, at the party. The same beat the ordinary night runs
   * (src/bing/booski-shot.js), so the same already-recorded bank: the cap,
   * the pour, the swig, and Booski's own two takes either side of it. Nothing
   * new was written for it. */
  'whiskey.cap',
  'whiskey.pour',
  'whiskey.swig',
  'vo.bing.bartender.booski-shot.pour',
  'vo.bing.booski.shot.handoff',
  'vo.bing.booski.shot.after',
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
