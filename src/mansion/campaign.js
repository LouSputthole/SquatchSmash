export const MANSION_RETURN_REPORT = Object.freeze({
  wrongCityConfirmed: true,
  sauceMissingConfirmed: true,
  palaceLocationKnown: true,
});

/** Player-facing return objective, kept in lockstep with Lou's two labels. */
export function mansionReturnObjective(status) {
  return status === 'complete'
    ? 'Leave for the Cartel Palace'
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
