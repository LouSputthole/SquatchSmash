/**
 * The Special Meeting forest headlight policy.
 *
 * Both the production block sedan adapter and the forest-only fallback car
 * illuminate the same road. Keeping their photometry here prevents the live
 * car and the verifier/fallback car from drifting into two different nights.
 */
export const FOREST_HEADLIGHT_DECAY = 1.8;

export const FOREST_HEADLIGHT_PROFILES = Object.freeze({
  dipped: Object.freeze({
    intensity: 1200,
    distance: 70,
    angle: 0.32,
    aim: Object.freeze({ ahead: 55, drop: 1.9, out: 2.6 }),
    beam: 27,
  }),
  main: Object.freeze({
    intensity: 1800,
    distance: 96,
    angle: 0.24,
    aim: Object.freeze({ ahead: 90, drop: 2.2, out: 1.4 }),
    beam: 40,
  }),
});

export const FOREST_HEADLIGHT_BEAM_OPACITY = 0.06;
