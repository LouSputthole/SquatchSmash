import {
  ITEM_IDS,
  MISSION_IDS,
  SCENE_IDS,
  SILENT_SQUATCH_CHECKPOINT_IDS,
  SILENT_SQUATCH_RESPECT,
  TIME_EVENT_IDS,
} from './campaign.js';

/**
 * The campaign boundary for PROJECT SILENT SQUATCH.
 *
 * Same narrow seam as `silver-story.js` and `golf-story.js`: the mission keeps
 * a large record of the night while it is running — every objective, every
 * keypad attempt, which of the six went down in what order — and almost none
 * of that is a thing a later scene could reasonably know. What survives is
 * what he did with his own hands, how many people were in the room, and the
 * four things the house owes him afterwards:
 *
 *   > mansion basement access unlocked · Family respect up · Aubbie's lab
 *   > notes on the apartment computer · Silent Squatch added to the campaign
 *   > conspiracy board · a new apartment trophy, a miniature glowing
 *   > Squatchanium container.
 *
 * THE CASE IS THE SAME CASE. The mission follows The Silver Case and reuses
 * its case, so `ITEM_IDS.SILVER_CASE` is carried in and handed over rather
 * than spawned on Lou's desk. The final-campaign route carries it forward from
 * `silvercase.html`; direct developer loads still receive the case here so the
 * standalone mansion scene remains playable. `begin()` reports `carriedIn`
 * honestly in both paths.
 */

class SilentSquatchStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  get mission() {
    return this.campaign.state.missions[MISSION_IDS.SILENT_SQUATCH];
  }

  /**
   * Start the night.
   *
   * `{ ok: true, resumed, unrouted, carriedIn }` on entry;
   * `{ ok: false, reason }` when the save says it is already over. `unrouted`
   * means the page was opened without a campaign transition into it, as with a
   * standalone developer load.
   */
  begin() {
    const state = this.campaign.state;
    const status = this.mission.status;
    if (status === 'complete') return { ok: false, reason: 'already_complete' };

    const unrouted = state.scene.id !== SCENE_IDS.MANSION;
    const carriedIn = this.campaign.hasItem(ITEM_IDS.SILVER_CASE);
    if (status === 'in_progress') {
      return {
        ok: true, resumed: true, unrouted, carriedIn,
        checkpoint: this.mission.checkpoint,
      };
    }

    /* He arrives with it. A direct developer load that never ran The Silver
     * Case receives it here rather than starting with empty hands and a beat
     * that cannot be played. */
    if (!carriedIn) this.campaign.addItem(ITEM_IDS.SILVER_CASE);
    this.campaign.advanceTime(TIME_EVENT_IDS.DEPART_MANSION, (next) => {
      next.missions[MISSION_IDS.SILENT_SQUATCH].status = 'in_progress';
    });
    return {
      ok: true, resumed: false, unrouted, carriedIn,
    };
  }

  /** Mark a beat as reached, so a reload comes back to the right part of the
   * night rather than to the front gate. */
  checkpoint(id, facts = {}) {
    if (!SILENT_SQUATCH_CHECKPOINT_IDS.includes(id)) return false;
    if (this.mission.status !== 'in_progress') return false;
    const reached = SILENT_SQUATCH_CHECKPOINT_IDS.indexOf(id);
    const current = SILENT_SQUATCH_CHECKPOINT_IDS.indexOf(this.mission.checkpoint);
    this.campaign.update((state) => {
      const night = state.missions[MISSION_IDS.SILENT_SQUATCH];
      /* Never backwards: a replayed beat must not un-say what has already
       * happened further down the stairs. */
      if (reached > current) night.checkpoint = id;
      if (id === 'office') night.casePlaced = true;
      if (id === 'basement') night.basementUnlocked = true;
      if (id === 'lab') {
        night.caseDelivered = true;
        /* The case is out of his hands for good the moment it goes through
         * the transfer drawer. */
        state.inventory.carried = state.inventory.carried
          .filter((item) => item !== ITEM_IDS.SILVER_CASE);
        state.inventory.concealed = state.inventory.concealed
          .filter((item) => item !== ITEM_IDS.SILVER_CASE);
      }
      if (id === 'locked') night.labLocked = true;
      if (id === 'aubbie_down') night.aubbieEliminated = true;
      if (id === 'silent_night') night.silentNightActivated = true;
      if (Number.isFinite(facts.scientistsLost)) {
        night.scientistsLost = Math.max(night.scientistsLost, facts.scientistsLost);
      }
    });
    return true;
  }

  /**
   * The wall closes behind him.
   *
   * `report` is the mission's own `report()` payload verbatim, so the mission
   * never has to know the campaign's field names. Every reward is written from
   * what the report actually says rather than from the fact that the credits
   * rolled: a mission that somehow ended with the lab unlocked does not award
   * the basement, and the trophy is a real item in his flat rather than a
   * boolean nobody can pick up.
   */
  complete(report = {}) {
    if (this.mission.status !== 'in_progress') return false;

    const aubbie = report.aubbie ?? {};
    const lost = 1 + (Array.isArray(report.collapsed) ? report.collapsed.length : 0);
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SILENT_SQUATCH, (state) => {
      const night = state.missions[MISSION_IDS.SILENT_SQUATCH];
      night.status = 'complete';
      night.checkpoint = 'clear';
      night.casePlaced = night.casePlaced || report.case?.placedOnDesk === true;
      night.caseDelivered = night.caseDelivered || report.case?.delivered === true;
      night.labLocked = night.labLocked || report.keypad?.locked === true;
      night.aubbieEliminated = night.aubbieEliminated || aubbie.killed === true;
      night.silentNightActivated = night.silentNightActivated
        || report.gasStages?.length > 0;
      night.scientistsLost = Math.min(6, Math.max(night.scientistsLost, lost));

      /* The four rewards. */
      night.basementUnlocked = true;
      night.notesRecovered = true;
      night.conspiracyBoard = true;
      night.trophyAwarded = true;
      night.eveningReady = true;
      state.story.chapter = 'mansion_evening';

      state.story.familyRespect = Math.min(
        100, state.story.familyRespect + SILENT_SQUATCH_RESPECT,
      );

      /* The case never comes home. The trophy does. */
      state.inventory.carried = state.inventory.carried
        .filter((item) => item !== ITEM_IDS.SILVER_CASE);
      state.inventory.concealed = state.inventory.concealed
        .filter((item) => item !== ITEM_IDS.SILVER_CASE);
      if (!state.inventory.carried.includes(ITEM_IDS.SQUATCHANIUM_MINIATURE)) {
        state.inventory.carried.push(ITEM_IDS.SQUATCHANIUM_MINIATURE);
      }
    });
    return true;
  }

  /**
   * The quiet mansion evening ends at the guest-room bed. Sleeping is the
   * deliberate load seam between the canonical house and its siege overlay;
   * it unlocks the attack but does not navigate while the current page is
   * still fading out.
   */
  restAtMansion() {
    const night = this.mission;
    if (night.status !== 'complete') return { ok: false, reason: 'mission_incomplete' };
    if (!night.eveningReady) return { ok: false, reason: 'evening_incomplete' };
    if (night.sleptAtMansion) return { ok: false, reason: 'already_rested' };

    this.campaign.advanceTime(TIME_EVENT_IDS.REST_AT_MANSION, (state) => {
      const saved = state.missions[MISSION_IDS.SILENT_SQUATCH];
      saved.sleptAtMansion = true;
      state.story.chapter = 'mansion_siege';
      state.missions[MISSION_IDS.MANSION_SIEGE].status = 'available';
    }, { required: true });
    return { ok: true, chapter: 'mansion_siege' };
  }
}

export function createSilentSquatchStory(options) {
  return new SilentSquatchStory(options);
}
