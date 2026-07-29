import { MISSION_IDS } from './campaign.js';

class MotelStory {
  constructor({ campaign }) {
    this.campaign = campaign;
  }

  begin() {
    const state = this.campaign.state;
    const mission = state.missions[MISSION_IDS.JERKY_MOTEL];
    if (mission.status === 'in_progress') return { ok: true, resumed: true };
    if (mission.status === 'complete') return { ok: false, reason: 'already_complete' };
    if (state.missions[MISSION_IDS.BADA_BING_TWO].status !== 'complete') {
      return { ok: false, reason: 'bing_second_incomplete' };
    }
    if (mission.status !== 'available') return { ok: false, reason: 'mission_locked' };
    this.campaign.update((next) => {
      next.missions[MISSION_IDS.JERKY_MOTEL].status = 'in_progress';
    });
    return { ok: true, resumed: false };
  }

  complete({
    ending,
    cargoRecovered = false,
    packagesIntact = 0,
    freshness = 0,
    policeHeat = 0,
  } = {}) {
    const mission = this.campaign.state.missions[MISSION_IDS.JERKY_MOTEL];
    if (mission.status !== 'in_progress' || ending !== 'home') return false;
    this.campaign.update((state) => {
      const completed = state.missions[MISSION_IDS.JERKY_MOTEL];
      completed.status = 'complete';
      completed.ending = ending;
      completed.cargoRecovered = cargoRecovered === true;
      completed.packagesIntact = packagesIntact;
      completed.freshness = freshness;
      completed.policeHeat = policeHeat;
    });
    return true;
  }
}

export function createMotelStory(options) {
  return new MotelStory(options);
}
