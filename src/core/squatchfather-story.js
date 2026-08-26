import {
  ITEM_IDS,
  MISSION_IDS,
  TIME_EVENT_IDS,
} from './campaign.js';

class SquatchfatherStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.SQUATCHFATHER];
    if (mission.status === 'in_progress' && mission.weaponStaged) {
      return { ok: true, resumed: true };
    }
    if (mission.status === 'complete') {
      return { ok: false, reason: 'already_complete' };
    }
    if (state.missions[MISSION_IDS.BADA_BING_ONE].status !== 'complete') {
      return { ok: false, reason: 'bada_bing_incomplete' };
    }
    if (!this.campaign.hasItem(ITEM_IDS.LOU_PACKAGE)) {
      return { ok: false, reason: 'missing_package' };
    }
    if (mission.status !== 'available') {
      return { ok: false, reason: 'mission_locked' };
    }

    this.campaign.update((next) => {
      next.inventory.carried = next.inventory.carried
        .filter((itemId) => itemId !== ITEM_IDS.LOU_PACKAGE);
      next.inventory.concealed = next.inventory.concealed
        .filter((itemId) => itemId !== ITEM_IDS.LOU_PACKAGE);
      const active = next.missions[MISSION_IDS.SQUATCHFATHER];
      active.status = 'in_progress';
      active.weaponStaged = true;
      active.weaponDropped = false;
    });
    return { ok: true, resumed: false };
  }

  /**
   * THE RESTAURANT STAMPS ITS OWN HOUR NOW.
   *
   * `COMPLETE_SQUATCHFATHER` -- Day 2, 03:00 -- used to be applied by the
   * APARTMENT, on arrival, because the driver brought him home. Under the
   * spine the driver takes him out of town instead, and the flat does not see
   * him again for three days: the clock that says when the job ended had
   * nobody left to apply it.
   *
   * A mission's own completion is the honest place for its own hour. It is
   * exact-once by id, so a save that already banked it on the old route is
   * unaffected, and every caller -- the page, the scene-skip adapter, the
   * marathon -- gets it without having to remember.
   */
  complete() {
    const mission = this.campaign.state.missions[MISSION_IDS.SQUATCHFATHER];
    if (mission.status !== 'in_progress' || !mission.weaponStaged) return false;
    this.campaign.advanceTime(TIME_EVENT_IDS.COMPLETE_SQUATCHFATHER, (state) => {
      const completed = state.missions[MISSION_IDS.SQUATCHFATHER];
      completed.status = 'complete';
      completed.weaponDropped = true;
    });
    return true;
  }
}

export function createSquatchfatherStory(options) {
  return new SquatchfatherStory(options);
}
