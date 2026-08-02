import {
  EVENT_IDS,
  MISSION_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

/**
 * The campaign boundary for the morning at Silver Pines.
 *
 * Same narrow seam as `silver-story.js`. The round keeps a large record while
 * it is being played — every stroke, every lie, which conversations were had
 * on which tee — and almost none of that is a thing a later scene could
 * reasonably know. What survives is the card and the two facts that were never
 * about golf: whether he was there when Lou said why he was invited, and
 * whether he took the ride out instead of walking on his own.
 *
 * The round is gated the way every other mission is: the Silver Room must be
 * finished, Day 4 must be in its golf chapter, and Lou's call must have exposed
 * the mission. Preview seeds those same prerequisites; a production direct
 * load cannot invent campaign progress.
 */

class GolfStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.SILVER_PINES];
  }

  /**
   * Tee off. Successful entry returns `{ ok, resumed, unrouted: false }`;
   * unauthorized entry returns a stable reason without mutating the save.
   */
  begin() {
    const state = this.campaign.state;
    const status = this.mission.status;
    if (status === 'complete') return { ok: false, reason: 'already_complete' };
    if (state.missions[MISSION_IDS.SILVER_ROOM].status !== 'complete') {
      return { ok: false, reason: 'silver_incomplete' };
    }
    if (state.story.chapter !== 'golf_morning') {
      return { ok: false, reason: 'wrong_chapter' };
    }
    if (state.events[EVENT_IDS.LOU_GOLF_CALL].status !== 'answered') {
      return { ok: false, reason: 'lou_call_incomplete' };
    }
    /* An invitation is not a departure. The apartment applies the travel
     * marker and then transitions the save to Silver Pines before the page
     * loads. Requiring both halves keeps an otherwise-authorized bare URL
     * from claiming the round, while a reload of a legitimately-started
     * round still has both facts and can resume. */
    if (!state.story.timeEvents.includes(TIME_EVENT_IDS.DEPART_SILVER_PINES)) {
      return { ok: false, reason: 'travel_incomplete' };
    }
    if (state.scene.id !== SCENE_IDS.SILVER_PINES) {
      return { ok: false, reason: 'wrong_scene' };
    }
    if (status === 'in_progress') return { ok: true, resumed: true, unrouted: false };
    if (status !== 'available') return { ok: false, reason: 'mission_locked' };
    /* Claiming the mission, and nothing else. The drive out is the door's
     * time to spend — `travel.silver_pines` is applied by the apartment when
     * he leaves, the way every other departure is, so opening this page
     * directly cannot move the campaign clock. */
    this.campaign.update((next) => {
      next.missions[MISSION_IDS.SILVER_PINES].status = 'in_progress';
    });
    return { ok: true, resumed: false, unrouted: false };
  }

  /**
   * Record one finished hole.
   *
   * Called at every hole-out, not only at the end of the round, so a player
   * who closes the tab after Hole 1 still has a card. Re-recording the same
   * hole replaces it rather than appending — restarting a hole must not make
   * the round longer than three holes.
   */
  recordHole(card = {}) {
    const hole = Number.isFinite(card.hole) ? Math.round(card.hole) : null;
    if (!hole || hole < 1 || hole > 3) return false;
    if (this.mission.status !== 'in_progress') return false;

    const entry = {
      hole,
      par: Number.isFinite(card.par) ? Math.round(card.par) : 3,
      strokes: Number.isFinite(card.strokes) ? Math.max(1, Math.round(card.strokes)) : 1,
      penalties: Number.isFinite(card.penalties) ? Math.max(0, Math.round(card.penalties)) : 0,
    };

    this.campaign.update((state) => {
      const m = state.missions[MISSION_IDS.SILVER_PINES];
      const holes = m.holes.filter((h) => h.hole !== hole);
      holes.push(entry);
      holes.sort((a, b) => a.hole - b.hole);
      m.holes = holes;
      m.holesPlayed = holes.length;
      m.strokes = holes.reduce((n, h) => n + h.strokes, 0);
      m.penalties = holes.reduce((n, h) => n + h.penalties, 0);
      m.toPar = holes.reduce((n, h) => n + (h.strokes - h.par), 0);

      /* Sticky across the round: an ace on Hole 1 is still an ace after a
       * triple on Hole 3, and a ball in the water is still a ball in the
       * water. These are the things somebody would bring up later. */
      if (entry.strokes === 1) m.ace = true;
      if (card.foundWater === true) m.foundWater = true;
      if (card.hitGreenInRegulation === true) m.hitGreenInRegulation = true;
      if (card.heardInvitation === true) m.heardInvitation = true;
      if (card.rodeWithLou === true) m.rodeWithLou = true;
    });
    return true;
  }

  /**
   * The round is over.
   *
   * Only a complete three-hole round completes the mission. A partial card
   * remains `in_progress`, because a man who played one hole has not finished
   * the morning with Lou.
   */
  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    if (Array.isArray(report.holes)) {
      for (const card of report.holes) this.recordHole(card);
    }
    if (this.mission.holesPlayed < 3) return false;

    const completion = this.campaign.advanceTime(
      TIME_EVENT_IDS.COMPLETE_SILVER_PINES,
      (state) => {
        state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
        state.story.chapter = 'heist_day';
      },
      { required: true },
    );
    if (!completion.applied) {
      this.campaign.updateRequired((state) => {
        state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
        state.story.chapter = 'heist_day';
      });
    }
    return true;
  }
}

export function createGolfStory(options) {
  return new GolfStory(options);
}
