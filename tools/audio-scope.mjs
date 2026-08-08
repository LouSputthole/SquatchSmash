/**
 * Authored Initiation party/ambient dialogue that is not instantiated by the
 * current playable ceremony. Production tools exclude it by default so their
 * live coverage denominators and generation runs describe the same game.
 */
export function isFutureInitiationCue(cue) {
  const name = typeof cue === 'string' ? cue : cue?.name;
  return typeof name === 'string'
    && (name.startsWith('vo.initiation.party.')
      || name.startsWith('vo.initiation.ambient.'));
}
