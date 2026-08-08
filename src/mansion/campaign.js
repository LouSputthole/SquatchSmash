export const MANSION_RETURN_REPORT = Object.freeze({
  wrongCityConfirmed: true,
  sauceMissingConfirmed: true,
  palaceLocationKnown: true,
});

export function mansionVisitMode(locationLike = globalThis.location) {
  try {
    return new URLSearchParams(locationLike?.search || '').get('visit') === 'return'
      ? 'return'
      : 'silent_squatch';
  } catch {
    return 'silent_squatch';
  }
}
