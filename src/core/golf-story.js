import {
  EVENT_IDS,
  MISSION_IDS,
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
 * The round is gated the way every other mission is: the Silver Room has to be
 * finished and Lou has to have actually rung. Opening `golf.html` directly
 * still starts a round rather than refusing — the scene stays playable
 * standalone and in preview — but it reports `unrouted`, so the difference
 * between "he was invited" and "somebody opened the page" is never guessed at.
 */

class GolfStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.SILVER_PINES];
  }

  /**
   * Tee off. Returns `{ ok, resumed, unrouted }`.
   *
   * `unrouted` is true when the round was opened without the campaign having
   * offered it — the honest state today. It is reported rather than refused so
   * the scene stays playable, and so the flag is there to assert on once the
   * front door does offer it.
   */
  begin() {
    const state = this.campaign.state;
    const status = this.mission.status;
    if (status === 'in_progress') return { ok: true, resumed: true, unrouted: false };
    if (status === 'complete') return { ok: false, reason: 'already_complete' };

    /* Unrouted means the campaign never offered this: the Silver Room is not
     * finished, or Lou never rang, or both. The round runs anyway and says so
     * rather than presenting itself as a morning he earned. */
    const unrouted = status === 'locked'
      || state.missions[MISSION_IDS.SILVER_ROOM].status !== 'complete'
      || state.events[EVENT_IDS.LOU_GOLF_CALL].status !== 'answered';
    /* Claiming the mission, and nothing else. The drive out is the door's
     * time to spend — `travel.silver_pines` is applied by the apartment when
     * he leaves, the way every other departure is, so opening this page
     * directly cannot move the campaign clock. */
    this.campaign.update((next) => {
      next.missions[MISSION_IDS.SILVER_PINES].status = 'in_progress';
    });
    return { ok: true, resumed: false, unrouted };
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
   * Only a complete round completes the mission. The Hole 1 vertical slice
   * ends on a development end card and deliberately leaves the mission
   * `in_progress`, because a man who has played one hole has not played golf
   * with Lou — he has been driven to a tee.
   */
  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;
    if (Array.isArray(report.holes)) {
      for (const card of report.holes) this.recordHole(card);
    }
    if (this.mission.holesPlayed < 3) return false;

    this.campaign.update((state) => {
      state.missions[MISSION_IDS.SILVER_PINES].status = 'complete';
    });
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SILVER_PINES);
    return true;
  }
}

export function createGolfStory(options) {
  return new GolfStory(options);
}
