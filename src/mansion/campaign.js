export const MANSION_RETURN_REPORT = Object.freeze({
  wrongCityConfirmed: true,
  sauceMissingConfirmed: true,
  palaceLocationKnown: true,
});

/** Player-facing return objective, kept in lockstep with Lou's two labels.
 * Owner, 2026-09-09: "Leaving the mansion for the cartel siege it needs to
 * be clear to talk to Lou agian to leave." The completed line used to say
 * only where you were going, not that Lou himself is the way out — the
 * player stood in a house with no visible exit. */
export function mansionReturnObjective(status) {
  return status === 'complete'
    ? 'Talk to Lou again — he takes you to the Cartel Palace'
    : "Receive Lou's briefing";
}

export function mansionVisitMode(locationLike = globalThis.location) {
  try {
    return new URLSearchParams(locationLike?.search || '').get('visit') === 'return'
      ? 'return'
      : 'silent_squatch';
  } catch {
    return 'silent_squatch';
  }
}
