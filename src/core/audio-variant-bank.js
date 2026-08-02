/**
 * Pick from a cue bank without choosing the take that just played when there
 * is any alternative. `random` is injectable so scene tests stay deterministic.
 */
export function chooseNoImmediateRepeat(cues, previous = null, random = Math.random) {
  const unique = [...new Set((cues || []).filter(Boolean))];
  if (!unique.length) return null;
  const choices = unique.length > 1 ? unique.filter((cue) => cue !== previous) : unique;
  const unit = Math.max(0, Math.min(0.999999, Number(random()) || 0));
  return choices[Math.floor(unit * choices.length)];
}
