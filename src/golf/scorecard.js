/**
 * The card.
 *
 * Strokes, penalties, and the handful of facts about a hole that somebody
 * would actually mention afterwards. Four players, up to three holes, and no
 * opinions — `scoreBand` in course.js decides what a number means, this only
 * decides what the number is.
 *
 * Lou is the one holding it in the fiction, which matters for one rule: a very
 * high score is written down as something less than the truth. That negotiation
 * is in the script, but the card has to be able to hold both numbers, so it
 * keeps `strokes` (what happened) and `written` (what went on the card).
 */

import {
  FOURSOME, TEE_ORDER, getHole, scoreName, scoreBand, relativeLabel, toFeet,
} from './course.js';

/** What Lou will admit to on a hole that got away from somebody. */
export const MERCY_CAP = 8;

function blankHole(holeNumber) {
  const hole = getHole(holeNumber);
  return {
    hole: holeNumber,
    par: hole ? hole.par : 3,
    strokes: 0,
    penalties: 0,
    finished: false,
    /* Set at the moment the ball comes to rest after the tee shot, which is
     * the only time "did he hit the green" has a meaning. */
    hitGreenInRegulation: false,
    foundWater: false,
    foundBunker: false,
    /* Best shot of the hole and how close he got. Stats a player is pleased
     * to be shown, and the only reason to record a distance at all. */
    longestShot: 0,
    closestApproach: Infinity,
  };
}

export class Scorecard {
  constructor() {
    this.players = new Map();
    for (const g of FOURSOME) {
      this.players.set(g.id, { id: g.id, card: g.card, name: g.name, holes: new Map() });
    }
  }

  hole(playerId, holeNumber) {
    const p = this.players.get(playerId);
    if (!p) return null;
    if (!p.holes.has(holeNumber)) p.holes.set(holeNumber, blankHole(holeNumber));
    return p.holes.get(holeNumber);
  }

  /** Restore one already-finished hole from the campaign's compact card. */
  restoreHole(playerId, entry = {}) {
    const p = this.players.get(playerId);
    const holeNumber = Number.isFinite(entry.hole) ? Math.round(entry.hole) : null;
    if (!p || !holeNumber || !getHole(holeNumber)) return null;
    const h = blankHole(holeNumber);
    h.par = Number.isFinite(entry.par) ? Math.max(1, Math.round(entry.par)) : h.par;
    h.strokes = Number.isFinite(entry.strokes) ? Math.max(1, Math.round(entry.strokes)) : 1;
    h.penalties = Number.isFinite(entry.penalties) ? Math.max(0, Math.round(entry.penalties)) : 0;
    h.finished = true;
    h.closestApproach = 0;
    p.holes.set(holeNumber, h);
    return h;
  }

  /** A stroke played. Every shot, including the one that goes in the water. */
  addStroke(playerId, holeNumber, { distance = 0, toPin = null } = {}) {
    const h = this.hole(playerId, holeNumber);
    if (!h || h.finished) return h;
    h.strokes++;
    if (distance > h.longestShot) h.longestShot = distance;
    if (toPin !== null && toPin < h.closestApproach) h.closestApproach = toPin;
    return h;
  }

  /** A penalty stroke. Counts toward the score as well as toward the total. */
  addPenalty(playerId, holeNumber, reason = 'water') {
    const h = this.hole(playerId, holeNumber);
    if (!h || h.finished) return h;
    h.strokes++;
    h.penalties++;
    if (reason === 'water') h.foundWater = true;
    return h;
  }

  markGreenInRegulation(playerId, holeNumber, onGreen) {
    const h = this.hole(playerId, holeNumber);
    if (h) h.hitGreenInRegulation = onGreen === true;
  }

  markBunker(playerId, holeNumber) {
    const h = this.hole(playerId, holeNumber);
    if (h) h.foundBunker = true;
  }

  finish(playerId, holeNumber) {
    const h = this.hole(playerId, holeNumber);
    if (!h || h.finished) return h;
    h.finished = true;
    if (h.closestApproach === Infinity) h.closestApproach = 0;
    return h;
  }

  finished(playerId, holeNumber) {
    return this.hole(playerId, holeNumber)?.finished === true;
  }

  /** Everybody who still has a ball in play on this hole. */
  stillPlaying(holeNumber) {
    return TEE_ORDER.filter((id) => !this.finished(id, holeNumber));
  }

  allFinished(holeNumber) {
    return this.stillPlaying(holeNumber).length === 0;
  }

  /**
   * What goes on the card, as opposed to what happened.
   *
   * "We are not putting all of that on the card." A blow-up is written down as
   * eight, and the real number is kept next to it because the group remembers
   * even when the card does not.
   */
  written(playerId, holeNumber) {
    const h = this.hole(playerId, holeNumber);
    if (!h) return 0;
    return Math.min(h.strokes, MERCY_CAP);
  }

  merciful(playerId, holeNumber) {
    const h = this.hole(playerId, holeNumber);
    return !!h && h.strokes > MERCY_CAP;
  }

  /** One player's line on the card, ready to render. */
  line(playerId) {
    const p = this.players.get(playerId);
    if (!p) return null;
    const holes = [...p.holes.values()].sort((a, b) => a.hole - b.hole);
    const strokes = holes.reduce((n, h) => n + h.strokes, 0);
    const par = holes.reduce((n, h) => n + h.par, 0);
    return {
      id: p.id,
      card: p.card,
      name: p.name,
      holes,
      strokes,
      penalties: holes.reduce((n, h) => n + h.penalties, 0),
      toPar: strokes - par,
      label: relativeLabel(strokes - par),
    };
  }

  /** The whole card, in playing order. */
  lines() {
    return TEE_ORDER.map((id) => this.line(id)).filter(Boolean);
  }

  /** How a finished hole reads, for the reaction the group has to it. */
  result(playerId, holeNumber) {
    const h = this.hole(playerId, holeNumber);
    if (!h) return null;
    return {
      strokes: h.strokes,
      par: h.par,
      penalties: h.penalties,
      name: scoreName(h.strokes, h.par),
      band: scoreBand(h.strokes, h.par),
      toPar: h.strokes - h.par,
      written: this.written(playerId, holeNumber),
      merciful: this.merciful(playerId, holeNumber),
      hitGreenInRegulation: h.hitGreenInRegulation,
      foundWater: h.foundWater,
      foundBunker: h.foundBunker,
      longestShotYards: h.longestShot,
      closestApproachFeet: h.closestApproach === Infinity ? 0 : toFeet(h.closestApproach),
    };
  }

  /** The payload the campaign keeps. Deliberately small. */
  persist(playerId = 'prospect') {
    const p = this.players.get(playerId);
    if (!p) return { holes: [] };
    const holes = [...p.holes.values()]
      .filter((h) => h.finished)
      .sort((a, b) => a.hole - b.hole);
    return {
      holes: holes.map((h) => ({
        hole: h.hole, par: h.par, strokes: h.strokes, penalties: h.penalties,
      })),
      ace: holes.some((h) => h.strokes === 1),
      foundWater: holes.some((h) => h.foundWater),
      hitGreenInRegulation: holes.some((h) => h.hitGreenInRegulation),
    };
  }
}
