import {
  EVENT_IDS,
  MISSION_IDS,
} from './campaign.js';

class BadaBingTwoStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.BADA_BING_TWO];
    if (mission.status === 'in_progress') return { ok: true, resumed: true };
    if (mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (state.missions[MISSION_IDS.AIRSTRIP_SMUGGLING].status !== 'complete') {
      return { ok: false, reason: 'airstrip_incomplete' };
    }
    if (state.events[EVENT_IDS.LOU_SECOND_CALL].status !== 'answered') {
      return { ok: false, reason: 'lou_call_incomplete' };
    }
    if (mission.status !== 'available') return { ok: false, reason: 'mission_locked' };

    this.campaign.update((next) => {
      next.missions[MISSION_IDS.BADA_BING_TWO].status = 'in_progress';
    });
    return { ok: true, resumed: false };
  }

  complete({ assignment } = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.BADA_BING_TWO];
    if (mission.status !== 'in_progress' || typeof assignment !== 'string') return false;
    this.campaign.update((state) => {
      const completed = state.missions[MISSION_IDS.BADA_BING_TWO];
      completed.status = 'complete';
      completed.assignment = assignment;
      state.missions[MISSION_IDS.JERKY_MOTEL].status = 'available';
    });
    return true;
  }
}

export function createBadaBingTwoStory(options) {
  return new BadaBingTwoStory(options);
}
