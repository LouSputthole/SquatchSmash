import {
  EVENT_IDS,
  MISSION_IDS,
  NO_WAKE_CHECKPOINT_IDS,
  SCENE_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

/**
 * Where a NO WAKE run can be picked up again.
 *
 * `docs/NO-WAKE-REDESIGN.md` asks for "checkpoints after the inlet, after the
 * execution, and after the weights". The first two already existed as
 * `open_water` and `execution`; `weighted` is the third, and it matters because
 * everything between the shot and the ballast is a chain of authored holds — a
 * player who stops after clipping the iron on should not have to sit through
 * the confrontation again to get back to the carry.
 *
 * THE LIST LIVES IN `campaign.js`, not here. Persisted campaign state is
 * normalised against its own whitelist on every read, so a checkpoint this file
 * banks and that file does not recognise is written and then silently thrown
 * away. Adding `weighted` to one and not the other did exactly that, and the
 * only symptom was a checkpoint that read back as null.
 */
const CHECKPOINTS = NO_WAKE_CHECKPOINT_IDS;

/** Campaign boundary for NO WAKE. Runtime detail stays in the scene. */
class NoWakeStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  /** Read-only eligibility check used before the player commits on Start. */
  canBegin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.NO_WAKE];
    if (mission.status === 'in_progress') return { ok: true, resumed: true };
    if (mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (state.missions[MISSION_IDS.JERKY_MOTEL].status !== 'complete') {
      return { ok: false, reason: 'motel_incomplete' };
    }
    /* BEAT 18 IS THE MORNING AFTER THE STAYOVER. The bible's entry trigger is
     * "family call after Margo leaves", which means the date has to have
     * happened -- and under the reorder it has, three beats earlier. A save
     * that reaches this dock without the Silver Room behind it is a save that
     * skipped the whole of Moving Up. */
    if (state.missions[MISSION_IDS.SILVER_ROOM].status !== 'complete') {
      return { ok: false, reason: 'silver_incomplete' };
    }
    if (state.events[EVENT_IDS.LOU_NO_WAKE_CALL].status !== 'answered') {
      return { ok: false, reason: 'lou_call_incomplete' };
    }
    if (mission.status !== 'available') return { ok: false, reason: 'mission_locked' };

    return { ok: true, resumed: false };
  }

  begin() {
    const eligibility = this.canBegin();
    if (!eligibility.ok || eligibility.resumed) return eligibility;

    this.campaign.update((next) => {
      next.missions[MISSION_IDS.NO_WAKE].status = 'in_progress';
      next.missions[MISSION_IDS.NO_WAKE].checkpoint ??= 'dock';
    });
    return eligibility;
  }

  checkpoint(value) {
    if (!CHECKPOINTS.includes(value)) return false;
    const current = this.campaign.state.missions[MISSION_IDS.NO_WAKE];
    if (current.status !== 'in_progress') return false;
    const oldIndex = CHECKPOINTS.indexOf(current.checkpoint);
    const newIndex = CHECKPOINTS.indexOf(value);
    if (oldIndex >= newIndex) return false;
    this.campaign.update((state) => {
      state.missions[MISSION_IDS.NO_WAKE].checkpoint = value;
    });
    return true;
  }

  complete(report = {}) {
    const current = this.campaign.state.missions[MISSION_IDS.NO_WAKE];
    if (current.status !== 'in_progress'
      || report.betrayalConfirmed !== true
      || report.playerFired !== true
      || report.bodyDisposed !== true) return false;

    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_NO_WAKE, (state) => {
      const mission = state.missions[MISSION_IDS.NO_WAKE];
      mission.status = 'complete';
      mission.checkpoint = 'returned';
      mission.betrayalConfirmed = true;
      mission.playerFired = true;
      mission.bodyDisposed = true;
      /* Same calendar day. Returning from the dock opens beat 19 -- a quiet
       * evening in the luxury apartment and then a call about a case.
       *
       * It used to set `date`, because the harbour job came BEFORE Front &
       * Center in the built order and the drive home was what put Margo's
       * afternoon call on the phone. The bible has that the other way round,
       * so the chapter this hands control to is the flat he now lives in. */
      state.story.chapter = 'luxury_apartment';
      state.scene = { id: SCENE_IDS.NO_WAKE, spawn: 'gate_c' };
    });
    return true;
  }
}

export function createNoWakeStory(options) {
  return new NoWakeStory(options);
}
