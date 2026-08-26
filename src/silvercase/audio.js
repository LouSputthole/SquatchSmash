/**
 * The Silver Case's own audio selector.
 *
 * `main.js` already called `audio.loadManifest({ names: [...] })` with an
 * explicit list rather than the bare `audio.init()` the mission shipped with
 * (see that fix's own comment, still in `main.js`, about sixty recorded takes
 * nobody could reach) — so this mission never decoded the *entire* shared
 * bank the way HotDog/Graveyard/NO WAKE did before their own passes. What it
 * did not have was a NAMED, EXPORTED selector: the effect cues lived as a
 * literal array inline in `beginScene()`, `isSilverCasePreloadCue` did not
 * exist anywhere a verify script could import and check against, and nothing
 * proved the two lists — dialogue's `silverCaseCueNames()` and this mission's
 * own handful of effects — together cover every `audio.play()` call in the
 * file. This module gives that selector a name and a residency contract,
 * on the same shape as `src/nowake/audio.js`'s `isNoWakeAudioPreloadCue` /
 * `noWakeAudioLoadOptions` and `src/enolasquatch/audio.js`'s
 * `isEnolaPreloadCue`, so `tools/verify-silvercase.mjs` can assert the
 * resident set is exactly this mission's cues — no more, no less — against
 * the shared 3,619-cue manifest.
 */
import { silverCaseCueNames } from './dialogue/script.js';

/**
 * Recorded one-shots this mission's own code calls by name, outside the
 * `vo.silvercase.*` spoken lines `DialogueController` drives through
 * `silverCaseCueNames()`. Walk every `audio.play(...)` call in `main.js` and
 * this is the complete list — a name added there and not here is a name that
 * plays synthesised instead of recorded, silently.
 */
export const SILVERCASE_EFFECT_CUES = Object.freeze([
  'door.creak',
  'door.locked',
  'door.knob',
  'gun.shot',
  'gun.impact',
  'gun.pickup',
  'heist.shubes_case',
  'heist.player.hit',
  'ui.select',
  'woo.streak',
  'car.engine.idle',
  'car.engine.rev',
  'car.door.close.heavy',
  'gun.drop.wood',
  'footstep.tile',
  'footstep.wood.a',
  'footstep.wood.b',
  'clock.tick',
]);

const SILVERCASE_EFFECT_SET = new Set(SILVERCASE_EFFECT_CUES);

/** Every recorded cue name The Silver Case's own runtime can ask for. */
export function isSilverCasePreloadCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  if (!name) return false;
  return name.startsWith('vo.silvercase.') || SILVERCASE_EFFECT_SET.has(name);
}

/**
 * Bounded selector for `AudioEngine.loadManifest`: this mission's own
 * dialogue cues plus its effects, nothing else. Fresh array each call so the
 * caller can freely mutate what it gets back.
 */
export function silverCaseAudioLoadOptions() {
  return { names: [...new Set([...silverCaseCueNames(), ...SILVERCASE_EFFECT_CUES])] };
}
