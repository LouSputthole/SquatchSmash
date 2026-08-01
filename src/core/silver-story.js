import {
  EVENT_IDS,
  MISSION_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

/**
 * The campaign boundary for the Silver Room.
 *
 * The mission itself keeps a large, detailed record of the evening while it is
 * running — every tip, every latch, the Woo ledger, which rounds of
 * conversation were had. None of that belongs in the campaign save. This class
 * is the narrow seam: it decides whether the date can start at all, and it
 * folds the mission's own `persist()` payload down to the handful of facts a
 * later scene could reasonably know about a night it did not watch.
 *
 * Before integration the mission wrote that payload to a private
 * `squatch.frontAndCenter` localStorage key, which no other scene read and
 * nothing migrated. The payload shape is unchanged; only its destination is.
 */

const OUTCOMES = Object.freeze([
  'perfect', 'strong', 'good', 'gentleman', 'awkward', 'insult', 'disaster',
]);

class SilverStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  /**
   * Can he go in? The date is gated on the Motel being finished and on her
   * having actually rung — the same two things the apartment door checks, so
   * that opening `silver.html` directly cannot skip the chapter.
   */
  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.SILVER_ROOM];
    if (mission.status === 'in_progress') {
      return { ok: true, resumed: true };
    }
    if (mission.status === 'complete') {
      return { ok: false, reason: 'already_complete' };
    }
    if (state.missions[MISSION_IDS.JERKY_MOTEL].status !== 'complete') {
      return { ok: false, reason: 'motel_incomplete' };
    }
    if (state.missions[MISSION_IDS.NO_WAKE].status !== 'complete') {
      return { ok: false, reason: 'no_wake_incomplete' };
    }
    if (state.events[EVENT_IDS.MARGO_DATE_CALL].status !== 'answered') {
      return { ok: false, reason: 'margo_call_incomplete' };
    }
    if (mission.status !== 'available') {
      return { ok: false, reason: 'mission_locked' };
    }

    this.campaign.update((next) => {
      next.missions[MISSION_IDS.SILVER_ROOM].status = 'in_progress';
    });
    return { ok: true, resumed: false };
  }

  /**
   * The evening is over and she has said yes or she has not.
   *
   * `report` is the mission's `persist()` payload verbatim, so the mission does
   * not have to know the campaign's field names. Anything missing degrades to
   * the neutral value rather than throwing: an ending card must never be the
   * thing that loses a save.
   */
  complete(report = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.SILVER_ROOM];
    if (mission.status !== 'in_progress') return false;

    const outcome = OUTCOMES.includes(report.outcome) ? report.outcome : 'awkward';
    this.campaign.update((state) => {
      const done = state.missions[MISSION_IDS.SILVER_ROOM];
      done.status = 'complete';
      done.outcome = outcome;
      done.woo = Number.isFinite(report.woo) ? Math.round(report.woo) : 0;
      done.band = typeof report.band === 'string' ? report.band : null;
      /* `tippedEverybody` is the mission's full-roster streak. The campaign
       * accepts either the persist() name or the plainer one a caller might
       * reach for, because both have been written by hand at some point. */
      done.tippedEverybody = (report.tippedEverybody ?? report.tipped) === true;
      done.rememberedDrink = report.rememberedDrink === true;
      /* `seeingHerAgain` is the narrower of the mission's two claims and the
       * one the apartment announces on the way in. Do NOT fall back to
       * `date.available`, which only means she is still a usable character —
       * they disagree on an `awkward` evening, and conflating them has the
       * front door congratulating him on a night that did not go well. */
      done.seeingHerAgain = report.seeingHerAgain === true;
      done.knowsWhatHeDoes = report.date?.knowsWhatHeDoes === true;
    });
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SILVER_ROOM);
    return true;
  }
}

export function createSilverStory(options) {
  return new SilverStory(options);
}
