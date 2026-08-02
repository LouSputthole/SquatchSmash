/**
 * Silver Pines Golf Club — course metadata and the shared surface model.
 *
 * The round is three holes and always has been: a par 3, a par 5, a par 4, in
 * that order, and all three are built. `playable` says whether a layout exists
 * for a hole; `builtHoles()` in hole.js is what the round actually walks. The
 * two agreeing is what the test suite checks — a hole that claims to be
 * playable with no layout behind it would strand a round on its own tee.
 *
 * Everything in here is data. No Three.js, no DOM, so the node tests can read
 * the same numbers the scene does.
 */

import { CHARACTER_IDS } from '../core/campaign.js';
import { getCharacter } from '../core/characters.js';

export const CLUB_NAME = 'SILVER PINES GOLF CLUB';
export const CLUB_LOCATION = 'North Jersey';

/* Yards are what the marker says and what the golfers say. Metres are what the
 * world is built in. Nothing should ever be ambiguous about which it is. */
export const YARD = 0.9144;
export const toYards = (m) => m / YARD;
export const toMetres = (y) => y * YARD;
export const toFeet = (m) => m / 0.3048;

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

/**
 * Every point on the course resolves to exactly one of these. Ball physics,
 * swing power, the lie readout and footstep audio all key off the same enum,
 * so there is one answer to "what is he standing on" and not four.
 */
export const SURFACE = {
  TEE: 'tee',
  FAIRWAY: 'fairway',
  ROUGH: 'rough',
  DEEP_ROUGH: 'deep_rough',
  BUNKER: 'bunker',
  FRINGE: 'fringe',
  GREEN: 'green',
  WATER: 'water',
  PATH: 'path',
};

/**
 * How each surface behaves.
 *
 *   restitution  vertical bounce retained on impact
 *   tangent      horizontal speed retained on impact
 *   roll         rolling deceleration, m/s²
 *   power        fraction of clubhead energy that survives the lie
 *   spread       extra azimuth dispersion, degrees
 *   launch       degrees added to launch angle (long grass and sand pop it up)
 *   step         footstep cue name
 */
export const SURFACE_PROPS = Object.freeze({
  [SURFACE.TEE]: Object.freeze({
    label: 'Tee', restitution: 0.34, tangent: 0.62, roll: 1.5,
    power: 1.0, spread: 0, launch: 0, step: 'grass', colour: 0x5c9b46,
  }),
  [SURFACE.FAIRWAY]: Object.freeze({
    label: 'Fairway', restitution: 0.34, tangent: 0.62, roll: 1.5,
    power: 0.95, spread: 0.5, launch: 0, step: 'grass', colour: 0x4e8c3e,
  }),
  [SURFACE.ROUGH]: Object.freeze({
    label: 'Rough', restitution: 0.17, tangent: 0.30, roll: 4.6,
    power: 0.82, spread: 3.2, launch: 2, step: 'grass', colour: 0x2e5a28,
  }),
  [SURFACE.DEEP_ROUGH]: Object.freeze({
    label: 'Heavy rough', restitution: 0.12, tangent: 0.22, roll: 6.4,
    power: 0.72, spread: 5.0, launch: 3, step: 'grass', colour: 0x1f4019,
  }),
  [SURFACE.BUNKER]: Object.freeze({
    label: 'Bunker', restitution: 0.05, tangent: 0.10, roll: 9.5,
    power: 0.63, spread: 2.4, launch: 8, step: 'sand', colour: 0xe9dcb2,
  }),
  [SURFACE.FRINGE]: Object.freeze({
    label: 'Fringe', restitution: 0.24, tangent: 0.48, roll: 2.4,
    power: 0.92, spread: 1.0, launch: 1, step: 'grass', colour: 0x62a54a,
  }),
  [SURFACE.GREEN]: Object.freeze({
    label: 'Green', restitution: 0.26, tangent: 0.52, roll: 0.62,
    power: 0.97, spread: 0.4, launch: 0, step: 'grass', colour: 0x7cbb5d,
  }),
  [SURFACE.WATER]: Object.freeze({
    label: 'Water', restitution: 0, tangent: 0, roll: 40,
    power: 0.4, spread: 8, launch: 0, step: 'water', colour: 0x2b6d9e,
  }),
  [SURFACE.PATH]: Object.freeze({
    label: 'Cart path', restitution: 0.55, tangent: 0.80, roll: 0.9,
    power: 0.88, spread: 2.0, launch: 0, step: 'gravel', colour: 0x9c9486,
  }),
});

export function surfaceProps(surface) {
  return SURFACE_PROPS[surface] || SURFACE_PROPS[SURFACE.ROUGH];
}

/** True where a putter is the sensible club and an iron is a decision. */
export function isPuttingSurface(surface) {
  return surface === SURFACE.GREEN || surface === SURFACE.FRINGE;
}

/* ------------------------------------------------------------------ */
/* The round                                                           */
/* ------------------------------------------------------------------ */

export const HOLES = Object.freeze([
  Object.freeze({
    number: 1,
    name: 'The Invitation',
    par: 3,
    yards: 167,
    playable: true,
    blurb: 'Elevated tee. Water front-right, bunker front-left.',
    /* What the hole is for, which is not the same as what it is. */
    purpose: 'Irons, putting, and finding out why he was asked.',
  }),
  Object.freeze({
    number: 2,
    name: 'The Long Walk',
    par: 5,
    yards: 520,
    playable: true,
    blurb: 'Wide off the tee, then it narrows. Dogleg round the pines.',
    purpose: 'The driver, properly, and long enough to talk.',
  }),
  Object.freeze({
    number: 3,
    name: 'The Big Night',
    par: 4,
    yards: 395,
    playable: true,
    blurb: 'Clubhouse behind the green. Last chance to say it out loud.',
    purpose: 'Finish the round and finish the conversation.',
  }),
]);

export const COURSE_PAR = HOLES.reduce((n, h) => n + h.par, 0);
export const COURSE_YARDS = HOLES.reduce((n, h) => n + h.yards, 0);

export function getHole(number) {
  return HOLES.find((h) => h.number === number) ?? null;
}

export function nextHole(number) {
  return getHole(number + 1);
}

export function playableHoles() {
  return HOLES.filter((h) => h.playable);
}

/* ------------------------------------------------------------------ */
/* The foursome                                                        */
/* ------------------------------------------------------------------ */

/**
 * Who is playing, by campaign id. Display names come from the character
 * registry so the scorecard and the subtitles cannot disagree with the phone.
 *
 * `card` is the three-letter column head, which is the one piece of naming a
 * scorecard is allowed to invent.
 */
function golfer(id, card, extra) {
  const who = getCharacter(id);
  if (!who) throw new Error(`Silver Pines: unknown character "${id}"`);
  return Object.freeze({
    id,
    name: who.subtitleName,
    full: who.canonicalName,
    voice: who.voiceProfile,
    card,
    ...extra,
  });
}

export const FOURSOME = Object.freeze([
  golfer(CHARACTER_IDS.LOU, 'LOU', {
    /* Lou does not take a practice swing and does not watch the ball land. */
    tempo: 0.86, practiceSwings: 0, watchesBall: 0.35,
  }),
  golfer(CHARACTER_IDS.RIPPINFLOW, 'RIP', {
    /* Too many practice swings, and he holds the follow-through long enough
     * to make it everybody else's problem. */
    tempo: 1.22, practiceSwings: 3, watchesBall: 1.0,
  }),
  golfer(CHARACTER_IDS.ERIC, 'ERI', {
    tempo: 1.0, practiceSwings: 1, watchesBall: 0.55,
  }),
  golfer(CHARACTER_IDS.PROSPECT, 'YOU', {
    tempo: 1.0, practiceSwings: 0, watchesBall: 1.0,
  }),
]);

export const FOURSOME_BY_ID = Object.freeze(
  Object.fromEntries(FOURSOME.map((g) => [g.id, g])),
);

/** Order of play on the first tee. The Prospect always hits last. */
export const TEE_ORDER = Object.freeze([
  CHARACTER_IDS.ERIC,
  CHARACTER_IDS.RIPPINFLOW,
  CHARACTER_IDS.LOU,
  CHARACTER_IDS.PROSPECT,
]);

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export function scoreName(strokes, par) {
  if (strokes === 1) return 'ACE';
  const rel = strokes - par;
  if (rel <= -3) return 'ALBATROSS';
  if (rel === -2) return 'EAGLE';
  if (rel === -1) return 'BIRDIE';
  if (rel === 0) return 'PAR';
  if (rel === 1) return 'BOGEY';
  if (rel === 2) return 'DOUBLE BOGEY';
  if (rel === 3) return 'TRIPLE BOGEY';
  return `${rel} OVER`;
}

export function relativeLabel(toPar) {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/**
 * Which reaction the group has to a finished hole.
 *
 * Separate from `scoreName` because the writing groups scores differently from
 * golf: an ace is its own event, a triple and a nine are the same joke, and
 * "very high" is where Lou stops writing down the truth.
 */
export function scoreBand(strokes, par) {
  if (strokes === 1) return 'ace';
  const rel = strokes - par;
  if (rel < 0) return 'birdie';
  if (rel === 0) return 'par';
  if (rel === 1) return 'bogey';
  if (rel <= 3) return 'double';
  return 'blowup';
}
